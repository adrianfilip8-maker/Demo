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

/* Every guard is `null` unless its inputs are all present. `null` is VOID by gate.mjs. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const C1v = A.a2h && A.a0h ? num(A.a2h.F - A.a0h.F) : null;
const C1 = C1v === null ? null : C1v >= 0.04;

/* C1 is the sensitivity arm. If it did not fire, nothing downstream is interpretable — a null
 * arm proves repeatability, not sensitivity — so every other guard is forced to VOID rather
 * than being allowed to pass on an instrument that has not been shown to see anything. */
const live = C1 === true;
const g = (v) => (live ? v : null);

const C2v = A.a0h && r9h ? num(Math.abs(A.a0h.F - r9h.flat)) : null;
const guards = {
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
