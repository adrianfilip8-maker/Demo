/**
 * Routing probe for the coordinator's third directive: "ease what is DRAWN, not what is simulated."
 *
 * The question it answers is NOT "would easing look better" — it is the narrower routing question:
 * does the visible teleport belong to the camera (another lane) or to the drawn model (mine)?
 *
 * Method. Drive telegraph's four-ring chain twice.
 *   run A — no CameraRig. Control: establishes the ring order and the capsule's per-frame track.
 *   run B — a real CameraRig attached, stepped after the controller each frame. Records the
 *           camera's own per-frame displacement over the same drive.
 * If run B's ring order differs from run A's, the rig perturbed the drive and run B's camera track
 * is not a measurement of this chain; the probe says so instead of reporting a number (§439).
 *
 * What separates the two hypotheses:
 *   · if the CAMERA jumps by ~the capsule's snap on a long catch, the cut is the camera's and
 *     easing the drawn model cannot remove it -> routing question, camera lane.
 *   · if the camera's largest step is a small fraction of the capsule's, the camera already eases
 *     the snap and what the player sees cut is the MODEL, which hard-copies the capsule in
 *     Controller._pushCharacter -> no other lane needed.
 */
import * as THREE from 'three';
import { realWorld, hardReset, DT as dt } from '../tests/_moveset.mjs';
import { CameraRig } from '../src/player/CameraRig.js';

const LINTEL = new THREE.Vector3(2.2, 9.0, 8.4);
const RINGS = [new THREE.Vector3(4.2, 14.8, 4.5), new THREE.Vector3(1.0, 14.5, -3.0),
               new THREE.Vector3(-4.0, 13.9, -8.5), new THREE.Vector3(-9.5, 13.2, -13.0)];
const ringOf = (p) => { let b = -1, bd = 1.2; RINGS.forEach((r, i) => { const d = r.distanceTo(p); if (d < bd) { bd = d; b = i; } }); return b; };
const WS = [156, 12, 24];

const { engine, c } = await realWorld();

/* `realWorld()`'s engine registers no 'movement', and `CameraRig._readPlayer` silently falls back
 * to orbiting the ORIGIN when it is missing — which produces a camera that steps ~0 m per frame
 * and looks exactly like a perfect spring. The first version of this probe reported that as
 * "the camera already eases the snap". It was measuring a camera that had never seen Sly.
 * Publish the live controller under the name the rig looks for. */
const _get = engine.get.bind(engine);
engine.get = (n) => (n === 'movement' ? c : _get(n));

