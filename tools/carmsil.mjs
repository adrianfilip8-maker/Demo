#!/usr/bin/env node
/**
 * carmsil.mjs — Carmelita's actual shape, rasterised with NO RENDERER.
 *
 * `tools/carmatlas.mjs` established the pattern: a question about pixels does not always need a
 * browser, a level boot and the capture lock. That tool answered "which texels does each mesh
 * sample". This one answers the question the user actually asked — **what shape is being drawn**
 * — by projecting the triangles itself and z-buffering them into a PNG.
 *
 * Why this and not a game frame: a game frame is the *composition* of every stage (source mesh →
 * bind transfer → skinning → material → post). When the composition looks wrong, a frame cannot
 * say which stage did it. This renders any single stage in isolation, so the stages can be
 * differenced:
 *
 *   --stage src     the source meshes with only their node transform baked. This is the artist's
 *                   sculpt. If the head is missing HERE, nothing downstream is responsible.
 *   --stage bind    the output of `bindToRig3` at the bind pose — i.e. exactly what the GPU
 *                   would draw if every bone sat at rest. Differences from `src` are the bind
 *                   transfer's doing and nothing else's.
 *   --stage pose    the bound geometry CPU-skinned by real bone matrices dumped from a settled
 *                   in-game guard (`--pose <json>`), with `--shift 0|1` selecting the shipped
 *                   skinIndex or the +1 remap. This is the only stage that can show the skinning
 *                   defect, because the defect is invisible at bind by construction.
 *
 * The view axis is an ARGUMENT, not a filename. `--view front` projects along -Z onto XY and is
 * front *by construction*; there is no name to mislabel and no camera to point the wrong way.
 * (A tool in this repository spent its entire life calling rear shots "front" — KNOWN_ISSUES.)
 * Both `front` and `side` are written every run so a flat-in-Z artefact cannot hide.
 *
 * Shading is |n·l| lambert on a fixed key plus a group tint — group 0 (body atlas) cool, group 1
 * (head atlas) warm — so "is the head there" is answerable from the colour as well as the shape.
 *
 *   node tools/carmsil.mjs --stage src
 *   node tools/carmsil.mjs --stage bind
 *   node tools/carmsil.mjs --stage bind --carry legacy --head 0   # the pre-§702 picture
 *   node tools/carmsil.mjs --stage pose --pose /tmp/carmpose.json --shift 0
 *
 * Reads only committed assets. No fetch, no lock, no browser.
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bindToRig3, atlasOf, spliceHead, CARRY } from '../src/ai/CarmelitaGuard.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const STAGE = arg('--stage', 'bind');
const HEAD = arg('--head', '1') !== '0';
/* `--carry legacy` reproduces the transfer that shipped before §702, so the committed
   before/after pairs in shots/ stay reproducible from this tool after the fix landed. */
const CARRY_MODE = arg('--carry', 'rebind') === 'legacy' ? CARRY.LEGACY : CARRY.REBIND;
const POSE = arg('--pose', '');
const SHIFT = Number(arg('--shift', 0));
const TAG = arg('--tag', '');
const W = 520, H = 900;

const buf = readFileSync(path.join(ROOT, 'public/assets/sly-anim/carmelita-guard.glb'));
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
gltf.scene.updateMatrixWorld(true);

/* The recovered face (§702). Off with `--head 0`, which is the shipped revert token's arm. */
if (HEAD) {
  const hp = path.join(ROOT, 'public/assets/sly-anim/carmelita-head-lp.glb');
  const hb = readFileSync(hp);
  const hg = await new Promise((res, rej) => new GLTFLoader().parse(
    hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength), '', res, rej));
  let geoH = null;
  hg.scene.traverse((o) => { if (!geoH && o.isMesh) geoH = o.geometry; });
  const r = spliceHead(gltf.scene, geoH);
  console.log(`head splice: ${JSON.stringify(r)}`);
  gltf.scene.updateMatrixWorld(true);
}

/* ── assemble the triangle soup for the requested stage ─────────────────────────────────── */
/** @type {{pos:Float32Array, nrm:Float32Array, idx:Uint32Array, grp:Uint8Array, label:string}} */
let soup;

function fromGeometries(list) {
  let nv = 0, ni = 0;
  for (const { g } of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni), grp = new Uint8Array(nv);
  let vo = 0, io = 0;
  for (const { g, group } of list) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i); pos[(vo + i) * 3 + 1] = p.getY(i); pos[(vo + i) * 3 + 2] = p.getZ(i);
      if (n) { nrm[(vo + i) * 3] = n.getX(i); nrm[(vo + i) * 3 + 1] = n.getY(i); nrm[(vo + i) * 3 + 2] = n.getZ(i); }
      grp[vo + i] = group;
    }
    const c = g.index ? g.index.count : p.count;
    for (let i = 0; i < c; i++) idx[io + i] = vo + (g.index ? g.index.getX(i) : i);
    vo += p.count; io += c;
  }
  return { pos, nrm, idx, grp };
}

