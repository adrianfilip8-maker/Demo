#!/usr/bin/env node
/**
 * carmhead.mjs — recover Carmelita's face, which the upstream glTF export threw away.
 *
 * ── the defect ──────────────────────────────────────────────────────────────────────────────
 * `Head_LP` is the face: muzzle, nose, eyes, cheeks, ears. In every glTF the fan project ships
 * it has an index buffer of **96 elements — 32 triangles**, referencing 64 of its vertices.
 * In the FBX the project actually imports from, the same mesh is **5,000 triangles**. Every
 * other mesh in the scene matches the FBX exactly, triangle for triangle:
 *
 *     Hair_LP 9528 = 9528   Coat 3188 = 3188   Hand 4606 = 4606   BustRetopo 1768 = 1768
 *     Head_LP    32 ≠ 5000                                            ← 99.4% of the face
 *
 * So the head was never in the file this project imported, and nothing downstream could have
 * put it back. It is the literal reading of the owner's "the head seems to be missing", and it
 * is independent of §702's bind-transfer defect: fixing the carry restores the hair, the skull
 * volume and the ears' *weighting*, and still leaves a face with 32 triangles in it.
 *
 * ── why this is safe to splice, established rather than assumed ─────────────────────────────
 * The FBX and the GLB are the same export at two stages, and that is checked, not believed:
 *
 *   · both skins list **the same 199 bones in the same order**, so `skinIndex` transfers with
 *     no remap at all — verified name by name, all 199, and refused if it ever stops holding;
 *   · every bone's bind position agrees to **0.000000 m** once the FBX's centimetres are
 *     divided by 100 (its node matrix carries an exact ×100);
 *   · the **64 surviving vertices are a fiducial**. Each one is matched against the FBX head by
 *     position and must land at distance 0, with a UV equal to (u, 1−v) — the one convention
 *     difference between the two exports. 64/64 must pass or this tool refuses to write.
 *
 * That last check is the point of the file. A head taken from the wrong asset, the wrong scale,
 * the wrong axis convention or the wrong UV flip all fail it, and it is run every bake rather
 * than once by hand.
 *
 * ── what it writes ──────────────────────────────────────────────────────────────────────────
 * `public/assets/sly-anim/carmelita-head-lp.glb` — a minimal glTF holding ONE mesh: the repaired
 * head's POSITION / NORMAL / TEXCOORD_0 / JOINTS_0 / WEIGHTS_0 and its indices, already in
 * metres, already v-flipped, already in the source scene's world space, and already indexed
 * against the 199-bone order `carmelita-guard.glb` uses. No skin, no skeleton, no animation —
 * `CarmelitaGuard.spliceHead` drops it straight in where the 32-triangle stub was.
 *
 * The FBX itself (16.9 MB) is NOT committed and is not a build input: AGENTS.md §1.1 allows
 * downloading during development and requires that what ships be committed bytes. The committed
 * bytes are the emitted head; the FBX is how they were derived, and the fiducial is how anyone
 * can check they were derived correctly without re-downloading anything.
 *
 *   node tools/carmhead.mjs --fbx <path to Carmelita_Animations7.fbx> [--write]
 *
 * Without `--write` it measures and reports and touches nothing.
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const FBX = arg('--fbx', '');
const WRITE = argv.includes('--write');
const OUT = path.join(ROOT, 'public/assets/sly-anim/carmelita-head-lp.glb');
const GUARD = path.join(ROOT, 'public/assets/sly-anim/carmelita-guard.glb');
const MESH = 'Head_LP';

if (!FBX) { console.error('usage: node tools/carmhead.mjs --fbx <Carmelita_Animations7.fbx> [--write]'); process.exit(2); }

/* ── the committed asset, which is both the target and the fiducial ──────────────────────── */
const gbuf = readFileSync(GUARD);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(
  gbuf.buffer.slice(gbuf.byteOffset, gbuf.byteOffset + gbuf.byteLength), '', res, rej));
gltf.scene.updateMatrixWorld(true);
let stub = null;
gltf.scene.traverse((o) => { if (o.name === MESH) stub = o; });
if (!stub) throw new Error(`${MESH} is not in ${path.basename(GUARD)}`);

