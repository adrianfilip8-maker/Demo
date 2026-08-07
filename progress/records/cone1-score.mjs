/**
 * cone1-score — scores the guard-cone heading A/B against PREREG-cone1's registered bands.
 *
 * Self-calibrates against the committed sbs3/guard.png before scoring anything (§122.1), so a
 * change to the arithmetic here is caught against a frame whose numbers were fixed long ago.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/* ===== SEAL CONSTANTS — PREREG-cone1 §3, committed before the capture ===== */
/* Derived from geocert2's projected pool footprint on THIS camera (base x[1,384] y[664,720];
   cand x[0,665] y[295,720]), not from the apex alone. The first ROI this seal had was written
   from the apex and measured ambient sand — it read 0.71-0.87 on the a2 frames, i.e. backwards.
   See PREREG-cone1 §3. */
const ROI = { x0: 0, y0: 295, x1: 667, y1: 660 };   // discriminating band; see PREREG-cone1 §0.1
const FIG = { x0: 820, y0: 244, x1: 900, y1: 625 };
const AIR = { x0: 700, y0: 300, x1: 850, y1: 500 };
const C1_MIN_RATIO = 2.0;      // ships on a directional gain; P-F10 separately judges geocert's ~29x
const C2_MIN_ABS = 2000;
const WARM_MIN = 20, L_MIN = 150;   // bright warm light, not ambient warm floor (base = 467 px, 0.2%)
const PF4_CEIL = 0;
/* ========================================================================== */

const DIR = '/home/user/Demo/progress/records/cone1';
const ORDER = ['preroll1', 'preroll2', 'preroll3', 'base', 'cand', 'restore', 'KBmid', 'KBover'];
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const median = (a) => { const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function load(f) { const im = readPNG(f); return im; }
function stats(im) {
  const warmPx = (R) => { let n = 0; for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) { const o = (y * im.w + x) * im.ch; const r = im.data[o], g = im.data[o + 1], b = im.data[o + 2]; if (r - b > WARM_MIN && lum(r, g, b) > L_MIN) n++; } return n; };
  const medL = (R) => { const v = []; for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) { const o = (y * im.w + x) * im.ch; v.push(lum(im.data[o], im.data[o + 1], im.data[o + 2])); } return +median(v).toFixed(2); };
  return { roiWarmPx: warmPx(ROI), roiMedL: medL(ROI), figureMedL: medL(FIG), airMedL: medL(AIR) };
}
function diffPx(a, b) { let n = 0; for (let i = 0; i < a.w * a.h; i++) { const o = i * a.ch, p = i * b.ch; if (Math.abs(a.data[o] - b.data[p]) + Math.abs(a.data[o + 1] - b.data[p + 1]) + Math.abs(a.data[o + 2] - b.data[p + 2]) >= 4) n++; } return n; }

/* self-calibration on a committed frame from another era */
const CAL = '/home/user/Demo/progress/records/sbs3/guard.png';
if (existsSync(CAL)) {
  const c = stats(load(CAL));
  console.log(`=== SELF-CALIBRATION (committed sbs3/guard.png) ===\n  figureMedL ${c.figureMedL}  airMedL ${c.airMedL}  roiWarmPx ${c.roiWarmPx}  roiMedL ${c.roiMedL}`);
  if (Math.abs(c.figureMedL - 23.19) > 0.05) { console.log(`  FAIL: figureMedL ${c.figureMedL} != 23.19 — the arithmetic moved. VOID.`); process.exit(2); }
  console.log('  -> calibrated (figureMedL reproduces 23.19).\n');
}

const present = ORDER.filter((a) => existsSync(path.join(DIR, `guard.${a}.png`)));
if (!present.length) { console.log('no arms yet'); process.exit(0); }
const IM = Object.fromEntries(present.map((a) => [a, load(path.join(DIR, `guard.${a}.png`))]));
const S = Object.fromEntries(present.map((a) => [a, stats(IM[a])]));

console.log(`=== ARMS: ${present.join(', ')} ===`);
console.log('quantity        ' + present.map((a) => a.padStart(10)).join(''));
for (const k of ['roiWarmPx', 'roiMedL', 'figureMedL', 'airMedL']) {
  console.log('  ' + k.padEnd(14) + present.map((a) => String(S[a][k]).padStart(10)).join(''));
}

const rb = existsSync(path.join(DIR, 'readback.json')) ? JSON.parse(readFileSync(path.join(DIR, 'readback.json'), 'utf8')) : null;
const out = { prereg: 'PREREG-cone1.md', at: new Date().toISOString(), arms: S, verdicts: {} };

