/* PREREG-inkwiden claims the cool leg's hue "moves by exactly zero" under a uniform scale.
   That is true of the SCALE and false after 8-bit quantisation, which is exactly the kind of
   overclaim this lane keeps making. Check it, and if it is wrong, pick the 8-bit triple that
   minimises the hue error at the target luma instead of the one that falls out of rounding. */
const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function hue(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return NaN;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
const sat = (r, g, b) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };

const COOL = [0x16, 0x10, 0x22];
const TARGET = 0.80 * 0.0474;
const k = TARGET / luma(...COOL);
const exact = COOL.map((x) => x * k);
const rounded = exact.map(Math.round);
console.log(`cool ${COOL.map((x) => x.toString(16).padStart(2, '0')).join('')}  hue ${hue(...COOL).toFixed(2)}  `
  + `sat ${sat(...COOL).toFixed(4)}  luma ${luma(...COOL).toFixed(4)}`);
console.log(`scale k = ${k.toFixed(5)}  exact ${exact.map((x) => x.toFixed(3)).join(', ')}`);
console.log(`rounded 0x${rounded.map((x) => x.toString(16).padStart(2, '0')).join('')}  `
  + `hue ${hue(...rounded).toFixed(2)}  sat ${sat(...rounded).toFixed(4)}  luma ${luma(...rounded).toFixed(4)}`);
console.log(`HUE ERROR from rounding: ${Math.abs(hue(...rounded) - hue(...COOL)).toFixed(3)} deg`);
console.log(`LUMA ERROR from rounding: ${(luma(...rounded) - TARGET).toFixed(5)} (target ${TARGET.toFixed(4)})`);

/* Search every 8-bit triple within +-3 of the exact scale for the one that minimises hue error,
   breaking ties on luma error. Small, exhaustive, no optimiser. */
let best = null;
for (let r = Math.max(0, rounded[0] - 3); r <= rounded[0] + 3; r++) {
  for (let g = Math.max(0, rounded[1] - 3); g <= rounded[1] + 3; g++) {
    for (let b = Math.max(0, rounded[2] - 3); b <= rounded[2] + 3; b++) {
      if (!(r || g || b)) continue;
      const dh = Math.abs(hue(r, g, b) - hue(...COOL));
      const dl = Math.abs(luma(r, g, b) - TARGET);
      if (dl > 0.004) continue;                     // stay near the sized luma
      if (!best || dh < best.dh - 1e-9 || (Math.abs(dh - best.dh) < 1e-9 && dl < best.dl)) {
        best = { r, g, b, dh, dl };
      }
    }
  }
}
console.log(`\nbest 8-bit triple within +-3 and 0.004 L of target: `
  + `0x${[best.r, best.g, best.b].map((x) => x.toString(16).padStart(2, '0')).join('')}  `
  + `hue ${hue(best.r, best.g, best.b).toFixed(2)} (err ${best.dh.toFixed(3)} deg)  `
  + `sat ${sat(best.r, best.g, best.b).toFixed(4)}  luma ${luma(best.r, best.g, best.b).toFixed(4)}`);
console.log(`\nfor scale: the warm leg 0x1a1210 is hue ${hue(0x1a, 0x12, 0x10).toFixed(2)} deg, `
  + `so the two legs must stay ~248 deg apart`);
