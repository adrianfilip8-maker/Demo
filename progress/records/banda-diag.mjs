/**
 * banda-diag.mjs — offline diagnosis of CRITIC-sbs1 gap #2: authored warm renders violet.
 *
 * OWNER: SHADING. Boots nothing, takes no lock, edits no src/**. Reads committed PNGs +
 * committed source only. Pattern: skynoise-diag.mjs (constants parsed OUT of the committed
 * source at runtime and asserted — the instrument REFUSES to run on a drifted tree rather
 * than print numbers about a tree that no longer exists).
 *
 *   node progress/records/banda-diag.mjs [frames|state|grade|chain|attrib|cand|gold|all]
 *
 * WHAT IT ANSWERS
 *   1. `frames` — reproduces CRITIC-sbs1 §3's hue/sat/warm-share measurements, rects verbatim,
 *      on the committed frames (cand1/frames/{hero,temple,interior}.base.png — the fx22 base
 *      arms, same-day siblings of CRITIC's lost 08-01 frames; sbs1/{sly-closeup,combat}.png —
 *      fresh 08-05 captures at 8640769 clean; gold1/traversal.png — newest tree). CRITIC's own
 *      numbers are quoted beside each for correspondence; where they diverge, the committed
 *      frame is the operative baseline (CRITIC's frames are lost to rollback).
 *   2. `state`  — reconstructs the exact shading uniform state per shot OFFLINE:
 *      evalAtmosphere(tod) → Lighting._publishKeyLight payload (keyBoost/ambientBoost wiring
 *      transcribed) → ToonMaterial.setKeyLight + _refreshShadowColor ports. Anchored on TWO
 *      committed numbers: keyLum per shot (ToonMaterial.js k-cap table: hero 2.424, temple
 *      2.544, interior 3.652, night 0.336) and the compose1 live boot readback of uShadowColor
 *      (0.096, 0.313, 0.497), KNOWN_ISSUES §132.3. Mismatch ⇒ REFUSE.
 *   3. `grade`  — CPU port of the PostFX composite grade (AO-tint multiply, exposure, lift,
 *      gain, split-tone, saturation, pivot contrast, AgX + gamut map, sRGB). Anchored on the
 *      committed calibration row at PostFX.js splitRange note (scene 0.02→L39 … 2.00→L227,
 *      itself validated against a rendered sclera). Mismatch > 1.5 L ⇒ REFUSE.
 *   4. `chain`  — per-texel scene→display port of the WHOLE route (toon.glsl.js diff assembly
 *      + grade) on authored-warm albedos under each shot's reconstructed light state, checked
 *      against the frame rect medians of mode 1. This is the mode that turns "the grade renders
 *      authored warm as violet" into named terms with line numbers.
 *   5. `attrib` — per-term attribution: each candidate term is toggled to its neutral form and
 *      the display-space hue/R−B/argmin move is quantified per texel class per shot.
 *   6. `cand`   — evaluates the PREREG-banda candidate lever values through the same chain and
 *      prints the predicted per-shot deltas the seal's bands are built from.
 *   7. `gold`   — the specular ceiling arithmetic for PREREG-goldlobe: what display L the
 *      shipped spec assembly can reach on hieroglyph_gilded, what the candidate term reaches,
 *      against the gold1 measured p99 185.1 / max 230.4 and the reference p99 239–244.
 *
 * METRIC CONVENTIONS (KNOWN_ISSUES §122.1: state the basis with every number)
 *   luma    Rec.709 on 0–255 display bytes: 0.2126R + 0.7152G + 0.0722B.
 *   hue     HSV degrees on display bytes; median over in-rect pixels with satHSV ≥ 0.04 unless
 *           a row says `allpx` (CRITIC's script is lost; the sat floor keeps near-neutral
 *           pixels from injecting quantised-hue noise into a median, and the sensitivity of
 *           every reproduced number to the floor {0, 0.04, 0.08} is printed once in `frames`).
 *   R−B     mean over ALL in-rect pixels (matches CRITIC's "mean R−B").
 *   warm%   share of in-rect pixels with R > B+10 AND L > 40 (CRITIC's warm-share convention).
 *   hue230-330%  share of ALL in-rect pixels whose hue lies in [230,330] AND sat ≥ 0.04.
 *   argmin  which display channel is lowest (G-darkest share = §115/§132.4's statistic).
 *
 * SIM FIDELITY, stated up front (the chain port's scope)
 *   Reproduces: the full toon diff assembly (key/fill/shadowMul/wash), albShadow (uShadowSat),
 *   subjWarmShade path, sss, spec, metalEnv, the shared-uniform state (_refreshShadowColor with
 *   teal blend, luma-matched bounce mix, floor/peak-cap), and the full composite grade
 *   including AgX + its gamut map. Does NOT reproduce: cast-shadow map content (sh is a texel
 *   PARAMETER swept over its range), triplanar detail perturbation (hue-neutral by
 *   construction — grain multiplies albedo by a scalar centred on 1), haze (off by default;
 *   the measured rects are 2–30 m where slyHaze < 0.02), surface rim (rimMag = 0 on planar
 *   patches by the silhouette gate — the walls measured here are planar; NOT true at arrises),
 *   screen-space rim/ink (edge-band only, excluded from rect medians by area), bloom
 *   (threshold 2.20 scene-linear — shade-register texels sit far below), vignette (hue-neutral
 *   multiply, ≤0.16, rect-centre ~1), grain (±2 L, cancels in medians), FXAA. Per-rect
 *   frame-vs-chain residuals are printed as the calibration every prediction must quote.
 *
 * DRIFT GUARD (§143.1): every constant embedded below is parsed out of the committed source at
 * runtime and asserted equal. Any mismatch prints the file/name/expected/found and exits 2.
 */

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { readPNG } from '../../tools/png.mjs';
import { SHOTS } from '../../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere, PALETTE, SHADOW_FLOOR } from '../../src/render/Atmosphere.js';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const REC = `${ROOT}/progress/records`;

/* ───────────────────────────── drift guard ───────────────────────────── */

const SRC = {
  toonMat: readFileSync(`${ROOT}/src/render/ToonMaterial.js`, 'utf8'),
  toonGlsl: readFileSync(`${ROOT}/src/render/shaders/toon.glsl.js`, 'utf8'),
  postfx: readFileSync(`${ROOT}/src/render/PostFX.js`, 'utf8'),
  common: readFileSync(`${ROOT}/src/render/passes/Common.js`, 'utf8'),
  lighting: readFileSync(`${ROOT}/src/render/Lighting.js`, 'utf8'),
  arch: readFileSync(`${ROOT}/src/world/Architecture.js`, 'utf8'),
};

let driftFail = 0;
let lineChecks = 0;                      // counted, not hardcoded — the header must not overstate
function need(file, re, name, expect, parse = parseFloat) {
  const m = SRC[file].match(re);
  if (!m) { console.error(`DRIFT: ${file} — pattern for ${name} not found (expected ${expect})`); driftFail++; return expect; }
  const got = parse(m[1]);
  const eq = typeof expect === 'number'
    ? Math.abs(got - expect) < 1e-9
    : String(got) === String(expect);
  if (!eq) { console.error(`DRIFT: ${file}.${name} = ${got}, instrument built for ${expect}`); driftFail++; }
  return got;
}
function needLine(file, needle, name) {
  lineChecks++;
  if (!SRC[file].includes(needle)) {
    console.error(`DRIFT: ${file} — load-bearing line for ${name} not found:\n  ${needle}`);
    driftFail++;
  }
}

