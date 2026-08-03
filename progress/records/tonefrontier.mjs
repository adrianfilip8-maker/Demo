/**
 * The frontier: how much highlight detail can ANY bounded tone curve deliver, and what does it
 * cost in brightness?
 *
 * The governing identity is the fundamental theorem of calculus, not a curve-shape argument:
 *
 *     mean over [a,b] of  d(ln poly)/dx   =  ( ln poly(b) - ln poly(a) ) / (b - a)
 *
 * and G is proportional to d(ln poly)/dx (G ~= 0.0802 * poly'/poly on the grey axis; see below,
 * verified against the full chain). So the MEAN G across any band of the image is fixed entirely
 * by the curve's values at the two ENDS of that band. No reshaping inside the band can change it.
 *
 * Since poly is bounded above by ~1 (display white), the only way to raise mean G across the
 * highlight band is to LOWER the curve at the bottom of that band — i.e. to darken the upper
 * mid-tones. This is the same trade as the exposure cut §70.2 sized and rejected, but shaped, so
 * it is much cheaper. This file measures how much cheaper.
 */
import { displayL, G, agxShipped, grade } from './tonecurve.mjs';

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const dPoly = (x) => { const x2 = x * x, x4 = x2 * x2; return 6 * 15.5 * x4 * x - 5 * 40.14 * x4 + 4 * 31.96 * x2 * x - 3 * 6.868 * x2 + 2 * 0.4298 * x + 0.1191; };
const POLY1 = agxShipped(1);

/**
 * Boosted-shoulder family. Multiplies the curve's LOG-slope by `b` above `xLo` (ramped in over
 * [xLo,xHi]), integrating down from the fixed top anchor poly(1) so the curve still lands on
 * display white. b = 1 reproduces the shipped curve exactly.
 */
function makeCurve(b, xLo = 0.62, xHi = 0.78) {
  const N = 4096, xs = new Float64Array(N + 1), ys = new Float64Array(N + 1);
  // integrate ln poly downward from x=1
  let lnp = Math.log(POLY1);
  xs[N] = 1; ys[N] = POLY1;
  for (let i = N; i > 0; i--) {
    const x = i / N, xm = (i - 0.5) / N;
    const beta = 1 + (b - 1) * smoothstep(xLo, xHi, xm);
    const slope = dPoly(xm) / Math.max(agxShipped(xm), 1e-9);   // d(ln poly)/dx at midpoint
    lnp -= beta * slope * (1 / N);
    xs[i - 1] = (i - 1) / N; ys[i - 1] = Math.exp(lnp);
  }
  return (x) => {
    if (x <= 0) return ys[0];
    if (x >= 1) return ys[N];
    const t = x * N, i = Math.floor(t), f = t - i;
    return ys[i] * (1 - f) + ys[i + 1] * f;
  };
}

// sanity: b=1 must reproduce the shipped polynomial
{
  const c1 = makeCurve(1);
  let worst = 0;
  for (let x = 0.05; x <= 1; x += 0.01) worst = Math.max(worst, Math.abs(c1(x) - agxShipped(x)));
  console.log(`\nsanity: b=1 reproduces shipped polynomial, max |err| ${worst.toExponential(2)}  ${worst < 2e-3 ? 'OK' : 'FAIL'}`);
}

const SAND = 0.9338;          // scene radiance of lit sandstone (reads L 202.2 shipped)
const SHADOW = 0.045;         // shadowed architecture, ~L 65
const MID = 0.30;             // mid-tone

console.log('\n=== the frontier: buying highlight G with brightness ===');
console.log('   b    G@sand  xG    L(sand)  dL     L(mid)  dL     L(shadow) dL    L(sky 7)');
const base = { Gs: G(SAND), Ls: displayL([SAND, SAND, SAND]), Lm: displayL([MID, MID, MID]), Lsh: displayL([SHADOW, SHADOW, SHADOW]), Lsky: displayL([7, 7, 7]) };
console.log(` ship  ${base.Gs.toFixed(3)}   1.00  ${base.Ls.toFixed(1)}    -      ${base.Lm.toFixed(1)}   -      ${base.Lsh.toFixed(1)}    -     ${base.Lsky.toFixed(1)}`);
for (const b of [1.15, 1.3, 1.5, 1.75, 2.0, 2.5]) {
  const curve = makeCurve(b);
  const o = { curve };
  const g = G(SAND, o), Ls = displayL([SAND, SAND, SAND], o), Lm = displayL([MID, MID, MID], o),
    Lsh = displayL([SHADOW, SHADOW, SHADOW], o), Lsky = displayL([7, 7, 7], o);
  console.log(` ${b.toFixed(2)}  ${g.toFixed(3)}   ${(g / base.Gs).toFixed(2)}  ${Ls.toFixed(1)}  ${(Ls - base.Ls).toFixed(1).padStart(6)}   ${Lm.toFixed(1)}  ${(Lm - base.Lm).toFixed(1).padStart(6)}   ${Lsh.toFixed(1)}  ${(Lsh - base.Lsh).toFixed(1).padStart(6)}   ${Lsky.toFixed(1)}`);
}

console.log('\n=== for comparison, the two levers §70.2 already sized ===');
for (const e of [0.95, 0.60, 0.40, 0.182]) {
  const o = { exposure: e };
  console.log(` exposure ${e.toFixed(3)}  G@sand ${G(SAND, o).toFixed(3)} (x${(G(SAND, o) / base.Gs).toFixed(2)})  L(sand) ${displayL([SAND, SAND, SAND], o).toFixed(1)}  L(shadow) ${displayL([SHADOW, SHADOW, SHADOW], o).toFixed(1)}`);
}
for (const k of [1.08, 1.25]) {
  const o = { contrast: k };
  console.log(` contrast ${k.toFixed(2)}   G@sand ${G(SAND, o).toFixed(3)} (x${(G(SAND, o) / base.Gs).toFixed(2)})  L(sand) ${displayL([SAND, SAND, SAND], o).toFixed(1)}  L(shadow) ${displayL([SHADOW, SHADOW, SHADOW], o).toFixed(1)}`);
}

console.log('\n=== the ceiling, stated exactly ===');
console.log('mean G over a band depends ONLY on the curve at the band ends:');
const lo = 0.72, hi = 0.90;
const meanShip = (Math.log(agxShipped(hi)) - Math.log(agxShipped(lo))) / (hi - lo);
const meanMax = (Math.log(1.0) - Math.log(agxShipped(lo))) / (hi - lo);
console.log(`  band x[${lo},${hi}] (display L ~190..244, where lit architecture lives)`);
console.log(`  shipped mean d(ln poly)/dx          ${meanShip.toFixed(3)}`);
console.log(`  ABSOLUTE MAX holding poly(${lo}) fixed  ${meanMax.toFixed(3)}  (= curve hits white at x=${hi} and is flat above)`);
console.log(`  i.e. sacrificing ALL highlight separation above scene ~4.4 buys only x${(meanMax / meanShip).toFixed(2)}`);
console.log(`  closing §70.2's x2.56 gap therefore REQUIRES lowering poly(${lo}) — there is no free curve.`);
