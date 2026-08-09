/**
 * supply.mjs — the ceiling of every additive term in `outgoingLight`, in scene radiance,
 * against the 2.237 that display L 230 requires.
 *
 *   outgoingLight = diff + sss + spec + metalEnv + rim + emissiveTerm   (toon.glsl.js:919)
 *
 * This is a CEILING calculation: every factor is set to its most favourable value, so each
 * number is an upper bound no pixel in the shipped game can exceed, not a typical value.
 */
import { displayL } from './tonecurve.mjs';

const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

let NEED = 0;
for (let s = 0.01; s < 40; s *= 1.0002) { if (displayL([s, s, s]) >= 230) { NEED = s; break; } }

const SUN = hex2lin(0xffd9a0), keyRad = SUN.map((v) => v * 3.30);
console.log(`display L 230 needs scene radiance ${NEED.toFixed(3)}   (keyRad luma ${lum(keyRad).toFixed(3)})\n`);

const rows = [];

/* --- diffuse key: alb * keyRad * key. key <= 1 (slyRamp clamps). Albedo-bounded. --- */
for (const [name, hex] of [['sandstone mid #c9915a', 0xc9915a], ['sandLight (§2.2)', 0xe8c9a0], ['pure white albedo', 0xffffff]]) {
  const a = hex2lin(hex);
  const v = [0, 1, 2].map((i) => a[i] * keyRad[i]);
  rows.push([`diff, full key, ${name}`, lum(v), displayL(v)]);
}

/* --- spec: specTint * (uSpec * (1-0.75*rgh) * specStep * sh * step(0.02,ndl))
       NOT multiplied by keyRad. specStep max = 1 + 0.35 = 1.35. rgh floor 0.03. --- */
{
  const specTint = hex2lin(0xfffbe8);           // PAL.goldSpec, non-metal branch
  const uSpec = 0.25, rgh = 0.03, specStep = 1.35;
  const amt = uSpec * (1 - 0.75 * rgh) * specStep;
  const v = specTint.map((c) => c * amt);
  rows.push([`spec CEILING (non-metal, uSpec 0.25, rgh 0.03)`, lum(v), displayL(v)]);
  // on metal: specAmt x3.4, specTint = alb*2 + specColor*0.25
  const alb = hex2lin(0xd4af37);
  const tintM = [0, 1, 2].map((i) => alb[i] * 2.0 + specTint[i] * 0.25);
  const vM = tintM.map((c) => c * uSpec * (1 - 0.75 * rgh) * 3.4 * specStep);
  rows.push([`spec CEILING (metal 1.0, gold albedo)`, lum(vM), displayL(vM)]);
}

/* --- rim: uRimColor * (uRim * uRimGain * rimBand * rimSil * shadeFloor * wrapRim) --- */
{
  const rimCol = hex2lin(0x7fd4ff);
  const v = rimCol.map((c) => c * 0.55 * 4.10);   // TUNE.rim x TUNE.rimGain, all masks at 1
  rows.push([`rim CEILING (rim 0.55 x rimGain 4.10)`, lum(v), displayL(v)]);
}

console.log('term                                              scene luma   display L   reaches 230?');
for (const [n, l, d] of rows) {
  console.log(`  ${n.padEnd(46)} ${l.toFixed(3).padStart(8)}   ${d.toFixed(1).padStart(8)}   ${l >= NEED ? 'YES' : 'no'}`);
}

/* --- realistic combinations on a lit sandstone pixel --- */
console.log('\ncombinations on a fully-lit sandstone wall:');
const alb = hex2lin(0xc9915a);
const base = [0, 1, 2].map((i) => alb[i] * keyRad[i]);
const specTint = hex2lin(0xfffbe8);
const specV = specTint.map((c) => c * 0.25 * (1 - 0.75 * 0.5) * 1.35);
const rimV = hex2lin(0x7fd4ff).map((c) => c * 0.55 * 4.10);
const combos = [
  ['diffuse only', base],
  ['diffuse + spec at its peak', [0, 1, 2].map((i) => base[i] + specV[i])],
  ['diffuse + rim at its peak', [0, 1, 2].map((i) => base[i] + rimV[i])],
  ['diffuse + spec + rim', [0, 1, 2].map((i) => base[i] + specV[i] + rimV[i])],
];
for (const [n, v] of combos) console.log(`  ${n.padEnd(32)} scene ${lum(v).toFixed(3).padStart(6)}   L ${displayL(v).toFixed(1).padStart(6)}`);

/* --- what if spec were coupled to keyRad, as a mirror image of the light physically is? --- */
console.log('\nCOUNTERFACTUAL — spec multiplied by keyRad (it is not, today):');
for (const rgh of [0.03, 0.25, 0.50]) {
  const amt = 0.25 * (1 - 0.75 * rgh) * 1.35;
  const v = [0, 1, 2].map((i) => specTint[i] * keyRad[i] * amt / lum(keyRad) * lum(keyRad));
  const vv = [0, 1, 2].map((i) => specTint[i] * amt * keyRad[i]);
  const tot = [0, 1, 2].map((i) => base[i] + vv[i]);
  console.log(`  rgh ${rgh.toFixed(2)}   spec alone scene ${lum(vv).toFixed(3).padStart(6)}  L ${displayL(vv).toFixed(1).padStart(6)}   |  diffuse+spec scene ${lum(tot).toFixed(3).padStart(6)}  L ${displayL(tot).toFixed(1)}`);
}
