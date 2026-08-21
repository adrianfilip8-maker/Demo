import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIG3 } from '../src/player/SlyModel3.js';
import { CLIPS, compile, sampleCane, sampleInto } from '../src/player/Clips.js';
import { Animation, ACTIVE } from '../src/player/Animation.js';
import { PoseBuffer } from '../src/player/Rig.js';
import { makeSim, DT } from './_moveset.mjs';

/**
 * twirl.test.mjs — the double jump's cane twirl DELIVERS on the shipped model's shape (§474).
 *
 * The user's playtest P1: "the double jump seems to use the same animation as the single jump."
 * The clip existed and the state fired it; what was missing was delivery, twice over:
 *
 *   1. `double_jump` authored its whole 360° into the `cane` CHANNEL, which only
 *      `Animation._applyCane` delivers, and only through `character._attachPoints.cane` — and
 *      the SHIPPED model (SlyModelDLRig) sockets its cane rigidly to `handR` and registers no
 *      attach point, on the record. The one readable channel of the move was authored into the
 *      one channel the shipped character discards.
 *   2. The delivered window is the TAPPED double jump, not the held one: releasing `jump`
 *      mid-rise jump-cuts vy 9.9 → ~3.3, the state flips to `fall` ~0.17 s after entry, and
 *      `jump_apex` re-bases, demoting the track. The old 0.62 s clip delivered its first 27 %:
 *      a wind-up tuck indistinguishable from a jump squat.
 *
 * The fix (§474) re-authors the rotation onto `handR` — both canes, legacy `caneGrip` and
 * DLRig `caneSocket`, are children of that bone — and retimes the clip to 0.30 s so a tapped
 * jump carries the whole turn.
 *
 * ── DOMAIN — both inputs RUN (§418.3) ────────────────────────────────────────────────────────
 *   clip def:     §474 (hand-carried 360, dur 0.30 — the `?anim=proc` control since §478)
 *               | PRE-§474 reconstruction (cane-track 360, dur 0.62) — inline below as
 *                 OLD_RAW, injected into ACTIVE for its arm
 *   model shape:  no `_attachPoints.cane` — the SHIPPED SlyModelDLRig shape (cane rigid to
 *                 `handR`), which is what `charStub()` builds
 *   drive:        the real Controller + Moveset + Animation, stub flat world, twirltrace's own
 *                 tapped cadence (8-frame first hold, 6-frame gap, 4-frame second tap)
 *
 *   passes on:  the §474 def — net signed handR yaw sweep ≥ 270° across the double jump's
 *               airtime (the authored 360 minus at most one crossfade's absorption)
 *   fails on:   the pre-§474 def — net sweep < 120°, while ITS OWN cane track nets ≥ 300°
 *               (T3: the turn existed and was authored into the discarded channel)
 *   does not discriminate: the single-jump take — net < 120° under BOTH defs (T2); that is the
 *               contrast case, and it is exactly what the user reported seeing twice
 *
 * METRIC NOTE, recorded before the after-numbers existed: twirltrace's first metric was
 * CUMULATIVE unsigned sweep, and it saturated on the failing side — a plain single jump
 * accumulates 271° of arm wiggle across its airtime, so a 360° rotation and a wiggly tuck were
 * 100° apart on a 400° scale. NET SIGNED yaw about world Y is the discriminator: wiggle
 * cancels, rotation does not. Bars re-derived from the claim on that metric (360 authored;
 * ≥ 270 delivered; < 120 = no readable turn), not from either arm's result.
 */

/* The pre-§474 `double_jump`, verbatim from the shipped tree at d372085 (keys only; the P()
   wrapper there fills unlisted bones on key 0 with the bind pose, which quatTrack treats the
   same as absence for the bones measured here — handR is keyed once, constant). */
