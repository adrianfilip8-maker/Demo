/**
 * staging1-score — scores PREREG-staging1.md's registered quantities on the frames
 * `staging1.mjs` landed. Bands are duplicated VERBATIM from the seal; a mismatch between this
 * file and §2 of the seal voids the scoring, not the seal.
 *
 * Conventions (§122.1, restated with every count):
 *   L   = 0.2126R + 0.7152G + 0.0722B on 0..255 sRGB bytes (Rec.709)
 *   NBC = "near-black cool" = L < 72 AND (B - R) > +12     — the wedge's own measured signature
 *   warm = (B - R) < 2                                      — guard body / armour / spear
 *   differing px = ΣRGB >= 4
 *
 * SELF-CALIBRATION, and why it runs first: the seal's anchors were measured by a Python scorer
 * that reproduces nine of CRITIC-sbs3's ten published guard/combat numbers exactly. This file is
 * a second implementation in a second language, so before it is allowed to score anything it
 * re-derives every anchor from the COMMITTED `sbs3/guard.png` and must hit them. Two independent
 * scorings of the same PNGs disagreeing 1.86x on absolute counts is a recorded hazard here
 * (§122.1); this is the check that would have caught it.
 *
 *   usage: node progress/records/staging1-score.mjs
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = '/home/user/Demo/progress/records/staging1';
const SBS3 = '/home/user/Demo/progress/records/sbs3/guard.png';

/* ------------------------------------------------------------------ primitives --- */
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function load(f) {
  const im = readPNG(f);
  const n = im.w * im.h;
  const L = new Float32Array(n), BR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * im.ch, r = im.data[o], g = im.data[o + 1], b = im.data[o + 2];
    L[i] = lum(r, g, b); BR[i] = b - r;
  }
  return { w: im.w, h: im.h, ch: im.ch, data: im.data, L, BR };
}
const median = (a) => { const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const isNBC = (im, i) => im.L[i] < 72 && im.BR[i] > 12;

function rectIdx(im, x0, y0, x1, y1) {
  const out = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push(y * im.w + x);
  return out;
}

/* ------------------------------------------------------- registered quantities --- */
// P1 — figure-column NOT-NBC share, rect (820,244,900,625)
function P1(im) {
  const idx = rectIdx(im, 820, 244, 900, 625);
  let nbc = 0; for (const i of idx) if (isNBC(im, i)) nbc++;
  return 100 * (1 - nbc / idx.length);
}
// P2 — topmost py of the contiguous block of rows in x∈[800,930] that are >=60% NBC and
//      reaches py 719. 720 means "no such mass".
function P2(im) {
  const x0 = 800, x1 = 930, w = x1 - x0;
  const dense = new Uint8Array(im.h);
  for (let y = 0; y < im.h; y++) {
    let n = 0; for (let x = x0; x < x1; x++) if (isNBC(im, y * im.w + x)) n++;
    dense[y] = n / w >= 0.60 ? 1 : 0;
  }
  let y = im.h - 1;
  if (!dense[y]) return 720;
  while (y > 0 && dense[y]) y--;
  return y + 1;
}
// P3 — NBC share of the lower-right quadrant (640,360,1280,720)
function P3(im) {
  const idx = rectIdx(im, 640, 360, 1280, 720);
  let n = 0; for (const i of idx) if (isNBC(im, i)) n++;
  return 100 * n / idx.length;
}
// P4/P5/P6 — warm-pixel count and medL, and rect medL, on (820,244,900,625)
function P456(im) {
  const idx = rectIdx(im, 820, 244, 900, 625);
  const all = [], warm = [];
  for (const i of idx) { all.push(im.L[i]); if (im.BR[i] < 2) warm.push(im.L[i]); }
  return { P4: warm.length, P5: warm.length ? median(warm) : -1, P6: median(all) };
}
// reported
const rectMedL = (im, x0, y0, x1, y1) => median(rectIdx(im, x0, y0, x1, y1).map((i) => im.L[i]));
function frameNBC(im) { let n = 0; for (let i = 0; i < im.w * im.h; i++) if (isNBC(im, i)) n++; return 100 * n / (im.w * im.h); }

// P-F4 — differing px at ΣRGB >= 4
function diffPx(a, b) {
  let n = 0, max = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const o = i * a.ch, p = i * b.ch;
    const d = Math.abs(a.data[o] - b.data[p]) + Math.abs(a.data[o + 1] - b.data[p + 1]) + Math.abs(a.data[o + 2] - b.data[p + 2]);
    if (d >= 4) n++;
    if (d > max) max = d;
  }
  return { px: n, maxSumAbs: max };
}

