/* gildrim — how big is the population that a metalness change can actually move?
 *
 * PRE-MEASUREMENT for the `hieroglyph_gilded` metalness question (see PREREG-gild.md).
 * Offline: builds Architecture + Props headless, rasterises a canonical camera on the CPU,
 * and evaluates — per visible pixel of every metal-flagged material — the three terms in
 * TOON_SHADE that `slyMetal` gates:
 *
 *   rim      rimBand * rimSil          (chroma: adds uRimColor, cool)
 *   spec     specStep * step(.02,ndl)  (chroma: specTint lerps palette -> albedo on metal)
 *   env      metalEnv's `ef`           (chroma: albedo * sky/sand env, always > 0 on metal)
 *
 * `diff *= mix(1, 0.20, slyMetal)` is a scalar on a vec3 and cannot change chromaticity
 * (§132) — it is a magnitude term and is reported as such.
 *
 * No GPU, no capture lock. Reproduces the shader's own arithmetic, including the exact
 * dFdx/dFdy semantics of the silhouette gate: derivatives are taken by re-evaluating the
 * SAME triangle's perspective-correct interpolation at (x+1,y) and (x,y+1), which is what
 * GPU helper invocations do, rather than by differencing the framebuffer across triangles.
 *
 * KNOWN DIVERGENCES FROM THE REAL FRAME — read before quoting a number:
 *  1. lvl.mjs's engine stub returns null from get('textures'), so there are NO maps here.
 *     That means (a) no ORM blue channel, so this measures the gild SURFACE, not the gild
 *     MASK — Architecture.js records the mask at 11.0% of `hieroglyph_gilded` texels and
 *     3.3% of `ceiling_stars`, and the mask is a UV-space carving pattern uncorrelated with
 *     view angle, so the masked population is ~that fraction of the shares below;
 *     (b) no normalMap, so `ndv` here uses the raw geometric normal — the detail normal
 *     scatters fres in the real frame but does not bias it; (c) no roughnessMap, so `rgh`
 *     is the recipe's art value (with a map, roughness = 1.0 * map, per ToonMaterial.js:998).
 *  2. No shadow map, so `sh` is unknown. It cannot zero any of the three terms — the rim's
 *     shadow floor is 0.55 and metalEnv's is 0.35 — so presence/absence is unaffected;
 *     only amplitude is. Spec is the exception (`sh` multiplies it), so the spec share
 *     below is an UPPER bound.
 *  3. No terrain (lvl.mjs's headline warning). Nothing gilded is terrain-placed, but the
 *     ROI bbox is printed anyway so the region being measured is never taken on trust.
 *
 * usage: node tools/gildrim.mjs [shot ...]      default: hero
 */
import * as THREE from 'three';
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '../src/render/Atmosphere.js';

const W = 1280, H = 720;
const OUTDIR = '/home/user/Demo/shots/gild';
const MASK_ID = { 'arch:hieroglyph_gilded': 1, 'arch:ceiling_stars': 2, 'arch:gold_leaf': 3, 'arch:bronze_dark': 4 };
const MASK_RGB = [[40, 40, 46], [220, 60, 40], [60, 200, 90], [250, 220, 60], [80, 140, 255]];

function writePNG(file, w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  let T = null;
  const crc32 = (buf) => {
    if (!T) { T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } }
    let c = -1; for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 255] ^ (c >>> 8); return c ^ -1;
  };
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

/* ---- the shipping uniform values these terms read (ToonMaterial.js TUNE) ---- */
const RIM_POWER = 3.1;
const RIM_CURVE = [3.0, 10.0, 1.0];      // magnitude smoothstep lo/hi, convexity enable

/* Recipes that set `metal: true` in Architecture.js, with the spec/gloss/rough the lobe
   arithmetic needs. Keyed by material name so the mesh sweep can find them. */
