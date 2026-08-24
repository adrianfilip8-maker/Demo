import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  bindToRig3, rig3BindWorld, BONE_MAP, MATERIAL_ATLAS, UNREMAPPED, atlasOf, NO_SOURCE, resolveName,
  CARMELITA_TEX, CARRY, spliceHead,
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

/** `bindToRig3` clones every geometry it touches, so the same parsed scene can be bound twice —
 *  which is what lets §702's falsifier run the OLD carry in-arm instead of describing it. */
const loadScene = () => SCENE;

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
  /* §702 drops the shock pistol — the meshes weighted 100% to the `ShockPistol` armature root,
     which is a SIBLING of the body root rather than a descendant of it. They never reach a
     group, so they are excluded from the census here too, by the same rule and from the same
     place: `stats.dropped`, which the bind reports rather than the test re-deriving. */
  const dropped = new Set(BOUND.stats.dropped || []);
  const kept = meshes.filter((m) => !dropped.has(m.name));
  const head = kept.filter((m) => atlasOf(m.material) === 1).map((m) => m.name);
  const body = kept.filter((m) => atlasOf(m.material) === 0).map((m) => m.name);
  console.log(`[carmguard] head atlas (from the Godot remap): ${head.join(', ')}`);
  console.log(`[carmguard] body ${bodyMeshes} meshes / head ${headMeshes} meshes`
    + `; dropped as prop: ${[...dropped].join(', ') || 'none'} (roots ${(BOUND.stats.droppedRoots || []).join(', ') || '—'})`);

  assert.equal(bodyMeshes + headMeshes, kept.length, 'a mesh went into neither group');
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

/**
 * §702 — the carry translates rigidly, and the OLD carry is shown failing it in-arm.
 *
 * The defect the owner reported ("the sculpt seems off and the head seems to be missing") was in
 * the bind transfer, not in animation: it undid each source bone's bind ROTATION and put none
 * back, so every mapped region came out rotated into its source bone's local frame. It is present
 * at the BIND POSE, so a structural test can see it — the previous suite could not, only because
 * nothing here ever compared the bound shape against the shape it came from.
 *
 * ── choosing a measurable that a rotation cannot slip past ──────────────────────────────────
 * The first version of this test compared bounding-box DIAGONALS and had to be thrown away: an
 * AABB diagonal is nearly rotation-invariant for a compact blob, so it scored the legacy head at
 * 0.609 m against the source's 0.610 m and pronounced it fine while the picture showed it
 * destroyed. That is the §439/§440 shape in miniature — an instrument blind to the exact
 * transform under test — and it is recorded rather than quietly replaced.
 *
 * What actually characterises a translation is that it preserves every INTERNAL offset. So the
 * measurable is the RMS deviation of each region's vertices from a rigid translation of the same
 * region in the source: centre both, difference them. A rotation of any size shows up; a pure
 * translation of any size does not.
 *
 * The strong claim is on the regions whose weights land on a SINGLE target bone. Those cannot
 * blend, so under a translation carry their residual is not "small", it is exactly zero.
 */
