/* Same ridge detector, same thresholds, on the reference and on every r9 frame -- so the
   comparison is instrument-matched rather than a comparison of critic 9's detector against mine.
   The quantity of interest is the SHAPE of the ink distribution (p90/p10), which is what the
   design constraint is about: the ink must reach black without becoming a uniform grey.
   Every frame carries its own sanity line; a frame whose "ink" is not clearly darker than the
   frame median is reporting texture, and is marked. */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readdirSync } from 'node:fs';

const REFDIR = process.env.SLY3REF || '';   // reference frames are NEVER committed; pass SLY3REF
const R9 = process.env.SANDS_R9 || '/home/user/Demo/shots/r9';

function stats(path) {
  const im = readPNG(path);
  const { w, h } = im;
  const f = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    f[i] = (0.2126 * im.data[i * im.ch] + 0.7152 * im.data[i * im.ch + 1] + 0.0722 * im.data[i * im.ch + 2]) / 255;
  }
  const sorted = Float64Array.from(f).sort();
  const ink = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x, c = f[i];
      if ((c < f[i - 2] - 0.04 && c < f[i + 2] - 0.04) || (c < f[i - 2 * w] - 0.04 && c < f[i + 2 * w] - 0.04)) ink.push(c);
    }
  }
  ink.sort((a, b) => a - b);
  const q = (a, p) => a[Math.floor(a.length * p)];
  if (!ink.length) return null;
  return {
    frameMin: sorted[0], frameMed: q(sorted, 0.50),
    p10: q(ink, 0.10), med: q(ink, 0.50), p90: q(ink, 0.90),
    n: ink.length, cov: ink.length / (w * h),
  };
}

console.log('frame            ink p10   ink med   ink p90   p90/p10   frame min   sanity');
const rows = [['REF-venice', `${REFDIR}/sly3-venice.decoded.png`]];
for (const f of readdirSync(R9).filter((x) => x.endsWith('.png')).sort()) rows.push([f.replace('.png', ''), `${R9}/${f}`]);

const ratios = [];
for (const [name, path] of rows) {
  const s = stats(path);
  if (!s) { console.log(`  ${name.padEnd(14)} no ridge pixels`); continue; }
  const ratio = s.p90 / s.p10;
  const sane = s.med < s.frameMed;
  if (sane && name !== 'REF-venice') ratios.push({ name, ratio, p10: s.p10 });
  console.log(`  ${name.padEnd(14)} ${s.p10.toFixed(4)}    ${s.med.toFixed(4)}    ${s.p90.toFixed(4)}    `
    + `${ratio.toFixed(2).padStart(6)}    ${s.frameMin.toFixed(4)}     ${sane ? 'ok' : 'TEXTURE — discard'}`);
}
const ref = stats(`${REFDIR}/sly3-venice.decoded.png`);
console.log(`\nreference p90/p10 = ${(ref.p90 / ref.p10).toFixed(2)}`);
if (ratios.length) {
  const rs = ratios.map((r) => r.ratio).sort((a, b) => a - b);
  console.log(`ours (sane frames, n=${ratios.length}) p90/p10 median = ${rs[Math.floor(rs.length / 2)].toFixed(2)}`
    + `  range ${rs[0].toFixed(2)}..${rs[rs.length - 1].toFixed(2)}`);
  const ps = ratios.map((r) => r.p10).sort((a, b) => a - b);
  console.log(`ours ink p10 median = ${ps[Math.floor(ps.length / 2)].toFixed(4)}  vs reference ${ref.p10.toFixed(4)}`);
}
