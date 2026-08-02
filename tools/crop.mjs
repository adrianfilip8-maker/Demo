/**
 * Crop + nearest-neighbour zoom a PNG so a region can be looked at at authored resolution.
 * Pure read/write on files; takes no capture lock and boots nothing.
 *
 *   node tools/crop.mjs <in.png> <out.png> <x> <y> <w> <h> [zoom]
 *
 * ---------------------------------------------------------------------------------------------
 * **The transform this tool does not implement is the viewing scale, and that is where its
 * readers get hurt.** Per KNOWN_ISSUES §11, a probe is the pipeline minus some suffix; the
 * suffix here is the magnification the frame is actually looked at. What comes out at `z` is
 * the source pixels made `z` times larger — not what the eye resolves in the shot.
 *
 * **A described read is only true at the magnification it was taken at. State the zoom with
 * the description, every time.** A texture region in this project was parked in a material note
 * as "vertical erosion runnels", asserted at 4×. Re-read at three zooms off the same ROI of the
 * same PNG, the same pixels are three different objects: at **8×** the vertical trains resolve
 * and the phrase is exactly right; at **4×** — the magnification it was claimed at — they read
 * as speckle plus two course beds and the phrase is wrong; at **2×**, nearest to how the frame
 * is really seen, they read as weathering streaks and chipped course edges. Nothing about the
 * data changed. Asserting a read at a magnification nobody looks at is how a wrong description
 * survives — it is unfalsifiable at the only scale that matters, and the next reader inherits
 * it as fact. If a claim is going to drive a change, take it at a zoom someone will actually
 * view the shot at, and say which. (Worked example and the three reads: the
 * `hieroglyph_wall` note in `src/textures/Materials.js`, commit `1711ca0`.)
 *
 * **And a crop is where *shape* claims get made — "structure, not noise", "a streak field",
 * "a repeat" — which want a known-bad control, not an eyeball.** The cheap one is a null with
 * the same magnitude and no structure: scatter the same pixel count at random over the same ROI
 * and run the identical predicate. In the case above, 89.0% of the flagged pixels sat in
 * connected components of ≥8 px, largest 784, where the scatter null put 0.0% in such
 * components with a largest of 4 — so "structure" was measured rather than asserted. A shuffle
 * or scatter null costs a few lines and catches the failure this repo keeps repeating: a
 * predicate that selects *something* on any input, believed because its output looked plausible.
 * ---------------------------------------------------------------------------------------------
 */
import { readPNG } from './png.mjs';
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, cr]);
}
export function writePNG(file, w, h, rgb) {
  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

if (process.argv[1].endsWith('crop.mjs')) {
  const [inf, outf, X, Y, W, H, Z] = process.argv.slice(2);
  const x0 = +X, y0 = +Y, w = +W, h = +H, z = Z ? +Z : 1;
  const im = readPNG(inf);
  const ow = w * z, oh = h * z;
  const out = Buffer.alloc(ow * oh * 3);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const sx = Math.min(im.w - 1, x0 + Math.floor(x / z));
      const sy = Math.min(im.h - 1, y0 + Math.floor(y / z));
      const si = (sy * im.w + sx) * im.ch, di = (y * ow + x) * 3;
      out[di] = im.data[si]; out[di + 1] = im.data[si + 1]; out[di + 2] = im.data[si + 2];
    }
  }
  writePNG(outf, ow, oh, out);
  console.log(`${outf} ${ow}x${oh} from ${inf} @(${x0},${y0}) ${w}x${h} z${z}`);
}
