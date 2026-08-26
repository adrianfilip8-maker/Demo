import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  buildNative, instantiateNative, spliceHeadNative, headFiducial,
  CarmelitaNativeAnim, CLIP_FOR, CLIP_FOR_ARMED, clipMapFor, UNUSED_CLIPS, ONCE, MOUNT_SCALE,
  CARMELITA_CLIPS_ASSET, splicePistolNative, muzzleFromBarrel, PISTOL_MESHES, unusedClips,
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

test('the native arm is the SHIPPED DEFAULT and is revertible in one token', () => {
  /* The owner asked for the source rig and animations. A default of 0 would have meant that
     anyone who opened the build saw the rebind, and the answer to "did you do it" would be no. */
  assert.equal(GUARD_TUNE.carmelitaNative, 1, 'the shipped default is her NATIVE rig');
  /* §709 turned the pistol on. It fits now because it is 385 triangles and is drawn once, not
     1,672 drawn twice — see `the pistol fits, and the arithmetic that says so` below. */
  assert.equal(GUARD_TUNE.carmelitaPistol, 1, 'and §709 turned the pistol on');
  assert.equal(GUARD_TUNE.carmelitaPistolInk, 0, 'with its ink shell off — that halving is what pays for it');
  const src = readFileSync('src/ai/Guard.js', 'utf8');
  assert.match(src, /carm=rebind/, 'the revert token is documented at its site');
  assert.match(src, /function wantNative\(\)/, 'and read through one function');
  /* The rebind must still BUILD, or "revertible" is a word rather than a path. */
  assert.match(src, /loadCarmelitaGuard\(undefined, \{/, 'the rebind loader is still called');
  assert.match(src, /falling back to the RIG3 rebind/, 'and is the documented fallback');
  /* §697 is not in this lane. If either constant moves, this test is the tripwire. */
  assert.equal(GUARD_TUNE.groundProbe, 0.06, '§697\'s groundProbe is untouched');
  assert.equal(GUARD_TUNE.groundSlopeMax, 30, '§697\'s groundSlopeMax is untouched');
});

test('the +1 skinIndex remap can never reach the native geometry', () => {
  const src = readFileSync('src/ai/Guard.js', 'utf8');
  assert.match(src, /shiftGuardSkin\(carm\.geometry, skin && !this\.carmelitaNative\)/,
    'the §309 remap is refused on the native arm — there it is a fresh off-by-one, not a fix');
});

/* ───────────────── the weapon stances, and the pistol that pays for them ───────────────── */

has('the armed clips are identified by MEASUREMENT, not by their names', () => {
  if (!ANIMS.length) return;
  /* Pose the SOURCE skeleton with its own clips and measure how far apart her hands end up.
     A two-handed weapon stance closes them to ~8.6 cm; arms at the sides or swinging do not.
     This is the discriminator that says `PatrolWalk` is a sneak around a gun and
     `CasualWalking` is the upright walk a garrison wants — a claim no clip NAME can settle. */
  return (async () => {
    const fresh = await parse(ASSET);
    let skel = null;
    fresh.scene.traverse((o) => { if (!skel && o.isSkinnedMesh) skel = o.skeleton; });
    const by = new Map(skel.bones.map((b) => [b.name, b]));
    const rest = skel.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
    const reset = () => skel.bones.forEach((b, i) => {
      b.position.copy(rest[i].p); b.quaternion.copy(rest[i].q); b.scale.copy(rest[i].s);
    });
    const handGap = (name, t) => {
      reset();
      const clip = ANIMS.find((c) => c.name === name);
      const mx = new THREE.AnimationMixer(fresh.scene);
      mx.clipAction(clip).play(); mx.setTime(t);
      fresh.scene.updateMatrixWorld(true);
      const l = new THREE.Vector3().setFromMatrixPosition(by.get('HandL').matrixWorld);
      const r = new THREE.Vector3().setFromMatrixPosition(by.get('HandR').matrixWorld);
      mx.stopAllAction(); mx.uncacheRoot(fresh.scene);
      return l.distanceTo(r);
    };
    const armed = ['Idle', 'Lookaround', 'PatrolWalk', 'Shoot(BodyMovement)'];
    for (const n of armed) {
      const d = handGap(n, 0);
      assert.ok(d < 0.15, `${n} is a two-handed stance — hands ${d.toFixed(3)} m apart`);
    }
    /* The other arm (§418.3): the clips actually used for locomotion must NOT be armed, or the
       discriminator is measuring something every clip has. */
    for (const n of ['CasualWalking', 'Run']) {
      const d = handGap(n, 0);
      assert.ok(d > 0.30, `${n} is NOT a two-handed stance — hands ${d.toFixed(3)} m apart`);
    }
    /* And the map follows the measurement rather than the names. */
    assert.equal(CLIP_FOR.walk_patrol, 'CasualWalking', 'the patrol walk is the UPRIGHT clip');
    assert.equal(CLIP_FOR.run_chase, 'Run');
    assert.ok(UNUSED_CLIPS.includes('PatrolWalk'),
      'the clip NAMED PatrolWalk is unused on the unarmed build, and that is stated');
  })();
});

has('the pistol is its OWN buffer, and the body is byte-for-byte what it was unarmed', () => {
  const bare = buildNative(SCENE, null);
  assert.equal(bare.stats.armed, false);
  assert.equal(bare.pistol, null, 'unarmed there is no pistol at all');
  assert.ok(bare.stats.propTris > 1600 && bare.stats.propTris < 1700,
    `the full-resolution pistol is ${bare.stats.propTris} triangles a guard`);

  const fresh = buildNative(SCENE, null, { pistol: true });
  assert.equal(fresh.stats.armed, true);
  /* §709's structural claim, and the one everything else rests on: arming adds a SECOND
     geometry and does not touch the first. Merged in, the pistol would ride the body's ink
     shell and be drawn twice. */
  assert.equal(fresh.stats.kept, bare.stats.kept, 'the body keeps exactly the meshes it kept unarmed');
  assert.equal(fresh.tris, bare.tris, 'and the body buffer costs exactly what it cost unarmed');
  assert.equal(fresh.geometry.attributes.position.count, bare.geometry.attributes.position.count);
  for (const n of ['MainBody', 'Barrel', 'Antennae003']) {
    assert.ok(!fresh.regions.some((r) => r.name === n), `${n} is NOT in the body buffer`);
    assert.ok(fresh.pistol.regions.some((r) => r.name === n), `${n} IS in the pistol buffer`);
  }
  assert.equal(fresh.pistol.tris, bare.stats.propTris, 'the pistol buffer is exactly the pistol');
  assert.deepEqual(fresh.pistol.atlases, [0], 'all three sit on the BODY atlas — one group, one draw');
  assert.equal(fresh.pistol.geometry.groups.length, 1);

  /* The ground property §697 depends on must not move. At bind the pistol parks beside her hip,
     reaching neither below her soles nor above her head — measured, not assumed. */
  assert.equal(fresh.height, bare.height, 'arming does not change her drawn height');
  assert.equal(fresh.soleLift, bare.soleLift, 'nor the sole lift `Guard._step` grounds on');

  /* Armed, the patrol walk goes back to the clip named for it. */
  assert.equal(clipMapFor(true).walk_patrol, 'PatrolWalk');
  assert.equal(clipMapFor(false).walk_patrol, 'CasualWalking');
  assert.equal(CLIP_FOR_ARMED.run_chase, CLIP_FOR.run_chase, 'and nothing else changes');
});

/* ───────────────────────────── §709: the pistol fits ─────────────────────── */

const PISTOL_LP = 'public/assets/sly-anim/carmelita-pistol-lp.glb';
const hasLP = existsSync(PISTOL_LP);
const lp = (t, fn) => test(t, { skip: (present && hasLP) ? false : `${PISTOL_LP} is absent` }, fn);

lp('the low-poly pistol splices, and the gate is shown able to REFUSE (§418.3)', async () => {
  const geos = {};
  (await parse(PISTOL_LP)).scene.traverse((o) => { if (o.isMesh && PISTOL_MESHES.includes(o.name)) geos[o.name] = o.geometry; });
  assert.equal(Object.keys(geos).length, 3, 'the baked asset carries all three meshes');

  /* PASSES on: the committed asset. */
  const scene = (await parse(ASSET)).scene;
  const ok = splicePistolNative(scene, geos);
  assert.equal(ok.ok, true, ok.why);
  assert.equal(ok.before, 1672, 'the full-resolution pistol is 1,672 triangles');
  assert.equal(ok.after, 385, 'and the shipped one is 385');

  /* FAILS on: a replacement that addresses a joint the original never did. This is the failure
     with no other symptom — it binds, it draws, and the gun is somewhere else on the rig. */
  const wrongScene = (await parse(ASSET)).scene;
  const wrong = { ...geos };
  const bad = geos.Barrel.clone();
  const si = bad.attributes.skinIndex;
  si.array[0] = 7;                       // a body joint, not one of the pistol's four
  wrong.Barrel = bad;
  const refused = splicePistolNative(wrongScene, wrong);
  assert.equal(refused.ok, false, 'a replacement addressing a foreign joint must be refused');
  assert.match(refused.why, /Barrel/, 'and the refusal names the mesh');
  /* and refusing must leave NOTHING half-swapped — a low-poly MainBody beside a full Barrel is
     a worse state than either whole one */
  let stillFull = 0;
  wrongScene.traverse((o) => { if (o.isMesh && PISTOL_MESHES.includes(o.name)) stillFull += o.geometry.index.count / 3; });
  assert.equal(stillFull, 1672, 'a refused splice writes nothing at all');

  /* FAILS on: nothing supplied. */
  assert.equal(splicePistolNative((await parse(ASSET)).scene, null).ok, false);
});

lp('the pistol fits, and the arithmetic that says so is here rather than in a comment', async () => {
  const scene = (await parse(ASSET)).scene;
  const geos = {};
  (await parse(PISTOL_LP)).scene.traverse((o) => { if (o.isMesh && PISTOL_MESHES.includes(o.name)) geos[o.name] = o.geometry; });
  splicePistolNative(scene, geos);
  const armed = buildNative(scene, null, { pistol: true });
  assert.equal(armed.pistol.tris, 385);

  /* `tools/budgetattrib.mjs --inpage`, the commit before §709: 1,192,970 of a 1,200,000 cap.
     These four rows are the decision, and three of them do not fit. */
  const BASE = 1192970, CAP = 1200000, GUARDS = 9;
  const full = 1672;
  assert.ok(BASE + full * GUARDS * 2 > CAP, 'the full pistol, shelled, is over the cap');
  assert.ok(BASE + full * GUARDS > CAP,
    'and the full pistol drawn ONCE is STILL over it — dropping the shell alone was never enough');
  assert.ok(BASE + armed.pistol.tris * GUARDS * 2 < CAP,
    'decimated and shelled would just fit, at 99.99% — no margin for anything else');
  const shipped = BASE + armed.pistol.tris * GUARDS;
  assert.ok(shipped < CAP, 'decimated and drawn once fits');
  assert.ok(shipped / CAP < 0.998, `and lands at ${(100 * shipped / CAP).toFixed(2)}% with room in hand`);
});

lp('the muzzle is derived in the BONE\'s frame, and the derivation refuses when it cannot decide', async () => {
  const scene = (await parse(ASSET)).scene;
  const built = buildNative(scene, null, { pistol: true });
  const m = built.pistol.muzzle;
  assert.equal(m.ok, true, m.why);
  assert.equal(m.bone, 'ShockPistolbarrel');
  assert.ok(m.share > 0.999, 'the barrel is 100% weighted to that one bone — which is what makes a single-bone frame legitimate');
  assert.ok(m.discriminates, `the trigger rule decides by ${(m.margin * 100).toFixed(1)}%`);
  assert.ok(m.dTriggerMuzzle > m.dTriggerBreech, 'the muzzle is the end further from the trigger');
  assert.ok(Math.abs(m.extent - 0.1767) < 0.002, `the barrel is ${(m.extent * 1000).toFixed(1)} mm long`);

  /* §442, as an assertion rather than a note. The muzzle is a BIND-LOCAL point, so it must NOT
     be anywhere near the world position the pistol parks at — that parked spot is 0.93 m out to
     her side, and a "muzzle" baked as a world offset would sit there and look plausible. */
  assert.ok(Math.hypot(...m.local) < 0.2,
    `the muzzle is a local offset (|${m.local.map((v) => v.toFixed(3))}| = ${Math.hypot(...m.local).toFixed(3)} m), `
    + 'not a baked world position');

  /* FAILS on: a barrel whose weights are spread, where a single-bone frame would not track it. */
  const bad = (await parse(ASSET)).scene;
  bad.updateMatrixWorld(true);
  let b = null;
  bad.traverse((o) => { if (o.isSkinnedMesh && o.name === 'Barrel') b = o; });
  const g = b.geometry.clone();
  const sw = g.attributes.skinWeight;
  for (let i = 0; i < sw.count; i++) { sw.setX(i, 0.5); sw.setY(i, 0.5); }
  const si = g.attributes.skinIndex;
  for (let i = 0; i < si.count; i++) si.setY(i, 0);
  b.geometry = g;
  const refused = muzzleFromBarrel(bad, built.boneOrder, built.boneInverses);
  assert.equal(refused.ok, false, 'a barrel that is not single-bone must be refused');
  assert.match(refused.why, /weighted/);

  /* FAILS on: no barrel at all. */
  const gone = (await parse(ASSET)).scene;
  gone.traverse((o) => { if (o.isSkinnedMesh && o.name === 'Barrel') o.name = 'NotTheBarrel'; });
  assert.equal(muzzleFromBarrel(gone, built.boneOrder, built.boneInverses).ok, false);
});

lp('the pistol\'s culling sphere covers where the CLIPS carry it, not where the bind pose parks it', async () => {
  /* three never recomputes a `SkinnedMesh`'s bounding sphere, so it is fitted to the BIND pose —
     and the pistol's bind pose is 0.93 m out to her side, nowhere near where any clip holds it.
     A sphere sized to the pistol would therefore cull the gun out of frame mid-animation, which
     is a bug that only appears in motion. It is sized off the BODY instead, and this is the
     assertion that says so with driven numbers rather than with the argument. */
  const scene = (await parse(ASSET)).scene;
  const geos = {};
  (await parse(PISTOL_LP)).scene.traverse((o) => { if (o.isMesh && PISTOL_MESHES.includes(o.name)) geos[o.name] = o.geometry; });
  splicePistolNative(scene, geos);
  const built = buildNative(scene, null, { pistol: true });
  const inst = instantiateNative(built, [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]);
  inst.root.updateMatrixWorld(true);
  assert.ok(inst.pistolMesh, 'the armed rig has a pistol mesh');
  if (!ANIMS.length) return;

  const mixer = new THREE.AnimationMixer(inst.rig);
  const reach = (mesh) => {
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 120));
    const inv = new THREE.Matrix4(), v = new THREE.Vector3();
    let worst = 0, n = 0;
    for (const c of ANIMS) {
      mixer.stopAllAction();
      mixer.clipAction(c).reset().play();
      for (let i = 0; i < 8; i++) {
        mixer.setTime(c.duration * i / 8);
        inst.rig.updateMatrixWorld(true);
        inv.copy(mesh.matrixWorld).invert();
        for (let k = 0; k < pos.count; k += step) {
          v.fromBufferAttribute(pos, k); mesh.applyBoneTransform(k, v); mesh.localToWorld(v); v.applyMatrix4(inv);
          worst = Math.max(worst, v.distanceTo(mesh.boundingSphere.center)); n++;
        }
      }
    }
    return { worst, n };
  };
  const p = reach(inst.pistolMesh);
  assert.ok(p.n > 1000, `inspected ${p.n} driven pistol vertices`);   // §211.1
  assert.ok(p.worst <= inst.pistolMesh.boundingSphere.radius,
    `the driven pistol reaches ${p.worst.toFixed(3)} m from its sphere centre against a `
    + `${inst.pistolMesh.boundingSphere.radius.toFixed(3)} m radius — it would pop out of frame`);
  /* and the control: the pistol must not be scraping by on a margin the body would fail on */
  const b = reach(inst.mesh);
  assert.ok(inst.pistolMesh.boundingSphere.radius - p.worst
    >= (inst.mesh.boundingSphere.radius - b.worst) * 0.9,
    'the pistol\'s margin is no worse than the body\'s');
});

