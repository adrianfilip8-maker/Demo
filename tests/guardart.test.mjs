import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';

import {
  GUARD_TUNE, GUARD_DRESS, paintGuardRegions, shiftGuardSkin,
} from '../src/ai/Guard.js';
import { Shading } from '../src/render/ToonMaterial.js';
import { TOON_PARS, TOON_SHADE } from '../src/render/shaders/toon.glsl.js';

/**
 * guardpass pins — PREREG-guardart / PREREG-guardcone (DESIGN-guardpass.md).
 *
 * The two seals' mechanisms ship INERT: every default below is the branch-untaken HEAD
 * behaviour, and the sealed one-boot A/B pokes them per shot. These pins hold the inert
 * state until a RESULT flips them (the gradetrio convention: a value moves only alongside a
 * PASS, and the new value gets pinned with its RESULT cited).
 *
 * Every data-driven test asserts a non-zero inspected count (§211.1).
 */

/* ── the inert defaults ─────────────────────────────────────────────────────────────────── */

test('guardpass: TUNE ships inert — both seals unlanded', () => {
  assert.equal(GUARD_TUNE.guardArt, 0,
    'guardArt moved off 0 without a RESULT-guardart PASS cited here (PREREG-guardart)');
  assert.equal(GUARD_TUNE.guardSkin, 0,
    'guardSkin moved off 0 without a RESULT-guardart PASS cited here');
  assert.equal(GUARD_TUNE.coneShape, 0,
    'coneShape moved off 0 without a RESULT-guardcone PASS cited here (PREREG-guardcone)');
  assert.equal(GUARD_TUNE.beamCoreScale, 1.0,
    'beamCoreScale is a x-multiplier on the beam basis: 1.0 is the exact-identity default');
  assert.equal(GUARD_TUNE.lampToon, 0.0,
    'lampToon gains the uGuardLamp publish: 0.0 publishes w = 0 (branch untaken)');
  assert.deepEqual(GUARD_TUNE.lampWindow, [0.26, 0.56],
    'the registered day-exactness window (daylight canonicals sit >= 0.72 _light)');
  /* The candidate-branch constants (unread at coneShape 0) — pinned so the sealed arms
     poke the registered values, not drifted ones. */
  assert.equal(GUARD_TUNE.coneAtten, 13.0);
  assert.equal(GUARD_TUNE.coneCap, 1.30);
  assert.equal(GUARD_TUNE.coneEdge, 0.35);
  assert.equal(GUARD_TUNE.coneDust, 0.65);
  assert.equal(GUARD_TUNE.coneGrad, 0.85);
  /* Task #14's shipped night grade (d526dd8) is prior art the cone seal must compose with,
     not replace — pinned against a silent re-warm. */
  assert.equal(GUARD_TUNE.colNight, 0xbfe6ff, 'colNight is task #14 shipped material');
  assert.equal(GUARD_TUNE.beamNight, 0.55, 'beamNight is task #14 shipped material');
});

/* ── the (A) pure mechanisms: exact roundtrip ───────────────────────────────────────────── */

function syntheticCarm() {
  const n = 12;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = i * 0.1; pos[i * 3 + 1] = 1 + i * 0.05; pos[i * 3 + 2] = -i * 0.07; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(n * 4).map((_, i) => i % 5), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(n * 4).fill(0.25), 4));
  const regions = [
    { name: 'Coat', group: 0, start: 0, count: 6 },
    { name: 'Hair_LP', group: 1, start: 6, count: 6 },
  ];
  return { g, regions, n };
}

test('paintGuardRegions: identity in, exact identity back (the poke/restore contract)', () => {
  const { g, regions, n } = syntheticCarm();
  const before = Float32Array.from(g.getAttribute('color').array);

  // Restore on a never-painted geometry must not touch the attribute at all.
  assert.equal(paintGuardRegions(g, regions, null), false,
    'restore wrote an unpainted geometry — the default boot is no longer bit-identical');
  assert.deepEqual(Array.from(g.getAttribute('color').array), Array.from(before));

  assert.equal(paintGuardRegions(g, regions, GUARD_DRESS), true);
  assert.equal(g.userData.slyGuardPainted, true);
  const painted = Float32Array.from(g.getAttribute('color').array);
  let moved = 0;
  for (let i = 0; i < painted.length; i++) if (painted[i] !== before[i]) moved++;
  assert.ok(moved > n, `paint moved only ${moved} floats — the dress did not land`);

  // Paint is deterministic: painting again is byte-identical.
  paintGuardRegions(g, regions, null);
  paintGuardRegions(g, regions, GUARD_DRESS);
  assert.deepEqual(Array.from(g.getAttribute('color').array), Array.from(painted),
    'repaint is not deterministic — the A/B off/on/back bracket would leak');

  paintGuardRegions(g, regions, null);
  assert.deepEqual(Array.from(g.getAttribute('color').array), Array.from(before),
    'restore is not exact — back-validity [0,0] is unreachable');
  assert.equal(g.userData.slyGuardPainted, false);
});

