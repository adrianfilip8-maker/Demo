/**
 * armframe.mjs — "which PART owns the outboard silhouette edge", for a candidate camera that
 * does not exist yet.
 *
 * Why this and not `armedge.mjs`: that tool runs colour predicates over a shipped capture, and
 * Sly's arms are the same body-blue as his torso, so it cannot separate an arm edge from a
 * flank edge even in principle. This classifies by **dominant skin bone**, which is mesh
 * identity, so `upperArmL` on the outline is distinguishable from `chest` on the outline.
 *
 * WHAT THIS IS, STATED AS THE GAP IT LEAVES (KNOWN_ISSUES §11) — the transforms between what
 * this computes and what the renderer draws, i.e. the suffix NOT implemented here:
 *   · foot IK        (`freezePose` sets `_ikW = 1`; nothing below the knee is trustworthy here)
 *   · the level      (no world geometry: nothing can be occluded by a wall or a ledge)
 *   · the shader / PostFX
 *   · **the ink hull** — the inverted-hull shell extrudes the silhouette outward by ~2-3 px.
 *     That FATTENS whatever is already on the outline; it does not change WHICH part is there,
 *     which is the only question asked here. It does mean a margin of <3 px is not a margin.
 * It DOES implement: the authored clip pose, the cane aim, the staged player yaw and position,
 * and a real perspective camera from pos/target/fov — so the answer transfers to `Shots.js`
 * directly rather than by analogy from an orthographic turntable.
 *
 *   node armframe.mjs sweep [clip ...]     sweep camera azimuth × clip, rank by arm-owned rows
 *   node armframe.mjs one <clip> <yaw> <az> <elevDeg> <dist> <fov>   dump one candidate per-row
 */
import * as THREE from 'three';

const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
  warn: (m) => engine.warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};

const { SlyModel } = await import('/home/user/Demo/src/player/SlyModel.js');
const { CLIPS, CLIP_NAMES, sampleInto, sampleCane } = await import('/home/user/Demo/src/player/Clips.js');
const { PoseBuffer } = await import('/home/user/Demo/src/player/Rig.js');

const sly = new SlyModel(engine);
await sly.init();
if (!sly.mesh) { console.error('BUILD FAILED', engine.warnings); process.exit(1); }

const geo = sly.mesh.geometry;
const caneBaseQ = sly._canePivot ? sly._canePivot.quaternion.clone() : null;
const poseBuf = new PoseBuffer(sly.boneNames);

/* ---- part labels, from the dominant skin bone ---------------------------- */
const boneNames = sly.mesh.skeleton.bones.map((b) => b.name);
function partOfBone(n) {
  if (process.env.SPLIT === '1' && /^upperArm[LR]$/.test(n)) return 'UARM';
  if (/^(upperArm|lowerArm)[LR]$/.test(n)) return 'ARM';
  if (/^hand[LR]$/.test(n)) return 'HAND';
  if (/^shoulder[LR]$/.test(n)) return 'SHOULDER';
  if (/^tail/.test(n)) return 'TAIL';
  if (/^(head|jaw|capBrim|ear[LR]|brow[LR]|neck)$/.test(n)) return 'HEAD';
  if (/^(upperLeg|lowerLeg|foot|toe)[LR]$/.test(n)) return 'LEG';
  return 'TORSO';
}
const bonePart = boneNames.map(partOfBone);

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

/** Stage the character exactly as Debug.setShot does: root position + yaw, then skin. */
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
    // Majority label of the triangle's three vertices; ties take the first.
    const p = [vertPart[a], vertPart[b], vertPart[c]];
    const lab = p[0] === p[1] || p[0] === p[2] ? p[0] : (p[1] === p[2] ? p[1] : p[0]);
    tris.push([a, b, c, out, lab]);
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
  return tris;
}

/* ---- real perspective rasteriser ---------------------------------------- */
const LABELS = ['ARM', 'HAND', 'SHOULDER', 'TAIL', 'HEAD', 'LEG', 'TORSO', 'CANE', 'UARM'];
/* The §7.3 item is FUR breaking the silhouette on the backs of the arms. The glove is a
   separate material group (cloth), so a HAND row is not evidence for it — counting HAND as
   "arm on the outline" is what made a first sweep of this rank `sly-closeup` as qualifying at
   44 rows when its forearm count is exactly ZERO. Set ARM_ONLY=0 to include gloves. */
