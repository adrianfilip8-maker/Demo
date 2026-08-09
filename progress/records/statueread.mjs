#!/usr/bin/env node
/**
 * statueread — what the courtyard colossi spend their pixels on, and the five silhouette
 * metrics behind D9. Headless: no GPU, no capture lock, no shading.
 *
 * D9 (RESULT-critic9) says the two flanking monuments "read as smiley faces": an upturned gold
 * arc for a mouth, a slab nose, a ringed circle for an eye. That is a claim about *which
 * geometry lands where on screen at what size*, and it is answerable without the harness.
 *
 * This builds PROPS exactly as the game does (`Props.init()`, same seed, same call order),
 * tags every `Bag.add` with the source line that made it, projects with the real `courtyard`
 * camera (fov + roll), and rasterises a per-feature ID + depth buffer with Architecture as
 * an occluder. It then reports the per-feature pixel table and five metrics:
 *
 *   I1 PROUD    stripe pixels outside the figure's massing silhouette   (a silhouette break)
 *   I2 ARC      the collar's arc rise and fill ratio                    (is it a smile?)
 *   I3 STRIPE   lappet band count and median band thickness in px       (eye-sized or cloth?)
 *   I4 STEP     largest one-row jump in silhouette half-width           (stepped or flared?)
 *   I5 RELIEF   depth spread over the carved face                       (chiselled or painted?)
 *
 * **Why this instrument and not a captured frame.** D9 is a silhouette and feature-proportion
 * defect, and §269 is concurrently changing how shadowed surfaces are tinted — every luminance
 * in the courtyard's shaded half is about to move. Each metric here is computed from geometry
 * and projection only, so none of them can be moved by that work in either direction. What
 * this instrument therefore CANNOT speak to is the other half of D9: whether the carved face
 * out-contrasts the accidental one once it is lit. That half is downstream of §269 and is not
 * claimed here.
 *
 * Sizes are frame pixels at 1280x720 — the resolution the critic scored — never a
 * magnification (see the warning in `tools/crop.mjs`).
 *
 *   node progress/records/statueread.mjs [--noocc] [--seed N] [--scatter] [--png out.png]
 */
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const W = 1280, H = 720;
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SHOT = opt('--shot', 'courtyard');
const PNG = opt('--png', null);
const OCC = !flag('--noocc');
const SEED = opt('--seed', null);
const SCATTER = flag('--scatter');

/* ---- tag every Bag.add with the source line that called it ------------------------------- */
const { Bag } = await import('../../src/world/PropKit.js');
const REC = [];
const rawAdd = Bag.prototype.add;
Bag.prototype.add = function (key, geo) {
  if (geo) {
    const st = (new Error().stack || '').split('\n')[2] || '';
    const m = st.match(/([A-Za-z0-9_.]+\.js):(\d+):/);
    REC.push({ site: m ? `${m[1]}:${m[2]}` : '?', key, geo });
  }
  return rawAdd.call(this, key, geo);
};

const warnings = [];
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false,
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
};
const { Props } = await import('../../src/world/Props.js');
const P = new Props(engine);
/* `--seed` is the repeatability null: it re-rolls every jitter / chip / wear draw in the level
   without changing one authored dimension, so any metric that moves with it was reading noise
   rather than design. */
if (SEED !== null) {
  const { rng } = await import('../../src/core/Rand.js');
  P.rng = rng((0x9c0113 ^ (Number(SEED) >>> 0)) >>> 0);
}
await P.init();
Bag.prototype.add = rawAdd;

/* ---- camera, exactly as Shots.js poses it ------------------------------------------------ */
const { SHOTS } = await import('../../src/core/Shots.js');
const S = SHOTS[SHOT];
if (!S) { console.error(`unknown shot ${SHOT}`); process.exit(1); }
const cam = new THREE.PerspectiveCamera(S.fov, W / H, 0.1, 600);
cam.position.fromArray(S.pos);
cam.lookAt(new THREE.Vector3().fromArray(S.target));
if (S.roll) cam.rotateZ(THREE.MathUtils.degToRad(S.roll));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