/* ToonMaterial TUNE + PAL — the shade-side light chain */
const T = {
  bands: need('toonMat', /bands:\s*([\d.]+)/, 'bands', 3),
  termLo: need('toonMat', /termLo:\s*([\d.]+)/, 'termLo', 0.14),
  termHi: need('toonMat', /termHi:\s*([\d.]+)/, 'termHi', 0.52),
  termSoft: need('toonMat', /termSoft:\s*([\d.]+)/, 'termSoft', 0.024),
  shadowFloor: need('toonMat', /shadowFloor:\s*([\d.]+)/, 'shadowFloor', 0.125),
  shadowWash: need('toonMat', /shadowWash:\s*([\d.]+)/, 'shadowWash', 0.05),
  shadowSat: need('toonMat', /shadowSat:\s*(-?[\d.]+)/, 'shadowSat', -0.35),
  bounceGain: need('toonMat', /bounceGain:\s*([\d.]+)/, 'bounceGain', 0.42),
  fillSkyMix: need('toonMat', /fillSkyMix:\s*([\d.]+)/, 'fillSkyMix', 0.70),
  /* 0.50 → 0.65 and 0.52 → 0.62: banda2 SHIPPED (RESULT-banda2 §Ship shape). The guard fired
     on both when this file was next run, which is the guard doing its job — the numbers are
     re-based here, not the assertion loosened. `subjWarmShadeNightPin` and the per-frame gate
     publish line are asserted below, discharging RESULT-banda2's ship-time obligation. */
  subjWarmShade: need('toonMat', /subjWarmShade:\s*([\d.]+)/, 'subjWarmShade', 0.65),
  subjWarmShadeNightPin: need('toonMat', /subjWarmShadeNightPin:\s*([\d.]+)/, 'subjWarmShadeNightPin', 0.50),
  bakedAO: need('toonMat', /bakedAO:\s*([\d.]+)/, 'bakedAO', 0.55),
  shadowTintPeak: need('toonMat', /shadowTintPeak:\s*([\d.]+)/, 'shadowTintPeak', 0.62),
  keyIntensity: need('toonMat', /keyIntensity:\s*([\d.]+)/, 'keyIntensity', 2.55), // boot value; LIGHTING republishes
  shadowBounceMix: need('toonMat', /shadowBounceMix:\s*([\d.]+)/, 'shadowBounceMix', 0.05),
  shadowBounceMixLit: need('toonMat', /shadowBounceMixLit:\s*([\d.]+)/, 'shadowBounceMixLit', 0.05),
  shadowDepth0: need('toonMat', /shadowDepth:\s*\[([\d.]+)/, 'shadowDepth[0]', 0.45),
  shadowDepth1: need('toonMat', /shadowDepth:\s*\[[\d.]+,\s*([\d.]+)\]/, 'shadowDepth[1]', 0.85),
  shadowTeal: need('toonMat', /shadowTeal:\s*([\d.]+)/, 'shadowTeal', 0.15),
  spec: need('toonMat', /\n  spec:\s*([\d.]+)/, 'spec', 0.25),
  gloss: need('toonMat', /\n  gloss:\s*([\d.]+)/, 'gloss', 32),
  sss: need('toonMat', /\n  sss:\s*([\d.]+)/, 'sss', 0.2),
  metalGain: need('toonMat', /metalGain:\s*([\d.]+)/, 'metalGain', 0.62),
  ambIntensity: need('toonMat', /ambIntensity:\s*([\d.]+)/, 'ambIntensity', 0.52), // dead knob; LIGHTING republishes
};
const PAL = {
  sun: need('toonMat', /\n  sun:\s*0x([0-9a-f]+)/, 'PAL.sun', 'ffd9a0', String),
  fillSky: need('toonMat', /fillSky:\s*0x([0-9a-f]+)/, 'PAL.fillSky', '6fa8d8', String),
  bounce: need('toonMat', /\n  bounce:\s*0x([0-9a-f]+)/, 'PAL.bounce', 'e8a852', String),
  shadowHue: need('toonMat', /shadowHue:\s*0x([0-9a-f]+)/, 'PAL.shadowHue', '2a3f66', String),
  turquoise: need('toonMat', /turquoise:\s*0x([0-9a-f]+)/, 'PAL.turquoise', '2fa8a0', String),
  sandstoneMid: need('toonMat', /sandstoneMid:\s*0x([0-9a-f]+)/, 'PAL.sandstoneMid', 'c9915a', String),
  wrapWarm: need('toonMat', /wrapWarm:\s*0x([0-9a-f]+)/, 'PAL.wrapWarm', 'ffb07a', String),
  goldSpec: need('toonMat', /goldSpec:\s*0x([0-9a-f]+)/, 'PAL.goldSpec', 'fffbe8', String),
};

/* toon.glsl.js — the exact assembly lines this port transcribes (presence, not value) */
needLine('toonGlsl', 'float hemi = smoothstep( -0.72, 0.55, Nw.y );', 'hemi window');
needLine('toonGlsl', 'vec3 diff = alb * keyRad * key * mix( 1.0, ao, uAoKey )', 'diff term 1 (key)');
needLine('toonGlsl', 'albAmb * slyFillX * ao', 'diff term 2 (fill)');
needLine('toonGlsl', 'albShadow * slyShadX * shadowMix * mix( 0.55, 1.0, ao )', 'diff term 3 (shadow mult)');
needLine('toonGlsl', 'slyShadX * uShadowWash * shadowMix * ao', 'diff term 4 (wash)');
needLine('toonGlsl', 'diff *= mix( 1.0, 0.20, slyMetal );', 'metal diffuse kill');
needLine('toonGlsl', 'albShadow = clamp( mix( vec3( lumA ), alb, 1.0 + uShadowSat ), 0.0, 1.0 )', 'albShadow');
needLine('toonGlsl', 'float glossP = max( uGloss * ( 1.0 - 0.6 * rgh ), 4.0 );', 'glossP');
needLine('toonGlsl', 'float specStep = smoothstep( 0.30, 0.52, lobe ) + 0.35 * smoothstep( 0.02, 0.30, lobe );', 'specStep');
needLine('toonGlsl', 'float specAmt = uSpec * ( 1.0 - 0.75 * rgh ) * mix( 1.0, 3.4, slyMetal );', 'specAmt');
needLine('toonGlsl', 'vec3 specTint = mix( uSpecColor, alb * 2.0 + uSpecColor * 0.25, slyMetal );', 'specTint');
needLine('toonGlsl', 'metalEnv = alb * env * ( slyMetal * uMetalGain * ef ) * mix( 0.35, 1.0, sh ) * ao;', 'metalEnv');
needLine('toonGlsl', 'vec3  slyShadD  = mix( uShadowColorLit, uShadowColor,', 'depth-dependent bounce');
/* banda2's shipped night gate — the publish line RESULT-banda2 §Ship-shape says this guard
   must assert once it lands. If it disappears, every "night is pinned" claim below is void. */
needLine('toonMat', 'u.uSubjWarmShade.value = TUNE.subjWarmShade +', 'banda2 night gate publish');
needLine('toonMat', '(TUNE.subjWarmShadeNightPin - TUNE.subjWarmShade) * Math.min(1, Math.max(0, nightAmount));', 'banda2 night gate lerp');
/* litwarm: the two lines the lit-side attribution stands on. Term 1 is the ONLY term that
   carries `key`; the fill term is NOT gated by shadowMix, which is why it reaches lit pixels
   (that asymmetry is the whole `lit` mode). */
needLine('toonGlsl', 'vec3 keyRad = uKeyColor * uKeyIntensity;', 'keyRad assembly');
needLine('toonGlsl', 'vec3 fill = mix( bounceLeg * uBounceGain, uSkyColor, hemi ) * uAmbIntensity;', 'fill assembly');

/* PostFX TUNE — the grade */
const G = {
  exposure: need('postfx', /exposure:\s*([\d.]+)/, 'exposure', 0.95),
  toneShoulder: need('postfx', /toneShoulder:\s*([\d.]+)/, 'toneShoulder', 1.0),
  contrast: need('postfx', /contrast:\s*([\d.]+)/, 'contrast', 1.08),
  saturation: need('postfx', /saturation:\s*([\d.]+)/, 'saturation', 1.30),
  lift: SRC.postfx.match(/lift:\s*\[([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/).slice(1, 4).map(Number),
  gain: SRC.postfx.match(/gain:\s*\[([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/).slice(1, 4).map(Number),
  splitShadow: need('postfx', /splitShadow:\s*0x([0-9a-f]+)/, 'splitShadow', '2a3f66', String),
  splitHighlight: need('postfx', /splitHighlight:\s*0x([0-9a-f]+)/, 'splitHighlight', 'ffd9a0', String),
  splitShadowTeal: need('postfx', /splitShadowTeal:\s*([\d.]+)/, 'splitShadowTeal', 0.0),
  splitStrength: need('postfx', /splitStrength:\s*([\d.]+)/, 'splitStrength', 0.16),
  splitRange: SRC.postfx.match(/splitRange:\s*\[([\d.]+),\s*([\d.]+)\]/).slice(1, 3).map(Number),
  aoStrength: need('postfx', /aoStrength:\s*([\d.]+)/, 'aoStrength', 0.62),
  aoDepth: need('postfx', /aoDepth:\s*([\d.]+)/, 'aoDepth', 0.42),
  aoTint: need('postfx', /aoTint:\s*0x([0-9a-f]+)/, 'aoTint', '2a3f66', String),
  aoTintTeal: need('postfx', /aoTintTeal:\s*([\d.]+)/, 'aoTintTeal', 0.0),
  aoTintNeutral: need('postfx', /aoTintNeutral:\s*([\d.]+)/, 'aoTintNeutral', 0.0),
  pivot: need('postfx', /SLY_PIVOT = ([\d.]+)/, 'SLY_PIVOT', 0.18),
};
if (Math.abs(G.lift[0] - 0.006) > 1e-9 || Math.abs(G.lift[1] - 0.004) > 1e-9 || Math.abs(G.lift[2] - 0.010) > 1e-9) { console.error(`DRIFT: lift = ${G.lift}`); driftFail++; }
if (Math.abs(G.gain[0] - 1.035) > 1e-9 || Math.abs(G.gain[1] - 1.0) > 1e-9 || Math.abs(G.gain[2] - 0.985) > 1e-9) { console.error(`DRIFT: gain = ${G.gain}`); driftFail++; }
if (Math.abs(G.splitRange[0] - 0.04) > 1e-9 || Math.abs(G.splitRange[1] - 0.24) > 1e-9) { console.error(`DRIFT: splitRange = ${G.splitRange}`); driftFail++; }

/* Common.js AgX — poly + EV window (values transcribed below must match) */
need('common', /minEv = (-[\d.]+)/, 'minEv', -12.47393);
need('common', /maxEv = ([\d.]+)/, 'maxEv', 4.026069);
needLine('common', '+ 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4', 'AgX poly hi');
needLine('common', '- 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232', 'AgX poly lo');
needLine('common', 'if ( mn < 0.0 && lum > mn ) color = mix( color, vec3( lum ), min( 1.0, -mn / ( lum - mn ) ) );', 'gamut map');

/* Lighting wiring facts the state port depends on */
need('lighting', /keyBoost:\s*([\d.]+)/, 'keyBoost', 1.0);
need('lighting', /ambientBoost:\s*([\d.]+)/, 'ambientBoost', 1.0);
need('lighting', /encloseStrength:\s*([\d.]+)/, 'encloseStrength', 0.0);
needLine('lighting', 'p.intensity = A.keyIntensity * TUNE.keyBoost;', 'key publish');
needLine('lighting', 'p.ambient.intensity = A.ambientIntensity * TUNE.ambientBoost * (this._fillSky ?? 1);', 'ambient publish');
needLine('lighting', 'tint: this.shadowTint, floor: SHADOW_FLOOR', 'tint publish');
if (Math.abs(SHADOW_FLOOR - 0.14) > 1e-9) { console.error(`DRIFT: Atmosphere.SHADOW_FLOOR = ${SHADOW_FLOOR}`); driftFail++; }
if (PALETTE.shadowHue !== 0x2a3f66) { console.error(`DRIFT: Atmosphere PALETTE.shadowHue`); driftFail++; }

/* Architecture recipe params the gold mode uses */
needLine('arch', 'hieroglyph_gilded:   { color: 0xdcae5e, rough: 0.55, spec: 0.55, gloss: 64', 'gilded recipe');
needLine('arch', "metal: r.metal ? (r.metalAmount ?? 0.85) : 0", 'metalAmount default');
/* litwarm: the whole `lit` diagnosis rests on architecture running the wrap leg at ZERO.
   Assert it, and assert the per-material uniforms it flows through. If ARCHITECTURE ships a
   value, PREREG-litwarm's §1.4 is describing a tree that no longer exists ⇒ refuse. */
needLine('arch', 'sss: 0.0,', 'Architecture wrap OFF (the litwarm premise)');
needLine('toonMat', 'uSss:            { value: o.sss },', 'per-material uSss');
needLine('toonMat', 'wrapColor: hex(opts.wrapColor ?? opts.sssColor, PAL.wrapWarm),', 'wrap colour default = PAL.wrapWarm');
needLine('toonGlsl', 'vec3 sss = alb * uSssColor * keyRad * ( sssAmt * uSss * 2.4 * sh );', 'wrap leg assembly');

if (driftFail) {
  console.error(`\n${driftFail} drift failure(s). This instrument describes a tree that no longer exists — re-derive before trusting any number it prints.`);
  process.exit(2);
}

/* ───────────────────────────── small math ───────────────────────────── */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lum3 = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); }
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mul3 = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function hexLin(hex) { const c = new THREE.Color(typeof hex === 'string' ? parseInt(hex, 16) : hex); return [c.r, c.g, c.b]; }
function srgbToLin(u) { const c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linToSrgb1(c) { c = Math.max(c, 0); return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

function hsv(r, g, b) { // display bytes → [hueDeg, sat, v]
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx === 0 ? 0 : d / mx, mx / 255];
}
const median = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
function circMedianDeg(a) {
  if (!a.length) return NaN;
  // hue populations here are unimodal well away from 0/360 (violet 230-330, warm 10-60);
  // plain median after unwrap around the circular mean is enough and stated.
  let sx = 0, sy = 0;
  for (const h of a) { sx += Math.cos(h * Math.PI / 180); sy += Math.sin(h * Math.PI / 180); }
  const c = Math.atan2(sy, sx) * 180 / Math.PI;
  const un = a.map((h) => { let d = h - c; while (d > 180) d -= 360; while (d < -180) d += 360; return d; });
  let m = median(un) + c;
  while (m < 0) m += 360; while (m >= 360) m -= 360;
  return m;
}

/* ───────────────────────────── frames mode ───────────────────────────── */

function rectStats(im, [x0, y0, x1, y1], { satFloor = 0.04 } = {}) {
  const hues = [], sats = [], Ls = [], huesAll = [];
  let n = 0, rb = 0, warm = 0, dark40 = 0, hueViolet = 0, gMin = 0, satHi = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * im.ch;
    const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const [h, s] = hsv(r, g, b);
    n++; rb += r - b; Ls.push(L);
    if (r > b + 10 && L > 40) warm++;
    if (L < 40) dark40++;
    if (s >= satFloor) { hues.push(h); sats.push(s); if (h >= 230 && h <= 330) hueViolet++; }
    huesAll.push(h);
    if (g <= r && g <= b) gMin++;
    if (L > 60) satHi.push(s);
  }
  // body population: pixels in the upper half of the rect's luma distribution — the wall/
  // surface body ABOVE the ink/AO/crevice mixture that drags a whole-rect median cool.
  const medLv = median(Ls);
  const bodyHues = [], bodySats = [];
  let bodyRmB = 0, bodyN = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * im.ch;
    const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (L < medLv) continue;
    const [h, s] = hsv(r, g, b);
    bodyN++; bodyRmB += r - b;
    if (s >= satFloor) { bodyHues.push(h); bodySats.push(s); }
  }
  return {
    n,
    medHue: circMedianDeg(hues), medHueAll: circMedianDeg(huesAll),
    medSat: median(sats), medL: medLv,
    meanRmB: rb / n, warmPct: 100 * warm / n, below40Pct: 100 * dark40 / n,
    huePct230_330: 100 * hueViolet / n, gDarkPct: 100 * gMin / n,
    satShare: hues.length / n,
    bodyHue: circMedianDeg(bodyHues), bodySat: median(bodySats), bodyRmB: bodyRmB / Math.max(bodyN, 1),
  };
}

const FRAME_JOBS = [
  { name: 'hero.beam (CRITIC: hue 279, sat .447, medL 36, 84.2% in 230-330)', file: `${REC}/cand1/frames/hero.base.png`, rect: [300, 330, 750, 430] },
  { name: 'hero.rustFlank (CRITIC: hue 20, L 42)', file: `${REC}/cand1/frames/hero.base.png`, rect: [280, 380, 380, 450] },
  { name: 'hero.arch (CRITIC: 49.2% below L40)', file: `${REC}/cand1/frames/hero.base.png`, rect: [200, 300, 900, 600] },
  { name: 'temple.litColumns (CRITIC: hue 287, mean R−B −1.2)', file: `${REC}/cand1/frames/temple.base.png`, rect: [80, 260, 200, 420] },
  { name: 'interior.leftWall (CRITIC: hue 267/sat .455)', file: `${REC}/cand1/frames/interior.base.png`, rect: [60, 80, 320, 400] },
  { name: 'interior.rightWall (CRITIC: hue 268/sat .452)', file: `${REC}/cand1/frames/interior.base.png`, rect: [1050, 100, 1250, 500] },
  { name: 'interior.frame (CRITIC: warm% 16.2 vs ref 31.0)', file: `${REC}/cand1/frames/interior.base.png`, rect: [0, 0, 1280, 720] },
  { name: 'closeup.tailBands (CRITIC: hue 231, R−B −34.2)', file: `${REC}/sbs1/sly-closeup.png`, rect: [630, 290, 780, 410] },
  { name: 'closeup.legs (CRITIC: hue 253, R−B −15.4, medL 53)', file: `${REC}/sbs1/sly-closeup.png`, rect: [560, 350, 650, 520] },
  { name: 'combat.figure (CRITIC: mass medL 199.7 medSat 0.165)', file: `${REC}/cand1/../../records/sbs1/combat.png`, rect: [360, 390, 720, 670] },
  { name: 'traversal.sandstoneJambs (gold1 drift check; gildlit: sandstone RmB p50 −32)', file: `${REC}/gold1/traversal.png`, rect: [850, 260, 1000, 400] },
];

function modeFrames() {
  console.log('\n═══ frames — CRITIC-sbs1 §3 reproduced on committed frames (their frames are lost; committed = operative) ═══');
  const cache = new Map();
  for (const j of FRAME_JOBS) {
    if (!cache.has(j.file)) cache.set(j.file, readPNG(j.file));
    const im = cache.get(j.file);
    const s = rectStats(im, j.rect);
    console.log(`\n${j.name}\n  rect ${JSON.stringify(j.rect)}  n ${s.n}`);
    console.log(`  medHue ${s.medHue.toFixed(1)} (all-px ${s.medHueAll.toFixed(1)}; sat-cov ${(100 * s.satShare).toFixed(0)}%)  medSat ${s.medSat.toFixed(3)}  medL ${s.medL.toFixed(1)}`);
    console.log(`  meanR−B ${s.meanRmB.toFixed(1)}  warm% ${s.warmPct.toFixed(1)}  <L40% ${s.below40Pct.toFixed(1)}  hue230-330% ${s.huePct230_330.toFixed(1)}  G-darkest% ${s.gDarkPct.toFixed(1)}`);
    console.log(`  body (L≥medL): hue ${s.bodyHue.toFixed(1)}  sat ${s.bodySat?.toFixed(3)}  R−B ${s.bodyRmB.toFixed(1)}`);
  }
  // sat-floor sensitivity, printed once (convention recovery honesty)
  const im = cache.get(`${REC}/cand1/frames/hero.base.png`);
  for (const f of [0, 0.04, 0.08]) {
    const s = rectStats(im, [300, 330, 750, 430], { satFloor: f });
    console.log(`\nsatFloor sensitivity hero.beam @${f}: medHue ${s.medHue.toFixed(1)}`);
  }
  // combat bright-mass convention: CRITIC counted the desat-bright figure mass (27,382 px)
  const imC = readPNG(`${REC}/sbs1/combat.png`);
  const [x0, y0, x1, y1] = [360, 390, 720, 670];
  const sats = [], Ls = [];
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * imC.w + x) * imC.ch;
    const r = imC.data[i], g = imC.data[i + 1], b = imC.data[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (L >= 160) { const [, s] = hsv(r, g, b); sats.push(s); Ls.push(L); n++; }
  }
  console.log(`\ncombat bright mass (L≥160 in figure rect, OUR convention — CRITIC's exact mask lost): n ${n}, medL ${median(Ls)?.toFixed(1)}, medSat ${median(sats)?.toFixed(3)}`);
}

/* ───────────────────────────── state mode ───────────────────────────── */

/* Ports of ToonMaterial.setKeyLight + _refreshShadowColor, driven by evalAtmosphere. */
function lightState(tod, knobs = {}) {
  const K = { ...T, ...knobs };
  const A = createAtmosphereState();
  evalAtmosphere(tod, A);
  const st = {
    tod,
    keyColor: [A.keyColor.r, A.keyColor.g, A.keyColor.b],
    keyIntensity: A.keyIntensity * 1.0,                       // keyBoost 1.0 (asserted)
    skyColor: [A.hemiSky.r, A.hemiSky.g, A.hemiSky.b],
    bounceColor: [A.hemiGround.r, A.hemiGround.g, A.hemiGround.b],
    ambIntensity: A.ambientIntensity * 1.0 * 1,               // ambientBoost 1.0, fillSky 1 (enclose 0)
    nightAmount: A.nightAmount,
    keyDir: [A.keyDir.x, A.keyDir.y, A.keyDir.z],
    shadowFloorPayload: A.shadowFloor,                        // published; setKeyLight takes min(TUNE, payload)
  };
  st.keyLum = lum3(st.keyColor) * st.keyIntensity;

  // _refreshShadowColor (ToonMaterial.js:1522-1620), verbatim in JS
  const shadowFloor = Math.min(K.shadowFloor, st.shadowFloorPayload);
  const tint = hexLin(PAL.shadowHue);
  const turq = hexLin(PAL.turquoise);
  const tintBlend = mix3(tint, turq, K.shadowTeal);
  const tintLum = lum3(tintBlend);
  let k = (shadowFloor * st.keyLum) / Math.max(tintLum, 1e-4);
  const peak = Math.max(...tintBlend);
  const maxK = K.shadowTintPeak / Math.max(peak, 1e-4);
  st.kAsked = k; st.kUsed = Math.min(k, maxK);
  k = st.kUsed;
  const bl = lum3(st.bounceColor);
  const bScale = bl > 1e-4 ? tintLum / bl : 1;
  const bounceScaled = scale3(st.bounceColor, bScale);
  st.shadowColor = scale3(mix3(bounceScaled, tintBlend, 1 - K.shadowBounceMix), k);
  st.shadowColorLit = scale3(mix3(bounceScaled, tintBlend, 1 - K.shadowBounceMixLit), k);
  return st;
}

const SHOT_TODS = {};
for (const [name, s] of Object.entries(SHOTS)) if (s && typeof s.tod === 'number') SHOT_TODS[name] = s.tod;

function modeState() {
  console.log('\n═══ state — uniform reconstruction per shot (evalAtmosphere → publish → setKeyLight → _refreshShadowColor) ═══');
  const anchors = { hero: 2.424, temple: 2.544, courtyard: 2.433, combat: 2.474, interior: 3.652, night: 0.336, guard: 0.336 };
  let anchorFail = 0;
  for (const shot of ['hero', 'temple', 'courtyard', 'combat', 'interior', 'sly-closeup', 'traversal', 'night', 'guard']) {
    const tod = SHOT_TODS[shot];
    if (tod === undefined) { console.log(`  ${shot}: no tod in SHOTS`); continue; }
    const st = lightState(tod);
    const sc = st.shadowColor.map((v) => v.toFixed(3)).join(', ');
    console.log(`  ${shot.padEnd(12)} tod ${tod}  keyLum ${st.keyLum.toFixed(3)}  night ${st.nightAmount.toFixed(3)}  kAsked ${st.kAsked.toFixed(2)} kUsed ${st.kUsed.toFixed(3)}  uShadowColor (${sc})  ambI ${st.ambIntensity.toFixed(3)}`);
    if (anchors[shot] !== undefined && Math.abs(st.keyLum - anchors[shot]) > 0.01) {
      console.error(`  ANCHOR FAIL: ${shot} keyLum ${st.keyLum.toFixed(3)} vs committed ${anchors[shot]} (ToonMaterial k-cap table)`);
      anchorFail++;
    }
  }
  /* Live-readback anchors. The §132.3 compose1 anchor (0.096, 0.313, 0.497) was taken at
     shadowTintPeak 0.52 — the PRE-banda2 tree — so it is now evaluated at that knob, and the
     SHIPPED state is anchored against banda2's own committed per-shot readbacks (six shots,
     one boot each, `mismatch: []` on every row). Those are strictly better anchors than one
     daylight sample: they cover the k-cap's binding shot (interior) and night. */
  const st52 = lightState(0.80, { shadowTintPeak: 0.52 });
  const ref52 = [0.096, 0.313, 0.497];
  const err52 = st52.shadowColor.map((v, i) => Math.abs(v - ref52[i]));
  console.log(`  compose1 anchor (@tintPeak 0.52, pre-banda2): port (${st52.shadowColor.map((v) => v.toFixed(3)).join(', ')}) vs live boot readback (0.096, 0.313, 0.497), maxErr ${Math.max(...err52).toFixed(4)}`);
  if (Math.max(...err52) > 0.01) { console.error('  ANCHOR FAIL: uShadowColor port does not reproduce the committed live readback (§132.3)'); anchorFail++; }
  const RB62 = {                                   // banda2/readback-*.json, arms at tintPeak 0.62
    hero: [0.103868, 0.338422, 0.536719],
    temple: [0.108804, 0.355122, 0.563271],
    interior: [0.112807, 0.373725, 0.593387],
    'sly-closeup': [0.103228, 0.336278, 0.533327],
    combat: [0.106265, 0.346523, 0.549598],
    night: [0.012896, 0.046769, 0.078053],
  };
  let worst62 = 0;
  for (const [shot, ref] of Object.entries(RB62)) {
    const s = lightState(SHOT_TODS[shot]);
    const e = Math.max(...s.shadowColor.map((v, i) => Math.abs(v - ref[i])));
    worst62 = Math.max(worst62, e);
    console.log(`  banda2 live anchor ${shot.padEnd(12)} port (${s.shadowColor.map((v) => v.toFixed(4)).join(', ')})  live (${ref.map((v) => v.toFixed(4)).join(', ')})  maxErr ${e.toFixed(5)}`);
  }
  if (worst62 > 0.002) { console.error(`  ANCHOR FAIL: shipped-tree uShadowColor port off the banda2 live readbacks by ${worst62.toFixed(4)}`); anchorFail++; }
  if (anchorFail) { console.error(`\n${anchorFail} state anchor failure(s) — the state port is NOT validated; chain/attrib numbers are void.`); process.exit(2); }
  console.log('  state anchors PASS (keyLum table + compose1 readback)');
}

/* ───────────────────────────── grade port ───────────────────────────── */

const AGX_INSET = [ // columns
  [0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859]];
const AGX_OUTSET = [
  [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]];
const SRGB_TO_2020 = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.0880], [0.0433, 0.0113, 0.8956]];
const REC2020_TO_SRGB = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
const matMul = (cols, v) => [
  cols[0][0] * v[0] + cols[1][0] * v[1] + cols[2][0] * v[2],
  cols[0][1] * v[0] + cols[1][1] * v[1] + cols[2][1] * v[2],
  cols[0][2] * v[0] + cols[1][2] * v[1] + cols[2][2] * v[2]];
const agxPoly = (x) => {
  const x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
};
function agx(colorIn) {
  const minEv = -12.47393, maxEv = 4.026069;
  let c = matMul(SRGB_TO_2020, colorIn);
  c = matMul(AGX_INSET, c);
  c = c.map((v) => Math.max(v, 1e-10));
  c = c.map((v) => clamp01((Math.log2(v) - minEv) / (maxEv - minEv)));
  c = c.map(agxPoly);                                   // shoulder b = 1.0 (asserted): branchless
  c = matMul(AGX_OUTSET, c);
  c = c.map((v) => Math.pow(Math.max(v, 0), 2.2));
  c = matMul(REC2020_TO_SRGB, c);
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const mn = Math.min(...c);
  if (mn < 0 && l > mn) { const t = Math.min(1, -mn / (l - mn)); c = mix3(c, [l, l, l], t); }
  return c.map(clamp01);
}

function grade(scene, { occ = 0, knobs = {} } = {}) {
  const g = { ...G, ...knobs };
  let c = scene.slice();
  if (occ > 0) {
    const tint = hexLin(g.aoTint);
    let t = mix3(tint, hexLin(PAL.turquoise), g.aoTintTeal);
    t = mix3(t, [1, 1, 1], g.aoTintNeutral);
    const pk = Math.max(...t);
    const norm = t.map((v) => v / Math.max(pk, 1e-4));
    c = mul3(c, mix3([1, 1, 1], scale3(norm, g.aoDepth), occ));
  }
  c = scale3(c, g.exposure);
  c = c.map((v, i) => Math.max(0, v + g.lift[i] * (1 - v)));
  c = mul3(c, g.gain);
  const l = lum3(c);
  let shad = mix3(hexLin(g.splitShadow), hexLin(PAL.turquoise), g.splitShadowTeal);
  let tone = mix3(shad, hexLin(g.splitHighlight), smoothstep(g.splitRange[0], g.splitRange[1], l));
  tone = scale3(tone, 1 / Math.max(1e-4, lum3(tone)));
  c = mix3(c, mul3(c, tone), g.splitStrength);
  c = mix3([l, l, l], c, g.saturation);
  c = c.map((v) => g.pivot * Math.pow(Math.max(v, 1e-6) / g.pivot, g.contrast));
  c = agx(c);
  return c.map(linToSrgb1);                             // display 0..1; rim/ink/vignette/grain out of scope (stated)
}
const disp255 = (c) => c.map((v) => v * 255);

function modeGrade() {
  console.log('\n═══ grade — port vs the committed calibration row (PostFX.js splitRange note; sclera-validated) ═══');
  const row = [[0.02, 39], [0.05, 69], [0.08, 88], [0.18, 126], [0.35, 159], [0.50, 176], [0.72, 192], [1.00, 205], [2.00, 227]];
  let worst = 0;
  for (const [l, want] of row) {
    const c = disp255(grade([l, l, l]));
    const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    worst = Math.max(worst, Math.abs(L - want));
    console.log(`  scene ${l.toFixed(2)} → display L ${L.toFixed(1)} (committed ${want})  rgb(${c.map((v) => v.toFixed(0)).join(',')})`);
  }
  console.log(`  worst |Δ| ${worst.toFixed(2)} L`);
  if (worst > 1.5) { console.error('  ANCHOR FAIL: grade port does not reproduce the committed row — grade numbers are void.'); process.exit(2); }
  console.log('  grade anchor PASS');
}

/* ───────────────────────────── shading port ───────────────────────────── */

/**
 * One texel through the toon diff assembly (toon.glsl.js TOON_SHADE, lines quoted in the
 * report). cond: { ndl, sh, ny (world normal y), skin (vSlySkin), ao=1, occ (screen AO),
 * metal=0, envRy (reflection y for metalEnv, default = ny), ndh (spec half-vector), rough,
 * spec, gloss, sssOn }.
 */
function shadeTexel(st, albLin, cond = {}, knobs = {}) {
  const K = { ...T, ...knobs };
  const ndl = cond.ndl ?? -0.3;
  const sh = cond.sh ?? 0;
  const ny = cond.ny ?? 0;
  const skin = cond.skin ?? 0;
  const ao = cond.ao ?? 1;                      // baked-AO term after uAoStrength (authored p50 0.992 ⇒ ~1)
  const metal = cond.metal ?? 0;

  const ramp = slyRamp(ndl, K.bands, K.termLo, K.termHi, K.termSoft);
  const key = ramp * sh;
  const alb = albLin;
  const lumA = lum3(alb);
  const albShadow = mix3([lumA, lumA, lumA], alb, 1.0 + K.shadowSat).map(clamp01);
  const keyRad = scale3(st.keyColor, st.keyIntensity);

  const hemi = smoothstep(-0.72, 0.55, ny);
  const bounceLeg = mix3(st.bounceColor,
    scale3(st.skyColor, lum3(st.bounceColor) / Math.max(lum3(st.skyColor), 1e-4)),
    K.fillSkyMix);
  const fill = scale3(mix3(scale3(bounceLeg, K.bounceGain), st.skyColor, hemi), st.ambIntensity);

  const shadowMix = 1.0 - key;
  const albAmb = mix3(alb, albShadow, shadowMix);

  const subjT = clamp01(K.subjWarmShade) * skin;
  const warmT = scale3(hexLin(PAL.wrapWarm), 1 / Math.max(lum3(hexLin(PAL.wrapWarm)), 1e-4));
  let fillX = mix3(fill, [lum3(fill), lum3(fill), lum3(fill)], clamp01(K.neutralFill ?? 0));
  const shadD = mix3(st.shadowColorLit, st.shadowColor, smoothstep(K.shadowDepth0, K.shadowDepth1, shadowMix));
  let shadX = mix3(shadD, [lum3(shadD), lum3(shadD), lum3(shadD)], clamp01(K.neutralShadow ?? 0));
  fillX = mix3(fillX, scale3(warmT, lum3(fillX)), subjT);
  shadX = mix3(shadX, scale3(warmT, lum3(shadX)), subjT);

  const tKey = scale3(mul3(alb, keyRad), key);                          // uAoKey 0
  const tFill = scale3(mul3(albAmb, fillX), ao);
  const tShad = scale3(mul3(albShadow, shadX), shadowMix * mix(0.55, 1.0, ao));
  const tWash = scale3(shadX, K.shadowWash * shadowMix * ao);
  const metalMul = mix(1.0, 0.20, metal);
  let diff;
  if (knobs.washOutsideMetalMul) {
    // §136.3's proposed relocation: wash escapes the metal multiply (full strength on metal)
    diff = add3(scale3(add3(add3(tKey, tFill), tShad), metalMul), tWash);
  } else {
    diff = scale3(add3(add3(tKey, tFill), add3(tShad, tWash)), metalMul);
  }

  // sss (wrap): peaks at the terminator
  const sssP = cond.sss ?? 0;
  const wrapv = clamp01((ndl + sssP) / (1 + sssP));
  const sssAmt = clamp01(wrapv - clamp01(ndl));
  const sss = scale3(mul3(mul3(alb, hexLin(PAL.wrapWarm)), keyRad), sssAmt * sssP * 2.4 * sh);

  // spec (hard-stepped Blinn-Phong) — cond.ndh drives it
  let spec = [0, 0, 0], metalEnv = [0, 0, 0];
  if (cond.specOn) {
    const rgh = clamp01(cond.rough ?? 0.62);
    const glossP = Math.max((cond.gloss ?? T.gloss) * (1 - 0.6 * rgh), 4.0);
    const lobe = Math.pow(clamp01(cond.ndh ?? 0), glossP);
    const specStep = smoothstep(0.30, 0.52, lobe) + 0.35 * smoothstep(0.02, 0.30, lobe);
    const specAmt = (cond.spec ?? T.spec) * (1 - 0.75 * rgh) * mix(1.0, 3.4, metal);
    const specTint = mix3(hexLin(PAL.goldSpec), add3(scale3(alb, 2.0), scale3(hexLin(PAL.goldSpec), 0.25)), metal);
    spec = scale3(specTint, specAmt * specStep * sh * (ndl >= 0.02 ? 1 : 0));
    if (metal > 0.001) {
      const Ry = cond.envRy ?? ny;
      const up = smoothstep(-0.25, 0.65, Ry);
      let env = mix3(st.bounceColor, st.skyColor, Math.floor(up * 3 + 0.5) / 3);
      // haze mix inside env left at uHaze≈fog colour; small — use skyColor-weighted approx, stated
      const ndv = cond.ndv ?? 0.6;
      const ef = mix(0.25, 1.0, Math.pow(1 - ndv, 3));
      metalEnv = scale3(mul3(alb, env), metal * T.metalGain * ef * mix(0.35, 1.0, sh) * ao);
    }
    // candidate glint leg (goldlobe): reflection-vector sun alignment cosRK^p, metal-scoped
    if (cond.glintGain) {
      const cosRK = clamp01(cond.cosRK ?? 0);
      const gl = Math.pow(cosRK, cond.glintPow ?? 24);
      const glintTint = add3(scale3(alb, 1.4), scale3(hexLin(PAL.goldSpec), 0.45));
      spec = add3(spec, scale3(glintTint, cond.glintGain * gl * metal * mix(0.25, 1.0, sh)));
    }
  }

  // surface fresnel rim (toon.glsl.js:732): planar architecture gets rimSil=0 (gate);
  // curved skinned surfaces pass — cond.rimBand ∈ [0,1] stands in for rimBand·rimSil.
  let rim = [0, 0, 0];
  if (cond.rimBand) {
    const wrapRim = smoothstep(-0.35, 0.45, ndl);
    const rimShadeFloor = 0.55;                       // vSlySkin=1 side of mix(uRimShadowFloorArch, 0.55, skin)
    const rimGainLive = 4.10 * 0.5;                   // day: TUNE.rimGain × Atmosphere rimStrength 0.5 (rim1/rim2 measured uRimGain 2.05)
    rim = scale3(hexLin('7fd4ff'), 0.55 * rimGainLive * cond.rimBand * mix(rimShadeFloor, 1.0, sh) * mix(0.45, 1.0, wrapRim));
  }
  const scene = add3(add3(add3(diff, sss), add3(spec, metalEnv)), rim);
  return { scene, terms: { key: tKey, fill: tFill, shadMul: tShad, wash: tWash, sss, spec, metalEnv, rim, metalMul }, aux: { fill, fillX, shadX, shadowMix } };
}

function slyRamp(ndl, bands, lo, hi, soft) {
  const steps = Math.max(Math.floor(bands + 0.5) - 1, 1);
  const x = clamp01(ndl);
  let acc = 0;
  for (let k = 0; k <= 4; k++) {
    const f = steps > 1 ? k / (steps - 1) : 0;
    const t = lo + (hi - lo) * f;
    acc += (steps >= k + 0.5 ? 1 : 0) * smoothstep(t - soft, t + soft, x);
  }
  return clamp01(acc / steps);
}

/* Texel classes. Consumer albedo = Architecture recipe tint (linear) × texture texel
 * (linear). Texture means per Materials.js:361 (hieroglyph_wall 0.482, column_papyrus 0.388,
 * sandstone_worn 0.314, sandstone_block 0.271); texture hue is a warm-tinted grey (authored
 * hue 17–38, low sat) modelled as neutral — this UNDERSTATES warmth slightly, stated.
 * Calibration of the model against the committed lit register: solving the washcap-committed
 * "sunlit wall L 151.4" (hero) for albedo luma under this state gives ≈0.115 linear — the
 * `worn` row lands 0.113. Bible hexes are DISPLAY-INTENT anchors, not albedo inputs. */
const ALB = {
  worn: scale3(hexLin('cfa068'), 0.314),                      // sandstone_worn wall/beam
  block: scale3(hexLin('c9915a'), 0.271),                     // sandstone_block
  hiero: scale3(hexLin('d6a874'), 0.482),                     // hieroglyph_wall (interior/temple walls)
  papyrus: scale3(hexLin('d8a468'), 0.388),                   // column_papyrus (temple columns)
  cream: hexLin('e4dfcb'),                                    // SlyModel cream (map-less character colour)
  gilded: scale3(hexLin('dcae5e'), 0.45),                     // hieroglyph_gilded leaf (gild-lit calib: p50 86 ⇒ ~0.45 tex mean)
};

const CONDS = {
  shadeWall: { ndl: -0.3, sh: 0, ny: 0.0, label: 'vertical wall, fully shadowed (shadowMix 1)' },
  shadeWallOcc: { ndl: -0.3, sh: 0, ny: 0.0, occ: 0.25, label: 'same + screen AO 0.25' },
  corridor: { ndl: 0.30, sh: 1, ny: 0.0, label: 'terminator corridor (mid band, key 0.5)' },
  litWall: { ndl: 0.75, sh: 1, ny: 0.0, label: 'key-lit vertical wall (key 1)' },
  litTop: { ndl: 0.9, sh: 1, ny: 1.0, label: 'key-lit top face (sky-facing)' },
  creamShade: { ndl: -0.2, sh: 0, ny: 0.2, skin: 1, sss: 0.2, label: 'cream tail band, shade side, skinned' },
  creamShadeOccRim: { ndl: -0.2, sh: 0, ny: 0.2, skin: 1, sss: 0.2, occ: 0.45, rimBand: 0.5, label: 'cream shade + inter-card AO 0.45 + curved-surface rim 0.5' },
  creamLit: { ndl: 0.7, sh: 1, ny: 0.2, skin: 1, sss: 0.2, label: 'cream tail band, key-lit, skinned' },
  creamLitOccRim: { ndl: 0.7, sh: 1, ny: 0.2, skin: 1, sss: 0.2, occ: 0.35, rimBand: 0.35, label: 'cream lit + AO 0.35 + rim 0.35' },
};

function texelReport(st, alb, cond, knobs = {}, occ = cond.occ ?? 0) {
  const { scene } = shadeTexel(st, alb, cond, knobs);
  const d = disp255(grade(scene, { occ, knobs }));
  const [h, s] = hsv(...d);
  const L = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
  const arg = d[1] <= d[0] && d[1] <= d[2] ? 'G' : (d[0] <= d[1] && d[0] <= d[2] ? 'R' : 'B');
  return { d, h, s, L, RmB: d[0] - d[2], BoverMax: d[2] / Math.max(d[0], d[1], d[2], 1e-4), argmin: arg, scene };
}

function modeChain() {
  console.log('\n═══ chain — authored warm through the full route, per shot state (frame-vs-chain residuals are the calibration) ═══');
  for (const shot of ['hero', 'temple', 'interior', 'sly-closeup']) {
    const st = lightState(SHOT_TODS[shot]);
    console.log(`\n— ${shot} (tod ${SHOT_TODS[shot]}, keyLum ${st.keyLum.toFixed(3)}) —`);
    for (const [aName, alb] of Object.entries(ALB)) {
      if (aName === 'gilded' || aName === 'block') continue;
      const row = [];
      for (const [cName, cond] of Object.entries(CONDS)) {
        if (aName !== 'cream' && cName.startsWith('cream')) continue;
        if (aName === 'cream' && !cName.startsWith('cream')) continue;
        const r = texelReport(st, alb, cond);
        row.push(`${cName}: hue ${r.h.toFixed(0)} sat ${r.s.toFixed(2)} L ${r.L.toFixed(0)} R−B ${r.RmB.toFixed(0)} min${r.argmin}`);
      }
      if (row.length) console.log(`  ${aName.padEnd(13)} ${row.join('  |  ')}`);
    }
  }
  console.log('\n  Frame check targets (mode `frames`): hero.beam medHue/medL, temple.litColumns, interior walls, closeup tail.');
}

/* ───────────────────────────── attrib mode ───────────────────────────── */

const TOGGLES = [
  ['shadow-light hue → grey (uNeutralShadow 1)', { neutralShadow: 1 }],
  ['fill hue → grey (uNeutralFill 1)', { neutralFill: 1 }],
  ['wash off (shadowWash 0.05→0)', { shadowWash: 0 }],
  ['shadowSat −0.35→0 (albedo keeps own chroma in shade)', { shadowSat: 0 }],
  ['shadowTeal 0.15→0 (pre-teal tint)', { shadowTeal: 0 }],
  ['fillSkyMix 0.70→0 (legacy warm sand fill)', { fillSkyMix: 0 }],
  ['sbm/sbmLit 0.05→0.20 (§115 full revert — KNOWN magenta)', { shadowBounceMix: 0.20, shadowBounceMixLit: 0.20 }],
  ['sbmLit only 0.05→0.20 (shallow-shade warm)', { shadowBounceMixLit: 0.20 }],
  ['split off (splitStrength 0.16→0)', { splitStrength: 0 }],
  ['saturation 1.30→1.00', { saturation: 1.0 }],
  ['gain → [1,1,1]', { gain: [1, 1, 1] }],
  ['subjWarmShade 0.50→0 (cream rows only)', { subjWarmShade: 0 }],
  ['subjWarmShade 0.50→0.65 (creamfix captured arm)', { subjWarmShade: 0.65 }],
  ['shadowTintPeak 0.52→0.62 (daylight shadow-transparency)', { shadowTintPeak: 0.62 }],
  ['shadowTintPeak 0.52→0.75 (over-bright probe)', { shadowTintPeak: 0.75 }],
];

function modeAttrib() {
  console.log('\n═══ attrib — per-term display-hue attribution (Δ vs shipped, per texel class) ═══');
  const cases = [
    ['hero', 'worn', 'shadeWall'],
    ['hero', 'worn', 'corridor'],
    ['hero', 'worn', 'litWall'],
    ['interior', 'hiero', 'shadeWall'],
    ['interior', 'hiero', 'shadeWallOcc'],
    ['temple', 'papyrus', 'shadeWall'],
    ['sly-closeup', 'cream', 'creamShade'],
    ['sly-closeup', 'cream', 'creamShadeOccRim'],
    ['sly-closeup', 'cream', 'creamLit'],
    ['sly-closeup', 'cream', 'creamLitOccRim'],
  ];
  for (const [shot, aName, cName] of cases) {
    const base = texelReport(lightState(SHOT_TODS[shot]), ALB[aName], CONDS[cName]);
    console.log(`\n— ${shot} / ${aName} / ${cName} — shipped: hue ${base.h.toFixed(1)} sat ${base.s.toFixed(2)} L ${base.L.toFixed(0)} R−B ${base.RmB.toFixed(1)} min${base.argmin}`);
    for (const [label, knobs] of TOGGLES) {
      if (label.includes('cream') && !cName.startsWith('cream')) continue;
      if (cName.startsWith('cream') && (label.includes('shadowTeal') || label.includes('gain'))) continue;
      const st2 = lightState(SHOT_TODS[shot], knobs);
      const r = texelReport(st2, ALB[aName], CONDS[cName], knobs);
      const dh = ((r.h - base.h + 540) % 360) - 180;
      console.log(`    ${label.padEnd(52)} hue ${r.h.toFixed(1).padStart(6)} (Δ ${dh >= 0 ? '+' : ''}${dh.toFixed(1)})  sat ${r.s.toFixed(2)}  L ${r.L.toFixed(0)}  R−B ${r.RmB.toFixed(1)}  min${r.argmin}`);
    }
  }
  // AgX hue-rotation share: hue before tonemap (naive encode of graded-but-untonemapped) vs after
  console.log('\n— AgX/tonemap hue rotation share (pre-AgX naive-encode hue vs display hue) —');
  for (const [shot, aName, cName] of cases.slice(0, 4)) {
    const st = lightState(SHOT_TODS[shot]);
    const { scene } = shadeTexel(st, ALB[aName], CONDS[cName]);
    // graded-minus-tonemap: run grade up to the contrast stage, then naive sRGB encode
    const g = { ...G };
    let c = scale3(scene, g.exposure);
    c = c.map((v, i) => Math.max(0, v + g.lift[i] * (1 - v)));
    c = mul3(c, g.gain);
    const l = lum3(c);
    let tone = mix3(hexLin(g.splitShadow), hexLin(g.splitHighlight), smoothstep(g.splitRange[0], g.splitRange[1], l));
    tone = scale3(tone, 1 / Math.max(1e-4, lum3(tone)));
    c = mix3(c, mul3(c, tone), g.splitStrength);
    c = mix3([l, l, l], c, g.saturation);
    c = c.map((v) => g.pivot * Math.pow(Math.max(v, 1e-6) / g.pivot, g.contrast));
    const pre = disp255(c.map(linToSrgb1).map(clamp01));
    const post = texelReport(st, ALB[aName], CONDS[cName]);
    const [hPre] = hsv(...pre);
    const dh = ((post.h - hPre + 540) % 360) - 180;
    console.log(`    ${shot}/${aName}/${cName}: pre-AgX hue ${hPre.toFixed(1)} → display ${post.h.toFixed(1)} (AgX Δ ${dh >= 0 ? '+' : ''}${dh.toFixed(1)})`);
  }
}

/* ───────────────────────────── cand mode ───────────────────────────── */

/* PREREG-banda candidate (final, evidence-selected by `attrib`):
 *   L1 subjWarmShade 0.50 → 0.65 — the creamfix-captured arm; character-scoped (vSlySkin),
 *      architecture bit-identical by construction (mix factor exactly 0 at vSlySkin 0).
 *   L2 shadowTintPeak 0.52 → 0.62 — daylight shadow-transparency; night-inert BY ARITHMETIC:
 *      night kAsked 0.468 « maxK at either value, so the cap never engages and night
 *      uShadowColor is bit-identical (the `state` rows print it).
 * Known-bad arms:
 *   KB-warmmud  sbm/sbmLit 0.20/0.20 — §115.4's measured re-creation of task-16 magenta;
 *               on the current tree its signature is the GREY-COLLAPSE half of §132.4's
 *               interlock (shadow sat falls toward 0.1) plus warm-mud drift.
 *   KB-overwarm subjWarmShade 1.0 — the navy rings lose their cool identity (creamfix V2's
 *               own gate direction inverted).
 */
function modeCand() {
  console.log('\n═══ cand — PREREG-banda arms through the chain (texel-level; frame bands add the stated calibration residuals) ═══');
  const ARMS = [
    ['A  subjW 0.65', { subjWarmShade: 0.65 }],
    ['B  tintPeak 0.62', { shadowTintPeak: 0.62 }],
    ['AB both', { subjWarmShade: 0.65, shadowTintPeak: 0.62 }],
    ['KB-warmmud sbm .20/.20', { shadowBounceMix: 0.20, shadowBounceMixLit: 0.20 }],
    ['KB-overwarm subjW 1.0', { subjWarmShade: 1.0 }],
  ];
  const cases = [
    ['hero', 'worn', 'shadeWall'], ['hero', 'worn', 'shadeWallOcc'], ['hero', 'block', 'shadeWall'],
    ['temple', 'papyrus', 'shadeWall'], ['interior', 'hiero', 'shadeWall'], ['interior', 'hiero', 'shadeWallOcc'],
    ['sly-closeup', 'cream', 'creamShade'], ['sly-closeup', 'cream', 'creamShadeOccRim'],
    ['sly-closeup', 'cream', 'creamLit'], ['sly-closeup', 'cream', 'creamLitOccRim'],
    ['night', 'worn', 'shadeWall'], ['night', 'worn', 'corridor'],
  ];
  for (const [label, knobs] of ARMS) {
    console.log(`\n— arm ${label} —`);
    for (const [shot, aName, cName] of cases) {
      const st0 = lightState(SHOT_TODS[shot]);
      const st = lightState(SHOT_TODS[shot], knobs);
      const base = texelReport(st0, ALB[aName], CONDS[cName]);
      const r = texelReport(st, ALB[aName], CONDS[cName], knobs);
      const dh = ((r.h - base.h + 540) % 360) - 180;
      console.log(`    ${shot.padEnd(12)}/${aName.padEnd(8)}/${cName.padEnd(17)} hue ${base.h.toFixed(1)}→${r.h.toFixed(1)} (Δ${dh >= 0 ? '+' : ''}${dh.toFixed(1)})  sat ${base.s.toFixed(2)}→${r.s.toFixed(2)}  L ${base.L.toFixed(1)}→${r.L.toFixed(1)}  R−B ${base.RmB.toFixed(1)}→${r.RmB.toFixed(1)}`);
    }
  }
  // night-inertia proof rows: uShadowColor at night under each arm
  console.log('\n— night-inertia proof (uShadowColor at tod 0.02, per arm; L2 must be bit-identical) —');
  for (const [label, knobs] of [['ship', {}], ...ARMS]) {
    const st = lightState(0.02, knobs);
    console.log(`    ${label.padEnd(24)} kUsed ${st.kUsed.toFixed(6)}  uShadowColor (${st.shadowColor.map((v) => v.toFixed(6)).join(', ')})`);
  }
  // hero black-band arithmetic: rect luma histogram + the texel ΔL the B arm buys
  const im = readPNG(`${REC}/cand1/frames/hero.base.png`);
  const [x0, y0, x1, y1] = [200, 300, 900, 600];
  const bands = [0, 25, 32, 36, 40, 48, 60, 255];
  const counts = new Array(bands.length - 1).fill(0);
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * im.ch;
    const L = 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
    for (let b = 0; b < bands.length - 1; b++) if (L >= bands[b] && L < bands[b + 1]) { counts[b]++; break; }
    n++;
  }
  console.log('\n— hero.arch (200,300,900,600) luma histogram (for the <L40 band prediction) —');
  for (let b = 0; b < bands.length - 1; b++) console.log(`    L ${String(bands[b]).padStart(3)}–${String(bands[b + 1]).padStart(3)}: ${(100 * counts[b] / n).toFixed(1)}%`);
}

