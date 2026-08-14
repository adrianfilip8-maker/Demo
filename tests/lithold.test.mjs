import test from 'node:test';
import assert from 'node:assert/strict';
import { Shading, TUNE } from '../src/render/ToonMaterial.js';
import { TOON_PARS, TOON_SHADE } from '../src/render/shaders/toon.glsl.js';

/**
 * PREREG-lithold — the subject's lit-side chroma hold, static contract.
 *
 * The mechanism is one GLSL block immediately after the `outgoingLight = diff + sss + ...`
 * assembly, behind `uSubjLitHold > 0.0` (untaken at the shipped 0.0, so HEAD renders exactly
 * as before). GLSL cannot be executed here, so this pins two things: the SPELLING of every
 * scope leg the seal's protection bars rest on, and — in a JS mirror of the same arithmetic —
 * the three properties the seal actually claims:
 *
 *   1. luminance is EXACT at any hold amount (both mix endpoints share lum(outgoingLight)),
 *      so this can never buy chroma with brightness;
 *   2. the endpoint is the surface's own albedo hue, so the hold can never exceed the
 *      material's authored chroma;
 *   3. the environment and achromatic subject materials are no-ops (vSlySkin 0 exactly, and
 *      §269's knee at an albedo chroma of 0.03).
 *
 * A drift in any of them fails a test, not a critic round.
 */

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const chroma = (c) => { const mx = Math.max(...c); return mx > 1e-9 ? (mx - Math.min(...c)) / mx : 0; };
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** JS mirror of the spelled GLSL block — the same order of operations, same clamps. */
function litHold(out, alb, { amount, slySkin, knee }) {
  const albChroma = chroma(alb);
  const outChroma = chroma(out);
  const loss = Math.min(1, Math.max(0, 1 - outChroma / Math.max(albChroma, 1e-4)));
  const h = Math.min(1, Math.max(0, amount)) * slySkin
    * smoothstep(0, Math.max(knee, 1e-4), albChroma) * loss;
  const held = alb.map((x) => x * (lum(out) / Math.max(lum(alb), 1e-4)));
  return { rgb: out.map((x, i) => x + (held[i] - x) * h), h };
}

/* The costume blue as it ships (sly_body_fix.png's torso population, sRGB 19/89/212 ->
   linear) and the two materials the knee is there to protect. */
const s2l = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const COSTUME = [19, 89, 212].map((x) => s2l(x / 255));
const GUARD_WHITE = [235, 235, 232].map((x) => s2l(x / 255));

test('lithold: TUNE.subjLitHold ships at the inert 0.0', () => {
  assert.equal(TUNE.subjLitHold, 0.0,
    'TUNE.subjLitHold is not the registered fallback 0.0 — it moves above 0 only alongside a ' +
    'PASS under PREREG-lithold, with the RESULT cited in the TUNE comment');
});

test('lithold: the shared uniform exists at the TUNE default', () => {
  const s = new Shading({});
  assert.equal(s.uniforms.uSubjLitHold?.value, 0.0, 'uSubjLitHold missing or non-default');
});

test('lithold: nothing republishes the uniform — a harness poke must stick', () => {
  const s = new Shading({});
  s.uniforms.uSubjLitHold.value = 0.7;
  /* every per-frame publisher the sealed A/B runs between its poke and its capture */
  s.setKeyLight({ color: { isColor: true, r: 1, g: 0.69, b: 0.35 }, intensity: 3.3, nightAmount: 0 });
  s.setKeyLight({ color: { isColor: true, r: 1, g: 0.69, b: 0.35 }, intensity: 3.3, nightAmount: 1 });
  assert.equal(s.uniforms.uSubjLitHold.value, 0.7,
    'a publisher overwrote uSubjLitHold — the one-boot poke A/B (PREREG-lithold §5) rests on ' +
    'this uniform being shared by identity and written only at construction');
});

test('lithold: the GLSL declares the uniform and reads it in TOON_SHADE', () => {
  assert.ok(TOON_PARS.includes('uniform float uSubjLitHold;'), 'uSubjLitHold not declared');
  assert.ok(TOON_SHADE.includes('uSubjLitHold'), 'uSubjLitHold never read in TOON_SHADE');
});

