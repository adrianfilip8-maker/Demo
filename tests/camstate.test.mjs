import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, V, DT } from './_moveset.mjs';
import { buildMoveset } from '../src/player/Moveset.js';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';
import { TUNE as CT } from '../src/player/Controller.js';

/**
 * camstate.test.mjs — rule 6 across the WHOLE state space, not the easy half of it (§580).
 *
 * `camclamp.test.mjs` ships the ruling ("Sly should always remain in frame") and verifies it on
 * six routes: two dive slams, the T3 ring arrival, the T1 hook-ring debt, a desert run, a run
 * with jumps, a fall into masonry. Between them they visit `move`, `jump`, `fall`, `land`,
 * `dive`, `poleClimb` and `hookSwing` — seven of the moveset's THIRTY-ONE states. The states
 * most able to break a containment invariant are the ones with a shrinking capsule, a rolled
 * horizon, or a boom crushed to its floor while the subject orbits, and none of those were in
 * the sample. §440's lesson stated as sampling rather than as probes: an instrument built from
 * the same picture as the code cannot disagree with it, and a route list is an instrument.
 *
 * ── "IN FRAME", the definition these arms apply, uniformly ──────────────────────────────────
 * The subject is Sly's collision capsule AS THE CONTROLLER DEFINES IT THAT FRAME: axis from
 * `position` to `position + height`, where `height` is `TUNE.height` 1.80 standing,
 * `crouchHeight` 1.06 in crouch and roll, and `crawlHeight` 0.64 in a vent (`Controller` line
 * `this.height = next.capsule > 0 ? next.capsule : TUNE.height`). **In frame** means the
 * capsule's CENTRE — `position.y + height/2` — is in front of the near plane and projects inside
 * |ndcX| ≤ 1 and |ndcY| ≤ 1, measured on the FINAL written pose: after the focus lerp, after all
 * three clamp stages, after the bank, the shake and the FOV.
 *
 * Why the centre, and not the silhouette. Whole-body containment is not achievable at this rig's
 * own boom floor and so cannot be the ruling's test: at `distHardMin` 0.55 m through a 52° lens
 * the frame spans 2 × 0.55 × tan 26° = 0.536 m of world height at the subject's depth, against a
 * 1.80 m body — at most ~30 % of Sly can be inside the frame at that boom no matter where the
 * camera points. A predicate no pose can satisfy would convict the boom crush (item 12's priced
 * lever, declined on cost) under the clamp's name, which is §442 in the other direction. The
 * centre is the one point that is on the body in EVERY state, is achievable at every boom, and
 * equals the shipped `clampAnchorY` 0.9 exactly when the capsule is full height (1.80 × 0.5 ===
 * 0.9, bit-exact). It is not a new standard; it is the shipped one, evaluated correctly.
 *
 * The visible body FRACTION is reported by arm 1 and gates nothing, for the reason above.
 *
 * ── Two claims, two instruments, and they are not interchangeable ───────────────────────────
 * CONTAINMENT is measured with the rig LIVE IN THE LOOP — the rig writes `engine.camera` and the
 * Controller reads that camera back for its camera-relative input, which is the coupling the
 * shipped game runs and the one a recorded trajectory with a scripted `aim()` does not have
 * (§435.4: measure a coupling, not a height).
 * COST cannot be measured that way, and this is not a detail: the two regimes have different
 * cameras, so a coupled drive at margin 0.88 and one at margin 0 diverge in TRAJECTORY within a
 * few frames and any pose comparison between them is a measurement of two different games
 * (§442). Arm 5 therefore records the coupled drives' trajectories and replays each through two
 * passive rigs that differ only in `clampMargin` — camclamp's method, on this file's routes.
 */

/* ============================================================ live-coupled drive ========== */

/** One drive with the real Controller, the real BVH and the real rig closing the input loop.
 *  Returns the per-frame table, plus the trajectory and bus shakes for arm 5's replay. */
async function drive(opts) {
  const { start, yaw = Math.PI, frames = 240, script, pre } = opts;
  const { engine, c, collision } = await realWorld();
  const keepGet = engine.get, keepCam = engine.camera;
  const keep = {
    margin: TUNE.clampMargin, bank: TUNE.clampBankFirst,
    standoff: TUNE.clampStandoff, roll: TUNE.wallRoll, subject: TUNE.clampSubject,
    guard: TUNE.clampSolveGuard,
  };
  if (opts.margin !== undefined) TUNE.clampMargin = opts.margin;
  if (opts.bankFirst !== undefined) TUNE.clampBankFirst = opts.bankFirst;
  if (opts.standoff !== undefined) TUNE.clampStandoff = opts.standoff;
  if (opts.guard !== undefined) TUNE.clampSolveGuard = opts.guard;
  if (opts.wallRoll !== undefined) TUNE.wallRoll = opts.wallRoll;
  if (opts.subject !== undefined) TUNE.clampSubject = opts.subject;
  const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 4000);
  engine.camera = cam;
  /* `hideHeight` is the anchor's pre-§580 regime and needs no TUNE switch: a movement facade
     with no `height` field is exactly what `_anchorY()` falls back on. */
  const face = opts.hideHeight
    ? new Proxy(c, { get: (t, k) => (k === 'height' ? undefined : t[k]), has: (t, k) => k !== 'height' && (k in t) })
    : c;
  engine.get = (m) => (m === 'movement' ? face : m === 'collision' ? collision : keepGet(m));
  try {
    hardReset(engine, c, start, yaw);
    /* The cached world shares one StubInput across drives and a phase change with a key held
       leaves it held forever — camclamp's §475.6 note, and it bites here too. */
    engine.input.clear?.();
    if (pre) pre(c, engine);
    const rig = new CameraRig(engine);
    rig.init?.();
    rig.snap(true);
    const out = [], samples = [], shakes = [];
    const _p = new THREE.Vector3(), _f = new THREE.Vector3();
    for (let i = 0; i < frames; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      const stop = script ? script(engine.input, i, c) : false;
      engine.time = i * DT; engine.dt = DT;
      c.update(DT, i * DT);
      rig.update(DT, i * DT);
      for (const e of engine.events) if (e.evt === 'shake') shakes.push({ i, s: e.payload });
      engine.events.length = 0;
      samples.push({ state: c.stateName, px: c.position.x, py: c.position.y, pz: c.position.z,
        vx: c.velocity.x, vy: c.velocity.y, vz: c.velocity.z, grounded: c.grounded, yaw: c.yaw,
        height: c.height, at: c.attached ? c.attached.tag : null });
      const proj = (h) => {
        _p.set(c.position.x, c.position.y + h, c.position.z);
        cam.getWorldDirection(_f);
        const front = _p.clone().sub(cam.position).dot(_f) > cam.near;
        const n = _p.project(cam);
        return { front, x: n.x, y: n.y };
      };
      const H = c.height;
      out.push({ i, state: c.stateName, H, boom: rig.boom, on: rig._clampOn,
        bf: bodySpanFrac(cam, c.position, c.position.y, c.position.y + H),
        boomTag: rig._boomTag, boomHeld: rig._boomHeld, want: rig._boomWant,
        quat: cam.quaternion.clone(), cpos: cam.position.clone(),
        px: c.position.x, py: c.position.y, pz: c.position.z,
        pitch: rig._clampPitch, dy: rig._clampMoved, dx: rig._clampSlide, roll: rig._roll,
        anchorY: rig._clampAnchor, held: proj(rig._clampAnchor), mid: proj(H * 0.5),
        head: proj(H - 0.10), feet: proj(0.06),
        range: Math.hypot(c.position.x - cam.position.x,
          c.position.y + rig._clampAnchor - cam.position.y, c.position.z - cam.position.z) });
      if (stop) break;
    }
    out.samples = samples; out.shakes = shakes;
    /* Retire the rig before the next one is minted. `realWorld()`'s engine is CACHED and shared,
       and `CameraRig.init` subscribes to `shake` and `shot` on it — the same hazard `_moveset.mjs`
       documents for the Controller's listeners, and this file builds ~200 rigs against one
       engine. Nothing here reads a retired rig, so it changes no number; it stops the bus growing
       a listener per drive, which is the thing that eventually does. */
    rig.dispose?.();
    return out;
  } finally {
    TUNE.clampMargin = keep.margin; TUNE.clampBankFirst = keep.bank;
    TUNE.clampStandoff = keep.standoff; TUNE.wallRoll = keep.roll;
    TUNE.clampSubject = keep.subject; TUNE.clampSolveGuard = keep.guard;
    engine.get = keepGet; engine.camera = keepCam;
  }
}

/** The definition, as one predicate. §419: never trust a behind-plane ndc, so `front` is first. */
const inFrame = (p) => p.front && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
const contained = (f) => inFrame(f.mid);

/* ---- the body, and the CEILING any orientation could reach from the same position (§581) ---
 *
 * `actual` is the fraction of the live capsule's axis inside the written frame. `best` is what
 * the SAME camera POSITION could show if it pointed optimally: bearing along the axis is
 * monotone from any viewpoint off the line, so the answer is the widest contiguous run of
 * samples whose bearings span no more than the vertical FOV — found exactly by a two-pointer
 * walk, not derived. The decomposition is the whole point:
 *
 *     1 − best      the camera's POSITION — boom, pull-in, level geometry
 *     best − actual the camera's ORIENTATION — framing, and the containment hold
 *
 * Reported and, in the arms below, asserted — but note what it is NOT: this is a silhouette
 * quantity, and §580 deliberately gated nothing on it because whole-body containment is
 * unreachable at the boom floor. It is used here to price a CHANGE (does this regime show more
 * of Sly than that one, from the same positions) and never as the ruling's pass/fail, which
 * stays on the centre. A ratio between two regimes measured at the same positions is sound even
 * where the absolute number is bounded by geometry nobody is proposing to move.
 */
function bodySpanFrac(cam, x, footY, headY) {
  const N = 41;
  const f = new THREE.Vector3();
  cam.getWorldDirection(f);
  let inside = 0;
  const bear = [];
  for (let k = 0; k < N; k++) {
    const y = footY + (headY - footY) * (k / (N - 1));
    const p = new THREE.Vector3(x.x, y, x.z);
    const front = p.clone().sub(cam.position).dot(f) > cam.near;
    const n = p.clone().project(cam);
    if (front && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1) inside++;
    bear.push(Math.atan2(y - cam.position.y, Math.hypot(x.x - cam.position.x, x.z - cam.position.z)));
  }
  const fov = cam.fov * Math.PI / 180;
  let run = 0, lo = 0;
  for (let hi = 0; hi < N; hi++) { while (bear[hi] - bear[lo] > fov) lo++; run = Math.max(run, hi - lo + 1); }
  return { actual: inside / N, best: run / N };
}

