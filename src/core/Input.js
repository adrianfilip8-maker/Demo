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
 *    **And it holds on the pad too, which it did not until §540.** A key that was held when focus
 *    left sends no keydown when focus returns; a pad is polled, so the next poll met a still-held
 *    button with `_padHeld` freshly cleared and re-pressed it — a phantom jump on the way back in,
 *    and a re-stamped `_pressedAt` that undid the buffer clear one frame after it happened. A
 *    re-discovered hold now goes through `_adopt`: down, but not pressed.
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
  /* `attack` was mouse-and-pad only, and §514 measured what that costs: the unlocked-click
     swallow eats left clicks whenever pointer lock is pending, denied, or in Chrome's ~1.25 s
     post-Esc cooldown — on the user's machine that read as "attacks are not working", with the
     on-ring attack bail dead the same way. A keyboard route to the verb is lock-independent. */
  attack:   ['KeyF'],
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
 * action -> W3C "Standard Gamepad" button index[]. A DualShock 4 maps `standard` in Chromium:
 * 0 Cross · 1 Circle · 2 Square · 3 Triangle · 4 L1 · 5 R1 · 6 L2 · 7 R2 · 8 Share · 9 Options ·
 * 10 L3 · 11 R3 · 12-15 d-pad.
 *
 * ── §516: re-derived from the CANONICAL Sly 2 layout, per the user's instruction ─────────────
 * Source: the Sly 2: Band of Thieves control listings in the GameFAQs guides
 * (gamefaqs.gamespot.com/ps2/919949-sly-2-band-of-thieves/faqs/32526, /32945; the midair move
 * rows from /32545), obtained via web search on 2026-08-21 — direct page fetches are blocked by
 * this container's egress proxy, which is recorded rather than papered over. The layout, as
 * retrieved:
 *
 *   left stick / d-pad   move                 right stick    rotate camera
 *   X                    jump; X,X double     Square         cane swing; hold = power-up whack
 *   O                    open / pick up / activate; HOLD O near sparkles = ledge/wall sneak
 *   Triangle             juggle; X, Square = overhead smash; X, Triangle = dive spin
 *   X + R1               paraglide            hold R1        run
 *   L1 / L2 / R2         use equipped gadget  R3             Binocucom    L3   job markers
 *
 * Derivation, row by row — the source decides, and every gap is documented not invented:
 *
 *   jump     [0]  Cross     verbatim (X = jump, X,X = double jump — our double jump matches)
 *   attack   [2,3] Square + Triangle. Square is the cane swing verbatim. Triangle carries Sly 2's
 *                  juggle and X-then-Triangle dive spin — both cane strikes; our air-attack IS
 *                  the dive, so Triangle joins the attack family rather than gaining an invented
 *                  verb. (Triangle = Binocucom is Sly 1's layout, not Sly 2's, and the Binocucom
 *                  is cut from this demo by the user's scope ruling anyway.)
 *   interact [1]  Circle    verbatim: the contextual thief action (open/pick up/activate, hold-
 *                  to-sneak at sparkles) is exactly our E family — grabs, mounts, pickpocket.
 *   glide    [5]  R1        from `X + R1 = paraglide`, verbatim for the air half. The ground
 *                  half (`hold R1 = run`) is delivered by the analog stick instead: magnitude
 *                  IS the walk→run gradient here (see `_padStick`), so a run modifier would be
 *                  a second control for a thing the stick already expresses.
 *   pause    [9]  Options   (Start on a DS2). **This row said "the demo has no pause menu; the
 *                  verb is inert" and that was false** — driven in-arm through the real
 *                  `src/core/Debug.js` (§540): Options flips `engine.debug.paused`, and
 *                  `Engine.renderFrame` answers that with `this.dt = 0`. The simulation stops
 *                  dead with no cel, no text and no HUD change — visually a hang. It is
 *                  recoverable (`input.beginFrame`/`debug.update` are pumped OUTSIDE
 *                  `renderFrame` in `main.js`, so a second press is still seen), and it is
 *                  exactly what P does on the keyboard, so the two devices are at parity.
 *
 *                  What is NOT at parity, and is not this file's to fix: the pause a PLAYER
 *                  means. `HUD.setPaused` — the cel, the pointer release, `engine.paused` — is
 *                  reached only from a raw Escape keydown (`HUD.js` installs its own listener)
 *                  or from pointer-lock loss. **No pad button can produce either**, while the
 *                  cel's own controls row offers Options for "Pause / release the pointer"
 *                  (`HUD.js:132`). Measured, not inferred: pad button 9 moved `debug.paused`
 *                  false→true and left `hud.binocOn`, `hud.pauseOn` and the lock untouched. The
 *                  binding stays because removing it would leave the cel advertising a button
 *                  that does nothing at all; the repair belongs to whoever owns `HUD.js`.
 *   recentre [11] R3        OURS. Sly 2 puts the Binocucom here; it is cut, so the slot carries
 *                  our camera recentre rather than nothing.
 *   sneak    [4] L1 · crouch [6] L2 · focus [7] R2 — OURS, in Sly 2's GADGET slots. This demo
 *                  has no gadget system (out of scope), so the three slots carry our three
 *                  modifiers; `focus` (Thief-o-Vision) sits on an analog trigger because it is
 *                  hold-to-use, through the existing hysteresis. Documented as the gap: a Sly 2
 *                  player expects gadgets on these, and there are none to bind.
 *   binocu   —    UNBOUND on the pad, and it stays that way — but **not for the reason this row
 *                  used to give.** It said "a button that opens nothing teaches distrust", and
 *                  that premise is false: driven in-arm through the real `src/ui/HUD.js` (§540),
 *                  Tab flips `hud.binocOn` false→true and raises the binocucom overlay, with
 *                  `Audio.js` stung to match. So `binocu` is a LIVE keyboard verb with no pad
 *                  route — a real keyboard/pad asymmetry, recorded as one. It is left open
 *                  because the Binocucom is out of scope by the user's ruling, which is a reason
 *                  not to grow the feature onto a second device, not evidence that it is inert.
 *   d-pad    [12-15] move, verbatim ("digital buttons = move character").
 *
 * ── §540: the parity census, driven rather than read ────────────────────────────────────────
 *
 * The mapping above was written from a guide and never re-tested. `tests/padparity.test.mjs`
 * settles it by driving each verb on each device through the real event path into a real
 * `Controller` + `Moveset` and recording the state-machine transition it produced — the §357.1
 * question (bound at one end only) asked of every row at once. The result:
 *
 *   · **Every verb the moveset consults is reachable on both devices, and all 13 produce the
 *     same transition.** jump→jump · attack→combo (ground) and →dive (air), on F, LMB, Square
 *     AND Triangle · interact→pickpocket · crouch→crouch, and tapped at speed →roll · sneak→
 *     sneak · glide→paraglide · focus→combatStrafe · each of the four directions→move on key,
 *     d-pad and stick alike. Nothing is bound-but-dead; nothing is read-but-unbindable.
 *   · **Keyboard-only, five verbs, all of them debug or out-of-scope:** `binocu` (Tab → the HUD
 *     overlay), `freecam` (F1), `quality` (F2), `colliders` (F3) — the last three are
 *     `src/core/Debug.js`'s and are keyboard-only by the same decision `HUD.js:549` records —
 *     and the player-facing pause cel, which is Escape's, not an action at all (see `pause`).
 *   · **Pad-only, nothing.** Every pad button has a keyboard or mouse route to the same verb.
 *     The one thing the pad can do that the keyboard cannot is a *magnitude*: a sustained speed
 *     between 1.93 and 7.20 m/s, where a key is pinned at 7.20. That is the analog axis being
 *     analog rather than a missing verb — `Move.update`'s own comment says so — and Sly 2's
 *     answer to it (`hold R1 = run`) is the thing `glide`'s row above declines on purpose.
 *   · `focus` is the only gameplay verb with **no keycap at all** — RMB and R2, nothing else.
 *     Checked rather than assumed, because §514 is exactly the shape of hazard that would make
 *     that fatal: on a machine where the pointer-lock grant never lands, four LMB clicks are all
 *     swallowed and four RMB clicks all press, because the swallow in `_onMouseDown` is
 *     `e.button === 0` only. So the mouse route to `focus` is lock-independent and no keyboard
 *     binding is invented here — but it is a one-route verb, and `padparity.test.mjs` pins the
 *     RMB leg so a widened swallow cannot take Thief-o-Vision out with it.
 */
export const PAD_BINDINGS = {
  forward:  [12],
  back:     [13],
  left:     [14],
  right:    [15],
  jump:     [0],        // Cross
  attack:   [2, 3],     // Square + Triangle (juggle / dive-spin family)
  interact: [1],        // Circle
  glide:    [5],        // R1 — X+R1 paraglide
  sneak:    [4],        // L1 — ours (gadget slot, no gadgets in scope)
  crouch:   [6],        // L2 — ours (gadget slot)
  focus:    [7],        // R2 — ours (gadget slot), analog hold via hysteresis
  recentre: [11],       // R3 — ours (Sly 2: Binocucom, which is cut)
  pause:    [9],        // Options
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
  /**
   * How far a stick must TRAVEL from where it was resting before it counts as the player
   * reaching for the pad (§541). Not a deadzone — the deadzones above decide what MOVES; this
   * decides what the HUD's prompts believe about whose hands are on what.
   *
   * Derived, not picked. A DS4 reports axes at roughly 8-bit resolution, so one LSB is 0.0078,
   * and a worn stick flickering across four codes produces frame-to-frame deltas up to 0.0625
   * (measured over 3000 samples). The threshold has to clear that. It also has to catch a
   * deliberate push, and the shape of the test matters more than the number: a per-frame delta
   * **cannot** — a leisurely one-second push from centre to full moves only 0.0167 per frame,
   * under any rest-immune threshold, so a per-frame rule would never fire for it at all. This is
   * therefore travel from a resting REFERENCE, which fires at any speed once the stick has gone
   * 0.08 — 0.8 s into even an absurd ten-second push, and immediately for any real one.
   */
  padWake:    0.08,
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
/* §516: DS4 names, not the Xbox letters the scaffold shipped with — `describe('jump')` under a
   Sly-2-derived PlayStation mapping must say "Space / Cross", not "Space / A". Same W3C indices
   either way; only the vocabulary follows the §516 ruling that this game speaks PS4. */
const PAD_LABEL = [
  'Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3',
  'D-Up', 'D-Down', 'D-Left', 'D-Right', 'PS',
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
     * "Space / Cross" should ask `describe(action)`, which is device-agnostic and always right.
     */
    this.move = { x: 0, y: 0 };

    this.sensitivity = 0.0022;
    this.invertY = false;
    this.locked = false;
    this._lockFailed = false;   // §514: a failed grant opens the click gate until a real grant
    this._lockTimer = 0;
    /* §516: which device the player used last — 'kbm' or 'pad'. HUD prompts read it to show
       keycaps or shapes. Set on every press by source and on stick deflection past deadzone;
       emitted as 'inputDevice' only on change. */
    this.lastDevice = 'kbm';
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
    /**
     * Set whenever `_padHeld` is force-cleared out from under a physically-held button (focus
     * loss, pointer-lock loss, a rebind). The next poll ADOPTS whatever is still down instead of
     * pressing it — see `_adopt` and guarantee (3).
     */
    this._padResync = false;
    /** Where the sticks were last seen resting, and for which pad. See `_padDevice`. */
    this._padRest = null;
    /**
     * Button indices that have been SEEN at rest, and are therefore believed (§542). A control
     * that has never once read below `triggerOff` is treated as 0 — see `_padValue`.
     */
    this._padTrust = new Set();
    /** The pad index polled last frame, or -1. A change means holds belong to a pad that is gone. */
    this._padLast = -1;
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

  /** Human-readable, e.g. `describe('jump')` -> "Space / Cross". */
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
         becomes true, and swallowing unconditionally would mean the cane never swings at all.

         §514: "was actually requested" is not "was granted", and the gap between them is the
         user's machine. `requestLock()` returns true for ISSUING the request; when the grant
         fails — permission denied, iframe policy, or the ~1.25 s re-lock cooldown Chrome
         enforces after every Esc — `locked` never turns true and this branch swallowed EVERY
         subsequent click, forever. Measured in the live browser (tools/lockprobe.mjs L1): five
         real clicks, four swallowed while the grant was pending, one press. On hardware where
         the grant never lands, that is "attacks are not working", and the on-ring attack bail
         with it. So the swallow now spends itself: one click per acquisition ATTEMPT, and a
         failed attempt (`pointerlockerror`, promise rejection, or 1.5 s without a grant) opens
         the gate — clicks press normally while unlocked until a grant actually arrives. */
      if (!this.locked && e.button === 0 && !this._lockFailed && this.requestLock()) {
        this._lockClick = true;
        return;
      }
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

    this._onLockError = () => this._lockFail();
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) { this._lockFailed = false; clearTimeout(this._lockTimer); this._lockTimer = 0; }
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
    document.addEventListener('pointerlockerror', this._onLockError);
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
  _setDevice(dev) {
    if (this.lastDevice === dev) return;
    this.lastDevice = dev;
    try { this.engine.emit('inputDevice', dev); } catch { /* HUD-less builds */ }
  }

  _press(a, src = 'key') {
    this._setDevice(src === 'pad' ? 'pad' : 'kbm');
    const s = this._src[src];
    if (!s || s.has(a)) return;
    s.add(a);
    if (this._down.has(a)) return;          // another device already holds it — not a new press
    this._down.add(a);
    this._pressedFrame.set(a, src === 'pad' ? this._frame : this._frame + 1);
    this._pressedAt.set(a, this.clock);
  }

  /**
   * Take up a hold that was ALREADY physical when we stopped tracking it. `down()` becomes true;
   * `pressed()`, `released()` and `buffered()` do not, because the player did not do anything.
   *
   * ── Why this exists: guarantee (3) was wired for one device only (§540) ─────────────────────
   *
   * A key cannot betray the drop — the browser sends no keydown for a key that was already held
   * when focus came back — but a pad is POLLED, so `_padButtons` meets a button that is still
   * physically down with `_padHeld` freshly cleared, reads a rising edge, and calls `_press`.
   * Measured, real event path, real class (`tests/padparity.test.mjs` P4): hold Cross, fire
   * `blur`, and the next `beginFrame` reports `pressed('jump')` **true** — while the same drill
   * on Space reports false. Alt-tab out with Cross held and Sly jumps on the way back in.
   *
   * The buffer made it worse than one stray edge. `_dropAllHeld` clears `_pressedAt` precisely
   * so "a press made a moment before an alt-tab is not still live on return" — and `_press`
   * re-stamps `_pressedAt` one frame later, so on the pad the clear bought nothing at all.
   *
   * The clear itself is right and stays (see `_releaseSource`: a stale `_padHeld` entry leaves a
   * held button reading as released until the player lets go). What was wrong was re-entering
   * through the edge-stamping door. `down()` must be true — the button IS down — and that is the
   * whole of what is true, so that is the whole of what this sets.
   */
  _adopt(a, src) {
    const s = this._src[src];
    if (!s || s.has(a)) return;
    s.add(a);
    if (this._down.has(a)) return;          // another device already holds it
    this._down.add(a);
    /* Deliberately no `_pressedFrame`, no `_pressedAt`, and no `_setDevice`: nothing about a
       re-discovered hold is an event the player caused this frame. */
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
       the player let go of it and pressed again. The re-discovery is armed rather than left to
       `_press`, because a button that never went up did not go down again either — `_adopt`. */
    if (src === 'pad') {
      this._padHeld.clear();
      this._padResync = true;
      /* `_padTrust` is deliberately NOT cleared here. A blur or a rebind comes through this path
         too, and the pad on the other side of an alt-tab is the same physical device with the same
         conventions — making the player release and re-pull a trigger they never let go of would
         undo §540's adopt. Trust is a property of the DEVICE, so only a change of device drops it,
         which `beginFrame` does at the index test. */
      /* Same reason, for the sticks: we stopped watching, so whatever they read on the next poll
         is a resting position to be adopted, not travel to be attributed to the player. */
      this._padRest = null;
    }
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
    /* Detect the grant FAILING, not just succeeding (§514). Three channels, because browsers
       disagree: modern Chrome returns a rejecting promise, the spec fires `pointerlockerror`
       (listener installed in _bind), and a build that does neither hits the timer. Any of them
       sets `_lockFailed`, which stops the click swallow until a real grant clears it. */
    let p = null;
    try { p = this.canvas.requestPointerLock(); } catch { this._lockFail(); return true; }
    if (p && typeof p.catch === 'function') p.catch(() => this._lockFail());
    /* Armed ONCE per unlock episode, not per click. The first version re-armed on every click,
       and lockprobe L1 measured what that costs: a player clicking every ~250 ms postpones the
       1.5 s deadline forever, so the gate never opens while they are actively trying to attack —
       which is the exact situation the timer exists for. */
    if (!this._lockTimer) {
      this._lockTimer = setTimeout(() => { this._lockTimer = 0; if (!this.locked) this._lockFail(); }, 1500);
    }
    return true;
  }

  _lockFail() {
    this._lockFailed = true;
    this._lockClick = false;
    clearTimeout(this._lockTimer);
    this._lockTimer = 0;
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
  /**
   * One button's value, but only once the control has PROVED it can rest (§542).
   *
   * `L2`/`R2` are analogue, and the W3C standard mapping says they read 0 at rest and 1 pressed.
   * Not every driver agrees: a trigger mapped from a signed axis without a remap rests at −1, and
   * one mapped from a signed axis with the sign inverted rests at **+1**. Measured on the shipped
   * code (`tests/padhotplug.test.mjs` H4), a pad whose triggers rest at +1:
   *
   *   crouch true · focus true · state 'crouch' · timeScale 0.35
   *
   * — Sly permanently crouched and the whole game permanently in Thief-o-Vision slow-mo, from the
   * first frame, with no input at all. A rest of 0.5 is quieter and worse: it is below `triggerOn`
   * so nothing fires at boot, but it is above `triggerOff`, so the FIRST real press latches the
   * action on for the rest of the session.
   *
   * Nothing here can ask the driver what its convention is — the code never consulted
   * `gp.mapping`, and `mapping: 'standard'` is a claim a non-conformant pad makes too. What it can
   * do is decline to believe a control it has never seen released. A digital button rests at 0 and
   * is trusted on its first poll, so a working pad pays nothing; a stuck control reads 0 until it
   * proves otherwise, which turns "permanently crouched" into "L2 does nothing", and the keyboard
   * route to both verbs is still there (§540's census).
   */
  _padValue(gp, i) {
    const raw = Input._buttonValue(gp.buttons?.[i]);
    if (this._padTrust.has(i)) return raw;
    if (raw <= this.settings.triggerOff) { this._padTrust.add(i); return raw; }
    return 0;
  }

  _padButtons(gp) {
    const on = this.settings.triggerOn, off = this.settings.triggerOff;
    /* The first poll after `_padHeld` was force-cleared re-DISCOVERS holds rather than receiving
       them (§540). Spent on the poll itself, not on finding something to adopt: if the player let
       go while the tab was away, this frame sees nothing down, the flag clears, and their next
       real press edges normally. */
    const resync = this._padResync;
    this._padResync = false;
    for (const [action, list] of Object.entries(this._pad)) {
      let v = 0;
      for (const i of list) {
        const b = this._padValue(gp, i);
        if (b > v) v = b;
      }
      const was = this._padHeld.has(action);
      const now = was ? v > off : v >= on;
      if (now === was) continue;
      if (now) {
        this._padHeld.add(action);
        if (resync) this._adopt(action, 'pad'); else this._press(action, 'pad');
      } else { this._padHeld.delete(action); this._release(action, 'pad'); }
    }
  }

  /**
   * Which device the player is USING — decided from stick TRAVEL, not stick position (§541).
   *
   * ── What position got wrong, measured ───────────────────────────────────────────────────────
   *
   * `_padStick` used to call `_setDevice('pad')` on every frame the left stick sat outside the
   * deadzone, and the comment defending it said "a held stick is ongoing pad use". A held stick
   * is; a WORN one is not, and nothing here could tell them apart. Real DualShock sticks rest off
   * centre, and a worn one rests well off it. Driven with the real `Input` and the real `HUD`
   * (`tests/padrest.test.mjs` R3), a stick resting at 0.19 — untouched, on the table:
   *
   *   · claimed the device on the first poll and never let go;
   *   · turned five keystrokes into **eleven** `inputDevice` emits, because each `_press` claimed
   *     'kbm' and `_padStick` re-claimed 'pad' later in the SAME `beginFrame` — every one of
   *     which re-renders the live prompt and all twelve glyph columns of the controls cel;
   *   · and settled on 'pad', so a keyboard player read PS4 shapes for the rest of the session.
   *
   * The right stick had the opposite bug: it never claimed at all, so picking up the pad and
   * looking around — 149°/s of camera, an unambiguous act — left keycaps on screen.
   *
   * ── Why travel from a REFERENCE and not a per-frame delta ───────────────────────────────────
   *
   * A per-frame delta is the obvious rule and it does not work: a one-second push from centre to
   * full moves 0.0167 per frame, well under the 0.0625 a four-code jitter can produce, so no
   * rest-immune per-frame threshold can ever fire for a slow push. Both bounds are measured (see
   * `INPUT_TUNE.padWake`). Travel from the position the stick was last resting at has no such
   * blind spot: it fires once the stick has gone `padWake`, however slowly it gets there.
   *
   * Three details that are each load-bearing:
   *   · the FIRST poll of a pad adopts its resting position and claims nothing — otherwise a
   *     drifting stick's offset would read as travel-from-zero and claim on frame one, which is
   *     the bug this method exists to remove;
   *   · a claim requires the stick to end up LIVE (past its own deadzone), so letting go and
   *     coming home to centre — real travel, no actuation — does not steal the flag back from a
   *     keyboard the player has just moved to;
   *   · the reference re-seeds on any travel past `padWake`, claim or no claim, so it tracks the
   *     stick instead of ageing into a stale far-away point.
   */
  _padDevice(gp) {
    const ax = gp.axes || [];
    const lx = ax[PAD_AXES.moveX] || 0, ly = ax[PAD_AXES.moveY] || 0;
    const rx = ax[PAD_AXES.lookX] || 0, ry = ax[PAD_AXES.lookY] || 0;
    const rest = this._padRest;
    if (!rest || rest.pad !== this._padIndex) {
      this._padRest = { pad: this._padIndex, lx, ly, rx, ry };
      return;
    }
    const wake = this.settings.padWake;
    const lTravel = Math.hypot(lx - rest.lx, ly - rest.ly);
    const rTravel = Math.hypot(rx - rest.rx, ry - rest.ry);
    if (lTravel <= wake && rTravel <= wake) return;
    rest.lx = lx; rest.ly = ly; rest.rx = rx; rest.ry = ry;
    const live = (lTravel > wake && Math.hypot(lx, ly) > this.settings.deadzone)
      || (rTravel > wake && Math.hypot(rx, ry) > this.settings.padLookDead);
    if (live) this._setDevice('pad');
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
    /* The device flag used to be claimed here, from POSITION — see `_padDevice`, which claims it
       from travel instead, and the measurement that moved it. */
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
    /**
     * ── A pad that GOES AWAY holding something (§542) ───────────────────────────────────────
     *
     * `_padButtons` is the only thing that ever calls `_release` for a pad hold, and it only runs
     * when there IS a pad. So an unplugged controller used to leave its holds latched forever:
     * measured on the shipped code (`tests/padhotplug.test.mjs` H1), d-pad up held and the pad
     * yanked left `down('forward')` true and Sly running at 7.200 m/s — **36 m of travel in the
     * five seconds after the controller was gone**, with no way to stop him. R2 held was worse
     * than a runaway: `timeScale` stuck at 0.35, the entire game in permanent slow-mo.
     *
     * The stick does not latch, because the digital fold below rewrites `move` from `down()` every
     * frame and an absent pad contributes nothing — which is exactly why this was easy to miss.
     * Only the BUTTON holds survive, and they survive completely.
     *
     * A change of pad INDEX is the same event wearing a different hat: pad 0 unplugged while pad 1
     * is connected silently re-points the poll at a controller that never pressed anything, and
     * pad 0's holds would be resolved against pad 1's buttons. So both go through one test.
     * `_releaseSource('pad')` is the existing, correct exit — it releases properly rather than
     * forgetting (guarantee 3), arms `_padResync` so a reconnect ADOPTS instead of re-pressing
     * (§540), drops the rest reference so the new pad is re-sampled (§541), and clears the trust
     * set so a new pad proves its own controls.
     */
    const gp = (this.padEnabled && this.enabled) ? this._findPad() : null;
    const idx = gp ? this._padIndex : -1;
    if (idx !== this._padLast) {
      if (this._padLast >= 0) this._releaseSource('pad');
      this._padTrust.clear();      // a different device proves its own controls (`_padValue`)
      this._padLast = idx;
    }
    if (gp) { this._padButtons(gp); this._padDevice(gp); }

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
    document.removeEventListener('pointerlockerror', this._onLockError);
    window.removeEventListener('blur', this._onBlur);
  }
}
