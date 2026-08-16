import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SHOTS, SHOT_NAMES } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere, PALETTE } from '../src/render/Atmosphere.js';
import { TUNE as POST_TUNE, liftScale } from '../src/render/PostFX.js';
import { Lighting } from '../src/render/Lighting.js';

/**
 * Guards for the three clock-gated terms landed against critic pass 7 defects #8, #9 and #12.
 * All of it is arithmetic over `Shots.js` + `Atmosphere.js` + the two TUNE blocks, so it is free
 * and permanent — no renderer, no capture, no harness lock.
 *
 * The thing every test here is really protecting is a CLAIM ABOUT INERTNESS. Two of the three
 * changes are asserted to leave part of the shot set bit-identical (`liftDayScale` on the two
 * moon-keyed shots, `rimClock` on the fourteen daylight ones), and an inertness claim is the
 * easiest kind to satisfy by accident: a lever that never reaches its consumer is inert
 * everywhere and passes. So, per §218, **every inertness assertion below is paired with an arm
 * that MUST move**, and the moving arm is asserted first. A run where the calibration arm is
 * quiet reports UNSCOREABLE, not "no regression".
 */

const state = createAtmosphereState();

/* ── defect #8 — the composite black-lift, faded out by dayAmount ─────────────────────── */

test('lift: the day gate is exactly 1 at night and exactly the tune value in daylight', () => {
  /* `liftScale` is the whole of the gate, hoisted out of `render()` so it can be checked here.
     Both endpoints must be EXACT, not close: the night claim is "bit-identical", which is a
     statement about IEEE arithmetic, and `1 + (k-1)*0` delivers it for every finite k. */
  for (const k of [0.35, 0.1, 0.9, 1.0, 2.5]) {
    assert.equal(liftScale(k, 0), 1,
      `liftScale(${k}, dayAmount 0) = ${liftScale(k, 0)}; the moon-keyed shots must take the shipped lift exactly`);
    assert.equal(liftScale(k, 1), k,
      `liftScale(${k}, dayAmount 1) = ${liftScale(k, 1)}; a daylight shot must take the tune value exactly`);
  }
  // CALIBRATION ARM: the gate has to be capable of moving something at all.
  assert.ok(liftScale(0, 1) !== liftScale(0, 0),
    'CALIBRATION FAILED: the extreme scale 0 gives the same result in day and night, so the gate is not a gate');
  assert.equal(liftScale(0, 1), 0, 'liftScale(0, 1) must collapse the lift entirely — that is the A/B floor arm');
});

test('lift: every canonical shot sits at a gate endpoint, so no frame is half-lifted', () => {
  /* The gate is a lerp on `dayAmount`, and a shot landing at 0.4 would be neither the shipped
     look nor the candidate — impossible to score and impossible to explain. Checked rather than
     assumed: the sun-elevation smoothstep is [-7, 4] degrees and every canonical tod is far from
     that window. If a shot is ever authored into twilight this goes red on purpose. */
  let day = 0, night = 0;
  const rows = [];
  for (const name of SHOT_NAMES) {
    const at = evalAtmosphere(SHOTS[name].tod, state);
    rows.push(`${name} dayAmount ${at.dayAmount.toFixed(4)}`);
    if (at.dayAmount === 1) day++;
    else if (at.dayAmount === 0) night++;
  }
  assert.equal(day + night, SHOT_NAMES.length,
    `a canonical shot is in twilight, where the lift gate is partial:\n  ${rows.join('\n  ')}`);
  assert.equal(night, 3, `expected exactly 3 fully-night shots, saw ${night}:\n  ${rows.join('\n  ')}`);
  assert.ok(day >= 12, `only ${day} fully-daylight shots inspected`);
});

test('lift: the shipped scale keeps a toe and keeps the deep-black hue', () => {
  /* Two properties the value was derived from, both cheap to break by "just rounding it".
     (1) It is a REDUCTION, not a removal — 0 would put the composite's own black floor at
         display L 0.0 and delete the toe the term exists for.
     (2) The per-channel RATIO is preserved, because the lift's blue-heavy asymmetry is the
         deliberate cool tint of the deepest blacks (§2.1.3). A scalar cannot change it; this
         asserts that it stayed a scalar and did not become three numbers. */
  const k = POST_TUNE.liftDayScale;
  assert.equal(typeof k, 'number', 'TUNE.liftDayScale is missing — the day gate is not wired');
  assert.ok(k > 0 && k < 1,
    `TUNE.liftDayScale ${k} is outside (0, 1); at 0 the toe is gone, at 1 the change is a no-op`);
  const lift = POST_TUNE.lift;
  assert.equal(lift.length, 3);
  assert.ok(lift[2] > lift[0] && lift[0] > lift[1],
    `TUNE.lift ${JSON.stringify(lift)} is no longer blue-heaviest / green-lightest; the scaled ` +
    `lift inherits whatever asymmetry is here, so a change of sign belongs with a re-derivation`);
  // The derivation: the largest scale whose own black floor stays under one 8-bit code is 0.42.
  assert.ok(k <= 0.42,
    `TUNE.liftDayScale ${k} puts the composite's black floor above one display code (the value was ` +
    `derived as "floor < 1.0 L", which is k <= 0.42); re-derive rather than widen`);
});

/* ── defect #12 — the screen rim finally gets a clock ─────────────────────────────────── */

