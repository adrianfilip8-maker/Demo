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
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
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

/* ---------------------------------------------------------------------------
 * The size cap FAILED its control (see cap sweep): night's haze specks are SMALLER
 * than traversal's genuine sparkles, so component area is backwards as a discriminator.
 *
 * What actually differs: a sparkle is an ADDITIVE SPRITE DRAWN ON GEOMETRY — it is a local
 * maximum standing above a darker surround. Sky haze grazing the colour band is part of a
 * smooth gradient with no dark surround anywhere near it. That is a depth-aware test in
 * spirit ("is there geometry behind this pixel?") that is computable from a committed PNG.
 * ------------------------------------------------------------------------- */
function surroundStats(rel, R1 = 5, R2 = 11) {
  const p = path.join(REC, rel);
  if (!existsSync(p)) return null;
  const im = readPNG(p);
  const { w, h, ch, data } = im;
  const lumAt = (x, y) => { const k = (y * w + x) * ch; return 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]; };
  const rows = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * ch;
    if (!inBand(data[k], data[k + 1], data[k + 2])) continue;
    let minL = Infinity, sum = 0, n = 0;
    for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 < R1 * R1 || d2 > R2 * R2) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const L = lumAt(nx, ny);
      if (L < minL) minL = L;
      sum += L; n++;
    }
    if (!n) continue;
    rows.push({ y, surroundMinL: minL, surroundMeanL: sum / n, selfL: lumAt(x, y) });
  }
  if (!rows.length) return { px: 0 };
  const q = (arr, p2) => { const s = arr.slice().sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p2 * s.length))].toFixed(1); };
  const mins = rows.map((r) => r.surroundMinL);
  return {
    px: rows.length,
    surroundMinL: { p05: q(mins, 0.05), p25: q(mins, 0.25), median: q(mins, 0.5), p75: q(mins, 0.75), p95: q(mins, 0.95) },
    pxWithDarkSurround_lt60: rows.filter((r) => r.surroundMinL < 60).length,
    pxWithDarkSurround_lt80: rows.filter((r) => r.surroundMinL < 80).length,
    pxWithDarkSurround_lt100: rows.filter((r) => r.surroundMinL < 100).length,
  };
}
const SURR = {};
for (const rel of ['sbs3/night.png', 'sbs2/night.png', 'fxcluster1/b2-traversal.cand.png', 'sbs3/traversal.png']) SURR[rel] = surroundStats(rel);
const J2 = JSON.parse(require('node:fs').readFileSync(path.join(HERE, 'sparkdiag.json'), 'utf8'));
J2.surroundTest = { annulus: 'radii 5..11 px', note: 'surroundMinL = darkest pixel in the annulus. A sprite drawn on geometry has dark surround; sky haze does not.', frames: SURR };
writeFileSync(path.join(HERE, 'sparkdiag.json'), JSON.stringify(J2, null, 1));
console.log('\n\nSURROUND TEST — darkest luma in an annulus (r 5..11) around each in-band pixel:');
console.log(` ${'frame'.padEnd(44)} ${'px'.padStart(6)} ${'p05'.padStart(6)} ${'median'.padStart(7)} ${'p95'.padStart(6)}  ${'<60'.padStart(6)} ${'<80'.padStart(6)} ${'<100'.padStart(6)}`);
for (const [f, v] of Object.entries(SURR)) {
  if (!v || !v.px) { console.log(` ${f.padEnd(44)} ${String(v ? v.px : 0).padStart(6)}`); continue; }
  console.log(` ${f.padEnd(44)} ${String(v.px).padStart(6)} ${String(v.surroundMinL.p05).padStart(6)} ${String(v.surroundMinL.median).padStart(7)} ${String(v.surroundMinL.p95).padStart(6)}  ${String(v.pxWithDarkSurround_lt60).padStart(6)} ${String(v.pxWithDarkSurround_lt80).padStart(6)} ${String(v.pxWithDarkSurround_lt100).padStart(6)}`);
}

/* ===========================================================================
 * REGISTERED CORRECTED PREDICATE (see NOTE-sparkle-predicate.md §4)
 *
 * Four candidate restrictions were tested above and in the note; all four FAILED:
 *   1. component-area cap      — backwards: haze specks (<=30 px) are SMALLER than genuine
 *                                sparkles (82/67/42/34 px). Kills 148 of 236 genuine.
 *   2. dark-surround test      — night sky is dark too; 221/224 haze px pass it.
 *   3. sparkle-core adjacency  — keeps only 10 of 236 genuine: the in-band population is a
 *                                sprite ANNULUS and no core survives the grade above it.
 *   4. flood-fill sky mask     — self-defeating: any bright speck breaks the fill and is
 *                                classified as geometry, including the haze specks.
 * Colour and shape do not separate these populations. The restriction must be GEOMETRIC and
 * REGISTERED PER SHOT: a horizon cut below which sky cannot appear, published with the count.
 * ======================================================================== */
const SKY_CUT = { night: 200, traversal: 120 };   // y below which the shot has no sky
function scoreMasked(rel, cut) {
  const p = path.join(REC, rel);
  if (!existsSync(p)) return null;
  const im = readPNG(p); const { w, h, ch, data } = im;
  let sky = 0, geo = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * ch;
    if (!inBand(data[k], data[k + 1], data[k + 2])) continue;
    if (y < cut) sky++; else geo++;
  }
  return { strictPx: sky + geo, rejectedAsSky: sky, countedOnGeometry: geo };
}
const CONTROLS = {
  'sbs2/night.png (shot: night, cut y<200)': scoreMasked('sbs2/night.png', SKY_CUT.night),
  'sbs3/night.png (shot: night, cut y<200)': scoreMasked('sbs3/night.png', SKY_CUT.night),
  'b2-traversal.cand.png (shot: traversal, cut y<120) — MUST keep 236': scoreMasked('fxcluster1/b2-traversal.cand.png', SKY_CUT.traversal),
  'b2-traversal.base.png (known-bad, no preroll) — MUST stay 0': scoreMasked('fxcluster1/b2-traversal.base.png', SKY_CUT.traversal),
  'sbs3/traversal.png (shot: traversal, cut y<120)': scoreMasked('sbs3/traversal.png', SKY_CUT.traversal),
};
const J3 = JSON.parse(require('node:fs').readFileSync(path.join(HERE, 'sparkdiag.json'), 'utf8'));
J3.correctedPredicate = { colour: 'unchanged: |R-143|<=40 AND |G-216|<=35 AND |B-255|<=40', geometric: 'AND y >= skyCut[shot]', skyCut: SKY_CUT, controls: CONTROLS };
writeFileSync(path.join(HERE, 'sparkdiag.json'), JSON.stringify(J3, null, 1));
console.log('\n\nCORRECTED PREDICATE = strict colour AND y >= skyCut[shot]  (night 200, traversal 120):');
for (const [f, v] of Object.entries(CONTROLS)) {
  if (!v) { console.log(`  ${f.padEnd(64)} (missing)`); continue; }
  console.log(`  ${f.padEnd(64)} strict ${String(v.strictPx).padStart(4)} -> counted ${String(v.countedOnGeometry).padStart(4)}  (rejected as sky ${v.rejectedAsSky})`);
}