const OLD_RAW = {
  dur: 0.62, loop: false, hold: 0.2,
  keys: [
    { t: 0, e: 'in', P: {
      hips: [30, -14, 4], spine: [-6, 6, 2], chest: [-12, 16, -3], neck: [-18, -8, 2], head: [-16, -12, 4],
      shoulderL: [-10, 12, -18], upperArmL: [-14, 14, -40], lowerArmL: [-62, -20, -16],
      shoulderR: [-14, -14, 22], upperArmR: [-30, -18, 54], lowerArmR: [-58, 24, 20], handR: [10, 18, 14],
      upperLegL: [-70, 10, 5], lowerLegL: [84, 0, 0], footL: [10, -6, 0], toeL: [14, 0, 0],
      upperLegR: [-62, -10, -5], lowerLegR: [78, 0, 0], footR: [14, 6, 0], toeR: [14, 0, 0],
      tailA: [4, -16, 0], tailB: [-8, -22, 0], tailC: [-6, -14, 0], tailD: [16, 10, 0],
    }, pos: [0, -0.16, 0.03], sc: { hips: [1.06, 0.9, 1.05] }, cane: [40, -60, 0] },
    { t: 0.16, e: 'out', P: {
      hips: [-2, 22, -6], spine: [2, -8, -2], chest: [-6, -22, 4], neck: [-14, 10, -3], head: [-18, 16, -6],
      upperArmL: [-40, 14, -84], lowerArmL: [-28, -20, -20],
      upperArmR: [-64, -18, 96], lowerArmR: [-24, 24, 24],
      upperLegL: [-26, 10, 5], lowerLegL: [30, 0, 0], footL: [28, -6, 0],
      upperLegR: [-6, -10, -5], lowerLegR: [16, 0, 0], footR: [32, 6, 0],
      tailA: [-14, 24, 0], tailB: [-26, 32, 0], tailC: [-12, 22, 0], tailD: [12, -14, 0],
    }, pos: [0, 0.06, -0.02], sc: { hips: [0.93, 1.12, 0.94] }, cane: [-60, 100, 0] },
    { t: 0.34, e: 'smooth', P: {
      hips: [6, -18, 5], chest: [-4, 18, -3], head: [-16, -12, 4],
      upperArmL: [-30, 14, -70], upperArmR: [-46, -18, 78],
      upperLegL: [-38, 10, 5], lowerLegL: [46, 0, 0], upperLegR: [-18, -10, -5], lowerLegR: [30, 0, 0],
      tailA: [-6, -20, 0], tailB: [-18, -26, 0], tailC: [-8, -18, 0], tailD: [14, 12, 0],
    }, pos: [0, 0.01, 0], sc: { hips: [1, 1, 1] }, cane: [-160, 260, 0] },
    { t: 0.62, e: 'smooth', P: {
      hips: [12, -6, 3], chest: [-6, 8, -2],
      upperArmL: [-26, 16, -66], upperArmR: [-24, -16, 66],
      upperLegL: [-44, 8, 5], lowerLegL: [54, 0, 0], upperLegR: [-22, -8, -5], lowerLegR: [36, 0, 0],
      tailA: [-10, -8, 0], tailB: [-22, -12, 0], tailC: [-6, -8, 0], tailD: [16, 6, 0],
    }, pos: [0, -0.01, 0], cane: [96, 400, -8] },
  ],
};

/** The shipped model's SHAPE: RIG3 bones under a root, and NO `_attachPoints`. */
function charStub() {
  const root = new THREE.Group();
  root.name = 'slyStub';
  const bones = Object.create(null);
  for (const [name, parent, p] of RIG3.SKELETON) {
    const b = new THREE.Object3D();
    b.name = name;
    b.position.set(p[0], p[1], p[2]);
    (bones[parent] || root).add(b);
    bones[name] = b;
  }
  return { root, bones, boneNames: RIG3.BONE_ORDER.slice() };
}

/** Boot the real stack: Controller+Moveset on a stub flat world, real Animation on a RIG3 stub. */
async function boot() {
  const { engine, c } = await makeSim();
  const ch = charStub();
  const an = new Animation(engine);
  engine.get = (m) => (m === 'character' ? ch : m === 'animation' ? an : null);
  await an.init();
  assert.equal(an.ready, true, 'Animation must bind to the stub character');
  c.anim = an;
  return { engine, c, an, ch };
}

