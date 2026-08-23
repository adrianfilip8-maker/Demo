import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

/**
 * padhotplug — the pad that goes away, the pad that comes back, and the analogue triggers (§542).
 *
 * §540 established that every verb is reachable on both devices and §541 that the sticks and the
 * prompt swap behave. Both asked what happens while a controller is PRESENT and working. This
 * file asks the two questions that remain, and they are the same question from opposite ends:
 *
 *   · **removal.** `_padButtons` is the only thing that ever releases a pad hold, and it only runs
 *     when there is a pad to poll. So a controller unplugged mid-play left its holds latched with
 *     nothing able to clear them — the sibling of §540's phantom press, except that a phantom
 *     press fires once and a latch never stops.
 *   · **the triggers.** L2/R2 are analogue, and the W3C rest convention is not universal. A pad
 *     whose triggers rest at the wrong end is pressing two of our verbs from the first frame.
 *
 * ── Ownership ───────────────────────────────────────────────────────────────────────────────
 *
 * `src/player/CameraRig.js` is read-only for this lane, and nothing here touches it: every claim
 * below is about `src/core/Input.js` and the `Controller` it drives.
 *
 * ── The standing limit ──────────────────────────────────────────────────────────────────────
 *
 * There is no physical DualShock 4 in this container. The rest conventions swept in H4 are
 * *constructed*, not sampled from hardware, and which one a real DS4 reports through a real
 * browser remains the user's re-test — as do axis signs and real drift magnitudes.
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

/** Four gamepad slots, exactly as `navigator.getGamepads()` reports them. */
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

const { Input, INPUT_TUNE, PAD_BINDINGS } = await import('../src/core/Input.js');
const { Controller, TUNE } = await import('../src/player/Controller.js');
const M = await import('./_moveset.mjs');

const DT = 1 / 60;
const PIN = (i) => { i._lastReal = performance.now() - 1000 / 60; };

