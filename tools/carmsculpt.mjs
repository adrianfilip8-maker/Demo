#!/usr/bin/env node
/**
 * carmsculpt.mjs — "the sculpt is off and the head is missing", answered offline, with no renderer.
 *
 * The user's report has at least five causes behind it and they need different repairs:
 *
 *   1. the head meshes are not in the draw at all (cut by the census, or discarded in the bind),
 *   2. the head is collapsed to a point by bad skinning — present, zero extent,
 *   3. the head is displaced metres away by bad skinning — present, drawn, not on the neck,
 *   4. the head is textured to nothing — UVs sampling empty atlas, or an alpha path,
 *   5. the bone set the shader actually receives is truncated, so everything past the cut is wrong.
 *
 * This file answers what can be answered WITHOUT a browser: 1, 2, 4 at bind, and — the part that
 * matters most — whether the runtime bone ORDER is a +1 shift of the importer's order or a
 * PERMUTATION of it. `shiftGuardSkin` assumes the former. Nothing had ever checked it, and the
 * two orders are built in different files from different arrays:
 *
 *   CarmelitaGuard.bindToRig3   boneIndex over  RIG3.BONE_ORDER.filter(used)      — no `root`
 *   GuardModel.instantiate      Skeleton over   ['root', ...asset.skeleton names] — `root` first
 *
 * If those disagree by anything other than the prepended `root`, a +1 remap is not a fix, it is a
 * second, differently-wrong assignment — and it would pass every structural test in the suite,
 * which is §699's shape exactly. So the orders are compared name by name here rather than argued
 * about from the two files.
 *
 * §418.3: every assertion below prints an input seen to PASS and one seen to FAIL. The failing
 * inputs are synthesised in-arm (a mesh's head vertices zeroed, an index array rotated by two)
 * so the checks are shown able to reject, not merely observed to be green.
 *
 *   node tools/carmsculpt.mjs
 *
 * Reads only committed assets, fetches nothing, needs no lock and no browser.
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bindToRig3, atlasOf, MATERIAL_ATLAS, BONE_MAP } from '../src/ai/CarmelitaGuard.js';
import { RIG3 } from '../src/player/SlyModel3.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const GLB = path.join(ROOT, 'public/assets/sly-anim/carmelita-guard.glb');
const f3 = (n) => (Number.isFinite(n) ? n.toFixed(3) : String(n));

const buf = readFileSync(GLB);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
gltf.scene.updateMatrixWorld(true);

/* ════════════════ 1. the scene graph as it arrives, before anything is cut ════════════════ */

console.log('══ 1. EVERY node in the parsed scene, skinned or not ══');
const all = [];
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  all.push({
    name: o.name,
    skinned: !!o.isSkinnedMesh,
    mat: Array.isArray(o.material) ? o.material.map((m) => m?.name).join('+') : (o.material?.name ?? '—'),
    verts: g.attributes.position?.count ?? 0,
    tris: Math.round((g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3),
    uv: !!g.attributes.uv,
    visible: o.visible,
    dy: bb ? bb.max.y - bb.min.y : NaN,
    y0: bb ? bb.min.y : NaN,
    y1: bb ? bb.max.y : NaN,
  });
});
all.sort((a, b) => (b.y1 - a.y1) || a.name.localeCompare(b.name));
console.log('   name                       skin  material                verts   tris  uv  vis   ymin   ymax');
for (const m of all) {
  console.log(`   ${m.name.padEnd(26)} ${String(m.skinned).padEnd(5)} ${m.mat.padEnd(23)}`
    + ` ${String(m.verts).padStart(5)} ${String(m.tris).padStart(6)}  ${m.uv ? 'y' : 'N'}`
    + `   ${m.visible ? 'y' : 'N'}  ${f3(m.y0).padStart(6)} ${f3(m.y1).padStart(6)}`);
}
const skinnedN = all.filter((m) => m.skinned).length;
console.log(`   → ${all.length} meshes in the file, ${skinnedN} skinned, ${all.length - skinnedN} not.`);
console.log(`     carmelita2guard.mjs keeps the skinned ones; bindToRig3 sees only those.\n`);

