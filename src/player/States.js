/**
 * States — the hierarchical state machine that MOVEMENT's whole moveset lives in.
 *
 * Why a machine and not booleans: 28 moves that can each interrupt some subset of the others
 * is a combinatorial mess as `if` soup. Here every move is a small class with an explicit
 * `priority` and a `canEnter` predicate, and the machine does one job per frame: run the
 * current state, then walk the candidate list from the top and let the first *strictly
 * higher priority* state that says "yes" take over. A move is added by writing one class and
 * picking a number; nothing else has to know it exists.
 *
 * The hierarchy is the `group` field — `ground` / `air` / `attach` / `action`. Groups are how
 * a move expresses "I only make sense out of a fall" (`canEnter` checks `c.sm.group`), which
 * is what keeps e.g. a ledge grab from firing while Sly is already on a hook.
 *
 * Sticky moves (hook, rail, pole, spire, ledge) sit *above* jump in priority and handle the
 * jump button themselves via `sm.request()`. That inversion is deliberate: it means "jump"
 * means something different depending on what you're holding onto, without Jump needing to
 * know about any of it.
 */

export class State {
  constructor(name, opts = {}) {
    this.name = name;
    this.priority = opts.priority ?? 0;
    this.group = opts.group ?? 'ground';
    /** Base animation clip, or null to let setLocomotion drive the blend tree alone. */
    this.clip = opts.clip ?? null;
    this.loop = opts.loop ?? true;
    this.fade = opts.fade ?? 0.12;
    /** Reported to ANIMATION so additive layers know Sly's posture. */
    this.sneaking = !!opts.sneaking;
    this.crouching = !!opts.crouching;
    /** Capsule height override while in this state (crouch/crawl), or 0 for full height. */
    this.capsule = opts.capsule ?? 0;
    /** States only reachable through sm.request() — never polled. */
    this.onRequest = !!opts.onRequest;
  }

  /** Poll predicate. Cheap: this runs for every candidate above the current priority. */
  canEnter(_c) { return true; }

  enter(_c, _prev) {}

  /** Return a state name to force a transition, or null. */
  update(_c, _dt) { return null; }

  exit(_c, _next) {}
}

export class StateMachine {
  constructor(ctx) {
    this.ctx = ctx;
    this.states = new Map();
    this.ordered = [];
    this.current = null;
    this.prev = null;
    /** Seconds spent in the current state. Most timed moves read this instead of their own timer. */
    this.time = 0;
    this.frameSwitches = 0;
    this._pending = null;
    this._pendingFrom = null;
  }

  add(state) {
    if (this.states.has(state.name)) return this.states.get(state.name);
    this.states.set(state.name, state);
    this.ordered.push(state);
    // Sorted once at build time so the per-frame poll is a straight walk with an early break.
    this.ordered.sort((a, b) => b.priority - a.priority);
    return state;
  }

  get(name) { return this.states.get(name) ?? null; }
  has(name) { return this.states.has(name); }

  /** The current state's group — `canEnter` predicates key off this for the hierarchy. */
  get group() { return this.current ? this.current.group : 'ground'; }
  get name() { return this.current ? this.current.name : '—'; }
  get priority() { return this.current ? this.current.priority : -1; }

  /** Ask for a transition regardless of priority. The owning state's decision wins. */
  /**
   * Ask for a transition on the next resolution pass.
   *
   * **A request must not be downgraded by the consequence it caused.** This used to assign
   * `_pending` unconditionally, and that destroyed `hurt` in the one case it matters most:
   * `Controller.hurt()` calls `request('hurt')` and sets `grounded = false` for the knock-back,
   * so the very next `current.update()` of any grounded locomotion state returns `'fall'` — and
   * `update()`'s `if (forced) this.request(forced)` then overwrote the hurt request with the
   * fall that the hurt itself had just produced.
   *
   * Measured before the fix: **airborne → `hurt` at frame 40; grounded → never, in 60 frames.**
   * No hurt state, no hurt clip, no shake. In the shipped game `_hazards` runs *after*
   * `sm.update`, so the request always landed on the next frame's forced `'fall'` — which means
   * **taking a hit while standing still, the common case, played nothing at all.**
   *
   * The rule is the narrowest one that fixes it: an outstanding request survives a *lower*
   * priority one arriving in the same frame. Equal or higher still wins, so a genuinely more
   * urgent forced transition is unaffected, and nothing that was reachable becomes unreachable.
   */
  request(name) {
    if (!this.states.has(name)) return null;
    if (this._pending && this._pending !== name) {
      const held = this.states.get(this._pending);
      const want = this.states.get(name);
      if (held && want && want.priority < held.priority) return null;
    }
    this._pending = name;
    return null;
  }

  /** Immediate, unconditional switch. Used by teleport() and by the machine itself. */
  set(name) {
    const next = this.states.get(name);
    if (!next || next === this.current) return false;
    const prev = this.current;
    this.current = next;
    this.prev = prev;
    this.time = 0;
    try { prev?.exit(this.ctx, next); } catch (e) { this.ctx.softFail('exit', prev?.name, e); }
    try { next.enter(this.ctx, prev); } catch (e) { this.ctx.softFail('enter', next.name, e); }
    this.ctx.onStateChanged(next, prev);
    return true;
  }

  update(dt) {
    if (!this.current) { this.set('idle'); return; }
    this.frameSwitches = 0;

    // A forced transition should take effect the same frame it is decided, otherwise a jump
    // pressed on the frame you land eats one frame of gravity and reads as a dropped input.
    for (let pass = 0; pass < 4; pass++) {
      this.time += pass === 0 ? dt : 0;

      let forced = null;
      try { forced = this.current.update(this.ctx, dt); }
      catch (e) { this.ctx.softFail('update', this.current.name, e); }
      if (forced) this.request(forced);

      if (this._pending) {
        const name = this._pending;
        this._pending = null;
        if (name !== this.current.name && this.set(name)) { this.frameSwitches++; continue; }
      } else {
        const cur = this.current;
        let took = null;
        for (let i = 0; i < this.ordered.length; i++) {
          const s = this.ordered[i];
          if (s.priority <= cur.priority) break;      // list is sorted: nothing below can preempt
          if (s === cur || s.onRequest) continue;
          let ok = false;
          try { ok = s.canEnter(this.ctx); }
          catch (e) { this.ctx.softFail('canEnter', s.name, e); }
          if (ok) { took = s; break; }
        }
        if (took && this.set(took.name)) { this.frameSwitches++; continue; }
      }
      break;
    }
  }
}