has('arming makes PatrolWalk reachable and CasualWalking unreachable — the swap, both ways', () => {
  const all = ANIMS.map((c) => c.name);
  assert.ok(all.length >= 11, `${all.length} clips inspected`);            // §211.1
  const un = unusedClips(false, all), ar = unusedClips(true, all);
  /* The historical constant is exactly the UNARMED answer — which is what it always described,
     and now says so. This is the assertion that keeps the two from drifting. */
  assert.deepEqual(un.slice().sort(), UNUSED_CLIPS.slice().sort(),
    'unusedClips(false) reproduces the UNUSED_CLIPS constant');
  assert.ok(un.includes('PatrolWalk'), 'unarmed, the clip NAMED PatrolWalk is unused');
  assert.ok(!ar.includes('PatrolWalk'), 'armed, it is what a guard patrols in');
  assert.ok(!un.includes('CasualWalking'), 'unarmed, CasualWalking is the walk');
  assert.ok(ar.includes('CasualWalking'), 'armed, nothing plays it at all');
  /* Everything else must be identical, or arming changed more than the walk. */
  const other = (a) => a.filter((n) => n !== 'PatrolWalk' && n !== 'CasualWalking').sort();
  assert.deepEqual(other(un), other(ar), 'arming changes the walk clips and nothing else');
});

