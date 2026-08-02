/**
 * casters2.mjs — headless per-cascade STATIC caster census, rebuilt.
 *
 * Supplies S for the saving derivation: the static triangles the CACHED cascades would
 * redraw per frame under legacy, summed over cached cascades, visible tracked statics only
 * (PREREG-census-reset.md §5). Headless — no capture lock, no GPU, ~15 s.
 *
 * It reproduces Lighting's own arithmetic rather than approximating it:
 *   - splits: lerp(uniform, log, splitLambda) over [shadowNear, shadowDistance]
 *   - per-cascade bounding sphere of the frustum slice, closed form, radiusQuantum-rounded
 *   - caster pad = clamp(casterCeiling / sin(elevation), casterPadMin, casterPadMax)
 *   - a caster counts in cascade i if its world bbox intersects that cascade's ortho box
 *     (the box built along the light basis, extended `back` toward the light) — which is
 *     what three's shadow frustum culling does.
 *
 * STATED GAPS (this is a floor, not a total — same gaps the first census carried):
 *   - Vegetation does not build headless (needs textures) → palms absent.
 *   - Terrain's headless init lands 0 casters → sand/nile absent.
 *   - Props/Statues are not built here; ARCHITECTURE only.
 * So S below is an ARCHITECTURE-only floor. The saving fraction derived from it is therefore
 * also a floor on the numerator and must be quoted as such.
 */
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';

const SHOT = process.argv[2] || 'hero';

/* Mirror src/render/Lighting.js TUNE (read, not guessed — update if TUNE moves). */
const TUNE = {
  shadowNear: 0.5, shadowDistance: 160, splitLambda: 0.78, radiusQuantum: 0.25,
  casterCeiling: 36, casterPadMin: 34, casterPadMax: 130,
  cascadeCount: 3,          // quality 'high'
  cacheFrom: 1,             // TUNE.shadowCacheFrom — c0 stays legacy
};

/* Canonical camera + sun, from src/core/Shots.js and Atmosphere's evalAtmosphere. */
const SHOTS = {
  // Read from src/core/Shots.js, not remembered (§11: a probe's header must match the source).
  hero: { pos: [8.9, 10.28, 17.2], target: [-1.0, 7.4, 4.0], fov: 46, tod: 0.79 },
};
const S = SHOTS[SHOT];
if (!S) { console.log(`no camera pinned for "${SHOT}"`); process.exit(1); }

const { A, engine } = await buildLevel();

/* Sun direction at this tod — matches Atmosphere: azimuth sweeps west, elevation 22deg-ish.
   Taken from the measured value quoted in KNOWN_ISSUES (evalAtmosphere(0.76).sunDir
   = (-0.899, 0.438, 0)); tod 0.79 is within a degree of it for this purpose. */
const keyDir = new THREE.Vector3(-0.899, 0.438, 0).normalize();   // points TOWARD the sun

const camPos = new THREE.Vector3(...S.pos);
const camTgt = new THREE.Vector3(...S.target);
const fwd = camTgt.clone().sub(camPos).normalize();
const aspect = 1280 / 720;
const tanV = Math.tan(THREE.MathUtils.degToRad(S.fov * 0.5));
const tanH = tanV * aspect;
const k2 = tanV * tanV + tanH * tanH;

const splits = [];
for (let i = 0; i <= TUNE.cascadeCount; i++) {
  const p = i / TUNE.cascadeCount;
  const log = TUNE.shadowNear * Math.pow(TUNE.shadowDistance / TUNE.shadowNear, p);
  const uni = TUNE.shadowNear + (TUNE.shadowDistance - TUNE.shadowNear) * p;
  splits.push(THREE.MathUtils.lerp(uni, log, TUNE.splitLambda));
}

