import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installDom, fakeEngine } from './_hudshim.mjs';

/**
 * padrest — the right stick, the deadzone/drift region, and the prompt swap (§541).
 *
 * `padparity.test.mjs` (§540) covered thirteen verbs, the d-pad and the left stick's upper range.
 * Three things a player meets in the first ten seconds with a real pad were not in that sample,
 * and each is invisible to a parity table by construction:
 *
 *   1. **camera look is not a moveset verb**, so a right stick that did nothing at all would have
 *      shown up as a clean pass on every row of §540;
 *   2. **§540's sweep started at 0.20**, above the deadzone — the region a worn stick actually
 *      lives in was never sampled;
 *   3. **the prompt swap is a HUD claim**, not an input one, and nothing had driven the two
 *      together.
 *
 * ── The instrument, and the one thing it has to get right ───────────────────────────────────
 *
 * `_padLook` integrates on `dtReal`, which `beginFrame` computes from `performance.now()`. A
 * tight test loop therefore reads a dtReal of nearly zero and would report "the right stick does
 * nothing" — a false negative produced entirely by the harness. So `PIN` back-dates `_lastReal`
 * to force a 1/60 s frame, and arm R1b re-runs the same deflection with **real `setTimeout`
 * sleeps and no pin at all**, off a different clock, to check the pinned answer against one the
 * pin cannot have manufactured (§439: an instrument built from the same assumption as the thing
 * it measures cannot falsify it).
 *
 * ── Ownership ───────────────────────────────────────────────────────────────────────────────
 *
 * `src/player/CameraRig.js` belongs to another lane and is read-only here. So the arms below
 * assert PRECISE numbers on `input.look` — which `src/core/Input.js` owns — and only a loose
 * sign-and-magnitude claim through the rig, which a camera retune must be free to change without
 * reddening an input test.
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

const { doc, win } = installDom();

/** Give a shim object real listener bookkeeping plus a `fire`, so Input's `_bind` works on it. */
function listenable(o) {
  const h = new Map();
  o.addEventListener = (t, fn) => { if (!h.has(t)) h.set(t, new Set()); h.get(t).add(fn); };
  o.removeEventListener = (t, fn) => h.get(t)?.delete(fn);
  o.fire = (t, ev = {}) => { const e = { preventDefault() {}, ...ev }; for (const fn of h.get(t) || []) fn(e); };
  return o;
}
listenable(doc);
doc.pointerLockElement = null;
/* HUD also registers a `keydown` on window, so keep the shim's own registration working and add
   ours beside it rather than replacing it. */
const winL = listenable({});
const winAdd = win.addEventListener;
win.addEventListener = (t, fn) => { winAdd(t, fn); winL.addEventListener(t, fn); };
win.removeEventListener = (t, fn) => winL.removeEventListener(t, fn);
win.fire = winL.fire;
const canvas = listenable({ width: 640, height: 360, style: {} });
globalThis.self = globalThis;

let padState = null;
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (padState ? [padState, null, null, null] : [null, null, null, null]) },
  configurable: true, writable: true,
});

const { Input, INPUT_TUNE, PAD_AXES } = await import('../src/core/Input.js');
const { Controller, TUNE } = await import('../src/player/Controller.js');
const { CameraRig } = await import('../src/player/CameraRig.js');
const { HUD } = await import('../src/ui/HUD.js');
const M = await import('./_moveset.mjs');

const DT = 1 / 60;
const freshPad = () => ({
  id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  index: 0, connected: true, mapping: 'standard',
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
});
const axes = (a) => { padState.axes = [a[0] || 0, a[1] || 0, a[2] || 0, a[3] || 0]; };
/** Force dtReal to exactly one 60 Hz frame — see the header, and R1b, which checks it. */
const PIN = (i) => { i._lastReal = performance.now() - 1000 / 60; };

