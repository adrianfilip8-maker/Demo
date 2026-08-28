#!/usr/bin/env node
/**
 * pilepatch.mjs — §724's mechanism instrument: WHAT does the treasure pile actually sample
 * out of `gold_leaf`, and what albedo does that leave on screen before any light touches it?
 *
 * Two stages, and the first one reads the level rather than a model of it (§435.4 — a probe
 * written from the author's mental model of the level is a test of the model):
 *
 *   A  (Node)     boot the real level via `tests/_kaykitboot.mjs`, find the merged
 *                 `props_gold` mesh, select the treasure pile's own triangles by position,
 *                 and dump their ACTUAL authored UVs. A contrast population — the gilded Ra
 *                 statue 4 m behind the pile, same material, same merge, same vault — is
 *                 selected the same way.
 *   B  (browser)  build `gold_leaf` exactly as the runtime does (same recipe, same seed,
 *                 same size formula, same derive()), then sample it at stage A's UVs with
 *                 the shipped repeat (1/tile) and wrapping, area-weighted per triangle.
 *
 * Reported per population: mean albedo (sRGB), luma L (0..255), relative saturation
 * (max-min)/max, hue; the same after the material's `color: 0xe8b942` multiply (done in
 * LINEAR, which is the space the shader multiplies in — §719's rule); AO / roughness /
 * metalness off the packed ORM at the same UVs; and a 200-draw sweep of random per-coin UV
 * offsets, which is the prediction for the "scatter the sampling window" lever before any
 * code changes.
 *
 *   node tools/pilepatch.mjs
 *   node tools/pilepatch.mjs --json /path/out.json --offsets 200
 *
 * No capture lock: stage A never renders and stage B is a CPU rasteriser in a page (the same
 * shape as texlab.mjs, which this borrows its server from).
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? true) : d; };
const OUT = opt('json', '');
const OFFSETS = parseInt(opt('offsets', '200'), 10);

/* ---------------------------------------------------------------- stage A */

globalThis.self = globalThis;
const { bootKayKit } = await import('../tests/_kaykitboot.mjs');
const THREE = await import('three');

const { engine } = await bootKayKit({ withLevel: true });
engine.scene.updateMatrixWorld(true);

let gold = null;
engine.scene.traverse((o) => { if (o.isMesh && o.name === 'props_gold') gold = o; });
if (!gold) throw new Error('no props_gold mesh in the booted scene');
const mw = gold.matrixWorld.elements;
const identity = mw.every((v, i) => Math.abs(v - [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1][i]) < 1e-9);

const geo = gold.geometry;
const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, idx = geo.index;
if (!uv) throw new Error('props_gold has no uv attribute');

/* The pile as authored: `Props._treasurePile(L.vault.x + 2.9, L.vault.y, L.vault.z + 1.2)`
 * with L.vault = (0, -12, -72) — coins scatter to horizontal r 1.5 + coin radius, ingots to
 * jitter 1.0. Nothing else gold is inside 1.75 m of that centre: the gilded Ra is 4.0 m away,
 * the coffin lid 3.1 m. Selection is on the merged mesh's own vertex positions (place() bakes
 * transforms), so it reads what shipped rather than what the builder intended. */
const PILE = { cx: 2.9, cy: -12.0, cz: -70.8, r: 1.75, yLo: -12.10, yHi: -11.20 };
/* The Ra statue: falconRa transformed to (0, -12, -75.2), ~4.4 m tall, gold from the legs up. */
const RA = { x0: -1.3, x1: 1.3, y0: -12.0, y1: -7.0, z0: -76.5, z1: -73.9 };

const inPile = (i) => {
  const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
  const dx = x - PILE.cx, dz = z - PILE.cz;
  return dx * dx + dz * dz < PILE.r * PILE.r && y > PILE.yLo && y < PILE.yHi;
};
const inRa = (i) => {
  const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
  return x > RA.x0 && x < RA.x1 && y > RA.y0 && y < RA.y1 && z > RA.z0 && z < RA.z1;
};

function collect(pred) {
  const tris = [];
  const uvMin = [Infinity, Infinity], uvMax = [-Infinity, -Infinity];
  let capArea = 0, totArea = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const n = idx ? idx.count : pos.count;
  for (let t = 0; t < n; t += 3) {
    const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
    if (!(pred(i0) && pred(i1) && pred(i2))) continue;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
    if (!(area > 0)) continue;
    const ny = Math.abs((nor.getY(i0) + nor.getY(i1) + nor.getY(i2)) / 3);
    const u = [uv.getX(i0), uv.getY(i0), uv.getX(i1), uv.getY(i1), uv.getX(i2), uv.getY(i2)];
    for (let k = 0; k < 6; k += 2) {
      uvMin[0] = Math.min(uvMin[0], u[k]); uvMax[0] = Math.max(uvMax[0], u[k]);
      uvMin[1] = Math.min(uvMin[1], u[k + 1]); uvMax[1] = Math.max(uvMax[1], u[k + 1]);
    }
    totArea += area; if (ny > 0.7) capArea += area;
    tris.push({ u, area, ny: +ny.toFixed(3) });
  }
  return { tris, uvMin, uvMax, capArea, totArea };
}

