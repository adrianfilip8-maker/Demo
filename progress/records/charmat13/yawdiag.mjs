/* yawdiag — (b) per-yaw tail ring-band contrast in the ALBEDO, and (c) per-triangle normal
   spread on the shirt/shoulder. Read-only, offline, on the SHIPPED rig. */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
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
globalThis.fetch = async (i2, init) => { const url = typeof i2 === 'string' ? i2 : (i2?.url ?? String(i2)); if (url.startsWith('file:')) return new Response(readFileSync(new URL(url)), { status: 200 }); return realFetch(i2, init); };
let src = readFileSync(SRC, 'utf8');
src = src.replace(/import\.meta\.glob\([^;]*?\);/, '{};');
src = src.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(SRC).href));
src = src.replace(/(\bfrom\s+')(\.\.?\/[^']+)(')/g, (_m, a, spec, c) => a + pathToFileURL(path.resolve(path.dirname(SRC), spec)).href + c);
mkdirSync(SHIM, { recursive: true });
const out = path.join(SHIM, `y${process.pid}.mjs`);
writeFileSync(out, src);
const mod = await import(pathToFileURL(out).href);
const made = [];
const engine = { warn: () => {}, get: (k) => (k === 'shading' ? { make: (o) => { made.push(o); return new THREE.MeshStandardMaterial({}); }, outline: () => {} } : undefined) };
const model = new mod.SlyModel(engine); await model.init();
const g = model.mesh.geometry, pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;

const tex = readPNG(path.join(ROOT, 'src/assets/sly-dl/sly_tail.png'));
const { w, h, ch, data } = tex;
const lum = (o) => 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
const sampleRepeat = (u, v) => {
  let x = Math.floor(((u % 1) + 1) % 1 * w), y = Math.floor((1 - (((v % 1) + 1) % 1)) * h);
  x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y));
  const o = (y * w + x) * ch; return [data[o], data[o + 1], data[o + 2], lum(o)];
};

const tailGr = g.groups.find((gr) => /tail/.test(made[gr.materialIndex]?.name || ''));
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
const tris = [];
for (let t = tailGr.start / 3; t < (tailGr.start + tailGr.count) / 3; t++) {
  a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
  fn.copy(c).sub(b).cross(a.clone().sub(b));
  const area = fn.length() / 2; if (area < 1e-12) continue;
  fn.normalize();
  const cen = a.clone().add(b).add(c).multiplyScalar(1 / 3);
  const cu = (uv.getX(t * 3) + uv.getX(t * 3 + 1) + uv.getX(t * 3 + 2)) / 3;
  const cv = (uv.getY(t * 3) + uv.getY(t * 3 + 1) + uv.getY(t * 3 + 2)) / 3;
  const s = sampleRepeat(cu, cv);
  tris.push({ n: fn.clone(), area, cen, L: s[3], rgb: [s[0], s[1], s[2]], v: cv });
}
console.log(`tail: ${tris.length} tris sampled\n`);

const YAWS = [['FRONT (+Z cam)', new THREE.Vector3(0, 0, 1)], ['PROFILE-R (+X cam)', new THREE.Vector3(1, 0, 0)],
  ['REAR (-Z cam)', new THREE.Vector3(0, 0, -1)], ['PROFILE-L (-X cam)', new THREE.Vector3(-1, 0, 0)],
  ['REAR-3Q (-Z+X)', new THREE.Vector3(0.707, 0, -0.707)], ['ABOVE (+Y)', new THREE.Vector3(0, 1, 0)]];
console.log('yaw                  visTris  visArea   albedo-L: p05   p50   p95   span  Michelson  bandRatio(p90/p10)');
for (const [name, dir] of YAWS) {
  const vis = tris.filter((t) => t.n.dot(dir) > 0.10);
  if (!vis.length) { console.log(`${name.padEnd(20)} none`); continue; }
  const tot = vis.reduce((s, t) => s + t.area, 0);
  const sorted = vis.slice().sort((x, y) => x.L - y.L);
  // area-weighted percentiles
  const wq = (q) => { let acc = 0; for (const t of sorted) { acc += t.area; if (acc >= q * tot) return t.L; } return sorted[sorted.length - 1].L; };
  const p05 = wq(0.05), p50 = wq(0.5), p95 = wq(0.95), p10 = wq(0.10), p90 = wq(0.90);
  const mich = (p95 - p05) / Math.max(1e-6, p95 + p05);
  console.log(`${name.padEnd(20)} ${String(vis.length).padStart(6)} ${tot.toFixed(4).padStart(8)}   ${p05.toFixed(1).padStart(6)}${p50.toFixed(1).padStart(6)}${p95.toFixed(1).padStart(6)}${(p95 - p05).toFixed(1).padStart(7)}   ${mich.toFixed(3).padStart(6)}     ${(p90 / Math.max(1, p10)).toFixed(2)}`);
}

/* ---- (c) per-triangle normal spread on the body, banded by height ---- */
const bodyGr = g.groups.find((gr) => /body/.test(made[gr.materialIndex]?.name || ''));
const bb = new THREE.Box3().setFromBufferAttribute(pos);
const H = bb.max.y - bb.min.y;
const n0 = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
function spreadBand(lo, hi, label, gr) {
  const vals = [], areas = [];
  for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
    const cy = (a.y + b.y + c.y) / 3;
    const fy = (cy - bb.min.y) / H;
    if (fy < lo || fy > hi) continue;
    n0.fromBufferAttribute(nrm, t * 3); n1.fromBufferAttribute(nrm, t * 3 + 1); n2.fromBufferAttribute(nrm, t * 3 + 2);
    const ang = (p, q) => Math.acos(Math.max(-1, Math.min(1, p.dot(q)))) * 180 / Math.PI;
    const mx = Math.max(ang(n0, n1), ang(n1, n2), ang(n0, n2));
    fn.copy(c).sub(b).cross(a.clone().sub(b));
    vals.push(mx); areas.push(fn.length() / 2);
  }
  vals.sort((x, y) => x - y);
  const p = (q) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(q * vals.length))] : NaN;
  const edge = Math.sqrt(areas.reduce((s, v) => s + v, 0) / Math.max(1, areas.length) * 2);
  console.log(`${label.padEnd(28)} n=${String(vals.length).padStart(5)}  corner-normal spread deg: p50 ${p(0.5).toFixed(1).padStart(5)}  p90 ${p(0.9).toFixed(1).padStart(5)}  p99 ${p(0.99).toFixed(1).padStart(5)}  max ${p(0.9999).toFixed(1).padStart(5)}   mean tri edge ${(edge * 1000).toFixed(1)} mm`);
}
console.log('\n(c) per-triangle CORNER-NORMAL SPREAD (the band-polyline driver; smooth normals still kink at edges)');
spreadBand(0, 1, 'body ALL', bodyGr);
spreadBand(0.62, 0.82, 'body SHOULDER/CHEST 62-82%', bodyGr);
spreadBand(0.70, 0.80, 'body SHOULDER 70-80%', bodyGr);
spreadBand(0, 1, 'head ALL', g.groups.find((gr) => /head/.test(made[gr.materialIndex]?.name || '')));
spreadBand(0, 1, 'tail ALL', tailGr);
