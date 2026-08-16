/**
 * alertshot.test.mjs — the runtime half of the two staged-FX canonical shots.
 *
 * `alert` and `impact`. They are together because they are the same defect closed twice:
 * `Particles._stageAlert` and `_stageImpact` were both written, both correct, and neither had
 * ever run, because `Shots.js` had no entry by either name and the dispatcher's two branches
 * were unreachable. Everything below is a check that the two ends are now joined.
 *
 * `tools/alertframe.mjs` owns the FRAME: where the two figures and the two marks land at
 * 1280x720, whether anything is cropped, whether the silhouettes merge. It is the tool of
 * record for that and `--shot alert` re-scores the shipped entry from the shot's own
 * coordinates, so none of it is re-derived here. A second implementation of a projection is a
 * second thing to keep true, and this project has paid for that mistake before.
 *
 * What is here is everything the frame tool CANNOT see, because it is a static reading of
 * `SHOTS` and the shot is executed by two other modules at runtime:
 *
 *   1. that `SHOTS.alert.stage` and `SHOTS.alert.guard`/`guard2` still describe the same two
 *      stands — one set of coordinates with two consumers is only a single source of truth
 *      while they agree;
 *   2. that `Particles._stageAlert` hangs rung 3 and rung 2 on the guards the SHOT named,
 *      rather than on whoever the patrol phase happened to leave nearest;
 *   3. that `Guards._poseOne` actually puts a body on the authored stand, in the authored
 *      state, rather than solving for one somewhere else.
 *
 * All three run the shipped functions on stubs (`fxfeel.test.mjs`'s idiom): a text match would
 * go green on a comment and red on a reformat, and only the call site proves it runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { SHOTS } from '../src/core/Shots.js';
import { Particles, TUNE as FX_TUNE } from '../src/fx/Particles.js';
import { Guards } from '../src/ai/Guard.js';

const ALERT = SHOTS.alert;

/* ── 1. the two consumers still read the same coordinates ─────────────────────────────── */

test('alert: the shot names one pair of stands, and both consumers read that pair', () => {
  /* `guard`/`guard2` are what `alertframe.score()` frames; `stage[].at` is what
     `Guards._poseForShot` stands a body on. They were deliberately put in the same object so
     the tool that certified this frame can re-certify the shipped one — which is worth exactly
     nothing the moment they drift apart. This is that seal.

     The failure it exists to stop is not hypothetical in shape: the first draft of this shot
     put `stage` in `Guard.js`'s `SHOT_POSE` and left `guard`/`guard2` in `Shots.js`, and
     `alertframe --shot alert` immediately reported "shot has no `guard` field for this tool to
     frame". Two files, two truths, no checker. */
  assert.ok(Array.isArray(ALERT.stage), 'SHOTS.alert.stage is missing — nothing stages the guards');
  assert.equal(ALERT.stage.length, 2,
    'the alert ladder needs two rungs in frame; one rung cannot evidence a ladder (T3)');
  assert.ok(Array.isArray(ALERT.guard) && Array.isArray(ALERT.guard2),
    'SHOTS.alert lost guard/guard2 — alertframe --shot alert can no longer see its subjects');

  const stands = [ALERT.guard, ALERT.guard2];
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      [ALERT.stage[i].at[0], ALERT.stage[i].at[1]],
      [stands[i][0], stands[i][2]],
      `stage[${i}] stands at (${ALERT.stage[i].at}) but the frame tool measures (${stands[i][0]}, ${stands[i][2]}) — ` +
      'the shot is now two different shots depending on which module reads it',
    );
  }

  /* Distinct roster indices, in order. Two specs pointing at one body would stage one guard
     twice and leave the second mark hanging over nobody. */
  assert.notEqual(ALERT.stage[0].index, ALERT.stage[1].index,
    'both stage entries name the same roster index — one guard cannot stand in two places');

  /* The states are the two rungs `Particles.STAGE_RUNGS` emits, in the order it emits them.
     A `searching` guard under a rung-3 mark is a frame that contradicts itself. */
  assert.equal(ALERT.stage[0].state, 'chase', 'stage[0] carries rung 3 and must be the chase pose');
  assert.equal(ALERT.stage[1].state, 'searching', 'stage[1] carries rung 2 and must be the search pose');
});

/* ── 2. the ladder hangs on the guards the shot named ─────────────────────────────────── */

/** Minimal stand-in for a Guard: a position is all `_stageAlert` reads off one. */
const guardAt = (x, z) => ({ position: new THREE.Vector3(x, 0, z) });

/**
 * Run the shipped `_stageAlert` against a stubbed world.
 * @returns {{marks: Array<{name: string, at: THREE.Vector3}>, out: object}}
 */
