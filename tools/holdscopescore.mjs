/**
 * PREREG-holdscope.md §8 — the registered guards, evaluated fail-closed through `gate.mjs`.
 *
 *   node tools/holdscopescore.mjs [shots/holdscope]
 *
 * Bars are transcribed from the pre-registration and are NOT re-derived here, with one
 * deliberate exception that is itself registered: every delta bar is taken against the
 * **same-run A0**, never against `shots/r9`. Those frames are ~120 commits old and the lane that
 * scored against them passed a candidate at 1.27 while its own control measured 1.22 (§273).
 *
 * The hue instrument below is a re-implementation of `scratchpad/hue/score.py`, the instrument
 * frozen before §269's candidate existed. A re-implementation is a different instrument until it
 * has reproduced the original, so I1 re-scores two frames the Python original already scored and
 * requires agreement to 0.01. If those frames are not on this machine (`shots/` below the top
 * level is gitignored working output) I1 is VOID, not skipped — and VOID is not PASS.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readPNG } from './png.mjs';
import { shipVerdict, verdictLine } from './gate.mjs';

const DIR = process.argv[2] || 'shots/holdscope';
const run = JSON.parse(readFileSync(`${DIR}/run.json`, 'utf8'));

/* ═══════════════════════════ the frozen instrument, re-implemented ═══════════════════════ */
/* Definitions are score.py's, unchanged: top/bottom 20% of an ROI by HSV value; HSV of each
   group's MEAN RGB; circular dh; frame populations at sat > 0.15 with warm h<60 or h>=330 and
   cool 170<=h<260; dark at rec709 L < 0.15*255. */
const ROI = {
  dunes: ['dunes sand', [80, 545, 760, 700]],
  hero: ['hero floor', [930, 500, 1275, 715]],
  /* temple: NO ROI. PREREG §3 rejects three candidate rects with the reason for each. */
};
const QSPLIT = 0.20, SATMIN = 0.15;

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx * 255];
}
const dhue = (a, b) => { const d = Math.abs(a - b) % 360; return d <= 180 ? d : 360 - d; };
function circmean(hs) {
  if (!hs.length) return [null, 0];
  let x = 0, y = 0;
  for (const h of hs) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); }
  x /= hs.length; y /= hs.length;
  return [(Math.atan2(y, x) * 180 / Math.PI + 360) % 360, Math.hypot(x, y)];
}
const hsvOfMean = (px) => {
  let r = 0, g = 0, b = 0;
  for (const p of px) { r += p[0]; g += p[1]; b += p[2]; }
  const n = px.length;
  const [h, s, v] = rgb2hsv(r / n, g / n, b / n);
  return { rgb: [+(r / n).toFixed(1), +(g / n).toFixed(1), +(b / n).toFixed(1)], h, s, v };
};

function roiMetrics(im, rect) {
  const [x0, y0, x1, y1] = rect, px = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * im.ch;
    px.push([im.data[i], im.data[i + 1], im.data[i + 2]]);
  }
  /* score.py sorts by `max`, i.e. HSV value, and takes the extreme quantiles. Ties are ordered
     by whatever the sort is stable on; with 100k+ pixels that cannot move a group mean at 4 dp. */
  px.sort((a, b) => Math.max(a[0], a[1], a[2]) - Math.max(b[0], b[1], b[2]));
  const k = Math.max(1, Math.floor(px.length * QSPLIT));
  const L = hsvOfMean(px.slice(px.length - k)), S = hsvOfMean(px.slice(0, k));
  return { n: px.length, lit: L, sha: S, dh: dhue(L.h, S.h), vratio: S.v / Math.max(L.v, 1e-6), dsat: S.s - L.s };
}