test('§702 the carry translates rigidly — single-bone regions move without deforming', () => {
  need();
  const srcPos = new Map();
  SCENE.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    srcPos.set(o.name, g.attributes.position);
  });

  /** RMS/max deviation from a rigid translation, and how many target bones the region touches. */
  const measure = (bound) => {
    const pos = bound.geometry.attributes.position;
    const si = bound.geometry.attributes.skinIndex.array;
    const sw = bound.geometry.attributes.skinWeight.array;
    const ca = new THREE.Vector3(), cb = new THREE.Vector3();
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const out = new Map();
    for (const r of bound.regions) {
      const s = srcPos.get(r.name);
      if (!s || s.count !== r.count) continue;
      const bones = new Set();
      ca.set(0, 0, 0); cb.set(0, 0, 0);
      for (let i = 0; i < r.count; i++) {
        ca.add(a.fromBufferAttribute(s, i));
        cb.add(b.fromBufferAttribute(pos, r.start + i));
        for (let k = 0; k < 4; k++) {
          if (sw[(r.start + i) * 4 + k] > 0) bones.add(si[(r.start + i) * 4 + k]);
        }
      }
      ca.divideScalar(r.count); cb.divideScalar(r.count);
      let sum = 0, mx = 0;
      for (let i = 0; i < r.count; i++) {
        a.fromBufferAttribute(s, i).sub(ca);
        b.fromBufferAttribute(pos, r.start + i).sub(cb);
        const d = a.distanceTo(b);
        sum += d * d; mx = Math.max(mx, d);
      }
      out.set(r.name, { rms: Math.sqrt(sum / r.count), max: mx, bones: bones.size, n: r.count });
    }
    return out;
  };

  const good = measure(BOUND);
  const legacy = bindToRig3(loadScene(), { carry: CARRY.LEGACY });
  const bad = measure(legacy);
  assert.ok(good.size > 10, `measured only ${good.size} regions`);

  const single = [...good.entries()].filter(([, m]) => m.bones === 1);
  const multi = [...good.entries()].filter(([, m]) => m.bones > 1);
  assert.ok(single.length >= 5, `only ${single.length} single-bone regions — the split is not being read`);
  assert.ok(multi.length >= 5, `only ${multi.length} multi-bone regions`);
  console.log(`[carmguard] §702 rigid carry: ${single.length} single-bone regions, `
    + `worst rms ${Math.max(...single.map(([, m]) => m.rms)).toExponential(2)} m; `
    + `${multi.length} blended, worst rms ${Math.max(...multi.map(([, m]) => m.rms)).toFixed(4)} m`);

  for (const [n, m] of single) {
    assert.ok(m.rms < 1e-6,
      `${n} is weighted to one bone yet deviates ${m.rms.toFixed(4)} m rms from a rigid translation`);
  }
  /* Blended regions legitimately stretch where two bones' separation differs between the rigs —
     `Hand` spans shoulder→fingertip and is the largest. Bounded, not zero. */
  for (const [n, m] of multi) {
    assert.ok(m.rms < 0.10, `${n} deviates ${m.rms.toFixed(4)} m rms — more than a joint blend explains`);
  }

  /* §418.3 — the input seen to FAIL, run here rather than described. Under the old carry the
     single-bone regions deform too, which is impossible for any translation. */
  const badSingle = single.map(([n]) => [n, bad.get(n)?.rms ?? 0]).sort((x, y) => y[1] - x[1]);
  console.log(`[carmguard] §702 legacy, the same single-bone regions: `
    + badSingle.slice(0, 4).map(([n, v]) => `${n} ${v.toFixed(3)}`).join(', ') + ' m rms');
  assert.ok(badSingle[0][1] > 0.05,
    'the legacy carry no longer deforms a single-bone region — this check can no longer reject '
    + 'the defect it was written for and is decoration');

  /* the head half of the report, named: `Hair_LP` is 5,546 vertices weighted entirely to `head`,
     so it is the largest region that MUST be rigid, and it is the one the owner was looking at. */
  const hairGood = good.get('Hair_LP'), hairBad = bad.get('Hair_LP');
  console.log(`[carmguard] §702 Hair_LP (${hairGood.n} verts, ${hairGood.bones} bone): `
    + `rebind ${hairGood.rms.toExponential(2)} m rms, legacy ${hairBad.rms.toFixed(4)} m rms `
    + `(max ${hairBad.max.toFixed(3)} m)`);
  assert.equal(hairGood.bones, 1, 'Hair_LP is no longer a single-bone region — re-read this claim');
  assert.ok(hairGood.rms < 1e-6, 'the hair is deformed by the corrected carry');
  assert.ok(hairBad.rms > 0.10, 'the legacy hair was not deformed — the falsifier is not falsifying');
});

test('§702 the shock pistol is dropped by the ARMATURE, and the body is not', () => {
  need();
  const { dropped = [], droppedRoots = [], carry } = BOUND.stats;
  console.log(`[carmguard] carry=${carry} dropped ${dropped.join(', ') || 'none'} `
    + `from root(s) ${droppedRoots.join(', ') || '—'}, soleLift ${BOUND.stats.soleLift} m`);
  assert.equal(carry, CARRY.REBIND, 'the shipped default is no longer the corrected carry');
  assert.deepEqual([...dropped].sort(),
    ['Antennae003', 'Barrel', 'MainBody', 'TeethUpper_LowPoly', 'Tongue_LowPoly'],
    'the dropped set changed — it must be the three shock-pistol meshes and the two sealed '
    + 'mouth-interior meshes, and nothing else');
  assert.deepEqual([...droppedRoots].sort(), ['ShockPistol', 'interior'],
    'a mesh was dropped for a reason other than the pistol prop or the measured mouth interior');
  /* Stomach_LP is the one §698's prose grouped with the mouth and the measurement did not:
     80.8% enclosed against Collar 90.9% and BustRetopo 81.2%, all of them worn. It stays. */
  assert.ok(!dropped.includes('Stomach_LP'),
    'Stomach_LP was cut — tools/carminterior.mjs measures it at 80.8% enclosed, the same band as '
    + 'the collar and the chest piece, so it is not interior geometry');

  /* the input seen to be KEPT: `Legs` carries 3.6% of its weight on the `Hips_Center` helper
     root, which is also not a body root. A rule keyed on "any non-body weight" would eat it. */
  const names = new Set(BOUND.regions.map((r) => r.name));
  assert.ok(names.has('Legs'), 'Legs was dropped — the rule is "100% prop", not "any prop weight"');
  assert.ok(names.has('Shoes') && names.has('Head_LP') && names.has('Hair_LP'),
    'body geometry was dropped by the prop rule');

  /* the pistol is not merely absent from the regions — it is out of the buffer */
  assert.equal(BOUND.regions.length, BOUND.stats.bodyMeshes + BOUND.stats.headMeshes,
    'regions and group counts disagree — a dropped mesh left a region behind');

  /* base origin, which §697's ground work reads */
  BOUND.geometry.computeBoundingBox();
  const minY = BOUND.geometry.boundingBox.min.y;
  console.log(`[carmguard] §702 sole at y ${minY.toFixed(5)} m, crown ${BOUND.geometry.boundingBox.max.y.toFixed(3)} m`);
  assert.ok(Math.abs(minY) < 1e-4, `the sole is at ${minY.toFixed(4)}, not on the rig's ground plane`);

  const legacy = bindToRig3(loadScene(), { carry: CARRY.LEGACY });
  assert.equal((legacy.stats.dropped || []).length, 0, 'the legacy carry must keep the pistol — it is the byte-for-byte revert');
  assert.equal(legacy.tris - BOUND.tris, 1672 + 1024,
    'the dropped mass is not the 1,672-triangle pistol plus the 1,024-triangle mouth interior');
});

