/**
 * P-night hue scorer — PREREG-pnight.md §3.1 / §3.3.
 *
 * This is progress/records/compose1/huescore.mjs with THREE lines changed: the frame directory,
 * the arm list, and the ROI shot. The statistic itself (hueOf, med, the per-arm loop, the
 * reported columns) is copied verbatim and deliberately NOT improved — §122.1 is the record of
 * two owners scoring one run 1.86x apart because their instruments differed silently, and
 * PREREG-pnight §3.1 registers "the same instrument and the same populations the day shots were
 * scored with".
 *
 * ADDED, and additive only — no existing column is altered:
 *   - signed circular dHue vs `base`, because §3.3's line is on a SHIFT, not on a level.
 *   - a WARM-WARD SIGN CHECK derived from the run itself rather than assumed. `sbm040` raises
 *     shadowBounceMix to 0.40, i.e. it mixes 8x more warm sand bounce into the shadow term than
 *     ship. Its dHue sign therefore IS the warm-ward direction, empirically, on this shot's own
 *     pixels. Asserting the sign from theory is exactly the mistake §8 records costing a session
 *     when a documented convention and the line below it pointed opposite ways.
 *
 * GAP (§11), carried verbatim from roigen.mjs and huescore.mjs and NOT weakened: ROI membership
 * is decided offline by world position and normal, with no shadow map, no ink hull and no bloom
 * bleed. "archShade" means "on an away-facing architecture surface", NOT "in shadow", and must
 * not be quoted as if it did.
 *
 * The 226 ledger line is deliberately NOT applied to night — PREREG-pnight §3.4: that line is
 * for shadowed architecture under the DAYLIGHT shadow light, and borrowing it here would repeat
 * §8's category error. The column is printed for continuity and carries no verdict.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';

const ROI = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift';
const F = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnight1/frames';
const ARMS = ['base', 'rimfloor0', 'sbm040', 'compose', 'base2'];
const SHOT = 'night';

const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
/* circular signed difference in degrees, result in (-180, 180] */
const dHue = (h, ref) => { let d = h - ref; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; };

const file = `${ROI}/roi-${SHOT}.json`;
if (!existsSync(file)) { console.log(`no roi-${SHOT}.json — run roigen.mjs ${SHOT} 4 first`); process.exit(1); }
const roi = JSON.parse(readFileSync(file, 'utf8'));
console.log(`roi-${SHOT}.json  tod=${roi.tod}  sun=[${roi.sun.map((v) => v.toFixed(3)).join(', ')}]  stride=${roi.STRIDE}`);

const results = {};
for (const pop of ['archShade', 'archLit', 'sky']) {
  const pts = roi[pop];
  if (!pts?.length) continue;
  console.log(`\n--- ${SHOT} / ${pop}  (${pts.length} samples) ---`);
  console.log('arm         hueP50  dHue   satP50   R/G    B/max   meanR meanG meanB   G-darkest%');
  results[pop] = {};
  let baseHue = null;
  for (const arm of ARMS) {
    const f = `${F}/${SHOT}-${arm}.png`;
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
    const h = med(hs), s = med(ss);
    if (arm === 'base') baseHue = h;
    const dh = baseHue === null ? 0 : dHue(h, baseHue);
    results[pop][arm] = { hue: h, dHue: dh, sat: s, rg: mr / mg, bmax: mb / Math.max(mr, mg), mr, mg, mb, gdark: 100 * gdark / n };
    console.log(`${arm.padEnd(11)} ${h.toFixed(1).padStart(6)} ${(dh >= 0 ? '+' : '') + dh.toFixed(2)}`.padEnd(27) +
      `${s.toFixed(3)}   ${(mr / mg).toFixed(3)}  ${(mb / Math.max(mr, mg)).toFixed(3)}   ${mr.toFixed(1).padStart(5)} ${mg.toFixed(1).padStart(5)} ${mb.toFixed(1).padStart(5)}   ${(100 * gdark / n).toFixed(1).padStart(5)}%`);
  }
}

/* ---- warm-ward sign, derived from the run, not assumed ---- */
const A = results.archShade;
console.log('\n=== WARM-WARD SIGN CHECK (derived, not assumed) ===');
const sb = A?.sbm040;
if (sb) {
  const warmSign = Math.sign(sb.dHue);
  console.log(`sbm040 mixes 8x ship's warm sand bounce into the shadow term (0.05 -> 0.40).`);
  console.log(`  its archShade dHue = ${sb.dHue >= 0 ? '+' : ''}${sb.dHue.toFixed(2)} deg,  R/G ${A.base.rg.toFixed(3)} -> ${sb.rg.toFixed(3)},  B/max ${A.base.bmax.toFixed(3)} -> ${sb.bmax.toFixed(3)}`);
  console.log(`  => WARM-WARD is dHue ${warmSign >= 0 ? 'POSITIVE (+)' : 'NEGATIVE (-)'} on this shot's archShade pixels.`);
  console.log(`  corroboration (must agree, else the sign is not established):`);
  console.log(`    R/G rises warm-ward?  ${sb.rg > A.base.rg ? 'YES' : 'NO'}   B/max falls warm-ward?  ${sb.bmax < A.base.bmax ? 'YES' : 'NO'}`);
}

/* ---- the registered line ---- */
console.log('\n=== PREREG-pnight 3.3 — CALIBRATION AND LINE ===');
if (A) {
  const sRim = Math.abs(A.rimfloor0?.dHue ?? NaN);
  const sSbm = Math.abs(A.sbm040?.dHue ?? NaN);
  const S = Math.min(sRim, sSbm);
  console.log(`|dHue(rimfloor0)| = ${sRim.toFixed(3)} deg`);
  console.log(`|dHue(sbm040)|    = ${sSbm.toFixed(3)} deg`);
  console.log(`S = min = ${S.toFixed(3)} deg     S/5 = ${(S / 5).toFixed(3)} deg`);
  const c = A.compose;
  if (c) {
    console.log(`compose archShade dHue = ${c.dHue >= 0 ? '+' : ''}${c.dHue.toFixed(3)} deg   |dHue| = ${Math.abs(c.dHue).toFixed(3)}`);
    console.log(`  magnitude <= S/5 ?  ${Math.abs(c.dHue) <= S / 5 ? 'YES' : 'NO'}`);
  }
  const sky = results.sky;
  if (sky?.compose) console.log(`sky control: compose dHue = ${sky.compose.dHue >= 0 ? '+' : ''}${sky.compose.dHue.toFixed(3)} deg  (must not move)`);
  if (sky?.base2) console.log(`sky base2  : dHue = ${sky.base2.dHue.toFixed(3)} (bit-identity floor, must be exactly 0)`);
}
