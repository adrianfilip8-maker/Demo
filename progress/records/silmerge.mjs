/**
 * silmerge.mjs — which Sly signifier owns which part of the silhouette OUTLINE, at the
 * on-screen size the shot actually delivers.
 *
 * §7.3 asks whether cap / mask / tail / cane read in pure black. A black silhouette answers
 * that with a shape, and a shape is not a number, so "reads as Sly" has never had a threshold
 * anyone else could score. This gives it one: for each signifier it reports how much of the
 * *union outline* that part owns, and how much of the part's own boundary is buried inside the
 * union (welded to a neighbouring mass). A part that is present but buried contributes nothing
 * to a silhouette read, which is exactly the `hero` failure cap6 recorded in prose.
 *
 * WHAT THIS IS, AS THE GAP (KNOWN_ISSUES §11) — the suffix I did NOT implement, between this
 * number and what the renderer draws:
 *   - foot IK (`Rig.footIK`, run by freezePose at runtime) — nothing below the knee is the
 *     drawn pose. No band here reads the feet.
 *   - the level: no occlusion by ledge/architecture. `hero` perches him on a ledge that cuts
 *     the figure's lower edge in the real frame. Bands below are defined on parts (cap, head,
 *     tail, hook) that sit above the ledge line; the shaft/tip may be clipped in frame.
 *   - the inverted-hull ink shell: it dilates the union outline ~2.5 px isotropically, which
 *     CLOSES thin gaps. A gap this tool measures as N px reads as (N - 5) px in frame. Bands
 *     are therefore set on gaps ≥ 8 px, not on gaps > 0.
 *   - the shader, PostFX, rim light: all absent. This is shape only, which is what §7.3's
 *     silhouette condition is about.
 *
 * ROI PROVENANCE (KNOWN_ISSUES §27.1) — every ROI here is derived from LIVE SOURCE: part
 * membership comes from skin weights and material groups, the hook split from
 * `cane.hookPoint`. There are no stored pixels: the tool re-renders from the tree it is run
 * against, so a baseline is produced by running THIS FILE against an archived tree
 * (`git archive <sha> | tar -x -C dir`, then `node silmerge.mjs --root dir`), never by
 * pointing it at an old PNG. Both endpoints must name their sha.
 *
 *   node silmerge.mjs [--shot hero] [--rows 720] [--root /path/to/tree] [--out dir] [--tag name]
 */
import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const SHOT = arg('--shot', 'hero');
const ROWS = parseInt(arg('--rows', '720'), 10);
const ROOT = arg('--root', '/home/user/Demo');
const OUT = arg('--out', path.join(process.env.SCRATCH || '/tmp', 'silmerge'));
const TAG = arg('--tag', 'run');
mkdirSync(OUT, { recursive: true });

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel } = await import(path.join(ROOT, 'src/player/SlyModel.js'));
const { CLIPS, sampleInto, sampleCane } = await import(path.join(ROOT, 'src/player/Clips.js'));
const { PoseBuffer } = await import(path.join(ROOT, 'src/player/Rig.js'));
const { SHOTS } = await import(path.join(ROOT, 'src/core/Shots.js'));

const sly = new SlyModel(engine);
await sly.init();
const geo = sly.mesh.geometry;

/* ---- pose ---------------------------------------------------------------- */
const shot = SHOTS[SHOT];
if (!shot?.player) throw new Error(`shot ${SHOT} has no player staging`);
const CLIP = shot.player.pose;
const clip = CLIPS[CLIP];
/* In-memory pose override. `--ov "head:-18,15,2;tailC:26,16,0"` patches the sampled pose
   AFTER sampling and BEFORE skinning, so a candidate can be scored without editing the tree —
   the pattern Clips.js's own tail note prescribes ("patches the compiled quaternions in
   memory, and then LOOK"). Angles are degrees in the clip's own XYZ order, i.e. exactly the
   triples in Clips.js, so a variant that scores here transcribes verbatim into the source. */
