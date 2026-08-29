#!/usr/bin/env node
/**
 * proptint.mjs — §727's damage table: what does each textured `Props.MATERIALS` entry's
 * `color ×` multiply DO to the texture it multiplies onto?
 *
 * §724.1 named the mechanism ("the double tint") and fixed it for the treasure pile only, by
 * explicit instruction — a shared-entry edit that also repaints door trim is a §442
 * wrong-subject fix. This tool measures what is left: for every textured entry in the WORLD
 * table it rebuilds the texture exactly as the runtime does (pilepatch.mjs stage B — same
 * recipe, same seed, same size formula, same derive()) and reports, over the WHOLE tile:
 *
 *   authored   mean rgb (sRGB), luma L (0..255), relative saturation (max-min)/max, hue
 *   tinted     the same after the entry's `color` multiply, done in LINEAR (§719's rule —
 *              that is the space `<color_fragment>` multiplies in)
 *   cost       ΔL, %L lost, Δsat, Δhue — the §724.3 shape, per entry
 *   context    where Architecture tints the SAME texture on walls (granite_pink,
 *              limestone_polished, gold_leaf), the wall's own tinted stats — the surface a
 *              prop stands beside, which passed every playtest
 *
 * The point is a RANKING, not a verdict: a tint on a texture can be deliberate art direction
 * (the whole Architecture table works this way and the world's look is owner-confirmed), so
 * the numbers pick the entries where the multiply leaves the family the entry's NAME promises
 * — the §724 conviction shape (gold_leaf × gold = violet at L 34) — and leave the rest alone.
 *
 * No capture lock: this never renders the level — it is a CPU rasteriser in a page, the same
 * shape as pilepatch.mjs stage B, whose server this borrows.
 *
 *   node tools/proptint.mjs
 *   node tools/proptint.mjs --json /path/out.json
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? true) : d; };
const OUT = opt('json', '');
/* --sweep: §727's chroma-correction designer. For each listed entry, lerp the entry's shipped
 * tint from WHITE toward its max-normalized chromaticity (linear space, so w is a physical
 * blend of transmittances) and quote the tinted MEAN's L / sat-of-mean / hue at each step.
 * sat-of-mean is the DISTANCE read — what a mip average of the whole tile presents — which is
 * the statistic the owner's eye sees on a band at 10-25 m, and the one the §727 pure un-tint
 * left too low on the bimodal inlays (gold wire ≈ 40° and stone cells ≈ 220° average toward
 * neutral). Max-normalizing first means w=1 keeps the brightest channel at full transmittance:
 * the sweep trades chroma against luminance WITHOUT the shipped tint's flat L-crush. */
const SWEEP = process.argv.includes('--sweep');

/* The WORLD table's textured entries, transcribed from src/world/Props.js MATERIALS at the
 * commit this runs against — the tool re-reads the file and REFUSES on drift, so a moved tint
 * cannot make this table silently stale (§719's guard-on-both-constants, applied to a probe). */
const ENTRIES = [
  { key: 'stone',     tex: 'granite_pink',       tint: 0x9c8278, arch: 0xa9705c },
  { key: 'lime',      tex: 'limestone_polished', tint: 0xd4c19a, arch: 0xe0d0a8 },
  { key: 'gold',      tex: 'gold_leaf',          tint: 0xe8b942, arch: 0xe8b942, note: 'pile already un-tinted (§724); non-pile gold still wears this' },
  { key: 'bronze',    tex: 'bronze_aged',        tint: 0x8a6a3a },
  { key: 'wood',      tex: 'wood_old',           tint: 0x6b4a2c },
  { key: 'rope',      tex: 'rope',               tint: 0xa8875c },
  { key: 'cloth',     tex: 'linen_cloth',        tint: 0xe8ddc4 },
  { key: 'lapis',     tex: 'lapis_inlay',        tint: 0x1f4f96 },
  { key: 'carnelian', tex: 'carnelian_inlay',    tint: 0xb8452c },
  { key: 'cork',      tex: 'wood_old',           tint: 0x8a6a42, note: 'DEAD entry — clueBottle folds all parts into glass; zero users' },
];

/* Drift guard: every (tex, tint) pair above must appear verbatim in Props.js. Since §727 a
 * convicted entry's hex survives wrapped as `TINT727(0x…)` — the shipped grade the token
 * restores — so the guard accepts the wrapped form; either way this table describes the
 * SHIPPED double grade (the `?props=tinted` arm), which is what the damage rows measure. */
