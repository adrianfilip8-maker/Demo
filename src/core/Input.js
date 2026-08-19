/**
 * Input — keyboard, mouse and gamepad, mapped to named actions (AGENTS.md §6.1).
 *
 * Gameplay code never reads key codes, mouse buttons or pad indices. It asks for actions, and it
 * asks in one of four flavours, which matters a lot for platformer feel:
 *
 *   down(a)      held this frame, by ANY device
 *   pressed(a)   went down this frame            — use for jump, attack, roll
 *   released(a)  came up this frame              — use for variable jump height
 *   buffered(a)  went down within the last N ms  — use for jump so early presses aren't eaten
 *
 * `buffered` is the reason a jump pressed 100 ms before landing still fires. Without it the
 * game feels unresponsive in exactly the way players can't articulate but always notice.
 *
 * ── Three guarantees this layer makes, each of which was previously a defect ──────────────────
 *
 * 1. **The buffer runs on the GAME clock, not the wall clock.** It used to be `performance.now()`
 *    while every other timing in the moveset — `TUNE.coyote`, `hangLock`, `poleLockout`,
 *    `spireLockout`, `comboWindow`, `rollTime`, every `sm.time` gate — is accumulated from the
 *    engine's scaled `dt`. That made the jump buffer the only timing in the game measured on a
 *    different clock from the thing it is buffering *against*. Measured: at `timeScale` 1 a 140 ms
 *    buffer covers 1.466 m of a standard jump's descent (arrival 10.474 m/s). Under
 *    Thief-o-Vision (`Controller.TUNE.visionScale` 0.35) the same 140 ms of wall clock covers
 *    **0.513 m** — the buffer silently tightens by 2.86× exactly when the game has slowed down so
 *    the player can be precise. On the game clock the reach is 1.466 m at either speed, and the
 *    buffer widens under slow-mo in the same proportion as every other timer already does.
 *
 * 2. **A device may not release an action another device is holding.** Holds are tracked per
 *    source (`key` / `mouse` / `pad` / `inject`) and `down()` is the union. Letting go of the
 *    stick while W is held used to be able to emit a release for `forward`.
 *
 * 3. **Losing focus releases; it does not amnesia.** `blur` and pointer-lock loss used to
 *    `_down.clear()`, which dropped held state *without* recording a release — so
 *    `Controller.applyJumpCut`, which is edge-triggered on `released('jump')`, never saw the
 *    release and the arc kept its full height. They now go through `_release`, and they clear the
 *    buffer as well: game time does not advance while a tab is backgrounded, so with (1) a press
 *    made just before an alt-tab would otherwise still be live on return.
 *
 * ── Provenance: what was read while writing this, and what its licence is ─────────────────────
 *
 * The analog-stick handling and the pad button map below were written after reading the fan-made
 * Godot project <https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot> — specifically
 * `Scripts/player__sly.gd` (`_physics_process`: `left_stick_pressure`, `joystick_input`,
 * `left_stick_pressure_corrected`) and its `project.godot` `[input]` map.
 *
 * **Licence: none stated.** That repository contains no LICENSE, no COPYING and no licence
 * section — checked in its tree, not assumed. It is a fan work derived from Sucker Punch / Sony's
 * Sly Cooper. The same source and the same status are already recorded for the character mesh in
 * `public/assets/sly-godot/PROVENANCE.md`, and this is **not** equivalent to
 * `public/assets/kaykit/`, which carries an explicit CC0 grant.
 *
 * Nothing is pasted: GDScript→JS is a rewrite in any case, and what was taken is *structure*.
 * Every borrowed idea is commented at its use site with the source symbol, and so is every idea
 * that was read and **rejected** — see `_padStick`, where the reference's own numbers are
 * measurably worse than ours and the reason is stated rather than asserted.
 */

/* ---------------------------------------------------------------------------------------------
 * Bindings. All three tables are exported so an options screen can read them without importing
 * the class, and every one of them is *defaults* — the live map lives on the instance and is
 * editable through `bind()` / `unbind()` / `resetBindings()`.
 * ------------------------------------------------------------------------------------------- */

