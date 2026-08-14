/**
 * lithold-model.mjs — the offline derivation behind PREREG-lithold.md. Boots nothing, takes
 * no capture lock, reads only the r12 frames and the live modules.
 *
 *   node progress/records/lithold-model.mjs
 *
 * It answers four questions in order, and the second one is why this seal is not the seal
 * §277 asked for:
 *
 *   1. What IS the costume's albedo? (measured off the shipped sly_body_fix.png)
 *   2. Does a warm key MULTIPLYING that albedo desaturate it? — the §277 lit-band hypothesis,
 *      i.e. §289's shadow-side mechanism mirrored onto the key. Drives the real
 *      Atmosphere + Shading, transcribes only TOON_SHADE's diff assembly.
 *   3. If not, what DOES the frame's bleached costume pixel decompose into? — a 3-parameter
 *      fit (ramp, shadow, achromatic additive) of the model against the r12 frames' own
 *      measured lit-half display triples.
 *   4. What would the CANDIDATE (the composite chroma hold) do at that fitted state?
 *
 * Display through progress/records/tonecurve.mjs, whose chain is validated against PostFX's
 * own grey row (max 0.35 L). What this does NOT model, stated per §11: AO, the ink pass,
 * PostFX's screen rim, bloom's spatial gather, FX quads composited over the character,
 * vignette, grain, FXAA. Two of those (bloom, FX quads) are downstream of the shader and so
 * are OUTSIDE the candidate's reach — that is the registered risk on combat.
 */
import { createAtmosphereState, evalAtmosphere } from '../../src/render/Atmosphere.js';
import { Shading, TUNE } from '../../src/render/ToonMaterial.js';
import { grade } from './tonecurve.mjs';
import { readPNG } from '../../tools/png.mjs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const lum3 = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const chroma = (c) => { const mx = Math.max(...c); return mx > 1e-9 ? (mx - Math.min(...c)) / mx : 0; };
const hueOf = (c) => {
  const [R, G, B] = c, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  if (d < 1e-9) return NaN;
  let h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};

/* ── 1. the albedo, measured ───────────────────────────────────────────────────────────── */
const body = readPNG(path.join(ROOT, 'src/assets/sly-dl/sly_body_fix.png'));
let n = 0, sr = 0, sg = 0, sb = 0;
for (let i = 0; i < body.w * body.h; i++) {
  const o = i * body.ch;
  if (body.ch === 4 && body.data[o + 3] < 250) continue;
  const R = body.data[o] / 255, G = body.data[o + 1] / 255, B = body.data[o + 2] / 255;
  const c = [R, G, B];
  if (chroma(c) <= 0.15) continue;
  const h = hueOf(c);
  if (!(h >= 190 && h <= 270)) continue;
  n++; sr += R; sg += G; sb += B;
}
const ALB_SRGB = [sr / n, sg / n, sb / n];
const ALB = ALB_SRGB.map(s2l);
console.log(`1. costume albedo: ${n} texels, sRGB (${ALB_SRGB.map((x) => (x * 255).toFixed(0))}), hue ${hueOf(ALB_SRGB).toFixed(1)}, linear chroma ${chroma(ALB).toFixed(3)}`);

/* ── the transcribed pixel ─────────────────────────────────────────────────────────────── */
function shadingFor(tod) {
  const s = createAtmosphereState();
  evalAtmosphere(tod, s);
  const sh = new Shading({ debug: {}, camera: { position: { y: 10 } } });
  sh.setKeyLight({
    direction: s.keyDir, color: s.keyColor, intensity: s.keyIntensity,
    ambient: { sky: s.hemiSky, ground: s.hemiGround, intensity: s.ambientIntensity, floor: s.shadowFloor, tint: s.shadowTint },
    nightAmount: s.nightAmount, local: 2.5,
  });
  return sh;
}
const WRAP = [0xff, 0xb0, 0x7a].map((x) => s2l(x / 255));      // PAL.wrapWarm, the subject's shade target