/** A DS4-shaped `standard` pad. `restTrigger` sets what L2/R2 read with nobody touching them. */
const mkPad = (index = 0, { restTrigger = 0 } = {}) => ({
  id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  index, connected: true, mapping: 'standard',
  buttons: Array.from({ length: 17 }, (_, i) => (
    (i === 6 || i === 7) ? { pressed: false, value: restTrigger } : { pressed: false, value: 0 })),
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
const step = (c, input, n) => {
  for (let i = 0; i < n; i++) { PIN(input); input.beginFrame(DT); c.update(DT, 0); input.endFrame(); }
};

/* ====================================================================== */
/* H1 — a pad that vanishes while holding something                        */
/* ====================================================================== */

test('H1 removal: a pad that vanishes mid-play does not leave Sly running forever', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : d-pad up held on a real poll loop, then the pad removed from
   *               `navigator.getGamepads()` — `down('forward')` false within a frame and Sly
   *               decelerating to a stop, travelling less than 2 m after the removal; and R2
   *               held then removed restoring `engine.timeScale` to 1.
   *   fails  on : RUN in-arm — the pre-fix path, reconstructed by restoring `_padLast` behind
   *               the poll so the removal branch cannot fire. That arm must show the latch: still
   *               `down('forward')`, still at runSpeed, tens of metres travelled with no
   *               controller attached.
   *   verdict   : passes on the release-on-removal path, fails without it. It discriminates a
   *               LATCH, not merely "the pad is gone" — the stick is checked separately in H1b
   *               precisely because the stick never latched and would make this arm pass for the
   *               wrong reason.
   *   does NOT  : discriminate what a real browser reports on a real unplug — whether the slot
   *   discrim.    becomes null, or a gamepad with `connected: false`, is the user's re-test. Both
   *               shapes are driven here; neither is observed from hardware.
   */
  /* the runaway: a direction */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0);
    step(c, input, 5);
    slots[0].buttons[12] = { pressed: true, value: 1 };
    step(c, input, 30);
    assert.ok(c.speedXZ() > TUNE.runSpeed * 0.9, 'the d-pad never got Sly running; premise is stale');
    const p0 = c.position.clone();
    slots[0] = null;                                   // yanked
    step(c, input, 300);
    const travelled = c.position.distanceTo(p0);
    assert.equal(input.down('forward'), false,
      'the pad was removed and `forward` is still held. `_padButtons` is the only thing that '
      + 'releases a pad hold and it only runs when there IS a pad, so nothing can ever clear this: '
      + 'Sly runs until the level ends.');
    assert.ok(travelled < 2,
      `Sly travelled ${travelled.toFixed(2)} m in the five seconds after the controller was `
      + 'unplugged — a runaway, not a coast');
    assert.equal(c.speedXZ(), 0, `Sly is still moving at ${c.speedXZ().toFixed(3)} m/s`);
  }

  /* the worse one: a modifier */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0);
    step(c, input, 5);
    slots[0].buttons[11] = { pressed: true, value: 1 };         // R3 = focus (§682, was R2)
    step(c, input, 10);
    assert.equal(c.engine.timeScale, TUNE.visionScale, 'R3 never engaged Thief-o-Vision; premise is stale');
    slots[0] = null;
    step(c, input, 120);
    assert.equal(input.down('focus'), false, 'focus stayed held after the pad was removed');
    assert.equal(c.engine.timeScale, 1,
      `timeScale is ${c.engine.timeScale} two seconds after the controller was unplugged — the `
      + 'whole game is stuck in slow-mo with no input able to end it');
  }

  /* the same event in the other shape a browser can report it */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0);
    step(c, input, 5);
    slots[0].buttons[12] = { pressed: true, value: 1 };
    step(c, input, 10);
    slots[0] = { ...slots[0], connected: false };               // present but disconnected
    step(c, input, 60);
    assert.equal(input.down('forward'), false,
      'a gamepad reported with `connected: false` did not count as removed');
  }

  /* RUN the pre-fix path: defeat the removal branch and watch the latch appear. */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0);
    step(c, input, 5);
    slots[0].buttons[12] = { pressed: true, value: 1 };
    step(c, input, 30);
    const p0 = c.position.clone();
    slots[0] = null;
    for (let i = 0; i < 300; i++) {
      input._padLast = -1;                 // pre-fix: no memory of a pad, so no removal is noticed
      PIN(input); input.beginFrame(DT); c.update(DT, 0); input.endFrame();
    }
    assert.equal(input.down('forward'), true,
      'the pre-fix path did NOT latch, so this arm is not reproducing the defect it guards (§418)');
    assert.ok(c.position.distanceTo(p0) > 20,
      `the pre-fix path travelled only ${c.position.distanceTo(p0).toFixed(2)} m — the runaway is `
      + 'not being reproduced');
    console.log(`\n[H1] ablation — pre-fix: ${c.position.distanceTo(p0).toFixed(1)} m travelled and `
      + `${c.speedXZ().toFixed(3)} m/s still commanded, with no controller attached`);
  }
});

test('H1b removal: the STICK never latched, which is why the button latch was invisible', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the left stick held fully forward and the pad removed — Sly stops, on the
   *               shipped code AND on the pre-fix path, because `beginFrame` rewrites `move` from
   *               `down()` every frame and an absent pad contributes nothing to the digital fold.
   *   fails  on : RUN in-arm — the same removal with the d-pad instead of the stick on the pre-fix
   *               path, which does latch. The pair is the point: a probe that had tested removal
   *               with the STICK would have reported "removal is handled" and been wrong about
   *               every button on the pad.
   *   verdict   : does not discriminate the defect at all by itself — recorded as the near-miss
   *               it is, so nobody re-tests removal the cheap way and concludes it is fine.
   */
  const { c, input } = await sim();
  slots[0] = mkPad(0);
  step(c, input, 5);
  slots[0].axes = [0, -1, 0, 0];
  step(c, input, 60);
  assert.ok(c.speedXZ() > TUNE.runSpeed * 0.9, 'the stick never got Sly running; premise is stale');
  slots[0] = null;
  for (let i = 0; i < 120; i++) {
    input._padLast = -1;                   // even WITHOUT the fix
    PIN(input); input.beginFrame(DT); c.update(DT, 0); input.endFrame();
  }
  assert.equal(c.speedXZ(), 0,
    'the stick latched after removal — then the digital fold is no longer rewriting `move` from '
    + '`down()` and H1\'s reasoning about why this was missable is wrong');
  console.log('[H1b] stick removal stops Sly with or without the fix — the near-miss that hid H1');
});

/* ====================================================================== */
/* H2 / H3 — coming back, and coming back as somebody else                 */
/* ====================================================================== */

