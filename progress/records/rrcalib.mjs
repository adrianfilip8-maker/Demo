/**
 * rrcalib — runs reliefreach's `sil` arm against a state KNOWN to have the defect.
 *
 * §13's rule: a metric that has never been shown to move on a state known to carry the defect is
 * not evidence about that defect, in either direction. The defect here has such a state for free —
 * `__TEX_AB = 'hgchisel'` restores `hieroglyph_gilded` to its pre-`c54e41f` build bit-exactly,
 * which is the state §125.1 measured at a 5454x row/frieze ratio. So the separation this prints is
 * the instrument's calibration, and it is printed next to every number quoted from the sweep.
 *
 * SCOPE (§11): built Surface + NormalMap.derive() only. No geometry, camera, lighting, mip chain.
 *
 *   node rrcalib.mjs
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
const port = 22600 + (process.pid % 300);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const rows = await page.evaluate(async () => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const HG = await import('/src/textures/Hieroglyphs.js');
  const N = await import('/src/textures/NormalMap.js');
  const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const SIZE = 1024;
  const S0 = Object.fromEntries(Object.keys(HG.GLYPHS).map((n) => [n, HG.GLYPHS[n].s]));

  const build = (name, ab, silOff) => {
    globalThis.__TEX_AB = ab;
    const r = M.MATERIALS[name];
    const sz = r.size ? Math.min(r.size, SIZE) : (r.tier >= 1 ? Math.max(256, SIZE >> 1) : SIZE);
    if (silOff) for (const n of Object.keys(HG.GLYPHS)) HG.GLYPHS[n].s = () => {};
    const s = new C.Surface(sz, (r.seed ?? hashName(name)) >>> 0);
    r.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    for (const n of Object.keys(HG.GLYPHS)) HG.GLYPHS[n].s = S0[n];
    globalThis.__TEX_AB = '';
    const d = N.derive(s, { bump: r.bump ?? 0.03, tile: r.tile ?? 2.0, normalScale: r.normalScale ?? 1.0, aoStrength: r.aoStrength ?? 1.0, aoFloor: r.aoFloor ?? 0.16, micro: r.micro ?? 0.10, ormDiv: r.ormDiv ?? 2, smoothH: r.smoothH ?? 0, microSoft: r.microSoft ?? 0.35 });
    return { s, d, sz };
  };
  const tiltOf = (nrm, n) => { const t = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (nrm[i * 4] / 255) * 2 - 1, y = (nrm[i * 4 + 1] / 255) * 2 - 1, z = (nrm[i * 4 + 2] / 255) * 2 - 1; t[i] = Math.acos(Math.max(-1, Math.min(1, z / (Math.hypot(x, y, z) || 1)))) * 180 / Math.PI; } return t; };
  /* §125's own V windows on this recipe, so the row can be read apart from the frieze. */
  const ROW = [0.9336, 0.0664], FRIEZE = [0.4635, 0.5365];
  const inRow = (y, sz, w) => { const v = y / sz; return w[0] <= w[1] ? (v >= w[0] && v <= w[1]) : (v >= w[0] || v <= w[1]); };

  const out = [];
  for (const [label, ab] of [['SHIPPED (chisel pass on)', ''], ['KNOWN-BAD (hgchisel, pre-c54e41f)', 'hgchisel']]) {
    const base = build('hieroglyph_gilded', ab, false);
    const nos = build('hieroglyph_gilded', ab, true);
    const n = base.sz * base.sz;
    const tB = tiltOf(base.d.normal, n), tN = tiltOf(nos.d.normal, n);
    const acc = { all: [0, 0, 0], row: [0, 0, 0], fri: [0, 0, 0] }, cnt = { all: 0, row: 0, fri: 0 };
    for (let y = 0; y < base.sz; y++) {
      const bucket = inRow(y, base.sz, ROW) ? 'row' : inRow(y, base.sz, FRIEZE) ? 'fri' : null;
      for (let x = 0; x < base.sz; x++) {
        const i = y * base.sz + x;
        const dh = Math.abs(nos.s.h[i] - base.s.h[i]);
        const dt = Math.abs(tN[i] - tB[i]);
        acc.all[0] += dh; acc.all[1] += dt; acc.all[2] += dt > 1 ? 1 : 0; cnt.all++;
        if (bucket) { acc[bucket][0] += dh; acc[bucket][1] += dt; acc[bucket][2] += dt > 1 ? 1 : 0; cnt[bucket]++; }
      }
    }
    out.push({
      label, size: base.sz,
      dH_all: acc.all[0] / cnt.all, dH_row: acc.row[0] / cnt.row, dH_fri: acc.fri[0] / cnt.fri,
      dTilt_row: acc.row[1] / cnt.row, dTilt_fri: acc.fri[1] / cnt.fri,
      tiltFrac1_row: acc.row[2] / cnt.row, tiltFrac1_fri: acc.fri[2] / cnt.fri,
    });
  }
  return out;
}).catch((e) => { console.error(e); return []; });
await browser.close(); server.close();

console.log('Calibration — `sil` arm (every glyph silhouette neutralised) on hieroglyph_gilded.');
console.log('Row = the seam register glyphArchitrave fills solid in cut mode; frieze = the mid-tile');
console.log('register, which has no cut fill and was healthy in both states.\n');
for (const r of rows) {
  console.log(r.label);
  console.log(`   dH   row ${r.dH_row.toExponential(2)}   frieze ${r.dH_fri.toExponential(2)}   ratio frieze/row ${(r.dH_fri / Math.max(1e-12, r.dH_row)).toFixed(1)}x`);
  console.log(`   dTilt row ${r.dTilt_row.toFixed(3)} deg (${(r.tiltFrac1_row * 100).toFixed(1)}% of row texels >1 deg)   frieze ${r.dTilt_fri.toFixed(3)} deg (${(r.tiltFrac1_fri * 100).toFixed(1)}%)`);
}
