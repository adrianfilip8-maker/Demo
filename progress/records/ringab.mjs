/**
 * ringab — A/B two texture roots on the SAME recipe and describe where they differ.
 *
 * SCOPE — no lighting, no cel ramp, no grade, no mip chain, no geometry. It compares two built
 * albedos texel for texel and characterises the difference set: how many texels, how strong,
 * how wide the connected runs are (in texels, and converted to mm and to px at a supplied
 * mm/px). It says nothing about whether the frame shows it.
 */
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [nameArg, rootA, rootB] = process.argv.slice(2);
const size = parseInt(process.argv.includes('--size') ? process.argv[process.argv.indexOf('--size')+1] : '1024', 10);
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
async function build(root, name) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
    const f = path.join(root, u);
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  const port = 6100 + Math.floor(Math.random() * 400);
  server.on('request',(q)=>{ if(process.env.RDBG) console.error('REQ',q.url); });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/lab.html`);
  const r = await page.evaluate(async ({ name, size }) => {
    const M = await import('/src/textures/Materials.js');
    const C = await import('/src/textures/Canvas2D.js');
    const N = await import('/src/textures/NormalMap.js');
    const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
    const rc = M.MATERIALS[name];
    const sz = rc.size ? Math.min(rc.size, size) : (rc.tier >= 1 ? Math.max(256, size >> 1) : size);
    const s = new C.Surface(sz, (rc.seed ?? hash(name)) >>> 0);
    rc.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    const d = N.derive(s, { bump: rc.bump ?? 0.03, tile: rc.tile ?? 2, normalScale: 1, aoStrength: rc.aoStrength ?? 1, aoFloor: rc.aoFloor ?? 0.16, micro: rc.micro ?? 0.1, ormDiv: rc.ormDiv ?? 2, smoothH: rc.smoothH ?? 0, microSoft: rc.microSoft ?? 0.35 });
    const n = sz * sz, lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = (d.albedo[i*4]*0.2126 + d.albedo[i*4+1]*0.7152 + d.albedo[i*4+2]*0.0722) / 255;
    const tu = Array.isArray(rc.tile) ? rc.tile[0] : rc.tile;
    const toPNG = (w, h, rgb) => { const cv = new OffscreenCanvas(w, h); const cx = cv.getContext('2d'); const img = cx.createImageData(w, h); img.data.set(rgb); cx.putImageData(img, 0, 0); return cv.convertToBlob({ type: 'image/png' }).then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })); };
    const png = await toPNG(sz, sz, d.albedo);
    return { sz, lum: Array.from(lum), rough: Array.from(s.rough), mm: tu * 2 / sz * 1000, png };
  }, { name, size });
  await browser.close(); server.close();
  return r;
}
const A = await build(rootA, nameArg), B = await build(rootB, nameArg);
const pngOut = process.argv.includes('--png') ? process.argv[process.argv.indexOf('--png')+1] : null;
if (pngOut) { fs.writeFileSync(pngOut + '-A.png', Buffer.from(String(A.png).split(',')[1], 'base64')); fs.writeFileSync(pngOut + '-B.png', Buffer.from(String(B.png).split(',')[1], 'base64')); }
const sz = A.sz, n = sz * sz;
let cnt = 0, sum = 0, mx = 0;
const hit = new Uint8Array(n);
for (let i = 0; i < n; i++) { const d = B.lum[i] - A.lum[i]; if (Math.abs(d) > 0.004) { hit[i] = 1; cnt++; sum += d; if (Math.abs(d) > Math.abs(mx)) mx = d; } }
// horizontal run lengths of the difference set
const runs = [];
for (let y = 0; y < sz; y++) { let r = 0; for (let x = 0; x < sz; x++) { if (hit[y*sz+x]) r++; else { if (r) runs.push(r); r = 0; } } if (r) runs.push(r); }
runs.sort((a, b) => a - b);
const p = (q) => runs[Math.min(runs.length-1, Math.round(q*(runs.length-1)))];
// mean luma of the difference set, before and after
let la = 0, lb = 0; for (let i = 0; i < n; i++) if (hit[i]) { la += A.lum[i]; lb += B.lum[i]; }
let fa = 0, fb = 0, fc = 0; for (let i = 0; i < n; i++) if (!hit[i]) { fa += A.lum[i]; fb += B.lum[i]; fc++; }
console.log(JSON.stringify({
  name: nameArg, size: sz, mmPerTexel: +A.mm.toFixed(2),
  changedTexels: cnt, changedPct: +(100*cnt/n).toFixed(2),
  meanDelta: +(sum/Math.max(1,cnt)).toFixed(4), maxDelta: +mx.toFixed(4),
  ringLumaBefore: +(la/Math.max(1,cnt)).toFixed(4), ringLumaAfter: +(lb/Math.max(1,cnt)).toFixed(4),
  fieldLumaBefore: +(fa/fc).toFixed(4), fieldLumaAfter: +(fb/fc).toFixed(4),
  runTexels: { p10: p(0.1), p50: p(0.5), p90: p(0.9) },
  runMm: { p10: +(p(0.1)*A.mm).toFixed(0), p50: +(p(0.5)*A.mm).toFixed(0), p90: +(p(0.9)*A.mm).toFixed(0) },
}, null, 1));
