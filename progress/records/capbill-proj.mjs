/**
 * capbill-proj.mjs — OFFLINE projection of cap-bill geometry candidates at the two scored
 * bearings, before any capture is spent. CHARACTER, for PREREG-capbill.md.
 *
 * THE QUESTION (KNOWN_ISSUES §151.4, §153.6): at `sly-closeup`'s 33° bearing the bill
 * foreshortens into the crown and the cap reads as skull; at `combat`'s 45° it reads. capCock
 * (roll) is a measured null; §153.6 diagnosed "a shape change, not a rotation of any kind" —
 * but its evidence covered roll (capCock) and pitch (capTip), both of which move the bill
 * *within* the crown's projection at a near-axis view. A YAW moves the bill's own axis away
 * from the view axis, which neither tested rotation does. This tool settles numerically
 * whether that distinction is real, per candidate, at BOTH bearings.
 *
 * METHOD. Adapted from tools/shotsil.mjs (same stub engine, CPU skinning, scan-convert; its
 * header's caveats all apply — no level, no shader, no ink hull, no PostFX; read for SHAPE).
 * The candidate transform is applied to the BUILT bind geometry inside this tool — src is
 * never edited. The cap vertex set is groups {3 cloth, 4 clothDark, 5 gold} with dominant
 * bone in {head, capBrim} and head-space y >= 1.53 (crown, hem, brim, button — everything
 * `_buildCap` routes through place()). The yaw is applied in HEAD SPACE about the cap pivot
 * (0, 1.640, 0), i.e. exactly what `tilt.premultiply(makeRotationY(a))` in `_buildCap` would
 * produce, including the anisotropic hw/hx shear (headWide applies to x only).
 *
 * MEASUREMENTS, per variant x bearing, on a 420x420 head-focus crop (the -headparts basis the
 * recorded 3.3%/12.2% figures were quoted at):
 *   billOutline%  share of head-outline boundary px owned by the BILL (brim tube only — the
 *                 hem band is separated by dominant bone, unlike PART_COL's lumped clothDark;
 *                 stated because the recorded 3.3% may have lumped them)
 *   billSilPx/cm  the bill's silhouette CONTRIBUTION: figure-mask pixels present with the
 *                 brim tris drawn that vanish with them deleted, same frozen framing; plus
 *                 max horizontal protrusion of that contribution in px and body-cm
 * CONTROLS, because a number that cannot fail is not a measurement (DIGEST "Everyone"):
 *   zero:  nobill twin of base must measure billSil = 0 by construction; billOutline ~ 0
 *   sign:  yaw TOWARD the cameras (+10°, his left — both scored cameras sit on his left,
 *          phi +33.2° and +44.9°) must NOT improve 33°; if it does, the mechanism is wrong
 *   calibration: base at 33.2° should land near the recorded 3.3% bill-outline share
 *                (§ Shots.js 'sly-bill' comment) — same-instrument-family reproduction
 *
 * Bearing convention: phi = atan2(dx,dz) − playerYaw as in shotsil.mjs; POSITIVE phi is his
 * LEFT. CAPYAW candidates are NEGATIVE degrees = bill toward his RIGHT = effective bearing
 * grows at both scored cameras. Elevation per real shot. Poses per real shot (idle_confident
 * at closeup, cane_combo_3 at combat — the combat head is posed, so the effective head-relative
 * bearing there is measured, not assumed).
 *
 *   node capbill-proj.mjs <outdir>
 */
import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const OUT = process.argv[2] || '/tmp/capbill';
mkdirSync(OUT, { recursive: true });

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};

const { SlyModel, TUNE } = await import('../../src/player/SlyModel.js');
const { CLIPS, sampleInto, sampleCane } = await import('../../src/player/Clips.js');
const { PoseBuffer } = await import('../../src/player/Rig.js');
const { SHOTS } = await import('../../src/core/Shots.js');

const sly = new SlyModel(engine);
await sly.init();
if (!sly.mesh) { console.error('BUILD FAILED', warnings); process.exit(1); }

