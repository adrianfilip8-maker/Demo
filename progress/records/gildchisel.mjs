/**
 * gildchisel — the offline A/B for KNOWN_ISSUES §125's chisel pass, scored against the registered
 * baseline in `progress/records/gild/texlab-baseline.json`.
 *
 * Three arms in ONE process, so the comparison cannot be contaminated by a tree that moved between
 * runs (§121.4, §125.5 — five agents commit concurrently and the git SHA is not the provenance
 * fact an A/B needs):
 *
 *   ctl   `__TEX_AB = 'hgchisel'`   the shipped state, restored by construction
 *   hgt   `__TEX_AB = 'hgsignval'`  the chisel cut in the HEIGHT field only
 *   cand  `__TEX_AB = ''`           height + the albedo value span (what ships)
 *
 * The statistic block is copied verbatim from `tools/texlab.mjs` — same `derive()` arguments, same
 * percentile conventions, same joint-sign computation as `Textures._build`'s build-time assertion
 * — so every field compares directly with the baseline JSON. Percentiles carry their labels
 * (§34): lumaP p1/5/50/95/99, aoP p1/5/50, roughP p5/50/95, tiltP p50/90/99.
 *
 * SCOPE — the transforms between this and what the renderer draws (§11), i.e. what it does NOT do:
 *   no lighting, no shadow map, no cel ramp, no specular, no AgX/grade, no ink pass, no GPU mip
 *   or anisotropic filter, no camera, no geometry, no consumer UV factor beyond the x2 already in
 *   `worldTile`. It measures the built Surface plus `derive()`. A number here is a statement about
 *   the texture and never about the frame. In particular it cannot see that `hero`'s gilded mass
 *   is 98.6 % shadowed, which is the whole reason the `hgt` arm is reported separately from
 *   `cand`: relief reaches a lit surface, albedo reaches every surface.
 *
 *   node progress/records/gildchisel.mjs [--size 1024] [--json out.json]
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = '/home/user/Demo';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const SIZE = parseInt(opt('size', '1024'), 10);

/* Provenance, per §125.5 — a tree hash over what the bundler actually reads, not the git SHA. */
const treeHash = (() => {
  try {
    return execSync('find src -name "*.js" -print0 | sort -z | xargs -0 cat | md5sum', { cwd: ROOT }).toString().slice(0, 12);
  } catch { return 'unknown'; }
})();

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 20100 + (process.pid % 300);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const out = await page.evaluate(async ({ SIZE }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const N = await import('/src/textures/NormalMap.js');

  const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const pct = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
  const rms = (a) => { let m = 0, m2 = 0; for (let i = 0; i < a.length; i++) { m += a[i]; m2 += a[i] * a[i]; } m /= a.length; return Math.sqrt(Math.max(0, m2 / a.length - m * m)); };

  /* ---- texlab.mjs's row, verbatim ---- */
  function measure(name, s, out, sz) {
    const recipe = M.MATERIALS[name];
    const n = sz * sz, alb = out.albedo;
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = (alb[i * 4] * 0.2126 + alb[i * 4 + 1] * 0.7152 + alb[i * 4 + 2] * 0.0722) / 255;
    const ys = Float32Array.from(y).sort();
    const CREV = (0x4a * 0.2126 + 0x2f * 0.7152 + 0x22 * 0.0722) / 255;
    let dark = 0; for (let i = 0; i < n; i++) if (y[i] < CREV) dark++;
    const ladder = []; let cur = y, cw = sz;
    while (cw > 2) {
      const h = cw >> 1, nx = new Float32Array(h * h);
      for (let v = 0; v < h; v++) for (let u = 0; u < h; u++) {
        const a = 2 * v * cw + 2 * u;
        nx[v * h + u] = (cur[a] + cur[a + 1] + cur[a + cw] + cur[a + cw + 1]) * 0.25;
      }
      cur = nx; cw = h; ladder.push(+rms(cur).toFixed(4));
    }
    const os = out.orm.size, on = os * os;
    const ao = new Float32Array(on), rgh = new Float32Array(on);
    for (let i = 0; i < on; i++) { ao[i] = out.orm.data[i * 4] / 255; rgh[i] = out.orm.data[i * 4 + 1] / 255; }
    const aoS = Float32Array.from(ao).sort(), rghS = Float32Array.from(rgh).sort();
    const tilt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const nx = (out.normal[i * 4] / 255) * 2 - 1;
      const ny = (out.normal[i * 4 + 1] / 255) * 2 - 1;
      const nz = (out.normal[i * 4 + 2] / 255) * 2 - 1;
      tilt[i] = Math.acos(Math.max(-1, Math.min(1, nz / Math.hypot(nx, ny, nz)))) * 180 / Math.PI;
    }
    const tiltS = Float32Array.from(tilt).sort();
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
    const PCTS = { lumaP: [1, 5, 50, 95, 99], aoP: [1, 5, 50], roughP: [5, 50, 95], tiltP: [50, 90, 99] };
    return {
      name, size: sz,
      lumaP: PCTS.lumaP.map((p) => +pct(ys, p / 100).toFixed(3)),
      lumaRms: +rms(y).toFixed(4),
      mipLadder: ladder,
      joint,
      darkTail: +(dark / n).toFixed(4),
      aoP: PCTS.aoP.map((p) => +pct(aoS, p / 100).toFixed(3)),
      roughP: PCTS.roughP.map((p) => +pct(rghS, p / 100).toFixed(3)),
      tiltP: PCTS.tiltP.map((p) => +pct(tiltS, p / 100).toFixed(2)),
      slopeScale: +out.normalStrength.toFixed(2),
      pcts: PCTS,
    };
  }

  /* The seam row `glyphArchitrave` draws, in TILE-V terms: band = signM/worldTile = 0.85/6.4,
     centred on V = 0 and wrapping. 78-95 % of this recipe's on-screen pixels live inside it
     (`gilduv.mjs`), so a whole-tile statistic averages the subject with the mid-tile frieze. */
  const BAND_VH = 0.5 * (0.85 / 6.4);
  const inBand = (row, sz) => { const v = row / sz; return v <= BAND_VH || v >= 1 - BAND_VH; };

  /* Restricted albedo/height statistics, so "did the band change" is not diluted by 87 % of a
     tile that this change does not touch. */
  function bandStats(s, out, sz) {
    const alb = out.albedo;
    const ys = [], hs = [], rg = [];
    for (let row = 0; row < sz; row++) {
      if (!inBand(row, sz)) continue;
      for (let x = 0; x < sz; x++) {
        const i = row * sz + x;
        ys.push((alb[i * 4] * 0.2126 + alb[i * 4 + 1] * 0.7152 + alb[i * 4 + 2] * 0.0722) / 255);
        hs.push(s.h[i]); rg.push(s.rough[i]);
      }
    }
    const sorted = Float32Array.from(ys).sort();
    const p = (q) => +sorted[Math.round(q * (sorted.length - 1))].toFixed(4);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) * (b - mean), 0) / ys.length);
    const hSorted = Float32Array.from(hs).sort();
    const rSorted = Float32Array.from(rg).sort();
    return {
      n: ys.length,
      lumaP5: p(0.05), lumaP50: p(0.50), lumaP95: p(0.95),
      span: +(p(0.95) / Math.max(1e-6, p(0.05))).toFixed(3),
      lumaSd: +sd.toFixed(4),
      hP5: +hSorted[Math.round(0.05 * (hSorted.length - 1))].toFixed(4),
      hP50: +hSorted[Math.round(0.50 * (hSorted.length - 1))].toFixed(4),
      hRange: +(hSorted[hSorted.length - 1] - hSorted[0]).toFixed(4),
      roughP5: +rSorted[Math.round(0.05 * (rSorted.length - 1))].toFixed(4),
      roughP95: +rSorted[Math.round(0.95 * (rSorted.length - 1))].toFixed(4),
    };
  }

  /* Squint guard: box-downsample the band strip by 8 and report its sd. The busy/noisy failure
     shows up here as a RISE; the flat failure shows up in `lumaSd` above as a fall. Both §7.3
     conditions have to pass at once, so both numbers are printed side by side every arm. */
  function bandSquint(out, sz, k = 8) {
    const alb = out.albedo;
    const rows = [];
    for (let row = 0; row < sz; row++) if (inBand(row, sz)) rows.push(row);
    const H = Math.floor(rows.length / k), W = Math.floor(sz / k);
    const v = new Float64Array(H * W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a = 0;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
        const i = rows[y * k + dy] * sz + (x * k + dx);
        a += (alb[i * 4] * 0.2126 + alb[i * 4 + 1] * 0.7152 + alb[i * 4 + 2] * 0.0722) / 255;
      }
      v[y * W + x] = a / (k * k);
    }
    const m = v.reduce((p, c) => p + c, 0) / v.length;
    return +Math.sqrt(v.reduce((p, c) => p + (c - m) * (c - m), 0) / v.length).toFixed(4);
  }

  /* THE CROSS-MATERIAL CONTROL, registered before the cut.
   *
   * GEOMETRY measured, in one `courtyard` frame under one light, that the beaded gilded lintel
   * ring reads L 69.9 / chroma 0.335 / (b-r) -0.061 against **plain sunlit paving** at L 94.8 /
   * 0.559 / -0.288. The gilding is cooler and less saturated than ordinary sandstone in the same
   * frame. That is the bar, and every previous number on this recipe was within-material and
   * could not see it.
   *
   * Convention is §121.9's, so the rows compare: chroma = (max-min)/max of the mean RGB,
   * (b-r)/255, L = Rec.709 luma of the mean RGB on 0..255.
   *
   * SCOPE, and it is the whole caveat: this is **albedo, before any lighting**. GEOMETRY's row is
   * a rendered frame. So the two are not the same quantity and the absolute numbers must not be
   * set against each other — what this registers is whether cutting the relief moves the gild's
   * *authored* chroma toward or away from paving's, which is the only half of the question a CPU
   * lab can answer. The gilded row is restricted to `metal > 0.5`, i.e. the leaf itself rather
   * than the limestone rail above and below it. */
  function colour(s, out, sz, sel) {
    const alb = out.albedo;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < sz * sz; i++) {
      if (!sel(i, Math.floor(i / sz))) continue;
      r += alb[i * 4]; g += alb[i * 4 + 1]; b += alb[i * 4 + 2]; n++;
    }
    if (!n) return null;
    r /= n; g /= n; b /= n;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return {
      n, L: +(r * 0.2126 + g * 0.7152 + b * 0.0722).toFixed(1),
      chroma: +(mx > 0 ? (mx - mn) / mx : 0).toFixed(3),
      bMinusR: +((b - r) / 255).toFixed(3),
      rgb: [+r.toFixed(1), +g.toFixed(1), +b.toFixed(1)],
    };
  }

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

  const NAMES = ['hieroglyph_gilded', 'hieroglyph_wall', 'column_papyrus', 'sandstone_block', 'gold_leaf'];
  const ARMS = [['ctl', 'hgchisel'], ['hgt', 'hgsignval'], ['cand', '']];

  const res = {};
  const surfaces = {};
  for (const [arm, ab] of ARMS) {
    globalThis.__TEX_AB = ab;
    res[arm] = {};
    surfaces[arm] = {};
    for (const name of NAMES) {
      const recipe = M.MATERIALS[name];
      const sz = recipe.size ? Math.min(recipe.size, SIZE) : (recipe.tier >= 1 ? Math.max(256, SIZE >> 1) : SIZE);
      const s = new C.Surface(sz, (recipe.seed ?? hashName(name)) >>> 0);
      recipe.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
      const der = N.derive(s, {
        bump: recipe.bump ?? 0.03, tile: recipe.tile ?? 2.0,
        normalScale: recipe.normalScale ?? 1.0, aoStrength: recipe.aoStrength ?? 1.0,
        aoFloor: recipe.aoFloor ?? 0.16, micro: recipe.micro ?? 0.10,
        ormDiv: recipe.ormDiv ?? 2, smoothH: recipe.smoothH ?? 0, microSoft: recipe.microSoft ?? 0.35,
      });
      const row = measure(name, s, der, sz);
      row.hash = hash(s);
      if (name === 'hieroglyph_gilded') {
        row.band = bandStats(s, der, sz);
        row.bandSquint8 = bandSquint(der, sz);
      }
      res[arm][name] = row;
      if (name === 'hieroglyph_gilded') surfaces[arm][name] = { r: Array.from(s.r), g: Array.from(s.g), b: Array.from(s.b), h: Array.from(s.h), size: sz };
    }
  }
  globalThis.__TEX_AB = '';

  /* Signed per-texel diffs against the control, restricted to the seam band and split into the
     sign population and the surrounding panel field, because a mean over the band alone cannot
     distinguish "the signs got darker" from "everything got darker". */
  function split(a, b, sz) {
    let dSign = 0, nSign = 0, dField = 0, nField = 0, maxAbs = 0, moved = 0;
    for (let row = 0; row < sz; row++) {
      const v = row / sz;
      if (!(v <= BAND_VH || v >= 1 - BAND_VH)) continue;
      for (let x = 0; x < sz; x++) {
        const i = row * sz + x;
        const ya = a.r[i] * 0.2126 + a.g[i] * 0.7152 + a.b[i] * 0.0722;
        const yb = b.r[i] * 0.2126 + b.g[i] * 0.7152 + b.b[i] * 0.0722;
        const dh = b.h[i] - a.h[i];
        const dy = yb - ya;
        if (Math.abs(dy) > 1e-4) moved++;
        if (Math.abs(dy) > maxAbs) maxAbs = Math.abs(dy);
        // "sign" = a texel the chisel actually cut, read off the height diff.
        if (dh < -0.01) { dSign += dy; nSign++; } else { dField += dy; nField++; }
      }
    }
    return {
      signTexels: nSign, fieldTexels: nField,
      signFrac: +(nSign / (nSign + nField)).toFixed(4),
      meanDLumaSign: +(nSign ? dSign / nSign : 0).toFixed(4),
      meanDLumaField: +(nField ? dField / nField : 0).toFixed(4),
      maxAbsDLuma: +maxAbs.toFixed(4),
      movedFrac: +(moved / (nSign + nField)).toFixed(4),
    };
  }

  const diffs = {
    'hgt-vs-ctl': split(surfaces.ctl.hieroglyph_gilded, surfaces.hgt.hieroglyph_gilded, surfaces.ctl.hieroglyph_gilded.size),
    'cand-vs-ctl': split(surfaces.ctl.hieroglyph_gilded, surfaces.cand.hieroglyph_gilded, surfaces.ctl.hieroglyph_gilded.size),
  };
  return { res, diffs };
}, { SIZE });

