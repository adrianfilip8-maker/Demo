/**
 * PREREG-fxghost2 §4 — the registered scorer for the sandHigh ghost-disc fix, take 2.
 * Reads progress/records/fxfix1/, prints the tri-state table through tools/gate.mjs and the
 * registered ship rule's choice. VOID is not PASS; the LOOK gate (§5) is adjudicated in the
 * RESULT off the crops this file writes — the verdict line is necessary, never sufficient.
 * A mismatch between this file and the prereg voids the scoring, not the seal.
 *
 *   node progress/records/fxfix/fxghost2-score.mjs
 */
import { shipVerdict, verdictLine, guardState } from '../../../tools/gate.mjs';
import {
  DIR, loadRun, diffPx, roiMeanL, contribution, coolGlint, readbackOK, stampsOK, pageCleanOK,
  writeCrop, ARM_EXPECT,
} from './fxfix-lib.mjs';
import path from 'node:path';

/* Shots this seal consumes, and the arms each carries (PREREG-fxghost2 §3). */
const A_SHOTS = ['temple', 'night', 'interior', 'dunes', 'hero', 'courtyard'];
const LOOK_SHOT = 'sly-profile';
const ARMS = ['g25', 'g00', 't30', 't18'];          // ship-rule order, registered
const AMBIENT_ARMS = new Set(['g25', 'g00']);        // recolor class -> F band [0.40, 1.60]
const VALUE = { g25: 'ambGain 0.25', g00: 'ambGain 0.0', t30: 'gain 0.30', t18: 'gain 0.18' };

/* Registered ghost ROIs [x0,y0,x1,y1] — PREREG-fxghost §3, carried verbatim (parent amps in
   the comments; they are quoted, not re-derived, and BG re-measures them in THIS boot). */
const G = {
  G1: { shot: 'temple', roi: [602, 138, 656, 194] },   // parent amp_off 15.92 L
  G2: { shot: 'night', roi: [152, 23, 198, 69] },      // 9.49 L
  G3: { shot: 'night', roi: [753, 342, 787, 383] },    // 8.18 L
  G4: { shot: 'night', roi: [954, 43, 988, 71] },      // 6.22 L
  G5: { shot: 'night', roi: [465, 154, 497, 193] },    // 4.62 L
};
/* Protection ROIs — the four named halos (PREREG-critic10-postfx B4, verbatim) + the obelisk. */
const HALO = {
  LAMPS: { shot: 'night', roi: [660, 0, 779, 59] },
  MOON: { shot: 'night', roi: [380, 50, 439, 109] },
  'TORCH-A': { shot: 'interior', roi: [1004, 175, 1031, 218] },
  'TORCH-B': { shot: 'interior', roi: [280, 190, 307, 227] },
};
const OBELISK_ROI = [580, 0, 650, 150];               // courtyard, coolGlint(120,10)
const FIELD_SHOTS = ['dunes', 'hero', 'courtyard'];

const { manifest, row, img } = loadRun();
const g = {};

/* V1 stamps · V2 readbacks · V3 the composite ran and the page was quiet */
g.V1_stamps = stampsOK(manifest);
g.V3_pageclean = pageCleanOK(manifest);
{
  let ok = true;
  for (const shot of A_SHOTS) for (const arm of ['off', 'ahide', ...ARMS, 'back']) {
    const r = row(shot, arm);
    if (!r || !readbackOK(r, ARM_EXPECT[arm]) || r.readback.sandLive < 1) {
      ok = false; console.log(`  V2 readback bad: ${shot}.${arm}`);
    }
  }
  for (const arm of ['off', 'ahide', 'g00', 't18', 'back']) {
    const r = row(LOOK_SHOT, arm);
    if (!r || !readbackOK(r, ARM_EXPECT[arm])) { ok = false; console.log(`  V2 readback bad: ${LOOK_SHOT}.${arm}`); }
  }
  g.V2_readbacks = ok;
}

/* R — per-shot off/back strict [0,0] (brackets every intervening poke of the shot) */
const R_SHOTS = [...A_SHOTS, LOOK_SHOT];
for (const shot of R_SHOTS) {
  const d = diffPx(img(shot, 'off'), img(shot, 'back'));
  g[`R_${shot}`] = d === null ? null : d === 0;
  console.log(`R_${shot}: diff(off,back) = ${d === null ? 'MISSING' : d} px`);
}

