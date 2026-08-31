import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { Controller, TUNE } from '../src/player/Controller.js';
/* Arm 20's recorder. Imported HERE, at the top, rather than inside the arm: it wraps
   `StateMachine.prototype.set`, and an entry made before the wrapper is installed is invisible.
   Importing it from the arm would census only the arms that ran after it. */
import { record as SM_RECORD } from './_smtrace.mjs';

/**
 * traversal.test.mjs — the attach states, and the four ways out of them that did not exist.
 *
 * Every bug pinned here was the same bug: **a state Sly could enter and not leave.** Four of
 * them, in `hookSwing` and `railSlide`, survived the entire project. They passed every test,
 * warned nobody, and could not have been caught by a capture — `Controller.js:641` returns
 * before `sm.update` whenever `debug.freeCam` is set, which is how every shot in `shots/` is
 * taken, so `Moveset.js` has never contributed a pixel to a single frame in this repository's
 * history. A headless run of the real controller is not *a* way to see this code; it is the
 * only way.
 *
 * ── The instrument ──────────────────────────────────────────────────────────────────────────
 * The same one `tests/targets.test.mjs` established and for the same reason: the real
 * `Controller`, the real `buildMoveset()`, a fixed dt, scripted input, and a stub COLLISION that
 * answers `raycast` / `capsuleSweep` / `nearest` for one flat floor, one vertical wall and a
 * registry of point affordances. `Controller.js`, `Moveset.js`, `States.js` and `Targets.js` all
 * import in plain Node, so the whole machine runs here.
 *
 * ── Read this before you write a probe ──────────────────────────────────────────────────────
 * **`groundCheck` returns the topmost surface below the cast origin, so the origin selects which
 * floor you are asking about.** Casting from y = 20 at a spot with a roof at 13.50 and paving at
 * 0.00 answers "the roof", and answers it with a plausible number. This cost one route this
 * session — two probes of the same spot returned 13.50 and 0.00 and neither was wrong.
 *
 * It is the fourth instance here of the same failure: a correct call against a world that was not
 * the one intended. The others were a harness built without `Terrain` (so the desert did not
 * exist), a controller whose `col` was still `FLAT` because `_bindCollision` only runs inside
 * `update()`, and `afford()`/`mark()` memoised on a `_frame` that never advanced. **All four
 * returned plausible numbers, and none of them failed.** Inspection did not catch any of them;
 * an implausible clock caught one and an implausible count caught another.
 *
 * So: pin the origin, bind collision by stepping at least one frame before probing, advance
 * `_frame` between memoised queries, and assert your world is the world you meant — the collider
 * count in `realWorld()` is there for exactly that.
 *
 * ── Why every arm carries a lever ───────────────────────────────────────────────────────────
 * `tests/targets.test.mjs`'s header states the rule this file obeys: *a calibration arm must
 * move, or the instrument proved nothing.* An assertion that "Sly leaves the hook" is equally
 * consistent with a hook he was never really on. So each regression arm below runs the SAME
 * scenario twice with ONE lever moved, and asserts the broken behaviour is still reproducible
 * when the guard is removed. The levers are the guards themselves, reached through the state
 * instances — `buildMoveset()` is called per `Controller` (`Controller.js:597`), so patching one
 * simulation's state object cannot leak into another's.
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

/* The state-driving harness, moved out to `tests/_moveset.mjs` (§424) so the seven other test
   files that reason about states can drive them instead of assigning `stateName` as a string.
   MOVED, not copied — nothing below redefines any of it, and a second world builder appearing
   beside `realWorld()` is the defect §424 exists to prevent. */
import {
  StubInput, stubEngine, stubCollision, stubGuards, makeSim, V, DT, run, countEvents,
  railPoints, PITCH, ladderWall, VENT_HALF, hookItem, poleItem, spireItem,
  BLANK_WALL, LEDGE_WALL, censusSetup, realWorld, hardReset, driveRoute,
} from './_moveset.mjs';

/* ====================================================================== */
/* 1 — the hook was a one-way door                                         */
/* ====================================================================== */

const RING = V(0, 8, -6);
const hookPoints = () => [{
  tag: 'hook', rec: { id: 'ring0', mesh: { userData: {} } },
  point: () => RING.clone(), tangent: V(0, 1, 0),
}];

/** Fly into the ring, then tap jump every 20 frames for 4 seconds. */
async function hookRun({ defeatGuard = false } = {}) {
  const { engine, c } = await makeSim({ points: hookPoints() });
  if (defeatGuard) c.sm.get('hookSwing').spent = () => false;   // ← the lever
  c.position.set(0, 6.5, -3.0);
  c.velocity.set(0, 2.0, -7.0);
  c.grounded = false;
  c.sm.set('fall');
  let grabbed = -1;
  run(engine, c, 240, (i, inp) => {
    if (grabbed >= 0 && i > grabbed && (i - grabbed) % 20 === 0) inp.hold('jump'); else inp.let_go('jump');
  }, (i) => { if (grabbed < 0 && c.stateName === 'hookSwing') grabbed = i; });
  return {
    engine, c, grabbed,
    grabs: countEvents(engine, 'hookGrab'),
    releases: countEvents(engine, 'hookRelease'),
    away: c.position.distanceTo(RING),
  };
}

test('hook: the geometry that made the release a no-op is still real', () => {
  /* Calibration for the whole section, and the reason the guard cannot be deleted as
     "defensive". `afford('hook')` measures from the eye, `TUNE.radius`-agnostic, 1.15 m up the
     capsule, so at swing angle θ the distance it reports is |2.2·u + 1.15·ŷ| =
     √(hookL² + 1.15² − 2·hookL·1.15·cos θ). If that is inside `hookAuto` across the whole
     reachable arc, the fly-through clause re-takes Sly on the release frame — every time. */
  const L = TUNE.hookL, E = 1.15;
  const at = (deg) => Math.hypot(L * Math.sin(deg * Math.PI / 180), L * Math.cos(deg * Math.PI / 180) - E);
  assert.ok(at(0) < TUNE.hookAuto, `hanging straight down: ${at(0).toFixed(3)} m is outside hookAuto`);
  assert.ok(at(90) < TUNE.hookAuto, `horizontal: ${at(90).toFixed(3)} m is outside hookAuto`);
  // The threshold is only crossed past horizontal, which a pendulum starting below its anchor
  // cannot reach — so there is no release position that survives its own frame unaided.
  const cross = Math.acos((L * L + E * E - TUNE.hookAuto ** 2) / (2 * L * E)) * 180 / Math.PI;
  console.log(`\n[hook] eye→anchor ${at(0).toFixed(3)} m down, ${at(90).toFixed(3)} m level; ` +
              `reaches hookAuto ${TUNE.hookAuto} only at θ ${cross.toFixed(1)}°`);
  assert.ok(cross > 90, `hookAuto is escaped at ${cross.toFixed(1)}°, which is reachable`);
});

test('hook: with the release guard removed, Sly can never leave the ring (calibration)', async () => {
  const r = await hookRun({ defeatGuard: true });
  assert.ok(r.grabbed >= 0, 'the scenario never grabbed the hook at all');
  assert.ok(r.releases >= 5, `only ${r.releases} release attempts — the scenario is not exercising the bail`);
  assert.ok(r.away < 0.01 + TUNE.hookL, `expected Sly pinned on the rope sphere, was ${r.away.toFixed(3)} m out`);
  assert.ok(r.grabs > 1, `re-grab never happened (${r.grabs} grabs) — the lever did not move`);
  console.log(`[hook] guard OFF: ${r.grabs} grabs / ${r.releases} releases / ${r.away.toFixed(3)} m from the ring`);
});

test('hook: one release leaves, and leaves for good', async () => {
  const r = await hookRun();
  assert.equal(r.grabs, 1, `expected exactly one grab, got ${r.grabs}`);
  assert.equal(r.releases, 1, `expected exactly one release, got ${r.releases}`);
  assert.ok(r.away > 10, `Sly only got ${r.away.toFixed(2)} m from the ring`);
  assert.notEqual(r.c.stateName, 'hookSwing');
  console.log(`[hook] guard ON:  ${r.grabs} grabs / ${r.releases} releases / ${r.away.toFixed(2)} m from the ring`);
});

/* ====================================================================== */
/* 2 — the hook swallowed jump for eleven frames                           */
/* ====================================================================== */

test('hook: the bail window starts where hookMinSwing and the jump buffer say it does', async () => {
  /* `hookMinSwing` 0.18 s deliberately exceeds `jumpBufferMs` 0.14 s so that the press which
     STARTS a swing can never be the press that ends it. A buffered poll must respect that, so
     the earliest presses stay dropped BY DESIGN and everything after them must be honoured.
     Both halves are asserted; only asserting the recovered half would pass on a state that had
     simply dropped the gate. */
  const seen = [];
  for (let f = 0; f <= 12; f++) {
    const { engine, c } = await makeSim({ points: hookPoints() });
    c.position.set(0, 6.5, -3.0); c.velocity.set(0, 2.0, -7.0); c.grounded = false; c.sm.set('fall');
    let grabbed = -1;
    run(engine, c, 120, (i, inp) => {
      if (grabbed >= 0 && i === grabbed + f) inp.hold('jump'); else inp.let_go('jump');
    }, (i) => { if (grabbed < 0 && c.stateName === 'hookSwing') grabbed = i; });
    seen.push(countEvents(engine, 'hookRelease') > 0);
  }
  const firstHonoured = seen.indexOf(true);
  const gateFrames = Math.ceil(TUNE.hookMinSwing * 60);
  const bufferFrames = Math.floor(TUNE.jumpBufferMs / 1000 * 60);
  console.log(`[hook] first honoured tap: +${firstHonoured} frames ` +
              `(gate ${gateFrames}, buffer ${bufferFrames}) — before: +${gateFrames}`);
  // A press whose buffer is dead before the gate opens cannot be honoured, and must not be.
  assert.equal(seen[0], false, 'the press that started the swing also ended it');
  assert.ok(firstHonoured > 0 && firstHonoured <= gateFrames - bufferFrames + 1,
    `first honoured tap at +${firstHonoured} does not match gate ${gateFrames} − buffer ${bufferFrames}`);
  // Everything from there to the gate is what the buffer recovered — 8 frames on shipped numbers.
  for (let f = firstHonoured; f <= 12; f++) assert.equal(seen[f], true, `tap at +${f} frames was dropped`);
  assert.ok(gateFrames - firstHonoured >= 6, 'the recovered window is smaller than the measurement claimed');
});

/* ====================================================================== */
/* 3 — the rail could not be ridden off its own end, or crouched off       */
/* ====================================================================== */


async function railRun({ len, from, vel, hold = null, frames = 200, defeatGuard = false }) {
  const a = V(-len / 2, 5, -6), b = V(len / 2, 5, -6);
  const { engine, c } = await makeSim({ points: railPoints(a, b, len) });
  if (defeatGuard) c.sm.get('railSlide').stepOff = () => {};   // ← the lever
  c.position.copy(from); c.velocity.copy(vel); c.grounded = false; c.sm.set('fall');
  let mounted = -1;
  const states = new Map();
  run(engine, c, frames, (i, inp) => {
    if (hold && mounted >= 0 && i > mounted + 5) inp.hold(hold);
    if (hold === null) inp.move.y = 1;
  }, (i) => {
    if (mounted < 0 && c.stateName.startsWith('rail')) mounted = i;
    states.set(c.stateName, (states.get(c.stateName) || 0) + 1);
  });
  return { engine, c, mounted, states, mounts: countEvents(engine, 'railMount') };
}

test('rail: with the step-off guard removed, the end of a rail is a permanent lock (calibration)', async () => {
  const r = await railRun({ len: 8, from: V(2.0, 5.4, -6), vel: V(1, -1, 0), defeatGuard: true, frames: 180 });
  assert.ok(r.mounted >= 0, 'never mounted the rail');
  assert.equal(r.states.get('railSlide'), 180, 'expected every frame stuck in railSlide');
  assert.ok(r.mounts > 100, `only ${r.mounts} re-mounts — the lever did not move`);
  assert.ok(Math.abs(r.c.rail.u - 1) < 1e-6, 'expected to be pinned at the far end of the spline');
  console.log(`\n[rail] guard OFF: ${r.mounts} railMount events, 180/180 frames in railSlide, pinned at u=1`);
});

test('rail: rides off its own end and keeps going', async () => {
  const r = await railRun({ len: 8, from: V(2.0, 5.4, -6), vel: V(1, -1, 0), frames: 180 });
  assert.equal(r.mounts, 1, `expected one mount, got ${r.mounts}`);
  assert.ok(r.states.get('railSlide') < 40, 'still spending most of the run on the rail');
  assert.ok(r.states.get('fall') > 10, 'never left the rail into a fall');
  assert.ok(r.c.position.x > 5, `only reached x ${r.c.position.x.toFixed(2)} — did not leave the rail end`);
  console.log(`[rail] guard ON:  ${r.mounts} railMount event, railSlide ${r.states.get('railSlide')} frames, ` +
              `ran on to x ${r.c.position.x.toFixed(2)}`);
});

test('rail: crouch steps off cleanly instead of stuttering down the mount envelope', async () => {
  const broken = await railRun({ len: 28, from: V(-6, 5.4, -6), vel: V(4, -1, 0), hold: 'crouch', defeatGuard: true });
  const fixed = await railRun({ len: 28, from: V(-6, 5.4, -6), vel: V(4, -1, 0), hold: 'crouch' });
  assert.ok(broken.mounts > 20, `calibration did not move: ${broken.mounts} mounts`);
  assert.equal(fixed.mounts, 1, `expected one mount, got ${fixed.mounts}`);
  // The stutter also threw the momentum away: each re-mount zeroes velocity.
  assert.ok(fixed.c.position.x > broken.c.position.x + 1.5,
    `crouch-off kept no momentum: ${fixed.c.position.x.toFixed(2)} vs ${broken.c.position.x.toFixed(2)}`);
  console.log(`[rail] crouch off — guard OFF ${broken.mounts} mounts, ended x ${broken.c.position.x.toFixed(2)}; ` +
              `guard ON ${fixed.mounts} mount, ended x ${fixed.c.position.x.toFixed(2)}`);
});

/* ====================================================================== */
/* 4 — the pole swing swallowed jump for eight frames                      */
/* ====================================================================== */

test('pole: a jump tapped during the wind-up is honoured when the gate opens', async () => {
  const polePoints = () => [{
    tag: 'pole',
    rec: { id: 'p0', mesh: { userData: { bottom: 0, top: 12 }, geometry: { parameters: { radiusTop: 0.5 } } } },
    point: (p) => V(0, Math.min(12, Math.max(0, p.y)), -6),
    tangent: V(0, 1, 0),
  }];
  const ends = [];
  for (let f = 0; f <= 10; f++) {
    const { engine, c } = await makeSim({ points: polePoints() });
    c.position.set(0, 4, -5.0); c.velocity.set(0, 0, -3); c.grounded = false; c.sm.set('fall');
    let swing = -1, left = -1;
    run(engine, c, 90, (i, inp) => {
      inp.move.y = 1;
      if (c.stateName === 'poleClimb' && swing < 0) inp.hold('attack');
      if (swing >= 0 && i === swing + f) inp.hold('jump');
    }, (i) => {
      if (swing < 0 && c.stateName === 'poleSwing') { swing = i; return; }
      if (swing >= 0 && left < 0 && c.stateName !== 'poleSwing') left = i;
    });
    assert.ok(swing >= 0, `frame offset ${f}: never entered poleSwing`);
    ends.push(left - swing);
  }
  const full = Math.round(TUNE.poleSwingTime * 60);
  const gate = Math.ceil(TUNE.poleSwingMin * 60);
  console.log(`\n[pole] swing ends at +${ends.join(', +')} frames (full wind-up ${full}, gate ${gate})`);
  // `sm.time` crosses `poleSwingTime` between frames, so the full wind-up ends on `full` or the
  // frame after it; what matters is that the +0 tap bought nothing.
  assert.ok(ends[0] >= full, `the attack press that started the swing also released it (+${ends[0]})`);
  for (let f = 1; f <= 10; f++) {
    assert.ok(ends[f] < full, `tap at +${f} frames was dropped: swing ran the full ${full}`);
    assert.ok(ends[f] >= gate, `tap at +${f} released before the ${gate}-frame wind-up gate`);
  }
});

/* ====================================================================== */
/* 5 — an authored target could not hand off to a ledge or notch state     */
/* ====================================================================== */

test('targets: arrive hands off directly instead of sitting out magHold', async () => {
  const WALL = { z: -10, top: 4, rec: { id: 'block' } };
  const P = V(0, 2.30, -9.40);
  async function arrive(name) {
    const { engine, c } = await makeSim({ wall: WALL });
    c.position.set(0, 3.6, -7.2); c.velocity.set(0, 0.5, -5.0); c.grounded = false; c.sm.set('fall');
    c.addTarget({ id: 'ledge-notch', point: P.clone(), volume: 3.3, catch: 2.0, arrive: name });
    const first = new Map();
    run(engine, c, 90, () => {}, (i) => { if (!first.has(c.stateName)) first.set(c.stateName, i); });
    return { c, first, reason: c.targets.lastRelease };
  }
  /* One lever: `arrive`. Unset, the arrival must fall through to `magHold` and be picked up by
     the opportunistic poll; set, it must hand off. Both arms reach `ledgeHang` — which is the
     point. The defect was never that the state was unreachable, it was that reaching it cost
     the full hold. An arm that only asserted "ledgeHang happens" would have passed on the bug. */
  const none = await arrive(null);
  const hand = await arrive('ledgeHang');
  assert.ok(none.first.has('ledgeHang'), 'control arm never reached ledgeHang at all');
  assert.ok(hand.first.has('ledgeHang'), 'handoff arm never reached ledgeHang');
  assert.equal(none.reason, 'held', `control released for "${none.reason}", not the hold timeout`);
  assert.equal(hand.reason, 'handoff', `handoff released for "${hand.reason}"`);
  const slow = none.first.get('ledgeHang') - none.first.get('toTarget');
  const fast = hand.first.get('ledgeHang') - hand.first.get('toTarget');
  const holdFrames = Math.round(TUNE.magHold * 60);
  console.log(`\n[targets] lock→ledgeHang: ${slow} frames held vs ${fast} handed off (magHold ${holdFrames})`);
  assert.ok(slow - fast >= holdFrames - 1, `the stall was only ${slow - fast} frames, expected ~${holdFrames}`);
});

/* ====================================================================== */
/* 6 — WallClimb: the vertical route, on authored holds only               */
/* ====================================================================== */

/**
 * The rung pitch is WORLD's number (`EgyptLevel.NOTCH.pitch`), derived from MOVEMENT's. It is
 * restated here from `TUNE` alone so that a change to `jumpV0`, `wallJumpUp` or `gravity` fails
 * this file rather than silently making the level's ladder unclimbable.
 */
const launchV = () => TUNE.jumpV0 * TUNE.wallJumpUp;
const apexOf = (v) => (v * v) / (2 * -TUNE.gravity);


/**
 * Run at the wall holding forward, and climb.
 *
 * The jump script is the fiddly part and it is fiddly for a real reason: `Fall.air()` runs
 * `applyJumpCut`, so letting go of jump while still rising costs 55% of the launch and the next
 * rung goes out of reach. A held button, though, never registers a second `pressed`. So the only
 * safe place to re-arm is **on the rung**, where `WallClimb.update` has pinned velocity to zero
 * and a release cannot cut anything: release on the first frame of the hold, press on the
 * second. That is exactly what a player does — you land on a notch and press jump again.
 */
async function climb({ holds = true, rungs = 10, frames = 600, top = 40, lines = null, startX = 0 } = {}) {
  const { wall, rec } = ladderWall({ rungs, holds, top, lines });
  const { engine, c } = await makeSim({ wall });
  c.position.set(startX, 0, -8.0);
  c.grounded = true;
  const caught = [];
  let prev = null, onRung = 0;
  run(engine, c, frames, (i, inp) => {
    inp.move.y = 1;                       // camera looks −Z, so this is "into the wall"
    if (c.stateName === 'wallClimb') {
      onRung++;
      if (onRung === 1) inp.let_go('jump'); else inp.hold('jump');
    } else { onRung = 0; inp.hold('jump'); }
  }, () => {
    const h = c.sm.get('wallClimb')._hold;
    if (h && h !== prev) caught.push(h);
    prev = h;
  });
  return { engine, c, rec, caught, top: c.position.y };
}

test('wallClimb: the 2.10 m rung pitch is inside one plain wall jump, derived from TUNE', () => {
  const v = launchV();
  const apex = apexOf(v);
  const clingGate = (v * v - 1.2 * 1.2) / (2 * -TUNE.gravity);
  const atRung = Math.sqrt(v * v - 2 * -TUNE.gravity * PITCH);
  console.log(`\n[wallClimb] launch ${v.toFixed(2)} m/s · apex ${apex.toFixed(4)} m · ` +
              `cling gate at ${clingGate.toFixed(4)} m · still rising ${atRung.toFixed(3)} m/s at the rung`);
  assert.ok(Math.abs(v - 10.34) < 1e-9, `launch is ${v}, not the 10.34 the pitch was derived from`);
  assert.ok(Math.abs(apex - 2.2274) < 5e-4, `apex ${apex} is not 2.2274`);
  assert.ok(Math.abs(clingGate - 2.1974) < 5e-4, `cling gate ${clingGate} is not 2.1974`);
  // The contract WallClimb actually honours is the apex, not WallCling's velocity gate — a hold
  // state catches while rising. Both are recorded so the reading that moved is visible.
  assert.ok(PITCH < apex, `pitch ${PITCH} exceeds the apex ${apex.toFixed(4)}: the ladder is unclimbable`);
  assert.ok(atRung > 1.2, 'the rung is reached below the cling gate — the apex reading is not the binding one');
});

test('wallClimb: reach cannot span two rungs', () => {
  const reach = TUNE.radius + launchV() / 30;
  console.log(`[wallClimb] reach ${reach.toFixed(4)} m vs pitch ${PITCH} m`);
  assert.ok(reach < PITCH / 2, `reach ${reach.toFixed(3)} could take two rungs at once`);
  // …and it must still be wide enough that a rung cannot pass between two frames of the launch.
  assert.ok(reach > launchV() / 60, 'reach is narrower than one 60 Hz frame of the launch');
});

test('wallClimb: with no handholds on the rec, the face is unclimbable (calibration)', async () => {
  const bare = await climb({ holds: false });
  assert.equal(bare.rec.handholds, null);
  assert.ok(!bare.engine.events.some((e) => e.evt === 'playerState' && e.payload === 'wallClimb'),
    'entered wallClimb on a rec carrying no handholds');
  assert.ok(bare.top < 3.0, `climbed to y ${bare.top.toFixed(2)} with no holds authored`);
  console.log(`[wallClimb] holds OFF: reached y ${bare.top.toFixed(2)}, wallClimb never entered`);
});

test('wallClimb: an authored ladder is climbed rung by rung, and never downward', async () => {
  const RUNGS = 10;
  const up = await climb({ rungs: RUNGS });
  const ys = up.caught.map((h) => h.point.y);
  const distinct = [...new Set(ys)];
  /* Non-decreasing rather than strictly increasing, and the difference is a design decision
     worth pinning rather than papering over: `spent()` releases the rung Sly just left once he
     is out of reach of it, so a jump off the TOP rung that finds nothing above re-catches the
     top rung on the way back down. That is a recovery, not a hover — it gains no height, and
     the ceiling arm below is what proves the gain is bounded. The assertion that matters here
     is that the ladder never hands back a LOWER rung than one already taken. */
  for (let i = 1; i < ys.length; i++) {
    assert.ok(ys[i] >= ys[i - 1], `rung ${i} (y ${ys[i]}) is below rung ${i - 1} (y ${ys[i - 1]})`);
  }
  assert.ok(distinct.length >= 5, `only ${distinct.length} distinct rungs taken`);
  assert.ok(Math.abs(Math.max(...ys) - PITCH * RUNGS) < 1e-9,
    `the ascent reached ${Math.max(...ys)}, not the top rung ${PITCH * RUNGS}`);
  const gained = Math.max(...ys) - Math.min(...ys);
  console.log(`[wallClimb] holds ON:  ${up.caught.length} catches over ${distinct.length} distinct rungs, ` +
              `y ${Math.min(...ys).toFixed(2)} → ${Math.max(...ys).toFixed(2)} (+${gained.toFixed(2)} m)`);
  assert.ok(gained > 8, `only gained ${gained.toFixed(2)} m of authored ladder`);
});

test('wallClimb: taking a rung SPENDS the face — wallSpent is reinforced, not defeated', async () => {
  const { wall } = ladderWall({ rungs: 6 });
  const { engine, c } = await makeSim({ wall });
  c.position.set(0, 0, -8.0);
  c.grounded = true;
  let checked = null;
  run(engine, c, 200, (i, inp) => { inp.move.y = 1; inp.hold('jump'); }, () => {
    if (!checked && c.stateName === 'wallClimb') {
      checked = {
        spent: c.wallSpent(c.wall.rec, c.wall.nx, c.wall.nz),
        cling: c.sm.get('wallCling').canEnter(c),
        run: c.sm.get('wallRun').canEnter(c),
        attached: c.attached === wall.rec,
      };
    }
  });
  assert.ok(checked, 'never entered wallClimb');
  /* This is the trap WORLD refused to walk into, checked from the other side. If `enter` had
     called `freeWall()` as briefed, `spent` would be false here and a rung would buy a cling on
     bare stone between rungs — the §357.1 loop with an authored first step. */
  assert.equal(checked.spent, true, 'holding a rung did not mark the face: freeWall path is open');
  assert.equal(checked.cling, false, 'wallCling is still enterable on a face a rung was taken from');
  assert.equal(checked.run, false, 'wallRun is still enterable on a face a rung was taken from');
  assert.equal(checked.attached, true, 'wallClimb did not attach to the wall rec');
  console.log(`[wallClimb] on a rung: wallSpent ${checked.spent}, wallCling.canEnter ${checked.cling}, ` +
              `wallRun.canEnter ${checked.run}`);
});

test('wallClimb: the ladder has a ceiling, and it is the top rung', async () => {
  const three = await climb({ rungs: 3, frames: 400 });
  const ten = await climb({ rungs: 10, frames: 600 });
  const topOf = (n) => PITCH * n;
  // A climb may overshoot its last rung by one launch apex and no more; nothing above the
  // authored data is reachable, which is what makes this a route rather than a lift.
  const ceiling3 = topOf(3) + apexOf(launchV());
  assert.ok(three.top <= ceiling3, `3-rung ladder reached y ${three.top.toFixed(2)} above its ceiling ${ceiling3.toFixed(2)}`);
  assert.ok(ten.top > three.top + 8, 'a longer ladder did not climb higher — the ceiling is not the data');
  console.log(`[wallClimb] 3 rungs → y ${three.top.toFixed(2)} (ceiling ${ceiling3.toFixed(2)}); ` +
              `10 rungs → y ${ten.top.toFixed(2)}`);
});

test('wallClimb: both exits work — this is a hold, not a trap', async () => {
  for (const [label, key] of [['jump', 'jump'], ['crouch', 'crouch']]) {
    const { wall } = ladderWall({ rungs: 4 });
    const { engine, c } = await makeSim({ wall });
    c.position.set(0, 0, -8.0);
    c.grounded = true;
    let entered = -1, left = -1;
    run(engine, c, 300, (i, inp) => {
      inp.move.y = 1;
      if (entered < 0) { inp.hold('jump'); return; }   // get onto a rung
      inp.let_go('jump');                              // safe: velocity is pinned on the rung
      if (i > entered + 4) inp.hold(key);              // then a fresh press of the exit button
    }, (i) => {
      if (entered < 0 && c.stateName === 'wallClimb') entered = i;
      else if (entered >= 0 && left < 0 && c.stateName !== 'wallClimb') left = i;
    });
    assert.ok(entered >= 0, `${label}: never entered wallClimb`);
    assert.ok(left > 0, `${label}: entered wallClimb at frame ${entered} and never left`);
    console.log(`[wallClimb] exit by ${label}: entered f${entered}, left f${left}`);
  }
});

test('wallClimb: the shipped level\'s own holds satisfy every contract this state relies on', async () => {
  /* The synthetic ladder above proves the state; this proves the DATA, and it is the half that
     can rot silently. `find()` reads `rec.handholds` off whatever `probeWall` returned, so three
     properties of WORLD's authoring are load-bearing, and none of them is checked anywhere else:
     if the batter ever tips a hold's face out of `wallNormalMax`, `probeWall` stops calling it a
     wall and the ladder dies with no error; if a pitch ever exceeds one launch apex the ladder
     becomes unclimbable at that rung; if two ladders ever come within `reach` of each other they
     become one. */
  const { Architecture } = await import('../src/world/Architecture.js');
  const recs = [];
  const engine = {
    scene: new THREE.Scene(), warnings: [], debug: {}, quality: 'high',
    get() { return null; }, has() { return false; }, warn(m) { this.warnings.push(String(m)); },
    on() { return () => {}; }, emit() {}, registerCollider(mesh, opts) { recs.push({ mesh, ...opts }); },
  };
  const A = new Architecture(engine);
  await A.init();
  const holds = A.api.handholds || [];
  assert.ok(holds.length > 0, 'the level authored no handholds at all');

  const laddered = recs.filter((r) => r.handholds?.length);
  assert.ok(laddered.length >= 1, 'no collision rec carries handholds — probeWall could never find one');
  assert.equal(laddered[0].handholds[0], holds[0], 'rec.handholds is not the same object as api.handholds');

  const maxNy = Math.max(...holds.map((h) => Math.abs(h.normal.y)));
  assert.ok(maxNy < TUNE.wallNormalMax,
    `a hold's face tilts ${maxNy.toFixed(4)} — probeWall would refuse it above ${TUNE.wallNormalMax}`);

  // Group by ladder (the id prefix before the rung index) and check the rise between rungs.
  const apex = apexOf(launchV());
  const byLadder = new Map();
  for (const h of holds) {
    const k = h.id.replace(/-\d+$/, '');
    (byLadder.get(k) || byLadder.set(k, []).get(k)).push(h);
  }
  const spans = [];
  for (const [k, list] of byLadder) {
    list.sort((a, b) => a.point.y - b.point.y);
    for (let i = 1; i < list.length; i++) {
      const rise = list[i].point.y - list[i - 1].point.y;
      assert.ok(rise <= apex,
        `${k}: rung ${i} rises ${rise.toFixed(3)} m, beyond one launch apex ${apex.toFixed(4)} m`);
    }
    spans.push(`${k} ${list.length}×, y ${list[0].point.y.toFixed(2)}..${list[list.length - 1].point.y.toFixed(2)}`);
  }

  // Distinct ladders must not be inside each other's reach, or `find()` would mix them.
  const R = TUNE.radius + launchV() / 30;
  const keys = [...byLadder.keys()];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      for (const a of byLadder.get(keys[i])) for (const b of byLadder.get(keys[j])) {
        assert.ok(a.point.distanceTo(b.point) > R,
          `${keys[i]} and ${keys[j]} have holds ${a.point.distanceTo(b.point).toFixed(3)} m apart, inside reach ${R.toFixed(3)}`);
      }
    }
  }
  const top = Math.max(...holds.map((h) => h.point.y));
  console.log(`\n[wallClimb] level: ${holds.length} holds on ${laddered.length} rec(s), |n.y| max ${maxNy.toFixed(4)}, ` +
              `top rung y ${top.toFixed(2)} (+apex ${(top + apex).toFixed(2)})\n            ${spans.join('\n            ')}`);
});

/* ---------------------------------------------------------------------- */
/* 6a — two ladders on one face                                            */
/* ---------------------------------------------------------------------- */

test('wallClimb: two ladders can never be reachable at once, so "nearest" is never ambiguous', async () => {
  /* The question "what does nearest mean when two ladders overlap" turns out to have a
     geometric answer rather than a policy one, and the answer is that the case cannot arise.
     `enter` parks the hand `radius + 0.05` = 0.39 m off the face plane the holds are published
     on, so of the `reach` sphere only √(reach² − 0.39²) is left for lateral offset. Two ladders
     further apart than that can never both be in reach; two ladders closer than that are, by
     `sameLine`'s half-pitch rule, one ladder. The gap between those two numbers is where the
     ambiguity would live, and it is empty. */
  const R = TUNE.radius + launchV() / 30;
  const standoff = TUNE.radius + 0.05;
  const lateralBudget = Math.sqrt(R * R - standoff * standoff);
  const sameLineCut = PITCH * 0.5;
  console.log(`\n[wallClimb] lateral reach budget ${lateralBudget.toFixed(3)} m · ` +
              `sameLine cut ${sameLineCut.toFixed(3)} m`);
  assert.ok(sameLineCut > lateralBudget,
    `two ladders ${lateralBudget.toFixed(3)}..${sameLineCut.toFixed(3)} m apart would be both reachable AND distinct`);

  // …and the shipped level is nowhere near even the loose bound.
  const { Architecture } = await import('../src/world/Architecture.js');
  const engine = {
    scene: new THREE.Scene(), warnings: [], debug: {}, quality: 'high',
    get() { return null; }, has() { return false; }, warn() {}, on() { return () => {}; },
    emit() {}, registerCollider() {},
  };
  const A = new Architecture(engine);
  await A.init();
  const holds = A.api.handholds || [];
  const lines = new Map();
  for (const h of holds) {
    const k = h.id.replace(/-\d+$/, '');
    (lines.get(k) || lines.set(k, []).get(k)).push(h);
  }
  let closest = Infinity;
  const keys = [...lines.keys()];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      for (const a of lines.get(keys[i])) for (const b of lines.get(keys[j])) {
        closest = Math.min(closest, Math.hypot(a.point.x - b.point.x, a.point.z - b.point.z));
      }
    }
  }
  console.log(`[wallClimb] level has ${keys.length} ladders; closest lateral approach ${closest.toFixed(3)} m`);
  assert.ok(closest > sameLineCut, `two shipped ladders come within ${closest.toFixed(3)} m — inside the sameLine cut`);
});