/* ---- which recorded parts belong to which colossus --------------------------------------- */
const bb = new THREE.Box3(), cc = new THREE.Vector3();
function centre(geo) { bb.setFromBufferAttribute(geo.attributes.position); return bb.getCenter(cc).clone(); }
const groups = { west: [], east: [] };
for (const r of REC) {
  if (!r.geo?.attributes?.position) continue;
  const p = centre(r.geo);
  if (Math.abs(p.z - 25) > 8 || p.y < 1 || p.y > 16) continue;
  if (Math.abs(p.x + 9.5) < 5) groups.west.push(r);
  else if (Math.abs(p.x - 9.5) < 5) groups.east.push(r);
}

/* ---- feature naming, from the source line that built the geometry ------------------------ */
/* Line numbers are resolved from ANCHOR TEXT in the source, not hardcoded, so editing the file
   under test cannot silently re-label a feature — the failure mode this class of probe always
   has. A missing anchor throws; an add from a line inside no named span prints as its raw
   `file:line` so a code move surfaces as an unnamed row rather than folding into a neighbour. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(path.join(HERE, '../../src/world/', f), 'utf8').split('\n');
const ST = SRC('Statues.js'), PK = SRC('PropKit.js');
function lineOf(lines, needle, file) {
  const i = lines.findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`anchor not found in ${file}: ${JSON.stringify(needle)}`);
  return i + 1;
}
const A = (needle) => lineOf(ST, needle, 'Statues.js');
const K = (needle) => lineOf(PK, needle, 'PropKit.js');
const FEATURES = [
  ['brazier',        'PropKit.js', K('export function brazier'), K('export function wallTorch')],
  ['BROAD COLLAR',   'PropKit.js', K('export function collar'), K('export function hoardMound')],
  ['FACE features',  'Statues.js', A('function carveFace'), A('The cobra at the brow')],
  ['uraeus',         'Statues.js', A('function uraeus'), A('A nemes headdress')],
  ['NEMES crown',    'Statues.js', A('function nemes('), A('// Lappets:')],
  ['NEMES lappets',  'Statues.js', A('// Lappets:'), A('for (let i = 0; i < stripes')],
  ['LAPPET stripes', 'Statues.js', A('for (let i = 0; i < stripes'), A('/* ===================== colossal seated pharaoh')],
  ['legs+feet',      'Statues.js', A('/* ---- legs in relief'), A('Pleated kilt apron')],
  ['kilt apron',     'Statues.js', A('Pleated kilt apron'), A('/* ---- hands flat on the lap')],
  ['hands',          'Statues.js', A('/* ---- hands flat on the lap'), A('/* ---- torso ----')],
  ['torso',          'Statues.js', A('/* ---- torso ----'), A('/* ---- belt and cartouche')],
  ['belt+cartouche', 'Statues.js', A('/* ---- belt and cartouche'), A('/* ---- broad collar')],
  ['COLLAR bib',     'Statues.js', A('/* ---- broad collar'), A('/* ---- neck and head')],
  ['neck+headblock', 'Statues.js', A('/* ---- neck and head'), A('/* ---- false beard')],
  ['false beard',    'Statues.js', A('/* ---- false beard'), A('/* ---- nemes + uraeus')],
  ['nemes call',     'Statues.js', A('/* ---- nemes + uraeus'), A('/* ---- back pillar')],
  ['back pillar',    'Statues.js', A('/* ---- back pillar'), A('/* ---- four thousand years')],
  ['weathering',     'Statues.js', A('/* ---- four thousand years'), A('bag.ledge = ')],
];
function featureOf(site) {
  const m = site.match(/^(.+\.js):(\d+)$/);
  if (!m) return site;
  const f = m[1], n = +m[2];
  for (const [name, file, a, b] of FEATURES) if (f === file && n >= a && n < b) return name;
  return site;
}

/* ---- rasteriser --------------------------------------------------------------------------- */
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
const p4 = new THREE.Vector4();
function toScreen(v) {
  p4.set(v.x, v.y, v.z, 1).applyMatrix4(VP);
  if (p4.w <= 0.001) return null;
  return { x: (p4.x / p4.w * 0.5 + 0.5) * W, y: (1 - (p4.y / p4.w * 0.5 + 0.5)) * H, z: p4.w };
}
function newBuf() { return { depth: new Float32Array(W * H).fill(Infinity), id: new Int32Array(W * H).fill(-1) }; }
function rasterGeo(buf, geo, tag) {
  const pos = geo.attributes.position; const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    va.fromBufferAttribute(pos, i0); vb.fromBufferAttribute(pos, i1); vc.fromBufferAttribute(pos, i2);
    const A = toScreen(va), B = toScreen(vb), C = toScreen(vc);
    if (!A || !B || !C) continue;
    const minx = Math.max(0, Math.floor(Math.min(A.x, B.x, C.x)));
    const maxx = Math.min(W - 1, Math.ceil(Math.max(A.x, B.x, C.x)));
    const miny = Math.max(0, Math.floor(Math.min(A.y, B.y, C.y)));
    const maxy = Math.min(H - 1, Math.ceil(Math.max(A.y, B.y, C.y)));
    if (maxx < minx || maxy < miny) continue;
    const area = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((B.x - A.x) * (py - A.y) - (px - A.x) * (B.y - A.y)) / area;
        const w1 = ((px - A.x) * (C.y - A.y) - (C.x - A.x) * (py - A.y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w2 * A.z + w1 * B.z + w0 * C.z;
        const o = y * W + x;
        if (z < buf.depth[o]) { buf.depth[o] = z; buf.id[o] = tag; }
      }
    }
  }
}

