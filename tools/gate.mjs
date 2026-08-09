/**
 * gate.mjs — tri-state guard evaluation for pre-registered ship rules.
 *
 * ── Why this module exists ──────────────────────────────────────────────────────────────────
 * A pre-registered guard has **three** outcomes, not two:
 *
 *   PASS  the guard was evaluated and the candidate satisfied it
 *   FAIL  the guard was evaluated and the candidate did not satisfy it
 *   VOID  the guard could NOT be evaluated — its instrument went blind, or the population it
 *         is defined over was not present in the frames
 *
 * Only PASS may ship. **VOID is not PASS**, and the whole value of a calibration arm depends on
 * a scorer that knows the difference. Five runs were voided in one week on calibration arms that
 * failed; every one of those voids is worth nothing if the scorer then treats "could not score"
 * as "scored, fine".
 *
 * ── The failure this exists to prevent, which already happened ─────────────────────────────
 * KNOWN_ISSUES §263.1. `specnorm.mjs`'s gate line read
 *
 *     guards: G1 && G2 && G3 && G4 !== false && G5 !== false
 *
 * G4 came back **null** — unscoreable, because its class-map calibration (I5) had gone BLIND and,
 * independently, the population it names held 23 px on the shot it was registered for. `null !==
 * false` is `true`, so the run **printed `==> SHIP uSpecNormPow 1` on a defect it had correctly
 * detected and reported four lines earlier.** The scorer's own output contradicted its own I5
 * line, and only the registered text settled it.
 *
 * So: `guardState` maps ANYTHING that is not exactly `true`/`false` to VOID, including `null`,
 * `undefined`, `NaN`, `0`, `''` and `'n/a'`. A guard that is not a boolean is a guard that was
 * not evaluated, and the safe reading of "not evaluated" is never "passed".
 *
 * ── Deliberately not a static lint ─────────────────────────────────────────────────────────
 * A repo-wide grep for `!== false` was tried and rejected: 8 files match and almost all are
 * ordinary null-guards (`grain1-score.mjs` uses `G1 !== null && G1 < 40`, which is the CORRECT
 * fail-closed shape). Flagging them would be §248's census-that-cries-wolf. The rule is enforced
 * behaviourally, on this module, by `tests/voidgate.test.mjs`.
 */

export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const VOID = 'VOID';

/**
 * Normalise one guard result to a tri-state. Fail-closed by construction: the ONLY input that
 * yields PASS is the boolean `true`, and the only input that yields FAIL is the boolean `false`.
 * Everything else — null, undefined, NaN, numbers, strings — is VOID, because a guard that did
 * not produce a boolean did not produce a verdict.
 */
export function guardState(v) {
  if (v === true) return PASS;
  if (v === false) return FAIL;
  return VOID;
}

/**
 * Evaluate a set of named guards into a ship decision.
 *
 * @param {Record<string, unknown>} guards  name -> guard result
 * @returns {{ship: boolean, states: Record<string,string>, blocking: {guard: string, state: string}[],
 *            voided: string[], failed: string[]}}
 *
 * `ship` is true only when EVERY guard is exactly PASS. `voided` and `failed` are kept apart
 * because they mean different things and have different remedies: a FAIL is a result about the
 * candidate, a VOID is a defect in the run.
 */
export function shipVerdict(guards) {
  const states = {}, blocking = [], voided = [], failed = [];
  for (const [name, v] of Object.entries(guards)) {
    const s = guardState(v);
    states[name] = s;
    if (s === PASS) continue;
    blocking.push({ guard: name, state: s });
    (s === VOID ? voided : failed).push(name);
  }
  return { ship: blocking.length === 0, states, blocking, voided, failed };
}

/**
 * Render the verdict as the single line a runner prints.
 *
 * The line begins with `==> SHIP ` **only** when `v.ship` is true; every other outcome begins
 * `==> DO NOT SHIP`. A caller that wants to know whether to ship must read `v.ship` — matching
 * the substring "SHIP" is not a test, because "DO NOT SHIP" contains it.
 */
export function verdictLine(v, shipDescription = '') {
  if (v.ship) return `==> SHIP ${shipDescription}`.trimEnd();
  const why = v.blocking.map((b) => `${b.guard} ${b.state}`).join(', ');
  const note = v.voided.length
    ? `  (VOID is not PASS — ${v.voided.join(', ')} could not be evaluated)` : '';
  return `==> DO NOT SHIP — ${why}${note}`;
}
