import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Shading, TUNE } from '../src/render/ToonMaterial.js';

/**
 * PREREG-nightfloor — the §2.2 night shadow floor's static contract.
 *
 * The mechanism is one gated lerp on the floor feeding _refreshShadowColor's k: effective
 * floor = lerp(published floor, shadowFloorNight, nightAmount), taken only when
 * shadowFloorNight is strictly greater AND nightAmount > 0. Pinned legs: the inert default
 * (== shadowFloor -> the strict `>` gate is untaken), the exact x1.12 channel-uniform lift
 * at night (luminance-only — the hue cannot rotate because k scales the whole vector), the
 * daylight identity BY BRANCH at any value (published nightAmount is exactly 0.0 on all
 * fourteen daylight canonicals — §221.1's pattern), and the per-publish debug override.
 */

const MOON = new THREE.Color(0.342, 0.552, 1.0);
const MID = new THREE.Color(1.0, 0.888, 0.716);
const NIGHT = () => ({ color: MOON, intensity: 0.62, ambient: { intensity: 0.10, floor: 0.14 }, nightAmount: 1 });
const DAY = () => ({ color: MID, intensity: 4.05, ambient: { intensity: 0.586, floor: 0.14 }, nightAmount: 0 });

test('nightfloor: TUNE.shadowFloorNight ships at 0.14 per RESULT-gradetrio', () => {
  assert.equal(TUNE.shadowFloorNight, 0.14,
    'TUNE.shadowFloorNight is not the shipped 0.14 (§2.2\'s SHADOW_FLOOR) — ' +
    'RESULT-gradetrio.md: nightfloor passed all bars + LOOK; a later move needs its own ' +
    'RESULT cited here, not silence');
  assert.ok(TUNE.shadowFloorNight > TUNE.shadowFloor,
    'the shipped night floor must exceed the day floor, or the strict > gate is untaken ' +
    'and the ship is a silent no-op');
});

test('nightfloor: the debug override at the shipped value is an exact no-op', () => {
  const a = new Shading({ debug: {} });
  a.setKeyLight(NIGHT());
  const b = new Shading({ debug: { shadowFloorNight: 0.14 } });
  b.setKeyLight(NIGHT());
  for (const ch of ['r', 'g', 'b']) {
    assert.equal(a.uniforms.uShadowColor.value[ch], b.uniforms.uShadowColor.value[ch]);
    assert.equal(a.uniforms.uShadowColorLit.value[ch], b.uniforms.uShadowColorLit.value[ch]);
  }
});

test('nightfloor: at night 0.14 lifts the shadow light by exactly x1.12 per channel', () => {
  const off = new Shading({ debug: { shadowFloorNight: 0.125 } });
  off.setKeyLight(NIGHT());
  const on = new Shading({ debug: { shadowFloorNight: 0.14 } });
  on.setKeyLight(NIGHT());
  for (const ch of ['r', 'g', 'b']) {
    const r = on.uniforms.uShadowColor.value[ch] / off.uniforms.uShadowColor.value[ch];
    assert.ok(Math.abs(r - 1.12) < 1e-9, `channel ${ch} ratio ${r} != 0.14/0.125 — the lift must be luminance-only`);
  }
});

test('nightfloor: daylight is identical BY BRANCH at any value', () => {
  const off = new Shading({ debug: {} });
  off.setKeyLight(DAY());
  const on = new Shading({ debug: { shadowFloorNight: 0.14 } });
  on.setKeyLight(DAY());
  for (const ch of ['r', 'g', 'b']) {
    assert.equal(on.uniforms.uShadowColor.value[ch], off.uniforms.uShadowColor.value[ch],
      'published nightAmount 0 must leave the day floor untouched exactly');
  }
});

test('nightfloor: a partial nightAmount lerps the floor (twilight continuity)', () => {
  const off = new Shading({ debug: { shadowFloorNight: 0.125 } });
  off.setKeyLight({ ...NIGHT(), nightAmount: 0.5 });
  const on = new Shading({ debug: { shadowFloorNight: 0.14 } });
  on.setKeyLight({ ...NIGHT(), nightAmount: 0.5 });
  const r = on.uniforms.uShadowColor.value.b / off.uniforms.uShadowColor.value.b;
  // floor 0.125 -> 0.125 + (0.14-0.125)*0.5 = 0.1325 -> x1.06
  assert.ok(Math.abs(r - 1.06) < 1e-9, `half-night lift ${r} != x1.06`);
});

test('nightfloor: the dose value 0.18 lifts x1.44 and the override restores exactly', () => {
  const eng = { debug: { shadowFloorNight: 0.125 } };
  const s = new Shading(eng);
  s.setKeyLight(NIGHT());
  const base = { ...s.uniforms.uShadowColor.value };
  eng.debug.shadowFloorNight = 0.18; s.setKeyLight(NIGHT());
  assert.ok(Math.abs(s.uniforms.uShadowColor.value.b / base.b - 1.44) < 1e-9, 'dose arm x1.44');
  eng.debug.shadowFloorNight = 0.125; s.setKeyLight(NIGHT());
  assert.equal(s.uniforms.uShadowColor.value.b, base.b, 'restore is exact');
  eng.debug.shadowFloorNight = null; s.setKeyLight(NIGHT());
  assert.ok(Math.abs(s.uniforms.uShadowColor.value.b / base.b - 1.12) < 1e-9,
    'null falls back to TUNE (shipped 0.14 = x1.12 over the 0.125 base leg)');
});
