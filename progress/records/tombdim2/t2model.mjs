/**
 * t2model.mjs — PREREG-tombdim2's band-derivation model. Run BEFORE the seal was written;
 * every band in PREREG-tombdim2 §6 is read off this file's output, and the file is committed
 * with the seal so the derivation is auditable and re-runnable (§141.1: bands are derived
 * before the capture, never moved after it).
 *
 *   node progress/records/tombdim2/t2model.mjs
 *
 * WHAT IT DOES — two halves, one exact and one fitted.
 *
 * (1) EXACT (drives the REAL modules, like gtmodel.mjs did for the parent): the interior
 *     payload through `evalAtmosphere(0.5)` + `Shading.setKeyLight` at camera y -9.2, which
 *     gives the uniform-level predictions the VB readback bar asserts with equality —
 *     uAmbIntensity == off x tombAmb and the §261 cap-release ratio on uShadowColor.
 *
 * (2) FITTED (a 2-term linear decomposition of the MEASURED parent frames): every interior
 *     ROI's display bytes are inverted through the shipped grade chain (`tonecurve.mjs`,
 *     validated grey row, worst 0.35 L) and split into an AMBIENT-owned leg A and a
 *     POOL-owned leg P, using the parent run's two dim arms as the two equations:
 *
 *         X(off)  = A + P                      (tombAmb 1.0, localToon 2.5)
 *         X(bon)  = m*A + P                    (tombAmb 0.30, localToon 2.5)
 *
 *     with m — the ambient family's LINEAR factor at tombAmb 0.30 — measured on the two
 *     ambient-owned rects (FAR, VAULT) rather than assumed to be 0.30, because the §261 cap
 *     releases as the floor drops (the shadow light falls x0.409, not x0.30) so the two legs
 *     of the ambient family do not scale together.
 *
 *     The pool leg's response to the co-lever is LINEAR in uLocalToon in the shader
 *     (`diff += alb * min(slyLocalAcc * uLocalToon, 1.6)`) up to the 1.6 cap, so the model
 *     scales P by (k/2.5) x sigma(k), where sigma is the MEASURED saturation from
 *     RESULT-torchlight3's KO1 dose arm (POOL display L 70.7 @k=0, 95.0 @k=2.5, 110.5 @k=6.0
 *     on this same rect and this same camera): sigma(6.0) = 0.79, interpolated linearly in k
 *     from sigma(2.5) = 1, EXTRAPOLATED above k = 6.0 (the p30hi arm is the arm that measures
 *     that extrapolation — it is registered as a dose arm for exactly this reason).
 *
 * OUT-OF-SAMPLE CHECK: the parent's THIRD interior arm (bko, tombAmb 0.15) is not used in any
 * fit. The model predicts it and prints the residual; §4 of the seal quotes the worst one.
 *
 * WHAT THIS MODEL IS NOT (§11): it is a per-ROI-mean model of the grade axis. It does not
 * model AO, ink, bloom's spatial gather, FXAA, or the within-ROI distribution — so an ROI mean
 * whose pixels straddle the 1.6 cap is predicted with a fitted sigma, not from first
 * principles, and whole-frame POPULATION statistics (cool/warm/dark/bright shares) are
 * REPORTED by the scorer, never barred, because this model cannot predict them.
 *
 * MEASURED INPUTS, all from committed records (no frame in this repo's history is read):
 *   - progress/records/logs/tombdim-score.log (commit faacf7c) — the parent gradetrio run's
 *     interior ROI table for arms off / bon(0.30) / bko(0.15) at localToon 2.5.
 *   - RESULT-torchlight3.md §Scoreboard — POOL +24.3 L @2.5 over a 70.7 L base, +39.8 @6.0.
 *   - Rects marked NEW below were derived by looking at the parent's base-tree frame
 *     (`gradetrio1/interior.off.png`, the shadowhold rule) and are recorded in seal §4.
 *
 * RE-RUN CAVEAT: half (1) imports the WORKING TREE's modules. On a tree six lanes share, run
 * it with `src/` clean or you are reading another lane's installed candidate. The values in
 * PREREG-tombdim2 §2 were taken from a pristine `git archive HEAD` checkout and are:
 * uAmbIntensity 0.5863987921718226 (off) / 0.17591963765154675 (0.30) / 0.26387945647732014
 * (0.45); uShadowColor lum ratio 0.40879 (0.30) / 0.61319 (0.45).
 */