/* ───────────────────────────── gold mode ───────────────────────────── */

function modeGold() {
  console.log('\n═══ gold — spec ceiling arithmetic for PREREG-goldlobe (hieroglyph_gilded, traversal state) ═══');
  const st = lightState(SHOT_TODS.traversal);
  const alb = ALB.gilded;
  const base = { specOn: true, metal: 0.85, rough: 0.55, spec: 0.55, gloss: 64, ndl: 0.55, sh: 1, ny: 0.5, ndv: 0.55, envRy: 0.4 };
  console.log(`  traversal tod ${SHOT_TODS.traversal}, keyLum ${st.keyLum.toFixed(3)}`);
  console.log('\n  shipped assembly, lobe core sweep (ndh → display L):');
  for (const ndh of [0.90, 0.95, 0.97, 0.985, 1.0]) {
    const r = texelReport(st, alb, { ...base, ndh });
    const glossP = Math.max(64 * (1 - 0.6 * 0.55), 4);
    console.log(`    ndh ${ndh.toFixed(3)} (lobe ${Math.pow(ndh, glossP).toFixed(3)}) → scene ${lum3(r.scene).toFixed(3)}, display L ${r.L.toFixed(1)}  rgb(${r.d.map((v) => v.toFixed(0)).join(',')})`);
  }
  console.log(`\n  measured gold1: ROI p99 185.1, max 230.4 (FX-excluded), lobe 5 px; reference p99 239–244, lobe 84–146 px.`);
  console.log('\n  candidate glint leg  spec += glintTint · uGoldGlint · pow(max(dot(R,uKeyDir),0), uGlintPow) · slyMetal · mix(0.25,1,sh):');
  for (const gain of [0.6, 1.0, 1.4, 1.6, 2.0, 2.6, 3.0]) {
    for (const pow_ of [5, 12, 20, 24]) {
      const rows = [];
      for (const cosRK of [1.0, 0.99, 0.97, 0.94, 0.90]) {
        const r = texelReport(st, alb, { ...base, ndh: 0.9, glintGain: gain, glintPow: pow_, cosRK });
        rows.push(`cosRK ${cosRK.toFixed(2)}→L ${r.L.toFixed(0)}`);
      }
      console.log(`    gain ${gain.toFixed(1)} pow ${pow_}:  ${rows.join('  ')}`);
    }
  }
  console.log('\n  angular half-width where glint ≥ half-peak: acos(0.5^(1/p)) — p 12 → ' +
    (Math.acos(Math.pow(0.5, 1 / 12)) * 180 / Math.PI).toFixed(1) + '°, p 24 → ' +
    (Math.acos(Math.pow(0.5, 1 / 24)) * 180 / Math.PI).toFixed(1) + '°.');
  // dark-guard: the glint leg is multiplied by mix(0.25,1,sh) and adds nothing at cosRK≈0 —
  // ring pixels (occlusion shadow, sh~0, R facing away) move ≤ this bound:
  const rDark = texelReport(st, alb, { ...base, ndh: 0.2, sh: 0, ndl: -0.2, glintGain: 3.0, glintPow: 12, cosRK: 0.5 });
  const rDark0 = texelReport(st, alb, { ...base, ndh: 0.2, sh: 0, ndl: -0.2 });
  console.log(`  B4 bound: worst-case ring texel (sh 0, cosRK 0.5, gain 3.0 pow 12): L ${rDark0.L.toFixed(1)} → ${rDark.L.toFixed(1)} (Δ ${(rDark.L - rDark0.L).toFixed(1)})`);

  // §136.3's diff-assembly question, answered with numbers: relocating the wash OUTSIDE the
  // metal multiply at the shipped metal 0.85 RAISES the blue wash on dark gild 0.32×→1.00×.
  console.log('\n  §136.3 wash-relocation (wash outside `diff *= mix(1,0.20,slyMetal)`), dark-gild texel (sh 0, ndl −0.2):');
  for (const [label, knobs] of [['shipped (wash inside)', {}], ['relocated (wash outside)', { washOutsideMetalMul: 1 }]]) {
    const r = texelReport(st, alb, { specOn: true, metal: 0.85, rough: 0.55, spec: 0.55, gloss: 64, ndl: -0.2, sh: 0, ny: 0.3, ndh: 0.1, ndv: 0.5 }, knobs);
    console.log(`    ${label.padEnd(26)} L ${r.L.toFixed(1)}  R−B ${r.RmB.toFixed(1)}  B/max ${r.BoverMax.toFixed(3)}  hue ${r.h.toFixed(1)}  rgb(${r.d.map((v) => v.toFixed(0)).join(',')})`);
  }
  console.log('  (and on a NON-metal texel the relocation is arithmetically bit-identical: mix(1,0.20,0)=1.)');
}

