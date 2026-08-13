/**
 * PREREG-torchlight2 §7 — the registered scorer. Reads progress/records/torchlight2/ and
 * prints the verdict through tools/gate.mjs (tri-state: VOID is not PASS; ship = every row
 * PASS). Forked from torchlight-score.mjs (v1); every carried band is verbatim from
 * PREREG-torchlight.md §5, every changed/new band verbatim from PREREG-torchlight2.md §5/§7.
 * A mismatch between this file and the prereg voids the scoring, not the seal.
 *
 *   node progress/records/torchlight2-score.mjs
 */
import { readPNG } from '../../tools/png.mjs';
import { shipVerdict, verdictLine } from '../../tools/gate.mjs';
import { farSurfacePoints, FAR, FAR_N, PROMOTED, DROPPED } from './torchlight2-far.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'progress/records/torchlight2');

/* Registered ROIs. POOL carried verbatim (parent §3); FAR/FAR_N from the derivation module
   (torchlight2-far.mjs), which pins FAR to the parent's rect. */
const POOL = [292, 432, 392, 490];

const NON_INTERIOR = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'night', 'traversal', 'combat', 'guard', 'sly-profile', 'sly-key',
];
const INTERIOR_ARMS = ['base', 'base2', 'cand', 'null0', 'kbover', 'restore'];

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
const nb = iBase && stats(iBase, FAR_N), nc = iCand && stats(iCand, FAR_N);

const guards = {};
const report = [];

/* BG1 — carried verbatim. */
guards.BG1 = sb && fb
  ? (sb.warm <= 12 && sb.meanL >= 40 && sb.meanL <= 100 && fb.meanL >= 35 && fb.meanL <= 95)
  : null;
if (sb) report.push(`base POOL meanL ${sb.meanL.toFixed(1)} R-B ${sb.meanRB.toFixed(1)} warm% ${sb.warm.toFixed(1)}`);
if (fb) report.push(`base FAR  meanL ${fb.meanL.toFixed(1)} R-B ${fb.meanRB.toFixed(1)} warm% ${fb.warm.toFixed(1)}`);

/* D1 — carried verbatim, plus the v2 attribution aid (guard-slot deltas + ordinals). */
const d1i = diffPx(iBase, iBase2), d1h = diffPx(hBase, hBase2);
report.push(`D1 interior base2-vs-base ${d1i} px; hero ${d1h} px`);
guards.D1 = d1i === null || d1h === null ? null : (d1i === 0 && d1h === 0);

/* P1 / P2 — carried verbatim. */
const dL = sb && sc ? sc.meanL - sb.meanL : null;
const dRB = sb && sc ? sc.meanRB - sb.meanRB : null;
if (dL !== null) report.push(`POOL dMeanL ${dL.toFixed(1)} dR-B ${dRB.toFixed(1)} cand warm% ${sc.warm.toFixed(1)}`);
guards.P1 = dL === null ? null : (dL >= 10 && dL <= 80);
guards.P2 = dL === null ? null : (dRB >= 12 && sc.warm >= 35);

/* F1 — PREREG-torchlight2 §5: [−8, +5.0] ∧ [−8, +22] over the parent FAR rect. */
const fdL = fb && fc ? fc.meanL - fb.meanL : null;
const fdRB = fb && fc ? fc.meanRB - fb.meanRB : null;
if (fdL !== null) report.push(`F1  FAR   dMeanL ${fdL.toFixed(2)} dR-B ${fdRB.toFixed(2)} (bands [-8,+5.0] / [-8,+22])`);
guards.F1 = fdL === null ? null : (fdL >= -8 && fdL <= 5.0 && fdRB >= -8 && fdRB <= 22);

/* F1b — §5: the ambient sub-rect, [−8, +1.0] ∧ [−8, +2.0]. */
const ndL = nb && nc ? nc.meanL - nb.meanL : null;
const ndRB = nb && nc ? nc.meanRB - nb.meanRB : null;
if (ndL !== null) report.push(`F1b FAR-N dMeanL ${ndL.toFixed(2)} dR-B ${ndRB.toFixed(2)} (bands [-8,+1.0] / [-8,+2.0])`);
guards.F1b = ndL === null ? null : (ndL >= -8 && ndL <= 1.0 && ndRB >= -8 && ndRB <= 2.0);

/* B1..B15 — carried verbatim (D1 must hold). */
for (const shot of NON_INTERIOR) {
  const d = diffPx(img(row(shot, 'base')), img(row(shot, 'cand')));
  report.push(`B ${shot.padEnd(12)} cand-vs-base ${d} px`);
  guards[`B_${shot}`] = guards.D1 !== true ? null : (d === null ? null : d === 0);
}

/* N1 — carried verbatim (cross-boot; D1 must hold). */
const n1 = diffPx(iNull, iBase);
report.push(`N1 interior null0-vs-base ${n1} px`);
guards.N1 = guards.D1 !== true ? null : (n1 === null ? null : n1 === 0);

/* R1 — carried verbatim (within one boot and one staging). */
const r1 = diffPx(iRest, iCand);
report.push(`R1 interior restore-vs-cand ${r1} px`);
guards.R1 = r1 === null ? null : r1 === 0;

/* KO1 — carried verbatim. */
const kL = sb && sk ? sk.meanL - sb.meanL : null;
if (kL !== null) report.push(`KO POOL dMeanL @6.0 ${kL.toFixed(1)} vs @2.5 ${dL === null ? '?' : dL.toFixed(1)}`);
guards.KO1 = kL === null || dL === null ? null : (kL >= 1.35 * dL && kL >= dL + 5);

