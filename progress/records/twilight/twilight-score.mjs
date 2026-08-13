/**
 * twilight-score — sealed scorer for PREREG-twilight.md. Staged before its frames exist.
 * Registered order: V0/V1 provenance, V2 readbacks, V3 restore, B4 golden, B5 scope-at-0.80,
 * B1 dispersion, B2 lit/shade separation, B3 costume, B6 crops for the looking.
 * This file evaluates; the RESULT decides, after the crops have been looked at.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';

const DIR = '/home/user/Demo/shots/twilight1';
const CROPS = `${DIR}/crops`;
mkdirSync(CROPS, { recursive: true });
const J = JSON.parse(readFileSync(`${DIR}/run.json`, 'utf8'));
if (J.aborted) { console.log(`VOID (V0 abort): ${J.aborted}`); process.exit(2); }

const ROI = {
  'perch': [900, 60, 1260, 330],   // PREREG-redflood verbatim (x0,y0,x1,y1)
  'arm':   [900, 40, 1260, 300],
};
const BINDING_BLOCKS = ['perch-80', 'perch-TWI1', 'arm-80', 'arm-TWI1',
  'hero', 'temple', 'courtyard', 'interior'];
const REPORT_BLOCKS = ['perch-TWI2', 'perch-TWI3', 'arm-TWI2', 'dunes'];
const ALL_BLOCKS = [...BINDING_BLOCKS, ...REPORT_BLOCKS];

const v = { voids: [], bars: {}, notes: [], histograms: {} };
const load = (n) => readPNG(`${DIR}/${n}.png`);
const L709 = (im, o) => 0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2];

/* ── V0/V1 provenance ─────────────────────────────────────────────────────── */
console.log('=== V0/V1 provenance ===');
const lockStamp = JSON.parse(readFileSync('/home/user/Demo/progress/records/twilight/treestamp-lock.json', 'utf8'));
const stamps = new Set(), heads = new Set();
let missing = 0;
for (const b of ALL_BLOCKS) for (const a of ['base', 'cand', 'back']) {
  const j = J.jobs[`${b}.${a}`];
  if (!j || j.error || !existsSync(`${DIR}/${b}.${a}.png`)) { missing++; v.voids.push(`missing ${b}.${a}`); continue; }
  stamps.add(j.tree.src); heads.add(j.tree.head);
}
const v1pass = missing === 0 && stamps.size === 1 && heads.size === 1 && [...heads][0] === lockStamp.head;
console.log(`captures missing ${missing}; srcTree set {${[...stamps].join(',')}}; head set {${[...heads].join(',')}} vs lock ${lockStamp.head}`);
console.log(`V1 ${v1pass ? 'OK' : '<<< VOID (tree split / missing captures)'}`);
v.bars.V1 = { pass: v1pass, stamps: [...stamps], heads: [...heads], missing };

/* ── V2 readbacks ─────────────────────────────────────────────────────────── */
console.log('\n=== V2 readbacks ===');
const EXPECT = J.expect;
const KEYOF = { 'perch-80': '0.8', 'perch-TWI1': '0.8833', 'perch-TWI2': '0.86', 'perch-TWI3': '0.9026',
  'arm-80': '0.8', 'arm-TWI1': '0.8833', 'arm-TWI2': '0.86', 'dunes': '0.83',
  'hero': '0.79', 'temple': '0.72', 'courtyard': '0.76', 'interior': '0.5' };
