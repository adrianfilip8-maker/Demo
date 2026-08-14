import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AMBIENT } from '../src/fx/Emitters.js';

/**
 * PREREG-fxghost2 — the MECHANISM pin, landed with the knobs and BEFORE any candidate frame.
 *
 * §306/RESULT-fxartifact falsified the first ghost-disc lever by measurement: cutting
 * `sand_haze.litMix` (the pool's KEY-lit leg) to 0.26/0.13/0.00 attenuated only the temple
 * component (r 0.72 -> 0.56 -> 0.36) and left the four night components at r >= 0.94 at every
 * dose. The discs ride the pool's OTHER leg. The follow-up seal therefore sweeps the two
 * levers that leg is reachable by — the ambient leg's own gain, and the sprite's opacity —
 * and both are landed here INERT so the seal's A/B is a pure uniform poke inside one boot.
 *
 * What this file protects:
 *   1. the two uniforms exist and are spelled the way the runner pokes them;
 *   2. their default is 1.0 on BOTH the shader side (x * 1.0 is IEEE-exact, so the batch is
 *      byte-identical) and the plumbing side (no AMBIENT def sets either key today);
 *   3. `litMix` on the two sand pools is exactly where the falsified seal left it — this seal
 *      must not quietly ship the lever its parent refuted;
 *   4. the gate lines' exact spelling, so a later refactor cannot make the ambient gain reach
 *      the key leg (or the alpha gain reach a different alpha) without turning this red.
 */

const SRC = path.join(import.meta.dirname, '../src/fx/Particles.js');
const src = readFileSync(SRC, 'utf8');

test('fxghost2: the ambient-leg and opacity gains are declared in the sprite vertex shader', () => {
  assert.ok(src.includes('uniform float uAmbGain;'),
    'uAmbGain declaration missing — PREREG-fxghost2 pokes this uniform by name');
  assert.ok(src.includes('uniform float uAlphaGain;'),
    'uAlphaGain declaration missing — PREREG-fxghost2 pokes this uniform by name');
});

test('fxghost2: uAmbGain scales the AMBIENT leg only, and uAlphaGain the sprite opacity only', () => {
  assert.ok(src.includes('col *= mix( uAmbTint * uAmbGain, uLightTint * boost, uLitMix );'),
    'the LIT colour line must scale uAmbTint and nothing else — the key leg and uLitMix are '
    + 'the lever RESULT-fxartifact already falsified, and this seal must not move them');
  assert.ok(src.includes('alpha *= uAlphaGain;'),
    'the sprite opacity gain line is missing or respelled (PREREG-fxghost2 §2)');
});

test('fxghost2: both gains default to 1.0 — the knobs are inert in HEAD', () => {
  assert.ok(src.includes('uAmbGain: { value: opts.ambGain ?? 1 }'),
    'uAmbGain must default to 1 (IEEE-exact no-op) when a batch does not ask for it');
  assert.ok(src.includes('uAlphaGain: { value: opts.alphaGain ?? 1 }'),
    'uAlphaGain must default to 1 (IEEE-exact no-op) when a batch does not ask for it');
  assert.ok(src.includes('ambGain: def.ambGain ?? 1,') && src.includes('alphaGain: def.gain ?? 1,'),
    'the AMBIENT plumbing must read the pool def and fall back to 1');

  for (const [key, def] of Object.entries(AMBIENT)) {
    assert.equal(def.ambGain, undefined,
      `AMBIENT.${key}.ambGain is set — nothing may ship a gain without PREREG-fxghost2's verdict`);
    assert.equal(def.gain, undefined,
      `AMBIENT.${key}.gain is set — nothing may ship a gain without PREREG-fxghost2's verdict`);
  }
});

test('fxghost2: the falsified lever stays exactly where RESULT-fxartifact left it', () => {
  assert.equal(AMBIENT.sand_haze.litMix, 0.52,
    'sand_haze.litMix moved — the litMix sweep FAILED every ghost bar (RESULT-fxartifact §1); '
    + 'it is not this seal\'s ship surface');
  assert.equal(AMBIENT.sand_drift.litMix, 0.44,
    'sand_drift.litMix moved — the neighbour pool that carries the ground haze is out of scope');
  assert.equal(AMBIENT.sand_haze.batch, 'sandHigh',
    'sand_haze left the sandHigh batch — the seal\'s per-batch scoping argument rests on '
    + 'sandHigh carrying this pool and only this pool');
  const onSandHigh = Object.entries(AMBIENT).filter(([, d]) => d.batch === 'sandHigh');
  assert.equal(onSandHigh.length, 1,
    `sandHigh now carries ${onSandHigh.length} pools (${onSandHigh.map(([k]) => k)}) — a batch `
    + 'uniform would no longer be scoped to sand_haze alone');
});
