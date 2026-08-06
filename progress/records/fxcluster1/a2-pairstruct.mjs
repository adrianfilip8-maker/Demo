#!/usr/bin/env node
/* a2-pairstruct — the FINDING that PREREG-fxcluster-a2's P-A2a names as its deliverable:
 * "the recorded pair-structure (which pixels, which cells) is the finding."
 *
 * Measures only — no thresholds, no judgement (those live in the seal and the RESULT).
 * Masks restated from the seal: ROI (340,280,700,350) = the registered candPathROI; guard
 * figure (852,220,990,700); air column (700,300,850,500).
 *
 * Per arm pair it reports, over the ROI: meanAbs|ΔL|, px with |ΔL| >= 10 (threshold stated
 * per §122.1), and a 6x2 cell grid of mean ΔL so the drift's LOCATION is on the record rather
 * than its magnitude alone. Also per-arm ROI left/right-half medL, because the seal's §0
 * diagnosis of the FIRST letter turned on a monotone rise in the dark right half.
 *
 * usage: node a2-pairstruct.mjs        (writes a2-pairstruct.json, prints a summary)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ARMS = ['base', 'base2', 'cand', 'restore'];
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const median = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

const ROI = [340, 280, 700, 350];
const RECTS = {
  roi: ROI,
  roiLeft: [340, 280, 520, 350],
  roiRight: [520, 280, 700, 350],
  figure: [852, 220, 990, 700],
  airColumn: [700, 300, 850, 500],
};

const im = Object.fromEntries(ARMS.map((a) => [a, readPNG(path.join(DIR, `a2-guard.${a}.png`))]));

const Lof = (i, x, y) => {
  const k = (y * i.w + x) * i.ch;
  return lum(i.data[k], i.data[k + 1], i.data[k + 2]);
};

function rectMedL(i, [x0, y0, x1, y1]) {
  const L = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) L.push(Lof(i, x, y));
  return +median(L).toFixed(2);
}

/* per-arm rect medL */
const perArm = {};
for (const a of ARMS) {
  perArm[a] = {};
  for (const [name, r] of Object.entries(RECTS)) perArm[a][name] = rectMedL(im[a], r);
}

/* pair structure over the ROI */
const CELLS_X = 6, CELLS_Y = 2;
const [X0, Y0, X1, Y1] = ROI;
const CW = (X1 - X0) / CELLS_X, CH = (Y1 - Y0) / CELLS_Y;

function pair(aName, bName) {
  const A = im[aName], B = im[bName];
  let sum = 0, n = 0, ge10 = 0;
  const cellSum = Array.from({ length: CELLS_Y }, () => new Float64Array(CELLS_X));
  const cellN = Array.from({ length: CELLS_Y }, () => new Float64Array(CELLS_X));
  const ge10Cell = Array.from({ length: CELLS_Y }, () => new Float64Array(CELLS_X));
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const d = Lof(B, x, y) - Lof(A, x, y);
    sum += Math.abs(d); n++;
    if (Math.abs(d) >= 10) ge10++;
    const cx = Math.min(CELLS_X - 1, ((x - X0) / CW) | 0), cy = Math.min(CELLS_Y - 1, ((y - Y0) / CH) | 0);
    cellSum[cy][cx] += d; cellN[cy][cx]++;
    if (Math.abs(d) >= 10) ge10Cell[cy][cx]++;
  }
  return {
    meanAbsDL: +(sum / n).toFixed(3),
    pxGE10: ge10,
    roiN: n,
    medLDelta: +(perArm[bName].roi - perArm[aName].roi).toFixed(2),
    cellMeanDL: cellSum.map((row, cy) => Array.from(row, (v, cx) => +(v / cellN[cy][cx]).toFixed(2))),
    cellPxGE10: ge10Cell.map((row) => Array.from(row, (v) => v)),
  };
}

