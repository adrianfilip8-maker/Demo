/**
 * Input — keyboard + mouse, mapped to named actions (AGENTS.md §6.1).
 *
 * Gameplay code never reads key codes. It asks for actions, and it asks in one of three
 * flavours, which matters a lot for platformer feel:
 *
 *   down(a)      held this frame
 *   pressed(a)   went down this frame            — use for jump, attack, roll
 *   released(a)  came up this frame              — use for variable jump height
 *   buffered(a)  went down within the last N ms  — use for jump so early presses aren't eaten
 *
 * `buffered` is the reason a jump pressed 100 ms before landing still fires. Without it the
 * game feels unresponsive in exactly the way players can't articulate but always notice.
 */

const BINDINGS = {
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

const MOUSE_BINDINGS = {
  attack: 0,   // left  — cane combo / dive attack
  focus:  2,   // right — Thief-o-Vision + hook lock-on
  middle: 1,
};

const BUFFER_MS = 140;

export class Input {
  constructor(engine) {
    this.engine = engine;
    this.canvas = engine.canvas;

    this._down = new Set();
    this._pressedFrame = new Map();   // action -> frame index it went down
    this._releasedFrame = new Map();
    this._pressedAt = new Map();      // action -> performance.now() of last press
    this._frame = 0;

    /** Accumulated mouse delta for this frame, in radians-ish (scaled by sensitivity). */
    this.look = { x: 0, y: 0 };
    /** Accumulated wheel delta for this frame. */
    this.zoom = 0;
    /** Normalised movement intent in camera space, length ≤ 1. */
    this.move = { x: 0, y: 0 };

    this.sensitivity = 0.0022;
    this.invertY = false;
    this.locked = false;
    this.enabled = true;

    this._keyToActions = new Map();
    for (const [action, keys] of Object.entries(BINDINGS)) {
      for (const k of keys) {
        if (!this._keyToActions.has(k)) this._keyToActions.set(k, []);
        this._keyToActions.get(k).push(action);
      }
    }

    this._bind();
  }

  _bind() {
    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      // Tab would move focus out of the canvas and Space would scroll the page.
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F1') {
        e.preventDefault();
      }
      if (e.repeat) return;
      const actions = this._keyToActions.get(e.code);
      if (!actions) return;
      for (const a of actions) this._press(a);
    };

    this._onKeyUp = (e) => {
      const actions = this._keyToActions.get(e.code);
      if (!actions) return;
      for (const a of actions) this._release(a);
    };

    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (!this.locked && e.button === 0) { this.requestLock(); }
      for (const [action, btn] of Object.entries(MOUSE_BINDINGS)) {
        if (e.button === btn) this._press(action);
      }
    };

    this._onMouseUp = (e) => {
      for (const [action, btn] of Object.entries(MOUSE_BINDINGS)) {
        if (e.button === btn) this._release(action);
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
      if (!this.locked) {
        // Drop held state so Sly doesn't keep sprinting into a wall while the menu is up.
        this._down.clear();
      }
    };

    this._onBlur = () => { this._down.clear(); };

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

  _press(a) {
    if (this._down.has(a)) return;
    this._down.add(a);
    this._pressedFrame.set(a, this._frame);
    this._pressedAt.set(a, performance.now());
  }

  _release(a) {
    if (!this._down.has(a)) return;
    this._down.delete(a);
    this._releasedFrame.set(a, this._frame);
  }

  requestLock() {
    if (this.locked) return;
    this.canvas.requestPointerLock?.();
  }

  releaseLock() { document.exitPointerLock?.(); }

  /* ---------------- query API ---------------- */

  down(a) { return this._down.has(a); }
  pressed(a) { return this._pressedFrame.get(a) === this._frame; }
  released(a) { return this._releasedFrame.get(a) === this._frame; }

  /** True if the action was pressed within `ms` — and consumes it so it fires once. */
  buffered(a, ms = BUFFER_MS) {
    const t = this._pressedAt.get(a);
    if (t == null) return false;
    if (performance.now() - t <= ms) { this._pressedAt.delete(a); return true; }
    return false;
  }

  /** Peek at the buffer without consuming. */
  bufferedPeek(a, ms = BUFFER_MS) {
    const t = this._pressedAt.get(a);
    return t != null && performance.now() - t <= ms;
  }

  /** Programmatic input, for the screenshot harness and for cutscene poses. */
  inject(action, isDown) { isDown ? this._press(action) : this._release(action); }

  /**
   * Call once per frame BEFORE modules update: folds keys into `move`, then
   * `endFrame()` clears the per-frame accumulators after modules have read them.
   */
  beginFrame() {
    this._frame++;
    let x = 0, y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
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
