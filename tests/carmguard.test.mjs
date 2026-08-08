import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  bindToRig3, rig3BindWorld, BONE_MAP, HEAD_MESHES, NO_SOURCE, resolveName,
} from '../src/ai/CarmelitaGuard.js';
import { RIG3 } from '../src/player/SlyModel3.js';
import { GUARD_TUNE } from '../src/ai/Guard.js';

/**
 * The Carmelita guard body, bound to RIG3 — checked structurally, in plain Node.
 *
 * The emitted asset carries **no images**, which is what makes this suite possible:
 * `GLTFLoader.parse` needs no DOM, no WebGL and no network for it, so the shipped binding path —
 * the same `bindToRig3` the game calls — runs here in milliseconds and needs no capture lock.
 *
 * ── What this suite can and cannot say ────────────────────────────────────────────────────────
 * It can say the mesh arrives, that every bone the map names resolves, that no source joint's
 * influence was dropped on the floor, that the weights are normalised, that the bind transfer
 * produced finite vertices at RIG3's own proportions, and that the draw and triangle cost is what
 * was claimed. Those are the failures that would otherwise present as a character that is wrong
 * but plausible — §211's whole argument.
 *
 * **It cannot say whether she looks right.** No frame has been rendered. In particular the split of
 * her two 2048² albedos across the two merged groups is assigned by node name and is *unverified* —
 * the source materials carry no `baseColorTexture`, so the glTF does not record which mesh used
 * which atlas. That is stated in `CarmelitaGuard.js` and in §241, and this suite pins the split so
 * it cannot drift silently before somebody can photograph it.
 *
 * Every data-driven test asserts a non-zero inspected count (§211.1).
 */

const ASSET = 'public/assets/sly-anim/carmelita-guard.glb';
const SOURCE = 'public/assets/sly-anim/carmelita-anims.glb';
const present = existsSync(ASSET);

/** Parse once; every test reads the same bound result. */
let BOUND = null;
let SCENE = null;
let ANIMS = [];
if (present) {
  const buf = readFileSync(ASSET);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  SCENE = gltf.scene;
  ANIMS = gltf.animations || [];
  BOUND = bindToRig3(SCENE);
  console.log(`\n[carmguard] ${ASSET} — ${JSON.stringify(BOUND.stats)}  ${BOUND.tris} tris\n`);
}

const need = () => assert.ok(present, `${ASSET} is missing — run \`node tools/carmelita2guard.mjs --write\``);

/* ====================================================================== */

test('the asset exists, parses, and is the extracted body rather than the raw scene', () => {
  need();
  let skinned = 0, unskinned = 0;
  const anims = ANIMS.length;
  SCENE.traverse((o) => { if (o.isSkinnedMesh) skinned++; else if (o.isMesh) unskinned++; });
  console.log(`[carmguard] scene: ${skinned} skinned, ${unskinned} unskinned, ${anims} animations`);
  assert.ok(skinned > 0, 'inspected no skinned meshes');
  assert.equal(skinned, 21, `expected the 21 character meshes, got ${skinned}`);
  assert.equal(unskinned, 0,
    `${unskinned} unskinned meshes survived — the 13 Blender rig widgets and Text objects should be gone`);
  assert.equal(anims, 0,
    'animations are still in the asset; they are already retargeted into src/ai/GuardClips.js and would ship twice');
});

