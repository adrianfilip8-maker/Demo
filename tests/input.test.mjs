import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Input — the four guarantees, exercised through the real event path.
 *
 * `src/core/Input.js` went from 227 to 724 lines with no test of any kind: per-source hold
 * tracking, gamepad sticks and triggers, the buffer's move off the wall clock, rebinding, and a
 * focus-loss fix that changed a `clear()` into a release. Every existing suite that mentions
 * "Input" uses a hand-written `StubInput` instead (`level.test.mjs:93`, `targets.test.mjs:47`),
 * so the real class had never been constructed by a test at all.
 *
 * ── Why a DOM shim and not internals ────────────────────────────────────────────────────────
 *
 * The constructor calls `_bind()`, which registers nine listeners on `window`, `document` and the
 * canvas. Rather than reach past that and poke `_press()` directly, the shim below *keeps* the
 * handlers and lets the tests dispatch real event objects — so what is under test is the whole
 * path a key actually takes, `keydown` → `_keyToActions` → `_press` → `down()`, including the
 * `e.repeat` guard and the swallow list. Testing `_press` directly would pass just as happily
 * with the listener registration deleted.
 *
 * ── The four guarantees, quoted from the file's own header ──────────────────────────────────
 *
 *   (1) the buffer is measured on the GAME clock, not the wall clock;
 *   (2) `down()` is the union of four independent hold sources;
 *   (3) losing focus RELEASES held actions — it does not forget them;
 *   (4) analog triggers behave like buttons, via hysteresis.
 *
 * Each has a test below, and each is a claim that would regress silently: nothing crashes when a
 * buffer starts reading `performance.now()` again, and nothing crashes when a release becomes a
 * `clear()`. The symptom is a jump that eats itself after a pause, which is exactly the class of
 * bug that gets attributed to "feel" and never gets found.
 */

/* ====================================================================== */
/* DOM shim                                                                */
/* ====================================================================== */

/** An EventTarget that keeps its handlers so a test can fire them. */
function target(name) {
  const handlers = new Map();
  return {
    _name: name,
    _handlers: handlers,
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    removeEventListener(type, fn) { handlers.get(type)?.delete(fn); },
    fire(type, ev = {}) {
      let prevented = false;
      const e = { preventDefault() { prevented = true; }, ...ev };
      for (const fn of handlers.get(type) || []) fn(e);
      return prevented;
    },
    listens(type) { return (handlers.get(type)?.size || 0) > 0; },
  };
}

let pads = [];

const canvas = target('canvas');
globalThis.window = target('window');
globalThis.document = Object.assign(target('document'), { pointerLockElement: null });
/* Node 22 ships a real `navigator` global, and it is getter-only — a plain assignment throws.
   defineProperty is the only way to put a `getGamepads` in front of `Input._findPad`. */
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => pads }, configurable: true, writable: true,
});

/* Imported AFTER the globals exist: `_bind()` runs in the constructor, not on a later init. */
const { Input, INPUT_TUNE, KEY_BINDINGS, PAD_BINDINGS, PAD_AXES } =
  await import('../src/core/Input.js');

function makeInput() {
  pads = [];
  const events = [];
  const engine = {
    canvas,
    dt: 1 / 60,
    emit(evt, p) { events.push({ evt, p }); },
  };
  // Each Input adds its own listeners to the shared shim; drop the previous set first.
  for (const t of [window, document, canvas]) t._handlers.clear();
  const input = new Input(engine);
  return { input, engine, events };
}

const keyDown = (code, extra = {}) => window.fire('keydown', { code, ...extra });
const keyUp = (code) => window.fire('keyup', { code });

/** A gamepad in the shape `navigator.getGamepads()` returns. */
function pad({ buttons = [], axes = [0, 0, 0, 0] } = {}) {
  return { connected: true, buttons, axes };
}

/** Which physical key/button the defaults put an action on, so the tests never hard-code one. */
function firstKey(input, action) {
  const k = input.keysFor(action)[0];
  assert.ok(k, `no default keyboard binding for "${action}" — the test's premise is stale`);
  return k;
}

/* ====================================================================== */
/* 0 — the shim really is the real path                                    */
/* ====================================================================== */

