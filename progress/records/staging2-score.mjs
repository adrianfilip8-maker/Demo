/**
 * staging2-score — scores PREREG-staging2.md's registered quantities on the frames staging2.mjs
 * landed. Bands are duplicated VERBATIM from the seal §4/§5; a mismatch between this file and the
 * seal voids the scoring, not the seal.
 *
 * Conventions (§122.1, restated with every count):
 *   L    = 0.2126R + 0.7152G + 0.0722B on 0..255 sRGB bytes (Rec.709)
 *   NBC  = L < 72 AND (B - R) > +12          — the wedge's measured signature
 *   warm = (B - R) < 2                       — guard body / armour / spear
 *   differing px = ΣRGB >= 4
 *   figure rect   (820,244,900,625)   figure column x∈[800,930], py 244..625
 *
 * P7's "39 ten-px row bands spanning py 244…625" is made exact here as 39 contiguous bands
 * b ∈ [0,38] covering rows [244 + floor(b*381/39), 244 + floor((b+1)*381/39)) — 9 or 10 rows each,
 * spanning 244..625 with no degenerate band. Stated because a scorer that silently reinterprets
 * its seal is the §122.1 hazard wearing a different hat.
 *
 * SELF-CALIBRATION runs first and exits 2 on failure: this is a second implementation in a second
 * language from the Python scorer that produced the seal's anchors, so it must reproduce every
 * anchor on the committed sbs3/guard.png before it is allowed to score anything.
 *
 *   usage: node progress/records/staging2-score.mjs
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = '/home/user/Demo/progress/records/staging2';
const SBS3 = '/home/user/Demo/progress/records/sbs3/guard.png';

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function load(f) {
  const im = readPNG(f);
  const n = im.w * im.h;
  const L = new Float32Array(n), BR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * im.ch;
    L[i] = lum(im.data[o], im.data[o + 1], im.data[o + 2]);
    BR[i] = im.data[o + 2] - im.data[o];
  }
  return { w: im.w, h: im.h, ch: im.ch, data: im.data, L, BR };
}
const median = (a) => { const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const isNBC = (im, i) => im.L[i] < 72 && im.BR[i] > 12;
function rectIdx(im, x0, y0, x1, y1) { const o = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) o.push(y * im.w + x); return o; }
const rectMedL = (im, x0, y0, x1, y1) => median(rectIdx(im, x0, y0, x1, y1).map((i) => im.L[i]));

function P1(im) { const idx = rectIdx(im, 820, 244, 900, 625); let n = 0; for (const i of idx) if (isNBC(im, i)) n++; return 100 * (1 - n / idx.length); }
function P2(im) {
  const x0 = 800, x1 = 930, w = x1 - x0;
  const dense = new Uint8Array(im.h);
  for (let y = 0; y < im.h; y++) { let n = 0; for (let x = x0; x < x1; x++) if (isNBC(im, y * im.w + x)) n++; dense[y] = n / w >= 0.60 ? 1 : 0; }
  let y = im.h - 1;
  if (!dense[y]) return 720;
  while (y > 0 && dense[y]) y--;
  return y + 1;
}
function P3(im) { const idx = rectIdx(im, 640, 360, 1280, 720); let n = 0; for (const i of idx) if (isNBC(im, i)) n++; return 100 * n / idx.length; }
function P45(im) {
  const idx = rectIdx(im, 820, 244, 900, 625);
  const warm = [];
  for (const i of idx) if (im.BR[i] < 2) warm.push(im.L[i]);
  return { P4: warm.length, P5: warm.length ? median(warm) : -1 };
}
/* P7 — per-row continuity: how many of the 39 bands are less than 40% NOT-NBC. */
function P7(im) {
  let bad = 0; const shares = [];
  for (let b = 0; b < 39; b++) {
    const y0 = 244 + Math.floor(b * 381 / 39), y1 = 244 + Math.floor((b + 1) * 381 / 39);
    const idx = rectIdx(im, 800, y0, 930, y1);
    let n = 0; for (const i of idx) if (isNBC(im, i)) n++;
    const s = 1 - n / idx.length;
    shares.push(+s.toFixed(3));
    if (s < 0.40) bad++;
  }
  return { P7: bad, shares };
}
function R4(im) { const idx = rectIdx(im, 1039, 557, 1279, 719); let n = 0; for (const i of idx) if (isNBC(im, i)) n++; return 100 * n / idx.length; }
function frameNBC(im) { let n = 0; for (let i = 0; i < im.w * im.h; i++) if (isNBC(im, i)) n++; return 100 * n / (im.w * im.h); }
function diffPx(a, b) {
  let n = 0, max = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const o = i * a.ch, p = i * b.ch;
    const d = Math.abs(a.data[o] - b.data[p]) + Math.abs(a.data[o + 1] - b.data[p + 1]) + Math.abs(a.data[o + 2] - b.data[p + 2]);
    if (d >= 4) n++; if (d > max) max = d;
  }
  return { px: n, maxSumAbs: max };
}

