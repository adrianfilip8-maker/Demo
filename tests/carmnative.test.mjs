import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  buildNative, instantiateNative, spliceHeadNative, headFiducial,
  CarmelitaNativeAnim, CLIP_FOR, UNUSED_CLIPS, ONCE, MOUNT_SCALE, CARMELITA_CLIPS_ASSET,
} from '../src/ai/CarmelitaNative.js';
import { GUARD_TUNE } from '../src/ai/Guard.js';

/**
 * The NATIVE Carmelita import — her rig, her weights, her clips. §704.
 *
 * Runs in plain Node for the same reason `carmguard.test.mjs` does: the emitted assets carry no
 * images, so `GLTFLoader.parse` needs no DOM, no WebGL and no network, and the shipped build path
 * — the same `buildNative` the game calls — runs here in milliseconds and needs no capture lock.
 *
 * ── what this suite can say, and what it deliberately does not ──────────────────────────────
 * It can say the character arrives whole, that her skin data crosses the merge UNCHANGED, that
 * the skeleton is her own in her own order, that every clip binds to a bone that exists, that the
 * ground and scale properties `Guard._step` depends on hold, and that the draw and triangle cost
 * is what was claimed.
 *
 * **It cannot say whether she looks right.** That is what `tools/carmsil.mjs` renders and what the
 * committed frames answer.
 *
 * Every data-driven test asserts a non-zero inspected count (§211.1), and the two gates are each
 * exercised in BOTH directions (§418.3) — a gate seen only to pass is not known to be a gate.
 */

const ASSET = 'public/assets/sly-anim/carmelita-guard.glb';
const HEAD = 'public/assets/sly-anim/carmelita-head-lp.glb';
const CLIPS = `public/${CARMELITA_CLIPS_ASSET}`;
const present = existsSync(ASSET) && existsSync(HEAD);

const parse = async (f) => {
  const buf = readFileSync(f);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
};
const firstGeom = (g) => { let h = null; g.scene.traverse((o) => { if (!h && o.isMesh) h = o.geometry; }); return h; };

let NATIVE = null, SCENE = null, HEADGEOM = null, ANIMS = [];
if (present) {
  const gltf = await parse(ASSET);
  SCENE = gltf.scene;
  HEADGEOM = firstGeom(await parse(HEAD));
  NATIVE = buildNative(SCENE, HEADGEOM);
  if (existsSync(CLIPS)) ANIMS = (await parse(CLIPS)).animations || [];
  console.log(`\n[carmnative] ${JSON.stringify(NATIVE.stats)}  ${NATIVE.tris} tris  ${ANIMS.length} clips\n`);
}

const has = (t, fn) => test(t, { skip: present ? false : `${ASSET} is absent` }, fn);

/* ───────────────────────────── the rig is hers ───────────────────────────── */

has('the skeleton is the source\'s own 199 joints, in the source\'s own order, with nothing prepended', () => {
  assert.equal(NATIVE.boneOrder.length, 199, 'the native rig is 199 joints');
  assert.equal(NATIVE.boneSpec.length, 199);
  assert.equal(NATIVE.boneInverses.length, 199);
  /* Read the order straight off the parsed file and demand equality — this is the property that
     makes the merged `skinIndex` values mean what they meant when the artist wrote them, and
     therefore the property §309's off-by-one is the violation of. */
  let skel = null;
  SCENE.traverse((o) => { if (!skel && o.isSkinnedMesh) skel = o.skeleton; });
  assert.deepEqual(NATIVE.boneOrder, skel.bones.map((b) => b.name));
  assert.notEqual(NATIVE.boneOrder[0], 'root', 'nothing is prepended to the native order');
  assert.equal(new Set(NATIVE.boneOrder).size, 199, 'bone names are unique — AnimationMixer binds by name');
});

