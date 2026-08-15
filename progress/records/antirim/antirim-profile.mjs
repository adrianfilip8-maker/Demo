/**
 * ANTIRIM — why does Path A read +0.222 of its key-side band in LINEAR and about −0.19 in
 * DISPLAY on the same 7 SHADOW edges?
 *
 * RESULT-rim §4 exposed the arithmetic and did not explain it:
 *
 *     mean spike(off)       over SHADOW7 = +0.51 L      (display)
 *     Sscreen = off − screenoff          = +3.87 L      (Path B's display contribution)
 *  => mean spike(screenoff) over SHADOW7 = −3.36 L      (Path A alone, display)
 *     Rlin    = shadow/key linear ratio  = +0.222       (Path A alone, linear)
 *
 * This file measures, it does not adjudicate. NO BAR IS DRAWN HERE — §141.1 forbids drawing one
 * after candidate data exists, and the successor seal owns the bars. Every number below is a
 * per-pixel readout of frames that already exist in `progress/records/rim1/`. No capture, no
 * boot, no lock, no `src` edit.
 *
 *   node progress/records/antirim/antirim-profile.mjs [framesDir]     default progress/records/rim1
 *
 * ── The design of the comparison ─────────────────────────────────────────────────────────────
 * The three arms differ by CONTROL FLOW, not by tuning, and that is what makes the difference
 * interpretable (PostFX.js:2092 for `raw`, PostFX.js:1487 for `screenoff`):
 *
 *   raw        `debugRaw('scene')` blits `sceneRT` to the canvas and RETURNS. Everything after
 *              the scene draw is skipped: the normal prepass, the EDGE pass (which generates
 *              BOTH the post-process ink line `edge.r` AND Path B's rim mask `edge.g`), AO,
 *              bloom, the grade, AgX, the sRGB encode, Path B's add, the INK composite, the
 *              vignette, the dither and FXAA. What survives is the scene draw alone: toon
 *              shading including Path A's fresnel rim, plus the inverted-hull outline, which is
 *              GEOMETRY and therefore is in this buffer.
 *   screenoff  the whole composite runs; only `if (uEdgeEnabled > 0.5 && uRimStrength > 0.0)`
 *              is false, so Path B's add is skipped. Everything else — AO, bloom, grade, AgX,
 *              encode, post-process INK, vignette, FXAA — is present.
 *   off        shipped.
 *
 * So `screenoff − raw` IS the composite, isolated, and `off − screenoff` IS Path B, isolated.
 *
 * ── The modelled leg, and exactly how far it may be trusted ──────────────────────────────────
 * §D pushes the `raw` bytes through a VERBATIM COPY of `rim-offline.mjs`'s transcription of the
 * shipped display chain (PostFX.js:1424-1453 + passes/Common.js slyAgX), which that file
 * validated to 6.6e-12 L against tools/tonecurve.mjs. The copy is checked against its source's
 * own §3 table below, so a transcription drift is visible rather than assumed.
 *
 * That chain contains: exposure, lift, gain, split-tone, saturation, contrast, AgX, sRGB encode.
 * It does NOT contain AO, bloom, the post-process ink line, the vignette or FXAA. The vignette
 * is added here (it is a closed-form function of gl_FragCoord and costs nothing); AO, bloom, ink
 * and FXAA are NOT modelled and are exactly the residual §D reports. The following terms are
 * inert at the shipped TUNE and are therefore not in the residual either — read off `src`, not
 * measured here, and flagged as such wherever a conclusion leans on them:
 *
 *   chroma 0.0 (PostFX.js:883)  grain 0.0 (:905)  dispChromaHold 0.0 (:275)
 *   rimFloorOffCut 0.0 (:239)   fxInkCut 0.0 (:594)   contact[1] 0.0 (:416, gates uContact.y)
 *
 * The `raw` arm is an 8-bit blit of a half-float LINEAR target, so its quantum is 1/255 of
 * LINEAR — coarse in the darks. §D prints the display-L width of one raw byte at every measured
 * pixel, so no residual is read as signal unless it clears its own quantisation.
 */
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';
import { EDGES, profile, ray, L709, SEARCH, RIMW, EXCL, R12 } from '../rim/rim-edges.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = process.argv[2] || path.join(ROOT, 'progress/records/rim1');
const ARMS = ['off', 'screenoff', 'raw'];
const f = (v, w = 7, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d)).padStart(w);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

/* ── frames ────────────────────────────────────────────────────────────────────────────────── */
const IM = {};
for (const shot of ['night', 'sly-profile', 'hero']) {
  IM[shot] = {};
  for (const arm of ARMS) IM[shot][arm] = readPNG(path.join(DIR, `${shot}.${arm}.png`));
}
console.log(`ANTIRIM — ${path.relative(ROOT, DIR)}`);
for (const shot of Object.keys(IM)) {
  const s = ARMS.map((a) => `${a} ${IM[shot][a].w}x${IM[shot][a].h}x${IM[shot][a].ch}`).join('  ');
  console.log(`  ${shot.padEnd(12)} ${s}`);
}

