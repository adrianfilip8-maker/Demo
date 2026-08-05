/**
 * pncscore — the registered scorer for PREREG-pnightcal.md. Committed BEFORE the capture
 * completes; every threshold here is the prereg's, transcribed once and never edited after
 * a number is read (§141.1 / §156.2's escalation).
 *
 * Statistic: pnighthue.mjs verbatim (hueOf/med/dHue, hueP50 per population, signed circular
 * dHue vs base) on roi-night-cal.json — the stride-4 ROI regenerated at the capture's tree.
 * The §11 gap travels: archShade = "on an away-facing architecture surface", NOT "in shadow".
 *
 * Order of gates (the verdict short-circuits in this order):
 *   VOID        V1 base!=base2 bit-identity, V2 readback mismatch, V3/V4 tree mismatches
 *   UNSCOREABLE G1 sign, G2 separation (>= 0.50 deg), G3 dose response
 *               (G4 was established offline: synthcal gain 0.961 at delta=+1, PASS)
 *   VERDICT     L1 |dHue(compose)| <= 1.40 deg  (archShade)
 *               L2 |dHue(sky,compose)| <= 0.30 deg
 *               L3 |d meanLuma(archShade, compose)| <= 10 % relative
 *               L4 P-frame — NOT scored here; the printed verdict is PROVISIONAL until the
 *                  frames are looked at and RESULT-pnightcal.md records what was seen.
 *
 * Also printed, never part of the verdict: cross-tree continuity bands (report-only),
 * compose as a fraction of each known-bad separation, the measured night response slope and
 * the implied night-safe sbm ceiling (0.05 + 1.40/slope, slope chosen CONSERVATIVELY as the
 * largest of the three estimates — registered here, before the numbers), and the frame-wide
 * mean(B-R) continuity link to §133.2 (carries no verdict; §141.2 stands).
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';

/* PNC_DIR override exists so the selftest can exercise THIS file on constructed inputs —
   §156.1: testing a transcribed duplicate of a gate is how a gate ships broken. Scoring the
   real run uses the default. */
const DIR = process.env.PNC_DIR || '/home/user/Demo/progress/records/pnightcal';
const F = `${DIR}/frames`;
const ARMS = ['base', 'sbm020', 'sbm040', 'compose', 'base2'];

/* ---- registered thresholds (PREREG-pnightcal) ---- */
const L1_DEG = 1.40, L2_DEG = 0.30, L3_REL = 0.10;
const G2_DEG = 0.50;
const G4 = { established: 'offline synthcal 2026-08-05', gainAt1deg: 0.961, pass: true };
const CONT = { sbm040: [6.5, 26.1], compose: [0.94, 3.76], baseHue: [224.444 - 3, 224.444 + 3] };
const DOSE = { sbm020: 0.15, sbm040: 0.35, compose: 0.05 }; // lever delta above ship 0.05

/* ---- sealed statistic, verbatim ---- */
const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const dHue = (h, ref) => { let d = h - ref; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; };

const die = (m) => { console.log(m); process.exit(1); };
if (!existsSync(`${DIR}/roi-night-cal.json`)) die('no roi-night-cal.json — run roigencal.mjs night 4 first');
if (!existsSync(`${DIR}/pnightcal.json`)) die('no pnightcal.json — capture has not run');
const roi = JSON.parse(readFileSync(`${DIR}/roi-night-cal.json`, 'utf8'));
const run = JSON.parse(readFileSync(`${DIR}/pnightcal.json`, 'utf8'));

console.log(`pncscore — PREREG-pnightcal registered scoring`);
console.log(`roi: stride ${roi.STRIDE} srcTree ${roi.srcTree}  capture: sha ${run.prov.sha} srcTree ${run.prov.srcTreeBefore}->${run.prov.srcTreeAfter}`);

/* ---- V-gates ---- */
let voidRun = false;
const v2bad = (run.rows || []).filter((r) => r.mismatch?.length);
if (v2bad.length) { console.log(`V2 FAIL — readback mismatch on ${v2bad.map((r) => r.arm).join(',')} — RUN VOID`); voidRun = true; }
else console.log('V2 PASS — every arm applied ok (empty mismatch lists)');

const v4 = run.prov.srcTreeBefore === run.prov.srcTreeAfter;
console.log(v4 ? `V4 PASS — srcTree stable across the run (${run.prov.srcTreeBefore})`
  : `V4 ATTENTION — srcTree moved ${run.prov.srcTreeBefore} -> ${run.prov.srcTreeAfter}; single-navigation harness (§159.1 keeps arm-vs-arm valid) but absolute attribution is dirty — handle per §155.3 in RESULT`);

const v3 = roi.srcTree === run.prov.srcTreeBefore || roi.srcTree === run.prov.srcTreeAfter;
if (!v3) { console.log(`V3 FAIL — ROI tree ${roi.srcTree} matches neither capture stamp; regenerate roigencal at the capture tree and rescore`); process.exit(1); }
console.log(`V3 PASS — ROI built at the capture's tree`);

