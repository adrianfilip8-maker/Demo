/**
 * PREREG-torchlight §5 — the registered scorer. Reads progress/records/torchlight1/ and prints
 * the verdict through tools/gate.mjs (tri-state: VOID is not PASS; ship = every row PASS).
 *
 *   node progress/records/torchlight-score.mjs
 *
 * Every band below is duplicated VERBATIM from PREREG-torchlight.md §5, committed before any
 * frame existed. A mismatch between this file and the prereg voids the scoring, not the seal.
 */
import { readPNG } from '../../tools/png.mjs';
import { shipVerdict, verdictLine } from '../../tools/gate.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'progress/records/torchlight1');

/* Registered ROIs (PREREG §3), [x0, y0, x1, y1) on 1280x720. */
const POOL = [292, 432, 392, 490];
const FAR = [380, 30, 560, 120];

/* Registered sconce light positions (PREREG §1/§4 V1); slot must be within 0.35 m of one. */
const SCONCES = [];
for (const sx of [-1, 1]) for (const pz of [-62, -68, -74]) SCONCES.push([sx * 4.35, -9.05, pz]);

const NON_INTERIOR = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'night', 'traversal', 'combat', 'guard', 'sly-profile', 'sly-key',
];

const manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const row = (shot, arm) => manifest.rows.find((r) => r.shot === shot && r.arm === arm) || null;
const img = (r) => {
  if (!r) return null;
  const f = path.join(DIR, r.file);
  return existsSync(f) ? readPNG(f) : null;
};

function stats(im, [x0, y0, x1, y1]) {
  let n = 0, sl = 0, srb = 0, warm = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * im.w + x) * im.ch;
    const R = im.data[o], G = im.data[o + 1], B = im.data[o + 2];
    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    n++; sl += L; srb += R - B;
    if (R > B + 10 && L > 40) warm++;
  }
  return { meanL: sl / n, meanRB: srb / n, warm: (100 * warm) / n, n };
}

/** Decoded differing pixels: any |d| >= 1 on R, G or B. Null when either frame is missing. */
function diffPx(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  let d = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1]
      || a.data[oa + 2] !== b.data[ob + 2]) d++;
  }
  return d;
}

const bool = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : !!v);

/* ---- gather ----------------------------------------------------------------------------- */

const iBase = img(row('interior', 'base'));
const iCand = img(row('interior', 'cand'));
const iNull = img(row('interior', 'null0'));
const iKb = img(row('interior', 'kbover'));
const iRest = img(row('interior', 'restore'));
const iBase2 = img(row('interior', 'base2'));
const hBase = img(row('hero', 'base'));
const hBase2 = img(row('hero', 'base2'));

const sb = iBase && stats(iBase, POOL), sc = iCand && stats(iCand, POOL), sk = iKb && stats(iKb, POOL);
const fb = iBase && stats(iBase, FAR), fc = iCand && stats(iCand, FAR);

const guards = {};
const report = [];

/* BG1 — base gates (VOID when out: the tree/staging is not the diagnosed one). */
guards.BG1 = sb && fb
  ? (sb.warm <= 12 && sb.meanL >= 40 && sb.meanL <= 100 && fb.meanL >= 35 && fb.meanL <= 95)
  : null;
if (sb) report.push(`base POOL meanL ${sb.meanL.toFixed(1)} R-B ${sb.meanRB.toFixed(1)} warm% ${sb.warm.toFixed(1)}`);
if (fb) report.push(`base FAR  meanL ${fb.meanL.toFixed(1)} R-B ${fb.meanRB.toFixed(1)} warm% ${fb.warm.toFixed(1)}`);

/* D1 — cross-boot determinism control. */
const d1i = diffPx(iBase, iBase2), d1h = diffPx(hBase, hBase2);
report.push(`D1 interior base2-vs-base ${d1i} px; hero ${d1h} px`);
guards.D1 = d1i === null || d1h === null ? null : (d1i === 0 && d1h === 0);

/* P1 / P2 — the pool. */
const dL = sb && sc ? sc.meanL - sb.meanL : null;
const dRB = sb && sc ? sc.meanRB - sb.meanRB : null;
if (dL !== null) report.push(`POOL dMeanL ${dL.toFixed(1)} dR-B ${dRB.toFixed(1)} cand warm% ${sc.warm.toFixed(1)}`);
guards.P1 = dL === null ? null : (dL >= 10 && dL <= 80);
guards.P2 = dL === null ? null : (dRB >= 12 && sc.warm >= 35);

/* F1 — far ambient holds (or drops). */
const fdL = fb && fc ? fc.meanL - fb.meanL : null;
const fdRB = fb && fc ? fc.meanRB - fb.meanRB : null;
if (fdL !== null) report.push(`FAR  dMeanL ${fdL.toFixed(2)} dR-B ${fdRB.toFixed(2)}`);
guards.F1 = fdL === null ? null : (fdL >= -8 && fdL <= 2.5 && fdRB >= -8 && fdRB <= 2.5);

/* B1..B15 — bit-identity of every non-interior canonical, cand vs base (D1 must hold). */
for (const shot of NON_INTERIOR) {
  const d = diffPx(img(row(shot, 'base')), img(row(shot, 'cand')));
  report.push(`B ${shot.padEnd(12)} cand-vs-base ${d} px`);
  guards[`B_${shot}`] = guards.D1 !== true ? null : (d === null ? null : d === 0);
}

