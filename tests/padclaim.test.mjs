import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installDom } from './_hudshim.mjs';

/**
 * padclaim — does a pad press reach AUDIO, in every state the page can be in? (§664)
 *
 * ── What this file exists to catch, and what was already there ────────────────────────────────
 *
 * §552 established the shape of the problem: a gamepad button fires no DOM event, so
 * `pointerdown`/`keydown`/`touchstart` cannot see it, and it wired `Audio` to the one signal a pad
 * does produce — `engine.emit('inputDevice','pad')`. `padrest.test.mjs` R6 pinned the premise
 * (a real pad press fires zero DOM gesture events) and `audiosession.test.mjs` pins the unlock
 * once it is called. **Nothing joined the two.** No test in this project ever asked whether a pad
 * press actually arrives at `unlock()` through the shipped `Input`, and the answer is: usually,
 * but not in the states a player is most likely to be in.
 *
 * Driven on the shipped class, before the fix (`tools/padclaim.mjs`, reproduced by K3 below), a
 * real Cross press produced `inputDevice` emits = **0** and `unlock()` calls = **0** in three
 * distinct states, while `down('jump')` was true or about to be:
 *
 *   · after ANY focus loss — `_dropAllHeld` -> `_releaseSource('pad')` arms `_padResync`, so the
 *     next poll routes through `_adopt`, which deliberately sets no device (§540: a re-discovered
 *     hold is not an event the player caused). Correct for input; fatal for audio.
 *   · with the button already down on the first poll — §542's trust gate has never seen that
 *     control at rest, so `_padValue` returns 0 and no press is ever read.
 *   · with the pad first APPEARING on the same frame as the press — which is not an edge case:
 *     **Chrome exposes no gamepad to a page until one is used**, so it is the only order a real
 *     DS4 can arrive in.
 *
 * ── The correction, and why it is a second quantity rather than a second reading ──────────────
 *
 * `Audio.update`'s fallback used to read `input.lastDevice === 'pad'` and was described as the
 * belt-and-braces for the `inputDevice` subscription. It was not: `inputDevice` is emitted BY
 * `_setDevice`, which is what writes `lastDevice`. Two reads of one variable are one path (§439).
 * `Input.padTouched` is raw button state, sampled each `beginFrame`, sharing no mechanism with
 * `_press`, `_adopt`, `_padValue` or `_setDevice` — so it can be true when all of them are silent.
 *
 * ── The boundary of this file, stated rather than left to be discovered ───────────────────────
 *
 * Node has no `AudioContext`, so `Audio.available` is false and `unlock()` returns early. These
 * arms therefore measure ROUTING — that a press arrives at `unlock()` — and never that a sound
 * comes out. The outcome half needs a browser and lives in `tools/padaudio.mjs`, which boots the
 * page WITHOUT `?shot` (the shipped click handler in `src/main.js` is registered only on that
 * branch, so no capture tool in this project has ever executed it).
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

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
const canvas = listenable({
  width: 1280, height: 720, style: {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
});
globalThis.self = globalThis;

let padState = null;
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (padState ? [padState, null, null, null] : [null, null, null, null]) },
  configurable: true, writable: true,
});

const { Input } = await import('../src/core/Input.js');
const { Audio } = await import('../src/audio/Audio.js');

const DT = 1 / 60;

/** A DS4 as Chrome's standard mapping reports one. `trigRest` is §542's non-conformant driver. */
const freshPad = (trigRest = 0) => ({
  id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  index: 0, connected: true, mapping: 'standard', timestamp: 0,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: false, value: (i === 6 || i === 7) ? trigRest : 0,
  })),
  axes: [0, 0, 0, 0],
});

function rig({ trigRest = 0, pad = true } = {}) {
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
  padState = pad ? freshPad(trigRest) : null;
  const input = new Input(engine);
  engine.input = input;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      input._lastReal = performance.now() - 1000 / 60;
      input.beginFrame(DT);
      input.endFrame();
    }
  };
  const press = (i) => { padState.buttons[i] = { pressed: true, value: 1 }; padState.timestamp++; };
  const release = (i) => { padState.buttons[i] = { pressed: false, value: 0 }; padState.timestamp++; };
  const emits = () => emitted.filter((x) => x.e === 'inputDevice' && x.p === 'pad').length;
  return { engine, input, tick, press, release, emits, setPad: (p) => { padState = p; } };
}

/** The four states, each producing "Cross is down and a human put it there". */
const STATES = {
  'cold boot': (r) => { r.tick(10); r.press(0); r.tick(6); },
  'after a blur': (r) => { r.tick(10); win.fire('blur'); r.press(0); r.tick(6); },
  'held at frame 0': (r) => { r.press(0); r.tick(16); },
  'pad appears with it': (r) => {
    const saved = padState; r.setPad(null); r.tick(10); r.setPad(saved); r.press(0); r.tick(6);
  },
};

