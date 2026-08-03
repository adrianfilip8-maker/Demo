/**
 * granitereach — per-term relief reach for `granite_pink`, the one recipe `reliefreach.mjs`
 * structurally cannot see (§158.4).
 *
 * `reliefreach` works by neutralising a *wrapped primitive* (`ashlar`, `carve`, `chiselMarks`,
 * `drawGlyph`, …) and diffing the built Surface. `granite_pink` writes its relief inline, in one
 * arithmetic statement in the recipe body:
 *
 *     s.h[i] = hh + (1 - edge) * 0.10 + (sm.id - 0.5) * 0.06 - sq * 0.30;
 *
 * so there is no binding to reassign and no arm to run. The question §158 left open is whether
 * any of those four addends is in the §125.1 state — authored and contributing bit-exact zero to
 * the map the shader samples — which the recipe-level composite (mean tilt 3.00°) cannot answer,
 * because a composite is dominated by whichever terms *are* live.
 *
 * METHOD — no edit to `src/textures/**`. The four addends are reconstructed in this file from
 * the same exported noise functions, the same seed and the same `Surface.field` divisors, and
 * then:
 *
 *   GATE  the reconstruction is checked against the SHIPPED build's own `s.h`. `weather()` writes
 *         no height and `grain`/`speckle` write theirs *after* the loop, so
 *         `built - predicted` must equal the grain+speckle residual and nothing else. If the
 *         residual is not small and structureless the model is not the recipe and every arm
 *         below is void — this is the §18 guard: a model validated against a tree that has since
 *         moved reports a confident number about nothing.
 *   ARMS  for each addend T, h_T := builtH - contribution_T (an exact subtraction, since the
 *         statement is a sum), swapped into a clone of the shipped Surface, and pushed through
 *         `NormalMap.derive()` with granite's own bump/tile/microSoft. dTilt is then the tilt the
 *         term is *worth* in the shipped normal map.
 *   CTL   `null` arm subtracts nothing and must read exactly 0.00 in every column.
 *   KB    `allInline` subtracts all four, leaving only grain/speckle — the known-bad state this
 *         probe exists to detect (§13: a metric never shown to move on a state carrying the
 *         defect is not evidence about it). If a term reads like `allInline` it is silent.
 *
 * SCOPE — the transforms between this and the rendered frame, i.e. what it does NOT do (§11):
 *   no geometry, no camera, no consumer UV factor (granite_pink takes the ARCH_UV = 2 default —
 *   it is not one of the four documented exceptions at `Textures.js:37-86`), no lighting, no
 *   shadow map, no cel quantiser, no AgX, no ink pass, no GPU mip chain, no anisotropic filter.
 *   It measures the authored Surface and `NormalMap.derive()` and nothing after them.
 *
 *   node progress/records/granitereach.mjs [--size 1024]
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

const treeHash = crypto.createHash('sha1');
for (const f of ['src/textures/Materials.js', 'src/textures/Canvas2D.js', 'src/textures/NormalMap.js']) {
  treeHash.update(fs.readFileSync(path.join(ROOT, f)));
}
const TREE = treeHash.digest('hex').slice(0, 12);

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 21600 + (process.pid % 300);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const result = await page.evaluate(async ({ SIZE }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const N = await import('/src/textures/NormalMap.js');
  const { Surface, PAL, MX, sat, warpN, ridgeN, worleyN, blurWrap, abOff } = C;
  const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

  const name = 'granite_pink';
  const r = M.MATERIALS[name];
  const size = r.size ? Math.min(r.size, SIZE) : (r.tier >= 1 ? Math.max(256, SIZE >> 1) : SIZE);
  const n = size * size;
  const seed = (r.seed ?? hashName(name)) >>> 0;

  /* ---- 1. the shipped build ------------------------------------------------------------ */
  const built = new Surface(size, seed);
  r.build(built, { seed: built.seed, size, name, quality: 'high' });
  const builtH = Float32Array.from(built.h);

  const deriveOpts = {
    bump: r.bump ?? 0.03, tile: r.tile ?? 2.0, normalScale: r.normalScale ?? 1.0,
    aoStrength: r.aoStrength ?? 1.0, aoFloor: r.aoFloor ?? 0.16, micro: r.micro ?? 0.10,
    ormDiv: r.ormDiv ?? 2, smoothH: r.smoothH ?? 0, microSoft: r.microSoft ?? 0.35,
  };
  const tiltOf = (nrm) => {
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (nrm[i * 4] / 255) * 2 - 1, y = (nrm[i * 4 + 1] / 255) * 2 - 1, z = (nrm[i * 4 + 2] / 255) * 2 - 1;
      t[i] = Math.acos(Math.max(-1, Math.min(1, z / (Math.hypot(x, y, z) || 1)))) * 180 / Math.PI;
    }
    return t;
  };
  /* derive() reads every channel; clone the shipped Surface and swap only h, so nothing but the
   * height field differs between an arm and the base. */
  const deriveWithH = (h) => {
    const c = new Surface(size, seed);
    c.h = h; c.r = built.r; c.g = built.g; c.b = built.b;
    c.rough = built.rough; c.metal = built.metal; c.occ = built.occ;
    c.a = built.a; c.em = built.em;
    return N.derive(c, deriveOpts);
  };
  const dBase = deriveWithH(builtH);
  const tBase = tiltOf(dBase.normal);

  /* ---- 2. reconstruct the four inline addends ------------------------------------------ */
  /* Same seed, same field divisors, same constants as Materials.js `granite_pink`. Nothing here
   * consumes `s.rand`, so the reconstruction is order-independent w.r.t. the shipped build. */
  const scratch = new Surface(size, seed);
  const cxSeed = seed;
  const macro = scratch.field(5, (u, v) => warpN(u, v, 6, 4, 1.2, cxSeed + 31) * 0.5 + 0.5);
  const schl = scratch.field(4, (u, v) => sat(
    warpN(u, v, 3, 3, 1.45, cxSeed + 907) * 0.80
    + warpN(u, v, 7, 3, 1.10, cxSeed + 1531) * 0.34 + 0.5));
  const scour = scratch.field(3, (u, v) => ridgeN(u, v, 8, 4, 0.55, cxSeed + 733));
  const bigF = Math.max(24, Math.min(96, Math.round(size / 6)));

  /* Four addends, kept apart so each can be subtracted on its own. `mineral` is a step function
   * of the Worley id, so "zeroing" it means removing its deviation from its own mean — the
   * constant part of a height field is invisible to derive() anyway. */
  const A = {
    mineral: new Float32Array(n),   // hh: the per-crystal feldspar/quartz/biotite step (0.62/0.60/0.56)
    edge: new Float32Array(n),      // (1 - edge) * 0.10: crystal grain boundaries, ~23 mm
    smallCell: new Float32Array(n), // (sm.id - 0.5) * 0.06: half-crystal-scale cell variation
    scour: new Float32Array(n),     // -sq * 0.30: the 55 cm wind-scour hollows
  };
  const wA = {}, wB = {};
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size, row = y * size;
    for (let x = 0; x < size; x++) {
      const i = row + x, u = (x + 0.5) / size;
      const big = worleyN(u, v, bigF, cxSeed, 1.0, wA);
      const sm = worleyN(u, v, bigF * 2, cxSeed + 7, 1.0, wB);
      const sc = schl[i] - 0.5;
      const k = sat(big.id - sc * 0.44);
      const hh = k < 0.48 ? 0.62 : (k < 0.91 ? 0.60 : 0.56);
      const edge = sat((big.f2 - big.f1) / 0.16);
      const sq = scour[i] * scour[i];
      A.mineral[i] = hh;
      A.edge[i] = (1 - edge) * 0.10;
      A.smallCell[i] = (sm.id - 0.5) * 0.06;
      A.scour[i] = -sq * 0.30;
    }
  }
  const mean = (f) => { let s = 0; for (let i = 0; i < n; i++) s += f[i]; return s / n; };
  const minMean = mean(A.mineral);

  /* ---- 3. GATE: does the reconstruction reproduce the shipped height field? ------------- */
  const pred = new Float32Array(n);
  for (let i = 0; i < n; i++) pred[i] = A.mineral[i] + A.edge[i] + A.smallCell[i] + A.scour[i];
  const resid = new Float32Array(n);
  for (let i = 0; i < n; i++) resid[i] = builtH[i] - pred[i];
  const pct = (a, q) => a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))];
  const absR = Float32Array.from(resid, Math.abs).sort();
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const a = builtH[i], b = pred[i]; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b; }
  const corr = (n * sxy - sx * sy) / (Math.sqrt(n * sxx - sx * sx) * Math.sqrt(n * syy - sy * sy) || 1);

  /* ---- 4. arms -------------------------------------------------------------------------- */
  const arms = [];
  const runArm = (label, contrib) => {
    const h = new Float32Array(n);
    if (contrib) for (let i = 0; i < n; i++) h[i] = builtH[i] - contrib[i];
    else h.set(builtH);
    const d = deriveWithH(h);
    const t = tiltOf(d.normal);
    let dh = 0, dt = 0, nt = 0, tsum = 0;
    for (let i = 0; i < n; i++) {
      dh += Math.abs(h[i] - builtH[i]);
      const dd = Math.abs(t[i] - tBase[i]);
      dt += dd; if (dd > 1) nt++;
      tsum += t[i];
    }
    arms.push({
      arm: label,
      dH: +(dh / n).toExponential(3),
      dTilt: +(dt / n).toFixed(3),
      tiltFrac1: +((nt / n) * 100).toFixed(1),
      armTiltMean: +(tsum / n).toFixed(3),
    });
  };

  runArm('null (control)', null);
  const mineralDev = Float32Array.from(A.mineral, (x) => x - minMean);
  runArm('mineral step', mineralDev);
  runArm('crystal edge', A.edge);
  runArm('small cell', A.smallCell);
  runArm('wind scour', A.scour);
  const all = new Float32Array(n);
  for (let i = 0; i < n; i++) all[i] = mineralDev[i] + A.edge[i] + A.smallCell[i] + A.scour[i];
  runArm('ALL inline (known-bad)', all);

  /* ---- 5. per-term amplitude, for the "is it worth anything" read ------------------------ */
  const spread = (f) => {
    const s2 = Float32Array.from(f).sort();
    return { p05: +pct(s2, 0.05).toFixed(4), p50: +pct(s2, 0.5).toFixed(4), p95: +pct(s2, 0.95).toFixed(4) };
  };
  const bSort = Float32Array.from(builtH).sort();
  const mmPerTexel = ((r.tile ?? 2.0) * 2 / size) * 1000;

  return {
    name, size, seed, tile: r.tile, bump: r.bump,
    normalStrength: +dBase.normalStrength.toFixed(2),
    mmPerTexel: +mmPerTexel.toFixed(2),
    abOffGranite: abOff('granite'),
    builtH: { p05: +pct(bSort, 0.05).toFixed(4), p50: +pct(bSort, 0.5).toFixed(4), p95: +pct(bSort, 0.95).toFixed(4) },
    baseTiltMean: +(tBase.reduce((p, c) => p + c, 0) / n).toFixed(3),
    gate: {
      corr: +corr.toFixed(6),
      residAbs: { p50: +pct(absR, 0.5).toExponential(3), p95: +pct(absR, 0.95).toExponential(3), max: +absR[n - 1].toExponential(3) },
    },
    termSpread: { mineral: spread(A.mineral), edge: spread(A.edge), smallCell: spread(A.smallCell), scour: spread(A.scour) },
    arms,
  };
}, { SIZE });

await browser.close(); server.close();
console.log(JSON.stringify({ tree: TREE, size: SIZE, result }, null, 1));