test('wallClimb: one ladder lives on one rec, and the climb commits to the line it started on', async () => {
  /* `find` searches only the rec `probeWall` resolved, because `enter` marks THAT rec — taking a
     hold off a neighbouring rec would spend the wrong face. That makes "one ladder, one rec" an
     authoring contract, so it is asserted against the shipped level rather than left as folklore. */
  const { Architecture } = await import('../src/world/Architecture.js');
  const recs = [];
  const engine = {
    scene: new THREE.Scene(), warnings: [], debug: {}, quality: 'high',
    get() { return null; }, has() { return false; }, warn() {}, on() { return () => {}; },
    emit() {}, registerCollider(mesh, opts) { recs.push({ mesh, ...opts }); },
  };
  const A = new Architecture(engine);
  await A.init();
  const owner = new Map();
  for (const r of recs) for (const h of r.handholds || []) {
    const k = h.id.replace(/-\d+$/, '');
    if (!owner.has(k)) owner.set(k, new Set());
    owner.get(k).add(r);
  }
  for (const [k, set] of owner) {
    assert.equal(set.size, 1, `ladder ${k} is split across ${set.size} collision recs — rungs on the others are unreachable`);
  }
  console.log(`[wallClimb] ${owner.size} ladders, each on exactly one rec`);

  // And behaviourally: with two well-separated lines authored on one rec, the ascent stays on
  // the one it started on rather than hopping across.
  const up = await climb({
    lines: [{ x: 0, y0: PITCH, n: 8 }, { x: 4.0, y0: PITCH * 1.5, n: 8 }],
    startX: 0, frames: 600,
  });
  const xs = [...new Set(up.caught.map((h) => h.point.x))];
  assert.deepEqual(xs, [0], `the ascent wandered between lines at x ${xs.join(', ')}`);
  assert.ok(up.caught.length >= 5, `only caught ${up.caught.length} rungs on the chosen line`);
  console.log(`[wallClimb] two lines authored, ${up.caught.length} catches, all on x ${xs[0]}`);
});

/* ---------------------------------------------------------------------- */
/* 6b — a hold that moves out from under Sly                               */
/* ---------------------------------------------------------------------- */

test('wallClimb: a hold that moves out from under Sly drops him rather than stranding him', async () => {
  /* `update` pins velocity to zero and never calls `move()`, so before this check a rec that
     slid away left Sly frozen in mid-air holding a hold that was no longer there. Handholds are
     authored static world points and every laddered rec in the game is a static proxy, so this
     is a contract being made explicit, not a bug being fixed — but "undefined" is not an
     acceptable answer for a state you can be inside of. */
  const { wall } = ladderWall({ rungs: 6 });
  const { engine, c } = await makeSim({ wall });
  c.position.set(0, 0, -8.0);
  c.grounded = true;
  let entered = -1, moved = -1, left = -1;
  run(engine, c, 300, (i, inp) => {
    inp.move.y = 1;
    if (entered < 0) inp.hold('jump'); else inp.let_go('jump');
  }, (i) => {
    if (entered < 0 && c.stateName === 'wallClimb') { entered = i; return; }
    if (entered >= 0 && moved < 0 && i === entered + 3) {
      // The rec slides 2 m along the face, taking every hold with it.
      for (const h of wall.rec.handholds) h.point.x += 2.0;
      moved = i;
    }
    if (moved >= 0 && left < 0 && c.stateName !== 'wallClimb') left = i;
  });
  assert.ok(entered >= 0, 'never got onto a rung');
  assert.ok(left > 0, 'Sly was still holding a hold that had moved 2 m away');
  assert.ok(left - moved <= 2, `took ${left - moved} frames to notice the hold had gone`);
  console.log(`\n[wallClimb] hold moved at f${moved}, released at f${left} (${left - moved} frame(s))`);
});

/* ---------------------------------------------------------------------- */
/* 6c — the summit is a destination                                        */
/* ---------------------------------------------------------------------- */

test('wallClimb: the top rung delivers onto the summit instead of hovering', async () => {
  /* The coordinator's call: the ladder is allowed to top out at the pylon summit. That makes the
     top rung a destination, and a destination has to hand over. It does so through machinery
     that already exists — `LedgeHang` is priority 88, well above `wallClimb` 79, so the lip gets
     first refusal on every frame of the launch off the last rung. No new code; what is asserted
     is that the handover actually happens rather than the climb settling into the
     jump-fall-recatch cycle the previous round's monotonicity arm had to be softened for. */
  const RUNGS = 6;
  const TOPY = PITCH * RUNGS;                 // last rung
  /* The lip sits 0.40 m above the top rung, which is the shipped relationship: the pylon's last
     rung is y 25.20 and its deck is 25.6. That number is what makes the summit a landing rather
     than a grab — a launch from the top rung carries the FEET to `TOPY − hangReach + apex` =
     TOPY + 0.667, clearing a 0.40 m lip by 0.267 m, so Sly simply arrives on top and no ledge
     tech is needed. (Authored higher it becomes a `LedgeHang` catch instead, which also works
     but only inside the one-frame window where `velocity.y` has fallen under that state's 1.5
     gate — worth knowing, and worth the world lane keeping the deck within 0.667 m of the last
     rung so the arrival is the robust kind.) */
  const LIP = 0.40;
  const feetApex = TOPY - TUNE.hangReach + apexOf(launchV());
  assert.ok(feetApex > TOPY + LIP, 'the test geometry does not actually clear the lip');
  const up = await climb({ rungs: RUNGS, top: TOPY + LIP, frames: 700 });
  assert.ok(up.c.grounded, `ended airborne in "${up.c.stateName}" at y ${up.c.position.y.toFixed(2)}`);
  assert.ok(up.c.position.z < -10, `ended at z ${up.c.position.z.toFixed(2)} — never got over the lip`);
  assert.ok(Math.abs(up.c.position.y - (TOPY + LIP)) < 0.2,
    `ended at y ${up.c.position.y.toFixed(2)}, not on the summit ${(TOPY + LIP).toFixed(2)}`);
  console.log(`[wallClimb] summit: feet apex ${feetApex.toFixed(3)} vs lip ${(TOPY + LIP).toFixed(2)} — ` +
              `landed at y ${up.c.position.y.toFixed(2)}, z ${up.c.position.z.toFixed(2)}, ` +
              `state "${up.c.stateName}", grounded ${up.c.grounded}`);
});

test('wallClimb: a topless ladder settles rather than gaining height forever', async () => {
  /* The other half of the summit question. If a level ever authors a ladder with nothing at the
     top, the recovery re-catch turns into an indefinite jump-fall-recatch cycle. That is not an
     exploit — it gains no height, which is what this asserts — but it is worth pinning, because
     "bounded" is the property that makes the recovery safe to keep. */
  const RUNGS = 4;
  const up = await climb({ rungs: RUNGS, top: 400, frames: 900 });
  const ys = up.caught.map((h) => h.point.y);
  const top = Math.max(...ys);
  assert.ok(Math.abs(top - PITCH * RUNGS) < 1e-9, `caught a rung above the ladder: ${top}`);
  assert.ok(up.c.position.y < top + apexOf(launchV()) + 0.2,
    `climbed to y ${up.c.position.y.toFixed(2)}, past the top rung plus one apex`);
  console.log(`[wallClimb] topless: ${up.caught.length} catches, highest rung ${top.toFixed(2)}, ` +
              `final y ${up.c.position.y.toFixed(2)} (bound ${(top + apexOf(launchV())).toFixed(2)})`);
});

/* ====================================================================== */
/* 7 — the rope question, settled by measurement                           */
/* ====================================================================== */

test('rope: a sagging rope is our rail with a curved spline, not a mechanic we lack', async () => {
  /* `Scripts/rope.gd` and `Scripts/auto_rope_path.gd` (NoahChase/Sly-Cooper--A-Thief-in-Godot,
     HEAD 6479957, /home/user/ref-godot; **licence: none stated** — no LICENSE, no COPYING, no
     licence section, no README, verified in that tree; fan work derived from Sucker Punch/Sony).
     Nothing is pasted; what is taken here is a decision NOT to build something, and this arm is
     the evidence for it.
       · `rope.gd` moves no player at all — it lerps a Path3D's control points between a taut set
         and a sagged set. It is a deformer, i.e. world/FX geometry, not a moveset state.
       · `auto_rope_path.gd`'s traverse is `progress_ratio += delta / (length / 5.0) * prog_mult`
         — a constant 5 m/s along a spline while the stick is held, with direction taken from the
         player's FACING. Ours takes direction from momentum (`velocity · tangent`) and adds a
         term theirs does not have at all: `advance()`'s `speed += gravity · tangent.y · dt`.
     So the claim under test is that a rope needs no new state, because a rail on a catenary
     already behaves like one. */
  const A = V(-10, 8, -6), B = V(10, 8, -6), SAG = 3.0;
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(V(A.x + (B.x - A.x) * t, 8 - SAG * Math.cos((t - 0.5) * Math.PI), -6));
  }
  const spline = new THREE.CatmullRomCurve3(pts);
  const rec = { id: 'rope', mesh: { userData: { spline } } };
  const uOf = (p) => {
    let bu = 0, bd = Infinity;
    for (let i = 0; i <= 120; i++) { const u = i / 120; const d = spline.getPointAt(u).distanceTo(p); if (d < bd) { bd = d; bu = u; } }
    return bu;
  };
  const points = [{ tag: 'rail', rec, point: (p) => spline.getPointAt(uOf(p)), t: uOf, tangent: V(1, 0, 0) }];

  async function ride({ slack = false, frames = 420 } = {}) {
    const { engine, c } = await makeSim({ points });
    const s = spline.getPointAt(0.08);
    c.position.set(s.x, s.y + 0.5, s.z);
    c.velocity.set(0, -1, 0);
    c.grounded = false;
    c.sm.set('fall');
    const tr = [];
    run(engine, c, frames, () => {}, (i) => {
      if (slack && i === 1) c.rail.speed = 0;        // the one lever: mount energy
      tr.push({ st: c.stateName, u: c.rail.u, sp: c.rail.speed, y: c.position.y });
    });
    return tr.filter((t) => t.st.startsWith('rail'));
  }

  // 1. Gravity along the spline is real: he runs DOWN into the sag and is slowed climbing out.
  const free = await ride();
  const spMax = Math.max(...free.map((t) => t.sp));
  const spEnd = free[free.length - 1].sp;
  const yMin = Math.min(...free.map((t) => t.y));
  console.log(`\n[rope] ${spline.getLength().toFixed(2)} m rope, ${SAG.toFixed(1)} m sag · ` +
              `speed ${free[0].sp.toFixed(2)} → ${spMax.toFixed(2)} at the bottom → ${spEnd.toFixed(2)} on the far side · ` +
              `dipped to y ${yMin.toFixed(2)}`);
  assert.ok(spMax > free[0].sp + 3, `no downhill acceleration: ${free[0].sp.toFixed(2)} → ${spMax.toFixed(2)}`);
  assert.ok(spEnd < spMax - 3, `no uphill deceleration: peaked ${spMax.toFixed(2)}, ended ${spEnd.toFixed(2)}`);
  assert.ok(yMin < 8 - SAG + 0.2, `never reached the bottom of the sag (${yMin.toFixed(2)})`);

  // 2. With the mount energy removed he settles INTO the sag and swings — a rope, not a grind.
  const slack = await ride({ slack: true, frames: 600 });
  let rev = 0;
  for (let i = 1; i < slack.length; i++) {
    if (Math.sign(slack[i].sp) !== Math.sign(slack[i - 1].sp) && Math.abs(slack[i].sp) > 0.05) rev++;
  }
  const states = [...new Set(slack.map((t) => t.st))].sort();
  console.log(`[rope] mount energy 0 → ${states.join(' + ')}, u ${Math.min(...slack.map((t) => t.u)).toFixed(3)}..` +
              `${Math.max(...slack.map((t) => t.u)).toFixed(3)}, ${rev} pendulum reversal(s), ` +
              `${slack.length}/600 frames still on the rope`);
  assert.ok(rev >= 1, 'never swung back — the sag is not behaving like a rope');
  assert.ok(slack.length > 500, `fell off after ${slack.length} frames`);
  assert.deepEqual(states, ['railSlide', 'railWalk'], 'the slide/walk handoff did not track the swing');

  /* 3. …and the ONE thing that separates the two is not a state, it is a constant.
     `RailSlide.enter` calls `mount(c, a, TUNE.railSpeed)`, forcing every mount to at least
     9.5 m/s, which is exactly enough to crest this sag every time — arm 1 never swings, arm 2
     only swings because the test removed that floor by hand. A rope wants the floor to come
     from the affordance instead. That is a one-line change and it is NOT made here: no rope is
     authored in the level, and landing a knob nothing sets is the mirror of the `handholds`
     situation MOVEMENT has just spent two rounds fixing from the other side. */
  assert.ok(TUNE.railSpeed > 8, 'railSpeed is no longer the mount floor this arm is about');
});

/* ====================================================================== */
/* 8 — the exit census: every state in buildMoveset(), driven             */
/* ====================================================================== */

/**
 * Four states you could enter and not leave were found by comparing this moveset against a
 * reference that happened to have a counterpart for them. That method cannot see the rest. This
 * arm drives **every** state the machine holds — read off `sm.ordered`, so a state a future lane
 * adds is covered the day it lands — and answers, for each: what leaves it, on what input, in
 * how many frames.
 *
 * Forced entry via `sm.set()` rather than natural entry, because `set()` is unconditional and
 * therefore cannot be defeated by a `canEnter` that happens to be false in the test world; the
 * per-state setup below exists to give each `enter()` the context it reads, so what runs is the
 * real state and not a degenerate one. Where a state needs an affordance, a wall, a vent tag, a
 * guard or an authored target, it gets exactly that and nothing else — one world per state, so
 * a hook in range cannot answer a question asked about a rail.
 */
const CENSUS_MAX = 600;                     // 10 s. Anything slower is a finding, not a pass.

const BATTERY = [
  ['(none)',   () => {}],
  ['forward',  (inp) => { inp.move.y = 1; }],
  ['back',     (inp) => { inp.move.y = -1; }],
  ['strafe',   (inp) => { inp.move.x = 1; }],
  ['jump',     (inp, i) => { if (i % 15 === 0) inp.hold('jump'); else inp.let_go('jump'); }],
  ['jump+fwd', (inp, i) => { inp.move.y = 1; if (i % 15 === 0) inp.hold('jump'); else inp.let_go('jump'); }],
  ['crouch',   (inp) => inp.hold('crouch')],
  ['attack',   (inp, i) => { if (i % 15 === 0) inp.hold('attack'); else inp.let_go('attack'); }],
  ['interact', (inp, i) => { if (i % 15 === 0) inp.hold('interact'); else inp.let_go('interact'); }],
  ['sneak',    (inp) => inp.hold('sneak')],
  ['focus',    (inp) => inp.hold('focus')],
  ['glide',    (inp) => inp.hold('glide')],
];



/** Drive one (state, input) pair. Returns the frame the state changed, or -1. */
async function censusRun(name, script) {
  const setup = censusSetup(name);
  const { engine, c } = await makeSim(setup.col);
  setup.place(c);
  c.sm.set(name);
  let left = -1, into = '';
  for (let i = 0; i < CENSUS_MAX && left < 0; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    script(engine.input, i);
    engine.time = i * DT;
    c.update(DT, i * DT);
    if (c.stateName !== name) { left = i; into = c.stateName; }
  }
  return { left, into };
}

test('census: every state in buildMoveset() can be left, and none of them only by jump', async () => {
  const probe = await makeSim({});
  const states = probe.c.sm.ordered.map((s) => ({ name: s.name, group: s.group, onRequest: s.onRequest }));
  const rows = [];
  for (const s of states) {
    const exits = [];
    for (const [label, script] of BATTERY) {
      const r = await censusRun(s.name, script);
      if (r.left >= 0) exits.push({ label, frames: r.left, into: r.into });
    }
    exits.sort((a, b) => a.frames - b.frames);
    rows.push({ ...s, exits });
  }

  const pad = (v, n) => String(v).padEnd(n);
  console.log(`\n[census] ${states.length} states × ${BATTERY.length} input scripts, ${CENSUS_MAX} frames each\n`);
  console.log(`  ${pad('state', 15)}${pad('grp', 8)}${pad('fastest exit', 26)}every input that leaves`);
  console.log(`  ${'-'.repeat(95)}`);
  for (const r of rows) {
    const best = r.exits[0];
    const bestTxt = best ? `${best.label} @${best.frames}f -> ${best.into}` : '*** NONE ***';
    console.log(`  ${pad(r.name, 15)}${pad(r.group, 8)}${pad(bestTxt, 26)}${r.exits.map((e) => e.label).join(', ') || '—'}`);
  }

  // 1. Nothing is a trap.
  const trapped = rows.filter((r) => r.exits.length === 0);
  assert.deepEqual(trapped.map((r) => r.name), [], `states with no exit at all: ${trapped.map((r) => r.name).join(', ')}`);

  // 2. Nothing depends on jump alone. This is the shape `hookSwing`, `poleSwing` and `roll` all
  //    had: an exit that reads as fine until the player is holding something that eats the button.
  const jumpOnly = rows.filter((r) => r.exits.length > 0 && r.exits.every((e) => e.label.startsWith('jump')));
  assert.deepEqual(jumpOnly.map((r) => r.name), [], `states whose only exit is jump: ${jumpOnly.map((r) => r.name).join(', ')}`);

  /* 3. Every state is REACHABLE. A pollable state is reachable by definition — the machine walks
        it every frame. An `onRequest` state is not: it exists only if something names it, and a
        state nothing names is dead in a way no grep for its class finds, because the class IS
        still constructed in `buildMoveset`.

        So: count the name as a string literal across both files that can name one, with comments
        stripped first. The registration itself contributes exactly one occurrence, so an
        onRequest state needs at least two. Comments must go or prose keeps a dead state looking
        alive — the same failure `tests/eventbus.test.mjs` was changed to avoid this session, in
        both directions. */
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const src = strip(readFileSync(new URL('../src/player/Moveset.js', import.meta.url), 'utf8'))
            + strip(readFileSync(new URL('../src/player/Controller.js', import.meta.url), 'utf8'));
  const named = (n) => (src.match(new RegExp(`'${n}'`, 'g')) || []).length;
  // The check has to be able to fail: a pollable state with one mention is fine, an onRequest
  // one is dead. Assert both halves so this cannot quietly become a tautology.
  const dead = states.filter((s) => s.onRequest && named(s.name) < 2);
  assert.deepEqual(dead.map((s) => s.name), [],
    `onRequest states nothing ever requests: ${dead.map((s) => s.name).join(', ')}`);
  const req = states.filter((s) => s.onRequest);
  assert.ok(req.length >= 4, `only ${req.length} onRequest states — this check is not exercising anything`);
  console.log(`  ${req.length} onRequest states, each named elsewhere: ` +
              req.map((s) => `${s.name}×${named(s.name)}`).join(', '));

  // 4. Slow exits are findings, not passes. Any state whose FASTEST exit is over 300 frames has
  //    to be named here on purpose.
  const slow = rows.filter((r) => r.exits[0].frames > 300).map((r) => `${r.name}@${r.exits[0].frames}f`);
  assert.deepEqual(slow, [], `states that take over 5 s to leave: ${slow.join(', ')}`);
  console.log(`\n[census] no traps, no jump-only exits, no exit slower than ` +
              `${Math.max(...rows.map((r) => r.exits[0].frames))} frames`);
});

test('census: crawl is the one state whose only exit is geometry, and the level must hold it up', async () => {
  /* The census's most interesting row. `Crawl.update`'s only exit is `!c.inVent()` — it polls no
     button at all, and at priority 68 it sits ABOVE `jump` 64, so jump does not even reach the
     machine while Sly is in a vent. That is correct rather than broken: a vent is a tunnel, and
     a state that let you jump out of one would put Sly through the level. But it means the
     moveset makes **no guarantee** that this state can be left — the guarantee lives entirely in
     level data, which is a different place from every other state in the file, and worth saying
     out loud.
     Run against an infinite vent, `crawl` is a hard trap: 12 input scripts × 600 frames, nothing
     leaves. That was the first result this census produced and it was my harness, not the game.
     What the level actually authors is four tunnels. */
  const half = VENT_HALF;
  const { engine, c } = await makeSim({
    col: undefined,
    groundTag: (p) => (Math.abs(p.x) <= half && Math.abs(p.z) <= half ? 'vent' : 'ground'),
  });
  c.position.set(0, 0, 0); c.grounded = true;
  c.sm.set('crawl');
  let left = -1;
  run(engine, c, 600, (i, inp) => { inp.move.y = 1; }, (i) => { if (left < 0 && c.stateName !== 'crawl') left = i; });
  assert.ok(left > 0, 'could not crawl out of a finite vent');
  const expect = half / TUNE.crawlSpeed * 60;
  console.log(`\n[census] crawl out of a ${(half * 2).toFixed(1)} m vent: ${left} frames ` +
              `(${(left / 60).toFixed(2)} s; ${half} m at crawlSpeed ${TUNE.crawlSpeed} predicts ${expect.toFixed(0)})`);
  assert.ok(left < expect * 2.5, `took ${left} frames to cover ${half} m`);

  // …and the shipped vents are bounded, so the geometric exit is always within a few seconds.
  const { Architecture } = await import('../src/world/Architecture.js');
  const recs = [];
  const eng = {
    scene: new THREE.Scene(), warnings: [], debug: {}, quality: 'high',
    get() { return null; }, has() { return false; }, warn() {}, on() { return () => {}; },
    emit() {}, registerCollider(mesh, opts) { recs.push({ mesh, ...opts }); },
  };
  const A = new Architecture(eng);
  await A.init();
  const vents = recs.filter((r) => r.tag === 'vent');
  assert.ok(vents.length > 0, 'the level authors no vents, so this contract is untested');
  let longest = 0;
  for (const v of vents) {
    const g = v.mesh?.geometry;
    if (!g) continue;
    g.computeBoundingBox();
    const b = g.boundingBox, s = v.mesh.scale;
    longest = Math.max(longest, (b.max.x - b.min.x) * s.x, (b.max.z - b.min.z) * s.z);
  }
  const worst = longest / TUNE.crawlSpeed;
  console.log(`[census] ${vents.length} shipped vents, longest run ${longest.toFixed(2)} m ` +
              `=> worst-case crawl out ${worst.toFixed(1)} s`);
  assert.ok(worst < 15, `a vent takes ${worst.toFixed(1)} s to crawl out of`);
});

test('census: the one state with no self-timeout is dive, and a void is its worst case', async () => {
  /* `DiveAttack.update` has exactly one exit — `if (c.grounded)` — and no clock. Over ground that
     is instant; over a hole it is bounded only by `Controller._safetyNet`'s `voidY`. That is an
     exit, so the census above passes it, but "you get your character back when the respawn
     catches you" is not the same as a state that ends. Measured rather than asserted from
     reading, because the fall is at a clamped `maxFall`, not at `diveSpeed`. */
  const { engine, c } = await makeSim({});
  c.position.set(0, 12, 0); c.velocity.set(0, 0, 0); c.grounded = false;
  c.col.groundCheck = () => ({ hit: false, y: -1e9, normal: V(0, 1, 0), tag: 'ground', material: 'stone', rec: null });
  c.col.capsuleSweep = (from, to) => ({ hit: false, position: to.clone(), normal: V(0, 1, 0), distance: to.distanceTo(from) });
  c.sm.set('dive');
  let left = -1;
  for (let i = 0; i < 4000 && left < 0; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT;
    c.update(DT, i * DT);
    if (c.stateName !== 'dive') left = i;
  }
  assert.ok(left > 0, 'dive over a void never ended at all');
  console.log(`\n[census] dive over a bottomless void: ${left} frames (${(left / 60).toFixed(2)} s) ` +
              `before the safety net at voidY returned control`);
  // It is bounded, and the bound is the void floor — not a design timeout. Pinned so that a
  // change to `voidY` or `maxFall` shows up here rather than as a mystery hang.
  assert.ok(left < 1200, `dive over a void took ${left} frames to end`);
});

/* ====================================================================== */
/* 9 — reachability through play, against the real level                  */
/* ====================================================================== */

/**
 * The census proved every state can be LEFT. This proves states can be REACHED, which is the
 * one member of this project's dead-content family still unchecked — it has already shipped an
 * emitter with no caller, a sound with no publisher, a flag with no reader and four states with
 * no exit.
 *
 * Real `Architecture`, real `Collision` BVH (248 colliders, ~4,030 tris), real `Controller`,
 * scripted input. Positions are DERIVED from the built level at run time rather than written
 * down, because the world lane is actively editing this geometry and a test full of hard-coded
 * coordinates would be measuring last week's level.
 */


test('reach: the ground and air moveset is reachable from spawn with plain input', async () => {
  const { engine, c } = await realWorld();
  const SPAWN = V(0, 0, 30);
  const routes = [
    ['move', 60, (inp) => { inp.move.y = 1; }],
    ['jump', 60, (inp, i) => { inp.move.y = 1; if (i > 20) inp.hold('jump'); }],
    ['fall', 60, (inp, i) => { inp.move.y = 1; if (i > 20) inp.hold('jump'); }],
    ['doubleJump', 90, (inp, i) => { inp.move.y = 1; if (i === 20) inp.hold('jump'); if (i === 21) inp.let_go('jump'); if (i === 40) inp.hold('jump'); }],
    // `land` is deliberately absent here — see the arm below. It is reachable only on some
    // sub-frame phases, and that is a documented Controller defect, not a route problem.
    ['paraglide', 120, (inp, i) => { inp.move.y = 1; if (i === 20) inp.hold('jump'); if (i > 35) inp.hold('glide'); }],
    ['dive', 90, (inp, i) => { inp.move.y = 1; if (i === 20) inp.hold('jump'); if (i === 40) inp.hold('attack'); }],
    ['roll', 90, (inp, i) => { inp.move.y = 1; if (i === 40) inp.hold('crouch'); }],
    ['skid', 90, (inp, i) => { inp.move.y = i < 40 ? 1 : -1; }],
    ['crouch', 60, (inp) => inp.hold('crouch')],
    ['sneak', 60, (inp) => { inp.move.y = 1; inp.hold('sneak'); }],
    ['combo', 60, (inp, i) => { if (i === 10) inp.hold('attack'); }],
    ['combatStrafe', 60, (inp) => { inp.hold('focus'); inp.move.x = 1; }],
    ['pickpocket', 90, (inp, i) => { if (i === 10) inp.hold('interact'); }],
  ];
  const found = [];
  for (const [name, frames, script] of routes) {
    hardReset(engine, c, SPAWN);
    let first = -1;
    for (let i = 0; i < frames && first < 0; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      script(engine.input, i);
      engine.time = i * DT;
      c.update(DT, i * DT);
      if (c.stateName === name) first = i;
    }
    found.push({ name, first });
  }
  console.log(`\n[reach] from spawn (0,0,30), real BVH:`);
  for (const f of found) console.log(`  ${f.name.padEnd(14)} ${f.first >= 0 ? `frame ${f.first}` : '*** NOT REACHED ***'}`);
  const missed = found.filter((f) => f.first < 0).map((f) => f.name);
  assert.deepEqual(missed, [], `not reachable from spawn: ${missed.join(', ')}`);
});

test('reach: land is reachable only on some sub-frame phases — the landImpact race, from the outside', async () => {
  /* `land` was the one state a plain jump from spawn did not reach, and the cause is already
     written down in `Controller.TUNE`'s landing block: `landImpact` is read in `_probeGround`
     as `-velocity.y` on the frame Sly first grounds, but `move()` runs `_moveVertical` first and
     the swept capsule zeroes `v.y` before the probe ever looks. The probe only wins when the
     frame before touchdown leaves Sly inside its 0.06 m snap band. That note measured the race
     from the inside — 12 wins in 40 sub-frame phases. This measures the same defect from the
     outside, as reachability: how often does the LAND STATE actually happen?
     Not a bug in this lane's files, and not fixed here. Pinned so that whoever fixes the race
     sees this number move. */
  const { engine, c } = await realWorld();
  let hits = 0, tried = 0;
  const frames = [];
  for (let jumpAt = 20; jumpAt < 44; jumpAt++) {
    hardReset(engine, c, V(0, 0, 30));
    tried++;
    let got = -1;
    for (let i = 0; i < 140 && got < 0; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 1;
      if (i >= jumpAt && i < jumpAt + 6) engine.input.hold('jump'); else engine.input.let_go('jump');
      engine.time = i * DT;
      c.update(DT, i * DT);
      if (c.stateName === 'land') got = i;
    }
    if (got >= 0) { hits++; frames.push(got - jumpAt); }
  }
  const pct = (hits / tried * 100).toFixed(0);
  console.log(`\n[reach] land: reached on ${hits}/${tried} take-off phases (${pct}%), ` +
              `${frames.length ? `${Math.min(...frames)}–${Math.max(...frames)} frames after take-off` : 'never'}`);
  assert.ok(hits > 0, 'the land state was unreachable on every take-off phase tried');
  assert.ok(hits < tried, 'land now fires on every phase — the landImpact race is fixed, update this arm');
});

