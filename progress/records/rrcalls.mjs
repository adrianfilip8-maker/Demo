/**
 * rrcalls — which relief primitives each recipe actually CALLS.
 *
 * `reliefreach` drops an arm whose deltas are all zero, on the grounds that the recipe does not
 * use that primitive. That inference is wrong in exactly one case, and it is the case the whole
 * sweep exists to find: a primitive that IS called and contributes nothing is dropped by the same
 * rule, so "absent from the table" means either "not used" or "used and silent" — a probe that
 * cannot distinguish its own two inputs (§11).
 *
 * This counts calls with no diffing at all. Cross the two: a primitive with calls > 0 and no row
 * in the census is SILENT — the pre-`c54e41f` `hieroglyph_gilded` state.
 *
 * SCOPE (§11): counts invocations during `recipe.build()`. Says nothing about what any call drew.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/home/user/Demo';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const HG_PRIMS = ['star5', 'drawGlyph', 'cartouche', 'registerRule', 'columnRule', 'khekerFrieze',
  'paintedBand', 'strideFigure', 'seatedFigure', 'falconHeaded', 'offeringTable', 'quadrat',
  'rowRegister', 'columnRegister'];
const C_PRIMS = ['chiselMarks', 'pitting', 'speckle', 'grain', 'weather', 'brushwork',
  'paintRemnants', 'flowStreaks', 'rampFloor', 'masonry'];
const mk = (prims) => `
{
  const __o = { ${prims.join(', ')} };
${prims.map((k) => `  ${k} = function (...a) { (globalThis.__CALLS ||= {}); globalThis.__CALLS['${k}'] = (globalThis.__CALLS['${k}'] || 0) + 1; return __o.${k}(...a); };`).join('\n')}
}
`;
const M_PATCH = `
{
  const __a = ashlar, __c = carve, __f = freshCutTint;
  ashlar = function (...x) { (globalThis.__CALLS ||= {}); globalThis.__CALLS.ashlar = (globalThis.__CALLS.ashlar || 0) + 1; return __a(...x); };
  carve = function (...x) { (globalThis.__CALLS ||= {}); globalThis.__CALLS.carve = (globalThis.__CALLS.carve || 0) + 1; return __c(...x); };
  freshCutTint = function (...x) { (globalThis.__CALLS ||= {}); globalThis.__CALLS.freshCutTint = (globalThis.__CALLS.freshCutTint || 0) + 1; return __f(...x); };
}
`;
const PATCH = { '/src/textures/Hieroglyphs.js': mk(HG_PRIMS), '/src/textures/Canvas2D.js': mk(C_PRIMS), '/src/textures/Materials.js': M_PATCH };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (PATCH[u]) body = Buffer.concat([body, Buffer.from(PATCH[u])]);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(body);
});
const port = 24900 + (process.pid % 300);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);
const rows = await page.evaluate(async () => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const SIZE = 1024;
  const out = {};
  for (const name of Object.keys(M.MATERIALS).filter((k) => ['stone', 'carved'].includes(M.MATERIALS[k].group))) {
    const r = M.MATERIALS[name];
    const sz = r.size ? Math.min(r.size, SIZE) : (r.tier >= 1 ? Math.max(256, SIZE >> 1) : SIZE);
    globalThis.__CALLS = {};
    const s = new C.Surface(sz, (r.seed ?? hashName(name)) >>> 0);
    r.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    out[name] = globalThis.__CALLS;
  }
  return out;
});
await browser.close(); server.close();
console.log(JSON.stringify(rows, null, 1));
