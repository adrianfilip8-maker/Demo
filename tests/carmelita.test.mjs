import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIG3 } from '../src/player/SlyModel3.js';
import { GUARD_CLIPS } from '../src/ai/GuardClips.js';

/**
 * Structural guards on the machine-retargeted Carmelita clips.
 *
 * `tools/carmelita2clips.mjs` retargets 11 clips off a 199-bone Blender rig onto RIG3 in world
 * space and emits them in `Clips.js`'s authoring format. These are the same guards
 * `tests/mixamo.test.mjs` applies to the Sly output, pointed at the guard set — bone names exist,
 * key times ascend, values are finite, every moving bone is keyed at every key, and no clip is a
 * stack of identical poses. That last one is the one that matters: both earlier failures of the
 * Sly tool looked exactly like success (§212), and so did both failures of THIS one.
 *
 * ── Two defects this file is the regression test for, both found today ──────────────────────
 * 1. **The mixer wrapped the last sample to frame 0.** three's default loop mode is `LoopRepeat`,
 *    under which `mixer.setTime(duration)` returns time 0 — so sampling [0, duration] made the
 *    final key a copy of the FIRST key. Every value was a real pose, just the wrong one, and the
 *    only visible symptom was that all 11 clips reported a perfect 0.00° loop closure including
 *    `Jump`, which is a one-shot and cannot close. Measured on `Jump`/`shin.R`: the true final
 *    frame sits 38.03° from frame 0. Guarded below by pinning WHICH clips close, as a named set.
 *    **`src/player/MixamoClips.js` still has this defect** — all 16 of its clips currently end in
 *    a byte-identical copy of their first key. That is reported, not fixed here; it is another
 *    agent's file.
 * 2. **`clampWhenFinished` freezes the rig.** Fixing (1) with `LoopOnce` introduced a second-order
 *    trap: the moment a sample lands on t == duration three sets `action.paused = true`, and a
 *    paused action ignores every later `setTime`. The sampling-rate audit sampled keys first and
 *    the ground truth second, so it compared the clip against a frozen final pose. The tell was
 *    reconstruction error going UP with sample rate (140.8° at 20 Hz, 143.5° at 60 Hz), which no
 *    real interpolation error can do. Guarded below by the 1:1 key-count check.
 *
 * Read against the raw (authored) shape, not the compiled one, because `Clips.js` does not export
 * `compile()` — and that is the right level anyway: what is being checked is whether the emitter's
 * output is admissible input.
 */

const BONES = new Set(RIG3.BONE_ORDER);
const names = Object.keys(GUARD_CLIPS);

/**
 * RIG3 bones Carmelita cannot supply.
 *
 * `capBrim` — she wears hair, not a cap. `browL`/`browR` — her brows are shape-key driven
 * (`AngerSK_CTL`, `BlinkSK_CTL`, …), not skeletal. `tailA`..`tailD` — and this one is NOT the
 * obvious case: her rig DOES carry an 8-bone tail (`Tail1`..`Tail8`), but all eight hold 0.000° of
 * local rotation across all 11 clips, so there is no motion to retarget. Emitting them would pin
 * the tail rigid to bind, which is worse than omitting them: absent leaves the procedural spring
 * chain in charge, zeroed reads as a dead rope.
 */
const NO_SOURCE = ['capBrim', 'browL', 'browR', 'tailA', 'tailB', 'tailC', 'tailD'];

/** The source is authored at exactly 60 fps LINEAR, and the emitter samples at 60 Hz. */
const SRC_FPS = 60;

const qOf = (d) => new THREE.Quaternion().setFromEuler(new THREE.Euler(
  THREE.MathUtils.degToRad(d[0]), THREE.MathUtils.degToRad(d[1]), THREE.MathUtils.degToRad(d[2]), 'XYZ'));
/* Normalised before the dot: repeated quaternion multiplies drift off unit length, and an
   un-normalised dot gives 2*acos(0.9999996) = 0.05° between two IDENTICAL poses — a noise floor in
   the instrument that would otherwise be read as motion. */
const ang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(
  a.clone().normalize().dot(b.clone().normalize())))) * 180 / Math.PI;

test('carmelita: the module carries all 11 clips and they are non-empty', () => {
  assert.equal(names.length, 11, `expected 11 retargeted clips, got ${names.length}`);
  for (const n of names) {
    const c = GUARD_CLIPS[n];
    assert.ok(Number.isFinite(c.dur) && c.dur > 0, `${n} has a non-positive duration`);
    assert.ok(Array.isArray(c.keys) && c.keys.length >= 2, `${n} has ${c.keys?.length} keys`);
    assert.equal(typeof c.loop, 'boolean', `${n} loop is not a boolean`);
  }
  /* The two clips this import exists for. Named, because a retarget that silently dropped either
     would still pass every other guard in this file. */
  for (const need of ['PatrolWalk', 'Lookaround']) {
    assert.ok(names.includes(need), `"${need}" is missing — it is the reason this set was imported`);
  }
});

