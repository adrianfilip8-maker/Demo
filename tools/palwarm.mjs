/**
 * palwarm — is the *source* palette warm or cool, weighted by the surface the player looks at?
 *
 *   node tools/palwarm.mjs                     # measure the committed blob, all arms
 *   node tools/palwarm.mjs --live 256          # re-bake in headless Chromium at 256 instead
 *   node tools/palwarm.mjs --json out.json     # machine-readable, for a before/after diff
 *   node tools/palwarm.mjs --cmp before.json   # print the delta against an earlier run
 *
 * Criterion, weighting, thresholds and calibration arms are registered in
 * `progress/records/PREREG-palwarm.md` and this file implements exactly that document. Read it
 * first; the short version follows.
 *
 * ── Why this measures albedo and not a frame ────────────────────────────────────────────────
 *
 * Critic pass 8 reports `sly-closeup` at 15.5 % warm / 78.8 % cool. That is a **frame** number:
 * albedo x light x ramp x grade, and two other agents are moving the last three this week. Any
 * palette verdict taken off a screenshot attributes their change to these textures. So nothing
 * here touches a frame. Pixels come out of `public/assets/tex/textures.bin` through the runtime's
 * own `PngCodec.unfilter` + `zlib.inflateSync` — **no 2D canvas on the path anywhere**, because
 * a canvas round trip is what returned 57 % of `torch_flame`'s bytes wrong with a peak error of
 * 184/255 on red (KNOWN_ISSUES §224).
 *
 * ── Why the weight is screen coverage and not file count or world area ──────────────────────
 *
 * One number per file lets a 512² sprite outvote 36 m of temple wall. Raw world area is worse:
 * the terrain footprint is ~10^5 m² of (warm) sand and would drown every other surface in the
 * level. The weight used is **pixels covered from the canonical shot cameras**, rasterised from
 * geometry with no lighting, no shadow, no grade and no mips — coverage is a property of the
 * level and the framing, so unlike everything else about a frame it does not move when LIGHTING
 * or RAMP moves. Method is `progress/records/ringpx.mjs`'s, extended to terrain/props/vegetation
 * so sand and foliage are not silently attributed to the masonry behind them.
 */
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { parsePng, unfilter } from '../src/textures/PngCodec.js';
import { SHOTS } from '../src/core/Shots.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

const LIVE = has('live') ? parseInt(opt('live', '256'), 10) : 0;
const W = parseInt(opt('w', '1280'), 10), H = parseInt(opt('h', '720'), 10);
/** The four framings critic pass 8 scored. Pooled by pixel count — see PREREG §3. */
const SHOT_SET = (opt('shots', 'hero,temple,courtyard,sly-closeup')).split(',');

/* ══════════════════════════ 1. the classifier ══════════════════════════ */

/* Registered in PREREG §2 and not to be retuned after a candidate has been seen. Two 120° wedges
 * 180° apart (warm centred on 30°, cool on 210°), two 60° transition wedges between them, and a
 * chroma gate below which a texel has no hue worth arguing about. */
export const CHROMA_GATE = 0.06;
export const WARM_LO = 330, WARM_HI = 90;      // wraps through 0
export const COOL_LO = 150, COOL_HI = 270;

