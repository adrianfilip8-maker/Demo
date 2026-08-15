/**
 * rimfloor-derive.mjs — every number in PREREG-rimfloor.md, derived offline, before any
 * candidate frame exists (§141.1).
 *
 *   node progress/records/rimsucc/rimfloor-derive.mjs
 *
 * NOTHING here reads a frame. Two input classes only, and both are already-fixed facts:
 *
 *   (A) MEASURED — the per-edge `spike(off)` and `spike(screenoff)` figures the registered
 *       instrument `progress/records/rim/rim-score.mjs` produced on `progress/records/rim1/`,
 *       transcribed from `progress/records/logs/rim-score.txt` and RESULT-rim.md. These are
 *       PREREG-rim's verdict rows; they are not re-measured here and must not be.
 *   (B) SHIPPED CONSTANTS — `src/render/PostFX.js` TUNE (`rimShadowFloor` 0.45,
 *       `rimStrength` 0.70, `rimLit` #7fd4ff, `rimShade` #6fa8d8) and the composite
 *       expression at PostFX.js:1487-1506, read at this sha.
 *
 * Class (A) is pooled where RESULT-rim pooled it. Where a per-shot figure does not exist in
 * the record (Path B's per-shot key-side contribution), this file says so and substitutes the
 * pooled slope EXPLICITLY rather than inventing one — see `POOLED_SLOPE_CAVEAT`.
 */

/* ── (B) shipped constants, PostFX.js TUNE ──────────────────────────────────────────────── */
const F_SHIPPED = 0.45;          // TUNE.rimShadowFloor  (PostFX.js:217)
const S_SHIPPED = 0.70;          // TUNE.rimStrength     (PostFX.js:73)
const RIM_LIT = [0x7f, 0xd4, 0xff];   // TUNE.rimLit   — display space via displayColor()
const RIM_SHADE = [0x6f, 0xa8, 0xd8]; // TUNE.rimShade — display space via displayColor()

/* Rec.709 luma, the scorer's own weights (rim-edges.mjs L709, and slyLuma in passes/Common.js
   uses the identical vector). Byte in, 0..1 out. */
const luma01 = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/* ── (A) measured — rim-score.txt, `progress/records/rim1/`, 2026-08-15 ─────────────────── */
const SPIKE_OFF = {
  'hero/cap-top':            { face: 'KEY',    spike5: true,  v: 27.04, body: 14.63 },
  'hero/muzzle-front':       { face: 'KEY',    spike5: false, v: -0.74, body: 41.28 },
  'hero/chest-front':        { face: 'KEY',    spike5: true,  v: 28.46, body: 37.25 },
  'hero/torso-back':         { face: 'SHADOW', spike5: false, v: 1.31,  body: 30.48 },
  'hero/tail-top':           { face: 'KEY',    spike5: true,  v: 27.13, body: 30.93 },
  'hero/tail-right':         { face: 'SHADOW', spike5: false, v: -0.61, body: 35.45 },
  'hero/glove-left':         { face: 'KEY',    spike5: false, v: 6.23,  body: 33.53 },
  'hero/glove-right':        { face: 'SHADOW', spike5: false, v: 10.21, body: 33.46 },
  'sly-profile/cap-top':     { face: 'KEY',    spike5: false, v: 6.08,  body: 34.82 },
  'sly-profile/cap-front':   { face: 'KEY',    spike5: false, v: 5.51,  body: 36.19 },
  'sly-profile/cap-back':    { face: 'SHADOW', spike5: false, v: -6.25, body: 34.71 },
  'sly-profile/muzzle-front':{ face: 'KEY',    spike5: false, v: -5.02, body: 48.38 },
  'sly-profile/torso-front': { face: 'KEY',    spike5: true,  v: 30.03, body: 35.28 },
  'sly-profile/torso-back':  { face: 'SHADOW', spike5: false, v: 1.06,  body: 32.69 },
  'sly-profile/tail-top':    { face: 'KEY',    spike5: true,  v: 28.71, body: 26.61 },
  'sly-profile/tail-right':  { face: 'SHADOW', spike5: false, v: -3.41, body: 29.51 },
  'night/cap-top':           { face: 'KEY',    spike5: false, v: 3.38,  body: 11.38 },
  'night/head-front':        { face: 'KEY',    spike5: false, v: 13.70, body: 10.11 },
  'night/glove-top':         { face: 'KEY',    spike5: false, v: 0.80,  body: 8.31 },
  'night/glove-right':       { face: 'SHADOW', spike5: false, v: 1.27,  body: 9.01 },
  // night/torso-right — PINNED, instrument-invalid, dropped by PF_EDGE. Not listed on purpose.
};
/* RESULT-rim §2 / §4 — the two pooled decomposition figures, over KEY5 and SHADOW7. */
const KEY5_MEAN_OFF   = 28.27;  // mean spike(off)                       over KEY5
const SHARE_SURF      = 17.60;  // mean spike(screenoff)                 over KEY5  (Path A alone)
const SHARE_SCREEN    = 10.67;  // KEY5_MEAN_OFF - SHARE_SURF            (Path B's key-side output)
const SSCREEN         = 3.87;   // mean spike(off) - spike(screenoff)    over SHADOW7 (Path B's shadow output)
/* PREREG-rim §7 M2 — the shipped SURFACE-rim constants' own integrated shadow/lit ratio over
   N.V in [0, 0.40], 4000-sample quadrature (`rim-offline.mjs`). Carried UNMOVED as this seal's
   acceptance fraction; not re-derived here. */
