/**
 * celband-score — applies PREREG-celband.md §9's SHIP RULE to the sweep, mechanically.
 *
 * The rule is not re-stated in prose here and then interpreted by hand; it is executed. That is
 * the whole point: a ship rule a human applies by eye after seeing the table is a ship rule that
 * can drift, and §141.1's failure mode is exactly that drift.
 *
 * Runs `celcyl.mjs --arm=all` once per arm PNG, parses its verdict lines, and evaluates:
 *
 *   VOID V1  NULL   |gapFrac(base-b) - gapFrac(base-a)|  is the drift floor for the run
 *   VOID V2  LEVER  gapFrac(sb60) - gapFrac(base-a)  MUST exceed that floor, or the knob is dead
 *   VOID V3         any arm where celcyl's MUST-FIRE 1 or 2 failed
 *   SHIP  (A)       smallest v whose verdict is BANDS at dy=0 AND on all nine rows
 *         (B)       ... and whose gain over base-a exceeds the null floor
 *
 * (C), the `courtyard` guard, is bandprobe's and is scored separately — it needs a different
 * instrument and is reported alongside rather than folded in here.
 *
 *   node progress/records/celband-score.mjs [--dir shots/celband] [--shot temple]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
const DIR = argv.dir || 'shots/celband';
const SHOT = argv.shot || 'temple';
const ARMS = ['base-a', 'sb15', 'sb30', 'sb45', 'sb60', 'base-b'];
const VAL = { 'base-a': 0, sb15: 0.15, sb30: 0.30, sb45: 0.45, sb60: 0.60, 'base-b': 0 };

function score(png) {
  let out;
  try {
    out = execFileSync('node', [path.join(ROOT, 'progress/records/celcyl.mjs'), '--arm=all', `--png=${png}`, `--shot=${SHOT}`],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const grab = (re) => { const m = out.match(re); return m ? m[1] : null; };
  const rows = [...out.matchAll(/dy\s+(-?\d)\s+gapFrac (\d+\.\d+)\s+lambda_hat (\d+\.\d+)\s+->\s+(BANDS|does not band)/g)]
    .map((m) => ({ dy: +m[1], gapFrac: +m[2], lambda: +m[3], bands: m[4] === 'BANDS' }));
  return {
    gapFrac: Number(grab(/ARM: subject[\s\S]*?gapFrac (\d+\.\d+)/)),
    lambda: Number(grab(/lambda_hat = (\d+\.\d+)/)),
    decision: Number(grab(/DECISION POINT[^=]*= (\d+\.\d+)/)),
    verdict: grab(/VERDICT \(dy=0\)[\s\S]*?->\s+(BANDS|DOES NOT BAND)/),
    mustFire1: /MUST-FIRE 1[^\n]*->\s+PASS/.test(out),
    mustFire2: /MUST-FIRE 2[^\n]*->\s+PASS/.test(out),
    rowAgree: /ROW AGREEMENT: PASS/.test(out),
    allRowsBand: rows.length === 9 && rows.every((r) => r.bands),
    ratio: Number(grab(/noise\/range ratio = (\d+\.\d+)/)),
    rows,
  };
}

const R = {};
for (const a of ARMS) {
  const p = path.resolve(ROOT, DIR, `${SHOT}-${a}.png`);
  if (!fs.existsSync(p)) { console.error(`missing arm PNG: ${p}`); process.exit(2); }
  R[a] = score(p);
  const r = R[a];
  console.log(`${a.padEnd(7)} uShadeBand ${String(VAL[a]).padEnd(5)} gapFrac ${r.gapFrac.toFixed(4)}  `
    + `lambda ${r.lambda.toFixed(3)}  decision ${r.decision.toFixed(4)}  noise/range ${r.ratio.toFixed(4)}  `
    + `${r.verdict}  rows ${r.rows.filter((x) => x.bands).length}/9  MF1 ${r.mustFire1 ? 'ok' : 'FAIL'} MF2 ${r.mustFire2 ? 'ok' : 'FAIL'}`);
}

const NULLF = Math.abs(R['base-b'].gapFrac - R['base-a'].gapFrac);
const LEVER = R.sb60.gapFrac - R['base-a'].gapFrac;
console.log(`\nV1 NULL  |base-b - base-a| = ${NULLF.toFixed(4)}   <- the drift floor for this run`);
console.log(`V2 LEVER  sb60 - base-a    = ${LEVER.toFixed(4)}   MUST exceed the floor  ->  ${LEVER > NULLF ? 'PASS — the knob is live' : 'FAIL — dead lever (§210.2). VOID.'}`);
const v3 = ARMS.filter((a) => !(R[a].mustFire1 && R[a].mustFire2));
console.log(`V3 arms with a failed MUST-FIRE 1/2: ${v3.length ? v3.join(', ') + '  -> VOID for those arms' : 'none'}`);

console.log('\nSHIP RULE (A) verdict BANDS on all nine rows, (B) gain over base-a exceeds the null floor:');
let ship = null;
for (const a of ['sb15', 'sb30', 'sb45', 'sb60']) {
  const r = R[a];
  const gain = r.gapFrac - R['base-a'].gapFrac;
  const A = r.verdict === 'BANDS' && r.allRowsBand;
  const B = gain > NULLF;
  const ok = A && B && r.mustFire1 && r.mustFire2;
  console.log(`  ${a}  (A) ${A ? 'pass' : 'fail'}   (B) gain ${gain.toFixed(4)} vs floor ${NULLF.toFixed(4)} ${B ? 'pass' : 'fail'}   -> ${ok ? 'ELIGIBLE' : 'not eligible'}`);
  if (ok && ship === null) ship = a;
}
console.log(`\n=> ${ship ? `SHIP uShadeBand = ${VAL[ship]}  (${ship}) — the smallest eligible value` : 'NOTHING SHIPS — no swept value clears the criterion. Report as a failure to reach it; do not re-sweep.'}`);
console.log('   (C), the courtyard guard, is scored with tools/bandprobe.mjs and reported beside this.');
