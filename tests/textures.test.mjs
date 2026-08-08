/**
 * TEXTURES — guards on the load-time fix, and on the pixels it must not have moved.
 *
 * Context (KNOWN_ISSUES §215.2). The one real performance problem in this project's dataset was
 * never frame time: it was `textures: prewarm took 29.6s at size 1024` and first-frame times of
 * 12.7 / 17.5 / 29.0 s — half a minute of black screen, three orders of magnitude larger than
 * anything else measured. The fix has two halves, and each half has a way of going quietly wrong
 * that only a test can catch:
 *
 *   1. **Three buffer kernels were rewritten for speed** (`blurWrap`, `upsample`, `streakDown` —
 *      together 35 % of the whole prewarm). They were rewritten to be *bit-identical*, not
 *      approximately identical. `kernels are bit-identical to the pre-change code` below carries
 *      the **previous implementations verbatim as oracles** and compares the raw IEEE-754 bits, so
 *      a future "tidy-up" of those strip loops that shifts a single ULP fails here rather than
 *      surfacing months later as an unexplained diff in a capture.
 *
 *   2. **Building moved off the main thread** into `TextureWorker.js`, which calls `Bake.bake()` —
 *      the same function `Textures._buildLocal()` calls, so a prewarmed texture and a lazily
 *      requested one are the same function of the same seed.
 *
 *   3. **The result is now committed as a cache** — `public/assets/tex/textures.bin`, 23.5 MB of
 *      PNG-framed maps, described by `src/textures/baked.json`. This is the change with a way of
 *      going wrong that no amount of care prevents and only a test can catch: **the cache silently
 *      drifting from the code that is supposed to have produced it.** Somebody edits a recipe,
 *      does not re-run `node src/textures/bakeassets.mjs`, and from then on the repo's source of
 *      truth and its shipped pixels are two different things — with nothing on screen to say so,
 *      because the stale cache still renders perfectly well. The guard below is the entire reason
 *      the cache was allowed to exist. It has two layers and they answer different questions:
 *
 *        `the committed cache is exactly what the baker wrote`   — are the bytes on disk intact?
 *        `the committed cache is not stale`                      — do the recipes still produce them?
 *
 *      The second is the one that matters and the one that is hard: it re-derives every recipe it
 *      can reach and compares digests. See its own comment for what it can and cannot see.
 *
 * **On why the assertions are shaped the way they are** (KNOWN_ISSUES §211.1: nine assertions in
 * this project read a property the data does not have, reported green, and inspected nothing).
 * Every loop here counts what it inspected and asserts the count, every hash is asserted to be a
 * 16-character hex string before it is compared, and the golden table is asserted non-empty. A
 * test that iterates zero recipes must fail, not pass.
 *
 * **What this file cannot cover, stated rather than papered over.** Eleven of the twenty-three
 * prewarmed recipes rasterise vector art through `Canvas2D.rasterMask`, which needs a 2D canvas;
 * plain Node has neither `OffscreenCanvas` nor `document`, so they throw on the first glyph. Those
 * eleven get layer 1 (their committed bytes are verified) but not layer 2 (nobody offline can ask
 * the recipe what it would produce today). `bakeassets.mjs` closes it at bake time — it runs in a
 * browser, so it re-derives all twenty-three and cross-checks the twelve against Node before it
 * writes anything. The residual hole is therefore exactly: *a canvas-using recipe edited without
 * re-baking*. `the offline guard's coverage is exactly what it claims` asserts the split as a
 * number, so the hole can be argued about but cannot quietly grow.
 *
 * This is the same shape of gap `tests/geometry.test.mjs` records for the shipped character: the
 * offline harness cannot reach every path, and saying which is part of the guard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { blurWrap, upsample, streakDown } from '../src/textures/Canvas2D.js';
import { MATERIALS, MATERIAL_NAMES, PREWARM } from '../src/textures/Materials.js';
import { bake, bakeSize, hashName } from '../src/textures/Bake.js';
import { parsePng, unfilter } from '../src/textures/PngCodec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/textures/baked.json'), 'utf8'));
const BLOB = fs.readFileSync(path.join(ROOT, 'public/assets/tex/textures.bin'));
const blobBytes = new Uint8Array(BLOB.buffer, BLOB.byteOffset, BLOB.length);

/** Decode one manifest slot straight out of the committed blob, through the runtime's own code. */
function decodeSlot(s) {
  const png = blobBytes.subarray(s.off, s.off + s.len);
  const { width, height, zlib: z } = parsePng(png);
  const raw = new Uint8Array(zlib.inflateSync(Buffer.from(z)));
  const filters = new Set();
  for (let y = 0; y < height; y++) filters.add(raw[y * (width * 4 + 1)]);
  return { data: unfilter(raw, width, height), width, filters };
}

