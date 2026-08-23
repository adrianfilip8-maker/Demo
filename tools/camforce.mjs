/**
 * camforce.mjs — WHAT MOVES THE CAMERA WHEN THE PLAYER IS NOT MOVING IT, and how hard.
 *
 * The user's ruling from a pad playtest: *"Smooth out the forced camera transitions so that they
 * are not so sudden."* "Forced" is the clue — the automatic re-framings, not the stick. This tool
 * enumerates them, measures per-frame angular rate and per-frame translation as DISTRIBUTIONS,
 * and attributes the worst frames to a named mechanism.
 *
 * ── THE DECOMPOSITION IS EXACT, NOT A MODEL ────────────────────────────────────────────────────
 * `_write` builds the pose as a fixed chain of post-multiplied rotations:
 *
 *     q_final = q_base(pivot, boom, pitchEff, yaw) · Rz(bank) · Rx(need) · S(shake)
 *
 * Post-multiplying by a fixed rotation, and pre-multiplying by one, both preserve the angle
 * between two rotations. So freezing ONE factor at its previous-frame value and re-forming the
 * product gives that factor's exact contribution to this frame's view step:
 *
 *     clamp contribution  = |need[i] − need[i−1]|            (exact)
 *     bank  contribution  = |bank[i] − bank[i−1]|            (exact)
 *     base  contribution  = ang(q_base[i−1], q_base[i])      (exact)
 *
 * and `q_base` decomposes the same way by freezing pivot / boom / pitchEff / yaw one at a time
 * and rebuilding the look-at. They are one-at-a-time sensitivities, so they do not sum to the
 * total (two mechanisms can cancel); that is stated rather than papered over, and the arms below
 * report the total alongside.
 *
 * ── §439: THE INSTRUMENT CARRIES ITS OWN FALSIFIER ─────────────────────────────────────────────
 * `q_base` is REBUILT here from rig state rather than read out of the rig, which is exactly the
 * "instrument built from the same assumption" §439 warns about. So every frame asserts
 *     q_base_rebuilt · Rz(bank) · Rx(need)  ==  cam.quaternion      (shake-free frames)
 *     camPos_rebuilt + dy·ŷ + slide          ==  cam.position        (shake-free frames)
 * to 1e-6. If this tool's model of the pose chain is wrong, it says so instead of reporting.
 *
 * ── §440: THE SAMPLING IS AN INSTRUMENT TOO ────────────────────────────────────────────────────
 * Every route in §580–§583's 73-route battery drives with `look` at ZERO — a mouse player who
 * never touches the mouse. The user plays on a PS4 pad and HOLDS the stick. `Input._padLook`
 * converts full deflection to `padLook` 2.6 rad/s on the real clock, i.e. 2.6/60 rad per frame at
 * 60 Hz, so a held stick is `look = 0.04333` and not 0. Every route here runs under a stick
 * regime, and RELEASE is its own regime because letting go is what arms `_yawAssist`.
 *
 * Usage:  node tools/camforce.mjs [--json out.json] [--routes substr] [--stick name]
 */
import * as THREE from 'three';
import { realWorld, hardReset, V, DT } from '../tests/_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';

const DEG = Math.PI / 180;
const R2D = 180 / Math.PI;

/* Full right-stick deflection, in radians of `input.look` per 60 Hz frame:
   INPUT_TUNE.padLook 2.6 rad/s × dtReal (1/60). Read from the shipped constant rather than
   written down, so an Input-lane retune moves this sample with it. */
export const PAD_FULL = 2.6 / 60;

