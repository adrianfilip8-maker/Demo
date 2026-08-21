import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

/**
 * padtiming — WHEN a verb arrives, not whether it can (§543).
 *
 * §540 established that every verb is reachable on both devices, §541 that the sticks and prompts
 * behave, §542 that removal and the triggers are handled. All three asked *can this be reached*.
 * The answer was yes every time, and it had to be: the keyboard arrives as events and the pad
 * arrives by polling, so any question phrased as reachability is answered by holding the control
 * down long enough, which every one of those arms did.
 *
 * ── The ceiling, derived before anything was driven (§450.4) ────────────────────────────────
 *
 * `main.js` pumps `beginFrame → debug.update → modules → endFrame` from one rAF callback, so the
 * pad is sampled EXACTLY ONCE per frame and the poll interval T is the frame interval. From that
 * alone, before a single input:
 *
 *   · a pad tap of duration d is seen iff a poll instant falls inside it. Polls are a grid of
 *     period T at arbitrary phase, so `d >= T` is always seen and `d < T` is missed with
 *     probability `1 - d/T`.
 *   · a keyboard tap dispatches keydown AND keyup as DOM events between frames; both stamp the
 *     next frame, so `pressed()` and `released()` both fire and the floor is ZERO.
 *   · therefore the largest timing discrepancy this architecture permits is exactly T — one frame.
 *
 * T is ~16.7 ms on the hardware the user will hold and 100-300 ms in this container. That
 * difference is the whole disposition of T1: at 60 fps a human tap (~30-80 ms) is ALWAYS seen, so
 * the defect is unreachable on real hardware and is pinned as a bound rather than repaired. The
 * Gamepad API exposes state, not edges; there is no press between polls to recover.
 *
 * ── What cannot be discriminated here ───────────────────────────────────────────────────────
 *
 * No physical DualShock 4 exists in this container, and no real rAF loop runs in these arms: the
 * timeline below is *scripted*, so what a real driver's poll cadence does — coalescing, its own
 * internal sampling rate, whether Chromium's snapshot lags the hardware — remains the user's
 * re-test even though the architecture's own bound is now measured.
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

function target(name) {
  const h = new Map();
  return {
    _name: name, _handlers: h,
    addEventListener(t, fn) { if (!h.has(t)) h.set(t, new Set()); h.get(t).add(fn); },
    removeEventListener(t, fn) { h.get(t)?.delete(fn); },
    fire(t, ev = {}) { const e = { preventDefault() {}, ...ev }; for (const fn of h.get(t) || []) fn(e); },
  };
}
let slots = [null, null, null, null];
const canvas = target('canvas');
globalThis.window = target('window');
globalThis.document = Object.assign(target('document'), {
  pointerLockElement: null,
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(_v) {}, width: 1, height: 1 }),
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, removeEventListener() {} }),
});
globalThis.self = globalThis;
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => slots }, configurable: true, writable: true,
});

const { Input, PAD_BINDINGS } = await import('../src/core/Input.js');
const { Controller, TUNE } = await import('../src/player/Controller.js');
const M = await import('./_moveset.mjs');

const FPS = 60;
const DT = 1 / FPS;
const T_MS = 1000 / FPS;                       // the poll interval: one frame
const JUMP_BTN = PAD_BINDINGS.jump[0];
const PIN = (i) => { i._lastReal = performance.now() - 1000 / 60; };

const mkPad = () => ({
  id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  index: 0, connected: true, mapping: 'standard',
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
});

async function sim() {
  slots = [null, null, null, null];
  for (const t of [window, document, canvas]) t._handlers.clear();
  const engine = M.stubEngine();
  engine.canvas = canvas;
  const input = new Input(engine);
  engine.input = input;
  const c = new Controller(engine);
  await c.init();
  c.col = M.stubCollision({});
  c._colReal = c.col; c._calibrated = true; c._bindCollision = () => {};
  c.teleport(new THREE.Vector3(0, 0, 0), Math.PI);
  c._needSpawnSnap = false;
  c.position.set(0, 0, 0); c.velocity.set(0, 0, 0); c.grounded = true;
  return { engine, c, input };
}
const cycle = (c, input, n = 1) => {
  for (let i = 0; i < n; i++) { PIN(input); input.beginFrame(DT); c.update(DT, 0); input.endFrame(); }
};

/* ====================================================================== */
/* T1 — the sub-frame tap                                                  */
/* ====================================================================== */