let ARCH = null;
if (OCC) {
  const { buildLevel } = await import('../../tools/lvl.mjs');
  const { A } = await buildLevel({ withProps: false });
  A.root.updateMatrixWorld(true);
  ARCH = [];
  A.root.traverse((o) => {
    if (!o.isMesh || o.visible === false || o.isInstancedMesh) return;
    const g = o.geometry?.clone();
    if (!g?.attributes?.position) return;
    g.applyMatrix4(o.matrixWorld);
    ARCH.push(g);
  });
}

/* FULL buffer: architecture + every colossus part, tagged by feature. */
const tags = [];
const full = newBuf();
if (ARCH) for (const g of ARCH) rasterGeo(full, g, -2);
for (const side of ['west', 'east']) {
  for (const r of groups[side]) {
    const name = `${side}/${featureOf(r.site)}`;
    let t = tags.indexOf(name); if (t < 0) { tags.push(name); t = tags.length - 1; }
    rasterGeo(full, r.geo, t);
  }
}

/* MASSING buffer: architecture + only the parts that carry the figure's mass. Inlay and
   applied ornament are excluded, so anything of theirs visible OUTSIDE this silhouette is a
   piece of jewellery breaking the figure's outline — which no inlay may do. */
const MASSING = new Set(['legs+feet', 'kilt apron', 'hands', 'torso', 'neck+headblock',
  'false beard', 'NEMES crown', 'NEMES lappets', 'back pillar']);
const mass = newBuf();
if (ARCH) for (const g of ARCH) rasterGeo(mass, g, -2);
for (const side of ['west', 'east']) {
  for (const r of groups[side]) {
    const f = featureOf(r.site);
    if (!MASSING.has(f)) continue;
    rasterGeo(mass, r.geo, side === 'west' ? 0 : 1);
  }
}

/* HEAD buffer: the headdress silhouette alone, with NO architecture. I4 asks whether the nemes
   flares or steps, and both the back pillar (which enters the outline behind the crown) and the
   masonry behind the east figure's head would otherwise be counted as part of that outline —
   the first draft of I4 put its largest jump at the row where the back pillar's top edge
   appears, which is not a headdress defect at all. */
const HEADMASS = new Set(['NEMES crown', 'NEMES lappets']);
const head = newBuf();
for (const side of ['west', 'east']) {
  for (const r of groups[side]) {
    if (!HEADMASS.has(featureOf(r.site))) continue;
    rasterGeo(head, r.geo, side === 'west' ? 0 : 1);
  }
}

