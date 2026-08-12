#!/usr/bin/env node
/**
 * fxshape2an — score `progress/records/fxshape2.mjs`'s arms against PREREG-fxshape2.
 *
 * For each registered ROI, the pixels each suppression arm REMOVED relative to `base` are, by
 * construction, the pixels that arm's object family was drawing there. Guards are read in
 * RESULT-fxshape §5.1's order — SUBJECT PRESENT, VALIDITY, PROVENANCE — and every one of them
 * refuses rather than reports (§263.1's shape: anything not provably true is VOID, never PASS).
 *
 * Thresholds are PREREG-fxshape2 §4/§5's, restated with every number:
 *   · changed pixel: |dR|+|dG|+|dB| >= 4 (fx5an's threshold, §122)
 *   · darkness predicate: ROI core mean L >= 0.03 below its annulus (box grown 2.2x) mean L
 *   · validity: base vs base2 < 200 changed px per shot; registered per-ROI DEGRADED fallback
 *     at max(8 px, 12% of ROI area)
 *   · attribution: owner = argmax arm, needs >= 30 px AND >= 60% of the largest count
 *
 *   node progress/records/fxshape2an.mjs
 */
import { readPNG } from '../../tools/png.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROIS, SHOTS_UNDER_TEST } from './fxshape2rois.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, '../../shots/fxshape2');
const DTHR = 4;
const SUPPRESS_ARMS = ['nocoins', 'notreasure', 'noringfx'];
const UNION_ARM = 'nopickups';

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function load(arm, shot) {
  const f = path.join(DIR, `${arm}.${shot}.png`);
  return existsSync(f) ? readPNG(f) : null;
}
const at = (im, x, y) => {
  const i = (y * im.w + x) * im.ch;
  return [im.data[i], im.data[i + 1], im.data[i + 2]];
};
const changed = (a, b, x, y) => {
  const p = at(a, x, y), q = at(b, x, y);
  return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) >= DTHR;
};
function roiBounds(roi, im) {
  const x0 = Math.max(0, roi.x - roi.h), x1 = Math.min(im.w - 1, roi.x + roi.h);
  const y0 = Math.max(0, roi.y - roi.h), y1 = Math.min(im.h - 1, roi.y + roi.h);
  return { x0, x1, y0, y1, area: (x1 - x0 + 1) * (y1 - y0 + 1) };
}
function countChanged(a, b, roi) {
  const { x0, x1, y0, y1 } = roiBounds(roi, a);
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (changed(a, b, x, y)) n++;
  return n;
}
function meanL(im, x0, x1, y0, y1, skip = null) {
  let s = 0, n = 0;
  for (let y = Math.max(0, y0); y <= Math.min(im.h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(im.w - 1, x1); x++) {
      if (skip && x >= skip.x0 && x <= skip.x1 && y >= skip.y0 && y <= skip.y1) continue;
      s += lum(...at(im, x, y)); n++;
    }
  }
  return n ? s / n : 0;
}

/* ── load everything up front ────────────────────────────────────────────────────────────── */
const frames = {};
let missing = 0;
for (const shot of SHOTS_UNDER_TEST) {
  frames[shot] = {};
  for (const arm of ['base', ...SUPPRESS_ARMS, UNION_ARM, 'base2']) {
    frames[shot][arm] = load(arm, shot);
    if (!frames[shot][arm]) { console.log(`MISSING ${arm}.${shot}.png`); missing++; }
  }
}
if (missing) { console.error(`\n${missing} frame(s) missing from ${DIR} — nothing scoreable.`); process.exit(1); }