/* ───────────────────────────── score mode (PREREG-banda) ─────────────────────────────
 * node banda-diag.mjs score <dir>   — <dir> holds <shot>.<arm>.png per the capture plan
 * (arms: base, A, B, AB, KBwarmmud, KBoverwarm, restore). Prints every registered quantity
 * of PREREG-banda §4 with its band verdict. Bands are duplicated here VERBATIM from the
 * sealed prereg; a mismatch between the two files voids the scoring, not the seal. */

/* coolskew-read ROI convention (PREREG-coolskew-grade.md, verbatim; n/L-filter per spec) */
function lRoiBmr(im, rects, lLo, lHi) {
  if (typeof rects[0] === 'number') rects = [rects];
  let n = 0; const bmr = [];
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * im.ch;
    const r = im.data[i], b = im.data[i + 2];
    const L = 0.2126 * r + 0.7152 * im.data[i + 1] + 0.0722 * b;
    if (L < lLo || L > lHi) continue;
    n++; bmr.push(b - r);
  }
  return { n, bmr: median(bmr) };
}
const TAIL_DARK_ROIS = [[802, 306, 862, 356], [820, 250, 880, 300]];  // coolskew union, verbatim
function frameDiffPx(imA, imB, thresh = 4, excl = null) {
  let n = 0;
  for (let y = 0; y < imA.h; y++) for (let x = 0; x < imA.w; x++) {
    if (excl && x >= excl[0] && y >= excl[1] && x < excl[2] && y < excl[3]) continue;
    const i = (y * imA.w + x) * imA.ch, j = (y * imB.w + x) * imB.ch;
    const d = Math.abs(imA.data[i] - imB.data[j]) + Math.abs(imA.data[i + 1] - imB.data[j + 1]) + Math.abs(imA.data[i + 2] - imB.data[j + 2]);
    if (d >= thresh) n++;
  }
  return n;
}
const BANDS = {
  P1_creamRoi_A: [-58, -30],        // TAIL-LIGHT-SHADOW b−r, arm A/AB (creamfix f065 measured −44)
  P1_rings_A: [5, 45],              // TAIL-DARK b−r holds (f065 measured +14)
  P2_tailBody_A: [-4, 18],          // CRITIC tail rect body R−B, arm A/AB (base −10.5, texel Δ +19..+24 minus residual)
  P3_heroArch_L40_B: [-6.0, -0.5],  // Δpp of <L40 on hero.arch, arm B/AB (base 37.6)
  P4_intWallL_B: [1.0, 8.0],        // ΔmedL interior wall rects, arm B/AB
  P5_familyHue: [200, 246],         // wall-body hue family guard, every non-KB arm, all wall rects
  P7_nightDiff: [0, 0],             // night base-vs-AB differing px outside subject box, ΣRGB≥4
  KBmud_satDrop: 0.35,              // wall-body satP50 must fall ≥35% rel on ≥2 of 3 wall rects
  KBoverwarm_rings: 5,              // TAIL-DARK b−r must fall BELOW +5 (rings-hold gate inverted)
};
function modeScore(dir) {
  console.log(`\n═══ score — PREREG-banda quantities on ${dir} (bands verbatim from the seal) ═══`);
  const f = (shot, arm) => `${dir}/${shot}.${arm}.png`;
  const have = (p) => { try { readFileSync(p); return true; } catch { return false; } };
  const R = [];
  const say = (id, val, band, cmp) => {
    const ok = cmp(val, band);
    R.push([id, val, band, ok]);
    console.log(`  ${id.padEnd(26)} ${typeof val === 'number' ? val.toFixed(2) : val}  band ${JSON.stringify(band)}  ${ok ? 'PASS' : 'FAIL'}`);
  };
  const inBand = (v, b) => v >= b[0] && v <= b[1];
  // sly-closeup arms
  if (have(f('sly-closeup', 'base'))) {
    const b = readPNG(f('sly-closeup', 'base'));
    const bg = lRoiBmr(b, [802, 306, 862, 356], 90, 200);
    const rg = lRoiBmr(b, TAIL_DARK_ROIS, 26, 55);
    say('BaseGate creamROI b−r', bg.bmr, [-28, -12], inBand);
    say('BaseGate rings b−r', rg.bmr, [15, 35], inBand);
    if (have(f('sly-closeup', 'A'))) {
      // P-F5: architecture invariance of arm A — WALL-SHADOW box (coolskew), 0 px at ΣRGB≥4
      const a = readPNG(f('sly-closeup', 'A'));
      let n = 0;
      for (let y = 210; y < 320; y++) for (let x = 922; x < 962; x++) {
        const i = (y * b.w + x) * b.ch, j = (y * a.w + x) * a.ch;
        const d = Math.abs(b.data[i] - a.data[j]) + Math.abs(b.data[i + 1] - a.data[j + 1]) + Math.abs(b.data[i + 2] - a.data[j + 2]);
        if (d >= 4) n++;
      }
      say('P-F5 arch invariance (A) px', n, [0, 0], inBand);
    }
    if (have(f('sly-closeup', 'restore'))) {
      console.log(`  P-F4 sly-closeup restore-vs-base differing px (ΣRGB≥4): ${frameDiffPx(b, readPNG(f('sly-closeup', 'restore')))}`);
    }
  }
  for (const arm of ['A', 'AB']) {
    if (!have(f('sly-closeup', arm))) continue;
    const im = readPNG(f('sly-closeup', arm));
    const cream = lRoiBmr(im, [802, 306, 862, 356], 90, 200);
    const ringsA = lRoiBmr(im, TAIL_DARK_ROIS, 26, 55);
    say(`P1 creamROI b−r (${arm})`, cream.bmr, BANDS.P1_creamRoi_A, inBand);
    say(`P1 rings b−r (${arm})`, ringsA.bmr, BANDS.P1_rings_A, inBand);
    const s = rectStats(im, [630, 290, 780, 410]);
    say(`P2 tail body R−B (${arm})`, s.bodyRmB, BANDS.P2_tailBody_A, inBand);
  }
  if (have(f('sly-closeup', 'KBoverwarm'))) {
    const im = readPNG(f('sly-closeup', 'KBoverwarm'));
    const rings = lRoiBmr(im, TAIL_DARK_ROIS, 26, 55);
    say('KB-overwarm rings b−r', rings.bmr, [-999, BANDS.KBoverwarm_rings], (v, b) => v < b[1]); // must FAIL rings-hold ⇒ PASS here = the KB read as its own failure
  }
  // hero / interior arms
  const wallRects = { hero: [[300, 330, 750, 430]], interior: [[60, 80, 320, 400], [1050, 100, 1250, 500]], temple: [[80, 260, 200, 420]] };
  for (const shot of ['hero', 'interior', 'temple']) {
    if (!have(f(shot, 'base'))) continue;
    const base = readPNG(f(shot, 'base'));
    for (const arm of ['B', 'AB']) {
      if (!have(f(shot, arm))) continue;
      const im = readPNG(f(shot, arm));
      if (shot === 'hero') {
        const a0 = rectStats(base, [200, 300, 900, 600]), a1 = rectStats(im, [200, 300, 900, 600]);
        say(`P3 hero.arch Δ<L40pp (${arm})`, a1.below40Pct - a0.below40Pct, BANDS.P3_heroArch_L40_B, inBand);
      }
      if (shot === 'interior') {
        for (let k = 0; k < 2; k++) {
          const a0 = rectStats(base, wallRects.interior[k]), a1 = rectStats(im, wallRects.interior[k]);
          say(`P4 int wall${k} ΔmedL (${arm})`, a1.medL - a0.medL, BANDS.P4_intWallL_B, inBand);
        }
      }
      for (const rect of wallRects[shot]) {
        const s = rectStats(im, rect);
        say(`P5 ${shot} body hue (${arm})`, s.bodyHue, BANDS.P5_familyHue, inBand);
      }
    }
    if (have(f(shot, 'KBwarmmud'))) {
      const im = readPNG(f(shot, 'KBwarmmud'));
      for (const rect of wallRects[shot]) {
        const s0 = rectStats(base, rect), s1 = rectStats(im, rect);
        const rel = (s0.bodySat - s1.bodySat) / Math.max(s0.bodySat, 1e-4);
        console.log(`  KB-warmmud ${shot} body satP50 ${s0.bodySat.toFixed(3)}→${s1.bodySat.toFixed(3)} (rel drop ${(100 * rel).toFixed(0)}%; needs ≥35% on ≥2 wall rects overall)`);
      }
    }
    if (have(f(shot, 'restore'))) {
      const im = readPNG(f(shot, 'restore'));
      console.log(`  P-F4 ${shot} restore-vs-base differing px (ΣRGB≥4): ${frameDiffPx(base, im)}`);
    }
  }
  // night collision proof
  if (have(f('night', 'base')) && have(f('night', 'AB'))) {
    const b = readPNG(f('night', 'base')), a = readPNG(f('night', 'AB'));
    const subj = [560, 300, 900, 560]; // generous Sly box for the night staging; stated, checked in-crop at scoring
    const offSubj = frameDiffPx(b, a, 4, subj);
    say('P7 night off-subject Δpx', offSubj, BANDS.P7_nightDiff, (v, band) => v === band[0]);
    console.log(`    (in-subject Δpx, allowed and expected warm-ward: ${frameDiffPx(b, a) - offSubj})`);
    if (have(f('night', 'restore'))) {
      console.log(`  P-F4 night restore-vs-base differing px (ΣRGB≥4): ${frameDiffPx(b, readPNG(f('night', 'restore')))}`);
    }
  }
  // P6 honesty rows (reported, not gated) + P8 combat regression watch
  for (const shot of ['hero', 'interior']) {
    if (!have(f(shot, 'base')) || !have(f(shot, 'AB'))) continue;
    const rect = shot === 'hero' ? [200, 300, 900, 600] : [0, 0, 1280, 720];
    const w0 = rectStats(readPNG(f(shot, 'base')), rect).warmPct;
    const w1 = rectStats(readPNG(f(shot, 'AB')), rect).warmPct;
    console.log(`  P6 ${shot} warm% ${w0.toFixed(1)} → ${w1.toFixed(1)} (Δ ${(w1 - w0).toFixed(1)} pp; honesty row, ≤ +3–4 pp expected)`);
  }
  if (have(f('combat', 'base')) && have(f('combat', 'AB'))) {
    const w0 = rectStats(readPNG(f('combat', 'base')), [360, 390, 720, 670]).warmPct;
    const w1 = rectStats(readPNG(f('combat', 'AB')), [360, 390, 720, 670]).warmPct;
    say('P8 combat warm% ratio (AB/base)', w1 / Math.max(w0, 1e-4), [0.85, 1.15], inBand);
    if (have(f('combat', 'restore'))) {
      console.log(`  P-F4 combat restore-vs-base differing px (ΣRGB≥4): ${frameDiffPx(readPNG(f('combat', 'base')), readPNG(f('combat', 'restore')))}`);
    }
    if (have(f('temple', 'base')) && have(f('temple', 'restore'))) {
      console.log(`  P-F4 temple restore-vs-base differing px (ΣRGB≥4): ${frameDiffPx(readPNG(f('temple', 'base')), readPNG(f('temple', 'restore')))}`);
    }
  }
  const fails = R.filter((r) => !r[3]).length;
  console.log(`\n  ${R.length} scored, ${fails} FAIL — the RESULT quotes this table verbatim.`);
}

