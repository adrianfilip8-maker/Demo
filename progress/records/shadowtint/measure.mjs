/**
 * measure.mjs — display-space HSV of a rectangular patch, in the critic's own convention.
 *
 * The critic's r13 quotes are `#ba5244` h 7 s 0.63 and `#563d43` h 345 s 0.29. Both reproduce
 * EXACTLY under standard HSV (s = (max-min)/max, h from the max channel), so that is the
 * convention used here — checked by the self-test below rather than assumed.
 *
 *   node measure.mjs <png> <x> <y> <w> <h> [label]
 *   node measure.mjs --scanrow <png> <y> <x0> <x1> [step]   // luminance/hue profile along a row
 *   node measure.mjs --selftest
 */
import { readPNG } from '../../../tools/png.mjs';

export const hsv = ([r, g, b]) => {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  let h = 0;
  if (d > 1e-9) {
    if (mx === R) h = 60 * (((G - B) / d) % 6);
    else if (mx === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: mx > 0 ? d / mx : 0, v: mx };
};
export const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function patch(im, x0, y0, w, h) {
  const px = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * im.w + x) * im.ch;
    px.push([im.data[i], im.data[i + 1], im.data[i + 2]]);
  }
  return px;
}

/** Mean colour of a patch, plus the spread that says whether the patch is one surface. */
export function stat(px) {
  const n = px.length;
  const m = [0, 1, 2].map((c) => px.reduce((a, p) => a + p[c], 0) / n);
  const sd = [0, 1, 2].map((c) => Math.sqrt(px.reduce((a, p) => a + (p[c] - m[c]) ** 2, 0) / n));
  const Ls = px.map(lum).sort((a, b) => a - b);
  return { n, mean: m, sd, hsv: hsv(m), L: lum(m), Lp10: Ls[(n * 0.1) | 0], Lp90: Ls[(n * 0.9) | 0] };
}

const fmt = (s) => `n ${String(s.n).padStart(5)}  rgb(${s.mean.map((x) => x.toFixed(1).padStart(5)).join(',')}) ` +
  `#${s.mean.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}  ` +
  `h ${s.hsv.h.toFixed(1).padStart(5)}  s ${s.hsv.s.toFixed(3)}  v ${s.hsv.v.toFixed(3)}  ` +
  `L ${s.L.toFixed(1).padStart(5)}  sd ${s.sd.map((x) => x.toFixed(1)).join('/')}`;

if (process.argv[1].endsWith('measure.mjs')) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') {
    for (const [hex, wh, ws] of [['ba5244', 7, 0.63], ['563d43', 345, 0.29], ['2a3f66', 219, 0.59]]) {
      const v = Number.parseInt(hex, 16);
      const g = hsv([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
      console.log(`#${hex}  h ${g.h.toFixed(1)} (critic ${wh})  s ${g.s.toFixed(3)} (critic ${ws})`);
    }
  } else if (a[0] === '--scanrow') {
    const im = readPNG(a[1]);
    const y = +a[2], x0 = +a[3], x1 = +a[4], step = +(a[5] ?? 8);
    for (let x = x0; x <= x1 - step; x += step) {
      const s = stat(patch(im, x, y, step, step));
      console.log(`x ${String(x).padStart(4)}  ${fmt(s)}`);
    }
  } else {
    const im = readPNG(a[0]);
    console.log(`${(a[5] ?? '').padEnd(18)} @(${a[1]},${a[2]}) ${a[3]}x${a[4]}  ${fmt(stat(patch(im, +a[1], +a[2], +a[3], +a[4])))}`);
  }
}
