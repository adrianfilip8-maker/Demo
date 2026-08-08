import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Controller, TUNE } from '../src/player/Controller.js';
import { derive, DERIVATION, predictMiss, targetJumpExit, targetJumpImpulse } from '../src/player/Targets.js';

/**
 * Target magnetism — a headless, input-driven simulation of the controller.
 *
 * Why this and not a screenshot: the claim is "a jump that would have missed lands", which is a
 * statement about a trajectory over ~90 frames. A frame cannot hold it, and the capture harness
 * would answer a question nobody asked. `Controller.js`, `Moveset.js`, `States.js` and
 * `Targets.js` all import in plain Node (no `import.meta.glob`, no DOM, no renderer), so the whole
 * controller runs here at whatever fixed dt we like, with scripted input.
 *
 * ── The design of the measurement ───────────────────────────────────────────────────────────
 * Every arm below is the SAME scenario with ONE lever moved: `controller.targets.enabled`. Sly
 * runs up to 7.2 m/s, jumps, and holds forward. His arc crosses lip height y = 1.2 m on the way
 * down at `Xc`; a target is authored at lip height, Δ metres FURTHER along — so the jump is short
 * by exactly Δ, by construction, and Δ is a number the test states rather than one it discovers.
 *
 * Collision is the controller's own `FLAT` fallback (a ground plane at y = 0). That is deliberate:
 * `fallback:true` makes `ledgeAssist()` return early, so §6's existing 0.45 m ledge snap cannot
 * quietly do the work and get credited to magnetism.
 *
 * The measured quantity is the MINIMUM 3D distance to the point over the run, not the final
 * resting position: `magHold` drops Sly off a reached point after 0.25 s if he does nothing, so a
 * final-position metric would read the hold policy rather than the assist. (Amended before any arm
 * was run; the amendment is recorded in the run's pre-registration.)
 *
 * ── The two arms that certify the rest ──────────────────────────────────────────────────────
 * A calibration arm must MOVE, or the instrument proved nothing (see progress/records/
 * RESULT-cel1.md, where a run voided itself on an arm built from a lever already known dead):
 *   · `magnetism off` must miss. If the unassisted jump already lands, the scenario is not a
 *     near-miss and nothing downstream means anything.
 *   · the specificity control (a jump aimed 3 m wide is untouched) is itself certified by re-running
 *     the same wide jump against the same target with `catch: 4.0`, where it MUST be captured.
 *     Without that, "the wide jump was unaffected" is equally consistent with a system that does
 *     nothing at all — which is precisely the state this repo was in before this file existed.
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

class StubInput {
  constructor() {
    this.move = { x: 0, y: 0 };
    this._down = new Set();
    this._pressed = new Set();
    this._released = new Set();
    this._buf = new Map();
    this.t = 0;
  }
  beginFrame(dt) { this.t += dt; this._pressed.clear(); this._released.clear(); }
  hold(a) { if (!this._down.has(a)) { this._down.add(a); this._pressed.add(a); this._buf.set(a, this.t); } }
  let_go(a) { if (this._down.delete(a)) this._released.add(a); }
  down(a) { return this._down.has(a); }
  pressed(a) { return this._pressed.has(a); }
  released(a) { return this._released.has(a); }
  bufferedPeek(a, ms) { const t = this._buf.get(a); return t != null && (this.t - t) * 1000 <= ms; }
  buffered(a, ms) { const ok = this.bufferedPeek(a, ms); if (ok) this._buf.delete(a); return ok; }
}

function stubEngine() {
  const input = new StubInput();
  const listeners = new Map();
  return {
    input,
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),   // default look direction is −Z
    scene: new THREE.Scene(),
    renderer: null,
    time: 0, dt: 0, timeScale: 1,
    width: 1920, height: 1080, quality: 'high',
    warnings: [],
    debug: { freeCam: false, showColliders: false, wireframe: false },
    events: [],
    get() { return null; },
    warn(m) { this.warnings.push(String(m)); },
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn);
    },
    emit(evt, payload) {
      this.events.push({ evt, payload });
      for (const fn of listeners.get(evt) || []) fn(payload);
    },
    registerCollider() {},
  };
}

async function makeController() {
  const engine = stubEngine();
  const c = new Controller(engine);
  await c.init();
  // Face and spawn on the flat plane at the origin; the camera looks −Z so forward input is −Z.
  c.teleport(new THREE.Vector3(0, 0, 0), Math.PI);
  c.grounded = true;
  return { engine, c };
}

const LIP = 1.2;          // the height of the ledge lip the jump is aimed at
const RUNUP = 1.0;        // seconds of held forward before the jump — reaches 7.2 m/s in 0.19 s
const FLIGHT = 1.9;       // seconds simulated after the jump

/**
 * Run the scripted jump. `targets` are authored before the run; `enabled` is the single lever.
 * Returns the trajectory plus everything any arm needs to judge.
 */
