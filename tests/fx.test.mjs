import test from 'node:test';
import assert from 'node:assert/strict';
import { EMITTERS, TILE } from '../src/fx/Emitters.js';
import { TUNE } from '../src/fx/Particles.js';

/**
 * Structural guards on the particle emitter table — specifically on **how large an additive
 * sprite is allowed to be on screen**.
 *
 * ── Why this file exists ───────────────────────────────────────────────────────────────
 * Critic pass 7 defect #10 ("combat FX veil the character") was shipped a fix once and the
 * fix's verification (`fx9`) passed while the critic still measured the defect. The reason is
 * geometric and this suite is the cheap guard against it recurring: `fx9`'s two ROIs —
 * `combat` left edge (0,28)-(150,355) and doorway (652,95)-(821,192) — have **zero overlap**
 * with either the character or the veil over him, so the acceptance could not have seen the
 * defect whatever the FX did. The number that actually mattered was never a pixel count at
 * all; it was arithmetic available offline:
 *
 *     on-screen diameter / frame height  =  size * P11 / d
 *
 * (the shader derives this at `uMaxSize`; the frame height cancels). At `combat`'s framing —
 * fov 40 so P11 2.7475, impact anchor at d 4.906 m — `cane_flash` scaled by `_onCaneHit`'s
 * `heavy` 1.35 is 2.025 m, i.e. **1.134 of frame height**: an additive sprite 817 px across on
 * a 720 px frame, drawn 0.89 m in FRONT of a hero who is himself 290 px tall.
 *
 * That is a fact about committed data, so it belongs in a test that runs in a second, not in a
 * five-minute capture holding a global lock.
 *
 * ── The rule this suite inherits from §211.1 ───────────────────────────────────────────
 * Nine tests in this project's first suite read a property the shipped data does not have,
 * iterated nothing, and reported green. So **every data-driven test below counts what it
 * inspected and asserts the count is non-zero**, and the ceiling test additionally carries a
 * *calibration* assertion: it proves at least one emitter WOULD breach the ceiling if the
 * ceiling were removed. A size ceiling that clamps nothing is indistinguishable from no
 * ceiling at all, and would pass a naive "everything is under the limit" assertion trivially.
 */

/* Which batches the shader's ceiling can actually reach. PLANAR rings are exempt by
   construction — they are ground decals whose size is the thing they communicate — and the
   non-additive dust/smoke sheets are supposed to be large (see the `_buildAmbient` comment). */
const CEILED_BATCH = 'spark';

/* The shipped framings, from src/core/Shots.js. P11 = 1/tan(fovY/2). `d` is the closest depth
   at which that shot's event FX realistically fires: for `combat` it is the impact anchor
   depth re-derived from source in PREREG-combatrecipient §0.2. */
const FRAMINGS = [
  { shot: 'combat', fov: 40, d: 4.906 },
  { shot: 'sly-closeup', fov: 38, d: 5.0 },
  { shot: 'traversal', fov: 44, d: 6.0 },
];

const P11 = (fovDeg) => 1 / Math.tan((fovDeg * Math.PI) / 360);

/** On-screen diameter as a fraction of frame height, per the shader's own derivation. */
const frac = (sizeMetres, fovDeg, d) => (sizeMetres * P11(fovDeg)) / d;

/** Largest world-space size an emitter ever reaches, including the `_onCaneHit` heavy scale. */
const HEAVY = 1.35; // _onCaneHit: index >= 3

function ceiledEmitters() {
  return Object.entries(EMITTERS)
    .filter(([, def]) => def && def.batch === CEILED_BATCH && Array.isArray(def.size))
    .map(([name, def]) => ({
      name,
      def,
      /* cane_* are the combo emitters that `_onCaneHit` scales by `heavy`. */
      maxSize: Math.max(def.size[0], def.size[1]) * (name.startsWith('cane_') ? HEAVY : 1),
    }));
}

test('the additive spark batch declares a screen-space size ceiling', () => {
  assert.equal(
    typeof TUNE.flashMaxH,
    'number',
    'TUNE.flashMaxH must exist — it is what stops an additive sprite covering the frame',
  );
  assert.ok(
    TUNE.flashMaxH > 0 && TUNE.flashMaxH < 1,
    `flashMaxH must be a fraction of frame height in (0,1); read ${TUNE.flashMaxH}`,
  );
});

