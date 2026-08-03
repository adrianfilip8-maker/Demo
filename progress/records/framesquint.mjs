#!/usr/bin/env node
/**
 * framesquint — §7.3's squint test on a rendered frame: box-downsample by `div`, then
 * nearest-neighbour re-enlarge by `zoom` so the result can be looked at.
 *
 * SCOPE — the suffix NOT implemented (KNOWN_ISSUES §11): this is a box filter on delivered
 * display-space codes, not a perceptual model and not the renderer's mip chain. It answers "do
 * the masses stay clean and readable when the detail is averaged away", which is the §7.3
 * condition; it says nothing about what the eye resolves at a given viewing distance.
 *
 * **State the div AND the zoom with any description of what you see** — `tools/crop.mjs`'s header
 * records the same region reading as three different objects at three magnifications.
 *
 *   node framesquint.mjs <in.png> <out.png> [div=8] [zoom=8]
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import fs from 'node:fs';
import zlib from 'node:zlib';

const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const [inp, outp, divS = '8', zoomS = '8'] = process.argv.slice(2);
const D = parseInt(divS, 10), Z = parseInt(zoomS, 10);
const im = readPNG(inp);
const w = Math.floor(im.w / D), h = Math.floor(im.h / D);
const small = new Uint8Array(w * h * 3);
for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
  let r = 0, g = 0, b = 0;
  for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
    const o = ((v * D + j) * im.w + u * D + i) * im.ch;
    r += im.data[o]; g += im.data[o + 1]; b += im.data[o + 2];
  }
  const n = D * D, k = (v * w + u) * 3;
  small[k] = Math.round(r / n); small[k + 1] = Math.round(g / n); small[k + 2] = Math.round(b / n);
}
const W2 = w * Z, H2 = h * Z, big = new Uint8Array(W2 * H2 * 3);
for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
  const s = (((y / Z) | 0) * w + ((x / Z) | 0)) * 3, d = (y * W2 + x) * 3;
  big[d] = small[s]; big[d + 1] = small[s + 1]; big[d + 2] = small[s + 2];
}
writePNG(outp, W2, H2, big);
console.log(`${outp}  ${im.w}x${im.h} -> squint 1/${D} (${w}x${h}) -> shown at ${Z}x (${W2}x${H2})`);