function frameMetrics(im) {
  const warm = [], cool = [];
  let dark = 0, brite = 0, n = 0;
  for (let i = 0; i < im.data.length; i += im.ch) {
    const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    n++;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (L < 0.15 * 255) dark++;
    if (L > 230) brite++;
    const [h, s] = rgb2hsv(r, g, b);
    if (s > SATMIN) { if (h < 60 || h >= 330) warm.push(h); else if (h >= 170 && h < 260) cool.push(h); }
  }
  const [wm, wr] = circmean(warm), [cm, cr] = circmean(cool);
  return { n, warm_pct: 100 * warm.length / n, cool_pct: 100 * cool.length / n,
           warm_hue: wm, warm_R: wr, cool_hue: cm, cool_R: cr,
           dark_pct: 100 * dark / n, brite_pct: 100 * brite / n };
}

const cache = new Map();
function score(file) {
  if (cache.has(file)) return cache.get(file);
  const im = readPNG(file);
  const v = { im, frame: frameMetrics(im) };
  cache.set(file, v);
  return v;
}
const roiOf = (file, shot) => (ROI[shot] ? roiMetrics(score(file).im, ROI[shot][1]) : null);
const sha16 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);

/* ═══════════════════════════════ registered bars (PREREG §7/§8) ══════════════════════════ */
const BAR = {
  dh: 45.0,                 // the critic's own loosest reference reading, 44.9, rounded up
  dhDelta: 100.0,           // and it must be at least this far below the SAME-RUN A0
  vratio: [0.20, 0.75],
  satDrop: 0.05,            // shade saturation >= A0 shade saturation - this
  coolAbs: 12.993,          // 0.75 x reference cool_pct 17.3236, derived at PREREG time
  coolRel: 0.50,            // and >= half the same-run A0's cool mass
  ctlMove: 20.0,            // A2 must move dunes dh by at least this. MUST FIRE.
  calib: [64, 128, 191],    // debugTerm(4)
  calibShare: 0.20,
  litBar: 0.05,             // criterion C
  conv: 0.01,               // |enclosure - target|
  band: 0.05,               // |enclosure - T|
  roiPop: 0.05,             // I5: each of the two key populations, as a share of the ROI
  keyBar: 13,               // mode-5 blue channel: "the sun reaches this pixel"
};
/* The daylight scope for the absolute cool bar. `night` is a palette flip and the reference is a
   daylight frame; the PREREG scopes G6 by tod >= 0.2 and lists the shots. */
const NIGHT_SHOTS = new Set(['night']);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cmp = (v, f) => (v === null ? null : f(v));
const armOf = (shot, tag) => run.arms.find((a) => a.shot === shot && a.arm === tag);
const fileOf = (shot, tag) => armOf(shot, tag)?.file ?? null;

/* ═══════════════════════════════════════ I1 — instrument ═════════════════════════════════ */
/* Reproduce the frozen Python instrument on frames it already scored. */
let I1 = null; const i1rows = [];
{
  const ref = 'shots/shold/scored.json';
  if (existsSync(ref)) {
    const rows = JSON.parse(readFileSync(ref, 'utf8'));
    let ok = true;
    for (const shot of ['dunes', 'interior']) {
      const want = rows.find((r) => r.shot === shot && r.arm === 'A0-base');
      const f = `shots/shold/${shot}-A0-base.png`;
      if (!want || !existsSync(f)) { ok = false; i1rows.push([shot, 'missing', null, null]); continue; }
      const got = { frame: score(f).frame, roi: want.roi ? roiMetrics(score(f).im, want.roi.rect) : null };
      const pairs = [
        ['warm_pct', want.frame.warm_pct, got.frame.warm_pct], ['cool_pct', want.frame.cool_pct, got.frame.cool_pct],
        ['dark_pct', want.frame.dark_pct, got.frame.dark_pct],
      ];
      if (want.roi) pairs.push(['dh', want.roi.dh, got.roi.dh], ['vratio', want.roi.vratio, got.roi.vratio],
                               ['lit.s', want.roi.lit.s, got.roi.lit.s], ['sha.s', want.roi.sha.s, got.roi.sha.s]);
      for (const [k, a, b] of pairs) {
        const d = Math.abs(a - b);
        if (!(d <= 0.01)) ok = false;
        i1rows.push([`${shot}.${k}`, a, b, d]);
      }
    }
    I1 = ok;
  }
}

