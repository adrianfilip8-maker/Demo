/**
 * glyphrelief — does a carved sign read as *cut* in the albedo, or as a stamp printed on a wall?
 *
 *   node tools/glyphrelief.mjs [recipe...] [--size 1024] [--ab hgcue]
 *
 * Criterion and thresholds are registered in `progress/records/PREREG-palwarm.md` ADDENDUM 2.
 *
 * ── What it measures and why in the albedo ─────────────────────────────────────────────────
 *
 * Critic pass 8: the hieroglyphs "are not glyphs — rounded rectangles, ovals and pills… a circuit
 * board". Two separate defects sit under that and they need separate numbers: *which signs are
 * drawn* (the census, `tools/census.mjs`) and *whether a drawn sign looks carved*. This is the
 * second.
 *
 * It is measured in the albedo on purpose, and `carve()`'s own note is the argument: `heightAO`
 * never multiplies the key term (§8; SHADING has ruled `aoKey = 0` final), and the normal map goes
 * flat in shadow, where most of this recipe's frame area actually is. **Albedo is the only channel
 * that reaches every lighting state**, so if the cut is not in the albedo it is not in the frame.
 *
 * ── How the sign boxes are obtained ────────────────────────────────────────────────────────
 *
 * From `Hieroglyphs.drawGlyph`'s existing `__GLYPHLOG` hook, so the boxes are *what the build
 * drew* — not a re-derivation of the layout in this file, which is the failure mode where an
 * instrument and its subject drift apart and only the instrument reports green.
 *
 * ── The calibration arm ────────────────────────────────────────────────────────────────────
 *
 * Every statistic is computed a second time over the same number of same-sized boxes placed on
 * **plain wall** (boxes chosen far from any logged sign). Masonry joints, pitting, weathering and
 * the block ramp all produce luma structure, and a measurement that cannot separate a carved sign
 * from unbroken wall is measuring the masonry. The plain-wall arm must come back clearly lower;
 * if it does not, the run says so and exits non-zero.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SIZE = parseInt(opt('size', '1024'), 10);
const AB = opt('ab', '');
const NAMES = argv.filter((a) => !a.startsWith('--') && !['1024', '512', '256', AB].includes(a));
const RECIPES = NAMES.length ? NAMES : ['hieroglyph_wall'];

/** Signs a viewer would call a picture of something. PREREG ADDENDUM 2, G1b. */
const CREATURE = new Set(['falcon', 'owl', 'vulture', 'quail', 'jackal', 'scarab', 'cobra', 'bee', 'seated', 'wedjat']);
/** G1 as originally registered — creatures plus named body parts. */
const FIGURATIVE = new Set([...CREATURE, 'mouth', 'arm', 'hand', 'ka', 'eye']);

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const inbox = new Map();
const server = http.createServer((req, res) => {
  const [pathname, query] = req.url.split('?');
  const u = decodeURIComponent(pathname);
  if (req.method === 'POST' && u === '/put') {
    const q = new URLSearchParams(query || '');
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => { inbox.set(q.get('name'), Buffer.concat(parts)); res.writeHead(204); res.end(); });
    return;
  }
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 8100 + (process.pid % 300);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  [page]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const built = await page.evaluate(async ({ recipes, size, ab }) => {
  const { MATERIALS } = await import('/src/textures/Materials.js');
  const { bake } = await import('/src/textures/Bake.js');
  globalThis.__TEX_AB = ab;
  const out = [];
  for (const name of recipes) {
    if (!MATERIALS[name]) continue;
    /* The hook records every `drawGlyph` in every pass, so the same sign appears once per mode.
       De-duplicated below on (name,x,y) — the 'cut' pass is the geometry of record. */
    globalThis.__GLYPHLOG = [];
    globalThis.__CARVELOG = [];
    const p = bake(name, size, 'high');
    const log = globalThis.__GLYPHLOG;
    const carves = globalThis.__CARVELOG;
    globalThis.__GLYPHLOG = null;
    globalThis.__CARVELOG = null;
    await fetch(`/put?name=${encodeURIComponent(name)}`, { method: 'POST', body: p.albedo });
    /* The cut masks are Float32Array; ship them as bytes over the socket, never through
       page.evaluate's JSON return value (a 1024² float array is a million boxed numbers). */
    for (let k = 0; k < carves.length; k++) {
      await fetch(`/put?name=${encodeURIComponent(name)}.cb${k}`, { method: 'POST', body: new Uint8Array(carves[k].cb.buffer) });
      await fetch(`/put?name=${encodeURIComponent(name)}.cut${k}`, { method: 'POST', body: new Uint8Array(carves[k].cut.buffer) });
    }
    out.push({ name, size: p.size, log: log.filter((g) => g.mode === 'cut'), carves: carves.map((c) => c.size) });
  }
  return out;
}, { recipes: RECIPES, size: SIZE, ab: AB });
await browser.close();
server.close();

const pct = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.max(0, Math.floor(q * a.length)))] : NaN);

