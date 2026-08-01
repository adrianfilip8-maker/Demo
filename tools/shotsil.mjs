/**
 * Per-shot silhouette harness. For every canonical shot it works out which side of Sly that
 * camera actually sees and how many pixels tall he is in it, then renders:
 *   <shot>-sil.png    big black-on-white silhouette from that exact view   (§7.3 test)
 *   <shot>-shade.png  same view, 3-band cel shade, so shapes can be identified
 *   <shot>-tiny.png   the real on-screen pixel size, ×7 nearest-neighbour for inspection
 *
 * No browser, no GPU: builds SlyModel against a stub engine, samples the clip the way
 * Animation.freezePose() does (including the cane aim, which lives outside the pose buffer),
 * skins on the CPU and scan-converts.
 *
 *   node tools/shotsil.mjs <outdir> [shot ...]
 *
 * **The feet here are NOT the feet the renderer draws.** `freezePose()` also sets `_ikW = 1`
 * for every non-airborne clip, so at runtime `Rig.footIK()` re-solves both legs and re-pitches
 * both ankles before anything is drawn. This tool does not run it — deliberately, because it
 * renders the character standalone with no ground under him, and a stub plane at y=0 would be
 * simply wrong for the poses staged on a ledge (`perch_idle`/`hero`) or a rail. So everything
 * from the knee down is the authored clip pose: read boot angle, boot height and ground contact
 * from `tools/footall.mjs` instead, which does drive the real `footIK`. Assuming otherwise is
 * what falsified commit 5a1de96, and it is the same failure family as `charview`'s
 * "in frame is not visible" — a tool that is right about what it measures being read as
 * authority over something adjacent that it never touched.
 *
 * **What else it cannot tell you.** No level geometry, so nothing here can be occluded by a
 * wall; use `charvis.mjs` for that. The silhouette is the union of body and cane only. And a
 * pure-black silhouette cannot test the mask, which is a colour feature that does not break the
 * outline — the `-shade.png` is the artefact for that half of the §7.3 condition.
 */
import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const OUT = process.argv[2] || './shotsil';
mkdirSync(OUT, { recursive: true });
const ONLY = process.argv.slice(3);

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};

const { SlyModel, TUNE } = await import('../src/player/SlyModel.js');
const { CLIPS, CLIP_NAMES, MISSING, sampleInto, sampleCane } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const { SHOTS } = await import('../src/core/Shots.js');

const sly = new SlyModel(engine);
await sly.init();
if (!sly.mesh) { console.error('BUILD FAILED', warnings); process.exit(1); }
console.log(`built: ${sly.triangles} tris body + ${sly.cane?.triangles} cane · clips ${CLIP_NAMES.length} · missing [${MISSING.join(',')}]`);
if (warnings.length) console.log('warnings:', warnings);

const geo = sly.mesh.geometry;
const caneBaseQ = sly._canePivot ? sly._canePivot.quaternion.clone() : null;
const poseBuf = new PoseBuffer(sly.boneNames);

function applyClip(name) {
  const clip = CLIPS[name];
  if (!clip) { console.log(`  !! no clip ${name}`); return false; }
  poseBuf.clear();
  sampleInto(clip, clip.hold ?? 0, poseBuf, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n];
    if (!b) continue;
    if (poseBuf.w[n] > 0) b.quaternion.copy(poseBuf.q[n]); else b.quaternion.identity();
    if (poseBuf.sw[n] > 0) b.scale.copy(poseBuf.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + poseBuf.pos.x, base.y + poseBuf.pos.y, base.z + poseBuf.pos.z);
  if (caneBaseQ) {
    const d = new THREE.Quaternion();
    if (sampleCane(clip, clip.hold ?? 0, d)) sly._canePivot.quaternion.copy(d).multiply(caneBaseQ);
    else sly._canePivot.quaternion.copy(caneBaseQ);
  }
  sly.root.updateMatrixWorld(true);
  sly.skeleton.update();
  return true;
}

/* ---- CPU skinning ------------------------------------------------------- */
const _sv = new THREE.Vector3(), _st = new THREE.Vector3(), _sm = new THREE.Matrix4();
function skin() {
  const g = sly.mesh.geometry;
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = sly.mesh.skeleton.bones, inv = sly.mesh.skeleton.boneInverses;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _st.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w === 0) continue;
      const b = si.getComponent(i, k);
      _sm.multiplyMatrices(bones[b].matrixWorld, inv[b]);
      _sv.fromBufferAttribute(pos, i).applyMatrix4(_sm);
      _st.addScaledVector(_sv, w);
    }
    out[i * 3] = _st.x; out[i * 3 + 1] = _st.y; out[i * 3 + 2] = _st.z;
  }
  return out;
}

