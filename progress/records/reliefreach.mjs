/**
 * reliefreach — for every stone/carved recipe: which authored features reach the HEIGHT FIELD,
 * how big are they, and does the relief survive `derive()`?
 *
 * This is `gildsil.mjs` generalised. §125.1 found that `hieroglyph_gilded`'s sign silhouettes
 * contributed nothing to the built texture — a decorative motif that existed in the source and
 * in no channel of the map. That was found by neutralising the drawing path and diffing the
 * built Surface bit-exactly. The same A/B is run here across every relief-authoring primitive
 * in the catalogue, on every recipe that uses one.
 *
 * Three quantities per (recipe, primitive) arm, and the third is the one that decides:
 *
 *   dAlb   mean |Δluma| over the tile           — did it reach the ALBEDO (painted-on)
 *   dH     mean |Δheight| over the tile         — did it reach the HEIGHT FIELD (chiselled)
 *   dTilt  mean |Δnormal tilt| in degrees       — did the relief survive derive()'s microSoft
 *                                                 low-pass and slope knee, i.e. reach the map
 *                                                 the shader actually samples
 *
 * A primitive with dAlb > 0 and dH == 0 is **painted, not carved**. A primitive with both at 0
 * is **silent** — drawn and discarded. `hieroglyph_gilded`'s pre-`c54e41f` state was the second
 * on its seam row while the same primitive was healthy on the control recipe, which is why the
 * per-recipe comparison and not the absolute number is the test.
 *
 * Feature size comes from the Δh field itself — connected components of |Δh| > 1e-4 — so it is
 * the size of the thing whose relief is being tested, not a nominal from the source. Reported in
 * texels and in millimetres of surface (tile × ARCH_UV ÷ size).
 *
 * SCOPE — the transforms between this and the rendered frame, i.e. what it does NOT do (§11):
 *   no geometry, no camera, no consumer UV factor beyond the ARCH_UV = 2 default (four live
 *   exceptions are documented at `Textures.js:37-86` and are a property of the mesh, not the
 *   recipe), no lighting, no shadow map, no cel quantiser, no AgX, no ink pass, no GPU mip
 *   chain or anisotropic filter. It measures the authored Surface and `NormalMap.derive()` and
 *   nothing after them. A millimetre figure here becomes a pixel figure only when crossed with
 *   a framing's mm/px, which comes from a different instrument.
 *
 * The `src/` tree is not modified: the primitives are wrapped by appending to the module source
 * as it is served, and `export function` bindings are mutable inside their own module.
 *
 * **Read `rrcalls.mjs` before concluding anything from a missing row.** This file DROPS an arm
 * whose deltas are all zero, on the grounds that the recipe does not call that primitive — and a
 * primitive that is called and contributes nothing is dropped by the identical rule. So "absent
 * from the table" means either "not used" or "used and silent", which is §11's shape: a probe
 * that cannot distinguish its own two inputs, and the second of those two is the defect the
 * sweep exists to find. `rrcalls.mjs` counts invocations with no diffing; cross the two, and a
 * primitive with calls > 0 and no row here is SILENT.
 *
 * **And read `rrcalib.mjs` before quoting a number.** §13: a metric never shown to move on a
 * state known to carry the defect is not evidence about it. That calibration exists.
 *
 *   node reliefreach.mjs [--size 1024] [--only recipe,recipe]
 *
 * Run at `--size 1024`, which is `texSize` at quality 'high' — what `tools/harness.mjs` captures
 * at. At any other size the tier-1 recipes build at a different resolution and every millimetre
 * figure below is wrong by that ratio.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = '/home/user/Demo';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SIZE = parseInt(opt('size', '1024'), 10);
const ONLY = opt('only', '');

/* Provenance: hash the three files whose behaviour this measures (§125.5 — a tree hash belongs
 * in every instrument that reads the level, not only in capture harnesses). */
const treeHash = crypto.createHash('sha1');
for (const f of ['src/textures/Materials.js', 'src/textures/Canvas2D.js', 'src/textures/Hieroglyphs.js', 'src/textures/NormalMap.js']) {
  treeHash.update(fs.readFileSync(path.join(ROOT, f)));
}
const TREE = treeHash.digest('hex').slice(0, 12);

/* ---- the wrapper appended to Hieroglyphs.js -------------------------------------------- */
/* Every one of these is a `export function` declaration, so the binding is assignable from
 * inside the module and the reassignment is seen through the live namespace import that
 * Materials.js holds. `drawGlyph` consumes no RNG (`pick()` is called by the caller before it),
 * and neither do the figure primitives, so neutralising one leaves the sign-choice stream and
 * every layout decision bit-identical. */