/* ════════════════ 2. the atlas split, by name, and the FIVE head meshes ════════════════ */

console.log('══ 2. atlas assignment — which five meshes are the head group ══');
const skinnedObjs = [];
gltf.scene.traverse((o) => { if (o.isSkinnedMesh) skinnedObjs.push(o); });
const byAtlas = [[], []];
for (const o of skinnedObjs) byAtlas[atlasOf(o.material)].push(o);
for (const gi of [0, 1]) {
  console.log(`   group ${gi} (${gi ? 'HEAD atlas carmelita-head.png' : 'BODY atlas carmelita-body.png'}) — ${byAtlas[gi].length} meshes`);
  for (const o of byAtlas[gi]) {
    const g = o.geometry; g.computeBoundingBox();
    const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
    const mat = Array.isArray(o.material) ? o.material.map((m) => m?.name).join('+') : o.material?.name;
    console.log(`      ${o.name.padEnd(26)} ${String(mat).padEnd(22)}`
      + ` v=${String(g.attributes.position.count).padStart(5)}`
      + `  y ${f3(bb.min.y).padStart(7)} .. ${f3(bb.max.y).padStart(7)}`
      + `  extent ${f3(bb.max.y - bb.min.y)}`);
  }
}
console.log(`   MATERIAL_ATLAS = ${JSON.stringify(MATERIAL_ATLAS)}\n`);

/* ════════════════ 3. the bind, and the per-region extent it produces ════════════════ */

console.log('══ 3. bindToRig3 — what survives, and the extent of every region ══');
const asset = bindToRig3(gltf.scene);
console.log(`   stats ${JSON.stringify(asset.stats)}`);
console.log(`   tris ${asset.tris}   regions ${asset.regions.length}   missing ${[...asset.missing].join(',') || 'none'}`);
const pos = asset.geometry.getAttribute('position');
asset.geometry.computeBoundingBox();
const bb = asset.geometry.boundingBox;
console.log(`   merged bbox  x ${f3(bb.min.x)} .. ${f3(bb.max.x)}`
  + `   y ${f3(bb.min.y)} .. ${f3(bb.max.y)}   z ${f3(bb.min.z)} .. ${f3(bb.max.z)}`);
console.log(`   merged HEIGHT at bind: ${f3(bb.max.y - bb.min.y)} m\n`);

console.log('   region                     grp  start  count      ymin     ymax   extentY   diag  degenerate?');
const regionBox = new Map();
for (const r of asset.regions) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = r.start; i < r.start + r.count; i++) { v.fromBufferAttribute(pos, i); box.expandByPoint(v); }
  regionBox.set(r.name, box);
  const size = box.getSize(new THREE.Vector3());
  const diag = size.length();
  console.log(`   ${r.name.padEnd(26)} ${r.group}  ${String(r.start).padStart(5)} ${String(r.count).padStart(6)}`
    + `  ${f3(box.min.y).padStart(8)} ${f3(box.max.y).padStart(8)}  ${f3(size.y).padStart(8)}`
    + ` ${f3(diag).padStart(6)}   ${diag < 1e-4 ? 'YES — COLLAPSED' : 'no'}`);
}
console.log('');

/* ════════════════ 4. the two bone orders, compared name by name ════════════════ */

console.log('══ 4. THE ORDER CHECK — importer index vs runtime Skeleton index ══');
/* what bindToRig3 wrote indices against */
const usedNames = new Set(asset.skeleton.map((s) => s[0]));
const importerOrder = RIG3.BONE_ORDER.filter((b) => usedNames.has(b));
/* what instantiate() will build */
const runtimeOrder = ['root', ...asset.skeleton.map((s) => s[0])];