has('the skin data crosses the merge UNCHANGED — this is what "not modifying them" means', () => {
  const srcByName = new Map();
  SCENE.traverse((o) => { if (o.isSkinnedMesh) srcByName.set(o.name, o); });
  const SI = NATIVE.geometry.getAttribute('skinIndex');
  const SW = NATIVE.geometry.getAttribute('skinWeight');
  let checked = 0, worstW = 0, worstI = 0;
  for (const r of NATIVE.regions) {
    const m = srcByName.get(r.name);
    assert.ok(m, `region ${r.name} has a source mesh`);
    const si = m.geometry.getAttribute('skinIndex'), sw = m.geometry.getAttribute('skinWeight');
    assert.equal(si.count, r.count, `${r.name}: the region length matches the source mesh`);
    for (let j = 0; j < r.count; j++) {
      for (let k = 0; k < 4; k++) {
        worstI = Math.max(worstI, Math.abs(SI.array[(r.start + j) * 4 + k] - si.array[j * 4 + k]));
        worstW = Math.max(worstW, Math.abs(SW.getComponent(r.start + j, k) - sw.getComponent(j, k)));
      }
      checked++;
    }
  }
  assert.ok(checked > 20000, `inspected ${checked} vertices`);
  assert.equal(worstI, 0, 'every skinIndex is the integer the artist wrote');
  assert.equal(worstW, 0, 'every skinWeight is the float the artist wrote');
});

has('the vertices cross unchanged apart from one deliberate base-origin lift', () => {
  const srcByName = new Map();
  SCENE.traverse((o) => { if (o.isSkinnedMesh) srcByName.set(o.name, o); });
  const P = NATIVE.geometry.getAttribute('position');
  let checked = 0, worstXZ = 0, worstY = 0;
  for (const r of NATIVE.regions) {
    const sp = srcByName.get(r.name).geometry.getAttribute('position');
    for (let j = 0; j < r.count; j += 3) {
      const i = r.start + j;
      worstXZ = Math.max(worstXZ, Math.abs(P.getX(i) - sp.getX(j)), Math.abs(P.getZ(i) - sp.getZ(j)));
      worstY = Math.max(worstY, Math.abs((P.getY(i) - NATIVE.soleLift) - sp.getY(j)));
      checked++;
    }
  }
  assert.ok(checked > 5000, `inspected ${checked} vertices`);
  assert.ok(worstXZ < 1e-7, `x and z are untouched (worst ${worstXZ})`);
  assert.ok(worstY < 1e-7, `y differs by exactly the lift and nothing else (worst residual ${worstY})`);
});

/* ───────────────────────── what was cut, and by what rule ───────────────── */

has('the pistol is cut off the ARMATURE and the rule is shown able to reject', () => {
  const s = NATIVE.stats;
  assert.deepEqual(s.droppedProps.slice().sort(),
    ['Antennae003@ShockPistol', 'Barrel@ShockPistol', 'MainBody@ShockPistol'].sort());
  assert.deepEqual(s.droppedInterior.slice().sort(), ['TeethUpper_LowPoly', 'Tongue_LowPoly'].sort());
  /* `Legs` is 96.4% Bone001 / 3.6% Hips_Center — the one mesh that spans two roots, and therefore
     the one that shows the rule can say no. If it were ever dropped the rule has become "drop
     anything touching a helper root", which would take a leg off the character. */
  assert.ok(NATIVE.regions.some((r) => r.name === 'Legs'), 'Legs survives the prop rule');
  assert.ok(s.bodyRoots.includes('Hips_Center'), 'Hips_Center is read as a body root, from the data');
  assert.equal(s.kept, 16);
});

has('the head fiducial gates in BOTH directions', () => {
  let stub = null, hair = null;
  SCENE.traverse((o) => { if (o.name === 'Hair_LP') hair = o.geometry; });
  /* SCENE's Head_LP has already been spliced by the module-level build, so re-parse for the stub. */
  return (async () => {
    const fresh = await parse(ASSET);
    fresh.scene.traverse((o) => { if (o.name === 'Head_LP') stub = o.geometry; });
    assert.equal(stub.index.count, 96, 'the shipped stub is still 32 triangles — the defect this repairs');
    const good = headFiducial(stub, HEADGEOM);
    assert.equal(good.n, 64, 'all 64 surviving vertices are checked');
    assert.ok(good.ok, `the recovered head passes (worst ${good.worst})`);
    assert.ok(good.worst < 1e-6, `and passes by a wide margin (worst ${good.worst})`);
    const bad = headFiducial(stub, hair);
    assert.equal(bad.ok, false, 'Hair_LP substituted for the head is REJECTED');
    assert.ok(bad.worst > 1e-3, `and rejected by a wide margin (worst ${bad.worst})`);
  })();
});

