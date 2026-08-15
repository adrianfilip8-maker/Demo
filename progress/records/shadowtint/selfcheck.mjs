/**
 * selfcheck.mjs — prove invchain.mjs inverts tonecurve.mjs's INDEPENDENT forward chain.
 * A misparse of any matrix, EV bound or grade constant fails this.
 */
import { grade } from '../tonecurve.mjs';
import { unGrade, TUNE } from './invchain.mjs';

let worst = 0, worstAt = null, n = 0, skipped = 0, flagged = 0;
const errs = [];
const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();

// A grid that deliberately over-samples the dark, low-red, blue-dominant corner this
// investigation lives in, plus 3000 random HDR colours.
const grid = [];
for (const r of [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.3, 1.0, 3.0])
  for (const g of [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.3, 1.0, 3.0])
    for (const b of [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.3, 1.0, 3.0]) grid.push([r, g, b]);
for (let i = 0; i < 3000; i++) grid.push([rnd() ** 3 * 4, rnd() ** 3 * 4, rnd() ** 3 * 4]);

for (const c of grid) {
  const D = grade(c);
  if (D.some((x) => x >= 254.5 || x <= 0.5)) { skipped++; continue; }   // clipped: not invertible
  const { scene, flags } = unGrade(D);
  if (flags.length) { flagged++; continue; }     // the map is genuinely non-invertible there, and it SAYS so
  const back = grade(scene);
  const e = Math.max(...back.map((v, i) => Math.abs(v - D[i])));
  n++; errs.push(e);
  if (e > worst) { worst = e; worstAt = { c, D }; }
}
errs.sort((a, b) => a - b);
console.log(`self-check I  ${n} colours inverted clean (${skipped} clipped, ${flagged} self-flagged non-invertible)`);
console.log(`self-check I  |grade(unGrade(D)) - D| p50 ${errs[(n * 0.5) | 0].toExponential(2)}  ` +
  `p99 ${errs[(n * 0.99) | 0].toExponential(2)}  max ${worst.toExponential(2)} display L  ${worst < 0.01 ? 'OK' : 'FAIL'}`);
if (worst >= 0.01) { console.log('  worst at', worstAt); throw new Error('inverse does not invert the forward chain'); }

console.log(`\nparsed TUNE: exposure ${TUNE.exposure} contrast ${TUNE.contrast} sat ${TUNE.saturation} ` +
  `split ${TUNE.splitStrength} range [${TUNE.splitRange}] lift [${TUNE.lift}] gain [${TUNE.gain}] ` +
  `vignette ${TUNE.vignette} grain ${TUNE.grain} shoulder ${TUNE.toneShoulder} dispChromaHold ${TUNE.dispChromaHold}`);
