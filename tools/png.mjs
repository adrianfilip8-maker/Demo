/**
 * Dependency-free PNG reader for the offline scorers.
 *
 * Every tool in `tools/` that measures a captured frame comes through here, so the contract is
 * narrow and load-bearing: `{ w, h, ch, data }` with `data` as one byte per sample, row-major,
 * no padding. That contract is unchanged. What follows is what was added and why.
 *
 * ── What it used to do, and the three ways it was silent about not doing it ──────────────────
 *
 * 1. **Colortype 3 (palette) produced a `RangeError` about `Buffer.alloc`.** The channel table
 *    `{0:1,2:3,4:2,6:4}` has no entry for 3, so `ch` was `undefined`, `stride` was `NaN`, and the
 *    failure surfaced 8 lines later as *"The value of `size` is out of range … Received NaN"* —
 *    a message about a buffer, for a file whose actual problem is its colour model. Two of the
 *    images inside `public/assets/sly-cane/sly-cane.glb` are palette PNGs.
 *
 * 2. **Bit depths other than 8 threw `Error('bitdepth')`** — accurate, but it names no depth, no
 *    file and no supported set. `sly-rig.glb`'s 2048² `Sly_Body` albedo is 16-bit RGB and was
 *    unreadable; the two palette images in `sly-cane.glb` are 1- and 2-bit, which is why folding
 *    in a bit-depth-8-only indexed decoder would still not have read either of them.
 *
 * 3. **Adam7 interlacing was ignored rather than rejected, and that one is the dangerous one.**
 *    The IHDR interlace byte was never read, so an interlaced file was unfiltered as though its
 *    seven passes were consecutive scanlines of one image. It did not throw. It returned a
 *    plausible buffer of the right length full of wrong pixels. `public/assets/sly-godot/
 *    sly-head.png` is interlaced: measured against `pngjs`, 66.6% of sampled channels differed,
 *    mean absolute error 66.9/255. A tool that throws is a tool you fix; a tool that quietly
 *    returns garbage is a measurement you publish.
 *
 * ── The rule this change was held to ─────────────────────────────────────────────────────────
 * Several scorers import this module *right now*, so the change is strictly additive for input
 * that already decoded. Every 8-bit non-interlaced colortype 0/2/4/6 image reachable in this repo
 * (124 of them, on disk and embedded in `.glb` bufferViews) was decoded before and after and the
 * md5 of `{w,h,ch}+data` compared: all 124 byte-identical. The only file whose output changed is
 * the interlaced one, which was wrong before and now agrees with `pngjs` exactly.
 *
 * Correctness is cross-checked in `tests/png.test.mjs` against `pngjs` — a separate implementation
 * — on fixtures built here with known pixels, so a shared misunderstanding between the decoder and
 * its test cannot pass.
 *
 * Unsupported input now throws naming the file, the colortype, the bit depth and what is
 * supported. Anything this file cannot decode, it refuses to decode.
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

/** Samples per pixel by colortype. Palette carries ONE sample — the index, not a colour. */
const SAMPLES = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const CT_NAME = { 0: 'greyscale', 2: 'truecolour', 3: 'indexed', 4: 'greyscale+alpha', 6: 'truecolour+alpha' };

/** Adam7 pass geometry: `[xStart, yStart, xStep, yStep]`, in pass order 1..7. */
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/**
 * Reverse the per-scanline filters over `rows` rows of `stride` bytes starting at `raw[off]`.
 *
 * Byte-for-byte the loop this module always had, with two changes that cannot alter its result on
 * the inputs it used to accept: the per-pixel stride is the spec's `bpp` (which equals the old
 * `ch` at bit depth 8, and is the correct value at every other depth), and it returns where it
 * stopped so Adam7's seven passes can be walked out of one inflate stream.
 */
function unfilter(raw, off, rows, bpp, stride) {
  const out = Buffer.alloc(rows * stride);
  let q = off;
  for (let y = 0; y < rows; y++) {
    const f = raw[q++];
    const line = raw.subarray(q, q + stride); q += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
  }
  return { out, end: q };
}

/**
 * Widen `n` packed samples of depth `bd` into one byte each, writing at `dst[at]`.
 *
 * `scale` distinguishes the two things a sub-byte sample can be. A 2-bit *grey* value spans the
 * full range and must be stretched (3 → 255); a 2-bit *palette index* is an address and must be
 * left alone (3 → 3). Getting that backwards is silent — it produces a picture, just the wrong one.
 */
function widen(src, n, bd, dst, at, scale) {
  if (bd === 8) { src.copy(dst, at, 0, n); return; }
  /* Spec 13.12 rescaling — round(v · 255/65535) — not the cheaper "keep the high byte". The two
     disagree by 1 on 10.7% of `sly-rig.glb`'s 2048² albedo, and rounding is the reading that
     agrees exactly with pngjs, which is what makes the cross-check in tests/png.test.mjs a
     byte-equality assertion rather than a tolerance. */
  if (bd === 16) { for (let i = 0; i < n; i++) dst[at + i] = Math.round(((src[i * 2] << 8) | src[i * 2 + 1]) / 257); return; }
  const per = 8 / bd, mask = (1 << bd) - 1, mul = 255 / mask;
  for (let i = 0; i < n; i++) {
    const v = (src[(i / per) | 0] >> (8 - bd - (i % per) * bd)) & mask;
    dst[at + i] = scale ? Math.round(v * mul) : v;
  }
}

