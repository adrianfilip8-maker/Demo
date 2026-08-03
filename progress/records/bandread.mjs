#!/usr/bin/env node
/* bandread — is the diffuse ramp actually BANDED on a curved surface, or still smooth?
 *
 * §7.3's first fail condition is "Diffuse ramp reads as smooth/realistic instead of
 * banded-cel". Critic pass 2's finding was stated as a measurement, and this is the same
 * measurement so the two are comparable:
 *
 *     "luma across a `temple` column and across Sly's torso both vary ~12 L over 100 px
 *      with no plateau-and-step structure. NOT PRESENT."
 *
 * The geometry half of that defect was that the level was boxes and faceted cylinders: a flat
 * face has one normal, lands wholly in one band, and gives the quantiser no gradient to band.
 * The fix was smooth normal gradients exactly where a terminator should read — column entasis
 * with enough radial segments, torus rolls, ogee mouldings, rounded masses. So the test has to
 * be run **across a curved surface**, and a column shaft is the canonical one.
 *
 * WHAT IS MEASURED. Along a horizontal scanline crossing the shaft, take luma. A 3-band cel
 * ramp produces PLATEAU-AND-STEP: long runs of near-constant luma separated by short runs of
 * steep change. A realistic ramp produces uniform moderate gradient everywhere. The
 * discriminator is therefore the DISTRIBUTION of |dL/dx|, not its mean:
 *
 *     banded  ->  median |dL/dx| near 0, with a few large spikes; high spike/median ratio
 *     smooth  ->  median |dL/dx| ≈ mean; ratio near 1
 *
 * `flat%` is the share of samples below a fixed small slope (plateau), and `steps` counts
 * runs that exceed 4x the median — the terminators. A 3-band ramp on a convex shaft crossed
 * left to right should show ~2 steps (or ~4 if both limbs are in frame).
 *
 * ANTI-FOOTGUN. The region measured is printed as a bbox AND written out as a crop, every
 * run. `lvl.mjs`'s header records what this costs when skipped: a probe sampled a dune
 * instead of the sphinxes it was attributing and came within one step of reporting a live
 * hypothesis dead. Look at the crop before believing the number.
 *
 * usage: node progress/records/bandread.mjs <frame.png> <x0> <x1> <y0> <y1> [label]
 */
import { readPNG } from '../../tools/png.mjs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [file, sx0, sx1, sy0, sy1, label] = process.argv.slice(2);
if (!file) { console.log('usage: bandread.mjs <frame.png> <x0> <x1> <y0> <y1> [label]'); process.exit(1); }
const img = readPNG(file);
const x0 = Math.max(0, parseInt(sx0, 10) || 0), x1 = Math.min(img.w, parseInt(sx1, 10) || img.w);
const y0 = Math.max(0, parseInt(sy0, 10) || 0), y1 = Math.min(img.h, parseInt(sy1, 10) || img.h);
const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const at = (x, y) => { const i = (y * img.w + x) * img.ch; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };

console.log(`${path.basename(file)}  ${img.w}x${img.h}`);
console.log(`REGION MEASURED: x ${x0}..${x1}  y ${y0}..${y1}  (${x1 - x0} x ${y1 - y0} px)${label ? `  [${label}]` : ''}`);

/* Average the scanlines in the band — vertical averaging kills sensor-style noise without
   touching horizontal structure, which is the axis the terminator runs across. */
const n = x1 - x0;
const prof = new Float64Array(n);
for (let x = x0; x < x1; x++) {
  let s = 0;
  for (let y = y0; y < y1; y++) { const [r, g, b] = at(x, y); s += L(r, g, b); }
  prof[x - x0] = s / (y1 - y0);
}

const lo = Math.min(...prof), hi = Math.max(...prof);
const slopes = [];
for (let i = 1; i < n; i++) slopes.push(Math.abs(prof[i] - prof[i - 1]));
const sorted = [...slopes].sort((a, b) => a - b);
const median = sorted[sorted.length >> 1];
const mean = slopes.reduce((a, b) => a + b, 0) / slopes.length;
const p95 = sorted[Math.floor(sorted.length * 0.95)];
const FLAT = 0.35;                      // L per px — below this the surface is a plateau
const flat = slopes.filter((s) => s < FLAT).length / slopes.length;
const thr = Math.max(median * 4, 0.8);  // a terminator is a run steeper than this
let steps = 0, run = false, stepList = [];
for (let i = 0; i < slopes.length; i++) {
  if (slopes[i] > thr) { if (!run) { steps++; stepList.push(x0 + i); run = true; } }
  else run = false;
}

console.log(`  luma range   : ${lo.toFixed(1)} .. ${hi.toFixed(1)}   (span ${(hi - lo).toFixed(1)} L over ${n} px)`);
console.log(`  |dL/dx|      : median ${median.toFixed(3)}   mean ${mean.toFixed(3)}   p95 ${p95.toFixed(3)}`);
console.log(`  spike ratio  : ${(median > 1e-6 ? p95 / median : Infinity).toFixed(1)}x   (banded: high; smooth: ~1-3)`);
console.log(`  plateau      : ${(100 * flat).toFixed(1)}% of samples below ${FLAT} L/px`);
console.log(`  steps        : ${steps}  at x = ${stepList.slice(0, 12).join(', ')}${stepList.length > 12 ? ' …' : ''}`);
console.log(`  VERDICT      : ${flat > 0.55 && steps >= 2 && p95 / median > 5
  ? 'PLATEAU-AND-STEP present — reads as banded'
  : 'no clear plateau-and-step — reads as smooth (pass-2 condition unchanged)'}`);

/* Print the profile coarsely so the shape is visible in the log, not just summarised. */
const cols = Math.min(64, n);
let bar = '  profile     : ';
for (let i = 0; i < cols; i++) {
  const v = prof[Math.floor(i * n / cols)];
  const t = (v - lo) / Math.max(1e-6, hi - lo);
  bar += ' .:-=+*#%@'[Math.min(9, Math.floor(t * 10))];
}
console.log(bar);

/* Write the exact region as a PNG so it can be looked at. */
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const cw = x1 - x0, chh = y1 - y0;
const crop = Buffer.alloc(cw * chh * 4, 255);
for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
  const [r, g, b] = at(x0 + x, y0 + y); const o = (y * cw + x) * 4;
  crop[o] = r; crop[o + 1] = g; crop[o + 2] = b; crop[o + 3] = 255;
}
const out = file.replace(/\.png$/, `.band${label ? '-' + label : ''}.png`);
writeFileSync(out, encodePNG(cw, chh, crop));
console.log(`  crop written : ${out}   <- LOOK AT THIS before believing the numbers`);
