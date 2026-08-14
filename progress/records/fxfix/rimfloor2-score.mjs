/**
 * PREREG-rimfloor2 §4 — the registered scorer for the seam-glint fix, take 2: the SCREEN-rim
 * shadow floor cut OFF-SUBJECT (TUNE.rimFloorOffCut), alone and combined with the architecture
 * surface floor. Reads progress/records/fxfix1/; tri-state via tools/gate.mjs; the LOOK gate
 * (§5) is adjudicated in the RESULT off the crops this file writes. `k10` (arch floor 0.10)
 * and `rimz` (screen floor 0.0) are REPORT-ONLY: they gate nothing, they bracket the two
 * terms' shares, and `rimz` freezes the character population the P_slyrim bars are read over.
 *
 *   node progress/records/fxfix/rimfloor2-score.mjs
 */
import { shipVerdict, verdictLine, guardState } from '../../../tools/gate.mjs';
import {
  DIR, loadRun, diffPx, roiMeanL, coolGlint, speck, meanDropOverSet, readbackOK, stampsOK,
  pageCleanOK, writeCrop, changedInBox, rimSet, setDrop, ARM_EXPECT, L,
} from './fxfix-lib.mjs';
import path from 'node:path';

const C_SHOTS = ['dunes', 'night', 'guard', 'hero', 'courtyard', 'sly-closeup', 'sly-profile'];
const REPORT_ARMS = ['k10', 'rimz'];
const ARMS = ['w35', 'w45', 'b35', 'b45'];          // ship-rule order, registered
const SHIPS = {
  w35: 'rimFloorOffCut 0.35 (off-subject floor 0.10)',
  w45: 'rimFloorOffCut 0.45 (off-subject floor 0.00)',
  b35: 'rimFloorOffCut 0.35 + rimShadowFloorArch 0.10',
  b45: 'rimFloorOffCut 0.45 + rimShadowFloorArch 0.10',
};

/* Registered ROIs — PREREG-seamglint §3, carried verbatim (parent-boot baselines quoted). */
const DUNES_ROI = [700, 150, 900, 330];        // coolGlint(95,12), parent off 327 px
const NIGHT_L = [90, 180, 250, 520];           // speck(+14), 1954 px
const NIGHT_R = [1000, 240, 1180, 420];        // speck(+14), 1994 px
const GUARD_ROI = [700, 150, 1100, 450];       // speck(+14), 2990 px
const KERB_ROI = [820, 500, 1100, 610];        // coolGlint(120,14), 2597 px
const OBELISK_ROI = [580, 0, 650, 150];        // coolGlint(120,10), 7055 px — protection
const CHEST_ROI = [615, 275, 665, 325];        // character interior — protection
const LAMPS = [660, 0, 779, 59], MOON = [380, 50, 439, 109];

/* NEW — PREREG-rimfloor2 §3's character instrument: boxes drawn on the committed fxartifact1
   off frames before any arm of this run existed. SLY-* hug the character INCLUDING his
   silhouette (which is where the rim is drawn); WALL-* are plain architecture in the same
   frame and are the discrimination control that keeps a null result from reading as a pass. */
const CHAR = {
  'sly-closeup': { sly: [575, 112, 712, 375], wall: [180, 150, 430, 420] },
  'sly-profile': { sly: [598, 112, 712, 352], wall: [120, 120, 380, 330] },
};

const { manifest, row, img } = loadRun();
const g = {};

g.V1_stamps = stampsOK(manifest);
g.V3_pageclean = pageCleanOK(manifest);
{
  let ok = true;
  for (const shot of C_SHOTS) for (const arm of ['off', ...REPORT_ARMS, ...ARMS, 'back']) {
    const r = row(shot, arm);
    if (!r || !readbackOK(r, ARM_EXPECT[arm])) { ok = false; console.log(`  V2 readback bad: ${shot}.${arm}`); }
  }
  g.V2_readbacks = ok;
}

