#!/usr/bin/env node
/**
 * depthbounce — offline model of the DEPTH-DEPENDENT shadow bounce (§115.4's structural fix).
 *
 * TRANSFORMS THIS MODEL SKIPS vs the renderer (§11 rule — the suffix NOT implemented):
 *   - atmospheric haze, GTAO screen AO (baked `ao` is a parameter here, screen AO is not),
 *     bloom add, vignette, FXAA, grain, screen-space rim + ink, normal-map perturbation of
 *     ndl, local torch lights, per-pixel albedo variation (one mean albedo stands in).
 *   - The FRAME statistic. This computes b-r for ONE surface at one shadowMix. Frame b-r is
 *     an area-weighted mixture over the whole shadowMix distribution, which only a capture
 *     can supply. Read the curves here as "where in shadow depth the red lives", NOT as a
 *     prediction of frame b-r.
 * Everything else — _refreshShadowColor (teal blend, floor, peak cap, luminance-matched
 * bounce), the four-term toon diffuse, the exposure/lift/gain/split/sat/contrast grade and
 * AgX — is transcribed from the live sources and VALIDATED below against the three live
 * uShadowColor readbacks recorded in progress/records/drift/sweep.json.
 */

/* ---- live constants, re-read from source this session (§114.3: never quote a stale one) ---- */
const TM = {
  shadowFloor: 0.125, shadowTintPeak: 0.52, shadowBounceMix: 0.05, shadowTeal: 0.15,
  shadowWash: 0.05, shadowSat: -0.35, bounceGain: 0.42, bakedAO: 0.55,
  keyIntensity: 2.55, ambIntensity: 0.52, fillSkyMix: 0.70,
};
const PAL = { sun: 0xffd9a0, fillSky: 0x6fa8d8, bounce: 0xe8a852, shadowHue: 0x2a3f66, turquoise: 0x2fa8a0 };
const PF = {
  exposure: 0.95, contrast: 1.08, saturation: 1.30, pivot: 0.18,
  lift: [0.006, 0.004, 0.010], gain: [1.035, 1.0, 0.985],
  splitStrength: 0.16, splitRange: [0.04, 0.24],
  splitShadow: 0x2a3f66, splitHighlight: 0xffd9a0,
};

const srgb2lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const lin2srgb = (c) => { c = Math.max(c, 0); return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixv = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const mulS = (a, s) => a.map(x => x * s);
const add = (...vs) => vs.reduce((a, b) => a.map((x, i) => x + b[i]));

/* ---- AgX, exact (matrices as validated by bloomcalc against the shipped anchor) ---- */
const SRGB_TO_2020 = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.0880, 0.8956]];
const R2020_TO_SRGB = [[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]];
const INSET = [[0.856627153315983, 0.0951212405381588, 0.0482516061458583], [0.137318972929847, 0.761241990602591, 0.101439036467562], [0.11189821299995, 0.0767994186031903, 0.811302368396859]];
const OUTSET = [[1.1271005818144368, -0.11060664309660323, -0.016493938717834573], [-0.1413297634984383, 1.157823702216272, -0.016493938717834257], [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]];
const mul = (m, v) => [0, 1, 2].map(r => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);
const agxC = (x) => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; };
function agx(c) {
  const minEv = -12.47393, maxEv = 4.026069;
  let v = mul(SRGB_TO_2020, c); v = mul(INSET, v);
  v = v.map(x => Math.max(x, 1e-10)).map(Math.log2).map(x => Math.min(1, Math.max(0, (x - minEv) / (maxEv - minEv)))).map(agxC);
  v = mul(OUTSET, v);
  v = v.map(x => Math.pow(Math.max(x, 0), 2.2));
  v = mul(R2020_TO_SRGB, v);
  return v.map(x => Math.min(1, Math.max(0, x)));
}
function grade(cIn) {
  const splitShadow = hex2lin(PF.splitShadow), splitHighlight = hex2lin(PF.splitHighlight);
  let c = cIn.map(x => x * PF.exposure);
  c = c.map((x, i) => Math.max(0, x + PF.lift[i] * (1 - x)));
  c = c.map((x, i) => x * PF.gain[i]);
  c = agx(c);
  const L = lum(c);
  const t = 1 - smoothstep(PF.splitRange[0], PF.splitRange[1], L);
  const sc = mixv(splitHighlight, splitShadow, t);
  const scN = mulS(sc, 1 / Math.max(lum(sc), 1e-4));
  c = c.map((x, i) => x * (1 + (scN[i] - 1) * PF.splitStrength));
  const L2 = lum(c);
  c = c.map(x => L2 + (x - L2) * PF.saturation);
  c = c.map(x => Math.max(0, PF.pivot + (x - PF.pivot) * PF.contrast));
  return c.map(x => Math.min(255, Math.max(0, Math.round(lin2srgb(Math.min(1, Math.max(0, x))) * 255))));
}

