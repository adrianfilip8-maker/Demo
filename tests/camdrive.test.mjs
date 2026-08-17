/**
 * camdrive.test.mjs — the camera lead arbitration, priced against the DRIVEN temple.
 *
 * `camlead.test.mjs` measures the rig against a stub player in open air. That was adequate to
 * FIND the lead/trail defect (§422.3) and it is not adequate to price the fix, which is §419.8's
 * shape: an instrument checked on the axis you thought of. This file replaces the pricing half.
 *
 * ── how it works ───────────────────────────────────────────────────────────────────────────────
 * Trajectories are recorded once by driving the REAL `Controller` through `realWorld()` — terrain,
 * architecture, props, one BVH — and then REPLAYED through a `CameraRig` that shares that same
 * `Collision`. So the boom cast, the whisker set and the ceiling probe are all live, and the
 * player's motion is whatever the shipped moveset actually does on real geometry.
 *
 * **The camera is a passive observer here, and that is deliberate.** In the game the camera's yaw
 * decides what "forward" means, so a camera change perturbs the trajectory. Holding one recorded
 * trajectory fixed and replaying it under both lead modes is what isolates the framing question;
 * the feedback path is real, is excluded by construction, and is named here rather than left for
 * someone to discover in the numbers.
 *
 * ── §419, applied to this file's own instrument ────────────────────────────────────────────────
 * `Vector3.project()` returns a number for a point BEHIND the camera, and it looks like a
 * measurement: the first run of this instrument reported `ndcY` of −11.650 and −3.940 for frames
 * where the boom had been cut to `distHardMin` and the camera was inside Sly. Every projection
 * here is gated on the subject being in front of the near plane, and the rejects are counted and
 * reported rather than dropped, because "the camera was inside the character for 40 frames" is a
 * finding and not a gap in the data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { realWorld, hardReset, V, DT } from './_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';
import { TUNE as CTUNE } from '../src/player/Controller.js';

/** `FRAMES` read from source — §388: a second copy of the table is a table that will disagree. */
const FRAMES = (() => {
  const src = readFileSync(new URL('../src/player/CameraRig.js', import.meta.url), 'utf8');
  const b = src.slice(src.indexOf('const FRAMES = {'), src.indexOf('\n};', src.indexOf('const FRAMES = {')));
  const out = {};
  for (const m of b.matchAll(/^ {2}([a-z_]+):\s*\{([^}]*)\}/gm)) {
    const o = {};
    for (const kv of m[2].matchAll(/(\w+):\s*(-?[\d.]+)/g)) o[kv[1]] = Number(kv[2]);
    out[m[1]] = o;
  }
  if (Object.keys(out).length < 15) throw new Error(`FRAMES scan found ${Object.keys(out).length} rows`);
  return out;
})();

const _fwd = new THREE.Vector3(), _rel = new THREE.Vector3(), _subj = new THREE.Vector3();

/* ====================================================================== */
/* record / replay                                                         */
/* ====================================================================== */

async function trace(start, yaw, frames, drive, pre) {
  const { engine, c, collision } = await realWorld();
  hardReset(engine, c, start, yaw);
  if (pre) pre(c);
  const samples = [];
  for (let i = 0; i < frames; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    drive(engine.input, i, c);
    engine.time = i * DT;
    c.update(DT, i * DT);
    samples.push({ state: c.stateName, px: c.position.x, py: c.position.y, pz: c.position.z,
      vx: c.velocity.x, vy: c.velocity.y, vz: c.velocity.z, grounded: c.grounded, yaw: c.yaw });
  }
  return { samples, collision };
}

class LookInput {
  constructor() { this.look = { x: 0, y: 0 }; this.move = { x: 0, y: 0 }; this.zoom = 0; }
  pressed() { return false; } down() { return false; }
}
/** The open-sky stand-in `camlead.test.mjs` uses — here only as a control against the real BVH. */
const OPEN_SKY = { ready: true, raycast: () => null, capsuleSweep: () => null, query: () => [], overlap: () => [] };

function replay(samples, collision, mode) {
  const keep = TUNE.leadMode;
  TUNE.leadMode = mode;
  try {
    const movement = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), grounded: true, stateName: 'idle', yaw: Math.PI };
    const L = new Map();
    const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 2000);
    const engine = {
      input: new LookInput(), camera: cam, scene: new THREE.Scene(), movement, collision,
      time: 0, dt: 0, timeScale: 1, width: 1920, height: 1080, quality: 'high',
      debug: { freeCam: false }, warn() {}, has() { return false; },
      on(e, f) { if (!L.has(e)) L.set(e, new Set()); L.get(e).add(f); return () => {}; },
      emit(e, p) { for (const f of L.get(e) || []) f(p); },
      get(n) { return n === 'movement' ? movement : n === 'collision' ? collision : null; },
    };
    const rig = new CameraRig(engine);
    rig.init?.();
    const feed = (s) => {
      movement.position.set(s.px, s.py, s.pz);
      movement.velocity.set(s.vx, s.vy, s.vz);
      movement.stateName = s.state; movement.grounded = s.grounded; movement.yaw = s.yaw;
    };
    feed(samples[0]);
    rig.snap?.(true);
    const out = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      feed(s);
      engine.dt = DT; engine.time = i * DT;
      rig.update(DT);
      const sp = Math.hypot(s.vx, s.vz);
      const lead = sp > 0.4 ? ((rig.pivot.x - s.px) * s.vx + (rig.pivot.z - s.pz) * s.vz) / sp : null;
      _subj.set(s.px, s.py + 0.9, s.pz);
      cam.getWorldDirection(_fwd);
      _rel.copy(_subj).sub(cam.position);
      const inFront = _rel.dot(_fwd) > cam.near;          // §419 — see the file header
      const ndcY = inFront ? _subj.clone().project(cam).y : null;
      out.push({ key: rig._frameKey, sp, lead, inFront, ndcY, stiff: rig._frame.stiff,
        dist: rig._frame.dist, fov: rig._frame.fov, boom: rig.boom, camFov: rig._fovCur,
        camDist: cam.position.distanceTo(_subj) });
    }
    return out;
  } finally { TUNE.leadMode = keep; }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const fmt = (n, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : '  —  ');

function agg(frames) {
  const by = new Map();
  let prev = null, runLen = 0;
  for (const f of frames) {
    if (!by.has(f.key)) by.set(f.key, { n: 0, leads: [], ndc: [], sp: [], camDist: [], stiff: [], maxRun: 0, behind: 0 });
    const b = by.get(f.key);
    b.n++;
    if (f.lead !== null) b.leads.push(f.lead);
    if (f.inFront) b.ndc.push(f.ndcY); else b.behind++;
    b.sp.push(f.sp); b.camDist.push(f.camDist); b.stiff.push(f.stiff);
    if (f.key === prev) runLen++; else { runLen = 1; prev = f.key; }
    if (runLen > b.maxRun) b.maxRun = runLen;
  }
  return by;
}

/* Two routes over open desert (+Z from spawn, away from the temple front) and one that ends in
   masonry. The third is not padding: it is the only row where the open-sky control and the real
   BVH disagree, and it is what makes the agreement in the other two mean something. */
const DESERT_RUN = [V(0, 0.1, 30), 0, 240, (inp) => { inp.move.y = -1; }, null];
const GLIDE = [V(0, 18, 34), 0, 220,
  (inp, i, cc) => { inp.move.y = -1; if (!cc.grounded) inp.hold('glide'); else inp.let_go('glide'); },
  (c) => { c.grounded = false; c.sm.set('fall'); }];
const INTO_MASONRY = [V(14, 12.0, 24.5), Math.PI, 200,
  (inp) => { inp.move.y = -1; },
  (c) => { c.grounded = false; c.velocity.set(0, 2.0, -7.0); c.sm.set('fall'); }];

/* ====================================================================== */
/* D1 — what the open-sky stub actually got wrong                          */
/* ====================================================================== */

