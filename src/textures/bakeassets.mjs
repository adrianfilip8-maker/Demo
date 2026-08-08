/**
 * bakeassets — regenerate the committed texture cache.
 *
 *   node src/textures/bakeassets.mjs            # bake, verify, write
 *   node src/textures/bakeassets.mjs --dry      # bake and verify, write nothing
 *   node src/textures/bakeassets.mjs --filters  # also report the filter/size trade-off
 *
 * Writes `public/assets/tex/textures.bin` (one blob, every map, PNG-framed) and
 * `src/textures/baked.json` (the manifest the runtime imports). **Run this after changing any
 * recipe, any `Canvas2D` helper, or `NormalMap`** — `tests/textures.test.mjs` goes red until you
 * do, which is the point.
 *
 * ── Why this is a Playwright script and not plain Node ───────────────────────────────────────
 *
 * Eleven of the twenty-three prewarmed recipes rasterise vector art through `Canvas2D.rasterMask`,
 * which needs a 2D canvas; plain Node has neither `OffscreenCanvas` nor `document`. The catalogue
 * is therefore only fully reachable inside a browser, and the baker goes where the recipes are.
 * No game, no WebGL, no capture lock — a blank page and the texture modules.
 *
 * ── The two things this script must never get wrong ──────────────────────────────────────────
 *
 * 1. **It verifies before it writes.** Every encoded buffer is decoded again through the *runtime's
 *    own* `PngCodec.unfilter`, and its digest compared with the bytes that went in. A mismatch
 *    aborts without touching the tree. A bake that is wrong and committed is worse than no bake:
 *    the whole justification for caching generated art is that the cache is the same art.
 *
 * 2. **It cross-checks the browser against Node.** The manifest's `guard` digests are what
 *    `tests/textures.test.mjs` re-derives offline to detect a stale bake, and they are produced
 *    here in a browser. For every recipe that *can* also build in Node, both are computed and
 *    compared. If they ever disagreed the guard would be measuring the wrong thing — a test that
 *    passes because its oracle is wrong is the §211.1 failure with more machinery.
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePng, unfilter } from './PngCodec.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT_BLOB = path.join(ROOT, 'public/assets/tex/textures.bin');
const OUT_MANIFEST = path.join(HERE, 'baked.json');
const PUBLIC_URL = '/assets/tex/textures.bin';

/** The quality tier the cache is built for. `Textures` falls back to procedural at any other. */
const TEX_SIZE = 1024;
/** Resolution the staleness guard re-derives at. Small enough to run in the normal test suite. */
const GUARD_SIZE = 256;
/** Filter 0 (None) — see the note by `encode()`. */
const FILTER = 0;

const has = (n) => process.argv.includes(`--${n}`);
const digest = (u8) => {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < u8.length; i++) {
    a ^= u8[i]; a = Math.imul(a, 0x01000193);
    b = Math.imul(b ^ u8[i], 0x85ebca6b); b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
};
const MB = (b) => (b / 1048576).toFixed(2);

/* ─────────────────────────── bake, in a browser ─────────────────────────── */

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/bake.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 7300 + (process.pid % 300);
await new Promise((r) => server.listen(port, '127.0.0.1', r));

console.log(`baking at texSize ${TEX_SIZE}, guard ${GUARD_SIZE}…`);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  [page]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/bake.html`);

const t0 = Date.now();
const baked = await page.evaluate(async ({ texSize, guardSize }) => {
  const { PREWARM, MATERIALS } = await import('/src/textures/Materials.js');
  const { bake } = await import('/src/textures/Bake.js');
  const H = (u8) => {
    let a = 0x811c9dc5, b = 0x01000193;
    for (let i = 0; i < u8.length; i++) {
      a ^= u8[i]; a = Math.imul(a, 0x01000193);
      b = Math.imul(b ^ u8[i], 0x85ebca6b); b ^= b >>> 13;
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  };
  /* The shipped path must be baked, never an A/B arm — a control build committed as the cache
   * would silently become the shipped look, which is the provenance hole `TEX_AB` exists to
   * close, inverted. */
  globalThis.__TEX_AB = '';

  const out = [];
  for (const name of PREWARM) {
    if (!MATERIALS[name]) continue;
    const p = bake(name, texSize, 'high');
    const g = bake(name, guardSize, 'high');
    out.push({
      name,
      size: p.size,
      ormSize: p.orm.size,
      hasAlpha: p.hasAlpha,
      normalStrength: p.normalStrength,
      joint: p.joint,
      slots: {
        albedo: [...p.albedo], normal: [...p.normal], orm: [...p.orm.data],
        ...(p.emissive ? { emissive: [...p.emissive] } : {}),
      },
      guard: [H(g.albedo), H(g.normal), H(g.orm.data), g.emissive ? H(g.emissive) : '-'].join('/'),
    });
  }
  return out;
}, { texSize: TEX_SIZE, guardSize: GUARD_SIZE });
await browser.close();
server.close();
console.log(`  baked ${baked.length} recipes in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// `[...u8]` crosses the bridge as a plain array; put it back in a typed array.
for (const r of baked) for (const k of Object.keys(r.slots)) r.slots[k] = Uint8Array.from(r.slots[k]);

/* ───────────────────── cross-check the browser against Node ───────────────────── */

/* The guard digests above decide whether the committed cache is stale, and they were produced in
 * a browser while the test that reads them runs in Node. For every recipe Node can also build,
 * both are computed and required to agree — otherwise the guard is an oracle for a different
 * machine than the one asserting on it. */
