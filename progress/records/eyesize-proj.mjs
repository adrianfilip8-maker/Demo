/**
 * eyesize-proj.mjs — OFFLINE projection of rest-state eye-unit scale candidates at the two
 * scored bearings, before any capture is spent. CHARACTER, for PREREG-eyesize.md.
 *
 * THE QUESTION (CRITIC-sbs1 gap #3, CHAR-sbs1 §5.1–5.2, confirmed on the fresh 8640769 frame):
 * the rest-state eye discs are 2.5–3× canon width — single-disc eye:face 0.324/0.375 against
 * canon ≈ 0.10–0.15 — and the domino mask survives only as slivers (13 px divider, 10 px strip)
 * because the discs consume its area. The candidate is a single eye-unit LENS-PLANE scale E
 * applied to the four parts `_buildEye` authors (sclera, pupil, glint, lid) and to the
 * `_eyeFrame` in-plane offsets, with the mask band and the per-eye mask annulus DELIBERATELY
 * untouched — the annulus is an enclosure guarantee (its inner hole is backed by the band at
 * inflate 1.058), so a smaller eye inside today's annulus turns annulus+band pixels back into
 * visible mask automatically (CHAR-sbs1 §5.2's "fixing disc size returns the band"). This tool
 * settles numerically, per candidate and per bearing, what the frame is being asked to confirm:
 * projected eye:face, mask-band continuity (divider / outboard strip / band margins over and
 * under the eye), the geometric bound on any single-eye amber run, and glint visibility.
 *
 * WHY LENS-PLANE, NOT UNIFORM — measured in this tool's own first run, kept as the record.
 * A uniform scale about the sclera centre `c` BURIES the eye: `c` sits at SINK 0.92 of the head
 * ellipsoid and the mask band in front of it at inflate 1.058, so it is only the lens's
 * outward extent (z-radius 0.032 ⇒ front ≈ 1.088) that pokes it through the black. Uniform
 * E=0.65 cut the visible sclera to 20 px and E≤0.55 rendered ZERO eye pixels at both bearings —
 * the band swallowed the lens whole. So the candidate scales `right`/`trueUp` components only:
 * every `outward` offset and every z-radius is untouched, which keeps the eye→mask→brim depth
 * ordering bit-identical (`occlude.mjs` geometry unchanged along the ray axis; the pupil's
 * authored 0.008·S clearance off the sclera unchanged) while the face-plane footprint — the
 * thing CHAR-sbs1 measured at 2.5–3× canon — shrinks by exactly E.
 *
 * METHOD. Adapted from progress/records/capbill-proj.mjs (same stub engine, CPU skinning,
 * scan-convert; tools/shotsil.mjs's caveats all apply — no level, no shader, no ink hull, no
 * PostFX; read for SHAPE, the frame rules). The candidate transform is applied to the BUILT
 * bind geometry inside this tool — src is never edited. Equivalence to the proposed edit is
 * exact, not approximate: every eye part is an `addEllipsoid` whose centre is `c + offsets` and
 * whose verts are `centre + basis·(radii ∘ unit)` in the shared `_eyeFrame` basis
 * {right, trueUp, outward}, so scaling the x/y radii AND the in-plane offset components by E
 * (the edit) equals, for every part vert, scaling the (v − c) components in the right/trueUp
 * plane by E (this tool):
 *     v' = c + (v−c) + (E−1)·[((v−c)·r̂)r̂ + ((v−c)·û)û].
 * The glint keeps a floor (glintE = max(E, 0.62), its own in-plane factor about its own centre)
 * so its projected dot survives the ~2.5 px ink ring and stays the frame's >L228 source (the
 * shipped bloom/scleraTint pair is a constraint, not a lever, here). Rest-pose skinning is
 * bind-identical for pupil/glint verts (their bones are identity in every non-startle clip), so
 * not moving the pupil BONE in this tool changes nothing at rest; the shipped edit moves the
 * bone with `pc` for free because `_buildSkeleton` reads the same `_eyeFrame`.
 *
 * PART IDENTIFICATION — exact ranges, no position heuristics. `_buildEye` stamps each of
 * sclera/pupil/glint with `biasNormals(v0, v1, shadeN, 0.90/0.90/0.95)` where shadeN is the
 * shared (0, 0.15, 1).normalize() shading normal that exists nowhere else in the build; this
 * tool patches `MeshBuilder.prototype.biasNormals` before construction and records the calls.
 * The lid is the range from each glint's end to the next part's start (side +1: the −1 sclera;
 * side −1: closed by symmetry — both lids tessellate identically so lidCount is side +1's).
 * Audits, all fatal: exactly 6 shadeN calls in two consecutive triples; pupil.start/glint.end
 * reproduce `sly.pupilRanges` verbatim; sclera+glint verts sit in material group 'eye' (7) and
 * pupil+lid in 'ink' (6); part centroids sit within 0.14 m of their eye's `_eyeFrame().c`.
 *
 * MEASUREMENTS, per variant × bearing, on a 420×420 head-focus crop whose frame is LOCKED to
 * the base arm per shot (so px counts are comparable across arms):
 *   sclW/sclH px + /face  the visible sclera bbox (pale-aperture bound; in-frame counterpart:
 *                         per-eye bbox of L>120 px)
 *   unitW px + /face      bbox of sclera∪pupil∪glint (the eye proper; the lid reads as mask)
 *   faceW px, two bases   all-head span at the eye row (toEar) and span excluding ear-bone px
 *                         (cheek) — CHAR-sbs1 quotes cheek-to-cheek (136 px on the frame)
 *   divider px, %ink      gap between the two units at three eye rows, and the fraction of the
 *                         gap covered by ink-family (mask band/annulus/lid) px
 *   strip px              outboard ink run from each unit's outer edge at its eye row
 *   bandV px              ink run directly above/below each unit at its centre column (the
 *                         band closing over and under the lens)
 *   eyeRowInkRun          longest ink-family run on each eye row + start-x, classified
 *                         mask-anchored vs unit-anchored (the CHAR-sbs1 §5.2 signature:
 *                         canon's longest dark run is a BAND from the face edge, ours today is
 *                         the pupils)
 *   sclLongestRun px      longest single-row sclera run (the geometric BOUND on any in-frame
 *                         single-eye amber run — amber ⊆ disc interior; the head-box amber
 *                         COUNT is lighting-dependent and 81% off-eye on the fresh frame, so
 *                         it is recorded, never gated)
 *   glintPx               glint-owned visible px (the "alive" cue must survive)
 * CONTROLS, because a number that cannot fail is not a measurement (DIGEST "Everyone"):
 *   zero:      E=1 through the same code path skips the transform; raster must equal the
 *              pristine raster exactly (0 differing px)
 *   monotone:  sclW strictly increasing in E at both bearings, else the instrument does not
 *              measure eye size
 *   known-bad: E=0.15 ("bead15") must read eye:face(unit) < 0.06 at sly-closeup — the beady-
 *              eyes failure has to be visible to the same numbers that pass the candidate
 *   calibration: base unit:face at 33.2° should land near (slightly under — no ~2.5 px ink
 *              ring in this raster) the frame-measured 0.324/0.375
 *
 * Bearings per real shot (pose included — combat is scored in `cane_combo_3`): sly-closeup
 * φ +33.2°, combat φ +44.9°, shotView as capbill-proj.mjs.
 *
 *   node eyesize-proj.mjs <outdir>            # PNGs land in <outdir> (scratchpad);
 *                                             # JSON is written to progress/records/eyesize/
 */
