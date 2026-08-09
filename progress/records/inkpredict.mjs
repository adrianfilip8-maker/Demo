/* As inkpredict.mjs, but with the SHIPPED daylight lift.
   tonecurve.grade() applies TUNE.lift at full strength (k = 1) and exposes no scale option,
   while PostFX ships `uLift = lift * liftScale(liftDayScale, dayAmount)` = lift * 0.35 in every
   daylight shot (PostFX.js:2112-2118, liftScale at :803). Emulated exactly by pre-inverting the
   model's own lift: the model computes  x + L*(1-x)  after multiplying by exposure, so feeding it
   x = (c + kL(1-c) - L) / (1 - L)  makes its output identical to a lift at scale k.
   VALIDATED below against the shipped comment's own derived number (floor 0.66 L at k = 0.35),
   which was computed by a different route on a different day. */
import * as THREE from 'three';
import { grade, displayL } from '/home/user/Demo/progress/records/tonecurve.mjs';
import { readFileSync } from 'node:fs';

const src = readFileSync('/home/user/Demo/src/render/PostFX.js', 'utf8');
const num = (re) => { const m = src.match(re); if (!m) throw new Error(`not found: ${re}`); return m; };
const LIFT = num(/lift:\s*\[([^\]]+)\]/)[1].split(',').map(Number);
const EXPOSURE = Number(num(/exposure:\s*([0-9.]+)/)[1]);
const K = Number(num(/liftDayScale:\s*([0-9.]+)/)[1]);
console.log(`parsed from PostFX.js: lift ${JSON.stringify(LIFT)} exposure ${EXPOSURE} liftDayScale ${K}`);

/** scene-linear -> display L/255 with the lift running at scale k instead of 1. */
function displayAtK(c, k) {
  const pre = c.map((x, i) => {
    const e = x * EXPOSURE, L = LIFT[i];
    const want = e + k * L * (1 - e);          // what the shipped shader produces
    return ((want - L) / (1 - L)) / EXPOSURE;  // what the model must be fed to produce it
  });
  return displayL(pre) / 255;
}

/* VALIDATION: the shipped comment derives, by its own route, a composite black floor of 0.66 L
   at k = 0.35 and 4.58 L at k = 1. Reproduce both or this emulation is not usable. */
const floorK = displayAtK([0, 0, 0], K) * 255, floor1 = displayL([0, 0, 0]);
console.log(`black floor  k=${K}: ${floorK.toFixed(2)} L (shipped comment says 0.66)   `
  + `k=1: ${floor1.toFixed(2)} L (shipped comment says 4.58)`);
const ok = Math.abs(floorK - 0.66) < 0.15 && Math.abs(floor1 - 4.58) < 0.15;
console.log(ok ? 'emulation VALIDATED against both of the shipped comment\'s derived floors\n'
               : 'emulation DOES NOT reproduce the shipped floors — do not use these numbers\n');
if (!ok) process.exit(1);

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const rows = { 'inkSun 0x1a1210': lin(0x1a1210), 'inkShade 0x161022': lin(0x161022), 'pure black': [0, 0, 0] };
console.log('name                  display L/255 (daylight, k=0.35)   display RGB');
for (const [k2, c] of Object.entries(rows)) {
  const pre = c.map((x, i) => { const e = x * EXPOSURE, L = LIFT[i]; return ((e + K * L * (1 - e) - L) / (1 - L)) / EXPOSURE; });
  console.log(`${k2.padEnd(20)}  ${displayAtK(c, K).toFixed(4)}                     `
    + grade(pre).map((x) => x.toFixed(1).padStart(6)).join(' '));
}

const sun = displayAtK(lin(0x1a1210), K), shade = displayAtK(lin(0x161022), K), blk = displayAtK([0, 0, 0], K);
console.log(`\nhull ink at display: sun ${sun.toFixed(4)}  shade ${shade.toFixed(4)}  spread ${Math.abs(sun - shade).toFixed(4)}`);
console.log(`PREDICTED P2 move: shade leg ${(shade - blk).toFixed(4)}   sun leg ${(sun - blk).toFixed(4)}`);
console.log(`P2 registered: >= 0.0300 meets  |  < 0.0100 fires F2  |  between = INCONCLUSIVE`);
console.log(`critic 9: ours darkest-decile 0.087-0.106, reference 0.031`);