const geo = sly.mesh.geometry;
const caneBaseQ = sly._canePivot ? sly._canePivot.quaternion.clone() : null;
const poseBuf = new PoseBuffer(sly.boneNames);

/* ------------- head-space map (mirrors SlyModel's hy/hx/hw exactly) ------------- */
const S = TUNE.headScale, W = TUNE.headWide;
const HEAD_BASE = 1.396;
// by(HEAD_BASE) = HEAD_BASE + legLift - torsoShrink; do NOT hardcode the cancellation.
const byHB = HEAD_BASE + TUNE.legLift - TUNE.torsoShrink;
const toHead = (x, y, z) => [x / (S * W), HEAD_BASE + (y - byHB) / S, z / S];
const toModel = (xh, yh, zh) => [xh * S * W, byHB + (yh - HEAD_BASE) * S, zh * S];
const PIVOT = [0, 1.640, 0]; // unscaled head space — _buildCap's own pivot

/* ---------------- cap vertex + brim tri identification ------------------- */
const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
const bi = {}; sly.boneNames.forEach((n, i) => { bi[n] = i; });
const dominant = (i) => { let b = -1, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = si.getComponent(i, k); } } return b; };
const groupOf = (() => {
  const runs = geo.groups.map((g) => ({ s: g.start, e: g.start + g.count, m: g.materialIndex }));
  return (idxPos) => runs.find((r) => idxPos >= r.s && idxPos < r.e)?.m ?? -1;
})();
// vertex -> material group via any index-run that references it
const vGroup = new Int16Array(geo.attributes.position.count).fill(-1);
{
  const idx = geo.index.array;
  for (let k = 0; k < idx.length; k++) if (vGroup[idx[k]] === -1) vGroup[idx[k]] = groupOf(k);
}
const pos0 = geo.attributes.position.array.slice(); // pristine bind positions
const capSet = new Set(), brimSet = new Set();
{
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const g = vGroup[i];
    if (g !== 3 && g !== 4 && g !== 5) continue;
    const d = dominant(i);
    if (d !== bi.head && d !== bi.capBrim) continue;
    const [, yh] = toHead(p.getX(i), p.getY(i), p.getZ(i));
    if (yh < 1.53) continue;
    capSet.add(i);
    if (g === 4 && d === bi.capBrim) brimSet.add(i);
  }
}
console.log(`cap verts ${capSet.size} (brim ${brimSet.size}) of ${geo.attributes.position.count}`);

/** Bind-space cap yaw: rotate cap verts about +Y through PIVOT, in head space. deg>0 = his LEFT. */
function applyCapYaw(deg) {
  const p = geo.attributes.position;
  p.array.set(pos0);
  if (deg) {
    const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (const i of capSet) {
      let [xh, yh, zh] = toHead(pos0[i * 3], pos0[i * 3 + 1], pos0[i * 3 + 2]);
      const dx = xh - PIVOT[0], dz = zh - PIVOT[2];
      xh = PIVOT[0] + dx * ca + dz * sa;
      zh = PIVOT[2] - dx * sa + dz * ca;
      const m = toModel(xh, yh, zh);
      p.array[i * 3] = m[0]; p.array[i * 3 + 1] = m[1]; p.array[i * 3 + 2] = m[2];
    }
  }
  p.needsUpdate = true;
}

/* ---------------- pose + CPU skin (from tools/shotsil.mjs) ---------------- */
function applyClip(name) {
  const clip = CLIPS[name];
  if (!clip) throw new Error(`no clip ${name}`);
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
}
const _sv = new THREE.Vector3(), _st = new THREE.Vector3(), _sm = new THREE.Matrix4();
function skin() {
  const g = sly.mesh.geometry;
  const pos = g.attributes.position, si2 = g.attributes.skinIndex, sw2 = g.attributes.skinWeight;
  const bones = sly.mesh.skeleton.bones, inv = sly.mesh.skeleton.boneInverses;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _st.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw2.getComponent(i, k);
      if (w === 0) continue;
      const b = si2.getComponent(i, k);
      _sm.multiplyMatrices(bones[b].matrixWorld, inv[b]);
      _sv.fromBufferAttribute(pos, i).applyMatrix4(_sm);
      _st.addScaledVector(_sv, w);
    }
    out[i * 3] = _st.x; out[i * 3 + 1] = _st.y; out[i * 3 + 2] = _st.z;
  }
  return out;
}