import { grade } from '../tonecurve.mjs';
import { createAtmosphereState, evalAtmosphere } from '../../../src/render/Atmosphere.js';
import { Shading } from '../../../src/render/ToonMaterial.js';

const L709 = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const lumC = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/* ── (1) EXACT: the uniform-level predictions the VB bar asserts ─────────────────────────── */
console.log('== (1) exact, through the live modules: interior tod 0.5, camera y -9.2 ==');
const EXACT = {};
{
  const s = createAtmosphereState();
  evalAtmosphere(0.5, s);
  const p = {
    direction: s.keyDir, color: s.keyColor, intensity: s.keyIntensity,
    ambient: { sky: s.hemiSky, ground: s.hemiGround, intensity: s.ambientIntensity, floor: s.shadowFloor, tint: s.shadowTint },
    nightAmount: s.nightAmount, local: 2.5,
  };
  const mk = (tomb, camY = -9.2, local = 2.5) => {
    const sh = new Shading({ debug: tomb === null ? {} : { tombAmb: tomb }, camera: { position: { y: camY } } });
    sh.setKeyLight({ ...p, local });
    return sh;
  };
  const base = mk(null);
  const ambOff = base.uniforms.uAmbIntensity.value, scOff = lumC(base.uniforms.uShadowColor.value);
  console.log(`  off: uAmbIntensity ${ambOff}  uShadowColor lum ${scOff.toFixed(6)}  tombF ${base._tombF}`);
  for (const t of [0.30, 0.45]) {
    const sh = mk(t);
    const amb = sh.uniforms.uAmbIntensity.value;
    const r = lumC(sh.uniforms.uShadowColor.value) / scOff;
    EXACT[t] = { amb, ratio: r };
    console.log(`  tombAmb ${t}: uAmbIntensity ${amb}  (== off x ${t} exactly: ${amb === ambOff * t})  tombF ${sh._tombF}`
      + `  uShadowColor lum ratio ${r.toFixed(5)}  (cap-release; the parent MEASURED 0.4088 at 0.30)`);
  }
  const a = mk(0.30, 2.6, 8.0), b = mk(null, 2.6, 2.5);
  console.log(`  above ground (cam y 2.6) at the extreme poke: tombF ${a._tombF}, uAmbIntensity identical ${a.uniforms.uAmbIntensity.value === b.uniforms.uAmbIntensity.value},`
    + ` uShadowColor identical ${a.uniforms.uShadowColor.value.r === b.uniforms.uShadowColor.value.r},`
    + ` uLocalToon took the poke ${a.uniforms.uLocalToon.value} (the shader's y < -0.5 gate is what zeroes it, not the publish)`);
}

/* ── (2) FITTED: the ambient/pool decomposition of the measured parent frames ─────────────── */
/* display byte means per ROI per arm: [off(1.0), bon(0.30), bko(0.15)] at localToon 2.5.
   R,G,B from the parent frames; L/RB in the log are reproduced by these triples. */
const M = {
  /* carried by citation from PREREG-tombdim §4 */
  FAR:   { rect: [380, 30, 560, 120],  rgb: [[66.4, 61.5, 81.1], [46.5, 36.4, 52.1], [39.5, 24.5, 36.1]] },
  VAULT: { rect: [560, 10, 900, 90],   rgb: [[66.1, 75.8, 81.1], [38.1, 42.4, 52.5], [28.5, 24.9, 33.2]] },
  POOL:  { rect: [292, 432, 392, 490], rgb: [[145.1, 82.7, 69.7], [139.2, 60.3, 41.4], [137.1, 50.8, 29.2]] },
  CTRL:  { rect: [150, 560, 520, 700], rgb: [[110.6, 78.2, 74.7], [96.7, 48.2, 46.0], [92.7, 33.3, 27.8]] },
  SARC:  { rect: [600, 120, 840, 300], rgb: [[79.0, 70.6, 68.0], [66.7, 46.6, 43.2], [62.5, 35.2, 30.0]] },
  /* NEW (seal §4, derived on gradetrio1/interior.off.png) */
  GOLD:  { rect: [600, 155, 840, 290], rgb: [[79.1, 71.0, 67.5], [68.0, 48.1, 43.5], [64.2, 37.3, 30.9]] },
  JARS:  { rect: [800, 455, 882, 508], rgb: [[137.1, 121.6, 108.6], [124.1, 91.9, 74.1], [118.4, 76.1, 56.4]] },
  JARSL: { rect: [437, 362, 495, 458], rgb: [[116.3, 110.1, 102.9], [99.3, 80.0, 71.3], [91.6, 63.2, 54.4]] },
  JARST: { rect: [368, 336, 440, 420], rgb: [[138.9, 112.4, 100.8], [132.0, 88.4, 68.9], [129.7, 77.7, 53.1]] },
};
/* per-channel display<->linear on the shipped grade chain's grey axis */
const dch = (X) => grade([X, X, X])[1];
const invCh = (v) => { let lo = 1e-6, hi = 40; for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; if (dch(m) < v) lo = m; else hi = m; } return (lo + hi) / 2; };
const invL = (Lv) => { let lo = 1e-6, hi = 40; for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; if (L709(grade([m, m, m])) < Lv) lo = m; else hi = m; } return (lo + hi) / 2; };

