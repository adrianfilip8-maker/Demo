/**
 * §270 / PREREG-inkfar.md — scorer for D10a. Thresholds are the pre-registration's.
 *
 *   CAL-F1  pyrMask covers 0.5%..40% of the frame
 *   CAL-F2  each lever moves some pixel SOMEWHERE in the frame: |A-F| > 0 and |A-H| > 0
 *   CAL-F3  every pyramid carries a shell in the hulled arms, and the count is non-zero
 *   PF1     every pyramid's nearest vertex is beyond edgeFadeEnd
 *   PF2     inside pyrMask, F-nofade changes >= 2% of pixels AND mean luma drops
 *   PF3     inside pyrMask, H-hull   changes >= 2% of pixels AND mean luma drops
 *
 * CAL-F2 is scored frame-wide on purpose. A lever that moves pixels only outside the pyramid band
 * is still a live lever, and folding "the lever works" into "the lever works there" is how a dead
 * lever gets written up as a mechanism.
 */
import { readPNG } from './png.mjs';
import { readFileSync } from 'node:fs';
import { shipVerdict, verdictLine, guardState, PASS } from './gate.mjs';

const DIR = process.env.SANDS_OUT || 'shots/inkfar';
const arms = JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8'));

const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const DILATE = 4;          // px, registered: include the silhouette's outer side

function differs(a, b, i) {
  const p = i * a.ch, q = i * b.ch;
  return a.data[p] !== b.data[q] || a.data[p + 1] !== b.data[q + 1] || a.data[p + 2] !== b.data[q + 2];
}

/** Boolean mask of pixels where the two images differ, dilated by `r` with a square kernel. */
function maskDilated(a, b, r) {
  const { w, h } = a;
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (differs(a, b, i)) raw[i] = 1;
  if (r <= 0) return raw;
  // separable max-filter: rows then columns
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w) v = raw[y * w + xx]; }
      tmp[y * w + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h) v = tmp[yy * w + x]; }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Within `mask`, how many pixels differ between a and b, and how the mean luma moves. */
function inMask(a, b, mask) {
  let n = 0, changed = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    n++;
    const p = i * a.ch, q = i * b.ch;
    sumA += luma(a.data[p], a.data[p + 1], a.data[p + 2]);
    sumB += luma(b.data[q], b.data[q + 1], b.data[q + 2]);
    if (differs(a, b, i)) changed++;
  }
  return { n, changed, frac: n ? changed / n : 0, dMean: n ? (sumB - sumA) / n : 0 };
}

function anyDiff(a, b) {
  for (let i = 0, n = a.w * a.h; i < n; i++) if (differs(a, b, i)) return true;
  return false;
}

const byShot = new Map();
for (const r of arms) {
  if (!byShot.has(r.shot)) byShot.set(r.shot, { arms: {}, geom: r.geom });
  byShot.get(r.shot).arms[r.arm] = r;
}

const rows = [];
const c1 = [], c2 = [], c3 = [], pf1 = [], pf2 = [], pf3 = [];

for (const [shot, rec] of byShot) {
  const a = rec.arms;
  const A = a['A-ship'], P = a['P-nopyr'], F = a['F-nofade'], H = a['H-hull'], FH = a['FH-both'];
  if (!A || !P || !F || !H || !FH) {
    rows.push({ shot, note: 'missing arm' });
    c1.push(false); c2.push(false); c3.push(false); pf1.push(false); pf2.push(false); pf3.push(false);
    continue;
  }

  const fadeEnd = rec.geom?.edgeFadeEnd ?? Infinity;
  const pyrs = rec.geom?.pyramids ?? [];
  pf1.push(pyrs.length > 0 && pyrs.every((p) => p.near > fadeEnd));

  const nPyr = H.applied?.pyramids ?? 0;
  c3.push(nPyr > 0 && H.applied?.shellsTotal === nPyr && FH.applied?.shellsTotal === nPyr);

  const imA = readPNG(A.file), imP = readPNG(P.file), imF = readPNG(F.file),
    imH = readPNG(H.file), imFH = readPNG(FH.file);

  const mask = maskDilated(imA, imP, DILATE);
  let nMask = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) nMask++;
  const cov = nMask / (imA.w * imA.h);
  c1.push(cov >= 0.005 && cov <= 0.40);
  c2.push(anyDiff(imA, imF) && anyDiff(imA, imH));

  const rF = inMask(imA, imF, mask), rH = inMask(imA, imH, mask), rFH = inMask(imA, imFH, mask);
  pf2.push(rF.frac >= 0.02 && rF.dMean < 0);
  pf3.push(rH.frac >= 0.02 && rH.dMean < 0);

  rows.push({
    shot, cov, nMask, fadeEnd, pyrs,
    nearest: pyrs.length ? Math.min(...pyrs.map((p) => p.near)) : null,
    rF, rH, rFH, nPyr, shells: H.applied?.shellsTotal ?? 0,
    frameF: anyDiff(imA, imF), frameH: anyDiff(imA, imH),
  });
}