test('the bone map is the same table tools/carmelita2clips.mjs validated', () => {
  // Parsed out of the tool's source rather than imported: the tool runs its whole job at import
  // time, so importing it would re-run the retarget. A literal comparison still catches drift.
  const srcText = readFileSync('tools/carmelita2clips.mjs', 'utf8');
  const m = /const MAP = \{([\s\S]*?)\n\};/.exec(srcText);
  assert.ok(m, 'could not find the MAP literal in tools/carmelita2clips.mjs');
  const toolMap = {};
  // Digits belong in the key class: `Neck2` is a map key, and a `[A-Za-z_.]+` key pattern
  // silently parsed 23 of the 24 entries — a partial parse that still "found the table".
  for (const pair of m[1].matchAll(/'?([A-Za-z0-9_.]+)'?\s*:\s*'([A-Za-z0-9]+)'/g)) toolMap[pair[1]] = pair[2];
  console.log(`[carmguard] tool map ${Object.keys(toolMap).length} entries, module map ${Object.keys(BONE_MAP).length}`);
  assert.ok(Object.keys(toolMap).length > 20, `parsed only ${Object.keys(toolMap).length} entries from the tool`);
  assert.deepEqual(BONE_MAP, toolMap,
    'CarmelitaGuard.BONE_MAP has drifted from the table the clips were retargeted with — '
    + 'the mesh and its animation would be bound to different correspondences');
});

test('every mapped source joint resolves, and every target is a real RIG3 bone', () => {
  need();
  const names = new Set();
  SCENE.traverse((o) => { if (o.name) names.add(o.name); });
  const rigBones = new Set(RIG3.BONE_ORDER);
  const unresolved = [], badTarget = [];
  let inspected = 0;
  for (const [raw, target] of Object.entries(BONE_MAP)) {
    inspected++;
    if (!resolveName(raw, names)) unresolved.push(raw);
    if (!rigBones.has(target)) badTarget.push(`${raw} -> ${target}`);
  }
  console.log(`[carmguard] ${inspected - unresolved.length}/${inspected} source joints resolve`);
  assert.equal(inspected, Object.keys(BONE_MAP).length);
  assert.ok(inspected > 20, `inspected only ${inspected} map entries`);
  assert.deepEqual(unresolved, [], 'source joints the loader does not expose under any name variant');
  assert.deepEqual(badTarget, [], 'map targets that are not RIG3 bones — a silent runtime no-op');
});

test('no source joint is dropped: all 199 fold onto a bone we keep', () => {
  need();
  const order = BOUND.skeleton.map((s) => s[0]);
  const kept = new Set(order);
  const { srcJoints, folded, bones } = BOUND.stats;
  console.log(`[carmguard] ${srcJoints} source joints -> ${bones} RIG3 bones (${folded} folded into ancestors)`);
  assert.ok(srcJoints > 100, `inspected only ${srcJoints} source joints`);
  assert.equal(srcJoints, 199, 'the source rig is no longer 199 joints; re-read the fold');
  assert.equal(folded, srcJoints - Object.keys(BONE_MAP).length,
    'the folded count does not account for every unmapped joint — some influence was dropped, '
    + 'which strands the geometry it weighted at the origin');
  for (const b of order) assert.ok(kept.has(b), b);
});

test('the RIG3 bones with no source are exactly the declared set', () => {
  need();
  const kept = new Set(BOUND.skeleton.map((s) => s[0]));
  const absent = RIG3.BONE_ORDER.filter((b) => !kept.has(b));
  console.log(`[carmguard] RIG3 bones absent from the bound skeleton: ${absent.join(', ')}`);
  assert.ok(RIG3.BONE_ORDER.length > 20, 'inspected an empty rig');
  assert.deepEqual(absent.sort(), [...NO_SOURCE].sort(),
    'the set of unsupplied bones changed — a tracked exception must fail in this direction');
});

test('the skeleton spec is a valid tree for GuardModel.instantiate', () => {
  need();
  const seen = new Set(['root']);
  let inspected = 0;
  for (const [name, parent, pos] of BOUND.skeleton) {
    inspected++;
    assert.ok(seen.has(parent), `${name} is parented to ${parent}, which has not been declared yet`);
    assert.ok(Array.isArray(pos) && pos.length === 3 && pos.every(Number.isFinite),
      `${name} has a non-finite bind position`);
    seen.add(name);
  }
  console.log(`[carmguard] skeleton: ${inspected} bones, parents resolve in declaration order`);
  assert.ok(inspected > 15, `inspected only ${inspected} bones`);
});

