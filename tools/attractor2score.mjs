/**
 * Scores shots/attractor2/arms.json against PREREG-attractor2.md §3–§4. Verdict-only.
 * attractorscore's arithmetic with ink conditions; hull conditions additionally require the
 * traversal to have matched > 0 hulls (a zero count voids the condition, per the seal).
 */
import { readFileSync } from 'node:fs';

const ARMS = (process.env.SANDS_OUT || 'shots/attractor2') + '/arms.json';
const rows = JSON.parse(readFileSync(ARMS, 'utf8'));

const ROT = -11.3, COV_MIN = 0.002, GAIN = 0.15, FULL = 0.85;
const circdiff = (a, b) => ((a - b + 540) % 360) - 180;

for (const shot of ['hero', 'interior']) {
  console.log(`\n=== ${shot} ===`);
  const drift = rows.find((r) => r.shot === shot && r.cond === 'DRIFT');
  if (!drift) { console.log('no DRIFT row — boot incomplete, VOID'); continue; }
  if (drift.leaked !== 0) { console.log(`C-DRIFT FAIL: ${drift.leaked} px leaked — boot VOID`); continue; }
  console.log('C-DRIFT clean');

  const R = {};
  let voided = false;
  for (const cond of ['base', 'nocrease', 'nohull', 'noink']) {
    const r = rows.find((x) => x.shot === shot && x.cond === cond);
    if (!r) { console.log(`${cond}: MISSING — VOID`); voided = true; continue; }
    if (!(r.modeA === 'raw' && r.modeB === 'fix' && r.A && r.B && r.A.sha !== r.B.sha)) {
      console.log(`${cond}: CAL-2 fail — VOID`); voided = true; continue;
    }
    if (!(r.cov >= COV_MIN)) { console.log(`${cond}: CAL-C fail (cov ${(100 * r.cov).toFixed(2)}%) — VOID`); voided = true; continue; }
    const wantCrease = (cond === 'nocrease' || cond === 'noink') ? 0 : r.origCrease;
    const wantHidden = (cond === 'nohull' || cond === 'noink');
    if (!(r.readback.inkStrength === wantCrease && r.readback.hidden === wantHidden
      && (!wantHidden || r.readback.hulls > 0))) {
      console.log(`${cond}: C-READBACK fail (ink ${r.readback.inkStrength}, hulls ${r.readback.hulls}, hidden ${r.readback.hidden}) — VOID`);
      voided = true; continue;
    }
    if (r.hueA == null || r.hueB == null) { console.log(`${cond}: null hue — VOID`); voided = true; continue; }
    const swing = circdiff(r.hueB, r.hueA);
    R[cond] = swing / ROT;
    console.log(`${cond.padEnd(9)} cov ${(100 * r.cov).toFixed(2)}%  hueA ${r.hueA.toFixed(1)}°  hueB ${r.hueB.toFixed(1)}°  `
      + `swing ${swing.toFixed(1)}°  R ${R[cond].toFixed(2)}`);
  }
  if (voided || Object.keys(R).length < 4) { console.log('shot outcome: VOID (incomplete lattice)'); continue; }

  let call;
  const gCrease = R.nocrease - R.base >= GAIN, gHull = R.nohull - R.base >= GAIN;
  if (R.base >= FULL) call = 'PREMISE-GONE';
  else if (R.nocrease >= FULL && R.nohull < R.base + GAIN) call = 'CREASE-INK';
  else if (R.nohull >= FULL && R.nocrease < R.base + GAIN) call = 'HULL-INK';
  else if (gCrease && gHull && R.noink >= FULL) call = 'BOTH';
  else if (R.noink >= FULL && (gCrease !== gHull)) call = `PARTIAL-${gCrease ? 'CREASE' : 'HULL'}`;
  else if (R.noink < FULL && !gCrease && !gHull) call = 'NEITHER';
  else call = `UNCLASSIFIED (base ${R.base.toFixed(2)} nocrease ${R.nocrease.toFixed(2)} nohull ${R.nohull.toFixed(2)} noink ${R.noink.toFixed(2)})`;
  console.log(`shot outcome: ${call}`);
}
