import test from 'node:test';
import assert from 'node:assert/strict';
import { minChord, medianChord, largestComponent, selfTest } from '../tools/chord.mjs';

/* The minimum-chord width is the instrument PREREG-inkwiden's W3 (the mush falsifier) is scored
   with, so it gets the same treatment every other instrument in this repo gets: known-good and
   known-bad shapes, and an assertion that it can tell them apart. A width metric that cannot
   distinguish a line from a blob would pass a shading pass off as an ink pass, which is the
   defect PostFX.js:127-134 already records having shipped once. */

test('chord: a long thin band measures its THICKNESS, not its length', () => {
  const W = 60, H = 20;
  for (const t of [1, 2, 3, 5]) {
    const m = new Uint8Array(W * H);
    for (let y = 8; y < 8 + t; y++) for (let x = 2; x < W - 2; x++) m[y * W + x] = 1;
    assert.equal(medianChord(m, W, H), t, `a ${t}px x 56px band should measure ${t}`);
  }
});

test('chord: a vertical band measures the same as a horizontal one', () => {
  const W = 20, H = 60;
  const m = new Uint8Array(W * H);
  for (let y = 2; y < H - 2; y++) for (let x = 8; x < 11; x++) m[y * W + x] = 1;
  assert.equal(medianChord(m, W, H), 3);
});

test('chord: CALIBRATION — a blob must not read as a line, or the metric is inert', () => {
  const W = 40, H = 40;
  const band = new Uint8Array(W * H);
  for (let y = 10; y < 13; y++) for (let x = 2; x < 38; x++) band[y * W + x] = 1;
  const blob = new Uint8Array(W * H);
  for (let y = 5; y < 25; y++) for (let x = 5; x < 25; x++) blob[y * W + x] = 1;
  const b = medianChord(band, W, H), s = medianChord(blob, W, H);
  assert.equal(b, 3);
  /* S/2 is the geometric floor: at least half a filled SxS square lies where all four runs are
     >= S/2. Corner pixels have short diagonal runs and pull the median below S. */
  assert.ok(s >= 10, `20x20 blob measured ${s}, geometric floor is S/2 = 10`);
  assert.ok(s > 3 * b, `blob ${s} vs band ${b}: the metric does not discriminate`);
});

test('chord: an empty mask has no width rather than a width of zero', () => {
  assert.equal(medianChord(new Uint8Array(100), 10, 10), null);
});

test('chord: minChord is 0 exactly where the mask is unset', () => {
  const W = 10, H = 10;
  const m = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) m[5 * W + x] = 1;
  const c = minChord(m, W, H);
  for (let i = 0; i < c.length; i++) assert.equal(!!c[i], !!m[i]);
});

test('chord: largestComponent counts the biggest 4-connected region only', () => {
  const W = 40, H = 40;
  const m = new Uint8Array(W * H);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) m[y * W + x] = 1;      // 16
  for (let y = 20; y < 30; y++) for (let x = 20; x < 30; x++) m[y * W + x] = 1;  // 100
  assert.equal(largestComponent(m, W, H), 100);
  /* Diagonal touching is NOT connectivity here — two squares meeting at a corner stay separate,
     which is the conservative choice for "is this one blob". */
  const d = new Uint8Array(W * H);
  for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) d[y * W + x] = 1;
  for (let y = 5; y < 8; y++) for (let x = 5; x < 8; x++) d[y * W + x] = 1;
  assert.equal(largestComponent(d, W, H), 9);
});

test('chord: the module self-test passes', () => {
  assert.equal(selfTest(), true);
});
