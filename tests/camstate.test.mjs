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
    standoff: TUNE.clampStandoff, roll: TUNE.wallRoll,
  };
  if (opts.margin !== undefined) TUNE.clampMargin = opts.margin;
  if (opts.bankFirst !== undefined) TUNE.clampBankFirst = opts.bankFirst;
  if (opts.standoff !== undefined) TUNE.clampStandoff = opts.standoff;
  if (opts.wallRoll !== undefined) TUNE.wallRoll = opts.wallRoll;
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
        pitch: rig._clampPitch, dy: rig._clampMoved, dx: rig._clampSlide, roll: rig._roll,
        anchorY: rig._clampAnchor, held: proj(rig._clampAnchor), mid: proj(H * 0.5),
        head: proj(H - 0.10), feet: proj(0.06),
        range: Math.hypot(c.position.x - cam.position.x,
          c.position.y + rig._clampAnchor - cam.position.y, c.position.z - cam.position.z) });
      if (stop) break;
    }
    out.samples = samples; out.shakes = shakes;
    return out;
  } finally {
    TUNE.clampMargin = keep.margin; TUNE.clampBankFirst = keep.bank;
    TUNE.clampStandoff = keep.standoff; TUNE.wallRoll = keep.roll;
    engine.get = keepGet; engine.camera = keepCam;
  }
}

/** The definition, as one predicate. §419: never trust a behind-plane ndc, so `front` is first. */
const inFrame = (p) => p.front && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
const contained = (f) => inFrame(f.mid);

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

  const off = await drive({ ...route, standoff: false });
  const on = await drive({ ...route, standoff: true });
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
        out.push({ front, x: n.x, y: n.y, pos: cam.position.clone(), quat: cam.quaternion.clone() });
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
      const offInside = off[i].front && Math.abs(off[i].y) <= TUNE.clampMargin && Math.abs(off[i].x) <= TUNE.clampMargin;
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