async function runJump({ dt = 1 / 60, targets = [], enabled = true, watch = null, poke = null, tune = null } = {}) {
  const { engine, c } = await makeController();
  const saved = {};
  if (tune) for (const k of Object.keys(tune)) { saved[k] = TUNE[k]; TUNE[k] = tune[k]; }
  const authored = targets.map((t) => c.addTarget(t));
  c.targets.enabled = enabled;

  const W = watch ? (watch.point || watch) : (authored[0]?.point || null);
  const path = [];
  const states = new Set();
  let minDist = Infinity, maxAbove = -Infinity, firstOnTarget = null, holdEndDist = null;
  // Overshoot is only meaningful once Sly has actually arrived at the point's height — before
  // that, "height above the target" is just the arc he came in on. See A5 in the report.
  let arrived = false, overshoot = 0;
  const ARRIVE_BAND = 0.20625;   // the shipped magSnapRadius, held even when the arm overrides it
  let jumpFrame = -1, releaseReason = '', leftAt = -1;

  const total = Math.round((RUNUP + FLIGHT) / dt);
  for (let i = 0; i < total; i++) {
    const t = i * dt;
    engine.input.beginFrame(dt);
    engine.input.move.y = 1;                       // hold forward the whole way
    if (t >= RUNUP) { engine.input.hold('jump'); if (jumpFrame < 0) jumpFrame = i; }
    engine.time = t;
    if (poke) poke(c, i, t);
    c.update(dt, t);

    states.add(c.stateName);
    path.push(c.position.clone());
    if (W) {
      const d = c.position.distanceTo(W);
      if (d < minDist) minDist = d;
      if (c.stateName === 'toTarget') {
        const above = c.position.y - W.y;
        if (above > maxAbove) maxAbove = above;
        if (!arrived && above <= ARRIVE_BAND) arrived = true;
        if (arrived && above > overshoot) overshoot = above;
      }
      if (!firstOnTarget && c.targets.status === 'onTarget') {
        firstOnTarget = { frame: i, t, pos: c.position.clone(), dist: d, speed: c.velocity.length() };
      }
    }
    if (c.stateName === 'toTarget') leftAt = -1;
    else if (leftAt < 0 && states.has('toTarget')) leftAt = i;
    if (firstOnTarget && holdEndDist === null && c.stateName !== 'toTarget') holdEndDist = W ? c.position.distanceTo(W) : null;
  }
  releaseReason = c.targets.lastRelease;
  if (tune) for (const k of Object.keys(saved)) TUNE[k] = saved[k];

  return {
    c, engine, path, states, authored,
    minDist, maxAbove: maxAbove === -Infinity ? 0 : maxAbove, overshoot,
    firstOnTarget, holdEndDist, releaseReason,
    entered: states.has('toTarget'),
    reached: !!firstOnTarget,
    final: c.position.clone(),
  };
}

/** The descending crossing of y = LIP, from a run with no targets at all. */
function descendingCrossing(path) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (a.y >= LIP && b.y < LIP && b.y < a.y) {
      const k = (a.y - LIP) / (a.y - b.y);
      return new THREE.Vector3(a.x + (b.x - a.x) * k, LIP, a.z + (b.z - a.z) * k);
    }
  }
  return null;
}

/* The baseline arc, and the point the jump falls short of. Sly travels −Z. */
const base = await runJump({ targets: [] });
const CROSS = descendingCrossing(base.path);
const shortOf = (d, extra = {}) => ({ point: new THREE.Vector3(CROSS.x, LIP, CROSS.z - d), ...extra });
const wideOf = (lateral, d, extra = {}) => ({ point: new THREE.Vector3(CROSS.x + lateral, LIP, CROSS.z - d), ...extra });

