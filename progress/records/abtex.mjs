/**
 * abtex — build one recipe **twice from the same tree**, with `Canvas2D.abOff` treatments on and
 * off, and score both arms with matflat's own statistics resampled to a framing's mm/px.
 *
 * Why it exists: every texture-side A/B in this project has so far been done by pointing a tool
 * at two git roots (`ringab.mjs`), which cannot be run against an uncommitted edit and prices a
 * comparison at two checkouts. `abOff` reads its flag per call, so both arms build in one page.
 *
 * SCOPE — the transforms between this and the rendered frame, i.e. the suffix NOT implemented
 * (KNOWN_ISSUES §11):
 *   no lighting, no shadow, no cel quantiser, no AgX/grade/saturation/split, no ink pass, no
 *   bloom, no GPU mip filtering (it box-downsamples), no geometry, no consumer UV factor beyond
 *   the `--uv` multiplier you pass, no character/FX occlusion. It resamples the built albedo to
 *   a stated mm/px and applies the SAME band-pass definitions `matflat.mjs` applies to a frame:
 *   fine = |L - G(1.6)| / G(14), coarse = |G(1.6) - G(6)| / G(14), cov1 = share(fine >= 0.01),
 *   covC2 = share(coarse >= 0.02).
 *
 *   So a number here is "what the albedo offers the frame at this scale", and the frame's own
 *   number will be lower wherever the grade compresses it — §70.2 sizes that at G = 0.625 in
 *   the dark bin and 0.244 in the bright one. **Do not read a delta here as a prediction of the
 *   delta in frame.** §70 is the case where a texture-side +17.6 points delivered zero.
 *
 *   node abtex.mjs granite_pink --off granite --mmpx 20.6 --uv 2
 *   node abtex.mjs hieroglyph_wall,hieroglyph_gilded --off hgrelief --mmpx 20.6,30.6,41.9
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/Demo';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const names = String(argv[0] || 'granite_pink').split(',');
const OFF = String(opt('off', 'base'));
const MMPX = String(opt('mmpx', '20.6')).split(',').map(Number);
const UV = parseFloat(opt('uv', '2'));      // consumer UV factor: architecture stretches 1 tile over 2*tile m
const SIZE = parseInt(opt('size', '1024'), 10);

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 6500 + (process.pid % 300);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  [console]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const KNOBS = {};
for (let i = 0; i < argv.length; i++) if (argv[i] === '--set') { const [k, v] = String(argv[i + 1]).split('='); KNOBS[k] = Number(v); }
const out = await page.evaluate(async ({ names, OFF, MMPX, UV, SIZE, KNOBS }) => {
  for (const k in KNOBS) globalThis[k] = KNOBS[k];
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const N = await import('/src/textures/NormalMap.js');
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

  // Separable gaussian, mirrored at the edge — matflat clamps, and a tile is periodic, so wrap.
  const gaussWrap = (src, w, h, sigma) => {
    const r = Math.max(1, Math.ceil(sigma * 3));
    const k = new Float32Array(2 * r + 1); let sum = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; sum += v; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const tmp = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += src[y * w + ((x + i + w * 4) % w)] * k[i + r]; tmp[y * w + x] = a; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += tmp[((y + i + h * 4) % h) * w + x] * k[i + r]; o[y * w + x] = a; }
    return o;
  };
  const box = (src, sz, w) => {                   // box-downsample sz -> w
    const o = new Float32Array(w * w), c = new Float32Array(w * w);
    for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
      const k = ((y * w / sz) | 0) * w + ((x * w / sz) | 0);
      o[k] += src[y * sz + x]; c[k]++;
    }
    for (let i = 0; i < o.length; i++) o[i] /= c[i];
    return o;
  };
  const sd = (a) => { let m = 0, m2 = 0; for (const v of a) { m += v; m2 += v * v; } m /= a.length; return Math.sqrt(Math.max(0, m2 / a.length - m * m)); };

  const build = (name, off) => {
    globalThis.__TEX_AB = off;
    const r = M.MATERIALS[name];
    const sz = r.size ? Math.min(r.size, SIZE) : (r.tier >= 1 ? Math.max(256, SIZE >> 1) : SIZE);
    const s = new C.Surface(sz, (r.seed ?? hash(name)) >>> 0);
    r.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    const d = N.derive(s, {
      bump: r.bump ?? 0.03, tile: r.tile ?? 2, normalScale: r.normalScale ?? 1,
      aoStrength: r.aoStrength ?? 1, aoFloor: r.aoFloor ?? 0.16, micro: r.micro ?? 0.1,
      ormDiv: r.ormDiv ?? 2, smoothH: r.smoothH ?? 0, microSoft: r.microSoft ?? 0.35,
    });
    globalThis.__TEX_AB = undefined;
    const n = sz * sz, lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = (d.albedo[i * 4] * 0.2126 + d.albedo[i * 4 + 1] * 0.7152 + d.albedo[i * 4 + 2] * 0.0722) / 255;
    const tu = Array.isArray(r.tile) ? r.tile[0] : r.tile;
    /* Glyph-adjacent sub-mask, taken from the HEIGHT field.
     *
     * Why height: the arris is albedo + roughness only (`carve()` writes `mixHex` and `rough`,
     * never `s.h`), so `s.h` is bit-identical between the arms and a mask derived from it
     * cannot be tuned by the treatment. Choosing the sub-mask from the *difference set* would
     * be circular; choosing it from the control's albedo would still be arm-dependent.
     * cut = texels sunk below a 12-texel local mean; ring = raised stone within RING texels
     * of a cut texel. That is where a lip lives, by construction. */
    const cutN = (() => {
      const h = s.h, N2 = sz * sz;
      // 12-texel separable box mean, wrapped (the tile is periodic).
      const R = 12, tmp = new Float32Array(N2), lm = new Float32Array(N2);
      for (let y = 0; y < sz; y++) { let acc = 0; for (let i = -R; i <= R; i++) acc += h[y * sz + ((i + sz) % sz)];
        for (let x = 0; x < sz; x++) { tmp[y * sz + x] = acc / (2 * R + 1);
          acc += h[y * sz + ((x + R + 1) % sz)] - h[y * sz + ((x - R + sz) % sz)]; } }
      for (let x = 0; x < sz; x++) { let acc = 0; for (let i = -R; i <= R; i++) acc += tmp[((i + sz) % sz) * sz + x];
        for (let y = 0; y < sz; y++) { lm[y * sz + x] = acc / (2 * R + 1);
          acc += tmp[(((y + R + 1) % sz)) * sz + x] - tmp[(((y - R + sz) % sz)) * sz + x]; } }
      let m = 0, m2 = 0; for (let i = 0; i < N2; i++) { const d2 = h[i] - lm[i]; m += d2; m2 += d2 * d2; }
      m /= N2; const sdv = Math.sqrt(Math.max(1e-9, m2 / N2 - m * m));
      const cut = new Uint8Array(N2);
      for (let i = 0; i < N2; i++) if (h[i] - lm[i] < m - 0.75 * sdv) cut[i] = 1;
      return cut;
    })();
    const RING = 6;                                   // texels; the measured p50 ring width
    const ring = new Uint8Array(sz * sz);
    {
      // Chebyshev dilation of `cut` by RING, minus `cut` itself.
      const dil = new Uint8Array(sz * sz), tmp = new Uint8Array(sz * sz);
      for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) { let v = 0;
        for (let i = -RING; i <= RING && !v; i++) if (cutN[y * sz + ((x + i + sz) % sz)]) v = 1; tmp[y * sz + x] = v; }
      for (let x = 0; x < sz; x++) for (let y = 0; y < sz; y++) { let v = 0;
        for (let i = -RING; i <= RING && !v; i++) if (tmp[((y + i + sz) % sz) * sz + x]) v = 1; dil[y * sz + x] = v; }
      for (let i = 0; i < ring.length; i++) ring[i] = dil[i] && !cutN[i] ? 1 : 0;
    }
    /* Chebyshev distance outside the cut, 0 = inside the cut, capped at 15. Wrapped, because a
     * tile is periodic. Derived from `s.h`, which `carve()`'s arris never writes, so this is
     * bit-identical between the arms — asserted below rather than assumed. */
    const dist = new Uint8Array(sz * sz).fill(15);
    {
      for (let i = 0; i < dist.length; i++) if (cutN[i]) dist[i] = 0;
      for (let pass = 1; pass <= 14; pass++) {
        const prev = dist.slice();
        for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
          const k = y * sz + x; if (prev[k] < pass) continue;
          let near = 0;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (prev[((y + dy + sz) % sz) * sz + ((x + dx + sz) % sz)] === pass - 1) { near = 1; break; }
          }
          if (near) dist[k] = pass;
        }
      }
    }
    return { sz, lum, albedo: d.albedo, tile: tu, worldTile: tu * UV, mmPerTexel: (tu * UV) / sz * 1000,
      /* Raw authored roughness, NOT the shipped ORM: `derive()` runs `refineRoughness` and
       * `packORM` (ormDiv 2) after this, so a delta here is what `carve()` wrote and not what the
       * sampler reads. Included because `arrisPolish` is a roughness-only treatment and an
       * albedo lab that ignored it would report "no effect" for a term it never looked at. */
      rough: Float32Array.from(s.rough),
      ring, cut: cutN, dist,
      ringShare: +(100 * ring.reduce((a, b) => a + b, 0) / ring.length).toFixed(1),
      cutShare: +(100 * cutN.reduce((a, b) => a + b, 0) / cutN.length).toFixed(1) };
  };

  const score = (b) => {
    const res = { mean: 0, darkTail: 0, sd11: 0, squint8: 0, at: {} };
    let m = 0, dark = 0;
    for (let i = 0; i < b.lum.length; i++) { m += b.lum[i]; if (b.lum[i] < 0.2031) dark++; }
    res.mean = m / b.lum.length; res.darkTail = dark / b.lum.length;
    /* Class value ordering at 1:1. A carving reads as cut because the raised edge is LIGHTER
     * than the field and the recess is DARKER — a value *span* with the right sign, which is a
     * different claim from "more band-pass energy" and needs its own statistic. §7.3's gold line
     * ("hard spec + dark occlusion") is this quantity, not a contrast one. */
    if (b.ring) {
      let cs = 0, cn = 0, rs = 0, rn = 0, fs = 0, fn = 0;
      for (let i = 0; i < b.lum.length; i++) {
        if (b.cut[i]) { cs += b.lum[i]; cn++; }
        else if (b.ring[i]) { rs += b.lum[i]; rn++; }
        else { fs += b.lum[i]; fn++; }
      }
      res.cutL = cn ? cs / cn : NaN; res.ringL = rn ? rs / rn : NaN; res.fieldL = fn ? fs / fn : NaN;
      res.spanRingCut = res.ringL - res.cutL;          // must be > 0 for a carving to read as cut
      res.ringOverField = res.ringL - res.fieldL;      // must be > 0 for the lip to be a lip
      /* Luma against distance OUTSIDE the cut boundary, in texels. A fixed dilation cannot
       * separate the bevel wall (genuinely dark) from the lip beyond it, and averaging them
       * reports a lip as absent when it is merely outnumbered — §67.1 again. The profile does
       * not average them: it shows where the minimum is, where the maximum is and how wide. */
      const prof = [], profN = [];
      for (let d = 0; d <= 14; d++) { prof.push(0); profN.push(0); }
      for (let i = 0; i < b.dist.length; i++) {
        const d = b.dist[i];
        if (d >= 1 && d <= 14) { prof[d] += b.lum[i]; profN[d]++; }
      }
      res.profile = prof.map((v, d) => (profN[d] ? +(v / profN[d]).toFixed(4) : null));
      res.profileN = profN;
      if (b.rough) {
        let rr = 0, rn = 0, rf = 0, nf = 0;
        for (let i = 0; i < b.rough.length; i++) {
          if (b.dist[i] >= 1 && b.dist[i] <= 4) { rr += b.rough[i]; rn++; }
          else if (b.dist[i] >= 12) { rf += b.rough[i]; nf++; }
        }
        res.roughRing = rn ? rr / rn : NaN; res.roughField = nf ? rf / nf : NaN;
      }
    }
    res.sd11 = sd(b.lum);
    res.squint8 = sd(box(b.lum, b.sz, Math.max(8, b.sz >> 3)));
    for (const mmpx of MMPX) {
      // Resample the tile so one output pixel is `mmpx` of world — the framing's own scale.
      const w = Math.max(16, Math.round(b.worldTile * 1000 / mmpx));
      if (w > b.sz) { res.at[mmpx] = { px: w, note: 'magnified past texel density' }; continue; }
      const L = box(b.lum, b.sz, w);
      const g1 = gaussWrap(L, w, w, 1.6), g6 = gaussWrap(L, w, w, 6.0), g14 = gaussWrap(L, w, w, 14.0);
      const f = [], c = [];
      for (let i = 0; i < w * w; i++) {
        const base = Math.max(0.02, g14[i]);
        f.push(Math.abs(L[i] - g1[i]) / base);
        c.push(Math.abs(g1[i] - g6[i]) / base);
      }
      /* Ring-restricted population. The mask is texel-resolution; box-downsample it to `w` and
       * keep an output cell only if the ring owns >= 50% of it, so a cell straddling the cut and
       * the field is not counted as either. */
      const fR = [];
      if (b.ring) {
        const acc = new Float32Array(w * w), cnt = new Float32Array(w * w);
        for (let y = 0; y < b.sz; y++) for (let x = 0; x < b.sz; x++) {
          const k = ((y * w / b.sz) | 0) * w + ((x * w / b.sz) | 0);
          acc[k] += b.ring[y * b.sz + x]; cnt[k]++;
        }
        for (let i = 0; i < w * w; i++) if (cnt[i] && acc[i] / cnt[i] >= 0.5) {
          const base = Math.max(0.02, g14[i]);
          fR.push(Math.abs(L[i] - g1[i]) / base);
        }
      }
      f.sort((x, y) => x - y); c.sort((x, y) => x - y); fR.sort((x, y) => x - y);
      const med = (a) => a[a.length >> 1];
      const p = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : NaN);
      res.at[mmpx] = {
        px: w,
        fineMed: +med(f).toFixed(4), coarseMed: +med(c).toFixed(4),
        fineP90: +p(f, 0.9).toFixed(4), fineP75: +p(f, 0.75).toFixed(4),
        cov1: +(100 * f.filter((v) => v >= 0.01).length / f.length).toFixed(1),
        covC2: +(100 * c.filter((v) => v >= 0.02).length / c.length).toFixed(1),
        ringN: fR.length,
        ringFineMed: fR.length ? +med(fR).toFixed(4) : null,
        ringCov1: fR.length ? +(100 * fR.filter((v) => v >= 0.01).length / fR.length).toFixed(1) : null,
      };
    }
    return res;
  };

  const toPNG = async (w, h, rgba) => {
    const cv = new OffscreenCanvas(w, h); const cx = cv.getContext('2d');
    const img = cx.createImageData(w, h); img.data.set(rgba); cx.putImageData(img, 0, 0);
    const b = await cv.convertToBlob({ type: 'image/png' });
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  };
  const rows = [];
  for (const name of names) {
    if (!M.MATERIALS[name]) { rows.push({ name, err: 'missing' }); continue; }
    const A = build(name, OFF);       // control: treatment(s) disabled
    const B = build(name, '');        // shipped
    let diff = 0; for (let i = 0; i < A.lum.length; i++) if (Math.abs(A.lum[i] - B.lum[i]) > 0.004) diff++;
    rows.push({
      name, sz: B.sz, worldTile: +B.worldTile.toFixed(2), mmPerTexel: +B.mmPerTexel.toFixed(2),
      changedPct: +(100 * diff / A.lum.length).toFixed(2),
      ringShare: B.ringShare, cutShare: B.cutShare,
      /* The sub-mask must be arm-independent by construction; assert it rather than assume it. */
      ringIdentical: (() => { for (let i = 0; i < A.ring.length; i++) if (A.ring[i] !== B.ring[i]) return false;
        for (let i = 0; i < A.dist.length; i++) if (A.dist[i] !== B.dist[i]) return false; return true; })(),
      off: score(A), on: score(B),
      pngA: KNOBS.__png ? await toPNG(A.sz, A.sz, A.albedo) : null,
      pngB: KNOBS.__png ? await toPNG(B.sz, B.sz, B.albedo) : null,
    });
  }
  return rows;
}, { names, OFF, MMPX, UV, SIZE, KNOBS });

