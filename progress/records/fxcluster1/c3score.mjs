#!/usr/bin/env node
/* c3score — scoring for PREREG-fxcluster-c3 (committed WITH the seal, before the capture).
 *
 * Q-C1/Q-C2 come from the sealed relocated fxcluster-diag.mjs §C (masks unchanged);
 * Q-C3′/Q-C4′ are the re-anchored instrument, implemented here restating seal §0's masks
 * verbatim: largest L≥200 4-neighbour component in (300,300,760,600); medSat of L≥180 px
 * inside the r=70 disc at the impact projection (452,433), denominator floor n ≥ 2000.
 * Outputs c3-prefixed. Thresholds transcribed from PREREG-fxcluster-c3 §2 — transcription,
 * not judgement; the RESULT appendix adjudicates.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const F = (arm) => path.join(DIR, `c3-combat.${arm}.png`);
mkdirSync(path.join(DIR, 'crops'), { recursive: true });

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const satOf = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const median = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

/* Q-C3': largest L>=200 4-neighbour component in (300,300,760,600) */
function blobL200(im) {
  const x0 = 300, y0 = 300, x1 = 760, y1 = 600, W = x1 - x0, H = y1 - y0;
  const m = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * im.ch;
    if (lum(im.data[i], im.data[i + 1], im.data[i + 2]) >= 200) m[(y - y0) * W + (x - x0)] = 1;
  }
  const seen = new Uint8Array(W * H); let best = null;
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || seen[s]) continue;
    const st = [s]; seen[s] = 1;
    let minX = W, maxX = 0, minY = H, maxY = 0, cnt = 0;
    while (st.length) {
      const q = st.pop(); cnt++;
      const qx = q % W, qy = (q / W) | 0;
      if (qx < minX) minX = qx; if (qx > maxX) maxX = qx;
      if (qy < minY) minY = qy; if (qy > maxY) maxY = qy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (m[ni] && !seen[ni]) { seen[ni] = 1; st.push(ni); }
      }
    }
    if (!best || cnt > best.px) best = { px: cnt, bbox: [minX + x0, minY + y0, maxX + x0, maxY + y0] };
  }
  return best ?? { px: 0, bbox: null };
}

/* Q-C4': medSat of L>=180 px inside disc r=70 at (452,433) */
function discSat(im, cx = 452, cy = 433, R = 70) {
  const sats = []; let tot = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > R * R) continue;
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= im.w || y >= im.h) continue;
    tot++;
    const i = (y * im.w + x) * im.ch;
    const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    if (lum(r, g, b) >= 180) sats.push(satOf(r, g, b));
  }
  return { n: sats.length, tot, medSat: +median(sats).toFixed(3) };
}