test('wiring: the constructor registers the listeners the tests below fire through', () => {
  const { input } = makeInput();
  for (const t of ['keydown', 'keyup', 'mouseup', 'mousemove', 'blur']) {
    assert.ok(window.listens(t), `window has no ${t} listener — _bind() no longer registers it`);
  }
  assert.ok(canvas.listens('mousedown'), 'canvas has no mousedown listener');
  assert.ok(canvas.listens('wheel'), 'canvas has no wheel listener');
  assert.ok(document.listens('pointerlockchange'), 'document has no pointerlockchange listener');

  // …and a key really does travel the whole path.
  const jump = firstKey(input, 'jump');
  input.beginFrame(1 / 60);
  keyDown(jump);
  assert.ok(input.down('jump'), `a ${jump} keydown did not reach down('jump')`);
});

/* ====================================================================== */
/* 0b — the edge stamp, at the DOM's real timing (§468)                    */
/* ====================================================================== */

/**
 * `beginFrame()` runs before the module loop and increments `_frame`; a DOM event can only ever
 * dispatch BETWEEN frames. Under the original stamp (`this._frame`) an edge therefore named a
 * frame whose reads had already happened, and no exact-frame `pressed()`/`released()` in the
 * game could ever observe a real keyboard or mouse edge — measured live in the browser
 * (`tools/pressprobe.mjs`): a real click's press observed true 0 of 117 module-loop reads, a
 * real KeyE 0 of 27, the same press synthesised inside the frame 1 of 23 with the combo firing.
 *
 * DOMAIN (§418.3). Failing input, RUN here: the same-frame read a browser can never serve — the
 * dispatch-then-read-without-beginFrame pattern this file itself used to treat as the passing
 * case. Passing input: the read on the first frame that begins after the event.
 * Passes on: `_frame + 1` stamps for DOM/inject sources. Fails on: the shipped `_frame` stamp
 * (third assert below reddens — the edge never becomes visible). Does not discriminate: pad
 * edges (`_padButtons` stamps at the frame boundary inside `beginFrame`) and `buffered()`,
 * which runs on the game clock and never depended on the stamp.
 */
test('timing: a between-frames edge is pressed on the NEXT frame, exactly once', () => {
  const { input } = makeInput();
  const jump = firstKey(input, 'jump');

  input.beginFrame(1 / 60);                 // frame k, whose reads are happening now
  assert.equal(input.pressed('jump'), false);
  keyDown(jump);                            // arrives after frame k's reads, before k+1
  assert.equal(input.pressed('jump'), false,
    'a between-frames event was visible to the frame that had already run — no browser delivers that');
  assert.ok(input.down('jump'), 'the hold must be live immediately — holds are level, not edge');

  input.beginFrame(1 / 60);                 // frame k+1: the first reads that can see it
  assert.ok(input.pressed('jump'), 'the edge missed the first frame that could observe it');

  input.beginFrame(1 / 60);                 // frame k+2
  assert.equal(input.pressed('jump'), false, 'the edge lasted more than one frame');

  keyUp(jump);
  assert.equal(input.released('jump'), false, 'a release edge visible before any frame began');
  input.beginFrame(1 / 60);
  assert.ok(input.released('jump'), 'the release edge missed the first frame that could observe it');
});

/* ====================================================================== */
/* 1 — the buffer runs on the game clock                                   */
/* ====================================================================== */

/**
 * Guarantee (1). The buffer used to be measured against `performance.now()`, which meant it
 * expired in *wall* time — so a press made just before a pause, a hitch, or Thief-o-Vision's
 * 0.35× slowdown was silently thrown away, while `TUNE.coyote` and every lockout around it kept
 * running on the scaled clock. `beginFrame(dt)` now advances `input.clock` by the engine's
 * already-scaled dt, so the two agree by construction.
 *
 * The paused arm is what makes this decisive, and it only does so if it burns MORE real time than
 * the buffer window — the first draft ran a fixed 1000 iterations, which took 2 ms, and a
 * wall-clock buffer would have survived that just as comfortably. A fixed iteration count is the
 * wrong instrument here: what has to be spent is real milliseconds, so the loop is bounded by the
 * real clock and the test asserts it actually spent them.
 */
