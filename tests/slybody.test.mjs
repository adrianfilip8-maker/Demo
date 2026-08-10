import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPNG } from '../tools/png.mjs';

/**
 * The costume-hue correction is a HUE rotation and nothing else (critic 9 D2, §277/§278).
 *
 * §277's measurement is the whole reason this fix has the shape it does: the supplied albedo's
 * shirt saturation is **0.927** against the reference's 0.909 — already correct, and consistent
 * (p05–p95 spread 0.080) — while its hue is 229.0° against 213.5°. So the defect is hue alone, and
 * a "fix" that also moved saturation would be correcting something that was never wrong and would
 * have to be undone later.
 *
 * These tests pin that property on the shipped artefact rather than on the tool that made it,
 * because the artefact is what loads. `tools/slybody.mjs` asserts the same invariant at derive
 * time; this asserts it at rest, so regenerating with a wrong flag cannot slip through.
 */

const SRC = new URL('../src/assets/sly-dl/sly_body.png', import.meta.url).pathname;
const FIX = new URL('../src/assets/sly-dl/sly_body_fix.png', import.meta.url).pathname;
const RIG = new URL('../src/player/SlyModelDLRig.js', import.meta.url).pathname;

const H_LO = 190, H_HI = 270, S_MIN = 0.15;

function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx ? d / mx : 0, mx];
}

/** Costume-blue texels of an image, as {h,s,v} triples. */
function costume(im) {
  const out = [];
  for (let i = 0; i < im.w * im.h; i++) {
    const o = i * im.ch;
    if (im.ch === 4 && im.data[o + 3] < 250) continue;
    const c = hsv(im.data[o], im.data[o + 1], im.data[o + 2]);
    if (c[1] > S_MIN && c[0] >= H_LO && c[0] <= H_HI) out.push(c);
  }
  return out;
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

test('CALIBRATION (must fire): both textures exist and the harness can see costume blue in each', () => {
  /* Every assertion below is of the form "these two differ in exactly one way". If the harness
     found no costume pixels, all of them would pass while comparing empty sets. */
  const a = costume(readPNG(SRC));
  const b = costume(readPNG(FIX));
  assert.ok(a.length > 10000, `found only ${a.length} costume texels in the supplied texture`);
  assert.ok(b.length > 10000, `found only ${b.length} costume texels in the derived texture`);
});

test('saturation is untouched — §277 measured it as already correct', () => {
  const a = costume(readPNG(SRC));
  const b = costume(readPNG(FIX));
  const dS = Math.abs(mean(b.map((c) => c[1])) - mean(a.map((c) => c[1])));
  assert.ok(dS <= 0.01,
    `mean saturation moved by ${dS.toFixed(4)}. §277 measured the supplied albedo at 0.927 against `
    + 'the reference 0.909 — already correct. A hue fix that moves saturation is fixing the wrong '
    + 'thing and will have to be undone.');
});

test('value is untouched, so the airbrushed-gradient defect (D3) is neither fixed nor worsened here', () => {
  const a = costume(readPNG(SRC));
  const b = costume(readPNG(FIX));
  const dV = Math.abs(mean(b.map((c) => c[2])) - mean(a.map((c) => c[2])));
  assert.ok(dV <= 0.01, `mean value moved by ${dV.toFixed(4)} — this fix must not touch D3's axis`);
});

test('hue moves onto the pre-compensated target, not onto the reference frame hue', () => {
  const a = med(costume(readPNG(SRC)).map((c) => c[0]));
  const b = med(costume(readPNG(FIX)).map((c) => c[0]));
  assert.ok(a > 225 && a < 233, `supplied median hue ${a.toFixed(1)}° is not the measured 229°`);
  /* 207.9° = 213.5 (reference FRAME hue) − 5.6 (our render's own violet shift, §277). Landing on
     213.5 here would be the naive target and would still render at 219.1°. */
  assert.ok(Math.abs(b - 207.9) < 2.0,
    `derived median hue ${b.toFixed(1)}° should sit near the pre-compensated 207.9°, not on the `
    + 'reference frame hue 213.5° — the render adds +5.6° after the albedo');
});

test('non-costume colours are byte-identical: shorts, sash, belt, mask and white are not recoloured', () => {
  const a = readPNG(SRC), b = readPNG(FIX);
  assert.equal(a.w, b.w); assert.equal(a.h, b.h);
  let checked = 0, differing = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const o = i * a.ch;
    const c = hsv(a.data[o], a.data[o + 1], a.data[o + 2]);
    const opaque = a.ch === 4 ? a.data[o + 3] >= 250 : true;
    if (opaque && c[1] > S_MIN && c[0] >= H_LO && c[0] <= H_HI) continue;   // in-window, may move
    checked++;
    if (a.data[o] !== b.data[o] || a.data[o + 1] !== b.data[o + 1] || a.data[o + 2] !== b.data[o + 2]) differing++;
  }
  assert.ok(checked > 50000, `only ${checked} out-of-window texels examined`);
  assert.equal(differing, 0, `${differing} out-of-window texels changed — the rotation leaked`);
});

test('the lever is opt-IN and defaults to raw, so the shipped build is unchanged', () => {
  const src = readFileSync(RIG, 'utf8');
  const fn = /function bodyMode\(\)\s*\{([\s\S]*?)\n\}/.exec(src);
  assert.ok(fn, 'bodyMode() not found — has the lever been renamed?');
  assert.match(fn[1], /return 'raw'/,
    "bodyMode() no longer defaults to 'raw'. Flipping this default ships a pixel change that has "
    + 'never been measured in a frame; it needs a sealed capture first (§141.1).');
  assert.match(src, /part === 'body' && BODY_MODE === 'fix'/,
    'the body texture no longer switches on BODY_MODE');
});
