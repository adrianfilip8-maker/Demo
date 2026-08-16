import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Controller, TUNE } from '../src/player/Controller.js';

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

class StubInput {
  constructor() {
    this.move = { x: 0, y: 0 };
    this._down = new Set(); this._pressed = new Set(); this._released = new Set();
    this._buf = new Map(); this.t = 0;
  }
  beginFrame(dt) { this.t += dt; this._pressed.clear(); this._released.clear(); }
  clear() { this._down.clear(); this._pressed.clear(); this._released.clear(); this._buf.clear(); }
  hold(a) { if (!this._down.has(a)) { this._down.add(a); this._pressed.add(a); this._buf.set(a, this.t); } }
  let_go(a) { if (this._down.delete(a)) this._released.add(a); }
  down(a) { return this._down.has(a); }
  pressed(a) { return this._pressed.has(a); }
  released(a) { return this._released.has(a); }
  bufferedPeek(a, ms) { const t = this._buf.get(a); return t != null && (this.t - t) * 1000 <= ms; }
  buffered(a, ms) { const ok = this.bufferedPeek(a, ms); if (ok) this._buf.delete(a); return ok; }
}

function stubEngine() {
  const listeners = new Map();
  return {
    input: new StubInput(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),   // default look direction is −Z
    scene: new THREE.Scene(), renderer: null,
    time: 0, dt: 0, timeScale: 1, width: 1920, height: 1080, quality: 'high',
    warnings: [], events: [],
    debug: { freeCam: false, showColliders: false, wireframe: false },
    get() { return null; }, has() { return false; },
    warn(m) { this.warnings.push(String(m)); },
    on(e, f) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e).add(f); return () => listeners.get(e).delete(f); },
    emit(e, p) { this.events.push({ evt: e, payload: p }); for (const f of listeners.get(e) || []) f(p); },
    registerCollider() {},
  };
}

/**
 * Floor at y = 0, plus optionally the solid block `z <= wall.z, y <= wall.top` — a climbable +z
 * face with a walkable lid — and a registry of point affordances for `afford()`.
 *
 * `capsuleSweep` resolves by which face the motion CROSSED, using `from`, never by testing the
 * end point against the solid. See the note inside it: the point-in-solid version produced a
 * convincing fake engine bug.
 */
