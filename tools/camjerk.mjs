/**
 * camjerk.mjs — WHERE IS THE ABRUPTNESS, MEASURED AT THE SCREEN.
 *
 * Commissioned by the owner's "can the camera transitions be slightly smoothed out?" (§744).
 * The question a person asks about a camera is about the OUTPUT, so this instrument never reads
 * `FRAMES.tau`. It reads the camera's own pose — position, orientation, field of view — and asks
 * one question of every state change a real driven route produces:
 *
 *   **How much of the camera's velocity appears in the single frame the framing switched on,
 *   that would not have appeared if the framing had not switched?**
 *
 * That is the discontinuity. A blend that is merely *fast* moves the camera quickly and reads as
 * a fast camera; a blend whose derivative STEPS at the switch reads as a jolt, and it is the
 * second that the word "abrupt" describes. `ease()` is a first-order exponential, so at the
 * instant its target changes its rate goes from whatever it was to `Δ/τ` in one frame — the
 * position stays continuous and the velocity does not. This measures exactly that step.
 *
 * ── THE COUNTERFACTUAL IS WHAT MAKES IT ATTRIBUTABLE (§439) ────────────────────────────────
 * A state change usually coincides with a physical event — a touchdown, a launch, a wall. The
 * camera legitimately accelerates for those, and an instrument that simply looked for a spike at
 * a state change would rank the landing impact, not the framing blend. So every transition is
 * measured against a **pinned replay of the same recorded trajectory**, with `stateName` held at
 * the state the player was in the frame BEFORE the switch. The two runs are bit-identical up to
 * and including frame `k0-1` by construction — same trajectory, same framing, same collision —
 * so any difference at `k0` is the framing switch and nothing else. The trajectory's own
 * acceleration is in both arms and subtracts out exactly.
 *
 *   stepLin  = |(vA[k0] − vA[k0−1]) − (vP[k0] − vP[k0−1])|   m/s   camera translation
 *   stepAng  = the same on the angular velocity                rad/s  camera rotation
 *   stepFov  = the same on the FOV rate                        deg/s  the lens
 *
 * The three are combined into one rank by expressing each as a fraction of a **perceptual unit**
 * — see `PERC` — because a metre of camera translation and a radian of camera rotation are not
 * the same amount of screen, and ranking on any one of them alone picks the channel rather than
 * the transition.
 *
 * ── CONTROLS, IN-RUN (§418.3 / §439 / §440) ────────────────────────────────────────────────
 * `--controls` re-runs the identical routes three times:
 *   POSITIVE   one framing's `tau` forced to 0.004 s — a cut in all but name. It MUST rank worst.
 *   NEGATIVE   the same framing's `tau` forced to 6.0 s — the blend barely starts. It MUST rank
 *              far below its shipped self.
 *   NULL       the same framing's channels set equal to the framing it is entered from, so the
 *              switch has nothing to move. It MUST read ~0 — this is the control on the
 *              COUNTERFACTUAL rather than on the ease, and it is the one that would catch a
 *              replay that is not reproducible frame-for-frame.
 * A rank that does not move under the positive control is not measuring abruptness.
 *
 * Usage:
 *   node tools/camjerk.mjs                 rank every transition on the shipped rig
 *   node tools/camjerk.mjs --controls      the three controls above, printed beside the shipped run
 *   node tools/camjerk.mjs --json out.json machine-readable, for a before/after diff
 */
import * as THREE from 'three';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { realWorld, hardReset, V, DT } from '../tests/_moveset.mjs';
import { CameraRig as CameraRigShipped, TUNE as TUNE_SHIPPED } from '../src/player/CameraRig.js';
import { TUNE as CTUNE } from '../src/player/Controller.js';

const argv = process.argv.slice(2);
const WANT_CONTROLS = argv.includes('--controls');
const JSON_OUT = (() => { const i = argv.indexOf('--json'); return i >= 0 ? argv[i + 1] : null; })();

/* Perceptual units: the amount of each channel that reads as "the same size of jolt".
   Derived from the rig's own constants rather than picked, so a retune moves them with it:
     · translation  `TUNE.deadzoneH` — the rig's own statement of "a pivot move this small is
       not a move at all", so one deadzone appearing in one frame is one unit of jolt.
     · rotation     `TUNE.shakeRot` — the impact shake's rotation amplitude, the file's own
       calibrated "this reads as an impact".
     · lens         `TUNE.shakeFov` — the same, for the lens.
   They are a RANKING device. Every absolute number below is printed in its own physical unit
   as well, so nothing downstream has to trust the weighting. */
export const PERC = { lin: null, ang: null, fov: null };

class LookInput {
  constructor() { this.look = { x: 0, y: 0 }; this.move = { x: 0, y: 0 }; this.zoom = 0; }
  pressed() { return false; } down() { return false; }
}

export async function trace(start, yaw, frames, drive, pre) {
  const { engine, c, collision } = await realWorld();
  /* ── THE ENGINE IS CACHED AND ITS CAMERA IS SHARED (§745) ─────────────────────────────────
     `realWorld()` mints a fresh `Controller` per call but hands back the SAME engine, and
     MOVEMENT is camera-relative — so a drive script that aims the engine camera (the ring swing
     does, exactly as `tests/swingpin.test.mjs` does) leaves that aim behind for every route
     recorded afterwards in the same process. Observed: recording the swing before §744's eight
     routes changed their trajectories, which changed the transition count 53 → 54 and every
     delivery ratio, and the numbers looked like plausible camera numbers. Snapshotted and
     restored here so a route cannot reach the next one. */
  const camQ = engine.camera?.quaternion.clone();
  const camP = engine.camera?.position.clone();
  hardReset(engine, c, start, yaw);
  if (pre) pre(c);
  c._needSpawnSnap = false;
  const samples = [];
  for (let i = 0; i < frames; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    drive(engine.input, i, c, engine);
    engine.time = i * DT;
    c.update(DT, i * DT);
    samples.push({ state: c.stateName, px: c.position.x, py: c.position.y, pz: c.position.z,
      vx: c.velocity.x, vy: c.velocity.y, vz: c.velocity.z, grounded: c.grounded, yaw: c.yaw });
  }
  if (engine.camera && camQ) { engine.camera.quaternion.copy(camQ); engine.camera.position.copy(camP); engine.camera.updateMatrixWorld(true); }
  return { samples, collision };
}

