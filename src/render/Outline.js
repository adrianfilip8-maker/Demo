import * as THREE from 'three';
import { OUTLINE_VERT, OUTLINE_FRAG } from './shaders/toon.glsl.js';

/**
 * Outline.js — inverted-hull ink shells.
 *
 * The two things that make or break an inverted hull, and how they are solved here:
 *
 * 1. **Screen-constant thickness.** Handled in the vertex shader (see toon.glsl.js): the hull
 *    is expanded in *clip* space by an exact pixel count, so a line is ~2.5 px whether Sly is
 *    two metres from the lens or two hundred. Extruding a fixed number of metres — the usual
 *    shortcut — gives slab-thick lines in a close-up and nothing at all in a wide shot.
 *
 * 2. **Cracks at hard edges.** Every piece of architecture in this game has split normals
 *    (that is what makes a chiselled edge chiselled). Extruding along split normals tears the
 *    hull open at every seam, and you get a shell that leaks daylight along each corner.
 *    Fixed by welding: coincident positions are grouped with a spatial hash, their normals
 *    averaged, and the average written to a *separate* `slyNormal` attribute. The base
 *    geometry's own `normal` attribute is untouched, so the surface keeps its hard edges
 *    while the shell gets a continuous, closed field to extrude along.
 *
 * The welded attribute is added to the source geometry in place rather than to a clone: hero
 * props and characters share geometry with their shells, so this costs one extra vec3 stream
 * instead of a full duplicate of positions, uvs, skin indices and skin weights.
 */

const WELD_ATTR = 'slyNormal';
const INK_ATTR = 'slyInk';

/* Positions are quantised to this grid before hashing. 0.1 mm is far below any authored
   feature size here and far above float32 noise from geometry merges. */
const WELD_EPS = 1e-4;

/* Hash constants — the standard triple of large primes for 3D spatial hashing. */
const HX = 73856093, HY = 19349663, HZ = 83492791;

/**
 * Group coincident vertices, average their normals, and stash the result as `slyNormal`.
 * Idempotent: safe to call on the same geometry from a dozen meshes.
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {boolean} force  rebuild even if the attribute already exists
 * @returns {boolean} whether the geometry now carries a usable welded normal
 */
export function weldNormals(geometry, force = false) {
  if (!geometry || !geometry.isBufferGeometry) return false;
  if (!force && geometry.getAttribute(WELD_ATTR)) return true;

  const pos = geometry.getAttribute('position');
  if (!pos) return false;

  if (!geometry.getAttribute('normal')) {
    // Nothing to average; three's own smoothing is a reasonable seed.
    geometry.computeVertexNormals();
  }
  const nrm = geometry.getAttribute('normal');
  if (!nrm) return false;

  const n = pos.count;
  const inv = 1 / WELD_EPS;

  // Quantised integer coordinates, kept so bucket members can be compared exactly.
  const qx = new Int32Array(n);
  const qy = new Int32Array(n);
  const qz = new Int32Array(n);

  // Classic linked-list spatial hash: one Map entry per bucket, no per-bucket arrays.
  const head = new Map();
  const next = new Int32Array(n).fill(-1);
  const hash = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    const ix = Math.round(pos.getX(i) * inv);
    const iy = Math.round(pos.getY(i) * inv);
    const iz = Math.round(pos.getZ(i) * inv);
    qx[i] = ix; qy[i] = iy; qz[i] = iz;
    const h = (Math.imul(ix, HX) ^ Math.imul(iy, HY) ^ Math.imul(iz, HZ)) | 0;
    hash[i] = h;
    const prev = head.get(h);
    next[i] = prev === undefined ? -1 : prev;
    head.set(h, i);
  }

  // rep[i] = index of the group leader for vertex i.
  const rep = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (rep[i] !== -1) continue;
    const ix = qx[i], iy = qy[i], iz = qz[i];
    let j = head.get(hash[i]);
    while (j !== -1) {
      if (rep[j] === -1 && qx[j] === ix && qy[j] === iy && qz[j] === iz) rep[j] = i;
      j = next[j];
    }
    rep[i] = i;
  }

  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  const sz = new Float32Array(n);
  const cnt = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    const r = rep[i];
    sx[r] += nrm.getX(i); sy[r] += nrm.getY(i); sz[r] += nrm.getZ(i);
    cnt[r]++;
  }

  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rep[i];
    let x = sx[r], y = sy[r], z = sz[r];
    let len = Math.sqrt(x * x + y * y + z * z);
    // Degenerate group: coincident faces pointing opposite ways (a zero-thickness banner,
    // a box with an interior wall). Averaging cancels, so keep the vertex's own normal.
    if (len < 0.18 * Math.max(cnt[r], 1)) {
      x = nrm.getX(i); y = nrm.getY(i); z = nrm.getZ(i);
      len = Math.sqrt(x * x + y * y + z * z) || 1;
    }
    const k = 1 / (len || 1);
    out[i * 3] = x * k; out[i * 3 + 1] = y * k; out[i * 3 + 2] = z * k;
  }

  geometry.setAttribute(WELD_ATTR, new THREE.BufferAttribute(out, 3));
  geometry.userData.slyWelded = true;
  return true;
}

