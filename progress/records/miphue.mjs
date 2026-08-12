/* miphue — does the mip chain reproduce §281's attenuation, from the textures alone?
   Run from the repo root. Prediction (written before first run): masked swing attenuates with level; mask cov dies ~L5. */
import { readPNG } from '../../tools/png.mjs';

const A = readPNG('src/assets/sly-dl/sly_body.png');
const B = readPNG('src/assets/sly-dl/sly_body_fix.png');
const FLOOR = 9;

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

/* alpha-weighted box downsample by factor f (what mip generation does, seams and all) */
const down = (im, f) => {
  const w = Math.floor(im.w / f), h = Math.floor(im.h / f);
  const out = new Float64Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const o = ((y * f + dy) * im.w + (x * f + dx)) * im.ch;
      const al = im.ch === 4 ? im.data[o + 3] / 255 : 1;
      r += im.data[o] * al; g += im.data[o + 1] * al; b += im.data[o + 2] * al; a += al;
    }
    const q = (y * w + x) * 4;
    out[q] = a ? r / a : 0; out[q + 1] = a ? g / a : 0; out[q + 2] = a ? b / a : 0; out[q + 3] = a / (f * f);
  }
  return { w, h, data: out };
};

console.log('level  size        maskcov   hueA    hueB    swing');
for (const L of [0, 1, 2, 3, 4, 5, 6]) {
  const f = 1 << L;
  const ma = L ? down(A, f) : null, mb = L ? down(B, f) : null;
  const W = L ? ma.w : A.w, H = L ? ma.h : A.h;
  const hA = [], hB = [];
  let n = 0, tot = 0;
  for (let i = 0; i < W * H; i++) {
    let ra, ga, ba, aa, rb, gb, bb;
    if (L) {
      const q = i * 4;
      if (ma.data[q + 3] < 0.5) continue;
      ra = ma.data[q]; ga = ma.data[q + 1]; ba = ma.data[q + 2];
      rb = mb.data[q]; gb = mb.data[q + 1]; bb = mb.data[q + 2];
    } else {
      const o = i * A.ch;
      if (A.ch === 4 && A.data[o + 3] < 128) continue;
      ra = A.data[o]; ga = A.data[o + 1]; ba = A.data[o + 2];
      rb = B.data[o]; gb = B.data[o + 1]; bb = B.data[o + 2];
    }
    tot++;
    const dm = Math.max(Math.abs(ra - rb), Math.abs(ga - gb), Math.abs(ba - bb));
    if (dm < FLOOR) continue;
    n++;
    const a1 = hueOf(ra, ga, ba), b1 = hueOf(rb, gb, bb);
    if (a1 != null) hA.push(a1);
    if (b1 != null) hB.push(b1);
  }
  const mA = circmed(hA), mB = circmed(hB);
  const swing = mA != null && mB != null ? ((mB - mA + 540) % 360) - 180 : null;
  console.log(`L${L}     ${String(W).padStart(4)}x${String(H).padEnd(6)} ${(100 * n / tot).toFixed(1).padStart(5)}%   ${mA?.toFixed(1)}°  ${mB?.toFixed(1)}°  ${swing?.toFixed(1)}°`);
}
