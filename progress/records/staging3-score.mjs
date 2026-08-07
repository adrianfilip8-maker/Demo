/**
 * staging3-score — scores PREREG-staging3.md's registered quantities on the frames staging3.mjs
 * landed. Bands are duplicated VERBATIM from the seal §4/§5; a mismatch between this file and the
 * seal voids the scoring, not the seal.
 *
 * Differences from staging2-score.mjs, each one seal-driven:
 *   1. base gates anchored on the committed `guard.deriveA.png` (dt-0, current tree) with the
 *      original bands' relative widths carried (seal §4.1);
 *   2. P-F4's band is [0, 2F] where F is the measured single-restage floor from the derivation
 *      pair (seal §4.2) — not an asserted [0,0];
 *   3. P-F2 calibrates KBmid on P2, which r12 showed grades, instead of P1, which saturates
 *      (seal §4.3); P1's ordering is reported, gateless;
 *   4. the discarded preroll is `preroll2` (see staging3.mjs header) and P-F9 additionally
 *      requires its bootId to match the scored arms';
 *   5. TWO self-calibrations, both exit 2 on failure: committed sbs3/guard.png (the original
 *      arithmetic anchors, immutable) AND committed guard.deriveA.png (the seal's new anchors) —
 *      two committed frames from two eras, one arithmetic (§122.1).
 *
 * Conventions (§122.1, restated): L = 0.2126R+0.7152G+0.0722B on 0..255 bytes; NBC = L<72 AND
 * (B-R)>+12; warm = (B-R)<2; differing px = ΣRGB>=4; figure rect (820,244,900,625); figure column
 * x∈[800,930]; P7's 39 bands b∈[0,38] cover rows [244+floor(b*381/39), 244+floor((b+1)*381/39)).
 *
 *   usage: node progress/records/staging3-score.mjs
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = '/home/user/Demo/progress/records/staging3';
const SBS3 = '/home/user/Demo/progress/records/sbs3/guard.png';
const DERIVEA = path.join(DIR, 'guard.deriveA.png');

/* ===== SEAL CONSTANTS (PREREG-staging3 §4 — filled from staging3-derive-analyze at seal time,
   committed BEFORE the scored capture boots) ===== */
const GATE_GUARDMASS = null;   // [lo, hi] — deriveA anchor × carried widths
const GATE_POOL = null;        // [lo, hi]
const PF4_CEIL = null;         // 2 × F (measured single-restage floor, px)
const DERIVE_ANCHORS = null;   // { gm, pool, P1, P2, P3, P7 } — deriveA, quoted in the seal
/* ================================================================================== */

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

if (!GATE_GUARDMASS || !GATE_POOL || PF4_CEIL === null || !DERIVE_ANCHORS) {
  console.log('SEAL CONSTANTS UNFILLED — this scorer must not run before PREREG-staging3 §4 is final.');
  process.exit(2);
}

/* ------------------------------------------------- calibration 1: sbs3 (arithmetic) --- */
const ANCHORS = { P1: 15.9, P2: 306, P3: 89.6, P4: 692, P5: 29.99, P7: 33,
  R1_coneAir_medL: 27.59, R2_guardMassRect_medL: 18.64, R3_frameNBC_pct: 38.49,
  R4_cornerNBC_pct: 91.87, R6_retired_figureRectMedL: 23.18, G_doorwayPool_medL: 113.46 };
const TOL = { P1: 0.15, P2: 1, P3: 0.15, P4: 3, P5: 0.05, P7: 0,
  R1_coneAir_medL: 0.05, R2_guardMassRect_medL: 0.05, R3_frameNBC_pct: 0.05,
  R4_cornerNBC_pct: 0.05, R6_retired_figureRectMedL: 0.05, G_doorwayPool_medL: 0.05 };

