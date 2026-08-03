/**
 * gildsil — does a hieroglyph's SILHOUETTE reach the built texture at all?
 *
 * The claim under test, arrived at by reading `glyphArchitrave` and then observed in three
 * targeted relief crops: on `hieroglyph_gilded` the band is filled solid in `'cut'` mode before
 * the register is drawn, so a sign's silhouette adds nothing to the cut mask; the recipe builds
 * no `'paint'` pass at all; and `drawGlyph` returns immediately in `'line'` mode for any glyph
 * with no interior-detail `d()`. If all three hold, a sign's outline has **no route** to the
 * surface and only the 5-of-21 signs carrying a `d()` leave anything, as a few strokes.
 *
 * Reading three functions is not evidence that they behave that way — this file's §7 and §11
 * record what that costs. So: neutralise every glyph's silhouette function `s()` in the lab, in
 * memory, rebuild, and hash the Surface. **If the hash is unchanged, no silhouette reached the
 * texture.** That is a bit-exact A/B, it needs no `src/` edit and no capture lock, and it fails
 * loudly on the control — `hieroglyph_wall`, whose registers ARE its cut mask.
 *
 * The `d()` arm is the same test on the interior-detail path, and separates "nothing gets
 * through" from "only the strokes get through".
 *
 * SCOPE — the suffix NOT implemented (§11): this compares built Surfaces (albedo, height,
 * roughness, metal, occlusion), not frames. It says what is in the texture, never what is
 * visible. Nothing here involves lighting, mips, or a camera.
 *
 *   node progress/records/gildsil.mjs [recipe ...] [--size 1024]
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/Demo';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SHIPPED = parseInt(opt('size', '1024'), 10);
const names = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--size');
if (!names.length) names.push('hieroglyph_gilded', 'hieroglyph_wall', 'column_papyrus', 'relief_figures');

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 19500 + (process.pid % 300);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const rows = await page.evaluate(async ({ names, SHIPPED }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const HG = await import('/src/textures/Hieroglyphs.js');
  const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

  const build = (name) => {
    const recipe = M.MATERIALS[name];
    const sz = recipe.tier >= 1 ? Math.max(256, SHIPPED >> 1) : SHIPPED;   // Textures.js:195
    const s = new C.Surface(sz, (recipe.seed ?? hashName(name)) >>> 0);
    recipe.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    return s;
  };
  /* FNV-1a over every channel the recipe can write, quantised to 1/4096 so float noise in an
     identical computation cannot masquerade as a difference. */
  const hash = (s) => {
    let h = 0x811c9dc5;
    for (const buf of [s.r, s.g, s.b, s.h, s.rough, s.metal, s.occ]) {
      for (let i = 0; i < buf.length; i++) {
        const q = Math.round(buf[i] * 4096) | 0;
        h ^= q & 255; h = Math.imul(h, 0x01000193);
        h ^= (q >> 8) & 255; h = Math.imul(h, 0x01000193);
      }
    }
    return (h >>> 0).toString(16);
  };
  /* Mean absolute difference per channel, so a null is reported as a magnitude and not only as a
     hash mismatch. */
  const diff = (a, b, vlo, vhi) => {
    const sz = a.size;
    let acc = 0, n = 0, mx = 0;
    const rowIn = (y) => {
      if (vlo === undefined) return true;
      const v = y / sz;
      return vlo <= vhi ? (v >= vlo && v <= vhi) : (v >= vlo || v <= vhi);
    };
    for (const k of ['r', 'g', 'b', 'h']) {
      for (let y = 0; y < sz; y++) {
        if (!rowIn(y)) continue;
        for (let x = 0; x < sz; x++) {
          const i = y * sz + x;
          const d = Math.abs(a[k][i] - b[k][i]); acc += d; if (d > mx) mx = d; n++;
        }
      }
    }
    return { mean: n ? acc / n : 0, max: mx, n };
  };
  /* The two registers `glyphArchitrave` draws, so the diff can be attributed to one of them
     rather than reported as a single number over a tile that treats them differently. */
  const ROW = [0.9336, 0.0664], FRIEZE = [0.4635, 0.5365];

  const S0 = Object.fromEntries(Object.keys(HG.GLYPHS).map((n) => [n, HG.GLYPHS[n].s]));
  const D0 = Object.fromEntries(Object.keys(HG.GLYPHS).map((n) => [n, HG.GLYPHS[n].d]));
  const out = [];
  for (const name of names) {
    if (!M.MATERIALS[name]) { out.push({ name, error: 'no recipe' }); continue; }
    const base = build(name);
    const hBase = hash(base);

    /* Arm 1 — every sign silhouette neutralised. */
    for (const n of Object.keys(HG.GLYPHS)) HG.GLYPHS[n].s = () => {};
    const noSil = build(name);
    for (const n of Object.keys(HG.GLYPHS)) HG.GLYPHS[n].s = S0[n];

    /* Arm 2 — every interior-detail path neutralised. */
    for (const n of Object.keys(HG.GLYPHS)) HG.GLYPHS[n].d = undefined;
    const noDet = build(name);
    for (const n of Object.keys(HG.GLYPHS)) HG.GLYPHS[n].d = D0[n];

    /* Control — rebuild untouched, to show the harness itself is bit-stable. */
    const again = build(name);

    out.push({
      name, size: base.size,
      ctl: { same: hash(again) === hBase, ...diff(base, again) },
      sil: { same: hash(noSil) === hBase, ...diff(base, noSil) },
      det: { same: hash(noDet) === hBase, ...diff(base, noDet) },
      silRow: diff(base, noSil, ROW[0], ROW[1]),
      silFri: diff(base, noSil, FRIEZE[0], FRIEZE[1]),
      detRow: diff(base, noDet, ROW[0], ROW[1]),
      detFri: diff(base, noDet, FRIEZE[0], FRIEZE[1]),
    });
  }
  return out;
}, { names, SHIPPED });
await browser.close(); server.close();

console.log('Does a glyph silhouette / interior detail reach the built Surface?');
console.log('  "same" = the built texture is BIT-IDENTICAL with that drawing path neutralised,');
console.log('  i.e. that path contributes nothing to this recipe.\n');
console.log('recipe                size   rebuild-control      silhouettes off        detail-lines off');
for (const r of rows) {
  if (r.error) { console.log(`${r.name.padEnd(22)}${r.error}`); continue; }
  const f = (o) => `${o.same ? 'IDENTICAL' : 'differs  '} d=${o.mean.toExponential(2)}`;
  console.log(`${r.name.padEnd(22)}${String(r.size).padStart(4)}   ${f(r.ctl)}   ${f(r.sil)}   ${f(r.det)}`);
}
console.log('\nSame diffs restricted to the two registers `glyphArchitrave` draws (whole-tile');
console.log('numbers average the two and hide which one moved). Those two V windows are');
console.log('`hieroglyph_gilded`-specific; for any other recipe they are two arbitrary strips and');
console.log('the ratio means nothing — they are here only to show no other recipe is lopsided:');
console.log('recipe                  silhouettes off: seam row / mid frieze     detail off: row / frieze');
for (const r of rows) {
  if (r.error) continue;
  console.log(`${r.name.padEnd(22)}  ${r.silRow.mean.toExponential(2)} / ${r.silFri.mean.toExponential(2)}` +
    `   ratio ${(r.silFri.mean / Math.max(1e-12, r.silRow.mean)).toFixed(1)}x` +
    `      ${r.detRow.mean.toExponential(2)} / ${r.detFri.mean.toExponential(2)}`);
}