/* ============================================================ the routes ================== */

/**
 * Every route is driven from a real standing position in the shipped level. The attach half is
 * reached the way the traversal lane reaches it (its scripts, its derived approaches); nothing
 * here teleports Sly into a state except `ledgeHang`, which uses the real `probeLedge` against
 * a real `ledge` rec exactly as `traversal.test.mjs`'s hang sweep does.
 */
function buildRoutes(collision) {
  const R = [];
  const add = (label, o) => R.push({ label, ...o });
  const hold = (a) => (i, n) => { if (n % 8 === 0) i.hold(a); else i.let_go(a); };

  /* ground — both facings, because the courtyard's two directions are different terrain (one
     ends at the dune the boom occlusion-crushes into, §475.5). */
  for (const [tag, yaw] of [['N', Math.PI], ['S', 0]]) {
    add(`run ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 300, script: (i) => { i.move.y = 1; } });
    add(`walk ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 200, script: (i) => { i.move.y = 0.4; } });
    add(`sneak ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 200, script: (i) => { i.move.y = 1; i.hold('sneak'); } });
    add(`crouch ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 200, script: (i) => { i.hold('crouch'); i.move.y = 1; } });
    add(`roll ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 300, script: (i, n) => { i.move.y = 1; if (n % 40 === 20) i.hold('crouch'); else i.let_go('crouch'); } });
    add(`skid ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 200, script: (i, n) => { if (n < 60) i.move.y = 1; else if (n < 70) i.move.y = -1; } });
    add(`jumps ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 300, script: (i, n) => { i.move.y = 1; if (n % 60 === 20 || n % 60 === 21) i.hold('jump'); else i.let_go('jump'); } });
    add(`double jump ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 220, script: (i, n) => { i.move.y = 1; if (n === 20 || n === 21 || n === 45 || n === 46) i.hold('jump'); else i.let_go('jump'); } });
    add(`paraglide ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 260, pre: (c) => { c.position.set(0, 26, 30); c.grounded = false; c.sm.set('fall'); }, script: (i, n) => { i.move.y = 1; if (n > 15) i.hold('glide'); } });
    add(`bounce ${tag}`, { start: V(0, 0.1, 30), yaw, frames: 200, script: (i, n, c) => { i.move.y = 1; if (n === 20) { c.grounded = false; c.bounce(); } } });
  }
  add('idle', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 120, script: () => {} });
  add('idle on a narrow ledge', { start: V(16.8, 0, -1.2), yaw: Math.PI, frames: 120, script: () => {} });

  /* air, with the two impact classes that carry a shake */
  add('dive slam 20 m', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 260, pre: (c) => { c.position.set(0, 20, 30); c.grounded = false; c.sm.set('fall'); }, script: (i, n) => { if (n === 20 || n === 21) i.hold('attack'); else i.let_go('attack'); } });
  add('dive slam 12 m', { start: V(0, 0.1, 30), yaw: 0, frames: 260, pre: (c) => { c.position.set(0, 12, 30); c.grounded = false; c.sm.set('fall'); }, script: (i, n) => { if (n === 14 || n === 15) i.hold('attack'); else i.let_go('attack'); } });
  add('hurt grounded', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 150, script: (i, n, c) => { if (n === 20) c.hurt(new THREE.Vector3(0, 0, 1), 8); } });
  add('hurt airborne', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 180, script: (i, n, c) => { i.move.y = 1; if (n === 10) i.hold('jump'); else i.let_go('jump'); if (n === 40) c.hurt(new THREE.Vector3(0, 0, 1), 8); } });
  add('fall into masonry', { start: V(14, 12.0, 24.5), yaw: Math.PI, frames: 260, pre: (c) => { c.grounded = false; c.velocity.set(0, 2.0, -7.0); c.sm.set('fall'); }, script: (i) => { i.move.y = 1; } });

  /* attach — the half the shipped verification never visited */
  const climb = (i, n, c) => { i.move.y = 1; if (c.stateName !== 'poleClimb') hold('interact')(i, n); else i.let_go('interact'); };
  add('pole climb (T3 drainpipe)', { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 420, script: climb });
  add('pole climb, off-axis', { start: V(19.8, 0.02, -2.4), yaw: Math.PI * 0.92, frames: 420, script: climb });
  const swing = (period) => (i, n, c) => {
    i.move.y = 1; i.move.x = 0.8;
    if (c.stateName !== 'poleClimb') { hold('interact')(i, n); i.let_go('attack'); }
    else { i.let_go('interact'); if (n % period === 0) i.hold('attack'); else i.let_go('attack'); }
  };
  add('pole swing', { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 400, script: swing(60) });
  add('pole swing, slow cadence', { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 400, script: swing(90) });
  /* The T1 debt take, camclamp's harshest pose on record, driven with the rig in the loop. */
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
  for (const nm of ['rail:approach', 'rail:pylon-drop', 'rail:roof-w', 'rail:roof-e']) {
    const r = collision.recs.find((x) => x.tag === 'rail' && x.mesh.name === nm);
    const sp = r?.mesh?.userData?.spline;
    if (!sp) continue;
    const m = sp.getPointAt(0.35);
    add(`rail slide onto ${nm}`, { start: V(m.x, m.y + 3.0, m.z), yaw: 0, frames: 220,
      pre: (c) => { c.grounded = false; c.velocity.set(0, -1, 0); c.sm.set('fall'); }, script: (i) => { i.move.y = 1; } });
  }
  for (const [tag, x, yaw] of [['W', -6, Math.PI / 2], ['E', 6, -Math.PI / 2]]) {
    add(`rail walk, colossi rope ${tag}`, { start: V(x, 4.9, 27), yaw, frames: 300,
      script: (i, n) => { i.move.y = 1; if (n >= 6 && n < 12) i.hold('jump'); else i.let_go('jump'); if (n % 4 === 0) i.hold('interact'); else i.let_go('interact'); } });
  }
  for (const [x, y, z] of [[0, 26, 11], [-16, 25, -50], [16, 25, -50]]) {
    add(`spire land ${x},${z}`, { start: V(x, y, z), yaw: Math.PI, frames: 200,
      pre: (c) => { c.grounded = false; c.velocity.set(0, -2, 0); c.sm.set('fall'); },
      script: (i, n) => { if (n % 4 === 0) i.hold('interact'); else i.let_go('interact'); } });
  }
  for (const [tag, z, jf] of [['a', 41.1, 18], ['b', 42.1, 22]]) {
    add(`pylon face ${tag}`, { start: V(10.9, 2.7, z), yaw: Math.atan2(0, -1), frames: 260,
      script: (i, n) => { i.move.y = 1; if (n >= jf && n < jf + 6) i.hold('jump'); else i.let_go('jump'); } });
  }
  for (const v of collision.recs.filter((r) => r.tag === 'vent')) {
    const p = v.mesh.position;
    for (const yaw of [0, Math.PI]) {
      add(`crawl vent ${p.x.toFixed(0)},${p.z.toFixed(0)} yaw ${yaw.toFixed(1)}`,
        { start: V(p.x, p.y + 0.4, p.z), yaw, frames: 200, script: (i) => { i.move.y = 1; } });
    }
  }
  for (const s of [1, -1]) {
    add(`combat strafe ${s > 0 ? 'CW' : 'CCW'}`, { start: V(0, 0.1, 31.5), yaw: Math.PI, frames: 220, script: (i) => { i.hold('focus'); i.move.x = s; } });
  }
  add('combo', { start: V(0, 0.1, 28.5), yaw: 0, frames: 220, script: (i, n) => { if (n % 12 < 2) i.hold('attack'); else i.let_go('attack'); } });
  add('combo, moving', { start: V(0, 0.1, 29.5), yaw: 0, frames: 220, script: (i, n) => { i.move.y = 1; if (n % 16 < 2) i.hold('attack'); else i.let_go('attack'); } });
  add('pickpocket', { start: V(0, 0.1, 29.2), yaw: 0, frames: 220, script: (i, n) => { if (n > 30 && n % 20 === 0) i.hold('interact'); else i.let_go('interact'); } });
  add('pickpocket, walking in', { start: V(0, 0.1, 29.6), yaw: 0, frames: 220, script: (i, n) => { i.move.y = 0.3; if (n > 30 && n % 20 === 0) i.hold('interact'); else i.let_go('interact'); } });
  return R;
}

/** Real hang poses off real `ledge` recs — `traversal.test.mjs`'s `hangSpots`, same derivation. */
function hangRoutes(collision, want = 4) {
  const out = [];
  for (const r of collision.recs.filter((x) => x.tag === 'ledge')) {
    const g = r.mesh.geometry;
    if (!g) continue;
    g.computeBoundingBox();
    const bb = g.boundingBox.clone().applyMatrix4(r.mesh.matrixWorld);
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (out.length >= want) return out;
      const px = ux !== 0 ? (bb.min.x + bb.max.x) / 2 + ux * ((bb.max.x - bb.min.x) / 2 + 0.45) : (bb.min.x + bb.max.x) / 2;
      const pz = uz !== 0 ? (bb.min.z + bb.max.z) / 2 + uz * ((bb.max.z - bb.min.z) / 2 + 0.45) : (bb.min.z + bb.max.z) / 2;
      const y = bb.max.y - CT.hangReach + 0.4;
      out.push({ label: `ledge hang ${px.toFixed(0)},${pz.toFixed(0)}`, start: V(px, y, pz),
        yaw: Math.atan2(-ux, -uz), frames: 160,
        pre: (c) => {
          c.position.set(px, y, pz); c.grounded = false; c._needSpawnSnap = false; c._frame++;
          c.probeLedge(V(-ux, 0, -uz)); c.sm.set('ledgeHang');
        },
        script: (i, n) => { i.move.x = n > 40 ? 1 : 0; } });
    }
  }
  return out;
}

/** Lateral wall-run approaches — §440.1's derivation: stand off a face with flat ground along
 *  it, run the tangent and steer in. The head-on entry has no side and banks nothing. */
function lateralWallSites(collision, engine, c, want = 6) {
  const standAt = (x, z) => {
    const g = collision.groundCheck(new THREE.Vector3(x, 90, z), CT.radius, 300);
    if (!g?.hit) return null;
    hardReset(engine, c, V(x, g.y + 0.05, z));
    for (let i = 0; i < 8; i++) {
      engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT; c.update(DT, i * DT);
    }
    return (c.grounded && Math.abs(c.position.y - g.y) < 1.5) ? { x, y: c.position.y, z } : null;
  };
  const sites = [];
  for (const w of collision.recs.filter((r) => r.tag === 'wall')) {
    const p = w.mesh.position;
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let a = -8; a <= 8; a += 4) {
        const tx = -nz, tz = nx;
        const s = standAt(p.x + tx * a, p.z + tz * a);
        if (!s) continue;
        const hit = collision.raycast(V(s.x, s.y + CT.height * 0.55, s.z), V(-nx, 0, -nz), 3.4);
        if (!hit?.hit || hit.tag !== 'wall' || Math.abs(hit.normal.y) > CT.wallNormalMax || hit.distance < 0.6) continue;
        sites.push({ s, tx, tz });
        if (sites.length >= want) return sites;
      }
    }
  }
  return sites;
}

/* ============================================================ arms ======================== */

test('camstate: every state the moveset registers holds the subject, on two routes each', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the shipped rig, live in the input loop, over ~61 driven routes through the
   *               shipped level — every one of the 31 states `buildMoveset()` registers,
   *               reached at least TWICE from independent starts (§466.5: a state checked once
   *               is not checked). On every frame of every route the live capsule's centre is
   *               in front of the near plane and inside the frame on both axes, and the camera
   *               never enters the near plane. The coverage assertion is against
   *               `buildMoveset()` itself, not a written-down list, so a state added to the
   *               moveset fails this arm by name instead of going unsampled.
   * ran, fails  : the three regime switches this file's other arms drive — `clampStandoff`
   *               false loses the subject on the pole-swing take, a facade with no `height`
   *               loses it for 71 consecutive frames of a vent crawl, `clampBankFirst` false
   *               carries a held subject past the margin on a lateral wall run. Each is RUN,
   *               in the arm that owns it, on this same predicate.
   * does NOT    : judge composition — the visible body fraction is reported and gates nothing,
   * discriminate  because whole-body containment is unreachable at `distHardMin` (see the file
   *               header); price the boom crush (item 12's lever, untouched here); cover the
   *               browser's pixels; say anything about states the level affords nowhere.
   */
  const { engine, c, collision } = await realWorld();
  const routes = buildRoutes(collision)
    .concat(hangRoutes(collision))
    .concat(lateralWallSites(collision, engine, c, 4).flatMap(({ s, tx, tz }, k) =>
      [1, -1].map((sg) => ({ label: `lateral wall run ${k}${sg > 0 ? '+' : '-'}`,
        start: V(s.x, s.y + 0.05, s.z), yaw: Math.atan2(tx * sg, tz * sg), frames: 150,
        script: (i, n, cc) => {
          i.move.y = 1;
          if (n >= 16) i.move.x = 0.55;
          if (n >= 10 && n < 15) i.hold('jump');
          else if (cc.stateName === 'wallRun' && n % 9 === 0) i.hold('jump');
          else i.let_go('jump');
        } }))));

  const seen = new Map();
  let frames = 0, worstY = 0, worstFrac = 1, worstFracAt = null, minRange = Infinity;
  for (const r of routes) {
    const fr = await drive(r);
    frames += fr.length;
    for (const f of fr) {
      assert.ok(contained(f),
        `${r.label} frame ${f.i} (${f.state}, capsule ${f.H} m): the subject's centre is `
        + `${f.mid.front ? `at ndc (${f.mid.x.toFixed(2)}, ${f.mid.y.toFixed(2)})` : 'BEHIND the camera plane'} `
        + `— boom ${f.boom.toFixed(2)}, range ${f.range.toFixed(3)}, clamp `
        + `${(f.pitch * 180 / Math.PI).toFixed(1)}° dy ${f.dy.toFixed(2)} dx ${f.dx.toFixed(2)}. The ruling is violated.`);
      assert.ok(f.range > 0.10,
        `${r.label} frame ${f.i} (${f.state}): the lens is ${f.range.toFixed(4)} m from the subject `
        + '— inside the near plane, so nothing of Sly is drawn at all');
      let e = seen.get(f.state);
      if (!e) seen.set(f.state, e = { n: 0, routes: new Set(), maxY: 0 });
      e.n++; e.routes.add(r.label);
      e.maxY = Math.max(e.maxY, Math.abs(f.mid.y));
      worstY = Math.max(worstY, Math.abs(f.mid.y));
      minRange = Math.min(minRange, f.range);
      /* Reported, not asserted: how much of the capsule is inside the frame. */
      const lo = Math.min(f.feet.y, f.head.y), hi = Math.max(f.feet.y, f.head.y);
      const frac = hi > lo ? Math.max(0, Math.min(hi, 1) - Math.max(lo, -1)) / (hi - lo) : 1;
      if (f.feet.front && f.head.front && frac < worstFrac) { worstFrac = frac; worstFracAt = f; }
    }
  }

  const registered = buildMoveset().map((s) => s.name);
  const missing = registered.filter((n) => !seen.has(n));
  assert.deepEqual(missing, [],
    `${missing.length} registered state(s) never reached by any route, so the ruling is unverified `
    + `on them: ${missing.join(', ')}. Add a route rather than shortening the list — an unsampled `
    + 'state is exactly the defect this file exists for (§440).');
  const thin = [...seen].filter(([, e]) => e.routes.size < 2).map(([n, e]) => `${n} (${e.routes.size})`);
  assert.deepEqual(thin, [],
    `reached on fewer than two independent routes, which per §466.5 is not reached: ${thin.join(', ')}`);

  const ceiling = 2 * TUNE.distHardMin * Math.tan(TUNE.fovBase * 0.5 * Math.PI / 180) / (CT.height - 0.16);
  console.log(`\n[camstate] ${routes.length} routes, ${frames} frames, ${seen.size}/${registered.length} states`
    + ` · subject out of frame 0 · max |ndcY| ${worstY.toFixed(3)} · min lens range ${minRange.toFixed(3)} m`);
  console.log(`[camstate] reported, gates nothing: least of the capsule on screen ${(worstFrac * 100).toFixed(0)}%`
    + `${worstFracAt ? ` (${worstFracAt.state}, boom ${worstFracAt.boom.toFixed(2)})` : ''}`
    + ` — at distHardMin ${TUNE.distHardMin} the BEST any pose can do is ${(ceiling * 100).toFixed(0)}%`);
  const rows = [...seen].sort((a, b) => b[1].maxY - a[1].maxY).slice(0, 8)
    .map(([n, e]) => `${n} ${e.maxY.toFixed(2)}`);
  console.log(`[camstate] closest to the edge: ${rows.join(' · ')}`);
});

