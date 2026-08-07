/**
 * staging4-floor-analyze — reads the six same-vector stages and answers §198's question with
 * numbers: does restage residue grow when the camera never moves?
 *
 * Prints, for the five scored stages:
 *   · every pair's differing-px count and maxΣ|Δ| (s1 vs s2..s5, and each consecutive pair),
 *     so growth-with-separation and growth-with-index are separable;
 *   · the residue's bounding box and rect membership, to test whether it is the SAME upper-right
 *     sky cluster staging3 localized (bbox x [1167,1278], y [107,277]) or something else;
 *   · the guard-mass rect median per stage — the P-F3 gate's own quantity, WITHIN one boot, so
 *     the 10.7% cross-boot movement can be compared against its within-boot behaviour over time.
 *
 * Registers nothing. Its output is the input to PREREG-staging4.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { existsSync } from 'node:fs';

const DIR = '/home/user/Demo/progress/records/staging4';
const STAGES = ['s1', 's2', 's3', 's4', 's5'];

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function load(f) {
  const im = readPNG(f);
  const n = im.w * im.h;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) { const o = i * im.ch; L[i] = lum(im.data[o], im.data[o + 1], im.data[o + 2]); }
  return { ...im, L };
}
const median = (a) => { const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function rectMedL(im, x0, y0, x1, y1) {
  const v = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.push(im.L[y * im.w + x]);
  return median(v);
}
function diff(a, b) {
  const pts = [];
  let max = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const o = i * a.ch, p = i * b.ch;
    const d = Math.abs(a.data[o] - b.data[p]) + Math.abs(a.data[o + 1] - b.data[p + 1]) + Math.abs(a.data[o + 2] - b.data[p + 2]);
    if (d > max) max = d;
    if (d >= 4) pts.push({ x: i % a.w, y: (i / a.w) | 0 });
  }
  return { px: pts.length, max, pts };
}

const have = STAGES.filter((s) => existsSync(`${DIR}/guard.${s}.png`));
if (!have.length) { console.log('no stages present yet'); process.exit(0); }
const im = Object.fromEntries(have.map((s) => [s, load(`${DIR}/guard.${s}.png`)]));

console.log('=== §198 discriminating test: same vectors every stage, camera never moves ===\n');
console.log('pairs against s1 (separation grows, excursion-count pinned at ZERO):');
for (const s of have.slice(1)) {
  const d = diff(im.s1, im[s]);
  console.log(`  s1 vs ${s}:  ${String(d.px).padStart(7)} px   maxΣ|Δ| ${String(d.max).padStart(3)}`);
}
console.log('\nconsecutive pairs (one restage apart each):');
for (let i = 1; i < have.length; i++) {
  const d = diff(im[have[i - 1]], im[have[i]]);
  console.log(`  ${have[i - 1]} vs ${have[i]}:  ${String(d.px).padStart(7)} px   maxΣ|Δ| ${String(d.max).padStart(3)}`);
}

/* Is it staging3's cluster? */
const last = have.at(-1);
const dl = diff(im.s1, im[last]);
console.log(`\nresidue geography, s1 vs ${last} (${dl.px} px):`);
if (dl.px) {
  const xs = dl.pts.map((p) => p.x), ys = dl.pts.map((p) => p.y);
  console.log(`  bbox x [${Math.min(...xs)}, ${Math.max(...xs)}]  y [${Math.min(...ys)}, ${Math.max(...ys)}]`);
  console.log('  (staging3\'s P-F4 residue was x [1167,1278] y [107,277] — same cluster or not?)');
  const RECTS = {
    'figure column (800,244,930,625)': [800, 244, 930, 625],
    'guard-mass (790,100,980,330)': [790, 100, 980, 330],
    'doorway pool (220,360,640,560)': [220, 360, 640, 560],
    'lower-right quad (640,360,1280,720)': [640, 360, 1280, 720],
  };
  for (const [name, [x0, y0, x1, y1]] of Object.entries(RECTS)) {
    const n = dl.pts.filter((p) => p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1).length;
    console.log(`    ${String(n).padStart(5)} px (${(100 * n / dl.px).toFixed(1)}%) in ${name}`);
  }
}

console.log('\n=== P-F3\'s own gate quantity, WITHIN one boot across stages ===');
console.log('(staging3 measured 6.35 L = 10.7% CROSS-boot for this rect; 0.000 within the derive boot)');
for (const s of have) {
  console.log(`  ${s}  guard-mass medL ${rectMedL(im[s], 790, 100, 980, 330).toFixed(3)}   pool medL ${rectMedL(im[s], 220, 360, 640, 560).toFixed(3)}   figure medL ${rectMedL(im[s], 820, 244, 900, 625).toFixed(3)}`);
}