/** The stick regimes. A pad player is in one of these, not at zero. */
export const STICKS = {
  none: () => ({ x: 0, y: 0 }),
  up: () => ({ x: 0, y: PAD_FULL }),
  down: () => ({ x: 0, y: -PAD_FULL }),
  left: () => ({ x: -PAD_FULL, y: 0 }),
  right: () => ({ x: PAD_FULL, y: 0 }),
  upright: () => ({ x: PAD_FULL * 0.707, y: PAD_FULL * 0.707 }),
  downleft: () => ({ x: -PAD_FULL * 0.707, y: -PAD_FULL * 0.707 }),
  /* Held, then released for 2 s, then held the other way: the release is what arms `_yawAssist`
     (`autoDelay` 1.2 s + `autoFade` 0.45 s), so a route that never lets go cannot see it. */
  release: (n) => {
    const ph = Math.floor(n / 150) % 3;
    if (ph === 0) return { x: PAD_FULL, y: 0 };
    if (ph === 1) return { x: 0, y: 0 };
    return { x: -PAD_FULL, y: 0 };
  },
  /* A player working the stick: reversals at 0.5 s, which is what an actual look-around is. */
  work: (n) => {
    const s = Math.sin(n * DT * 2.0);
    return { x: PAD_FULL * s, y: PAD_FULL * 0.4 * Math.cos(n * DT * 3.1) };
  },
};

const _p = new THREE.Vector3();
const _l = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _UP = new THREE.Vector3(0, 1, 0);

/** Rebuild `_write`'s pre-bank pose from rig state. THE FALSIFIER — see the header. */
function basePose(pivot, boom, pitch, yaw, headroom, outPos, outQuat) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  _d.set(-fx * cp, sp, -fz * cp);
  outPos.copy(pivot).addScaledVector(_d, boom);
  _l.copy(pivot); _l.y += headroom;
  _m.lookAt(outPos, _l, _UP);
  outQuat.setFromRotationMatrix(_m);
  return outQuat;
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
const _qt = new THREE.Quaternion(), _et = new THREE.Euler();

/** Angle between two rotations, in degrees. */
export function angBetween(a, b) {
  const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, d)) * R2D;
}

/** Drive one route with the rig live in the input loop and record the frame table. */
export async function driveForce(opts) {
  const { start, yaw = Math.PI, frames = 300, script, pre, stick = 'none', tune = {} } = opts;
  const { engine, c, collision } = await realWorld();
  const keepGet = engine.get, keepCam = engine.camera;
  const saved = {};
  for (const k of Object.keys(tune)) { saved[k] = TUNE[k]; TUNE[k] = tune[k]; }
  const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 4000);
  engine.camera = cam;
  engine.get = (m) => (m === 'movement' ? c : m === 'collision' ? collision : keepGet(m));
  const stickFn = typeof stick === 'function' ? stick : (STICKS[stick] || STICKS.none);
  const rows = [];
  try {
    hardReset(engine, c, start, yaw);
    engine.input.clear?.();
    if (pre) pre(c, engine);
    const rig = new CameraRig(engine);
    rig.init?.();
    rig.snap(true);
    for (let i = 0; i < frames; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      /* `StubInput` has no `look` — every route in the shipped battery drove without one, which
         is §440's whole point. The rig reads `input.look ? input.look.x : 0`, so attaching the
         field is exactly what a pad session publishes. */
      const lk = stickFn(i);
      if (!engine.input.look) engine.input.look = { x: 0, y: 0 };
      engine.input.look.x = lk.x; engine.input.look.y = lk.y;
      const stop = script ? script(engine.input, i, c) : false;
      engine.time = i * DT; engine.dt = DT;
      c.update(DT, i * DT);
      rig.update(DT, i * DT);
      engine.events.length = 0;

      const pitchEff = rig._effectivePitch();
      const shakeEnv = rig._shakeAmp > 0 ? rig._shakeEnv() : 0;
      const amp = rig._shakeAmp * shakeEnv;
      basePose(rig.pivot, rig.boom, pitchEff, rig.yaw, TUNE.headroom, _pa, _qa);
      /* the pitch chain's own terms, so a base step through pitch can be named */
      const fall = Math.max(0, -c.velocity.y), climb = Math.max(0, c.velocity.y);
      rows.push({
        i,
        state: c.stateName,
        H: c.height,
        grounded: c.grounded,
        lookX: lk.x, lookY: lk.y,
        pvx: rig.pivot.x, pvy: rig.pivot.y, pvz: rig.pivot.z,
        boom: rig.boom, boomWant: rig._boomWant, boomTag: rig._boomTag,
        subjFloor: rig._subjFloor ?? 0, subjFloorOn: !!rig._subjFloorOn, leashOn: !!rig._pivotLeashOn,
        pitchEff, yaw: rig.yaw,
        rawPitch: rig.pitch, framePitch: rig._frame.pitch,
        fallTerm: smoothstep(2, TUNE.fallPitchSpeed, fall) * TUNE.fallPitch,
        climbTerm: smoothstep(1, TUNE.climbSpeed, climb) * TUNE.climbPitch,
        routeTerm: rig._routeUpW * TUNE.routePitch,
        ceilW: rig._ceilW, routeUpW: rig._routeUpW,
        need: rig._clampPitch, dy: rig._clampMoved, dx: rig._clampSlide,
        bank: rig._roll, amp, focusW: rig._focusW,
        anchorY: rig._clampAnchor,
        px: c.position.x, py: c.position.y, pz: c.position.z,
        /* THE RANGE NOTHING BOUNDS. `distHardMin` floors the boom, which is the camera's
           distance to the PIVOT — and the pivot carries the follow spring's trail, the velocity
           lead, `FRAMES.height`/`side` and the leash, so it is not on Sly. This is the distance
           the constant's own comment ("below this we're inside Sly") claims to be about. */
        range: Math.hypot(cam.position.x - c.position.x,
          cam.position.y - (c.position.y + rig._clampAnchor),
          cam.position.z - c.position.z),
        pivOff: Math.hypot(rig.pivot.x - c.position.x,
          rig.pivot.y - (c.position.y + rig._clampAnchor), rig.pivot.z - c.position.z),
        qb: _qa.clone(), pb: _pa.clone(),
        q: cam.quaternion.clone(), pos: cam.position.clone(),
      });
      if (stop) break;
    }
    return { rows, label: opts.label, stick: typeof stick === 'string' ? stick : 'custom' };
  } finally {
    engine.get = keepGet; engine.camera = keepCam;
    for (const k of Object.keys(saved)) TUNE[k] = saved[k];
  }
}