test('the pistol token is on, and both halves of what pays for it are documented at the site', () => {
  assert.equal(GUARD_TUNE.carmelitaPistol, 1);
  assert.equal(GUARD_TUNE.carmelitaPistolInk, 0);
  const src = readFileSync('src/ai/Guard.js', 'utf8');
  assert.match(src, /carmpistol/, 'the URL token is there');
  assert.match(src, /30,096/, 'the cost that kept it off is stated where the decision is made');
  assert.match(src, /1,196,435/, 'and so is where turning it on lands');
  /* The crouch is a VISIBLE consequence of arming and must be stated, not discovered. */
  assert.match(src, /1\.508 m/, 'PatrolWalk\'s drawn height is on record at the token');
  assert.match(src, /1\.768 m/, 'and so is the CasualWalking height it replaces');
});

test('_coneApex rides the bone when there is a muzzle, and IS _eyePosition when there is not', async () => {
  /* A grep proving `_updateCones` calls `_coneApex` proves the wiring, not the behaviour. This
     drives the method on real `Guard` instances, in both directions (§418.3).
     Headless, `loadCarmelitaNative` returns null and the garrison falls back to procedural
     bodies, so every guard here has `pistolMesh === null` — which is exactly the fallback leg
     that protects the scarab, the rebind arm and `?carmpistol=0`. The muzzle leg is driven by
     giving one guard a bone and a local offset, because that is all the method reads. */
  const { Guards } = await import('../src/ai/Guard.js');
  const engine = {
    quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
    settings: { shadowCascades: 3, shadowMap: 3072 },
    warn: () => {}, has: () => false, get: () => null,
    on: () => () => {}, emit: () => {}, registerCollider: () => {},
  };
  const gs = new Guards(engine, null);
  await gs.init?.();
  assert.ok(gs.guards.length >= 9, `${gs.guards.length} guards built`);          // §211.1

  /* FALLBACK LEG: no pistol anywhere, so the apex must be the eye, exactly. */
  let checked = 0;
  for (const g of gs.guards) {
    assert.equal(g.pistolMesh, null, `${g.id} has no pistol headless`);
    assert.equal(g.muzzleBone, null);
    const apex = g._coneApex(new THREE.Vector3());
    const eye = g._eyePosition(new THREE.Vector3());
    assert.deepEqual(apex.toArray(), eye.toArray(), `${g.id}: with no pistol the apex IS the eye`);
    checked++;
  }
  assert.equal(checked, gs.guards.length);

  /* MUZZLE LEG: a bone with a known world matrix and a known local offset. */
  const g0 = gs.guards[0];
  const eyeBefore = g0._eyePosition(new THREE.Vector3()).clone();
  const bone = new THREE.Object3D();
  bone.position.set(3, 5, 7);
  bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  bone.updateMatrixWorld(true);
  g0.muzzleBone = bone;
  g0.muzzleLocal = new THREE.Vector3(0, 0.08432, -0.07882);
  const want = g0.muzzleLocal.clone().applyMatrix4(bone.matrixWorld);
  const got = g0._coneApex(new THREE.Vector3());
  assert.ok(got.distanceTo(want) < 1e-9,
    `the apex is the local offset through the bone's world matrix (${got.toArray()} vs ${want.toArray()})`);
  assert.ok(got.distanceTo(eyeBefore) > 1,
    'and it is nowhere near the head-bone eye — otherwise this test could not tell the two legs apart');

  /* A bone whose matrix has gone non-finite must fall back rather than emit NaN into the beam. */
  bone.matrixWorld.elements[12] = NaN;
  const back = g0._coneApex(new THREE.Vector3());
  assert.ok(Number.isFinite(back.x) && Number.isFinite(back.y) && Number.isFinite(back.z),
    'a non-finite bone matrix falls back to the eye instead of producing a NaN apex');
});