test('reach: wallClimb is reachable through play from the authored entry', async () => {
  const { engine, c, arch, collision } = await realWorld();
  const holds = (arch.api.handholds || []).slice().sort((a, b) => a.point.y - b.point.y);
  assert.ok(holds.length > 0, 'the level authored no handholds — nothing to test reachability of');

  /* 1. The mechanic works against real level data. Placed at the lowest rung's own hang pose,
        Sly climbs the real battered pylon face. This is the control: if it failed, everything
        below would be a story about a broken state rather than about missing floor. */
  const r0 = holds[0];
  hardReset(engine, c, V(r0.point.x, r0.point.y - TUNE.hangReach, r0.point.z + 0.45), 0);
  c.grounded = false; c.velocity.set(0, -0.2, 0); c.sm.set('fall');
  const caught = [];
  let prev = null, onRung = 0;
  for (let i = 0; i < 900; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 1;
    if (c.stateName === 'wallClimb') { onRung++; if (onRung === 1) engine.input.let_go('jump'); else engine.input.hold('jump'); }
    else { onRung = 0; engine.input.hold('jump'); }
    engine.time = i * DT;
    c.update(DT, i * DT);
    const h = c.sm.get('wallClimb')._hold;
    if (h && h !== prev) caught.push(h.point.y);
    prev = h;
  }
  console.log(`\n[reach] real ladder: ${caught.length} rungs caught, ` +
              `y ${Math.min(...caught).toFixed(2)} -> ${Math.max(...caught).toFixed(2)}`);
  assert.ok(caught.length >= 5, `only caught ${caught.length} rungs on the shipped ladder`);

  /* 2. The entry. This arm has been wrong twice and both errors are worth keeping.
        First it asked "is there floor under the rung", with an acceptance window that rejected
        any surface ABOVE the rung's hang height — so it discarded the real approach. Then it
        decided standability from a `groundCheck` hit, which on an 84-degree battered face
        returns a y for a wall. Both fixed below: standability is decided by DRIVING.
        The third error was not in this arm at all — the harness built `Architecture` and not
        `Terrain`, so the desert sand this approach stands on did not exist, and the nearest
        "standable" ground was on the far side of the pylon. See `realWorld()`.

        "Can stand" is decided by DRIVING, not by `groundCheck`: the battered pylon face is an 84°
        slope and `groundCheck` reports a `y` for it, so a hit is not a foothold. Teleport, settle
        for 8 frames, and ask `Controller` itself whether it grounded. */
  const targets = (arch.api.targets || []).filter((t) => String(t.id).includes('mouth'));
  if (!targets.length) { console.log('\n[reach] no mouth target authored; entry question is moot'); return; }
  const M = targets[0];
  const standable = (x, z) => {
    const g = collision.groundCheck(V(x, 80, z), TUNE.radius, 240);
    if (!g?.hit) return null;
    hardReset(engine, c, V(x, g.y + 0.05, z));
    for (let i = 0; i < 8; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    return (c.grounded && Math.abs(c.position.y - g.y) < 1.5) ? { x, y: c.position.y, z } : null;
  };
  const cells = [];
  for (let dx = -8; dx <= 8; dx += 0.5) for (let dz = -8; dz <= 8; dz += 0.5) {
    const s = standable(M.point.x + dx, M.point.z + dz);
    if (!s) continue;
    s.d = Math.hypot(s.x - M.point.x, s.y - M.point.y, s.z - M.point.z);
    cells.push(s);
  }
  cells.sort((a, b) => a.d - b.d);
  console.log(`\n[reach] entry target ${M.id} at ${M.point.toArray().map((v) => v.toFixed(2)).join(',')} ` +
              `arrive=${M.arrive} volume=${M.volume ?? TUNE.magVolume}`);
  console.log(`[reach] ${cells.length} standable cells within 8 m; nearest ` +
              `${cells.length ? `(${cells[0].x.toFixed(1)}, ${cells[0].y.toFixed(2)}, ${cells[0].z.toFixed(1)}) at ${cells[0].d.toFixed(2)} m` : 'none'}`);
  assert.ok(cells.length > 0, 'no standable ground within 8 m of the authored entry');

  /* And now DRIVE it, which is the only step that answers the question. Distance to the target
     is not reachability: it does not know about the pylon, the masts, or which state wins the
     contact. One fixed take-off timing across the nearest starts — deliberately not tuned per
     start, so the number below is a floor on robustness rather than a best case. */
  let reached = 0;
  const tried = Math.min(8, cells.length);
  for (const s of cells.slice(0, tried)) {
    const dx = M.point.x - s.x, dz = M.point.z - s.z, l = Math.hypot(dx, dz) || 1;
    hardReset(engine, c, V(s.x, s.y + 0.05, s.z), Math.atan2(dx, dz));
    let got = false;
    for (let i = 0; i < 420 && !got; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = dx / l; engine.input.move.y = -dz / l;
      if (i >= 26 && i < 32) engine.input.hold('jump');
      else if (c.stateName === 'wallClimb') engine.input.hold('jump');
      else engine.input.let_go('jump');
      engine.time = i * DT; c.update(DT, i * DT);
      if (c.stateName === 'wallClimb') got = true;
    }
    if (got) reached++;
  }
  console.log(`[reach] wallClimb entered from ${reached}/${tried} of the nearest standable starts, ` +
              `one fixed take-off timing`);
  assert.ok(reached > 0, 'the authored ladder entry could not be driven into from any standable ground');
  assert.ok(holds.length >= 10, 'the ladder shrank; the reachability question has changed');
});

test('rope: the authored hall-cable is crossed under the player\'s own power', async () => {
  /* §371.2 predicted a rope needs no new state, only that `RailSlide.enter`'s hard
     `TUNE.railSpeed` mount floor come from the rail instead. The world lane authored the rail —
     `hall-cable`, a real catenary — and this is that one line, measured on it.
     One lever: `rec.mountSpeed`. */
  const { engine, c, collision } = await realWorld();
  /* Two rails now author `mountSpeed` — §497 gave the colossi tightrope `mountSpeed: 0` too —
     and this arm's subject was "the first rail with a mountSpeed", which silently re-pointed it
     at the tightrope: 12.6 m and x-aligned, where this driver's fixed-yaw `move.y = 1` projects
     ~0 onto the tangent, so its "22% crossed" measured the DRIVER, not the mechanic. Re-pointed
     at the arm's named subject by the lane that added the second rope (committed-file rule); the
     tightrope's own-power crossing is driven with real camera-relative steering in
     `tests/thiefspots.test.mjs`, so nothing loses coverage here. */
  const rope = collision.recs.find((r) => r.mesh?.name === 'rail:hall-cable' && Number.isFinite(r.mountSpeed))
    || collision.recs.find((r) => r.tag === 'rail' && Number.isFinite(r.mountSpeed));
  if (!rope) { console.log('\n[rope] no rail authors mountSpeed yet; nothing to measure'); return; }
  const spline = rope.mesh.userData?.spline;
  assert.ok(spline?.getLength, `${rope.mesh.name} carries mountSpeed but no spline`);
  const len = spline.getLength();
  const sag = (spline.getPointAt(0).y + spline.getPointAt(1).y) / 2 - spline.getPointAt(0.5).y;

  function ride(holdForward) {
    const a = spline.getPointAt(0.06);
    hardReset(engine, c, V(a.x, a.y + 0.6, a.z));
    c.position.set(a.x, a.y + 0.6, a.z);
    c.grounded = false; c.velocity.set(0, -1, 0); c._needSpawnSnap = false;
    c.sm.set('fall');
    const tr = [];
    for (let i = 0; i < 900; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = holdForward ? 1 : 0;
      engine.time = i * DT; c.update(DT, i * DT);
      if (c.stateName.startsWith('rail')) tr.push({ u: c.rail.u, sp: c.rail.speed, st: c.stateName });
    }
    return tr;
  }

  const slack = ride(true);
  const saved = rope.mountSpeed;
  delete rope.mountSpeed;                       // ← the lever: back to the hard railSpeed floor
  const hard = ride(true);
  rope.mountSpeed = saved;

  const span = (t) => Math.max(...t.map((x) => x.u)) - Math.min(...t.map((x) => x.u));
  console.log(`\n[rope] ${rope.mesh.name}: ${len.toFixed(2)} m span, ${sag.toFixed(2)} m sag, mountSpeed ${saved}`);
  console.log(`[rope] mountSpeed ${saved}: ${[...new Set(slack.map((t) => t.st))].join('+')}, ` +
              `speed ${Math.min(...slack.map((t) => t.sp)).toFixed(2)}..${Math.max(...slack.map((t) => t.sp)).toFixed(2)} m/s, ` +
              `${slack.length}/900 frames aboard, crossed ${(span(slack) * 100).toFixed(0)}% of the span`);
  console.log(`[rope] hard floor ${TUNE.railSpeed}: ${[...new Set(hard.map((t) => t.st))].join('+')}, ` +
              `speed ${Math.min(...hard.map((t) => t.sp)).toFixed(2)}..${Math.max(...hard.map((t) => t.sp)).toFixed(2)} m/s, ` +
              `${hard.length}/900 frames aboard`);
  // The lever must move, and in the direction that makes a cable a rope rather than a zip-line.
  assert.ok(hard.length < 300, `calibration did not move: still aboard ${hard.length} frames with the hard floor`);
  /* Relative to the calibration arm, not an absolute frame count: the world lane has re-cut this
     rope's span and sag three times this session and an absolute threshold measures the week, not
     the mechanic. The claim is that mountSpeed keeps the player aboard far longer than the hard
     floor does, and that they cross it themselves. */
  assert.ok(slack.length > hard.length * 2,
    `mountSpeed kept the player aboard ${slack.length} frames vs ${hard.length} on the hard floor`);
  /* The lever is the MOUNT speed, not the peak. On a 35 m rope with 1 m of sag, gravity along
     the tangent legitimately winds a slack mount up past 5 m/s by mid-span — that is the rope
     working, not a zip-line. What distinguishes them is how you get on: near zero and under your
     own power, versus already at railSpeed and a passenger. */
  /* Only two claims are asserted, and deliberately: this rope's span and sag have been re-cut
     four times this session (30.32/1.50 -> 31.63/1.00 -> 35.00/1.00 -> 34.95/0.60) and every
     speed-shaped threshold I wrote against it measured the week rather than the mechanic. Peak
     speed is not a discriminator — gravity along 35 m of tangent legitimately winds a slack mount
     past 4 m/s by mid-span, which is the rope working. What has survived every recut is that
     `mountSpeed` keeps the player aboard far longer and lets them cross the span themselves. */
  assert.ok(span(slack) > 0.8, `only crossed ${(span(slack) * 100).toFixed(0)}% of the rope under own power`);
});

/* ====================================================================== */
/* 10 — the attach states, driven in the real world                        */
/* ====================================================================== */


test('reach: the attach states are reachable through play in the shipped level', async () => {
  const { engine, c, arch, collision } = await realWorld();
  const standAt = (x, z) => {
    const g = collision.groundCheck(V(x, 90, z), TUNE.radius, 300);
    if (!g?.hit) return null;
    hardReset(engine, c, V(x, g.y + 0.05, z));
    for (let i = 0; i < 8; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    return (c.grounded && Math.abs(c.position.y - g.y) < 1.5) ? { x, y: c.position.y, z } : null;
  };
  const nearestStand = (P, rmax = 6, step = 0.5) => {
    let best = null;
    for (let dx = -rmax; dx <= rmax; dx += step) for (let dz = -rmax; dz <= rmax; dz += step) {
      const s = standAt(P.x + dx, P.z + dz);
      if (!s) continue;
      s.d = Math.hypot(s.x - P.x, s.y - P.y, s.z - P.z);
      if (!best || s.d < best.d) best = s;
    }
    return best;
  };

  const runs = [];
  const M = (arch.api.targets || []).find((t) => String(t.id).includes('mouth'));

  /* Script A — walk at the pylon's south elevation from the desert and jump. Aimed at the
     authored ladder entry; also the run that produces toTarget, wallClimb and wallCling.

     The 4 m standoff is not arbitrary and it used to be 2 m. That 2 m was tuned against a
     character who DRIFTED on the way in: with the ground-snap slide removed he walks straight,
     arrives closer and faster, and goes to `wallClimb@18` without ever entering the target
     volume. Measured across a range rather than stopping at the first value that passed —
     2 m misses, 3/4/5 m all reach `toTarget` at closest approach 0.00 m — so this sits in the
     middle of a working band rather than on its edge. The arm's claim is unchanged; only the
     approach that tests it moved. */
  if (M) {
    const s = standAt(M.point.x, M.point.z + 4.0);
    if (s) {
      const r = await driveRoute(engine, c, V(s.x, s.y + 0.05, s.z), Math.atan2(0, -1), 150,
        (inp, i) => { inp.move.y = 1; if (i >= 18 && i < 24) inp.hold('jump'); else inp.let_go('jump'); }, null);
      runs.push({ script: `A walk-in at pylon face from (${s.x.toFixed(1)}, ${s.y.toFixed(2)}, ${s.z.toFixed(1)})`, path: r.path });
    }
  }

  /* Script B — walk to a pole with standable ground at its foot and press interact.
     §514.3: only poles that still AFFORD are candidates (thick columns are gated by design),
     and every candidate is tried rather than the first — the first rec in registration order
     used to be a column, which now walks up to it and correctly refuses to mount. The §495.A
     rope (walk-on plinth at its bottom) is the intended positive. */
  const affPoles = new Set();
  for (const e of collision._aff) if (e.rec?.tag === 'pole') affPoles.add(e.rec);
  for (const rec of affPoles) {
    const ud = rec.mesh.userData || {}, p = rec.mesh.position;
    const s = nearestStand(V(p.x, ud.bottom ?? p.y, p.z), 4, 0.5);
    if (!s || s.d > 3.0) continue;
    const dx = p.x - s.x, dz = p.z - s.z, l = Math.hypot(dx, dz) || 1;
    const r = await driveRoute(engine, c, V(s.x, s.y + 0.05, s.z), Math.atan2(dx, dz), 150,
      (inp, i) => { if (l > 0.05) { inp.move.x = dx / l; inp.move.y = -dz / l; } if (i === 20 || i === 60) inp.hold('interact'); else inp.let_go('interact'); }, null);
    runs.push({ script: `B walk-to-pole ${rec.mesh.name} from (${s.x.toFixed(1)}, ${s.y.toFixed(2)}, ${s.z.toFixed(1)}) d=${s.d.toFixed(2)}`, path: r.path });
    /* No break: every affording pole runs. The old single-candidate form silently depended on
       WHICH pole was first in registration order — the east mast, whose top is ring 0's entry,
       so hookSwing was reached as a side effect of the one pole it happened to pick. Four thin
       poles is four short drives, and the mast keeps supplying the hook entry. */
  }

  /* Script C — stand on a narrow ledge. */
  const narrow = standAt(16.8, -1.2);
  if (narrow) {
    const r = await driveRoute(engine, c, V(narrow.x, narrow.y + 0.05, narrow.z), Math.PI, 60, () => {}, null);
    runs.push({ script: `C stand on narrow ledge (${narrow.x}, ${narrow.y.toFixed(2)}, ${narrow.z})`, path: r.path });
  }

  /* Script D — take damage while already airborne. See the arm below for why that matters. */
  const rD = await driveRoute(engine, c, V(0, 0, 30), Math.PI, 90,
    (inp, i, cc) => { inp.move.y = 1; if (i === 10) inp.hold('jump'); if (i === 40) cc.hurt(new THREE.Vector3(0, 0, 1), 8); }, null);
  runs.push({ script: 'D hurt() while airborne', path: rD.path });

  /* Script F — run AND JUMP at a wall with a flat approach. `wallRun` is an air move
     (`canEnter` opens `if (c.grounded || c.sm.group !== 'air') return false`), which is why three
     earlier ground-only approach scripts produced `tiptoe`/`wallCling` and never this: they never
     left the floor. The approach is derived by scanning wall recs for standable ground 3–7 m out
     whose run-up stays within 0.25 m of level, so it does not depend on one hand-picked spot.
     This run is also the one that measures the `wallRun`/`wallJump` material payloads, which were
     verified-by-construction for two rounds. */
  {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
    let approach = null;
    for (const w of collision.recs.filter((r) => r.tag === 'wall')) {
      const p = w.mesh.position;
      for (let dx = -9; dx <= 9 && !approach; dx += 1.5) for (let dz = -9; dz <= 9 && !approach; dz += 1.5) {
        const s = standAt(p.x + dx, p.z + dz);
        if (!s) continue;
        for (const [ux, uz] of dirs) {
          const o = V(s.x, s.y + TUNE.height * 0.55, s.z);
          const hit = collision.raycast(o, V(ux, 0, uz), 7.5);
          if (!hit?.hit || hit.tag !== 'wall' || Math.abs(hit.normal.y) > TUNE.wallNormalMax) continue;
          if (hit.distance < 3.0) continue;
          let flat = true;
          for (let t = 0.5; t < hit.distance - 0.5; t += 0.5) {
            const q = standAt(s.x + ux * t, s.z + uz * t);
            if (!q || Math.abs(q.y - s.y) > 0.25) { flat = false; break; }
          }
          if (flat) { approach = { s, ux, uz, d: hit.distance }; break; }
        }
      }
      if (approach) break;
    }
    if (approach) {
      const { s, ux, uz, d } = approach;
      for (const jf of [10, 14, 18, 22, 26]) {
        const r = await driveRoute(engine, c, V(s.x, s.y + 0.05, s.z), Math.atan2(ux, uz), 140,
          (inp, i, cc) => {
            inp.move.x = ux; inp.move.y = -uz;
            if (i >= jf && i < jf + 5) inp.hold('jump');
            else if (cc.stateName === 'wallRun' && i % 9 === 0) inp.hold('jump');
            else inp.let_go('jump');
          }, 'wallRun');
        if (r.first >= 0) {
          const mat = (e) => { const x = engine.events.filter((y) => y.evt === e).pop(); return x ? (x.payload?.material ?? '(absent)') : null; };
          runs.push({ script: `F run+jump at wall from (${s.x.toFixed(1)}, ${s.y.toFixed(2)}, ${s.z.toFixed(1)}), wall ${d.toFixed(2)} m, take-off f${jf}`, path: r.path });
          console.log(`\n[attach] script F materials: wallRun -> ${mat('wallRun')}, wallJump -> ${mat('wallJump')}`);
          break;
        }
      }
    }
  }

  /* Script E — the enemy-bounce entry point GUARDS drives. */
  const rE = await driveRoute(engine, c, V(0, 0, 30), Math.PI, 90,
    (inp, i, cc) => { if (i === 5) { cc.grounded = false; cc.bounce(); } }, null);
  runs.push({ script: 'E Controller.bounce() [enemyBounce]', path: rE.path });

  console.log('\n[attach] routes driven in the full world:');
  const seen = new Map();
  for (const r of runs) {
    console.log(`  ${r.script}`);
    console.log(`      ${r.path.slice(0, 8).join(' ')}`);
    for (const step of r.path) {
      const name = step.split('@')[0];
      if (!seen.has(name)) seen.set(name, r.script.slice(0, 1));
    }
  }
  const want = ['hookSwing', 'poleClimb', 'wallClimb', 'wallCling', 'toTarget', 'tiptoe', 'hurt', 'bounce', 'wallRun', 'wallJump'];
  console.log('\n[attach] state -> script that reached it:');
  for (const w of want) console.log(`  ${w.padEnd(12)} ${seen.has(w) ? `script ${seen.get(w)}` : 'NOT REACHED by these scripts'}`);
  const missing = want.filter((w) => !seen.has(w));
  assert.deepEqual(missing, [], `not reached: ${missing.join(', ')}`);
});

test('reach: hurt fires from the ground as well as the air — the request survives its own knock-back', async () => {
  /* ── RETIRED AS A BUG-PIN, KEPT AS A REGRESSION GUARD ──────────────────────────────────────
     This arm was written to pin a live defect and it did its job: it went red the moment
     `StateMachine.request` was fixed, and its own failure message said "retire this arm". What
     follows is the defect it caught, kept because the guard is only legible with it.

     A real ordering defect, found by driving, and it is in `Controller`/`States`, not this lane.
     `Controller.hurt()` ends in `sm.request('hurt')`, which parks the name in `_pending`. But
     `StateMachine.update` runs `current.update()` FIRST and does `if (forced) this.request(forced)`
     — overwriting `_pending`. And `hurt()` sets `grounded = false`, so every grounded locomotion
     state's very next `update` returns `'fall'`. The hurt request is therefore destroyed by the
     knock-back it just caused. `hurt` is `onRequest`, so `request()` is the only way in at all.
     Measured: airborne, `hurt` is entered at frame 40. Grounded, it is never entered in 60
     frames — Sly is knocked into `fall` with no hurt state, no `hurt` clip and no shake.

     Fixed in `States.js:request()`: an outstanding request survives a LOWER-priority one arriving
     in the same frame. Equal or higher still wins, so a genuinely more urgent forced transition is
     unaffected and nothing reachable became unreachable. Both arms now assert the good state, so
     this fails again the day the ordering regresses — which is the whole point of keeping it. */
  const { engine, c } = await realWorld();
  const ground = await driveRoute(engine, c, V(0, 0, 30), Math.PI, 60,
    (inp, i, cc) => { if (i === 5) cc.hurt(new THREE.Vector3(0, 0, 1), 8); }, 'hurt');
  const air = await driveRoute(engine, c, V(0, 0, 30), Math.PI, 90,
    (inp, i, cc) => { inp.move.y = 1; if (i === 10) inp.hold('jump'); if (i === 40) cc.hurt(new THREE.Vector3(0, 0, 1), 8); }, 'hurt');
  console.log(`\n[attach] hurt() grounded -> ${ground.first < 0 ? 'NEVER' : `frame ${ground.first}`}  (${ground.path.slice(0, 4).join(' ')})`);
  console.log(`[attach] hurt() airborne -> ${air.first < 0 ? 'NEVER' : `frame ${air.first}`}  (${air.path.slice(0, 5).join(' ')})`);
  assert.ok(air.first >= 0, 'hurt is unreachable from the air');
  assert.ok(ground.first >= 0,
    'hurt is unreachable from the GROUND again — a forced transition is clobbering the request that '
    + 'caused it, so taking a hit standing still plays no state, no clip and no shake. See '
    + 'States.js request().');
});

/* ====================================================================== */
/* 11 — the feasibility pre-check                                          */
/* ====================================================================== */

/**
 * "Could any input sequence from here satisfy this state's `canEnter`?" — asked before spending
 * a driven run, because three driven rounds this session were spent on scripts that could not
 * have worked.
 *
 * **It does not read `canEnter`. It calls it.** That is the whole design: a table of what each
 * state requires would be a second copy of the predicate and would drift the first time someone
 * edited `Moveset.js` without editing the table. Instead the real predicate is invoked under an
 * envelope of configurations a player controls — grounded/airborne, the machine group, facing,
 * speed, vertical velocity, and which button is down — and if any of them passes, the start is
 * feasible. Nothing here knows what any state wants; it only knows what a player can do.
 *
 * **Position is sampled, not fixed, and that is not optional.** The first version probed only at
 * the start and reported `wallRun` infeasible at a start where the previous round had driven
 * `wallRun@27`, because `probeWall` runs at the current position and the wall was 3.48 m away.
 * A pre-check that rejects reachable starts is worse than no pre-check: it suppresses exactly the
 * driven run that would have found the truth. So the envelope sweeps a neighbourhood out to one
 * full-speed jump's reach, which is the distance a player covers before the question is stale.
 *
 * **What it is not.** Its rejections are only as sound as `R` and the sample step — an affordance
 * 8 m away, or one that falls between samples, is still a false negative. It is a filter that
 * saves driving, never a proof of unreachability. Anything it rejects that matters gets driven.
 */
const FEASIBLE_R = TUNE.runSpeed * (2 * TUNE.jumpV0 / -TUNE.gravity);   // one full-speed jump: 6.60 m
const FEASIBLE_STEP = 1.5;

function feasibleFrom(engine, c, name, start) {
  hardReset(engine, c, start.clone());
  /* Fetched AFTER the reset, not before. `hardReset` now rebuilds the moveset rather than
     scrubbing a hand-written list of private fields (§424), so a state instance captured before
     it is an orphan: `c.sm` holds the new ones and this would have polled a detached object that
     still answers plausibly. The one site in this file where that ordering mattered. */
  const st = c.sm.get(name);
  if (!st) return { possible: false };
  for (let i = 0; i < 6; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  const base = c.position.clone();
  const pts = [base.clone()];
  for (let dx = -FEASIBLE_R; dx <= FEASIBLE_R; dx += FEASIBLE_STEP) {
    for (let dz = -FEASIBLE_R; dz <= FEASIBLE_R; dz += FEASIBLE_STEP) {
      if ((dx === 0 && dz === 0) || Math.hypot(dx, dz) > FEASIBLE_R) continue;
      for (const dy of [0, 1.2, 2.4]) pts.push(V(base.x + dx, base.y + dy, base.z + dz));
    }
  }
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
  const btns = [[], ['jump'], ['crouch'], ['attack'], ['interact'], ['focus', 'jump']];
  for (const btn of btns) {
    engine.input.clear(); engine.input.beginFrame(DT);
    for (const b of btn) engine.input.hold(b);
    for (const P of pts) for (const grp of ['ground', 'air']) for (const [dx, dz] of dirs) {
      for (const sp of [0, TUNE.runSpeed]) for (const vy of (grp === 'air' ? [0, -6, 6] : [0])) {
        c.position.copy(P);
        c.grounded = (grp === 'ground');
        c.velocity.set(dx * sp, c.grounded ? 0 : vy, dz * sp);
        c.wishDir.set(dx, 0, dz); c.wishMag = 1; c.wishRaw.set(0, 0, 1);
        c.airJumps = 1; c.wallRunUsed = 0; c.freeWall();
        c.hangLock = 0; c.poleLock = 0; c.spireLock = 0;
        c.landImpact = 6; c._landFrame = c._frame;
        c.sm.current = c.sm.get(grp === 'air' ? 'fall' : 'idle');
        let ok = false;
        try { ok = st.canEnter(c); } catch { ok = false; }
        if (ok) {
          return { possible: true, dist: P.distanceTo(base), cfg: `${btn.join('+') || 'no button'}, ${grp}, speed ${sp.toFixed(1)}, vy ${vy}` };
        }
      }
    }
  }
  return { possible: false };
}

test('feasibility: the pre-check agrees with driving where driving has an answer, and still rejects', async () => {
  const { engine, c } = await realWorld();
  /* Ground truth from the driven rounds: these two starts DID reach these states, so a
     pre-check that rejects either is broken in the direction that matters. */
  const drivenTrue = [
    ['wall approach', V(-12.4, 0.0, 5.9), 'wallRun'],
    ['desert flat', V(10.9, 0.35, 39.1), 'wallClimb'],
  ];
  /* …and open paving with no rail, pole, vent or hook inside a jump's reach. If the check cannot
     say no here it cannot say no anywhere, which is the tautology failure this file has already
     shipped once (`src.includes(name)`, satisfied by every state from its own registration). */
  const mustReject = [
    ['courtyard spawn', V(0, 0, 30), 'railSlide'],
    ['courtyard spawn', V(0, 0, 30), 'poleClimb'],
    ['courtyard spawn', V(0, 0, 30), 'crawl'],
  ];
  console.log(`\n[feasible] radius ${FEASIBLE_R.toFixed(2)} m (one full-speed jump), step ${FEASIBLE_STEP} m`);
  for (const [nm, p, s] of drivenTrue) {
    const t0 = Date.now();
    const f = feasibleFrom(engine, c, s, p);
    console.log(`  ${nm.padEnd(16)} ${s.padEnd(11)} ${f.possible ? `YES at ${f.dist.toFixed(2)} m — needs ${f.cfg}` : 'no'}  [${Date.now() - t0} ms]`);
    assert.ok(f.possible, `${s} from ${nm} was driven successfully but the pre-check rejects it`);
  }
  for (const [nm, p, s] of mustReject) {
    const t0 = Date.now();
    const f = feasibleFrom(engine, c, s, p);
    console.log(`  ${nm.padEnd(16)} ${s.padEnd(11)} ${f.possible ? `YES at ${f.dist.toFixed(2)} m` : 'no'}  [${Date.now() - t0} ms]`);
    assert.equal(f.possible, false, `${s} is feasible from open paving — the pre-check passes everything`);
  }
});

test('feasibility: sweeping the level finds where spireLand and ledgeHang are possible at all', async () => {
  /* The pre-check applied to a level-wide question: not "is there an authored moment" (a level
     question) but "is there anywhere a player-controllable envelope satisfies the precondition".
     A YES is a place worth pointing a driven run at; it is not a route. An empty result would be
     the stronger finding — no envelope anywhere — but the filter's reach is 6.60 m on a 6 m seed
     grid, so an empty result must be read as **nothing found within the filter's reach**, never
     as unreachable.
     `ledgeClimb` is deliberately absent: it is `onRequest` and has no `canEnter` override, so the
     base `State.canEnter` returns true and this instrument would answer YES everywhere. It cannot
     say anything about it, and saying so is the point — that is the same tautology shape as the
     `src.includes(name)` check this file shipped once. Its reachability is decided entirely by
     `LedgeHang.update` returning it. */
  const { engine, c, collision } = await realWorld();
  const base = c.sm.get('ledgeClimb');
  const { State } = await import('../src/player/States.js');
  assert.equal(Object.getPrototypeOf(base).canEnter, State.prototype.canEnter,
    'ledgeClimb now has its own canEnter — it can be swept, add it here');

  const seeds = [];
  for (let x = -28; x <= 28; x += 6) for (let z = -78; z <= 48; z += 6) {
    const g = collision.groundCheck(V(x, 90, z), TUNE.radius, 300);
    if (g?.hit) seeds.push(V(x, g.y + 0.05, z));
  }
  assert.ok(seeds.length > 50, `only ${seeds.length} standable seeds — the grid missed the level`);
  console.log(`\n[sweep] ${seeds.length} standable seeds on a 6 m grid, filter reach ${FEASIBLE_R.toFixed(2)} m`);
  const report = {};
  for (const name of ['spireLand', 'ledgeHang']) {
    const hits = [];
    for (const s of seeds) {
      const f = feasibleFrom(engine, c, name, s);
      if (f.possible) hits.push({ s, f });
    }
    report[name] = hits.length;
    console.log(`[sweep] ${name}: ${hits.length}/${seeds.length} seeds possible`);
    for (const h of hits.slice(0, 5)) {
      console.log(`    from (${h.s.x.toFixed(1)}, ${h.s.y.toFixed(2)}, ${h.s.z.toFixed(1)}) -> satisfied ${h.f.dist.toFixed(2)} m away`);
    }
  }
  /* Both must be non-empty AND ledgeHang must be commoner than spireLand: 90 `ledge` recs against
     5 `spire`. If that ordering ever inverts, the sweep is measuring something other than the
     level.
   *
   * There used to be a third line here — `assert.ok(report.ledgeHang > 0, ...)` — and it was
   * ENTAILED by the two that remain, found by `tools/armaudit.mjs` (§418). Work the worlds through:
   * if both counts are zero the first line fires; if `spireLand > 0` and `ledgeHang == 0` the last
   * one fires, because `0 > positive` is false. There is no state the deleted line could report
   * that a neighbour does not already report. Only its WORDING was doing work, so the wording
   * moved into the message below rather than being lost — which is what made this look like a
   * trade and was not one.
   *
   * Rejected on the way: giving it something the neighbours do not assert, an absolute floor on
   * `ledgeHang`. Any floor would have been invented on the spot to justify keeping the line, which
   * is §141.1 run backwards. */
  assert.ok(report.spireLand > 0, 'no seed in the level makes spireLand possible within the filter reach');
  assert.ok(report.ledgeHang > report.spireLand,
    `ledgeHang ${report.ledgeHang} is not commoner than spireLand ${report.spireLand} — ` +
    (report.ledgeHang === 0
      ? 'no seed in the level makes ledgeHang possible within the filter reach AT ALL, which is the '
        + 'stronger failure: not a mis-ordering but an absent affordance. '
      : '') +
    'sweep is suspect');
});

/* ====================================================================== */
/* 12 — the two spire beats, driven end to end                             */
/* ====================================================================== */

/**
 * Two authored spire landings, driven from a standing start in the shipped level. What is
 * asserted here is not the routes — those are level content and will move — but the two findings
 * the routes exposed, each of which is an interaction between systems that would otherwise fail
 * silently.
 *
 * ── Two input contracts, because the next person to drive a pole will get both wrong ────────
 *   · **Do not press `interact` near a hook ring.** E is overloaded and `HookSwing` is priority
 *     86 against `PoleClimb` 82, with `hookGrab` 9.0 m against `poleMount` 1.9. From the kiosk
 *     lintel a ring is 4.2 m away, so pressing E to mount the obelisk grabs the rope instead —
 *     `hookSwing@0`, every time. Let the pole auto-grab by walking into it.
 *   · **`PoleClimb` reads RAW stick, not camera-relative.** It gates the climb on `wishRaw.z`,
 *     the same raw-axes idiom `CombatStrafe` uses, because the world defines up-the-shaft rather
 *     than the camera. A world-space steering vector aimed at the shaft feeds it a NEGATIVE
 *     `wishRaw.z` and slides Sly straight back down: `poleClimb@21 -> move@51`. Once mounted the
 *     script has to switch to raw forward.
 * Neither is visible to the feasibility pre-check (arm 11): both are about what `update()` reads,
 * not what `canEnter` demands. A state can be enterable and still unusable.
 */
/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * §514.3 removed thick columns from the pole affordance (the user's ruling, verbatim: "Do not
 * climb up columns, only poles that are thin like pipes or ropes"). The two spire arms that
 * lived here drove CLIMBS of the east-pinnacle shaft (1.7 m) and the obelisk (3.0 m) to reach
 * their hops, and both climbs are now impossible by design. Their subjects were real and remain
 * documented below; the drives come back when a thin climbable with footing reaches each spire.
 *
 *   · the toTarget DEAD WINDOW: a double jump fired inside the lock's acquisition frames takes
 *     the lock's own airborne frames and drops to `fall`. Measured when drivable: misses at
 *     dj ≤ 17, landings from dj 0 and ≥ 24 — the window is early.
 *   · spireGrab SUBSUMES magCatch: the obelisk's bare hop missed the magnet's `catch` 1.008 by
 *     1.090 m and landed anyway, because `SpireLand.canEnter`'s own grab is `spireGrab` 3.4 —
 *     the ordering (spireLand before toTarget) proved which mechanism caught him. The pin that
 *     survives without the drive: a level cannot author that beat strict while spireGrab > catch.
 * ─────────────────────────────────────────────────────────────────────────────────────────── */

test('spire: the column climbs are gone by ruling, and the rope answers where the obelisk did', async () => {
  /* ── DOMAIN (§418.3, inputs from the SHIPPED level) ───────────────────────────────────────
   *   passes on : the §495.A obelisk rope (r 0.15, authored climbable) — it answers the pole
   *               query beside the obelisk; and every pole affordance in the level being thin
   *               (girth <= POLE.girthMax), with the colonnade/obelisk/pinnacles gated.
   *   fails  on : RUN in-arm — the obelisk's own rec (r 1.50) must NOT be the answering rec
   *               anywhere; if it answers, PoleClimb mounts a column against the ruling.
   *   does NOT  : see the toTarget dead window or the spireGrab-vs-magnet ordering fire — those
   *   discrim.    need the top hop, and the drives retire until a climbable with footing reaches
   *               each spire (the rope restores the OBELISK's; the pinnacles have none yet).
   *               Restore the drives from this file's history when they do. The surviving
   *               ordering pin, spireGrab > magCatch, is asserted here so strictness cannot be
   *               authored silently.
   */
  const { engine, c, collision } = await realWorld();
  const { POLE } = await import('../src/world/Collision.js');

  /* every pole that still affords is thin — the whole-level form, immune to new climbables */
  const girth = (rec) => {
    const gp = rec.mesh?.geometry?.parameters;
    const w = rec._world;
    return gp?.radiusTop ?? gp?.radius
      ?? (w ? Math.min(w.max.x - w.min.x, w.max.y - w.min.y, w.max.z - w.min.z) / 2 : 0);
  };
  const affording = new Set();
  for (const e of collision._aff) if (e.rec?.tag === 'pole') affording.add(e.rec);
  assert.ok(affording.size > 0, 'no pole affords at all — the gate swallowed the pipes too');
  for (const rec of affording) {
    assert.ok(girth(rec) <= POLE.girthMax + 1e-6,
      `a pole of girth ${girth(rec).toFixed(2)} still affords — the §514.3 gate is not holding `
      + 'and PoleClimb will mount a column against the design ruling');
  }

  /* the obelisk's replacement: the §495.A rope answers beside it, and the column does not */
  const a = collision.nearest(V(0.5, 10, 12), 'pole', 4.0);
  assert.ok(a, 'nothing affords beside the obelisk — §495.A\'s rope is gone and §8.1 step 2 with it');
  assert.ok(girth(a.rec) <= POLE.girthMax,
    `the answering rec beside the obelisk has girth ${girth(a.rec).toFixed(2)} — that is the `
    + 'column, not the rope, and the gate is rejecting by nothing');

  assert.ok(TUNE.spireGrab > TUNE.magCatch,
    'spireGrab no longer subsumes magCatch — the obelisk beat can be authored strict; retire '
    + 'this pin and restore the ordering drive when the climb returns');
  console.log(`[spire] ${affording.size} thin poles afford (girth <= ${POLE.girthMax}); the rope answers at the obelisk`);
});

/* ====================================================================== */
/* 13 — the input-contract census                                          */
/* ====================================================================== */

/**
 * Arm 11 gates ENTRY: could any input sequence satisfy `canEnter`. This gates OPERATION: once
 * inside, which inputs does the state actually read? A state can be enterable and still unusable
 * because its `update()` reads a different input than the approach supplies, and two driven runs
 * were lost to exactly that — `HookSwing` taking `interact` from a pole mount, and `PoleClimb`
 * gating its climb on RAW stick while the driver supplied a camera-relative vector.
 *
 * **Observed, not tabulated.** A table of "which state reads what" is a second copy that drifts
 * the first time someone edits `Moveset.js` (§388). So the real `canEnter`/`enter`/`update` are
 * invoked with the input object and the two stick vectors replaced by recording proxies, and the
 * census is whatever they actually touched.
 *
 * ── What this method CANNOT see, stated the way `peakY` was ─────────────────────────────────
 * It is a **lower bound**: it reports reads that happened, on the branches that ran. A button
 * read behind a condition none of the probe configurations satisfied is invisible. Coverage is
 * widened by sweeping a small envelope per state, but no envelope is complete, so absence here
 * is "not observed", never "not read". It DOES see reads through helpers — `c.canGroundJump()`,
 * `travelDir(c, …)` — because the proxy sits on the data, not on the call site, which is the one
 * thing a static parse of the class body would miss.
 */
function inputCensus(state, c, engine, configs) {
  const btn = new Set(), stick = new Set();
  const realInput = c.input;
  const spyInput = {
    get move() { stick.add('move'); return realInput.move; },
    beginFrame: (dt) => realInput.beginFrame(dt),
    down: (a) => { btn.add(a); return realInput.down(a); },
    pressed: (a) => { btn.add(a); return realInput.pressed(a); },
    released: (a) => { btn.add(a); return realInput.released(a); },
    bufferedPeek: (a, ms) => { btn.add(a); return realInput.bufferedPeek(a, ms); },
    buffered: (a, ms) => { btn.add(a); return realInput.buffered(a, ms); },
    hold: (a) => realInput.hold(a),
    let_go: (a) => realInput.let_go(a),
    clear: () => realInput.clear?.(),
  };
  const rawVec = c.wishRaw, dirVec = c.wishDir;
  const mkSpy = (v, tag) => new Proxy(v, {
    get(t, p) { if (p === 'x' || p === 'y' || p === 'z') stick.add(tag); return Reflect.get(t, p); },
  });
  c.input = spyInput;
  Object.defineProperty(c, 'wishRaw', { configurable: true, get: () => mkSpy(rawVec, 'wishRaw') });
  Object.defineProperty(c, 'wishDir', { configurable: true, get: () => mkSpy(dirVec, 'wishDir') });
  try {
    for (const cfg of configs) {
      cfg(c, engine, realInput);
      try { state.canEnter(c); } catch { /* census only cares what it read */ }
      try { state.enter(c); } catch { /* ditto */ }
      try { state.update(c, DT); } catch { /* ditto */ }
    }
  } finally {
    c.input = realInput;
    delete c.wishRaw; delete c.wishDir;
    c.wishRaw = rawVec; c.wishDir = dirVec;
  }
  return { buttons: [...btn].sort(), stick: [...stick].sort() };
}

function censusConfigs() {
  const out = [];
  for (const grounded of [true, false]) {
    for (const btns of [[], ['jump'], ['crouch'], ['attack'], ['interact'], ['focus'], ['sneak'], ['glide']]) {
      out.push((c, engine, realInput) => {
        realInput.clear(); realInput.beginFrame(DT);
        for (const b of btns) realInput.hold(b);
        /* `mark()` and `afford()` memoise on `_frame`, which only advances inside `update()`.
           Without this the second config onward reads the first one's cached answer and every
           state whose raw-stick read sits behind a lock-on or affordance guard returns early —
           which is precisely how `combatStrafe` went missing from the first run of this census. */
        c._frame++;
        /* Position must be re-pinned too: each state's `update()` calls `move()`, so without this
           every state after the first is probed from wherever the previous one left Sly — which
           put `combatStrafe` out of `lockRange` of the stub guard and hid its raw-stick read. */
        c.position.set(0, 0, 30);
        c.grounded = grounded;
        c.velocity.set(0, grounded ? 0 : -4, 4);
        c.wishRaw.set(0, 0, 1); c.wishDir.set(0, 0, 1); c.wishMag = 1;
        c.airJumps = 1; c.wallRunUsed = 0; c.freeWall();
        c.hangLock = 0; c.poleLock = 0; c.spireLock = 0;
        c.sm.current = c.sm.get(grounded ? 'idle' : 'fall');
      });
    }
  }
  return out;
}

test('census: the input contract of every state, observed by proxy rather than tabulated', async () => {
  const { engine, c } = await realWorld();
  hardReset(engine, c, V(0, 0, 30));
  for (let i = 0; i < 4; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  const cfgs = censusConfigs();
  const rows = [];
  for (const s of c.sm.ordered) {
    const r = inputCensus(s, c, engine, cfgs);
    rows.push({ name: s.name, pri: s.priority, ...r });
  }
  console.log('\n[contract] state          pri  stick        buttons observed');
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(14)} ${String(r.pri).padStart(3)}  ${(r.stick.join('+') || '—').padEnd(12)} ${r.buttons.join(', ') || '—'}`);
  }

  /* (2a) The stick partition. `PoleClimb` and `CombatStrafe` read RAW on purpose — a lock-on and
     a shaft both define their own axes, so camera-relative input is exactly what they suspend.
     Everything else steers camera-relative. A state that silently switches idiom reddens here. */
  const raw = rows.filter((r) => r.stick.includes('wishRaw')).map((r) => r.name).sort();
  console.log(`\n[contract] raw-stick states: ${raw.join(', ')}`);
  assert.ok(raw.includes('poleClimb'), 'poleClimb no longer reads wishRaw — the climb idiom changed');
  assert.ok(raw.includes('combatStrafe'), 'combatStrafe no longer reads wishRaw — the orbit idiom changed');
  assert.ok(raw.length <= 6, `${raw.length} states now read raw stick (${raw.join(', ')}) — the partition is drifting`);

  /* (2b) The button-overload map. `interact` is contended; the highest priority wins, which is
     why pressing E to mount a pole from the kiosk lintel grabs a hook rope instead. This turns a
     header comment into a checked fact. */
  const wants = (b) => rows.filter((r) => r.buttons.includes(b)).sort((x, y) => y.pri - x.pri);
  for (const b of ['interact', 'jump', 'attack', 'crouch']) {
    console.log(`[contract] "${b}" contended by: ${wants(b).map((r) => `${r.name}(${r.pri})`).join(' > ')}`);
  }
  const inter = wants('interact');
  /* `hookSwing` must be the highest-priority observed reader of `interact` — that is the whole
     kiosk-lintel hazard: E is contended and the higher priority takes it.
     Note what is NOT in this list: `poleClimb` and `railSlide` both read `interact`, but behind
     `afford('pole')`/`afford('rail')`, and this census is probed from open paving where neither
     affordance exists. That is the lower bound in the header demonstrating itself — absence here
     is "not observed", never "not read" — and it is why the assertion is on the top of the list
     rather than on a full ordering the method cannot see. */
  assert.ok(inter.length > 1, 'interact is no longer contended — the overload note is stale');
  assert.equal(inter[0].name, 'hookSwing',
    `${inter[0].name} now outranks hookSwing for interact: the kiosk-lintel hazard changed`);
});

test('census: the contract prober detects a state nothing else reads (calibration)', async () => {
  /* It must be able to fire. A synthetic state that reads a button no shipped state reads and a
     stick idiom it would be wrong about — if the prober cannot see these, it cannot see anything,
     and a census that reports the same answer for every input is the tautology this file has
     already shipped once. */
  const { engine, c } = await realWorld();
  hardReset(engine, c, V(0, 0, 30));
  for (let i = 0; i < 4; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  const { State } = await import('../src/player/States.js');
  class Canary extends State {
    canEnter(ctx) { const z = ctx.wishRaw.z; return ctx.pressed('binocucom') && z > 0.3; }
    update(ctx) { if (ctx.down('zzz_never_bound')) return 'idle'; return null; }
  }
  const r = inputCensus(new Canary('canary', {}), c, engine, censusConfigs());
  console.log(`\n[contract] canary -> stick ${r.stick.join('+') || '—'}, buttons ${r.buttons.join(', ') || '—'}`);
  assert.ok(r.buttons.includes('binocucom'), 'prober missed a button read in canEnter');
  assert.ok(r.buttons.includes('zzz_never_bound'), 'prober missed a button read in update');
  assert.ok(r.stick.includes('wishRaw'), 'prober missed a wishRaw read');
  // …and it must not invent reads: the canary never touches wishDir.
  assert.ok(!r.stick.includes('wishDir'), 'prober reported a wishDir read the canary never made');
});

/* ====================================================================== */
/* 14 — Route C: the vent column, settled by enumeration                   */
/* ====================================================================== */

test('crawl: the vent column, enumerated rather than cast — and the aperture that now fits', async () => {
  /* The open question from §392, and the test case for the defences in this file's header.
   * Two `groundCheck` casts of the same column disagreed (13.50 from y=20, ~0.0 from y=90) and I
   * could not say which was right. A cast cannot answer it; **a histogram can**, because it has
   * no origin to be fooled by. Enumerating every collider whose world bounding box contains the
   * column resolves it in one pass, and the answer corrects me: there IS a `proxy:ground` deck at
   * y 12.50..13.50 over that column, so the y=20 cast was right about its own origin — I had
   * conflated two different columns, at x -19.3 and x -21.0.
   *
   * The finding this turned up is not about the floor at all. */
  const { engine, c, collision } = await realWorld();
  const worldBox = (m) => {
    m.updateWorldMatrix(true, false);
    const g = m.geometry;
    if (!g) return null;
    g.computeBoundingBox();
    return g.boundingBox.clone().applyMatrix4(m.matrixWorld);
  };
  const column = (x, z, pad = 0.4) => {
    const out = [];
    for (const r of collision.recs) {
      const b = worldBox(r.mesh);
      if (!b) continue;
      if (x >= b.min.x - pad && x <= b.max.x + pad && z >= b.min.z - pad && z <= b.max.z + pad) {
        out.push({ tag: r.tag, name: String(r.mesh.name || '-').slice(0, 22), lo: b.min.y, hi: b.max.y });
      }
    }
    return out.sort((a, b) => b.hi - a.hi);
  };
  /* §600 moved the bore to x -22.70..-21.00 when it built the passage, so the column this arm
     was written against no longer has a vent in it. -21.85 is the new axis. */
  const hits = column(-21.85, -49.4);
  console.log('\n[vent] column (-21.85, ·, -49.4), every collider whose box contains it:');
  for (const h of hits) console.log(`  ${h.tag.padEnd(7)} ${h.name.padEnd(22)} y ${h.lo.toFixed(2)}..${h.hi.toFixed(2)}`);
  assert.ok(hits.length > 3, 'the column enumeration found almost nothing — check the world build');
  assert.ok(hits.some((h) => h.tag === 'vent'), 'no vent in the column this route is about');
  // The deck that made one cast disagree with the other. Named, so "which floor" is never a guess.
  assert.ok(hits.some((h) => h.tag === 'ground' && h.hi > 12 && h.hi < 15),
    'the y~13.5 deck is gone — the cast-origin disagreement in the header no longer reproduces here');

  /* THE FINDING, AND ITS RETIREMENT (§600). This arm used to record that the small vent's
     aperture was 0.60 m of clear height against a `TUNE.crawlHeight` of 0.64 — **the crawl
     capsule was 0.04 m taller than the hole it was meant to go through** — and asserted that at
     least one vent stayed tighter than the capsule, so the finding could not be lost quietly.
     The passage is built now and every aperture clears the capsule, so the assertion is inverted
     rather than deleted: it would be a defect for one to go tight again.

     And the bound is the STEP PROBE, not the capsule. `Controller._moveHorizontal` lifts a
     grounded capsule `TUNE.stepHeight` before every horizontal sweep, so 0.68 m of clear height
     is not enough for a crawler to move through — 1.10 m is, on the flat. That number is what
     `tests/ventroute.test.mjs` R2 asserts along the whole bore; this arm keeps the weaker,
     local form so the column enumeration it is built around still says something. */
  const vents = hits.filter((h) => h.tag === 'vent').map((h) => ({ ...h, aperture: h.hi - h.lo }));
  for (const v of vents) {
    console.log(`[vent] aperture ${v.aperture.toFixed(2)} m vs crawlHeight ${TUNE.crawlHeight} + ` +
                `stepHeight ${TUNE.stepHeight} -> ` +
                `${v.aperture < TUNE.crawlHeight + TUNE.stepHeight ? 'TIGHT' : 'clears the step probe'}`);
  }
  const tight = vents.filter((v) => v.aperture < TUNE.crawlHeight);
  assert.equal(tight.length, 0,
    `${tight.length} vent volume(s) in this column are shorter than the crawl capsule itself — that is ` +
    'the §392 aperture defect returning, and §600 built the passage on the premise that it is gone');

  /* And the reachability half. It used to end here with "walking in from x -19.3 the traverse
     never makes `inVent()` true, I cannot account for that difference and am not claiming a route
     from it" — the walk was over the sand that §600's `PROXY_OPENINGS` entry has since cut, at an
     x the bore no longer occupies. The route is claimed now, and driven end to end both ways, in
     `tests/ventroute.test.mjs`. This keeps the local half: standing in the volume, `crawl`
     engages. */
  const floorAt = (x, z, from = 5) => {
    const g = collision.groundCheck(V(x, from, z), TUNE.radius, 300);
    return g?.hit ? g.y : null;
  };
  const y1 = floorAt(-21.85, -49.4);
  hardReset(engine, c, V(-21.85, (y1 ?? 0) + 0.05, -49.4));
  let ventFrames = 0, sawCrawl = false;
  for (let i = 0; i < 120; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
    if (c.inVent()) ventFrames++;
    if (c.stateName === 'crawl') sawCrawl = true;
  }
  console.log(`[vent] standing at (-21.85, ${(y1 ?? 0).toFixed(2)}, -49.4): crawl=${sawCrawl}, inVent ${ventFrames}/120 frames`);
  assert.ok(sawCrawl, 'crawl no longer engages even from inside the vent volume');
});

/* ====================================================================== */
/* 15 — the lateral basis, and the shimmy finding it retracts              */
/* ====================================================================== */

/**
 * Sly's own right-hand direction, taken from the engine rather than written down.
 *
 * **This helper exists because getting it wrong is instrument error five.** The previous version
 * of arm 15 measured shimmy displacement against `(cos yaw, 0, -sin yaw)` — copied in good faith
 * from `WallRun.enter`, which at the time wrote it as if it were the right vector, as
 * `Controller.narrowGround` and `CameraRig._buildBasis` still do. **It is the LEFT vector**, so
 * every direction that arm reported came out backwards, and a state that works was filed as
 * broken while two that were broken passed. Arm 21 is the census of who else writes it by hand.
 *
 * `aimCamera` + `_readInput` is the way to ask without a formula: point the camera along the
 * facing in question, push the stick right, and read what the game's own input pipeline produces.
 * That is `_rgt.crossVectors(_fwd, UP)` (`Controller.js:721`) — the definition every metre Sly
 * has ever strafed already obeys — reached through the pipeline instead of restated.
 */
function aimCamera(engine, dir) {
  const cam = engine.camera;
  cam.position.set(0, 0, 0);
  cam.lookAt(dir.x, 0, dir.z);
  cam.updateMatrixWorld(true);
}
/**
 * The world direction a stick-RIGHT produces for a player whose camera looks along `face`.
 *
 * **Restores the camera**, which is not fussiness. The first version left it wherever the last
 * query pointed it, and the next thing to drive with `move.y = 1` — `wishDir` is camera-relative
 * — ran off at whatever angle the probe had last asked about and never reached the wall it was
 * aimed at. A measuring instrument that moves the thing it measures from is the same family of
 * error as everything else in this file's header.
 */
function stickRightFor(engine, c, face) {
  const keep = engine.camera.quaternion.clone();
  aimCamera(engine, face);
  engine.input.beginFrame(DT); engine.input.move.x = 1; engine.input.move.y = 0;
  c._readInput();
  const out = c.wishDir.clone();
  engine.camera.quaternion.copy(keep);
  engine.camera.updateMatrixWorld(true);
  return out;
}
const faceOf = (yaw) => V(Math.sin(yaw), 0, Math.cos(yaw));

/** The 26 real-level hang poses `ledgeHang` accepts. Shared by arms 15 and 16. */
function hangSpots(collision) {
  const spots = [];
  for (const r of collision.recs.filter((x) => x.tag === 'ledge')) {
    const g = r.mesh.geometry;
    if (!g) continue;
    g.computeBoundingBox();
    const bb = g.boundingBox.clone().applyMatrix4(r.mesh.matrixWorld);
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const s of [0.25, 0.5, 0.75]) {
      const px = ux !== 0 ? (bb.min.x + bb.max.x) / 2 + ux * ((bb.max.x - bb.min.x) / 2 + 0.45)
                          : bb.min.x + (bb.max.x - bb.min.x) * s;
      const pz = uz !== 0 ? (bb.min.z + bb.max.z) / 2 + uz * ((bb.max.z - bb.min.z) / 2 + 0.45)
                          : bb.min.z + (bb.max.z - bb.min.z) * s;
      spots.push({ px, pz, ux, uz, top: bb.max.y });
    }
    if (spots.length > 240) break;
  }
  return spots;
}

test('basis: "right" is faceDir x UP, and (cos yaw, 0, -sin yaw) is its exact negation', async () => {
  /* The calibration the next three arms stand on, and the one that must fire: if this project's
   * handedness ever changes, this reddens first and every direction claim below is re-derived
   * rather than silently re-interpreted.
   *
   * Three independent legs, because a single derivation is what produced the wrong answer:
   *   1. DRIVEN — the input pipeline's own answer for stick-right at five yaws (below).
   *   2. THE RIG — `SlyModel.js:812` puts `shoulderL` at local x +0.052 and `shoulderR` at
   *      −0.052, and `_pushCharacter` applies `rotation.set(0, yaw, 0)` with no offset, so the
   *      model's left is +X. A body whose left is +X and whose forward is +Z has its right at −X,
   *      which is `faceDir × UP`, not its negation.
   *   3. THE FALLBACK — `Controller.js:719` substitutes `(sin yaw, 0, cos yaw)` for the camera
   *      forward when the camera collapses, so `faceDir` and the camera axis are the same idiom.
   *   4. ANIMATION AGREES, in the opposite direction — `Animation.js:773` picks
   *      `turnRate > 0 ? 'turn_l' : 'turn_r'`, and `turnRate` is `dyaw/dt`. The derivative of
   *      `faceDir` with respect to yaw is exactly `(cos yaw, 0, -sin yaw)`, so that line is
   *      already treating this vector as the direction Sly turns TOWARD when yaw rises — his
   *      LEFT — and gets its clip right. The same expression is used as his right in
   *      `CameraRig._buildBasis`. Two of the three files are wrong about it and this is not one. */
  const { engine, c } = await realWorld();
  hardReset(engine, c, V(0, 0, 30));
  for (let i = 0; i < 4; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  console.log('\n[basis] yaw     stick-right ->    dot(faceDir x UP)  dot(cos yaw,0,-sin yaw)');
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7]) {
    hardReset(engine, c, V(0, 0, 30), yaw);
    const got = stickRightFor(engine, c, faceOf(yaw));
    const cross = new THREE.Vector3().crossVectors(faceOf(yaw), new THREE.Vector3(0, 1, 0)).normalize();
    const written = V(Math.cos(yaw), 0, -Math.sin(yaw));
    console.log(`  ${yaw.toFixed(2).padStart(5)}   (${got.x.toFixed(2)}, ${got.z.toFixed(2)})` +
                `        ${got.dot(cross).toFixed(3).padStart(6)}            ${got.dot(written).toFixed(3).padStart(6)}`);
    assert.ok(got.dot(cross) > 0.999, `stick-right at yaw ${yaw} is not faceDir x UP`);
    assert.ok(got.dot(written) < -0.999,
      `(cos yaw, 0, -sin yaw) is no longer the exact negation of right at yaw ${yaw} — ` +
      're-derive arms 15, 16 and 18 before believing any of them');
  }
});

test('ledgeHang: the shimmy is NOT inverted — RETRACTING my own §393 finding', async () => {
  /* ── RETRACTION ─────────────────────────────────────────────────────────────────────────────
   * This arm used to assert `right === 0, left === total` and read that as "stick RIGHT shimmies
   * Sly LEFT". **The counts reproduce exactly and the conclusion was backwards**, because the
   * basis vector it projected onto was Sly's left (see the arm above). The step is taken along
   * `_b = up × n` (`Moveset.js:798`); Sly hangs facing the wall so `faceDir = -n`, and
   * `up × n = -n × up = faceDir × up` = **his right**. The code was correct all along.
   *
   * That is the fourth time this session a correct measurement was made against the wrong world,
   * and the first one where the wrong world was a single unit vector. The header's four defences
   * did not cover it, so this one gets a fifth: **do not restate a basis vector — drive it.**
   *
   * ── The three-way question, answered ────────────────────────────────────────────────────────
   * Is the MOTION backwards, is the CLIP mirrored, or both? Neither. Measured against what the
   * same stick does through the walk pipeline with the camera behind Sly — no formula anywhere in
   * the comparison — the shimmy agrees with the walk in both directions, and the clip agrees with
   * the motion:
   *
   *     stick RIGHT   23/23 the way a stick-right walk goes, 0 opposite    ledge_shimmy_r
   *     stick LEFT    23/23 the way a stick-left  walk goes, 0 opposite    ledge_shimmy_l
   *
   * There is no design decision to make here and nothing in `src/**` to change. The one thing
   * that IS backwards is in arm 18, which found the same constant used where it decides a clip. */
  const { engine, c, collision } = await realWorld();
  hardReset(engine, c, V(0, 0, 30));
  for (let i = 0; i < 4; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  const spots = hangSpots(collision);
  const realBaseClip = c.baseClip.bind(c);

  /** Hold `mx` for 45 frames from every hang pose, against a walk with the same stick. */
  function sweep(mx) {
    let entered = 0, agree = 0, oppose = 0, moved = 0;
    const clips = new Map();
    for (const s of spots) {
      c.position.set(s.px, s.top - TUNE.hangReach + 0.4, s.pz);
      c.grounded = false; c._frame++;
      if (!c.probeLedge(V(-s.ux, 0, -s.uz)).ok) continue;
      hardReset(engine, c, V(s.px, s.top - TUNE.hangReach + 0.4, s.pz));
      c.position.set(s.px, s.top - TUNE.hangReach + 0.4, s.pz);
      c.grounded = false; c._needSpawnSnap = false; c._frame++;
      c.probeLedge(V(-s.ux, 0, -s.uz));
      c.sm.set('ledgeHang');
      if (c.stateName !== 'ledgeHang') continue;
      entered++;
      /* The reference: camera behind Sly looking the way he faces, which is what the
         `ledge_hang` framing does (`CameraRig.js:265` shortens the boom by 0.70 m; `dist` is
         metres ADDED to it, and the boom is clamped at `distHardMin` 0.55, so it never crosses
         to the far side). Then ask the pipeline what this stick means. */
      const walk = stickRightFor(engine, c, faceOf(c.yaw)).multiplyScalar(Math.sign(mx));
      const p0 = c.position.clone();
      const seen = [];
      c.baseClip = (n, b) => { seen.push(n); return realBaseClip(n, b); };
      for (let i = 0; i < 45; i++) {
        engine.input.beginFrame(DT); engine.input.move.x = mx; engine.input.move.y = 0;
        engine.time = i * DT; c.update(DT, i * DT);
        if (c.stateName !== 'ledgeHang') break;
      }
      c.baseClip = realBaseClip;
      const d = c.position.clone().sub(p0); d.y = 0;
      if (d.length() <= 0.02) continue;
      moved++;
      if (d.normalize().dot(walk) > 0) agree++; else oppose++;
      for (const n of new Set(seen)) if (n.includes('shimmy')) clips.set(n, (clips.get(n) || 0) + 1);
    }
    return { entered, moved, agree, oppose, clips };
  }

  const R = sweep(1), L = sweep(-1);
  console.log(`\n[shimmy] ${R.entered} hang poses entered ledgeHang`);
  for (const [tag, r] of [['RIGHT', R], ['LEFT ', L]]) {
    console.log(`[shimmy] stick ${tag}: ${r.moved} moved — with the walk ${r.agree}, against it ${r.oppose}` +
                `   clips ${[...r.clips.keys()].join('+') || '—'}`);
  }
  assert.ok(R.entered >= 10, `only ${R.entered} hang poses entered ledgeHang — the sample is too small`);
  assert.ok(R.moved >= 10 && L.moved >= 10, `only ${R.moved}/${L.moved} shimmied at all — cannot judge direction`);
  assert.equal(R.oppose, 0, `${R.oppose} of ${R.moved} shimmies go against a stick-right walk — the sign HAS inverted`);
  assert.equal(L.oppose, 0, `${L.oppose} of ${L.moved} shimmies go against a stick-left walk — the sign HAS inverted`);
  /* The clip half of the three-way question. `ledge_shimmy_l` is authored as "reach with the left
     glove" (`Clips.js:1566`) and `_r` is its mirror through `defMirror`, so the name is the
     direction; a swap here is the moonwalk case and it is not present. */
  assert.deepEqual([...R.clips.keys()], ['ledge_shimmy_r'], 'stick RIGHT no longer plays ledge_shimmy_r');
  assert.deepEqual([...L.clips.keys()], ['ledge_shimmy_l'], 'stick LEFT no longer plays ledge_shimmy_l');
});

/* ====================================================================== */
/* 16 — finishing the axis: the ledge drop, and poleSwing                  */
/* ====================================================================== */

test('ledgeHang drop / poleSwing: the other two raw-stick axes, driven', async () => {
  /* The two axes next to the shimmy, and the question each answers is different:
   *   · the DROP shares the state — if its z-axis were inverted, stick-back would climb. It is
   *     measured against the state's OWN stored normal, so it never depended on the left/right
   *     basis and survives the arm-15 retraction unchanged.
   *   · `poleSwing` shares the AXIS (`wishRaw.x`) but not the state.
   *
   * ── The poleSwing half asserts the FIXED behaviour: the orbit follows the stick ─────────────
   * Push right on a pole and Sly goes right. Every pose the level offers, measured against what
   * the same stick does through the walk pipeline — no formula anywhere in the comparison.
   *
   * **Why this arm exists, in the numbers that made it necessary.** Before the fix it was
   * `dir = -Math.sign(wishRaw.x)` and this measured **0/12 with the stick, 12/12 against it**.
   * Two rounds missed it because the arm asserting it was healthy projected onto
   * `(cos yaw, 0, -sin yaw)` — Sly's LEFT (arm 15's calibration) — so a uniform inversion read as
   * a clean pass, and that reading was then used to argue the shimmy defect was local rather than
   * shared. It was neither: the shimmy was never broken and this was.
   *
   * Three checks, deliberately of different kinds, because the last two rounds proved one is not
   * enough:
   *   1. **against a walk** — the stick means the same thing on a pole as on the ground;
   *   2. **against the retracted basis** — it must now label every arc the OTHER way, which is
   *      what makes "the two bases are exact opposites" a measured fact rather than an argument;
   *   3. **against NO STICK** — `dir` defaults to `+1`, so a neutral stick already orbits one
   *      way. The pre-fix code made pushing right *reverse* the direction letting go produced.
   *      That check needs no basis vector, no camera and no walk, and it would have caught this
   *      in the first round for free.
   *
   * The measurement excludes frame 1, which snaps him onto the orbit radius; including it gives
   * the same counts, so the snap is not what decides this. */
  const { engine, c, collision } = await realWorld();
  hardReset(engine, c, V(0, 0, 30));
  for (let i = 0; i < 4; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }

  /* ---- the drop: stick BACK must release, and release outward ---- */
  const spots = hangSpots(collision);
  let ent = 0, released = 0, climbed = 0, away = 0, into = 0;
  for (const s of spots) {
    c.position.set(s.px, s.top - TUNE.hangReach + 0.4, s.pz);
    c.grounded = false; c._frame++;
    if (!c.probeLedge(V(-s.ux, 0, -s.uz)).ok) continue;
    hardReset(engine, c, V(s.px, s.top - TUNE.hangReach + 0.4, s.pz));
    c.position.set(s.px, s.top - TUNE.hangReach + 0.4, s.pz);
    c.grounded = false; c._needSpawnSnap = false; c._frame++;
    c.probeLedge(V(-s.ux, 0, -s.uz));
    c.sm.set('ledgeHang');
    if (c.stateName !== 'ledgeHang') continue;
    ent++;
    const LH = c.sm.get('ledgeHang');
    const n = new THREE.Vector3(LH._nx, 0, LH._nz).normalize();   // the state's OWN stored normal
    const p0 = c.position.clone();
    let left = false;
    for (let i = 0; i < 30 && !left; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = -1;  // stick BACK
      engine.time = i * DT; c.update(DT, i * DT);
      if (c.stateName !== 'ledgeHang') left = true;
    }
    if (!left) continue;
    if (c.stateName === 'ledgeClimb') { climbed++; continue; }
    released++;
    const d = c.position.clone().sub(p0); d.y = 0;
    if (d.dot(n) > 0) away++; else into++;
  }
  console.log(`\n[drop] ${ent} hang poses; stick BACK -> released ${released}, climbed ${climbed}`);
  console.log(`[drop]   away from the wall ${away}   into the wall ${into}`);
  /* The z-axis is NOT inverted: stick back releases, it never climbs. That is the claim. */
  assert.ok(ent >= 10, `only ${ent} hang poses to sample`);
  assert.equal(climbed, 0, `stick BACK sent ${climbed} poses to ledgeClimb — the drop axis is inverted too`);
  assert.equal(released, ent, 'stick BACK did not release from every hang pose');
  assert.ok(away > into * 3, `only ${away} of ${released} released outward — the drop nudge may be inverted`);
  /* The `into` minority is NOT claimed as correct-or-buggy. The drop nudge itself is outward by
     construction (`position += normal * 0.06`), and one frame of `Fall` cannot overcome 0.06 m
     with air control alone. The untested hypothesis is `ledgeAssist()`, which `Fall.air()` runs
     as soon as `velocity.y < 0` and which pulls horizontally TOWARD a ledge — i.e. possibly back
     toward the one just released. `hangLock` blocks re-GRABBING but not the assist. Not
     confirmed, so it is bounded here rather than asserted either way. */

  /* ---- poleSwing: the orbit follows the stick ---- */
  let pent = 0, pwith = 0, pagainst = 0, pold = 0, pneutral = 0;
  for (const r of collision.recs.filter((x) => x.tag === 'pole')) {
    const ud = r.mesh.userData || {}, p = r.mesh.position;
    const y = ((ud.bottom ?? p.y) + (ud.top ?? p.y)) / 2;
    for (const off of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
      /** Mount the pole, hold `mx` for the arc, return the chord from frame 1 to frame 10. */
      const swing = (mx) => {
        hardReset(engine, c, V(p.x + off[0], y, p.z + off[1]));
        c.position.set(p.x + off[0], y, p.z + off[1]);
        c.grounded = false; c._needSpawnSnap = false; c._frame++;
        if (!c.afford('pole')) return null;
        c.sm.set('poleClimb');
        if (c.stateName !== 'poleClimb') return null;
        c.sm.set('poleSwing');
        if (c.stateName !== 'poleSwing') return null;
        const yaw0 = c.yaw;                          // facing at the moment of the press: the pole
        /* Frame 1 snaps him from `hold`-ish onto exactly `hold`; the ARC is frames 1..10. */
        engine.input.beginFrame(DT); engine.input.move.x = mx; engine.input.move.y = 0;
        engine.time = 0; c.update(DT, 0);
        const p1 = c.position.clone();
        for (let i = 1; i < 10; i++) {
          engine.input.beginFrame(DT); engine.input.move.x = mx; engine.input.move.y = 0;
          engine.time = i * DT; c.update(DT, i * DT);
          if (c.stateName !== 'poleSwing') break;
        }
        const d = c.position.clone().sub(p1); d.y = 0;
        return d.length() < 1e-4 ? null : { d: d.normalize(), yaw0 };
      };
      const right = swing(1);
      if (!right) continue;
      pent++;
      const walkRight = stickRightFor(engine, c, faceOf(right.yaw0));
      const oldBasis = V(Math.cos(right.yaw0), 0, -Math.sin(right.yaw0));  // the retracted basis
      if (right.d.dot(walkRight) > 0) pwith++; else pagainst++;
      if (right.d.dot(oldBasis) > 0) pold++;
      const neutral = swing(0);                       // check 3: no stick at all
      if (neutral && neutral.d.dot(right.d) > 0) pneutral++;
    }
    if (pent >= 12) break;
  }
  console.log(`[poleSwing] entered ${pent}; stick RIGHT -> with a stick-right walk ${pwith}, against it ${pagainst}`);
  console.log(`[poleSwing]   retracted basis calls this same arc "his right" ${pold}/${pent}` +
              `   |   agrees with a NEUTRAL stick ${pneutral}/${pent}`);
  assert.ok(pent >= 8, `only ${pent} pole poses entered poleSwing`);
  /* (1) The stick means the same thing on a pole as it does on the ground. */
  assert.equal(pagainst, 0,
    `${pagainst} of ${pent} pole swings orbit AGAINST a stick-right walk. The sign in ` +
    'PoleSwing.update (Moveset.js:1311) has inverted again — it must be `Math.sign(wishRaw.x)`.');
  assert.equal(pwith, pent, `only ${pwith} of ${pent} orbited with the stick — the fix is not uniform`);
  /* (2) The two bases are exact opposites, measured on this arm's own data rather than argued
     from arm 15's. This is what makes the retraction checkable here and not just asserted. */
  assert.equal(pold, 0,
    'the retracted basis no longer mirrors the calibrated one here — arm 15 and this arm disagree ' +
    'about handedness, and one of them is now wrong');
  /* (3) The check that needed no basis at all: `dir` defaults to +1, and pushing right must not
     reverse what letting go does. This was the free catch that two rounds walked past. */
  assert.equal(pneutral, pent,
    `${pent - pneutral} of ${pent} pole swings reverse when the stick is RELEASED — stick-right and ` +
    'the neutral default disagree, which is exactly the shape of the bug this arm was written for');
});

/* ====================================================================== */
/* 17 — the vent walk-in: two refuted hypotheses and a route               */
/* ====================================================================== */

test('crawl: reachable by traversal — the walk-in failed on lateral drift, not the capsule', async () => {
  /* The last open item, and both of my hypotheses were wrong.
   *
   * **Refuted 1 — the sweep pushing a too-tall capsule clear.** Wrapping `capsuleSweep` and
   * recording its resolution vector through the crossing: the largest |dy| per frame is a flat
   * ~0.35 m at every x, near the vent and far from it alike — that is `_moveHorizontal`'s
   * step-up/step-down probe, not a vent interaction. And the STANDING case that succeeds resolves
   * too (0.013 m). The tell that killed it: the standing hit is at a HIGHER y (0.859) than the
   * walking misses (0.844), so nothing was being pushed up.
   *
   * **Refuted 2 — tunnelling past a narrow trigger.** Sampling `inVent()` every 0.02 m along the
   * approach line gives a window 1.680 m wide in x. One frame of travel at `runSpeed` is 0.120 m,
   * so the trigger is 14 frames wide. Nothing is being skipped.
   *
   * **The actual cause: lateral drift.** The floor rises along the approach, and walking a pure
   * −X stick across it slides Sly in +z — 0.61 m over 35 frames, 4.6 m over 300. The vent's
   * z-extent ends at −49.26 and the approach starts at −49.40, i.e. **0.14 m of margin**, so he
   * leaves the z window long before reaching the x window. Static probes at the drive's own x and
   * y, with only z held at −49.40, all return true.
   *
   * So the two findings are NOT one finding. The 0.60 m aperture (arm 14) is about whether the
   * capsule FITS once inside; `inVent()` gates on an overlap sphere at the feet and engages
   * regardless. And `crawl` is reachable through play — it just needs the steering any player
   * watching the mouth would apply. This retires "reached by placement only". */
  const { engine, c, collision } = await realWorld();
  hardReset(engine, c, V(0, 0, 30));
  for (let i = 0; i < 4; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  const floorAt = (x, z) => {
    const g = collision.groundCheck(V(x, 5, z), TUNE.radius, 300);
    return g?.hit ? g.y : null;
  };
  const start = V(-19.3, (floorAt(-19.3, -49.4) ?? 0) + 0.05, -49.4);
  const TARGET = V(-21.0, 0, -49.6);

  function walk(correct) {
    hardReset(engine, c, start.clone(), -Math.PI / 2);
    let ventFrames = 0, crawlAt = -1, maxZ = -1e9;
    for (let i = 0; i < 300; i++) {
      engine.input.beginFrame(DT);
      if (correct) {
        const dx = TARGET.x - c.position.x, dz = TARGET.z - c.position.z, l = Math.hypot(dx, dz) || 1;
        engine.input.move.x = dx / l; engine.input.move.y = -dz / l;
      } else { engine.input.move.x = -1; engine.input.move.y = 0; }
      engine.time = i * DT; c.update(DT, i * DT);
      maxZ = Math.max(maxZ, c.position.z);
      if (c.inVent()) ventFrames++;
      if (crawlAt < 0 && c.stateName === 'crawl') crawlAt = i;
    }
    return { ventFrames, crawlAt, maxZ, end: c.position.clone() };
  }

  const naive = walk(false);
  const steered = walk(true);
  console.log(`\n[vent] pure -X stick:      inVent ${naive.ventFrames} frames, crawl@${naive.crawlAt}, drifted to z ${naive.maxZ.toFixed(2)}`);
  console.log(`[vent] steering at mouth:  inVent ${steered.ventFrames} frames, crawl@${steered.crawlAt}, held z ${steered.maxZ.toFixed(2)}`);

  /* The route exists, steered. */
  assert.ok(steered.crawlAt >= 0, 'crawl is no longer reachable by walking at the vent mouth');
  assert.ok(steered.ventFrames > 100, `only ${steered.ventFrames} frames inside the vent volume`);

  /* ── AND THE UNCORRECTED WALK NOW WORKS TOO, which is this arm's finding being fixed ────────
     This used to assert `naive.crawlAt === -1` — the pure −X stick MISSED the vent, drifting
     4.6 m in +z on the way. The cause was the ground-snap step-down in `_moveHorizontal`
     importing the collision resolve's downhill component (arm 18). With that removed the naive
     walk holds its line to within 0.10 m and reaches `crawl@11`.
     So the calibration inverts: a plain cardinal stick must now get in on its own, and the two
     approaches must agree rather than differ by metres. If this reddens with the naive walk
     failing again, the drift is back — check the snap before anything in this file. */
  assert.ok(naive.crawlAt >= 0,
    `the uncorrected cardinal walk misses the vent again (crawl@${naive.crawlAt}) — the ground-snap ` +
    'drift has returned; arm 18 measures it directly');
  assert.ok(Math.abs(naive.maxZ - steered.maxZ) < 0.5,
    `the two approaches now diverge by ${Math.abs(naive.maxZ - steered.maxZ).toFixed(2)} m in z — ` +
    'the uncorrected walk is drifting off line again');
  /* The lever: "both reach it" is also satisfied by a vent so generous that anything gets in.
     The walk must still be a walk — it has to travel the approach, not start on top of it. */
  assert.ok(naive.ventFrames > 20 && steered.ventFrames > 100,
    `inVent ${naive.ventFrames}/${steered.ventFrames} frames — one of these barely entered, so ` +
    '"both reach it" is not evidence about the approach');
});

/* ====================================================================== */
/* 18 — lateral drift on slopes: a movement fact, not a vent fact          */
/* ====================================================================== */

test('slopes: a pure cardinal stick holds its line — the ground snap no longer travels', async () => {
  /* DOMAIN (§418.3), recorded retrospectively while the knowledge was still fresh:
   *   passes on : the level's 3–15° walkable grades, post-fix   -> drift ratio 0.0121
   *   fails on  : the same grades, pre-34295c5                  -> 0.3180, mean lateral 0.8069 m
   * Both figures are measured on the SAME sampled faces, so the bar's domain is one input set
   * observed in two states of the code rather than two different populations. `sumRes > 1.0`
   * below is the second half: it fails on a Collision layer that stopped resolving lateral at
   * all, which is the "fix" that would make the drift bar pass for the wrong reason.
   *
   * Arm 17 found the vent walk-in failing because a pure −X stick slid Sly 4.6 m in +z. That is
   * not a vent fact. Three questions, all driven:
   *
   * **Flat ground: no drift.** Four cardinals on the spawn paving give |across| ≤ 0.005 m over
   * ~10 m travelled. So the effect needs a slope; the vent approach was not a red herring.
   *
   * **It scales with gradient, and its sign is the downhill direction.** Sampling sloped ground
   * across the level and walking a pure −X stick:
   *
   *     slope  3– 8°   n= 9   |across|/|along| = 0.108    sign follows downhill  9/9
   *     slope  8–15°   n=10   |across|/|along| = 0.443    sign follows downhill 10/10
   *     slope 15–60°   n=26   |across|/|along| = 0.710    sign follows downhill 14/26
   *
   * The sign test is `sign(aspect × intent).y`, which is algebraically the same as the sign of the
   * downhill direction projected onto the lateral axis — so the drift is downhill slide, perfectly
   * systematic at walkable gradients. The steep bucket's 14/26 is where the surface stops being
   * walkable and the character is failing to move at all rather than drifting.
   *
   * **It is the collision response, not the move vector.** With `capsuleSweep` wrapped to record
   * both: the requested lateral displacement is **0.0000 in every sample**, and the mean lateral
   * component of `velocity` is **0.0000**. The resolved lateral displacement equals the observed
   * drift exactly. So the intent is clean all the way to the sweep and the lateral motion is
   * introduced by resolving it — projecting a horizontal displacement onto a tilted plane keeps
   * the plane-tangent component, and for a horizontal input on a slope that component is partly
   * downhill.
   *
   * **What a player felt:** at 3–8°, the gentle grades this level uses for approaches, ~0.11 m
   * sideways per metre forward — hold one direction for 10 m and you were over a metre off line.
   * At 8–15° it was 0.44 m/m.
   *
   * ── FIXED, and the cause was not where this arm first said it was ───────────────────────────
   * The original diagnosis — "the collision response, not the move vector" — was right about the
   * layer and wrong about the site. It is not the horizontal slide's projection. Instrumenting
   * every `capsuleSweep` in one frame on a 12.3° grade:
   *
   *     115 sweeps: summed REQUESTED lateral 0.0140 m, summed RESOLVED lateral -1.0693 m
   *     the hits doing it:  ny 0.982  toi 0.215  reqLat 0.00000 -> gotLat -0.07488
   *                         ny 0.982  toi 0.231  reqLat 0.00000 -> gotLat -0.07337
   *
   * Those sweeps request **zero horizontal motion** and resolve 0.07 m downhill apiece. They are
   * the ground-snap step-down in `_moveHorizontal`: lift by `stepHeight`, slide horizontally,
   * then sweep straight down to re-seat. `Collision.capsuleSweep` clips leftover motion into the
   * contact plane — and downward motion clipped into a TILTED plane is downhill motion. The snap
   * was walking him down the gradient every frame, which is why he covered 0.53 m forward while
   * sliding 1.07 m sideways.
   *
   * The repair is that a snap answers "how far down is the floor", which has a distance and not a
   * direction, so it may only move him on y. Measured, level-wide:
   *
   *     drift ratio      0.3180 -> 0.0121        mean lateral  0.8069 m -> 0.0359 m
   *     shedding gate    27/40 at mean drop 0.4179 m -> 27/40 at mean drop 0.4179 m, unchanged
   *
   * ── The SECOND site, measured and deliberately not fixed here ────────────────────────────────
   * `_moveVertical` has the same shape — `position.copy(r.position)` on a purely vertical
   * request — and standing still on a 3–15° grade in the real level drifts a mean of 0.2816 m and
   * a maximum of 2.1644 m in 90 frames with no input at all. It is NOT folded in here because
   * that clip is also how a steep face sheds you: the discriminator would have to be walkability,
   * and gating on it makes every 15–50° grade in this level standable, which changes what the
   * level is climbable-by rather than fixing a defect. That is a design call and it is routed. */
  const { engine, c, collision } = await realWorld();
  hardReset(engine, c, V(0, 0, 30));
  for (let i = 0; i < 4; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  const realSweep = collision.capsuleSweep.bind(collision);
  let reqLat = 0, resLat = 0, recording = false, latAxis = new THREE.Vector3();
  collision.capsuleSweep = function (from, to, r, h, o) {
    const res = realSweep(from, to, r, h, o);
    if (recording) {
      reqLat += (to.x - from.x) * latAxis.x + (to.z - from.z) * latAxis.z;
      resLat += (res.position.x - from.x) * latAxis.x + (res.position.z - from.z) * latAxis.z;
    }
    return res;
  };
  const gnd = (x, z) => {
    const g = collision.groundCheck(V(x, 90, z), TUNE.radius, 300);
    if (!g?.hit) return null;
    const n = g.normal ? new THREE.Vector3(g.normal.x, g.normal.y, g.normal.z) : V(0, 1, 0);
    return { y: g.y, n };
  };
  function walk(x, z, mx, my, frames = 60) {
    const g = gnd(x, z);
    if (!g) return null;
    hardReset(engine, c, V(x, g.y + 0.05, z));
    for (let i = 0; i < 3; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    if (!c.grounded) return null;
    const intent = new THREE.Vector3(mx, 0, -my).normalize();
    latAxis = new THREE.Vector3(-intent.z, 0, intent.x);
    const p0 = c.position.clone();
    reqLat = 0; resLat = 0; recording = true;
    let velLat = 0, n = 0;
    for (let i = 0; i < frames; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = mx; engine.input.move.y = my;
      engine.time = i * DT; c.update(DT, i * DT);
      if (!c.grounded) break;
      const v = new THREE.Vector3(c.velocity.x, 0, c.velocity.z);
      if (v.length() > 0.5) { velLat += v.normalize().dot(latAxis); n++; }
    }
    recording = false;
    const d = c.position.clone().sub(p0); d.y = 0;
    const down = new THREE.Vector3(g.n.x, 0, g.n.z);
    const aspect = down.length() > 1e-4 ? down.normalize() : new THREE.Vector3();
    return {
      slope: Math.acos(Math.min(1, Math.max(-1, g.n.y))) * 180 / Math.PI,
      along: d.dot(intent), across: d.dot(latAxis),
      reqLat, resLat, velLat: n ? velLat / n : 0,
      downSign: Math.sign(aspect.clone().cross(intent).y),
    };
  }

  // Flat control.
  const flat = [[-1, 0], [1, 0], [0, 1], [0, -1]].map(([mx, my]) => walk(0, 30, mx, my)).filter(Boolean);
  const worstFlat = Math.max(...flat.map((r) => Math.abs(r.across)));
  console.log(`\n[slope] flat paving, 4 cardinals: worst |across| ${worstFlat.toFixed(4)} m over ~${flat[0].along.toFixed(1)} m`);
  assert.ok(worstFlat < 0.05, `flat ground drifts ${worstFlat.toFixed(3)} m — the cause is not slope`);

  // Slope sweep.
  const rows = [];
  for (let x = -26; x <= 26 && rows.length < 30; x += 4) {
    for (let z = -70; z <= 44 && rows.length < 30; z += 6) {
      const g = gnd(x, z);
      if (!g) continue;
      if (Math.acos(Math.min(1, Math.max(-1, g.n.y))) * 180 / Math.PI < 0.5) continue;
      const r = walk(x, z, -1, 0);
      if (r && Math.abs(r.along) > 0.5) rows.push(r);
    }
  }
  assert.ok(rows.length >= 8, `only ${rows.length} sloped samples moved — cannot characterise`);
  const walkable = rows.filter((r) => r.slope >= 3 && r.slope < 15);
  assert.ok(walkable.length >= 5, `only ${walkable.length} samples on walkable grades`);
  const ratio = walkable.reduce((a, r) => a + Math.abs(r.across) / Math.abs(r.along), 0) / walkable.length;
  const signOK = walkable.filter((r) => Math.sign(r.across) === r.downSign).length;
  console.log(`[slope] walkable 3–15°: n=${walkable.length}, mean |across|/|along| ${ratio.toFixed(3)}, ` +
              `sign follows downhill ${signOK}/${walkable.length}`);
  /* THE FIX, asserted: the drift is gone. Pre-fix this ratio was 0.3180 with 14/14 following the
     downhill aspect, and the mean lateral was 0.8069 m over a ~3 m walk. */
  assert.ok(ratio < 0.05,
    `drift ratio ${ratio.toFixed(4)} — a cardinal stick is bending downhill again (pre-fix 0.3180). ` +
    'The ground snap in Controller._moveHorizontal has gone back to copying the resolved position ' +
    'instead of taking `drop * dn.toi` on y alone.');

  /* THE LEVER, and it is the half that matters. "No drift" is satisfied perfectly by a character
     who never moves, and this file has shipped a tautology before. So the same samples must also
     show real forward travel, and the flat control above must still be a control. */
  const meanAlong = walkable.reduce((a, r) => a + Math.abs(r.along), 0) / walkable.length;
  assert.ok(meanAlong > 1.0,
    `the walkable samples advanced a mean of ${meanAlong.toFixed(3)} m — a frozen character also has ` +
    'zero drift, so this arm proves nothing unless he is actually walking');
  assert.ok(walkable.every((r) => Math.abs(r.along) > 0.5),
    'a sample barely moved; drift measured against near-zero travel is a ratio of noise');

  /* The split: intent clean, resolution dirty. This is the assertion that localises the cause. */
  /* Localising the cause, stated as the aggregate rather than a per-sample bound — because a
     per-sample bound is not true. Most walkable samples request zero lateral and drift anyway,
     but a minority DO pick up lateral in `velocity`: once the surface starts sliding the
     character, `accelerate` is re-aiming a velocity that already has a downhill component, so
     intent and response contaminate each other. I do not have a clean split for those, and I am
     not going to assert one I cannot support. What holds in aggregate is that the resolution
     introduces far more lateral than the request ever asks for. */
  const sumReq = walkable.reduce((a, r) => a + Math.abs(r.reqLat), 0);
  const sumRes = walkable.reduce((a, r) => a + Math.abs(r.resLat), 0);
  const zeroReq = walkable.filter((r) => Math.abs(r.reqLat) < 1e-6).length;
  console.log(`[slope] walkable band: ${zeroReq}/${walkable.length} samples request ZERO lateral; ` +
              `summed |requested| ${sumReq.toFixed(3)} m vs summed |resolved| ${sumRes.toFixed(3)} m`);
  /* The request was always clean and still is — that half of the original finding was right, and
     it is what said the cause had to be downstream of the move vector. */
  assert.ok(zeroReq >= Math.ceil(walkable.length / 2),
    `only ${zeroReq}/${walkable.length} samples request zero lateral — the intent has stopped being clean`);

  /* ── And this pair is what localises the fix to the CONTROLLER rather than to collision ─────
     The sweep still OFFERS a laterally-displaced resolved position — 35.8 m of it across these
     samples, because `Collision.capsuleSweep` still clips leftover motion into the contact plane
     exactly as it always did. What changed is that the ground snap no longer takes it. Asserting
     both halves matters: if someone "fixes" this by editing the collision layer instead, the
     drift would also go to zero, and this arm would tell them they changed a module that guards
     and the camera share rather than the one that had the defect.

     The pair is `sumRes` here and the `ratio` bar ABOVE — this section adds the sweep half only.
     It used to re-assert `ratio < 0.05` on this line as well, which was **found by
     `tools/armaudit.mjs` and is a zero-information assertion**: `ratio` is a `const` computed once
     and never recomputed, so a second identical bound on it 44 lines later cannot fail unless the
     first already did. Note that INVERSION scores that line as live — flipping it turns the arm
     red — so the audit's inversion sweep could not see it and the entailment pass could. That is
     §415's whole point, and it was demonstrated on my own arm. */
  assert.ok(sumRes > 1.0,
    `the sweep now reports only ${sumRes.toFixed(3)} m of resolved lateral. Collision has been ` +
    'changed, not the Controller — and Collision.capsuleSweep is shared with GUARDS and the ' +
    'camera boom, so that is a much wider blast radius than this defect needed.');
});

test('wallClimb: proximity alone does not snag a player who is not reaching for it', async () => {
  /* `wall_notch.gd` commits on `elif player.direction:` — a hold acts when it is being reached
     for. Fly past the face with no stick input and nothing may take control. */
  const { wall } = ladderWall({ rungs: 10 });
  const { engine, c } = await makeSim({ wall });
  c.position.set(0, 4.0, -9.5);
  c.velocity.set(6, 6, 0);
  c.grounded = false;
  c.sm.set('fall');
  const seen = new Set();
  run(engine, c, 120, () => {}, () => seen.add(c.stateName));
  assert.ok(!seen.has('wallClimb'), 'a rung grabbed a player who gave no input');
  console.log(`[wallClimb] no-input pass: states ${[...seen].join(', ')}`);
});

/* ====================================================================== */
/* 19 — the wall-run clip: the inside hand is the wall side                */
/* ====================================================================== */

test('wallRun: the clip plays for the side the wall is actually on — the inside hand meets stone', async () => {
  /* `Clips.js:1446` states what the clip depicts: *"Wall run, wall on his LEFT. Feet strike the
   * vertical surface, the body is banked hard into it, the inside (left) hand slaps along the
   * stone"*, mirrored into `wall_run_r` by `defMirror`. This arm asserts the engine agrees with
   * that sentence — that the side in the clip's NAME is the side the wall is really on.
   *
   *     Moveset.js:415   _d.set(-Math.cos(c.yaw), 0, Math.sin(c.yaw));      // his RIGHT
   *     Moveset.js:416   this._side = dot2(this._nx, this._nz, _d.x, _d.z) < 0 ? 'r' : 'l';
   *
   * `c.wall.n` points OUT of the face, from the wall toward Sly (`WallRun.update` re-probes along
   * `-n` to keep contact), so the wall lies along `-n` and is on his right exactly when
   * `n · right < 0`.
   *
   * ── Why this arm exists, in the numbers that made it necessary ──────────────────────────────
   * `_d` used to be `(cos yaw, 0, -sin yaw)`, which is his LEFT, so `n · left < 0` — meaning the
   * wall is on his left — returned `'r'`. Measured before the fix: **0 of 26 non-degenerate
   * approaches matched, and 26 of 26 mismatched**, plus two driven runs at 55° and 70° off the
   * face. Sly banked away from the wall he was running on and slapped empty air, in every wall
   * run in the game that had a side at all.
   *
   * The reason it survived: a head-on approach has `n · right` ≈ 0 and no side to be wrong about,
   * and the only driven wall run this project had ever staged (script F, arm 10) runs straight at
   * the face. **A bug that is invisible in the one approach anybody drives.**
   *
   * ── Why the sweep excludes head-on approaches ───────────────────────────────────────────────
   * When the wall is straight ahead or straight behind, `n · right` is ~0 and there is no side to
   * be right or wrong about; the line still picks one and it is a coin flip. Those samples are
   * excluded by `|n · right| >= 0.30` rather than counted as agreements, which is what an earlier
   * build of this sweep did: 3 of its 30 samples "agreed" and all three were head-on. A filter
   * that lets a coin flip count as a pass is how a uniform inversion reads as 90%. */
  const { engine, c, collision } = await realWorld();
  hardReset(engine, c, V(0, 0, 30));
  for (let i = 0; i < 4; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }

  /** Enter `wallRun` with a chosen facing and a chosen wall normal; return the clip it asked for. */
  function sideFor(yaw, nx, nz) {
    hardReset(engine, c, V(0, 12, 30), yaw);
    c.grounded = false;
    c.velocity.set(0, 0, 0);
    const n = V(nx, 0, nz).normalize();
    c.wall.nx = n.x; c.wall.nz = n.z; c.wall.rec = { id: 'probe-face' }; c.wall.ok = true;
    const clips = [];
    const realOneShot = c.oneShot.bind(c);
    c.oneShot = (name, ...a) => { clips.push(name); return realOneShot(name, ...a); };
    c.sm.set('wallRun');
    c.oneShot = realOneShot;
    const clip = clips.find((x) => String(x).startsWith('wall_run_'));
    if (!clip) return null;
    const right = stickRightFor(engine, c, faceOf(yaw));
    const lateral = n.dot(right);
    return { clip, lateral, side: lateral < 0 ? 'r' : 'l' };
  }

  let clean = 0, agree = 0, disagree = 0, degenerate = 0, sawL = 0, sawR = 0;
  for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, -2.2]) {
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7]]) {
      const r = sideFor(yaw, nx, nz);
      if (!r) continue;
      if (Math.abs(r.lateral) < 0.30) { degenerate++; continue; }
      clean++;
      if (r.clip.endsWith('l')) sawL++; else sawR++;
      if (r.clip.endsWith(r.side)) agree++; else disagree++;
    }
  }
  console.log(`\n[wallRun] ${clean} non-degenerate approaches (+${degenerate} head-on, excluded)`);
  console.log(`[wallRun]   clip matches the side the wall is really on: ${agree}   mismatched: ${disagree}`);

  /* The lever: the sweep must be capable of producing BOTH clips, or "always matched" is just
     "always the same clip" wearing a costume — and that is the exact shape of the pass this arm
     replaces, which reported 3/30 agreement on three coin flips. */
  assert.ok(clean >= 20, `only ${clean} non-degenerate approaches — the sweep is too thin to conclude`);
  assert.ok(sawL > 0 && sawR > 0, `the sweep only ever produced one clip (l ${sawL}, r ${sawR}) — no side is being chosen`);
  assert.equal(disagree, 0,
    `${disagree} of ${clean} wall runs play the clip for the WRONG side — the inside hand is ` +
    'slapping air. `_d` in WallRun.enter (Moveset.js:415) must be Sly\'s right, `(-cos yaw, 0, sin yaw)`.');
  assert.equal(agree, clean, `only ${agree} of ${clean} matched — the side is right but not uniformly`);

  /* And the same thing in a DRIVEN run, because a forced entry sets `c.wall` by hand and a
     reviewer is entitled to ask whether the real `probeWall` produces a different normal. The
     approach finder is script F's from the reachability arm: standable ground 3–7 m out from a
     wall rec, run-up within 0.25 m of level, run AND jump (wallRun is an air move). */
  const standAt = (x, z) => {
    const g = collision.groundCheck(V(x, 90, z), TUNE.radius, 300);
    if (!g?.hit) return null;
    hardReset(engine, c, V(x, g.y + 0.05, z));
    for (let i = 0; i < 8; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    return (c.grounded && Math.abs(c.position.y - g.y) < 1.5) ? { x, y: c.position.y, z } : null;
  };
  let approach = null;
  for (const w of collision.recs.filter((r) => r.tag === 'wall')) {
    const p = w.mesh.position;
    for (let dx = -9; dx <= 9 && !approach; dx += 1.5) for (let dz = -9; dz <= 9 && !approach; dz += 1.5) {
      const s = standAt(p.x + dx, p.z + dz);
      if (!s) continue;
      for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]]) {
        const o = V(s.x, s.y + TUNE.height * 0.55, s.z);
        const hit = collision.raycast(o, V(ux, 0, uz), 7.5);
        if (!hit?.hit || hit.tag !== 'wall' || Math.abs(hit.normal.y) > TUNE.wallNormalMax) continue;
        if (hit.distance < 3.0) continue;
        let flat = true;
        for (let t = 0.5; t < hit.distance - 0.5; t += 0.5) {
          const q = standAt(s.x + ux * t, s.z + uz * t);
          if (!q || Math.abs(q.y - s.y) > 0.25) { flat = false; break; }
        }
        if (flat) { approach = { s, ux, uz, d: hit.distance }; break; }
      }
    }
    if (approach) break;
  }
  assert.ok(approach, 'no flat run-up to a wall in the level — the driven half cannot run');
  const { s } = approach;
  /* The run-up is swept through a fan of headings, because a HEAD-ON approach cannot decide this
     and script F's is head-on. Sly turns to face his travel, so arriving perpendicular puts the
     wall dead ahead and `n · right` comes out 0.000 — measured, not assumed: the 0° run below
     reaches `wallRun` and reports exactly that. A wall run at a real angle to the face is the
     only one with a side, and the level's own approach has one at 55°. */
  const fan = [55, -55, 35, -35, 70, -70, 25, -25, 0];
  const driven = [];
  for (const deg of fan) {
    const th = deg * Math.PI / 180;
    const ux = approach.ux * Math.cos(th) - approach.uz * Math.sin(th);
    const uz = approach.ux * Math.sin(th) + approach.uz * Math.cos(th);
    let hit = null;
    for (const jf of [10, 14, 18, 22, 26, 30]) {
      aimCamera(engine, V(ux, 0, uz));                       // camera behind him, along the run-up
      hardReset(engine, c, V(s.x, s.y + 0.05, s.z), Math.atan2(ux, uz));
      const clips = [];
      const realOneShot = c.oneShot.bind(c);
      c.oneShot = (name, ...a) => { clips.push({ name, yaw: c.yaw, nx: c.wall.nx, nz: c.wall.nz }); return realOneShot(name, ...a); };
      for (let i = 0; i < 160; i++) {
        engine.input.beginFrame(DT);
        engine.input.move.x = 0; engine.input.move.y = 1;    // straight ahead, camera-relative
        if (i >= jf && i < jf + 5) engine.input.hold('jump'); else engine.input.let_go('jump');
        engine.time = i * DT; c.update(DT, i * DT);
        if (c.stateName === 'wallRun') break;
      }
      c.oneShot = realOneShot;
      hit = clips.find((x) => String(x.name).startsWith('wall_run_'));
      if (hit) break;
    }
    if (!hit) continue;
    const n = V(hit.nx, 0, hit.nz).normalize();
    const lateral = n.dot(stickRightFor(engine, c, faceOf(hit.yaw)));
    driven.push({ deg, clip: hit.name, lateral, side: lateral < 0 ? 'r' : 'l' });
  }
  for (const d of driven) {
    console.log(`[wallRun] driven at ${String(d.deg).padStart(4)}° from (${s.x.toFixed(1)}, ${s.z.toFixed(1)}): ` +
                `n·right ${d.lateral.toFixed(3)} -> wall on his ${d.side.toUpperCase()}, clip ${d.clip}` +
                `${Math.abs(d.lateral) < 0.30 ? '   (head-on: no side to be wrong about)' : ''}`);
  }
  const decisive = driven.filter((d) => Math.abs(d.lateral) >= 0.30);
  assert.ok(driven.length > 0, 'no heading in the fan reached wallRun — the driven half found nothing');
  assert.ok(decisive.length > 0,
    'every driven wall run arrived head-on, so none of them has a side — the driven half cannot decide this');
  for (const d of decisive) {
    assert.ok(d.clip.endsWith(d.side),
      `the driven wall run at ${d.deg}° plays ${d.clip} for a wall on his ${d.side.toUpperCase()} — ` +
      'the forced sweep and the real approach disagree, so one of them is not measuring the game');
  }
});

/* ====================================================================== */
/* 20 — the coverage census: what has anything in tests/ ever ENTERED?     */
/* ====================================================================== */

test('census: which of the 32 states any test in this project has ever entered', async () => {
  /* Arm 8 asks whether a state can be LEFT. Arm 11 asks whether its `canEnter` is satisfiable.
   * Arm 13 asks what it READS. None of them answers the question a coverage owner would ask
   * first: **has anything in `tests/` ever put Sly in this state at all, and did the machine
   * choose it or did a test reach in and set it?**
   *
   * ── Method ──────────────────────────────────────────────────────────────────────────────────
   * `tests/_smtrace.mjs` wraps `StateMachine.prototype.set` — the single funnel every entry goes
   * through, on both branches of `update()` and for every external caller — and buckets each
   * entry by whether the machine was mid-resolution:
   *
   *     driven  the machine's own poll, or a state's returned transition, chose it
   *     forced  something outside called `set`: a test's `sm.set`, or `Controller.teleport`
   *
   * The distinction is the whole census. Arm 8 deliberately FORCES all 32 states, so a flat "was
   * it ever entered" answers "yes, 32 of 32" and measures nothing.
   *
   * This file traces itself in-process (the import at the top of this file installs the wrapper
   * before any Controller exists), and spawns one child `node --test` under the same module as a
   * preload for every OTHER test file that could possibly hold a state machine.
   *
   * ── Why the file list is sound, and how it stays sound ──────────────────────────────────────
   * A test file that never loads `src/player/States.js` cannot construct a `StateMachine`, so it
   * cannot enter a state. The candidate list is therefore the transitive-import closure of each
   * `tests/*.test.mjs`, computed here at run time — **not written down** — so a file another lane
   * adds tomorrow is covered the day it lands. Today that is 5 of 64 files.
   *
   * ── What this CANNOT see, stated the way arm 13's lower bound is ────────────────────────────
   * · "driven" means the machine chose the transition. It does NOT mean the run reached that
   *   state from spawn under plain input — many driven entries here follow a forced `sm.set` two
   *   frames earlier. Arm 12 is the arm that answers the from-spawn question, and for a shorter
   *   list of states.
   * · Attribution is per FILE, not per arm. "Only traversal drives it" does not distinguish one
   *   arm from twenty.
   * · If another lane's test file is red and dies early, its trace is short and this census
   *   over-reports. The child's own pass/fail is printed for exactly that reason. */
  const here = path.dirname(fileURLToPath(import.meta.url));
  const MINE = 'traversal.test.mjs';

  /* ---- 1. the candidate set, from the import graph ---- */
  const closure = (file, seen = new Set()) => {
    if (seen.has(file)) return seen;
    seen.add(file);
    let text = '';
    try { text = readFileSync(file, 'utf8'); } catch { return seen; }
    const re = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(text))) {
      const p = path.resolve(path.dirname(file), m[1]);
      if (existsSync(p)) closure(p, seen);
    }
    return seen;
  };
  const allTests = readdirSync(here).filter((f) => f.endsWith('.test.mjs')).sort();
  const candidates = allTests.filter((f) =>
    [...closure(path.join(here, f))].some((p) => p.endsWith(`${path.sep}player${path.sep}States.js`)));
  console.log(`\n[entered] ${candidates.length} of ${allTests.length} test files can hold a state machine: ${candidates.join(', ')}`);
  assert.ok(candidates.includes(MINE), 'the import scanner cannot even see this file — it is not sound');

  /* ---- 2. the child run, plus the canary that proves the channel works ---- */
  const dir = mkdtempSync(path.join(tmpdir(), 'smtrace-'));
  const others = candidates.filter((f) => f !== MINE).map((f) => path.join(here, f));
  /* `NODE_TEST_CONTEXT` must be stripped. This arm already runs inside a `node --test` child, so
     it is set, and a grandchild that inherits it switches its reporter to the v8-serialised
     stream a parent runner expects — the run still happens, but `# pass N` never appears and the
     tally silently reads −1. Cost half an hour; it is the same shape as everything else in this
     file's header — a correct call against a world that was not the one intended. */
  const env = { ...process.env, SM_TRACE_DIR: dir };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath,
    ['--test', '--import', pathToFileURL(path.join(here, '_smtrace.mjs')).href,
      path.join(here, '_smcanary.mjs'), ...others],
    { cwd: path.dirname(here), env, encoding: 'utf8', timeout: 600000 });
  const tally = (s) => Number((child.stdout || '').match(new RegExp(`^# ${s} (\\d+)$`, 'm'))?.[1] ?? -1);
  console.log(`[entered] child run: ${tally('pass')} pass, ${tally('fail')} fail over ${others.length + 1} files`);

  const perFile = new Map();
  for (const f of readdirSync(dir)) {
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    perFile.set(j.file, j.states);
  }
  rmSync(dir, { recursive: true, force: true });

  /* CALIBRATION, and it must fire. If the preload did not attach, or the trace files were not
     written, or they were written and not parsed, every state reads "never entered" and this arm
     reports a spectacular finding that is entirely an instrument failure. The canary drives a
     private machine into one state by `set` and another by `update`, and never touches a third. */
  const can = perFile.get('_smcanary.mjs');
  assert.ok(can, 'the canary produced no trace at all — the census channel is broken, not the coverage');
  assert.ok(can.canary_forced?.forced === 1 && !can.canary_forced?.driven,
    `canary_forced came back as ${JSON.stringify(can.canary_forced)} — the forced bucket is wrong`);
  assert.ok(can.canary_driven?.driven === 1 && !can.canary_driven?.forced,
    `canary_driven came back as ${JSON.stringify(can.canary_driven)} — the driven bucket is wrong`);
  assert.ok(!can.canary_absent, 'the recorder invented an entry for a state the canary never entered');
  for (const f of others) {
    assert.ok(perFile.has(path.basename(f)), `${path.basename(f)} produced no trace — it did not run`);
  }

  /* The placement flag, calibrated on the canary rather than asserted. The canary forces
     `canary_forced` — not a reset state — and then lets the machine choose `canary_driven`. So
     the driven entry MUST come back with an empty `clean` set: it is downstream of a placement.
     If this ever reads non-empty, `__placed` is not tracking and the "player could get here"
     column below is worthless in the direction that matters — it would over-report coverage. */
  assert.deepEqual(can.canary_driven?.clean, [],
    'the canary drove a state after PLACING Sly and the recorder still called it clean — the ' +
    'placement flag is not tracking, so every "reached without placement" claim below is unsound');
  assert.ok((can.canary_driven?.arms || []).some((a) => a.includes('smcanary')),
    `the canary's arm name never reached the trace (${JSON.stringify(can.canary_driven?.arms)}) — ` +
    'per-arm attribution is not working and the thinness counts below are meaningless');

  /* ---- 3. merge, including this file's own in-process record ---- */
  perFile.set(MINE, Object.fromEntries([...SM_RECORD].map(([k, v]) =>
    [k, { driven: v.driven, forced: v.forced, dfrom: [...v.dfrom], arms: [...v.arms], clean: [...v.clean] }])));
  perFile.delete('_smcanary.mjs');

  const agg = new Map();
  for (const [file, states] of perFile) {
    for (const [name, v] of Object.entries(states)) {
      let r = agg.get(name);
      if (!r) { r = { driven: 0, forced: 0, files: new Set(), arms: new Set(), clean: new Set() }; agg.set(name, r); }
      r.driven += v.driven; r.forced += v.forced;
      if (v.driven > 0) r.files.add(file.replace('.test.mjs', ''));
      for (const a of v.arms || []) r.arms.add(`${file}::${a}`);
      for (const a of v.clean || []) r.clean.add(`${file}::${a}`);
    }
  }
  /* The state list is read off a real machine, not written down, so a state a future lane adds
     is censused the day it lands. Built last so its own `set('idle')` cannot skew the tally it
     is about to print — it is one forced entry of `idle`, which is already in the thousands. */
  const { c: c0 } = await makeSim();
  const ordered = c0.sm.ordered.map((s) => s.name);
  const blank = { driven: 0, forced: 0, files: new Set(), arms: new Set(), clean: new Set() };
  console.log('\n[entered] state          driven   forced  arms  unplaced   driven by');
  for (const n of ordered) {
    const r = agg.get(n) || blank;
    console.log(`  ${n.padEnd(14)} ${String(r.driven).padStart(7)} ${String(r.forced).padStart(8)}` +
                `${String(r.arms.size).padStart(6)}${String(r.clean.size).padStart(10)}   ${[...r.files].join(', ') || '— NOTHING'}`);
  }
  const never = ordered.filter((n) => !(agg.get(n)?.driven > 0));
  const onlyMine = ordered.filter((n) => { const f = agg.get(n)?.files; return f && f.size === 1 && f.has('traversal'); });
  const elsewhere = ordered.filter((n) => { const f = agg.get(n)?.files; return f && [...f].some((x) => x !== 'traversal'); });
  /* The two columns the file-level census could not produce, and they are the ones that say how
     exposed this is. `arms` is how many test arms anywhere drive the state — one is a single
     point of failure regardless of how many times that arm drives it. `unplaced` is how many of
     those did it in a run where **nobody had called `sm.set`**: the machine chose the state on
     its own, from a teleport and input alone, which is the closest thing here to a player. */
  const oneArm = ordered.filter((n) => (agg.get(n)?.arms.size || 0) === 1);
  const placedOnly = ordered.filter((n) => (agg.get(n)?.driven > 0) && (agg.get(n)?.clean.size || 0) === 0);
  console.log(`\n[entered] never driven by anything:  ${never.join(', ') || '(none — all 32 are driven somewhere)'}`);
  console.log(`[entered] driven by any other file:  ${elsewhere.join(', ') || '(none)'}`);
  console.log(`[entered] delete this ONE file and ${onlyMine.length}/${ordered.length} states go dark:`);
  console.log(`            ${onlyMine.join(', ')}`);
  console.log(`\n[entered] driven by exactly ONE arm in the whole project (${oneArm.length}):`);
  for (const n of oneArm) console.log(`            ${n.padEnd(13)} <- ${[...(agg.get(n)?.arms || [])][0]}`);
  console.log(`\n[entered] NEVER reached without a test placing Sly first (${placedOnly.length}/${ordered.length}):`);
  console.log(`            ${placedOnly.join(', ') || '(none)'}`);

  /* THE FINDING, and it is not the one expected. Every state is driven somewhere — but delete
     this one file and the project's 63 other test files drive 6 of 32 between them, including
     none of the attach states, none of the wall tech and neither crouch state. The moves a
     player uses most are covered by exactly one file, and it is an instrument file. */
  assert.ok(ordered.length >= 32, `only ${ordered.length} states in the machine — the census lost some`);
  assert.deepEqual(never, [],
    `${never.length} states are entered by nothing in tests/: ${never.join(', ')}. That is a real ` +
    'coverage hole; add a driven route or record why there cannot be one.');
  /* Was 6, then 11, now 15. The first five arrived from `camdrive.test.mjs` — the camera lane
     pricing the lead question needed REAL trajectories rather than a stub player, so it drives
     `realWorld()` and picks them up incidentally.

     The next four — `ledgeClimb`, `ledgeHang`, `hookSwing`, `wallJump` — arrived from
     `collectroute.test.mjs`, which walks the twelve-bottle route through the shipped level to
     establish that the collect loop is completable at all. Measured rather than inferred: that
     file alone enters 14 of the 32, and all four of the new names are in its set.

     Re-based by the lane that moved it. The distinction being kept: the previous break was
     caused by a file that was still UNCOMMITTED and belonged to another lane, so re-basing then
     would have encoded someone's in-flight state — it was left, and it resolved itself when
     `camdrive` landed. This one is caused by a committed file of the mover's own, which is the
     case where leaving the tree red is not a courtesy to anyone.

     Both numbers are set to what was measured, not to slack. This is not §141.1: these are
     descriptive ratchets whose own messages ask to be re-based when coverage spreads, not gates
     deciding whether a result is good — and the direction of travel is the one the arm's finding
     measurement and adds no name beyond this set. */
  /* And 15 -> 17, re-based by the mover again and for the same committed-file reason. The two
     that arrived are `dive` and `idle`, from `camdrive.test.mjs` D4: pricing the Cane Slam's
     framing needs the slam driven from five different drop heights, which enters `dive` for the
     first time outside this file. `idle` came with it — the route starts standing.

     Worth saying plainly because the number is now more than half of 32: **the concentration this
     arm was written to report is genuinely dissolving.** It found "delete this one file and 6 of
     32 go dark"; it is now 15 of 32, and every step has been another lane needing REAL
     trajectories rather than a stub. That is the finding aging out, which is the outcome its own
     message asks for, not the arm losing its grip. */
  /* 17 -> 22, and at this point the arm's founding finding has fully inverted. It was written to
     report "delete this one file and 6 of 32 states go dark". It is now 22 of 32 driven
     elsewhere, and the step that took it there was `camdrive.test.mjs` D6 measuring end-to-end
     framing delivery, which needs `roll`, `combo`, `sneak`, `poleClimb` and `wallRun` driven on
     real geometry to have anything to measure.

     **These two ratchets are no longer concentration detectors.** They cannot be — a claim about
     concentration is not falsifiable once two thirds of the states are covered elsewhere. They
     are kept as COVERAGE-LOSS detectors, which is the direction that still matters, and the
     `never` set above is the assertion doing the real work now. Re-based by the mover, same
     committed-file rule as the previous two times. */
  /* 24 -> 25 and 8 -> 7, one state moving between the two sets, re-based by the mover (world
     lane, §495/§496): `thiefspots.test.mjs` drives the colossi tightrope knee to knee, and the
     crossing is the first thing outside this file to enter a rail state — `railSlide`, 451
     driven entries over the sagging span (the crossing rides the down-slopes as a slide;
     `railWalk` stays traversal-only alongside poleSwing, bounce, crawl, pickpocket,
     combatStrafe and crouch). Same committed-file case as every re-base above; measured off the
     census's own table, not inferred from the test's intent. */
  /* 25 -> 26 and 7 -> 6: `railWalk` follows its sibling out (world lane, §497). The tightrope's
     re-hang gave it `mountSpeed: 0`, the crossing now settles into the balance state, and
     `thiefspots` asserts `railWalk` on the westbound walk-on — so the state the §495 rope made
     STRUCTURALLY unreachable is now driven outside this file, which is the fix being visible
     from here. Same mover, same committed-file rule. */
  /* 26 -> 29 and 6 -> 3, three states moving together, re-based by the mover (input lane, §540):
     `padparity.test.mjs` drives every verb the moveset consults on BOTH devices, and the three
     that were still traversal-only — `pickpocket`, `combatStrafe`, `crouch` — are exactly the
     ones whose only route is a held or pressed input, which is the thing a parity arm has to
     drive by construction. Nothing else here moved: `poleSwing`, `bounce` and `crawl` remain
     traversal-only, and they are the three the bound below is now protecting. Measured off the
     census's own table in a clean worktree at the committed sha, not inferred from intent; same
     committed-file rule as the four re-bases above. */
  /* 29 -> 32 and 3 -> 0, and this is the end of the ratchet rather than another notch on it.
     Re-based by the mover (camera lane, §580): `camstate.test.mjs` drives the containment ruling
     across the WHOLE state space instead of the seven states the shipped clamp routes happened
     to visit, so it enters all 32 — `poleSwing`, `bounce` and `crawl`, the three this bound was
     protecting, included. Committed file of the mover's own, same rule as the five re-bases
     above, measured off this census's own table.

     **`onlyMine` is now empty, so the pair collapses to one line and the line changes direction.**
     `elsewhere.length <= N` reddened on coverage GAIN, which is the opposite of what the note
     above says these are kept for ("COVERAGE-LOSS detectors, which is the direction that still
     matters"); at 32 of 32 a `<=` bound cannot discriminate at all, because 32 is every state
     there is. Stated as a floor it detects exactly the regression worth detecting: a state that
     stops being driven outside this file. And `onlyMine.length === 0` is strictly ENTAILED by it
     — `never` is empty (asserted above), so every state has a non-traversal file, so no state
     has `files === {traversal}` — which is the §418/armaudit disposal this arm has already
     performed once, on the line above it. The founding finding ("delete this one file and 6 of
     32 states go dark") has now fully aged out, which is the outcome its own message asked for. */
  assert.ok(elsewhere.length >= 32,
    `only ${elsewhere.length} of ${ordered.length} states are driven outside traversal.test.mjs ` +
    `(was 6, 11, 15, 17, 22, 23, 24, 25, 26, 29, 32) — coverage was LOST somewhere else in the ` +
    `project, which is the direction this ratchet is kept for. Missing: ` +
    `${ordered.filter((n) => !elsewhere.includes(n)).join(', ')}`);
  /* The thinness pins. Both are stated as "no worse than", so widening coverage never reddens
     them — only losing coverage does, which is the direction that matters for a regression.
     Measured: exactly ONE state (`bounce`) hangs on a single arm, and ZERO are placement-only. */
  assert.ok(oneArm.length <= 12,
    `${oneArm.length} states now hang on a single arm (${oneArm.join(', ')}) — that is worse than the ` +
    'measured baseline; a state whose only exercise is one arm dies with that arm');
  assert.ok(placedOnly.length <= 14,
    `${placedOnly.length} states are only ever reached by a test PLACING Sly there ` +
    `(${placedOnly.join(', ')}). Nothing in tests/ shows a player can get to them.`);
});