/* ═══ the display chain — VERBATIM copy of rim-offline.mjs §3, plus the vignette ════════════ */
const M = (m, v) => [m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]];
const SRGB2020 = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.0880], [0.0433, 0.0113, 0.8956]];
const R2020SRGB = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
const INSET = [[0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859]];
const OUTSET = [[1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]];
const agxC = (x) => { const x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; };
const lin2srgb = (u) => (u <= 0.0031308 ? u * 12.92 : 1.055 * Math.pow(u, 1 / 2.4) - 0.055);
const srgb2lin = (u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
const LUMA = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function agx(c) {
  const minEv = -12.47393, maxEv = 4.026069;
  let v = M(INSET, M(SRGB2020, c)).map((q) => Math.max(q, 1e-10))
    .map((q) => (Math.log2(q) - minEv) / (maxEv - minEv)).map((q) => Math.min(1, Math.max(0, q)));
  v = M(OUTSET, v.map(agxC)).map((q) => Math.pow(Math.max(q, 0), 2.2));
  v = M(R2020SRGB, v);
  const lum = LUMA(v), mn = Math.min(...v);
  if (mn < 0) { const t = lum / (lum - mn); v = v.map((q) => lum + (q - lum) * t); }
  return v.map((q) => Math.min(1, Math.max(0, q)));
}
const T = { exposure: 0.95, lift: [0.006, 0.004, 0.010], gain: [1.035, 1.0, 0.985],
  splitShadow: [0x2a, 0x3f, 0x66].map((v) => srgb2lin(v / 255)),
  splitHighlight: [0xff, 0xd9, 0xa0].map((v) => srgb2lin(v / 255)),
  splitStrength: 0.16, splitRange: [0.04, 0.24], saturation: 1.30, contrast: 1.08 };
/** liftK = liftScale(TUNE.liftDayScale=0.35, dayAmount). 1 at night, 0.35 in daylight. */
function displayRGB(scene, liftK = 1) {
  let c = scene.map((q) => q * T.exposure);
  c = c.map((q, i) => Math.max(0, q + T.lift[i] * liftK * (1 - q))).map((q, i) => q * T.gain[i]);
  const l = LUMA(c);
  let tone = T.splitShadow.map((s, i) => s + (T.splitHighlight[i] - s) * ss(T.splitRange[0], T.splitRange[1], l));
  const tl = Math.max(1e-4, LUMA(tone)); tone = tone.map((q) => q / tl);
  c = c.map((q, i) => q + (q * tone[i] - q) * T.splitStrength)
    .map((q) => l + (q - l) * T.saturation)
    .map((q) => 0.18 * Math.pow(Math.max(q, 1e-6) / 0.18, T.contrast));
  return agx(c).map(lin2srgb);
}
const VIGNETTE = 0.16;                       // PostFX.js:877
const vigAt = (x, y, w, h) => {              // PostFX.js:1546, r2 = dot(vUv-0.5, vUv-0.5)
  const u = (x + 0.5) / w - 0.5, v = (y + 0.5) / h - 0.5;
  return 1 - VIGNETTE * ss(0.18, 0.95, (u * u + v * v) * 2.0);
};
const toByte = (v) => Math.round(255 * Math.min(1, Math.max(0, v)));
/** raw byte triple -> predicted display bytes, chain + vignette. NO AO, bloom, ink or FXAA. */
const predict = (rgb, liftK, vig) => displayRGB(rgb.map((q) => q / 255), liftK).map((q) => toByte(q * vig));
const DAY = { night: 0, 'sly-profile': 1, hero: 1 };   // PostFX.js:2334 — atm.dayAmount
const liftKOf = (shot) => 0.35 * DAY[shot] + (1 - DAY[shot]);

/* self-check: reproduce rim-offline.mjs §3's own table from this copy */
{
  const L100 = (b) => (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) / 2.55;
  const RIMLIN = [0x7f, 0xd4, 0xff].map((v) => srgb2lin(v / 255));
  const LAPIS = [0x1f, 0x4f, 0x96].map((v) => srgb2lin(v / 255));
  const rows = [];
  for (const s of [0.002, 0.005, 0.010, 0.020, 0.050, 0.100, 0.200, 0.400, 0.800]) {
    const base = LAPIS.map((q) => q * s / LUMA(LAPIS));
    const L0 = L100(displayRGB(base, 1).map(toByte));
    const d = [0.02, 0.05, 0.10].map((k) => L100(displayRGB(base.map((q, i) => q + k * RIMLIN[i]), 1).map(toByte)) - L0);
    rows.push(`  ${f(L0, 11, 1)}${d.map((r) => ('+' + r.toFixed(1)).padStart(10)).join('')}`);
  }
  console.log('\nTRANSCRIPTION SELF-CHECK — must equal rim-offline.mjs §3 column-for-column');
  console.log('  display L      +k=0.02   +k=0.05   +k=0.10');
  for (const r of rows) console.log(r);
}

/* ── the registered statistic, recomputed over an arbitrary L-array ─────────────────────────
   Mirrors rim-edges.mjs `profile()` exactly (SEARCH / RIMW / EXCL and the same tie-breaks) so a
   predicted profile is scored by the SAME instrument as a measured one. Cross-checked against
   `profile()` on every real arm below; a mismatch prints and is fatal to §D. */
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]); };
function statOf(Ls, inner) {
  const lo = Math.max(0, inner - SEARCH), hi = Math.min(Ls.length - 1, inner + SEARCH);
  let i0 = lo;
  for (let i = lo; i <= hi; i++) if (Ls[i] < Ls[i0]) i0 = i;
  let rim = null, rimAt = null;
  for (let i = Math.max(0, i0 - RIMW); i <= i0 - 1; i++) if (rim === null || Ls[i] > rim) { rim = Ls[i]; rimAt = i - i0; }
  const body = [], bg = [];
  for (let i = 0; i <= i0 - EXCL - 1; i++) body.push(Ls[i]);
  for (let i = i0 + EXCL + 1; i < Ls.length; i++) bg.push(Ls[i]);
  const BODY = body.length ? med(body) : null, BG = bg.length ? med(bg) : null;
  return { i0, pinned: i0 === lo || i0 === hi, RIM: rim, rimAt, BODY, BG, spike: rim !== null && BODY !== null ? rim - BODY : null };
}

