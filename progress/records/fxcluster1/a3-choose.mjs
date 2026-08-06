#!/usr/bin/env node
/* a3-choose — the PRE-SEAL design measurement for PREREG-fxcluster-a3.
 *
 * §177 names two successors to a2's failed instrument and asks that the choice be made by
 * measurement, not preference:
 *   (1) re-site the ROI onto the guard's ground pool (a2 letter: 24-80 L effect vs ~4.6 L noise);
 *   (2) score a signed spatial contrast in which the multiplicative flicker cancels.
 * This script computes BOTH families' effect-to-noise ratios on the COMMITTED a2 frames
 * (a2-guard.{base,base2,cand,restore}.png) so the seal can register the winner with numbers.
 *
 * It measures only. No thresholds, no verdicts — those live in PREREG-fxcluster-a3.md.
 *
 * Definitions used throughout (stated, per §122.1 and §128.2):
 *   L        = 0.2126R + 0.7152G + 0.0722B on 8-bit sRGB bytes (a2-pairstruct's convention).
 *   effect   = the statistic evaluated base -> cand   (the lever, guardTowardCamera -0.20).
 *   mirror   = the statistic evaluated cand -> restore (must reverse sign if it is the lever).
 *   noise    = the statistic on the two SAME-STATE pairs base->base2 and base->restore;
 *              the reported noise is max(|base->base2|, |base->restore|), the same worst-case
 *              rule a2's registered gates used.
 *   E/N      = |effect| / noise. The §13 3x clause is satisfiable iff E/N >= 3.
 *   staticFrac = share of the rect's pixels BIT-IDENTICAL across all four arms. This is the
 *              §177 finding-2 number: a statistic over a mostly-static rect can be pinned by
 *              construction (a2's Q-A2 read exactly 0.00 over a rect that is 79% static).
 *
 * usage: node a3-choose.mjs   (writes a3-choose.json, prints the table the seal quotes)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ARMS = ['base', 'base2', 'cand', 'restore'];
const im = Object.fromEntries(ARMS.map((a) => [a, readPNG(path.join(DIR, `a2-guard.${a}.png`))]));
const W = im.base.w, H = im.base.h, CH = im.base.ch;

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const Lof = (i, x, y) => { const k = (y * i.w + x) * i.ch; return lum(i.data[k], i.data[k + 1], i.data[k + 2]); };
const median = (a) => { const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

/* ---------------------------------------------------------------- rect helpers --- */
function rectL(i, [x0, y0, x1, y1]) {
  const L = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) L.push(Lof(i, x, y));
  return L;
}
const medL = (i, r) => median(rectL(i, r));
const meanL = (i, r) => { const L = rectL(i, r); let s = 0; for (const v of L) s += v; return s / L.length; };

/** share of rect pixels bit-identical across all four arms — the §177 finding-2 mobility check */
function staticFrac([x0, y0, x1, y1]) {
  let same = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const k = (y * W + x) * CH;
    let eq = true;
    for (const a of ['base2', 'cand', 'restore']) {
      for (let c = 0; c < 3; c++) if (im[a].data[k + c] !== im.base.data[k + c]) { eq = false; break; }
      if (!eq) break;
    }
    n++; if (eq) same++;
  }
  return { staticFrac: +(same / n).toFixed(3), n };
}

/* ------------------------------------------------------------- the candidates --- */
/* Family 1 — LEVEL: a signed level statistic over a re-sited rect. Rects are read off the
   16x9 signed-ΔL grid of the committed a2 frames: base->cand is strongly NEGATIVE across the
   bottom-left quadrant (cells -68 .. -80 L) where the guard's ground pool sweeps out of frame
   as his forward vector turns; base->base2 is +-2 L there and base->restore +-5 L. */
const LEVEL_RECTS = {
  'L1 poolLetter  (0,400,560,700)': [0, 400, 560, 700],
  'L2 poolCore    (0,400,400,720)': [0, 400, 400, 720],
  'L3 poolLowLeft (0,480,320,720)': [0, 480, 320, 720],
  'L4 poolWide    (0,320,640,720)': [0, 320, 640, 720],
  'L5 poolPeakCol (0,400,160,720)': [0, 400, 160, 720],
  'L0 a2 ROI ctrl (340,280,700,350)': [340, 280, 700, 350],
};

