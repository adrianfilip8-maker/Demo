/**
 * tonecurve.mjs — the shipped grade+tonemap chain, and its log-log contrast slope G(c).
 *
 * WHAT THIS IS NOT (§11's rule: state the suffix you did NOT implement).
 * Between this and a delivered pixel there are: AO, the surface rim, the ink pass, the
 * screen-space rim, bloom's spatial gather, vignette, grain, FXAA, and the sRGB *quantiser*.
 * This models the per-pixel grey/colour axis only: exposure -> lift -> gain -> split -> sat
 * -> contrast -> AgX -> linear-to-sRGB. That is exactly the population the shipped comment at
 * PostFX.js:524 calls "whole composite minus AO/rim/ink/vignette", which is what it is
 * validated against.
 *
 * G(c) = dlnD/dlnc, the log-log slope of display value against scene radiance. It is the right
 * quantity for texture legibility because texture detail is a MULTIPLICATIVE modulation on
 * albedo, so a modulation of m in scene becomes m*G in display contrast (§70.2).
 */
import { readFileSync } from 'node:fs';

const SRC = '/home/user/Demo/src/render';
const common = readFileSync(`${SRC}/passes/Common.js`, 'utf8');
const postfx = readFileSync(`${SRC}/PostFX.js`, 'utf8');

/* ---- parse the AgX matrices by NAME, not by scanning numbers -------------------------------
   §70.3: a bare number-regex over these declarations matched the `3` in `mat3`/`vec3` and the
   `2020` in the identifier `SLY_REC2020_TO_SRGB`, and every matrix came out garbage. So: cut the
   declaration by name first, strip identifiers, THEN read numbers, and assert the count. */
function mat3ByName(src, name) {
  const i = src.indexOf(name);
  if (i < 0) throw new Error(`matrix ${name} not found`);
  const open = src.indexOf('mat3(', i);
  let d = 0, j = open + 4, end = -1;
  for (; j < src.length; j++) {
    if (src[j] === '(') d++;
    else if (src[j] === ')') { d--; if (d === 0) { end = j; break; } }
  }
  const body = src.slice(open + 5, end).replace(/vec3/g, ' ').replace(/[A-Za-z_][A-Za-z0-9_]*/g, ' ');
  const n = body.match(/-?\d+\.?\d*(?:e-?\d+)?/g).map(Number);
  if (n.length !== 9) throw new Error(`${name}: got ${n.length} numbers, want 9`);
  // GLSL mat3(vec3 a, vec3 b, vec3 c) is COLUMN-major: a,b,c are columns.
  return [[n[0], n[3], n[6]], [n[1], n[4], n[7]], [n[2], n[5], n[8]]];
}
const R2020_TO_SRGB = mat3ByName(common, 'SLY_REC2020_TO_SRGB');
const SRGB_TO_2020 = mat3ByName(common, 'SLY_SRGB_TO_REC2020');
const INSET = mat3ByName(common, 'const mat3 inset');
const OUTSET = mat3ByName(common, 'const mat3 outset');

const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];

/* SELF-CHECK 1 — the parse. The two rec2020 matrices are inverses by construction, so their
   product must be I. This is the check that would have caught the garbage-matrix failure. */
{
  let worst = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const v = mul(R2020_TO_SRGB, mul(SRGB_TO_2020, [j === 0 ? 1 : 0, j === 1 ? 1 : 0, j === 2 ? 1 : 0]))[i];
    worst = Math.max(worst, Math.abs(v - (i === j ? 1 : 0)));
  }
  if (worst > 2e-3) throw new Error(`rec2020 round-trip off by ${worst} — matrices misparsed`);
  console.log(`self-check 1  rec2020 round-trip max |err| ${worst.toExponential(2)}  OK`);
}