/**
 * Write the per-vertex `slyInk` weight the outline shader multiplies its thickness by.
 *
 * **Why this exists.** A mesh with a material ARRAY has real `geometry.groups`, and every one
 * of those materials already carries its own ink weight — `toon()` accepts `outline:`
 * (ToonMaterial.js:949) and stores it (`:1064`), and `outlineAll()` already honours it
 * (`:1215`) for props. But `outlineAll()` reads `material[0]` only, and the shell built here
 * takes a *single* material, which three renders as one draw over the whole geometry. So for
 * the one mesh in the game built from eight material groups — Sly — every group's authored
 * weight was being discarded. This attribute is how it reaches the shader, at the cost of one
 * float stream and **zero extra draw calls**; handing the shell a material array instead would
 * cost one draw per group.
 *
 * **Always called, always complete.** An attribute declared in the shader but not present on
 * the geometry does not read 1.0 — it reads the generic vertex attribute, i.e. **0.0**, which
 * would collapse every ink line in the game to nothing. So this fills 1.0 for meshes with no
 * groups, no material array, or no declared weights, and `buildOutlineShell` calls it for
 * every shell it creates. There is no path to a shelled geometry that skips it.
 *
 * **Shared geometry caveat, stated because `weldNormals` has the same shape and it is benign
 * there and is not benign here.** A welded normal is a property of the *geometry*, so two
 * meshes sharing one geometry agree about it. An ink weight is a property of the *mesh's
 * materials*, so two meshes sharing a geometry with different weights would fight, last
 * writer winning. `geometry.userData.slyInkSig` records which material signature produced the
 * current buffer so the condition is detectable rather than silent; nothing in the shipped
 * level does this (Sly is one mesh, architecture caches one material per key).
 *
 * @param {THREE.Mesh} mesh   the host mesh, NOT the shell — weights come off its materials
 * @param {boolean} force     rewrite even if the signature is unchanged
 * @returns {boolean} whether the geometry now carries a usable weight stream
 */
export function applyInkWeights(mesh, force = false) {
  if (!mesh || !mesh.isMesh) return false;
  const geo = mesh.geometry;
  if (!geo || !geo.isBufferGeometry) return false;
  const pos = geo.getAttribute('position');
  if (!pos) return false;

  const n = pos.count;
  const mats = Array.isArray(mesh.material) ? mesh.material : null;
  const groups = geo.groups;
  const weightOf = (i) => {
    const w = mats?.[i]?.userData?.outline;
    return Number.isFinite(w) ? Math.max(0, w) : 1;
  };

  let attr = geo.getAttribute(INK_ATTR);
  if (!attr || attr.count !== n) {
    attr = new THREE.BufferAttribute(new Float32Array(n), 1);
    geo.setAttribute(INK_ATTR, attr);
    force = true;                     // a fresh buffer is all zeros; it MUST be filled
  }

  const usable = mats && groups && groups.length > 0;
  // The signature is the whole input: which ranges, and what weight each one asks for.
  const sig = usable
    ? groups.map((g) => `${g.start}:${g.count}:${weightOf(g.materialIndex)}`).join('|')
    : 'uniform';
  if (!force && geo.userData.slyInkSig === sig) return true;
  geo.userData.slyInkSig = sig;

  const arr = attr.array;
  arr.fill(1);
  if (usable) {
    /* Groups index the INDEX buffer when the geometry is indexed, and vertices when it is
       not — getting this backwards writes weights to unrelated vertices and still renders. */
    const index = geo.index;
    const seen = new Uint8Array(n);
    for (const g of groups) {
      const w = weightOf(g.materialIndex);
      const end = Math.min(g.start + g.count, index ? index.count : n);
      for (let i = g.start; i < end; i++) {
        const v = index ? index.getX(i) : i;
        if (v < 0 || v >= n) continue;
        /* A vertex claimed by two groups takes the LARGEST weight, so a shared seam can only
           ever keep a line, never silently thin one that another group asked to keep. Merged
           geometry makes groups vertex-disjoint, so in practice this is a safety net. */
        arr[v] = seen[v] ? Math.max(arr[v], w) : w;
        seen[v] = 1;
      }
    }
  }
  attr.needsUpdate = true;
  return true;
}