has('the recovered face is actually in the built geometry', () => {
  assert.equal(NATIVE.stats.head.ok, true);
  assert.equal(NATIVE.stats.head.before, 32, 'it replaced the 32-triangle stub');
  assert.equal(NATIVE.stats.head.after, 5000, 'with the 5,000-triangle face');
  const head = NATIVE.regions.find((r) => r.name === 'Head_LP');
  assert.ok(head, 'Head_LP is a region of the merged buffer');
  assert.equal(head.group, 1, 'and it wears the head atlas');
  assert.equal(head.count, 15000);
});

/* ─────────────────────────── mount: scale and ground ────────────────────── */

has('she is base-origin, which is the property Guard._step assigns Y against (§697)', () => {
  NATIVE.geometry.computeBoundingBox();
  const min = NATIVE.geometry.boundingBox.min.y;
  assert.ok(Math.abs(min) < 1e-6, `the lowest vertex sits on the ground plane (${min})`);
  /* The lift is the residual of a source that was already base-origin, not a correction of a
     bug — if it ever grows past a millimetre the source has changed and this must be re-read. */
  assert.ok(Math.abs(NATIVE.soleLift) < 1e-3, `and the lift needed to get there was tiny (${NATIVE.soleLift})`);
});

has('MOUNT_SCALE lands her at the shipped height and is uniform', () => {
  assert.ok(NATIVE.height > 1.6 && NATIVE.height < 1.7, `authored height ${NATIVE.height}`);
  const landed = NATIVE.height * MOUNT_SCALE;
  assert.ok(Math.abs(landed - 1.8163) < 2e-3, `scaled height ${landed} lands on the rebind's 1.8163 m`);
  const mat = new THREE.MeshBasicMaterial();
  const rig = instantiateNative(NATIVE, [mat, mat]);
  const s = rig.rig.scale;
  assert.equal(s.x, s.y, 'uniform');
  assert.equal(s.y, s.z, 'uniform');
  /* The scale must NOT be on `root`: Guard._step owns root.position and GuardAnim owns
     root.scale, and this import is not allowed to take either. */
  assert.equal(rig.root.scale.x, 1, 'root.scale is left alone for GuardAnim');
  assert.equal(rig.root.position.length(), 0, 'root.position is left alone for Guard._step');
});

/* ─────────────────────────────── the cost ──────────────────────────────── */

has('the garrison stays at two draws a guard — the merge is what pays for nine characters', () => {
  assert.equal(NATIVE.geometry.groups.length, 2, 'two groups, two materials');
  assert.equal(NATIVE.stats.kept, 16);
  assert.ok(NATIVE.tris > 30000 && NATIVE.tris < 33000, `${NATIVE.tris} tris a guard`);
  const g = NATIVE.geometry;
  assert.ok(g.groups[0].materialIndex === 0 && (g.groups[1]?.materialIndex ?? 1) === 1);
  /* Every kept mesh landed in exactly one group and the regions tile the buffer with no gap. */
  let off = 0;
  for (const r of NATIVE.regions) { assert.equal(r.start, off, `${r.name} starts where the previous ended`); off += r.count; }
  assert.equal(off, g.getAttribute('position').count, 'the regions cover the whole buffer');
});

/* ──────────────────────────── clips, by NAME ───────────────────────────── */