import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || '/tmp/eyesize';
mkdirSync(OUT, { recursive: true });
const JSON_DIR = path.join(HERE, 'eyesize');
mkdirSync(JSON_DIR, { recursive: true });

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};

/* ---- patch biasNormals BEFORE the model builds, to recover exact part ranges ---- */
const { MeshBuilder } = await import('../../src/player/Body.js');
const biasLog = [];
const origBias = MeshBuilder.prototype.biasNormals;
MeshBuilder.prototype.biasNormals = function (start, end, dir, amount) {
  biasLog.push({ start, end, x: dir.x, y: dir.y, z: dir.z, amount });
  return origBias.call(this, start, end, dir, amount);
};

const { SlyModel, TUNE } = await import('../../src/player/SlyModel.js');
const { CLIPS, sampleInto, sampleCane } = await import('../../src/player/Clips.js');
const { PoseBuffer } = await import('../../src/player/Rig.js');
const { SHOTS } = await import('../../src/core/Shots.js');

const sly = new SlyModel(engine);
await sly.init();
if (!sly.mesh) { console.error('BUILD FAILED', warnings); process.exit(1); }
MeshBuilder.prototype.biasNormals = origBias; // done recording

const geo = sly.mesh.geometry;
const caneBaseQ = sly._canePivot ? sly._canePivot.quaternion.clone() : null;
const poseBuf = new PoseBuffer(sly.boneNames);
const pos0 = geo.attributes.position.array.slice();

