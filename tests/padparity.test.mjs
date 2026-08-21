import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

/**
 * padparity — is the PS4 pad actually at parity with the keyboard, verb for verb? (§540)
 *
 * ── Why this file exists, and why it is not `input.test.mjs` ────────────────────────────────
 *
 * `tests/input.test.mjs` arm 6 asserts the §516 mapping: standard button 0 presses the action
 * named `jump`, button 2 presses `attack`, and so on. That is a test of `Input.js` against
 * `Input.js` — it reads the same `PAD_BINDINGS` table the code reads, so it can only ever
 * confirm that a name reaches a name. It cannot see the one failure that actually matters, and
 * it is the failure this project has already shipped twice: **an action that is bound at one end
 * and consumed at neither** (§357.1), which is exactly how the pointer-lock click swallow left
 * `attack` bound, pressed, and unable to swing a cane (§514).
 *
 * So the subject here is not the mapping. It is the COUPLING: a real `Input`, driven through the
 * real DOM event path and the real `navigator.getGamepads` poll, into a real `Controller` with
 * the real `buildMoveset()` — and what is recorded is the state-machine transition the verb
 * produced, on each device, from the same pose and the same frame budget. A verb that is bound
 * and produces no transition fails here and passes there (§439: point the instrument at the
 * mechanism, not at the outcome the mechanism is supposed to have).
 *
 * ── The recorder ───────────────────────────────────────────────────────────────────────────
 *
 * `StateMachine.set()` is wrapped, for the reason `_smtrace.mjs` gives at length: `update()`
 * resolves every transition through `set()`, on both the `_pending` branch and the priority
 * poll, and `set()` is also the only public entry. One wrapper sees every entry there is and
 * cannot drift the way a list of transition sites would.
 *
 * ── What this file cannot discriminate, stated once for every arm below ────────────────────
 *
 * A physical DualShock 4. None exists in this container, so the browser's own HID→`standard`
 * translation — button order, axis sign, trigger rest values, stick drift — is asserted by
 * nothing here and remains the user's re-test. Every arm below is downstream of "the browser
 * reports a `standard` pad shaped like Chromium's DS4", which is assumed, not measured.
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

/** An EventTarget that keeps its handlers, so an arm can dispatch a real event object. */
function target(name) {
  const handlers = new Map();
  return {
    _name: name, _handlers: handlers,
    addEventListener(t, fn) { if (!handlers.has(t)) handlers.set(t, new Set()); handlers.get(t).add(fn); },
    removeEventListener(t, fn) { handlers.get(t)?.delete(fn); },
    fire(t, ev = {}) { const e = { preventDefault() {}, ...ev }; for (const fn of handlers.get(t) || []) fn(e); },
  };
}

let padState = null;      // the one gamepad `navigator.getGamepads` reports, or null

const canvas = target('canvas');
globalThis.window = target('window');
globalThis.document = Object.assign(target('document'), {
  pointerLockElement: null,
  // three's loaders reach for these even when nothing has a texture.
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(_v) {}, width: 1, height: 1 }),
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, removeEventListener() {} }),
});
globalThis.self = globalThis;
/* Node 22's `navigator` is getter-only; defineProperty is the only way in front of `_findPad`. */
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (padState ? [padState, null, null, null] : [null, null, null, null]) },
  configurable: true, writable: true,
});

/* Imported AFTER the globals exist — `_bind()` runs in the constructor, not on a later init. */
const { Input, KEY_BINDINGS, MOUSE_BINDINGS, PAD_BINDINGS, INPUT_TUNE } =
  await import('../src/core/Input.js');
const { Controller, TUNE } = await import('../src/player/Controller.js');
const { StateMachine } = await import('../src/player/States.js');
const M = await import('./_moveset.mjs');

/* ---- the transition recorder ---- */
let trace = [];
const origSet = StateMachine.prototype.set;
StateMachine.prototype.set = function (name) { trace.push(name); return origSet.call(this, name); };

