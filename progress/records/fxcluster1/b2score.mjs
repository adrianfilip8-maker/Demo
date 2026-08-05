#!/usr/bin/env node
/* b2score — B-only scoring of the b2 corrected re-run (RESULT-fxcluster §3 successor).
 *
 * Same sealed path as score-all.mjs's B section, verbatim procedure: the relocated SEALED
 * scorer `fxcluster-diag.mjs` (section B) with FXC_TRAVERSAL env-overridden per arm, plus
 * `score-aux.mjs B` for the Q-B1 hook-disc union count the sealed sections do not emit.
 * Outputs are b2-prefixed (diag-b2-traversal.<arm>.json, crops/b2-traversal.<arm>-*.png,
 * b2-scores.json) so the first letter's records are never clobbered. Thresholds are
 * transcribed from PREREG-fxcluster §1 sub-arm B — transcription, not judgement; the
 * RESULT appendix adjudicates.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const F = (arm) => path.join(DIR, `b2-traversal.${arm}.png`);
mkdirSync(path.join(DIR, 'crops'), { recursive: true });

function runDiag(env, arm) {
  const out = execFileSync('node', [path.join(DIR, 'fxcluster-diag.mjs'), 'B'], {
    env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const j = JSON.parse(readFileSync(path.join(DIR, 'fxcluster-diag-out.json'), 'utf8'));
  renameSync(path.join(DIR, 'fxcluster-diag-out.json'), path.join(DIR, `diag-b2-traversal.${arm}.json`));
  for (const f of readdirSync(DIR)) {
    if (f.startsWith('fxcluster-') && f.endsWith('-crop.png')) {
      renameSync(path.join(DIR, f), path.join(DIR, 'crops', `b2-traversal.${arm}-${f.replace('fxcluster-', '')}`));
    }
  }
  return { stdout: out, json: j.sections.B };
}

const runAux = (frame) => JSON.parse(execFileSync('node', [path.join(DIR, 'score-aux.mjs'), frame, 'B'], { encoding: 'utf8' }));

const S = { at: new Date().toISOString(), run: 'b2 corrected re-run (restore-by-restage)', arms: {}, quantities: {} };

for (const arm of ['base', 'cand', 'restore']) {
  const f = F(arm);
  if (!existsSync(f)) { console.log(`b2-traversal.${arm}: frame missing — skipped`); continue; }
  const d = runDiag({ FXC_TRAVERSAL: f }, arm).json;
  const aux = runAux(f);
  S.arms[arm] = {
    hookDiscBlue: aux.hookDiscBlueBrightPx, hookDiscUnionPx: aux.hookDiscUnionPx,
    strictBand: d.pxInBand, relaxedBlueFrame: d.blueBrightPx,
    hooksInFrame: d.hooks.filter((h) => h.status === 'in frame').map((h) => ({ i: h.i, px: h.px, maxL: h.discMaxL, maxBmR: h.discMaxBminusR })),
  };
  console.log(`b2-traversal.${arm}: hook-disc blue ${aux.hookDiscBlueBrightPx}  strict-band ${d.pxInBand}  frame relaxed ${d.blueBrightPx}`);
}

if (S.arms.base && S.arms.cand) {
  const t = (a) => S.arms[a];
  S.quantities.B = {
    'Q-B1 hook-disc bright-blue px (base)': { value: t('base').hookDiscBlue, band: 'base <= 10' },
    'Q-B1 hook-disc bright-blue px (cand)': { value: t('cand').hookDiscBlue, band: '[60, 4000]' },
    'Q-B2 strict #8fd8ff band frame-wide (cand)': { value: t('cand').strictBand, band: '[10, 3000] NON-GATING' },
    'noise |restore-base| on Q-B1': t('restore') ? { value: Math.abs(t('restore').hookDiscBlue - t('base').hookDiscBlue), band: '<= 5 px' } : null,
  };
  S.gates = {
    baseKnownBad: t('base').hookDiscBlue <= 10,
    candInBand: t('cand').hookDiscBlue >= 60 && t('cand').hookDiscBlue <= 4000,
    restoreEqBase: t('restore') ? Math.abs(t('restore').hookDiscBlue - t('base').hookDiscBlue) <= 5 : null,
  };
}

writeFileSync(path.join(DIR, 'b2-scores.json'), JSON.stringify(S, null, 1));
console.log('\nwrote b2-scores.json');
console.log(JSON.stringify(S.quantities, null, 1));
console.log('gates:', JSON.stringify(S.gates));
