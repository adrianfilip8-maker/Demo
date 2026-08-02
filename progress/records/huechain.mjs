#!/usr/bin/env node
/**
 * huechain — does an authored albedo HUE survive to the display frame, and by how much?
 *
 * The critic's finding #2 (RESULT-critic5 §3.2 / §4.2) is that 86.7% of chromatic pixels sit
 * in two 40 deg hue windows, and its action is "put hue variety into albedo". Before authoring
 * anything I need to know whether an authored hue can *reach* the frame at all: a pixel is
 * light x albedo, and this project's chain applies a warm key, a cool shadow light, a split
 * tone, saturation 1.30 and AgX. If malachite green and yellow ochre both land inside one 40
 * deg window after all that, then albedo is the wrong lever and the finding routes elsewhere.
 *
 * The chain here is transcribed verbatim from scratchpad/pavegate.mjs, which is itself an
 * independent transcription of src/render/** and is validated against a real capture to
 * 3 display counts of b-r and 6 counts per channel on `WALL-SHADOW` (ADDENDUM1 §4a).
 *
 * SCOPE STAMP (§11) - the transforms between this number and the renderer, NOT implemented:
 *   GTAO screen-space occlusion (occ = 0); atmospheric haze; bloom; vignette; FXAA; grain;
 *   screen-space rim and ink (edge terms); surface fresnel rim (silhouette-gated, 0 on a
 *   plane); normal-map perturbation of ndl; the shadow map itself (keyF is a parameter, not a
 *   lookup); per-texel albedo distribution (a single hex stands in for a painted region);
 *   and mip minification (a band narrower than a texel at range averages into its neighbours -
 *   that is the sub-pixel question, handled separately in huelab).
 *
 * Usage: node huechain.mjs
 */
import { createAtmosphereState, evalAtmosphere } from '/home/user/Demo/src/render/Atmosphere.js';

/* ---------------- committed constants, re-transcribed by grep this session ---------------- */
const TM = {
  shadowWash: 0.05, shadowSat: -0.35, bounceGain: 0.42, bakedAO: 0.55,
  fillSkyMix: 0.70, shadowTintPeak: 0.52, shadowBounceMix: 0.05, shadowTeal: 0.15,
  ambIntensity: 0.52, shadowFloor: 0.125, aoKey: 0.0,
};
const PAL = { shadowHue: 0x2a3f66, turquoise: 0x2fa8a0 };
const PF = {
  exposure: 0.95, contrast: 1.08, saturation: 1.30, pivot: 0.18,
  lift: [0.006, 0.004, 0.010], gain: [1.035, 1.0, 0.985],
  splitStrength: 0.16, splitRange: [0.04, 0.24],
  splitShadow: 0x2a3f66, splitHighlight: 0xffd9a0,
};

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => { c = Math.max(c, 0); return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
const hexLin = (h) => [s2l(((h >> 16) & 255) / 255), s2l(((h >> 8) & 255) / 255), s2l((h & 255) / 255)];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const grey = (c) => { const l = lum(c); return [l, l, l]; };
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const M_SRGB_TO_2020 = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.0880, 0.8956]];
const M_2020_TO_SRGB = [[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]];
const INSET = [[0.856627153315983, 0.0951212405381588, 0.0482516061458583],
               [0.137318972929847, 0.761241990602591, 0.101439036467562],
               [0.11189821299995, 0.0767994186031903, 0.811302368396859]];