const propsSrc = fs.readFileSync(path.join(ROOT, 'src/world/Props.js'), 'utf8');
for (const e of ENTRIES) {
  const hex = e.tint.toString(16);
  const re = new RegExp(`${e.key}:\\s*\\{[^}]*tex:\\s*'${e.tex}'[^}]*color:\\s*(?:TINT727\\()?0x${hex}`);
  if (!re.test(propsSrc)) {
    process.stderr.write(`proptint: DRIFT — Props.MATERIALS.${e.key} no longer reads tex '${e.tex}' × 0x${hex}. Re-transcribe before trusting this table.\n`);
    process.exit(2);
  }
}

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 5731 + (process.pid % 200);
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const rows = await page.evaluate(async ({ entries, sweepList }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const N = await import('/src/textures/NormalMap.js');

  /* The runtime's own sizing (pilepatch.mjs's transcription of Textures.js): quality high
   * boots at 1024; tier >= 1 builds at half, floored at 256; an explicit size wins. */
  function hashName(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  const srgb2lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lin2srgb = (c) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  const hueOf = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 1e-6) return 0;
    let h;
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    return ((h * 60) + 360) % 360;
  };
  const stats = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return {
      mean: [r, g, b].map((v) => +v.toFixed(1)),
      L: +(0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(1),
      sat: +(mx > 0 ? (mx - mn) / mx : 0).toFixed(3),
      hue: +hueOf(r, g, b).toFixed(1),
    };
  };

  const built = new Map();   // tex name -> { albedo, size, linMean:[r,g,b], srgbStats }
  function build(name) {
    if (built.has(name)) return built.get(name);
    const recipe = M.MATERIALS[name];
    if (!recipe) throw new Error(`no recipe ${name}`);
    const sz = recipe.size ? Math.min(recipe.size, 1024) : (recipe.tier >= 1 ? Math.max(256, 1024 >> 1) : 1024);
    const s = new C.Surface(sz, (recipe.seed ?? hashName(name)) >>> 0);
    recipe.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    const out = N.derive(s, {
      bump: recipe.bump ?? 0.03, tile: recipe.tile ?? 2.0,
      normalScale: recipe.normalScale ?? 1.0, aoStrength: recipe.aoStrength ?? 1.0,
      aoFloor: recipe.aoFloor ?? 0.16, micro: recipe.micro ?? 0.10,
      ormDiv: recipe.ormDiv ?? 2, smoothH: recipe.smoothH ?? 0, microSoft: recipe.microSoft ?? 0.35,
    });
    const alb = out.albedo, n = sz * sz;
    const orm = out.orm.data, os = out.orm.size, oScale = os / sz;
    /* Whole-tile means: sRGB channel means for the readable row, LINEAR means for the multiply
     * (a mean of texels then tinted equals the tint of the mean only in linear, which is one
     * more reason the multiply must be done there). Per-texel sat is averaged, not the sat of
     * the mean — matching pilepatch's wholeTile().
     *
     * Mode split for the bimodal textures (the inlays: stone cells set in GOLD cloisonné
     * wire): the ORM blue channel is the per-texel gilding mask (`_mat`'s own note), so texels
     * are split at metal 0.5 and each mode gets its own mean — a whole-tile mean of a
     * two-material texture describes neither material (§439/§440's class of error). */
    const acc = () => ({ n: 0, r: 0, g: 0, b: 0, sat: 0, lr: 0, lg: 0, lb: 0 });
    const all = acc(), metal = acc(), stone = acc();
    for (let i = 0; i < n; i++) {
      const tr = alb[i * 4], tg = alb[i * 4 + 1], tb = alb[i * 4 + 2];
      const x = i % sz, y = (i / sz) | 0;
      const oi = (((y * oScale) | 0) * os + ((x * oScale) | 0)) * 4;
      const m = orm[oi + 2] / 255;
      for (const a of [all, m > 0.5 ? metal : stone]) {
        a.n++; a.r += tr; a.g += tg; a.b += tb;
        const mx = Math.max(tr, tg, tb), mn = Math.min(tr, tg, tb);
        a.sat += mx > 0 ? (mx - mn) / mx : 0;
        a.lr += srgb2lin(tr); a.lg += srgb2lin(tg); a.lb += srgb2lin(tb);
      }
    }
    const fin = (a) => a.n ? {
      n: a.n, linMean: [a.lr / a.n, a.lg / a.n, a.lb / a.n],
      authored: { ...stats(a.r / a.n, a.g / a.n, a.b / a.n), sat: +(a.sat / a.n).toFixed(3) },
    } : null;
    const rec = { size: sz, ...fin(all), modes: { metal: fin(metal), stone: fin(stone) } };
    built.set(name, rec);
    return rec;
  }

  const tintLin = (tintHex) => [(tintHex >> 16 & 255) / 255, (tintHex >> 8 & 255) / 255, (tintHex & 255) / 255]
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const applyTint = (linMean, T) => stats(lin2srgb(linMean[0] * T[0]), lin2srgb(linMean[1] * T[1]), lin2srgb(linMean[2] * T[2]));
  function tintRow(tex, tintHex) {
    return applyTint(build(tex).linMean, tintLin(tintHex));
  }

  const rows = [];
  for (const e of entries) {
    const t = build(e.tex);
    const tinted = tintRow(e.tex, e.tint);
    const tintHexRgb = [(e.tint >> 16) & 255, (e.tint >> 8) & 255, e.tint & 255];
    const row = {
      key: e.key, tex: e.tex, size: t.size,
      tint: { hex: '0x' + e.tint.toString(16), ...stats(...tintHexRgb) },
      authored: t.authored,
      tinted,
      cost: {
        dL: +(tinted.L - t.authored.L).toFixed(1),
        pctL: +((tinted.L - t.authored.L) / t.authored.L * 100).toFixed(1),
        dSat: +(tinted.sat - t.authored.sat).toFixed(3),
        dHue: +(((tinted.hue - t.authored.hue + 540) % 360) - 180).toFixed(1),
      },
      note: e.note ?? null,
    };
    if (e.arch != null) row.archTinted = { hex: '0x' + e.arch.toString(16), ...tintRow(e.tex, e.arch) };
    if (/_inlay$/.test(e.tex)) {
      const T = tintLin(e.tint);
      row.modes = {};
      for (const [m, rec] of Object.entries(t.modes)) {
        if (!rec) continue;
        row.modes[m] = { frac: +(rec.n / (t.size * t.size)).toFixed(3), authored: rec.authored, tinted: applyTint(rec.linMean, T) };
      }
    }
    /* sat-of-mean: the colour a mip average presents at distance, per arm. */
    const satOf = (s) => { const [r, g, b] = s.mean; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return +(mx > 0 ? (mx - mn) / mx : 0).toFixed(3); };
    const meanOnly = applyTint(t.linMean, [1, 1, 1]);
    row.meanStats = { authored: { ...meanOnly, satOfMean: satOf(meanOnly) }, tinted: { ...row.tinted, satOfMean: satOf(row.tinted) } };
    if (sweepList && sweepList.includes(e.key)) {
      const T = tintLin(e.tint);
      const mx = Math.max(...T);
      const norm = T.map((v) => v / mx);           // max-normalized: brightest channel = 1
      row.sweep = [];
      for (const w of [0, 0.15, 0.25, 0.35, 0.45, 0.55, 0.7, 0.85, 1]) {
        const tw = norm.map((v) => 1 + (v - 1) * w);   // lerp(white, norm, w) in linear
        const s = applyTint(t.linMean, tw);
        row.sweep.push({ w, tintHex: '0x' + tw.map((v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)).toString(16).padStart(2, '0')).join(''), L: s.L, lumaMean: +(s.L / 255).toFixed(3), satOfMean: satOf(s), hue: s.hue });
      }
    }
    rows.push(row);
  }
  return rows;
}, { entries: ENTRIES, sweepList: SWEEP ? ['wood', 'lapis', 'carnelian', 'rope'] : null });