/** SUBJECT pixel (vSlySkin = 1): subjWarmShade and §289's subjShadowHold are both live. */
function pixel(sh, { alb, ny = 0.2, ramp, shadow, ao = 1, keyMirrorHold = 0 }) {
  const u = sh.uniforms;
  const key = ramp * shadow, shadowMix = 1 - key;
  const albL = lum3(alb);
  const albShadow = alb.map((x) => Math.min(1, Math.max(0, albL + (x - albL) * (1 + TUNE.shadowSat))));
  const albAmb = alb.map((x, i) => x + (albShadow[i] - x) * shadowMix);
  const sky = [u.uSkyColor.value.r, u.uSkyColor.value.g, u.uSkyColor.value.b];
  const bounce = [u.uBounceColor.value.r, u.uBounceColor.value.g, u.uBounceColor.value.b];
  const bounceLeg = bounce.map((x, i) => x + (sky[i] * (lum3(bounce) / Math.max(lum3(sky), 1e-4)) - x) * TUNE.fillSkyMix);
  const hemi = smoothstep(-0.72, 0.55, ny);
  let fill = bounceLeg.map((x, i) => (x * TUNE.bounceGain + (sky[i] - x * TUNE.bounceGain) * hemi) * u.uAmbIntensity.value);
  const sc = [u.uShadowColor.value.r, u.uShadowColor.value.g, u.uShadowColor.value.b];
  const scl = [u.uShadowColorLit.value.r, u.uShadowColorLit.value.g, u.uShadowColorLit.value.b];
  const dep = smoothstep(TUNE.shadowDepth[0], TUNE.shadowDepth[1], shadowMix);
  let shadX = scl.map((x, i) => x + (sc[i] - x) * dep);
  const warmT = WRAP.map((x) => x / Math.max(lum3(WRAP), 1e-4));
  const t = Math.min(1, Math.max(0, u.uSubjWarmShade.value));
  fill = fill.map((x, i) => x + (warmT[i] * lum3(fill) - x) * t);
  shadX = shadX.map((x, i) => x + (warmT[i] * lum3(shadX) - x) * t);
  const albChroma = chroma(alb);
  const hold = Math.min(1, Math.max(0, Math.max(u.uShadowHold.value, u.uSubjShadowHold.value)))
    * smoothstep(0, Math.max(u.uShadowHoldKnee.value, 1e-4), albChroma);
  const shadTint = albShadow.map((x, i) => x * shadX[i]);
  let shadHeld = albShadow.map((x) => x * lum3(shadX));
  shadHeld = shadHeld.map((x) => x * lum3(shadTint) / Math.max(lum3(shadHeld), 1e-5));
  const shadBand = shadTint.map((x, i) => x + (shadHeld[i] - x) * hold);
  const shadeForm = 1 - TUNE.shadeBand * (1 - ramp);
  const keyRad = [u.uKeyColor.value.r, u.uKeyColor.value.g, u.uKeyColor.value.b].map((x) => x * u.uKeyIntensity.value);
  /* the §277 hypothesis, spelled as §289's hold mirrored into the KEY multiply */
  const litTint = alb.map((x, i) => x * keyRad[i]);
  let litHeld = alb.map((x) => x * lum3(keyRad));
  litHeld = litHeld.map((x) => x * lum3(litTint) / Math.max(lum3(litHeld), 1e-5));
  const kh = Math.min(1, Math.max(0, keyMirrorHold)) * smoothstep(0, Math.max(u.uShadowHoldKnee.value, 1e-4), albChroma);
  const litBand = litTint.map((x, i) => x + (litHeld[i] - x) * kh);
  return alb.map((a, i) => litBand[i] * key
    + (albAmb[i] * fill[i] * ao + shadBand[i] * shadowMix * (0.55 + 0.45 * ao)
      + shadX[i] * TUNE.shadowWash * shadowMix * ao) * shadeForm);
}

/* ── 2. the §277 lit-band hypothesis, falsified ────────────────────────────────────────── */
console.log('\n2. the §277 hypothesis — §289\'s hold mirrored into the KEY multiply (traversal key):');
{
  const sh = shadingFor(0.77);
  for (const [label, cfg] of [['full key', { ramp: 1, shadow: 1 }], ['mid band', { ramp: 0.66, shadow: 1 }], ['low band', { ramp: 0.33, shadow: 1 }]]) {
    const a = grade(pixel(sh, { alb: ALB, ...cfg, keyMirrorHold: 0 })).map((x) => x / 255);
    const b = grade(pixel(sh, { alb: ALB, ...cfg, keyMirrorHold: 1 })).map((x) => x / 255);
    console.log(`   ${label}: display S ${chroma(a).toFixed(3)} -> ${chroma(b).toFixed(3)}  (L ${(lum3(a) * 255).toFixed(0)} -> ${(lum3(b) * 255).toFixed(0)})`);
  }
  console.log('   => a fully key-lit costume renders at display S ~0.60. The frames measure 0.08-0.21.');
  console.log('      The multiply is not the bleacher and mirroring §289 into it is a null.');
}