/* ---- parse the live grade constants --------------------------------------------------- */
const num = (re, what) => { const m = postfx.match(re); if (!m) throw new Error(`missing ${what}`); return Number(m[1]); };
const vec = (re, what) => { const m = postfx.match(re); if (!m) throw new Error(`missing ${what}`); return m[1].split(',').map(Number); };
const TUNE = {
  exposure: num(/\n\s*exposure:\s*([\d.]+)/, 'exposure'),
  contrast: num(/\n\s*contrast:\s*([\d.]+)/, 'contrast'),
  saturation: num(/\n\s*saturation:\s*([\d.]+)/, 'saturation'),
  lift: vec(/\n\s*lift:\s*\[([^\]]+)\]/, 'lift'),
  gain: vec(/\n\s*gain:\s*\[([^\]]+)\]/, 'gain'),
  splitStrength: num(/\n\s*splitStrength:\s*([\d.]+)/, 'splitStrength'),
  splitRange: vec(/\n\s*splitRange:\s*\[([^\]]+)\]/, 'splitRange'),
  splitShadow: num(/\n\s*splitShadow:\s*0x([0-9a-fA-F]+)/, 'splitShadow'),
  splitHighlight: num(/\n\s*splitHighlight:\s*0x([0-9a-fA-F]+)/, 'splitHighlight'),
  pivot: num(/SLY_PIVOT\s*=\s*([\d.]+)/, 'pivot'),
};
TUNE.splitShadow = Number.parseInt(postfx.match(/\n\s*splitShadow:\s*0x([0-9a-fA-F]+)/)[1], 16);
TUNE.splitHighlight = Number.parseInt(postfx.match(/\n\s*splitHighlight:\s*0x([0-9a-fA-F]+)/)[1], 16);