const HG_PRIMS = ['star5', 'drawGlyph', 'cartouche', 'registerRule', 'columnRule',
  'khekerFrieze', 'paintedBand', 'strideFigure', 'seatedFigure', 'falconHeaded', 'offeringTable'];
const HG_PATCH = `
/* ---- appended by reliefreach.mjs, not part of the shipped file ---- */
{
  const __orig = { ${HG_PRIMS.join(', ')} };
  const __off = (k) => { const s = globalThis.__RELIEF_OFF; return !!s && (s === k || (Array.isArray(s) && s.includes(k))); };
${HG_PRIMS.map((k) => `  ${k} = function (...a) { if (__off('${k}')) return; return __orig.${k}(...a); };`).join('\n')}
}
`;

/* ---- the wrapper appended to Canvas2D.js ------------------------------------------------ */
/* Materials.js destructures these at its own module-evaluation time, which happens strictly
 * after Canvas2D.js has finished evaluating, so the wrappers are what it captures. */
const C_PRIMS = ['chiselMarks', 'pitting', 'speckle', 'grain', 'weather', 'brushwork',
  'paintRemnants', 'flowStreaks', 'rampFloor'];
const C_PATCH = `
/* ---- appended by reliefreach.mjs, not part of the shipped file ---- */
{
  const __orig = { ${C_PRIMS.join(', ')} };
  const __off = (k) => { const s = globalThis.__RELIEF_OFF; return !!s && (s === k || (Array.isArray(s) && s.includes(k))); };
${C_PRIMS.map((k) => `  ${k} = function (...a) { if (__off('${k}')) return; return __orig.${k}(...a); };`).join('\n')}
}
`;

/* ---- the wrapper appended to Materials.js ----------------------------------------------- */
/* `ashlar` and `carve` are module-private function declarations; same mutable-binding trick.
 * `ashlar` returns the masonry masks every consumer then reads, so it cannot be neutralised to
 * nothing — it is wrapped to keep its return value while writing no height. */
const M_PATCH = `
/* ---- appended by reliefreach.mjs, not part of the shipped file ---- */
{
  const __ashlar = ashlar, __carve = carve;
  const __off = (k) => { const s = globalThis.__RELIEF_OFF; return !!s && (s === k || (Array.isArray(s) && s.includes(k))); };
  ashlar = function (s, o) {
    if (!__off('ashlarH')) return __ashlar(s, o);
    const h0 = Float32Array.from(s.h);
    const m = __ashlar(s, o);
    s.h.set(h0);                       /* keep the albedo/mask work, discard its relief */
    return m;
  };
  carve = function (s, cut, line, o) {
    if (!__off('carveH')) return __carve(s, cut, line, o);
    const h0 = Float32Array.from(s.h);
    const r = __carve(s, cut, line, o);
    s.h.set(h0);
    return r;
  };
}
`;