test('buffer: measured on the game clock, so a pause cannot drain it', () => {
  const { input } = makeInput();
  const jump = firstKey(input, 'jump');
  const ms = INPUT_TUNE.bufferMs;

  input.beginFrame(1 / 60);
  keyDown(jump);
  keyUp(jump);

  // Paused: every frame is dt = 0, held until well past the window in REAL time.
  const t0 = Date.now();
  const spend = ms * 1.5;
  let frames = 0;
  while (Date.now() - t0 < spend) { input.beginFrame(0); frames++; }
  const realMs = Date.now() - t0;

  assert.ok(realMs > ms,
    `the paused arm spent only ${realMs} ms of real time against a ${ms} ms window — it cannot ` +
    'tell a game clock from a wall clock, which is the entire question');
  assert.equal(input.clock, 1 / 60, `the clock advanced ${input.clock}s while paused`);
  assert.ok(input.bufferedPeek('jump'),
    `a buffered press was lost across ${realMs} ms of paused real time — the buffer is back on ` +
    'the wall clock');

  // Now spend the window in GAME time and it must expire — otherwise the test proves only that
  // the buffer never expires, which would pass with the whole mechanism deleted.
  const step = 1 / 60;
  const need = Math.ceil((ms / 1000) / step) + 1;
  for (let i = 0; i < need; i++) input.beginFrame(step);
  assert.equal(input.bufferedPeek('jump'), false,
    `the buffer survived ${(need * step * 1000).toFixed(0)} ms of game time against a ${ms} ms window`);

  console.log(`\n[buffer] ${ms} ms window · ${frames} paused frames spent ${realMs} ms of real ` +
    `time and 0 ms of game time · expired after ${(need * step * 1000).toFixed(0)} ms scaled`);
});

test('buffer: buffered() consumes, bufferedPeek() does not, clearBuffer() forgets', () => {
  const { input } = makeInput();
  const jump = firstKey(input, 'jump');

  input.beginFrame(1 / 60);
  keyDown(jump);
  assert.ok(input.bufferedPeek('jump'));
  assert.ok(input.bufferedPeek('jump'), 'peek consumed the press');
  assert.ok(input.buffered('jump'), 'buffered() did not see the press');
  assert.equal(input.buffered('jump'), false, 'buffered() fired twice for one press');

  /* `Controller.teleport()` calls clearBuffer for the reason named at its use site: the shot
     harness must not arrive somewhere new already holding an input made somewhere else.
     The keyUp matters: `_press` returns early for a source that already holds the action, so
     without it the second keyDown is a silent no-op and this arm would prove nothing. */
  keyUp(jump);
  keyDown(jump);
  assert.ok(input.bufferedPeek('jump'));
  input.clearBuffer();
  assert.equal(input.bufferedPeek('jump'), false, 'clearBuffer() left the press behind');
});

/* ====================================================================== */
/* 2 — down() is the union of four sources                                 */
/* ====================================================================== */

/**
 * Guarantee (2). Two devices can hold the same action, and releasing one must not release the
 * action — the naive single `Set` drops the hold the moment either device lets go, so a player
 * holding sprint on the pad while tapping a key would stutter.
 */
test('sources: a hold survives one device releasing while another still holds it', () => {
  const { input } = makeInput();
  const jump = firstKey(input, 'jump');
  const padJump = PAD_BINDINGS.jump?.[0];
  assert.ok(Number.isFinite(padJump), 'jump has no pad binding — the test premise is stale');

  const buttons = [];
  buttons[padJump] = { pressed: true, value: 1 };
  pads = [pad({ buttons })];

  input.beginFrame(1 / 60);            // pad press
  keyDown(jump);                       // …and a key on the same action
  assert.ok(input.down('jump'));

  keyUp(jump);
  assert.ok(input.down('jump'), 'releasing the key dropped the hold while the pad still held it');

  buttons[padJump] = { pressed: false, value: 0 };
  input.beginFrame(1 / 60);
  assert.equal(input.down('jump'), false, 'the action stayed down after every source let go');
});

test('sources: a second device pressing an already-held action is not a new press', () => {
  const { input } = makeInput();
  const jump = firstKey(input, 'jump');

  /* Dispatch BETWEEN frames — the only timing a browser can deliver (§468) — and read on the
     frame that follows. This arm used to dispatch after `beginFrame` and assert `pressed` in the
     same frame, which is the StubInput/pad timing no DOM event has: the old first assert passed
     against a stamp under which a real click was never seen at all (0 of 117 live reads,
     `tools/pressprobe.mjs`). */
  keyDown(jump);
  input.beginFrame(1 / 60);
  assert.ok(input.pressed('jump'), 'the first press did not register on the frame after arrival');

  input.inject('jump', true);          // a second source, same action, still held by the key
  input.beginFrame(1 / 60);
  assert.equal(input.pressed('jump'), false,
    'a second device holding an already-held action fired a fresh press — a double-jump bug');
});