const srgb2lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const lin2srgb = (c) => { c = Math.max(c, 0); return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const SPLIT_SHADOW = hex2lin(TUNE.splitShadow);
const SPLIT_HIGHLIGHT = hex2lin(TUNE.splitHighlight);

/* ---- AgX, parameterised on the contrast sigmoid so candidates are one argument ---------- */
const evShip = (() => {
  const a = common.match(/minEv\s*=\s*(-?[\d.]+)/), b = common.match(/maxEv\s*=\s*(-?[\d.]+)/);
  return [Number(a[1]), Number(b[1])];
})();

/** The shipped 6th-order polynomial approximation of the AgX sigmoid. */
export const agxShipped = (x) => {
  const x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
};

export function agx(c, curve = agxShipped, ev = evShip) {
  const [minEv, maxEv] = ev;
  let v = mul(SRGB_TO_2020, c);
  v = mul(INSET, v);
  v = v.map((x) => Math.max(x, 1e-10)).map(Math.log2);
  v = v.map((x) => Math.min(1, Math.max(0, (x - minEv) / (maxEv - minEv))));
  v = v.map(curve);
  v = mul(OUTSET, v);
  v = v.map((x) => Math.pow(Math.max(x, 0), 2.2));
  v = mul(R2020_TO_SRGB, v);
  // shipped gamut map (48d7e08): no-op in gamut, so it cannot touch the grey axis
  const lum = luma(v), mn = Math.min(v[0], v[1], v[2]);
  if (mn < 0 && lum > mn) { const t = Math.min(1, -mn / (lum - mn)); v = v.map((x) => x + (lum - x) * t); }
  return v.map((x) => Math.min(1, Math.max(0, x)));
}

/** scene-linear RGB -> display 0..255, whole composite minus AO/rim/ink/vignette. */
export function grade(cIn, opt = {}) {
  const curve = opt.curve ?? agxShipped;
  const ev = opt.ev ?? evShip;
  const exposure = opt.exposure ?? TUNE.exposure;
  let c = cIn.map((x) => x * exposure);
  c = c.map((x, i) => Math.max(0, x + TUNE.lift[i] * (1 - x)));
  c = c.map((x, i) => x * TUNE.gain[i]);
  const l = luma(c);
  const t = Math.min(1, Math.max(0, (l - TUNE.splitRange[0]) / (TUNE.splitRange[1] - TUNE.splitRange[0])));
  const s = t * t * (3 - 2 * t);
  let tone = [0, 1, 2].map((i) => SPLIT_SHADOW[i] + (SPLIT_HIGHLIGHT[i] - SPLIT_SHADOW[i]) * s);
  const tl = luma(tone); tone = tone.map((x) => x / Math.max(1e-4, tl));
  c = c.map((x, i) => x + (x * tone[i] - x) * TUNE.splitStrength);
  c = c.map((x) => l + (x - l) * TUNE.saturation);
  c = c.map((x) => TUNE.pivot * Math.pow(Math.max(x, 1e-6) / TUNE.pivot, opt.contrast ?? TUNE.contrast));
  // noAgx: skip the tonemap entirely (the §70.2 "bypassing AgX" arm), clamping as the
  // framebuffer would. Not a shippable state — it clips — but it isolates AgX's contribution.
  c = opt.noAgx ? c.map((x) => Math.min(1, Math.max(0, x))) : agx(c, curve, ev);
  return c.map(lin2srgb).map((x) => x * 255);
}
export const displayL = (c, opt) => { const d = grade(c, opt); return luma(d); };

/* SELF-CHECK 2 — the chain, against the ONLY validated row in the project.
   PostFX.js:524-538 carries a grey-axis row and explicitly RETRACTS an earlier one
   (29/60/78/112/139/153/165/175/188). scratchpad/bloomcalc.mjs's inline comment still quotes
   the retracted row — §70.3 records that stale comment misleading a run. Validate on the
   replacement, which is the one anchored to a rendered pixel. */
const VALID_SCENE = [0.02, 0.05, 0.08, 0.18, 0.35, 0.50, 0.72, 1.00, 2.00];
const VALID_L = [39, 69, 88, 126, 159, 176, 192, 205, 227];
{
  let worst = 0;
  const row = VALID_SCENE.map((s, i) => {
    const got = displayL([s, s, s]);
    worst = Math.max(worst, Math.abs(got - VALID_L[i]));
    return `${s}->${got.toFixed(1)}(${VALID_L[i]})`;
  });
  console.log(`self-check 2  ${row.join(' ')}`);
  console.log(`self-check 2  max |err| vs shipped validated row: ${worst.toFixed(2)} L  ${worst < 1.5 ? 'OK' : 'FAIL'}`);
  if (worst >= 1.5) throw new Error('chain transcription does not reproduce the validated row');
}

/* ---- G(c) = dlnD / dlnc, on the grey axis --------------------------------------------- */
export function G(scene, opt) {
  const h = 0.01;                       // in ln c
  const a = displayL([scene, scene, scene].map((x) => x * Math.exp(-h)), opt);
  const b = displayL([scene, scene, scene].map((x) => x * Math.exp(+h)), opt);
  return (Math.log(Math.max(b, 1e-6)) - Math.log(Math.max(a, 1e-6))) / (2 * h);
}

/* §70.2's bins are on BASE LUMA (the material's own albedo-ish value), and the sizing there
   sampled scene radiance across each bin. Reproduce with the same bins. */
export function binG(opt) {
  const darks = [], brights = [];
  for (let s = 0.02; s <= 6.0; s *= 1.06) {
    const d = displayL([s, s, s], opt) / 255;
    if (d < 0.35) darks.push(G(s, opt));
    else if (d >= 0.50) brights.push(G(s, opt));
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { dark: mean(darks), bright: mean(brights), ratio: mean(brights) / mean(darks) };
}

if (process.argv[1].endsWith('tonecurve.mjs')) {
  console.log(`\nTUNE parsed: exposure ${TUNE.exposure} contrast ${TUNE.contrast} sat ${TUNE.saturation} ` +
    `pivot ${TUNE.pivot} splitStrength ${TUNE.splitStrength} splitRange [${TUNE.splitRange}] ev [${evShip}]`);
  const b = binG();
  console.log(`\nSHIPPED   G dark ${b.dark.toFixed(3)}  G bright ${b.bright.toFixed(3)}  ratio ${b.ratio.toFixed(3)}`);
  console.log(`  ledger §70.2 says: 0.625 / 0.244 / 0.390`);
  console.log(`\nG(c) on the grey axis:`);
  for (const s of [0.02, 0.05, 0.1, 0.18, 0.3, 0.5, 0.8, 1.2, 2, 3, 5]) {
    console.log(`  scene ${String(s).padStart(5)}  L ${displayL([s, s, s]).toFixed(1).padStart(6)}  G ${G(s).toFixed(3)}`);
  }
}
