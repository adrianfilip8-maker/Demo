/**
 * PREREG-tombdim §6 — the registered scorer. Reads progress/records/gradetrio1/ and prints
 * the verdict through tools/gate.mjs (tri-state: VOID is not PASS; ship = every row PASS
 * AND the binding LOOK gate §8, scored by a human from the frames — this scorer prints
 * numbers and writes crops only).
 *
 *   node progress/records/gradetrio/tombdim-score.mjs
 */
import {
  ROSTER, manifest, row, img, stats, diffPx, bool, rBars, treeBar, DIR,
} from './gradetrio-lib.mjs';
import { shipVerdict, verdictLine } from '../../../tools/gate.mjs';

const B_ON = 0.30, B_KO = 0.15;
const ROIS = {
  FAR: [380, 30, 560, 120],       // torchlight2-far's vault rect, carried by citation (ambient-owned)
  VAULT: [560, 10, 900, 90],      // second ambient-owned rect, upper vault (§4)
  POOL: [292, 432, 392, 490],     // torchlight POOL, carried by citation (pool-owned)
  CTRL: [150, 560, 520, 700],     // floor between pools — pool+ambient MIX at the shipped §303 state
  SARC: [600, 120, 840, 300],     // the sarcophagus + dais
};

const guards = {};
const report = [];

/* R1–R16 — shared validity: diff(off, back) == 0 per shot. */
Object.assign(guards, rBars(report));

/* B — protection: diff(off, bon) == 0 on every NON-interior shot (camera y >= 1.15 ->
   factor exactly 1 -> bit-identical by construction; measured, not assumed). */
for (const shot of ROSTER) {
  if (shot === 'interior') continue;
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'bon')));
  report.push(`B ${shot.padEnd(12)} off-vs-bon  ${d} px`);
  guards[`B_${shot}`] = guards[`R_${shot}`] !== true ? null : (d === null ? null : d === 0);
}

/* ROI stats on the interior arms. */
const S = {};
for (const arm of ['off', 'bon', 'bko']) {
  const im = img(row('interior', arm));
  S[arm] = im ? Object.fromEntries(Object.entries(ROIS).map(([k, r]) => [k, stats(im, r)])) : null;
  if (S[arm]) {
    for (const k of Object.keys(ROIS)) {
      report.push(`${arm.padEnd(4)} ${k.padEnd(5)} L ${S[arm][k].meanL.toFixed(1)}  R-B ${S[arm][k].meanRB.toFixed(1)}  hue ${S[arm][k].hMean.toFixed(1)}  S ${S[arm][k].meanS.toFixed(3)}`);
    }
  }
}
const okBase = guards.R_interior === true && S.off && S.bon;

/* BG_b — the diagnosed staging must be present on the off arm (fail-closed): the §303
   pools LIVE (warm bright POOL), the ambient vault cool, the floor in its pool-lit band. */
guards.BG_b = !S.off ? null
  : (S.off.POOL.meanRB >= 40 && S.off.POOL.meanL >= 75 && S.off.POOL.meanL <= 115
    && S.off.FAR.meanL >= 45 && S.off.FAR.meanL <= 85 && S.off.FAR.meanRB <= -5
    && S.off.CTRL.meanL >= 65 && S.off.CTRL.meanL <= 105);

const gated = okBase && guards.BG_b === true;

/* D1 — the ambient family actually dims, measured on the two ambient-owned rects. */
if (gated) {
  const rF = S.bon.FAR.meanL / S.off.FAR.meanL;
  const rV = S.bon.VAULT.meanL / S.off.VAULT.meanL;
  report.push(`D1  FAR ratio ${rF.toFixed(3)} (want 0.42-0.82)  VAULT ratio ${rV.toFixed(3)} (want 0.42-0.85)`);
  guards.D1 = rF >= 0.42 && rF <= 0.82 && rV >= 0.42 && rV <= 0.85;
} else guards.D1 = null;

/* D2 — the pools POP against the darkness: pool-over-ambient separation grows. */
if (gated) {
  const cOff = S.off.POOL.meanL - S.off.FAR.meanL;
  const cOn = S.bon.POOL.meanL - S.bon.FAR.meanL;
  report.push(`D2  POOL-FAR off ${cOff.toFixed(1)} -> bon ${cOn.toFixed(1)} (want >= off+6 and >= 1.15x)`);
  guards.D2 = cOn >= cOff + 6 && cOn >= 1.15 * cOff;
} else guards.D2 = null;

/* D3 — the gold survives the dim (it is pool-lit, not ambient-lit). Prominence over the
   vault is REPORTED; "single bright read" is the LOOK gate's call. */