/** Chromium's shape for a DualShock 4: `standard` mapping, 17 buttons, 4 axes. */
function freshPad() {
  return {
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
    index: 0, connected: true, mapping: 'standard',
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
}
const padPress = (i, v = 1) => { padState.buttons[i] = { pressed: v > 0, value: v }; };
const padLift = (i) => { padState.buttons[i] = { pressed: false, value: 0 }; };
const padAxes = (x, y) => { padState.axes = [x, y, 0, 0]; };

const DT = 1 / 60;

/** A real Input on a real Controller over the stub world, with a fresh pad plugged in. */
async function rig(colOpts = {}) {
  padState = freshPad();
  for (const t of [window, document, canvas]) t._handlers.clear();
  const engine = M.stubEngine();
  if (colOpts.guards) engine.get = (m) => (m === 'guards' ? colOpts.guards : null);
  engine.canvas = canvas;
  const input = new Input(engine);
  engine.input = input;
  const c = new Controller(engine);
  await c.init();
  c.col = M.stubCollision(colOpts);
  c._colReal = c.col;
  c._calibrated = true;
  c._bindCollision = () => {};            // the stub IS the collision; init must not swap it
  c.teleport(new THREE.Vector3(0, 0, 0), Math.PI);
  c._needSpawnSnap = false;
  return { engine, c, input };
}

function step(c, input, n) {
  for (let i = 0; i < n; i++) { input.beginFrame(DT); c.update(DT, 0); input.endFrame(); }
}

/* Route drivers. Every one of them goes through the shipped path — a dispatched DOM event or a
   button/axis the poll has to find — never `_press`, which would pass just as happily with the
   listener registration and the whole poll deleted. */
const K = (code) => ({
  label: `key ${code}`, device: 'kbm',
  press: () => window.fire('keydown', { code }), release: () => window.fire('keyup', { code }),
});
const Mo = (button) => ({
  label: `mouse ${button}`, device: 'kbm',
  press: () => canvas.fire('mousedown', { button }), release: () => window.fire('mouseup', { button }),
});
const P = (i) => ({ label: `pad ${i}`, device: 'pad', press: () => padPress(i), release: () => padLift(i) });
const S = (x, y) => ({ label: `stick ${x},${y}`, device: 'pad', press: () => padAxes(x, y), release: () => padAxes(0, 0) });

const air = (y) => (c) => { c.position.set(0, y, 0); c.velocity.set(0, 0, 0); c.grounded = false; };
const ground = () => (c) => { c.position.set(0, 0, 0); c.velocity.set(0, 0, 0); c.grounded = true; };
const running = () => (c) => { c.position.set(0, 0, 0); c.velocity.set(0, 0, -6); c.grounded = true; };

/** Pose, settle, engage the route, hold, release, settle. Returns every state entered after the
 *  settle — so the pose's own arrival transitions never contaminate the reading. */
async function drive(setup, route) {
  const { c, input } = await rig(setup.col || {});
  setup.place(c);
  step(c, input, setup.warm ?? 4);
  trace = [];
  route.press();
  step(c, input, setup.hold ?? 10);
  route.release();
  step(c, input, setup.after ?? 20);
  return { trace: [...trace], c, input };
}

/* ====================================================================== */
/* P1 — every action verb, on every device, to the transition it produces  */
/* ====================================================================== */

/**
 * Rows are `[verb, want, setup, kbm routes, pad routes, counterexample route]`.
 *
 * The counterexample is a LIVE, BOUND pad button that must not reach this verb — not an unbound
 * one. An unbound button proves only that unbound buttons do nothing; a neighbour proves the
 * mapping discriminates. Several of them are the moveset's own documented rules: L1 against
 * `focus` is `CombatStrafe`'s "the stealth modifiers win the button", run rather than quoted.
 */
const VERBS = [
  ['jump', 'jump', { place: ground() }, [K('Space')], [P(0)], P(1)],
  ['attack (ground)', 'combo', { place: ground() }, [K('KeyF'), Mo(0)], [P(2), P(3)], P(0)],
  ['attack (air)', 'dive', { place: air(20), warm: 12 }, [K('KeyF'), Mo(0)], [P(2), P(3)], P(5)],
  ['interact', 'pickpocket', { col: { guards: null }, place: ground() }, [K('KeyE')], [P(1)], P(2)],
  ['crouch (hold)', 'crouch', { place: ground() }, [K('ControlLeft')], [P(6)], P(4)],
  ['crouch (tap at speed)', 'roll', { place: running() }, [K('ControlLeft')], [P(6)], P(4)],
  ['sneak', 'sneak', { place: ground() }, [K('ShiftLeft')], [P(4)], P(6)],
  ['glide', 'paraglide', { place: air(30), warm: 20, hold: 20 }, [K('KeyQ')], [P(5)], P(0)],
  ['focus', 'combatStrafe', { col: { guards: null }, place: ground() }, [Mo(2)], [P(7)], P(4)],
];

test('P1 verbs: every moveset verb produces the same transition on keyboard and on pad', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : each row's keyboard/mouse route AND each of its pad routes, driven from the
   *               same pose through the real event path and the real poll into a real
   *               Controller + buildMoveset(), entering the same named state.
   *   fails  on : RUN in-arm — the counterexample column, a live bound neighbour (Circle against
   *               jump, Cross against combo, R1 against dive, Square against pickpocket, L1
   *               against crouch/roll, L2 against sneak, Cross against paraglide, L1 against
   *               combatStrafe). Each is asserted to NOT reach the verb, from the same pose, so
   *               a mapping that pressed everything at once would redden here rather than sail
   *               through on the positive column alone.
   *   verdict   : PASSES ON the bound route of either device, FAILS ON a bound neighbour.
   *               It DOES NOT discriminate a physical DS4 (see the file header), nor the FEEL of
   *               any verb — only that the coupling exists and lands in the named state.
   */
  const guards = M.stubGuards(new THREE.Vector3(0, 0, -2.0));
  const report = [];

  for (const [verb, want, setupIn, kbm, pads, neg] of VERBS) {
    const setup = { ...setupIn, col: setupIn.col ? { ...setupIn.col, guards } : {} };
    const seen = { kbm: [], pad: [] };

    for (const r of [...kbm, ...pads]) {
      const { trace: t } = await drive(setup, r);
      assert.ok(t.includes(want),
        `${verb}: ${r.label} produced [${t.join(',') || 'no transition'}] — expected '${want}'. `
        + 'The verb is bound on this device and reaches nothing: §357.1, machinery wired at one '
        + 'end only, which is what the pointer-lock swallow looked like from the player\'s chair.');
      seen[r.device].push(r.label);
    }

    /* the counterexample, RUN rather than reasoned about */
    const { trace: nt } = await drive(setup, neg);
    assert.ok(!nt.includes(want),
      `${verb}: the counterexample ${neg.label} ALSO reached '${want}' (trace [${nt.join(',')}]) — `
      + 'this arm cannot discriminate a mapping from a short circuit (§418).');

    report.push(`  ${verb.padEnd(22)} -> ${want.padEnd(13)} kbm[${seen.kbm.join(' ')}] pad[${seen.pad.join(' ')}] `
      + `· ${neg.label} correctly did not`);
  }
  console.log(`\n[P1] ${VERBS.length} verbs, both devices, driven to the state machine:\n${report.join('\n')}`);
});