/* ---- per-feature table --------------------------------------------------------------------- */
const stat = tags.map(() => ({ n: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, sx: 0, sy: 0 }));
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = full.id[y * W + x]; if (t < 0) continue;
  const s = stat[t]; s.n++; s.sx += x; s.sy += y;
  if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x;
  if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
}
const idxOf = (name) => tags.indexOf(name);
const pixels = (name) => {
  const t = idxOf(name); const out = [];
  if (t < 0) return out;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (full.id[y * W + x] === t) out.push([x, y]);
  return out;
};

console.log(`\nshot ${SHOT}  ${W}x${H}  fov ${S.fov}  roll ${S.roll ?? 0}  occluders ${OCC ? 'ON' : 'OFF'}` +
  `${SEED !== null ? `  seed-offset ${SEED}` : ''}${SCATTER ? '  SCATTER-NULL' : ''}`);
console.log(`parts recorded ${REC.length} · colossus parts west ${groups.west.length} east ${groups.east.length}`);
console.log(`\n${'feature'.padEnd(26)} ${'px'.padStart(7)} ${'w'.padStart(5)} ${'h'.padStart(5)}  ${'bbox'.padEnd(26)} centroid`);
for (const [t, s] of tags.map((t, i) => [t, stat[i]]).filter(([, s]) => s.n > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  if (t.includes('brazier')) continue;
  console.log(`${t.padEnd(26)} ${String(s.n).padStart(7)} ${String(s.x1 - s.x0 + 1).padStart(5)} ${String(s.y1 - s.y0 + 1).padStart(5)}  ` +
    `(${s.x0},${s.y0})-(${s.x1},${s.y1})`.padEnd(26) + ` ${(s.sx / s.n).toFixed(0)},${(s.sy / s.n).toFixed(0)}`);
}
for (const side of ['west', 'east']) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
  for (let i = 0; i < tags.length; i++) {
    if (!tags[i].startsWith(side) || tags[i].includes('brazier')) continue;
    const s = stat[i]; if (!s.n) continue;
    n += s.n; x0 = Math.min(x0, s.x0); x1 = Math.max(x1, s.x1); y0 = Math.min(y0, s.y0); y1 = Math.max(y1, s.y1);
  }
  if (n) console.log(`${side} figure: ${n} px · (${x0},${y0})-(${x1},${y1}) · ${x1 - x0 + 1}x${y1 - y0 + 1} px · ` +
    `${((y1 - y0 + 1) / H * 100).toFixed(1)}% of frame height`);
}

/* ================================ the five metrics ========================================= */
const R = {};
const mid = (a) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };

/* --- I1 PROUD: applied ornament outside the massing silhouette ----------------------------- */
console.log(`\nI1 PROUD — inlay pixels outside the figure's massing silhouette`);
for (const side of ['west', 'east']) {
  for (const f of ['LAPPET stripes', 'BROAD COLLAR', 'COLLAR bib', 'uraeus', 'belt+cartouche']) {
    const t = idxOf(`${side}/${f}`); if (t < 0) continue;
    let n = 0, out = 0, maxdx = 0;
    let mx0 = 1e9, mx1 = -1e9;
    for (let y = 0; y < H; y++) {
      let rowMin = 1e9, rowMax = -1e9;
      for (let x = 0; x < W; x++) if (mass.id[y * W + x] >= 0) { if (x < rowMin) rowMin = x; if (x > rowMax) rowMax = x; }
      for (let x = 0; x < W; x++) {
        if (full.id[y * W + x] !== t) continue;
        n++;
        if (mass.id[y * W + x] < 0) {
          out++;
          const d = x < rowMin ? rowMin - x : (x > rowMax ? x - rowMax : 0);
          if (d > maxdx) maxdx = d;
          if (x < mx0) mx0 = x; if (x > mx1) mx1 = x;
        }
      }
    }
    if (!n) continue;
    const key = `I1.${side}.${f}`;
    R[key] = { px: n, out, pct: 100 * out / n, maxdx };
    console.log(`  ${side.padEnd(5)} ${f.padEnd(15)} ${String(n).padStart(6)} px · outside ${String(out).padStart(5)} ` +
      `(${(100 * out / n).toFixed(1)}%) · max protrusion ${maxdx} px`);
  }
}

