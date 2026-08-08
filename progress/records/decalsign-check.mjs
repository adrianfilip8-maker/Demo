/**
 * PREREG-decalsign §6's "NOT COMPARABLE" gate, run against the capture's own report.
 *
 * Compares the decal centres the *live build* handed the vertex shader against the centres a
 * headless `Props` build queues offline. The seal phrased this as a screen-pixel agreement; it is
 * scored in WORLD metres instead, and the substitution is a correction rather than a loosening:
 * the in-page number is the projected polygon's CENTROID, which the vertex shader has already
 * pushed `reach * uPush` downwind, while the offline number is the instance CENTRE. Comparing
 * those two in pixels would be comparing two different quantities and would fail on a correct
 * build. World centres are the same quantity in both, and they are what the mask is derived from.
 *
 *   node progress/records/decalsign-check.mjs [path/to/report.json]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildLevel } from '../../tools/lvl.mjs';

const REPORT = process.argv[2] || path.resolve(import.meta.dirname, 'decalsign/report.json');
const r = JSON.parse(readFileSync(REPORT, 'utf8'));

const { P } = await buildLevel({ withProps: true });
const pend = P.decals._pending;
const offline = [];
for (let i = 0; i < pend.length / 5; i++) {
  offline.push([pend[i * 5], pend[i * 5 + 1], pend[i * 5 + 2], pend[i * 5 + 3], pend[i * 5 + 4]]);
}

console.log(`offline Props build queues ${offline.length} decals`);
console.log(`in-page projection returned ${r.projection.count} (only those in front of the camera)`);

let worst = 0, worstOf = null, matched = 0;
for (const p of r.polys) {
  if (p.key !== 'props') continue;
  let best = Infinity, bi = -1;
  for (let i = 0; i < offline.length; i++) {
    const o = offline[i];
    const d = Math.hypot(o[0] - p.world[0], o[1] - p.world[1], o[2] - p.world[2]);
    if (d < best) { best = d; bi = i; }
  }
  matched++;
  if (best > worst) { worst = best; worstOf = { p, o: offline[bi] }; }
}
console.log(`matched ${matched} in-frame props decals to their offline twin`);
console.log(`worst world-centre disagreement: ${worst.toFixed(4)} m`);
if (worstOf) console.log(`  in-page ${JSON.stringify(worstOf.p.world)}  offline ${worstOf.o.slice(0, 3).map((v) => +v.toFixed(2))}`);
console.log(worst < 0.01 ? 'COMPARABLE — the mask describes the decals the frame actually drew'
                         : 'NOT COMPARABLE — see PREREG §6');