console.log('=== SELF-CALIBRATION 1: committed sbs3/guard.png (original arithmetic anchors) ===');
const cal = scoreOne(load(SBS3));
let calOK = true;
for (const k of Object.keys(ANCHORS)) {
  const ok = Math.abs(cal[k] - ANCHORS[k]) <= TOL[k];
  if (!ok) calOK = false;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${k.padEnd(26)} got ${String(cal[k]).padStart(8)}  anchor ${ANCHORS[k]}`);
}
if (!calOK) { console.log('\nSCORING VOID: does not reproduce the sbs3 anchors (§122.1). Fix the scorer.'); process.exit(2); }

console.log('\n=== SELF-CALIBRATION 2: committed guard.deriveA.png (the seal\'s new anchors) ===');
if (!existsSync(DERIVEA)) { console.log('  deriveA absent — cannot calibrate. VOID.'); process.exit(2); }
const dA = load(DERIVEA);
const dGot = { gm: +rectMedL(dA, 790, 100, 980, 330).toFixed(2), pool: +rectMedL(dA, 220, 360, 640, 560).toFixed(2),
  P1: +P1(dA).toFixed(2), P2: P2(dA), P3: +P3(dA).toFixed(2), P7: P7(dA).P7 };
let cal2OK = true;
for (const k of Object.keys(DERIVE_ANCHORS)) {
  const tol = (k === 'P2' || k === 'P7') ? 0 : 0.05;
  const ok = Math.abs(dGot[k] - DERIVE_ANCHORS[k]) <= tol;
  if (!ok) cal2OK = false;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} deriveA ${k.padEnd(6)} got ${String(dGot[k]).padStart(8)}  seal ${DERIVE_ANCHORS[k]}`);
}
if (!cal2OK) { console.log('\nSCORING VOID: does not reproduce the seal\'s deriveA anchors (§122.1). Fix the scorer.'); process.exit(2); }
console.log('  -> calibrated twice.\n');

/* ------------------------------------------------------------------- the arms ----- */
const ORDER = ['preroll2', 'base', 'cand', 'restore', 'KBmid', 'KBover'];
const files = Object.fromEntries(ORDER.map((a) => [a, path.join(DIR, `guard.${a}.png`)]));
const present = ORDER.filter((a) => existsSync(files[a]));
console.log(`=== ARMS PRESENT: ${present.join(', ') || '(none)'} ===`);
if (!present.length) { console.log('nothing to score yet'); process.exit(0); }

const ims = Object.fromEntries(present.map((a) => [a, load(files[a])]));
const S = Object.fromEntries(present.map((a) => [a, scoreOne(ims[a])]));
const out = { prereg: 'PREREG-staging3.md', at: new Date().toISOString(), calibration: cal, deriveCalibration: dGot, arms: S, verdicts: {} };

const KEYS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P7', 'R1_coneAir_medL', 'R2_guardMassRect_medL', 'R3_frameNBC_pct', 'R4_cornerNBC_pct', 'R6_retired_figureRectMedL', 'G_doorwayPool_medL'];
console.log('quantity                    ' + present.map((a) => a.padStart(9)).join('') + '  deriveA');
for (const k of KEYS) {
  const dv = k === 'R2_guardMassRect_medL' ? dGot.gm : k === 'G_doorwayPool_medL' ? dGot.pool : (dGot[k] ?? '');
  console.log('  ' + k.padEnd(26) + present.map((a) => String(S[a][k]).padStart(9)).join('') + String(dv).padStart(9));
}

