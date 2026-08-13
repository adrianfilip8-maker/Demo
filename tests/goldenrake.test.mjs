import test from 'node:test';
import assert from 'node:assert/strict';
import { Shading, TUNE } from '../src/render/ToonMaterial.js';
import { TOON_PARS, TOON_SHADE } from '../src/render/shaders/toon.glsl.js';

/**
 * PREREG-goldenrake — the golden-hour raking key's static contract.
 *
 * The mechanism is one GLSL block directly after slyRamp in TOON_SHADE, behind
 * `uRakeTrack > 0.0` (untaken at the shipped 0.0). GLSL cannot be executed here, so the
 * SPELLING is pinned the way tests/torchlight.test.mjs pins the y-gate: each scope leg the
 * seal's protection bars rest on must exist verbatim, and a JS mirror of the terminator
 * arithmetic pins the semantics (floor-at-22° promotion, el-33 no-op, midday clamp
 * identity). A drift here fails a test, not a critic round.
 */

test('goldenrake: TUNE ships inert — rakeTrack 0.0, rakeGap 0.05', () => {
  assert.equal(TUNE.rakeTrack, 0.0,
    'TUNE.rakeTrack is not the registered fallback 0.0 — it moves to 1.0 only alongside a ' +
    'PASS under PREREG-goldenrake, with the RESULT cited here');
  assert.equal(TUNE.rakeGap, 0.05, 'the registered gap constant');
});

test('goldenrake: the shared uniforms exist at the TUNE defaults', () => {
  const s = new Shading({});
  assert.equal(s.uniforms.uRakeTrack?.value, 0.0, 'uRakeTrack missing or non-default');
  assert.equal(s.uniforms.uRakeGap?.value, 0.05, 'uRakeGap missing or non-default');
});

test('goldenrake: the GLSL declares and reads both uniforms', () => {
  assert.ok(TOON_PARS.includes('uniform float uRakeTrack;'), 'uRakeTrack not declared');
  assert.ok(TOON_PARS.includes('uniform float uRakeGap;'), 'uRakeGap not declared');
  assert.ok(TOON_SHADE.includes('uRakeTrack'), 'uRakeTrack never read in TOON_SHADE');
  assert.ok(TOON_SHADE.includes('uRakeGap'), 'uRakeGap never read in TOON_SHADE');
});

test('goldenrake: every scope leg of the branch is spelled exactly', () => {
  assert.ok(TOON_SHADE.includes('if ( uRakeTrack > 0.0 && uKeyColor.r > uKeyColor.b )'),
    'the untaken-at-0 gate + warm-key (moon-exempt) gate must be one spelled condition');
  assert.ok(TOON_SHADE.includes('clamp( uKeyDir.y - uRakeGap, uTermLo + 2.0 * uTermSoft, uTermHi )'),
    'the elevation-tracking terminator with the high clamp (midday identity) drifted');
  assert.ok(TOON_SHADE.includes('* ( 1.0 - vSlySkin )'),
    'the subject exemption leg drifted — the costume band layout protection rests on it');
  assert.ok(TOON_SHADE.includes('step( 1.5, rakeSteps )'),
    'the 2-band material exemption drifted');
  assert.ok(TOON_SHADE.includes('smoothstep( 0.55, 0.80, Nw.y )'),
    'the near-horizontal orientation gate drifted');
  assert.ok(TOON_SHADE.includes('ramp = clamp( ramp, 0.0, 1.0 );'),
    'the post-promotion ramp clamp drifted');
});

test('goldenrake: the block sits between slyRamp and the key multiply', () => {
  const iRamp = TOON_SHADE.indexOf('float ramp = slyRamp( ndl, uBands );');
  const iBranch = TOON_SHADE.indexOf('if ( uRakeTrack > 0.0');
  const iKey = TOON_SHADE.indexOf('float key = ramp * sh;');
  assert.ok(iRamp >= 0 && iBranch > iRamp && iKey > iBranch,
    'the promotion must act on ramp AFTER quantisation and BEFORE the shadow multiply');
});

test('goldenrake: the terminator arithmetic (JS mirror of the spelled formula)', () => {
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lo = 0.14, hi = 0.52, soft = 0.024;
  const rampOf = (ndl, rakeHi) => {
    const base = (smoothstep(lo - soft, lo + soft, ndl) + smoothstep(hi - soft, hi + soft, ndl)) / 2;
    const promo = (smoothstep(rakeHi - soft, rakeHi + soft, ndl) - smoothstep(hi - soft, hi + soft, ndl)) / 2;
    return Math.min(1, Math.max(0, base + promo));
  };
  const rakeHiAt = (keyDirY) => Math.min(Math.max(keyDirY - TUNE.rakeGap, lo + 2 * soft), hi);
  // el 22 (the §2.2 flagship): a horizontal deck moves mid -> full
  const ndl22 = Math.sin(22 * Math.PI / 180);
  assert.equal(rampOf(ndl22, hi), 0.5, 'pre-seal: the 22° floor is locked at half key');
  assert.equal(rampOf(ndl22, rakeHiAt(ndl22)), 1.0, 'with the tracked terminator it is fully lit');
  // el 33 (temple): floors are already full; the move is a no-op on them
  const ndl33 = Math.sin(33 * Math.PI / 180);
  assert.equal(rampOf(ndl33, hi), rampOf(ndl33, rakeHiAt(ndl33)), 'el 33 floors unchanged');
  // el 76 (interior key): the clamp lands rakeHi exactly on termHi — identity by arithmetic
  assert.equal(rakeHiAt(Math.sin(76 * Math.PI / 180)), hi, 'midday clamps to termHi (delta == 0 exactly)');
});
