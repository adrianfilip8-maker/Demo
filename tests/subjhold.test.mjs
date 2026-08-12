import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * PREREG-subjhold.md's candidate scaffolding, pinned at the source (the lever-test pattern).
 *
 * The knob defaults to 0.0 — bit-identical by arithmetic (max(uShadowHold, 0·vSlySkin) =
 * uShadowHold) — and ONLY that seal's SHIP verdict may move it. These tests pin the three
 * pieces that make the arm honest: the default, the per-frame publish (a latched uniform
 * silently reverts pokes — the rimGain trap), and the vSlySkin scoping in the shader.
 */

const TM = new URL('../src/render/ToonMaterial.js', import.meta.url).pathname;
const GLSL = new URL('../src/render/shaders/toon.glsl.js', import.meta.url).pathname;

test('subjShadowHold defaults to 0.0 — the shipped build is unchanged until PREREG-subjhold SHIPs', () => {
  const src = readFileSync(TM, 'utf8');
  assert.match(src, /subjShadowHold: 0\.0,/,
    'TUNE.subjShadowHold no longer defaults to 0.0. Moving this default is a pixel change '
    + 'across every skinned draw in every shot; only PREREG-subjhold.md\'s SHIP verdict '
    + '(or a successor seal) may do it.');
});

test('subjShadowHold is published per frame, so harness pokes stick and readbacks are live', () => {
  const src = readFileSync(TM, 'utf8');
  assert.match(src, /u\.uSubjShadowHold\.value = TUNE\.subjShadowHold;/,
    'uSubjShadowHold is no longer republished from TUNE at setKeyLight — a poked uniform '
    + 'would silently revert (the uRimGain trap, ToonMaterial "HARNESS AUTHORS" note).');
  assert.match(src, /uSubjShadowHold: \{ value: TUNE\.subjShadowHold \}/,
    'uSubjShadowHold missing from the uniform block');
});

test('the shader scopes the subject hold by vSlySkin and keeps the global knob intact', () => {
  const src = readFileSync(GLSL, 'utf8');
  assert.match(src, /max\( uShadowHold, uSubjShadowHold \* vSlySkin \)/,
    'the hold expression no longer combines the global and subject knobs via max() — '
    + 'architecture scoping (vSlySkin = 0) is what makes PROT-ARCH hold by construction');
  assert.match(src, /uniform float uSubjShadowHold;/, 'uSubjShadowHold not declared in the shader');
});
