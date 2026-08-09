/**
 * The derived head albedo must keep carrying the two properties its tool exists to give it.
 *
 * `src/assets/sly-dl/sly_head_fix.png` is a PRODUCT — `tools/slyface.mjs` writes it from
 * `sly_head.png` plus `sly.fbx` — and a committed product can drift away from the tool that made
 * it without anything complaining. This file is the guard, and it deliberately does NOT hash the
 * bytes: a zlib version bump would break a hash while changing nothing that matters. It asserts
 * the two claims instead, both of which come out of the pair of PNGs alone with no FBX and no
 * three.js, so it costs milliseconds.
 *
 * If you change `slyface.mjs`'s constants on purpose, re-derive these numbers from its own
 * printed report — do not widen a bar to admit a candidate (KNOWN_ISSUES §141.1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readPNG } from '../tools/png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = readPNG(path.join(ROOT, 'src/assets/sly-dl/sly_head.png'));
const FIX = readPNG(path.join(ROOT, 'src/assets/sly-dl/sly_head_fix.png'));
/** `INK` in slyface.mjs. An exact triple, because the tool writes it as a flat fill. */
const INK = [17, 16, 20];

const at = (im, i) => [im.data[i * im.ch], im.data[i * im.ch + 1], im.data[i * im.ch + 2]];

test('slyface: the derived albedo is the same size as the asset it derives from', () => {
  assert.equal(FIX.w, SRC.w);
  assert.equal(FIX.h, SRC.h);
});

test('slyface: the nose is painted, and it was not before', () => {
  let src = 0, fix = 0;
  for (let i = 0; i < SRC.w * SRC.h; i++) {
    const a = at(SRC, i), b = at(FIX, i);
    if (a[0] === INK[0] && a[1] === INK[1] && a[2] === INK[2]) src++;
    if (b[0] === INK[0] && b[1] === INK[1] && b[2] === INK[2]) fix++;
  }
  assert.equal(src, 0, 'the supplied albedo already contains the ink triple — the fill is no longer identifiable');
  assert.ok(fix >= 4000, `only ${fix} ink texels; the nose blob's UV footprint is 5 098 and a big shortfall means the triangle selection moved`);
});

test('slyface: the fur is white-balanced, and its value is not touched', () => {
  /* The population is the texels that actually changed and are not the nose fill — i.e. exactly
     the fur the tool claims to have corrected. Defining it from the diff rather than from a UV
     box means the test cannot drift out of alignment with the tool's own selection. */
  let n = 0, ar = 0, ab = 0, br = 0, bb = 0, al = 0, bl = 0;
  for (let i = 0; i < SRC.w * SRC.h; i++) {
    const a = at(SRC, i), b = at(FIX, i);
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
    if (b[0] === INK[0] && b[1] === INK[1] && b[2] === INK[2]) continue;
    n++; ar += a[0]; ab += a[2]; br += b[0]; bb += b[2];
    al += (a[0] + a[1] + a[2]) / 3; bl += (b[0] + b[1] + b[2]) / 3;
  }
  assert.ok(n > 50000, `only ${n} fur texels changed; the head-surface rasterisation has shrunk`);
  const before = ar / ab, after = br / bb;
  assert.ok(before >= 1.15, `the supplied fur measures R/B ${before.toFixed(3)} — it is no longer the warm albedo this correction is for`);
  assert.ok(after <= 1.02, `corrected fur is R/B ${after.toFixed(3)}, still warm (bar <= 1.02; the Godot reference head is 0.981)`);
  assert.ok(Math.abs(bl / n - al / n) <= 2.0,
    `mean luma moved ${(bl / n - al / n).toFixed(2)} — this is a hue correction and must hold value (bar |d| <= 2.0)`);
});
