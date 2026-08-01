/**
 * Where does each canonical camera sit on the scattering phase function, and does the shaft
 * shader care?
 *
 * A light shaft is visible because of forward scatter: looking into the sun through dusty air
 * is bright, looking away from it is not. `SHAFT_FRAG` (`src/fx/Particles.js`) has no term for
 * this. Its one angular quantity, `vAxial`, is a billboard degeneracy guard, and it is
 * symmetric — it cannot tell looking *into* a beam from looking *away* from it. So blade
 * brightness is currently independent of the camera–sun angle, and a single `shaftGain` has to
 * serve every framing at once.
 *
 * This prints the spread that gain has to cover, using each shot's own `A.mieG` from
 * `evalAtmosphere` rather than a constant picked by hand — the value ranges 0.62 to 0.766
 * across the ten shots, which is enough to matter.
 *
 *   node tools/shaftphase.mjs
 *
 * **What this does not claim.** Physical correctness is not the goal — this is a stylised
 * game and a flattened phase curve may well look better than the true one. The claim is only
 * that *zero* angular dependence is the one option that cannot be right in more than one
 * frame, and the table says how wrong it is in the others.
 */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { evalAtmosphere, createAtmosphereState } from '../src/render/Atmosphere.js';

/* Henyey–Greenstein, the same form as `Atmosphere.js:460`, which `Sky.js:368` already uses
   live for the sun bloom. Reimplemented here rather than imported because that one is GLSL. */
const hg = (cosT, g) => (1 - g * g) / (4 * Math.PI * Math.pow(Math.max(1 + g * g - 2 * g * cosT, 1e-4), 1.5));

/* The billboard guard in SHAFT_FRAG: occl *= 1.0 - smoothstep(0.86, 0.99, vAxial). Evaluated
   here so the tool can say whether it is implicated rather than leaving it as a suspect. */
const AXIAL_LO = 0.86, AXIAL_HI = 0.99;
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const rows = [];
for (const [name, s] of Object.entries(SHOTS)) {
  const A = evalAtmosphere(s.tod ?? 0.78, createAtmosphereState());
  /* `keyDir` points from the surface TOWARD the light — the same convention `charview.mjs`
     reads it in — so looking into the sun is forward against its negation. Getting this
     backwards inverts every conclusion below, which is why it is spelled out. */
  const key = (A.keyDir ?? A.sunDir).clone().normalize();
  const fwd = new THREE.Vector3(...s.target).sub(new THREE.Vector3(...s.pos)).normalize();
  const phase = Math.acos(Math.max(-1, Math.min(1, fwd.dot(key.clone().negate())))) * 180 / Math.PI;

  const beam = key.clone().negate();          // the direction sunlight travels
  const toCam = fwd.clone().negate();         // from a point on the beam back to the lens
  const vAxial = 1 - Math.min(1, beam.clone().cross(toCam).length());

  rows.push({
    name, phase, g: A.mieG,
    p: hg(Math.cos(phase * Math.PI / 180), A.mieG),
    fade: 1 - smoothstep(AXIAL_LO, AXIAL_HI, vAxial),
    vAxial,
  });
}

const ref = rows.find((r) => r.name === 'courtyard').p;
rows.sort((a, b) => b.p - a.p);
console.log('shot          phase°   mieG    HG rel. courtyard   vAxial  guard fade');
for (const r of rows) {
  console.log(`${r.name.padEnd(13)} ${r.phase.toFixed(0).padStart(5)}°  ${r.g.toFixed(3)}   ${(r.p / ref).toFixed(3).padStart(9)}x    ${r.vAxial.toFixed(2)}    ${r.fade.toFixed(2)}`);
}
const ps = rows.map((r) => r.p);
console.log(`\nspread across the ten shots: ${(Math.max(...ps) / Math.min(...ps)).toFixed(1)}x — SHAFT_FRAG renders all ten flat.`);
const bit = rows.filter((r) => r.fade < 0.999);
console.log(bit.length
  ? `axial guard bites in: ${bit.map((r) => r.name).join(', ')}`
  : `axial guard is NOT implicated: it is 1.00 in every shot (max vAxial ${Math.max(...rows.map((r) => r.vAxial)).toFixed(2)} against a ${AXIAL_LO} threshold).`);