const matCol = [];
const DBG = process.env.EYEDBG ? { 7: 0xff00ff, 6: 0x00ff00, 4: 0xff8800 } : null;
for (const g of geo.groups) {
  const hex = DBG && DBG[g.materialIndex] !== undefined ? DBG[g.materialIndex]
    : sly.mesh.material[g.materialIndex].color.getHex();
  matCol.push({ s: g.start, e: g.start + g.count, c: new THREE.Color(hex) });
}
const colOfIdxRun = (k) => (matCol.find((r) => k >= r.s && k < r.e)?.c) || new THREE.Color(1, 0, 1);

function buildTris() {
  const tris = [];
  const bodyV = skin();
  const bidx = geo.index.array;
  for (let i = 0; i < bidx.length; i += 3) tris.push([bidx[i], bidx[i + 1], bidx[i + 2], bodyV, colOfIdxRun(i)]);
  if (sly.cane?.mesh) {
    const cg = sly.cane.mesh.geometry;
    sly.cane.mesh.updateMatrixWorld(true);
    const cp = cg.attributes.position;
    const cv = new Float32Array(cp.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < cp.count; i++) {
      v.fromBufferAttribute(cp, i).applyMatrix4(sly.cane.mesh.matrixWorld);
      cv[i * 3] = v.x; cv[i * 3 + 1] = v.y; cv[i * 3 + 2] = v.z;
    }
    const ci = cg.index.array;
    const goldC = new THREE.Color(sly.cane.mesh.material[0].color.getHex());
    for (let i = 0; i < ci.length; i += 3) tris.push([ci[i], ci[i + 1], ci[i + 2], cv, goldC]);
  }
  return { tris, bodyV };
}

/* ---- rasteriser --------------------------------------------------------- */
const KEY = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
/**
 * `focus` (a Set of *body* vertex indices, or null) selects what the framing is fitted to
 * without changing what is drawn. Everything still rasterises — that is the point when the
 * question is "does the cap separate from the ears", because the answer depends on the head
 * being drawn together with whatever overlaps it.
 */
function render(tris, bodyV, yaw, elev, W, H, { shade = false, focus = null } = {}) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ce = Math.cos(elev), se = Math.sin(elev);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const verts = new Map();
  const key = (arr, i) => (arr === bodyV ? i : i + 1e7);
  for (const [a, b, c, arr] of tris) {
    for (const i of [a, b, c]) {
      const k = key(arr, i);
      if (verts.has(k)) continue;
      const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
      const X = x * cy + z * sy, z1 = -x * sy + z * cy;
      const Y = y * ce - z1 * se, Z = y * se + z1 * ce;   // pitch down onto the subject
      verts.set(k, [X, Y, Z]);
      if (focus && !(arr === bodyV && focus.has(i))) continue;
      if (X < minX) minX = X; if (X > maxX) maxX = X;
      if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
    }
  }
  const cx = (minX + maxX) / 2, cyy = (minY + maxY) / 2;
  const s = Math.min(W / ((maxX - minX) * 1.10), H / ((maxY - minY) * 1.06));
  const toPx = ([X, Y, Z]) => [(X - cx) * s + W / 2, H / 2 - (Y - cyy) * s, Z];

  const buf = new Uint8Array(W * H * 3).fill(255);
  const depth = new Float32Array(W * H).fill(-1e9);
  const col = geo.attributes.color;
  const _n3 = new THREE.Vector3();
  for (const [a, b, c, arr, mc] of tris) {
    const P = [toPx(verts.get(key(arr, a))), toPx(verts.get(key(arr, b))), toPx(verts.get(key(arr, c)))];
    let R = 18, G = 18, B = 18;
    if (shade) {
      const p0 = verts.get(key(arr, a)), p1 = verts.get(key(arr, b)), p2 = verts.get(key(arr, c));
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      _n3.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx).normalize();
      const nd = _n3.dot(KEY) * 0.5 + 0.5;
      const band = nd < 0.42 ? 0.34 : nd < 0.60 ? 0.68 : 1.0;
      const vc = arr === bodyV ? [col.getX(a), col.getY(a), col.getZ(a)] : [1, 1, 1];
      R = Math.round(Math.min(1, mc.r * vc[0] * band) * 255);
      G = Math.round(Math.min(1, mc.g * vc[1] * band) * 255);
      B = Math.round(Math.min(1, mc.b * vc[2] * band) * 255);
    }
    const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const d = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const w0 = ((P[1][0] - x) * (P[2][1] - y) - (P[2][0] - x) * (P[1][1] - y)) / d;
        const w1 = ((P[2][0] - x) * (P[0][1] - y) - (P[0][0] - x) * (P[2][1] - y)) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2];
        const o = y * W + x;
        if (z <= depth[o]) continue;
        depth[o] = z;
        buf[o * 3] = R; buf[o * 3 + 1] = G; buf[o * 3 + 2] = B;
      }
    }
  }
  return { buf, W, H };
}