/* --- I2 ARC: is the collar a smile? --------------------------------------------------------- */
/* An upturned crescent has its ends higher on screen than its middle. Measured as ARC RISE:
   mean row of the outer 15% of its occupied columns minus mean row of the central 20%. In
   screen coords y grows downward, so a SMILE is NEGATIVE... no: ends higher = smaller y at the
   ends, so rise = centreMeanY - endsMeanY, POSITIVE for a smile. FILL is occupied px over bbox
   area: a drawn line is thin (low fill), a bib is a solid shape (high fill). */
function arcOf(px, side) {
  if (px.length < 40) return null;
  const cols = new Map();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, sy = 0;
  for (const [x, y] of px) {
    if (!cols.has(x)) cols.set(x, []);
    cols.get(x).push(y);
    sy += y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const xs = [...cols.keys()].sort((a, b) => a - b);
  const span = xs.length;
  const k = Math.max(1, Math.round(span * 0.15));
  /* Rise is taken on the LOWER BOUNDARY (max y per column), not on the column mean: on a
     multi-row crescent the mean over rows damps the curvature that is the whole read, and it
     under-reported the east figure — whose arc is plainly a crescent in the frame — by 3x. */
  const lowMean = (list) => { let s = 0, n = 0; for (const x of list) { s += Math.max(...cols.get(x)); n++; } return n ? s / n : 0; };
  const ends = [...xs.slice(0, k), ...xs.slice(span - k)];
  const c0 = Math.max(0, Math.round(span * 0.40)), c1 = Math.min(span, Math.round(span * 0.60));
  const rise = lowMean(xs.slice(c0, c1)) - lowMean(ends);
  const fill = px.length / ((x1 - x0 + 1) * (y1 - y0 + 1));
  /* SPAN — the collar's width against the figure's own width at the collar's centroid row.
     This is the garment-vs-mark axis. A wesekh is worn shoulder to shoulder; a mouth on a face
     is roughly half the face wide. The number is what separates the two without appealing to
     taste. */
  const row = Math.round(sy / px.length);
  const want = side === 'west' ? 0 : 1;
  let a = 1e9, b = -1e9;
  for (let x = 0; x < W; x++) if (mass.id[row * W + x] === want) { if (x < a) a = x; if (x > b) b = x; }
  const bodyW = b >= a ? b - a + 1 : 0;
  return { rise, fill, w: x1 - x0 + 1, h: y1 - y0 + 1, px: px.length, bodyW, span: bodyW ? (x1 - x0 + 1) / bodyW : 0, row };
}
console.log(`\nI2 ARC — collar shape: rise > 0 is an upturned crescent; span is width / body width at its own row`);
for (const side of ['west', 'east']) {
  for (const f of ['BROAD COLLAR', 'COLLAR bib']) {
    let px = pixels(`${side}/${f}`);
    if (!px.length) continue;
    if (SCATTER) {
      /* Structure null (tools/crop.mjs's recommendation): same pixel count, same bbox, no
         shape. If ARC still reports a crescent on this, it is not measuring shape. */
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const [x, y] of px) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const n = px.length; const seen = new Set(); px = [];
      let s = 12345;
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      while (px.length < n) {
        const x = x0 + Math.floor(rnd() * (x1 - x0 + 1)), y = y0 + Math.floor(rnd() * (y1 - y0 + 1));
        const kk = y * W + x; if (seen.has(kk)) continue; seen.add(kk); px.push([x, y]);
      }
    }
    const a = arcOf(px, side); if (!a) continue;
    R[`I2.${side}.${f}`] = a;
    console.log(`  ${side.padEnd(5)} ${f.padEnd(15)} ${String(a.px).padStart(5)} px · ${a.w}x${a.h} · ` +
      `rise ${a.rise >= 0 ? '+' : ''}${a.rise.toFixed(1)} px · fill ${a.fill.toFixed(3)} · ` +
      `span ${a.span.toFixed(2)} (body ${a.bodyW} px at row ${a.row})`);
  }
}