const PAIRS = [['base', 'base2'], ['base2', 'cand'], ['cand', 'restore'], ['base', 'restore'], ['base', 'cand'], ['base2', 'restore']];
const pairs = {};
for (const [a, b] of PAIRS) pairs[`${a}->${b}`] = pair(a, b);

/* beam instance colour per arm, lifted from the committed readback (probe row) */
let beam = null;
try {
  const rb = JSON.parse(readFileSync(path.join(DIR, 'a2-readback.json'), 'utf8'));
  beam = Object.fromEntries(rb.arms.map((r) => [r.arm, r.probe?.guard?.beamCol0 ?? null]));
} catch { /* readback optional */ }

/* Frame-wide 16x9 grid of meanAbs|ΔL|, to locate WHERE a pair differs without assuming a rect.
   This exists because Q-A2's figure rect (852,220,990,700) read ΔmedL exactly 0.00 base->cand
   while the guard visibly rotated ~32 deg — the §143.1 question ("does the gate see the thing
   it blesses?") has to be answered by measurement, not by the rect's name. */
function frameGrid(aName, bName, GX = 16, GY = 9) {
  const A = im[aName], B = im[bName];
  const gw = A.w / GX, gh = A.h / GY;
  const s = Array.from({ length: GY }, () => new Float64Array(GX));
  const n = Array.from({ length: GY }, () => new Float64Array(GX));
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const d = Math.abs(Lof(B, x, y) - Lof(A, x, y));
    const gx = Math.min(GX - 1, (x / gw) | 0), gy = Math.min(GY - 1, (y / gh) | 0);
    s[gy][gx] += d; n[gy][gx]++;
  }
  return { cellW: gw, cellH: gh, meanAbsDL: s.map((row, gy) => Array.from(row, (v, gx) => +(v / n[gy][gx]).toFixed(2))) };
}

/* per-rect diff stats for any pair (not just the ROI) */
function rectDiff(aName, bName, [x0, y0, x1, y1]) {
  const A = im[aName], B = im[bName];
  let sum = 0, n = 0, ge10 = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const d = Lof(B, x, y) - Lof(A, x, y);
    sum += Math.abs(d); n++; if (Math.abs(d) >= 10) ge10++;
  }
  return { meanAbsDL: +(sum / n).toFixed(3), pxGE10: ge10, n };
}

const q2 = {
  'figure base->cand': rectDiff('base', 'cand', RECTS.figure),
  'figure base->restore': rectDiff('base', 'restore', RECTS.figure),
  'roi base->cand': rectDiff('base', 'cand', RECTS.roi),
};

const OUT = {
  at: new Date().toISOString(),
  note: 'measures only; thresholds live in PREREG-fxcluster-a2. |ΔL| >= 10 is the stated diff threshold (§122.1).',
  masks: RECTS, cellGrid: { x: CELLS_X, y: CELLS_Y, cellW: CW, cellH: CH },
  perArm, pairs, beamCol0: beam,
  frameGridBaseToCand: frameGrid('base', 'cand'),
  rectDiffs: q2,
};
writeFileSync(path.join(DIR, 'a2-pairstruct.json'), JSON.stringify(OUT, null, 1));

console.log('per-arm rect medL:');
for (const a of ARMS) console.log(` ${a.padEnd(8)}`, JSON.stringify(perArm[a]));
console.log('\npair structure over ROI (340,280,700,350):');
for (const [k, v] of Object.entries(pairs)) {
  console.log(` ${k.padEnd(18)} meanAbs|ΔL| ${String(v.meanAbsDL).padStart(6)}  px>=10 ${String(v.pxGE10).padStart(6)} of ${v.roiN}  ΔmedL ${String(v.medLDelta).padStart(6)}`);
  console.log(`   cell mean ΔL  top: ${JSON.stringify(v.cellMeanDL[0])}`);
  console.log(`                 bot: ${JSON.stringify(v.cellMeanDL[1])}`);
}
console.log('\nbeamCol0 per arm:', JSON.stringify(beam));
console.log('\nwrote a2-pairstruct.json');
