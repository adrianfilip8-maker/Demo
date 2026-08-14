import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TUNE as POSTFX_TUNE } from '../src/render/PostFX.js';
import { TUNE as TOON_TUNE } from '../src/render/ToonMaterial.js';

/**
 * PREREG-rimfloor2 — the MECHANISM pin, landed with the knob and BEFORE any candidate frame.
 *
 * §306/RESULT-fxartifact falsified the first seam-glint lever: both architecture surface-rim
 * floor arms (`rimShadowFloorArch` 0.20 / 0.10) missed their E bars (dunes r0.42, night r0.49,
 * guard r0.87 at 0.10), and the run's report-only `s10` arm showed the SCREEN-space rim's own
 * shadow floor removing a further 23% (dunes) / 10% (night) on top of a fully-cut arch floor —
 * i.e. it owns the majority of what the arch floor cannot reach.
 *
 * `rimShadowFloor` cannot simply be lowered: the population it holds up includes the
 * CHARACTER's shadow-side silhouette rim. So the follow-up knob cuts the floor OFF-SUBJECT
 * only, scoped by ledger #31's prepass mask exactly as ToonMaterial scopes its surface twin by
 * `vSlySkin`. This file pins that scoping — including the character contract on the OTHER
 * floor, which this seal may ship in the same commit and must not weaken.
 */

const PF = readFileSync(path.join(import.meta.dirname, '../src/render/PostFX.js'), 'utf8');
const GLSL = readFileSync(path.join(import.meta.dirname, '../src/render/shaders/toon.glsl.js'), 'utf8');

test('rimfloor2: the off-subject cut is inert in HEAD', () => {
  assert.equal(POSTFX_TUNE.rimFloorOffCut, 0,
    'TUNE.rimFloorOffCut is nonzero — no value ships without PREREG-rimfloor2\'s frame verdict');
  assert.equal(POSTFX_TUNE.rimShadowFloor, 0.45,
    'TUNE.rimShadowFloor moved — the seal cuts the floor OFF-SUBJECT, it does not lower the '
    + 'floor itself (that is what the character contract forbids)');
});

test('rimfloor2: 0 is skipped by a BRANCH, not collapsed by a mix', () => {
  assert.ok(PF.includes('float rimFloor = uRimShadowFloor;'),
    'the composite must take the plain uniform as its default rim floor');
  assert.ok(PF.includes('if ( uRimFloorOffCut > 0.0 ) {'),
    'the cut must be inside a branch — a mix() collapsing to the identity is only '
    + 'approximately the shipped image, a skipped branch is byte-for-byte the shipped image');
  assert.ok(PF.includes('float amt = edge.g * uRimStrength * mix( rimFloor, 1.0, edge.b );'),
    'the rim amplitude line must consume rimFloor (PREREG-rimfloor2 §2)');
  assert.ok(PF.includes('uniform float uRimFloorOffCut;'), 'uRimFloorOffCut declaration missing');
  assert.ok(PF.includes('cu.uRimFloorOffCut.value = this.tune.rimFloorOffCut;'),
    're-read per frame or the one-boot A/B cannot poke tune.rimFloorOffCut (§40)');
});

test('rimfloor2: the subject mask is read from the prepass and DILATED by one texel', () => {
  assert.ok(PF.includes('float subj = 1.0 - texture2D( uNormal, vUv ).a;'),
    'ledger #31\'s inverted subject mask must be the scoping signal (every way of failing to '
    + 'write the tag lands on "not the subject", which is the fail-closed direction)');
  const taps = (PF.match(/subj = max\( subj, 1\.0 - texture2D\( uNormal, vUv [+-] vec2\(/g) || []).length;
  assert.equal(taps, 4,
    `the mask must be dilated by a 4-tap cross (found ${taps}); the rim band straddles the `
    + 'silhouette and an undilated tap shaves the outer half of the character\'s own rim');
  assert.ok(PF.includes('uNormal: this.shared.uNormal,'),
    'the composite must bind the shared normal-prepass texture');
});

test('rimfloor2: the vSlySkin 0.55 character contract on the surface rim is untouched', () => {
  assert.ok(GLSL.includes('float rimShadeFloor = mix( uRimShadowFloorArch, 0.55, vSlySkin );'),
    'the surface-rim character pin was respelled — at vSlySkin = 1 the floor must be EXACTLY '
    + '0.55 whatever uRimShadowFloorArch becomes (PREREG-seamglint §2, carried by rimfloor2)');
  assert.equal(TOON_TUNE.rimShadowFloorArch, 0.55,
    'rimShadowFloorArch moved — RESULT-fxartifact says it ships only as the second half of a '
    + 'combined candidate, and only on PREREG-rimfloor2\'s verdict');
});