/* ====================================================================== */
/* 3 — focus loss releases, it does not forget                             */
/* ====================================================================== */

/**
 * Guarantee (3), and the one this file most exists for. `_dropAllHeld` used to call
 * `this._down.clear()`. That empties the set without ever running the release path, so a state
 * machine waiting on `released('jump')` — a variable-height jump cut, a charged attack — waits
 * forever, and the *next* press after refocusing is the one that finally resolves it. Clearing
 * and releasing are indistinguishable from `down()`; only `released()` tells them apart, so that
 * is what this asserts.
 */
test('focus: losing focus RELEASES held actions rather than forgetting them', () => {
  const { input } = makeInput();
  const jump = firstKey(input, 'jump');

  keyDown(jump);
  input.beginFrame(1 / 60);
  assert.ok(input.down('jump'));

  window.fire('blur');                  // between frames, like a real alt-tab (§468)
  assert.equal(input.down('jump'), false, 'blur left the action held');
  input.beginFrame(1 / 60);
  assert.ok(input.released('jump'),
    'blur cleared the hold without releasing it — anything waiting on released() waits forever');
});

test('focus: leaving pointer lock releases too, and announces the change once', () => {
  const { input, events } = makeInput();
  const sneakKey = firstKey(input, 'sneak');

  document.pointerLockElement = canvas;
  document.fire('pointerlockchange');
  assert.equal(input.locked, true, 'acquiring lock did not set `locked`');

  keyDown(sneakKey);
  input.beginFrame(1 / 60);
  assert.ok(input.down('sneak'));

  document.pointerLockElement = null;
  document.fire('pointerlockchange');   // between frames — lock changes are DOM events too (§468)
  assert.equal(input.locked, false);
  input.beginFrame(1 / 60);
  assert.ok(input.released('sneak'), 'leaving pointer lock forgot the hold instead of releasing it');
  assert.deepEqual(events.map((e) => e.evt), ['pointerlock', 'pointerlock']);
});

/* ====================================================================== */
/* 4 — trigger hysteresis                                                  */
/* ====================================================================== */

/**
 * Guarantee (4). `triggerOn` 0.55 / `triggerOff` 0.35 exist so a finger resting on an analog
 * trigger cannot buzz the action on and off every frame. The test walks the trigger through the
 * gap in both directions: the interesting values are the ones strictly between the thresholds,
 * where the correct answer depends on which way you came from.
 */
test('triggers: hysteresis, so a finger resting between the thresholds cannot buzz', () => {
  const { input } = makeInput();
  const [action, list] = Object.entries(PAD_BINDINGS)
    .find(([, l]) => l.some((i) => i === 6 || i === 7)) || [];
  assert.ok(action, 'no action is bound to an analog trigger (button 6/7) — premise is stale');

  const buttons = [];
  const set = (v) => { for (const i of list) buttons[i] = { pressed: v > 0.5, value: v }; };
  pads = [pad({ buttons })];
  const step = (v) => { set(v); input.beginFrame(1 / 60); return input.down(action); };

  const on = INPUT_TUNE.triggerOn, off = INPUT_TUNE.triggerOff;
  const mid = (on + off) / 2;          // 0.45 — inside the gap, both answers "look" right

  assert.equal(step(mid), false, `rising to ${mid} pressed before reaching triggerOn ${on}`);
  assert.equal(step(on - 0.01), false, 'pressed just short of the threshold');
  assert.equal(step(on), true, `reaching triggerOn ${on} did not press`);
  assert.equal(step(mid), true, `falling back to ${mid} released before reaching triggerOff ${off}`);
  assert.equal(step(off + 0.01), true, 'released just short of triggerOff');
  assert.equal(step(off), false, `dropping to triggerOff ${off} did not release`);

  console.log(`\n[triggers] "${action}" on buttons ${list.join(',')} · on ${on} / off ${off} · ` +
    `held through ${mid} on the way down, quiet through ${mid} on the way up`);
});

/* ====================================================================== */
/* 5 — the stick, and the one thing deliberately NOT taken from reference  */
/* ====================================================================== */

/**
 * `_padStick`'s comment argues at length against `player__sly.gd`'s half-pressure split, which
 * snaps everything past 0.5 deflection to a full-magnitude 1.0 and makes the left stick a
 * two-state switch. Our controller multiplies `TUNE.runSpeed` by this magnitude *continuously*,
 * so the property that matters is strict monotonicity across the whole travel — that is exactly
 * what the reference's version does not have, and it is worth an assertion rather than a comment.
 */