/* Family 2 — CONTRAST: C = <L over R1> - <L over R2>, computed PER ARM, then differenced.
   A spatially UNIFORM multiplicative term (Guard.js:1588's `bright *= 1 + 0.09 sin(t*6.3+phase)`)
   cancels only to the extent R1 and R2 carry equal cone contribution; the seal must therefore
   read the measured noise, not the argument. Pairs span the letter's literal suggestion
   (ROI left cell vs ROI middle) and pool-sited variants. */
const CONTRAST_PAIRS = {
  'K1 ROI left|mid   (340,280,400,350)|(460,280,640,350)': [[340, 280, 400, 350], [460, 280, 640, 350]],
  'K2 pool left|right(0,480,240,720)|(240,480,480,720)': [[0, 480, 240, 720], [240, 480, 480, 720]],
  'K3 pool up|down   (0,400,400,560)|(0,560,400,720)': [[0, 400, 400, 560], [0, 560, 400, 720]],
  'K4 pool|midgain   (0,480,320,720)|(400,160,720,320)': [[0, 480, 320, 720], [400, 160, 720, 320]],
  'K5 pool|aircol    (0,480,320,720)|(700,300,850,500)': [[0, 480, 320, 720], [700, 300, 850, 500]],
};

/* Q-A2 successor candidates — a no-harm statistic that must be shown able to MOVE.
   a2's figure rect (852,220,990,700) is 79% static in its lower 380 rows; row-activity on the
   committed frames puts every moving pixel in y 220-300 (97.6/88.2/88.7/88.0% of rows moving,
   then 5.2% and 0.0% below y 300) — below that the rect is the §152 plinth slab, frozen. */
const HARM_RECTS = {
  'H0 a2 figure   (852,220,990,700)': [852, 220, 990, 700],
  'H1 figure live (852,220,990,300)': [852, 220, 990, 300],
  'H2 figure live wide (830,215,1010,310)': [830, 215, 1010, 310],
  'H3 figure tall (852,180,990,300)': [852, 180, 990, 300],
};

/* Three FORMS of the no-harm statistic, because "harm" for this shot is the §17 risk that the
   guard's read is lost — and a level cannot tell "washed out by the beam throat" (harm) from
   "no longer washed out" (the point of the lever). Contrast forms can: both failure modes
   collapse the silhouette's internal contrast, in either direction of level. */
function pctl(L, p) { const s = Float64Array.from(L).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
const iqrL = (i, r) => { const L = rectL(i, r); return pctl(L, 0.75) - pctl(L, 0.25); };
function gradL(i, [x0, y0, x1, y1]) {
  let s = 0, n = 0;
  for (let y = y0; y < y1 - 1; y++) for (let x = x0; x < x1 - 1; x++) {
    s += Math.abs(Lof(i, x + 1, y) - Lof(i, x, y)) + Math.abs(Lof(i, x, y + 1) - Lof(i, x, y)); n++;
  }
  return s / n;
}

/* ------------------------------------------------------------------- scoring --- */
const PAIRS = { effect: ['base', 'cand'], mirror: ['cand', 'restore'], n1: ['base', 'base2'], n2: ['base', 'restore'] };

const FORM = { med: medL, mean: meanL, iqr: iqrL, grad: gradL };

function scoreLevel(rect, stat) {
  const f = FORM[stat];
  const v = Object.fromEntries(ARMS.map((a) => [a, +f(im[a], rect).toFixed(2)]));
  const d = Object.fromEntries(Object.entries(PAIRS).map(([k, [a, b]]) => [k, +(v[b] - v[a]).toFixed(2)]));
  const noise = +Math.max(Math.abs(d.n1), Math.abs(d.n2)).toFixed(2);
  return { perArm: v, ...d, noise, EN: noise ? +(Math.abs(d.effect) / noise).toFixed(2) : null };
}

function scoreContrast([r1, r2], stat) {
  const f = FORM[stat];
  const C = Object.fromEntries(ARMS.map((a) => [a, +(f(im[a], r1) - f(im[a], r2)).toFixed(2)]));
  const d = Object.fromEntries(Object.entries(PAIRS).map(([k, [a, b]]) => [k, +(C[b] - C[a]).toFixed(2)]));
  const noise = +Math.max(Math.abs(d.n1), Math.abs(d.n2)).toFixed(2);
  return { perArm: C, ...d, noise, EN: noise ? +(Math.abs(d.effect) / noise).toFixed(2) : null };
}

const OUT = { at: new Date().toISOString(), frames: 'committed a2-guard.{base,base2,cand,restore}.png', level: {}, contrast: {}, harm: {} };

for (const [name, r] of Object.entries(LEVEL_RECTS)) {
  OUT.level[name] = { rect: r, ...staticFrac(r), med: scoreLevel(r, 'med'), mean: scoreLevel(r, 'mean') };
}
for (const [name, p] of Object.entries(CONTRAST_PAIRS)) {
  OUT.contrast[name] = {
    rects: p, R1: staticFrac(p[0]), R2: staticFrac(p[1]),
    med: scoreContrast(p, 'med'), mean: scoreContrast(p, 'mean'),
  };
}
for (const [name, r] of Object.entries(HARM_RECTS)) {
  OUT.harm[name] = {
    rect: r, ...staticFrac(r),
    med: scoreLevel(r, 'med'), mean: scoreLevel(r, 'mean'),
    iqr: scoreLevel(r, 'iqr'), grad: scoreLevel(r, 'grad'),
  };
}

/* Whole-frame differing-pixel counts — the calibration for a3's clock-pin verification gate.
   Threshold stated per §122.1: a pixel counts as differing if ANY of R,G,B differs by >= 1.
   On a2 (no clock pin) these are the UNPINNED same-state numbers; the a3 seal registers a
   ceiling against them, so the gate has a measured known-bad and a measured scale. */
function framePxDiff(aName, bName) {
  const A = im[aName], B = im[bName];
  let n = 0, n4 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * CH;
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.data[k + c] - B.data[k + c]));
    if (d >= 1) n++;
    if (Math.abs(Lof(B, x, y) - Lof(A, x, y)) >= 4) n4++;
  }
  return { anyChannelGE1: n, lumaGE4: n4, of: W * H, pct: +(100 * n / (W * H)).toFixed(2) };
}
OUT.framePxDiff = {
  'base->base2 (same state, UNPINNED)': framePxDiff('base', 'base2'),
  'base->restore (same state, UNPINNED)': framePxDiff('base', 'restore'),
  'base->cand (the lever)': framePxDiff('base', 'cand'),
};