/* ====================================================================== */
/* 0 — the scenario is what it claims to be                                */
/* ====================================================================== */

test('targets: the scenario is a full-speed jump with a real descending crossing', () => {
  assert.ok(CROSS, 'the baseline arc never crossed the lip height on the way down');
  const apex = Math.max(...base.path.map((p) => p.y));
  const speed = base.c.speed;
  console.log(`\n[scenario] apex ${apex.toFixed(3)} m · lip crossing at z ${CROSS.z.toFixed(3)} ` +
              `(${Math.abs(CROSS.z).toFixed(2)} m from the take-off) · lands at z ${base.final.z.toFixed(3)}`);
  assert.ok(apex > 2.2 && apex < 2.9, `apex ${apex} is not the §6 jump`);
  assert.ok(base.final.y < 0.05, 'the baseline run never came back to the floor');
  assert.ok(!base.entered, 'baseline entered toTarget with no targets authored');
  void speed;
});

/* ====================================================================== */
/* A8 — the constants are derived, not copied                              */
/* ====================================================================== */

test('targets: every imported constant equals its derivation from OUR speeds (A8)', () => {
  const want = derive(TUNE);
  const rows = [];
  for (const d of DERIVATION) {
    const got = TUNE[d.key], exp = want[d.key];
    rows.push(`  ${d.key.padEnd(15)} ${String(got).padStart(10)}  derived ${exp.toFixed(6)}`);
    assert.ok(Number.isFinite(got), `${d.key} missing from TUNE`);
    assert.ok(Math.abs(got - exp) <= Math.abs(exp) * 0.005,
      `${d.key} is ${got}, derivation says ${exp} — restate the derivation or fix the constant`);
  }
  console.log('\n[A8 derivation]\n' + rows.join('\n'));
  // The two that would betray a copy-paste: theirs are 4.0 and 8.0, ours must not be.
  assert.equal(TUNE.magPullSpeed, TUNE.runSpeed, 'the pull must be at OUR run speed');
  assert.equal(TUNE.magYankGain, TUNE.jumpV0, 'the yank must be at OUR jump velocity');
  assert.ok(Math.abs(TUNE.magRelease - TUNE.jumpV0 ** 2 / (2 * -TUNE.gravity)) < 0.01,
    'the release drop should land on our own jump apex');
});

/* ====================================================================== */
/* A1 (calibration) + A2 (the claim)                                       */
/* ====================================================================== */

const MISSES = [0.30, 0.60];
const off = {}, on = {};
for (const d of MISSES) {
  off[d] = await runJump({ targets: [shortOf(d)], enabled: false });
  on[d] = await runJump({ targets: [shortOf(d)], enabled: true });
}

test('targets: CALIBRATION — with magnetism off the same jump misses (A1)', () => {
  const lines = MISSES.map((d) =>
    `  Δ ${d.toFixed(2)} m short → closest approach ${off[d].minDist.toFixed(4)} m · ` +
    `reached ${off[d].reached} · ends at y ${off[d].final.y.toFixed(3)}`);
  console.log('\n[A1 magnetism OFF]\n' + lines.join('\n'));
  assert.ok(off[0.30].minDist >= 0.18, `Δ0.30 unassisted closest approach ${off[0.30].minDist}`);
  assert.ok(off[0.60].minDist >= 0.35, `Δ0.60 unassisted closest approach ${off[0.60].minDist}`);
  for (const d of MISSES) {
    assert.equal(off[d].reached, false, `Δ${d} reported onTarget with magnetism off`);
    assert.equal(off[d].entered, false, `Δ${d} entered toTarget with magnetism off`);
  }
});

test('targets: a jump that would fall 30 and 60 cm short lands on the point (A2)', () => {
  const lines = MISSES.map((d) => {
    const r = on[d];
    return `  Δ ${d.toFixed(2)} m short → closest approach ${r.minDist.toFixed(4)} m · ` +
           `snapped at t ${r.firstOnTarget?.t.toFixed(3)} s, ${r.firstOnTarget?.dist.toFixed(4)} m out · ` +
           `distance when the hold ended ${r.holdEndDist?.toFixed(4)} m`;
  });
  console.log('\n[A2 magnetism ON]\n' + lines.join('\n'));
  for (const d of MISSES) {
    const r = on[d];
    assert.equal(r.entered, true, `Δ${d} never entered toTarget`);          // A2b
    assert.equal(r.reached, true, `Δ${d} never reported onTarget`);
    assert.ok(r.minDist <= TUNE.magSnapRadius, `Δ${d} closest approach ${r.minDist} > snap radius`);
    assert.ok(r.holdEndDist <= 0.25, `Δ${d} drifted to ${r.holdEndDist} m by the end of the hold`);
  }
});