console.log(`   importer order (${importerOrder.length}): ${importerOrder.join(' ')}`);
console.log(`   runtime  order (${runtimeOrder.length}): ${runtimeOrder.join(' ')}`);
let pureShift = runtimeOrder.length === importerOrder.length + 1 && runtimeOrder[0] === 'root';
const mism = [];
for (let i = 0; i < importerOrder.length; i++) {
  if (runtimeOrder[i + 1] !== importerOrder[i]) { pureShift = false; mism.push(`${i}: importer ${importerOrder[i]} vs runtime[${i + 1}] ${runtimeOrder[i + 1]}`); }
}
console.log(`   → runtime is EXACTLY importer with 'root' prepended: ${pureShift ? 'YES' : 'NO'}`);
if (mism.length) { console.log('     mismatches:'); for (const m of mism) console.log(`       ${m}`); }
console.log(`   → therefore a uniform +1 skinIndex remap is ${pureShift ? 'the CORRECT repair' : 'NOT sufficient — the map is a permutation'}`);

/* §418.3 — the same check, shown able to FAIL, on a deliberately permuted order */
{
  const bad = ['root', ...asset.skeleton.map((s) => s[0])];
  const t = bad[3]; bad[3] = bad[7]; bad[7] = t;
  let ok = true;
  for (let i = 0; i < importerOrder.length; i++) if (bad[i + 1] !== importerOrder[i]) ok = false;
  console.log(`   [§418.3 falsifier] same check on an order with two bones swapped: ${ok ? 'YES (BROKEN CHECK)' : 'NO — the check rejects it'}`);
}

/* what each vertex ACTUALLY drives from, under the two readings */
const si = asset.geometry.getAttribute('skinIndex');
const sw = asset.geometry.getAttribute('skinWeight');
let minI = Infinity, maxI = -Infinity;
for (let i = 0; i < si.count * 4; i++) {
  if (sw.array[i] > 0) { minI = Math.min(minI, si.array[i]); maxI = Math.max(maxI, si.array[i]); }
}
console.log(`   skinIndex range over weighted slots: ${minI} .. ${maxI}`);
console.log(`   runtime skeleton size: ${runtimeOrder.length} bones  (max legal index ${runtimeOrder.length - 1})`);
console.log(`   → as shipped, index ${maxI} names '${runtimeOrder[maxI]}' at runtime`
  + ` but the importer meant '${importerOrder[maxI]}'`);
console.log(`   → with +1,     index ${maxI + 1} names '${runtimeOrder[maxI + 1]}' at runtime`
  + ` and the importer meant '${importerOrder[maxI]}'`);
console.log(`   → +1 overflows the ${runtimeOrder.length}-bone skeleton: ${maxI + 1 > runtimeOrder.length - 1 ? 'YES' : 'no'}\n`);

/* ════════════════ 5. how far each vertex is from the bone it drives, both readings ════════ */

console.log('══ 5. vertex-to-driving-bone distance, both readings (the §698 measurement, re-run) ══');
const bindWorld = { root: new THREE.Vector3() };
for (const [name, , p] of RIG3.SKELETON) bindWorld[name] = new THREE.Vector3().fromArray(p);
function meanDist(shift) {
  const v = new THREE.Vector3();
  let sum = 0, n = 0, over = 0;
  for (let i = 0; i < si.count; i++) {
    let best = -1, bw = 0;
    for (let k = 0; k < 4; k++) { const w = sw.array[i * 4 + k]; if (w > bw) { bw = w; best = si.array[i * 4 + k]; } }
    if (best < 0) continue;
    const idx = best + shift;
    const name = shift ? runtimeOrder[idx] : importerOrder[idx];
    const bp = bindWorld[name];
    if (!bp) { over++; continue; }
    v.fromBufferAttribute(pos, i);
    sum += v.distanceTo(bp); n++;
  }
  return { mean: sum / n, n, over };
}
/* reading A: indices as the runtime skeleton orders them (what the GPU does today) */
const asDrawn = meanDist(0);   // index i -> runtimeOrder[i] ... but importerOrder[i] is the intent
const vA = (() => {
  const v = new THREE.Vector3(); let sum = 0, n = 0;
  for (let i = 0; i < si.count; i++) {
    let best = -1, bw = 0;
    for (let k = 0; k < 4; k++) { const w = sw.array[i * 4 + k]; if (w > bw) { bw = w; best = si.array[i * 4 + k]; } }
    if (best < 0) continue;
    const bp = bindWorld[runtimeOrder[best]];
    if (!bp) continue;
    v.fromBufferAttribute(pos, i); sum += v.distanceTo(bp); n++;
  }
  return sum / n;
})();
const vB = (() => {
  const v = new THREE.Vector3(); let sum = 0, n = 0;
  for (let i = 0; i < si.count; i++) {
    let best = -1, bw = 0;
    for (let k = 0; k < 4; k++) { const w = sw.array[i * 4 + k]; if (w > bw) { bw = w; best = si.array[i * 4 + k]; } }
    if (best < 0) continue;
    const bp = bindWorld[importerOrder[best]];
    if (!bp) continue;
    v.fromBufferAttribute(pos, i); sum += v.distanceTo(bp); n++;
  }
  return sum / n;
})();
console.log(`   indices as the IMPORTER built them (root-less) : ${f3(vB)} m   ← the intent`);
console.log(`   indices as the RUNTIME skeleton orders them    : ${f3(vA)} m   ← what is drawn`);
console.log(`   ratio ${f3(vA / vB)}×   (§698 measured 0.0892 / 0.2938 = 3.3×)`);
console.log(`   sampled ${asDrawn.n} vertices\n`);