/**
 * One replay. `pin` is `{from, state}`: the recorded state is fed unchanged for every frame
 * before `from`, and `state` from `from` onward. **Feeding the pin from frame 0 instead is the
 * first thing this instrument got wrong** — the counterfactual then diverges at every EARLIER
 * transition on the route and the pre-switch drift reached 2.52 m, so the "attributable" step was
 * partly two states' worth of accumulated disagreement. Pinning from the switch frame makes the
 * two runs bit-identical up to `from−1`, which the caller then asserts rather than assumes.
 */
export function replay(samples, collision, pin, ARM) {
  const { CameraRig, TUNE } = ARM || { CameraRig: CameraRigShipped, TUNE: TUNE_SHIPPED };
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
    const feed = (s, i) => { movement.position.set(s.px, s.py, s.pz); movement.velocity.set(s.vx, s.vy, s.vz);
      movement.stateName = (pin && i >= pin.from) ? pin.state : s.state;
      movement.grounded = s.grounded; movement.yaw = s.yaw; };
    feed(samples[0], 0); rig.snap?.(true);
    const out = [];
    for (let i = 0; i < samples.length; i++) {
      feed(samples[i], i); engine.dt = DT; engine.time = i * DT;
      rig.update(DT);
      out.push({
        key: rig._frameKey, state: samples[i].state,
        x: cam.position.x, y: cam.position.y, z: cam.position.z,
        qx: cam.quaternion.x, qy: cam.quaternion.y, qz: cam.quaternion.z, qw: cam.quaternion.w,
        fov: cam.fov, boom: rig.boom, fdist: rig._frame.dist,
        pivX: rig.pivot.x, pivY: rig.pivot.y, pivZ: rig.pivot.z,
        rx: rig.right.x, rz: rig.right.z, epitch: rig._effectivePitch(),
        ...ndcOf(cam, samples[i]),
      });
    }
    return out;
  } finally { TUNE.leadMode = keep; }
}

