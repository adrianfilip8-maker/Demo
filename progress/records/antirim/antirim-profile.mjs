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
