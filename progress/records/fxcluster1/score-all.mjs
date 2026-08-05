#!/usr/bin/env node
/* score-all — orchestrates the SEALED scorer over the fxcluster1 arms.
 *
 * For every captured frame it runs the relocated sealed scorer (`fxcluster-diag.mjs`, this
 * directory — one changed import line, sections verbatim) with env-overridden frame paths,
 * renames the per-run out-JSON to diag-<shot>.<arm>.json (and the evidence crops to
 * crops/<shot>.<arm>-*.png) so runs never clobber each other, runs score-aux.mjs for the
 * few registered quantities the sealed sections do not emit, and folds everything into
 * fxcluster1-scores.json: every registered quantity beside its sealed band, gates
 * evaluated, per-arm verdict inputs. Thresholds are transcribed from PREREG-fxcluster §1
 * — transcription, not judgement; the RESULT adjudicates.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const F = (shot, arm) => path.join(DIR, `${shot}.${arm}.png`);
mkdirSync(path.join(DIR, 'crops'), { recursive: true });

function runDiag(section, env, shot, arm) {
  const out = execFileSync('node', [path.join(DIR, 'fxcluster-diag.mjs'), section], {
    env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const j = JSON.parse(readFileSync(path.join(DIR, 'fxcluster-diag-out.json'), 'utf8'));
  renameSync(path.join(DIR, 'fxcluster-diag-out.json'), path.join(DIR, `diag-${shot}.${arm}.json`));
  for (const f of readdirSync(DIR)) {
    if (f.startsWith('fxcluster-') && f.endsWith('-crop.png')) {
      renameSync(path.join(DIR, f), path.join(DIR, 'crops', `${shot}.${arm}-${f.replace('fxcluster-', '')}`));
    }
  }
  return { stdout: out, json: j.sections[section] };
}

function runAux(frame, sections) {
  return JSON.parse(execFileSync('node', [path.join(DIR, 'score-aux.mjs'), frame, ...sections], { encoding: 'utf8' }));
}

const S = { at: new Date().toISOString(), arms: {}, quantities: {} };
const put = (shot, arm, data) => { S.arms[`${shot}.${arm}`] = Object.assign(S.arms[`${shot}.${arm}`] || {}, data); };

/* ---------------- A: guard ---------------- */
for (const arm of ['base', 'base2', 'cand', 'restore']) {
  const f = F('guard', arm);
  if (!existsSync(f)) { console.log(`guard.${arm}: frame missing — skipped`); continue; }
  const d = runDiag('A', { FXC_GUARD: f, FXC_GUARD_B: f }, 'guard', arm).json;
  const aux = runAux(f, ['A']);
  put('guard', arm, {
    roiMedL: +d.candPathROI.medL.toFixed(2), roiMeanRmB: +d.candPathROI.meanRmB.toFixed(2),
    roiWarmPx: d.candPathROI.warmPx,
    airColMedL: +d.airColumn.medL.toFixed(2),
    figureMedL: aux.figureRectMedL,
  });
  console.log(`guard.${arm}: ROI medL ${S.arms[`guard.${arm}`].roiMedL}  figure medL ${aux.figureRectMedL}  aircol medL ${S.arms[`guard.${arm}`].airColMedL}`);
}
if (S.arms['guard.base'] && S.arms['guard.cand']) {
  const g = (a) => S.arms[`guard.${a}`];
  S.quantities.A = {
    'Q-A1 ΔmedL cand-base, ROI(340,280,700,350)': { value: +(g('cand').roiMedL - g('base').roiMedL).toFixed(2), band: '[+3.0, +45.0]' },
    'noise |base2-base| ROI': g('base2') ? { value: +Math.abs(g('base2').roiMedL - g('base').roiMedL).toFixed(2), band: '<= 1.0' } : null,
    'noise |restore-base| ROI': g('restore') ? { value: +Math.abs(g('restore').roiMedL - g('base').roiMedL).toFixed(2), band: '<= 1.0' } : null,
    'Q-A2 figure(852,220,990,700) medL cand-base': { value: +(g('cand').figureMedL - g('base').figureMedL).toFixed(2), band: '>= -3.0' },
    'Q-A3 air column |Δ| (context, not a gate)': { value: +Math.abs(g('cand').airColMedL - g('base').airColMedL).toFixed(2), band: 'expected <= 8, report' },
  };
}

