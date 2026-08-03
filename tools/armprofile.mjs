/**
 * armprofile.mjs — the outboard silhouette PROFILE of the arm, labelled by MATERIAL BAND
 * (sleeve / bare forearm fur / glove cuff) rather than by bone, on a real `Shots.js` entry at
 * the real capture resolution.
 *
 * WHY THIS EXISTS. `armframe.mjs` answers "which PART owns the outboard edge" and its finest
 * label is ARM. The §7.3 arms item is not about the arm, it is about the two boundaries ON the
 * arm: the sleeve hem (t = 0.76, where `clothSwell` drops ~1.235 -> 1.000) and the glove cuff
 * (t = 0.965, where rx is multiplied by 1.14). Those are different MATERIAL groups on one
 * lofted tube — 'cloth' / 'fur' / 'clothDark' — so a bone label cannot separate them and a
 * colour predicate cannot either (§66.1). Material group is mesh identity, so it can.
 *
 * WHAT THIS IS, STATED AS THE GAP IT LEAVES (KNOWN_ISSUES §11) — the transforms between what
 * this computes and what the renderer draws, i.e. the suffix NOT implemented here:
 *   · foot IK       (`freezePose` sets `_ikW = 1`; nothing below the knee is trustworthy here)
 *   · the level     (no world geometry: nothing can be occluded by a wall or a ledge)
 *   · the shader / PostFX / tonemap
 *   · **the ink hull** — the inverted-hull shell extrudes the silhouette outward by ~2-3 px.
 *     It FATTENS whatever is on the outline; it does not change which band is there. It is why
 *     a step of <3 px is not a step. This tool reports raw geometry px and the ink hull is NOT
 *     subtracted anywhere.
 *   · antialiasing — edges here are hard, the capture's are not, so a 1 px step in this tool is
 *     a sub-pixel gradient in the PNG.
 * It DOES implement: the authored clip pose, the cane aim, the staged player yaw and position,
 * a real perspective camera from the shot's own pos/target/fov, and the capture's own 1280x720
 * raster — so every number below is already in the units the PNG is in. There is no conversion
 * step anywhere in this file, which is the point (§58.4's unit trap was a 900 -> 720 conversion).
 *
 * CONTROL, built in: the union of the three material bands must reproduce `armframe.mjs`'s ARM
 * outline rows for the same shot. If it does not, this tool's labelling is wrong and every
 * number it prints is void. Printed as CONTROL at the end.
 *
 *   node armprofile.mjs <shot>            e.g. sly-arm
 */
import * as THREE from 'three';

const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
  warn: (m) => engine.warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};

const { SlyModel } = await import('/home/user/Demo/src/player/SlyModel.js');
const { CLIPS, sampleInto, sampleCane } = await import('/home/user/Demo/src/player/Clips.js');
const { PoseBuffer } = await import('/home/user/Demo/src/player/Rig.js');
const { SHOTS } = await import('/home/user/Demo/src/core/Shots.js');

const shotName = process.argv[2] || 'sly-arm';
const S = SHOTS[shotName];
if (!S) { console.error(`no shot ${shotName}`); process.exit(1); }

const sly = new SlyModel(engine);
await sly.init();
if (!sly.mesh) { console.error('BUILD FAILED', engine.warnings); process.exit(1); }

const geo = sly.mesh.geometry;
const caneBaseQ = sly._canePivot ? sly._canePivot.quaternion.clone() : null;
const poseBuf = new PoseBuffer(sly.boneNames);

/* ---- labels: bone part x material group ---------------------------------- */
const GROUPS = ['fur', 'furCream', 'furDark', 'cloth', 'clothDark', 'gold', 'ink', 'eye'];
const boneNames = sly.mesh.skeleton.bones.map((b) => b.name);
const isArmBone = (n) => /^(upperArm|lowerArm)[LR]$/.test(n);
const bonePart = boneNames.map((n) => {
  if (isArmBone(n)) return 'ARM';
  if (/^hand[LR]$/.test(n)) return 'HAND';
  if (/^shoulder[LR]$/.test(n)) return 'SHOULDER';
  if (/^tail/.test(n)) return 'TAIL';
  if (/^(head|jaw|capBrim|ear[LR]|brow[LR]|neck)$/.test(n)) return 'HEAD';
  if (/^(upperLeg|lowerLeg|foot|toe)[LR]$/.test(n)) return 'LEG';
  return 'TORSO';
});