/* BG — the defect must be present at this staging (amp = arm - ahide over the ROI) */
const amp = (name, arm) => {
  const { shot, roi } = G[name];
  const a = img(shot, arm), h = img(shot, 'ahide');
  if (!a || !h) return null;
  return roiMeanL(a, roi) - roiMeanL(h, roi);
};
const amp0 = {};
for (const name of Object.keys(G)) {
  amp0[name] = amp(name, 'off');
  console.log(`amp_off(${name}) = ${amp0[name] === null ? 'MISSING' : amp0[name].toFixed(2)} L`);
}
g.BG_G1 = amp0.G1 === null ? null : amp0.G1 >= 8;
g.BG_G2 = amp0.G2 === null ? null : amp0.G2 >= 5;

/* GHOST — residual ratio per arm */
const ghost = {};
for (const arm of ARMS) {
  ghost[arm] = {};
  for (const name of Object.keys(G)) {
    const a = amp(name, arm);
    ghost[arm][name] = a === null || !amp0[name] ? null : { amp: a, ratio: a / amp0[name] };
  }
  console.log(`${arm} (${VALUE[arm]}): ` + Object.keys(G).map((n) => `${n} ${ghost[arm][n]
    ? `${ghost[arm][n].amp.toFixed(2)}L (r ${ghost[arm][n].ratio.toFixed(2)})` : 'n/a'}`).join('  '));
}

/* The §2 linear decomposition, solved from THIS boot's ambient arms and reported (no gate):
   with amp(g) = amp(0 ambient removed at g) the two g-arms pin how much of each disc the
   ambient leg carries. Printed so the RESULT can route PF1/PF2 on numbers, not on adjectives. */
for (const name of Object.keys(G)) {
  const a1 = ghost.g25[name], a0 = ghost.g00[name];
  if (a1 && a0 && amp0[name]) {
    const ambShare = (amp0[name] - a0.amp) / amp0[name];
    console.log(`  decomp ${name}: ambient leg carries ${(100 * ambShare).toFixed(1)}% of amp_off`
      + ` (g25 ${a1.amp.toFixed(2)}L, g00 ${a0.amp.toFixed(2)}L)`);
  }
}

/* FIELD — exterior contribution vs the pool-hidden reference */
const field = {};
for (const shot of FIELD_SHOTS) {
  const off = img(shot, 'off'), hid = img(shot, 'ahide');
  const base = off && hid ? contribution(off, hid, 2) : null;
  field[shot] = { base, arms: {} };
  for (const arm of ARMS) {
    const a = img(shot, arm);
    const c = a && hid ? contribution(a, hid, 2) : null;
    field[shot].arms[arm] = c && base && base.sum > 0
      ? { ratio: c.sum / base.sum, n: c.n, nRatio: base.n ? c.n / base.n : null } : null;
  }
  console.log(`field ${shot}: base sum ${base ? base.sum.toFixed(0) : 'n/a'} n ${base?.n ?? 'n/a'}  `
    + ARMS.map((m) => `${m} ${field[shot].arms[m]
      ? `x${field[shot].arms[m].ratio.toFixed(2)} (n x${field[shot].arms[m].nRatio?.toFixed(2)})` : 'n/a'}`).join('  '));
}

/* HALO + OBELISK protections */
const halo = {};
for (const [name, { shot, roi }] of Object.entries(HALO)) {
  const off = img(shot, 'off');
  halo[name] = {};
  for (const arm of ARMS) {
    const a = img(shot, arm);
    halo[name][arm] = off && a ? Math.abs(roiMeanL(a, roi) - roiMeanL(off, roi)) : null;
  }
  console.log(`halo ${name}: ` + ARMS.map((m) => `${m} ${halo[name][m] === null ? 'n/a' : halo[name][m].toFixed(3)}`).join('  '));
}
const obelisk = {};
{
  const courtOff = img('courtyard', 'off');
  const base = courtOff ? coolGlint(courtOff, OBELISK_ROI, 120, 10).n : null;
  for (const arm of ARMS) {
    const a = img('courtyard', arm);
    obelisk[arm] = a && base
      ? { retention: coolGlint(a, OBELISK_ROI, 120, 10).n / Math.max(1, base),
        delta: Math.abs(roiMeanL(a, OBELISK_ROI) - roiMeanL(courtOff, OBELISK_ROI)) }
      : null;
  }
  console.log(`obelisk (off ${base} px): ` + ARMS.map((m) => `${m} ${obelisk[m]
    ? `r${obelisk[m].retention.toFixed(2)} d${obelisk[m].delta.toFixed(2)}` : 'n/a'}`).join('  '));
}