await browser.close(); server.close();

const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress/records/gild/texlab-baseline.json'), 'utf8')).rows[0];
const { res, diffs } = out;

console.log(`gildchisel — KNOWN_ISSUES §125 chisel pass, offline A/B.  tree ${treeHash}  size ${SIZE}`);
console.log('arms: ctl = __TEX_AB hgchisel (shipped)  ·  hgt = hgsignval (height only)  ·  cand = shipped-to-be\n');

console.log('CONTROL — does the `hgchisel` arm restore the registered baseline?');
const chk = [
  ['darkTail', (r) => r.darkTail, base.darkTail],
  ['lumaRms', (r) => r.lumaRms, base.lumaRms],
  ['joint.dY', (r) => r.joint.dY, base.joint.dY],
  ['joint.dH', (r) => r.joint.dH, base.joint.dH],
  ['aoP p1/5/50', (r) => r.aoP.join('/'), base.aoP.join('/')],
  ['roughP p5/50/95', (r) => r.roughP.join('/'), base.roughP.join('/')],
  ['tiltP p50/90/99', (r) => r.tiltP.join('/'), base.tiltP.join('/')],
  ['slopeScale', (r) => r.slopeScale, base.slopeScale],
  ['lumaP p1/5/50/95/99', (r) => r.lumaP.join('/'), base.lumaP.join('/')],
];
for (const [label, f, want] of chk) {
  const got = f(res.ctl.hieroglyph_gilded);
  console.log(`  ${label.padEnd(22)} baseline ${String(want).padEnd(30)} ctl ${String(got).padEnd(30)} ${String(got) === String(want) ? 'MATCH' : '*** DIFFERS ***'}`);
}