/* ── profile every edge on every arm ───────────────────────────────────────────────────────── */
const P = {}, RAYS = {};
for (const arm of ARMS) { P[arm] = {}; RAYS[arm] = {}; }
for (const e of EDGES) {
  const k = `${e.shot}/${e.id}`;
  for (const arm of ARMS) { P[arm][k] = profile(IM[e.shot][arm], e); RAYS[arm][k] = ray(IM[e.shot][arm], e); }
}
const KEYS = EDGES.map((e) => `${e.shot}/${e.id}`);
const EOF_ = Object.fromEntries(EDGES.map((e) => [`${e.shot}/${e.id}`, e]));
/* §5 PF_EDGE dropped exactly one edge — night/torso-right, PINNED. Recomputed, not assumed. */
const KEPT = KEYS.filter((k) => P.off[k] && !P.off[k].pinned);
const SHAD = KEPT.filter((k) => EOF_[k].face === 'SHADOW');
const KEY5 = KEPT.filter((k) => EOF_[k].spike5);

/* ═══ §A — does the instrument's own landmark move between arms? ════════════════════════════ */
console.log('\n\n§A  THE LANDMARK — i0 (argmin L in ±6) per arm, in ray index and in frame pixels');
console.log('    A moving i0 means the three arms are not measuring the same 5 px.\n');
console.log('  edge                         face     i0 off / scr / raw     px off      px scr      px raw    inkL off  scr   raw   rimAt o/s/r');
for (const k of KEYS) {
  const e = EOF_[k];
  const cell = (arm) => {
    const p = P[arm][k]; if (!p) return '   —';
    return `${String(p.i0).padStart(3)}${p.pinned ? '*' : ' '}`;
  };
  const pxOf = (arm) => {
    const p = P[arm][k]; if (!p) return '     —    ';
    return `(${e.from[0] + e.dir[0] * p.i0},${e.from[1] + e.dir[1] * p.i0})`.padStart(11);
  };
  const inkOf = (arm) => f(P[arm][k]?.inkL, 6, 1);
  const rimAtOf = (arm) => (P[arm][k]?.rimAt ?? '—');
  console.log(`  ${k.padEnd(28)}${e.face.padEnd(8)}${cell('off')}/${cell('screenoff')}/${cell('raw')}   `
    + `${pxOf('off')}${pxOf('screenoff')}${pxOf('raw')}  ${inkOf('off')}${inkOf('screenoff')}${inkOf('raw')}`
    + `      ${rimAtOf('off')}/${rimAtOf('screenoff')}/${rimAtOf('raw')}`);
}
console.log('  * = PINNED (instrument-invalid on that arm)');

/* ═══ §B — the summary the successor already has, per edge rather than as a mean ════════════ */
console.log('\n\n§B  THE SUMMARY STATISTIC PER EDGE — spike, by arm. RESULT-rim quotes only the means.');
console.log('    raw is a LINEAR-domain statistic (bytes are the undecoded scene target).\n');
console.log('  edge                         face   spike off  spike scr   PathB=o−s   spike raw   BODY off  BODY scr  BODY raw');
for (const k of KEPT) {
  const e = EOF_[k], o = P.off[k], s = P.screenoff[k], r = P.raw[k];
  console.log(`  ${k.padEnd(28)}${e.face.padEnd(7)}${f(o.spike, 10)}${f(s.spike, 11)}${f(o.spike - s.spike, 12)}${f(r.spike, 12)}`
    + `${f(o.BODY, 11)}${f(s.BODY, 10)}${f(r.BODY, 10)}`);
}
const mSpk = (set, arm) => mean(set.map((k) => P[arm][k].spike));
console.log(`\n  SHADOW7  mean spike   off ${f(mSpk(SHAD, 'off'))}   screenoff ${f(mSpk(SHAD, 'screenoff'))}   `
  + `PathB ${f(mSpk(SHAD, 'off') - mSpk(SHAD, 'screenoff'))}   raw ${f(mSpk(SHAD, 'raw'))}   (n=${SHAD.length})`);
console.log(`  KEY5     mean spike   off ${f(mSpk(KEY5, 'off'))}   screenoff ${f(mSpk(KEY5, 'screenoff'))}   `
  + `PathB ${f(mSpk(KEY5, 'off') - mSpk(KEY5, 'screenoff'))}   raw ${f(mSpk(KEY5, 'raw'))}   (n=${KEY5.length})`);

