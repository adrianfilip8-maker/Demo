/**
 * PREREG-seamglint §5 — the registered scorer for seal (c): light-direction gating of the
 * shadow-side surface-rim floor on architecture (TUNE.rimShadowFloorArch sweep {0.20, 0.10}).
 * Reads progress/records/fxartifact1/; tri-state via tools/gate.mjs; the LOOK gate is
 * adjudicated in the RESULT off the crops this file writes. The `s10` rows (screen-rim floor
 * 0.10) are REPORT-ONLY decomposition — they gate nothing and ship nothing here.
 *
 *   node progress/records/fxartifact/seamglint-score.mjs
 */
import { shipVerdict, verdictLine, guardState } from '../../../tools/gate.mjs';
import {
  DIR, loadRun, diffPx, roiMeanL, coolGlint, speck, meanDropOverSet, readbackOK, stampsOK,
  writeCrop, ARM_EXPECT, L,
} from './fxartifact-lib.mjs';
import path from 'node:path';

const C_SHOTS = ['dunes', 'night', 'guard', 'hero', 'courtyard', 'sly-closeup'];
const ARMS = ['c20', 'c10'];

/* Registered ROIs (PREREG-seamglint §3; calibrated 2026-08-13 on the torchlight3 {dt:0}
   frames — the same staging this run uses; baselines quoted in the seal). */
const DUNES_ROI = [700, 150, 900, 330];        // pylon face: coolGlint(95,12) baseline 329 px
const NIGHT_L = [90, 180, 250, 520];           // speck(+14) baseline 1954 px
const NIGHT_R = [1000, 240, 1180, 420];        // speck(+14) baseline 1994 px
const GUARD_ROI = [700, 150, 1100, 450];       // speck(+14) baseline 2996 px
const KERB_ROI = [820, 500, 1100, 610];        // coolGlint(120,14) baseline 2597 px (PREREG-kerb's band)
const OBELISK_ROI = [580, 0, 650, 150];        // coolGlint(120,10) baseline 7055 px — protection
const CHEST_ROI = [615, 275, 665, 325];        // sly-closeup character interior — protection
const LAMPS = [660, 0, 779, 59], MOON = [380, 50, 439, 109];

const { manifest, row, img } = loadRun();
const g = {};

g.V1_stamps = stampsOK(manifest);
{
  let ok = true;
  for (const shot of C_SHOTS) for (const arm of ['off', ...ARMS, 'back']) {
    const r = row(shot, arm);
    if (!r || !readbackOK(r, ARM_EXPECT[arm])) { ok = false; console.log(`  V2 readback bad: ${shot}.${arm}`); }
  }
  for (const shot of ['dunes', 'night']) {
    const r = row(shot, 's10');
    if (!r || !readbackOK(r, ARM_EXPECT.s10)) { ok = false; console.log(`  V2 readback bad: ${shot}.s10`); }
  }
  g.V2_readbacks = ok;
}

for (const shot of C_SHOTS) {
  const d = diffPx(img(shot, 'off'), img(shot, 'back'));
  g[`R_${shot}`] = d === null ? null : d === 0;
  console.log(`R_${shot}: diff(off,back) = ${d === null ? 'MISSING' : d} px`);
}

/* BG — the glint populations must be present on the off arms */
const offSets = {};
{
  const dunes = img('dunes', 'off'), night = img('night', 'off'), guard = img('guard', 'off'), hero = img('hero', 'off');
  offSets.dunes = dunes ? coolGlint(dunes, DUNES_ROI, 95, 12) : null;
  offSets.nightL = night ? speck(night, NIGHT_L, 14) : null;
  offSets.nightR = night ? speck(night, NIGHT_R, 14) : null;
  offSets.guard = guard ? speck(guard, GUARD_ROI, 14) : null;
  offSets.kerb = hero ? coolGlint(hero, KERB_ROI, 120, 14) : null;
  g.BG_dunes = offSets.dunes ? offSets.dunes.n >= 150 : null;
  g.BG_night = offSets.nightL && offSets.nightR ? offSets.nightL.n >= 800 && offSets.nightR.n >= 800 : null;
  g.BG_guard = offSets.guard ? offSets.guard.n >= 1000 : null;
  g.BG_kerb = offSets.kerb ? offSets.kerb.n >= 1200 : null;
  console.log(`BG: dunes ${offSets.dunes?.n} nightL ${offSets.nightL?.n} nightR ${offSets.nightR?.n} guard ${offSets.guard?.n} kerb ${offSets.kerb?.n}`);
}