function magnify({ buf, W, H }, k) {
  const W2 = W * k, H2 = H * k, out = new Uint8Array(W2 * H2 * 3);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const so = (Math.floor(y / k) * W + Math.floor(x / k)) * 3, o = (y * W2 + x) * 3;
    out[o] = buf[so]; out[o + 1] = buf[so + 1]; out[o + 2] = buf[so + 2];
  }
  return { buf: out, W: W2, H: H2 };
}

function save(name, { buf, W, H }) { writeFileSync(path.join(OUT, name), png(buf, W, H)); }

/* ---- png ---------------------------------------------------------------- */
let TBL = null;
function crc32(b) {
  if (!TBL) { TBL = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TBL[n] = c; } }
  let c = -1; for (let i = 0; i < b.length; i++) c = TBL[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}
function png(rgb, w, h) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/* ---- proportion report -------------------------------------------------- */
function proportions(bodyV) {
  const g2 = sly.mesh.geometry;
  const si = g2.attributes.skinIndex, sw = g2.attributes.skinWeight;
  const bi = {}; sly.boneNames.forEach((n, i) => { bi[n] = i; });
  const HEADB = new Set(['head', 'jaw', 'capBrim', 'earL', 'earR', 'browL', 'browR'].map((n) => bi[n]));
  const TAILB = new Set(['tailA', 'tailB', 'tailC', 'tailD'].map((n) => bi[n]));
  const dominant = (i) => { let b = -1, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = si.getComponent(i, k); } } return b; };
  let headMax = -1e9, chin = 1e9, allMin = 1e9, allMax = -1e9, earSpan = 0, tailN = 0, bodyN = 0;
  for (let i = 0; i < g2.attributes.position.count; i++) {
    const y = bodyV[i * 3 + 1], x = bodyV[i * 3];
    if (y < allMin) allMin = y; if (y > allMax) allMax = y;
    const d = dominant(i);
    if (HEADB.has(d)) { if (y > headMax) headMax = y; earSpan = Math.max(earSpan, Math.abs(x)); }
    if (TAILB.has(d)) tailN++; else bodyN++;
    if (d === bi.jaw && y < chin) chin = y;
  }
  const T2 = SlyModel.TORSO, H2 = SlyModel.HEAD;
  const total = allMax - allMin;
  const skullH = (H2[H2.length - 1][0] - 1.470) * TUNE.headScale;
  const headH = headMax - chin;
  return {
    total, headH, skullH,
    cranium: Math.max(...H2.map((r) => r[1])) * 2 * TUNE.headScale,
    ear: earSpan * 2,
    chest: Math.max(...T2.map((r) => r[1])) * 2,
    waist: Math.min(...T2.slice(3, 7).map((r) => r[1])) * 2,
    headsWithCap: total / headH, headsSkull: total / skullH,
  };
}

/**
 * Body vertices whose dominant bone is in the head cluster. Used only to *frame* the head crop:
 * the cap fails §7.3 at head scale, not at figure scale, and at 185 px (`hero`) the whole head
 * is 34 px — far too few to tell "cap" from "lump" by eye in the figure silhouette.
 * Skin indices do not change with pose, so this is computed once.
 */
