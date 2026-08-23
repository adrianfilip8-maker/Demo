/**
 * padreach.mjs — drive the vent route through the REAL `Input`, once per device.
 *
 * Why this exists (§660): `tests/ventroute.test.mjs` — the check §602 shipped behind — drives the
 * shipped Controller with `tests/_moveset.mjs`'s `StubInput`, writing `inp.move.y = 1` straight
 * into the movement vector. That bypasses `src/core/Input.js` ENTIRELY: no radial deadzone, no
 * `moveFloor` remap, no `_padStick`, no `_padValue` trust gate, no d-pad fold. So the vent has
 * never been driven through the class that a real player's hands actually reach, on EITHER device.
 *
 * This drives the identical route with a real `Input` and swaps only the device underneath it.
 *
 * Usage: node tools/padreach.mjs
 */
import * as THREE from 'three';
import { installDom } from '../tests/_hudshim.mjs';

/* ---------------------------------------------------------------- DOM + pad */
const { doc, win } = installDom();
function listenable(o) {
  const h = new Map();
  const add = o.addEventListener;
  o.addEventListener = (t, fn) => { add?.call?.(o, t, fn); if (!h.has(t)) h.set(t, new Set()); h.get(t).add(fn); };
  o.removeEventListener = (t, fn) => h.get(t)?.delete(fn);
  o.fire = (t, ev = {}) => { const e = { preventDefault() {}, stopPropagation() {}, ...ev }; for (const fn of [...(h.get(t) || [])]) fn(e); };
  return o;
}
listenable(doc);
doc.pointerLockElement = null;
listenable(win);
const canvas = listenable({ width: 1280, height: 720, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) });
globalThis.self = globalThis;

let padState = null;
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (padState ? [padState, null, null, null] : [null, null, null, null]) },
  configurable: true, writable: true,
});

const { Input } = await import('../src/core/Input.js');
const M = await import('../tests/_moveset.mjs');

const DT = 1 / 60;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A DS4 as Chrome's standard mapping reports it: 17 buttons, 4 axes, everything at rest. */
const freshPad = (trigRest = 0) => ({
  id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  index: 0, connected: true, mapping: 'standard', timestamp: 0,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: false, value: (i === 6 || i === 7) ? trigRest : 0 })),
  axes: [0, 0, 0, 0],
});

/* ------------------------------------------------------------------- drives */
/**
 * Each driver is handed the real `Input` and the frame index, and must produce "hold forward"
 * using ONLY the affordance that device has. Nothing writes `input.move` directly — that is the
 * whole point.
 */
const DRIVERS = {
  /* A keyboard player holding W. Dispatched as real DOM keydown/keyup, the way the browser does. */
  keyboard: {
    start: (input) => { win.fire('keydown', { code: 'KeyW', repeat: false }); },
    frame: () => {},
    stop: () => { win.fire('keyup', { code: 'KeyW' }); },
  },
  /* A pad player pushing the left stick fully forward. axis 1 is +down, so forward is -1. */
  stick: {
    start: () => { padState.axes = [0, -1, 0, 0]; },
    frame: () => { padState.timestamp++; },
    stop: () => { padState.axes = [0, 0, 0, 0]; },
  },
  /* A pad player at HALF stick — the deflection a thumb actually rests at while steering. */
  stickHalf: {
    start: () => { padState.axes = [0, -0.5, 0, 0]; },
    frame: () => { padState.timestamp++; },
    stop: () => { padState.axes = [0, 0, 0, 0]; },
  },
  /* A pad player holding d-pad up. */
  dpad: {
    start: () => { padState.buttons[12] = { pressed: true, value: 1 }; },
    frame: () => { padState.timestamp++; },
    stop: () => { padState.buttons[12] = { pressed: false, value: 0 }; },
  },
};

/* ------------------------------------------------------------------- harness */
let ENGINE = null, COL = null;

async function harness() {
  const { engine, collision, c } = await M.realWorld();
  ENGINE = engine; COL = collision;
  if (!engine.canvas) engine.canvas = canvas;
  return { engine, collision, c };
}

/**
 * Walk the waypoint list, holding forward on `device`, with the camera snapped at the next
 * waypoint each frame — deliberately IDENTICAL to `ventroute.test.mjs`'s `walk`, so the ONLY
 * variable between this and the shipped check is which class produces `move`.
 */
