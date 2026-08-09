import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';
import { readPNG, px } from '../tools/png.mjs';

/**
 * `tools/png.mjs` is the eye every offline scorer measures through, and it had three defects that
 * a test could have caught and no test existed to catch.
 *
 *   1. **Colortype 3 (palette) threw a `RangeError` about `Buffer.alloc`.** The channel table had
 *      no entry for 3, so `ch` was `undefined` and `stride` was `NaN`. The message named a buffer
 *      size; the problem was a colour model. Two images inside `sly-cane.glb` are palette PNGs.
 *   2. **Every bit depth but 8 threw `Error('bitdepth')`** — a message with no depth, no file and
 *      no supported set in it. Those two palette images are 1- and 2-bit, so an indexed decoder
 *      that only handled depth 8 would still not have read either of them.
 *   3. **Adam7 interlacing was not rejected, it was ignored — and that is the one that mattered.**
 *      The interlace byte was never read, so an interlaced file was unfiltered as if its seven
 *      passes were consecutive scanlines. No throw. A buffer of exactly the right length, full of
 *      wrong pixels. `public/assets/sly-godot/sly-head.png` is interlaced, and against `pngjs`
 *      66.6% of its sampled channels were wrong by a mean of 66.9/255.
 *
 * Defect 3 is the reason this file exists rather than a handful of "does not throw" assertions.
 * A decoder that throws is a decoder somebody fixes. A decoder that returns a plausible wrong
 * answer is a *published measurement*, and nothing downstream can tell.
 *
 * ── Why every check here is against `pngjs` as well as against ground truth ─────────────────────
 * The fixtures below are built in this file, so the encoder and the decoder are written by the
 * same hand on the same day out of the same reading of the spec. A test like that passes happily
 * when both sides share a misunderstanding — the interlaced-scatter order, the sub-byte bit order,
 * the 16→8 reduction rule are all places where a self-consistent wrong pair is easy to write.
 * `pngjs` is a devDependency already in the tree and an entirely separate implementation, so each
 * fixture is asserted THREE ways: the decoder matches the pixels the fixture was built from, the
 * decoder matches `pngjs`, and `pngjs` matches the pixels. The third is what proves the encoder is
 * not lying, and it is the assertion that fails first if the fixture itself is wrong.
 */

/* ────────────────────────────── a PNG encoder, for fixtures ────────────────────────────────── */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

const SPP = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Pack one row of samples to the scanline bit layout: MSB first, rows byte-aligned. */
function packRow(row, bd) {
  if (bd === 16) { const b = Buffer.alloc(row.length * 2); row.forEach((v, i) => b.writeUInt16BE(v, i * 2)); return b; }
  if (bd === 8) return Buffer.from(row);
  const per = 8 / bd, out = Buffer.alloc(Math.ceil(row.length / per));
  row.forEach((v, i) => { out[(i / per) | 0] |= (v & ((1 << bd) - 1)) << (8 - bd - (i % per) * bd); });
  return out;
}