function stageAlert({ shotGuards = [], list = [], player = new THREE.Vector3(-9.5, 0, 20.5) }) {
  const marks = [];
  const ctx = {
    engine: {
      get: (k) => (k === 'movement' ? { position: player }
        : k === 'guards' ? { list, guards: list, shotGuards } : null),
    },
    /* Clone: `_stageAlert` places both marks through one module-scope scratch vector, so
       recording the reference would give two entries pointing at the same mutated object —
       and the test would then pass or fail on the LAST mark twice. */
    _emit: (name, at) => { marks.push({ name, at: at.clone() }); },
  };
  const out = Particles.prototype._stageAlert.call(ctx);
  return { marks, out };
}

test('alert: the ladder hangs on the guards the SHOT named, not on whoever is nearest', () => {
  /* The rule this replaced decided the composition by proximity. That is right when nothing
     authored anything, and wrong here: `alert` stages two specific bodies at two authored
     waypoints, and an unrelated guard whose patrol phase brought him nearer would silently take
     rung 3 — the loudest mark in the ladder — and hang it over a man who has not seen anybody. */
  const a = guardAt(-18, 16);     // the shot's rung-3 guard
  const b = guardAt(-18, 1);      // the shot's rung-2 guard
  const interloper = guardAt(-11, 21);   // 1.9 m from the player: nearer than either staged one

  const { marks, out } = stageAlert({ shotGuards: [a, b], list: [interloper, a, b] });

  assert.ok(out.rung3 && out.rung2, `only ${marks.length} marks staged; both rungs must be placed`);
  assert.equal(out.rung3.x, a.position.x, 'rung 3 did not land on the guard the shot named first');
  assert.equal(out.rung3.z, a.position.z, 'rung 3 did not land on the guard the shot named first');
  assert.equal(out.rung2.x, b.position.x, 'rung 2 did not land on the guard the shot named second');
  assert.equal(out.rung2.z, b.position.z, 'rung 2 did not land on the guard the shot named second');

  /* Head height, and the number is shared rather than restated: `_onGuardAlert` uses the same
     +1.55, which is what makes a staged frame and a played one agree. */
  assert.equal(out.rung3.y, a.position.y + 1.55, 'the mark is not at head height');
  assert.equal(out.rung2.y, b.position.y + 1.55, 'the mark is not at head height');

  /* Nothing was hung on the interloper. */
  for (const m of marks) {
    assert.ok(Math.abs(m.at.x - interloper.position.x) > 0.5 || Math.abs(m.at.z - interloper.position.z) > 0.5,
      `a mark landed on the un-staged guard at (${interloper.position.x}, ${interloper.position.z})`);
  }
});

test('alert CALIBRATION: without the authored list, proximity DOES steal rung 3', () => {
  /* MUST FIRE. The arm above is only evidence that `shotGuards` is load-bearing if the same
     world without it produces a different answer — otherwise it would pass identically against
     a build where the new branch was never reached, which is this project's §210.2 `debugTerm`
     failure and the reason every seal here carries one of these.

     Same three guards, same player, `shotGuards` empty: the interloper is nearest, so he takes
     rung 3 and the shot's own rung-3 guard is demoted to rung 2. */
  const a = guardAt(-18, 16);
  const b = guardAt(-18, 1);
  const interloper = guardAt(-11, 21);

  const { out } = stageAlert({ shotGuards: [], list: [interloper, a, b] });
  assert.ok(out.rung3, 'the fallback path staged nothing at all — proximity is broken too');
  assert.equal(out.rung3.x, interloper.position.x,
    'CALIBRATION FAILED: with no authored list the nearest guard did NOT take rung 3, so the ' +
    'authored branch above is not demonstrably doing anything');
  assert.equal(out.rung2.x, a.position.x,
    'CALIBRATION FAILED: the demotion did not happen either');
});

/* ── 3. a body actually stands on the authored stand ──────────────────────────────────── */

/**
 * Run the shipped `_poseOne` against a stubbed guard. Everything it touches is here, and
 * nothing is re-implemented: `_place` and `_yawToward` are the real methods off the prototype
 * where they are cheap and pure, and the rest records that it was called.
 */