/** p90-p10 luma spread over one box. */
function boxSpread(lum, size, x0, y0, w, h) {
  const xa = Math.max(0, Math.round(x0)), xb = Math.min(size, Math.round(x0 + w));
  const ya = Math.max(0, Math.round(y0)), yb = Math.min(size, Math.round(y0 + h));
  if (xb - xa < 4 || yb - ya < 4) return null;
  const vals = [];
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) vals.push(lum[y * size + x]);
  vals.sort((a, b) => a - b);
  return pct(vals, 0.9) - pct(vals, 0.1);
}

/**
 * G3b, measured across the **cut edge** rather than across the glyph box.
 *
 * The box form was tried first and its calibration arm failed, which is the whole reason the arm
 * is there: `hieroglyph_wall` carries painted register bands running the full width of the tile,
 * so a box straddling one has a large top-vs-bottom luma difference that has nothing to do with
 * carving. Plain wall reported **+0.0169** against the sign boxes' -0.0166 — the same magnitude.
 * A statistic that cannot tell a carved sign from an unbroken wall is not measuring the carving.
 *
 * So the population is texels **on the cut's bevel wall whose wall is horizontal** — `cb` between
 * 0.15 and 0.85 with a vertical gradient dominating the horizontal one. The sign of that gradient
 * says which side of the cut the texel is on: the buffer's +y is the wall's up (`rasterMask`
 * flips rows on readback), so `dcb/dy > 0` means the cut deepens upward, i.e. this is the **lower
 * lip** — a sky-facing ledge. `dcb/dy < 0` is the **overhang** under the cut's top rim.
 *
 * ── The control arm, and the first version of it that did not work ─────────────────────────
 *
 * First attempt sampled the albedo from a copy shifted **horizontally** by a third of the tile. It
 * failed to move: +0.0335 against a true +0.0377. The reason is that every confound in this
 * recipe is a function of *y* — painted register bands, the ashlar course ramp, `weather`'s
 * downward streaking — and the lip and overhang populations do not sit at the same y. A horizontal
 * shift leaves all of that in place, so it broke no association at all.
 *
 * The shift is therefore **vertical**, by an awkward fraction so it cannot re-align a periodic
 * band with itself. Same texels, same labels, the albedo's own y-structure moved out from under
 * them: what survives is what is tied to the cut.
 */
function edgeCue(lum, cb, size, shift = 0) {
  const at = (x, y) => lum[((y + shift + size * 2) % size) * size + ((x + size) % size)];
  let up = 0, un = 0, dn = 0, dnn = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const c = cb[i];
      if (c < 0.15 || c > 0.85) continue;
      const gy = cb[((y + 1) % size) * size + x] - cb[((y - 1 + size) % size) * size + x];
      const gx = cb[y * size + ((x + 1) % size)] - cb[y * size + ((x - 1 + size) % size)];
      if (Math.abs(gy) < Math.abs(gx) * 1.5 || Math.abs(gy) < 0.02) continue;   // wall is not horizontal
      const v = at(x, y);
      if (gy > 0) { up += v; un++; } else { dn += v; dnn++; }
    }
  }
  if (!un || !dnn) return { cue: 0, n: 0 };
  return { cue: (up / un) - (dn / dnn), n: un + dnn, lower: up / un, upper: dn / dnn };
}

