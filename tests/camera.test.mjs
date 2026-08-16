import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';

/**
 * CameraRig — a headless, scripted-path simulation of the third-person camera.
 *
 * ── Why this file exists, and why it is not a screenshot ────────────────────────────────────
 *
 * `CameraRig.update()` line 630 opens with:
 *
 *     if (engine.debug.freeCam) { this._shotHeld = true; return; }
 *
 * and `engine.debug.freeCam` is exactly what the screenshot harness sets for the duration of
 * every canonical shot (`Debug.js:132` sets it, `:250` clears it). That is correct — the shots
 * would fight the rig otherwise — but the consequence is absolute and was not written down
 * anywhere until now: **no capture, of any shot, at any resolution, has ever contained a single
 * pixel produced by this file.** Every line of the follow spring, the leash, the whiskers and
 * the route telegraph is invisible to the entire visual review loop. Test `freeCam` below pins
 * that as a fact rather than leaving it as a comment somebody can drift away from.
 *
 * So the camera needs a different instrument, and this is it. `CameraRig.js` imports nothing but
 * `three` — no DOM, no renderer, no `import.meta.glob` — so the rig runs in plain Node at
 * whatever fixed dt we like, against a scripted player path.
 *
 * ── One deliberate design choice: the player is a stub, not the real Controller ─────────────
 *
 * `tests/targets.test.mjs` drives the *real* `Controller`, and that is right for the question it
 * asks (does a jump that would have missed land?), which is a question about the controller.
 * Here the subject is the camera, and the player is only a boundary condition. Driving the real
 * controller would couple every camera assertion to `Moveset.js`'s tuning — so a jump retune in
 * another lane would redden this file for reasons that have nothing to do with the camera. The
 * stub publishes the same five fields `_readPlayer()` actually consumes (`Camera Rig.js:673`:
 * position, velocity, grounded, stateName, yaw) and nothing else.
 *
 * ── The trap this instrument had to be built around ─────────────────────────────────────────
 *
 * `_pickRoute()` reaches `col.query()` only through `_solidCollision()` (`:1356`), which returns
 * `null` unless the collision module exposes `capsuleSweep` **or** `raycast`. A stub carrying
 * only `query()` — the obvious thing to write, since `query()` is the method under test — makes
 * the whole route telegraph silently sense nothing, and every route assertion would then "pass"
 * by measuring zero against zero. `certification` below is the arm that catches that: it asserts
 * the *deaf* stub reads 0 and the *hearing* stub reads > 0, so a future edit that breaks the
 * wiring cannot hide inside a green suite.
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

class StubInput {
  constructor() {
    this.look = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.zoom = 0;
  }
  pressed() { return false; }
  down() { return false; }
}

/** The five fields `_readPlayer()` consumes, and nothing else. */
class StubMovement {
  constructor() {
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.grounded = true;
    this.stateName = 'idle';
    this.yaw = Math.PI;
  }
}

/**
 * A collision stub. `hits` is the fixed answer to every `query()`.
 *
 * `hearing` is the instrument's own lever: false drops `raycast`, which is what `_solidCollision`
 * gates on, so the rig cannot reach `query()` at all. See the header — this is the arm that
 * certifies the rest.
 */
class StubCollision {
  constructor(hits = [], { hearing = true } = {}) {
    this.hits = hits;
    this.ready = true;
    this.queries = 0;
    if (hearing) {
      // Nothing occludes: the boom is free, so route effects are never confounded by whiskers.
      this.raycast = () => null;
      this.capsuleSweep = () => null;
    }
  }
  query() { this.queries++; return this.hits; }
  overlap() { return false; }
}

function stubEngine({ collision = null } = {}) {
  const movement = new StubMovement();
  const listeners = new Map();
  return {
    input: new StubInput(),
    camera: new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 1000),
    scene: new THREE.Scene(),
    movement, collision,
    time: 0, dt: 0, timeScale: 1,
    width: 1920, height: 1080, quality: 'high',
    warnings: [],
    debug: { freeCam: false, showColliders: false, wireframe: false },
    get(name) { return name === 'movement' ? this.movement : name === 'collision' ? this.collision : null; },
    warn(m) { this.warnings.push(String(m)); },
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn);
    },
    emit(evt, p) { for (const fn of listeners.get(evt) || []) fn(p); },
  };
}

async function makeRig(opts = {}) {
  const engine = stubEngine(opts);
  const rig = new CameraRig(engine);
  await rig.init();
  return { engine, rig, mv: engine.movement };
}