/* tris tagged: [a,b,c, colorKey] where colorKey: 'bill' | material index; cane excluded from
   the head crop question entirely (it never reaches the head rows at these framings). */
function buildTris(dropBill) {
  const tris = [];
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const isBill = brimSet.has(a) || brimSet.has(b) || brimSet.has(c);
    if (dropBill && isBill) continue;
    tris.push([a, b, c, isBill ? 'bill' : groupOf(i)]);
  }
  return tris;
}

/* head focus set — as shotsil.mjs headFocus() */
const HEADB = new Set(['head', 'jaw', 'capBrim', 'earL', 'earR', 'browL', 'browR'].map((n) => bi[n]));
const HEADF = new Set();
for (let i = 0; i < geo.attributes.position.count; i++) if (HEADB.has(dominant(i))) HEADF.add(i);
const JAWV = new Set();
for (let i = 0; i < geo.attributes.position.count; i++) if (dominant(i) === bi.jaw) JAWV.add(i);

/* ---------------- rasteriser (parts colours; bill = pure red) ------------- */
const PART_COL = {
  0: 0xd6d6d6, 1: 0xe8e8e8, 2: 0xb4b4b4, 3: 0x000000, 4: 0x606060, 5: 0xff8c00,
  6: 0x9a9a9a, 7: 0xf4f4f4, 8: 0xb4b4b4, 9: 0xb4b4b4, 10: 0xb4b4b4, bill: 0xff0000,
};
function project(bodyV, yaw, elev) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elev), se = Math.sin(elev);
  const out = new Float32Array(bodyV.length);
  for (let i = 0; i < bodyV.length; i += 3) {
    const x = bodyV[i], y = bodyV[i + 1], z = bodyV[i + 2];
    const X = x * cy + z * sy, z1 = -x * sy + z * cy;
    out[i] = X; out[i + 1] = y * ce - z1 * se; out[i + 2] = y * se + z1 * ce;
  }
  return out;
}
function frameOf(proj, focus, Wpx, Hpx) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const i of focus) {
    const X = proj[i * 3], Y = proj[i * 3 + 1];
    if (X < minX) minX = X; if (X > maxX) maxX = X;
    if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
  }
  const s = Math.min(Wpx / ((maxX - minX) * 1.10), Hpx / ((maxY - minY) * 1.06));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, s };
}
function raster(tris, proj, frame, Wpx, Hpx) {
  const { cx, cy, s } = frame;
  const toPx = (i) => [(proj[i * 3] - cx) * s + Wpx / 2, Hpx / 2 - (proj[i * 3 + 1] - cy) * s, proj[i * 3 + 2]];
  const buf = new Uint8Array(Wpx * Hpx * 3).fill(255);
  const depth = new Float32Array(Wpx * Hpx).fill(-1e9);
  const own = new Int8Array(Wpx * Hpx).fill(-1); // colour key per px: -1 bg
  const keyId = (k) => (k === 'bill' ? 20 : k);
  for (const [a, b, c, k] of tris) {
    const P = [toPx(a), toPx(b), toPx(c)];
    const h = PART_COL[k] ?? 0xff00ff;
    const R = (h >> 16) & 255, G = (h >> 8) & 255, B = h & 255;
    const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])));
    const x1 = Math.min(Wpx - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])));
    const y1 = Math.min(Hpx - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const d = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w0 = ((P[1][0] - x) * (P[2][1] - y) - (P[2][0] - x) * (P[1][1] - y)) / d;
      const w1 = ((P[2][0] - x) * (P[0][1] - y) - (P[0][0] - x) * (P[2][1] - y)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2];
      const o = y * Wpx + x;
      if (z <= depth[o]) continue;
      depth[o] = z;
      buf[o * 3] = R; buf[o * 3 + 1] = G; buf[o * 3 + 2] = B;
      own[o] = keyId(k);
    }
  }
  return { buf, own, W: Wpx, H: Hpx, s };
}