/** Net signed yaw sweep (deg, about world Y) of handR's world X axis over [f0, f1]. */
function netYaw(dirs, f0, f1) {
  let sum = 0, prev = null;
  for (let f = f0; f <= f1 && f < dirs.length; f++) {
    const d = dirs[f];
    if (!d) continue;
    const len = Math.hypot(d[0], d[2]);
    if (len < 0.2) continue;                        // near-vertical: azimuth undefined
    const a = Math.atan2(d[2], d[0]);
    if (prev !== null) {
      let da = a - prev;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      sum += da;
    }
    prev = a;
  }
  return sum * 180 / Math.PI;
}

/**
 * Drive one take with twirltrace's tapped cadence. Returns per-frame handR world X-axis
 * directions, state names, and the [first, last] frame of the (double-)jump's airtime.
 */
function drive(engine, c, an, ch, { air = true } = {}) {
  const input = engine.input;
  const dirs = [], states = [];
  const el = () => {
    ch.bones.handR.updateWorldMatrix(true, false);
    const e = ch.bones.handR.matrixWorld.elements;
    const L = Math.hypot(e[0], e[1], e[2]) || 1;
    return [e[0] / L, e[1] / L, e[2] / L];
  };
  let f = 0;
  const step = () => {
    input.beginFrame(DT);
    input.move.x = 0; input.move.y = 1;
    engine.time = f * DT;
    c.update(DT, f * DT);
    an.setLocomotion({
      speed: c.speedXZ(), maxSpeed: 7.2, grounded: c.grounded, airborne: !c.grounded,
      verticalVelocity: c.velocity.y, turnRate: 0, slope: 0, surface: 'stone',
    });
    an.update(DT, f * DT);
    dirs[f] = el(); states[f] = c.stateName;
    f++;
  };
  for (let i = 0; i < 30; i++) step();                     // run-up
  input.hold('jump'); for (let i = 0; i < 8; i++) step();  // first jump, tapped
  input.let_go('jump'); for (let i = 0; i < 6; i++) step();
  if (air) {
    input.hold('jump'); for (let i = 0; i < 4; i++) step();// the second tap
    input.let_go('jump');
  }
  for (let i = 0; i < 120 && !(c.grounded && f > 52); i++) step();
  const key = air ? 'doubleJump' : 'jump';
  const first = states.indexOf(key);
  let last = first;
  for (let i = Math.max(first, 0); i < states.length; i++) {
    if (['jump', 'doubleJump', 'fall', 'land'].includes(states[i])) last = i; else if (i > first + 2) break;
  }
  return { dirs, states, first, last };
}

/**
 * Run a take against a given `double_jump` compiled clip, in the PROCEDURAL regime's context.
 *
 * Since the default regime moved to `godot` (§478), ACTIVE's air family is the repo's clips —
 * whose own arm articulation nets ~125° of hand yaw across a plain jump, which is not a turn
 * but is over this file's 120° "no readable turn" bar. These arms guard the §474 mechanics
 * (the hand-carried twirl vs the discarded cane channel), and that def ships as the
 * `?anim=proc` control arm — so the take pins the WHOLE procedural table for its duration,
 * measuring the §474 claim in the §474 regime rather than re-deriving its bars around an
 * unrelated clip set. The godot double jump's own delivery claim lives in §478's fliptrace
 * and shots/flip1, on the body-pitch metric a somersault actually needs.
 */
async function takeWith(clip, opts) {
  const prev = {};
  for (const n of Object.keys(CLIPS)) { prev[n] = ACTIVE[n]; ACTIVE[n] = CLIPS[n]; }
  ACTIVE.double_jump = clip;
  try {
    const { engine, c, an, ch } = await boot();
    return drive(engine, c, an, ch, opts);
  } finally {
    for (const n of Object.keys(CLIPS)) ACTIVE[n] = prev[n];
  }
}