test('every guard clip name Guard.js asks for is mapped', () => {
  /* Read the names out of the shipped source rather than restating them, so a new state added to
     `_chooseClip` cannot silently fall through to `idle` here. */
  const src = readFileSync('src/ai/Guard.js', 'utf8');
  const asked = new Set();
  for (const m of src.matchAll(/clip = '([a-z_]+)'/g)) asked.add(m[1]);
  for (const m of src.matchAll(/_playOneShot\('([a-z_]+)'\)/g)) asked.add(m[1]);
  for (const m of src.matchAll(/anim\.play\('([a-z_]+)'/g)) asked.add(m[1]);
  assert.ok(asked.size >= 8, `found ${asked.size} clip names in Guard.js: ${[...asked].join(', ')}`);
  for (const name of asked) {
    assert.ok(CLIP_FOR[name], `Guard.js asks for "${name}" and CLIP_FOR maps it`);
  }
});

has('the clip map names only clips that exist, and the unused list is complete', { skip: false }, () => {
  if (!ANIMS.length) return;                       // covered by the presence test below
  const have = new Set(ANIMS.map((c) => c.name));
  for (const [g, srcName] of Object.entries(CLIP_FOR)) {
    assert.ok(have.has(srcName), `${g} → ${srcName} exists in the asset`);
  }
  const reached = new Set(Object.values(CLIP_FOR));
  const unreached = [...have].filter((n) => !reached.has(n)).sort();
  assert.deepEqual(unreached, UNUSED_CLIPS.slice().sort(),
    'UNUSED_CLIPS states exactly which clips no guard state reaches');
});

test('the clips asset is present and carries all eleven, deduplicated', { skip: existsSync(CLIPS) ? false : `${CLIPS} is absent` }, async () => {
  const g = await parse(CLIPS);
  assert.equal(g.animations.length, 11);
  for (const c of g.animations) {
    assert.equal(c.tracks.length, 597, `${c.name} has 199 joints × 3 channels and no duplicates`);
    assert.ok(c.duration > 0, `${c.name} has a duration`);
  }
  /* Shoot(BodyMovement) is the one the source ships doubled; if it ever comes back at 1194 the
     dedupe in tools/carmelita2native.mjs has stopped running. */
  const shoot = g.animations.find((c) => c.name === 'Shoot(BodyMovement)');
  assert.ok(shoot, 'the doubled clip is present');
  assert.equal(new Set(shoot.tracks.map((t) => t.name)).size, 597, 'and every track name is unique');
});

/* ──────────────────────── the driver actually drives ───────────────────── */

has('the mixer binds to her bones and moves them — clip names in, bone motion out', () => {
  if (!ANIMS.length) return;
  const mat = new THREE.MeshBasicMaterial();
  const rig = instantiateNative(NATIVE, [mat, mat]);
  const anim = new CarmelitaNativeAnim(rig, ANIMS, 0);
  assert.deepEqual(anim.missing, [], 'every mapped clip resolved to an action');

  /* Every track must address a bone that exists, or a clip drives nothing and says nothing. */
  const names = new Set(rig.boneList.map((b) => b.name));
  let bound = 0, unbound = 0;
  for (const c of ANIMS) for (const t of c.tracks) (names.has(t.name.split('.')[0]) ? bound++ : unbound++);
  assert.ok(bound > 6000, `inspected ${bound} tracks`);
  assert.equal(unbound, 0, 'no track addresses a bone the rig does not have');

  const watch = ['Hips', 'thighL', 'upper_armR', 'Head'].map((n) => rig.bones[n]).filter(Boolean);
  assert.ok(watch.length >= 3, 'found the joints to watch');
  const before = watch.map((b) => b.quaternion.clone());
  anim.play('walk_patrol', { fade: 0 });
  assert.equal(anim.current, 'walk_patrol');
  for (let i = 0; i < 30; i++) anim.update(1 / 60);
  /* Componentwise, not `angleTo` — see the freeze test for why that function cannot resolve
     anything below ~6e-4 rad on float32 quaternions. A tenth of a degree of real rotation is
     ~1e-3 in a component, so 5e-3 is comfortably above the noise and well below a walk cycle. */
  const delta = (p, q) => Math.max(...['x', 'y', 'z', 'w'].map((k) => Math.abs(p[k] - q[k])));
  const moved = watch.filter((b, i) => delta(b.quaternion, before[i]) > 5e-3).length;
  assert.ok(moved >= 2, `${moved} of ${watch.length} watched joints moved under PatrolWalk`);

  /* The negative arm: a driver with NO clips must not move anything and must not throw. */
  const rig2 = instantiateNative(NATIVE, [mat, mat]);
  const dead = new CarmelitaNativeAnim(rig2, [], 0);
  const b2 = rig2.bones.Hips.quaternion.clone();
  for (let i = 0; i < 30; i++) dead.update(1 / 60);
  assert.ok(delta(rig2.bones.Hips.quaternion, b2) === 0, 'no clips, no motion, no throw');
});

has('one-shot clips report finished; looping ones never do', () => {
  if (!ANIMS.length) return;
  const mat = new THREE.MeshBasicMaterial();
  const anim = new CarmelitaNativeAnim(instantiateNative(NATIVE, [mat, mat]), ANIMS, 0);
  anim.play('alert', { fade: 0, restart: true });
  assert.ok(ONCE.has('alert'));
  let n = 0;
  while (!anim.finished && n < 200) { anim.update(1 / 60); n++; }
  assert.ok(anim.finished, `the one-shot finished after ${n} frames`);
  assert.ok(n > 5 && n < 100, `and took a plausible ${n} frames`);

  anim.play('walk_patrol', { fade: 0, restart: true });
  for (let i = 0; i < 300; i++) anim.update(1 / 60);
  assert.equal(anim.finished, false, 'a looping clip never reports finished');
});

has('freeze holds a deterministic pose, which the capture harness needs', () => {
  if (!ANIMS.length) return;
  const mat = new THREE.MeshBasicMaterial();
  const a = new CarmelitaNativeAnim(instantiateNative(NATIVE, [mat, mat]), ANIMS, 0);
  const b = new CarmelitaNativeAnim(instantiateNative(NATIVE, [mat, mat]), ANIMS, 7.3);
  assert.ok(a.freeze('walk_patrol', 0.4));
  assert.ok(b.freeze('walk_patrol', 0.4));
  for (let i = 0; i < 10; i++) { a.update(1 / 60); b.update(1 / 60); }
  /* Two guards with different seeds, frozen at the same time, must reach the SAME pose — that is
     what makes a captured frame reproducible.
     ── the metric, which had to be changed before it could answer ──────────────────────────────
     This compared `Quaternion.angleTo`, and reported two BIT-IDENTICAL quaternions as 8.7e-4 rad
     apart. `angleTo` is `2·acos(|dot|)`, and near dot = 1 that is `≈ 2·√(2ε)`: float32 components
     carry ε ~ 1e-7, so the noise floor of the metric is ~6e-4 rad no matter what it is given.
     Two freshly built rigs with no driver at all measured 1.2e-3 by it. The metric manufactured
     the divergence; comparing components measures the thing itself. (§439/§440 — sampling is an
     instrument too, and so is the distance function.) */
  let worst = 0, checked = 0;
  for (const n of Object.keys(a.rig.bones)) {
    const x = a.rig.bones[n], y = b.rig.bones[n];
    if (!x || !y) continue;
    checked++;
    for (const k of ['x', 'y', 'z', 'w']) worst = Math.max(worst, Math.abs(x.quaternion[k] - y.quaternion[k]));
    for (const k of ['x', 'y', 'z']) worst = Math.max(worst, Math.abs(x.position[k] - y.position[k]));
  }
  assert.equal(checked, 199, 'every joint compared');
  assert.ok(worst < 1e-6, `frozen poses agree componentwise (worst ${worst})`);
  assert.equal(a.freeze('no_such_clip', 0), false, 'and an unknown clip is refused rather than silently idle');
});

/* ─────────────────────────── the revert, and its bounds ─────────────────── */

test('the arm is revertible in one token and defaults to the shipped rebind', () => {
  assert.equal(GUARD_TUNE.carmelitaNative, 0, 'the shipped default is the RIG3 rebind');
  const src = readFileSync('src/ai/Guard.js', 'utf8');
  assert.match(src, /carm=native/, 'the URL token is documented at its site');
  assert.match(src, /function wantNative\(\)/, 'and read through one function');
  /* §697 is not in this lane. If either constant moves, this test is the tripwire. */
  assert.equal(GUARD_TUNE.groundProbe, 0.06, '§697\'s groundProbe is untouched');
  assert.equal(GUARD_TUNE.groundSlopeMax, 30, '§697\'s groundSlopeMax is untouched');
});

test('the +1 skinIndex remap can never reach the native geometry', () => {
  const src = readFileSync('src/ai/Guard.js', 'utf8');
  assert.match(src, /shiftGuardSkin\(carm\.geometry, skin && !this\.carmelitaNative\)/,
    'the §309 remap is refused on the native arm — there it is a fresh off-by-one, not a fix');
});