/* ---------------- B: traversal ---------------- */
for (const arm of ['base', 'cand', 'restore']) {
  const f = F('traversal', arm);
  if (!existsSync(f)) { console.log(`traversal.${arm}: frame missing — skipped`); continue; }
  const d = runDiag('B', { FXC_TRAVERSAL: f }, 'traversal', arm).json;
  const aux = runAux(f, ['B']);
  put('traversal', arm, {
    hookDiscBlue: aux.hookDiscBlueBrightPx, hookDiscUnionPx: aux.hookDiscUnionPx,
    strictBand: d.pxInBand, relaxedBlueFrame: d.blueBrightPx,
    hooksInFrame: d.hooks.filter((h) => h.status === 'in frame').map((h) => ({ i: h.i, px: h.px, maxL: h.discMaxL, maxBmR: h.discMaxBminusR })),
  });
  console.log(`traversal.${arm}: hook-disc blue ${aux.hookDiscBlueBrightPx}  strict-band ${d.pxInBand}  frame relaxed ${d.blueBrightPx}`);
}
if (S.arms['traversal.base'] && S.arms['traversal.cand']) {
  const t = (a) => S.arms[`traversal.${a}`];
  S.quantities.B = {
    'Q-B1 hook-disc bright-blue px (base)': { value: t('base').hookDiscBlue, band: 'base <= 10' },
    'Q-B1 hook-disc bright-blue px (cand)': { value: t('cand').hookDiscBlue, band: '[60, 4000]' },
    'Q-B2 strict #8fd8ff band frame-wide (cand)': { value: t('cand').strictBand, band: '[10, 3000] NON-GATING' },
    'noise |restore-base| on Q-B1': t('restore') ? { value: Math.abs(t('restore').hookDiscBlue - t('base').hookDiscBlue), band: '<= 5 px' } : null,
  };
}

/* ---------------- C: combat ---------------- */
for (const arm of ['base', 'cand', 'restore']) {
  const f = F('combat', arm);
  if (!existsSync(f)) { console.log(`combat.${arm}: frame missing — skipped`); continue; }
  const d = runDiag('C', { FXC_COMBAT: f, FXC_COMBAT_B: f }, 'combat', arm).json;
  const aux = runAux(f, ['C']);
  put('combat', arm, {
    figMedSat: d.gold1.figure.medSat, figMedL: d.gold1.figure.medL,
    chalkShare: d.gold1.chalkShare, goldPx: d.gold1.goldPx, bluePx: d.gold1.bluePx,
    blobPx: aux.flashBlob?.px ?? 0, blobBbox: aux.flashBlob?.bbox ?? null,
    blobMedSatL200: aux.blobBboxMedSatAtL200 ?? null, blobL200n: aux.blobBboxL200n ?? 0,
    brightBand: d.gold1.brightBand,
  });
  console.log(`combat.${arm}: medSat ${d.gold1.figure.medSat}  chalk ${d.gold1.chalkShare}  blob ${aux.flashBlob?.px} px  blobSat@L200 ${aux.blobBboxMedSatAtL200}`);
}
if (S.arms['combat.base'] && S.arms['combat.cand']) {
  const c = (a) => S.arms[`combat.${a}`];
  S.quantities.C = {
    'Q-C1 figure medSat (base)': { value: c('base').figMedSat, band: '0.370±0.02 (frame-anchored)' },
    'Q-C1 figure medSat (cand)': { value: c('cand').figMedSat, band: '[0.40, 0.62]' },
    'Q-C2 chalk share (base)': { value: c('base').chalkShare, band: '0.137±0.010' },
    'Q-C2 chalk share (cand)': { value: c('cand').chalkShare, band: '[0.015, 0.095]' },
    'Q-C3 flash blob px (base)': { value: c('base').blobPx, band: '7304±15% (frame-anchored)' },
    'Q-C3 flash blob px (cand)': { value: c('cand').blobPx, band: '[400, 4800]' },
    'Q-C4 blob-bbox medSat at L>=200 (cand)': { value: c('cand').blobMedSatL200, band: '>= 0.20' },
    'restore gates (vs base tolerances)': c('restore') ? {
      medSat: { value: c('restore').figMedSat, band: 'base±0.02' },
      chalk: { value: c('restore').chalkShare, band: 'base±0.010' },
      blob: { value: c('restore').blobPx, band: 'base±15%' },
    } : null,
  };
}

