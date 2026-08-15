/**
 * PREREG-rim §1-§3 — reproduces EVERY number in the seal's derivation. No capture, no lock, no
 * boot: it reads committed PNGs and parses the shipped constants' values out of this file's own
 * transcription of `src`. Run it before trusting anything in the PREREG.
 *
 *   node progress/records/rim/rim-offline.mjs [framesDir]      default shots/r12
 *
 * Three sections, in the order the seal argues them:
 *
 *   §1  THE DEFECT      the 21 registered edges profiled on the frames, and the counts the
 *                       critic's claim is checked against
 *   §2  PATH A          the surface fresnel rim's own lit-vs-shadow response, from
 *                       toon.glsl.js:1029-1031 / 1189-1190 at the shipped TUNE values
 *   §3  THE SPACE       the display transform's GAIN on a small additive linear increment, from
 *                       PostFX.js:1424-1453 + passes/Common.js slyAgX
 *
 * ── The one thing this file is NOT allowed to be used for ────────────────────────────────────
 * §3's transcription omits AO and bloom (PostFX.js:1405-1421), which are per-pixel and cannot be
 * had offline. Checked against KNOWN_ISSUES §333's own measurement it reproduces the DIRECTION of
 * the chroma loss and under-predicts its SIZE (linear chroma 0.873 -> 0.55 at display L 137, a 37%
 * loss, against §333's measured 76.5%). So it is quoted for the SIGN and the RANK of the gain and
 * never for an absolute prediction, and no acceptance band in PREREG §7 is derived from it. That
 * self-check runs below and prints, so the limitation is visible every time rather than remembered.
 */
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';
import { EDGES, profile, SPIKE_L, R12 } from './rim-edges.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = process.argv[2] || path.join(ROOT, 'shots/r12');
const f = (v, w = 6, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d)).padStart(w);

/* ═══ §1 — THE DEFECT ══════════════════════════════════════════════════════════════════════ */
console.log(`§1  THE DEFECT — 21 registered edges on ${path.relative(ROOT, DIR)}\n`);
console.log('  edge                          face    BODY     BG    RIM  spike    sep  dCool  RIM rgb        r12');
const ims = {}, rows = [];
for (const e of EDGES) {
  const key = `${e.shot}/${e.id}`;
  if (!(e.shot in ims)) {
    try { ims[e.shot] = readPNG(path.join(DIR, `${e.shot}.png`)); }
    catch (err) { ims[e.shot] = null; console.log(`  ${key.padEnd(28)}  NO FRAME (${err.message})`); }
  }
  if (!ims[e.shot]) continue;
  const r = profile(ims[e.shot], e);
  if (!r) { console.log(`  ${key.padEnd(28)}  RAY OFF-FRAME`); continue; }
  rows.push({ key, e, r });
  console.log(`  ${key.padEnd(28)}${e.face.padEnd(8)}${f(r.BODY)}${f(r.BG)}${f(r.RIM)}${f(r.spike)}`
    + `${f(r.sep)}${f(r.dCool, 7, 0)}  (${r.rimRGB.join(',')})`.padEnd(24)
    + `${f(R12[key], 6)}${r.pinned ? '   PINNED — instrument-invalid' : ''}`);
}
const valid = rows.filter((q) => !q.r.pinned);
const spiking = valid.filter((q) => q.r.spike >= SPIKE_L);
const shadow = valid.filter((q) => q.e.face === 'SHADOW');
const key5 = valid.filter((q) => q.e.spike5);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const noSpike = valid.filter((q) => q.r.spike < SPIKE_L).map((q) => q.r.spike);
console.log(`\n  valid edges                     ${valid.length} (of ${rows.length} registered)`);
console.log(`  spiking at >= ${SPIKE_L.toFixed(1)} L             ${spiking.length}   ${spiking.map((q) => q.key).join(', ')}`);
console.log(`  ... of which KEY-facing         ${spiking.filter((q) => q.e.face === 'KEY').length} / ${spiking.length}`);
console.log(`  SHADOW-facing edges spiking     ${shadow.filter((q) => q.r.spike >= SPIKE_L).length} / ${shadow.length}   (max spike ${f(Math.max(...shadow.map((q) => q.r.spike)), 5)} L)`);
console.log(`  KEY5 mean spike                 ${f(mean(key5.map((q) => q.r.spike)), 5, 2)} L`);
console.log(`  bimodal gap                     highest NO ${f(Math.max(...noSpike), 5)} .. lowest YES ${f(Math.min(...spiking.map((q) => q.r.spike)), 5)}  (threshold ${SPIKE_L.toFixed(1)})`);
const nightRows = valid.filter((q) => q.e.shot === 'night');
if (nightRows.length) console.log(`  night |BODY-BG| separation      ${nightRows.map((q) => Math.abs(q.r.BODY - q.r.BG).toFixed(1)).join(' / ')} L`);
const warm = spiking.filter((q) => q.r.rimRGB[2] <= q.r.rimRGB[0]).length;
console.log(`  spiking bands that are WARM     ${warm} / ${spiking.length}   (a key highlight would be; #7fd4ff is not)`);

