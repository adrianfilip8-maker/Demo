/**
 * Scores shots/bodyshift/arms.json against PREREG-bodyshift.md §4–§6. Verdict-only tool: it
 * captures nothing and may be re-run freely — every number it consumes is already frozen in
 * arms.json, and every bar it applies is frozen in the seal.
 *
 * Guard order per row: CAL-2 (swap took) → CAL-1 (coverage) → CAL-R (arm agreement).
 * Tri-state throughout: only an explicit pass scores; a null hue or missing field is VOID,
 * never a default-pass.
 */
import { readPNG } from './png.mjs';
import { readFileSync } from 'node:fs';

const ARMS = (process.env.SANDS_OUT || 'shots/bodyshift') + '/arms.json';
const rows = JSON.parse(readFileSync(ARMS, 'utf8'));

const circdiff = (a, b) => ((a - b + 540) % 360) - 180;   // signed, (-180, 180]

const circmed = (a) => {
  if (!a.length) return null;
  let sx = 0, sy = 0;
  for (const h of a) { const r = h * Math.PI / 180; sx += Math.cos(r); sy += Math.sin(r); }
  const mean = Math.atan2(sy, sx) * 180 / Math.PI;
  const shift = 180 - ((mean % 360) + 360) % 360;
  const rot = a.map((h) => (((h + shift) % 360) + 360) % 360).sort((x, y) => x - y);
  const m = rot[Math.floor(rot.length / 2)];
  return (((m - shift) % 360) + 360) % 360;
};

const hueOf = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  let h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
};

/* H_A / H_B — PREREG-bodyshift §2: recomputed circular medians over the costume texels of the
   two albedos, predicate exactly tools/slybody.mjs (hue 190-270, sat > 0.15, opaque). The
   decisions below use only differences of dS, so these constants cannot move a verdict. */
const texMedian = (path) => {
  const im = readPNG(path);
  const hs = [];
  for (let i = 0, px = im.w * im.h; i < px; i++) {
    const o = i * im.ch;
    if (im.ch === 4 && im.data[o + 3] < 128) continue;
    const r = im.data[o], g = im.data[o + 1], b = im.data[o + 2];
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
    const s = mx ? (mx - mn) / mx : 0;
    const h = hueOf(r, g, b);
    if (h == null || h < 190 || h > 270 || s <= 0.15) continue;
    hs.push(h);
  }
  return circmed(hs);
};
const H_A = texMedian('src/assets/sly-dl/sly_body.png');
const H_B = texMedian('src/assets/sly-dl/sly_body_fix.png');
console.log(`H_A ${H_A.toFixed(1)}°  H_B ${H_B.toFixed(1)}°  (prior linear medians 229.3 / 208.2)\n`);

const COV_MIN = 0.0015, CALR_MAX = 2.0, BAR = 12.0, N_MIN = 4;

const scored = [];
for (const r of rows) {
  const out = { shot: r.shot, cov: r.cov, camDist: r.camDist };
  if (!(r.modeA === 'raw' && r.modeB === 'fix' && r['A-raw'] && r['B-fix']
    && r['A-raw'].sha !== r['B-fix'].sha)) out.cls = 'VOID(CAL-2)';
  else if (!(r.cov >= COV_MIN)) out.cls = 'UNSCOREABLE';
  else if (r.hueA == null || r.hueB == null) out.cls = 'VOID(null-hue)';
  else {
    out.dSA = circdiff(r.hueA, H_A);
    out.dSB = circdiff(r.hueB, H_B);
    out.gap = Math.abs(circdiff(out.dSA, out.dSB));
    out.cls = out.gap <= CALR_MAX ? 'SCOREABLE' : 'NONLINEAR';
  }
  scored.push(out);
  console.log(`${r.shot.padEnd(11)} ${out.cls.padEnd(13)} cov ${(100 * (r.cov ?? 0)).toFixed(2).padStart(5)}%  `
    + (out.dSA != null ? `dS_A ${out.dSA.toFixed(1).padStart(6)}°  dS_B ${out.dSB.toFixed(1).padStart(6)}°  gap ${out.gap.toFixed(1)}°  ` : ''.padEnd(38))
    + `dist ${r.camDist?.toFixed(1)}m`);
}