/* --- I3 STRIPE: band count and thickness down each lappet ----------------------------------- */
console.log(`\nI3 STRIPE — lappet banding, sampled down each lappet's own column band`);
for (const side of ['west', 'east']) {
  const t = idxOf(`${side}/LAPPET stripes`); if (t < 0) continue;
  const lap = idxOf(`${side}/NEMES lappets`);
  /* Split the stripe pixels into a left and a right lappet at the stripe set's own x median,
     then walk a column through the densest column of each and count vertical runs. */
  const px = pixels(`${side}/LAPPET stripes`);
  if (!px.length) continue;
  const xsAll = px.map((p) => p[0]).sort((a, b) => a - b);
  const xm = xsAll[xsAll.length >> 1];
  for (const [lbl, sel] of [['L', (x) => x < xm], ['R', (x) => x >= xm]]) {
    const colCount = new Map();
    for (const [x, y] of px) if (sel(x)) colCount.set(x, (colCount.get(x) || 0) + 1);
    if (!colCount.size) continue;
    let bx = 0, bn = -1;
    for (const [x, n] of colCount) if (n > bn) { bn = n; bx = x; }
    const runs = []; let cur = 0;
    for (let y = 0; y < H; y++) {
      const on = full.id[y * W + bx] === t;
      if (on) cur++;
      else if (cur) { runs.push(cur); cur = 0; }
    }
    if (cur) runs.push(cur);
    const gaps = [];
    let lastEnd = -1, inRun = false, runStart = 0;
    for (let y = 0; y < H; y++) {
      const on = full.id[y * W + bx] === t;
      if (on && !inRun) { inRun = true; runStart = y; if (lastEnd >= 0) gaps.push(y - lastEnd); }
      else if (!on && inRun) { inRun = false; lastEnd = y; void runStart; }
    }
    const key = `I3.${side}.${lbl}`;
    R[key] = { bands: runs.length, medThick: mid(runs), medGap: mid(gaps), col: bx };
    console.log(`  ${side.padEnd(5)} lappet ${lbl} @x${String(bx).padStart(4)} · bands ${String(runs.length).padStart(3)} · ` +
      `median band ${String(mid(runs)).padStart(3)} px · median period ${String(mid(runs) + mid(gaps)).padStart(3)} px`);
  }
  void lap;
}

/* --- I4 STEP: the crown -> lappet shoulder in the silhouette --------------------------------- */
/* Walk the massing silhouette's half-width down the head region and report the largest jump
   between adjacent rows. A nemes is a continuous flare; a step is what makes it read as
   stacked slabs. */
console.log(`\nI4 STEP — largest one-row jump in the HEADDRESS silhouette's width (no architecture, no back pillar)`);
for (const side of ['west', 'east']) {
  const want = side === 'west' ? 0 : 1;
  let yTop = H, yBot = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (head.id[y * W + x] === want) { if (y < yTop) yTop = y; if (y > yBot) yBot = y; break; }
  if (yBot < 0) continue;
  const widths = [];
  for (let y = yTop; y <= yBot; y++) {
    let a = 1e9, b = -1e9;
    for (let x = 0; x < W; x++) if (head.id[y * W + x] === want) { if (x < a) a = x; if (x > b) b = x; }
    widths.push(b >= a ? b - a + 1 : 0);
  }
  /* Trim the top and bottom 5% of rows: at the apex the crown is entering the raster and at the
     hem one lappet ends a row before the other, and in both places a one-row change is the
     shape starting or stopping rather than a step in its profile. */
  const trim = Math.max(2, Math.round(widths.length * 0.05));
  let maxJump = 0, at = 0;
  for (let i = trim + 1; i < widths.length - trim; i++) {
    const d = Math.abs(widths[i] - widths[i - 1]);
    if (widths[i] === 0 || widths[i - 1] === 0) continue;
    if (d > maxJump) { maxJump = d; at = yTop + i; }
  }
  const maxW = Math.max(...widths);
  R[`I4.${side}`] = { maxJump, at, maxW, rows: widths.length };
  console.log(`  ${side.padEnd(5)} rows ${String(widths.length).padStart(3)} · widest ${maxW} px · ` +
    `largest jump ${maxJump} px at y=${at} (${(100 * maxJump / maxW).toFixed(1)}% of the head's width in one row)`);
}

