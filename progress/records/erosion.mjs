/* erosion.mjs — PREREG-erosion §1's split, run from the repo root on the four gate-clean base
   pairs of RESULT-attractor / RESULT-attractor2. Bars are in the seal; this prints, only.
   INT(k): mask pixels whose full Chebyshev-k neighbourhood is in-mask. BND(k) = M \ INT(k).
   Primary k=2, fallback k=1 below 200 px, k=4 reported never deciding. */
import { readPNG } from '../../tools/png.mjs';

const FLOOR = 9, ROT = -11.3;
const PAIRS = [
  ['hero', 'boot1', 'shots/attractor/hero-base-A.png', 'shots/attractor/hero-base-B.png'],
  ['hero', 'boot2', 'shots/attractor2/hero-base-A.png', 'shots/attractor2/hero-base-B.png'],
  ['interior', 'boot1', 'shots/attractor/interior-base-A.png', 'shots/attractor/interior-base-B.png'],
  ['interior', 'boot2', 'shots/attractor2/interior-base-A.png', 'shots/attractor2/interior-base-B.png'],
];

const hueOf = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  let h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
};
const circmed = (a) => {
  if (!a.length) return null;
  let sx = 0, sy = 0;
  for (const h of a) { const r = h * Math.PI / 180; sx += Math.cos(r); sy += Math.sin(r); }
  const mean = Math.atan2(sy, sx) * 180 / Math.PI;
  const shift = 180 - ((mean % 360) + 360) % 360;
  const rot = a.map((h) => (((h + shift) % 360) + 360) % 360).sort((x, y) => x - y);
  return (((rot[Math.floor(rot.length / 2)] - shift) % 360) + 360) % 360;
};
const swingOf = (ia, ib, idx) => {
  const hA = [], hB = [];
  for (const i of idx) {
    const o = i * ia.ch, q = i * ib.ch;
    const a1 = hueOf(ia.data[o], ia.data[o + 1], ia.data[o + 2]);
    const b1 = hueOf(ib.data[q], ib.data[q + 1], ib.data[q + 2]);
    if (a1 != null) hA.push(a1);
    if (b1 != null) hB.push(b1);
  }
  const mA = circmed(hA), mB = circmed(hB);
  return mA == null || mB == null ? [null, mA, mB] : [((mB - mA + 540) % 360) - 180, mA, mB];
};

for (const [shot, boot, fa, fb] of PAIRS) {
  const ia = readPNG(fa), ib = readPNG(fb);
  const W = ia.w, H = ia.h;
  const inMask = new Uint8Array(W * H);
  const mask = [];
  for (let i = 0; i < W * H; i++) {
    const o = i * ia.ch, q = i * ib.ch;
    const dm = Math.max(Math.abs(ia.data[o] - ib.data[q]), Math.abs(ia.data[o + 1] - ib.data[q + 1]),
      Math.abs(ia.data[o + 2] - ib.data[q + 2]));
    if (dm >= FLOOR) { inMask[i] = 1; mask.push(i); }
  }
  const [sAll, aAll, bAll] = swingOf(ia, ib, mask);
  console.log(`\n${shot} ${boot}  mask ${mask.length}  hueA ${aAll?.toFixed(1)}°  hueB ${bAll?.toFixed(1)}°  swing ${sAll?.toFixed(1)}°  R_base ${(sAll / ROT).toFixed(2)}`);

  for (const k of [1, 2, 4]) {
    const int_ = [], bnd = [];
    for (const i of mask) {
      const x = i % W, y = (i / W) | 0;
      let interior = x >= k && y >= k && x < W - k && y < H - k;
      if (interior) {
        outer: for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
          if (!inMask[(y + dy) * W + (x + dx)]) { interior = false; break outer; }
        }
      }
      (interior ? int_ : bnd).push(i);
    }
    const [sI, aI, bI] = swingOf(ia, ib, int_);
    const [sB2, aB2, bB2] = swingOf(ia, ib, bnd);
    console.log(`  k=${k}  INT ${String(int_.length).padStart(6)} px  hueA ${aI?.toFixed(1)}°  hueB ${bI?.toFixed(1)}°  swing ${sI?.toFixed(1)}°  R_INT ${sI != null ? (sI / ROT).toFixed(2) : '—'}`
      + `   BND ${String(bnd.length).padStart(6)} px  swing ${sB2?.toFixed(1)}°  R_BND ${sB2 != null ? (sB2 / ROT).toFixed(2) : '—'}`);
  }
}
