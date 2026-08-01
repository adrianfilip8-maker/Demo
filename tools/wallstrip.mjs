/**
 * Wall strip at the *canonical framing's own* pixel scale — the tiling instrument that answers
 * the perceptual question directly instead of a proxy for it.
 *
 * Every previous tiling metric in this session measured something adjacent to the defect:
 *   - the critic's pass-3 probe sampled 32-128 px windows inside a 234-292 px repeat (detail,
 *     not repeat);
 *   - `tilescore.mjs` low-passed to 1/8 of a repeat and averaged the glyphs away;
 *   - `tilematch.mjs` searches the whole wrapped tile in 2D, so a patch scores "distinctive"
 *     largely because of its *vertical* position in the register stack — and these walls are
 *     9.6-17 m tall against a 10.4 m V repeat, i.e. under two repeats vertically and 3.5-4.3
 *     horizontally. Vertical uniqueness cannot make a horizontal repeat countable.
 *
 * So this renders what the eye is actually given: `nu` repeats across by `nv` down, box-filtered
 * to the px-per-repeat that `angsize.mjs` measures for a named shot, and writes it as a PNG to
 * look at. Plus a squint pass (heavy downsample) in the same call, because §7.3 has *two*
 * conditions here and passing one while failing the other is what produced the last regression.
 *
 * **Why this one is trusted and the four it replaced are not.** It is the only tiling
 * instrument here that was calibrated against a *known-bad control*. `hieroglyph_wall` carries
 * one for free: `cartouche: true`, which its own note records as having made repeats "trivially
 * countable" and which is unmistakable in a render at `temple`'s 248 px/repeat. Across that
 * bit-exact A/B, **none of 28 scalar measurements separated shipped from known-bad** — 1/8
 * low-pass gave "no landmark" both sides, 2D luma NCC 0.482 vs 0.488, U-chroma NCC 0.441 vs
 * 0.443, chroma-blob peak/sd 12.06 vs 12.05, strip salience 2.61 vs 2.62, and four scalar
 * families across seven scales topped out at 2.5% separation. The cause is structural: the
 * cartouche is ~1.2% of the tile and occurs once, while every one of those statistics is a
 * global moment dominated by the other 98.8%. Taking a max over a dense grid does not rescue it
 * either (0.759 vs 0.787), because in a dense inscription nearly every patch is unique and the
 * metric saturates. This render separates the two instantly, by eye, which is the whole point.
 *
 * **So: a tiling number without a known-bad control beside it is not evidence.** A withdrawn
 * "0.482 against a 0.45 threshold" finding was produced exactly that way — the threshold was
 * set from the numbers themselves, with nothing known-bad to anchor it.
 *
 * Takes no capture lock and boots no game: it renders texture tiles in a bare page. Safe to run
 * while a capture holds the lock, though it does start its own chromium, so do not run several
 * at once.
 *
 *   node wallstrip.mjs <recipe> <out.png> [--rep 248] [--nu 5] [--nv 1.6] [--size 512]
 *                                         [--squint out.png] [--crop out.png]
 *
 * `--crop` writes a 1:1 crop of the source tile (no resampling) so carving detail can be judged
 * at authored resolution in the same run.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = '/home/user/Demo';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };

/* ---- minimal PNG writer (RGB8, filter 0) ---- */
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
if (!recipeName || !outPng) { console.error('usage: wallstrip.mjs <recipe> <out.png> [--rep px] [--nu n] [--nv n]'); process.exit(1); }
const REP = parseFloat(opt('rep', '248'));
const NU = parseFloat(opt('nu', '5'));
const NV = parseFloat(opt('nv', '1.6'));
const SIZE = parseInt(opt('size', '512'), 10);
const SQUINT = opt('squint', null);
const CROP = opt('crop', null);

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 18000 + (process.pid % 900);
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
  const sz = recipe.tier >= 1 ? Math.max(256, SIZE >> 1) : SIZE;
  const s = new C.Surface(sz, (recipe.seed ?? hashName(recipeName)) >>> 0);
  recipe.build(s, { seed: s.seed, size: sz, name: recipeName, quality: 'high' });
  /* Surface rows are authored bottom-up (rasterMask flips on readback); flip here so the PNG
     reads the way the wall does. */
  return { sz, r: Array.from(s.r), g: Array.from(s.g), b: Array.from(s.b) };
}, { recipeName, SIZE });
await browser.close(); server.close();
if (got.error) { console.error(got.error); process.exit(1); }

const sz = got.sz;
const R = Float64Array.from(got.r), G = Float64Array.from(got.g), B = Float64Array.from(got.b);
const enc = (v) => Math.max(0, Math.min(255, Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))));

/** Box-downsample `nu x nv` wrapped repeats of the tile into a W x H image. */
function strip(W, H, nu, nv) {
  const out = new Uint8Array(W * H * 3);
  const fx = (nu * sz) / W, fy = (nv * sz) / H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let ar = 0, ag = 0, ab = 0, c = 0;
    const x0 = x * fx, y0 = y * fy;
    for (let j = 0; j < Math.max(1, fy); j++) for (let i = 0; i < Math.max(1, fx); i++) {
      const sx = ((x0 + i) | 0) % sz;
      /* PNG row 0 is the top of the wall; Surface row 0 is the bottom. */
      const sy = (sz - 1 - (((y0 + j) | 0) % sz) + sz) % sz;
      const k = sy * sz + sx;
      ar += R[k]; ag += G[k]; ab += B[k]; c++;
    }
    const o = (y * W + x) * 3;
    out[o] = enc(ar / c); out[o + 1] = enc(ag / c); out[o + 2] = enc(ab / c);
  }
  return out;
}

const W = Math.round(REP * NU), H = Math.round(REP * NV);
writePNG(outPng, W, H, strip(W, H, NU, NV));
console.log(`${outPng}  ${W}x${H}  ${NU} x ${NV} repeats at ${REP} px/repeat  (tile ${sz})`);

if (SQUINT) {
  /* §2.3's squint test: the masses must still read. 1/8 of the framing scale. */
  const w2 = Math.max(8, Math.round(W / 8)), h2 = Math.max(8, Math.round(H / 8));
  writePNG(SQUINT, w2, h2, strip(w2, h2, NU, NV));
  console.log(`${SQUINT}  ${w2}x${h2}  squint`);
}
if (CROP) {
  /* 1:1, no resampling — carving detail at authored resolution. */
  const n = Math.min(sz, 512), out = new Uint8Array(n * n * 3);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = (sz - 1 - y) * sz + x, o = (y * n + x) * 3;
    out[o] = enc(R[k]); out[o + 1] = enc(G[k]); out[o + 2] = enc(B[k]);
  }
  writePNG(CROP, n, n, out);
  console.log(`${CROP}  ${n}x${n}  1:1 tile crop`);
}