const pile = collect(inPile);
const ra = collect(inRa);
const vertsTotal = pos.count;

process.stdout.write(`· pilepatch stage A — props_gold: ${vertsTotal} verts, matrixWorld ${identity ? 'identity' : 'NOT IDENTITY'}\n`);
process.stdout.write(`  pile      ${pile.tris.length} tris, ${pile.totArea.toFixed(3)} m², caps ${(100 * pile.capArea / pile.totArea).toFixed(1)}%  uv [${pile.uvMin.map((v) => v.toFixed(4))}] .. [${pile.uvMax.map((v) => v.toFixed(4))}]\n`);
process.stdout.write(`  Ra statue ${ra.tris.length} tris, ${ra.totArea.toFixed(3)} m²  uv [${ra.uvMin.map((v) => v.toFixed(4))}] .. [${ra.uvMax.map((v) => v.toFixed(4))}]\n`);
if (!pile.tris.length || !ra.tris.length) throw new Error('selection came back empty — the level moved under this tool');

/* ---------------------------------------------------------------- stage B */

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

const result = await page.evaluate(async ({ pileTris, raTris, offsets }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const N = await import('/src/textures/NormalMap.js');

  /* The runtime's own sizing: quality high boots Textures at 1024, gold_leaf is tier 1 so it
   * builds at 512 — the same 512 the baked manifest records for it. Seed formula is texlab's,
   * which is the catalogue's. */
  function hashName(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  const name = 'gold_leaf';
  const recipe = M.MATERIALS[name];
  const sz = recipe.size ? Math.min(recipe.size, 1024) : (recipe.tier >= 1 ? Math.max(256, 1024 >> 1) : 1024);
  const s = new C.Surface(sz, (recipe.seed ?? hashName(name)) >>> 0);
  recipe.build(s, { seed: s.seed, size: sz, name, quality: 'high' });
  const out = N.derive(s, {
    bump: recipe.bump ?? 0.03, tile: recipe.tile ?? 2.0,
    normalScale: recipe.normalScale ?? 1.0, aoStrength: recipe.aoStrength ?? 1.0,
    aoFloor: recipe.aoFloor ?? 0.16, micro: recipe.micro ?? 0.10,
    ormDiv: recipe.ormDiv ?? 2, smoothH: recipe.smoothH ?? 0, microSoft: recipe.microSoft ?? 0.35,
  });
  const alb = out.albedo, orm = out.orm.data, os = out.orm.size;
  const rep = 1 / (Array.isArray(recipe.tile) ? recipe.tile[0] : (recipe.tile ?? 2.0));

  const srgb2lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lin2srgb = (c) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  const TINT = [0xe8 / 255, 0xb9 / 255, 0x42 / 255].map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));

  const wrap = (v) => { const f = v - Math.floor(v); return f; };
  function texel(u, v) {
    const x = Math.min(sz - 1, Math.floor(wrap(u) * sz)), y = Math.min(sz - 1, Math.floor(wrap(v) * sz));
    const i = (y * sz + x) * 4;
    return [alb[i], alb[i + 1], alb[i + 2]];
  }
  function ormTexel(u, v) {
    const x = Math.min(os - 1, Math.floor(wrap(u) * os)), y = Math.min(os - 1, Math.floor(wrap(v) * os));
    const i = (y * os + x) * 4;
    return [orm[i] / 255, orm[i + 1] / 255, orm[i + 2] / 255];
  }

  /* Area-weighted sampling: centroid + the three edge midpoints of every triangle, in the
   * shipped texture space (authored UV x repeat, wrapped). */
  function measure(tris, du = 0, dv = 0) {
    let A = 0, r = 0, g = 0, b = 0, ao = 0, rg = 0, mt = 0, sat = 0, L = 0;
    let lr = 0, lg = 0, lb = 0;
    for (const t of tris) {
      const P = [[t.u[0], t.u[1]], [t.u[2], t.u[3]], [t.u[4], t.u[5]]];
      const S = [
        [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3],
        [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2],
        [(P[1][0] + P[2][0]) / 2, (P[1][1] + P[2][1]) / 2],
        [(P[0][0] + P[2][0]) / 2, (P[0][1] + P[2][1]) / 2],
      ];
      const w = t.area / S.length;
      for (const [su, svv] of S) {
        const [tr, tg, tb] = texel((su + du) * rep, (svv + dv) * rep);
        const [tao, trg, tmt] = ormTexel((su + du) * rep, (svv + dv) * rep);
        A += w; r += tr * w; g += tg * w; b += tb * w;
        ao += tao * w; rg += trg * w; mt += tmt * w;
        const mx = Math.max(tr, tg, tb), mn = Math.min(tr, tg, tb);
        sat += (mx > 0 ? (mx - mn) / mx : 0) * w;
        L += (0.2126 * tr + 0.7152 * tg + 0.0722 * tb) * w;
        lr += srgb2lin(tr) * w; lg += srgb2lin(tg) * w; lb += srgb2lin(tb) * w;
      }
    }
    r /= A; g /= A; b /= A; ao /= A; rg /= A; mt /= A; sat /= A; L /= A; lr /= A; lg /= A; lb /= A;
    // The material multiply, in linear, then back to sRGB for a readable number.
    const er = lin2srgb(lr * TINT[0]), eg = lin2srgb(lg * TINT[1]), eb = lin2srgb(lb * TINT[2]);
    const emx = Math.max(er, eg, eb), emn = Math.min(er, eg, eb);
    const hue = (rr, gg, bb) => {
      const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb), d = mx - mn;
      if (d < 1e-6) return 0;
      let h;
      if (mx === rr) h = ((gg - bb) / d) % 6; else if (mx === gg) h = (bb - rr) / d + 2; else h = (rr - gg) / d + 4;
      return ((h * 60) + 360) % 360;
    };
    return {
      mean: [r, g, b].map((v) => +v.toFixed(1)), L: +L.toFixed(1), sat: +sat.toFixed(3), hue: +hue(r, g, b).toFixed(1),
      tinted: { mean: [er, eg, eb].map((v) => +v.toFixed(1)), L: +(0.2126 * er + 0.7152 * eg + 0.0722 * eb).toFixed(1), sat: +((emx - emn) / (emx || 1)).toFixed(3), hue: +hue(er, eg, eb).toFixed(1) },
      ao: +ao.toFixed(3), rough: +rg.toFixed(3), metal: +mt.toFixed(3),
    };
  }

  /* Whole-tile reference: every texel once. */
  function wholeTile() {
    let r = 0, g = 0, b = 0, sat = 0, L = 0, lr = 0, lg = 0, lb = 0;
    const n = sz * sz;
    for (let i = 0; i < n; i++) {
      const tr = alb[i * 4], tg = alb[i * 4 + 1], tb = alb[i * 4 + 2];
      r += tr; g += tg; b += tb;
      const mx = Math.max(tr, tg, tb), mn = Math.min(tr, tg, tb);
      sat += mx > 0 ? (mx - mn) / mx : 0;
      L += 0.2126 * tr + 0.7152 * tg + 0.0722 * tb;
      lr += srgb2lin(tr); lg += srgb2lin(tg); lb += srgb2lin(tb);
    }
    r /= n; g /= n; b /= n; sat /= n; L /= n; lr /= n; lg /= n; lb /= n;
    const er = lin2srgb(lr * TINT[0]), eg = lin2srgb(lg * TINT[1]), eb = lin2srgb(lb * TINT[2]);
    return {
      mean: [r, g, b].map((v) => +v.toFixed(1)), L: +L.toFixed(1), sat: +sat.toFixed(3),
      tinted: { mean: [er, eg, eb].map((v) => +v.toFixed(1)), L: +(0.2126 * er + 0.7152 * eg + 0.0722 * eb).toFixed(1) },
    };
  }

  /* The offset sweep: what the same pile geometry would sample if each measurement re-drew a
   * random UV offset — the ceiling estimate for a scatter-the-window lever. */
  let rngState = 0x9e3779b9;
  const rand = () => { rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5; rngState >>>= 0; return rngState / 4294967296; };
  const sweep = [];
  for (let k = 0; k < offsets; k++) {
    const m = measure(pileTris, rand() * 1.2, rand() * 1.2);   // offsets in AUTHORED UV units
    sweep.push({ L: m.tinted.L, sat: m.tinted.sat });
  }
  sweep.sort((a, b2) => a.L - b2.L);
  const pct = (p) => sweep[Math.min(sweep.length - 1, Math.floor(p * sweep.length))];

  return {
    size: sz, repeat: +rep.toFixed(4),
    tile: wholeTile(),
    pile: measure(pileTris),
    ra: measure(raTris),
    sweepTintedL: { p05: pct(0.05).L, p50: pct(0.50).L, p95: pct(0.95).L },
    sweepTintedSat: {
      p05: Math.min(...sweep.map((x) => x.sat)),
      p50: sweep.map((x) => x.sat).sort()[Math.floor(sweep.length / 2)],
      p95: Math.max(...sweep.map((x) => x.sat)),
    },
  };
}, { pileTris: pile.tris, raTris: ra.tris, offsets: OFFSETS });

await browser.close();
server.close();

const report = {
  stageA: {
    verts: vertsTotal, matrixWorldIdentity: identity,
    pile: { tris: pile.tris.length, area: +pile.totArea.toFixed(3), capFrac: +(pile.capArea / pile.totArea).toFixed(3), uvMin: pile.uvMin, uvMax: pile.uvMax },
    ra: { tris: ra.tris.length, area: +ra.totArea.toFixed(3), uvMin: ra.uvMin, uvMax: ra.uvMax },
  },
  stageB: result,
};
process.stdout.write(JSON.stringify(report.stageB, null, 1) + '\n');
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
process.exit(0);