/* ───────────────────── gold2 mode (PREREG-goldlobe2 diagnosis) ─────────────────────
 * The goldlobe successor's offline measurement chain (RESULT-goldlobe routing: "the port's
 * error was area, not amplitude"). Four steps, every number quoted by PREREG-goldlobe2:
 *   1. face-class θ0 — the angle between each axis-aligned gilded face's reflection vector
 *      and the sun, across the traversal framing (analytic; SHOTS + evalAtmosphere).
 *   2. mover-θ inversion — the committed goldlobe1 frames' ΔL populations mapped back to
 *      implied off-axis angles through the SAME anchored texel→display chain the seal's
 *      bands ride on (grade port is anchor-validated at startup).
 *   3. sharp forward table — predicted display L per mover percentile under the
 *      uGlintSharp re-steepening (first-order tilt model, stated), plus the flat-body
 *      selectivity check (tiltP50 1.15° from texlab, current tree).
 *   4. KB-widelobe port PROOF — the dispatch's binding obligation: the KB (pow 2, gain
 *      5.2) must provably over-lobe in the port BEFORE sealing (predecessor's KB-chrome
 *      failed low because this table was never built).
 */

function modeGold2() {
  console.log('\n═══ gold2 — goldlobe successor diagnosis (θ0 geometry, mover inversion, sharp table, KB proof) ═══');
  const st = lightState(SHOT_TODS.traversal);
  const key = new THREE.Vector3(...st.keyDir).normalize();
  const shot = SHOTS.traversal;
  const cam = new THREE.PerspectiveCamera(shot.fov, 1280 / 720, 0.1, 500);
  cam.position.set(...shot.pos);
  cam.lookAt(...shot.target);
  cam.updateMatrixWorld(true);
  console.log(`  traversal tod ${SHOT_TODS.traversal}  keyDir (${st.keyDir.map((v) => v.toFixed(3)).join(', ')})  cam pos (${shot.pos.join(',')}) target (${shot.target.join(',')}) fov ${shot.fov}`);

  /* 1 — θ0 per face class. Rays through the gilded-band rows (the predecessor's arris span
     x183-1174, y133-214 plus the beam bodies to y260), face normals axis-aligned. */
  const FACES = { px: [1, 0, 0], nx: [-1, 0, 0], pz: [0, 0, 1], nz: [0, 0, -1], py: [0, 1, 0] };
  console.log('\n— 1. face-class θ0 = angle(reflect(view, N), key) across ROI pixels (deg; p10/p50/p90 over sampled rays) —');
  const ndc = (px, py) => new THREE.Vector3((px / 1280) * 2 - 1, -((py / 720) * 2 - 1), 0.5);
  const theta0ByFace = {};
  for (const [fname, n] of Object.entries(FACES)) {
    const N = new THREE.Vector3(...n);
    const ths = [];
    for (let py = 120; py <= 270; py += 10) for (let px = 180; px <= 1180; px += 20) {
      const dir = ndc(px, py).unproject(cam).sub(cam.position).normalize();
      if (dir.dot(N) > -0.05) continue;                       // face not visible from this ray
      const R = dir.clone().sub(N.clone().multiplyScalar(2 * dir.dot(N))).normalize();
      ths.push(Math.acos(clamp01(R.dot(key))) * 180 / Math.PI);
    }
    if (!ths.length) { console.log(`    ${fname}: never camera-facing in the band`); continue; }
    ths.sort((a, b) => a - b);
    const p = (q) => ths[Math.floor(q * (ths.length - 1))].toFixed(1);
    theta0ByFace[fname] = +p(0.5);
    console.log(`    ${fname.padEnd(3)} n ${String(ths.length).padStart(4)}  θ0 p10 ${p(0.1)}  p50 ${p(0.5)}  p90 ${p(0.9)}`);
  }

  /* 2 — the ΔL→θ map through the real chain, then the committed movers inverted.
     Canonical texel: lit gilded beam (ndl 0.55, sh 1, ao 1, metal 0.85) — the §gold base. */
  const G1 = { specOn: true, metal: 0.85, rough: 0.55, spec: 0.55, gloss: 64, ndl: 0.55, sh: 1, ny: 0.5, ndv: 0.55, envRy: 0.4, ndh: 0.2 };
  const dispAt = (cosRK, gain, pow_) => texelReport(st, ALB.gilded, { ...G1, glintGain: gain, glintPow: pow_, cosRK }).L;
  const base0 = dispAt(0, 2.6, 20);
  console.log(`\n— 2. ΔL→θ inversion table (chain: lit gilded texel, glint 2.6/pow 20; base display L ${base0.toFixed(1)}) —`);
  const thGrid = [];
  for (let th = 0; th <= 50; th += 1) {
    const d = dispAt(Math.cos(th * Math.PI / 180), 2.6, 20) - base0;
    thGrid.push([th, d]);
  }
  for (const th of [5, 10, 15, 20, 25, 30, 35, 40]) console.log(`    θ ${String(th).padStart(2)}° → ΔL ${thGrid[th][1].toFixed(1)}`);
  const thetaOf = (dL) => { for (let i = thGrid.length - 1; i >= 0; i--) if (thGrid[i][1] >= dL) return thGrid[i][0]; return 0; };
  /* committed movers (goldlobe1 cand vs base, exclusion rects applied) */
  const EXCL = [[500, 190, 740, 400], [870, 0, 940, 100]];
  const inEx = (x, y) => EXCL.some(([a, b, c, d]) => x >= a && y >= b && x < c && y < d);
  let movers = [];
  try {
    const bIm = readPNG(`${REC}/goldlobe1/traversal.base.png`);
    const cIm = readPNG(`${REC}/goldlobe1/traversal.cand.png`);
    const L = (im, i) => 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
    for (let y = 0; y < bIm.h; y++) for (let x = 0; x < bIm.w; x++) {
      if (inEx(x, y)) continue;
      const i = (y * bIm.w + x) * bIm.ch;
      const d = L(cIm, i) - L(bIm, i);
      if (d >= 8) movers.push({ x, y, dL: d, th: thetaOf(d) });
    }
    movers.sort((a, b) => b.dL - a.dL);
    const pth = (q) => movers[Math.floor(q * (movers.length - 1))];
    console.log(`  committed movers (ΔL ≥ 8, excl applied): n ${movers.length}`);
    for (const q of [0.02, 0.10, 0.25, 0.50]) console.log(`    p${(q * 100).toFixed(0).padStart(2)} by ΔL: ΔL ${pth(q).dL.toFixed(1)} → implied θ ≈ ${pth(q).th}°`);
  } catch { console.log('  (goldlobe1 frames absent — mover inversion skipped)'); }

  /* 3 — the uGlintSharp forward table. First-order model, stated plainly: a mover at
     implied θ carries tilt-rotation δ = θ0 − θ (θ0 = its face's p50); sharp s rotates R to
     θ'(s) = |θ0 − s·δ|. Body texels: δbody = 2 × tiltP50 = 2.3° (texlab, current tree). */
  const th0 = Math.min(...Object.values(theta0ByFace));     // the best-aligned visible face class
  console.log(`\n— 3. sharp forward table (θ0 = best visible face p50 = ${th0}°; first-order re-steepening; gain 2.6 pow 20) —`);
  console.log('    texel class          s=1.0     s=1.5     s=2.0     s=2.5     s=3.0');
  const rows = [
    ['mover p02 (θ from frame)', movers.length ? movers[Math.floor(0.02 * (movers.length - 1))].th : 24],
    ['mover p10', movers.length ? movers[Math.floor(0.10 * (movers.length - 1))].th : 30],
    ['mover p25', movers.length ? movers[Math.floor(0.25 * (movers.length - 1))].th : 33],
    ['flat body (δ 2.3°)', th0 - 2.3],
  ];
  for (const [label, th] of rows) {
    const delta = th0 - th;
    const cells = [1.0, 1.5, 2.0, 2.5, 3.0].map((s) => {
      const thS = Math.abs(th0 - s * delta);
      return dispAt(Math.cos(thS * Math.PI / 180), 2.6, 20).toFixed(0).padStart(6);
    });
    console.log(`    ${label.padEnd(22)} ${cells.join('   ')}`);
  }
  console.log(`    (lobe membership needs display ≥ 0.92 × ROImax ≈ 212; B-p99 band [222, 252])`);

  /* 4 — KB-widelobe PORT PROOF (pow 2, gain 5.2): at pow 2 the half-peak half-width is
     acos(0.5^(1/2)) = 45°, so EVERY visible face class sits inside the cone — the port must
     show body-wide display ≥ the lobe window, i.e. a facet-wide over-lobe, BEFORE sealing. */
  console.log('\n— 4. KB-widelobe proof (pow 2, gain 5.2, sharp 1.0 — body texels at each face-class θ0) —');
  for (const [fname, th] of Object.entries(theta0ByFace)) {
    const d = dispAt(Math.cos(th * Math.PI / 180), 5.2, 2);
    console.log(`    face ${fname.padEnd(3)} θ0 p50 ${String(th).padStart(5)}° → display L ${d.toFixed(1)}  ${d >= 212 ? '≥ 0.92·max window (over-lobe)' : d >= 160 ? '≥ L160 (B2\' axis fires)' : 'below both'}`);
  }
  /* The binding obligation: the KB must read as its own failure IN THE PORT before sealing.
     Signature = B2' explosion (share of gilded over L160). Share-weighted over every sampled
     visible-face ray (each ray scored at its face's exact θ0), body texels only — crest
     movers only ADD to it. */
  let over160 = 0, tot = 0;
  for (const [fname, n] of Object.entries(FACES)) {
    const N = new THREE.Vector3(...n);
    for (let py = 120; py <= 270; py += 10) for (let px = 180; px <= 1180; px += 20) {
      const dir = ndc(px, py).unproject(cam).sub(cam.position).normalize();
      if (dir.dot(N) > -0.05) continue;
      const R = dir.clone().sub(N.clone().multiplyScalar(2 * dir.dot(N))).normalize();
      const th = Math.acos(clamp01(R.dot(key))) * 180 / Math.PI;
      const d = dispAt(Math.cos(th * Math.PI / 180), 5.2, 2);
      tot++; if (d >= 160) over160++;
    }
  }
  console.log(`    PROOF (share-weighted, body texels only): ${(100 * over160 / tot).toFixed(1)}% of visible-face rays ≥ L160 vs the B2' explosion line 20% — ${100 * over160 / tot > 20 ? 'KB-widelobe PROVABLY reads as its own failure in-port ✓' : 'KB INSUFFICIENT — re-dose before sealing'}`);
  console.log(`    (predecessor's KB-chrome at pow 5 predicted body display ≤ ${dispAt(Math.cos(47 * Math.PI / 180), 5.2, 5).toFixed(0)} at the BEST face p10 47° — the low-failure the port never checked; this table is that check for the successor.)`);
}