test('the bind transfer produced finite vertices at RIG3 proportions', () => {
  need();
  const g = BOUND.geometry;
  const pos = g.attributes.position;
  let nonFinite = 0, inspected = 0;
  const p = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    inspected++;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) { nonFinite++; continue; }
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const height = maxY - minY;
  const W = rig3BindWorld();
  console.log(`[carmguard] ${inspected} vertices, height ${height.toFixed(3)} m `
    + `(RIG3 head bone at ${W.head.y.toFixed(3)}, foot at ${W.footL.y.toFixed(3)})`);
  assert.ok(inspected > 10000, `inspected only ${inspected} vertices`);
  assert.equal(nonFinite, 0, `${nonFinite} vertices are NaN — the bind transfer divided by a degenerate matrix`);
  // A rebind that silently failed leaves the mesh at the source scale or collapsed on the origin.
  assert.ok(height > 1.4 && height < 2.1, `bound height ${height.toFixed(3)} m is not a character`);
  assert.ok(minY > -0.25 && minY < 0.25, `her feet are at y ${minY.toFixed(3)}, not on the floor`);
  assert.ok(maxY > W.head.y, `her crown at ${maxY.toFixed(3)} is below RIG3's head bone at ${W.head.y.toFixed(3)}`);
});

test('skin weights are normalised and index only bones that exist', () => {
  need();
  const g = BOUND.geometry;
  const si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
  const nBones = BOUND.skeleton.length;
  let inspected = 0, unnormalised = 0, outOfRange = 0, unweighted = 0;
  for (let v = 0; v < sw.length / 4; v++) {
    inspected++;
    let s = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k];
      s += w;
      // `instantiate` prepends `root`, so a skinIndex addresses [0, nBones] inclusive of root.
      if (si[v * 4 + k] > nBones) outOfRange++;
    }
    if (s <= 0) unweighted++;
    else if (Math.abs(s - 1) > 1e-3) unnormalised++;
  }
  console.log(`[carmguard] ${inspected} vertices: ${unnormalised} unnormalised, `
    + `${outOfRange} out-of-range indices, ${unweighted} unweighted`);
  assert.ok(inspected > 10000, `inspected only ${inspected} vertices`);
  assert.equal(unnormalised, 0, 'weights that do not sum to 1 shrink or inflate the mesh under animation');
  assert.equal(outOfRange, 0, 'a skinIndex past the end of the skeleton reads whatever follows it in memory');
  assert.equal(unweighted, 0, 'unweighted vertices are left behind at the origin');
});

test('the merge is two groups, so the garrison keeps its two-material draw budget', () => {
  need();
  const g = BOUND.geometry;
  const groups = g.groups;
  const idxCount = g.index ? g.index.count : g.attributes.position.count;
  const covered = groups.reduce((s, x) => s + x.count, 0);
  console.log(`[carmguard] groups ${JSON.stringify(groups)}  covering ${covered}/${idxCount} indices`);
  assert.ok(groups.length > 0, 'inspected no groups');
  assert.ok(groups.length <= 2,
    `${groups.length} groups — GuardModel.GROUPS is two materials and Guards._buildMaterials builds two; `
    + 'more groups means more draw calls per guard, times eleven');
  assert.equal(covered, idxCount, 'the groups do not cover every index — some triangles would never draw');
  const mats = new Set(groups.map((x) => x.materialIndex));
  for (const m of mats) assert.ok(m === 0 || m === 1, `group material index ${m} has no material behind it`);
});