const ATTEN_112 = 0.112;

const POOLED_SLOPE_CAVEAT =
  'Path B\'s key-side contribution is recorded pooled over KEY5 (10.67 L) and its shadow-side\n'
  + '  contribution pooled over SHADOW7 (3.87 L). NO per-shot split exists in the record, so every\n'
  + '  per-shot prediction below substitutes the POOLED slope. Named as the model\'s weakest link;\n'
  + '  the seal measures each shot\'s own slope in-run from its own zero/off anchors.';

/* ── helpers ────────────────────────────────────────────────────────────────────────────── */
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sel = (shot, face, only5 = false) => Object.entries(SPIKE_OFF)
  .filter(([k, e]) => k.startsWith(`${shot}/`) && e.face === face && (!only5 || e.spike5))
  .map(([, e]) => e.v);
const f3 = (x) => (x >= 0 ? ' ' : '') + x.toFixed(3);
const line = (s) => console.log(s);

/* ── 1. the statistic on the shipped build ──────────────────────────────────────────────── */
line('=== 1. R(off, shot) = mean SHADOW spike / mean KEY5 spike, same frame ===');
const SHOTS = ['hero', 'sly-profile'];
const ref = {};
for (const s of SHOTS) {
  const k = sel(s, 'KEY', true), sh = sel(s, 'SHADOW');
  ref[s] = { key: mean(k), shad: mean(sh), R: mean(sh) / mean(k), nk: k.length, ns: sh.length };
  line(`  ${s.padEnd(12)} KEY5 n=${ref[s].nk} mean ${f3(ref[s].key)}   SHADOW n=${ref[s].ns} mean ${f3(ref[s].shad)}   R = ${f3(ref[s].R)}`);
}
line(`  pooled KEY5 mean ${f3(mean(Object.values(SPIKE_OFF).filter((e) => e.spike5).map((e) => e.v)))} L  (RESULT-rim: ${KEY5_MEAN_OFF})`);
line(`  pooled SHADOW7 mean ${f3(mean(Object.values(SPIKE_OFF).filter((e) => e.face === 'SHADOW').map((e) => e.v)))} L  (RESULT-rim: 0.51)`);
line('  night carries ONE shadow edge and no key-side reference (its "KEY" edges mean '
  + `${f3(mean(sel('night', 'KEY')))} L). Excluded from every A-row, in advance, exactly as`);
line('  PREREG-rim §4 excluded it from M2.');