/* ───────────────────── cal2 mode (PREREG-banda2 calibration) ─────────────────────
 * node banda-diag.mjs cal2 [dir=banda1] — the successor seal's frame-calibration pass over
 * the PREDECESSOR's committed arms (RESULT-banda obligation (b) + CRITIC-sbs2 warm-share
 * promotion). Prints, per wall rect and arm: bodySat (the KB-warmmud axis, frame-anchored),
 * plus warm-share rows (CRITIC conventions restated inline), plus the night leak decomposed.
 * Every PREREG-banda2 band is sized from THIS table; the file quotes it. */

function warmShare(im, rect, { lFloor = 40 } = {}) {
  const [x0, y0, x1, y1] = rect;
  let n = 0, warm = 0, litWarm = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * im.ch;
    const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    n++;
    if (r > b + 10 && L > lFloor) warm++;
    const [h] = hsv(r, g, b);
    if (h >= 15 && h <= 60 && L > 100) litWarm++;              // CRITIC-sbs2 bible-lit-sandstone predicate
  }
  return { warmPct: 100 * warm / n, litWarmPct: 100 * litWarm / n };
}

function modeCal2(dir) {
  console.log(`\n═══ cal2 — PREREG-banda2 calibration from ${dir} (predecessor arms; conventions §122.1-stated inline) ═══`);
  const f = (shot, arm) => `${dir}/${shot}.${arm}.png`;
  const have = (p) => { try { readFileSync(p); return true; } catch { return false; } };
  const wallRects = [
    ['hero', 'beam', [300, 330, 750, 430]],
    ['interior', 'wall0', [60, 80, 320, 400]],
    ['interior', 'wall1', [1050, 100, 1250, 500]],
  ];
  console.log('\n— KB-warmmud axis: wall-body satP50 (body = L≥rect medL, sat≥0.04) per arm —');
  for (const [shot, label, rect] of wallRects) {
    const row = [];
    let baseSat = null;
    for (const arm of ['base', 'B', 'AB', 'KBwarmmud']) {
      if (!have(f(shot, arm))) { row.push(`${arm} —`); continue; }
      const s = rectStats(readPNG(f(shot, arm)), rect);
      if (arm === 'base') baseSat = s.bodySat;
      const rel = baseSat ? (100 * (baseSat - s.bodySat) / baseSat) : 0;
      row.push(`${arm} ${s.bodySat.toFixed(3)}${arm !== 'base' ? ` (drop ${rel.toFixed(1)}%)` : ''}`);
    }
    console.log(`  ${shot}.${label.padEnd(6)} ${row.join('  |  ')}`);
  }
  console.log('\n— warm-share rows (warm% = R>B+10 ∧ L>40; litWarm% = hue∈[15,60] ∧ L>100, CRITIC-sbs2) —');
  const wsJobs = [
    ['interior', 'frame', [0, 0, 1280, 720]],
    ['hero', 'arch', [200, 300, 900, 600]],
    ['hero', 'beam', [300, 330, 750, 430]],
  ];
  for (const [shot, label, rect] of wsJobs) {
    const row = [];
    for (const arm of ['base', 'B', 'AB']) {
      if (!have(f(shot, arm))) continue;
      const w = warmShare(readPNG(f(shot, arm)), rect);
      row.push(`${arm} warm ${w.warmPct.toFixed(2)}% litWarm ${w.litWarmPct.toFixed(2)}%`);
    }
    console.log(`  ${shot}.${label.padEnd(6)} ${row.join('  |  ')}`);
  }
  console.log('\n— interior warm% by luma floor (base arm; the torch-gap decomposition; ref (Odyssey) frame warm% = 31.0 per CRITIC-sbs2) —');
  if (have(f('interior', 'base'))) {
    const im = readPNG(f('interior', 'base'));
    for (const lf of [40, 60, 100, 140]) {
      const w = warmShare(im, [0, 0, 1280, 720], { lFloor: lf });
      console.log(`    L>${String(lf).padEnd(3)} warm% ${w.warmPct.toFixed(2)}`);
    }
  }
  console.log('\n— night leak restated (base vs AB, ΣRGB≥4; banda2-nightleak.md carries the trace) —');
  if (have(f('night', 'base')) && have(f('night', 'AB'))) {
    const b = readPNG(f('night', 'base')), a = readPNG(f('night', 'AB'));
    const subj = [560, 300, 900, 560];
    const off = frameDiffPx(b, a, 4, subj);
    console.log(`    off-subject ${off}, in-subject ${frameDiffPx(b, a) - off}, frame-wide ${frameDiffPx(b, a)} — the successor's P7 gate is FRAME-WIDE [0,0] under the night pin`);
  }
}

/* ───────────────────── score2 mode (PREREG-banda2) ─────────────────────
 * node banda-diag.mjs score2 <dir> — <dir> holds <shot>.<arm>.png, arms
 * base / A / B / ABg / KBwarmmud / KBoverwarm / restore. ABg = the gate-emulated joint arm
 * (day pokes subjW 0.65 + tintPeak 0.62; night pokes subjW 0.50 = the nightPin + tintPeak
 * 0.62). BANDS2 duplicated VERBATIM from PREREG-banda2 §4; a mismatch between the files
 * voids the scoring, not the seal. If <dir> has no ABg but has AB (the banda1 layout), AB is
 * scored in its place WITH A LOUD COMPAT NOTE — that is the calibration smoke test: the
 * ungated predecessor arm must FAIL P7-fw. */