/* ═══ §C — the per-pixel picture, which is the whole point ══════════════════════════════════ */
console.log('\n\n§C  PER-PIXEL PROFILES, indexed on i0(off). The 5 px the RIM statistic maximises over');
console.log('    are offsets −5..−1. dL is L − BODY(that arm): negative = darker than the body.\n');
function dump(k) {
  const e = EOF_[k], o = P.off[k], s = P.screenoff[k], r = P.raw[k];
  const ro = RAYS.off[k], rs = RAYS.screenoff[k], rr = RAYS.raw[k];
  console.log(`  ── ${k}   [${e.face}]   i0 off ${o.i0} / scr ${s.i0} / raw ${r.i0}   `
    + `BODY off ${f(o.BODY, 5, 1)} scr ${f(s.BODY, 5, 1)} raw ${f(r.BODY, 5, 1)}`);
  console.log('     off  px        L_off   dL_off |    L_scr   dL_scr |    L_raw   dL_raw |  PathB  |  screenoff rgb   raw rgb');
  for (let i = Math.max(0, o.i0 - 9); i <= Math.min(ro.length - 1, o.i0 + 5); i++) {
    const tag = i === o.i0 ? ' i0' : (i >= o.i0 - RIMW && i <= o.i0 - 1 ? ' **' : '   ');
    console.log(`   ${String(i - o.i0).padStart(4)}${tag} (${ro[i].x},${ro[i].y})`.padEnd(22)
      + `${f(ro[i].L, 8, 2)}${f(ro[i].L - o.BODY, 9, 2)} |${f(rs[i].L, 8, 2)}${f(rs[i].L - s.BODY, 9, 2)} |`
      + `${f(rr[i].L, 8, 2)}${f(rr[i].L - r.BODY, 9, 2)} |${f(ro[i].L - rs[i].L, 7, 2)}  |`
      + `  (${[rs[i].R, rs[i].G, rs[i].B].join(',')})`.padEnd(18) + `(${[rr[i].R, rr[i].G, rr[i].B].join(',')})`);
  }
  console.log('');
}
console.log('  ===== the 7 SHADOW edges =====\n');
for (const k of SHAD) dump(k);
console.log('  ===== the 5 KEY5 edges, as the control =====\n');
for (const k of KEY5) dump(k);

/* ═══ §D — how wide is the dark band, in each arm? ══════════════════════════════════════════ */
console.log('\n\n§D  DIP GEOMETRY — width of the sub-BODY dark band around i0, per arm.');
console.log('    d(i) = (BODY − L(i)) / (BODY − L(i0)); w50 = count of px in ±9 with d ≥ 0.5,');
console.log('    w25 with d ≥ 0.25. `inside` counts only offsets < 0 (the RIM window\'s side).\n');
console.log('  edge                         face  arm         BODY   L(i0)   w50  w25  inside50  inside25  d(−1) d(−2) d(−3) d(−4) d(−5)');
for (const k of [...SHAD, ...KEY5]) {
  const e = EOF_[k];
  for (const arm of ARMS) {
    const p = P[arm][k], rr = RAYS[arm][k];
    const depth = p.BODY - p.inkL;
    const d = (i) => (i < 0 || i >= rr.length || depth <= 0 ? 0 : (p.BODY - rr[i].L) / depth);
    let w50 = 0, w25 = 0, in50 = 0, in25 = 0;
    for (let i = Math.max(0, p.i0 - 9); i <= Math.min(rr.length - 1, p.i0 + 9); i++) {
      if (d(i) >= 0.5) { w50++; if (i < p.i0) in50++; }
      if (d(i) >= 0.25) { w25++; if (i < p.i0) in25++; }
    }
    console.log(`  ${(arm === 'off' ? k : '').padEnd(28)}${(arm === 'off' ? e.face : '').padEnd(6)}${arm.padEnd(11)}`
      + `${f(p.BODY, 6, 1)}${f(p.inkL, 8, 1)}${String(w50).padStart(6)}${String(w25).padStart(5)}`
      + `${String(in50).padStart(10)}${String(in25).padStart(10)}   `
      + [1, 2, 3, 4, 5].map((n) => f(d(p.i0 - n), 6, 2)).join(''));
  }
}

/* ═══ §E — the composite, isolated: predicted display from `raw` vs measured `screenoff` ════ */
console.log('\n\n§E  THE COMPOSITE, ISOLATED.  predict(raw) = grade+AgX+encode+vignette, i.e. the');
console.log('    display transform ALONE, with NO AO, NO bloom, NO post-process ink, NO FXAA.');
console.log('    residual = measured screenoff − predict(raw) is exactly those four terms plus');
console.log('    the raw arm\'s own 1/255-of-LINEAR quantum, whose display width is printed as ±q.\n');

/* cross-check statOf() against the registered profile() on real data before trusting §E */
{
  let bad = 0;
  for (const k of KEPT) for (const arm of ARMS) {
    const a = P[arm][k], b = statOf(RAYS[arm][k].map((q) => q.L), EOF_[k].inner);
    if (a.i0 !== b.i0 || Math.abs(a.spike - b.spike) > 1e-9 || Math.abs(a.BODY - b.BODY) > 1e-9) bad++;
  }
  console.log(`  statOf() vs registered profile(): ${bad === 0 ? 'IDENTICAL on all ' + (KEPT.length * 3) + ' (edge,arm) pairs'
    : 'MISMATCH on ' + bad + ' pairs — §E IS NOT TRUSTWORTHY'}\n`);
}

