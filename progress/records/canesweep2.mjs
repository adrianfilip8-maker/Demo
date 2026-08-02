/**
 * canesweep2.mjs — is there a `perch_idle` cane aim that satisfies BOTH halves of
 * PREREG-heroline's H-look clause 2 at once: an open C (H1/H2/H3) *and* traceable to its own
 * shaft without crossing the torso (strict connectivity, after the silmerge flood-fill fix)?
 *
 * WHAT THIS IS, AS THE GAP (KNOWN_ISSUES §11) — the suffix between this and the drawn frame is
 * exactly silmerge's own, since this only drives silmerge: no foot IK, no level occlusion, no
 * ink shell (reported separately as the gap-minus-5 column), no shader/PostFX. Shape only.
 *
 * It sweeps the CANE AIM ONLY. That is not laziness: PREREG-heroline killed the two neighbouring
 * levers with measurements — five right-arm variants all made hook burial worse (41.2% ->
 * 47.9-77.4%), and a 96-row tail x cane co-sweep drove hook outline ownership to 1.5% / 88.2%
 * burial, worse than baseline on the very condition being fixed. Re-deriving either would be
 * re-running an eliminated hypothesis.
 *
 * Scores every registered band and every deletion gate from the seal, so a candidate cannot look
 * good by moving the primary while quietly breaking a gate.
 */
import { execFileSync } from 'node:child_process';

const SCRATCH = process.env.SCRATCH;
const TOOL = `${SCRATCH}/silmerge.mjs`;
const ROOT = '/home/user/Demo';

const XS = [-40, -35, -30, -25, -20, -15];
const YS = [25, 30, 35, 40];
const ZS = [80, 95, 105, 115, 130, 145];

const num = (re, s) => { const m = s.match(re); return m ? parseFloat(m[1]) : NaN; };

function score(aim) {
  let out;
  try {
    out = execFileSync('node', [TOOL, '--shot', 'hero', '--rows', '720', '--root', ROOT,
      '--cane', aim, '--out', `${SCRATCH}/silsweep`, '--tag', 'sw'], { encoding: 'utf8', env: process.env });
  } catch (e) { return null; }
  const hookLine = out.match(/^ {2}hook +(\d+) +[\d.]+% +\d+ +([\d.]+)% +\d+ +[\d.]+% \(([\d.]+)%\)/m);
  const tailLine = out.match(/^ {2}tail +\d+ +[\d.]+% +\d+ +([\d.]+)%/m);
  const headc = out.match(/CLUSTER headc .* buried ([\d.]+)%/);
  return {
    aim,
    hookPx: hookLine ? +hookLine[1] : NaN,
    h1: hookLine ? +hookLine[2] : NaN,          // % of union outline
    h2: hookLine ? +hookLine[3] : NaN,          // buried %
    h3: num(/HOOKAPERT ([\d.]+)/, out),         // aperture
    h4: num(/background channel[^:]*: (\d+) px/, out),
    tail: tailLine ? +tailLine[1] : NaN,
    headcBuried: headc ? +headc[1] : NaN,
    tipY: num(/tip y (-?[\d.]+)/, out),
    bootY: num(/lowest boot y (-?[\d.]+)/, out),
    connected: /strict, clause 2\): true/.test(out),
    gap: num(/CANE GAP ([\d.]+) px/, out),
  };
}

const rows = [];
for (const x of XS) for (const y of YS) for (const z of ZS) {
  const r = score(`${x},${y},${z}`);
  if (r) rows.push(r);
}

// Seal's registered bands + deletion gates, applied exactly as written.
const gatesOk = (r) => r.tail >= 17.0 && r.headcBuried <= 42.0 && r.hookPx >= 150 && r.tipY >= r.bootY;
const bandsPass = (r) => r.h1 >= 8.0 && r.h2 <= 30 && r.h3 >= 0.35 && r.h3 <= 0.85 && r.h4 >= 8;

const both = rows.filter((r) => r.connected && bandsPass(r) && gatesOk(r));
const connOnly = rows.filter((r) => r.connected && gatesOk(r));

const fmt = (r) => `${r.aim.padEnd(15)} H1 ${String(r.h1).padStart(5)}%  H2 ${String(r.h2).padStart(5)}%  H3 ${r.h3.toFixed(3)}  H4 ${String(r.h4).padStart(3)}px  tail ${r.tail}%  hookPx ${String(r.hookPx).padStart(4)}  tip ${r.tipY.toFixed(3)}/${r.bootY.toFixed(3)}  conn ${r.connected}${r.connected ? '' : `  gap ${r.gap.toFixed(1)}px`}`;

console.log(`swept ${rows.length} cane aims (cane-only; arm and tail levers already killed by PREREG-heroline)\n`);
console.log(`== satisfy BOTH clause-2 halves (all bands PASS + all gates + strictly connected): ${both.length}`);
for (const r of both.sort((a, b) => b.h1 - a.h1)) console.log('  ' + fmt(r));

console.log(`\n== strictly connected AND all gates hold, regardless of bands: ${connOnly.length}`);
for (const r of connOnly.sort((a, b) => b.h1 - a.h1).slice(0, 14)) console.log('  ' + fmt(r));

const best = rows.filter(gatesOk).sort((a, b) => b.h1 - a.h1).slice(0, 8);
console.log(`\n== best H1 overall with gates holding (for reference, connectivity shown):`);
for (const r of best) console.log('  ' + fmt(r));

// The two endpoints, for anchoring.
console.log('\n== endpoints');
for (const a of ['-40,40,80', '-20,30,130']) {
  const r = rows.find((q) => q.aim === a) || score(a);
  console.log(`  ${a === '-40,40,80' ? 'baseline' : 'shipped '} ` + fmt(r));
}
