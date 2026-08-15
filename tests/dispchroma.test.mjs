/**
 * PREREG-dispchroma's pin tests. The mechanism ships INERT at 0.0 and these hold it there:
 * a seal that can be silently switched on by an unrelated edit is not a seal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = readFileSync(path.join(ROOT, 'src/render/PostFX.js'), 'utf8');

test('dispChromaHold ships INERT at 0.0', () => {
  assert.match(SRC, /dispChromaHold:\s*0\.0,/,
    'TUNE.dispChromaHold must remain 0.0 until PREREG-dispchroma PASSES with its RESULT cited');
});

test('dispChromaHold is a BRANCH, so 0 is bit-identical rather than a collapsing mix', () => {
  assert.match(SRC, /if\s*\(\s*uDispChromaHold\s*>\s*0\.0\s*\)/,
    'the lever must be guarded by a branch — a mix at 0 still evaluates and still rounds');
});

test('dispChromaHold sits AFTER the tonemap encode, which is the whole point (§333)', () => {
  const enc = SRC.indexOf('c = slyLinearToSrgb( c );');
  const brk = SRC.indexOf('if ( uDispChromaHold > 0.0 )');
  const agx = SRC.indexOf('c = slyAgX( c, 1.0, uToneShoulder );');
  assert.ok(enc > 0 && brk > 0 && agx > 0, 'anchors present');
  assert.ok(agx < enc, 'AgX must precede the encode');
  assert.ok(brk > enc,
    'the hold must sit AFTER slyLinearToSrgb — placed before it, AgX undoes it, which is exactly '
    + 'why subjLitHold failed (§330/§332/§333)');
});

test('dispChromaHold is subject-scoped through ledger #31 mask, not applied globally', () => {
  const i = SRC.indexOf('if ( uDispChromaHold > 0.0 )');
  const block = SRC.slice(i, i + 900);
  assert.match(block, /texture2D\(\s*uNormal,\s*vUv\s*\)\.a/,
    'scope must come from the normal prepass alpha (1 - subject), the channel bloomSubjectCut uses');
});

test('dispChromaHold is luminance-exact by construction', () => {
  const i = SRC.indexOf('if ( uDispChromaHold > 0.0 )');
  const block = SRC.slice(i, i + 900);
  assert.match(block, /slyLuma\(\s*c\s*\)/, 'the mix endpoint must be the pixel luma');
  assert.match(block, /mix\(\s*vec3\(\s*dchL\s*\),\s*c,\s*dchS\s*\)/,
    'must mix between vec3(luma) and c so luminance is preserved for any dose');
});

test('the uniform is wired from TUNE, so the pin above actually reaches the shader', () => {
  assert.match(SRC, /uDispChromaHold:\s*\{\s*value:\s*this\.tune\.dispChromaHold\s*\}/);
  assert.match(SRC, /uniform float uDispChromaHold;/);
});

/* These two exist because the original pins asserted the uniform was DECLARED and that it was
   WIRED, but not that both happened in the SAME material. A uniform declared in one shader and
   wired into another compiles to a silent no-op or a boot-time GLSL error, and either way costs
   a capture to discover. Caught while reading the wiring back, before the seal's first frame. */
test('uDispChromaHold is declared in the SAME shader body that does the tonemap and encode', () => {
  const decl = SRC.indexOf('uniform float uDispChromaHold;');
  const brk = SRC.indexOf('if ( uDispChromaHold > 0.0 )');
  assert.ok(decl > 0 && brk > decl, 'declaration must precede the branch');
  const between = SRC.slice(decl, brk);
  assert.ok(between.includes('c = slyAgX( c, 1.0, uToneShoulder );'),
    'the tonemap must lie between the declaration and the branch — proves one contiguous shader');
  assert.ok(between.includes('c = slyLinearToSrgb( c );'),
    'the encode must lie between the declaration and the branch — proves one contiguous shader');
  assert.ok(!between.includes("passMaterial('"),
    'no other material may open between them, or declaration and branch are in different shaders');
});

test('uDispChromaHold is wired into the COMPOSITE material, not a neighbouring pass', () => {
  const comp = SRC.indexOf("passMaterial('postfx.composite'");
  assert.ok(comp > 0, 'composite material anchor present');
  const wire = SRC.indexOf('uDispChromaHold: { value: this.tune.dispChromaHold }');
  assert.ok(wire > comp, 'the wiring must come after the composite material opens');
  const nextMat = SRC.indexOf("passMaterial('", comp + 10);
  assert.ok(nextMat === -1 || wire < nextMat,
    'the wiring must come before the next material opens, i.e. inside composite uniforms');
});
