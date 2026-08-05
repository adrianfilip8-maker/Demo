/**
 * O1 — PREREG-pnightcal §6. Continuity / provenance for the DURABLE pnight1 artifacts.
 *
 * This is progress/records/pnight1/pnighthue.mjs (the sealed §156.2 scorer) with the two
 * path constants moved off the rolled-back scratchpad onto the durable copies, plus two
 * ADDITIVE reports the successor seal registered in advance:
 *   - the OLD run's compose SKY dHue, which PREREG-pnightcal L2 uses as its pre-capture
 *     band check (band 0.30°; if this bleed > 0.15° the band is amended at the prereg site
 *     BEFORE the new capture, never silently);
 *   - per-arm archShade MEAN LUMA (0.2126R+0.7152G+0.0722B), the L3 guard's quantity, so
 *     the forecast "≪ 1 %" is written next to a measured old-tree number.
 *
 * The statistic itself (hueOf, med, dHue, the per-arm loop, the printed columns) is copied
 * verbatim and deliberately NOT improved — §122.1. Its job here is to reproduce §156.2
 * digit-for-digit from the durable copies: rimfloor0 0.882°, sbm040 13.025°, compose 1.882°.
 * Reading these numbers is not new contamination; they are published.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';

const ROI_FILE = '/home/user/Demo/progress/records/pnight1/roi-night.json';
const F = '/home/user/Demo/progress/records/pnight1/frames';
const ARMS = ['base', 'rimfloor0', 'sbm040', 'compose', 'base2'];
const SHOT = 'night';

const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const dHue = (h, ref) => { let d = h - ref; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; };

if (!existsSync(ROI_FILE)) { console.log('no durable roi-night.json'); process.exit(1); }
const roi = JSON.parse(readFileSync(ROI_FILE, 'utf8'));
console.log(`O1 continuity — durable pnight1 copies`);
console.log(`roi-${SHOT}.json  tod=${roi.tod}  sun=[${roi.sun.map((v) => v.toFixed(3)).join(', ')}]  stride=${roi.STRIDE}`);

const results = {};
for (const pop of ['archShade', 'archLit', 'sky']) {
  const pts = roi[pop];
  if (!pts?.length) continue;
  console.log(`\n--- ${SHOT} / ${pop}  (${pts.length} samples) ---`);
  console.log('arm         hueP50  dHue     satP50   R/G    B/max   meanR meanG meanB  meanLuma  G-darkest%');
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
    const luma = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb;
    const h = med(hs), s = med(ss);
    if (arm === 'base') baseHue = h;
    const dh = baseHue === null ? 0 : dHue(h, baseHue);
    results[pop][arm] = { hue: h, dHue: dh, sat: s, rg: mr / mg, bmax: mb / Math.max(mr, mg), luma };
    console.log(`${arm.padEnd(11)} ${h.toFixed(1).padStart(6)} ${((dh >= 0 ? '+' : '') + dh.toFixed(3)).padStart(8)}  ${s.toFixed(3)}   ${(mr / mg).toFixed(3)}  ${(mb / Math.max(mr, mg)).toFixed(3)}   ${mr.toFixed(1).padStart(5)} ${mg.toFixed(1).padStart(5)} ${mb.toFixed(1).padStart(5)}  ${luma.toFixed(2).padStart(7)}  ${(100 * gdark / n).toFixed(1).padStart(5)}%`);
  }
}

console.log('\n=== O1 REPRODUCTION CHECK (must match §156.2 digit-for-digit) ===');
const A = results.archShade;
const want = { rimfloor0: 0.882, sbm040: 13.025, compose: 1.882 };
let ok = true;
for (const [arm, w] of Object.entries(want)) {
  const got = Math.abs(A?.[arm]?.dHue ?? NaN);
  const pass = Math.abs(got - w) < 0.0005 + 1e-9;
  ok &&= pass;
  console.log(`  |dHue(${arm})| = ${got.toFixed(3)}  vs published ${w.toFixed(3)}  ${pass ? 'MATCH' : 'MISMATCH'}`);
}
console.log(`O1 ${ok ? 'PASS — durable artifacts are the scored ones' : 'FAIL — durable copies are NOT the scored artifacts; STOP'}`);

console.log('\n=== L2 BAND CHECK (old compose sky bleed; band 0.30°, amend-before-capture line 0.15°) ===');
const sc = results.sky?.compose;
console.log(`  sky compose dHue = ${sc ? (sc.dHue >= 0 ? '+' : '') + sc.dHue.toFixed(3) : 'n/a'} deg   ${sc && Math.abs(sc.dHue) > 0.15 ? 'EXCEEDS 0.15 — amend L2 at the prereg site BEFORE capture' : 'inside half-band — L2 stands at 0.30°'}`);
const sb2 = results.sky?.base2;
console.log(`  sky base2  dHue = ${sb2 ? sb2.dHue.toFixed(3) : 'n/a'} (bit-identity floor)`);

console.log('\n=== L3 CONTEXT (old compose archShade mean-luma delta) ===');
if (A?.base && A?.compose) {
  const rel = 100 * (A.compose.luma - A.base.luma) / A.base.luma;
  console.log(`  archShade meanLuma base ${A.base.luma.toFixed(2)} -> compose ${A.compose.luma.toFixed(2)}  (${rel >= 0 ? '+' : ''}${rel.toFixed(3)} % rel; L3 guard is ±10 %)`);
}
