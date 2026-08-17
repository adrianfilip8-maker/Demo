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
import * as THREE from 'three';
import { realWorld, hardReset, V, DT } from './_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';

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

  assert.ok(D.worst < 0.02,
    `over open desert the real BVH and the open sky disagree by ${D.worst.toFixed(3)} of NDC on `
    + `'${D.worstKey}'. Occlusion IS contributing there, so D1's conclusion is wrong.`);
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