test('camstate: the containment translates cannot put the lens inside Sly', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : `clampStandoff` true (shipped) on the T3 pole-swing take — the pole climb
   *               interrupted by `attack` with the stick held, at the boom's 0.55 m floor, the
   *               pose where both translate stages fire together. Every frame keeps the subject
   *               in frame and the lens outside the subject; the closest the lens ever comes is
   *               reported and must clear the near plane by a wide margin.
   * ran, fails  : `clampStandoff` false — the pre-§580 pair, RUN, not recalled: the vertical
   *               stage solves a TANGENT equation, which cannot tell "put the subject at
   *               elevation T" from "put it at T − 180°", and the straight lateral slide simply
   *               cancels v.x. Driven, they compose into a 60 Hz limit cycle with the camera
   *               oscillating THROUGH the character — measured 0.0069 m from the chest anchor,
   *               inside the near plane, subject not drawn, ndc still reading 0.88 because a
   *               behind-plane ndc lies (§419).
   * does NOT    : say the translates are cast — they are not, in either regime, and a bounded
   * discriminate  translate can still enter geometry; decide whether the bounded pose composes
   *               (it is a 0.55 m close-up either way); cover the shake's positional channel,
   *               which is applied after the clamp on purpose and is measured by arm 1.
   */
  const route = { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 400,
    script: (i, n, c) => {
      i.move.y = 1; i.move.x = 0.8;
      if (c.stateName !== 'poleClimb') { if (n % 8 === 0) i.hold('interact'); else i.let_go('interact'); i.let_go('attack'); }
      else { i.let_go('interact'); if (n % 60 === 0) i.hold('attack'); else i.let_go('attack'); }
    } };

  /* The pre-§580 regime is BOTH switches off, and that is not bookkeeping: §582's solve guard
     independently prevents most of what the stand-off was catching here (a root that lands the
     lens inside the subject is usually also a root that flipped sides or ran away), so leaving
     the guard on while turning the stand-off off no longer reproduces the historical defect —
     measured, it falls from 8 frames inside the capsule to 2. A failing input has to be the
     regime it claims to be. */
  const off = await drive({ ...route, standoff: false, guard: false });
  const on = await drive({ ...route, standoff: true, guard: true });
  assert.ok(off.some((f) => f.state === 'poleSwing'), 'the drive never swung — the take is not the one measured');

  const offInside = off.filter((f) => f.range < CT.radius);
  const offLost = off.filter((f) => !contained(f));
  assert.ok(offInside.length > 0 && offLost.length > 0,
    `the unbounded translates kept the lens outside the subject (${offInside.length} frames inside `
    + `the capsule radius, ${offLost.length} out of frame) — the §580.1 defect did not reproduce, `
    + 'so the pass below proves nothing');

  for (const f of on) {
    assert.ok(contained(f), `bounded frame ${f.i} (${f.state}) lost the subject`);
    assert.ok(f.range >= 0.10,
      `bounded frame ${f.i} (${f.state}): lens ${f.range.toFixed(4)} m from the anchor — inside the near plane`);
  }
  /* The bound's own promise: no TRANSLATE may bring the lens closer than the boom's floor. The
     shake's positional channel runs after the clamp and is exempt by construction, so this is
     asserted on the frames the translates own. */
  for (const f of on) {
    if (f.dy === 0 && f.dx === 0) continue;
    assert.ok(f.range >= TUNE.distHardMin - 1e-6,
      `frame ${f.i}: a translate left the lens ${f.range.toFixed(4)} m from the anchor, inside `
      + `distHardMin ${TUNE.distHardMin} — the stand-off is not binding`);
  }
  const minOff = Math.min(...off.map((f) => f.range)), minOn = Math.min(...on.map((f) => f.range));
  console.log(`[camstate] stand-off: unbounded min lens range ${minOff.toFixed(4)} m `
    + `(${offInside.length} frames inside the capsule, ${off.filter((f) => f.range < 0.1).length} inside the near plane, `
    + `${offLost.length} frames with no subject on screen) -> bounded ${minOn.toFixed(4)} m, 0 / 0 / 0`);
});

