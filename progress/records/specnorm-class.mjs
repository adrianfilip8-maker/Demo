/**
 * specnorm-class.mjs — the per-material-class table, with the keying CORRECTED.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS: PREREG-specnorm's I5 IS MIS-SPECIFIED AND FAILS AS WRITTEN.
 *
 * I5 registered: ">= 6 distinct (uSpec, metal) buckets ... and EVERY bucket's uSpec must match
 * a row of the live census to within 1/255". Two errors in that sentence, both mine, both found
 * before any per-class number was quoted:
 *
 *   1. **`metal` is not a class key.** debugTerm(7)'s B channel is `slyMetal`, which the shader
 *      defines as `uMetal * texture2D( metalnessMap, ... ).b` — the MASKED value. It is a
 *      per-pixel texture read, not a per-material uniform. Keying on it shatters one material
 *      into a bucket per mask level: `hieroglyph_gilded` alone produces B = 217, 216, 215, 214,
 *      213, 212, 211, 210, ..., 32, 0. `hero` has **1 580** (uSpec, metal) buckets, not ~20.
 *   2. **"every bucket" cannot be met by any real frame.** ~1 % of the toon population is
 *      anti-aliased edge, where two materials' uSpec blend to a value that is no material's
 *      (bytes 21, 22, 23, 24, 31, 33 sit between `sandstone_worn` 20 and `paving` 25). A share
 *      bar was the right shape; an every-pixel bar was not.
 *
 * By §141.1 a mis-derived threshold is VOID, stated, and NOT re-derived. **I5 is therefore
 * reported FAILED, and every per-class number produced by this file is POST-HOC and carries no
 * registered force.** It is reported anyway because the channel itself is demonstrably sound —
 * see the calibration block the script prints, which is evidence, not a substituted threshold.
 *
 * What that evidence is: the R channel arrives as `round( uSpec * 255 )` EXACTLY on every
 * material that owns more than 1 500 px of `hero`, and the G channel's `glossP` reproduces
 * `normmodel.mjs` — written and committed BEFORE this capture existed — to within 1-3 on all
 * twelve. That is a stronger statement about the channel than I5 asked for; it is just not the
 * statement I registered.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Keying used here instead: the R byte alone, matched to `round( census.uSpec * 255 )`. Those
 * bytes are 10, 13, 15, 20, 25, 36, 38, 41, 51, 64, 82, 107, 140, 153, 158, 230, 242 — every
 * gap >= 2. Pixels whose R matches no census byte are counted as UNRESOLVED and reported as a
 * share rather than dropped silently.
 *
 * Two collisions survive and are named rather than hidden: uSpec 0.20 is `ceiling_stars`
 * (metal 0.85), `props_stone` and `props_dark`; uSpec 0.25 is BOTH `slydlrig:mesh` and
 * `kaykit:props`. The mean metal mask and the glossP range are printed so a collision is
 * visible in the row. **G4 is scored on the 0.25 bucket and therefore includes any kaykit prop
 * in frame** — nothing in this capture separates a SkinnedMesh from a static prop.
 *
 *   node progress/records/specnorm-class.mjs [dir]
 */
import { readPNG } from '../../tools/png.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || path.join(import.meta.dirname, '../../shots/specnorm'));
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ORDER = ['hero', 'temple', 'courtyard', 'sly-closeup', 'interior'];
const CAND = ['n035', 'n050', 'n100', 'n050k'];
const SHOTS = readdirSync(DIR).filter((f) => f.endsWith('.dbg7.png')).map((f) => f.slice(0, -'.dbg7.png'.length))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));

/* the live census, from the run's own arms.json — never a hard-coded table */
const armsFiles = readdirSync(DIR).filter((f) => f.startsWith('arms') && f.endsWith('.json'));
const census = new Map();
for (const af of armsFiles) {
  for (const row of JSON.parse(readFileSync(path.join(DIR, af), 'utf8'))) {
    for (const c of row.census.classes) {
      const b = Math.round(c.spec * 255);
      const e = census.get(b) || { byte: b, spec: c.spec, gloss: new Set(), metal: new Set(), names: new Set(), meshes: 0 };
      e.gloss.add(c.gloss); e.metal.add(c.metal);
      /* max, NOT +=. The census is re-read per shot and is identical in all five (§262), so
         accumulating multiplied every mesh count by the number of shots — `paving` printed 85
         for 17 meshes. Caught by disbelief at a 5x round number, same as the paving byte. */
      e.meshes = Math.max(e.meshes, c.count);
      for (const nm of c.names) e.names.add(nm);
      census.set(b, e);
    }
  }
}
/* R -> census byte, with +/-1 tolerance and NO silent tie-breaking.
 *
 * The tolerance is not cosmetic: `paving`'s uSpec 0.10 is `Math.round( 0.10 * 255 ) = 26` in JS
 * (half rounds up) but arrives as **25** from the GPU, and an exact-match table therefore threw
 * `hero`'s 69 695 paving pixels — the single largest material in the frame — into UNRESOLVED
 * and reported 11.28 % unresolved instead of 1.3 %. Found by noticing that `paving:court`, 17
 * meshes, claimed 347 px on a shot that is mostly pavement.
 *
 * Bytes within 1 of TWO census values (14 between 0.05 and 0.06; 37 between 0.14 and 0.15) are
 * left AMBIGUOUS and counted as unresolved rather than assigned to the nearer one. */