function scoreOne(im) {
  const p = P45(im), s = P7(im);
  return {
    P1: +P1(im).toFixed(2), P2: P2(im), P3: +P3(im).toFixed(2), P4: p.P4, P5: +p.P5.toFixed(2),
    P7: s.P7, _p7shares: s.shares,
    R1_coneAir_medL: +rectMedL(im, 700, 300, 850, 500).toFixed(2),
    R2_guardMassRect_medL: +rectMedL(im, 790, 100, 980, 330).toFixed(2),
    R3_frameNBC_pct: +frameNBC(im).toFixed(2),
    R4_cornerNBC_pct: +R4(im).toFixed(2),
    R6_retired_figureRectMedL: +rectMedL(im, 820, 244, 900, 625).toFixed(2),
    G_doorwayPool_medL: +rectMedL(im, 220, 360, 640, 560).toFixed(2),
  };
}

/* ---------------------------------------------------------------- calibration --- */
const ANCHORS = { P1: 15.9, P2: 306, P3: 89.6, P4: 692, P5: 29.99, P7: 33,
  R1_coneAir_medL: 27.59, R2_guardMassRect_medL: 18.64, R3_frameNBC_pct: 38.49,
  R4_cornerNBC_pct: 91.87, R6_retired_figureRectMedL: 23.18, G_doorwayPool_medL: 113.46 };
const TOL = { P1: 0.15, P2: 1, P3: 0.15, P4: 3, P5: 0.05, P7: 0,
  R1_coneAir_medL: 0.05, R2_guardMassRect_medL: 0.05, R3_frameNBC_pct: 0.05,
  R4_cornerNBC_pct: 0.05, R6_retired_figureRectMedL: 0.05, G_doorwayPool_medL: 0.05 };