/* ═══════════════════════════════════ I2/I3/I4 — validity ════════════════════════════════ */
/* PREREG I2 is written about `hero`: "the debugTerm(4) render's modal RGB is exactly
   (64,128,191) and covers >= 20% of the `hero` frame". The first draft of this scorer required
   the modal to be the constant on ALL TEN shots, which is stricter than what was registered and
   wrong on its own terms — in a frame the sky dominates, the most common pixel is legitimately
   not a toon surface, and that says nothing about whether the channel can be read. Corrected to
   the registered form BEFORE any candidate frame was scored, with the per-shot diagnostic that
   actually answers the question kept as a separate, reported quantity: the share of pixels
   carrying the constant EXACTLY. A shot whose calibration frame contains none of it has no
   readable toon surface, and its criterion-C reading is VOID rather than PASS. */
const exactShare = (shot) => {
  const f = `${DIR}/${shot}-calib4.png`;
  if (!existsSync(f)) return null;
  const im = readPNG(f);
  let n = 0, tot = 0;
  for (let i = 0; i < im.data.length; i += im.ch) {
    tot++;
    if (im.data[i] === BAR.calib[0] && im.data[i + 1] === BAR.calib[1] && im.data[i + 2] === BAR.calib[2]) n++;
  }
  return n / tot;
};
const calRows = Object.entries(run.shots).map(([s, r]) => ({ shot: s, calib: r.calib, exact: exactShare(s) }));
const heroCal = run.shots.hero?.calib;
const I2 = !heroCal ? null
  : (heroCal.rgb[0] === BAR.calib[0] && heroCal.rgb[1] === BAR.calib[1] && heroCal.rgb[2] === BAR.calib[2]
     && num(heroCal.share) !== null && heroCal.share >= BAR.calibShare);
/** Shots whose criterion-C reading cannot be trusted because no pixel carried the constant. */
const cBlind = calRows.filter((r) => r.exact === null || r.exact <= 0).map((r) => r.shot);

const I3 = (run.provStart?.src?.digest && run.provEnd?.src?.digest)
  ? run.provStart.src.digest === run.provEnd.src.digest : null;
const headMoved = run.provStart?.head !== run.provEnd?.head;
/* One boot, one invocation is structural, but assert it anyway: every arm must carry the same
   applied `encloseStrength`, and no arm may be missing a file. */
const oneRun = run.arms.every((a) => a.skipped || (a.file && existsSync(a.file)));

const T = run.partition?.T ?? null;
const I4rows = Object.entries(run.shots).map(([s, r]) => {
  const conv = Math.abs(r.enclosure - (r.target ?? NaN));
  const band = T === null ? null : Math.abs(r.enclosure - T);
  return { shot: s, enclosure: r.enclosure, target: r.target, conv, band,
           ok: Number.isFinite(conv) && conv <= BAR.conv && (band === null ? false : band >= BAR.band) };
});
const I4 = I4rows.length ? I4rows.every((r) => r.ok) : null;

/* I5 — ROI validity from the key map: both populations present inside the scored rect. */
const I5rows = [];
for (const shot of Object.keys(ROI)) {
  const f = `${DIR}/${shot}-key5.png`;
  if (!existsSync(f)) { I5rows.push({ shot, lit: null, sha: null, ok: null }); continue; }
  const im = readPNG(f);
  const [, [x0, y0, x1, y1]] = ROI[shot];
  let lit = 0, tot = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * im.ch; tot++;
    if (im.data[i + 2] >= BAR.keyBar) lit++;
  }
  const fl = lit / tot, fs = 1 - fl;
  I5rows.push({ shot, lit: fl, sha: fs, ok: fl >= BAR.roiPop && fs >= BAR.roiPop });
}
const I5 = I5rows.length ? (I5rows.every((r) => r.ok === true) ? true : (I5rows.some((r) => r.ok === null) ? null : false)) : null;