for (const shot of C_SHOTS) {
  const d = diffPx(img(shot, 'off'), img(shot, 'back'));
  g[`R_${shot}`] = d === null ? null : d === 0;
  console.log(`R_${shot}: diff(off,back) = ${d === null ? 'MISSING' : d} px`);
}

/* BG — the glint populations must be present on the off arms of THIS boot */
const offSets = {};
{
  const dunes = img('dunes', 'off'), night = img('night', 'off'),
    guard = img('guard', 'off'), hero = img('hero', 'off');
  offSets.dunes = dunes ? coolGlint(dunes, DUNES_ROI, 95, 12) : null;
  offSets.nightL = night ? speck(night, NIGHT_L, 14) : null;
  offSets.nightR = night ? speck(night, NIGHT_R, 14) : null;
  offSets.guard = guard ? speck(guard, GUARD_ROI, 14) : null;
  offSets.kerb = hero ? coolGlint(hero, KERB_ROI, 120, 14) : null;
  g.BG_dunes = offSets.dunes ? offSets.dunes.n >= 150 : null;
  g.BG_night = offSets.nightL && offSets.nightR ? offSets.nightL.n >= 800 && offSets.nightR.n >= 800 : null;
  g.BG_guard = offSets.guard ? offSets.guard.n >= 1000 : null;
  g.BG_kerb = offSets.kerb ? offSets.kerb.n >= 1200 : null;
  console.log(`BG: dunes ${offSets.dunes?.n} nightL ${offSets.nightL?.n} nightR ${offSets.nightR?.n}`
    + ` guard ${offSets.guard?.n} kerb ${offSets.kerb?.n}`);
}

/* BG_char — the character rim populations, frozen from this boot's own `rimz` arm */
const charSets = {};
for (const [shot, boxes] of Object.entries(CHAR)) {
  const off = img(shot, 'off'), rz = img(shot, 'rimz');
  charSets[shot] = off && rz
    ? { sly: rimSet(off, rz, boxes.sly, 3), wall: rimSet(off, rz, boxes.wall, 3) } : null;
  console.log(`RIMSET ${shot}: sly ${charSets[shot]?.sly.length ?? 'MISSING'} px,`
    + ` wall ${charSets[shot]?.wall.length ?? 'MISSING'} px (frozen from off vs rimz)`);
}
g.BG_char = Object.values(charSets).every((c) => c && c.sly.length >= 200)
  ? true : (Object.values(charSets).some((c) => !c) ? null : false);

/* EFFECT + PROTECTION per arm */
const armStats = {};
function evalArm(arm) {
  const dunes = img('dunes', arm), night = img('night', arm), guard = img('guard', arm);
  const hero = img('hero', arm), court = img('courtyard', arm);
  const dunesOff = img('dunes', 'off'), nightOff = img('night', 'off');
  const heroOff = img('hero', 'off'), courtOff = img('courtyard', 'off');
  if (!dunes || !night || !guard || !hero || !court || !dunesOff || !nightOff || !heroOff || !courtOff) return null;
  if (!offSets.dunes || !offSets.nightL || !offSets.nightR || !offSets.guard || !offSets.kerb) return null;
  const s = {};
  s.dunesRemain = coolGlint(dunes, DUNES_ROI, 95, 12).n / Math.max(1, offSets.dunes.n);
  s.nightRemain = (speck(night, NIGHT_L, 14).n + speck(night, NIGHT_R, 14).n)
    / Math.max(1, offSets.nightL.n + offSets.nightR.n);
  s.guardRemain = speck(guard, GUARD_ROI, 14).n / Math.max(1, offSets.guard.n);
  s.kerbDrop = meanDropOverSet(heroOff, hero, offSets.kerb.set);
  s.kerbRemain = coolGlint(hero, KERB_ROI, 120, 14).n / Math.max(1, offSets.kerb.n);
  /* protections */
  const obOff = coolGlint(courtOff, OBELISK_ROI, 120, 10).n;
  s.obeliskRetention = coolGlint(court, OBELISK_ROI, 120, 10).n / Math.max(1, obOff);
  s.obeliskMeanDelta = Math.abs(roiMeanL(court, OBELISK_ROI) - roiMeanL(courtOff, OBELISK_ROI));
  const closeup = img('sly-closeup', arm), closeOff = img('sly-closeup', 'off');
  s.chestChanged = closeup && closeOff ? changedInBox(closeup, closeOff, CHEST_ROI, 2) : null;
  s.lampsDelta = Math.abs(roiMeanL(night, LAMPS) - roiMeanL(nightOff, LAMPS));
  s.moonDelta = Math.abs(roiMeanL(night, MOON) - roiMeanL(nightOff, MOON));
  let nchanged = 0;
  for (let i = 0; i < night.w * night.h; i++) {
    const a = i * night.ch, b = i * nightOff.ch;
    if (Math.abs(L(night.data[a], night.data[a + 1], night.data[a + 2])
      - L(nightOff.data[b], nightOff.data[b + 1], nightOff.data[b + 2])) >= 2) nchanged++;
  }
  s.nightChangedFrac = nchanged / (night.w * night.h);
  /* the character bars + their discrimination control */
  s.char = {};
  for (const shot of Object.keys(CHAR)) {
    const off = img(shot, 'off'), a = img(shot, arm), cs = charSets[shot];
    s.char[shot] = off && a && cs
      ? { sly: setDrop(off, a, cs.sly, 2), wall: setDrop(off, a, cs.wall, 2) } : null;
  }
  return s;
}