await browser.close();
server.close();

for (const r of rows) {
  const a = r.authored, t = r.tinted;
  process.stdout.write(
    `${r.key.padEnd(10)} ${r.tex.padEnd(19)} sz ${String(r.size).padEnd(5)}` +
    `auth (${a.mean.join(',')}) L ${String(a.L).padEnd(6)} sat ${a.sat} hue ${String(a.hue).padEnd(6)}` +
    ` -> tinted (${t.mean.join(',')}) L ${String(t.L).padEnd(6)} sat ${t.sat} hue ${String(t.hue).padEnd(6)}` +
    ` | dL ${String(r.cost.dL).padEnd(6)} (${r.cost.pctL}%) dSat ${r.cost.dSat} dHue ${r.cost.dHue}` +
    (r.archTinted ? ` | arch ${r.archTinted.hex}: L ${r.archTinted.L} sat ${r.archTinted.sat} hue ${r.archTinted.hue}` : '') +
    (r.note ? `  [${r.note}]` : '') + '\n'
  );
  if (r.modes) {
    for (const [m, v] of Object.entries(r.modes)) {
      process.stdout.write(`           · ${m.padEnd(6)} ${String(Math.round(v.frac * 100)).padStart(2)}%  auth (${v.authored.mean.join(',')}) L ${v.authored.L} sat ${v.authored.sat} hue ${v.authored.hue} -> tinted (${v.tinted.mean.join(',')}) L ${v.tinted.L} sat ${v.tinted.sat} hue ${v.tinted.hue}\n`);
    }
  }
  if (r.meanStats) process.stdout.write(`           · satOfMean authored ${r.meanStats.authored.satOfMean} (the distance read) vs shipped-tinted ${r.meanStats.tinted.satOfMean}\n`);
  if (r.sweep) {
    for (const s of r.sweep) process.stdout.write(`           · w ${String(s.w).padEnd(4)} tint ${s.tintHex}  mean L ${String(s.L).padEnd(6)} luma ${s.lumaMean}  satOfMean ${s.satOfMean}  hue ${s.hue}\n`);
  }
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
process.exit(0);