/* ====================================================================== */
/* P2 — the four directions: key, d-pad and stick must agree on WHERE      */
/* ====================================================================== */

test('P2 directions: key, d-pad and stick resolve to the same wish vector', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : each of the four directions driven three ways — keyboard, d-pad, and a fully
   *               deflected stick — all three entering `move` and agreeing on `wishDir` to 1e-6.
   *               Full deflection on purpose: it is the only stick position whose magnitude is
   *               1, so a disagreement here is a DIRECTION fault and cannot be a gradient one.
   *   fails  on : RUN in-arm — the opposing d-pad button, asserted to give the opposite wish. A
   *               reading that could not tell forward from back would satisfy the agreement
   *               clause perfectly (all three would be equally wrong), so the agreement alone
   *               does not discriminate and this clause is what makes the arm mean anything.
   *   verdict   : PASSES ON any device that resolves the direction, FAILS ON the reversed one.
   *               DOES NOT discriminate axis SIGN on real DS4 hardware (header).
   */
  const dirs = [
    ['forward', K('KeyW'), P(12), S(0, -1), P(13)],
    ['back', K('KeyS'), P(13), S(0, 1), P(12)],
    ['left', K('KeyA'), P(14), S(-1, 0), P(15)],
    ['right', K('KeyD'), P(15), S(1, 0), P(14)],
  ];
  const setup = { place: ground(), hold: 20 };
  const lines = [];
  for (const [name, key, dpad, stick, opposite] of dirs) {
    const got = [];
    for (const r of [key, dpad, stick]) {
      const { trace: t, c } = await drive({ ...setup, after: 0 }, r);
      assert.ok(t.includes('move'), `${name}: ${r.label} never entered 'move' (trace [${t.join(',')}])`);
      got.push({ label: r.label, d: c.wishDir.clone(), m: c.wishMag });
    }
    for (let i = 1; i < got.length; i++) {
      assert.ok(got[0].d.distanceTo(got[i].d) < 1e-6,
        `${name}: ${got[0].label} steers ${got[0].d.toArray().map((v) => v.toFixed(3))} but `
        + `${got[i].label} steers ${got[i].d.toArray().map((v) => v.toFixed(3))} — the devices `
        + 'disagree about which way the player pushed');
      assert.ok(Math.abs(got[0].m - got[i].m) < 1e-6,
        `${name}: magnitude ${got[0].m} vs ${got[i].m} at full deflection`);
    }
    /* RUN counterexample: the opposing d-pad button must steer the other way. */
    const { c: co } = await drive({ ...setup, after: 0 }, opposite);
    assert.ok(co.wishDir.dot(got[0].d) < -0.99,
      `${name}: ${opposite.label} steers ${co.wishDir.toArray().map((v) => v.toFixed(3))}, which is `
      + `not the opposite of ${got[0].d.toArray().map((v) => v.toFixed(3))} — this arm cannot tell `
      + 'a direction from its reverse (§418)');
    lines.push(`  ${name.padEnd(8)} key/d-pad/stick all -> (${got[0].d.toArray().map((v) => v.toFixed(2)).join(', ')})`
      + ` · ${opposite.label} -> (${co.wishDir.toArray().map((v) => v.toFixed(2)).join(', ')})`);
  }
  console.log(`\n[P2] directions agree across devices:\n${lines.join('\n')}`);
});