/* ═══ §2 — PATH A, the surface fresnel rim's own lit-vs-shadow response ════════════════════ */
const P = 3.1, SHADEFLOOR = 0.55, WRAPLO = 0.45;   // ToonMaterial TUNE.rimPower / toon.glsl.js:1189/1190
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rimA = (ndv, wrap, sh) => ss(0.26, 0.58, Math.pow(1 - ndv, P) * (0.60 + 0.40 * wrap))
  * (SHADEFLOOR + (1 - SHADEFLOOR) * sh) * (WRAPLO + (1 - WRAPLO) * wrap);
let aL = 0, aS = 0;
for (let i = 0; i <= 4000; i++) { const v = 0.40 * i / 4000; aL += rimA(v, 1, 1); aS += rimA(v, 0, 0); }
const onset = (t) => 1 - Math.pow(t, 1 / P);
console.log('\n\n§2  PATH A — toon.glsl.js:1029-1031 / 1189-1190 at the shipped constants (rimSil = 1)\n');
console.log(`  peak amplitude   LIT ${rimA(0, 1, 1).toFixed(4)}   SHADOW ${rimA(0, 0, 0).toFixed(4)}   ratio ${(rimA(0, 0, 0) / rimA(0, 1, 1)).toFixed(3)}`);
console.log(`  band onset       LIT N.V ${onset(0.26).toFixed(3)}      SHADOW N.V ${onset(0.26 / 0.60).toFixed(3)}`);
console.log(`  band saturation  LIT N.V ${onset(0.58).toFixed(3)}      SHADOW N.V ${onset(0.58 / 0.60).toFixed(3)}`);
console.log(`  AREA over N.V in [0,0.40]   LIT ${(aL / 4000 * 0.40).toFixed(4)}   SHADOW ${(aS / 4000 * 0.40).toFixed(4)}   ratio ${(aS / aL).toFixed(3)}   <- PREREG §7 M2 band`);

/* ═══ §3 — THE SPACE, the display transform's gain on an additive linear increment ═════════ */
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
function agx(c) {
  const minEv = -12.47393, maxEv = 4.026069;
  let v = M(INSET, M(SRGB2020, c)).map((q) => Math.max(q, 1e-10))
    .map((q) => (Math.log2(q) - minEv) / (maxEv - minEv)).map((q) => Math.min(1, Math.max(0, q)));
  v = M(OUTSET, v.map(agxC)).map((q) => Math.pow(Math.max(q, 0), 2.2));
  v = M(R2020SRGB, v);
  const lum = LUMA(v), mn = Math.min(...v);
  if (mn < 0) { const t = lum / (lum - mn); v = v.map((q) => lum + (q - lum) * t); }   // Common.js:266+
  return v.map((q) => Math.min(1, Math.max(0, q)));
}
const T = { exposure: 0.95, lift: [0.006, 0.004, 0.010], gain: [1.035, 1.0, 0.985],
  splitShadow: [0x2a, 0x3f, 0x66].map((v) => srgb2lin(v / 255)),
  splitHighlight: [0xff, 0xd9, 0xa0].map((v) => srgb2lin(v / 255)),
  splitStrength: 0.16, splitRange: [0.04, 0.24], saturation: 1.30, contrast: 1.08 };
