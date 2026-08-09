/**
 * §270 / PREREG-inkblack.md — scorer. Thresholds come from the pre-registration and are NOT
 * re-derived here; changing one after seeing a candidate is the §141.1 violation this whole
 * apparatus exists to prevent.
 *
 * Registered, verbatim:
 *   CAL-1  |A - B| non-empty on every daylight frame     (the crease lever is live)
 *   CAL-2  |B - C| non-empty on every frame              (the hull lever is live)
 *   CAL-3  inkMask covers 0.5%..15% of each frame        (else the mask is not ink)
 *   CAL-4  sha(C0) == sha(B) AND sha(C) != sha(B)        (broken lever dead, working lever live)
 *   P1     |darkestDecile(hullMask, B) - darkestDecile(inkMask, A)| <= 0.010
 *   F1     > 0.010 refutes "the hull dominates the ink black point"
 *
 * CAL-4 is the sensitivity half of the calibration and it is deliberately two-sided. `C0` runs
 * the hull-defeat lever that the pre-registration predicts does NOT survive to the captured frame
 * (`.visible = false`, reverted by `endNormalPass` -> `setOutlinesVisible(true)` on every frame
 * after the first); `C` runs the one that does (`.layers.disable(0)`). Requiring one dead and one
 * live, in the same boot on the same frame, proves the instrument responds to the hull rather
 * than merely repeating itself. `C0` enters no mask and contributes to no attribution.
 *
 * P2 (re-authoring the hull colour to black moves the decile >= 0.030 L) needs a src edit and a
 * second capture. It is deliberately NOT scored here, so that P1's numbers cannot be used to
 * argue about a threshold P2 has already fixed.
 */
import { readPNG } from './png.mjs';
import { readFileSync } from 'node:fs';
import { shipVerdict, verdictLine, guardState, PASS, VOID } from './gate.mjs';

const DIR = process.env.SANDS_OUT || 'shots/inkblack';
const arms = JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8'));

const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const NIGHT = new Set(['night', 'guard']);

/** Pixels where two frames differ at all, plus the luma of the first at those pixels. */
function diffMask(a, b) {
  if (a.w !== b.w || a.h !== b.h) return null;
  const idx = [];
  for (let i = 0, n = a.w * a.h; i < n; i++) {
    const p = i * a.ch, q = i * b.ch;
    if (a.data[p] !== b.data[q] || a.data[p + 1] !== b.data[q + 1] || a.data[p + 2] !== b.data[q + 2]) {
      idx.push(i);
    }
  }
  return idx;
}

/** Darkest-decile luma of `im` restricted to `idx`. */
function darkestDecile(im, idx) {
  if (!idx.length) return null;
  const v = new Float64Array(idx.length);
  for (let k = 0; k < idx.length; k++) {
    const p = idx[k] * im.ch;
    v[k] = luma(im.data[p], im.data[p + 1], im.data[p + 2]);
  }
  v.sort();
  return v[Math.floor(v.length * 0.10)];
}

const byShot = new Map();
for (const r of arms) {
  if (!byShot.has(r.shot)) byShot.set(r.shot, {});
  byShot.get(r.shot)[r.arm] = r;
}

/* ── PROVENANCE ────────────────────────────────────────────────────────────────────────────
   Added after the lead VOIDed another lane's run for capturing two arms of one comparison
   twenty commits apart, on a branch four agents commit to continuously. This is a NEW GATE, not
   a moved threshold: it can only make the run harder to pass, never easier, and no registered
   number changes.

   The identity compared is a CONTENT HASH of `src/` (tools/treestate.mjs), not a commit sha.
   Vite bundles the working tree, so two captures at the same commit can render different
   pictures while uncommitted edits are in flight — and they are, continuously.

   Two different questions, and they deserve different answers:

   G-TREE (a hard gate) — every arm of a SHOT must share one tree. That is what every registered
   comparison here reads: CAL-1, CAL-2, CAL-4 and P1's per-shot delta are all within-shot. One
   boot per shot makes it true by construction; this verifies it instead of trusting it.

   Cross-shot drift is REPORTED, not gated, and the reason is stated rather than assumed: no
   registered statistic compares one shot with another. P1 takes a worst case over per-shot
   deltas, so drift can change WHICH shot is worst without making any individual delta wrong.
   Reported loudly, because "the worst shot" from a heterogeneous population is a weaker claim
   than "the worst shot" from a homogeneous one, and the reader is owed that. */
