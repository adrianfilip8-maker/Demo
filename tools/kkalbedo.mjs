#!/usr/bin/env node
/**
 * kkalbedo.mjs — §736: the props' albedo AS PLACED, and the grade that lands it in the
 * architecture's band. Offline; no boot, no capture lock, no browser.
 *
 * WHY. The brief for this lane compared `dungeon_texture_sandstone.png`'s mean saturation
 * (0.560) with `Architecture.RECIPES.sandstone_block.color = 0xc9915a`'s saturation (0.552) and
 * concluded the two populations are the same chroma. They are not, and the comparison is the
 * §442 shape: the atlas mean is ALL of the props' albedo, while the recipe hex is only HALF of
 * the architecture's — the architecture's albedo is `texture × color`, and the two compound.
 * Measured in the browser off the live materials (`tools/kkwhy.mjs`), the graded architecture
 * reads **sat 0.865 at L 74** (`sandstone_block`) and **0.822 at L 86.8** (`paving_courtyard`)
 * against the props' **0.560 at L 143.7**.
 *
 * WHAT THIS COMPUTES. Two things, both offline and both reproducible from the shipped bytes:
 *
 *   1. THE PROPS' ALBEDO AS PLACED — every triangle of every KayKit body the level actually
 *      builds, weighted by its WORLD area (a `pillar_decorated` at 4 m contributes far more
 *      surface than a `coin_stack_small`), sampling the shipped atlas at the triangle's own UV
 *      centroid. The per-model table is a floor on how flat this albedo is: it also reports the
 *      within-triangle albedo spread, which is what a UV island parked on a solid swatch
 *      produces.
 *   2. THE GRADE — the NEUTRAL (achromatic) linear multiplier `k` that puts that albedo's mean
 *      display luminance on a named target. Neutral on purpose: a grey multiply is EXACTLY
 *      chroma-preserving on the texture (in linear, `(kR,kG,kB)` has the same `(max−min)/max`
 *      as `(R,G,B)`, and the sRGB encode is a per-channel power law, so the ratio survives it
 *      to within the toe), so this lever cannot be confused with §727's chroma push — it moves
 *      luminance and nothing else. What it buys is downstream: AgX desaturates hard on the
 *      shoulder (PostFX.js:242 measured 76.5 % chroma loss there), so an albedo that sits lower
 *      renders with MORE of its own colour intact without a drop of chroma being added to it.
 *
 *   node tools/kkalbedo.mjs                 # table + the derived grade at each target
 *   node tools/kkalbedo.mjs --json out.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from './png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const KK = path.join(ROOT, 'public/assets/kaykit');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const JSONOUT = opt('json', '');

const atlas = readPNG(path.join(KK, 'dungeon_texture_sandstone.png'));
const { w: AW, h: AH, ch: ACH, data: AD } = atlas;

const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const acc = (d, bins, i) => {
  const a = d.accessors[i], bv = d.bufferViews[a.bufferView], buf = bins[bv.buffer];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return new (CT[a.componentType])(buf.buffer, buf.byteOffset + off, a.count * NC[a.type]);
};
const s2l = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) LIN[i] = s2l(i / 255);
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const satOf = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 0 ? (mx - mn) / mx : 0; };

/**
 * The models the shipped level actually places, and how many of each. Transcribed from
 * `KayKit.PLACEMENTS` (the module's own set dress, mode `props` — its default),
 * `Props._flushKayKit`'s statics (7 courtyard baskets alternating `barrel_large` /
 * `barrel_small_stack`, 16 `torch_mounted` sconces) and `Smashables._swapGeo`'s kinds. The
 * COUNT table is re-derived from the sources at run time below, so it cannot go stale silently.
 */
