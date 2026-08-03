/**
 * P-hue scorer for compose1 — PREREG-compose1.md A.4.
 *
 * Identical statistic to progress/records/drift/roiscore.mjs (the instrument §115.4 and
 * §119.3's hue line were measured on), re-pointed at compose1/frames. Kept byte-comparable
 * on purpose: §122.1 is the record of two owners scoring one run 1.86x apart because their
 * instruments differed silently.
 *
 * Reports hue, saturation, R/G, B/max, per-channel means and the G-darkest share TOGETHER,
 * because §8's green-suppression residual and §3's blue inversion are the same trap from
 * opposite sides and EITHER statistic alone calls the other one solved.
 *
 * GAP (§11): ROI membership is decided offline by world position and normal (roigen.mjs) with
 * no shadow map, no ink hull and no bloom bleed. "archShade" means "on an away-facing
 * architecture surface", NOT "in shadow", and must not be quoted as if it did.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';

const ROI = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift';
const F = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/compose1/frames';
const ARMS = ['base', 'sbm010', 'fill0', 'compose', 'base2'];
const LIMIT = 226;   // the ledger line: shadowed architecture hue <= 226 (blue side of G >= R)

const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

for (const shot of process.argv.slice(2)) {
  const file = `${ROI}/roi-${shot}.json`;
  if (!existsSync(file)) { console.log(`\n### ${shot}: no roi-${shot}.json — run roigen.mjs first`); continue; }
  const roi = JSON.parse(readFileSync(file, 'utf8'));
  for (const pop of ['archShade', 'archLit', 'sky']) {
    const pts = roi[pop];
    if (!pts?.length) continue;
    console.log(`\n--- ${shot} / ${pop}  (${pts.length} samples)${pop === 'archShade' ? `   LEDGER LINE hue <= ${LIMIT}` : ''} ---`);
    console.log('arm         hueP50  satP50   R/G    B/max   meanR meanG meanB   G-darkest%   verdict');
    for (const arm of ARMS) {
      const f = `${F}/${shot}-${arm}.png`;
      if (!existsSync(f)) continue;
      const im = readPNG(f);
      const hs = [], ss = [];
      let R = 0, G = 0, B = 0, gdark = 0;
      for (const [x, y] of pts) {
        const [r, g, b] = px(im, x, y);
        hs.push(hueOf(r, g, b));
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        ss.push(mx ? (mx - mn) / mx : 0);
        R += r; G += g; B += b;
        if (g < r && g < b) gdark++;
      }
      const n = pts.length;
      const mr = R / n, mg = G / n, mb = B / n;
      const h = med(hs);
      const verdict = pop === 'archShade' ? (h <= LIMIT ? 'pass' : '*** OVER LINE ***') : '';
      console.log(`${arm.padEnd(11)} ${h.toFixed(0).padStart(5)}   ${med(ss).toFixed(3)}   ${(mr / mg).toFixed(3)}  ${(mb / Math.max(mr, mg)).toFixed(3)}   ${mr.toFixed(1).padStart(5)} ${mg.toFixed(1).padStart(5)} ${mb.toFixed(1).padStart(5)}   ${(100 * gdark / n).toFixed(1).padStart(5)}%   ${verdict}`);
    }
  }
}