const BANDS2 = {
  P1_creamRoi: [-58, -30],          // TAIL-LIGHT-SHADOW b−r, arm A/ABg (unchanged from banda)
  P1_rings: [5, 45],                // TAIL-DARK b−r holds (unchanged)
  P2_tailBody: [-4, 18],            // CRITIC tail rect body R−B, arm A/ABg (unchanged)
  P3_heroArch_L40: [-6.0, -0.5],    // Δpp of <L40 on hero.arch, arm B/ABg (unchanged)
  P4_intWallL: [1.0, 8.0],          // ΔmedL interior wall rects, arm B/ABg (unchanged)
  P5_familyHue: [200, 246],         // wall-body hue family guard, every non-KB arm (unchanged)
  P7fw_night: [0, 0],               // night base-vs-ABg differing px FRAME-WIDE, ΣRGB≥4 (successor: no subject box)
  W1_intWarm: [-0.5, 2.0],          // interior frame warm% Δpp, ABg vs base (gated honesty)
  W2_heroWarm: [-0.5, 2.0],         // hero arch warm% Δpp, ABg vs base (gated honesty)
  W3_heroLitWarm: [-0.2, 2.0],      // hero beam litWarm% Δpp (hue 15-60 ∧ L>100), ABg vs base
  KBmud_relDrop: 10,                // wall-body satP50 rel drop ≥10% on ≥2 of 3 wall rects (frame-calibrated: anchors 13/23/27%)
  KBoverwarm_rings: 5,              // TAIL-DARK b−r must fall BELOW +5 (unchanged)
  BG_creamRoi: [-28, -12], BG_rings: [15, 35], BG_heroL40: [30, 46], BG_intWallL: [44, 58], // base gates (P-F3)
};

function modeScore2(dir) {
  console.log(`\n═══ score2 — PREREG-banda2 quantities on ${dir} (BANDS2 verbatim from the seal) ═══`);
  const have = (p) => { try { readFileSync(p); return true; } catch { return false; } };
  const joint = have(`${dir}/night.ABg.png`) || have(`${dir}/sly-closeup.ABg.png`) ? 'ABg' : 'AB';
  if (joint === 'AB') console.log('  *** COMPAT: no ABg frames — scoring predecessor AB arms as the joint arm (smoke test; the ungated candidate must FAIL P7-fw) ***');
  const f = (shot, arm) => `${dir}/${shot}.${arm === 'ABg' ? joint : arm}.png`;
  const R = [];
  const say = (id, val, band, cmp = (v, b) => v >= b[0] && v <= b[1]) => {
    const ok = cmp(val, band);
    R.push([id, val, band, ok]);
    console.log(`  ${id.padEnd(30)} ${typeof val === 'number' ? val.toFixed(2) : val}  band ${JSON.stringify(band)}  ${ok ? 'PASS' : 'FAIL'}`);
  };
  const wallRects = { hero: [[300, 330, 750, 430]], interior: [[60, 80, 320, 400], [1050, 100, 1250, 500]], temple: [[80, 260, 200, 420]] };

  /* night FIRST — the successor's decider */
  if (have(f('night', 'base')) && have(f('night', 'ABg'))) {
    const b = readPNG(f('night', 'base')), a = readPNG(f('night', 'ABg'));
    const fw = frameDiffPx(b, a);
    say('P7-fw night Δpx (frame-wide)', fw, BANDS2.P7fw_night, (v, band) => v === band[0]);
    const subj = [560, 300, 900, 560];
    const off = frameDiffPx(b, a, 4, subj);
    console.log(`    (continuity split: off-subject ${off}, in-subject ${fw - off})`);
    if (have(f('night', 'restore'))) say('P-F4 night restore px', frameDiffPx(b, readPNG(f('night', 'restore'))), [0, 0]);
  }
  /* sly-closeup */
  if (have(f('sly-closeup', 'base'))) {
    const b = readPNG(f('sly-closeup', 'base'));
    say('BaseGate creamROI b−r', lRoiBmr(b, [802, 306, 862, 356], 90, 200).bmr, BANDS2.BG_creamRoi);
    say('BaseGate rings b−r', lRoiBmr(b, TAIL_DARK_ROIS, 26, 55).bmr, BANDS2.BG_rings);
    if (have(f('sly-closeup', 'A'))) {
      const a = readPNG(f('sly-closeup', 'A'));
      let n = 0;
      for (let y = 210; y < 320; y++) for (let x = 922; x < 962; x++) {
        const i = (y * b.w + x) * b.ch, j = (y * a.w + x) * a.ch;
        const d = Math.abs(b.data[i] - a.data[j]) + Math.abs(b.data[i + 1] - a.data[j + 1]) + Math.abs(b.data[i + 2] - a.data[j + 2]);
        if (d >= 4) n++;
      }
      say('P-F5 arch invariance (A) px', n, [0, 0]);
    }
    for (const arm of ['A', 'ABg']) {
      if (!have(f('sly-closeup', arm))) continue;
      const im = readPNG(f('sly-closeup', arm));
      say(`P1 creamROI b−r (${arm})`, lRoiBmr(im, [802, 306, 862, 356], 90, 200).bmr, BANDS2.P1_creamRoi);
      say(`P1 rings b−r (${arm})`, lRoiBmr(im, TAIL_DARK_ROIS, 26, 55).bmr, BANDS2.P1_rings);
      say(`P2 tail body R−B (${arm})`, rectStats(im, [630, 290, 780, 410]).bodyRmB, BANDS2.P2_tailBody);
    }
    if (have(f('sly-closeup', 'KBoverwarm'))) {
      say('KB-overwarm rings b−r', lRoiBmr(readPNG(f('sly-closeup', 'KBoverwarm')), TAIL_DARK_ROIS, 26, 55).bmr, [-999, BANDS2.KBoverwarm_rings], (v, b2) => v < b2[1]);
    }
    if (have(f('sly-closeup', 'restore'))) say('P-F4 sly-closeup restore px', frameDiffPx(b, readPNG(f('sly-closeup', 'restore'))), [0, 0]);
  }
  /* hero / interior / temple + KB-warmmud tally */
  let kbFire = 0, kbSeen = 0;
  for (const shot of ['hero', 'interior', 'temple']) {
    if (!have(f(shot, 'base'))) continue;
    const base = readPNG(f(shot, 'base'));
    if (shot === 'hero') say('BaseGate hero <L40 %', rectStats(base, [200, 300, 900, 600]).below40Pct, BANDS2.BG_heroL40);
    if (shot === 'interior') for (let k = 0; k < 2; k++) say(`BaseGate int wall${k} medL`, rectStats(base, wallRects.interior[k]).medL, BANDS2.BG_intWallL);
    for (const arm of ['B', 'ABg']) {
      if (!have(f(shot, arm))) continue;
      const im = readPNG(f(shot, arm));
      if (shot === 'hero') say(`P3 hero.arch Δ<L40pp (${arm})`, rectStats(im, [200, 300, 900, 600]).below40Pct - rectStats(base, [200, 300, 900, 600]).below40Pct, BANDS2.P3_heroArch_L40);
      if (shot === 'interior') for (let k = 0; k < 2; k++) say(`P4 int wall${k} ΔmedL (${arm})`, rectStats(im, wallRects.interior[k]).medL - rectStats(base, wallRects.interior[k]).medL, BANDS2.P4_intWallL);
      for (const rect of wallRects[shot]) say(`P5 ${shot} body hue (${arm})`, rectStats(im, rect).bodyHue, BANDS2.P5_familyHue);
    }
    if (have(f(shot, 'KBwarmmud'))) {
      const im = readPNG(f(shot, 'KBwarmmud'));
      for (const rect of wallRects[shot]) {
        const s0 = rectStats(base, rect), s1 = rectStats(im, rect);
        const rel = 100 * (s0.bodySat - s1.bodySat) / Math.max(s0.bodySat, 1e-4);
        kbSeen++; if (rel >= BANDS2.KBmud_relDrop) kbFire++;
        console.log(`  KB-warmmud ${shot} body satP50 ${s0.bodySat.toFixed(3)}→${s1.bodySat.toFixed(3)} rel drop ${rel.toFixed(1)}% (fires at ≥${BANDS2.KBmud_relDrop}%)`);
      }
    }
    if (have(f(shot, 'restore'))) say(`P-F4 ${shot} restore px`, frameDiffPx(base, readPNG(f(shot, 'restore'))), [0, 0]);
  }
  if (kbSeen) say('KB-warmmud rects fired', kbFire, [2, 99], (v, b2) => v >= b2[0]); // PASS = the KB read as its own failure
  /* W rows — gated warm-share (CRITIC-sbs2 promotion) */
  for (const [id, shot, rect, band, key] of [
    ['W1 interior frame warm% Δpp', 'interior', [0, 0, 1280, 720], BANDS2.W1_intWarm, 'warmPct'],
    ['W2 hero arch warm% Δpp', 'hero', [200, 300, 900, 600], BANDS2.W2_heroWarm, 'warmPct'],
    ['W3 hero beam litWarm% Δpp', 'hero', [300, 330, 750, 430], BANDS2.W3_heroLitWarm, 'litWarmPct'],
  ]) {
    if (!have(f(shot, 'base')) || !have(f(shot, 'ABg'))) continue;
    const w0 = warmShare(readPNG(f(shot, 'base')), rect), w1 = warmShare(readPNG(f(shot, 'ABg')), rect);
    say(id, w1[key] - w0[key], band);
    console.log(`    (${key} ${w0[key].toFixed(2)} → ${w1[key].toFixed(2)}; ref interior frame warm% 31.0 (CRITIC-sbs2); the un-claimed remainder is routed, not scored)`);
  }
  /* P8 combat regression watch */
  if (have(f('combat', 'base')) && have(f('combat', 'ABg'))) {
    const w0 = rectStats(readPNG(f('combat', 'base')), [360, 390, 720, 670]).warmPct;
    const w1 = rectStats(readPNG(f('combat', 'ABg')), [360, 390, 720, 670]).warmPct;
    say('P8 combat warm% ratio', w1 / Math.max(w0, 1e-4), [0.85, 1.15]);
    if (have(f('combat', 'restore'))) say('P-F4 combat restore px', frameDiffPx(readPNG(f('combat', 'base')), readPNG(f('combat', 'restore'))), [0, 0]);
  }
  const fails = R.filter((r) => !r[3]).length;
  console.log(`\n  ${R.length} scored, ${fails} FAIL — RESULT-banda2 quotes this table verbatim.`);
}

/* ═════════════════════════ lit mode (PREREG-litwarm) ═════════════════════════
 *
 * node banda-diag.mjs lit            — the whole diagnosis
 * node banda-diag.mjs lit bins       — just the luma-bin artefact calibration
 *
 * WHAT IT ANSWERS, and why it is a new mode rather than a new toggle in `attrib`:
 * `attrib` asks "what moves the hue of a texel class". This asks the prior question —
 * **which texel class IS the L80+ band on architecture** — because CRITIC-sbs3 §4.1 assigns
 * SHADING a gap named "the LIT half of the palette" and the frames say that band is not lit.
 *
 * Three parts:
 *   1. `bins`  — the BIN-MIGRATION CALIBRATION. A luma-banded mean-R−B statistic computed on
 *      two frames of different brightness measures the brightness change, not the hue change:
 *      pixels cross the bin edges and change each bin's membership. Same statistic computed
 *      two ways on the SAME committed pair (banda2 base vs ABg): "moving-bin" (each frame
 *      binned by its own luma — CRITIC-sbs3 §3.1's convention) vs "fixed-mask" (bin membership
 *      frozen at the base arm, Δ measured per pixel). If they disagree, the fixed-mask number
 *      is the hue result and the moving-bin number is a luma result wearing a hue's name.
 *   2. `pop`   — which shading condition produces a display-L80+ architecture pixel, from the
 *      validated port: display L and hue for every (albedo × condition) cell, so "the L80+
 *      band" can be resolved to shadowMix/key rather than assumed to be key-lit.
 *   3. `levers`— per-knob attribution ON THE POPULATION part 2 identifies, for every knob
 *      SHADING owns, with the night-side arithmetic (pnightcal L1 = 1.40° on archShade,
 *      slope 40.5°/unit sbm ⇒ published night-safe sbm ceiling 0.0845) printed beside it.
 */

/* CRITIC-sbs3's own convention, verbatim: mean R−B per luma band, each frame binned by its
   own luma. `fixed` freezes the mask at arm A and differences per pixel. */
function bandTable(imA, imB) {
  const bins = [[0, 40], [40, 80], [80, 140], [140, 256]];
  const out = [];
  const px = (im, i) => [im.data[i], im.data[i + 1], im.data[i + 2]];
  const n = imA.w * imA.h;
  for (const [lo, hi] of bins) {
    let nA = 0, nB = 0, sA = 0, sB = 0, sFix = 0, sdL = 0;
    for (let p = 0; p < n; p++) {
      const iA = p * imA.ch, iB = p * imB.ch;
      const [ra, ga, ba] = px(imA, iA), [rb2, gb, bb] = px(imB, iB);
      const LA = 0.2126 * ra + 0.7152 * ga + 0.0722 * ba;
      const LB = 0.2126 * rb2 + 0.7152 * gb + 0.0722 * bb;
      if (LA >= lo && LA < hi) { nA++; sA += ra - ba; sFix += (rb2 - bb) - (ra - ba); sdL += LB - LA; }
      if (LB >= lo && LB < hi) { nB++; sB += rb2 - bb; }
    }
    out.push({
      lo, hi, shareA: 100 * nA / n, shareB: 100 * nB / n,
      moving: (nB ? sB / nB : NaN) - (nA ? sA / nA : NaN),
      fixed: nA ? sFix / nA : NaN, dL: nA ? sdL / nA : NaN,
    });
  }
  return out;
}

/* warm% both ways: CRITIC's (each frame's own L>40 population) and fixed-mask (arm A's). */
function warmBothWays(imA, imB) {
  const n = imA.w * imA.h;
  let wA = 0, nA = 0, wB = 0, nB = 0, wAfix = 0, wBfix = 0, nFix = 0;
  for (let p = 0; p < n; p++) {
    const iA = p * imA.ch, iB = p * imB.ch;
    const ra = imA.data[iA], ga = imA.data[iA + 1], ba = imA.data[iA + 2];
    const rb2 = imB.data[iB], gb = imB.data[iB + 1], bb = imB.data[iB + 2];
    const LA = 0.2126 * ra + 0.7152 * ga + 0.0722 * ba;
    const LB = 0.2126 * rb2 + 0.7152 * gb + 0.0722 * bb;
    if (LA > 40) { nA++; if (ra > ba + 10) wA++; }
    if (LB > 40) { nB++; if (rb2 > bb + 10) wB++; }
    if (LA > 40) { nFix++; if (ra > ba + 10) wAfix++; if (rb2 > bb + 10) wBfix++; }
  }
  return {
    critic: [100 * wA / n, 100 * wB / n],                       // share of WHOLE frame (CRITIC's denominator)
    fixedPop: [100 * wAfix / Math.max(nFix, 1), 100 * wBfix / Math.max(nFix, 1)],
    litPopShare: [100 * nA / n, 100 * nB / n],
  };
}

function modeLitBins() {
  console.log('\n═══ lit/bins — the luma-bin migration calibration (CRITIC-sbs3 §3.1 convention vs fixed-mask) ═══');
  console.log('  moving = each frame binned by its own luma (CRITIC). fixed = bin frozen at base, Δ per pixel.');
  for (const shot of ['hero', 'interior', 'temple', 'combat', 'sly-closeup']) {
    const b = `${REC}/banda2/${shot}.base.png`, a = `${REC}/banda2/${shot}.ABg.png`;
    let imB, imA;
    try { imB = readPNG(b); imA = readPNG(a); } catch { continue; }
    console.log(`\n— ${shot} (banda2 base → ABg, the SHIPPED change) —`);
    for (const r of bandTable(imB, imA)) {
      console.log(`  L${String(r.lo).padStart(3)}-${String(r.hi).padStart(3)}  share ${r.shareA.toFixed(2)}%→${r.shareB.toFixed(2)}%  movingΔ(R−B) ${r.moving >= 0 ? '+' : ''}${r.moving.toFixed(2)}   fixedΔ(R−B) ${r.fixed >= 0 ? '+' : ''}${r.fixed.toFixed(2)}   fixedΔL ${r.dL >= 0 ? '+' : ''}${r.dL.toFixed(2)}`);
    }
    const w = warmBothWays(imB, imA);
    console.log(`  warm% (CRITIC denom = whole frame): ${w.critic[0].toFixed(2)} → ${w.critic[1].toFixed(2)}  (Δ ${(w.critic[1] - w.critic[0]).toFixed(2)} pp)`);
    console.log(`  warm% within the BASE arm's own L>40 population: ${w.fixedPop[0].toFixed(2)} → ${w.fixedPop[1].toFixed(2)}  (Δ ${(w.fixedPop[1] - w.fixedPop[0]).toFixed(2)} pp)`);
    console.log(`  L>40 population share: ${w.litPopShare[0].toFixed(2)}% → ${w.litPopShare[1].toFixed(2)}%  ← the denominator that moved`);
  }
}

