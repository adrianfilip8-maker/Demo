#!/usr/bin/env node
/* a2score — A-only scoring of the a2 run (PREREG-fxcluster-a2).
 *
 * Same sealed path as score-all.mjs's A section verbatim: the relocated SEALED scorer
 * `fxcluster-diag.mjs` (section A) with FXC_GUARD/FXC_GUARD_B env-overridden per arm, plus
 * `score-aux.mjs A` for the Q-A2 figure rect. Outputs a2-prefixed. Thresholds transcribed
 * from PREREG-fxcluster-a2 §2 (= parent §A carried) — transcription, not judgement.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const F = (arm) => path.join(DIR, `a2-guard.${arm}.png`);
mkdirSync(path.join(DIR, 'crops'), { recursive: true });

function runDiag(env, arm) {
  execFileSync('node', [path.join(DIR, 'fxcluster-diag.mjs'), 'A'], {
    env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const j = JSON.parse(readFileSync(path.join(DIR, 'fxcluster-diag-out.json'), 'utf8'));
  renameSync(path.join(DIR, 'fxcluster-diag-out.json'), path.join(DIR, `diag-a2-guard.${arm}.json`));
  for (const f of readdirSync(DIR)) {
    if (f.startsWith('fxcluster-') && f.endsWith('-crop.png')) {
      renameSync(path.join(DIR, f), path.join(DIR, 'crops', `a2-guard.${arm}-${f.replace('fxcluster-', '')}`));
    }
  }
  return j.sections.A;
}

const runAux = (frame) => JSON.parse(execFileSync('node', [path.join(DIR, 'score-aux.mjs'), frame, 'A'], { encoding: 'utf8' }));

const S = { at: new Date().toISOString(), run: 'a2 (same -0.20 heading lever, residue-pinned staging)', arms: {}, quantities: {} };

for (const arm of ['base', 'base2', 'cand', 'restore']) {
  const f = F(arm);
  if (!existsSync(f)) { console.log(`a2-guard.${arm}: frame missing — skipped`); continue; }
  const d = runDiag({ FXC_GUARD: f, FXC_GUARD_B: f }, arm);
  const aux = runAux(f);
  S.arms[arm] = {
    roiMedL: +d.candPathROI.medL.toFixed(2), roiMeanRmB: +d.candPathROI.meanRmB.toFixed(2),
    roiWarmPx: d.candPathROI.warmPx,
    airColMedL: +d.airColumn.medL.toFixed(2),
    figureMedL: aux.figureRectMedL,
  };
  console.log(`a2-guard.${arm}: ROI medL ${S.arms[arm].roiMedL}  figure medL ${aux.figureRectMedL}  aircol medL ${S.arms[arm].airColMedL}`);
}

if (S.arms.base && S.arms.cand) {
  const g = (a) => S.arms[a];
  const noise2 = S.arms.base2 ? +Math.abs(g('base2').roiMedL - g('base').roiMedL).toFixed(2) : null;
  const noiseR = S.arms.restore ? +Math.abs(g('restore').roiMedL - g('base').roiMedL).toFixed(2) : null;
  const qa1 = +(g('cand').roiMedL - g('base').roiMedL).toFixed(2);
  S.quantities.A2 = {
    'Q-A1 ΔmedL cand-base, ROI(340,280,700,350)': { value: qa1, band: '[+3.0, +45.0]' },
    'noise |base2-base| ROI': { value: noise2, band: '<= 1.0' },
    'noise |restore-base| ROI': { value: noiseR, band: '<= 1.0' },
    '§13: Q-A1 vs 3x max same-state Δ': { value: qa1, threshold: noise2 !== null && noiseR !== null ? +(3 * Math.max(noise2, noiseR)).toFixed(2) : null, band: 'Q-A1 >= 3x max same-state Δ' },
    'Q-A2 figure(852,220,990,700) medL cand-base': { value: +(g('cand').figureMedL - g('base').figureMedL).toFixed(2), band: '>= -3.0' },
    'Q-A3 air column |Δ| (context, not a gate)': { value: +Math.abs(g('cand').airColMedL - g('base').airColMedL).toFixed(2), band: 'expected <= 8, report' },
  };
  S.gates = {
    qa1InBand: qa1 >= 3.0 && qa1 <= 45.0,
    noiseBase2: noise2 !== null ? noise2 <= 1.0 : null,
    noiseRestore: noiseR !== null ? noiseR <= 1.0 : null,
    threeX: noise2 !== null && noiseR !== null ? qa1 >= 3 * Math.max(noise2, noiseR) : null,
    qa2NoHarm: (g('cand').figureMedL - g('base').figureMedL) >= -3.0,
  };
}

writeFileSync(path.join(DIR, 'a2-scores.json'), JSON.stringify(S, null, 1));
console.log('\nwrote a2-scores.json');
console.log(JSON.stringify(S.quantities, null, 1));
console.log('gates:', JSON.stringify(S.gates));