for (const r of rows) {
  if (r.note) { console.log(`${r.shot}: ${r.note}`); continue; }
  console.log(`\n${r.shot}   pyrMask ${r.nMask} px (${(100 * r.cov).toFixed(2)}% of frame)`
    + `   pyramids ${r.nPyr}, shells ${r.shells}   edgeFadeEnd ${r.fadeEnd} m`);
  for (const p of r.pyrs) {
    console.log(`  ${p.name.padEnd(14)} near ${p.near.toFixed(1)} m  far ${p.far.toFixed(1)} m`
      + `  ${p.near > r.fadeEnd ? 'beyond fade' : 'INSIDE FADE'}`);
  }
  const line = (name, x) => console.log(`  ${name.padEnd(20)} changed ${(100 * x.frac).toFixed(2).padStart(6)}% of mask`
    + `   mean luma ${x.dMean >= 0 ? '+' : ''}${x.dMean.toFixed(5)}`);
  line('F-nofade (M1)', r.rF);
  line('H-hull (M2)', r.rH);
  line('FH-both', r.rFH);
  console.log(`  frame-wide: F moves the frame ${r.frameF ? 'yes' : 'NO'}, H moves the frame ${r.frameH ? 'yes' : 'NO'}`);
}

const all = (xs) => (xs.length ? xs.every(Boolean) : null);
const guards = {
  'CAL-F1 mask is the pyramids': all(c1),
  'CAL-F2 both levers live':     all(c2),
  'CAL-F3 shells built':         all(c3),
  'PF1 pyramids beyond fade':    all(pf1),
  'PF2 M1 crease fade':          all(pf2),
  'PF3 M2 absent hull':          all(pf3),
};
console.log('');
for (const [k, v] of Object.entries(guards)) console.log(`  ${guardState(v).padEnd(4)}  ${k}`);

console.log('\n' + verdictLine(shipVerdict(guards)));

const cal = ['CAL-F1 mask is the pyramids', 'CAL-F2 both levers live', 'CAL-F3 shells built']
  .map((k) => guardState(guards[k]));
let outcome;
if (cal.some((s) => s !== PASS)) outcome = 'VOID — a calibration arm did not fire';
else {
  const m1 = guardState(guards['PF2 M1 crease fade']) === PASS;
  const m2 = guardState(guards['PF3 M2 absent hull']) === PASS;
  outcome = m1 && m2 ? 'BOTH — the crease fade AND the absent hull each independently deny the pyramids ink'
    : m1 ? 'M1 ONLY — the crease distance fade is why; a hull on the pyramids does not produce a line'
    : m2 ? 'M2 ONLY — the absent hull is why; removing the crease fade does not ink them'
    : 'NEITHER — both registered mechanisms refuted; uFalloff is already excluded, so the next '
      + 'suspect is the hull\'s aerial-perspective term (toon.glsl.js:1412-1417)';
}
console.log(`OUTCOME: ${outcome}`);
console.log('PF1 (are they even beyond the fade) is reported above and gates nothing on its own — '
  + 'it is the premise M1 needs, and FF1 fires if any pyramid is inside edgeFadeEnd.');