const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
const vertPart = new Array(geo.attributes.position.count);
for (let i = 0; i < vertPart.length; i++) {
  let best = -1, bw = -1;
  for (let k = 0; k < 4; k++) {
    const w = sw.getComponent(i, k);
    if (w > bw) { bw = w; best = si.getComponent(i, k); }
  }
  vertPart[i] = bonePart[best] ?? 'TORSO';
}

/* index-offset -> material group name. `toGeometry` emits one contiguous index run per group. */
const idxGroup = new Int8Array(geo.index.count).fill(-1);
for (const g of geo.groups) {
  for (let i = g.start; i < g.start + g.count && i < idxGroup.length; i++) idxGroup[i] = g.materialIndex;
}

/**
 * Band label for an arm triangle, from the material group it was emitted into:
 *   'cloth'     t < 0.76    -> SLEEVE   (clothSwell swells to ~1.235 then drops)
 *   'fur'       0.76..0.965 -> FOREARM  (the bare band, furLobe loft)
 *   'clothDark' t >= 0.965  -> CUFF     (rx * 1.14)
 * Non-arm triangles keep their part label, so the outline still reads TAIL / LEG / HEAD / CANE.
 */
function labelOf(part, gi) {
  if (part !== 'ARM') return part;
  const g = GROUPS[gi];
  if (g === 'cloth') return 'SLEEVE';
  if (g === 'fur') return 'FOREARM';
  if (g === 'clothDark') return 'CUFF';
  return 'ARMOTHER';
}

function applyClip(name) {
  const clip = CLIPS[name];
  if (!clip) return false;
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
  return true;
}

function stage(clip, playerPos, yaw) {
  if (!applyClip(clip)) return null;
  sly.root.position.set(playerPos[0], playerPos[1], playerPos[2]);
  sly.root.rotation.set(0, yaw, 0);
  sly.root.updateMatrixWorld(true);
  sly.skeleton.update();

  const pos = geo.attributes.position;
  const bones = sly.mesh.skeleton.bones, inv = sly.mesh.skeleton.boneInverses;
  const out = new Float32Array(pos.count * 3);
  const _sv = new THREE.Vector3(), _st = new THREE.Vector3(), _sm = new THREE.Matrix4();
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

  const tris = [];
  const bidx = geo.index.array;
  for (let i = 0; i < bidx.length; i += 3) {
    const a = bidx[i], b = bidx[i + 1], c = bidx[i + 2];
    const p = [vertPart[a], vertPart[b], vertPart[c]];
    const part = p[0] === p[1] || p[0] === p[2] ? p[0] : (p[1] === p[2] ? p[1] : p[0]);
    tris.push([a, b, c, out, labelOf(part, idxGroup[i])]);
  }
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
    for (let i = 0; i < ci.length; i += 3) tris.push([ci[i], ci[i + 1], ci[i + 2], cv, 'CANE']);
  }
  return { tris, skinned: out };
}

/* ---- raster: verbatim from armframe.mjs, so any difference is the labelling -- */
const LABELS = ['SLEEVE', 'FOREARM', 'CUFF', 'ARMOTHER', 'HAND', 'SHOULDER', 'TAIL', 'HEAD', 'LEG', 'TORSO', 'CANE'];
function raster(tris, camPos, camTarget, fovDeg, W, H) {
  const camWorld = new THREE.Matrix4().lookAt(
    new THREE.Vector3(...camPos), new THREE.Vector3(...camTarget), new THREE.Vector3(0, 1, 0));
  camWorld.setPosition(new THREE.Vector3(...camPos));
  const inv = camWorld.clone().invert();
  const f = 1 / Math.tan((fovDeg * Math.PI / 180) / 2);
  const aspect = W / H;

  const lab = new Int8Array(W * H).fill(-1);
  const depth = new Float32Array(W * H).fill(Infinity);
  const _v = new THREE.Vector3();
  const P = [0, 0, 0].map(() => [0, 0, 0]);

  for (const [a, b, c, arr, L] of tris) {
    const li = LABELS.indexOf(L);
    let behind = false;
    for (let j = 0; j < 3; j++) {
      const i = [a, b, c][j];
      _v.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(inv);
      const z = -_v.z;
      if (z <= 0.05) { behind = true; break; }
      P[j][0] = (_v.x * f / aspect / z) * 0.5 * W + W / 2;
      P[j][1] = H / 2 - (_v.y * f / z) * 0.5 * H;
      P[j][2] = z;
    }
    if (behind) continue;
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
        if (z >= depth[o]) continue;
        depth[o] = z; lab[o] = li;
      }
    }
  }
  return { lab, depth, W, H };
}

