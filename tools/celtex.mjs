/**
 * celtex — critic 9's D6 and D7 statistics applied to the ALBEDO, offline, at screen scale.
 *
 * D6 and D7 are frame measurements, and a frame is albedo x key x ramp x shadow x grade x tonemap.
 * Three other agents are moving the last four this week (§269 shadow, §270 ink, POSTFX), so a
 * texture verdict taken off a screenshot attributes their work to these recipes — `palwarm.mjs`
 * states the same reason for the same choice. This measures the one layer TEXTURES owns.
 *
 * ── D6, at the density the surface is actually seen at ──────────────────────────────────────
 *
 * A 1024 tile measured at 1024 is not what D6 measured. `celsurf.mjs` scores 64x64 windows of a
 * 1280x720 frame; the equivalent here is the tile box-downsampled to the texel:pixel ratio the
 * consumer runs at. `--mip` picks that ratio (2 = one screen pixel per two texels, the ratio a
 * 4 m tile at 1024 gives at the ~8 mm/px the architecture is seen at in `hero`/`sly-key`). The
 * statistics are `celsurf.mjs`'s own functions, imported rather than re-implemented, so the
 * calibration recorded there (rec709 on 0..255 floats, flat <=> 3x3 span <= 2) holds here too.
 *
 * ── D7, as a confusion matrix and not as a pair of patches ──────────────────────────────────
 *
 * D7 quotes pairwise CIELAB dE between hand-placed patches. A patch is one draw from a
 * distribution; two materials can differ by dE 8 in the mean and still be indistinguishable if
 * each spans dE 20 internally. So separability here is the *overlap of the distributions*:
 * each recipe is summarised by its albedo Lab centroid and covariance, and each pair gets
 *
 *   - dE      distance between centroids, the number D7 quotes;
 *   - sep     that distance in units of the pair's pooled within-material spread along the
 *             line joining them (a 1-D Fisher/effect-size ratio). sep >= 1 means a random
 *             texel of A is nearer A's centroid than B's more often than not;
 *   - conf    measured confusion: the share of a 4000-texel sample of each material that is
 *             closer (Mahalanobis, pooled) to the OTHER centroid. 0.5 = indistinguishable.
 *
 * Reporting all three keeps D7's own number visible while stating the thing it cannot: two
 * materials 10 dE apart in the mean are still one material if the mean is all they have.
 *
 *   node tools/celtex.mjs --size 1024 --mip 2 --json out.json
 *   node tools/celtex.mjs --names sandstone_block,granite_pink --mip 2 --png out/
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { surfaceStats, flatShare, lab, deltaE } from './celsurf.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? true) : d; };
const has = (n) => process.argv.includes(`--${n}`);

const cfg = {
  size: parseInt(opt('size', '1024'), 10),
  mip: parseInt(opt('mip', '2'), 10),
  names: String(opt('names', '')).split(',').filter(Boolean),
  json: opt('json', null),
  quiet: has('quiet'),
  /* `--post N` is the CANDIDATE ARM, not part of the instrument: it applies the value-lattice
   * quantiser to the built tile before measuring, so the step count can be derived offline
   * before a line of `src/` changes. 0 = the shipped build, measured as-is. When the quantiser
   * ships, this path is deleted and the tool imports `celband` from Canvas2D so there is only
   * ever one implementation. */
  post: String(opt('post', '0')),
};

/**
 * Candidate: snap albedo luma onto a lattice of `steps` values spanning the material's own
 * p02..p98, hue- and chroma-preserving (RGB scaled by the luma ratio), never widening the
 * material's existing luma range.
 *
 * Deliberately NOT clamped into [p02, p98]: clamping would pile every crevice texel onto one
 * value and raise the dark tail, and `rampFloor`'s crevice floor is an invariant three other
 * things depend on. The lattice is extended beyond the ends at the same spacing instead, so an
 * outlier keeps its rank and only loses its fractional position. `max`/`min` against the
 * surface's own extremes then guarantees no texel leaves the range the recipe authored — a
 * quantiser cannot create a new darkTail.
 */