/** Advance the rig `seconds` at a fixed dt, optionally driving the player each step. */
function run(engine, rig, seconds, step = null, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    if (step) step(i * dt, dt, engine.movement);
    engine.time += dt;
    rig.update(dt, engine.time);
  }
  return n;
}

/* ---------------------------------------------------------------------- */
/* route fixtures                                                          */
/* ---------------------------------------------------------------------- */

/**
 * One `query()` hit, in the published shape `_pickRoute`/`_routeShape` read: `{tag, point,
 * distance, rec:{mesh:{userData}}}`. `top` is the bonus branch ARCHITECTURE authors on poles;
 * `spline` is the §4.4 contract for rails.
 */
function hit(tag, point, { top = null, spline = null, tangent = null, distance = null } = {}) {
  const userData = {};
  if (top != null) userData.top = top;
  if (spline) userData.spline = spline;
  return {
    tag,
    point: point.clone(),
    distance: distance ?? point.length(),
    tangent: tangent ? tangent.clone() : undefined,
    rec: { tag, mesh: { userData } },
  };
}

/** A straight horizontal rail as a §4.4 spline — all line, no rise. */
function levelRail(a, b) {
  return {
    getPoint(t, out) {
      const v = out || new THREE.Vector3();
      return v.lerpVectors(a, b, t);
    },
  };
}

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* ====================================================================== */
/* 0 — freeCam: the reason this file is not a screenshot                   */
/* ====================================================================== */

test('freeCam: the harness bypass is total — no capture can ever see this file run', async () => {
  const { engine, rig } = await makeRig();
  engine.debug.freeCam = true;

  // Pose the camera exactly as a canonical shot would, then let the rig "run" for two seconds
  // while the player sprints away from it.
  const posed = new THREE.Vector3(12, 7, -33);
  const quat = engine.camera.quaternion.clone();
  engine.camera.position.copy(posed);
  engine.camera.fov = 41;

  run(engine, rig, 2.0, (t, dt, mv) => {
    mv.position.z -= 7.2 * dt;
    mv.velocity.set(0, 0, -7.2);
    mv.stateName = 'run_fast';
  });

  assert.equal(engine.camera.position.distanceTo(posed), 0, 'freeCam let the rig move the camera');
  /* Component equality, not `angleTo`. `Quaternion.angleTo` is `2·acos(|dot|)` and a unit
     quaternion's dot with ITSELF lands a hair under 1 in float64, so it reports 4.2e-8 rad for a
     quaternion that was never touched — a measurement artefact indistinguishable from a real
     2-microdegree drift. If the rig returned before writing, these four are bit-identical. */
  for (const k of ['x', 'y', 'z', 'w']) {
    assert.equal(engine.camera.quaternion[k], quat[k], `freeCam let the rig rotate the camera (${k})`);
  }
  assert.equal(engine.camera.fov, 41, 'freeCam let the rig touch the lens');

  // …and the moment the harness hands control back, the rig re-seeds rather than sweeping.
  engine.debug.freeCam = false;
  rig.update(1 / 60, engine.time);
  assert.notEqual(engine.camera.position.distanceTo(posed), 0, 'the rig never took the camera back');
  assert.ok(rig.pivot.distanceTo(engine.movement.position) < 3.0,
    `after the handback the pivot is ${rig.pivot.distanceTo(engine.movement.position).toFixed(2)} m ` +
    'from the player — it swept instead of snapping');
});

/* ====================================================================== */
/* 1 — instrument certification: the deaf stub must read zero              */
/* ====================================================================== */

test('certification: a collision stub without raycast senses no route at all', async () => {
  const parapet = [hit('ledge', new THREE.Vector3(0, 4, -4.63), { top: 4, distance: 4.63 })];

  const deaf = await makeRig({ collision: new StubCollision(parapet, { hearing: false }) });
  run(deaf.engine, deaf.rig, 1.0);

  const hearing = await makeRig({ collision: new StubCollision(parapet) });
  run(hearing.engine, hearing.rig, 1.0);

  assert.equal(deaf.engine.collision.queries, 0,
    '`_solidCollision` let a stub with no raycast/capsuleSweep through — the gate at :1356 moved');
  assert.equal(deaf.rig._routeUpW, 0, 'the deaf arm somehow sensed a route');
  assert.ok(hearing.engine.collision.queries > 0, 'the hearing arm never reached col.query()');
  assert.ok(hearing.rig._routeUpW > 0,
    'the hearing arm sensed nothing either — every route assertion below would be 0 vs 0');

  console.log(`\n[certification] deaf ${deaf.engine.collision.queries} queries / routeUpW ` +
    `${deaf.rig._routeUpW.toFixed(4)} · hearing ${hearing.engine.collision.queries} queries / ` +
    `routeUpW ${hearing.rig._routeUpW.toFixed(4)}`);
});

