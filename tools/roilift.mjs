/* roilift.mjs <full.png> <noshaft.png> — mean luma lift (full − noshaft) over the two fx5
   combat veil ROIs, computed over ALL rect px (not changed-only), so boots compare cleanly. */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
const [ff, fn] = process.argv.slice(2);
const A = readPNG(ff), B = readPNG(fn);
const L = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
for (const [x0, y0, x1, y1, name] of [
  [0, 28, 150, 355, 'left-edge veil ROI'],
  [652, 95, 821, 192, 'doorway veil ROI'],
]) {
  let s = 0, m = 0, pk = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const o = (y * A.w + x) * A.ch;
    const g = L(A.data, o) - L(B.data, o);
    s += g; m++; if (g > pk) pk = g;
  }
  console.log(`${name} (${x0},${y0})-(${x1},${y1}): mean lift ${(s / m).toFixed(2)}  peak +${pk.toFixed(0)}`);
}
