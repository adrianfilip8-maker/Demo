import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE as CTUNE } from '../src/player/Controller.js';

/**
 * Can a player wedge? — the negative result, written down so the question is retired.
 *
 * ── Why this exists ────────────────────────────────────────────────────────────────────────
 * Four rounds of driving the collect route died the same way: the driver walked into a face,
 * held forward, and stopped for thousands of frames. §434 called that a driver limitation. The
 * objection that produced this file is that **holding forward into a wall is not exotic driver
 * behaviour — it is the single most common thing a human does**, and if arriving at a face in
 * the wrong state could pin the capsule until something external reset it, that would be a
 * playability bug hiding behind an assumption about the driver.
 *
 * It is not one. Backing off and jumping — the two most reflexive responses at a wall — free the
 * capsule immediately at every site, from every approach tested.
 *
 * ── The instrument, one level up from §431's ───────────────────────────────────────────────
 * §431 used a cold start to ask whether a *position* is escapable. This asks whether a *state*
 * is: walk in at normal speed, hold forward until motion stops, then apply one input and measure
 * displacement. The control is the sixth input — keep holding forward — which must NOT free it,
 * or the pin was never real and every "FREED" below is noise.
 *
 * ── What "pinned" is, and why it is correct ────────────────────────────────────────────────
 * A capsule pressed into a face with forward held does not move. That is a wall behaving like a
 * wall. The defect would be a pin that ordinary input cannot leave, and there is none.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Aim the stub camera along a horizontal direction — input is camera-relative (§6.1). */
