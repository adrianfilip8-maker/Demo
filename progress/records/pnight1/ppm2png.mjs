/* ppm2png — P6 binary PPM to PNG. Writer lifted from tools/crop.mjs so the encoder is the
   project's own and not a third one. usage: node ppm2png.mjs in.ppm out.png [downscale] */
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const cb = Buffer.alloc(4); cb.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cb]); };
function writePNG(file, w, h, rgb) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const [inF, outF, dsArg] = process.argv.slice(2);
const buf = readFileSync(inF);
let p = 0, tok = [];
while (tok.length < 4) { while (buf[p] === 32 || buf[p] === 10 || buf[p] === 13 || buf[p] === 9) p++; let s = p; while (p < buf.length && ![32, 10, 13, 9].includes(buf[p])) p++; tok.push(buf.toString('ascii', s, p)); }
p++;
const W = +tok[1], H = +tok[2];
const src = buf.subarray(p, p + W * H * 3);
const ds = Math.max(1, +(dsArg || 1));
if (ds === 1) { writePNG(outF, W, H, Buffer.from(src)); console.log(`${outF} ${W}x${H}`); }
else {
  const w = Math.floor(W / ds), h = Math.floor(H / ds), o = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    /* MAX not mean over the box: this downscale is used on sparse overlays, and averaging a
       1-px-wide magenta line into a 3x3 box makes a real population invisible. */
    let R = 0, G = 0, B = 0;
    for (let j = 0; j < ds; j++) for (let i = 0; i < ds; i++) { const k = ((y * ds + j) * W + (x * ds + i)) * 3; if (src[k] > R) R = src[k]; if (src[k + 1] > G) G = src[k + 1]; if (src[k + 2] > B) B = src[k + 2]; }
    const k = (y * w + x) * 3; o[k] = R; o[k + 1] = G; o[k + 2] = B;
  }
  writePNG(outF, w, h, o); console.log(`${outF} ${w}x${h} (max-pooled /${ds})`);
}
