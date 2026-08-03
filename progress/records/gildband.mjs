/**
 * gildband — `tools/wallstrip.mjs`'s render, restricted to the tile-V WINDOW a band consumer
 * actually samples.
 *
 * `wallstrip` renders the whole tile at a framing's px/repeat, which is the right instrument for
 * a wall and the wrong one for `hieroglyph_gilded`: `gilduv.mjs` measures 78–95 % of that
 * recipe's on-screen pixels inside |V| < 0.25 of the seam, so a full-tile render spends most of
 * its height on a mid-tile frieze that is 5–11 px in the frame, and shows the seam row — the part
 * eleven of twelve consumers are made of — as a sliver at the edges. Same instrument, correct
 * window.
 *
 * Calibration, per §13's rule (a tiling number without a known-bad beside it is not evidence):
 * this shares `wallstrip`'s render path, which is the one instrument that separated the
 * `cartouche: true` known-bad when twenty-eight scalars could not. `--stamp` reproduces that
 * calibration directly here — it paints a synthetic once-per-repeat disc of a given tile size
 * into the strip *after* sampling, so the same run can show what a countable landmark of that
 * size looks like at that px/repeat next to the shipped state. It is a drawing on the output
 * image, not a texture change: nothing in `src/` moves.
 *
 * SCOPE — the transforms between this and what the renderer draws (KNOWN_ISSUES §11):
 *   - Albedo only. No lighting, no shadow, no normal map, no AO, no tonemap, no grade. The
 *     gilded band is 98.6 % shadowed in `hero`; this render cannot know that.
 *   - Box filter, not the GPU's mip chain plus anisotropic filter. A mark near the resolution
 *     limit will be slightly crisper here than in frame.
 *   - Flat, head-on, undistorted. Real architraves run away from the camera, so the true image is
 *     foreshortened along U and the repeat pitch varies across the run.
 *
 *   node progress/records/gildband.mjs <recipe> <out.png> [--rep 277] [--nu 5]
 *        [--vc 0] [--vh 0.0664] [--size 1024] [--squint out.png] [--stamp 0.064]
 *
 * `--vc`/`--vh` are the V window centre and half-height in TILE fractions (default: the seam row
 * `glyphArchitrave` draws, band = signM / worldTile = 0.85 / 6.4). `--rep` is px per U repeat at
 * the framing (`gilduv.mjs` measures it: courtyard 277, night 175, hero 481, temple 157).
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = '/home/user/Demo';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };

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
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const [recipeName, outPng] = process.argv.slice(2);
if (!recipeName || !outPng) { console.error('usage: gildband.mjs <recipe> <out.png> [--rep px] [--nu n] [--vc v] [--vh v]'); process.exit(1); }
const REP = parseFloat(opt('rep', '277'));
const NU = parseFloat(opt('nu', '5'));
const VC = parseFloat(opt('vc', '0'));
const VH = parseFloat(opt('vh', '0.0664'));
const SIZE = parseInt(opt('size', '1024'), 10);
const SQUINT = opt('squint', null);
const STAMP = opt('stamp', null) === null ? 0 : parseFloat(opt('stamp', '0'));

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 18700 + (process.pid % 200);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const got = await page.evaluate(async ({ recipeName, SIZE }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const recipe = M.MATERIALS[recipeName];
  if (!recipe) return { error: 'no recipe ' + recipeName };
  const sz = recipe.tier >= 1 ? Math.max(256, SIZE >> 1) : SIZE;   // Textures.js:195
  const s = new C.Surface(sz, (recipe.seed ?? hashName(recipeName)) >>> 0);
  recipe.build(s, { seed: s.seed, size: sz, name: recipeName, quality: 'high' });
  return {
    sz, r: Array.from(s.r), g: Array.from(s.g), b: Array.from(s.b),
    h: Array.from(s.h), occ: Array.from(s.occ),
    bump: recipe.bump ?? 0.05, tileU: Array.isArray(recipe.tile) ? recipe.tile[0] : recipe.tile,
  };
}, { recipeName, SIZE });
await browser.close(); server.close();
if (got.error) { console.error(got.error); process.exit(1); }

const sz = got.sz;
let R = Float64Array.from(got.r), G = Float64Array.from(got.g), B = Float64Array.from(got.b);
const enc = (v) => Math.max(0, Math.min(255, Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))));

/**
 * `--chan lit` — the RELIEF read, and this recipe cannot be judged without it.
 *
 * `glyphArchitrave`'s own note says the signs "read as dark cuts *in* the gold": the gild covers
 * the whole sunk band, so the glyphs are carried by `carve`'s depth, not by pigment. An
 * albedo-only render therefore shows a soft gold field with almost no writing in it and would
 * support exactly the "flat colour, no detail" by-eye verdict that §121.9 recorded as WRONG when
 * it was checked against the built maps. This shades the height field instead.
 *
 * SCOPE: this is not the game's shader. It is a single Lambert term on the height gradient at
 * `derive()`'s slope scale (`bump * size / tile`, Textures.js:309), with no cel ramp, no shadow,
 * no specular, no AO tint and no grade. It answers "is a mark present in the relief at this
 * scale", not "how does it look".
 */
