/**
 * invchain.mjs — the ANALYTIC inverse of the shipped display chain.
 *
 * `progress/records/tonecurve.mjs` already models the forward chain and validates it on the one
 * grey row PostFX.js anchors to a rendered pixel. This module inverts that same chain stage by
 * stage, so a measured display byte can be carried back to the scene-linear radiance that must
 * have produced it.
 *
 * Why analytic and not a numerical solve: a 3-D Newton on the composed map gets stuck on exactly
 * the population this investigation cares about — dark, low-red, blue-dominant pixels, where the
 * rec2020->sRGB red row and the split-tone flatten the Jacobian. Inverting the stages one at a
 * time leaves a single well-behaved 1-D root (the split/saturation pair, which couple only
 * through the frame-independent scalar `l = luma(c)` at that point).
 *
 * The correctness argument is a round-trip against an INDEPENDENT forward implementation:
 * `tonecurve.grade()` is not used by anything here, and self-check I below drives 4,000+ colours
 * — including the whole dark blue corner — through grade() then back through this inverse and
 * requires agreement to <0.01 display L. A misparse of any matrix or constant fails that check.
 *
 * WHAT IS NOT INVERTED, and it matters for where you may sample (§11: name the missing suffix):
 *   - the silhouette rim, the ink pass, FXAA. All three are EDGE-LOCAL; sample away from edges.
 *   - bloom, which is additive into `scene` BEFORE the grade. An inverted radiance is therefore
 *     "radiance + bloom", which is the correct boundary for a POSTFX-vs-SHADING question anyway
 *     (bloom is POSTFX), but it means a bloomed pixel's inverted value is not the shader's.
 *   - the vignette, a display-space SCALAR: divide it out first (`vig()` in space.mjs). It cannot
 *     move display hue or HSV saturation, only the value.
 *   - grain, which is 0.0 in shipped TUNE, and chromatic aberration, also 0.0.
 *   - the 8-bit quantiser. One byte is worth ~0.4-2 units of scene chroma in the deep shadows;
 *     `sensitivity()` reports that band rather than hiding it.
 */
import { readFileSync } from 'node:fs';
import { agxShipped } from '../tonecurve.mjs';

const SRC = '/home/user/Demo/src/render';
const common = readFileSync(`${SRC}/passes/Common.js`, 'utf8');
const postfx = readFileSync(`${SRC}/PostFX.js`, 'utf8');

/* ---- parse, by name, exactly as tonecurve.mjs does (§70.3: a bare number regex eats `mat3`) */
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
  return [[n[0], n[3], n[6]], [n[1], n[4], n[7]], [n[2], n[5], n[8]]];   // GLSL mat3 is column-major
}
export const R2020_TO_SRGB = mat3ByName(common, 'SLY_REC2020_TO_SRGB');
export const SRGB_TO_2020 = mat3ByName(common, 'SLY_SRGB_TO_REC2020');
export const INSET = mat3ByName(common, 'const mat3 inset');
export const OUTSET = mat3ByName(common, 'const mat3 outset');
const MINEV = Number(common.match(/minEv\s*=\s*(-?[\d.]+)/)[1]);
const MAXEV = Number(common.match(/maxEv\s*=\s*(-?[\d.]+)/)[1]);

const num = (re, what) => { const m = postfx.match(re); if (!m) throw new Error(`missing ${what}`); return Number(m[1]); };
const vecN = (re, what) => { const m = postfx.match(re); if (!m) throw new Error(`missing ${what}`); return m[1].split(',').map(Number); };
export const TUNE = {
  exposure: num(/\n\s*exposure:\s*([\d.]+)/, 'exposure'),
  contrast: num(/\n\s*contrast:\s*([\d.]+)/, 'contrast'),
  saturation: num(/\n\s*saturation:\s*([\d.]+)/, 'saturation'),
  lift: vecN(/\n\s*lift:\s*\[([^\]]+)\]/, 'lift'),
  gain: vecN(/\n\s*gain:\s*\[([^\]]+)\]/, 'gain'),
  splitStrength: num(/\n\s*splitStrength:\s*([\d.]+)/, 'splitStrength'),
  splitRange: vecN(/\n\s*splitRange:\s*\[([^\]]+)\]/, 'splitRange'),
  splitShadow: Number.parseInt(postfx.match(/\n\s*splitShadow:\s*0x([0-9a-fA-F]+)/)[1], 16),
  splitHighlight: Number.parseInt(postfx.match(/\n\s*splitHighlight:\s*0x([0-9a-fA-F]+)/)[1], 16),
  pivot: num(/SLY_PIVOT\s*=\s*([\d.]+)/, 'pivot'),
  vignette: num(/\n\s*vignette:\s*([\d.]+)/, 'vignette'),
  grain: num(/\n\s*grain:\s*([\d.]+)/, 'grain'),
  toneShoulder: num(/\n\s*toneShoulder:\s*([\d.]+)/, 'toneShoulder'),
  dispChromaHold: num(/\n\s*dispChromaHold:\s*([\d.]+)/, 'dispChromaHold'),
};
if (TUNE.toneShoulder !== 1.0) throw new Error(`toneShoulder ${TUNE.toneShoulder} != 1: the shoulder branch is live and neither tonecurve.mjs nor this inverse models it`);
if (TUNE.grain !== 0) throw new Error(`grain ${TUNE.grain} != 0: dither is live and per-pixel inversion is no longer exact`);

