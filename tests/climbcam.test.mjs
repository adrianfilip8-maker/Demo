import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, V, DT } from './_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';

/**
 * climbcam.test.mjs — the §471 gate: while the held collider is a pole, the pole class stops
 * occluding the boom.
 *
 * The finding this pins (§471, `tools/climbtrace.mjs`, `thief1-t1t*` frames): on the obelisk
 * rope at the photographed hang azimuth, the boom's centre cast died at raw distance ~0 against
 * the ROPE'S OWN r 0.15 proxy on 182 of 211 climb frames (7 more on the obelisk's r 1.5 shaft),
 * pinning the boom at `distHardMin` 0.55 from mount to top — the lens inside Sly's hat for a
 * multi-second authored beat — while the same `poleClimb` on the open-wall drainpipe composed at
 * 5.8–6.0. The repair reads `movement.attached` (the moveset's published "rec of whatever Sly is
 * holding onto") and swaps the boom casts to a pole-ignoring sweep set exactly while that rec is
 * a pole.
 *
 * Trajectories are recorded once through the REAL Controller on the real BVH (the camdrive
 * pattern), then replayed through two rigs that differ ONLY in whether the facade publishes the
 * recorded attachment — so the before/after comparison cannot be contaminated by trajectory
 * noise, and the pre-fix regime is genuinely RUN, not recalled: masking `attached` restores the
 * old behaviour bit for bit, because the gate is the only consumer of the field in this file.
 */

/* Record a drive; keep per-frame state incl. the attached rec's tag. */
async function trace(frames, drive, start, yaw) {
  const { engine, c } = await realWorld();
  hardReset(engine, c, start, yaw);
  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const samples = [];
  for (let i = 0; i < frames; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    const stop = drive(engine.input, i, c, aim);
    engine.time = 0; c.update(DT, 0);
    engine.events.length = 0;
    samples.push({ state: c.stateName, px: c.position.x, py: c.position.y, pz: c.position.z,
      vx: c.velocity.x, vy: c.velocity.y, vz: c.velocity.z, grounded: c.grounded, yaw: c.yaw,
      at: c.attached ? c.attached.tag : null });
    if (stop) break;
  }
  return samples;
}

/**
 * Replay through a passive rig. `publishAttach` is the arm switch: true = the shipped facade
 * (attached tag published, §471 gate live), false = the pre-fix regime (field absent, gate
 * closed, poles solid to the boom).
 */
function replay(samples, collision, publishAttach, camYaw) {
  const attRec = { tag: 'pole' };
  const movement = { position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    grounded: true, stateName: 'idle', yaw: Math.PI, attached: null };
  const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 2000);
  const engine = {
    input: { look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, zoom: 0, pressed: () => false, down: () => false },
    camera: cam, scene: new THREE.Scene(), movement, collision,
    time: 0, dt: 0, timeScale: 1, debug: { freeCam: false }, warn() {}, has() { return false; },
    on() { return () => {}; }, emit() {},
    get(n) { return n === 'movement' ? movement : n === 'collision' ? collision : null; },
  };
  const rig = new CameraRig(engine);
  rig.init?.();
  const feed = (s) => {
    movement.position.set(s.px, s.py, s.pz);
    movement.velocity.set(s.vx, s.vy, s.vz);
    movement.stateName = s.state; movement.grounded = s.grounded; movement.yaw = s.yaw;
    movement.attached = publishAttach && s.at ? (s.at === 'pole' ? attRec : { tag: s.at }) : null;
  };
  feed(samples[0]);
  rig.snap(true);
  if (camYaw !== undefined) { rig.yaw = camYaw; rig.snap(false); }
  const out = [];
  for (let i = 0; i < samples.length; i++) {
    feed(samples[i]);
    engine.dt = DT; engine.time = i * DT;
    rig.update(DT, i * DT);
    const s = samples[i];
    const ndc = new THREE.Vector3(s.px, s.py + 0.9, s.pz).project(cam);
    out.push({ state: s.state, boom: rig.boom, want: rig._boomWant, ndcY: ndc.y,
      gate: rig._attachedPole });
  }
  return out;
}

