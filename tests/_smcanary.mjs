/**
 * _smcanary.mjs — the calibration subject for the entered-state census in `traversal.test.mjs`.
 *
 * NOT part of `tests/*.test.mjs`; it is handed to `node --test` by name, alongside the real test
 * files, in the census's child run. Its whole job is to make the census's instrument fire in a
 * known way in a child process, so that "these states were never entered" can be distinguished
 * from "the trace channel was broken and reported nothing". Those two look identical in the
 * output and only one of them is a finding.
 *
 * It drives a machine whose states exist nowhere else, so it can never contaminate the census:
 *
 *   sm.set('canary_forced')   outside update()  ->  must be recorded as FORCED
 *   sm.update(dt)             which returns     ->  must be recorded as DRIVEN
 *       'canary_driven'
 *   'canary_absent'                             ->  must be recorded not at all
 *
 * That is both directions of the driven/forced split plus a state the recorder must not invent,
 * on the real `StateMachine` from `src/player/States.js` — the same class and the same `set()`
 * the preload patches for everybody else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { State, StateMachine } from '../src/player/States.js';

test('smcanary: drive a private machine so the census trace has a known signature', () => {
  const ctx = { softFail() {}, onStateChanged() {} };
  const sm = new StateMachine(ctx);
  class Hop extends State {
    constructor(name, opts, next) { super(name, opts); this._next = next; }
    canEnter() { return false; }          // never polled into; only set() or a returned name
    update() { const n = this._next; this._next = null; return n; }
  }
  sm.add(new Hop('canary_forced', { priority: 1 }, 'canary_driven'));
  sm.add(new Hop('canary_driven', { priority: 2 }, null));
  sm.add(new Hop('canary_absent', { priority: 3 }, null));

  assert.equal(sm.set('canary_forced'), true, 'the canary could not enter its own first state');
  assert.equal(sm.name, 'canary_forced');
  sm.update(1 / 60);
  assert.equal(sm.name, 'canary_driven', 'the canary machine did not transition under update()');
});
