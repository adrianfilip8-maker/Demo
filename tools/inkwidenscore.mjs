/**
 * §270 / PREREG-inkwiden.md — scorer. Thresholds are the pre-registration's, not re-derived.
 *
 *   CAL-W1  inkMask non-empty and 0.5%..15% of every frame
 *   CAL-W2  T1-colour and T2-gate each change at least one pixel  (both levers live)
 *   CAL-W3  W-both changes LESS of inkMask on `dunes` than on `night`  (specificity)
 *   W1      p10(W-both) <= p10(S-ship) - 0.030 L on every frame     | FW1 under 0.015
 *   W2      p90/p10 rises AND p90 drops by no more than 0.010 L     | FW2 otherwise
 *   W3      the added darkening stays line-shaped: largest component <= 2% of frame
 *           and median minimum chord <= 4 px                        | FW3 otherwise
 *
 * W2 is the design constraint made falsifiable. The lane was told that reaching black must not
 * flatten the ink to a uniform grey, and "the floor came down" cannot distinguish widening from
 * darkening on its own — so the lit end is gated too, and a candidate that buys its floor by
 * pulling the whole line down is refuted even when W1 passes.
 */
import { readPNG } from './png.mjs';
import { medianChord, largestComponent, selfTest } from './chord.mjs';
import { readFileSync } from 'node:fs';
import { shipVerdict, verdictLine, guardState, PASS } from './gate.mjs';

selfTest();   // never score with an instrument that has not just proven it discriminates

const DIR = process.env.SANDS_OUT || 'shots/inkwiden';
const arms = JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8'));

const luma = (im, i) => (0.2126 * im.data[i * im.ch] + 0.7152 * im.data[i * im.ch + 1]
  + 0.0722 * im.data[i * im.ch + 2]) / 255;

function differs(a, b, i) {
  const p = i * a.ch, q = i * b.ch;
  return a.data[p] !== b.data[q] || a.data[p + 1] !== b.data[q + 1] || a.data[p + 2] !== b.data[q + 2];
}

function maskOf(a, b) {
  const m = new Uint8Array(a.w * a.h);
  for (let i = 0; i < m.length; i++) if (differs(a, b, i)) m[i] = 1;
  return m;
}

/** Quantiles of `im`'s luma restricted to a boolean mask. */
function quant(im, mask) {
  const v = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) v.push(luma(im, i));
  if (!v.length) return null;
  v.sort((a, b) => a - b);
  const q = (p) => v[Math.floor(v.length * p)];
  return { p10: q(0.10), p50: q(0.50), p90: q(0.90), n: v.length };
}

const byShot = new Map();
for (const r of arms) {
  if (!byShot.has(r.shot)) byShot.set(r.shot, {});
  byShot.get(r.shot)[r.arm] = r;
}

const rows = [];
const c1 = [], c2 = [], w1 = [], w2 = [], w3 = [];
const changedFrac = new Map();

for (const [shot, a] of byShot) {
  const S = a['S-ship'], T1 = a['T1-colour'], T2 = a['T2-gate'], W = a['W-both'], Z = a['Z-noink'];
  if (!S || !T1 || !T2 || !W || !Z) {
    rows.push({ shot, note: 'missing arm' });
    c1.push(false); c2.push(false); w1.push(false); w2.push(false); w3.push(false);
    continue;
  }

  const imS = readPNG(S.file), imT1 = readPNG(T1.file), imT2 = readPNG(T2.file),
    imW = readPNG(W.file), imZ = readPNG(Z.file);
  const { w: WD, h: HT } = imS;

  const mask = maskOf(imS, imZ);
  let nMask = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) nMask++;
  const cov = nMask / (WD * HT);
  c1.push(nMask > 0 && cov >= 0.005 && cov <= 0.15);
  c2.push(S.sha !== T1.sha && S.sha !== T2.sha);

  const qS = quant(imS, mask), qT1 = quant(imT1, mask), qT2 = quant(imT2, mask), qW = quant(imW, mask);

  /* How much of the mask the candidate actually moved — CAL-W3's specificity comparison. */
  let moved = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] && differs(imS, imW, i)) moved++;
  changedFrac.set(shot, nMask ? moved / nMask : 0);

  /* W3: the ADDED darkening, frame-wide rather than inside the mask — the mush the gate guards
     against would appear as new dark area OUTSIDE the shipped ink's own pixels, so scoring it
     inside the mask would look at the one place it cannot be. 4 L is the registered floor for
     "darkened", well above 8-bit dither. */
  const added = new Uint8Array(WD * HT);
  let nAdded = 0;
  for (let i = 0; i < added.length; i++) {
    if (luma(imS, i) - luma(imW, i) >= 4 / 255) { added[i] = 1; nAdded++; }
  }
  const big = nAdded ? largestComponent(added, WD, HT) : 0;
  const chord = nAdded ? medianChord(added, WD, HT) : null;
  const bigFrac = big / (WD * HT);
  w3.push(nAdded === 0 || (bigFrac <= 0.02 && chord != null && chord <= 4));

  const dropP10 = qS && qW ? qS.p10 - qW.p10 : null;
  const dropP90 = qS && qW ? qS.p90 - qW.p90 : null;
  const spreadS = qS && qS.p10 > 0 ? qS.p90 / qS.p10 : null;
  const spreadW = qW && qW.p10 > 0 ? qW.p90 / qW.p10 : null;

  w1.push(dropP10 != null && dropP10 >= 0.030);
  w2.push(spreadS != null && spreadW != null && spreadW > spreadS && dropP90 != null && dropP90 <= 0.010);

  rows.push({
    shot, nMask, cov, qS, qT1, qT2, qW, dropP10, dropP90, spreadS, spreadW,
    nAdded, big, bigFrac, chord, movedFrac: changedFrac.get(shot),
  });
}