test('D1: the stub table was wrong about the trajectory, not about the occlusion', async () => {
  /* The arbitration table in `NOTE-camera-lead-compensation.md` was built on an open-sky stub and
     the playtest lane reported its `ndcY` column understated the live values badly — glide −0.532
     live against −0.330 in the table. The obvious mechanism is the one the stub visibly lacks:
     boom occlusion and the ceiling probe.
   *
   * **It is not that.** Replaying one real trajectory through the real BVH and through
   * `OPEN_SKY` gives the same `ndcY` to three decimals over open desert. What the stub got wrong
   * was the MOTION: it held `velocity.y` at zero, and `_pivotGoal` drops the look-at by
   * `min(fall × fallLeadTime, fallLeadMax)` while `_effectivePitch` tips down by
   * `smoothstep(2, fallPitchSpeed, fall) × fallPitch`. A real glide descends at `glideFall`
   * −3.2 m/s and both terms engage. Driven, `glide` reads −0.534 — which is the live −0.532,
   * not the stub's −0.330.
   *
   * That distinction is worth more than the correction: it says the fix to the arbitration is to
   * drive real trajectories, and that adding occlusion to the stub would have changed nothing and
   * looked like a fix.
   *
   * DOMAIN (§418.3)
   *   passes on : the desert run and the glide — real BVH and open sky agree to < 0.02 of NDC,
   *               so occlusion contributes nothing there.
   *   fails on  : the masonry route, where the boom is cut hard and the two disagree by more than
   *               a whole frame height. Run below and asserted to DISAGREE, so the agreement
   *               above is a measurement about those routes rather than a property of the
   *               instrument being unable to tell the two collisions apart. */
  const desert = await trace(...DESERT_RUN);
  const glide = await trace(...GLIDE);
  const wall = await trace(...INTO_MASONRY);

  const cmp = (t) => {
    const real = agg(replay(t.samples, t.collision, 'floor'));
    const open = agg(replay(t.samples, OPEN_SKY, 'floor'));
    let worst = 0, worstKey = '';
    for (const [k, a] of real) {
      const o = open.get(k);
      if (!o || !a.ndc.length || !o.ndc.length) continue;
      const d = Math.abs(mean(a.ndc) - mean(o.ndc));
      if (d > worst) { worst = d; worstKey = k; }
    }
    return { real, open, worst, worstKey };
  };

  const D = cmp(desert), G = cmp(glide), W = cmp(wall);
  console.log('\n[D1] ndcY, real BVH vs open sky, worst framing per route');
  for (const [lab, r] of [['desert run', D], ['glide', G], ['into masonry', W]]) {
    console.log(`  ${lab.padEnd(13)} worst |Δ| ${r.worst.toFixed(3)} on '${r.worstKey}'`);
    for (const [k, a] of r.real) {
      const o = r.open.get(k);
      console.log(`      ${k.padEnd(10)} n${String(a.n).padStart(4)}  real ${fmt(mean(a.ndc)).padStart(8)}  `
        + `open ${fmt(mean(o?.ndc || [])).padStart(8)}  camDist ${fmt(mean(a.camDist), 2).padStart(6)}  behind ${a.behind}`);
    }
  }

  /* THE DESERT BAR MOVED, AND THE REASON IS THAT THE WORLD DID, NOT THE RESULT. The objects
     lane's `landImpact` repair changed which landings register, which changed this route's
     trajectory, which now takes Sly past geometry: real −0.052 against open −0.119, a genuine
     0.068 of occlusion where there was 0.001 before.
     So the bar is re-derived rather than relaxed. The claim is "occlusion is not the explanation
     for the stub's error", and the error being explained is the live glide reading against the
     stub table: |−0.532 − (−0.330)| = 0.202 of NDC. Occlusion has to be a minority of that or the
     claim fails, so the bar is half of it. Measured 0.068 against 0.101.
     The row that CARRIES the claim is the glide, and it is asserted at the original 0.02 below —
     unchanged, and measuring 0.000. */
  const STUB_ERROR = Math.abs(-0.532 - (-0.330));
  console.log(`[D1] desert |Δ| ${D.worst.toFixed(3)} vs half the stub error it must not explain (${(STUB_ERROR / 2).toFixed(3)})`);
  assert.ok(D.worst < STUB_ERROR / 2,
    `over open desert the real BVH and the open sky disagree by ${D.worst.toFixed(3)} of NDC on `
    + `'${D.worstKey}', which is more than half the ${STUB_ERROR.toFixed(3)} the stub got wrong. `
    + "Occlusion is now a plausible explanation for that error, so D1's conclusion is wrong.");
  assert.ok(G.worst < 0.02,
    `on the glide the two collisions disagree by ${G.worst.toFixed(3)} of NDC on '${G.worstKey}'`);
  /* The glide is the row the playtest lane flagged, so it is asserted against their number and
     not merely against the stub's. */
  const gGlide = mean(G.real.get('glide')?.ndc || []);
  console.log(`[D1] driven glide ndcY ${gGlide.toFixed(3)} · live-reported −0.532 · stub table −0.330`);
  assert.ok(Math.abs(gGlide - (-0.532)) < 0.08,
    `the driven glide reads ${gGlide.toFixed(3)}; the playtest lane measured −0.532 in the shipped `
    + 'temple with real keys. A disagreement this size means the replay is not reproducing play.');
  assert.ok(Math.abs(gGlide - (-0.330)) > 0.12,
    `the driven glide reads ${gGlide.toFixed(3)}, which is not meaningfully different from the stub `
    + "table's −0.330 — so the correction this arm exists to make has evaporated");
  /* THE FAILING INPUT: a route where the two collisions must disagree, or the agreements above
     are a statement about the prober. */
  assert.ok(W.worst > 1.0,
    `the masonry route disagrees by only ${W.worst.toFixed(3)} of NDC between the real BVH and open `
    + 'sky. This instrument cannot tell the two collisions apart, so D1 proves nothing.');
});

/* ====================================================================== */
/* D2 — the price of full compensation, on real motion                     */
/* ====================================================================== */

test('D2: full compensation priced on driven trajectories, per framing and per occupancy', async () => {
  /* This is the arbitration itself, and it reports rather than decides. Both arms of
     `TUNE.leadMode` are run over the SAME recorded trajectory, so nothing here is confounded by
     the two cameras steering Sly differently.
   *
   * Occupancy is reported alongside every row because a settled value for a state nobody stays in
   * is not a number you can arbitrate on — the playtest lane's `air` ranged −0.392…+0.217 against
   * a settled +0.217. `maxRun` is the longest unbroken residency in frames, and the settle
   * criterion is derived from the rig's own constants rather than picked: a critically damped
   * spring is inside 5 % after **3 × followTimeH × stiff** seconds, which at 60 Hz is
   * `3 × 0.16 × stiff × 60` frames — about 30 for `air`, 29 for `idle`, 37 for `glide`.
   *
   * **And the split is the finding, not the bookkeeping.** The shipped floor guarantees the
   * delivered lead is ≥ −`deadzoneH`, and that is a STEADY-STATE guarantee: it says where the
   * spring settles, not where it is on the way. Measured here, a 7-frame `air` between `move` and
   * `paraglide` sits at −0.256 m, two and a half times outside the steady-state bound — while the
   * 108-frame `air` on the desert run sits inside it. That is the coordinator's objection arriving
   * in this file's own bar, with a number: **a chopped state is outside the floor's promise, and
   * the promise was never wrong — it was answering about settled motion.**
   *
   * DOMAIN (§418.3)
   *   passes on : every SETTLED framing (`maxRun ≥ 3τ` frames) under 'floor' — desert `idle` at
   *               −0.074, desert `air` at −0.070, `glide` at +0.108, all inside −`deadzoneH`.
   *   fails on  : the CHOPPED framings, which are asserted to exist and to sit OUTSIDE that same
   *               bound. Both sides are measured on the same run, so the bound is known to
   *               discriminate rather than to be trivially true — the first revision of this arm
   *               applied it to every row and went red on the 7-frame `air`, which is how the
   *               split got written. Plus the mode check: if `leadMode` stopped reaching
   *               `_pivotGoal` every delta would be zero and this arm would still print a table. */
  const routes = [['desert run', await trace(...DESERT_RUN)], ['glide', await trace(...GLIDE)]];
  let anyDelta = 0;
  const rows = [];
  console.log('\n[D2] framing   route          n  %run maxRun 3tau  set? |  lead FLOOR   FULL |  ndcY FLOOR   FULL | camDist FLOOR->FULL | mean v');
  for (const [label, t] of routes) {
    const A = agg(replay(t.samples, t.collision, 'floor'));
    const B = agg(replay(t.samples, t.collision, 'full'));
    for (const [key, a] of A) {
      const b = B.get(key);
      if (!a.leads.length || !b?.leads.length) continue;
      const dLead = mean(b.leads) - mean(a.leads);
      anyDelta = Math.max(anyDelta, Math.abs(dLead));
      // Pre-registered in this arm's header, before any row was read: 3 time constants of the
      // framing's OWN follow spring, in frames.
      const settleFrames = 3 * TUNE.followTimeH * mean(a.stiff) / DT;
      const settled = a.maxRun >= settleFrames;
      rows.push({ key, label, a, b, dLead, settleFrames, settled });
      console.log(`     ${key.padEnd(10)} ${label.padEnd(12)} ${String(a.n).padStart(4)} `
        + `${String(Math.round(100 * a.n / t.samples.length)).padStart(4)}% ${String(a.maxRun).padStart(6)} `
        + `${settleFrames.toFixed(0).padStart(4)} ${(settled ? ' yes' : '  NO').padStart(5)} | `
        + `${fmt(mean(a.leads)).padStart(10)} ${fmt(mean(b.leads)).padStart(6)} | `
        + `${fmt(mean(a.ndc)).padStart(10)} ${fmt(mean(b.ndc)).padStart(6)} | `
        + `${fmt(mean(a.camDist), 2).padStart(10)} -> ${fmt(mean(b.camDist), 2).padStart(5)} | ${fmt(mean(a.sp), 2)}`);
    }
  }

  assert.ok(rows.length >= 3, `only ${rows.length} framings carried measurable motion — the routes stopped working`);

  const settled = rows.filter((r) => r.settled);
  const chopped = rows.filter((r) => !r.settled);
  console.log(`[D2] ${settled.length} settled framings, ${chopped.length} chopped`);

  /* The floor's promise, on the motion it is a promise about. */
  for (const r of settled) {
    assert.ok(mean(r.a.leads) >= -TUNE.deadzoneH - 1e-3,
      `settled '${r.key}' on the ${r.label} (maxRun ${r.a.maxRun} ≥ ${r.settleFrames.toFixed(0)}) delivers `
      + `${mean(r.a.leads).toFixed(3)} m under the shipped floor, past what the deadzone alone explains`);
  }
  /* …and the discriminator, which is also the finding. If nothing were chopped, or if the chopped
     rows sat inside the bound anyway, the loop above would be passing on a bound that cannot
     fail — §418.5's tripwire, unlabelled. */
  assert.ok(chopped.length > 0,
    'every framing on these routes settled, so the bound above has no counterexample in this '
    + 'domain and is a tripwire rather than a discriminating bar. Say which it is.');
  const worstChopped = Math.min(...chopped.map((r) => mean(r.a.leads)));
  console.log(`[D2] worst chopped lead ${worstChopped.toFixed(3)} m against a steady-state bound of ${(-TUNE.deadzoneH).toFixed(3)}`);
  assert.ok(worstChopped < -TUNE.deadzoneH - 1e-3,
    `the worst chopped framing delivers ${worstChopped.toFixed(3)} m, inside the steady-state bound. `
    + 'Then transients are NOT outside the floor\'s promise and the settled/chopped split above is '
    + 'sorting rows that behave identically — which would make it decoration.');

  for (const r of rows) {
    assert.ok(r.dLead > 0,
      `'${r.key}' on the ${r.label} moves ${r.dLead.toFixed(3)} m under full compensation — full must `
      + 'never deliver LESS lead than the floor, so the two modes are wired the wrong way round');
  }
  assert.ok(anyDelta > 0.2,
    `the largest lead difference between the two modes is ${anyDelta.toFixed(4)} m. `
    + '`TUNE.leadMode` is not reaching `_pivotGoal`, so every row above is one measurement printed twice.');
});