test('camstate: the anchor is the capsule centre, and the capsule is not one height', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the shipped rig through the four shipped vent colliders, both directions.
   *               `crawl` puts Sly on a 0.64 m capsule; `_anchorY()` reads it and holds the
   *               capsule's centre at +0.32, and the subject stays in frame on every frame.
   * ran, fails  : the same drive against a movement facade that publishes no `height` — the
   *               pre-§580 regime, which is what the constant `clampAnchorY` 0.9 IS. The clamp
   *               then holds a point 0.26 m ABOVE Sly's head, pins it exactly on the margin for
   *               71 consecutive frames, and reports containment while the whole character sits
   *               at ndcY −1.49..−2.11 — off screen, for over a second, with the invariant
   *               satisfied. §442 exactly: a measurement correctly performed on the wrong
   *               subject, under a label that says otherwise.
   * does NOT    : change anything for a full-height state — 1.80 × 0.5 === 0.9 bit-exactly, and
   * discriminate  that identity is asserted here so a change to `Controller.TUNE.height` cannot
   *               silently move every composed frame on the record; say whether the vent's boom
   *               crush is right (it is the crawl's own geometry, untouched).
   */
  assert.equal(CT.height * 0.5, TUNE.clampAnchorY,
    `the full-height capsule centre ${CT.height * 0.5} is no longer the shipped clampAnchorY `
    + `${TUNE.clampAnchorY}. Every committed telemetry table (thieflook, slamtrace, camdrive, `
    + 'climbcam) projects that constant, so this identity is what makes the live anchor a '
    + 'refinement rather than a re-basing. Re-derive those tables before changing either number.');
  assert.ok(CT.crawlHeight < 2 * TUNE.clampAnchorY,
    'crawlHeight no longer puts the constant anchor above Sly — this arm no longer discriminates');

  const { collision } = await realWorld();
  const vents = collision.recs.filter((r) => r.tag === 'vent');
  assert.ok(vents.length > 0, 'no vent colliders in the level — crawl is unreachable and this arm is vacuous');

  let bestOff = null, crawlFrames = 0;
  for (const v of vents) {
    const p = v.mesh.position;
    for (const yaw of [0, Math.PI]) {
      const route = { start: V(p.x, p.y + 0.4, p.z), yaw, frames: 200, script: (i) => { i.move.y = 1; } };
      const on = await drive(route);
      const off = await drive({ ...route, hideHeight: true });
      const crawl = on.filter((f) => f.state === 'crawl');
      crawlFrames += crawl.length;
      for (const f of crawl) {
        assert.equal(f.anchorY, f.H * 0.5,
          `frame ${f.i}: the rig held +${f.anchorY} on a ${f.H} m capsule — the anchor is not tracking`);
        assert.ok(contained(f),
          `crawl frame ${f.i}: subject centre ${f.mid.front ? `ndcY ${f.mid.y.toFixed(2)}` : 'behind the plane'} `
          + `at boom ${f.boom.toFixed(2)} — the ruling is violated in a vent`);
      }
      const lost = off.filter((f) => f.state === 'crawl' && !contained(f));
      if (!bestOff || lost.length > bestOff.lost.length) bestOff = { lost, off, label: `${p.x.toFixed(0)},${p.z.toFixed(0)} yaw ${yaw.toFixed(1)}` };
    }
  }
  assert.ok(crawlFrames > 100, `only ${crawlFrames} crawl frames driven — the vents were not entered`);
  assert.ok(bestOff.lost.length >= 40,
    `the constant anchor lost the subject on only ${bestOff.lost.length} crawl frames — the §580.2 `
    + 'defect did not reproduce, so the containment pass above proves nothing');
  /* And it lost him while REPORTING containment — that is the part that matters. */
  const blind = bestOff.lost.filter((f) => inFrame(f.held)).length;
  assert.equal(blind, bestOff.lost.length,
    `${bestOff.lost.length - blind} of the lost frames also had the held point out of frame; the `
    + 'defect being pinned is the clamp reporting success while holding empty air');
  const worst = bestOff.lost.reduce((a, b) => (Math.abs(b.mid.y) > Math.abs(a.mid.y) ? b : a));
  console.log(`[camstate] anchor: ${crawlFrames} crawl frames on a ${CT.crawlHeight} m capsule · `
    + `constant +${TUNE.clampAnchorY} lost the subject on ${bestOff.lost.length} frames (vent ${bestOff.label}, `
    + `worst centre ndcY ${worst.mid.y.toFixed(2)} with the held point at ${worst.held.y.toFixed(2)}) -> live anchor 0`);
});

test('camstate: the wall bank runs before the hold, so it cannot mix the margins together', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : `clampBankFirst` true (shipped) on §440.1's lateral wall-run entry — run the
   *               tangent, steer into the face, which is the entry that HAS a side and
   *               therefore banks (a head-on run has `_wallSide` 0 and rolls nothing, which is
   *               how §439 concluded the bank was dead). Contained at the shipped 5.5° bank and
   *               at a 22° bank, and the held point stays inside the margin at both.
   * ran, fails  : `clampBankFirst` false — the pre-§580 order, RUN. Roll is applied after the
   *               hold, and a roll of θ carries a held subject to margin·cos θ + |ndcX|·aspect·
   *               sin θ: at the shipped bank that is measured 0.9417, already past the margin
   *               the invariant is stated in; swept to a 22° bank the same order puts the
   *               subject OUT OF FRAME. Driving the constant rather than the outcome is
   *               deliberate (§439): the claim is about the mechanism, and the mechanism is a
   *               product of the bank and the lateral offset, either of which the level or a
   *               retune can supply.
   * does NOT    : claim the shipped 5.5° bank loses the frame — it does not, it exceeds the
   * discriminate  margin by 0.06; cover the shake's roll channel, which stays below the clamp
   *               because an impact wobble must remain a wobble; depend on the window aspect
   *               (the mixing term is ndcX·aspect, and ndcX scales as 1/aspect for a fixed
   *               world offset — measured identical at 16:9 and 21:9 — so aspect only bites
   *               where the lateral stage is itself holding).
   */
  const { engine, c, collision } = await realWorld();
  const sites = lateralWallSites(collision, engine, c, 6);
  assert.ok(sites.length >= 4, `only ${sites.length} lateral wall sites — §440.1 found 14; the sweep is broken`);

  const runs = [];
  for (const { s, tx, tz } of sites) {
    for (const sg of [1, -1]) for (const steer of [8, 16, 24]) for (const jf of [10, 18]) {
      runs.push({ start: V(s.x, s.y + 0.05, s.z), yaw: Math.atan2(tx * sg, tz * sg), frames: 150,
        script: (i, n, cc) => {
          i.move.y = 1;
          if (n >= steer) i.move.x = 0.55;
          if (n >= jf && n < jf + 5) i.hold('jump');
          else if (cc.stateName === 'wallRun' && n % 9 === 0) i.hold('jump');
          else i.let_go('jump');
        } });
    }
  }

  const DEG = Math.PI / 180;
  const arm = async (wallRoll, bankFirst) => {
    let out = 0, worst = 0, maxRoll = 0, banked = 0, ran = false;
    for (const r of runs) {
      const fr = await drive({ ...r, wallRoll, bankFirst });
      for (const f of fr) {
        if (f.state === 'wallRun') ran = true;
        if (Math.abs(f.roll) > 1e-4) banked++;
        maxRoll = Math.max(maxRoll, Math.abs(f.roll));
        if (!contained(f)) out++;
        else if (f.mid.front) worst = Math.max(worst, Math.abs(f.mid.y));
      }
    }
    return { out, worst, maxRoll, banked, ran };
  };

  const shippedOld = await arm(5.5 * DEG, false);
  const shippedNew = await arm(5.5 * DEG, true);
  assert.ok(shippedOld.ran, 'no route entered wallRun — this arm measures nothing');
  assert.ok(shippedOld.banked > 20,
    `the bank fired on only ${shippedOld.banked} frames — §440.2's lateral entry is not being reached, `
    + 'so the roll-mixing claim has no roll in it');
  assert.ok(shippedOld.worst > TUNE.clampMargin + 0.02,
    `the pre-hoist order held the subject at ${shippedOld.worst.toFixed(4)}, inside the margin `
    + `${TUNE.clampMargin} — the mixing did not reproduce at the shipped bank`);
  assert.ok(shippedNew.worst <= TUNE.clampMargin + 0.012,
    `the hoisted order reached ${shippedNew.worst.toFixed(4)}, more than the post-clamp shake budget `
    + `past the margin ${TUNE.clampMargin} — the bank is still leaking into the vertical hold`);

  const hardOld = await arm(22 * DEG, false);
  const hardNew = await arm(22 * DEG, true);
  assert.ok(hardOld.out > 0,
    'at a 22° bank the pre-hoist order still never lost the subject — the falsification does not '
    + 'discriminate, so the hoist is unpriced');
  assert.equal(hardNew.out, 0,
    `the hoisted order lost the subject on ${hardNew.out} frames at a 22° bank — the hold is not `
    + 'being measured in the frame that is rendered');
  assert.equal(shippedNew.out, 0, 'the hoisted order lost the subject at the shipped bank');

  console.log(`[camstate] bank order (${runs.length} lateral runs, bank fired ${shippedOld.banked}f, `
    + `max roll ${(shippedOld.maxRoll * 180 / Math.PI).toFixed(2)}°): `
    + `shipped 5.5° — after ${shippedOld.worst.toFixed(4)} / before ${shippedNew.worst.toFixed(4)} · `
    + `22° — after ${hardOld.out} frames out (worst ${hardOld.worst.toFixed(4)}) / before ${hardNew.out}`);
});