const CHAN = opt('chan', 'albedo');
if (CHAN !== 'albedo') {
  const Hf = Float64Array.from(got.h), OC = Float64Array.from(got.occ);
  const ku = got.bump * sz / got.tileU;
  const at = (x, y) => Hf[(((y % sz) + sz) % sz) * sz + (((x % sz) + sz) % sz)];
  const lx = -0.55, ly = 0.55, lz = 0.63;   // raking from upper-left, the way a chisel reads
  const out = new Float64Array(sz * sz);
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * ku;
    const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * ku;
    const il = 1 / Math.hypot(dx, dy, 1);
    const nd = Math.max(0, (-dx * lx - dy * ly + lz) * il);
    out[y * sz + x] = nd;
  }
  if (CHAN === 'lit') { R = out; G = out; B = out; }
  else if (CHAN === 'height') { R = Hf; G = Hf; B = Hf; }
  else if (CHAN === 'occ') { R = OC; G = OC; B = OC; }
  else if (CHAN === 'litalbedo') {
    const r2 = new Float64Array(sz * sz), g2 = new Float64Array(sz * sz), b2 = new Float64Array(sz * sz);
    for (let i = 0; i < sz * sz; i++) { const k = 0.25 + 1.35 * out[i]; r2[i] = R[i] * k; g2[i] = G[i] * k; b2[i] = B[i] * k; }
    R = r2; G = g2; B = b2;
  } else { console.error('unknown --chan', CHAN); process.exit(1); }
}

/** Box-downsample the V window [vc - vh, vc + vh] over `nu` wrapped U repeats into W x H. */
const U0 = parseFloat(opt('u0', '0'));
function strip(W, H) {
  const out = new Uint8Array(W * H * 3);
  const fx = (NU * sz) / W, fy = (2 * VH * sz) / H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let ar = 0, ag = 0, ab = 0, c = 0;
    const x0 = U0 * sz + x * fx;
    /* Surface row 0 is V = 0 (rasterMask flips on readback), and the image's top row is the top
       of the window, so V decreases down the image. */
    const vTop = VC + VH - (y * fy) / sz;
    for (let j = 0; j < Math.max(1, fy); j++) for (let i = 0; i < Math.max(1, fx); i++) {
      const sx = ((x0 + i) | 0) % sz;
      const vy = Math.round(vTop * sz) - j;
      const sy = ((vy % sz) + sz) % sz;
      const k = sy * sz + sx;
      ar += R[k]; ag += G[k]; ab += B[k]; c++;
    }
    const o = (y * W + x) * 3;
    out[o] = enc(ar / c); out[o + 1] = enc(ag / c); out[o + 2] = enc(ab / c);
  }
  /* Calibration control: a synthetic once-per-repeat mark of `--stamp` tile-fractions across,
     drawn on the OUTPUT, so "what a countable landmark looks like here" sits in the same image. */
  if (STAMP > 0) {
    const d = STAMP * REP * (W / (REP * NU)) * NU / NU;   // stamp diameter in output px
    const rr = d / 2;
    for (let rep = 0; rep < NU; rep++) {
      const cx = (rep + 0.5) * (W / NU), cy = H * 0.5;
      for (let y = Math.max(0, (cy - rr) | 0); y < Math.min(H, cy + rr); y++)
        for (let x = Math.max(0, (cx - rr) | 0); x < Math.min(W, cx + rr); x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue;
          const o = (y * W + x) * 3;
          out[o] = 20; out[o + 1] = 20; out[o + 2] = 24;
        }
    }
  }
  return out;
}

