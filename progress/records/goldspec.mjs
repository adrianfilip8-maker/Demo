/**
 * goldspec — does `hieroglyph_gilded`'s `arrisPolish` (the ROUGHNESS half of the arris) reach
 * the shader's specular term at all, and can what reaches it reach the frame?
 *
 * The albedo lab (`abtex`) is structurally blind to this: `arrisPolish` writes `s.rough` and
 * nothing else, and every statistic abtex computes is over the albedo. `texlab --lit` does
 * evaluate a specular term but at its *group* defaults (carved: spec 0.30 / gloss 24, no metal
 * branch), not at this recipe's consumer uniforms (spec 0.55 / gloss 64 / uMetal 0.85).
 *
 * SCOPE — the transforms between what this computes and what the renderer draws, i.e. the
 * suffix NOT implemented (KNOWN_ISSUES §11):
 *
 *   STAGE 1 (texture). Builds the recipe twice in ONE process with `globalThis.__TEX_AB` set
 *   differently, and compares the **shipped ORM** — after `refineRoughness` and after
 *   `packORM`'s div-2 box downsample and 8-bit quantise — not the raw authored `s.rough`.
 *   It then evaluates `toon.glsl.js`'s specular expression *verbatim* at the consumer's real
 *   uniforms. NOT implemented: shadow (`sh` is pinned to 1, so this is an upper bound), mip
 *   filtering, anisotropic filtering, the detail triplanar layer, bloom, AgX, saturation,
 *   split-tone, the ink pass, FXAA. The output is a delta in **linear radiance before tone
 *   mapping** — the quantity the grade's local slope then multiplies, not an 8-bit number.
 *
 *   STAGE 2 (geometry). Area-weighted over frustum-visible, front-facing triangles of one
 *   material at a canonical framing. NOT implemented: shadow map, occlusion by other geometry,
 *   character and FX, and the normal map — which enters only as a stated angular BOUND taken
 *   from stage 1's built normal map. So "fraction that can reach the lobe" is an UPPER bound in
 *   both stages, which is the direction a null needs it to be wrong in.
 *
 *   node progress/records/goldspec.mjs [--size 1024] [--recipe hieroglyph_gilded]
 *                                      [--off hgpolish] [--json out.json]
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';

const ROOT = '/home/user/Demo';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const RECIPE = opt('recipe', 'hieroglyph_gilded');
const OFF = opt('off', 'hgpolish');
const SIZE = parseInt(opt('size', '1024'), 10);
const MATNAME = opt('mat', `arch:${RECIPE}`);
/* The consumer's real uniforms — Architecture.RECIPES[hieroglyph_gilded] plus Architecture's
 * `metal: r.metal ? 0.85 : 0`. Quoted here so a change there shows up as a mismatch. */
const USPEC = parseFloat(opt('spec', '0.55'));
const UGLOSS = parseFloat(opt('gloss', '64'));
const UMETAL = parseFloat(opt('metal', '0.85'));
const SPECCOL = [0xff / 255, 0xfb / 255, 0xe8 / 255];    // ToonMaterial PAL.goldSpec #fffbe8

