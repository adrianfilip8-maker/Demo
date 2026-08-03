/**
 * chipscore.mjs — dark-area fraction inside a fixed character ROI, for the tuftInk before/after.
 *
 *   node chipscore.mjs <png> <label> [x y w h]
 *
 * WHAT IS BETWEEN THIS AND WHAT THE RENDERER DRAWS (§11 — the suffix NOT implemented):
 *  - It reads DELIVERED sRGB after the whole PostFX chain. A "dark pixel" here is ink, cast
 *    shadow, dark albedo and vignette summed; this cannot separate them. It is a proxy for
 *    "how much black is in the jaw/chest region", nothing more.
 *  - It has NO object identity. A background pixel inside the ROI counts exactly like a fur
 *    pixel. The ROI is hand-placed on the character and the CANE IS EXCLUDED by starting x
 *    right of the shaft, because SHADING changed gold's route (dd88335) between the two
 *    captures being compared and gold pixels would confound the delta.
 *  - Two captures at different commits differ by every agent's work, not only mine. This number
 *    is admissible ONLY alongside the crops; §3/§7 of KNOWN_ISSUES record what happens when a
 *    statistic is allowed to rule a frame question on its own.
 *
 * The registered prediction (SlyModel.js TUNE.tuftInk) is a NULL: the chips do not visibly
 * shrink. A fall in this number that is NOT visible in the 4x crop does not count as a win.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';

const [p, label, ...rest] = process.argv.slice(2);
const [x0, y0, w, h] = rest.length === 4 ? rest.map(Number) : [600, 170, 130, 150];

/* readPNG is SYNCHRONOUS and returns {w,h,ch,data} — not {width,...} and not a Promise.
   The first version of this file destructured `width` and awaited it. `y*undefined` is NaN,
   `data[NaN]` is undefined, the luma is NaN, and `NaN < 46` is false — so it printed
   "dark 0 (0.00%)" for BOTH captures and meanL=NaN. Had the mean not been NaN, a flat 0.00%
   on both arms would have read as a clean null result. Recorded because it is §11's shape
   exactly: not a wrong calculation, a correct calculation of nothing. */
const img = readPNG(p);
const { w: IW, ch, data } = img;
let n = 0, dark = 0, verydark = 0, sum = 0;
for (let y = y0; y < y0 + h; y++) {
  for (let x = x0; x < x0 + w; x++) {
    const i = (y * IW + x) * ch;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Rec.709 luma on delivered sRGB — not linear, and deliberately so: the question is what
    // reads as black to an eye looking at the PNG.
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    n++; sum += L;
    if (L < 46) dark++;        // ~18% — reads as ink/black
    if (L < 28) verydark++;    // ~11% — unambiguously black
  }
}
console.log(`${label.padEnd(14)} ROI ${x0},${y0} ${w}x${h}  n=${n}  meanL=${(sum / n).toFixed(1)}  ` +
  `dark<46 ${dark} (${(100 * dark / n).toFixed(2)}%)  verydark<28 ${verydark} (${(100 * verydark / n).toFixed(2)}%)`);
