/**
 * PREREG-lithold §6 — the registered scorer. Reads progress/records/lithold1/ and prints the
 * verdict through tools/gate.mjs (VOID is not PASS; ship = every row PASS AND the binding
 * LOOK gate §9 — numbers here, eyes in the RESULT).
 *
 *   node progress/records/lithold-score.mjs
 *
 * Every band in this file was fixed in PREREG-lithold.md before the first frame existed.
 * Nothing here may be re-derived after looking at the capture (§141.1): a mis-aimed bar is a
 * NO-SHIP with the mis-aim recorded, and a re-seal is a NEW file.
 */
import { readPNG } from '../../tools/png.mjs';
import { shipVerdict, verdictLine } from '../../tools/gate.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
/* LITHOLD_DIR exists so this scorer can be smoke-tested against a synthetic manifest before
   the capture runs (a scorer that crashes after a two-hour lock hold is an expensive bug).
   The registered run reads the default. */
const DIR = process.env.LITHOLD_DIR || path.join(ROOT, 'progress/records/lithold1');
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];
const ON = 0.70, KO = 0.40, DOSE = ['traversal', 'combat'];
const MASKED = ['traversal', 'combat', 'temple', 'dunes', 'night', 'interior'];
const EXPECT_ROWS = 68;
const REF_HUE = 213.5;                    // the reference costume hue (§277 / §283)
const DILATE = 3;                         // px — PROT-ENV's registered halo exclusion (§6)
const CAL_U8 = [64, 128, 191];            // DEBUG_CALIB.term

/* ── registered ROIs (PREREG §4; derived from the r12 frames, disclosed there) ──────────── */
const COSTUME = {
  traversal: [557, 261, 582, 291],
  combat: [520, 468, 566, 522],
  'sly-key': [600, 228, 675, 290],
  'sly-closeup': [592, 228, 672, 292],
  night: [747, 412, 767, 435],
};
const MUZZLE = [590, 170, 640, 212];      // sly-closeup, warm cream fur
const TAILFUR = [700, 300, 850, 430];     // sly-closeup, brown tail fur
const FULL = [0, 0, 1280, 720];

const manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const row = (shot, arm) => manifest.rows.find((r) => r.shot === shot && r.arm === arm) || null;
const _cache = new Map();
const img = (r) => {
  if (!r) return null;
  if (_cache.has(r.file)) return _cache.get(r.file);
  const f = path.join(DIR, r.file);
  const im = existsSync(f) ? readPNG(f) : null;
  _cache.set(r.file, im);
  return im;
};

const lum = (R, G, B) => 0.2126 * R + 0.7152 * G + 0.0722 * B;
const circDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** The registered population: the top half by luminance of a costume rect ("the LIT half"),
 *  with the MASK taken from the reference arm and applied unchanged to both arms, so the
 *  two arms are compared over identical pixels (no membership drift). */
function litMask(im, [x0, y0, x1, y1]) {
  const px = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * im.w + x) * im.ch;
    px.push({ i: y * im.w + x, L: lum(im.data[o], im.data[o + 1], im.data[o + 2]) });
  }
  px.sort((a, b) => b.L - a.L);
  return px.slice(0, Math.max(1, Math.round(px.length / 2))).map((p) => p.i);
}
/** Mean HSV saturation, chroma-weighted circular hue, mean luma and mean b-r over a mask. */
function stats(im, mask) {
  let sS = 0, sL = 0, sBR = 0, cx = 0, cy = 0, w = 0;
  for (const i of mask) {
    const o = i * im.ch;
    const R = im.data[o] / 255, G = im.data[o + 1] / 255, B = im.data[o + 2] / 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
    sS += mx > 1e-6 ? d / mx : 0;
    sL += lum(R, G, B) * 255;
    sBR += (B - R) * 255;
    let h = 0;
    if (d > 1e-6) {
      if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    cx += d * Math.cos(h * Math.PI / 180); cy += d * Math.sin(h * Math.PI / 180); w += d;
  }
  const n = mask.length;
  return {
    n, S: sS / n, meanL: sL / n, meanBR: sBR / n,
    hue: w > 1e-9 ? ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360 : NaN,
  };
}
const rectMask = (im, [x0, y0, x1, y1]) => {
  const m = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.push(y * im.w + x);
  return m;
};
function diffPx(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  let d = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1] || a.data[oa + 2] !== b.data[ob + 2]) d++;
  }
  return d;
}
/** differing pixels farther than `r` px (Chebyshev) from any mask pixel — PROT-ENV. */
function diffOutsideMask(a, b, maskIm, r) {
  if (!a || !b || !maskIm || a.w !== b.w || a.w !== maskIm.w) return null;
  const W = a.w, H = a.h;
  const near = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (maskIm.data[(y * W + x) * maskIm.ch] >= 128) near[y * W + x] = 1;
  }
  /* separable Chebyshev dilation by r */
  const tmp = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < W && near[y * W + xx]) v = 1; }
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < H && tmp[yy * W + x]) v = 1; }
    near[y * W + x] = v;
  }
  let outside = 0, inside = 0, far = 0;
  for (let i = 0; i < W * H; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    const differs = a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1] || a.data[oa + 2] !== b.data[ob + 2];
    if (!differs) continue;
    if (near[i]) inside++; else { outside++; far++; }
  }
  return { inside, outside, far };
}

