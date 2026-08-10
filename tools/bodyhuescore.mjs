/**
 * §D2 / PREREG-bodyhue.md — scorer. Every threshold below is transcribed from the sealed
 * pre-registration and is NOT re-derived here. Changing one after seeing the candidate is the
 * §141.1 violation the whole apparatus exists to prevent.
 *
 *   CAL-1  costumeMask non-empty on all four shots, and >= 0.20% of frame on the two character
 *          shots (sly-closeup, sly-perch)
 *   CAL-2  sha(A) != sha(B) on every shot, and each page reports the body param it was given
 *   P1     median hue over costumeMask moves by -21.1 +/- 4.0 degrees from A to B
 *   F1     a shift outside -10 .. -32 refutes the pre-compensation MECHANISM
 *   P2     arm B's median hue is within +/- 6.0 of the reference's 213.5
 *   F2     outside that refutes the TARGET even if P1 passes
 *
 * Outcomes: PASS · MECHANISM-ONLY (P1 met, P2 refuted) · FAIL (P1 refuted) · VOID (a calibration
 * arm null). Only PASS may flip bodyMode()'s default off 'raw'.
 */
import { readPNG } from './png.mjs';
import { readFileSync } from 'node:fs';
import { shipVerdict, verdictLine, guardState, PASS, VOID } from './gate.mjs';

const DIR = process.env.SANDS_OUT || 'shots/bodyhue';
const arms = JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8'));

const REF_HUE = 213.5, ROT = -21.1, P1_TOL = 4.0, P2_TOL = 6.0;
const F1_LO = -32.0, F1_HI = -10.0;
const CHAR_SHOTS = new Set(['sly-closeup', 'sly-perch']);

function hue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  let h = 0;
  if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const byShot = new Map();
for (const r of arms) {
  if (!byShot.has(r.shot)) byShot.set(r.shot, {});
  byShot.get(r.shot)[r.arm] = r;
}

const rows = [];
const cal1 = [], cal2 = [];

for (const [shot, a] of byShot) {
  const A = a['A-raw'], B = a['B-fix'];
  if (!A || !B) { rows.push({ shot, note: 'missing arm' }); cal1.push(false); cal2.push(false); continue; }

  cal2.push(A.sha !== B.sha && A.bodyParam === 'raw' && B.bodyParam === 'fix');

  const ia = readPNG(A.file), ib = readPNG(B.file);
  if (ia.w !== ib.w || ia.h !== ib.h) { rows.push({ shot, note: 'size mismatch' }); cal1.push(false); continue; }

  const hA = [], hB = [];
  let n = 0;
  for (let i = 0, px = ia.w * ia.h; i < px; i++) {
    const o = i * ia.ch, p = i * ib.ch;
    if (ia.data[o] === ib.data[p] && ia.data[o + 1] === ib.data[p + 1] && ia.data[o + 2] === ib.data[p + 2]) continue;
    n++;
    const a1 = hue(ia.data[o], ia.data[o + 1], ia.data[o + 2]);
    const b1 = hue(ib.data[p], ib.data[p + 1], ib.data[p + 2]);
    if (a1 != null) hA.push(a1);
    if (b1 != null) hB.push(b1);
  }
  const cov = n / (ia.w * ia.h);
  cal1.push(n > 0 && (!CHAR_SHOTS.has(shot) || cov >= 0.0020));

  /* Circular-median guard. A plain median is only valid while the set does not straddle 0/360.
     These hues cluster near 210-235 so it should not, but "should not" is not a check. */
  const straddle = (arr) => arr.some((x) => x < 30) && arr.some((x) => x > 330);
  const bad = straddle(hA) || straddle(hB);

  rows.push({
    shot, n, cov,
    mA: hA.length ? med(hA) : null,
    mB: hB.length ? med(hB) : null,
    straddle: bad,
  });
}

console.log('shot           mask px    cov%    hue A      hue B      shift');
for (const r of rows) {
  if (r.note) { console.log(`  ${r.shot.padEnd(13)} ${r.note}`); continue; }
  const f = (x) => (x == null ? '  n/a ' : x.toFixed(1).padStart(6));
  const sh = (r.mA != null && r.mB != null) ? (r.mB - r.mA).toFixed(1).padStart(6) : '   n/a';
  console.log(`  ${r.shot.padEnd(13)} ${String(r.n).padStart(7)}  ${(100 * r.cov).toFixed(2).padStart(5)}   `
    + `${f(r.mA)}°   ${f(r.mB)}°   ${sh}°${r.straddle ? '  STRADDLES 0/360 — median invalid' : ''}`);
}

const usable = rows.filter((r) => !r.note && r.mA != null && r.mB != null && !r.straddle);
const shifts = usable.map((r) => r.mB - r.mA);
const targets = usable.map((r) => Math.abs(r.mB - REF_HUE));

const all = (xs) => (xs.length ? xs.every(Boolean) : null);
/* null, not false, when nothing was measurable: "could not be evaluated" is VOID, never FAIL. */
const p1 = shifts.length ? shifts.every((s) => Math.abs(s - ROT) <= P1_TOL) : null;
const f1 = shifts.length ? shifts.some((s) => s < F1_LO || s > F1_HI) : null;
const p2 = targets.length ? targets.every((t) => t <= P2_TOL) : null;

const guards = {
  'CAL-1 mask is the costume': all(cal1),
  'CAL-2 lever took':          all(cal2),
  'P1 mechanism (-21.1±4.0)':  p1,
  'P2 target (213.5±6.0)':     p2,
};

console.log('');
for (const [k, v] of Object.entries(guards)) console.log(`  ${guardState(v).padEnd(4)}  ${k}`);
if (shifts.length) {
  console.log(`\n  shift range ${Math.min(...shifts).toFixed(1)}° .. ${Math.max(...shifts).toFixed(1)}°`
    + `   (F1 refutes outside ${F1_LO}..${F1_HI})`);
  console.log(`  |hue B - ${REF_HUE}| worst ${Math.max(...targets).toFixed(1)}°   (P2 bar ${P2_TOL})`);
}

const v = shipVerdict(guards);
console.log('\n' + verdictLine(v));

const calStates = ['CAL-1 mask is the costume', 'CAL-2 lever took'].map((k) => guardState(guards[k]));
let outcome;
if (calStates.some((s) => s !== PASS) || guardState(p1) === VOID) outcome = 'VOID';
else if (guardState(p1) !== PASS) outcome = f1 ? 'FAIL — F1 fired, the pre-compensation mechanism is refuted'
                                               : 'FAIL — P1 missed its band without F1 firing';
else outcome = (guardState(p2) === PASS)
  ? 'PASS — the rotation lands on the reference; bodyMode() default MAY flip off raw'
  : 'MECHANISM-ONLY — P1 met, P2 refuted: the rotation behaves as authored but 207.9° was the wrong target. Needs a NEW seal, not an adjusted one.';
console.log(`OUTCOME: ${outcome}`);