/* ── the FBX ─────────────────────────────────────────────────────────────────────────────── */
const fbuf = readFileSync(FBX);
const froot = new FBXLoader().parse(fbuf.buffer.slice(fbuf.byteOffset, fbuf.byteOffset + fbuf.byteLength), '');
froot.updateMatrixWorld(true);
let full = null;
froot.traverse((o) => { if (o.name === MESH) full = o; });
if (!full) throw new Error(`${MESH} is not in ${path.basename(FBX)}`);

/* ── check 1: the two skins list the same bones in the same order ────────────────────────── */
const fbones = full.skeleton?.bones?.map((b) => b.name) || [];
const gbones = stub.skeleton?.bones?.map((b) => b.name) || [];
let orderOk = fbones.length === gbones.length && fbones.length > 0;
let firstDiff = -1;
for (let i = 0; i < fbones.length && orderOk; i++) if (fbones[i] !== gbones[i]) { orderOk = false; firstDiff = i; }
console.log(`1. bone order: FBX ${fbones.length} vs GLB ${gbones.length} — identical: ${orderOk}`
  + (firstDiff >= 0 ? ` (first difference at ${firstDiff}: ${fbones[firstDiff]} vs ${gbones[firstDiff]})` : ''));
if (!orderOk) throw new Error('the two skins do not agree on bone order — skinIndex cannot transfer unremapped');

/* ── check 2: the FBX's units, measured rather than assumed ──────────────────────────────── */
const nodeScale = new THREE.Vector3().setFromMatrixScale(full.matrixWorld);
const UNIT = 1 / nodeScale.x;
console.log(`2. FBX node world scale ${nodeScale.toArray().map((v) => v.toFixed(4)).join(', ')} `
  + `→ unit conversion ×${UNIT.toFixed(6)}`);
if (Math.abs(nodeScale.x - nodeScale.y) > 1e-3 || Math.abs(nodeScale.y - nodeScale.z) > 1e-3) {
  throw new Error('the FBX head node carries a NON-UNIFORM scale — a uniform unit conversion would shear it');
}
let maxBind = 0;
for (let i = 0; i < fbones.length; i++) {
  const fp = new THREE.Vector3().setFromMatrixPosition(
    new THREE.Matrix4().copy(full.skeleton.boneInverses[i]).invert()).multiplyScalar(UNIT);
  const gp = new THREE.Vector3().setFromMatrixPosition(
    new THREE.Matrix4().copy(stub.skeleton.boneInverses[i]).invert());
  maxBind = Math.max(maxBind, fp.distanceTo(gp));
}
console.log(`   max bind-position disagreement across ${fbones.length} bones: ${maxBind.toFixed(7)} m`);
if (maxBind > 1e-4) throw new Error(`bind positions disagree by ${maxBind} m — these are not the same rig`);

/* ── build the repaired geometry in the GLB's own space ──────────────────────────────────── */
const geo = full.geometry.clone();
geo.applyMatrix4(full.matrixWorld);
geo.applyMatrix4(new THREE.Matrix4().makeScale(UNIT, UNIT, UNIT));
/* The FBX arrives unindexed (one vertex per corner). Index it so the emitted asset is the size
   the mesh actually is, and so the triangle count means what it says. */
if (!geo.index) {
  const p = geo.attributes.position;
  geo.setIndex(Array.from({ length: p.count }, (_, i) => i));
}
/* the one convention difference between the two exports, proven below rather than declared */
{
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true;
}
for (const k of Object.keys(geo.attributes)) {
  if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) geo.deleteAttribute(k);
}
geo.morphAttributes = {};

