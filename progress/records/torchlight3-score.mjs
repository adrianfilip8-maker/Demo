/**
 * PREREG-torchlight3 §7 — the registered scorer. Reads progress/records/torchlight3/ and
 * prints the verdict through tools/gate.mjs (tri-state: VOID is not PASS; ship = every row
 * PASS). Forked from torchlight2-score.mjs; every carried band is verbatim from the parent
 * seals BY CITATION (PREREG-torchlight §5 via PREREG-torchlight2 §5/§7), computed off-vs-on
 * within ONE boot. D1 and N1 do not exist here (PREREG-torchlight3 §4: the cross-tree
 * identity is a recorded analytic premise, not a pixel bar). Fail-closed gating per §7:
 * B_<shot> needs R_<shot> PASS; P1/P2/F1/F1b/KO1 need R_interior PASS; F1/F1b need F2 PASS.
 * A mismatch between this file and the prereg voids the scoring, not the seal.
 *
 *   node progress/records/torchlight3-score.mjs
 */
import { readPNG } from '../../tools/png.mjs';
import { shipVerdict, verdictLine } from '../../tools/gate.mjs';
import { farSurfacePoints, FAR, FAR_N, PROMOTED, DROPPED } from './torchlight2-far.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'progress/records/torchlight3');

/* Registered ROIs. POOL carried verbatim (parent §3); FAR/FAR_N from the v2 derivation
   module, unchanged — the bars and the derivation share one truth. */
const POOL = [292, 432, 392, 490];

const NON_INTERIOR = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'night', 'traversal', 'combat', 'guard', 'sly-profile', 'sly-key',
];
const ALL_SHOTS = [...NON_INTERIOR.slice(0, 9), 'interior', ...NON_INTERIOR.slice(9)];
const INTERIOR_ARMS = ['off', 'on', 'ko', 'back'];

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

const iOff = img(row('interior', 'off'));
const iOn = img(row('interior', 'on'));
const iKo = img(row('interior', 'ko'));
const iBack = img(row('interior', 'back'));

const so = iOff && stats(iOff, POOL), sn = iOn && stats(iOn, POOL), sk = iKo && stats(iKo, POOL);
const fo = iOff && stats(iOff, FAR), fn = iOn && stats(iOn, FAR);
const no = iOff && stats(iOff, FAR_N), nn = iOn && stats(iOn, FAR_N);

const guards = {};
const report = [];

/* BG1 — carried verbatim (parent §5), computed on the `off` arm (§5: the base picture under
   the §4 premise). */
guards.BG1 = so && fo
  ? (so.warm <= 12 && so.meanL >= 40 && so.meanL <= 100 && fo.meanL >= 35 && fo.meanL <= 95)
  : null;
if (so) report.push(`off  POOL meanL ${so.meanL.toFixed(1)} R-B ${so.meanRB.toFixed(1)} warm% ${so.warm.toFixed(1)}`);
if (fo) report.push(`off  FAR  meanL ${fo.meanL.toFixed(1)} R-B ${fo.meanRB.toFixed(1)} warm% ${fo.warm.toFixed(1)}`);

/* R1–R16 — §7 validity, per shot: diff(off, back) == 0, else that shot's block is VOID. */
const backOff = {};
for (const shot of ALL_SHOTS) {
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'back')));
  backOff[shot] = d;
  report.push(`R ${shot.padEnd(12)} off-vs-back ${d} px`);
  guards[`R_${shot}`] = d === null ? null : d === 0;
}
const rInt = guards.R_interior === true;

/* P1 / P2 — carried verbatim, on − off, gated on R_interior (§7 fail-closed). */
const dL = so && sn ? sn.meanL - so.meanL : null;
const dRB = so && sn ? sn.meanRB - so.meanRB : null;
if (dL !== null) report.push(`POOL dMeanL ${dL.toFixed(1)} dR-B ${dRB.toFixed(1)} on warm% ${sn.warm.toFixed(1)}`);
guards.P1 = !rInt || dL === null ? null : (dL >= 10 && dL <= 80);
guards.P2 = !rInt || dL === null ? null : (dRB >= 12 && sn.warm >= 35);

/* F1 — carried from v2 §5: [−8, +5.0] ∧ [−8, +22] over the parent FAR rect. */
const fdL = fo && fn ? fn.meanL - fo.meanL : null;
const fdRB = fo && fn ? fn.meanRB - fo.meanRB : null;
if (fdL !== null) report.push(`F1  FAR   dMeanL ${fdL.toFixed(2)} dR-B ${fdRB.toFixed(2)} (bands [-8,+5.0] / [-8,+22])`);
guards.F1 = !rInt || fdL === null ? null : (fdL >= -8 && fdL <= 5.0 && fdRB >= -8 && fdRB <= 22);

/* F1b — carried from v2 §5: the ambient sub-rect, [−8, +1.0] ∧ [−8, +2.0]. */
const ndL = no && nn ? nn.meanL - no.meanL : null;
const ndRB = no && nn ? nn.meanRB - no.meanRB : null;
if (ndL !== null) report.push(`F1b FAR-N dMeanL ${ndL.toFixed(2)} dR-B ${ndRB.toFixed(2)} (bands [-8,+1.0] / [-8,+2.0])`);
guards.F1b = !rInt || ndL === null ? null : (ndL >= -8 && ndL <= 1.0 && ndRB >= -8 && ndRB <= 2.0);