for (const arm of [...REPORT_ARMS, ...ARMS]) {
  const s = evalArm(arm);
  armStats[arm] = s;
  if (!s) { console.log(`${arm}: MISSING rows`); continue; }
  console.log(`${arm}: dunes r${s.dunesRemain.toFixed(2)}  night r${s.nightRemain.toFixed(2)}`
    + `  guard r${s.guardRemain.toFixed(2)}  kerb drop ${s.kerbDrop?.toFixed(1)}L remain r${s.kerbRemain.toFixed(2)}`
    + `  | obelisk r${s.obeliskRetention.toFixed(2)} d${s.obeliskMeanDelta.toFixed(2)}`
    + `  chest ${s.chestChanged}px  lamps ${s.lampsDelta.toFixed(2)} moon ${s.moonDelta.toFixed(2)}`
    + `  nightFrac ${(100 * s.nightChangedFrac).toFixed(1)}%`);
  for (const shot of Object.keys(CHAR)) {
    const c = s.char[shot];
    console.log(`    char ${shot}: SLY drop ${c?.sly ? c.sly.drop.toFixed(3) : 'n/a'}L hit `
      + `${c?.sly ? (100 * c.sly.hit).toFixed(1) : 'n/a'}%  |  WALL(control) drop `
      + `${c?.wall ? c.wall.drop.toFixed(2) : 'n/a'}L hit ${c?.wall ? (100 * c.wall.hit).toFixed(1) : 'n/a'}%`);
  }
}
console.log('\nk10 (arch floor 0.10) and rimz (screen floor 0.00) are REPORT-ONLY: they gate');
console.log('nothing. k10 reproduces the parent run\'s c10 arm in this boot; rimz is the');
console.log('screen-rim-floor-free reference that freezes the character populations above.');

