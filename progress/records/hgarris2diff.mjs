/**
 * hgarris2diff — read the two arms' `matflat --json` output and score PREREG-hgarris2's
 * numeric clauses against the bars the seal registered, with the nulls supplying the error bar.
 *
 * SCOPE — this adds nothing to matflat; every caveat in `matflat.mjs`'s header applies unchanged
 * (architecture-only mask, no shadow/AO/lighting model, frame already through the whole chain,
 * geometry taken from the current tree). What it adds is arithmetic and the seal's thresholds,
 * so that the verdict is computed from the registered rule rather than chosen after seeing it.
 *
 *   node hgarris2diff.mjs <dir-with-{shot}-{off,on}.json>
 */
import { readFileSync, existsSync } from 'node:fs';
const T = process.argv[2];
const SHOTS = ['traversal', 'interior', 'temple', 'hero'];
const NULLS = ['arch:sandstone_block', 'arch:sandstone_worn', 'arch:paving_courtyard',
  'arch:granite_pink', 'arch:limestone_polished', 'arch:mudbrick', 'arch:ceiling_stars'];

const pc = (a, b) => (a === 0 || a == null || b == null ? NaN : 100 * (b - a) / a);
const load = (s, arm) => {
  const p = `${T}/${s}-${arm}.json`;
  if (!existsSync(p)) return null;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const m = {}; for (const r of j.rows) m[r.name] = r;
  return m;
};

const nullDeltas = [];
const rows = [];
for (const s of SHOTS) {
  const A = load(s, 'off'), B = load(s, 'on');
  if (!A || !B) { console.log(`  ${s}: MISSING ARM`); continue; }
  for (const name of Object.keys(A)) {
    const a = A[name], b = B[name];
    if (!b || a.sharePct < 1 || a.fineP90 == null) continue;
    const d = { shot: s, name, share: a.sharePct,
      dFineP90: pc(a.fineP90, b.fineP90), dFineMed: pc(a.fineMed, b.fineMed),
      dCov1: (b.cov1 - a.cov1) * 100, dLuma: (b.lumaMed ?? 0) - (a.lumaMed ?? 0),
      lumaOff: a.lumaMed, lumaOn: b.lumaMed };
    rows.push(d);
    if (NULLS.includes(name)) nullDeltas.push(d);
  }
}

console.log('\n--- all materials >=1% of frame, control -> shipped ---');
console.log('shot'.padEnd(11) + 'material'.padEnd(24) + 'share%'.padStart(7) + 'dFineP90'.padStart(10) +
  'dFineMed'.padStart(10) + 'dCov1pt'.padStart(9) + 'dLumaMed'.padStart(10));
for (const r of rows.sort((x, y) => x.shot.localeCompare(y.shot) || y.share - x.share)) {
  console.log(r.shot.padEnd(11) + r.name.replace('arch:', '').padEnd(24) + String(r.share).padStart(7) +
    (isNaN(r.dFineP90) ? '-' : r.dFineP90.toFixed(1) + '%').padStart(10) +
    (isNaN(r.dFineMed) ? '-' : r.dFineMed.toFixed(1) + '%').padStart(10) +
    r.dCov1.toFixed(1).padStart(9) + r.dLuma.toFixed(4).padStart(10));
}

/* P6 first: the nulls are bit-identical by construction, so their spread IS the error bar and
 * every bar below is expressed as a multiple of it. Computing it before the primary is not a
 * presentation choice — the primary's threshold depends on it. */
const nAbs = nullDeltas.map((d) => Math.abs(d.dFineP90)).filter((v) => !isNaN(v)).sort((a, b) => a - b);
const nMax = nAbs.length ? nAbs[nAbs.length - 1] : NaN;
const nMed = nAbs.length ? nAbs[nAbs.length >> 1] : NaN;
console.log(`\nP6 NULLS (bit-identical by construction): n=${nAbs.length}  |dFineP90| median ${nMed.toFixed(2)}%  max ${nMax.toFixed(2)}%`);
console.log(`   fineP90 boot-to-boot noise floor, measured for the first time. Bar for P1 = max(+2.5%, 3 x ${nMax.toFixed(2)}% = ${(3 * nMax).toFixed(2)}%).`);
const BAR = Math.max(2.5, 3 * nMax);

const get = (s, n) => rows.find((r) => r.shot === s && r.name === n);
const verdict = (ok) => (ok ? 'PASS' : 'FAIL');

console.log('\n--- registered clauses ---');
for (const s of ['traversal', 'interior']) {
  const r = get(s, 'arch:hieroglyph_wall');
  if (!r) { console.log(`P1 ${s}: material absent`); continue; }
  const ok = r.dFineP90 >= BAR;
  console.log(`P1  ${s.padEnd(10)} hieroglyph_wall fineP90 ${r.dFineP90.toFixed(1)}%  vs bar +${BAR.toFixed(2)}%  -> ${verdict(ok)}` +
    (r.dFineP90 > 9 ? '   [ABOVE THE REGISTERED UPPER BOUND +9% — check P3 before claiming it]' : ''));
  console.log(`P3  ${s.padEnd(10)} lumaMed ${r.lumaOff} -> ${r.lumaOn}  (d ${r.dLuma.toFixed(4)}, bound +-0.010) -> ${verdict(Math.abs(r.dLuma) <= 0.010)}` +
    (Math.abs(r.dLuma) > 0.010 ? '   [P1 IS UNQUOTABLE, NOT PASSED]' : ''));
}
const p4 = get('temple', 'arch:column_papyrus');
if (p4) console.log(`P4  temple     column_papyrus fineP90 ${p4.dFineP90.toFixed(1)}%  vs bar +2.0%  -> ${verdict(p4.dFineP90 >= 2.0)}   (does not kill P1)`);
const p5 = get('hero', 'arch:hieroglyph_gilded');
if (p5) console.log(`P5  hero       hieroglyph_gilded fineP90 ${p5.dFineP90.toFixed(1)}%  — predicted NULL (<+2.0%) -> ${Math.abs(p5.dFineP90) < 2.0 ? 'as predicted' : 'PREDICTION BROKEN — the albedo lab is wrong about this recipe'}`);
console.log('\nP2 (busy guard) and P7 (the image) are scored outside this script.');
