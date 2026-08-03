/**
 * relieflab — does a carved recipe carry *relief* the frame can use, and at what scale?
 *
 * SCOPE — the transforms between this and the rendered frame, i.e. what it does NOT do:
 *   no lighting model, no shadow map, no cel quantiser, no AgX/grade, no ink pass, no mip
 *   filtering by the GPU (it box-downsamples instead), no geometry, no consumer UV check
 *   beyond the ×2 architecture factor. It measures the *authored Surface + derive()* only.
 *   A number here is a statement about the texture, never about the frame.
 *
 * Classes are taken from the height field itself (cut floors are the deep excursions relative
 * to a 12-texel local mean), so it needs no access to the private layout masks.
 *
 *   node relieflab.mjs name1,name2 [--size 1024]
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = (process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root')+1] : '/home/user/Demo');
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? true) : d; };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 5911 + (process.pid % 200);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);
const names = String(process.argv[2] || 'hieroglyph_wall').split(',');
const size = parseInt(opt('size', '1024'), 10);
const out = await page.evaluate(async ({ names, size }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const N = await import('/src/textures/NormalMap.js');
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const pct = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
  const rows = [];
  for (const name of names) {
    const r = M.MATERIALS[name]; if (!r) { rows.push({ name, err: 'missing' }); continue; }
    const sz = r.size ? Math.min(r.size, size) : (r.tier >= 1 ? Math.max(256, size >> 1) : size);
    const s = new C.Surface(sz, (r.seed ?? hash(name)) >>> 0);
    const log = []; globalThis.__GLYPHLOG = log;
    r.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    globalThis.__GLYPHLOG = null;
    const d = N.derive(s, { bump: r.bump ?? 0.03, tile: r.tile ?? 2, normalScale: r.normalScale ?? 1, aoStrength: r.aoStrength ?? 1, aoFloor: r.aoFloor ?? 0.16, micro: r.micro ?? 0.1, ormDiv: r.ormDiv ?? 2, smoothH: r.smoothH ?? 0, microSoft: r.microSoft ?? 0.35 });
    const n = sz * sz;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = (d.albedo[i * 4] * 0.2126 + d.albedo[i * 4 + 1] * 0.7152 + d.albedo[i * 4 + 2] * 0.0722) / 255;
    const tilt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const nx = (d.normal[i * 4] / 255) * 2 - 1, ny = (d.normal[i * 4 + 1] / 255) * 2 - 1, nz = (d.normal[i * 4 + 2] / 255) * 2 - 1;
      tilt[i] = Math.acos(Math.max(-1, Math.min(1, nz / (Math.hypot(nx, ny, nz) || 1)))) * 180 / Math.PI;
    }
    const os = d.orm.size; const ao = new Float32Array(os * os);
    for (let i = 0; i < os * os; i++) ao[i] = d.orm.data[i * 4] / 255;
    const aoAt = (i) => { const x = i % sz, y = (i / sz) | 0; const k = ((y * os / sz) | 0) * os + ((x * os / sz) | 0); return ao[k]; };
    const h = s.h;
    const hb = C.blurWrap(h, sz, Math.max(2, Math.round(12 * sz / 1024)), 2);
    const rel = new Float32Array(n); for (let i = 0; i < n; i++) rel[i] = h[i] - hb[i];
    const relS = Float32Array.from(rel).sort();
    const loT = pct(relS, 0.06), hiT = pct(relS, 0.94);
    const cls = new Uint8Array(n); // 0 face, 1 floor(cut), 2 arris(raised)
    for (let i = 0; i < n; i++) cls[i] = rel[i] < loT ? 1 : rel[i] > hiT ? 2 : 0;
    const stat = (sel) => { const a = []; for (let i = 0; i < n; i++) if (cls[i] === sel) a.push(i); const g = (f) => { const v = a.map(f).sort((x, y) => x - y); return [pct(v, 0.5), v.reduce((p, c) => p + c, 0) / v.length]; };
      return { n: a.length, luma: +g((i) => lum[i])[1].toFixed(4), ao: +g(aoAt)[1].toFixed(4), tilt: +g((i) => tilt[i])[1].toFixed(2), h: +g((i) => h[i])[1].toFixed(4) }; };
    // downsample luma to framing scales and re-measure floor-vs-face contrast
    const down = (f) => { const w = Math.max(4, Math.round(sz / f)); const o = new Float32Array(w * w), cn = new Float32Array(w * w);
      for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) { const k = ((y * w / sz) | 0) * w + ((x * w / sz) | 0); o[k] += lum[y * sz + x]; cn[k]++; }
      for (let i = 0; i < o.length; i++) o[i] /= cn[i]; let m = 0, m2 = 0; for (let i = 0; i < o.length; i++) { m += o[i]; m2 += o[i] * o[i]; } m /= o.length;
      return +Math.sqrt(Math.max(0, m2 / o.length - m * m)).toFixed(4); };
    const glyphSizes = log.filter((g) => g.mode === 'cut').map((g) => g.h);
    rows.push({ name, sz, worldTile: (Array.isArray(r.tile) ? r.tile[0] : r.tile) * 2, mmPerTexel: +((Array.isArray(r.tile) ? r.tile[0] : r.tile) * 2 / sz * 1000).toFixed(2),
      bump: r.bump, face: stat(0), floor: stat(1), arris: stat(2),
      lumaRmsAt: { t1: down(1), t2: down(2), t3: down(3), t4: down(4), t6: down(6) },
      glyphs: glyphSizes.length, glyphHpx: glyphSizes.length ? [Math.min(...glyphSizes), Math.max(...glyphSizes)].map((v) => +v.toFixed(1)) : null });
  }
  return rows;
}, { names, size });
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();