if (gated) {
  const keep = S.bon.SARC.meanL / S.off.SARC.meanL;
  report.push(`D3  SARC retention ${keep.toFixed(3)} (want >= 0.55)  prominence off ${(S.off.SARC.meanL - S.off.FAR.meanL).toFixed(1)} -> bon ${(S.bon.SARC.meanL - S.bon.FAR.meanL).toFixed(1)} (reported)`);
  guards.D3 = keep >= 0.55;
} else guards.D3 = null;

/* D4 — the darkness stays cool-violet (does not warm; §300's lesson watched). */
if (gated) {
  const dRB = S.bon.FAR.meanRB - S.off.FAR.meanRB;
  report.push(`D4  FAR dR-B ${dRB.toFixed(1)} (want -30..+2)  R-B(bon) ${S.bon.FAR.meanRB.toFixed(1)} (want <= -10)`);
  guards.D4 = dRB <= 2 && dRB >= -30 && S.bon.FAR.meanRB <= -10;
} else guards.D4 = null;

/* D5 — the darkening reaches the floor between pools (its ambient leg). */
if (gated) {
  const dC = S.bon.CTRL.meanL - S.off.CTRL.meanL;
  report.push(`D5  CTRL dL ${dC.toFixed(1)} (want -34..-3)`);
  guards.D5 = dC <= -3 && dC >= -34;
} else guards.D5 = null;

/* KO_b — dose monotone (interior bko, tombAmb 0.15). */
if (gated && S.bko) {
  const rOn = S.bon.FAR.meanL / S.off.FAR.meanL;
  const rKo = S.bko.FAR.meanL / S.off.FAR.meanL;
  report.push(`KO_b  FAR ratio bon ${rOn.toFixed(3)} vs bko ${rKo.toFixed(3)} (want bko <= bon - 0.08)`);
  guards.KO_b = rKo <= rOn - 0.08;
} else guards.KO_b = gated ? null : null;

/* VB — readbacks. */
{
  let ok = true, n = 0;
  for (const shot of ROSTER) {
    const o = row(shot, 'off')?.readback, b = row(shot, 'bon')?.readback;
    if (!o || !b) { ok = null; break; }
    n++;
    if (o.tombAmb !== 1 || b.tombAmb !== B_ON) { ok = false; report.push(`VB: ${shot} echoes ${o.tombAmb}/${b.tombAmb}`); break; }
    if (shot === 'interior') {
      if (!(b.camY < -2.5)) { ok = false; report.push(`VB: interior camY ${b.camY}`); break; }
      if (b.tombF !== B_ON) { ok = false; report.push(`VB: interior tombF ${b.tombF} != ${B_ON}`); break; }
      if (Math.abs(b.uAmbIntensity - o.uAmbIntensity * B_ON) > 1e-9) { ok = false; report.push(`VB: uAmb ${b.uAmbIntensity} != off*0.30`); break; }
      const lr = (0.2126 * b.uShadowColor.r + 0.7152 * b.uShadowColor.g + 0.0722 * b.uShadowColor.b)
        / (0.2126 * o.uShadowColor.r + 0.7152 * o.uShadowColor.g + 0.0722 * o.uShadowColor.b);
      report.push(`VB: interior uShadowColor lum ratio ${lr.toFixed(4)} (cap-release predicts ~0.409)`);
      if (!(lr >= 0.38 && lr <= 0.44)) { ok = false; report.push('VB: cap-release ratio out of band'); break; }
    } else {
      if (b.tombF !== 1) { ok = false; report.push(`VB: ${shot} tombF ${b.tombF} != 1`); break; }
      if (b.uAmbIntensity !== o.uAmbIntensity) { ok = false; report.push(`VB: ${shot} uAmb moved though above ground`); break; }
      const same = b.uShadowColor.r === o.uShadowColor.r && b.uShadowColor.g === o.uShadowColor.g && b.uShadowColor.b === o.uShadowColor.b;
      if (!same) { ok = false; report.push(`VB: ${shot} uShadowColor moved though above ground`); break; }
    }
  }
  const ko = row('interior', 'bko')?.readback;
  if (ok === true && (!ko || ko.tombAmb !== B_KO || ko.tombF !== B_KO)) { ok = false; report.push('VB: bko echo wrong'); }
  guards.VB = ok === null ? null : (ok && n === ROSTER.length);
}

/* V4 — 83 rows, one src hash == the launch-derived HEAD archive hash. */
guards.V4 = treeBar(report, 83);

for (const k of Object.keys(guards)) guards[k] = bool(guards[k]);
console.log(report.join('\n'));
console.log('');
const v = shipVerdict(guards);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(14)} ${s}`);
console.log('');
console.log(verdictLine(v, `TUNE.tombAmb = ${B_ON} (tombdim — shared gradetrio boot; LOOK gate §8 still binds before any write)`));
process.exit(v.ship ? 0 : 1);
