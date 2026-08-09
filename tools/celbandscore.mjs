/**
 * celbandscore — scores `PREREG-celband.md` (as amended) against the captured arms.
 *
 * Reads only what the seal registered, computes only what the seal defined, and decides through
 * `gate.mjs` so that "could not be evaluated" can never read as "passed" (§263.1).
 *
 *   node tools/celbandscore.mjs shots/celband
 *
 * Expects `<dir>/{a0,a1,a2}/{hero,interior}.png` and `shots/r9/hero.png` for C2.
 *
 * The registered quantities, verbatim from the seal:
 *   F = frame-wide flat share (celsurf's calibrated definition) on `hero`
 *   G = window-gradient p50 on `hero`
 *   C1  A2.F - A0.F >= 0.04        CALIBRATION, must fire, else everything is VOID
 *   C2  |A0.F - r9.F| <= 0.010
 *   P1  A1.F >= 0.2016
 *   P2  A1.G <= 1.2713
 *   P4  A1.F(interior) >= 0.1377
 * S2 (jointSign) and S3 (darkTail) are build-time and are scored by `celtex.mjs`, not here; this
 * runner refuses to print a verdict unless they are supplied on the command line, because a
 * blocking guard that lives in another tool is a blocking guard that gets forgotten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { measure } from './celsurf.mjs';
import { shipVerdict, verdictLine, guardState } from './gate.mjs';

const dir = process.argv[2] || 'shots/celband';
const has = (n) => process.argv.includes(`--${n}`);

/** null when the frame was not captured — which must land as VOID, never as a pass. */
function frame(arm, shot) {
  const f = path.join(dir, arm, `${shot}.png`);
  if (!fs.existsSync(f)) return null;
  const m = measure(f);
  return { F: m.flat, G: m.gradP[1], top3: m.top3P[1], levels: m.levelsP[1], n: m.nWin };
}

const A = {
  a0h: frame('a0', 'hero'), a1h: frame('a1', 'hero'), a2h: frame('a2', 'hero'),
  a0i: frame('a0', 'interior'), a1i: frame('a1', 'interior'), a2i: frame('a2', 'interior'),
};
const r9h = fs.existsSync('shots/r9/hero.png') ? measure('shots/r9/hero.png') : null;

console.log('\narm            shot      flat      grad-p50   top3   levels   windows');
for (const [k, v] of Object.entries(A)) {
  const arm = k.slice(0, 2), shot = k.endsWith('h') ? 'hero' : 'interior';
  if (!v) { console.log(`${arm.padEnd(6)} ${shot.padEnd(10)} NOT CAPTURED`); continue; }
  console.log(`${arm.padEnd(6)} ${shot.padEnd(10)} ${v.F.toFixed(4).padStart(7)} ${v.G.toFixed(2).padStart(10)} ${v.top3.toFixed(3).padStart(7)} ${String(v.levels).padStart(7)} ${String(v.n).padStart(8)}`);
}
if (r9h) console.log(`${'r9'.padEnd(6)} ${'hero'.padEnd(10)} ${r9h.flat.toFixed(4).padStart(7)} ${r9h.gradP[1].toFixed(2).padStart(10)}`);

/* ---- armTook (PREREG-celband amendment 2) ------------------------------------------------
 * The arms are environment variables: invisible in a PNG, identical in the SHA. Two signatures
 * were registered before capture and both are checked here rather than by eye.
 *   - A1's warnings must name `celbandon`, A2's `celbandflat`, A0's must name neither.
 *   - all three run VITE_TEX_BAKED=off, so all three must report `0 baked`; an arm that reports
 *     `N baked` read the committed blob and never ran a recipe.
 * Anything unreadable is `null` -> VOID, never a pass. */
function armWarnings(arm) {
  const f = path.join(dir, arm, 'report.json');
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return [].concat(j.warnings || [], j.bootWarnings || []).join(' | ');
  } catch { return null; }
}
/** The commit each arm was captured at. Arms at different commits are not arms — see below. */
function armSha(arm) {
  const f = path.join(dir, arm, 'report.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')).commit?.sha ?? null; } catch { return null; }
}

/* ---- sameTree: the guard this run needed and did not have ---------------------------------
 * `shot.mjs` is one lock acquisition per invocation, so three env-var arms are three runs that
 * queue separately. With four agents committing, the tree moves BETWEEN them. It did: run 1 of
 * this seal captured A0 at 212b454 and A1 at 9bd617d, twenty commits later, and those twenty
 * include `src/core/Shots.js` (the D4 camera re-framing — the hero is 1.8x larger) and
 * `src/world/Statues.js` (+218 lines). A frame difference across that gap is not attributable to
 * a texture stage.
 *
 * §28 recorded the within-boot version of this ("every within-boot A/B was captured at a
 * different world clock"). This is the across-boot version and it is worse, because a commit can
 * change the camera. So: every arm must report the same sha, or the run is VOID on provenance
 * before any statistic is read. */
