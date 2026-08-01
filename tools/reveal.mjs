/* How straight is a reveal? Rebuilds the two shells that carry flagstaff niches with the
   `_spans` hook and reports, per course, the gap between the opening's far jamb and the first
   block past it. A mason restarts the run ON the jamb, so this should be ~0. */
import { rng, WORLD_SEED } from '../src/core/Rand.js';
import * as K from '../src/world/Kit.js';

const CASES = [
  { n: 'inner-pylon south stage', w: 21.4, d: 3.9, h: 24.0, batter: 0.105, course: 0.66,
    thick: 1.0, blockLen: [1.4, 2.5], recess: 0.06, chipChance: 0.2, gapChance: 0.04,
    buried: 0.5, hollow: true, sag: 0.17, windFace: 0, windK: 2.2, bow: 0.20, drift: 0.14,
    openings: [0, 1].flatMap((f) => [
      { face: f, a0: -3.6, a1: 3.6, y0: -1, y1: 8.6 },
      { face: f, a0: -7.4, a1: -6.0, y0: 1.4, y1: 21 },
      { face: f, a0: 6.0, a1: 7.4, y0: 1.4, y1: 21 },
    ]) },
  { n: 'entry pylon (east)', w: 11, d: 6, h: 26, batter: 0.105, course: 0.66, thick: 1.05,
    blockLen: [1.4, 2.5], recess: 0.06, chipChance: 0.19, gapChance: 0.05, buried: 0.55,
    hollow: true, sag: 0.18, windFace: 0, bow: 0.22, drift: 0.15,
    openings: [
      { face: 0, a0: -3.9, a1: -2.9, y0: 1.2, y1: 22 },
      { face: 0, a0: 2.9, a1: 3.9, y0: 1.2, y1: 22 },
      { face: 1, a0: -1.6, a1: 1.6, y0: -1, y1: 4.2 },
    ] },
];

for (const c of CASES) {
  const spans = [];
  K.masonryShell({ ...c, rng: rng(WORLD_SEED ^ 0x7a11), _spans: spans });
  console.log(`\n${c.n}`);
  for (const op of c.openings) {
    if (op.a1 - op.a0 > 3) continue;                    // gates handled elsewhere; niches only
    const near = [], far = [];
    const byCourse = new Map();
    for (const s of spans) {
      if (s.f !== op.face) continue;
      if (!byCourse.has(s.c)) byCourse.set(s.c, []);
      byCourse.get(s.c).push(s);
    }
    for (const [, list] of byCourse) {
      const sc = list[0].oScale;
      const oa0 = op.a0 * sc, oa1 = op.a1 * sc;
      // does this course even reach the niche?
      let bestNear = null, bestFar = null;
      for (const s of list) {
        if (s.s1 <= oa0 + 1e-6 && (bestNear === null || s.s1 > bestNear)) bestNear = s.s1;
        if (s.s0 >= oa1 - 1e-6 && (bestFar === null || s.s0 < bestFar)) bestFar = s.s0;
      }
      if (bestNear !== null) near.push(oa0 - bestNear);
      if (bestFar !== null) far.push(bestFar - oa1);
    }
    const stat = (a) => a.length
      ? `n=${String(a.length).padStart(2)} mean=${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3)}m max=${Math.max(...a).toFixed(3)}m`
      : 'n=0';
    console.log(`  face ${op.face} a[${op.a0}, ${op.a1}]  near jamb ${stat(near)}   far jamb ${stat(far)}`);
  }
}