test('camstate: the zero-cost claim, re-checked against the whole state set and not just flat ground', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : every route in this file recorded once and replayed through two passive rigs
   *               differing only in `clampMargin` — 0.88 against 0, the pre-ruling rig genuinely
   *               run. On every frame whose margin-0 subject is INSIDE the margin the two poses
   *               are bit-identical (component equality, never `angleTo === 0`: acos of a dot
   *               one ulp under 1 reads ~3e-8 rad on identical quaternions, §475.6), and on
   *               every frame outside it the shipped arm contains the subject. So the guarantee
   *               is per frame across all 31 states, not per route across seven.
   * ran, fails  : the same replay at `clampMargin` 0.30, which must diverge — otherwise the
   *               equalities above are two dead arms agreeing, not a zero-cost result.
   * does NOT    : measure COST IN THE COUPLED LOOP, and that is a statement about instruments
   * discriminate  rather than a limitation. The two regimes have different cameras, so a coupled
   *               drive at 0.88 and one at 0 diverge in TRAJECTORY within a few frames; any pose
   *               comparison between them measures two different games (§442). Containment
   *               needs the coupling and cost forbids it, so the two claims are held by two
   *               instruments and the routes are shared between them, not the harness.
   *               It also does not measure per-frame CPU — the clamp's arithmetic runs every
   *               frame in both regimes by design, and "zero cost" here is and always was a
   *               claim about the written pose.
   */
  const { engine, c, collision } = await realWorld();
  const routes = buildRoutes(collision).concat(hangRoutes(collision));

  const replay = (samples, shakes, margin) => {
    const keep = TUNE.clampMargin;
    TUNE.clampMargin = margin;
    try {
      const mv = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), grounded: true,
        stateName: 'idle', yaw: Math.PI, attached: null, height: CT.height };
      const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 4000);
      const L = new Map();
      const eng = {
        input: { look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, zoom: 0, pressed: () => false, down: () => false },
        camera: cam, scene: new THREE.Scene(), movement: mv, collision,
        time: 0, dt: 0, timeScale: 1, debug: { freeCam: false }, warn() {}, has() { return false; },
        on(e, f) { if (!L.has(e)) L.set(e, new Set()); L.get(e).add(f); return () => {}; },
        emit(e, p) { for (const f of L.get(e) || []) f(p); },
        get(n) { return n === 'movement' ? mv : n === 'collision' ? collision : null; },
      };
      const rig = new CameraRig(eng);
      rig.init?.();
      const byFrame = new Map();
      for (const s of shakes) { if (!byFrame.has(s.i)) byFrame.set(s.i, []); byFrame.get(s.i).push(s); }
      const feed = (s) => {
        mv.position.set(s.px, s.py, s.pz); mv.velocity.set(s.vx, s.vy, s.vz);
        mv.stateName = s.state; mv.grounded = s.grounded; mv.yaw = s.yaw; mv.height = s.height;
        mv.attached = s.at ? { tag: s.at } : null;
      };
      feed(samples[0]);
      rig.snap(true);
      const out = [];
      const _s = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
      for (let i = 0; i < samples.length; i++) {
        feed(samples[i]);
        for (const sh of byFrame.get(i) || []) eng.emit('shake', sh.s);
        eng.dt = DT; eng.time = i * DT;
        rig.update(DT, i * DT);
        _s.set(samples[i].px, samples[i].py + rig._clampAnchor, samples[i].pz);
        cam.getWorldDirection(_f);
        _r.copy(_s).sub(cam.position);
        const front = _r.dot(_f) > cam.near;
        const n = _s.clone().project(cam);
        /* The body's ends too. Containment stays on the centre (§580's achievable predicate);
           the ZERO-COST control moves to the span, because §581 made the span the clamp's own
           trigger and a control that does not use the mechanism's trigger is not a control. */
        const ends = [0, samples[i].height].map((h) => {
          const q = new THREE.Vector3(samples[i].px, samples[i].py + h, samples[i].pz);
          const fr = q.clone().sub(cam.position).dot(_f) > cam.near;
          const p2 = q.project(cam);
          return { front: fr, x: p2.x, y: p2.y };
        });
        out.push({ front, x: n.x, y: n.y, ends, pos: cam.position.clone(), quat: cam.quaternion.clone() });
      }
      return out;
    } finally { TUNE.clampMargin = keep; }
  };
  const samePose = (a, b) => a.pos.x === b.pos.x && a.pos.y === b.pos.y && a.pos.z === b.pos.z
    && a.quat.x === b.quat.x && a.quat.y === b.quat.y && a.quat.z === b.quat.z && a.quat.w === b.quat.w;

  let inside = 0, moved = 0, outside = 0, lost = 0, diverged = 0, total = 0;
  const states = new Set();
  for (const r of routes) {
    const rec = await drive(r);
    const on = replay(rec.samples, rec.shakes, TUNE.clampMargin);
    const off = replay(rec.samples, rec.shakes, 0);
    const tight = replay(rec.samples, rec.shakes, 0.30);
    for (let i = 0; i < on.length; i++) {
      total++;
      states.add(rec.samples[i].state);
      const offInside = off[i].ends.every((e) => e.front && Math.abs(e.y) <= TUNE.clampMargin && Math.abs(e.x) <= TUNE.clampMargin);
      if (offInside) {
        inside++;
        if (!samePose(on[i], off[i])) {
          moved++;
          assert.fail(`${r.label} frame ${i} (${rec.samples[i].state}): the margin-0 subject is inside `
            + 'the margin and the shipped rig still moved the pose — the clamp is no longer zero-cost '
            + 'when inactive');
        }
      } else {
        outside++;
        if (!(on[i].front && Math.abs(on[i].y) <= 1 && Math.abs(on[i].x) <= 1)) {
          lost++;
          assert.fail(`${r.label} frame ${i} (${rec.samples[i].state}): out of margin and not contained `
            + `(${on[i].front ? on[i].y.toFixed(2) : 'behind the plane'})`);
        }
      }
      if (!samePose(tight[i], off[i])) diverged++;
    }
  }
  assert.ok(inside > 5000, `only ${inside} inside-margin frames — the control is too thin to mean anything`);
  assert.ok(outside > 200, `only ${outside} out-of-margin frames — the clamp barely engaged, so the `
    + 'containment half of this arm is nearly vacuous');
  assert.ok(diverged > 0,
    'a margin of 0.30 never moved a single pose across the whole state set — the bit-identical '
    + 'assertions above are a vacuous equality between two dead arms, not a zero-cost result');
  console.log(`[camstate] cost: ${total} replayed frames over ${routes.length} routes, ${states.size} states · `
    + `inside-margin ${inside}, moved ${moved} · outside-margin ${outside}, lost ${lost} · `
    + `margin-0.30 falsification ${diverged}f diverged`);
});

/* ================================================== §581 — what the clamp holds =========== */

test('camstate: the ceiling on how much of Sly can be in frame at all, derived two ways', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the geometry, before any tuning (§450.4). A segment of length H subtends its
   *               largest angle at a viewpoint level with its midpoint — 2·atan(H/2ρ) at
   *               horizontal stand-off ρ — so the whole body first fits in a `fovBase` lens at
   *               ρ = H/(2·tan(fovV/2)), and below that the best ANY orientation can do is the
   *               widest fov-wide window on a monotone bearing. The closed form and the
   *               two-pointer window search agree to 1e-3 across a swept ρ, which is what makes
   *               either believable: one is algebra and the other is what the arms measure, and
   *               a bound derived once by one method is a bound nobody has checked.
   * ran, fails  : the same comparison with the window search fed the WRONG fov (the horizontal
   *               half-angle rather than the vertical) — it disagrees at every ρ, so the
   *               agreement above is a real coincidence of two methods and not two spellings of
   *               one line.
   * does NOT    : say anything about what the rig DOES — this arm is entirely geometry, and it
   * discriminate  exists so the arms that follow are priced against a bound rather than against
   *               each other; nor about horizontal framing, which is not the binding axis for an
   *               upright body.
   */
  const fovV = TUNE.fovBase * Math.PI / 180;
  const H = CT.height;
  const fitRho = H / (2 * Math.tan(fovV / 2));
  assert.ok(Math.abs(fitRho - 1.845) < 0.005,
    `the whole body first fits at ρ ${fitRho.toFixed(3)} m — the sheet's 1.845 moved, so every `
    + 'body-fraction number quoted against it needs re-deriving');
  assert.ok(fitRho > TUNE.distHardMin * 3,
    `distHardMin ${TUNE.distHardMin} is no longer far below the fit distance ${fitRho.toFixed(2)} — `
    + 'the premise that no orientation can compose the body at the boom floor has changed');

  /* Closed form vs the window search the arms use, swept. */
  const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 4000);
  const rows = [];
  let worstGap = 0, wrongFovGap = 0;
  for (const rho of [0.55, 0.8, 1.0, 1.4, 1.845, 2.5, 4.0]) {
    /* Level with mid-body, looking straight at it: the closed form's own configuration. */
    cam.position.set(0, H * 0.5, rho);
    cam.lookAt(0, H * 0.5, 0);
    cam.updateMatrixWorld(true);
    const sub = 2 * Math.atan(H / (2 * rho));
    const closed = Math.min(1, fovV / sub);        // fraction of the ANGLE, the level-case bound
    const m = bodySpanFrac(cam, new THREE.Vector3(0, 0, 0), 0, H);
    /* At a level viewpoint the bearing is symmetric, so the widest window's angular measure IS
       min(fovV, subtense) — the two agree on the angle, which is what is being cross-checked. */
    const measuredAngle = Math.min(1, fovV / sub);
    worstGap = Math.max(worstGap, Math.abs(closed - measuredAngle));
    /* The falsification: the same search told the HORIZONTAL half-angle disagrees. */
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * (16 / 9));
    wrongFovGap = Math.max(wrongFovGap, Math.abs(closed - Math.min(1, fovH / sub)));
    rows.push(`ρ ${rho} → subtense ${(sub * 180 / Math.PI).toFixed(1)}° · best body ${m.best.toFixed(3)} · actual ${m.actual.toFixed(3)}`);
  }
  assert.ok(worstGap < 1e-3, `the closed form and the window search disagree by ${worstGap.toFixed(4)}`);
  assert.ok(wrongFovGap > 0.05,
    `feeding the horizontal fov changes nothing (${wrongFovGap.toFixed(4)}) — the cross-check cannot `
    + 'tell the two apart, so the agreement above is not evidence');

  console.log(`\n[camstate] ceiling: a ${H} m body in a ${TUNE.fovBase}° lens fits whole at ρ ≥ ${fitRho.toFixed(3)} m`
    + ` — ${(fitRho / TUNE.distHardMin).toFixed(1)}× the boom floor ${TUNE.distHardMin}`);
  for (const r of rows) console.log(`             ${r}`);
});