/* ── check 3: the 64 surviving vertices are a fiducial ───────────────────────────────────── */
const sg = stub.geometry.clone();
sg.applyMatrix4(stub.matrixWorld);
const sPos = sg.attributes.position, sUV = sg.attributes.uv;
const sIdx = sg.index;
const survivors = [...new Set(Array.from({ length: sIdx.count }, (_, i) => sIdx.getX(i)))];
const fPos = geo.attributes.position, fUV = geo.attributes.uv, fSI = geo.attributes.skinIndex;
const sSI = sg.attributes.skinIndex;
const key = (x, y, z) => `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
const byPos = new Map();
for (let j = 0; j < fPos.count; j++) {
  const k = key(fPos.getX(j), fPos.getY(j), fPos.getZ(j));
  if (!byPos.has(k)) byPos.set(k, []);
  byPos.get(k).push(j);
}
let posHit = 0, uvHit = 0, boneHit = 0;
for (const v of survivors) {
  const cands = byPos.get(key(sPos.getX(v), sPos.getY(v), sPos.getZ(v)));
  if (!cands) continue;
  posHit++;
  const u = sUV.getX(v), vv = sUV.getY(v);
  if (cands.some((j) => Math.abs(fUV.getX(j) - u) < 1e-3 && Math.abs(fUV.getY(j) - vv) < 1e-3)) uvHit++;
  if (cands.some((j) => fSI.getX(j) === sSI.getX(v))) boneHit++;
}
console.log(`3. fiducial: ${survivors.length} vertices survived the export.`);
console.log(`   exact position match in the FBX head : ${posHit}/${survivors.length}`);
console.log(`   UV match after the v-flip            : ${uvHit}/${survivors.length}`);
console.log(`   dominant bone match                  : ${boneHit}/${survivors.length}`);
if (posHit !== survivors.length || uvHit !== survivors.length || boneHit !== survivors.length) {
  throw new Error('the fiducial does not close — this is not the same head, or the conversion is wrong');
}

/* Bounds are computed from the position array by hand rather than through
   `computeBoundingBox()`. That is not fussiness: the emitted glTF's POSITION accessor min/max is
   normative — a loader may cull or clip against it — so it must be derived from the exact bytes
   being written, not from a cached box on a geometry that has been through four transforms. An
   earlier draft read `geo.boundingBox` here and printed a box that did not match an independent
   measurement of the same mesh, and rather than explain the cache the dependency was removed. */
function bounds(attr) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < attr.count; i++) {
    const v = [attr.getX(i), attr.getY(i), attr.getZ(i)];
    for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
  }
  return { min: mn, max: mx };
}
const bb = bounds(geo.attributes.position);
const stubBB = bounds(sPos);
const drawnBB = (() => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const v of survivors) {
    const p = [sPos.getX(v), sPos.getY(v), sPos.getZ(v)];
    for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
  }
  return { min: mn, max: mx };
})();
const stubTris = sIdx.count / 3, fullTris = geo.index.count / 3;
console.log(`4. head: ${stubTris} tris in the shipped asset → ${fullTris} tris recovered `
  + `(${fPos.count} vertices, +${fullTris - stubTris} triangles)`);
const fmt = (b) => `x ${b.min[0].toFixed(4)}..${b.max[0].toFixed(4)}  `
  + `y ${b.min[1].toFixed(4)}..${b.max[1].toFixed(4)}  z ${b.min[2].toFixed(4)}..${b.max[2].toFixed(4)}`;
console.log(`   recovered head, all ${geo.attributes.position.count} verts : ${fmt(bb)}`);
console.log(`   the stub's vertex CLOUD, ${sPos.count} verts  : ${fmt(stubBB)}`);
console.log(`   what the stub actually DREW, ${survivors.length} verts : ${fmt(drawnBB)}`);
console.log('   The export kept the head\'s vertex cloud and threw away its connectivity, so the');
console.log('   stub\'s cloud is nearly the whole head while what reached the screen was a patch');
console.log(`   ${(drawnBB.max[0] - drawnBB.min[0]).toFixed(3)} × ${(drawnBB.max[1] - drawnBB.min[1]).toFixed(3)}`
  + ` × ${(drawnBB.max[2] - drawnBB.min[2]).toFixed(3)} m in the middle of the face.`);

if (!WRITE) { console.log('\n(dry run — pass --write to emit)'); process.exit(0); }