const OV = {};
for (const seg of (arg('--ov', '') || '').split(';')) {
  if (!seg.trim()) continue;
  const [n, v] = seg.split(':');
  OV[n.trim()] = v.split(',').map(Number);
}
const CANE_OV = arg('--cane', null);
const D2R = Math.PI / 180;
{
  const pb = new PoseBuffer(sly.boneNames).clear();
  sampleInto(clip, clip.hold, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (OV[n]) {
      b.quaternion.setFromEuler(new THREE.Euler(OV[n][0] * D2R, OV[n][1] * D2R, OV[n][2] * D2R, 'XYZ'));
    } else if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]);
    else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  if (sly._canePivot) {
    const d = new THREE.Quaternion();
    const bq = sly._canePivot.quaternion.clone();
    if (CANE_OV) {
      const a = CANE_OV.split(',').map(Number);
      d.setFromEuler(new THREE.Euler(a[0] * D2R, a[1] * D2R, a[2] * D2R, 'XYZ'));
      sly._canePivot.quaternion.copy(d).multiply(bq);
    } else if (sampleCane(clip, clip.hold, d)) sly._canePivot.quaternion.copy(d).multiply(bq);
    sly.root.updateMatrixWorld(true);
  }
}

/* ---- view: shotsil's exact derivation ------------------------------------ */
const p = shot.player.pos, c = shot.pos, yawW = shot.player.yaw ?? 0;
const dx = c[0] - p[0], dz = c[2] - p[2], dy = c[1] - (p[1] + 1.0);
let phi = Math.atan2(dx, dz) - yawW;
while (phi > Math.PI) phi -= 2 * Math.PI;
while (phi < -Math.PI) phi += 2 * Math.PI;
const elev = Math.atan2(dy, Math.hypot(dx, dz));
const dist = Math.hypot(dx, dz, dy);
const pxPerM = ROWS / (2 * dist * Math.tan((shot.fov * Math.PI / 180) / 2));

/* ---- skin ---------------------------------------------------------------- */
const bones = sly.mesh.skeleton.bones;
const inv = sly.mesh.skeleton.boneInverses;
const _sm = new THREE.Matrix4(), _sv = new THREE.Vector3(), _st = new THREE.Vector3();
function skin() {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _st.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (w === 0) continue;
      const b = si.getComponent(i, k);
      _sm.multiplyMatrices(bones[b].matrixWorld, inv[b]);
      _sv.fromBufferAttribute(pos, i).applyMatrix4(_sm);
      _st.addScaledVector(_sv, w);
    }
    out[i * 3] = _st.x; out[i * 3 + 1] = _st.y; out[i * 3 + 2] = _st.z;
  }
  return out;
}
const bodyV = skin();

/* ---- part classification (LIVE SOURCE: skin weights + material groups) ---- */
const bi = {}; sly.boneNames.forEach((n, i) => { bi[n] = i; });
const HEADB = new Set(['head', 'jaw', 'capBrim', 'earL', 'earR', 'browL', 'browR'].map((n) => bi[n]).filter((v) => v !== undefined));
const TAILB = new Set(['tailA', 'tailB', 'tailC', 'tailD'].map((n) => bi[n]).filter((v) => v !== undefined));
const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
const dominant = (i) => { let b = -1, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = si.getComponent(i, k); } } return b; };
const domOf = new Int32Array(geo.attributes.position.count);
for (let i = 0; i < domOf.length; i++) domOf[i] = dominant(i);

const matOfRun = [];
for (const g of geo.groups) matOfRun.push({ s: g.start, e: g.start + g.count, m: g.materialIndex });
const matAt = (k) => matOfRun.find((r) => k >= r.s && k < r.e)?.m ?? -1;

/* Parts. CAP is the cloth/clothDark materials on head-cluster bones — the cap crown is
   weighted [['head',1]] so a bone test alone files it as skull (the §11 labelling artifact
   propprobe hit); the material index is what separates felt from fur. */
const P_CAP = 0, P_HEAD = 1, P_TAIL = 2, P_BODY = 3, P_HOOK = 4, P_SHAFT = 5;
const PART_NAME = ['cap', 'head', 'tail', 'body', 'hook', 'shaft'];

const tris = [];
{
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], cc = idx[i + 2];
    const m = matAt(i);
    const d = domOf[a];
    let part;
    if (TAILB.has(d)) part = P_TAIL;
    else if (HEADB.has(d)) part = (m === 3 || m === 4) ? P_CAP : P_HEAD;
    else part = P_BODY;
    tris.push([a, b, cc, bodyV, part]);
  }
}
/* Cane: hook = the C ring around hookPoint; shaft = everything else. hookRadius is the C's
   radius, so 1.6x captures the ring and its tube without reaching down the shaft. */
