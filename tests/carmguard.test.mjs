import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  bindToRig3, rig3BindWorld, BONE_MAP, MATERIAL_ATLAS, UNREMAPPED, atlasOf, NO_SOURCE, resolveName,
  CARMELITA_TEX,
} from '../src/ai/CarmelitaGuard.js';
import { RIG3 } from '../src/player/SlyModel3.js';
import { GUARD_TUNE } from '../src/ai/Guard.js';
import { ROSTER } from '../src/ai/Patrol.js';

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
 * **It cannot say whether she looks right**, and two things it cannot say are worth naming:
 *
 *   - The split of her two 2048² albedos is no longer a guess. It is transcribed from the source
 *     project's own importer (`Carmelita_Animations7.fbx.import`'s "materials" block → the three
 *     `Carmelita *.tres` → the two PNGs) into `MATERIAL_ATLAS`, and the test below asserts the
 *     bind used it mesh by mesh. §241 recorded this as unrecoverable offline; it was recoverable,
 *     one file up, by the same method `sly-godot/PROVENANCE.md` had already used for Sly.
 *   - The **skinIndex off-by-one is still live** (§309, owner-parked): `instantiate()` prepends
 *     `root` and these indices were built root-less, so every vertex drives from one bone early.
 *     Nothing here fixes that and nothing here should — it is measured, on record, and parked.
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

test('the head/body split follows the source project\'s own material remap', () => {
  need();
  const { bodyMeshes, headMeshes } = BOUND.stats;
  const meshes = [];
  SCENE.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  assert.ok(meshes.length > 0, 'inspected no meshes');

  /* The authority is `Carmelita_Animations7.fbx.import`'s "materials" block, transcribed into
     MATERIAL_ATLAS — see CarmelitaGuard.js's header and sly-anim/PROVENANCE.md. This asserts the
     binding actually USED it, mesh by mesh, so the table cannot be edited without the split
     moving with it. `BustRetopo` is the one that matters: it is `BodyMat`, and the retired
     node-name guess put it in the head group on the strength of the word "Bust". */
  const head = meshes.filter((m) => atlasOf(m.material) === 1).map((m) => m.name);
  const body = meshes.filter((m) => atlasOf(m.material) === 0).map((m) => m.name);
  console.log(`[carmguard] head atlas (from the Godot remap): ${head.join(', ')}`);
  console.log(`[carmguard] body ${bodyMeshes} meshes / head ${headMeshes} meshes`);

  assert.equal(bodyMeshes + headMeshes, meshes.length, 'a mesh went into neither group');
  assert.equal(headMeshes, head.length, 'the bind grouped a different set than MATERIAL_ATLAS names');
  assert.equal(bodyMeshes, body.length, 'the bind grouped a different set than MATERIAL_ATLAS names');
  assert.ok(headMeshes > 0, 'nothing was assigned the head atlas — carmelita-head.png would be unused');
  assert.ok(bodyMeshes > 0, 'nothing was assigned the body atlas');

  assert.ok(head.includes('Head_LP') && head.includes('Hair_LP'),
    'the head and hair are not on the head atlas — the remap transcription has drifted');
  assert.ok(body.includes('BustRetopo'),
    'BustRetopo is BodyMat in Carmelita_Animations7.fbx.import; putting it on the head atlas is '
    + 'the exact error the node-name guess made');

  /* The three the source does NOT remap are the only ones still chosen rather than measured. */
  for (const m of meshes) {
    const n = Array.isArray(m.material) ? m.material[0]?.name : m.material?.name;
    if (UNREMAPPED.includes(n)) {
      assert.equal(atlasOf(m.material), 0, `${m.name} carries unremapped ${n} and belongs to body by the stated fallback`);
    }
  }
});

test('the garrison cost is measured, not assumed', () => {
  need();
  /* Counted off ROSTER rather than written down. The literals were `9 * perGuard + 2 * 1244` and
     `11 * 2` — true until §589 took the two scarab bodies off the level, after which this arm
     went on PRINTING a garrison of 11. It still passed, because the two assertions below are
     both about `perGuard` and neither reads these numbers; the fault was that an arm titled
     "measured, not assumed" was reporting an assumed figure into the log a budget decision gets
     made from. Humanoid types ride the bound Carmelita mesh; the scarab is still procedural at
     1244 tris, so the term stays for the day a scarab is rostered again. */
  const perGuard = BOUND.tris;
  const humanoids = ROSTER.filter((e) => e.type !== 'scarab').length;
  const scarabs = ROSTER.length - humanoids;
  const garrison = humanoids * perGuard + scarabs * 1244;
  const draws = ROSTER.length * 2;
  console.log(`[carmguard] ${perGuard} tris per guard; garrison ${garrison} tris in ${draws} skinned draws`
    + ` (${humanoids} humanoid + ${scarabs} scarab)`);
  console.log(`[carmguard] geometry is SHARED across all ${ROSTER.length} — one upload, per-instance Skeleton only`);
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

test('both albedos are wired, at relative URLs, and the revert token still exists', () => {
  /* §666: a leading slash resolves to the domain root and 404s under this project's `/Demo/`
     page prefix, and it is invisible in dev by construction. `vite.config.js` sets `base: './'`,
     so these must stay relative to match. */
  assert.equal(CARMELITA_TEX.length, 2, 'expected one albedo per merged group');
  for (const url of CARMELITA_TEX) {
    assert.ok(!url.startsWith('/'), `${url} starts with a slash — §666, it would 404 under /Demo/`);
    assert.ok(!/^https?:/i.test(url), `${url} is off-site — the build must stay self-contained`);
    /* `public/` is copied to `dist/` verbatim, so the served path is the file path. */
    const file = new URL(`../public/${url}`, import.meta.url);
    assert.ok(existsSync(file), `${url} is fetched by CarmelitaGuard but not present under public/`);
    const bytes = readFileSync(file);
    assert.ok(bytes.length > 100000, `${url} is ${bytes.length} bytes — that is not a 2048² albedo`);
    /* PNG signature + IHDR, so a truncated or placeholder file fails here rather than in a frame. */
    assert.equal(bytes.readUInt32BE(0), 0x89504e47, `${url} is not a PNG`);
    assert.equal(bytes.readUInt32BE(16), 2048, `${url} is not 2048 wide`);
    assert.equal(bytes.readUInt32BE(20), 2048, `${url} is not 2048 tall`);
    assert.equal(bytes[24], 8, `${url} is not 8-bit — the sibling Sly import had a 16-bit trap`);
  }
  console.log(`[carmguard] albedos wired: ${CARMELITA_TEX.join(', ')}`);

  /* The one-token revert. If this default ever moves, it should move deliberately. */
  assert.equal(GUARD_TUNE.carmelitaTex, 1,
    'carmelitaTex is the default-on switch for her albedos; 0 restores the linen mannequin');
  /* §309 parked the guard MODEL art pass. Texturing is an import completion and must not have
     quietly taken those two gates with it. */
  assert.equal(GUARD_TUNE.guardArt, 0, '§309 parks guardArt at 0 — it must stay parked');
  assert.equal(GUARD_TUNE.guardSkin, 0, '§309 parks guardSkin at 0 — it must stay parked');
});