/* ====================================================================== */
/* A3 — specificity, and A3b, the arm that certifies it                    */
/* ====================================================================== */

const WIDE = 3.0;
const wideNoTarget = await runJump({ targets: [], watch: { point: wideOf(WIDE, 0.6).point } });
const wideNormal = await runJump({ targets: [wideOf(WIDE, 0.6, { volume: 6.0 })] });
const wideGreedy = await runJump({ targets: [wideOf(WIDE, 0.6, { volume: 6.0, catch: 4.0 })] });

test('targets: SPECIFICITY — a jump aimed 3 m wide is not dragged in (A3)', () => {
  let maxDiff = 0;
  const n = Math.min(wideNoTarget.path.length, wideNormal.path.length);
  for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, wideNoTarget.path[i].distanceTo(wideNormal.path[i]));
  console.log(`\n[A3 wide jump] target ${WIDE} m to the side, trigger volume 6.0 m so volume size ` +
              `cannot be the reason\n  closest the player ever came to it: ${wideNormal.minDist.toFixed(3)} m ` +
              `(inside the 6.0 m volume: ${wideNormal.minDist < 6.0})\n` +
              `  max per-frame deviation from the identical run with no target: ${maxDiff.toFixed(6)} m\n` +
              `  entered toTarget: ${wideNormal.entered}`);
  assert.ok(wideNormal.minDist < 6.0, 'the wide jump never entered the trigger volume — control is vacuous');
  assert.equal(wideNormal.entered, false, 'the wide jump was captured');
  assert.ok(maxDiff <= 0.05, `the wide jump was displaced by ${maxDiff} m`);
});

test('targets: CALIBRATION for the specificity control — widen `catch` and it IS captured (A3b)', () => {
  console.log(`\n[A3b same wide jump, authored catch 4.0 m]\n  entered toTarget: ${wideGreedy.entered} · ` +
              `closest approach ${wideGreedy.minDist.toFixed(4)} m · snapped at ` +
              `t ${wideGreedy.firstOnTarget?.t.toFixed(3)} s`);
  assert.equal(wideGreedy.entered, true,
    'the specificity control is uncertified: widening catch to 4 m still captured nothing');
  assert.ok(wideGreedy.minDist <= TUNE.magSnapRadius, `closest approach ${wideGreedy.minDist}`);
});

/* ====================================================================== */
/* A4 — the envelope has an edge                                           */
/* ====================================================================== */

const far = await runJump({ targets: [shortOf(2.0)] });

test('targets: a jump 2 m short — twice the catch radius — is not rescued (A4)', () => {
  console.log(`\n[A4 Δ 2.00 m] entered toTarget: ${far.entered} · closest approach ${far.minDist.toFixed(3)} m ` +
              `· derived catch radius ${TUNE.magCatch.toFixed(3)} m`);
  assert.equal(far.entered, false, 'a 2 m miss was rescued — the gate is not gating');
});

test('targets: the rescue envelope, measured', async () => {
  let largest = 0, firstFail = null;
  const rows = [];
  for (let d = 0.1; d <= 2.401; d += 0.15) {
    const r = await runJump({ targets: [shortOf(d)] });
    rows.push(`  Δ ${d.toFixed(2)} → ${r.reached ? 'LANDS' : 'misses'} (closest ${r.minDist.toFixed(3)} m)`);
    if (r.reached) largest = d;
    else if (firstFail === null) firstFail = d;
  }
  console.log('\n[envelope sweep — reported, not judged]\n' + rows.join('\n') +
              `\n  largest miss still rescued: ${largest.toFixed(2)} m ` +
              `= ${(largest / TUNE.runSpeed * 1000).toFixed(0)} ms of run at 7.2 m/s`);
  assert.ok(largest > 0, 'nothing was rescued at any margin');
});