// P-F5 — connected NBC components >= 5% of frame whose bbox touches a frame edge
function bigNBCComponents(im, minShare = 0.05) {
  const n = im.w * im.h, lab = new Int32Array(n).fill(-1), out = [];
  const stack = new Int32Array(n);
  let cid = 0;
  for (let s = 0; s < n; s++) {
    if (lab[s] >= 0 || !isNBC(im, s)) continue;
    let sp = 0; stack[sp++] = s; lab[s] = cid;
    let cnt = 0, x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
    while (sp) {
      const i = stack[--sp]; cnt++;
      const x = i % im.w, y = (i / im.w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && lab[i - 1] < 0 && isNBC(im, i - 1)) { lab[i - 1] = cid; stack[sp++] = i - 1; }
      if (x < im.w - 1 && lab[i + 1] < 0 && isNBC(im, i + 1)) { lab[i + 1] = cid; stack[sp++] = i + 1; }
      if (y > 0 && lab[i - im.w] < 0 && isNBC(im, i - im.w)) { lab[i - im.w] = cid; stack[sp++] = i - im.w; }
      if (y < im.h - 1 && lab[i + im.w] < 0 && isNBC(im, i + im.w)) { lab[i + im.w] = cid; stack[sp++] = i + im.w; }
    }
    if (cnt / n >= minShare) {
      out.push({ px: cnt, share: +(100 * cnt / n).toFixed(2), bbox: [x0, y0, x1, y1],
        touchesEdge: x0 === 0 || y0 === 0 || x1 === im.w - 1 || y1 === im.h - 1 });
    }
    cid++;
  }
  return out.sort((a, b) => b.px - a.px);
}

function scoreOne(im) {
  const p = P456(im);
  return {
    P1: +P1(im).toFixed(2), P2: P2(im), P3: +P3(im).toFixed(2),
    P4: p.P4, P5: +p.P5.toFixed(2), P6: +p.P6.toFixed(2),
    R1_coneAir_medL: +rectMedL(im, 700, 300, 850, 500).toFixed(2),
    R2_guardMassRect_medL: +rectMedL(im, 790, 100, 980, 330).toFixed(2),
    R3_frameNBC_pct: +frameNBC(im).toFixed(2),
    G_doorwayPool_medL: +rectMedL(im, 220, 360, 640, 560).toFixed(2),
  };
}

/* ------------------------------------------------------------------ calibration --- */
const ANCHORS = { P1: 15.9, P2: 306, P3: 89.6, P4: 692, P5: 29.99, P6: 23.18,
  R1_coneAir_medL: 27.59, R2_guardMassRect_medL: 18.64, R3_frameNBC_pct: 38.49, G_doorwayPool_medL: 113.46 };
const TOL = { P1: 0.15, P2: 1, P3: 0.15, P4: 3, P5: 0.05, P6: 0.05, R1_coneAir_medL: 0.05,
  R2_guardMassRect_medL: 0.05, R3_frameNBC_pct: 0.05, G_doorwayPool_medL: 0.05 };

console.log('=== SELF-CALIBRATION against the committed sbs3/guard.png (the seal\'s anchors) ===');
const cal = scoreOne(load(SBS3));
let calOK = true;
for (const k of Object.keys(ANCHORS)) {
  const ok = Math.abs(cal[k] - ANCHORS[k]) <= TOL[k];
  if (!ok) calOK = false;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${k.padEnd(24)} got ${String(cal[k]).padStart(8)}  seal anchor ${ANCHORS[k]}`);
}
if (!calOK) {
  console.log('\nSCORING VOID: this implementation does not reproduce the seal\'s anchors on the frame');
  console.log('they were measured from. Two scorers disagreeing is the §122.1 hazard; fix the scorer,');
  console.log('do not reinterpret the bands.');
  process.exit(2);
}
console.log('  -> calibrated: JS scorer reproduces every Python-measured anchor.\n');

/* ------------------------------------------------------------------- the arms ----- */
const ARMS = ['base', 'cand', 'kbover', 'restore'];
const files = Object.fromEntries(ARMS.map((a) => [a, path.join(DIR, `guard.${a}.png`)]));
const present = ARMS.filter((a) => existsSync(files[a]));
console.log(`=== ARMS PRESENT: ${present.join(', ') || '(none)'} ===`);
if (!present.length) { console.log('nothing to score yet'); process.exit(0); }

const ims = Object.fromEntries(present.map((a) => [a, load(files[a])]));
const S = Object.fromEntries(present.map((a) => [a, scoreOne(ims[a])]));

const KEYS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'R1_coneAir_medL', 'R2_guardMassRect_medL', 'R3_frameNBC_pct', 'G_doorwayPool_medL'];
console.log('\nquantity                    ' + present.map((a) => a.padStart(10)).join('') + '     sbs3');
for (const k of KEYS) {
  console.log('  ' + k.padEnd(26) + present.map((a) => String(S[a][k]).padStart(10)).join('') + String(cal[k]).padStart(9));
}

/* ------------------------------------------------------------------- verdicts ----- */
const BANDS = { P1: [70, 100], P2: [560, 720], P3: [0, 70], P4: [2500, 14000], P5: [26, 55], P6: [26, 70] };
const BASEGATE = { R2_guardMassRect_medL: [17.5, 19.8], G_doorwayPool_medL: [108, 119] };
const out = { prereg: 'PREREG-staging1.md', at: new Date().toISOString(), calibration: cal, arms: S, verdicts: {} };

console.log('\n=== BASE GATES (P-F3 — VOID, not FAIL, if out) ===');
let voided = false;
if (S.base) {
  for (const [k, [lo, hi]] of Object.entries(BASEGATE)) {
    const v = S.base[k], ok = v >= lo && v <= hi;
    if (!ok) voided = true;
    console.log(`  ${ok ? 'ok  ' : 'OUT '} base ${k} = ${v}  band [${lo}, ${hi}]`);
  }
} else console.log('  base arm absent — cannot gate');
out.verdicts.baseGate = voided ? 'VOID' : 'ok';

console.log('\n=== GATED BANDS on the CANDIDATE arm (P-F1 — out ⇒ REVERT) ===');
let fail = [];
if (S.cand) {
  for (const [k, [lo, hi]] of Object.entries(BANDS)) {
    const v = S.cand[k], ok = v >= lo && v <= hi;
    if (!ok) fail.push(`${k}=${v} ∉ [${lo},${hi}]`);
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${k.padEnd(4)} cand ${String(v).padStart(9)}  band [${lo}, ${hi}]   (base ${S.base ? S.base[k] : '?'})`);
  }
} else console.log('  cand arm absent');
out.verdicts.gated = fail.length ? fail : 'all in band';