/* ---------------------------------------------------------------- stage 1 */

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/lab.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf8><body>'); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = 7100 + (process.pid % 400);
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  [console]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/lab.html`);

const tex = await page.evaluate(async ({ RECIPE, OFF, SIZE, USPEC, UGLOSS, UMETAL, SPECCOL }) => {
  const M = await import('/src/textures/Materials.js');
  const C = await import('/src/textures/Canvas2D.js');
  const N = await import('/src/textures/NormalMap.js');
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

  const build = (off) => {
    globalThis.__TEX_AB = off;
    const r = M.MATERIALS[RECIPE];
    const sz = r.size ? Math.min(r.size, SIZE) : (r.tier >= 1 ? Math.max(256, SIZE >> 1) : SIZE);
    const s = new C.Surface(sz, (r.seed ?? hash(RECIPE)) >>> 0);
    r.build(s, { seed: s.seed, size: sz, name: RECIPE, quality: 'high' });
    const d = N.derive(s, {
      bump: r.bump ?? 0.03, tile: r.tile ?? 2, normalScale: r.normalScale ?? 1,
      aoStrength: r.aoStrength ?? 1, aoFloor: r.aoFloor ?? 0.16, micro: r.micro ?? 0.1,
      ormDiv: r.ormDiv ?? 2, smoothH: r.smoothH ?? 0, microSoft: r.microSoft ?? 0.35,
    });
    globalThis.__TEX_AB = undefined;
    return { sz, tile: Array.isArray(r.tile) ? r.tile[0] : r.tile, s, d };
  };

  const A = build(OFF);        // treatment OFF (control)
  const B = build('');         // shipped
  const sz = A.sz, os = A.d.orm.size, n = os * os;
  if (B.sz !== sz) throw new Error('arm size mismatch');

  /* Bit-identity assertions. Only `s.rough` may differ: the treatment writes nothing else, and
   * a lab that assumed that instead of checking it would be §11's shape. */
  const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  const ident = {
    albedo: same(A.d.albedo, B.d.albedo),
    normal: same(A.d.normal, B.d.normal),
    height: same(A.s.h, B.s.h),
    metalSurf: same(A.s.metal, B.s.metal),
    ormR_ao: (() => { for (let i = 0; i < n; i++) if (A.d.orm.data[i * 4] !== B.d.orm.data[i * 4]) return false; return true; })(),
    ormB_metal: (() => { for (let i = 0; i < n; i++) if (A.d.orm.data[i * 4 + 2] !== B.d.orm.data[i * 4 + 2]) return false; return true; })(),
  };

  /* Albedo box-downsampled to ORM resolution — specTint on metal is derived from the albedo,
   * so the tint has to be sampled at the same texel the roughness is. */
  const albO = new Float32Array(n * 3);
  {
    const d2 = sz / os;
    for (let y = 0; y < os; y++) for (let x = 0; x < os; x++) {
      let r = 0, g = 0, b = 0, c = 0;
      for (let j = 0; j < d2; j++) for (let i = 0; i < d2; i++) {
        const k = ((y * d2 + j) * sz + (x * d2 + i)) * 4;
        r += A.d.albedo[k]; g += A.d.albedo[k + 1]; b += A.d.albedo[k + 2]; c++;
      }
      const o = (y * os + x) * 3;
      albO[o] = r / c / 255; albO[o + 1] = g / c / 255; albO[o + 2] = b / c / 255;
    }
  }

  const srgbToLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const sat01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (e0, e1, x) => { const t = sat01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  /* toon.glsl.js:495-504, verbatim. `sh` (shadow) is pinned to 1 and `step(0.02, ndl)` to 1;
   * both only ever scale the result DOWN in the frame. */
  const specOf = (rgh8, slyMetal, ndh) => {
    const rgh = Math.min(1, Math.max(0.03, rgh8));
    const glossP = Math.max(UGLOSS * (1 - 0.6 * rgh), 4);
    const lobe = Math.pow(ndh, glossP);
    const specStep = smooth(0.30, 0.52, lobe) + 0.35 * smooth(0.02, 0.30, lobe);
    const specAmt = USPEC * (1 - 0.75 * rgh) * (1 + 2.4 * slyMetal);
    return specAmt * specStep;
  };

  const rA = new Float32Array(n), rB = new Float32Array(n), met = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rA[i] = A.d.orm.data[i * 4 + 1] / 255;
    rB[i] = B.d.orm.data[i * 4 + 1] / 255;
    met[i] = (A.d.orm.data[i * 4 + 2] / 255) * UMETAL;      // slyMetal = uMetal * ORM.b
  }

  /* Treated set: texels whose SHIPPED roughness differs. That is the population the treatment
   * actually delivers to the sampler, which is a strictly smaller thing than the population
   * `carve()` wrote to — packORM's box and its 8-bit quantise both erase part of it. */
  const treated = [];
  for (let i = 0; i < n; i++) if (rA[i] !== rB[i]) treated.push(i);

  const pct = (arr, q) => { if (!arr.length) return 0; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
  const cls = (i) => (met[i] / UMETAL > 0.5 ? 'gild' : met[i] / UMETAL < 0.05 ? 'lime' : 'edge');

  /* Where can the delta possibly be biggest? Sweep ndh over the whole live range of the lobe
   * and keep, per texel, the ndh that maximises |Δspec|. That is the best case for the
   * treatment at any light/view geometry whatsoever, which is what a null has to survive. */
  const NDH = [];
  for (let k = 0; k <= 400; k++) NDH.push(0.80 + 0.20 * k / 400);
  const rows = {};
  for (const c of ['gild', 'lime', 'edge']) rows[c] = { n: 0, dRgh: [], dSpecBest: [], specBaseAtBest: [], ndhBest: [], tintLum: [] };
  for (const i of treated) {
    const c = cls(i);
    const R = rows[c]; R.n++;
    R.dRgh.push(rB[i] - rA[i]);
    let best = 0, bestNdh = 0, baseAt = 0;
    for (const ndh of NDH) {
      const a = specOf(rA[i], met[i], ndh), b = specOf(rB[i], met[i], ndh);
      if (Math.abs(b - a) > Math.abs(best)) { best = b - a; bestNdh = ndh; baseAt = a; }
    }
    R.dSpecBest.push(best); R.ndhBest.push(bestNdh); R.specBaseAtBest.push(baseAt);
    const o = i * 3;
    const al = [srgbToLin(albO[o]), srgbToLin(albO[o + 1]), srgbToLin(albO[o + 2])];
    const m = met[i];
    const tint = [0, 1, 2].map((ch) => SPECCOL[ch] + (al[ch] * 2 + SPECCOL[ch] * 0.25 - SPECCOL[ch]) * m);
    R.tintLum.push(0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2]);
  }

  /* Class census over the whole tile, so the treated shares have a denominator. */
  const census = { gild: 0, lime: 0, edge: 0 };
  for (let i = 0; i < n; i++) census[cls(i)]++;

  /* Normal-map angular deviation from the tile's mean normal, on the treated texels and on the
   * gild — stage 2 needs a bound on how far a texel normal can swing toward the half-vector. */
  const devAngle = (idxs) => {
    const out = [];
    const d2 = sz / os;
    for (const i of idxs) {
      const x = (i % os) * d2, y = Math.floor(i / os) * d2;
      const k = (y * sz + x) * 4;
      const nx = (A.d.normal[k] / 255) * 2 - 1, ny = (A.d.normal[k + 1] / 255) * 2 - 1, nz = (A.d.normal[k + 2] / 255) * 2 - 1;
      const l = Math.hypot(nx, ny, nz) || 1;
      out.push(Math.acos(Math.min(1, Math.max(-1, nz / l))) * 180 / Math.PI);
    }
    return out;
  };
  const allGild = []; for (let i = 0; i < n; i++) if (cls(i) === 'gild') allGild.push(i);
  const devTreated = devAngle(treated), devGild = devAngle(allGild);

  const summ = (a) => a.length ? { n: a.length, min: +pct(a, 0).toFixed(5), p50: +pct(a, 0.5).toFixed(5), p90: +pct(a, 0.9).toFixed(5), max: +pct(a, 0.999).toFixed(5), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(5) } : { n: 0 };

  const outRows = {};
  for (const c of ['gild', 'lime', 'edge']) {
    const R = rows[c];
    outRows[c] = {
      treatedTexels: R.n,
      shareOfClass: +(100 * R.n / Math.max(1, census[c])).toFixed(2),
      shareOfTile: +(100 * R.n / n).toFixed(3),
      dRgh: summ(R.dRgh),
      dSpecBest: summ(R.dSpecBest),
      specBaseAtBest: summ(R.specBaseAtBest),
      ndhBest: summ(R.ndhBest),
      tintLum: summ(R.tintLum),
    };
  }
  return {
    size: sz, ormSize: os, tile: A.tile, ident, census,
    censusPct: { gild: +(100 * census.gild / n).toFixed(2), lime: +(100 * census.lime / n).toFixed(2), edge: +(100 * census.edge / n).toFixed(2) },
    treated: treated.length, treatedPct: +(100 * treated.length / n).toFixed(3),
    rows: outRows,
    devTreated: summ(devTreated), devGild: summ(devGild),
    /* Raw authored delta, for comparison with what survives to the ORM. */
    authored: (() => {
      const d = []; for (let i = 0; i < sz * sz; i++) { const v = B.s.rough[i] - A.s.rough[i]; if (v !== 0) d.push(v); }
      return { texels: d.length, pctOfTile: +(100 * d.length / (sz * sz)).toFixed(3), ...summ(d) };
    })(),
  };
}, { RECIPE, OFF, SIZE, USPEC, UGLOSS, UMETAL, SPECCOL });

await browser.close();
server.close();

/* ---------------------------------------------------------------- stage 2 */

const { A, root } = await buildLevel();
const world = root || A.root; world.updateMatrixWorld(true);
const tris = [];
{
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  world.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    if (o.userData?.slyOutline || o.userData?.isOutlineShell) return;
    if ((o.material?.name || '') !== MATNAME) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const cnt = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < cnt; i += 3) {
        const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
        p0.fromBufferAttribute(pos, a).applyMatrix4(m); p1.fromBufferAttribute(pos, b).applyMatrix4(m); p2.fromBufferAttribute(pos, c).applyMatrix4(m);
        tris.push([p0.clone(), p1.clone(), p2.clone()]);
      }
    }
  });
}

/* The lobe's live window, from the shader: specStep is non-zero once lobe = ndh^glossP > 0.02,
 * and reaches its main leg at lobe > 0.30. Both thresholds depend on the roughness, so quote
 * them at the gild's own shipped median. */
const rghGild = tex.rows.gild.dRgh.n ? null : null;   // filled below from the sweep if needed
const glossAt = (rgh) => Math.max(UGLOSS * (1 - 0.6 * rgh), 4);
const RG_FIELD = parseFloat(opt('rghfield', '0.60'));
const gp = glossAt(RG_FIELD);
const NDH_ON = Math.pow(0.02, 1 / gp);      // specStep leaves zero
const NDH_MAIN = Math.pow(0.30, 1 / gp);    // main leg
const devBound = tex.devGild.p90 ?? 0;

const shots = [];
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3(), ctr = new THREE.Vector3();
const Vv = new THREE.Vector3(), Hh = new THREE.Vector3();
for (const name of Object.keys(SHOTS)) {
  const s = SHOTS[name];
  const key = s.keyDir ? new THREE.Vector3().fromArray(s.keyDir).normalize()
    : new THREE.Vector3(-0.899, 0.438, 0).normalize();
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, 1280 / 720, 0.1, 900);
  cam.position.fromArray(s.pos); cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const eye = cam.position;
  let aTot = 0, aOn = 0, aMain = 0, aOnB = 0, aMainB = 0, ndhMax = -1;
  for (const [p0, p1, p2] of tris) {
    ctr.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3);
    if (!fr.containsPoint(ctr)) continue;
    e1.subVectors(p1, p0); e2.subVectors(p2, p0); nn.crossVectors(e1, e2);
    const area = nn.length() * 0.5; if (area < 1e-9) continue;
    nn.multiplyScalar(1 / (area * 2));
    Vv.subVectors(eye, ctr).normalize();
    if (nn.dot(Vv) < 0) continue;                       // back-facing
    Hh.copy(key).add(Vv).normalize();
    const ndh = nn.dot(Hh);
    aTot += area;
    if (ndh > ndhMax) ndhMax = ndh;
    if (ndh > NDH_ON) aOn += area;
    if (ndh > NDH_MAIN) aMain += area;
    /* Upper bound with the normal map: a texel normal can lie up to `devBound` degrees off the
     * geometric normal, so the best a texel on this triangle can do is ndh at (theta - dev). */
    const th = Math.acos(Math.min(1, Math.max(-1, ndh))) * 180 / Math.PI;
    const thB = Math.max(0, th - devBound);
    const ndhB = Math.cos(thB * Math.PI / 180);
    if (ndhB > NDH_ON) aOnB += area;
    if (ndhB > NDH_MAIN) aMainB += area;
  }
  if (aTot > 0.5) shots.push({
    shot: name, areaM2: +aTot.toFixed(0),
    ndhMax: +ndhMax.toFixed(4),
    geoOnPct: +(100 * aOn / aTot).toFixed(2), geoMainPct: +(100 * aMain / aTot).toFixed(2),
    boundOnPct: +(100 * aOnB / aTot).toFixed(2), boundMainPct: +(100 * aMainB / aTot).toFixed(2),
  });
}

/* ---------------------------------------------------------------- report */

const out = {
  recipe: RECIPE, arm: OFF, uniforms: { spec: USPEC, gloss: UGLOSS, metal: UMETAL },
  lobe: { rghField: RG_FIELD, glossP: +gp.toFixed(2), ndhOn: +NDH_ON.toFixed(5), ndhMain: +NDH_MAIN.toFixed(5), halfAngleOnDeg: +(Math.acos(NDH_ON) * 180 / Math.PI).toFixed(2) },
  texture: tex, geometry: shots, normalDevBoundDeg: devBound,
};
const jf = opt('json', null);
if (jf) fs.writeFileSync(jf, JSON.stringify(out, null, 1));

console.log(`# goldspec  recipe=${RECIPE}  control arm=${OFF}  size=${tex.size} (orm ${tex.ormSize})  tile=${tex.tile} m`);
console.log(`# uniforms: uSpec ${USPEC}  uGloss ${UGLOSS}  uMetal ${UMETAL}  specColor #fffbe8`);
console.log(`\n## bit-identity between arms (only s.rough may move)`);
for (const [k, v] of Object.entries(tex.ident)) console.log(`   ${k.padEnd(11)} ${v ? 'identical' : '*** DIFFERS ***'}`);
console.log(`\n## class census on the tile:  gild ${tex.censusPct.gild}%   limestone ${tex.censusPct.lime}%   edge ${tex.censusPct.edge}%`);
console.log(`## authored delta (s.rough, before refineRoughness/packORM): ${tex.authored.texels} texels = ${tex.authored.pctOfTile}% of tile, min ${tex.authored.min}, p50 ${tex.authored.p50}`);
console.log(`## delivered delta (shipped ORM.g, after div-2 box + 8-bit): ${tex.treated} texels = ${tex.treatedPct}% of ORM`);
console.log(`\n## per class, on the DELIVERED treated set`);
console.log(`class  texels  %ofclass  %ofORM |  dRgh min/p50   | best |dSpec| over any ndh: p50/max  (base spec there) | ndh at best`);
for (const c of ['gild', 'edge', 'lime']) {
  const R = tex.rows[c];
  console.log(`${c.padEnd(6)} ${String(R.treatedTexels).padStart(6)} ${String(R.shareOfClass).padStart(8)}  ${String(R.shareOfTile).padStart(6)} | ${String(R.dRgh.min ?? 0).padStart(8)} ${String(R.dRgh.p50 ?? 0).padStart(8)} | ${String(R.dSpecBest.p50 ?? 0).padStart(9)} ${String(R.dSpecBest.min ?? 0).padStart(9)} (${String(R.specBaseAtBest.p50 ?? 0).padStart(7)}) | ${String(R.ndhBest.p50 ?? 0).padStart(7)}`);
}
console.log(`\n## normal-map deviation from flat (deg): treated p50 ${tex.devTreated.p50} p90 ${tex.devTreated.p90} | gild p50 ${tex.devGild.p50} p90 ${tex.devGild.p90}`);
console.log(`\n## the lobe at the gild's field roughness ${RG_FIELD}: glossP ${gp.toFixed(2)}, live once N.H > ${NDH_ON.toFixed(4)} (${(Math.acos(NDH_ON) * 180 / Math.PI).toFixed(1)} deg half-angle), main leg > ${NDH_MAIN.toFixed(4)}`);
console.log(`\n## geometry: how much visible gilded area is inside the lobe (area-weighted, no shadow/occlusion)`);
console.log(`shot           area m2   max N.H | geometric: live%  main% | +-${devBound.toFixed(1)} deg normal-map bound: live%  main%`);
for (const r of shots) {
  console.log(`${r.shot.padEnd(13)} ${String(r.areaM2).padStart(8)} ${String(r.ndhMax).padStart(9)} | ${String(r.geoOnPct).padStart(16)} ${String(r.geoMainPct).padStart(6)} | ${String(r.boundOnPct).padStart(24)} ${String(r.boundMainPct).padStart(6)}`);
}
