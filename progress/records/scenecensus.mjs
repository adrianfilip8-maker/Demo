/* Whole-scene triangle census, offline. Counts every mesh ONCE by uuid.
 *
 * Why not tools/scenebudget.mjs: Terrain's constructor creates Vegetation and Water and
 * Vegetation.init() parents its group into terrain.group (Vegetation.js:467). scenebudget
 * builds vegetation/water a SECOND time and also lists them as separate roots, so those
 * meshes can be reached by more than one traversal. This walks one scene and dedupes.
 *
 * Also bills inverted-hull ink shells separately: a shell re-draws its host's geometry, so
 * a module that outlines everything doubles its own triangles and that is invisible in a total.
 */
import * as THREE from 'three';
import { SHOTS } from '../../src/core/Shots.js';

const ROOT = '/home/user/Demo';
const W = 1280, H = 720;
const warnings = [];
const built = {};
const texStub = { tex: () => null, get: () => null, material: () => null, bundle: () => null };
const scene = new THREE.Scene();
const engine = {
  quality: 'high', scene, debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), has: (k) => !!built[k],
  get: (k) => (k === 'textures' ? texStub : built[k] || null),
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
  camera: new THREE.PerspectiveCamera(50, W / H, 0.1, 2000),
};

/* Build in MANIFEST order, exactly as main.js does. Terrain owns veg+water; do NOT
   build those separately or they land in the graph twice. */
const PLAN = [
  ['terrain',      'src/world/Terrain.js',      'Terrain'],
  ['architecture', 'src/world/Architecture.js', 'Architecture'],
  ['props',        'src/world/Props.js',        'Props'],
  ['character',    'src/player/SlyModel.js',    'SlyModel'],
  ['guards',       'src/ai/Guard.js',           'Guards'],
];

for (const [key, rel, cls] of PLAN) {
  try {
    const mod = await import(`${ROOT}/${rel}`);
    const C = mod[cls];
    if (!C) { console.log(`  (${key}: no export ${cls})`); continue; }
    const inst = new C(engine);
    await inst.init?.();
    built[key] = inst;
    /* Some modules add their own group to the scene; others hand one back. Ensure it is
       in the scene exactly once. */
    for (const g of [inst.root, inst.group, inst.mesh]) {
      if (g && g.isObject3D && !scene.getObjectById(g.id)) scene.add(g);
    }
  } catch (e) {
    console.log(`  (${key} FAILED: ${String(e.message).split('\n')[0]})`);
  }
}
scene.updateMatrixWorld(true);

const tri = (m) => {
  const g = m.geometry; if (!g?.attributes?.position) return 0;
  const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  return n * (m.isInstancedMesh ? m.count : 1);
};

/* Attribute to the highest named ancestor below the scene — the module root group. */
const ownerOf = (o) => {
  let best = o, p = o;
  while (p && p.parent && p.parent !== scene) { p = p.parent; if (p.name) best = p; }
  return (p && p.name) || best.name || '(unnamed)';
};

/* ---- 1. SCENE CONTENT: everything that exists, counted once, no camera ---- */
const seen = new Set();
const content = new Map();
let cD = 0, cT = 0, shellD = 0, shellT = 0;
const allMeshes = [];
scene.traverse((o) => {
  if (!o.isMesh && !o.isPoints && !o.isLine) return;
  if (seen.has(o.uuid)) return;
  seen.add(o.uuid);
  if (o.visible === false) return;
  if (o.userData?.collisionProxy) return;
  if (!o.geometry?.attributes?.position) return;
  const t = tri(o);
  const shell = !!(o.userData?.isOutlineShell || o.userData?.slyOutline);
  const key = ownerOf(o) + (shell ? '  [ink shell]' : '');
  const rec = content.get(key) || { d: 0, t: 0 };
  rec.d++; rec.t += t; content.set(key, rec);
  cD++; cT += t;
  if (shell) { shellD++; shellT += t; }
  allMeshes.push({ o, t, key });
});

console.log(`\n=== SCENE CONTENT (everything built, counted once, no camera) ===`);
console.log(`TOTAL ${cD} meshes / ${(cT / 1e6).toFixed(3)}M triangles`);
console.log(`  of which ink shells: ${shellD} meshes / ${(shellT / 1e6).toFixed(3)}M`);
for (const [k, v] of [...content].sort((a, b) => b[1].t - a[1].t)) {
  console.log(`  ${String(v.d).padStart(4)} meshes  ${String((v.t / 1000).toFixed(0)).padStart(7)}k tris  (${(100 * v.t / cT).toFixed(1).padStart(5)}%)  ${k}`);
}

console.log(`\n--- 25 largest single meshes in the scene ---`);
for (const m of allMeshes.sort((a, b) => b.t - a.t).slice(0, 25)) {
  console.log(`  ${String((m.t / 1000).toFixed(1)).padStart(8)}k  ${m.o.isInstancedMesh ? `x${m.o.count} ` : ''}${m.o.name || '(unnamed)'}   [${m.key}]`);
}

/* ---- 2. MAIN VIEW: what each canonical camera actually submits ---- */
const names = Object.keys(SHOTS).filter((k) => SHOTS[k]?.pos && SHOTS[k]?.target);
const rows = [];
for (const sn of names) {
  const s = SHOTS[sn];
  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 2000);
  cam.position.fromArray(s.pos); cam.lookAt(new THREE.Vector3(...s.target));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const fr = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  let D = 0, T = 0, sd = 0, st = 0;
  const per = new Map();
  for (const { o, t, key } of allMeshes) {
    if (o.frustumCulled !== false) {
      let sph = o.boundingSphere || null;
      if (!sph) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sph = o.geometry.boundingSphere; }
      if (sph) {
        const bs = sph.clone().applyMatrix4(o.matrixWorld);
        if (!fr.intersectsSphere(bs)) continue;
      }
    }
    D++; T += t;
    if (key.includes('ink shell')) { sd++; st += t; }
    const r = per.get(key) || { d: 0, t: 0 }; r.d++; r.t += t; per.set(key, r);
  }
  rows.push({ sn, D, T, sd, st, per });
}
rows.sort((a, b) => b.T - a.T);
console.log(`\n=== MAIN VIEW (frustum-culled per canonical camera), ${W}x${H} ===`);
console.log(`shot           draws     tris    ink-shell part      vs budget 250 / 1.200M`);
for (const r of rows) {
  console.log(`${r.sn.padEnd(14)} ${String(r.D).padStart(5)} ${(r.T / 1e6).toFixed(3)}M   ${String(r.sd).padStart(3)}/${(r.st / 1e6).toFixed(3)}M      `
    + `${(100 * r.D / 250).toFixed(0)}% draws, ${(100 * r.T / 1.2e6).toFixed(0)}% tris`);
}
const worst = rows[0];
console.log(`\nWORST main-view by tris: ${worst.sn} — ${worst.D} draws / ${(worst.T / 1e6).toFixed(3)}M`);
console.log(`  owners:`);
for (const [k, v] of [...worst.per].sort((a, b) => b[1].t - a[1].t)) {
  console.log(`    ${String(v.d).padStart(4)} draws  ${String((v.t / 1000).toFixed(0)).padStart(7)}k  ${k}`);
}
if (warnings.length) {
  console.log(`\nbuild warnings (${warnings.length}):`);
  for (const w of warnings.slice(0, 12)) console.log(`  ! ${w}`);
}
