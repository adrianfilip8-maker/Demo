/**
 * pnightrim — the PREREG-pnight 3.2 ESCAPE HATCH ONLY.
 *
 * WHAT THIS IS NOT, stated first because PREREG-pnight 3.2 carries an explicit cross-seal
 * warning and §122.1 is the record of one run scored 1.86x apart by two instruments:
 *
 *   THIS IS NOT PREREG-kerb's V3. V3 is `rimPx (lift >= 8 L vs norim) ratio arm/a0`.
 *   pnight1 captured no `norim` arm, so V3's denominator DOES NOT EXIST in this boot and V3
 *   is NOT COMPUTABLE from these five frames. PREREG-pnight 3.2 predicted this capture would
 *   "produce the night half of PREREG-kerb's V3 for free"; that prediction is FALSE, and the
 *   falsity is a reportable result rather than something to paper over with a nearby frame.
 *   Cross-boot `night-norim.png` files exist under shots/rim1, shots/rim2 and scratchpad/q6.
 *   They are NOT used here: they are from other trees and other boots, and substituting one
 *   would be the provenance failure §10 records ("a 25-commit-old PNG looked like a live sky
 *   bug").
 *
 * WHAT THIS IS: a same-boot, assumption-free test of the one question the escape hatch turns
 * on -- **is `rimfloor0` a genuine known-bad?** PREREG-pnight 3.2 admits `rimfloor0` as a
 * calibration point on the grounds that zeroing `uRimShadowFloorArch` "zeroes the shadow-side
 * architecture rim outright". If that is false -- if the poke barely moves the rim -- then the
 * calibration has no valid unit and P-night is UNSCOREABLE, per 3.2's own clause.
 *
 * The statistic: `floorPx` = pixels where L(base) - L(rimfloor0) >= 8, the same 8 L lift
 * threshold V3 uses, but measured against `base` in the SAME BOOT rather than against `norim`.
 * A pixel in `floorPx` is one whose luminance was being carried, to >= 8 L, by
 * uRimShadowFloorArch at its shipped 0.55.
 *
 * §8's lesson is wired in as a guard: "a knob moving the image proves it is connected, not that
 * it is the cause" -- disabling the shadow wash once changed 83.8% of the frame and left the
 * defect bit-intact. So this reports the FULL changed fraction alongside the >=8 L population,
 * and the spatial distribution of both. A knob that dims the whole frame uniformly is a
 * different animal from one that removes a thin band on silhouette edges, and the counts alone
 * cannot tell them apart.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const F = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnight1/frames';
const ROI = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift/roi-night.json';
const OUT = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnight1';
const LIFT = 8;   // V3's threshold, reused so the numbers are at least on the same scale

const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const base = readPNG(`${F}/night-base.png`);
const W = base.w, H = base.h;
console.log(`frame ${W}x${H} = ${W * H} px\n`);

/* archShade membership as a lookup, so the rim loss can be split by population */
let shadeSet = null;
if (existsSync(ROI)) {
  const roi = JSON.parse(readFileSync(ROI, 'utf8'));
  shadeSet = new Set(roi.archShade.map(([x, y]) => y * W + x));
  console.log(`archShade ROI: ${shadeSet.size} sample points (stride ${roi.STRIDE}; ROI is sampled, not dense)\n`);
}

const report = {};
for (const arm of ['base2', 'rimfloor0', 'sbm040', 'compose']) {
  const f = `${F}/night-${arm}.png`;
  if (!existsSync(f)) continue;
  const im = readPNG(f);
  let changed = 0, drop8 = 0, rise8 = 0, dropSum = 0;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  const rowHist = new Array(H).fill(0);
  const dropMask = new Uint8Array(W * H);
  let shadeDrop = 0, shadeTot = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r0, g0, b0] = px(base, x, y);
      const [r1, g1, b1] = px(im, x, y);
      if (r0 !== r1 || g0 !== g1 || b0 !== b1) changed++;
      const d = L(r0, g0, b0) - L(r1, g1, b1);
      if (shadeSet?.has(y * W + x)) { shadeTot++; if (d >= LIFT) shadeDrop++; }
      if (d >= LIFT) {
        drop8++; dropSum += d; dropMask[y * W + x] = 1; rowHist[y]++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else if (-d >= LIFT) rise8++;
    }
  }
  /* horizontal run-length structure: is the lost population a thin EDGE band or a solid area?
     A rim is a line. A wash is a field. The median run length separates them. */
  const runs = [];
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) {
      if (dropMask[y * W + x]) run++;
      else { if (run) runs.push(run); run = 0; }
    }
    if (run) runs.push(run);
  }
  runs.sort((a, b) => a - b);
  const medRun = runs.length ? runs[runs.length >> 1] : 0;
  const p90Run = runs.length ? runs[Math.floor(runs.length * 0.9)] : 0;

  report[arm] = { changed, drop8, rise8, dropSum, medRun, p90Run, nRuns: runs.length, shadeDrop, shadeTot };
  console.log(`--- ${arm} vs base ---`);
  console.log(`  any-pixel change      ${changed} px  (${(100 * changed / (W * H)).toFixed(2)}% of frame)`);
  console.log(`  lost >= ${LIFT} L         ${drop8} px  (${(100 * drop8 / (W * H)).toFixed(3)}% of frame)`);
  console.log(`  gained >= ${LIFT} L       ${rise8} px`);
  console.log(`  total L removed       ${dropSum.toFixed(0)}   mean per lost px ${drop8 ? (dropSum / drop8).toFixed(1) : '-'} L`);
  if (drop8) console.log(`  bbox of loss          x[${minX},${maxX}] y[${minY},${maxY}]`);
  console.log(`  horiz run length      median ${medRun} px, p90 ${p90Run} px, ${runs.length} runs  (a rim is a LINE: short runs; a wash is a FIELD: long runs)`);
  if (shadeSet) console.log(`  within archShade ROI  ${shadeDrop} / ${shadeTot} sample px lost >= ${LIFT} L  (${(100 * shadeDrop / Math.max(1, shadeTot)).toFixed(1)}%)`);
  console.log();

  if (arm === 'rimfloor0') {
    /* overlay so the population is checkable rather than asserted */
    const o = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      const x = i % W, y = (i / W) | 0;
      const [r, g, b] = px(base, x, y);
      const l = L(r, g, b) * 0.35;
      if (dropMask[i]) { o[i * 3] = 255; o[i * 3 + 1] = 0; o[i * 3 + 2] = 255; }
      else { o[i * 3] = l; o[i * 3 + 1] = l; o[i * 3 + 2] = l; }
    }
    writeFileSync(`${OUT}/rimfloor0-loss.ppm`, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), o]));
    console.log(`  wrote ${OUT}/rimfloor0-loss.ppm (magenta = px that lost >= ${LIFT} L when the floor went to 0)\n`);
  }
}

console.log('=== ESCAPE HATCH (PREREG-pnight 3.2) ===');
const r = report.rimfloor0;
console.log(`rimfloor0 removes ${r.drop8} px at >= ${LIFT} L (${(100 * r.drop8 / (W * H)).toFixed(3)}% of frame).`);
console.log('This is NOT V3 and does not report a V3 retention ratio. It answers only:');
console.log('  "does zeroing uRimShadowFloorArch actually take a materially large, edge-shaped');
console.log('   population of rim off night?" -- which is what admits it as a calibration point.');
console.log(`\nbase2 control (must be 0 on every column): changed=${report.base2.changed}  drop8=${report.base2.drop8}`);