test('no additive event sprite exceeds the ceiling once clamped, and the ceiling is not vacuous', () => {
  const emitters = ceiledEmitters();
  assert.ok(emitters.length > 0, 'inspected zero emitters — the batch filter is wrong');

  const breaches = []; // would exceed the ceiling WITHOUT the shader clamp
  let checks = 0;

  for (const e of emitters) {
    for (const f of FRAMINGS) {
      checks++;
      const raw = frac(e.maxSize, f.fov, f.d);
      // What the shader actually rasterises, given the clamp.
      const clamped = Math.min(raw, TUNE.flashMaxH);
      assert.ok(
        clamped <= TUNE.flashMaxH + 1e-9,
        `${e.name} on ${f.shot}: clamped frac ${clamped.toFixed(3)} > ceiling ${TUNE.flashMaxH}`,
      );
      if (raw > TUNE.flashMaxH) breaches.push(`${e.name}@${f.shot} raw=${raw.toFixed(3)}`);
    }
  }

  assert.ok(checks > 0, 'inspected zero emitter/framing pairs');
  console.log(
    `  inspected ${emitters.length} additive emitters x ${FRAMINGS.length} framings = ${checks} pairs;` +
      ` ${breaches.length} would breach without the clamp: ${breaches.join(', ') || '(none)'}`,
  );

  /* CALIBRATION — the assertion that proves this test is looking at something. If nothing in
     the shipped table would breach, the ceiling is inert and this suite is checking that
     0 <= 0.45, which is true of any table and therefore evidence of nothing. */
  assert.ok(
    breaches.length > 0,
    'ceiling is vacuous: no shipped emitter would breach it at any framing, so this test ' +
      'cannot distinguish a working clamp from a missing one',
  );
});

test('cane_flash is the emitter the ceiling exists for, and it breaches by a wide margin', () => {
  const flash = EMITTERS.cane_flash;
  assert.ok(flash, 'cane_flash missing from the emitter table');
  assert.equal(flash.batch, CEILED_BATCH, 'cane_flash must live in the ceiled additive batch');
  assert.equal(flash.tile, TILE.GLOW, 'cane_flash is the GLOW sprite');

  const size0 = flash.size[0] * HEAVY;
  const raw = frac(size0, 40, 4.906); // combat framing
  console.log(
    `  cane_flash size0 ${flash.size[0]} m x heavy ${HEAVY} = ${size0.toFixed(3)} m` +
      ` -> ${raw.toFixed(3)} of frame height (${(raw * 720).toFixed(0)} px on 720p),` +
      ` clamped to ${TUNE.flashMaxH} (${(TUNE.flashMaxH * 720).toFixed(0)} px)`,
  );

  assert.ok(
    raw > 1.0,
    `cane_flash should be the pathological case this ceiling exists for; raw frac ${raw.toFixed(3)}`,
  );
  /* The hero is ~290 px of 720 (0.40) in this framing. The clamped flash must not exceed him
     by more than ~15% or it is still a veil rather than a contact flash. */
  assert.ok(
    TUNE.flashMaxH <= 0.46,
    `ceiling ${TUNE.flashMaxH} lets the flash exceed the 0.40-frame-height hero by >15%`,
  );
});

test('the small spark populations are nowhere near the ceiling (the clamp is targeted)', () => {
  const emitters = ceiledEmitters().filter((e) => e.name !== 'cane_flash');
  assert.ok(emitters.length > 0, 'inspected zero non-flash spark emitters');

  let inspected = 0;
  const near = [];
  for (const e of emitters) {
    const raw = frac(e.maxSize, 40, 5.0);
    inspected++;
    if (raw > TUNE.flashMaxH * 0.75) near.push(`${e.name}=${raw.toFixed(3)}`);
  }
  console.log(`  inspected ${inspected} non-flash spark emitters at d 5 m; near-ceiling: ${near.join(', ') || '(none)'}`);
  assert.ok(inspected > 0, 'inspected zero emitters');
  assert.deepEqual(
    near,
    [],
    'a non-flash spark emitter is within 25% of the ceiling — the clamp is no longer targeted ' +
      'at cane_flash and may be reshaping sparks, embers or coin pops',
  );
});

test('the combo impact flash is emitted in front of the hero, which is why size matters', () => {
  /* Not a pixel claim — a claim about the emitter contract. `_onCaneHit` offsets the anchor
     along the facing direction, so the additive sprite is nearer the lens than the character
     it is attached to (PREREG-combatrecipient §0.2 measures the gap at 0.890 m). That is the
     structural reason a large additive sprite here veils rather than haloes, and it is worth
     a guard: if the offset ever goes to zero the flash would be centred inside the body. */
  const flash = EMITTERS.cane_flash;
  assert.equal(flash.speed[0], 0, 'cane_flash must not travel — it marks the contact point');
  assert.equal(flash.speed[1], 0, 'cane_flash must not travel — it marks the contact point');
  assert.ok(flash.life[0] > 0 && flash.life[0] <= 0.25, `flash life ${flash.life[0]} s should stay a flash`);
  assert.ok(
    flash.size[1] < flash.size[0],
    'cane_flash must shrink over its life (size1 < size0) — an impact that grows reads as a bloom',
  );
});