/* ====================================================================== */
/* P3 — the asymmetry census, in BOTH directions                           */
/* ====================================================================== */

/**
 * Verbs the keyboard reaches and the pad cannot. Every one is either a debug tool or cut by the
 * user's scope ruling, and each names its consumer so the claim is checkable rather than a
 * promise. If a GAMEPLAY verb ever lands here the pad has silently lost a control.
 */
const KEYBOARD_ONLY = {
  binocu:    'src/ui/HUD.js — the Binocucom overlay, out of scope by the user\'s ruling',
  freecam:   'src/core/Debug.js + src/player/CameraRig.js — debug fly-cam',
  quality:   'src/core/Debug.js — cycles the quality preset',
  colliders: 'src/core/Debug.js — collider overlay',
};

test('P3 census: no verb is pad-only, and every keyboard-only verb is debug or out of scope', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the shipped default tables, where the pad-only set is empty and the
   *               keyboard-only set is exactly the four debug/out-of-scope verbs above.
   *   fails  on : RUN in-arm — the same census recomputed after `bindPad('jump', [])`, which
   *               must move `jump` into the keyboard-only set and out of the allowed list. That
   *               ablation is what proves the census is reading the live map rather than
   *               restating the constant it was written from (§439).
   *   verdict   : PASSES ON the shipped bindings, FAILS ON a gameplay verb losing its pad route.
   *               DOES NOT discriminate whether a listed consumer still consumes — P1 does that
   *               for the moveset verbs; the four here are driven by their owning lanes' suites.
   */
  const { input } = await rig();
  const census = (inp) => {
    const b = inp.bindings();
    const padOnly = [], keyOnly = [];
    for (const [a, r] of Object.entries(b)) {
      const kbm = r.keys.length > 0 || Number.isInteger(r.mouse);
      const pad = r.pad.length > 0;
      if (pad && !kbm) padOnly.push(a);
      if (kbm && !pad) keyOnly.push(a);
    }
    return { padOnly: padOnly.sort(), keyOnly: keyOnly.sort() };
  };

  const now = census(input);
  assert.deepEqual(now.padOnly, [],
    `pad-only verbs ${JSON.stringify(now.padOnly)} — a control the keyboard cannot reach. The `
    + 'keyboard was to be kept intact alongside the pad, so this list must stay empty.');
  assert.deepEqual(now.keyOnly, Object.keys(KEYBOARD_ONLY).sort(),
    `keyboard-only verbs are ${JSON.stringify(now.keyOnly)}, expected `
    + `${JSON.stringify(Object.keys(KEYBOARD_ONLY).sort())}. Either a gameplay verb lost its pad `
    + 'route, or a new debug verb arrived and belongs in KEYBOARD_ONLY with its consumer named.');

  /* RUN ablation: take the pad off a gameplay verb and the census must notice. */
  input.bindPad('jump', []);
  const after = census(input);
  assert.ok(after.keyOnly.includes('jump'),
    'unbinding the pad from `jump` did not show up in the census — it is reading a constant, not '
    + 'the live binding map, and could not detect a real regression (§439)');
  input.bindPad('jump', PAD_BINDINGS.jump);

  /* Both devices must also be able to SAY what they are, or a rebinding screen shows a blank. */
  for (const a of Object.keys(PAD_BINDINGS)) {
    const d = input.describe(a);
    assert.ok(d && d.trim().length, `describe('${a}') is empty — the prompt layer has nothing to draw`);
    assert.ok(!/Pad \d/.test(d), `describe('${a}') = "${d}" — an unnamed pad index reached the label table`);
  }
  console.log(`\n[P3] pad-only: none · keyboard-only: ${now.keyOnly.join(', ')} `
    + `(all debug or out of scope) · describe('jump') = "${input.describe('jump')}" `
    + `· describe('focus') = "${input.describe('focus')}"`);
});

