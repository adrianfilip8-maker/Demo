#!/usr/bin/env node
/**
 * pistollp.mjs — bake a low-poly Carmelita shock pistol, and prove what it cost.
 *
 * ── why ────────────────────────────────────────────────────────────────────────────────────
 * `MainBody` + `Barrel` + `Antennae003` are the shock pistol. They ship inside
 * `carmelita-guard.glb` already, they are weighted to a four-bone sub-armature that six of her
 * eleven clips drive, and the native arm (§704) needs no attach logic to use them. They are off
 * because they do not fit: 1,672 triangles a guard × 9 humanoid guards × 2 (each guard is drawn
 * again as an ink shell) = 30,096 against **7,030** triangles of headroom
 * (`tools/budgetattrib.mjs --inpage`: 1,192,970 of a 1,200,000 cap).
 *
 * The pistol's own drawn size says the mass is not buying anything. Its body is a 0.58 m
 * diagonal; across the canonical shots it spans **8.5–105.6 px** and is 36.3 px in `courtyard`,
 * the shot that sets the 99% figure. At 36 px a 1,108-triangle body is roughly two triangles per
 * pixel. So this decimates, and measures how much shape that costs rather than asserting it is
 * fine.
 *
 * ── what it measures ───────────────────────────────────────────────────────────────────────
 *   DEVIATION   for every vertex of the ORIGINAL mesh, the true distance to the nearest point on
 *               the decimated SURFACE (point-to-triangle, not point-to-vertex — a vertex metric
 *               flatters decimation exactly where it is worst). Quoted in mm and, because that
 *               is the number that decides it, in PIXELS at each canonical shot's distance.
 *   SILHOUETTE  the outline is the art style, so shape error that shows up on the border matters
 *               more than error in the interior. Both meshes are rasterised into a 512² coverage
 *               mask from 24 directions on a sphere and the symmetric difference is reported as
 *               a fraction of the original's covered area.
 *   SKIN        every surviving vertex's `skinIndex`/`skinWeight` must be bytes from the source.
 *               Checked, not assumed: the emitted set of (bone, weight) pairs must be a SUBSET of
 *               the original's. A REFUSAL, because an invented weight is a defect with no upside.
 *   DRIVEN      the check that actually decides it. A decimation can drop a joint from the weight
 *               table — `Antennae003` loses `antenna002` (3.56% of its weight) below 240 triangles
 *               and `MainBody` loses `Trigger` (9.38%) below 160. Whether that MATTERS is not a
 *               question about the bind pose, which is where a joint census is taken: it is a
 *               question about the eleven clips, which is where the joint moves. So both meshes
 *               are CPU-skinned through every clip and the decimated surface is measured against
 *               the original one **posed**, per frame. A joint whose loss is invisible on every
 *               clip has cost nothing; one whose loss opens a gap shows up here as millimetres.
 *               §442: measuring this at bind — where every bone matrix is the identity — would
 *               report 0 for a mesh that flies apart the moment it is driven.
 *
 * ── the instrument is shown able to fail (§418.3) ──────────────────────────────────────────
 * `--selftest` runs the deviation and silhouette metrics against a deliberately wrong mesh (the
 * pistol scaled 1.05 about its own centre) and against the identity, and refuses to proceed
 * unless the first is large and the second is zero. A metric that answers "fine" for both is the
 * §39/§43/§50 family and is worth nothing here.
 *
 *   node tools/pistollp.mjs                      # measure a sweep of ratios, write nothing
 *   node tools/pistollp.mjs --target 380 --write # bake it
 *   node tools/pistollp.mjs --pixels            # the shipped asset vs the full one, in PIXELS
 *   node tools/pistollp.mjs --selftest
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { decimateSkinned } from './_decimate.mjs';
import { CLIP_FOR_ARMED } from '../src/ai/CarmelitaNative.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const num = (k, d) => Number(arg(k, d));
const WRITE = argv.includes('--write');
const SELFTEST = argv.includes('--selftest');
const TARGET = num('--target', 0);

const GUARD = path.join(ROOT, 'public/assets/sly-anim/carmelita-guard.glb');
const OUT = path.join(ROOT, 'public/assets/sly-anim/carmelita-pistol-lp.glb');
const CLIPS = path.join(ROOT, 'public/assets/sly-anim/carmelita-clips.glb');
/** The three pistol meshes, and the share of the 1,672 each carries. Names are the loader's —
 *  three strips '.' from glTF node names, so the asset's `Antennae.003` arrives as this. */