/* ====================================================================== */
/* 21 — who else writes the lateral basis by hand                          */
/* ====================================================================== */

test('basis: narrowGround is genuinely side-blind, so its backwards axis cannot reach an answer', async () => {
  /* `Controller.js:1182` writes `_rgt.set(Math.cos(yaw), 0, -Math.sin(yaw))` — the left vector,
   * under a name that says right. I assessed it harmless last round *by inspection*, on the
   * grounds that the loop probes `s = -1` and `s = +1` at equal offsets so the pair `{p + r·u,
   * p − r·u}` is identical under `u → −u`. Re-assessed now that the sign is fixed everywhere
   * else, because the question is not whether the probe is symmetric — it is whether **anything
   * downstream reads which of the two matched.**
   *
   *   · the return is a bare boolean, and the loop `return true`s on the first side that fails;
   *   · both callers are `Tiptoe` (`Moveset.js:200`, `:204`) and both use only that boolean;
   *   · `_rgt` is a module scratch shared with `_readInput`, but both sites write it immediately
   *     before reading it (`Controller.js:721`, `:1182`), so nothing leaks between them.
   *
   * Inspection again — so this arm makes it a measurement instead. Negating the axis is exactly
   * a yaw of +π, and nothing else in `narrowGround` reads yaw, so the answer must be identical at
   * `yaw` and `yaw + π` for every pose. If someone later gives the two sides different offsets,
   * or returns which one matched, this reddens and the "harmless" ruling has to be re-made.
   *
   * **It is not a claim that the axis is correctly named.** It is a claim that this consumer
   * cannot tell, which is a different and much weaker thing. */
  const { engine, c } = await makeSim({ narrow: 0.5 });   // a beam along z: narrow in x, wide in z
  const probe = (x, z, yaw) => {
    hardReset(engine, c, V(x, 0, z), yaw);
    /* Frames first, because `narrowGround` compares against `groundY`, which only exists after
       one update — then RE-PIN both position and yaw before asking. The header's first defence:
       a probe whose origin drifts between the two halves of a comparison is not a comparison. */
    for (let i = 0; i < 3; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    c.position.x = x; c.position.z = z; c.yaw = yaw;
    return c.narrowGround();
  };
  let pairs = 0, same = 0, sawTrue = 0, sawFalse = 0;
  for (const yaw of [0, 0.4, Math.PI / 2, 1.9, Math.PI, -0.8, -Math.PI / 2, 2.6]) {
    for (const [x, z] of [[0, 0], [0.3, 4], [-0.3, -4], [0, 12]]) {
      const a = probe(x, z, yaw), b = probe(x, z, yaw + Math.PI);
      pairs++;
      if (a === b) same++;
      if (a) sawTrue++; else sawFalse++;
    }
  }
  console.log(`\n[narrow] ${pairs} pose pairs at yaw and yaw+π: identical ${same}, differing ${pairs - same}`);
  console.log(`[narrow]   answers seen: true ${sawTrue}, false ${sawFalse}`);
  /* The lever: a probe that always says the same thing is trivially symmetric and proves nothing.
     Both answers must appear, or this arm is a tautology of the kind this file has shipped once. */
  assert.ok(sawTrue > 0 && sawFalse > 0,
    `narrowGround answered ${sawTrue ? 'true' : 'false'} for all ${pairs * 2} probes — it is not ` +
    'discriminating, so the symmetry it exhibits is worthless as evidence');
  assert.equal(same, pairs,
    `${pairs - same} pose pairs answered differently at yaw and yaw+π — narrowGround now depends on ` +
    'WHICH side matched, so the backwards axis at Controller.js:1182 is no longer harmless');
});

test('basis: every hand-written lateral basis in src, and what each one is for', async () => {
  /* The guard against the next instance, and it found one on its first run — the third and last
   * site of the inversion, now fixed.
   *
   * ── Why a census of SITES and not a shared `RIGHT_OF(yaw)` helper ───────────────────────────
   * The obvious response to "this expression was written by hand in three files" is to export it
   * once. I do not think that is the fix, and I am not building it:
   *
   *   · there are now exactly TWO sites that want a right vector (`Moveset.js:415`,
   *     `CameraRig._buildBasis`) and one that wants a side-blind lateral axis. A named export
   *     with two consumers, one of which stores it on a field, is ceremony;
   *   · the failure was never that a helper was wrong. It was that a hand-written vector **agrees
   *     with itself** everywhere it is used, so a self-consistent wrong answer survives review.
   *     A helper does not stop the next person writing the vector out by hand — only something
   *     that LOOKS is going to catch that, and a helper does not look;
   *   · §388's rule applies: a table of what the code should say is a second copy that drifts.
   *     This stores no value. It stores nothing but a list of places, with a reason each.
   *
   * ── What it found, and the first pass had missed it because the line contains no `Math.` ────
   *
   *     CameraRig.js:1127   const sy = Math.sin(yaw), cy = Math.cos(yaw);
   *     CameraRig.js:1128   this.forward.set(sy, 0, cy);
   *     CameraRig.js:1129   this.right.set(cy, 0, -sy);      // ← this was LEFT
   *
   * A field named `right` holding the left vector, measured at `-1.000` for every yaw. **Now
   * fixed**, and the reason it needed a whole round rather than a sign flip is that its five
   * consumers do not move together: two use `right` twice — once to derive a sign, once to apply
   * it — so the error cancelled and the shipped framing was always correct, while three use it
   * once and were wrong. Arm 23 holds all five as numbers, before and after.
   *
   * The site list below survives the fix because it is a list of PLACES, not of values: all three
   * sites still write a lateral basis by hand, and being listed has never meant "wrong". It means
   * somebody wrote the expression that faked two findings, and said which one they meant. */
  const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
  };
  /* Any `.set(a, 0, b)` whose x slot is a cosine of a FACING and whose z slot is its sine — in
     either sign, and through a local alias like `cy`/`sy`, which is how the third site hid. The
     alias half is resolved by looking for the alias's own definition in the same file.

     **`yaw` is required, and that is a real narrowing, not tidiness.** The first build matched on
     shape alone and pulled in `Moveset.js:1318`, `_a.set(Math.cos(p.angle), 0, -Math.sin(p.angle))`
     — the tangent of the pole orbit. Same three characters, different object: `p.angle` is a
     position along a circle, not a heading, and there is no left or right to get wrong about it.
     Allow-listing it would have taught the next reader that this census is about a spelling.
     The cost is stated: a lateral basis built from a facing that is not called `yaw` is invisible
     here, and so is one assembled across two lines without `.set`. */
  const TRIG = /\.set\(\s*(-?)\s*(Math\.cos\([^)]*yaw[^)]*\)|c[a-z]?)\s*,\s*0\s*,\s*(-?)\s*(Math\.sin\([^)]*yaw[^)]*\)|s[a-z]?)\s*\)/;
  const found = [];
  for (const file of walk(srcDir)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const aliased = /const\s+(s[a-z]?)\s*=\s*Math\.sin\(\s*yaw|const\s+(c[a-z]?)\s*=\s*Math\.cos\(\s*yaw/.test(lines.join('\n'));
    lines.forEach((ln, i) => {
      const m = TRIG.exec(ln);
      if (!m) return;
      const literal = m[2].startsWith('Math.') && m[4].startsWith('Math.');
      if (!literal && !aliased) return;          // `c`/`s` that are not this file's yaw aliases
      found.push({ rel: path.relative(srcDir, file), line: i + 1, text: ln.trim(), sign: m[1] ? '-cos' : '+cos' });
    });
  }
  console.log('\n[sites] hand-written lateral bases in src/:');
  for (const f of found) console.log(`  ${f.rel}:${f.line}  ${f.sign}  ${f.text.slice(0, 62)}`);

  /* The allow-list. A site here is a place someone wrote the lateral axis out by hand; being
     listed is not approval, it is an acknowledgement with a reason and an owner. A NEW one fails
     this arm, and the message says what to do about it. */
  const KNOWN = {
    'player/Controller.js': 'narrowGround — still backwards, but side-blind: proved by the arm above',
    'player/Moveset.js':    'WallRun._side — his RIGHT, corrected, pinned by arm 19',
    'player/CameraRig.js':  'rig.right — his RIGHT, corrected, all five consumers pinned by arm 23',
  };
  const unknown = found.filter((f) => !KNOWN[f.rel]);
  assert.deepEqual(unknown.map((f) => `${f.rel}:${f.line}`), [],
    'a new hand-written lateral basis appeared in src/. It is the expression that faked two ' +
    'findings across two rounds, so it does not get in silently: add it to KNOWN with a reason, ' +
    'and drive its direction the way arm 15 does rather than reasoning about the sign.');
  /* The lever, which matters more than the list: the scanner must actually be able to SEE the
     alias form, because that is the one that hid the CameraRig site from the first pass. */
  assert.ok(found.some((f) => f.rel === 'player/CameraRig.js'),
    'the scanner no longer sees the aliased `set(cy, 0, -sy)` form — it is back to missing the ' +
    'exact site it was written to catch');
  assert.ok(found.length >= 3, `only ${found.length} sites found — the scanner has stopped matching`);

  /* And the CameraRig field itself, driven rather than read off the source. It is the only one of
     the three sites that carries the word `right` on a stored field rather than in a local, so it
     is the one a reader is most entitled to trust — which is exactly why it was the most wrong. */
  const { CameraRig } = await import('../src/player/CameraRig.js');
  const rig = new CameraRig(stubEngine());
  const UP = V(0, 1, 0);
  let pos = 0, n = 0;
  for (const yaw of [0, 0.7, Math.PI / 2, -1.2, Math.PI]) {
    rig._buildBasis(yaw);
    const dot = rig.right.dot(new THREE.Vector3().crossVectors(rig.forward, UP));
    n++;
    if (dot > 0.999) pos++;
    console.log(`[sites] CameraRig yaw ${yaw.toFixed(2)}: right · (forward × up) = ${dot.toFixed(3)}`);
  }
  assert.equal(pos, n,
    `CameraRig.right is not forward × up (${pos}/${n} yaws agree). It held the exact negation for ` +
    'most of this project\'s life; if it has gone back, re-check the three consumers that do not ' +
    'cancel — the bank, the aim shoulder and the free-fly strafe. Arm 23 measures all five.');
});

