#!/usr/bin/env node
/* glbpeek — read a .glb's JSON chunk and its embedded images without three, a DOM, or the
 * capture lock. Prints node transforms, per-primitive POSITION bounds (straight off the
 * accessor min/max, which glTF requires for POSITION), material factors, and the measured
 * mean of every metallicRoughness / normal image.
 *
 * glTF packs metallicRoughness as G = roughness, B = metalness, so the channel means ARE the
 * authored values for a uniform map — no interpretation needed.
 *
 * usage: node tools/glbpeek.mjs <file.glb>
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readPNG } from './png.mjs';

const file = process.argv[2];
const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
let off = 12, json = null; const chunks = [];
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  else chunks.push(data);
  off += 8 + len + ((4 - (len % 4)) % 4) * 0;
  off += (4 - (len % 4)) % 4 ? 0 : 0;
}
const bin = chunks[0];
const g = json;
console.log(`generator: ${g.asset?.generator}   version ${g.asset?.version}`);
console.log(`extensions used: ${JSON.stringify(g.extensionsUsed || [])}   skins ${g.skins?.length || 0}   animations ${g.animations?.length || 0}`);

/* ---- nodes ---- */
console.log('\n--- nodes ---');
(g.nodes || []).forEach((n, i) => {
  console.log(`  [${i}] ${n.name || ''}  mesh=${n.mesh ?? '-'}  T=${JSON.stringify(n.translation || null)} R=${JSON.stringify(n.rotation || null)} S=${JSON.stringify(n.scale || null)} M=${n.matrix ? 'yes' : '-'}`);
});

/* ---- primitives + POSITION bounds ---- */
console.log('\n--- meshes / primitives ---');
let tris = 0, verts = 0;
const gmin = [Infinity, Infinity, Infinity], gmax = [-Infinity, -Infinity, -Infinity];
(g.meshes || []).forEach((m, mi) => {
  console.log(`  mesh[${mi}] ${m.name || ''}`);
  m.primitives.forEach((p, pi) => {
    const pos = g.accessors[p.attributes.POSITION];
    const idx = p.indices != null ? g.accessors[p.indices] : null;
    tris += idx ? idx.count / 3 : pos.count / 3;
    verts += pos.count;
    for (let k = 0; k < 3; k++) { gmin[k] = Math.min(gmin[k], pos.min[k]); gmax[k] = Math.max(gmax[k], pos.max[k]); }
    console.log(`    prim[${pi}] mat=${p.material} (${g.materials?.[p.material]?.name}) verts=${pos.count} tris=${idx ? idx.count / 3 : pos.count / 3}`
      + `  attrs=[${Object.keys(p.attributes).join(',')}]`);
    console.log(`      POSITION min=[${pos.min.map((v) => v.toFixed(4))}]  max=[${pos.max.map((v) => v.toFixed(4))}]`);
  });
});
console.log(`  TOTAL tris ${tris}  verts ${verts}`);
console.log(`  bbox min=[${gmin.map((v) => v.toFixed(4))}] max=[${gmax.map((v) => v.toFixed(4))}]`);
console.log(`  extent  x ${(gmax[0] - gmin[0]).toFixed(4)}   y ${(gmax[1] - gmin[1]).toFixed(4)}   z ${(gmax[2] - gmin[2]).toFixed(4)}`);

/* ---- materials ---- */
console.log('\n--- materials ---');
(g.materials || []).forEach((m, i) => {
  const p = m.pbrMetallicRoughness || {};
  console.log(`  [${i}] ${m.name}  baseColorFactor=${JSON.stringify(p.baseColorFactor || null)}`
    + ` metallicFactor=${p.metallicFactor ?? '(1 default)'} roughnessFactor=${p.roughnessFactor ?? '(1 default)'}`);
  console.log(`      baseColorTexture=${p.baseColorTexture?.index ?? '-'} metallicRoughnessTexture=${p.metallicRoughnessTexture?.index ?? '-'} normalTexture=${m.normalTexture?.index ?? '-'}`);
});

