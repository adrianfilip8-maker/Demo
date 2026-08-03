/**
 * Per-pixel material mask for a canonical shot, from a headless Architecture build.
 *
 * SCOPE — the transforms between this and the rendered frame, i.e. what this does NOT do:
 *   - builds Architecture ONLY: no Props, no Terrain, no Vegetation, no character, no FX.
 *     A pixel this tool assigns to a material may in the real frame be covered by any of
 *     those. Erode the mask and use robust stats; do not trust per-pixel counts.
 *   - no lighting, no post: it answers "which architecture material owns this pixel", nothing
 *     about its colour.
 *   - camera matches applyShot: fov, pos, lookAt(target) with up (0,1,0), then rotateZ(roll°).
 *     raster.mjs omits roll; this must not, because the mask is compared per-pixel to frames.
 *
 * usage: node matmask.mjs <shot> <W> <H> <out.bin> [overlay.png]
 *   out.bin: W*H uint8 of material index + a JSON sidecar out.bin.json listing materials.
 */
import * as THREE from 'three';
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';

const [shotName, Ws, Hs, outBin, overlayPng] = process.argv.slice(2);
const W = parseInt(Ws, 10), H = parseInt(Hs, 10);
const s = SHOTS[shotName];
if (!s) { console.error('unknown shot'); process.exit(1); }

const { A } = await buildLevel();
A.root.updateMatrixWorld(true);

const cam = new THREE.PerspectiveCamera(s.fov ?? 50, W / H, 0.1, 600);
cam.position.fromArray(s.pos);
cam.up.set(0, 1, 0);
cam.lookAt(new THREE.Vector3().fromArray(s.target));
if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

const zb = new Float32Array(W * H).fill(Infinity);
const matIdx = new Uint8Array(W * H).fill(255);      // 255 = sky/none
const mats = [];                                      // material.name per index
const matOf = new Map();

const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
const NEAR = cam.near;
const clipNear = (poly) => {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a.w >= NEAR, bin = b.w >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a.w) / (b.w - a.w);
      out.push(new THREE.Vector4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t));
    }
  }
  return out;
};
const toScreen = (v) => [ (v.x / v.w * 0.5 + 0.5) * W, (1 - (v.y / v.w * 0.5 + 0.5)) * H, v.w ];

A.root.traverse((o) => {
  if (!o.isMesh || o.visible === false) return;
  if (o.userData?.slyOutline || o.userData?.isOutlineShell) return;
  const g = o.geometry; if (!g?.attributes?.position) return;
  const mname = o.material?.name || o.name || '?';
  let mi = matOf.get(mname);
  if (mi === undefined) { mi = mats.push(mname) - 1; matOf.set(mname, mi); }
  const pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
  const m = new THREE.Matrix4();
  for (let ii = 0; ii < inst; ii++) {
    if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      p0.fromBufferAttribute(pos, i0).applyMatrix4(m);
      p1.fromBufferAttribute(pos, i1).applyMatrix4(m);
      p2.fromBufferAttribute(pos, i2).applyMatrix4(m);
      const poly = clipNear([p0, p1, p2].map((v) => new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(VP)));
      if (poly.length < 3) continue;
      const S = poly.map(toScreen);
      for (let f = 1; f + 1 < S.length; f++) {
        const a = S[0], b = S[f], c = S[f + 1];
        const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
        const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
        const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        if (Math.abs(d) < 1e-9) continue;
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / d;
            const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / d;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = 1 / (w0 / a[2] + w1 / b[2] + w2 / c[2]);   // perspective-correct view depth
            const k = y * W + x;
            if (z < zb[k]) { zb[k] = z; matIdx[k] = mi; }
          }
        }
      }
    }
  }
});

writeFileSync(outBin, Buffer.from(matIdx));
const counts = {};
for (let i = 0; i < W * H; i++) { const mi = matIdx[i]; const nme = mi === 255 ? '(none)' : mats[mi]; counts[nme] = (counts[nme] || 0) + 1; }
writeFileSync(outBin + '.json', JSON.stringify({ shot: shotName, W, H, mats, counts }, null, 1));
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 14);
for (const [k, v] of top) console.log(`${(100 * v / (W * H)).toFixed(2).padStart(6)}%  ${k}`);

if (overlayPng) {
  // hash material index to a colour for a sanity look
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const mi = matIdx[i];
    if (mi === 255) { rgb[i * 3] = 12; rgb[i * 3 + 1] = 14; rgb[i * 3 + 2] = 24; continue; }
    let hsh = (mi + 1) * 2654435761 >>> 0;
    rgb[i * 3] = 60 + (hsh & 0x7f); rgb[i * 3 + 1] = 60 + ((hsh >> 7) & 0x7f); rgb[i * 3 + 2] = 60 + ((hsh >> 14) & 0x7f);
  }
  const stride = W * 3, raw = Buffer.alloc(H * (stride + 1));
  for (let y = 0; y < H; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(overlayPng, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
  console.log('overlay:', overlayPng);
}