const { bake: nodeBake } = await import('./Bake.js');
let crossed = 0, nodeOnly = [];
for (const r of baked) {
  let g;
  try { g = nodeBake(r.name, GUARD_SIZE, 'high'); } catch { r.nodeBakeable = false; continue; }
  r.nodeBakeable = true;
  const s = [digest(g.albedo), digest(g.normal), digest(g.orm.data), g.emissive ? digest(g.emissive) : '-'].join('/');
  if (s !== r.guard) {
    console.error(`FATAL: ${r.name} guard digest differs between browser and Node`);
    console.error(`  browser ${r.guard}`);
    console.error(`  node    ${s}`);
    process.exit(1);
  }
  crossed++;
  nodeOnly.push(r.name);
}
console.log(`  guard digests cross-checked browser vs Node: ${crossed}/${baked.length} recipes agree`
  + ` (${baked.length - crossed} need a canvas and cannot be built in Node)`);

/* ───────────────────────────── encode ───────────────────────────── */

/**
 * PNG, 8-bit RGBA, non-interlaced, **filter type 0 (None)**.
 *
 * Filtering is what makes a PNG small, and adaptive filtering would win here too — measured over
 * the whole catalogue, adaptive is about 15 % smaller than None. It is not taken, for one reason:
 * with filter 0 the unfilter step is `out.set(row)`, a memcpy, while Paeth is a four-way branch
 * and three subtractions **per byte** over 93 MB of output, on the boot path this whole exercise
 * exists to shorten. Trading ~3 MB of repo for that is the right way round. `--filters` prints the
 * comparison so the next person can re-decide with numbers rather than re-derive them.
 */
function encode(buf, size, filterType = FILTER) {
  const im = new PNG({ width: size, height: size });
  Buffer.from(buf.buffer, buf.byteOffset, buf.length).copy(im.data);
  return PNG.sync.write(im, { colorType: 6, deflateLevel: 9, filterType });
}

if (has('filters')) {
  let a = 0, n = 0;
  for (const r of baked) {
    for (const [slot, b] of Object.entries(r.slots)) {
      const sz = slot === 'orm' ? r.ormSize : r.size;
      a += encode(b, sz, -1).length;
      n += encode(b, sz, 0).length;
    }
  }
  console.log(`  filter comparison: adaptive ${MB(a)} MB, none ${MB(n)} MB (+${(100 * (n / a - 1)).toFixed(1)}%)`);
}

const chunks = [];
let offset = 0, rawTotal = 0;
const manifest = {
  version: 1,
  note: 'Generated by src/textures/bakeassets.mjs. Do not hand-edit — tests/textures.test.mjs verifies every digest here against both the committed blob and a fresh procedural build.',
  texSize: TEX_SIZE,
  guardSize: GUARD_SIZE,
  blob: PUBLIC_URL,
  recipes: {},
};
for (const r of baked) {
  const rec = {
    size: r.size, ormSize: r.ormSize, hasAlpha: r.hasAlpha,
    normalStrength: r.normalStrength, joint: r.joint,
    guard: r.guard, nodeBakeable: r.nodeBakeable, slots: {},
  };
  for (const [slot, buf] of Object.entries(r.slots)) {
    const sz = slot === 'orm' ? r.ormSize : r.size;
    const png = encode(buf, sz);
    chunks.push(png);
    rec.slots[slot] = { off: offset, len: png.length, size: sz, digest: digest(buf) };
    offset += png.length;
    rawTotal += buf.length;
  }
  manifest.recipes[r.name] = rec;
}
const blob = Buffer.concat(chunks);
manifest.bytes = blob.length;
manifest.blobDigest = digest(blob);

console.log(`  encoded ${chunks.length} maps: ${MB(rawTotal)} MB raw -> ${MB(blob.length)} MB PNG (ratio ${(blob.length / rawTotal).toFixed(3)})`);

/* ───────────────── verify: decode everything back, exactly ───────────────── */

/* Through the runtime's own `unfilter`, so this proves the shipped decoder — not a second one
 * that happens to agree. Node's `inflateSync` and the browser's `DecompressionStream('deflate')`
 * both implement RFC 1950 and are byte-exact by definition; the part that could be wrong is the
 * unfiltering, and that is the shared code being exercised here. */
let ok = 0, bad = 0;
for (const [name, rec] of Object.entries(manifest.recipes)) {
  for (const [slot, s] of Object.entries(rec.slots)) {
    const png = blob.subarray(s.off, s.off + s.len);
    const { width, height, zlib: z } = parsePng(new Uint8Array(png));
    const data = unfilter(new Uint8Array(zlib.inflateSync(Buffer.from(z))), width, height);
    if (width !== s.size) { console.error(`FATAL: ${name}.${slot} decoded ${width}px, manifest says ${s.size}`); bad++; continue; }
    if (digest(data) !== s.digest) { console.error(`FATAL: ${name}.${slot} does not survive the round trip`); bad++; continue; }
    ok++;
  }
}
console.log(`  round trip verified: ${ok} maps exact, ${bad} corrupt`);
if (bad) { console.error('ABORTING — nothing written.'); process.exit(1); }

if (has('dry')) { console.log('--dry: nothing written.'); process.exit(0); }

fs.mkdirSync(path.dirname(OUT_BLOB), { recursive: true });
fs.writeFileSync(OUT_BLOB, blob);
fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
console.log(`wrote ${path.relative(ROOT, OUT_BLOB)} (${MB(blob.length)} MB)`);
console.log(`wrote ${path.relative(ROOT, OUT_MANIFEST)}`);
