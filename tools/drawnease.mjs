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