const OUTSET = [[1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
                [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
                [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]];
const mv = (m, v) => [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);
const agxC = (x) => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; };
function agx(c) {
  const minEv = -12.47393, maxEv = 4.026069;
  let v = mv(M_SRGB_TO_2020, c);
  v = mv(INSET, v);
  v = v.map((x) => Math.max(x, 1e-10)).map(Math.log2)
       .map((x) => Math.min(1, Math.max(0, (x - minEv) / (maxEv - minEv)))).map(agxC);
  v = mv(OUTSET, v);
  v = v.map((x) => Math.pow(Math.max(x, 0), 2.2));
  v = mv(M_2020_TO_SRGB, v);
  const L = lum(v), mn = Math.min(...v);
  if (mn < 0 && L > mn) v = lerp(v, [L, L, L], Math.min(1, -mn / (L - mn)));
  return v.map((x) => Math.min(1, Math.max(0, x)));
}
function grade(cIn, { saturation = PF.saturation, splitStrength = PF.splitStrength } = {}) {
  let c = scl(cIn, PF.exposure);
  c = c.map((x, i) => Math.max(0, x + PF.lift[i] * (1 - x)));
  c = c.map((x, i) => x * PF.gain[i]);
  const l = lum(c);
  let tone = lerp(hexLin(PF.splitShadow), hexLin(PF.splitHighlight), smoothstep(PF.splitRange[0], PF.splitRange[1], l));
  tone = scl(tone, 1 / Math.max(1e-4, lum(tone)));
  c = lerp(c, mul(c, tone), splitStrength);
  c = lerp([l, l, l], c, saturation);
  c = c.map((x) => PF.pivot * Math.pow(Math.max(x, 1e-6) / PF.pivot, PF.contrast));
  c = agx(c);
  c = c.map(l2s);
  return c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255));
}

