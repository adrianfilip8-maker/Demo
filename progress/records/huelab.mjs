#!/usr/bin/env node
/**
 * huelab — the critic's palette-concentration statistic (RESULT-critic5 §4.2, "M11") applied to
 * the layer TEXTURES owns: the built albedo, one transform before lighting.
 *
 * M11 as the critic defines it: of the pixels with (max channel - min channel) >= 8 on sRGB
 * 0-255, what share falls inside the best pair of 40-degree hue windows? Its controls put the
 * floor at 0.222 (a full 360-degree sweep) and the ceiling at 1.000 (a two-hue field), and both
 * are reproduced here before any material is measured - if they do not land, the reading of the
 * statistic is wrong and nothing below means anything (KNOWN_ISSUES §33: a band that cannot be
 * reached from both sides carries no information).
 *
 * Three levels are reported, in increasing distance from the source:
 *   1. per recipe, on the raw built albedo;
 *   2. per recipe, times the consumer's material `color` (src/world/Architecture.js RECIPES),
 *      multiplied in linear, which is where three.js multiplies map x color;
 *   3. per canonical framing, area-weighted by each material's measured share of that frame
 *      (scratchpad/angsize.json, keyed on material.name - the corrected keying of KNOWN_ISSUES
 *      §8's second caveat).
 * And a fourth, the frame-side prediction: every sampled texel pushed through the committed
 * light+grade chain at keyF 1.00 / 0.35 / 0.00, using the transcription validated to 3 display
 * counts of b-r in PREREG-blueskew-albedo ADDENDUM1 §4a.
 *
 * SCOPE STAMP (§11) - transforms between these numbers and the renderer, NOT implemented here:
 *   the shadow map (keyF is a parameter, not a lookup, so the lit/shade mix per shot is an
 *   input rather than a measurement); GTAO; haze; bloom; vignette; FXAA; grain; screen-space
 *   rim and ink; the surface fresnel rim; normal-map perturbation of ndl; mip minification
 *   (a painted band narrower than a texel at range averages into its neighbours - reported
 *   separately as bandPx); and every non-architecture pixel in the frame (sky, terrain,
 *   character, FX, vegetation), which is most of what M11 sees in `dunes` and `night`.
 * So level 4 predicts the hue of ARCHITECTURE pixels. It is not a prediction of the critic's
 * whole-frame number, and is not to be quoted as one.
 *
 *   node huelab.mjs [--size 512] [--json out.json] [--names a,b] [--shots hero,temple]
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createAtmosphereState, evalAtmosphere } from '/home/user/Demo/src/render/Atmosphere.js';

const ROOT = '/home/user/Demo';
const SCRATCH = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? true) : d; };

/* ---------------- committed constants (same transcription as pavegate/huechain) ------------ */
const TM = { shadowWash: 0.05, shadowSat: -0.35, bounceGain: 0.42, bakedAO: 0.55, fillSkyMix: 0.70,
  shadowTintPeak: 0.52, shadowBounceMix: 0.05, shadowTeal: 0.15, ambIntensity: 0.52, shadowFloor: 0.125, aoKey: 0.0 };
