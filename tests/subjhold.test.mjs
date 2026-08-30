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

test('subjShadowHold ships at 1.0 — PREREG-subjhold2\'s full-green SHIP verdict set it', () => {
  const src = readFileSync(TM, 'utf8');
  /* RESULT-subjhold2.md: P2-MID in band on both mids, close-up held, face Δ ≤ 1 count,
     architecture corners 0, night cooler with the moonlit LOOK intact. Moving this default
     in EITHER direction is a pixel change across every skinned draw in every shot and needs
     its own sealed capture (§141.1). */
  assert.match(src, /subjShadowHold: 1\.0,/,
    'TUNE.subjShadowHold no longer defaults to 1.0. This default was set by a sealed SHIP '
    + '(PREREG-subjhold2); changing it needs a successor seal, not an edit.');
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
  /* §738 added a THIRD scope (uMatShadowHold, per material) as another max leg. The property
     this arm exists to protect is unchanged and is still asserted: the knobs COMBINE BY MAX, so
     a scope that does not apply contributes exactly 0 and PROT-ARCH holds by construction rather
     than by tolerance. The regex is widened to admit the third leg and no further — it still
     requires `uSubjShadowHold * vSlySkin` to be the subject's term, so dropping the vSlySkin
     factor (which would repaint the architecture) still turns this red. */
  assert.match(src, /max\( uShadowHold, max\( uSubjShadowHold \* vSlySkin, uMatShadowHold \) \)/,
    'the hold expression no longer combines the global, subject and per-material knobs via '
    + 'max() — architecture scoping (vSlySkin = 0, uMatShadowHold = 0) is what makes PROT-ARCH '
    + 'hold by construction');
  assert.match(src, /uniform float uSubjShadowHold;/, 'uSubjShadowHold not declared in the shader');
  assert.match(src, /uniform float uMatShadowHold;/, 'uMatShadowHold not declared in the shader');
});

test('guardfix: the Carmelita merge synthesizes the colour attribute its materials expect', () => {
  /* PREREG-guardfix: sanitized import geometry (no `color`) under vertexColors:true materials
     multiplies albedo by an unbound attribute = (0,0,0) — the §290 black-mannequin guard.
     The merge site must hand the identity attribute to any geometry that lacks it. */
  const src = readFileSync(new URL('../src/ai/Guard.js', import.meta.url).pathname, 'utf8');
  assert.match(src, /!g\.getAttribute\('color'\)/,
    "the Carmelita merge no longer checks for a missing colour attribute");
  assert.match(src, /new Float32Array\(n \* 3\)\.fill\(1\)/,
    "the merge no longer synthesizes the identity colour attribute (§290 regresses)");
});