/* ====================================================================== */
/* 22 — operation, not entry: the states nothing else drives               */
/* ====================================================================== */

test('combatStrafe: the fourth raw-stick reader, and it orbits and closes the way it says', async () => {
  /* The census (arm 20) says `combatStrafe` has **2 driven entries in the whole project**, both
   * in this file, and arm 13 says it is one of four states that read the raw stick. The other
   * three are now all measured: `ledgeHang` correct, `poleClimb` correct, `poleSwing` was
   * inverted. This is the last one, and nothing has ever driven its direction.
   *
   * Both axes, against what the same stick does through the walk pipeline:
   *   · TANGENT (`wishRaw.x`) — `_b = (-a_z, 0, a_x)` where `_a` points at the mark. Sly is turned
   *     to face the mark, so `_b` is his right; stick-right must orbit right.
   *   · RADIAL (`wishRaw.z`) — the comment at `Moveset.js:1615` claims *"+z on the stick is
   *     'forward' = close in"*. That is a sentence about behaviour, so it is checkable: stick
   *     forward must reduce the distance to the mark and stick back must raise it.
   *
   * The mark is a real stub guard at a known spot, and the orbit radius is read from the mark
   * rather than from Sly, so "closer" is measured against the thing he is circling. */
  const guard = stubGuards(V(0, 0, -3.0));
  const { engine, c } = await makeSim({ guards: guard });
  const markAt = V(0, 0, -3.0);
  const run = (mx, my, frames = 30) => {
    hardReset(engine, c, V(0, 0, 0), Math.PI);
    for (let i = 0; i < 3; i++) {
      engine.input.beginFrame(DT); engine.input.hold('focus');
      engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    c.sm.set('combatStrafe');
    if (c.stateName !== 'combatStrafe') return null;
    const p0 = c.position.clone(), r0 = p0.distanceTo(markAt);
    const face0 = V(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    for (let i = 0; i < frames; i++) {
      engine.input.beginFrame(DT); engine.input.hold('focus');
      engine.input.move.x = mx; engine.input.move.y = my;
      engine.time = i * DT; c.update(DT, i * DT);
      if (c.stateName !== 'combatStrafe') break;
    }
    const d = c.position.clone().sub(p0); d.y = 0;
    return { d, face0, r0, r1: c.position.distanceTo(markAt), state: c.stateName, moved: d.length() };
  };

  const right = run(1, 0), left = run(-1, 0), fwd = run(0, 1), back = run(0, -1);
  for (const [tag, r] of [['right', right], ['left', left], ['fwd', fwd], ['back', back]]) {
    assert.ok(r, `combatStrafe would not engage for the ${tag} probe — the stub mark is not in range`);
    assert.ok(r.moved > 0.05, `the ${tag} probe moved ${r.moved.toFixed(3)} m — nothing to measure`);
  }
  const walkRight = stickRightFor(engine, c, right.face0);
  const orbitR = right.d.clone().normalize().dot(walkRight);
  const orbitL = left.d.clone().normalize().dot(walkRight);
  console.log(`\n[strafe] tangent: stick-right · walk-right ${orbitR.toFixed(3)}, stick-left · walk-right ${orbitL.toFixed(3)}`);
  console.log(`[strafe] radial:  r ${right.r0.toFixed(2)} m -> forward ${fwd.r1.toFixed(2)}, back ${back.r1.toFixed(2)}`);
  /* The tangent, and the reason this arm was written: a fourth instance would have been here. */
  assert.ok(orbitR > 0.5, `stick RIGHT orbits at ${orbitR.toFixed(3)} to a stick-right walk — the tangent is inverted`);
  assert.ok(orbitL < -0.5, `stick LEFT orbits at ${orbitL.toFixed(3)} to a stick-right walk — the tangent is inverted`);
  /* The radial, checked against the comment's own words rather than against a sign. */
  assert.ok(fwd.r1 < fwd.r0 - 0.05,
    `stick FORWARD moved him from ${fwd.r0.toFixed(2)} m to ${fwd.r1.toFixed(2)} m — Moveset.js's ` +
    '"+z on the stick is forward = close in" is false');
  assert.ok(back.r1 > back.r0 + 0.05,
    `stick BACK moved him from ${back.r0.toFixed(2)} m to ${back.r1.toFixed(2)} m — it should back off`);
  /* And he keeps facing the mark the whole time: that is what a lock-on is for. */
  const look = V(Math.sin(c.yaw), 0, Math.cos(c.yaw));
  const toMark = markAt.clone().sub(c.position); toMark.y = 0;
  assert.ok(look.dot(toMark.normalize()) > 0.9, 'combatStrafe stopped facing the mark it is locked to');
});

test('roll / bounce: two moves with one driven entry each, checked against what they claim', async () => {
  /* The two thinnest states in the census — `bounce` has **1** driven entry in the entire test
   * suite and `roll` has 2, both here. Entry is not the question; these check that the move does
   * what its own comment says once it is running.
   *
   * ── roll ────────────────────────────────────────────────────────────────────────────────────
   * `Roll.enter` claims a direction: travel direction, overridden by the stick when
   * `wishMag > 0.4` (`Moveset.js:110`). And `update` claims a speed profile: `rollSpeed` decaying
   * to `walkSpeed` across `rollTime`. Both are checkable against the numbers in TUNE, and the
   * direction half is the same family as everything else this round — a move that launches you
   * the wrong way is the bug that has been found twice already.
   *
   * ── bounce ──────────────────────────────────────────────────────────────────────────────────
   * `Bounce.enter` claims three things in three comments: `launch(jumpV0 · bounceUp)`, *"a bounce
   * refreshes the double jump — chains read as skill"*, and *"…and the walls, for the same
   * reason"*. A refreshed air jump that is not actually refreshed is invisible until a player
   * tries to chain, and nothing in this project has ever driven it. So: spend the air jump AND
   * the wall, bounce, and assert both came back. */
  /* ---- roll: direction and profile ---- */
  {
    const { engine, c } = await makeSim();
    const rollFrom = (yaw, mx, my) => {
      hardReset(engine, c, V(0, 0, 0), yaw);
      /* Settle with NO input first, then re-arm the run. Settling with the probe's own stick held
         would decelerate him below `canEnter`'s 3.4 m/s in the reversal case and the arm would be
         measuring a roll that never started. */
      for (let i = 0; i < 2; i++) {
        engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
        engine.time = i * DT; c.update(DT, i * DT);
      }
      c.position.set(0, 0, 0);
      c.yaw = yaw; c.grounded = true;
      c.velocity.set(Math.sin(yaw) * 6, 0, Math.cos(yaw) * 6);
      const p0 = c.position.clone();
      engine.input.beginFrame(DT); engine.input.move.x = mx; engine.input.move.y = my;
      engine.input.hold('crouch');
      c.update(DT, 0);
      if (c.stateName !== 'roll') return null;
      const v0 = c.speedXZ();
      /* Speed and displacement are sampled INSIDE the roll. Reading `speedXZ()` after the loop
         reads whatever `skid` or `idle` had done to it in the frames since — the first build did
         that and reported a roll "ending" at 1.73 m/s, which is not a fact about Roll at all. */
      let peak = v0, end = v0, frames = 0;
      let dEnd = V(0, 0, 0);
      for (let i = 1; i < 60 && c.stateName === 'roll'; i++) {
        engine.input.beginFrame(DT); engine.input.move.x = mx; engine.input.move.y = my;
        engine.time = i * DT; c.update(DT, i * DT);
        if (c.stateName !== 'roll') break;
        peak = Math.max(peak, c.speedXZ());
        end = c.speedXZ(); frames = i;
        dEnd = c.position.clone().sub(p0); dEnd.y = 0;
      }
      return { d: dEnd, v0, peak, end, frames };
    };
    /* No stick: the roll must follow the direction he was already travelling. */
    const plain = rollFrom(Math.PI, 0, 0);
    assert.ok(plain, 'roll would not engage from a 6 m/s run — canEnter needs speedXZ > 3.4');
    const travel = V(Math.sin(Math.PI), 0, Math.cos(Math.PI));
    const along = plain.d.clone().normalize().dot(travel);
    console.log(`\n[roll] no stick: travelled ${plain.d.length().toFixed(2)} m at ${along.toFixed(3)} to his heading, ` +
                `speed ${plain.v0.toFixed(2)} -> ${plain.end.toFixed(2)} m/s over ${plain.frames} frames`);
    assert.ok(along > 0.95, `the roll went at ${along.toFixed(3)} to the direction of travel — it should follow it`);
    assert.ok(plain.peak >= TUNE.rollSpeed - 0.3,
      `roll peaked at ${plain.peak.toFixed(2)} m/s, below TUNE.rollSpeed ${TUNE.rollSpeed} — the launch is short`);
    /* The profile its own line writes: `walkSpeed + (rollSpeed - walkSpeed) · k`, `k` falling to
       0 across `rollTime`. So the last in-roll frame must be at walking pace, not merely "slower". */
    assert.ok(Math.abs(plain.end - TUNE.walkSpeed) < 1.0,
      `roll's last frame was ${plain.end.toFixed(2)} m/s, not the walkSpeed ${TUNE.walkSpeed} its ` +
      'decay lands on — the k-ramp in Roll.update is not reaching 0');
    assert.ok(Math.abs(plain.frames - TUNE.rollTime / DT) <= 3,
      `roll ran ${plain.frames} frames, not the ${Math.round(TUNE.rollTime / DT)} TUNE.rollTime asks for`);
    /* With the stick held hard the other way, `enter` must take the STICK, not the travel — the
       override is what makes a roll a dodge rather than a commitment. The camera in `makeSim` is
       the default one, looking down −Z, so `move.y = -1` is a wish of +Z against a −Z run. */
    const steered = rollFrom(Math.PI, 0, -1);        // travelling -z, stick asks for +z
    assert.ok(steered, 'roll would not engage for the steered probe');
    const steer = steered.d.clone().normalize().dot(travel);
    console.log(`[roll] stick reversed: ${steer.toFixed(3)} to the old heading (wishMag override at 0.4)`);
    assert.ok(steer < 0, `a full-stick reversal still rolled at ${steer.toFixed(3)} along the OLD heading — ` +
      'Moveset.js:110\'s wishDir override is not taking');
  }
  /* ---- bounce: the two refreshes nothing has ever checked ---- */
  {
    /* OPEN AIR, and the spent wall is a synthetic record rather than a real face. The first
       build put him beside the census's stub wall so there would be something to un-spend, and
       `WallRun` took him on the same frame the bounce resolved: the arm reported `state wallRun`
       and `wall spent true -> true`, both of which are true statements about a wall run. The
       wall bookkeeping is pure — `markWall`/`wallSpent` only touch `lastWallRec`
       (`Controller.js:936`) — so the refresh can be tested without a wall in the world at all,
       and then nothing is competing for the frame. */
    const { engine, c } = await makeSim();
    const FACE = { id: 'synthetic-face' };
    hardReset(engine, c, V(0, 12, 0));
    c.grounded = false;
    c.velocity.set(0, 2, 0);
    c.airJumps = 0;                                   // spend the double jump…
    c.markWall(FACE, 0, 1);                           // …and the wall
    const spentWall = c.wallSpent(FACE, 0, 1);
    const vy0 = c.velocity.y;
    c.bounce();
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    c.update(DT, 0);
    const freshWall = !c.wallSpent(FACE, 0, 1);
    console.log(`[bounce] state ${c.stateName}, vy ${vy0.toFixed(2)} -> ${c.velocity.y.toFixed(2)} ` +
                `(jumpV0 ${TUNE.jumpV0} × bounceUp ${TUNE.bounceUp} = ${(TUNE.jumpV0 * TUNE.bounceUp).toFixed(2)}, ` +
                `less one frame of gravity), airJumps ${c.airJumps}, wall spent ${spentWall} -> ${!freshWall}`);
    assert.equal(c.stateName, 'bounce', `bounce() left Sly in ${c.stateName}`);
    assert.ok(c.velocity.y > vy0, 'bounce did not launch him upward at all');
    assert.ok(Math.abs(c.velocity.y - TUNE.jumpV0 * TUNE.bounceUp) < 1.2,
      `bounce launched at ${c.velocity.y.toFixed(2)} m/s, not the jumpV0 × bounceUp ` +
      `${(TUNE.jumpV0 * TUNE.bounceUp).toFixed(2)} its own line claims`);
    assert.ok(spentWall, 'the probe failed to spend the wall, so the refresh below proves nothing');
    assert.equal(c.airJumps, 1, 'bounce did not refresh the double jump — "chains read as skill" is false');
    assert.ok(freshWall, 'bounce did not free the wall — the second half of its own comment is false');
  }
});

/* ====================================================================== */
/* 23 — CameraRig.right: every consumer, before and after                  */
/* ====================================================================== */

/**
 * A real `CameraRig` on a stub engine. The rig's `update` needs only `engine.get('movement')`
 * (a plain position/velocity/stateName/yaw bag) and `engine.get('collision')`, so the whole
 * chain — frame resolution, the wall-side probe, the boom, the written quaternion — runs
 * headlessly. That matters here: this is the one basis inversion that could change what a player
 * sees, so nothing about it is argued from the source.
 */
function rigEngine(mv, col, focus = false) {
  const listeners = new Map();
  return {
    input: {
      move: { x: 0, y: 0 }, look: { x: 0, y: 0 },
      down: (a) => (a === 'focus' ? focus : false),
      pressed: () => false, released: () => false, bufferedPeek: () => false, buffered: () => false,
    },
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500),
    scene: new THREE.Scene(), renderer: null,
    time: 0, dt: DT, timeScale: 1, width: 1920, height: 1080, quality: 'high',
    warnings: [], debug: { freeCam: false },
    get(m) { return m === 'movement' ? mv : m === 'collision' ? col : null; },
    has() { return false; },
    warn(m) { this.warnings.push(String(m)); },
    on(e, f) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e).add(f); return () => listeners.get(e).delete(f); },
    emit() {}, registerCollider() {},
  };
}
/** A wall whose outward normal (wall -> Sly) is `n`. Only rays pointing INTO the face hit. */
function rigWall(n, d = 0.9) {
  const N = n.clone().normalize();
  return {
    ready: true, SLOPE: { walkable: 0.9, wall: 1.2 },
    raycast(o, dir, maxDist) {
      const into = -dir.x * N.x - dir.z * N.z;
      if (into > 0.5 && d <= maxDist) {
        return { hit: true, point: o.clone().addScaledVector(dir, d), normal: N.clone(), distance: d, tag: 'wall', rec: { id: 'probe-wall' } };
      }
      return { hit: false };
    },
    capsuleSweep(from, to) { return { hit: false, position: to.clone(), normal: V(0, 1, 0), distance: 0 }; },
    overlap() { return []; }, query() { return []; }, nearest() { return null; },
  };
}
/** An occluder on ONE side only, so a non-symmetric whisker pair would show up. */
function rigSlab() {
  return {
    ready: true, SLOPE: { walkable: 0.9, wall: 1.2 },
    raycast() { return { hit: false }; },
    capsuleSweep(from, to) {
      if (to.x > 1.0) { const p = V(1.0, to.y, to.z); return { hit: true, position: p, normal: V(-1, 0, 0), distance: from.distanceTo(p) }; }
      return { hit: false, position: to.clone(), normal: V(0, 1, 0), distance: from.distanceTo(to) };
    },
    overlap() { return []; }, query() { return []; }, nearest() { return null; },
  };
}