test('stick: magnitude is continuous and strictly monotonic across the whole travel', () => {
  const { input } = makeInput();
  const dz = INPUT_TUNE.deadzone, floor = INPUT_TUNE.moveFloor;

  const magAt = (v) => {
    const axes = [];
    axes[PAD_AXES.moveX] = 0;
    axes[PAD_AXES.moveY] = -v;         // stick reports +down on axis 1; forward is −
    pads = [pad({ axes })];
    input.beginFrame(1 / 60);
    return Math.hypot(input.move.x, input.move.y);
  };

  assert.equal(magAt(dz), 0, `a stick at the deadzone edge ${dz} produced movement`);
  assert.ok(Math.abs(magAt(dz + 1e-9) - 0) < 1e-6 || magAt(dz + 1e-9) >= floor - 1e-6,
    'the first movement past the deadzone did not start at moveFloor — there is a second step');

  const xs = [0.25, 0.4, 0.55, 0.7, 0.85, 1.0];
  const ys = xs.map(magAt);
  for (let i = 1; i < ys.length; i++) {
    assert.ok(ys[i] > ys[i - 1] + 1e-9,
      `magnitude did not increase from ${xs[i - 1]} (${ys[i - 1].toFixed(4)}) to ${xs[i]} ` +
      `(${ys[i].toFixed(4)}) — this is the reference's two-state switch, which _padStick refuses`);
  }
  assert.ok(Math.abs(ys[ys.length - 1] - 1) < 1e-6, `full deflection gave ${ys[ys.length - 1]}, not 1`);

  console.log(`\n[stick] deadzone ${dz} floor ${floor} · ` +
    xs.map((x, i) => `${x}→${ys[i].toFixed(3)}`).join(' '));
});

test('stick: digital input wins outright — the stick only speaks when keys are quiet', () => {
  const { input } = makeInput();
  const fwd = firstKey(input, 'forward');

  const axes = [];
  axes[PAD_AXES.moveX] = 0.5;
  axes[PAD_AXES.moveY] = 0.5;          // a stick pushed back-and-right, at partial magnitude
  pads = [pad({ axes })];

  input.beginFrame(1 / 60);
  keyDown(fwd);
  input.beginFrame(1 / 60);

  assert.equal(input.move.x, 0, 'the stick overrode a held key on X');
  assert.equal(input.move.y, 1, 'a held forward key did not give a full-magnitude digital intent');
});

/* ====================================================================== */
/* 6 — rebinding cannot strand a held key                                  */
/* ====================================================================== */

/**
 * `bind()` calls `_releaseSource('key')` for a reason its own comment states: a key held while it
 * is rebound away has no path back to a `keyup` that maps anywhere, so without the sweep the
 * action stays down forever. That is a soft-lock reachable from a settings menu.
 */
test('rebinding: a key held across a rebind cannot stay down forever', () => {
  const { input } = makeInput();
  const jump = firstKey(input, 'jump');

  input.beginFrame(1 / 60);
  keyDown(jump);
  assert.ok(input.down('jump'));

  input.bind('jump', 'KeyJ');           // the held key now maps nowhere
  assert.equal(input.down('jump'), false, 'the stranded hold survived the rebind — soft-lock');

  keyUp(jump);                          // the eventual keyup lands on nothing, harmlessly
  input.beginFrame(1 / 60);
  keyDown('KeyJ');
  assert.ok(input.down('jump'), 'the new binding does not press the action');

  input.resetBindings();
  assert.deepEqual(input.keysFor('jump'), KEY_BINDINGS.jump,
    'resetBindings did not restore the exported default for jump');
  // The live map must be a clone, never an alias — a rebind that mutated the export would leak
  // into every later Input and into any module that imports the defaults to render a menu.
  assert.notEqual(input.keysFor('jump'), KEY_BINDINGS.jump, 'keysFor returned the export itself');
  input.bind('jump', 'KeyZ');
  assert.deepEqual(KEY_BINDINGS.jump, ['Space'], 'a rebind mutated the exported KEY_BINDINGS');
});