export const PISTOL_MESHES = ['MainBody', 'Barrel', 'Antennae003'];

const parse = (p) => {
  const b = readFileSync(p);
  return new Promise((res, rej) => new GLTFLoader().parse(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
};

/* ───────────────────────────────── metrics ───────────────────────────────── */

/** Squared distance from p to triangle abc. Ericson, Real-Time Collision Detection §5.1.5. */
function ptTriSq(p, a, b, c) {
  const abx = b[0]-a[0], aby = b[1]-a[1], abz = b[2]-a[2];
  const acx = c[0]-a[0], acy = c[1]-a[1], acz = c[2]-a[2];
  const apx = p[0]-a[0], apy = p[1]-a[1], apz = p[2]-a[2];
  const d1 = abx*apx+aby*apy+abz*apz, d2 = acx*apx+acy*apy+acz*apz;
  if (d1 <= 0 && d2 <= 0) return apx*apx+apy*apy+apz*apz;
  const bpx = p[0]-b[0], bpy = p[1]-b[1], bpz = p[2]-b[2];
  const d3 = abx*bpx+aby*bpy+abz*bpz, d4 = acx*bpx+acy*bpy+acz*bpz;
  if (d3 >= 0 && d4 <= d3) return bpx*bpx+bpy*bpy+bpz*bpz;
  const vc = d1*d4 - d3*d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1/(d1-d3);
    const qx=a[0]+v*abx-p[0], qy=a[1]+v*aby-p[1], qz=a[2]+v*abz-p[2]; return qx*qx+qy*qy+qz*qz; }
  const cpx = p[0]-c[0], cpy = p[1]-c[1], cpz = p[2]-c[2];
  const d5 = abx*cpx+aby*cpy+abz*cpz, d6 = acx*cpx+acy*cpy+acz*cpz;
  if (d6 >= 0 && d5 <= d6) return cpx*cpx+cpy*cpy+cpz*cpz;
  const vb = d5*d2 - d1*d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2/(d2-d6);
    const qx=a[0]+w*acx-p[0], qy=a[1]+w*acy-p[1], qz=a[2]+w*acz-p[2]; return qx*qx+qy*qy+qz*qz; }
  const va = d3*d6 - d5*d4;
  if (va <= 0 && (d4-d3) >= 0 && (d5-d6) >= 0) { const w = (d4-d3)/((d4-d3)+(d5-d6));
    const qx=b[0]+w*(c[0]-b[0])-p[0], qy=b[1]+w*(c[1]-b[1])-p[1], qz=b[2]+w*(c[2]-b[2])-p[2];
    return qx*qx+qy*qy+qz*qz; }
  const den = 1/(va+vb+vc), v = vb*den, w = vc*den;
  const qx=a[0]+abx*v+acx*w-p[0], qy=a[1]+aby*v+acy*w-p[1], qz=a[2]+abz*v+acz*w-p[2];
  return qx*qx+qy*qy+qz*qz;
}

function triangles(geo) {
  const p = geo.attributes.position, ix = geo.index;
  const n = ix ? ix.count : p.count;
  const out = [];
  for (let t = 0; t < n; t += 3) {
    const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t+1) : t+1, c = ix ? ix.getX(t+2) : t+2;
    out.push([[p.getX(a),p.getY(a),p.getZ(a)],[p.getX(b),p.getY(b),p.getZ(b)],[p.getX(c),p.getY(c),p.getZ(c)]]);
  }
  return out;
}

/** Max / mean distance from every vertex of `from` to the surface of `to`, in metres. */
function deviation(from, to) {
  const tris = triangles(to);
  const p = from.attributes.position;
  let max = 0, sum = 0;
  for (let i = 0; i < p.count; i++) {
    const q = [p.getX(i), p.getY(i), p.getZ(i)];
    let best = Infinity;
    for (const t of tris) { const d = ptTriSq(q, t[0], t[1], t[2]); if (d < best) best = d; }
    const d = Math.sqrt(best);
    if (d > max) max = d; sum += d;
  }
  return { max, mean: sum / p.count };
}