test('T1 sub-frame tap: the pad cannot see one, the keyboard always can, and the gap is exactly T', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a tap swept across 100 phases of one poll gap, at eight durations, with the
   *               measured miss rate matching the derived `1 - d/T` to within 3 points at every
   *               duration — including the two ends, where a 2 ms tap is missed ~88% of the time
   *               and a tap of a full T is never missed.
   *   fails  on : RUN in-arm — the same tap on the keyboard, which is seen at EVERY phase and at
   *               every duration including the shortest. Without that leg "the pad misses short
   *               taps" would be satisfied by a harness that simply never delivered anything.
   *   verdict   : passes on a sampled device, fails on an evented one. It discriminates the
   *               SAMPLING, not the binding — every §540 arm would pass with this defect present,
   *               because they all hold the control down across a poll.
   *   does NOT  : discriminate a real driver's cadence (see the file header), and does not claim
   *   discrim.    the defect is reachable by a player: at 60 fps a human tap is 2-5x T and is
   *               always seen. The number that matters is the BOUND, and it is one frame.
   */
  const rows = [];
  for (const d of [2, 4, 8, 12, 16, T_MS, 20, 30]) {
    let seen = 0;
    const PHASES = 100;
    for (let k = 0; k < PHASES; k++) {
      const phase = (k / PHASES) * T_MS;
      const { c, input } = await sim();
      slots[0] = mkPad();
      cycle(c, input);                                   // poll 0, at rest
      let got = false;
      for (let n = 1; n <= 4; n++) {
        const tPoll = n * T_MS;                          // virtual instant of this poll
        const inTap = tPoll >= T_MS + phase && tPoll < T_MS + phase + d;
        slots[0].buttons[JUMP_BTN] = { pressed: inTap, value: inTap ? 1 : 0 };
        PIN(input); input.beginFrame(DT);
        if (input.pressed('jump')) got = true;
        input.endFrame();
      }
      if (got) seen++;
    }
    const measured = (1 - seen / PHASES) * 100;
    const predicted = Math.max(0, 1 - d / T_MS) * 100;
    rows.push({ d, measured, predicted });
    assert.ok(Math.abs(measured - predicted) <= 3,
      `a ${d} ms pad tap was missed ${measured.toFixed(0)}% of the time; the architecture's own `
      + `bound says ${predicted.toFixed(0)}%. The poll model and the code disagree, which means one `
      + 'of them is wrong and the ceiling derivation can no longer be trusted (§450.4).');
  }
  assert.ok(rows[rows.length - 1].measured === 0, 'a 30 ms tap — twice the poll interval — was missed');

  /* RUN the other leg: the keyboard, same gap, and it is never missed. */
  {
    const { c, input } = await sim();
    slots[0] = mkPad();
    cycle(c, input);
    window.fire('keydown', { code: 'Space' });
    window.fire('keyup', { code: 'Space' });              // the entire tap between two polls
    PIN(input); input.beginFrame(DT);
    const p = input.pressed('jump'), r = input.released('jump'), b = input.bufferedPeek('jump', TUNE.jumpBufferMs);
    input.endFrame();
    assert.ok(p && r && b,
      `a keyboard tap entirely between polls read pressed=${p} released=${r} buffered=${b} — if the `
      + 'keyboard cannot see it either, this arm is measuring the harness and not the devices (§418)');
  }

  console.log('\n[T1] pad tap vs the derived ceiling (T = one poll = '
    + `${T_MS.toFixed(2)} ms at ${FPS} fps):\n`
    + rows.map((r) => `  ${String(r.d).padStart(5)} ms  measured ${r.measured.toFixed(0).padStart(3)}% missed`
      + `  ceiling ${r.predicted.toFixed(0).padStart(3)}%`).join('\n')
    + '\n  keyboard, same gap: seen at every phase and every duration — floor 0 ms.'
    + '\n  A human tap is 30-80 ms, so at 60 fps this is unreachable; it opens up as fps falls.');
});

