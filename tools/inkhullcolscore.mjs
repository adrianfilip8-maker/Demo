/**
 * §270 / PREREG-inkblack.md P2 — scorer. The thresholds are the pre-registration's and are not
 * re-derived here:
 *
 *   P2  darkestDecile(B, hullMask) - darkestDecile(D, hullMask) >= 0.030   (authored colour is the locus)
 *   F2  that move < 0.010                                                  (the grade floor is the locus)
 *
 * Between 0.010 and 0.030 is neither: registered as INCONCLUSIVE rather than rounded to whichever
 * side is convenient, because a pre-registration that only defines its two favourite outcomes has
 * a hole in the middle wide enough to put any result through.
 *
 * `hullMask` is the SHIPPED hull's mask, `B != C`, and both deciles are read over that one fixed
 * pixel set — see the capture's header for why the candidate is not allowed to pick its own
 * population.
 *
 * Calibration, all MUST FIRE:
 *   CAL-P2a  hullMask non-empty on every frame          (the hull draws something here at all)
 *   CAL-P2b  arm D rendered with black ink: maxSun == maxShade == 0, and arm B's maxSun > 0
 *   CAL-P2c  sha(D) != sha(B) on every frame            (the colour lever moved the picture)
 */
import { readPNG } from './png.mjs';
import { readFileSync } from 'node:fs';
import { shipVerdict, verdictLine, guardState, PASS, VOID } from './gate.mjs';

const DIR = process.env.SANDS_OUT || 'shots/inkhullcol';
const arms = JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8'));

const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function diffMask(a, b) {
  if (a.w !== b.w || a.h !== b.h) return null;
  const idx = [];
  for (let i = 0, n = a.w * a.h; i < n; i++) {
    const p = i * a.ch, q = i * b.ch;
    if (a.data[p] !== b.data[q] || a.data[p + 1] !== b.data[q + 1] || a.data[p + 2] !== b.data[q + 2]) idx.push(i);
  }
  return idx;
}

function decile(im, idx, q = 0.10) {
  if (!idx.length) return null;
  const v = new Float64Array(idx.length);
  for (let k = 0; k < idx.length; k++) {
    const p = idx[k] * im.ch;
    v[k] = luma(im.data[p], im.data[p + 1], im.data[p + 2]);
  }
  v.sort();
  return v[Math.floor(v.length * q)];
}

const byShot = new Map();
for (const r of arms) {
  if (!byShot.has(r.shot)) byShot.set(r.shot, {});
  byShot.get(r.shot)[r.arm] = r;
}

const rows = [];
const calA = [], calB = [], calC = [];

for (const [shot, a] of byShot) {
  const B = a['B-authored'], C = a['C-noink'], D = a['D-blackhull'];
  if (!B || !C || !D) { rows.push({ shot, note: 'missing arm' }); calA.push(false); calB.push(false); calC.push(false); continue; }

  calB.push(D.applied?.maxSun === 0 && D.applied?.maxShade === 0 && B.applied?.maxSun > 0);
  calC.push(D.sha !== B.sha);

  const imB = readPNG(B.file), imC = readPNG(C.file), imD = readPNG(D.file);
  const hullMask = diffMask(imB, imC);
  const hullMaskD = diffMask(imD, imC);
  if (!hullMask || !hullMaskD) { rows.push({ shot, note: 'size mismatch' }); calA.push(false); continue; }
  calA.push(hullMask.length > 0);

  const dB = decile(imB, hullMask);
  const dD = decile(imD, hullMask);
  rows.push({
    shot,
    nHull: hullMask.length, nHullD: hullMaskD.length,
    dB, dD,
    move: (dB != null && dD != null) ? dB - dD : null,
    medB: decile(imB, hullMask, 0.50), medD: decile(imD, hullMask, 0.50),
    maxSunB: B.applied?.maxSun, maxSunD: D.applied?.maxSun,
  });
}

console.log('shot          hull px   hullD px    dec(B)    dec(D)     move    med(B)   med(D)');
for (const r of rows) {
  if (r.note) { console.log(`  ${r.shot.padEnd(12)} ${r.note}`); continue; }
  const f = (x) => (x == null ? '  n/a ' : x.toFixed(4));
  console.log(`  ${r.shot.padEnd(12)} ${String(r.nHull).padStart(7)} ${String(r.nHullD).padStart(9)}    `
    + `${f(r.dB)}    ${f(r.dD)}   ${f(r.move)}   ${f(r.medB)}   ${f(r.medD)}`);
}

/* P2 is scored on the WORST shot, not the mean. A fix that reaches black on eight frames and
   not on two has not fixed the defect the critic measured on all ten. */
const usable = rows.filter((r) => !r.note && r.move != null);
const moves = usable.map((r) => r.move);
const worst = moves.length ? Math.min(...moves) : null;
const p2 = moves.length ? worst >= 0.030 : null;
const f2 = moves.length ? worst < 0.010 : null;

const all = (xs) => (xs.length ? xs.every(Boolean) : null);
const guards = {
  'CAL-P2a hull draws':          all(calA),
  'CAL-P2b black ink applied':   all(calB),
  'CAL-P2c colour lever moved':  all(calC),
  'P2 authored colour is locus': p2,
};

console.log('');
for (const [k, v] of Object.entries(guards)) console.log(`  ${guardState(v).padEnd(4)}  ${k}`);
if (worst != null) {
  console.log(`\n  worst move over the shipped hullMask = ${worst.toFixed(4)} L`);
  console.log('  registered: >= 0.0300 meets P2 | < 0.0100 fires F2 | between = INCONCLUSIVE');
}

const v = shipVerdict(guards);
console.log('\n' + verdictLine(v));

const calStates = ['CAL-P2a hull draws', 'CAL-P2b black ink applied', 'CAL-P2c colour lever moved']
  .map((k) => guardState(guards[k]));
let outcome;
if (calStates.some((s) => s !== PASS) || guardState(p2) === VOID) outcome = 'VOID';
else if (p2) outcome = 'P2 MET — the hull\'s authored colour is the locus of the ink black point';
else if (f2) outcome = 'F2 FIRED — the authored colour is NOT the locus; the wall is the grade chain\'s own floor';
else outcome = 'INCONCLUSIVE — the move landed between the registered thresholds (0.010 .. 0.030)';
console.log(`OUTCOME: ${outcome}`);