let caneStat = null;
if (sly.cane?.mesh) {
  const cm = sly.cane.mesh;
  cm.updateMatrixWorld(true);
  const cg = cm.geometry, cp = cg.attributes.position;
  const cv = new Float32Array(cp.count * 3);
  const local = new Float32Array(cp.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < cp.count; i++) {
    v.fromBufferAttribute(cp, i);
    local[i * 3] = v.x; local[i * 3 + 1] = v.y; local[i * 3 + 2] = v.z;
    v.applyMatrix4(cm.matrixWorld);
    cv[i * 3] = v.x; cv[i * 3 + 1] = v.y; cv[i * 3 + 2] = v.z;
  }
  const hp = sly.cane.hookPoint;
  const { CANE_TUNE } = await import(path.join(ROOT, 'src/player/Cane.js'));
  const R = CANE_TUNE.hookRadius * 1.6;
  const isHook = (i) => {
    const ddx = local[i * 3] - hp.x, ddy = local[i * 3 + 1] - hp.y, ddz = local[i * 3 + 2] - hp.z;
    return Math.hypot(ddx, ddy, ddz) <= R;
  };
  const ci = cg.index.array;
  let nh = 0, ns = 0;
  for (let i = 0; i < ci.length; i += 3) {
    const a = ci[i], b = ci[i + 1], cc = ci[i + 2];
    const hook = isHook(a) && isHook(b) && isHook(cc);
    if (hook) nh++; else ns++;
    tris.push([a, b, cc, cv, hook ? P_HOOK : P_SHAFT]);
  }
  caneStat = { hookTris: nh, shaftTris: ns, R };
}

/* ---- render a part-ID buffer at true on-screen scale ---------------------- */
const cy = Math.cos(phi), sy = Math.sin(phi);
const ce = Math.cos(elev), se = Math.sin(elev);
const verts = new Map();
const key = (arr, i) => (arr === bodyV ? i : i + 1e7);
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
for (const [a, b, cc, arr] of tris) {
  for (const i of [a, b, cc]) {
    const k = key(arr, i);
    if (verts.has(k)) continue;
    const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
    const X = x * cy + z * sy, z1 = -x * sy + z * cy;
    const Y = y * ce - z1 * se, Z = y * se + z1 * ce;
    verts.set(k, [X, Y, Z]);
    if (X < minX) minX = X; if (X > maxX) maxX = X;
    if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
  }
}
/* True on-screen size: metres x px/m from the shot's own fov and distance. No fit-to-frame,
   because readability is a function of the pixels the critic gets, not of the crop. */
const figPx = (maxY - minY) * pxPerM;
const PAD = 12;
const W = Math.ceil((maxX - minX) * pxPerM) + PAD * 2;
const H = Math.ceil((maxY - minY) * pxPerM) + PAD * 2;
const toPx = ([X, Y, Z]) => [(X - minX) * pxPerM + PAD, H - PAD - (Y - minY) * pxPerM, Z];

const idBuf = new Int8Array(W * H).fill(-1);
const depth = new Float32Array(W * H).fill(-1e9);
for (const [a, b, cc, arr, part] of tris) {
  const A = toPx(verts.get(key(arr, a))), B = toPx(verts.get(key(arr, b))), C = toPx(verts.get(key(arr, cc)));
  const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
  const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
  const d = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
  if (Math.abs(d) < 1e-12) continue;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const w0 = ((B[0] - x) * (C[1] - y) - (C[0] - x) * (B[1] - y)) / d;
      const w1 = ((C[0] - x) * (A[1] - y) - (A[0] - x) * (C[1] - y)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * A[2] + w1 * B[2] + w2 * C[2];
      const o = y * W + x;
      if (z <= depth[o]) continue;
      depth[o] = z; idBuf[o] = part;
    }
  }
}

/* ---- metrics -------------------------------------------------------------- */
const inSil = (x, y) => x >= 0 && y >= 0 && x < W && y < H && idBuf[y * W + x] >= 0;
const partAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : idBuf[y * W + x];

/** A pixel is on the UNION OUTLINE if it is silhouette and any 4-neighbour is background. */
const onOutline = (x, y) => {
  if (!inSil(x, y)) return false;
  return !inSil(x - 1, y) || !inSil(x + 1, y) || !inSil(x, y - 1) || !inSil(x, y + 1);
};
/** A pixel is on a PART boundary if it belongs to that part and a 4-neighbour does not. */
const onPartEdge = (x, y, part) => {
  if (partAt(x, y) !== part) return false;
  return partAt(x - 1, y) !== part || partAt(x + 1, y) !== part
      || partAt(x, y - 1) !== part || partAt(x, y + 1) !== part;
};