test('H2 reconnect: the pad comes back adopted, re-sampled, and without a phantom press', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : unplug, replug — a button physically held across the gap is `down` but never
   *               `pressed` (§540's adopt, reached through the removal path); the rest reference
   *               is re-sampled to wherever the sticks now are; and a stick that MOVED while the
   *               pad was away does not read as travel, so the prompts stay where the player left
   *               them.
   *   fails  on : RUN in-arm — the same replug with `_padResync` cleared before the poll, which
   *               must produce the phantom press. Without that clause "no press" would also be
   *               satisfied by a reconnect that delivered nothing at all.
   *   verdict   : passes on adopt, fails on press.
   */
  /* a button held right across the gap */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0);
    step(c, input, 5);
    slots[0].buttons[0] = { pressed: true, value: 1 };      // Cross held
    step(c, input, 5);
    slots[0] = null;
    step(c, input, 5);
    assert.equal(input.down('jump'), false, 'removal did not release the hold');
    const back = mkPad(0);
    back.buttons[0] = { pressed: true, value: 1 };           // still physically held on replug
    slots[0] = back;
    PIN(input); input.beginFrame(DT);
    const pressed = input.pressed('jump'), down = input.down('jump');
    input.endFrame();
    assert.equal(pressed, false,
      'a button that was never released produced a press on replug — the reconnect is re-pressing '
      + 'rather than adopting (§540)');
    /**
     * And it is not `down` either, which is the deliberate difference from §540's blur case and
     * was worth getting wrong once to find. A blur is the SAME device with the same conventions,
     * so a held control is adopted. A replug is a fresh enumeration: the thing now in slot 0 may
     * be a different controller entirely, and a control that is at 1.0 on its first poll is
     * exactly the shape H4 refuses to believe. Distrust wins over adoption when the device
     * identity is in question — the player releases and re-presses, and everything works.
     */
    assert.equal(down, false,
      'a control already at full on a RECONNECTED pad was believed. It cannot be distinguished '
      + 'from a trigger that rests at 1.0 (H4), and the pad may not even be the same one.');

    /* …and it works normally the moment the control proves it can rest. */
    back.buttons[0] = { pressed: false, value: 0 };
    PIN(input); input.beginFrame(DT); input.endFrame();
    back.buttons[0] = { pressed: true, value: 1 };
    PIN(input); input.beginFrame(DT);
    const rePressed = input.pressed('jump');
    input.endFrame();
    assert.equal(rePressed, true,
      'after releasing and pressing again on the reconnected pad, jump still did not fire — the '
      + 'trust rule has disabled the control rather than deferring to it');
  }

  /* the rest reference follows the new pad rather than the old one */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0);
    step(c, input, 10);
    assert.equal(input.lastDevice, 'kbm', 'a resting pad claimed the device; §541 R3 covers this');
    slots[0] = null;
    step(c, input, 5);
    const gone = input._padRest;
    assert.equal(gone, null, 'the rest reference survived the removal — a stick that moved while '
      + 'the pad was away will read as travel and steal the prompts');
    const back = mkPad(0);
    back.axes = [0, -0.30, 0, 0];                            // came back worn / moved while away
    slots[0] = back;
    step(c, input, 10);
    assert.equal(input.lastDevice, 'kbm',
      `a stick that moved while the pad was unplugged claimed the device on replug `
      + `(lastDevice '${input.lastDevice}') — the reference was not re-sampled`);
  }

  /**
   * RUN the counterexample. On a REPLUG the gate is `_padValue`'s trust, not `_padResync` — the
   * reconnected pad's controls have proved nothing yet, so they read 0 and never reach the edge
   * logic at all. (Written the other way round first, defeating `_padResync`, and it reproduced
   * nothing: the arm was ablating a mechanism that is not the one governing this path. §540's P5
   * owns the resync leg, on the blur case where it IS the gate.)
   *
   * So the honest ablation is the pre-§542 pipeline for this frame: no index-change branch, no
   * trust rule. Both defeated, the held control is believed and fires a real press.
   */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0);
    step(c, input, 5);
    slots[0].buttons[0] = { pressed: true, value: 1 };
    step(c, input, 5);
    slots[0] = null;
    step(c, input, 5);
    const back = mkPad(0);
    back.buttons[0] = { pressed: true, value: 1 };
    slots[0] = back;
    input._padLast = 0;                                      // pre-fix: removal was never noticed
    input._padTrust.add(0);                                  // pre-fix: no trust rule
    input._padResync = false;                                // pre-§540 re-discovery
    PIN(input); input.beginFrame(DT);
    const phantom = input.pressed('jump');
    input.endFrame();
    assert.equal(phantom, true,
      'with the index-change branch and the trust rule both defeated, the reconnected pad still '
      + 'produced no press — this arm cannot tell a guarded reconnect from one that delivers '
      + 'nothing at all (§418)');
  }
});