const SUBJ_BLOCKS = ['perch-80', 'perch-TWI1', 'perch-TWI2', 'perch-TWI3', 'arm-80', 'arm-TWI1', 'arm-TWI2'];
let v2fail = [];
for (const b of ALL_BLOCKS) {
  for (const [a, lever] of [['base', 0], ['cand', 1], ['back', 0]]) {
    const j = J.jobs[`${b}.${a}`]; if (!j || j.error) continue;
    const p = j.probe, exp = EXPECT.state[KEYOF[b]], anc = EXPECT.anchors[lever];
    const bad = [];
    if (p.anchors.a5sky !== anc.a5sky || p.anchors.a5ground !== anc.a5ground
      || p.anchors.a2sky !== anc.a2sky || p.anchors.a2ground !== anc.a2ground) bad.push('anchors');
    if (p.state[0] !== exp[lever][0] || p.state[1] !== exp[lever][1]) bad.push(`state ${p.state[0]}/${p.state[1]}≠${exp[lever][0]}/${exp[lever][1]}`);
    if (p.state[0] !== p.light[0] || p.state[0] !== p.payload[0]
      || p.state[1] !== p.light[1] || p.state[1] !== p.payload[1]) bad.push('propagation');
    if (Math.abs(p.el - exp.el) > (KEYOF[b] === '0.9026' ? 0.1 : 0.05)) bad.push(`el ${p.el}`);
    if (p.keyIsMoon !== exp.moon) bad.push(`keyIsMoon ${p.keyIsMoon}`);
    if (SUBJ_BLOCKS.includes(b) && (!p.subjBBox || p.subjBBox === 'BEHIND')) bad.push('subject-absent');
    if (bad.length) { v2fail.push(`${b}.${a}: ${bad.join(', ')}`); console.log(`${b}.${a} <<< ${bad.join(', ')}`); }
  }
}
if (!v2fail.length) console.log('all arms: anchors/state/propagation/el/moon/subject OK');
v.bars.V2 = { pass: v2fail.length === 0, fails: v2fail };
if (v2fail.length) v.voids.push(...v2fail);

/* ── V3 restore: back == base, 0 px |d|>=1, per block ─────────────────────── */
console.log('\n=== V3 back == base ===');
const diffCount = (A, B, thr) => {
  let n = 0;
  for (let i = 0, px = A.w * A.h; i < px; i++) {
    const oa = i * A.ch, ob = i * B.ch;
    if (Math.abs(A.data[oa] - B.data[ob]) >= thr || Math.abs(A.data[oa + 1] - B.data[ob + 1]) >= thr
      || Math.abs(A.data[oa + 2] - B.data[ob + 2]) >= thr) n++;
  }
  return n;
};
for (const b of ALL_BLOCKS) {
  let base, back;
  try { base = load(`${b}.base`); back = load(`${b}.back`); }
  catch { console.log(`${b}: MISSING`); continue; }
  const n = diffCount(base, back, 1);
  const binding = BINDING_BLOCKS.includes(b);
  console.log(`${b}: ${n} px ${n === 0 ? 'OK' : binding ? '<<< VOID' : '<<< report block dropped'}`);
  v.bars[`V3_${b}`] = { px: n, pass: n === 0 };
  if (n !== 0 && binding) v.voids.push(`V3 ${b}`);
  if (n !== 0 && !binding) v.notes.push(`report block ${b} dropped (restore ${n} px)`);
}

/* ── B4 golden protection: 0 px |d|>=1 ────────────────────────────────────── */
console.log('\n=== B4 golden protection (hero/temple/courtyard/interior) ===');
let b4pass = true;
for (const b of ['hero', 'temple', 'courtyard', 'interior']) {
  let base, cand;
  try { base = load(`${b}.base`); cand = load(`${b}.cand`); } catch { b4pass = false; console.log(`${b}: MISSING`); continue; }
  const n = diffCount(base, cand, 1);
  console.log(`${b}: ${n} px ${n === 0 ? 'OK' : '<<< FAIL (mechanism leak)'}`);
  v.bars[`B4_${b}`] = { px: n, pass: n === 0 };
  if (n !== 0) b4pass = false;
}
v.bars.B4 = { pass: b4pass };