/* m: the ambient family's linear factor, measured on the two ambient-owned rects */
const mCh = [0, 1, 2].map((c) => (['FAR', 'VAULT'].reduce((s, r) => s + invCh(M[r].rgb[1][c]) / invCh(M[r].rgb[0][c]), 0)) / 2);
const beta = mCh.map((x) => Math.log(x) / Math.log(0.30));   // m(a) = a^beta, per channel
console.log('\n== (2) fitted decomposition ==');
console.log(`  ambient linear factor at tombAmb 0.30 (R,G,B): ${mCh.map((x) => x.toFixed(3)).join(' ')}`
  + `   -> power law m(a) = a^(${beta.map((x) => x.toFixed(3)).join(', ')})`);
/* sigma: the pool leg's measured saturation (RESULT-torchlight3 KO1, same rect, same camera) */
const s6 = ((invL(110.5) - invL(70.7)) / (invL(95.0) - invL(70.7))) / 2.4;
const sigma = (k) => 1 + (s6 - 1) * Math.max(0, (k - 2.5) / 3.5);
console.log(`  pool-leg saturation sigma(6.0) = ${s6.toFixed(3)} (measured: P(6.0)/P(2.5) = ${((invL(110.5) - invL(70.7)) / (invL(95.0) - invL(70.7))).toFixed(3)} vs 2.400 linear);`
  + ` sigma is EXTRAPOLATED above k = 6.0 -> sigma(8.0) = ${sigma(8).toFixed(3)}`);

const SPL = {};
for (const k of Object.keys(M)) {
  SPL[k] = [0, 1, 2].map((c) => {
    const Xo = invCh(M[k].rgb[0][c]), Xb = invCh(M[k].rgb[1][c]);
    const P = (Xb - mCh[c] * Xo) / (1 - mCh[c]);
    return { A: Xo - P, P };
  });
}
const pred = (roi, amb, k) => {
  const rgb = [0, 1, 2].map((c) => dch(Math.pow(amb, beta[c]) * SPL[roi][c].A + SPL[roi][c].P * (k / 2.5) * sigma(k)));
  return { L: L709(rgb), RB: rgb[0] - rgb[2] };
};
console.log('\n  pool-owned fraction of each ROI (P / (A+P), luminance):');
for (const k of Object.keys(M)) {
  const A = SPL[k].reduce((s, x, i) => s + [0.2126, 0.7152, 0.0722][i] * x.A, 0);
  const P = SPL[k].reduce((s, x, i) => s + [0.2126, 0.7152, 0.0722][i] * x.P, 0);
  console.log(`    ${k.padEnd(6)} ${(P / (A + P) * 100).toFixed(0)}%`);
}
console.log('\n  OUT-OF-SAMPLE back-check against the parent bko arm (tombAmb 0.15, not fitted):');
let worst = 0;
for (const k of Object.keys(M)) {
  const p = pred(k, 0.15, 2.5), me = M[k].rgb[2];
  const dL = p.L - L709(me);
  worst = Math.max(worst, Math.abs(dL));
  console.log(`    ${k.padEnd(6)} pred L ${p.L.toFixed(1).padStart(6)} vs measured ${L709(me).toFixed(1).padStart(6)}  (dL ${dL.toFixed(1).padStart(5)})`
    + `   pred R-B ${p.RB.toFixed(1).padStart(6)} vs ${(me[0] - me[2]).toFixed(1).padStart(6)}`);
}
console.log(`    worst |dL| = ${worst.toFixed(1)} L  <- the L bands below are set with >= 2x this margin`);
console.log('    NOTE: the R-B residual on VAULT is ~10 units (its pool leg fits at ~0%, so the channel split is'
  + ' ill-conditioned there). W2 is therefore aimed with that residual as its margin, and FAR R-B is REPORTED, not barred.');

