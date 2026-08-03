/**
 * Closed form for the boosted-shoulder curve, so it can go in GLSL with no integration.
 *
 *   above the gate:  newpoly = P1 * (poly/P1)^b          (log-slope multiplied by exactly b)
 *   below the gate:  newpoly = poly * k,  k = (poly(xLo)/P1)^(b-1)   (constant scale, no crush)
 *   joined with a smoothstep in x so there is no slope kink to contour on.
 *
 * b = 1 makes both branches identically poly, so the shipped look is bit-exact at the default.
 */
import { displayL, G, agxShipped } from './tonecurve.mjs';

const P1 = agxShipped(1);
const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function shoulder(b, xLo = 0.60, xHi = 0.86) {
  const k = Math.pow(Math.max(agxShipped(xLo), 1e-9) / P1, b - 1);
  return (x) => {
    const p = agxShipped(x);
    const lo = p * k;
    const hi = P1 * Math.pow(Math.max(p, 1e-9) / P1, b);
    return lo + (hi - lo) * smoothstep(xLo, xHi, x);
  };
}

{ // b=1 must be bit-identical
  const c = shoulder(1); let worst = 0;
  for (let x = 0; x <= 1; x += 0.002) worst = Math.max(worst, Math.abs(c(x) - agxShipped(x)));
  console.log(`\nsanity: b=1 identical to shipped, max |err| ${worst.toExponential(2)}  ${worst < 1e-12 ? 'OK (exact)' : worst < 1e-6 ? 'OK' : 'FAIL'}`);
}

console.log('\nmonotonicity + ceiling:');
for (const b of [1.2, 1.4, 1.5, 1.6, 1.8, 2.0]) {
  const c = shoulder(b);
  let ok = true, prev = -1, max = 0;
  for (let x = 0; x <= 1; x += 0.0005) { const v = c(x); if (v < prev - 1e-9) ok = false; prev = v; max = Math.max(max, v); }
  console.log(`  b ${b.toFixed(2)}  ${ok ? 'monotone' : 'NON-MONOTONE  REJECT'}   max poly ${max.toFixed(4)} ${max <= 1.0005 ? '(within white)' : '(OVERSHOOTS WHITE)'}`);
}

const SAND = 0.9338, MID = 0.30, SHADOW = 0.045, DEEP = 0.012, SKY = 7;
const pts = { sand: SAND, mid: MID, shadow: SHADOW, deep: DEEP, sky: SKY };
const shipL = Object.fromEntries(Object.entries(pts).map(([k2, v]) => [k2, displayL([v, v, v])]));

console.log('\n=== closed-form shoulder: the shipping candidates ===');
console.log('   b    G@sand  xG    L(sand)  L(mid)  L(shadow) L(deep)  L(sky)');
console.log(`  ship  ${G(SAND).toFixed(3)}   1.00   ${shipL.sand.toFixed(1)}   ${shipL.mid.toFixed(1)}   ${shipL.shadow.toFixed(1)}    ${shipL.deep.toFixed(1)}    ${shipL.sky.toFixed(1)}`);
for (const b of [1.2, 1.35, 1.5, 1.75, 2.0]) {
  const o = { curve: shoulder(b) };
  const g = G(SAND, o);
  const L = Object.fromEntries(Object.entries(pts).map(([k2, v]) => [k2, displayL([v, v, v], o)]));
  console.log(`  ${b.toFixed(2)}  ${g.toFixed(3)}   ${(g / G(SAND)).toFixed(2)}   ${L.sand.toFixed(1)}   ${L.mid.toFixed(1)}   ${L.shadow.toFixed(1)}    ${L.deep.toFixed(1)}    ${L.sky.toFixed(1)}`);
}

console.log('\n=== grey ramp, shipped vs b=1.5 candidate ===');
const cand = { curve: shoulder(1.5) };
console.log('  scene    L ship   L cand    dL     G ship  G cand   xG');
for (const s of [0.012, 0.02, 0.045, 0.08, 0.18, 0.30, 0.50, 0.72, 0.93, 1.4, 2.0, 3.0, 5.0, 7.0]) {
  const a = displayL([s, s, s]), bb = displayL([s, s, s], cand);
  console.log(`  ${String(s).padStart(6)}  ${a.toFixed(1).padStart(6)}  ${bb.toFixed(1).padStart(6)}  ${(bb - a).toFixed(1).padStart(6)}   ${G(s).toFixed(3)}   ${G(s, cand).toFixed(3)}   ${(G(s, cand) / G(s)).toFixed(2)}`);
}
