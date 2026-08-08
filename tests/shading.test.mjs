import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS, SHOT_NAMES } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '../src/render/Atmosphere.js';
import { TUNE } from '../src/render/ToonMaterial.js';

/**
 * Where the cel ramp's terminators fall relative to every shipped shot's key light.
 *
 * `slyRamp`'s terminators are **absolute N·L thresholds**, not per-shot values: with `bands: 3` they
 * sit at `termLo` and `termHi` with a `termSoft` half-width smoothstep either side. A flat ground
 * plane's N·L is exactly `keyDir.y`. So for every shot, one number decides which band its ground
 * lands in — and if that number falls *inside* a smoothstep window, the sandstone detail normal
 * (which swings N·L by roughly ±0.03) flips those pixels between bands and the surface reads as
 * speckle rather than as a cel band.
 *
 * KNOWN_ISSUES §210.1 found this on `temple` by hand across five shots. Everything it needs is
 * importable in plain Node — `Shots.js` for the tods, `Atmosphere.js` for the key direction (its own
 * shipped keyed table, including the moon on night shots), `ToonMaterial.js` for the terminators —
 * so all sixteen can be checked in milliseconds, which is the part of that finding that generalises:
 * **"any candidate must be checked against every shipped tod, not tuned on one shot."**
 *
 * ── What this test does NOT establish (§210.3) ─────────────────────────────────────────
 * A small margin here means the *ground plane* of that shot straddles a terminator. It does not
 * mean the shot looks bad, and it must not be quoted as if it did. `temple` has the worst margin in
 * the build (0.0006) and is an interior hypostyle hall whose floor is a narrow band at the bottom of
 * frame, mostly in cast shadow — where the band is set by the shadow term, not by this threshold.
 * §210.1 called that floor "the dominant surface of that shot"; the dominant surfaces are the
 * columns, which are vertical, and whose N·L is not `keyDir.y` at all.
 *
 * So this is a guard against a *class* of authoring mistake — moving a tod or a terminator onto a
 * collision without noticing — and not a picture-quality metric. The shots where it has real
 * consequences are the ones with a large lit ground plane in frame: `courtyard`, `combat`, `hero`,
 * `dunes`, `traversal`.
 */

const DETAIL_SWING = 0.03;   // §210.1: the sandstone detail normal moves N·L by about this much.

const state = createAtmosphereState();

/** Flat-ground N·L per shot: the key direction's Y component, key being sun or moon as shipped. */
const groundNL = SHOT_NAMES.map((name) => {
  const at = evalAtmosphere(SHOTS[name].tod, state);
  return { name, tod: SHOTS[name].tod, nl: at.keyDir.y, moon: !!at.keyIsMoon };
});

/** Distance from the nearest edge of either smoothstep window. */
function margin(nl) {
  const { termLo: lo, termHi: hi, termSoft: soft } = TUNE;
  return Math.min(
    Math.abs(nl - (lo - soft)), Math.abs(nl - (lo + soft)),
    Math.abs(nl - (hi - soft)), Math.abs(nl - (hi + soft)),
  );
}

/**
 * Shots whose ground plane currently sits inside the detail normal's swing of a terminator, with
 * the margin measured at the shipped constants. Asserted EXACTLY, not as an upper bound: adding a
 * shot to this list, or changing a tod or a terminator so that a new shot lands here, turns the test
 * red and sends whoever did it to §210.3 — which is the whole point. Removing the collision (the
 * `termHi` move §210.1 proposes) also turns it red, correctly: the exception is then stale.
 */
const KNOWN_NEAR_TERMINATOR = [
  'temple',   // 0.0006 — the §210.1 finding. Interior hall; almost no lit floor in frame.
  'combat',   // 0.0036 — NOT in §210.1's five-shot table, and the one flagged shot that does have a
              //          large lit ground plane filling the lower half of frame.
  'guard',    // 0.0227 — moon-keyed, and inside the swing by less than a factor of two.
];

test('ramp: the shipped terminator constants are the ones this analysis was done against', () => {
  /* Every margin below is a function of these three numbers. If they move, the exception list is
     not evidence about anything and must be recomputed rather than edited to fit. */
  assert.equal(TUNE.bands, 3);
  assert.equal(TUNE.termLo, 0.14);
  assert.equal(TUNE.termHi, 0.52);
  assert.equal(TUNE.termSoft, 0.024);
});

test('ramp: every shot resolves a finite key elevation', () => {
  assert.ok(groundNL.length >= 16, `only ${groundNL.length} shots inspected`);
  for (const s of groundNL) {
    assert.ok(Number.isFinite(s.nl), `${s.name} (tod ${s.tod}) produced a non-finite key direction`);
    assert.ok(s.nl > -1 && s.nl <= 1, `${s.name} key N·L ${s.nl} out of range`);
  }
  /* Night shots key off the moon; if that ever silently fell back to a sunk sun, every margin for
     those shots would be measuring a light that is not lighting the scene. */
  const moonKeyed = groundNL.filter((s) => s.moon).map((s) => s.name);
  assert.deepEqual(moonKeyed.sort(), ['guard', 'night'],
    'the set of moon-keyed shots changed — margins for those shots are about a different light');
});

test('ramp: no shot has silently drifted onto a terminator', () => {
  const near = groundNL.filter((s) => margin(s.nl) < DETAIL_SWING).map((s) => s.name);
  assert.deepEqual(near.sort(), [...KNOWN_NEAR_TERMINATOR].sort(),
    `shots whose ground plane sits within ${DETAIL_SWING} of a band edge changed.\n` +
    groundNL.map((s) => `  ${s.name.padEnd(13)} N·L ${s.nl.toFixed(4)}  margin ${margin(s.nl).toFixed(4)}`).join('\n'));
});

test('ramp: the two terminators do not overlap, and the mid band survives', () => {
  /* A `termSoft` wide enough to merge the windows would collapse three bands into a gradient — the
     "no toon ramp anywhere" failure, arriving from the constants rather than from the shader. */
  const { termLo: lo, termHi: hi, termSoft: soft } = TUNE;
  assert.ok(lo - soft > 0, `the shadow band has no width: termLo ${lo} - termSoft ${soft} <= 0`);
  assert.ok(hi - soft > lo + soft,
    `the smoothstep windows overlap: [${lo - soft}, ${lo + soft}] and [${hi - soft}, ${hi + soft}]`);
  assert.ok(hi + soft < 1, `the lit band is unreachable: termHi ${hi} + termSoft ${soft} >= 1`);
});