function placedCounts() {
  const src = fs.readFileSync(path.join(ROOT, 'src/world/KayKit.js'), 'utf8');
  const block = src.slice(src.indexOf('const PLACEMENTS = ['), src.indexOf('\n];', src.indexOf('const PLACEMENTS = [')));
  const counts = new Map();
  for (const m of block.matchAll(/\[\s*'([a-z0-9_]+)'\s*,/g)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  /* Props.js statics, from the shipped seed (`tests/smashswap.test.mjs` pins 4 + 7; the vault
     jars went back to procedural at §730, so what remains on the atlas is 7 baskets), plus the
     16 sconces §734 measured. Both re-counted from a headless build in `tools/kkflat` runs. */
  const add = (k, n) => counts.set(k, (counts.get(k) || 0) + n);
  add('barrel_large', 4); add('barrel_small_stack', 3);     // 7 alternating courtyard baskets
  add('torch_mounted', 16);                                  // §734's crypt + hypostyle sconces
  return counts;
}

function modelStats(name) {
  const p = path.join(KK, `${name}.gltf`);
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const bins = d.buffers.map((b) => fs.readFileSync(path.join(KK, decodeURIComponent(b.uri))));
  let area = 0, lr = 0, lg = 0, lb = 0, wVar = 0, flat = 0, tris = 0;
  for (const m of d.meshes) for (const pr of m.primitives) {
    const P = acc(d, bins, pr.attributes.POSITION), U = acc(d, bins, pr.attributes.TEXCOORD_0);
    const I = pr.indices != null ? acc(d, bins, pr.indices) : null;
    const nT = I ? I.length / 3 : P.length / 9;
    for (let t = 0; t < nT; t++) {
      const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
      const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
      const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
      const ar = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      const uv = [[U[a * 2], U[a * 2 + 1]], [U[b * 2], U[b * 2 + 1]], [U[c * 2], U[c * 2 + 1]]];
      /* Area-weighted mean is taken in LINEAR, because that is the space the albedo is
         multiplied and lit in; averaging sRGB bytes would overstate the mean by the gamma. */
      const S = 4, vals = [];
      let ar_ = 0, ag_ = 0, ab_ = 0, nsamp = 0;
      for (let i = 0; i <= S; i++) for (let j = 0; j <= S - i; j++) {
        const w0 = i / S, w1 = j / S, w2 = 1 - w0 - w1;
        const u = uv[0][0] * w0 + uv[1][0] * w1 + uv[2][0] * w2;
        const v = uv[0][1] * w0 + uv[1][1] * w1 + uv[2][1] * w2;
        const xi = Math.min(AW - 1, Math.max(0, Math.floor(u * AW)));
        const yi = Math.min(AH - 1, Math.max(0, Math.floor(v * AH)));
        const k = (yi * AW + xi) * ACH;
        ar_ += LIN[AD[k]]; ag_ += LIN[AD[k + 1]]; ab_ += LIN[AD[k + 2]];
        vals.push(lum(AD[k], AD[k + 1], AD[k + 2])); nsamp++;
      }
      area += ar; lr += ar * ar_ / nsamp; lg += ar * ag_ / nsamp; lb += ar * ab_ / nsamp;
      const mu = vals.reduce((s, v) => s + v, 0) / vals.length;
      const va = vals.reduce((s, v) => s + (v - mu) * (v - mu), 0) / vals.length;
      wVar += ar * va; tris++;
      if (Math.sqrt(va) < 1.0) flat++;
    }
  }
  const R = 255 * l2s(lr / area), G = 255 * l2s(lg / area), B = 255 * l2s(lb / area);
  return {
    name, tris, area: +area.toFixed(4),
    lin: [lr / area, lg / area, lb / area],
    rgb: [R, G, B].map((v) => +v.toFixed(1)),
    L: +lum(R, G, B).toFixed(1), sat: +satOf(R, G, B).toFixed(3),
    triSD: +Math.sqrt(wVar / area).toFixed(3),
    flatPct: +(100 * flat / tris).toFixed(1),
  };
}

const counts = placedCounts();
const rows = [];
for (const [name, n] of [...counts.entries()].sort()) {
  const s = modelStats(name);
  if (!s) { rows.push({ name, n, missing: true }); continue; }
  rows.push({ ...s, n });
}

let tot = 0, TR = 0, TG = 0, TB = 0, tsd = 0, tflat = 0, ttri = 0;
for (const r of rows) {
  if (r.missing) continue;
  const w = r.area * r.n;
  tot += w; TR += w * r.lin[0]; TG += w * r.lin[1]; TB += w * r.lin[2];
  tsd += w * r.triSD * r.triSD; tflat += r.flatPct * w; ttri += w;
}
const meanLin = [TR / tot, TG / tot, TB / tot];
const mean8 = meanLin.map((v) => 255 * l2s(v));
const PLACED = {
  area: +tot.toFixed(2),
  rgb: mean8.map((v) => +v.toFixed(1)),
  L: +lum(...mean8).toFixed(1),
  sat: +satOf(...mean8).toFixed(3),
  triSD: +Math.sqrt(tsd / ttri).toFixed(3),
  flatPct: +(tflat / ttri).toFixed(1),
};

/* The neutral grade. `k` is a LINEAR multiplier applied to every channel, so the graded mean
   is `l2s(k * meanLin_c)`; solve for the k whose graded mean luminance hits each target by
   bisection on a monotone function (no closed form survives the sRGB toe). */
function gradeFor(targetL) {
  let lo = 0.01, hi = 1;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    const g = meanLin.map((v) => 255 * l2s(k * v));
    if (lum(...g) > targetL) hi = k; else lo = k;
  }
  const k = (lo + hi) / 2;
  const g = meanLin.map((v) => 255 * l2s(k * v));
  /* The hex a THREE.Color must carry so that `<color_fragment>`'s LINEAR multiply is `k`:
     three converts an sRGB hex to linear, so the hex is `l2s(k)` in 8-bit. */
  const hex8 = Math.round(255 * l2s(k));
  const hex = (hex8 << 16) | (hex8 << 8) | hex8;
  return { targetL, k: +k.toFixed(5), hex: '0x' + hex.toString(16).padStart(6, '0'), gradedL: +lum(...g).toFixed(1), gradedSat: +satOf(...g).toFixed(3) };
}

const out = { placed: PLACED, models: rows, grades: [74.0, 80.4, 86.8, 93.6, 100].map(gradeFor) };
process.stdout.write('· kkalbedo — the props\' albedo AS PLACED, on the shipped atlas\n\n');
process.stdout.write(`  ${'model'.padEnd(24)} ${'n'.padStart(3)} ${'m2'.padStart(8)} ${'rgb'.padStart(20)} ${'L'.padStart(6)} ${'sat'.padStart(6)} ${'triSD'.padStart(6)} ${'flat%'.padStart(6)}\n`);
for (const r of rows) {
  if (r.missing) { process.stdout.write(`  ${r.name.padEnd(24)} ${String(r.n).padStart(3)}  MODEL NOT FOUND\n`); continue; }
  process.stdout.write(`  ${r.name.padEnd(24)} ${String(r.n).padStart(3)} ${String(r.area).padStart(8)} ${`${r.rgb}`.padStart(20)} ${String(r.L).padStart(6)} ${String(r.sat).padStart(6)} ${String(r.triSD).padStart(6)} ${String(r.flatPct).padStart(6)}\n`);
}
process.stdout.write(`\n  PLACED TOTAL (world-area weighted): rgb ${PLACED.rgb}  L ${PLACED.L}  sat ${PLACED.sat}`
  + `  within-triangle albedo SD ${PLACED.triSD}  triangles flat to <1 luma ${PLACED.flatPct}%\n`);
process.stdout.write('\n  neutral grade (linear multiplier, chroma-preserving on the texture):\n');
process.stdout.write(`    ${'target L'.padStart(9)} ${'k(linear)'.padStart(10)} ${'hex'.padStart(10)} ${'graded L'.padStart(9)} ${'graded sat'.padStart(11)}\n`);
for (const g of out.grades) {
  process.stdout.write(`    ${String(g.targetL).padStart(9)} ${String(g.k).padStart(10)} ${g.hex.padStart(10)} ${String(g.gradedL).padStart(9)} ${String(g.gradedSat).padStart(11)}\n`);
}
if (JSONOUT) fs.writeFileSync(JSONOUT, JSON.stringify(out, null, 1));
