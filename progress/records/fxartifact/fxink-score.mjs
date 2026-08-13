/**
 * PREREG-fxink §5 — the registered scorer for seal (b): FX exclusion from the ink composite
 * (TUNE.fxInkCut 0 -> 1). Reads progress/records/fxartifact1/; tri-state via tools/gate.mjs;
 * the LOOK gate is adjudicated in the RESULT off the crops this file writes.
 *
 *   node progress/records/fxartifact/fxink-score.mjs
 */
import { shipVerdict, verdictLine, guardState } from '../../../tools/gate.mjs';
import {
  DIR, loadRun, diffPx, containment, readbackOK, stampsOK, writeCrop, ARM_EXPECT, L,
} from './fxartifact-lib.mjs';
import path from 'node:path';

const SHOTS = ['hero', 'temple', 'sly-closeup', 'courtyard', 'dunes', 'interior', 'night',
  'traversal', 'guard', 'sly-profile', 'combat'];

/* Registered combat ROI (PREREG-fxink §3): the swing band's screen band at the staged
   t = 0.2833 (r11's live-clock frame shows the band spanning the frame at y ~330..540). */
const DONUT_ROI = [0, 330, 1279, 539];

const { manifest, row, img } = loadRun();
const g = {};

g.V1_stamps = stampsOK(manifest);
{
  let ok = true;
  for (const shot of SHOTS) for (const arm of ['off', 'bfx0', 'bon', 'back']) {
    const r = row(shot, arm);
    if (!r || !readbackOK(r, ARM_EXPECT[arm])) { ok = false; console.log(`  V2 readback bad: ${shot}.${arm}`); }
  }
  g.V2_readbacks = ok;
}

for (const shot of SHOTS) {
  const d = diffPx(img(shot, 'off'), img(shot, 'back'));
  g[`R_${shot}`] = d === null ? null : d === 0;
  console.log(`R_${shot}: diff(off,back) = ${d === null ? 'MISSING' : d} px`);
}

/* BG — the combat staging must contain the swing-band FX at all */
{
  const off = img('combat', 'off'), hid = img('combat', 'bfx0');
  let n = 0;
  if (off && hid) {
    for (let y = DONUT_ROI[1]; y <= DONUT_ROI[3]; y++) for (let x = DONUT_ROI[0]; x <= DONUT_ROI[2]; x++) {
      const i = (y * off.w + x) * off.ch, j = (y * hid.w + x) * hid.ch;
      if (L(off.data[i], off.data[i + 1], off.data[i + 2]) - L(hid.data[j], hid.data[j + 1], hid.data[j + 2]) >= 25) n++;
    }
    g.BG_donut = n >= 20000;
  } else g.BG_donut = null;
  console.log(`BG_donut: FX-covered (off-bfx0 >= 25 L) px in DONUT_ROI = ${n} (need >= 20000)`);
}

/* EFFECT — ink lines under the band brighten when the gate fires */
{
  const off = img('combat', 'off'), hid = img('combat', 'bfx0'), on = img('combat', 'bon');
  if (off && hid && on) {
    let removed = 0, sumOffL = 0;
    for (let y = DONUT_ROI[1]; y <= DONUT_ROI[3]; y++) for (let x = DONUT_ROI[0]; x <= DONUT_ROI[2]; x++) {
      const i = (y * off.w + x) * off.ch, j = (y * hid.w + x) * hid.ch, k = (y * on.w + x) * on.ch;
      const lOff = L(off.data[i], off.data[i + 1], off.data[i + 2]);
      const lHid = L(hid.data[j], hid.data[j + 1], hid.data[j + 2]);
      const lOn = L(on.data[k], on.data[k + 1], on.data[k + 2]);
      if (lOff - lHid >= 25 && lOn - lOff >= 8) { removed++; sumOffL += lOff; }
    }
    const meanOffL = removed ? sumOffL / removed : null;
    g.E1_inkRemoved = removed >= 500;
    g.E2_onDarkLines = removed ? meanOffL <= 165 : null;
    console.log(`E1: ink-removed px (FX-covered & bon-off >= +8) = ${removed} (need >= 500)`);
    console.log(`E2: mean off-L over that set = ${meanOffL === null ? 'n/a' : meanOffL.toFixed(1)} (need <= 165)`);
  } else { g.E1_inkRemoved = null; g.E2_onDarkLines = null; }
}

/* CONTAINMENT — on every shot, bon's changes lie inside the r=6-dilated FX footprint */
for (const shot of SHOTS) {
  const off = img(shot, 'off'), on = img(shot, 'bon'), hid = img(shot, 'bfx0');
  if (!off || !on || !hid) { g[`C_${shot}`] = null; continue; }
  const c = containment(off, on, off, hid, { thrC: 2, thrF: 1, r: 6 });
  g[`C_${shot}`] = c.changed === 0 ? true : c.frac >= 0.99;
  console.log(`C_${shot}: changed ${c.changed} px, contained ${(100 * c.frac).toFixed(2)}%${c.changed === 0 ? ' (empty = PASS: the gate moved nothing here)' : ''}`);
}

const verdict = shipVerdict(g);
console.log('\n-- guards --');
for (const [k, v] of Object.entries(g)) console.log(`  ${k}: ${guardState(v)}`);
console.log(`\n${verdictLine(verdict, 'TUNE.fxInkCut 0 -> 1 (PostFX.js)')}`);

/* LOOK crops (binding half — adjudicated in the RESULT) */
const CROPS = path.join(DIR, 'crops');
for (const [shot, arms, box, z, name] of [
  ['combat', ['off', 'bon', 'bfx0'], [0, 340, 320, 160], 2, 'combat-bandL'],
  ['combat', ['off', 'bon'], [780, 370, 320, 160], 2, 'combat-bandR'],
  ['night', ['off', 'bon'], [620, 0, 220, 120], 3, 'night-lanterns'],
  ['interior', ['off', 'bon'], [960, 140, 160, 120], 3, 'interior-flame'],
  ['traversal', ['off', 'bon'], [0, 0, 1280, 720], 1, 'traversal-full'],
]) {
  for (const arm of arms) {
    const im = img(shot, arm);
    if (im) writeCrop(im, box, z, path.join(CROPS, `fxink-${name}-${arm}-${z}x.png`));
  }
}
console.log(`crops -> ${CROPS} (fxink-*). The RESULT adjudicates the LOOK gate off these.`);
process.exit(verdict.ship ? 0 : 1);