/* Angular velocity of the camera between two frames, as a rotation-vector / dt (rad/s). */
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qd = new THREE.Quaternion();
function angVel(a, b, out) {
  _qa.set(a.qx, a.qy, a.qz, a.qw); _qb.set(b.qx, b.qy, b.qz, b.qw);
  _qd.copy(_qa).invert().multiply(_qb);
  if (_qd.w < 0) { _qd.x = -_qd.x; _qd.y = -_qd.y; _qd.z = -_qd.z; _qd.w = -_qd.w; }
  const s = Math.hypot(_qd.x, _qd.y, _qd.z);
  const ang = 2 * Math.atan2(s, _qd.w);
  const k = s > 1e-12 ? ang / (s * DT) : 0;
  out.set(_qd.x * k, _qd.y * k, _qd.z * k);
  return out;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();

/**
 * Where the SUBJECT sits on screen (§745). A camera that moves less does not make the shot
 * quieter for free — it makes the subject move MORE within the frame, and that is the trade the
 * owner is really being offered: the pendulum arc gets conveyed by Sly crossing the frame instead
 * of by the world sweeping past. Both halves are measured so the trade is visible rather than
 * asserted, and `behind` counts the frames where the subject is off the back of the lens, which
 * `Vector3.project` would otherwise report as a plausible number (§419).
 */
const _subj = new THREE.Vector3(), _fw = new THREE.Vector3(), _rel = new THREE.Vector3();
function ndcOf(cam, s) {
  _subj.set(s.px, s.py + 0.9, s.pz);
  cam.getWorldDirection(_fw);
  _rel.copy(_subj).sub(cam.position);
  if (_rel.dot(_fw) <= cam.near) return { ndcX: null, ndcY: null };
  _subj.project(cam);
  return { ndcX: _subj.x, ndcY: _subj.y };
}
function linVel(a, b, out) { return out.set((b.x - a.x) / DT, (b.y - a.y) / DT, (b.z - a.z) / DT); }

/**
 * The switch-attributable velocity step at frame k, one channel at a time.
 * A[k-1] and P[k-1] are identical by construction (same framing up to the switch), so
 * `(vA[k] − vA[k−1]) − (vP[k] − vP[k−1])` reduces to `vA[k] − vP[k]` and is reported as such.
 */
function stepAt(A, P, k) {
  linVel(A[k - 1], A[k], _v1); linVel(P[k - 1], P[k], _v2);
  const lin = _v1.sub(_v2).length();
  angVel(A[k - 1], A[k], _v3); angVel(P[k - 1], P[k], _v4);
  const ang = _v3.sub(_v4).length();
  const fov = Math.abs((A[k].fov - A[k - 1].fov) - (P[k].fov - P[k - 1].fov)) / DT;
  return { lin, ang, fov };
}

/**
 * The FASTEST the framing blend ever moves the camera, over the whole blend, not just its first
 * frame. Reported beside the step because the two can be traded against each other and a report
 * that quoted only the step could hide a filter that merely POSTPONES the jolt: a first-order
 * ease has `peak === step` by construction (it is monotone from the switch), while any
 * soft-start blend moves its peak a few frames in. If `peak` rises as much as `step` falls,
 * nothing has been smoothed — the motion has been relabelled.
 *
 * **It is a SECONDARY diagnostic and the window is why.** The two arms are identical only up to
 * the switch; after it they occupy different poses, so far enough out the "attributable"
 * difference is two cameras meeting different geometry rather than one blend moving. Measured on
 * a 40-frame window, `air → wall_run` reported a peak of 594 against a step of 1.6 — a boom cast
 * that clipped a wall in one arm and not the other. The window is 8 frames for that reason, which
 * covers 1.5 time constants of the shortest framing and roughly a quarter of the longest.
 */
function peakAt(A, P, k, span) {
  let lin = 0, ang = 0, fov = 0;
  const end = Math.min(A.length - 1, k + span);
  for (let j = k; j <= end; j++) {
    linVel(A[j - 1], A[j], _v1); linVel(P[j - 1], P[j], _v2);
    lin = Math.max(lin, _v1.sub(_v2).length());
    angVel(A[j - 1], A[j], _v3); angVel(P[j - 1], P[j], _v4);
    ang = Math.max(ang, _v3.sub(_v4).length());
    fov = Math.max(fov, Math.abs((A[j].fov - A[j - 1].fov) - (P[j].fov - P[j - 1].fov)) / DT);
  }
  return { lin, ang, fov };
}

/* Real driven routes. Every state is entered through the movement state machine by scripted
   input (§435.4) — nothing here pokes `_frame` or `sm.set` except to establish a start pose that
   a spawn cannot give (a mid-air glide, a 15 m drop), and those are marked. */
const ST = { fired: false };
export const ROUTES = [
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

/**
 * THE RING SWING (§745), kept OUT of `ROUTES` on purpose.
 *
 * `ROUTES` is the census §744's published before/after numbers were measured on — 1860 frames, 53
 * transitions, seventeen pooled pairs. Adding an eighth route to it would silently re-base every
 * one of those, so the swing lives beside it and the §744 comparison stays a comparison.
 *
 * A real ring, entered the way a player enters it (§435.4): freefall past the hanging rings at
 * (4.20, 14.80, 4.50) with forward held, and the auto-grab does the rest — `Controller.afford`
 * finds the hook, `HookSwing.enter` takes it. Nothing here pokes `hookSwing`; the only poke is
 * `sm.set('fall')` to start airborne, which a spawn cannot do. Driven: `fall` 0-14,
 * **`hookSwing` 15-239 (225 frames, 3.75 s)**, released on the jump press at 240 into `fall`.
 * The pendulum sweeps 0.2-99.9 deg of deviation over roughly three decaying cycles and the
 * capsule peaks at 11.07 m/s, so this is the move at its liveliest rather than a gentle sample.
 *
 * MOVEMENT is camera-relative, so the drive holds the engine camera at yaw pi every frame exactly
 * as `tests/swingpin.test.mjs` does. That camera is NOT the rig under test — `trace` records the
 * capsule and `replay` drives a fresh rig over it — so this fixes the INPUT basis and leaves the
 * measured camera free.
 */
const SWING_DRIVE = (inp, i, cc, eng) => {
  inp.move.y = 1;
  if (eng?.camera) { eng.camera.rotation.set(0, Math.PI, 0, 'YXZ'); eng.camera.updateMatrixWorld(true); }
  if (i === 240) inp.hold('jump'); else inp.let_go('jump');
};

/**
 * FIVE swings at the same ring, not one (§745). Swing amplitude is a function of entry speed and
 * height, so a single sample cannot tell a calmer camera from a smaller swing — the five below
 * span 87-109 deg of pendulum deviation and 9.5-11.6 m/s of capsule speed, and every arm is
 * measured on all five with the CAPSULE PATH reported beside the camera's as the paired control.
 * Entry is the auto-grab in every case: freefall past the rings with forward held.
 */
export const SWING_STARTS = [
  ['A slow', [4.2, 13.2, 0.0], [0, 1.0, 6.0]],
  ['C low', [4.2, 12.6, 0.6], [0, 2.0, 5.0]],
  ['D drop', [4.2, 15.6, 2.2], [0, -1.0, 3.0]],
  ['E side', [3.0, 13.2, 0.0], [1.2, 1.0, 6.0]],
  ['F gentle', [4.2, 13.0, 1.0], [0, 1.5, 4.0]],
];

export const SWING_ROUTE = ['ring swing', V(4.2, 12.4, 1.2), 0, 300, SWING_DRIVE,
  (c) => { c.position.set(4.2, 13.2, 0); c.velocity.set(0, 1.0, 6.0); c.grounded = false; c.sm.set('fall'); }];

/** Record all five. */
export async function recordSwings() {
  const out = [];
  for (const [label, p, v] of SWING_STARTS) {
    out.push([label, await trace(V(4.2, 12.4, 1.2), 0, 300, SWING_DRIVE,
      (c) => { c.position.set(p[0], p[1], p[2]); c.velocity.set(v[0], v[1], v[2]); c.grounded = false; c.sm.set('fall'); })]);
  }
  return out;
}

export async function record() {
  const out = [];
  for (const [label, start, yaw, nf, drive, pre] of ROUTES) {
    out.push([label, await trace(start, yaw, nf, drive, pre)]);
  }
  return out;
}

/** Rank every framing transition on a set of recorded routes. */
export function rank(recorded, ARM) {
  const events = [];
  for (const [label, t] of recorded) {
    const A = replay(t.samples, t.collision, null, ARM);
    for (let k = 2; k < A.length; k++) {
      if (A[k].key === A[k - 1].key) continue;
      const prevState = A[k - 1].state;
      const P = replay(t.samples, t.collision, { from: k, state: prevState }, ARM);
      /* The counterfactual is only valid if it really is identical before the switch. Checked
         rather than assumed — a mismatch here means the pinning did not reproduce the run and
         every number after it is noise. Expected EXACTLY 0: same inputs, same code path. */
      const drift = Math.hypot(A[k - 1].x - P[k - 1].x, A[k - 1].y - P[k - 1].y, A[k - 1].z - P[k - 1].z);
      const s = stepAt(A, P, k);
      /* Residency of the framing being entered, in frames. */
      let n = 1; while (k + n < A.length && A[k + n].key === A[k].key) n++;
      /* The boom's own single-frame move, in mm — the most legible number in the file, and the
         one the §442.1 chain collapse's p99 could not see (2 dive entries in 1852 frames sit
         above the 99th percentile by construction). */
      const dBoom = Math.abs(A[k].boom - A[k - 1].boom) * 1000;
      const pk = peakAt(A, P, k, Math.min(n, 8));
      events.push({ route: label, frame: k, from: A[k - 1].key, to: A[k].key,
        fromState: prevState, toState: A[k].state, drift, resid: n, dBoom, ...s,
        pLin: pk.lin, pAng: pk.ang, pFov: pk.fov,
        peak: pk.lin / PERC.lin + pk.ang / PERC.ang + pk.fov / PERC.fov,
        score: s.lin / PERC.lin + s.ang / PERC.ang + s.fov / PERC.fov });
    }
  }
  events.sort((a, b) => b.score - a.score);
  return events;
}

export function pool(events) {
  const by = new Map();
  for (const e of events) {
    const kk = `${e.from} -> ${e.to}`;
    if (!by.has(kk)) by.set(kk, { n: 0, lin: 0, ang: 0, fov: 0, score: 0, peak: 0, pLin: 0, worst: 0, resid: [], drift: 0, dBoom: 0 });
    const b = by.get(kk);
    b.n++; b.lin += e.lin; b.ang += e.ang; b.fov += e.fov; b.score += e.score;
    b.peak += e.peak; b.pLin += e.pLin;
    b.worst = Math.max(b.worst, e.score); b.drift = Math.max(b.drift, e.drift);
    b.dBoom = Math.max(b.dBoom, e.dBoom); b.resid.push(e.resid);
  }
  const rows = [...by].map(([k, b]) => ({ pair: k, n: b.n, lin: b.lin / b.n, ang: b.ang / b.n,
    fov: b.fov / b.n, score: b.score / b.n, peak: b.peak / b.n, pLin: b.pLin / b.n,
    worst: b.worst, drift: b.drift, dBoom: b.dBoom,
    medResid: b.resid.sort((x, y) => x - y)[b.resid.length >> 1] }));
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

function printPool(title, rows) {
  console.log(`\n${title}`);
  console.log('  transition                    n  medRes |  lin m/s   ang rad/s  fov deg/s | boom mm |  STEP   worst |  PEAK  peakLin | drift');
  for (const r of rows) {
    console.log(`  ${r.pair.padEnd(28)} ${String(r.n).padStart(2)} ${String(r.medResid).padStart(6)}  | `
      + `${r.lin.toFixed(4).padStart(8)} ${r.ang.toFixed(4).padStart(10)} ${r.fov.toFixed(3).padStart(10)} | `
      + `${r.dBoom.toFixed(1).padStart(7)} | `
      + `${r.score.toFixed(2).padStart(6)} ${r.worst.toFixed(2).padStart(7)} | `
      + `${r.peak.toFixed(2).padStart(6)} ${r.pLin.toFixed(3).padStart(8)} | ${r.drift.toExponential(1)}`);
  }
}

/* ====================================================================== */
/* delivery — D6's screen-side scorer, so a smoothing change can be        */
/* rejected for costing a framing its reachability (§744 method item 3)    */
/* ====================================================================== */

/**
 * Lifted deliberately from `tests/camdrive.test.mjs` D6 rather than reinvented: the whole point
 * of the before/after claim is that it is scored by the SAME scorer the published delivery table
 * was scored by. `delivered = (peak reached during the residency − value on entry) / (value the
 * same trajectory converges to with the state PINNED − value on entry)`, absolute-weighted
 * `Σ|got| / Σ|asked|` across every visit, because the mean of per-visit fractions flatters.
 */
export const SCREEN = [
  ['boom', 0.05], ['fov', 0.30], ['pivY', 0.05],
  ['lead', 0.08], ['side', 0.05], ['pitch', 0.010],
];

function screenReplay(samples, collision, pin, ARM) {
  const raw = replay(samples, collision, pin ? { from: 0, state: pin } : null, ARM);
  return raw.map((r, i) => {
    const s = samples[i];
    const sp = Math.hypot(s.vx, s.vz);
    const dx = r.pivX - s.px, dz = r.pivZ - s.pz;
    return { key: r.key, state: s.state, boom: r.boom, fov: r.fov, pivY: r.pivY - s.py,
      lead: sp > 0.4 ? (dx * s.vx + dz * s.vz) / sp : null,
      side: dx * r.rx + dz * r.rz, pitch: r.epitch };
  });
}

export function delivery(recorded, ARM) {
  const table = new Map();
  for (const [, t] of recorded) {
    const A = screenReplay(t.samples, t.collision, null, ARM);
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
      const B = screenReplay(t.samples, t.collision, r.state, ARM);
      const enter = A[r.s - 1];
      let rec = table.get(r.key);
      if (!rec) { rec = { visits: 0, frames: 0, lens: [], ch: {} }; table.set(r.key, rec); }
      rec.visits++; rec.frames += len; rec.lens.push(len);
      for (const [name, minSpan] of SCREEN) {
        const ref = B[r.e][name], e0 = enter[name];
        if (ref == null || e0 == null) continue;
        const span = ref - e0;
        const c = rec.ch[name] = rec.ch[name] || { asked: 0, got: 0, miss: 0, visits: 0 };
        /* ── `miss`, AND WHY IT IS THE STATISTIC A BEFORE/AFTER MAY BE JUDGED ON ─────────────
           The D6 ratio below is a fraction of `asked`, and `asked` is the distance still to travel
           WHEN THE STATE BEGINS — a fact about where the previous blend left the camera. Two arms
           of a smoothing change do not agree about that, and the disagreement IS the change
           working: on the `combo` route, where combat and idle alternate every 30 frames and the
           camera never fully returns, the soft arm enters each combat already nearer the combat
           framing (per-visit spans −1.381/−0.770/−0.402/−0.558° become
           −1.111/−0.544/−0.316/−0.436°). `asked` falls 5.95° → 5.25° and any absolute measured
           from the ENTRY falls with it, which reads as a 10 % regression and is the opposite of
           one — the per-visit fractions are the same or better and the lens is closer throughout.

           `miss` is measured from the TARGET instead: the closest the screen ever got to the
           framing during the visit, in the channel's own unit, summed over visits. It does not
           care where the visit started, it needs no `minSpan` gate so its population cannot move
           between arms, and the reference it is measured against is the settled pinned run, which
           is arm-invariant (checked: the four `combat` fov references agree to 4 decimals across
           both arms). It is exactly the question "how much of this framing was missing from the
           screen at its best moment", which is what "did a framing get less reachable" asks. */
        let miss = Infinity, peak = 0;
        for (let i = r.s; i <= r.e; i++) {
          const v = A[i][name];
          if (v == null) continue;
          miss = Math.min(miss, Math.abs(v - ref));
          if (span !== 0) peak = Math.max(peak, (v - e0) / span);
        }
        if (!Number.isFinite(miss)) continue;
        c.miss += miss; c.visits++;
        if (Math.abs(span) < minSpan) continue;
        const frac = Math.max(0, Math.min(1.2, peak));
        c.asked += Math.abs(span); c.got += frac * Math.abs(span);
      }
    }
  }
  return table;
}

export const absOf = (c) => (c && c.asked > 1e-9 ? c.got / c.asked : NaN);

/* ====================================================================== */
/* §745 — DURING a state, not at the switch into it                       */
/* ====================================================================== */

/**
 * "How much is the camera moving?" — measured over a residency instead of at its first frame.
 *
 * §744's `stepAt` scores the SWITCH; the owner's ring-swing complaint is about the 3.75 s after
 * it. The four candidate readings of "amount of movement" are all computed because **they are not
 * the same quantity and halving one does not halve another**, and the choice between them has to
 * be auditable rather than asserted:
 *
 *   path       Σ|Δpos| over the residency, metres. How far the camera travelled, full stop.
 *   rms        √mean(|Δpos|²)/dt, m/s. Path's cousin, weighted toward the fast frames.
 *   peak       max|Δpos|/dt, m/s. The single worst instant.
 *   angPath    Σ|Δangle|, radians. The same question asked of orientation, which for a camera
 *              orbiting a pendulum is a large part of what a player is actually watching.
 *
 * And three that answer "is it SMOOTH", which is the request's second half:
 *
 *   rmsAcc     √mean(|Δv|²)/dt, m/s². Jerkiness, integrated.
 *   peakAcc    max|Δv|/dt, m/s². The worst discontinuity INSIDE the state — the residency's
 *              analogue of §744's step, and the number that says whether the motion is a smooth
 *              arc or a sequence of corrections.
 *   reversals  sign changes of the camera's velocity along each world axis. A camera that
 *              travels far in one direction reads as a pan; one that travels the same distance
 *              back and forth reads as busy.
 *
 * **`playerPath` is the floor and it is why a raw halving would be the wrong target.** The
 * capsule travels its own arc, and a camera that does not follow it loses Sly — rule 6 then
 * drags the view back, which is more motion, not less. So the irreducible component is reported
 * with every run and the interesting number is the camera's path AGAINST it.
 */
export function residency(samples, out, key, skipFrames = 0) {
  const spans = [];
  let cur = null;
  for (let i = 0; i < out.length; i++) {
    if (out[i].key !== key) { if (cur) { spans.push(cur); cur = null; } continue; }
    if (!cur) cur = { s: i, e: i };
    cur.e = i;
  }
  if (cur) spans.push(cur);
  const R = { frames: 0, spans: spans.length, path: 0, sq: 0, peak: 0, angPath: 0, peakAng: 0,
    accSq: 0, peakAcc: 0, boomPath: 0, fovPath: 0, playerPath: 0, relPath: 0, flowSum: 0,
    flowPeak: 0, rev: 0, n: 0, nAcc: 0, ndcPath: 0, ndcMax: 0, ndcSum: 0, behind: 0, pivPath: 0 };
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
  const fwd = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const sp of spans) {
    const s = Math.min(sp.s + skipFrames, sp.e);
    let prevSign = 0;
    for (let i = s + 1; i <= sp.e; i++) {
      const d = Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y, out[i].z - out[i - 1].z);
      R.path += d; R.sq += d * d; R.peak = Math.max(R.peak, d / DT); R.n++;
      angVel(out[i - 1], out[i], v0);
      const ang = v0.length() * DT;
      R.angPath += ang; R.peakAng = Math.max(R.peakAng, ang / DT);
      R.boomPath += Math.abs(out[i].boom - out[i - 1].boom);
      R.fovPath += Math.abs(out[i].fov - out[i - 1].fov);
      R.playerPath += Math.hypot(samples[i].px - samples[i - 1].px, samples[i].py - samples[i - 1].py,
        samples[i].pz - samples[i - 1].pz);
      /* The camera's path IN THE PLAYER'S FRAME — the part of the translation the camera adds
         rather than inherits. `path` minus this is Sly's own arc being carried along. */
      R.pivPath += Math.hypot(out[i].pivX - out[i - 1].pivX, out[i].pivY - out[i - 1].pivY, out[i].pivZ - out[i - 1].pivZ);
      R.relPath += Math.hypot((out[i].x - samples[i].px) - (out[i - 1].x - samples[i - 1].px),
        (out[i].y - samples[i].py) - (out[i - 1].y - samples[i - 1].py),
        (out[i].z - samples[i].pz) - (out[i - 1].z - samples[i - 1].pz));
      /* OPTICAL FLOW, rad/s — how fast the IMAGE sweeps, which is the thing a person watching
         calls "the camera moving". Rotation moves every pixel at `|ω|`; translation moves a
         feature at depth D by `|v_perp| / D`, where `v_perp` is the part of the camera's velocity
         across the view axis (the along-axis part is a dolly, not a sweep). D is `distDefault`
         5.4 m, the rig's own nominal boom — a scene reference read out of the file rather than
         picked, and the same in every arm so the comparison never depends on it. */
      v1.set((out[i].x - out[i - 1].x) / DT, (out[i].y - out[i - 1].y) / DT, (out[i].z - out[i - 1].z) / DT);
      q.set(out[i].qx, out[i].qy, out[i].qz, out[i].qw);
      fwd.set(0, 0, -1).applyQuaternion(q);
      v1.addScaledVector(fwd, -v1.dot(fwd));
      const flow = ang / DT + v1.length() / TUNE_SHIPPED.distDefault;
      R.flowSum += flow; R.flowPeak = Math.max(R.flowPeak, flow);
      /* The other side of the trade: how far the SUBJECT travels across the frame. */
      if (out[i].ndcX == null || out[i - 1].ndcX == null) R.behind++;
      else {
        R.ndcPath += Math.hypot(out[i].ndcX - out[i - 1].ndcX, out[i].ndcY - out[i - 1].ndcY);
        const r = Math.hypot(out[i].ndcX, out[i].ndcY);
        R.ndcMax = Math.max(R.ndcMax, r); R.ndcSum += r;
      }
      const sgn = Math.sign(out[i].z - out[i - 1].z);
      if (sgn && prevSign && sgn !== prevSign) R.rev++;
      if (sgn) prevSign = sgn;
      if (i > s + 1) {
        a0.set(out[i - 1].x - out[i - 2].x, out[i - 1].y - out[i - 2].y, out[i - 1].z - out[i - 2].z).divideScalar(DT);
        a1.set(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y, out[i].z - out[i - 1].z).divideScalar(DT);
        const acc = a1.sub(a0).length() / DT;
        R.accSq += acc * acc; R.peakAcc = Math.max(R.peakAcc, acc); R.nAcc++;
      }
    }
    R.frames += sp.e - s + 1;
  }
  void v1;
  R.secs = R.n * DT;
  R.rms = R.n ? Math.sqrt(R.sq / R.n) / DT : 0;
  R.mean = R.secs ? R.path / R.secs : 0;
  R.rmsAcc = R.nAcc ? Math.sqrt(R.accSq / R.nAcc) : 0;
  R.ratio = R.playerPath > 1e-9 ? R.path / R.playerPath : NaN;
  R.perSec = R.secs > 1e-9 ? R.path / R.secs : 0;
  R.playerPerSec = R.secs > 1e-9 ? R.playerPath / R.secs : 0;
  R.flow = R.n ? R.flowSum / R.n : 0;
  R.ndcMean = R.n ? R.ndcSum / R.n : 0;
  return R;
}