/* --- I5 RELIEF: is the carved face modelled or painted on? ----------------------------------- */
/* RESIDUAL about a fitted plane, NOT raw depth spread. The first draft of this metric reported
   the raw p5-p95 view depth over the face box and read 86 cm on a face that is demonstrably a
   set of flat plates — because the head block is 2.27 m deep and the camera sees it obliquely,
   so the metric was measuring the slab's tilt. Least-squares fit z = a·x + b·y + c over the face
   box and report the RMS residual: a flat plate at any angle residuals to ~0, and only actual
   modelling shows up. (§186.2 — an instrument whose population is not what its name says.) */
console.log(`\nI5 RELIEF — RMS depth residual about the fitted face plane`);
for (const side of ['west', 'east']) {
  const tf = idxOf(`${side}/FACE features`); if (tf < 0) continue;
  const s = stat[tf]; if (!s.n) continue;
  const tHead = idxOf(`${side}/neck+headblock`);
  const X = [], Y = [], Z = [];
  for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
    const o = y * W + x, t = full.id[o];
    if (t === tf || t === tHead) { X.push(x); Y.push(y); Z.push(full.depth[o]); }
  }
  const n = X.length; if (n < 200) continue;
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < n; i++) { sx += X[i]; sy += Y[i]; sz += Z[i]; }
  const mx = sx / n, my = sy / n, mz = sz / n;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (let i = 0; i < n; i++) {
    const dx = X[i] - mx, dy = Y[i] - my, dz = Z[i] - mz;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
  }
  const det = sxx * syy - sxy * sxy;
  const a = det ? (sxz * syy - syz * sxy) / det : 0;
  const b = det ? (syz * sxx - sxz * sxy) / det : 0;
  let ss = 0; const res = [];
  for (let i = 0; i < n; i++) { const r = Z[i] - mz - a * (X[i] - mx) - b * (Y[i] - my); ss += r * r; res.push(Math.abs(r)); }
  const rms = Math.sqrt(ss / n);
  res.sort((p, q) => p - q);
  R[`I5.${side}`] = { n, rms, p95: res[Math.floor(0.95 * n)] };
  console.log(`  ${side.padEnd(5)} ${String(n).padStart(6)} px over the face box · ` +
    `RMS residual ${(rms * 100).toFixed(2)} cm · p95 |residual| ${(res[Math.floor(0.95 * n)] * 100).toFixed(2)} cm`);
}

console.log(`\nJSON ${JSON.stringify(R)}`);

/* ---- optional false-colour PNG ------------------------------------------------------------- */
if (PNG) {
  const rgb = Buffer.alloc(W * H * 3, 24);
  const col = (i) => { const h = (i * 0.61803398875) % 1; const f = (k) => { const q = (h * 6 + k) % 6; return Math.round(255 * Math.max(0, Math.min(1, Math.min(q, 4 - q, 1)))); }; return [f(0), f(4), f(2)]; };
  for (let i = 0; i < W * H; i++) {
    const t = full.id[i];
    if (t < 0) { if (t === -2) { rgb[i * 3] = 60; rgb[i * 3 + 1] = 60; rgb[i * 3 + 2] = 60; } continue; }
    const [r, g, b] = col(t); rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
  }
  const stride = W * 3, raw = Buffer.alloc(H * (stride + 1));
  for (let y = 0; y < H; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  let T = null;
  const crc32 = (buf) => { if (!T) { T = new Int32Array(256); for (let n = 0; n < 256; n++) { let x = n; for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1; T[n] = x; } } let x = -1; for (let i = 0; i < buf.length; i++) x = T[(x ^ buf[i]) & 255] ^ (x >>> 8); return x ^ -1; };
  const ch = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), body]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(PNG, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ihdr), ch('IDAT', zlib.deflateSync(raw, { level: 6 })), ch('IEND', Buffer.alloc(0))]));
  console.log(`wrote ${PNG}`);
}
if (warnings.length) console.log(`warnings: ${warnings.length}`);