/**
 * `hf` = mean |x - blur3(x)| over the V window, on the height field and on albedo luma.
 *
 * **THIS METRIC FAILED ITS CONTROL. Do not quote it as evidence about carving legibility.**
 * Kept, printing, and labelled, so the next person does not build it again.
 *
 * It was written to put a number behind a render that separates two states instantly:
 * `hieroglyph_wall`'s register is a fully legible incised inscription, and
 * `hieroglyph_gilded`'s architrave band is two courses of ashlar with three stroke-clusters on
 * it. Measured: gilded row 0.00473, wall register 0.00723 — a factor of 1.5, and the gilded
 * recipe's own mid-tile frieze scores 0.00741, i.e. *above* the legible control. The metric is
 * counting the sunk-panel bevel and the ashlar joints as chisel detail, which they are; it
 * cannot see whether any of that detail is sign-shaped. It is also not comparable across
 * recipes at all, because the two differ in built size (512 vs 1024) and in world tile
 * (6.4 vs 10.4 m), and hf per texel moves with both.
 *
 * This is §13's finding arriving a second time on the same recipe family: a global scalar over a
 * band is dominated by the band, and where the defect is "what the marks are" rather than "how
 * much marking there is", expect no scalar and budget for the render. The claim this file
 * actually rests on is the targeted A/B at three named sign positions plus the pool census.
 */
{
  const Hf = Float64Array.from(got.h);
  const y0 = Math.round((VC - VH) * sz), y1 = Math.round((VC + VH) * sz);
  const wrap = (v) => ((v % sz) + sz) % sz;
  const hfOf = (buf) => {
    let acc = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < sz; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += buf[wrap(y + j) * sz + wrap(x + i)];
      acc += Math.abs(buf[wrap(y) * sz + wrap(x)] - s / 9); n++;
    }
    return acc / Math.max(1, n);
  };
  const lum = new Float64Array(sz * sz);
  for (let i = 0; i < sz * sz; i++) lum[i] = 0.2126 * got.r[i] + 0.7152 * got.g[i] + 0.0722 * got.b[i];
  console.log(`# ${recipeName} V ${(VC - VH).toFixed(3)}..${(VC + VH).toFixed(3)} at ${sz}px: ` +
    `height hf ${hfOf(Hf).toFixed(5)}   albedo-luma hf ${hfOf(lum).toFixed(5)}   ` +
    `[hf FAILED ITS CONTROL — see note; not evidence about carving legibility]`);
}

const W = Math.round(REP * NU), H = Math.max(4, Math.round(REP * 2 * VH));
const img = strip(W, H);

/**
 * A 1385 x 37 strip is at the framing's true scale and is unreadable in any viewer that fits it
 * to a page — it gets resampled, which is the one thing this instrument exists to avoid. So write
 * the true-scale strip AND a stacked, integer-magnified copy: `--stack` repeats per row, `--zoom`
 * nearest-neighbour magnification. Integer zoom adds no information and removes none; stacking
 * one repeat per row is also the direct test of "is this countable", because identical marks
 * landing at the same x in every row is exactly what a countable repeat looks like.
 */
const STACK = parseFloat(opt('stack', '0'));
const ZOOM = parseInt(opt('zoom', '1'), 10);
writePNG(outPng, W, H, img);
console.log(`${outPng}  ${W}x${H}  ${NU} repeats at ${REP} px/repeat, V ${(VC - VH).toFixed(4)}..${(VC + VH).toFixed(4)}  (tile ${sz})${STAMP ? `  + ${STAMP} stamp` : ''}`);
if (STACK > 0) {
  const rw = Math.round(REP * STACK), rows = Math.ceil(NU / STACK);
  const gap = 2;
  const OW = rw * ZOOM, OH = (H * ZOOM + gap) * rows;
  const out = new Uint8Array(OW * OH * 3).fill(60);
  for (let r = 0; r < rows; r++) for (let y = 0; y < H * ZOOM; y++) for (let x = 0; x < OW; x++) {
    const sx = r * rw + ((x / ZOOM) | 0), sy = (y / ZOOM) | 0;
    if (sx >= W) continue;
    const si = (sy * W + sx) * 3, oi = ((r * (H * ZOOM + gap) + y) * OW + x) * 3;
    out[oi] = img[si]; out[oi + 1] = img[si + 1]; out[oi + 2] = img[si + 2];
  }
  const sp = outPng.replace(/\.png$/, '-stack.png');
  writePNG(sp, OW, OH, out);
  console.log(`${sp}  ${OW}x${OH}  ${rows} rows of ${STACK} repeat(s), zoom ${ZOOM}x`);
}
if (SQUINT) {
  const w2 = Math.max(8, Math.round(W / 8)), h2 = Math.max(3, Math.round(H / 8));
  writePNG(SQUINT, w2, h2, strip(w2, h2));
  console.log(`${SQUINT}  ${w2}x${h2}  squint`);
}