console.log('\nINVARIANTS on `hieroglyph_gilded` across the three arms');
console.log('  arm    darkTail   joint.dY   joint.dH   lumaRms   tiltP p50/p90/p99      aoP p1/p5/p50');
for (const a of ['ctl', 'hgt', 'cand']) {
  const r = res[a].hieroglyph_gilded;
  console.log(`  ${a.padEnd(6)} ${String(r.darkTail).padEnd(10)} ${String(r.joint.dY).padEnd(10)} ${String(r.joint.dH).padEnd(10)} ${String(r.lumaRms).padEnd(9)} ${r.tiltP.join(' / ').padEnd(22)} ${r.aoP.join(' / ')}`);
}

console.log('\nNULLS — every other recipe must be BIT-IDENTICAL across arms (the change is scoped)');
for (const name of ['hieroglyph_wall', 'column_papyrus', 'sandstone_block', 'gold_leaf']) {
  const h = ['ctl', 'hgt', 'cand'].map((a) => res[a][name].hash);
  console.log(`  ${name.padEnd(20)} ${h.join('  ')}   ${h[0] === h[1] && h[1] === h[2] ? 'IDENTICAL' : '*** MOVED ***'}`);
}

console.log('\nTHE SEAM BAND (78-95 % of this recipe\'s on-screen pixels) — albedo value span and squint');
console.log('  arm    lumaP5   lumaP50  lumaP95  span    lumaSd(1:1)  squint sd(1/8)  h p5/p50  rough p5/p95');
for (const a of ['ctl', 'hgt', 'cand']) {
  const r = res[a].hieroglyph_gilded, b = r.band;
  console.log(`  ${a.padEnd(6)} ${String(b.lumaP5).padEnd(8)} ${String(b.lumaP50).padEnd(8)} ${String(b.lumaP95).padEnd(8)} ${String(b.span).padEnd(7)} ${String(b.lumaSd).padEnd(12)} ${String(r.bandSquint8).padEnd(15)} ${b.hP5}/${b.hP50}   ${b.roughP5}/${b.roughP95}`);
}

console.log('\nWHERE THE CHANGE LANDED — signed luma diff vs ctl, split on whether the chisel cut the texel');
for (const [k, d] of Object.entries(diffs)) {
  console.log(`  ${k.padEnd(14)} cut texels ${String(d.signTexels).padStart(6)} (${(d.signFrac * 100).toFixed(1)} % of band)  ` +
    `mean dLuma  cut ${d.meanDLumaSign >= 0 ? '+' : ''}${d.meanDLumaSign}  field ${d.meanDLumaField >= 0 ? '+' : ''}${d.meanDLumaField}  ` +
    `max |d| ${d.maxAbsDLuma}  moved ${(d.movedFrac * 100).toFixed(1)} %`);
}

if (opt('json', null)) {
  fs.writeFileSync(opt('json'), JSON.stringify({ tree: treeHash, size: SIZE, res, diffs }, null, 1));
  console.log(`\nwrote ${opt('json')}`);
}