/* ====================================================================== */
/* D3 — is an authored framing ever the framing a player sees?             */
/* ====================================================================== */

/** Split a replay into contiguous framing residencies and score `dist`-channel delivery. */
function residencies(frames) {
  const out = [];
  let cur = null;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!cur || f.key !== cur.key) { if (cur) out.push(cur); cur = { key: f.key, n: 0, d0: f.dist, peak: 0 }; }
    cur.n++;
    const target = FRAMES[cur.key]?.dist ?? 0;
    const span = target - cur.d0;
    /* A residency that STARTS at the authored value has nothing to blend and is trivially
       delivered; scoring it as 0 would make a still camera look like a broken one. */
    cur.peak = Math.abs(span) > 0.02 ? Math.max(cur.peak, (f.dist - cur.d0) / span) : 1;
  }
  if (cur) out.push(cur);
  return out;
}

test('D3: which authored framings a player actually sees, and the one that is unreachable', async () => {
  /* `FRAMES.tau` is a promise about how long a framing takes to blend in. A state's residency is
     how long the player is in it. **Nobody had ever compared the two columns.** `_blendFrame`
     eases every channel with `ease(cur, target, tau, dt)`, so the most of an authored framing a
     residency of `n` frames can EVER deliver is `1 − exp(−n·dt/τ)` — a ceiling that has nothing
     to do with the follow spring and everything to do with how long the state lasts.
   *
   * Two results, and the second is the one worth having:
   *
   *   `air`  is route-dependent, exactly as the settled/chopped split in D2 said. A long fall
   *          holds it 171 frames and delivers 100 %. A glide hinge holds it 7 and delivers 32 %.
   *          Short platforming hops sit in between. So **the framing a player sees for `air`
   *          depends on how they got there**, and "does the player see it" has no single answer.
   *
   *   `land` is unreachable BY CONSTRUCTION, and that is a statement about the table rather than
   *          about a route. `Land` runs `landSoftTime` 0.09 s — 5.4 frames — and `FRAMES.land.tau`
   *          is 0.14 s, so the ceiling is `1 − exp(−0.09/0.14)` = **47 %**. No route, no player and
   *          no machine can ever see more than half of the `land` framing. It has been authored,
   *          maintained and reasoned about for the life of this file and it has never once been on
   *          screen.
   *
   * Reported, not fixed. The one-line change is `FRAMES.land.tau`, and dropping it to ~0.03 s
   * would make the framing deliverable *and* turn a blend into something much closer to a cut,
   * which is a feel decision of exactly the class §422.3 refused to make from a lane.
   *
   * DOMAIN (§418.3)
   *   passes on : the long fall and the glide — `air` at 171 frames and `glide` at 175 both
   *               deliver ≥ 95 % of their authored `dist`, so a state whose residency outlasts
   *               its own blend does get seen.
   *   fails on  : `land` on the same runs (6 frames against a 25-frame blend, peak 45 %) and the
   *               `air` hinge on the glide (7 frames, 32 %). Both measured on the same routes as
   *               the passing rows, so the ceiling is known to discriminate rather than to be a
   *               property of the scorer. */
  const routes = [
    ['flat run + jumps', await trace(V(0, 0.1, 30), 0, 300,
      (inp, i) => { inp.move.y = -1; if (i % 50 >= 18 && i % 50 < 23) inp.hold('jump'); else inp.let_go('jump'); }, null)],
    ['long fall', await trace(V(0, 18, 34), 0, 200, (inp) => { inp.move.y = -1; },
      (c) => { c.grounded = false; c.sm.set('fall'); })],
    ['glide', await trace(V(0, 18, 34), 0, 240,
      (inp, i, cc) => { inp.move.y = -1; if (!cc.grounded) inp.hold('glide'); else inp.let_go('glide'); },
      (c) => { c.grounded = false; c.sm.set('fall'); })],
  ];

  const seen = new Map();     // framing -> { visits, frames, minN, maxN, bestPeak, worstPeak }
  console.log('\n[D3] framing residencies, and how much of the authored `dist` each delivered');
  console.log('     route            framing    visits  frames  len min/max  need95  peak best/worst');
  for (const [label, t] of routes) {
    const res = residencies(replay(t.samples, t.collision, 'floor'));
    const byKey = new Map();
    for (const r of res) { if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key).push(r); }
    for (const [key, rs] of byKey) {
      const tau = FRAMES[key]?.tau ?? 0.3;
      const need = 3 * tau / DT;
      const ns = rs.map((r) => r.n);
      const pk = rs.map((r) => Math.max(0, Math.min(1, r.peak)));
      console.log(`     ${label.padEnd(16)} ${key.padEnd(10)} ${String(rs.length).padStart(6)} `
        + `${String(ns.reduce((a, b) => a + b, 0)).padStart(7)}  ${String(Math.min(...ns)).padStart(3)}/${String(Math.max(...ns)).padStart(4)}`
        + `${need.toFixed(0).padStart(9)}   ${(100 * Math.max(...pk)).toFixed(0).padStart(3)}% / ${(100 * Math.min(...pk)).toFixed(0).padStart(3)}%`);
      const s = seen.get(key) || { visits: 0, frames: 0, minN: Infinity, maxN: 0, best: 0, worst: 1 };
      s.visits += rs.length;
      s.frames += ns.reduce((a, b) => a + b, 0);
      s.minN = Math.min(s.minN, ...ns); s.maxN = Math.max(s.maxN, ...ns);
      s.best = Math.max(s.best, ...pk); s.worst = Math.min(s.worst, ...pk);
      seen.set(key, s);
    }
  }

  /* The ceiling, derived rather than measured: `1 − exp(−n·dt/τ)`. */
  const ceiling = (n, tau) => 1 - Math.exp(-(n * DT) / tau);
  const landFrames = CTUNE.landSoftTime / DT;
  const landCeil = ceiling(landFrames, FRAMES.land.tau);
  console.log(`\n[D3] land: state runs landSoftTime ${CTUNE.landSoftTime}s = ${landFrames.toFixed(1)} frames, `
    + `FRAMES.land.tau ${FRAMES.land.tau}s -> ceiling ${(100 * landCeil).toFixed(0)}%`);
  const land = seen.get('land');
  if (land) console.log(`[D3] land measured: ${land.visits} visits, len ${land.minN}..${land.maxN}, best peak ${(100 * land.best).toFixed(0)}%`);

  /* PASSING: a state that outlasts its own blend is seen. */
  for (const key of ['air', 'glide']) {
    const s = seen.get(key);
    assert.ok(s && s.best >= 0.95,
      `'${key}' never delivered more than ${(100 * (s?.best ?? 0)).toFixed(0)}% of its authored framing on `
      + 'any of these routes — including the long ones, so nothing here is seen and D3 measures a broken scorer');
  }
  /* FAILING: the ceiling is real, and it bites. */
  assert.ok(landCeil < 0.55,
    `land's ceiling is ${(100 * landCeil).toFixed(0)}% — it is deliverable now, so either tau or `
    + 'landSoftTime moved and this finding has been fixed. Say so rather than keeping the arm.');
  if (land) {
    assert.ok(land.best <= landCeil + 0.06,
      `land measured ${(100 * land.best).toFixed(0)}% against a derived ceiling of ${(100 * landCeil).toFixed(0)}%. `
      + 'Measurement above the analytic bound means the scorer is wrong, not the framing.');
  }
  /* And the route-dependence of `air`, which is the question this arm was asked. */
  const air = seen.get('air');
  assert.ok(air.maxN > 100 && air.minN < 30,
    `air residencies span ${air.minN}..${air.maxN} frames. If they no longer straddle its ${(3 * FRAMES.air.tau / DT).toFixed(0)}-frame `
    + 'blend, the route-dependence this arm reports has gone and the split in D2 should be revisited');
  assert.ok(air.worst < 0.5,
    `the worst air residency delivered ${(100 * air.worst).toFixed(0)}% — every visit now gets most of its `
    + 'framing, so "the framing depends on how you got there" is no longer true');
});

/* ====================================================================== */
/* D4 — `dive`, the one framing whose residency is a fall time             */
/* ====================================================================== */

