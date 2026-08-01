/* Glyph census: what signs a recipe actually places, where, how big, and in what colour.
 *
 * Answers the localised-landmark question that §13 shows no global scalar can: a repeat is
 * countable when it contains a sign that is (a) rare in the tile and (b) large or saturated
 * enough to be recognised again. That is a per-instance property, so it needs a per-instance
 * list, not a moment. Runs against the *instrumented* Hieroglyphs.drawGlyph, so it reports what
 * the build really drew rather than a re-derivation of it.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/Demo';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 19000 + (process.pid % 900);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const names = process.argv.slice(2);
for (const recipeName of names) {
  const got = await page.evaluate(async (recipeName) => {
    const M = await import('/src/textures/Materials.js');
    const C = await import('/src/textures/Canvas2D.js');
    const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
    const recipe = M.MATERIALS[recipeName];
    if (!recipe) return { error: 'no recipe ' + recipeName };
    const sz = 512;
    globalThis.__GLYPHLOG = [];
    const s = new C.Surface(sz, (recipe.seed ?? hashName(recipeName)) >>> 0);
    recipe.build(s, { seed: s.seed, size: sz, name: recipeName, quality: 'high' });
    return { sz, log: globalThis.__GLYPHLOG, tile: recipe.tile };
  }, recipeName);
  if (got.error) { console.error(got.error); continue; }

  /* One draw per sign per pass (cut/line/paint); collapse to unique placements. */
  const seen = new Map();
  for (const g of got.log) {
    const key = `${g.name}|${Math.round(g.x)}|${Math.round(g.y)}`;
    if (!seen.has(key)) seen.set(key, g);
  }
  const all = [...seen.values()];
  console.log(`\n=== ${recipeName}  tile=${JSON.stringify(got.tile)}  size=${got.sz}  ${all.length} sign placements/repeat`);

  const by = new Map();
  for (const g of all) {
    const e = by.get(g.name) || { n: 0, area: 0, maxA: 0, paint: g.paint, xs: [] };
    const a = Math.abs(g.w * g.h);
    e.n++; e.area += a; e.maxA = Math.max(e.maxA, a); e.xs.push(Math.round(g.x));
    by.set(g.name, e);
  }
  const rows = [...by.entries()].map(([name, e]) => ({
    name, n: e.n, maxA: e.maxA,
    px: Math.round(Math.sqrt(e.maxA)),
    paint: e.paint === null ? 'ochre' : '#' + e.paint.toString(16).padStart(6, '0'),
    xs: e.xs.sort((a, b) => a - b),
  })).sort((a, b) => (a.n - b.n) || (b.maxA - a.maxA));
  console.log(' count  sign        largest(px)  paint      U positions (tile px)');
  for (const r of rows) {
    console.log(`  ${String(r.n).padStart(3)}   ${r.name.padEnd(10)}  ${String(r.px).padStart(6)}      ${r.paint.padEnd(9)}  ${r.xs.slice(0, 12).join(' ')}`);
  }
  /* The landmark test: signs occurring once or twice in the repeat, ranked by drawn area. */
  const rare = rows.filter((r) => r.n <= 2).sort((a, b) => b.maxA - a.maxA);
  const med = rows.map((r) => r.maxA).sort((a, b) => a - b)[Math.floor(rows.length / 2)] || 1;
  console.log(` rarest-and-largest (n<=2), area vs median sign area ${Math.round(med)} px^2:`);
  for (const r of rare.slice(0, 6)) console.log(`   ${r.name.padEnd(10)} n=${r.n}  ${Math.round(r.maxA)} px^2  = ${(r.maxA / med).toFixed(2)}x median  ${r.paint}`);
}
await browser.close(); server.close();