/* ═══════════════════════════════════ C1/C2/C3 — arms ════════════════════════════════════ */
const dunesA0 = fileOf('dunes', 'A0-base'), dunesA2 = fileOf('dunes', 'A2-ctlgrey');
const dunesRoiA0 = dunesA0 ? roiOf(dunesA0, 'dunes') : null;
const C1 = (dunesA0 && dunesA2 && ROI.dunes)
  ? Math.abs(roiOf(dunesA2, 'dunes').dh - dunesRoiA0.dh) >= BAR.ctlMove : null;

const identical = (shot, tag) => {
  const a = fileOf(shot, 'A0-base'), b = fileOf(shot, tag);
  if (!a || !b || !existsSync(a) || !existsSync(b)) return null;
  return sha16(a) === sha16(b);
};
const FULL = ['dunes', 'hero', 'temple', 'interior'];
const tri = (vals) => (vals.some((v) => v === null) ? null : vals.every(Boolean));
const C2 = tri(FULL.map((s) => identical(s, 'A1-null')));
const C3 = tri(FULL.map((s) => identical(s, 'A5-restore')));

/* ═══════════════════════════════════ G0 — the scope ═════════════════════════════════════ */
const partitionAgrees = (() => {
  if (T === null) return false;
  for (const [s, r] of Object.entries(run.shots)) {
    const cOpen = r.litFrac >= BAR.litBar;
    const eOpen = r.enclosure <= T;
    if (cOpen !== eOpen) return false;
  }
  return true;
})();
const G0 = cBlind.length ? null                       // criterion C unreadable somewhere -> VOID
  : run.partition?.refuted ? false
  : (I4 === null ? null : (partitionAgrees && I4));

/* ═════════════════════════════ G1..G7 — the candidate, A4 ═══════════════════════════════ */
const capturedShots = [...new Set(run.arms.map((a) => a.shot))];
const openShots = capturedShots.filter((s) => run.shots[s] && run.shots[s].litFrac >= BAR.litBar);
const roofedShots = capturedShots.filter((s) => run.shots[s] && run.shots[s].litFrac < BAR.litBar);

const pair = (shot) => {
  const a0 = fileOf(shot, 'A0-base'), a4 = fileOf(shot, 'A4-scoped');
  if (!a0 || !a4 || !existsSync(a0) || !existsSync(a4)) return null;
  return { a0: { frame: score(a0).frame, roi: roiOf(a0, shot) },
           a4: { frame: score(a4).frame, roi: roiOf(a4, shot) } };
};
const P = Object.fromEntries(capturedShots.map((s) => [s, pair(s)]));

const dhGuard = (shot) => {
  const p = P[shot]; if (!p || !p.a0?.roi || !p.a4?.roi) return null;
  if (I5rows.find((r) => r.shot === shot)?.ok !== true) return null;   // ROI could not be scored
  return p.a4.roi.dh <= BAR.dh && p.a4.roi.dh <= p.a0.roi.dh - BAR.dhDelta;
};
const vGuard = (shot) => {
  const p = P[shot]; if (!p || !p.a4?.roi) return null;
  return p.a4.roi.vratio >= BAR.vratio[0] && p.a4.roi.vratio <= BAR.vratio[1];
};
const satGuard = (shot) => {
  const p = P[shot]; if (!p || !p.a4?.roi || !p.a0?.roi) return null;
  return p.a4.roi.sha.s >= p.a0.roi.sha.s - BAR.satDrop;
};
const G5 = roofedShots.length ? tri(roofedShots.map((s) => identical(s, 'A4-scoped'))) : null;
/* PREREG §7 as amended before any candidate existed: a shot whose OWN A0 is already under the
   reference-derived bar cannot be brought over it by this lane, and a guard no candidate could
   pass is a guard on a pre-existing condition. Those shots report N/A (excluded from G6) with
   both numbers printed; G7, which is relative, still covers them. */