const ARM_ONLY = process.env.ARM_ONLY !== '0';
const isArmPart = (L) => L === 'ARM' || (!ARM_ONLY && L === 'HAND');
function raster(tris, camPos, camTarget, fovDeg, W, H) {
  // Camera world matrix from lookAt, then inverted to give the view transform. `Matrix4.lookAt`
  // fills the rotation basis only, so the eye position is set afterwards.
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
      const z = -_v.z;                       // view-space depth, +forward
      if (z <= 0.05) { behind = true; break; }
      P[j][0] = (_v.x * f / aspect / z) * 0.5 * W + W / 2;
      P[j][1] = H / 2 - (_v.y * f / z) * 0.5 * H;
      P[j][2] = z;
    }
    if (behind) continue;                    // near-plane drop; see raster.mjs / §10
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
  return { lab, W, H };
}

/** For every row, which label owns the leftmost and rightmost figure pixel. */
function outlineOwners({ lab, W, H }) {
  const rows = [];
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (lab[y * W + x] >= 0) { l = x; break; }
    if (l < 0) { rows.push(null); continue; }
    for (let x = W - 1; x >= 0; x--) if (lab[y * W + x] >= 0) { r = x; break; }
    rows.push({ y, lx: l, rx: r, L: LABELS[lab[y * W + l]], R: LABELS[lab[y * W + r]] });
  }
  return rows;
}

/**
 * Outboard DEPTH of the arm at a row: how many consecutive pixels inward from the silhouette
 * edge are still an arm part. This is the number that decides whether a row is usable.
 *
 * A row can be "arm-owned" at 1 px and mean nothing: the inverted-hull ink shell extrudes the
 * silhouette outward by ~2-3 px, so an arm that is proud of the flank by less than that is
 * inside its own outline and cannot show a fur break. Counting rows without measuring depth is
 * how a ranked list produces a framing that measures nothing.
 */
function armDepth({ lab, W }, y, x, dir) {
  let d = 0;
  for (let i = x; i >= 0 && i < W; i += dir) {
    const L = LABELS[lab[y * W + i]];
    if (!isArmPart(L)) break;
    d++;
  }
  return d;
}

/** Longest run of consecutive rows whose left OR right outline is an arm part. */
function armRun(rows) {
  let best = 0, bestStart = -1, cur = 0, curStart = -1, side = null, bestSide = null;
  for (const r of rows) {
    const isArm = r && (isArmPart(r.L) || isArmPart(r.R));
    if (isArm) {
      if (cur === 0) { curStart = r.y; side = (r.L === 'ARM' || r.L === 'HAND') ? 'L' : 'R'; }
      cur++;
      if (cur > best) { best = cur; bestStart = curStart; bestSide = side; }
    } else cur = 0;
  }
  return { rows: best, start: bestStart, side: bestSide };
}

const mode = process.argv[2] || 'sweep';
const PLAYER = [0, 0, 30];

/* `exact` mode: run a REAL entry from Shots.js at the real capture resolution, so the offline
   prediction can be controlled against the shipped PNG of that same shot. Without this the tool
   is only comparable to itself. */