function bareEngine() {
  const bus = new Map();
  return {
    canvas, camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000), scene: new THREE.Scene(),
    width: 1280, height: 720, dt: DT, time: 0, timeScale: 1, quality: 'high', warnings: [], events: [],
    debug: { freeCam: false, showColliders: false, paused: false },
    warn(m) { this.warnings.push(m); }, has: () => false, get: () => null,
    on(e, f) { if (!bus.has(e)) bus.set(e, new Set()); bus.get(e).add(f); return () => bus.get(e).delete(f); },
    emit(e, p) { this.events.push({ e, p }); for (const f of bus.get(e) || []) f(p); },
    registerCollider() {},
  };
}
function newInput(engine) {
  padState = freshPad();
  for (const t of [win, doc, canvas]) { /* fresh listener sets per Input */ }
  const input = new Input(engine);
  engine.input = input;
  return input;
}

/** Real Input + real CameraRig over a stationary stub player. */
async function camRig() {
  const engine = bareEngine();
  const input = newInput(engine);
  const mv = {
    position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(),
    grounded: true, stateName: 'idle', yaw: Math.PI,
  };
  engine.get = (m) => (m === 'movement' ? mv : null);
  const rig = new CameraRig(engine);
  await rig.init();
  for (let i = 0; i < 90; i++) { PIN(input); input.beginFrame(DT); rig.update(DT, i * DT); input.endFrame(); }
  return { engine, input, rig };
}

/** Real Input + real Controller over the stub world, standing still on flat ground. */
async function sim() {
  const engine = M.stubEngine();
  engine.canvas = canvas;
  const input = newInput(engine);
  const c = new Controller(engine);
  await c.init();
  c.col = M.stubCollision({});
  c._colReal = c.col; c._calibrated = true; c._bindCollision = () => {};
  c.teleport(new THREE.Vector3(0, 0, 0), Math.PI);
  c._needSpawnSnap = false;
  c.position.set(0, 0, 0); c.velocity.set(0, 0, 0); c.grounded = true;
  return { engine, c, input };
}

/** Real Input + real HUD. */
async function hudRig() {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 500);
  camera.position.set(0, 2, 0); camera.lookAt(0, 2, -20); camera.updateMatrixWorld(true);
  const engine = fakeEngine(camera);
  engine.canvas = canvas;
  const emits = [];
  const origEmit = engine.emit.bind(engine);
  engine.emit = (e, p) => { if (e === 'inputDevice') emits.push(p); return origEmit(e, p); };
  const input = newInput(engine);
  const hud = new HUD(engine);
  await hud.init();
  hud.el.pause.classList.add('on');       // the controls cel open, so its columns are readable
  hud.prompt('Grab', 'E');
  return { hud, engine, input, emits };
}
const promptIsPad = (hud) => hud.el.promptKey.innerHTML.includes('assets/prompts/');

/* ====================================================================== */
/* R1 — the right stick reaches the camera, on a curve, like the mouse     */
/* ====================================================================== */