const treeOf = (r) => (r?.tree?.src ?? null);
const shotTrees = new Map();
const gTree = [];
for (const [shot, a] of byShot) {
  const seen = new Set();
  let unrecorded = 0;
  for (const arm of ['A-ship', 'B-nocrease', 'C0-visible', 'C-noink']) {
    const t = treeOf(a[arm]);
    if (t === null) unrecorded++; else seen.add(t);
  }
  shotTrees.set(shot, { trees: [...seen], unrecorded });
  /* Mixed trees inside one shot is a hard failure. All-unrecorded is VOID (null), not PASS —
     an unverifiable guard did not produce a verdict (tools/gate.mjs). */
  gTree.push(seen.size > 1 ? false : (seen.size === 1 && unrecorded === 0) ? true : null);
}

const rows = [];
const cal1 = [], cal2 = [], cal3 = [], cal4 = [];

for (const [shot, a] of byShot) {
  const A = a['A-ship'], B = a['B-nocrease'], C = a['C-noink'], C0 = a['C0-visible'];
  if (!A || !B || !C || !C0) {
    rows.push({ shot, note: 'missing arm' });
    cal1.push(false); cal2.push(false); cal3.push(false); cal4.push(false);
    continue;
  }

  /* CAL-4, from the recorded shas rather than from the pixels: cheap, and it is a statement
     about the LEVERS, not about the image. Both halves required. */
  const c0Dead = C0.sha === B.sha;
  const cLive = C.sha !== B.sha;
  cal4.push(c0Dead && cLive);

  const imA = readPNG(A.file), imB = readPNG(B.file), imC = readPNG(C.file);
  const inkMask = diffMask(imA, imC);
  const creaseMask = diffMask(imA, imB);
  const hullMask = diffMask(imB, imC);
  if (!inkMask || !creaseMask || !hullMask) { rows.push({ shot, note: 'size mismatch' }); cal1.push(false); cal2.push(false); cal3.push(false); continue; }

  const n = imA.w * imA.h;
  const cov = inkMask.length / n;

  /* CAL-1 is gated over DAYLIGHT frames only, and the provenance of that scope is stated rather
     than dressed up: I chose it already knowing `night` was the frame that broke the previous
     instrument. What makes it legitimate is not the timing, it is that the mechanism predicts it
     from the source independently of any measurement — the crease ink is multiplied by
     smoothstep(0.05, 0.20, lum), so a frame whose median luma is 0.076 must carry little or no
     crease ink whatever the lever does. Gating CAL-1 on such a frame would fail the lever for
     doing exactly what it is written to do.
     So night is scored but NOT gated, and it is turned into a falsifiable prediction rather than
     a hole: nCrease(night) should be a small fraction of the daylight frames'. If night instead
     shows crease ink in daylight quantities, the mechanism story above is wrong and the
     exclusion was unearned — reported below either way. */
  if (!NIGHT.has(shot)) cal1.push(creaseMask.length > 0);
  cal2.push(hullMask.length > 0);
  cal3.push(cov >= 0.005 && cov <= 0.15);

  rows.push({
    shot,
    nInk: inkMask.length, nCrease: creaseMask.length, nHull: hullMask.length,
    cov,
    dInkA: darkestDecile(imA, inkMask),
    dHullB: darkestDecile(imB, hullMask),
    dCreaseA: darkestDecile(imA, creaseMask),
    shells: C.applied?.hulls ?? 0,
    c0Dead, cLive,
  });
}

console.log('shot          ink px   crease px   hull px   cov%    dec(ink,A)  dec(hull,B)  dec(crease,A)  shells');
for (const r of rows) {
  if (r.note) { console.log(`  ${r.shot.padEnd(12)} ${r.note}`); continue; }
  const f = (x) => (x == null ? '  n/a ' : x.toFixed(4));
  console.log(`  ${r.shot.padEnd(12)} ${String(r.nInk).padStart(7)} ${String(r.nCrease).padStart(10)} `
    + `${String(r.nHull).padStart(9)}  ${(100 * r.cov).toFixed(2).padStart(5)}     ${f(r.dInkA)}      `
    + `${f(r.dHullB)}       ${f(r.dCreaseA)}     ${String(r.shells).padStart(4)}`);
}

/* CAL-4, printed per shot. The interesting column is `C0==B`: a `yes` there is the registered
   PRED-1 firing — the `.visible` hull lever is reverted by `endNormalPass` before the captured
   frame — and a `no` refutes the render-order reading outright. */
console.log('\nCAL-4  lever sensitivity      C0==B (broken lever dead)   C!=B (layers lever live)');
for (const r of rows) {
  if (r.note) continue;
  console.log(`  ${r.shot.padEnd(12)}              ${r.c0Dead ? 'yes' : 'NO '}                        `
    + `${r.cLive ? 'yes' : 'NO '}`);
}

/* P1 — attribution. Scored over the shots where BOTH deciles exist; a shot missing either is
   not evidence either way and must not be silently averaged in as agreement. */
const usable = rows.filter((r) => !r.note && r.dInkA != null && r.dHullB != null);
const deltas = usable.map((r) => Math.abs(r.dHullB - r.dInkA));
const worst = deltas.length ? Math.max(...deltas) : null;
const p1 = deltas.length ? worst <= 0.010 : null;   // null, not false: nothing was measured