/**
 * A patched copy of the rig, loaded as its own module so a control can change a constant without
 * mutating the shipped one. `CameraRig.js` imports nothing but the bare specifier `three`, so a
 * copy inside the project tree resolves identically; a copy outside it would not.
 */
export async function armWith(edits, tag) {
  const src = readFileSync(new URL('../src/player/CameraRig.js', import.meta.url), 'utf8');
  let out = src;
  for (const [find, repl] of edits) {
    if (out.split(find).length !== 2) throw new Error(`arm ${tag}: '${find}' is not unique in CameraRig.js`);
    out = out.replace(find, repl);
  }
  const p = new URL(`./.camjerk-arm-${tag}.mjs`, import.meta.url);
  writeFileSync(p, out);
  try { return await import(p.href + `?t=${Date.now()}`); } finally { rmSync(p, { force: true }); }
}

const SWEEP = (() => { const i = argv.indexOf('--sweep'); return i >= 0 ? argv[i + 1].split(',').map(Number) : null; })();
const VARIANTS = argv.includes('--variants');
const SWING = (() => { const i = argv.indexOf('--swing'); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '') : null; })();
const SKIP = (() => { const i = argv.indexOf('--skip'); return i >= 0 ? Number(argv[i + 1]) : 30; })();
const SHAPE = (() => { const i = argv.indexOf('--shape'); return i >= 0 ? Number(argv[i + 1]) : null; })();