/* ----- P-F9 preroll2 same-boot; P-F8 one boot; P-F7 armTook; P-F6 framing ---------- */
console.log('\n=== PROTOCOL FALSIFIERS ===');
let rb = null;
try { rb = JSON.parse(readFileSync(path.join(DIR, 'readback.json'), 'utf8')); } catch (e) { console.log(`  readback.json unreadable: ${e.message}`); }
const byArm = rb ? Object.fromEntries((rb.arms || []).map((a) => [a.arm, a])) : {};
{
  const prPresent = existsSync(files.preroll2);
  const scoredIds = rb ? new Set((rb.arms || []).filter((a) => !a.discard && present.includes(a.arm)).map((a) => a.bootId)) : new Set();
  const prSameBoot = !!(byArm.preroll2 && scoredIds.size && scoredIds.has(byArm.preroll2.bootId));
  const ok = prPresent && prSameBoot;
  console.log(`  P-F9 preroll2 present: ${prPresent ? 'YES' : 'NO'}; same bootId as scored arms: ${prSameBoot ? 'YES' : 'NO'}  -> ${ok ? 'ok' : 'VOID'}`);
  out.verdicts.pf9 = ok ? 'ok' : 'VOID';
}
if (rb) {
  const ids = new Set((rb.arms || []).filter((a) => present.includes(a.arm)).map((a) => a.bootId));
  const oneBoot = ids.size === 1;
  const inLock = rb.srcTreeAtLock && rb.srcTreeAtLock === rb.srcTreeAtRelease;
  console.log(`  P-F8 one bootId: ${oneBoot ? `YES (${[...ids][0]})` : `NO (${[...ids].join(', ')}) -> VOID`}; in-lock tree pair same=${inLock} (outside-lock same=${rb.sameTreeOutsideLock ?? rb.srcTreeBefore === rb.srcTreeAfter}, reported)`);
  out.verdicts.pf8 = (oneBoot && inLock) ? 'ok' : 'VOID';
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

console.log('\n=== BASE GATES (P-F3 — VOID, not FAIL; anchors deriveA, widths carried §4.1) ===');
let voided = false;
if (S.base) {
  for (const [k, [lo, hi]] of [['R2_guardMassRect_medL', GATE_GUARDMASS], ['G_doorwayPool_medL', GATE_POOL]]) {
    const v = S.base[k], ok = v >= lo && v <= hi; if (!ok) voided = true;
    console.log(`  ${ok ? 'ok  ' : 'OUT '} base ${k} = ${v}  band [${lo}, ${hi}]`);
  }
  /* §4.1 diagnosis duty: if a gate fired, print the figure-column agreement so the RESULT can
     say whether this is wrong-tree or the unmeasured cross-boot median floor. */
  if (voided) {
    console.log('  P-F3 FIRED — §4.1 diagnosis set (base arm vs deriveA):');
    for (const k of ['P1', 'P2', 'P3', 'P7']) console.log(`    ${k}: base ${S.base[k]}  deriveA ${dGot[k]}`);
  }
} else console.log('  base arm absent');
out.verdicts.baseGate = voided ? 'VOID' : 'ok';

console.log(`\n=== P-F4 restore vs base, frame-wide, ΣRGB ≥ 4 — band [0, ${PF4_CEIL}] (= 2F, §4.2) ===`);
if (S.base && S.restore) {
  const d = diffPx(ims.base, ims.restore);
  const ok = d.px <= PF4_CEIL;
  console.log(`  ${ok ? 'PASS' : 'FAIL -> VOID'}  differing px ${d.px}  maxΣ|Δ| ${d.maxSumAbs}   band [0, ${PF4_CEIL}]`);
  out.verdicts.pf4 = { ...d, band: [0, PF4_CEIL], ok };
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

console.log('\n=== P-F2 CALIBRATION on P2 (§4.3 — r12 showed P1 saturates, P2 grades) ===');
if (S.base && S.cand && S.KBmid) {
  const b = S.base.P2, m = S.KBmid.P2, c = S.cand.P2, o = S.KBover ? S.KBover.P2 : null;
  const chain = b < m && m < c && (o === null || c <= o);
  const inside = m >= b + 10 && m <= c - 10;
  console.log(`  P2  base ${b}  KBmid ${m}  cand ${c}  KBover ${o ?? '(absent)'}   chain base<KBmid<cand<=KBover: ${chain ? 'ok' : 'FAILS'}`);
  console.log(`  KBmid strictly inside (base, cand) by >=10 at each end: ${inside ? 'ok' : 'FAILS'}`);
  const ok = chain && inside;
  console.log(`  -> ${ok ? 'ok — the metric grades a graded stimulus (§13)' : 'FAILS -> UNSCOREABLE'}`);
  console.log(`  P1 ordering (REPORTED, gates nothing — saturation documented): base ${S.base.P1}  KBmid ${S.KBmid.P1}  cand ${S.cand.P1}`);
  out.verdicts.pf2 = ok ? 'ok' : 'UNSCOREABLE';
} else { console.log('  KBmid / base / cand not all present'); out.verdicts.pf2 = 'absent'; }

console.log('\n=== REPORTED (gates nothing) ===');
if (S.KBover) console.log(`  R4 corner-NBC across the range: base ${S.base?.R4_cornerNBC_pct}  cand ${S.cand?.R4_cornerNBC_pct}  KBmid ${S.KBmid?.R4_cornerNBC_pct}  KBover ${S.KBover.R4_cornerNBC_pct}`);
if (S.cand) console.log(`  P7 band shares (cand): ${S.cand._p7shares.join(' ')}`);
if (S.base) console.log(`  P7 band shares (base): ${S.base._p7shares.join(' ')}`);

writeFileSync(path.join(DIR, 'score.json'), JSON.stringify(out, null, 1));
console.log(`\nwrote ${path.join(DIR, 'score.json')}`);
