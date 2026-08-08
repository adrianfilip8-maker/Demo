import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIG3 } from '../src/player/SlyModel3.js';
import { MIXAMO_CLIPS } from '../src/player/MixamoClips.js';

/**
 * Structural guards on the machine-retargeted clips.
 *
 * `tools/mixamo2clips.mjs` retargets 16 Mixamo clips onto RIG3 in world space and emits them in
 * `Clips.js`'s authoring format. Nothing validated that output before this file: the tool's own
 * report is a summary of what it *intended* to write, which is a different claim from what the
 * emitted module contains. These are the same guards `tests/rig.test.mjs` applies to the 52
 * hand-authored clips, pointed at the generated ones — and they cost milliseconds, which matters
 * because regenerating is cheap and a regeneration that quietly breaks is not otherwise visible.
 *
 * Read against the raw (authored) shape, not the compiled one, because `Clips.js` does not export
 * `compile()`. That is the right level anyway: what is being checked is whether the emitter's output
 * is admissible input.
 *
 * ── Two findings this file exists downstream of ────────────────────────────────────────
 * 1. **The Euler interchange is not lossy, and task #26's premise was wrong.** `sampleInto` already
 *    slerps quaternions — `_qa.slerp(_qb, _s.f)` then `pose.addQuat()` — so nothing in the runtime
 *    ever lerps Euler components. Euler XYZ degrees is only the *authoring* format, converted once
 *    at compile time. Measured over 200,000 uniform random rotations, the emitter's
 *    quaternion → Euler XYZ → round(0.1°) → quaternion round trip costs **0.107° worst case**, and
 *    within half a degree of gimbal lock it costs **0.111°** — no degradation at all. A calibration
 *    arm using the wrong Euler order on purpose reported 82.76°, so the metric was alive. What
 *    started the "Euler is the wrong interchange" belief was a *reporting* artefact: a
 *    max-Euler-component sanity metric called a modest rotation a 180° hips. The tool now reports
 *    quaternion angle and flags the artefact separately.
 * 2. **The emitter dropped keys at neutral.** It omitted a bone from a key whenever all three Euler
 *    components fell under 0.05°, and `trackFromKeys` *skips* absent keys rather than reading them
 *    as identity — so a limb passing through neutral lost the key at the crossing. Measured before
 *    changing it: 13 of 16 clips lost nothing (a symmetric crossing survives, since slerp between
 *    +30° and −30° passes through identity anyway), but `hang_crawl_left` lost 11.59° on `toeR` and
 *    `hang_crawl_right` 2.01° — and a toe is contact-critical in a crawl. The emitter now writes
 *    every sampled bone at every key and drops only bones that never move in a clip.
 */

const BONES = new Set(RIG3.BONE_ORDER);
const names = Object.keys(MIXAMO_CLIPS);

/** Bones Mixamo has no source for; the emitter documents these as staying procedural. */
const NO_SOURCE = ['tailA', 'tailB', 'tailC', 'tailD', 'capBrim', 'jaw', 'browL', 'browR', 'earL', 'earR'];

test('mixamo: the module carries all 16 clips and they are non-empty', () => {
  assert.equal(names.length, 16, `expected 16 retargeted clips, got ${names.length}`);
  for (const n of names) {
    const c = MIXAMO_CLIPS[n];
    assert.ok(Number.isFinite(c.dur) && c.dur > 0, `${n} has a non-positive duration`);
    assert.ok(Array.isArray(c.keys) && c.keys.length >= 2, `${n} has ${c.keys?.length} keys`);
    assert.equal(typeof c.loop, 'boolean', `${n} loop is not a boolean`);
  }
});

test('mixamo: every bone named exists in RIG3', () => {
  /* The retarget resolves Mixamo node names through a tolerant matcher (GLTFLoader strips the
     colon in `mixamorig:Hips`), so a mapping that silently half-works would show up here as a bone
     name RIG3 has never heard of. */
  const bad = new Set();
  let refs = 0;
  for (const n of names) {
    for (const k of MIXAMO_CLIPS[n].keys) {
      for (const b of Object.keys(k.P)) { refs++; if (!BONES.has(b)) bad.add(`${n} -> ${b}`); }
    }
  }
  assert.ok(refs > 1000, `only ${refs} bone references inspected`);
  assert.deepEqual([...bad], []);
});