const METAL_MATS = {
  'arch:hieroglyph_gilded': { spec: 0.55, gloss: 64, rough: 0.55, mask: 0.110 },
  'arch:ceiling_stars':     { spec: 0.20, gloss: 30, rough: 0.80, mask: 0.033 },
  'arch:gold_leaf':         { spec: 0.95, gloss: 110, rough: 0.22, mask: 1.0 },
  'arch:bronze_dark':       { spec: 0.62, gloss: 72, rough: 0.42, mask: 1.0 },
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------------ raster */

/** Clip a homogeneous polygon against w >= near, carrying attributes. */
function clipNear(poly, near) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const ain = A.w >= near, bin = B.w >= near;
    if (ain) out.push(A);
    if (ain !== bin) {
      const t = (near - A.w) / (B.w - A.w);
      out.push({
        x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t,
        z: A.z + (B.z - A.z) * t, w: A.w + (B.w - A.w) * t,
        nx: A.nx + (B.nx - A.nx) * t, ny: A.ny + (B.ny - A.ny) * t, nz: A.nz + (B.nz - A.nz) * t,
        wx: A.wx + (B.wx - A.wx) * t, wy: A.wy + (B.wy - A.wy) * t, wz: A.wz + (B.wz - A.wz) * t,
        vx: A.vx + (B.vx - A.vx) * t, vy: A.vy + (B.vy - A.vy) * t, vz: A.vz + (B.vz - A.vz) * t,
      });
    }
  }
  return out;
}

/** Walk every visible mesh, hand each world-space triangle (with normals) to `emit`. */
function forEachTri(root, emit, filter) {
  const p = new THREE.Vector3(), nv = new THREE.Vector3();
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    if (o.userData?.collisionProxy) return;
    const g = o.geometry;
    if (!g?.attributes?.position) return;
    const name = o.material?.name || o.name || '?';
    if (filter && !filter(name, o)) return;
    const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
    const n = idx ? idx.count : pos.count;
    const inst = o.isInstancedMesh ? o.count : 1;
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      nm.getNormalMatrix(m);
      for (let i = 0; i < n; i += 3) {
        const t = [];
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(i + k) : i + k;
          p.fromBufferAttribute(pos, vi).applyMatrix4(m);
          if (nor) nv.fromBufferAttribute(nor, vi).applyMatrix3(nm).normalize(); else nv.set(0, 1, 0);
          t.push({ px: p.x, py: p.y, pz: p.z, nx: nv.x, ny: nv.y, nz: nv.z });
        }
        emit(t, name);
      }
    }
  });
}

function project(tri, view, proj, near) {
  const v4 = new THREE.Vector4();
  const vp = new THREE.Vector3();
  const poly = tri.map((v) => {
    vp.set(v.px, v.py, v.pz).applyMatrix4(view);
    v4.set(vp.x, vp.y, vp.z, 1).applyMatrix4(proj);
    return {
      x: v4.x, y: v4.y, z: v4.z, w: v4.w,
      nx: v.nx, ny: v.ny, nz: v.nz,            // WORLD normal (ndl needs it)
      wx: v.px, wy: v.py, wz: v.pz,
      vx: vp.x, vy: vp.y, vz: vp.z,            // VIEW position (slyViewPos)
    };
  });
  return clipNear(poly, near);
}

const toScreen = (v) => ({
  sx: (v.x / v.w * 0.5 + 0.5) * W,
  sy: (1 - (v.y / v.w * 0.5 + 0.5)) * H,
  iw: 1 / v.w,
  w: v.w,
  v,
});

/* ------------------------------------------------------------------- main */

const shots = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = shots.length ? shots : ['hero'];

const { root } = await buildLevel({ withProps: true });
root.updateMatrixWorld(true);

/* Inventory first — never measure a population without printing what is in it. */
const inv = new Map();
root.traverse((o) => {
  if (!o.isMesh || o.visible === false || o.userData?.collisionProxy) return;
  const nmm = o.material?.name || o.name || '?';
  const g = o.geometry;
  if (!g?.attributes?.position) return;
  const tris = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  const e = inv.get(nmm) || { tris: 0, meshes: 0 };
  e.tris += tris; e.meshes++;
  inv.set(nmm, e);
});
console.log('metal-flagged materials present in the headless build:');
for (const k of Object.keys(METAL_MATS)) {
  const e = inv.get(k);
  console.log(`  ${k.padEnd(26)} ${e ? `${e.meshes} mesh(es), ${(e.tris / 1000).toFixed(1)}k tris` : 'ABSENT'}`);
}
const otherMetal = [...inv.keys()].filter((k) => /gold|bronze|metal|gild/i.test(k) && !METAL_MATS[k]);
if (otherMetal.length) console.log(`  (other metal-looking names not in the table: ${otherMetal.join(', ')})`);

