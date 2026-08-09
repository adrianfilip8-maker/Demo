import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, SHOT_NAMES } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '../src/render/Atmosphere.js';
import { TUNE as TOON } from '../src/render/ToonMaterial.js';

/**
 * Grounding — the contact term, critic pass 7 defect 7 ("no contact shadow or AO under anything,
 * measured non-monotonic with distance from the feet").
 *
 * Three things are checkable in plain Node in milliseconds, and all three are things this project
 * has previously got wrong by reading source instead of measuring:
 *
 *  1. THE QUANTISER'S MATHEMATICAL PROPERTIES. The whole fix rests on the claim that quantising
 *     occlusion cannot introduce a reversal — if it could, a quantised contact term would produce
 *     exactly the non-monotonic profile it exists to remove. That is a property of the function,
 *     so it is tested against a JS mirror of the GLSL, with the GLSL text asserted to match.
 *  2. THE SCREEN RADIUS PER SHIPPED SHOT. The term's world radius becomes a pixel radius that is
 *     clamped at both ends, and a clamped term returns a null indistinguishable from a decisive
 *     one (KNOWN_ISSUES 40). Every shot's camera, fov and player position are importable, so which
 *     shots run the term at a clamp is arithmetic, not a thing to discover in a capture.
 *  3. THE CAST SHADOW IS NEVER IN THE PROBE COLUMN. PREREG-contact.md established this at one sun
 *     angle (20.97 degrees) and drew a general conclusion from it. Atmosphere.js gives the key
 *     direction for all sixteen tods, so the general claim can be checked rather than assumed.
 *
 * What this file does NOT establish: that any of it looks right. No frame is rendered here. It is a
 * guard against the class of mistake where a knob's stated meaning and its applied value diverge.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POSTFX = fs.readFileSync(path.join(HERE, '../src/render/PostFX.js'), 'utf8');

/** Read a TUNE array literal out of PostFX.js source. The renderer's own numbers, not a restatement. */
function tuneArray(name) {
  const m = POSTFX.match(new RegExp(`^\\s*${name}:\\s*\\[([^\\]]+)\\]`, 'm'));
  assert.ok(m, `PostFX.js has no TUNE.${name}`);
  return m[1].split(',').map((s) => Number(s.trim()));
}

const contact = tuneArray('contact');            // [radiusWorld, strength, minPx, maxPx]
const contactQuant = tuneArray('contactQuant');  // [steps, mix, soft]

// ---------------------------------------------------------------------------------------------
// 1. the quantiser
// ---------------------------------------------------------------------------------------------

/** JS mirror of slyBandStep. Kept honest by the next test, which asserts the GLSL still says this. */
const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const bandStep = (v, n, soft) => { const s = v * n, f = Math.floor(s); return (f + smoothstep(0.5 - soft, 0.5 + soft, s - f)) / n; };
const applyQuant = (v, [n, mix, soft]) => v + (bandStep(v, n, soft) - v) * mix;