/* B1..B15 — the y-gate protection claim, same-boot: diff(off, on) == 0, gated on the shot's
   own R bar (§7 fail-closed). */
for (const shot of NON_INTERIOR) {
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'on')));
  report.push(`B ${shot.padEnd(12)} off-vs-on   ${d} px`);
  guards[`B_${shot}`] = guards[`R_${shot}`] !== true ? null : (d === null ? null : d === 0);
}

/* KO1 — carried verbatim; the 6.0 arm is the interior `ko` poke. */
const kL = so && sk ? sk.meanL - so.meanL : null;
if (kL !== null) report.push(`KO POOL dMeanL @6.0 ${kL.toFixed(1)} vs @2.5 ${dL === null ? '?' : dL.toFixed(1)}`);
guards.KO1 = !rInt || kL === null || dL === null ? null : (kL >= 1.35 * dL && kL >= dL + 5);

/* V1-v2 — carried verbatim from v2 §4, now over the four interior arms: exactly 6 slots =
   the five promoted sconces (0.35 m each, L−74 absent) + one no-match guard-torch slot,
   underground, inside the tomb box. The guard slot per arm feeds F2 and the report. */
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
if (guardSlots.off && guardSlots.back) {
  const d = Math.hypot(guardSlots.off.x - guardSlots.back.x, guardSlots.off.y - guardSlots.back.y, guardSlots.off.z - guardSlots.back.z);
  report.push(`(guard slot) back-vs-off stand delta ${(d * 100).toFixed(1)} cm — staging-stability aid (one staging, expect 0)`);
}

/* F2 — carried from v2 §5: every arm's guard slot ≥ 8.5 m from every FAR surface point,
   else F1/F1b VOID. */
{
  const pts = farSurfacePoints();
  let ok = guards.V1 === true ? true : null;
  if (ok) {
    for (const a of INTERIOR_ARMS) {
      const g = guardSlots[a];
      if (!g) { ok = null; break; }
      let min = 1e9;
      for (const p of pts) min = Math.min(min, Math.hypot(g.x - p[0], g.y - p[1], g.z - p[2]));
      if (a === 'on') report.push(`F2 guard-torch min distance to FAR surface ${min.toFixed(2)} m (>= 8.5)`);
      if (min < 8.5) { ok = false; report.push(`F2: interior.${a} guard slot ${min.toFixed(2)} m from FAR surface — inside its radius`); break; }
    }
  }
  guards.F2 = ok;
  if (guards.F2 !== true) { guards.F1 = null; guards.F1b = null; }  // §7: F2 out ⇒ F-bars VOID
}

/* V2 — carried: every `on` arm (all 16) reads uLocalToon 2.5 live. */
{
  let ok = true, n = 0;
  for (const shot of ALL_SHOTS) {
    const r = row(shot, 'on');
    if (!r) { ok = null; break; }
    n++;
    if (r.readback?.uLocalToon !== 2.5) { ok = false; report.push(`V2: ${shot}.on uLocalToon=${r.readback?.uLocalToon}`); break; }
  }
  guards.V2 = ok === null ? null : (ok && n === ALL_SHOTS.length);
}

/* V3-v3 — §5: every off/back row reads the poked 0 live (32 rows); interior.ko reads 6. */
{
  let ok = true, n = 0;
  for (const r of manifest.rows) {
    if (r.arm !== 'off' && r.arm !== 'back' && r.arm !== 'ko') continue;
    n++;
    const want = r.arm === 'ko' ? 6 : 0;
    if (r.readback?.uLocalToon !== want) {
      ok = false; report.push(`V3: ${r.shot}.${r.arm} reads uLocalToon=${r.readback?.uLocalToon}, poked ${want}`);
    }
  }
  guards.V3 = n === 33 ? ok : null;
}

/* V4-v3 — §5: ONE src hash across all 49 rows, equal to the manifest header's expected
   install hash (the runner-printed value; PREREG-torchlight3 §3). */
{
  const hs = new Set();
  for (const r of manifest.rows) hs.add(r.tree?.src || '?');
  report.push(`trees: {${[...hs]}} expected install ${manifest.expect?.cand} (restore ${manifest.expect?.head})`);
  guards.V4 = manifest.rows.length === 49 && hs.size === 1 && [...hs][0] === manifest.expect?.cand;
}

/* Descriptive only (carried): Sly box and right pool. */
if (iOff && iOn) {
  const SLYBOX = [600, 380, 740, 570];
  const s0 = stats(iOff, SLYBOX), s1 = stats(iOn, SLYBOX);
  report.push(`(desc) SLY box dMeanL ${(s1.meanL - s0.meanL).toFixed(1)} dR-B ${(s1.meanRB - s0.meanRB).toFixed(1)}`);
  const RPOOL = [880, 470, 1000, 530];
  const r0 = stats(iOff, RPOOL), r1s = stats(iOn, RPOOL);
  report.push(`(desc) R-pool dMeanL ${(r1s.meanL - r0.meanL).toFixed(1)} dR-B ${(r1s.meanRB - r0.meanRB).toFixed(1)}`);
}

/* ---- verdict ---------------------------------------------------------------------------- */

for (const k of Object.keys(guards)) guards[k] = bool(guards[k]);
console.log(report.join('\n'));
console.log('');
const v = shipVerdict(guards);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(14)} ${s}`);
console.log('');
console.log(verdictLine(v, 'TUNE.localToon = 2.5 (torchlight3 — one boot, poked arms)'));
process.exit(v.ship ? 0 : 1);