/* ---------------- part ranges from the shadeN signature ---------------- */
const SHADE_Y = 0.15 / Math.hypot(0.15, 1); // 0.1483404…
const eyeCalls = biasLog.filter((b) => Math.abs(b.x) < 1e-12 && Math.abs(b.y - SHADE_Y) < 1e-4);
if (eyeCalls.length !== 6) { console.error(`expected 6 shadeN biasNormals calls, got ${eyeCalls.length}`); process.exit(1); }
const amounts = eyeCalls.map((c) => c.amount.toFixed(2)).join(',');
if (amounts !== '0.90,0.90,0.95,0.90,0.90,0.95') { console.error(`unexpected amounts ${amounts}`); process.exit(1); }
// build order in _buildFace: for (const s of [1, -1]) _buildEye(mb, s)
const sideOf = { 0: 1, 1: -1 };
const parts = {};
for (const [k, side] of Object.entries(sideOf)) {
  const [scl, pup, gli] = eyeCalls.slice(k * 3, k * 3 + 3);
  parts[side] = { scl: [scl.start, scl.end], pup: [pup.start, pup.end], gli: [gli.start, gli.end] };
}
// lids: glint end -> next part start; both lids tessellate identically
const lidCount = parts[-1].scl[0] - parts[1].gli[1];
parts[1].lid = [parts[1].gli[1], parts[1].gli[1] + lidCount];
parts[-1].lid = [parts[-1].gli[1], parts[-1].gli[1] + lidCount];
if (lidCount <= 0) { console.error('lid range derivation failed'); process.exit(1); }

/* audits — all fatal */
const pr = Object.fromEntries((sly.pupilRanges ?? []).map((r) => [r.name === 'pupilL' ? 1 : -1, r]));
for (const side of [1, -1]) {
  if (pr[side].v0 !== parts[side].pup[0] || pr[side].v1 !== parts[side].gli[1]) {
    console.error(`pupilRanges mismatch side ${side}`); process.exit(1);
  }
}
const groupOf = (() => {
  const runs = geo.groups.map((g) => ({ s: g.start, e: g.start + g.count, m: g.materialIndex }));
  return (idxPos) => runs.find((r) => idxPos >= r.s && idxPos < r.e)?.m ?? -1;
})();
const vGroup = new Int16Array(geo.attributes.position.count).fill(-1);
{
  const idx = geo.index.array;
  for (let k = 0; k < idx.length; k++) if (vGroup[idx[k]] === -1) vGroup[idx[k]] = groupOf(k);
}
const EYE_G = 7, INK_G = 6; // GROUPS order in SlyModel.js:715 — append-only by contract
function auditGroup(range, want, label) {
  for (let i = range[0]; i < range[1]; i++) if (vGroup[i] !== want && vGroup[i] !== -1) {
    console.error(`AUDIT FAIL: ${label} vert ${i} in group ${vGroup[i]}, want ${want}`); process.exit(1);
  }
}
const eyeC = {};
for (const side of [1, -1]) {
  auditGroup(parts[side].scl, EYE_G, `scl${side}`);
  auditGroup(parts[side].gli, EYE_G, `gli${side}`);
  auditGroup(parts[side].pup, INK_G, `pup${side}`);
  auditGroup(parts[side].lid, INK_G, `lid${side}`);
  eyeC[side] = sly._eyeFrame(side).c;
  for (const pn of ['scl', 'pup', 'gli', 'lid']) {
    const [a, b] = parts[side][pn];
    const cen = new THREE.Vector3();
    for (let i = a; i < b; i++) cen.add(new THREE.Vector3(pos0[i * 3], pos0[i * 3 + 1], pos0[i * 3 + 2]));
    cen.multiplyScalar(1 / (b - a));
    const d = cen.distanceTo(eyeC[side]);
    if (d > 0.14) { console.error(`AUDIT FAIL: ${pn}${side} centroid ${d.toFixed(3)} m from eye centre`); process.exit(1); }
    parts[side][pn + 'C'] = cen;
  }
}
const nParts = Object.values(parts).reduce((n, p) => n + (p.scl[1] - p.scl[0]) + (p.pup[1] - p.pup[0]) + (p.gli[1] - p.gli[0]) + (p.lid[1] - p.lid[0]), 0);
console.log(`eye-unit verts: ${nParts} of ${geo.attributes.position.count}`
  + `  (per side: scl ${parts[1].scl[1] - parts[1].scl[0]}, pup ${parts[1].pup[1] - parts[1].pup[0]},`
  + ` gli ${parts[1].gli[1] - parts[1].gli[0]}, lid ${lidCount})`);

