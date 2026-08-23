/**
 * padclaim.mjs — does a pad press CLAIM the device, in every state the page can be in?
 *
 * §552 hangs the whole pad-audio path on one signal: `_press(a,'pad')` -> `_setDevice('pad')` ->
 * `engine.emit('inputDevice','pad')` -> `Audio.unlock()`. That is the ONLY route from a pad to a
 * running AudioContext, because a gamepad button fires no DOM event. This asks whether the signal
 * is produced in each of the states an `Input` can actually be in when the player's thumb lands.
 *
 * Usage: node tools/padclaim.mjs
 */
import * as THREE from 'three';
import { installDom } from '../tests/_hudshim.mjs';

const { doc, win } = installDom();
function listenable(o) {
  const h = new Map();
  const add = o.addEventListener;
  o.addEventListener = (t, fn) => { add?.call?.(o, t, fn); if (!h.has(t)) h.set(t, new Set()); h.get(t).add(fn); };
  o.removeEventListener = (t, fn) => h.get(t)?.delete(fn);
  o.fire = (t, ev = {}) => { const e = { preventDefault() {}, stopPropagation() {}, ...ev }; for (const fn of [...(h.get(t) || [])]) fn(e); };
  return o;
}
listenable(doc); doc.pointerLockElement = null; listenable(win);
const canvas = listenable({ width: 1280, height: 720, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) });
globalThis.self = globalThis;

let padState = null;
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (padState ? [padState, null, null, null] : [null, null, null, null]) },
  configurable: true, writable: true,
});

const { Input } = await import('../src/core/Input.js');
const DT = 1 / 60;

const freshPad = () => ({
  id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  index: 0, connected: true, mapping: 'standard', timestamp: 0,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
});

function rig() {
  const bus = new Map();
  const emitted = [];
  const engine = {
    canvas, camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000), scene: new THREE.Scene(),
    width: 1280, height: 720, dt: DT, time: 0, timeScale: 1, quality: 'high', warnings: [],
    debug: {}, warn() {}, has: () => false, get: () => null,
    on(e, f) { if (!bus.has(e)) bus.set(e, new Set()); bus.get(e).add(f); return () => bus.get(e).delete(f); },
    emit(e, p) { emitted.push({ e, p }); for (const f of bus.get(e) || []) f(p); },
    registerCollider() {},
  };
  padState = freshPad();
  const input = new Input(engine);
  engine.input = input;
  /* The exact subscription `Audio._wireEngine` makes (src/audio/Audio.js:1509). */
  let unlocks = 0;
  engine.on('inputDevice', (dev) => { if (dev === 'pad') unlocks++; });
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { input._lastReal = performance.now() - 1000 / 60; input.beginFrame(DT); input.endFrame(); } };
  const press = (i) => { padState.buttons[i] = { pressed: true, value: 1 }; padState.timestamp++; };
  const release = (i) => { padState.buttons[i] = { pressed: false, value: 0 }; padState.timestamp++; };
  return { engine, input, emitted, tick, press, release, unlocks: () => unlocks };
}

const rows = [];
const report = (name, r, note = '') => {
  rows.push({ name, ...r });
  console.log(`[padclaim] ${name.padEnd(34)} lastDevice=${String(r.lastDevice).padEnd(5)} inputDeviceEmits=${r.emits} unlockCalls=${r.unlocks} down(jump)=${r.down}  ${note}`);
};

/* ---- 1. the ordinary case: page boots, player picks up the pad, presses Cross ---- */
{
  const { input, tick, press, unlocks, emitted } = rig();
  tick(10);                       // pad at rest — trust granted for every index
  press(0); tick(6);
  report('cold boot -> Cross', {
    lastDevice: input.lastDevice, emits: emitted.filter((x) => x.e === 'inputDevice').length,
    unlocks: unlocks(), down: input.down('jump'),
  });
}

/* ---- 2. the SAME press, one blur earlier ---- */
{
  const { input, tick, press, unlocks, emitted } = rig();
  tick(10);
  win.fire('blur');               // alt-tab, click outside the canvas, focus moved
  press(0); tick(6);
  report('blur -> Cross', {
    lastDevice: input.lastDevice, emits: emitted.filter((x) => x.e === 'inputDevice').length,
    unlocks: unlocks(), down: input.down('jump'),
  }, '<-- the audio path');
}

/* ---- 3. the press the player actually makes first: HOLD, then boot notices ---- */
{
  const { input, tick, press, unlocks, emitted } = rig();
  press(0);                       // already held on the very first poll
  tick(16);
  report('Cross already held at frame 0', {
    lastDevice: input.lastDevice, emits: emitted.filter((x) => x.e === 'inputDevice').length,
    unlocks: unlocks(), down: input.down('jump'),
  }, '<-- §542 trust gate');
}

/* ---- 4. pad plugged in AFTER boot (the real order for a DS4 over Bluetooth) ---- */
{
  const { input, tick, press, unlocks, emitted } = rig();
  const saved = padState; padState = null;
  tick(10);                       // no pad connected yet
  padState = saved;
  press(0); tick(6);              // plugged in and pressed in the same breath
  report('pad appears, then Cross', {
    lastDevice: input.lastDevice, emits: emitted.filter((x) => x.e === 'inputDevice').length,
    unlocks: unlocks(), down: input.down('jump'),
  });
}

/* ---- 5. the left stick alone, no button at all ---- */
{
  const { input, tick, unlocks, emitted } = rig();
  tick(10);
  padState.axes = [0, -1, 0, 0]; padState.timestamp++;
  tick(6);
  report('left stick pushed, no button', {
    lastDevice: input.lastDevice, emits: emitted.filter((x) => x.e === 'inputDevice').length,
    unlocks: unlocks(), down: input.down('jump'),
  });
}

/* ---- 6. blur, then the left stick ---- */
{
  const { input, tick, unlocks, emitted } = rig();
  tick(10);
  win.fire('blur');
  padState.axes = [0, -1, 0, 0]; padState.timestamp++;
  tick(6);
  report('blur -> left stick', {
    lastDevice: input.lastDevice, emits: emitted.filter((x) => x.e === 'inputDevice').length,
    unlocks: unlocks(), down: input.down('jump'),
  });
}

/* ---- 7. blur, then Cross RELEASED and pressed again (what a player does next) ---- */
{
  const { input, tick, press, release, unlocks, emitted } = rig();
  tick(10);
  win.fire('blur');
  press(0); tick(6); release(0); tick(6); press(0); tick(6);
  report('blur -> Cross, release, Cross', {
    lastDevice: input.lastDevice, emits: emitted.filter((x) => x.e === 'inputDevice').length,
    unlocks: unlocks(), down: input.down('jump'),
  });
}