/** action -> KeyboardEvent.code[]. Physical codes, so AZERTY/QWERTZ get the same shape. */
export const KEY_BINDINGS = {
  forward:  ['KeyW', 'ArrowUp'],
  back:     ['KeyS', 'ArrowDown'],
  left:     ['KeyA', 'ArrowLeft'],
  right:    ['KeyD', 'ArrowRight'],
  jump:     ['Space'],
  sneak:    ['ShiftLeft', 'ShiftRight'],
  crouch:   ['ControlLeft', 'ControlRight'],
  interact: ['KeyE'],
  glide:    ['KeyQ'],
  binocu:   ['Tab'],
  recentre: ['KeyR'],
  freecam:  ['F1'],
  quality:  ['F2'],
  colliders:['F3'],
  pause:    ['KeyP'],
};

/**
 * action -> MouseEvent.button.
 *
 * `middle: 1` was removed: nothing read it, and unlike `quality` — which had an obvious intended
 * consumer and got one — there is no candidate verb for the middle button in this game. A
 * binding with no reader and no plausible reader is worse than no binding, because it is
 * published through `bindings()` and `describe()`, so a control list would offer the player a
 * button that does nothing.
 */
export const MOUSE_BINDINGS = {
  attack: 0,   // left  — cane combo / dive attack
  focus:  2,   // right — Thief-o-Vision + hook lock-on
};

/**
 * action -> W3C "Standard Gamepad" button index[].
 *
 * Adapted from the reference's `project.godot` `[input]` block, translated out of Godot's
 * `JoyButton` enum into the W3C layout the browser reports (they differ: Godot 9/10 are the
 * shoulders, W3C 4/5 are; Godot 6 is Start, W3C 9 is). Theirs, and what it maps to here:
 *
 *   ui_accept  Godot 0  (A/Cross)      → `jump`      — same button, same job
 *   square     Godot 2  (X/Square)     → `attack`    — same
 *   circle     Godot 1  (B/Circle)     → `interact`  — theirs fires the pickpocket swipe on it
 *   triangle   Godot 3  (Y/Triangle)   → `glide`     — theirs emits a signal; the verb is ours
 *   esc        Godot 6  (Start)        → `pause`     — W3C index 9
 *   shift      Godot 10 (R1)           → *not taken* — theirs is a **sprint**; ours is a sneak,
 *                                        which is the opposite modifier, so copying the button
 *                                        would have copied the label and not the behaviour.
 *
 * `sneak`/`crouch`/`focus`/`binocu`/`recentre` have no counterpart in the reference at all (it
 * has no stealth modifier, no lock-on and no Binocucom) and are ours. `focus` and `binocu` sit on
 * the analog triggers because both are hold-to-use.
 */
export const PAD_BINDINGS = {
  forward:  [12],       // d-pad up    — theirs binds the d-pad to ui_* alongside the stick
  back:     [13],
  left:     [14],
  right:    [15],
  jump:     [0],
  attack:   [2],
  interact: [1],
  glide:    [3],
  sneak:    [4],        // LB
  crouch:   [5],        // RB
  focus:    [6],        // LT, analog — thresholded below
  binocu:   [7],        // RT, analog
  recentre: [11],       // R3
  pause:    [9],        // Start
};

/** Standard Gamepad axis indices. 0/1 left stick, 2/3 right stick; +y is DOWN on both. */
export const PAD_AXES = { moveX: 0, moveY: 1, lookX: 2, lookY: 3 };