/* ── B5 scope at the registered staging: 0 px |d|>=2, |d|>=1 report ───────── */
console.log('\n=== B5 scope at tod 0.80 ===');
let b5pass = true;
for (const b of ['perch-80', 'arm-80']) {
  let base, cand;
  try { base = load(`${b}.base`); cand = load(`${b}.cand`); } catch { b5pass = false; console.log(`${b}: MISSING`); continue; }
  const n2 = diffCount(base, cand, 2), n1 = diffCount(base, cand, 1);
  console.log(`${b}: |d|>=2 ${n2} px ${n2 === 0 ? 'OK' : '<<< FAIL'}   (|d|>=1 ${n1} px, report-only)`);
  v.bars[`B5_${b}`] = { px2: n2, px1: n1, pass: n2 === 0 };
  if (n2 !== 0) b5pass = false;
}
v.bars.B5 = { pass: b5pass };

/* ── circular hue machinery (PREREG §4) ───────────────────────────────────── */
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx ? d / mx : 0, mx / 255];
}
function circStats(im, idx) {
  let sw = 0, cx = 0, cy = 0;
  for (const i of idx) {
    const o = i * im.ch;
    const [h, s, vv] = hsv(im.data[o], im.data[o + 1], im.data[o + 2]);
    const w = s * vv;
    sw += w; cx += w * Math.cos(h * Math.PI / 180); cy += w * Math.sin(h * Math.PI / 180);
  }
  if (sw < 0.02 * idx.length) return { degenerate: true, sw, n: idx.length };
  const R = Math.hypot(cx, cy) / sw;
  const mean = ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360;
  const std = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(R, 1e-12)))) * 180 / Math.PI;
  return { degenerate: false, mean: +mean.toFixed(1), std: +std.toFixed(1), R: +R.toFixed(4), sw, n: idx.length };
}
const circDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const roiIdx = (im, [x0, y0, x1, y1]) => {
  const out = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push(y * im.w + x);
  return out;
};
function histo(im, idx) {
  const hh = new Array(32).fill(0), hl = new Array(32).fill(0);
  for (const i of idx) {
    const o = i * im.ch;
    const [h, s, vv] = hsv(im.data[o], im.data[o + 1], im.data[o + 2]);
    if (s * vv >= 0.05) hh[Math.min(31, (h / 11.25) | 0)]++;
    hl[Math.min(31, (L709(im, o) / 8) | 0)]++;
  }
  return { hue: hh, luma: hl };
}

