#!/usr/bin/env node
/* a4-harmsearch — the successor brief for a4's ONE failing gate, measured properly this time.
 *
 * a4's L-2 licence breached: |silCount(base2) − silCount(base)| = 1725 against ≤ 400. The cause
 * is a defect in how a4's OWN seal chose that statistic, and it is worth naming exactly:
 *
 *   PREREG-fxcluster-a4 §0.2 estimated the no-harm statistic's noise from ONE same-state pair
 *   (a3's base2 -> restore, the only clean pair a3 contained). One pair is not a noise estimate.
 *   a4 has THREE same-state arms (base, base2, restore, all clock-pinned and bit-identical in
 *   beamCol0), and their silCount spread is 3016 px — 30x the 102 that licensed the choice.
 *
 * So this file re-derives the no-harm design with replication: noise = the MAXIMUM pairwise
 * spread across every same-state arm available (a4's three, plus a3's two clean ones = five
 * samples over two independent boots), effect = |cand − base| within each run. A statistic that
 * cannot clear 3x on five samples has no business being a gate.
 *
 * Measures only. Registers nothing — a5's seal does that.
 *
 * usage: node a4-harmsearch.mjs   (writes a4-harmsearch.json)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
/* a4: all four arms clock-pinned. a3: base is 0.03 s late, so only base2/restore are same-state
   clean, and a3's cand is comparable to them. */
const SETS = {
  a4: { prefix: 'a4-guard', sameState: ['base', 'base2', 'restore'], cand: 'cand', ref: 'base' },
  a3: { prefix: 'a3-guard', sameState: ['base2', 'restore'], cand: 'cand', ref: 'base2' },
};
const im = {};
for (const [k, s] of Object.entries(SETS)) {
  im[k] = {};
  for (const a of [...new Set([...s.sameState, s.cand])]) im[k][a] = readPNG(path.join(DIR, `${s.prefix}.${a}.png`));
}
const W = im.a4.base.w;

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const Lof = (i, x, y) => { const k = (y * i.w + x) * i.ch; return lum(i.data[k], i.data[k + 1], i.data[k + 2]); };
const median = (a) => { const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
function rectL(i, [x0, y0, x1, y1]) { const L = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) L.push(Lof(i, x, y)); return L; }
const medL = (i, r) => median(rectL(i, r));
const meanL = (i, r) => { const L = rectL(i, r); let s = 0; for (const v of L) s += v; return s / L.length; };
function gradL(i, [x0, y0, x1, y1]) {
  let s = 0, n = 0;
  for (let y = y0; y < y1 - 1; y++) for (let x = x0; x < x1 - 1; x++) { s += Math.abs(Lof(i, x + 1, y) - Lof(i, x, y)) + Math.abs(Lof(i, x, y + 1) - Lof(i, x, y)); n++; }
  return s / n;
}
const silAt = (T) => (i, [x0, y0, x1, y1]) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (Lof(i, x, y) <= T) n++; return n; };

const FORMS = {
  medL, meanL, gradL,
  sil40: silAt(40), sil60: silAt(60), sil80: silAt(80), sil100: silAt(100),
};

/* Candidate sites. POOL is the vindicated instrument, included as the positive control: whatever
   a5 registers for no-harm must be judged beside a statistic that DOES replicate. */
const SITES = {
  'POOL ROI (0,400,560,700) [control]': [0, 400, 560, 700],
  'SIL BOX a4 (860,200,1000,300)': [860, 200, 1000, 300],
  'guard tight (880,210,980,290)': [880, 210, 980, 290],
  'guard wide (820,180,1020,300)': [820, 180, 1020, 300],
  'guard lower (852,250,990,300)': [852, 250, 990, 300],
  'guard+pool band (700,180,1160,340)': [700, 180, 1160, 340],
};

function evaluate(site, formName) {
  const f = FORMS[formName];
  const out = {};
  for (const [run, s] of Object.entries(SETS)) {
    const vals = Object.fromEntries(s.sameState.map((a) => [a, +f(im[run][a], site).toFixed(3)]));
    let spread = 0;
    const names = Object.keys(vals);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) spread = Math.max(spread, Math.abs(vals[names[i]] - vals[names[j]]));
    const effect = +(f(im[run][s.cand], site) - f(im[run][s.ref], site)).toFixed(3);
    out[run] = { sameState: vals, spread: +spread.toFixed(3), effect };
  }
  const noise = Math.max(out.a4.spread, out.a3.spread);
  const effAbs = Math.min(Math.abs(out.a4.effect), Math.abs(out.a3.effect));  // the WEAKER of the two runs
  const consistent = Math.sign(out.a4.effect) === Math.sign(out.a3.effect);
  return { ...out, noiseAcrossBothRuns: +noise.toFixed(3), weakerEffect: +effAbs.toFixed(3), signConsistent: consistent, EN: noise ? +(effAbs / noise).toFixed(2) : null };
}

const OUT = { at: new Date().toISOString(), note: 'measures only; registers nothing. noise = max pairwise spread over ALL same-state arms in a run; E/N uses the WEAKER of the two runs\' effects and the LARGER noise.', results: {} };
for (const [sn, site] of Object.entries(SITES)) {
  OUT.results[sn] = { rect: site };
  for (const fn of Object.keys(FORMS)) OUT.results[sn][fn] = evaluate(site, fn);
}
writeFileSync(path.join(DIR, 'a4-harmsearch.json'), JSON.stringify(OUT, null, 1));

console.log('noise = max pairwise spread over same-state arms (a4: base/base2/restore; a3: base2/restore)');
console.log('E/N uses the WEAKER run effect over the LARGER noise. 3x is the §13 bar.\n');
console.log(` ${'site · form'.padEnd(46)} ${'a4 spread'.padStart(10)} ${'a3 spread'.padStart(10)} ${'a4 eff'.padStart(9)} ${'a3 eff'.padStart(9)} ${'E/N'.padStart(7)}  sign`);
for (const [sn, r] of Object.entries(OUT.results)) {
  for (const fn of Object.keys(FORMS)) {
    const v = r[fn];
    console.log(` ${(sn + ' · ' + fn).padEnd(46)} ${String(v.a4.spread).padStart(10)} ${String(v.a3.spread).padStart(10)} ${String(v.a4.effect).padStart(9)} ${String(v.a3.effect).padStart(9)} ${String(v.EN).padStart(7)}  ${v.signConsistent ? 'ok' : 'FLIP'}`);
  }
}
console.log('\nwrote a4-harmsearch.json');