test('rebinding: conflicts() finds a double-bound key and describe() names every device', () => {
  const { input } = makeInput();
  /* `conflicts()` returns `{ key: [actions] }`, not a list — a rebinding UI wants to index it. */
  assert.deepEqual(input.conflicts(), {}, 'the shipped default bindings conflict with each other');

  const jump = firstKey(input, 'jump');
  input.addBinding('sneak', jump);
  const c = input.conflicts();
  assert.deepEqual(Object.keys(c), [jump], `conflicts() reported ${JSON.stringify(c)}`);
  assert.deepEqual([...c[jump]].sort(), ['jump', 'sneak']);

  // describe() is what a prompt renders, so it must name the pad as well as the key. `jump` is
  // Space on the keyboard and button 0 on the pad — which §516 names Cross, not the Xbox 'A'
  // the scaffold shipped: the mapping is Sly 2's, so the vocabulary is the DualShock's.
  const d = input.describe('jump');
  assert.ok(d.includes('Space'), `describe('jump') = "${d}" — the keyboard binding is missing`);
  assert.ok(d.includes('Cross'), `describe('jump') = "${d}" — the pad binding is missing or mis-labelled`);
});

/* ====================================================================== */
/* 7 — the swallow list is derived, not hard-coded                         */
/* ====================================================================== */

/**
 * The file claims the set of keys whose default browser action is suppressed is "derived from the
 * live bindings rather than hard-coded, so rebinding `binocu` off Tab stops swallowing Tab". A
 * page that eats Tab forever after a rebind is a real accessibility failure, and the claim is one
 * `preventDefault` call away from being false.
 */
test('swallow: rebinding a swallowed key away stops the page swallowing it', () => {
  const { input } = makeInput();

  // Find whichever action currently owns Tab, if any.
  const owner = Object.keys(input.bindings())
    .find((a) => input.keysFor(a).includes('Tab'));
  assert.ok(owner, 'no action is bound to Tab — the premise of this test is stale');

  assert.equal(keyDown('Tab'), true, 'Tab was not swallowed while bound');
  input.bind(owner, 'KeyQ');
  assert.equal(keyDown('Tab'), false, `Tab is still swallowed after "${owner}" moved off it`);

  // F5/F11/F12 belong to the user and must never be swallowed, bound or not.
  for (const k of ['F5', 'F11', 'F12']) {
    assert.equal(keyDown(k), false, `${k} was swallowed — it belongs to the user, not the game`);
  }
});

/* ====================================================================== */
/* 8 — key repeat must not re-press                                        */
/* ====================================================================== */

test('repeat: an OS key-repeat storm produces exactly one press', () => {
  const { input } = makeInput();
  const jump = firstKey(input, 'jump');

  keyDown(jump);                        // between frames — the DOM's real timing (§468)
  input.beginFrame(1 / 60);
  assert.ok(input.pressed('jump'));

  for (let i = 0; i < 30; i++) keyDown(jump, { repeat: true });
  input.beginFrame(1 / 60);
  assert.equal(input.pressed('jump'), false,
    '30 OS repeat events fired a fresh press — held jump would re-trigger every frame');
  assert.ok(input.down('jump'), 'the repeats dropped the hold');
});

/* ====================================================================== */
/* 5 — the lock swallow spends itself: a failed grant must not eat clicks  */
/* ====================================================================== */

