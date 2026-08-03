/**
 * temple2.mjs — enumerate `temple`'s sandHigh components with the backdrop measurements that
 * decide candidate 1's blast radius, and emit crops of the ones that matter.
 *
 * WHY THIS EXISTS (§145.3): candidate 1 (backdrop-conditioned suppression) acts wherever the
 * backdrop is dark and blue. `temple` has TWO components meeting that precondition and only one
 * of them is the disc. The second is therefore candidate 1's entire known interior collateral,
 * and whether it is *artefact* or *legitimate haze* decides whether candidate 1 targets the
 * mechanism or merely a proxy for it. That is a picture question and the frames are on disk.
 *
 * Prints every component with size, mean ΔL, backdrop luma and R/B, sorted by |ΔL|, and writes
 * a 6x crop of each component that meets or nearly meets the precondition.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const D = '/home/user/Demo/shots/fx21';
const OUT = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad';
const A = readPNG(`${D}/temple.base.png`);          // sandHigh present
const B = readPNG(`${D}/temple.no-sandHigh.png`);   // sandHigh removed = the backdrop
const W = A.w, H = A.h;
const L = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];

function writePNG(file, w, h, rgb) {
  const crcT = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const chunk = (type, body) => {
    const b = Buffer.concat([Buffer.from(type), body]);
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    let crc = -1; for (const by of b) crc = crcT[(crc ^ by) & 255] ^ (crc >>> 8);
    const cb = Buffer.alloc(4); cb.writeInt32BE(~crc);
    return Buffer.concat([len, b, cb]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  writeFileSync(file, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
/* side-by-side base | no-sandHigh crop at scale s, so "what would be removed" is visible */
function crop(x0, y0, x1, y1, s, file) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, OW = cw * s * 2 + 4, OH = ch * s;
  const o = Buffer.alloc(OW * OH * 3);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const oi = (y * OW + x) * 3;
    if (x >= cw * s && x < cw * s + 4) { o[oi] = 255; o[oi + 2] = 255; continue; }
    const right = x >= cw * s + 4;
    const sx = x0 + (((right ? x - cw * s - 4 : x) / s) | 0), sy = y0 + ((y / s) | 0);
    const src = right ? B : A, si = (sy * src.w + sx) * src.ch;
    o[oi] = src.data[si]; o[oi + 1] = src.data[si + 1]; o[oi + 2] = src.data[si + 2];
  }
  writePNG(file, OW, OH, o);
  return `${file}  (${cw}x${ch} @${s}x, LEFT=base  RIGHT=no-sandHigh)`;
}

const mask = new Uint8Array(W * H), lift = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) {
  const o = i * A.ch;
  const d = Math.abs(A.data[o] - B.data[o]) + Math.abs(A.data[o+1] - B.data[o+1]) + Math.abs(A.data[o+2] - B.data[o+2]);
  if (d < 4) continue;
  mask[i] = 1; lift[i] = L(A.data, o) - L(B.data, o);
}
const seen = new Uint8Array(W * H), comps = [];
for (let i = 0; i < W * H; i++) {
  if (!mask[i] || seen[i]) continue;
  const st = [i]; seen[i] = 1; const px = [];
  let c = 0, s = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  while (st.length) {
    const j = st.pop(), jx = j % W, jy = (j / W) | 0;
    c++; s += lift[j]; px.push(j);
    if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = jx + dx, ny = jy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (mask[k] && !seen[k]) { seen[k] = 1; st.push(k); }
    }
  }
  if (c < 40) continue;
  let R = 0, G = 0, Bl = 0;
  for (const j of px) { const o = j * B.ch; R += B.data[o]; G += B.data[o+1]; Bl += B.data[o+2]; }
  R /= px.length; G /= px.length; Bl /= px.length;
  const luma = 0.2126*R + 0.7152*G + 0.0722*Bl, rb = R / Math.max(Bl, 1e-6);
  comps.push({ c, mean: s / c, x0, x1, y0, y1, luma, rb, sum: Math.abs(s) });
}
comps.sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean));

const TOTAL = comps.reduce((t, k) => t + k.sum, 0);
console.log(`temple: ${comps.length} components >= 40 px, total |ΔL| ${TOTAL.toFixed(0)}`);
console.log('  #  size    meanΔL  backdrop-luma  R/B    gate    bbox');
comps.forEach((k, i) => {
  const strict = k.luma < 60 && k.rb < 0.5;
  const near = !strict && k.luma < 75 && k.rb < 0.65;
  console.log(`  ${String(i).padStart(2)}  ${String(k.c).padStart(5)}  ${k.mean >= 0 ? '+' : ''}${k.mean.toFixed(2).padStart(6)}  ` +
    `${k.luma.toFixed(1).padStart(12)}  ${k.rb.toFixed(2).padStart(5)}  ${strict ? 'STRICT' : near ? 'near  ' : '  -   '}  ` +
    `(${k.x0},${k.y0})-(${k.x1},${k.y1})`);
});

const strict = comps.filter((k) => k.luma < 60 && k.rb < 0.5);
const near = comps.filter((k) => !(k.luma < 60 && k.rb < 0.5) && k.luma < 75 && k.rb < 0.65);
const share = (set) => 100 * set.reduce((t, k) => t + k.sum, 0) / TOTAL;
console.log(`\nSTRICT gate population: ${strict.length} components, ${share(strict).toFixed(1)}% of temple's total |ΔL|`);
console.log(`NEAR-boundary band:     ${near.length} components, ${share(near).toFixed(1)}%  (what a SMOOTH gate also touches)`);
const disc = strict.slice().sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))[0];
const collateral = strict.filter((k) => k !== disc);
console.log(`\nthe disc: ${disc ? `${disc.c} px, ΔL ${disc.mean.toFixed(2)}, bbox (${disc.x0},${disc.y0})-(${disc.x1},${disc.y1})` : 'none'}`);
console.log(`candidate-1 interior collateral at the STRICT gate: ${collateral.length} component(s), ` +
  `${collateral.reduce((t, k) => t + k.sum, 0).toFixed(0)} |ΔL| = ${share(collateral).toFixed(2)}% of temple's field`);

let n = 0;
for (const k of [...strict, ...near]) {
  const pad = 18;
  console.log('  crop: ' + crop(k.x0 - pad, k.y0 - pad, k.x1 + pad, k.y1 + pad, 4,
    `${OUT}/t2_${n === 0 ? 'disc' : 'c' + n}_${k.c}px.png`));
  n++;
}
