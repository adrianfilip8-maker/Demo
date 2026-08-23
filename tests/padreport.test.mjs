import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installDom } from './_hudshim.mjs';

/**
 * padreport — the controller's identity, the latch that hides in a trigger, and the one audio
 * state a pad reaches far more easily than a keyboard (§677).
 *
 * ── Why this file exists ─────────────────────────────────────────────────────────────────────
 *
 * The user reports the sound stopping **only when they use the controller**. That kills every
 * device-independent explanation at once — a space crossing, a distance cull, a leak, a limiter —
 * because all of those happen identically on a keyboard.
 *
 * It also exposes what six rounds of pad work here have rested on: **every pad measurement in this
 * repository drives a synthetic gamepad that this lane wrote, in the layout this lane assumed.**
 * `PAD_BINDINGS` indexes buttons 0-15 and `PAD_AXES` indexes axes 0-3 by position, and both are
 * only correct under the W3C **standard mapping**. Nothing has ever checked that the player's pad
 * reports one. That is the session's dominant defect — a table that is true by accident of what
 * you tested with — sitting in the input layer.
 *
 * ── The asymmetry that makes a pad different, and it is not subtle ───────────────────────────
 *
 * `focus` is `PAD_BINDINGS.focus = [7]` — **R2** — and `MOUSE_BINDINGS.focus = 2` — the **right
 * mouse button**. There is no keyboard key for it at all. Holding it engages Thief-o-Vision, which
 * `Audio._onThiefVision` answers by ducking the music to `TUNE.thiefMusic` (0.34) and low-passing
 * it to `TUNE.thiefFilter` (620 Hz). A controller player resting a finger on R2 — which most
 * controller games train you to do — gets most of the music taken away in a way a keyboard player
 * cannot reproduce by accident.
 *
 * And `_padButtons`' hysteresis means a trigger that does not spring all the way back **latches it
 * on**: the release threshold is `triggerOff` 0.35, so a trigger resting anywhere above that stays
 * held. §542 wrote that case down — *"a rest of 0.5 … is above `triggerOff`, so the FIRST real
 * press latches the action on for the rest of the session"* — and the trust gate does not close it,
 * because trust is granted the moment the control is seen at rest ONCE, before it wears.
 *
 * ── What this file does NOT establish ────────────────────────────────────────────────────────
 *
 * That this is the user's fault. It is a mechanism that fits the report and is reachable on a pad
 * and not on a keyboard; whether it is what is happening to them is answered by the `input.held`
 * field of `selfTest()` on their machine, which is the one instrument this container does not have.
 */

/* ====================================================================== */
const { doc, win } = installDom();
function listenable(o) {
  const h = new Map();
  const add = o.addEventListener;
  o.addEventListener = (t, fn) => { add?.call?.(o, t, fn); if (!h.has(t)) h.set(t, new Set()); h.get(t).add(fn); };
  o.removeEventListener = (t, fn) => h.get(t)?.delete(fn);
  o.fire = (t, ev = {}) => { const e = { preventDefault() {}, ...ev }; for (const fn of [...(h.get(t) || [])]) fn(e); };
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
const { Audio, TUNE } = await import('../src/audio/Audio.js');

const DT = 1 / 60;
const freshPad = (mapping = 'standard') => ({
  id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  index: 0, connected: true, mapping, timestamp: 1,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
});

function rig({ mapping = 'standard' } = {}) {
  const bus = new Map();
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 4000);
  camera.position.set(0, 2, 0); camera.updateMatrixWorld(true);
  const engine = {
    canvas, camera, scene: new THREE.Scene(), width: 1280, height: 720, dt: DT, time: 0,
    timeScale: 1, quality: 'high', warnings: [], debug: {}, paused: false,
    warn() {}, has: () => false, get: () => null,
    on(e, f) { if (!bus.has(e)) bus.set(e, new Set()); bus.get(e).add(f); return () => {}; },
    emit(e, p) { for (const f of bus.get(e) || []) f(p); }, registerCollider() {},
  };
  padState = freshPad(mapping);
  const input = new Input(engine);
  engine.input = input;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { input._lastReal = performance.now() - 1000 / 60; input.beginFrame(DT); input.endFrame(); } };
  return { engine, input, tick };
}