writeFileSync(path.join(DIR, 'a3-choose.json'), JSON.stringify(OUT, null, 1));

const row = (name, s, extra) => console.log(
  ` ${name.padEnd(52)} ${String(s.effect).padStart(8)} ${String(s.mirror).padStart(8)} ${String(s.n1).padStart(7)} ${String(s.n2).padStart(7)} ${String(s.noise).padStart(7)} ${String(s.EN).padStart(7)}  ${extra}`,
);
const head = (t) => {
  console.log(`\n${t}`);
  console.log(` ${'candidate'.padEnd(52)} ${'effect'.padStart(8)} ${'mirror'.padStart(8)} ${'b→b2'.padStart(7)} ${'b→rest'.padStart(7)} ${'noise'.padStart(7)} ${'E/N'.padStart(7)}  static`);
};

for (const stat of ['med', 'mean']) {
  head(`FAMILY 1 — LEVEL, Δ${stat}L over a re-sited rect:`);
  for (const [n, v] of Object.entries(OUT.level)) row(n, v[stat], `${(100 * v.staticFrac).toFixed(1)}%`);
  head(`FAMILY 2 — CONTRAST, Δ(${stat}L(R1) − ${stat}L(R2)) per arm:`);
  for (const [n, v] of Object.entries(OUT.contrast)) row(n, v[stat], `${(100 * v.R1.staticFrac).toFixed(1)}% / ${(100 * v.R2.staticFrac).toFixed(1)}%`);
}
for (const stat of ['med', 'mean', 'iqr', 'grad']) {
  head(`NO-HARM candidates — form=${stat} (must be shown able to MOVE, §177 finding 2):`);
  for (const [n, v] of Object.entries(OUT.harm)) row(n, v[stat], `${(100 * v.staticFrac).toFixed(1)}%`);
}
console.log('\nWHOLE-FRAME differing px (any channel |Δ| >= 1 of 921600; luma |ΔL| >= 4):');
for (const [k, v] of Object.entries(OUT.framePxDiff)) {
  console.log(` ${k.padEnd(38)} ${String(v.anyChannelGE1).padStart(7)} px (${String(v.pct).padStart(6)}%)   lumaGE4 ${String(v.lumaGE4).padStart(7)}`);
}
console.log('\nwrote a3-choose.json');