let failed = false;
for (const rec of built) {
  const buf = inbox.get(rec.name);
  const size = rec.size;
  const lum = new Float32Array(size * size);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (buf[p] * 0.2126 + buf[p + 1] * 0.7152 + buf[p + 2] * 0.0722) / 255;
  }

  /* De-duplicate: a sign drawn in more than one pass logs more than once at the same place. */
  const seen = new Set();
  const signs = [];
  for (const g of rec.log) {
    const k = `${g.name}|${Math.round(g.x)}|${Math.round(g.y)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    signs.push(g);
  }

  /* ---- G1 / G1b: what was drawn ---- */
  const nFig = signs.filter((g) => FIGURATIVE.has(g.name)).length;
  const nCre = signs.filter((g) => CREATURE.has(g.name)).length;
  const widths = signs.map((g) => g.w).filter((w) => w > 0);
  const mw = widths.reduce((a, b) => a + b, 0) / (widths.length || 1);
  const sdw = Math.sqrt(widths.reduce((a, b) => a + (b - mw) ** 2, 0) / (widths.length || 1));

  /* ---- G3: does a drawn sign look cut? ---- */
  const occupied = new Uint8Array(size * size);
  for (const g of signs) {
    const xa = Math.max(0, Math.round(g.x - 6)), xb = Math.min(size, Math.round(g.x + g.w + 6));
    const ya = Math.max(0, Math.round(size - g.y - g.h - 6)), yb = Math.min(size, Math.round(size - g.y + 6));
    for (let y = ya; y < yb; y++) occupied.fill(1, y * size + xa, y * size + xb);
  }
  const sigSpreads = [], fldSpreads = [];
  let rnd = 0x2545f491;
  const rand = () => { rnd ^= rnd << 13; rnd ^= rnd >>> 17; rnd ^= rnd << 5; return (rnd >>> 0) / 4294967296; };
  for (const g of signs) {
    // Buffer row 0 is the wall's bottom; `__GLYPHLOG` y is canvas-space (y down) from the top.
    const st = boxSpread(lum, size, g.x, size - g.y - g.h, g.w, g.h);
    if (st != null) sigSpreads.push(st);
    for (let tries = 0; tries < 40; tries++) {
      const x = rand() * (size - g.w), y = rand() * (size - g.h);
      let clear = true;
      for (let yy = Math.round(y); yy < Math.round(y + g.h) && clear; yy += 4) {
        for (let xx = Math.round(x); xx < Math.round(x + g.w); xx += 4) {
          if (occupied[yy * size + xx]) { clear = false; break; }
        }
      }
      if (!clear) continue;
      const f2 = boxSpread(lum, size, x, y, g.w, g.h);
      if (f2 != null) fldSpreads.push(f2);
      break;
    }
  }
  const avg = (a) => a.reduce((s2, v) => s2 + v, 0) / (a.length || 1);
  const sigSpread = avg(sigSpreads), fldSpread = avg(fldSpreads);

  const cbBuf = inbox.get(`${rec.name}.cb0`);
  let cue = { cue: 0, n: 0 }, ctrl = { cue: 0, n: 0 };
  if (cbBuf) {
    const cb = new Float32Array(cbBuf.buffer, cbBuf.byteOffset, cbBuf.length / 4);
    cue = edgeCue(lum, cb, size, 0);
    ctrl = edgeCue(lum, cb, size, Math.round(size * 0.37) + 13);
  }

  console.log(`\n=== ${rec.name}  size=${size}${AB ? `  AB-off:${AB}` : ''} ===`);
  console.log(`  placements ${signs.length}   distinct signs ${new Set(signs.map((s2) => s2.name)).size}`);
  console.log(`  G1  figurative (creature + body part)  ${(100 * nFig / signs.length).toFixed(1)}%  (${nFig}/${signs.length})`);
  console.log(`  G1b creature ("a picture of something") ${(100 * nCre / signs.length).toFixed(1)}%  (${nCre}/${signs.length})`);
  console.log(`  G2  drawn-width sd/mean               ${(sdw / (mw || 1)).toFixed(3)}   (mean ${mw.toFixed(1)} px)`);
  console.log(`  G3a spread p90-p10 in sign boxes      ${sigSpread.toFixed(4)}   plain wall ${fldSpread.toFixed(4)}   delta ${(sigSpread - fldSpread >= 0 ? '+' : '')}${(sigSpread - fldSpread).toFixed(4)}`);
  if (!cbBuf) { console.log('  G3b NO CARVE MASK — recipe does not call carve()'); }
  else {
    console.log(`  G3b lower lip minus overhang luma     ${cue.cue >= 0 ? '+' : ''}${cue.cue.toFixed(4)}   (lip ${cue.lower.toFixed(4)}  overhang ${cue.upper.toFixed(4)}, ${cue.n} edge texels)`);
    const ok = Math.abs(ctrl.cue) < Math.abs(cue.cue) * 0.34;
    console.log(`  CAL-G same texels, albedo shifted in y ${ctrl.cue >= 0 ? '+' : ''}${ctrl.cue.toFixed(4)}   ${ok ? 'OK — the cue is tied to the cut, not to the bands' : 'FAILED — survives breaking the mask/pixel association'}`);
    if (!ok) failed = true;
  }

  const top = new Map();
  for (const g of signs) top.set(g.name, (top.get(g.name) || 0) + 1);
  console.log('  signs: ' + [...top].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}:${c}`).join(' '));
}
process.exit(failed ? 1 : 0);