if (STAGE === 'src') {
  const list = [];
  gltf.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    list.push({ g, group: atlasOf(o.material) });
  });
  soup = { ...fromGeometries(list), label: 'src — source meshes, node transforms baked' };
} else {
  const asset = bindToRig3(gltf.scene, { carry: CARRY_MODE });
  const geo = asset.geometry;
  if (STAGE === 'pose') {
    const dump = JSON.parse(readFileSync(POSE, 'utf8'));
    /* skinning matrices, exactly the GLSL contract: boneMatrix[i] = boneWorld[i] * boneInverse[i] */
    const mats = dump.boneMatrices.map((a) => new THREE.Matrix4().fromArray(a));
    const bindMatrix = new THREE.Matrix4().fromArray(dump.bindMatrix);
    const bindInv = new THREE.Matrix4().fromArray(dump.bindMatrixInverse);
    const si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
    const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
    const nv = p.count;
    const outP = new Float32Array(nv * 3), outN = new Float32Array(nv * 3);
    const v = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3();
    const nv0 = new THREE.Vector3(), nacc = new THREE.Vector3(), ntmp = new THREE.Vector3();
    const nMat = new THREE.Matrix3();
    let clamped = 0;
    for (let i = 0; i < nv; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(bindMatrix);
      nv0.fromBufferAttribute(n, i);
      acc.set(0, 0, 0); nacc.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = sw.array[i * 4 + k];
        if (!(w > 0)) continue;
        let j = si.array[i * 4 + k] + SHIFT;
        if (j >= mats.length) { j = mats.length - 1; clamped++; }
        const m = mats[j];
        acc.addScaledVector(tmp.copy(v).applyMatrix4(m), w);
        nMat.setFromMatrix4(m);
        nacc.addScaledVector(ntmp.copy(nv0).applyMatrix3(nMat).normalize(), w);
      }
      acc.applyMatrix4(bindInv);
      outP[i * 3] = acc.x; outP[i * 3 + 1] = acc.y; outP[i * 3 + 2] = acc.z;
      if (nacc.lengthSq() > 1e-12) nacc.normalize();
      outN[i * 3] = nacc.x; outN[i * 3 + 1] = nacc.y; outN[i * 3 + 2] = nacc.z;
    }
    if (clamped) console.log(`   NOTE: ${clamped} weighted slots clamped — skinIndex+${SHIFT} exceeded the ${mats.length}-bone skeleton`);
    const grp = new Uint8Array(nv);
    for (const r of asset.regions) for (let i = r.start; i < r.start + r.count; i++) grp[i] = r.group;
    const idx = new Uint32Array(geo.index.count);
    for (let i = 0; i < geo.index.count; i++) idx[i] = geo.index.getX(i);
    soup = { pos: outP, nrm: outN, idx, grp, label: `pose — CPU-skinned from ${path.basename(POSE)}, shift +${SHIFT}` };
  } else {
    const grp = new Uint8Array(geo.attributes.position.count);
    for (const r of asset.regions) for (let i = r.start; i < r.start + r.count; i++) grp[i] = r.group;
    const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
    const pos = new Float32Array(p.count * 3), nrm = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      pos[i * 3] = p.getX(i); pos[i * 3 + 1] = p.getY(i); pos[i * 3 + 2] = p.getZ(i);
      nrm[i * 3] = n.getX(i); nrm[i * 3 + 1] = n.getY(i); nrm[i * 3 + 2] = n.getZ(i);
    }
    const idx = new Uint32Array(geo.index.count);
    for (let i = 0; i < geo.index.count; i++) idx[i] = geo.index.getX(i);
    soup = { pos, nrm, idx, grp, label: 'bind — bindToRig3 output at the bind pose' };
  }
}

/* ── rasterise, orthographic, z-buffered ────────────────────────────────────────────────── */
/* Frame is FIXED in world units so every stage and every arm share one scale — a silhouette that
   auto-fits its own bbox hides exactly the defect being looked for (a limb flung 3 m away just
   shrinks the character). Bounds cover a 1.8 m rig with room either side. */
const FRAME = { y0: -0.15, y1: 1.95, halfW: (W / H) * (1.95 + 0.15) / 2 };