/* Per-arm bands — PREREG-fxghost2 §4, verbatim */
function armPasses(arm) {
  const gh = ghost[arm];
  const checks = {
    [`GH_G1_${arm}`]: gh.G1 === null ? null : gh.G1.ratio <= 0.30 && gh.G1.amp <= 6.0,
    [`GH_G2_${arm}`]: gh.G2 === null ? null : gh.G2.ratio <= 0.35 && gh.G2.amp <= 5.0,
    [`GH_G3_${arm}`]: gh.G3 === null ? null : gh.G3.ratio <= 0.55,
    [`GH_G4_${arm}`]: gh.G4 === null ? null : gh.G4.ratio <= 0.55,
    [`GH_G5_${arm}`]: gh.G5 === null ? null : gh.G5.ratio <= 0.55,
  };
  /* F band by arm CLASS: recolors take the parent's [0.40,1.60]; the opacity arms take §2's
     disclosed [0.15,1.60] and carry PF4 (the coordinator may hold them to §138.4's +/-15%). */
  const lo = AMBIENT_ARMS.has(arm) ? 0.40 : 0.15;
  for (const shot of FIELD_SHOTS) {
    const f = field[shot].arms[arm];
    checks[`F_${shot}_${arm}`] = f === null ? null : f.ratio >= lo && f.ratio <= 1.60;
  }
  for (const name of Object.keys(HALO)) {
    checks[`HALO_${name}_${arm}`] = halo[name][arm] === null ? null : halo[name][arm] <= 1.0;
  }
  checks[`P_obelisk_${arm}`] = obelisk[arm] === null ? null
    : obelisk[arm].retention >= 0.85 && obelisk[arm].delta <= 1.5;
  return checks;
}

const validity = {
  V1_stamps: g.V1_stamps, V2_readbacks: g.V2_readbacks, V3_pageclean: g.V3_pageclean,
  BG_G1: g.BG_G1, BG_G2: g.BG_G2,
  ...Object.fromEntries(R_SHOTS.map((s) => [`R_${s}`, g[`R_${s}`]])),
};
console.log('\n-- validity --');
for (const [k, v] of Object.entries(validity)) console.log(`  ${k}: ${guardState(v)}`);

let chosen = null;
for (const arm of ARMS) {   // registered order: recolor before thinning, largest gain first
  const v = shipVerdict({ ...validity, ...armPasses(arm) });
  console.log(`\narm ${arm}: ${verdictLine(v, `sand_haze.${VALUE[arm]}`)}`);
  if (v.ship && !chosen) chosen = arm;
}

/* LOOK-gate crops (the binding half — adjudicated in the RESULT, never here) */
const CROPS = path.join(DIR, 'crops');
for (const [shot, arms, box, z, name] of [
  ['temple', ['off', 'ahide', 'g25', 'g00', 't30', 't18'], [582, 118, 100, 100], 4, 'temple-G1'],
  ['night', ['off', 'ahide', 'g00', 't30', 't18'], [132, 3, 90, 90], 4, 'night-G2'],
  ['night', ['off', 'g00', 't30', 't18'], [733, 322, 80, 80], 4, 'night-G3'],
  ['dunes', ['off', 'ahide', 'g25', 'g00', 't30', 't18'], [400, 100, 320, 180], 2, 'dunes-veil'],
  ['dunes', ['off', 'g00', 't18'], [0, 0, 1280, 720], 1, 'dunes-full'],
  ['hero', ['off', 'g25', 'g00', 't30', 't18'], [480, 60, 320, 180], 2, 'hero-sky'],
  ['courtyard', ['off', 'g00', 't18'], [560, 0, 120, 160], 2, 'court-obelisk'],
  ['interior', ['off', 'g00', 't18'], [0, 0, 1280, 720], 1, 'interior-full'],
  ['sly-profile', ['off', 'g00', 't18'], [0, 0, 1280, 720], 1, 'profile-full'],
]) {
  for (const arm of arms) {
    const im = img(shot, arm);
    if (im) writeCrop(im, box, z, path.join(CROPS, `fxghost2-${name}-${arm}-${z}x.png`));
  }
}
console.log(`\ncrops -> ${CROPS} (fxghost2-*). The RESULT adjudicates the LOOK gate (§5) off these;`);
console.log('a verdict line above without the looked-at crops is NOT a ship decision.');
console.log(chosen
  ? `\n==> mechanical ship rule: FIRST passing arm in the registered order = ${chosen} (sand_haze.${VALUE[chosen]})`
  : '\n==> mechanical ship rule: NO arm passes — no ship; record the decomposition (PREREG-fxghost2 §6).');
process.exit(chosen ? 0 : 1);