const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const { tris, skinned } = stage(S.player.pose, S.player.pos, S.player.yaw);
const img = raster(tris, S.pos, S.target, S.fov, W, H);

console.log(`${shotName}: pose=${S.player.pose} yaw=${S.player.yaw} cam=[${S.pos}] fov=${S.fov}  @${W}x${H}`);
console.log('units: raw geometry pixels at the capture resolution. NO conversion. ink hull NOT subtracted.\n');

/* ---- figure extent + the outboard (right) edge profile -------------------- */
const rows = [];
for (let y = 0; y < H; y++) {
  let l = -1, r = -1;
  for (let x = 0; x < W; x++) if (img.lab[y * W + x] >= 0) { l = x; break; }
  if (l < 0) { rows.push(null); continue; }
  for (let x = W - 1; x >= 0; x--) if (img.lab[y * W + x] >= 0) { r = x; break; }
  rows.push({ y, lx: l, rx: r, L: LABELS[img.lab[y * W + l]], R: LABELS[img.lab[y * W + r]] });
}
const present = rows.filter((r) => r);
const yTop = present[0].y, yBot = present[present.length - 1].y;
const figureH = yBot - yTop + 1;
console.log(`figure: rows ${yTop}..${yBot} = ${figureH} px tall`);

const tally = {};
for (const r of present) tally[r.R] = (tally[r.R] || 0) + 1;
console.log('right-outline owners:', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));

const ARMBANDS = new Set(['SLEEVE', 'FOREARM', 'CUFF', 'ARMOTHER']);
const armRows = present.filter((r) => ARMBANDS.has(r.R));
console.log(`\nband rows on the right outline: ` +
  ['SLEEVE', 'FOREARM', 'CUFF', 'ARMOTHER'].map((b) => `${b}=${armRows.filter((r) => r.R === b).length}`).join(' '));

if (armRows.length) {
  const y0 = armRows[0].y, y1 = armRows[armRows.length - 1].y;
  console.log(`\nrow  rx   band      (outboard edge x, arm-owned rows ${y0}..${y1})`);
  for (const r of present) {
    if (r.y < y0 - 6 || r.y > y1 + 6) continue;
    console.log(`${String(r.y).padStart(4)} ${String(r.rx).padStart(4)}  ${r.R}`);
  }

  /* The two authored events, measured as the jump in the outboard edge across the row where
     ownership flips. Reported as a signed px step; distal is DOWN the arm here. */
  function stepAt(fromBand, toBand) {
    for (let i = 1; i < present.length; i++) {
      const a = present[i - 1], b = present[i];
      if (a.R === fromBand && b.R === toBand) {
        const preRows = present.slice(Math.max(0, i - 4), i).filter((r) => r.R === fromBand);
        const postRows = present.slice(i, i + 4).filter((r) => r.R === toBand);
        if (!preRows.length || !postRows.length) return null;
        const pre = preRows.reduce((s, r) => s + r.rx, 0) / preRows.length;
        const post = postRows.reduce((s, r) => s + r.rx, 0) / postRows.length;
        return { y: b.y, pre, post, step: post - pre };
      }
    }
    return null;
  }
  const hem = stepAt('SLEEVE', 'FOREARM');
  const cuff = stepAt('FOREARM', 'CUFF');
  console.log('\n--- the two authored silhouette events, in this frame ---');
  console.log(`sleeve -> forearm (t=0.76, clothSwell 1.235->1.000):`, hem
    ? `at y=${hem.y}  ${hem.pre.toFixed(1)} -> ${hem.post.toFixed(1)} px   STEP ${hem.step.toFixed(2)} px`
    : 'NOT ON THE OUTLINE in this framing');
  console.log(`forearm -> cuff   (t=0.965, rx x1.14):`, cuff
    ? `at y=${cuff.y}  ${cuff.pre.toFixed(1)} -> ${cuff.post.toFixed(1)} px   STEP ${cuff.step.toFixed(2)} px`
    : 'NOT ON THE OUTLINE in this framing  <-- the registered RULER is absent');
  if (hem && cuff && Math.abs(cuff.step) > 1e-6) {
    console.log(`RATIO |hem| / |cuff| = ${(Math.abs(hem.step) / Math.abs(cuff.step)).toFixed(3)}   (unit-free)`);
  }
}

