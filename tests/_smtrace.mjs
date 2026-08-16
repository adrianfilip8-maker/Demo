/**
 * _smtrace.mjs — a recorder for every state the moveset's machine actually enters.
 *
 * NOT a test file (the `_` prefix and the missing `.test` keep it out of `tests/*.test.mjs`).
 * It is two things at once:
 *
 *   · a **preload** — `node --test --import <this> <files>` patches `StateMachine` before any
 *     test module loads, so every `Controller` those files build is recorded. One trace file per
 *     process is written to `$SM_TRACE_DIR` on exit.
 *   · an **in-process recorder** — `import { record } from './_smtrace.mjs'` gives the same map
 *     for the importing process, which is how `traversal.test.mjs` censuses its own arms without
 *     re-running itself.
 *
 * ── Why the patch is on `set` and nothing else ────────────────────────────────────────────
 * `StateMachine.update()` resolves a transition in exactly one place — `this.set(name)`, on both
 * the `_pending` branch and the priority-poll branch (`States.js:126-159`) — and `set()` is also
 * the only entry point anything outside the machine has. So one wrapper sees every entry there
 * is, and cannot drift the way a list of transition sites would.
 *
 * ── The distinction that makes the census mean anything ───────────────────────────────────
 * `sm.set()` is public and unconditional, so a test can put Sly in any state it likes — the exit
 * census in `traversal.test.mjs` does exactly that for all 32, deliberately. A flat "was this
 * state ever entered" therefore answers "yes, all of them" and is worthless. So each entry is
 * bucketed by whether the machine was resolving at the time:
 *
 *   driven  — the call happened inside `StateMachine.update()`: the machine's own poll or a
 *             state's returned transition chose it. This is the one a player could cause.
 *   forced  — the call came from outside that: a test's `sm.set()`, or `Controller.teleport()`,
 *             which resets through `set('fall')`/`set('idle')` (`Controller.js:1596`).
 *
 * A `forced` entry still runs the real `enter()`/`update()`; it just was not *chosen*.
 *
 * ── What this cannot see ──────────────────────────────────────────────────────────────────
 * Only processes that load `src/player/States.js` are instrumented, and only while this module
 * is loaded into them. A test that never imports the state machine cannot enter a state, so its
 * absence is sound — but that soundness is a property of the *caller's* file list, not of this
 * module, and the caller has to establish it. Entries recorded before `install()` runs are lost;
 * as a preload that is never, as an in-process import it means the importer must import it
 * before it builds a Controller.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { beforeEach } from 'node:test';
import { StateMachine } from '../src/player/States.js';

/**
 * name -> { driven, forced, dfrom, arms, clean }
 *   dfrom  DRIVEN predecessors only
 *   arms   the test arms that DROVE it, by name (see the `beforeEach` below)
 *   clean  the arms that drove it in a run where **nobody had placed Sly** (see `__placed`)
 */
export const record = new Map();

let depth = 0;
let installed = false;
let arm = '(outside any arm)';

/**
 * The two states `Controller.teleport` forces on its way through (`Controller.js:1596`). A forced
 * entry into either of these is a RESET, not a placement — every probe harness in this project
 * starts by teleporting — so they clear the placement flag rather than setting it.
 *
 * **The limit this creates, stated because it flatters coverage:** a test that deliberately drops
 * Sly into a forced `fall` at altitude reads as unplaced. That can only ever flatter the air and
 * ground families; the attach states need a real affordance no forced `fall` supplies.
 */
const RESET_STATES = new Set(['idle', 'fall']);

function note(name, kind, from, placed) {
  let r = record.get(name);
  if (!r) { r = { driven: 0, forced: 0, dfrom: new Set(), arms: new Set(), clean: new Set() }; record.set(name, r); }
  r[kind]++;
  if (kind === 'driven') {
    r.dfrom.add(from);
    r.arms.add(arm);
    if (!placed) r.clean.add(arm);
  }
}

export function install() {
  if (installed) return record;
  installed = true;
  const realSet = StateMachine.prototype.set;
  const realUpdate = StateMachine.prototype.update;
  StateMachine.prototype.set = function (name) {
    const from = this.current ? this.current.name : '(none)';
    const took = realSet.call(this, name);
    // `set` returns false for an unknown name or a no-op re-entry; neither is an entry.
    if (took) {
      const driven = depth > 0;
      note(name, driven ? 'driven' : 'forced', from, !!this.__placed);
      /* The placement flag, per machine. A test that reaches in and calls `sm.set('hookSwing')`
         has PLACED Sly; everything the machine then chooses is downstream of that placement and
         is not evidence that a player could get there. A teleport resets the run and clears it.
         This is what separates "the machine chose it" from "the machine chose it on its own". */
      if (!driven) this.__placed = !RESET_STATES.has(name);
    }
    return took;
  };
  StateMachine.prototype.update = function (dt) {
    depth++;
    try { return realUpdate.call(this, dt); } finally { depth--; }
  };
  /* Per-arm attribution, for free and without touching a single `test()` call. A root-level
     `beforeEach` registered here applies to every top-level test in the process — including from
     a `--import` preload, which is verified rather than assumed: the census's calibration asserts
     the canary's arm name reaches the trace. */
  try { beforeEach((t) => { arm = (t && t.name) || '(unnamed arm)'; }); } catch { /* not under node:test */ }
  return record;
}

/** Plain object, JSON-safe. */
export function snapshot() {
  const out = {};
  for (const [k, v] of record) {
    out[k] = { driven: v.driven, forced: v.forced, dfrom: [...v.dfrom], arms: [...v.arms], clean: [...v.clean] };
  }
  return out;
}

install();

const DIR = process.env.SM_TRACE_DIR;
if (DIR) {
  process.on('exit', () => {
    try {
      mkdirSync(DIR, { recursive: true });
      const who = path.basename(process.argv[1] || 'unknown');
      writeFileSync(path.join(DIR, `${who}.${process.pid}.json`),
        JSON.stringify({ file: who, pid: process.pid, states: snapshot() }));
    } catch { /* a trace that cannot be written must not fail the run it is watching */ }
  });
}