console.log('\n=== KNOWN-BAD (P-F2 — must read as its own failure) ===');
let kbOK = null;
if (S.kbover) {
  kbOK = S.kbover.P3 < 15;
  console.log(`  ${kbOK ? 'reads' : 'DOES NOT READ'} — KBover P3 = ${S.kbover.P3} (must be < 15: the dark foreground framing element is gone)`);
  console.log(`  metric span across arms: P1 ${S.base?.P1} (base) → ${S.cand?.P1} (cand) → ${S.kbover.P1} (KBover)`);
} else console.log('  kbover arm absent');
out.verdicts.knownBad = kbOK === null ? 'absent' : (kbOK ? 'reads' : 'UNSCOREABLE');

console.log('\n=== P-F4 restore vs base, frame-wide, ΣRGB ≥ 4 ===');
if (S.base && S.restore) {
  const d = diffPx(ims.base, ims.restore);
  console.log(`  ${d.px === 0 ? 'PASS' : 'FAIL'}  differing px ${d.px}  maxΣ|Δ| ${d.maxSumAbs}   band [0, 0]`);
  out.verdicts.pf4 = d;
} else { console.log('  base or restore absent'); out.verdicts.pf4 = 'absent'; }

console.log('\n=== P-F5 replacement-occluder falsifier (connected NBC ≥ 5% of frame, bbox touching an edge) ===');
for (const a of present) {
  const comps = bigNBCComponents(ims[a]);
  out.verdicts[`pf5_${a}`] = comps;
  if (!comps.length) { console.log(`  ${a}: none`); continue; }
  for (const c of comps) console.log(`  ${a}: ${c.px} px (${c.share}% of frame) bbox [${c.bbox}] edge=${c.touchesEdge}`);
}
console.log('  (cand: the predicted residual plinth corner is bbox ≈ (1039,557)-(1279,719) ≈ 3.4% of frame,');
console.log('   i.e. BELOW the 5% threshold — any ≥5% edge-touching mass on cand is a replacement occluder ⇒ REVERT)');

console.log('\n=== P-F6 premise falsifier (from readback.json) ===');
try {
  const rb = JSON.parse(readFileSync(path.join(DIR, 'readback.json'), 'utf8'));
  const byArm = Object.fromEntries((rb.arms || []).map((a) => [a.arm, a]));
  out.verdicts.armTook = Object.fromEntries((rb.arms || []).map((a) => [a.arm, a.armTook]));
  for (const a of present) {
    const r = byArm[a];
    if (!r) { console.log(`  ${a}: no readback`); continue; }
    const fy = r.feetPx?.[1], hy = r.headPx?.[1];
    const ok = fy !== undefined && Math.abs(fy - 625) <= 12 && Math.abs(hy - 244) <= 12;
    console.log(`  ${a.padEnd(8)} armTook=${r.armTook}  cam ${JSON.stringify(r.camPos)}  stand ${JSON.stringify(r.guardPos)}  feet py ${fy} head py ${hy}  ${a === 'cand' ? (ok ? '(P-F6 ok: within ±12 px of 625/244)' : '(P-F6 FIRED: verdict WITHHELD, re-anchor rects)') : ''}`);
    if (a === 'cand') out.verdicts.pf6 = ok ? 'ok' : 'FIRED';
  }
  out.readbackSummary = (rb.arms || []).map((a) => ({ arm: a.arm, armTook: a.armTook, camPos: a.camPos, guardPos: a.guardPos, feetPx: a.feetPx, headPx: a.headPx, guardIndex: a.guardIndex, guardType: a.guardType }));
  out.sameTree = rb.sameTree; out.srcTree = rb.srcTreeBefore;
} catch (e) { console.log(`  readback.json unreadable: ${e.message}`); }

writeFileSync(path.join(DIR, 'score.json'), JSON.stringify(out, null, 1));
console.log(`\nwrote ${path.join(DIR, 'score.json')}`);