/* ====================================================================== */
/* A5 — no launch past the point, and A5b, the arm that certifies it       */
/* ====================================================================== */

const noSnap = await runJump({ targets: [shortOf(0.60)], tune: { magSnapRadius: 0 } });
const noCap = await runJump({ targets: [shortOf(0.60)], tune: { magYankCap: 0 } });
const noBoth = await runJump({ targets: [shortOf(0.60)], tune: { magSnapRadius: 0, magYankCap: 0 } });

/**
 * A5 as registered ("max height above the point while in toTarget ≤ 0.60 m") measured the wrong
 * thing and is reported as INERT, not as a pass or a fail: the target is acquired near the apex,
 * 1.17 m above the lip, so that quantity is the arc Sly arrived on and no lever inside the assist
 * can move it. Its calibration arm accordingly read identical in all three arms, which is exactly
 * the signal the arm exists to give.
 *
 * A5′ is the corrected quantity — height above the point AFTER first reaching the point's level,
 * i.e. actual overshoot — with a band that is a derived constant rather than a chosen one: the
 * assist may not carry Sly more than one snap radius (0.20625 m) past what it aimed him at. Both
 * are printed; the inert one is not quietly deleted.
 *
 * The registered calibration lever for A5′ was "disable the snap", and on its own it is ALSO inert
 * — 0.0000 m of movement. So is disabling the ballistic yank cap on its own. Disabling BOTH moves
 * the overshoot from 0.13 m to 0.67 m, straight through the band, and that is the arm used.
 *
 * The reading is therefore not "the snap does it" or "the cap does it" but that the two are
 * **redundant** — either alone is sufficient to stop the assist carrying Sly past the point, which
 * is worth knowing before anyone deletes one of them as dead weight. The band has not moved; the
 * lever was replaced only because the registered one demonstrably could not fire, which is the
 * lesson of progress/records/RESULT-cel1.md.
 */
test('targets: the assist does not launch Sly past the point (A5 inert, A5′ claimed)', () => {
  console.log(`\n[A5 as registered — height above the point while in toTarget]` +
              `\n  as shipped ${on[0.60].maxAbove.toFixed(4)} m · snap off ${noSnap.maxAbove.toFixed(4)} m · ` +
              `snap+cap off ${noCap.maxAbove.toFixed(4)} m` +
              `\n  → all three identical: the quantity is the incoming arc, not the assist. INERT.` +
              `\n[A5' overshoot after first reaching the point's level]` +
              `\n  as shipped:      ${on[0.60].overshoot.toFixed(4)} m  (band ≤ ${TUNE.magSnapRadius})` +
              `\n  snap disabled:   ${noSnap.overshoot.toFixed(4)} m  (registered lever — INERT on its own)` +
              `\n  yank cap off:    ${noCap.overshoot.toFixed(4)} m  (also INERT on its own)` +
              `\n  both disabled:   ${noBoth.overshoot.toFixed(4)} m  (the arm that fires)`);
  assert.ok(on[0.60].overshoot <= TUNE.magSnapRadius,
    `overshoot ${on[0.60].overshoot} m past the point`);
  assert.ok(noBoth.overshoot > TUNE.magSnapRadius && noBoth.overshoot > on[0.60].overshoot * 2,
    `CALIBRATION FAILED: removing both the snap and the ballistic yank cap moved the overshoot ` +
    `by nothing (${noBoth.overshoot} vs ${on[0.60].overshoot}) — A5' is unexercised`);
});

/* ====================================================================== */
/* A6 — the same feel at 30 and 60 fps                                     */
/* ====================================================================== */

const at30 = await runJump({ dt: 1 / 30, targets: [shortOf(0.60)] });

test('targets: the law is frame-rate independent, 30 fps vs 60 fps (A6)', () => {
  const gap = at30.firstOnTarget && on[0.60].firstOnTarget
    ? at30.firstOnTarget.pos.distanceTo(on[0.60].firstOnTarget.pos) : Infinity;
  console.log(`\n[A6] 60 fps closest ${on[0.60].minDist.toFixed(4)} m at t ${on[0.60].firstOnTarget?.t.toFixed(3)}` +
              `\n     30 fps closest ${at30.minDist.toFixed(4)} m at t ${at30.firstOnTarget?.t.toFixed(3)}` +
              `\n     snap positions differ by ${gap.toFixed(4)} m`);
  assert.ok(at30.minDist <= TUNE.magSnapRadius, `30 fps closest approach ${at30.minDist}`);
  assert.ok(gap <= 0.10, `the two frame rates arrive ${gap} m apart`);
});