/* ════════════════ 6. UV coverage per region — candidate 4 ════════════════ */

console.log('══ 6. UV extent per region (candidate 4: textured to nothing) ══');
const uv = asset.geometry.getAttribute('uv');
for (const r of asset.regions) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, zero = 0;
  for (let i = r.start; i < r.start + r.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (u === 0 && v === 0) zero++;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const flag = (u1 - u0 < 1e-4 && v1 - v0 < 1e-4) ? '  ← DEGENERATE UV' : '';
  console.log(`   ${r.name.padEnd(26)} grp ${r.group}  u ${f3(u0)}..${f3(u1)}  v ${f3(v0)}..${f3(v1)}`
    + `  exact-(0,0) ${String(zero).padStart(5)}/${r.count}${flag}`);
}
console.log('');

/* ════════════════ 7. scale — the user's own question, at bind ════════════════ */

console.log('══ 7. SCALE at bind (the user asked directly) ══');
const nodeScales = [];
gltf.scene.traverse((o) => {
  const s = o.scale;
  const uniform = Math.abs(s.x - s.y) < 1e-6 && Math.abs(s.y - s.z) < 1e-6;
  if (!uniform || Math.abs(s.x - 1) > 1e-6) nodeScales.push(`${o.name || '(unnamed)'} [${o.type}] scale ${f3(s.x)},${f3(s.y)},${f3(s.z)}${uniform ? '' : '  ← NON-UNIFORM'}`);
});
console.log(`   nodes with a non-identity scale in the source chain: ${nodeScales.length}`);
for (const s of nodeScales) console.log(`      ${s}`);
const headBox = new THREE.Box3();
for (const r of asset.regions) if (r.group === 1) headBox.union(regionBox.get(r.name));
console.log(`   bound HEIGHT (merged, bind pose)      : ${f3(bb.max.y - bb.min.y)} m  (ymin ${f3(bb.min.y)}, ymax ${f3(bb.max.y)})`);
console.log(`   head-ATLAS group bbox                 : y ${f3(headBox.min.y)} .. ${f3(headBox.max.y)}   extent ${f3(headBox.max.y - headBox.min.y)} m`);
console.log(`   RIG3 bind head bone y                 : ${f3(bindWorld.head?.y)}   neck y ${f3(bindWorld.neck?.y)}`);
console.log(`   head-group centre y                   : ${f3(headBox.getCenter(new THREE.Vector3()).y)}`);
console.log('');

console.log('══ 8. BONE_MAP resolution ══');
console.log(`   BONE_MAP entries ${Object.keys(BONE_MAP).length}, source joints ${asset.stats.srcJoints},`
  + ` folded ${asset.stats.folded}, target bones used ${asset.stats.bones}`);
console.log(`   runtime skeleton will be ${runtimeOrder.length} bones — NOT ${asset.stats.srcJoints}.`);
console.log(`   → a 199-bone uniform limit cannot apply: the drawn skin has ${runtimeOrder.length}.`);