function aim(dx, dz) {
  const l = Math.hypot(dx, dz) || 1;
  engine.camera.rotation.set(0, Math.atan2(-dx / l, -dz / l), 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
}

function drive(withRig) {
  hardReset(engine, c, LINTEL.clone(), Math.PI);
  engine.events.length = 0;
  let rig = null;
  if (withRig) { rig = new CameraRig(engine); rig.init?.(); }
  const order = []; const capStep = []; const camStep = []; const grabSteps = [];
  const range = { min: Infinity, max: 0, last: 0 };
  let grabs = 0, grabFrame = -1, bailing = false;
  const prevCap = c.position.clone();
  const prevCam = engine.camera.position.clone();
  for (let f = 0; f < 2600; f++) {
    const target = RINGS[Math.min(grabs, RINGS.length - 1)];
    const swinging = c.sm.name === 'hookSwing';
    if (swinging) aim(c.velocity.x, c.velocity.z);
    else aim(target.x - c.position.x, target.z - c.position.z);
    engine.input.beginFrame(dt);
    engine.input.move.x = 0; engine.input.move.y = 1;
    if (f === 1 || f === 2) engine.input.hold('jump');
    else if (f === 3) engine.input.let_go('jump');
    else if (!swinging && grabs === 0 && f > 3) engine.input.hold('interact');
    if (swinging) {
      if (grabFrame >= 0 && grabs <= WS.length && f - grabFrame === WS[grabs - 1]) {
        engine.input.hold('jump'); bailing = true;
      } else if (bailing) { engine.input.let_go('jump'); bailing = false; }
    }
    engine.time = f * dt; c.update(dt, f * dt);
    if (rig) { try { rig.update(dt); } catch (e) { console.log('rig.update threw:', e.message); rig = null; } }

    const dCap = prevCap.distanceTo(c.position);
    const dCam = prevCam.distanceTo(engine.camera.position);
    capStep.push(dCap); camStep.push(dCam);
    prevCap.copy(c.position); prevCam.copy(engine.camera.position);
    if (withRig && f > 0) {
      const r = engine.camera.position.distanceTo(c.position);
      if (r < range.min) range.min = r;
      if (r > range.max) range.max = r;
      range.last = r;
    }

    for (const e of engine.events) {
      if (e.evt === 'hookGrab') {
        order.push(ringOf(e.payload.pos) + 1);
        grabs++; grabFrame = f;
        grabSteps.push({ f, ring: ringOf(e.payload.pos) + 1, cap: dCap, cam: dCam });
      }
    }
    engine.events.length = 0;
    if (grabs >= 4) break;
    if (c.grounded && grabs > 0 && f > grabFrame + 30) break;
  }
  const sum = (a) => a.slice(1).reduce((s, v) => s + v, 0);
  return { order, capStep, camStep, grabSteps, range, camTotal: sum(camStep), capTotal: sum(capStep) };
}

const CENSUS = process.argv.includes('--census');

if (!CENSUS) {
const A = drive(false);
const B = drive(true);

const fmt = (a) => `[${a.join(',')}]`;
console.log(`run A  (no rig, control) ring order ${fmt(A.order)}   frames ${A.capStep.length}`);
console.log(`run B  (rig attached)    ring order ${fmt(B.order)}   frames ${B.capStep.length}`);

if (fmt(A.order) !== fmt(B.order)) {
  console.log('\nPERTURBED: attaching the rig changed the chain, so run B\'s camera track is not a');
  console.log('measurement of this chain. No number reported.');
  process.exit(0);
}

const maxOf = (a) => a.reduce((m, v) => (v > m ? v : m), 0);
const over = (a, t) => a.filter((v) => v > t).length;

console.log('\n  per-frame displacement over the four-ring chain, metres');
console.log(`    capsule   max ${maxOf(B.capStep).toFixed(3)}   frames > 0.5 m: ${over(B.capStep, 0.5)}   > 1.5 m: ${over(B.capStep, 1.5)}`);
console.log(`    camera    max ${maxOf(B.camStep).toFixed(3)}   frames > 0.5 m: ${over(B.camStep, 0.5)}   > 1.5 m: ${over(B.camStep, 1.5)}`);

console.log('\n  the four grab frames — the catches the user calls teleports');
for (const g of B.grabSteps) {
  console.log(`    ring ${g.ring} at f${String(g.f).padStart(4)}   capsule ${g.cap.toFixed(3)} m   camera ${g.cam.toFixed(3)} m   ratio ${(g.cam / (g.cap || 1)).toFixed(3)}`);
}

/* ── §439: an instrument that cannot see the subject cannot falsify a claim about it ──────────
 * A camera step of 0.001 m on a frame where the capsule moves 4.6 m is either a very good spring
 * or a rig that never read the player at all — `_readPlayer` falls back to orbiting the ORIGIN
 * when `engine.get('movement')` is missing, and a static orbit also steps ~0 per frame. These are
 * indistinguishable from the step alone. Separate them by RANGE: a rig that is following Sly sits
 * a boom's length from him; a rig orbiting the origin sits wherever he happens to be from it. */
console.log('\n  did the rig ever see the player?');
console.log(`    engine.get('movement') -> ${engine.get('movement') ? 'present' : 'MISSING'}`);
console.log(`    same object as c        -> ${engine.get('movement') === c}`);
console.log(`    camera↔capsule range: min ${B.range.min.toFixed(2)} m  max ${B.range.max.toFixed(2)} m  final ${B.range.last.toFixed(2)} m`);
console.log(`    camera travelled ${B.camTotal.toFixed(1)} m over the chain; capsule travelled ${B.capTotal.toFixed(1)} m`);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * --census — the derivation behind `Controller.TUNE.drawSnapMin` (§604).
 *
 * The easing can only hold back a displacement it can tell apart from ordinary motion, and the
 * separator is not size. A dive reaches 0.785 m per frame honestly; the chain's entry catch covers
 * 4.646 m from a standstill. What distinguishes them is whether velocity ACCOUNTS for the
 * distance: ordinary motion travels |v|·dt, a placement does not. So the censused quantity is the
 * unexplained displacement, |Δp| − |v|·dt, over regimes wide enough to contain the ceiling.
 *
 * The velocity must be read BEFORE the update. The first version of this read it after and scored
 * every landing as an unexplained jump — contact zeroes the vertical component, so |v|·dt reads
 * ~0 for a frame the capsule really did travel. Same class of fault as the blind rig above: the
 * right idea sampled in the wrong place.
 * ═════════════════════════════════════════════════════════════════════════════════════════════ */
if (CENSUS) {
  const { TUNE: CTUNE } = await import('../src/player/Controller.js');
  const rows = [];

  const census = (prev, vBefore, f) => {
    const moved = prev.distanceTo(c.position);
    const vdt = vBefore * dt;
    return { f, moved, vdt, drift: moved - Math.min(moved, vdt), state: c.sm.name };
  };

  /* the chain — the population the easing exists for */
  hardReset(engine, c, LINTEL.clone(), Math.PI);
  engine.events.length = 0;
  {
    let grabs = 0, grabFrame = -1, bailing = false;
    const prev = c.position.clone();
    for (let f = 0; f < 2600; f++) {
      const target = RINGS[Math.min(grabs, RINGS.length - 1)];
      const swinging = c.sm.name === 'hookSwing';
      if (swinging) aim(c.velocity.x, c.velocity.z);
      else aim(target.x - c.position.x, target.z - c.position.z);
      engine.input.beginFrame(dt);
      engine.input.move.x = 0; engine.input.move.y = 1;
      if (f === 1 || f === 2) engine.input.hold('jump');
      else if (f === 3) engine.input.let_go('jump');
      else if (!swinging && grabs === 0 && f > 3) engine.input.hold('interact');
      if (swinging) {
        if (grabFrame >= 0 && grabs <= WS.length && f - grabFrame === WS[grabs - 1]) {
          engine.input.hold('jump'); bailing = true;
        } else if (bailing) { engine.input.let_go('jump'); bailing = false; }
      }
      const vB = c.velocity.length();
      engine.time = f * dt; c.update(dt, f * dt);
      const r = census(prev, vB, f); prev.copy(c.position);
      for (const e of engine.events) if (e.evt === 'hookGrab') { r.isCatch = true; grabs++; grabFrame = f; }
      engine.events.length = 0;
      rows.push(r);
      if (grabs >= 4) break;
      if (c.grounded && grabs > 0 && f > grabFrame + 30) break;
    }
  }

  /* the ordinary population — run and jump across six parts of the level */
  const SEEDS = [['courtyard', 0, 20], ['hall north', 0, -30], ['hall south', 0, -46],
                 ['west aisle', -9, -34], ['east aisle', 9, -34], ['terrace', 4, 8]];
  for (const [, x, z] of SEEDS) {
    hardReset(engine, c, new THREE.Vector3(x, 2, z), 0);
    engine.events.length = 0;
    const prev = c.position.clone();
    for (let f = 0; f < 900; f++) {
      aim(Math.sin(f / 90), Math.cos(f / 90));
      engine.input.beginFrame(dt);
      engine.input.move.x = 0; engine.input.move.y = 1;
      engine.input.hold('run');
      if (f % 47 === 0) engine.input.hold('jump');
      else if (f % 47 === 2) engine.input.let_go('jump');
      const vB = c.velocity.length();
      engine.time = f * dt; c.update(dt, f * dt);
      rows.push(census(prev, vB, f)); prev.copy(c.position);
      engine.events.length = 0;
    }
  }

  const catches = rows.filter((r) => r.isCatch);
  const byState = new Map();
  for (const r of rows) {
    const s = byState.get(r.state) || { n: 0, maxStep: 0, maxDrift: 0 };
    s.n++;
    if (r.moved > s.maxStep) s.maxStep = r.moved;
    if (r.drift > s.maxDrift) s.maxDrift = r.drift;
    byState.set(r.state, s);
  }

  console.log(`\ncensus: ${rows.length} frames over ${SEEDS.length + 1} regimes\n`);
  console.log('  state           frames   worst step   worst UNEXPLAINED');
  for (const [s, v] of [...byState.entries()].sort((a, b) => b[1].maxDrift - a[1].maxDrift)) {
    console.log(`    ${s.padEnd(14)} ${String(v.n).padStart(5)}    ${v.maxStep.toFixed(3)} m      ${v.maxDrift.toFixed(3)} m`);
  }

  console.log('\n  the catches, which the easing must hold back:');
  for (const r of catches) {
    console.log(`    f${String(r.f).padStart(4)}  step ${r.moved.toFixed(3)}  explained ${r.vdt.toFixed(3)}  unexplained ${r.drift.toFixed(3)}`);
  }

  /* Continuous locomotion means the state was not putting him anywhere: every state that mounts or
     catches is excluded, and what remains is the ceiling the threshold has to clear. */
  const PLACING = new Set(['hookSwing', 'poleClimb', 'ledgeClimb', 'railSlide', 'railWalk', 'spireLand', 'poleSwing']);
  const loco = rows.filter((r) => !PLACING.has(r.state));
  const ceiling = loco.reduce((m, r) => (r.drift > m.drift ? r : m), { drift: -Infinity, state: '?' });
  const smallest = catches.reduce((m, r) => (r.drift < m.drift ? r : m), { drift: Infinity });

  console.log(`\n  continuous-locomotion ceiling   ${ceiling.drift.toFixed(3)} m  (${ceiling.state}, ${loco.length} frames)`);
  console.log(`  smallest catch                  ${smallest.drift.toFixed(3)} m`);
  console.log('\n  candidate   locomotion frames it would catch   catches it would miss');
  for (const t of [0.30, 0.35, 0.40, 0.45, 0.50, 0.60, 0.70, 0.80, 0.90]) {
    const bad = loco.filter((r) => r.drift > t).length;
    const miss = catches.filter((r) => r.drift <= t).length;
    const mark = Math.abs(t - CTUNE.drawSnapMin) < 1e-9 ? '   <- shipped' : '';
    console.log(`    ${t.toFixed(2)} m          ${String(bad).padStart(4)} of ${loco.length}                      ${String(miss).padStart(2)} of ${catches.length}${mark}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * --frames — the staging data for `tools/drawshot.mjs` (§604 item 4).
 *
 * A canonical shot cannot photograph this: `setShot` turns on `freeCam`, and the freeCam branch of
 * `Controller.update` deliberately spends the easing offset so a posed frame is drawn exactly
 * where the recipe put it. So the frames are STAGED from measured play instead — this drives the
 * real chain with the real rig, and at each catch writes out where the camera was, where the
 * capsule was, and where the drawn body was with the easing in force. `drawshot.mjs` then puts the
 * character root at each of those two positions under the same camera. What the pair shows is one
 * simulation frame drawn both ways; the positions are measured, not composed.
 * ═════════════════════════════════════════════════════════════════════════════════════════════ */
if (process.argv.includes('--frames')) {
  const rig = new CameraRig(engine); rig.init?.();
  hardReset(engine, c, LINTEL.clone(), Math.PI);
  engine.events.length = 0;
  const out = [];
  let grabs = 0, grabFrame = -1, bailing = false;
  for (let f = 0; f < 2600; f++) {
    const target = RINGS[Math.min(grabs, RINGS.length - 1)];
    const swinging = c.sm.name === 'hookSwing';
    if (swinging) aim(c.velocity.x, c.velocity.z);
    else aim(target.x - c.position.x, target.z - c.position.z);
    engine.input.beginFrame(dt);
    engine.input.move.x = 0; engine.input.move.y = 1;
    if (f === 1 || f === 2) engine.input.hold('jump');
    else if (f === 3) engine.input.let_go('jump');
    else if (!swinging && grabs === 0 && f > 3) engine.input.hold('interact');
    if (swinging) {
      if (grabFrame >= 0 && grabs <= WS.length && f - grabFrame === WS[grabs - 1]) {
        engine.input.hold('jump'); bailing = true;
      } else if (bailing) { engine.input.let_go('jump'); bailing = false; }
    }
    engine.time = f * dt; c.update(dt, f * dt);
    try { rig.update(dt); } catch { /* rig is decoration here; the positions are the payload */ }
    let caught = null;
    for (const e of engine.events) if (e.evt === 'hookGrab') { caught = ringOf(e.payload.pos) + 1; grabs++; grabFrame = f; }
    engine.events.length = 0;
    if (caught !== null) {
      /* The camera looks along -Z in its own frame; a point 10 m down that axis is a look-at the
         browser side can reproduce without shipping a quaternion through JSON. */
      const look = new THREE.Vector3(0, 0, -10).applyQuaternion(engine.camera.quaternion).add(engine.camera.position);
      out.push({
        ring: caught, frame: f, state: c.sm.name, yaw: c.yaw,
        cam: engine.camera.position.toArray().map((v) => +v.toFixed(4)),
        look: look.toArray().map((v) => +v.toFixed(4)),
        fov: engine.camera.fov,
        capsule: c.position.toArray().map((v) => +v.toFixed(4)),
        drawn: c.position.clone().sub(c._drawLag).toArray().map((v) => +v.toFixed(4)),
        lag: +c._drawLag.length().toFixed(4),
      });
    }
    if (grabs >= 4) break;
    if (c.grounded && grabs > 0 && f > grabFrame + 30) break;
  }
  console.log(JSON.stringify(out, null, 2));
}
