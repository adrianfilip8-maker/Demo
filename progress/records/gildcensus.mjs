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
  /**
   * `quadrat`'s branches and the `(maxH, maxW)` each passes to `pick()`, **parsed out of the
   * shipped source** rather than transcribed into a table here.
   *
   * The transcribed version is exactly §13's own failure shape: a hand-copied constant that stays
   * plausible after the thing it describes has moved, so the probe keeps printing a clean audit
   * of a `quadrat` that no longer exists. Parsing means a `quadrat` edit either changes this
   * table with it or throws — and throwing is the outcome §13 says to prefer over a plausible
   * wrong answer. `pick`'s defaults are in its own signature and are read from there too.
   */
  const src = await (await fetch('/src/textures/Hieroglyphs.js')).text();
  const body = (() => {
    const i = src.indexOf('export function quadrat(');
    if (i < 0) throw new Error('gildcensus: quadrat() not found in Hieroglyphs.js');
    const j = src.indexOf('\n}', i);
    return src.slice(i, j);
  })();
  const defW = (() => {
    const m = /function pick\(rand, pool, maxH, maxW = ([\d.]+)\)/.exec(src);
    if (!m) throw new Error('gildcensus: pick() signature not found — its default maxW cannot be read');
    return parseFloat(m[1]);
  })();
  /* Segment the body at its own branch keywords, so the terminal `else` is a segment of its own
     rather than having its pick() folded into the branch above it. */
  const marks = [];
  for (const m of body.matchAll(/\br\s*<\s*([\d.]+)/g)) marks.push({ i: m.index, thr: parseFloat(m[1]) });
  for (const m of body.matchAll(/\}\s*else\s*\{/g)) marks.push({ i: m.index, thr: null });
  marks.sort((a, b) => a.i - b.i);
  const BRANCH = [];
  let prev = 0;
  for (let s = 0; s < marks.length; s++) {
    const seg = body.slice(marks[s].i, s + 1 < marks.length ? marks[s + 1].i : body.length);
    const slots = [...seg.matchAll(/pick\(\s*rand,\s*pool,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/g)]
      .map((m) => [parseFloat(m[1]), m[2] === undefined ? defW : parseFloat(m[2])]);
    const p = marks[s].thr === null ? 1 - prev : marks[s].thr - prev;
    if (marks[s].thr !== null) prev = marks[s].thr;
    /* A pick() inside a loop is ONE textual site and several draws. The parse counts sites, so
       flag the branch rather than pretend the two are the same number. */
    BRANCH.push({ p, slots, loop: /\bfor\s*\(/.test(seg) });
  }
  const tot = BRANCH.reduce((t, b) => t + b.p, 0);
  if (!BRANCH.length || !BRANCH.every((b) => b.slots.length) || Math.abs(tot - 1) > 1e-9) {
    throw new Error(`gildcensus: quadrat() parse failed — ${BRANCH.length} branches, ` +
      `slots [${BRANCH.map((b) => b.slots.length).join(',')}], p sums to ${tot.toFixed(4)}`);
  }
  const branches = BRANCH.map((b) => ({ p: +b.p.toFixed(4), slots: b.slots, loop: b.loop }));
  const out = {};
  for (const pool of ['royal', 'divine', 'offering']) {
    const P = H.POOLS[pool];
    const rows = [];
    for (const b of BRANCH) {
      for (const [maxH, maxW] of b.slots) {
        const ok = P.filter((n) => H.GLYPHS[n] && H.GLYPHS[n].h <= maxH + 0.02 && H.GLYPHS[n].w <= maxW);
        rows.push({ maxH, maxW, pBranch: b.p, loop: b.loop, n: ok.length, ok });
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
  return { out, full, branches };
});

console.log('=== quadrat() branch table, PARSED from Hieroglyphs.js (not transcribed)');
console.log('  ' + audit.branches.map((b) => `p(branch)=${b.p} [${b.slots.map((s) => s.join('/')).join(' ')}]${b.loop ? '  (site is inside a loop: 1 site, several draws)' : ''}`).join('\n  '));
console.log('\n=== pick() filter width per quadrat pick() SITE (a site with 1 candidate is a §13 degeneracy)');
for (const pool of Object.keys(audit.out)) {
  const rows = audit.out[pool];
  const worst = Math.min(...rows.map((r) => r.n));
  console.log(`  POOLS.${pool}  ${rows.length} pick() sites, min candidates = ${worst}${worst <= 2 ? '   <-- DEGENERATE' : ''}`);
  for (const r of rows) console.log(`    maxH ${String(r.maxH).padEnd(5)} maxW ${String(r.maxW).padEnd(4)} p(branch)=${r.pBranch.toFixed(3)}${r.loop ? '*' : ' '}  ${String(r.n).padStart(2)} candidates  ${r.ok.slice(0, 10).join(' ')}`);
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
    const HG = await import('/src/textures/Hieroglyphs.js');
    const hasD = {};
    for (const n of Object.keys(HG.GLYPHS)) hasD[n] = !!HG.GLYPHS[n].d;
    return { sz, log: globalThis.__GLYPHLOG, tile: recipe.tile, tier: recipe.tier, h: Array.from(s.h), hasD };
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
    /* Tile-UV boxes for the top landmarks, in the form `gilduv.mjs --landmark` takes, so the
       in-frame recurrence count is measured against the box this census actually found rather
       than one re-derived by hand. A row box wraps the seam, so v0 > v1 there. */
    for (const r of rare.slice(0, 3)) {
      const inst = list.filter((g) => g.name === r.name).sort((a, b) => b.area - a.area)[0];
      const v0 = ((inst.v0 % 1) + 1) % 1, v1 = ((inst.v1 % 1) + 1) % 1;
      console.log(`    --landmark ${r.name}-${gname}:${(inst.u0).toFixed(4)},${(inst.u1).toFixed(4)},${v0.toFixed(4)},${v1.toFixed(4)}`);
    }
  }

  /**
   * Does a logged sign leave a mark in the RELIEF? — **register-dependent, and only the seam row
   * is affected. Read this table with `gildsil.mjs`, which is the authority.**
   *
   * `glyphArchitrave` fills the seam band white in `'cut'` mode *before* calling `rowRegister`,
   * so in THAT register a sign's silhouette adds nothing — it is already inside the cut — and the
   * only pass that can still incise it is `'line'`, which `drawGlyph` skips entirely for any
   * glyph with no interior-detail `d()`. The mid-tile frieze a few lines below has **no such
   * fill**, so there its silhouettes *are* the cut mask and `d()` decides nothing.
   *
   * `gildsil.mjs` settles it bit-exactly by neutralising the silhouette path and rebuilding:
   * with silhouettes off the seam row moves **8.50e-6** and the frieze **4.63e-2**, a factor of
   * 5454. So `d()` predicts relief contribution in the row and predicts nothing in the frieze.
   *
   * The spread column below is kept because it is what first pointed here, but it is NOT the
   * evidence: p2..p98 inside a sign's box also contains the sunk-panel bevel and the ashlar
   * joints, so it separates the two populations by only 1.4x where the bit-exact A/B separates
   * them by 5454x. A confounded statistic that points the right way is still not proof.
   */
  const Hf = Float64Array.from(got.h);
  const spread = (x0, y0, x1, y1) => {
    const a = [];
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        /* Canvas y -> surface row (rasterMask flips on readback), both wrapped. */
        const sy = (((sz - 1 - y) % sz) + sz) % sz, sx = ((x % sz) + sz) % sz;
        a.push(Hf[sy * sz + sx]);
      }
    }
    if (a.length < 8) return NaN;
    a.sort((p, q) => p - q);
    return a[Math.floor(a.length * 0.98)] - a[Math.floor(a.length * 0.02)];
  };
  console.log('\n--- does each sign leave a mark in the HEIGHT field? (p2..p98 spread inside its box)');
  for (const [gname, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const withD = [], without = [];
    for (const g of list) {
      const sp = spread(g.x, g.y, g.x + g.w, g.y + g.h);
      if (!isFinite(sp)) continue;
      (got.hasD[g.name] ? withD : without).push({ n: g.name, s: sp });
    }
    const med = (a) => (a.length ? a.map((e) => e.s).sort((p, q) => p - q)[a.length >> 1] : NaN);
    const ys = list.map((g) => g.y), hs = list.map((g) => g.h);
    const bandSpread = spread(0, Math.min(...ys), sz, Math.max(...ys.map((y, i) => y + hs[i])));
    /* Only the seam row is cut-filled, so only there does a missing d() silence a sign. */
    const filled = gname === 'row';
    console.log(`  ${gname.padEnd(7)} whole-band spread ${bandSpread.toFixed(4)}` +
      `   signs WITH d(): n=${withD.length} median ${med(withD).toFixed(4)}` +
      `   WITHOUT d(): n=${without.length} median ${med(without).toFixed(4)}`);
    if (without.length) {
      console.log(filled
        ? `          band is cut-filled, so these ${without.length} of ${withD.length + without.length} placements reach the relief ONLY as nothing: ${[...new Set(without.map((e) => e.n))].join(' ')}`
        : `          band is NOT cut-filled, so these still carve as silhouettes (d() irrelevant here): ${[...new Set(without.map((e) => e.n))].join(' ')}`);
    }
  }

  /**
   * Does a sign box [v0, v1] intersect the consumer's V window [-half, +half] around the seam?
   * V wraps, so the window is [0, half] u [1 - half, 1] and a box may sit at any integer offset
   * (`glyphArchitrave` draws the row at y0 = -half, i.e. v1 > 1). Test all three shifts.
   *
   * This is the box-overlap test the "frieze?" column claims. A first version of this probe
   * computed it, then printed a coarser V-band constant instead and left the careful expression
   * dead — the §39/§43/§50 shape, a column header promising a test the code did not run. Both
   * are printed now, side by side, so a disagreement is visible rather than resolved silently.
   */
  const overlapsWindow = (v0, v1, half) => {
    for (const sh of [-1, 0, 1]) if (v0 + sh <= half && v1 + sh >= -half) return true;
    return false;
  };
  const friezeV = groups.frieze.length
    ? [Math.min(...groups.frieze.map((g) => g.v0)), Math.max(...groups.frieze.map((g) => g.v1))]
    : [NaN, NaN];
  console.log(`\n--- which register each real consumer can see (V window from local-y box projection)`);
  console.log(`    frieze register spans V ${friezeV[0].toFixed(4)}..${friezeV[1].toFixed(4)}`);
  console.log('  consumer                          h(m)   V window   row?  frieze(box)  frieze(band)');
  for (const [nm, h, zone] of CONSUMERS) {
    const half = h / (2 * worldTile);
    const seesRow = groups.row.some((g) => overlapsWindow(g.v0, g.v1, half));
    /* The test the column names: does any frieze sign's own box reach the window? */
    const seesFri = groups.frieze.some((g) => overlapsWindow(g.v0, g.v1, half));
    /* The coarser rule, kept as a cross-check: does the window reach the frieze's near edge? */
    const friBand = half >= 0.5 - (0.5 - friezeV[0]);
    console.log(`  ${(nm + ' [' + zone + ']').padEnd(34)}${h.toFixed(2).padStart(5)}   +/-${half.toFixed(3)}   ${seesRow ? 'yes ' : 'NO  '}     ${seesFri ? 'yes' : 'NO '}` +
      `          ${friBand ? 'yes' : 'NO'}${seesFri !== friBand ? '   <-- TESTS DISAGREE' : ''}`);
  }
}
await browser.close(); server.close();
