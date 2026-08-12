/**
 * Scores shots/attractor/arms.json against PREREG-attractor.md §3–§4. Verdict-only; re-runnable.
 *
 * Per pair: CAL-2 (swap took) → CAL-C (cov ≥ 0.20%) → C-READBACK (toggles echoed).
 * Per shot: C-DRIFT (zero leaked px) gates the boot; then the attribution rule on
 * R(cond) = swing/(-11.3): PREMISE-GONE / SCREEN-RIM / SURFACE-RIM / BOTH / PARTIAL / NEITHER.
 * Tri-state: only explicit passes count; anything missing or null voids its unit.
 */
import { readFileSync } from 'node:fs';

const ARMS = (process.env.SANDS_OUT || 'shots/attractor') + '/arms.json';
const rows = JSON.parse(readFileSync(ARMS, 'utf8'));

const ROT = -11.3, COV_MIN = 0.002, GAIN = 0.15, FULL = 0.85;
const circdiff = (a, b) => ((a - b + 540) % 360) - 180;

const want = { base: { screen: 'orig', surf: 'orig' }, noscreen: { screen: 0, surf: 'orig' },
  nosurf: { screen: 'orig', surf: 0 }, norim: { screen: 0, surf: 0 } };

for (const shot of ['hero', 'interior']) {
  console.log(`\n=== ${shot} ===`);
  const drift = rows.find((r) => r.shot === shot && r.cond === 'DRIFT');
  if (!drift) { console.log('no DRIFT row — boot incomplete, VOID'); continue; }
  if (drift.leaked !== 0) { console.log(`C-DRIFT FAIL: ${drift.leaked} px leaked — boot VOID`); continue; }
  console.log('C-DRIFT clean');

  const R = {};
  let voided = false;
  for (const cond of ['base', 'noscreen', 'nosurf', 'norim']) {
    const r = rows.find((x) => x.shot === shot && x.cond === cond);
    if (!r) { console.log(`${cond}: MISSING — VOID`); voided = true; continue; }
    if (!(r.modeA === 'raw' && r.modeB === 'fix' && r.A && r.B && r.A.sha !== r.B.sha)) {
      console.log(`${cond}: CAL-2 fail — VOID`); voided = true; continue;
    }
    if (!(r.cov >= COV_MIN)) { console.log(`${cond}: CAL-C fail (cov ${(100 * r.cov).toFixed(2)}%) — VOID`); voided = true; continue; }
    const w = want[cond];
    const okScreen = w.screen === 'orig' ? r.readback.screen === r.orig.screen : r.readback.screen === w.screen;
    const okSurf = w.surf === 'orig' ? r.readback.surf === r.orig.surf : r.readback.surf === w.surf;
    if (!(okScreen && okSurf)) {
      console.log(`${cond}: C-READBACK fail (screen ${r.readback.screen}, surf ${r.readback.surf}) — VOID`); voided = true; continue;
    }
    if (r.hueA == null || r.hueB == null) { console.log(`${cond}: null hue — VOID`); voided = true; continue; }
    const swing = circdiff(r.hueB, r.hueA);
    R[cond] = swing / ROT;
    console.log(`${cond.padEnd(9)} cov ${(100 * r.cov).toFixed(2)}%  hueA ${r.hueA.toFixed(1)}°  hueB ${r.hueB.toFixed(1)}°  `
      + `swing ${swing.toFixed(1)}°  R ${R[cond].toFixed(2)}`);
  }
  if (voided || Object.keys(R).length < 4) { console.log('shot outcome: VOID (incomplete lattice)'); continue; }

  let call;
  const gScreen = R.noscreen - R.base >= GAIN, gSurf = R.nosurf - R.base >= GAIN;
  if (R.base >= FULL) call = 'PREMISE-GONE';
  else if (R.noscreen >= FULL && R.nosurf < R.base + GAIN) call = 'SCREEN-RIM';
  else if (R.nosurf >= FULL && R.noscreen < R.base + GAIN) call = 'SURFACE-RIM';
  else if (gScreen && gSurf && R.norim >= FULL) call = 'BOTH';
  else if (R.norim >= FULL && (gScreen !== gSurf)) call = `PARTIAL-${gScreen ? 'SCREEN' : 'SURFACE'}`;
  else if (R.norim < FULL && !gScreen && !gSurf) call = 'NEITHER';
  else call = `UNCLASSIFIED (base ${R.base.toFixed(2)} noscreen ${R.noscreen.toFixed(2)} nosurf ${R.nosurf.toFixed(2)} norim ${R.norim.toFixed(2)})`;
  console.log(`shot outcome: ${call}`);
}