test('T1b the moveset cares: the same tap is a hop on one device and nothing on the other', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the sub-frame tap driven into the real Controller — the keyboard leaves the
   *               ground (`pressed` and `released` on one frame is a jump with the cut applied, a
   *               deliberate short hop) and the pad never leaves it at all.
   *   fails  on : RUN in-arm — the SAME pad input held across one poll, which does jump. Without
   *               that the arm would also pass if the pad could not jump at all, which is the §540
   *               defect and a different bug entirely.
   *   verdict   : passes on a tap, fails on a hold — so it discriminates the DURATION, which is
   *               the variable under test.
   */
  const peakOf = async (drive) => {
    const { c, input } = await sim();
    slots[0] = mkPad();
    cycle(c, input, 4);
    drive(input);
    let peak = 0;
    for (let i = 0; i < 40; i++) { cycle(c, input); peak = Math.max(peak, c.position.y); }
    return peak;
  };
  const key = await peakOf(() => { window.fire('keydown', { code: 'Space' }); window.fire('keyup', { code: 'Space' }); });
  const pad = await peakOf(() => {
    slots[0].buttons[JUMP_BTN] = { pressed: true, value: 1 };
    slots[0].buttons[JUMP_BTN] = { pressed: false, value: 0 };   // both between polls
  });
  assert.ok(key > 0.05, `a keyboard sub-frame tap reached ${key.toFixed(3)} m — it should hop`);
  assert.ok(pad < 0.01, `a pad sub-frame tap reached ${pad.toFixed(3)} m — the premise that a tap `
    + 'between polls is invisible no longer holds and T1 needs re-deriving');

  /* RUN the counterexample: hold it across ONE poll and the pad jumps. */
  const held = await peakOf(() => { slots[0].buttons[JUMP_BTN] = { pressed: true, value: 1 }; });
  assert.ok(held > 0.05,
    `the pad did not jump even when the button was HELD (${held.toFixed(3)} m) — this arm is not `
    + 'measuring tap duration, it is measuring a broken binding (§418)');
  console.log(`\n[T1b] sub-frame tap: keyboard ${key.toFixed(3)} m · pad ${pad.toFixed(3)} m`
    + ` · pad HELD across one poll ${held.toFixed(3)} m`);
});

/* ====================================================================== */
/* T2 — intra-frame order                                                  */
/* ====================================================================== */

test('T2 order: the pad is folded in before every consumer, and the d-pad lands the same frame', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : `_padButtons` observed to run before the module update within one cycle; a pad
   *               press posed before `beginFrame` producing its state transition in that SAME
   *               cycle; and a d-pad direction reaching `input.move` on the frame it is polled,
   *               which is only true because the digital fold reads `down()` AFTER `_padButtons`.
   *   fails  on : RUN in-arm — the same d-pad direction with the fold order inverted by reading
   *               `move` BEFORE `beginFrame`, which must report 0. That is what a one-frame lag
   *               would look like, and running it is what makes "the same frame" mean something.
   *   verdict   : passes on the shipped order, fails on a stale read. It does not discriminate
   *               `main.js`'s pump order itself — that is one call site, asserted by reading, and
   *               a change there would not redden this arm.
   */
  const { c, input } = await sim();
  slots[0] = mkPad();
  cycle(c, input);
  const order = [];
  const origPB = input._padButtons.bind(input);
  input._padButtons = (gp) => { order.push('padButtons'); return origPB(gp); };

  slots[0].buttons[JUMP_BTN] = { pressed: true, value: 1 };
  PIN(input); input.beginFrame(DT);
  order.push('moduleUpdate');
  c.update(DT, 0);
  input.endFrame();
  assert.deepEqual(order, ['padButtons', 'moduleUpdate'],
    `the pad was folded in ${order.join(' then ')} — a consumer reading before the poll gets last `
    + 'frame\'s pad state, which is the one-frame lag this arm exists to exclude');
  assert.equal(c.stateName, 'jump',
    `a pad press posed before beginFrame did not reach the state machine in the same cycle `
    + `(state '${c.stateName}')`);

  /* the digital fold, and the stale read that shows it matters */
  const { c: c2, input: i2 } = await sim();
  slots[0] = mkPad();
  cycle(c2, i2);
  slots[0].buttons[PAD_BINDINGS.forward[0]] = { pressed: true, value: 1 };
  const before = i2.move.y;                       // read BEFORE the poll: the stale value
  PIN(i2); i2.beginFrame(DT);
  const after = i2.move.y;                        // read after: this frame's
  i2.endFrame();
  assert.equal(before, 0, 'the stale read was not stale — the arm cannot show the fold matters');
  assert.equal(after, 1,
    `a d-pad direction polled this frame delivered move.y ${after} — the digital fold is no longer `
    + 'reading down() after _padButtons, so the d-pad lags the keyboard by a frame');
  console.log(`\n[T2] order ${order.join(' -> ')} · d-pad move.y ${before} before the poll, ${after} after`);
});

