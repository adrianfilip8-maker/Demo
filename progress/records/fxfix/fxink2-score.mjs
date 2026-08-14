/**
 * PREREG-fxink2 §4 — the registered scorer for the FX-raster-time ink exclusion.
 * Reads progress/records/fxfix2/; tri-state via tools/gate.mjs; the LOOK gate (§5) is
 * adjudicated in the RESULT off the crops this file writes. VOID is not PASS.
 *
 *   node progress/records/fxfix/fxink2-score.mjs
 */
import { shipVerdict, verdictLine, guardState } from '../../../tools/gate.mjs';
import { diffPx, roiMeanL, containment, writeCrop, L } from '../fxartifact/fxartifact-lib.mjs';
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = path.join(ROOT, 'progress/records/fxfix2');

const SHOTS = ['hero', 'temple', 'sly-closeup', 'courtyard', 'dunes', 'interior', 'night',
  'traversal', 'guard', 'sly-profile', 'combat'];
const ARMS = ['bon', 'b50'];                      // ship-rule order, registered
const VALUE = { bon: 1.0, b50: 0.5 };

/* Registered ROIs — PREREG-fxink2 §3. DONUT is PREREG-fxink §3's, verbatim; SHAFTBAND was
   drawn on the committed fxartifact1/temple frames before any arm of this run existed. */
const DONUT = [0, 330, 1279, 539];
const SHAFTBAND = [500, 60, 1150, 520];

const manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const row = (shot, arm) => manifest.rows.find((r) => r.shot === shot && r.arm === arm) || null;
const img = (shot, arm) => {
  const r = row(shot, arm);
  if (!r) return null;
  const f = path.join(DIR, r.file);
  return existsSync(f) ? readPNG(f) : null;
};

const g = {};
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;

/* V1 — one src content hash across every row (this run installs nothing, so the expected
   value is "whatever the boot started with, unchanged"; a foreign src landing mid-run in this
   shared tree changes it and VOIDs here, which is the only thing the stamp has to catch). */
g.V1_stamps = manifest.rows.length > 0
  && manifest.rows.every((r) => r.tree?.src && r.tree.src === manifest.rows[0].tree.src);

/* V2 — readbacks; V4 — the coverage target was BOUND at the poked arms and null at the others */
{
  let ok2 = true, ok4 = true;
  for (const shot of SHOTS) {
    for (const [arm, cut, fxVis] of [['off', 0, true], ['bfx0', 0, false], ['bon', 1.0, true],
      ['b50', 0.5, true], ['back', 0, true]]) {
      const r = row(shot, arm);
      if (!r) { ok2 = false; console.log(`  V2 row missing: ${shot}.${arm}`); continue; }
      const rb = r.readback;
      if (!near(rb.uFxInkCut, cut) || rb.fxRootVis !== fxVis || rb.postfxOk !== true
        || !near(rb.maskFlag, 0) || rb.decalVis !== true) {
        ok2 = false;
        console.log(`  V2 readback bad: ${shot}.${arm} cut=${rb.uFxInkCut} fxVis=${rb.fxRootVis}`
          + ` ok=${rb.postfxOk} maskFlag=${rb.maskFlag} decalVis=${rb.decalVis}`);
      }
      const wantBound = cut > 0;
      if (rb.maskBound !== wantBound) {
        ok4 = false;
        console.log(`  V4 mask binding wrong: ${shot}.${arm} maskBound=${rb.maskBound} (want ${wantBound})`);
      }
    }
  }
  g.V2_readbacks = ok2;
  g.V4_maskbound = ok4;
}

/* V3 — the composite ran and the page was quiet on every row */
g.V3_pageclean = manifest.rows.length > 0
  && manifest.rows.every((r) => r.readback?.postfxOk === true && (r.consoleErrors ?? 0) === 0)
  && (manifest.consoleErrors?.length ?? 0) === 0;

