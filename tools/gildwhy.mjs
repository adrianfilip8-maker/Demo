#!/usr/bin/env node
/* gildwhy — two follow-up tests on the PREREG-gildmetal arms, both on data already captured.
 *
 * 1. CONTROL ADJACENCY. gilddiff reported 118 changed px on gold_leaf/bronze. Either the
 *    per-recipe isolation leaked, or those px are post-process bleed / 1-px misregistration
 *    between the OFFLINE mask and the real render. Distinguished by distance to the nearest
 *    gild pixel: bleed and misregistration are adjacent, a real leak is interior.
 *
 * 2. SHOULDER TEST. The arm moved G +7.93 and B +7.75 but R only +2.59, i.e. the gild got
 *    BLUER. §132.1's carried caution says R sits on the AgX shoulder. If that is the cause,
 *    the R deficit must GROW with base luma (brighter px are further up the shoulder). If the
 *    deficit is flat in luma, the shoulder is not the mechanism and something else is.
 */
import { readPNG } from './png.mjs';
import { readFileSync } from 'node:fs';

const DIR = '/home/user/Demo/shots/gild';
const A = readPNG(`${DIR}/hero-base.png`), B = readPNG(`${DIR}/hero-lo.png`);
const mask = new Uint8Array(readFileSync(`${DIR}/hero-mask.bin`));
const { w, h } = A;
const at = (I, i) => { const o = i * I.ch; return [I.data[o], I.data[o + 1], I.data[o + 2]]; };
const Lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* ---- 1. control adjacency ---- */
const isGild = (i) => mask[i] === 1;
const dist = (i, R) => {                    // is there a gild px within Chebyshev radius R?
  const x = i % w, y = (i / w) | 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (isGild(ny * w + nx)) return true;
  }
  return false;
};
const buckets = { r1: 0, r2: 0, r4: 0, far: 0 };
let ctrlChanged = 0;
for (let i = 0; i < w * h; i++) {
  if (mask[i] !== 3 && mask[i] !== 4) continue;
  const a = at(A, i), b = at(B, i);
  if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
  ctrlChanged++;
  if (dist(i, 1)) buckets.r1++;
  else if (dist(i, 2)) buckets.r2++;
  else if (dist(i, 4)) buckets.r4++;
  else buckets.far++;
}
console.log('1. CONTROL ADJACENCY — where are the changed gold_leaf/bronze pixels?');
console.log(`   changed control px           : ${ctrlChanged}`);
console.log(`   with a gild px within 1 px   : ${buckets.r1}`);
console.log(`   within 2 px                  : ${buckets.r2}`);
console.log(`   within 4 px                  : ${buckets.r4}`);
console.log(`   further than 4 px (INTERIOR) : ${buckets.far}   <- a real leak would live here`);

/* ---- 2. shoulder test ---- */
const EDGES = [0, 20, 35, 50, 70, 95, 130, 256];
const rows = EDGES.slice(0, -1).map((lo, k) => ({ lo, hi: EDGES[k + 1], n: 0, dR: 0, dG: 0, dB: 0 }));
for (let i = 0; i < w * h; i++) {
  if (!isGild(i)) continue;
  const a = at(A, i), b = at(B, i);
  const l = Lum(...a);
  const row = rows.find((r) => l >= r.lo && l < r.hi);
  if (!row) continue;
  row.n++; row.dR += b[0] - a[0]; row.dG += b[1] - a[1]; row.dB += b[2] - a[2];
}
console.log('\n2. SHOULDER TEST — response by base luma, over the gild population');
console.log('   base L band      n        dR       dG       dB     dR-dG   (dR-dG grows => shoulder)');
for (const r of rows) {
  if (!r.n) continue;
  const dR = r.dR / r.n, dG = r.dG / r.n, dB = r.dB / r.n;
  console.log(`   ${String(r.lo).padStart(3)}-${String(r.hi).padEnd(4)} ${String(r.n).padStart(9)} ${dR.toFixed(2).padStart(9)} ${dG.toFixed(2).padStart(8)} ${dB.toFixed(2).padStart(8)} ${(dR - dG).toFixed(2).padStart(9)}`);
}