function stubCollision({ points = [], wall = null, groundTag = 'ground', narrow = 0 } = {}) {
  const sweep = { hit: false, position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0 };
  const gnd = { hit: false, y: 0, normal: new THREE.Vector3(0, 1, 0), tag: 'ground', material: 'stone', rec: { id: 'floor' } };
  return {
    ready: true, fallback: false,
    SLOPE: { walkable: 50 * Math.PI / 180, wall: 70 * Math.PI / 180 },
    capsuleSweep(from, to, radius) {
      const r = radius ?? TUNE.radius;
      sweep.position.copy(to); sweep.normal.set(0, 1, 0); sweep.hit = false;
      if (to.y < 0) { sweep.position.y = 0; sweep.hit = true; }
      if (wall) {
        /* SWEPT, not point-in-solid: which face the capsule crossed is decided from `from`, and
           that distinction is load-bearing rather than pedantic. A point test resolves by final
           position, so the 0.76 m step-down probe `_moveHorizontal` fires after a mantle — which
           starts on the lid and ends inside the block — came out as "you are inside the +z face"
           and shoved Sly back out sideways. That produced a perfect mantle/fall/re-grab loop and
           looked exactly like an engine bug for as long as it took to trace. It was this
           function. */
        const side = wall.z + r;
        if (from.z >= side - 1e-9 && sweep.position.z < side && sweep.position.y < wall.top) {
          sweep.position.z = side; sweep.hit = true; sweep.normal.set(0, 0, 1);
        }
        if (from.y >= wall.top - 1e-9 && sweep.position.y < wall.top && sweep.position.z <= wall.z) {
          sweep.position.y = wall.top; sweep.hit = true; sweep.normal.set(0, 1, 0);
        }
      }
      sweep.distance = sweep.position.distanceTo(from);
      return sweep;
    },
    groundCheck(pos, _r, maxDist) {
      // Standing ON the block counts as ground, so a ladder can top out onto something.
      gnd.y = (wall && pos.z <= wall.z) ? wall.top : 0;
      gnd.tag = typeof groundTag === 'function' ? groundTag(pos) : groundTag;
      // `narrow` makes the floor a beam along z, so `narrowGround()` (which probes ±0.64 m to
      // either side) answers true and `tiptoe` becomes reachable.
      gnd.hit = (narrow ? Math.abs(pos.x) <= narrow : true) && pos.y - gnd.y <= maxDist + 1e-4;
      return gnd;
    },
    raycast(o, d, maxDist) {
      if (wall && d.z < -0.5 && o.y <= wall.top) {
        const dist = o.z - wall.z;
        if (dist > 0 && dist <= maxDist) {
          return { hit: true, point: new THREE.Vector3(o.x, o.y, wall.z), normal: new THREE.Vector3(0, 0, 1), distance: dist, tag: 'wall', rec: wall.rec };
        }
      }
      if (d.y < -0.5) {
        if (wall && o.z <= wall.z && o.y > wall.top && o.y - wall.top <= maxDist) {
          return { hit: true, point: new THREE.Vector3(o.x, wall.top, o.z), normal: new THREE.Vector3(0, 1, 0), distance: o.y - wall.top, tag: 'ledge', rec: wall.rec };
        }
        if (o.y > 0 && o.y <= maxDist) {
          return { hit: true, point: new THREE.Vector3(o.x, 0, o.z), normal: new THREE.Vector3(0, 1, 0), distance: o.y, tag: 'ground', rec: { id: 'floor' } };
        }
      }
      return { hit: false };
    },
    overlap() { return []; }, query() { return []; },
    nearest(pos, tag, maxDist) {
      let best = null, bd = Infinity;
      for (const it of points) {
        if (it.tag !== tag) continue;
        const p = it.point(pos);
        const d = p.distanceTo(pos);
        if (d <= maxDist && d < bd) { bd = d; best = { point: p, distance: d, rec: it.rec, tangent: it.tangent, t: it.t?.(pos) ?? 0 }; }
      }
      return best;
    },
  };
}

/** A minimal GUARDS stand-in, so `mark()` and `pickMark()` resolve and the two lock-on states
 *  can be exercised rather than exiting on "there is nobody to look at". */
function stubGuards(at) {
  const body = { position: at.clone(), pocketPosition: at.clone(), headY: at.y + 1.6, state: 'patrol' };
  return {
    nearest: () => body,
    nearestPickpocketTarget: () => body,
  };
}