const S = scored.filter((s) => s.cls === 'SCOREABLE');

/* P-S — stability gate. Both anchors must be SCOREABLE and inside run 4's value ± 2.0°. */
const anchor = { 'sly-closeup': -0.9, 'sly-perch': -7.9 };
let psOK = true;
for (const [shot, want] of Object.entries(anchor)) {
  const row = S.find((s) => s.shot === shot);
  const ok = row ? Math.abs(row.dSA - want) <= 2.0 : false;
  if (ok !== true) psOK = false;
  console.log(`\nP-S ${shot}: want ${want} ± 2.0, got ${row ? row.dSA.toFixed(1) : 'no scoreable row'} → ${ok === true ? 'PASS' : 'FAIL'}`);
}
if (psOK !== true) { console.log('\nP-S failed — RUN VOID for decision purposes (PREREG-bodyshift §6).'); process.exit(1); }

/* Circular range and midrange of D via the largest-gap unwrap. */
const D = S.map((s) => s.dSA);
const norm = D.map((d) => ((d % 360) + 360) % 360).sort((a, b) => a - b);
let gapAt = 0, gapMax = -1;
for (let i = 0; i < norm.length; i++) {
  const g = ((norm[(i + 1) % norm.length] - norm[i]) + 360) % 360 || (norm.length === 1 ? 360 : 0);
  if (g > gapMax) { gapMax = g; gapAt = i; }
}
const range = norm.length > 1 ? 360 - gapMax : 0;
const lo = norm[(gapAt + 1) % norm.length];
const midrange = circdiff(lo + range / 2, 0);

console.log(`\n|D| = ${D.length}   range(D) = ${range.toFixed(1)}°   midrange = ${midrange.toFixed(1)}°   bar = ${BAR}`);

let verdict;
if (D.length < N_MIN) verdict = 'UNDERPOWERED';
else if (range <= BAR) verdict = `TEXTURE-VIABLE (h* = ${(213.5 - midrange).toFixed(1)}° — needs its own seal)`;
else if (range > BAR) verdict = 'RENDER-DEFECT';
else verdict = 'VOID';
console.log(`VERDICT: ${verdict}`);

/* P-M — Spearman rho(dS_A, camDist), evaluable at |D| >= 4. */
const ranks = (a) => {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const rk = new Array(a.length);
  idx.forEach(([, i], j) => { rk[i] = j + 1; });
  return rk;
};
if (D.length >= N_MIN) {
  const ra = ranks(S.map((s) => s.dSA)), rb = ranks(S.map((s) => s.camDist));
  const n = ra.length, mr = (n + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - mr) * (rb[i] - mr); da += (ra[i] - mr) ** 2; db += (rb[i] - mr) ** 2; }
  const rho = num / Math.sqrt(da * db);
  console.log(`P-M: Spearman rho(dS_A, camDist) = ${rho.toFixed(2)} over n=${n}  → ${rho <= -0.6 ? 'HAZE-CONSISTENT' : 'HAZE REFUTED as leading account'}`);
} else console.log('P-M: MECHANISM-UNEVALUATED (|D| < 4)');

/* P-O — the §231 outliers. */
for (const shot of ['temple', 'combat']) {
  const row = scored.find((s) => s.shot === shot);
  const cls = row ? row.cls : 'NOT CAPTURED';
  const asPredicted = cls === 'UNSCOREABLE' || cls === 'NONLINEAR';
  console.log(`P-O ${shot}: ${cls} → ${asPredicted ? 'as predicted' : cls === 'NOT CAPTURED' ? 'unevaluated' : 'PREDICTION REFUTED — weakens §231'}`);
}