test('T1 twirl delivery: the §474 def (the ?anim=proc control since §478) sweeps the hand ≥270° through a tapped double jump; the pre-§474 def cannot', async () => {
  const now = await takeWith(CLIPS.double_jump);
  assert.ok(now.first >= 0, `doubleJump never entered (states: ${[...new Set(now.states)].join(',')})`);
  const nowNet = Math.abs(netYaw(now.dirs, now.first, now.last));
  assert.ok(nowNet >= 270,
    `§474 def delivered ${nowNet.toFixed(0)}° net hand yaw across the double jump — the 360 did not arrive`);

  const old = await takeWith(compile('double_jump', OLD_RAW));
  assert.ok(old.first >= 0, 'doubleJump never entered on the old-def arm');
  const oldNet = Math.abs(netYaw(old.dirs, old.first, old.last));
  assert.ok(oldNet < 120,
    `pre-§474 def delivered ${oldNet.toFixed(0)}° net — the reconstruction no longer reproduces the defect`);
});

test('T2 contrast (does not discriminate): a single jump sweeps <120° under either def — the look the user compared against', async () => {
  const now = await takeWith(CLIPS.double_jump, { air: false });
  assert.ok(now.first >= 0, 'jump never entered');
  assert.equal(now.states.includes('doubleJump'), false, 'contrast take must not double jump');
  const a = Math.abs(netYaw(now.dirs, now.first, now.last));
  assert.ok(a < 120, `single jump swept ${a.toFixed(0)}° net under the §474 def`);

  const old = await takeWith(compile('double_jump', OLD_RAW), { air: false });
  const b = Math.abs(netYaw(old.dirs, old.first, old.last));
  assert.ok(b < 120, `single jump swept ${b.toFixed(0)}° net under the old def`);
});

test('T3 channel attribution: the old def authored its turn into the cane track; the §474 def authors it into handR', () => {
  /* METRIC, derived from the claim rather than from either result: "authored a turn INTO A
     TRACK" is a statement about the track's own traversal, and the old cane track turns about a
     TILTING axis (its X euler swings 40 → −160 → 96 across the same keys), so the net-yaw
     metric T1 uses under-reads it by construction (measured 197° — the projection loses
     whatever the tilt takes). Track traversal is geodesic PATH LENGTH in SO(3): Σ of the
     quaternion angle between consecutive samples. A full authored turn is ≥ 360° of path
     whatever the axis does; the shipped def's replacement cane track (a mild in-fist aim) must
     sit < 90°; the shipped handR track is pure-Y keys, where path and net coincide at 360.
     T1/T2 keep the net-yaw metric — DELIVERY is about what a viewer sees sweep, and their bars
     were set before this arm ran. */
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const N = 240;
  const canePath = (clip) => {
    let sum = 0;
    for (let i = 0; i <= N; i++) {
      if (!sampleCane(clip, (i / N) * clip.dur, qb)) return 0;
      if (i > 0) sum += 2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))) * 180 / Math.PI;
      qa.copy(qb);
    }
    return sum;
  };
  const old = compile('double_jump', OLD_RAW);
  const oldCane = canePath(old);
  assert.ok(oldCane >= 360,
    `old cane track traverses ${oldCane.toFixed(0)}° — the authored turn was not in the channel the fix claims`);
  const newCane = canePath(CLIPS.double_jump);
  assert.ok(newCane < 90, `shipped cane track traverses ${newCane.toFixed(0)}° — the turn must not be double-authored`);

  /* And the shipped def's handR TRACK carries it, clip-only (no state machine, no blending): */
  const pose = new PoseBuffer(RIG3.BONE_ORDER);
  let handPath = 0;
  for (let i = 0; i <= N; i++) {
    pose.clear();
    sampleInto(CLIPS.double_jump, (i / N) * CLIPS.double_jump.dur, pose, 1);
    if (i > 0) handPath += 2 * Math.acos(Math.min(1, Math.abs(qa.dot(pose.q.handR)))) * 180 / Math.PI;
    qa.copy(pose.q.handR);
  }
  assert.ok(handPath >= 330 && handPath <= 400,
    `shipped handR track traverses ${handPath.toFixed(0)}° in clip space — expected the full 360`);
});
