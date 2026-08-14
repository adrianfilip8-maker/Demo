/**
 * colossus-score.mjs — scores PREREG-colossus' seven NUMERIC rows against the sealed baseline.
 * The eighth row (LOOK) is a human read of the candidate `courtyard` frame and is recorded by
 * RESULT-colossus, not by this file. FAIL-CLOSED.
 *
 *   node progress/records/props1/colossus-score.mjs progress/records/props1/cand-colossus-geom.json [both-geom.json]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
const HERE = import.meta.dirname;
const base = JSON.parse(readFileSync(path.join(HERE, 'base-geom.json'), 'utf8'));
const cand = JSON.parse(readFileSync(process.argv[2] || path.join(HERE, 'cand-colossus-geom.json'), 'utf8'));
/* The cumulative clause of C5 needs the LANE's tree (seals (a)+(c) together), not this seal's. */
let both = null;
try { both = JSON.parse(readFileSync(process.argv[3] || path.join(HERE, 'cand-both-geom.json'), 'utf8')); } catch { /* optional */ }

const rows = [];
const row = (id, what, b, c, ok, req) => rows.push({ id, what, b, c, ok: !!ok, req });
const both2 = (f) => [cand.C.west[f], cand.C.east[f]];
const baseB = (f) => [base.C.west[f], base.C.east[f]];

row('C1  SILHOUETTE', 'infW (width-profile inflections)', baseB('infW').join('/'), both2('infW').join('/'), cand.C.west.infW >= 6 && cand.C.east.infW >= 6, '>= 6 both');
row('C2  RELIEF', 'zfSd over the seat band (m)', baseB('zfSd').join('/'), both2('zfSd').join('/'), cand.C.west.zfSd >= 1.10 && cand.C.east.zfSd >= 1.10, '>= 1.10 both');
row('C3a KNEE', 'landable knee tops at y 4.35-4.70', baseB('kneeTops').join('/'), both2('kneeTops').join('/'), cand.C.west.kneeTops >= 2 && cand.C.east.kneeTops >= 2, '>= 2 both');
row('C3b REACH', 'knee front minus hip front (m)', baseB('kneeReach').join('/'), both2('kneeReach').join('/'), cand.C.west.kneeReach >= 1.60 && cand.C.east.kneeReach >= 1.60, '>= 1.60 both');
const reach = cand.C.west.kneeLedgeCoversKnee && cand.C.east.kneeLedgeCoversKnee && (cand.PROT.colliderTags.ledge ?? 0) >= 90;
row('C3c REACHABLE', 'ledge collider covers a knee top; ledge count',
  `${base.C.west.kneeLedgeCoversKnee}/${base.C.east.kneeLedgeCoversKnee} ${base.PROT.colliderTags.ledge}`,
  `${cand.C.west.kneeLedgeCoversKnee}/${cand.C.east.kneeLedgeCoversKnee} ${cand.PROT.colliderTags.ledge}`, reach, 'TRUE both, ledge >= 90');
row('C4  ASYMMETRY', 'pair width-profile L1 (m)', base.C.pairProfileL1, cand.C.pairProfileL1, cand.C.pairProfileL1 >= 0.08, '>= 0.08');
const dSeal = cand.PROT.propTris - base.PROT.propTris;
const dLane = both ? both.PROT.propTris - base.PROT.propTris : null;
row('C5  BUDGET', 'prop triangles: seal delta / lane delta', base.PROT.propTris, `${cand.PROT.propTris} (${dSeal >= 0 ? '+' : ''}${dSeal}) / lane ${dLane === null ? 'n/a' : (dLane >= 0 ? '+' : '') + dLane}`,
  dSeal <= 1600 && dLane !== null && dLane <= 0, 'seal <= +1600 AND lane (a)+(c) <= 0');

let pass = true;
console.log('PREREG-colossus — seal (c), NUMERIC rows (LOOK is scored in RESULT-colossus)\n');
for (const r of rows) {
  if (!r.ok) pass = false;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(14)} ${String(r.what).padEnd(40)} base ${String(r.b).padEnd(16)} cand ${String(r.c).padEnd(30)} req ${r.req}`);
}
console.log(`\nVERDICT (numeric): ${pass ? 'PASS — LOOK gate is now the remaining binding condition' : 'FAIL — src/** unchanged, no LOOK claimed (fail-closed)'}`);
process.exit(pass ? 0 : 1);
