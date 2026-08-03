/* §75.3: the scene-total budget, computed OFFLINE.
 *
 * §75.2 measured architecture's numerator headlessly and found 18% of draws / 27% of tris.
 * The open part was the scene total — Props, Terrain, Vegetation, Water and the rest — which
 * was said to need a boot. Most of it does not: these modules build headlessly exactly as
 * Architecture does, and the quantity §1 is scored on is the MAIN-VIEW one (what survives
 * frustum culling for a camera), not the all-passes submission counter.
 *
 * Counts, per camera: meshes whose bounding sphere intersects the frustum (= draws) and their
 * triangles, with InstancedMesh multiplied by `count`.
 */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';

const W = 1280, H = 720;
const warnings = [];
/* Vegetation wants `textures.tex(name)` and Water wants the live Terrain for its `tune`.
   Serving both from the stub is what lets those two modules into the count instead of being
   silently missing from it. */
const built = {};
const texStub = { tex: () => null, get: () => null, material: () => null, bundle: () => null };
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), has: () => false,
  get: (k) => (k === 'textures' ? texStub : built[k] || null),
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
};

const roots = [];
async function build(label, path, cls, pick) {
  try {
    const mod = await import(path);
    const C = mod[cls];
    if (!C) { console.log(`  (${label}: no export ${cls})`); return; }
    // Vegetation and Water take (engine, terrain) — pass the live Terrain, not a stub.
    const inst = new C(engine, built.terrain);
    await inst.init?.();
    built[label] = inst;
    const r = pick(inst);
    if (r) { r.updateMatrixWorld(true); roots.push([label, r]); }
    else console.log(`  (${label}: no root)`);
  } catch (e) { console.log(`  (${label} failed: ${String(e.message).split('\n')[0]})`); }
}
await build('architecture', '../src/world/Architecture.js', 'Architecture', o => o.root);
await build('props',        '../src/world/Props.js',        'Props',        o => o.group || o.root);
/* `terrain` INCLUDES vegetation and water — do not build them again.
 *
 * `Terrain`'s constructor builds both, and `Vegetation.init()` parents into `terrain.group`
 * (`Vegetation.js:467`). This file used to build them a second time AND list them as separate
 * roots, so every vegetation triangle was counted three times: once inside `terrain`, once in
 * its own root, once more from the duplicate build. The over-report was **+18 draws /
 * +0.155 M tris** — it turned a deduped 71 / 0.572 M into 89 / 0.728 M, and I quoted the
 * inflated figure back to an owner as if it were the tree's. KNOWN_ISSUES §130.
 *
 * Verified by walking the terrain subtree: it contains `vegetation/` and `water/nile`. If you
 * want them broken out, split the subtree by name — do not instantiate the modules twice. */
await build('terrain',      '../src/world/Terrain.js',      'Terrain',      o => o.group || o.root || o.mesh);

const tri = (m) => {
  const g = m.geometry; if (!g?.attributes?.position) return 0;
  const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  return n * (m.isInstancedMesh ? m.count : 1);
};

const names = Object.keys(SHOTS).filter(k => SHOTS[k]?.pos && SHOTS[k]?.target);
const rows = [];
for (const sn of names) {
  const s = SHOTS[sn];
  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 2000);
  cam.position.fromArray(s.pos); cam.lookAt(new THREE.Vector3(...s.target));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const fr = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  let D = 0, T = 0; const per = {};
  for (const [label, root] of roots) {
    let d = 0, t = 0;
    root.traverse((o) => {
      if (!o.isMesh || o.visible === false) return;
      if (o.userData?.collisionProxy) return;
      if (!o.geometry?.attributes?.position) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
      if (!fr.intersectsSphere(bs)) return;
      d++; t += tri(o);
    });
    per[label] = [d, t]; D += d; T += t;
  }
  rows.push([sn, D, T, per]);
}
rows.sort((a, b) => b[1] - a[1]);
const labels = roots.map(r => r[0]);
console.log(`\nMAIN-VIEW budget (frustum-culled), ${W}x${H}, all world modules built headlessly`);
console.log(`shot          draws    tris     ` + labels.map(l => l.slice(0, 5).padStart(13)).join(''));
for (const [sn, D, T, per] of rows) {
  console.log(`${sn.padEnd(13)} ${String(D).padStart(5)} ${(T/1e6).toFixed(3)}M   `
    + labels.map(l => `${per[l][0]}/${(per[l][1]/1000).toFixed(0)}k`.padStart(13)).join(''));
}
const wd = Math.max(...rows.map(r => r[1])), wt = Math.max(...rows.map(r => r[2]));
console.log(`\nWORST main-view: ${wd} draws (budget 250, ${(wd/250*100).toFixed(0)}%), `
  + `${(wt/1e6).toFixed(3)}M tris (budget 1.2M, ${(wt/1.2e6*100).toFixed(0)}%)`);
console.log(`NOTE: world modules only — character and guards are not in this count.`);
if (warnings.length) console.log(`build warnings: ${warnings.length}`);