/**
 * The shell material. One per (thickness, colour) pair — the caller caches them, because a
 * program switch per prop would eat the draw-call budget for nothing.
 *
 * @param {object} shared        shared uniform objects owned by Shading (light + atmosphere)
 * @param {object} opts
 */
export function createOutlineMaterial(shared, {
  thickness = 2.5,
  inkSun = 0x1a1210,
  inkShade = 0x161022,
  gain = 1.0,
  opacity = 1.0,
  depthPush = 0.0022,
  falloff = 140,
} = {}) {
  const uniforms = {
    uThickness: { value: thickness },
    uDepthPush: { value: depthPush },
    uFalloff: { value: falloff },
    uInkSun: { value: new THREE.Color(inkSun) },
    uInkShade: { value: new THREE.Color(inkShade) },
    uInkOpacity: { value: opacity },
    uInkGain: { value: gain },
    ...shared,
  };

  const mat = new THREE.ShaderMaterial({
    name: `slyInk_${thickness}`,
    uniforms,
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide,
    transparent: opacity < 1,
    depthTest: true,
    depthWrite: opacity >= 1,
    fog: false,
    toneMapped: false,   // the chunk is included by hand so three must not add another
  });

  // The shell is pure ink; it must never be lit or shadowed.
  mat.lights = false;
  return mat;
}

/**
 * Build an inverted-hull shell for `mesh` and parent it to the mesh.
 *
 * Parenting to the mesh (identity local transform) means the shell inherits the exact world
 * matrix with no bookkeeping. For a SkinnedMesh the shell is itself a SkinnedMesh bound to the
 * *same* skeleton and bind matrix, so it deforms with the animation for free.
 *
 * @returns {THREE.Mesh|null} the shell, or null if the mesh cannot carry one
 */
export function buildOutlineShell(mesh, material) {
  if (!mesh || !mesh.isMesh || !mesh.geometry || !material) return null;
  if (mesh.userData.slyShell) return mesh.userData.slyShell;
  if (!weldNormals(mesh.geometry)) return null;
  /* Before the shell exists, so no shell can ever be drawn against a missing weight stream
     (which reads 0.0, not 1.0 — see applyInkWeights). */
  applyInkWeights(mesh);

  let shell;
  if (mesh.isSkinnedMesh && mesh.skeleton) {
    shell = new THREE.SkinnedMesh(mesh.geometry, material);
    shell.bindMode = mesh.bindMode;
    shell.bind(mesh.skeleton, mesh.bindMatrix);
  } else if (mesh.isInstancedMesh) {
    shell = new THREE.InstancedMesh(mesh.geometry, material, mesh.count);
    shell.instanceMatrix = mesh.instanceMatrix;
    shell.count = mesh.count;
  } else {
    shell = new THREE.Mesh(mesh.geometry, material);
  }

  shell.name = `${mesh.name || 'mesh'}_ink`;
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.matrixAutoUpdate = false;   // local transform is identity, forever
  shell.frustumCulled = mesh.frustumCulled;
  shell.renderOrder = (mesh.renderOrder || 0) - 1;
  shell.userData.slyOutline = true;
  shell.raycast = noRaycast;        // never let a shell win a pick or a collision probe

  mesh.add(shell);
  mesh.userData.slyShell = shell;
  return shell;
}

function noRaycast() {}

/** Detach and forget a shell. Geometry is shared with the host mesh, so it is not disposed. */
export function removeOutlineShell(mesh) {
  const shell = mesh?.userData?.slyShell;
  if (!shell) return;
  shell.removeFromParent();
  delete mesh.userData.slyShell;
}