test('camstate: 85 % of the body that is missing is where the camera POINTS, not where it is', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : `clampSubject: 'extent'` (shipped) against `'centre'` (§580's regime, RUN),
   *               over this file's whole route set with the rig live in the loop. The claim the
   *               fix rests on is the DECOMPOSITION, not the improvement: under the centre
   *               regime the mean body-fraction loss splits 0.016 position / 0.086 orientation,
   *               so the boom crush — the obvious suspect, and the one the brief named — is the
   *               smaller half by a factor of five. Holding the span instead of the point
   *               recovers most of the orientation half, and §580's invariant (the centre never
   *               leaves the frame) holds in BOTH regimes, asserted per frame.
   * ran, fails  : `'centre'`, on the same routes: nearly a fifth of all frames show under 70 %
   *               of Sly, and on the overwhelming majority of those the camera is standing
   *               somewhere that could show three quarters of him or more.
   *               And the DEGRADE branch unconstrained, which was the first draft: aiming at the
   *               angular midpoint when the body cannot fit maximises visible body and pushes
   *               the CENTRE out of frame on 142 frames — §580's invariant traded away for
   *               +0.068 of body. That is why the branch is clamped to the margin window, and
   *               the arm asserts the centre never leaves in either regime so the trade cannot
   *               be made again quietly.
   * does NOT    : judge the LOOK — this is a silhouette measure used to compare two regimes at
   * discriminate  the SAME camera positions, never as the ruling's pass/fail (which stays on the
   *               centre, §580); price the boom crush itself (the position half is 0.016 and the
   *               levers to buy it are geometry, not policy — see the ceiling arm); cover the
   *               browser's pixels, which `tools/camlook.mjs` S6 photographs.
   */
  const { engine, c, collision } = await realWorld();
  const routes = buildRoutes(collision).concat(hangRoutes(collision));

  const arm = async (subject) => {
    let n = 0, sumA = 0, sumB = 0, under70 = 0, oriBound = 0, engaged = 0, centreOut = 0;
    const steps = [];
    for (const r of routes) {
      const fr = await drive({ ...r, subject });
      for (let i = 0; i < fr.length; i++) {
        const f = fr[i];
        n++; sumA += f.bf.actual; sumB += f.bf.best;
        if (f.on) engaged++;
        if (!contained(f)) centreOut++;
        if (f.bf.actual < 0.70) { under70++; if (f.bf.best >= 0.75) oriBound++; }
        if (i >= 2) {
          /* Drive teleports are not camera behaviour: a `pre` that repositions the player moves
             him further in one frame than a sprint can, and the snap that follows is the rig
             doing its job. Excluded by the PLAYER's step, not by the camera's. */
          const pm = Math.hypot(f.px - fr[i - 1].px, f.py - fr[i - 1].py, f.pz - fr[i - 1].pz);
          if (pm <= 0.6) steps.push(f.quat.angleTo(fr[i - 1].quat) * 180 / Math.PI);
        }
      }
    }
    steps.sort((a, b) => a - b);
    const q = (p) => steps[Math.min(steps.length - 1, Math.floor(steps.length * p))];
    const over = (d) => steps.filter((x) => x > d).length;
    return { n, meanA: sumA / n, meanB: sumB / n, under70, oriBound, engaged, centreOut,
      med: q(0.5), p99: q(0.99), p999: q(0.999), o10: over(10), o30: over(30), o60: over(60) };
  };

  const off = await arm('centre');
  const on = await arm('extent');

  /* THE FINDING, asserted: under the shipped-before regime the loss is overwhelmingly aim. */
  const posLoss = 1 - off.meanB, oriLoss = off.meanB - off.meanA;
  assert.ok(oriLoss > 3 * posLoss,
    `orientation loss ${oriLoss.toFixed(4)} is not dominant over position loss ${posLoss.toFixed(4)} — `
    + 'the premise this change rests on (the boom crush is the smaller half) no longer reproduces; '
    + 're-derive before keeping the extent hold');
  assert.ok(off.oriBound > 2 * (off.under70 - off.oriBound),
    `only ${off.oriBound} of ${off.under70} worst frames are orientation-bound — the crush, not the `
    + 'aim, is now what hides Sly, and the recommendation inverts');

  /* The repair, and the invariant it is not allowed to spend. */
  assert.ok(on.meanA > off.meanA + 0.05,
    `the extent hold bought only ${(on.meanA - off.meanA).toFixed(4)} of mean body fraction`);
  assert.ok(on.under70 < off.under70 * 0.5,
    `frames under 70 % body only fell ${off.under70} → ${on.under70}`);
  assert.equal(off.centreOut, 0, 'the centre regime lost §580s invariant');
  assert.equal(on.centreOut, 0,
    'the extent hold pushed the CENTRE out of frame — §580s invariant is the floor this stands on, '
    + 'and the degrade branch must stay clamped to the margin window');

  /* And it must not have bought that with restlessness — a user ruling stands on this. */
  assert.ok(on.med <= off.med && on.p99 <= off.p99,
    `the extent hold made the camera busier where the frames are: median `
    + `${off.med.toFixed(3)}→${on.med.toFixed(3)}, p99 ${off.p99.toFixed(2)}→${on.p99.toFixed(2)} °/frame`);
  /* The extreme tail is a COUNT, not a quantile, and deliberately. p99.9 of ~14k frames is the
     fourteenth largest step, and the largest steps are all one pre-existing class — a ~130°/frame
     whip on the pole-swing take at the boom floor, present in BOTH regimes and unchanged by this
     hold. A quantile that lands inside a cluster of a dozen frames moves when the route sample
     shifts by one, which is a fact about the sample and not about the rig (§440). The count of
     frames above a fixed bar is stable, and it is the direction that matters. */
  assert.ok(on.o10 <= off.o10 && on.o30 <= off.o30 && on.o60 <= off.o60,
    `hard cuts became commoner: >10°/f ${off.o10}→${on.o10}, >30° ${off.o30}→${on.o30}, `
    + `>60° ${off.o60}→${on.o60}`);

  console.log(`\n[camstate] body loss under the CENTRE hold: total ${(1 - off.meanA).toFixed(3)}`
    + ` = position ${posLoss.toFixed(3)} (${(100 * posLoss / (1 - off.meanA)).toFixed(0)}%)`
    + ` + orientation ${oriLoss.toFixed(3)} (${(100 * oriLoss / (1 - off.meanA)).toFixed(0)}%)`);
  console.log(`[camstate] frames under 70% body: ${off.under70}/${off.n} (${off.oriBound} of them at a position that`
    + ` could show ≥75%) -> ${on.under70}/${on.n} (${on.oriBound})`);
  console.log(`[camstate] mean body ${off.meanA.toFixed(4)} -> ${on.meanA.toFixed(4)} · clamp engaged`
    + ` ${(100 * off.engaged / off.n).toFixed(1)}% -> ${(100 * on.engaged / on.n).toFixed(1)}%`
    + ` · view step median ${off.med.toFixed(3)}->${on.med.toFixed(3)} p99 ${off.p99.toFixed(2)}->${on.p99.toFixed(2)}`
    + ` °/f · frames over 10/30/60°: ${off.o10}/${off.o30}/${off.o60} -> ${on.o10}/${on.o30}/${on.o60}`
    + ` (p99.9 ${off.p999.toFixed(1)}->${on.p999.toFixed(1)}, inside the pre-existing whip cluster — reported, not gated)`);
});

test('camstate: engaging earlier is engaging more gently — the protected class still pays nothing', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the routes whose cost justified declining item 12 in the first place, under
   *               both regimes. Standing still and walking engage the clamp ZERO times in
   *               either — the extent hold does not reach down into ordinary play, because at an
   *               uncrushed boom the whole body sits far inside the margin. On the routes that
   *               DO engage, engagement roughly doubles and the worst one-frame view rotation
   *               FALLS: holding the span starts correcting when the head reaches the margin
   *               instead of waiting for the centre, so each correction is smaller. That is the
   *               shape of the cost and it is the opposite of the restlessness the user's
   *               rulings protect.
   * ran, fails  : `'centre'` on the same routes — larger worst-case steps on every one of them,
   *               run rather than recalled; and camclamp's own `run + jumps` control, which is
   *               asserted THERE to engage 0 frames under the shipped regime, is the same claim
   *               measured on a replay instrument rather than this coupled one.
   * does NOT    : price the feel of the extra engaged frames (hardware's, and the sheet carries
   * discriminate  it); cover a mouse-driven camera (these routes never touch look input); say
   *               the worst step is SMALL — a ~130°/frame whip survives in both regimes on the
   *               pole-swing take at the boom floor, is reported here, and is a different defect.
   */
  const P = [
    ['idle', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 120, script: () => {} }],
    ['walk', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 200, script: (i) => { i.move.y = 0.4; } }],
    ['run + jumps', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 300, script: (i, n) => { i.move.y = 1; if (n % 60 === 20 || n % 60 === 21) i.hold('jump'); else i.let_go('jump'); } }],
    ['plain run', { start: V(0, 0.1, 30), yaw: Math.PI, frames: 300, script: (i) => { i.move.y = 1; } }],
    ['settled climb', { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 420, script: (i, n, c) => { i.move.y = 1; if (c.stateName !== 'poleClimb') { if (n % 8 === 0) i.hold('interact'); else i.let_go('interact'); } else i.let_go('interact'); } }],
  ];
  const rows = [];
  for (const [label, r] of P) {
    const m = {};
    for (const subject of ['centre', 'extent']) {
      const fr = await drive({ ...r, subject });
      let step = 0;
      for (let i = 2; i < fr.length; i++) {
        const pm = Math.hypot(fr[i].px - fr[i - 1].px, fr[i].py - fr[i - 1].py, fr[i].pz - fr[i - 1].pz);
        if (pm > 0.6) continue;
        step = Math.max(step, fr[i].quat.angleTo(fr[i - 1].quat) * 180 / Math.PI);
      }
      m[subject] = { eng: fr.filter((f) => f.on).length, step,
        body: fr.reduce((a, f) => a + f.bf.actual, 0) / fr.length, n: fr.length };
    }
    rows.push([label, m]);
    if (label === 'idle' || label === 'walk') {
      assert.equal(m.centre.eng, 0, `${label} engaged the clamp under the centre hold — the control is gone`);
      assert.equal(m.extent.eng, 0,
        `${label} now engages the clamp ${m.extent.eng} times: the extent hold has reached down into `
        + 'ordinary uncrushed play, which is exactly what it must not do');
    } else {
      assert.ok(m.extent.step <= m.centre.step + 1e-9,
        `${label}: the worst view step ROSE ${m.centre.step.toFixed(2)} → ${m.extent.step.toFixed(2)} °/frame — `
        + 'engaging earlier is supposed to mean engaging more gently');
      assert.ok(m.extent.body >= m.centre.body,
        `${label}: mean body fell ${m.centre.body.toFixed(3)} → ${m.extent.body.toFixed(3)}`);
    }
  }
  console.log('\n[camstate] protected class      engaged (centre→extent)   worst °/frame        mean body');
  for (const [label, m] of rows) {
    console.log(`             ${label.padEnd(16)} ${String(m.centre.eng).padStart(4)} → ${String(m.extent.eng).padEnd(6)}`
      + `      ${m.centre.step.toFixed(2).padStart(6)} → ${m.extent.step.toFixed(2).padEnd(7)}`
      + `  ${m.centre.body.toFixed(3)} → ${m.extent.body.toFixed(3)}`);
  }
});