console.log('shot          mask px  cov%    p10 S    p10 T1   p10 T2   p10 W    dp10     p90 S    p90 W    spread S -> W');
for (const r of rows) {
  if (r.note) { console.log(`  ${r.shot.padEnd(12)} ${r.note}`); continue; }
  const f = (x) => (x == null ? ' n/a  ' : x.toFixed(4));
  console.log(`  ${r.shot.padEnd(12)} ${String(r.nMask).padStart(7)} ${(100 * r.cov).toFixed(2).padStart(5)}  `
    + `${f(r.qS?.p10)}   ${f(r.qT1?.p10)}   ${f(r.qT2?.p10)}   ${f(r.qW?.p10)}   ${f(r.dropP10)}   `
    + `${f(r.qS?.p90)}   ${f(r.qW?.p90)}   ${r.spreadS?.toFixed(2)} -> ${r.spreadW?.toFixed(2)}`);
}

console.log('\nW3, the mush falsifier (added darkening >= 4 L, frame-wide)');
for (const r of rows) {
  if (r.note) continue;
  console.log(`  ${r.shot.padEnd(12)} ${String(r.nAdded).padStart(7)} px darkened, largest component `
    + `${String(r.big).padStart(7)} (${(100 * r.bigFrac).toFixed(2)}% of frame, bar 2.00%), `
    + `median chord ${r.chord == null ? 'n/a' : r.chord} px (bar 4)`);
}

/* CAL-W3: specificity, expressed as a comparison so it cannot be met by an arm that moves
   everything equally. Skipped (VOID, not PASS) if either frame is absent from this run. */
const dunes = changedFrac.get('dunes'), night = changedFrac.get('night');
let cal3 = null;
if (dunes != null && night != null) {
  cal3 = dunes < night;
  console.log(`\nCAL-W3 specificity: W-both moves ${(100 * dunes).toFixed(1)}% of dunes' mask vs `
    + `${(100 * night).toFixed(1)}% of night's -> ${cal3 ? 'as predicted' : 'NOT as predicted'}`);
} else {
  console.log('\nCAL-W3: dunes and/or night absent from this run — unscoreable, which is VOID, not PASS');
}

const all = (xs) => (xs.length ? xs.every(Boolean) : null);
const guards = {
  'CAL-W1 mask is the crease ink': all(c1),
  'CAL-W2 both levers live':       all(c2),
  'CAL-W3 specificity':            cal3,
  'W1 the floor drops':            all(w1),
  'W2 the range widens':           all(w2),
  'W3 no mush':                    all(w3),
};
console.log('');
for (const [k, v] of Object.entries(guards)) console.log(`  ${guardState(v).padEnd(4)}  ${k}`);
console.log('\n' + verdictLine(shipVerdict(guards)));

const cal = ['CAL-W1 mask is the crease ink', 'CAL-W2 both levers live', 'CAL-W3 specificity']
  .map((k) => guardState(guards[k]));
const g = (k) => guardState(guards[k]) === PASS;
let outcome;
if (cal.some((s) => s !== PASS)) outcome = 'VOID — a calibration arm did not fire';
else if (!g('W1 the floor drops')) outcome = 'FAIL — FW1: the floor did not come down as sized';
else if (!g('W3 no mush')) outcome = 'MUSH — FW3: the added darkening is not line-shaped; T2 is too wide. '
  + 'Check whether T1-colour alone meets W1 and W3 and ship that instead.';
else if (!g('W2 the range widens')) outcome = 'NARROW — FW2: the ink darkened rather than widened. '
  + 'Does NOT ship on the strength of its floor alone; that is the design constraint, not a nicety.';
else outcome = 'SHIP — floor down, range up, line still a line';
console.log(`OUTCOME: ${outcome}`);