const S = { a0: armSha('a0'), a1: armSha('a1'), a2: armSha('a2') };
const present = Object.values(S).filter(Boolean);
const sameTree = present.length < 2 ? null : present.every((v) => v === present[0]);

const W = { a0: armWarnings('a0'), a1: armWarnings('a1'), a2: armWarnings('a2') };
const armTook = (() => {
  if (!W.a0 || !W.a1 || !W.a2) return null;
  const proc = Object.values(W).every((w) => /0 baked/.test(w));
  const tagged = W.a1.includes('celbandon') && W.a2.includes('celbandflat')
    && !W.a0.includes('celbandon') && !W.a0.includes('celbandflat');
  return proc && tagged;
})();
console.log('\narmTook (amendment 2)');
for (const [k, w] of Object.entries(W)) {
  console.log(`  ${k}: ${w === null ? 'NO report.json' : (/(\d+) baked \/ (\d+) generated/.exec(w) || [, '?', '?']).slice(1).join(' baked / ') + ' generated'
    + (/celband\w+/.exec(w) ? `  arm=${/celband\w+/.exec(w)[0]}` : '  arm=(none)')}`);
}
console.log(`  => ${guardState(armTook)}`);
console.log('\nsameTree (provenance)');
for (const [k, v] of Object.entries(S)) console.log(`  ${k}: ${v || 'NO report.json'}`);
console.log(`  => ${guardState(sameTree)}`);

/* Every guard is `null` unless its inputs are all present. `null` is VOID by gate.mjs. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const C1v = A.a2h && A.a0h ? num(A.a2h.F - A.a0h.F) : null;
/* armTook gates the calibration, which gates everything else — registered in that order. */
const C1 = (armTook !== true || sameTree !== true) ? null
  : (C1v === null ? null : C1v >= 0.04);

/* C1 is the sensitivity arm. If it did not fire, nothing downstream is interpretable — a null
 * arm proves repeatability, not sensitivity — so every other guard is forced to VOID rather
 * than being allowed to pass on an instrument that has not been shown to see anything. */
const live = C1 === true;
const g = (v) => (live ? v : null);

const C2v = A.a0h && r9h ? num(Math.abs(A.a0h.F - r9h.flat)) : null;
const guards = {
  'A0 armTook: three arms distinguishable in report.json': armTook,
  'A0b sameTree: every arm captured at one commit': sameTree,
  'C1 calibration A2-A0 flat >= 0.04': C1,
  'C2 control reproduces r9 (|dF| <= 0.010)': g(C2v === null ? null : C2v <= 0.010),
  'P1 A1 hero flat >= 0.2016': g(A.a1h ? A.a1h.F >= 0.2016 : null),
  'P2 A1 hero grad p50 <= 1.2713': g(A.a1h ? A.a1h.G <= 1.2713 : null),
  'P4 A1 interior flat >= 0.1377': g(A.a1i ? A.a1i.F >= 0.1377 : null),
  'S2 jointSign dY < 0 on every masonry recipe': has('s2ok') ? true : null,
  'S3 darkTail not increased on any recipe': has('s3ok') ? true : null,
};

console.log('\nregistered guards');
for (const [k, v] of Object.entries(guards)) console.log(`  ${guardState(v).padEnd(5)} ${k}`);
if (sameTree === false) {
  console.log('\n  The arms are at different commits. Every frame statistic below is a mixture of');
  console.log('  this texture stage and whatever else landed in between, and no split of it is');
  console.log('  available from these files. Reported as descriptive, licensed as nothing.');
}
if (C1 !== true) {
  console.log('\n  C1 did not fire, so C2/P1/P2/P4 are forced VOID: the run has not shown that a');
  console.log('  texture change of ANY size reaches this instrument, and a verdict on a blind');
  console.log('  instrument is not a verdict.');
}
if (!has('s2ok') || !has('s3ok')) {
  console.log('\n  S2/S3 are build-time invariants measured by `celtex.mjs`. Pass --s2ok/--s3ok');
  console.log('  only after reading its darkTail and jointSign columns; unsupplied means VOID.');
}

const v = shipVerdict(guards);
console.log('\n' + verdictLine(v, 'celband 5 / size÷256 / 0.25 as the default arm, and re-bake'));
process.exitCode = v.ship ? 0 : 1;