/* ---------------- the candidate transform ---------------- */
/** Lens-plane scale about each eye's sclera centre: right/trueUp components ×factor, outward
 *  component untouched. E=1 (with glintE=1, pupilXY=1) skips entirely (zero-control path).
 *  glintE is the glint's own in-plane factor about its own centre (floored so the catchlight
 *  survives); pupilXY optionally widens the pupil in the lens plane about its own centroid —
 *  the recorded 'eyedark' alternative. */
function applyEye(E, glintE = Math.max(E, 0.62), pupilXY = 1) {
  const p = geo.attributes.position;
  p.array.set(pos0);
  if (E !== 1 || glintE !== 1 || pupilXY !== 1) {
    for (const side of [1, -1]) {
      const c = eyeC[side];
      const fr = sly._eyeFrame(side);
      const R = fr.right, U = fr.trueUp;
      const planar = (wx, wy, wz, f) => {
        const dr = wx * R.x + wy * R.y + wz * R.z;
        const du = wx * U.x + wy * U.y + wz * U.z;
        const k = f - 1;
        return [wx + k * (dr * R.x + du * U.x), wy + k * (dr * R.y + du * U.y), wz + k * (dr * R.z + du * U.z)];
      };
      for (const pn of ['scl', 'pup', 'lid']) {
        const [a, b] = parts[side][pn];
        for (let i = a; i < b; i++) {
          let wx = pos0[i * 3] - c.x, wy = pos0[i * 3 + 1] - c.y, wz = pos0[i * 3 + 2] - c.z;
          if (pn === 'pup' && pupilXY !== 1) {
            // extra in-plane widen about the pupil's own centroid, then the unit scale about c
            const pc = parts[side].pupC;
            const [dx, dy, dz] = planar(pos0[i * 3] - pc.x, pos0[i * 3 + 1] - pc.y, pos0[i * 3 + 2] - pc.z, pupilXY);
            wx = pc.x + dx - c.x; wy = pc.y + dy - c.y; wz = pc.z + dz - c.z;
          }
          const [sx, sy, sz] = planar(wx, wy, wz, E);
          p.array[i * 3] = c.x + sx; p.array[i * 3 + 1] = c.y + sy; p.array[i * 3 + 2] = c.z + sz;
        }
      }
      { // glint: centre moves with the unit's in-plane scale, its own radii by glintE
        const [a, b] = parts[side].gli;
        const hc = parts[side].gliC;
        const [hx0, hy0, hz0] = planar(hc.x - c.x, hc.y - c.y, hc.z - c.z, E);
        const hx = c.x + hx0, hy2 = c.y + hy0, hz = c.z + hz0;
        for (let i = a; i < b; i++) {
          const [gx, gy, gz] = planar(pos0[i * 3] - hc.x, pos0[i * 3 + 1] - hc.y, pos0[i * 3 + 2] - hc.z, glintE);
          p.array[i * 3] = hx + gx; p.array[i * 3 + 1] = hy2 + gy; p.array[i * 3 + 2] = hz + gz;
        }
      }
    }
  }
  p.needsUpdate = true;
}

/* ---------------- pose + CPU skin (from capbill-proj.mjs / tools/shotsil.mjs) ---------------- */
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