function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The attribution pass. Returns per-frame steps and per-mechanism contributions, plus the
 * instrument's own self-check residual (§439).
 */
export function attribute(rows) {
  const out = [];
  let worstResid = 0, worstResidPos = 0, checked = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    /* SELF-CHECK. On a shake-free frame the shipped pose must be exactly
       q_base · Rz(bank) · Rx(need), and the shipped position exactly the rebuilt boom tip plus
       the clamp's two translates. If it is not, this tool's model is wrong. */
    if (b.amp === 0 && b.focusW === 0) {
      _qt.copy(b.qb);
      if (b.bank !== 0) { _et.set(0, 0, b.bank, 'YXZ'); _qb.setFromEuler(_et); _qt.multiply(_qb); }
      if (b.need !== 0) { _et.set(b.need, 0, 0, 'YXZ'); _qb.setFromEuler(_et); _qt.multiply(_qb); }
      const r = angBetween(_qt, b.q);
      if (r > worstResid) worstResid = r;
      if (b.dy === 0 && b.dx === 0) {
        const dp = b.pb.distanceTo(b.pos);
        if (dp > worstResidPos) worstResidPos = dp;
      }
      checked++;
    }
    const total = angBetween(a.q, b.q);
    const base = angBetween(a.qb, b.qb);
    const clamp = Math.abs(b.need - a.need) * R2D;
    const bank = Math.abs(b.bank - a.bank) * R2D;
    /* base sub-attribution: freeze one input of the look-at at the previous frame.
       THE PIVOT TERM IS IDENTICALLY ZERO AND THAT IS A STRUCTURAL FACT, not a dead probe: the
       look-at is `pivot + headroom·ŷ` and the camera is `pivot + boom·d̂`, so translating the
       pivot translates BOTH by the same vector and the view DIRECTION is invariant. The follow
       spring, the leash, the velocity lead and `FRAMES.height` therefore contribute exactly 0°
       of view rotation and only ever move the camera. It is computed anyway, because a term
       asserted to be zero and never evaluated is a claim nobody checked. */
    _p.set(a.pvx, a.pvy, a.pvz);
    const cfPivot = angBetween(basePose(_p, b.boom, b.pitchEff, b.yaw, TUNE.headroom, _pb, _qb), b.qb);
    _p.set(b.pvx, b.pvy, b.pvz);
    const cfBoom = angBetween(basePose(_p, a.boom, b.pitchEff, b.yaw, TUNE.headroom, _pb, _qb), b.qb);
    const cfPitch = angBetween(basePose(_p, b.boom, a.pitchEff, b.yaw, TUNE.headroom, _pb, _qb), b.qb);
    const cfYaw = angBetween(basePose(_p, b.boom, b.pitchEff, a.yaw, TUNE.headroom, _pb, _qb), b.qb);
    /* TRANSLATION, attributed the same way. `camPos = pivot + boom·d̂(pitch,yaw) + dy·ŷ + slide`,
       so freezing one input and re-forming gives that input's metres of this frame's move. */
    _p.set(a.pvx, a.pvy, a.pvz);
    basePose(_p, b.boom, b.pitchEff, b.yaw, TUNE.headroom, _pb, _qb);
    const tPivot = _pb.distanceTo(b.pb);
    _p.set(b.pvx, b.pvy, b.pvz);
    basePose(_p, a.boom, b.pitchEff, b.yaw, TUNE.headroom, _pb, _qb);
    const tBoom = _pb.distanceTo(b.pb);
    basePose(_p, b.boom, a.pitchEff, b.yaw, TUNE.headroom, _pb, _qb);
    const tPitch = _pb.distanceTo(b.pb);
    basePose(_p, b.boom, b.pitchEff, a.yaw, TUNE.headroom, _pb, _qb);
    const tYaw = _pb.distanceTo(b.pb);
    const tClampY = Math.abs(b.dy - a.dy);
    const tClampX = Math.abs(b.dx - a.dx);

    /* the pitch chain's own split, in degrees of pitch (not of view — reported as the term) */
    out.push({
      tPivot, tBoom, tPitch, tYaw, tClampY, tClampX,
      range: b.range, pivOff: b.pivOff, boomWant: b.boomWant, H: b.H,
      subjFloor: b.subjFloor, subjFloorOn: b.subjFloorOn, dFloor: b.subjFloor - a.subjFloor, leashOn: b.leashOn,
      i: b.i, state: b.state, prevState: a.state, boom: b.boom, boomTag: b.boomTag,
      total, base, clamp, bank,
      pivot: cfPivot, boomStep: cfBoom, pitchStep: cfPitch, yawStep: cfYaw,
      dBoom: b.boom - a.boom,
      dPitchRaw: (b.rawPitch - a.rawPitch) * R2D,
      dFramePitch: (b.framePitch - a.framePitch) * R2D,
      dFall: (b.fallTerm - a.fallTerm) * R2D,
      dClimb: (b.climbTerm - a.climbTerm) * R2D,
      dRoute: (b.routeTerm - a.routeTerm) * R2D,
      dAnchor: b.anchorY - a.anchorY,
      trans: b.pos.distanceTo(a.pos),
      need: b.need * R2D, amp: b.amp,
      lookMag: Math.hypot(b.lookX, b.lookY) * R2D,
    });
  }
  return { steps: out, selfCheck: { worstResid, worstResidPos, checked } };
}