const predRows = [];
for (const k of [...SHAD, ...KEY5]) {
  const e = EOF_[k], liftK = liftKOf(e.shot), im = IM[e.shot].off;
  const rr = RAYS.raw[k], rs = RAYS.screenoff[k];
  const predL = [], qBand = [];
  for (let i = 0; i < rr.length; i++) {
    const vig = vigAt(rr[i].x, rr[i].y, im.w, im.h);
    const p0 = predict([rr[i].R, rr[i].G, rr[i].B], liftK, vig);
    const pUp = predict([rr[i].R + 1, rr[i].G + 1, rr[i].B + 1], liftK, vig);
    const pDn = predict([Math.max(0, rr[i].R - 1), Math.max(0, rr[i].G - 1), Math.max(0, rr[i].B - 1)], liftK, vig);
    predL.push(L709(...p0));
    qBand.push(0.5 * (L709(...pUp) - L709(...pDn)));
    rr[i].pred = p0;
  }
  const st = statOf(predL, e.inner);
  predRows.push({ k, e, st, predL, qBand });
  console.log(`  ── ${k}   [${e.face}]   predicted-display i0 ${st.i0} (measured screenoff i0 ${P.screenoff[k].i0})`);
  console.log(`     predicted  BODY ${f(st.BODY, 6, 2)}  RIM ${f(st.RIM, 6, 2)}  spike ${f(st.spike, 6, 2)}`
    + `     measured screenoff  BODY ${f(P.screenoff[k].BODY, 6, 2)}  RIM ${f(P.screenoff[k].RIM, 6, 2)}  spike ${f(P.screenoff[k].spike, 6, 2)}`);
  console.log('     off  |  pred L   meas L   resid    ±q  |  pred rgb        meas rgb        resid rgb');
  const i0 = P.off[k].i0;
  for (let i = Math.max(0, i0 - 8); i <= Math.min(rr.length - 1, i0 + 4); i++) {
    const tag = i === i0 ? ' i0' : (i >= i0 - RIMW && i <= i0 - 1 ? ' **' : '   ');
    const res = [rs[i].R - rr[i].pred[0], rs[i].G - rr[i].pred[1], rs[i].B - rr[i].pred[2]];
    console.log(`   ${String(i - i0).padStart(4)}${tag} |${f(predL[i], 8, 2)}${f(rs[i].L, 9, 2)}${f(rs[i].L - predL[i], 8, 2)}${f(qBand[i], 6, 2)}  |`
      + `  (${rr[i].pred.join(',')})`.padEnd(18) + `(${[rs[i].R, rs[i].G, rs[i].B].join(',')})`.padEnd(16)
      + `(${res.map((v) => (v > 0 ? '+' : '') + v).join(',')})`);
  }
  console.log('');
}
console.log('  edge                         face   pred spike  meas spike(scr)   pred−meas   pred BODY  meas BODY');
for (const r of predRows) {
  console.log(`  ${r.k.padEnd(28)}${r.e.face.padEnd(7)}${f(r.st.spike, 10)}${f(P.screenoff[r.k].spike, 16)}`
    + `${f(r.st.spike - P.screenoff[r.k].spike, 13)}${f(r.st.BODY, 12)}${f(P.screenoff[r.k].BODY, 11)}`);
}
{
  const sh = predRows.filter((r) => r.e.face === 'SHADOW'), ke = predRows.filter((r) => r.e.face === 'KEY');
  console.log(`\n  SHADOW7  mean predicted spike ${f(mean(sh.map((r) => r.st.spike)))}   vs measured screenoff ${f(mean(sh.map((r) => P.screenoff[r.k].spike)))}`);
  console.log(`  KEY5     mean predicted spike ${f(mean(ke.map((r) => r.st.spike)))}   vs measured screenoff ${f(mean(ke.map((r) => P.screenoff[r.k].spike)))}`);
}