const PALc = { shadowHue: 0x2a3f66, turquoise: 0x2fa8a0 };
const PF = { exposure: 0.95, contrast: 1.08, saturation: 1.30, pivot: 0.18, lift: [0.006, 0.004, 0.010],
  gain: [1.035, 1.0, 0.985], splitStrength: 0.16, splitRange: [0.04, 0.24], splitShadow: 0x2a3f66, splitHighlight: 0xffd9a0 };

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => { c = Math.max(c, 0); return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
const hexLin = (h) => [s2l(((h >> 16) & 255) / 255), s2l(((h >> 8) & 255) / 255), s2l((h & 255) / 255)];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const M_SRGB_TO_2020 = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.0880, 0.8956]];
const M_2020_TO_SRGB = [[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]];
const INSET = [[0.856627153315983, 0.0951212405381588, 0.0482516061458583], [0.137318972929847, 0.761241990602591, 0.101439036467562], [0.11189821299995, 0.0767994186031903, 0.811302368396859]];
const OUTSET = [[1.1271005818144368, -0.11060664309660323, -0.016493938717834573], [-0.1413297634984383, 1.157823702216272, -0.016493938717834257], [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]];
const mv = (m, v) => [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);
const agxC = (x) => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; };
function agx(c) {
  const minEv = -12.47393, maxEv = 4.026069;
  let v = mv(M_SRGB_TO_2020, c); v = mv(INSET, v);
  v = v.map((x) => Math.max(x, 1e-10)).map(Math.log2).map((x) => Math.min(1, Math.max(0, (x - minEv) / (maxEv - minEv)))).map(agxC);
  v = mv(OUTSET, v); v = v.map((x) => Math.pow(Math.max(x, 0), 2.2)); v = mv(M_2020_TO_SRGB, v);
  const L = lum(v), mn = Math.min(...v);
  if (mn < 0 && L > mn) v = lerp(v, [L, L, L], Math.min(1, -mn / (L - mn)));
  return v.map((x) => Math.min(1, Math.max(0, x)));
}
function grade(cIn) {
  let c = scl(cIn, PF.exposure);
  c = c.map((x, i) => Math.max(0, x + PF.lift[i] * (1 - x)));
  c = c.map((x, i) => x * PF.gain[i]);
  const l = lum(c);
  let tone = lerp(hexLin(PF.splitShadow), hexLin(PF.splitHighlight), smoothstep(PF.splitRange[0], PF.splitRange[1], l));
  tone = scl(tone, 1 / Math.max(1e-4, lum(tone)));
  c = lerp(c, mul(c, tone), PF.splitStrength);
  c = lerp([l, l, l], c, PF.saturation);
  c = c.map((x) => PF.pivot * Math.pow(Math.max(x, 1e-6) / PF.pivot, PF.contrast));
  c = agx(c); c = c.map(l2s);
  return c.map((x) => Math.min(255, Math.max(0, Math.round(x * 255))));
}
const A = createAtmosphereState(); evalAtmosphere(0.80, A);
const c3 = (x) => [x.r, x.g, x.b];
const keyCol = c3(A.keyColor), keyI = A.keyIntensity, keyLum = lum(keyCol) * keyI;
const skyCol = c3(A.hemiSky), gndCol = c3(A.hemiGround), ambI = A.ambientIntensity;
const tintBlend = lerp(hexLin(PALc.shadowHue), hexLin(PALc.turquoise), TM.shadowTeal);
const tintLum = lum(tintBlend);
const kUsed = Math.min((A.shadowFloor ?? TM.shadowFloor) * keyLum / Math.max(tintLum, 1e-4), TM.shadowTintPeak / Math.max(...tintBlend));
const blG = lum(gndCol);
const shadowLight = scl(lerp(scl(gndCol, blG > 1e-4 ? tintLum / blG : 1), tintBlend, 1 - TM.shadowBounceMix), kUsed);
const fillAt = (ny) => {
  const bounceLeg = lerp(gndCol, scl(skyCol, lum(gndCol) / Math.max(lum(skyCol), 1e-4)), TM.fillSkyMix);
  return scl(lerp(scl(bounceLeg, TM.bounceGain), skyCol, smoothstep(-0.72, 0.55, ny)), ambI);
};
function shadeLin(alb, keyF, ny = 0.0, ao = 0.95) {
  const aoEff = 1 + (ao - 1) * TM.bakedAO;
  const lumA = lum(alb);
  const albShadow = lerp([lumA, lumA, lumA], alb, 1 + TM.shadowSat).map((v) => Math.min(1, Math.max(0, v)));
  const shadowMix = 1 - keyF;
  const albAmb = lerp(alb, albShadow, shadowMix);
  const fill = fillAt(ny);
  return add(add(add(
    scl(mul(alb, scl(keyCol, keyI)), keyF),
    mul(albAmb, scl(fill, aoEff))),
    mul(albShadow, scl(shadowLight, shadowMix * (0.55 + 0.45 * aoEff)))),
    scl(shadowLight, TM.shadowWash * shadowMix * aoEff));
}

/* ---------------- M11 --------------------------------------------------------------------- */
function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return null;
  let h;
  if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return (h + 360) % 360;
}
/** 72 bins of 5 degrees. Windows of 40 degrees = 8 bins, all 72 offsets, best pair by union. */
const NB = 72, BW = 360 / NB, WBIN = 8;
function conc2(hist) {
  const tot = hist.reduce((a, b) => a + b, 0);
  if (tot <= 0) return { conc: 0, tot: 0, bins: [] };
  const winSum = new Float64Array(NB);
  const winMask = [];
  for (let s = 0; s < NB; s++) {
    let acc = 0; const m = new Set();
    for (let k = 0; k < WBIN; k++) { const i = (s + k) % NB; acc += hist[i]; m.add(i); }
    winSum[s] = acc; winMask.push(m);
  }
  let best = 0, bi = 0, bj = 0;
  for (let i = 0; i < NB; i++) {
    for (let j = i; j < NB; j++) {
      let acc = 0; const seen = new Set([...winMask[i], ...winMask[j]]);
      for (const k of seen) acc += hist[k];
      if (acc > best) { best = acc; bi = i; bj = j; }
    }
  }
  return { conc: best / tot, tot, bins: [bi * BW, bj * BW] };
}
const newHist = () => new Float64Array(NB);
function addPx(hist, r, g, b, w = 1) {
  if (Math.max(r, g, b) - Math.min(r, g, b) < 8) return 0;
  const h = hueOf(r, g, b); if (h === null) return 0;
  hist[Math.min(NB - 1, Math.floor(h / BW))] += w; return w;
}