/** Forward filter — the exact inverse of what the decoder undoes, so all five types get exercised. */
function filterRow(cur, prev, bpp, type) {
  const out = Buffer.alloc(cur.length);
  for (let i = 0; i < cur.length; i++) {
    const a = i >= bpp ? cur[i - bpp] : 0, b = prev ? prev[i] : 0, c = prev && i >= bpp ? prev[i - bpp] : 0;
    let v = cur[i];
    if (type === 1) v -= a; else if (type === 2) v -= b; else if (type === 3) v -= (a + b) >> 1;
    else if (type === 4) {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      v -= (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
    }
    out[i] = v & 255;
  }
  return out;
}

const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/**
 * Encode `samples` (flat, `w*h*spp` raw sample VALUES, not bytes) as a PNG.
 * Rotates the row filter through all five types so no filter branch goes untested.
 */
function encodePNG({ w, h, bd, ct, samples, plte, trns, interlace = 0 }) {
  const spp = SPP[ct], bpp = Math.max(1, (spp * bd) >> 3);
  const parts = [];
  const emitPass = (x0, y0, dx, dy) => {
    const pw = x0 === null ? w : Math.ceil((w - x0) / dx);
    const ph = x0 === null ? h : Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) return;
    let prev = null;
    for (let y = 0; y < ph; y++) {
      const row = [];
      for (let x = 0; x < pw; x++) {
        const sx = x0 === null ? x : x0 + x * dx, sy = x0 === null ? y : y0 + y * dy;
        for (let s = 0; s < spp; s++) row.push(samples[(sy * w + sx) * spp + s]);
      }
      const packed = packRow(row, bd);
      const type = (y + parts.length) % 5;
      parts.push(Buffer.from([type]), filterRow(packed, prev, bpp, type));
      prev = packed;
    }
  };
  if (interlace) for (const [x0, y0, dx, dy] of ADAM7) emitPass(x0, y0, dx, dy);
  else emitPass(null, 0, 1, 1);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = bd; ihdr[9] = ct; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = interlace;
  const out = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  if (plte) out.push(chunk('PLTE', Buffer.from(plte)));
  if (trns) out.push(chunk('tRNS', Buffer.from(trns)));
  out.push(chunk('IDAT', zlib.deflateSync(Buffer.concat(parts))), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(out);
}

const DIR = mkdtempSync(join(tmpdir(), 'pngtest-'));
let seq = 0;
const writeFixture = (bytes) => { const f = join(DIR, `f${seq++}.png`); writeFileSync(f, bytes); return f; };

/* ─────────────────────────────────── the fixture matrix ────────────────────────────────────── */

/** Deterministic, non-uniform, and never accidentally symmetric under a transposed scatter. */
const pattern = (i, mod) => (i * 37 + ((i / 5) | 0) * 11) % mod;

/**
 * Expected 8-bit RGB for a fixture, derived from the same sample values the encoder was handed.
 * Sub-byte and 16-bit samples are rescaled by PNG 13.12 — `round(v · 255 / max)` — which is also
 * what `pngjs` does, which is why all three ways of checking can be exact equality.
 */
function expectRGB({ w, h, bd, ct, samples, plte }) {
  const spp = SPP[ct], max = (1 << bd) - 1, out = [];
  for (let i = 0; i < w * h; i++) {
    const s = (k) => samples[i * spp + k];
    if (ct === 3) { const k = s(0) * 3; out.push([plte[k], plte[k + 1], plte[k + 2]]); continue; }
    const g = (v) => (bd === 8 ? v : Math.round(v * 255 / max));
    if (ct === 0 || ct === 4) { const v = g(s(0)); out.push([v, v, v]); }
    else out.push([g(s(0)), g(s(1)), g(s(2))]);
  }
  return out;
}

const CASES = [];
for (const [ct, name] of [[0, 'grey'], [2, 'rgb'], [3, 'indexed'], [4, 'grey+a'], [6, 'rgba']]) {
  const depths = ct === 3 ? [1, 2, 4, 8] : ct === 0 ? [1, 2, 4, 8, 16] : [8, 16];
  for (const bd of depths) {
    for (const interlace of [0, 1]) {
      const w = 23, h = 13, spp = SPP[ct], max = (1 << bd) - 1;
      /* An indexed fixture's palette must cover every index the pattern can produce. */
      const nPal = ct === 3 ? max + 1 : 0;
      const plte = ct === 3 ? Array.from({ length: nPal * 3 }, (_, i) => (i * 53 + 7) % 256) : null;
      const samples = new Array(w * h * spp);
      for (let i = 0; i < w * h * spp; i++) samples[i] = ct === 3 ? pattern(i, nPal) : pattern(i, max + 1);
      CASES.push({ label: `${name} bd=${bd} ${interlace ? 'adam7' : 'plain'}`, w, h, bd, ct, samples, plte, interlace });
    }
  }
}

test('png: every colortype × bit depth × interlace agrees with pngjs AND with its own ground truth', () => {
  /* §211.1 — assert the subject exists before asserting things about it. A matrix that silently
     built zero cases would pass every loop below having inspected nothing. */
  /* 10 greyscale (bd 1,2,4,8,16 × plain/adam7) + 4 rgb + 8 indexed (bd 1,2,4,8 × 2)
     + 4 greyscale+alpha + 4 rgba = 30. */
  assert.equal(CASES.length, 30, `fixture matrix collapsed to ${CASES.length} cases`);
  let checked = 0;
  for (const c of CASES) {
    const file = writeFixture(encodePNG(c));
    const mine = readPNG(file);
    const ref = PNG.sync.read(readFileSync(file));
    const want = expectRGB(c);

    assert.equal(mine.w, c.w, `${c.label}: width`);
    assert.equal(mine.h, c.h, `${c.label}: height`);
    assert.equal(ref.width, c.w, `${c.label}: pngjs disagrees about width — the FIXTURE is malformed`);

    for (let i = 0; i < c.w * c.h; i++) {
      const y = (i / c.w) | 0, x = i % c.w;
      const got = px(mine, x, y);
      const rgb = [ref.data[i * 4], ref.data[i * 4 + 1], ref.data[i * 4 + 2]];
      assert.deepEqual(rgb, want[i], `${c.label}: pngjs disagrees with the fixture's own pixels at (${x},${y}) — the ENCODER is wrong, not the decoder`);
      assert.deepEqual(got, want[i], `${c.label}: readPNG returned [${got}] at (${x},${y}), fixture says [${want[i]}]`);
      checked++;
    }
  }
  assert.equal(checked, CASES.reduce((a, c) => a + c.w * c.h, 0), 'pixel comparisons did not run over every case');
});

test('png: indexed transparency comes through tRNS, and a short tRNS leaves the rest opaque', () => {
  const w = 8, h = 4, nPal = 4;
  const plte = [255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9];
  const trns = [0, 128];                                   // deliberately shorter than the palette
  const samples = Array.from({ length: w * h }, (_, i) => i % nPal);
  const im = readPNG(writeFixture(encodePNG({ w, h, bd: 8, ct: 3, samples, plte, trns })));
  assert.equal(im.ch, 4, 'a palette with tRNS must decode to RGBA, not silently drop the alpha');
  assert.equal(im.nPal, nPal);
  const alphaOf = (i) => im.data[i * 4 + 3];
  assert.equal(alphaOf(0), 0, 'palette entry 0 is fully transparent in tRNS');
  assert.equal(alphaOf(1), 128, 'palette entry 1 is half transparent in tRNS');
  assert.equal(alphaOf(2), 255, 'palette entry 2 is past the end of tRNS and must read opaque');
  assert.deepEqual([...im.data.subarray(0, 3)], [255, 0, 0], 'the colour still resolves through PLTE');
  /* And without tRNS the same image is RGB — no phantom alpha channel appears. */
  const noAlpha = readPNG(writeFixture(encodePNG({ w, h, bd: 8, ct: 3, samples, plte })));
  assert.equal(noAlpha.ch, 3);
});

test('png: a palette index is an address, not a brightness', () => {
  /* The single easiest way to write a wrong indexed decoder is to rescale the index the way a
     sub-byte GREY sample must be rescaled. At bd=2 that turns index 3 into index 255 — out of
     range of a 4-entry palette — or, in a forgiving decoder, into a picture of the wrong colours.
     This asserts the two are handled differently by decoding the same bytes under both models. */
  const w = 4, h = 1;
  const samples = [0, 1, 2, 3];
  const plte = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
  const idx = readPNG(writeFixture(encodePNG({ w, h, bd: 2, ct: 3, samples, plte })));
  assert.deepEqual([...idx.idx], [0, 1, 2, 3], 'indices must be widened WITHOUT rescaling');
  assert.deepEqual([...idx.data], plte, 'each index must resolve to its own palette entry');

  const grey = readPNG(writeFixture(encodePNG({ w, h, bd: 2, ct: 0, samples })));
  assert.deepEqual([...grey.data], [0, 85, 170, 255], 'a 2-bit GREY sample must be stretched to 0..255');
});

test('png: unsupported input is refused by name, not by NaN', () => {
  const bad = (bytes, ...needles) => {
    let err = null;
    try { readPNG(writeFixture(bytes)); } catch (e) { err = e; }
    assert.ok(err, `expected a throw for ${needles[0]}`);
    assert.ok(!/RangeError/.test(err.constructor.name),
      `refusal surfaced as ${err.constructor.name}: ${err.message} — that is the Buffer.alloc(NaN) failure again`);
    for (const n of needles) assert.match(err.message, n);
  };

  /* Colortype 5 does not exist. Before, `SAMPLES[5]` was undefined and the failure arrived eight
     lines later as "The value of size is out of range … Received NaN". */
  const ct5 = encodePNG({ w: 2, h: 2, bd: 8, ct: 2, samples: new Array(12).fill(0) });
  ct5[25] = 5; assert.equal(ct5[25], 5);
  bad(ct5, /colortype 5/);

  const bd3 = encodePNG({ w: 2, h: 2, bd: 8, ct: 2, samples: new Array(12).fill(0) });
  bd3[24] = 3;
  bad(bd3, /bit depth 3/);

  const rgb4 = encodePNG({ w: 2, h: 2, bd: 8, ct: 2, samples: new Array(12).fill(0) });
  rgb4[24] = 4;
  bad(rgb4, /bit depth 4/, /illegal/);

  /* An indexed image with the PLTE chunk stripped out. */
  const withPal = encodePNG({ w: 2, h: 2, bd: 8, ct: 3, samples: [0, 1, 0, 1], plte: [1, 2, 3, 4, 5, 6] });
  const at = withPal.indexOf(Buffer.from('PLTE', 'ascii'));
  assert.ok(at > 0, 'fixture has no PLTE to strip');
  const noPal = Buffer.concat([withPal.subarray(0, at - 4), withPal.subarray(at - 4 + 12 + 6)]);
  bad(noPal, /no PLTE/);

  /* Interlace method 2 is not Adam7 and is not "no interlacing" either. Silently treating an
     unknown method as 0 is exactly how method 1 came to be mis-decoded for as long as it was. */
  const il2 = encodePNG({ w: 4, h: 4, bd: 8, ct: 2, samples: new Array(48).fill(7) });
  il2[28] = 2;
  bad(il2, /interlace method 2/);

  bad(Buffer.from('this is not a png at all, not even close'), /not a PNG/);
});

test('png: the file that used to decode to garbage — every PNG in the tree, checked against pngjs', () => {
  /* A census rather than a fixture, because the defect that mattered was found in a shipped asset
     and not in anything anyone thought to construct. Every PNG the working tree contains must
     decode, and every one whose form is outside the plain 8-bit case — interlaced, sub-byte,
     16-bit, or palette, i.e. exactly the forms this decoder used to get wrong or refuse — is
     compared to `pngjs` pixel for pixel.
     Deliberately a WALK, not a list of paths: assets move between directories in this repo, and a
     census pinned to paths stops being a census the first time one does. */
  const roots = ['public', 'src', 'tests', 'staging'].map((d) => new URL(`../${d}/`, import.meta.url).pathname);
  const found = [];
  const walk = (dir) => {
    let entries; try { entries = readdirSync(dir); } catch { return; }
    for (const n of entries) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.toLowerCase().endsWith('.png')) found.push(p);
    }
  };
  roots.forEach(walk);
  assert.ok(found.length > 20, `only ${found.length} PNGs walked — the census inspected nothing`);

  const forms = new Map();
  let crossChecked = 0;
  for (const f of found) {
    const head = readFileSync(f).subarray(0, 33);
    const bd = head[24], ct = head[25], il = head[28];
    const key = `ct${ct} bd${bd} il${il}`;
    forms.set(key, (forms.get(key) || 0) + 1);

    const im = readPNG(f);                     // must not throw: every form present must be readable
    assert.equal(im.bd, bd); assert.equal(im.ct, ct); assert.equal(im.interlace, il);

    if (bd === 8 && il === 0 && ct !== 3) continue;   // the plain case, already exact by construction
    const ref = PNG.sync.read(readFileSync(f));
    let diff = 0;
    for (let i = 0; i < ref.width * ref.height; i++) {
      for (let c = 0; c < 3; c++) if (ref.data[i * 4 + c] !== im.data[i * im.ch + c]) diff++;
    }
    assert.equal(diff, 0, `${f} (${key}): ${diff} of ${ref.width * ref.height * 3} RGB samples disagree with pngjs`);
    crossChecked++;
  }
  /* Not an assertion that any particular file exists — an assertion that every non-plain form the
     tree DOES contain was actually compared, so the loop above cannot pass by skipping everything. */
  const nonPlain = [...forms].filter(([k]) => !/^ct[0246] bd8 il0$/.test(k));
  assert.equal(crossChecked, nonPlain.reduce((a, [, n]) => a + n, 0),
    `the cross-check skipped a non-plain form it should have compared: ${JSON.stringify(nonPlain)}`);
});
