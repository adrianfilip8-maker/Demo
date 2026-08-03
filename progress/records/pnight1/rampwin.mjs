/**
 * rampwin — where, in N.L, does slyRamp actually quantise?
 *
 * This is a transcription of slyRamp/slyTerm from src/render/shaders/toon.glsl.js with the
 * shipped uniforms from src/render/ToonMaterial.js TUNE. No renderer, no lock.
 *
 * THE SUFFIX I DO NOT IMPLEMENT (§11): this computes the `ramp` scalar ONLY. It does not
 * apply `sh` (cast shadow), the hemispheric fill, albedo, specular, rim, AO, AgX or the grade.
 * So it says "where can a band edge exist in N.L at all", NOT "where will a step be visible in
 * a frame". Those are different claims and the second is strictly weaker than the first --
 * a step can exist here and be swamped downstream, but a step CANNOT appear in a frame at an
 * N.L this function does not turn at.
 *
 * Self-test first, on a known input, because §7's rule is that a diagnostic can be the bug:
 * with bands=3 the specified output is three levels {0, 0.5, 1}. If the transcription does not
 * reproduce that, nothing below is worth reading.
 */
const TERM_LO = 0.14, TERM_HI = 0.52, TERM_SOFT = 0.024, BANDS = 3;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const step = (edge, x) => (x >= edge ? 1 : 0);

const slyTerm = (x, k, steps) => {
  const f = steps > 1 ? k / (steps - 1) : 0;
  const t = TERM_LO + (TERM_HI - TERM_LO) * f;
  return step(k + 0.5, steps) * smoothstep(t - TERM_SOFT, t + TERM_SOFT, x);
};
const slyRamp = (ndl, bands) => {
  const steps = Math.max(Math.floor(bands + 0.5) - 1, 1);
  const x = clamp(ndl, 0, 1);
  const acc = slyTerm(x, 0, steps) + slyTerm(x, 1, steps) + slyTerm(x, 2, steps) + slyTerm(x, 3, steps) + slyTerm(x, 4, steps);
  return clamp(acc / steps, 0, 1);
};

console.log(`uniforms: bands=${BANDS} termLo=${TERM_LO} termHi=${TERM_HI} termSoft=${TERM_SOFT}`);
const steps = Math.max(Math.floor(BANDS + 0.5) - 1, 1);
console.log(`steps = ${steps}  => output levels = ${steps + 1} evenly spaced on [0,1]\n`);

/* self-test on known inputs */
const lv = [slyRamp(0.0, BANDS), slyRamp(0.3, BANDS), slyRamp(0.9, BANDS)];
console.log(`SELF-TEST  ramp(0.00)=${lv[0].toFixed(3)}  ramp(0.30)=${lv[1].toFixed(3)}  ramp(0.90)=${lv[2].toFixed(3)}`);
console.log(`  expected 0.000 / 0.500 / 1.000 -> ${lv[0] === 0 && lv[1] === 0.5 && lv[2] === 1 ? 'PASS' : 'FAIL - stop reading'}\n`);

/* the active windows: where d(ramp)/d(ndl) != 0 */
const N = 200000;
let active = 0; const wins = []; let inWin = false, w0 = 0;
let prev = slyRamp(0, BANDS);
for (let i = 1; i <= N; i++) {
  const x = i / N, v = slyRamp(x, BANDS);
  const moving = Math.abs(v - prev) > 1e-12;
  if (moving) active++;
  if (moving && !inWin) { inWin = true; w0 = x; }
  if (!moving && inWin) { inWin = false; wins.push([w0, x]); }
  prev = v;
}
if (inWin) wins.push([w0, 1]);
console.log('BANDING-ACTIVE WINDOWS in N.L (outside these, ramp is exactly constant):');
for (const [a, b] of wins) console.log(`  [${a.toFixed(3)}, ${b.toFixed(3)}]   width ${(b - a).toFixed(3)}`);
console.log(`\ntotal active width = ${(active / N).toFixed(4)} of N.L in [0,1]  (${(100 * active / N).toFixed(1)}%)`);
console.log(`=> ${(100 * (1 - active / N)).toFixed(1)}% of the N.L range is a FLAT PLATEAU where the quantiser`);
console.log('   has nothing to quantise and a smooth gradient there is CORRECT behaviour.\n');

const hi = wins.length ? wins[wins.length - 1][1] : 0;
console.log(`HIGHEST terminator ends at N.L = ${hi.toFixed(3)}.`);
console.log(`So any surface whose visible N.L stays above ${hi.toFixed(3)} sits wholly in the top band:`);
console.log('  ramp === 1.000 across all of it, zero steps, by construction and by design.');
console.log('\nTable (N.L -> ramp):');
for (const x of [0.05, 0.10, 0.14, 0.20, 0.35, 0.50, 0.52, 0.55, 0.60, 0.75, 0.90, 1.00])
  console.log(`  ndl ${x.toFixed(2)} -> ${slyRamp(x, BANDS).toFixed(3)}`);
