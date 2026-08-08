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
 *      the same function `Textures._buildLocal()` calls. The golden-hash table pins what `bake()`
 *      produces for every recipe that can run without a canvas, so "the load-time fix silently
 *      altered the look" is a red test and not a judgement call.
 *
 * **On why the assertions are shaped the way they are** (KNOWN_ISSUES §211.1: nine assertions in
 * this project read a property the data does not have, reported green, and inspected nothing).
 * Every loop here counts what it inspected and asserts the count, every hash is asserted to be a
 * 16-character hex string before it is compared, and the golden table is asserted non-empty. A
 * test that iterates zero recipes must fail, not pass.
 *
 * **What this file cannot cover.** Eleven of the twenty-three prewarmed recipes rasterise vector
 * art through `Canvas2D.rasterMask`, which needs a 2D canvas; plain Node has neither
 * `OffscreenCanvas` nor `document`, so they throw on import of the first glyph. They are covered
 * instead by the browser-side hash comparison recorded in the task report (23/23 byte-identical,
 * main thread vs worker). This is the same gap `tests/geometry.test.mjs` records for the shipped
 * character: the offline harness cannot reach every path, and saying so is part of the guard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { blurWrap, upsample, streakDown } from '../src/textures/Canvas2D.js';
import { MATERIALS, MATERIAL_NAMES, PREWARM } from '../src/textures/Materials.js';
import { bake, bakeSize, hashName } from '../src/textures/Bake.js';

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

/* ───────────────────────── the catalogue's pixels ───────────────────────── */

/**
 * Golden digests of `bake()` output at size 256, for every PREWARM recipe that builds without a
 * canvas. Recorded from the tree at the time the parallel prewarm landed and verified against the
 * pre-change tree: **the load-time work must not move a texel.**
 *
 * If one of these fails you changed a recipe or a kernel. That is allowed — but re-record the row
 * *deliberately*, with the A/B that justifies the new look, never as a step in making a test pass.
 * Columns: name, size, albedo, normal, orm, emissive, jointDeltaY, jointDeltaH, slopeScale.
 */
const GOLDEN = [
  ['sandstone_block', 256, '6ecc65358761a8e7', 'e057d8e61f976787', 'd9173bc6a0d3aa91', null, -0.1683, -0.3199, 2.258824],
  ['paving_courtyard', 256, '9b6bd13c54f05702', '2a6f12889110c5cb', '1b783f8635b709db', null, -0.1716, -0.3883, 1.396364],
  ['sand_ripples', 256, 'd05a6ced70981a81', '255d738343b7358b', '0c65eb0f67548376', null, null, null, 0.48],
  ['limestone_polished', 256, '1389ab6d6a402310', '830e8eca1671de33', 'f83d60adc52590c2', null, -0.1641, -0.204, 1.212632],
  ['gold_leaf', 256, 'ab6f9214f8f0ddba', '9b95df9035ac5e2c', 'def2f04be497dd71', null, null, null, 4.266667],
  ['sandstone_worn', 256, '0a3ad830ef92c1b0', '4ba77f39fb3f7551', '17fc3feca2d3f24b', null, -0.1218, -0.3424, 3.555556],
  ['granite_pink', 256, 'ec3224c0a9e10fd0', 'b0d0c2420a63512f', '383f8f62cca3f405', null, null, null, 1.28],
  ['palm_frond', 256, '03b20276e2d737a8', 'c94d63319c7a7419', '202e62359bfdf011', null, null, null, 7.68],
  ['bronze_aged', 256, '7f0b7a2a6a04974f', 'a14a960760cccd90', 'c68cd41bbb9ea2aa', null, null, null, 6.656],
  ['torch_flame', 256, '1ccb4ac5e2789cfb', 'fe4cb75662da6d6f', 'c1b72ff33fd8ece4', '1d0c5f2037ade26a', null, null, 1.024],
  ['sand_fine', 256, '16160405dbc698ce', '3cd1025440a67d2c', 'b5b831e9cb801922', null, null, null, 0.448],
  ['wood_old', 256, '0eedfca462a6abd3', 'f78d2affa60438ef', '13e3fc70d509c0fe', null, null, null, 3.584],
];

