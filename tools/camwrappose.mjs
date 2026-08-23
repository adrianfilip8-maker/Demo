/**
 * camwrappose.mjs — extract the A/B poses §640's frames are taken from.
 *
 * The φ wrap is a knife-edge pose. §583 established that a browser drive cannot reach it (the node
 * route swings with an analog `move.x = 0.8` and `KeyD` gives 1.0, so the browser is on a different
 * trajectory), and photographed it by REPLAYING a node-traced pose with the rig held off. This does
 * the same thing for an A/B.
 *
 * ── WHY A REPLAY AND NOT TWO DRIVES (§442) ───────────────────────────────────────────────────
 * The two regimes have different cameras, and the Controller reads the camera back for its
 * camera-relative input, so two coupled drives diverge in TRAJECTORY within a few frames. Frames
 * taken from them would be two different games under one heading. So: drive ONCE with the floor
 * off, record the player's trajectory, then replay that one trajectory through two PASSIVE rigs
 * that differ only in `subjectFloor`. Same subject, same frame, same everything but the mechanism
 * — which is camstate arm 5's method, on this lane's own question.
 *
 * TWO EVENTS, not one (§466.5). Prints the two largest wrap steps on the route and both of their
 * before/after pairs, so the frames can carry two samples per claim.
 *
 *   node tools/camwrappose.mjs            → poses to stdout and shots/camlane6/poses.json
 */
import * as THREE from 'three';
import { realWorld, hardReset, DT } from '../tests/_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';
import { TUNE as CT } from '../src/player/Controller.js';
import { forceRoutes, STICKS } from './camforce.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const DEG = 180 / Math.PI;

/** One coupled drive with the floor OFF — the regime the wrap lives in. Records the trajectory. */
async function traceOff(route, stick) {
  const { engine, c, collision } = await realWorld();
  const keepGet = engine.get, keepCam = engine.camera, keepFloor = TUNE.subjectFloor;
  TUNE.subjectFloor = false;
  const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 4000);
  engine.camera = cam;
  engine.get = (m) => (m === 'movement' ? c : m === 'collision' ? collision : keepGet(m));
  const samples = [];
  try {
    hardReset(engine, c, route.start, route.yaw ?? Math.PI);
    engine.input.clear?.();
    if (!engine.input.look) engine.input.look = { x: 0, y: 0 };
    if (route.pre) route.pre(c, engine);
    const rig = new CameraRig(engine); rig.init?.(); rig.snap(true);
    for (let i = 0; i < (route.frames ?? 400); i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      const lk = STICKS[stick](i);
      engine.input.look.x = lk.x; engine.input.look.y = lk.y;
      const stop = route.script ? route.script(engine.input, i, c) : false;
      engine.time = i * DT; engine.dt = DT;
      c.update(DT, i * DT); rig.update(DT, i * DT);
      engine.events.length = 0;
      samples.push({ px: c.position.x, py: c.position.y, pz: c.position.z,
        vx: c.velocity.x, vy: c.velocity.y, vz: c.velocity.z,
        state: c.stateName, grounded: c.grounded, yaw: c.yaw, height: c.height,
        at: c.attached ? c.attached.tag : null, look: { x: lk.x, y: lk.y } });
      if (stop) break;
    }
    rig.dispose?.();
  } finally { engine.get = keepGet; engine.camera = keepCam; TUNE.subjectFloor = keepFloor; }
  return { samples, collision };
}

/** Replay one recorded trajectory through a passive rig at a given `subjectFloor`. */
function replay(samples, collision, floor) {
  const keep = TUNE.subjectFloor;
  TUNE.subjectFloor = floor;
  try {
    const mv = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), grounded: true,
      stateName: 'idle', yaw: Math.PI, attached: null, height: CT.height };
    const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 4000);
    const L = new Map();
    const input = { look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, zoom: 0, pressed: () => false, down: () => false };
    const eng = {
      input, camera: cam, scene: new THREE.Scene(), movement: mv, collision,
      time: 0, dt: 0, timeScale: 1, debug: { freeCam: false }, warn() {}, has() { return false; },
      on(e, f) { if (!L.has(e)) L.set(e, new Set()); L.get(e).add(f); return () => {}; },
      emit(e, p) { for (const f of L.get(e) || []) f(p); },
      get(n) { return n === 'movement' ? mv : n === 'collision' ? collision : null; },
    };
    const rig = new CameraRig(eng); rig.init?.();
    const feed = (s) => {
      mv.position.set(s.px, s.py, s.pz); mv.velocity.set(s.vx, s.vy, s.vz);
      mv.stateName = s.state; mv.grounded = s.grounded; mv.yaw = s.yaw; mv.height = s.height;
      mv.attached = s.at ? { tag: s.at } : null;
      input.look.x = s.look.x; input.look.y = s.look.y;
    };
    feed(samples[0]); rig.snap(true);
    const out = [];
    for (let i = 0; i < samples.length; i++) {
      feed(samples[i]);
      eng.dt = DT; eng.time = i * DT;
      rig.update(DT, i * DT);
      out.push({ pos: cam.position.clone(), quat: cam.quaternion.clone(),
        boom: rig.boom, need: rig._clampPitch * DEG, floorOn: !!rig._subjFloorOn });
    }
    return out;
  } finally { TUNE.subjectFloor = keep; }
}