/* ---- controls, run before anything is measured ---- */
{
  const sweep = newHist(); for (let h = 0; h < 360; h += 0.5) sweep[Math.min(NB - 1, Math.floor(h / BW))] += 1;
  const two = newHist(); two[Math.floor(210 / BW)] = 500; two[Math.floor(25 / BW)] = 500;
  const cs = conc2(sweep).conc, ct = conc2(two).conc;
  console.log(`CONTROL full-360 sweep -> ${cs.toFixed(3)}  (critic 0.223, arithmetic 2x40/360 = 0.222)`);
  console.log(`CONTROL two-hue field  -> ${ct.toFixed(3)}  (critic 1.000)`);
  if (Math.abs(cs - 0.222) > 0.01 || ct < 0.999) { console.error('CONTROL FAILED — statistic is misread, nothing below is evidence'); process.exit(2); }
}

/* ---------------- consumer material colours ------------------------------------------------ */
const MATCOL = {};
{
  const src = fs.readFileSync(path.join(ROOT, 'src/world/Architecture.js'), 'utf8');
  const re = /^\s{2}([a-z_0-9]+):\s*\{\s*color:\s*0x([0-9a-fA-F]{6})/gm;
  let m; while ((m = re.exec(src))) MATCOL[m[1]] = parseInt(m[2], 16);
}

/* ---------------- build the tiles in a page (rasterMask needs a 2D canvas) ----------------- */
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 5911 + (process.pid % 200);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const shots = String(opt('shots', 'hero,temple,courtyard,interior,traversal,night,dunes,guard,combat,sly-closeup')).split(',');
const angsize = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'angsize.json'), 'utf8'));
const wanted = new Set();
for (const sh of shots) for (const r of (angsize[sh] || [])) if (r.share >= 1.0) wanted.add(r.name);
const names = String(opt('names', '')).split(',').filter(Boolean);
const list = names.length ? names : [...wanted];
const size = parseInt(opt('size', '512'), 10);

const albedos = await page.evaluate(async ({ list, size }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const N = await import('/src/textures/NormalMap.js');
  const hashName = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const out = {};
  for (const name of list) {
    const recipe = M.MATERIALS[name]; if (!recipe) continue;
    const sz = recipe.size ? Math.min(recipe.size, size) : (recipe.tier >= 1 ? Math.max(256, size >> 1) : size);
    const s = new C.Surface(sz, (recipe.seed ?? hashName(name)) >>> 0);
    recipe.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
    const d = N.derive(s, { bump: recipe.bump ?? 0.03, tile: recipe.tile ?? 2.0, normalScale: recipe.normalScale ?? 1.0,
      aoStrength: recipe.aoStrength ?? 1.0, aoFloor: recipe.aoFloor ?? 0.16, micro: recipe.micro ?? 0.10,
      ormDiv: recipe.ormDiv ?? 2, smoothH: recipe.smoothH ?? 0, microSoft: recipe.microSoft ?? 0.35 });
    out[name] = { sz, alb: Array.from(d.albedo) };
  }
  return out;
}, { list, size });
await browser.close(); server.close();

/* ---------------- level 1/2: per recipe ---------------------------------------------------- */
const per = {};
console.log('\n=== per recipe: albedo palette concentration (best two 40 deg windows) ===');
console.log('recipe                 |  raw albedo         | x material colour     | chromatic share');
console.log('-'.repeat(88));
for (const name of Object.keys(albedos)) {
  const { sz, alb } = albedos[name];
  const n = sz * sz;
  const hRaw = newHist(), hMat = newHist();
  const mc = MATCOL[name] ? hexLin(MATCOL[name]) : [1, 1, 1];
  let chro = 0;
  const chainH = { 1: newHist(), 0.35: newHist(), 0: newHist() };
  const step = Math.max(1, Math.floor(n / 60000));      // ~60k texels is plenty for a histogram
  let sampled = 0;
  for (let i = 0; i < n; i += step) {
    const r = alb[i * 4], g = alb[i * 4 + 1], b = alb[i * 4 + 2];
    sampled++;
    chro += addPx(hRaw, r, g, b) ? 1 : 0;
    const lin = mul(mc, [s2l(r / 255), s2l(g / 255), s2l(b / 255)]);
    const mb = lin.map((x) => Math.round(Math.min(1, Math.max(0, l2s(x))) * 255));
    addPx(hMat, mb[0], mb[1], mb[2]);
    for (const kf of [1, 0.35, 0]) {
      const d = grade(shadeLin(lin, kf));
      addPx(chainH[kf], d[0], d[1], d[2]);
    }
  }
  const cRaw = conc2(hRaw), cMat = conc2(hMat);
  per[name] = { sz, hMat, chainH, chroShare: chro / sampled, cRaw, cMat,
    chain: { 1: conc2(chainH[1]), 0.35: conc2(chainH[0.35]), 0: conc2(chainH[0]) } };
  console.log(`${name.padEnd(22)} | ${cRaw.conc.toFixed(3)} @ ${String(cRaw.bins[0]).padStart(3)}/${String(cRaw.bins[1]).padStart(3)} | ` +
    `${cMat.conc.toFixed(3)} @ ${String(cMat.bins[0]).padStart(3)}/${String(cMat.bins[1]).padStart(3)} | ${(100 * chro / sampled).toFixed(1)}%`);
}

