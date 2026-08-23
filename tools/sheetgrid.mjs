#!/usr/bin/env node
/**
 * sheetgrid.mjs — lay captured frames out as ONE labelled contact sheet.
 *
 * §479.19's deliverable is a picture the user can point at, so the picture has to say which pose
 * is which without a caption living somewhere else. Frames are box-downscaled by an integer
 * factor (no resampling cleverness — a contact sheet needs honest pixels, and a box filter over
 * an integer factor cannot invent detail), tiled, and captioned with a built-in 5x7 bitmap font
 * so the sheet is self-describing wherever it ends up. Dependency-free: reads with `png.mjs`,
 * writes the same minimal PNG encoder `sbs.mjs` uses.
 *
 *   node tools/sheetgrid.mjs <index.json> <out.png> [cols]
 *
 * index.json: [{ png, label, sub }] — `label` is the clip's real name, `sub` the fine print.
 */
import { readPNG } from './png.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

/* ---- 5x7 bitmap font: each glyph is 5 columns, bit n of a column = row n (top-down) -------- */
const FONT = {
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x49, 0x36], C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x22, 0x1c], E: [0x7f, 0x49, 0x49, 0x49, 0x41], F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x49, 0x49, 0x7a], H: [0x7f, 0x08, 0x08, 0x08, 0x7f], I: [0x00, 0x41, 0x7f, 0x41, 0x00],
  J: [0x20, 0x40, 0x41, 0x3f, 0x01], K: [0x7f, 0x08, 0x14, 0x22, 0x41], L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x0c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f], O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06], Q: [0x3e, 0x41, 0x51, 0x21, 0x5e], R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7f, 0x01, 0x01], U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  V: [0x1f, 0x20, 0x40, 0x20, 0x1f], W: [0x3f, 0x40, 0x38, 0x40, 0x3f], X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
  0: [0x3e, 0x51, 0x49, 0x45, 0x3e], 1: [0x00, 0x42, 0x7f, 0x40, 0x00], 2: [0x42, 0x61, 0x51, 0x49, 0x46],
  3: [0x21, 0x41, 0x45, 0x4b, 0x31], 4: [0x18, 0x14, 0x12, 0x7f, 0x10], 5: [0x27, 0x45, 0x45, 0x45, 0x39],
  6: [0x3c, 0x4a, 0x49, 0x49, 0x30], 7: [0x01, 0x71, 0x09, 0x05, 0x03], 8: [0x36, 0x49, 0x49, 0x49, 0x36],
  9: [0x06, 0x49, 0x49, 0x29, 0x1e],
  ' ': [0, 0, 0, 0, 0], '-': [0x08, 0x08, 0x08, 0x08, 0x08], '.': [0, 0x60, 0x60, 0, 0],
  '/': [0x20, 0x10, 0x08, 0x04, 0x02], ':': [0, 0x36, 0x36, 0, 0], '(': [0, 0x1c, 0x22, 0x41, 0],
  ')': [0, 0x41, 0x22, 0x1c, 0], ',': [0, 0x50, 0x30, 0, 0], '+': [0x08, 0x08, 0x3e, 0x08, 0x08],
  '=': [0x14, 0x14, 0x14, 0x14, 0x14], '<': [0x08, 0x14, 0x22, 0x41, 0], '>': [0, 0x41, 0x22, 0x14, 0x08],
  '*': [0x14, 0x08, 0x3e, 0x08, 0x14], '?': [0x02, 0x01, 0x51, 0x09, 0x06], '#': [0x14, 0x7f, 0x14, 0x7f, 0x14],
};
/** Draw one line of text into an RGB buffer at (x0,y0), integer scale s. */
function text(buf, W, H, x0, y0, str, s, rgb) {
  let x = x0;
  for (const chRaw of String(str).toUpperCase()) {
    const g = FONT[chRaw] || FONT['?'];
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 7; r++) {
        if (!(g[c] & (1 << r))) continue;
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          const px = x + c * s + dx, py = y0 + r * s + dy;
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          const i = (py * W + px) * 3;
          buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2];
        }
      }
    }
    x += 6 * s;
  }
}

/** Integer box downscale of a readPNG result to RGB. */
function shrink(img, f) {
  const w = Math.floor(img.w / f), h = Math.floor(img.h / f), ch = img.ch;
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const i = ((y * f + dy) * img.w + (x * f + dx)) * ch;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2];
        }
      }
      const n = f * f, o = (y * w + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return { w, h, data: out };
}

function writePNG(file, W, H, rgb) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b2) => { let c = 0xFFFFFFFF; for (const v of b2) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (t, d) => { const L = Buffer.alloc(4); L.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const C = Buffer.alloc(4); C.writeUInt32BE(crc(td)); return Buffer.concat([L, td, C]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

const [IDX, OUTF, COLS] = process.argv.slice(2);
if (!IDX || !OUTF) throw new Error('usage: sheetgrid.mjs <index.json> <out.png> [cols]');
const items = JSON.parse(readFileSync(IDX, 'utf8'));
const cols = Number(COLS || 6);
const F = Number(process.env.SHRINK || 2);
const PAD = 6, CAP = 26, S = 1;

const tiles = items.map((it) => ({ ...it, img: shrink(readPNG(it.png), F) }));
const tw = Math.max(...tiles.map((t) => t.img.w)), th = Math.max(...tiles.map((t) => t.img.h));
const rows = Math.ceil(tiles.length / cols);
const W = cols * (tw + PAD) + PAD, H = rows * (th + CAP + PAD) + PAD;
const buf = Buffer.alloc(W * H * 3, 18);

tiles.forEach((t, i) => {
  const cx = (i % cols) * (tw + PAD) + PAD, cy = Math.floor(i / cols) * (th + CAP + PAD) + PAD;
  for (let y = 0; y < t.img.h; y++) {
    for (let x = 0; x < t.img.w; x++) {
      const s = (y * t.img.w + x) * 3, d = ((cy + y) * W + (cx + x)) * 3;
      buf[d] = t.img.data[s]; buf[d + 1] = t.img.data[s + 1]; buf[d + 2] = t.img.data[s + 2];
    }
  }
  text(buf, W, H, cx + 2, cy + t.img.h + 4, t.label, S + 1, [255, 235, 140]);
  if (t.sub) text(buf, W, H, cx + 2, cy + t.img.h + 16, t.sub, S, [190, 200, 215]);
});

writePNG(OUTF, W, H, buf);
console.log(`wrote ${OUTF}  ${W}x${H}  (${tiles.length} tiles, ${cols} cols, shrink ${F}x)`);