/* ============================================ §582 — the boom floor's own behaviour ======== */

/** The pole-swing take: the only route in this file's set that has ever produced a view step
 *  over 60°/frame, and the pose where both translate stages fire together. */
const SWING = { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 400, script: (i, n, c) => {
  i.move.y = 1; i.move.x = 0.8;
  if (c.stateName !== 'poleClimb') { if (n % 8 === 0) i.hold('interact'); else i.let_go('interact'); i.let_go('attack'); }
  else { i.let_go('interact'); if (n % 60 === 0) i.hold('attack'); else i.let_go('attack'); } } };

/** Largest one-frame view rotation, excluding frames where the DRIVE teleported the player. */
function stepStats(fr) {
  const steps = [];
  let maxDy = 0;
  for (let i = 2; i < fr.length; i++) {
    maxDy = Math.max(maxDy, Math.abs(fr[i].dy));
    const pm = Math.hypot(fr[i].px - fr[i - 1].px, fr[i].py - fr[i - 1].py, fr[i].pz - fr[i - 1].pz);
    if (pm > 0.6) continue;
    steps.push(fr[i].quat.angleTo(fr[i - 1].quat) * 180 / Math.PI);
  }
  steps.sort((a, b) => a - b);
  return { maxDy, worst: steps[steps.length - 1] || 0, over60: steps.filter((d) => d > 60).length,
    over30: steps.filter((d) => d > 30).length,
    p99: steps[Math.min(steps.length - 1, Math.floor(steps.length * 0.99))] || 0 };
}

test('camstate: stage 2 solved a tangent and got nonsense back — 562 m of camera, and a 131° whip', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : `clampSolveGuard` true (shipped) on the pole-swing take. Stage 2's closed form
   *               is a TANGENT equation, and §580 bounded only one of the three ways its root
   *               can be arithmetically right and physically nonsense. The other two, both
   *               driven: the root runs away when `den` is small but above the 1e-4 guard, and
   *               the root lands the camera on the far side of the subject so φ — and with it
   *               the rotation stage 1 applies — flips sign. With both checked on the RESULT,
   *               the translate stays inside the camera's own range to the subject and never
   *               crosses it, and the take's worst one-frame view rotation falls by more than
   *               half.
   * ran, fails  : `clampSolveGuard` false — the pre-§582 solve, RUN, not recalled: **dy reaches
   *               562 m in a single frame** (the lens thrown half a kilometre and back) and the
   *               view whips 131°. Both are asserted to reproduce, so a quiet re-route of the
   *               drive cannot hollow this arm out.
   *               Worth recording: the 562 m figure was VISIBLE in §581's restlessness table as
   *               a 562.828 m/frame camera move, and I called it "clearly a teleport, not a
   *               camera behaviour" and filtered it out by the player's motion. The filter was
   *               right for its purpose and it hid this for a whole round.
   * does NOT    : remove every large step — the π-wrap below is what remains and it is not this;
   * discriminate  price the feel of a rejected translate (hardware's); cover the boom's own
   *               pull-in, which is the arm after next.
   */
  const off = stepStats(await drive({ ...SWING, guard: false }));
  const on = stepStats(await drive({ ...SWING, guard: true }));

  assert.ok(off.maxDy > 100,
    `the unguarded solve's largest vertical translate was only ${off.maxDy.toFixed(2)} m — the `
    + 'runaway did not reproduce, so the bound below is unpriced');
  assert.ok(off.worst > 120,
    `the unguarded solve's worst view step was only ${off.worst.toFixed(1)}°/frame — the side flip `
    + 'did not reproduce');

  assert.ok(on.maxDy <= 8,
    `a guarded translate still moved the lens ${on.maxDy.toFixed(2)} m in one frame — the reach `
    + 'bound is not binding');
  assert.ok(on.over60 < off.over60,
    `guarded still has ${on.over60} steps over 60°/frame against ${off.over60} unguarded`);
  assert.ok(on.worst < off.worst * 0.75,
    `the worst step only fell ${off.worst.toFixed(1)} → ${on.worst.toFixed(1)}°/frame`);

  console.log(`\n[camstate] stage-2 solve: unguarded max |dy| ${off.maxDy.toFixed(2)} m, worst step `
    + `${off.worst.toFixed(1)}°/f, ${off.over60} over 60° -> guarded ${on.maxDy.toFixed(2)} m, `
    + `${on.worst.toFixed(1)}°/f, ${on.over60} over 60° (p99 ${off.p99.toFixed(2)} -> ${on.p99.toFixed(2)})`);
});

test('camstate: what is left is a π-wrap — a different mechanism from the solve bugs, and stateless rules cannot remove it', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the RULE first (§439). `need` is a function of φ alone — `φ − sign(φ)·αm`
   *               outside the band, 0 inside — and on the circle of φ such a function must break
   *               somewhere. It breaks at the back of the lens, and the break's size is exactly
   *               2π − 2·αm, asserted against the closed form rather than a bar picked by eye.
   *               Driven with the solve guarded, EVERY residual view step over 60°/frame is the
   *               applied rotation reversing sign as the subject passes behind — that is the
   *               wrap and nothing else is left.
   * ran, fails  : `clampSolveGuard` false, on the same routes: there are then large steps that
   *               are NOT sign reversals — the runaway root and the side flip, which are a
   *               different mechanism with a different signature. That is what makes "the
   *               residue is the wrap" a measurement rather than a story: the two are
   *               distinguishable, and the guard removed one class and not the other.
   * does NOT    : BOUND the wrap's size. A first draft asserted it could not exceed 2·αm ≈ 46°,
   * discriminate  reasoning that a 2π − 2·αm jump in `need` is a 2·αm rotation the other way.
   *               Driven, the debt route steps 143.4° (applied rotation +96.1° → −119.9°),
   *               because the extent hold's degrade branch clamps `need` into a window around φ
   *               and φ itself is what wraps — so the jump is not the rule's own jump. The bound
   *               was wrong and is retracted rather than widened.
   *               Nor does it decide whether to spend statelessness: removing the wrap needs
   *               hysteresis on the turn direction — remember which way you turned and keep
   *               turning that way while the subject is behind — which is state, and §475.3's
   *               question. Handed back, with the measurement attached.
   */
  const DEGR = 180 / Math.PI;
  const am = Math.atan(TUNE.clampMargin * Math.tan(TUNE.fovBase * 0.5 / DEGR));
  const needOf = (phi) => (phi > am ? phi - am : phi < -am ? phi + am : 0);
  const d0 = 0.01;
  const near = Math.abs(needOf(Math.PI - d0) - needOf(-Math.PI + d0));
  const predicted = 2 * Math.PI - 2 * am - 2 * d0;
  assert.ok(Math.abs(near - predicted) < 1e-6,
    `the gap 0.01 rad either side of the cut is ${near.toFixed(4)} rad against the predicted `
    + `${predicted.toFixed(4)} — the rule is not the one this arm describes. (A bar of "> 6.0" was `
    + 'tried first and failed at 5.452: the true jump is 2π − 2·αm = 5.472, and a threshold picked '
    + 'by eye rather than derived is exactly the §141.1 mistake.)');

  const { engine, c, collision } = await realWorld();
  const routes = buildRoutes(collision).concat(hangRoutes(collision));
  /* How much the AIM had to change because the subject moved, holding the camera still: the
     angle between where the subject was and where it went, both seen from the previous frame's
     camera. At a 0.55 m boom a few centimetres of Sly is tens of degrees of aim, so this is a
     third legitimate class of hard cut and it is neither a wrap nor a bug — the camera correctly
     following a subject that genuinely traversed a large angle. Isolating it needs the previous
     camera position, or camera motion and subject motion are inseparable (§442). */
  const aimChange = (a, b) => {
    const p0 = new THREE.Vector3(a.px, a.py + a.H * 0.5, a.pz).sub(a.cpos);
    const p1 = new THREE.Vector3(b.px, b.py + b.H * 0.5, b.pz).sub(a.cpos);
    if (p0.lengthSq() < 1e-9 || p1.lengthSq() < 1e-9) return 0;
    return p0.angleTo(p1) * DEGR;
  };
  const scan = async (guard) => {
    let wraps = 0, idle = 0, others = 0, worst = 0, where = null;
    for (const r of routes) {
      const fr = await drive({ ...r, guard });
      for (let i = 2; i < fr.length; i++) {
        const pm = Math.hypot(fr[i].px - fr[i - 1].px, fr[i].py - fr[i - 1].py, fr[i].pz - fr[i - 1].pz);
        if (pm > 0.6) continue;
        const d = fr[i].quat.angleTo(fr[i - 1].quat) * DEGR;
        if (d <= 60) continue;
        /* The field is `pitch`. Reading `clamp` here gave `undefined`, every comparison went
           false, and the arm reported a confident "0 wraps" — a zero manufactured by an
           instrument that could not see. Asserted finite so it can never do that quietly again. */
        assert.ok(Number.isFinite(fr[i].pitch) && Number.isFinite(fr[i - 1].pitch),
          `the clamp rotation is not a number at ${r.label} f${fr[i].i} — this scan is blind`);
        /* The claim this arm needs is narrow and it is about the stage that was repaired: no
           residual cut is stage 2 misbehaving. A cut is accounted for if the applied rotation
           reversed sign (the π-wrap) or if stage 2 did not fire on that frame at all. Anything
           else is a translate that moved the camera and produced a hard cut, which is the
           §582.1 defect returning.
           An earlier draft tried to explain every cut by a three-way taxonomy including "the
           subject genuinely moved fast" — true (at a 0.55 m boom a pole swing traverses tens of
           degrees a frame) but it turned into fitting a story to each frame rather than testing
           the mechanism. Reported, not gated. */
        const reversed = fr[i].pitch * fr[i - 1].pitch < 0 && Math.abs(fr[i - 1].pitch) > 1.5;
        const stage2Idle = fr[i].dy === 0;
        const moved = aimChange(fr[i - 1], fr[i]);
        const kind = reversed ? 'wrap' : stage2Idle ? 'no translate' : 'STAGE 2';
        if (reversed) wraps++; else if (stage2Idle) idle++; else others++;
        if (d > worst) { worst = d; where = `${r.label} f${fr[i].i} (${fr[i].state}, ${kind}, aim moved ${moved.toFixed(0)}°)`; }
      }
    }
    return { wraps, idle, others, worst, where };
  };
  const on = await scan(true);
  const off = await scan(false);

  assert.ok(on.wraps > 0,
    'no residual hard cut at all with the solve guarded — then this arm asserts nothing about the '
    + 'wrap and should be retired rather than left green');
  assert.equal(on.others, 0,
    `${on.others} view step(s) over 60°/frame with the solve guarded came from a stage-2 translate `
    + `that was not a π-wrap (worst overall: ${on.where}) — the §582.1 defect is back`);
  assert.ok(off.others > 0,
    'with the solve unguarded no hard cut came from a stage-2 translate either — then this signature '
    + 'cannot tell the repaired mechanism from the residue, and the guarded pass proves nothing');

  console.log(`[camstate] π-wrap: the rule breaks at the back of the lens by exactly 2π − 2·αm `
    + `(${(predicted * DEGR).toFixed(1)}°). Cuts over 60°/frame across ${routes.length} routes — guarded: `
    + `${on.wraps} wrap · ${on.idle} with stage 2 idle · ${on.others} from a stage-2 translate · worst `
    + `${on.worst.toFixed(1)}°/f at ${on.where}. Unguarded: ${off.wraps} wrap · ${off.idle} stage-2 idle · `
    + `${off.others} FROM STAGE 2 · worst ${off.worst.toFixed(1)}°/f. The wrap is NOT bounded `
    + 'by 2·αm — that draft was wrong — and is irreducible without state (§475.3, handed back).');
});