/* ───────────────────────────── helpers ───────────────────────────── */

/** FNV-1a-derived 64-bit-wide digest over bytes. Cheap, exact, and offline — the whole point. */
function digest(u8) {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < u8.length; i++) {
    a ^= u8[i]; a = Math.imul(a, 0x01000193);
    b = Math.imul(b ^ u8[i], 0x85ebca6b); b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Compare two Float32Arrays by their raw bits — `===` on floats would pass on -0 vs 0. */
function bitsEqual(a, b) {
  if (a.length !== b.length) return `length ${a.length} vs ${b.length}`;
  const ua = new Uint32Array(a.buffer, a.byteOffset, a.length);
  const ub = new Uint32Array(b.buffer, b.byteOffset, b.length);
  for (let i = 0; i < ua.length; i++) {
    if (ua[i] !== ub[i]) return `bit pattern differs at index ${i}: ${a[i]} vs ${b[i]}`;
  }
  return null;
}

let _s = 0x1234567;
const rnd = () => { _s = (Math.imul(_s, 1103515245) + 12345) >>> 0; return _s / 4294967296; };
function noise(n, sparse = false) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = sparse ? (rnd() < 0.03 ? rnd() : 0) : rnd();
  return a;
}

/* ───────────────── oracles: the pre-change kernels, verbatim ───────────────── */
/* Do not "simplify" these to call the shipped functions. They exist precisely because they are a
 * second, independent expression of the same arithmetic; pointing them at the code under test
 * would turn this file into `assert(x === x)` — §211.1's failure with extra steps. */

function oracleBlurWrap(src, size, radius, iter = 2) {
  const r = Math.max(1, Math.round(radius));
  const n = size * size;
  let a = Float32Array.from(src), b = new Float32Array(n);
  const w = 2 * r + 1;
  for (let it = 0; it < iter; it++) {
    for (let y = 0; y < size; y++) {
      const row = y * size;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[row + (((k % size) + size) % size)];
      for (let x = 0; x < size; x++) {
        b[row + x] = sum / w;
        sum += a[row + ((x + r + 1) % size)] - a[row + (((x - r) % size) + size) % size];
      }
    }
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += b[(((k % size) + size) % size) * size + x];
      for (let y = 0; y < size; y++) {
        a[y * size + x] = sum / w;
        sum += b[((y + r + 1) % size) * size + x] - b[((((y - r) % size) + size) % size) * size + x];
      }
    }
  }
  return a;
}