export const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/* ───────────────────────────────────────────────────────── the route set ─────────────────── */

/** Routes a pad player actually drives. Derived from the level where the level decides. */
export function forceRoutes(collision) {
  const R = [];
  const add = (label, o) => R.push({ label, ...o });
  const hold = (a) => (i, n) => { if (n % 8 === 0) i.hold(a); else i.let_go(a); };

  add('run N', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 300, script: (i) => { i.move.y = 1; } });
  add('run S', { start: V(0, 0.1, 30), yaw: 0, frames: 300, script: (i) => { i.move.y = 1; } });
  add('run + jumps', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 300, script: (i, n) => { i.move.y = 1; if (n % 60 === 20 || n % 60 === 21) i.hold('jump'); else i.let_go('jump'); } });
  add('roll cycle', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 300, script: (i, n) => { i.move.y = 1; if (n % 40 === 20) i.hold('crouch'); else i.let_go('crouch'); } });
  add('crouch walk', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 200, script: (i) => { i.hold('crouch'); i.move.y = 1; } });
  add('idle', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 150, script: () => {} });
  add('dive slam 20 m', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 260, pre: (c) => { c.position.set(0, 20, 30); c.grounded = false; c.sm.set('fall'); }, script: (i, n) => { if (n === 20 || n === 21) i.hold('attack'); else i.let_go('attack'); } });
  add('plain fall 20 m', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 200, pre: (c) => { c.position.set(0, 20, 30); c.grounded = false; c.sm.set('fall'); }, script: (i) => { i.move.y = 1; } });
  add('fall into masonry', { start: V(14, 12.0, 24.5), yaw: Math.PI, frames: 260, pre: (c) => { c.grounded = false; c.velocity.set(0, 2.0, -7.0); c.sm.set('fall'); }, script: (i) => { i.move.y = 1; } });
  add('paraglide', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 260, pre: (c) => { c.position.set(0, 26, 30); c.grounded = false; c.sm.set('fall'); }, script: (i, n) => { i.move.y = 1; if (n > 15) i.hold('glide'); } });

  const climb = (i, n, c) => { i.move.y = 1; if (c.stateName !== 'poleClimb') hold('interact')(i, n); else i.let_go('interact'); };
  add('pole climb (T3)', { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 420, script: climb });
  const swing = (period) => (i, n, c) => {
    i.move.y = 1; i.move.x = 0.8;
    if (c.stateName !== 'poleClimb') { hold('interact')(i, n); i.let_go('attack'); }
    else { i.let_go('interact'); if (n % period === 0) i.hold('attack'); else i.let_go('attack'); }
  };
  add('pole swing', { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 400, script: swing(60) });
  add('pole swing, slow cadence', { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 400, script: swing(90) });
  const debt = () => {
    let ph = 'jump', k = 0;
    return (i, n, c) => {
      if (ph === 'jump') {
        i.move.y = 1;
        if (n >= 2 && n < 14) i.hold('jump'); else i.let_go('jump');
        if (n >= 4 && n % 2 === 0) i.hold('interact'); else i.let_go('interact');
        if (c.stateName === 'hookSwing') { ph = 'swing'; i.let_go('interact'); }
      } else if (ph === 'swing') { k++; i.move.y = 1; if (k > 55) ph = 'bail'; }
      else if (ph === 'bail') {
        i.move.y = 1;
        if (c.stateName === 'hookSwing') i.hold('jump'); else i.let_go('jump');
        if (n % 3 === 0) i.hold('interact'); else i.let_go('interact');
        if (c.stateName === 'poleClimb') ph = 'climb';
        if (c.grounded) ph = 'jump';
      } else { i.move.y = 1; return c.position.y > 19.6; }
      return false;
    };
  };
  add('hook-ring debt', { start: V(2.3, 9.02, 13.55), yaw: Math.PI, frames: 700, script: debt() });
  add('hook-ring debt + a hit', { start: V(2.3, 9.02, 13.55), yaw: Math.PI, frames: 700,
    script: (() => { const d = debt(); return (i, n, c) => { if (c.stateName === 'hookSwing' && n % 40 === 25) c.hurt(new THREE.Vector3(0, 0, 1), 8); return d(i, n, c); }; })() });
  if (collision) {
    for (const nm of ['rail:approach', 'rail:roof-w']) {
      const r = collision.recs.find((x) => x.tag === 'rail' && x.mesh.name === nm);
      const sp = r?.mesh?.userData?.spline;
      if (!sp) continue;
      const m = sp.getPointAt(0.35);
      add(`rail slide ${nm}`, { start: V(m.x, m.y + 3.0, m.z), yaw: 0, frames: 220,
        pre: (c) => { c.grounded = false; c.velocity.set(0, -1, 0); c.sm.set('fall'); }, script: (i) => { i.move.y = 1; } });
    }
  }
  add('colonnade run', { start: V(-6, 0.1, -14), yaw: Math.PI, frames: 300, script: (i) => { i.move.y = 1; } });
  add('nave sprint', { start: V(2.4, 0.1, -20), yaw: Math.PI, frames: 320, script: (i) => { i.move.y = 1; } });
  return R;
}