/* ====================================================================== */
/* P4 — the analog axis is an axis, not a switch                           */
/* ====================================================================== */

test('P4 stick: deflection is a speed CONTINUUM, and the keyboard is the step function', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a swept left stick, 11 deflections from inside the deadzone to the rim, read
   *               as SETTLED speed off a real Controller — strictly increasing once live, and
   *               spanning the walk / run / run_fast clip tiers `Move.update` actually switches
   *               on. Swept rather than sampled per §450.4: one deflection answers "what does
   *               this do", only a sweep answers "is this quantised".
   *   fails  on : RUN in-arm — the reference's own rule (`player__sly.gd`: below half pressure
   *               scale, at or above half snap to 1.0) reconstructed and pushed through the same
   *               monotonicity check, which it must fail. That is the two-state switch this
   *               design exists to avoid, so it is the right counterexample, and running it
   *               proves the check can see a step function rather than assuming it would.
   *   verdict   : PASSES ON the shipped `_padStick` remap, FAILS ON the reference's split.
   *               DOES NOT discriminate stick FEEL or a real pad's drift (header).
   */
  const { c, input } = await rig();
  ground()(c);
  const sweep = [0.10, 0.18, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00];
  const rows = [];
  for (const d of sweep) {
    padAxes(0, -d);
    step(c, input, 240);                      // long enough to settle: accel is finite
    const sp = c.speedXZ();
    rows.push({ d, mag: c.wishMag, sp, tier: sp < 0.05 ? '—' : sp < 3.4 ? 'walk' : sp < 6.3 ? 'run' : 'run_fast' });
  }
  padAxes(0, 0);

  const live = rows.filter((r) => r.mag > 0);
  const dead = rows.filter((r) => r.mag === 0).map((r) => r.d);
  assert.deepEqual(dead, [0.10, 0.18],
    `deflections ${JSON.stringify(dead)} read as centred; expected exactly the two at or inside `
    + `the ${INPUT_TUNE.deadzone} radial deadzone`);
  for (let i = 1; i < live.length; i++) {
    assert.ok(live[i].sp > live[i - 1].sp + 0.05,
      `settled speed went ${live[i - 1].sp.toFixed(3)} -> ${live[i].sp.toFixed(3)} m/s between `
      + `deflection ${live[i - 1].d} and ${live[i].d} — the gradient is quantised, or the reading `
      + 'is stuck at one value across a swept input, which is an instrument fault either way');
  }
  const tiers = new Set(live.map((r) => r.tier));
  for (const t of ['walk', 'run', 'run_fast']) {
    assert.ok(tiers.has(t), `no deflection settles in the '${t}' tier — the stick cannot reach a `
      + `gait the moveset switches clips on (tiers seen: ${[...tiers].join(', ')})`);
  }
  assert.ok(Math.abs(live[live.length - 1].sp - TUNE.runSpeed) < 0.05,
    `full deflection settled at ${live[live.length - 1].sp.toFixed(3)} m/s, expected runSpeed ${TUNE.runSpeed}`);

  /* the keyboard, from the same rig — one speed, and that is the point of contrast */
  const { c: ck, input: ik } = await rig();
  ground()(ck);
  window.fire('keydown', { code: 'KeyW' });
  step(ck, ik, 240);
  window.fire('keyup', { code: 'KeyW' });
  assert.ok(Math.abs(ck.speedXZ() - TUNE.runSpeed) < 0.05,
    `a held key settled at ${ck.speedXZ().toFixed(3)} m/s, expected runSpeed ${TUNE.runSpeed} — a `
    + 'digital source has no magnitude to give and must deliver the full one');

  /* RUN counterexample: the reference's split, through the same monotonicity check. */
  const refSpeeds = sweep.map((d) => {
    if (d <= INPUT_TUNE.deadzone) return 0;
    return (d < 0.5 ? d : 1) * TUNE.runSpeed;      // player__sly.gd `_physics_process`
  }).filter((s) => s > 0);
  let refMonotone = true;
  for (let i = 1; i < refSpeeds.length; i++) if (!(refSpeeds[i] > refSpeeds[i - 1] + 0.05)) refMonotone = false;
  assert.equal(refMonotone, false,
    'the reference\'s half-pressure split passed this arm\'s monotonicity check — the check cannot '
    + 'tell a continuum from a two-state switch and proves nothing (§418)');

  console.log('\n[P4] left-stick sweep — settled speed off a real Controller:\n'
    + rows.map((r) => `  deflect ${r.d.toFixed(2)}  wishMag ${r.mag.toFixed(4)}  `
      + `${r.sp.toFixed(3)} m/s  ${r.tier}`).join('\n')
    + `\n  keyboard W       wishMag 1.0000  ${ck.speedXZ().toFixed(3)} m/s  run_fast (no ramp to give)`);
});