/* ====================================================================== */
test('padreport P1: report() names the pad and flags a mapping we have no right to trust', () => {
  /* DOMAIN (§418.3)
   * passes on : a pad reporting `mapping: 'standard'` — `mappingTrusted` true, with the id, the
   *             axis and button counts and the live axes carried through.
   * fails on  : the SAME pad reporting `mapping: ''`, run in-arm, which must come back
   *             `mappingTrusted: false`. Without it a field hard-coded to true would pass, and
   *             that is exactly the shape of the defect this arm exists to catch.
   * does not discriminate: whether the indices are ACTUALLY wrong under a non-standard mapping —
   *             that needs the real device. This reports the claim, it does not re-derive it. */
  const ok = rig({ mapping: 'standard' });
  ok.tick(2);
  const r = ok.input.report();
  assert.equal(r.pads.length, 1, 'the pad was not reported at all');
  assert.equal(r.pads[0].mappingTrusted, true);
  assert.match(r.pads[0].id, /Wireless Controller/);
  assert.equal(r.pads[0].buttonCount, 17);
  assert.equal(r.pads[0].axisCount, 4);

  const bad = rig({ mapping: '' });
  bad.tick(2);
  const rb = bad.input.report();
  assert.equal(rb.pads[0].mappingTrusted, false,
    'a pad reporting a non-standard mapping was still trusted — the guard cannot fire');

  console.log(`[padreport P1] standard -> trusted; mapping "" -> NOT trusted (${rb.pads[0].buttonCount} buttons, ${rb.pads[0].axisCount} axes)`);
});

/* ====================================================================== */
test('padreport P2: a trigger that does not spring back latches `focus` on', () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped `_padButtons` hysteresis — R2 pulled to 1.0 puts `focus` in `held`,
   *             and letting it back only to 0.45 (above `triggerOff` 0.35) leaves it there.
   * fails on  : R2 returned fully to 0.0, run in-arm, which must clear it. Without that arm a
   *             `held` list that never cleared would pass and the latch would be indistinguishable
   *             from a stuck report.
   * does not discriminate: whether any real trigger rests at 0.45 — that is hardware, and
   *             `selfTest().input.pads[].active` is where the user's own value shows up. */
  const { input, tick } = rig();
  tick(2);
  assert.equal(input.report().held.includes('focus'), false, 'focus was held before anything was pressed');

  padState.buttons[7] = { pressed: true, value: 1 };
  tick(1);
  assert.ok(input.report().held.includes('focus'), 'a full R2 pull did not register as focus');

  padState.buttons[7] = { pressed: false, value: 0.45 };
  tick(1);
  assert.ok(input.report().held.includes('focus'),
    'R2 resting at 0.45 released focus — then the hysteresis latch §542 described is gone and this '
    + 'arm is not measuring it');

  /* The failing input, run in-arm. */
  padState.buttons[7] = { pressed: false, value: 0 };
  tick(1);
  assert.equal(input.report().held.includes('focus'), false,
    'focus stayed held with the trigger fully at rest — `held` never clears, so it says nothing');

  console.log(`[padreport P2] R2 1.00 -> focus held; 0.45 -> STILL held (triggerOff ${input.settings.triggerOff}); 0.00 -> released`);
});

/* ====================================================================== */
test('padreport P3: selfTest names Thief-o-Vision when the game thinks focus is held', async () => {
  /* DOMAIN (§418.3)
   * passes on : `selfTest()` with `focus` held reporting a hint that names Thief-o-Vision, WITHOUT
   *             an AnalyserNode — the named causes are decided before the measurement precisely so
   *             they survive a context that cannot tap.
   * fails on  : the same call with nothing held, run in-arm, whose hint must NOT name it. Without
   *             that, a hint hard-coded to the most dramatic cause would pass.
   * does not discriminate: whether the music is actually quieter — the offline renderer reports
   *             `.value` without pending automation (measured, and the reason no gain figure is
   *             asserted here), so the level claim belongs to a browser. */
  const { engine, input, tick } = rig();
  const audio = new Audio(engine);
  await audio.init();
  /* A context that exists but cannot tap: exactly the path the named causes must survive. */
  audio.ctx = { state: 'running', currentTime: 0, createAnalyser: null, destination: {} };
  audio.masterGain = { gain: { value: 0.7 }, connect() {}, disconnect() {} };
  audio.ready = true;

  /* Poll at REST first. §542's trust gate withholds a control it has never seen released, so a
     trigger already down on the very first poll is correctly ignored — pressing before this would
     make the premise fail for the right reason and look like the wrong one. */
  tick(2);
  padState.buttons[7] = { pressed: true, value: 1 };
  tick(2);
  assert.ok(input.report().held.includes('focus'), 'the premise failed: focus is not held');
  const hot = await audio.selfTest({ seconds: 0.05 });
  assert.match(hot.hint, /THIEF-O-VISION/,
    `focus was held and the hint did not name it: "${hot.hint}"`);
  assert.ok(hot.input && hot.input.held.includes('focus'), 'selfTest did not carry the input report');

  /* The failing input, run in-arm. */
  padState.buttons[7] = { pressed: false, value: 0 };
  tick(2);
  const cold = await audio.selfTest({ seconds: 0.05 });
  assert.doesNotMatch(cold.hint, /THIEF-O-VISION/,
    `nothing was held and the hint still named Thief-o-Vision: "${cold.hint}"`);

  console.log(`[padreport P3] focus held -> "${hot.hint.slice(0, 58)}…"; released -> "${cold.hint.slice(0, 58)}…"`);
  console.log(`[padreport P3] TUNE.thiefMusic ${TUNE.thiefMusic}, TUNE.thiefFilter ${TUNE.thiefFilter} Hz`);
});