/* ====================================================================== */
test('padclaim K1: `padTouched` is true in every state a pad press can arrive in', () => {
  /* DOMAIN (§418.3)
   * passes on : a real Cross press through the shipped `Input`, in all four states — cold boot,
   *             after a blur, already held at frame 0, and the pad appearing on the same frame.
   * fails on  : three inputs run in-arm, each of which must read FALSE —
   *               (a) no pad connected at all;
   *               (b) a pad connected and at rest, nobody touching it;
   *               (c) §542's non-conformant pad, L2/R2 resting at +1 and nothing else touched.
   *             (c) is the one that matters: without it, "any non-zero byte on the device" would
   *             pass this arm and would claim `pad` at boot in an empty room.
   * does not discriminate: whether a sound comes out (no AudioContext in node — see the header),
   *             whether the press moves Sly (K3 records that separately), and rAF scheduling. */
  for (const [name, drive] of Object.entries(STATES)) {
    const r = rig();
    drive(r);
    assert.equal(r.input.padTouched, true, `padTouched was false in state "${name}"`);
  }

  /* The failing inputs, run in-arm. */
  const none = rig({ pad: false });
  none.tick(12);
  assert.equal(none.input.padTouched, false, 'padTouched was true with no pad connected');

  const idle = rig();
  idle.tick(12);
  assert.equal(idle.input.padTouched, false, 'padTouched was true with the pad at rest');

  const stuck = rig({ trigRest: 1 });
  stuck.tick(12);
  assert.equal(stuck.input.padTouched, false,
    'padTouched was true for a pad whose L2/R2 rest at +1 — §542 all over again, and this flag '
    + 'would claim the device at boot with nobody in the room');

  console.log('[padclaim K1] padTouched true in all 4 arrival states; false with no pad, with a '
    + 'resting pad, and with §542\'s +1 triggers');
});

/* ====================================================================== */
test('padclaim K2: the shipped Audio.update routes a touched pad to unlock()', () => {
  /* DOMAIN (§418.3)
   * passes on : the real `Audio` class, not ready and with no context, updated on a frame where
   *             `input.padTouched` is true and `lastDevice` is still 'kbm' — `unlock()` is called.
   * fails on  : the same real `Audio`, same not-ready branch, with the pad at rest — run in-arm.
   *             `unlock()` must NOT be called, so the arm cannot pass by unlocking every frame
   *             regardless of input, which is the failure mode that would make it vacuous.
   * does not discriminate: whether `unlock()` SUCCEEDS. Node has no AudioContext, so
   *             `available` is false and `unlock()` returns at its second line. This arm is about
   *             the wire, not the sound; `tools/padaudio.mjs` is about the sound. */
  const mk = () => {
    const r = rig();
    const audio = new Audio(r.engine);
    let unlocks = 0;
    const real = audio.unlock.bind(audio);
    audio.unlock = (...a) => { unlocks++; return real(...a); };
    return { r, audio, calls: () => unlocks };
  };

  /* Deliberately the BLUR state, not the cold-boot one. On a cold boot `lastDevice` does become
     'pad', so this arm would pass through the old path and prove nothing about the new one. */
  const hot = mk();
  hot.r.tick(10);
  win.fire('blur');
  hot.r.press(0);
  hot.r.tick(2);
  assert.equal(hot.r.input.lastDevice, 'kbm',
    'the premise of this arm is gone: lastDevice already says pad, so it would pass without the fix');
  assert.equal(hot.r.input.padTouched, true, 'padTouched false — K1 should have caught this first');
  hot.audio.update(DT, 0);
  assert.ok(hot.calls() >= 1, 'a touched pad did not reach unlock() through Audio.update');

  /* The failing input: same rig, same branch, nobody touching the pad. */
  const cold = mk();
  cold.r.tick(10);
  assert.equal(cold.r.input.padTouched, false, 'the control arm is not cold');
  cold.audio.update(DT, 0);
  assert.equal(cold.calls(), 0,
    'unlock() was called with nothing touched — this arm cannot tell a routed press from a '
    + 'frame that unlocks unconditionally');

  console.log(`[padclaim K2] touched pad -> ${hot.calls()} unlock() call(s) with lastDevice still `
    + `'kbm'; resting pad -> ${cold.calls()}`);
});

/* ====================================================================== */
test('padclaim K3: the three states where `lastDevice` alone is silent, reproduced', () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped `Input` — `inputDevice:'pad'` is emitted on a cold-boot press and NOT
   *             emitted in the other three states. That asymmetry is the defect §664 found, and
   *             pinning it is what stops the fix being quietly reverted into "lastDevice is fine".
   * fails on  : the cold-boot row, run in-arm — it must emit exactly once. If every row emitted
   *             zero, the rig would be broken rather than the code, and this arm would read as a
   *             discovery.
   * does not discriminate: audio (K2), and whether the press MOVES Sly — recorded below because
   *             the two came apart, which is what made the defect invisible: after a blur the
   *             button works perfectly and only the audio path is starved. */
  const seen = {};
  for (const [name, drive] of Object.entries(STATES)) {
    const r = rig();
    drive(r);
    seen[name] = { emits: r.emits(), down: r.input.down('jump'), touched: r.input.padTouched };
  }

  assert.equal(seen['cold boot'].emits, 1,
    'the cold-boot press did not emit inputDevice — the rig is broken, not the code');
  assert.equal(seen['after a blur'].emits, 0, 'the blur row no longer reproduces (see §664)');
  assert.equal(seen['held at frame 0'].emits, 0, 'the held-at-boot row no longer reproduces');
  assert.equal(seen['pad appears with it'].emits, 0, 'the pad-appears row no longer reproduces');

  /* The half that made it invisible: after a blur the BUTTON works. Only audio was starved. */
  assert.equal(seen['after a blur'].down, true,
    'after a blur the adopted hold should still read down() — that is §540 working');

  for (const [k, v] of Object.entries(seen)) {
    console.log(`[padclaim K3] ${k.padEnd(20)} inputDevice emits=${v.emits} down(jump)=${String(v.down).padEnd(5)} padTouched=${v.touched}`);
  }
});