test('CameraRig: the five consumers of `right`, two of which must not move', async () => {
  /* `CameraRig._buildBasis` set `this.right` to `(cos yaw, 0, -sin yaw)` — the exact negation of
   * `forward × up`, a field named `right` holding the LEFT vector, and the third and last site of
   * the basis inversion that faked two findings in `Moveset.js`.
   *
   * ── Why this took a round and not a sign flip ───────────────────────────────────────────────
   * `right` has five consumers and they do NOT all move together. Two use it twice — once to
   * derive a sign, once to apply it — so the error cancelled and the shipped framing was correct
   * the whole time. Three use it once. **The fix is therefore behaviour-preserving for two
   * consumers and behaviour-changing for three, and the only honest way to land it is to be able
   * to say which is which afterwards.** So every row below is a number, measured through the real
   * rig, and the two invariants are HARD EQUALITIES — a tolerance would hide the one outcome
   * worth catching, which is an "identical" that quietly drifted.
   *
   *   C1/C2  `_sideSign` (`:763`) projects velocity ON `right`; `_pivotGoal` (`:1161`) applies
   *          `f.side · _sideSign` back ALONG `right`. Both signs flip.        DID NOT MOVE.
   *   C4     whiskers `[+1, 0.55]` and `[-1, 0.55]` — equal offsets, equal authority, combined
   *          with `min`, so the probe SET is invariant under `right → -right`. DID NOT MOVE.
   *   C3     `_probeWallSide` (`:774`) names its casts `hitR`/`hitL` from `right`, feeding
   *          `_wallSide` and the bank in `_roll` (`:759`).                     CHANGED.
   *   C2b    the `aim ? 0.45` shoulder (`:1160`) is an unpaired constant.      CHANGED.
   *   C5     `_freeFly` (`:1530`) strafes `mv.x` along `right`.                CHANGED.
   *
   * ── The roll convention, measured rather than derived ───────────────────────────────────────
   * "Bank into the wall" is a physical claim, so it is tested as one: does the camera's up-vector
   * acquire a component TOWARD the wall? That needs no handedness convention at all, which is the
   * point — a hand-derived basis is what caused this whole family of bugs. Separately, forcing
   * `_roll = +0.30` and reading the quaternion the rig's own `_write` produces gives
   * `camUp · camRight₀ = -0.2745`, i.e. positive roll banks LEFT.
   *
   * Pre-fix the camera banked AWAY from the wall on BOTH sides (−0.0957 each). Away on both sides
   * is the signature of an inverted INPUT rather than a wrong constant: a wrong constant banks the
   * same way regardless of side, an inverted input banks away from whichever side it is. That is
   * what made the fix a correction to a stated intent rather than a coin flip.
   *
   * ── The fix, and exactly three numbers moved ────────────────────────────────────────────────
   *   C3   -0.0957  ->  +0.0957   (both sides: AWAY -> INTO, matching the comment)
   *   C2b  -0.4500  ->  +0.4500   (the aim shoulder swaps to his right)
   *   C5   -3.0000  ->  +3.0000   (the debug strafe follows the stick)
   * while C1/C2's |offset| stayed 0.847196 with `rig.yaw` identical at -0.1624 — that second part
   * is what rules out the yaw path reading `right` on the quiet — and C4's booms stayed
   * 5.00000 / 0.88000 / 5.00000.
   *
   * ── And it cannot have touched a shipped frame ──────────────────────────────────────────────
   * `CameraRig.update` returns immediately when `engine.debug.freeCam` is set (`:644`), and
   * `Debug.js:132` sets exactly that to "take the camera away from the gameplay rig" for every
   * capture. So no shot in `shots/` runs this code at all; the change is live gameplay only. */
  const YAW = 0.6;
  const FWD = V(Math.sin(YAW), 0, Math.cos(YAW));
  const TRUE_RIGHT = new THREE.Vector3().crossVectors(FWD, V(0, 1, 0)).normalize();
  const { CameraRig } = await import('../src/player/CameraRig.js');
  const spin = (rig, engine, n) => { for (let i = 0; i < n; i++) { engine.time = i * DT; rig.update(DT, i * DT); } };

  /* ---- C1/C2: the self-cancelling pair. The observable is the offset VECTOR and its magnitude,
     not a projection onto a basis that is itself under suspicion. ---- */
  const mvSwing = { position: V(0, 2, 0), velocity: TRUE_RIGHT.clone().multiplyScalar(6), grounded: false, stateName: 'hookSwing', yaw: YAW };
  const eSwing = rigEngine(mvSwing, null);
  const rSwing = new CameraRig(eSwing);
  rSwing.init?.();
  spin(rSwing, eSwing, 120);
  const withSide = new THREE.Vector3(); rSwing._pivotGoal(withSide, 1);
  const keptSide = rSwing._frame.side;
  rSwing._frame.side = 0;
  const noSide = new THREE.Vector3(); rSwing._pivotGoal(noSide, 1);
  rSwing._frame.side = keptSide;
  const offset = withSide.clone().sub(noSide);
  console.log(`\n[rig] C1/C2 framing offset  |offset| ${offset.length().toFixed(6)}  ` +
              `_sideSign ${rSwing._sideSign.toFixed(3)}  f.side ${keptSide.toFixed(3)}  rig.yaw ${rSwing.yaw.toFixed(4)}`);

  /* ---- C4: whiskers over a one-sided occluder ---- */
  const eSlab = rigEngine({ position: V(0, 2, 0), velocity: V(0, 0, 0), grounded: true, stateName: 'idle', yaw: YAW }, rigSlab());
  const rSlab = new CameraRig(eSlab);
  rSlab.init?.();
  spin(rSlab, eSlab, 30);
  const booms = [V(0, 0, 1), V(1, 0, 0), V(-0.4, 0.2, 0.9).normalize()].map((d) => rSlab._castBoom(5.0, d));
  console.log(`[rig] C4 whiskers           _castBoom over a one-sided slab: ${booms.map((b) => b.toFixed(5)).join(', ')}`);

  /* ---- C3: the bank, on `wallCling` (which does resolve to the wall_run framing) ---- */
  const banks = {};
  for (const side of [+1, -1]) {
    const toWall = TRUE_RIGHT.clone().multiplyScalar(side);
    const mv = { position: V(0, 2, 0), velocity: FWD.clone().multiplyScalar(7), grounded: false, stateName: 'wallCling', yaw: YAW };
    const e = rigEngine(mv, rigWall(toWall.clone().negate()));
    const r = new CameraRig(e);
    r.init?.();
    spin(r, e, 90);
    e.camera.updateMatrixWorld(true);
    const camUp = V(0, 1, 0).applyQuaternion(e.camera.quaternion);
    banks[side] = { toward: camUp.dot(toWall), wallSide: r._wallSide, roll: r._roll };
    console.log(`[rig] C3 bank wall-on-${side > 0 ? 'RIGHT' : 'LEFT '}  _wallSide ${String(r._wallSide).padStart(2)}  ` +
                `roll ${(r._roll * 180 / Math.PI).toFixed(2)}°  camUp·toWall ${banks[side].toward.toFixed(4)}  ` +
                `${banks[side].toward > 0.002 ? 'INTO' : banks[side].toward < -0.002 ? 'AWAY' : 'none'}`);
  }

  /* ---- C2b: the aim shoulder ---- */
  const shoulder = {};
  for (const focus of [false, true]) {
    const e = rigEngine({ position: V(0, 2, 0), velocity: V(0, 0, 0), grounded: true, stateName: 'idle', yaw: YAW }, null, focus);
    const r = new CameraRig(e);
    r.init?.();
    spin(r, e, 60);
    const out = new THREE.Vector3(); r._pivotGoal(out, 1);
    shoulder[focus ? 'aim' : 'base'] = out.clone().sub(V(0, 2, 0)).dot(TRUE_RIGHT);
  }
  console.log(`[rig] C2b aim shoulder      no-aim ${shoulder.base.toFixed(4)}  aiming ${shoulder.aim.toFixed(4)} along his true right`);

  /* ---- C5: the free-fly strafe ---- */
  const eFly = rigEngine({ position: V(0, 2, 0), velocity: V(0, 0, 0), grounded: true, stateName: 'idle', yaw: YAW }, null);
  const rFly = new CameraRig(eFly);
  rFly.init?.();
  spin(rFly, eFly, 10);
  rFly.setMode('free');
  eFly.input.move.x = 1; eFly.input.move.y = 0;
  const flyFrom = rFly._freePos.clone();
  spin(rFly, eFly, 20);
  const flyD = rFly._freePos.clone().sub(flyFrom);
  const camFwd = new THREE.Vector3(); eFly.camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize();
  const screenRight = new THREE.Vector3().crossVectors(camFwd, V(0, 1, 0)).normalize();
  const fly = flyD.dot(screenRight);
  console.log(`[rig] C5 free-fly strafe    stick RIGHT -> ${fly.toFixed(4)} along screen-right  ` +
              `(${fly > 0.001 ? 'RIGHT, correct' : fly < -0.001 ? 'LEFT, inverted' : 'no move'})`);

  /* ── the two that MUST NOT MOVE, as hard equalities ─────────────────────────────────────── */
  assert.ok(Math.abs(offset.length() - 0.847196) < 1e-4,
    `the framing offset is now ${offset.length().toFixed(6)}, not 0.847196. C1/C2 were classified ` +
    'as self-cancelling and they are not — something else reads `right` on the way to the pivot.');
  assert.deepEqual(booms.map((b) => b.toFixed(5)), ['5.00000', '0.88000', '5.00000'],
    'the whisker booms moved. The lateral pair was classified as symmetric (±1, both authority ' +
    '0.55, combined with min); if that changed, the boom now depends on which side `right` names.');

  /* ── the three the fix CHANGED, at their corrected values ───────────────────────────────── */
  assert.ok(banks[+1].toward > 0.002 && banks[-1].toward > 0.002,
    `the bank goes ${banks[+1].toward.toFixed(4)} / ${banks[-1].toward.toFixed(4)} — it must lean ` +
    'INTO the wall on both sides, which is what `_blendFrame`\'s own comment claims. Negative on ' +
    'both sides is the pre-fix signature: an inverted `_wallSide`, not a wrong constant.');
  assert.ok(shoulder.aim > 0,
    `aiming offsets ${shoulder.aim.toFixed(4)} along his true right — it must be positive, i.e. over ` +
    'his right shoulder. This term is an unpaired constant, so it is the one `_pivotGoal` cannot self-correct.');
  assert.ok(fly > 0,
    `the free-fly strafe goes ${fly.toFixed(4)} along screen-right on a stick-RIGHT — the debug camera ` +
    'is moving opposite the stick again.');

  /* The lever. Every "changed" row is only meaningful if the rig is really banking and really
     strafing; a rig that did nothing would satisfy three sign assertions by doing nothing. */
  assert.ok(Math.abs(banks[+1].roll) > 0.05, `roll is ${banks[+1].roll.toFixed(4)} rad — the bank never engaged, so C3 measures nothing`);
  assert.ok(Math.abs(fly) > 1, `the free-fly camera moved ${fly.toFixed(4)} — it is not strafing, so C5 measures nothing`);
  assert.ok(Math.abs(shoulder.base) < 1e-6, `the no-aim baseline is ${shoulder.base.toFixed(4)}, not 0 — C2b is not isolating the aim term`);
});