const PATCH = {
  '/src/textures/Hieroglyphs.js': HG_PATCH,
  '/src/textures/Canvas2D.js': C_PATCH,
  '/src/textures/Materials.js': M_PATCH,
};

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
const port = 21100 + (process.pid % 400);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const result = await page.evaluate(async ({ SIZE, ONLY }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const HG = await import('/src/textures/Hieroglyphs.js');
  const N = await import('/src/textures/NormalMap.js');
  const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

  const S0 = Object.fromEntries(Object.keys(HG.GLYPHS).map((n) => [n, HG.GLYPHS[n].s]));
  const D0 = Object.fromEntries(Object.keys(HG.GLYPHS).map((n) => [n, HG.GLYPHS[n].d]));

  /* Textures.js:192 — the resolution contract, reproduced so the map measured is the map built. */
  const sizeOf = (r) => (r.size ? Math.min(r.size, SIZE) : (r.tier >= 1 ? Math.max(256, SIZE >> 1) : SIZE));
  /* Textures.js:222 — derive() with the shipped defaults. */
  const deriveOf = (r, s) => N.derive(s, {
    bump: r.bump ?? 0.03, tile: r.tile ?? 2.0, normalScale: r.normalScale ?? 1.0,
    aoStrength: r.aoStrength ?? 1.0, aoFloor: r.aoFloor ?? 0.16, micro: r.micro ?? 0.10,
    ormDiv: r.ormDiv ?? 2, smoothH: r.smoothH ?? 0, microSoft: r.microSoft ?? 0.35,
  });

  const build = (name, arm, glyphArm) => {
    const r = M.MATERIALS[name];
    const sz = sizeOf(r);
    globalThis.__RELIEF_OFF = arm;
    if (glyphArm === 'sil') for (const n of Object.keys(HG.GLYPHS)) HG.GLYPHS[n].s = () => {};
    if (glyphArm === 'det') for (const n of Object.keys(HG.GLYPHS)) HG.GLYPHS[n].d = undefined;
    const log = []; globalThis.__GLYPHLOG = log;
    const s = new C.Surface(sz, (r.seed ?? hashName(name)) >>> 0);
    r.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    globalThis.__GLYPHLOG = null;
    globalThis.__RELIEF_OFF = null;
    for (const n of Object.keys(HG.GLYPHS)) { HG.GLYPHS[n].s = S0[n]; HG.GLYPHS[n].d = D0[n]; }
    return { s, d: deriveOf(r, s), log, sz, r };
  };

  const tiltOf = (nrm, n) => {
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (nrm[i * 4] / 255) * 2 - 1, y = (nrm[i * 4 + 1] / 255) * 2 - 1, z = (nrm[i * 4 + 2] / 255) * 2 - 1;
      t[i] = Math.acos(Math.max(-1, Math.min(1, z / (Math.hypot(x, y, z) || 1)))) * 180 / Math.PI;
    }
    return t;
  };
  const luma = (alb, n) => { const l = new Float32Array(n); for (let i = 0; i < n; i++) l[i] = (alb[i * 4] * 0.2126 + alb[i * 4 + 1] * 0.7152 + alb[i * 4 + 2] * 0.0722) / 255; return l; };

  /* Connected components of the changed-height mask, 4-connected with wraparound, so the size
   * reported is one feature and not a bounding box over two (§125.4's first correction). */
  const components = (mask, sz) => {
    const seen = new Uint8Array(mask.length);
    const stack = new Int32Array(mask.length);
    const areas = [];
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || seen[start]) continue;
      let sp = 0; stack[sp++] = start; seen[start] = 1; let a = 0;
      while (sp > 0) {
        const i = stack[--sp]; a++;
        const x = i % sz, y = (i / sz) | 0;
        const nb = [((x + 1) % sz) + y * sz, ((x - 1 + sz) % sz) + y * sz, x + ((y + 1) % sz) * sz, x + ((y - 1 + sz) % sz) * sz];
        for (const k of nb) if (mask[k] && !seen[k]) { seen[k] = 1; stack[sp++] = k; }
      }
      areas.push(a);
    }
    areas.sort((p, q) => p - q);
    return areas;
  };

  const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))] : 0);

  /* Which primitives each recipe can possibly use — measured, not assumed: an arm that changes
   * nothing on a recipe that never calls the primitive is not a finding, so those are dropped
   * from the report rather than printed as false zeroes. The membership test is the arm itself. */
  const ARMS = [
    ['sil', null, 'sil'], ['det', null, 'det'],
    ['drawGlyph', 'drawGlyph', null],
    ['strideFigure', 'strideFigure', null], ['seatedFigure', 'seatedFigure', null],
    ['falconHeaded', 'falconHeaded', null], ['offeringTable', 'offeringTable', null],
    ['khekerFrieze', 'khekerFrieze', null], ['cartouche', 'cartouche', null],
    ['registerRule', 'registerRule', null], ['columnRule', 'columnRule', null],
    ['paintedBand', 'paintedBand', null], ['star5', 'star5', null],
    ['chiselMarks', 'chiselMarks', null], ['pitting', 'pitting', null],
    ['speckle', 'speckle', null], ['grain', 'grain', null], ['weather', 'weather', null],
    ['brushwork', 'brushwork', null], ['paintRemnants', 'paintRemnants', null],
    ['flowStreaks', 'flowStreaks', null],
    ['ashlarH', 'ashlarH', null], ['carveH', 'carveH', null],
  ];

  const names = ONLY ? ONLY.split(',') : Object.keys(M.MATERIALS).filter((k) => ['stone', 'carved'].includes(M.MATERIALS[k].group));
  const out = [];
  for (const name of names) {
    const r = M.MATERIALS[name];
    if (!r) { out.push({ name, err: 'missing' }); continue; }
    const base = build(name, null, null);
    const n = base.sz * base.sz;
    const hB = base.s.h, tB = tiltOf(base.d.normal, n), lB = luma(base.d.albedo, n);
    const tileU = Array.isArray(r.tile) ? r.tile[0] : r.tile;
    const tileV = Array.isArray(r.tile) ? (r.tile[1] ?? r.tile[0]) : r.tile;
    const mmTexU = (tileU * 2) / base.sz * 1000;

    /* Control — a second untouched build, so a null arm can be read against the harness's own
     * floor rather than against zero-by-assumption. */
    const ctl = build(name, null, null);

    const rows = [];
    for (const [label, arm, glyphArm] of ARMS) {
      const b = build(name, arm, glyphArm);
      let dh = 0, dhMax = 0, dt = 0, dl = 0, nh = 0, nt = 0, nl = 0;
      const mask = new Uint8Array(n);
      const t2 = tiltOf(b.d.normal, n), l2 = luma(b.d.albedo, n);
      for (let i = 0; i < n; i++) {
        const a = Math.abs(b.s.h[i] - hB[i]); dh += a; if (a > dhMax) dhMax = a; if (a > 1e-4) { nh++; mask[i] = 1; }
        const c = Math.abs(t2[i] - tB[i]); dt += c; if (c > 1.0) nt++;
        const e = Math.abs(l2[i] - lB[i]); dl += e; if (e > 1 / 255) nl++;
      }
      if (nh === 0 && nl === 0 && nt === 0) continue;               // primitive not used here
      const comp = components(mask, base.sz);
      rows.push({
        arm: label,
        dAlb: dl / n, albFrac: nl / n,
        dH: dh / n, dHmax: dhMax, hFrac: nh / n,
        dTilt: dt / n, tiltFrac1: nt / n,
        comps: comp.length,
        compMedPx: +Math.sqrt(pct(comp, 0.5)).toFixed(1),
        compP90Px: +Math.sqrt(pct(comp, 0.9)).toFixed(1),
        compMedMm: +(Math.sqrt(pct(comp, 0.5)) * mmTexU).toFixed(1),
        compP90Mm: +(Math.sqrt(pct(comp, 0.9)) * mmTexU).toFixed(1),
      });
    }

    /* Harness floor. */
    let cdh = 0, cdt = 0, cdl = 0;
    const tC = tiltOf(ctl.d.normal, n), lC = luma(ctl.d.albedo, n);
    for (let i = 0; i < n; i++) { cdh += Math.abs(ctl.s.h[i] - hB[i]); cdt += Math.abs(tC[i] - tB[i]); cdl += Math.abs(lC[i] - lB[i]); }

    const hs = Float32Array.from(hB).sort();
    /* Drawn sign sizes straight off the census hook, so the "how big is the motif" figure is a
     * per-instance measurement and not a nominal from the layout code. `cut`-mode entries only:
     * those are the placements that are supposed to become relief. */
    const gh = base.log.filter((g) => g.mode === 'cut').map((g) => Math.abs(g.h)).sort((a, b) => a - b);
    out.push({
      name, group: r.group, size: base.sz, tier: r.tier ?? 0,
      tile: r.tile, worldTileU: +(tileU * 2).toFixed(2), worldTileV: +(tileV * 2).toFixed(2),
      mmPerTexelU: +mmTexU.toFixed(2), bumpMm: +((r.bump ?? 0.03) * 1000).toFixed(1),
      normalStrength: +base.d.normalStrength.toFixed(2),
      hP05: +pct(hs, 0.05).toFixed(4), hP50: +pct(hs, 0.5).toFixed(4), hP95: +pct(hs, 0.95).toFixed(4),
      tiltMean: +(tB.reduce((p, c) => p + c, 0) / n).toFixed(2),
      glyphs: base.log.length,
      glyphCut: gh.length,
      glyphPx: gh.length ? { min: +gh[0].toFixed(1), p50: +pct(gh, 0.5).toFixed(1), max: +gh[gh.length - 1].toFixed(1) } : null,
      glyphMm: gh.length ? { min: +(gh[0] * mmTexU).toFixed(0), p50: +(pct(gh, 0.5) * mmTexU).toFixed(0), max: +(gh[gh.length - 1] * mmTexU).toFixed(0) } : null,
      ctlFloor: { dH: cdh / n, dTilt: cdt / n, dAlb: cdl / n },
      rows,
    });
  }
  return out;
}, { SIZE, ONLY });

await browser.close(); server.close();
console.log(JSON.stringify({ tree: TREE, size: SIZE, rows: result }, null, 1));