/** Raw 0..1 sRGB components of a hex — `PostFX.displayColor`, which is not exported. */
const displayColor = (hex) => new THREE.Color(
  ((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

test('rim: LIGHTING\'s published colour must be CONVERTED, not copied (§214.2\'s diff, corrected)', () => {
  /* §214.2 asked for `cu.uRimLit.value.copy(L.rimColor)`. `uRimLit` is added after
     `slyLinearToSrgb` and is display-space; `L.rimColor` is a THREE.Color and is therefore
     LINEAR. A straight copy delivers a different colour in EVERY shot, daylight included.
     Both halves are asserted: the conversion round-trips, and the un-converted copy does not —
     the second is the calibration arm, and without it "the conversion is correct" is untestable. */
  const linear = new THREE.Color(PALETTE.rimCool);            // what LIGHTING publishes by day
  const want = displayColor(PALETTE.rimCool);                 // what the uniform is meant to hold
  const converted = new THREE.Color().copyLinearToSRGB(linear);

  const dConv = Math.max(Math.abs(converted.r - want.r), Math.abs(converted.g - want.g), Math.abs(converted.b - want.b));
  const dRaw = Math.max(Math.abs(linear.r - want.r), Math.abs(linear.g - want.g), Math.abs(linear.b - want.b));

  // CALIBRATION ARM FIRST: the uncorrected diff has to be visibly wrong, or this test is theatre.
  assert.ok(dRaw > 0.25,
    `CALIBRATION FAILED: a raw linear copy of rimCool differs from the display value by only ` +
    `${dRaw.toFixed(4)}, so the linear/display distinction this test defends does not exist here`);
  assert.ok(dConv < 1e-5,
    `copyLinearToSRGB(rimCool) is ${dConv.toFixed(6)} from the shipped constant — the daylight rim ` +
    `would move, and the day leg is supposed to be the identity`);
});

test('rim: the clock reaches both legs, and only the moon-keyed shots', () => {
  /* The lit leg alone cannot fix defect #12 and this records why in a form that stays true:
     the composite picks `mix(uRimShade, uRimLit, edge.b)` on the lit-side mask, and §214.1's
     own geometry says `night` is ~180° backlit — so edge.b ~ 0 there and the night rim is drawn
     in uRimShade. Both legs therefore have to move at night, and neither may move by day. */
  let dayShots = 0, moonShots = 0;
  const rows = [];
  for (const name of SHOT_NAMES) {
    const at = evalAtmosphere(SHOTS[name].tod, state);
    rows.push(`${name} night ${at.nightAmount.toFixed(3)} rim #${at.rimColor.getHexString()} hemiSky #${at.hemiSky.getHexString()}`);
    if (at.nightAmount === 0) {
      dayShots++;
      // The gate is `nightAmount > 0`; at exactly 0 the uniforms are never written.
      assert.equal(at.nightAmount, 0, `${name} is not exactly 0 night`);
    } else if (at.nightAmount === 1) {
      moonShots++;
      const warm = new THREE.Color(PALETTE.rimWarm);
      assert.ok(at.rimColor.getHex() === warm.getHex(),
        `${name}: LIGHTING publishes rim #${at.rimColor.getHexString()} at full night, not rimWarm ` +
        `#${warm.getHexString()} — the lit leg would carry a daylight colour into the night frames`);
      // The shadow leg's night target must actually be darker than the daylight constant,
      // or swapping to it changes nothing and defect #12's "full-strength fresnel" survives.
      const shadeDay = displayColor(POST_TUNE.rimShade);
      const shadeNight = new THREE.Color().copyLinearToSRGB(at.hemiSky);
      const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      assert.ok(lum(shadeNight) < 0.6 * lum(shadeDay),
        `${name}: the night shadow-rim target (hemiSky, display luma ${lum(shadeNight).toFixed(3)}) is not ` +
        `materially darker than the daylight constant (${lum(shadeDay).toFixed(3)}), so the swap is cosmetic`);
    }
  }
  assert.equal(moonShots, 3, `expected 3 moon-keyed shots, saw ${moonShots}:\n  ${rows.join('\n  ')}`);
  assert.ok(dayShots >= 12, `only ${dayShots} daylight shots inspected:\n  ${rows.join('\n  ')}`);
  assert.equal(POST_TUNE.rimClock, 1, 'TUNE.rimClock shipped off; the night rim is back on the constants');
});

/* ── defect #9 — the flare half of the god-ray narrowing ──────────────────────────────── */

test('shafts: flare is narrowed, and the published power at `temple` is already saturated', () => {
  const eng = {
    debug: {}, scene: { add() {}, remove() {} }, on() {}, get() { return null; },
    warn() {}, quality: 'high', settings: {},
  };
  const L = new Lighting(eng);
  assert.ok(L.TUNE.shaftFlare < 0.28,
    `TUNE.shaftFlare ${L.TUNE.shaftFlare} is back at or above the pre-§214.3 width; the whole of ` +
    `LIGHTING's half of "narrow them" is this number`);
  assert.ok(L.TUNE.shaftFlare > 0,
    `TUNE.shaftFlare is 0 — a parallel tube. The narrowing was sized as a reduction, not a removal; ` +
    `0 is a separate decision and wants its own arm.`);

  /* The other half of the same finding, asserted so it cannot be re-proposed: raising the
     published intensity cannot brighten `temple`'s blades, because the grazing term is already
     clamped. `grazing = smoothstep(sunDir.y, 0.05, 0.45)` and temple's sun is 33 deg. */
  const at = evalAtmosphere(SHOTS.temple.tod, createAtmosphereState());
  const grazing = THREE.MathUtils.smoothstep(at.sunDir.y, 0.05, 0.45);
  assert.equal(grazing, 1,
    `temple's grazing term is ${grazing.toFixed(4)}, not 1 — the note at TUNE.shaftFlare says the ` +
    `only remaining intensity lever is the 0.35 constant, and that reasoning depends on this clamp`);
  L.dispose?.();
});
