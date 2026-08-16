/**
 * _armhook.mjs — records every assertion an arm actually EXECUTES.
 *
 * A preload for `node --import ./tools/_armhook.mjs --test <files>`. Not a test file and not
 * importable as one; it exists to answer one question with evidence rather than by reading code:
 *
 *   **which assertions in this suite never run at all?**
 *
 * An assertion that never executes cannot fail. It is the purest member of the class this ledger
 * keeps finding — a bar that cannot say "no" — and unlike the subtler members it is *decidable*:
 * compare the assertions the source contains against the assertions the process observed, and the
 * difference is a list of things that have never been checked, however confidently they are worded.
 *
 * ── How the patch reaches the test file ──────────────────────────────────────────────────────
 * `node:assert/strict`'s default export is one shared callable object. A `--import` preload runs
 * before any test module is evaluated, so mutating that object's methods here means every later
 * `import assert from 'node:assert/strict'` receives the wrapped versions — same reference, no
 * loader hooks, no source rewriting. The suite is measured exactly as it ships.
 *
 * ── What it CANNOT tell you, stated because it flatters the result ───────────────────────────
 * "Executed" is not "able to fail". An assertion can run on every arm and still be vacuous if its
 * predicate is true for every input in the reachable domain — `assert.ok(dist >= 0)` on a distance
 * runs happily forever. This instrument is sound for the never-run mode and says nothing about the
 * always-true mode; that one needs inversion, which `tools/armaudit.mjs` does separately on the
 * sites this one reports as live. Reporting a clean run here as "the arms are fine" would be the
 * same error the audit exists to find.
 *
 * Output: JSON to $ARM_HOOK_OUT (default /tmp/armhook.json).
 */
import assert from 'node:assert/strict';
import { beforeEach } from 'node:test';
import { writeFileSync } from 'node:fs';

const OUT = process.env.ARM_HOOK_OUT || '/tmp/armhook.json';
const HERE = 'tools/_armhook.mjs';

/** `${file}:${line}` -> { method, arms:Set, calls, fails } */
const seen = new Map();
let arm = '(outside any arm)';

/* Keep the capture shallow: the wrapper only needs the frame that called it, and formatting a
   40-frame stack on every one of several thousand assertions is the difference between an
   instrument and a hang. Learned in `tools/sweepcensus.mjs` the expensive way. */
function siteOf() {
  const lim = Error.stackTraceLimit;
  Error.stackTraceLimit = 4;
  const st = new Error().stack;
  Error.stackTraceLimit = lim;
  const lines = st.split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].includes(HERE)) continue;
    const m = /\(?((?:file:\/\/)?[^()\s]+):(\d+):(\d+)\)?\s*$/.exec(lines[i]);
    if (!m) continue;
    const f = m[1].replace(/^file:\/\//, '');
    if (f.includes('/tools/_armhook.mjs')) continue;
    if (f.startsWith('node:')) continue;
    return `${f}:${m[2]}`;
  }
  return '(unknown)';
}

function record(method, site, failed) {
  let e = seen.get(site);
  if (!e) { e = { method, arms: new Set(), calls: 0, fails: 0 }; seen.set(site, e); }
  e.calls++;
  if (failed) e.fails++;
  e.arms.add(arm);
}

/**
 * `ARM_INVERT=<file>:<line>` flips exactly one assertion's verdict at RUNTIME, and the arm is then
 * expected to go red. If it stays green, that assertion's truth value does not affect its own arm.
 *
 * Done here rather than by rewriting the source, because both obvious source rewrites are broken
 * and neither announces it:
 *   · copying the file to a tmp dir breaks its relative imports, so the run fails for an unrelated
 *     reason and EVERY site reports "kills" — a check that cannot say no, which is the exact class
 *     this audit exists to find, committed inside the audit;
 *   · textual `assert.ok(` -> `assert.ok(!` mis-parses, because the first argument is an expression:
 *     `!Math.abs(d) < 0.01` negates the operand, not the comparison, and then compares a boolean.
 * Flipping the already-evaluated argument has neither failure mode.
 */
const INVERT = process.env.ARM_INVERT || '';
const inverted = { fired: false };
/* Cannot equal anything the suite produces, under either equal() or deepEqual(). */
const INVERT_SENTINEL = Symbol('arm-invert');

for (const name of ['ok', 'equal', 'notEqual', 'deepEqual', 'notDeepEqual', 'strictEqual', 'match', 'fail', 'throws']) {
  const orig = assert[name];
  if (typeof orig !== 'function') continue;
  assert[name] = function (...args) {
    const site = siteOf();
    if (INVERT && site.endsWith(INVERT)) {
      inverted.fired = true;
      // Each case is mutated so the assertion MUST now throw. If the arm still ends green, that
      // assertion does not affect its own arm's outcome.
      if (name === 'ok' || name === 'match' || name === 'throws') args[0] = !args[0];
      else if (name === 'notEqual' || name === 'notDeepEqual') args[1] = args[0];
      else if (args.length >= 2) args[1] = INVERT_SENTINEL;
    }
    try {
      const r = orig.apply(this, args);
      record(name, site, false);
      return r;
    } catch (err) {
      record(name, site, true);
      throw err;
    }
  };
}

try { beforeEach((t) => { arm = (t && t.name) || '(unnamed arm)'; }); } catch { /* not under node:test */ }

process.on('exit', () => {
  const out = {};
  for (const [site, e] of seen) out[site] = { method: e.method, calls: e.calls, fails: e.fails, arms: [...e.arms] };
  try { writeFileSync(OUT, JSON.stringify(out, null, 1)); } catch { /* nothing to be done at exit */ }
  /* The distinction that keeps the inversion honest. A nominated site that never executed in this
     filtered run leaves the arm green for a reason that has nothing to do with the assertion, and
     scoring that as "survives" would manufacture findings — the false-positive twin of the class
     being audited. The caller reads this line and reports NOT REACHED instead. */
  if (INVERT) console.log(`ARM_INVERT_FIRED=${inverted.fired ? 1 : 0} SITE=${INVERT}`);
});