test('R1 right stick: it drives the camera, on a t^exp curve, in the mouse\'s own direction', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a swept right stick read as radians accumulated into `input.look` — matching
   *               `padLook * ((d - padLookDead)/(1 - padLookDead))^padLookExp` across nine
   *               deflections — and the same deflection turning the real CameraRig's yaw in the
   *               same DIRECTION a rightward mouse move turns it.
   *   fails  on : RUN in-arm — a deflection inside `padLookDead`, which must accumulate exactly
   *               zero and leave the rig's yaw untouched. Without that clause an implementation
   *               that turned the camera at a constant rate for any input would pass the model
   *               comparison at one point and this arm would not know.
   *   verdict   : passes on a live deflection, fails on one inside the deadzone; and it
   *               discriminates the CURVE, not merely that something moved, because the model is
   *               compared at nine points rather than one.
   *   does NOT  : discriminate feel, a physical DS4's axis signs, or anything the CameraRig does
   *   discrim.    downstream of `look` — that file belongs to another lane and only the direction
   *               of its response is asserted here.
   */
  const { input } = await camRig();
  const dz = INPUT_TUNE.padLookDead, k = INPUT_TUNE.padLook, e = INPUT_TUNE.padLookExp;
  const rows = [];
  for (const d of [0.05, 0.10, 0.20, 0.30, 0.50, 0.70, 0.80, 0.90, 1.00]) {
    axes([0, 0, d, 0]);
    PIN(input); input.beginFrame(DT);
    const got = Math.abs(input.look.x);
    input.endFrame();
    const t = Math.max(0, (d - dz) / (1 - dz));
    const want = Math.pow(t, e) * k * input.dtReal;
    rows.push({ d, got, want });
    assert.ok(Math.abs(got - want) < 1e-6,
      `deflection ${d}: look.x accumulated ${got.toExponential(4)} rad, the `
      + `t^${e} model says ${want.toExponential(4)} — the response curve is not the documented one`);
  }
  /* RUN counterexample: inside the deadzone, nothing at all. */
  axes([0, 0, dz * 0.9, 0]);
  PIN(input); input.beginFrame(DT);
  const dead = Math.abs(input.look.x);
  input.endFrame();
  assert.equal(dead, 0,
    `a deflection inside padLookDead accumulated ${dead} rad — the arm cannot tell a curve from a `
    + 'constant, because everything moves the camera (§418)');

  /* the rig, loosely: full stick and a rightward mouse must turn the same way */
  const { input: i2, rig } = await camRig();
  const y0 = rig.yaw;
  axes([0, 0, 1, 0]);
  for (let i = 0; i < 60; i++) { PIN(i2); i2.beginFrame(DT); rig.update(DT, i * DT); i2.endFrame(); }
  const stickTurn = rig.yaw - y0;
  axes([0, 0, 0, 0]);

  const { input: i3, rig: r3 } = await camRig();
  doc.pointerLockElement = canvas; doc.fire('pointerlockchange');
  for (let i = 0; i < 4; i++) { PIN(i3); i3.beginFrame(DT); r3.update(DT, i * DT); i3.endFrame(); }
  const my0 = r3.yaw;
  for (let i = 0; i < 60; i++) {
    PIN(i3); i3.beginFrame(DT);
    win.fire('mousemove', { movementX: 10, movementY: 0 });
    r3.update(DT, i * DT); i3.endFrame();
  }
  const mouseTurn = r3.yaw - my0;
  doc.pointerLockElement = null; doc.fire('pointerlockchange');

  assert.ok(Math.abs(stickTurn) > 0.5,
    `a full right stick turned the camera ${stickTurn.toFixed(4)} rad in a second — the stick is `
    + 'not reaching the rig');
  assert.ok(Math.sign(stickTurn) === Math.sign(mouseTurn),
    `stick right turns ${stickTurn.toFixed(3)} rad and mouse right turns ${mouseTurn.toFixed(3)} — `
    + 'the two devices disagree about which way "right" is');

  console.log(`\n[R1] right stick -> look, rad accumulated in one 1/60 s frame:\n`
    + rows.map((r) => `  deflect ${r.d.toFixed(2)}  ${r.got.toExponential(4)}  `
      + `(${(r.got / DT * 180 / Math.PI).toFixed(2)} deg/s)`).join('\n')
    + `\n  full deflection: ${(Math.abs(stickTurn) * 180 / Math.PI).toFixed(1)} deg of rig yaw in 1.00 s`
    + ` · 600 px of mouse in the same second: ${(Math.abs(mouseTurn) * 180 / Math.PI).toFixed(1)} deg`
    + ` · same sign`);
});

