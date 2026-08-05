#!/usr/bin/env node
/* roidiff — changed-pixel count between two frames, restricted to a rectangle.
 *
 * Exists for PREREG-hullkerb P3's jar clause: "zero changed pixels on the canopic jars".
 * tools/pngdiff.mjs answers whole-frame count + bbox; this answers "how many of those
 * changed pixels fall inside THIS rect", with the threshold convention stated per §122.1:
 * a pixel counts as changed when ANY channel differs by > 0 (same convention as pngdiff
 * and hullscore — comparable numbers, same boot, same PNG encoder).
 *
 * usage: node roidiff.mjs <a.png> <b.png> <x0> <y0> <x1> <y1>
 */
import { readPNG } from '../../../tools/png.mjs';

const [A, B, ...r] = process.argv.slice(2);
const [x0, y0, x1, y1] = r.map(Number);
if (!A || !B || [x0, y0, x1, y1].some((v) => !Number.isFinite(v))) {
  console.error('usage: roidiff <a.png> <b.png> <x0> <y0> <x1> <y1>');
  process.exit(2);
}
const a = readPNG(A), b = readPNG(B);
if (a.w !== b.w || a.h !== b.h) { console.log('SIZE MISMATCH'); process.exit(1); }
const ch = a.data.length / (a.w * a.h);
let n = 0, maxd = 0;
const first = [];
for (let y = Math.max(0, y0); y <= Math.min(a.h - 1, y1); y++) {
  for (let x = Math.max(0, x0); x <= Math.min(a.w - 1, x1); x++) {
    const i = (y * a.w + x) * ch;
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > 0) { n++; if (d > maxd) maxd = d; if (first.length < 8) first.push(`(${x},${y})Δ${d}`); }
  }
}
const area = (Math.min(a.w - 1, x1) - Math.max(0, x0) + 1) * (Math.min(a.h - 1, y1) - Math.max(0, y0) + 1);
console.log(`ROI x ${x0}..${x1}  y ${y0}..${y1}  (${area} px)   threshold: any channel Δ > 0`);
console.log(`changed inside ROI: ${n}   maxΔ ${maxd}${first.length ? `   first: ${first.join(' ')}` : ''}`);