/* ---------------- D: interior ---------------- */
if (existsSync(F('interior', 'ship'))) {
  const f = F('interior', 'ship');
  const d = runDiag('D', { FXC_INTERIOR: f, FXC_INTERIOR_B: f }, 'interior', 'ship').json;
  const m = d.hullkerb.masks.L120;
  put('interior', 'ship', { coverageL120: m.coverage, nComps: m.nComps, widest: m.top[0]?.w ?? 0, top: m.top.slice(0, 3) });
  S.quantities.D = {
    'rail: ceiling warm-bright coverage (R-B>=10 & L>=120)': { value: +(m.coverage * 100).toFixed(2) + '%', band: '<= 2.5%' },
    'rail: widest warm-bright component (>=20px comps)': { value: (m.top[0]?.w ?? 0) + ' px', band: '<= 60 px' },
  };
  console.log(`interior.ship: coverage ${(m.coverage * 100).toFixed(2)}%  widest ${m.top[0]?.w ?? 0} px`);
}

/* ---------------- E: dunes ---------------- */
for (const arm of ['base', 'cand', 'restore']) {
  const f = F('dunes', arm);
  if (!existsSync(f)) { console.log(`dunes.${arm}: frame missing — skipped`); continue; }
  const d = runDiag('E', { FXC_DUNES: f }, 'dunes', arm).json;
  const aux = runAux(f, ['E']);
  put('dunes', arm, {
    deltaMedL: d.deltaMedL, pyramidMedL: d.pyramidMedL, skyMedL: d.skyMedL,
    leftEdge: d.leftEdge, templeMedL: aux.templeRectMedL, groundMedL: aux.groundBandMedL,
  });
  console.log(`dunes.${arm}: Δ(sky-pyr) ${d.deltaMedL}  temple ${aux.templeRectMedL}  ground ${aux.groundBandMedL}  edge ${d.leftEdge?.meanEdgeStep}`);
}
if (S.arms['dunes.base'] && S.arms['dunes.cand']) {
  const e = (a) => S.arms[`dunes.${a}`];
  S.quantities.E = {
    'Q-E1 sky-pyramid ΔmedL (base)': { value: e('base').deltaMedL, band: '1.7±1.5 (known-bad)' },
    'Q-E1 sky-pyramid ΔmedL (cand)': { value: e('cand').deltaMedL, band: '[+8, +22]' },
    'Q-E2 temple rect |ΔmedL| cand-base': { value: +Math.abs(e('cand').templeMedL - e('base').templeMedL).toFixed(2), band: '<= 6.0' },
    'Q-E3 ground band |ΔmedL| cand-base': { value: +Math.abs(e('cand').groundMedL - e('base').groundMedL).toFixed(2), band: '<= 4.0' },
    'noise |restore-base| on Q-E1': e('restore') ? { value: +Math.abs(e('restore').deltaMedL - e('base').deltaMedL).toFixed(2), band: '<= 1.0' } : null,
  };
}

writeFileSync(path.join(DIR, 'fxcluster1-scores.json'), JSON.stringify(S, null, 1));
console.log('\nwrote fxcluster1-scores.json');
console.log(JSON.stringify(S.quantities, null, 1));
