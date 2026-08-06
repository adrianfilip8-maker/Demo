#!/usr/bin/env node
/* sparkdiag — CRITIC-sbs3's sparkle false positive: confirm/refute, then fix the INSTRUMENT.
 *
 * OFFLINE. Committed frames only. No capture, no src edits.
 *
 * CRITIC-sbs3 reports night's #8fd8ff strict count going 41 -> 179 between rounds with 100 % of
 * the 138 new pixels in the sky band, and calls it uGraze haze being counted as hook-sparkle
 * grammar. The §2.1 item-6 grammar floor is a real gate future letters lean on, so a metric that
 * counts haze would pass a shot containing no sparkles at all.
 *
 * STRICT PREDICATE, as sealed in fxcluster-diag.mjs §B (`:530`), quoted verbatim:
 *     |R-143| <= 40  AND  |G-216| <= 35  AND  |B-255| <= 40      (#8fd8ff = 143,216,255)
 * This file does not change that colour test. It asks whether a SHAPE restriction separates the
 * two populations, because a sparkle is a small compact sprite and haze is a vast smooth field.
 *
 * usage: node sparkdiag.mjs   (writes sparkdiag.json)
 */
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REC = path.resolve(HERE, '..');
const FRAMES = {
  'sbs2/night.png': 'sbs2/night.png',
  'sbs3/night.png': 'sbs3/night.png',
  'sbs2/traversal.png': 'sbs2/traversal.png',
  'sbs3/traversal.png': 'sbs3/traversal.png',
  'fxcluster1/b2-traversal.cand.png (the 236-px genuine population)': 'fxcluster1/b2-traversal.cand.png',
  'fxcluster1/b2-traversal.base.png': 'fxcluster1/b2-traversal.base.png',
};

const inBand = (r, g, b) => Math.abs(r - 143) <= 40 && Math.abs(g - 216) <= 35 && Math.abs(b - 255) <= 40;

/** 8-connected components over the strict-band mask. */
function components(im) {
  const { w, h, ch, data } = im;
  const mask = new Uint8Array(w * h);
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    const k = i * ch;
    if (inBand(data[k], data[k + 1], data[k + 2])) { mask[i] = 1; total++; }
  }
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const id = comps.length;
    let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    stack.length = 0; stack.push(s); label[s] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && label[q] < 0) { label[q] = id; stack.push(q); }
      }
    }
    comps.push({ id, px: n, bbox: [minX, minY, maxX, maxY], wpx: maxX - minX + 1, hpx: maxY - minY + 1, maxDim: Math.max(maxX - minX + 1, maxY - minY + 1) });
  }
  return { w, h, total, comps, mask };
}

/** Row histogram of the strict-band population, so "sky band" is measured not asserted. */
function rowProfile(im, mask) {
  const { w, h } = im;
  const rows = [];
  for (let y0 = 0; y0 < h; y0 += Math.max(1, Math.round(h / 12))) {
    const y1 = Math.min(h, y0 + Math.max(1, Math.round(h / 12)));
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) n++;
    rows.push({ band: `y ${y0}-${y1}`, px: n });
  }
  return rows;
}

const OUT = {
  at: new Date().toISOString(),
  strictPredicate: '|R-143|<=40 AND |G-216|<=35 AND |B-255|<=40 (fxcluster-diag.mjs:530, unchanged)',
  frames: {},
};

for (const [label, rel] of Object.entries(FRAMES)) {
  const p = path.join(REC, rel);
  if (!existsSync(p)) { OUT.frames[label] = { missing: rel }; continue; }
  const im = readPNG(p);
  const C = components(im);
  const sizes = C.comps.map((c) => c.px).sort((a, b) => b - a);
  OUT.frames[label] = {
    file: rel, w: C.w, h: C.h,
    strictPx: C.total,
    componentCount: C.comps.length,
    largestComponentPx: sizes[0] ?? 0,
    largestShareOfPop: C.total ? +(100 * (sizes[0] ?? 0) / C.total).toFixed(1) : 0,
    top5ComponentPx: sizes.slice(0, 5),
    medianComponentPx: sizes.length ? sizes[sizes.length >> 1] : 0,
    largest3: C.comps.slice().sort((a, b) => b.px - a.px).slice(0, 3).map((c) => ({ px: c.px, bbox: c.bbox, maxDim: c.maxDim })),
    rowProfile: rowProfile(im, C.mask),
  };
}

/* ---- the corrected predicate: strict colour AND a compactness cap on the component ---- */
function scoreWithCap(rel, capPx, capDim) {
  const p = path.join(REC, rel);
  if (!existsSync(p)) return null;
  const im = readPNG(p);
  const C = components(im);
  let kept = 0, kills = 0;
  for (const c of C.comps) {
    if (c.px <= capPx && c.maxDim <= capDim) kept += c.px; else kills += c.px;
  }
  return { strictPx: C.total, keptPx: kept, rejectedPx: kills };
}
const CAPS = [[64, 16], [128, 24], [256, 32], [512, 48]];
OUT.capSweep = {};
for (const [capPx, capDim] of CAPS) {
  const key = `component <= ${capPx} px AND maxDim <= ${capDim} px`;
  OUT.capSweep[key] = {
    'sbs3/night.png (must -> ~0)': scoreWithCap('sbs3/night.png', capPx, capDim),
    'sbs2/night.png': scoreWithCap('sbs2/night.png', capPx, capDim),
    'b2-traversal.cand.png (must keep ~236)': scoreWithCap('fxcluster1/b2-traversal.cand.png', capPx, capDim),
    'b2-traversal.base.png (known-bad, no preroll)': scoreWithCap('fxcluster1/b2-traversal.base.png', capPx, capDim),
  };
}

writeFileSync(path.join(HERE, 'sparkdiag.json'), JSON.stringify(OUT, null, 1));

console.log('STRICT predicate (unchanged colour test), per committed frame:\n');
console.log(` ${'frame'.padEnd(52)} ${'strict'.padStart(7)} ${'comps'.padStart(6)} ${'largest'.padStart(8)} ${'%pop'.padStart(6)}`);
for (const [label, r] of Object.entries(OUT.frames)) {
  if (r.missing) { console.log(` ${label.padEnd(52)}  (missing)`); continue; }
  console.log(` ${label.padEnd(52)} ${String(r.strictPx).padStart(7)} ${String(r.componentCount).padStart(6)} ${String(r.largestComponentPx).padStart(8)} ${String(r.largestShareOfPop).padStart(6)}`);
}
for (const [label, r] of Object.entries(OUT.frames)) {
  if (r.missing || !r.strictPx) continue;
  console.log(`\n ${label}: top component sizes ${JSON.stringify(r.top5ComponentPx)}  median ${r.medianComponentPx}`);
  console.log(`   largest 3: ${JSON.stringify(r.largest3)}`);
  console.log(`   row profile: ${r.rowProfile.filter((b) => b.px).map((b) => `${b.band}:${b.px}`).join('  ')}`);
}
console.log('\n\nCAP SWEEP — strict colour AND component compactness:');
for (const [key, row] of Object.entries(OUT.capSweep)) {
  console.log(`\n ${key}`);
  for (const [f, v] of Object.entries(row)) {
    if (!v) { console.log(`    ${f.padEnd(46)} (missing)`); continue; }
    console.log(`    ${f.padEnd(46)} strict ${String(v.strictPx).padStart(6)} -> kept ${String(v.keptPx).padStart(6)}  (rejected ${v.rejectedPx})`);
  }
}
console.log('\nwrote sparkdiag.json');