test('R1b instrument: the pinned clock agrees with one built from real sleeps', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a full right stick held for 30 frames paced by real `setTimeout`, with NO pin,
   *               giving the same deg/s as R1's pinned reading to within 2%.
   *   fails  on : RUN in-arm — the same 30 frames with neither a pin nor a sleep, which reads a
   *               near-zero rate. That is the harness fault this arm exists to detect, and
   *               running it is what shows the agreement above is not automatic.
   *   verdict   : passes on either honest clock, fails on the tight loop. It discriminates the
   *               INSTRUMENT, not the code — which is the point (§439).
   */
  const { input, rig } = await camRig();
  const y0 = rig.yaw;
  axes([0, 0, 1, 0]);
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 16));
    input.beginFrame(DT); rig.update(DT, i * DT); input.endFrame();
  }
  const wall = (performance.now() - t0) / 1000;
  const slept = Math.abs(rig.yaw - y0) / wall * 180 / Math.PI;
  const expect = INPUT_TUNE.padLook * 180 / Math.PI;
  assert.ok(Math.abs(slept - expect) / expect < 0.02,
    `real-clock run measured ${slept.toFixed(2)} deg/s against padLook's ${expect.toFixed(2)} — the `
    + 'pinned readings elsewhere in this file are measuring the pin, not the stick');

  /* RUN the fault: no pin, no sleep. */
  const { input: i2, rig: r2 } = await camRig();
  const yy = r2.yaw;
  axes([0, 0, 1, 0]);
  const tt = performance.now();
  for (let i = 0; i < 30; i++) { i2.beginFrame(DT); r2.update(DT, i * DT); i2.endFrame(); }
  const tight = Math.abs(r2.yaw - yy);
  const tightWall = (performance.now() - tt) / 1000;
  assert.ok(tight * 180 / Math.PI < expect * tightWall * 1.05 + 1e-9,
    'a tight loop produced MORE rotation than its own wall clock allows — dtReal is not being read');
  console.log(`\n[R1b] real sleeps: ${slept.toFixed(2)} deg/s vs padLook ${expect.toFixed(2)} deg/s`
    + ` · tight loop (the fault): ${(tight * 180 / Math.PI).toFixed(4)} deg over ${tightWall.toFixed(4)} s`);
});

/* ====================================================================== */
/* R2 — both deadzones are RADIAL, so there is no diagonal bias            */
/* ====================================================================== */

test('R2 deadzones: radial on both sticks, so the cardinals get no head start', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a (d,d) diagonal whose RADIAL length clears the deadzone while neither axis
   *               alone does — 0.13/0.13 on the left stick (len 0.1838 > 0.18, max 0.13 < 0.18)
   *               and 0.10/0.10 on the right (len 0.1414 > 0.14, max 0.10 < 0.14). A per-axis
   *               deadzone leaves both of those dead; a radial one passes them, which is the
   *               whole discrimination.
   *   fails  on : RUN in-arm — 0.12/0.12 and 0.09/0.09, just inside the same radii, which must
   *               stay dead. Without them "it moved" would be satisfied by a gate that had been
   *               deleted altogether.
   *   verdict   : passes on a diagonal only a radial gate admits, fails on one no gate admits.
   *               DOES NOT discriminate a real stick's own gate shape — a square-gated pad can
   *               report 1.0 per axis, and the radial normalise downstream is what handles that
   *               (`input.test.mjs` arm 6 owns it).
   */
  const dz = INPUT_TUNE.deadzone, ldz = INPUT_TUNE.padLookDead;
  const { input } = await sim();

  const leftAt = (d) => { axes([d, -d, 0, 0]); PIN(input); input.beginFrame(DT); const m = Math.hypot(input.move.x, input.move.y); input.endFrame(); return m; };
  const live = leftAt(0.13), notYet = leftAt(0.12);
  assert.ok(Math.hypot(0.13, 0.13) > dz && 0.13 < dz, 'the test point no longer discriminates — re-derive it from the tune');
  assert.ok(live > 0,
    `(0.13, 0.13) — radial length ${Math.hypot(0.13, 0.13).toFixed(4)}, both axes under the ${dz} `
    + 'deadzone — read as centred. The left-stick deadzone has become per-axis, which is a square '
    + 'dead region on a round stick: diagonals need 41% more deflection than cardinals and the '
    + 'player feels the character preferring the compass points.');
  assert.equal(notYet, 0,
    `(0.12, 0.12) — radial length ${Math.hypot(0.12, 0.12).toFixed(4)}, inside the deadzone — was `
    + 'live. This arm cannot tell a radial gate from no gate at all (§418).');

  const { input: i2, rig } = await camRig();
  const rightAt = async (d) => {
    const y0 = rig.yaw, p0 = rig.pitch;
    axes([0, 0, d, d]);
    for (let i = 0; i < 30; i++) { PIN(i2); i2.beginFrame(DT); rig.update(DT, i * DT); i2.endFrame(); }
    axes([0, 0, 0, 0]);
    return Math.abs(rig.yaw - y0) + Math.abs(rig.pitch - p0);
  };
  const rLive = await rightAt(0.10), rDead = await rightAt(0.09);
  assert.ok(Math.hypot(0.10, 0.10) > ldz && 0.10 < ldz, 'the right-stick test point no longer discriminates');
  assert.ok(rLive > 1e-9,
    `(0.10, 0.10) — radial length ${Math.hypot(0.10, 0.10).toFixed(4)} past padLookDead ${ldz} — moved `
    + 'the camera not at all: the look deadzone has become per-axis');
  assert.equal(rDead, 0,
    `(0.09, 0.09) — radial length ${Math.hypot(0.09, 0.09).toFixed(4)}, inside padLookDead — moved the camera`);

  console.log(`\n[R2] left  deadzone ${dz}: (0.12,0.12) len ${Math.hypot(0.12, 0.12).toFixed(4)} dead · `
    + `(0.13,0.13) len ${Math.hypot(0.13, 0.13).toFixed(4)} LIVE (per-axis would need 0.18 on an axis)\n`
    + `     right deadzone ${ldz}: (0.09,0.09) len ${Math.hypot(0.09, 0.09).toFixed(4)} dead · `
    + `(0.10,0.10) len ${Math.hypot(0.10, 0.10).toFixed(4)} LIVE — both radial, no diagonal bias`);
});