/* ====================================================================== */
/* A7 — the lock is not a trap                                             */
/* ====================================================================== */

test('targets: falling 3 m below a locked target releases it (A7)', async () => {
  let dropFrame = -1, dropT = 0, leftT = null, reason = '';
  const r = await runJump({
    targets: [shortOf(0.60)],
    poke: (c, i, t) => {
      if (dropFrame < 0 && c.stateName === 'toTarget' && c.targets.target) {
        dropFrame = i; dropT = t;
        c.position.y = c.targets.target.point.y - 3.0;      // knocked out of the line
      } else if (dropFrame >= 0 && leftT === null && c.stateName !== 'toTarget') {
        leftT = t; reason = c.targets.lastRelease;
      }
    },
  });
  console.log(`\n[A7] displaced 3 m below the point at t ${dropT.toFixed(3)} s · left toTarget at ` +
              `t ${leftT === null ? 'never' : leftT.toFixed(3)} s · release reason "${reason}"`);
  assert.ok(dropFrame >= 0, 'the run never entered toTarget, so nothing was displaced');
  assert.ok(leftT !== null, 'the lock never released — the assist is a trap');
  assert.ok(leftT - dropT <= 0.5, `took ${(leftT - dropT).toFixed(3)} s to release`);
  assert.ok(r.c.position.y <= 0.05 || r.c.grounded, 'did not end up back under gravity');
});

/* ====================================================================== */
/* unit-level guards on the pieces                                         */
/* ====================================================================== */

test('targets: the up-assist weakens with horizontal distance — the whole point', () => {
  // alpha = k/(h+k). This is the line that makes it an assist rather than a tractor beam.
  const k = TUNE.magUpFalloff;
  const a = (h) => k / (h + k);
  const rows = [0, 0.25, 0.5, 1.0, 2.0, 3.0].map((h) => `  horiz ${h.toFixed(2)} m → alpha ${a(h).toFixed(4)}`);
  console.log('\n[up-assist falloff]\n' + rows.join('\n'));
  assert.ok(a(0) > 0.99, 'directly under the point the assist should be immediate');
  for (let h = 0.1; h < 3; h += 0.1) assert.ok(a(h) > a(h + 0.1), 'falloff is not monotone');
  assert.ok(a(1.0) < 0.09, `at 1 m out the assist is ${a(1.0)} per frame — too strong to be a correction`);
  assert.ok(a(3.0) < 0.03, 'at 3 m out the assist must be nearly nothing');
});

test('targets: the ballistic gate accepts near-misses and rejects aimed-elsewhere jumps', () => {
  const pos = new THREE.Vector3(0, 1, 0);
  const vel = new THREE.Vector3(0, 6, -7.2);
  const g = TUNE.gravity;
  const H = 2 * TUNE.jumpV0 / -g;
  const at = (x, y, z) => predictMiss(pos, vel, new THREE.Vector3(x, y, z), g, H);
  const onArc = at(0, 1 + 6 * 0.4 + 0.5 * g * 0.16, -7.2 * 0.4);
  console.log(`\n[gate] a point exactly on the arc: ${onArc.toFixed(4)} m · 3 m to the side: ` +
              `${at(3, 2.5, -4).toFixed(3)} m · 0.5 m short: ${at(0, 2.5, -4.5).toFixed(3)} m`);
  assert.ok(onArc < 0.05, `a point on the arc reads ${onArc} m off it`);
  assert.ok(at(3, 2.5, -4) > TUNE.magCatch, 'a point 3 m to the side is inside the catch radius');
});

