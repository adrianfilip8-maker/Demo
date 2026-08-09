/* Model the CREASE composite exactly as PostFX writes it, so a candidate can be sized by
   arithmetic instead of by taste. Terms transcribed from PostFX.js:1366-1379 and PARSED from the
   file rather than typed, so the model cannot drift from the shader:

     line  = edge.r * smoothstep(gateLo, gateHi, lum)
     ink   = min( mix(uInkCool, uInkWarm, smoothstep(mixLo, mixHi, lum)), c )   per channel
     c     = mix(c, ink, clamp(line,0,1) * uInkStrength)
     c    *= vig

   Everything is display-referred (displayColor()), so luma is linear in the components and a
   uniform scale of a hex scales its luma by the same factor while leaving hue EXACTLY alone --
   which is the constraint: 12 deg warm / 260 deg violet must survive (KNOWN_ISSUES 105.2). */
import { readFileSync } from 'node:fs';

const src = readFileSync('/home/user/Demo/src/render/PostFX.js', 'utf8');
const grab = (re, what) => { const m = src.match(re); if (!m) throw new Error(`could not parse ${what}`); return m; };
const WARM = parseInt(grab(/inkWarm:\s*0x([0-9a-fA-F]{6})/, 'inkWarm')[1], 16);
const COOL = parseInt(grab(/inkCool:\s*0x([0-9a-fA-F]{6})/, 'inkCool')[1], 16);
const STRENGTH = Number(grab(/inkStrength:\s*([0-9.]+)/, 'inkStrength')[1]);
const gate = grab(/line \*= smoothstep\(\s*([0-9.]+),\s*([0-9.]+), lum \)/, 'the lum gate');
const GATE = [Number(gate[1]), Number(gate[2])];
const mixr = grab(/mix\( uInkCool, uInkWarm, smoothstep\(\s*([0-9.]+),\s*([0-9.]+), lum \)/, 'the warm/cool mix');
const MIX = [Number(mixr[1]), Number(mixr[2])];
console.log(`parsed from PostFX.js: inkWarm 0x${WARM.toString(16)} inkCool 0x${COOL.toString(16)} `
  + `inkStrength ${STRENGTH} gate smoothstep(${GATE}) mix smoothstep(${MIX})`);

const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** One fully-inked pixel (edge.r = 1) sitting on a neutral background of display luma `bg`. */
function inked(bg, { warm, cool, strength, gateLo, gateHi }) {
  const c = [bg, bg, bg];
  const line = ss(gateLo, gateHi, bg);
  const t = ss(MIX[0], MIX[1], bg);
  const col = [0, 1, 2].map((i) => cool[i] + (warm[i] - cool[i]) * t);
  const ink = col.map((x, i) => Math.min(x, c[i]));
  const out = c.map((x, i) => x + (ink[i] - x) * Math.min(1, line) * strength);
  return luma(out);
}

const SHIPPED = { warm: rgb(WARM), cool: rgb(COOL), strength: STRENGTH, gateLo: GATE[0], gateHi: GATE[1] };
const scaleHex = (h, k) => rgb(h).map((x) => x * k);

/* Candidate: keep the WARM leg exactly (the lit-side line is not the complaint -- the median is
   already right), scale the COOL leg down, and relax the gate so a dark surface can still carry
   a line. Both numbers are solved for below rather than chosen. */
const REF_P10 = 0.0474;     // re-derived, progress/records/inkspread.mjs
const targetCool = 0.80 * REF_P10;   // the floor must sit BELOW p10, since p10 has 10% under it
const kCool = targetCool / luma(rgb(COOL));
console.log(`\ncool leg: display luma ${luma(rgb(COOL)).toFixed(4)} -> target ${targetCool.toFixed(4)}  `
  + `scale ${kCool.toFixed(4)}`);
/* NOT the naive rounding of the exact scale: at these magnitudes 8-bit quantisation moves hue,
   and hue is the property 2.2 names. 0x0b0812 (the rounding) lands 2.00 deg off 260; 0x0c0814 is
   hue-exact at 260.00 and within 0.0002 L of the sized target. Saturation rises 0.529 -> 0.600,
   which quantisation makes unavoidable if hue is held, and is reported rather than hidden. */
const coolHex = [0x0c, 0x08, 0x14];
console.log(`cool candidate 0x${coolHex.map((v) => v.toString(16).padStart(2, '0')).join('')}  `
  + `luma ${luma(coolHex.map((v) => v / 255)).toFixed(4)}  (hue 260.00 exact; sat 0.529 -> 0.600)`);

const CAND = {
  warm: rgb(WARM), cool: coolHex.map((v) => v / 255), strength: STRENGTH,
  gateLo: 0.02, gateHi: 0.10,
};

console.log('\nfully-inked pixel luma, by the background it sits on');
console.log('  bg      shipped   candidate   delta');
for (const bg of [0.05, 0.08, 0.10, 0.15, 0.20, 0.30, 0.45, 0.60, 0.80]) {
  const a = inked(bg, SHIPPED), b = inked(bg, CAND);
  console.log(`  ${bg.toFixed(2)}    ${a.toFixed(4)}    ${b.toFixed(4)}    ${(b - a >= 0 ? '+' : '')}${(b - a).toFixed(4)}`);
}
const lo = 0.05, hi = 0.80;
console.log(`\nshipped   spread over bg ${lo}..${hi}: ${(inked(hi, SHIPPED) / inked(lo, SHIPPED)).toFixed(2)}x`);
console.log(`candidate spread over bg ${lo}..${hi}: ${(inked(hi, CAND) / inked(lo, CAND)).toFixed(2)}x`);
console.log(`reference ink p90/p10 = 7.57 (progress/records/inkspread.mjs)`);
