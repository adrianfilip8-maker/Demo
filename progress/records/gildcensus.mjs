/**
 * gildcensus — the per-instance sign list for `hieroglyph_gilded`, split by REGISTER and by the
 * tile-V band each consumer actually samples, plus a `pick()` degeneracy audit.
 *
 * Why this and not `tools/census.mjs`. That tool answers "what signs are in the tile", which is
 * the right question for a wall recipe whose consumers span a whole repeat. Every consumer of
 * `hieroglyph_gilded` is a horizontal band (see `glyphArchitrave`'s note): `Kit.beam`/`Kit.cornice`
 * box-project UVs in LOCAL space about y = 0, so a beam of height h samples only
 * `V = +/- h / (2 * worldTile)` — a window centred on the tile seam. The recipe draws its royal
 * row twice so it wraps that seam, and ALSO draws a secondary `divine` frieze at mid-tile V ~ 0.5
 * for the one wall-shaped consumer. `census.mjs` pools all three into one ranking, so a landmark
 * in the mid-tile frieze and a landmark in the row are indistinguishable in its output — and only
 * one of them is on an architrave.
 *
 * SCOPE — the transforms between what this computes and what the renderer draws, i.e. the suffix
 * NOT implemented (KNOWN_ISSUES §11):
 *   - It records `drawGlyph` CALLS. It does not know what survives `carve`, the gild mask, the
 *     paint-remnant wear field, or the ramp — a sign logged here can be almost invisible in the
 *     built albedo. Use `gilduv.mjs` / a render for that.
 *   - Sign box size, not inked area. A `sun` disc and a `sky` bar with the same box are the same
 *     number here and very different marks.
 *   - No lighting, no mips, no camera. Tile pixels only; nothing here is a screen size.
 *   - Consumer V windows are computed from the `Kit.beam`/`Kit.cornice` local-y rule stated in
 *     `glyphArchitrave`'s note, NOT read off built geometry. `gilduv.mjs` measures the real thing.
 *
 *   node progress/records/gildcensus.mjs [recipe ...] [--size 1024]
 *
 * `--size` is the engine's `texSize` (Textures.js:195: tier 0 builds at size, tier >= 1 at
 * max(256, size >> 1)). 1024 = shipping `high`. The lab default of 512 builds tier-1 recipes at
 * 256 and is NOT what ships.
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
const names = argv.filter((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--size');
if (!names.length) names.push('hieroglyph_gilded');

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 19900 + (process.pid % 90);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

/* ── the pool/branch degeneracy audit, run in-page so it reads the shipped GLYPHS/POOLS ── */
const audit = await page.evaluate(async () => {
  const H = await import('/src/textures/Hieroglyphs.js');
  /* `quadrat`'s five branches, with the (maxH, maxW) each passes to `pick()` and the branch
     probability from its own `r` thresholds. Read off `quadrat` source; if that changes this
     table is stale and must be re-read. */
  const BRANCH = [
    { p: 0.34, slots: [[1.01, 1.0]] },
    { p: 0.24, slots: [[0.5, 2], [0.5, 2]] },
    { p: 0.14, slots: [[0.36, 2], [0.36, 2], [0.36, 2]] },
    { p: 0.16, slots: [[1.01, 0.7], [0.5, 2], [0.5, 2]] },
    { p: 0.12, slots: [[0.4, 1.3]] },
  ];
  const out = {};
  for (const pool of ['royal', 'divine', 'offering']) {
    const P = H.POOLS[pool];
    const rows = [];
    for (const b of BRANCH) {
      for (const [maxH, maxW] of b.slots) {
        const ok = P.filter((n) => H.GLYPHS[n] && H.GLYPHS[n].h <= maxH + 0.02 && H.GLYPHS[n].w <= maxW);
        rows.push({ maxH, maxW, p: b.p / b.slots.length, n: ok.length, ok });
      }
    }
    out[pool] = rows;
  }
  /* Which pool members can reach the r<0.34 "one tall sign fills the quadrat" branch, i.e. can be
     drawn at FULL quadrat size — the only way a sign gets to be a large mark. */
  const full = {};
  for (const pool of ['royal', 'divine']) {
    full[pool] = H.POOLS[pool].filter((n) => H.GLYPHS[n] && H.GLYPHS[n].h <= 1.03 && H.GLYPHS[n].w <= 1.0)
      .map((n) => ({ n, w: H.GLYPHS[n].w, h: H.GLYPHS[n].h, area: +(H.GLYPHS[n].w * H.GLYPHS[n].h).toFixed(3) }))
      .sort((a, b) => b.area - a.area);
  }
  return { out, full };
});

