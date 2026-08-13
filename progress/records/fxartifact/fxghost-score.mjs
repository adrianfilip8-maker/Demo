/**
 * PREREG-fxghost §5 — the registered scorer for seal (a): the sandHigh ghost-disc fix.
 * Reads progress/records/fxartifact1/, prints the tri-state table through tools/gate.mjs and
 * the registered ship rule's choice. VOID is not PASS; the LOOK gate is adjudicated in the
 * RESULT off the crops this file writes — the scorer's verdict line is necessary, not
 * sufficient. A mismatch between this file and the prereg voids the scoring, not the seal.
 *
 *   node progress/records/fxartifact/fxghost-score.mjs
 */
import { shipVerdict, verdictLine, guardState } from '../../../tools/gate.mjs';
import {
  DIR, loadRun, diffPx, roiMeanL, contribution, readbackOK, stampsOK, writeCrop, ARM_EXPECT,
} from './fxartifact-lib.mjs';
import path from 'node:path';

const A_SHOTS = ['temple', 'night', 'interior', 'sly-profile', 'dunes', 'hero', 'courtyard'];
const ARMS = ['a26', 'a13', 'a00'];

/* Registered ghost ROIs [x0,y0,x1,y1] — PREREG-fxghost §3 (from the c10postfx run-2
   components, reproduced offline 2026-08-13 by ghostdecomp; {dt:0} staging both times). */
const G = {
  G1: { shot: 'temple', roi: [602, 138, 656, 194] },
  G2: { shot: 'night', roi: [152, 23, 198, 69] },
  G3: { shot: 'night', roi: [753, 342, 787, 383] },
  G4: { shot: 'night', roi: [954, 43, 988, 71] },
  G5: { shot: 'night', roi: [465, 154, 497, 193] },
};
/* Halo protection ROIs (PREREG-critic10-postfx B4, carried verbatim, [x,y,w,h] -> box). */
const HALO = {
  LAMPS: { shot: 'night', roi: [660, 0, 779, 59] },
  MOON: { shot: 'night', roi: [380, 50, 439, 109] },
  'TORCH-A': { shot: 'interior', roi: [1004, 175, 1031, 218] },
  'TORCH-B': { shot: 'interior', roi: [280, 190, 307, 227] },
};
const FIELD_SHOTS = ['dunes', 'hero', 'courtyard'];

const { manifest, row, img } = loadRun();
const g = {};

/* V1 — stamps; V2 — readbacks on every row this seal consumes */
g.V1_stamps = stampsOK(manifest);
{
  let ok = true;
  for (const shot of A_SHOTS) for (const arm of ['off', 'ahide', ...ARMS, 'back']) {
    const r = row(shot, arm);
    if (!r || !readbackOK(r, ARM_EXPECT[arm]) || r.readback.sandLive < 1) { ok = false; console.log(`  V2 readback bad: ${shot}.${arm}`); }
  }
  g.V2_readbacks = ok;
}

/* R — per-shot off/back strict [0,0] (brackets every intervening poke of the shot) */
for (const shot of A_SHOTS) {
  const d = diffPx(img(shot, 'off'), img(shot, 'back'));
  g[`R_${shot}`] = d === null ? null : d === 0;
  console.log(`R_${shot}: diff(off,back) = ${d === null ? 'MISSING' : d} px`);
}

/* BG — the defect must be present at this staging (amp = off - ahide over the ROI) */
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

/* GHOST — residual ratio per arm (gated per ship rule at the chosen arm) */
const ghost = {};
for (const arm of ARMS) {
  ghost[arm] = {};
  for (const name of Object.keys(G)) {
    const a = amp(name, arm);
    ghost[arm][name] = a === null || !amp0[name] ? null : { amp: a, ratio: a / amp0[name] };
  }
  console.log(`${arm}: ` + Object.keys(G).map((n) => `${n} ${ghost[arm][n] ? `${ghost[arm][n].amp.toFixed(2)}L (r ${ghost[arm][n].ratio.toFixed(2)})` : 'n/a'}`).join('  '));
}

/* FIELD — exterior contribution vs the pool-hidden reference (recolor cost band §4) */
const field = {};
for (const shot of FIELD_SHOTS) {
  const off = img(shot, 'off'), hid = img(shot, 'ahide');
  const base = off && hid ? contribution(off, hid, 2) : null;
  field[shot] = { base, arms: {} };
  for (const arm of ARMS) {
    const a = img(shot, arm);
    const c = a && hid ? contribution(a, hid, 2) : null;
    field[shot].arms[arm] = c && base && base.sum > 0 ? { ratio: c.sum / base.sum, n: c.n, nRatio: base.n ? c.n / base.n : null } : null;
  }
  console.log(`field ${shot}: base sum ${base ? base.sum.toFixed(0) : 'n/a'} n ${base?.n ?? 'n/a'}  ` + ARMS.map((m) => `${m} ${field[shot].arms[m] ? `x${field[shot].arms[m].ratio.toFixed(2)} (n x${field[shot].arms[m].nRatio?.toFixed(2)})` : 'n/a'}`).join('  '));
}

