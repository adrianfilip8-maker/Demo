import * as THREE from 'three';
import { OUTLINE_VERT, OUTLINE_FRAG } from './shaders/toon.glsl.js';

/**
 * Outline.js — inverted-hull ink shells. **One ink system, one width.**
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
 *
 * ---------------------------------------------------------------------------------------
 * ## Why this file, and not the call sites, decides the width  (critic pass 7, defect #3)
 *
 * The measured complaint was "ink weight varies 20x across the frame and tracks asset
 * provenance rather than intent" — you could name which module built a mesh from how thick
 * its outline was. Three separate dials produced that, and all three are shut here:
 *
 *   - **A per-call-site thickness multiplier.** `Shading.outline()` computed
 *     `TUNE.inkPx * thickness` from whatever number the caller passed, so the same ink system
 *     shipped at 1.75 px (guard scarab), 2.50 px (props, KayKit), 2.63 px (guard) and
 *     3.13 px (cane). Every one of those numbers was authored in a different module by a
 *     different agent and none of them was a decision about the *line*.
 *   - **A per-vertex weight in the same units.** `slyInk` multiplied on top of that, and
 *     because it is authored as `outline:` on a material it collected values in two
 *     incompatible unit systems: a MULTIPLIER (`1.0`, `0.85`, `0.6`) in Props/Architecture,
 *     and a FRACTION-OF-FRAME-HEIGHT (`0.0034`) in SlyModelDL* and KayKit. A weight of 0.0034
 *     reaching the multiply would collapse a 2.5 px line to 0.0085 px — invisible. Nothing
 *     shipped in that state only because the two paths happen not to meet today.
 *   - **A distance falloff**, thinning every line past 18 m to 0.62x by 150 m.
 *
 * So: `INK_PX` is the width, it is the only width, and a per-material weight is now a
 * PRESENCE decision — "does this surface carry ink at all" — rather than a width dial.
 * `outline: 0` keeps meaning exactly what Props.js documents it to mean (a topology refusal:
 * cloth, glass, flame), and any positive value means the house line. There is no threshold
 * in that rule to get wrong, and no unit to confuse.
 *
 * What this file **cannot** fix, because the call sites are other agents' files: a mesh that
 * never calls `Shading.outline()` gets no hull at all, and that is the larger half of the 20x.
 * As shipped that is the protagonist (`SlyModelDLRig.js`), all of `Architecture.js`, all of
 * `Vegetation.js` and ten of Props' eleven ink-declaring keys. `inkAudit()` at the bottom of
 * this file turns that from a silence into a number.
 */

const WELD_ATTR = 'slyNormal';
const INK_ATTR = 'slyInk';

/**
 * **The** ink width, in device pixels, for every inverted hull in the game.
 *
 * 2.5 because AGENTS §2.1 says "Thickness scales with view distance so lines stay ~2.5 px on
 * screen", and because that is what `TUNE.inkPx` has always been. This is not a re-grade: it
 * is the same number, moved to the one place that can guarantee it.
 *
 * Device pixels, not CSS pixels — `uRes` is fed from `renderer.getDrawingBufferSize()`.
 */
export const INK_PX = 2.5;

/**
 * The value written to `uFalloff` to switch the distance falloff **off**.
 *
 * The shader computes `mix(1.0, 0.62, smoothstep(18.0, uFalloff, dist))`. With uFalloff = 1e9
 * the smoothstep argument at the far plane (dist ~ 1e3) is t ~ 1e-6, so the smoothstep is
 * ~3e-12 and the multiplier is `1.0 - 0.38 * 3e-12`, which rounds to **exactly 1.0** in
 * float32 (eps/2 = 5.96e-8). The falloff is therefore removed bit-exactly, without editing the
 * shader — `toon.glsl.js` belongs to another agent and did not need to be touched for this.
 *
 * Not `Infinity`: mathematically cleaner, but a non-finite float uniform is the kind of thing
 * that trips one driver in five and there is no gain to buy the risk with.
 */