test('shiftGuardSkin: +1 on, -1 back, integers exact, idempotent per direction', () => {
  const { g } = syntheticCarm();
  const before = Uint16Array.from(g.getAttribute('skinIndex').array);
  assert.equal(shiftGuardSkin(g, false), false, 'off on a never-shifted geometry must be a no-op');
  assert.equal(shiftGuardSkin(g, true), true);
  assert.equal(shiftGuardSkin(g, true), false, 'double-apply must be refused (idempotence flag)');
  const arr = g.getAttribute('skinIndex').array;
  let inspected = 0;
  for (let i = 0; i < arr.length; i++) { inspected++; assert.equal(arr[i], before[i] + 1); }
  assert.ok(inspected >= 48, `inspected only ${inspected} indices`);
  assert.equal(shiftGuardSkin(g, false), true);
  assert.deepEqual(Array.from(g.getAttribute('skinIndex').array), Array.from(before),
    'the -1 restore is not exact');
});

/* ── the beam shader: candidate branch present, legacy branch verbatim ──────────────────── */

test('BEAM_FRAG carries the uConeShape gate AND the byte-level legacy spellings', () => {
  const src = readFileSync('src/ai/Guard.js', 'utf8');
  for (const [re, what] of [
    [/uniform float uConeShape;/, 'the uConeShape uniform'],
    [/if \( uConeShape > 0\.5 \)/, 'the candidate gate'],
    [/1\.0 \/ \( 1\.0 \+ 7\.0 \* t \* t \)/, 'the legacy attenuation (7.0 hardcoded)'],
    [/clamp\( a, 0\.0, 4\.0 \)/, 'the legacy 4.0 cap'],
    [/pow\( abs\( dot\( normalize\( vN \), V \) \), 1\.85 \)/, 'the legacy body weighting'],
    [/pow\( max\( 0\.0, 1\.0 - d \), 3\.0 \) \* 1\.7 \* uOpacity/, 'the legacy lamp card'],
    [/uConeShape: \{ value: TUNE\.coneShape \}/, 'the uniform born from TUNE'],
  ]) assert.ok(re.test(src), `Guard.js lost ${what} — the off arm is no longer the HEAD picture`);
});

/* ── the lamp term: declared, consumed, capped, branch-untaken at w 0 ────────────────────── */

test('toon.glsl.js declares and reads the guard-lamp uniforms behind the w-gate', () => {
  assert.ok(TOON_PARS.includes('uniform vec4 uGuardLampPos;'), 'uGuardLampPos not declared');
  assert.ok(TOON_PARS.includes('uniform vec3 uGuardLampColor;'), 'uGuardLampColor not declared');
  assert.ok(TOON_SHADE.includes('if ( uGuardLampPos.w > 0.0 )'),
    'the lamp term is not gated on w > 0 — the inert build is no longer branch-untaken');
  const term = TOON_SHADE.split('if ( uGuardLampPos.w > 0.0 )')[1]?.split('}')[0] || '';
  assert.ok(term.includes('SLY_LOCAL_CAP'), 'the lamp term lost its cap — it could feed bloom');
  assert.ok(term.includes('uGuardLampColor'), 'the lamp term never reads its colour');
});

test('the shared uniforms exist at the inert defaults (w = 0, colour black)', () => {
  const s = new Shading({});
  const p = s.uniforms.uGuardLampPos?.value;
  const c = s.uniforms.uGuardLampColor?.value;
  assert.ok(p && typeof p.w === 'number', 'uGuardLampPos missing from the shared block');
  assert.equal(p.w, 0, 'uGuardLampPos.w must boot 0 — the branch must be untaken until GUARDS publishes');
  assert.ok(c, 'uGuardLampColor missing from the shared block');
  assert.equal(c.r + c.g + c.b, 0, 'uGuardLampColor must boot black');
});

/* ── the dress covers every region the merge emits (GLB-gated, carmguard's shape) ────────── */

const ASSET = 'public/assets/sly-anim/carmelita-guard.glb';
test('GUARD_DRESS names every Carmelita region — an unnamed region would paint white', async () => {
  if (!existsSync(ASSET)) return;         // headless environments without the asset skip
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { bindToRig3 } = await import('../src/ai/CarmelitaGuard.js');
  const buf = readFileSync(ASSET);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  const bound = bindToRig3(gltf.scene);
  assert.ok(Array.isArray(bound.regions) && bound.regions.length >= 20,
    `bindToRig3 returned ${bound.regions?.length ?? 0} regions — the metadata is missing`);
  const nV = bound.geometry.getAttribute('position').count;
  let covered = 0, inspected = 0;
  const missing = [];
  for (const r of bound.regions) {
    inspected++;
    covered += r.count;
    if (GUARD_DRESS[r.name] === undefined) missing.push(r.name);
  }
  assert.ok(inspected >= 20, `inspected only ${inspected} regions`);
  assert.equal(covered, nV, `regions cover ${covered}/${nV} vertices — starts have drifted`);
  assert.deepEqual(missing, [], 'regions with no GUARD_DRESS entry would render identity white');
  // Contiguity: regions are disjoint and ascending by construction.
  let off = 0;
  for (const r of bound.regions) { assert.equal(r.start, off, `region ${r.name} starts at ${r.start}, expected ${off}`); off += r.count; }
});