for (const r of out) {
  if (r.pngA) {
    fs.writeFileSync(`/tmp/abtex-${r.name}-OFF.png`, Buffer.from(String(r.pngA).split(',')[1], 'base64'));
    fs.writeFileSync(`/tmp/abtex-${r.name}-ON.png`, Buffer.from(String(r.pngB).split(',')[1], 'base64'));
    console.log(`  wrote /tmp/abtex-${r.name}-{OFF,ON}.png`);
  }
  delete r.pngA; delete r.pngB;
}
const pc = (a, b) => (a === 0 ? 'n/a' : `${b > a ? '+' : ''}${(100 * (b - a) / a).toFixed(1)}%`);
for (const r of out) {
  if (r.err) { console.log(`${r.name}: ${r.err}`); continue; }
  console.log(`\n=== ${r.name}  size ${r.sz}  worldTile ${r.worldTile} m  ${r.mmPerTexel} mm/texel  ` +
    `| arm OFF="${OFF}" vs shipped | ${r.changedPct}% of texels differ` +
    (r.ringShare != null ? `  | height-derived masks: cut ${r.cutShare}%, ring ${r.ringShare}%, arm-independent ${r.ringIdentical}` : ''));
  console.log('  stat'.padEnd(22) + 'OFF'.padStart(10) + 'shipped'.padStart(10) + 'delta'.padStart(10));
  const line = (k, a, b, f = 4) => console.log(`  ${k}`.padEnd(22) + a.toFixed(f).padStart(10) + b.toFixed(f).padStart(10) + pc(a, b).padStart(10));
  line('meanAlbedo', r.off.mean, r.on.mean);
  line('darkTail', r.off.darkTail, r.on.darkTail);
  line('sd 1:1', r.off.sd11, r.on.sd11);
  line('squint sd 1/8', r.off.squint8, r.on.squint8);
  if (r.off.ringL != null) {
    line('cut luma', r.off.cutL, r.on.cutL);
    line('ring luma', r.off.ringL, r.on.ringL);
    line('field luma', r.off.fieldL, r.on.fieldL);
    line('span ring-cut', r.off.spanRingCut, r.on.spanRingCut);
    line('ring - field', r.off.ringOverField, r.on.ringOverField);
    if (r.off.roughRing != null && !isNaN(r.off.roughRing)) {
      line('rough d1-4 (lip)', r.off.roughRing, r.on.roughRing);
      line('rough d>=12 (fld)', r.off.roughField, r.on.roughField);
    }
    const mm = r.mmPerTexel;
    console.log('  luma by texels outside the cut (field = ' + r.on.fieldL.toFixed(4) + '):');
    console.log('    d(tx)  ' + [1,2,3,4,5,6,7,8,10,12,14].map((d)=>String(d).padStart(8)).join(''));
    console.log('    mm     ' + [1,2,3,4,5,6,7,8,10,12,14].map((d)=>(d*mm).toFixed(0).padStart(8)).join(''));
    console.log('    OFF    ' + [1,2,3,4,5,6,7,8,10,12,14].map((d)=>String(r.off.profile[d] ?? '-').padStart(8)).join(''));
    console.log('    ON     ' + [1,2,3,4,5,6,7,8,10,12,14].map((d)=>String(r.on.profile[d] ?? '-').padStart(8)).join(''));
    console.log('    ON-fld ' + [1,2,3,4,5,6,7,8,10,12,14].map((d)=>(r.on.profile[d]==null?'-':(r.on.profile[d]-r.on.fieldL).toFixed(4))).map((v)=>String(v).padStart(8)).join(''));
  }
  for (const mm of MMPX) {
    const a = r.off.at[mm], b = r.on.at[mm];
    if (a?.note) { console.log(`  @${mm} mm/px: ${a.note} (${a.px} px)`); continue; }
    console.log(`  @${mm} mm/px  (${b.px} px across the tile; ring sub-mask ${b.ringN} cells)`);
    line('   fineMed', a.fineMed, b.fineMed);
    line('   fineP75', a.fineP75, b.fineP75);
    line('   fineP90', a.fineP90, b.fineP90);
    line('   coarseMed', a.coarseMed, b.coarseMed);
    line('   cov1 %', a.cov1, b.cov1, 1);
    line('   covC2 %', a.covC2, b.covC2, 1);
    if (a.ringFineMed != null && b.ringFineMed != null) {
      line('   ringFineMed', a.ringFineMed, b.ringFineMed);
      line('   ringCov1 %', a.ringCov1, b.ringCov1, 1);
    }
  }
}
await browser.close(); server.close();