/* ── B1 dispersion + B2 separation at TWI1 ────────────────────────────────── */
console.log('\n=== B1/B2 at tod 0.8833 (el 2.01) ===');
const b1 = {}, b2 = {};
for (const [short, block] of [['perch', 'perch-TWI1'], ['arm', 'arm-TWI1']]) {
  let base, cand;
  try { base = load(`${block}.base`); cand = load(`${block}.cand`); }
  catch { console.log(`${block}: MISSING`); v.voids.push(`B1 ${block} missing`); continue; }
  const idx = roiIdx(base, ROI[short]);
  const sb = circStats(base, idx), sc = circStats(cand, idx);
  v.histograms[`${block}.base`] = histo(base, idx);
  v.histograms[`${block}.cand`] = histo(cand, idx);
  if (sb.degenerate || sc.degenerate) {
    console.log(`${block}: DEGENERATE (sum w ${sb.sw?.toFixed(1)}/${sc.sw?.toFixed(1)}) <<< VOID-degenerate`);
    b1[short] = { degenerate: true };
  } else {
    const pass = sc.std >= sb.std + 8 && sc.std >= 1.5 * sb.std;
    b1[short] = { base: sb, cand: sc, pass };
    console.log(`${block} DISP: base std ${sb.std}° (mean ${sb.mean}°)  cand std ${sc.std}° (mean ${sc.mean}°)`
      + `  need >= ${(sb.std + 8).toFixed(1)} and >= ${(1.5 * sb.std).toFixed(1)} -> ${pass ? 'OK' : 'FAIL'}`);
  }
  /* B2: populations fixed on BASE luma percentiles (PREREG §4) */
  const lum = idx.map((i) => L709(base, i * base.ch)).sort((a, b) => a - b);
  const p35 = lum[(0.35 * lum.length) | 0], p65 = lum[(0.65 * lum.length) | 0];
  if (p65 - p35 < 8) {
    console.log(`${block} SEP: single population (p65-p35 = ${(p65 - p35).toFixed(1)} L < 8) — VOID-degenerate`);
    b2[short] = { degenerate: true, gap: +(p65 - p35).toFixed(1) };
  } else {
    const lit = idx.filter((i) => L709(base, i * base.ch) >= p65);
    const shade = idx.filter((i) => L709(base, i * base.ch) <= p35);
    const mb = { lit: circStats(base, lit), shade: circStats(base, shade) };
    const mc = { lit: circStats(cand, lit), shade: circStats(cand, shade) };
    if ([mb.lit, mb.shade, mc.lit, mc.shade].some((s) => s.degenerate)) {
      b2[short] = { degenerate: true, why: 'weight-degenerate population' };
      console.log(`${block} SEP: population weight-degenerate — VOID-degenerate`);
    } else {
      const sepB = circDist(mb.lit.mean, mb.shade.mean), sepC = circDist(mc.lit.mean, mc.shade.mean);
      b2[short] = { sepBase: +sepB.toFixed(1), sepCand: +sepC.toFixed(1), dSep: +(sepC - sepB).toFixed(1) };
      console.log(`${block} SEP: base ${sepB.toFixed(1)}° (lit ${mb.lit.mean}° / shade ${mb.shade.mean}°)`
        + `  cand ${sepC.toFixed(1)}° (lit ${mc.lit.mean}° / shade ${mc.shade.mean}°)  dSEP ${(sepC - sepB).toFixed(1)}°`);
    }
  }
}
v.bars.B1 = { detail: b1, pass: ['perch', 'arm'].every((s) => b1[s] && !b1[s].degenerate && b1[s].pass) };
const sepDefined = ['perch', 'arm'].filter((s) => b2[s] && !b2[s].degenerate);
v.bars.B2 = {
  detail: b2,
  pass: sepDefined.length > 0
    && sepDefined.some((s) => b2[s].dSep >= 15)
    && sepDefined.every((s) => b2[s].dSep >= -5),
  voidBoth: sepDefined.length === 0,
};
if (['perch', 'arm'].some((s) => b1[s]?.degenerate)) v.voids.push('B1 degenerate');
if (v.bars.B2.voidBoth) v.voids.push('B2 both populations degenerate');
console.log(`B1 -> ${v.bars.B1.pass ? 'OK' : 'FAIL'}   B2 -> ${v.bars.B2.voidBoth ? 'VOID' : v.bars.B2.pass ? 'OK' : 'FAIL'}`);