function headFocus() {
  const g2 = sly.mesh.geometry;
  const si = g2.attributes.skinIndex, sw = g2.attributes.skinWeight;
  const bi = {}; sly.boneNames.forEach((n, i) => { bi[n] = i; });
  const HEADB = new Set(['head', 'jaw', 'capBrim', 'earL', 'earR', 'browL', 'browR'].map((n) => bi[n]));
  const out = new Set();
  for (let i = 0; i < g2.attributes.position.count; i++) {
    let b = -1, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = si.getComponent(i, k); } }
    if (HEADB.has(b)) out.add(i);
  }
  return out;
}
const HEADF = headFocus();

/* ---- run ---------------------------------------------------------------- */
/* Output resolution the pixel figures are quoted in. Defaults to the harness default. */
const ROWS = parseInt((process.argv.includes('--rows')
  ? process.argv[process.argv.indexOf('--rows') + 1] : '900'), 10);

let reported = false;
for (const [name, shot] of Object.entries(SHOTS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  if (!shot.player) continue;
  const p = shot.player.pos, c = shot.pos, yawW = shot.player.yaw ?? 0;
  const dx = c[0] - p[0], dz = c[2] - p[2], dy = c[1] - (p[1] + 1.0);
  let phi = Math.atan2(dx, dz) - yawW;
  while (phi > Math.PI) phi -= 2 * Math.PI;
  while (phi < -Math.PI) phi += 2 * Math.PI;
  const elev = Math.atan2(dy, Math.hypot(dx, dz));
  const dist = Math.hypot(dx, dz, dy);
  /* Is the subject actually in front of the lens? This is distance-based, not a projection, so
     without the test a character *behind* the camera yields a perfectly plausible pixel height —
     `guard` reported 483 px for a subject at player-dot-forward -1.93. The identical bug was
     fixed in charview.mjs and never propagated here, which is why the same wrong number appeared
     twice from two tools. ROWS is also no longer 540: nothing in this project captures at that
     resolution (harness 900, critic 720), so every figure was in units nobody uses. */
  const _f = [shot.target[0] - c[0], shot.target[1] - c[1], shot.target[2] - c[2]];
  const _fl = Math.hypot(..._f) || 1;
  const behind = ((p[0] - c[0]) * _f[0] + (p[1] - c[1]) * _f[1] + (p[2] - c[2]) * _f[2]) / _fl <= 0;
  const px = behind
    ? null
    : Math.round(1.93 / dist / (2 * Math.tan((shot.fov ?? 50) * Math.PI / 360)) * ROWS);

  if (!applyClip(shot.player.pose)) continue;
  const { tris, bodyV } = buildTris();

  if (!reported) {
    const P = proportions(bodyV);
    console.log(`\nPROPORTION (pose ${shot.player.pose})`);
    console.log(`  rendered height ${P.total.toFixed(3)} m  (nominal ${TUNE.height})`);
    console.log(`  chin→crown incl. cap ${P.headH.toFixed(3)} ⇒ ${P.headsWithCap.toFixed(2)} heads`);
    console.log(`  skull only           ${P.skullH.toFixed(3)} ⇒ ${P.headsSkull.toFixed(2)} heads`);
    console.log(`  cranium ${P.cranium.toFixed(3)} · ear span ${P.ear.toFixed(3)} · chest ${P.chest.toFixed(3)} · waist ${P.waist.toFixed(3)}`);
    reported = true;
  }

  save(`${name}-sil.png`, render(tris, bodyV, -phi, elev, 300, 400));
  save(`${name}-shade.png`, render(tris, bodyV, -phi, elev, 300, 400, { shade: true }));
  save(`${name}-head.png`, render(tris, bodyV, -phi, elev, 420, 420, { focus: HEADF }));
  save(`${name}-headshade.png`, render(tris, bodyV, -phi, elev, 420, 420, { focus: HEADF, shade: true }));
  if (process.env.BIG) save(`${name}-big.png`, render(tris, bodyV, -phi, elev, 900, 1200, { shade: true }));
  const tw = Math.max(12, Math.round(px * 0.72)), th = Math.max(16, px);
  save(`${name}-tiny.png`, magnify(render(tris, bodyV, -phi, elev, tw, th), 6));
  console.log(`  ${name.padEnd(13)} view ${(phi * 180 / Math.PI).toFixed(0).padStart(5)}°  elev ${(elev * 180 / Math.PI).toFixed(0).padStart(3)}°  ${(px === null ? 'BEHIND' : String(px) + 'px').padStart(7)}  pose ${shot.player.pose}`);
}
console.log('\nwrote', OUT);