if (mode === 'exact') {
  const { SHOTS } = await import('/home/user/Demo/src/core/Shots.js');
  const name = process.argv[3];
  const s = SHOTS[name];
  if (!s) { console.error(`no shot ${name}; have: ${Object.keys(SHOTS).join(' ')}`); process.exit(1); }
  const W = +(process.env.W || 1280), H = +(process.env.H || 720);
  const tris = stage(s.player.pose, s.player.pos, s.player.yaw);
  const img = raster(tris, s.pos, s.target, s.fov, W, H);
  const rows = outlineOwners(img);
  const MIN_DEPTH = +(process.env.MIN_DEPTH || 5);
  console.log(`${name}: pose=${s.player.pose} yaw=${s.player.yaw} playerPos=[${s.player.pos}] cam=[${s.pos}] target=[${s.target}] fov=${s.fov}  @${W}x${H}`);
  const present = rows.filter((r) => r);
  if (!present.length) { console.log('  character contributes NO pixels in this framing'); process.exit(0); }
  console.log(`figure spans rows ${present[0].y}..${present[present.length - 1].y} (${present.length} rows), x ${Math.min(...present.map((r) => r.lx))}..${Math.max(...present.map((r) => r.rx))}`);
  const tally = {};
  for (const r of present) { tally[r.L] = (tally[r.L] || 0) + 1; tally['R:' + r.R] = (tally['R:' + r.R] || 0) + 1; }
  console.log('left-outline owners: ', Object.entries(tally).filter(([k]) => !k.startsWith('R:')).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('right-outline owners:', Object.entries(tally).filter(([k]) => k.startsWith('R:')).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.slice(2)}=${v}`).join(' '));
  let best = 0, bestStart = -1, bestSide = null, cur = 0, curStart = -1, curSide = null, deps = [];
  for (const r of rows) {
    let ok = false, side = null, dep = 0;
    if (r) {
      if (isArmPart(r.L)) { const d = armDepth(img, r.y, r.lx, +1); if (d >= MIN_DEPTH) { ok = true; side = 'L'; dep = d; } }
      if (!ok && isArmPart(r.R)) { const d = armDepth(img, r.y, r.rx, -1); if (d >= MIN_DEPTH) { ok = true; side = 'R'; dep = d; } }
    }
    if (ok) { if (cur === 0) { curStart = r.y; curSide = side; } cur++; deps.push(dep); if (cur > best) { best = cur; bestStart = curStart; bestSide = curSide; } } else cur = 0;
  }
  deps.sort((a, b) => a - b);
  console.log(`depth-qualified arm outline (>=${MIN_DEPTH}px): ${best} consecutive rows from y=${bestStart} side ${bestSide}; median depth ${deps.length ? deps[deps.length >> 1] : 0}px over ${deps.length} rows`);
  console.log('\nrow    lx  leftOwner   Ldep    rx  rightOwner  Rdep');
  for (const r of present) {
    if (r.y % 10) continue;
    const ld = isArmPart(r.L) ? armDepth(img, r.y, r.lx, +1) : 0;
    const rd = isArmPart(r.R) ? armDepth(img, r.y, r.rx, -1) : 0;
    console.log(`${String(r.y).padStart(4)}  ${String(r.lx).padStart(4)}  ${r.L.padEnd(10)} ${String(ld).padStart(4)}   ${String(r.rx).padStart(4)}  ${r.R.padEnd(10)} ${String(rd).padStart(4)}`);
  }
  process.exit(0);
}

function camFor(az, elevDeg, dist, aimY) {
  // az in degrees, measured the same way a shot's camera bearing is: 0 = due +Z (south, toward
  // the approach), increasing counter-clockwise seen from above.
  const a = az * Math.PI / 180, e = elevDeg * Math.PI / 180;
  const hx = Math.sin(a) * Math.cos(e), hz = Math.cos(a) * Math.cos(e);
  return {
    pos: [PLAYER[0] + hx * dist, aimY + Math.sin(e) * dist, PLAYER[2] + hz * dist],
    target: [PLAYER[0], aimY, PLAYER[2]],
  };
}

/* `fine`: hold a reference shot's pose, yaw, distance, elevation and lens, and move ONLY the
   camera bearing. Reported at the real capture resolution with the depth qualifier, because a
   row count at 320x480 does not tell you whether the ink hull swallows the read at 1280x720. */
/* `spec`: the final artefact. Takes the literal numbers that would go into Shots.js and
   reports the depth-qualified span AND which bone owns it, so the claim in the handoff is
   checkable rather than quoted. Splits upperArm from lowerArm because "backs of the arms" in
   §7.3 is about the fur tube, and a span owned entirely by the deltoid would be a different
   claim from one owned by the forearm. */
if (mode === 'spec') {
  const clip = process.argv[3], yaw = +process.argv[4];
  const pos = process.argv[5].split(',').map(Number), target = process.argv[6].split(',').map(Number);
  const fov = +process.argv[7];
  const W = +(process.env.W || 1280), H = +(process.env.H || 720);
  const MIN_DEPTH = +(process.env.MIN_DEPTH || 5);
  // Re-label at bone granularity for this mode only.
  const fine = boneNames.map((n) => (/^(upperArm|lowerArm)[LR]$/.test(n) ? n : null));
  const tris = stage(clip, PLAYER, yaw);
  const img = raster(tris, pos, target, fov, W, H);
  const rows = outlineOwners(img);
  const present = rows.filter((r) => r);
  console.log(`SPEC  pose=${clip} yaw=${yaw} pos=[${pos}] target=[${target}] fov=${fov}  @${W}x${H}`);
  console.log(`figure: ${present.length} rows, y ${present[0].y}..${present[present.length-1].y}, x ${Math.min(...present.map(r=>r.lx))}..${Math.max(...present.map(r=>r.rx))}`);
  let best = 0, bs = -1, be = -1, side = null, cur = 0, cs = -1, csd = null, deps = [];
  for (const r of rows) {
    let ok = false, sd = null, dep = 0;
    if (r) {
      if (isArmPart(r.L)) { const d = armDepth(img, r.y, r.lx, +1); if (d >= MIN_DEPTH) { ok = true; sd = 'L'; dep = d; } }
      if (!ok && isArmPart(r.R)) { const d = armDepth(img, r.y, r.rx, -1); if (d >= MIN_DEPTH) { ok = true; sd = 'R'; dep = d; } }
    }
    if (ok) { if (cur === 0) { cs = r.y; csd = sd; } cur++; deps.push(dep); if (cur > best) { best = cur; bs = cs; be = r.y; side = csd; } } else cur = 0;
  }
  const sorted = [...deps].sort((a,b)=>a-b);
  console.log(`DEPTH-QUALIFIED ARM ON OUTBOARD OUTLINE (>=${MIN_DEPTH}px proud, gloves excluded):`);
  console.log(`  ${best} consecutive rows, y ${bs}..${be}, ${side==='L'?'left (outboard)':'right (outboard)'} edge`);
  console.log(`  arm depth: min ${sorted[0]}px  median ${sorted[sorted.length>>1]}px  max ${sorted[sorted.length-1]}px  over ${deps.length} qualifying rows total`);
  console.log(`  ink hull is ~2-3px, so the median span stands ${(sorted[sorted.length>>1]/3).toFixed(0)}x clear of it`);
  process.exit(0);
}

if (mode === 'fine') {
  const clip = process.argv[3], yaw = +process.argv[4];
  const dist = +process.argv[5], elev = +process.argv[6], fov = +process.argv[7], aimY = +process.argv[8];
  const W = +(process.env.W || 1280), H = +(process.env.H || 720);
  const MIN_DEPTH = +(process.env.MIN_DEPTH || 5);
  const tris = stage(clip, PLAYER, yaw);
  console.log(`clip=${clip} yaw=${yaw} dist=${dist} elev=${elev} fov=${fov} aimY=${aimY} @${W}x${H} MIN_DEPTH=${MIN_DEPTH} ARM_ONLY=${ARM_ONLY}`);
  console.log(' az   run  side  span(rows)   medDepth  figurePx  leftOwners');
  const out = [];
  for (let az = 0; az < 360; az += 5) {
    const { pos, target } = camFor(az, elev, dist, aimY);
    const img = raster(tris, pos, target, fov, W, H);
    const rows = outlineOwners(img);
    const present = rows.filter((r) => r);
    let best = 0, bestStart = -1, bestEnd = -1, bestSide = null, cur = 0, curStart = -1, curSide = null, deps = [];
    for (const r of rows) {
      let ok = false, side = null, dep = 0;
      if (r) {
        if (isArmPart(r.L)) { const d = armDepth(img, r.y, r.lx, +1); if (d >= MIN_DEPTH) { ok = true; side = 'L'; dep = d; } }
        if (!ok && isArmPart(r.R)) { const d = armDepth(img, r.y, r.rx, -1); if (d >= MIN_DEPTH) { ok = true; side = 'R'; dep = d; } }
      }
      if (ok) { if (cur === 0) { curStart = r.y; curSide = side; } cur++; deps.push(dep); if (cur > best) { best = cur; bestStart = curStart; bestEnd = r.y; bestSide = curSide; } } else cur = 0;
    }
    deps.sort((a, b) => a - b);
    out.push({ az, best, bestStart, bestEnd, bestSide, med: deps.length ? deps[deps.length >> 1] : 0, px: present.length });
  }
  out.sort((a, b) => b.best - a.best);
  for (const o of out.slice(0, 14))
    console.log(`${String(o.az).padStart(3)}  ${String(o.best).padStart(4)}   ${o.bestSide || '-'}    y ${String(o.bestStart).padStart(3)}..${String(o.bestEnd).padStart(3)}     ${String(o.med).padStart(5)}    ${String(o.px).padStart(5)}`);
  process.exit(0);
}

if (mode === 'sweep') {
  const clips = process.argv.slice(3);
  const list = clips.length ? clips : CLIP_NAMES;
  const results = [];
  for (const clip of list) {
    if (!CLIPS[clip]) continue;
    for (const yaw of [5.24]) {
      for (let az = 0; az < 360; az += 15) {
        const { pos, target } = camFor(az, 8, 3.0, 1.0);
        const tris = stage(clip, PLAYER, yaw);
        if (!tris) continue;
        const img = raster(tris, pos, target, 34, 320, 480);
        const rows = outlineOwners(img);
        const run = armRun(rows);
        const total = rows.filter((r) => r && (isArmPart(r.L) || isArmPart(r.R))).length;
        if (run.rows > 0) results.push({ clip, yaw, az, run: run.rows, side: run.side, start: run.start, total });
      }
    }
  }
  results.sort((a, b) => b.run - a.run);
  console.log('clip                 yaw    az   longest-run  side  startRow  totalArmRows');
  for (const r of results.slice(0, 40))
    console.log(`${r.clip.padEnd(20)} ${r.yaw.toFixed(2)} ${String(r.az).padStart(4)}   ${String(r.run).padStart(9)}  ${r.side}     ${String(r.start).padStart(5)}   ${String(r.total).padStart(6)}`);
  console.log(`\ncandidates with any arm-owned row: ${results.length}`);
} else {
  const [, , , clip, yawS, azS, elevS, distS, fovS] = process.argv;
  const yaw = +yawS, az = +azS, elev = +elevS, dist = +distS, fov = +fovS;
  const { pos, target } = camFor(az, elev, dist, 1.0);
  const tris = stage(clip, PLAYER, yaw);
  const img = raster(tris, pos, target, fov, 1280, 720);
  const rows = outlineOwners(img);
  const run = armRun(rows);
  console.log(`clip=${clip} yaw=${yaw} az=${az} elev=${elev} dist=${dist} fov=${fov}`);
  console.log(`cam  pos: [${pos.map((v) => v.toFixed(2)).join(', ')}]  target: [${target.map((v) => v.toFixed(2)).join(', ')}]`);
  const first = rows.findIndex((r) => r), last = rows.length - 1 - [...rows].reverse().findIndex((r) => r);
  console.log(`figure spans rows ${first}..${last} (${last - first + 1} px tall)`);
  console.log(`longest consecutive arm-owned run: ${run.rows} rows from y=${run.start} on side ${run.side}`);

  // Depth-qualified span: consecutive rows where an arm owns the outline AND is proud of
  // whatever is behind it by >= MIN_DEPTH px, so the ink hull cannot swallow the read.
  const MIN_DEPTH = +(process.env.MIN_DEPTH || 5);
  let best = 0, bestStart = -1, bestSide = null, cur = 0, curStart = -1, curSide = null;
  const depths = [];
  for (const r of rows) {
    let ok = false, side = null, dep = 0;
    if (r) {
      if (isArmPart(r.L)) { const d = armDepth(img, r.y, r.lx, +1); if (d >= MIN_DEPTH) { ok = true; side = 'L'; dep = d; } }
      if (!ok && isArmPart(r.R)) { const d = armDepth(img, r.y, r.rx, -1); if (d >= MIN_DEPTH) { ok = true; side = 'R'; dep = d; } }
    }
    if (ok) {
      if (cur === 0) { curStart = r.y; curSide = side; }
      cur++; depths.push(dep);
      if (cur > best) { best = cur; bestStart = curStart; bestSide = curSide; }
    } else cur = 0;
  }
  depths.sort((a, b) => a - b);
  const med = depths.length ? depths[depths.length >> 1] : 0;
  console.log(`depth-qualified (>=${MIN_DEPTH}px proud): ${best} consecutive rows from y=${bestStart} on side ${bestSide}; median arm depth ${med}px over ${depths.length} qualifying rows`);

  console.log('\nrow    lx  leftOwner   Ldep    rx  rightOwner  Rdep');
  for (const r of rows) {
    if (!r || r.y % 8) continue;
    const ld = isArmPart(r.L) ? armDepth(img, r.y, r.lx, +1) : 0;
    const rd = isArmPart(r.R) ? armDepth(img, r.y, r.rx, -1) : 0;
    console.log(`${String(r.y).padStart(4)}  ${String(r.lx).padStart(4)}  ${r.L.padEnd(10)} ${String(ld).padStart(4)}   ${String(r.rx).padStart(4)}  ${r.R.padEnd(10)} ${String(rd).padStart(4)}`);
  }
}
