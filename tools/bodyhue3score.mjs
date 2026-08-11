/**
 * §D2 / PREREG-bodyhue3.md — scorer. Thresholds transcribed from the seal, not re-derived.
 *
 *   CAL-1  costumeMask non-empty and >= 0.20% of the frame on each shot
 *   CAL-2  sha(A) != sha(B), and the swap reported the mode it was asked for
 *   CAL-3  at most 2.0% of the mask differs by <= 2 levels  (boot noise measured absent)
 *   P1     median hue moves -21.1 +/- 4.0 from A to B
 *   F1     a shift outside -10 .. -32 refutes the MECHANISM
 *   P2     arm B's median hue within +/- 6.0 of 213.5
 *   F2     outside refutes the TARGET even if P1 passes
 *
 * PASS · MECHANISM-ONLY · FAIL · VOID. Only PASS may flip bodyMode()'s default off 'raw', and only
 * with the two-shot limit stated alongside it (PREREG-bodyhue3 §3).
 */
import { readFileSync } from 'node:fs';
import { shipVerdict, verdictLine, guardState, PASS, VOID } from './gate.mjs';

const DIR = process.env.SANDS_OUT || 'shots/bodyhue3';
const rows = JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8'));

const REF = 213.5, ROT = -21.1, P1_TOL = 4.0, P2_TOL = 6.0;
const F1_LO = -32.0, F1_HI = -10.0, COV_MIN = 0.0020, TINY_MAX = 0.020;

console.log('shot           mask px    cov%   <=2 share   hue A     hue B     shift');
for (const r of rows) {
  const sh = (r.hueA != null && r.hueB != null) ? (r.hueB - r.hueA) : null;
  console.log(`  ${r.shot.padEnd(13)} ${String(r.n).padStart(7)}  ${(100 * r.cov).toFixed(2).padStart(5)}   `
    + `${(100 * r.tinyShare).toFixed(2).padStart(6)}%   ${(r.hueA ?? NaN).toFixed(1).padStart(6)}°  `
    + `${(r.hueB ?? NaN).toFixed(1).padStart(6)}°  ${sh == null ? '  n/a' : sh.toFixed(1).padStart(6)}°`
    + `${r.straddle ? '  STRADDLE — median invalid' : ''}`);
}

const usable = rows.filter((r) => r.hueA != null && r.hueB != null && !r.straddle);
const shifts = usable.map((r) => r.hueB - r.hueA);
const targets = usable.map((r) => Math.abs(r.hueB - REF));

const all = (xs) => (xs.length ? xs.every(Boolean) : null);
const cal1 = all(rows.map((r) => r.n > 0 && r.cov >= COV_MIN));
const cal2 = all(rows.map((r) => r['A-raw'].sha !== r['B-fix'].sha && r.modeA === 'raw' && r.modeB === 'fix'));
const cal3 = all(rows.map((r) => !r.straddle));
/* null, not false, when nothing measurable survived: unevaluable is VOID, never FAIL. */
const p1 = shifts.length ? shifts.every((s) => Math.abs(s - ROT) <= P1_TOL) : null;
const f1 = shifts.length ? shifts.some((s) => s < F1_LO || s > F1_HI) : null;
const p2 = targets.length ? targets.every((t) => t <= P2_TOL) : null;

const guards = {
  'CAL-1 mask is the costume':  cal1,
  'CAL-2 swap took':            cal2,
  'CAL-3 no straddle': cal3,
  'P1 mechanism (-21.1±4.0)':   p1,
  'P2 target (213.5±6.0)':      p2,
};

console.log('');
for (const [k, v] of Object.entries(guards)) console.log(`  ${guardState(v).padEnd(4)}  ${k}`);
if (shifts.length) {
  console.log(`\n  shift ${Math.min(...shifts).toFixed(1)}° .. ${Math.max(...shifts).toFixed(1)}°   `
    + `(F1 refutes outside ${F1_LO}..${F1_HI})`);
  console.log(`  |hue B - ${REF}| worst ${Math.max(...targets).toFixed(1)}°   (P2 bar ${P2_TOL})`);
}

console.log('\n' + verdictLine(shipVerdict(guards)));

const cals = [cal1, cal2, cal3].map(guardState);
let outcome;
if (cals.some((s) => s !== PASS) || guardState(p1) === VOID) outcome = 'VOID';
else if (guardState(p1) !== PASS) {
  outcome = f1 ? 'FAIL — F1 fired, the pre-compensation mechanism is refuted'
               : 'FAIL — P1 missed its band without F1 firing';
} else {
  outcome = guardState(p2) === PASS
    ? 'PASS — bodyMode() default MAY flip off raw, stating the two-shot limit alongside it'
    : 'MECHANISM-ONLY — the rotation behaves as authored but 207.9° was the wrong target; needs a NEW seal';
}
console.log(`OUTCOME: ${outcome}`);