/* ── 2. Path B against its OWN contract — the finding that re-reads RESULT-rim §4/§6 ────── */
line('\n=== 2. Path B vs its own contract (NOT vs the whole band) ===');
const lLit = luma01(RIM_LIT), lShade = luma01(RIM_SHADE);
const colourRatio = lShade / lLit;
line(`  luma(rimLit  #7fd4ff) = ${lLit.toFixed(5)}`);
line(`  luma(rimShade #6fa8d8) = ${lShade.toFixed(5)}`);
line(`  colour ratio shadow/lit = ${colourRatio.toFixed(5)}   <- rimCol = mix(uRimShade, uRimLit, edge.b)`);
/* The light-wrap factor (1-c) evaluated at the two BODY levels the instrument measured. */
const bodyKey = mean(Object.values(SPIKE_OFF).filter((e) => e.spike5).map((e) => e.body));
const bodyShad = mean(Object.values(SPIKE_OFF).filter((e) => e.face === 'SHADOW').map((e) => e.body));
const wrapRatio = (1 - bodyShad / 100) / (1 - bodyKey / 100);
line(`  mean BODY  KEY5 ${f3(bodyKey)} L   SHADOW7 ${f3(bodyShad)} L   =>  (1-c) ratio = ${wrapRatio.toFixed(5)}`);
const predictedRatio = F_SHIPPED * colourRatio * wrapRatio;
const predictedSscreen = predictedRatio * SHARE_SCREEN;
line(`  PREDICTED  Sscreen = ${F_SHIPPED} x ${colourRatio.toFixed(3)} x ${wrapRatio.toFixed(3)} x ${SHARE_SCREEN} = ${predictedSscreen.toFixed(3)} L`);
line(`  MEASURED   Sscreen = ${SSCREEN} L        ratio measured/predicted = ${(SSCREEN / predictedSscreen).toFixed(4)}`);
line(`  RESULT-rim's "owes 12.72 L, pays 3.87 L, 3.3x short" uses 0.45 x ${KEY5_MEAN_OFF} — the WHOLE`);
line(`  key band, 62% of which is Path A. uRimShadowFloor multiplies only edge.g * uRimStrength`);
line('  (PostFX.js:1505); it has no access to Path A\'s output. Correct denominator: SHARE_SCREEN.');

/* ── 3. the dose-response slope, and why it is exactly affine ───────────────────────────── */
line('\n=== 3. dose response: shadow-side spike is EXACTLY affine in uRimShadowFloor ===');
line('  amt = edge.g * uRimStrength * (F*(1-b) + b);  c += rimCol * amt * (1-c), c pre-rim.');
line('  edge.g <= 1  (PostFX.js:1128-1133: 0.55*rimMid + 0.45*rimOut <= 1), so for F <= 1');
line(`  amt <= uRimStrength = ${S_SHIPPED} < 1 and c + rimCol*amt*(1-c) < 1: the band NEVER clips.`);
const SLOPE = SSCREEN / F_SHIPPED;
line(`  pooled slope = Sscreen / F_shipped = ${SSCREEN} / ${F_SHIPPED} = ${SLOPE.toFixed(4)} L per unit floor`);
const pooledAt = (F) => 0.5114 + SLOPE * (F - F_SHIPPED);
line(`  pooled SHADOW7 mean spike:  F=0 -> ${f3(pooledAt(0))}   F=0.45 -> ${f3(pooledAt(0.45))}`
  + `   F=0.85 -> ${f3(pooledAt(0.85))}   F=1.00 -> ${f3(pooledAt(1))}`);
line(`  (F=0 intercept ${f3(pooledAt(0))} reproduces RESULT-rim §4's -3.36 L.)`);
line(`  CAVEAT: ${POOLED_SLOPE_CAVEAT}`);

