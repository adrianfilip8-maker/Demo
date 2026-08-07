/**
 * staging3-residue — localizes the P-F4 restore-vs-base residue, and measures the cross-boot
 * floor of the base-gate rects. A DIAGNOSTIC, run after the verdict: it re-scores nothing and
 * changes no band. Its output feeds the next seal's derivation, which PREREG-staging3 §4.2
 * already named (`base → cand → restore → restore2`).
 *
 * Two questions, both raised by the run's own numbers:
 *   1. WHERE are the 110 differing px? r12 (a different era's tree) read 110 px too. An identical
 *      count across two independent boots is either coincidence or structure; the block map and
 *      the rect membership say which.
 *   2. HOW FAR do the base-gate rects move between two dt-0 boots of the SAME vectors
 *      (deriveA vs this run's base)? That is the cross-boot median floor §4.1's diagnosis duty
 *      demands be measured when P-F3 fires with the figure column agreeing — never measured
 *      before, and the reason the carried ±6% band could not hold.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';

const DIR = '/home/user/Demo/progress/records/staging3';
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

const base = load(`${DIR}/guard.base.png`);
const restore = load(`${DIR}/guard.restore.png`);
const cand = load(`${DIR}/guard.cand.png`);
const deriveA = load(`${DIR}/guard.deriveA.png`);
const deriveB = load(`${DIR}/guard.deriveB.png`);

/* ---- 1. localize restore-vs-base ---- */
const W = base.w, H = base.h;
const pts = [];
for (let i = 0; i < W * H; i++) {
  const o = i * base.ch, p = i * restore.ch;
  const d = Math.abs(base.data[o] - restore.data[p])
    + Math.abs(base.data[o + 1] - restore.data[p + 1])
    + Math.abs(base.data[o + 2] - restore.data[p + 2]);
  if (d >= 4) pts.push({ x: i % W, y: (i / W) | 0, d });
}
console.log(`=== P-F4 residue: ${pts.length} px at ΣRGB ≥ 4 ===`);
if (pts.length) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  console.log(`bbox x [${Math.min(...xs)}, ${Math.max(...xs)}]  y [${Math.min(...ys)}, ${Math.max(...ys)}]`);
  console.log(`max ΣRGB ${Math.max(...pts.map((p) => p.d))}  mean ΣRGB ${(pts.reduce((a, p) => a + p.d, 0) / pts.length).toFixed(2)}`);
  const inRect = (p, x0, y0, x1, y1) => p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1;
  const RECTS = {
    'figure rect (820,244,900,625)': [820, 244, 900, 625],
    'figure column (800,244,930,625)': [800, 244, 930, 625],
    'guard-mass (790,100,980,330)': [790, 100, 980, 330],
    'doorway pool (220,360,640,560)': [220, 360, 640, 560],
    'lower-right quad (640,360,1280,720)': [640, 360, 1280, 720],
    'corner (1039,557,1279,719)': [1039, 557, 1279, 719],
  };
  for (const [name, r] of Object.entries(RECTS)) {
    const n = pts.filter((p) => inRect(p, ...r)).length;
    console.log(`  ${String(n).padStart(4)} px (${(100 * n / pts.length).toFixed(1)}%) in ${name}`);
  }
  /* coarse 16x12 block map: where the residue lives at a glance */
  const bw = Math.ceil(W / 16), bh = Math.ceil(H / 12);
  const grid = Array.from({ length: 12 }, () => new Array(16).fill(0));
  for (const p of pts) grid[Math.min(11, (p.y / bh) | 0)][Math.min(15, (p.x / bw) | 0)]++;
  console.log('block map (16x12, counts; . = 0):');
  for (const row of grid) console.log('  ' + row.map((v) => (v ? String(v).padStart(4) : '   .')).join(''));
}

/* ---- 2. cross-boot floor of the gate rects (same vectors, same tree, different boots) ---- */
console.log('\n=== cross-boot floor: deriveA boot vs scored-run base boot (same dt-0 vectors) ===');
const R = { 'guard-mass (790,100,980,330)': [790, 100, 980, 330], 'doorway pool (220,360,640,560)': [220, 360, 640, 560] };
for (const [name, r] of Object.entries(R)) {
  const a = rectMedL(deriveA, ...r), b = rectMedL(base, ...r), bb = rectMedL(deriveB, ...r);
  console.log(`  ${name}`);
  console.log(`    deriveA ${a.toFixed(2)}   deriveB ${bb.toFixed(2)}   (within-boot Δ ${(bb - a).toFixed(3)})`);
  console.log(`    scored base ${b.toFixed(2)}   -> CROSS-BOOT Δ ${(b - a).toFixed(2)} = ${(100 * Math.abs(b - a) / a).toFixed(1)}% relative`);
}
console.log('\n=== the same comparison on the figure-column statistics (the control) ===');
const rectNBCfree = (im, x0, y0, x1, y1) => rectMedL(im, x0, y0, x1, y1);
console.log(`  figure rect medL   deriveA ${rectNBCfree(deriveA, 820, 244, 900, 625).toFixed(2)}   base ${rectNBCfree(base, 820, 244, 900, 625).toFixed(2)}`);
console.log(`  cone air  medL     deriveA ${rectNBCfree(deriveA, 700, 300, 850, 500).toFixed(2)}   base ${rectNBCfree(base, 700, 300, 850, 500).toFixed(2)}`);

/* ---- 3. is the residue inside the cand-only change region? ---- */
console.log('\n=== residue vs the cand excursion footprint ===');
let candDiff = 0, both = 0;
const candMask = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const o = i * base.ch, p = i * cand.ch;
  const d = Math.abs(base.data[o] - cand.data[p]) + Math.abs(base.data[o + 1] - cand.data[p + 1]) + Math.abs(base.data[o + 2] - cand.data[p + 2]);
  if (d >= 4) { candMask[i] = 1; candDiff++; }
}
for (const p of pts) if (candMask[p.y * W + p.x]) both++;
console.log(`  cand-vs-base differing px: ${candDiff} (${(100 * candDiff / (W * H)).toFixed(2)}% of frame)`);
console.log(`  residue px also inside the cand footprint: ${both} / ${pts.length} (${(100 * both / Math.max(1, pts.length)).toFixed(1)}%)`);
