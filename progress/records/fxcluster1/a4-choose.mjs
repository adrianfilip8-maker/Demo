#!/usr/bin/env node
/* a4-choose — the PRE-SEAL design measurement for PREREG-fxcluster-a4.
 *
 * The coordinator's a4 dispatch: keep a3's vindicated pool instrument, fix the first-arm clock
 * lateness, and move the no-harm gate off the contaminated upper-right quadrant OR extend the
 * wipe to the looping fields — "choose by measurement on the committed a3 frames, which are now
 * the known-bad for exactly this question".
 *
 * Why the a3 frames can answer it: a3 pinned the clock, and its readback shows base2, cand and
 * restore captured at a bit-identical engine.time (1000.283333) AND a bit-identical beamCol0.
 * Only `base` is 0.03 s late. So among a3's four arms there is exactly one CLEAN same-state pair
 * and one CLEAN lever pair:
 *     noise  = base2 -> restore   (same state, both pinned)
 *     effect = base2 -> cand      (the lever, both pinned)
 * Every number below uses those two pairs, and `base` is excluded from the design measurement
 * precisely because a4 exists to fix it.
 *
 * Conventions (§122.1, §128.2): L = 0.2126R+0.7152G+0.0722B on 8-bit sRGB bytes; E/N =
 * |effect|/|noise|; the §13 3x clause is satisfiable iff E/N >= 3.
 *
 * usage: node a4-choose.mjs   (writes a4-choose.json, prints the tables the seal quotes)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ARMS = ['base', 'base2', 'cand', 'restore'];
const im = Object.fromEntries(ARMS.map((a) => [a, readPNG(path.join(DIR, `a3-guard.${a}.png`))]));
const W = im.base.w, H = im.base.h;

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const Lof = (i, x, y) => { const k = (y * i.w + x) * i.ch; return lum(i.data[k], i.data[k + 1], i.data[k + 2]); };
const median = (a) => { const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
function rectL(i, [x0, y0, x1, y1]) { const L = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) L.push(Lof(i, x, y)); return L; }

/* --- statistic forms --- */
const medL = (i, r) => median(rectL(i, r));
const meanL = (i, r) => { const L = rectL(i, r); let s = 0; for (const v of L) s += v; return s / L.length; };
function gradL(i, [x0, y0, x1, y1]) {
  let s = 0, n = 0;
  for (let y = y0; y < y1 - 1; y++) for (let x = x0; x < x1 - 1; x++) {
    s += Math.abs(Lof(i, x + 1, y) - Lof(i, x, y)) + Math.abs(Lof(i, x, y + 1) - Lof(i, x, y)); n++;
  }
  return s / n;
}
/* Silhouette forms. The guard reads as a DARK figure against the lit doorway wall (a3 base2
   column profile: figure x 820-900 at medL 18-23, wall x 960-1100 at medL 100-127). "Harm" for
   this shot is his silhouette being washed out or swallowed, and both show up as the dark
   population changing size or sliding — neither of which an additive mote passing in front of
   the wall can fake at the same magnitude. T is fixed at 60 L, midway between figure and wall. */
const T_SIL = 60;
function silCount(i, [x0, y0, x1, y1]) {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (Lof(i, x, y) <= T_SIL) n++;
  return n;
}
function silCentroidX(i, [x0, y0, x1, y1]) {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (Lof(i, x, y) <= T_SIL) { s += x; n++; }
  return n ? s / n : NaN;
}
const FORM = { med: medL, mean: meanL, grad: gradL, silCount, silCentroidX };

/* --- clean pairs (see header) --- */
const NOISE = ['base2', 'restore'], EFFECT = ['base2', 'cand'];
function score(rect, form) {
  const f = FORM[form];
  const v = Object.fromEntries(ARMS.map((a) => [a, +f(im[a], rect).toFixed(3)]));
  const effect = +(v[EFFECT[1]] - v[EFFECT[0]]).toFixed(3);
  const noise = +(v[NOISE[1]] - v[NOISE[0]]).toFixed(3);
  /* the DIRTY pair, kept beside it so the seal can show what `base` costs */
  const dirtyNoise = +(v.base2 - v.base).toFixed(3);
  return { perArm: v, effect, noise, dirtyNoise, EN: noise ? +(Math.abs(effect) / Math.abs(noise)).toFixed(2) : null };
}

/* ---------------------------------------------------------------- 1. residual map --- */
/* 40x40 tiles over the guard's half of the frame, so the seal can site a rect on measured
   ground instead of on the 80x80 grid a3 reported. */
const TILE = 40, TX0 = 700, TY0 = 120, TX1 = 1160, TY1 = 340;
const tiles = [];
for (let y = TY0; y < TY1; y += TILE) {
  const row = [];
  for (let x = TX0; x < TX1; x += TILE) {
    const r = [x, y, Math.min(x + TILE, TX1), Math.min(y + TILE, TY1)];
    let sn = 0, se = 0, n = 0;
    for (let yy = r[1]; yy < r[3]; yy++) for (let xx = r[0]; xx < r[2]; xx++) {
      sn += Math.abs(Lof(im.restore, xx, yy) - Lof(im.base2, xx, yy));
      se += Math.abs(Lof(im.cand, xx, yy) - Lof(im.base2, xx, yy));
      n++;
    }
    row.push({ rect: r, noise: +(sn / n).toFixed(2), effect: +(se / n).toFixed(2), EN: sn ? +(se / sn).toFixed(2) : null });
  }
  tiles.push(row);
}

/* ---------------------------------------------------------------- 2. candidates --- */
/* GL = a3's registered no-harm rect, the incumbent. The others are principled alternatives:
   SIL* are sited on the figure/wall boundary where the silhouette lives; LOW is the low-noise
   window the tile map identifies, and is DECLARED as data-driven rather than pretending it was
   reasoned to. */