/* ── 3. what the frames actually decompose into ────────────────────────────────────────── */
const ROI = {
  traversal: { tod: 0.77, rect: [557, 261, 582, 291] },
  combat: { tod: 0.74, rect: [520, 468, 566, 522] },
  'sly-key': { tod: 0.80, rect: [600, 228, 675, 290] },
  'sly-closeup': { tod: 0.80, rect: [592, 228, 672, 292] },
};
/** the registered population: top half by luminance of the costume rect (PREREG §4). */
function litHalf(shot, rect) {
  const im = readPNG(path.join(ROOT, `shots/r12/${shot}.png`));
  const px = [];
  for (let y = rect[1]; y < rect[3]; y++) for (let x = rect[0]; x < rect[2]; x++) {
    const o = (y * im.w + x) * im.ch;
    const c = [im.data[o] / 255, im.data[o + 1] / 255, im.data[o + 2] / 255];
    px.push({ c, L: lum3(c) });
  }
  px.sort((a, b) => b.L - a.L);
  const keep = px.slice(0, Math.round(px.length / 2));
  const m = [0, 1, 2].map((i) => keep.reduce((s, p) => s + p.c[i], 0) / keep.length);
  let sS = 0; for (const p of keep) sS += chroma(p.c);
  return { n: keep.length, rgb: m, S: sS / keep.length };
}
console.log('\n3. the r12 frames: the costume rect\'s LIT half (top 50% by luma), and its fit');
const FIT = {};
for (const [shot, { tod, rect }] of Object.entries(ROI)) {
  const obs = litHalf(shot, rect);
  const sh = shadingFor(tod);
  let best = null;
  for (let ramp = 0; ramp <= 1.0001; ramp += 0.05)
    for (let shd = 0; shd <= 1.0001; shd += 0.1)
      for (let w = 0; w <= 0.7001; w += 0.005) {
        const d = grade(pixel(sh, { alb: ALB, ramp, shadow: shd }).map((x) => x + w));
        const err = Math.hypot(d[0] - obs.rgb[0] * 255, d[1] - obs.rgb[1] * 255, d[2] - obs.rgb[2] * 255);
        if (!best || err < best.err) best = { err, ramp, shd, w };
      }
  FIT[shot] = { ...best, tod, obs };
  console.log(`   ${shot.padEnd(12)} n ${String(obs.n).padStart(5)}  display (${obs.rgb.map((x) => (x * 255).toFixed(0))})  meanS ${obs.S.toFixed(3)}`
    + `  -> ramp ${best.ramp.toFixed(2)} shadow ${best.shd.toFixed(1)} additive ${best.w.toFixed(3)} (fit err ${best.err.toFixed(1)} L)`);
}
console.log('   => the two ACTION frames are barely key-lit and carry 1.2x / 5.2x the close-up\'s');
console.log('      achromatic additive. The blue is being ADDED OVER, not multiplied away.');

/* ── 4. the candidate ──────────────────────────────────────────────────────────────────── */
function compHold(out, alb, amount, knee = TUNE.shadowHoldKnee, slySkin = 1) {
  const albC = chroma(alb), outC = chroma(out);
  const loss = Math.min(1, Math.max(0, 1 - outC / Math.max(albC, 1e-4)));
  const h = Math.min(1, Math.max(0, amount)) * slySkin * smoothstep(0, Math.max(knee, 1e-4), albC) * loss;
  const held = alb.map((x) => x * (lum3(out) / Math.max(lum3(alb), 1e-4)));
  return { rgb: out.map((x, i) => x + (held[i] - x) * h), h, loss };
}
console.log(`\n4. the CANDIDATE at each shot's fitted state (knee ${TUNE.shadowHoldKnee}, display S / L / hue):`);
for (const [shot, f] of Object.entries(FIT)) {
  const sh = shadingFor(f.tod);
  const base = pixel(sh, { alb: ALB, ramp: f.ramp, shadow: f.shd }).map((x) => x + f.w);
  const d0 = grade(base).map((x) => x / 255);
  const cols = [`   ${shot.padEnd(12)} off S ${chroma(d0).toFixed(3)} L ${(lum3(d0) * 255).toFixed(0)} hue ${hueOf(d0).toFixed(0)}`];
  for (const amt of [0.40, 0.70, 1.00]) {
    const r = compHold(base, ALB, amt);
    const d = grade(r.rgb).map((x) => x / 255);
    cols.push(`| ${amt.toFixed(2)} (h ${r.h.toFixed(2)}) S ${chroma(d).toFixed(3)} L ${(lum3(d) * 255).toFixed(0)} hue ${hueOf(d).toFixed(0)}`);
  }
  console.log(cols.join(' '));
}
console.log('\n   knee/scope safety at the traversal state, hold 1.0:');
for (const [name, srgb] of [['cream fur', [232, 205, 168]], ['guard white', [235, 235, 232]], ['cane gold', [201, 154, 60]], ['ARCHITECTURE', [201, 145, 90]]]) {
  const a = srgb.map((x) => s2l(x / 255));
  const sh = shadingFor(0.77);
  const base = pixel(sh, { alb: a, ramp: FIT.traversal.ramp, shadow: FIT.traversal.shd }).map((x) => x + FIT.traversal.w);
  const r = compHold(base, a, 1.0, TUNE.shadowHoldKnee, name === 'ARCHITECTURE' ? 0 : 1);
  const d0 = grade(base), d1 = grade(r.rgb);
  console.log(`   ${name.padEnd(13)} albedo chroma ${chroma(a).toFixed(3)}  knee ${smoothstep(0, TUNE.shadowHoldKnee, chroma(a)).toFixed(3)}  loss ${r.loss.toFixed(2)}  h ${r.h.toFixed(3)}  display (${d0.map((x) => x.toFixed(0))}) -> (${d1.map((x) => x.toFixed(0))})`);
}
