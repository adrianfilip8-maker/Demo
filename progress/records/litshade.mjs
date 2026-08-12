/* litshade.mjs — PREREG-litshade §2's split, run from the repo root on the same four base
   pairs as erosion.mjs. Bars live in the seal; this prints, only.
   LIT/SHADE by arm-A luma vs the mask median; quartile extremes reported, never deciding. */
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

for (const [shot, boot, fa, fb] of PAIRS) {
  const ia = readPNG(fa), ib = readPNG(fb);
  const px = [];
  for (let i = 0, n = ia.w * ia.h; i < n; i++) {
    const o = i * ia.ch, q = i * ib.ch;
    const dm = Math.max(Math.abs(ia.data[o] - ib.data[q]), Math.abs(ia.data[o + 1] - ib.data[q + 1]),
      Math.abs(ia.data[o + 2] - ib.data[q + 2]));
    if (dm < FLOOR) continue;
    const L = 0.2126 * ia.data[o] + 0.7152 * ia.data[o + 1] + 0.0722 * ia.data[o + 2];
    px.push({ i, L });
  }
  px.sort((a, b) => a.L - b.L);
  const medL = px[Math.floor(px.length / 2)].L;

  const score = (list, tag) => {
    const hA = [], hB = [];
    for (const { i } of list) {
      const o = i * ia.ch, q = i * ib.ch;
      const a1 = hueOf(ia.data[o], ia.data[o + 1], ia.data[o + 2]);
      const b1 = hueOf(ib.data[q], ib.data[q + 1], ib.data[q + 2]);
      if (a1 != null) hA.push(a1);
      if (b1 != null) hB.push(b1);
    }
    const mA = circmed(hA), mB = circmed(hB);
    const s = mA == null || mB == null ? null : ((mB - mA + 540) % 360) - 180;
    console.log(`  ${tag.padEnd(10)} ${String(list.length).padStart(6)} px  hueA ${mA?.toFixed(1)}°  hueB ${mB?.toFixed(1)}°  `
      + `swing ${s?.toFixed(1)}°  R ${s != null ? (s / ROT).toFixed(2) : '—'}`);
    return s != null ? s / ROT : null;
  };

  console.log(`\n${shot} ${boot}  mask ${px.length}  median L ${medL.toFixed(1)}`);
  const shade = px.filter((p) => p.L < medL), lit = px.filter((p) => p.L >= medL);
  score(lit, 'LIT');
  score(shade, 'SHADE');
  const q = Math.floor(px.length / 4);
  score(px.slice(px.length - q), 'top-25%');
  score(px.slice(0, q), 'bottom-25%');
}
