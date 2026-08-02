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
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

const W = 800, H = 450;
const OUT = '/home/user/Demo/progress/frames';
mkdirSync(OUT, { recursive: true });
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

const WITH_PROPS = !process.argv.includes('--noprops');
const { root } = await buildLevel({ withProps: WITH_PROPS });
root.updateMatrixWorld(true);

const shots = process.argv.slice(2).length ? process.argv.slice(2) : ['temple', 'dunes'];
for (const nm of shots) {
  const s = SHOTS[nm]; if (!s) { console.log(`unknown shot ${nm}`); continue; }
  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 600);
  cam.position.fromArray(s.pos); cam.lookAt(new THREE.Vector3().fromArray(s.target));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

  /* Two depth buffers, because the question is about *culling*, not about winding.
   *
   * Counting "the frontmost triangle at this pixel is wound away from me" answers the wrong
   * question twice over. Coincident two-sided art — the sand drifts and the star ceiling, which
   * are deliberately built as a surface plus a reversed copy — has a backface at every pixel by
   * construction, and whichever copy happens to be rasterised first wins the tie. That scored
   * `guard` at 6.38%, entirely on one sand drift that is correctly modelled.
   *
   * With FrontSide materials the GPU never draws a backface at all, so a backface cannot
   * occlude anything. What actually goes wrong on screen is a pixel where the nearest *back*
   * face is measurably nearer than the nearest *front* face: there the camera is inside an open
   * shell and sees its far interior wall, or sees straight through it to the sky. So: nearest
   * front depth and nearest back depth, flagged only where back leads front by more than a
   * tolerance. Coincident copies fall inside the tolerance and drop out on their own. */
  const zb = new Float32Array(W * H).fill(Infinity);      // nearest FRONT face
  const zbk = new Float32Array(W * H).fill(Infinity);     // nearest BACK face
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { rgb[i*3] = 24; rgb[i*3+1] = 28; rgb[i*3+2] = 40; }   // sky

  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  let drawn = 0, backPix = 0;
  const owner = new Int32Array(W * H).fill(-1);
  const meshNames = [];

  /* Clip space, then near-plane clip, THEN project.
   *
   * The first version of this skipped any triangle with a vertex behind the eye. That is not
   * a conservative simplification, it is the exact thing that breaks the backface test: when
   * the camera is close to a surface, the triangles it drops are the *near, occluding, front*
   * faces, and the far inside wall of the same object is left to win the depth test and paint
   * itself magenta. Measured against a brute-force ray cast, 95% of `combat`'s reported
   * backface pixels and 80% of `traversal`'s were this artifact — the tool was inventing the
   * defect it exists to find. Sutherland-Hodgman against w >= near, fan-triangulated. */
  const NEAR = cam.near;
  const clipNear = (poly) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length];
      const ain = A.w >= NEAR, bin = B.w >= NEAR;
      if (ain) out.push(A);
      if (ain !== bin) {
        const t = (NEAR - A.w) / (B.w - A.w);
        out.push(new THREE.Vector4(
          A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t,
          A.z + (B.z - A.z) * t, A.w + (B.w - A.w) * t));
      }
    }
    return out;
  };
  const toScreen = (v) => new THREE.Vector3(
    (v.x / v.w * 0.5 + 0.5) * W, (1 - (v.y / v.w * 0.5 + 0.5)) * H, v.w);

  root.traverse((o) => {
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

        // Facing and shading come from the world-space triangle, so clipping can't disturb them.
        e1.subVectors(p1, p0); e2.subVectors(p2, p0); nrm.crossVectors(e1, e2).normalize();
        const facing = nrm.dot(p0.clone().sub(cam.position)) < 0;
        const nd = Math.max(0, nrm.dot(LIGHT));
        // Deliberately un-toned: a linear ramp so a normal gradient is visible as a gradient.
        const l = 0.20 + 0.80 * nd;
        let R, G, B;
        if (facing) { R = 232 * l; G = 196 * l; B = 150 * l; }
        else { R = 255; G = 0; B = 220; }                      // backface: should never show

        const poly = clipNear([p0, p1, p2].map((v) =>
          new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(VP)));
        if (poly.length < 3) continue;
        const S = poly.map(toScreen);
        for (let f = 1; f + 1 < S.length; f++) {
          const a = S[0], b = S[f], c = S[f + 1];
          const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
          const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
          const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
          const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
          if (minX > maxX || minY > maxY) continue;
          const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
          if (Math.abs(area) < 1e-9) continue;
          const inv = 1 / area;
          for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y)) * inv;
            const w1 = ((px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y)) * inv;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = 1 / (w2 / a.z + w1 / b.z + w0 / c.z);
            const k = y * W + x;
            if (z <= 0) continue;
            if (facing) {
              if (z >= zb[k]) continue;
              zb[k] = z;
              rgb[k*3] = R; rgb[k*3+1] = G; rgb[k*3+2] = B;
            } else {
              if (z >= zbk[k]) continue;
              zbk[k] = z;
              owner[k] = meshId;
            }
          }
        }
        drawn++;
      }
    }
  });
  const tally = new Map();
  for (let k = 0; k < W * H; k++) {
    if (owner[k] < 0) continue;
    // Tolerance grows with distance: 2 cm plus 0.4% of range, comfortably over the jitter
    // between a drift and its reversed twin, well under any real shell's wall-to-wall depth.
    const tol = 0.02 + 0.004 * zbk[k];
    if (zbk[k] >= zb[k] - tol) continue;
    backPix++;
    const nn = meshNames[owner[k]];
    tally.set(nn, (tally.get(nn)||0)+1);
    rgb[k*3] = 255; rgb[k*3+1] = 0; rgb[k*3+2] = 220;
  }
  const top = [...tally.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  // progress/frames, not shots/_scratch: the latter is gitignored and this container rewinds.
  writePNG(`${OUT}/geo-${nm}.png`, W, H, rgb);
  console.log(`${nm.padEnd(10)} ${drawn} tris, backface px ${backPix} (${(backPix/(W*H)*100).toFixed(2)}%)`);
  for (const [k, v] of top) console.log(`             ${String(v).padStart(6)}  ${k}`);
}