function oracleUpsample(coarse, cs, size) {
  const out = new Float32Array(size * size);
  const sc = cs / size;
  for (let y = 0; y < size; y++) {
    const fy = (y + 0.5) * sc - 0.5;
    let y0 = Math.floor(fy);
    const ty = fy - y0;
    y0 = ((y0 % cs) + cs) % cs;
    const y1 = (y0 + 1) % cs;
    const r0 = y0 * cs, r1 = y1 * cs, dst = y * size;
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) * sc - 0.5;
      let x0 = Math.floor(fx);
      const tx = fx - x0;
      x0 = ((x0 % cs) + cs) % cs;
      const x1 = (x0 + 1) % cs;
      const a = coarse[r0 + x0], b = coarse[r0 + x1], c = coarse[r1 + x0], d = coarse[r1 + x1];
      out[dst + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

function oracleIhash(x, y, seed) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(seed, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

function oracleStreakDown(src, size, decay = 0.985, wobbleSeed = 7) {
  const out = new Float32Array(size * size);
  for (let x = 0; x < size; x++) {
    const d = decay - 0.012 * (oracleIhash(x, 3, wobbleSeed) / 4294967296);
    let acc = 0;
    for (let k = 0; k < size * 2; k++) {
      const y = ((size - 1 - k) % size + size) % size;
      const i = y * size + x;
      const s = src[i];
      acc = s > acc * d ? s : acc * d;
      if (k >= size) out[i] = acc;
    }
  }
  return out;
}

/* ───────────────────────────── the kernels ───────────────────────────── */

test('blurWrap is bit-identical to the pre-change implementation', () => {
  /* Cases chosen to exercise the parts that were rewritten, not to be round numbers:
   *  - r = 1 and r = 2      : radius smaller than one strip, the common case in `derive`
   *  - r = 30, iter = 3     : `heightAO`'s broad term, where the modulo cost dominated
   *  - r = 40 on size 32    : radius > size, so the wrap table must fold more than once
   *  - size 17, 33          : not a multiple of STRIP (16), so the ragged tail strip is hit */
  const cases = [
    [64, 1, 1], [64, 2, 2], [64, 30, 3], [32, 40, 2],
    [17, 3, 2], [33, 5, 2], [128, 12, 2],
  ];
  let checked = 0;
  for (const [size, radius, iter] of cases) {
    const src = noise(size * size);
    const bad = bitsEqual(oracleBlurWrap(src, size, radius, iter), blurWrap(src, size, radius, iter));
    assert.equal(bad, null, `blurWrap(size ${size}, r ${radius}, iter ${iter}): ${bad}`);
    checked++;
  }
  // A loop that inspected nothing must not report green.
  assert.equal(checked, cases.length);
});

test('upsample is bit-identical to the pre-change implementation', () => {
  // Includes cs > size (downsampling), cs === size, and non-multiple ratios.
  const cases = [[4, 64], [8, 64], [16, 64], [7, 33], [64, 64], [64, 16], [5, 17]];
  let checked = 0;
  for (const [cs, size] of cases) {
    const src = noise(cs * cs);
    const bad = bitsEqual(oracleUpsample(src, cs, size), upsample(src, cs, size));
    assert.equal(bad, null, `upsample(cs ${cs} -> ${size}): ${bad}`);
    checked++;
  }
  assert.equal(checked, cases.length);
});

test('streakDown is bit-identical to the pre-change implementation', () => {
  const cases = [[64, 0.985], [64, 0.999], [33, 0.97], [17, 0.9]];
  let checked = 0;
  for (const [size, decay] of cases) {
    const src = noise(size * size, true);
    const bad = bitsEqual(oracleStreakDown(src, size, decay), streakDown(src, size, decay));
    assert.equal(bad, null, `streakDown(size ${size}, decay ${decay}): ${bad}`);
    checked++;
  }
  assert.equal(checked, cases.length);
});

test('the kernel oracles can actually fail — a 1/255 perturbation is detected', () => {
  /* The calibration arm. An oracle that cannot distinguish its two inputs is worth less than no
   * oracle at all (RESULT-cel1: a calibration arm built on a lever already known to be broken
   * voided its own run). One 8-bit quantisation step is the smallest change that could reach a
   * shipped texel, so that is what the comparator is proven to catch. */
  const size = 64;
  const src = noise(size * size);
  const ref = oracleBlurWrap(src, size, 3, 2);
  const nudged = Float32Array.from(ref, (v) => v * (1 + 1 / 255));
  assert.notEqual(bitsEqual(ref, nudged), null, 'comparator failed to see a 1/255 change');

  const up = oracleUpsample(noise(64), 8, size);
  assert.notEqual(bitsEqual(up, Float32Array.from(up, (v) => v * (1 + 1 / 255))), null);

  // …and it must not cry wolf on an identical buffer.
  assert.equal(bitsEqual(ref, Float32Array.from(ref)), null);
});
/* ───────────────────── layer 1: the committed cache is intact ───────────────────── */

test('the manifest describes exactly the prewarm set, at the shipped resolution', () => {
  assert.equal(MANIFEST.version, 1);
  assert.equal(MANIFEST.texSize, 1024, 'the cache is built for the `med`/`high` tier');
  assert.ok(MANIFEST.guardSize >= 128 && MANIFEST.guardSize <= MANIFEST.texSize);
  const named = Object.keys(MANIFEST.recipes);
  // Both directions. A recipe added to PREWARM without re-baking is the common mistake; a stale
  // manifest entry for a recipe that has been removed is the rarer one, and costs 23 MB of repo.
  for (const n of PREWARM) assert.ok(MANIFEST.recipes[n], `PREWARM has "${n}" but the cache does not — re-run \`node src/textures/bakeassets.mjs\``);
  for (const n of named) assert.ok(PREWARM.includes(n), `the cache carries "${n}", which is no longer prewarmed — re-run the baker`);
  assert.equal(named.length, PREWARM.length);
});

test('the committed cache is exactly what the baker wrote', () => {
  /* Layer 1. `blobDigest` over all 23.5 MB is the load-bearing assertion here and it is 57 ms:
   * any change to any byte of the committed asset — a corrupted checkout, a hand-edit, a partial
   * write, a re-bake that was not accompanied by its manifest — moves it.
   *
   * The per-slot decode below is deliberately a *subset*, and the reasoning is worth stating
   * because "verify everything" was the first instinct. Decoding all 70 maps costs 2.4 s and adds
   * nothing that `blobDigest` has not already established: the baker verified all 70 round trips
   * before writing, the decoder is deterministic, and the bytes are proven unchanged. What the
   * subset is really testing is **the decoder**, which is code that can change under a blob that
   * cannot — so it is chosen for decoder coverage, not for sampling:
   *
   *   hieroglyph_wall.albedo  1024², and by itself exercises filter types 1, 2, 3 and 4
   *   torch_flame.albedo      the map the canvas decode path destroyed — 150,607 of 262,144 bytes
   *                           wrong, peak 184/255 on red. If a canvas ever creeps back in, this
   *                           is the assertion that catches it.
   *   torch_flame.emissive    the only emissive map in the catalogue
   *   palm_frond.albedo       the other alpha-carrying albedo
   *   sandstone_block.orm     a half-resolution map, so the ORM size contract is decoded too
   *
   * Filter coverage is asserted rather than assumed — see the `filters` set. */
  const digestOK = digest(blobBytes) === MANIFEST.blobDigest;
  assert.equal(BLOB.length, MANIFEST.bytes, 'the committed blob is not the size the manifest records');
  assert.ok(digestOK, 'public/assets/tex/textures.bin does not match the manifest digest — re-run `node src/textures/bakeassets.mjs`');

  const SUBSET = [
    ['hieroglyph_wall', 'albedo'], ['torch_flame', 'albedo'], ['torch_flame', 'emissive'],
    ['palm_frond', 'albedo'], ['sandstone_block', 'orm'],
  ];
  const filters = new Set();
  let checked = 0;
  for (const [name, slot] of SUBSET) {
    const s = MANIFEST.recipes[name]?.slots?.[slot];
    assert.ok(s, `${name}.${slot} is not in the cache`);
    const got = decodeSlot(s);
    assert.equal(got.width, s.size, `${name}.${slot}: decoded ${got.width}px, manifest says ${s.size}`);
    assert.equal(got.data.length, s.size * s.size * 4);
    assert.match(s.digest, /^[0-9a-f]{16}$/, `${name}.${slot}: manifest digest is malformed`);
    assert.equal(digest(got.data), s.digest, `${name}.${slot}: does not decode to the bytes the baker recorded`);
    for (const f of got.filters) filters.add(f);
    checked++;
  }
  assert.equal(checked, SUBSET.length);
  // The claim "this subset exercises the decoder" is measured, not asserted by feel.
  for (const f of [1, 2, 3, 4]) assert.ok(filters.has(f), `no scanline in the subset uses PNG filter ${f}`);
});

test('unfilter handles all five PNG filter types, including the one the blob never uses', () => {
  /* pngjs's adaptive heuristic never picks filter 0 on this content — measured across all 70
   * committed maps: 193 rows of Sub, 3805 of Up, 1359 of Average, 32275 of Paeth, and **zero** of
   * None. So `unfilter`'s filter-0 fast path is entirely uncovered by the cache, and a test that
   * only decoded committed assets would report green over dead code. Hand-built rows instead, with
   * expectations computed from the spec rather than from the implementation. */
  const W = 2, H = 5, stride = W * 4;
  const raw = new Uint8Array(H * (stride + 1));
  const row = (y, ft, bytes) => { raw[y * (stride + 1)] = ft; raw.set(bytes, y * (stride + 1) + 1); };
  row(0, 0, [10, 20, 30, 40, 50, 60, 70, 80]);                 // None  -> verbatim
  row(1, 1, [1, 1, 1, 1, 2, 2, 2, 2]);                         // Sub   -> +Left
  row(2, 2, [5, 5, 5, 5, 5, 5, 5, 5]);                         // Up    -> +Above
  row(3, 3, [0, 0, 0, 0, 0, 0, 0, 0]);                         // Avg   -> (Left+Above)>>1
  row(4, 4, [0, 0, 0, 0, 0, 0, 0, 0]);                         // Paeth -> predictor
  const out = unfilter(raw, W, H);
  const px = (y, x) => [...out.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
  assert.deepEqual(px(0, 0), [10, 20, 30, 40]);
  assert.deepEqual(px(0, 1), [50, 60, 70, 80]);
  assert.deepEqual(px(1, 0), [1, 1, 1, 1], 'Sub with no left neighbour is the raw byte');
  assert.deepEqual(px(1, 1), [3, 3, 3, 3], 'Sub adds the pixel to its left');
  assert.deepEqual(px(2, 0), [6, 6, 6, 6], 'Up adds the pixel above');
  assert.deepEqual(px(2, 1), [8, 8, 8, 8]);
  assert.deepEqual(px(3, 0), [3, 3, 3, 3], 'Average of left(0) and above(6), floored');
  assert.deepEqual(px(3, 1), [5, 5, 5, 5], 'Average of left(3) and above(8), floored');
  assert.deepEqual(px(4, 0), [3, 3, 3, 3], 'Paeth with no left/up-left picks Above');
  assert.deepEqual(px(4, 1), [5, 5, 5, 5]);
  // 8-bit wraparound is part of the format, not an accident.
  const w = new Uint8Array(1 + 4); w[0] = 1; w.set([200, 200, 200, 200], 1);
  assert.deepEqual([...unfilter(w, 1, 1)], [200, 200, 200, 200]);

  assert.throws(() => unfilter(new Uint8Array([9, 0, 0, 0, 0]), 1, 1), /filter type 9/);
  assert.throws(() => unfilter(new Uint8Array(3), 4, 4), /short/);
});

test('parsePng rejects anything the baker does not write', () => {
  /* The decoder's format contract. A decoder that coped with 16-bit or palettised input would be
   * a decoder that can return wrong pixels for a file this project did not produce. */
  const good = blobBytes.subarray(
    MANIFEST.recipes.gold_leaf.slots.albedo.off,
    MANIFEST.recipes.gold_leaf.slots.albedo.off + MANIFEST.recipes.gold_leaf.slots.albedo.len);
  assert.equal(parsePng(good).width, MANIFEST.recipes.gold_leaf.slots.albedo.size);

  const bend = (i, v) => { const c = good.slice(); c[i] = v; return c; };
  assert.throws(() => parsePng(bend(1, 0)), /signature/);
  assert.throws(() => parsePng(bend(24, 16)), /bit depth 16/);       // IHDR byte 8  = depth
  assert.throws(() => parsePng(bend(25, 3)), /colour type 3/);       // IHDR byte 9  = colour type
  assert.throws(() => parsePng(bend(28, 1)), /interlaced/);          // IHDR byte 12 = interlace
});

/* ───────────────── layer 2: the committed cache is not stale ───────────────── */

test('the committed cache is not stale — every reachable recipe still produces it', () => {
  /* **This is the test that made the cache acceptable to ship.** Everything else here guards
   * bytes; this one guards the relationship between the bytes and the code, which is the only
   * thing a committed cache can silently lose.
   *
   * It works by re-deriving each recipe at `guardSize` (256) and comparing against the digest the
   * baker recorded *in the same run* that produced the 1024² asset. Co-produced, so they cannot
   * disagree unless the generator has changed since. 256 rather than 1024 is what makes it cost
   * ~2.3 s instead of ~24 s, and it is a real (small) weakening: a change that alters 1024² output
   * while leaving 256² untouched would slip through. That would take a branch on `size`, which no
   * recipe currently has.
   *
   * If this goes red: **run `node src/textures/bakeassets.mjs`.** Do not edit the manifest. */
  const names = Object.keys(MANIFEST.recipes);
  assert.ok(names.length >= 20, `manifest is empty or truncated (${names.length} recipes)`);
  let checked = 0, skipped = 0;
  for (const name of names) {
    const rec = MANIFEST.recipes[name];
    if (!rec.nodeBakeable) { skipped++; continue; }
    const p = bake(name, MANIFEST.guardSize, 'high');
    assert.ok(p.albedo instanceof Uint8Array, `${name}: bake() did not return an albedo buffer`);
    const got = [digest(p.albedo), digest(p.normal), digest(p.orm.data), p.emissive ? digest(p.emissive) : '-'].join('/');
    assert.match(rec.guard, /^[0-9a-f]{16}\/[0-9a-f]{16}\/[0-9a-f]{16}\/([0-9a-f]{16}|-)$/, `${name}: manifest guard is malformed`);
    assert.equal(got, rec.guard,
      `${name}: the recipe no longer produces the committed cache. Re-run \`node src/textures/bakeassets.mjs\`.`);
    // The scalars that ride alongside the pixels and would otherwise drift unnoticed.
    assert.equal(p.hasAlpha, rec.hasAlpha, `${name}: hasAlpha changed`);
    assert.equal(+p.normalStrength.toFixed(6), +(rec.normalStrength * (MANIFEST.guardSize / rec.size)).toFixed(6),
      `${name}: slope scale is no longer linear in size — the guard resolution no longer predicts the shipped one`);
    checked++;
  }
  assert.ok(checked >= 12, `staleness guard re-derived only ${checked} recipes`);
  assert.equal(checked + skipped, names.length);
});

test("the offline guard's coverage is exactly what it claims", () => {
  /* The honest accounting. Layer 2 cannot reach the canvas-using recipes, and the number of them
   * is asserted so the hole can be argued about but cannot quietly grow: if someone adds a
   * canvas-using recipe to PREWARM, this goes red and they have to say so out loud. */
  const recs = Object.entries(MANIFEST.recipes);
  const reachable = recs.filter(([, r]) => r.nodeBakeable).map(([n]) => n);
  const blind = recs.filter(([, r]) => !r.nodeBakeable).map(([n]) => n);
  assert.equal(reachable.length + blind.length, recs.length);
  assert.equal(reachable.length, 12, `staleness guard reaches ${reachable.length} recipes, expected 12`);
  assert.equal(blind.length, 11, `${blind.length} recipes need a canvas, expected 11 — see the file header`);
  /* The claim is checked, not trusted — but only in the direction that is cheap and that nothing
   * else covers. That a `nodeBakeable` recipe really bakes is already proven by the staleness test
   * above, which bakes all twelve; re-baking them here cost 1.4 s to re-establish it. The other
   * direction is not covered anywhere else and is nearly free, because a canvas-only recipe throws
   * on its first `rasterMask` before doing any real work. */
  for (const n of blind) assert.throws(() => bake(n, 64, 'high'), `${n} is marked canvas-only but builds fine in Node`);
});

test('the staleness guard can actually fail — its digest separates two recipes', () => {
  /* Calibration. If `digest` collided or `bake` ignored its name, every row above would pass for
   * the wrong reason. Two different recipes must digest differently; one recipe twice must not. */
  const a = bake('sandstone_block', 128, 'high');
  const b = bake('limestone_polished', 128, 'high');
  assert.notEqual(digest(a.albedo), digest(b.albedo));
  assert.notEqual(digest(a.normal), digest(b.normal));
  assert.equal(digest(bake('gold_leaf', 128, 'high').albedo), digest(bake('gold_leaf', 128, 'high').albedo));
  // …and it must see a single 8-bit step, which is the smallest change that can reach a texel.
  const nudged = a.albedo.slice(); nudged[0] = (nudged[0] + 1) & 255;
  assert.notEqual(digest(nudged), digest(a.albedo));
});

test('the joint-sign invariant holds for every masonry recipe in the cache', () => {
  /* Mortar is darker and lower than the faces either side of it — light collects on proud
   * surfaces and dirt collects in gaps. `paving_courtyard` once shipped with a positive luma
   * delta and the floor read as "cracked ice". `Bake.jointSign` measures it; nothing asserted it. */
  let checked = 0;
  for (const [name, rec] of Object.entries(MANIFEST.recipes)) {
    if (!rec.joint) continue;
    assert.ok(rec.joint.dY < 0, `${name}: joint luma delta ${rec.joint.dY} — mortar is brighter than the block faces`);
    assert.ok(rec.joint.dH < 0, `${name}: joint height delta ${rec.joint.dH} — mortar stands proud of the block faces`);
    checked++;
  }
  assert.ok(checked >= 4, `expected at least 4 masonry recipes in the cache, inspected ${checked}`);
});


/* ─────────────────── the prewarm list and the bake contract ─────────────────── */

test('every PREWARM name is a real recipe, listed once', () => {
  assert.ok(PREWARM.length > 0);
  const seen = new Set();
  for (const name of PREWARM) {
    assert.ok(MATERIALS[name], `PREWARM names "${name}", which is not in the catalogue`);
    assert.ok(!seen.has(name), `PREWARM lists "${name}" twice — it would be built twice`);
    seen.add(name);
  }
  assert.equal(seen.size, PREWARM.length);
  assert.ok(PREWARM.length <= MATERIAL_NAMES.length);
});

test('PREWARM does not contain the two names that only look consumed', () => {
  /* `spark_diamond` and `water_nile` match a grep outside `src/textures` and are not textures at
   * either site: `HUD.js:417` passes 'sparkle' to `Ico.glyph`, and every 'water' hit is a
   * collision tag or a `BVH.MAT_NAMES` entry — `Water.js` never calls TEXTURES at all. Prewarming
   * them would cost 1.87 s and ~12 MB for material that reaches no pixel, which is the mistake
   * the note above PREWARM exists to record. Delete this test when a real consumer appears,
   * deliberately and with the call site named. */
  for (const dead of ['spark_diamond', 'water_nile']) {
    assert.ok(MATERIALS[dead], `${dead} should still be in the catalogue, buildable on demand`);
    assert.ok(!PREWARM.includes(dead), `${dead} is prewarmed but has no consumer`);
  }
});

test('bakeSize implements the tier resolution contract', () => {
  /* Tier 0 = full budget resolution, tier 1/2 = half with a 256 floor, an explicit `size` clamps
   * to the budget. This is also the parallel prewarm's cost model — the scheduler dispatches
   * longest-first on `bakeSize`, so a wrong answer here degrades the makespan silently. */
  assert.equal(bakeSize({ tier: 0 }, 1024), 1024);
  assert.equal(bakeSize({ tier: 1 }, 1024), 512);
  assert.equal(bakeSize({ tier: 2 }, 1024), 512);
  assert.equal(bakeSize({ tier: 1 }, 256), 256, 'the 256 floor must hold below it, not halve again');
  assert.equal(bakeSize({ tier: 0 }, 512), 512);
  assert.equal(bakeSize({ tier: 1, size: 128 }, 1024), 128, 'an explicit size wins under the budget');
  assert.equal(bakeSize({ tier: 0, size: 4096 }, 1024), 1024, 'an explicit size is clamped to the budget');

  // Every real recipe must land on a power of two within the budget, or the DataTexture mips fray.
  let checked = 0;
  for (const name of MATERIAL_NAMES) {
    const s = bakeSize(MATERIALS[name], 1024);
    assert.ok(s >= 64 && s <= 1024, `${name}: bakeSize ${s} is outside [64, 1024]`);
    assert.equal(s & (s - 1), 0, `${name}: bakeSize ${s} is not a power of two`);
    checked++;
  }
  assert.equal(checked, MATERIAL_NAMES.length);
});

test('bake() returns every field Textures._finish and TextureWorker read', () => {
  /* The worker/main-thread split means this object crosses a structured-clone boundary. A field
   * `_finish` reads but `bake` stops producing would be `undefined` on both paths and silently
   * drop a map — exactly the §211.1 shape, but in shipping code. */
  const p = bake('torch_flame', 128, 'high');   // the one prewarm recipe with an emissive map
  for (const k of ['name', 'size', 'albedo', 'normal', 'orm', 'hasAlpha', 'normalStrength']) {
    assert.ok(k in p, `bake() no longer returns "${k}"`);
  }
  assert.equal(p.name, 'torch_flame');
  assert.ok(p.emissive instanceof Uint8Array, 'torch_flame must carry an emissive map');
  assert.equal(typeof p.hasAlpha, 'boolean');
  assert.ok(Number.isFinite(p.normalStrength) && p.normalStrength > 0);
  assert.ok(Number.isInteger(p.orm.size) && p.orm.size === p.size >> 1, 'ORM ships at half resolution');
  assert.equal(p.orm.data.length, p.orm.size * p.orm.size * 4);
  assert.ok('joint' in p, 'bake() must publish joint (null for non-masonry), not omit it');

  // The buffers must be transferable — a view onto a shared buffer would corrupt on postMessage.
  assert.equal(p.albedo.byteOffset, 0);
  assert.notEqual(p.albedo.buffer, p.normal.buffer, 'albedo and normal must not share a buffer');
});

test('hashName is the stable per-name seed the catalogue relies on', () => {
  /* Moved from Textures.js to Bake.js when the build was split across threads. If it drifted,
   * every recipe without an explicit `seed` would re-roll its noise — the whole catalogue
   * changing look at once, for no reason anyone would think to look for. */
  assert.equal(hashName('sandstone_block'), 2641414714);
  assert.equal(hashName('gold_leaf'), 1192489244);
  assert.equal(hashName('torch_flame'), 178868949);
  assert.equal(hashName(''), 0x811c9dc5, 'the FNV offset basis is the empty-string value');
  assert.notEqual(hashName('a'), hashName('b'));
  for (const name of MATERIAL_NAMES) {
    const h = hashName(name);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `${name}: seed ${h} is not a uint32`);
  }
});
