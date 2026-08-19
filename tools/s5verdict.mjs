#!/usr/bin/env node
/**
 * s5verdict.mjs — score the S5 cold-stone discriminator pair with palwarm's own classifier.
 * The verdict it produced is §469; this file exists so the verdict is re-derivable (§505's
 * lesson: a number whose harness was never committed cannot be re-derived by anyone).
 *
 * Question (§466 tail): the first two rig-live frames swing warm sand -> cool blue-grey in
 * 0.83 s of world time. tod cannot move that far in 0.83 s. Is the cold masonry a tod GRADE
 * (dusk-keyed, would vanish at noon), the authored SHADE treatment (cool wherever shade is,
 * at every tod, warm wherever sun is), or a whole-frame direction/exposure CAST (which would
 * tint sun pixels too)?
 *
 * Instrument: tools/palwarm.mjs classifier verbatim (PREREG-palwarm §2, frozen):
 *   CHROMA_GATE 0.06 · warm [330,90) · cool [150,270) · W = mean over ALL pixels of
 *   c * cos((h-30)deg), achromatic contributing 0 to the numerator.
 *
 * Frames (committed, sha a8fef67 tree, camlook run 2, 1920x1080, rig live):
 *   shots/camlane2-s5-tod-default.png   tod 0.78, the boot golden hour (Engine.js:184)
 *   shots/camlane2-s5-tod-noon.png      tod 0.50 — same shot, 4 sim frames later, only
 *                                       setTimeOfDay between the captures (camlook S5)
 * plus the pair that raised the question (960x540, rig live, tod identical between them):
 *   shots/camlane-idle-rig-live.png     frame 01 — courtyard, sun patches fill the frame
 *   shots/camlane-run-rig-live.png      frame 02 — 0.83 s later, shaded staircase fills it
 *
 * Regions (fractions of W,H so both resolutions share one definition; chosen by eye on the
 * default-tod frame BEFORE any number was computed, and not moved after — §141.1):
 *   shadeL   x 0.14-0.34  y 0.72-0.90   left floor slabs — shaded at BOTH tods
 *   sunHi    x 0.40-0.60  y 0.12-0.24   upper stair blocks — sun-struck at BOTH tods
 *   flip     x 0.30-0.42  y 0.54-0.62   mid floor left of stairs. DECLARED as "shade at
 *            0.78, sun at 0.50"; MEASURED at 0.78 as penumbra rather than deep shade
 *            (chroma 0.077, W +0.037). The region was not moved after seeing that; its
 *            job — show the light field tracking the sun while the grade stays put — it
 *            does either way (noon: chroma 0.370, W +0.359).
 *   corner02 x 0.86-0.99  y 0.07-0.30   frame 02's top-right — the sun surface INSIDE the
 *                                       cool frame; a cast would tint it, shade cannot
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import path from 'node:path';

const CHROMA_GATE = 0.06, WARM_LO = 330, WARM_HI = 90, COOL_LO = 150, COOL_HI = 270;
function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c < 1e-9) return -1;
  let h;
  if (mx === r) h = ((g - b) / c) % 6;
  else if (mx === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
const isWarm = (h) => h >= WARM_LO || h < WARM_HI;
const isCool = (h) => h >= COOL_LO && h < COOL_HI;

function classify(png, fx0 = 0, fy0 = 0, fx1 = 1, fy1 = 1) {
  const { width: W, height: H, data } = png;
  const x0 = Math.floor(fx0 * W), x1 = Math.ceil(fx1 * W);
  const y0 = Math.floor(fy0 * H), y1 = Math.ceil(fy1 * H);
  let n = 0, chromatic = 0, warm = 0, cool = 0, sumW = 0, sumC = 0, sumY = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = (y * W + x) * 4;
    if (data[p + 3] < 128) continue;
    const r = data[p] / 255, g = data[p + 1] / 255, b = data[p + 2] / 255;
    const c = Math.max(r, g, b) - Math.min(r, g, b);
    n++; sumC += c; sumY += r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (c < CHROMA_GATE) continue;
    const h = hueOf(r, g, b);
    sumW += c * Math.cos((h - 30) * Math.PI / 180);
    chromatic++;
    if (isWarm(h)) warm++; else if (isCool(h)) cool++;
  }
  const d = chromatic || 1;
  return { n, W: sumW / (n || 1), warmPct: 100 * warm / d, coolPct: 100 * cool / d,
           chroma: sumC / (n || 1), luma: sumY / (n || 1) };
}

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (p) => PNG.sync.read(readFileSync(`${ROOT}/shots/${p}`));
const F = {
  'tod 0.78 (default)': load('camlane2-s5-tod-default.png'),
  'tod 0.50 (noon)   ': load('camlane2-s5-tod-noon.png'),
  'frame 01 (idle)   ': load('camlane-idle-rig-live.png'),
  'frame 02 (run)    ': load('camlane-run-rig-live.png'),
};
const R = {
  whole:    [0, 0, 1, 1],
  shadeL:   [0.14, 0.72, 0.34, 0.90],
  sunHi:    [0.40, 0.12, 0.60, 0.24],
  flip:     [0.30, 0.54, 0.42, 0.62],
  corner02: [0.86, 0.07, 0.99, 0.30],
};
const fmt = (v, w = 7) => (v >= 0 ? '+' : '') + v.toFixed(4).padStart(w - 1);

console.log('region      frame                    W        warm%   cool%   chroma   luma');
for (const [rn, rect] of Object.entries(R)) {
  for (const [fn, png] of Object.entries(F)) {
    // corner02 interrogates frame 02; shadeL/sunHi/flip interrogate the S5 pair.
    if (rn === 'corner02' && !fn.startsWith('frame 02')) continue;
    if (['shadeL', 'sunHi', 'flip'].includes(rn) && fn.startsWith('frame')) continue;
    const s = classify(png, ...rect);
    console.log(`${rn.padEnd(10)}  ${fn}  ${fmt(s.W)}   ${s.warmPct.toFixed(1).padStart(5)}   ${s.coolPct.toFixed(1).padStart(5)}   ${s.chroma.toFixed(4)}   ${s.luma.toFixed(4)}`);
  }
  console.log('');
}

/* Alignment check — REJECTED AS AN INSTRUMENT, kept on the record (§469.4, §465's family).
   It counts pixels whose "ink-dark" state (luma < 0.10) flips between the two tods, on the
   theory that outlines are lighting-invariant geometry. They are; "luma < 0.10" is not —
   relit shade crosses the threshold in thousands of non-outline pixels, so the number
   (47.5% of dark pixels flip while the geometry visibly does not move) measures the
   relighting it was supposed to ignore. The pair's alignment rests on construction instead:
   camlook S5 captures the same standing shot with no input between, only setTimeOfDay and
   4 sim frames. Printed so the rejection is reproducible too. */
{
  const a = F['tod 0.78 (default)'], b = F['tod 0.50 (noon)   '];
  let ink = 0, flip = 0;
  for (let p = 0; p < a.data.length; p += 4) {
    const ya = (a.data[p] * 0.2126 + a.data[p + 1] * 0.7152 + a.data[p + 2] * 0.0722) / 255;
    const yb = (b.data[p] * 0.2126 + b.data[p + 1] * 0.7152 + b.data[p + 2] * 0.0722) / 255;
    const ia = ya < 0.10, ib = yb < 0.10;
    if (ia || ib) ink++;
    if (ia !== ib) flip++;
  }
  console.log(`[rejected instrument] dark-pixel state flips: ${flip} of ${ink} (${(100 * flip / ink).toFixed(1)}%) — see header`);
}