/**
 * §702 — the recovered face, and the fiducial that says it is the same head.
 *
 * `Head_LP` ships with a 96-element index: 32 of its 5,000 triangles. The vertex cloud is whole,
 * so every structural check in this file passed while 99.4% of the face went undrawn — which is
 * §699's shape a third time. The repair takes the mesh from the project's own FBX, and the
 * argument that it is the SAME mesh is the 64 vertices that survived the export: they must be
 * present in the recovered head at distance 0 with the same UV. That is checked here, from the
 * committed bytes, so nobody has to re-download 17 MB to believe it.
 */
test('§702 the recovered face is the same head, pinned by the 64 surviving vertices', async () => {
  need();
  const HEAD = 'public/assets/sly-anim/carmelita-head-lp.glb';
  assert.ok(existsSync(HEAD), `${HEAD} is missing — run \`node tools/carmhead.mjs --fbx <…> --write\``);
  const hb = readFileSync(HEAD);
  const hg = await new Promise((res, rej) => new GLTFLoader().parse(
    hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength), '', res, rej));
  let head = null;
  hg.scene.traverse((o) => { if (!head && o.isMesh) head = o.geometry; });
  assert.ok(head, 'the recovered head asset holds no mesh');
  for (const a of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    assert.ok(head.attributes[a], `the recovered head has no ${a} — it could not be bound`);
  }
  const tris = head.index.count / 3;
  console.log(`[carmguard] §702 recovered head: ${head.attributes.position.count} verts, ${tris} tris, `
    + `${(hb.length / 1024).toFixed(0)} kB`);
  assert.ok(tris > 4000, `the recovered head is only ${tris} triangles`);

  /* the stub, as the shipped asset carries it */
  let stub = null;
  SCENE.traverse((o) => { if (o.name === 'Head_LP') stub = o; });
  assert.ok(stub, 'Head_LP is not in the shipped asset');
  SCENE.updateMatrixWorld(true);
  const sg = stub.geometry.clone();
  sg.applyMatrix4(stub.matrixWorld);
  const stubTris = sg.index.count / 3;
  console.log(`[carmguard] §702 the shipped stub draws ${stubTris} triangles from `
    + `${sg.attributes.position.count} vertices`);
  assert.equal(stubTris, 32, 'the shipped Head_LP is no longer the 32-triangle stub — re-read §702');

  /* the fiducial */
  const key = (a, i) => `${a.getX(i).toFixed(5)},${a.getY(i).toFixed(5)},${a.getZ(i).toFixed(5)}`;
  const hp = head.attributes.position, hu = head.attributes.uv;
  const byPos = new Map();
  for (let j = 0; j < hp.count; j++) {
    const k = key(hp, j);
    if (!byPos.has(k)) byPos.set(k, []);
    byPos.get(k).push(j);
  }
  const sp = sg.attributes.position, su = sg.attributes.uv;
  const survivors = [...new Set(Array.from({ length: sg.index.count }, (_, i) => sg.index.getX(i)))];
  let pos = 0, uv = 0;
  for (const v of survivors) {
    const c = byPos.get(key(sp, v));
    if (!c) continue;
    pos++;
    if (c.some((j) => Math.abs(hu.getX(j) - su.getX(v)) < 1e-3 && Math.abs(hu.getY(j) - su.getY(v)) < 1e-3)) uv++;
  }
  console.log(`[carmguard] §702 fiducial: ${pos}/${survivors.length} positions, ${uv}/${survivors.length} UVs`);
  assert.equal(pos, survivors.length,
    'a surviving vertex is not in the recovered head — this is not the same mesh, or the units differ');
  assert.equal(uv, survivors.length,
    'a surviving vertex has a different UV in the recovered head — the v-flip is wrong and her face '
    + 'would sample the wrong half of the atlas');

  /* §418.3 — the check is shown able to reject: shift the recovered head 1 cm and it must fail */
  {
    const moved = head.clone();
    moved.translate(0.01, 0, 0);
    const mp = moved.attributes.position;
    const mset = new Set();
    for (let j = 0; j < mp.count; j++) mset.add(key(mp, j));
    let hit = 0;
    for (const v of survivors) if (mset.has(key(sp, v))) hit++;
    assert.ok(hit < survivors.length,
      'the fiducial still passes on a head displaced by 1 cm — it cannot reject a bad conversion');
    console.log(`[carmguard] §702 falsifier: a head moved 1 cm matches ${hit}/${survivors.length}`);
  }

  /* skinIndex must address the 199-bone source order, unremapped */
  const hsi = head.attributes.skinIndex;
  let maxJ = -1;
  for (let i = 0; i < hsi.count * 4; i++) maxJ = Math.max(maxJ, hsi.array[i]);
  assert.ok(maxJ < 199, `the recovered head indexes bone ${maxJ}, past the 199-joint source rig`);

  /* and the splice itself, through the shipped function */
  const r = spliceHead(SCENE, head);
  console.log(`[carmguard] §702 spliceHead: ${JSON.stringify(r)}`);
  assert.equal(r.ok, true, r.why);
  assert.equal(r.before, 32);
  assert.equal(r.after, tris);
  const rebound = bindToRig3(SCENE);
  console.log(`[carmguard] §702 with the face: ${rebound.tris} tris per guard (was ${BOUND.tris})`);
  assert.equal(rebound.tris - BOUND.tris, tris - 32, 'the spliced head did not reach the bound mesh');
  /* put the scene back so later tests still see the shipped asset */
  stub.geometry = sg.clone().applyMatrix4(new THREE.Matrix4().copy(stub.matrixWorld).invert());
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
  /* §702: the APPENDAGES are excluded for the same reason the bind-pose arms already were —
     they are held out in the reference pose and are not the volume a wall ray is protecting.
     Before §702 no exclusion was needed because the broken carry crumpled both INSIDE the body:
     the tail measured 0.183 m from the axis where the artist put it at 0.941 m. That was the
     defect flattering the check, not the check being right. Both are measured below and the
     tail's real reach is asserted as a BOUND rather than wished away. */
  const APPENDAGE = new Set(['Tail', 'Scrunchy2']);
  const isAppendage = new Uint8Array(pos.count);
  for (const r of BOUND.regions) {
    if (!APPENDAGE.has(r.name)) continue;
    for (let i = r.start; i < r.start + r.count; i++) isAppendage[i] = 1;
  }
  const p = new THREE.Vector3();
  let rTorso = 0, rTail = 0, inspected = 0;
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    const r = Math.hypot(p.x, p.z);
    if (isAppendage[v]) { rTail = Math.max(rTail, r); continue; }
    let armW = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k];
      if (w > 0 && armIdx.has(si[v * 4 + k])) armW += w;
    }
    if (armW >= 0.5) continue;             // bind-pose arms are held out; they are not the body
    rTorso = Math.max(rTorso, r);
    inspected++;
  }
  console.log(`[carmguard] torso radius ${rTorso.toFixed(3)} m (tail/ponytail reach ${rTail.toFixed(3)} m) `
    + `vs shipped temple ${GUARD_TUNE.radius.temple} / heavy ${GUARD_TUNE.radius.heavy}`);
  assert.ok(inspected > 5000, `inspected only ${inspected} torso vertices`);
  assert.ok(rTorso > 0.05, 'measured a torso radius of nearly zero — the instrument is not reading the mesh');
  for (const t of ['temple', 'heavy']) {
    assert.ok(GUARD_TUNE.radius[t] >= rTorso,
      `${t} radius ${GUARD_TUNE.radius[t]} is smaller than the body it now wraps (${rTorso.toFixed(3)} m) — `
      + 'the C1 clearance floor in tests/patrol.test.mjs is derived from it and would be understated');
  }
  /* The stated bound: the fox tail reaches well past the collision radius, so it can pass through
     a wall a guard is walking beside. That is cosmetic and it is the artist's silhouette; growing
     `radius` to cover it would re-derive the §235 route clearances off an appendage. Pinned so
     the exception stays visible and so a tail that quietly collapses again fails here. */
  assert.ok(rTail > GUARD_TUNE.radius.temple,
    'the tail no longer reaches past the collision radius — if it collapsed, the carry regressed');
  assert.ok(rTail < 1.2, `the tail reaches ${rTail.toFixed(3)} m, further than the sculpt has ever been`);
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