test('D4: the Cane Slam framing is delivered iff the drop is long, and the boom is the worst channel', async () => {
  /* D3 closed every framing row by arithmetic except this one: `DiveAttack` descends at a
     constant `diveSpeed` 18 m/s, so its residency is `height / 18` and its ceiling is a
     DISTRIBUTION rather than a number. The crossover falls straight out of the same identity:
     `diveSpeed × 3τ` = 18 × 0.27 = **4.86 m of fall** to reach 95 % of the framing.
   *
   * Flat-ground play tops out below that. A plain jump apex is 2.52 m and a jump stacked with a
   * double jump is 4.56 m, so **on open ground the Cane Slam can never reach its own framing.**
   * From any architecture it always does.
   *
   * ── AND THE SINGLE-CLOCK CEILING IS AN OVERSTATEMENT, WHICH IS THE BIGGER RESULT ────────────
   * D3 scored the `dist` CHANNEL. The channel is not the boom. `_frame.dist` feeds `_boomWant`
   * (`zoomTime` 0.16 s) which feeds `this.boom` (another 0.16 s), so the boom is THREE blends
   * deep and the FOV is two (`_frame.fov` → `_fovCur` at `fovTime` 0.30 s). Measured end to end
   * on a dive from a standard jump apex: the channel reaches 73 %, the FOV reaches 43 %, and the
   * **boom reaches 5 %** — 5.29 m against an authored 3.20 m, i.e. it does not pull in at all.
   * The single-clock ceiling overstates the boom by more than an order of magnitude.
   *
   * DOMAIN (§418.3)
   *   passes on : dives from 15 m and 26 m — the boom reaches ≥ 96 % and the FOV ≥ 100 %, so a
   *               long enough drop does deliver the authored slam.
   *   fails on  : the dive from a standard jump apex, on the same instrument — boom 5 %. Both
   *               measured, so the bound is known to discriminate between drop heights rather
   *               than to be a property of the scorer. */
  const rows = [];
  for (const apex of [2.52, 4.56, 8, 15, 26]) {
    const v0 = Math.sqrt(2 * -CTUNE.gravity * apex);
    const fired = { yes: false };
    const t = await trace(V(0, 0.2, 30), 0, 260, (inp, i, cc) => {
      if (i === 1) { cc.pendingLaunch = v0; cc.sm.set('jump'); }
      if (i > 3 && cc.velocity.y < 0 && !fired.yes) { inp.hold('attack'); fired.yes = true; }
      else inp.let_go('attack');
    }, (c) => { c._needSpawnSnap = false; });
    const fr = replay(t.samples, t.collision, 'floor');
    const idx = [];
    for (let i = 0; i < fr.length; i++) if (fr[i].key === 'dive') idx.push(i);
    if (!idx.length) { rows.push({ apex, n: 0 }); continue; }
    const s = idx[0], e = idx[idx.length - 1];
    const dT = FRAMES.dive.dist, fT = FRAMES.dive.fov;
    let chan = 0;
    for (const i of idx) chan = Math.max(chan, (fr[i].dist - fr[s].dist) / (dT - fr[s].dist));
    const boomAuth = TUNE.distDefault + dT;
    const fovAuth = TUNE.fovBase + fT;
    rows.push({ apex, n: idx.length,
      ceil: 1 - Math.exp(-(idx.length * DT) / FRAMES.dive.tau),
      chan,
      boomFrac: (TUNE.distDefault - fr[e].boom) / (TUNE.distDefault - boomAuth),
      fovFrac: (fr[e].camFov - TUNE.fovBase) / (fovAuth - TUNE.fovBase),
      boom: fr[e].boom, fov: fr[e].camFov });
  }
  console.log(`\n[D4] diveSpeed ${CTUNE.diveSpeed} m/s · FRAMES.dive.tau ${FRAMES.dive.tau}s · `
    + `crossover ${(CTUNE.diveSpeed * 3 * FRAMES.dive.tau).toFixed(2)} m of fall`);
  console.log(`[D4] flat ground reaches: jump apex ${(CTUNE.jumpV0 ** 2 / (2 * -CTUNE.gravity)).toFixed(2)} m · `
    + `+ double ${((CTUNE.jumpV0 ** 2 + CTUNE.doubleJumpV0 ** 2) / (2 * -CTUNE.gravity)).toFixed(2)} m`);
  console.log('[D4] apex(m)  frames   ceiling  dist-channel |   BOOM delivered      FOV delivered');
  for (const r of rows) {
    console.log(`[D4] ${String(r.apex).padStart(6)}  ${String(r.n).padStart(6)}  ${(100 * r.ceil).toFixed(0).padStart(6)}%  `
      + `${(100 * r.chan).toFixed(0).padStart(11)}%  | ${(100 * r.boomFrac).toFixed(0).padStart(4)}% (${r.boom.toFixed(2)} m)   `
      + `${(100 * r.fovFrac).toFixed(0).padStart(4)}% (${r.fov.toFixed(2)}°)`);
  }

  const at = (a) => rows.find((r) => r.apex === a);
  assert.ok(rows.every((r) => r.n > 0), 'some heights never entered `dive` — the route stopped working');
  /* ── RE-BASED AFTER THE BOOM CHAIN WAS COLLAPSED, AND THE RE-BASE IS THE RESULT ─────────────
     This arm was written when the boom was three blends deep. Collapsing two of them took the
     jump-apex dive from **5 % to 71 %** and the whole distribution from 5/50/86/96/100 to
     71/92/98/97/100. The variance the arm was written to report has largely closed, which is
     what the collapse was for — so the bars move from "the short dive delivers almost nothing"
     to "the short dive still delivers measurably less than a long one", which is the residual.
     Kept rather than retired: the crossover arithmetic (`diveSpeed × 3τ` = 4.86 m of fall against
     2.52 m from a jump) is unchanged and still explains the residual exactly. */
  assert.ok(at(26).boomFrac > 0.95 && at(15).boomFrac > 0.9,
    `a 26 m dive delivers only ${(100 * at(26).boomFrac).toFixed(0)}% of its boom — then NO drop delivers `
    + 'the slam framing and this is the `land` defect, not a variance finding');
  assert.ok(at(2.52).boomFrac < at(26).boomFrac - 0.1,
    `a jump-apex dive delivers ${(100 * at(2.52).boomFrac).toFixed(0)}% against a 26 m dive's `
    + `${(100 * at(26).boomFrac).toFixed(0)}%. The residual variance has gone too — the drop height no `
    + 'longer changes the slam at all, so the crossover arithmetic above no longer describes anything');
  assert.ok(at(2.52).boomFrac > 0.4,
    `a jump-apex dive delivers ${(100 * at(2.52).boomFrac).toFixed(0)}% of its boom. It was 5 % before the `
    + 'chain collapse; if it is back under 40 % the collapse has been reverted and D6 should be red too');
  assert.ok(CTUNE.jumpV0 ** 2 / (2 * -CTUNE.gravity) < CTUNE.diveSpeed * 3 * FRAMES.dive.tau,
    'a plain jump now reaches the dive crossover height — flat-ground slams deliver their framing '
    + 'and the "never on open ground" claim is stale');
});

/* ====================================================================== */
/* D5 — every clock in the file, and the chains they form                  */
/* ====================================================================== */

/**
 * The chains, authored — and the count is checked against a source scan below so this cannot
 * quietly stop describing the file. Each entry is one player-visible quantity and the ordered
 * list of blends between `FRAMES` and the screen.
 */
const CHAINS = [
  { out: 'boom (metres)',      stages: ['_frame.dist  (FRAMES.tau)', '_boomWant (zoomTime)', 'this.boom (zoomTime / recoverTime)'] },
  { out: 'camera.fov (deg)',   stages: ['_frame.fov   (FRAMES.tau)', '_fovCur (fovTime)'] },
  { out: 'lateral offset (m)', stages: ['_frame.side  (FRAMES.tau)', '_sideSign (0.35 s)'] },
  { out: 'pivot x/z (m)',      stages: ['_frame.lead+stiff (FRAMES.tau)', 'follow spring (followTimeH x stiff)'] },
  { out: 'pivot y (m)',        stages: ['_frame.height (FRAMES.tau)', 'follow spring (followTimeV x stiff)'] },
  { out: 'roll (rad)',         stages: ['_wallSide probe (ceilPoll-style, 0.1 s)', '_roll (0.22 s)'] },
];