/* ====================================================================== */
/* R3 — drift: what a worn stick does when nobody is touching it           */
/* ====================================================================== */

test('R3 drift: a resting stick never claims the prompts, and the walk threshold is the tune\'s', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a stick posed off-centre from the first poll and left there — the position a
   *               worn pad sits at on the table. `lastDevice` stays 'kbm' and no `inputDevice`
   *               is emitted, at every offset from 0.05 to 0.30, including offsets well past the
   *               deadzone where Sly does walk.
   *   fails  on : RUN in-arm — the PRE-FIX rule, executed: claim the device whenever the stick
   *               is past the deadzone, which is what `_padStick` used to do. At a 0.19 rest that
   *               must produce the emit storm the fix removed, so this arm is shown to be able to
   *               see the defect rather than assumed to be.
   *   verdict   : passes on the travel rule, fails on the position rule. Separately it PINS the
   *               walk threshold — motion begins at radial `deadzone` and the first live step is
   *               `moveFloor * runSpeed` — as a MEASUREMENT, not a repair: a worn stick resting
   *               past 0.18 does walk Sly, and that is the documented cost of the floor.
   *   does NOT  : discriminate what a real worn DS4 rests at. The offsets here are chosen, not
   *   discrim.    sampled from hardware; only the user's own controller can say where it sits.
   */
  const rows = [];
  for (const rest of [0.05, 0.10, 0.15, 0.17, 0.19, 0.22, 0.25, 0.30]) {
    const { c, input } = await sim();
    axes([0, -rest, rest, 0]);                       // both sticks worn, never touched
    const p0 = c.position.clone();
    const emits = [];
    const eng = c.engine;
    const orig = eng.emit.bind(eng);
    eng.emit = (e, p) => { if (e === 'inputDevice') emits.push(p); return orig(e, p); };
    for (let i = 0; i < 300; i++) { PIN(input); input.beginFrame(DT); c.update(DT, 0); input.endFrame(); }
    rows.push({ rest, walked: c.position.distanceTo(p0), sp: c.speedXZ(), dev: input.lastDevice, emits: emits.length });
    assert.equal(input.lastDevice, 'kbm',
      `a stick resting at ${rest} — never touched — claimed the device flag. A worn pad on the `
      + 'table would pin a keyboard player to PS4 glyphs for the whole session.');
    assert.equal(emits.length, 0,
      `a resting stick at ${rest} emitted ${emits.length} inputDevice events over 5 s; each one `
      + 're-renders the live prompt and all twelve columns of the controls cel');
  }

  /* the walk threshold, pinned as a measurement */
  const gate = rows.find((r) => r.sp > 0);
  assert.ok(gate && gate.rest > INPUT_TUNE.deadzone,
    'Sly walked at a rest offset inside the deadzone — the gate has moved');
  const quiet = rows.filter((r) => r.rest < INPUT_TUNE.deadzone);
  assert.ok(quiet.every((r) => r.sp === 0),
    `a rest offset inside the ${INPUT_TUNE.deadzone} deadzone produced motion`);
  assert.ok(Math.abs(gate.sp - INPUT_TUNE.moveFloor * TUNE.runSpeed) < 0.15,
    `the first live rest offset settled at ${gate.sp.toFixed(3)} m/s; the floor says `
    + `${(INPUT_TUNE.moveFloor * TUNE.runSpeed).toFixed(3)}`);

  /* RUN the pre-fix rule, so the arm is shown to discriminate. */
  {
    const { input } = await sim();
    const emits = [];
    const eng = input.engine;
    const orig = eng.emit.bind(eng);
    eng.emit = (e, p) => { if (e === 'inputDevice') emits.push(p); return orig(e, p); };
    axes([0, -0.19, 0, 0]);
    for (let n = 0; n < 5; n++) {
      win.fire('keydown', { code: 'KeyF' });
      PIN(input); input.beginFrame(DT);
      // the old `_padStick` line, executed: claim from POSITION, every frame the stick is live
      if (Math.hypot(input.move.x, input.move.y) > 0) input._setDevice('pad');
      input.endFrame();
      win.fire('keyup', { code: 'KeyF' });
      PIN(input); input.beginFrame(DT);
      if (Math.hypot(input.move.x, input.move.y) > 0) input._setDevice('pad');
      input.endFrame();
    }
    assert.ok(emits.length >= 8,
      `the pre-fix rule produced only ${emits.length} emits — this arm is not reproducing the `
      + 'defect it claims to guard against (§418)');
    assert.equal(input.lastDevice, 'pad',
      'the pre-fix rule did not end on `pad`, so the "keyboard player reads PS4 glyphs" symptom '
      + 'is not what is being reproduced');
    console.log(`\n[R3] ablation — pre-fix POSITION rule at 0.19 rest: ${emits.length} inputDevice emits `
      + `for 5 keystrokes, ending on '${input.lastDevice}'`);
  }

  console.log('[R3] a worn stick left alone:\n' + rows.map((r) =>
    `  rest ${r.rest.toFixed(2)}  walked ${r.walked.toFixed(2)} m in 5 s (${r.sp.toFixed(3)} m/s)`
    + `  device '${r.dev}'  emits ${r.emits}`).join('\n')
    + `\n  motion begins past the ${INPUT_TUNE.deadzone} radial deadzone and starts at `
    + `${(INPUT_TUNE.moveFloor * TUNE.runSpeed).toFixed(2)} m/s — the floor's cost, measured not repaired`);
});

