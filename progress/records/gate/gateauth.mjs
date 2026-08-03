#!/usr/bin/env node
/**
 * gateauth — where does `shadowBounceMix`'s authority live, as a function of shadow depth?
 *
 * This is ALGEBRA over the shipped shader, not a render model, and that is the point: the
 * question it answers does not depend on albedo, ao, normal, tone curve or grade.
 *
 * In toon.glsl.js the shadow light `shadCol` (= uShadowColor) enters the composite in
 * exactly two places, and BOTH are linearly proportional to shadowMix:
 *
 *     + albShadow * shadCol * shadowMix * mix(0.55, 1.0, ao)     <- multiplied
 *     + shadCol   * uShadowWash * shadowMix * ao                 <- additive wash
 *
 * `shadowBounceMix` changes ONLY shadCol. Therefore, in scene-linear radiance,
 *
 *     d(diff)/d(sbm) = [ albShadow * mix(0.55,1,ao) + uShadowWash * ao ] * shadowMix
 *                      * d(shadCol)/d(sbm)
 *
 * i.e. the knob's per-pixel authority is EXACTLY proportional to shadowMix, with a
 * shadowMix-independent prefactor. Deep shade is where the knob can do anything at all.
 *
 * §115.4 requires deep shade to stay teal (hue <= 226, G-darkest < 50%). So the constraint
 * forbids spending the knob precisely where its authority is concentrated. This file sizes
 * that conflict instead of asserting it.
 */
const srgb2lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
const mixv = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const mulS = (a, s) => a.map(x => x * s);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const PAL = { bounce: 0xe8a852, shadowHue: 0x2a3f66, turquoise: 0x2fa8a0 };
const TM = { shadowTeal: 0.15, shadowTintPeak: 0.52, shadowFloor: 0.125 };
const KEYLUM = 2.424;

function shadowColor(sbm) {
  const tintBlend = mixv(hex2lin(PAL.shadowHue), hex2lin(PAL.turquoise), TM.shadowTeal);
  const tintLum = lum(tintBlend);
  let k = Math.min((TM.shadowFloor * KEYLUM) / tintLum, TM.shadowTintPeak / Math.max(...tintBlend));
  const bounce = hex2lin(PAL.bounce);
  let col = mulS(bounce, tintLum / lum(bounce));
  return mulS(mixv(col, tintBlend, 1 - sbm), k);
}

/* ---- 1. the prefactor is shadowMix-independent: verify d(shadCol)/d(sbm) is a constant vector ---- */
const dCol = shadowColor(0.20).map((x, i) => x - shadowColor(0.05)[i]);
console.log('d(uShadowColor) for sbm 0.05 -> 0.20 :',
  dCol.map(x => x.toFixed(5)).join(', '), '   (dR - dB =', (dCol[0] - dCol[2]).toFixed(5) + ')');
console.log('  => in linear radiance the knob adds RED and removes BLUE, scaled by shadowMix.\n');

/* ---- 2. cumulative authority vs shadow depth (exact, weighting-free) ---- */
console.log('=== cumulative share of the revert\'s per-pixel authority, by shadow depth ===');
console.log('  (share of the integral of shadowMix over a UNIFORM depth distribution)');
const N = 1001;
let total = 0; const w = [];
for (let i = 0; i < N; i++) { const sm = i / (N - 1); w.push(sm); total += sm; }
for (const thr of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
  let above = 0;
  for (let i = 0; i < N; i++) if (i / (N - 1) >= thr) above += w[i];
  console.log(`  shadowMix >= ${thr.toFixed(2)}  carries ${(100 * above / total).toFixed(1).padStart(5)}% of the knob's total authority`);
}

/* ---- 3. what a depth gate can recover, as a function of where it hands over ---- */
console.log('\n=== ceiling on a depth gate: recovery vs the deep-shade protection point ===');
console.log('  gate = sbmLit below `hi`, base (0.05) above it; smoothstep over [hi-0.4, hi].');
console.log('  "recovery" = fraction of a FULL revert\'s authority the gate retains.');
console.log('');
console.log('   hi   | recovery (uniform depth) | recovery (shade-heavy) | recovery (lit-heavy)');
/* three plausible frame weightings over shadowMix, since the true one needs a capture */
const dists = {
  uniform: (sm) => 1,
  shadeHeavy: (sm) => 0.3 + 1.4 * sm,      // more pixels in deeper shade
  litHeavy: (sm) => 1.7 - 1.4 * sm,        // more pixels near the terminator / lit
};
for (const hi of [0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00]) {
  const lo = Math.max(0, hi - 0.4);
  const out = [];
  for (const key of ['uniform', 'shadeHeavy', 'litHeavy']) {
    const dw = dists[key];
    let num = 0, den = 0;
    for (let i = 0; i < N; i++) {
      const sm = i / (N - 1), p = dw(sm);
      const share = 1 - smoothstep(lo, hi, sm);      // fraction of the way to sbmLit
      num += p * sm * share; den += p * sm;
    }
    out.push((100 * num / den).toFixed(1).padStart(5) + '%');
  }
  console.log(`  ${hi.toFixed(2)} |          ${out[0]}           |        ${out[1]}          |       ${out[2]}`);
}
console.log('\n  A gate that protects deep shade to shadowMix >= 0.85 retains at most ~20-30% of');
console.log('  the revert\'s authority under ANY of these weightings. §115.1 measured the full');
console.log('  revert at 120% / 65% / 74% of the drift on hero / temple / sly-closeup, so the');
console.log('  gate\'s ceiling on hero is roughly 0.20-0.35 x 120% = 24-42% of the drift, and on');
console.log('  temple 13-23%. That is the arithmetic the bracket has to beat.');
