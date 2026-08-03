#!/usr/bin/env node
/* hullscore — score PREREG-propshull.md's arms off the frames.
 *
 * P1  base vs base2   must be 0 px   (clock pin held)
 * P2  base vs restore must be 0 px   (detach/attach is a clean toggle)
 * P3  base vs hull    changed pixels must live on silhouette EDGES, not surface interiors.
 *
 * P3 needs an instrument rather than an eyeball, and the one that fits what an inverted hull
 * physically does is a run-length test. A hull draws a band of roughly constant screen width
 * (2.5 px x the per-key weight) along silhouettes. So the changed-pixel population should be
 * dominated by SHORT vertical runs. If a shell were instead altering surface shading — the
 * failure this predicts against — the changed population would contain long runs spanning
 * whole faces. Reporting the run-length distribution makes the difference visible instead of
 * asserted, and it fails loudly in the one direction that matters.
 *
 * usage: node progress/records/hullscore.mjs [dir]     default: shots/propshull
 */
import { readPNG } from '../../tools/png.mjs';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] || path.join(import.meta.dirname, '../../shots/propshull');

function diff(a, b) {
  const A = readPNG(a), B = readPNG(b);
  if (A.w !== B.w || A.h !== B.h) throw new Error('size mismatch');
  const { w, h, ch } = A;
  const mask = new Uint8Array(w * h);
  let n = 0, maxd = 0, sum = 0;
  for (let i = 0, p = 0; p < w * h; p++, i += ch) {
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > 0) { mask[p] = 1; n++; sum += d; if (d > maxd) maxd = d; }
  }
  return { w, h, n, maxd, mean: n ? sum / n : 0, mask, tot: w * h };
}

/* Vertical run lengths of the changed mask. */
function runs(mask, w, h) {
  const hist = new Map();
  let longest = 0, total = 0;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!mask[y * w + x]) { y++; continue; }
      let e = y;
      while (e < h && mask[e * w + x]) e++;
      const len = e - y;
      hist.set(len, (hist.get(len) || 0) + 1);
      if (len > longest) longest = len;
      total++;
      y = e;
    }
  }
  return { hist, longest, total };
}

const shots = [...new Set(readdirSync(DIR).filter((f) => f.endsWith('.png')).map((f) => f.split('-')[0]))];
let verdictOK = true;

for (const shot of shots) {
  const f = (l) => path.join(DIR, `${shot}-${l}.png`);
  if (!existsSync(f('base')) || !existsSync(f('hull'))) continue;
  console.log(`\n=== ${shot} ===`);

  for (const [label, other] of [['P1 base vs base2', 'base2'], ['P2 base vs restore', 'restore']]) {
    if (!existsSync(f(other))) { console.log(`  ${label}: MISSING`); verdictOK = false; continue; }
    const d = diff(f('base'), f(other));
    const ok = d.n === 0;
    if (!ok) verdictOK = false;
    console.log(`  ${label.padEnd(20)} ${d.n} px  ${ok ? 'PASS' : '*** FAIL — arms are not comparable ***'}`);
  }

  const d = diff(f('base'), f('hull'));
  console.log(`  P3 base vs hull      ${d.n} px (${(100 * d.n / d.tot).toFixed(3)}%)  maxΔ ${d.maxd}  meanΔ ${d.mean.toFixed(1)}`);
  const r = runs(d.mask, d.w, d.h);
  const buckets = [[1, 3], [4, 6], [7, 10], [11, 20], [21, 50], [51, 1e9]];
  let short = 0;
  for (const [lo, hi] of buckets) {
    let c = 0;
    for (const [len, cnt] of r.hist) if (len >= lo && len <= hi) c += cnt;
    if (hi <= 6) short += c;
    const pct = r.total ? (100 * c / r.total).toFixed(1) : '0.0';
    console.log(`     vertical runs ${String(lo).padStart(2)}-${hi > 1e8 ? '∞' : String(hi).padEnd(2)} : ${String(c).padStart(6)}  ${pct}%`);
  }
  console.log(`     longest run ${r.longest} px, ${r.total} runs total, ${(100 * short / (r.total || 1)).toFixed(1)}% are <= 6 px`);
}

console.log(`\nvalidity gates: ${verdictOK ? 'PASS — arms are comparable' : 'FAIL — do not quote any number above'}`);
