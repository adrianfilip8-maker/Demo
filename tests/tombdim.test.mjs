import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Shading, TUNE } from '../src/render/ToonMaterial.js';

/**
 * PREREG-tombdim — the interior ambient hierarchy's static contract.
 *
 * The mechanism is one factor in setKeyLight (camera-height scoped, recomputed per
 * publish) applied to the published ambient.intensity and to _refreshShadowColor's floor.
 * Four legs a later edit could silently break, each pinned: the inert default
 * (bit-identical build), the exact-at-full-weight spelling (uAmb == published * tombAmb,
 * equality not tolerance), the above-ground identity (weight exactly 0 -> factor exactly
 * 1, even while poked), and the per-publish debug override the sealed A/B's arms rest on.
 */

const MID = new THREE.Color(1.0, 0.888, 0.716);   // the interior's midday key, linear
const PAY = () => ({
  color: MID, intensity: 4.05,
  ambient: { intensity: 0.586, floor: 0.14 }, nightAmount: 0,
});
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

test('tombdim: TUNE.tombAmb ships at the inert 1.0', () => {
  assert.equal(TUNE.tombAmb, 1.0,
    'TUNE.tombAmb is not the registered fallback 1.0 — it moves below 1 only alongside a ' +
    'PASS under PREREG-tombdim, with the RESULT cited here');
});

test('tombdim: at 1.0 the gate is untaken — underground camera changes nothing', () => {
  const a = new Shading({ debug: {}, camera: { position: { y: -9.2 } } });
  a.setKeyLight(PAY());
  const b = new Shading({ debug: { tombAmb: 1.0 }, camera: { position: { y: -9.2 } } });
  b.setKeyLight(PAY());
  assert.equal(a.uniforms.uAmbIntensity.value, 0.586);
  assert.equal(a.uniforms.uAmbIntensity.value, b.uniforms.uAmbIntensity.value);
  assert.equal(a.uniforms.uShadowColor.value.r, b.uniforms.uShadowColor.value.r);
});

test('tombdim: poked underground, the fill scales by exactly tombAmb and the floor releases the cap', () => {
  const off = new Shading({ debug: {}, camera: { position: { y: -9.2 } } });
  off.setKeyLight(PAY());
  const on = new Shading({ debug: { tombAmb: 0.30 }, camera: { position: { y: -9.2 } } });
  on.setKeyLight(PAY());
  assert.equal(on.uniforms.uAmbIntensity.value, 0.586 * 0.30,
    'full-weight factor must be tombAmb EXACTLY (the x + 0 spelling) — the scorer asserts equality');
  const ratio = lum(on.uniforms.uShadowColor.value) / lum(off.uniforms.uShadowColor.value);
  assert.ok(ratio > 0.38 && ratio < 0.44,
    `capped interior floor releases under the dim: lum ratio ${ratio} (cap-release predicts ~0.409, not 0.30)`);
});

test('tombdim: above ground the factor is exactly 1 even while poked', () => {
  const off = new Shading({ debug: {}, camera: { position: { y: 1.15 } } });
  off.setKeyLight(PAY());
  const on = new Shading({ debug: { tombAmb: 0.30 }, camera: { position: { y: 1.15 } } });
  on.setKeyLight(PAY());
  assert.equal(on.uniforms.uAmbIntensity.value, 0.586, 'y 1.15 is above the -0.5 gate: no scale');
  assert.equal(on.uniforms.uAmbIntensity.value, off.uniforms.uAmbIntensity.value);
  for (const ch of ['r', 'g', 'b']) {
    assert.equal(on.uniforms.uShadowColor.value[ch], off.uniforms.uShadowColor.value[ch],
      'uShadowColor must be bit-identical above ground at any tombAmb');
  }
  assert.equal(on._tombF, 1);
});

test('tombdim: the transition band is a smoothstep on camera y, full by -2.5', () => {
  const at = (y, v) => {
    const s = new Shading({ debug: { tombAmb: v }, camera: { position: { y } } });
    s.setKeyLight(PAY());
    return s._tombF;
  };
  assert.equal(at(-0.5, 0.30), 1, 'exactly at the gate edge: untaken (camY < -0.5 is strict)');
  const mid = at(-1.5, 0.30);
  assert.ok(mid > 0.30 && mid < 1, `midpoint weight partial: f ${mid}`);
  assert.equal(at(-2.5, 0.30), 0.30, 'full weight at -2.5: f == tombAmb exactly');
  assert.equal(at(-9.2, 0.30), 0.30, 'the staged interior camera is fully inside');
});

test('tombdim: the override is read per publish — poke, restore, and null-falls-back are exact', () => {
  const eng = { debug: { tombAmb: 1.0 }, camera: { position: { y: -9.2 } } };
  const s = new Shading(eng);
  s.setKeyLight(PAY());
  const before = {
    amb: s.uniforms.uAmbIntensity.value,
    sc: { ...s.uniforms.uShadowColor.value },
  };
  eng.debug.tombAmb = 0.30; s.setKeyLight(PAY());
  assert.equal(s.uniforms.uAmbIntensity.value, 0.586 * 0.30, 'poke reaches the factor');
  eng.debug.tombAmb = 1.0; s.setKeyLight(PAY());
  assert.equal(s.uniforms.uAmbIntensity.value, before.amb, 'restore is exact');
  assert.equal(s.uniforms.uShadowColor.value.r, before.sc.r);
  eng.debug.tombAmb = null; s.setKeyLight(PAY());
  assert.equal(s.uniforms.uAmbIntensity.value, before.amb, 'null falls back to TUNE (1.0 = untaken)');
});