function armGuards(arm) {
  const s = armStats[arm];
  if (!s) return { [`E_dunes_${arm}`]: null };
  const out = {
    [`E_dunes_${arm}`]: s.dunesRemain <= 0.35,
    [`E_night_${arm}`]: s.nightRemain <= 0.45,
    [`E_guard_${arm}`]: s.guardRemain <= 0.45,
    [`E_kerb_${arm}`]: s.kerbDrop !== null && s.kerbDrop >= 25 && s.kerbRemain <= 0.35,
    [`P_obelisk_${arm}`]: s.obeliskRetention >= 0.85 && s.obeliskMeanDelta <= 1.5,
    [`P_chest_${arm}`]: s.chestChanged === null ? null : s.chestChanged <= 40,
    [`P_lamps_${arm}`]: s.lampsDelta <= 1.0 && s.moonDelta <= 1.0,
    [`P_nightbudget_${arm}`]: s.nightChangedFrac <= 0.12,
  };
  for (const shot of Object.keys(CHAR)) {
    const c = s.char[shot];
    const tag = shot === 'sly-closeup' ? 'CU' : 'PR';
    /* BG_disc: if the candidate does not visibly move the WALL rim set in the same frame, the
       character bar is measuring nothing and VOIDs rather than passing (VOID is not PASS). */
    out[`BG_disc_${tag}_${arm}`] = c?.wall ? c.wall.drop >= 3.0 : null;
    out[`P_slyrim_${tag}_${arm}`] = c?.sly ? (c.sly.drop <= 0.6 && c.sly.hit <= 0.12) : null;
  }
  return out;
}

const validity = {
  V1_stamps: g.V1_stamps, V2_readbacks: g.V2_readbacks, V3_pageclean: g.V3_pageclean,
  BG_dunes: g.BG_dunes, BG_night: g.BG_night, BG_guard: g.BG_guard, BG_kerb: g.BG_kerb,
  BG_char: g.BG_char,
  ...Object.fromEntries(C_SHOTS.map((s) => [`R_${s}`, g[`R_${s}`]])),
};
console.log('\n-- validity --');
for (const [k, v] of Object.entries(validity)) console.log(`  ${k}: ${guardState(v)}`);

let chosen = null;
for (const arm of ARMS) {   // screen-only before combined; largest floor first within a family
  const v = shipVerdict({ ...validity, ...armGuards(arm) });
  console.log(`\narm ${arm}: ${verdictLine(v, SHIPS[arm])}`);
  if (v.ship && !chosen) chosen = arm;
}

/* LOOK crops (the binding half) */
const CROPS = path.join(DIR, 'crops');
for (const [shot, arms, box, z, name] of [
  ['dunes', ['off', 'k10', 'rimz', 'w35', 'w45', 'b35', 'b45'], [700, 150, 200, 180], 4, 'dunes-pylon'],
  ['night', ['off', 'k10', 'w35', 'b35', 'b45'], [90, 180, 160, 200], 3, 'night-wallL'],
  ['night', ['off', 'w35', 'b35', 'b45'], [420, 420, 300, 120], 3, 'night-deckedge'],
  ['guard', ['off', 'k10', 'w35', 'b35', 'b45'], [700, 150, 220, 180], 3, 'guard-wall'],
  ['courtyard', ['off', 'b35', 'b45'], [560, 0, 120, 160], 3, 'court-obelisk'],
  ['hero', ['off', 'k10', 'b35', 'b45'], [820, 500, 280, 110], 3, 'hero-kerb'],
  ['sly-closeup', ['off', 'rimz', 'w35', 'w45', 'b35', 'b45'], [575, 112, 140, 265], 2, 'closeup-slyrim'],
  ['sly-profile', ['off', 'rimz', 'w35', 'w45', 'b35', 'b45'], [598, 112, 115, 242], 2, 'profile-slyrim'],
  ['sly-closeup', ['off', 'b45'], [0, 0, 1280, 720], 1, 'closeup-full'],
]) {
  for (const arm of arms) {
    const im = img(shot, arm);
    if (im) writeCrop(im, box, z, path.join(CROPS, `rimfloor2-${name}-${arm}-${z}x.png`));
  }
}
console.log(`\ncrops -> ${CROPS} (rimfloor2-*). The RESULT adjudicates the LOOK gate (§5) off`);
console.log('these — item 6 (Sly\'s rim, off vs arm at 2x) is the one this seal exists to carry.');
console.log(chosen
  ? `\n==> mechanical ship rule: FIRST passing arm in the registered order = ${chosen} (${SHIPS[chosen]})`
  : '\n==> mechanical ship rule: NO arm passes — no ship; the k10/rimz decomposition + PF branches (PREREG-rimfloor2 §6) decide the routing.');
process.exit(chosen ? 0 : 1);
