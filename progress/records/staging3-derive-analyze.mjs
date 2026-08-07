/**
 * staging3-derive-analyze — reads the derivation pair and prints exactly the numbers
 * PREREG-staging3 §4 quotes: the two base-gate anchors from deriveA (with carried-width bands),
 * the single-restage floor F = |deriveA − deriveB| (with the derived P-F4 ceiling 2F), and the
 * figure-column base absolutes on both frames (the §4.1 diagnosis-duty reference set).
 *
 * Same conventions and the same decode path as staging3-score.mjs (§122.1: one arithmetic).
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';

const DIR = '/home/user/Demo/progress/records/staging3';
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function load(f) {
  const im = readPNG(f);
  const n = im.w * im.h;
  const L = new Float32Array(n), BR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * im.ch;
    L[i] = lum(im.data[o], im.data[o + 1], im.data[o + 2]);
    BR[i] = im.data[o + 2] - im.data[o];
  }
  return { w: im.w, h: im.h, ch: im.ch, data: im.data, L, BR };
}
const median = (a) => { const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const isNBC = (im, i) => im.L[i] < 72 && im.BR[i] > 12;
function rectIdx(im, x0, y0, x1, y1) { const o = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) o.push(y * im.w + x); return o; }
const rectMedL = (im, x0, y0, x1, y1) => median(rectIdx(im, x0, y0, x1, y1).map((i) => im.L[i]));
function P1(im) { const idx = rectIdx(im, 820, 244, 900, 625); let n = 0; for (const i of idx) if (isNBC(im, i)) n++; return +(100 * (1 - n / idx.length)).toFixed(2); }
function P2(im) {
  const x0 = 800, x1 = 930, w = x1 - x0;
  const dense = new Uint8Array(im.h);
  for (let y = 0; y < im.h; y++) { let n = 0; for (let x = x0; x < x1; x++) if (isNBC(im, y * im.w + x)) n++; dense[y] = n / w >= 0.60 ? 1 : 0; }
  let y = im.h - 1;
  if (!dense[y]) return 720;
  while (y > 0 && dense[y]) y--;
  return y + 1;
}
function P3(im) { const idx = rectIdx(im, 640, 360, 1280, 720); let n = 0; for (const i of idx) if (isNBC(im, i)) n++; return +(100 * n / idx.length).toFixed(2); }
function P7(im) {
  let bad = 0;
  for (let b = 0; b < 39; b++) {
    const y0 = 244 + Math.floor(b * 381 / 39), y1 = 244 + Math.floor((b + 1) * 381 / 39);
    const idx = rectIdx(im, 800, y0, 930, y1);
    let n = 0; for (const i of idx) if (isNBC(im, i)) n++;
    if (1 - n / idx.length < 0.40) bad++;
  }
  return bad;
}
function diffPx(a, b) {
  let n = 0, max = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const o = i * a.ch, p = i * b.ch;
    const d = Math.abs(a.data[o] - b.data[p]) + Math.abs(a.data[o + 1] - b.data[p + 1]) + Math.abs(a.data[o + 2] - b.data[p + 2]);
    if (d >= 4) n++; if (d > max) max = d;
  }
  return { px: n, maxSumAbs: max };
}

const A = load(`${DIR}/guard.deriveA.png`);
const B = load(`${DIR}/guard.deriveB.png`);

/* Base-gate anchors from deriveA; widths carried from the ORIGINAL bands' relative widths:
   guard-mass [17.5,19.8]/18.64 = [x0.93884, x1.06223]; pool [108,119]/113.46 = [x0.95188, x1.04883]. */
const gm = rectMedL(A, 790, 100, 980, 330);
const pool = rectMedL(A, 220, 360, 640, 560);
const gmB = rectMedL(B, 790, 100, 980, 330);
const poolB = rectMedL(B, 220, 360, 640, 560);
const F = diffPx(A, B);

console.log('=== staging3-derive analysis ===');
console.log(`deriveA guard-mass medL  ${gm.toFixed(2)}   (deriveB ${gmB.toFixed(2)}; within-derive drift ${(gmB - gm).toFixed(3)})`);
console.log(`   -> gate band [${(gm * 17.5 / 18.64).toFixed(1)}, ${(gm * 19.8 / 18.64).toFixed(1)}]  (carried widths -6.1%/+6.2%)`);
console.log(`deriveA pool medL        ${pool.toFixed(2)}   (deriveB ${poolB.toFixed(2)}; within-derive drift ${(poolB - pool).toFixed(3)})`);
console.log(`   -> gate band [${(pool * 108 / 113.46).toFixed(1)}, ${(pool * 119 / 113.46).toFixed(1)}]  (carried widths -4.8%/+4.9%)`);
console.log(`restage floor F = ${F.px} px  (maxSum|D| ${F.maxSumAbs})   -> P-F4 band [0, ${2 * F.px}]`);
console.log('figure-column base absolutes (the §4.1 diagnosis-duty reference set):');
console.log(`   deriveA  P1 ${P1(A)}  P2 ${P2(A)}  P3 ${P3(A)}  P7 ${P7(A)}`);
console.log(`   deriveB  P1 ${P1(B)}  P2 ${P2(B)}  P3 ${P3(B)}  P7 ${P7(B)}`);