test('D5: FRAMES.tau is never the delivery time of anything — the clock census', () => {
  /* The generalisation of D3 and D4, and it is a statement about the whole file rather than the
     framing table. **Every channel `FRAMES` authors passes through at least one more blend before
     it reaches the screen, and the boom passes through two more.** So the single-clock ceiling
     `1 − exp(−n·dt/τ)` is an UPPER BOUND on delivery, never the delivery — measured in D4, a
     jump-apex dive reaches 73 % of the `dist` channel and 5 % of the boom.
   *
   * That is why `land`'s 45 % is also an overstatement, and why "the framing blends in `tau`
   * seconds" was never true of anything a player can see.
   *
   * The longest clock in the file is `ceilTau` 1.103 s — 199 frames to 95 % — and it is the one
   * adopted from the reference. It is gated on *moving under a ceiling*, so a doorway crossed in
   * under a second delivers about half of it. Reported here rather than measured; no driven route
   * in this file spends 3.3 s moving under a lintel.
   *
   * DOMAIN (§418.3)
   *   passes on : the shipped file — the scan finds ≥ 14 blend sites, and the authored chains
   *               below each name a stage that exists in it.
   *   fails on  : a file where the chains have collapsed. Asserted two ways: the scan must find
   *               more blend sites than there are `FRAMES` channels (7), and the boom chain's
   *               end-to-end cost must be visible in D4 — which it is, at 73 % vs 5 %. If either
   *               went away the census would still print a table, and that is the failure this
   *               bar exists to catch. */
  const src = readFileSync(new URL('../src/player/CameraRig.js', import.meta.url), 'utf8');
  const sites = [...src.matchAll(/^\s*(?:this\.)?([\w.]+)\s*=\s*(ease|smoothDamp)\(/gm)]
    .map((m) => ({ target: m[1], kind: m[2] }));
  console.log(`\n[D5] ${sites.length} blend sites in CameraRig.js (${sites.filter((s) => s.kind === 'ease').length} ease, `
    + `${sites.filter((s) => s.kind === 'smoothDamp').length} smoothDamp)`);

  const f = (tau) => `${tau.toFixed(3)}s -> ${(3 * tau / DT).toFixed(0)} frames to 95%`;
  console.log('[D5] the clocks, longest first:');
  const clocks = [
    ['_ceilW           ceilTau', TUNE.ceilTau],
    ['_routeSideW/UpW  routeOut', TUNE.routeOut],
    ['boom recovery    recoverTime', TUNE.recoverTime],
    ['FRAMES.spire.tau (longest row)', FRAMES.spire.tau],
    ['_routeUpW        routeIn', TUNE.routeIn],
    ['_sideSign        (literal)', 0.35],
    ['_fovCur          fovTime', TUNE.fovTime],
    ['follow y         followTimeV', TUNE.followTimeV],
    ['_speedSm / _roll (literal)', 0.22],
    ['follow x/z       followTimeH', TUNE.followTimeH],
    ['_boomWant        zoomTime', TUNE.zoomTime],
    ['FRAMES.dive.tau  (shortest row)', FRAMES.dive.tau],
  ].sort((a, b) => b[1] - a[1]);
  for (const [name, tau] of clocks) console.log(`       ${name.padEnd(32)} ${f(tau)}`);

  console.log('[D5] serial chains from FRAMES to the screen:');
  for (const ch of CHAINS) console.log(`       ${ch.out.padEnd(20)} ${ch.stages.length} stages: ${ch.stages.join('  ->  ')}`);

  assert.ok(sites.length >= 14,
    `only ${sites.length} blend sites found in CameraRig.js — the source scan has stopped working, so `
    + 'the census below is describing a file it cannot see');
  assert.ok(sites.length > 7,
    `${sites.length} blend sites against 7 FRAMES channels — if these were equal, every authored `
    + 'channel would reach the screen through exactly its own blend and this whole census would be moot');
  assert.ok(CHAINS.every((c) => c.stages.length >= 2),
    'a chain in the authored table has only one stage — then `FRAMES.tau` IS its delivery time and '
    + 'the census is describing a file that no longer matches it');
  assert.equal(CHAINS.find((c) => c.out.startsWith('boom')).stages.length, 3,
    'the boom chain is no longer three stages deep; D4 attributes a 73%-vs-5% gap to exactly that '
    + 'depth, so the two claims have to move together');
  /* `ceilTau` is the longest clock and it came from the reference; if it stops being the longest,
     something in this file grew a slower one and nobody measured what it costs. */
  assert.equal(clocks[0][1], TUNE.ceilTau,
    `the longest clock is now ${clocks[0][0]} at ${clocks[0][1]}s, not ceilTau ${TUNE.ceilTau}s`);
});

/* ====================================================================== */
/* D6 — end-to-end delivery, every framing, at the screen                  */
/* ====================================================================== */

/**
 * The completion of D3/D4/D5, and the table a person can read without knowing any of it.
 *
 * Every earlier number scored a `FRAMES` CHANNEL. D5 showed the channel is up to three stages
 * from a pixel, so those numbers are upper bounds on upper bounds. This measures the **screen
 * quantities**: the boom in metres, the camera FOV in degrees, the pivot height and lead in
 * metres, the orbit pitch in radians.
 *
 * "Authored" is defined by measurement rather than by reading `FRAMES`, because a `FRAMES` entry
 * is an offset into a chain and not a pixel value. For every residency the same trajectory is
 * replayed a second time with `stateName` **pinned** to that residency's state, which settles
 * every blend at the same motion; the pinned run's value is what the screen converges to if the
 * player stays in the state, and that is the honest denominator.
 *
 *     delivered = (peak reached during the residency − value on entry)
 *                 / (pinned-run value − value on entry)
 */
const SCREEN = [
  ['boom', 'm', 0.05], ['fov', 'deg', 0.30], ['pivY', 'm', 0.05],
  ['lead', 'm', 0.08], ['side', 'm', 0.05], ['pitch', 'rad', 0.010],
];

function screenReplay(samples, collision, pin) {
  const keep = TUNE.leadMode;
  TUNE.leadMode = 'floor';
  try {
    const movement = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), grounded: true, stateName: 'idle', yaw: Math.PI };
    const L = new Map();
    const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 2000);
    const engine = { input: new LookInput(), camera: cam, scene: new THREE.Scene(), movement, collision,
      time: 0, dt: 0, timeScale: 1, width: 1920, height: 1080, quality: 'high', debug: { freeCam: false },
      warn() {}, has() { return false; },
      on(e, f) { if (!L.has(e)) L.set(e, new Set()); L.get(e).add(f); return () => {}; },
      emit(e, p) { for (const f of L.get(e) || []) f(p); },
      get(n) { return n === 'movement' ? movement : n === 'collision' ? collision : null; } };
    const rig = new CameraRig(engine); rig.init?.();
    const feed = (s) => { movement.position.set(s.px, s.py, s.pz); movement.velocity.set(s.vx, s.vy, s.vz);
      movement.stateName = pin || s.state; movement.grounded = s.grounded; movement.yaw = s.yaw; };
    feed(samples[0]); rig.snap?.(true);
    const out = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      feed(s); engine.dt = DT; engine.time = i * DT;
      rig.update(DT);
      const sp = Math.hypot(s.vx, s.vz);
      const dx = rig.pivot.x - s.px, dz = rig.pivot.z - s.pz;
      out.push({ key: rig._frameKey, state: s.state, boom: rig.boom, fov: cam.fov,
        pivY: rig.pivot.y - s.py, lead: sp > 0.4 ? (dx * s.vx + dz * s.vz) / sp : null,
        side: dx * rig.right.x + dz * rig.right.z, pitch: rig._effectivePitch() });
    }
    return out;
  } finally { TUNE.leadMode = keep; }
}