const guards = {};
const report = [];
const bool = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : !!v);

/* ── R — same-boot validity: every intervening poke is bracketed (§302) ─────────────────── */
for (const shot of ROSTER) {
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'back')));
  report.push(`R  ${shot.padEnd(12)} off-vs-back ${d} px`);
  guards[`R_${shot}`] = d === null ? null : d === 0;
}
/* ── R2 — the debug arms restored exactly (masked shots only) ───────────────────────────── */
for (const shot of MASKED) {
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'bk2')));
  report.push(`R2 ${shot.padEnd(12)} off-vs-bk2  ${d} px`);
  guards[`R2_${shot}`] = d === null ? null : d === 0;
}
/* ── CAL — the mask channel proved itself in this boot, on this shot ────────────────────── */
for (const shot of MASKED) {
  const im = img(row(shot, 'cal'));
  let hit = 0;
  if (im) for (let i = 0; i < im.w * im.h; i++) {
    const o = i * im.ch;
    if (Math.abs(im.data[o] - CAL_U8[0]) <= 1 && Math.abs(im.data[o + 1] - CAL_U8[1]) <= 1
      && Math.abs(im.data[o + 2] - CAL_U8[2]) <= 1) hit++;
  }
  const frac = im ? hit / (im.w * im.h) : null;
  report.push(`CAL ${shot.padEnd(11)} (64,128,191) over ${(100 * (frac ?? 0)).toFixed(1)}% of frame (want >= 5%)`);
  guards[`CAL_${shot}`] = frac === null ? null : frac >= 0.05;
}

/* ── the costume statistic, per shot, over the OFF-arm mask ─────────────────────────────── */
const M = {};
for (const [shot, rect] of Object.entries(COSTUME)) {
  const o = img(row(shot, 'off'));
  if (!o) { M[shot] = null; continue; }
  const mask = litMask(o, rect);
  const arms = {};
  for (const arm of ['off', 'on', 'ko']) {
    const im = img(row(shot, arm));
    if (im) arms[arm] = stats(im, mask);
  }
  M[shot] = arms;
  for (const [arm, s] of Object.entries(arms)) {
    report.push(`ROI ${shot.padEnd(12)}.${arm.padEnd(4)} n ${String(s.n).padStart(5)}  S ${s.S.toFixed(3)}  L ${s.meanL.toFixed(1)}  hue ${s.hue.toFixed(1)}  |dref| ${circDist(s.hue, REF_HUE).toFixed(1)}`);
  }
}

/* ── BG — the calibrate-then-accept gate: the metric must reproduce, on THIS capture, the
      known-bad / known-good separation it was sized on (§13/§141, PREREG §4) ───────────── */
{
  const t = M.traversal?.off, c = M.combat?.off, k = M['sly-key']?.off;
  guards.BG = (!t || !c || !k) ? null
    : (t.S <= 0.30 && c.S <= 0.18 && k.S >= 0.42 && k.S >= 2.0 * t.S);
  report.push(`BG  off-arm separation: traversal ${t?.S.toFixed(3)} (<=0.30) · combat ${c?.S.toFixed(3)} (<=0.18) · sly-key ${k?.S.toFixed(3)} (>=0.42, and >= 2.0x traversal)`);
}
const gated = (shot) => guards.BG === true && guards[`R_${shot}`] === true && M[shot]?.off && M[shot]?.on;

/* ── E1 / E2 — the costume recovers chroma where the critics said it was gone ───────────── */
if (gated('traversal')) {
  const dS = M.traversal.on.S - M.traversal.off.S;
  report.push(`E1  traversal dS ${dS.toFixed(3)} (want >= +0.120)  S(on) ${M.traversal.on.S.toFixed(3)} (want >= 0.350)`);
  guards.E1 = dS >= 0.120 && M.traversal.on.S >= 0.350;
} else guards.E1 = null;

if (gated('combat')) {
  const dS = M.combat.on.S - M.combat.off.S;
  report.push(`E2  combat    dS ${dS.toFixed(3)} (want >= +0.050 — deliberately weak, PREREG §6: the FX/bloom share of this frame's wash is composited after the shader and is outside the lever's reach; this bar measures whether ANY of it is in-shader)`);
  guards.E2 = dS >= 0.050;
} else guards.E2 = null;

