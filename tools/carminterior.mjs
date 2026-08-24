#!/usr/bin/env node
/**
 * carminterior.mjs — which of Carmelita's meshes are INSIDE her, measured rather than assumed.
 *
 * §702 recovered the face (32 triangles → 5,000) and that put the worst main view at **101% of
 * the 1.2 M triangle cap**. A breach of a hard AGENTS.md §1 constraint is not something to record
 * and ship, so something has to come out — and the honest thing to take out is geometry that was
 * never on screen, not geometry that was.
 *
 * §698 named three meshes as "under the coat or inside the mouth": `Stomach_LP`,
 * `TeethUpper_LowPoly` and `Tongue_LowPoly` — the three whose materials the Godot importer does
 * not remap, so they have no atlas of their own and reach the body atlas by a stated fallback.
 * That sentence was written from the node names and the material table. **It has never been
 * measured**, and this repository's standing lesson (§699) is that a claim about what a file
 * contains is only a measurement if something re-reads the file.
 *
 * So this measures enclosure directly. For a sample of each mesh's vertices it fires rays in 14
 * directions (6 axes + 8 diagonals) and asks how many of them leave the character without
 * hitting other body geometry. A vertex sealed inside a closed body hits in every direction; a
 * vertex on the outer surface escapes in roughly half of them.
 *
 *   enclosure = mean over sampled vertices of (directions blocked / 14)
 *
 * The instrument is shown able to DISCRIMINATE rather than merely to produce a number: `Coat`,
 * `Hair_LP` and `Shoes` are outer surfaces and must score low, `Irises` sit behind the cornea and
 * must score high. If the controls do not separate, the reading is not usable and the tool says
 * so instead of ranking meshes.
 *
 *   node tools/carminterior.mjs [--samples 400]
 *
 * Reads only committed assets. No renderer, no browser, no lock.
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { spliceHead, UNREMAPPED } from '../src/ai/CarmelitaGuard.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d; };
const SAMPLES = arg('--samples', 400);

const buf = readFileSync(path.join(ROOT, 'public/assets/sly-anim/carmelita-guard.glb'));
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
gltf.scene.updateMatrixWorld(true);
try {
  const hb = readFileSync(path.join(ROOT, 'public/assets/sly-anim/carmelita-head-lp.glb'));
  const hg = await new Promise((res, rej) => new GLTFLoader().parse(
    hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength), '', res, rej));
  let geo = null;
  hg.scene.traverse((o) => { if (!geo && o.isMesh) geo = o.geometry; });
  if (geo) console.log(`(recovered face spliced: ${JSON.stringify(spliceHead(gltf.scene, geo))})`);
  gltf.scene.updateMatrixWorld(true);
} catch { console.log('(no recovered face asset — measuring the shipped stub)'); }

/* world-space copies, as plain meshes, so a Raycaster can see them without a skeleton */
const meshes = [];
gltf.scene.traverse((o) => {
  if (!o.isSkinnedMesh) return;
  const g = o.geometry.clone();
  g.applyMatrix4(o.matrixWorld);
  const mat = Array.isArray(o.material) ? o.material[0]?.name : o.material?.name;
  meshes.push({ name: o.name, mat, mesh: new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), geo: g });
});
for (const m of meshes) m.mesh.updateMatrixWorld(true);

/* 14 directions: the 6 axes plus the 8 cube diagonals */
const DIRS = [];
for (const a of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) DIRS.push(new THREE.Vector3(...a));
for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) DIRS.push(new THREE.Vector3(sx, sy, sz).normalize());

const ray = new THREE.Raycaster();
ray.far = 6;
const v = new THREE.Vector3();

function enclosure(target) {
  const others = meshes.filter((m) => m !== target).map((m) => m.mesh);
  const pos = target.geo.attributes.position;
  const n = pos.count;
  const step = Math.max(1, Math.floor(n / SAMPLES));
  let blocked = 0, total = 0, sampled = 0;
  for (let i = 0; i < n; i += step) {
    v.fromBufferAttribute(pos, i);
    sampled++;
    for (const d of DIRS) {
      /* start a hair off the surface so the vertex's own neighbours are not the first hit —
         the mesh itself is excluded from the target set, but a coincident seam still would be */
      ray.set(v.clone().addScaledVector(d, 0.002), d);
      total++;
      if (ray.intersectObjects(others, false).length > 0) blocked++;
    }
  }
  return { enclosure: blocked / total, sampled };
}

console.log(`\nenclosure = fraction of 14 ray directions that do NOT escape the body`);
console.log(`(${SAMPLES} vertices sampled per mesh; ray far 6 m, double-sided)\n`);
const rows = [];
for (const m of meshes) {
  const r = enclosure(m);
  rows.push({ name: m.name, mat: m.mat, ...r, tris: (m.geo.index ? m.geo.index.count : m.geo.attributes.position.count) / 3 });
}
rows.sort((a, b) => b.enclosure - a.enclosure);
console.log('mesh                 material               tris   sampled   enclosure');
for (const r of rows) {
  const flag = UNREMAPPED.includes(r.mat) ? '   ← UNREMAPPED (§698: "under the coat or inside the mouth")' : '';
  console.log(`${r.name.padEnd(20)} ${String(r.mat).padEnd(22)} ${String(Math.round(r.tris)).padStart(5)}`
    + `   ${String(r.sampled).padStart(5)}     ${(r.enclosure * 100).toFixed(1)}%${flag}`);
}

/* ── the controls, so the reading is known to discriminate (§418.3) ──────────────────────── */
const get = (n) => rows.find((r) => r.name === n)?.enclosure ?? NaN;
const outer = ['Coat', 'Hair_LP', 'Shoes'].map(get);
const inner = ['Irises'].map(get);
console.log(`\ncontrols — outer surfaces Coat/Hair_LP/Shoes: `
  + outer.map((x) => `${(x * 100).toFixed(1)}%`).join(', ')
  + `   |   behind the cornea Irises: ${inner.map((x) => `${(x * 100).toFixed(1)}%`).join(', ')}`);
const sep = Math.min(...inner) - Math.max(...outer);
console.log(`separation ${(sep * 100).toFixed(1)} points — `
  + (sep > 0.15 ? 'the reading DISCRIMINATES and the ranking above is usable'
    : 'NOT USABLE: the controls do not separate, so no mesh should be cut on this number'));

const cand = rows.filter((r) => UNREMAPPED.includes(r.mat));
console.log(`\nthe three §698 named: `
  + cand.map((r) => `${r.name} ${(r.enclosure * 100).toFixed(1)}% (${Math.round(r.tris)} tris)`).join(', '));
console.log(`total if dropped: ${cand.reduce((a, r) => a + r.tris, 0)} triangles per guard, `
  + `× 9 guards × 2 (each guard is drawn again as an ink shell) = `
  + `${Math.round(cand.reduce((a, r) => a + r.tris, 0) * 18)} off the worst view`);