/* R — per-shot off/back strict [0,0] */
for (const shot of SHOTS) {
  const d = diffPx(img(shot, 'off'), img(shot, 'back'));
  g[`R_${shot}`] = d === null ? null : d === 0;
  console.log(`R_${shot}: diff(off,back) = ${d === null ? 'MISSING' : d} px`);
}

/* FXCOV / INKREMOVED over a registered ROI, same-boot */
function fxcov(shot, roi) {
  const off = img(shot, 'off'), hid = img(shot, 'bfx0');
  if (!off || !hid) return null;
  const set = [];
  for (let y = roi[1]; y <= roi[3]; y++) for (let x = roi[0]; x <= roi[2]; x++) {
    const i = (y * off.w + x) * off.ch, j = (y * hid.w + x) * hid.ch;
    if (L(off.data[i], off.data[i + 1], off.data[i + 2])
      - L(hid.data[j], hid.data[j + 1], hid.data[j + 2]) >= 25) set.push(y * off.w + x);
  }
  return set;
}
function inkRemoved(shot, arm, cov) {
  const off = img(shot, 'off'), on = img(shot, arm);
  if (!off || !on || !cov) return null;
  const set = [];
  for (const p of cov) {
    const i = p * off.ch, j = p * on.ch;
    if (L(on.data[j], on.data[j + 1], on.data[j + 2])
      - L(off.data[i], off.data[i + 1], off.data[i + 2]) >= 8) set.push(p);
  }
  return set;
}
const covDonut = fxcov('combat', DONUT);
const covShaft = fxcov('temple', SHAFTBAND);
g.BG_donut = covDonut === null ? null : covDonut.length >= 20000;
g.BG_shaft = covShaft === null ? null : covShaft.length >= 20000;
console.log(`BG_donut: FX-covered px in combat DONUT = ${covDonut?.length ?? 'MISSING'} (need >= 20000)`);
console.log(`BG_shaft: FX-covered px in temple SHAFTBAND = ${covShaft?.length ?? 'MISSING'} (need >= 20000)`);

/* Per-arm statistics */
const stats = {};
for (const arm of ARMS) {
  const s = { containment: {}, monotone: {} };
  const rmD = inkRemoved('combat', arm, covDonut);
  s.E1 = rmD ? rmD.length : null;
  if (rmD && rmD.length) {
    const off = img('combat', 'off');
    let sum = 0;
    for (const p of rmD) { const i = p * off.ch; sum += L(off.data[i], off.data[i + 1], off.data[i + 2]); }
    s.E2 = sum / rmD.length;
  } else s.E2 = null;
  const rmS = inkRemoved('temple', arm, covShaft);
  s.E3 = rmS ? rmS.length : null;

  for (const shot of SHOTS) {
    const off = img(shot, 'off'), on = img(shot, arm), hid = img(shot, 'bfx0');
    if (!off || !on || !hid) { s.containment[shot] = null; s.monotone[shot] = null; continue; }
    s.containment[shot] = containment(off, on, off, hid, { thrC: 2, thrF: 1, r: 6 });
    /* P_monotone: the ink pass is strictly SUBTRACTIVE (ink = min(mix(...), c)), so removing
       ink can only BRIGHTEN a pixel. Scored as an ENERGY ratio rather than a pixel count —
       see PREREG-fxink2 §4: FXAA runs after the composite and ripples 1-2 px either way at
       every edge the gate moves, so the COUNT of darkened pixels is dominated by the
       antialiaser wherever the changed set is small, while the summed magnitude is not. */
    let changed = 0, up = 0, dn = 0;
    for (let i = 0; i < off.w * off.h; i++) {
      const a = i * off.ch, b = i * on.ch;
      const d = L(on.data[b], on.data[b + 1], on.data[b + 2]) - L(off.data[a], off.data[a + 1], off.data[a + 2]);
      if (Math.abs(d) >= 2) { changed++; if (d > 0) up += d; else dn -= d; }
    }
    s.monotone[shot] = { changed, up, dn, ratio: up > 0 ? dn / up : (dn > 0 ? 99 : 0) };
  }
  stats[arm] = s;
  console.log(`\n${arm} (fxInkCut ${VALUE[arm]}): E1 ${s.E1} px  E2 ${s.E2 === null ? 'n/a' : s.E2.toFixed(1)} L  E3 ${s.E3} px`);
  for (const shot of SHOTS) {
    const c = s.containment[shot], m = s.monotone[shot];
    console.log(`  C_${shot}: changed ${c ? c.changed : 'MISSING'} px, contained `
      + `${c ? (100 * c.frac).toFixed(2) : 'n/a'}%  |  darken/brighten energy `
      + `${m ? m.ratio.toFixed(3) : 'n/a'}`);
  }
}