function poseOne(spec, { rosterIndex = spec.index, baseY = 0 } = {}) {
  const g = {
    index: rosterIndex,
    position: new THREE.Vector3(99, 99, 99),      // deliberately nowhere near the stand
    yaw: 0,
    forward: new THREE.Vector3(),
    speed: 7,                                      // must be zeroed by staging
    radius: 0.35,
    hadGround: false,
    route: { baseY },
    owner: { collision: null },                    // no collision: `_place` falls back to baseY
    senses: { reset() { this.wasReset = true; }, blockedLength: 0 },
    vision: { coneLength: 12 },
    root: { position: new THREE.Vector3(), rotation: { set() { this.wasSet = true; } }, updateMatrixWorld() {} },
    anim: { freeze(name, t) { this.frozen = { name, t }; } },
    _reanchor() { this.reanchored = true; },
    _place: (p) => { g.position.copy(p); if (g.route.baseY != null) g.position.y = g.route.baseY; },
    _yawToward: (p) => {
      const dx = p.x - g.position.x, dz = p.z - g.position.z;
      return Math.atan2(dx, dz);
    },
  };
  const ctx = { guards: [g], _shotLocks: [], shotGuards: [], _solveShotPose: () => { ctx.solved = true; return true; } };
  Guards.prototype._poseOne.call(ctx, spec);
  return { g, ctx };
}

test('alert: an authored spec stands the named guard on the stand, and never runs the solver', () => {
  /* `guard`'s solver walks out along the lens axis looking for the best-filling stand. That is
     right for a portrait and catastrophic here: it would move a figure whose position IS the
     composition, and `alertframe`'s certificate would describe a frame the build never renders.
     So the authored path must not reach it — asserted, not assumed. */
  const spec = ALERT.stage[0];
  const { g, ctx } = poseOne(spec);

  assert.equal(g.position.x, spec.at[0], 'the guard is not standing where the shot says');
  assert.equal(g.position.z, spec.at[1], 'the guard is not standing where the shot says');
  assert.ok(!ctx.solved,
    '_solveShotPose ran for an authored stand — the solver would move a figure whose position is ' +
    'the composition, and the frame tool has certified the authored one');

  assert.equal(g.speed, 0, 'a staged guard is still walking');
  assert.ok(g.hadGround, 'the stand was not marked as grounded, so a later probe may drop him');
  assert.ok(g.reanchored,
    'the route was not re-anchored: he is standing at one place while his beat believes another, ' +
    'and every route query downstream reads `u`');
  assert.deepEqual(g.anim.frozen, { name: spec.clip, t: spec.t }, 'the authored pose was not frozen');
  assert.equal(ctx._shotLocks.length, 1, 'the guard was not locked, so the sim will walk him off the mark');
  assert.equal(ctx.shotGuards.length, 1, 'the guard was not published, so FX cannot hang his mark');

  /* Facing: `lookAt` is the player, and he has just spotted him. A guard staged with his back
     to the subject of the frame is the defect this field exists to prevent. */
  const want = Math.atan2(spec.lookAt[0] - g.position.x, spec.lookAt[1] - g.position.z);
  assert.ok(Math.abs(g.yaw - want) < 1e-9, `staged yaw ${g.yaw} does not face lookAt (${want})`);
});

test('alert: the guard is found by ROSTER index, not by array position', () => {
  /* `this.guards` is only 1:1 with `ROSTER` when every entry built, and `Guards.init` warns and
     SKIPS a roster line whose type or route is missing. One skip shifts every later guard, and
     a positional lookup would then stage somebody else's body — silently, since the wrong guard
     poses just as convincingly as the right one. */
  const spec = ALERT.stage[1];
  const { g } = poseOne(spec, { rosterIndex: spec.index });
  assert.equal(g.index, spec.index);
  assert.equal(g.position.x, spec.at[0], 'the lookup found the wrong body');

  /* And the shape that would break a positional lookup: the only guard present carries a roster
     index HIGHER than its array position, exactly as it would after an earlier skip. */
  const shifted = {
    index: spec.index, position: new THREE.Vector3(), yaw: 0, forward: new THREE.Vector3(),
    speed: 0, radius: 0.35, hadGround: false, route: { baseY: 0 }, owner: { collision: null },
    senses: { reset() {}, blockedLength: 0 }, vision: { coneLength: 12 },
    root: { position: new THREE.Vector3(), rotation: { set() {} }, updateMatrixWorld() {} },
    anim: { freeze() {} }, _reanchor() {}, _yawToward: () => 0,
    _place(p) { this.position.copy(p); },
  };
  const ctx = { guards: [shifted], _shotLocks: [], shotGuards: [], _solveShotPose: () => true };
  Guards.prototype._poseOne.call(ctx, spec);
  assert.equal(ctx.shotGuards.length, 1,
    `roster #${spec.index} sitting at array position 0 was not found — the lookup is positional`);
});

/* ── 4. `impact`, the other branch that had never run ─────────────────────────────────── */

const IMPACT = SHOTS.impact;

