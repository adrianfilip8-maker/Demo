import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS, SHOT_NAMES } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere, SHADOW_FLOOR } from '../src/render/Atmosphere.js';
import { TUNE as TOON_TUNE } from '../src/render/ToonMaterial.js';

/**
 * Guards for the tonal-range and night findings (KNOWN_ISSUES §214), all of which are
 * arithmetic over `Shots.js` + `Atmosphere.js` and therefore free and permanent.
 *
 * Every claim these lock in was established WITHOUT a capture, and each one is the kind that
 * renders plausibly when it regresses — a rim boost creeping back at night, a lever that
 * silently stops being inert in daylight, a moon track quietly moved onto (or off) the
 * backlight geometry that explains critic defect 12.
 *
 * §211.1 discipline: every data-driven test counts what it inspected and asserts the count is
 * non-zero, because nine of this suite's first-draft assertions read a property the data does
 * not have, reported `ok`, and inspected nothing. Two of the tests below additionally carry
 * their own in-test CALIBRATION ARM — a perturbation that MUST change the reading — because a
 * "nothing moved" result is only evidence if something could have moved it.
 */

const DEG = Math.PI / 180;
const state = createAtmosphereState();

/* ── §214.2 — the night rim boost stays withdrawn ─────────────────────────────────────── */

test('rim: strength is the same at night as in daylight (§214.2)', () => {
  /* Was `lerp(0.5, 0.72, nightAmount)`: a 44 % amplification landing on exactly the two shots
     where critic pass 7 defect 12 reports a fresnel drawing a line on every polygon edge. The
     premise (night values sit close together) is false — `night`/`guard` carry the highest
     key:fill ratio in the build. If a boost returns, this goes red. */
  let seen = 0, moonSeen = 0;
  const byShot = [];
  for (const name of SHOT_NAMES) {
    const at = evalAtmosphere(SHOTS[name].tod, state);
    byShot.push(`${name} ${at.rimStrength.toFixed(4)}${at.keyIsMoon ? ' (moon)' : ''}`);
    seen++;
    if (at.keyIsMoon) moonSeen++;
    assert.equal(at.rimStrength, 0.50,
      `${name} publishes rimStrength ${at.rimStrength}, not 0.50 — §214.2 withdrew the night boost:\n  ${byShot.join('\n  ')}`);
  }
  assert.ok(seen >= 16, `only ${seen} shots inspected`);
  assert.ok(moonSeen === 2, `expected 2 moon-keyed shots to be covered, saw ${moonSeen}`);
});

/* ── §214.1 — both moon-keyed shots are ~180° backlit ─────────────────────────────────── */

/** Azimuth (Atmosphere convention: 0° = +X east, 90° = +Z south) the shot's camera faces. */
function cameraForwardAzimuth(shot) {
  const [px, , pz] = shot.pos;
  const [tx, , tz] = shot.target;
  return ((Math.atan2(tz - pz, tx - px) / DEG) + 360) % 360;
}

/** N·L of a vertical wall whose normal faces this shot's camera, under this shot's key. */
function cameraFacingWallNL(name, at) {
  const wallAz = (cameraForwardAzimuth(SHOTS[name]) + 180) % 360;
  const el = at.keyIsMoon ? at.moonElevation : at.sunElevation;
  const az = at.keyIsMoon ? at.moonAzimuth : at.sunAzimuth;
  return Math.cos(el * DEG) * Math.cos((wallAz - az) * DEG);
}

