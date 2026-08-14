/**
 * basketvary-score.mjs — scores PREREG-basketvary's seven registered rows against the sealed
 * baseline `base-geom.json`. Offline, no lock, no boot. FAIL-CLOSED: any missing row is a FAIL.
 *
 *   node progress/records/props1/basketvary-score.mjs progress/records/props1/cand-basketvary-geom.json
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
const HERE = import.meta.dirname;
const base = JSON.parse(readFileSync(path.join(HERE, 'base-geom.json'), 'utf8'));
const cand = JSON.parse(readFileSync(process.argv[2] || path.join(HERE, 'cand-basketvary-geom.json'), 'utf8'));

const rows = [];
const row = (id, what, baseV, candV, ok, req) => rows.push({ id, what, baseV, candV, ok: !!ok, req });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

row('A1  CLONE', 'max identical coils in any registered shot', base.A.maxIdenticalAnyShot, cand.A.maxIdenticalAnyShot, cand.A.maxIdenticalAnyShot <= 2, '<= 2');
row('A1b CLONE', 'max identical coils in courtyard', base.A.perShot.courtyard.maxIdentical, cand.A.perShot.courtyard.maxIdentical, cand.A.perShot.courtyard.maxIdentical <= 2, '<= 2');
row('A2  VARIETY', 'bbox-diagonal CV', +base.A.diagCV.toFixed(4), +cand.A.diagCV.toFixed(4), cand.A.diagCV >= 0.12, '>= 0.12');
row('A2b VARIETY', 'distinct silhouette signatures', Object.keys(base.A.sigs).length, Object.keys(cand.A.sigs).length, Object.keys(cand.A.sigs).length >= 5, '>= 5');
row('A3  DENSITY', 'coils placed', base.A.count, cand.A.count, cand.A.count <= base.A.count, `<= ${base.A.count}`);
const volOK = cand.PROT.colliders === base.PROT.colliders && eq(cand.PROT.colliderTags, base.PROT.colliderTags)
  && cand.PROT.decals === base.PROT.decals && cand.PROT.fx === base.PROT.fx && cand.PROT.lights === base.PROT.lights;
row('P-A1 VOLUMES', 'colliders+tags / decals / fx / lights',
  `${base.PROT.colliders}/${base.PROT.decals}/${base.PROT.fx}/${base.PROT.lights}`,
  `${cand.PROT.colliders}/${cand.PROT.decals}/${cand.PROT.fx}/${cand.PROT.lights}`, volOK, 'all EXACTLY equal');
row('P-A2 BUDGET', 'prop triangles', base.PROT.propTris, cand.PROT.propTris, cand.PROT.propTris <= base.PROT.propTris, `<= ${base.PROT.propTris}`);

let pass = true;
console.log('PREREG-basketvary — seal (a)\n');
for (const r of rows) {
  if (!r.ok) pass = false;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(13)} ${String(r.what).padEnd(42)} base ${String(r.baseV).padEnd(12)} cand ${String(r.candV).padEnd(12)} req ${r.req}`);
}
console.log(`\nper-shot identical-coil counts (cand): ${Object.entries(cand.A.perShot).filter(([, v]) => v.n).map(([k, v]) => `${k} ${v.n}/${v.maxIdentical}`).join(' · ')}`);
console.log(`\nVERDICT: ${pass ? 'PASS — ship-write is `git apply progress/records/props1/cand-basketvary.patch`' : 'FAIL — src/** unchanged (fail-closed)'}`);
process.exit(pass ? 0 : 1);