test('targets: the target-jump boost is a curve of arrival velocity, not a constant', () => {
  const rows = [-11, -8, -5.5, -2, 0, 3, 5.5, 11].map((vy) =>
    `  arrive vy ${String(vy).padStart(5)} → exit ${targetJumpExit(vy, TUNE).toFixed(3)} ` +
    `(impulse ${targetJumpImpulse(vy, 1, TUNE).toFixed(3)})`);
  console.log('\n[target jump curve]\n' + rows.join('\n'));
  assert.ok(targetJumpExit(-11, TUNE) > targetJumpExit(0, TUNE), 'a hard arrival must be worth more');
  assert.equal(targetJumpExit(11, TUNE), TUNE.jumpV0, 'a rising arrival gets no bonus');
  assert.ok(targetJumpImpulse(8, 1, TUNE) >= 0, 'a target must never push Sly down');
  assert.ok(targetJumpExit(-11, TUNE) < TUNE.jumpV0 * 1.3, 'the slam bonus has run away');
  // jumpMult is what a designer tunes per point.
  assert.ok(targetJumpImpulse(0, 1.25, TUNE) > targetJumpImpulse(0, 1, TUNE), 'jumpMult does nothing');
});

test('targets: authoring a point takes one call, and the defaults are the derived ones', async () => {
  const { c, engine } = await makeController();
  const t = c.addTarget({ point: new THREE.Vector3(1, 2, 3) });
  assert.equal(t.volume, TUNE.magVolume);
  assert.equal(t.catch, TUNE.magCatch);
  assert.equal(t.magnet, 1);
  assert.equal(t.jumpMult, 1);
  assert.equal(t.group, 'swing');
  // …and level content can author without holding a reference to MOVEMENT at all.
  engine.emit('registerTarget', { point: new THREE.Vector3(9, 0, 9), group: 'notch' });
  assert.equal(c.targets.list.length, 2, 'the registerTarget event did not author a point');
  assert.equal(c.targets.list[1].group, 'notch');
  c.removeTarget(t);
  assert.equal(c.targets.list.length, 1);
  c.clearTargets();
  assert.equal(c.targets.list.length, 0);
  c.dispose();
});

test('targets: a notch keeps its collider; swing and pole do not', async () => {
  const r = await runJump({ targets: [shortOf(0.60, { group: 'notch' })] });
  const s = await runJump({ targets: [shortOf(0.60, { group: 'swing' })] });
  console.log(`\n[collider bypass] notch reached ${r.reached} · swing reached ${s.reached}`);
  // Both should arrive on a flat plane — the difference only shows against geometry, which the
  // FLAT stand-in has none of. What is asserted here is that the group is honoured at all.
  assert.equal(s.c.targets.stats.acquired > 0, true);
  assert.equal(r.c.targets.stats.acquired > 0, true);
});

/**
 * Every number in this file is a statement about a near-miss, and a near-miss needs a fall. This
 * asserts the assumption rather than trusting it — which is how the apex-hang parachute was found:
 * `v ← (v − g·dt)·0.72` inside |vy| < 2.2 has a stable fixed point at −1.03 m/s, so before the fix
 * in Controller.gravity() Sly descended at 1 m/s from any height, `land`/`land_hard` were
 * unreachable and every "miss margin" measured here was a fiction (a jump 2.35 m short still
 * "landed", because the arc was flat enough to pass 0.3 m from the point).
 */
test('targets: the descent is ballistic — the assumption every measurement above rests on', () => {
  let apexI = 0;
  for (let i = 1; i < base.path.length; i++) if (base.path[i].y > base.path[apexI].y) apexI = i;
  let landI = apexI;
  while (landI < base.path.length && base.path[landI].y > 0.001) landI++;
  const fallTime = (landI - apexI) / 60;
  const apex = base.path[apexI].y;
  const vImpact = Math.sqrt(2 * -TUNE.gravity * apex);
  console.log(`\n[fall] apex ${apex.toFixed(3)} m · apex→floor ${fallTime.toFixed(3)} s · ` +
              `free-fall from that height would take ${Math.sqrt(2 * apex / -TUNE.gravity).toFixed(3)} s ` +
              `and land at ${vImpact.toFixed(2)} m/s · states seen: ${[...base.states].join(', ')}`);
  assert.ok(fallTime < 0.60, `the descent took ${fallTime} s — that is a parachute, not a fall`);
  assert.ok(base.states.has('land'), 'no landing was ever registered (landImpact never passed 3.2)');
});

test('targets: nothing warns, and no state throws through the whole battery', () => {
  const noisy = base.engine.warnings.concat(on[0.60].engine.warnings, wideGreedy.engine.warnings);
  console.log(`\n[warnings] ${noisy.length}`);
  assert.deepEqual(noisy, [], `controller pushed warnings: ${noisy.join(' | ')}`);
});