test('night: the two moon-keyed shots fail by DIFFERENT mechanisms (§214.1)', () => {
  /* This test's first run turned red and corrected the §214.1 write-up, which had assumed
     `guard` behaved like `night`. It does not, and the two numbers are asserted separately so
     they cannot quietly re-merge:

       night — backlit. Camera forward azimuth is 14.3° off the moon, so a wall facing the lens
               is ~166° from it and N·L is strongly NEGATIVE. Nothing visible is moonlit.
       guard — side-lit. Its camera-facing walls sit at N·L +0.1652, which is 0.0012 from the
               low terminator's upper edge — the §210.1 speckle mechanism, on walls.

     Goes red if the moon track moves, if either camera is re-aimed, or if a third moon-keyed
     shot appears; all three change what critic defect 12 means. */
  const seen = new Map();
  for (const name of SHOT_NAMES) {
    const at = evalAtmosphere(SHOTS[name].tod, state);
    if (at.keyIsMoon) seen.set(name, cameraFacingWallNL(name, at));
  }
  const rows = [...seen].map(([k, v]) => `${k} wall N·L ${v.toFixed(4)}`).join('\n  ');
  assert.deepEqual([...seen.keys()].sort(), ['guard', 'night'],
    `the moon-keyed set changed; §214.1's per-shot diagnosis is about these two:\n  ${rows}`);

  assert.ok(seen.get('night') < -0.5,
    `night camera-facing wall N·L is ${seen.get('night').toFixed(4)}; §214.1 records it as strongly ` +
    `negative (backlit). If this is now positive, "a moon that lights nothing" no longer holds:\n  ${rows}`);

  const g = seen.get('guard');
  assert.ok(g > 0 && g < 0.30,
    `guard camera-facing wall N·L is ${g.toFixed(4)}; §214.1 records it as small and POSITIVE ` +
    `(side-lit, sitting on the low terminator), not backlit:\n  ${rows}`);
  assert.ok(Math.abs(g - (TOON_TUNE.termLo + TOON_TUNE.termSoft)) < 0.03,
    `guard's camera-facing wall (N·L ${g.toFixed(4)}) is no longer within the detail normal's ±0.03 ` +
    `swing of the low terminator's upper edge (${(TOON_TUNE.termLo + TOON_TUNE.termSoft).toFixed(4)}). ` +
    `That collision is the §214.1 finding for this shot — if it is genuinely fixed, retire this ` +
    `assertion deliberately rather than widening it.`);
});

test('night: the sand bounce reaches night\'s walls and NOT guard\'s (§214.1)', () => {
  /* Why §214.1 routes night's fix to fill amplitude and guard's to SHADING. `bounceDir`
     (anti-key, dropped to -0.42 in y) lands near head-on on night's camera-facing walls and
     BEHIND guard's. An earlier draft claimed both; this asserts the split. */
  const dots = new Map();
  for (const name of SHOT_NAMES) {
    const at = evalAtmosphere(SHOTS[name].tod, state);
    if (!at.keyIsMoon) continue;
    const wallAz = ((cameraForwardAzimuth(SHOTS[name]) + 180) % 360) * DEG;
    dots.set(name, Math.cos(wallAz) * at.bounceDir.x + Math.sin(wallAz) * at.bounceDir.z);
  }
  const rows = [...dots].map(([k, v]) => `${k} bounce·wallNormal ${v.toFixed(4)}`).join('\n  ');
  assert.equal(dots.size, 2, `inspected ${dots.size} moon-keyed shots, expected 2:\n  ${rows}`);
  assert.ok(dots.get('night') > 0.7,
    `night bounce·wallNormal is ${dots.get('night').toFixed(4)}; §214.1 records it near head-on (> 0.7), ` +
    `which is the whole basis for fixing that shot with fill:\n  ${rows}`);
  assert.ok(dots.get('guard') < 0,
    `guard bounce·wallNormal is ${dots.get('guard').toFixed(4)}; §214.1 records it as NEGATIVE — the ` +
    `bounce is behind those walls, so night's fill fix does not transfer to guard:\n  ${rows}`);
});

/* ── §214.1 — the night fill lever is inert by default and cannot leak into daylight ──── */