/* ---- _refreshShadowColor, transcribed from ToonMaterial.js:1495-1567 ---- */
function shadowColor(sbm, { keyLum, teal = TM.shadowTeal, floor = TM.shadowFloor } = {}) {
  const tint = hex2lin(PAL.shadowHue), turq = hex2lin(PAL.turquoise);
  const tintBlend = mixv(tint, turq, teal);
  const tintLum = lum(tintBlend);
  let k = (floor * keyLum) / Math.max(tintLum, 1e-4);
  const peak = Math.max(...tintBlend);
  k = Math.min(k, TM.shadowTintPeak / Math.max(peak, 1e-4));
  const bounce = hex2lin(PAL.bounce);
  const bl = lum(bounce);
  let col = mulS(bounce, bl > 1e-4 ? tintLum / bl : 1);
  col = mixv(col, tintBlend, 1 - sbm);
  return mulS(col, k);
}

/* ================= VALIDATION: reproduce the three live readbacks =================
 * NOT the module default. TUNE.keyIntensity 2.55 gives keyLum 1.858, but LIGHTING
 * republishes the key per time-of-day and _refreshShadowColor runs on the republished
 * value: ToonMaterial's own cap table records hero at keyLum 2.424. Using the default
 * under-scales k by 19.74% on every arm where the peak cap binds — which is how this was
 * caught: teal0 reproduced to 1e-11 (its cap binds either way) while base and sbm20 were
 * out by an identical constant ratio. A constant ratio across arms is a scale bug, not a
 * hue bug, and the two arms that agreed are what localised it. */
const KEYLUM_HERO = 2.424;
const anchors = [
  ['base ', { sbm: 0.05, teal: 0.15 }, [0.09610110548811887, 0.3131151084062172, 0.49658292862905856]],
  ['sbm20', { sbm: 0.20, teal: 0.15 }, [0.15893501882289637, 0.30152904532452285, 0.4263317145162342]],
  ['teal0', { sbm: 0.05, teal: 0.00 }, [0.10335597860116319, 0.1931888320772324, 0.49580604355441954]],
];
console.log(`VALIDATION — model vs live uShadowColor readback (sweep.json), keyLum=${KEYLUM_HERO.toFixed(4)}`);
let worst = 0;
for (const [name, o, live] of anchors) {
  const m = shadowColor(o.sbm, { keyLum: KEYLUM_HERO, teal: o.teal });
  const err = Math.max(...m.map((x, i) => Math.abs(x - live[i])));
  worst = Math.max(worst, err);
  console.log(`  ${name}  model (${m.map(x => x.toFixed(5)).join(', ')})  live (${live.map(x => x.toFixed(5)).join(', ')})  maxErr ${err.toExponential(2)}`);
}
console.log(worst < 3e-3 ? `  PASS — max error ${worst.toExponential(2)} over 3 arms\n` : `  FAIL — model does not reproduce the live readback (${worst})\n`);
if (worst >= 3e-3) process.exit(1);

/* ================= the composite, as a function of shadow depth ================= */
/**
 * Shadow-side composite for one surface. `shadowMix` = 1 - key (1 = deep shade, 0 = fully lit).
 * shadCol is supplied per-pixel so a depth-dependent bounce can be modelled.
 */