console.log('=== SELF-CALIBRATION against committed sbs3/guard.png ===');
const cal = scoreOne(load(SBS3));
let calOK = true;
for (const k of Object.keys(ANCHORS)) {
  const ok = Math.abs(cal[k] - ANCHORS[k]) <= TOL[k];
  if (!ok) calOK = false;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${k.padEnd(26)} got ${String(cal[k]).padStart(8)}  anchor ${ANCHORS[k]}`);
}
if (!calOK) { console.log('\nSCORING VOID: this scorer does not reproduce the seal\'s anchors (§122.1). Fix the scorer.'); process.exit(2); }
console.log('  -> calibrated.\n');

/* ------------------------------------------------------------------- the arms ----- */
const ORDER = ['preroll', 'base', 'cand', 'restore', 'KBmid', 'KBover'];
const files = Object.fromEntries(ORDER.map((a) => [a, path.join(DIR, `guard.${a}.png`)]));
const present = ORDER.filter((a) => existsSync(files[a]));
console.log(`=== ARMS PRESENT: ${present.join(', ') || '(none)'} ===`);
if (!present.length) { console.log('nothing to score yet'); process.exit(0); }

const ims = Object.fromEntries(present.map((a) => [a, load(files[a])]));
const S = Object.fromEntries(present.map((a) => [a, scoreOne(ims[a])]));
const out = { prereg: 'PREREG-staging2.md', at: new Date().toISOString(), calibration: cal, arms: S, verdicts: {} };

const KEYS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P7', 'R1_coneAir_medL', 'R2_guardMassRect_medL', 'R3_frameNBC_pct', 'R4_cornerNBC_pct', 'R6_retired_figureRectMedL', 'G_doorwayPool_medL'];
console.log('quantity                    ' + present.map((a) => a.padStart(9)).join('') + '     sbs3');
for (const k of KEYS) console.log('  ' + k.padEnd(26) + present.map((a) => String(S[a][k]).padStart(9)).join('') + String(cal[k]).padStart(9));

/* ----- P-F9 preroll present; P-F8 one boot; P-F7 armTook; P-F6 framing ------------- */
console.log('\n=== PROTOCOL FALSIFIERS ===');
let rb = null;
try { rb = JSON.parse(readFileSync(path.join(DIR, 'readback.json'), 'utf8')); } catch (e) { console.log(`  readback.json unreadable: ${e.message}`); }
const byArm = rb ? Object.fromEntries((rb.arms || []).map((a) => [a.arm, a])) : {};
console.log(`  P-F9 preroll frame present: ${existsSync(files.preroll) ? 'YES' : 'NO -> VOID'}`);
out.verdicts.pf9 = existsSync(files.preroll) ? 'ok' : 'VOID';
if (rb) {
  const ids = new Set((rb.arms || []).filter((a) => present.includes(a.arm)).map((a) => a.bootId));
  const oneBoot = ids.size === 1;
  console.log(`  P-F8 one bootId across scored arms: ${oneBoot ? `YES (${[...ids][0]})` : `NO (${[...ids].join(', ')}) -> VOID`}; srcTree same=${rb.sameTree}`);
  out.verdicts.pf8 = (oneBoot && rb.sameTree) ? 'ok' : 'VOID';
  const bad = (rb.arms || []).filter((a) => present.includes(a.arm) && !a.armTook).map((a) => a.arm);
  console.log(`  P-F7 armTook on every scored arm: ${bad.length ? `NO -> ${bad.join(', ')} VOID` : 'YES'}`);
  out.verdicts.pf7 = bad.length ? bad : 'ok';
  const c = byArm.cand;
  if (c) {
    const ok = Math.abs(c.feetPx[1] - 625) <= 12 && Math.abs(c.headPx[1] - 244) <= 12;
    console.log(`  P-F6 cand figure feet ${c.feetPx[1]} head ${c.headPx[1]} vs 625/244 ±12: ${ok ? 'ok' : 'FIRED -> verdict WITHHELD'}`);
    out.verdicts.pf6 = ok ? 'ok' : 'FIRED';
  }
  console.log(`  R5 wall-times (§185's question): ${(rb.arms || []).map((a) => `${a.arm} ${a.wallSecs}s`).join('  ')}`);
  out.wallTimes = Object.fromEntries((rb.arms || []).map((a) => [a.arm, a.wallSecs]));
  out.readbackSummary = (rb.arms || []).map((a) => ({ arm: a.arm, bootId: a.bootId, armTook: a.armTook, camPos: a.camPos, guardPos: a.guardPos, feetPx: a.feetPx, headPx: a.headPx }));
}

console.log('\n=== BASE GATES (P-F3 — VOID, not FAIL) ===');
let voided = false;
if (S.base) {
  for (const [k, lo, hi] of [['R2_guardMassRect_medL', 17.5, 19.8], ['G_doorwayPool_medL', 108, 119]]) {
    const v = S.base[k], ok = v >= lo && v <= hi; if (!ok) voided = true;
    console.log(`  ${ok ? 'ok  ' : 'OUT '} base ${k} = ${v}  band [${lo}, ${hi}]`);
  }
} else console.log('  base arm absent');
out.verdicts.baseGate = voided ? 'VOID' : 'ok';

console.log('\n=== P-F4 restore vs base, frame-wide, ΣRGB ≥ 4 ===');
if (S.base && S.restore) {
  const d = diffPx(ims.base, ims.restore);
  console.log(`  ${d.px === 0 ? 'PASS' : 'FAIL -> VOID'}  differing px ${d.px}  maxΣ|Δ| ${d.maxSumAbs}   band [0, 0]`);
  out.verdicts.pf4 = d;
} else { console.log('  base or restore absent'); out.verdicts.pf4 = 'absent'; }

console.log('\n=== GATED BANDS on the CANDIDATE (P-F1 — out ⇒ not shipped) ===');
const BANDS = { P1: [70, 100], P2: [560, 720], P3: [0, 70], P4: [2500, 22000], P5: [26, 55], P7: [0, 4] };
const fail = [];
if (S.cand) {
  for (const [k, [lo, hi]] of Object.entries(BANDS)) {
    const v = S.cand[k], ok = v >= lo && v <= hi;
    if (!ok) fail.push(`${k}=${v} not in [${lo},${hi}]`);
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${k.padEnd(3)} cand ${String(v).padStart(9)}  band [${lo}, ${hi}]   (base ${S.base ? S.base[k] : '?'})`);
  }
} else console.log('  cand arm absent');
out.verdicts.gated = fail.length ? fail : 'all in band';

console.log('\n=== P-F2 CALIBRATION: KBmid must land strictly between base and cand ===');
if (S.base && S.cand && S.KBmid) {
  const b = S.base.P1, m = S.KBmid.P1, c = S.cand.P1;
  const p1ok = m > b + 10 && m < c - 10;
  const p2ok = S.base.P2 <= S.KBmid.P2 && S.KBmid.P2 < S.cand.P2;
  console.log(`  P1  base ${b}  KBmid ${m}  cand ${c}   -> ${p1ok ? 'ok (strictly inside by >=10 at each end)' : 'FAILS -> UNSCOREABLE'}`);
  console.log(`  P2  base ${S.base.P2}  KBmid ${S.KBmid.P2}  cand ${S.cand.P2}   -> ${p2ok ? 'ok' : 'FAILS -> UNSCOREABLE'}`);
  console.log(`  (a metric that grades a graded stimulus has a scale — §13; staging1's binary KB never showed one)`);
  out.verdicts.pf2 = (p1ok && p2ok) ? 'ok' : 'UNSCOREABLE';
} else { console.log('  KBmid / base / cand not all present'); out.verdicts.pf2 = 'absent'; }

console.log('\n=== REPORTED (gates nothing) ===');
if (S.KBover) console.log(`  R4 corner-NBC across the range: base ${S.base?.R4_cornerNBC_pct}  cand ${S.cand?.R4_cornerNBC_pct}  KBmid ${S.KBmid?.R4_cornerNBC_pct}  KBover ${S.KBover.R4_cornerNBC_pct}`);
if (S.cand) console.log(`  P7 band shares (cand), 39 bands head->feet: ${S.cand._p7shares.join(' ')}`);
if (S.base) console.log(`  P7 band shares (base), 39 bands head->feet: ${S.base._p7shares.join(' ')}`);

writeFileSync(path.join(DIR, 'score.json'), JSON.stringify(out, null, 1));
console.log(`\nwrote ${path.join(DIR, 'score.json')}`);
