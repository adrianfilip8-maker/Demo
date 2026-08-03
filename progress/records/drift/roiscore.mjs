/**
 * Score the sweep arms inside the spatial ROIs from roigen.mjs.
 *
 *   node roiscore.mjs <shot> <arm> [arm ...]
 *
 * Reports, per population: median hue, median HSV saturation, mean b-r, mean L, and the share
 * of pixels whose darkest channel is GREEN — the ordering statistic §16 settled on, kept
 * alongside the angle because a term that raises B rotates hue AND reorders channels, and
 * reading either as authority over the other is the error KNOWN_ISSUES records at
 * shadowBounceMix. Medians, not means: §104.2 killed a mean over a bimodal population.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { readFileSync } from 'node:fs';

const DIR = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift';
const SHOT = process.argv[2];
const ARMS = process.argv.slice(3);
const roi = JSON.parse(readFileSync(`${DIR}/roi-${SHOT}.json`, 'utf8'));

const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

for (const pop of ['archShade', 'archLit', 'sphinx', 'sky']) {
  const pts = roi[pop];
  if (!pts?.length) continue;
  console.log(`\n--- ${SHOT} / ${pop}  (${pts.length} samples) ---`);
  console.log('arm          hueP50  satP50   mean b-r   mean L   G-darkest%');
  for (const arm of ARMS) {
    let im;
    try { im = readPNG(`${DIR}/frames/${SHOT}-${arm}.png`); } catch { continue; }
    const hs = [], ss = [];
    let bmr = 0, L = 0, gdark = 0;
    for (const [x, y] of pts) {
      const [r, g, b] = px(im, x, y);
      hs.push(hueOf(r, g, b));
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      ss.push(mx ? (mx - mn) / mx : 0);
      bmr += (b - r) / 255; L += (0.2126 * r + 0.7152 * g + 0.0722 * b);
      if (g < r && g < b) gdark++;
    }
    const n = pts.length;
    console.log(`${arm.padEnd(12)} ${med(hs).toFixed(0).padStart(5)}   ${med(ss).toFixed(3)}   ${(bmr / n >= 0 ? '+' : '') + (bmr / n).toFixed(4)}    ${(L / n).toFixed(1).padStart(5)}   ${(100 * gdark / n).toFixed(1)}%`);
  }
}
