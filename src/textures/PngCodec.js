/**
 * PngCodec — parse and unfilter a PNG without ever touching a canvas.
 *
 * ── Why this file exists, which is the whole reason the baked-texture cache is safe ──────────
 *
 * The obvious way to load a baked texture is `createImageBitmap` → `drawImage` → `getImageData`.
 * **It is lossy, and it is lossy in a way that would have shipped a look regression.** Measured on
 * this project's own maps, encoded and decoded on the capture container's Chromium:
 *
 *   sandstone_block albedo/normal/orm   exact
 *   gold_leaf       albedo/normal/orm   exact
 *   palm_frond      albedo         820 of 262,144 bytes wrong, max ±7 per channel
 *   torch_flame     albedo     150,607 of 262,144 bytes wrong, **max ±184 on red**
 *
 * The pattern is exact: **every map that carries alpha comes back wrong, and only in RGB.** A 2D
 * canvas stores premultiplied colour, so a texel at low alpha keeps only a few bits of chroma, and
 * un-premultiplying on readback cannot invent them back. `torch_flame` is a bright flame under a
 * soft alpha ramp — the worst case there is — and 184/255 on red is not a rounding artefact, it is
 * a different colour. `createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion:
 * 'none' })` **does not fix it**: measured byte-for-byte identical to the default path. Those hints
 * govern how the bitmap is handed over, not how the canvas stores what is drawn into it. An `<img>`
 * element is the same story.
 *
 * So the decode never goes near a canvas. PNG's image data is plain zlib, and every browser this
 * project targets ships a native inflate as `DecompressionStream('deflate')`; unfiltering is
 * integer arithmetic straight out of the spec. Both halves are exactly invertible, which makes the
 * whole path **byte-exact by construction** rather than by measurement — though it is measured
 * anyway, on all 70 committed buffers, by `tests/textures.test.mjs`.
 *
 * ── The contract with the baker ──────────────────────────────────────────────────────────────
 *
 * `bakeassets.mjs` writes only 8-bit, colour-type 6 (RGBA), non-interlaced PNGs, and this decoder
 * rejects anything else rather than guessing. That is deliberate: a decoder that silently coped
 * with a 16-bit or palettised file would be a decoder that could return the wrong pixels for a
 * file this project did not write. The asserts are the format contract.
 *
 * `inflate` is injected rather than imported because the two hosts differ — the browser has
 * `DecompressionStream`, Node has `zlib.inflateSync` — and importing `node:zlib` here would put a
 * Node builtin in the browser bundle. The *unfiltering*, which is the part that could be wrong, is
 * one implementation used by both.
 */

/** Big-endian u32 read; PNG is network byte order throughout. */
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Split a PNG into its header fields and the concatenated zlib stream.
 * @param {Uint8Array} buf
 * @returns {{width:number, height:number, zlib:Uint8Array}}
 */
export function parsePng(buf) {
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error('not a PNG (bad signature)');
  }
  let o = 8, width = 0, height = 0, depth = 0, ctype = -1, interlace = 0, seenIHDR = false;
  const idat = [];
  while (o + 8 <= buf.length) {
    const len = u32(buf, o);
    const type = String.fromCharCode(buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7]);
    const body = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = u32(buf, o + 8); height = u32(buf, o + 12);
      depth = buf[o + 16]; ctype = buf[o + 17]; interlace = buf[o + 20];
      seenIHDR = true;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    o += 12 + len;                       // length + type + data + CRC
  }
  if (!seenIHDR) throw new Error('PNG has no IHDR');
  // The format contract, asserted rather than coped with — see the header.
  if (depth !== 8) throw new Error(`PNG bit depth ${depth}, expected 8`);
  if (ctype !== 6) throw new Error(`PNG colour type ${ctype}, expected 6 (RGBA)`);
  if (interlace !== 0) throw new Error('PNG is interlaced, expected non-interlaced');
  if (!idat.length) throw new Error('PNG has no IDAT');
  if (!width || width !== height) throw new Error(`PNG is ${width}x${height}, expected square`);

  let total = 0;
  for (const c of idat) total += c.length;
  const zlib = new Uint8Array(total);
  let p = 0;
  for (const c of idat) { zlib.set(c, p); p += c.length; }
  return { width, height, zlib };
}

/**
 * Undo PNG per-scanline filtering, in place of the caller's inflated buffer.
 *
 * `raw` is `height * (1 + width * 4)` bytes: one filter-type byte then one filtered scanline,
 * repeated. All five filter types are exact integer operations over bytes, so this reproduces the
 * encoder's input exactly — there is no rounding anywhere to lose.
 *
 * @param {Uint8Array} raw inflated PNG image data
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} RGBA, `width * height * 4`
 */
export function unfilter(raw, width, height) {
  const bpp = 4, stride = width * bpp;
  const need = height * (stride + 1);
  if (raw.length < need) throw new Error(`PNG data short: ${raw.length} bytes, need ${need}`);
  const out = new Uint8Array(width * height * bpp);
  let ri = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[ri++];
    const row = y * stride, prev = row - stride;
    if (ft === 0) {
      // None — the common case when the baker forces filter 0, and a straight copy.
      out.set(raw.subarray(ri, ri + stride), row);
      ri += stride;
      continue;
    }
    for (let x = 0; x < stride; x++) {
      const rv = raw[ri++];
      const a = x >= bpp ? out[row + x - bpp] : 0;         // Left
      const b = y > 0 ? out[prev + x] : 0;                 // Up
      let v;
      if (ft === 1) v = rv + a;
      else if (ft === 2) v = rv + b;
      else if (ft === 3) v = rv + ((a + b) >> 1);
      else if (ft === 4) {
        const c = (x >= bpp && y > 0) ? out[prev + x - bpp] : 0;   // Up-left
        const pp = a + b - c;
        const pa = pp > a ? pp - a : a - pp;
        const pb = pp > b ? pp - b : b - pp;
        const pc = pp > c ? pp - c : c - pp;
        v = rv + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`unknown PNG filter type ${ft} on row ${y}`);
      out[row + x] = v & 255;
    }
  }
  return out;
}

/**
 * Decode a whole PNG to RGBA. `inflate` takes the zlib stream and returns the inflated bytes,
 * sync or async; see the header for why it is a parameter.
 *
 * @param {Uint8Array} buf
 * @param {(z:Uint8Array)=>Uint8Array|Promise<Uint8Array>} inflate
 * @returns {Promise<{data:Uint8Array, size:number}>}
 */
export async function decodePng(buf, inflate) {
  const { width, height, zlib } = parsePng(buf);
  const raw = await inflate(zlib);
  return { data: unfilter(raw, width, height), size: width };
}

/** The browser's native inflate. `deflate` is the zlib-wrapped format PNG's IDAT actually uses. */
export async function inflateNative(zlib) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([zlib]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** True when this host can decode a baked asset at all. */
export const canDecode = () => typeof DecompressionStream !== 'undefined';