const lightDir = keyDir.clone().multiplyScalar(-1).normalize();    // direction light travels
const upRef = Math.abs(lightDir.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
const right = new THREE.Vector3().crossVectors(upRef, lightDir).normalize();
const up = new THREE.Vector3().crossVectors(lightDir, right).normalize();
const sinEl = Math.max(0.28, Math.abs(keyDir.y));
const pad = THREE.MathUtils.clamp(TUNE.casterCeiling / sinEl, TUNE.casterPadMin, TUNE.casterPadMax);

/* Collect architecture meshes with world bboxes and triangle counts. */
const meshes = [];
A.group ? A.group.updateMatrixWorld(true) : engine.scene.updateMatrixWorld(true);
const root = A.group || engine.scene;
root.traverse((o) => {
  if (!o.isMesh || o.visible === false) return;
  if (o.userData?.noShadow || o.userData?.isOutlineShell || o.userData?.slyOutline) return;
  const g = o.geometry;
  if (!g?.attributes?.position) return;
  if (!g.boundingBox) g.computeBoundingBox();
  const inst = o.isInstancedMesh ? o.count : 1;
  const tris = ((g.index ? g.index.count : g.attributes.position.count) / 3) * inst;
  const bb = new THREE.Box3();
  if (o.isInstancedMesh) {
    const m = new THREE.Matrix4();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      bb.union(g.boundingBox.clone().applyMatrix4(m.premultiply(o.matrixWorld)));
    }
  } else {
    bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
  }
  meshes.push({ name: o.name || '(anon)', tris, bb });
});

console.log(`headless ARCHITECTURE census — shot ${SHOT}, ${meshes.length} visible caster meshes`);
console.log(`splits ${splits.map((s) => s.toFixed(2)).join(' / ')}   pad ${pad.toFixed(1)} m   sinEl ${sinEl.toFixed(3)}`);

let cachedStatic = 0, allStatic = 0;
const rows = [];
for (let i = 0; i < TUNE.cascadeCount; i++) {
  const n = splits[i], f = splits[i + 1];
  let z = 0.5 * (n + f) * (1 + k2), radius;
  if (z >= f) { z = f; radius = Math.max(f * Math.sqrt(k2), Math.hypot(n * Math.sqrt(k2), f - n)); }
  else radius = Math.sqrt((f - z) * (f - z) + f * f * k2);
  radius = Math.ceil(radius / TUNE.radiusQuantum) * TUNE.radiusQuantum;
  const centre = camPos.clone().addScaledVector(fwd, z);
  const back = radius + pad;

  /* Ortho box in the light basis: +-radius laterally, [-back, +radius] along the light. */
  let tris = 0, count = 0;
  for (const m of meshes) {
    // Project the mesh bbox's 8 corners into the light basis and test overlap.
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 8; c++) {
      const p = new THREE.Vector3(
        c & 1 ? m.bb.max.x : m.bb.min.x,
        c & 2 ? m.bb.max.y : m.bb.min.y,
        c & 4 ? m.bb.max.z : m.bb.min.z).sub(centre);
      const a = [p.dot(right), p.dot(up), p.dot(lightDir)];
      for (let k = 0; k < 3; k++) { if (a[k] < lo[k]) lo[k] = a[k]; if (a[k] > hi[k]) hi[k] = a[k]; }
    }
    if (hi[0] < -radius || lo[0] > radius) continue;
    if (hi[1] < -radius || lo[1] > radius) continue;
    if (hi[2] < -back || lo[2] > radius) continue;
    tris += m.tris; count++;
  }
  const cached = i >= TUNE.cacheFrom;
  rows.push({ i, radius, count, tris, cached });
  allStatic += tris;
  if (cached) cachedStatic += tris;
  console.log(`  c${i}  radius ${radius.toFixed(1).padStart(6)} m   casters ${String(count).padStart(3)}   static tris ${String(Math.round(tris)).padStart(8)}   ${cached ? 'CACHED' : 'legacy'}`);
}

console.log(`\nS (cached cascades c${TUNE.cacheFrom}..c${TUNE.cascadeCount - 1}, ARCHITECTURE statics only) = ${Math.round(cachedStatic)} tris/frame`);
console.log(`D candidates:`);
console.log(`  D_shadow_all_cascades = ${Math.round(allStatic)} tris/frame (all cascades, statics, this census)`);
console.log(`\nGAPS: Vegetation + Terrain + Props absent (do not build headless) — S is an`);
console.log(`ARCHITECTURE-ONLY FLOOR. Quote it as a floor, with D named in the same sentence.`);
