/* normmodel.mjs — derive the normalisation BEFORE the candidate exists (§141.1).
   Reuses the census-corrected inputs from progress/records/specmodel.mjs. */
import { displayL } from '/home/user/Demo/progress/records/tonecurve.mjs';
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const SUN = hex2lin(0xffd9a0), keyRad = SUN.map((v) => v * 3.30);
const SPECCOL = hex2lin(0xfffbe8);

/* census-corrected: rgh = ormG (material.roughness = 1.0 for every mapped material) */
const M = [
  ['gold_leaf',          0xe8b942, 0.95, 110, 0.22, 0.85, 14],
  ['props gold (coins)', 0xe8b942, 0.90,  96, 0.28, 0.85,  6],
  ['bronze_dark',        0x6e5a34, 0.62,  72, 0.42, 0.85,  3],
  ['hieroglyph_gilded',  0xdcae5e, 0.55,  64, 0.55, 0.85,  4],
  ['granite_pink',       0xa9705c, 0.42,  62, 0.48, 0,     3],
  ['limestone_polished', 0xe0d0a8, 0.32,  46, 0.62, 0,     2],
  ['slydlrig:mesh',      0x2c4a7a, 0.25,  32, 0.62, 0,     7],
  ['ceiling_stars',      0x1f4f96, 0.20,  30, 0.80, 0.85,  4],
  ['plaster_painted',    0xe4d3ab, 0.18,  26, 0.78, 0,     2],
  ['hieroglyph_wall',    0xd6a874, 0.16,  24, 0.86, 0,     4],
  ['sandstone_block',    0xc9915a, 0.14,  20, 0.93, 0,     3],
  ['paving_courtyard',   0xcfa068, 0.10,  16, 0.95, 0,    16],
  ['sandstone_worn',     0xb8845a, 0.08,  14, 0.97, 0,     5],
  ['sand_ring',          0xcfa068, 0.06,  12, 0.62, 0,     4],
  ['mudbrick',           0x9a6a44, 0.05,  10, 0.99, 0,     3],
  ['pyramid',            0xcfa068, 0.04,   8, 0.62, 0,     2],
];

const glossPof = (g, r) => Math.max(g * (1 - 0.6 * Math.min(Math.max(r, 0.03), 1)), 4.0);

function peak(us, g, r, m, alb, key, normF) {
  const rgh = Math.min(Math.max(r, 0.03), 1.0);
  const specAmt = us * (1 - 0.75 * rgh) * (1 + 2.4 * m);
  const tint = [0, 1, 2].map((i) => SPECCOL[i] + (alb[i] * 2.0 + SPECCOL[i] * 0.25 - SPECCOL[i]) * m);
  const L = key ? keyRad : [1, 1, 1];
  return [0, 1, 2].map((i) => tint[i] * L[i] * specAmt * 1.35 * normF);
}

const FORMS = [
  ['NOW',            (p) => 1,                  false],
  ['key only',       (p) => 1,                  true],
  ['norm ref0 (n+8)/8', (p) => (p + 8) / 8,     false],
  ['norm ref0 x key',(p) => (p + 8) / 8,        true],
  ['norm ref14',     (p) => (p + 8) / (14 + 8), false],
  ['norm ref14 xkey',(p) => (p + 8) / (14 + 8), true],
  ['sqrt ref0',      (p) => Math.sqrt((p + 8) / 8), false],
  ['sqrt ref0 xkey', (p) => Math.sqrt((p + 8) / 8), true],
];

console.log('glossP and the normalisation factor each form would apply\n');
console.log('material              n  rgh  glossP   halfAng  |  (n+8)/8   /ref14   sqrt(n+8)/8');
for (const [nm, hex, us, g, r, m, cnt] of M) {
  const p = glossPof(g, r);
  const ang = Math.acos(Math.pow(0.52, 1 / p)) * 180 / Math.PI;
  console.log(`${nm.padEnd(20)} ${String(cnt).padStart(2)} ${r.toFixed(2)} ${p.toFixed(1).padStart(6)}  ${ang.toFixed(1).padStart(6)}   |  ${((p + 8) / 8).toFixed(2).padStart(6)}  ${((p + 8) / 22).toFixed(2).padStart(6)}  ${Math.sqrt((p + 8) / 8).toFixed(2).padStart(8)}`);
}

for (const [label, f, key] of FORMS) {
  console.log(`\n=== ${label} ===`);
  console.log('material            spec scene  spec L   lit total L   d vs NOW');
  for (const [nm, hex, us, g, r, m] of M) {
    const alb = hex2lin(hex), p = glossPof(g, r);
    const v = peak(us, g, r, m, alb, key, f(p));
    const v0 = peak(us, g, r, m, alb, false, 1);
    const base = [0, 1, 2].map((i) => alb[i] * keyRad[i] * (m ? 0.20 : 1.0));
    const tot = [0, 1, 2].map((i) => base[i] + v[i]);
    const tot0 = [0, 1, 2].map((i) => base[i] + v0[i]);
    console.log(`${nm.padEnd(20)} ${lum(v).toFixed(3).padStart(9)} ${displayL(v).toFixed(0).padStart(6)} ${displayL(tot).toFixed(1).padStart(11)} ${(displayL(tot) - displayL(tot0)).toFixed(1).padStart(10)}`);
  }
}

/* how much scene radiance is needed to reach each display milestone */
console.log('\nscene radiance needed for a grey to reach display L:');
for (const T of [200, 230, 240, 250, 254]) {
  let s = 0; for (let x = 0.01; x < 400; x *= 1.0005) { if (displayL([x, x, x]) >= T) { s = x; break; } }
  console.log(`   L ${T}  needs scene ${s ? s.toFixed(3) : '>400'}`);
}
