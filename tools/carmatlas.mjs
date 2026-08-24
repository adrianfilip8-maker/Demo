#!/usr/bin/env node
/**
 * carmatlas.mjs — which texels each Carmelita mesh actually samples, without a renderer.
 *
 * §698 corrected the head/body atlas split by reading the Godot importer sidecar
 * (`Carmelita_Animations7.fbx.import`) instead of guessing from node names, and
 * `tests/carmguard.test.mjs` asserts that split mesh by mesh. **Neither can see the failure they
 * guard against.** A wrong split is a fact about pixels — a chest wearing face texels, or a face
 * wearing the chest's — and every structural assertion in the suite passes either way. That is
 * the §699 shape: a claim that is true of the data structure and silent about the picture.
 *
 * A game frame settles it, but a frame costs the capture lock, a browser and a full level boot.
 * This settles the same question offline in a second: for every skinned mesh it rasterises the
 * mesh's OWN UV triangles into the atlas `MATERIAL_ATLAS` assigns it, so each panel shows exactly
 * the texels that group reads. Uncovered atlas stays dark, so a mesh landing in empty space is
 * visible rather than inferred.
 *
 * Read the output as two claims:
 *   body panel — should be the uniform: navy coat and trousers, red collar trim, gold gauntlets,
 *                orange fur, brown boots, the badge. `BustRetopo` is the navy chest piece, and it
 *                being HERE rather than on the head panel is the correction §698 made.
 *   head panel — should be hair, irises, eyeshine, scrunchy. Nothing else.
 *
 * A swap shows instantly: the chest islands would land on hair, or the irises on a boot.
 *
 *   node tools/carmatlas.mjs            # writes shots/carm-atlas-{body,head}.png
 *
 * This reads only committed assets and never fetches. Provenance and licence status for the two
 * albedos: `public/assets/sly-anim/PROVENANCE.md`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { atlasOf } from '../src/ai/CarmelitaGuard.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const P = path.join(ROOT, 'public/assets/sly-anim/');
const atlas = [PNG.sync.read(readFileSync(path.join(P, 'carmelita-body.png'))),
               PNG.sync.read(readFileSync(path.join(P, 'carmelita-head.png')))];
const buf = readFileSync(path.join(P, 'carmelita-guard.glb'));
const gltf = await new Promise((r, j) => new GLTFLoader().parse(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', r, j));

const S = 900;                                  // output size per panel
const out = [new PNG({ width: S, height: S }), new PNG({ width: S, height: S })];
for (const o of out) o.data.fill(20);           // dark ground, so uncovered atlas is obvious

const meshes = [];
gltf.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });

function tri(dst, src, gi, uv, a, b, c) {
  const pts = [a, b, c].map((i) => [uv.getX(i), uv.getY(i)]);
  const xs = pts.map(p => p[0] * (S - 1)), ys = pts.map(p => p[1] * (S - 1));
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(S - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(S - 1, Math.ceil(Math.max(...ys)));
  const d = (xs[1]-xs[0])*(ys[2]-ys[0]) - (xs[2]-xs[0])*(ys[1]-ys[0]);
  if (Math.abs(d) < 1e-9) return;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const w0 = ((xs[1]-x)*(ys[2]-y) - (xs[2]-x)*(ys[1]-y)) / d;
    const w1 = ((xs[2]-x)*(ys[0]-y) - (xs[0]-x)*(ys[2]-y)) / d;
    const w2 = 1 - w0 - w1;
    if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue;
    const u = w0*pts[0][0] + w1*pts[1][0] + w2*pts[2][0];
    const v = w0*pts[0][1] + w1*pts[1][1] + w2*pts[2][1];
    const sx = Math.min(src.width-1, Math.max(0, Math.round(u*(src.width-1))));
    const sy = Math.min(src.height-1, Math.max(0, Math.round(v*(src.height-1))));
    const si = (src.width*sy + sx) << 2, di = (S*y + x) << 2;
    dst.data[di] = src.data[si]; dst.data[di+1] = src.data[si+1];
    dst.data[di+2] = src.data[si+2]; dst.data[di+3] = 255;
  }
}
const cover = [0, 0];
for (const m of meshes) {
  const gi = atlasOf(m.material), uv = m.geometry.getAttribute('uv'), idx = m.geometry.index;
  if (!uv) continue;
  const n = idx ? idx.count : uv.count;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = idx?idx.getX(t):t, b = idx?idx.getX(t+1):t+1, c = idx?idx.getX(t+2):t+2;
    tri(out[gi], atlas[gi], gi, uv, a, b, c); cover[gi]++;
  }
}
writeFileSync(path.join(ROOT,'shots/carm-atlas-body.png'), PNG.sync.write(out[0]));
writeFileSync(path.join(ROOT,'shots/carm-atlas-head.png'), PNG.sync.write(out[1]));
console.log('body panel: triangles rasterised', cover[0], '-> shots/carm-atlas-body.png');
console.log('head panel: triangles rasterised', cover[1], '-> shots/carm-atlas-head.png');