async function main() {
  const TUNE = TUNE_SHIPPED;
  PERC.lin = TUNE.deadzoneH; PERC.ang = TUNE.shakeRot; PERC.fov = TUNE.shakeFov;
  console.log(`[camjerk] perceptual units: lin ${PERC.lin} m/s (deadzoneH) · ang ${PERC.ang} rad/s (shakeRot) · fov ${PERC.fov} deg/s (shakeFov)`);
  if (SHAPE !== null) TUNE.frameBlendShape = SHAPE;
  console.log(`[camjerk] TUNE.frameBlendShape in force: ${TUNE.frameBlendShape}`
    + (SHAPE !== null ? ' (--shape override)' : ' (as the file ships)'));
  const recorded = await record();
  console.log(`[camjerk] ${recorded.length} routes recorded, ${recorded.reduce((a, [, t]) => a + t.samples.length, 0)} frames`);

  /* ---- the sweep: one number changed, everything else identical -------------------------- */
  if (SWEEP) {
    const rows = [];
    const keys = new Set();
    for (const k of SWEEP) {
      TUNE.frameBlendShape = k;
      const ev = rank(recorded);
      const p = pool(ev);
      const del = delivery(recorded);
      for (const kk of del.keys()) keys.add(kk);
      rows.push({ k, p, del, worstStep: ev[0], meanStep: ev.reduce((a, e) => a + e.score, 0) / ev.length,
        meanPeak: ev.reduce((a, e) => a + e.peak, 0) / ev.length,
        worstBoom: ev.reduce((a, e) => Math.max(a, e.dBoom), 0) });
    }
    console.log('\n[camjerk] SWEEP — frameBlendShape (0 = shipped first-order ease)');
    console.log('  shape |  worst STEP  (which)             | worst boom mm | mean STEP | mean PEAK');
    for (const r of rows) {
      console.log(`  ${String(r.k).padStart(5)} | ${r.worstStep.score.toFixed(2).padStart(10)}  ${(r.worstStep.from + '->' + r.worstStep.to).padEnd(22)} | `
        + `${r.worstBoom.toFixed(1).padStart(13)} | ${r.meanStep.toFixed(2).padStart(9)} | ${r.meanPeak.toFixed(2).padStart(9)}`);
    }
    const CH = ['boom', 'fov', 'pivY', 'lead', 'side', 'pitch'];
    for (const ch of CH) {
      console.log(`\n[camjerk] SWEEP delivery — ${ch} (absolute-weighted, D6's scorer); a row that FALLS is a regression`);
      console.log('  framing     ' + rows.map((r) => `sh=${r.k}`.padStart(8)).join(''));
      for (const key of [...keys].sort()) {
        const cells = rows.map((r) => { const c = r.del.get(key)?.ch[ch]; return (c && c.asked > 1e-9 ? `${(100 * absOf(c)).toFixed(0)}%` : '—').padStart(8); });
        if (cells.every((c) => c.trim() === '—')) continue;
        /* `asked` is printed because the scorer drops a visit whose span is under `minSpan`, so a
           row can move for a reason that is not delivery at all — the POPULATION changed. A
           before/after that did not show this could report a regression that is a different set
           of visits. */
        const asked = rows.map((r) => { const c = r.del.get(key)?.ch[ch]; return (c ? c.asked.toFixed(2) : '—').padStart(8); });
        /* And `got` in the channel's own unit, because a percentage can fall while the DELIVERED
           quantity rises — it happens here on `lead`, where the population grew faster than the
           ratio. The absolute is the one that answers "did a framing get less reachable". */
        const got = rows.map((r) => { const c = r.del.get(key)?.ch[ch]; return (c ? c.got.toFixed(3) : '—').padStart(8); });
        console.log(`  ${key.padEnd(12)}` + cells.join('') + '   asked' + asked.join('') + '   got' + got.join(''));
      }
    }
    TUNE.frameBlendShape = rows[0].k;
    return;
  }

  /* ---- §745: the ring swing's RESIDENCY, and the levers that move it -------------------- */
  if (SWING !== null) {
    const [, start, yaw, nf, drive, pre] = SWING_ROUTE;
    const t = await trace(start, yaw, nf, drive, pre);
    const nSwing = t.samples.filter((s) => s.state === 'hookSwing').length;
    console.log(`[camjerk] ring swing recorded: ${nSwing} hookSwing frames of ${t.samples.length}`);

    const HOOK = '  hook_swing: { dist:  2.30, height:  0.55, lead: 1.60, fov:  1.0, pitch: -3.0 * DEG, side: 0.85, stiff: 1.50, tau: 0.30, vtip: 0.00 },';
    /* BEFORE is the shipped module with `?cam=swingtip` on, so the two arms differ in exactly the
       one number the token names and nothing else — a before/after rather than a reconstruction. */
    const arms = [['BEFORE (?cam=swingtip)', null, 1], ['SHIPPED §745', null, null]];
    for (const spec of (SWING || '').split(',').filter(Boolean)) {
      const [kind, val] = spec.split('=');
      if (kind === 'vtip') arms.push([`vtip ${val}`, null, Number(val)]);
      else if (kind === 'stiff') arms.push([`stiff ${val}`, [[HOOK, HOOK.replace('stiff: 1.50', `stiff: ${val}`)]], null]);
      else if (kind === 'lead') arms.push([`lead ${val}`, [[HOOK, HOOK.replace('lead: 1.60', `lead: ${val}`)]], null]);
      else if (kind === 'side') arms.push([`side ${val}`, [[HOOK, HOOK.replace('side: 0.85', `side: ${val}`)]], null]);
    }
    const rows = [];
    let tag = 0;
    for (const [label, edits, vt] of arms) {
      const ARM = edits ? await armWith(edits, `sw${tag++}`) : null;
      const T = ARM ? ARM.TUNE : TUNE;
      const keepVT = T.swingVTip;
      T.swingVTip = vt;
      try {
        const A = replay(t.samples, t.collision, null, ARM);
        rows.push([label, residency(t.samples, A, 'hook_swing', SKIP), residency(t.samples, A, 'hook_swing', 0)]);
      } finally { T.swingVTip = keepVT; }
    }
    console.log(`\n[camjerk] RING SWING RESIDENCY — hook_swing, skipping the first ${SKIP} frames (the tau 0.30 blend in)`);
    console.log('  arm                    frames |  FLOW rad/s  peak |  PATH m  rel  vs plyr |  mean m/s  peak m/s | angPath  peakAng |  rmsAcc   peakAcc | boom  fov | rev | ndcPath ndcMax behind');
    const base = rows[0][1];
    for (const [label, R] of rows) {
      console.log(`  ${label.padEnd(22)} ${String(R.frames).padStart(6)} | ${R.flow.toFixed(3).padStart(10)} ${R.flowPeak.toFixed(3).padStart(5)} | `
        + `${R.path.toFixed(2).padStart(6)} ${R.relPath.toFixed(2).padStart(5)} ${R.ratio.toFixed(2).padStart(7)} | `
        + `${R.mean.toFixed(3).padStart(8)} ${R.peak.toFixed(2).padStart(9)} | `
        + `${R.angPath.toFixed(3).padStart(7)} ${R.peakAng.toFixed(3).padStart(8)} | ${R.rmsAcc.toFixed(1).padStart(7)} ${R.peakAcc.toFixed(1).padStart(9)} | `
        + `${R.boomPath.toFixed(2).padStart(5)} ${R.fovPath.toFixed(1).padStart(4)} | ${String(R.rev).padStart(3)} | `
        + `${R.ndcPath.toFixed(2).padStart(7)} ${R.ndcMax.toFixed(2).padStart(6)} ${String(R.behind).padStart(6)}`);
    }
    console.log(`\n  as a fraction of BEFORE — the owner's target is 0.500 on whichever row is chosen`);
    console.log('  arm                     FLOW flowPeak    path  relPath    mean    peak angPath peakAng  rmsAcc peakAcc ndcPath');
    for (const [label, R] of rows) {
      const f = (k) => (base[k] > 1e-9 ? (R[k] / base[k]).toFixed(3) : '  —  ').padStart(8);
      console.log(`  ${label.padEnd(22)}${f('flow')}${f('flowPeak')}${f('path')}${f('relPath')}${f('mean')}${f('peak')}${f('angPath')}${f('peakAng')}${f('rmsAcc')}${f('peakAcc')}${f('ndcPath')}`);
    }
    console.log(`\n  the floor: the CAPSULE's own path over the same frames is ${base.playerPath.toFixed(2)} m. A camera`);
    console.log('  below it is losing Sly, and rule 6 drags the view back — which is more motion, not less.');
    console.log(`  full residency (no skip), SHIPPED: path ${rows[0][2].path.toFixed(2)} m over ${rows[0][2].frames} frames, ratio ${rows[0][2].ratio.toFixed(2)}`);
    return;
  }

  /* ---- named variants: a source patch plus a shape, priced on the same trajectories ------- */
  if (VARIANTS) {
    const DIVE = '  dive:       { dist: -2.20, height:  0.35, lead: 0.40, fov:  3.5, pitch:  6.0 * DEG, side: 0.00, stiff: 0.55, tau: 0.09 },';
    const spec = {
      'shipped (ease)': { shape: 0 },
      'shape 0.80': { shape: 0.8 },
      'shape 0.80 + dive tau .11': { shape: 0.8, edits: [[DIVE, DIVE.replace('tau: 0.09', 'tau: 0.11')]] },
      'shape 0.80 + dive tau .13': { shape: 0.8, edits: [[DIVE, DIVE.replace('tau: 0.09', 'tau: 0.13')]] },
      'ease + dive tau .13': { shape: 0, edits: [[DIVE, DIVE.replace('tau: 0.09', 'tau: 0.13')]] },
      'ease + dive tau .22': { shape: 0, edits: [[DIVE, DIVE.replace('tau: 0.09', 'tau: 0.22')]] },
    };
    const out = [];
    let tag = 0;
    for (const [label, s] of Object.entries(spec)) {
      let ARM = null;
      if (s.edits) { ARM = await armWith(s.edits, `v${tag++}`); ARM.TUNE.frameBlendShape = s.shape; }
      else { TUNE.frameBlendShape = s.shape; }
      const ev = rank(recorded, ARM);
      const del = delivery(recorded, ARM);
      const dv = ev.filter((e) => e.to === 'dive');
      out.push({ label, ev, del,
        worst: ev[0], diveStep: dv.reduce((a, e) => Math.max(a, e.score), 0),
        diveBoom: dv.reduce((a, e) => Math.max(a, e.dBoom), 0),
        mean: ev.reduce((a, e) => a + e.score, 0) / ev.length });
    }
    TUNE.frameBlendShape = 0.8;
    console.log('\n[camjerk] VARIANTS — the mechanism change, the constant change, and both');
    console.log('  variant                     | worst STEP  which           | dive STEP  dive boom mm | mean STEP | dive boom deliv | land boom | idle boom');
    for (const r of out) {
      const b = (k) => { const c = r.del.get(k)?.ch.boom; return c && c.asked > 1e-9 ? `${(100 * absOf(c)).toFixed(0)}%` : '—'; };
      console.log(`  ${r.label.padEnd(27)} | ${r.worst.score.toFixed(2).padStart(10)}  ${(r.worst.from + '->' + r.worst.to).padEnd(14)} | `
        + `${r.diveStep.toFixed(2).padStart(9)} ${r.diveBoom.toFixed(1).padStart(13)} | ${r.mean.toFixed(2).padStart(9)} | `
        + `${b('dive').padStart(15)} | ${b('land').padStart(9)} | ${b('idle').padStart(9)}`);
    }
    return;
  }

  const shipped = rank(recorded);
  printPool('[camjerk] switch-attributable velocity step, pooled by transition, worst first', pool(shipped));
  console.log('\n[camjerk] the ten worst individual transitions');
  console.log('  route            frame  from -> to                      resid |  lin m/s   ang rad/s  fov deg/s | boom mm |  STEP    PEAK');
  for (const e of shipped.slice(0, 10)) {
    console.log(`  ${e.route.padEnd(17)}${String(e.frame).padStart(4)}  ${(e.from + ' -> ' + e.to).padEnd(28)} ${String(e.resid).padStart(5)} | `
      + `${e.lin.toFixed(4).padStart(8)} ${e.ang.toFixed(4).padStart(10)} ${e.fov.toFixed(3).padStart(10)} | ${e.dBoom.toFixed(1).padStart(7)} | `
      + `${e.score.toFixed(2).padStart(6)} ${e.peak.toFixed(2).padStart(7)}`);
  }
  const maxDrift = shipped.reduce((a, e) => Math.max(a, e.drift), 0);
  console.log(`\n[camjerk] counterfactual pre-switch drift, worst over ${shipped.length} transitions: ${maxDrift.toExponential(2)} m`
    + '  (must be ~0 or the pinned replay is not the same run)');

  const del = delivery(recorded);
  console.log('\n[camjerk] delivery at the screen (D6 scorer), for the arm just measured');
  console.log('  framing     visits frames med/max |' + ['boom', 'fov', 'pivY', 'lead', 'side', 'pitch'].map((n) => n.padStart(7)).join(''));
  for (const [key, r] of [...del].sort((a, b) => b[1].frames - a[1].frames)) {
    const L = r.lens.slice().sort((a, b) => a - b);
    console.log(`  ${key.padEnd(12)}${String(r.visits).padStart(5)} ${String(r.frames).padStart(6)} ${String(L[L.length >> 1]).padStart(4)}/${String(L[L.length - 1]).padStart(4)} |`
      + ['boom', 'fov', 'pivY', 'lead', 'side', 'pitch'].map((n) => { const c = r.ch[n]; return (c && c.asked > 1e-9 ? `${(100 * absOf(c)).toFixed(0)}%` : '—').padStart(7); }).join(''));
  }

  if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify({ pooled: pool(shipped), events: shipped }, null, 1)); console.log(`[camjerk] wrote ${JSON_OUT}`); }

  if (!WANT_CONTROLS) return;

  /* ---- the three controls, on the SAME recorded trajectories ---------------------------- */
  const SUBJ = 'roll';                    // reached on 'crouch + roll', short residency, clear step
  const ROLL_ROW = '  roll:       { dist: -0.40, height: -0.30, lead: 1.20, fov:  2.0, pitch:  1.0 * DEG, side: 0.00, stiff: 0.80, tau: 0.16 },';
  const IDLE_ROW = '  idle:       { dist:  0.00, height:  0.00, lead: 0.35, fov:  0.0, pitch:  0.0 * DEG, side: 0.00, stiff: 1.15, tau: 0.35 },';
  const at = (rows) => rows.filter((r) => r.pair.endsWith(`-> ${SUBJ}`));
  const shippedRoll = at(pool(shipped));

  const run = async (tag, row) => {
    const ARM = await armWith([[ROLL_ROW, row]], tag);
    return at(pool(rank(recorded, ARM)));
  };
  const pos = await run('pos', ROLL_ROW.replace('tau: 0.16', 'tau: 0.004'));
  const neg = await run('neg', ROLL_ROW.replace('tau: 0.16', 'tau: 6.0'));
  const nul = await run('nul', IDLE_ROW.replace('idle:  ', 'roll:  '));

  console.log('\n[camjerk] CONTROLS — same routes, same counterfactual, only the `roll` row changed');
  const show = (lab, rows) => { for (const r of rows) console.log(`  ${lab.padEnd(24)} ${r.pair.padEnd(20)} score ${r.score.toFixed(3).padStart(7)}  lin ${r.lin.toFixed(4)}  ang ${r.ang.toFixed(4)}`); };
  show('SHIPPED (tau 0.16)', shippedRoll);
  show('POSITIVE (tau 0.004)', pos);
  show('NEGATIVE (tau 6.0)', neg);
  show('NULL (roll := idle)', nul);
  const s0 = shippedRoll[0]?.score ?? NaN, sp = pos[0]?.score ?? NaN, sn = neg[0]?.score ?? NaN, su = nul[0]?.score ?? NaN;
  console.log(`\n  positive/shipped ${(sp / s0).toFixed(2)}x   negative/shipped ${(sn / s0).toFixed(3)}x   null ${su.toExponential(2)}`);
  console.log(`  ${sp > s0 * 2 ? 'PASS' : 'FAIL'}  positive control ranks well above shipped`);
  console.log(`  ${sn < s0 * 0.5 ? 'PASS' : 'FAIL'}  negative control ranks well below shipped`);
  console.log(`  ${su < s0 * 0.02 ? 'PASS' : 'FAIL'}  null control reads ~0`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