export function readPNG(file) {
  const buf = readFileSync(file);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG (bad signature)`);

  let p = 8, w = 0, h = 0, bd = 0, ct = 0, comp = 0, filt = 0, ilace = 0;
  let plte = null, trns = null, sawIHDR = false;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      sawIHDR = true;
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      bd = body[8]; ct = body[9]; comp = body[10]; filt = body[11]; ilace = body[12];
    } else if (type === 'PLTE') plte = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }

  /* Refuse clearly. Every branch here used to be either `Error('bitdepth')`, a NaN-sized
     Buffer.alloc, or — for interlace — nothing at all. */
  const spp = SAMPLES[ct];
  if (!sawIHDR) throw new Error(`${file}: no IHDR chunk`);
  if (spp === undefined) throw new Error(`${file}: colortype ${ct} is not a PNG colortype (0,2,3,4,6)`);
  if (![1, 2, 4, 8, 16].includes(bd)) throw new Error(`${file}: bit depth ${bd} is not a PNG bit depth (1,2,4,8,16)`);
  if (bd < 8 && ct !== 0 && ct !== 3) throw new Error(`${file}: bit depth ${bd} is illegal for colortype ${ct} (${CT_NAME[ct]})`);
  if (bd === 16 && ct === 3) throw new Error(`${file}: bit depth 16 is illegal for an indexed PNG`);
  if (comp !== 0) throw new Error(`${file}: compression method ${comp} unsupported (only 0, deflate)`);
  if (filt !== 0) throw new Error(`${file}: filter method ${filt} unsupported (only 0)`);
  if (ilace > 1) throw new Error(`${file}: interlace method ${ilace} unknown (0 none, 1 Adam7)`);
  if (ct === 3 && !plte) throw new Error(`${file}: indexed PNG with no PLTE chunk`);
  if (!idat.length) throw new Error(`${file}: no IDAT chunk`);
  if (!w || !h) throw new Error(`${file}: zero-sized image ${w}x${h}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  /* A palette index must survive widening unscaled; a short grey sample must be stretched. */
  const scale = ct === 0 || ct === 4;
  const bpp = Math.max(1, (spp * bd) >> 3);

  /** One byte per sample, `spp` samples per pixel, before the colour model is applied. */
  let samples;
  if (!ilace) {
    const stride = ((w * spp * bd) + 7) >> 3;
    const { out } = unfilter(raw, 0, h, bpp, stride);
    if (bd === 8) samples = out;                 // the pre-existing path, untouched and unwidened
    else {
      samples = Buffer.alloc(w * h * spp);
      for (let y = 0; y < h; y++) widen(out.subarray(y * stride, (y + 1) * stride), w * spp, bd, samples, y * w * spp, scale);
    }
  } else {
    samples = Buffer.alloc(w * h * spp);
    let off = 0;
    for (const [x0, y0, dx, dy] of ADAM7) {
      const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
      if (pw <= 0 || ph <= 0) continue;          // a pass can be empty on a small image
      const stride = ((pw * spp * bd) + 7) >> 3;
      const { out, end } = unfilter(raw, off, ph, bpp, stride);
      off = end;
      const row = Buffer.alloc(pw * spp);
      for (let y = 0; y < ph; y++) {
        widen(out.subarray(y * stride, (y + 1) * stride), pw * spp, bd, row, 0, scale);
        for (let x = 0; x < pw; x++) {
          const d = ((y0 + y * dy) * w + (x0 + x * dx)) * spp;
          for (let s = 0; s < spp; s++) samples[d + s] = row[x * spp + s];
        }
      }
    }
  }

  if (ct !== 3) return { w, h, ch: spp, data: samples, bd, ct, interlace: ilace };

  /* Indexed: resolve through PLTE, and through tRNS when the palette carries alpha. */
  const nPal = plte.length / 3;
  const ch = trns ? 4 : 3;
  const data = Buffer.alloc(w * h * ch);
  for (let i = 0; i < w * h; i++) {
    const e = samples[i];
    if (e >= nPal) throw new Error(`${file}: palette index ${e} at pixel ${i} exceeds the ${nPal}-entry PLTE`);
    const k = e * 3, o = i * ch;
    data[o] = plte[k]; data[o + 1] = plte[k + 1]; data[o + 2] = plte[k + 2];
    if (trns) data[o + 3] = e < trns.length ? trns[e] : 255;   // tRNS may be short; the rest are opaque
  }
  return { w, h, ch, data, bd, ct, interlace: ilace, idx: samples, plte, nPal, trns };
}

/**
 * RGB triple at `(x, y)`.
 *
 * Greyscale images return their single sample broadcast to three, which is what every caller here
 * means by "the colour there". It used to read the next two *pixels* as green and blue.
 */
export const px = (im, x, y) => {
  const i = (y * im.w + x) * im.ch;
  if (im.ch >= 3) return [im.data[i], im.data[i + 1], im.data[i + 2]];
  const v = im.data[i];
  return [v, v, v];
};