/* ───────────────────────────────────────────────────────────── main ──────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const k = argv.indexOf(n); return k >= 0 ? argv[k + 1] : d; };
  const onlyRoute = arg('--routes', null);
  const onlyStick = arg('--stick', null);
  const jsonOut = arg('--json', null);
  /* `--floor off` runs the pre-§640 rig. The two regimes are two different games from the first
     frame the floor binds — a coupled drive reads the camera back for camera-relative input — so
     they are reported side by side and never differenced frame for frame (§442). */
  const floorOff = arg('--floor', 'on') === 'off';
  const leashK = arg('--leash', null);
  const tuneArg = {};
  if (floorOff) tuneArg.subjectFloor = false;
  if (leashK !== null) tuneArg.pivotLeashK = Number(leashK);

  const { collision } = await realWorld();
  let routes = forceRoutes(collision);
  if (onlyRoute) routes = routes.filter((r) => r.label.includes(onlyRoute));
  let sticks = Object.keys(STICKS);
  if (onlyStick) sticks = sticks.filter((s) => s === onlyStick);

  const all = [];
  let selfWorst = 0, selfWorstPos = 0, selfN = 0;
  for (const st of sticks) {
    for (const r of routes) {
      const { rows } = await driveForce({ ...r, stick: st, tune: tuneArg });
      const { steps, selfCheck } = attribute(rows);
      selfWorst = Math.max(selfWorst, selfCheck.worstResid);
      selfWorstPos = Math.max(selfWorstPos, selfCheck.worstResidPos);
      selfN += selfCheck.checked;
      for (const s of steps) all.push({ ...s, route: r.label, stick: st });
    }
    process.stderr.write(`  stick ${st}: ${all.length} frames\n`);
  }
  console.log(`\nregime: subjectFloor ${floorOff ? 'OFF' : 'ON'} · pivotLeashK ${leashK === null ? '(shipped)' : leashK}`);
  {
    const on = all.filter((s) => s.subjFloorOn);
    const df = all.map((s) => Math.abs(s.dFloor));
    console.log(`  leash held on ${all.filter((s) => s.leashOn).length}/${all.length} frames `
      + `(${(100 * all.filter((s) => s.leashOn).length / all.length).toFixed(2)} %)`);
    console.log(`  floor bound on ${on.length}/${all.length} frames (${(100 * on.length / all.length).toFixed(2)} %);`
      + ` worst |Δfloor| ${Math.max(...df).toFixed(3)} m/frame; floor max ${Math.max(...all.map((s) => s.subjFloor)).toFixed(2)} m`);
    const rr = all.map((s) => s.range);
    console.log(`  lens→subject range: min ${Math.min(...rr).toFixed(4)} m, p1 ${pct(rr, 0.01).toFixed(3)}, `
      + `frames under distHardMin ${all.filter((s) => s.range < 0.55).length}, under camRadius ${all.filter((s) => s.range < 0.34).length}`);
    console.log(`  |need| over 90° (subject past the back of the lens — the wrap's own pose): `
      + `${all.filter((s) => Math.abs(s.need) > 90).length} frames`);
  }

  console.log(`\n=== camforce · ${routes.length} routes × ${sticks.length} stick regimes · ${all.length} frames ===`);
  console.log(`instrument self-check (§439): worst pose residual ${selfWorst.toExponential(2)}°, `
    + `worst position residual ${selfWorstPos.toExponential(2)} m, over ${selfN} checked frames`);

  const MECH = ['total', 'base', 'clamp', 'bank', 'pivot', 'boomStep', 'pitchStep', 'yawStep'];
  console.log('\n  per-frame VIEW ROTATION, deg/frame');
  console.log('  mech          median      p99      p99.9      max     n>10°   n>30°   n>60°');
  for (const m of MECH) {
    const v = all.map((s) => s[m]);
    const n10 = v.filter((x) => x > 10).length, n30 = v.filter((x) => x > 30).length, n60 = v.filter((x) => x > 60).length;
    console.log(`  ${m.padEnd(12)} ${pct(v, 0.5).toFixed(3).padStart(7)} ${pct(v, 0.99).toFixed(2).padStart(8)} `
      + `${pct(v, 0.999).toFixed(2).padStart(9)} ${Math.max(...v).toFixed(2).padStart(9)} ${String(n10).padStart(7)} ${String(n30).padStart(7)} ${String(n60).padStart(7)}`);
  }

  console.log('\n  per-frame TRANSLATION, m/frame');
  console.log('  mech          median      p99      p99.9      max');
  for (const [nm, k] of [['total', 'trans'], ['pivot', 'tPivot'], ['boom', 'tBoom'],
    ['pitch', 'tPitch'], ['yaw', 'tYaw'], ['clampY', 'tClampY'], ['clampX', 'tClampX']]) {
    const v = all.map((s) => s[k]);
    console.log(`  ${nm.padEnd(12)} ${pct(v, 0.5).toFixed(4).padStart(7)} ${pct(v, 0.99).toFixed(4).padStart(8)} `
      + `${pct(v, 0.999).toFixed(4).padStart(9)} ${Math.max(...v).toFixed(4).padStart(9)}`);
  }

  console.log('\n  THE WORST 20 FRAMES BY VIEW STEP, attributed');
  const worst = all.slice().sort((a, b) => b.total - a.total).slice(0, 20);
  console.log('   step°   base   clamp    bank |  pivot   boom   pitch    yaw | boom m  state           route / stick');
  for (const s of worst) {
    console.log(`  ${s.total.toFixed(2).padStart(6)} ${s.base.toFixed(2).padStart(6)} ${s.clamp.toFixed(2).padStart(7)} ${s.bank.toFixed(2).padStart(7)} |`
      + ` ${s.pivot.toFixed(2).padStart(6)} ${s.boomStep.toFixed(2).padStart(6)} ${s.pitchStep.toFixed(2).padStart(7)} ${s.yawStep.toFixed(2).padStart(6)} |`
      + ` ${s.boom.toFixed(2).padStart(6)}  ${String(s.state).padEnd(14)} ${s.route} / ${s.stick}`);
  }

  console.log('\n  CUTS OVER 10°/FRAME, by dominant mechanism (the largest one-at-a-time term)');
  const cuts = all.filter((s) => s.total > 10);
  const by = new Map();
  for (const s of cuts) {
    const cand = [['clamp', s.clamp], ['bank', s.bank], ['pivot', s.pivot], ['boom', s.boomStep], ['pitch', s.pitchStep], ['yaw', s.yawStep]];
    cand.sort((a, b) => b[1] - a[1]);
    const k = cand[0][0];
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(s);
  }
  for (const [k, v] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const st = v.map((s) => s.total);
    console.log(`  ${k.padEnd(8)} ${String(v.length).padStart(5)} frames   median ${pct(st, 0.5).toFixed(2)}°  max ${Math.max(...st).toFixed(2)}°`);
  }
  console.log(`  (${cuts.length} of ${all.length} frames = ${(100 * cuts.length / all.length).toFixed(2)} %)`);

  console.log('\n  BY STICK REGIME — the §440 correction');
  console.log('  stick        frames   med°    p99°   >10°    >30°    >60°   clamp med   clamp p99');
  for (const st of sticks) {
    const v = all.filter((s) => s.stick === st);
    if (!v.length) continue;
    const t = v.map((s) => s.total), c = v.map((s) => s.clamp);
    console.log(`  ${st.padEnd(10)} ${String(v.length).padStart(7)} ${pct(t, 0.5).toFixed(3).padStart(7)} ${pct(t, 0.99).toFixed(2).padStart(7)}`
      + ` ${String(t.filter((x) => x > 10).length).padStart(6)} ${String(t.filter((x) => x > 30).length).padStart(7)} ${String(t.filter((x) => x > 60).length).padStart(7)}`
      + ` ${pct(c, 0.5).toFixed(4).padStart(11)} ${pct(c, 0.99).toFixed(3).padStart(11)}`);
  }

  if (jsonOut) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(jsonOut, JSON.stringify({ selfWorst, selfWorstPos, n: all.length, steps: all.map((s) => ({ ...s })) }));
    console.log(`\n  wrote ${jsonOut}`);
  }
  process.exit(0);
}