function face(engine, dx, dz) {
  const l = Math.hypot(dx, dz) || 1;
  engine.camera.rotation.set(0, Math.atan2(-dx / l, -dz / l), 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
}

/**
 * Walk into `target` holding forward, then apply `escape` for 180 frames.
 * @returns {{pinnedIn:string, grounded:boolean, moved:number}}
 */
function trial(engine, c, start, target, escape) {
  hardReset(engine, c, start.clone());
  for (let i = 0; i < 240; i++) {
    face(engine, target.x - c.position.x, target.z - c.position.z);
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 1;
    engine.time = i * DT;
    c.update(DT, i * DT);
  }
  const pinned = c.position.clone();
  const pinnedIn = c.stateName;
  const grounded = c.grounded;
  for (let i = 0; i < 180; i++) {
    face(engine, target.x - c.position.x, target.z - c.position.z);
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 1;
    escape(engine.input, i);
    engine.time = (240 + i) * DT;
    c.update(DT, (240 + i) * DT);
  }
  return { pinnedIn, grounded, moved: c.position.distanceTo(pinned) };
}

/* The faces the driven runs actually died against, and a normal ground approach to each. */
const SITES = [
  ['entry-pylon plinth', V(3.20, 0.10, 37.00), V(8.20, 0.10, 37.00)],
  ['obelisk kiosk',      V(-0.67, 9.04, 6.57), V(2.87, 7.41, 10.11)],
];

const FREE = 0.5;   // metres in 180 frames that count as "got out"

test('W1 backing off frees the capsule at every face a driven run died against', async () => {
  /**
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: `move.y = -1` at both sites — 3.85 m at the plinth, 4.71 m at the kiosk.
   * FAILS ON:  RUN in-arm — the control, holding forward, which moves 0.013 m and 0.051 m. If
   *            the control ever frees the capsule the pin was never real and this arm is void,
   *            so it is asserted rather than assumed.
   */
  const { engine, c } = await realWorld();
  let checked = 0;
  for (const [label, start, target] of SITES) {
    const held = trial(engine, c, start, target, () => {});
    assert.ok(held.moved < FREE,
      `${label}: holding forward moved ${held.moved.toFixed(3)} m — the capsule was never pinned, ` +
      'so the escapes below are measuring nothing');

    const back = trial(engine, c, start, target, (inp) => { inp.move.y = -1; });
    assert.ok(back.moved > FREE,
      `${label}: backing off moved only ${back.moved.toFixed(3)} m from a pin in ` +
      `${held.pinnedIn} (grounded=${held.grounded}). A player who walks into this face and pulls ` +
      'back cannot leave — that is a wedge, and it is a playability defect.');
    checked++;
  }
  assert.equal(checked, SITES.length);
});

test('W2 jumping frees it too, so there are two ordinary ways out', async () => {
  /**
   * Two independent escapes matter more than one: a single route out could be an accident of one
   * state machine path. Back-off and jump go through different states.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: a tapped jump — 1.16 m at the plinth, 1.33 m at the kiosk.
   * FAILS ON:  RUN in-arm — strafing, which does NOT free it (0.02–0.36 m) at either site. That
   *            is the honest shape of the result: not "any input works", but "these two do and
   *            that one does not", which is a claim that could have come out otherwise.
   */
  const { engine, c } = await realWorld();
  for (const [label, start, target] of SITES) {
    const jump = trial(engine, c, start, target,
      (inp, i) => { if (i % 20 < 3) inp.hold('jump'); else inp.let_go('jump'); });
    assert.ok(jump.moved > FREE,
      `${label}: jumping moved only ${jump.moved.toFixed(3)} m — neither of the two reflexive ` +
      'responses at a wall frees the capsule');

    const strafe = trial(engine, c, start, target, (inp) => { inp.move.x = -1; });
    assert.ok(strafe.moved < FREE,
      `${label}: strafing now frees it too (${strafe.moved.toFixed(3)} m). Not a defect — but ` +
      'this arm claimed strafing does not, and that claim has gone stale.');
  }
});

test('W3 the pin is one mechanism, not several — same behaviour at both faces', async () => {
  /**
   * Three of these would be a driver that gives up in three different ways; one is a wall. The
   * grounded flag differs between the sites (`fall` at the plinth, a ground state at the kiosk)
   * and that is a property of the ledge each face sits on, not a second failure — which is why
   * this arm asserts the ESCAPE behaviour matches rather than the state.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: both sites — held < 0.5 m, back-off > 0.5 m, jump > 0.5 m, strafe < 0.5 m.
   * FAILS ON:  RUN in-arm — a site with no face in front of it at all (5 m of open courtyard),
   *            where holding forward travels metres and the "pinned" precondition fails. Without
   *            it, "the same everywhere" could be satisfied by an arm that pins nowhere.
   */
  const { engine, c } = await realWorld();
  const sig = (start, target) => [
    trial(engine, c, start, target, () => {}).moved < FREE,
    trial(engine, c, start, target, (inp) => { inp.move.y = -1; }).moved > FREE,
    trial(engine, c, start, target, (inp, i) => { if (i % 20 < 3) inp.hold('jump'); else inp.let_go('jump'); }).moved > FREE,
  ].join(',');

  const a = sig(SITES[0][1], SITES[0][2]);
  const b = sig(SITES[1][1], SITES[1][2]);
  assert.equal(a, b,
    `the two faces behave differently (${a} vs ${b}) — that is two mechanisms, and one of them ` +
    'has not been characterised');
  assert.equal(a, 'true,true,true', `unexpected signature ${a}`);

  /* The counterexample, run: open ground pins nothing. The first choice of open ground was not
     open — walking south from spawn reaches the terrace inside the approach window and pins
     against it, which would have made this control agree with the sites by accident. */
  const open = trial(engine, c, V(-14, 0.05, 26), V(-14, 0, -10), () => {});
  assert.ok(open.moved > FREE,
    `holding forward across open courtyard moved only ${open.moved.toFixed(3)} m — the harness ` +
    'pins everywhere, so "pinned at these faces" means nothing');
});

test('W4 the pin releases the instant forward stops, after a minute of holding it', async () => {
  /**
   * The question behind the whole file: a wall you stop at is correct, a state you cannot leave
   * is not. Measured directly — hold forward long enough that any latch would have latched, then
   * back off.
   *
   * Recorded alongside, and NOT fixed here (§436): at the plinth the pinned state is `fall` with
   * `grounded=false`, held for **3600 frames — 60 s of game time** — with `airTime` reaching
   * 59.18 s while `groundCheck` finds ground **0.107 m below his feet**. The capsule floats
   * 10.7 cm over solid ground and never lands. It is contained rather than harmless: `airTime`
   * is read in exactly one place in `src/`, as `> 0.10`, so unbounded growth is inert.
   *
   * An earlier version of this arm released forward for 30-60 frames before backing off and
   * found only 0.36 m, which read as a latch. It was confounded: releasing lets him drop off the
   * lip he is floating on, so the back-off was being applied to a different situation — one
   * attempt even ended in `hurt`, with the nearest hazard 5.11 m away, i.e. fall damage. The arm
   * now applies the escape from the pin itself, which is the state the question is about.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: 1200 frames of held forward, then back off — the capsule leaves.
   * FAILS ON:  RUN in-arm — the same 1200 frames with no escape at all, which does not move it.
   */
  const { engine, c } = await realWorld();
  const [, start, target] = SITES[0];

  /** Hold forward for `hold` frames, then apply `escape` for 180. */
  const soak = (hold, escape) => {
    hardReset(engine, c, start.clone());
    for (let i = 0; i < hold; i++) {
      face(engine, target.x - c.position.x, target.z - c.position.z);
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 1;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    const pinned = c.position.clone();
    const st = c.stateName;
    for (let i = 0; i < 180; i++) {
      face(engine, target.x - c.position.x, target.z - c.position.z);
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 1;
      escape(engine.input, i);
      engine.time = (hold + i) * DT; c.update(DT, (hold + i) * DT);
    }
    return { st, moved: c.position.distanceTo(pinned) };
  };

  const held = soak(1200, () => {});
  assert.ok(held.moved < FREE,
    `after 1200 frames the capsule drifted ${held.moved.toFixed(3)} m on its own — it was never pinned`);

  const out = soak(1200, (inp) => { inp.move.y = -1; });
  assert.ok(out.moved > FREE,
    `after 20 s of holding forward against the face, backing off moved only ${out.moved.toFixed(3)} m ` +
    `from a pin in ${held.st}. The pin outlives the input that caused it — that IS a latch, and a ` +
    'player who leans on this face is stuck.');
});