test('lock swallow: one click per acquisition attempt, and a failed grant opens the gate', async () => {
  /* ── WHY (§514) ───────────────────────────────────────────────────────────────────────────
   * `attack` rides the left button, and `_onMouseDown` swallows any unlocked left click for
   * which a lock request was ISSUED. `requestLock()` returning true never meant the grant
   * landed: with the grant pending, denied, or inside Chrome's ~1.25 s post-Esc cooldown, every
   * click was swallowed — measured live (tools/lockprobe.mjs L1: five real clicks, four
   * swallowed). On the user's machine that read as "attacks are not working", and the on-ring
   * attack bail was dead the same way.
   *
   * ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a rejecting lock request — click 1 swallowed (the acquisition click), click 2
   *               PRESSES while still unlocked. And a granting one — acquisition click
   *               swallowed, post-grant clicks press, and the latch is cleared by the grant.
   *   fails  on : RUN in-arm — the pre-fix contract, reconstructed by asserting what the old
   *               code did with the same inputs: with the latch removed (forced false), click 2
   *               is swallowed again.
   *   does NOT  : see Chrome's real cooldown timing, promise scheduling, or the 1.5 s pending
   *   discrim.    timer (jsdom has no timers wound here) — the error-event channel stands in
   *               for all three; lockprobe covers the real browser.
   */
  const { input } = makeInput();
  let presses = 0;
  const orig = input._press.bind(input);
  input._press = (a, src) => { if (a === 'attack') presses++; return orig(a, src); };

  /* the lock API exists and the request is issued, but the grant never lands */
  canvas.requestPointerLock = () => {};       // no promise, no lockchange — the pending case
  const click = () => { canvas.fire('mousedown', { button: 0 }); window.fire('mouseup', { button: 0 }); };

  click();                                    // acquisition click: swallowed by design
  assert.equal(presses, 0, 'the acquisition click must not swing the cane');
  document.fire('pointerlockerror', {});      // the grant fails
  click();
  assert.equal(presses, 1,
    'after a failed grant, an unlocked click was still swallowed — the latch is not opening the '
    + 'gate, and on hardware where the grant never lands this is "attacks are not working"');

  /* the counterexample, RUN: the pre-fix behaviour with the same inputs */
  input._lockFailed = false;                  // remove the latch: exactly the old gate condition
  click();
  assert.equal(presses, 1,
    'with the latch cleared the swallow must return — otherwise the fix rewrote the gate rather '
    + 'than adding the failure path, and the acquisition click is swinging the cane again');

  /* the third channel: a request that neither grants nor errors must open the gate by deadline.
     Real 1.6 s of wall clock, spent once, because this is the only test of the only channel that
     fires on a browser whose request just... pends (§514.2's lockprobe cannot reproduce it:
     headless grants at ~1 s). The deadline is armed ONCE per unlock episode — the first version
     re-armed per click and a player clicking every 250 ms postponed it forever. */
  input._lockFailed = false;
  canvas.fire('mousedown', { button: 0 }); window.fire('mouseup', { button: 0 });   // swallowed, arms the timer
  assert.equal(presses, 1, 'the re-acquisition click is the swallowed one');
  canvas.fire('mousedown', { button: 0 }); window.fire('mouseup', { button: 0 });   // still inside deadline: swallowed
  assert.equal(presses, 1, 'a click inside the deadline is still the acquisition attempt');
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(input._lockFailed, true,
    '1.6 s without a grant did not open the gate — the deadline channel is dead, and a browser '
    + 'whose request pends without erroring swallows clicks forever again');
  click();
  assert.equal(presses, 2, 'after the deadline, clicks must press');

  /* the grant path: lock lands, latch clears, presses flow while locked */
  document.pointerLockElement = canvas;
  document.fire('pointerlockchange', {});
  assert.equal(input.locked, true, 'the shim grant must be visible to _onLockChange');
  assert.equal(input._lockFailed, false, 'a real grant must clear the failure latch');
  click();
  assert.equal(presses, 3, 'locked clicks are ordinary presses');
  document.pointerLockElement = null;
  document.fire('pointerlockchange', {});
  delete canvas.requestPointerLock;
});

test('attack has a lock-independent keyboard route', () => {
  /* KeyF exists so the verb survives every pointer-lock state (§514) — and so a player trapped
     on a ring with a dead mouse still has three keyboard exits: Space, E, F. */
  const { input } = makeInput();
  const code = input.keysFor('attack')[0];
  assert.ok(code, 'attack has no keyboard binding — the lock swallow is single-point-of-failure again');
  keyDown(code);
  input.beginFrame(1 / 60);
  assert.equal(input.pressed('attack'), true,
    `a ${code} tap did not press attack on the frame after dispatch — the §468 stamp contract broke`);
  keyUp(code);
});

/* ====================================================================== */
/* 6 — §516: the PS4 pad — Sly mapping, analog gait, edges, device flag    */
/* ====================================================================== */