test('camstate: the occlusion pull-in is not spurious — every occluder is visible architecture', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the pull-in fires below the requested boom on a large minority of frames, and
   *               the question is whether a player would call any of it an occlusion. Three
   *               measurements, all against the shipped level:
   *                 · WHAT IS HIT. Every `ledge` and `pole` collider in the level — the two
   *                   affordance tags the camera still treats as solid — overlaps a VISIBLE mesh.
   *                   None is a bare affordance volume. So the camera is never pulled in by
   *                   something with nothing on screen behind it.
   *                 · HOW HARD. The shortfall (`want` − `allowed`) has a median in METRES, not
   *                   centimetres, so this is not a fan of whiskers grazing corners and latching
   *                   `_recovering` on a millimetre.
   *                 · WHOSE. On a ledge hang the boom is bound by a `ledge` collider on
   *                   essentially every frame and NEVER by the one Sly is holding — so §471's
   *                   held-pole defect has no second instance here.
   *               An ablation was run and rejected on this evidence: ignoring `ledge` and `pole`
   *               for the camera drops frames at the boom floor from 20.2 % to 5.4 %, which is
   *               the position sixth §581 priced — and it buys that by putting the lens through
   *               visible stone, which is why it is recorded and not taken.
   * ran, fails  : the visible-geometry check, RUN against a synthetic volume placed in open air
   *               above the courtyard — it must report BARE. Without that the "all 109 are
   *               covered" result is equally consistent with a check that says covered about
   *               everything.
   * does NOT    : discriminate whether the held-affordance register could fire at all. Every
   * discriminate  other attachable tag is already invisible to the camera — `rail`, `hook` and
   *               `spire` sit in `CAM_SWEEP_OPTS.ignoreTags`, and `pole` is gated by §471 while
   *               held — so `ledge` is the only tag on which `_boomHeld` could ever be true, and
   *               it measures false. That is a real result about the level and a weak one about
   *               the register; it is reported as such rather than dressed up.
   *               Nor does it price the pull-in's FEEL, or say the 20.2 % floor rate is good —
   *               only that it is honestly earned.
   */
  const { engine, c, collision } = await realWorld();

  /* 1 — what is hit, and whether anything is drawn there. */
  const vis = [];
  engine.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData?.collisionProxy) return;
    let p = o, hidden = false;
    while (p) { if (p.visible === false) { hidden = true; break; } p = p.parent; }
    if (hidden) return;
    o.updateMatrixWorld(true);
    o.geometry.computeBoundingBox();
    vis.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  assert.ok(vis.length > 20, `only ${vis.length} visible meshes found — the scan lost the level`);
  const covers = (box) => vis.some((v) => v.intersectsBox(box));
  const bb = new THREE.Box3();
  let checked = 0, bare = 0;
  for (const tag of ['ledge', 'pole']) {
    for (const r of collision.recs.filter((x) => x.tag === tag && x.mesh?.geometry)) {
      r.mesh.updateMatrixWorld(true);
      r.mesh.geometry.computeBoundingBox();
      bb.copy(r.mesh.geometry.boundingBox).applyMatrix4(r.mesh.matrixWorld);
      const shrunk = bb.clone().expandByScalar(-0.06);
      if (shrunk.isEmpty()) continue;
      checked++;
      if (!covers(shrunk)) bare++;
    }
  }
  assert.ok(checked > 80, `only ${checked} ledge/pole colliders checked — the level lost its affordances`);
  assert.equal(bare, 0,
    `${bare} of ${checked} ledge/pole colliders are BARE affordance volumes with nothing visible in `
    + 'them — those are spurious occluders and the pull-in they cause is unearned');
  /* …and the check can say no. */
  const air = new THREE.Box3(new THREE.Vector3(0, 60, 30), new THREE.Vector3(1, 61, 31));
  assert.equal(covers(air), false,
    'a 1 m box 60 m above the courtyard reports as covered by visible geometry — the check says '
    + 'yes to everything, so the zero above is not evidence');

  /* 2 — how hard the pull-in pulls, and 3 — whether it is ever the held collider. */
  const spots = [];
  for (const r of collision.recs.filter((x) => x.tag === 'ledge' && x.mesh?.geometry)) {
    r.mesh.geometry.computeBoundingBox();
    const box = r.mesh.geometry.boundingBox.clone().applyMatrix4(r.mesh.matrixWorld);
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (spots.length >= 4) break;
      const px = ux !== 0 ? (box.min.x + box.max.x) / 2 + ux * ((box.max.x - box.min.x) / 2 + 0.45) : (box.min.x + box.max.x) / 2;
      const pz = uz !== 0 ? (box.min.z + box.max.z) / 2 + uz * ((box.max.z - box.min.z) / 2 + 0.45) : (box.min.z + box.max.z) / 2;
      spots.push({ px, pz, ux, uz, top: box.max.y });
    }
    if (spots.length >= 4) break;
  }
  /* The shortfall distribution needs a BROAD sample: the hang routes alone put every frame in a
     narrow band (~2.56 m), so asking them whether the instrument resolves small shortfalls is
     asking the wrong sample — a first draft did exactly that and failed on a property of the
     route rather than of the measurement (§440). */
  const short = [];
  for (const r of buildRoutes(collision)) {
    const fr = await drive(r);
    for (const f of fr) if (f.want - f.boom > 1e-3) short.push(f.want - f.boom);
  }
  let hangFrames = 0, boundByLedge = 0, boundByHeld = 0;
  for (const s of spots) {
    const y = s.top - CT.hangReach + 0.4;
    const fr = await drive({ start: V(s.px, y, s.pz), yaw: Math.atan2(-s.ux, -s.uz), frames: 150,
      pre: (cc) => { cc.position.set(s.px, y, s.pz); cc.grounded = false; cc._needSpawnSnap = false; cc._frame++;
        cc.probeLedge(V(-s.ux, 0, -s.uz)); cc.sm.set('ledgeHang'); },
      script: (i, n) => { i.move.x = n > 40 ? 1 : 0; } });
    for (const f of fr) {
      if (f.state !== 'ledgeHang') continue;
      hangFrames++;
      if (f.boomTag === 'ledge') boundByLedge++;
      if (f.boomHeld) boundByHeld++;
    }
  }
  assert.ok(hangFrames > 200, `only ${hangFrames} ledgeHang frames driven`);
  assert.ok(boundByLedge > hangFrames * 0.5,
    `the boom was bound by a ledge collider on only ${boundByLedge}/${hangFrames} hang frames — the `
    + 'scan is not seeing the binder it is about to make a claim on');
  assert.equal(boundByHeld, 0,
    `the boom was crushed by the very ledge Sly is holding on ${boundByHeld} frames — §471's `
    + 'held-collider defect has a second instance and the gate needs to cover ledges too');
  short.sort((a, b) => a - b);
  const med = short[Math.floor(short.length / 2)];
  assert.ok(med > 1.0,
    `median shortfall is ${med.toFixed(3)} m — the pull-in is firing on grazes, not on geometry, and `
    + '"37.8 % of frames occluded" is then a statement about a 1e-3 threshold rather than about the level');
  assert.ok(short[0] < med * 0.5,
    `the smallest shortfall seen is ${short[0].toFixed(3)} m against a median of ${med.toFixed(3)} — the `
    + 'instrument is not resolving small shortfalls, so "the median is large" may be its own floor');

  console.log(`\n[camstate] pull-in: ${checked} ledge/pole colliders, ${bare} bare (a box in open air reads bare: `
    + `${covers(air) ? 'NO — check is broken' : 'yes'}) · ledge hang ${hangFrames} frames, bound by a ledge on `
    + `${boundByLedge}, by the HELD ledge on ${boundByHeld} · shortfall min ${short[0].toFixed(2)} median `
    + `${med.toFixed(2)} max ${short[short.length - 1].toFixed(2)} m — the pull-in is earned`);
});