/* ── B3 costume at TWI1 ───────────────────────────────────────────────────── */
console.log('\n=== B3 costume ===');
const b3 = {};
for (const [short, block] of [['perch', 'perch-TWI1'], ['arm', 'arm-TWI1']]) {
  const j = J.jobs[`${block}.base`];
  const bb = j?.probe?.subjBBox;
  if (!bb || bb === 'BEHIND') { b3[short] = { void: 'subject-absent' }; v.voids.push(`B3 ${block} subject-absent`); continue; }
  let base, cand;
  try { base = load(`${block}.base`); cand = load(`${block}.cand`); } catch { b3[short] = { void: 'missing' }; continue; }
  const x0 = Math.max(0, bb[0]), y0 = Math.max(0, bb[1]), x1 = Math.min(base.w, bb[2]), y1 = Math.min(base.h, bb[3]);
  const idx = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * base.w + x, o = i * base.ch;
    const [, s, vv] = hsv(base.data[o], base.data[o + 1], base.data[o + 2]);
    if (s >= 0.10 && vv >= 0.10 && vv <= 0.97) idx.push(i);
  }
  if (idx.length < 800) { b3[short] = { void: `population ${idx.length} < 800` }; v.voids.push(`B3 ${block} small-pop`); continue; }
  const sb = circStats(base, idx), sc = circStats(cand, idx);
  let mSb = 0, mSc = 0, mLb = 0, mLc = 0;
  for (const i of idx) {
    const ob = i * base.ch, oc = i * cand.ch;
    mSb += hsv(base.data[ob], base.data[ob + 1], base.data[ob + 2])[1];
    mSc += hsv(cand.data[oc], cand.data[oc + 1], cand.data[oc + 2])[1];
    mLb += L709(base, ob); mLc += L709(cand, oc);
  }
  mSb /= idx.length; mSc /= idx.length; mLb /= idx.length; mLc /= idx.length;
  const hueOK = !sc.degenerate && sc.mean >= 190 && sc.mean <= 285;
  const satOK = mSc >= 0.70 * mSb;
  const lumOK = Math.abs(mLc - mLb) <= 12;
  b3[short] = {
    n: idx.length, hueBase: sb.mean, hueCand: sc.mean,
    sBase: +mSb.toFixed(3), sCand: +mSc.toFixed(3), lBase: +mLb.toFixed(1), lCand: +mLc.toFixed(1),
    hueOK, satOK, lumOK, pass: hueOK && satOK && lumOK,
  };
  console.log(`${block}: n ${idx.length}  hue ${sb.mean}°→${sc.mean}° [190,285]:${hueOK ? 'OK' : 'FAIL'}`
    + `  S ${mSb.toFixed(3)}→${mSc.toFixed(3)} (>=70%):${satOK ? 'OK' : 'FAIL'}`
    + `  L ${mLb.toFixed(1)}→${mLc.toFixed(1)} (|d|<=12):${lumOK ? 'OK' : 'FAIL'}`);
}
v.bars.B3 = { detail: b3, pass: ['perch', 'arm'].every((s) => b3[s] && !b3[s].void && b3[s].pass) };

/* ── report rows: TWI2/TWI3 stats, dunes census ───────────────────────────── */
console.log('\n=== report-only rows ===');
for (const [short, block] of [['perch', 'perch-TWI2'], ['arm', 'arm-TWI2'], ['perch', 'perch-TWI3']]) {
  try {
    const base = load(`${block}.base`), cand = load(`${block}.cand`);
    const idx = roiIdx(base, ROI[short]);
    const sb = circStats(base, idx), sc = circStats(cand, idx);
    console.log(`${block}: DISP base ${sb.degenerate ? 'degen' : sb.std + '° (mean ' + sb.mean + '°)'}`
      + ` -> cand ${sc.degenerate ? 'degen' : sc.std + '° (mean ' + sc.mean + '°)'}`);
    v.histograms[`${block}.base`] = histo(base, idx);
    v.histograms[`${block}.cand`] = histo(cand, idx);
  } catch { console.log(`${block}: missing/dropped`); }
}
try {
  const base = load('dunes.base'), cand = load('dunes.cand');
  const n1 = diffCount(base, cand, 1), n2 = diffCount(base, cand, 2);
  let sum = 0, n = 0;
  for (let i = 0, px = base.w * base.h; i < px; i++) {
    sum += Math.abs(L709(base, i * base.ch) - L709(cand, i * cand.ch)); n++;
  }
  console.log(`dunes (el 15, W=0.282, disclosed spillover): |d|>=1 ${n1} px, |d|>=2 ${n2} px, mean|dL| ${(sum / n).toFixed(3)}`);
  v.notes.push({ dunes: { px1: n1, px2: n2, meanAbsL: +(sum / n).toFixed(3) } });
} catch { console.log('dunes: missing'); }