/* ====================================================================== */
/* P5 — guarantee (3) on BOTH devices: a held control across a focus loss  */
/* ====================================================================== */

test('P5 focus loss: a pad button still physically held comes back DOWN, not PRESSED', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : Cross (and R1) held through a real `blur`, on the shipped class: `down()` true
   *               again on the next poll, `pressed()` false, `buffered()` false — matching what
   *               the same drill does on Space and Q, which is the parity being claimed.
   *   fails  on : RUN in-arm — the pre-fix behaviour, reconstructed by clearing `_padResync`
   *               before the poll so the re-discovered hold goes through `_press` as it used to.
   *               That arm must report a phantom `pressed('jump')`, which is the defect this
   *               guarantee was missing on one device: alt-tab out with Cross held and Sly jumps
   *               on the way back in, with the jump buffer re-armed one frame after
   *               `_dropAllHeld` deliberately emptied it.
   *   verdict   : PASSES ON the adopt path, FAILS ON the press path — so it discriminates the
   *               fix from its own absence, not merely the presence of a release.
   *               DOES NOT discriminate what a real browser does with a real pad at a real
   *               alt-tab: `navigator.getGamepads` here always answers (header).
   */
  const held = [
    ['pad Cross', 'jump', () => padPress(0), () => padLift(0)],
    ['pad R1', 'glide', () => padPress(5), () => padLift(5)],
  ];
  const keys = [
    ['key Space', 'jump', 'Space'],
    ['key Q', 'glide', 'KeyQ'],
  ];
  const lines = [];

  for (const [label, action, hold, lift] of held) {
    const { input } = await rig();
    hold();
    input.beginFrame(DT);
    assert.equal(input.pressed(action), true, `${label}: the real press did not edge`);
    input.endFrame();
    window.fire('blur');                       // the player alt-tabs, thumb still on the button
    input.beginFrame(DT);
    const p = input.pressed(action), d = input.down(action), b = input.buffered(action, 140);
    input.endFrame();
    assert.equal(p, false,
      `${label}: a button that never went up produced a phantom press on the way back in — `
      + 'guarantee (3) holds on the keyboard and not here');
    assert.equal(b, false,
      `${label}: the jump buffer was re-armed after \`_dropAllHeld\` emptied it — the clear that `
      + 'exists so a pre-alt-tab press is not still live on return bought nothing');
    assert.equal(d, true,
      `${label}: the button IS physically down and \`down()\` says otherwise — the hold was lost, `
      + 'not adopted, and a held glide would silently stop gliding');
    lift();
    lines.push(`  ${label.padEnd(11)} across blur -> down=${d} pressed=${p} buffered=${b}`);
  }

  for (const [label, action, code] of keys) {
    const { input } = await rig();
    window.fire('keydown', { code });
    input.beginFrame(DT);
    assert.equal(input.pressed(action), true, `${label}: the real press did not edge`);
    input.endFrame();
    window.fire('blur');
    input.beginFrame(DT);
    const p = input.pressed(action), d = input.down(action);
    input.endFrame();
    assert.equal(p, false, `${label}: a key produced a phantom press after blur`);
    assert.equal(d, false,
      `${label}: the browser sends no keydown for a key already held at refocus, so the keyboard `
      + 'cannot know it is still down — if this is true the shim has grown a poll the DOM has not');
    window.fire('keyup', { code });
    lines.push(`  ${label.padEnd(11)} across blur -> down=${d} pressed=${p}`);
  }

  /* RUN ablation: put the old path back for one poll and watch the phantom press appear. */
  {
    const { input } = await rig();
    padPress(0);
    input.beginFrame(DT); input.endFrame();
    window.fire('blur');
    input._padResync = false;                  // pre-fix: re-discovery went through `_press`
    input.beginFrame(DT);
    const phantom = input.pressed('jump');
    input.endFrame();
    padLift(0);
    assert.equal(phantom, true,
      'the pre-fix path did NOT produce a phantom press, so this arm is not measuring the thing '
      + 'it claims to measure — it would pass with the repair deleted (§418)');
    lines.push('  ablation (_padResync=false, the pre-fix path) -> pressed=true, as it used to');
  }
  console.log(`\n[P5] a control held across a focus loss:\n${lines.join('\n')}`);
});

