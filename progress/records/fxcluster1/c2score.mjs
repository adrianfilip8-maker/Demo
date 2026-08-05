#!/usr/bin/env node
/* c2score — C-only scoring of the c2 successor run (PREREG-fxcluster-c2).
 *
 * Same sealed path as score-all.mjs's C section verbatim: the relocated SEALED scorer
 * `fxcluster-diag.mjs` (section C) with FXC_COMBAT/FXC_COMBAT_B env-overridden per arm,
 * plus `score-aux.mjs C` for Q-C3's component bbox and Q-C4's medSat-at-L200. Outputs are
 * c2-prefixed (diag-c2-combat.<arm>.json, crops/c2-combat.<arm>-*.png, c2-scores.json) so
 * nothing earlier is clobbered. Thresholds transcribed from PREREG-fxcluster-c2 §2/§3 —
 * transcription, not judgement; the RESULT appendix adjudicates.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const F = (arm) => path.join(DIR, `c2-combat.${arm}.png`);
mkdirSync(path.join(DIR, 'crops'), { recursive: true });

function runDiag(env, arm) {
  const out = execFileSync('node', [path.join(DIR, 'fxcluster-diag.mjs'), 'C'], {
    env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const j = JSON.parse(readFileSync(path.join(DIR, 'fxcluster-diag-out.json'), 'utf8'));
  renameSync(path.join(DIR, 'fxcluster-diag-out.json'), path.join(DIR, `diag-c2-combat.${arm}.json`));
  for (const f of readdirSync(DIR)) {
    if (f.startsWith('fxcluster-') && f.endsWith('-crop.png')) {
      renameSync(path.join(DIR, f), path.join(DIR, 'crops', `c2-combat.${arm}-${f.replace('fxcluster-', '')}`));
    }
  }
  return { stdout: out, json: j.sections.C };
}

const runAux = (frame) => JSON.parse(execFileSync('node', [path.join(DIR, 'score-aux.mjs'), frame, 'C'], { encoding: 'utf8' }));

const S = { at: new Date().toISOString(), run: 'c2 successor (warmer flash core, pool-wiped staging)', arms: {}, quantities: {} };

for (const arm of ['base', 'cand', 'restore']) {
  const f = F(arm);
  if (!existsSync(f)) { console.log(`c2-combat.${arm}: frame missing — skipped`); continue; }
  const d = runDiag({ FXC_COMBAT: f, FXC_COMBAT_B: f }, arm).json;
  const aux = runAux(f);
  S.arms[arm] = {
    figMedSat: d.gold1.figure.medSat, figMedL: d.gold1.figure.medL,
    chalkShare: d.gold1.chalkShare, goldPx: d.gold1.goldPx, bluePx: d.gold1.bluePx,
    blobPx: aux.flashBlob?.px ?? 0, blobBbox: aux.flashBlob?.bbox ?? null,
    blobMedSatL200: aux.blobBboxMedSatAtL200 ?? null, blobL200n: aux.blobBboxL200n ?? 0,
    brightBand: d.gold1.brightBand,
  };
  console.log(`c2-combat.${arm}: medSat ${d.gold1.figure.medSat}  chalk ${d.gold1.chalkShare}  blob ${aux.flashBlob?.px} px  blobSat@L200 ${aux.blobBboxMedSatAtL200}`);
}

if (S.arms.base && S.arms.cand) {
  const c = (a) => S.arms[a];
  const r = S.arms.restore;
  S.quantities.C2 = {
    'Q-C1 figure medSat (base)': { value: c('base').figMedSat, band: '0.370±0.02 (anchor)' },
    'Q-C1 figure medSat (cand)': { value: c('cand').figMedSat, band: '[0.40, 0.62]' },
    'Q-C2 chalk share (base)': { value: c('base').chalkShare, band: '0.137±0.010' },
    'Q-C2 chalk share (cand)': { value: c('cand').chalkShare, band: '[0.015, 0.095]' },
    'Q-C3 flash blob px (base)': { value: c('base').blobPx, band: '7304±15%' },
    'Q-C3 flash blob px (cand)': { value: c('cand').blobPx, band: '[400, 4800]' },
    'Q-C4 blob-bbox medSat at L>=200 (cand)': { value: c('cand').blobMedSatL200, band: '>= 0.20' },
    'Q-C4 known-bad reference (base, report)': { value: c('base').blobMedSatL200, band: 'known-bad class ~0.16, report' },
    'restore gates (vs base tolerances)': r ? {
      medSat: { value: r.figMedSat, band: 'base±0.02' },
      chalk: { value: r.chalkShare, band: 'base±0.010' },
      blob: { value: r.blobPx, band: 'base±15%' },
    } : null,
    'Q-C5r |restore-base| blob share (report)': r ? { value: +(Math.abs(r.blobPx - c('base').blobPx) / c('base').blobPx * 100).toFixed(2) + '%', band: 'predicted <= 5%, non-gating' } : null,
    'separation: (cand-base) vs 2x|restore-base| on Q-C4': r ? {
      treatmentGap: +(c('cand').blobMedSatL200 - c('base').blobMedSatL200).toFixed(3),
      noise2x: +(2 * Math.abs(r.blobMedSatL200 - c('base').blobMedSatL200)).toFixed(3),
      band: 'gap > 2x noise, else UNSCOREABLE',
    } : null,
  };
  const inBand = (v, lo, hi) => v >= lo && v <= hi;
  S.gates = {
    baseAnchors: inBand(c('base').figMedSat, 0.35, 0.39) && inBand(c('base').chalkShare, 0.127, 0.147) && inBand(c('base').blobPx, 7304 * 0.85, 7304 * 1.15),
    candC1: inBand(c('cand').figMedSat, 0.40, 0.62),
    candC2: inBand(c('cand').chalkShare, 0.015, 0.095),
    candC3: inBand(c('cand').blobPx, 400, 4800),
    candC4: c('cand').blobMedSatL200 >= 0.20,
    restore: r ? (Math.abs(r.figMedSat - c('base').figMedSat) <= 0.02 && Math.abs(r.chalkShare - c('base').chalkShare) <= 0.010 && Math.abs(r.blobPx - c('base').blobPx) <= 0.15 * c('base').blobPx) : null,
    separation: r ? ((c('cand').blobMedSatL200 - c('base').blobMedSatL200) > 2 * Math.abs(r.blobMedSatL200 - c('base').blobMedSatL200)) : null,
  };
}

writeFileSync(path.join(DIR, 'c2-scores.json'), JSON.stringify(S, null, 1));
console.log('\nwrote c2-scores.json');
console.log(JSON.stringify(S.quantities, null, 1));
console.log('gates:', JSON.stringify(S.gates));
