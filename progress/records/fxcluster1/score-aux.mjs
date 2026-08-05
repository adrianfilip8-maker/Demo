#!/usr/bin/env node
/* score-aux — the FEW registered quantities of PREREG-fxcluster §1 that the sealed scorer's
 * sections do not emit as numbers, computed with the scorer's exact stated masks (Rec.709
 * luma on 0..255, satOf = (max-min)/max, rects exclusive of x1,y1). Everything else is
 * scored by the sealed fxcluster-diag.mjs itself (env-overridden frames, relocated copy in
 * this directory). Thresholds are NOT here — they live in the seal; this file only measures.
 *
 *   A: guard figure rect (852,220,990,700) medL            (Q-A2)
 *      [candPathROI + airColumn come from the sealed scorer §A]
 *   B: bright-blue px (B-R>=30 & B>=180 & L>=80) inside the union of r=30 discs at the
 *      frozen in-frame hook projections (591,185) (507,239) (434,268)   (Q-B1)
 *   C: medSat of L>=200 px inside the largest L>=230 component's bbox in (300,300,760,600)
 *      (Q-C4; the component search repeats the sealed scorer §C4 arithmetic so the bbox is
 *      the same one its number describes)
 *   E: temple-complex rect (300,140,900,420) medL (Q-E2), near ground band
 *      (200,500,1100,700) medL (Q-E3)
 *
 * usage: node score-aux.mjs <frame.png> <A|B|C|E>...     writes JSON to stdout
 */
import { readPNG } from '../../../tools/png.mjs';

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const satOf = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const median = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

function rectMedL(im, x0, y0, x1, y1) {
  const Ls = [];
  for (let y = Math.max(0, y0); y < Math.min(im.h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(im.w, x1); x++) {
      const i = (y * im.w + x) * im.ch;
      Ls.push(lum(im.data[i], im.data[i + 1], im.data[i + 2]));
    }
  }
  return +median(Ls).toFixed(2);
}

const im = readPNG(process.argv[2]);
const want = process.argv.slice(3);
const out = { frame: process.argv[2] };

if (want.includes('A')) {
  out.figureRectMedL = rectMedL(im, 852, 220, 990, 700);
}

if (want.includes('B')) {
  const HOOKS = [[591, 185], [507, 239], [434, 268]];   // frozen camera+hook table (seal §0.2)
  const R = 30;
  let n = 0;
  const seen = new Set();
  for (const [cx, cy] of HOOKS) {
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= im.w || y >= im.h) continue;
      const k = y * im.w + x;
      if (seen.has(k)) continue;
      seen.add(k);
      const i = k * im.ch;
      const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
      if (b - r >= 30 && b >= 180 && lum(r, g, b) >= 80) n++;
    }
  }
  out.hookDiscBlueBrightPx = n;
  out.hookDiscUnionPx = seen.size;
}

if (want.includes('C')) {
  // repeat sealed scorer §C4: largest L>=230 4-neighbour component in (300,300,760,600)
  const x0 = 300, y0 = 300, x1 = 760, y1 = 600, W = x1 - x0, H = y1 - y0;
  const m = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * im.ch;
    if (lum(im.data[i], im.data[i + 1], im.data[i + 2]) >= 230) m[(y - y0) * W + (x - x0)] = 1;
  }
  const seen = new Uint8Array(W * H); let best = null;
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || seen[s]) continue;
    const st = [s]; seen[s] = 1;
    let minX = W, maxX = 0, minY = H, maxY = 0, cnt = 0;
    while (st.length) {
      const q = st.pop(); cnt++;
      const qx = q % W, qy = (q / W) | 0;
      minX = Math.min(minX, qx); maxX = Math.max(maxX, qx); minY = Math.min(minY, qy); maxY = Math.max(maxY, qy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (m[ni] && !seen[ni]) { seen[ni] = 1; st.push(ni); }
      }
    }
    if (!best || cnt > best.px) best = { px: cnt, bbox: [minX + x0, minY + y0, maxX + x0, maxY + y0] };
  }
  out.flashBlob = best;
  if (best) {
    const sats = [];
    for (let y = best.bbox[1]; y <= best.bbox[3]; y++) for (let x = best.bbox[0]; x <= best.bbox[2]; x++) {
      const i = (y * im.w + x) * im.ch;
      const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
      if (lum(r, g, b) >= 200) sats.push(satOf(r, g, b));
    }
    out.blobBboxMedSatAtL200 = +median(sats).toFixed(3);
    out.blobBboxL200n = sats.length;
  }
}

if (want.includes('E')) {
  out.templeRectMedL = rectMedL(im, 300, 140, 900, 420);
  out.groundBandMedL = rectMedL(im, 200, 500, 1100, 700);
}

console.log(JSON.stringify(out, null, 1));