/* ====================================================================== */
/* T3 — the buffer stamp                                                   */
/* ====================================================================== */

test('T3 buffer: both devices measure the window from the same instant', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a keyboard press and a pad press, each read on the frame it first becomes
   *               visible, reporting the SAME age and surviving the SAME number of frames of the
   *               140 ms buffer.
   *   fails  on : RUN in-arm — the pre-fix stamp, restored by clearing `_step` so a polled press
   *               is stamped at the poll instant instead of the boundary before it. That must
   *               reproduce the measured gap: pad age 0.00 ms against the keyboard's 16.67, and
   *               one extra frame of buffer.
   *   verdict   : passes on a shared convention, fails on the split one. It discriminates the
   *               STAMP, not the window — a change to `jumpBufferMs` moves both legs together and
   *               correctly does not redden this.
   *   does NOT  : discriminate which convention is closer to the true press instant. Neither is:
   *   discrim.    both are bounded by one step, in opposite directions, and the arm asserts only
   *               that the two devices share one.
   */
  const probe = async (device, ablate = false) => {
    const { c, input } = await sim();
    slots[0] = mkPad();
    cycle(c, input);
    if (ablate) {
      /* The pre-fix stamp, restored where it is actually applied. Zeroing `_step` from outside
         cannot do it: `beginFrame` assigns `_step` at the top, before the poll that presses. */
      const orig = input._press.bind(input);
      input._press = (a, src) => {
        const had = input._pressedAt.has(a);
        orig(a, src);
        if (src === 'pad' && !had && input._pressedAt.has(a)) input._pressedAt.set(a, input.clock);
      };
    }
    if (device === 'key') window.fire('keydown', { code: 'Space' });
    else slots[0].buttons[JUMP_BTN] = { pressed: true, value: 1 };
    let age = null, survived = 0;
    for (let n = 0; n < 40; n++) {
      PIN(input); input.beginFrame(DT);
      if (age === null) age = (input.clock - input._pressedAt.get('jump')) * 1000;
      if (input.bufferedPeek('jump', TUNE.jumpBufferMs)) survived++;
      input.endFrame();
      if (n === 0) {
        if (device === 'key') window.fire('keyup', { code: 'Space' });
        else slots[0].buttons[JUMP_BTN] = { pressed: false, value: 0 };
      }
    }
    return { age, survived };
  };

  const k = await probe('key'), p = await probe('pad');
  assert.ok(Math.abs(k.age - p.age) < 1e-6,
    `the buffer starts ${k.age.toFixed(2)} ms into the window on the keyboard and ${p.age.toFixed(2)} `
    + 'on the pad — one device is being credited a frame the other is not, on the timing that '
    + 'decides whether a jump made just before a ledge still fires');
  assert.equal(k.survived, p.survived,
    `the keyboard's buffered press survived ${k.survived} frames and the pad's ${p.survived}`);

  /* RUN the pre-fix stamp. */
  const pk = await probe('key', true), pp = await probe('pad', true);
  assert.ok(pp.survived > pk.survived,
    `with the fix ablated the pad survived ${pp.survived} frames against the keyboard's `
    + `${pk.survived} — the arm is not reproducing the gap it guards against (§418)`);
  assert.ok(pp.age < pk.age - 1,
    `ablated pad age ${pp.age.toFixed(2)} ms vs keyboard ${pk.age.toFixed(2)} — expected the pad to `
    + 'read as freshly pressed');
  console.log(`\n[T3] shared stamp: keyboard ${k.age.toFixed(2)} ms / ${k.survived} frames · `
    + `pad ${p.age.toFixed(2)} ms / ${p.survived} frames`
    + `\n     ablation (pre-fix): keyboard ${pk.age.toFixed(2)} ms / ${pk.survived} · `
    + `pad ${pp.age.toFixed(2)} ms / ${pp.survived} — the pad gained a frame`);
});