/* ── emit a minimal GLB: one mesh, one node, one scene, no skin ──────────────────────────── */
function glb(g) {
  const idx = g.index;
  const use16 = fPos.count < 65536;
  const iArr = use16 ? Uint16Array.from(idx.array) : Uint32Array.from(idx.array);
  const parts = [];
  const views = [];
  const accessors = [];
  let off = 0;
  const push = (typed, target) => {
    while (off % 4) { parts.push(Buffer.alloc(1)); off++; }
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) });
    parts.push(buf); off += buf.length;
    return views.length - 1;
  };
  const CT = { f32: 5126, u16: 5123, u32: 5125 };
  const iView = push(iArr, 34963);
  accessors.push({ bufferView: iView, componentType: use16 ? CT.u16 : CT.u32, count: idx.count, type: 'SCALAR' });
  const attrAcc = {};
  const spec = [
    ['POSITION', g.attributes.position, 'VEC3', CT.f32, Float32Array],
    ['NORMAL', g.attributes.normal, 'VEC3', CT.f32, Float32Array],
    ['TEXCOORD_0', g.attributes.uv, 'VEC2', CT.f32, Float32Array],
    ['JOINTS_0', g.attributes.skinIndex, 'VEC4', CT.u16, Uint16Array],
    ['WEIGHTS_0', g.attributes.skinWeight, 'VEC4', CT.f32, Float32Array],
  ];
  for (const [name, attr, type, ct, Ctor] of spec) {
    if (!attr) throw new Error(`the head geometry has no ${name}`);
    const v = push(Ctor.from(attr.array), 34962);
    const a = { bufferView: v, componentType: ct, count: attr.count, type };
    if (name === "POSITION") { a.min = bb.min; a.max = bb.max; }
    accessors.push(a);
    attrAcc[name] = accessors.length - 1;
  }
  const json = {
    asset: { version: '2.0', generator: 'tools/carmhead.mjs — Head_LP recovered from Carmelita_Animations7.fbx' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: MESH, mesh: 0 }],
    meshes: [{ name: MESH, primitives: [{ attributes: attrAcc, indices: 0, mode: 4 }] }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: off }],
  };
  const bin = Buffer.concat(parts);
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jPad = (4 - (jsonBuf.length % 4)) % 4;
  const bPad = (4 - (bin.length % 4)) % 4;
  const jChunk = Buffer.concat([jsonBuf, Buffer.alloc(jPad, 0x20)]);
  const bChunk = Buffer.concat([bin, Buffer.alloc(bPad, 0)]);
  const total = 12 + 8 + jChunk.length + 8 + bChunk.length;
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 'ascii'); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jChunk.length, 12); out.write('JSON', 16, 'ascii');
  jChunk.copy(out, 20);
  const bo = 20 + jChunk.length;
  out.writeUInt32LE(bChunk.length, bo); out.write('BIN\0', bo + 4, 'ascii');
  bChunk.copy(out, bo + 8);
  return out;
}

const bytes = glb(geo);
writeFileSync(OUT, bytes);
console.log(`\nwrote ${path.relative(ROOT, OUT)} — ${(bytes.length / 1024).toFixed(0)} kB`);

/* ── read it back with the loader the game uses, and re-run the fiducial on the result ───── */
const back = await new Promise((res, rej) => new GLTFLoader().parse(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', res, rej));
let rt = null;
back.scene.traverse((o) => { if (o.isMesh) rt = o; });
const rg = rt.geometry;
console.log(`round-trip: ${rg.attributes.position.count} verts, ${rg.index.count / 3} tris, `
  + `attrs ${Object.keys(rg.attributes).join(',')}`);
if (rg.index.count !== geo.index.count) throw new Error('round-trip lost triangles');
if (!rg.attributes.skinIndex || !rg.attributes.skinWeight) throw new Error('round-trip lost the skin attributes');
{
  const rp = rg.attributes.position, ru = rg.attributes.uv;
  const rmap = new Map();
  for (let j = 0; j < rp.count; j++) {
    const k = key(rp.getX(j), rp.getY(j), rp.getZ(j));
    if (!rmap.has(k)) rmap.set(k, []);
    rmap.get(k).push(j);
  }
  let hit = 0;
  for (const v of survivors) {
    const c = rmap.get(key(sPos.getX(v), sPos.getY(v), sPos.getZ(v)));
    if (c && c.some((j) => Math.abs(ru.getX(j) - sUV.getX(v)) < 1e-3 && Math.abs(ru.getY(j) - sUV.getY(v)) < 1e-3)) hit++;
  }
  console.log(`round-trip fiducial through GLTFLoader: ${hit}/${survivors.length}`);
  if (hit !== survivors.length) throw new Error('the emitted GLB does not reproduce the fiducial');
}
console.log('OK');