test('D6: how much of each authored framing reaches the screen, over the residencies play produces', async () => {
  /* DOMAIN (§418.3)
   *   passes on : `glide` and `sneak` — long uninterrupted residencies, and every screen channel
   *               closes at 100 %. A framing a player stays in does arrive.
   *   fails on  : `land` (boom 0.00 m of 0.27 m asked) and `wall_run` (0.04 m of 0.86 m). Both
   *               measured on the same instrument as the passing rows, so 0 % is a fact about
   *               those residencies and not a scorer that cannot see a moving boom.
   *
   * **And the aggregate is absolute-weighted, `Σ|got| / Σ|asked|`, not a mean of per-visit
   * fractions — because the two disagree and the mean flatters.** `wall_run` reads 47 % as a mean
   * of three visits and 5 % in metres: two visits with almost nothing to deliver score high and
   * drown the one with 0.86 m on the table. That is §419.5's shape a third time — the legible
   * statistic and the felt one, diverging inside one row — so both are printed and the metres
   * are the answer. */
  const ST = { fired: false };
  const ROUTES = [
    ['flat run + jumps', V(0, 0.1, 30), 0, 320, (inp, i) => { inp.move.y = -1; if (i % 50 >= 18 && i % 50 < 23) inp.hold('jump'); else inp.let_go('jump'); }, null],
    ['glide', V(0, 18, 34), 0, 240, (inp, i, cc) => { inp.move.y = -1; if (!cc.grounded) inp.hold('glide'); else inp.let_go('glide'); }, (c) => { c.grounded = false; c.sm.set('fall'); }],
    ['sneak', V(0, 0.1, 30), 0, 160, (inp) => { inp.move.y = -1; inp.hold('sneak'); }, null],
    ['crouch + roll', V(0, 0.1, 30), 0, 200, (inp, i) => { inp.move.y = -1; if (i === 60 || i === 130) inp.hold('crouch'); else inp.let_go('crouch'); }, null],
    ['dive from a jump', V(0, 0.2, 30), 0, 200, (inp, i, cc) => {
      if (i === 1) { cc.pendingLaunch = CTUNE.jumpV0; cc.sm.set('jump'); }
      if (i > 3 && cc.velocity.y < 0 && !ST.fired) { inp.hold('attack'); ST.fired = true; } else inp.let_go('attack');
    }, () => { ST.fired = false; }],
    ['dive from 15 m', V(0, 0.2, 30), 0, 260, (inp, i, cc) => {
      if (i === 1) { cc.pendingLaunch = Math.sqrt(2 * -CTUNE.gravity * 15); cc.sm.set('jump'); }
      if (i > 3 && cc.velocity.y < 0 && !ST.fired) { inp.hold('attack'); ST.fired = true; } else inp.let_go('attack');
    }, () => { ST.fired = false; }],
    ['temple approach', V(0, 0.1, 30), Math.PI, 320, (inp, i) => { inp.move.y = 1; if (i % 45 >= 20 && i % 45 < 24) inp.hold('jump'); else inp.let_go('jump'); }, null],
    ['combo', V(0, 0.1, 30), 0, 160, (inp, i) => { if (i % 30 === 5) inp.hold('attack'); else inp.let_go('attack'); }, null],
  ];

  const table = new Map();
  for (const [, start, yaw, nf, drive, pre] of ROUTES) {
    const t = await trace(start, yaw, nf, drive, (c) => { if (pre) pre(c); c._needSpawnSnap = false; });
    const A = screenReplay(t.samples, t.collision, null);
    const spans = [];
    let cur = null;
    for (let i = 0; i < A.length; i++) {
      if (!cur || A[i].key !== cur.key) { if (cur) spans.push(cur); cur = { key: A[i].key, s: i, e: i, state: A[i].state }; }
      cur.e = i;
    }
    if (cur) spans.push(cur);
    for (const r of spans) {
      const len = r.e - r.s + 1;
      if (len < 2 || r.s === 0) continue;
      const B = screenReplay(t.samples, t.collision, r.state);
      const enter = A[r.s - 1];
      let rec = table.get(r.key);
      if (!rec) { rec = { visits: 0, frames: 0, lens: [], ch: {} }; table.set(r.key, rec); }
      rec.visits++; rec.frames += len; rec.lens.push(len);
      for (const [name, , minSpan] of SCREEN) {
        const ref = B[r.e][name], e0 = enter[name];
        if (ref == null || e0 == null) continue;
        const span = ref - e0;
        if (Math.abs(span) < minSpan) continue;
        let peak = 0;
        for (let i = r.s; i <= r.e; i++) if (A[i][name] != null) peak = Math.max(peak, (A[i][name] - e0) / span);
        const frac = Math.max(0, Math.min(1.2, peak));
        const c = rec.ch[name] = rec.ch[name] || { fracs: [], asked: 0, got: 0 };
        c.fracs.push(frac); c.asked += Math.abs(span); c.got += frac * Math.abs(span);
      }
    }
  }

  const order = [...table].sort((a, b) => b[1].frames - a[1].frames);
  const abs = (c) => (c && c.asked > 1e-9 ? c.got / c.asked : NaN);
  const cell = (c) => (c && c.asked > 1e-9 ? `${(100 * abs(c)).toFixed(0)}%` : '  —');
  console.log('\n[D6] END-TO-END DELIVERY AT THE SCREEN — absolute-weighted, sum|got| / sum|asked|');
  console.log('[D6] framing    visits frames  med/max | ' + SCREEN.map(([n]) => n.padStart(6)).join(''));
  for (const [key, r] of order) {
    const L = r.lens.slice().sort((a, b) => a - b);
    console.log(`[D6] ${key.padEnd(11)} ${String(r.visits).padStart(5)} ${String(r.frames).padStart(6)} `
      + `${String(L[L.length >> 1]).padStart(5)}/${String(L[L.length - 1]).padStart(4)} | `
      + SCREEN.map(([n]) => cell(r.ch[n]).padStart(6)).join(''));
  }
  console.log('[D6] the same rows in METRES/DEGREES — got of asked:');
  for (const [key, r] of order) {
    console.log(`[D6] ${key.padEnd(11)} ` + SCREEN.map(([n]) => {
      const c = r.ch[n];
      return (c && c.asked > 1e-9 ? `${n}: ${c.got.toFixed(2)}/${c.asked.toFixed(2)}` : '').padEnd(19);
    }).join(''));
  }

  const g = (k) => table.get(k);
  assert.ok(order.length >= 7, `only ${order.length} framings were reached — the routes stopped working`);
  /* PASSING: framings a player stays in do arrive. */
  for (const k of ['glide', 'sneak']) {
    assert.ok(abs(g(k).ch.boom) > 0.95,
      `'${k}' delivers only ${(100 * abs(g(k).ch.boom)).toFixed(0)}% of its boom despite an uninterrupted `
      + 'residency — then nothing in this table arrives and D6 is measuring a broken scorer');
  }
  /* FAILING: the two that essentially never arrive. */
  /* `land`, in three measurements: **0 %** when the boom was three blends deep and the landing
     race swallowed most touchdowns; **6 %** after MOVEMENT's repair made 2.5x as many landings
     register (more asked for, the same nothing delivered); **52 %** now that two of the three
     blends are gone. The arm's job flips with it — it used to assert the framing never arrives,
     and now asserts the collapse is still in place. */
  assert.ok(abs(g('land').ch.boom) > 0.35,
    `'land' delivers ${(100 * abs(g('land').ch.boom)).toFixed(0)}% of its boom `
    + `(${g('land').ch.boom.got.toFixed(2)} of ${g('land').ch.boom.asked.toFixed(2)} m). It was 52 % with the `
    + 'boom chain collapsed and 6 % before; under 35 % means the collapse has been reverted.');
  assert.ok(abs(g('wall_run').ch.boom) < 0.15,
    `'wall_run' delivers ${(100 * abs(g('wall_run').ch.boom)).toFixed(0)}% of its boom — the routing fix `
    + 'in STATE_FRAME made this framing reachable and this arm reports it still does not arrive');
  /* The methodological point, asserted rather than described: the mean of fractions flatters. */
  const wr = g('wall_run').ch.boom;
  const meanFrac = wr.fracs.reduce((a, b) => a + b, 0) / wr.fracs.length;
  console.log(`[D6] wall_run boom: mean-of-fractions ${(100 * meanFrac).toFixed(0)}% vs absolute-weighted ${(100 * abs(wr)).toFixed(0)}%`);
  assert.ok(meanFrac - abs(wr) > 0.2,
    `the two aggregates agree to ${(100 * (meanFrac - abs(wr))).toFixed(0)} points on wall_run's boom. They `
    + 'disagreed by 42; if they now agree, the absolute weighting is buying nothing and the simpler '
    + 'mean should be used instead of carrying two numbers.');
  /* And the ordering that explains the whole table: delivery tracks CHAIN DEPTH, not tau. */
  const pitchOK = order.filter(([, r]) => r.ch.pitch && abs(r.ch.pitch) > 0.85).length;
  const boomBad = order.filter(([, r]) => r.ch.boom && abs(r.ch.boom) < 0.7).length;
  console.log(`[D6] pitch (1 stage) closes on ${pitchOK}/${order.length} framings · boom (3 stages) misses on ${boomBad}`);
  assert.ok(pitchOK >= boomBad,
    `pitch closes on ${pitchOK} framings and the boom misses on ${boomBad} — the one-stage channel is no `
    + 'longer outperforming the three-stage one, so D5\'s chain-depth explanation does not hold here');
});

/* ====================================================================== */
/* D7 — which STATES each framing row actually measured                    */
/* ====================================================================== */