export const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
function inv3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}
/* Every inverse is computed NUMERICALLY, never by substituting the "other" matrix. The two
   rec2020 matrices in Common.js are inverse only to ~1e-4 (tonecurve.mjs's own self-check 1
   prints that residual), and using one as the other's inverse leaves a systematic ~0.03 display
   L bias on every pixel — small, but it is a bias, and it would be indistinguishable from a
   real finding at the chroma scale this investigation works at. */
const INSET_INV = inv3(INSET), OUTSET_INV = inv3(OUTSET);
const R2020_TO_SRGB_INV = inv3(R2020_TO_SRGB), SRGB_TO_2020_INV = inv3(SRGB_TO_2020);

export const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const lin2srgb = (c) => { c = Math.max(c, 0); return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
export const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
const SPLIT_SHADOW = hex2lin(TUNE.splitShadow), SPLIT_HIGHLIGHT = hex2lin(TUNE.splitHighlight);

/** k_i(l): the per-channel factor the split-tone applies. Depends on the post-gain luma only. */
export function splitK(l) {
  const t = Math.min(1, Math.max(0, (l - TUNE.splitRange[0]) / (TUNE.splitRange[1] - TUNE.splitRange[0])));
  const s = t * t * (3 - 2 * t);
  let tone = [0, 1, 2].map((i) => SPLIT_SHADOW[i] + (SPLIT_HIGHLIGHT[i] - SPLIT_SHADOW[i]) * s);
  const tl = luma(tone); tone = tone.map((x) => x / Math.max(1e-4, tl));
  return tone.map((x) => 1 + (x - 1) * TUNE.splitStrength);
}

/** Invert the AgX sigmoid polynomial on [0,1] by bisection (it is monotone there — checked). */
const CURVE_LO = agxShipped(0), CURVE_HI = agxShipped(1);
export function invCurve(y) {
  if (y <= CURVE_LO) return 0;
  if (y >= CURVE_HI) return 1;
  let a = 0, b = 1;
  for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (agxShipped(m) < y) a = m; else b = m; }
  return (a + b) / 2;
}

/** display linear-sRGB (AgX output, 0..1) -> the linear colour that entered slyAgX.
 *  `flags` collects the two places the forward map is genuinely NOT invertible: the log-exposure
 *  clamp at either end (a whole interval of scene values maps to one display value there). */
export function unAgx(x, flags = []) {
  let v = mul(R2020_TO_SRGB_INV, x);
  v = v.map((t) => Math.pow(Math.max(t, 0), 1 / 2.2));
  v = mul(OUTSET_INV, v);
  const u = v.map(invCurve);
  if (u.some((t) => t <= 1e-9)) flags.push('AGX_EVFLOOR');
  if (u.some((t) => t >= 1 - 1e-9)) flags.push('AGX_EVCEIL');
  v = u.map((t) => Math.pow(2, t * (MAXEV - MINEV) + MINEV));
  v = mul(INSET_INV, v);
  return mul(SRGB_TO_2020_INV, v);
}

/**
 * display bytes 0..255 -> scene-linear radiance entering the composite's grade.
 * Returns { scene, stages, flags } where `stages` carries the intermediate colour at each step
 * so the hue can be read where each stage leaves it, and `flags` names any degeneracy.
 */
export function unGrade(D) {
  const flags = [];
  if (D.some((x) => x >= 254.5)) flags.push('CLIP_HI');
  if (D.some((x) => x <= 0.5)) flags.push('CLIP_LO');
  const agxOut = D.map((x) => srgb2lin(x / 255));
  const postContrast = unAgx(agxOut, flags);
  if (postContrast.some((x) => x <= 0 || !Number.isFinite(x))) flags.push('AGX_FLOOR');
  // undo the log-space contrast
  const postSat = postContrast.map((x) => TUNE.pivot * Math.pow(Math.max(x, 1e-12) / TUNE.pivot, 1 / TUNE.contrast));
  // undo saturation + split together: one 1-D root in l = luma(postGain)
  const resid = (l) => {
    const k = splitK(l);
    const a = postSat.map((x, i) => ((x - l) / TUNE.saturation + l) / k[i]);
    return luma(a) - l;
  };
  let lo = 1e-9, hi = 64;
  if (resid(lo) * resid(hi) > 0) flags.push('NO_BRACKET');
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (resid(lo) * resid(m) <= 0) hi = m; else lo = m; }
  const l = (lo + hi) / 2;
  const k = splitK(l);
  const postGain = postSat.map((x, i) => ((x - l) / TUNE.saturation + l) / k[i]);
  const postLift = postGain.map((x, i) => x / TUNE.gain[i]);
  const postExp = postLift.map((x, i) => (x - TUNE.lift[i]) / (1 - TUNE.lift[i]));
  const scene = postExp.map((x) => x / TUNE.exposure);
  if (scene.some((x) => x < 0)) flags.push('NEG_SCENE');
  return { scene, stages: { scene, postExp, postGain, postSplitSat: postSat, postContrast, agxOut, display: D }, flags, l };
}