/* ====================================================================== */
/* 2 — the two numbers `_pickRoute`'s docstring commits to                 */
/* ====================================================================== */

/**
 * The docstring above `_pickRoute` states: "Measured: 0.2 m kerb → 0.000, 4 m parapet → 0.369."
 *
 * A score is a function of BOTH the crest height and the distance, and the comment named only
 * the height — so the number was unreproducible as written. This test fixes the whole scenario
 * (dead ahead, standing at the origin, 4.63 m away) and re-derives the expected value from the
 * constants rather than pasting it, so the assertion survives a retune of any of them and the
 * comment can finally be corrected to quote its instrument.
 *
 * One honesty note about that 4.63 m, because it matters for what this test does and does not
 * prove. The distance was obtained by INVERTING the scoring formula against the recorded 0.369 —
 * so "0.369 reproduces" is circular and is not the claim here. The claim is the non-circular
 * half: at whatever distance you pick, the code's score equals the value derived independently
 * from `routeNear`/`routeRange`/`routeRiseMin`/`routeRiseFull` and `ROUTE_WEIGHT`. That holds at
 * any D and would catch any drift in the pipeline. Whether the original measurement was actually
 * taken at 4.63 m is unknown and unknowable from what was written down; it is merely the
 * distance at which the recorded number comes out.
 */
test('route scoring: a 4 m parapet scores, a 0.2 m kerb scores exactly zero', async () => {
  const D = 4.63;                                     // metres, dead ahead on −Z
  const at = (h) => [hit('ledge', new THREE.Vector3(0, h, -D), { top: h, distance: D })];

  /* First principles, from the constants — not from the code under test. */
  const eyeY = 0 + TUNE.pivotHeight;                  // player at y = 0
  const near = 1 - smoothstep(TUNE.routeNear, TUNE.routeRange, D);
  const facing = 1;                                   // dead ahead: ahead = 1
  const base = 0.75 * near * facing;                  // ROUTE_WEIGHT.ledge = 0.75
  const riseRamp = smoothstep(TUNE.routeRiseMin, TUNE.routeRiseFull, 4 - eyeY);
  const expect = base * riseRamp;

  const par = await makeRig({ collision: new StubCollision(at(4)) });
  par.rig.update(1 / 60, 0);                          // one poll is enough; _routeUpRaw is the raw read
  const kerb = await makeRig({ collision: new StubCollision(at(0.2)) });
  kerb.rig.update(1 / 60, 0);

  console.log(`\n[route] parapet 4.0 m @ ${D} m dead ahead → routeUpRaw ` +
    `${par.rig._routeUpRaw.toFixed(4)} (first principles ${expect.toFixed(4)}; ` +
    `near ${near.toFixed(4)} · riseRamp ${riseRamp.toFixed(4)}) · kerb 0.2 m → ` +
    `${kerb.rig._routeUpRaw.toFixed(4)}`);

  assert.ok(Math.abs(par.rig._routeUpRaw - expect) < 1e-6,
    `parapet scored ${par.rig._routeUpRaw} against ${expect} derived from the constants`);
  assert.equal(kerb.rig._routeUpRaw, 0,
    'a 0.2 m kerb produced a non-zero route weight — the level is built out of `ledge`, so this ' +
    'is the assertion that stops the camera twitching at every step in the game');
});

/* ====================================================================== */
/* 3 — the ramps are not multiplied: a level rail drives SIDE, not UP      */
/* ====================================================================== */

/**
 * `_pickRoute` argues at length that `riseRamp` and `lineRamp` must NOT be multiplied, because
 * "a pole has all the rise and no line; a rail at chest height has all the line and no rise".
 * That claim has a sharp consequence which is what this test pins: a long flat rail — the most
 * legible line in the level — must still drive the SIDE channel while contributing nothing to UP.
 */