/* ── E3 — and it moves TOWARD the reference hue, on both ────────────────────────────────── */
{
  let ok = true, any = false;
  for (const shot of ['traversal', 'combat']) {
    if (!gated(shot)) { ok = null; break; }
    any = true;
    const d0 = circDist(M[shot].off.hue, REF_HUE), d1 = circDist(M[shot].on.hue, REF_HUE);
    report.push(`E3  ${shot.padEnd(12)} |hue-${REF_HUE}| ${d0.toFixed(1)} -> ${d1.toFixed(1)} (want <= off - 3.0)`);
    if (!(d1 <= d0 - 3.0)) ok = false;
  }
  guards.E3 = ok === null || !any ? null : ok;
}

/* ── KO — dose monotone on both dose shots ──────────────────────────────────────────────── */
{
  let ok = true, any = false;
  for (const shot of DOSE) {
    if (!gated(shot) || !M[shot].ko) { ok = null; break; }
    any = true;
    const dOn = M[shot].on.S - M[shot].off.S, dKo = M[shot].ko.S - M[shot].off.S;
    report.push(`KO  ${shot.padEnd(12)} dS ko ${dKo.toFixed(3)} vs on ${dOn.toFixed(3)} (want 0.35-0.85x)`);
    if (!(dOn > 0 && dKo >= 0.35 * dOn && dKo <= 0.85 * dOn)) ok = false;
  }
  guards.KO = ok === null || !any ? null : ok;
}

/* ── PROT-CLOSE — the frames the critics praised may not lose chroma or brightness ──────── */
for (const shot of ['sly-key', 'sly-closeup']) {
  if (!gated(shot)) { guards[`PC_${shot}`] = null; continue; }
  const dS = M[shot].on.S - M[shot].off.S, dL = M[shot].on.meanL - M[shot].off.meanL;
  report.push(`PC  ${shot.padEnd(12)} dS ${dS.toFixed(3)} (want -0.010..+0.100)  dL ${dL.toFixed(2)} (want |dL| <= 4)`);
  guards[`PC_${shot}`] = dS >= -0.010 && dS <= 0.100 && Math.abs(dL) <= 4;
}

/* ── PROT-FACE(Δ) — §288's rule: subject protections are sealed in DELTA form ───────────── */
{
  const o = img(row('sly-closeup', 'off')), n = img(row('sly-closeup', 'on'));
  const alive = [];
  let ok = o && n ? true : null;
  if (ok) {
    for (const [name, rect] of [['muzzle', MUZZLE], ['tailfur', TAILFUR]]) {
      const m = rectMask(o, rect);
      const a = stats(o, m), b = stats(n, m);
      alive.push(a.n >= 200 && b.n >= 200);
      const d = b.meanBR - a.meanBR;
      report.push(`PF  ${name.padEnd(12)} b-r ${a.meanBR.toFixed(1)} -> ${b.meanBR.toFixed(1)}  d ${d.toFixed(1)} (want |d| <= 7, n ${a.n})`);
      if (!(Math.abs(d) <= 7)) ok = false;
    }
  }
  guards['CAL-FACE-N'] = alive.length === 2 ? alive.every(Boolean) : null;
  guards['PROT-FACE'] = guards['CAL-FACE-N'] === true && guards['R_sly-closeup'] === true ? ok : null;
}

/* ── PROT-NIGHT — the moonlit read holds (numeric half; the LOOK crop is binding) ───────── */
if (guards.R_night === true && M.night?.off && M.night?.on) {
  const dS = M.night.on.S - M.night.off.S, dL = M.night.on.meanL - M.night.off.meanL;
  report.push(`PN  night subj  dS ${dS.toFixed(3)} (want >= -0.020)  dL ${dL.toFixed(2)} (want |dL| <= 4)  n ${M.night.off.n}`);
  guards.PROT_NIGHT = M.night.off.n >= 150 && dS >= -0.020 && Math.abs(dL) <= 4;
} else guards.PROT_NIGHT = null;

/* ── PROT-FRAME — environment-dominant frames barely move at all ────────────────────────── */
for (const shot of ['temple', 'dunes', 'interior', 'night']) {
  const o = img(row(shot, 'off')), n = img(row(shot, 'on'));
  if (guards[`R_${shot}`] !== true || !o || !n) { guards[`PFR_${shot}`] = null; continue; }
  const m = rectMask(o, FULL);
  const a = stats(o, m), b = stats(n, m);
  const dL = b.meanL - a.meanL, dBR = b.meanBR - a.meanBR;
  report.push(`PFR ${shot.padEnd(12)} FULL dL ${dL.toFixed(3)} (want |dL| <= 1.5)  d(b-r) ${dBR.toFixed(3)} (want |d| <= 3.0)`);
  guards[`PFR_${shot}`] = Math.abs(dL) <= 1.5 && Math.abs(dBR) <= 3.0;
}

