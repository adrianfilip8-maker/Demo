/**
 * locate.mjs — find the pixels the r13 critic quoted, so the terminator ROI is derived from the
 * critic's own two hex values rather than from my eye.
 *
 * Usage: node progress/records/shadowtint/locate.mjs <png> <hexLit> <hexShadow>
 * Prints, for each hex, the count of pixels within a small RGB radius and their bounding box /
 * centroid, plus a coarse 16x9 occupancy grid so the cluster's location is readable in text.
 */
import { readPNG } from '../../../tools/png.mjs';

const file = process.argv[2];
const hexes = process.argv.slice(3);
const im = readPNG(file);
const at = (x, y) => {
  const i = (y * im.w + x) * im.ch;
  return [im.data[i], im.data[i + 1], im.data[i + 2]];
};
const h2rgb = (h) => {
  const v = Number.parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

for (const h of hexes) {
  const t = h2rgb(h);
  for (const rad of [6, 10, 16]) {
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, sx = 0, sy = 0;
    const grid = Array.from({ length: 9 }, () => new Array(16).fill(0));
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const p = at(x, y);
      const d = Math.max(Math.abs(p[0] - t[0]), Math.abs(p[1] - t[1]), Math.abs(p[2] - t[2]));
      if (d <= rad) {
        n++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        grid[Math.min(8, (y / im.h * 9) | 0)][Math.min(15, (x / im.w * 16) | 0)]++;
      }
    }
    if (!n) { console.log(`${h} rad${rad}: 0 px`); continue; }
    console.log(`${h} rad${rad}: ${n} px  bbox [${x0}..${x1}]x[${y0}..${y1}]  centroid (${(sx / n) | 0},${(sy / n) | 0})`);
    if (rad === 10) {
      for (const row of grid) console.log('   ' + row.map((c) => (c === 0 ? ' .' : c > 99 ? '##' : String(c).padStart(2))).join(''));
    }
  }
}