test('bake() reproduces the recorded pixels for every canvas-free prewarm recipe', () => {
  assert.ok(GOLDEN.length >= 12, `golden table is empty or truncated (${GOLDEN.length} rows)`);
  let checked = 0;
  for (const [name, size, gA, gN, gO, gE, gdY, gdH, gSlope] of GOLDEN) {
    assert.ok(MATERIALS[name], `golden row names a recipe that no longer exists: ${name}`);
    const p = bake(name, size, 'high');

    // Assert the payload has the shape before trusting a comparison against it (§211.1).
    assert.ok(p.albedo instanceof Uint8Array, `${name}: albedo is not a Uint8Array`);
    assert.ok(p.normal instanceof Uint8Array, `${name}: normal is not a Uint8Array`);
    assert.ok(p.orm?.data instanceof Uint8Array, `${name}: orm.data is not a Uint8Array`);
    assert.equal(p.albedo.length, size * size * 4, `${name}: albedo is the wrong length`);
    assert.equal(p.size, size);

    const dA = digest(p.albedo), dN = digest(p.normal), dO = digest(p.orm.data);
    for (const [what, d] of [['albedo', dA], ['normal', dN], ['orm', dO]]) {
      assert.match(d, /^[0-9a-f]{16}$/, `${name}: ${what} digest is not a 16-hex digest`);
    }
    assert.equal(dA, gA, `${name}: ALBEDO changed`);
    assert.equal(dN, gN, `${name}: NORMAL changed`);
    assert.equal(dO, gO, `${name}: ORM changed`);
    assert.equal(p.emissive ? digest(p.emissive) : null, gE, `${name}: EMISSIVE changed`);

    // The two scalars `Textures._finish` forwards but no byte buffer carries.
    assert.equal(p.joint ? p.joint.dY : null, gdY, `${name}: joint luma delta changed`);
    assert.equal(p.joint ? p.joint.dH : null, gdH, `${name}: joint height delta changed`);
    assert.equal(+p.normalStrength.toFixed(6), gSlope, `${name}: slopeScale changed`);
    checked++;
  }
  assert.equal(checked, GOLDEN.length, 'golden loop inspected fewer recipes than it lists');
});

test('the golden digest can actually fail — it separates two different recipes', () => {
  /* Calibration for the table above. If `digest` collided or `bake` ignored its name, every row
   * would pass for the wrong reason; two recipes that differ must digest differently. */
  const a = bake('sandstone_block', 256, 'high');
  const b = bake('limestone_polished', 256, 'high');
  assert.notEqual(digest(a.albedo), digest(b.albedo));
  assert.notEqual(digest(a.normal), digest(b.normal));
  // …and the same recipe twice must digest the same, or the table is measuring nondeterminism.
  assert.equal(digest(bake('gold_leaf', 256, 'high').albedo), digest(bake('gold_leaf', 256, 'high').albedo));
});

test('the joint-sign invariant holds for every masonry recipe the harness can build', () => {
  /* Mortar is darker and lower than the faces either side of it — light collects on proud
   * surfaces and dirt collects in gaps. `paving_courtyard` once shipped with a positive luma
   * delta and the floor read as "cracked ice". `Bake.jointSign` measures it; nothing asserted it. */
  let checked = 0;
  for (const [name, , , , , , dY, dH] of GOLDEN) {
    if (dY === null) continue;
    assert.ok(dY < 0, `${name}: joint luma delta ${dY} — mortar is brighter than the block faces`);
    assert.ok(dH < 0, `${name}: joint height delta ${dH} — mortar stands proud of the block faces`);
    checked++;
  }
  assert.ok(checked >= 4, `expected at least 4 masonry recipes in the table, inspected ${checked}`);
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