test('H3 two pads: slot 0 leaving does not hand its holds to slot 1', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : pad 0 holding forward while pad 1 sits idle; pad 0 removed, pad 1 still
   *               present — the poll re-points at pad 1 and `forward` is released rather than
   *               resolved against a controller that never pressed it.
   *   fails  on : RUN in-arm — the same swap with the index test defeated, which resolves pad 0's
   *               hold against pad 1's buttons. On these poses that happens to release too, so
   *               the arm ALSO drives the case where it does not: pad 1 holding a DIFFERENT
   *               action, which the pre-fix path silently attributes to the departed pad's latch.
   *   verdict   : passes on release-on-index-change, fails on inheritance. The second pose is
   *               what makes it discriminate — the first alone cannot, because both paths agree.
   */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0);
    step(c, input, 5);
    slots[0].buttons[12] = { pressed: true, value: 1 };      // forward on pad 0
    slots[1] = mkPad(1);
    step(c, input, 10);
    assert.equal(input.down('forward'), true, 'pad 0 never held forward; premise is stale');
    slots[0] = null;                                          // pad 0 yanked, pad 1 remains
    step(c, input, 30);
    assert.equal(input._padIndex, 1, 'the poll did not move to the remaining pad');
    assert.equal(input.down('forward'), false,
      'pad 0 is gone and its hold is still down, resolved against a pad that never pressed it');
    assert.equal(c.speedXZ(), 0, 'Sly kept running on a controller that left');
  }

  /* the pose where the two paths disagree */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0);
    slots[1] = mkPad(1);
    step(c, input, 5);
    slots[0].buttons[12] = { pressed: true, value: 1 };      // forward, on pad 0
    step(c, input, 10);
    slots[1].buttons[0] = { pressed: true, value: 1 };       // pad 1 is holding CROSS, not up
    slots[0] = null;
    step(c, input, 10);
    assert.equal(input.down('forward'), false, 'the departed pad\'s direction survived the swap');
    console.log(`[H3] after the swap: forward ${input.down('forward')} · jump ${input.down('jump')} `
      + `· _padIndex ${input._padIndex} (pad 1 holds Cross, and it is adopted, not pressed)`);
  }
});

/* ====================================================================== */
/* H4 — the analogue triggers and their rest conventions                   */
/* ====================================================================== */