/* V1: whole-frame bit identity, threshold stated (§122.1): any channel differing by >= 1 */
const imBase = readPNG(`${F}/night-base.png`);
const imBase2 = readPNG(`${F}/night-base2.png`);
let diffPx = 0;
if (imBase.w !== imBase2.w || imBase.h !== imBase2.h) { diffPx = -1; }
else {
  const a = imBase.data, b = imBase2.data, ch = imBase.ch;
  for (let i = 0; i < imBase.w * imBase.h; i++) {
    const o = i * ch;
    if (a[o] !== b[o] || a[o + 1] !== b[o + 1] || a[o + 2] !== b[o + 2]) diffPx++;
  }
}
if (diffPx !== 0) { console.log(`V1 FAIL — base vs base2 differ at ${diffPx} px (anyCh >= 1) — RUN VOID (§119.3 P1)`); voidRun = true; }
else console.log('V1 PASS — base and base2 bit-identical (0 differing px at anyCh >= 1)');
if (voidRun) { console.log('\nVERDICT: VOID'); process.exit(1); }

/* ---- score populations ---- */
const results = {};
for (const pop of ['archShade', 'archLit', 'sky']) {
  const pts = roi[pop];
  if (!pts?.length) continue;
  console.log(`\n--- night / ${pop}  (${pts.length} samples) ---`);
  console.log('arm       hueP50    dHue     satP50   R/G    B/max   meanLuma');
  results[pop] = {};
  let baseHue = null;
  for (const arm of ARMS) {
    const f = `${F}/night-${arm}.png`;
    if (!existsSync(f)) { console.log(`${arm} MISSING`); continue; }
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
    const n = pts.length, mr = R / n, mg = G / n, mb = B / n;
    const luma = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb;
    const h = med(hs), s = med(ss);
    if (arm === 'base') baseHue = h;
    const dh = baseHue === null ? 0 : dHue(h, baseHue);
    results[pop][arm] = { hue: h, dHue: dh, sat: s, rg: mr / mg, bmax: mb / Math.max(mr, mg), luma, gdark: 100 * gdark / n };
    console.log(`${arm.padEnd(9)} ${h.toFixed(3).padStart(8)} ${((dh >= 0 ? '+' : '') + dh.toFixed(3)).padStart(8)}  ${s.toFixed(3)}   ${(mr / mg).toFixed(3)}  ${(mb / Math.max(mr, mg)).toFixed(3)}   ${luma.toFixed(2).padStart(7)}  ${(100 * gdark / n).toFixed(1).padStart(5)}%`);
  }
}

const A = results.archShade, SKY = results.sky;

/* ---- frame-wide mean(B-R) continuity link (no verdict — §141.2 stands) ---- */
console.log('\n--- frame-wide mean(B-R), continuity link to §133.2 only ---');
let baseBR = null;
for (const arm of ARMS) {
  const im = readPNG(`${F}/night-${arm}.png`);
  let s = 0; const d = im.data, ch = im.ch, n = im.w * im.h;
  for (let i = 0; i < n; i++) { const o = i * ch; s += d[o + 2] - d[o]; }
  const br = s / n / 255;
  if (arm === 'base') baseBR = br;
  console.log(`${arm.padEnd(9)} B-R ${br.toFixed(4)}  d ${(br - baseBR >= 0 ? '+' : '') + (br - baseBR).toFixed(4)}`);
}

/* ---- G-gates ---- */
console.log('\n=== CALIBRATION GATES (§13 — the metric must be SHOWN to move) ===');
const d20 = A?.sbm020?.dHue, d40 = A?.sbm040?.dHue, dc = A?.compose?.dHue;
/* G1 gates on sign + R/G only. B/max is REPORTED, never gated: §156.2 records it RISING on
   the real sbm040 (G fell at constant B — §115.2's green-blindness signature); the prereg
   amendment at §4 has the story. Caught by scoretest.mjs before the capture booted. */
const g1 = d20 > 0 && d40 > 0
  && A.sbm020.rg > A.base.rg && A.sbm040.rg > A.base.rg;