/* HALO — |mean L(arm) - mean L(off)| <= 1.0 per ROI per arm */
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

/* Per-arm pass evaluation (bands are PREREG-fxghost §4, verbatim) */
function armPasses(arm) {
  const gh = ghost[arm];
  const checks = {
    [`GH_G1_${arm}`]: gh.G1 === null ? null : gh.G1.ratio <= 0.30 && gh.G1.amp <= 6.0,
    [`GH_G2_${arm}`]: gh.G2 === null ? null : gh.G2.ratio <= 0.35 && gh.G2.amp <= 5.0,
    [`GH_G3_${arm}`]: gh.G3 === null ? null : gh.G3.ratio <= 0.55,
    [`GH_G4_${arm}`]: gh.G4 === null ? null : gh.G4.ratio <= 0.55,
    [`GH_G5_${arm}`]: gh.G5 === null ? null : gh.G5.ratio <= 0.55,
  };
  for (const shot of FIELD_SHOTS) {
    const f = field[shot].arms[arm];
    checks[`F_${shot}_${arm}`] = f === null ? null : f.ratio >= 0.40 && f.ratio <= 1.60;
  }
  for (const name of Object.keys(HALO)) {
    checks[`HALO_${name}_${arm}`] = halo[name][arm] === null ? null : halo[name][arm] <= 1.0;
  }
  return checks;
}

/* Fail-closed composition: validity + R gates apply to every arm's verdict */
const validity = {
  V1_stamps: g.V1_stamps, V2_readbacks: g.V2_readbacks,
  BG_G1: g.BG_G1, BG_G2: g.BG_G2,
  ...Object.fromEntries(A_SHOTS.map((s) => [`R_${s}`, g[`R_${s}`]])),
};
console.log('\n-- validity --');
for (const [k, v] of Object.entries(validity)) console.log(`  ${k}: ${guardState(v)}`);

let chosen = null;
for (const arm of ARMS) { // 0.26 first: the ship rule takes the LARGEST passing litMix
  const v = shipVerdict({ ...validity, ...armPasses(arm) });
  console.log(`\narm ${arm}: ${verdictLine(v, `sand_haze.litMix ${{ a26: 0.26, a13: 0.13, a00: 0.0 }[arm]}`)}`);
  if (v.ship && !chosen) chosen = arm;
}

/* LOOK-gate crops (binding half — adjudicated in the RESULT, never here) */
const CROPS = path.join(DIR, 'crops');
const cropJobs = [
  ['temple', ['off', 'ahide', 'a26', 'a13', 'a00'], [582, 118, 100, 100], 4, 'temple-G1'],
  ['night', ['off', 'ahide', 'a13', 'a00'], [132, 3, 90, 90], 4, 'night-G2'],
  ['night', ['off', 'a13', 'a00'], [733, 322, 80, 80], 4, 'night-G3'],
  ['dunes', ['off', 'a13', 'a00'], [400, 100, 320, 180], 2, 'dunes-veil'],
  ['hero', ['off', 'a13', 'a00'], [480, 60, 320, 180], 2, 'hero-sky'],
  ['interior', ['off', 'a00'], [0, 0, 1280, 720], 1, 'interior-full'],
  ['sly-profile', ['off', 'a00'], [0, 0, 1280, 720], 1, 'profile-full'],
];
for (const [shot, arms, box, z, name] of cropJobs) {
  for (const arm of arms) {
    const im = img(shot, arm);
    if (im) writeCrop(im, box, z, path.join(CROPS, `fxghost-${name}-${arm}-${z}x.png`));
  }
}
console.log(`\ncrops -> ${CROPS} (fxghost-*). The RESULT adjudicates the LOOK gate off these; a`);
console.log('verdict line above without the looked-at crops is NOT a ship decision.');
console.log(chosen
  ? `\n==> mechanical ship rule: LARGEST passing litMix arm = ${chosen} (${{ a26: 0.26, a13: 0.13, a00: 0.0 }[chosen]})`
  : '\n==> mechanical ship rule: NO arm passes — no ship; record the decomposition (PF branches, PREREG-fxghost §6).');
process.exit(chosen ? 0 : 1);
