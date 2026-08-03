/**
 * CPU-side texture lab, v2 — measures and *renders* the Surface before it reaches the GPU.
 *
 * Boots headless Chromium only because Canvas2D.rasterMask needs a 2D canvas. No game, no
 * WebGL, no capture lock. Whole catalogue in ~20 s against 2-5 min for one game capture.
 *
 *   node texlab2.mjs --all --size 512 --json out.json
 *   node texlab2.mjs --names gold_leaf --size 512 --tile out/ --wall out/ --lit out/
 *
 * `--wall` is the tiling instrument: it lays the tile out N x M as the consumer would on a
 * wall and downsamples to the pixel count that wall actually covers on screen, so a repeat
 * that is invisible on a test quad and obvious across 45 m shows up here for free.
 * `--lit` is the squint/relief instrument: the material under a raking key with the cel
 * quantiser, so "flat vs busy" and "metal vs plaster" can be judged without the scene.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };

const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? true) : d; };
const has = (n) => process.argv.includes(`--${n}`);

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 5711 + (process.pid % 200);
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.error('  [page]', m.text()); });
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const cfg = {
  size: parseInt(opt('size', '512'), 10),
  names: String(opt('names', '')).split(',').filter(Boolean),
  all: has('all'),
  tile: !!opt('tile', false),
  wall: !!opt('wall', false),
  lit: !!opt('lit', false),
  wallRep: parseInt(opt('reps', '4'), 10),
  wallPx: parseInt(opt('wallpx', '480'), 10),
  litKey: parseFloat(opt('keyaz', '35')),   // key azimuth in degrees from +u
  litEl: parseFloat(opt('keyel', '22')),    // key elevation above the surface plane
};

const result = await page.evaluate(async (cfg) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const N = await import('/src/textures/NormalMap.js');

  const CONSUMER_UV_SCALE = { sand_ripples: 1, sand_fine: 1 };
  function hashName(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  const pct = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
  const rms = (a) => { let m = 0, m2 = 0; for (let i = 0; i < a.length; i++) { m += a[i]; m2 += a[i] * a[i]; } m /= a.length; return Math.sqrt(Math.max(0, m2 / a.length - m * m)); };

  function toPNG(w, h, rgb) {
    const cv = new OffscreenCanvas(w, h);
    const cx = cv.getContext('2d');
    const img = cx.createImageData(w, h);
    img.data.set(rgb);
    cx.putImageData(img, 0, 0);
    return cv.convertToBlob({ type: 'image/png' }).then((b) => new Promise((res) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b);
    }));
  }

  const list = cfg.all ? M.MATERIAL_NAMES : cfg.names;
  const rows = [], images = {};

  for (const name of list) {
    const recipe = M.MATERIALS[name];
    if (!recipe) { rows.push({ name, error: 'no recipe' }); continue; }
    const sz = recipe.size ? Math.min(recipe.size, cfg.size) : (recipe.tier >= 1 ? Math.max(256, cfg.size >> 1) : cfg.size);
    const s = new C.Surface(sz, (recipe.seed ?? hashName(name)) >>> 0);
    recipe.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    const out = N.derive(s, {
      bump: recipe.bump ?? 0.03, tile: recipe.tile ?? 2.0,
      normalScale: recipe.normalScale ?? 1.0, aoStrength: recipe.aoStrength ?? 1.0,
      aoFloor: recipe.aoFloor ?? 0.16, micro: recipe.micro ?? 0.10,
      ormDiv: recipe.ormDiv ?? 2, smoothH: recipe.smoothH ?? 0, microSoft: recipe.microSoft ?? 0.35,
    });
    const n = sz * sz;
    const alb = out.albedo;

    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = (alb[i * 4] * 0.2126 + alb[i * 4 + 1] * 0.7152 + alb[i * 4 + 2] * 0.0722) / 255;
    const ys = Float32Array.from(y).sort();
    const CREV = (0x4a * 0.2126 + 0x2f * 0.7152 + 0x22 * 0.0722) / 255;
    let dark = 0; for (let i = 0; i < n; i++) if (y[i] < CREV) dark++;

    // mip ladder, all the way down — the tail is the tiling signature
    const ladder = [], tailP99 = []; let cur = y, cw = sz;
    while (cw > 2) {
      const h = cw >> 1, nx = new Float32Array(h * h);
      for (let v = 0; v < h; v++) for (let u = 0; u < h; u++) {
        const a = 2 * v * cw + 2 * u;
        nx[v * h + u] = (cur[a] + cur[a + 1] + cur[a + cw] + cur[a + cw + 1]) * 0.25;
      }
      cur = nx; cw = h; ladder.push(+rms(cur).toFixed(4));
      /* Bright-tail survival. A hard glint is a highlight only if the crest carrying it is
       * wider than a pixel; if it is not, minification averages it into the base and the
       * material goes flat at exactly the distance it is seen from. p99 per mip level says
       * when that happens, in texels, which converts straight to metres and then to pixels. */
      const cs = Float32Array.from(cur).sort();
      tailP99.push(+pct(cs, 0.99).toFixed(3));
    }
    const full = rms(y);
    // detail half-life: first mip level whose rms drops below half of full-res rms
    let half = ladder.findIndex((r) => r < full * 0.5); if (half < 0) half = ladder.length;

    const os = out.orm.size, on = os * os;
    const ao = new Float32Array(on), rgh = new Float32Array(on);
    for (let i = 0; i < on; i++) { ao[i] = out.orm.data[i * 4] / 255; rgh[i] = out.orm.data[i * 4 + 1] / 255; }
    const aoS = Float32Array.from(ao).sort(), rghS = Float32Array.from(rgh).sort();

    const tilt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      /* The slope scale `ku` is applied inside heightToNormal *before* normalising, so the
       * encoded normal is already the true knee-limited normal. Multiplying by it again here
       * (which is what `bundle.normalScale` would make a consumer do) inflates every tilt. */
      const nx = (out.normal[i * 4] / 255) * 2 - 1;
      const ny = (out.normal[i * 4 + 1] / 255) * 2 - 1;
      const nz = (out.normal[i * 4 + 2] / 255) * 2 - 1;
      tilt[i] = Math.acos(Math.max(-1, Math.min(1, nz / Math.hypot(nx, ny, nz)))) * 180 / Math.PI;
    }
    const tiltS = Float32Array.from(tilt).sort();

    /* Joint sign, exactly as Textures._build computes it — the build-time assertion that mortar
     * must be darker AND lower than the block faces either side of it. Both must be negative. */
    let joint = null;
    if (s.masonry) {
      const m = s.masonry;
      let jy = 0, jh = 0, jn = 0, fy = 0, fh = 0, fn = 0;
      for (let i = 0; i < n; i++) {
        const yy = s.r[i] * 0.2126 + s.g[i] * 0.7152 + s.b[i] * 0.0722;
        if (m.joint[i] > 0.6) { jy += yy; jh += s.h[i]; jn++; }
        else if (m.joint[i] < 0.05) { fy += yy; fh += s.h[i]; fn++; }
      }
      if (jn && fn) joint = { dY: +((jy / jn) - (fy / fn)).toFixed(4), dH: +((jh / jn) - (fh / fn)).toFixed(4) };
    }

    const tu = Array.isArray(recipe.tile) ? recipe.tile[0] : (recipe.tile ?? 2);
    const worldTile = tu * (CONSUMER_UV_SCALE[name] ?? 2);
    const mmPerTexel = (worldTile / sz) * 1000;

    /* THE PERCENTILE ARRAYS BELOW USE FOUR DIFFERENT CONVENTIONS, AND THAT HAS COST REAL WORK.
     *
     * `lumaP` is p1/5/50/95/99, `aoP` is p1/5/50, `roughP` is p5/50/95, `tiltP` is p50/90/99.
     * KNOWN_ISSUES §34 records `aoP` being read with **`roughP`'s** convention — i.e. the labels
     * of another field two lines below — which turned p1 0.247 · p5 0.416 · p50 0.992 into
     * "authored median 0.412". That single mislabelling propagated into `PREREG-aokey.md`, two
     * shipped source comments, and (§122.2) a ledger section and a routed task 87 sections later.
     *
     * §34's rule is *a percentile triple must carry its percentiles at every hop*, and a bare
     * array in a JSON file on disk is the hop where that rule was silently not being kept: the
     * emitted record had the numbers and none of the labels. So `pcts` ships beside them. It is
     * additive — every existing key keeps its name, order and value, so older baselines still
     * compare field-for-field — and it means a reader of the JSON never has to find this file.
     *
     * If you add a percentile array here, add it to `pcts` in the same edit. */
    const PCTS = { lumaP: [1, 5, 50, 95, 99], aoP: [1, 5, 50], roughP: [5, 50, 95], tiltP: [50, 90, 99] };
    rows.push({
      name, group: recipe.group, tier: recipe.tier ?? 0, size: sz,
      tile: recipe.tile, worldTile: +worldTile.toFixed(2), bump: recipe.bump,
      mmPerTexel: +mmPerTexel.toFixed(2),
      lumaP: PCTS.lumaP.map((p) => +pct(ys, p / 100).toFixed(3)),
      lumaRms: +full.toFixed(4),
      mipLadder: ladder, tailP99, joint,
      // world size of the dominant detail, from the mip half-life
      detailMm: +(Math.pow(2, half + 1) * mmPerTexel).toFixed(0),
      darkTail: +(dark / n).toFixed(4),
      aoP: PCTS.aoP.map((p) => +pct(aoS, p / 100).toFixed(3)),
      roughP: PCTS.roughP.map((p) => +pct(rghS, p / 100).toFixed(3)),
      tiltP: PCTS.tiltP.map((p) => +pct(tiltS, p / 100).toFixed(2)),
      slopeScale: +out.normalStrength.toFixed(2),
      pcts: PCTS,
    });

    /* ---- images ---- */
    if (cfg.tile) images[`${name}.tile`] = await toPNG(sz, sz, alb);

    if (cfg.wall) {
      // Tile R x R and box-downsample to wallPx — what the wall looks like on screen.
      const R = cfg.wallRep, W = cfg.wallPx;
      const buf = new Uint8ClampedArray(W * W * 4);
      const scale = (sz * R) / W;
      for (let v = 0; v < W; v++) {
        for (let u = 0; u < W; u++) {
          let r = 0, g = 0, b = 0, c = 0;
          const u0 = Math.floor(u * scale), u1 = Math.max(u0 + 1, Math.floor((u + 1) * scale));
          const v0 = Math.floor(v * scale), v1 = Math.max(v0 + 1, Math.floor((v + 1) * scale));
          for (let vv = v0; vv < v1; vv++) for (let uu = u0; uu < u1; uu++) {
            const i = ((vv % sz) * sz + (uu % sz)) * 4;
            r += alb[i]; g += alb[i + 1]; b += alb[i + 2]; c++;
          }
          const o = (v * W + u) * 4;
          buf[o] = r / c; buf[o + 1] = g / c; buf[o + 2] = b / c; buf[o + 3] = 255;
        }
      }
      images[`${name}.wall`] = await toPNG(W, W, buf);
    }

    if (cfg.lit) {
      /* Raking key + 3-band cel quantiser + the shader's hard-stepped spec, run on this
       * material alone. Not a prediction of the frame — an isolation of the *authoring*:
       * relief, value range and highlight behaviour with the scene taken out. */
      const az = cfg.litKey * Math.PI / 180, el = cfg.litEl * Math.PI / 180;
      const L = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
      const V = [0, 0, 1];
      const H = [L[0] + V[0], L[1] + V[1], L[2] + V[2]];
      const hl = Math.hypot(...H); H[0] /= hl; H[1] /= hl; H[2] /= hl;
      const gloss0 = { metal: 110, carved: 24, stone: 20, organic: 16, sly: 30, fx: 20 }[recipe.group] ?? 24;
      const spec0 = { metal: 0.95, carved: 0.3, stone: 0.14, organic: 0.1, sly: 0.2, fx: 0.1 }[recipe.group] ?? 0.2;
      const buf = new Uint8ClampedArray(n * 4);
      for (let i = 0; i < n; i++) {
        const nx = (out.normal[i * 4] / 255) * 2 - 1;
        const ny = (out.normal[i * 4 + 1] / 255) * 2 - 1;
        const nz = (out.normal[i * 4 + 2] / 255) * 2 - 1;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const Nv = [nx / nl, ny / nl, nz / nl];
        const ndl = Math.max(0, Nv[0] * L[0] + Nv[1] * L[1] + Nv[2] * L[2]);
        // 3-band quantiser, softened terminator (matches slyRamp's intent)
        const b = Math.min(1, Math.max(0, ndl));
        const band = b < 0.33 ? 0.18 : b < 0.66 ? 0.55 : 1.0;
        const oi = Math.floor(i / (recipe.ormDiv ?? 2) ** 0); // orm is half-res; index below
        const ox = Math.floor((i % sz) / (sz / os)), oy = Math.floor(Math.floor(i / sz) / (sz / os));
        const oidx = oy * os + ox;
        const rg = Math.min(1, Math.max(0.03, rgh[oidx]));
        const aoV = ao[oidx];
        const ndh = Math.max(0, Nv[0] * H[0] + Nv[1] * H[1] + Nv[2] * H[2]);
        const gp = Math.max(4, gloss0 * (1 - 0.6 * rg));
        const lobe = Math.pow(ndh, gp);
        const st = (x, e0, e1) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        const specStep = st(lobe, 0.30, 0.52) + 0.35 * st(lobe, 0.02, 0.30);
        const specAmt = spec0 * (1 - 0.75 * rg);
        const sp = 255 * specAmt * specStep * (ndl > 0.02 ? 1 : 0);
        const o = i * 4;
        for (let c = 0; c < 3; c++) {
          const amb = 0.22 * aoV;
          buf[o + c] = alb[o + c] * (band * 0.85 + amb) + sp * [1.0, 0.984, 0.91][c];
        }
        buf[o + 3] = 255;
      }
      images[`${name}.lit`] = await toPNG(sz, sz, buf);
      // squint: same image at 1/8
      const q = sz >> 3, sq = new Uint8ClampedArray(q * q * 4);
      for (let v = 0; v < q; v++) for (let u = 0; u < q; u++) {
        let r = 0, g = 0, bb = 0;
        for (let vv = 0; vv < 8; vv++) for (let uu = 0; uu < 8; uu++) {
          const i = ((v * 8 + vv) * sz + (u * 8 + uu)) * 4;
          r += buf[i]; g += buf[i + 1]; bb += buf[i + 2];
        }
        const o = (v * q + u) * 4;
        sq[o] = r / 64; sq[o + 1] = g / 64; sq[o + 2] = bb / 64; sq[o + 3] = 255;
      }
      images[`${name}.squint`] = await toPNG(q, q, sq);
    }
  }
  return { rows, images };
}, cfg);

const outDir = opt('out', null);
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [k, v] of Object.entries(result.images)) {
    fs.writeFileSync(path.join(outDir, `${k}.png`), Buffer.from(String(v).split(',')[1], 'base64'));
  }
}
const jsonPath = opt('json', null);
const payload = JSON.stringify({ rows: result.rows }, null, 1);
if (jsonPath) fs.writeFileSync(jsonPath, payload); else console.log(payload);

await browser.close();
server.close();
process.exit(0);