const coolAbsApplies = (s) => { const p = P[s]; return !!p && p.a0.frame.cool_pct >= BAR.coolAbs; };
const coolAbs = (s) => { const p = P[s]; return p ? p.a4.frame.cool_pct >= BAR.coolAbs : null; };
const coolRel = (s) => { const p = P[s]; return p ? p.a4.frame.cool_pct >= BAR.coolRel * p.a0.frame.cool_pct : null; };
const dayOpen = openShots.filter((s) => !NIGHT_SHOTS.has(s));
const g6Shots = dayOpen.filter(coolAbsApplies);
const G6 = g6Shots.length ? tri(g6Shots.map(coolAbs)) : null;
const G7 = openShots.length ? tri(openShots.map(coolRel)) : null;

/* ═════════════════════════════════════════ report ═══════════════════════════════════════ */
const f2 = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : String(v));
console.log(`PREREG: ${run.prereg}\ndir:    ${DIR}\n`);

console.log('── provenance ─────────────────────────────────────────────────────────────────');
console.log(`  HEAD  ${run.provStart?.head?.slice(0, 8)} -> ${run.provEnd?.head?.slice(0, 8)}${headMoved ? '   (moved — another lane committed; not a VOID, see PREREG I3)' : ''}`);
console.log(`  src   ${run.provStart?.src?.digest} -> ${run.provEnd?.src?.digest}   ${I3 ? 'UNCHANGED' : 'CHANGED — the run is VOID'}`);
console.log(`  arms  ${run.arms.length} in one invocation, all files present: ${oneRun}`);

console.log('\n── phase 1: the fan and criterion C ───────────────────────────────────────────');
console.log('  shot          enclosure  target  |e-t|    litFrac    modal rgb        share   exact%   C says');
for (const [s, r] of Object.entries(run.shots)) {
  const conv = Math.abs(r.enclosure - (r.target ?? NaN));
  const ex = calRows.find((c) => c.shot === s)?.exact;
  console.log(`  ${s.padEnd(13)} ${f2(r.enclosure).padStart(6)}  ${f2(r.target).padStart(6)}  ${f2(conv, 4).padStart(7)}  ` +
              `${f2(100 * r.litFrac, 3).padStart(8)}%  ${JSON.stringify(r.calib?.rgb).padEnd(16)} ` +
              `${f2(100 * r.calib?.share, 1).padStart(5)}%  ${f2(100 * ex, 2).padStart(6)}%   ` +
              `${r.litFrac >= BAR.litBar ? 'OPEN' : 'ROOFED'}`);
}
if (cBlind.length) console.log(`  criterion C is BLIND on: ${cBlind.join(', ')} — no pixel carried the calibration constant`);
console.log(`\n  threshold rule: eO ${f2(run.partition?.eO)} / eR ${f2(run.partition?.eR)} -> ` +
            (run.partition?.refuted ? `REFUTED (${run.partition.why})` : `T = ${T}, margin ${run.partition?.marginRays} of 5 rays`));

console.log('\n── I1: this scorer reproduces the frozen Python instrument ────────────────────');
for (const [k, a, b, d] of i1rows) console.log(`  ${String(k).padEnd(20)} py ${f2(a, 4).padStart(9)}  js ${f2(b, 4).padStart(9)}  |d| ${f2(d, 5)}`);
if (!i1rows.length) console.log('  shots/shold/ not on this machine — I1 is VOID');

console.log('\n── frame statistics, A0 -> A4 (and A3 global, where captured) ─────────────────');
/* `neut%` is reported because it is the axis nobody has looked at and it is large: the reference
   frame is 49.83% neutral (sat <= 0.15) against our daylight frames' ~17%, so "warm vs cool" is a
   split of half the reference's pixels and five sixths of ours. Not gated — no bar for it was
   registered and one invented here would be the mis-derivation §141.1 forbids. */