test('pad: the Sly 2 mapping holds, the stick is a genuine walk-to-run, and pad edges stamp the polled frame', () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a `standard`-mapping stub driven through the real `_findPad`/`beginFrame`
   *               path — Cross jumps, Square AND Triangle attack, Circle interacts, R1 glides;
   *               half deflection lands strictly between moveFloor and 1; inside the radial
   *               deadzone the stick is centred; the press is visible on the SAME frame the pad
   *               is polled (the §468 pad leg: `_padButtons` runs inside `beginFrame` after the
   *               increment, so pad stamps need no +1).
   *   fails  on : RUN in-arm — the diagonal at full deflection, which must NOT report magnitude
   *               1.41 (the square-gate bug the radial normalise exists to prevent); and a
   *               second press without release, which must NOT re-edge (hysteresis).
   *   does NOT  : discriminate a physical DualShock 4 — no controller exists in this container;
   *   discrim.    axis conventions and the browser's `standard` layout for real DS4 hardware are
   *               verified only by the user's re-test (sheet item 14). Nor does it cover the
   *               right stick's feel (sensitivity/expo are sheet material).
   */
  const { input, events } = makeInput();
  const B = (n) => { const b = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); if (n >= 0) b[n] = { pressed: true, value: 1 }; return b; };

  /* the mapping, row by row against the fetched Sly 2 layout (Input.js §516 block) */
  for (const [idx, action] of [[0, 'jump'], [2, 'attack'], [3, 'attack'], [1, 'interact'], [5, 'glide']]) {
    pads = [pad({ buttons: B(idx) })];
    input.beginFrame(1 / 60);
    assert.equal(input.pressed(action), true,
      `standard button ${idx} did not press '${action}' on its polled frame — the Sly 2 row `
      + '(Cross=jump, Square/Triangle=attack, Circle=interact, R1=paraglide) has drifted');
    pads = [pad({ buttons: B(-1) })];
    input.beginFrame(1 / 60);   // release so the next row re-edges
  }

  /* hysteresis: held is not a second press */
  pads = [pad({ buttons: B(0) })];
  input.beginFrame(1 / 60);
  assert.equal(input.pressed('jump'), true, 'first frame of the hold must edge');
  input.beginFrame(1 / 60);
  assert.equal(input.pressed('jump'), false, 'second frame of the same hold re-edged — pad hysteresis broke');
  assert.equal(input.down('jump'), true, 'held must stay down while pressed');
  pads = [pad({ buttons: B(-1) })];
  input.beginFrame(1 / 60);

  /* analog gait: the prize — magnitude survives to `move` with floor and radial deadzone */
  const dz = INPUT_TUNE.deadzone, floor = INPUT_TUNE.moveFloor;
  pads = [pad({ axes: [0, -(dz * 0.9), 0, 0] })];          // inside the deadzone: centred
  input.beginFrame(1 / 60);
  assert.equal(Math.hypot(input.move.x, input.move.y), 0,
    'a deflection inside the radial deadzone leaked into move');
  pads = [pad({ axes: [0, -0.5, 0, 0] })];                  // half forward
  input.beginFrame(1 / 60);
  const half = Math.hypot(input.move.x, input.move.y);
  assert.ok(half > floor && half < 1,
    `half deflection delivered ${half.toFixed(3)} — the walk-to-run gradient must sit strictly `
    + `between moveFloor ${floor} and 1, or the pad is the two-state switch the keyboard already is`);
  pads = [pad({ axes: [0, -1, 0, 0] })];                    // full forward
  input.beginFrame(1 / 60);
  assert.ok(Math.abs(Math.hypot(input.move.x, input.move.y) - 1) < 1e-6, 'full deflection must be 1');
  /* the counterexample, RUN: the diagonal must not exceed 1 */
  pads = [pad({ axes: [1, -1, 0, 0] })];
  input.beginFrame(1 / 60);
  assert.ok(Math.hypot(input.move.x, input.move.y) <= 1 + 1e-6,
    `full diagonal delivered ${Math.hypot(input.move.x, input.move.y).toFixed(3)} — the radial `
    + 'normalise is gone and diagonals run 41% faster');

  /* the device flag: pad flips it, a key flips it back, each change emits once */
  const flips = events.filter((e) => e.evt === 'inputDevice').map((e) => e.p);
  assert.equal(input.lastDevice, 'pad', 'pad input did not claim the device flag');
  /* Release the stick before the key: a stick still deflected re-claims the pad inside the same
     beginFrame — the arm's first version missed that, and it is CORRECT behaviour (a held stick
     is ongoing pad use), so the arm releases rather than the code special-casing. */
  pads = [pad({ axes: [0, 0, 0, 0] })];
  keyDown(firstKey(input, 'jump'));
  input.beginFrame(1 / 60);
  assert.equal(input.lastDevice, 'kbm', 'a key press did not reclaim the device flag');
  keyUp(firstKey(input, 'jump'));
  const after = events.filter((e) => e.evt === 'inputDevice').map((e) => e.p);
  assert.ok(after.length > flips.length && after[after.length - 1] === 'kbm',
    'the device change did not emit inputDevice — HUD prompts cannot follow the player\'s hands');
  const dupes = after.filter((d, i) => i > 0 && after[i - 1] === d);
  assert.equal(dupes.length, 0, 'inputDevice emitted without a change — the HUD re-renders every frame');
});