/* N1 — recompile-with-branch-untaken exactness (cross-boot; D1 must hold). */
const n1 = diffPx(iNull, iBase);
report.push(`N1 interior null0-vs-base ${n1} px`);
guards.N1 = guards.D1 !== true ? null : (n1 === null ? null : n1 === 0);

/* R1 — poke-path exactness, within one boot and one staging. */
const r1 = diffPx(iRest, iCand);
report.push(`R1 interior restore-vs-cand ${r1} px`);
guards.R1 = r1 === null ? null : r1 === 0;

/* KO1 — dose monotonicity: gain 6 must move the pool at least 1.35x gain 2.5, and +5 L more. */
const kL = sb && sk ? sk.meanL - sb.meanL : null;
if (kL !== null) report.push(`KO POOL dMeanL @6.0 ${kL.toFixed(1)} vs @2.5 ${dL === null ? '?' : dL.toFixed(1)}`);
guards.KO1 = kL === null || dL === null ? null : (kL >= 1.35 * dL && kL >= dL + 5);

/* V1 — interior arms: exactly 6 slots, all underground, each within 0.35 m of a sconce. */
{
  const arms = ['base', 'cand', 'null0', 'kbover', 'restore'];
  let ok = true, seen = 0;
  for (const a of arms) {
    const r = row('interior', a);
    if (!r) { ok = null; break; }
    seen++;
    const slots = r.readback?.slots || [];
    if (slots.length !== 6) { ok = false; report.push(`V1: interior.${a} has ${slots.length} slots`); break; }
    for (const s of slots) {
      if (!(s.y < -0.5)) { ok = false; report.push(`V1: interior.${a} slot above ground y=${s.y}`); break; }
      const near = SCONCES.some(([x, y, z]) =>
        Math.hypot(s.x - x, s.y - y, s.z - z) <= 0.35);
      if (!near) { ok = false; report.push(`V1: interior.${a} slot (${s.x},${s.y},${s.z}) matches no sconce`); break; }
    }
    if (ok === false) break;
  }
  guards.V1 = ok === null ? null : (ok && seen === arms.length);
}

/* V2 — daylight cand arms ran the SHIPPED gain (2.5), so B-bars tested the real config. */
{
  let ok = true, n = 0;
  for (const shot of NON_INTERIOR) {
    const r = row(shot, 'cand');
    if (!r) { ok = null; break; }
    n++;
    if (r.readback?.uLocalToon !== 2.5) { ok = false; report.push(`V2: ${shot}.cand uLocalToon=${r.readback?.uLocalToon}`); break; }
  }
  guards.V2 = ok === null ? null : (ok && n === NON_INTERIOR.length);
}

/* Base arms must predate the term: uLocalToon readback null (the uniform did not exist). */
{
  let ok = true, n = 0;
  for (const r of manifest.rows) {
    if (r.arm !== 'base' && r.arm !== 'base2') continue;
    n++;
    if (r.readback?.uLocalToon !== null) {
      ok = false; report.push(`base-arm ${r.shot}.${r.arm} carries uLocalToon=${r.readback?.uLocalToon} — not the base tree`);
    }
  }
  guards.V3 = n === 18 ? ok : null;   // 16 base + 2 base2; fewer = arms missing, VOID not PASS
}

/* Tree identity: all base/base2 rows share one src hash; all cand-boot rows share another. */
{
  const hs = new Set(), hc = new Set();
  for (const r of manifest.rows) {
    (r.arm === 'base' || r.arm === 'base2' ? hs : hc).add(r.tree?.src || '?');
  }
  report.push(`trees: base {${[...hs]}} cand {${[...hc]}}`);
  guards.V4 = hs.size === 1 && hc.size === 1 && !hs.has('?') && !hc.has('?') && [...hs][0] !== [...hc][0];
}

/* Descriptive only (not gated): Sly box and right pool. */
if (iBase && iCand) {
  const SLYBOX = [600, 380, 740, 570];
  const s0 = stats(iBase, SLYBOX), s1 = stats(iCand, SLYBOX);
  report.push(`(desc) SLY box dMeanL ${(s1.meanL - s0.meanL).toFixed(1)} dR-B ${(s1.meanRB - s0.meanRB).toFixed(1)}`);
  const RPOOL = [880, 470, 1000, 530];
  const r0 = stats(iBase, RPOOL), r1s = stats(iCand, RPOOL);
  report.push(`(desc) R-pool dMeanL ${(r1s.meanL - r0.meanL).toFixed(1)} dR-B ${(r1s.meanRB - r0.meanRB).toFixed(1)}`);
}

/* ---- verdict ---------------------------------------------------------------------------- */

for (const k of Object.keys(guards)) guards[k] = bool(guards[k]);
console.log(report.join('\n'));
console.log('');
const v = shipVerdict(guards);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(14)} ${s}`);
console.log('');
console.log(verdictLine(v, 'TUNE.localToon = 2.5 (torchlight — tomb sconces light the toon set)'));
process.exit(v.ship ? 0 : 1);