for (const nm of names) {
  const s = SHOTS[nm];
  if (!s) { console.log(`unknown shot ${nm}`); continue; }

  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 900);
  cam.position.fromArray(s.pos);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const view = cam.matrixWorldInverse, proj = cam.projectionMatrix;

  const atm = createAtmosphereState();
  evalAtmosphere(s.tod, atm);
  const L = atm.sunDir.clone().normalize();          // uKeyDir: points toward the key

  console.log(`\n=== ${nm} ===  ${W}x${H} fov ${s.fov} tod ${s.tod}`);
  console.log(`    cam ${s.pos.map((v) => v.toFixed(1)).join(',')} -> ${s.target.map((v) => v.toFixed(1)).join(',')}`);
  console.log(`    key elev ${atm.sunElevation.toFixed(1)}deg az ${atm.sunAzimuth.toFixed(1)}deg  dir ${L.toArray().map((v) => v.toFixed(3)).join(',')}`);

  /* ---- pass 1: depth of EVERYTHING (occlusion must be honest) ---- */
  const zb = new Float32Array(W * H).fill(Infinity);
  const rasterDepth = (poly) => {
    for (let f = 1; f + 1 < poly.length; f++) {
      const a = toScreen(poly[0]), b = toScreen(poly[f]), c = toScreen(poly[f + 1]);
      const det = (b.sx - a.sx) * (c.sy - a.sy) - (c.sx - a.sx) * (b.sy - a.sy);
      if (Math.abs(det) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a.sx, b.sx, c.sx)));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(a.sx, b.sx, c.sx)));
      const y0 = Math.max(0, Math.floor(Math.min(a.sy, b.sy, c.sy)));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(a.sy, b.sy, c.sy)));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          let l0 = ((b.sx - px) * (c.sy - py) - (c.sx - px) * (b.sy - py)) / det;
          let l1 = ((c.sx - px) * (a.sy - py) - (a.sx - px) * (c.sy - py)) / det;
          let l2 = 1 - l0 - l1;
          if (l0 < 0 || l1 < 0 || l2 < 0) continue;
          const iw = l0 * a.iw + l1 * b.iw + l2 * c.iw;
          const z = 1 / iw;
          const o = y * W + x;
          if (z < zb[o]) zb[o] = z;
        }
      }
    }
  };
  forEachTri(root, (t) => { const poly = project(t, view, proj, cam.near); if (poly.length >= 3) rasterDepth(poly); });

  /* ---- pass 2: the metal population, with the shader's own terms ---- */
  const maskBuf = new Uint8Array(W * H);
  const stats = new Map();
  const roi = new Map();
  const bump = (k) => {
    if (!stats.has(k)) stats.set(k, { px: 0, rim: 0, rimStrong: 0, gate: 0, band: 0, spec: 0, efSum: 0, ndvSum: 0, turnSum: 0, convex: 0 });
    return stats.get(k);
  };

  const rasterMetal = (poly, name) => {
    const R = METAL_MATS[name];
    if (!R) return;
    const glossP = Math.max(R.gloss * (1 - 0.6 * R.rough), 4.0);
    for (let f = 1; f + 1 < poly.length; f++) {
      const a = toScreen(poly[0]), b = toScreen(poly[f]), c = toScreen(poly[f + 1]);
      const det = (b.sx - a.sx) * (c.sy - a.sy) - (c.sx - a.sx) * (b.sy - a.sy);
      if (Math.abs(det) < 1e-12) continue;

      /* perspective-correct sample of this ONE triangle at an arbitrary screen point —
         valid outside the triangle too, which is exactly what a helper invocation is. */
      const sample = (px, py) => {
        const l0 = ((b.sx - px) * (c.sy - py) - (c.sx - px) * (b.sy - py)) / det;
        const l1 = ((c.sx - px) * (a.sy - py) - (a.sx - px) * (c.sy - py)) / det;
        const l2 = 1 - l0 - l1;
        const iw = l0 * a.iw + l1 * b.iw + l2 * c.iw;
        const q0 = l0 * a.iw / iw, q1 = l1 * b.iw / iw, q2 = l2 * c.iw / iw;
        return {
          inside: l0 >= 0 && l1 >= 0 && l2 >= 0,
          z: 1 / iw,
          // world normal (unnormalised interpolation, as the varying is)
          nx: q0 * a.v.nx + q1 * b.v.nx + q2 * c.v.nx,
          ny: q0 * a.v.ny + q1 * b.v.ny + q2 * c.v.ny,
          nz: q0 * a.v.nz + q1 * b.v.nz + q2 * c.v.nz,
          vx: q0 * a.v.vx + q1 * b.v.vx + q2 * c.v.vx,
          vy: q0 * a.v.vy + q1 * b.v.vy + q2 * c.v.vy,
          vz: q0 * a.v.vz + q1 * b.v.vz + q2 * c.v.vz,
        };
      };

      const x0 = Math.max(0, Math.floor(Math.min(a.sx, b.sx, c.sx)));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(a.sx, b.sx, c.sx)));
      const y0 = Math.max(0, Math.floor(Math.min(a.sy, b.sy, c.sy)));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(a.sy, b.sy, c.sy)));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const S = sample(px, py);
          if (!S.inside) continue;
          const off = y * W + x;
          if (S.z > zb[off] * 1.0008 + 2e-3) continue;      // occluded

          const Sx = sample(px + 1, py), Sy = sample(px, py + 1);

          /* view-space normal = world normal rotated by the view matrix (rigid) */
          const vn = new THREE.Vector3(S.nx, S.ny, S.nz).transformDirection(view);
          const N = vn.clone().normalize();
          /* V = normalize(vViewPosition) = normalize(-viewPos) */
          const V = new THREE.Vector3(-S.vx, -S.vy, -S.vz).normalize();
          const ndv = clamp01(N.dot(V));

          const Nw = new THREE.Vector3(S.nx, S.ny, S.nz).normalize();
          const ndl = Nw.dot(L);

          const fres = Math.pow(1 - ndv, RIM_POWER);
          const wrapRim = smoothstep(-0.35, 0.45, ndl);
          const rimBand = smoothstep(0.26, 0.58, fres * (0.60 + 0.40 * wrapRim));

          /* dFdx/dFdy of vNormal — the VARYING, i.e. the view-space interpolated normal,
             unnormalised, exactly as the shader reads it. */
          const dnx = new THREE.Vector3(Sx.nx - S.nx, Sx.ny - S.ny, Sx.nz - S.nz).transformDirection(view);
          const dny = new THREE.Vector3(Sy.nx - S.nx, Sy.ny - S.ny, Sy.nz - S.nz).transformDirection(view);
          /* transformDirection normalises — undo it, we need the magnitude */
          const mx = Math.hypot(Sx.nx - S.nx, Sx.ny - S.ny, Sx.nz - S.nz);
          const my = Math.hypot(Sy.nx - S.nx, Sy.ny - S.ny, Sy.nz - S.nz);
          dnx.multiplyScalar(mx); dny.multiplyScalar(my);

          const slyTurn = (dnx.length() + dny.length()) * H;
          const dpx = new THREE.Vector3(Sx.vx - S.vx, Sx.vy - S.vy, Sx.vz - S.vz);
          const dpy = new THREE.Vector3(Sy.vx - S.vx, Sy.vy - S.vy, Sy.vz - S.vz);
          const slyFold = dnx.dot(dpx) + dny.dot(dpy);
          const slyConvex = RIM_CURVE[2] > 0.5 ? (slyFold >= 0 ? 1 : 0) : 1;
          const rimMag = smoothstep(RIM_CURVE[0], RIM_CURVE[1], slyTurn);
          const rimSil = rimMag * slyConvex;
          const rimTerm = rimBand * rimSil;

          /* spec: sh unknown -> assumed lit, so this is an UPPER bound */
          const Lv = L.clone().transformDirection(view);
          const Hh = Lv.clone().add(V).normalize();
          const ndh = clamp01(N.dot(Hh));
          const lobe = Math.pow(ndh, glossP);
          const specStep = smoothstep(0.30, 0.52, lobe) + 0.35 * smoothstep(0.02, 0.30, lobe);
          const specOn = ndl > 0.02 && specStep > 0.001;

          const ef = 0.25 + 0.75 * Math.pow(1 - ndv, 3.0);

          maskBuf[off] = MASK_ID[name] || 0;
          const st = bump(name);
          st.px++;
          st.ndvSum += ndv; st.turnSum += slyTurn; st.efSum += ef;
          if (rimBand > 0.001) st.band++;
          if (rimSil > 0.001) st.gate++;
          if (slyConvex > 0.5) st.convex++;
          if (rimTerm > 0.001) st.rim++;
          if (rimTerm > 0.10) st.rimStrong++;
          if (specOn) st.spec++;

          const r = roi.get(name) || { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
          if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x;
          if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y;
          roi.set(name, r);
        }
      }
    }
  };
  forEachTri(root, (t, name) => {
    const poly = project(t, view, proj, cam.near);
    if (poly.length >= 3) rasterMetal(poly, name);
  }, (name) => !!METAL_MATS[name]);

  const frame = W * H;
  console.log(`\n  material                    vis px   %frame |  rim%  strong% | band% gate% convex% | spec%(UB) | mean ndv  mean turn  mean ef`);
  for (const [k, st] of [...stats].sort((p, q) => q[1].px - p[1].px)) {
    const pc = (v) => `${(v / st.px * 100).toFixed(1)}%`.padStart(6);
    const r = roi.get(k);
    console.log(
      `  ${k.padEnd(26)} ${String(st.px).padStart(7)} ${(st.px / frame * 100).toFixed(3).padStart(7)}% |` +
      `${pc(st.rim)}${pc(st.rimStrong)} |${pc(st.band)}${pc(st.gate)}${pc(st.convex)} |` +
      `${pc(st.spec)}    | ${(st.ndvSum / st.px).toFixed(3).padStart(8)} ${(st.turnSum / st.px).toFixed(2).padStart(10)} ${(st.efSum / st.px).toFixed(3).padStart(8)}`
    );
    console.log(`      roi px x ${r.x0}..${r.x1}  y ${r.y0}..${r.y1}   (mask-weighted px ~ ${Math.round(st.px * METAL_MATS[k].mask)})`);
  }
  if (!stats.size) console.log('  (no metal-flagged material is visible in this frame)');

  /* ---- write the mask so the population is LOOKED AT, not just counted ---- */
  mkdirSync(OUTDIR, { recursive: true });
  const rgb = Buffer.alloc(W * H * 3);
  let dmin = Infinity, dmax = 0;
  for (let i = 0; i < W * H; i++) if (zb[i] < Infinity) { if (zb[i] < dmin) dmin = zb[i]; if (zb[i] > dmax) dmax = zb[i]; }
  for (let i = 0; i < W * H; i++) {
    const m = maskBuf[i];
    if (m) { const c = MASK_RGB[m]; rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2]; }
    else if (zb[i] < Infinity) {
      const t = 1 - Math.min(1, (zb[i] - dmin) / Math.max(1e-6, dmax - dmin));
      const g = 30 + 110 * t * t; rgb[i * 3] = g; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = g * 1.05;
    } else { rgb[i * 3] = 8; rgb[i * 3 + 1] = 10; rgb[i * 3 + 2] = 18; }
  }
  writePNG(`${OUTDIR}/${nm}-mask.png`, W, H, rgb);
  writeFileSync(`${OUTDIR}/${nm}-mask.bin`, Buffer.from(maskBuf));
  console.log(`\n  mask -> shots/gild/${nm}-mask.png  (red=hieroglyph_gilded green=ceiling_stars yellow=gold_leaf blue=bronze)`);
}