test('contact quantiser: the GLSL is the function this file models', () => {
  const m = POSTFX.match(/float slyBandStep\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(m, 'slyBandStep is not in COMPOSITE_FRAG');
  const body = m[1].replace(/\s+/g, ' ').trim();
  assert.equal(body,
    'float s = v * n; float f = floor( s ); return ( f + smoothstep( 0.5 - soft, 0.5 + soft, s - f ) ) / n;',
    'slyBandStep changed — the JS mirror below is now testing a different function than the shader runs');
  // and it is actually called, on the normalised occlusion, before strength scales it
  assert.match(POSTFX, /occN = mix\( occN, slyBandStep\( occN, uContactQuant\.x, uContactQuant\.z \), uContactQuant\.y \);/);
  assert.match(POSTFX, /return clamp\( occN \* uContact\.y, 0\.0, 1\.0 \);/);
});

test('contact quantiser: monotone — it cannot introduce the reversal it exists to remove', () => {
  // The raw occlusion falls off with distance from the contact. Feed it a strictly decreasing
  // profile and require the output to be non-increasing: a single reversal here would be the
  // critic's defect reintroduced by the fix.
  for (const steps of [2, 3, 4]) {
    for (const soft of [0.01, 0.063, 0.2, 0.5]) {
      let prev = Infinity;
      for (let i = 0; i <= 2000; i++) {
        const raw = 1 - i / 2000;                      // monotone decreasing "distance" profile
        const out = applyQuant(raw, [steps, 1, soft]);
        assert.ok(out <= prev + 1e-9,
          `reversal at raw=${raw.toFixed(4)} steps=${steps} soft=${soft}: ${out} > ${prev}`);
        prev = out;
      }
    }
  }
});

test('contact quantiser: exactly zero on open floor, exactly one at full occlusion', () => {
  // slyContact is designed to return exactly 0.000 on a plane at any grazing angle. A quantiser
  // that lifted 0 off zero would put a step edge across every flat surface in the frame.
  for (const steps of [2, 3, 4]) {
    for (const soft of [0.01, 0.063, 0.5]) {
      assert.equal(applyQuant(0, [steps, 1, soft]), 0, `f(0) != 0 at steps=${steps} soft=${soft}`);
      assert.equal(applyQuant(1, [steps, 1, soft]), 1, `f(1) != 1 at steps=${steps} soft=${soft}`);
    }
  }
});

test('contact quantiser: mix 0 is bit-identical to the continuous term', () => {
  // TUNE.contactQuant[1] ships at 0 (section 17: plumbing lands as a no-op, the look change is its
  // own A/B). "lerp at 0 is exact" is the house claim; this is it as a measurement.
  for (let i = 0; i <= 1000; i++) {
    const v = i / 1000;
    assert.equal(applyQuant(v, [contactQuant[0], 0, contactQuant[2]]), v, `mix 0 moved ${v}`);
  }
  assert.equal(contactQuant[1], 0, 'TUNE.contactQuant[1] must ship at 0 until an A/B says otherwise');
});

test('contact quantiser: it produces flat plateaus, which is the entire argument for it', () => {
  // RESULT-grain1 measured flat area 24.9% -> 54.4% when a full-screen gradient came off. A
  // contact term is only allowed back into the composite if it is piecewise constant.
  const N = 1001;
  const count = (q) => {
    let flat = 0, prev = null;
    for (let i = 0; i < N; i++) { const o = applyQuant(i / (N - 1), q); if (prev !== null && Math.abs(o - prev) < 1e-9) flat++; prev = o; }
    return flat / (N - 1);
  };
  const quantFlat = count([contactQuant[0], 1, contactQuant[2]]);
  const contFlat = count([contactQuant[0], 0, contactQuant[2]]);
  assert.equal(contFlat, 0, 'the continuous term should have no flat runs at all');
  assert.ok(quantFlat > 0.8, `quantised flat fraction ${quantFlat.toFixed(3)} — expected > 0.8`);
});

test('contact quantiser: step count and softness are derived from the ramp, not chosen', () => {
  // steps 2 -> 3 plateaus {0, 0.5, 1}, matching TOON.bands = 3: the contact shadow gets the same
  // number of tones as everything else in the frame.
  assert.equal(contactQuant[0] + 1, TOON.bands,
    `contactQuant steps ${contactQuant[0]} gives ${contactQuant[0] + 1} plateaus, but TUNE.bands is ${TOON.bands}`);
  // soft = termSoft / (termHi - termLo): the same relative hardness as the ramp's own terminators.
  const derived = TOON.termSoft / (TOON.termHi - TOON.termLo);
  assert.ok(Math.abs(contactQuant[2] - derived) < 0.002,
    `contactQuant soft ${contactQuant[2]} is not the ramp-derived ${derived.toFixed(4)}`);
});

// ---------------------------------------------------------------------------------------------
// 2. the screen radius, per shipped shot
// ---------------------------------------------------------------------------------------------

const CAPTURE_H = 720;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

/** Per-shot view distance to the player's feet, and the pixel radius TUNE.contact[0] subtends. */
const shotRadii = SHOT_NAMES.filter((n) => SHOTS[n].player).map((name) => {
  const s = SHOTS[name];
  const fwd = norm(sub(s.target, s.pos));
  const z = dot(sub(s.player.pos, s.pos), fwd);
  const fpx = (CAPTURE_H / 2) / Math.tan((s.fov * Math.PI) / 360);
  return { name, z, rawPx: (contact[0] * fpx) / z };
});

/* Derived 2026-08-08 from Shots.js + a 720-high capture. Shots whose 4.5 cm radius falls outside
   [minPx, maxPx] and therefore do NOT sample the world radius the knob names. `guard` is here for
   a different reason and it is the interesting one: its player sits BEHIND the camera (z < 0), so
   the shot carries no character contact at all and is a free null for any character-side claim —
   PREREG-contact.md section 8 asserted exactly that, and this is it as arithmetic. */
/* `courtyard` LEFT this set on 2026-08-09 and the removal is declared here rather than absorbed.
   PREREG-heroread moved that shot's STAGED PLAYER (not its camera) from (-6.6, 5.12, 12.4) to
   (2.4, 0.02, 26.4), taking him from 29.4 m to 16.4 m from the lens, so the 4.5 cm contact radius
   now projects inside [minPx, maxPx] and the shot samples the world radius the knob names for the
   first time. That is a shot GAINING a measurement, which is why the list shrinks; the assertion
   below still fails loudly if one ever gains a clamp. */
const KNOWN_CLAMPED = ['guard', 'sly-startle'];

test('contact radius: the set of shots running the term at a clamp has not drifted', () => {
  const clamped = shotRadii.filter((s) => s.rawPx < contact[2] || s.rawPx > contact[3]).map((s) => s.name);
  assert.deepEqual(clamped.sort(), [...KNOWN_CLAMPED].sort(),
    `clamped shots changed to [${clamped.sort()}] — a clamped arm returns a null that looks decisive ` +
    `(KNOWN_ISSUES 40), so any new entry must be declared in the seal before it is scored`);
});

test('contact radius: guard has no character contact to measure, by construction', () => {
  const guard = shotRadii.find((s) => s.name === 'guard');
  assert.ok(guard.z < 0, `guard player is ${guard.z.toFixed(2)} m in front of the camera; it was behind it`);
});

test('contact radius: the shots the finding is scored on resolve a usable radius', () => {
  // interior / combat / temple carry the character at a scale where a 4.5 cm feature is resolvable.
  for (const name of ['interior', 'combat', 'temple']) {
    const s = shotRadii.find((q) => q.name === name);
    assert.ok(s.rawPx >= contact[2] && s.rawPx <= contact[3],
      `${name} radius ${s.rawPx.toFixed(2)} px is outside [${contact[2]}, ${contact[3]}] — it cannot be scored for radiusM`);
  }
});

// ---------------------------------------------------------------------------------------------
// 3. the cast shadow is never in the column below the feet
// ---------------------------------------------------------------------------------------------

const atmoState = createAtmosphereState();

/* The probe that scores this finding samples a 13 px column straight down from the sole, so the
   question "can a cast shadow contaminate it" has a threshold that is DERIVED rather than chosen:
   the shadow's screen offset must exceed the probe's own width. Anything else would be a number
   picked to clear the values it judges. */
const PROBE_W_PX = 13;

test('grounding: no shipped tod throws its key shadow inside the probe column', () => {
  /* If a cast shadow could land in that column the finding would have a second possible cause and
     the contact term would not be identifiable. PREREG-contact.md established this at one sun
     angle (20.97 deg) and generalised from it; Atmosphere.js has all sixteen, so check them.
     A point at height h casts to h/tan(elevation) along the ground, away from the key. */
  const rows = SHOT_NAMES.filter((n) => SHOTS[n].player).map((name) => {
    const s = SHOTS[name];
    const at = evalAtmosphere(s.tod, atmoState);
    const elev = Math.abs(at.sunElevation ?? 0);
    const fwd = norm(sub(s.target, s.pos));
    const z = dot(sub(s.player.pos, s.pos), fwd);
    const fpx = (CAPTURE_H / 2) / Math.tan((s.fov * Math.PI) / 360);
    const lenM = 0.9 / Math.max(Math.tan((elev * Math.PI) / 180), 1e-3);
    return { name, elev, lenM, z, lenPx: (lenM * fpx) / z };
  });
  // guard's player is behind the camera; it carries no character contact and no probe column.
  const inFront = rows.filter((r) => r.z > 0);
  const contaminated = inFront.filter((r) => r.lenPx < PROBE_W_PX);
  assert.deepEqual(contaminated.map((r) => r.name), [],
    'these shots throw the cast shadow inside the 13 px probe column, so it is no longer ' +
    'contact-only: ' + contaminated.map((r) => `${r.name} elev ${r.elev.toFixed(1)}deg ${r.lenPx.toFixed(1)}px`).join(', '));
  // Calibration: the check must have something to discriminate against. If every shot had a low
  // key the margin would be enormous and the test would pass on a broken evalAtmosphere returning
  // a constant. The tightest shot is the evidence that it is measuring something.
  const tightest = inFront.reduce((a, b) => (b.lenPx < a.lenPx ? b : a));
  assert.ok(tightest.lenPx < 4 * PROBE_W_PX,
    `the tightest shot (${tightest.name}, ${tightest.lenPx.toFixed(1)} px) clears the probe width by ` +
    `more than 4x — no shipped tod is near-overhead, so this check is not discriminating`);
  const steepest = inFront.reduce((a, b) => (b.elev > a.elev ? b : a));
  assert.ok(steepest.elev > 60,
    `no shipped tod has a steep key (max ${steepest.elev.toFixed(1)} deg on ${steepest.name})`);
});
