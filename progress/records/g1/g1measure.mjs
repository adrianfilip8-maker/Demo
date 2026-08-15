/**
 * g1measure.mjs — offline attribution measurement for the §327 G1 ghost disc.
 *
 * Reads captured frames only. Boots nothing, takes no lock, writes no src.
 *   node progress/records/g1/g1measure.mjs [shotdir]      (default shots/r12)
 *
 * Three measurements, in the order they discriminate:
 *   1. SHAPE   — 1-px edge profile across each disc rim. A billboard sprite with a painted
 *                hard edge rises in 3-5 px and then sits on a FLAT plateau; a bloom/flare
 *                ghost is a wide gaussian with no plateau at all.
 *   2. AXIS    — a lens-flare ghost must lie on the line from a bright source through the
 *                screen centre. Perpendicular distance is reported in DISC RADII so the
 *                number cannot be argued about; t is the parameter along source->centre.
 *   3. POP     — how many objects of the same family are in the frame. A ghost pass emits a
 *                fixed, colinear few; a particle field scatters many.
 */
import { readPNG } from '../../../tools/png.mjs';

const s2l = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const Ls = (r, g, b) => { const Y = 0.2126 * s2l(r) + 0.7152 * s2l(g) + 0.0722 * s2l(b); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
const P = (im, x, y) => { const i = (y * im.w + x) * im.ch; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

const DIR = process.argv[2] || new URL('../../../shots/r12/', import.meta.url).pathname;

/* Discs located by eye at 3-9x and then bounded on the 1-px edge profile below. */
const DISCS = {
  'sly-profile': { box: [776, 126, 910, 274], surrL: [720, 130, 770, 270], surrR: [925, 130, 975, 270],
                   scanH: 150, scanV: 810 },
  'combat':      { box: [806, 199, 852, 237], surrL: [780, 200, 802, 236], surrR: [856, 200, 878, 236],
                   scanH: 212, scanV: 826 },
  'interior':    { box: [671,  99, 713, 132], surrL: [645, 100, 666, 131], surrR: [718, 100, 739, 131],
                   scanH: 116, scanV: 690 },
};

function boxStat(im, [x0, y0, x1, y1]) {
  let sL = 0, n = 0, c = [0, 0, 0], pk = { v: -1 };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = P(im, x, y), v = Ls(...p);
    sL += v; n++; c[0] += p[0]; c[1] += p[1]; c[2] += p[2];
    if (v > pk.v) pk = { v, p, x, y };
  }
  return { L: sL / n, col: c.map(v => Math.round(v / n)), peak: pk, n };
}

/**
 * 10-90% rise width of one rim, against the LOCAL baseline.
 *
 * The baseline must be the wall immediately outside the rim, not the ring mean: on
 * `sly-profile` the wall beside the disc is L 50.4 while the ring mean is 46.7, and a rise
 * measured off the ring mean starts before the rim exists and reports 41 px for a rim the
 * 1-px dump shows crossing in four.
 */
function edgeRise(im, fixed, from, to, axis) {
  const at = t => (axis === 'h' ? Ls(...P(im, t, fixed)) : Ls(...P(im, fixed, t)));
  const step = to > from ? 1 : -1;
  const base = mean(Array.from({ length: 8 }, (_, i) => at(from + i * step)));
  let plateau = base;
  for (let t = from; t !== to; t += step) plateau = Math.max(plateau, at(t));
  const lo = base + 0.10 * (plateau - base), hi = base + 0.90 * (plateau - base);
  let xLo = null, xHi = null;
  for (let t = from; t !== to; t += step) {
    const v = at(t);
    if (xLo === null && v >= lo) xLo = t;
    if (xLo !== null && xHi === null && v >= hi) { xHi = t; break; }
  }
  return (xLo === null || xHi === null) ? null
    : { px: Math.abs(xHi - xLo) + 1, base: base.toFixed(1), plateau: plateau.toFixed(1) };
}

console.log(`# G1 attribution measurement — frames from ${DIR}`);
for (const [name, d] of Object.entries(DISCS)) {
  const im = readPNG(`${DIR}/${name}.png`);
  const b = boxStat(im, d.box);
  const sl = boxStat(im, d.surrL), sr = boxStat(im, d.surrR);
  const surrL = (sl.L * sl.n + sr.L * sr.n) / (sl.n + sr.n);
  const w = d.box[2] - d.box[0] + 1, h = d.box[3] - d.box[1] + 1;
  const cx = (d.box[0] + d.box[2]) / 2, cy = (d.box[1] + d.box[3]) / 2;
  console.log(`\n== ${name}  ${im.w}x${im.h}`);
  console.log(`   bbox   [${d.box}]  ${w}x${h} px  centre (${cx},${cy})  radius~${((w + h) / 4).toFixed(0)} px`);
  console.log(`   disc   mean ${hex(b.col)} L ${b.L.toFixed(2)}   peak ${hex(b.peak.p)} L ${b.peak.v.toFixed(2)} @(${b.peak.x},${b.peak.y})`);
  console.log(`   surr   L ${hex(sl.col)} ${sl.L.toFixed(2)} | R ${hex(sr.col)} ${sr.L.toFixed(2)}  -> ${surrL.toFixed(2)}`);
  console.log(`   CONTRAST  peak-surr +${(b.peak.v - surrL).toFixed(2)} L   mean-surr +${(b.L - surrL).toFixed(2)} L`);

  /* 1. SHAPE — left rim on a horizontal scan, top rim on a vertical scan. */
  const plateau = b.peak.v;
  const rl = edgeRise(im, d.scanH, d.box[0] - 24, d.box[0] + 34, 'h');
  const rt = edgeRise(im, d.scanV, d.box[1] - 24, d.box[1] + 34, 'v');
  const fmt = r => r ? `${r.px} px (base L ${r.base} -> plateau L ${r.plateau})` : 'n/a';
  console.log(`   SHAPE  10-90% rise: left rim (y=${d.scanH}) ${fmt(rl)} | top rim (x=${d.scanV}) ${fmt(rt)}`);
  const line = [];
  for (let x = d.box[0] - 16; x <= d.box[0] + 34; x += 2) line.push(Ls(...P(im, x, d.scanH)).toFixed(1));
  console.log(`   PROFILE x=${d.box[0] - 16}..${d.box[0] + 34} step2 @y=${d.scanH}: ${line.join(' ')}`);

  /* 2. AXIS — brightest compact source outside the disc, line through screen centre. */
  const B = 16; const cands = [];
  for (let by = 0; by + B <= im.h; by += 8) for (let bx = 0; bx + B <= im.w; bx += 8) {
    const mx = bx + B / 2, my = by + B / 2;
    if (mx >= d.box[0] - 20 && mx <= d.box[2] + 20 && my >= d.box[1] - 20 && my <= d.box[3] + 20) continue;
    let s = 0; for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) s += Ls(...P(im, bx + x, by + y));
    cands.push({ v: s / (B * B), x: mx, y: my });
  }
  cands.sort((a, b2) => b2.v - a.v);
  const keep = []; for (const c of cands) { if (keep.every(k => Math.hypot(k.x - c.x, k.y - c.y) > 90)) keep.push(c); if (keep.length === 4) break; }
  const C = [im.w / 2, im.h / 2], R = (w + h) / 4;
  for (const S of keep) {
    const vx = C[0] - S.x, vy = C[1] - S.y, len = Math.hypot(vx, vy);
    const wx = cx - S.x, wy = cy - S.y;
    const perp = Math.abs(vx * wy - vy * wx) / len;
    const t = (vx * wx + vy * wy) / (len * len);
    console.log(`   AXIS   src (${S.x},${S.y}) L ${S.v.toFixed(1)} -> centre: perp ${perp.toFixed(1)} px = ${(perp / R).toFixed(2)} disc radii, t=${t.toFixed(2)}`);
  }

  /* 2b. LOCUS — the converse, and the stronger form. If the disc is a ghost at ANY spacing
     t, its source must lie on the line through the screen centre and the disc. Walk that
     whole line (both directions, clipped to frame) and report the brightest 16-px block on
     it: if the locus carries nothing brighter than the disc itself, no source can have
     thrown it. This does not depend on guessing which bright thing is "the" source. */
  {
    const dx = cx - C[0], dy = cy - C[1], len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    let bestOn = { v: -1 };
    for (let s2 = -2000; s2 <= 2000; s2 += 4) {
      const x = Math.round(C[0] + ux * s2), y = Math.round(C[1] + uy * s2);
      if (x < 8 || y < 8 || x >= im.w - 8 || y >= im.h - 8) continue;
      if (Math.abs(x - cx) < w && Math.abs(y - cy) < h) continue;   // skip the disc itself
      let sum = 0; for (let j = -8; j < 8; j++) for (let i = -8; i < 8; i++) sum += Ls(...P(im, x + i, y + j));
      const v = sum / 256; if (v > bestOn.v) bestOn = { v, x, y, t: s2 / len };
    }
    console.log(`   LOCUS  brightest 16px block ON the centre-disc line: L ${bestOn.v.toFixed(1)} @(${bestOn.x},${bestOn.y}) t=${bestOn.t.toFixed(2)}   [disc peak L ${b.peak.v.toFixed(2)}]`);
  }
}