async function walk(device, start, waypoints, { budget = 3000, trigRest = 0 } = {}) {
  const { engine, c } = await harness();
  padState = freshPad(trigRest);
  const input = new Input(engine);
  engine.input = input;
  c.input = input;

  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };

  M.hardReset(engine, c, V(...start), Math.atan2(waypoints[0][0] - start[0], waypoints[0][1] - start[2]));
  const d = DRIVERS[device];

  // Settle grounded with no input at all.
  for (let i = 0; i < 30; i++) {
    input._lastReal = performance.now() - 1000 / 60;
    input.beginFrame(DT); engine.time += DT; c.update(DT, engine.time); input.endFrame();
  }
  const settled = c.grounded;

  d.start(input);
  let wp = 0, sawCrawl = false, frames = 0;
  let moveMagMin = Infinity, moveMagMax = 0, wishMin = Infinity;
  const states = new Set();
  for (let i = 0; i < budget; i++) {
    const t = waypoints[Math.min(wp, waypoints.length - 1)];
    aim(t[0], t[1]);
    d.frame(input, i);
    input._lastReal = performance.now() - 1000 / 60;
    input.beginFrame(DT);
    const mag = Math.hypot(input.move.x, input.move.y);
    if (mag < moveMagMin) moveMagMin = mag;
    if (mag > moveMagMax) moveMagMax = mag;
    engine.time += DT; c.update(DT, engine.time);
    if (c.wishMag < wishMin) wishMin = c.wishMag;
    input.endFrame();
    frames = i;
    states.add(c.stateName);
    if (c.stateName === 'crawl') sawCrawl = true;
    const dd = Math.hypot(c.position.x - t[0], c.position.z - t[1]);
    if (dd < 1.1 && wp < waypoints.length - 1) wp++;
    else if (wp === waypoints.length - 1 && dd < 1.1) break;
  }
  d.stop(input);
  input.dispose?.();
  return {
    device, settled, sawCrawl, frames, wp, moveMagMin, moveMagMax, wishMin,
    end: c.position.clone(), state: c.stateName, grounded: c.grounded, states: [...states],
  };
}

/* ---------------------------------------------------------------------- run */
const ROUTE = { start: [-21.85, 0.20, -46.0], wps: [[-21.85, -52], [-21.85, -60], [-18.0, -63.0], [-11.4, -63.0]] };
const arrived = (r) => r.end.x > -12.5 && r.grounded && Math.abs(r.end.y + 5.40) < 0.2;

const rows = [];
for (const dev of ['keyboard', 'stick', 'stickHalf', 'dpad']) {
  const r = await walk(dev, ROUTE.start, ROUTE.wps);
  rows.push(r);
  console.log(
    `[padreach] ${dev.padEnd(10)} settled=${r.settled} crawl=${String(r.sawCrawl).padEnd(5)} `
    + `frames=${String(r.frames).padStart(4)} end=(${r.end.x.toFixed(2)}, ${r.end.y.toFixed(2)}, ${r.end.z.toFixed(2)}) `
    + `state=${r.state.padEnd(8)} |move|=${r.moveMagMin.toFixed(3)}..${r.moveMagMax.toFixed(3)} `
    + `ARRIVED=${arrived(r)}`
  );
}

/* Trigger-rest arm: a pad whose L2/R2 rest at +1 (§542's non-conformant driver). If crouch were on
   the vent's critical path, THIS is the row that would fail while the others pass. */
const stuck = await walk('stick', ROUTE.start, ROUTE.wps, { trigRest: 1 });
console.log(
  `[padreach] ${'stick+L2@1'.padEnd(10)} settled=${stuck.settled} crawl=${String(stuck.sawCrawl).padEnd(5)} `
  + `frames=${String(stuck.frames).padStart(4)} end=(${stuck.end.x.toFixed(2)}, ${stuck.end.y.toFixed(2)}, ${stuck.end.z.toFixed(2)}) `
  + `state=${stuck.state.padEnd(8)} ARRIVED=${arrived(stuck)}`
);

/* Calibration: the same drive 10 m east, where the wall was never cut. If THIS arrives, the rig is
   not measuring the doorway and every row above is worthless (§435.4). */
const ctrl = await walk('stick', [-12.0, 0.20, -46.0], [[-12.0, -52], [-12.0, -60], [-12.0, -63.0]], { budget: 900 });
console.log(
  `[padreach] ${'CONTROL'.padEnd(10)} (10 m east, uncut wall) end.z=${ctrl.end.z.toFixed(2)} crawl=${ctrl.sawCrawl} `
  + `ARRIVED=${arrived(ctrl)}  ${(!ctrl.sawCrawl && ctrl.end.z > -50.2) ? 'OK — the rig can fail' : '!! VACUOUS'}`
);