/* ---------------- measurement -------------------------------------------- */
/** Boundary = figure px with a background 4-neighbour, rows above chinRow only. */
function outlineShare(r, chinRow) {
  const { own, W: Wpx, H: Hpx } = r;
  let total = 0, bill = 0, cap = 0;
  for (let y = 0; y < Math.min(chinRow, Hpx); y++) for (let x = 0; x < Wpx; x++) {
    const o = y * Wpx + x;
    if (own[o] < 0) continue;
    const bg = (x === 0 || own[o - 1] < 0) || (x === Wpx - 1 || own[o + 1] < 0)
      || (y === 0 || own[o - Wpx] < 0) || (y === Hpx - 1 || own[o + Wpx] < 0);
    if (!bg) continue;
    total++;
    if (own[o] === 20) bill++;
    if (own[o] === 20 || own[o] === 3 || own[o] === 4 || own[o] === 5) cap++;
  }
  return { total, bill, cap, billPct: 100 * bill / (total || 1), capPct: 100 * cap / (total || 1) };
}
/** Bill's silhouette contribution: px in `withB` figure mask absent from `noB`, same frame. */
function billContribution(withB, noB) {
  const { own: A, W: Wpx, H: Hpx, s } = withB, { own: B } = noB;
  let px = 0, maxRun = 0, rows = 0;
  for (let y = 0; y < Hpx; y++) {
    let run = 0, any = false;
    for (let x = 0; x < Wpx; x++) {
      const o = y * Wpx + x;
      const added = A[o] >= 0 && B[o] < 0;
      if (added) { px++; run++; any = true; if (run > maxRun) maxRun = run; } else run = 0;
    }
    if (any) rows++;
  }
  return { px, rows, maxRunPx: maxRun, maxRunCm: 100 * maxRun / s };
}
function chinRowOf(proj, frame, Hpx, Wpx) {
  let m = -1e9;
  for (const i of JAWV) { const y = Hpx / 2 - (proj[i * 3 + 1] - frame.cy) * frame.s; if (y > m) m = y; }
  return Math.round(m);
}

/* ---------------- png ----------------------------------------------------- */
let TBL = null;
function crc32(b) { if (!TBL) { TBL = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TBL[n] = c; } } let c = -1; for (let i = 0; i < b.length; i++) c = TBL[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function png(rgb, w, h) { const raw = Buffer.alloc(h * (w * 3 + 1)); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); } const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const save = (n, r) => writeFileSync(path.join(OUT, n), png(r.buf, r.W, r.H));

/* ---------------- run ------------------------------------------------------ */
function shotView(name) {
  const shot = SHOTS[name];
  const p = shot.player.pos, c = shot.pos, yawW = shot.player.yaw ?? 0;
  const dx = c[0] - p[0], dz = c[2] - p[2], dy = c[1] - (p[1] + 1.0);
  let phi = Math.atan2(dx, dz) - yawW;
  while (phi > Math.PI) phi -= 2 * Math.PI;
  while (phi < -Math.PI) phi += 2 * Math.PI;
  return { phi, elev: Math.atan2(dy, Math.hypot(dx, dz)), pose: shot.player.pose };
}

const VARIANTS = [
  ['base', 0], ['yawR6', -6], ['yawR10', -10], ['yawR14', -14], ['yawR18', -18],
  ['yawL10', +10], // SIGN CONTROL — toward the cameras; must not improve 33°
];
const SIZE = 420;