/* ── B6 crops ─────────────────────────────────────────────────────────────── */
function cropNx(im, x0, y0, x1, y1, s, out) {
  const w = x1 - x0, h = y1 - y0;
  const p = new PNG({ width: w * s, height: h * s });
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const sx = Math.min(im.w - 1, x0 + ((x / s) | 0)), sy = Math.min(im.h - 1, y0 + ((y / s) | 0));
    const i = (sy * im.w + sx) * im.ch, o = (y * w * s + x) * 4;
    p.data[o] = im.data[i]; p.data[o + 1] = im.data[i + 1]; p.data[o + 2] = im.data[i + 2]; p.data[o + 3] = 255;
  }
  writeFileSync(out, PNG.sync.write(p));
}
console.log('\n=== B6 crops ===');
try {
  for (const [short, block] of [['perch', 'perch-TWI1'], ['arm', 'arm-TWI1']]) {
    const [rx0, ry0, rx1, ry1] = ROI[short];
    for (const armn of ['base', 'cand']) {
      const im = load(`${block}.${armn}`);
      cropNx(im, rx0, ry0, rx1, ry1, 2, `${CROPS}/${short}-TWI1-wall-${armn}-2x.png`);
      const bb = J.jobs[`${block}.base`]?.probe?.subjBBox;
      if (bb && bb !== 'BEHIND') {
        const pad = 20;
        cropNx(im, Math.max(0, bb[0] - pad), Math.max(0, bb[1] - pad),
          Math.min(im.w, bb[2] + pad), Math.min(im.h, bb[3] + pad), 2,
          `${CROPS}/${short}-TWI1-subj-${armn}-2x.png`);
      }
    }
  }
  for (const armn of ['base', 'cand']) {
    try {
      const im = load(`dunes.${armn}`);
      cropNx(im, 0, 0, im.w, im.h, 1, `${CROPS}/dunes-${armn}.png`);
    } catch { /* dropped */ }
    try {
      const im = load(`perch-TWI3.${armn}`);
      cropNx(im, 0, 0, im.w, im.h, 1, `${CROPS}/perch-TWI3-${armn}.png`);
    } catch { /* dropped */ }
  }
  try {
    const a = load('dunes.base'), b = load('dunes.cand');
    const p = new PNG({ width: a.w, height: a.h });
    for (let i = 0; i < a.w * a.h; i++) {
      const d = L709(a, i * a.ch) - L709(b, i * b.ch);
      const vv = Math.min(255, Math.abs(d) * 8);
      p.data[i * 4] = d > 0 ? vv : 0; p.data[i * 4 + 1] = 0; p.data[i * 4 + 2] = d < 0 ? vv : 0; p.data[i * 4 + 3] = 255;
    }
    writeFileSync(`${CROPS}/dunes-diffmap-x8.png`, PNG.sync.write(p));
  } catch { /* dropped */ }
  console.log(`crops -> ${CROPS}/ (perch/arm TWI1 wall+subj base|cand 2x, dunes pair + diffmap, TWI3 pair)`);
} catch (e) { console.log(`crop failure: ${e.message}`); v.voids.push('B6 crops failed'); }

/* ── verdict (fail-closed tri-state; B6 looking still pending) ────────────── */
const bindingVoid = v.voids.length > 0;
const barsPass = v.bars.V1.pass && v.bars.V2.pass
  && BINDING_BLOCKS.every((b) => v.bars[`V3_${b}`]?.pass)
  && v.bars.B4.pass && v.bars.B5.pass && v.bars.B1.pass && v.bars.B2.pass && !v.bars.B2.voidBoth
  && v.bars.B3.pass;
v.verdict = bindingVoid ? 'VOID' : barsPass ? 'SHIP-PENDING-LOOK' : 'NO-SHIP';
console.log(`\nverdict (pre-looking): ${v.verdict}${bindingVoid ? `  voids: ${JSON.stringify(v.voids)}` : ''}`);
writeFileSync(`${DIR}/verdict.json`, JSON.stringify(v, null, 1));
console.log(`wrote ${DIR}/verdict.json — this file evaluates; the RESULT decides, after the crops have been looked at.`);
