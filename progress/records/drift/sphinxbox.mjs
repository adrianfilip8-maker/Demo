/**
 * Sphinx-avenue ROI for `dunes` by PROJECTION, not by colour and not by raycast.
 *
 * Positions come from Props.js's own layout constants (sphinxX 7, sphinxZ [40,46.3,...,84]),
 * so membership is decided by where the statues are placed in the world. §104.2 is the reason
 * it cannot be decided by hue: "hue and saturation cannot separate turquoise statue from dusk
 * sky over blue-grey sand — they share both axes."
 *
 * SCOPE — the transforms between this and the rendered frame (§11's rule: name the suffix I
 * did NOT implement):
 *   - NO OCCLUSION TEST and NO SILHOUETTE. This is the projected axis-aligned bounding box of
 *     each statue's volume, so it necessarily includes background *between* and *around* the
 *     animals — dune, sky, plinth. It is an upper bound on the sphinx population, not the
 *     population. That is why the mask overlay is written and must be looked at, and why the
 *     verdict below is taken on the DIFFERENCE between arms inside the box rather than on an
 *     absolute hue: whatever background the box admits is common to every arm and cancels.
 *   - no ink hull, no bloom bleed, no PostFX widening.
 *   - camera matches applyShot: fov, pos, lookAt(target), up (0,1,0), then rotateZ(roll°).
 */
import * as THREE from 'three';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const DIR = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift';
const W = 1280, H = 720;
const SX = 7, SZ = [40, 46.3, 52.6, 58.9, 65.2, 71.5, 77.8, 84];
/* Half-extents of one avenue animal incl. its pedestal course, from Props' own numbers. */
const HX = 1.35, HZ = 2.1, Y0 = 0.0, Y1 = 3.9;

const s = SHOTS.dunes;
const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 3000);
cam.position.fromArray(s.pos);
cam.lookAt(new THREE.Vector3(...s.target));
if (s.roll) cam.rotateZ((s.roll * Math.PI) / 180);
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

const mask = new Uint8Array(W * H);
const v = new THREE.Vector3();
let boxes = 0;
for (const sx of [-1, 1]) for (const z of SZ) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, anyFront = false;
  for (const dx of [-HX, HX]) for (const dy of [Y0, Y1]) for (const dz of [-HZ, HZ]) {
    v.set(sx * SX + dx, dy, z + dz);
    const local = v.clone().applyMatrix4(cam.matrixWorldInverse);
    if (local.z >= -0.05) continue;            // behind the lens — a projected point there is meaningless
    anyFront = true;
    v.project(cam);
    x0 = Math.min(x0, (v.x * 0.5 + 0.5) * W); x1 = Math.max(x1, (v.x * 0.5 + 0.5) * W);
    y0 = Math.min(y0, (-v.y * 0.5 + 0.5) * H); y1 = Math.max(y1, (-v.y * 0.5 + 0.5) * H);
  }
  if (!anyFront) continue;
  boxes++;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) mask[y * W + x] = 1;
}
const n = mask.reduce((a, b) => a + b, 0);
console.log(`sphinx boxes in front of the lens: ${boxes}/16   mask ${n} px (${(100 * n / (W * H)).toFixed(1)}% of frame)`);

/* Overlay so "this ROI contains the sphinxes" is checkable rather than asserted. */
const arms = process.argv.slice(2);
if (arms.length) {
  const base = readPNG(`${DIR}/frames/dunes-${arms[0]}.png`);
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = px(base, x, y), i = (y * W + x) * 3, m = mask[y * W + x];
    out[i] = m ? Math.min(255, r + 90) : r >> 1; out[i + 1] = m ? g : g >> 1; out[i + 2] = m ? b : b >> 1;
  }
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; out.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const crcT = [...Array(256)].map((_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = ~0; for (const q of b) c = crcT[(c ^ q) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(`${DIR}/sphinx-roi-overlay.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log('wrote sphinx-roi-overlay.png — LOOK AT IT before quoting any number below');

  const hue = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; };
  const medn = (a) => { const q = [...a].sort((p, r) => p - r); return q[q.length >> 1]; };
  console.log('\narm          hueP50  satP50   mean b-r   mean L');
  for (const arm of arms) {
    let im; try { im = readPNG(`${DIR}/frames/dunes-${arm}.png`); } catch { continue; }
    const hs = [], ss = []; let bmr = 0, L = 0, c = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const [r, g, b] = px(im, x, y);
      hs.push(hue(r, g, b)); const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      ss.push(mx ? (mx - mn) / mx : 0); bmr += (b - r) / 255; L += 0.2126 * r + 0.7152 * g + 0.0722 * b; c++;
    }
    console.log(`${arm.padEnd(12)} ${medn(hs).toFixed(0).padStart(5)}   ${medn(ss).toFixed(3)}   ${(bmr / c >= 0 ? '+' : '') + (bmr / c).toFixed(4)}    ${(L / c).toFixed(1)}`);
  }
}