const table = [];
for (const shotName of ['sly-closeup', 'combat']) {
  const { phi, elev, pose } = shotView(shotName);
  console.log(`\n== ${shotName}  phi ${(phi * 180 / Math.PI).toFixed(1)}°  elev ${(elev * 180 / Math.PI).toFixed(1)}°  pose ${pose}`);
  for (const [vn, deg] of VARIANTS) {
    applyCapYaw(deg);
    applyClip(pose);
    const bodyV = skin();
    const proj = project(bodyV, -phi, elev);
    const frame = frameOf(proj, HEADF, SIZE, SIZE);
    const rWith = raster(buildTris(false), proj, frame, SIZE, SIZE);
    const rNo = raster(buildTris(true), proj, frame, SIZE, SIZE);
    const chin = chinRowOf(proj, frame, SIZE, SIZE);
    const oShare = outlineShare(rWith, chin);
    const contrib = billContribution(rWith, rNo);
    table.push({ shot: shotName, variant: vn, deg, ...oShare, ...contrib, pxPerM: rWith.s });
    save(`${shotName}-${vn}-parts.png`, rWith);
    if (vn === 'base') save(`${shotName}-nobill-parts.png`, rNo);
    console.log(`  ${vn.padEnd(7)} bill ${oShare.billPct.toFixed(1).padStart(5)}% of outline (${oShare.bill}/${oShare.total})  cap ${oShare.capPct.toFixed(1).padStart(5)}%  billSil ${String(contrib.px).padStart(5)}px  maxProtr ${contrib.maxRunPx}px = ${contrib.maxRunCm.toFixed(1)}cm  rows ${contrib.rows}`);
  }
}

/* zero control: nobill arm measured with its own frame — billSil must be exactly 0 */
{
  const { phi, elev, pose } = shotView('sly-closeup');
  applyCapYaw(0); applyClip(pose);
  const bodyV = skin();
  const proj = project(bodyV, -phi, elev);
  const frame = frameOf(proj, HEADF, SIZE, SIZE);
  const rNo = raster(buildTris(true), proj, frame, SIZE, SIZE);
  const z = billContribution(rNo, rNo);
  console.log(`\nZERO CONTROL (nobill vs itself): billSil ${z.px}px — must be 0`);
}

/* bearing sweep, idle_confident, closeup's elevation: the readable band per variant */
{
  const { elev } = shotView('sly-closeup');
  console.log('\n== bearing sweep (idle_confident, elev as sly-closeup) — maxProtr cm');
  const sweep = [];
  for (const [vn, deg] of [['base', 0], ['yawR10', -10], ['yawR14', -14]]) {
    applyCapYaw(deg);
    applyClip('idle_confident');
    const bodyV = skin();
    const row = { variant: vn, deg, at: {} };
    for (let b = -40; b <= 95; b += 5) {
      const phi = b * Math.PI / 180;
      const proj = project(bodyV, -phi, elev);
      const frame = frameOf(proj, HEADF, SIZE, SIZE);
      const rWith = raster(buildTris(false), proj, frame, SIZE, SIZE);
      const rNo = raster(buildTris(true), proj, frame, SIZE, SIZE);
      const c = billContribution(rWith, rNo);
      row.at[b] = +c.maxRunCm.toFixed(2);
    }
    sweep.push(row);
    console.log(`  ${vn.padEnd(7)} ` + Object.entries(row.at).map(([b, v]) => `${b}°:${v}`).join('  '));
  }
  table.push({ sweep });
}

/* front-view style check frames for the chosen candidates */
for (const [vn, deg] of [['base', 0], ['yawR10', -10], ['yawR14', -14]]) {
  applyCapYaw(deg); applyClip('idle_confident');
  const bodyV = skin();
  const proj = project(bodyV, 0, 0.09);
  const frame = frameOf(proj, HEADF, SIZE, SIZE);
  save(`front-${vn}-parts.png`, raster(buildTris(false), proj, frame, SIZE, SIZE));
}

applyCapYaw(0); // leave the shared geometry pristine
writeFileSync(path.join(OUT, 'capbill-proj.json'), JSON.stringify(table, null, 1));
console.log('\nwrote', OUT);
