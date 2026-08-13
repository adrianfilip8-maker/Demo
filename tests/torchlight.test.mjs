import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TOON_PARS, TOON_SHADE } from '../src/render/shaders/toon.glsl.js';
import { Shading } from '../src/render/ToonMaterial.js';
import { Lighting } from '../src/render/Lighting.js';

/**
 * PREREG-torchlight — the local torch term's static contract.
 *
 * The mechanism spans three files (LIGHTING publishes TUNE.localToon → setKeyLight writes
 * uLocalToon → TOON_SHADE consumes the promoted point lights), and each hop has a shape that
 * a later edit could silently break without any capture noticing until a critic round:
 *
 *   1. the GLSL block only exists behind NUM_POINT_LIGHTS > 0 and its loop must stay in the
 *      EXACT spelling three's unrollLoops can rewrite — a formatting drift there does not
 *      fail to compile, it fails to unroll, and on some stacks that is a silent no-light;
 *   2. the declarations it calls into (lights_pars_begin) must SURVIVE _patch's cuts;
 *   3. the uniform must ship at 0 (bit-identical pre-seal build) and the setKeyLight write
 *      must be number-gated so a harness poke sticks (the uShadowHold contract);
 *   4. LIGHTING must actually publish, and debug.localToon must override TUNE (the A/B
 *      lever every arm of the seal's capture rests on).
 */

/* ── 1. the GLSL block ─────────────────────────────────────────────────────────────────── */

test('torchlight: TOON_PARS declares the gain and the cap; TOON_SHADE consumes them', () => {
  assert.ok(/uniform\s+float\s+uLocalToon\s*;/.test(TOON_PARS), 'uLocalToon not declared');
  assert.ok(/const\s+float\s+SLY_LOCAL_CAP\s*=\s*1\.6\s*;/.test(TOON_PARS), 'SLY_LOCAL_CAP not declared at 1.6');
  assert.ok(TOON_SHADE.includes('if ( uLocalToon > 0.0 )'),
    'the branch-on-uniform gate is gone — 0 is no longer arithmetic-free');
  assert.ok(TOON_SHADE.includes('SLY_LOCAL_CAP'), 'the cap is declared but never applied');
  assert.ok(TOON_SHADE.includes('getPointLightInfo( pointLights[ i ], slyViewPos, slyLocalL )'),
    'the punctual accumulation call is gone or reshaped');
});

test('torchlight: the block is guarded on NUM_POINT_LIGHTS and gated underground', () => {
  const at = TOON_SHADE.indexOf('uLocalToon > 0.0');
  const guard = TOON_SHADE.lastIndexOf('#if NUM_POINT_LIGHTS > 0', at);
  assert.ok(guard >= 0 && at - guard < 400,
    'the term is not inside a #if NUM_POINT_LIGHTS > 0 guard — a scene with no point lights would not compile');
  assert.ok(/slyLocalY\s*<\s*-0\.5\s*\?\s*1\.0\s*:\s*0\.0/.test(TOON_SHADE),
    'the underground gate (world y < -0.5) is gone — above-ground fires would light the toon set');
});