/* ═══ §F — is the residual the INK pass? Its arithmetic is falsifiable in 3 channels ════════ */
console.log('\n\n§F  INK SIGNATURE.  PostFX.js:1526-1542 — ink = min(mix(inkCool,inkWarm,smoothstep(0.12,0.55,lum)), c)');
console.log('    then c = mix(c, ink, line*inkStrength), inkStrength 0.95, applied AFTER Path B and');
console.log('    BEFORE the vignette. It is per-channel min()-bounded, so it can only ever DARKEN.');
console.log('    Solving each channel for a = line*inkStrength: a = (p − m) / (p − ink), p = predicted');
console.log('    pre-ink display byte, m = measured. Three channels, ONE free parameter — if a single a');
console.log('    fits all three to within a byte or two the darkening has the ink pass\'s shape; if the');
console.log('    channels demand different a, something else is in there too. AO/bloom/FXAA are NOT in');
console.log('    p, so they contaminate this fit and are named again in the report rather than hidden.\n');
const INK_WARM = [0x1a, 0x12, 0x10], INK_COOL = [0x16, 0x10, 0x22];
console.log('  edge                        off   lum   inkC/W mix   a_R    a_G    a_B    spread   implied line');
for (const r of predRows) {
  const rr = RAYS.raw[r.k], rs = RAYS.screenoff[r.k], i0 = P.off[r.k].i0;
  for (let i = Math.max(0, i0 - 5); i <= Math.min(rr.length - 1, i0 + 1); i++) {
    const p = rr[i].pred, m = [rs[i].R, rs[i].G, rs[i].B];
    /* lum for the warm/cool choice is slyLuma of the DISPLAY value before the ink; use the
       predicted one, normalised 0..1, and flag that this is modelled not measured. */
    const lum = (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
    const t = ss(0.12, 0.55, lum);
    const ink = [0, 1, 2].map((c) => Math.min(INK_COOL[c] + (INK_WARM[c] - INK_COOL[c]) * t, p[c]));
    const a = [0, 1, 2].map((c) => (Math.abs(p[c] - ink[c]) < 1e-6 ? null : (p[c] - m[c]) / (p[c] - ink[c])));
    const def = a.filter((v) => v !== null);
    const spread = def.length ? Math.max(...def) - Math.min(...def) : null;
    console.log(`  ${(i === i0 - 5 ? r.k : '').padEnd(28)}${String(i - i0).padStart(3)}${f(lum, 7, 3)}   `
      + `(${ink.map((v) => v.toFixed(0)).join(',')})`.padEnd(13)
      + a.map((v) => f(v, 7, 3)).join('') + f(spread, 9, 3)
      + f(def.length ? mean(def) / 0.95 : null, 15, 3));
  }
}
console.log('\n  (a > 1 or a < 0 means the ink model alone cannot produce the measured value — the');
console.log('   residual there is not ink, or not only ink.)');

/* ═══ §G — how WIDE is Path A's band, in px, on each side? ══════════════════════════════════ */
console.log('\n\n§G  PATH A\'s BAND WIDTH, measured on the `raw` arm (linear, composite skipped).');
console.log('    n_up = how many of the 5 px the RIM statistic maximises over sit ABOVE BODY(raw).');
console.log('    run  = the contiguous run of those, counted outward from i0−1. The seal\'s statistic');
console.log('    is a MAX over the window and is blind to width; this is the width.\n');
console.log('  edge                         face   BODY raw   dL(−1)  dL(−2)  dL(−3)  dL(−4)  dL(−5)   n_up  run  peak dL  at');
const widths = { KEY: [], SHADOW: [] };
for (const k of [...SHAD, ...KEY5]) {
  const e = EOF_[k], p = P.raw[k], rr = RAYS.raw[k];
  const dl = [1, 2, 3, 4, 5].map((n) => (p.i0 - n >= 0 ? rr[p.i0 - n].L - p.BODY : null));
  const nUp = dl.filter((v) => v !== null && v > 0).length;
  let run = 0; for (const v of dl) { if (v !== null && v > 0) run++; else break; }
  const peak = Math.max(...dl.filter((v) => v !== null));
  const at = -(dl.indexOf(peak) + 1);
  widths[e.face].push({ k, nUp, run, peak });
  console.log(`  ${k.padEnd(28)}${e.face.padEnd(7)}${f(p.BODY, 9, 2)}   ${dl.map((v) => f(v, 8, 2)).join('')}`
    + `${String(nUp).padStart(6)}${String(run).padStart(5)}${f(peak, 9, 2)}${String(at).padStart(4)}`);
}
for (const face of ['SHADOW', 'KEY']) {
  const w = widths[face];
  console.log(`  ${face.padEnd(7)} mean n_up ${f(mean(w.map((q) => q.nUp)), 5)}   mean run ${f(mean(w.map((q) => q.run)), 5)}   mean peak dL ${f(mean(w.map((q) => q.peak)), 6)}`);
}

/* PEAK vs AREA. PREREG §7 M2's DOWNSTREAM band 0.112 is rim-offline §2's INTEGRATED shadow/lit
   ratio over N·V ∈ [0,0.40]. The instrument's `spike` is `max over 5 px − median BODY`, which is
   a PEAK, and rim-offline §2 prints a peak ratio too — 0.248. Both quantities are computed here,
   per shot then averaged exactly as §4 prescribes for Rlin, so the like-for-like comparison is
   visible. NO BAND IS MOVED: 0.112 is sealed and stays sealed (§141.1). This is the "a mis-aimed
   bar is recorded as mis-aimed" note the seal itself asks for. */
console.log('\n  PEAK vs AREA — the same rays, two statistics, per shot then averaged (§4\'s rule):');
console.log('  shot          KEY peak  SHADOW peak  peak ratio |  KEY area  SHADOW area  area ratio   (area = Σ positive dL over the 5 px)');
const ratios = { peak: [], area: [] };
for (const shot of ['hero', 'sly-profile']) {
  const agg = (face) => {
    const set = (face === 'KEY' ? KEY5 : SHAD).filter((k) => EOF_[k].shot === shot);
    const pk = [], ar = [];
    for (const k of set) {
      const p = P.raw[k], rr = RAYS.raw[k];
      const dl = [1, 2, 3, 4, 5].map((n) => (p.i0 - n >= 0 ? rr[p.i0 - n].L - p.BODY : 0));
      pk.push(Math.max(...dl));
      ar.push(dl.reduce((s, v) => s + Math.max(0, v), 0));
    }
    return { pk: mean(pk), ar: mean(ar) };
  };
  const K = agg('KEY'), S = agg('SHADOW');
  ratios.peak.push(S.pk / K.pk); ratios.area.push(S.ar / K.ar);
  console.log(`  ${shot.padEnd(14)}${f(K.pk, 8)}${f(S.pk, 13)}${f(S.pk / K.pk, 12, 3)} |${f(K.ar, 10)}${f(S.ar, 13)}${f(S.ar / K.ar, 12, 3)}`);
}
console.log(`  MEAN                                  ${f(mean(ratios.peak), 12, 3)} |                        ${f(mean(ratios.area), 12, 3)}`);
console.log(`  rim-offline §2 predicts               ${(0.2475).toFixed(3)} (peak) |                        ${(0.112).toFixed(3)} (area, = PREREG §7 M2's DOWNSTREAM band)`);
{ /* does the KEY-side raw rim clip? a clipped key peak would UNDERSTATE the key denominator */
  let clipped = 0, tot = 0;
  for (const k of KEY5) {
    const p = P.raw[k], rr = RAYS.raw[k];
    for (let n = 1; n <= 5; n++) { const q = rr[p.i0 - n]; if (!q) continue; tot++; if (q.R >= 255 || q.G >= 255 || q.B >= 255) clipped++; }
  }
  console.log(`  KEY5 raw band pixels at 255 in any channel: ${clipped} of ${tot}  (a clipped key peak would make both ratios read HIGH)`);
}

/* ═══ §H — could AO alone do it? A forward fit, symmetric to §F's ═══════════════════════════ */
console.log('\n\n§H  AO AS THE ALTERNATIVE, forward-fitted.  PostFX.js:1414-1417 — scene *= mix(1, uAOTint*uAODepth, occ),');
console.log('    in LINEAR, BEFORE the grade. tintColor() normalises #2a3f66 to peak channel 1, so the');
console.log('    multiplier at occ is (1−0.827occ, 1−0.741occ, 1−0.580occ): AO kills RED hardest and BLUE');
console.log('    least, and can only ever move a pixel TOWARD blue. Both models are scanned over their one');
console.log('    parameter and the best per-model max-channel error is reported. This is the test that');
console.log('    separates them; the sign of the chromatic error is not a matter of taste.\n');
const AOTINT = [42 / 102, 63 / 102, 102 / 102].map((q) => q * 0.42);   // tintColor + aoDepth 0.42
function fitAO(rawRGB, meas, liftK, vig) {
  let best = null;
  for (let i = 0; i <= 200; i++) {
    const occ = i / 200;
    const lin = rawRGB.map((q, c) => (q / 255) * (1 + occ * (AOTINT[c] - 1)));
    const p = displayRGB(lin, liftK).map((q) => toByte(q * vig));
    const err = Math.max(...[0, 1, 2].map((c) => Math.abs(p[c] - meas[c])));
    if (!best || err < best.err) best = { occ, p, err };
  }
  return best;
}
function fitInk(pre, meas, vig) {          // pre = predicted PRE-ink display bytes (chain+vignette)
  const preNoVig = pre.map((q) => q / vig);
  const lum = (0.2126 * preNoVig[0] + 0.7152 * preNoVig[1] + 0.0722 * preNoVig[2]) / 255;
  const t = ss(0.12, 0.55, lum);
  const ink = [0, 1, 2].map((c) => Math.min(INK_COOL[c] + (INK_WARM[c] - INK_COOL[c]) * t, preNoVig[c]));
  let best = null;
  for (let i = 0; i <= 200; i++) {
    const a = i / 200;
    const p = [0, 1, 2].map((c) => Math.round(vig * (preNoVig[c] + (ink[c] - preNoVig[c]) * a)));
    const err = Math.max(...[0, 1, 2].map((c) => Math.abs(p[c] - meas[c])));
    if (!best || err < best.err) best = { a, p, err };
  }
  return best;
}
console.log('  edge                        off  measured rgb     INK-ONLY fit          AO-ONLY fit');
console.log('                                                    a     rgb        err   occ    rgb        err');
for (const r of predRows) {
  const rr = RAYS.raw[r.k], rs = RAYS.screenoff[r.k], i0 = P.off[r.k].i0;
  const liftK = liftKOf(r.e.shot), im = IM[r.e.shot].off;
  for (let i = Math.max(0, i0 - 3); i <= i0 - 1; i++) {
    const vig = vigAt(rr[i].x, rr[i].y, im.w, im.h);
    const meas = [rs[i].R, rs[i].G, rs[i].B];
    const fi = fitInk(rr[i].pred, meas, vig), fa = fitAO([rr[i].R, rr[i].G, rr[i].B], meas, liftK, vig);
    console.log(`  ${(i === i0 - 3 ? r.k : '').padEnd(28)}${String(i - i0).padStart(3)}  `
      + `(${meas.join(',')})`.padEnd(16) + `${f(fi.a, 5, 2)} (${fi.p.join(',')})`.padEnd(20) + `${String(fi.err).padStart(4)}`
      + `${f(fa.occ, 7, 2)} (${fa.p.join(',')})`.padEnd(20) + `${String(fa.err).padStart(4)}`);
  }
}

/* ═══ §I — could FXAA alone do it?  Run the shipped FXAA on the INK-FREE prediction ═════════ */
console.log('\n\n§I  FXAA AS THE ALTERNATIVE.  PostFX.js:1558-1592, transcribed and run on a 2D patch of the');
console.log('    ink-free PREDICTION. FXAA is a convex blend of bilinear taps of its input, so it cannot');
console.log('    put a pixel below the darkest thing within reach; the question is whether the ink-free');
console.log('    image has anything dark enough within reach. (The patch omits AO and bloom, as §E does.)\n');
const lumaF = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
function fxaaAt(sample, x, y) {   // sample(x,y) -> [r,g,b] in 0..1, bilinear
  const bil = (u, v) => {
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const g = (a, b) => sample(a, b);
    const c00 = g(x0, y0), c10 = g(x0 + 1, y0), c01 = g(x0, y0 + 1), c11 = g(x0 + 1, y0 + 1);
    return [0, 1, 2].map((c) => (c00[c] * (1 - fx) + c10[c] * fx) * (1 - fy) + (c01[c] * (1 - fx) + c11[c] * fx) * fy);
  };
  const NW = sample(x - 1, y - 1), NE = sample(x + 1, y - 1), SW = sample(x - 1, y + 1),
    SE = sample(x + 1, y + 1), Mc = sample(x, y);
  const lNW = lumaF(NW), lNE = lumaF(NE), lSW = lumaF(SW), lSE = lumaF(SE), lM = lumaF(Mc);
  const lMin = Math.min(lM, lNW, lNE, lSW, lSE), lMax = Math.max(lM, lNW, lNE, lSW, lSE);
  if (lMax - lMin < 0.06 * lMax) return Mc;
  let dir = [-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE))];
  const dirReduce = Math.max((lNW + lNE + lSW + lSE) * 0.25 * 0.03125, 1 / 128);
  const rcp = 1 / (Math.min(Math.abs(dir[0]), Math.abs(dir[1])) + dirReduce);
  dir = dir.map((q) => Math.min(8, Math.max(-8, q * rcp)));
  const A = [0, 1, 2].map((c) => 0.5 * (bil(x + dir[0] * (1 / 3 - 0.5), y + dir[1] * (1 / 3 - 0.5))[c]
    + bil(x + dir[0] * (2 / 3 - 0.5), y + dir[1] * (2 / 3 - 0.5))[c]));
  const B = [0, 1, 2].map((c) => A[c] * 0.5 + 0.25 * (bil(x - dir[0] * 0.5, y - dir[1] * 0.5)[c]
    + bil(x + dir[0] * 0.5, y + dir[1] * 0.5)[c]));
  const lB = lumaF(B);
  return (lB < lMin || lB > lMax) ? A : B;
}
console.log('  edge                        off   meas L   pred L (no ink)  FXAA(pred) L   FXAA moved   min L in ±4 patch');
for (const r of predRows) {
  const e = r.e, im = IM[e.shot].off, raw = IM[e.shot].raw, liftK = liftKOf(e.shot);
  const i0 = P.off[r.k].i0, rr = RAYS.raw[r.k], rs = RAYS.screenoff[r.k];
  const cacheP = new Map();
  const predAt = (x, y) => {                      // ink-free predicted display, 0..1, cached
    const kk = `${x},${y}`;
    if (cacheP.has(kk)) return cacheP.get(kk);
    const cx = Math.min(im.w - 1, Math.max(0, x)), cy = Math.min(im.h - 1, Math.max(0, y));
    const o = (cy * raw.w + cx) * raw.ch;
    const v = predict([raw.data[o], raw.data[o + 1], raw.data[o + 2]], liftK, vigAt(cx, cy, im.w, im.h)).map((q) => q / 255);
    cacheP.set(kk, v); return v;
  };
  for (let i = Math.max(0, i0 - 3); i <= i0 - 1; i++) {
    const x = rr[i].x, y = rr[i].y;
    const out = fxaaAt(predAt, x, y).map((q) => q * 255);
    let mn = Infinity;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mn = Math.min(mn, L709(...predAt(x + dx, y + dy).map((q) => q * 255)));
    console.log(`  ${(i === i0 - 3 ? r.k : '').padEnd(28)}${String(i - i0).padStart(3)}${f(rs[i].L, 9)}${f(L709(...rr[i].pred), 17)}`
      + `${f(L709(...out), 15)}${f(L709(...out) - L709(...rr[i].pred), 13)}${f(mn, 20)}`);
  }
}

