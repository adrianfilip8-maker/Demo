#!/usr/bin/env node
/**
 * fxshapean — score `progress/records/fxshape.mjs`'s arms.
 *
 * For each suppression arm, the pixels it REMOVED relative to `base`: that set is, by
 * construction, the pixels the suppressed emitter was drawing. Reports the footprint, the mean
 * and peak luminance it was adding, and — the part D12 is actually about — the chroma and the
 * edge hardness of what it drew.
 *
 * Thresholds are stated with every number, because this repo has been bitten by comparing
 * counts taken at different ones (§122):
 *   · a pixel COUNTS AS CHANGED at `|dR| + |dG| + |dB| >= 4`, which is `fx5an`'s threshold and
 *     therefore cross-referable to the fx5/fx8/fx9 pins.
 *   · luminance is Rec.709 on the sRGB bytes, 0..1. Saturation is HSV S = (max-min)/max.
 *
 * VALIDITY, evaluated before anything else and fail-closed: `base` vs `base2` must be under
 * 200 changed px. Every arm is captured at dt 0 inside one boot, so a larger duplicate delta
 * means the world clock moved and every attribution below is animation phase (§28).
 *
 *   node progress/records/fxshapean.mjs
 */
import { readPNG } from '../../tools/png.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, '../../shots/fxshape');
const DTHR = 4;

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const sat = (r, g, b) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };

function load(n) {
  const f = path.join(DIR, `${n}.png`);
  if (!existsSync(f)) return null;
  return readPNG(f);
}

/* ---- provenance, fail-closed -------------------------------------------------------------
   Four agents commit to this branch continuously and every arm waits on a FIFO, so arms
   captured in separate invocations are arms captured against DIFFERENT TREES — the materials
   lane VOIDed a run today over exactly that, across a `src/core/Shots.js` re-framing. This
   refuses to issue a ship verdict when it cannot establish the tree, rather than printing a
   number: anything that is not provably same-tree is VOID, never PASS (§263.1's shape). The
   attribution table still prints, because all of fxshape's arms share ONE boot and vite is
   frozen for its duration (SANDS_NO_HMR + a single page.goto), so they are same-tree by
   construction whatever the manifest says — but that argument covers attribution only. */
const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return null; } };
let PROV = null;
try { PROV = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).provenance ?? null; } catch { PROV = null; }
const headNow = git('rev-parse', 'HEAD');
const dirtyNow = git('status', '--porcelain', 'src/') || '';
const provState = !PROV ? 'VOID: manifest carries no provenance'
  : PROV.srcDirty ? `VOID: src/ was dirty at capture (${PROV.srcDirty.split('\n').length} file(s))`
  : PROV.sha !== headNow ? `VOID: captured at ${PROV.sha?.slice(0, 8)}, scored against ${headNow?.slice(0, 8)}`
  : dirtyNow ? 'VOID: src/ is dirty now'
  : `OK ${PROV.sha.slice(0, 8)}`;
console.log(`PROVENANCE ${provState}`);
if (!provState.startsWith('OK')) {
  console.log('  -> no SHIP verdict may be issued from this run. The attribution below is still');
  console.log('     readable because every arm shares one boot and one frozen tree by construction.');
}

const base = load('base');
if (!base) { console.error(`no base frame in ${DIR}`); process.exit(1); }
const { w, h, ch } = base;
const at = (im, i) => [im.data[i * ch], im.data[i * ch + 1], im.data[i * ch + 2]];

/* ---- validity ------------------------------------------------------------------------- */
const base2 = load('base2');
let dup = 0;
if (base2) {
  for (let i = 0; i < w * h; i++) {
    const a = at(base, i), b = at(base2, i);
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) >= DTHR) dup++;
  }
}
const VALID = base2 ? dup < 200 : false;
console.log(`\nVALIDITY  base vs base2: ${base2 ? `${dup} changed px (>=${DTHR})` : 'base2 MISSING'} ` +
  `— ${VALID ? 'OK' : 'VOID: the attributions below are not attributable'}`);