function render(view) {
  const png = new PNG({ width: W, height: H });
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i++) { png.data[i * 4] = 18; png.data[i * 4 + 1] = 20; png.data[i * 4 + 2] = 26; png.data[i * 4 + 3] = 255; }
  /* front: look along -Z, screen X = world X, screen Y = world Y, depth = -Z
     side : look along -X, screen X = world Z, screen Y = world Y, depth = -X */
  const px = (i) => (view === 'front' ? soup.pos[i * 3] : soup.pos[i * 3 + 2]);
  const py = (i) => soup.pos[i * 3 + 1];
  const pz = (i) => (view === 'front' ? -soup.pos[i * 3 + 2] : -soup.pos[i * 3]);
  const toX = (x) => ((x + FRAME.halfW) / (2 * FRAME.halfW)) * (W - 1);
  const toY = (y) => (1 - (y - FRAME.y0) / (FRAME.y1 - FRAME.y0)) * (H - 1);
  const L = [0.45, 0.72, 0.53];
  let drawn = 0, off = 0;

  for (let t = 0; t + 2 < soup.idx.length; t += 3) {
    const a = soup.idx[t], b = soup.idx[t + 1], c = soup.idx[t + 2];
    const xs = [toX(px(a)), toX(px(b)), toX(px(c))];
    const ys = [toY(py(a)), toY(py(b)), toY(py(c))];
    const zs = [pz(a), pz(b), pz(c)];
    const d = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
    if (!Number.isFinite(d) || Math.abs(d) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    if (x1 < x0 || y1 < y0) { off++; continue; }
    /* face normal from the vertex normals, averaged — cheaper than recomputing and it keeps
       the smooth shading the artist authored */
    let nx = 0, ny = 0, nz = 0;
    for (const i of [a, b, c]) { nx += soup.nrm[i * 3]; ny += soup.nrm[i * 3 + 1]; nz += soup.nrm[i * 3 + 2]; }
    const nl = Math.hypot(nx, ny, nz) || 1;
    const lam = Math.abs((nx * L[0] + ny * L[1] + nz * L[2]) / nl);
    const g = soup.grp[a];
    const base = g ? [235, 170, 120] : [120, 150, 210];      // head atlas warm, body atlas cool
    const sh = 0.28 + 0.72 * lam;
    const col = [base[0] * sh, base[1] * sh, base[2] * sh];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w0 = ((xs[1] - x) * (ys[2] - y) - (xs[2] - x) * (ys[1] - y)) / d;
      const w1 = ((xs[2] - x) * (ys[0] - y) - (xs[0] - x) * (ys[2] - y)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
      const z = w0 * zs[0] + w1 * zs[1] + w2 * zs[2];
      const di = W * y + x;
      if (z >= depth[di]) continue;
      depth[di] = z;
      png.data[di * 4] = col[0]; png.data[di * 4 + 1] = col[1]; png.data[di * 4 + 2] = col[2];
    }
    drawn++;
  }
  /* a 1 m rule at x = -halfW + 0.06 so scale is readable straight off the picture */
  for (let y = 0; y < H; y++) {
    const wy = FRAME.y1 - (y / (H - 1)) * (FRAME.y1 - FRAME.y0);
    const on = wy >= 0 && wy <= 1.0;
    const di = W * y + 6;
    if (on) { png.data[di * 4] = 250; png.data[di * 4 + 1] = 240; png.data[di * 4 + 2] = 90; }
    if (Math.abs(wy) < 0.004 || Math.abs(wy - 1.0) < 0.004 || Math.abs(wy - 1.8) < 0.004) {
      for (let x = 2; x < 22; x++) {
        const k = W * y + x;
        png.data[k * 4] = 250; png.data[k * 4 + 1] = 240; png.data[k * 4 + 2] = 90;
      }
    }
  }
  return { png, drawn, off };
}

/* ── measure while we are here: coverage per group, so "is the head drawn" is a number too ── */
function coverage(view) {
  const { png } = render(view);
  let body = 0, head = 0;
  for (let i = 0; i < W * H; i++) {
    const r = png.data[i * 4], g = png.data[i * 4 + 1], b = png.data[i * 4 + 2];
    if (r === 18 && g === 20 && b === 26) continue;
    if (r > b) head++; else body++;
  }
  return { png, body, head };
}

const name = `carmsil-${STAGE}${STAGE === 'pose' ? `-shift${SHIFT}` : ''}${TAG ? `-${TAG}` : ''}`;
console.log(`stage: ${soup.label}`);
for (const view of ['front', 'side']) {
  const { png, body, head } = coverage(view);
  const out = path.join(ROOT, 'shots', `${name}-${view}.png`);
  writeFileSync(out, PNG.sync.write(png));
  console.log(`   ${view.padEnd(5)} → ${path.relative(ROOT, out)}   covered px: body ${body}  head ${head}`
    + `   head share ${((head / (body + head || 1)) * 100).toFixed(1)}%`);
}

/* bbox, printed so the picture and the numbers are the same run */
let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
let hy0 = Infinity, hy1 = -Infinity, hx0 = Infinity, hx1 = -Infinity;
for (let i = 0; i < soup.grp.length; i++) {
  const x = soup.pos[i * 3], y = soup.pos[i * 3 + 1], z = soup.pos[i * 3 + 2];
  if (!Number.isFinite(x + y + z)) continue;
  x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  if (soup.grp[i] === 1) { hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y); hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
}
const f = (n) => n.toFixed(3);
console.log(`   bbox   x ${f(x0)}..${f(x1)} (w ${f(x1 - x0)})   y ${f(y0)}..${f(y1)} (h ${f(y1 - y0)})   z ${f(z0)}..${f(z1)} (d ${f(z1 - z0)})`);
console.log(`   head   x ${f(hx0)}..${f(hx1)} (w ${f(hx1 - hx0)})   y ${f(hy0)}..${f(hy1)} (h ${f(hy1 - hy0)})`);