function armGuards(arm) {
  const s = stats[arm];
  if (!s) return { [`E1_${arm}`]: null };
  const out = {
    [`E1_${arm}`]: s.E1 === null ? null : s.E1 >= 500,
    [`E2_${arm}`]: s.E2 === null ? null : s.E2 <= 165,
    [`E3_${arm}`]: s.E3 === null ? null : s.E3 >= 500,
  };
  for (const shot of SHOTS) {
    const c = s.containment[shot], m = s.monotone[shot];
    out[`C_${shot}_${arm}`] = c === null ? null : (c.changed === 0 ? true : c.frac >= 0.99);
    out[`P_monotone_${shot}_${arm}`] = m === null ? null : m.ratio <= 0.25;
  }
  return out;
}

const validity = {
  V1_stamps: g.V1_stamps, V2_readbacks: g.V2_readbacks, V3_pageclean: g.V3_pageclean,
  V4_maskbound: g.V4_maskbound, BG_donut: g.BG_donut, BG_shaft: g.BG_shaft,
  ...Object.fromEntries(SHOTS.map((s) => [`R_${s}`, g[`R_${s}`]])),
};
console.log('\n-- validity --');
for (const [k, v] of Object.entries(validity)) console.log(`  ${k}: ${guardState(v)}`);

let chosen = null;
for (const arm of ARMS) {   // registered order: 1.0 (cel-correct) first, 0.5 as the fallback
  const v = shipVerdict({ ...validity, ...armGuards(arm) });
  console.log(`\narm ${arm}: ${verdictLine(v, `TUNE.fxInkCut ${VALUE[arm]}`)}`);
  if (v.ship && !chosen) chosen = arm;
}

/* LOOK crops (the binding half) */
const CROPS = path.join(DIR, 'crops');
for (const [shot, arms, box, z, name] of [
  ['combat', ['off', 'bfx0', 'bon', 'b50'], [340, 340, 320, 180], 4, 'combat-band'],
  ['temple', ['off', 'bfx0', 'bon', 'b50'], [520, 120, 400, 260], 3, 'temple-shaft'],
  ['interior', ['off', 'bon'], [960, 150, 200, 160], 3, 'interior-flame'],
  ['hero', ['off', 'bon'], [0, 0, 1280, 720], 1, 'hero-full'],
  ['hero', ['off', 'bon'], [830, 250, 340, 260], 2, 'hero-floorpool'],
  ['night', ['off', 'bon'], [0, 0, 1280, 720], 1, 'night-full'],
  ['traversal', ['off', 'bon'], [0, 0, 1280, 720], 1, 'traversal-full'],
]) {
  for (const arm of arms) {
    const im = img(shot, arm);
    if (im) writeCrop(im, box, z, path.join(CROPS, `fxink2-${name}-${arm}-${z}x.png`));
  }
}
console.log(`\ncrops -> ${CROPS} (fxink2-*). The RESULT adjudicates the LOOK gate (§5) off these;`);
console.log('item 4 (hero/night floor-pool ink) is where the parent candidate died.');
console.log(chosen
  ? `\n==> mechanical ship rule: FIRST passing arm in the registered order = ${chosen} (TUNE.fxInkCut ${VALUE[chosen]})`
  : '\n==> mechanical ship rule: NO arm passes — no ship; record the per-shot containment table (PREREG-fxink2 §6).');
process.exit(chosen ? 0 : 1);