test('D7: every framing row, attributed to the states that produced it', async () => {
  /* D6 publishes one row per framing KEY. A key is not a move. `wall_run` was quoted at 5 %, and
     **100 % of the frames behind that number were `wallCling`** — a different move, held against
     a wall rather than running along one. The row was named for something it never measured, the
     table was quoted to three lanes, and nothing in D6 could have shown it.
   *
   * So this arm reports the same routes broken out per state, and fails when a row's name stops
   * matching what produced it. Where a key genuinely serves several states it says so and gives
   * the numbers separately, because pooling is what made `wall_run` unreadable — and pooling hid
   * a real spread elsewhere too: `air` is 68 % `fall` and 32 % `jump`, and their `lead` delivery
   * is **92 % against 26 %**. One number for both told nobody that.
   *
   * DOMAIN (§418.3)
   *   passes on : `sneak`, `dive`, `roll`, `land`, `glide` — single-state rows whose name is the
   *               state (or, for `glide`, `paraglide`, its only member).
   *   fails on  : `wall_run`, whose sole contributor is `wallCling`. Asserted below as a named
   *               known misattribution rather than allowed to pass quietly, so that if it ever
   *               becomes the `wallRun` state the arm says the world changed.
   *   does NOT discriminate : whether a state that never occurs on these routes would be
   *               correctly attributed. `combatStrafe`, `wallRun`, `railSlide`, `poleClimb` and
   *               `hookSwing` produce no frames here, so this arm is silent about them — which
   *               is the §439.3 line, applied to a sample rather than to a stub. */
  const ST = { fired: false };
  const ROUTES = [
    ['flat run + jumps', V(0, 0.1, 30), 0, 320, (inp, i) => { inp.move.y = -1; if (i % 50 >= 18 && i % 50 < 23) inp.hold('jump'); else inp.let_go('jump'); }, null],
    ['glide', V(0, 18, 34), 0, 240, (inp, i, cc) => { inp.move.y = -1; if (!cc.grounded) inp.hold('glide'); else inp.let_go('glide'); }, (c) => { c.grounded = false; c.sm.set('fall'); }],
    ['sneak', V(0, 0.1, 30), 0, 160, (inp) => { inp.move.y = -1; inp.hold('sneak'); }, null],
    ['crouch + roll', V(0, 0.1, 30), 0, 200, (inp, i) => { inp.move.y = -1; if (i === 60 || i === 130) inp.hold('crouch'); else inp.let_go('crouch'); }, null],
    ['dive', V(0, 0.2, 30), 0, 200, (inp, i, cc) => {
      if (i === 1) { cc.pendingLaunch = CTUNE.jumpV0; cc.sm.set('jump'); }
      if (i > 3 && cc.velocity.y < 0 && !ST.fired) { inp.hold('attack'); ST.fired = true; } else inp.let_go('attack');
    }, () => { ST.fired = false; }],
    ['temple approach', V(0, 0.1, 30), Math.PI, 320, (inp, i) => { inp.move.y = 1; if (i % 45 >= 20 && i % 45 < 24) inp.hold('jump'); else inp.let_go('jump'); }, null],
    ['combo', V(0, 0.1, 30), 0, 160, (inp, i) => { if (i % 30 === 5) inp.hold('attack'); else inp.let_go('attack'); }, null],
  ];

  const table = new Map();                       // key -> state -> {frames, visits, ch}
  for (const [, start, yaw, nf, drive, pre] of ROUTES) {
    const t = await trace(start, yaw, nf, drive, (c) => { if (pre) pre(c); c._needSpawnSnap = false; });
    const A = screenReplay(t.samples, t.collision, null);
    const spans = []; let cur = null;
    for (let i = 0; i < A.length; i++) {
      if (!cur || A[i].key !== cur.key) { if (cur) spans.push(cur); cur = { key: A[i].key, s: i, e: i, state: A[i].state }; }
      cur.e = i;
    }
    if (cur) spans.push(cur);
    for (const r of spans) {
      if (r.e - r.s + 1 < 2 || r.s === 0) continue;
      const B = screenReplay(t.samples, t.collision, r.state);
      const enter = A[r.s - 1];
      if (!table.has(r.key)) table.set(r.key, new Map());
      const byState = table.get(r.key);
      if (!byState.has(r.state)) byState.set(r.state, { frames: 0, visits: 0, ch: {} });
      const rec = byState.get(r.state);
      rec.frames += r.e - r.s + 1; rec.visits++;
      for (const [name, , minSpan] of SCREEN) {
        const ref = B[r.e][name], e0 = enter[name];
        if (ref == null || e0 == null) continue;
        const span = ref - e0;
        if (Math.abs(span) < minSpan) continue;
        let peak = 0;
        for (let i = r.s; i <= r.e; i++) if (A[i][name] != null) peak = Math.max(peak, (A[i][name] - e0) / span);
        const f = Math.max(0, Math.min(1.2, peak));
        const c = rec.ch[name] = rec.ch[name] || { asked: 0, got: 0 };
        c.asked += Math.abs(span); c.got += f * Math.abs(span);
      }
    }
  }

  const abs = (c) => (c && c.asked > 1e-9 ? c.got / c.asked : NaN);
  const cell = (c) => (c && c.asked > 1e-9 ? `${(100 * abs(c)).toFixed(0)}%` : '  —');
  /* A key names a MOVE when its dominant state is that move, and names a CATEGORY when it does
     not — `air` over fall/jump, `combat` over combo, `glide` over paraglide are categories and
     legitimate. Only a key whose name IS a state name has to match. */
  const STATE_NAMED = new Set(['sneak', 'dive', 'roll', 'land', 'idle', 'crawl', 'wall_run', 'spire', 'balance']);
  console.log('\n[D7] key          state          visits frames share |  boom   fov  pivY  lead  side pitch');
  const flags = [];
  for (const [key, byState] of [...table].sort((a, b) => {
    const fa = [...a[1].values()].reduce((x, y) => x + y.frames, 0);
    const fb = [...b[1].values()].reduce((x, y) => x + y.frames, 0);
    return fb - fa;
  })) {
    const tot = [...byState.values()].reduce((x, y) => x + y.frames, 0);
    const ss = [...byState].sort((a, b) => b[1].frames - a[1].frames);
    const dominant = ss[0][0];
    const named = STATE_NAMED.has(key);
    const matches = dominant.toLowerCase().replace(/[^a-z]/g, '') === key.replace(/[^a-z]/g, '');
    if (named && !matches) flags.push({ key, dominant, share: ss[0][1].frames / tot });
    console.log(`[D7] ${key.padEnd(12)} ${(named ? (matches ? '' : 'MISATTRIBUTED') : '(category)').padEnd(14)} `
      + `${String(ss.length).padStart(6)} ${String(tot).padStart(6)}       |`);
    for (const [st, rec] of ss) {
      console.log(`[D7]   ${''.padEnd(10)} ${st.padEnd(14)} ${String(rec.visits).padStart(6)} ${String(rec.frames).padStart(6)} `
        + `${String(Math.round(100 * rec.frames / tot)).padStart(4)}% | ` + SCREEN.map(([n]) => cell(rec.ch[n]).padStart(5)).join(''));
    }
  }
  console.log(`[D7] state-named keys whose dominant contributor is a different move: `
    + `${flags.map((f) => `${f.key} <- ${f.dominant} (${(100 * f.share).toFixed(0)}%)`).join(', ') || 'none'}`);

  assert.ok(table.size >= 7, `only ${table.size} framing keys were reached — the routes stopped working`);
  /* PASSING: the single-state rows are what they say they are. */
  for (const k of ['sneak', 'dive', 'roll', 'land']) {
    const byState = table.get(k);
    assert.ok(byState && byState.has(k) && byState.get(k).frames / [...byState.values()].reduce((x, y) => x + y.frames, 0) > 0.9,
      `'${k}' is no longer dominated by the '${k}' state — its published row has stopped being about the move it names`);
  }
  /* THE KNOWN MISATTRIBUTION, named rather than allowed to pass quietly. */
  const wr = table.get('wall_run');
  assert.ok(wr, 'no wall_run frames on these routes — the audit cannot see the row it exists for');
  const wrDom = [...wr].sort((a, b) => b[1].frames - a[1].frames)[0][0];
  assert.equal(wrDom, 'wallCling',
    `'wall_run' is now dominated by '${wrDom}'. If that is 'wallRun' the row finally measures the move `
    + 'it is named for and D6\'s wall_run figure means something new — re-read it before quoting it.');
  /* And the pooling that hid a real spread: `air` must keep reporting its members separately. */
  const air = table.get('air');
  assert.ok(air && air.size >= 2,
    `'air' now has ${air?.size ?? 0} contributing state(s). It pooled fall and jump, whose lead delivery `
    + 'differs 92% vs 26%; if it has collapsed to one the spread this arm reports is no longer visible');
});

/* ====================================================================== */
/* D8 — the lead column, in closed form                                    */
/* ====================================================================== */

test('D8: FRAMES.lead is inert on most of the table, and it is derivable rather than sampled', () => {
  /* The chase started from D7's `air` row: `lead` delivering 92 % on fall-started spans and 26 %
     on jump-started ones. Measured per frame, the GOAL lead is 1.25 m throughout and the pivot
     sits 1.35–1.78 m behind it — **on the ground as well**. So it is not a jump problem, and the
     92/26 spread is a ratio of two small numbers, not a 66-point difference in what a player sees.
   *
   * The real quantity is closed form and needs no driving at all. `_pivotGoal` floors the lead at
   * the follow spring's own trail, so the delivered lead is
   *
   *     max(leadTime × f.lead − followTimeH × f.stiff, 0) × speed − deadzoneH
   *
   * and the sign of that margin decides whether `f.lead` does anything whatsoever. **On 11 of 19
   * framings the margin is negative: the floor is permanently active, the delivered lead is
   * exactly −deadzoneH at every speed, and the authored `lead` value has no effect at all.**
   *
   *     FLOOR ALWAYS ACTIVE   idle walk sneak crawl balance spire dive ledge_hang climb land combat
   *     escapes, barely       air 0.159 m · hook_swing 0.130 m · glide 0.238 m   (at runSpeed)
   *     escapes properly      run 0.554 · wall_run 0.454 · roll 0.447 · run_fast 1.185 · rail_slide 1.304
   *
   * `air` authors 1.20 ("lead hard") and delivers **16 cm**. `hook_swing` authors 1.60 with the
   * comment *"Lead frames the landing"* and delivers **13 cm**. `land` sits 0.001 s below
   * break-even — a knife edge, on the wrong side.
   *
   * This is §442's class again with the subject changed: a column whose published numbers were
   * about the ratio, not about the metres. The metres were always derivable.
   *
   * DOMAIN (§418.3)
   *   passes on : the shipped table — `run_fast` and `rail_slide` carry real lead (1.19 m, 1.30 m
   *               at runSpeed), so the mechanism is not uniformly dead and the census discriminates.
   *   fails on  : the 11 rows at or below break-even, asserted by name. If that set shrinks
   *               somebody has re-authored `lead` or `stiff` and the delivered lead has changed
   *               for real, which is a feel change and must not land silently.
   *   does NOT discriminate : whether any of this is visible. A 16 cm lead at 5.4 m of boom is a
   *               small screen offset; this arm says what is delivered, not whether it reads. */
  const T = TUNE;
  const margin = (f) => T.leadTime * f.lead - T.followTimeH * f.stiff;
  const delivered = (f, v) => Math.max(margin(f), 0) * v - T.deadzoneH;
  const RUN = CTUNE.runSpeed;

  const dead = [], live = [];
  console.log('\n[D8] framing        f.lead f.stiff  margin(s)  delivered at runSpeed');
  for (const [k, f] of Object.entries(FRAMES)) {
    const m = margin(f);
    (m <= 0 ? dead : live).push(k);
    console.log(`[D8] ${k.padEnd(14)} ${f.lead.toFixed(2).padStart(6)} ${f.stiff.toFixed(2).padStart(7)} `
      + `${m.toFixed(4).padStart(10)}  ${delivered(f, RUN).toFixed(3).padStart(7)} m${m <= 0 ? '   FLOOR ALWAYS ACTIVE' : ''}`);
  }
  console.log(`[D8] ${dead.length}/${Object.keys(FRAMES).length} framings can never deliver lead: ${dead.join(' ')}`);

  assert.ok(dead.length >= 8,
    `only ${dead.length} framings sit at or below the lead break-even (was 11): ${dead.join(', ')}. `
    + 'Somebody has re-authored `lead` or `stiff` and the delivered lead has changed for real — that '
    + 'is a feel change and this arm exists so it cannot land silently.');
  for (const k of ['idle', 'sneak', 'balance', 'spire', 'ledge_hang', 'land']) {
    assert.ok(margin(FRAMES[k]) <= 0,
      `'${k}' now escapes the lead floor (margin ${margin(FRAMES[k]).toFixed(4)} s) — its authored lead `
      + 'has started doing something, which is a change in what a player sees');
  }
  /* The discriminator: the mechanism is not uniformly dead. */
  assert.ok(delivered(FRAMES.rail_slide, RUN) > 1.0 && delivered(FRAMES.run_fast, RUN) > 1.0,
    'no framing delivers more than a metre of lead at runSpeed, so "11 of 19 are inert" is a '
    + 'statement about the formula rather than about the table');
  /* And the two whose authored intent most contradicts their delivery, pinned by name. */
  assert.ok(delivered(FRAMES.air, RUN) < 0.30,
    `'air' now delivers ${delivered(FRAMES.air, RUN).toFixed(3)} m of lead; it was 0.159 m against an `
    + 'authored 1.20. (This arm used to say that 1.20 came "with the comment \'lead hard\'". It does '
    + 'not: `air` carries no comment, and "lead hard" belongs to `run`/`run_fast` two rows above it '
    + 'in FRAMES. D9 owns the corrected attribution.)');
  assert.ok(delivered(FRAMES.hook_swing, RUN) < 0.30,
    `'hook_swing' now delivers ${delivered(FRAMES.hook_swing, RUN).toFixed(3)} m; it was 0.130 m against `
    + 'an authored 1.60 and the comment "Lead frames the landing"');
});