const LUT = new Int16Array(256).fill(-1);
for (let b = 0; b < 256; b++) {
  const near = [...census.keys()].filter((c) => Math.abs(c - b) <= 1);
  if (near.length === 1) LUT[b] = near[0];
  else if (near.length > 1) LUT[b] = near.includes(b) ? b : -2; // exact wins; otherwise ambiguous
}
console.log(`census bytes present: ${[...census.keys()].sort((a, b) => a - b).join(', ')}`);
console.log(`ambiguous bytes (within 1 of two census values, counted UNRESOLVED): ${[...LUT.keys()].filter((b) => LUT[b] === -2).join(', ') || 'none'}\n`);

const pctl = (v, q) => (v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : NaN);

for (const shot of SHOTS) {
  const fc = path.join(DIR, `${shot}.dbg4.png`), f7 = path.join(DIR, `${shot}.dbg7.png`), f6 = path.join(DIR, `${shot}.dbg6.png`);
  const fb = path.join(DIR, `${shot}.base.png`);
  if (![fc, f7, f6, fb].every(existsSync)) continue;
  const ca = readPNG(fc), cl = readPNG(f7), gi = readPNG(f6), ba = readPNG(fb);
  const im = {}; for (const a of CAND) { const f = path.join(DIR, `${shot}.${a}.png`); if (existsSync(f)) im[a] = readPNG(f); }
  const n = cl.w * cl.h;

  const rows = new Map(); let toon = 0, unres = 0;
  for (let i = 0; i < n; i++) {
    const c = i * ca.ch;
    if (!(ca.data[c] === 64 && ca.data[c + 1] === 128 && ca.data[c + 2] === 191)) continue;
    toon++;
    const p = i * cl.ch, b = LUT[cl.data[p]];
    if (b < 0) { unres++; continue; }
    let r = rows.get(b);
    if (!r) { r = { byte: b, px: 0, gsum: 0, gmin: 255, gmax: 0, msum: 0, gatesFull: 0, sat: 0, rise: {}, riseG: {} }; rows.set(b, r); }
    r.px++; r.gsum += cl.data[p + 1]; r.msum += cl.data[p + 2];
    if (cl.data[p + 1] < r.gmin) r.gmin = cl.data[p + 1];
    if (cl.data[p + 1] > r.gmax) r.gmax = cl.data[p + 1];
    const q = i * gi.ch;
    if (gi.data[q + 2] < 250) continue;
    r.gatesFull++;
    const isSat = gi.data[q] >= 252;
    if (isSat) r.sat++;
    const bp = i * ba.ch, bL = lum(ba.data[bp], ba.data[bp + 1], ba.data[bp + 2]);
    for (const a of CAND) {
      if (!im[a]) continue;
      const ap = i * im[a].ch;
      const d = lum(im[a].data[ap], im[a].data[ap + 1], im[a].data[ap + 2]) - bL;
      (r.riseG[a] ||= []).push(d);
      if (isSat) (r.rise[a] ||= []).push(d);
    }
  }

  console.log(`\n================ ${shot} ================`);
  console.log(`toon population ${toon} px; UNRESOLVED (R matches no census byte — AA edges) ${unres} px = ${(100 * unres / Math.max(1, toon)).toFixed(2)}%`);
  console.log('                                                          median rise, LOBE-SATURATED px | median rise, ALL sunlit px');
  console.log('uSpec meshes  glossP mean  mask      px  gatesFULL satPx |  n035   n050   n100  n050k |  n035   n050   n100  n050k  material');
  for (const r of [...rows.values()].sort((a, b) => b.byte - a.byte)) {
    const e = census.get(r.byte);
    const nm = [...e.names][0] || '?';
    const f = (src, a) => { const v = (src[a] || []).slice().sort((x, y) => x - y);
      return v.length ? ((pctl(v, 0.5) >= 0 ? '+' : '') + pctl(v, 0.5).toFixed(1)) : '-'; };
    const cols = (src) => ['n035', 'n050', 'n100', 'n050k'].map((a) => f(src, a).padStart(6)).join(' ');
    console.log(`${e.spec.toFixed(3)} ${String(e.meshes).padStart(4)} ${((r.gsum / r.px / 255) * 128).toFixed(1).padStart(9)}`
      + ` ${(r.msum / r.px / 255).toFixed(2).padStart(5)} ${String(r.px).padStart(8)} ${String(r.gatesFull).padStart(8)} ${String(r.sat).padStart(6)}`
      + ` | ${cols(r.rise)} | ${cols(r.riseG)}  ${nm}`);
  }

  /* G4: the character bucket, uSpec 0.25. Reported with its p50/p90/max and its ambiguity. */
  const sly = rows.get(64);
  if (sly) {
    const e = census.get(64);
    console.log(`\n  G4 population — uSpec 0.25 bucket (${[...e.names].join(', ')}); ${sly.sat} lobe-saturated px`);
    console.log('  arm     p50     p90     max   |  same on ALL gates-full px (p50/p90)');
    for (const a of CAND) {
      const v = (sly.rise[a] || []).slice().sort((x, y) => x - y);
      const w = (sly.riseG[a] || []).slice().sort((x, y) => x - y);
      if (!v.length) continue;
      console.log(`  ${a.padEnd(6)} ${pctl(v, 0.5).toFixed(1).padStart(6)} ${pctl(v, 0.9).toFixed(1).padStart(7)} ${v[v.length - 1].toFixed(1).padStart(7)}   |  ${pctl(w, 0.5).toFixed(1).padStart(6)} ${pctl(w, 0.9).toFixed(1).padStart(7)}`);
    }
    console.log('  bar: median <= 20 L. NOTE the bucket is Sly + any kaykit prop in frame — nothing here separates them.');
  }
}