function display(scene) {                                    // PostFX.js COMPOSITE_FRAG 1424-1453
  let c = scene.map((q) => q * T.exposure);
  c = c.map((q, i) => Math.max(0, q + T.lift[i] * (1 - q))).map((q, i) => q * T.gain[i]);
  const l = LUMA(c);
  let tone = T.splitShadow.map((s, i) => s + (T.splitHighlight[i] - s) * ss(T.splitRange[0], T.splitRange[1], l));
  const tl = Math.max(1e-4, LUMA(tone)); tone = tone.map((q) => q / tl);
  c = c.map((q, i) => q + (q * tone[i] - q) * T.splitStrength)
    .map((q) => l + (q - l) * T.saturation)
    .map((q) => 0.18 * Math.pow(Math.max(q, 1e-6) / 0.18, T.contrast));
  return agx(c).map(lin2srgb).map((q) => Math.round(255 * Math.min(1, Math.max(0, q))));
}
const L100 = (b) => (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) / 2.55;
const RIMLIN = [0x7f, 0xd4, 0xff].map((v) => srgb2lin(v / 255));    // uRimColor, stored LINEAR
const LAPIS = [0x1f, 0x4f, 0x96].map((v) => srgb2lin(v / 255));     // §2.2 LAPIS — the costume

console.log('\n\n§3  THE SPACE — display-L gain of a FIXED additive LINEAR rim increment vs base level\n');
console.log('  display L of base   +k=0.02   +k=0.05   +k=0.10    gain (dL per unit linear, at k=0.02)');
for (const s of [0.002, 0.005, 0.010, 0.020, 0.050, 0.100, 0.200, 0.400, 0.800]) {
  const base = LAPIS.map((q) => q * s / LUMA(LAPIS));
  const L0 = L100(display(base));
  const d = [0.02, 0.05, 0.10].map((k) => L100(display(base.map((q, i) => q + k * RIMLIN[i]))) - L0);
  console.log(`  ${f(L0, 15)}${d.map((r) => ('+' + r.toFixed(1)).padStart(10)).join('')}${(d[0] / 0.02).toFixed(0).padStart(12)}`);
}
console.log('\n  => the gain is MONOTONICALLY DECREASING in the base level. A shadow-side rim of the');
console.log('     same scene-linear magnitude arrives MORE visible, not less. The display transform');
console.log('     cannot be what removes it. KNOWN_ISSUES §333 measured CHROMA on a BRIGHT pixel;');
console.log('     this is LUMINANCE on a DARK one, and the same curve runs the other way.');

/* the self-check that keeps §3 honest — §333's own numbers through this transcription */
const chroma = (v) => { const mx = Math.max(...v), mn = Math.min(...v); return mx > 1e-6 ? (mx - mn) / mx : 0; };
const probe = [0.127, 0.34, 1.0];                             // linear chroma 0.873, §333's figure
let best = null;
for (const s of [0.3, 0.4, 0.5, 0.6, 0.8, 1.2, 2.0]) {
  const b = display(probe.map((q) => q * s)), L = L100(b) * 2.55;
  if (!best || Math.abs(L - 136) < Math.abs(best.L - 136)) best = { s, b, L, c: chroma(b.map((q) => q / 255)) };
}
console.log(`\n  SELF-CHECK vs §333 — linear chroma ${chroma(probe).toFixed(3)} at display L ${best.L.toFixed(0)} bytes:`);
console.log(`    this transcription  display chroma ${best.c.toFixed(3)}  (${(100 * (1 - best.c / chroma(probe))).toFixed(1)}% loss)`);
console.log('    §333 MEASURED       display chroma 0.205  (76.5% loss)');
console.log('    => direction reproduced, SIZE under-predicted (AO and bloom are not modelled here).');
console.log('       Quote this section for the SIGN and RANK of the gain only. No PREREG §7 band');
console.log('       is derived from it — M2\'s two bands both come from §2, in linear.');