/* ---- per-arm attribution ---------------------------------------------------------------- */
console.log(`\n${'arm'.padEnd(9)} ${'footprint'.padStart(9)} ${'%frame'.padStart(7)} ${'meanLift'.padStart(9)} ${'peak'.padStart(6)} ` +
  `${'meanSat'.padStart(8)} ${'satAtL>.7'.padStart(10)}  bbox`);
const results = {};
for (const arm of ['noring', 'noflash', 'nospark', 'notrail', 'nocane']) {
  const im = load(arm);
  if (!im) { console.log(`${arm.padEnd(9)} MISSING`); continue; }
  let n = 0, sumL = 0, peak = 0, sumS = 0, nBright = 0, sumSB = 0;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = at(base, i), b = at(im, i);
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < DTHR) continue;
    const dl = lum(...a) - lum(...b);
    n++; sumL += dl; if (dl > peak) peak = dl;
    sumS += sat(...a);
    if (lum(...a) >= 0.70) { nBright++; sumSB += sat(...a); }
    mask[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  results[arm] = { n, meanLift: n ? sumL / n : 0, peak, meanSat: n ? sumS / n : 0, nBright, satBright: nBright ? sumSB / nBright : 0, x0, x1, y0, y1, mask };
  console.log(`${arm.padEnd(9)} ${String(n).padStart(9)} ${(100 * n / (w * h)).toFixed(2).padStart(7)} ` +
    `${(n ? sumL / n : 0).toFixed(4).padStart(9)} ${peak.toFixed(3).padStart(6)} ` +
    `${(n ? sumS / n : 0).toFixed(3).padStart(8)} ${(nBright ? sumSB / nBright : 0).toFixed(3).padStart(10)}  ` +
    (n ? `(${x0},${y0})-(${x1},${y1})` : '-'));
}

/* ---- edge hardness of the dominant contributor -------------------------------------------- */
/* A "drawn" effect has a boundary; a smear has a shoulder. Measured as the 10-90 rise of the
   effect's own contribution (base minus arm) across its mask boundary, sampled on horizontal
   scanlines through the mask's centroid band, and reported in pixels. */
function edgeRise(arm) {
  const r = results[arm]; if (!r || !r.n) return null;
  const im = load(arm); const rises = [];
  const yMid = ((r.y0 + r.y1) / 2) | 0;
  for (let y = Math.max(0, yMid - 40); y <= Math.min(h - 1, yMid + 40); y += 4) {
    const prof = [];
    for (let x = 0; x < w; x++) { const i = y * w + x; prof.push(lum(...at(base, i)) - lum(...at(im, i))); }
    const pk = Math.max(...prof); if (pk < 0.02) continue;
    const iPk = prof.indexOf(pk);
    const t10 = pk * 0.10, t90 = pk * 0.90;
    let a = iPk; while (a > 0 && prof[a] > t90) a--;
    let b = a; while (b > 0 && prof[b] > t10) b--;
    if (a > b) rises.push(a - b);
  }
  rises.sort((p, q) => p - q);
  return rises.length ? { median: rises[rises.length >> 1], n: rises.length } : null;
}

console.log('');
for (const arm of ['noring', 'noflash', 'nospark', 'notrail']) {
  const e = edgeRise(arm);
  if (e) console.log(`edge  ${arm.padEnd(9)} median 10-90 rise of its own contribution: ${e.median} px (${e.n} scanlines)`);
}

/* ---- reference band ------------------------------------------------------------------------ */
console.log(`\nREFERENCE (sly3-venice, scratchpad, never committed): brightest L>=0.70 component is
  179 px = 0.02% of frame at sat 0.185; the two identifiable VFX in it — the lamp flames at
  (243,244) and (392,242) — are 116 and 108 px at sat 0.740 and 0.736.
  Stated as the gap rather than the measurement: that frame contains NO combat impact, so it is
  evidence for how this IP draws a bright effect (compact, saturated), not for how it draws a
  slash. Nothing here compares our slash to their slash, because we do not have theirs.`);