test('lithold: every scope leg of the branch is spelled exactly', () => {
  assert.ok(TOON_SHADE.includes('if ( uSubjLitHold > 0.0 ) {'),
    'the untaken-at-0 gate must be spelled as a branch — at 0.0 no arithmetic may run');
  assert.ok(TOON_SHADE.includes('clamp( uSubjLitHold, 0.0, 1.0 ) * vSlySkin'),
    'the vSlySkin subject scope drifted — the whole environment protection rests on it');
  assert.ok(TOON_SHADE.includes('smoothstep( 0.0, max( uShadowHoldKnee, 1e-4 ), slyLitAlbChroma )'),
    "§269's albedo-chroma knee drifted — achromatic materials must stay no-ops");
  assert.ok(TOON_SHADE.includes('clamp( 1.0 - slyLitOutChroma / max( slyLitAlbChroma, 1e-4 ), 0.0, 1.0 )'),
    'the chroma-LOSS factor drifted — the close-up protections rest on it');
  assert.ok(TOON_SHADE.includes('vec3 slyLitHeld = alb * ( slyLum( outgoingLight ) / max( slyLum( alb ), 1e-4 ) );'),
    'the held endpoint drifted — it must be the albedo carried to the composite luminance');
  assert.ok(TOON_SHADE.includes('outgoingLight = mix( outgoingLight, slyLitHeld, slyLitH );'),
    'the mix drifted');
});

test('lithold: the block sits after the full assembly and before the haze mix', () => {
  const iAsm = TOON_SHADE.indexOf('outgoingLight = diff + sss + spec + metalEnv + rim + emissiveTerm;');
  const iBranch = TOON_SHADE.indexOf('if ( uSubjLitHold > 0.0 ) {');
  const iHaze = TOON_SHADE.indexOf('outgoingLight = mix( outgoingLight, slyHazeColor( rd ), haze );');
  assert.ok(iAsm >= 0 && iBranch > iAsm,
    'the hold must act on the ASSEMBLED colour — the additive spec/rim legs are the measured ' +
    'bleacher (PREREG-lithold §0), so a hold placed inside diff would miss them');
  assert.ok(iHaze > iBranch, 'the hold must run before the haze mix, not after it');
});

test('lithold: luminance is exact at every amount — a chroma lever, never a brightness one', () => {
  const out = [0.14, 0.19, 0.26];
  for (const amount of [0.1, 0.4, 0.7, 1.0]) {
    const r = litHold(out, COSTUME, { amount, slySkin: 1, knee: TUNE.shadowHoldKnee });
    assert.ok(Math.abs(lum(r.rgb) - lum(out)) < 1e-12,
      `amount ${amount}: luminance moved by ${lum(r.rgb) - lum(out)} — the endpoints no longer share it`);
  }
});

test('lithold: the hold gives chroma back but can never exceed the albedo\'s own', () => {
  const out = [0.14, 0.19, 0.26];                   // a bleached costume pixel
  const base = chroma(out);
  let prev = base;
  for (const amount of [0.25, 0.5, 0.75, 1.0]) {
    const c = chroma(litHold(out, COSTUME, { amount, slySkin: 1, knee: TUNE.shadowHoldKnee }).rgb);
    assert.ok(c > prev - 1e-9, `amount ${amount}: chroma went down (${prev} -> ${c})`);
    assert.ok(c <= chroma(COSTUME) + 1e-9, `amount ${amount}: chroma ${c} exceeds the albedo's ${chroma(COSTUME)}`);
    prev = c;
  }
  assert.ok(prev > base + 0.10, 'at full hold a bleached pixel recovers no chroma at all');
});

test('lithold: the environment is untouched by construction (vSlySkin 0)', () => {
  const out = [0.31, 0.22, 0.14];                   // lit sandstone
  const alb = [0.42, 0.20, 0.06];
  const r = litHold(out, alb, { amount: 1.0, slySkin: 0, knee: TUNE.shadowHoldKnee });
  assert.equal(r.h, 0, 'the mix factor must be exactly 0 off the subject');
  for (let i = 0; i < 3; i++) assert.equal(r.rgb[i], out[i], 'an architecture channel moved');
});

test('lithold: an achromatic subject material is a no-op through the knee', () => {
  const out = [0.30, 0.27, 0.25];
  const r = litHold(out, GUARD_WHITE, { amount: 1.0, slySkin: 1, knee: TUNE.shadowHoldKnee });
  assert.ok(r.h < 0.05, `the guards' identity-white took a hold of ${r.h} — the knee is not holding`);
});

test('lithold: a costume that still reads blue takes little correction (the loss factor)', () => {
  const bleached = litHold([0.14, 0.19, 0.26], COSTUME, { amount: 0.7, slySkin: 1, knee: TUNE.shadowHoldKnee });
  const healthy = litHold([0.03, 0.14, 0.52], COSTUME, { amount: 0.7, slySkin: 1, knee: TUNE.shadowHoldKnee });
  assert.ok(healthy.h < bleached.h * 0.5,
    `the close-up protection rests on this: healthy h ${healthy.h} vs bleached ${bleached.h}`);
});
