/** Horizontal NCC autocorrelation of a PNG band. No lighting/geometry: reads the given PNG only. */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
const [file, y0s, y1s] = process.argv.slice(2);
const _p = readPNG(file); const W = _p.w, H = _p.h, CH = _p.ch, data = _p.data;
const y0 = parseInt(y0s, 10), y1 = parseInt(y1s, 10);
const rows = y1 - y0;
const col = new Float64Array(W);
for (let x = 0; x < W; x++) { let s = 0; for (let y = y0; y < y1; y++) { const i = (y * W + x) * CH; s += 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2]; } col[x] = s / rows; }
let m = 0; for (let x = 0; x < W; x++) m += col[x]; m /= W;
const c = Float64Array.from(col, (v) => v - m);
let v0 = 0; for (let x = 0; x < W; x++) v0 += c[x] * c[x];
const out = [];
for (let lag = 1; lag < Math.min(300, W - 20); lag++) {
  let s = 0, n = 0; for (let x = 0; x + lag < W; x++) { s += c[x] * c[x + lag]; n++; }
  out.push([lag, s / (v0 * n / W)]);
}
out.sort((a, b) => b[1] - a[1]);
const top = out.slice(0, 10).map(([l, r]) => `${l}:${r.toFixed(3)}`).join(' ');
const at = (l) => { const e = out.find((o) => o[0] === l); return e ? e[1].toFixed(3) : 'n/a'; };
console.log(`${file.split('/').pop()} band ${y0}-${y1}: top ${top}`);
console.log(`   at 42=${at(42)}  84=${at(84)}  90=${at(90)}  126=${at(126)}  168=${at(168)}  252=${at(252)}`);