/* V1-v2 — PREREG-torchlight2 §4: on all six interior arms, exactly 6 slots = the five
   promoted sconces (0.35 m each, L−74 absent) + one no-match guard-torch slot, underground,
   inside the tomb box. The guard slot per arm feeds F2 and the attribution report. */
const TOMB_BOX = { x: [-15, 15], y: [-12.5, -2], z: [-79, -55] };
const guardSlots = {};
{
  let ok = true, seen = 0;
  for (const a of INTERIOR_ARMS) {
    const r = row('interior', a);
    if (!r) { ok = null; break; }
    seen++;
    const slots = r.readback?.slots || [];
    if (slots.length !== 6) { ok = false; report.push(`V1: interior.${a} has ${slots.length} slots`); break; }
    const matched = new Set();
    let guardSlot = null;
    for (const s of slots) {
      const near = [...PROMOTED, DROPPED].filter(([x, y, z]) => Math.hypot(s.x - x, s.y - y, s.z - z) <= 0.35);
      if (near.length > 1) { ok = false; report.push(`V1: interior.${a} slot matches two sconces`); break; }
      if (near.length === 1) {
        const key = near[0].join(',');
        if (key === DROPPED.join(',')) { ok = false; report.push(`V1: interior.${a} carries the dropped sconce L-74 (PF8 config)`); break; }
        if (matched.has(key)) { ok = false; report.push(`V1: interior.${a} matches ${key} twice`); break; }
        matched.add(key);
      } else {
        if (guardSlot) { ok = false; report.push(`V1: interior.${a} has two no-match slots`); break; }
        guardSlot = s;
      }
    }
    if (ok !== true) break;
    if (matched.size !== 5 || !guardSlot) { ok = false; report.push(`V1: interior.${a} promoted=${matched.size}/5 guardSlot=${!!guardSlot}`); break; }
    const inBox = guardSlot.y < -0.5
      && guardSlot.x >= TOMB_BOX.x[0] && guardSlot.x <= TOMB_BOX.x[1]
      && guardSlot.y >= TOMB_BOX.y[0] && guardSlot.y <= TOMB_BOX.y[1]
      && guardSlot.z >= TOMB_BOX.z[0] && guardSlot.z <= TOMB_BOX.z[1];
    if (!inBox) { ok = false; report.push(`V1: interior.${a} guard slot (${guardSlot.x},${guardSlot.y},${guardSlot.z}) outside tomb box / above gate`); break; }
    guardSlots[a] = guardSlot;
  }
  guards.V1 = ok === null ? null : (ok && seen === INTERIOR_ARMS.length);
}
for (const a of Object.keys(guardSlots)) {
  const g = guardSlots[a];
  report.push(`(guard slot) interior.${a}  (${g.x}, ${g.y}, ${g.z}) i ${g.i}`);
}
if (guardSlots.base && guardSlots.base2) {
  const d = Math.hypot(guardSlots.base.x - guardSlots.base2.x, guardSlots.base.y - guardSlots.base2.y, guardSlots.base.z - guardSlots.base2.z);
  report.push(`(guard slot) A2-vs-A stand delta ${(d * 100).toFixed(1)} cm — D1 attribution aid`);
}

/* F2 — §5: every arm's guard slot ≥ 8.5 m from every FAR surface point, else F1/F1b VOID. */
{
  const pts = farSurfacePoints();
  let ok = guards.V1 === true ? true : null;
  if (ok) {
    for (const a of INTERIOR_ARMS) {
      const g = guardSlots[a];
      if (!g) { ok = null; break; }
      let min = 1e9;
      for (const p of pts) min = Math.min(min, Math.hypot(g.x - p[0], g.y - p[1], g.z - p[2]));
      if (a === 'cand') report.push(`F2 guard-torch min distance to FAR surface ${min.toFixed(2)} m (>= 8.5)`);
      if (min < 8.5) { ok = false; report.push(`F2: interior.${a} guard slot ${min.toFixed(2)} m from FAR surface — inside its radius`); break; }
    }
  }
  guards.F2 = ok;
  if (guards.F2 !== true) { guards.F1 = null; guards.F1b = null; }  // §7: F2 out ⇒ F-bars VOID
}

/* V2 — carried verbatim. */
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

/* V3 — carried verbatim: 18 base-side rows, uLocalToon readback null (pre-term tree). */
{
  let ok = true, n = 0;
  for (const r of manifest.rows) {
    if (r.arm !== 'base' && r.arm !== 'base2') continue;
    n++;
    if (r.readback?.uLocalToon !== null) {
      ok = false; report.push(`base-arm ${r.shot}.${r.arm} carries uLocalToon=${r.readback?.uLocalToon} — not the base tree`);
    }
  }
  guards.V3 = n === 18 ? ok : null;
}

/* V4 — one src hash per side, differing, AND matching the manifest header's expectations
   (the runner-printed hashes; PREREG-torchlight2 §3). */
{
  const hs = new Set(), hc = new Set();
  for (const r of manifest.rows) {
    (r.arm === 'base' || r.arm === 'base2' ? hs : hc).add(r.tree?.src || '?');
  }
  report.push(`trees: base {${[...hs]}} cand {${[...hc]}} expected base ${manifest.expect?.base} cand ${manifest.expect?.cand}`);
  guards.V4 = hs.size === 1 && hc.size === 1
    && [...hs][0] === manifest.expect?.base && [...hc][0] === manifest.expect?.cand
    && [...hs][0] !== [...hc][0];
}

/* Descriptive only (carried): Sly box and right pool. */
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
console.log(verdictLine(v, 'TUNE.localToon = 2.5 (torchlight2 — seven emitters, one session)'));
process.exit(v.ship ? 0 : 1);