test('carmelita: every bone named exists in RIG3', () => {
  /* The retarget resolves Blender node names through three's own `sanitizeNodeName` (GLTFLoader
     strips the dot in `Ear.L`), so a mapping that silently half-works shows up here as a bone name
     RIG3 has never heard of. An exact-match resolver maps 6 of 24 on this rig — every dotted name,
     which is both arms, both legs and the ears, is lost. */
  const bad = new Set();
  let refs = 0;
  for (const n of names) {
    for (const k of GUARD_CLIPS[n].keys) {
      for (const b of Object.keys(k.P)) { refs++; if (!BONES.has(b)) bad.add(`${n} -> ${b}`); }
    }
  }
  assert.ok(refs > 1000, `only ${refs} bone references inspected`);
  assert.deepEqual([...bad], []);
});

test('carmelita: the bones she cannot supply are absent, not zeroed', () => {
  const present = new Set();
  for (const n of names) for (const k of GUARD_CLIPS[n].keys) for (const b of Object.keys(k.P)) present.add(b);
  for (const b of NO_SOURCE) {
    assert.ok(!present.has(b), `"${b}" has no usable source but was emitted — it must stay procedural`);
  }
  assert.ok(present.size >= 20, `only ${present.size} bones animated across all clips`);
  /* jaw/earL/earR are the three RIG3 bones Mixamo could NOT supply and this rig can. If a future
     map change drops them the set silently gets worse, so they are asserted present where they
     were measured to move rather than merely allowed. */
  assert.ok(Object.keys(GUARD_CLIPS.HitTaken.keys[0].P).includes('jaw'),
    'jaw moves in HitTaken (25.9° in source) and should be emitted there');
  for (const ear of ['earL', 'earR']) {
    assert.ok(Object.keys(GUARD_CLIPS.Run.keys[0].P).includes(ear),
      `${ear} moves in Run (20.2° in source) and should be emitted there`);
  }
});

test('carmelita: key times ascend and stay inside the duration', () => {
  let keys = 0;
  for (const n of names) {
    const c = GUARD_CLIPS[n];
    let prev = -Infinity;
    for (const k of c.keys) {
      keys++;
      assert.ok(Number.isFinite(k.t), `${n} has a non-finite key time`);
      assert.ok(k.t >= prev, `${n} key time ${k.t} goes backwards from ${prev}`);
      assert.ok(k.t <= c.dur + 1e-3, `${n} key at ${k.t} exceeds dur ${c.dur}`);
      prev = k.t;
    }
  }
  assert.ok(keys > 400, `only ${keys} keys inspected`);
});

test('carmelita: every pose value is a finite 3-vector, and every hips offset is finite', () => {
  let vals = 0;
  for (const n of names) {
    for (const k of GUARD_CLIPS[n].keys) {
      for (const [b, d] of Object.entries(k.P)) {
        assert.ok(Array.isArray(d) && d.length === 3, `${n}/${b} is not a 3-vector`);
        for (const v of d) { vals++; assert.ok(Number.isFinite(v), `${n}/${b} has a non-finite component`); }
      }
      assert.ok(Array.isArray(k.pos) && k.pos.length === 3 && k.pos.every(Number.isFinite),
        `${n} has a bad hips offset`);
    }
  }
  assert.ok(vals > 3000, `only ${vals} components inspected`);
});

test('carmelita: a bone that moves at all is keyed at EVERY key of that clip', () => {
  /* `trackFromKeys` SKIPS absent keys rather than reading them as identity, so a dense machine
     sample must be dense: partial coverage means a crossing was silently removed. §212.1 measured
     the cost of getting this wrong at 11.59° on a contact toe. The sparse-key audit in the tool
     puts this run's worst at 2.60° on `jaw` in `HitTaken`. */
  const bad = [];
  for (const n of names) {
    const c = GUARD_CLIPS[n];
    const count = {};
    for (const k of c.keys) for (const b of Object.keys(k.P)) count[b] = (count[b] || 0) + 1;
    for (const [b, seen] of Object.entries(count)) {
      if (seen !== c.keys.length) bad.push(`${n}/${b} keyed ${seen}/${c.keys.length}`);
    }
  }
  assert.deepEqual(bad, [], `bones with partial key coverage:\n  ${bad.join('\n  ')}`);
});