/** Symmetric-difference of the two coverage masks over `dirs` viewpoints, as a fraction of the
 *  original's covered area. This is the silhouette question the ink outline actually asks. */
function silhouette(a, b, dirs = 24, res = 256) {
  const ta = triangles(a), tb = triangles(b);
  const box = new THREE.Box3();
  for (const t of ta) for (const v of t) box.expandByPoint(new THREE.Vector3(v[0], v[1], v[2]));
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() * 0.5 * 1.05;
  let inter = 0, uni = 0, refArea = 0;
  const gold = Math.PI * (3 - Math.sqrt(5));
  for (let d = 0; d < dirs; d++) {
    const y = 1 - (d / (dirs - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = gold * d;
    const fwd = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize();
    const up = Math.abs(fwd.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const realUp = new THREE.Vector3().crossVectors(fwd, right).normalize();
    const proj = (v) => {
      const x = (v[0]-centre.x)*right.x + (v[1]-centre.y)*right.y + (v[2]-centre.z)*right.z;
      const yy = (v[0]-centre.x)*realUp.x + (v[1]-centre.y)*realUp.y + (v[2]-centre.z)*realUp.z;
      return [ (x/radius*0.5+0.5)*res, (yy/radius*0.5+0.5)*res ];
    };
    const ma = raster(ta, proj, res), mb = raster(tb, proj, res);
    for (let i = 0; i < ma.length; i++) {
      if (ma[i]) refArea++;
      if (ma[i] && mb[i]) inter++;
      if (ma[i] || mb[i]) uni++;
    }
  }
  return { symDiff: refArea ? (uni - inter) / refArea : 0, iou: uni ? inter / uni : 1, area: refArea };
}

function raster(tris, proj, res) {
  const m = new Uint8Array(res * res);
  for (const t of tris) {
    const p0 = proj(t[0]), p1 = proj(t[1]), p2 = proj(t[2]);
    const minx = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const maxx = Math.min(res - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const miny = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const maxy = Math.min(res - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    const d = (p1[0]-p0[0])*(p2[1]-p0[1]) - (p2[0]-p0[0])*(p1[1]-p0[1]);
    if (Math.abs(d) < 1e-12) continue;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((p1[0]-px)*(p2[1]-py) - (p2[0]-px)*(p1[1]-py)) / d;
      const w1 = ((p2[0]-px)*(p0[1]-py) - (p0[0]-px)*(p2[1]-py)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 >= -1e-9 && w1 >= -1e-9 && w2 >= -1e-9) m[y * res + x] = 1;
    }
  }
  return m;
}

/**
 * Both meshes, CPU-skinned through every clip, decimated measured against original.
 *
 * §439/§440 note on why this is not circular: three's own `applyBoneTransform` poses BOTH
 * meshes, so the skinning maths is shared — but the skinning maths is not the subject. The
 * subject is whether the DECIMATED weight table drives the surface to the same place as the
 * ORIGINAL one, and that difference survives any common transform applied to both.
 */
async function drivenDeviation(outGeos, posesPerClip = 8) {
  const clips = (await parse(CLIPS)).animations;
  const scene2 = (await parse(GUARD)).scene;
  scene2.updateMatrixWorld(true);
  const rig = [];
  for (const n of PISTOL_MESHES) {
    let host = null;
    scene2.traverse((o) => { if (o.isSkinnedMesh && o.name === n) host = o; });
    if (!host) throw new Error(`${n} vanished from the second parse`);
    const lo = new THREE.SkinnedMesh(outGeos[n].clone(), new THREE.MeshBasicMaterial());
    host.parent.add(lo);
    lo.bindMode = host.bindMode;
    lo.bind(host.skeleton, host.bindMatrix);
    rig.push({ n, host, lo });
  }
  const mixer = new THREE.AnimationMixer(scene2);
  const poseTris = (mesh) => {
    const p = mesh.geometry.attributes.position, ix = mesh.geometry.index;
    const V = new Array(p.count);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); mesh.applyBoneTransform(i, v); mesh.localToWorld(v);
      V[i] = [v.x, v.y, v.z];
    }
    const T = [];
    for (let t = 0; t < ix.count; t += 3) T.push([V[ix.getX(t)], V[ix.getX(t + 1)], V[ix.getX(t + 2)]]);
    return { V, T };
  };
  const devPosed = () => {
    let max = 0, sum = 0, n = 0;
    for (const { host, lo } of rig) {
      const hp = poseTris(host), lp = poseTris(lo);
      for (const q of hp.V) {
        let best = Infinity;
        for (const t of lp.T) { const d = ptTriSq(q, t[0], t[1], t[2]); if (d < best) best = d; }
        const d = Math.sqrt(best);
        if (d > max) max = d; sum += d; n++;
      }
    }
    return { max, mean: sum / n };
  };
  scene2.updateMatrixWorld(true);
  rig[0].host.skeleton.update();
  const atBind = devPosed();
  const rows = [];
  for (const c of clips) {
    mixer.stopAllAction();
    mixer.clipAction(c).reset().play();
    let max = 0, sum = 0, k = 0;
    for (let i = 0; i < posesPerClip; i++) {
      mixer.setTime(c.duration * i / posesPerClip);
      scene2.updateMatrixWorld(true);
      rig[0].host.skeleton.update();
      const d = devPosed();
      max = Math.max(max, d.max); sum += d.mean; k++;
    }
    rows.push({ clip: c.name, samples: posesPerClip, max, mean: sum / k, bind: atBind.max });
  }
  return rows;
}

/* ───────────────────────────── load the pistol ───────────────────────────── */
const scene = (await parse(GUARD)).scene;
scene.updateMatrixWorld(true);
const srcMesh = {};
scene.traverse((o) => { if (o.isMesh && PISTOL_MESHES.includes(o.name)) srcMesh[o.name] = o; });
for (const n of PISTOL_MESHES) if (!srcMesh[n]) throw new Error(`${n} is not in carmelita-guard.glb`);

const srcGeo = {};
for (const n of PISTOL_MESHES) {
  const g = srcMesh[n].geometry.clone();
  g.applyMatrix4(srcMesh[n].matrixWorld);
  for (const k of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
  }
  g.morphAttributes = {};
  srcGeo[n] = g;
}
/** joint index -> bone name, so a dropped-joint line names the joint. */
const BONE = (() => { let m = null; scene.traverse((o) => { if (!m && o.isSkinnedMesh) m = o; });
  return m?.skeleton?.bones?.map((b) => b.name) || []; })();
const srcTris = Object.fromEntries(PISTOL_MESHES.map((n) => [n, srcGeo[n].index.count / 3]));
const TOTAL = Object.values(srcTris).reduce((a, b) => a + b, 0);

/* ─────────────────────────────── selftest ────────────────────────────────── */
if (SELFTEST) {
  console.log('SELFTEST — can these metrics tell a wrong mesh from a right one?\n');
  for (const n of PISTOL_MESHES) {
    const g = srcGeo[n];
    const same = g.clone();
    const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
    const c = box.getCenter(new THREE.Vector3());
    const bad = g.clone();
    bad.translate(-c.x, -c.y, -c.z); bad.scale(1.05, 1.05, 1.05); bad.translate(c.x, c.y, c.z);
    const dS = deviation(g, same), dB = deviation(g, bad);
    const sS = silhouette(g, same, 8, 128), sB = silhouette(g, bad, 8, 128);
    console.log(`${n.padEnd(13)} identity: dev ${(dS.max*1000).toFixed(4)} mm  symDiff ${(sS.symDiff*100).toFixed(3)}%`
      + `   |   +5% scale: dev ${(dB.max*1000).toFixed(2)} mm  symDiff ${(sB.symDiff*100).toFixed(2)}%`);
    if (dS.max > 1e-9 || sS.symDiff > 1e-9) throw new Error(`${n}: the metric does not read zero on the identity`);
    if (dB.max * 1000 < 1 || sB.symDiff < 0.02) throw new Error(`${n}: the metric cannot see a 5% scale — it discriminates nothing`);
  }
  console.log('\nBoth metrics read exactly 0 on the identity and blow up on a 5% scale — usable.');
  process.exit(0);
}

/** Per canonical shot: the pistol body's on-screen diagonal, from tools/budgetattrib's cameras.
 *  Used to turn a deviation in mm into the only unit that decides this — pixels. */
const SHOT_PX = [['guard', 5.7, 105.6], ['impact', 15.2, 39.9], ['courtyard', 11.0, 36.3],
  ['hero', 14.1, 34.7], ['combat', 22.9, 25.0], ['night', 27.3, 17.2], ['dunes', 64.0, 8.5]];
const MOUNT_SCALE = 1.108338;
const BODY_DIAG = 0.5226;                 // MainBody local bbox diagonal, metres

/* ───────────────── the comparison at the size it is actually drawn ────────── */
/* `--pixels` answers the only question a deviation in millimetres cannot: at the size the pistol
 * is DRAWN, how many pixels of its silhouette does the decimation actually change? Both meshes
 * are rasterised into the same coverage grid at the pixel size each canonical shot gives them,
 * and the disagreement is counted. It needs the committed low-poly asset, not a fresh
 * decimation, so it reports what SHIPS. */
if (argv.includes('--pixels')) {
  const lpScene = (await parse(OUT)).scene;
  lpScene.updateMatrixWorld(true);
  const lpGeo = {};
  lpScene.traverse((o) => { if (o.isMesh && PISTOL_MESHES.includes(o.name)) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); lpGeo[o.name] = g; } });
  const flat = (m) => PISTOL_MESHES.flatMap((n) => triangles(m[n]));
  const TA = flat(srcGeo), TB = flat(lpGeo);
  const box = new THREE.Box3();
  for (const t of TA) for (const v of t) box.expandByPoint(new THREE.Vector3(v[0], v[1], v[2]));
  const c = box.getCenter(new THREE.Vector3());
  const R = box.getSize(new THREE.Vector3()).length() * 0.5 * 1.03;
  const view = (fwd, res, ts) => {
    const f = fwd.clone().normalize();
    const up = Math.abs(f.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const ri = new THREE.Vector3().crossVectors(up, f).normalize();
    const ru = new THREE.Vector3().crossVectors(f, ri).normalize();
    return raster(ts, (v) => {
      const x = (v[0]-c.x)*ri.x + (v[1]-c.y)*ri.y + (v[2]-c.z)*ri.z;
      const y = (v[0]-c.x)*ru.x + (v[1]-c.y)*ru.y + (v[2]-c.z)*ru.z;
      return [(x/R*0.5+0.5)*res, (1-(y/R*0.5+0.5))*res];
    }, res);
  };
  const VIEWS = [['side', new THREE.Vector3(1,0,0)], ['front', new THREE.Vector3(0,0,1)], ['three-quarter', new THREE.Vector3(1,0.35,0.9)]];
  console.log(`\nSILHOUETTE AT THE DRAWN SIZE — ${srcTris.MainBody + srcTris.Barrel + srcTris.Antennae003} `
    + `triangles vs the committed ${TB.length}, rasterised into the pixels each shot gives them.\n`);
  console.log('  shot         px   view             full   shipped   disagree   as % of the full silhouette');
  for (const [shot, , px] of SHOT_PX) {
    const res = Math.max(8, Math.round(px));
    for (const [name, dir] of VIEWS) {
      const a = view(dir, res, TA), b = view(dir, res, TB);
      let A1 = 0, B1 = 0, both = 0, either = 0;
      for (let i = 0; i < a.length; i++) { if (a[i]) A1++; if (b[i]) B1++; if (a[i] && b[i]) both++; if (a[i] || b[i]) either++; }
      console.log(`  ${shot.padEnd(11)} ${String(res).padStart(4)}   ${name.padEnd(15)} ${String(A1).padStart(5)}  ${String(B1).padStart(7)}   `
        + `${String(either - both).padStart(7)}   ${(100 * (either - both) / A1).toFixed(1).padStart(6)}%`);
    }
  }
  process.exit(0);
}

/* ──────────────────────── sweep, or bake one target ──────────────────────── */
const ratios = TARGET ? [TARGET / TOTAL] : [0.60, 0.45, 0.35, 0.28, 0.23, 0.18, 0.12];
console.log(`shock pistol, from ${path.basename(GUARD)}: `
  + PISTOL_MESHES.map((n) => `${n} ${srcTris[n]}`).join(' + ') + ` = ${TOTAL} triangles\n`);
console.log('ratio   tris   MainBody Barrel Antennae   max dev   mean dev   silhouette symDiff   worst-shot px error');
console.log('-'.repeat(108));

let chosen = null;
for (const r of ratios) {
  const res = {}, out = {};
  for (const n of PISTOL_MESHES) {
    const t = Math.max(4, Math.round(srcTris[n] * r));
    res[n] = decimateSkinned(srcGeo[n], t);
    out[n] = res[n].geometry;
  }
  const tris = PISTOL_MESHES.reduce((a, n) => a + res[n].after, 0);
  let maxDev = 0, meanDev = 0, sym = 0, w = 0;
  for (const n of PISTOL_MESHES) {
    const d = deviation(srcGeo[n], out[n]);
    const s = silhouette(srcGeo[n], out[n], 16, 192);
    maxDev = Math.max(maxDev, d.max);
    meanDev += d.mean * srcTris[n]; sym += s.symDiff * srcTris[n]; w += srcTris[n];
  }
  meanDev /= w; sym /= w;
  /* px error at the closest shot: metres of deviation × MOUNT_SCALE, through that camera */
  const [, dist] = SHOT_PX[0];
  const pxPerM = SHOT_PX[0][2] / (BODY_DIAG * MOUNT_SCALE);
  const pxErr = maxDev * MOUNT_SCALE * pxPerM;
  console.log(`${(r*100).toFixed(0).padStart(4)}%  ${String(tris).padStart(5)}   `
    + PISTOL_MESHES.map((n) => String(res[n].after).padStart(8)).join(' ')
    + `   ${(maxDev*1000).toFixed(2).padStart(6)} mm  ${(meanDev*1000).toFixed(2).padStart(6)} mm`
    + `   ${(sym*100).toFixed(2).padStart(14)}%   ${pxErr.toFixed(2).padStart(14)} px`);
  if (TARGET) chosen = { res, out, tris, maxDev, meanDev, sym, pxErr };
}

if (!TARGET) {
  console.log('\n(no --target given — nothing written. `--target N` picks a total triangle count.)');
  console.log('\nthe pistol on screen, per canonical shot (body diagonal):');
  for (const [s, d, px] of SHOT_PX) console.log(`  ${s.padEnd(11)} ${String(d).padStart(5)} m   ${String(px).padStart(6)} px`);
  process.exit(0);
}

/* ───────────────────── skin fidelity: bytes, not blends ──────────────────── */
console.log('\nskin check — every emitted (bone, weight) pair must be one the source authored:');
let skinOK = true;
for (const n of PISTOL_MESHES) {
  const a = srcGeo[n], b = chosen.out[n];
  const pairs = new Set();
  const bonesA = new Set(), bonesB = new Set();
  const sa = a.attributes.skinIndex, wa = a.attributes.skinWeight;
  for (let i = 0; i < sa.count; i++) for (let k = 0; k < 4; k++) {
    const wt = wa.array[i*4+k]; const bn = sa.array[i*4+k];
    pairs.add(`${bn}:${wt}`); if (wt > 1e-6) bonesA.add(bn);
  }
  const sb = b.attributes.skinIndex, wb = b.attributes.skinWeight;
  let strays = 0;
  for (let i = 0; i < sb.count; i++) for (let k = 0; k < 4; k++) {
    const wt = wb.array[i*4+k]; const bn = sb.array[i*4+k];
    if (!pairs.has(`${bn}:${wt}`)) strays++;
    if (wt > 1e-6) bonesB.add(bn);
  }
  const lost = [...bonesA].filter((x) => !bonesB.has(x));
  console.log(`  ${n.padEnd(13)} ${sb.count} verts, invented pairs ${strays}, bones ${bonesA.size} → ${bonesB.size}`
    + (lost.length ? `  dropped joint ${lost.map((j) => BONE[j] || j).join(',')} — see the driven check below` : ''));
  if (strays) skinOK = false;
}
if (!skinOK) throw new Error('the decimation invented skin data — refusing to write');
console.log('  every weight is a byte the source authored.');

/* ── the driven check: does it still track the animation? ─────────────────── */
/* Which clips a guard can actually reach in the ARMED build. `CLIP_FOR_ARMED` is the map, so
   this is read off the shipped map rather than restated: whatever it names is what a player
   sees. `PatrolWalk` is on this list only because arming puts it there — in the unarmed build
   it sits in `UNUSED_CLIPS` with `Shoot(GunMovement)`, `Jump`, `Air` and `Run.001`, and those
   four stay unreachable. They are still MEASURED below, and marked, because a number nobody
   can reach is a fact about the asset and not a fact about the game. */
const REACHABLE = new Set(Object.values(CLIP_FOR_ARMED));
console.log('\ndriven check — both meshes CPU-skinned through every clip, decimated surface vs original.');
console.log('(only `Shoot(BodyMovement)` 1.442x and `Shoot(GunMovement)` 2.243x scale the pistol bones;');
console.log(' the other nine hold every pistol scale track at exactly 1.000, so their driven reading');
console.log(' IS the bind reading and any difference from it would be a bug in this check.)');
const drive = await drivenDeviation(chosen.out);
let worstDriven = 0, worstClip = '';
for (const r of drive) {
  const live = REACHABLE.has(r.clip);
  console.log(`  ${live ? ' ' : '·'} ${r.clip.padEnd(20)} ${String(r.samples).padStart(3)} poses   max ${(r.max * 1000).toFixed(2).padStart(6)} mm`
    + `   mean ${(r.mean * 1000).toFixed(2).padStart(5)} mm` + (live ? '' : '   (unreachable — no guard state plays it)'));
  if (live && r.max > worstDriven) { worstDriven = r.max; worstClip = r.clip; }
}
/* ── the limit, in the unit that decides it ────────────────────────────────
 * A millimetre threshold picked out of the air is a threshold picked to pass. This one is
 * stated in PIXELS and converted, against `courtyard` — the shot that sets the 99% figure and
 * one of the three (with `hero` and `impact`) where the pistol is drawn at ~36 px:
 *
 *     36.3 px across a 0.5792 m drawn body diagonal = 62.7 px/m
 *
 * MEAN deviation ≤ 0.25 px, because the mean is what the surface looks like; MAX ≤ 1.5 px,
 * because one spike on one vertex is not the shape but a spike big enough to see is. The max
 * statistic is deliberately the looser of the two: it is a single-vertex figure and it is not
 * even monotone in the triangle count (measured — 467 triangles reads 19.11 mm where 385 reads
 * 16.98), so gating tightly on it would be gating on greedy-collapse-order noise.
 *
 * STATED, not hidden: the `guard` shot puts a camera 5.7 m from a humanoid, where the pistol
 * spans 105.6 px and the same deviation is 3.1 px — 2.9% of the object. That shot is a guard
 * portrait, not the framing the game is played or sold in, and it is the one place this
 * decimation is above the standard set here. */
const PX_PER_M = 36.3 / (BODY_DIAG * MOUNT_SCALE);
const MEAN_LIMIT = 0.25 / PX_PER_M, MAX_LIMIT = 1.5 / PX_PER_M;
const liveRows = drive.filter((r) => REACHABLE.has(r.clip));
const worstMean = Math.max(...liveRows.map((r) => r.mean));
console.log(`  worst over the ${liveRows.length} REACHABLE clips:`);
console.log(`    max  ${(worstDriven * 1000).toFixed(2)} mm on ${worstClip}  = ${(worstDriven * PX_PER_M).toFixed(2)} px at courtyard`
  + `, ${(worstDriven * 105.6 / (BODY_DIAG * MOUNT_SCALE)).toFixed(2)} px at guard   (limit 1.50 px = ${(MAX_LIMIT * 1000).toFixed(1)} mm)`);
console.log(`    mean ${(worstMean * 1000).toFixed(2)} mm = ${(worstMean * PX_PER_M).toFixed(2)} px at courtyard`
  + `   (limit 0.25 px = ${(MEAN_LIMIT * 1000).toFixed(1)} mm)`);
if (worstDriven > MAX_LIMIT) {
  throw new Error(`driven MAX deviation ${(worstDriven * PX_PER_M).toFixed(2)} px on ${worstClip} exceeds 1.50 px — raise the target.`);
}
if (worstMean > MEAN_LIMIT) {
  throw new Error(`driven MEAN deviation ${(worstMean * PX_PER_M).toFixed(2)} px exceeds 0.25 px — raise the target.`);
}

if (!WRITE) { console.log('\n(dry run — pass --write to emit)'); process.exit(0); }

/* ───────────────────────────── emit the GLB ──────────────────────────────── */
function bounds(attr) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < attr.count; i++) for (let k = 0; k < 3; k++) {
    const v = attr.array[i * attr.itemSize + k];
    if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v;
  }
  return { min: mn, max: mx };
}
function glb(geos) {
  const parts = [], views = [], accessors = [], meshes = [], nodes = [];
  let off = 0;
  const push = (typed, target) => {
    while (off % 4) { parts.push(Buffer.alloc(1)); off++; }
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) });
    parts.push(buf); off += buf.length;
    return views.length - 1;
  };
  const CT = { f32: 5126, u16: 5123, u32: 5125 };
  for (const [name, g] of Object.entries(geos)) {
    const use16 = g.attributes.position.count < 65536;
    const iArr = use16 ? Uint16Array.from(g.index.array) : Uint32Array.from(g.index.array);
    const iView = push(iArr, 34963);
    accessors.push({ bufferView: iView, componentType: use16 ? CT.u16 : CT.u32, count: g.index.count, type: 'SCALAR' });
    const indices = accessors.length - 1;
    const attrAcc = {};
    const spec = [
      ['POSITION', g.attributes.position, 'VEC3', CT.f32, Float32Array],
      ['NORMAL', g.attributes.normal, 'VEC3', CT.f32, Float32Array],
      ['TEXCOORD_0', g.attributes.uv, 'VEC2', CT.f32, Float32Array],
      ['JOINTS_0', g.attributes.skinIndex, 'VEC4', CT.u16, Uint16Array],
      ['WEIGHTS_0', g.attributes.skinWeight, 'VEC4', CT.f32, Float32Array],
    ];
    for (const [an, attr, type, ct, Ctor] of spec) {
      if (!attr) throw new Error(`${name} has no ${an}`);
      const v = push(Ctor.from(attr.array), 34962);
      const a = { bufferView: v, componentType: ct, count: attr.count, type };
      if (an === 'POSITION') { const b = bounds(attr); a.min = b.min; a.max = b.max; }
      accessors.push(a);
      attrAcc[an] = accessors.length - 1;
    }
    meshes.push({ name, primitives: [{ attributes: attrAcc, indices, mode: 4 }] });
    nodes.push({ name, mesh: meshes.length - 1 });
  }
  const json = {
    asset: { version: '2.0', generator: 'tools/pistollp.mjs — shock pistol decimated from carmelita-guard.glb' },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes,
    accessors, bufferViews: views, buffers: [{ byteLength: off }],
  };
  const bin = Buffer.concat(parts);
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jChunk = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const bChunk = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const total = 12 + 8 + jChunk.length + 8 + bChunk.length;
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 'ascii'); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jChunk.length, 12); out.write('JSON', 16, 'ascii');
  jChunk.copy(out, 20);
  const bo = 20 + jChunk.length;
  out.writeUInt32LE(bChunk.length, bo); out.write('BIN\0', bo + 4, 'ascii');
  bChunk.copy(out, bo + 8);
  return out;
}

const bytes = glb(chosen.out);
writeFileSync(OUT, bytes);
console.log(`\nwrote ${path.relative(ROOT, OUT)} — ${(bytes.length / 1024).toFixed(1)} kB, ${chosen.tris} triangles`);

/* round-trip through the loader the game uses */
const back = await new Promise((res, rej) => new GLTFLoader().parse(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', res, rej));
const got = {};
back.scene.traverse((o) => { if (o.isMesh) got[o.name] = o.geometry; });
for (const n of PISTOL_MESHES) {
  const g = got[n];
  if (!g) throw new Error(`round-trip lost ${n}`);
  if (g.index.count !== chosen.out[n].index.count) throw new Error(`round-trip changed ${n}'s triangle count`);
  if (!g.attributes.skinIndex || !g.attributes.skinWeight) throw new Error(`round-trip lost ${n}'s skin`);
  const d = deviation(chosen.out[n], g);
  console.log(`  round-trip ${n.padEnd(13)} ${g.index.count/3} tris, deviation ${(d.max*1e6).toFixed(1)} µm`);
  if (d.max > 1e-5) throw new Error(`round-trip moved ${n} by ${d.max} m`);
}
console.log('OK');