test('nightFillScale: default 1 is bit-identical, and 3 moves ONLY the moon-keyed shots', () => {
  /* This test carries its own CALIBRATION ARM. The claim "daylight does not move" is only
     evidence if the same lever demonstrably DOES move something — otherwise a lever that never
     reached `evalAtmosphere` at all would pass this test green while doing nothing, which is
     precisely KNOWN_ISSUES §210.2's `debugTerm`. So the night arm below must move, and the
     assertion that it moved runs before the daylight assertions. */
  const fields = ['hemiIntensity', 'bounceIntensity', 'ambientIntensity'];
  let dayChecked = 0, nightChecked = 0, nightMoved = 0;

  for (const name of SHOT_NAMES) {
    const tod = SHOTS[name].tod;
    const base = evalAtmosphere(tod, createAtmosphereState());
    const one = createAtmosphereState(); one.nightFillScale = 1;
    const lifted = createAtmosphereState(); lifted.nightFillScale = 3;
    const atOne = evalAtmosphere(tod, one);
    const atThree = evalAtmosphere(tod, lifted);

    for (const f of fields) {
      assert.equal(atOne[f], base[f],
        `${name}: nightFillScale = 1 changed ${f} (${base[f]} -> ${atOne[f]}); the default must be bit-identical`);
    }

    if (base.nightAmount > 0.99) {
      nightChecked++;
      for (const f of fields) {
        assert.ok(Math.abs(atThree[f] / base[f] - 3) < 1e-9,
          `${name}: nightFillScale = 3 gave ${f} x${(atThree[f] / base[f]).toFixed(4)}, expected x3`);
      }
      nightMoved++;
    } else if (base.nightAmount < 0.01) {
      dayChecked++;
      for (const f of fields) {
        assert.equal(atThree[f], base[f],
          `${name}: nightFillScale leaked into a daylight shot — ${f} moved ${base[f]} -> ${atThree[f]}`);
      }
    }
  }

  // The calibration arm, asserted explicitly rather than left implicit.
  assert.ok(nightMoved >= 2,
    `CALIBRATION FAILED: the 3x arm moved ${nightMoved} shots. If the extreme value changes nothing, ` +
    `the lever does not reach evalAtmosphere and the "daylight is unaffected" result is UNSCOREABLE, not negative.`);
  assert.ok(dayChecked >= 12, `only ${dayChecked} daylight shots inspected`);
  assert.equal(nightChecked, 2, `expected 2 full-night shots, inspected ${nightChecked}`);
});

/* ── §214.3 — SHADOW_FLOOR is dominated by ToonMaterial's own constant ────────────────── */

test('shadow floor: raising Atmosphere.SHADOW_FLOOR is a no-op, and this records why', () => {
  /* `ToonMaterial.setKeyLight()` applies `min(TUNE.shadowFloor, ambient.floor)`. While
     SHADOW_FLOOR (0.14) sits at or above TUNE.shadowFloor (0.125), the min() always picks
     ToonMaterial's and this export never binds — so §2.2's quoted 14 % is not the number the
     renderer uses. If either constant moves such that this ordering flips, the comment at
     SHADOW_FLOOR becomes wrong and this goes red. */
  assert.equal(typeof TOON_TUNE.shadowFloor, 'number', 'ToonMaterial.TUNE.shadowFloor is not exported as a number');
  assert.ok(SHADOW_FLOOR >= TOON_TUNE.shadowFloor,
    `SHADOW_FLOOR ${SHADOW_FLOOR} has fallen below ToonMaterial.TUNE.shadowFloor ${TOON_TUNE.shadowFloor}; ` +
    `it now BINDS through the min(), which reverses the note at its declaration.`);
});

/* ── §214.5 — the dome dither ships live and stays sub-LSB ────────────────────────────── */

test('sky: the dome dither ships non-zero and inside the sub-display-level band (§214.5)', async () => {
  /* Sky.js is imported for its TUNE only; nothing here builds geometry or touches a renderer.
     The band: the dither is relative, and the composite's transfer runs ~21 L per e-fold in
     the night sky and ~48 in daylight, so ±d/2 relative costs ~10.5*d and ~24*d display luma.
     At 0.05 that is 0.52 L and 1.2 L. Above ~0.09 the daylight sky would carry more than two
     display levels of noise, which is visible; at 0 the night gradient bands at 19 levels. */
  const { Sky } = await import('../src/render/Sky.js');
  const proto = Object.getPrototypeOf(new Sky({ debug: {}, scene: {}, on: () => {} }));
  assert.ok(proto, 'Sky did not construct');
  const { TUNE } = await import('../src/render/Sky.js').then((m) => ({ TUNE: new Sky({ debug: {}, scene: {}, on: () => {} }).TUNE }));
  assert.equal(typeof TUNE.domeDither, 'number', 'TUNE.domeDither is missing — the dither is not wired');
  assert.ok(TUNE.domeDither > 0,
    'TUNE.domeDither is 0, so the night sky is back to the 19-level ladder measured in §214.5');
  assert.ok(TUNE.domeDither <= 0.09,
    `TUNE.domeDither ${TUNE.domeDither} exceeds the sub-LSB band; the daylight sky would carry visible noise`);
});