/* ---------------- ownership keys ---------------- */
const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
const bi = {}; sly.boneNames.forEach((n, i) => { bi[n] = i; });
const dominant = (i) => { let b = -1, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = si.getComponent(i, k); } } return b; };
const KEY = { sclL: 20, pupL: 21, gliL: 22, lidL: 23, sclR: 24, pupR: 25, gliR: 26, lidR: 27, ear: 28 };
const partKeyOfVert = new Int16Array(geo.attributes.position.count).fill(-1);
for (const side of [1, -1]) {
  const sfx = side > 0 ? 'L' : 'R'; // pupilL = side +1 (his left, screen right at these bearings)
  for (const pn of ['scl', 'pup', 'gli', 'lid']) {
    const [a, b] = parts[side][pn];
    for (let i = a; i < b; i++) partKeyOfVert[i] = KEY[pn + sfx];
  }
}
for (let i = 0; i < geo.attributes.position.count; i++) {
  if (partKeyOfVert[i] === -1 && (dominant(i) === bi.earL || dominant(i) === bi.earR)) partKeyOfVert[i] = KEY.ear;
}
function buildTris() {
  const tris = [];
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const pk = partKeyOfVert[a] !== -1 ? partKeyOfVert[a]
      : partKeyOfVert[b] !== -1 ? partKeyOfVert[b]
        : partKeyOfVert[c];
    tris.push([a, b, c, pk !== -1 ? pk : groupOf(i)]);
  }
  return tris;
}
const TRIS = buildTris();

/* head focus set — as capbill-proj.mjs (frame LOCKED to base per shot, so membership of eye
   verts in the focus set cannot move the frame between arms) */
const HEADB = new Set(['head', 'jaw', 'capBrim', 'earL', 'earR', 'browL', 'browR'].map((n) => bi[n]));
const HEADF = new Set();
for (let i = 0; i < geo.attributes.position.count; i++) if (HEADB.has(dominant(i))) HEADF.add(i);

/* ---------------- rasteriser ---------------- */
const PART_COL = {
  0: 0x9aa6bd, 1: 0xe8e2cf, 2: 0x6d7590, 3: 0x4f8fd0, 4: 0x2c4f74, 5: 0xd9ae4a,
  6: 0x201820, 7: 0xf2eee2, 8: 0x9aa6bd, 9: 0xe8e2cf, 10: 0x6d7590,
  [KEY.sclL]: 0xfff2b0, [KEY.sclR]: 0xffe27a,
  [KEY.pupL]: 0xd03030, [KEY.pupR]: 0xa01818,
  [KEY.gliL]: 0x30d0ff, [KEY.gliR]: 0x00a0e0,
  [KEY.lidL]: 0xc040c0, [KEY.lidR]: 0x902890,
  [KEY.ear]: 0x8090a8,
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
  const own = new Int16Array(Wpx * Hpx).fill(-1);
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
      own[o] = k;
    }
  }
  return { buf, own, W: Wpx, H: Hpx, s };
}