/* --------- hue / chroma exactly as the critic's M11 defines them (sRGB bytes) ------------- */
function hueOf(d) {
  const r = d[0], g = d[1], b = d[2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
  if (dl === 0) return null;
  let h;
  if (mx === r) h = 60 * (((g - b) / dl) % 6);
  else if (mx === g) h = 60 * ((b - r) / dl + 2);
  else h = 60 * ((r - g) / dl + 4);
  return (h + 360) % 360;
}
const chroma = (d) => Math.max(...d) - Math.min(...d);

/* ---------------- the light chain ---------------------------------------------------------- */
function chainAt(tod) {
  const A = createAtmosphereState();
  evalAtmosphere(tod, A);
  const c3 = (x) => [x.r, x.g, x.b];
  const keyCol = c3(A.keyColor), keyI = A.keyIntensity;
  const keyLum = lum(keyCol) * keyI;
  const skyCol = c3(A.hemiSky), gndCol = c3(A.hemiGround), ambI = A.ambientIntensity;
  const tintBlend = lerp(hexLin(PAL.shadowHue), hexLin(PAL.turquoise), TM.shadowTeal);
  const tintLum = lum(tintBlend);
  const kAsk = (A.shadowFloor ?? TM.shadowFloor) * keyLum / Math.max(tintLum, 1e-4);
  const maxK = TM.shadowTintPeak / Math.max(...tintBlend);
  const kUsed = Math.min(kAsk, maxK);
  const bl = lum(gndCol);
  const shadowLight = scl(lerp(scl(gndCol, bl > 1e-4 ? tintLum / bl : 1), tintBlend, 1 - TM.shadowBounceMix), kUsed);
  const fillAt = (ny) => {
    const bounceLeg = lerp(gndCol, scl(skyCol, lum(gndCol) / Math.max(lum(skyCol), 1e-4)), TM.fillSkyMix);
    return scl(lerp(scl(bounceLeg, TM.bounceGain), skyCol, smoothstep(-0.72, 0.55, ny)), ambI);
  };
  return { keyCol, keyI, shadowLight, fillAt, A };
}

function shade(ch, alb, { ny = 0.2, ao = 0.95, keyF = 0 } = {}) {
  const aoEff = 1 + (ao - 1) * TM.bakedAO;
  const lumA = lum(alb);
  const albShadow = lerp([lumA, lumA, lumA], alb, 1 + TM.shadowSat).map((v) => Math.min(1, Math.max(0, v)));
  const shadowMix = 1 - keyF;
  const albAmb = lerp(alb, albShadow, shadowMix);
  const fill = ch.fillAt(ny), shad = ch.shadowLight;
  return add(add(add(
    scl(mul(alb, scl(ch.keyCol, ch.keyI)), keyF * (1 + (aoEff - 1) * TM.aoKey)),
    mul(albAmb, scl(fill, aoEff))),
    mul(albShadow, scl(shad, shadowMix * (0.55 + 0.45 * aoEff)))),
    scl(shad, TM.shadowWash * shadowMix * aoEff));
}

/* ---------------- the candidate pigments ---------------------------------------------------
 * AGENTS.md §2.2's own palette, plus the two stone families they would sit on. The material
 * `color` multiplier is the consumer's (src/world/Architecture.js RECIPES) and is applied in
 * linear, which is where three.js multiplies map x color.
 */
const HG_WALL_COL = 0xd6a874;      // Architecture RECIPES.hieroglyph_wall.color
const COL_COL = 0xd8a468;          // .column_papyrus.color
const PLASTER_COL = 0xe4d3ab;      // .plaster_painted.color

const CANDIDATES = [
  ['sandstone mid  (control)', 0xc9915a, HG_WALL_COL],
  ['lime  light    (control)', 0xf0e3c8, PLASTER_COL],
  ['ochre  #d4823a', 0xd4823a, HG_WALL_COL],
  ['red    #a83828', 0xa83828, HG_WALL_COL],
  ['gold   #e8b942', 0xe8b942, HG_WALL_COL],
  ['malachite #2f8f5a', 0x2f8f5a, HG_WALL_COL],
  ['turquoise #2fa8a0', 0x2fa8a0, HG_WALL_COL],
  ['lapis  #1f4f96', 0x1f4f96, HG_WALL_COL],
  ['white  #f2e8d4', 0xf2e8d4, HG_WALL_COL],
  ['black  #241a16', 0x241a16, HG_WALL_COL],
  ['malachite on column', 0x2f8f5a, COL_COL],
  ['malachite on plaster', 0x2f8f5a, PLASTER_COL],
  ['malachite, NO matcol', 0x2f8f5a, 0xffffff],
];

const ch = chainAt(0.80);
console.log('=== huechain: authored albedo -> display hue, tod 0.80 (the daylight shots) ===');
console.log('regimes: keyF 1.00 = full sun · 0.35 = ramp mid band · 0.00 = fully shadowed\n');
const header = 'pigment                    | matcol  |  lit rgb        H    C |  mid rgb        H    C |  shade rgb      H    C';
console.log(header);
console.log('-'.repeat(header.length));
const table = [];
for (const [name, hex, matcol] of CANDIDATES) {
  const alb = mul(hexLin(matcol), hexLin(hex));
  const cells = [];
  const rec = { name, hex, matcol, h: {}, c: {} };
  for (const keyF of [1.0, 0.35, 0.0]) {
    const d = grade(shade(ch, alb, { keyF, ny: 0.0 }));
    const h = hueOf(d), c = chroma(d);
    rec.h[keyF] = h; rec.c[keyF] = c;
    cells.push(`(${d.join(',').padEnd(12)}) ${h === null ? ' n/a' : h.toFixed(0).padStart(4)} ${String(c).padStart(4)}`);
  }
  table.push(rec);
  console.log(`${name.padEnd(26)} | ${matcol.toString(16).padStart(6, '0')}  | ${cells.join(' | ')}`);
}

/* --- the settling question: do the pigments separate in hue after the chain? -------------- */
console.log('\n=== hue separation, chromatic cells only (C >= 8, the critic\'s chromatic gate) ===');
for (const keyF of [1.0, 0.35, 0.0]) {
  const hs = table.filter((r) => r.c[keyF] >= 8).map((r) => ({ n: r.name, h: r.h[keyF] }));
  hs.sort((a, b) => a.h - b.h);
  console.log(`keyF ${keyF.toFixed(2)}  n=${hs.length}  ` + hs.map((x) => `${x.h.toFixed(0)}`).join(' '));
  // best-two-40deg-window concentration over these cells, uniformly weighted
  const conc = bestTwo(hs.map((x) => x.h), hs.map(() => 1));
  console.log(`         spread ${(hs.length ? hs[hs.length - 1].h - hs[0].h : 0).toFixed(0)} deg   equal-weight conc(2x40) ${conc.toFixed(3)}`);
}

/** Share of weight inside the best pair of 40-degree windows (union). The critic's M11. */
export function bestTwo(hues, weights, W = 40, step = 5) {
  const tot = weights.reduce((a, b) => a + b, 0);
  if (!tot) return 0;
  const starts = [];
  for (let s = 0; s < 360; s += step) starts.push(s);
  const inW = (h, s) => { const d = (h - s + 360) % 360; return d < W; };
  let best = 0;
  for (let i = 0; i < starts.length; i++) {
    for (let j = i; j < starts.length; j++) {
      let acc = 0;
      for (let k = 0; k < hues.length; k++) if (inW(hues[k], starts[i]) || inW(hues[k], starts[j])) acc += weights[k];
      if (acc > best) best = acc;
    }
  }
  return best / tot;
}