test('route channels: a level rail drives SIDE with zero UP; a pole is the mirror image', async () => {
  const a = new THREE.Vector3(-6, 1.30, -4);
  const b = new THREE.Vector3(6, 1.30, -4);
  const rail = hit('rail', new THREE.Vector3(0, 1.30, -4), { spline: levelRail(a, b), distance: 4.0 });
  const r = await makeRig({ collision: new StubCollision([rail]) });
  r.rig.update(1 / 60, 0);

  const pole = hit('pole', new THREE.Vector3(0, 0, -4), { top: 9.0, distance: 4.0 });
  const p = await makeRig({ collision: new StubCollision([pole]) });
  p.rig.update(1 / 60, 0);

  console.log(`\n[channels] level rail → up ${r.rig._routeUpRaw.toFixed(4)} side ` +
    `${r.rig._routeSideRaw.toFixed(4)} · 9 m pole → up ${p.rig._routeUpRaw.toFixed(4)} side ` +
    `${p.rig._routeSideRaw.toFixed(4)}`);

  // The rail sits at 1.30 m, below eye height 1.42 — no rise at all, by construction.
  assert.equal(r.rig._routeUpRaw, 0, 'a chest-height rail contributed to the UP channel');
  assert.ok(r.rig._routeSideRaw > 0.3,
    `a 12 m level rail 4 m away scored only ${r.rig._routeSideRaw.toFixed(4)} on SIDE — if the ` +
    'ramps were multiplied this would be 0, which is the bug the comment says it fixed');

  // A vertical pole is the mirror: all rise, and `_line` degenerates to nothing horizontal.
  assert.ok(p.rig._routeUpRaw > 0.5, `a 9 m pole scored only ${p.rig._routeUpRaw.toFixed(4)} on UP`);
  assert.equal(p.rig._routeSideRaw, 0, 'a vertical pole contributed to the SIDE channel');
});

/* ====================================================================== */
/* 4 — §357.1: the telegraph must reach the camera, not just the rig       */
/* ====================================================================== */

/**
 * This project's most-repeated defect is logged as §357.1 — "machinery wired at one end only: a
 * guard that exists is not a guard that runs". The route telegraph is a textbook candidate: it
 * computes two weights in `_senseRoute` and then relies on three separate consumers to spend
 * them (`_pivotGoal` +routeLift, `_boomLength` +routeDist, `_write` +routeFov). Asserting on
 * `_routeUpW` alone would prove none of that. So this arm asserts on `engine.camera` — the only
 * surface anything downstream ever sees — with the SAME player, the SAME frames, and the route
 * as the single lever.
 */
test('route telegraph: a sensed route changes the camera the renderer actually gets', async () => {
  const pole = hit('pole', new THREE.Vector3(0, 0, -4), { top: 9.0, distance: 4.0 });

  const off = await makeRig({ collision: new StubCollision([]) });
  run(off.engine, off.rig, 2.0);
  const on = await makeRig({ collision: new StubCollision([pole]) });
  run(on.engine, on.rig, 2.0);

  const dFov = on.engine.camera.fov - off.engine.camera.fov;
  const dLook = on.rig.pivot.y - off.rig.pivot.y;
  const dBoom = on.rig.boom - off.rig.boom;

  console.log(`\n[telegraph] Δfov ${dFov.toFixed(3)}° (ceiling ${TUNE.routeFov}) · Δpivot.y ` +
    `${dLook.toFixed(3)} m (ceiling ${TUNE.routeLift}) · Δboom ${dBoom.toFixed(3)} m ` +
    `(ceiling ${TUNE.routeDist}) · routeUpW ${on.rig._routeUpW.toFixed(4)}`);

  assert.ok(on.rig._routeUpW > 0.5, 'the route arm did not sense the pole — scenario, not wiring');
  assert.ok(dFov > 0.5, `the lens never opened (Δfov ${dFov.toFixed(3)}°) — routeFov is unwired`);
  assert.ok(dLook > 0.3, `the look-at never lifted (Δ ${dLook.toFixed(3)} m) — routeLift is unwired`);
  assert.ok(dBoom > 0.1, `the boom never lengthened (Δ ${dBoom.toFixed(3)} m) — routeDist is unwired`);

  // Bounded, not aimed: the whole argument for `routeLift` is that pointing at the crest of a
  // 9 m pole would put Sly off the bottom of the frame.
  assert.ok(dLook <= TUNE.routeLift + 1e-6,
    `the look-at rose ${dLook.toFixed(3)} m against a ${TUNE.routeLift} m ceiling`);
  assert.ok(dFov <= TUNE.routeFov + 1e-6, `the lens opened ${dFov.toFixed(3)}° past its ceiling`);
});

/* ====================================================================== */
/* 5 — the leash, which is the one thing a spring cannot be tuned into     */
/* ====================================================================== */

/**
 * `followLeashV`'s comment states the case it exists for: `Controller.TUNE.maxFall` is −40 m/s
 * and `maxFollowV` is 16, so on a long drop the look-at falls behind at 24 m/s and the character
 * leaves frame — "measured 9.85 m behind after 1.5 s of falling". Both halves are checked here:
 * the unleashed lag is re-derived by raising the leash out of the way, and the shipped leash is
 * shown to hold. Raising a constant to measure the arm without it is the same technique the
 * targets suite uses for `catch`, and the restore is in a `finally`.
 */
