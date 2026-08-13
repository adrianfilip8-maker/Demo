import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Shading, TUNE } from '../src/render/ToonMaterial.js';

/**
 * PREREG-redkey — the red-key saturation clamp's static contract.
 *
 * The mechanism is one block in setKeyLight (uKeyColor arrival). The contract has four legs
 * a later edit could silently break: the inert default (bit-identical build), the exactness
 * of the clamp target, the warm gate (the moon must never enter), and the debug override
 * the sealed A/B's arms rest on. Each is pinned here so a drift fails a test, not a critic
 * round.
 */

const linSat = (c) => {
  const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
  return mx > 1e-9 ? (mx - mn) / mx : 0;
};
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/* The shipped golden-hour key in linear (el 21–22, sat 0.648–0.650) and the moon.
   THREE.Color instances because setCol copies only isColor/hex/string — the payload's own
   shape (LIGHTING always sends a THREE.Color; a bare {r,g,b} would be dropped unread). */
const WARM = new THREE.Color(1.0, 0.692, 0.350);
const MOON = new THREE.Color(0.342, 0.552, 1.0);
const MIDDAY = new THREE.Color(1.0, 0.888, 0.716);   // interior's key, linear sat 0.284

test('redkey: TUNE.keySatMax ships at the inert 1.0', () => {
  assert.equal(TUNE.keySatMax, 1.0,
    'TUNE.keySatMax is not the registered fallback 1.0 — it moves to a value below 1 only ' +
    'alongside a PASS under PREREG-redkey, with the RESULT cited here');
});

test('redkey: at 1.0 the clamp is untaken — uKeyColor is the incoming colour exactly', () => {
  const s = new Shading({});
  s.setKeyLight({ color: WARM, intensity: 3.3 });
  const c = s.uniforms.uKeyColor.value;
  assert.equal(c.r, WARM.r); assert.equal(c.g, WARM.g); assert.equal(c.b, WARM.b);
});

test('redkey: a debug override below 1 clamps a warm key to exactly satMax, luma-matched', () => {
  const s = new Shading({ debug: { keySatMax: 0.45 } });
  const L0 = lum(WARM);
  s.setKeyLight({ color: WARM, intensity: 3.3 });
  const c = s.uniforms.uKeyColor.value;
  assert.ok(Math.abs(linSat(c) - 0.45) < 1e-9, `sat ${linSat(c)} != 0.45 — the solve drifted`);
  assert.ok(Math.abs(lum(c) - L0) < 1e-9, `luma ${lum(c)} != ${L0} — the clamp is buying hue with brightness`);
  assert.ok(c.r > c.g && c.g > c.b, 'channel order changed — the clamp rotated the hue');
});

test('redkey: the moon never enters (r > b gate) and the midday key sits under the ceiling', () => {
  const s = new Shading({ debug: { keySatMax: 0.45 } });
  s.setKeyLight({ color: MOON, intensity: 0.62 });
  let c = s.uniforms.uKeyColor.value;
  assert.equal(c.r, MOON.r); assert.equal(c.g, MOON.g); assert.equal(c.b, MOON.b);
  s.setKeyLight({ color: MIDDAY, intensity: 4.05 });
  c = s.uniforms.uKeyColor.value;
  assert.equal(c.r, MIDDAY.r); assert.equal(c.g, MIDDAY.g); assert.equal(c.b, MIDDAY.b);
});

test('redkey: the override is read per publish — poke, then null falls back to TUNE', () => {
  const eng = { debug: { keySatMax: 0.45 } };
  const s = new Shading(eng);
  s.setKeyLight({ color: WARM });
  assert.ok(Math.abs(linSat(s.uniforms.uKeyColor.value) - 0.45) < 1e-9, 'poke did not reach the clamp');
  eng.debug.keySatMax = null;
  s.setKeyLight({ color: WARM });
  const c = s.uniforms.uKeyColor.value;
  assert.equal(c.r, WARM.r, 'clearing the override must fall back to TUNE (1.0 = untaken)');
  assert.equal(c.b, WARM.b);
});

test('redkey: the clamp recomputes from the incoming colour — off/back pokes restore exactly', () => {
  const eng = { debug: { keySatMax: 1.0 } };
  const s = new Shading(eng);
  s.setKeyLight({ color: WARM });
  const before = { ...s.uniforms.uKeyColor.value };
  eng.debug.keySatMax = 0.45;
  s.setKeyLight({ color: WARM });
  eng.debug.keySatMax = 1.0;
  s.setKeyLight({ color: WARM });
  const after = s.uniforms.uKeyColor.value;
  assert.equal(after.r, before.r); assert.equal(after.g, before.g); assert.equal(after.b, before.b);
});