function composite(albHex, shadowMix, shadCol, { ny = 0.0, ao = 1.0, keyLum = KEYLUM_HERO } = {}) {
  const alb = hex2lin(albHex);
  const key = 1 - shadowMix;
  const keyRad = mulS(hex2lin(PAL.sun), TM.keyIntensity);
  const lumA = lum(alb);
  const albShadow = mixv([lumA, lumA, lumA], alb, 1 + TM.shadowSat).map(x => Math.min(1, Math.max(0, x)));
  const albAmb = mixv(alb, albShadow, shadowMix);
  const sky = hex2lin(PAL.fillSky), bnc = hex2lin(PAL.bounce);
  const bounceLeg = mixv(bnc, mulS(sky, lum(bnc) / Math.max(lum(sky), 1e-4)), TM.fillSkyMix);
  const hemi = smoothstep(-0.72, 0.55, ny);
  const fill = mulS(mixv(mulS(bounceLeg, TM.bounceGain), sky, hemi), TM.ambIntensity);
  return add(
    alb.map((a, i) => a * keyRad[i] * key),
    albAmb.map((a, i) => a * fill[i] * ao),
    albShadow.map((a, i) => a * shadCol[i] * shadowMix * (0.55 + 0.45 * ao)),
    shadCol.map(s => s * TM.shadowWash * shadowMix * ao),
  );
}

const SANDSTONE = 0xc9915a;   // §2.2 sandstone mid — the stone that fills the daylight frames
const LIMESTONE = 0xd4c19a;   // §2.2 limestone mid — §114.2's other stone

const hue = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; };
const bmr = (px) => (px[2] - px[0]) / 255;
const gDarkest = (px) => px[1] < px[0] && px[1] < px[2];

/* ---- gate shapes ---- */
const SBM_DEEP = 0.05;                       // shipped — the value that passes the ledger
/** Depth-dependent share: warm at the terminator, teal in deep shade. */
const gateShare = (shadowMix, lo, hi, sbmLit, sbmDeep = SBM_DEEP) =>
  sbmLit + (sbmDeep - sbmLit) * smoothstep(lo, hi, shadowMix);

console.log('=== b-r and hue vs shadow depth, sandstone #c9915a, vertical face (Nw.y=0), ao=1 ===');
console.log('  arms: base=sbm 0.05 everywhere | rev=sbm 0.20 everywhere | gate=depth-dependent 0.20->0.05 over [0.35,0.75]');
console.log('');
console.log('  sMix |      base        |      rev(0.20)   |      gate        | d(b-r) gate-base');
console.log('       |  b-r   hue  Gdrk |  b-r   hue  Gdrk |  b-r   hue  Gdrk |');
const rows = [];
for (const sm of [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
  const cBase = grade(composite(SANDSTONE, sm, shadowColor(SBM_DEEP, { keyLum: KEYLUM_HERO })));
  const cRev = grade(composite(SANDSTONE, sm, shadowColor(0.20, { keyLum: KEYLUM_HERO })));
  const cGate = grade(composite(SANDSTONE, sm, shadowColor(gateShare(sm, 0.35, 0.75, 0.20), { keyLum: KEYLUM_HERO })));
  rows.push([sm, bmr(cBase), bmr(cRev), bmr(cGate)]);
  console.log(`  ${sm.toFixed(1)}  | ${bmr(cBase).toFixed(4)} ${hue(...cBase).toFixed(0).padStart(4)} ${gDarkest(cBase) ? ' Y' : ' n'}  | ${bmr(cRev).toFixed(4)} ${hue(...cRev).toFixed(0).padStart(4)} ${gDarkest(cRev) ? ' Y' : ' n'}  | ${bmr(cGate).toFixed(4)} ${hue(...cGate).toFixed(0).padStart(4)} ${gDarkest(cGate) ? ' Y' : ' n'}  | ${(bmr(cGate) - bmr(cBase)).toFixed(4)}`);
}

/* ---- where does the revert's authority actually live? ---- */
console.log('\n=== authority of a full revert (sbm 0.05 -> 0.20), by shadow depth ===');
let tot = 0;
for (const [sm, b, r] of rows) tot += Math.abs(r - b);
for (const [sm, b, r] of rows) {
  const d = r - b;
  const bar = '#'.repeat(Math.round(Math.abs(d) / 0.002));
  console.log(`  sMix ${sm.toFixed(1)}  d(b-r) ${d.toFixed(4)}  ${(100 * Math.abs(d) / tot).toFixed(1).padStart(5)}% of total  ${bar}`);
}