test('leash: a 1.5 s fall at maxFall would strand the look-at; the leash holds it', async () => {
  const FALL = -40;                     // Controller.TUNE.maxFall
  const T = 1.5;
  const drop = (t, dt, mv) => { mv.position.y += FALL * dt; mv.velocity.set(0, FALL, 0); mv.grounded = false; mv.stateName = 'fall'; };

  const saved = TUNE.followLeashV;
  let unleashed;
  try {
    TUNE.followLeashV = 1e9;            // the arm that certifies the leash has something to do
    const u = await makeRig();
    u.mv.position.set(0, 0, 0);
    u.rig.snap(true);
    run(u.engine, u.rig, T, drop);
    unleashed = u.rig.pivot.y - (u.mv.position.y + TUNE.pivotHeight);
  } finally {
    TUNE.followLeashV = saved;
  }

  const l = await makeRig();
  l.mv.position.set(0, 0, 0);
  l.rig.snap(true);
  run(l.engine, l.rig, T, drop);
  const leashed = l.rig.pivot.y - (l.mv.position.y + TUNE.pivotHeight);

  console.log(`\n[leash] after ${T}s at ${FALL} m/s the look-at sits ${unleashed.toFixed(2)} m ` +
    `above the character unleashed, ${leashed.toFixed(2)} m leashed (followLeashV ${saved})`);

  assert.ok(unleashed > 6,
    `the unleashed arm only lagged ${unleashed.toFixed(2)} m — the scenario is not the one the ` +
    'constant was written for, so the leashed arm proves nothing');
  assert.ok(leashed < unleashed - 3, 'the leash made no measurable difference');
  // The leash bounds `_goal.y − pivot.y`; `_goal` also carries the fall lead, so the bound on the
  // distance to the CHARACTER is followLeashV + fallLeadMax, and that is the quantity that
  // decides whether he is on screen.
  assert.ok(leashed <= TUNE.followLeashV + TUNE.fallLeadMax + 1e-6,
    `leashed lag ${leashed.toFixed(3)} m exceeds followLeashV + fallLeadMax ` +
    `(${(TUNE.followLeashV + TUNE.fallLeadMax).toFixed(2)} m)`);
});

/* ====================================================================== */
/* 6 — the softness gate: a jump must never trip it, a climb must          */
/* ====================================================================== */

/**
 * `followErrSoft`'s comment carries the load-bearing claim that "a jump's entire ascent is
 * 0.458 s and never reaches `followHoldFull`", i.e. that the vertical spring stays soft through
 * every jump in the game and stiffens only for sustained travel. The gate is
 * `sustained = max(FRAMES[key].vtrack, smoothstep(followHoldMin, followHoldFull, _vHold))`, so
 * there are two ways in and both are checked: a 0.458 s ascent must not reach the debounce, and
 * `climb` must be stiff on frame one through `vtrack` without waiting for any debounce at all.
 */
test('vertical softness: a jump ascent never trips the debounce; a climb is stiff on frame one', async () => {
  const ASCENT = 0.458;                  // seconds, from the §6 jump

  const j = await makeRig();
  run(j.engine, j.rig, ASCENT, (t, dt, mv) => {
    mv.position.y += 5.5 * dt; mv.velocity.set(0, 5.5, 0); mv.grounded = false; mv.stateName = 'jump';
  });
  const jumpHold = j.rig._vHold;

  const c = await makeRig();
  c.mv.stateName = 'pole_climb';         // STATE_RULES maps 'pole' → climb, which carries vtrack: 1
  c.rig.update(1 / 60, 0);               // one frame: no debounce has had time to accumulate

  console.log(`\n[softness] jump ascent ${ASCENT}s → _vHold ${jumpHold.toFixed(3)}s against ` +
    `followHoldMin ${TUNE.followHoldMin} / followHoldFull ${TUNE.followHoldFull} · climb frameKey ` +
    `"${c.rig._frameKey}" vtrack on frame 1`);

  assert.ok(jumpHold < TUNE.followHoldMin,
    `a ${ASCENT}s ascent accumulated ${jumpHold.toFixed(3)}s of hold, at or past followHoldMin ` +
    `${TUNE.followHoldMin} — the softness would stiffen mid-jump, which is the bob the comment ` +
    'says it exists to avoid');
  assert.equal(c.rig._frameKey, 'climb',
    'a pole climb did not resolve to the `climb` framing, so vtrack never applies');
});
