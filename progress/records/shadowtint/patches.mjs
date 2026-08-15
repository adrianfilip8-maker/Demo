/**
 * patches.mjs — find the flattest patches in an ROI and report them in BOTH spaces.
 *
 * The critic samples by eye and quotes one hex. To reproduce or refute that without inheriting
 * its choice of pixel, this sweeps every kxk patch in an ROI, keeps only patches that are ONE
 * surface (per-channel sd below a bar — which also excludes ink lines, silhouette rim and FXAA
 * edges, none of which the display inverse models), and reports the extremes of the luminance
 * distribution: the lit end and the shade end of the same object.
 *
 *   node patches.mjs <png> <x> <y> <w> <h> [k] [sdBar]
 */
import { readPNG } from '../../../tools/png.mjs';
import { hsv, lum, patch, stat } from './measure.mjs';
import { invert, vig, hsvLin } from './space.mjs';
import { unGrade } from './invchain.mjs';

export function scan(im, x0, y0, w, h, k = 10, sdBar = 3.0) {
  const out = [];
  for (let y = y0; y + k <= y0 + h; y += Math.max(1, k >> 1)) {
    for (let x = x0; x + k <= x0 + w; x += Math.max(1, k >> 1)) {
      const s = stat(patch(im, x, y, k, k));
      if (Math.max(...s.sd) > sdBar) continue;
      out.push({ x, y, ...s });
    }
  }
  out.sort((a, b) => a.L - b.L);
  return out;
}

/** Aggregate a set of patches into one representative sample and invert it. */
export function summarise(label, im, list, take) {
  if (!list.length) { console.log(`${label.padEnd(24)} (no clean patches)`); return null; }
  const sel = list.slice(0, take);
  const n = sel.length;
  const mean = [0, 1, 2].map((c) => sel.reduce((a, p) => a + p.mean[c], 0) / n);
  const v = sel.reduce((a, p) => a + vig(p.x, p.y, im.w, im.h), 0) / n;
  const r = unGrade(mean.map((x) => x / v));
  const hD = hsv(mean), hL = hsvLin(r.scene);
  console.log(`${label.padEnd(24)} n${String(n).padStart(4)} patches  disp #${mean.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')} ` +
    `h ${hD.h.toFixed(1).padStart(5)} s ${hD.s.toFixed(3)} L ${lum(mean).toFixed(1).padStart(5)}  vig ${v.toFixed(3)}` +
    `  ->  LINEAR ${r.scene.map((x) => x.toFixed(4).padStart(8)).join(' ')} h ${hL.h.toFixed(1).padStart(5)} s ${hL.s.toFixed(3)}` +
    `${r.flags.length ? '  FLAGS ' + r.flags.join(',') : ''}`);
  return { mean, hD, hL, lin: r.scene, L: lum(mean) };
}

if (process.argv[1].endsWith('patches.mjs')) {
  const a = process.argv.slice(2);
  const im = readPNG(a[0]);
  const list = scan(im, +a[1], +a[2], +a[3], +a[4], +(a[5] ?? 10), +(a[6] ?? 3.0));
  console.log(`${a[0]} ROI (${a[1]},${a[2]}) ${a[3]}x${a[4]}  clean patches: ${list.length}`);
  const q = (f) => list[Math.min(list.length - 1, Math.max(0, Math.round(f * (list.length - 1))))];
  for (const f of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) {
    const p = q(f);
    invert(`  q${(f * 100).toFixed(0).padStart(3)} @(${p.x},${p.y})`, p.mean, { vig: vig(p.x, p.y, im.w, im.h) });
  }
  const nTake = Math.max(1, Math.round(list.length * 0.12));
  console.log('');
  summarise('  SHADE (darkest 12%)', im, list, nTake);
  summarise('  LIT   (brightest 12%)', im, list.slice().reverse(), nTake);
}