/* Part 2: which condition renders into which display band, per shot, per albedo. */
function modeLitPop() {
  console.log('\n═══ lit/pop — which shading condition IS the display-L80+ architecture band ═══');
  const conds = [
    ['fullShade   (sh 0, ndl −0.3, wall)', { ndl: -0.3, sh: 0, ny: 0 }],
    ['fullShade+AO(occ 0.25)', { ndl: -0.3, sh: 0, ny: 0, occ: 0.25 }],
    ['castShadow  (ndl +0.75 but sh 0)', { ndl: 0.75, sh: 0, ny: 0 }],
    ['rampDark    (ndl +0.10, sh 1)', { ndl: 0.10, sh: 1, ny: 0 }],
    ['corridor    (ndl +0.30, sh 1 ⇒ key 0.5)', { ndl: 0.30, sh: 1, ny: 0 }],
    ['keyLit      (ndl +0.75, sh 1 ⇒ key 1)', { ndl: 0.75, sh: 1, ny: 0 }],
  ];
  for (const shot of ['hero', 'temple', 'interior', 'courtyard']) {
    const st = lightState(SHOT_TODS[shot]);
    console.log(`\n— ${shot} —`);
    for (const [cLabel, cond] of conds) {
      const cells = [];
      for (const aName of ['worn', 'block', 'hiero', 'papyrus']) {
        const r = texelReport(st, ALB[aName], cond, {}, cond.occ ?? 0);
        cells.push(`${aName} L${r.L.toFixed(0).padStart(3)} h${r.h.toFixed(0).padStart(3)} R−B${(r.RmB >= 0 ? '+' : '') + r.RmB.toFixed(0)}`);
      }
      console.log(`  ${cLabel.padEnd(40)} ${cells.join(' | ')}`);
    }
  }
  console.log('\n  Read: a display-L80+ architecture pixel is produced by FULL SHADE on a bright albedo,');
  console.log('  not by the key. The key-lit cells sit at L150+ and are already warm (hue ~30, R−B ~+120).');
}

/* Part 3: knob attribution on the population part 2 identifies. */
const LIT_KNOBS = [
  ['shadowWash 0.05→0.00  (kill the albedo-independent blue coat)', { shadowWash: 0.0 }],
  ['shadowWash 0.05→0.025', { shadowWash: 0.025 }],
  ['shadowSat −0.35→−0.20 (albedo keeps more chroma in shade)', { shadowSat: -0.20 }],
  ['shadowSat −0.35→0.00', { shadowSat: 0.0 }],
  ['shadowBounceMix 0.05→0.08 (both legs; under pnightcal 0.0845)', { shadowBounceMix: 0.08, shadowBounceMixLit: 0.08 }],
  ['shadowBounceMixLit only 0.05→0.20 (shallow end)', { shadowBounceMixLit: 0.20 }],
  ['shadowTeal 0.15→0.08 (KNOWN-BAD direction: re-opens magenta)', { shadowTeal: 0.08 }],
  ['fillSkyMix 0.70→0.40 (KNOWN-BAD: task19 revert, night-live)', { fillSkyMix: 0.40 }],
  ['bounceGain 0.42→0.60 (warm sand fill up)', { bounceGain: 0.60 }],
  ['shadowTintPeak 0.62→0.52 (undo banda2 — reference direction only)', { shadowTintPeak: 0.52 }],
  ['termHi 0.52→0.38 (widen the key-lit population)', { termHi: 0.38 }],
  ['termLo 0.14→0.06 + termHi 0.52→0.38', { termLo: 0.06, termHi: 0.38 }],
];

function modeLitLevers() {
  console.log('\n═══ lit/levers — SHADING-owned knobs on the L80+ architecture population ═══');
  console.log('  Population per lit/pop: fullShade on a bright albedo (hiero/papyrus) — the pixels that');
  console.log('  land in display L80+. Deep-shade band (worn @ fullShade+AO, display L~69) carried beside');
  console.log('  it: banda2\'s gains live there and must not regress.');
  for (const shot of ['hero', 'temple', 'interior']) {
    const st0 = lightState(SHOT_TODS[shot]);
    const cases = [
      ['L80+ band (hiero, fullShade)', 'hiero', { ndl: -0.3, sh: 0, ny: 0 }],
      ['L80+ band (papyrus, fullShade)', 'papyrus', { ndl: -0.3, sh: 0, ny: 0 }],
      ['deep band (worn, fullShade+AO)', 'worn', { ndl: -0.3, sh: 0, ny: 0, occ: 0.25 }],
      ['key-lit  (worn, key 1)', 'worn', { ndl: 0.75, sh: 1, ny: 0 }],
    ];
    console.log(`\n— ${shot} —`);
    const base = cases.map(([, a, c]) => texelReport(st0, ALB[a], c, {}, c.occ ?? 0));
    console.log(`  ${'shipped'.padEnd(58)} ${cases.map(([lab], i) => `${lab.split(' ')[0]} h${base[i].h.toFixed(0)} R−B${(base[i].RmB >= 0 ? '+' : '') + base[i].RmB.toFixed(0)} L${base[i].L.toFixed(0)}`).join(' | ')}`);
    for (const [label, knobs] of LIT_KNOBS) {
      const st = lightState(SHOT_TODS[shot], knobs);
      const cells = cases.map(([, a, c], i) => {
        const r = texelReport(st, ALB[a], c, knobs, c.occ ?? 0);
        const dh = ((r.h - base[i].h + 540) % 360) - 180;
        return `Δh${(dh >= 0 ? '+' : '') + dh.toFixed(0)} ΔR−B${(r.RmB - base[i].RmB >= 0 ? '+' : '') + (r.RmB - base[i].RmB).toFixed(0)} ΔL${(r.L - base[i].L >= 0 ? '+' : '') + (r.L - base[i].L).toFixed(0)}`;
      });
      console.log(`  ${label.padEnd(58)} ${cells.join(' | ')}`);
    }
  }
  /* Night arithmetic, printed with every candidate, per pnightcal's published constraint. */
  console.log('\n— night collision arithmetic (pnightcal L1: |dHue(archShade)| ≤ 1.40°; slope 40.5°/unit sbm; ceiling 0.0845) —');
  const stN = lightState(SHOT_TODS.night);
  for (const [label, knobs] of LIT_KNOBS) {
    const st = lightState(SHOT_TODS.night, knobs);
    const dSC = Math.max(...st.shadowColor.map((v, i) => Math.abs(v - stN.shadowColor[i])));
    const dSCL = Math.max(...st.shadowColorLit.map((v, i) => Math.abs(v - stN.shadowColorLit[i])));
    const uniformMoves = dSC > 0 || dSCL > 0;
    const shaderKnob = /Wash|Sat|fillSkyMix|bounceGain|term/.test(label);
    console.log(`  ${label.padEnd(58)} uShadowColor Δmax ${dSC.toExponential(1)}  uShadowColorLit Δmax ${dSCL.toExponential(1)}  ${uniformMoves || shaderKnob ? 'NIGHT-LIVE ⇒ needs a gate' : 'night-inert by uniform identity'}`);
  }
}

/* Part 4: the candidate sweep — every cell the seal's bands are sized from, with the
 * §2.2 ledger statistics (hue ≤ 226 on shadowed arch, G-darkest, B/max, sat) beside the
 * warm statistic, so a warm gain bought by breaking the cool-shadow line is visible here
 * and not discovered in a frame. */
function modeLitSweep() {
  console.log('\n═══ lit/sweep — candidate values on every sized cell (warm gain AND the §2.2 cool-shadow lines) ═══');
  const cells = [
    ['brightShade hiero', 'hiero', { ndl: -0.3, sh: 0, ny: 0 }],
    ['brightShade papyrus', 'papyrus', { ndl: -0.3, sh: 0, ny: 0 }],
    ['deepShade worn+AO', 'worn', { ndl: -0.3, sh: 0, ny: 0, occ: 0.25 }],
    ['keyLit worn', 'worn', { ndl: 0.75, sh: 1, ny: 0 }],
    ['corridor worn', 'worn', { ndl: 0.30, sh: 1, ny: 0 }],
    ['cream shade (skin)', 'cream', { ndl: -0.2, sh: 0, ny: 0.2, skin: 1, sss: 0.2 }],
  ];
  const arms = [
    ['ship (shadowSat −0.35)', {}],
    ['shadowSat −0.30', { shadowSat: -0.30 }],
    ['shadowSat −0.25', { shadowSat: -0.25 }],
    ['shadowSat −0.22', { shadowSat: -0.22 }],
    ['shadowSat −0.20', { shadowSat: -0.20 }],
    ['shadowSat −0.15', { shadowSat: -0.15 }],
    ['shadowSat −0.10 (KB probe)', { shadowSat: -0.10 }],
    ['sbm 0.08 both legs', { shadowBounceMix: 0.08, shadowBounceMixLit: 0.08 }],
    ['shadowSat −0.22 + sbm 0.08', { shadowSat: -0.22, shadowBounceMix: 0.08, shadowBounceMixLit: 0.08 }],
  ];
  for (const shot of ['hero', 'temple', 'interior']) {
    console.log(`\n— ${shot} —`);
    for (const [cLabel, aName, cond] of cells) {
      console.log(`  ${cLabel}`);
      for (const [aLabel, knobs] of arms) {
        const st = lightState(SHOT_TODS[shot], knobs);
        const r = texelReport(st, ALB[aName], cond, knobs, cond.occ ?? 0);
        const warm = r.RmB > 10 && r.L > 40 ? 'WARM' : '    ';
        console.log(`    ${aLabel.padEnd(28)} rgb(${r.d.map((v) => v.toFixed(0).padStart(3)).join(',')})  L ${r.L.toFixed(0).padStart(3)}  hue ${r.h.toFixed(0).padStart(3)}  sat ${r.s.toFixed(2)}  R−B ${(r.RmB >= 0 ? '+' : '') + r.RmB.toFixed(0)}  B/max ${r.BoverMax.toFixed(2)}  min${r.argmin}  ${warm}`);
      }
    }
  }
  /* The wrap leg — the one warm, key-SCALED, sh-GATED term in the shader, and it is OFF on
     architecture (`src/world/Architecture.js:209` passes `sss: 0.0`). Sized here across the
     ndl range it covers, at the shipped TUNE default (0.2) and candidate values. `sh` is 1 in
     every row: the term is multiplied by sh, so it contributes exactly nothing inside a cast
     shadow — it cannot re-create the §pass-3 "unlit out-brightens lit" inversion the wash did. */
  console.log('\n═══ lit/sss — the wrap leg on architecture (currently 0.0 by Architecture.js:209) ═══');
  console.log('  rows are ndl (surface turn relative to the key); every row sh=1 (NOT in cast shadow).');
  for (const shot of ['hero', 'temple', 'interior']) {
    const st = lightState(SHOT_TODS[shot]);
    console.log(`\n— ${shot} (worn / block albedo) —`);
    for (const ndl of [-0.20, -0.10, 0.0, 0.05, 0.10, 0.20, 0.30, 0.50, 0.75]) {
      const cells = [];
      for (const v of [0.0, 0.12, 0.20, 0.30, 0.45]) {
        const r = texelReport(st, ALB.worn, { ndl, sh: 1, ny: 0, sss: v });
        cells.push(`sss${v.toFixed(2)}: L${r.L.toFixed(0).padStart(3)} h${r.h.toFixed(0).padStart(3)} R−B${((r.RmB >= 0 ? '+' : '') + r.RmB.toFixed(0)).padStart(4)}${r.RmB > 10 && r.L > 40 ? '*' : ' '}`);
      }
      const ramp = slyRamp(ndl, T.bands, T.termLo, T.termHi, T.termSoft);
      console.log(`  ndl ${ndl.toFixed(2).padStart(5)} (ramp ${ramp.toFixed(2)})  ${cells.join(' | ')}`);
    }
  }
  console.log('\n  * = clears the CRITIC warm predicate (R−B > +10 ∧ L > 40).');
  console.log('  The ramp column is why this matters: between ndl −0.20 and +0.116 the ramp is 0,');
  console.log('  so these pixels get NO key at all today and render the shade colour — while being');
  console.log('  demonstrably out of cast shadow. That is the population the wrap leg is for.');

  /* The budget question, answered in one line per shot: how far can EVERY SHADING knob,
     pushed to its own known-bad edge simultaneously, carry the bright-shade band? */
  console.log('\n— the SHADING budget on the bright-shade band, all knobs at their known-bad edges at once —');
  const allIn = { shadowSat: 0.0, shadowWash: 0.0, shadowBounceMix: 0.20, shadowBounceMixLit: 0.20, fillSkyMix: 0.0, bounceGain: 0.60, shadowTeal: 0.0 };
  for (const shot of ['hero', 'temple', 'interior']) {
    const b = texelReport(lightState(SHOT_TODS[shot]), ALB.hiero, { ndl: -0.3, sh: 0, ny: 0 });
    const m = texelReport(lightState(SHOT_TODS[shot], allIn), ALB.hiero, { ndl: -0.3, sh: 0, ny: 0 }, allIn);
    console.log(`  ${shot.padEnd(9)} shipped R−B ${b.RmB.toFixed(0).padStart(4)} → all-knobs-max R−B ${m.RmB.toFixed(0).padStart(4)}  (budget ${(m.RmB - b.RmB).toFixed(0)}); the warm predicate needs R−B > +10, i.e. ${(10 - b.RmB).toFixed(0)}`);
  }
}

function modeLit(sub) {
  if (!sub || sub === 'bins') modeLitBins();
  if (!sub || sub === 'pop') modeLitPop();
  if (!sub || sub === 'levers') modeLitLevers();
  if (!sub || sub === 'sweep') modeLitSweep();
}

/* ───────────────────────────── main ───────────────────────────── */

const mode = process.argv[2] || 'all';
console.log(`banda-diag — drift guard PASS (${Object.keys(T).length + Object.keys(G).length + Object.keys(PAL).length} constants + ${lineChecks} load-bearing lines asserted against committed source)`);
if (mode === 'frames' || mode === 'all') modeFrames();
if (mode === 'state' || mode === 'all' || mode === 'chain' || mode === 'attrib' || mode === 'cand' || mode === 'gold' || mode === 'gold2') modeState();
if (mode === 'grade' || mode === 'all' || mode === 'chain' || mode === 'attrib' || mode === 'cand' || mode === 'gold' || mode === 'gold2') modeGrade();
if (mode === 'chain' || mode === 'all') modeChain();
if (mode === 'attrib' || mode === 'all') modeAttrib();
if (mode === 'cand' || mode === 'all') modeCand();
if (mode === 'gold' || mode === 'all') modeGold();
if (mode === 'gold2') modeGold2();
if (mode === 'score') modeScore(process.argv[3] || `${REC}/banda1`);
if (mode === 'cal2') modeCal2(process.argv[3] || `${REC}/banda1`);
if (mode === 'score2') modeScore2(process.argv[3] || `${REC}/banda2`);
if (mode === 'lit') { modeState(); modeGrade(); modeLit(process.argv[3]); }