/**
 * Feel constants for the input layer itself. Everything here is a number a player would notice.
 *
 * `deadzone` 0.18 — the reference's own **non-movement** default (`project.godot` writes
 * `"deadzone": 0.2` on `esc`, `circle`, `square`, `shift`, `L1`, `L2`, `R2` and the right stick).
 * Its *movement* actions carry `"deadzone": 0.5`, which is why `left_stick_pressure` is either 0
 * or ≳0.5 there and the `if left_stick_pressure < 0.5` branch in `player__sly.gd` is very nearly
 * dead code: **the reference's left stick is effectively digital**, and its own `clamp(…, 0.25,
 * 1.0)` floor is inert as a result. That is the thing not to copy. 0.18 is under a Dual­Shock's
 * factory drift and leaves the whole useful range analog.
 *
 * `moveFloor` 0.25 — this *is* theirs (`left_stick_pressure_corrected = clamp(…, 0.25, 1.0)` in
 * `_physics_process`), and it is the good idea in that block. The smallest live deflection still
 * commits to a definite creep instead of a magnitude that reads as "not moving" to every
 * `wishMag > 0.12` predicate in the moveset. Theirs disables it in AIR; we do not, because our
 * `wishMag` scales the *target speed* continuously rather than picking a clip, so the only
 * thresholds the floor crosses are the "is he moving at all" ones — which it makes more correct
 * in the air as well as on the ground.
 *
 * The deadzone is **radial**, not per-axis: Godot applies its deadzone to each action
 * independently, which makes a square dead region and lets a diagonal past at 0.71 per axis when
 * neither axis alone would qualify. A circle is the honest shape for a round stick.
 */
export const INPUT_TUNE = {
  bufferMs:   140,     // = Controller.TUNE.jumpBufferMs; game milliseconds, not wall clock
  deadzone:   0.18,
  moveFloor:  0.25,
  triggerOn:  0.55,    // analog trigger press threshold …
  triggerOff: 0.35,    // … and its release threshold. Hysteresis, so a resting finger can't buzz.
  padLook:    2.6,     // rad/s at full right-stick deflection (~149°/s)
  padLookExp: 2.0,     // response exponent: fine near centre, quick at the rim
  padLookDead: 0.14,
};

const BUFFER_MS = INPUT_TUNE.bufferMs;

/** The four hold sources. `down()` is their union; see guarantee (2) in the header. */
const SOURCES = ['key', 'mouse', 'pad', 'inject'];

/**
 * Codes the browser will act on itself if we don't stop it — but only ever the ones we actually
 * bind, and never F5/F11/F12, which belong to the user and not to the game. Derived from the live
 * bindings rather than hard-coded, so rebinding `binocu` off Tab stops swallowing Tab.
 */
const SWALLOWABLE = new Set([
  'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2', 'F3', 'F4',
]);

/** Prettify a KeyboardEvent.code for a rebinding UI. */
function keyLabel(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `${code.slice(5)} Arrow`;
  const SPECIAL = {
    Space: 'Space', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter', Backspace: 'Backspace',
    ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
    AltLeft: 'L Alt', AltRight: 'R Alt', Minus: '-', Equal: '=', Backquote: '`',
  };
  return SPECIAL[code] || code;
}

const MOUSE_LABEL = ['LMB', 'MMB', 'RMB', 'Mouse 4', 'Mouse 5'];
const PAD_LABEL = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3',
  'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Guide',
];

