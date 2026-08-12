/**
 * Scores shots/subjhold/arms.json against PREREG-subjhold.md §3/§4. Verdict-only; re-runnable.
 * The LOOK gate (night crop) is prose-scored in the RESULT, not here — this prints the
 * numeric bars and the outcome those support, flagging LOOK as EYEBALL-REQUIRED.
 */
import { readFileSync } from 'node:fs';

const ARMS = (process.env.SANDS_OUT || 'shots/subjhold') + '/arms.json';
const rows = JSON.parse(readFileSync(ARMS, 'utf8'));
const R = (shot, cond) => rows.find((r) => r.shot === shot && r.cond === cond);
const circdiff = (a, b) => ((a - b + 540) % 360) - 180;
const REF = 213.5, TOL = 6.0;
const inBand = (h) => Math.abs(circdiff(h, REF)) <= TOL;

let voided = [], failed = [], passed = [];
const gate = (name, ok, detail) => {
  (ok === true ? passed : ok === false ? failed : voided).push(`${name}: ${detail}`);
  console.log(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : 'VOID'}  ${name}  ${detail}`);
};

for (const shot of ['sly-closeup', 'hero', 'interior', 'temple', 'night']) {
  const d = rows.find((r) => r.shot === shot && r.cond === 'DRIFT');
  gate(`C-DRIFT ${shot}`, d ? d.leaked === 0 : null, d ? `${d.leaked} px` : 'missing');
}
for (const [shot, cond, wantHold] of [['sly-closeup', 'base', 0], ['sly-closeup', 'hold', 1],
  ['hero', 'base', 0], ['hero', 'hold', 1], ['hero', 'holdnf', 1],
  ['interior', 'base', 0], ['interior', 'hold', 1]]) {
  const r = R(shot, cond);
  const ok = r ? (r.modeA === 'raw' && r.modeB === 'fix' && r.A.sha !== r.B.sha
    && r.readback.hold === wantHold) : null;
  gate(`CAL-2/READBACK ${shot}/${cond}`, ok, r ? `hold=${r.readback.hold}` : 'missing');
}

const cb = R('sly-closeup', 'base'), ch = R('sly-closeup', 'hold');
gate('CAL-FULL', cb ? Math.abs(circdiff(circdiff(cb.hueB, cb.hueA), -9.0)) <= 2.0 : null,
  cb ? `base swing ${circdiff(cb.hueB, cb.hueA).toFixed(1)} vs -9.0±2.0` : 'missing');
gate('CAL-C closeup', cb && ch ? cb.cov >= 0.015 && ch.cov >= 0.015 : null,
  `cov ${cb ? (100 * cb.cov).toFixed(2) : '—'}/${ch ? (100 * ch.cov).toFixed(2) : '—'}%`);

const faceBand = (v, lo, hi) => v != null && v >= lo && v <= hi;
const fb = cb?.face, fh = ch?.face;
/* SANDS_SEAL=2 scores PREREG-subjhold2's face gates (CAL-FACE-N aliveness + PROT-FACE in
   delta form); default scores PREREG-subjhold's original absolute bands, kept for the
   run-1 record. */
const SEAL2 = process.env.SANDS_SEAL === '2';
if (SEAL2) {
  gate('CAL-FACE-N', fb && fh
    ? [fb.cream.n, fh.cream.n, fb.rings.n, fh.rings.n].every((n) => n >= 200) : null,
    fb && fh ? `n cream ${fb.cream.n}/${fh.cream.n}, rings ${fb.rings.n}/${fh.rings.n} (≥200)` : 'missing');
} else {
  gate('CAL-FACE-BASE', fb ? (faceBand(fb.cream.br, -58, -30) && faceBand(fb.rings.br, 5, 45)) : null,
    fb ? `base cream ${fb.cream.br} vs [-58,-30], rings ${fb.rings.br} vs [+5,+45]` : 'missing');
}

const hh = R('hero', 'hold'), ih = R('interior', 'hold');
const hb = R('hero', 'base'), ib = R('interior', 'base');
gate('CAL-C mids', [hb, hh, ib, ih].every((r) => r && r.cov >= 0.002) ? true : null,
  'all ≥ 0.20%');
gate('P2-MID hero', hh ? inBand(hh.hueB) : null, hh ? `hueB ${hh.hueB.toFixed(1)} (|Δref| ${Math.abs(circdiff(hh.hueB, REF)).toFixed(1)})` : 'missing');
gate('P2-MID interior', ih ? inBand(ih.hueB) : null, ih ? `hueB ${ih.hueB.toFixed(1)} (|Δref| ${Math.abs(circdiff(ih.hueB, REF)).toFixed(1)})` : 'missing');
gate('PROT-CLOSE', ch ? inBand(ch.hueB) : null, ch ? `hueB ${ch.hueB.toFixed(1)}` : 'missing');
if (SEAL2) {
  const alive = fb && fh && [fb.cream.n, fh.cream.n, fb.rings.n, fh.rings.n].every((n) => n >= 200);
  gate('PROT-FACE(Δ)', alive
    ? (Math.abs(fh.cream.br - fb.cream.br) <= 7 && Math.abs(fh.rings.br - fb.rings.br) <= 7) : null,
    fb && fh ? `Δcream ${fh.cream.br - fb.cream.br}, Δrings ${fh.rings.br - fb.rings.br} (|Δ| ≤ 7)` : 'missing');
} else {
  gate('PROT-FACE', fb && faceBand(fb.cream.br, -58, -30) && faceBand(fb.rings.br, 5, 45)
    ? (faceBand(fh?.cream.br, -58, -30) && faceBand(fh?.rings.br, 5, 45)) : null,
    fh ? `hold cream ${fh.cream.br}, rings ${fh.rings.br} (VOID-INSTRUMENT if CAL-FACE-BASE failed)` : 'missing');
}

const td = rows.find((r) => r.shot === 'temple' && r.cond === 'HOLDDIFF');
gate('PROT-ARCH', td ? td.total <= 2000 && td.corner === 0 : null,
  td ? `total ${td.total}, corners ${td.corner}, bbox ${JSON.stringify(td.bbox)}` : 'missing');
const nd = rows.find((r) => r.shot === 'night' && r.cond === 'HOLDDIFF');
gate('PROT-NIGHT (numeric)', nd ? nd.brMed >= -10 && nd.corner === 0 : null,
  nd ? `brMed ${nd.brMed}, corners ${nd.corner} — LOOK gate EYEBALL-REQUIRED (prose, binding)` : 'missing');

const hnf = R('hero', 'holdnf');
if (hh && hnf) console.log(`\nREPORT joint arm: hero hold hueB ${hh.hueB.toFixed(1)} vs hold+nf ${hnf.hueB.toFixed(1)} — fill leg adds ${circdiff(hnf.hueB, hh.hueB).toFixed(1)}°`);

console.log(`\n${voided.length} VOID · ${failed.length} FAIL · ${passed.length} PASS`);
console.log(voided.length ? `OUTCOME: NO-SHIP — VOID(${voided[0].split(':')[0]}) [ship requires every bar held]`
  : failed.length ? 'OUTCOME: see failed bars' : 'OUTCOME: all numeric bars held — SHIP pending the LOOK prose gate');