test('carmelita: no clip is a stack of identical poses', () => {
  /* The failure this catches is the retarget silently emitting bind pose — which is what "0/24
     mapped" looks like, and what a wrong-space transform looks like: stable, plausible, and
     completely motionless. Measured as the largest quaternion angle any bone travels from its
     first key. Threshold 2° inherited unchanged from tests/mixamo.test.mjs. */
  const flat = [];
  for (const n of names) {
    const c = GUARD_CLIPS[n];
    let worst = 0;
    for (const b of Object.keys(c.keys[0].P)) {
      const q0 = qOf(c.keys[0].P[b]);
      for (const k of c.keys) {
        if (!k.P[b]) continue;
        const a = ang(q0, qOf(k.P[b]));
        if (a > worst) worst = a;
      }
    }
    if (worst < 2) flat.push(n);
  }
  /* `Shoot(GunMovement)` is legitimately static ON THIS SKELETON: it is a 2-keyframe STEP clip
     that animates only the shock pistol (`ShockPistol`, `Barrel`, `Trigger`, `antenna.001`..`003`)
     and holds every body bone still — which is exactly what its name says. Measured liveness
     0.00°; the next quietest clip is `Idle` at 13.73°. It is NAMED here rather than excused by a
     looser threshold, which would blind this guard to a genuinely dead clip. */
  assert.deepEqual(flat.sort(), ['Shoot(GunMovement)'],
    `clips that barely move — is the retarget emitting bind pose?\n  ${flat.join('\n  ')}`);
});

test('carmelita: the last key is not a wrapped copy of the first', () => {
  /* Regression guard for defect (1) in the header. Stated as "exactly these clips return to their
     start pose", a named set, rather than as a tuned threshold — because under the wrap bug ALL
     ELEVEN closed perfectly, so the set is what changes, and it changes unmissably.
     Measured closure: Jump 76.5°, Shoot(BodyMovement) 50.8°, Run 19.1°, PatrolWalk 4.7°, and the
     seven below at 0.0°. */
  const closing = [];
  let checked = 0;
  for (const n of names) {
    const c = GUARD_CLIPS[n];
    const first = c.keys[0].P, last = c.keys[c.keys.length - 1].P;
    let worst = 0;
    for (const b of Object.keys(first)) {
      if (!last[b]) continue;
      checked++;
      worst = Math.max(worst, ang(qOf(first[b]), qOf(last[b])));
    }
    if (worst < 2) closing.push(n);
  }
  assert.ok(checked > 150, `only ${checked} bone pairs inspected`);
  assert.deepEqual(closing.sort(), [
    'Air', 'CasualWalking', 'HitTaken', 'Idle', 'Lookaround', 'Run.001', 'Shoot(GunMovement)',
  ], 'the set of clips that end where they began changed — if it is ALL of them, the sampler is '
   + 'wrapping t=duration back to frame 0 again');
});

test('carmelita: every clip is a 1:1 transfer of the source frames', () => {
  /* Regression guard for defect (2). The source is authored at exactly 60 fps LINEAR and the
     emitter samples at 60 Hz, so key count must be round(dur * 60) + 1 for all ten animated clips.
     `Shoot(GunMovement)` is the one genuine resample: 2 STEP keyframes over 0.333 s become 21
     uniform keys, which is why it is listed separately rather than waved through. */
  let checked = 0;
  for (const n of names) {
    const c = GUARD_CLIPS[n];
    const expect = Math.max(2, Math.round(c.dur * SRC_FPS) + 1);
    checked++;
    assert.equal(c.keys.length, expect,
      `${n} has ${c.keys.length} keys, expected ${expect} at ${SRC_FPS} Hz over ${c.dur}s`);
    /* keys must be evenly spaced at the source frame interval */
    const dt = c.keys[1].t - c.keys[0].t;
    assert.ok(Math.abs(dt - 1 / SRC_FPS) < 1e-3,
      `${n} key spacing ${dt.toFixed(5)}s is not the source's ${(1 / SRC_FPS).toFixed(5)}s`);
  }
  assert.equal(checked, 11, `only ${checked} clips inspected`);
});

test('carmelita: the walk clips swing a thigh like a walk', () => {
  /* The sanity number, as an assertion rather than only as tool output: a humanoid walk swings the
     thigh tens of degrees, not hundreds and not ~0. Measured peak-to-peak within the clip —
     PatrolWalk 74.8°, CasualWalking 79.6°. The window is deliberately wide; it is here to catch a
     retarget that collapsed to bind (~0°) or exploded (~180°), not to police animation taste.
     `Run`/`Run.001` are NOT included: at a 0.5 s sprint cycle they measure 132.5°/134.9°, outside
     this window and legitimately so, and stretching the window to admit them would gut it. */
  let checked = 0;
  for (const n of ['PatrolWalk', 'CasualWalking']) {
    const c = GUARD_CLIPS[n];
    let worst = 0;
    const qs = c.keys.map((k) => k.P.upperLegL).filter(Boolean).map(qOf);
    assert.ok(qs.length === c.keys.length, `${n} does not key upperLegL at every key`);
    for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
      worst = Math.max(worst, ang(qs[i], qs[j]));
    }
    checked++;
    assert.ok(worst > 12 && worst < 110,
      `${n} upperLegL swings ${worst.toFixed(1)}° — outside the 12..110° window a walk stride lives in`);
  }
  assert.equal(checked, 2);
});