console.log('  shot          arm         dh      Vr     litS   shaS   warm%   cool%   neut%   dark%   sha');
for (const s of capturedShots) {
  for (const tag of ['A0-base', 'A3-global', 'A4-scoped']) {
    const f = fileOf(s, tag); if (!f || !existsSync(f)) continue;
    const fr = score(f).frame, r = roiOf(f, s);
    console.log(`  ${s.padEnd(13)} ${tag.padEnd(11)} ${f2(r?.dh, 1).padStart(6)} ${f2(r?.vratio, 3).padStart(6)} ` +
                `${f2(r?.lit?.s, 3).padStart(6)} ${f2(r?.sha?.s, 3).padStart(6)} ${f2(fr.warm_pct).padStart(6)} ` +
                `${f2(fr.cool_pct).padStart(7)} ${f2(100 - fr.warm_pct - fr.cool_pct).padStart(7)} ` +
                `${f2(fr.dark_pct).padStart(7)}   ${sha16(f)}`);
  }
}

console.log('\n── I5: does each scored ROI contain both key populations? ─────────────────────');
for (const r of I5rows) console.log(`  ${r.shot.padEnd(13)} lit ${f2(100 * r.lit, 2)}%  shaded ${f2(100 * r.sha, 2)}%  -> ${r.ok}`);

console.log('\n── the warm/cool guard registered before the run (PREREG §7) ──────────────────');
for (const s of openShots) {
  const p = P[s]; if (!p) continue;
  const absVerdict = NIGHT_SHOTS.has(s) ? 'n/a night'
    : !coolAbsApplies(s) ? 'n/a A0 already under the bar'
    : (coolAbs(s) ? 'PASS' : 'FAIL');
  console.log(`  ${s.padEnd(13)} cool% ${f2(p.a0.frame.cool_pct).padStart(6)} -> ${f2(p.a4.frame.cool_pct).padStart(6)}` +
              `   abs bar ${BAR.coolAbs} ${absVerdict.padEnd(29)}` +
              `   rel bar ${f2(BAR.coolRel * p.a0.frame.cool_pct)} ${coolRel(s) ? 'PASS' : 'FAIL'}`);
}

const guards = {
  'I1 instrument reproduces frozen scorer': I1,
  'I2 debugTerm(4) calibration exact':      I2,
  'I3 src digest unchanged across run':     I3 === null ? null : (I3 && oneRun),
  'I4 enclosure converged, outside band':   I4,
  'I5 ROIs contain both key populations':   I5,
  'C1 control MUST FIRE (dunes dh >= 20)':  C1,
  'C2 null A1 byte-identical to A0':        C2,
  'C3 restore A5 byte-identical to A0':     C3,
  'G0 scope separates and matches C':       G0,
  'G1 dunes dh <= 45 and -100 vs A0':       dhGuard('dunes'),
  'G2 hero  dh <= 45 and -100 vs A0':       dhGuard('hero'),
  'G3a dunes V ratio in band':              vGuard('dunes'),
  'G3b hero  V ratio in band':              vGuard('hero'),
  'G4a dunes shade sat vs A0':              satGuard('dunes'),
  'G4b hero  shade sat vs A0':              satGuard('hero'),
  'G5 roofed shots byte-identical':         G5,
  'G6 cool% >= 12.993 (daylight OPEN)':     G6,
  'G7 cool% >= 0.5 x A0 (all OPEN)':        G7,
};

const v = shipVerdict(guards);
console.log('\n── verdict ────────────────────────────────────────────────────────────────────');
for (const [k, s] of Object.entries(v.states)) console.log(`  ${s.padEnd(4)}  ${k}`);
console.log(verdictLine(v, `Lighting.TUNE.holdEnclose = ${T} + ToonMaterial.TUNE.shadowHold = 1`));
console.log('  (G8, the test suite, is run separately and reported in the RESULT.)');
process.exitCode = v.ship ? 0 : 1;
export { guards };