test('torchlight: the unrolled loop matches three r185\'s unrollLoops spelling exactly', () => {
  /* three replaces NUM_POINT_LIGHTS with a literal (replaceLightNums) and then rewrites the
     loop with unrollLoopPattern. Run the REAL pattern from WebGLProgram.js over the block at a
     literal count and require it to fire and to index all six lights — this is what catches a
     whitespace drift that still compiles as a (non-unrolled) dynamic loop on one stack and
     fails on another. Pattern duplicated verbatim from three r185 WebGLProgram.js. */
  const unrollLoopPattern = /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;
  const src = TOON_SHADE.replace(/NUM_POINT_LIGHTS/g, '6');
  const m = unrollLoopPattern.exec(src);
  assert.ok(m, 'unrollLoopPattern does not match the torch loop — three would ship it un-unrolled');
  assert.equal(m[2], '6');
  const body = m[3];
  /* Inside an unrolled body, `i` may appear ONLY as `[ i ]` — anything else survives the
     rewrite as a bare undeclared identifier. */
  const stripped = body.replace(/\[\s*i\s*\]/g, '[]');
  assert.ok(!/\bi\b/.test(stripped), 'loop body uses `i` outside a [ i ] index — unrolling would break it');
  /* And no declaration inside the body: unrolling duplicates it into a redeclaration error. */
  assert.ok(!/\b(float|vec[234]|int)\s+\w+\s*=/.test(stripped.replace(/\/\*[\s\S]*?\*\//g, '')),
    'loop body declares a variable — six unrolled copies would redeclare it');
});

test('torchlight: _patch keeps the declarations the term calls into, and still cuts the uses', () => {
  const stub = { _patchWarned: false, _warn() {} };
  const patched = Shading.prototype._patch.call(stub, THREE.ShaderLib.physical.fragmentShader);
  assert.ok(patched.includes('#include <lights_pars_begin>'),
    'lights_pars_begin was cut — getPointLightInfo/pointLights no longer exist for the torch term');
  assert.ok(!patched.includes('#include <lights_fragment_begin>'),
    'lights_fragment_begin survived the cut — the PBR accumulation is back');
  assert.ok(patched.includes('uLocalToon'), 'the torch term did not reach the patched source');
  const decl = /uniform\s+float\s+uLocalToon\s*;/.test(patched);
  const uses = (patched.match(/uLocalToon/g) || []).length;
  assert.ok(decl && uses >= 2, `uLocalToon declared=${decl}, mentions=${uses} — it reaches nothing`);
});

/* ── 2. the uniform contract ───────────────────────────────────────────────────────────── */

test('torchlight: ships at 0, writes on number, sticks on omission', () => {
  const s = new Shading({});
  assert.equal(s.uniforms.uLocalToon.value, 0.0, 'uLocalToon must default 0 — bit-identical pre-seal build');
  s.setKeyLight({ local: 2.5 });
  assert.equal(s.uniforms.uLocalToon.value, 2.5);
  s.setKeyLight({});                       // publisher goes quiet: the poke must stick
  assert.equal(s.uniforms.uLocalToon.value, 2.5,
    'setKeyLight without `local` overwrote the uniform — the poke-sticks contract is broken');
  s.setKeyLight({ local: 0 });
  assert.equal(s.uniforms.uLocalToon.value, 0, 'an explicit 0 must be written (falsy is not absent)');
});

/* ── 3. the publish ────────────────────────────────────────────────────────────────────── */

function fakeEngine() {
  const seen = [];
  const shading = { setKeyLight(p) { seen.push(p.local); } };
  const eng = {
    camera: new THREE.PerspectiveCamera(), debug: {},
    scene: { add() {}, remove() {} }, on() { return () => {}; }, warn() {},
    quality: 'high', settings: {},
    get(k) { return k === 'shading' ? shading : null; },
  };
  return { eng, seen };
}

test('torchlight: LIGHTING publishes TUNE.localToon and debug.localToon overrides it', () => {
  const { eng, seen } = fakeEngine();
  const L = new Lighting(eng);
  assert.equal(L.TUNE.localToon, 2.5,
    'TUNE.localToon is not the shipped 2.5 — RESULT-torchlight3.md: the one-boot poke A/B ' +
    'passed 42/42 bars; if a later seal moves this value, update the pin alongside it with ' +
    'the new RESULT cited, not silenced');
  L._publishKeyLight();
  assert.equal(seen.at(-1), 2.5, 'the payload does not carry TUNE.localToon');
  eng.debug.localToon = 0;
  L._publishKeyLight();
  assert.equal(seen.at(-1), 0, 'debug.localToon = 0 must reach the payload (the A/B null arm)');
  eng.debug.localToon = 6.0;
  L._publishKeyLight();
  assert.equal(seen.at(-1), 6.0, 'debug.localToon must override TUNE (the kbover arm)');
  eng.debug.localToon = null;
  L._publishKeyLight();
  assert.equal(seen.at(-1), 2.5, 'clearing the override must fall back to TUNE');
});