export class Input {
  constructor(engine) {
    this.engine = engine;
    this.canvas = engine.canvas;

    this._down = new Set();           // union across sources
    this._src = {};
    for (const s of SOURCES) this._src[s] = new Set();

    this._pressedFrame = new Map();   // action -> frame index it went down
    this._releasedFrame = new Map();
    this._pressedAt = new Map();      // action -> game-clock seconds of last press
    this._frame = 0;

    /**
     * Game seconds since the module was created — the clock the buffer is measured on.
     * Advanced by `beginFrame(dt)`; see guarantee (1) in the header.
     */
    this.clock = 0;
    /** Real (unscaled) seconds elapsed over the last frame. Stick look uses this, not `clock`. */
    this.dtReal = 1 / 60;
    this._lastReal = -1;

    /** Accumulated look delta for this frame, in radians (mouse × sensitivity, or stick × dt). */
    this.look = { x: 0, y: 0 };
    /** Accumulated wheel delta for this frame. */
    this.zoom = 0;
    /**
     * Normalised movement intent in camera space, length ≤ 1. Digital sources (keys, d-pad) give
     * a unit vector; a stick gives its own magnitude after the deadzone and `moveFloor`.
     *
     * There is deliberately no companion `moveAnalog` flag saying which device produced it. The
     * first draft of this file had one, and it was **read by nothing** — the exact defect
     * `Controller.js` keeps a register of (`c.pole`, `lastWallRec`, `spireLaunch`, `hitWall`).
     * `wishMag` already carries everything gameplay needs, and a prompt that wants to say
     * "Space / A" should ask `describe(action)`, which is device-agnostic and always right.
     */
    this.move = { x: 0, y: 0 };

    this.sensitivity = 0.0022;
    this.invertY = false;
    this.locked = false;
    this.enabled = true;
    this.padEnabled = true;
    /** Live copy of INPUT_TUNE so a settings screen can nudge one number without a rebuild. */
    this.settings = { ...INPUT_TUNE };

    /* ---- live bindings. Cloned from the exported defaults; never aliased to them. ---- */
    this._keys = {};
    for (const [a, list] of Object.entries(KEY_BINDINGS)) this._keys[a] = [...list];
    this._mouse = { ...MOUSE_BINDINGS };
    this._pad = {};
    for (const [a, list] of Object.entries(PAD_BINDINGS)) this._pad[a] = [...list];

    this._keyToActions = new Map();
    this._swallow = new Set();
    this._rebuildKeyMap();

    /* ---- gamepad ---- */
    this._padIndex = -1;
    this._padHeld = new Set();        // action -> currently past the press threshold
    this._lockClick = false;          // the click that grabbed pointer lock must not also swing

    this._bind();
  }

  /* ==================================================================== */
  /* bindings                                                             */
  /* ==================================================================== */

  _rebuildKeyMap() {
    this._keyToActions.clear();
    this._swallow.clear();
    for (const [action, keys] of Object.entries(this._keys)) {
      for (const k of keys) {
        if (!this._keyToActions.has(k)) this._keyToActions.set(k, []);
        this._keyToActions.get(k).push(action);
        if (SWALLOWABLE.has(k)) this._swallow.add(k);
      }
    }
  }

  /** Replace an action's keyboard binding outright. `keys` may be a code or an array of codes. */
  bind(action, keys) {
    if (!action) return false;
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
    this._keys[action] = list;
    this._rebuildKeyMap();
    // A held key that no longer maps anywhere would stay down forever.
    this._releaseSource('key');
    return true;
  }

  /** Add one more key to an action without disturbing the ones already on it. */
  addBinding(action, key) {
    if (!action || !key) return false;
    const list = this._keys[action] || (this._keys[action] = []);
    if (!list.includes(key)) list.push(key);
    this._rebuildKeyMap();
    return true;
  }

  /** Drop one key from an action, or every key if `key` is omitted. */
  unbind(action, key) {
    const list = this._keys[action];
    if (!list) return false;
    if (key == null) this._keys[action] = [];
    else {
      const i = list.indexOf(key);
      if (i < 0) return false;
      list.splice(i, 1);
    }
    this._rebuildKeyMap();
    this._releaseSource('key');
    return true;
  }

  /** Rebind a pad action. `buttons` may be an index or an array of indices. */
  bindPad(action, buttons) {
    if (!action) return false;
    const list = (Array.isArray(buttons) ? buttons : [buttons]).filter((b) => Number.isInteger(b));
    this._pad[action] = list;
    this._releaseSource('pad');
    return true;
  }

  resetBindings() {
    this._keys = {};
    for (const [a, list] of Object.entries(KEY_BINDINGS)) this._keys[a] = [...list];
    this._mouse = { ...MOUSE_BINDINGS };
    this._pad = {};
    for (const [a, list] of Object.entries(PAD_BINDINGS)) this._pad[a] = [...list];
    this._rebuildKeyMap();
    this._releaseSource('key');
    this._releaseSource('pad');
    this._releaseSource('mouse');
  }