async function makeSim(colOpts = {}) {
  const engine = stubEngine();
  if (colOpts.guards) engine.get = (m) => (m === 'guards' ? colOpts.guards : null);
  const c = new Controller(engine);
  await c.init();
  c.col = stubCollision(colOpts);
  c._colReal = c.col;
  c._calibrated = true;
  c._bindCollision = () => {};              // the stub is the collision; do not let init swap it
  c.teleport(new THREE.Vector3(0, 0, 0), Math.PI);
  c._needSpawnSnap = false;
  return { engine, c };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DT = 1 / 60;

/** Drive the sim. `script(i, input, c)` sets input for frame i; `probe(i, c)` observes. */
function run(engine, c, frames, script, probe) {
  for (let i = 0; i < frames; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    script(i, engine.input, c);
    engine.time = i * DT;
    c.update(DT, i * DT);
    if (probe) probe(i, c);
  }
}

const countEvents = (engine, name) => engine.events.filter((e) => e.evt === name).length;

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

function railPoints(a, b, len) {
  const spline = new THREE.LineCurve3(a, b);
  const rec = { id: 'rail0', mesh: { userData: { spline } } };
  const u = (p) => Math.min(1, Math.max(0, (p.x - a.x) / len));
  return [{ tag: 'rail', rec, point: (p) => spline.getPointAt(u(p)), t: u, tangent: V(1, 0, 0) }];
}

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
const PITCH = 2.10;
const launchV = () => TUNE.jumpV0 * TUNE.wallJumpUp;
const apexOf = (v) => (v * v) / (2 * -TUNE.gravity);

function ladderWall({ rungs = 10, pitch = PITCH, z = -10, holds = true, top = 40, lines = null } = {}) {
  const batter = 0.105, nz = 1 / Math.hypot(batter, 1);
  const rec = { id: 'pylon-face', handholds: null };
  const list = [];
  const cols = lines || [{ x: 0, y0: pitch, n: rungs }];
  cols.forEach((col, ci) => {
    for (let i = 0; i < (col.n ?? rungs); i++) {
      list.push({
        id: `notch-${ci}-${i}`, point: V(col.x, col.y0 + i * pitch, z), normal: V(0, batter * nz, nz),
        mesh: null, rung: i, pitch, face: 'south',
      });
    }
  });
  if (holds) rec.handholds = list;
  return { wall: { z, top, rec }, rec, list };
}

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
const VENT_HALF = 2.5;                      // half-width of the census vent — see `censusSetup`

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

function hookItem() {
  return { tag: 'hook', rec: { id: 'ring', mesh: { userData: {} } }, point: () => V(0, 8, -6), tangent: V(0, 1, 0) };
}
function poleItem() {
  return {
    tag: 'pole',
    rec: { id: 'pole', mesh: { userData: { bottom: 0, top: 12 }, geometry: { parameters: { radiusTop: 0.5 } } } },
    point: (p) => V(0, Math.min(12, Math.max(0, p.y)), -6), tangent: V(0, 1, 0),
  };
}
function spireItem() {
  return { tag: 'spire', rec: { id: 'tip', mesh: { userData: {} } }, point: () => V(0, 6, -6), tangent: V(0, 1, 0) };
}
const BLANK_WALL = () => ({ z: -10, top: 40, rec: { id: 'blank-face' } });
const LEDGE_WALL = () => ({ z: -10, top: 4, rec: { id: 'lip' } });

/** One world and one starting pose per state. */
function censusSetup(name) {
  const air = (y = 10) => ({ col: {}, place(c) { c.position.set(0, y, 0); c.velocity.set(0, 0, 0); c.grounded = false; } });
  const ground = () => ({ col: {}, place(c) { c.position.set(0, 0, 0); c.velocity.set(0, 0, 0); c.grounded = true; } });
  switch (name) {
    case 'hookSwing':
      return { col: { points: [hookItem()] }, place(c) { c.position.set(0, 5.9, -6); c.velocity.set(4, 0, 0); c.grounded = false; } };
    case 'railSlide': case 'railWalk':
      return {
        col: { points: railPoints(V(-14, 5, -6), V(14, 5, -6), 28) },
        place(c) { c.position.set(0, 5, -6); c.velocity.set(6, 0, 0); c.grounded = false; },
      };
    case 'poleClimb': case 'poleSwing':
      return { col: { points: [poleItem()] }, place(c) { c.position.set(0, 4, -5.2); c.velocity.set(0, 0, 0); c.grounded = false; } };
    case 'spireLand':
      return { col: { points: [spireItem()] }, place(c) { c.position.set(0, 6.2, -6); c.velocity.set(0, -1, 0); c.grounded = false; } };
    case 'ledgeHang': case 'ledgeClimb':
      return {
        col: { wall: LEDGE_WALL() },
        place(c) {
          c.position.set(0, 4 - TUNE.hangDrop, -9.67); c.velocity.set(0, 0, 0); c.grounded = false;
          c.probeLedge(V(0, 0, -1));
        },
      };
    case 'wallClimb':
      return {
        col: { wall: ladderWall({ rungs: 6 }).wall },
        place(c) {
          c.position.set(0, PITCH - TUNE.hangReach, -9.61); c.velocity.set(0, 0, 0); c.grounded = false;
          c.probeWall(V(0, 0, -1));
        },
      };
    case 'wallRun': case 'wallCling': case 'wallJump':
      return {
        col: { wall: BLANK_WALL() },
        place(c) {
          c.position.set(0, 5, -9.6); c.velocity.set(0, 2, -5); c.grounded = false;
          c.probeWall(V(0, 0, -1));
        },
      };
    case 'toTarget':
      return {
        col: {},
        place(c) {
          c.position.set(0, 7, -3); c.velocity.set(0, 0, -6); c.grounded = false;
          c.addTarget({ id: 'census', point: V(0, 6, -6), volume: 6, catch: 6 });
          c.targets.acquire();
        },
      };
    /* A FINITE vent, because that is what the level authors — the four shipped vent colliders
       are tunnels (1.35 × 1.20 × 10.60 m and smaller), not regions. An infinite one reports
       `crawl` as a trap, which is a statement about the harness and not about the moveset. */
    case 'crawl':
      return {
        col: { groundTag: (p) => (Math.abs(p.x) <= VENT_HALF && Math.abs(p.z) <= VENT_HALF ? 'vent' : 'ground') },
        place: ground().place,
      };
    case 'tiptoe':  return { col: { narrow: 0.5 }, place: ground().place };
    case 'combatStrafe': case 'pickpocket':
      return { col: { guards: stubGuards(V(0, 0, -2.0)) }, place: ground().place };
    case 'land':
      return { col: {}, place(c) { c.position.set(0, 0, 0); c.velocity.set(0, 0, 0); c.grounded = true; c.landImpact = 6; } };
    case 'skid':
      return { col: {}, place(c) { c.position.set(0, 0, 0); c.velocity.set(0, 0, 6); c.grounded = true; } };
    case 'roll': case 'combo':
      return { col: {}, place(c) { c.position.set(0, 0, 0); c.velocity.set(0, 0, -6); c.grounded = true; } };
    case 'dive': case 'fall': case 'jump': case 'doubleJump': case 'paraglide': case 'bounce': case 'hurt':
      return air(12);
    default:
      return ground();
  }
}

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
async function realWorld() {
  const { Architecture } = await import('../src/world/Architecture.js');
  const { Collision } = await import('../src/world/Collision.js');
  const engine = stubEngine();
  const queued = [];
  let collision = null, arch = null;
  const guardBody = { position: V(0, 0, 28), pocketPosition: V(0, 1, 28), headY: 1.6, state: 'patrol' };
  engine.get = (m) => (m === 'collision' ? collision : m === 'architecture' ? arch
    : m === 'guards' ? { nearest: () => guardBody, nearestPickpocketTarget: () => guardBody } : null);
  engine.registerCollider = (mesh, opts = {}) => {
    const rec = { mesh, tag: opts.tag || 'ground', climbable: !!opts.climbable, material: opts.material || 'stone', oneWay: !!opts.oneWay, ...opts };
    if (collision?.add) collision.add(rec); else queued.push(rec);
    return rec;
  };
  arch = new Architecture(engine);
  await arch.init();
  collision = new Collision(engine);
  for (const r of queued) collision.add(r);
  await collision.init();
  const c = new Controller(engine);
  await c.init();
  return { engine, c, arch, collision };
}

/** Reset every scrap of per-run state, including the guards this lane added to the states. */
function hardReset(engine, c, pos, yaw = Math.PI) {
  c.teleport(pos.clone(), yaw);
  c.velocity.set(0, 0, 0);
  c.airJumps = 1; c.wallRunUsed = 0; c.freeWall();
  c.hangLock = 0; c.poleLock = 0; c.spireLock = 0; c.landImpact = 0;
  c.comboIndex = 0; c.comboTimer = 0;
  c.targets.release('probe');
  for (const t of c.targets.list) t.cooldown = 0;
  /* The state instances hold guards of their own — `WallClimb._left/_line`, `HookSwing._spent`,
     `RailSlide._offRec`. Leaving them set between probes made a standoff sweep read as
     alternating success/failure and cost me an hour before I recognised the shape. A player
     never teleports between rungs; a probe harness does. */
  const wc = c.sm.get('wallClimb'); if (wc) { wc._left = null; wc._line = null; wc._hold = null; wc._pick = null; }
  const hs = c.sm.get('hookSwing'); if (hs) hs._spent = false;
  const rs = c.sm.get('railSlide'); if (rs) rs._offRec = null;
  engine.input.clear?.();
  engine.events.length = 0;
}

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

test('reach: wallClimb climbs the shipped ladder, but its authored entry is out of range', async () => {
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

  /* 2. The entry. The ladder is not meant to be walked to — there is an authored magnetism
        target at its foot, `notch-pylon-e-mouth`, `arrive: 'wallClimb'`. So the question is not
        "is there floor under it" (my first pass asked that, with an acceptance window that
        rejected any surface ABOVE the rung's hang height, and got a wrong answer). The question
        is whether a player can get inside the target's `volume` from anywhere they can stand.

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
  let nearest = null;
  for (let dx = -12; dx <= 12; dx += 1) for (let dz = -12; dz <= 12; dz += 1) {
    const s = standable(M.point.x + dx, M.point.z + dz);
    if (!s) continue;
    s.d = Math.hypot(s.x - M.point.x, s.y - M.point.y, s.z - M.point.z);
    if (!nearest || s.d < nearest.d) nearest = s;
  }
  const vol = M.volume ?? TUNE.magVolume;
  console.log(`\n[reach] entry target ${M.id} at ${M.point.toArray().map((v) => v.toFixed(2)).join(',')} ` +
              `arrive=${M.arrive} volume=${vol} catch=${M.catch ?? TUNE.magCatch}`);
  console.log(`[reach] nearest STANDABLE ground: ${nearest ? `(${nearest.x.toFixed(1)}, ${nearest.y.toFixed(2)}, ${nearest.z.toFixed(1)}) at ${nearest.d.toFixed(2)} m` : 'none within 12 m'}`);
  if (nearest) {
    console.log(`[reach] acquisition needs the player within volume ${vol} m; the gap is ` +
                `${(nearest.d - vol).toFixed(2)} m of ${nearest.d > vol ? 'unreachable' : 'reachable'} air`);
  }
  /* Reported, not asserted, in both directions: asserting "unreachable" would land red the day
     the world lane adds an approach, which is the outcome we want. What IS asserted is the pair
     that makes the report mean anything — the ladder exists, and the state climbs it. */
  assert.ok(holds.length >= 10, 'the ladder shrank; the reachability question has changed');
});

test('rope: the authored hall-cable is crossed under the player\'s own power', async () => {
  /* §371.2 predicted a rope needs no new state, only that `RailSlide.enter`'s hard
     `TUNE.railSpeed` mount floor come from the rail instead. The world lane authored the rail —
     `hall-cable`, a real catenary — and this is that one line, measured on it.
     One lever: `rec.mountSpeed`. */
  const { engine, c, collision } = await realWorld();
  const rope = collision.recs.find((r) => r.tag === 'rail' && Number.isFinite(r.mountSpeed));
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
  assert.ok(slack.length > 600, `authored rope threw the player off after ${slack.length} frames`);
  assert.ok(Math.max(...slack.map((t) => t.sp)) < TUNE.railSpeed * 0.5,
    'the authored rope is still being ridden at slide speed');
  assert.ok(span(slack) > 0.8, `only crossed ${(span(slack) * 100).toFixed(0)}% of the rope under own power`);
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