export const CELBAND_SRC = String(function celband(s, o) {
  const size = s.size, n = s.n;
  const steps = o.steps, radius = o.radius | 0, keep = o.keep == null ? 1 : o.keep;
  if (!(steps >= 2)) return;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = s.r[i] * 0.2126 + s.g[i] * 0.7152 + s.b[i] * 0.0722;
  let sm = y;
  if (radius > 0) {
    const w = radius * 2 + 1, t = new Float64Array(n), out = new Float64Array(n);
    for (let r = 0; r < size; r++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) acc += y[r * size + ((k % size) + size) % size];
      for (let c = 0; c < size; c++) {
        t[r * size + c] = acc / w;
        acc -= y[r * size + (((c - radius) % size) + size) % size];
        acc += y[r * size + (((c + radius + 1) % size) + size) % size];
      }
    }
    for (let c = 0; c < size; c++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) acc += t[((((k % size) + size) % size)) * size + c];
      for (let r = 0; r < size; r++) {
        out[r * size + c] = acc / w;
        acc -= t[((((r - radius) % size) + size) % size) * size + c];
        acc += t[((((r + radius + 1) % size) + size) % size) * size + c];
      }
    }
    sm = out;
  }
  const ys = Float64Array.from(y).sort();
  const q = (p) => ys[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
  const a = q(0.02), b = q(0.98), lo = ys[0], hi = ys[n - 1];
  const step = (b - a) / Math.max(1, steps - 1);
  if (!(step > 1e-6)) return;
  for (let i = 0; i < n; i++) {
    if (y[i] < 1e-4) continue;
    let yn = a + Math.round((sm[i] - a) / step) * step + (y[i] - sm[i]) * keep;
    if (yn < lo) yn = lo;
    if (yn > hi) yn = hi;
    let k = yn / y[i];
    const mx = Math.max(s.r[i], s.g[i], s.b[i]);
    if (mx * k > 1) k = mx > 1e-6 ? 1 / mx : 1;
    s.r[i] *= k; s.g[i] *= k; s.b[i] *= k;
  }
});


const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 6100 + (process.pid % 300);
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const built = await page.evaluate(async ({ cfg, celbandSrc }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const list = cfg.names.length ? cfg.names : M.MATERIAL_NAMES;
  /* Prefer the SHIPPED function once it exists, so this tool measures the thing that renders
   * rather than a second implementation of it. The inlined copy is only the pre-ship arm. */
  const labCelband = C.celband || (0, eval)(`(${celbandSrc})`);
  const out = [];
  for (const name of list) {
    const recipe = M.MATERIALS[name];
    if (!recipe) continue;
    /* Same size rule as Textures.js so the measured tile is the shipped tile. */
    const sz = recipe.size ? Math.min(recipe.size, cfg.size) : (recipe.tier >= 1 ? Math.max(256, cfg.size >> 1) : cfg.size);
    const s = new C.Surface(sz, (recipe.seed ?? hashName(name)) >>> 0);
    recipe.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    if (cfg.post !== '0') {
      const [st, rad, kp] = cfg.post.split(':').map(Number);
      labCelband(s, { steps: st, radius: rad || 0, keep: Number.isFinite(kp) ? kp : 1 });
    }
    const rgb = new Uint8Array(sz * sz * 3);
    for (let i = 0; i < sz * sz; i++) {
      rgb[i * 3] = Math.max(0, Math.min(255, Math.round(s.r[i] * 255)));
      rgb[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(s.g[i] * 255)));
      rgb[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(s.b[i] * 255)));
    }
    /* base64, not an Array: a 1024² tile is 3.1 M elements and the CDP bridge serialises a JS
     * array of numbers as JSON text. Measured at minutes per tile; base64 is milliseconds. */
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < rgb.length; i += CH) bin += String.fromCharCode.apply(null, rgb.subarray(i, i + CH));
    /* The two BLOCKING invariants of PREREG-celband S2/S3, measured on the same Surface the
     * pixels came from — `masonry` only exists while the Surface does, so this cannot be
     * recomputed later from the tile. `jointSign` is `Bake.js`'s function, not a paraphrase of
     * it; `darkTail` is `texlab.mjs`'s (share of texels under the §2.2 crevice luminance). */
    let joint = null;
    const CREV = (0x4a * 0.2126 + 0x2f * 0.7152 + 0x22 * 0.0722) / 255;
    let dark = 0;
    for (let i = 0; i < sz * sz; i++) if (s.r[i] * 0.2126 + s.g[i] * 0.7152 + s.b[i] * 0.0722 < CREV) dark++;
    if (s.masonry) {
      const m = s.masonry; let jy = 0, jh = 0, jn = 0, fy = 0, fh = 0, fn = 0;
      for (let i = 0; i < sz * sz; i++) {
        const yy = s.r[i] * 0.2126 + s.g[i] * 0.7152 + s.b[i] * 0.0722;
        if (m.joint[i] > 0.6) { jy += yy; jh += s.h[i]; jn++; } else if (m.joint[i] < 0.05) { fy += yy; fh += s.h[i]; fn++; }
      }
      if (jn && fn) joint = { dY: +((jy / jn) - (fy / fn)).toFixed(4), dH: +((jh / jn) - (fh / fn)).toFixed(4) };
    }
    out.push({ name, group: recipe.group ?? '?', tier: recipe.tier ?? 0, size: sz, tile: recipe.tile, joint, darkTail: +(dark / (sz * sz)).toFixed(4), b64: btoa(bin) });
  }
  return out;
}, { cfg, celbandSrc: CELBAND_SRC });
await browser.close();
server.close();

/** Box-downsample an RGB tile by an integer factor. */
function down(rgb, sz, k) {
  if (k <= 1) return { rgb, sz };
  const h = Math.floor(sz / k), o = new Uint8Array(h * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const j = ((y * k + dy) * sz + x * k + dx) * 3; r += rgb[j]; g += rgb[j + 1]; b += rgb[j + 2];
    }
    const q = (y * h + x) * 3, m = k * k;
    o[q] = Math.round(r / m); o[q + 1] = Math.round(g / m); o[q + 2] = Math.round(b / m);
  }
  return { rgb: o, sz: h };
}