/* ---------------- measurement ---------------- */
const INK_FAMILY = new Set([6, KEY.pupL, KEY.pupR, KEY.lidL, KEY.lidR]); // mask band + annulus + lids + pupils
function bboxOf(r, keys) {
  const { own, W: Wpx, H: Hpx } = r;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
  for (let y = 0; y < Hpx; y++) for (let x = 0; x < Wpx; x++) {
    if (!keys.has(own[y * Wpx + x])) continue;
    n++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return n ? { n, x0: minX, x1: maxX, y0: minY, y1: maxY, w: maxX - minX + 1, h: maxY - minY + 1 } : { n: 0 };
}
function rowSpan(r, y, pred) {
  const { own, W: Wpx } = r;
  let a = -1, b = -1;
  for (let x = 0; x < Wpx; x++) if (pred(own[y * Wpx + x])) { if (a < 0) a = x; b = x; }
  return a < 0 ? null : { a, b, w: b - a + 1 };
}
function longestRun(r, y, x0, x1, pred) {
  const { own, W: Wpx } = r;
  let best = 0, cur = 0, bs = -1, s = -1;
  for (let x = x0; x <= x1; x++) {
    if (pred(own[y * Wpx + x])) { if (cur === 0) s = x; cur++; if (cur > best) { best = cur; bs = s; } } else cur = 0;
  }
  return { run: best, start: bs };
}
function colRun(r, x, yFrom, dir, pred) {
  const { own, W: Wpx, H: Hpx } = r;
  let n = 0;
  for (let y = yFrom; y >= 0 && y < Hpx; y += dir) {
    if (pred(own[y * Wpx + x])) n++; else break;
  }
  return n;
}
/* Sides are ANATOMICAL: hisL = pupilL = side +1. Both scored cameras sit on HIS LEFT, so at
   these bearings hisL is the SCREEN-RIGHT eye — CHAR-sbs1's "R disc" bbox (634,139,685,215) —
   and hisR the screen-left "L disc" (577,132,621,195). Stated here so the prereg cannot
   inherit a flipped label (§11's probe-header hazard). */
const SIDES = [['hisL', 'L'], ['hisR', 'R']];
function measure(r) {
  const m = {};
  const eyes = {};
  for (const [nm, sfx] of SIDES) {
    const scl = bboxOf(r, new Set([KEY['scl' + sfx]]));
    const unit = bboxOf(r, new Set([KEY['scl' + sfx], KEY['pup' + sfx], KEY['gli' + sfx]]));
    const gli = bboxOf(r, new Set([KEY['gli' + sfx]]));
    eyes[nm] = { scl, unit, gliPx: gli.n };
    if (scl.n) {
      const yc = Math.round((scl.y0 + scl.y1) / 2);
      eyes[nm].rowY = yc;
      let best = 0;
      for (let y = scl.y0; y <= scl.y1; y++) {
        const lr = longestRun(r, y, Math.max(0, scl.x0 - 2), Math.min(r.W - 1, scl.x1 + 2), (k) => k === KEY['scl' + sfx]);
        if (lr.run > best) best = lr.run;
      }
      eyes[nm].sclLongestRun = best;
    }
  }
  m.eyes = eyes;
  // face width at each visible eye row, two bases
  const rows = SIDES.map(([nm]) => eyes[nm].rowY).filter((y) => y != null);
  m.face = {};
  for (const [nm] of SIDES) {
    const y = eyes[nm].rowY;
    if (y == null) continue;
    const all = rowSpan(r, y, (k) => k >= 0);
    const noEar = rowSpan(r, y, (k) => k >= 0 && k !== KEY.ear);
    m.face[nm] = { toEar: all?.w ?? 0, cheek: noEar?.w ?? 0 };
  }
  // ratios (cheek basis, CHAR-sbs1's)
  for (const [nm] of SIDES) {
    const f = m.face[nm]?.cheek;
    if (f && eyes[nm].unit.n) {
      eyes[nm].unitToFace = +(eyes[nm].unit.w / f).toFixed(3);
      eyes[nm].sclToFace = +(eyes[nm].scl.w / f).toFixed(3);
    }
  }
  // divider between the two units at three rows (each eye row + mid), + ink coverage of the gap
  if (eyes.hisL.unit.n && eyes.hisR.unit.n) {
    const uL = eyes.hisL.unit, uR = eyes.hisR.unit;
    const [left, right] = uL.x0 <= uR.x0 ? [uL, uR] : [uR, uL];
    const midY = Math.round(((eyes.hisL.rowY ?? 0) + (eyes.hisR.rowY ?? 0)) / 2);
    const divRows = [];
    for (const y of [...rows, midY]) {
      const gap = right.x0 - left.x1 - 1;
      if (gap <= 0) { divRows.push({ y, gap: 0, inkPct: 0 }); continue; }
      let ink = 0, fig = 0;
      for (let x = left.x1 + 1; x < right.x0; x++) {
        const k = r.own[y * r.W + x];
        if (k >= 0) fig++;
        if (INK_FAMILY.has(k)) ink++;
      }
      divRows.push({ y, gap, inkPct: fig ? +(100 * ink / fig).toFixed(1) : 0 });
    }
    m.divider = divRows;
  }
  // outboard strip at each eye row: ink run marching outboard from the unit edge
  m.strip = {};
  for (const [nm] of SIDES) {
    const u = eyes[nm].unit, y = eyes[nm].rowY;
    if (!u.n || y == null) continue;
    const otherX = eyes[nm === 'hisL' ? 'hisR' : 'hisL'].unit.x0 ?? r.W;
    const outboardDir = u.x0 < otherX ? -1 : 1; // march away from the other eye
    let x = outboardDir < 0 ? u.x0 - 1 : u.x1 + 1, run = 0;
    while (x >= 0 && x < r.W && INK_FAMILY.has(r.own[y * r.W + x])) { run++; x += outboardDir; }
    m.strip[nm] = run;
  }
  // band closing over/under each unit at its centre column
  m.bandV = {};
  for (const [nm] of SIDES) {
    const u = eyes[nm].unit;
    if (!u.n) continue;
    const xc = Math.round((u.x0 + u.x1) / 2);
    m.bandV[nm] = {
      above: colRun(r, xc, u.y0 - 1, -1, (k) => INK_FAMILY.has(k)),
      below: colRun(r, xc, u.y1 + 1, +1, (k) => INK_FAMILY.has(k)),
    };
  }
  // the CHAR-sbs1 §5.2 signature: longest ink-family run on each eye row, mask- or unit-anchored
  m.eyeRowInk = {};
  for (const [nm] of SIDES) {
    const y = eyes[nm].rowY;
    if (y == null) continue;
    const span = rowSpan(r, y, (k) => k >= 0);
    if (!span) continue;
    const lr = longestRun(r, y, span.a, span.b, (k) => INK_FAMILY.has(k));
    const u = eyes[nm].unit;
    m.eyeRowInk[nm] = {
      run: lr.run, start: lr.start,
      startsInsideUnit: lr.start >= u.x0 && lr.start <= u.x1,
    };
  }
  return m;
}

/* ---------------- png ---------------- */
let TBL = null;
function crc32(b) { if (!TBL) { TBL = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TBL[n] = c; } } let c = -1; for (let i = 0; i < b.length; i++) c = TBL[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function png(rgb, w, h) { const raw = Buffer.alloc(h * (w * 3 + 1)); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); } const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const save = (n, r) => writeFileSync(path.join(OUT, n), png(r.buf, r.W, r.H));

/* ---------------- run ---------------- */
function shotView(name) {
  const shot = SHOTS[name];
  const p = shot.player.pos, c = shot.pos, yawW = shot.player.yaw ?? 0;
  const dx = c[0] - p[0], dz = c[2] - p[2], dy = c[1] - (p[1] + 1.0);
  let phi = Math.atan2(dx, dz) - yawW;
  while (phi > Math.PI) phi -= 2 * Math.PI;
  while (phi < -Math.PI) phi += 2 * Math.PI;
  return { phi, elev: Math.atan2(dy, Math.hypot(dx, dz)), pose: shot.player.pose };
}

/* E, glintE (default max(E,0.62)), pupilXY */
const VARIANTS = [
  ['base', 1.0, 1.0, 1],
  ['e65', 0.65, undefined, 1],
  ['e55', 0.55, undefined, 1],
  ['e45', 0.45, undefined, 1],   // CANDIDATE
  ['e38', 0.38, undefined, 1],
  ['e45dark', 0.45, undefined, 1.35], // recorded alternative — NOT the registered candidate
  ['bead15', 0.15, undefined, 1], // KNOWN-BAD
];
const SIZE = 420;

/* Provenance stamp (§121.4: the tree hash over what the bundler reads is the fact an A/B
   needs; the git SHA moves under concurrent owners). Computed exactly as every CHARACTER
   record does: repo root, repo-relative paths. */
let srcTree = 'unavailable';
try {
  const { execSync } = await import('node:child_process');
  srcTree = execSync("find src -name '*.js' | sort | xargs sha256sum | sha256sum",
    { cwd: path.join(HERE, '..', '..') }).toString().trim().slice(0, 16);
} catch { /* stamp stays 'unavailable' — record it manually beside this file */ }
console.log(`srcTree ${srcTree}`);
const out = { srcTree, variants: {}, controls: {} };
const baseRasters = {};
for (const shotName of ['sly-closeup', 'combat']) {
  const { phi, elev, pose } = shotView(shotName);
  console.log(`\n== ${shotName}  phi ${(phi * 180 / Math.PI).toFixed(1)}°  elev ${(elev * 180 / Math.PI).toFixed(1)}°  pose ${pose}`);
  let lockedFrame = null;
  for (const [vn, E, gE, pXY] of VARIANTS) {
    applyEye(E, gE ?? Math.max(E, 0.62), pXY);
    applyClip(pose);
    const bodyV = skin();
    const proj = project(bodyV, -phi, elev);
    if (!lockedFrame) lockedFrame = frameOf(proj, HEADF, SIZE, SIZE);
    const r = raster(TRIS, proj, lockedFrame, SIZE, SIZE);
    const m = measure(r);
    (out.variants[vn] ??= {})[shotName] = { E, glintE: gE ?? Math.max(E, 0.62), pupilXY: pXY, pxPerM: r.s, ...m };
    if (vn === 'base') baseRasters[shotName] = r;
    save(`${shotName}-${vn}.png`, r);
    const eL = m.eyes.hisL, eR = m.eyes.hisR;
    console.log(`  ${vn.padEnd(8)} unit hisL ${String(eL.unit.w ?? 0).padStart(3)}px hisR ${String(eR.unit.w ?? 0).padStart(3)}px`
      + `  unit:face ${eL.unitToFace ?? '—'}/${eR.unitToFace ?? '—'}`
      + `  scl:face ${eL.sclToFace ?? '—'}/${eR.sclToFace ?? '—'}`
      + `  div ${m.divider ? m.divider.map((d) => d.gap).join('/') : '—'}px`
      + `  strip ${m.strip.hisL ?? '—'}/${m.strip.hisR ?? '—'}`
      + `  sclRun ${eL.sclLongestRun ?? '—'}/${eR.sclLongestRun ?? '—'}`
      + `  glint ${eL.gliPx}/${eR.gliPx}`);
  }
}

/* zero control: E=1 through the same path must reproduce the pristine raster exactly */
{
  const { phi, elev, pose } = shotView('sly-closeup');
  applyEye(1, 1, 1);
  applyClip(pose);
  const proj = project(skin(), -phi, elev);
  const frame = frameOf(proj, HEADF, SIZE, SIZE);
  const rA = raster(TRIS, proj, frame, SIZE, SIZE);
  geo.attributes.position.array.set(pos0); geo.attributes.position.needsUpdate = true;
  applyClip(pose);
  const proj2 = project(skin(), -phi, elev);
  const rB = raster(TRIS, proj2, frame, SIZE, SIZE);
  let diff = 0;
  for (let i = 0; i < rA.own.length; i++) if (rA.own[i] !== rB.own[i]) diff++;
  out.controls.zero = { differingPx: diff };
  console.log(`\nZERO CONTROL (E=1 path vs pristine): ${diff} differing px — must be 0`);
}
/* monotonicity: sclW strictly increasing in E at both bearings (near eye only at combat —
   the far eye is mostly occluded by the combo pose and small counts may tie) */
{
  const ladder = ['bead15', 'e38', 'e45', 'e55', 'e65', 'base'];
  let mono = true;
  const checks = { 'sly-closeup': ['hisL', 'hisR'], combat: ['hisL'] };
  for (const [shotName, sides] of Object.entries(checks)) {
    for (const nm of sides) {
      let prev = -1;
      for (const vn of ladder) {
        const w = out.variants[vn][shotName].eyes[nm].scl.w ?? 0;
        if (w <= prev) mono = false;
        prev = w;
      }
    }
  }
  out.controls.monotone = mono;
  console.log(`MONOTONE CONTROL (sclW strictly increasing in E; closeup both eyes, combat near eye): ${mono}`);
}
/* known-bad separation at the registered signature */
{
  const kb = out.variants.bead15['sly-closeup'].eyes;
  const worst = Math.max(kb.hisL.unitToFace ?? 0, kb.hisR.unitToFace ?? 0);
  out.controls.knownBad = { unitToFaceMax: worst, failsBelow006: worst < 0.06 };
  console.log(`KNOWN-BAD (bead15 unit:face max ${worst}) reads as its own failure (<0.06): ${worst < 0.06}`);
}

applyEye(1, 1, 1); // leave the shared geometry pristine
writeFileSync(path.join(JSON_DIR, 'eyesize-proj.json'), JSON.stringify(out, null, 1));
console.log('\nwrote', path.join(JSON_DIR, 'eyesize-proj.json'), 'and PNGs in', OUT);