/* ====================================================================== */
/* R4 — the prompt swap, driven on the real HUD                            */
/* ====================================================================== */

test('R4 prompts: shapes for the pad, keycaps for the keyboard, and travel is what decides', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the real `HUD` re-rendering to PS4 glyphs on a pad press and back to keycaps on
   *               a real keydown, over an eight-step interleave, with exactly one `inputDevice`
   *               emit per genuine change; and BOTH sticks claiming the device once actually
   *               pushed — including the right stick, which never claimed before §541.
   *   fails  on : RUN in-arm — a pad that is merely CONNECTED with a stick off centre, which must
   *               change nothing at all: no emit, no glyph. That is the counterexample that
   *               separates "the swap follows the player" from "the swap follows the hardware".
   *   verdict   : passes on an act, fails on a presence. There is deliberately NO time-based
   *               hysteresis — a player alternating devices gets the prompts for the device they
   *               last ACTED on, one re-render per alternation — and R3 is where the case that
   *               used to need hysteresis (a drifting stick) is held down instead.
   *   does NOT  : discriminate pixels. The shim renders no image, so "the glyph is legible" is
   *   discrim.    eyes-only (`hud.test.mjs` says the same of `padBtn`).
   */
  /* the swap itself */
  {
    const { hud, input, emits } = await hudRig();
    assert.equal(promptIsPad(hud), false, 'a fresh boot must show keycaps');
    padState.buttons[1] = { pressed: true, value: 1 };
    PIN(input); input.beginFrame(DT); input.endFrame();
    assert.equal(input.lastDevice, 'pad', 'a Circle press did not claim the device');
    assert.ok(promptIsPad(hud), 'the on-screen prompt did not become a PS4 shape after a pad press');
    padState.buttons[1] = { pressed: false, value: 0 };
    PIN(input); input.beginFrame(DT); input.endFrame();
    win.fire('keydown', { code: 'KeyE' });
    PIN(input); input.beginFrame(DT); input.endFrame();
    win.fire('keyup', { code: 'KeyE' });
    assert.equal(promptIsPad(hud), false, 'a real key did not bring the keycap back');
    assert.deepEqual(emits, ['pad', 'kbm'], `inputDevice emits ${JSON.stringify(emits)} — expected one per change`);
  }

  /* which acts claim: every one of them, sticks included, once actually pushed */
  const claimed = {};
  for (const [name, pose] of [
    ['Circle', (p) => { p.buttons[1] = { pressed: true, value: 1 }; }],
    ['d-pad', (p) => { p.buttons[12] = { pressed: true, value: 1 }; }],
    ['left stick', (p) => { p.axes = [0, -1, 0, 0]; }],
    ['right stick', (p) => { p.axes = [0, 0, 1, 0]; }],
  ]) {
    const { input } = await hudRig();
    for (let i = 0; i < 5; i++) { PIN(input); input.beginFrame(DT); input.endFrame(); }   // at rest
    pose(padState);                                                                        // now act
    for (let i = 0; i < 5; i++) { PIN(input); input.beginFrame(DT); input.endFrame(); }
    claimed[name] = input.lastDevice;
    assert.equal(input.lastDevice, 'pad',
      `pushing the ${name} left the device flag on '${input.lastDevice}'. A player who picks the `
      + 'pad up and looks around reads keycaps for a control they are actively using.');
  }

  /* RUN the counterexample: presence, not action. */
  {
    const { hud, input, emits } = await hudRig();
    padState.axes = [0, -0.30, 0, 0];                 // connected, worn, untouched
    for (let i = 0; i < 60; i++) { PIN(input); input.beginFrame(DT); input.endFrame(); }
    assert.equal(input.lastDevice, 'kbm',
      'a pad that is merely present, with an off-centre stick, claimed the prompts');
    assert.deepEqual(emits, [],
      `a present-but-untouched pad emitted ${JSON.stringify(emits)} — the swap is following the `
      + 'hardware rather than the player, and this arm would pass on any always-claim rule (§418)');
    assert.equal(promptIsPad(hud), false, 'the HUD swapped to shapes for a pad nobody touched');
  }

  /* the interleave, and its emit count */
  {
    const { hud, input, emits } = await hudRig();
    const seq = [];
    const tick = (label) => {
      PIN(input); input.beginFrame(DT); input.endFrame();
      seq.push(`${label} -> ${promptIsPad(hud) ? 'SHAPES' : 'keycaps'}`);
    };
    padState.buttons[0] = { pressed: true, value: 1 }; tick('pad Cross');
    padState.buttons[0] = { pressed: false, value: 0 }; tick('release');
    win.fire('keydown', { code: 'Space' }); tick('key Space');
    win.fire('keyup', { code: 'Space' }); tick('release');
    padState.buttons[0] = { pressed: true, value: 1 }; tick('pad Cross');
    padState.buttons[0] = { pressed: false, value: 0 }; tick('release');
    win.fire('keydown', { code: 'KeyF' }); tick('key F');
    win.fire('keyup', { code: 'KeyF' }); tick('release');
    assert.deepEqual(emits, ['pad', 'kbm', 'pad', 'kbm'],
      `four alternations produced ${JSON.stringify(emits)} — one re-render per change is the `
      + 'contract; more than that is the flicker a drifting stick used to cause');
    console.log(`\n[R4] claims: ${JSON.stringify(claimed)}`
      + `\n     interleave: ${seq.join(' · ')}`
      + `\n     ${emits.length} emits for 4 alternations · a present-but-untouched pad: 0`);
  }
});
