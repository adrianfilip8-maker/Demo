/**
 * target.mjs — what the seal has to hit, expressed where its lever lives.
 *
 * The r13 acceptance target is stated in DISPLAY space ("345 -> ~218"). A SHADING lever cannot
 * be aimed there directly, so this converts it: hold the measured terminator's scene-linear
 * LUMINANCE fixed (a shadow-tint lever is a hue lever, not a brightness lever — the shipped
 * `shadHeld` renormalises to lum(shadTint) for exactly this reason, toon.glsl.js:753), rotate
 * the linear hue, and read the display hue and luminance that come out.
 *
 * That gives the seal (a) the linear R/G it must reach, and (b) the display-L drift it must
 * stay inside, which is what protects §7.3's "shadow still reads as shadow".
 */
import { grade } from '../tonecurve.mjs';
import { luma } from './invchain.mjs';
import { hsv, lum } from './measure.mjs';
import { hsv2rgb, hsvLin } from './space.mjs';

/* Measured on shots/r12/courtyard.png, right colossus, clean 10x10 patches, darkest 12%
   (table.mjs row "courtyard / colossus-R body all  DARK 12%"). */
const MEAS = [0.1350, 0.0361, 0.0422];
const Ltar = luma(MEAS);
console.log(`measured terminator scene-linear ${MEAS.join(' ')}  luma ${Ltar.toFixed(5)}  ` +
  `R/G ${(MEAS[0] / MEAS[1]).toFixed(2)}  displays at ${hsv(grade(MEAS)).h.toFixed(1)} / L ${lum(grade(MEAS)).toFixed(1)}\n`);
console.log(`hold that luma; sweep linear hue and HSV-sat; read the display back:`);
console.log(`  lin h  lin s | R/G   B/G  | display hex   h     s     L`);
for (const s of [0.30, 0.45, 0.60]) {
  for (const H of [190, 200, 210, 220, 230, 240]) {
    let c = hsv2rgb(H, s, 1);
    c = c.map((x) => x * (Ltar / luma(c)));
    const D = grade(c);
    console.log(`  ${String(H).padStart(5)}  ${s.toFixed(2)}  | ${(c[0] / c[1]).toFixed(2).padStart(5)} ${(c[2] / c[1]).toFixed(2).padStart(5)} | ` +
      `#${D.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}  ${hsv(D).h.toFixed(1).padStart(5)} ${hsv(D).s.toFixed(3)} ${lum(D).toFixed(1).padStart(5)}`);
  }
  console.log('');
}
console.log(`for reference, the three shadows the r13 critic PASSED, measured (table.mjs):`);
for (const [n, c] of [['kaykit floor', [0.0349, 0.0449, 0.0482]], ['hero floor L65', [0.0361, 0.0501, 0.0518]],
  ['dunes sand', [0.0280, 0.0380, 0.0389]], ['courtyard GROUND', [0.0144, 0.0277, 0.0329]]]) {
  const D = grade(c);
  console.log(`  ${n.padEnd(18)} lin ${c.join(' ')} h ${hsvLin(c).h.toFixed(0).padStart(3)} R/G ${(c[0] / c[1]).toFixed(2)} B/G ${(c[2] / c[1]).toFixed(2)}` +
    `  -> display h ${hsv(D).h.toFixed(1)} L ${lum(D).toFixed(1)}`);
}
