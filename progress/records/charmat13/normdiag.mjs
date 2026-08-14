/* normdiag — offline diagnosis of the shirt/shoulder facet complaint (r11/r12 family 2).
   Loads the SHIPPED SlyModelDLRig through the dlrig.test.mjs rewrite path and measures
   normal continuity across coincident positions. Read-only. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import * as THREE from 'three';

const ROOT = '/home/user/Demo';
const SRC = path.join(ROOT, 'src/player/SlyModelDLRig.js');
const SHIM = path.join(ROOT, 'node_modules/.dlrig-diag');

class FakeImg { constructor() { this.width = 1; this.height = 1; } addEventListener() {} removeEventListener() {} set src(_v) {} get src() { return ''; } }
if (typeof globalThis.document === 'undefined') globalThis.document = { createElementNS: () => new FakeImg(), createElement: () => new FakeImg() };
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.ProgressEvent === 'undefined') globalThis.ProgressEvent = class { constructor(t, i = {}) { this.type = t; Object.assign(this, i); } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  if (url.startsWith('file:')) return new Response(readFileSync(new URL(url)), { status: 200 });
  return realFetch(input, init);
};

let src = readFileSync(SRC, 'utf8');
src = src.replace(/import\.meta\.glob\([^;]*?\);/, '{};');
src = src.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(SRC).href));
src = src.replace(/(\bfrom\s+')(\.\.?\/[^']+)(')/g, (_m, a, spec, c) => a + pathToFileURL(path.resolve(path.dirname(SRC), spec)).href + c);
mkdirSync(SHIM, { recursive: true });
const out = path.join(SHIM, `d${process.pid}.mjs`);
writeFileSync(out, src);
const mod = await import(pathToFileURL(out).href);

const made = [];
const engine = { warn: (s) => console.log('  !', s), get: (k) => (k === 'shading' ? { make: (o) => { made.push(o); return new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff }); }, outline: () => {} } : undefined), scene: null };
const model = new mod.SlyModel(engine);
await model.init();

const mesh = model.mesh;
const g = mesh.geometry;
const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
console.log(`\ngeometry: indexed=${!!g.index}  verts=${pos.count}  tris=${pos.count / 3}  groups=${g.groups.length}`);
for (const gr of g.groups) console.log(`  group mat=${gr.materialIndex} start=${gr.start} count=${gr.count}`);
console.log('materials:', made.map((m) => m.name).join(', '));

/* Bucket vertices by quantised position; within each bucket measure max angle between normals. */
const KEY = (i, q) => {
  const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
  return `${Math.round(x / q)}|${Math.round(y / q)}|${Math.round(z / q)}`;
};
const Q = 1e-4; // 0.1 mm — coincident within authoring precision
const buckets = new Map();
for (let i = 0; i < pos.count; i++) {
  const k = KEY(i, Q);
  let b = buckets.get(k); if (!b) { b = []; buckets.set(k, b); }
  b.push(i);
}

/* Which material group does triangle t belong to? */
const groupOfTri = new Int32Array(pos.count / 3).fill(-1);
for (let gi = 0; gi < g.groups.length; gi++) {
  const gr = g.groups[gi];
  for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) groupOfTri[t] = gr.materialIndex;
}

const nv = new THREE.Vector3(), nw = new THREE.Vector3();
function stats(filter, label) {
  let seams = 0, shared = 0, sumMax = 0, hist = new Array(19).fill(0);
  const angles = [];
  for (const [, list] of buckets) {
    const sel = list.filter(filter);
    if (sel.length < 2) continue;
    shared++;
    let mx = 0;
    for (let a = 0; a < sel.length; a++) for (let b = a + 1; b < sel.length; b++) {
      nv.fromBufferAttribute(nrm, sel[a]); nw.fromBufferAttribute(nrm, sel[b]);
      const d = Math.max(-1, Math.min(1, nv.dot(nw)));
      const deg = Math.acos(d) * 180 / Math.PI;
      if (deg > mx) mx = deg;
    }
    angles.push(mx); sumMax += mx;
    hist[Math.min(18, Math.floor(mx / 5))]++;
    if (mx > 1.0) seams++;
  }
  angles.sort((a, b) => a - b);
  const p = (q) => angles.length ? angles[Math.min(angles.length - 1, Math.floor(q * angles.length))].toFixed(2) : 'n/a';
  console.log(`\n[${label}] coincident-position groups: ${shared}   with max-normal-angle > 1deg: ${seams} (${(100 * seams / Math.max(1, shared)).toFixed(1)}%)`);
  console.log(`   mean maxangle ${(sumMax / Math.max(1, shared)).toFixed(2)}deg   p50 ${p(0.5)}  p90 ${p(0.9)}  p99 ${p(0.99)}  max ${p(0.999999)}`);
  console.log('   hist(5deg bins 0..90+): ' + hist.join(' '));
}

/* Part membership: material group index. Report the mapping first. */
const partOfVert = new Int32Array(pos.count).fill(-1);
for (let t = 0; t < pos.count / 3; t++) for (let k = 0; k < 3; k++) partOfVert[t * 3 + k] = groupOfTri[t];

stats(() => true, 'ALL');
for (let mi = 0; mi < made.length; mi++) stats((i) => partOfVert[i] === mi, `mat${mi} ${made[mi].name}`);

/* Shoulder/chest ROI in model space: above chest bone height, |x| within torso, front half. */
const bb = new THREE.Box3().setFromBufferAttribute(pos);
console.log(`\nbbox min ${bb.min.toArray().map((v) => v.toFixed(3))}  max ${bb.max.toArray().map((v) => v.toFixed(3))}`);
const bodyMat = made.findIndex((m) => /body/.test(m.name));
const yLo = bb.min.y + 0.62 * (bb.max.y - bb.min.y), yHi = bb.min.y + 0.82 * (bb.max.y - bb.min.y);
stats((i) => partOfVert[i] === bodyMat && pos.getY(i) >= yLo && pos.getY(i) <= yHi, `SHOULDER/CHEST band y[${yLo.toFixed(3)},${yHi.toFixed(3)}] on body`);

/* Also: are the normals per-triangle-flat? Compare each vertex normal to its own face normal. */
const a = new THREE.Vector3(), b2 = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
let flatN = 0, totN = 0, flatBody = 0, totBody = 0;
for (let t = 0; t < pos.count / 3; t++) {
  a.fromBufferAttribute(pos, t * 3); b2.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
  fn.copy(c).sub(b2).cross(a.clone().sub(b2));
  if (fn.lengthSq() < 1e-18) continue;
  fn.normalize();
  let allFlat = true;
  for (let k = 0; k < 3; k++) { nv.fromBufferAttribute(nrm, t * 3 + k); if (Math.abs(nv.dot(fn)) < 0.9999) allFlat = false; }
  totN++; if (allFlat) flatN++;
  if (groupOfTri[t] === bodyMat) { totBody++; if (allFlat) flatBody++; }
}
console.log(`\nper-triangle FLAT normals (all 3 corners == face normal): ${flatN}/${totN} tris (${(100 * flatN / totN).toFixed(1)}%)   body only: ${flatBody}/${totBody} (${(100 * flatBody / Math.max(1, totBody)).toFixed(1)}%)`);
