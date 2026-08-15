/**
 * space.mjs — THE SPACE QUESTION, answered from the shipped transform alone. No capture.
 *
 * §333 established that AgX + the grade destroy 76.5% of the chroma between the shader and the
 * screen, and that THREE consecutive seals died aiming in-shader levers at a defect produced
 * downstream. So before anyone touches the toon shadow tint, r13's courtyard reading — colossus
 * lit h 7 / s 0.63 -> shadow h 345 / s 0.29, against a specified ~218 — has to be assigned a
 * space. Two mutually exclusive stories:
 *
 *   SHADING  — the shader already emits a mauve-grey shade band; the transform merely passes it.
 *   POSTFX   — the shader emits a correctly blue shade band and the display transform rotates it.
 *
 * Both are decidable offline, because the transform is deterministic and transcribed out of
 * `src/` by `tonecurve.mjs` (forward) and `invchain.mjs` (inverse, machine-precision round-trip
 * against that independent forward — see selfcheck.mjs). Two directions, and they must agree:
 *
 *   FORWARD  — push linear colours of KNOWN hue through the chain and read the display hue out.
 *   INVERSE  — carry the MEASURED display pixel back and read the linear hue that entered.
 *
 * §333's warning about `lithold-model.mjs` is honoured: nothing here fits a linear state or
 * trusts a modelled one. The only thing used is the TRANSFORM — the part the grey-row
 * calibration validates — plus the inverse's own round-trip.
 */
import { grade } from '../tonecurve.mjs';
import { unGrade, TUNE, srgb2lin, luma } from './invchain.mjs';
import { hsv } from './measure.mjs';

/** The shipped vignette scalar at a pixel: `c *= vig`, DISPLAY space, after the encode.
 *  A scalar multiply in display space cannot move HSV hue or saturation — only value — so it is
 *  divided out before inversion and is irrelevant to every hue claim below. */
export function vig(x, y, w, h) {
  const u = (x + 0.5) / w - 0.5, v = (y + 0.5) / h - 0.5;
  const r2 = u * u + v * v;
  const t = Math.min(1, Math.max(0, (r2 * 2 - 0.18) / (0.95 - 0.18)));
  return 1 - TUNE.vignette * (t * t * (3 - 2 * t));
}

/** HSV of a LINEAR triple. Hue and HSV-saturation are ratio quantities, so the same formula
 *  applies in either space — they are simply not the same NUMBER, which is the whole point. */
export const hsvLin = (c) => {
  const m = Math.max(...c, 1e-12);
  return hsv(c.map((x) => (x / m) * 255));
};

export function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return t.map((q) => q + m);
}

const f4 = (c) => c.map((x) => x.toFixed(4).padStart(9)).join(' ');
const fd = (c) => c.map((x) => x.toFixed(1).padStart(6)).join(' ');
const hex = (c) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');

/** One display sample -> the linear radiance behind it, reported in both spaces. */
export function invert(label, D, opts = {}) {
  const Dv = opts.vig ? D.map((x) => x / opts.vig) : D;
  const r = unGrade(Dv);
  const hD = hsv(D), hL = hsvLin(r.scene);
  console.log(`${label.padEnd(24)} disp ${fd(D)} ${hex(D)} h ${hD.h.toFixed(1).padStart(5)} s ${hD.s.toFixed(3)} L ${luma(D).toFixed(1).padStart(5)}` +
    `  ->  LINEAR ${f4(r.scene)} h ${hL.h.toFixed(1).padStart(5)} s ${hL.s.toFixed(3)}` +
    `${r.flags.length ? '  FLAGS ' + r.flags.join(',') : ''}`);
  return { ...r, hD, hL };
}

if (process.argv[1].endsWith('space.mjs')) {
  console.log(`\n=== 1. FORWARD: how far does the shipped chain rotate hue? ==========================`);
  console.log(`A linear colour of known hue at HSV-s 0.60, swept round the circle at three shade-band`);
  console.log(`values. "in->out" is linear hue -> display hue; d is the rotation the transform adds.`);
  for (const scale of [0.008, 0.020, 0.050, 0.120]) {
    const row = [];
    for (let H = 0; H < 360; H += 30) {
      const D = grade(hsv2rgb(H, 0.60, 1).map((x) => x * scale));
      let d = hsv(D).h - H; if (d > 180) d -= 360; if (d < -180) d += 360;
      row.push(`${String(H).padStart(3)}->${hsv(D).h.toFixed(0).padStart(3)}(${d >= 0 ? '+' : ''}${d.toFixed(0)})`);
    }
    console.log(`  v ${scale.toFixed(3)}  L${luma(grade([scale, scale, scale])).toFixed(0).padStart(4)}  ${row.join(' ')}`);
  }

  console.log(`\n=== 2. FORWARD: the SPECIFIED shadow colour #2a3f66 (linear hue 219) on screen ======`);
  const spec = [0x2a, 0x3f, 0x66].map((x) => srgb2lin(x / 255));
  for (const k of [0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2]) {
    const c = spec.map((x) => x * k), D = grade(c);
    console.log(`  x${k.toFixed(2).padStart(5)}  linear ${f4(c)} h ${hsvLin(c).h.toFixed(1)}  ->  ` +
      `${hex(D)} h ${hsv(D).h.toFixed(1).padStart(5)} s ${hsv(D).s.toFixed(3)} L ${luma(D).toFixed(1).padStart(5)}`);
  }

  console.log(`\n=== 3. INVERSE: the r13 critic's two quoted courtyard pixels ========================`);
  invert('critic lit  #ba5244', [0xba, 0x52, 0x44]);
  invert('critic shade#563d43', [0x56, 0x3d, 0x43]);
  invert('spec shadow #2a3f66', [0x2a, 0x3f, 0x66]);

  console.log(`\n=== 4. What linear hue is REQUIRED to display at 345? ==============================`);
  console.log(`  Sweeping linear hue at the shade's own display luminance and reading display hue:`);
  for (let H = 300; H <= 360; H += 10) {
    const c = hsv2rgb(H, 0.35, 1).map((x) => x * 0.020), D = grade(c);
    console.log(`  linear h ${String(H).padStart(3)} -> display h ${hsv(D).h.toFixed(1).padStart(5)} s ${hsv(D).s.toFixed(3)} L ${luma(D).toFixed(1)}`);
  }
}