const { collision } = await realWorld();
const route = forceRoutes(collision).find((r) => r.label === 'pole swing, slow cadence');
const STICK = 'down';
const { samples } = await traceOff(route, STICK);
const off = replay(samples, collision, false);
const on = replay(samples, collision, TUNE.subjectFloor);

/* The wrap events, ranked. A wrap is the applied rotation reversing sign past a right angle —
   the same signature camstate's π-wrap arm uses, so the two agree on what is being photographed. */
const events = [];
for (let i = 1; i < off.length; i++) {
  const step = off[i].quat.angleTo(off[i - 1].quat) * DEG;
  if (step < 60) continue;
  const rev = off[i].need * off[i - 1].need < 0 && Math.abs(off[i - 1].need) > 1.5;
  const pm = Math.hypot(samples[i].px - samples[i - 1].px, samples[i].py - samples[i - 1].py,
    samples[i].pz - samples[i - 1].pz);
  events.push({ i, step, rev, pm, onStep: on[i].quat.angleTo(on[i - 1].quat) * DEG });
}
events.sort((a, b) => b.step - a.step);
console.log(`\n${route.label} · stick ${STICK} · ${samples.length} frames · ${events.length} steps over 60°/frame with the floor OFF`);
console.log('  frame   off °/f   on °/f   wrap?   player moved (m)');
for (const e of events.slice(0, 8)) {
  console.log(`  ${String(e.i).padStart(5)} ${e.step.toFixed(1).padStart(9)} ${e.onStep.toFixed(2).padStart(8)} `
    + `${(e.rev ? 'yes' : 'no').padStart(7)} ${e.pm.toFixed(4).padStart(18)}`);
}

/* THE WRAP'S OWN SIGNATURE, and the filter is the finding rather than a convenience: §583 named
   it as "125–143° of camera for 9 cm of Sly". A step where the player moved most of a metre in one
   frame is a subject that genuinely traversed a large angle at a 0.55 m boom — real, not a wrap,
   and not this repair's to fix. f232 on this route is exactly that: 179.2°/f with the player
   moving 0.92 m through a fall→poleClimb handoff, and the floor leaves it at 152.8°. Photographing
   it as a wrap would be a measurement correctly performed on the wrong subject (§442). */
const pick = events.filter((e) => e.rev && e.pm < 0.35).slice(0, 2);
if (!pick.length) { console.log('\nNO WRAP EVENT ON THIS ROUTE — nothing to photograph'); process.exit(1); }

const OUT = 'shots/camlane6';
mkdirSync(OUT, { recursive: true });
const poses = [];
for (const e of pick) {
  for (const k of [e.i - 1, e.i]) {
    for (const [reg, arr] of [['off', off], ['on', on]]) {
      poses.push({
        n: `f${e.i}-${k === e.i ? 'after' : 'before'}-${reg}`,
        frame: k, regime: reg, event: e.i, step: +e.step.toFixed(2), onStep: +e.onStep.toFixed(2),
        p: [+samples[k].px.toFixed(4), +samples[k].py.toFixed(4), +samples[k].pz.toFixed(4)],
        h: samples[k].height, state: samples[k].state,
        cam: [+arr[k].pos.x.toFixed(4), +arr[k].pos.y.toFixed(4), +arr[k].pos.z.toFixed(4)],
        q: [+arr[k].quat.x.toFixed(6), +arr[k].quat.y.toFixed(6), +arr[k].quat.z.toFixed(6), +arr[k].quat.w.toFixed(6)],
        boom: +arr[k].boom.toFixed(3), need: +arr[k].need.toFixed(1), floorOn: arr[k].floorOn,
      });
    }
  }
}
writeFileSync(`${OUT}/poses.json`, JSON.stringify({ route: route.label, stick: STICK, poses }, null, 2));
console.log(`\ntwo events picked: f${pick.map((e) => e.i).join(', f')} — ${poses.length} poses to ${OUT}/poses.json`);
for (const p of poses) {
  console.log(`  ${p.n.padEnd(22)} player [${p.p.join(', ')}] ${p.state.padEnd(10)} boom ${String(p.boom).padStart(6)} need ${String(p.need).padStart(7)}° floor ${p.floorOn ? 'BOUND' : '.'}`);
}
process.exit(0);