console.log('\n=== PROTOCOL FALSIFIERS ===');
if (rb) {
  const scored = (rb.arms || []).filter((a) => !a.discard);
  const boots = new Set((rb.arms || []).map((a) => a.bootId));
  const badTook = scored.filter((a) => !a.armTook).map((a) => a.arm);
  console.log(`  P-F7 armTook (camera fixed AND lever read back) on every scored arm: ${badTook.length ? 'NO -> ' + badTook.join(', ') : 'YES'}`);
  console.log(`  P-F8 one bootId: ${boots.size === 1 ? 'YES' : 'NO (' + boots.size + ')'}; in-lock tree pair same=${rb.sameTree}`);
  console.log(`  P-F9 three prerolls present: ${['preroll1', 'preroll2', 'preroll3'].every((p) => present.includes(p)) ? 'YES' : 'NO'}`);
  out.verdicts.pf7 = !badTook.length; out.verdicts.pf8 = boots.size === 1 && rb.sameTree;
}

console.log('\n=== P-F4 restore vs base, frame-wide — band [0, 0] ===');
if (S.base && S.restore) {
  const d = diffPx(IM.base, IM.restore);
  console.log(`  ${d <= PF4_CEIL ? 'PASS' : 'FAIL -> VOID'}  differing px ${d}`);
  out.verdicts.pf4 = d;
}

console.log('\n=== C1-C5 on the CANDIDATE (P-F1) ===');
if (S.base && S.cand) {
  const ratio = S.base.roiWarmPx > 0 ? S.cand.roiWarmPx / S.base.roiWarmPx : Infinity;
  const chk = (id, ok, txt) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id}  ${txt}`); out.verdicts[id] = ok; };
  chk('C1', ratio >= C1_MIN_RATIO, `ground warm px ratio cand/base = ${ratio.toFixed(2)} (band >= ${C1_MIN_RATIO}; geocert2 predicted ~29x)  [base ${S.base.roiWarmPx}, cand ${S.cand.roiWarmPx}]`);
  chk('C2', S.cand.roiWarmPx >= C2_MIN_ABS, `ground warm px absolute = ${S.cand.roiWarmPx} (band >= ${C2_MIN_ABS})`);
  chk('C3', S.cand.roiMedL >= S.base.roiMedL - 4 && S.cand.roiMedL <= S.base.roiMedL + 40, `ground medL ${S.cand.roiMedL} (band [${(S.base.roiMedL - 4).toFixed(2)}, ${(S.base.roiMedL + 40).toFixed(2)}])`);
  chk('C4', Math.abs(S.cand.figureMedL - S.base.figureMedL) <= 6, `figure medL ${S.cand.figureMedL} vs base ${S.base.figureMedL} (band +-6)`);
  chk('C5', S.cand.airMedL >= S.base.airMedL - 5 && S.cand.airMedL <= S.base.airMedL + 12, `cone-air medL ${S.cand.airMedL} vs base ${S.base.airMedL}`);
  if (ratio < 10) console.log(`  ** P-F10 FIRES (gates nothing about shipping): rendered ratio ${ratio.toFixed(2)}x against geocert2's predicted ~29x — the arithmetic model is OVERSTATED for this lever. No future geocert number carries a shipping argument without a capture. **`);
  out.verdicts.c1ratio = +ratio.toFixed(3);
}

console.log('\n=== P-F2 calibration on ground warm px ===');
if (S.base && S.cand && S.KBmid && S.KBover) {
  const b = S.base.roiWarmPx, m = S.KBmid.roiWarmPx, c = S.cand.roiWarmPx, o = S.KBover.roiWarmPx;
  const span = Math.abs(c - b), inside = m > Math.min(b, c) && m < Math.max(b, c);
  const margin = Math.min(Math.abs(m - b), Math.abs(m - c));
  const ok = inside && margin >= 0.05 * span && (c <= o || Math.abs(c - o) < 0.15 * span);
  console.log(`  base ${b}  KBmid ${m}  cand ${c}  KBover ${o}`);
  console.log(`  KBmid strictly inside: ${inside}; margin ${margin} vs 5% span ${(0.05 * span).toFixed(0)}  -> ${ok ? 'ok' : 'UNSCOREABLE'}`);
  out.verdicts.pf2 = ok;
}

writeFileSync(path.join(DIR, 'score.json'), JSON.stringify(out, null, 1));
console.log(`\nwrote ${path.join(DIR, 'score.json')}`);