/* ---------------- level 3/4: per framing --------------------------------------------------- */
console.log('\n=== per canonical framing: architecture albedo, area-weighted by measured share ===');
console.log('shot        | cover% |  albedo x matcol      | chain keyF1.00        | keyF0.35              | keyF0.00');
console.log('-'.repeat(112));
const shotOut = {};
for (const sh of shots) {
  const rows = (angsize[sh] || []).filter((r) => r.share >= 1.0 && per[r.name]);
  if (!rows.length) continue;
  const acc = newHist(), ac1 = newHist(), ac35 = newHist(), ac0 = newHist();
  let cover = 0;
  for (const r of rows) {
    const p = per[r.name]; cover += r.share;
    const norm = (h) => { const t = h.reduce((a, b) => a + b, 0) || 1; return h.map((x) => x / t); };
    const w = r.share;
    const nm = norm(p.hMat); for (let i = 0; i < NB; i++) acc[i] += nm[i] * w;
    const n1 = norm(p.chainH[1]); for (let i = 0; i < NB; i++) ac1[i] += n1[i] * w;
    const n35 = norm(p.chainH[0.35]); for (let i = 0; i < NB; i++) ac35[i] += n35[i] * w;
    const n0 = norm(p.chainH[0]); for (let i = 0; i < NB; i++) ac0[i] += n0[i] * w;
  }
  const c = conc2(acc), k1 = conc2(ac1), k35 = conc2(ac35), k0 = conc2(ac0);
  shotOut[sh] = { cover, alb: c.conc, albBins: c.bins, k1: k1.conc, k35: k35.conc, k0: k0.conc };
  console.log(`${sh.padEnd(11)} | ${cover.toFixed(1).padStart(5)}  | ${c.conc.toFixed(3)} @ ${String(c.bins[0]).padStart(3)}/${String(c.bins[1]).padStart(3)}       | ` +
    `${k1.conc.toFixed(3)} @ ${String(k1.bins[0]).padStart(3)}/${String(k1.bins[1]).padStart(3)}       | ${k35.conc.toFixed(3)} @ ${String(k35.bins[0]).padStart(3)}/${String(k35.bins[1]).padStart(3)}       | ${k0.conc.toFixed(3)} @ ${String(k0.bins[0]).padStart(3)}/${String(k0.bins[1]).padStart(3)}`);
}

/* --- where the chromatic mass sits, in 30 deg buckets, for the two biggest carriers --------- */
console.log('\n=== hue mass by 30 deg bucket, albedo x matcol (share of chromatic texels) ===');
const buckets = [];
for (let s = 0; s < 360; s += 30) buckets.push(s);
console.log('recipe                 ' + buckets.map((b) => String(b).padStart(5)).join(''));
for (const name of Object.keys(per)) {
  const h = per[name].hMat, tot = h.reduce((a, b) => a + b, 0) || 1;
  const row = buckets.map((b) => { let a = 0; for (let k = 0; k < 6; k++) a += h[(b / BW + k) % NB]; return (100 * a / tot).toFixed(0).padStart(5); });
  console.log(name.padEnd(22) + row.join(''));
}

const jsonPath = opt('json', null);
if (jsonPath) {
  const dump = { shots: shotOut, per: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, { chroShare: v.chroShare, raw: v.cRaw.conc, mat: v.cMat.conc, matBins: v.cMat.bins, chain: { k1: v.chain[1].conc, k35: v.chain[0.35].conc, k0: v.chain[0].conc }, hist: Array.from(v.hMat) }])) };
  fs.writeFileSync(jsonPath, JSON.stringify(dump, null, 1));
  console.log(`\nwrote ${jsonPath}`);
}
process.exit(0);