/* EFFECT + PROTECTION per arm */
const armStats = {};
function evalArm(arm) {
  const dunes = img('dunes', arm), night = img('night', arm), guard = img('guard', arm);
  const hero = img('hero', arm), court = img('courtyard', arm), closeup = img('sly-closeup', arm);
  const dunesOff = img('dunes', 'off'), nightOff = img('night', 'off'), guardOff = img('guard', 'off');
  const heroOff = img('hero', 'off'), courtOff = img('courtyard', 'off'), closeOff = img('sly-closeup', 'off');
  if (!dunes || !night || !guard || !hero || !court || !closeup) return null;
  const s = {};
  s.dunesRemain = coolGlint(dunes, DUNES_ROI, 95, 12).n / Math.max(1, offSets.dunes.n);
  s.nightRemain = (speck(night, NIGHT_L, 14).n + speck(night, NIGHT_R, 14).n)
    / Math.max(1, offSets.nightL.n + offSets.nightR.n);
  s.guardRemain = speck(guard, GUARD_ROI, 14).n / Math.max(1, offSets.guard.n);
  s.kerbDrop = meanDropOverSet(heroOff, hero, offSets.kerb.set.map((p) => p));
  s.kerbRemain = coolGlint(hero, KERB_ROI, 120, 14).n / Math.max(1, offSets.kerb.n);
  /* protections */
  const obOff = coolGlint(courtOff, OBELISK_ROI, 120, 10).n;
  s.obeliskRetention = coolGlint(court, OBELISK_ROI, 120, 10).n / Math.max(1, obOff);
  s.obeliskMeanDelta = Math.abs(roiMeanL(court, OBELISK_ROI) - roiMeanL(courtOff, OBELISK_ROI));
  let chest = 0;
  for (let y = CHEST_ROI[1]; y <= CHEST_ROI[3]; y++) for (let x = CHEST_ROI[0]; x <= CHEST_ROI[2]; x++) {
    const i = (y * closeup.w + x) * closeup.ch, j = (y * closeOff.w + x) * closeOff.ch;
    if (Math.abs(L(closeup.data[i], closeup.data[i + 1], closeup.data[i + 2])
      - L(closeOff.data[j], closeOff.data[j + 1], closeOff.data[j + 2])) >= 2) chest++;
  }
  s.chestChanged = chest;
  s.lampsDelta = Math.abs(roiMeanL(night, LAMPS) - roiMeanL(nightOff, LAMPS));
  s.moonDelta = Math.abs(roiMeanL(night, MOON) - roiMeanL(nightOff, MOON));
  let nchanged = 0;
  for (let i = 0; i < night.w * night.h; i++) {
    const a = i * night.ch, b = i * nightOff.ch;
    if (Math.abs(L(night.data[a], night.data[a + 1], night.data[a + 2])
      - L(nightOff.data[b], nightOff.data[b + 1], nightOff.data[b + 2])) >= 2) nchanged++;
  }
  s.nightChangedFrac = nchanged / (night.w * night.h);
  return s;
}
for (const arm of ARMS) {
  const s = evalArm(arm);
  armStats[arm] = s;
  if (s) console.log(`${arm}: dunes r${s.dunesRemain.toFixed(2)}  night r${s.nightRemain.toFixed(2)}  guard r${s.guardRemain.toFixed(2)}  kerb drop ${s.kerbDrop?.toFixed(1)}L remain r${s.kerbRemain.toFixed(2)}  | obelisk r${s.obeliskRetention.toFixed(2)} d${s.obeliskMeanDelta.toFixed(2)}  chest ${s.chestChanged}px  lamps ${s.lampsDelta.toFixed(2)} moon ${s.moonDelta.toFixed(2)}  nightFrac ${(100 * s.nightChangedFrac).toFixed(1)}%`);
  else console.log(`${arm}: MISSING rows`);
}
/* s10 decomposition (dunes/night only — the only shots that carry it; REPORT, no gates) */
{
  const dunes = img('dunes', 's10'), night = img('night', 's10');
  if (dunes && night && offSets.dunes && offSets.nightL && offSets.nightR) {
    const dR = coolGlint(dunes, DUNES_ROI, 95, 12).n / Math.max(1, offSets.dunes.n);
    const nR = (speck(night, NIGHT_L, 14).n + speck(night, NIGHT_R, 14).n)
      / Math.max(1, offSets.nightL.n + offSets.nightR.n);
    console.log(`s10 (screen floor 0.10, arch floor at base): dunes r${dR.toFixed(2)}  night r${nR.toFixed(2)}  — the screen-rim share of the glint populations`);
  } else console.log('s10: MISSING rows (report-only)');
}