const rows = [];
const dists = [];
for (const t of built) {
  const src = new Uint8Array(Buffer.from(t.b64, 'base64'));
  const { rgb, sz } = down(src, t.size, cfg.mip);
  const n = sz * sz;
  const a = new Float64Array(n);
  for (let i = 0; i < n; i++) a[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
  /* surfaceStats wants an (image, width) pair; the whole tile is the ROI. */
  const st = surfaceStats(a, sz, 0, 0, sz, sz);
  const flat = flatShare(a, sz, sz);

  /* Lab centroid + covariance, on a deterministic stride sample. */
  const step = Math.max(1, Math.floor(sz / 64));
  const L = [], A = [], B = [];
  for (let y = 0; y < sz; y += step) for (let x = 0; x < sz; x += step) {
    const j = (y * sz + x) * 3; const p = lab(rgb[j], rgb[j + 1], rgb[j + 2]);
    L.push(p[0]); A.push(p[1]); B.push(p[2]);
  }
  const m = [L, A, B].map((v) => v.reduce((s, q) => s + q, 0) / v.length);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < L.length; i++) {
    const d = [L[i] - m[0], A[i] - m[1], B[i] - m[2]];
    for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) cov[p][q] += d[p] * d[q];
  }
  for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) cov[p][q] /= L.length;

  rows.push({
    name: t.name, group: t.group, tier: t.tier, size: t.size, mipSize: sz,
    darkTail: t.darkTail, joint: t.joint,
    grad: +st.grad.toFixed(2), top3: +st.top3.toFixed(3), levels: st.levels, flat: +flat.toFixed(4),
    lab: m.map((v) => +v.toFixed(2)),
    sd: [0, 1, 2].map((p) => +Math.sqrt(cov[p][p]).toFixed(2)),
  });
  dists.push({ name: t.name, group: t.group, m, cov, samples: { L, A, B } });
}

/* --- D7: pairwise separability over a named material set ------------------------------------ */
function pairStats(p, q) {
  const dE = deltaE(p.m, q.m);
  const u = [q.m[0] - p.m[0], q.m[1] - p.m[1], q.m[2] - p.m[2]];
  const nn = Math.hypot(...u) || 1e-9; const un = u.map((v) => v / nn);
  const proj = (c) => { let s = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += un[i] * c[i][j] * un[j]; return Math.sqrt(Math.max(0, s)); };
  const sp = Math.sqrt((proj(p.cov) ** 2 + proj(q.cov) ** 2) / 2) || 1e-9;
  /* Measured confusion along the joining line: share of each material's texels that fall on the
   * other side of the midpoint. This is the fraction a nearest-centroid classifier gets wrong. */
  const mid = (p.m.map((v, i) => (v + q.m[i]) / 2));
  const side = (d) => {
    let wrong = 0;
    for (let i = 0; i < d.samples.L.length; i++) {
      const v = [d.samples.L[i] - mid[0], d.samples.A[i] - mid[1], d.samples.B[i] - mid[2]];
      const t = v[0] * un[0] + v[1] * un[1] + v[2] * un[2];
      if ((d === p && t > 0) || (d === q && t < 0)) wrong++;
    }
    return wrong / d.samples.L.length;
  };
  return { dE: +dE.toFixed(2), sep: +(dE / sp).toFixed(2), conf: +((side(p) + side(q)) / 2).toFixed(3) };
}

const pairs = [];
for (let i = 0; i < dists.length; i++) for (let j = i + 1; j < dists.length; j++) {
  pairs.push({ a: dists[i].name, b: dists[j].name, ...pairStats(dists[i], dists[j]) });
}

if (!cfg.quiet) {
  console.log(`\n# D6 on the albedo, mip ${cfg.mip} (one sample per ${cfg.mip} texels)\n`);
  console.log('recipe'.padEnd(22) + 'grp'.padEnd(7) + '  grad  top3  lvl>1%   flat');
  for (const r of rows.sort((p, q) => q.grad - p.grad)) {
    console.log(r.name.padEnd(22) + String(r.group).padEnd(7) + String(r.grad).padStart(6) + String(r.top3).padStart(6) + String(r.levels).padStart(8) + String(r.flat).padStart(7));
  }
  console.log(`\n# D7 pairs, worst (most confusable) first — dE = centroid distance, sep = dE / pooled sd, conf = measured confusion\n`);
  for (const p of pairs.sort((x, y) => y.conf - x.conf || x.sep - y.sep).slice(0, 30)) {
    console.log(`${p.a.padEnd(20)} ${p.b.padEnd(20)} dE ${String(p.dE).padStart(6)}  sep ${String(p.sep).padStart(5)}  conf ${p.conf.toFixed(3)}`);
  }
}
if (cfg.json) fs.writeFileSync(cfg.json, JSON.stringify({ cfg: { size: cfg.size, mip: cfg.mip }, rows, pairs }, null, 1));