let manifest = null;
try { manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8')); } catch { manifest = null; }

/* ── GUARD 1: SUBJECT PRESENT (run-level, then per-ROI darkness) ─────────────────────────── */
console.log('── GUARD 1 · SUBJECT PRESENT ──────────────────────────────────────────────');
let unionTotal = 0;
const roiState = new Map();   // id -> { present, degraded, void: reason|null }
for (const roi of ROIS) {
  unionTotal += countChanged(frames[roi.shot].base, frames[roi.shot][UNION_ARM], roi);
}
if (unionTotal === 0) {
  console.log(`VOID: '${UNION_ARM}' changed 0 px inside the union of all ROIs — nothing under`);
  console.log('      test was drawn, so no attribution below is readable (§275.1 rule 3).');
} else {
  console.log(`run-level OK — '${UNION_ARM}' removes ${unionTotal} px across the registered ROIs`);
}
for (const roi of ROIS) {
  const im = frames[roi.shot].base;
  const b = roiBounds(roi, im);
  const g = Math.round(roi.h * 2.2);
  const core = meanL(im, b.x0, b.x1, b.y0, b.y1);
  const ann = meanL(im, roi.x - g, roi.x + g, roi.y - g, roi.y + g, b);
  const present = core <= ann - 0.03;
  roiState.set(roi.id, { present, degraded: false, void: present ? null : 'subject-absent' });
  console.log(`  ${roi.id} ${roi.shot.padEnd(10)} coreL ${core.toFixed(3)} vs annulus ${ann.toFixed(3)} ` +
    `-> ${present ? 'dark blob present' : 'VOID: not darker than surround (collected/occluded/moved this tree?)'}`);
}
if (unionTotal === 0) for (const s of roiState.values()) s.void = s.void ?? 'union-zero';

/* ── GUARD 2: VALIDITY (base vs base2, per shot; registered per-ROI fallback) ───────────── */
console.log('\n── GUARD 2 · VALIDITY (base vs base2) ─────────────────────────────────────');
for (const shot of SHOTS_UNDER_TEST) {
  const a = frames[shot].base, b = frames[shot].base2;
  let dup = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (changed(a, b, x, y)) dup++;
  const ok = dup < 200;
  console.log(`  ${shot.padEnd(10)} ${String(dup).padStart(7)} changed px — ${ok ? 'OK' : 'FRAME VOID (falling back per-ROI, PREREG §4.2)'}`);
  for (const roi of ROIS.filter((r) => r.shot === shot)) {
    const st = roiState.get(roi.id);
    if (st.void) continue;
    if (!ok) {
      const dRoi = countChanged(a, b, roi);
      const bar = Math.max(8, Math.round(0.12 * roiBounds(roi, a).area));
      if (dRoi < bar) { st.degraded = true; console.log(`    ${roi.id}: base2 delta ${dRoi} < ${bar} -> DEGRADED but admissible`); }
      else { st.void = `validity (${dRoi} >= ${bar})`; console.log(`    ${roi.id}: base2 delta ${dRoi} >= ${bar} -> VOID`); }
    }
  }
}

/* ── GUARD 3: PROVENANCE (fail-closed for anything ship-shaped) ──────────────────────────── */
console.log('\n── GUARD 3 · PROVENANCE ───────────────────────────────────────────────────');
const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return null; } };
const PROV = manifest?.provenance ?? null;
const headNow = git('rev-parse', 'HEAD');
const dirtyNow = git('status', '--porcelain', 'src/') || '';
const provState = !PROV?.sha ? 'VOID: manifest carries no provenance'
  : PROV.srcDirty ? `VOID: src/ was dirty at capture (${PROV.srcDirty.split('\n').length} file(s))`
  : PROV.sha !== headNow ? `VOID: captured at ${PROV.sha.slice(0, 8)}, scored against ${headNow?.slice(0, 8)}`
  : dirtyNow ? 'VOID: src/ is dirty now'
  : `OK ${PROV.sha.slice(0, 8)} (sampled inside onLocked)`;
console.log(`  ${provState}`);
if (!provState.startsWith('OK')) {
  console.log('  -> nothing ship-shaped may be concluded from this run. The attribution below');
  console.log('     is still readable: every arm shares one boot and one frozen tree (SANDS_NO_HMR).');
}

/* ── attribution table ───────────────────────────────────────────────────────────────────── */
console.log('\n── ATTRIBUTION (owner needs >= 30 px AND >= 60% of the largest count) ─────');
console.log(`${'roi'.padEnd(4)} ${'shot'.padEnd(10)} ${SUPPRESS_ARMS.map((a) => a.padStart(11)).join('')} ${UNION_ARM.padStart(11)}   verdict`);
const verdicts = {};
for (const roi of ROIS) {
  const st = roiState.get(roi.id);
  const counts = {};
  for (const arm of [...SUPPRESS_ARMS, UNION_ARM]) {
    counts[arm] = countChanged(frames[roi.shot].base, frames[roi.shot][arm], roi);
  }
  let verdict;
  if (st.void) {
    verdict = `VOID (${st.void})`;
  } else {
    const best = SUPPRESS_ARMS.reduce((p, a) => (counts[a] > counts[p] ? a : p), SUPPRESS_ARMS[0]);
    const maxAll = Math.max(...Object.values(counts));
    if (counts[best] >= 30 && counts[best] >= 0.6 * maxAll) {
      verdict = `${best}${st.degraded ? ' (DEGRADED)' : ''}`;
    } else if (counts[UNION_ARM] >= 30) {
      verdict = 'UNATTRIBUTED-WITH-UNION (parts under 60% of the union — see PREREG §7)';
    } else {
      verdict = 'UNATTRIBUTED (nothing suppressible drew this)';
    }
  }
  verdicts[roi.id] = verdict;
  console.log(`${roi.id.padEnd(4)} ${roi.shot.padEnd(10)} ${[...SUPPRESS_ARMS, UNION_ARM].map((a) => String(counts[a]).padStart(11)).join('')}   ${verdict}`);
}

/* ── what the prior predicted, so the falsification is explicit ──────────────────────────── */
console.log('\n── THE §5.1 PRIOR ──────────────────────────────────────────────────────────');
const ringOwned = Object.entries(verdicts).filter(([, v]) => v.startsWith('noringfx')).map(([k]) => k);
const pickOwned = Object.entries(verdicts).filter(([, v]) => v.startsWith('nocoins') || v.startsWith('notreasure')).map(([k]) => k);
console.log(`  cane_ring family (ring batch) owns: ${ringOwned.length ? ringOwned.join(', ') : 'NO ROI'}`);
console.log(`  pickups (coins/treasures) own:      ${pickOwned.length ? pickOwned.join(', ') : 'NO ROI'}`);
console.log(ringOwned.length
  ? '  -> the registered cane_ring prior SURVIVES on the ROIs above.'
  : '  -> the registered cane_ring prior is FALSIFIED for the floaters (it may still own the combat donut — separate run).');

if (manifest?.raycast) {
  console.log('\n── RIDE-ALONG RAYCAST (live scene, base arm — evidence, not a gate) ────────');
  for (const [shot, rays] of Object.entries(manifest.raycast)) {
    for (const [id, hits] of Object.entries(rays)) {
      console.log(`  ${id} ${shot.padEnd(10)} ${hits.length ? hits.join(' | ') : '(no hit)'}`);
    }
  }
}