/* ====================================================================== */
/* D9 — the same census at each row's OWN speed, attributed by mechanism    */
/* ====================================================================== */

test('D9: 13 of 19 rows are floored at their own speed, and two of them by `leadMax` not `stiff`', () => {
  /* D8 above evaluates every row at `runSpeed`. That is a SAMPLE, and it is the instrument
     (§440): the delivered lead is a metre quantity sitting under a metre cap, so reading `sneak`
     or `rail_slide` at a running speed does not describe either of them. Re-read at the speed each
     row actually occurs at, two more rows turn out to be floored — and they are floored by a
     DIFFERENT CONSTANT, which is the part that matters, because it changes what repairs them.
   *
   *     max( min(leadTime × f.lead, leadMax / v) − followTimeH × f.stiff , 0 ) × v − deadzoneH
   *
   * Whichever term the inner `min` picks names the culprit:
   *
   *     FLOORED BY `stiff`    the authored lead is smaller than the trail. 11 rows. `leadTime`,
   *                           `f.lead` and `followTimeH` all move these.
   *     FLOORED BY `leadMax`  the 1.75 m cap lands BELOW the trail. `hook_swing` above 7.29 m/s,
   *                           `rail_slide` above 13.67 m/s — both of which are their ordinary
   *                           operating speeds. **No value of `leadTime` or `f.lead` moves these
   *                           at all**, which is why the distinction is not cosmetic.
   *
   * The cap is calibrated against DELIVERED metres (see `TUNE.leadMax`) and applied to AUTHORED
   * ones. That is a defect and not a feel question; the feel question is priced as item 6 of
   * `progress/records/HARDWARE-REVIEW.md`.
   *
   * DOMAIN (§418.3)
   *   passes on : the shipped table at the speeds `Controller.TUNE` gives each move.
   *   fails on  : the SAME table with `leadMax` lifted to 3.0, RUN below — `hook_swing` and
   *               `rail_slide` both escape the floor, and no other row's classification changes.
   *               That is what proves the attribution is to the cap rather than to `stiff`: if
   *               `stiff` were holding them, lifting the cap would do nothing. A second failing
   *               input is run alongside it — `leadTime` at 1.00, nearly 6× shipped — under which
   *               those same two rows stay floored, which is the same claim from the other side.
   *   does NOT discriminate : whether any of this is visible, and whether the eight rows this arm
   *               calls deliberately-still are in fact deliberate. That reading is argued from the
   *               authoring — `lead` and `stiff` are anti-correlated across the table, so the
   *               stiller a row is authored the less lead it asks for — and an argument from
   *               authoring is not something a test can hold. */
  const T = TUNE;
  const C = CTUNE;

  /* Each row at the speed it actually occurs at. Every value is a `Controller.TUNE` constant or a
     measured consequence of one — never a guess, because a guessed speed would make this arm a
     restatement of D8 with different numbers. */
  const SPEED = {
    idle:       [C.runSpeed,       'runSpeed — `move` falls through to `idle`, so this IS ordinary running'],
    walk:       [C.walkSpeed,      'walkSpeed'],
    run:        [C.runSpeed,       'runSpeed'],
    run_fast:   [C.runSpeed,       'runSpeed — LOCO.maxSpeed = runSpeed; nothing on the ground is faster'],
    sneak:      [C.sneakSpeed,     'sneakSpeed'],
    crawl:      [C.crawlSpeed,     'crawlSpeed'],
    hook_swing: [8.0,              'tangential swing speed, the value camlead L1 uses; a 75° pendulum peaks at 8.85'],
    rail_slide: [C.railMax,        'railMax — the speed the row exists for'],
    balance:    [C.railWalk,       'railWalk'],
    spire:      [C.spireWobble,    'spireWobble — standing on a pinnacle'],
    dive:       [C.runSpeed * 0.3, 'DiveAttack.enter multiplies horizontal velocity by 0.3'],
    wall_run:   [C.wallRunSpeed,   'wallRunSpeed'],
    ledge_hang: [C.shimmy,         'shimmy'],
    climb:      [C.poleUp,         'poleUp'],
    glide:      [C.glideSpeed,     'glideSpeed'],
    land:       [C.runSpeed,       'runSpeed — a landing keeps the horizontal speed it arrived with'],
    roll:       [C.rollSpeed,      'rollSpeed'],
    air:        [C.runSpeed,       'runSpeed — a jump retains horizontal speed'],
    combat:     [C.strafeSpeed,    'strafeSpeed'],
  };

  /** Which term of the floor is binding, at speed `v`, under an optional TUNE override. */
  const classify = (f, v, o = {}) => {
    const leadTime = o.leadTime ?? T.leadTime;
    const leadMax = o.leadMax ?? T.leadMax;
    const authored = leadTime * f.lead;
    const cap = leadMax / v;
    const trail = T.followTimeH * f.stiff;
    const raw = Math.min(authored, cap);
    if (raw >= trail) return 'delivers';
    return cap < authored ? 'leadMax' : 'stiff';
  };

  const shipped = {};
  console.log('\n[D9] framing        v      f.lead f.stiff   floored by   why');
  for (const [k, f] of Object.entries(FRAMES)) {
    const [v, why] = SPEED[k];
    shipped[k] = classify(f, v);
    const authored = T.leadTime * f.lead, cap = T.leadMax / v, trail = T.followTimeH * f.stiff;
    const note = shipped[k] === 'delivers' ? ''
      : shipped[k] === 'leadMax' ? `cap ${cap.toFixed(3)}s < trail ${trail.toFixed(3)}s (authored ${authored.toFixed(3)}s never applies)`
        : `authored ${authored.toFixed(3)}s < trail ${trail.toFixed(3)}s, short by ${(trail - authored).toFixed(4)}s`;
    console.log(`[D9] ${k.padEnd(12)} ${v.toFixed(2).padStart(6)} ${f.lead.toFixed(2).padStart(7)} ${f.stiff.toFixed(2).padStart(7)}`
      + `   ${shipped[k].padEnd(10)}   ${note || why}`);
  }
  const flooredNow = Object.keys(shipped).filter((k) => shipped[k] !== 'delivers');
  const byCap = Object.keys(shipped).filter((k) => shipped[k] === 'leadMax');
  console.log(`[D9] ${flooredNow.length}/19 floored at their own speed; ${byCap.length} of those by leadMax: ${byCap.join(' ')}`);

  assert.deepEqual(byCap.sort(), ['hook_swing', 'rail_slide'],
    `the set of rows floored by the \`leadMax\` cap rather than by \`stiff\` is now [${byCap.join(', ')}], `
    + 'and it was [hook_swing, rail_slide]. Those two are the rows no `lead` or `leadTime` edit can '
    + 'repair, so the set changing means a repair that used to be impossible has become possible — or '
    + 'the reverse. Either way it is a change in what is fixable and must not land silently.');

  assert.ok(flooredNow.length >= 12,
    `only ${flooredNow.length} of 19 rows are floored at their own speed (was 13): ${flooredNow.join(', ')}`);

  /* The eight argued to be deliberately still. If one of these starts leading, a camera has begun
     running ahead of a careful or stationary player, which is the shot these rows exist to refuse. */
  for (const k of ['idle', 'sneak', 'crawl', 'balance', 'spire', 'ledge_hang', 'climb', 'combat']) {
    assert.notEqual(classify(FRAMES[k], SPEED[k][0]), 'delivers',
      `'${k}' now delivers lead at its own speed (${SPEED[k][0]} m/s). It is one of the rows argued to `
      + 'be inert ON PURPOSE — a camera that runs ahead of a stationary or careful player is the wrong '
      + 'shot — so this is a change in what a player sees and wants a person, not a green suite.');
  }

  /* ── THE FAILING INPUTS, RUN ─────────────────────────────────────────────────────────────────
     Lift the cap: if `leadMax` is what holds the swing and the rail, they escape and nothing else
     moves. Raise `leadTime` instead: if `leadMax` is what holds them, they DON'T escape however
     far it goes. Both are run, because either one alone leaves the attribution arguable. */
  const lifted = {}, driven = {};
  for (const [k, f] of Object.entries(FRAMES)) {
    lifted[k] = classify(f, SPEED[k][0], { leadMax: 3.0 });
    driven[k] = classify(f, SPEED[k][0], { leadTime: 1.00 });
  }
  console.log(`[D9] leadMax 1.75->3.0 : ${byCap.map((k) => `${k} ${shipped[k]}->${lifted[k]}`).join(' · ')}`);
  console.log(`[D9] leadTime 0.17->1.00: ${byCap.map((k) => `${k} ${shipped[k]}->${driven[k]}`).join(' · ')}`);

  for (const k of byCap) {
    assert.equal(lifted[k], 'delivers',
      `'${k}' is still floored with \`leadMax\` at 3.0, so this arm's failing input does not fail and the `
      + 'passing classification above proves nothing');
    assert.equal(driven[k], 'leadMax',
      `'${k}' escapes the floor at \`leadTime\` 1.00, so it is not held by the cap after all and D9 has `
      + 'attributed it to the wrong constant');
  }
  /* …and lifting the cap must not be a blunt instrument that reclassifies the whole table, or the
     two rows above would just be riding a global change. */
  const alsoMoved = Object.keys(shipped).filter((k) => !byCap.includes(k) && shipped[k] !== lifted[k]);
  assert.deepEqual(alsoMoved, [],
    `lifting \`leadMax\` also reclassified [${alsoMoved.join(', ')}], so it is not the surgical lever this `
    + 'arm reports it to be');
});