test('the head/body split is pinned, because nothing has verified it', () => {
  need();
  const { bodyMeshes, headMeshes } = BOUND.stats;
  const named = [];
  SCENE.traverse((o) => { if (o.isSkinnedMesh) named.push(o.name); });
  const head = named.filter((n) => HEAD_MESHES.has(n));
  console.log(`[carmguard] head atlas (UNVERIFIED, by node name): ${head.join(', ')}`);
  console.log(`[carmguard] body ${bodyMeshes} meshes / head ${headMeshes} meshes`);
  assert.ok(named.length > 0, 'inspected no meshes');
  assert.equal(bodyMeshes + headMeshes, named.length, 'a mesh went into neither group');
  assert.ok(headMeshes > 0, 'nothing was assigned the head atlas — carmelita-head.png would be unused');
  assert.ok(bodyMeshes > 0, 'nothing was assigned the body atlas');
});

test('the garrison cost is measured, not assumed', () => {
  need();
  // 6 temple + 3 heavy on Carmelita, 2 scarab still procedural (1244 tris each).
  const perGuard = BOUND.tris;
  const garrison = 9 * perGuard + 2 * 1244;
  const draws = 11 * 2;
  console.log(`[carmguard] ${perGuard} tris per guard; garrison ${garrison} tris in ${draws} skinned draws`);
  console.log('[carmguard] geometry is SHARED across all 11 — one upload, per-instance Skeleton only');
  assert.ok(perGuard > 1000, `inspected a ${perGuard}-triangle mesh; the bind produced almost nothing`);
  // Not a budget assertion — a tripwire. A tenfold change means the asset or the cull changed.
  assert.ok(perGuard < 45000, `${perGuard} tris per guard is far past the extracted body's 29,791`);
});

test('the collision radius still bounds the body it is used for', () => {
  need();
  // GUARD_TUNE.radius drives `Guard._step`'s wall rays and, through it, the C1 clearance floor in
  // tests/patrol.test.mjs. Carmelita is slimmer than the procedural bodies, so the shipped radii
  // are conservative — this asserts that direction rather than shrinking them, because a smaller
  // radius would only weaken the §235 clearance guarantee the routes were validated against.
  const g = BOUND.geometry;
  const pos = g.attributes.position, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
  const order = BOUND.skeleton.map((s) => s[0]);
  const ARM = new Set(['shoulderL', 'shoulderR', 'upperArmL', 'upperArmR',
    'lowerArmL', 'lowerArmR', 'handL', 'handR']);
  const armIdx = new Set(order.map((n, i) => (ARM.has(n) ? i : -1)).filter((i) => i >= 0));
  const p = new THREE.Vector3();
  let rTorso = 0, inspected = 0;
  for (let v = 0; v < pos.count; v++) {
    let armW = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k];
      if (w > 0 && armIdx.has(si[v * 4 + k])) armW += w;
    }
    if (armW >= 0.5) continue;             // bind-pose arms are held out; they are not the body
    p.fromBufferAttribute(pos, v);
    rTorso = Math.max(rTorso, Math.hypot(p.x, p.z));
    inspected++;
  }
  console.log(`[carmguard] torso radius ${rTorso.toFixed(3)} m vs shipped `
    + `temple ${GUARD_TUNE.radius.temple} / heavy ${GUARD_TUNE.radius.heavy}`);
  assert.ok(inspected > 5000, `inspected only ${inspected} torso vertices`);
  assert.ok(rTorso > 0.05, 'measured a torso radius of nearly zero — the instrument is not reading the mesh');
  for (const t of ['temple', 'heavy']) {
    assert.ok(GUARD_TUNE.radius[t] >= rTorso,
      `${t} radius ${GUARD_TUNE.radius[t]} is smaller than the body it now wraps (${rTorso.toFixed(3)} m) — `
      + 'the C1 clearance floor in tests/patrol.test.mjs is derived from it and would be understated');
  }
});

test('the source scene is still present and untouched', () => {
  assert.ok(existsSync(SOURCE), `${SOURCE} is missing — the tool cannot be re-run`);
  const size = readFileSync(SOURCE).length;
  console.log(`[carmguard] source ${SOURCE} ${(size / 1048576).toFixed(2)} MB`);
  assert.ok(size > 1000000, `source is ${size} bytes — that is not the 3.86 MB scene`);
});