/* ── PROT-ENV — measured, not asserted: nothing outside the vSlySkin mask (+3 px halo)
      may move. The halo is excluded BY REGISTRATION because PostFX's edge-detect and
      screen rim read the scene colour, so a subject-only change can legitimately shift a
      1-2 px band just outside the silhouette; the count inside the halo is reported. ──── */
for (const shot of MASKED) {
  const o = img(row(shot, 'off')), n = img(row(shot, 'on')), mk = img(row(shot, 'msk'));
  if (guards[`R_${shot}`] !== true || guards[`CAL_${shot}`] !== true) { guards[`ENV_${shot}`] = null; continue; }
  const d = diffOutsideMask(o, n, mk, DILATE);
  report.push(`ENV ${shot.padEnd(12)} differing px: ${d ? d.inside : '—'} within mask+${DILATE}px, ${d ? d.outside : '—'} beyond (want 0)`);
  guards[`ENV_${shot}`] = d === null ? null : d.outside === 0;
}

/* ── VC — readbacks: every arm echoes its commanded lever, and §289 never moved ─────────── */
{
  let ok = true, n = 0;
  for (const shot of ROSTER) {
    const want = { off: 0, on: ON, back: 0, ko: KO, bk2: 0 };
    for (const arm of ['off', 'on', 'back', ...(DOSE.includes(shot) ? ['ko'] : []), ...(MASKED.includes(shot) ? ['bk2'] : [])]) {
      const r = row(shot, arm)?.readback;
      if (!r) { ok = null; break; }
      n++;
      if (r.uSubjLitHold !== want[arm]) { ok = false; report.push(`VC: ${shot}.${arm} uSubjLitHold ${r.uSubjLitHold} != ${want[arm]}`); }
      if (r.uSubjShadowHold !== 1.0) { ok = false; report.push(`VC: ${shot}.${arm} uSubjShadowHold ${r.uSubjShadowHold} != 1.0 — §289 moved`); }
      if (r.uShadowHoldKnee !== 0.25) { ok = false; report.push(`VC: ${shot}.${arm} knee ${r.uShadowHoldKnee}`); }
      if (r.uDebugTerm !== 0 || r.debugRaw === true) { ok = false; report.push(`VC: ${shot}.${arm} debug state leaked (term ${r.uDebugTerm}, raw ${r.debugRaw})`); }
    }
    if (ok === null) break;
  }
  report.push(`VC  ${n} scored arms checked`);
  guards.VC = ok === null ? null : ok;
}

/* ── V4 — ONE tree for the whole boot, the expected row census, and the two files this seal
      owns byte-identical to HEAD at both lock grant and release. The tree hash is required to
      equal the one recorded AT LOCK GRANT rather than HEAD's own: six lanes share this tree,
      so a foreign uncommitted edit OUTSIDE src/render and src/player (the runner aborts on
      dirt INSIDE them) leaves a reconstructible tree that both arms of a same-boot poke see
      identically. Whether that happened is disclosed here and must be quoted in the RESULT. */
{
  const hs = new Set();
  for (const r of manifest.rows) hs.add(r.tree?.src || '?');
  const lock = manifest.lockGrant?.src;
  const exact = lock && lock === manifest.headSrc;
  report.push(`V4  trees {${[...hs]}} vs lock-grant ${lock} (HEAD src ${manifest.headSrc}${exact ? ', exact' : ', DIFFERS — foreign dirt at capture, see below'}); rows ${manifest.rows.length} (want ${EXPECT_ROWS})`);
  if (!exact) report.push(`V4  DISCLOSURE — foreign src/ dirt at lock grant:\n${manifest.lockGrant?.foreign || '(none recorded)'}`);
  guards.V4 = manifest.rows.length === EXPECT_ROWS && hs.size === 1 && !!lock && [...hs][0] === lock
    && !manifest.release?.critical && !manifest.release?.owned;
}

/* ── REPORT-only rows (never gate; they are what a failure gets diagnosed from) ─────────── */
for (const shot of ROSTER) {
  const o = img(row(shot, 'off')), n = img(row(shot, 'on'));
  if (!o || !n) continue;
  report.push(`--  ${shot.padEnd(12)} whole-frame differing px off-vs-on ${diffPx(o, n)}`);
}

for (const k of Object.keys(guards)) guards[k] = bool(guards[k]);
console.log(report.join('\n'));
console.log('');
const v = shipVerdict(guards);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(18)} ${s}`);
console.log('');
console.log(verdictLine(v, `TUNE.subjLitHold = ${ON} (lithold — one-boot poke A/B; the LOOK gate §9 still binds before any write)`));
process.exit(v.ship ? 0 : 1);