export const INK_NO_FALLOFF = 1e9;

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
 * **The weight is PRESENCE, not width.** It is `1` wherever the host material asks for ink at
 * all and `0` where it refuses, and never anything in between. See the header: a fractional
 * weight is a second width dial, it is authored per-module in two incompatible unit systems
 * (a multiplier in Props/Architecture, a fraction-of-frame-height in SlyModelDL* and KayKit), and it
 * is one of the three mechanisms that made ink thickness track which pipeline built a mesh.
 *
 * The rule is `w > 0`, which is the same test `Shading.applyOutlines()` and `Props.js` already
 * use to decide whether to build a shell — so refusals stay refusals (`cloth`, `glass`,
 * `flame`, `ember` at `outline: 0`) and everything else gets the house line. Note this is
 * deliberately NOT a threshold at some fraction: a threshold is a number that can be wrong,
 * and the 0.0034-vs-1.0 unit clash means any threshold between them silently deletes the
 * character's ink or silently doubles a prop's.
 *
 * **Why this exists at all.** A mesh with a material ARRAY has real `geometry.groups`, and
 * every one of those materials carries its own ink declaration — `toon()` accepts `outline:`
 * (ToonMaterial.js:949) and stores it (`:1064`), and `applyOutlines()` reads it (`:1215`) for
 * props. But `applyOutlines()` reads `material[0]` only, and the shell built here takes a
 * *single* material, which three renders as one draw over the whole geometry. So for a mesh
 * built from several material groups — Sly — a group that refuses ink could not say so. This
 * attribute is how that refusal reaches the shader, at the cost of one float stream and
 * **zero extra draw calls**; handing the shell a material array instead would cost one draw
 * per group.
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
  /* Presence, not width. Absent or non-finite reads as "yes" — an unannotated group is a
     surface nobody made a decision about, and the house default is that a surface is inked. */
  const weightOf = (i) => {
    const w = mats?.[i]?.userData?.outline;
    return Number.isFinite(w) && w <= 0 ? 0 : 1;
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
        /* A vertex claimed by two groups takes the LARGEST weight — with presence weights that
           reads as "inked wins over refused", so a shared seam can only ever keep a line, never
           silently lose one that another group asked to keep. Merged geometry makes groups
           vertex-disjoint, so in practice this is a safety net. */
        arr[v] = seen[v] ? Math.max(arr[v], w) : w;
        seen[v] = 1;
      }
    }
  }
  attr.needsUpdate = true;
  return true;
}

/**
 * The shell material. One per colour — the caller caches them, because a program switch per
 * prop would eat the draw-call budget for nothing.
 *
 * **`thickness` and `falloff` are accepted and then ignored, on purpose.** Every hull in the
 * game is `INK_PX` wide at every distance; see the header for why the per-call-site dial and
 * the falloff both had to go, and `INK_NO_FALLOFF` for why writing a sentinel is bit-exactly
 * equivalent to deleting the falloff term from a shader this agent does not own.
 *
 * The caller's request is not thrown away — it is recorded on `mat.userData.slyInkRequested`,
 * so a same-boot A/B can restore the old behaviour from the material itself with no source
 * change:
 *
 * ```js
 * for (const m of shading._inkCache.values()) {
 *   const r = m.userData.slyInkRequested;
 *   m.uniforms.uThickness.value = r.thickness;   // back to 1.75 / 2.5 / 2.63 / 3.13
 *   m.uniforms.uFalloff.value   = r.falloff;     // back to 150 m
 * }
 * ```
 *
 * @param {object} shared        shared uniform objects owned by Shading (light + atmosphere)
 * @param {object} opts
 */
export function createOutlineMaterial(shared, {
  thickness = INK_PX,
  inkSun = 0x1a1210,
  inkShade = 0x161022,
  gain = 1.0,
  opacity = 1.0,
  depthPush = 0.0022,
  falloff = 140,
} = {}) {
  const uniforms = {
    uThickness: { value: INK_PX },
    uDepthPush: { value: depthPush },
    uFalloff: { value: INK_NO_FALLOFF },
    uInkSun: { value: new THREE.Color(inkSun) },
    uInkShade: { value: new THREE.Color(inkShade) },
    uInkOpacity: { value: opacity },
    uInkGain: { value: gain },
    ...shared,
  };

  const mat = new THREE.ShaderMaterial({
    /* Named for the width it actually draws, not the one it was asked for. A material called
       `slyInk_3.125` that renders 2.5 px is a lie the next debugger has to unpick. */
    name: `slyInk_${INK_PX}`,
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

  /* What the call site asked for, kept verbatim: the restore arm of any A/B needs it, and a
     future reader deserves to see that the request was overridden rather than lost. */
  mat.userData.slyInkRequested = { thickness, falloff };

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

/**
 * Walk a subtree and report every mesh whose material **asks** for ink and has no shell.
 *
 * This exists because the loudest half of "ink varies 20x across the frame" is not a width at
 * all — it is meshes with no hull sitting next to meshes with one, and the difference between
 * those two states was, until now, completely silent. A module could author `outline: 0.85` on
 * every stone in the level and never call `Shading.outline()`, and nothing anywhere would say
 * so; `Architecture.js` and `Vegetation.js` have both been in exactly that state, and so has
 * the shipped protagonist.
 *
 * Cheap enough to run at the end of init and push into `window.__GAME.warnings`.
 *
 * @param {THREE.Object3D} root
 * @returns {{inked:number, missing:number, refused:number, names:string[]}}
 */
export function inkAudit(root) {
  const out = { inked: 0, missing: 0, refused: 0, names: [] };
  root?.traverse?.((o) => {
    if (!o.isMesh || o.userData.slyOutline) return;      // never audit a shell
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    /* "Asks for ink" is the same `> 0` test applyInkWeights and applyOutlines use. A material
       array asks if ANY of its groups does — one inked group is enough to need a shell. */
    let asks = false;
    for (const m of mats) {
      const w = m?.userData?.outline;
      if (!(Number.isFinite(w) && w <= 0)) { asks = true; break; }
    }
    if (!asks) { out.refused++; return; }
    if (o.userData.slyShell) { out.inked++; return; }
    out.missing++;
    if (out.names.length < 40) out.names.push(o.name || '(unnamed)');
  });
  return out;
}