/* ---- physical prior: the arm's real world radius at each boundary --------- */
/* Independent of the raster. If a px step is impossible for the authored radius change, the
   px reading is wrong, not the geometry (§53.7's 32 cm forearm, caught the same way). */
const armInfo = sly._armInfo;
const camV = new THREE.Vector3(...S.pos);
{
  const bone = sly.bones.lowerArmR || sly.bones.lowerArmL;
  const wp = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  const dist = camV.distanceTo(wp);
  const f = 1 / Math.tan((S.fov * Math.PI / 180) / 2);
  const pxPerM = (f / dist) * 0.5 * H;
  console.log(`\n--- physical prior (no raster) ---`);
  console.log(`lowerArm at ${dist.toFixed(3)} m from the lens -> ${pxPerM.toFixed(1)} px/m at that depth`);
  console.log(`figure ${figureH} px for a ${sly.height ?? 1.774} m character -> ${(figureH / (sly.height ?? 1.774)).toFixed(1)} px/m overall`);
  if (armInfo) {
    const k = Object.keys(armInfo)[0];
    console.log(`armInfo: cuffStart=${armInfo[k].cuffStart} gloveStart=${armInfo[k].gloveStart}`);
  }
  // Measure the skinned tube's radius just inside each band, from the vertices themselves.
  const bandVerts = { SLEEVE: [], FOREARM: [], CUFF: [] };
  const bidx = geo.index.array;
  for (let i = 0; i < bidx.length; i += 3) {
    const a = bidx[i];
    if (vertPart[a] !== 'ARM') continue;
    const g = GROUPS[idxGroup[i]];
    const b = g === 'cloth' ? 'SLEEVE' : g === 'fur' ? 'FOREARM' : g === 'clothDark' ? 'CUFF' : null;
    if (b) bandVerts[b].push(a);
  }
  for (const b of ['SLEEVE', 'FOREARM', 'CUFF']) {
    const vs = bandVerts[b];
    if (!vs.length) { console.log(`${b}: no verts`); continue; }
    // axis = principal direction; radius = mean distance from the band's own axis line
    let cx = 0, cy = 0, cz = 0;
    for (const i of vs) { cx += skinned[i * 3]; cy += skinned[i * 3 + 1]; cz += skinned[i * 3 + 2]; }
    cx /= vs.length; cy /= vs.length; cz /= vs.length;
    let rsum = 0;
    for (const i of vs) {
      rsum += Math.hypot(skinned[i * 3] - cx, skinned[i * 3 + 1] - cy, skinned[i * 3 + 2] - cz);
    }
    console.log(`${b}: ${vs.length} verts, mean spread from band centroid ${(rsum / vs.length * 100).toFixed(2)} cm`);
  }
}

/* ---- CONTROL: the band union must reproduce armframe's ARM outline rows ---- */
console.log(`\nCONTROL — union of material bands on the right outline = ${armRows.length} rows.`);
console.log(`  armframe.mjs "exact ${shotName}" must report the same ARM row count on that side.`);
console.log(`  If these disagree, the labelling in THIS file is wrong and its numbers are void.`);
