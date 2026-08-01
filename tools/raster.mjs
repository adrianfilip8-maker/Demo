/* Offline software rasteriser for the architecture only.
 *
 * The GPU harness is behind a multi-agent queue, and this answers a narrower question that
 * does not need it: is the geometry where I think it is? Flat lambert, no textures, no toon
 * ramp, no post — so it says nothing about colour or banding, but silhouettes, recesses and
 * passages read exactly as built. Backfaces are drawn in magenta: any magenta pixel is a
 * surface the camera should not be able to see.
 */
import * as THREE from 'three';
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

const W = 800, H = 450;
const LIGHT = new THREE.Vector3(-0.62, 0.55, 0.56).normalize();

function writePNG(file, w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  let T = null;
  function crc32(buf) {
    if (!T) { T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } }
    let c = -1; for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 255] ^ (c >>> 8); return c ^ -1;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const { A } = await buildLevel();
A.root.updateMatrixWorld(true);

const shots = process.argv.slice(2).length ? process.argv.slice(2) : ['temple', 'dunes'];
for (const nm of shots) {
  const s = SHOTS[nm]; if (!s) { console.log(`unknown shot ${nm}`); continue; }
  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 600);
  cam.position.fromArray(s.pos); cam.lookAt(new THREE.Vector3().fromArray(s.target));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

  const zb = new Float32Array(W * H).fill(Infinity);
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { rgb[i*3] = 24; rgb[i*3+1] = 28; rgb[i*3+2] = 40; }   // sky

  const a = new THREE.Vector4(), b = new THREE.Vector4(), c = new THREE.Vector4();
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  let drawn = 0, backPix = 0;
  const owner = new Int32Array(W * H).fill(-1);
  const meshNames = [];

  const project = (v, out) => {
    out.set(v.x, v.y, v.z, 1).applyMatrix4(VP);
    if (out.w <= 1e-4) return false;
    out.x = (out.x / out.w * 0.5 + 0.5) * W;
    out.y = (1 - (out.y / out.w * 0.5 + 0.5)) * H;
    out.z = out.w;
    return true;
  };

  A.root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    const meshId = meshNames.push(o.name) - 1;
    const pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i+1) : i+1, i2 = idx ? idx.getX(i+2) : i+2;
        p0.fromBufferAttribute(pos, i0).applyMatrix4(m);
        p1.fromBufferAttribute(pos, i1).applyMatrix4(m);
        p2.fromBufferAttribute(pos, i2).applyMatrix4(m);
        if (!project(p0, a) || !project(p1, b) || !project(p2, c)) continue;
        const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
        const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
        if (minX > maxX || minY > maxY) continue;
        const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
        if (Math.abs(area) < 1e-9) continue;
        e1.subVectors(p1, p0); e2.subVectors(p2, p0); nrm.crossVectors(e1, e2).normalize();
        const toCam = p0.clone().sub(cam.position);
        const facing = nrm.dot(toCam) < 0;
        const nd = Math.max(0, nrm.dot(LIGHT));
        // Deliberately un-toned: a linear ramp so a normal gradient is visible as a gradient.
        const l = 0.20 + 0.80 * nd;
        let R, G, B;
        if (facing) { R = 232 * l; G = 196 * l; B = 150 * l; }
        else { R = 255; G = 0; B = 220; }                      // backface: should never show
        const inv = 1 / area;
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          let w0 = ((b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y)) * inv;
          let w1 = ((px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = 1 / (w2 / a.z + w1 / b.z + w0 / c.z);
          const k = y * W + x;
          if (z >= zb[k] || z <= 0) continue;
          zb[k] = z;
          owner[k] = facing ? -1 : meshId;
          rgb[k*3] = R; rgb[k*3+1] = G; rgb[k*3+2] = B;
        }
        drawn++;
      }
    }
  });
  const tally = new Map();
  for (let k = 0; k < W * H; k++) if (owner[k] >= 0) { backPix++; const nn = meshNames[owner[k]]; tally.set(nn, (tally.get(nn)||0)+1); }
  const top = [...tally.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  writePNG(`/home/user/Demo/shots/_scratch/geo-${nm}.png`, W, H, rgb);
  console.log(`${nm.padEnd(10)} ${drawn} tris, backface px ${backPix} (${(backPix/(W*H)*100).toFixed(2)}%)`);
  for (const [k, v] of top) console.log(`             ${String(v).padStart(6)}  ${k}`);
}
