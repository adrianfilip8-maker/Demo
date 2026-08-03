/**
 * Finding #10, the half routed to SHADING: "its emissive clips to neutral white, losing the
 * flame hue", and GEOMETRY reports the fixed brazier's coals rendering "pale grey-cream rather
 * than fire".
 *
 * This needs no capture. A saturated emissive losing its hue at high radiance is a property of
 * the shipped grade+tonemap, and the chain model is now validated to 0.35 L against the row at
 * PostFX.js:524 and to 0 of 255 against the driver (RESULT-tone1 sections 1 and 4).
 *
 * WHAT IS NOT MODELLED (§11): bloom's spatial gather, which ADDS energy on top of these values
 * and therefore pushes the pixel further along exactly the axis measured here; and the additive
 * shaft/dust overlays. So every desaturation figure below is a LOWER bound on what the frame does.
 */
import { grade } from './tonecurve.mjs';
import { shoulder } from './toneclosed.mjs';

const EMBER = 0xff6a20, EMBER_I = 2.4;
const FLAME = 0xffa040, FLAME_I = 3.0;
const srgb2lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];

// display-space chroma + hue, the quantities "reads as fire" vs "reads as grey-cream" turn on
function hueChroma(rgb) {
  const [r, g, b] = rgb.map((x) => x / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-9) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: mx < 1e-9 ? 0 : d / mx, L: 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] };
}

for (const [name, hex, inten] of [['ember', EMBER, EMBER_I], ['flame', FLAME, FLAME_I]]) {
  const alb = hex2lin(hex);
  const authored = hueChroma(alb.map((x) => x * 255));
  console.log(`\n=== ${name}  #${hex.toString(16)}  emissiveIntensity ${inten} ===`);
  console.log(`authored hue ${authored.h.toFixed(1)}deg  sat ${authored.s.toFixed(3)}`);
  console.log('  scene mult   display RGB        hue     sat     L      sat kept');
  for (const k of [0.25, 0.5, 1, inten, 2 * inten, 4 * inten, 8 * inten]) {
    const scene = alb.map((x) => x * k);
    const d = grade(scene).map((x) => Math.round(x));
    const hc = hueChroma(d);
    const tag = Math.abs(k - inten) < 1e-9 ? '  <- shipped' : '';
    console.log(`  ${String(k.toFixed(2)).padStart(9)}   ${String(d).padEnd(16)} ${hc.h.toFixed(1).padStart(6)}  ${hc.s.toFixed(3)}  ${hc.L.toFixed(1).padStart(5)}   ${(hc.s / authored.s * 100).toFixed(0)}%${tag}`);
  }
}

console.log('\n=== does the tone shoulder help or hurt the flame hue? ===');
console.log('(it lowers the curve in the highlights, so a clipping emissive should retain more chroma)');
for (const [name, hex, inten] of [['ember', EMBER, EMBER_I], ['flame', FLAME, FLAME_I]]) {
  const alb = hex2lin(hex);
  const a0 = hueChroma(alb.map((x) => x * 255));
  console.log(`\n  ${name}:`);
  for (const b of [1.0, 1.2, 1.5]) {
    const opt = b === 1.0 ? {} : { curve: shoulder(b) };
    const row = [inten, 2 * inten, 4 * inten].map((k) => {
      const hc = hueChroma(grade(alb.map((x) => x * k), opt).map((x) => Math.round(x)));
      return `x${k.toFixed(1)}: sat ${hc.s.toFixed(3)} (${(hc.s / a0.s * 100).toFixed(0)}%) L ${hc.L.toFixed(0)}`;
    });
    console.log(`    b=${b.toFixed(2)}   ${row.join('   ')}`);
  }
}