  /** Every action and what is currently on it, in one object a settings screen can render. */
  bindings() {
    const out = {};
    const names = new Set([
      ...Object.keys(this._keys), ...Object.keys(this._mouse), ...Object.keys(this._pad),
    ]);
    for (const a of names) {
      out[a] = {
        keys: [...(this._keys[a] || [])],
        mouse: this._mouse[a] ?? null,
        pad: [...(this._pad[a] || [])],
        label: this.describe(a),
      };
    }
    return out;
  }

  keysFor(action) { return [...(this._keys[action] || [])]; }

  /** Human-readable, e.g. `describe('jump')` -> "Space / A". */
  describe(action) {
    const parts = (this._keys[action] || []).map(keyLabel);
    const mb = this._mouse[action];
    if (Number.isInteger(mb)) parts.push(MOUSE_LABEL[mb] || `Mouse ${mb}`);
    for (const b of this._pad[action] || []) parts.push(PAD_LABEL[b] || `Pad ${b}`);
    return parts.join(' / ');
  }

  /**
   * Keys bound to more than one action, as `{ key: [actions] }`. Not an error — `crouch` and
   * `sneak` on the same stick modifier is a legitimate choice — but a rebinding UI has to be
   * able to say so before the player discovers it in a chase.
   */
  conflicts() {
    const out = {};
    for (const [k, actions] of this._keyToActions) if (actions.length > 1) out[k] = [...actions];
    return out;
  }

  /* ==================================================================== */
  /* DOM                                                                  */
  /* ==================================================================== */

  _bind() {
    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      // Tab would move focus out of the canvas and Space would scroll the page. Only swallow
      // codes we are actually bound to — see SWALLOWABLE.
      if (this._swallow.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      const actions = this._keyToActions.get(e.code);
      if (!actions) return;
      for (const a of actions) this._press(a, 'key');
    };

    this._onKeyUp = (e) => {
      const actions = this._keyToActions.get(e.code);
      if (!actions) return;
      for (const a of actions) this._release(a, 'key');
    };

    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      /* The click that acquires pointer lock is a *focus* click. It used to also swing the cane,
         so every return from the pause menu started with an attack. Only swallowed when a lock
         was actually requested — in an environment with no Pointer Lock API `locked` never
         becomes true, and swallowing unconditionally would mean the cane never swings at all. */
      if (!this.locked && e.button === 0 && this.requestLock()) { this._lockClick = true; return; }
      for (const [action, btn] of Object.entries(this._mouse)) {
        if (e.button === btn) this._press(action, 'mouse');
      }
    };

    this._onMouseUp = (e) => {
      if (this._lockClick && e.button === 0) { this._lockClick = false; return; }
      for (const [action, btn] of Object.entries(this._mouse)) {
        if (e.button === btn) this._release(action, 'mouse');
      }
    };