/* Provenance report. Printed before the guards so the reader sees the population before the
   verdict, and the cross-shot span is spelled out rather than left implicit. */
console.log('\nprovenance: src content hash per shot (tools/treestate.mjs)');
const distinct = new Set();
for (const [shot, t] of shotTrees) {
  for (const x of t.trees) distinct.add(x);
  console.log(`  ${shot.padEnd(12)} ${t.trees.length ? t.trees.join(' + ') : '(unrecorded)'}`
    + (t.unrecorded ? `   ${t.unrecorded}/4 arms unrecorded` : '')
    + (t.trees.length > 1 ? '   ARMS SPAN MORE THAN ONE TREE' : ''));
}
if (distinct.size > 1) {
  console.log(`  -> the ten frames span ${distinct.size} different source trees. Every registered`);
  console.log('     statistic here is WITHIN a shot (CAL-1/2/4 and P1\'s delta are all one-boot),');
  console.log('     so no individual number is invalidated — but P1 takes a worst case across a');
  console.log('     population that is not homogeneous, so WHICH shot is worst is not a claim this');
  console.log('     run can make. Reported, not gated: nothing registered compares shot to shot.');
}

const all = (xs) => (xs.length ? xs.every(Boolean) : null);
/**
 * Tri-state AND. `all()` above uses `every(Boolean)`, which maps `null` to `false` — fine for the
 * CAL arrays, which only ever hold booleans, and WRONG for a guard that can be unevaluable: it
 * turns "could not be checked" into "was checked and failed". Those are different outcomes and
 * the whole point of tools/gate.mjs is that they stay different. A single `false` still wins,
 * because a definite failure is more informative than an absence.
 */
const allTri = (xs) => {
  if (!xs.length) return null;
  if (xs.some((x) => x === false)) return false;
  return xs.every((x) => x === true) ? true : null;
};
const guards = {
  'G-TREE arms of a shot share one tree': allTri(gTree),
  'CAL-1 crease lever live': all(cal1),
  'CAL-2 hull lever live':   all(cal2),
  'CAL-3 mask is ink':       all(cal3),
  'CAL-4 lever sensitivity':  all(cal4),
  'P1 hull dominates':       p1,
};

/* The night exclusion, as a prediction that can fail. See CAL-1 above for why it is stated
   this way instead of being quietly scoped out. */
const dayCrease = rows.filter((r) => !r.note && !NIGHT.has(r.shot)).map((r) => r.nCrease);
const nightRow = rows.find((r) => !r.note && NIGHT.has(r.shot));
if (nightRow && dayCrease.length) {
  const medDay = dayCrease.slice().sort((a, b) => a - b)[Math.floor(dayCrease.length / 2)];
  const ratio = medDay ? nightRow.nCrease / medDay : NaN;
  console.log(`\n  night crease px ${nightRow.nCrease} vs daylight median ${medDay} `
    + `(ratio ${Number.isFinite(ratio) ? ratio.toFixed(3) : 'n/a'})`);
  console.log(ratio < 0.25
    ? '  -> as predicted by smoothstep(0.05,0.20,lum); the CAL-1 daylight scope is earned.'
    : '  -> NOT as predicted: night carries daylight-scale crease ink, so the mechanism argument '
      + 'for excluding it from CAL-1 is WRONG and the exclusion was unearned.');
}

console.log('');
for (const [k, v] of Object.entries(guards)) console.log(`  ${guardState(v).padEnd(4)}  ${k}`);
if (worst != null) console.log(`\n  worst |dec(hull,B) - dec(ink,A)| = ${worst.toFixed(4)}  (F1 refutes above 0.0100)`);

const v = shipVerdict(guards);
console.log('\n' + verdictLine(v));

/* The registered outcome names, mapped explicitly so the run cannot be reported as something
   the pre-registration does not define. VOID beats FAIL: an unevaluable run says nothing about
   the candidate. */
const calStates = ['G-TREE arms of a shot share one tree', 'CAL-1 crease lever live',
  'CAL-2 hull lever live', 'CAL-3 mask is ink', 'CAL-4 lever sensitivity']
  .map((k) => guardState(guards[k]));
let outcome;
if (calStates.some((s) => s === VOID) || guardState(p1) === VOID) outcome = 'VOID';
else if (calStates.some((s) => s !== PASS)) outcome = 'VOID';         // a failed calibration voids
else outcome = (guardState(p1) === PASS) ? 'P1 MET — hull dominates; P2 still unscored'
                                         : 'FAIL — F1 fired, the crease ink is a material contributor';
console.log(`OUTCOME: ${outcome}`);
console.log('P2 (authored colour vs grade floor) needs a src edit and a second capture; not scored here.');