/* ── 4. the acceptance bar, and the dose it implies ─────────────────────────────────────── */
line('\n=== 4. acceptance A1: dR(shot) = R(dose) - R(off) >= 0.112, per shot ===');
line(`  0.112 is PREREG-rim §7 M2's DOWNSTREAM band, carried UNMOVED: the integrated shadow/lit`);
line('  ratio of the shipped SURFACE-rim constants over N.V in [0,0.40]. It is what the shading');
line('  path itself declares a shadow-side rim is worth relative to the lit side.');
for (const s of SHOTS) {
  const needL = ATTEN_112 * ref[s].key;
  const needF = F_SHIPPED + needL / SLOPE;
  line(`  ${s.padEnd(12)} needs d(shadow mean) >= ${ATTEN_112} x ${f3(ref[s].key)} = ${needL.toFixed(4)} L`
    + `  =>  F >= ${needF.toFixed(4)}`);
}
const breakEven = Math.max(...SHOTS.map((s) => F_SHIPPED + (ATTEN_112 * ref[s].key) / SLOPE));
line(`  binding shot break-even F = ${breakEven.toFixed(4)}  -> low dose = smallest 0.05 step above it = 0.85`);
line('  high dose = 1.00, the uniform\'s SEMANTIC ceiling (the shadow side keeps 100% of the lit');
line('  side\'s strength; above 1 a "floor" is no longer a floor).');

line('\n  predicted per-shot outcome at each registered dose (pooled slope):');
line('   shot          F      shadow mean    R        dR       bar 0.112');
for (const F of [0.00, 0.45, 0.85, 1.00]) {
  for (const s of SHOTS) {
    const sh = ref[s].shad + SLOPE * (F - F_SHIPPED);
    const R = sh / ref[s].key, dR = R - ref[s].R;
    const verdict = F <= F_SHIPPED ? '     -' : (dR >= ATTEN_112 ? '  PASS' : '  FAIL');
    line(`   ${s.padEnd(12)} ${F.toFixed(2)}   ${f3(sh).padStart(8)}    ${f3(R)}  ${f3(dR)}${verdict}`);
  }
}

/* ── 5. matched-pair confirmation row A1p ───────────────────────────────────────────────── */
line('\n=== 5. A1p — matched-part pairs (same body part, same frame, opposite face) ===');
const PAIRS = {
  hero: [['hero/chest-front', 'hero/torso-back'], ['hero/tail-top', 'hero/tail-right']],
  'sly-profile': [['sly-profile/torso-front', 'sly-profile/torso-back'],
    ['sly-profile/tail-top', 'sly-profile/tail-right']],
};
for (const s of SHOTS) {
  const k = mean(PAIRS[s].map(([a]) => SPIKE_OFF[a].v));
  const sh = mean(PAIRS[s].map(([, b]) => SPIKE_OFF[b].v));
  line(`  ${s.padEnd(12)} Rpair(off) = ${f3(sh)} / ${f3(k)} = ${f3(sh / k)}`
    + `   dRpair@0.85 = ${f3((SLOPE * 0.40) / k)}   dRpair@1.00 = ${f3((SLOPE * 0.55) / k)}`);
}
line('  hero R(off) 0.132 vs Rpair(off) 0.013: the whole gap is hero/glove-right (+10.21 L), the');
line('  edge PREREG-rim §1.3 named as its own counterexample. A1 and A1p must AGREE or the dose');
line('  is INCONCLUSIVE — it is not a licence to pick the row that passed.');

/* ── 6. edge.b recovered per edge from three arms (reported row M-B) ────────────────────── */
line('\n=== 6. M-B — edge.b recovered exactly, from off / screenoff / zero ===');
line('  PathB(F) = A(b) * (F*(1-b) + b), A(b) independent of F, so with');
line('    rho = [spike(zero) - spike(screenoff)] / [spike(off) - spike(screenoff)]');
line('    b   = 0.45*rho / (1 - 0.55*rho)      — the colour and wrap factors CANCEL exactly.');
for (const rho of [0.0, 0.2, 0.5, 0.8, 1.0]) {
  const b = (F_SHIPPED * rho) / (1 - (1 - F_SHIPPED) * rho);
  line(`    rho ${rho.toFixed(2)} -> edge.b ${b.toFixed(3)}`);
}
line('  NO-CLAIM for an edge whose denominator < 1.0 L (two 8-bit luma codes = 0.784 L).');