    this._onMouseMove = (e) => {
      if (!this.enabled) return;
      // Only consume movement while locked, otherwise the camera lurches when the
      // cursor re-enters the window.
      if (!this.locked) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      // Clamp per-event delta: some drivers emit a single enormous spike on lock acquisition.
      const cap = 200;
      this.look.x += Math.max(-cap, Math.min(cap, dx)) * this.sensitivity;
      this.look.y += Math.max(-cap, Math.min(cap, dy)) * this.sensitivity * (this.invertY ? -1 : 1);
    };

    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.zoom += Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100);
    };

    this._onContext = (e) => e.preventDefault();

    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.engine.emit('pointerlock', this.locked);
      // Drop held state so Sly doesn't keep sprinting into a wall while the menu is up — but as
      // a *release*, not an amnesia. See guarantee (3) in the header.
      if (!this.locked) this._dropAllHeld();
    };

    this._onBlur = () => { this._dropAllHeld(); };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('blur', this._onBlur);
  }

  /* ==================================================================== */
  /* hold bookkeeping                                                     */
  /* ==================================================================== */

  /**
   * ── THE EDGE STAMP, AND WHY IT IS `_frame + 1` FOR EVERY DOM SOURCE (§468) ─────────────────
   *
   * `pressed(a)` is an exact-frame compare against `_frame`, and `beginFrame()` increments
   * `_frame` BEFORE the module loop runs (main.js pumps `beginFrame → modules → endFrame`). A
   * DOM event can only ever dispatch BETWEEN frames — nothing yields inside the wrapper — so a
   * stamp of `this._frame` names a frame whose reads have already happened. Measured in the
   * live browser with the real rAF loop and pointer lock forced on (`tools/pressprobe.mjs`):
   * a real click's `_press('attack','mouse')` fired, and `pressed('attack')` was observed true
   * **0 of 117 module-loop reads**; a real KeyE, 0 of 27; the same press synthesised INSIDE the
   * frame after `beginFrame`, 1 of 23 and the combo started. **Every exact-frame edge from a
   * real keyboard or mouse was invisible to gameplay** — cane combo, dive attack, pole swing,
   * the interact/attack hook bail, F1, recentre — for the whole life of this file.
   *
   * No instrument could see it: `StubInput.hold()` marks pressed inside its own frame and the
   * pad path below stamps post-increment, so every driver this project has ever run stamps the
   * way the working device does, not the way the DOM does (§439). The browser probe exists
   * because of that, and `tests/input.test.mjs` arm 0b now dispatches with the DOM's real
   * timing.
   *
   * So: an edge that arrives between frames belongs to the NEXT frame — the first one whose
   * reads can possibly observe it. `pad` keeps `this._frame`: `_padButtons` is called inside
   * `beginFrame` after the increment, i.e. at the frame boundary itself, and stamping +1 there
   * would push a pad press one real frame late. `inject` and the DOM sources get +1.
   */
  _press(a, src = 'key') {
    const s = this._src[src];
    if (!s || s.has(a)) return;
    s.add(a);
    if (this._down.has(a)) return;          // another device already holds it — not a new press
    this._down.add(a);
    this._pressedFrame.set(a, src === 'pad' ? this._frame : this._frame + 1);
    this._pressedAt.set(a, this.clock);
  }

  _release(a, src = 'key') {
    const s = this._src[src];
    if (!s || !s.delete(a)) return;
    for (const k of SOURCES) if (this._src[k].has(a)) return;   // still held elsewhere
    if (!this._down.delete(a)) return;
    // Same stamp rule as `_press`, same measurement: a between-frames release edge stamped with
    // the frame that already ran can never be seen by `released()`.
    this._releasedFrame.set(a, src === 'pad' ? this._frame : this._frame + 1);
  }

  _releaseSource(src) {
    const s = this._src[src];
    if (!s) return;
    for (const a of [...s]) this._release(a, src);
    /* `_padHeld` is the pad's own memory of which actions are past the press threshold, and it
       must not outlive the hold set: `_padButtons` skips an action whose state has not *changed*,
       so a stale `_padHeld` entry would leave a physically-held button reading as released until
       the player let go of it and pressed again. */
    if (src === 'pad') this._padHeld.clear();
  }

  /**
   * Focus loss. Every held action is released properly, and the buffer goes with it: game time
   * does not advance while a tab is backgrounded, so a press made a moment before an alt-tab
   * would otherwise still be inside its window on return, minutes later.
   */
  _dropAllHeld() {
    for (const src of SOURCES) this._releaseSource(src);
    this._lockClick = false;
    this._pressedAt.clear();
  }

  /** Returns true when a lock was actually asked for, so the caller can swallow that click. */
  requestLock() {
    if (this.locked) return false;
    if (typeof this.canvas?.requestPointerLock !== 'function') return false;
    this.canvas.requestPointerLock();
    return true;
  }

  releaseLock() { document.exitPointerLock?.(); }

  /* ==================================================================== */
  /* gamepad                                                              */
  /* ==================================================================== */

  /** The pad we are listening to: the one we already had, else the first connected one. */
  _findPad() {
    const list = navigator?.getGamepads?.();
    if (!list) return null;
    const held = this._padIndex >= 0 ? list[this._padIndex] : null;
    if (held?.connected) return held;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g?.connected) { this._padIndex = i; return g; }
    }
    this._padIndex = -1;
    return null;
  }

  /** Buttons are `{pressed, value}` in every real implementation but plain numbers in some. */
  static _buttonValue(b) {
    if (b == null) return 0;
    if (typeof b === 'number') return b;
    if (typeof b.value === 'number') return b.value;
    return b.pressed ? 1 : 0;
  }

  /**
   * Digital state of every pad-bound action, with hysteresis so the analog triggers (`focus`,
   * `binocu`) behave like buttons instead of chattering at the threshold. Everything goes through
   * `_press`/`_release`, so `pressed`, `released` and `buffered` are identical on pad and
   * keyboard — that parity is the whole point of routing it here rather than polling in gameplay.
   */
  _padButtons(gp) {
    const on = this.settings.triggerOn, off = this.settings.triggerOff;
    for (const [action, list] of Object.entries(this._pad)) {
      let v = 0;
      for (const i of list) {
        const b = Input._buttonValue(gp.buttons?.[i]);
        if (b > v) v = b;
      }
      const was = this._padHeld.has(action);
      const now = was ? v > off : v >= on;
      if (now === was) continue;
      if (now) { this._padHeld.add(action); this._press(action, 'pad'); }
      else { this._padHeld.delete(action); this._release(action, 'pad'); }
    }
  }

  /**
   * Left stick -> `move`, with a radial deadzone and the reference's magnitude floor.
   *
   * The shape, in order:
   *   1. read the raw pair and take its length;
   *   2. **radial** deadzone — below `deadzone` the stick is centred, full stop. Round, not
   *      square: see the note on INPUT_TUNE.deadzone for why the reference's per-action deadzone
   *      is the wrong shape for a round stick;
   *   3. affine remap of `[deadzone, 1]` onto `[moveFloor, 1]`. `moveFloor` 0.25 is theirs
   *      (`clamp(left_stick_pressure_corrected, 0.25, 1.0)` in `player__sly.gd`); the remap is
   *      ours, and it exists so there is no *second* discontinuity where the floor stops binding.
   *
   * What is deliberately NOT taken: `player__sly.gd` splits at half pressure —
   * `if left_stick_pressure < 0.5: joystick_input = joystick_input.normalized() * left_stick_pressure
   *  else: joystick_input = joystick_input.normalized()` — which snaps everything past half
   * deflection to a full-magnitude 1.0. With its 0.5 movement deadzone that makes the left stick a
   * two-state switch. It suits a controller that picks between a `floor_walk` and a `floor_run`
   * clip; ours multiplies `TUNE.runSpeed` by this magnitude continuously, so throwing away the top
   * half of the stick's travel would throw away every speed between 1.8 and 7.2 m/s.
   */
  _padStick(gp) {
    const ax = gp.axes || [];
    const dz = this.settings.deadzone;
    const floor = this.settings.moveFloor;

    let x = ax[PAD_AXES.moveX] || 0;
    let y = ax[PAD_AXES.moveY] || 0;
    const len = Math.hypot(x, y);
    if (len <= dz) return;
    // Normalise first so a square-gated stick can't report 1.41 on the diagonal, then re-apply
    // the remapped magnitude. This is the honest reading of `normalized() * pressure`.
    const t = Math.min(1, (len - dz) / (1 - dz));
    const mag = floor + (1 - floor) * t;
    x = (x / len) * mag;
    y = (y / len) * mag;
    // `move.y` is +forward; the stick reports +down on axis 1.
    this.move.x = x;
    this.move.y = -y;
  }

  /**
   * Right stick -> `look`, in radians, on the REAL clock.
   *
   * Deliberately not the game clock the buffer uses: `look` is a camera input, and a camera that
   * slows to 0.35× during Thief-o-Vision is a camera you cannot aim with in the one mode that
   * exists so you can aim. The mouse is already unscaled (raw pixels × sensitivity), so this is
   * also what keeps the two devices consistent.
   */
  _padLook(gp) {
    const ax = gp.axes || [];
    const dz = this.settings.padLookDead;
    let x = ax[PAD_AXES.lookX] || 0;
    let y = ax[PAD_AXES.lookY] || 0;
    const len = Math.hypot(x, y);
    if (len <= dz) return;
    const t = Math.min(1, (len - dz) / (1 - dz));
    // Exponent on the *magnitude*, so the direction the player pushed is preserved exactly.
    const mag = Math.pow(t, this.settings.padLookExp);
    const k = (mag / len) * this.settings.padLook * this.dtReal;
    this.look.x += x * k;
    this.look.y += y * k * (this.invertY ? -1 : 1);
  }

  /* ==================================================================== */
  /* query API                                                            */
  /* ==================================================================== */

  down(a) { return this._down.has(a); }
  pressed(a) { return this._pressedFrame.get(a) === this._frame; }
  released(a) { return this._releasedFrame.get(a) === this._frame; }

  /**
   * True if the action was pressed within `ms` of **game** time — and consumes it so it fires
   * once. See guarantee (1): this is the same clock `TUNE.coyote` and every lockout run on.
   */
  buffered(a, ms = BUFFER_MS) {
    const t = this._pressedAt.get(a);
    if (t == null) return false;
    if ((this.clock - t) * 1000 <= ms) { this._pressedAt.delete(a); return true; }
    return false;
  }

  /** Peek at the buffer without consuming. */
  bufferedPeek(a, ms = BUFFER_MS) {
    const t = this._pressedAt.get(a);
    return t != null && (this.clock - t) * 1000 <= ms;
  }

  /**
   * Forget a buffered press, or all of them. `Controller.teleport` calls this for the same reason
   * it drops the lock-on mark and the spent wall face: the shot harness must not arrive somewhere
   * new already holding an input the player made somewhere else.
   */
  clearBuffer(a) {
    if (a == null) this._pressedAt.clear();
    else this._pressedAt.delete(a);
  }

  /** Programmatic input, for the screenshot harness and for cutscene poses. */
  inject(action, isDown) { isDown ? this._press(action, 'inject') : this._release(action, 'inject'); }

  /**
   * Call once per frame BEFORE modules update: advances the input clock, polls the pad, folds
   * keys and stick into `move`. `endFrame()` clears the per-frame accumulators after modules
   * have read them.
   *
   * `dt` is the engine's **scaled** delta. It is optional: when it is omitted the engine's own
   * `dt` from the previous frame is used, which already carries the 1/20 clamp, the `timeScale`
   * and the pause. Reading it rather than re-deriving it keeps one policy in one place —
   * `main.js` calls `beginFrame()` bare, and the tests call `beginFrame(dt)`.
   */
  beginFrame(dt) {
    this._frame++;

    const nowReal = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.dtReal = this._lastReal >= 0
      ? Math.min(Math.max(0, (nowReal - this._lastReal) / 1000), 1 / 20)
      : 1 / 60;
    this._lastReal = nowReal;

    const step = Number.isFinite(dt) ? Math.max(0, dt)
      : (Number.isFinite(this.engine?.dt) ? Math.max(0, this.engine.dt) : 1 / 60);
    this.clock += step;

    /* Pad buttons FIRST, so a d-pad press taken this frame is already in `_down` when the
       digital vector is folded below — otherwise the d-pad would lag the keyboard by a frame and
       the stick would win a direction the player pushed on the pad. */
    const gp = (this.padEnabled && this.enabled) ? this._findPad() : null;
    if (gp) this._padButtons(gp);

    let x = 0, y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;

    if (gp) {
      // The stick only wins when keys and d-pad are quiet: both of those are digital and give a
      // full-magnitude intent, which is what a discrete direction should mean.
      if (len < 1e-6) this._padStick(gp);
      this._padLook(gp);
    }
  }

  endFrame() {
    this.look.x = 0; this.look.y = 0;
    this.zoom = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('blur', this._onBlur);
  }
}