test('mixamo: the bones Mixamo cannot supply are absent, not zeroed', () => {
  /* A zeroed tail would be worse than an absent one: absent leaves the procedural tail in charge,
     zeroed would pin it rigid to bind and read as a dead rope. */
  const present = new Set();
  for (const n of names) for (const k of MIXAMO_CLIPS[n].keys) for (const b of Object.keys(k.P)) present.add(b);
  for (const b of NO_SOURCE) {
    assert.ok(!present.has(b), `"${b}" has no Mixamo source but was emitted — the tail/face must stay procedural`);
  }
  assert.ok(present.size >= 20, `only ${present.size} bones animated across all clips`);
});

test('mixamo: key times ascend and stay inside the duration', () => {
  let keys = 0;
  for (const n of names) {
    const c = MIXAMO_CLIPS[n];
    let prev = -Infinity;
    for (const k of c.keys) {
      keys++;
      assert.ok(Number.isFinite(k.t), `${n} has a non-finite key time`);
      assert.ok(k.t >= prev, `${n} key time ${k.t} goes backwards from ${prev}`);
      assert.ok(k.t <= c.dur + 1e-3, `${n} key at ${k.t} exceeds dur ${c.dur}`);
      prev = k.t;
    }
  }
  assert.ok(keys > 500, `only ${keys} keys inspected`);
});

test('mixamo: every pose value is a finite 3-vector, and every hips offset is finite', () => {
  let vals = 0;
  for (const n of names) {
    for (const k of MIXAMO_CLIPS[n].keys) {
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

test('mixamo: a bone that moves at all is keyed at EVERY key of that clip', () => {
  /* The regression guard for the dropped-neutral-key bug. `trackFromKeys` skips absent keys, so a
     dense machine sample must be dense: partial coverage means some crossing was silently removed.
     Stated as all-or-nothing per bone per clip, which is exactly the emitter's rule. */
  const bad = [];
  for (const n of names) {
    const c = MIXAMO_CLIPS[n];
    const count = {};
    for (const k of c.keys) for (const b of Object.keys(k.P)) count[b] = (count[b] || 0) + 1;
    for (const [b, seen] of Object.entries(count)) {
      if (seen !== c.keys.length) bad.push(`${n}/${b} keyed ${seen}/${c.keys.length}`);
    }
  }
  assert.deepEqual(bad, [], `bones with partial key coverage:\n  ${bad.join('\n  ')}`);
});

test('mixamo: no clip is a stack of identical poses', () => {
  /* The failure this catches is the retarget silently producing bind pose — which is what "0/21
     mapped" looked like before the tolerant name resolver landed, and what a wrong-space transform
     produced after it: stable, plausible, and completely motionless. Measured as the largest
     quaternion angle any bone travels from its first key. */
  const qOf = (d) => new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(d[0]), THREE.MathUtils.degToRad(d[1]), THREE.MathUtils.degToRad(d[2]), 'XYZ'));
  const flat = [];
  for (const n of names) {
    const c = MIXAMO_CLIPS[n];
    let worst = 0;
    for (const b of Object.keys(c.keys[0].P)) {
      const q0 = qOf(c.keys[0].P[b]);
      for (const k of c.keys) {
        if (!k.P[b]) continue;
        const a = 2 * Math.acos(Math.min(1, Math.abs(q0.dot(qOf(k.P[b]))))) * 180 / Math.PI;
        if (a > worst) worst = a;
      }
    }
    if (worst < 2) flat.push(n);
  }
  /* `fall_pose_01` and `fall_pose_02` are Mixamo *pose* assets, not animations: 0.07 s and two
     keys, both sampled from the same single source frame. Zero motion is what they are, so they are
     named here rather than excused by a looser threshold — which would have blinded the test to a
     genuinely dead clip. Everything else must move at least 2°, far below anything real and far
     above float noise. */
  assert.deepEqual(flat.sort(), ['fall_pose_01', 'fall_pose_02'],
    `clips that barely move — is the retarget emitting bind pose?\n  ${flat.join('\n  ')}`);
});
