import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PASS, FAIL, VOID, guardState, shipVerdict, verdictLine } from '../tools/gate.mjs';

/**
 * A scorer must never turn "could not be evaluated" into "passed".
 *
 * ── Why this is a test and not a comment ────────────────────────────────────────────────────
 * **It already happened, and the scorer that did it had detected the defect itself.**
 * KNOWN_ISSUES §263.1: `progress/records/specnorm.mjs` scored a pre-registered ship rule whose
 * guard G4 came back `null` — unscoreable, because its class-map calibration I5 had gone BLIND
 * and, independently, the pixel population G4 is defined over held 23 px on the shot it was
 * registered for. The gate line read
 *
 *     guards: G1 && G2 && G3 && G4 !== false && G5 !== false
 *
 * and `null !== false` is `true`. The run printed **`==> SHIP uSpecNormPow 1`** four lines below
 * its own `I5 BLIND — ALL per-class attribution in this run is VOID`. Two lines of the same
 * output contradicted each other and only the registered prose settled it.
 *
 * The blast radius is the whole method: five runs were voided in one week on calibration arms
 * that failed, and every one of those voids is worth nothing if the scorer reads VOID as PASS.
 *
 * ── Why the rule is narrow ─────────────────────────────────────────────────────────────────
 * A repo-wide grep for `!== false` was tried and rejected. Eight files match and nearly all are
 * ordinary null-guards — `grain1-score.mjs` uses `G1 !== null && G1 < 40`, which is the CORRECT
 * fail-closed shape. Asserting on the substring would flag correct code, be ignored within a
 * day, and reproduce §248's census-that-cries-wolf. So the semantics are pinned behaviourally on
 * `tools/gate.mjs`, and the one file that got it wrong is locked to using it.
 */

test('guardState: only the boolean true is PASS', () => {
  assert.equal(guardState(true), PASS);
  assert.equal(guardState(false), FAIL);
});

test('guardState: every non-boolean is VOID, never PASS', () => {
  for (const v of [null, undefined, NaN, 0, 1, -1, '', 'n/a', 'PASS', 'pass', [], {}, () => {}]) {
    assert.equal(guardState(v), VOID, `${String(v)} must be VOID`);
    assert.notEqual(guardState(v), PASS, `${String(v)} must never be PASS`);
  }
});

test('shipVerdict ships only when every guard is PASS', () => {
  const v = shipVerdict({ G1: true, G2: true, G3: true });
  assert.equal(v.ship, true);
  assert.deepEqual(v.blocking, []);
});

test('THE §263.1 REGRESSION: one VOID guard must block the ship, and must not print SHIP', () => {
  // Exactly the shape of the registered run: G1/G2/G3/G5 pass, G4 unscoreable.
  const v = shipVerdict({ G1: true, G2: true, G3: true, G4: null, G5: true });

  assert.equal(v.ship, false, 'a VOID guard must block the ship');
  assert.deepEqual(v.voided, ['G4']);
  assert.deepEqual(v.failed, [], 'VOID must not be reported as FAIL — they have different remedies');

  const line = verdictLine(v, 'uSpecNormPow 1');
  assert.ok(!line.startsWith('==> SHIP'), `verdict must not announce SHIP, got: ${line}`);
  assert.ok(line.includes('DO NOT SHIP'), line);
  assert.ok(line.includes('G4 VOID'), `the verdict must name the void guard, got: ${line}`);

  // And the historical defect itself: the old expression would have shipped this input.
  const oldExpression = true && true && true && (null !== false) && (true !== false);
  assert.equal(oldExpression, true, 'sanity: the old gate did pass a null guard');
  assert.notEqual(v.ship, oldExpression, 'the fix must disagree with the old gate on this input');
});

test('a VOID guard blocks even when every other guard passes and the deliverable is met', () => {
  // H1 3/4 and every measurable guard green is exactly the specnorm situation. Still no ship.
  const v = shipVerdict({ G1: true, G2: true, G3: true, G4: undefined, G5: true });
  assert.equal(v.ship, false);
});

test('FAIL and VOID are both blocking but stay distinguishable', () => {
  const v = shipVerdict({ A: false, B: null, C: true });
  assert.equal(v.ship, false);
  assert.deepEqual(v.failed, ['A']);
  assert.deepEqual(v.voided, ['B']);
  assert.equal(v.states.C, PASS);
});

test('verdictLine only starts with "==> SHIP " when the verdict actually ships', () => {
  const ok = verdictLine(shipVerdict({ A: true }), 'thing 1');
  assert.equal(ok, '==> SHIP thing 1');
  for (const bad of [{ A: false }, { A: null }, { A: undefined }, { A: NaN }, { A: 0 }]) {
    assert.ok(!verdictLine(shipVerdict(bad)).startsWith('==> SHIP'));
  }
});

test('specnorm.mjs — the scorer that shipped the bug — is locked to the fail-closed helper', () => {
  const src = readFileSync(join(import.meta.dirname, '../progress/records/specnorm.mjs'), 'utf8');
  // The bug, verbatim. It must not come back in this file.
  assert.ok(!/guards:\s*[^\n]*!==\s*false/.test(src),
    'specnorm.mjs must not gate a ship decision on `!== false` — that reads VOID as PASS (§263.1)');
  assert.ok(/passed\s*\(/.test(src) || /shipVerdict|guardState/.test(src),
    'specnorm.mjs must decide via an explicit tri-state, not a truthiness test');
});