console.log('=== pick() filter width per quadrat branch (a branch with 1 candidate is a §13 degeneracy)');
for (const pool of Object.keys(audit.out)) {
  const rows = audit.out[pool];
  const worst = Math.min(...rows.map((r) => r.n));
  console.log(`  POOLS.${pool}  pool ${rows.length} slots, min candidates = ${worst}${worst <= 2 ? '   <-- DEGENERATE' : ''}`);
  for (const r of rows) console.log(`    maxH ${String(r.maxH).padEnd(5)} maxW ${String(r.maxW).padEnd(4)} p=${r.p.toFixed(3)}  ${String(r.n).padStart(2)} candidates  ${r.ok.slice(0, 10).join(' ')}`);
}
console.log('\n=== signs that can be drawn at FULL quadrat size (branch r<0.34), by glyph-box area');
for (const pool of Object.keys(audit.full)) {
  console.log(`  POOLS.${pool}: ` + audit.full[pool].map((g) => `${g.n} ${g.area}`).join('  '));
}

for (const recipeName of names) {
  const got = await page.evaluate(async ({ recipeName, SHIPPED }) => {
    const M = await import('/src/textures/Materials.js');
    const C = await import('/src/textures/Canvas2D.js');
    const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
    const recipe = M.MATERIALS[recipeName];
    if (!recipe) return { error: 'no recipe ' + recipeName };
    /* Textures.js:195 — the size the game actually builds this recipe at. */
    const sz = recipe.tier >= 1 ? Math.max(256, SHIPPED >> 1) : SHIPPED;
    globalThis.__GLYPHLOG = [];
    const s = new C.Surface(sz, (recipe.seed ?? hashName(recipeName)) >>> 0);
    recipe.build(s, { seed: s.seed, size: sz, name: recipeName, quality: 'high' });
    return { sz, log: globalThis.__GLYPHLOG, tile: recipe.tile, tier: recipe.tier };
  }, { recipeName, SHIPPED });
  if (got.error) { console.error(got.error); continue; }
  const sz = got.sz;

  /* One draw per sign per pass; collapse to unique placements. */
  const seen = new Map();
  for (const g of got.log) {
    const key = `${g.name}|${Math.round(g.x)}|${Math.round(g.y)}`;
    if (!seen.has(key)) seen.set(key, g);
  }
  const all = [...seen.values()];

  /* Canvas y is down and `rasterMask` flips rows on readback, so surface V = 1 - y/size. Each
     placement gets the V band its BOX spans. */
  for (const g of all) {
    g.v1 = 1 - g.y / sz;
    g.v0 = 1 - (g.y + g.h) / sz;
    g.vc = (g.v0 + g.v1) * 0.5;
    g.u0 = g.x / sz; g.u1 = (g.x + g.w) / sz;
    g.area = Math.abs(g.w * g.h);
  }
  const worldTile = (Array.isArray(got.tile) ? got.tile[0] : got.tile) * 2;   // ARCH_UV = 2

  console.log(`\n\n########## ${recipeName}   tile ${got.tile} (world ${worldTile} m)  tier ${got.tier}  built ${sz}px  ${all.length} placements/repeat`);

  /* Register attribution by V. The seam row wraps, so |V - 0| or |V - 1| small = row. */
  const seamD = (v) => Math.min(Math.abs(v), Math.abs(1 - v), Math.abs(v - 1));
  const groups = { row: [], frieze: [], other: [] };
  for (const g of all) {
    if (seamD(g.vc) < 0.25) groups.row.push(g);
    else if (Math.abs(g.vc - 0.5) < 0.25) groups.frieze.push(g);
    else groups.other.push(g);
  }

  /* Consumer V windows: `Kit.beam`/`Kit.cornice` box-project in local space about y = 0, so a
     band of height h samples V in +/- h / (2 * worldTile) around the seam. Heights read from the
     twelve `hieroglyph_gilded` call sites in EgyptLevel.js. */
  const CONSUMERS = [
    ['peristyle architrave (hero ledge)', 1.25, 'court'],
    ['courtyard beam z=1.0', 1.70, 'court'],
    ['great gate lintel', 2.60, 'court'],
    ['pylon cornice', 0.86, 'court'],
    ['colossi plinth cornice', 0.22, 'court'],
    ['fallen block (court ruin)', 1.50, 'court'],
    ['hall doorway lintel', 1.50, 'hall'],
    ['nave architrave', 0.80, 'hall'],
    ['hall exterior cornice', 1.30, 'hall'],
    ['pylon beam', 1.40, 'pylon'],
    ['tomb beam', 1.20, 'tomb'],
    ['tomb false door (wall-shaped)', 6.20, 'tomb'],
  ];

  for (const [gname, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const vlo = Math.min(...list.map((g) => seamD(g.vc)));
    const vhi = Math.max(...list.map((g) => seamD(g.vc)));
    console.log(`\n--- register "${gname}"  ${list.length} placements  |V-seam| ${vlo.toFixed(3)}..${vhi.toFixed(3)}`);
    const by = new Map();
    for (const g of list) {
      const e = by.get(g.name) || { n: 0, maxA: 0, paint: g.paint, us: [] };
      e.n++; e.maxA = Math.max(e.maxA, g.area); e.us.push(Math.round(g.x));
      by.set(g.name, e);
    }
    const rows = [...by.entries()].map(([name, e]) => ({
      name, n: e.n, maxA: e.maxA, px: Math.round(Math.sqrt(e.maxA)),
      paint: e.paint === null ? 'ochre' : '#' + e.paint.toString(16).padStart(6, '0'),
      us: [...new Set(e.us)].sort((a, b) => a - b),
    })).sort((a, b) => (a.n - b.n) || (b.maxA - a.maxA));
    const areas = rows.map((r) => r.maxA).sort((a, b) => a - b);
    const med = areas[Math.floor(areas.length / 2)] || 1;
    console.log('  n  sign        box(px)  x/median  paint      unique U (tile px)');
    for (const r of rows) {
      console.log(`  ${String(r.n).padStart(2)}  ${r.name.padEnd(10)}  ${String(r.px).padStart(6)}  ${(r.maxA / med).toFixed(2).padStart(7)}x  ${r.paint.padEnd(9)}  ${r.us.join(' ')}`);
    }
    /* §13's landmark test, restricted to this register: rare AND large. */
    const rare = rows.filter((r) => r.n <= 2).sort((a, b) => b.maxA - a.maxA);
    console.log(`  rarest-and-largest (n<=2) in this register, median box ${Math.round(med)} px^2:`);
    for (const r of rare.slice(0, 5)) console.log(`    ${r.name.padEnd(10)} n=${r.n}  ${Math.round(r.maxA)} px^2 = ${(r.maxA / med).toFixed(2)}x  ${r.paint}`);
  }

  console.log('\n--- which register each real consumer can see (V window from local-y box projection)');
  console.log('  consumer                        h(m)   V window          row?  frieze?');
  for (const [nm, h, zone] of CONSUMERS) {
    const half = h / (2 * worldTile);
    const seesRow = groups.row.some((g) => Math.min(seamD(g.v0), seamD(g.v1), seamD(g.vc)) <= half);
    const seesFri = groups.frieze.some((g) => g.v0 <= 0.5 + half && g.v1 >= 0.5 - half) && half >= 0.5 - 0.5365;
    const friIn = half >= (0.5 - 0.0365);   // the frieze sits at V 0.4635..0.5365
    console.log(`  ${(nm + ' [' + zone + ']').padEnd(32)}${h.toFixed(2).padStart(5)}   +/-${half.toFixed(3)}      ${seesRow ? 'yes ' : 'NO  '}   ${friIn ? 'yes' : 'NO'}`);
  }
}
await browser.close(); server.close();