console.log(`G1 sign+corroboration: sbm020 ${d20 >= 0 ? '+' : ''}${d20?.toFixed(3)} (R/G ${A.base.rg.toFixed(3)}->${A.sbm020.rg.toFixed(3)}), sbm040 ${d40 >= 0 ? '+' : ''}${d40?.toFixed(3)} (R/G ->${A.sbm040.rg.toFixed(3)})  ${g1 ? 'PASS' : 'FAIL -> UNSCOREABLE'}`);
console.log(`    reported, not gated: B/max ${A.base.bmax.toFixed(3)} -> ${A.sbm020.bmax.toFixed(3)} / ${A.sbm040.bmax.toFixed(3)}  (may rise when G falls at constant B — §156.2);  G-darkest% ${A.base.gdark.toFixed(1)} -> ${A.sbm020.gdark.toFixed(1)} / ${A.sbm040.gdark.toFixed(1)}`);
const g2 = Math.abs(d20) >= G2_DEG;
console.log(`G2 separation: |dHue(sbm020)| = ${Math.abs(d20).toFixed(3)} >= ${G2_DEG}  ${g2 ? 'PASS' : 'FAIL -> UNSCOREABLE (no fallback to sbm040 — §141.3)'}`);
const g3 = Math.abs(d40) > Math.abs(d20);
console.log(`G3 dose response: |dHue(sbm040)| ${Math.abs(d40).toFixed(3)} > |dHue(sbm020)| ${Math.abs(d20).toFixed(3)}  ${g3 ? 'PASS' : 'FAIL -> UNSCOREABLE'}`);
console.log(`G4 resolution: ${G4.pass ? 'PASS' : 'FAIL'} (${G4.established}, gain ${G4.gainAt1deg} at +1 deg)`);
if (!(g1 && g2 && g3 && G4.pass)) { console.log('\nVERDICT: UNSCOREABLE — reported, not converted'); process.exit(1); }

/* ---- the line ---- */
console.log('\n=== THE REGISTERED LINE ===');
const l1 = Math.abs(dc) <= L1_DEG;
console.log(`L1 hue: |dHue(compose)| = ${Math.abs(dc).toFixed(3)} <= ${L1_DEG.toFixed(2)}  ${l1 ? 'PASS' : 'FAIL'}   (signed: ${dc >= 0 ? '+' : ''}${dc.toFixed(3)}, warm-ward is ${d40 > 0 ? 'positive' : 'negative'})`);
const skyC = SKY?.compose?.dHue ?? NaN;
const l2 = Math.abs(skyC) <= L2_DEG;
console.log(`L2 sky: |dHue(sky,compose)| = ${Math.abs(skyC).toFixed(3)} <= ${L2_DEG.toFixed(2)}  ${l2 ? 'PASS' : 'FAIL'}`);
const lumRel = (A.compose.luma - A.base.luma) / A.base.luma;
const l3 = Math.abs(lumRel) <= L3_REL;
console.log(`L3 luma: |d meanLuma(archShade)| = ${(100 * Math.abs(lumRel)).toFixed(3)} % <= ${(100 * L3_REL).toFixed(0)} %  ${l3 ? 'PASS' : 'FAIL'}`);
console.log(`L4 P-frame: NOT SCORED HERE — look at the frames; verdict below is PROVISIONAL until RESULT records what was seen`);

/* ---- report-only blocks ---- */
console.log('\n=== CROSS-TREE CONTINUITY (report-only, voids nothing) ===');
const inb = (v, [lo, hi]) => v >= lo && v <= hi;
console.log(`sbm040 ${Math.abs(d40).toFixed(3)} in [${CONT.sbm040}]  ${inb(Math.abs(d40), CONT.sbm040) ? 'ok' : 'CROSS-TREE DRIFT — report'}`);
console.log(`compose ${Math.abs(dc).toFixed(3)} in [${CONT.compose}]  ${inb(Math.abs(dc), CONT.compose) ? 'ok' : 'CROSS-TREE DRIFT — report'}`);
console.log(`base hueP50 ${A.base.hue.toFixed(3)} in [${CONT.baseHue.map((v) => v.toFixed(1))}]  ${inb(A.base.hue, CONT.baseHue) ? 'ok' : 'CROSS-TREE DRIFT — report'}`);

console.log('\n=== PUBLISHED NEXT TO THE VERDICT ===');
console.log(`compose = ${(100 * Math.abs(dc) / Math.abs(d20)).toFixed(1)} % of the 2x-ceiling separation, ${(100 * Math.abs(dc) / Math.abs(d40)).toFixed(1)} % of the 4x-ceiling separation`);
const slopes = { via020: Math.abs(d20) / DOSE.sbm020, via040: Math.abs(d40) / DOSE.sbm040, twoPoint: (Math.abs(d40) - Math.abs(d20)) / (DOSE.sbm040 - DOSE.sbm020) };
const slope = Math.max(slopes.via020, slopes.via040, slopes.twoPoint);
console.log(`night response slope (deg per unit sbm): via020 ${slopes.via020.toFixed(1)}, via040 ${slopes.via040.toFixed(1)}, two-point ${slopes.twoPoint.toFixed(1)} -> conservative ${slope.toFixed(1)}`);
console.log(`implied night-safe sbm ceiling = 0.05 + ${L1_DEG}/${slope.toFixed(1)} = ${(0.05 + L1_DEG / slope).toFixed(4)}   (compose ships at 0.10)`);

const verdict = l1 && l2 && l3;
console.log(`\nPROVISIONAL VERDICT (pending L4 P-frame): ${verdict ? 'PASS' : 'FAIL'}`);
