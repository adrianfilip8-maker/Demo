import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TUNE as POSTFX_TUNE } from '../src/render/PostFX.js';

/**
 * PREREG-fxink2 — the MECHANISM pin, landed with the knob and BEFORE any candidate frame.
 *
 * §306/RESULT-fxartifact falsified the first ink-exclusion lever on a fully valid run. The
 * candidate derived "an FX is in front of this pixel" from scene ALPHA (additive draws
 * accumulate past 1) and the signal leaked badly: 13,834 changed px on `hero` at 36%
 * containment, 75,045 on `combat` at 60%, all eleven C bars FAIL. Mapping the leaked pixels
 * back onto the frames named the source — they lie on ink lines crossing the SUNLIT FLOOR
 * POOLS, i.e. world decals, with no FX quad near them.
 *
 * The replacement takes the signal from the FX DRAW ITSELF: FX.beginMaskPass() puts the
 * participating materials into coverage mode, PostFX renders `fx.root` into uFxMask, and the
 * ink is multiplied down by that coverage. Containment is then a property of the construction
 * rather than a claim about blend state.
 *
 * What this file protects: the knob is inert; 0 is skipped by CONTROL FLOW on both sides (no
 * mask pass, no gate branch) rather than by a multiply; the gate reads the mask and not scene
 * alpha; every participating FX shader carries the coverage branch; and world decals are
 * excluded from the mask, which is the design decision the falsification paid for.
 */

const SRC = (p) => readFileSync(path.join(import.meta.dirname, '..', p), 'utf8');
const PF = SRC('src/render/PostFX.js');
const PARTICLES = SRC('src/fx/Particles.js');
const TRAILS = SRC('src/fx/Trails.js');

test('fxink2: the knob is inert in HEAD', () => {
  assert.equal(POSTFX_TUNE.fxInkCut, 0,
    'TUNE.fxInkCut is nonzero — no value ships without PREREG-fxink2\'s frame verdict');
});

test('fxink2: 0 skips the mask PASS and the gate BRANCH — not a multiply by zero', () => {
  assert.ok(PF.includes('if (this.tune.fxInkCut > 0) {'),
    'the mask pass must be skipped by control flow at 0 (a pass whose strength is 0 still '
    + 'runs, still samples and still costs — skipping is the only thing that is provably nothing)');
  assert.ok(PF.includes('if ( uFxInkCut > 0.0 ) {')
    && PF.includes('line *= 1.0 - clamp( uFxInkCut * texture2D( uFxMask, vUv ).r, 0.0, 1.0 );'),
    'the composite gate must be inside a branch and must read uFxMask');
  assert.ok(!PF.includes('slySceneC.a - 1.0'),
    'the FALSIFIED alpha-excess gate must not be in the tree: §306 measured it firing on '
    + 'world decals far outside any FX coverage');
  assert.ok(PF.includes('cu.uFxInkCut.value = this.tune.fxInkCut;'),
    're-read per frame or the one-boot A/B cannot poke tune.fxInkCut (§40)');
});

test('fxink2: the mask is rendered from the FX root with the FX materials in coverage mode', () => {
  assert.ok(PF.includes('fx?.beginMaskPass?.()') && PF.includes('fx.endMaskPass();'),
    'PostFX must ask FX for the mask root and restore it in a finally — a throw that left the '
    + 'materials in coverage mode would render the game as a white-on-black mask');
  assert.ok(PF.includes('renderer.render(fxRoot, cam);'), 'the mask pass must draw the FX root');
  assert.ok(PARTICLES.includes('beginMaskPass()') && PARTICLES.includes('endMaskPass()'),
    'the FX module owns which FX are coverage; PostFX owns the target');
  assert.ok(PARTICLES.includes('maskPass: { value: 0 },'),
    'the coverage flag must be ONE shared uniform object, base 0');
});

test('fxink2: every participating FX shader carries the coverage branch', () => {
  const n = (PARTICLES.match(/if \( uFxMaskPass > 0\.5 \)/g) || []).length;
  assert.equal(n, 4,
    `expected the coverage branch in all four Particles.js shaders (particles, shafts, flames, `
    + `sparkles); found ${n}. A shader without it draws its ordinary colour into the mask.`);
  assert.ok(TRAILS.includes('if ( uFxMaskPass > 0.5 )'),
    'the trail shader must carry it — the swing band is the r11 defect this seal is named for');
  const wired = (PARTICLES.match(/uFxMaskPass: /g) || []).length;
  assert.equal(wired, 4, `expected four Particles.js materials wired to the shared flag, found ${wired}`);
  assert.ok(TRAILS.includes('uFxMaskPass: opts.maskPass ?? { value: 0 },'),
    'the trail material must take the shared flag and fall back to the shipped 0');
});

test('fxink2: world decals are EXCLUDED from the coverage mask', () => {
  assert.ok(PARTICLES.includes('if (this.decals?.mesh) this.decals.mesh.visible = false;'),
    'decals must be hidden for the mask pass — a decal is a mark ON a surface, exactly like '
    + 'the ink, and §306 measured the decal pools as the falsified gate\'s leak site');
});