test('H4 triggers: a control is not believed until it has been seen at rest', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : L2/R2 resting at 0.0 (the W3C convention) and at −1.0 (a signed axis passed
   *               through unmapped) behaving normally — quiet at rest, pressing when pulled,
   *               releasing when let go, with the existing hysteresis intact.
   *   fails  on : RUN in-arm — the SAME pad with triggers resting at +1.0 and at 0.5, which on
   *               the shipped code before §542 read as `crouch` and `focus` held from the first
   *               frame (state 'crouch', timeScale 0.35) and as a permanent latch after the first
   *               real pull respectively. Both are driven, and the pre-fix behaviour is
   *               reconstructed in-arm by seeding `_padTrust` so the trust rule cannot fire.
   *   verdict   : passes on a conforming rest, fails on a non-conforming one — and, critically,
   *               a WORKING trigger still presses and releases, which is the clause that stops
   *               this being satisfied by disabling L2/R2 altogether.
   *   does NOT  : discriminate which convention a real DS4 reports through a real browser. All
   *   discrim.    four rest values here are constructed. `gp.mapping` is not consulted by the code
   *               and is not consulted here either — `mapping: 'standard'` is a claim a
   *               non-conformant pad makes too, which is why the rule is behavioural.
   */
  const rows = [];
  for (const [name, rest, believable] of [
    ['W3C standard', 0, true],
    ['signed axis, unmapped', -1, true],
    ['inverted axis', 1, false],
    ['half-scaled axis', 0.5, false],
  ]) {
    const { c, input } = await sim();
    slots[0] = mkPad(0, { restTrigger: rest });
    step(c, input, 10);
    const atRest = { crouch: input.down('crouch'), focus: input.down('focus'), st: c.stateName, ts: c.engine.timeScale };
    /* §682: `focus` no longer sits on a trigger at all, so every `focus` reading in this arm is
       now a check that it CANNOT be reached from one — which is the stronger claim. */
    assert.equal(atRest.crouch, false,
      `triggers resting at ${rest} pressed 'crouch' with nobody touching the pad — Sly is crouched `
      + 'from the first frame');
    assert.equal(atRest.focus, false,
      `triggers resting at ${rest} pressed 'focus' — the whole game is in Thief-o-Vision slow-mo `
      + `(timeScale ${atRest.ts}) before the player has touched anything`);

    /* now pull them fully, then let go back to rest */
    slots[0].buttons[6] = { pressed: true, value: 1 };
    slots[0].buttons[7] = { pressed: true, value: 1 };
    step(c, input, 6);
    const pulled = { crouch: input.down('crouch'), focus: input.down('focus') };
    slots[0].buttons[6] = { pressed: false, value: rest };
    slots[0].buttons[7] = { pressed: false, value: rest };
    step(c, input, 6);
    const released = { crouch: input.down('crouch'), focus: input.down('focus') };

    if (believable) {
      assert.ok(pulled.crouch,
        `a conforming trigger resting at ${rest} did not press when pulled — the trust rule has `
        + 'disabled L2 instead of protecting it, which is worse than the bug it fixes');
      assert.ok(!released.crouch,
        `a conforming trigger resting at ${rest} stayed held after release`);
    } else {
      assert.ok(!released.crouch,
        `a trigger resting at ${rest} stayed held after the player let go — above triggerOff `
        + `${INPUT_TUNE.triggerOff}, the hysteresis latches it on for the rest of the session`);
    }
    /* §682, pinned where it matters most: pulling BOTH triggers to full must never reach
       Thief-o-Vision, because no trigger is bound to it any more. */
    assert.equal(pulled.focus, false,
      `pulling the triggers at rest ${rest} reached 'focus' — §682 moved it off R2 precisely so a `
      + 'finger resting on a trigger cannot quiet the score');
    rows.push({ name, rest, atRest, pulled, released });
  }

  /* RUN the pre-fix behaviour: seed trust so the rule cannot fire. */
  {
    const { c, input } = await sim();
    slots[0] = mkPad(0, { restTrigger: 1 });
    /* Seed trust AFTER the first poll: `beginFrame` clears it when the pad index changes, so
       seeding before the pad is ever seen is wiped and the ablation reproduces nothing. */
    step(c, input, 1);
    for (const i of [...(PAD_BINDINGS.crouch || []), ...(PAD_BINDINGS.focus || [])]) input._padTrust.add(i);
    step(c, input, 10);
    assert.equal(input.down('crouch'), true,
      'the pre-fix path did NOT read a +1 rest as a press, so this arm is not reproducing the '
      + 'defect it guards against (§418)');
    /* §682: the slow-mo half of this symptom is gone, and NOT because the trust rule closed it —
       `focus` no longer sits on a trigger, so no trigger rest can reach Thief-o-Vision. Asserted
       as the new invariant rather than deleted, so re-binding it onto a trigger reddens here. The
       `crouch` clause above still reproduces the defect, which is what keeps this arm honest. */
    assert.equal(c.engine.timeScale, 1,
      'a +1 trigger rest reached Thief-o-Vision — focus is back on a trigger and §682 is undone');
    console.log(`\n[H4] ablation — pre-fix with triggers resting at +1: crouch ${input.down('crouch')} `
      + `· focus ${input.down('focus')} · state '${c.stateName}' · timeScale ${c.engine.timeScale}`);
  }

  console.log('[H4] rest conventions, on the shipped code:\n' + rows.map((r) =>
    `  ${r.name.padEnd(22)} rest ${String(r.rest).padStart(4)}  at rest crouch=${r.atRest.crouch} focus=${r.atRest.focus}`
    + `  pulled crouch=${r.pulled.crouch}  released crouch=${r.released.crouch}`).join('\n')
    + '\n  a conforming trigger is unaffected; a non-conforming one is inert rather than stuck on');
});