/* ---- images: measure the channel means ---- */
console.log('\n--- images (measured, not trusted) ---');
const dir = mkdtempSync(path.join(tmpdir(), 'glbpeek-'));
let undecoded = 0;
(g.images || []).forEach((im, i) => {
  const name = im.name || `image${i}`;
  /**
   * A glTF image is EITHER embedded in a bufferView OR referenced by `uri` — the spec allows both
   * and requires exactly one. This read `g.bufferViews[im.bufferView]` unconditionally, so
   * `sly-godot.glb`, whose two albedos are sibling files on disk, killed the whole run with
   * `Cannot read properties of undefined (reading 'byteOffset')` — after printing the nodes,
   * meshes and materials, and before the POSITION slabs that are the point of the tool. A file
   * this cannot read is one image's worth of missing output, not the end of the report.
   */
  let bytes, source;
  if (im.bufferView != null) {
    const bv = g.bufferViews[im.bufferView];
    if (!bv) { console.log(`  [${i}] ${name.padEnd(22)} — bufferView ${im.bufferView} does not exist`); undecoded++; return; }
    bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    source = 'embedded';
  } else if (im.uri && !/^data:/.test(im.uri)) {
    const p = path.resolve(path.dirname(file), decodeURIComponent(im.uri));
    try { bytes = readFileSync(p); } catch (e) {
      console.log(`  [${i}] ${name.padEnd(22)} — uri ${im.uri} not readable: ${e.code || e.message}`); undecoded++; return;
    }
    source = `uri ${im.uri}`;
  } else if (im.uri) {
    bytes = Buffer.from(im.uri.slice(im.uri.indexOf(',') + 1), 'base64');
    source = 'data uri';
  } else { console.log(`  [${i}] ${name.padEnd(22)} — no bufferView and no uri`); undecoded++; return; }

  /* The mimeType is optional for a uri image, so sniff the signature rather than trust the field. */
  const isPNG = bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47;
  const mime = im.mimeType || (isPNG ? 'image/png' : 'unknown');
  if (!isPNG) {
    console.log(`  [${i}] ${name.padEnd(22)} ${mime} ${(bytes.length / 1024).toFixed(0)} KB  (${source}; only PNG is decoded here)`);
    undecoded++; return;
  }
  const f = path.join(dir, `${i}.png`);
  writeFileSync(f, bytes);
  try {
    const p = readPNG(f);
    let r = 0, gg = 0, b = 0, n = 0;
    let rmin = 255, rmax = 0, gmin2 = 255, gmax2 = 0, bmin2 = 255, bmax2 = 0;
    for (let y = 0; y < p.h; y += 4) for (let x = 0; x < p.w; x += 4) {
      const o = (y * p.w + x) * p.ch;
      r += p.data[o]; gg += p.data[o + 1]; b += p.data[o + 2]; n++;
      if (p.data[o] < rmin) rmin = p.data[o]; if (p.data[o] > rmax) rmax = p.data[o];
      if (p.data[o + 1] < gmin2) gmin2 = p.data[o + 1]; if (p.data[o + 1] > gmax2) gmax2 = p.data[o + 1];
      if (p.data[o + 2] < bmin2) bmin2 = p.data[o + 2]; if (p.data[o + 2] > bmax2) bmax2 = p.data[o + 2];
    }
    console.log(`  [${i}] ${name.padEnd(22)} ${p.w}x${p.h} ${(bytes.length / 1024).toFixed(0)} KB`
      + `  ct${p.ct} bd${p.bd}${p.interlace ? ' adam7' : ''}  ${source}`
      + `  mean RGB (${(r / n).toFixed(1)}, ${(gg / n).toFixed(1)}, ${(b / n).toFixed(1)})`
      + `  ranges R[${rmin}-${rmax}] G[${gmin2}-${gmax2}] B[${bmin2}-${bmax2}]`);
    console.log(`        as metalRough: roughness(G) ${(gg / n / 255).toFixed(3)}   metalness(B) ${(b / n / 255).toFixed(3)}`);
  } catch (e) {
    /* Name the image AND the reason on one line, and keep going. The old message was
       `decode failed: bitdepth` — six characters that named neither the depth nor the file. */
    console.log(`  [${i}] ${name.padEnd(22)} ${(bytes.length / 1024).toFixed(0)} KB  ${source}  — UNDECODABLE: ${e.message}`);
    undecoded++;
  }
});
if (undecoded) console.log(`  (${undecoded} of ${(g.images || []).length} image(s) not measured — see above)`);

/* ---- where is the hook? height slabs of the raw POSITION data ---- */
console.log('\n--- hook direction: lateral spread by height slab (raw POSITION, node transform ignored) ---');
const acc = (ai) => {
  const a = g.accessors[ai], bv = g.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const o = base + i * (bv.byteStride || 12);
    out.push([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]);
  }
  return out;
};
/* Accumulated with a loop, and the extremes taken with a reduce, because both `push(...arr)` and
   `Math.min(...arr)` spread through the argument list and throw `RangeError: Maximum call stack
   size exceeded` somewhere north of ~100k elements. Every model peeked at so far has been small
   enough to get away with it; the first character rig with a dense mesh would not be. */
const all = [];
for (const m of g.meshes || []) for (const p of m.primitives) for (const v of acc(p.attributes.POSITION)) all.push(v);
if (!all.length) { console.log('  (no POSITION data)'); process.exit(0); }
let y0 = Infinity, y1 = -Infinity;
for (const v of all) { if (v[1] < y0) y0 = v[1]; if (v[1] > y1) y1 = v[1]; }
const N = 8;
console.log(`  slab            n     x[min..max]  spread      z[min..max]  spread`);
for (let s = N - 1; s >= 0; s--) {
  const lo = y0 + (y1 - y0) * (s / N), hi = y0 + (y1 - y0) * ((s + 1) / N);
  const v = all.filter((p) => p[1] >= lo && p[1] <= hi);
  if (!v.length) { console.log(`  y ${lo.toFixed(2)}..${hi.toFixed(2)}   0   (empty)`); continue; }
  let xa = Infinity, xb = -Infinity, za = Infinity, zb = -Infinity;
  for (const p of v) { if (p[0] < xa) xa = p[0]; if (p[0] > xb) xb = p[0]; if (p[2] < za) za = p[2]; if (p[2] > zb) zb = p[2]; }
  console.log(`  y ${lo.toFixed(2)}..${hi.toFixed(2)} ${String(v.length).padStart(5)}  `
    + `[${xa.toFixed(3)}..${xb.toFixed(3)}] ${(xb - xa).toFixed(3)}   [${za.toFixed(3)}..${zb.toFixed(3)}] ${(zb - za).toFixed(3)}`);
}