/** HSV hue in degrees, or -1 for achromatic. */
function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c < 1e-9) return -1;
  let h;
  if (mx === r) h = ((g - b) / c) % 6;
  else if (mx === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const isWarm = (h) => h >= WARM_LO || h < WARM_HI;
const isCool = (h) => h >= COOL_LO && h < COOL_HI;

/**
 * Classify one RGBA buffer.
 *
 * `W` (PREREG §2) is deliberately averaged over **all** gated texels, not only chromatic ones:
 * a recipe that answers "too cool" by desaturating to grey must not be able to improve it, and
 * it cannot, because a grey texel contributes exactly zero rather than being excluded.
 */
export const HUE_BINS = 24;                       // 15° each
export function classify(rgba) {
  let n = 0, chromatic = 0, warm = 0, cool = 0, neither = 0, achro = 0;
  let sumW = 0, sumC = 0, sumY = 0;
  const hist = new Float64Array(HUE_BINS);
  /* Albedo value histogram, 256 bins. Present because critic pass 8's other headline — "no
     highlight range at all: p99 172.2, 0.000% above luma 230" — has a texture-side ceiling in it:
     a surface whose own albedo tops out at 0.62 cannot reach 230/255 in frame at any exposure
     below 1.45x. Whether that ceiling is the binding one is LIGHTING's question, but whether it
     exists is measurable here and belongs in this table rather than in an argument. */
  const vhist = new Float64Array(256);
  for (let p = 0; p < rgba.length; p += 4) {
    if (rgba[p + 3] < 128) continue;              // alpha gate — not a visible surface
    const r = rgba[p] / 255, g = rgba[p + 1] / 255, b = rgba[p + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
    n++;
    sumC += c;
    const yv = r * 0.2126 + g * 0.7152 + b * 0.0722;
    sumY += yv;
    vhist[Math.min(255, Math.round(yv * 255))]++;
    if (c < CHROMA_GATE) { achro++; continue; }
    const h = hueOf(r, g, b);
    sumW += c * Math.cos((h - 30) * Math.PI / 180);
    chromatic++;
    hist[Math.min(HUE_BINS - 1, Math.floor(h / (360 / HUE_BINS)))]++;
    if (isWarm(h)) warm++;
    else if (isCool(h)) cool++;
    else neither++;
  }
  /* Achromatic texels contribute 0 to the numerator of W but DO count in its denominator — see
   * the note above. `warmPct`/`coolPct` use the chromatic denominator, which is the critic's. */
  const denom = chromatic || 1;
  for (let i = 0; i < HUE_BINS; i++) hist[i] /= denom;
  /* Median hue from the histogram's cumulative, taken on the warm-centred axis (bins re-based at
     -180° relative to 30°) so a hue family straddling 0° does not report as 180°. */
  let cum = 0, hueMed = NaN;
  for (let k = 0; k < HUE_BINS; k++) {
    const i = (k + 22) % HUE_BINS;                     // start at 330°, i.e. the warm wedge's foot
    cum += hist[i];
    if (cum >= 0.5) { hueMed = (i * 15 + 7.5) % 360; break; }
  }
  const vq = (q) => { let c = 0; for (let i = 0; i < 256; i++) { c += vhist[i]; if (c >= q * n) return i / 255; } return 1; };
  return {
    n, chromatic, achro, hist: Array.from(hist), hueMed,
    luma50: vq(0.50), luma99: vq(0.99),
    warmPct: 100 * warm / denom,
    coolPct: 100 * cool / denom,
    neitherPct: 100 * neither / denom,
    achroPct: 100 * achro / (n || 1),
    warmth: sumW / (n || 1),
    chroma: sumC / (n || 1),
    luma: sumY / (n || 1),
  };
}

/** Rotate every texel's hue by `deg`, preserving chroma and value. CAL-2's transform. */
export function hueRotate(rgba, deg) {
  const out = new Uint8Array(rgba.length);
  for (let p = 0; p < rgba.length; p += 4) {
    const r = rgba[p] / 255, g = rgba[p + 1] / 255, b = rgba[p + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
    const h0 = hueOf(r, g, b);
    if (h0 < 0) { out[p] = rgba[p]; out[p + 1] = rgba[p + 1]; out[p + 2] = rgba[p + 2]; out[p + 3] = rgba[p + 3]; continue; }
    const h = (((h0 + deg) % 360) + 360) % 360;
    const hp = h / 60, x = c * (1 - Math.abs((hp % 2) - 1));
    let rr = 0, gg = 0, bb = 0;
    if (hp < 1) { rr = c; gg = x; } else if (hp < 2) { rr = x; gg = c; }
    else if (hp < 3) { gg = c; bb = x; } else if (hp < 4) { gg = x; bb = c; }
    else if (hp < 5) { rr = x; bb = c; } else { rr = c; bb = x; }
    out[p] = Math.round((rr + mn) * 255);
    out[p + 1] = Math.round((gg + mn) * 255);
    out[p + 2] = Math.round((bb + mn) * 255);
    out[p + 3] = rgba[p + 3];
  }
  return out;
}

/* ══════════════════════════ 2. the pixels ══════════════════════════ */

function fromBlob() {
  const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/textures/baked.json'), 'utf8'));
  const blob = fs.readFileSync(path.join(ROOT, 'public/assets/tex/textures.bin'));
  const out = new Map();
  for (const [name, rec] of Object.entries(M.recipes)) {
    const s = rec.slots.albedo;
    const png = new Uint8Array(blob.subarray(s.off, s.off + s.len));
    const { width, height, zlib: z } = parsePng(png);
    const data = unfilter(new Uint8Array(zlib.inflateSync(Buffer.from(z))), width, height);
    out.set(name, { rgba: data, size: width });
  }
  return { maps: out, label: `blob @ ${M.texSize}` };
}

async function fromLive(size) {
  /* Eleven of the twenty-three recipes rasterise vector art through a 2D canvas and are simply
   * unreachable from plain Node, so the live path goes where the recipes are — same reason
   * `bakeassets.mjs` is a Playwright script. Bytes come back over a socket as bytes, never
   * through `page.evaluate`'s JSON return value. */
  const { chromium } = await import('playwright');
  const http = await import('node:http');
  const inbox = new Map();
  const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const [pathname, query] = req.url.split('?');
    const u = decodeURIComponent(pathname);
    if (req.method === 'POST' && u === '/put') {
      const q = new URLSearchParams(query || '');
      const parts = [];
      req.on('data', (c) => parts.push(c));
      req.on('end', () => { inbox.set(q.get('name'), Buffer.concat(parts)); res.writeHead(204); res.end(); });
      return;
    }
    if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  const port = 7900 + (process.pid % 300);
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('  [page]', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/lab.html`);
  const names = await page.evaluate(async (sz) => {
    const { PREWARM, MATERIALS } = await import('/src/textures/Materials.js');
    const { bake } = await import('/src/textures/Bake.js');
    globalThis.__TEX_AB = '';
    const got = [];
    for (const n of PREWARM) {
      if (!MATERIALS[n]) continue;
      const p = bake(n, sz, 'high');
      await fetch(`/put?name=${encodeURIComponent(n)}`, { method: 'POST', body: p.albedo });
      got.push([n, p.size]);
    }
    return got;
  }, size);
  await browser.close();
  server.close();
  const out = new Map();
  for (const [n, sz] of names) {
    const b = inbox.get(n);
    if (!b) throw new Error(`${n} never arrived from the page`);
    out.set(n, { rgba: new Uint8Array(b.buffer, b.byteOffset, b.length), size: sz });
  }
  return { maps: out, label: `live @ ${size}` };
}

/* ══════════════════════════ 3. the weight ══════════════════════════ */

/**
 * Screen coverage per recipe, geometric only.
 *
 * Builds terrain (which owns vegetation and water), architecture and props exactly as `main.js`
 * orders them, then software-rasterises every triangle from each shot camera with a depth buffer
 * and tallies pixels by material. No lighting, no grade, no mips: this is "how much of the frame
 * is this surface", nothing more.
 *
 * Meshes are named by their module (`arch:sandstone_block`, `terrain:sand_fine`, …) and mapped to
 * recipe names by the table below. **Anything that maps to no recipe is reported, not dropped** —
 * a silently unattributed 20 % of the frame would make every weighted number a fiction.
 */
async function coverage() {
  const warnings = [];
  const built = {};
  const texStub = { tex: () => null, get: () => null, material: () => null, bundle: () => null };
  const scene = new THREE.Scene();
  const engine = {
    quality: 'high', scene, debug: {}, stats: {}, warnings,
    warn: (m) => warnings.push(m), has: (k) => !!built[k],
    get: (k) => (k === 'textures' ? texStub : built[k] || null),
    on: () => () => {}, emit: () => {}, registerCollider: () => {},
    camera: new THREE.PerspectiveCamera(50, W / H, 0.1, 2000),
  };
  const PLAN = [
    ['terrain', 'src/world/Terrain.js', 'Terrain'],
    ['architecture', 'src/world/Architecture.js', 'Architecture'],
    ['props', 'src/world/Props.js', 'Props'],
  ];
  for (const [key, rel, cls] of PLAN) {
    try {
      const mod = await import(path.join(ROOT, rel));
      const C = mod[cls];
      if (!C) continue;
      const inst = new C(engine);
      await inst.init?.();
      built[key] = inst;
      for (const g of [inst.root, inst.group, inst.mesh]) {
        if (g && g.isObject3D && !scene.getObjectById(g.id)) scene.add(g);
      }
    } catch (e) { warnings.push(`${key}: ${String(e.message).split('\n')[0]}`); }
  }
  scene.updateMatrixWorld(true);

  /* Flatten once; every shot reuses it. Ink shells re-draw their host and would double-count. */
  const tris = [];
  const seen = new Set();
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh || o.visible === false || seen.has(o.uuid)) return;
    seen.add(o.uuid);
    if (o.userData?.isOutlineShell || o.userData?.slyOutline || o.userData?.collisionProxy) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    const name = o.material?.name || o.name || '?';
    const pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        p0.fromBufferAttribute(pos, i0).applyMatrix4(m);
        p1.fromBufferAttribute(pos, i1).applyMatrix4(m);
        p2.fromBufferAttribute(pos, i2).applyMatrix4(m);
        tris.push([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, name]);
      }
    }
  });

  const px = new Map();     // material name -> pixels, pooled over SHOT_SET
  let total = 0;
  const depth = new Float32Array(W * H), owner = new Int32Array(W * H);
  const mats = [];
  const matId = new Map();
  const clip = new THREE.Vector4();
  for (const sn of SHOT_SET) {
    const s = SHOTS[sn];
    if (!s?.pos) { warnings.push(`no such shot: ${sn}`); continue; }
    const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 2000);
    cam.position.fromArray(s.pos);
    cam.lookAt(new THREE.Vector3(...s.target));
    cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    depth.fill(Infinity); owner.fill(-1);
    for (const t of tris) {
      const name = t[9];
      let id = matId.get(name);
      if (id === undefined) { id = mats.length; mats.push(name); matId.set(name, id); }
      /* Near-plane clip before projection: dropping straddling triangles instead of clipping them
         is how `raster.mjs` once invented a defect out of nothing (§10). */
      const v = [];
      for (let k = 0; k < 3; k++) {
        clip.set(t[k * 3], t[k * 3 + 1], t[k * 3 + 2], 1).applyMatrix4(vp);
        v.push([clip.x, clip.y, clip.z, clip.w]);
      }
      for (const poly of clipNear(v)) rasterise(poly, id, depth, owner);
    }
    for (let i = 0; i < owner.length; i++) {
      const id = owner[i];
      if (id < 0) continue;
      px.set(mats[id], (px.get(mats[id]) || 0) + 1);
      total++;
    }
  }
  return { px, total, warnings };
}

/** Sutherland–Hodgman against w > eps, in clip space. */
function clipNear(v) {
  const EPS = 1e-4;
  const out = [];
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length];
    const ain = a[3] > EPS, bin = b[3] > EPS;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (EPS - a[3]) / (b[3] - a[3]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, EPS]);
    }
  }
  if (out.length < 3) return [];
  const fans = [];
  for (let i = 1; i + 1 < out.length; i++) fans.push([out[0], out[i], out[i + 1]]);
  return fans;
}

function rasterise(tri, id, depth, owner) {
  const sx = [], sy = [], sz = [];
  for (const p of tri) {
    const iw = 1 / p[3];
    sx.push((p[0] * iw * 0.5 + 0.5) * W);
    sy.push((1 - (p[1] * iw * 0.5 + 0.5)) * H);
    sz.push(p[2] * iw);
  }
  const x0 = Math.max(0, Math.floor(Math.min(sx[0], sx[1], sx[2])));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(sx[0], sx[1], sx[2])));
  const y0 = Math.max(0, Math.floor(Math.min(sy[0], sy[1], sy[2])));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(sy[0], sy[1], sy[2])));
  if (x1 < x0 || y1 < y0) return;
  const d = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
  if (Math.abs(d) < 1e-12) return;
  const inv = 1 / d;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const pxc = x + 0.5;
      const w0 = ((sx[1] - pxc) * (sy[2] - py) - (sx[2] - pxc) * (sy[1] - py)) * inv;
      const w1 = ((sx[2] - pxc) * (sy[0] - py) - (sx[0] - pxc) * (sy[2] - py)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * sz[0] + w1 * sz[1] + w2 * sz[2];
      if (z < -1 || z > 1) continue;
      const i = y * W + x;
      if (z >= depth[i]) continue;
      depth[i] = z; owner[i] = id;
    }
  }
}

/**
 * Mesh/material name -> recipe name.
 *
 * Architecture names its materials `arch:<recipe>`, so that half is mechanical. Everything else
 * is a named mapping and every unmapped name is printed with its share, because an unattributed
 * slice of the frame silently reweights every number below it.
 */
const NAME_MAP = {
  /* Terrain: every ring is one material carrying `sand_fine` as its albedo (Terrain.js:736). */
  sand_ring0: 'sand_fine', sand_ring1: 'sand_fine', sand_ring2: 'sand_fine', sand_ring3: 'sand_fine',
  sand: 'sand_fine', dunes: 'sand_fine', ground: 'sand_fine',
  /* Props: the `tex` column of `Props.MATERIALS` (Props.js:29). `props_dark`, `props_glass` and
     the pyramids carry `tex: null` — a material colour with no map — so they have no albedo of
     mine to measure and stay deliberately unattributed rather than being given someone's texture. */
  props_stone: 'granite_pink', props_lime: 'limestone_polished', props_gold: 'gold_leaf',
  props_bronze: 'bronze_aged', props_wood: 'wood_old', props_rope: 'rope',
  props_cloth: 'linen_cloth', props_lapis: 'lapis_inlay', props_carnelian: 'carnelian_inlay',
  props_cork: 'wood_old',
  palm_trunk: 'palm_bark', palm_leaf: 'palm_frond', frond: 'palm_frond',
  papyrus: 'papyrus_reed', reeds: 'papyrus_reed',
};
function toRecipe(name, recipes) {
  if (recipes.has(name)) return name;
  const m = /^(?:arch|prop|props|terrain|veg|vegetation):(.+)$/.exec(name);
  if (m && recipes.has(m[1])) return m[1];
  const alias = NAME_MAP[name] || (m ? NAME_MAP[m[1]] : null);
  if (alias && recipes.has(alias)) return alias;
  /* Substring match as a last resort, longest first — prop material names carry suffixes. */
  let best = null;
  for (const r of recipes.keys()) if (name.includes(r) && (!best || r.length > best.length)) best = r;
  return best;
}

/* ══════════════════════════ 4. run ══════════════════════════ */

const src = LIVE ? await fromLive(LIVE) : fromBlob();
console.log(`# palwarm  source=${src.label}  recipes=${src.maps.size}  shots=${SHOT_SET.join(',')}  ${W}x${H}`);
console.log(`# warm = hue [330,90)  cool = hue [150,270)  chroma gate ${CHROMA_GATE}  (PREREG-palwarm.md §2)`);

/* ---- CAL-1: does the classifier label four known colours correctly? ---- */
{
  const swatch = (hex) => {
    const a = new Uint8Array(4 * 64);
    for (let i = 0; i < 64; i++) { a[i * 4] = (hex >> 16) & 255; a[i * 4 + 1] = (hex >> 8) & 255; a[i * 4 + 2] = hex & 255; a[i * 4 + 3] = 255; }
    return classify(a);
  };
  const cases = [
    ['ochre   #d4823a', 0xd4823a, 'warm'], ['lapis   #1f4f96', 0x1f4f96, 'cool'],
    ['malachi #2f8f5a', 0x2f8f5a, 'neither'], ['grey    #808080', 0x808080, 'achromatic'],
  ];
  let ok = true;
  for (const [label, hex, want] of cases) {
    const c = swatch(hex);
    const got = c.achroPct > 50 ? 'achromatic' : c.warmPct > 50 ? 'warm' : c.coolPct > 50 ? 'cool' : 'neither';
    const pass = got === want;
    ok &&= pass;
    console.log(`CAL-1 ${label} -> ${got.padEnd(10)} want ${want.padEnd(10)} ${pass ? 'OK' : 'FAIL'}`);
  }
  if (!ok) { console.error('CAL-1 FAILED — the classifier mislabels a known colour. Run VOID.'); process.exit(1); }
}

/* ---- coverage weights ---- */
const cov = await coverage();
const weights = new Map();
const unmapped = new Map();
for (const [name, n] of cov.px) {
  const r = toRecipe(name, src.maps);
  if (!r) { unmapped.set(name, (unmapped.get(name) || 0) + n); continue; }
  weights.set(r, (weights.get(r) || 0) + n);
}
const covered = [...weights.values()].reduce((a, b) => a + b, 0);
const unmappedPx = [...unmapped.values()].reduce((a, b) => a + b, 0);
console.log(`\n# coverage: ${cov.total} px over ${SHOT_SET.length} shots; ${covered} px map to a recipe`
  + ` (${(100 * covered / (cov.total || 1)).toFixed(1)}%), ${unmappedPx} px unattributed (${(100 * unmappedPx / (cov.total || 1)).toFixed(1)}%)`);
if (cov.warnings.length) for (const w of cov.warnings) console.log(`  ! ${w}`);
if (unmapped.size) {
  console.log('  unattributed materials (largest first) — these carry NO weight:');
  for (const [n, v] of [...unmapped].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${(100 * v / cov.total).toFixed(2).padStart(6)}%  ${n}`);
  }
}

/* ---- per-recipe table ---- */
const rows = [];
for (const [name, m] of src.maps) {
  const c = classify(m.rgba);
  rows.push({ name, size: m.size, w: (weights.get(name) || 0) / (covered || 1), ...c });
}
rows.sort((a, b) => b.w - a.w);
console.log('\nrecipe                 weight%  hue50   warm%   cool%  neith%  achro%   warmth   chroma    luma   luma99');
for (const r of rows) {
  console.log(`${r.name.padEnd(20)} ${(100 * r.w).toFixed(2).padStart(7)} ${r.hueMed.toFixed(0).padStart(5)}° ${r.warmPct.toFixed(1).padStart(7)} `
    + `${r.coolPct.toFixed(1).padStart(7)} ${r.neitherPct.toFixed(1).padStart(7)} ${r.achroPct.toFixed(1).padStart(7)} `
    + `${r.warmth >= 0 ? '+' : ''}${r.warmth.toFixed(4).padStart(7)} ${r.chroma.toFixed(4).padStart(8)} ${r.luma.toFixed(4).padStart(7)} ${r.luma99.toFixed(4).padStart(7)}`);
}

/** Weighted aggregate. Shares are re-pooled from counts, not averaged from percentages. */
function aggregate(list) {
  let cw = 0, ww = 0, coolw = 0, nw = 0, aw = 0, warmth = 0, chroma = 0, luma = 0, tw = 0;
  for (const r of list) {
    if (!r.w) continue;
    tw += r.w;
    cw += r.w * (r.chromatic / (r.n || 1));
    ww += r.w * (r.chromatic / (r.n || 1)) * r.warmPct / 100;
    coolw += r.w * (r.chromatic / (r.n || 1)) * r.coolPct / 100;
    nw += r.w * (r.chromatic / (r.n || 1)) * r.neitherPct / 100;
    aw += r.w * r.achroPct / 100;
    warmth += r.w * r.warmth; chroma += r.w * r.chroma; luma += r.w * r.luma;
  }
  const k = tw || 1;
  return {
    warmPct: 100 * ww / (cw || 1), coolPct: 100 * coolw / (cw || 1), neitherPct: 100 * nw / (cw || 1),
    achroPct: 100 * aw / k, warmth: warmth / k, chroma: chroma / k, luma: luma / k, weightSum: tw,
  };
}
/**
 * Hue separation — the statistic the warm/cool split cannot see.
 *
 * A scene can be 95 % warm and still be wrong, because "warm" is a 120° wedge and a palette that
 * puts every surface in the same 15° of it has no colour design in it at all: sandstone, granite,
 * gilding, plaster and vegetation are then the same hue at different brightnesses. `h30` is the
 * share of chromatic texels inside the single most populated 30° bucket (the statistic
 * `hieroglyph_wall`'s own note already quotes as "100 % inside one 30 deg bucket"); `hueN` is the
 * effective number of 15° hue families, exp(Shannon entropy). Lower `h30` and higher `hueN` mean
 * more separation. Both are coverage-weighted.
 */
function hueSpread(list) {
  const hist = new Float64Array(HUE_BINS);
  let tw = 0;
  for (const r of list) {
    if (!r.w) continue;
    const chromShare = r.chromatic / (r.n || 1);
    const wt = r.w * chromShare;
    tw += wt;
    for (let i = 0; i < HUE_BINS; i++) hist[i] += wt * r.hist[i];
  }
  for (let i = 0; i < HUE_BINS; i++) hist[i] /= (tw || 1);
  let h30 = 0;
  for (let i = 0; i < HUE_BINS; i++) h30 = Math.max(h30, hist[i] + hist[(i + 1) % HUE_BINS]);
  let ent = 0;
  for (let i = 0; i < HUE_BINS; i++) if (hist[i] > 1e-12) ent -= hist[i] * Math.log(hist[i]);
  return { hist: Array.from(hist), h30: 100 * h30, hueN: Math.exp(ent) };
}

const AGG = aggregate(rows);
const SPREAD = hueSpread(rows);
const topW = rows[0] ? rows[0].w : 0;
console.log(`\nCAL-4 weights sum ${AGG.weightSum.toFixed(4)} (want 1.0000); largest single recipe ${(100 * topW).toFixed(1)}%`
  + (topW > 0.60 ? '  ** >60%: the aggregate is one recipe wearing a hat **' : '  OK'));

console.log(`\nCOVERAGE-WEIGHTED  warm ${AGG.warmPct.toFixed(1)}%   cool ${AGG.coolPct.toFixed(1)}%   neither ${AGG.neitherPct.toFixed(1)}%`
  + `   achromatic ${AGG.achroPct.toFixed(1)}% of texels`);
console.log(`                   warmth W ${AGG.warmth >= 0 ? '+' : ''}${AGG.warmth.toFixed(4)}   chroma ${AGG.chroma.toFixed(4)}   luma ${AGG.luma.toFixed(4)}`);
console.log(`HUE SEPARATION     h30 ${SPREAD.h30.toFixed(1)}% in one 30° bucket   hueN ${SPREAD.hueN.toFixed(2)} effective 15° families`);
{
  const mx = Math.max(...SPREAD.hist);
  let s = '';
  for (let i = 0; i < HUE_BINS; i++) {
    const pctv = 100 * SPREAD.hist[i];
    if (pctv < 0.05) continue;
    s += `  ${String(i * 15).padStart(3)}°-${String(i * 15 + 15).padStart(3)}° ${pctv.toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(40 * SPREAD.hist[i] / mx))}\n`;
  }
  console.log('coverage-weighted hue histogram (chromatic texels, 15° bins):\n' + s);
}

/* ---- CAL-2: rotate the REAL data 180° and require the shares to swap ---- */
{
  const rot = rows.map((r) => {
    const m = src.maps.get(r.name);
    return { name: r.name, w: r.w, ...classify(hueRotate(m.rgba, 180)) };
  });
  const R = aggregate(rot);
  const dW = Math.abs(R.warmPct - AGG.coolPct), dC = Math.abs(R.coolPct - AGG.warmPct);
  const dMag = Math.abs(Math.abs(R.warmth) - Math.abs(AGG.warmth)) / (Math.abs(AGG.warmth) || 1);
  const swapped = dW <= 2 && dC <= 2 && Math.sign(R.warmth) === -Math.sign(AGG.warmth) && dMag <= 0.05;
  console.log(`\nCAL-2 hue+180 on the real set -> warm ${R.warmPct.toFixed(1)}% (want ${AGG.coolPct.toFixed(1)}), `
    + `cool ${R.coolPct.toFixed(1)}% (want ${AGG.warmPct.toFixed(1)}), W ${R.warmth >= 0 ? '+' : ''}${R.warmth.toFixed(4)} `
    + `(want ${(-AGG.warmth).toFixed(4)})  ${swapped ? 'FIRED' : 'DID NOT FIRE'}`);
  if (!swapped) { console.error('CAL-2 FAILED — the instrument cannot see a 180° rotation of its own input. Run VOID.'); process.exit(1); }
}

/* ---- CAL-3: same input twice, bit-identical ---- */
{
  const a = JSON.stringify(rows.map((r) => classify(src.maps.get(r.name).rgba)));
  const b = JSON.stringify(rows.map((r) => classify(src.maps.get(r.name).rgba)));
  console.log(`CAL-3 null (same input twice) ${a === b ? 'identical OK' : 'DIFFERS — FAIL'}`);
  if (a !== b) process.exit(1);
}

/* ---- thresholds ---- */
const P = [
  ['P1 cool <= 8%', AGG.coolPct <= 8, `${AGG.coolPct.toFixed(1)}%`],
  ['P1 warm >= 80%', AGG.warmPct >= 80, `${AGG.warmPct.toFixed(1)}%`],
  ['P2 W >= +0.085', AGG.warmth >= 0.085, AGG.warmth.toFixed(4)],
];
const veg = ['palm_frond', 'papyrus_reed'].map((n) => rows.find((r) => r.name === n)).filter(Boolean);
for (const v of veg) P.push([`P5 ${v.name} keeps >=50% non-warm`, (100 - v.warmPct) >= 50, `${(100 - v.warmPct).toFixed(1)}%`]);
console.log('');
for (const [label, ok, val] of P) console.log(`${ok ? 'PASS' : 'MISS'}  ${label.padEnd(34)} ${val}`);

/* ---- optional comparison against an earlier run ---- */
const out = { agg: AGG, spread: SPREAD, rows: rows.map(({ name, w, hueMed, luma99, warmPct, coolPct, neitherPct, achroPct, warmth, chroma, luma }) => ({ name, w, hueMed, luma99, warmPct, coolPct, neitherPct, achroPct, warmth, chroma, luma })) };
const cmp = opt('cmp', null);
if (cmp) {
  const B = JSON.parse(fs.readFileSync(cmp, 'utf8'));
  const by = new Map(B.rows.map((r) => [r.name, r]));
  console.log('\nDELTA vs ' + cmp);
  console.log('recipe                weight%   warm%          cool%          warmth         luma');
  for (const r of out.rows) {
    const b = by.get(r.name); if (!b) continue;
    const d = (x, y, p = 1) => `${y.toFixed(p)}->${x.toFixed(p)} (${x - y >= 0 ? '+' : ''}${(x - y).toFixed(p)})`;
    console.log(`${r.name.padEnd(20)} ${(100 * r.w).toFixed(2).padStart(7)}  ${d(r.warmPct, b.warmPct).padEnd(14)} ${d(r.coolPct, b.coolPct).padEnd(14)} ${d(r.warmth, b.warmth, 4).padEnd(22)} ${d(r.luma, b.luma, 4)}`);
  }
  const a = B.agg;
  console.log(`\nAGGREGATE  warm ${a.warmPct.toFixed(1)} -> ${AGG.warmPct.toFixed(1)} (${(AGG.warmPct - a.warmPct >= 0 ? '+' : '')}${(AGG.warmPct - a.warmPct).toFixed(1)})`
    + `   cool ${a.coolPct.toFixed(1)} -> ${AGG.coolPct.toFixed(1)} (${(AGG.coolPct - a.coolPct >= 0 ? '+' : '')}${(AGG.coolPct - a.coolPct).toFixed(1)})`
    + `   W ${a.warmth.toFixed(4)} -> ${AGG.warmth.toFixed(4)}`
    + `   luma ${a.luma.toFixed(4)} -> ${AGG.luma.toFixed(4)} (${(AGG.luma - a.luma >= 0 ? '+' : '')}${(AGG.luma - a.luma).toFixed(4)})`
    + `   chroma ${a.chroma.toFixed(4)} -> ${AGG.chroma.toFixed(4)}`);
  console.log(`P3 luma within +-0.02: ${Math.abs(AGG.luma - a.luma) <= 0.02 ? 'PASS' : 'FIRED — the palette moved by brightness'}  (delta ${(AGG.luma - a.luma).toFixed(4)})`);
  console.log(`P4 chroma not below control: ${AGG.chroma >= a.chroma ? 'PASS' : 'FIRED — warmth bought by desaturating'}  (delta ${(AGG.chroma - a.chroma).toFixed(4)})`);
  if (B.spread) {
    console.log(`   h30 ${B.spread.h30.toFixed(1)}% -> ${SPREAD.h30.toFixed(1)}% (${(SPREAD.h30 - B.spread.h30 >= 0 ? '+' : '')}${(SPREAD.h30 - B.spread.h30).toFixed(1)})`
      + `   hueN ${B.spread.hueN.toFixed(2)} -> ${SPREAD.hueN.toFixed(2)} (${(SPREAD.hueN - B.spread.hueN >= 0 ? '+' : '')}${(SPREAD.hueN - B.spread.hueN).toFixed(2)})`);
  }
}

const jsonOut = opt('json', null);
if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1)); console.log(`\njson -> ${jsonOut}`); }
