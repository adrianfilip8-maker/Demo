/**
 * goldspecdiff — score PREREG-goldspec. Per-material pixel diff between two capture arms,
 * inside `matmask.mjs` masks, with the gilded mask split into a gild half and a limestone half.
 *
 * SCOPE — the transforms between this and the question, i.e. what it does NOT do (§11):
 *   - The masks are ARCHITECTURE-only (matmask's own caveat): a pixel covered in the real frame
 *     by the character, FX, terrain or vegetation is still attributed here to the masonry behind
 *     it. That inflates every count, equally in every arm, and it is why the untouched materials
 *     are scored alongside as the run's own floor rather than assumed to be zero.
 *   - No geometry, no lighting, no attribution of a changed pixel to a cause. It answers "how
 *     many pixels moved, by how much, inside which mask", and nothing else.
 *   - The gild/limestone split is a CHROMA rank taken from the CONTROL arm only and applied
 *     unchanged to every arm, so the treatment cannot move the classification. It is a proxy for
 *     the metal mask, not the metal mask: the split point is the gild class's own texel share in
 *     the built texture (17.78 %), so the two halves have the right sizes but not necessarily the
 *     right members.
 *
 *   node goldspecdiff.mjs <controlDir> <armDir> <shot> <maskdir> [--json out.json]
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const [ctlDir, armDir, shot, maskDir] = process.argv.slice(2);
const jf = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
const GILD_SHARE = 0.1778;          // the gild class's texel share of the built tile
const LIME_SHARE = 0.7612;

const a = readPNG(`${ctlDir}/${shot}.png`);
const b = readPNG(`${armDir}/${shot}.png`);
if (a.w !== b.w || a.h !== b.h) { console.error('size mismatch'); process.exit(1); }
const m = new Uint8Array(readFileSync(`${maskDir}/${shot}-mask.bin`));
const meta = JSON.parse(readFileSync(`${maskDir}/${shot}-mask.bin.json`, 'utf8'));
const ch = a.data.length / (a.w * a.h);
const N = a.w * a.h;

const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
const chroma = (d, i) => { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); return mx > 0 ? (mx - mn) / mx : 0; };

function stats(px) {
  let diff = 0, sum = 0, maxd = 0, signed = 0;
  let ge2 = 0, ge4 = 0, ge6 = 0, ge8 = 0, ge16 = 0;
  for (const p of px) {
    const i = p * ch;
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    signed += lum(b.data, i) - lum(a.data, i);
    if (d > 0) {
      diff++; sum += d; if (d > maxd) maxd = d;
      if (d >= 2) ge2++; if (d >= 4) ge4++; if (d >= 6) ge6++; if (d >= 8) ge8++; if (d >= 16) ge16++;
    }
  }
  return {
    px: px.length, diff, pctOfMask: px.length ? +(100 * diff / px.length).toFixed(4) : 0,
    meanD: diff ? +(sum / diff).toFixed(2) : 0, maxD: maxd,
    ge2, ge4, ge6, ge8, ge16,
    meanSignedLuma: px.length ? +(signed / px.length).toFixed(4) : 0,
  };
}

const out = { shot, control: ctlDir, arm: armDir, materials: {} };
for (let mi = 0; mi < meta.mats.length; mi++) {
  const px = [];
  for (let p = 0; p < N; p++) if (m[p] === mi) px.push(p);
  if (px.length < 2000) continue;
  out.materials[meta.mats[mi]] = stats(px);
}

/* Gild / limestone split inside the gilded mask, ranked on the CONTROL arm's chroma. */
const gi = meta.mats.indexOf('arch:hieroglyph_gilded');
if (gi >= 0) {
  const px = [];
  for (let p = 0; p < N; p++) if (m[p] === gi) px.push(p);
  const ranked = px.slice().sort((p, q) => chroma(a.data, q * ch) - chroma(a.data, p * ch));
  const nG = Math.round(ranked.length * GILD_SHARE), nL = Math.round(ranked.length * LIME_SHARE);
  const gild = ranked.slice(0, nG);
  const lime = ranked.slice(ranked.length - nL);
  out.split = {
    gildCandidate: stats(gild), limeCandidate: stats(lime),
    gildChromaCut: +chroma(a.data, ranked[nG - 1] * ch).toFixed(4),
  };
  /* Bright subset — a specular pixel is a bright pixel, and it is where the prediction lives. */
  const bright = px.filter((p) => lum(a.data, p * ch) >= 170);
  out.brightGilded = stats(bright);
}

if (jf) writeFileSync(jf, JSON.stringify(out, null, 1));
console.log(`## ${shot}   ${ctlDir.split('/').pop()} -> ${armDir.split('/').pop()}`);
console.log(`material                     mask px   differ   %mask  meanD  maxD  >=2  >=4  >=6  >=8  >=16   meanSignedLuma`);
const rows = Object.entries(out.materials).sort((x, y) => y[1].px - x[1].px);
for (const [k, s] of rows) {
  console.log(`${k.padEnd(26)} ${String(s.px).padStart(8)} ${String(s.diff).padStart(8)} ${String(s.pctOfMask).padStart(7)} ${String(s.meanD).padStart(6)} ${String(s.maxD).padStart(5)} ${String(s.ge2).padStart(4)} ${String(s.ge4).padStart(4)} ${String(s.ge6).padStart(4)} ${String(s.ge8).padStart(4)} ${String(s.ge16).padStart(5)}   ${String(s.meanSignedLuma).padStart(8)}`);
}
if (out.split) {
  for (const [k, s] of [['gild-candidate (top 17.8% chroma)', out.split.gildCandidate], ['lime-candidate (bottom 76.1%)', out.split.limeCandidate], ['gilded mask, L>=170', out.brightGilded]]) {
    console.log(`${k.padEnd(26)} ${String(s.px).padStart(8)} ${String(s.diff).padStart(8)} ${String(s.pctOfMask).padStart(7)} ${String(s.meanD).padStart(6)} ${String(s.maxD).padStart(5)} ${String(s.ge2).padStart(4)} ${String(s.ge4).padStart(4)} ${String(s.ge6).padStart(4)} ${String(s.ge8).padStart(4)} ${String(s.ge16).padStart(5)}   ${String(s.meanSignedLuma).padStart(8)}`);
  }
  console.log(`(chroma cut at ${out.split.gildChromaCut})`);
}