const stat = {};
for (let part = 0; part < 6; part++) stat[PART_NAME[part]] = { px: 0, edge: 0, edgeOnOutline: 0, outline: 0 };
let unionPx = 0, unionOutline = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const pa = partAt(x, y);
    if (pa < 0) continue;
    unionPx++;
    const s = stat[PART_NAME[pa]];
    s.px++;
    const out = onOutline(x, y);
    if (out) { unionOutline++; s.outline++; }
    if (onPartEdge(x, y, pa)) { s.edge++; if (out) s.edgeOnOutline++; }
  }
}

/* Hook aperture: an open C encloses background. Convex deficiency of the VISIBLE hook pixels
   separates a C (high) from a bar/blob/edge-on J (low). Hull area by monotone chain. */
function hullArea(pts) {
  if (pts.length < 3) return 0;
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  let A = 0;
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; A += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(A) / 2;
}
const hookPts = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (partAt(x, y) === P_HOOK) hookPts.push([x, y]);
const hookHull = hullArea(hookPts);
const hookAperture = hookHull > 0 ? 1 - hookPts.length / hookHull : 0;

/* Hook-to-shaft connectivity inside the union silhouette: can you walk from a visible hook
   pixel to a visible shaft pixel without leaving the silhouette? A hooked cane that reads as
   a hooked cane is one connected gold line; a crook severed from its own shaft by the body
   reads as two unrelated marks, which is what "the hook goes ambiguous" means in pixels. */
function connectedHookShaft() {
  if (!hookPts.length) return { connected: false, steps: -1 };
  const seen = new Uint8Array(W * H);
  let head = 0; const q = [];
  for (const [x, y] of hookPts) { q.push(y * W + x); seen[y * W + x] = 1; }
  let steps = 0;
  while (head < q.length) {
    const o = q[head++];
    if (partAt(o % W, (o / W) | 0) === P_SHAFT) return { connected: true, steps };
    const x = o % W, y = (o / W) | 0;
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ax, ny = y + ay;
      if (!inSil(nx, ny)) continue;
      const no = ny * W + nx;
      if (seen[no]) continue;
      seen[no] = 1; q.push(no);
    }
    steps++;
  }
  return { connected: false, steps: -1 };
}
const hookShaft = connectedHookShaft();

/* Head/cap gap to the nearest non-head mass, measured along the union outline: the widest
   background channel separating the head cluster from the body mass. Reported in px at the
   shot's true scale so the ink-shell dilation (~2.5 px per side) can be subtracted. */
function headGap() {
  let best = 0, at = null;
  for (let y = 0; y < H; y++) {
    let runStart = -1, sawHeadAbove = false;
    for (let x = 0; x < W; x++) {
      const pa = partAt(x, y);
      if (pa === P_CAP || pa === P_HEAD) { sawHeadAbove = true; runStart = -1; continue; }
      if (pa < 0) { if (runStart < 0) runStart = x; continue; }
      if (runStart >= 0 && sawHeadAbove) {
        const gap = x - runStart;
        if (gap > best) { best = gap; at = [runStart, y]; }
      }
      runStart = -1;
    }
  }
  return { gap: best, at };
}
const hGap = headGap();

/* ---- overlay PNG so the numbers can be LOOKED at -------------------------- */
const COL = { cap: [20, 20, 20], head: [235, 235, 235], tail: [150, 90, 200], body: [120, 120, 120], hook: [255, 140, 0], shaft: [255, 210, 90] };
function crc32(b) { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy ? rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3) : Buffer.from(rgb.subarray(y * w * 3, (y + 1) * w * 3)).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function writeOverlay(name, mag) {
  const w2 = W * mag, h2 = H * mag;
  const buf = new Uint8Array(w2 * h2 * 3).fill(255);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const pa = partAt((x / mag) | 0, (y / mag) | 0);
    const o = (y * w2 + x) * 3;
    if (pa < 0) continue;
    const c = COL[PART_NAME[pa]];
    buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
  }
  writeFileSync(path.join(OUT, name), png(Buffer.from(buf), w2, h2));
}
function writeSil(name, mag) {
  const w2 = W * mag, h2 = H * mag;
  const buf = new Uint8Array(w2 * h2 * 3).fill(255);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    if (partAt((x / mag) | 0, (y / mag) | 0) < 0) continue;
    const o = (y * w2 + x) * 3; buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0;
  }
  writeFileSync(path.join(OUT, name), png(Buffer.from(buf), w2, h2));
}
writeOverlay(`${TAG}-${SHOT}-parts6x.png`, 6);
writeSil(`${TAG}-${SHOT}-sil6x.png`, 6);
writeSil(`${TAG}-${SHOT}-sil1x.png`, 1);