test('the cone apex moved and the SENSING eye did not — the alert ladder is untouched', () => {
  const src = readFileSync('src/ai/Guard.js', 'utf8');
  /* The one line that decides scope. `sense.eye` feeds `Senses.evaluate`, which is the ladder. */
  assert.match(src, /sense\.eye = this\._eyePosition\(_eye\)/,
    'detection still reads _eyePosition, not the muzzle');
  assert.match(src, /g\._coneApex\(_eye\)/, 'and the drawn cone reads _coneApex');
  assert.match(src, /_coneApex\(out\) \{/, 'which exists');
  /* `_coneApex` must fall back, or a scarab and the rebind arm lose their cone entirely. */
  assert.match(src, /return this\._eyePosition\(out\);/, 'and falls back to the eye when there is no pistol');
  /* §697 is not in this lane either. */
  assert.equal(GUARD_TUNE.groundProbe, 0.06, '§697\'s groundProbe is untouched');
  assert.equal(GUARD_TUNE.groundSlopeMax, 30, '§697\'s groundSlopeMax is untouched');
});

has('a frozen guard who is also LOOKING does not wind his head around', () => {
  if (!ANIMS.length) return;
  /* `_applyLook` multiplies the authored quaternion, so it is idempotent only if the mixer
     re-establishes that quaternion first. Frozen, nothing else does. At look weight 0 the delta
     is the identity and the defect is invisible, which is why the arm sets a real gaze. */
  const mat = new THREE.MeshBasicMaterial();
  const rig = instantiateNative(NATIVE, [mat, mat]);
  const a = new CarmelitaNativeAnim(rig, ANIMS, 0);
  a.freeze('look_around', 0.5);
  a.setLook(0.8, 0.3, 1);
  a.update(1 / 60);
  const head = rig.bones.Head, neck = rig.bones.Neck2;
  const h0 = head.quaternion.clone(), n0 = neck.quaternion.clone();
  for (let i = 0; i < 120; i++) a.update(1 / 60);
  const d = (p, q) => Math.max(...['x', 'y', 'z', 'w'].map((k) => Math.abs(p[k] - q[k])));
  assert.ok(d(head.quaternion, h0) < 1e-6, `the head is stable while frozen (drift ${d(head.quaternion, h0)})`);
  assert.ok(d(neck.quaternion, n0) < 1e-6, `the neck is stable while frozen (drift ${d(neck.quaternion, n0)})`);
  /* The other arm: the gaze must actually DO something, or this test passes on a no-op. */
  const b = new CarmelitaNativeAnim(instantiateNative(NATIVE, [mat, mat]), ANIMS, 0);
  b.freeze('look_around', 0.5);
  const straight = b.rig.bones.Head.quaternion.clone();
  b.setLook(0.8, 0.3, 1);
  b.update(1 / 60);
  assert.ok(d(b.rig.bones.Head.quaternion, straight) > 1e-3, 'and setLook moves the head at all');
});

has('the look overlay does not accumulate in NORMAL play either', () => {
  if (!ANIMS.length) return;
  /* The frozen case is the loud one, but three skips `setValue` whenever a clip value is
     unchanged between frames, which happens in ordinary playback too. The check: hold a steady
     gaze through a full clip cycle and require the head's offset from the un-gazed pose to stay
     bounded rather than growing. */
  const mat = new THREE.MeshBasicMaterial();
  const plain = new CarmelitaNativeAnim(instantiateNative(NATIVE, [mat, mat]), ANIMS, 0);
  const gazing = new CarmelitaNativeAnim(instantiateNative(NATIVE, [mat, mat]), ANIMS, 0);
  plain.play('look_around', { fade: 0, restart: true });
  gazing.play('look_around', { fade: 0, restart: true });
  gazing.setLook(0.7, 0.25, 1);
  const d = (p, q) => Math.max(...['x', 'y', 'z', 'w'].map((k) => Math.abs(p[k] - q[k])));
  let early = 0, late = 0;
  for (let i = 0; i < 600; i++) {
    plain.update(1 / 60); gazing.update(1 / 60);
    const off = d(gazing.rig.bones.Head.quaternion, plain.rig.bones.Head.quaternion);
    if (i === 60) early = off;
    if (i >= 540) late = Math.max(late, off);
  }
  assert.ok(early > 1e-3, `the gaze is actually applied (offset ${early})`);
  assert.ok(late < early * 1.35 + 0.02,
    `and stays bounded over 10 s rather than winding up (early ${early.toFixed(4)}, late ${late.toFixed(4)})`);
});

test('a headless boot is SILENT — the fallback is the designed path, not an anomaly', async () => {
  /* This is a regression arm for a defect the default flip introduced and two other suites
     caught: `Guards.init` warned whenever the native load returned null, and headless it ALWAYS
     returns null by design (no DOM, no fetch, ten suites that build Guards with no network). So
     every headless boot raised a warning, `guardsuite`'s "init raised no warnings" failed, and
     `patrol`'s C3 failed with the warning text as its message.
     §357.1 is the rule it broke: a guard that fires on noise gets switched off, and a guard that
     is switched off is the defect it was meant to prevent. */
  const src = readFileSync('src/ai/Guard.js', 'utf8');
  const i = src.indexOf('the native Carmelita rig did not load');
  assert.ok(i > 0, 'the warning still exists — it is wanted, in the right case');
  const before = src.slice(Math.max(0, i - 400), i);
  assert.match(before, /typeof document !== 'undefined' && typeof window !== 'undefined'/,
    'and it is gated on a DOM existing, so a headless boot cannot raise it');

  /* Not just the source shape — the behaviour. Build the module in this DOM-less process and
     confirm the loader takes the silent path rather than throwing or warning. */
  const { loadCarmelitaNative } = await import('../src/ai/CarmelitaNative.js');
  assert.equal(typeof document, 'undefined', 'this process really has no DOM');
  const got = await loadCarmelitaNative({});
  assert.equal(got, null, 'headless resolves to null rather than throwing — the documented contract');
});