/** Run the shipped `_stageImpact` against a stubbed world. */
function stageImpact({ player = new THREE.Vector3(0, 0, -8) } = {}) {
  const emits = [], decals = [];
  const ctx = {
    engine: { get: (k) => (k === 'movement' && player ? { position: player } : null) },
    _emit: (name, at, o) => { emits.push({ name, at: at.clone(), ...o }); },
    decal: (name, at, n, o) => { decals.push({ name, at: at.clone(), ...o }); },
  };
  const out = Particles.prototype._stageImpact.call(ctx);
  return { emits, decals, out };
}

test('impact: the slam is staged at the player, and every sprite is aged off zero', () => {
  /* THE AGES ARE THE POINT. `_onCaneHit`'s gameplay path emits at age 0, which is correct when
     a clock is running and catastrophic when one is not: at age 0 the shader's
     `smoothstep(0, fadeIn, u)` is exactly zero, so on the `dt = 0` capture path §195 mandates
     for A/B arms, every one of these four sprites renders NOTHING. A regression that drops the
     staged ages would produce an empty frame that no other check would notice, because the
     emitters would all still be "reached". */
  const at = new THREE.Vector3(0, 0, -8);
  const { emits, decals, out } = stageImpact({ player: at });

  const names = emits.map((e) => e.name).sort();
  assert.deepEqual(names, ['dive_debris', 'dive_dust', 'dive_ring', 'dive_spark'],
    `the slam staged ${names.join(', ') || 'nothing'}`);
  for (const e of emits) {
    assert.ok(typeof e.age === 'number' && e.age > 0,
      `${e.name} is staged at age ${e.age} — at age 0 it renders nothing at all on the dt=0 path`);
  }

  /* Both decals, because they are half the event: the ring is gone in a third of a second and
     the crack is what says something happened here. Not aged — `Decals` has its own hold ramp
     and no fade-in, so a mark is full strength the moment it lands. */
  assert.deepEqual(decals.map((d) => d.name).sort(), ['crack', 'scuff'],
    'the slam left no lasting mark on the ground');

  for (const e of emits) {
    assert.ok(Math.abs(e.at.x - at.x) < 1e-6 && Math.abs(e.at.z - at.z) < 1e-6,
      `${e.name} was staged at (${e.at.x}, ${e.at.z}), not under the player`);
  }
  assert.ok(out.point && out.radius > 0, '_stageImpact reported no framing point');
});

test('impact: the runtime and the framing tool agree about the footprint', () => {
  /* `tools/impactframe.mjs` frames a ring of `1.2 * impactScale` and a scuff of
     `3.4 * impactScale / 2`, and it reads those constants off `Particles.TUNE` rather than
     copying them — but the 1.2 and the 3.4 are still two numbers in two files. This is the
     seal that they describe one event: the certificate on `SHOTS.impact` is worthless if the
     runtime puts a differently-sized ring on the floor than the tool measured. */
  const { out, decals } = stageImpact();
  assert.equal(out.radius, 1.2 * FX_TUNE.impactScale,
    'the ring radius the runtime reports is not the one impactframe frames');
  const scuff = decals.find((d) => d.name === 'scuff');
  assert.equal(scuff.size, 3.4 * FX_TUNE.impactScale,
    'the scuff decal is not the size impactframe measured as the widest ground mark');
  assert.equal(decals.find((d) => d.name === 'crack').size, 2.2 * FX_TUNE.impactScale);

  /* And the shot is authored where a floor exists — the runtime half of the check that caught
     two bad sites. `impactframe --shot impact` owns the geometry; this owns the agreement. */
  assert.ok(Array.isArray(IMPACT?.player?.pos), 'SHOTS.impact stages no player — nothing to slam');
  assert.equal(IMPACT.player.pose, 'dive_impact',
    'the impact shot is not posed mid-slam; the FX would be landing under a standing figure');
});

test('impact CALIBRATION: with no MOVEMENT the branch still stages, at the documented fallback', () => {
  /* MUST FIRE in the sense that matters here: `_stageImpact` says outright that it uses a fixed
     offset "when MOVEMENT is absent so the branch is never a no-op", and a staging function
     that silently does nothing in a harness is the §357.1 failure this whole shot exists to
     close. If the fallback is ever removed, a headless instrument would measure an empty slam
     and report it as a slam. */
  const { emits, out } = stageImpact({ player: null });
  assert.equal(emits.length, 4, 'with no MOVEMENT the slam staged nothing — the branch IS a no-op');
  assert.equal(out.point.y, 0.06, 'the documented fallback height moved');
  assert.ok(emits.every((e) => e.age > 0), 'the fallback path lost its staged ages');
});