/* ---- report --------------------------------------------------------------- */
const pct = (a, b) => (b > 0 ? (100 * a / b).toFixed(1) : '—');
console.log(`silmerge  shot=${SHOT} clip=${CLIP} rows=${ROWS} root=${ROOT} tag=${TAG}`);
console.log(`  view ${(phi * 180 / Math.PI).toFixed(0)}° elev ${(elev * 180 / Math.PI).toFixed(0)}° dist ${dist.toFixed(2)}m  figure ${figPx.toFixed(0)} px tall  canvas ${W}x${H}`);
if (caneStat) console.log(`  cane split: ${caneStat.hookTris} hook tris / ${caneStat.shaftTris} shaft tris (R=${caneStat.R.toFixed(3)}m)`);
console.log(`  union: ${unionPx} px, outline ${unionOutline} px`);
console.log('  part      px     %union   outline  %outline   ownEdge  %edgeOnOutline(buried%)');
for (const n of PART_NAME) {
  const s = stat[n];
  const buried = s.edge > 0 ? 100 * (1 - s.edgeOnOutline / s.edge) : 0;
  console.log(`  ${n.padEnd(8)} ${String(s.px).padStart(6)} ${pct(s.px, unionPx).padStart(7)}%  ${String(s.outline).padStart(7)} ${pct(s.outline, unionOutline).padStart(7)}%  ${String(s.edge).padStart(7)}  ${(100 - buried).toFixed(1).padStart(6)}% (${buried.toFixed(1)}%)`);
}
if (sly.cane?.mesh) {
  const hw = sly.cane.hookPoint.clone().applyMatrix4(sly.cane.mesh.matrixWorld);
  const tw = sly.cane.tipPoint.clone().applyMatrix4(sly.cane.mesh.matrixWorld);
  /* Model-space Y against the perch surface. `hero` stands him on a ledge, so a hook or tip
     below his own foot plane is inside the stone — the failure `canesweep.mjs` could not see
     because its scorer has no world in it. footY is the lowest boot vertex in this pose. */
  let footY = 1e9;
  for (let i = 0; i < bodyV.length; i += 3) if (bodyV[i + 1] < footY) footY = bodyV[i + 1];
  console.log(`  CANE hook y ${hw.y.toFixed(3)}  tip y ${tw.y.toFixed(3)}  lowest boot y ${footY.toFixed(3)}  (hook-foot ${(hw.y - footY).toFixed(3)} m)`);
}
{
  let hx = 0, hy = 0;
  for (const [x, y] of hookPts) { hx += x; hy += y; }
  const n = Math.max(1, hookPts.length);
  console.log(`  HOOKAPERT ${hookAperture.toFixed(3)} hull ${hookHull.toFixed(0)} visible ${hookPts.length} centroidpx ${(hx / n).toFixed(1)},${(hy / n).toFixed(1)}`);
}
/* CLUSTER burial. Reading a silhouette, the cap/skull boundary is INTERNAL to one blob — the
   question §7.3 asks is whether the head-with-cap separates from the tail and the torso, not
   whether felt separates from fur. Scoring the parts individually made the tail sweep look
   like it was making the head worse when it was only moving the internal cap/head seam, and a
   band built on that would have been optimising an invisible line. Clusters are the unit. */
const CLUSTERS = { headc: [P_CAP, P_HEAD], canec: [P_HOOK, P_SHAFT] };
for (const [cn, members] of Object.entries(CLUSTERS)) {
  const isMem = (x, y) => members.includes(partAt(x, y));
  let edge = 0, edgeOut = 0, px = 0, outl = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isMem(x, y)) continue;
    px++;
    const out = onOutline(x, y);
    if (out) outl++;
    const bnd = !isMem(x - 1, y) || !isMem(x + 1, y) || !isMem(x, y - 1) || !isMem(x, y + 1);
    if (bnd) { edge++; if (out) edgeOut++; }
  }
  const buried = edge > 0 ? 100 * (1 - edgeOut / edge) : 0;
  console.log(`  CLUSTER ${cn} px ${px} outline ${outl} (${pct(outl, unionOutline)}% of union outline) buried ${buried.toFixed(1)}%`);
}
console.log(`  HOOK->SHAFT connected in silhouette: ${hookShaft.connected}`);
console.log(`  HEAD widest background channel below/around head: ${hGap.gap} px @ ${hGap.at ? hGap.at.join(',') : '—'}`);
console.log(`  wrote ${OUT}/${TAG}-${SHOT}-{parts6x,sil6x,sil1x}.png`);
console.log(`  warnings: ${warnings.length}`);