/* ── the registered arms ─────────────────────────────────────────────────────────────────── */
const ARMS = [['off', 1.0, 2.5], ['amb', 0.30, 2.5], ['pool', 1.0, 6.0], ['p30', 0.30, 6.0], ['p45', 0.45, 4.0], ['p30hi', 0.30, 8.0]];
console.log('\n== predicted arms — display L (R-B) ==');
console.log('ROI    ' + ARMS.map(([n]) => n.padStart(14)).join(''));
for (const k of Object.keys(M)) {
  console.log(k.padEnd(7) + ARMS.map(([, a, g]) => { const p = pred(k, a, g); return `${p.L.toFixed(1)}(${p.RB.toFixed(0)})`.padStart(14); }).join(''));
}
console.log('\n== the registered statistics, per arm (bands in seal §6) ==');
console.log('arm     POOLhold SARChold GOLDhold  FARr VAULTr  GOLD-VAULT SARC-VAULT  JARS/GOLD  W=RB(POOL)-RB(VAULT)  RB(VAULT)  CTRL dL');
const O = Object.fromEntries(Object.keys(M).map((k) => [k, pred(k, 1.0, 2.5)]));
for (const [n, a, g] of ARMS) {
  const P = pred('POOL', a, g), V = pred('VAULT', a, g), F = pred('FAR', a, g);
  const S = pred('SARC', a, g), G = pred('GOLD', a, g), J = pred('JARS', a, g), C = pred('CTRL', a, g);
  console.log(`${n.padEnd(8)}${(P.L / O.POOL.L).toFixed(3).padStart(7)}${(S.L / O.SARC.L).toFixed(3).padStart(9)}${(G.L / O.GOLD.L).toFixed(3).padStart(9)}`
    + `${(F.L / O.FAR.L).toFixed(3).padStart(7)}${(V.L / O.VAULT.L).toFixed(3).padStart(7)}`
    + `${(G.L - V.L).toFixed(1).padStart(12)}${(S.L - V.L).toFixed(1).padStart(11)}${(J.L / G.L).toFixed(3).padStart(11)}`
    + `${(P.RB - V.RB).toFixed(1).padStart(22)}${V.RB.toFixed(1).padStart(11)}${(C.L - O.CTRL.L).toFixed(1).padStart(9)}`);
}
console.log('\nReading of the table, recorded before capture:');
console.log('  - the amb-only CONTROL reproduces the parent failure: POOL hold 0.80, SARC hold 0.70 (both below the');
console.log('    registered holds) — it is registered to FAIL D2/D3, which is what makes the paired claim testable.');
console.log('  - every paired arm holds POOL >= 0.93 and SARC >= 0.83 while VAULT falls to 0.48-0.68 of off.');
console.log('  - the focal statistic is the one that moves most: GOLD-VAULT goes from -1.6 L (the sarcophagus is');
console.log('    DARKER than the vault behind it — that is the "no focal" defect in one number) to +13..+30.');
console.log('  - JARS/GOLD does NOT invert at any dose: the jars are MORE pool-lit than the gold (dim ratios 0.786');
console.log('    vs 0.717 in the parent run), so the co-lever widens the gap it is asked to close. Seal §9 registers');
console.log('    that prediction and routes the inversion to a MATERIAL seal; H2 only bars making it worse.');
console.log('  - W2 (RB(VAULT) <= -8) is NOT taken from this table. The channel split is ill-conditioned on VAULT');
console.log('    (pool leg ~0%), and the parent MEASURED the opposite direction at deep dim: RB(VAULT) -14.9 (off)');
console.log('    -> -14.4 (0.30) -> -4.7 (0.15), i.e. killing the cool ambient hands the residue to the warm pools.');
console.log('    W2 is therefore aimed from the measured anchor: at tombAmb 0.30 the vault sat at -14.4 with the');
console.log('    pool leg at k 2.5; x2.4 on a leg that is ~0-3% of that rect should cost a few units, so the honest');
console.log('    pre-capture estimate for p30 is -10..-13 and the bar sits at -8. If the vault crosses -8 the');
console.log('    darkness has stopped being violet and the seal NO-SHIPs on the statistic that names the defect.');