/* ═══ §J — an INDEPENDENT, MEASURED check that the ink pass is capable of this ══════════════ */
console.log('\n\n§J  INDEPENDENT CHECK — `progress/records/inkw-before/`, a one-boot dt=0 A/B from 2026-08-09');
console.log('    with a PROVEN null arm (base vs null = 0 px) that carries REAL `noink` and `noao` arms.');
console.log('    IT IS A DIFFERENT FRAME ON A DIFFERENT TREE — the registered edges do not land on the');
console.log('    same features there (checked: 4 of 8 hero edges PIN), so it cannot attribute anything in');
console.log('    rim1. What it CAN do is measure, on the character, how much each pass darkens, with no');
console.log('    model in the way. Subject mask = pixels where `nochar` differs from `base`.\n');
{
  const dir = path.join(ROOT, 'progress/records/inkw-before');
  const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
  console.log('  shot          pass    px darkened ≥1 L on subject   median ΔL   p90    p99    max');
  for (const shot of ['hero', 'sly-closeup', 'combat']) {
    let base, arms;
    try {
      base = readPNG(path.join(dir, `1280x720-${shot}-base.png`));
      arms = { ink: readPNG(path.join(dir, `1280x720-${shot}-noink.png`)),
        ao: readPNG(path.join(dir, `1280x720-${shot}-noao.png`)),
        hull: readPNG(path.join(dir, `1280x720-${shot}-nohull.png`)),
        nochar: readPNG(path.join(dir, `1280x720-${shot}-nochar.png`)) };
    } catch { console.log(`  ${shot}: frames not present`); continue; }
    const subj = new Uint8Array(base.w * base.h);
    let nsub = 0;
    for (let i = 0; i < base.w * base.h; i++) {
      const p = i * base.ch, q = i * arms.nochar.ch;
      if (base.data[p] !== arms.nochar.data[q] || base.data[p + 1] !== arms.nochar.data[q + 1]
        || base.data[p + 2] !== arms.nochar.data[q + 2]) { subj[i] = 1; nsub++; }
    }
    for (const [name, im] of [['ink', arms.ink], ['ao', arms.ao], ['hull', arms.hull]]) {
      const d = [];
      for (let i = 0; i < base.w * base.h; i++) {
        if (!subj[i]) continue;
        const p = i * base.ch, q = i * im.ch;
        const dl = L709(im.data[q], im.data[q + 1], im.data[q + 2]) - L709(base.data[p], base.data[p + 1], base.data[p + 2]);
        if (dl >= 1) d.push(dl);
      }
      console.log(`  ${(name === 'ink' ? shot : '').padEnd(14)}${name.padEnd(8)}${String(d.length).padStart(10)} of ${nsub} subject px`
        + `${f(pct(d, 0.5), 13)}${f(pct(d, 0.9), 7)}${f(pct(d, 0.99), 7)}${f(d.length ? Math.max(...d) : null, 7)}`);
    }
  }
}