/* ====================================================================== */
/* P6 — §514's surface, on the one gameplay verb with no keycap            */
/* ====================================================================== */

test('P6 focus is mouse-and-pad only, so its mouse route must survive a failed pointer lock', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : four right-clicks on a canvas whose `requestPointerLock` never resolves and
   *               never errors — the machine §514 was written for — each one reaching `focus`.
   *   fails  on : RUN in-arm — four LEFT clicks in the same arm, on the same canvas, which are
   *               all swallowed. That is `_onMouseDown`'s intended `e.button === 0` gate, and
   *               running it is what makes the RMB result mean "the gate is narrow" instead of
   *               "there is no gate today".
   *   verdict   : PASSES ON RMB under a pending grant, FAILS ON LMB under the same grant. So it
   *               discriminates the WIDTH of the swallow, which is the thing that would take
   *               Thief-o-Vision out — `focus` has no keyboard binding at all (P3 prints it), so
   *               a swallow widened to every button leaves the verb reachable only on a pad.
   *               DOES NOT discriminate real Chrome's post-Esc cooldown; `input.test.mjs` arm
   *               'lock swallow' owns the grant-failure channels themselves.
   */
  assert.deepEqual(KEY_BINDINGS.focus ?? [], [],
    'focus grew a keyboard binding — good, but this arm\'s premise (mouse-and-pad only) is now '
    + 'stale and the §514 argument in PAD_BINDINGS needs rewriting with it');
  assert.equal(MOUSE_BINDINGS.focus, 2, 'focus is no longer on RMB — the premise is stale');

  const clicks = async (button, action) => {
    const { input } = await rig();
    canvas.requestPointerLock = () => new Promise(() => {});   // issued, never granted, never errors
    const seen = [];
    for (let i = 0; i < 4; i++) {
      input.beginFrame(DT);
      canvas.fire('mousedown', { button });
      input.beginFrame(DT);
      seen.push(input.pressed(action));
      window.fire('mouseup', { button });
      input.endFrame();
    }
    return seen;
  };

  const rmb = await clicks(2, 'focus');
  assert.ok(rmb.every(Boolean),
    `right-clicks under a pending pointer-lock grant read ${JSON.stringify(rmb)} — the swallow has `
    + 'widened past button 0 and taken Thief-o-Vision with it. `focus` has no keyboard binding, so '
    + 'this leaves a gameplay verb reachable on the pad alone (§514 all over again).');

  const lmb = await clicks(0, 'attack');
  assert.ok(!lmb.some(Boolean),
    `left-clicks under a pending grant read ${JSON.stringify(lmb)} — the lock swallow is not `
    + 'engaged at all in this arm, so the RMB result above says nothing about its width (§418)');

  console.log(`\n[P6] grant never lands · RMB->focus ${JSON.stringify(rmb)} · LMB->attack ${JSON.stringify(lmb)} `
    + '(the swallow is button-0 only, which is why focus survives without a keycap)');
});