function armGuards(arm) {
  const s = armStats[arm];
  if (!s) return { [`E_${arm}`]: null };
  return {
    [`E_dunes_${arm}`]: s.dunesRemain <= 0.35,
    [`E_night_${arm}`]: s.nightRemain <= 0.45,
    [`E_guard_${arm}`]: s.guardRemain <= 0.45,
    [`E_kerb_${arm}`]: s.kerbDrop !== null && s.kerbDrop >= 25 && s.kerbRemain <= 0.35,
    [`P_obelisk_${arm}`]: s.obeliskRetention >= 0.85 && s.obeliskMeanDelta <= 1.5,
    [`P_chest_${arm}`]: s.chestChanged <= 40,
    [`P_lamps_${arm}`]: s.lampsDelta <= 1.0 && s.moonDelta <= 1.0,
    [`P_nightbudget_${arm}`]: s.nightChangedFrac <= 0.12,
  };
}

const validity = {
  V1_stamps: g.V1_stamps, V2_readbacks: g.V2_readbacks,
  BG_dunes: g.BG_dunes, BG_night: g.BG_night, BG_guard: g.BG_guard, BG_kerb: g.BG_kerb,
  ...Object.fromEntries(C_SHOTS.map((s) => [`R_${s}`, g[`R_${s}`]])),
};
console.log('\n-- validity --');
for (const [k, v] of Object.entries(validity)) console.log(`  ${k}: ${guardState(v)}`);

let chosen = null;
for (const arm of ARMS) { // c20 first: ship rule takes the LARGEST passing floor
  const v = shipVerdict({ ...validity, ...armGuards(arm) });
  console.log(`\narm ${arm}: ${verdictLine(v, `TUNE.rimShadowFloorArch ${{ c20: 0.20, c10: 0.10 }[arm]}`)}`);
  if (v.ship && !chosen) chosen = arm;
}
console.log('\ns10 (screen-rim floor 0.10) is REPORT-ONLY decomposition: it gates nothing; if the');
console.log('c-arms fail while s10 owns the residual, the routing note in PREREG-seamglint §6 fires.');

/* LOOK crops (binding half) */
const CROPS = path.join(DIR, 'crops');
for (const [shot, arms, box, z, name] of [
  ['dunes', ['off', 'c20', 'c10', 's10'], [700, 150, 200, 180], 4, 'dunes-pylon'],
  ['night', ['off', 'c20', 'c10', 's10'], [90, 180, 160, 200], 3, 'night-wallL'],
  ['night', ['off', 'c20', 'c10'], [420, 420, 300, 120], 3, 'night-deckedge'],
  ['guard', ['off', 'c20', 'c10'], [700, 150, 220, 180], 3, 'guard-wall'],
  ['courtyard', ['off', 'c20', 'c10'], [560, 0, 120, 160], 3, 'court-obelisk'],
  ['hero', ['off', 'c20', 'c10'], [820, 500, 280, 110], 3, 'hero-kerb'],
  ['sly-closeup', ['off', 'c10'], [0, 0, 1280, 720], 1, 'closeup-full'],
]) {
  for (const arm of arms) {
    const im = img(shot, arm);
    if (im) writeCrop(im, box, z, path.join(CROPS, `seamglint-${name}-${arm}-${z}x.png`));
  }
}
console.log(`crops -> ${CROPS} (seamglint-*). The RESULT adjudicates the LOOK gate off these.`);
console.log(chosen
  ? `\n==> mechanical ship rule: LARGEST passing floor = ${chosen} (${{ c20: 0.20, c10: 0.10 }[chosen]})`
  : '\n==> mechanical ship rule: NO floor passes — no ship; the s10 decomposition + PF branches (PREREG-seamglint §6) decide the routing.');
process.exit(chosen ? 0 : 1);