/* ====================================================================== */
/* T4 — the pause cel no longer lies                                       */
/* ====================================================================== */

test('T4 pause: Options opens the cel the cel says it opens, and follows the debug flag', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the real `HUD`, pumped in `main.js`'s order (debug flag resolved before the
   *               module update), opening its pause cel and releasing the pointer when `pause` is
   *               pressed, and closing it on the next press — from the pad's Options and the
   *               keyboard's P alike.
   *   fails  on : RUN in-arm — a frame with no `pause` press, which must leave the cel shut; and
   *               the desync case that ruled out an independent toggle: Esc-pause followed by
   *               Options, which must NOT end with the sim frozen and the cel closed.
   *   verdict   : passes on the mirror, fails on a stray frame and on the desync the alternative
   *               design would have produced.
   *   does NOT  : discriminate pixels, nor `src/core/Debug.js` — that file is not edited and its
   *   discrim.    own toggle is simulated here exactly as `main.js` sequences it.
   */
  const { installDom, fakeEngine } = await import('./_hudshim.mjs');
  const { doc, win } = installDom();
  const { HUD } = await import('../src/ui/HUD.js');

  const boot = async () => {
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 500);
    camera.position.set(0, 2, 0); camera.lookAt(0, 2, -20); camera.updateMatrixWorld(true);
    const engine = fakeEngine(camera);
    engine.debug = { hideHud: false, paused: false };
    let locks = 0;
    const pressed = new Set();
    engine.input = { pressed: (a) => pressed.has(a), releaseLock() { locks++; }, get locks() { return locks; } };
    const hud = new HUD(engine);
    await hud.init();
    /** One frame in `main.js`'s order: Debug resolves `pause` first, then the modules update. */
    const frame = (press = null) => {
      pressed.clear();
      if (press) pressed.add(press);
      if (pressed.has('pause')) engine.debug.paused = !engine.debug.paused;   // src/core/Debug.js
      hud.update(1 / 60);
      return { cel: hud.el.pause.classList.contains('on'), enginePaused: !!engine.paused, dbg: engine.debug.paused, locks };
    };
    return { hud, engine, frame };
  };

  {
    const { frame } = await boot();
    const idle = frame(null);
    assert.equal(idle.cel, false, 'the cel was open before anything was pressed');

    const opened = frame('pause');
    assert.ok(opened.cel,
      'pressing `pause` did not open the controls cel. The cel\'s own row offers Esc / Options for '
      + '"Pause / release the pointer", and Options reached only `engine.debug.paused` — a silent '
      + 'freeze with no cel, which is the game telling the player a button that does nothing.');
    assert.ok(opened.enginePaused, 'the cel opened without pausing the engine');
    assert.ok(opened.locks > 0, 'pausing did not release the pointer, which the cel row promises');

    const still = frame(null);
    assert.ok(still.cel, 'the cel closed on a frame with no press');

    const closed = frame('pause');
    assert.equal(closed.cel, false, 'a second `pause` press did not close the cel');
    assert.equal(closed.dbg, false, 'the debug flag and the cel have parted company');
    assert.equal(closed.enginePaused, false, 'the engine stayed paused after the cel closed');
  }

  /* RUN the desync an independent toggle would have produced: Esc, then Options. */
  {
    const { hud, engine, frame } = await boot();
    hud.setPaused(true);                                  // Escape's route — HUD only
    assert.ok(hud.pauseOn && engine.paused && !engine.debug.paused, 'the Esc route did not pause');
    const a = frame('pause');                             // now Options
    const b = frame('pause');                             // and again
    assert.equal(b.cel, false, 'the cel never closed after an Esc-pause followed by Options');
    assert.equal(b.dbg || b.enginePaused, false,
      `after Esc-pause then two Options presses the sim is still frozen (debug ${b.dbg}, engine `
      + `${b.enginePaused}) with the cel ${b.cel ? 'open' : 'SHUT'} — this is the desync that ruled `
      + 'out toggling independently of the debug flag');
    console.log(`\n[T4] Esc-pause then Options x2 -> cel ${b.cel}, debug ${b.dbg}, engine ${b.enginePaused}`
      + ` (mirroring the flag cannot strand the sim frozen behind a shut cel)`);
  }
});