const CANDS = {
  'GL  a3 incumbent (852,220,990,300)': { rect: [852, 220, 990, 300], forms: ['grad', 'med', 'mean'] },
  'S1  silhouette box (860,200,1000,300)': { rect: [860, 200, 1000, 300], forms: ['silCount', 'silCentroidX', 'grad'] },
  'S2  silhouette wide (820,180,1020,300)': { rect: [820, 180, 1020, 300], forms: ['silCount', 'silCentroidX', 'grad'] },
  'S3  silhouette tight (880,210,980,290)': { rect: [880, 210, 980, 290], forms: ['silCount', 'silCentroidX', 'grad'] },
};

const OUT = {
  at: new Date().toISOString(),
  frames: 'committed a3-guard.{base,base2,cand,restore}.png',
  pairs: { noise: `${NOISE[0]}->${NOISE[1]} (same state, both clock-pinned)`, effect: `${EFFECT[0]}->${EFFECT[1]} (lever, both clock-pinned)` },
  silThreshold: T_SIL,
  tileMap: { tile: TILE, origin: [TX0, TY0], tiles },
  candidates: {},
};
for (const [name, c] of Object.entries(CANDS)) {
  OUT.candidates[name] = { rect: c.rect };
  for (const f of c.forms) OUT.candidates[name][f] = score(c.rect, f);
}

/* the pool instrument, carried unchanged, re-measured on the CLEAN pair as a control */
const POOL = [0, 400, 560, 700];
OUT.poolControl = { rect: POOL, med: score(POOL, 'med'), mean: score(POOL, 'mean') };

/* ------------------------------------------------- 3. region-scoped pixel diffs --- */
/* a3 registered V-1 as a WHOLE-FRAME differing-pixel count, to verify the clock pin. That
   conflates two things: the pin (which a3 proved works, via bit-identical beamCol0) and the
   ambient/fire residual in the upper right, which the pin cannot touch and which stands at
   287 252 px between a3's two PINNED same-state arms. A whole-frame count is therefore a
   number that does not depend only on what it claims to measure — the §177-1 shape again. So
   the same count is measured here per region, so a4 can register the verification on the
   ground its instrument actually reads. */
function pxDiffRect(aName, bName, [x0, y0, x1, y1]) {
  const A = im[aName], B = im[bName];
  let n = 0, tot = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const k = (y * W + x) * A.ch;
    tot++;
    for (let c = 0; c < 3; c++) if (Math.abs(A.data[k + c] - B.data[k + c]) >= 1) { n++; break; }
  }
  return { px: n, of: tot, pct: +(100 * n / tot).toFixed(2) };
}
const REGIONS = {
  wholeFrame: [0, 0, W, H],
  poolROI: POOL,
  silhouetteBox: [860, 200, 1000, 300],
  upperRight: [720, 0, 1280, 320],
};
OUT.regionPxDiff = {};
for (const [rn, r] of Object.entries(REGIONS)) {
  OUT.regionPxDiff[rn] = {
    'clean same-state base2->restore': pxDiffRect('base2', 'restore', r),
    'dirty same-state base->base2': pxDiffRect('base', 'base2', r),
    'lever base2->cand': pxDiffRect('base2', 'cand', r),
  };
}

writeFileSync(path.join(DIR, 'a4-choose.json'), JSON.stringify(OUT, null, 1));

console.log(`clean pairs — noise ${OUT.pairs.noise}; effect ${OUT.pairs.effect}\n`);
console.log('1. residual map, 40px tiles (noise = |base2→restore|, effect = |base2→cand|, both mean|ΔL|):');
console.log('      ' + Array.from({ length: Math.ceil((TX1 - TX0) / TILE) }, (_, i) => String(TX0 + i * TILE).padStart(7)).join(''));
tiles.forEach((row, i) => {
  console.log(` y${String(TY0 + i * TILE).padStart(4)} N` + row.map((t) => String(t.noise).padStart(7)).join(''));
  console.log(`       E` + row.map((t) => String(t.effect).padStart(7)).join(''));
});

console.log('\n2. no-harm candidates (effect | noise | E/N | what `base` would have added):');
console.log(` ${'candidate / form'.padEnd(46)} ${'effect'.padStart(9)} ${'noise'.padStart(8)} ${'E/N'.padStart(7)} ${'dirty b2−base'.padStart(14)}`);
for (const [name, c] of Object.entries(OUT.candidates)) {
  for (const [f, s] of Object.entries(c)) {
    if (f === 'rect') continue;
    console.log(` ${(name + ' · ' + f).padEnd(46)} ${String(s.effect).padStart(9)} ${String(s.noise).padStart(8)} ${String(s.EN).padStart(7)} ${String(s.dirtyNoise).padStart(14)}`);
  }
}
console.log('\n3. pool instrument (carried unchanged) on the same clean pair:');
for (const f of ['med', 'mean']) {
  const s = OUT.poolControl[f];
  console.log(` POOL ROI (0,400,560,700) · ${f.padEnd(5)} effect ${String(s.effect).padStart(8)} noise ${String(s.noise).padStart(7)} E/N ${s.EN}`);
}
console.log('\nwrote a4-choose.json');

console.log('\n4. region-scoped differing-pixel counts (any channel |Δ| >= 1):');
for (const [rn, v] of Object.entries(OUT.regionPxDiff)) {
  console.log(` ${rn}:`);
  for (const [k, s] of Object.entries(v)) console.log(`    ${k.padEnd(34)} ${String(s.px).padStart(7)} of ${String(s.of).padStart(7)} (${String(s.pct).padStart(6)}%)`);
}