/* The T1 drive: thiefspots §A's mount from thieflook's REAL lintel stance, then spin to the
   photographed hang azimuth (a player input — wishRaw.x orbits the pole at TUNE.poleSpin),
   then climb. atan2(−0.17, −0.42) is the azimuth of both committed browser takes. */
const T1_AZ = Math.atan2(-0.17, -0.42);
function t1Drive() {
  let phase = 'mount', mi = 0;
  return (inp, i, c, aim) => {
    if (phase === 'mount') {
      if (c.stateName === 'poleClimb') { phase = 'spin'; return; }
      aim(0, 13.0); inp.move.y = 1;
      if (mi >= 4 && mi < 18) inp.hold('jump'); else inp.let_go('jump');
      if (mi > 6 && mi % 5 === 0) inp.hold('interact'); else inp.let_go('interact');
      mi++;
      if (mi >= 90) mi = 0;                        // rewind the cadence; the retry re-jumps
      return;
    }
    if (phase === 'spin') {
      const err = ((T1_AZ - c.pole.angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      if (Math.abs(err) < 0.03) { phase = 'climb'; return; }
      inp.move.x = err > 0 ? -1 : 1;
      return;
    }
    inp.move.y = 1;
    return c.position.y > 19.6;                    // stop at the top
  };
}

test('climbcam: §471 — the climbed pole class stops occluding the boom, and only it', async () => {
  const { collision } = await realWorld();

  /* ── C1: the obelisk rope at the photographed azimuth ─────────────────────────────────────
   *
   * DOMAIN (§418.3)
   * ran, passes : the shipped facade (attached published). Every climb frame past the 15th has
   *               the boom within 0.35 m of its want (measured headroom: allowed == want on all
   *               211 frames; 0.35 covers the T3-class whisker trims real geometry earns), and
   *               the whole climb sits above 3.5 m — the midpoint of the (0.55, 5.83) empty band
   *               between the crushed and composed regimes, chosen as a §494-style band middle,
   *               not tuned to either side.
   * ran, fails  : the same replay with `attached` masked (the pre-fix rig, bit for bit): the
   *               boom pins at distHardMin 0.55 on the majority of climb frames, and the
   *               mechanism is asserted at the cast itself — the centre whisker at mid-climb
   *               hits tag 'pole' under the solid sweep set and nothing under the gated set.
   * does NOT    : judge the framing (ndcY is recorded, not asserted — composition is item 12's
   * discriminate  and the sheet's business); cover wall/ledge/hook attachments (their tags are
   *               not 'pole', the gate never opens); or verify the browser pixels — the
   *               committed thief1/thief2 frames do that.
   */
  const t1yaw = Math.atan2(0 - 2.3, 13.0 - 13.55);
  const t1 = await trace(1400, t1Drive(), V(2.3, 9.02, 13.55), Math.PI);
  const t1Climb = t1.filter((s) => s.state === 'poleClimb');
  assert.ok(t1Climb.length > 150, `T1 recorded ${t1Climb.length} poleClimb frames — the drive lost the rope`);
  assert.ok(t1.some((s) => s.py > 19.5), 'T1 never reached the rope top');
  assert.equal(t1Climb.filter((s) => s.at === 'pole').length, t1Climb.length,
    'poleClimb frames must publish a pole attachment — the gate reads it');

  const fixed = replay(t1, collision, true, t1yaw);
  const masked = replay(t1, collision, false, t1yaw);
  const climbIdx = [];
  t1.forEach((s, i) => { if (s.state === 'poleClimb') climbIdx.push(i); });
  const after = climbIdx.slice(15);

  for (const i of after) {
    assert.ok(fixed[i].gate, `frame ${i}: gate closed during an attached pole climb`);
    assert.ok(fixed[i].boom >= fixed[i].want - 0.35,
      `frame ${i}: boom ${fixed[i].boom.toFixed(3)} vs want ${fixed[i].want.toFixed(3)} — something still binds during the climb`);
  }
  const fixedMin = Math.min(...after.map((i) => fixed[i].boom));
  assert.ok(fixedMin > 3.5, `fixed climb min boom ${fixedMin.toFixed(3)} — below the crushed/composed band middle`);

  const crushed = after.filter((i) => masked[i].boom <= TUNE.distHardMin + 0.01);
  assert.ok(crushed.length > after.length * 0.5,
    `masked (pre-fix) replay crushed only ${crushed.length}/${after.length} climb frames — the defect this gate repairs did not reproduce, so the pass above proves nothing`);

  /* The mechanism, at the cast: centre whisker from the mid-climb pivot, both sweep sets. */
  {
    const mid = climbIdx[Math.floor(climbIdx.length / 2)];
    const s = t1[mid];
    const from = new THREE.Vector3(s.px, s.py + TUNE.pivotHeight, s.pz);
    const dir = new THREE.Vector3(Math.cos(t1yaw) * 0 + Math.sin(t1yaw) * -1, 0, Math.cos(t1yaw) * -1);
    dir.set(-Math.sin(t1yaw), 0, -Math.cos(t1yaw));   // boom direction at pitch 0: behind the camera yaw
    const to = from.clone().addScaledVector(dir, 5.9);
    const solid = collision.capsuleSweep(from, to, TUNE.camRadius, 0,
      { ignoreTags: ['hazard', 'water', 'vent', 'rail', 'hook', 'spire'] });
    const gated = collision.capsuleSweep(from, to, TUNE.camRadius, 0,
      { ignoreTags: ['hazard', 'water', 'vent', 'rail', 'hook', 'spire', 'pole'] });
    assert.equal(solid.hit && solid.tag, 'pole',
      `the mid-climb centre cast should die on a pole under the solid set (got ${solid.hit ? solid.tag : 'no hit'})`);
    assert.ok(!gated.hit || gated.distance > 4.0,
      `the gated set still binds at ${gated.distance?.toFixed(3)} on tag ${gated.tag} — the class ignore is not what fixed the climb`);
  }

  /* ── C2: the drainpipe control, and the arrival that must stay item 12's ──────────────────
   *
   * DOMAIN (§418.3)
   * ran, passes : the FIXED arm composes the way the committed browser run did — every climb
   *               frame with the player in y 1..8.5 has boom in [5.5, 6.2], the band
   *               `thief1-telemetry.json` recorded (5.78–6.02) widened by the whisker trims real
   *               geometry earns — with the gate open throughout; the gate never SHORTENS the
   *               boom on any frame of the whole trace (ignoring a tag can only release length);
   *               and any fixed-vs-masked divergence BEGINS on a pole-attached frame. The ring
   *               arrival crush is asserted STILL PRESENT in both arms (boom < 1.5 at
   *               touchdown+3): its mechanism is item 12's leash + ledge occlusion, not a pole,
   *               and a future leash change must consciously re-base that pin.
   * ran, fails  : the masked (pre-fix) replay — and NOT only on T1: near the pipe top (player
   *               y ≈ 7.2, pivot+whiskerUp within camRadius of the cap at 9.6) the up-whisker
   *               start-overlaps the pipe's own proxy and crushes the boom to ~3.5, a knife-edge
   *               instance of the same defect that the browser takes missed by centimetres of
   *               pivot height (their trace holds 5.9 through that y — §440: the "clean control"
   *               was itself a sample). Equality between the arms is therefore NOT the bar; the
   *               browser band and the never-shortens invariant are.
   * does NOT    : price the arrival (item 12 does); assert ndcY; distinguish which whisker
   * discriminate  binds on a divergent frame (climbtrace.mjs names it).
   */
  let t3ph = 'walk';
  const t3 = await trace(900, (inp, i, c, aim) => {
    if (c.stateName !== 'poleClimb' && t3ph === 'walk') {
      aim(21.35, -2.0); inp.move.y = 1;
      if (i % 8 === 0) inp.hold('interact'); else inp.let_go('interact');
    } else if (c.stateName === 'poleClimb') {
      t3ph = 'climb';
      if (c.position.y < 9.35) { inp.move.y = 1; }
      else { aim(22.6, -2.0); inp.move.y = 1; inp.hold('jump'); }
    } else { aim(22.6, -2.0); inp.move.y = 1; inp.let_go('jump'); }
    return t3ph === 'climb' && c.stateName !== 'poleClimb' && c.grounded && c.position.y > 8.6 && c.position.x > 21.7 && i > 100 ? (t3ph = 'done', false) || true : false;
  }, V(19.8, 0.02, -2.0), Math.PI);
  const t3Climb = [];
  t3.forEach((s, i) => { if (s.state === 'poleClimb') t3Climb.push(i); });
  assert.ok(t3Climb.length > 100, `T3 recorded ${t3Climb.length} poleClimb frames`);

  const t3yaw = Math.atan2(21.35 - 19.8, 0);
  const t3fix = replay(t3, collision, true, t3yaw);
  const t3masked = replay(t3, collision, false, t3yaw);
  assert.ok(t3Climb.slice(10).every((i) => t3fix[i].gate), 'gate closed during the pipe climb');

  /* The browser band, on the browser's own y window. */
  for (const i of t3Climb) {
    if (t3[i].py < 1 || t3[i].py > 8.5) continue;
    assert.ok(t3fix[i].boom >= 5.5 && t3fix[i].boom <= 6.2,
      `pipe climb frame ${i} (y ${t3[i].py.toFixed(2)}): boom ${t3fix[i].boom.toFixed(3)} left the browser band [5.5, 6.2]`);
  }
  /* The gate can only release length, never take it. */
  let firstDiv = -1;
  for (let i = 0; i < t3.length; i++) {
    assert.ok(t3fix[i].boom >= t3masked[i].boom - 1e-6,
      `frame ${i}: the gate SHORTENED the boom (${t3fix[i].boom.toFixed(3)} < ${t3masked[i].boom.toFixed(3)})`);
    if (firstDiv < 0 && Math.abs(t3fix[i].boom - t3masked[i].boom) > 1e-6) firstDiv = i;
  }
  if (firstDiv >= 0) {
    assert.equal(t3[firstDiv].at, 'pole',
      `arms diverged first at frame ${firstDiv}, state ${t3[firstDiv].state}, attached ${t3[firstDiv].at} — divergence must begin on a pole attachment`);
  }

  const touchdown = t3.findIndex((s, i) => i > (t3Climb.at(-1) ?? 0) && s.grounded && s.py > 8.6 && s.px > 21.7);
  if (touchdown > 0 && touchdown + 3 < t3.length) {
    for (const arm of [t3fix, t3masked]) {
      assert.ok(arm[touchdown + 3].boom < 1.5,
        `the ring-arrival crush (item 12's leash + ledge mechanism) should be untouched by this gate — got boom ${arm[touchdown + 3].boom.toFixed(3)}`);
    }
  }

  /* ── C3: an ordinary run with jumps — the gate cannot open off a pole ─────────────────────
   *
   * DOMAIN (§418.3)
   * ran, passes : `attached` stays null for every frame of a run-and-jump route, so both arms
   *               replay identically to 1e-9 — "cannot touch ordinary jumps by construction"
   *               as a run assertion rather than a sentence.
   * ran, fails  : the gate keying on anything a jump produces (state name, airborne-ness,
   *               proximity to the kiosk poles at spawn).
   * does NOT    : cover attach states other than pole (C2 covers rail-adjacent framing only as
   * discriminate  far as the pipe's own drive enters them).
   */
  const jr = await trace(300, (inp, i) => {
    inp.move.y = -1;
    if (i % 60 === 20 || i % 60 === 21) inp.hold('jump'); else inp.let_go('jump');
  }, V(0, 0.1, 30), 0);
  assert.equal(jr.filter((s) => s.at !== null).length, 0, 'a run-and-jump route recorded an attachment');
  const jf = replay(jr, collision, true);
  const jm = replay(jr, collision, false);
  let jd = 0;
  for (let i = 0; i < jr.length; i++) jd = Math.max(jd, Math.abs(jf[i].boom - jm[i].boom));
  assert.ok(jd < 1e-9, `ordinary jumps moved under the gate: max |Δboom| ${jd}`);
  assert.ok(jf.every((f) => !f.gate), 'the gate opened during an unattached route');

  console.log(`[climbcam] T1 climb ${after.length}f: fixed min boom ${fixedMin.toFixed(3)} vs masked crushed ${crushed.length}/${after.length} · T3 first divergence @${firstDiv} (${firstDiv >= 0 ? t3[firstDiv].at : '—'}) · jumps |Δ| ${jd.toExponential(1)}`);
});
