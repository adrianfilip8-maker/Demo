/**
 * bands.mjs — which BAND did the critic sample?
 *
 * `TUNE.bands` is 3 and `slyRamp` (toon.glsl.js:314-321) is unrolled to two terminators at
 * `termLo` 0.14 and `termHi` 0.52, so on any one material the diffuse ramp takes exactly three
 * values: 0, 0.5, 1. With `shadeBand` 0 (shadeForm == 1) and equal AO, the three bands of one
 * surface obey an exact identity in scene-linear:
 *
 *     band(1)   = alb*keyRad
 *     band(0.5) = 0.5*alb*keyRad + 0.5*shadeTerms      <-- the MID band
 *     band(0)   =                      shadeTerms
 *     => band(0.5) == ( band(1) + band(0) ) / 2, per channel.
 *
 * That matters for the seal's target. §2.1.1 specifies three bands *including a mid-tone*, and a
 * mid band on a sunlit warm surface is HALF DIRECT SUN by construction — it is not the band
 * §2.1.3's "shadows are never grey" is talking about. If the r13 critic's `#563d43` is the mid
 * band rather than the shadow band, the acceptance target "345 -> 218" is aimed at a pixel that
 * is 50% sunlight, and no shadow-tint lever can legally take it to 218.
 *
 * This prints the luminance histogram of the colossus's clean patches so the band structure is
 * visible, and tests the identity on the three densest clusters.
 */
import { readPNG } from '../../../tools/png.mjs';
import { hsv, lum } from './measure.mjs';
import { scan } from './patches.mjs';
import { vig, hsvLin } from './space.mjs';
import { unGrade } from './invchain.mjs';

const im = readPNG(process.argv[2] ?? 'shots/r12/courtyard.png');
const roi = (process.argv[3] ?? '870,250,300,370').split(',').map(Number);
const list = scan(im, ...roi, 10, 3.0);
console.log(`ROI ${roi}  clean 10x10 patches: ${list.length}\n`);

const BIN = 5, hist = new Map();
for (const p of list) {
  const b = Math.round(p.L / BIN) * BIN;
  if (!hist.has(b)) hist.set(b, []);
  hist.get(b).push(p);
}
console.log('display L | n   | mean display        | scene-linear                     | R/G');
for (const b of [...hist.keys()].sort((a, x) => a - x)) {
  const sel = hist.get(b);
  const mean = [0, 1, 2].map((c) => sel.reduce((a, p) => a + p.mean[c], 0) / sel.length);
  const v = sel.reduce((a, p) => a + vig(p.x, p.y, im.w, im.h), 0) / sel.length;
  const { scene } = unGrade(mean.map((x) => x / v));
  console.log(`${String(b).padStart(9)} | ${String(sel.length).padStart(3)} | ` +
    `#${mean.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')} h${hsv(mean).h.toFixed(0).padStart(4)} s${hsv(mean).s.toFixed(2)} | ` +
    `${scene.map((x) => x.toFixed(4).padStart(7)).join(' ')} h${hsvLin(scene).h.toFixed(0).padStart(4)} | ` +
    `${(scene[0] / Math.max(scene[1], 1e-9)).toFixed(2).padStart(5)}  ${'#'.repeat(Math.min(60, sel.length))}`);
}