/* ====================================================================== */
/* 24 — the camera's routing table is keyed on the wrong namespace         */
/* ====================================================================== */

test('CameraRig: which framing every state actually gets, and the entries nothing can reach', async () => {
  /* Round 20 fixed the wall-run BANK so it leans into the wall. This arm found why that bank had
   * never fired during a wall run at all — a bigger defect than the sign was — and the fix now
   * lives in `CameraRig.STATE_FRAME`. The diagnosis below is kept verbatim because it is what the
   * fix was written against; the assertions at the bottom are the ones that changed.
   *
   * ── The mechanism ───────────────────────────────────────────────────────────────────────────
   * `_resolveFrame` lowercases the STATE name and takes the first `STATE_RULES` entry that is a
   * substring of it. The state names are camelCase (`wallRun`, `railWalk`, `ledgeHang`); a third
   * of the rule keys are snake_case (`wall_run`… no — `rail_walk`, `rail_slide`, `ledge_hang`,
   * `ledge_climb`, `run_fast`, `apex`, `cane`). **Lowercasing camelCase never inserts an
   * underscore**, so those keys cannot match any state name, ever. The table is a CLIP-name table
   * being fed STATE names — two namespaces that overlap enough to look like one.
   *
   * That is the §357.1 shape in a lookup table: dead entries that look alive. 14 of the 34 rules
   * are unreachable, and the arm below derives that rather than listing it.
   *
   * ── What it costs, in the three cases where a state lands on a framing that contradicts it ──
   *   `wallRun`   -> `run`   because 'wallrun'.indexOf('run') === 4 and `['run','run']` sits at
   *                          index 2, far above `['wall','wall_run']`. So the `wall_run` framing
   *                          — the one with `side 0.35` and `vtrack 1` — is reached by
   *                          `wallClimb`, `wallCling` and `wallJump`, and never by the move it is
   *                          named for. `_blendFrame` gates the wall-side probe on
   *                          `_frameKey === 'wall_run'`, so **the bank is dead during a wall run.**
   *   `railWalk`  -> `walk`  because 'railwalk'.indexOf('walk') === 4. The `balance` framing it
   *                          wants (`dist 2.10`, `pitch +5°` — the one that reads as a tightrope)
   *                          is reached by nothing at all.
   *   `ledgeHang` -> `idle`  because the key is `ledge_hang`. The `ledge_hang` framing exists and
   *                          is authored with intent — *"drop under the lip and look up past it —
   *                          the point is what's above"* — and it has never once been applied.
   *
   * ── And the one this arm reports rather than fixes ──────────────────────────────────────────
   * `move` -> `idle`. The only locomotion state this moveset has is called `move`, and it matches
   * neither `walk` nor `run`, so **`walk`, `run` and `run_fast` are unreachable and ordinary
   * running uses the idle framing**. That is not a routing typo: the FRAMES table clearly wants a
   * speed-tiered framing (`dist` 0.20 / 0.90 / 1.60) and there is no speed tiering anywhere in
   * the rig to drive it. Wiring one is a design decision about how the camera should feel, not a
   * defect fix, so it is measured here and routed, not decided. */
  const { CameraRig } = await import('../src/player/CameraRig.js');
  const rig = new CameraRig(stubEngine());
  const { buildMoveset } = await import('../src/player/Moveset.js');
  const states = buildMoveset().map((s) => s.name);

  const routed = new Map();
  for (const n of states) {
    rig._lastResolved = null;
    rig._resolveFrame(n, false);
    routed.set(n, rig._frameKey);
  }
  console.log('\n[frame] state -> framing key');
  for (const [n, k] of routed) console.log(`  ${n.padEnd(14)} -> ${k}`);

  /* The rule table and the framing table, read out of the source rather than restated — the
     §388 rule: a second copy of either would drift the first time somebody edits the rig. */
  const src = readFileSync(new URL('../src/player/CameraRig.js', import.meta.url), 'utf8');
  const rulesBlock = src.slice(src.indexOf('const STATE_RULES'), src.indexOf('];', src.indexOf('const STATE_RULES')));
  const ruleKeys = [...rulesBlock.matchAll(/\['([a-z_]+)',\s*'([a-z_]+)'\]/g)].map((m) => m[1]);
  const framesBlock = src.slice(src.indexOf('const FRAMES = {'), src.indexOf('\n};', src.indexOf('const FRAMES = {')));
  const frameKeys = [...framesBlock.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map((m) => m[1]);
  assert.ok(ruleKeys.length > 25 && frameKeys.length > 15,
    `parsed ${ruleKeys.length} rules and ${frameKeys.length} framings — the source scan has stopped working`);

  const reachedRules = new Set();
  for (const n of states) {
    const s = n.toLowerCase();
    for (const k of ruleKeys) if (s.indexOf(k) !== -1) { reachedRules.add(k); break; }
  }
  const deadRules = ruleKeys.filter((k) => !reachedRules.has(k));
  const usedFramings = new Set(routed.values());
  const deadFramings = frameKeys.filter((k) => !usedFramings.has(k));
  console.log(`\n[frame] rules no state name can reach (${deadRules.length}/${ruleKeys.length}): ${deadRules.join(', ')}`);
  console.log(`[frame] framings no state reaches (${deadFramings.length}/${frameKeys.length}): ${deadFramings.join(', ')}`);

  /* ── THE FIX HAS LANDED, and this arm now asserts the routed answers ─────────────────────────
     `CameraRig.STATE_FRAME` puts an exact state-name map in front of the substring table, for
     exactly the three names above. The arm keeps its shape — it still resolves every registered
     state through the live rig and still derives the dead sets from source — because the value
     was never the three equalities, it was the census that found them.

     DOMAIN (§418.3)
       passes on : the shipped rig. Measured after the change: wallRun -> wall_run,
                   railWalk -> balance, ledgeHang -> ledge_hang, combatStrafe -> combat.
       fails on  : the rig as it shipped before `STATE_FRAME` existed — this arm's previous
                   revision asserted 'run' / 'walk' / 'idle' / 'idle' for the same four names and
                   was the red arm that the fix was written against (1 of 56 failing, observed).
                   The `substr` recomputation below re-derives those answers live, so the failing
                   input is not a memory of an old run: it is computed every time this arm
                   executes and asserted to DIFFER from what the rig answers. */
  const substr = (n) => {
    const s = n.toLowerCase();
    for (let i = 0; i < ruleKeys.length; i++) if (s.indexOf(ruleKeys[i]) !== -1) return ruleKeys[i];
    return null;
  };
  console.log(`\n[frame] substring answers for the three: wallRun -> ${substr('wallRun')} · `
    + `railWalk -> ${substr('railWalk')} · ledgeHang -> ${substr('ledgeHang')}`);

  /* THE HISTORICAL TABLE, RECONSTRUCTED AND RUN, because the live one can no longer produce the
     failing answers. The four rules that pointed at the deleted speed ladder — and `['run','run']`
     is the one that caused this whole family — went with those rows, so `substr('wallRun')` is now
     `null` rather than `'run'`. That is the trap being REMOVED rather than overridden, which is
     strictly better and which also destroys this arm's original failing input. So it is rebuilt:
     the pre-deletion rule order is restated here as the historical artefact it now is, and the
     wrong answers are recomputed from it live rather than remembered. */
  const RULES_BEFORE_LADDER_DELETION = ['run_fast', 'sprint', 'run', 'walk', ...ruleKeys];
  const substrOld = (n) => {
    const t = n.toLowerCase();
    for (let i = 0; i < RULES_BEFORE_LADDER_DELETION.length; i++) {
      if (t.indexOf(RULES_BEFORE_LADDER_DELETION[i]) !== -1) return RULES_BEFORE_LADDER_DELETION[i];
    }
    return null;
  };
  console.log(`[frame] the table AS IT WAS answers: wallRun -> ${substrOld('wallRun')} · `
    + `railWalk -> ${substrOld('railWalk')}   (both now removed from the live table)`);
  assert.equal(substrOld('wallRun'), 'run',
    'the reconstructed pre-deletion table no longer answers `run` for wallRun, so this arm\'s '
    + 'failing input has stopped failing and the passing answers below prove nothing');
  assert.equal(substrOld('railWalk'), 'walk',
    'the reconstructed pre-deletion table no longer answers `walk` for railWalk');

  assert.equal(routed.get('wallRun'), 'wall_run',
    `wallRun routes to '${routed.get('wallRun')}'. If that is 'run', \`STATE_FRAME\` has been ` +
    'dropped and the wall-side probe and the bank are dead during a wall run again.');
  assert.equal(routed.get('railWalk'), 'balance',
    `railWalk routes to '${routed.get('railWalk')}' — 'walk' means the exact map is gone`);
  assert.equal(routed.get('ledgeHang'), 'ledge_hang',
    `ledgeHang routes to '${routed.get('ledgeHang')}' — 'idle' means the exact map is gone`);
  /* The failing input, computed rather than remembered: the substring table STILL answers the
     three wrong values, and the rig no longer agrees with it. If these ever coincide, either the
     rule table was rewritten (fine, but then this arm is measuring nothing) or `STATE_FRAME`
     stopped being consulted (not fine). */
  assert.ok(routed.get('wallRun') !== substrOld('wallRun') &&
            routed.get('railWalk') !== substrOld('railWalk'),
    'the rig now agrees with the pre-deletion substring table on the two names the exact map ' +
    'exists to override, so the override is not running and these equalities pass for the wrong ' +
    'reason');
  /* And the trap is gone from the LIVE table as well as overridden in front of it, which is a
     different and better state than the fix originally achieved. With run -> run deleted, the
     substring table's own answer for `wallRun` is now the `wall` rule — which maps to `wall_run`,
     i.e. **the substring table now AGREES with `STATE_FRAME` instead of contradicting it.** The
     exact map went from load-bearing to belt-and-braces. Asserted as agreement rather than as
     `null`, because `null` was the wrong prediction: the rule that matches is a correct one. */
  const ruleMap = Object.fromEntries(
    [...rulesBlock.matchAll(/\['([a-z_]+)',\s*'([a-z_]+)'\]/g)].map((m) => [m[1], m[2]]));
  const substrFraming = (n) => (substr(n) === null ? null : ruleMap[substr(n)]);
  console.log(`[frame] live substring table now resolves wallRun -> ${substr('wallRun')} -> `
    + `${substrFraming('wallRun')} (was run -> run)`);
  assert.equal(substrFraming('wallRun'), 'wall_run',
    `the live substring table resolves wallRun to '${substrFraming('wallRun')}', not 'wall_run'. A `
    + 'rule that shadows the `wall` rule is back, and the §442 trap with it — the exact map would '
    + 'still cover this one name, but the next state ending in "run" would not be covered.');

  /* ── The two the census reports rather than fixes ─────────────────────────────────────────── */
  assert.equal(routed.get('move'), 'idle',
    `move routes to '${routed.get('move')}'. Ordinary running is framed by the standing-still row, `
    + 'and that is now a DESIGN question rather than a dead-entry one: the walk/run/run_fast rows '
    + 'were deleted (§463) because nothing could reach them and they read as coverage. If this '
    + 'answer has changed, somebody decided how running should be framed — item 8 of the hardware '
    + 'sheet — and that decision wants a person, not a green suite.');
  /* The fourth member, reported by the previous revision of this arm and fixed one round later
     so it stayed attributable. `combat`'s `side 0.30` is applied along `_sideSign`, which is
     derived from the LATERAL component of velocity — and during an orbit the lateral component
     is the whole motion, so the framing opens toward the direction of the circle. In `idle`
     (`side 0.00`) that channel was multiplied by zero. */
  assert.equal(routed.get('combatStrafe'), 'combat',
    `combatStrafe routes to '${routed.get('combatStrafe')}' — 'idle' means the exact map is gone`);
  assert.equal(substr('combatStrafe'), null,
    `the substring table now answers '${substr('combatStrafe')}' for combatStrafe; it answered ` +
    'nothing at all, which is why the exact map had to carry this one');

  /* The dead rule count is UNCHANGED by the fix and that is correct, not an oversight: the exact
     map sits in FRONT of the substring table, so the table's own reachability is exactly the
     property it always was. Left as a count so adding a state or a rule cannot redden it. */
  assert.ok(deadRules.length >= 10,
    `only ${deadRules.length} rules are unreachable now (was 14): ${deadRules.join(', ')} — if that ` +
    'dropped, the namespace mismatch is being repaired and this arm should say so');
  /* The dead FRAMINGS did change, and they collapsed onto exactly one thing: the speed ladder.
     Asserted as a set rather than a count, because "which three" is the whole result — every
     authored framing in the table is now reachable except the walk/run/run_fast rungs, and those
     are unreachable for the `move -> idle` reason above rather than for a namespace one. */
  /* **NOTHING IN `FRAMES` IS UNREACHABLE.** This used to read `['run','run_fast','walk']`, and
     before the exact map it also held `balance` and `ledge_hang`. The last three were not routed
     to — they were deleted, because three authored rows nothing can reach read as coverage and
     two published censuses counted them as delivering framings. An empty set is a far stronger
     invariant than a known-set: it cannot be satisfied by adding a row and updating a list. */
  assert.deepEqual(deadFramings, [],
    `framings nothing reaches: ${deadFramings.join(', ')}. Every row in FRAMES must be reachable by `
    + 'some registered state — an unreachable row is authored, tuned, invisible, and counted as '
    + 'coverage by anything that reads the table.');
  /* The lever: this arm is worthless if `_resolveFrame` answers the same thing for everything. */
  assert.ok(usedFramings.size >= 10,
    `only ${usedFramings.size} distinct framings are reachable — the resolver is not discriminating, ` +
    'so the dead-set above is a statement about the prober rather than about the table');
});

/* ====================================================================== */
/* 25 — standing still does not travel, and a face too steep still sheds   */
/* ====================================================================== */

/**
 * A single infinite inclined plane, `y = x·tan(deg)`, whose `capsuleSweep` clips leftover motion
 * into the contact plane **exactly as `Collision.capsuleSweep` does**. That last part is the
 * point: a friendlier stub would resolve the landing cleanly and the arm would prove nothing.
 */
function rampCollision(deg) {
  const rad = deg * Math.PI / 180;
  const t = Math.tan(rad);
  const n = new THREE.Vector3(-Math.sin(rad), Math.cos(rad), 0);
  const surfY = (x) => x * t;
  const WALK = Math.cos(50 * Math.PI / 180);
  return {
    ready: true, fallback: false, recs: [],
    SLOPE: { walkable: 50 * Math.PI / 180, wall: 70 * Math.PI / 180 },
    WALKABLE_COS: WALK,
    capsuleSweep(from, to) {
      const res = { hit: false, position: to.clone(), normal: n.clone(), distance: 0, toi: 1,
                    slid: false, tag: 'ground', material: 'stone', rec: { id: 'ramp' } };
      if (to.y >= surfY(to.x) - 1e-6) return res;
      const f0 = from.y - surfY(from.x), f1 = to.y - surfY(to.x);
      let tHit = f0 > 0 ? f0 / (f0 - f1) : 0;
      tHit = Math.max(0, Math.min(1, tHit));
      const hit = from.clone().lerp(to, tHit);
      res.hit = true; res.toi = tHit;
      const left = to.clone().sub(hit);
      const d = left.dot(n);
      if (d < 0) left.addScaledVector(n, -d);          // the real layer's clip, reproduced
      res.position.copy(hit).add(left);
      if (res.position.y < surfY(res.position.x)) res.position.y = surfY(res.position.x);
      res.distance = hit.distanceTo(from);
      return res;
    },
    groundCheck(pos, _r, maxDist) {
      const y = surfY(pos.x), dy = pos.y - y;
      return { hit: dy <= maxDist + 1e-4 && dy > -1.0, y, normal: n.clone(), slope: rad,
               walkable: Math.cos(rad) >= WALK, tag: 'ground', material: 'stone',
               rec: { id: 'ramp' }, distance: Math.abs(dy) };
    },
    raycast(o, d, maxDist) {
      if (d.y < -0.5) {
        const y = surfY(o.x);
        if (o.y - y >= 0 && o.y - y <= maxDist) {
          return { hit: true, point: V(o.x, y, o.z), normal: n.clone(), distance: o.y - y, tag: 'ground', rec: { id: 'ramp' } };
        }
      }
      return { hit: false };
    },
    overlap() { return []; }, query() { return []; }, nearest() { return null; },
  };
}

test('slopes: sand walks to 58 and stone still refuses at 52 — the material-scoped limit, both faces', async () => {
  /* ── §515: the user's P1, pinned at the boundary it sharpened ─────────────────────────────
   * "Difficult to walk or run up slopes other than by jumping" measured as three stacked
   * mechanisms on the real dunes: the 50° gate refusing sand faces the level walks (walk lines
   * reach 57.2°), `_moveVertical`'s seat-vs-shed branch shedding downhill through the same
   * stone limit (a CONSTANT 1.50 m/s — the §509 tell), and `narrowGround` reading any steep
   * slope as a ledge (tiptoe 116/120 frames). Fixes: `_walkableLimit(material)` at all THREE
   * consumer sites (the fourth one-branch-of-N error this file has caught), and a plane-true
   * narrowness probe. The numbers: sand limit 58 = one degree above the measured walked
   * maximum; the first non-sand face that must stay refused is 61.9°.
   *
   * ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a synthetic 55° SAND ramp — walked uphill at full run speed, grounded, no
   *               tiptoe; and a 45° stone ramp, same.
   *   fails  on : RUN in-arm — 52° STONE (refused: airborne shed, no uphill progress) and 62°
   *               SAND (past even the sand limit: still sheds). Both faces of both materials.
   *   does NOT  : see the real dunes' convex crests (ballistic lofting at speed is physics and
   *   discrim.    is not asserted here), nor pick the 58 — any value in (57.2, 61.9) separates
   *               identically on today's level (§443.3's rule), and the feel of bounding vs
   *               grinding belongs to the sheet.
   */
  const { TUNE: T } = await import('../src/player/Controller.js');
  const { engine, c } = await makeSim();
  const ramp = (deg, material) => {
    const col = rampCollision(deg);
    const gc = col.groundCheck.bind(col), sw = col.capsuleSweep.bind(col);
    col.groundCheck = (p, r, m) => { const g = gc(p, r, m); if (g) g.material = material; return g; };
    col.capsuleSweep = (a, b) => { const r = sw(a, b); r.material = material; return r; };
    return col;
  };
  /* Refusal climbs sample UNDER `stuckTime` 180 frames: a capsule pinned on a refused face is
     exactly §504's stuck class, and the watchdog teleporting him to a PREVIOUS climb's safe
     stance at f180 put +11.94 m/s of rescue into the first version of this arm's window. The
     watchdog firing there is correct; measuring through it was not. `safeOk` is scrubbed per
     climb for the same reason — a safe point recorded on one ramp is cross-arm state on the
     next. */
  const climb = (deg, material, frames = 168) => {
    c.col = ramp(deg, material); c._colReal = c.col; c._calibrated = true;
    c.teleport(V(2, 2 * Math.tan(deg * Math.PI / 180) + 0.05, 0), Math.PI / 2);
    c._needSpawnSnap = false;
    c.safeOk = false;
    engine.camera.rotation.set(0, -Math.PI / 2, 0, 'YXZ'); engine.camera.updateMatrixWorld(true);
    const states = new Map(); const xs = [];
    for (let i = 0; i < frames; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 1;
      engine.time = i * DT; c.update(DT, i * DT);
      states.set(c.stateName, (states.get(c.stateName) || 0) + 1);
      if (i >= frames / 2) xs.push(c.position.x);
    }
    const vx = (xs[xs.length - 1] - xs[0]) / ((xs.length - 1) * DT);
    return { vx, states };
  };

  /* WHAT: sand walks past the stone limit, at full speed, without tiptoe */
  const sand55 = climb(55, 'sand');
  assert.ok(sand55.vx > T.runSpeed * 0.9,
    `55° sand delivered ${sand55.vx.toFixed(2)} m/s uphill against runSpeed ${T.runSpeed} — the `
    + 'material-scoped limit is not reaching one of its three consumer sites (§515 lists them)');
  assert.ok(!sand55.states.has('tiptoe'),
    '55° sand spent frames in tiptoe — narrowGround is reading the slope as a ledge again, '
    + 'which was the 1.50 m/s balance-crawl half of the defect');
  const stone45 = climb(45, 'stone');
  assert.ok(stone45.vx > T.runSpeed * 0.9,
    `45° stone delivered ${stone45.vx.toFixed(2)} m/s — the walkable side of the stone limit broke`);

  /* WHICH, RUN: both refusals stand */
  const stone52 = climb(52, 'stone');
  assert.ok(stone52.vx < T.runSpeed * 0.5,
    `52° stone delivered ${stone52.vx.toFixed(2)} m/s uphill — the stone limit widened; the §503 `
    + 'wedge class and every shedding face in the game just became walkable');
  assert.ok((stone52.states.get('fall') || 0) > 100,
    '52° stone did not shed into fall — refusal must mean shedding, not a slow walk');
  const sand62 = climb(62, 'sand');
  assert.ok(sand62.vx < T.runSpeed * 0.5 && (sand62.states.get('fall') || 0) > 100,
    `62° sand delivered ${sand62.vx.toFixed(2)} m/s — the sand limit is unbounded and dune cliffs `
    + 'stopped shedding');

  console.log(`[slopes] sand55 ${sand55.vx.toFixed(2)} · stone45 ${stone45.vx.toFixed(2)} · `
    + `stone52 ${stone52.vx.toFixed(2)} (sheds) · sand62 ${sand62.vx.toFixed(2)} (sheds)`);
});

test('slopes: standing still does not travel, and a face too steep to stand on still sheds', async () => {
  /* DOMAIN (§418.3). This arm has TWO bars pulling opposite ways, so it needs two pairs, and the
   * reason the synthetic ramp exists is that half the domain is absent from the level:
   *   "does not travel"  passes on : walkable ramps 3–15°, post-bf076ce  -> |downhill| < 0.01 m
   *                      fails on  : the same ramps pre-fix              -> mean 0.2816, max 2.1644 m
   *   "still sheds"      passes on : SYNTHETIC 55° and 65° ramps         -> drop 0.4193 / 0.5111 m
   *                      fails on  : a walkability gate widened past 50° -> shedding goes to zero
   * The shed pair CANNOT be built from this level: its steepest face is 47.9° against a 50° limit,
   * so every grade here is authored standable and the failing input for the first bar and the
   * passing input for the second do not coexist in the geometry. That is why the ramp is
   * synthetic and says so — not for convenience, because the domain is otherwise half-empty and
   * the "still sheds" bar would have been unfalsifiable while looking fine.
   *
   * `_moveVertical` had the same shape as the ground snap — `position.copy(r.position)` on a
   * purely vertical request — and gravity re-contacts the surface every single frame, so every
   * frame donated a little downhill. Standing still with NO INPUT on a 3–15° grade in the real
   * level travelled a mean of 0.2816 m and a maximum of **2.1644 m** in 90 frames.
   *
   * ── Why the gate is walkability, and why that restores intent rather than choosing it ───────
   * The clip is not always wrong. On a face too steep to stand on it IS the shedding mechanism,
   * and it must survive. The discriminator is the one the collision layer already publishes, so
   * nothing new is invented: `WALKABLE_COS`, the 50° limit in `Collision.TUNE`.
   *
   * The level cannot test the steep half. **It contains no unwalkable ground at all** — sweeping
   * it, the steepest face is 47.9° against that 50° limit — so a gate resting on level geometry
   * would be resting on geometry that does not exist. Hence this synthetic ramp, and hence its
   * `capsuleSweep` reproducing the real layer's clip rather than a friendlier one.
   *
   * What the gate changed in the level, stated rather than buried: 15–50° faces used to shed a
   * standing character 27/40 at a mean drop of 0.4179 m, and now shed 0/40. Every one of those
   * grades is authored walkable, so the drift had been making them behave as terrain they were
   * not. That is the authored intent restored, and it is a real behaviour change either way. */
  const angles = [10, 25, 40, 49, 55, 65];
  const rows = [];
  for (const deg of angles) {
    const engine = stubEngine();
    const c = new Controller(engine);
    await c.init();
    c.col = rampCollision(deg);
    c._colReal = c.col; c._calibrated = true; c._bindCollision = () => {};
    c.teleport(V(0, 0.05, 0), Math.PI);
    c._needSpawnSnap = false;
    for (let i = 0; i < 3; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    const p0 = c.position.clone();
    for (let i = 0; i < 90; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    const d = c.position.clone().sub(p0);
    rows.push({ deg, walkable: Math.cos(deg * Math.PI / 180) >= c.col.WALKABLE_COS,
                drop: -d.y, downhill: -d.x, grounded: c.grounded });
  }
  console.log('\n[ramp] deg  walkable   drop(m)   downhill(m)  grounded');
  for (const r of rows) {
    console.log(`  ${String(r.deg).padStart(3)}     ${r.walkable ? 'yes' : 'NO '}     ${r.drop.toFixed(4)}     ${r.downhill.toFixed(4)}      ${r.grounded}`);
  }
  const stand = rows.filter((r) => r.walkable);
  const shed = rows.filter((r) => !r.walkable);
  assert.ok(stand.length >= 3 && shed.length >= 2, 'the ramp sweep lost one of its two populations');

  /* (1) A character given no input does not move. */
  for (const r of stand) {
    assert.ok(Math.abs(r.downhill) < 0.01,
      `standing on a ${r.deg}° WALKABLE ramp travelled ${r.downhill.toFixed(4)} m downhill with no ` +
      'input — the vertical mover is importing the contact-plane clip again');
    assert.ok(Math.abs(r.drop) < 0.01, `and descended ${r.drop.toFixed(4)} m on a grade he should stand on`);
  }

  /* (2) THE GATE. A face too steep to stand on still sheds him, and this is the half that a
     careless widening of the discriminator would silently destroy. Pre-gate these read
     55° -> 0.4193 m drop / 0.2866 m downhill and 65° -> 0.5111 / 0.2336; the gate must leave
     them alone, not merely leave them non-zero. */
  for (const r of shed) {
    assert.ok(r.drop > 0.25,
      `a ${r.deg}° face dropped a standing character only ${r.drop.toFixed(4)} m in 1.5 s — it has ` +
      'stopped shedding. Do NOT widen the walkability gate to make this pass; the gate is the fix.');
    assert.ok(Math.abs(r.downhill) > 0.1,
      `a ${r.deg}° face moved him only ${r.downhill.toFixed(4)} m downhill — shedding is degrading`);
    assert.equal(r.grounded, false, `a ${r.deg}° face left him GROUNDED — it is unwalkable by its own limit`);
  }

  /* (3) THE LEVER, and it is the one that makes (1) mean anything. "Does not travel" is satisfied
     perfectly by a character who cannot move at all, so the same ramp, same stub, must carry him
     when he is actually asked to walk. Without this the arm passes on a frozen Sly. */
  const engine = stubEngine();
  const c = new Controller(engine);
  await c.init();
  c.col = rampCollision(10);
  c._colReal = c.col; c._calibrated = true; c._bindCollision = () => {};
  c.teleport(V(0, 0.05, 0), Math.PI);
  c._needSpawnSnap = false;
  for (let i = 0; i < 3; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  const q0 = c.position.clone();
  for (let i = 0; i < 60; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 1;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  const travelled = c.position.clone().sub(q0).length();
  console.log(`[ramp] lever: 60 frames of forward stick on the 10° ramp moved him ${travelled.toFixed(3)} m`);
  assert.ok(travelled > 1.0,
    `asked to walk, he moved ${travelled.toFixed(3)} m — a character who cannot move also never ` +
    'drifts, so the standing assertions above would pass on a frozen Sly and prove nothing');
});

/* ========================================================================================== */
/* §409 — the capsuleSweep census                                                             */
/* ========================================================================================== */

/**
 * `Collision.capsuleSweep` sets `hit` on two occasions that mean opposite things: the swept
 * capsule CONTACTED geometry, or DEPENETRATION pushed a capsule that was already overlapping
 * back out without the sweep touching anything. On the second path it also sets `toi = 1` and
 * `distance = totalLen`, so a caller reading `hit` and trusting `toi` is told "you travelled the
 * whole way" by a sweep that never moved. That dropped Sly off a wall-climb summit lip.
 *
 * One site was fixed by bound (34295c5, bf076ce). This arm is about the CLASS: the layer now
 * publishes `sweepHit` / `depenHit` — `hit` is their disjunction — and the caller set is pinned
 * so a seventh caller cannot be added without being censused.
 *
 * The enumeration these arms defend, all of it measured on the real level below:
 *
 *   _moveHorizontal snap    reads hit + toi   BOUNDED by the resolve (34295c5)
 *   _moveVertical           reads hit + toi   BOUNDED and walkability-gated (bf076ce)
 *   _slide                  reads position    a push-out IS a contact here; correct either way
 *   ledgeAssist             reads position    ditto, and rejects the candidate when unsure
 *   _moveHorizontal step-up reads hit BARE    a depen report DISABLES the step — fail-safe
 *   _calibrate              reads hit BARE    latched once; see the note on its arm below
 *   CameraRig._sweep        reads distance    depen sets distance = totalLen, so the boom reads
 *                                             "clear to the far end" minus one camPad, not a jam
 *   Guard._pocketWorld      reads position    §742; the fourth site. See the arm below — it is
 *                           ONLY               in `_slide`'s class, and the census is what
 *                                              established that rather than the author saying so.
 */
test('§409 census: capsuleSweep says WHY it hit, and every caller in src is enumerated', async () => {
  const { c, collision } = await realWorld();

  /* ---- 1. the discriminator, all four quadrants on the REAL collision layer -------------- */
  /* A flag that cannot say one of its answers is not a flag (§409.3), so `sweepHit` is shown
     here to be neither constant, nor an alias of `hit`, nor an alias of `!hit`.
   *
   * DOMAIN (§418.3) — the two inputs, recorded while the domain was still in front of me:
   *   passes on : `contact`, a 3.5 m drop onto the floor at (0,·,30)   -> sweepHit true
   *   fails on  : `depen`,  a zero-length request straddling that floor -> sweepHit false
   * Both are IN THIS ARM, which is the point: the domain of `sweepHit` is the 2x2 of
   * {swept, not swept} x {pushed out, not pushed out}, and all four cells are constructed here
   * and asserted. No bar below can be vacuous while its own counter-case sits four lines away.
   * The `depen` cell is the one that costs thought — a zero-length request makes the sweep loop
   * break under `minSweep` WITHOUT casting, so a `hit` there can only be the push-out. That is
   * the construction that makes the cell reachable at all; without it this bar would be §407's
   * shape and nobody would know. */
  const RAD = TUNE.radius, H = TUNE.height, OPT = { skipOneWay: false };
  const g0 = collision.groundCheck(V(0, 90, 30), RAD, 300);
  assert.ok(g0?.hit, 'no ground under the census probe point — the fixture moved');
  const gy = g0.y;

  const contact = collision.capsuleSweep(V(0, gy + 3, 30), V(0, gy - 0.5, 30), RAD, H, OPT);
  const clear = collision.capsuleSweep(V(0, gy + 20, 30), V(0, gy + 19, 30), RAD, H, OPT);
  // Zero-length request: the sweep loop breaks under `minSweep` without ever casting, so any
  // `hit` here can ONLY have come from the push-out. Straddling the floor guarantees overlap.
  const buried = V(0, gy - H * 0.5, 30);
  const depen = collision.capsuleSweep(buried, buried.clone(), RAD, H, OPT);
  // A real contact that ALSO leaves residual overlap — both disjuncts true at once, which is
  // ordinary and must not be read as either one refuting the other.
  const bothQ = collision.capsuleSweep(buried, V(buried.x, buried.y - 0.5, buried.z), RAD, H, OPT);

  console.log(`\n[§409] contact  hit=${contact.hit} sweepHit=${contact.sweepHit} depenHit=${contact.depenHit} toi=${contact.toi.toFixed(3)}`);
  console.log(`[§409] clear    hit=${clear.hit} sweepHit=${clear.sweepHit} depenHit=${clear.depenHit} toi=${clear.toi.toFixed(3)}`);
  console.log(`[§409] depen    hit=${depen.hit} sweepHit=${depen.sweepHit} depenHit=${depen.depenHit} depth=${depen.depenDepth.toFixed(4)} toi=${depen.toi.toFixed(3)}`);
  console.log(`[§409] both     hit=${bothQ.hit} sweepHit=${bothQ.sweepHit} depenHit=${bothQ.depenHit} depth=${bothQ.depenDepth.toFixed(4)}`);

  assert.equal(contact.hit, true, 'a 3.5 m drop onto the floor did not report a hit');
  assert.equal(contact.sweepHit, true, 'a genuine swept contact did not set sweepHit');
  assert.equal(contact.depenHit, false, 'a clean landing 3 m above the floor reported a push-out');

  assert.equal(clear.hit, false, 'a sweep through open air 20 m up reported a hit');
  assert.equal(clear.sweepHit, false, 'sweepHit is set when nothing was hit at all');

  // THE quadrant. This is the one that used to be indistinguishable from `contact`.
  assert.equal(depen.hit, true, 'a capsule buried in the floor did not report a hit');
  assert.equal(depen.sweepHit, false,
    'a depenetration-ONLY result set sweepHit — the sweep cast nothing (zero-length request), so ' +
    'this is `hit` wearing the costume of a contact again, which is the whole of §409');
  assert.equal(depen.depenHit, true, 'the push-out that set `hit` did not set depenHit');
  assert.ok(depen.depenDepth > 0.01, `push-out reported ${depen.depenDepth.toFixed(4)} m of depth`);
  assert.equal(depen.toi, 1,
    'the depenetration path no longer sets toi = 1 — if that changed, the two bounded call sites ' +
    'are defending against a shape that no longer exists and should be re-derived, not deleted');

  assert.equal(bothQ.sweepHit && bothQ.depenHit, true,
    'a contact that left residual overlap must set BOTH — they are independent facts, not a ' +
    'two-valued enum, and a caller that treats depenHit as "therefore not a real contact" is wrong');

  /* ---- 2. every caller, statically, so an unexercised one cannot hide ------------------- */
  /* The walk below can only see callers it happens to run. This scan sees all of them, which is
     what makes this a census rather than a sample: a seventh caller anywhere under src/ trips it.
   *
   * DOMAIN (§418.3), and this one was OBSERVED rather than argued:
   *   passes on : `src/` as it stands                                    -> 3 sites
   *   fails on  : a copy of `src/` with one extra `col.capsuleSweep(...)`
   *               appended to Collision.js                                -> 4 sites, bar RED
   * Run against both trees before this comment was written. It matters that the failing input is
   * a NEW CALLER and not a moved line: another lane shifted `CameraRig.js:1381` to `:1426` while
   * this arm was being written and the count did not budge, which is the discrimination the bar
   * is supposed to have and the reason it counts invocations rather than pinning positions. */
  const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const walkDir = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walkDir(p) : (e.name.endsWith('.js') ? [p] : []);
  });
  const callers = [];
  for (const f of walkDir(SRC)) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      // an INVOCATION, not `typeof x.capsuleSweep === 'function'` and not the definition
      if (/\.capsuleSweep\s*\(/.test(ln) && !/typeof/.test(ln)) {
        callers.push(`${path.relative(SRC, f)}:${i + 1}`);
      }
    });
  }
  console.log(`[§409] direct capsuleSweep callers in src: ${callers.join(', ')}`);
  assert.equal(callers.length, 4,
    `${callers.length} direct capsuleSweep call sites in src (${callers.join(', ')}), and the ` +
    '§409 census enumerated 4: Controller._calibrate, Controller._sweep, CameraRig._sweep, ' +
    'Guard._pocketWorld. A new one must be censused — does it distinguish a swept contact from a ' +
    'push-out, and what does it do when it cannot? — and then this count updated, not the other ' +
    'way round.');
  const byFile = callers.map((s) => s.split(':')[0]).sort();
  assert.deepEqual(byFile, ['ai/Guard.js', 'player/CameraRig.js', 'player/Controller.js', 'player/Controller.js'],
    'a capsuleSweep caller appeared outside the censused set. It was player-only until §742 added ' +
    '`Guard._pocketWorld`; guard SENSING still uses raycast/groundCheck, neither of which ' +
    'depenetrates, and any new guard-side sweep needs its own arm below.');

  // And the Controller's own fan-out: `_sweep` is the wrapper five consumers share.
  const ctrl = readFileSync(path.join(SRC, 'player', 'Controller.js'), 'utf8');
  const fanout = (ctrl.match(/this\._sweep\s*\(/g) || []).length;
  assert.equal(fanout, 5,
    `Controller routes ${fanout} consumers through _sweep; the census enumerated 5 (step-up probe, ` +
    'ground snap, _moveVertical, _slide, ledgeAssist). A sixth must be censused before this number moves.');

  /* ---- 3. the rate, and why it is NOT measured here --------------------------------------- */
  /* §409.2 measured the step-up probe at "0 depenetration-only hits in 305 sweeps" and concluded
     the class was geometry-specific. 305 was too small a sample: over 7,830 controller frames the
     class fires 283 times in 21,595 sweeps — about 1 in 76 — at four of the six sites. The
     conclusion that only ONE site was damaged survives, but because of how the other five READ the
     result (§412.3), not because the situation is rare.

     That measurement lives in `tools/sweepcensus.mjs` and is deliberately not run here.

       · A RATE needs thousands of controller frames. They cost seconds standalone and minutes
         under `node --test` on a box shared with other lanes, and this suite is run constantly.
       · A walk can only census the callers it happens to reach — never `CameraRig`, whose boom
         does not run in a headless controller probe. The **static scan above is strictly
         stronger**: it finds a new caller by finding the CALL, anywhere in `src`, exercised or not.
       · A short walk would give a small count, and asserting `depenOnly > 0` on a small count is
         a coin flip dressed as a bar — which is the error §409.2 made in the other direction. The
         lever that shows the class fires at all is the depenetration quadrant in part 1, and that
         one is deterministic. */

  /* ---- 4. the caller §409.2 missed, and it is the worst-placed one ------------------------ */
  /* `_calibrate` calls `capsuleSweep` DIRECTLY rather than through `_sweep`, which is exactly the
     shape of the blind spot: §409.2 was assembled by recalling consumers of the wrapper. It reads
     `hit` bare and its answer is LATCHED into `_capOff` for every subsequent sweep, where every
     other site gets a fresh answer next frame.
   *
   * DOMAIN (§418.3) — and writing it down is what exposed the problem, so it is stated plainly:
   *   passes on : the real level, standing at (0,·,30)     -> sweepHit true, _capOff 0
   *   fails on  : NO INPUT IN THE CURRENT LEVEL.
   *
   * `assert.equal(cal?.sweepHit, true)` is a bar I cannot make red. The probe drops 3.5 m from
   * 3 m above ground that `groundCheck` just found, so the sweep MUST cross it and the loop
   * cannot come back empty — the same structural argument that makes the bare `hit` read safe is
   * what makes the bar unfalsifiable. **That is §407's shape, in an arm I wrote while auditing
   * for §407's shape.**
   *
   * It is kept, deliberately, as a TRIPWIRE rather than a discriminating bar, and the difference
   * is the honesty of this comment. Its domain is not today's inputs but tomorrow's edits: change
   * the probe to start below known ground, or to sweep a distance shorter than `probeUp`, and the
   * depenetration-only answer becomes reachable and this fires. §407's failure was not having an
   * unfalsifiable bar; it was believing one was discriminating. A tripwire that says so is fine.
   * If you ever make the failing case reachable, replace this with the bound, not a wider window.
   *
   * `assert.equal(c._capOff, 0)` beside it is NOT in that position: it goes red on any collision
   * module reporting the capsule CENTRE, which `Controller._calibrate` explicitly supports and
   * warns about. Different bar, reachable domain, left as an ordinary assertion. */
  /* Stand him on known ground and re-bind, so the probe runs against the REAL layer. Skipping the
     re-bind was worth catching: a freshly built Controller has not bound anything yet and answers
     from `FLAT`, so the probe reported `undefined` — an arm that had been reading the stand-in. */
  c.teleport(V(0, gy + 0.05, 30), Math.PI);
  let cal = null;
  const realSweep = collision.capsuleSweep.bind(collision);
  collision.capsuleSweep = (...a) => (cal = realSweep(...a));
  c._colReal = null; c._calibrated = false;
  c._bindCollision();
  collision.capsuleSweep = realSweep;
  assert.ok(cal, 'the calibration probe never reached the real collision layer — it answered from ' +
    'the FLAT stand-in, so everything below would be measuring the stub instead of the level');
  console.log(`[§409] _calibrate: hit=${cal?.hit} sweepHit=${cal?.sweepHit} depenHit=${cal?.depenHit} -> _capOff=${c._capOff}`);
  assert.equal(cal?.sweepHit, true,
    'the origin-convention probe got a depenetration-only answer. It reads `hit` bare and LATCHES ' +
    'the result into `_capOff` for every subsequent sweep, so this is the highest-consequence bare ' +
    'read in the codebase; it is safe only because a 3.5 m drop that starts 3 m above known ground ' +
    'must cross the floor. If that stops being true the probe needs the bound, not a wider window.');
  assert.equal(c._capOff, 0, 'the base/centre calibration flipped — every sweep is now offset 0.9 m');
});

/**
 * §409 census, the FOURTH caller (§742): `Guard._pocketWorld`.
 *
 * The census above counts it; this arm is the census of it — the question the count's own failure
 * message asks of any new site. *Does it distinguish a swept contact from a push-out, and what
 * does it do when it cannot?*
 *
 * **It does not distinguish, and it does not need to, because it reads `position` and nothing
 * else.** That puts it in `_slide`/`ledgeAssist`'s class rather than `_moveVertical`'s: the whole
 * question it asks is *"where along this 0.34 m offset does a coin still fit?"*, and `position`
 * answers it correctly under BOTH disjuncts —
 *
 *   sweepHit  the offset ran into something; `position` is the last clear point along it.
 *   depenHit  the pouch STARTED inside something (a guard flush against masonry); `position` is
 *             where the push-out put it, which is out of the wall. That is the right answer and
 *             it is a strictly better one than the raw offset.
 *
 * It never reads `hit`, `toi` or `distance` — the three fields §409 is about — so the shape that
 * dropped Sly off the summit lip has no way in. Asserted below by CONSTRUCTION rather than by
 * reading the source: the depenetration-only quadrant is built (a guard whose hips are buried),
 * the real method is called, and its answer is required to be out of the thing it started in.
 */
test('§409 census, the fourth caller: `Guard._pocketWorld` is in `_slide`\'s class, not `_moveVertical`\'s', async () => {
  /* DOMAIN (§418.3)
   * passes on : a guard standing in open courtyard — the sweep finds nothing, `position` is the
   *             requested end point, and the pouch lands the full `pocketBack` behind him.
   * fails  on : the same guard with his hips buried in a solid collider, where the raw offset
   *             stays inside it and only the push-out gets out. Both cells are built in-arm.
   * does NOT  : test the pop, the flight or the economy — `tests/pocketpop.test.mjs` owns those.
   *             This is about ONE field of ONE sweep result.
   */
  const { engine, collision } = await realWorld();
  const { Guards } = await import('../src/ai/Guard.js');
  const guards = new Guards(engine);
  await guards.init();
  const g = guards.guards[0];
  g._updatePocket();
  g.root.updateMatrixWorld(true);

  /* Route the guard's collision lookup at the real layer, and watch what the sweep answered. */
  const seen = [];
  const realSweep = collision.capsuleSweep.bind(collision);
  collision.capsuleSweep = (...a) => { const r = realSweep(...a); seen.push({ sweepHit: r.sweepHit, depenHit: r.depenHit }); return r; };
  const inner = engine.get.bind(engine);
  engine.get = (m) => (m === 'collision' ? collision : inner(m));

  /* ---- cell 1: open air. The sweep finds nothing and the pouch goes the whole way back. ---- */
  const openAt = V(0, 200, 0);                       // nothing is 200 m up
  const homePos = g.position.clone();
  g.position.copy(openAt);
  g.forward.set(0, 0, 1);
  g._updatePocket();
  const open = g._pocketWorld(new THREE.Vector3());
  const openLast = seen[seen.length - 1];
  console.log(`[§409/§742] open  sweepHit=${openLast?.sweepHit} depenHit=${openLast?.depenHit} `
    + `back=${open.clone().sub(openAt).dot(g.forward).toFixed(3)}`);
  assert.equal(openLast?.sweepHit, false, 'a pouch sweep 200 m in the air contacted something');
  assert.equal(openLast?.depenHit, false, 'a pouch sweep 200 m in the air was pushed out of something');
  assert.ok(open.clone().sub(openAt).dot(g.forward) < -0.3,
    `the unobstructed pouch landed ${open.clone().sub(openAt).dot(g.forward).toFixed(3)} m along his `
    + 'facing — it must go the full `pocketBack` BEHIND him when nothing is in the way');

  /* ---- cell 2: buried. The depenetration-only quadrant, and the one that matters. ---------- */
  /**
   * Put his hips inside a real SOLID, found by raycast rather than typed (§435.4).
   *
   * The floor under the courtyard will not do, and finding that out was worth the detour: at
   * (0,·,30) `groundCheck` answers from TERRAIN's analytic height, which has no BVH triangles
   * there, so `Collision.overlap` reports a capsule half a metre under the sand as touching
   * nothing at all. That is §732.4's disagreement between the two representations in miniature —
   * and it would have made this cell a silent no-op with `raw overlaps=0`.
   */
  const SOLID_TAGS = ['ground', 'wall', 'ledge', 'pole', 'misc'];
  const stillIn = (p) => collision.overlap(p, 0.2414, SOLID_TAGS).length;
  const EYE = 1.2;
  let solid = null;
  const dir = new THREE.Vector3();
  /* Search rather than assume: the fixture is only valid if the RAW offset really does end up
     inside something, so the search runs until `overlap` says so and the arm refuses otherwise. */
  outer:
  for (let a = 0; a < 48; a++) {
    const th = (a / 48) * Math.PI * 2;
    dir.set(Math.sin(th), 0, Math.cos(th));
    const hit = collision.raycast(V(0, EYE, 24), dir, 40, null);
    if (!hit?.hit || hit.distance < 1) continue;
    for (const deep of [0.60, 1.00, 1.60]) {
      const at = V(0, EYE - 0.62, 24).addScaledVector(dir, hit.distance + deep);
      g.position.copy(at);
      g.forward.copy(dir).negate();                   // his back is deeper into the solid
      g._updatePocket();
      /**
       * The validated point is where the SWEEP STARTS — his own hip — and not the raw pouch.
       *
       * That distinction is the whole fixture. A start OUTSIDE the solid with the end inside it
       * produces `sweepHit`, which is the ordinary contact quadrant and one this arm can already
       * see elsewhere; only a start INSIDE produces the depenetration-only answer §409 is about.
       * The first draft validated the pouch, buried him 0.30 m, and got `sweepHit=true
       * depenHit=false` — a fixture that passed its own search and tested the wrong cell.
       */
      const hip = V(g.position.x, g.position.y + 0.62, g.position.z);
      if (stillIn(hip) > 0 && stillIn(g.pocketPosition) > 0) {
        solid = { dir: dir.clone(), tag: hit.tag, deep }; break outer;
      }
    }
  }
  assert.ok(solid,
    'no direction from the courtyard buried the guard\'s HIP inside a solid collider — then the '
    + 'depenetration cell below is not reachable and this arm is not measuring the quadrant it says');
  console.log(`[§409/§742] buried fixture: ${solid.tag} at ${solid.deep} m depth`);
  seen.length = 0;
  const out = g._pocketWorld(new THREE.Vector3());
  const buriedLast = seen[seen.length - 1];
  const raw = g.pocketPosition.clone();
  console.log(`[§409/§742] buried sweepHit=${buriedLast?.sweepHit} depenHit=${buriedLast?.depenHit} `
    + `raw overlaps=${stillIn(raw)} -> swept overlaps=${stillIn(out)}  moved=${raw.distanceTo(out).toFixed(3)} m`);
  assert.ok(buriedLast, 'the buried pouch never reached the real collision layer');
  assert.equal(buriedLast.depenHit, true,
    'a pouch whose sweep STARTS inside the floor did not report a push-out — then this cell is not '
    + 'the depenetration quadrant and the arm is measuring the wrong thing');
  assert.ok(stillIn(raw) > 0, 'the raw offset is not inside anything, so there is nothing to get out of');
  assert.equal(stillIn(out), 0,
    `the pouch is still inside ${stillIn(out)} collider(s) after the sweep. \`_pocketWorld\` reads `
    + '`position` precisely so a push-out is honoured; if that read changed to `hit`+`toi`, this is '
    + 'the arm that says so.');

  collision.capsuleSweep = realSweep;
  engine.get = inner;
  g.position.copy(homePos);
  g._updatePocket();
});

/**
 * The summit lip, as a minimal pair. Both arms return `hit: true` AND `toi: 1` — identical on
 * every field the pre-fix code read — and differ only in whether the sweep actually contacted
 * anything, which shows up as the position it resolved to. One must descend and one must not.
 */
test('§409: the summit-lip pair — same hit, same toi, opposite correct answers', async () => {
  /* DOMAIN (§418.3) — the strongest form available, because the failing input is CODE that
   * existed and the red was watched happen:
   *   passes on : `Controller._moveHorizontal` as it stands, with the snap bounded by
   *               `Math.min(byToi, byResolve)`      -> depen −0.42 m, contact +0.34 m
   *   fails on  : that same line reverted to `drop * dn.toi`, which is what shipped before
   *               34295c5                            -> depen +0.34 m, arm RED with its own message
   * Reverted, ran, watched it go red, restored. The 0.76 m gap between the two arms IS the defect,
   * so the bar's domain and the bug's domain are the same set — which is the property to aim for
   * and the reason this arm needed no separate calibration case.
   *
   * The two inputs are also both CONSTRUCTED here rather than hunted for in the level: `mode`
   * selects a depenetration-only answer or a genuine contact, identical on `hit` and on `toi`.
   * A real summit lip produces the first about once in 76 sweeps (§412.2) and this arm would then
   * depend on finding one; a stub makes the rare cell of the domain reachable on demand. That is
   * the same move as the synthetic 55°/65° ramp in the `slopes` arm, for the same reason. */
  const DROP = TUNE.stepHeight + TUNE.groundSnap;

  /** Upward probes report clear (so the step-up runs); downward probes answer per `mode`. */
  function lipCollision(mode) {
    const res = { hit: false, sweepHit: false, depenHit: false, depenDepth: 0, toi: 1, distance: 0,
      position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), tag: 'ground', material: 'stone', rec: null };
    const gnd = { hit: true, y: 0, normal: new THREE.Vector3(0, 1, 0), slope: 0, tag: 'ground', material: 'stone', rec: { id: 'lip' }, walkable: true };
    return {
      ready: true, fallback: false,
      SLOPE: { walkable: 50 * Math.PI / 180, wall: 70 * Math.PI / 180 },
      WALKABLE_COS: Math.cos(50 * Math.PI / 180),
      capsuleSweep(from, to) {
        res.hit = false; res.sweepHit = false; res.depenHit = false; res.depenDepth = 0;
        res.toi = 1; res.normal.set(0, 1, 0); res.position.copy(to);
        res.distance = from.distanceTo(to);
        if (to.y >= from.y - 1e-9) return res;              // upward / level: clear
        if (mode === 'depen') {
          /* DEPENETRATION ONLY: the sweep contacted nothing, the capsule was already overlapping
             and got pushed out, and the layer still says hit with toi = 1. He did not move. */
          res.hit = true; res.depenHit = true; res.depenDepth = 0.02; res.toi = 1;
          res.position.copy(from);
        } else {
          /* A GENUINE contact that happens to run the whole requested length. */
          res.hit = true; res.sweepHit = true; res.toi = 1;
          res.position.set(from.x, from.y - DROP, from.z);
        }
        return res;
      },
      groundCheck(pos) { gnd.y = pos.y - 0.02; return gnd; },
      raycast() { return { hit: false }; },
      overlap() { return []; },
      nearest() { return null; },
      query() { return []; },
    };
  }

  async function run(mode) {
    const engine = stubEngine();
    const c = new Controller(engine);
    await c.init();
    c.col = lipCollision(mode);
    c._colReal = c.col; c._calibrated = true; c._capOff = 0; c._bindCollision = () => {};
    c.teleport(V(0, 10, 0), Math.PI);
    c._needSpawnSnap = false;
    c.grounded = true;
    c.velocity.set(2, 0, 0);
    const y0 = c.position.y;
    c._moveHorizontal(DT);
    return { descended: y0 - c.position.y, moved: Math.abs(c.position.x) };
  }

  const depen = await run('depen');
  const real = await run('contact');
  console.log(`\n[§409] summit lip — depenetration-only: descended ${depen.descended.toFixed(4)} m ` +
    `(travelled ${depen.moved.toFixed(4)} m)`);
  console.log(`[§409] summit lip — genuine contact:    descended ${real.descended.toFixed(4)} m ` +
    `(travelled ${real.moved.toFixed(4)} m)`);
  console.log(`[§409] the drop at stake: stepHeight + groundSnap = ${DROP.toFixed(4)} m`);

  /* Both expectations are DERIVED, because the first version of this arm asserted the wrong ones.
     `_moveHorizontal` lifts by `stepHeight` before it slides and only then snaps down, so the NET
     descent is not the snap distance:

       lift  +stepHeight            (0.42)          both arms, the step-up probe reports clear
       snap  -min(drop·toi, byResolve),  drop = stepHeight + groundSnap  (0.76)

       depenetration-only:  byResolve = 0     -> net  -stepHeight  = -0.42  (he KEEPS the lift)
       genuine contact:     byResolve = drop  -> net  +groundSnap  = +0.34

     Their difference is exactly `drop`, 0.76 m — which is the fall the defect caused, so the gap
     between these two arms IS the bug, measured. */

  /* (1) The defect. A push-out reports `toi = 1`, which reads as "you travelled the whole way";
     taking it at face value dropped Sly off the top of the ladder. The bound is `byResolve`, and
     the resolve moved him nowhere, so the snap must move him nowhere. */
  assert.ok(Math.abs(depen.descended + TUNE.stepHeight) < 0.01,
    `a depenetration-only sweep left him ${(-depen.descended).toFixed(4)} m above his start; he must ` +
    `be exactly the ${TUNE.stepHeight.toFixed(2)} m step-up lift above it, having taken NO drop. The ` +
    'push-out resolved to the position it started from, so the snap had no vertical distance to ' +
    'honour — this is the summit lip, and `drop * toi` alone is what walks off it.');

  /* (2) THE LEVER, and it is the whole reason (1) means anything: a snap that has been deleted,
     or bounded to nothing, also never drops him. The same frame with a REAL contact — identical
     `hit`, identical `toi`, differing only in where the sweep resolved — must re-seat him. */
  assert.ok(Math.abs(real.descended - TUNE.groundSnap) < 0.01,
    `a genuine contact ${DROP.toFixed(4)} m below left him ${real.descended.toFixed(4)} m lower, not ` +
    `the ${TUNE.groundSnap.toFixed(2)} m the lift-then-snap arithmetic requires — the ground snap has ` +
    'stopped snapping, and with it (1) passes on a controller that can no longer descend at all. ' +
    'Do not relax (1); the two arms are one bar.');

  /* (3) And the pair, stated as the defect itself: two results identical on `hit` and on `toi`
     must differ in outcome by the whole drop. This is the assertion that fails if `sweepHit` is
     ever collapsed back into `hit` — neither arm alone would notice. */
  assert.ok(Math.abs((real.descended - depen.descended) - DROP) < 0.01,
    `the two arms differ by ${(real.descended - depen.descended).toFixed(4)} m where the defect is ` +
    `worth ${DROP.toFixed(4)} m. Same hit, same toi, opposite correct answers — if that gap has ` +
    'closed, the controller has stopped telling the two apart.');

  /* (4) And he must actually have walked, because a character pinned in place also never falls. */
  assert.ok(depen.moved > 0.01 && real.moved > 0.01,
    `he travelled ${depen.moved.toFixed(4)} / ${real.moved.toFixed(4)} m horizontally — the ` +
    'horizontal slide is not running, so neither arm is testing the frame it claims to test');
});