/* ── 7. tolerances, all from the 8-bit floor ────────────────────────────────────────────── */
line('\n=== 7. tolerances ===');
const CODE_L = 100 / 255;
line(`  one 8-bit code on the L scale = 100/255 = ${CODE_L.toFixed(4)} L`);
line(`  spike is a difference of two L values => two codes = ${(2 * CODE_L).toFixed(4)} L`);
line(`  M-LIN / M-KEY tolerance = 1.0 L  (two codes rounded up; the rounding buys the FXAA pass,`);
line('    PostFX.js:2372-2375, which runs LAST on the composite and can re-decide an edge when');
line('    the band under it changes brightness)');
line(`  C3 P_body bar = 0.8 L  (two codes, NOT rounded up: BODY samples sit >= 6 px inside i0`);
line('    while Path B\'s band ends 4.4 px inside the DEPTH silhouette, so no part of the band');
line('    can reach a BODY sample and any movement at all is instrument leakage)');

/* ── 8. off-subject cost extrapolation (C2), stated with its weakness ───────────────────── */
line('\n=== 8. C2 — night seam-glint growth band ===');
const step327 = 0.45 - 0.10, dose327 = 1.00 - 0.45;
const extrap = 0.10 * (dose327 / step327);
line(`  §327: taking the SCREEN floor 0.45 -> 0.10 (delta ${step327.toFixed(2)}) removed ~10% of night's`);
line(`  speck population. This dose is +${dose327.toFixed(2)}, i.e. ${(dose327 / step327).toFixed(3)}x that magnitude, opposite sign`);
line(`  => linear extrapolation +${(100 * extrap).toFixed(1)}%. Band set at +30%, i.e. ${(0.30 / extrap).toFixed(2)}x the extrapolation.`);
line('  Weak in three named ways: it was a MARGINAL effect measured on top of an arch-floor cut;');
line('  it was measured under torchlight3 {dt:0} staging, not this seal\'s live-settle-then-freeze;');
line('  and a COUNT is a threshold crossing, not an amplitude. The LOOK carries the real protection.');

/* ── 9. what the lever cannot reach ─────────────────────────────────────────────────────── */
line('\n=== 9. reachability — stated so the seal cannot be read as closing §7.3 ===');
const spikeThresholdFraction = 20.0 / KEY5_MEAN_OFF;
line(`  "a rim is present" = spike >= 20.0 L (PREREG-rim §1.3(b)) = ${spikeThresholdFraction.toFixed(3)} of the key band.`);
for (const s of SHOTS) {
  const needF = F_SHIPPED + (20.0 - ref[s].shad) / SLOPE;
  line(`  ${s.padEnd(12)} would need F = ${needF.toFixed(2)} to put its shadow edges at 20.0 L — out of range.`);
}
const contractF = F_SHIPPED + (0.45 * KEY5_MEAN_OFF - 0.5114) / SLOPE;
line(`  src's own sentence (toon.glsl.js:1210-1212, "that is where the shadow-side rim lives now")`);
line(`  read as 0.45 of the WHOLE band = ${(0.45 * KEY5_MEAN_OFF).toFixed(2)} L needs F = ${contractF.toFixed(2)}. Also out of range.`);
line('  This seal buys a fraction, not a fix. §7.3 is closed by the LOOK or not at all.');

/* ── 10. frame budget ───────────────────────────────────────────────────────────────────── */
line('\n=== 10. frame budget ===');
const ARMS = 6, SHOTS_N = 3;
const chunkMin = 4 + 6 + (ARMS - 1) * (47 / 60);
line(`  ${SHOTS_N} shots x ${ARMS} arms = ${SHOTS_N * ARMS} frames, ${SHOTS_N} chunks of ${ARMS}.`);
line(`  per chunk: 4 min boot+stage + 6 min to first captured arm + ${ARMS - 1} x 47 s`
  + ` = ${chunkMin.toFixed(1)} min  (cap ~15)`);