function runDiag(env, arm) {
  execFileSync('node', [path.join(DIR, 'fxcluster-diag.mjs'), 'C'], {
    env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const j = JSON.parse(readFileSync(path.join(DIR, 'fxcluster-diag-out.json'), 'utf8'));
  renameSync(path.join(DIR, 'fxcluster-diag-out.json'), path.join(DIR, `diag-c3-combat.${arm}.json`));
  for (const f of readdirSync(DIR)) {
    if (f.startsWith('fxcluster-') && f.endsWith('-crop.png')) {
      renameSync(path.join(DIR, f), path.join(DIR, 'crops', `c3-combat.${arm}-${f.replace('fxcluster-', '')}`));
    }
  }
  return j.sections.C;
}

const S = { at: new Date().toISOString(), run: 'c3 (same block, re-anchored instrument per PREREG-fxcluster-c3)', arms: {}, quantities: {} };

for (const arm of ['base', 'cand', 'restore']) {
  const f = F(arm);
  if (!existsSync(f)) { console.log(`c3-combat.${arm}: frame missing — skipped`); continue; }
  const d = runDiag({ FXC_COMBAT: f, FXC_COMBAT_B: f }, arm);
  const im = readPNG(f);
  const blob = blobL200(im);
  const disc = discSat(im);
  S.arms[arm] = {
    figMedSat: d.gold1.figure.medSat, figMedL: d.gold1.figure.medL, chalkShare: d.gold1.chalkShare,
    blobL200px: blob.px, blobL200bbox: blob.bbox,
    discN: disc.n, discTot: disc.tot, discMedSat: disc.medSat,
  };
  console.log(`c3-combat.${arm}: medSat ${d.gold1.figure.medSat}  chalk ${d.gold1.chalkShare}  blobL200 ${blob.px} px  discSat ${disc.medSat} (n=${disc.n})`);
}

if (S.arms.base && S.arms.cand) {
  const c = (a) => S.arms[a];
  const r = S.arms.restore;
  S.quantities.C3 = {
    'Q-C1 figure medSat (base)': { value: c('base').figMedSat, band: '0.370±0.02' },
    'Q-C1 figure medSat (cand)': { value: c('cand').figMedSat, band: '[0.40, 0.62]' },
    'Q-C2 chalk share (base)': { value: c('base').chalkShare, band: '0.137±0.010' },
    'Q-C2 chalk share (cand)': { value: c('cand').chalkShare, band: '[0.015, 0.095]' },
    "Q-C3' blob L>=200 px (base)": { value: c('base').blobL200px, band: '16048±15%' },
    "Q-C3' blob L>=200 px (cand)": { value: c('cand').blobL200px, band: '[800, 12000]' },
    "Q-C4' disc medSat@L>=180 (base)": { value: c('base').discMedSat, band: '0.153±0.03', n: c('base').discN },
    "Q-C4' disc medSat@L>=180 (cand)": { value: c('cand').discMedSat, band: '[0.30, 0.55]', n: c('cand').discN },
    "Q-C4' denominator floor": { base: c('base').discN, cand: c('cand').discN, band: 'n >= 2000 both, else UNSCOREABLE' },
    'restore gates': r ? {
      medSat: { value: r.figMedSat, band: 'base±0.02' },
      chalk: { value: r.chalkShare, band: 'base±0.010' },
      blobL200: { value: r.blobL200px, band: 'base±15%' },
      discSat: { value: r.discMedSat, band: 'base±0.02' },
    } : null,
    'separation (Q-C4\' gap vs 2x noise)': r ? {
      treatmentGap: +(c('cand').discMedSat - c('base').discMedSat).toFixed(3),
      noise2x: +(2 * Math.abs(r.discMedSat - c('base').discMedSat)).toFixed(3),
      band: 'gap > 2x noise, else UNSCOREABLE',
    } : null,
  };
  const inB = (v, lo, hi) => v >= lo && v <= hi;
  S.gates = {
    baseAnchors: inB(c('base').figMedSat, 0.35, 0.39) && inB(c('base').chalkShare, 0.127, 0.147)
      && inB(c('base').blobL200px, 16048 * 0.85, 16048 * 1.15) && inB(c('base').discMedSat, 0.123, 0.183),
    denomFloor: c('base').discN >= 2000 && c('cand').discN >= 2000,
    candC1: inB(c('cand').figMedSat, 0.40, 0.62),
    candC2: inB(c('cand').chalkShare, 0.015, 0.095),
    candC3p: inB(c('cand').blobL200px, 800, 12000),
    candC4p: inB(c('cand').discMedSat, 0.30, 0.55),
    restore: r ? (Math.abs(r.figMedSat - c('base').figMedSat) <= 0.02 && Math.abs(r.chalkShare - c('base').chalkShare) <= 0.010
      && Math.abs(r.blobL200px - c('base').blobL200px) <= 0.15 * c('base').blobL200px
      && Math.abs(r.discMedSat - c('base').discMedSat) <= 0.02) : null,
    separation: r ? ((c('cand').discMedSat - c('base').discMedSat) > 2 * Math.abs(r.discMedSat - c('base').discMedSat)) : null,
  };
}

writeFileSync(path.join(DIR, 'c3-scores.json'), JSON.stringify(S, null, 1));
console.log('\nwrote c3-scores.json');
console.log(JSON.stringify(S.quantities, null, 1));
console.log('gates:', JSON.stringify(S.gates));
