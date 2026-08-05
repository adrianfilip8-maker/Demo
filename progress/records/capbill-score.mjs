/**
 * capbill-score.mjs — the records scorer for PREREG-capbill.md §6, committed with the run
 * BEFORE scoring (the seal's own requirement). Implements EXACTLY the registered definition:
 *
 *   E(arm, shot) = max outboard excursion, in px, of the head outline at the registered bill
 *   rows relative to the straight interpolation of the outline between the crown band above
 *   and the cheek band below.
 *
 * Rows and outboard side come from capbill-proj.mjs's projection machinery at the capture
 * tree (the model built by THIS file with the same skin/pose/yaw math, projected through the
 * REAL perspective shot camera at 1280x720 rather than the 420-crop orthographic basis —
 * validated by reproducing the prereg's own px/m figures, 289.6 closeup / 168.3 combat).
 * The bill rows are padded ±25 px per the seal ("pose/IK offsets the projector cannot see").
 *
 * Implementation choices the seal leaves to the scorer, STATED before frames are read:
 *  - "registered bill rows" = union of the projected brim-tube row extents of the base AND
 *    yawR10 variants (the rows where a bill silhouette event can live in either arm), padded
 *    ±25 and clamped inside the figure (crownTop+2 .. chin-2). One row set per shot, shared
 *    by all arms — E(A) and E(B) are compared on identical rows.
 *  - crown band = the ≤12 figure rows immediately ABOVE the unpadded bill core rows;
 *    cheek band = the ≤12 figure rows immediately BELOW. Anchors abut the unpadded core, not
 *    the padded scan band, because at sly-closeup the +25 pad reaches the crown apex (sky).
 *    Anchor x = median outline x over the band's valid rows; ≥3 valid rows required per band
 *    or the shot is INSTRUMENT-SUSPECT. A large pose offset (>12 rows) would contaminate an
 *    anchor; staging warnings in capbill.json are the check on that.
 *  - outline extraction "at the sky boundary": per row, start 50 px outboard of the projected
 *    bill region (10 beyond the scoreability strip), require the start px to be sky
 *    (luma > 120, BT.709 — the same definition sbs1-measure.py registered), scan INBOARD to
 *    the first run of ≥3 consecutive non-sky px; outline x = first px of that run. Rows whose
 *    start px is not sky, or with no boundary before the head centre, are invalid and dropped.
 *  - luma = 0.2126 R + 0.7152 G + 0.0722 B (CHARACTER's registered definition).
 *
 * GATES, verbatim from the seal (bands, not points — §133.1):
 *  - SCOREABILITY first (§141: unscoreable is a registered outcome): in arm A the 40 px
 *    outboard of the projected bill region must be sky (luma > 120) at both shots.
 *  - GATE 1  E(A,closeup) ∈ [1,7] px (else instrument suspect — do NOT score B against it);
 *            E(B,closeup) ≥ 8 px AND E(B)−E(A) ≥ 5 px.
 *  - GATE 2  E(A,combat) ∈ [15,30] px; E(B,combat) ≥ E(A,combat) − 3 px.
 *  - GATE 3  BACK ≡ A: same srcTree at both navigations AND whole-frame diff (any px with
 *            ΣRGB ≥ 4 — threshold stated per §122.1) ≤ 200 px on both shots. If the tree
 *            moved: §160.4 bound reading — verdict may stand ONLY if the A↔BACK residual
 *            inside both registered bill ROIs is 0 px; otherwise VOID.
 *  - GATE 4  ≥90% of A↔B differing px (ΣRGB ≥ 4) inside the head bbox + 25 px pad, per shot;
 *            headratio unchanged to 2 decimals (read from capbill.json, measured in-ticket).
 *  - SIGN    if B *reduces* closeup E → VOID (projector sign convention or token wiring wrong
 *            — fix the instrument, do not interpret).
 *
 * Controls in THIS file (a number that cannot fail is not a measurement):
 *  --selftest  synthetic frames (straight edge, slanted edge, known 12 px bump) must recover
 *              E = 0 / 0 / 12 (±1). Runs automatically before scoring; scoring REFUSES on fail.
 *  --dryrun    projection-only: prints px/m (must land near 289.6 / 168.3), bill rows,
 *              outboard side, band placement — runnable before any frame exists.
 *
 *   node capbill-score.mjs [--selftest | --dryrun | --score]
 */
import * as THREE from 'three';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../tools/png.mjs';

const ROOT = '/home/user/Demo';
const REC = path.join(ROOT, 'progress/records/capbill');
const W = 1280, H = 720;
const SHOT_NAMES = ['sly-closeup', 'combat'];
const PAD = 25, BANDN = 12, SKY = 120, SUMRGB = 4;
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* ===================== E extraction (pure, selftestable) ===================== */
/**
 * @param im        {w,h,ch,data} from readPNG
 * @param geom      { scanRows:[lo,hi], coreRows:[lo,hi], crownTop, chin, outboard:'left'|'right',
 *                    scanStartX, headCx }
 * returns { E, rowsUsed, crownAnchor, cheekAnchor, invalidRows, outline: Map }
 */
function measureE(im, geom) {
  const { coreRows, scanRows, crownTop, chin, outboard, scanStartX, headCx } = geom;
  const dirIn = outboard === 'left' ? +1 : -1; // scanning inboard
  const outlineAt = (y) => {
    let x = scanStartX;
    if (x < 1 || x > im.w - 2 || y < 0 || y > im.h - 1) return null;
    const L = (xx) => { const i = (y * im.w + xx) * im.ch; return luma(im.data[i], im.data[i + 1], im.data[i + 2]); };
    if (L(x) <= SKY) return null; // start px must be sky
    const stop = headCx;
    while (dirIn > 0 ? x < stop : x > stop) {
      if (L(x) <= SKY && L(x + dirIn) <= SKY && L(x + 2 * dirIn) <= SKY) return x; // run of ≥3
      x += dirIn;
    }
    return null;
  };
  const band = (rows) => {
    const xs = [];
    for (const y of rows) { const x = outlineAt(y); if (x != null) xs.push(x); }
    if (xs.length < 3) return null;
    xs.sort((a, b) => a - b);
    return { x: xs[xs.length >> 1], n: xs.length };
  };
  // crown band: ≤BANDN figure rows immediately above the core; cheek band: immediately below
  const crownRows = [], cheekRows = [];
  for (let y = coreRows[0] - 1; y >= Math.max(crownTop + 2, coreRows[0] - BANDN) ; y--) crownRows.push(y);
  for (let y = coreRows[1] + 1; y <= Math.min(chin - 2, coreRows[1] + BANDN); y++) cheekRows.push(y);
  const crown = band(crownRows), cheek = band(cheekRows);
  if (!crown || !cheek) return { E: null, reason: 'anchor band <3 valid rows', crown, cheek };
  const yC = crownRows.reduce((a, b) => a + b, 0) / crownRows.length;
  const yK = cheekRows.reduce((a, b) => a + b, 0) / cheekRows.length;
  const xLine = (y) => crown.x + (cheek.x - crown.x) * ((y - yC) / (yK - yC));
  let E = -1e9, rowsUsed = 0, invalid = 0, atRow = -1;
  const sgn = outboard === 'left' ? +1 : -1; // excursion positive when outline sits outboard of line
  for (let y = scanRows[0]; y <= scanRows[1]; y++) {
    const x = outlineAt(y);
    if (x == null) { invalid++; continue; }
    rowsUsed++;
    const e = sgn * (xLine(y) - x);
    if (e > E) { E = e; atRow = y; }
  }
  if (!rowsUsed) return { E: null, reason: 'no valid scan rows', crown, cheek };
  return { E: +E.toFixed(1), atRow, rowsUsed, invalidRows: invalid, crownAnchor: crown, cheekAnchor: cheek };
}

/* ============================== selftest ==================================== */
function synth(bumpPx, slope) {
  // 400x400 RGB: sky 200, figure 30. Figure right of edge; outboard = LEFT.
  const im = { w: 400, h: 400, ch: 3, data: Buffer.alloc(400 * 400 * 3, 200) };
  for (let y = 100; y <= 300; y++) {
    let edge = 200 + Math.round((y - 100) * slope);
    if (bumpPx && y >= 150 && y <= 170) edge -= bumpPx;
    for (let x = edge; x < 380; x++) { const i = (y * im.w + x) * 3; im.data[i] = im.data[i + 1] = im.data[i + 2] = 30; }
  }
  return im;
}
function selftest() {
  const geom = { coreRows: [150, 170], scanRows: [125, 195], crownTop: 100, chin: 300, outboard: 'left', scanStartX: 120, headCx: 300 };
  const cases = [
    ['straight edge, no bump', synth(0, 0), 0],
    ['slanted edge, no bump', synth(0, 0.10), 0],
    ['straight edge, 12 px bump', synth(12, 0), 12],
    ['slanted edge, 12 px bump', synth(12, 0.10), 12],
  ];
  let ok = true;
  for (const [name, im, want] of cases) {
    const r = measureE(im, geom);
    const pass = r.E != null && Math.abs(r.E - want) <= 1;
    ok = ok && pass;
    console.log(`  selftest ${pass ? 'PASS' : 'FAIL'}  ${name}: E=${r.E} (want ${want}±1)`);
  }
  return ok;
}

/* ================== model build + perspective projection ==================== */
async function buildProjection() {
  const warnings = [];
  const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
    warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {} };
  const { SlyModel, TUNE } = await import('../../src/player/SlyModel.js');
  const { CLIPS, sampleInto, sampleCane } = await import('../../src/player/Clips.js');
  const { PoseBuffer } = await import('../../src/player/Rig.js');
  const { SHOTS } = await import('../../src/core/Shots.js');

  const sly = new SlyModel(engine);
  await sly.init();
  if (!sly.mesh) throw new Error('BUILD FAILED: ' + warnings.join('; '));
  const geo = sly.mesh.geometry;
  const caneBaseQ = sly._canePivot ? sly._canePivot.quaternion.clone() : null;
  const poseBuf = new PoseBuffer(sly.boneNames);

  /* head-space map + cap set — same math as capbill-proj.mjs (its §"METHOD") */
  const S = TUNE.headScale, HW = TUNE.headWide;
  const HEAD_BASE = 1.396;
  const byHB = HEAD_BASE + TUNE.legLift - TUNE.torsoShrink;
  const toHead = (x, y, z) => [x / (S * HW), HEAD_BASE + (y - byHB) / S, z / S];
  const toModel = (xh, yh, zh) => [xh * S * HW, byHB + (yh - HEAD_BASE) * S, zh * S];
  const PIVOT = [0, 1.640, 0];

  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const bi = {}; sly.boneNames.forEach((n, i) => { bi[n] = i; });
  const dominant = (i) => { let b = -1, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = si.getComponent(i, k); } } return b; };
  const vGroup = new Int16Array(geo.attributes.position.count).fill(-1);
  { const idx = geo.index.array;
    const runs = geo.groups.map((g) => ({ s: g.start, e: g.start + g.count, m: g.materialIndex }));
    const groupOf = (k) => runs.find((r) => k >= r.s && k < r.e)?.m ?? -1;
    for (let k = 0; k < idx.length; k++) if (vGroup[idx[k]] === -1) vGroup[idx[k]] = groupOf(k); }
  const pos0 = geo.attributes.position.array.slice();
  const capSet = new Set(), brimSet = new Set();
  { const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const g = vGroup[i];
      if (g !== 3 && g !== 4 && g !== 5) continue;
      const d = dominant(i);
      if (d !== bi.head && d !== bi.capBrim) continue;
      const [, yh] = toHead(p.getX(i), p.getY(i), p.getZ(i));
      if (yh < 1.53) continue;
      capSet.add(i);
      if (g === 4 && d === bi.capBrim) brimSet.add(i);
    } }
  const HEADB = new Set(['head', 'jaw', 'capBrim', 'earL', 'earR', 'browL', 'browR'].map((n) => bi[n]));
  const HEADF = new Set();
  for (let i = 0; i < geo.attributes.position.count; i++) if (HEADB.has(dominant(i))) HEADF.add(i);
  const JAWV = new Set();
  for (let i = 0; i < geo.attributes.position.count; i++) if (dominant(i) === bi.jaw) JAWV.add(i);

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
  function applyClip(name) {
    const clip = CLIPS[name];
    if (!clip) throw new Error(`no clip ${name}`);
    poseBuf.clear();
    sampleInto(clip, clip.hold ?? 0, poseBuf, 1);
    for (const n of sly.boneNames) {
      const b = sly.bones[n]; if (!b) continue;
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
        const w = sw2.getComponent(i, k); if (w === 0) continue;
        const b = si2.getComponent(i, k);
        _sm.multiplyMatrices(bones[b].matrixWorld, inv[b]);
        _sv.fromBufferAttribute(pos, i).applyMatrix4(_sm);
        _st.addScaledVector(_sv, w);
      }
      out[i * 3] = _st.x; out[i * 3 + 1] = _st.y; out[i * 3 + 2] = _st.z;
    }
    return out;
  }

  /* perspective projection through the REAL shot camera at capture resolution */
  const out = {};
  for (const shotName of SHOT_NAMES) {
    const shot = SHOTS[shotName];
    const yaw = shot.player.yaw ?? 0, pp = shot.player.pos;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cam = new THREE.PerspectiveCamera(shot.fov ?? 50, W / H, 0.1, 500);
    cam.position.fromArray(shot.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(new THREE.Vector3().fromArray(shot.target));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const proj = (mx, my, mz) => {
      // world = RotY(yaw)·model + player.pos (occlude.mjs's convention, inverted)
      const wx = mx * cy + mz * sy, wz = -mx * sy + mz * cy;
      const v = new THREE.Vector3(wx + pp[0], my + pp[1], wz + pp[2]).project(cam);
      return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
    };
    const sets = {};
    for (const [vn, deg] of [['base', 0], ['yawR10', -10]]) {
      applyCapYaw(deg);
      applyClip(shot.player.pose);
      const V = skin();
      const bbox = (idxSet) => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const i of idxSet) {
          const [px, py] = proj(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]);
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (py < y0) y0 = py; if (py > y1) y1 = py;
        }
        return [x0, x1, y0, y1];
      };
      let chin = -1e9;
      for (const i of JAWV) { const [, py] = proj(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]); if (py > chin) chin = py; }
      sets[vn] = { head: bbox(new Set([...HEADF, ...capSet])), brim: bbox(brimSet), chin };
      if (vn === 'base') {
        // px/m at the head, vertical: prereg cross-check (289.6 / 168.3)
        const hc = [(sets.base.head[0] + sets.base.head[1]) / 2, 0];
        let cxm = 0, cym = 0, czm = 0, n = 0;
        for (const i of HEADF) { cxm += V[i * 3]; cym += V[i * 3 + 1]; czm += V[i * 3 + 2]; n++; }
        cxm /= n; cym /= n; czm /= n;
        const [, pa] = proj(cxm, cym - 0.05, czm), [, pb] = proj(cxm, cym + 0.05, czm);
        sets.pxPerM = Math.abs(pa - pb) / 0.10;
        sets.headCx = hc[0];
      }
    }
    applyCapYaw(0);
    const u = (a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3])];
    const headU = u(sets.base.head, sets.yawR10.head);
    const brimU = u(sets.base.brim, sets.yawR10.brim);
    const crownTop = Math.round(headU[2]);
    const chin = Math.round(Math.max(sets.base.chin, sets.yawR10.chin));
    const headCx = Math.round(sets.headCx);
    const brimCx = (brimU[0] + brimU[1]) / 2;
    const outboard = brimCx < headCx ? 'left' : 'right';
    const coreRows = [Math.round(brimU[2]), Math.round(brimU[3])];
    const scanRows = [Math.max(crownTop + 2, coreRows[0] - PAD), Math.min(chin - 2, coreRows[1] + PAD)];
    const billOutX = outboard === 'left' ? Math.round(brimU[0]) : Math.round(brimU[1]);
    const strip = outboard === 'left'
      ? { x0: billOutX - 40, x1: billOutX - 1, rows: coreRows }
      : { x0: billOutX + 1, x1: billOutX + 40, rows: coreRows };
    const scanStartX = outboard === 'left' ? billOutX - 50 : billOutX + 50;
    const billROI = [Math.round(brimU[0]) - PAD, Math.round(brimU[1]) + PAD, coreRows[0] - PAD, coreRows[1] + PAD];
    const headBboxPad = [Math.round(headU[0]) - PAD, Math.round(headU[1]) + PAD, Math.round(headU[2]) - PAD, Math.round(headU[3]) + PAD];
    out[shotName] = { pxPerM: +sets.pxPerM.toFixed(1), crownTop, chin, headCx, outboard,
      coreRows, scanRows, scanStartX, strip, billROI, headBboxPad,
      baseBrim: sets.base.brim.map((v) => +v.toFixed(1)), yawBrim: sets.yawR10.brim.map((v) => +v.toFixed(1)) };
  }
  return out;
}

/* ============================ frame utilities =============================== */
function diffCount(imA, imB, roi /* [x0,x1,y0,y1] or null */) {
  let total = 0, inRoi = 0;
  for (let y = 0; y < imA.h; y++) for (let x = 0; x < imA.w; x++) {
    const i = (y * imA.w + x) * imA.ch;
    const d = Math.abs(imA.data[i] - imB.data[i]) + Math.abs(imA.data[i + 1] - imB.data[i + 1]) + Math.abs(imA.data[i + 2] - imB.data[i + 2]);
    if (d >= SUMRGB) {
      total++;
      if (roi && x >= roi[0] && x <= roi[1] && y >= roi[2] && y <= roi[3]) inRoi++;
    }
  }
  return { total, inRoi };
}
function stripSky(im, strip) {
  let minL = 1e9, bad = 0, n = 0;
  for (let y = strip.rows[0]; y <= strip.rows[1]; y++) for (let x = strip.x0; x <= strip.x1; x++) {
    if (x < 0 || x >= im.w || y < 0 || y >= im.h) continue;
    const i = (y * im.w + x) * im.ch;
    const L = luma(im.data[i], im.data[i + 1], im.data[i + 2]);
    n++;
    if (L < minL) minL = L;
    if (L <= SKY) bad++;
  }
  return { n, bad, minL: +minL.toFixed(1), allSky: bad === 0 };
}

/* ================================ main ====================================== */
const mode = process.argv[2] || '--score';
console.log('capbill-score — selftest first (a metric never run across a known-bad has no scale, §141.1)');
const stOk = selftest();
if (!stOk) { console.error('SELFTEST FAILED — refusing to score'); process.exit(1); }
if (mode === '--selftest') process.exit(0);

const projGeom = await buildProjection();
for (const s of SHOT_NAMES) {
  const g = projGeom[s];
  console.log(`\n${s}: pxPerM ${g.pxPerM} (prereg ${s === 'sly-closeup' ? '289.6' : '168.3'})  outboard ${g.outboard}`
    + `\n  crownTop ${g.crownTop}  chin ${g.chin}  headCx ${g.headCx}`
    + `\n  bill core rows ${g.coreRows[0]}..${g.coreRows[1]}  scan rows ${g.scanRows[0]}..${g.scanRows[1]}  scanStartX ${g.scanStartX}`
    + `\n  base brim bbox [${g.baseBrim}]  yawR10 brim bbox [${g.yawBrim}]`
    + `\n  scoreability strip x ${g.strip.x0}..${g.strip.x1} rows ${g.strip.rows[0]}..${g.strip.rows[1]}  billROI [${g.billROI}]  headBbox+25 [${g.headBboxPad}]`);
}
writeFileSync(path.join(REC, 'capbill-rows.json'), JSON.stringify(projGeom, null, 2));
if (mode === '--dryrun') { console.log('\n(dry run — rows written to capbill-rows.json, no frames read)'); process.exit(0); }

/* ------------------------------- scoring ---------------------------------- */
const run = JSON.parse(readFileSync(path.join(REC, 'capbill.json'), 'utf8'));
const frames = {};
for (const arm of ['A', 'B', 'BACK']) for (const s of SHOT_NAMES) {
  const f = path.join(REC, 'frames', `${s}-${arm}.png`);
  if (!existsSync(f)) { console.error(`MISSING FRAME ${f} — run incomplete; scoring what exists is not scoring the seal. Stop.`); process.exit(1); }
  frames[`${s}-${arm}`] = readPNG(f);
}

const R = { seal: 'PREREG-capbill.md', scoredAt: new Date().toISOString(),
  srcTree0: run.srcTree0, srcTreeEdited: run.srcTreeEdited, selftest: 'PASS', geom: projGeom,
  scoreability: {}, E: {}, gates: {}, verdict: null };

/* scoreability FIRST (registered order) */
let unscoreable = false;
for (const s of SHOT_NAMES) {
  const r = stripSky(frames[`${s}-A`], projGeom[s].strip);
  R.scoreability[s] = r;
  console.log(`\nscoreability ${s}: strip ${r.n}px  non-sky ${r.bad}  minLuma ${r.minL}  -> ${r.allSky ? 'SCOREABLE' : 'UNSCOREABLE'}`);
  if (!r.allSky) unscoreable = true;
}
if (unscoreable) {
  R.verdict = 'UNSCOREABLE — registered outcome (prereg §7: fallback is re-registration against the actual backdrop, not a threshold change)';
  writeFileSync(path.join(REC, 'capbill-score-out.json'), JSON.stringify(R, null, 2));
  console.log(`\nVERDICT: ${R.verdict}`);
  process.exit(0);
}

/* E for every arm x shot */
for (const s of SHOT_NAMES) for (const arm of ['A', 'B', 'BACK']) {
  const r = measureE(frames[`${s}-${arm}`], projGeom[s]);
  R.E[`${s}-${arm}`] = r;
  console.log(`E(${arm}, ${s}) = ${r.E ?? 'null'} px  (peak row ${r.atRow ?? '-'}; ${r.rowsUsed ?? 0} rows, ${r.invalidRows ?? 0} invalid; anchors crown x${r.crownAnchor?.x} n${r.crownAnchor?.n} / cheek x${r.cheekAnchor?.x} n${r.cheekAnchor?.n})${r.reason ? '  REASON: ' + r.reason : ''}`);
}
const EA1 = R.E['sly-closeup-A'].E, EB1 = R.E['sly-closeup-B'].E;
const EA2 = R.E['combat-A'].E, EB2 = R.E['combat-B'].E;
if ([EA1, EB1, EA2, EB2].some((v) => v == null)) {
  R.verdict = 'INSTRUMENT-SUSPECT: E extraction returned null on a scored arm — do not convert; see reasons above';
  writeFileSync(path.join(REC, 'capbill-score-out.json'), JSON.stringify(R, null, 2));
  console.log(`\nVERDICT: ${R.verdict}`); process.exit(0);
}

/* GATE 3 — validity (checked before interpreting E: a void run scores nothing) */
const sameTree = run.arms?.A?.srcAtArm && run.arms.A.srcAtArm === run.arms.BACK?.srcAtArm;
R.gates.g3 = { sameTree, diffs: {} };
let g3pass = true;
for (const s of SHOT_NAMES) {
  const shaEq = run.arms.A.shots[s].sha256 === run.arms.BACK.shots[s].sha256;
  const d = shaEq ? { total: 0, inRoi: 0 } : diffCount(frames[`${s}-A`], frames[`${s}-BACK`], projGeom[s].billROI);
  R.gates.g3.diffs[s] = { shaEqual: shaEq, wholeFramePx: d.total, inBillROI: d.inRoi };
  console.log(`GATE 3 ${s}: BACK-A ${shaEq ? 'sha-identical' : `${d.total} px differ (ΣRGB≥4), ${d.inRoi} in bill ROI`}`);
  if (d.total > 200) g3pass = false;
}
if (!sameTree) {
  const roiResid = SHOT_NAMES.every((s) => R.gates.g3.diffs[s].inBillROI === 0);
  R.gates.g3.boundReading = { applied: true, roiResidualZero: roiResid };
  g3pass = g3pass && roiResid; // §160.4: verdict may stand ONLY on zero bill-ROI residual
  console.log(`GATE 3: tree moved between A and BACK — §160.4 bound reading: bill-ROI residual ${roiResid ? '0 px, verdict may stand' : 'NONZERO — VOID, re-queue'}`);
}
R.gates.g3.pass = g3pass;

/* SIGN control in frame */
if (EB1 < EA1) {
  R.verdict = 'VOID — sign control failed in frame (B reduced closeup E): projector sign convention or token wiring wrong; fix the instrument, do not interpret (prereg §7)';
  writeFileSync(path.join(REC, 'capbill-score-out.json'), JSON.stringify(R, null, 2));
  console.log(`\nVERDICT: ${R.verdict}`); process.exit(0);
}

/* GATE 1 */
const g1cal = EA1 >= 1 && EA1 <= 7;
const g1 = g1cal && EB1 >= 8 && (EB1 - EA1) >= 5;
R.gates.g1 = { calibration: g1cal, EA: EA1, EB: EB1, delta: +(EB1 - EA1).toFixed(1), pass: g1, calibrationNote: g1cal ? 'E(A,closeup) in [1,7] — instrument calibrated (projection said 4.6)' : `E(A,closeup)=${EA1} OUTSIDE [1,7] — instrument suspect, B not scored against it` };
/* GATE 2 */
const g2cal = EA2 >= 15 && EA2 <= 30;
const g2 = g2cal && EB2 >= EA2 - 3;
R.gates.g2 = { calibration: g2cal, EA: EA2, EB: EB2, pass: g2, calibrationNote: g2cal ? 'E(A,combat) in [15,30] (projection said 22.4)' : `E(A,combat)=${EA2} OUTSIDE [15,30] — instrument suspect` };
/* GATE 4 */
R.gates.g4 = { shots: {}, headratio: run.headratio, pass: true };
for (const s of SHOT_NAMES) {
  const d = diffCount(frames[`${s}-A`], frames[`${s}-B`], projGeom[s].headBboxPad);
  const share = d.total ? d.inRoi / d.total : 1;
  R.gates.g4.shots[s] = { diffPx: d.total, inHeadBbox: d.inRoi, share: +share.toFixed(4) };
  if (share < 0.90) R.gates.g4.pass = false;
  console.log(`GATE 4 ${s}: A-B ${d.total} px differ, ${(share * 100).toFixed(1)}% inside head bbox+25`);
}
if (!run.headratio?.unchangedTo2dp) R.gates.g4.pass = false;

console.log(`\nGATE 1 ${R.gates.g1.pass ? 'PASS' : 'FAIL'}  (E closeup A ${EA1} / B ${EB1}, Δ ${R.gates.g1.delta}; cal ${g1cal})`);
console.log(`GATE 2 ${R.gates.g2.pass ? 'PASS' : 'FAIL'}  (E combat  A ${EA2} / B ${EB2}; cal ${g2cal})`);
console.log(`GATE 3 ${R.gates.g3.pass ? 'PASS' : 'FAIL'}  (sameTree ${sameTree})`);
console.log(`GATE 4 ${R.gates.g4.pass ? 'PASS' : 'FAIL'}  (headratio ${run.headratio?.tokenOff} -> ${run.headratio?.tokenOn})`);

/* verdict per prereg §7/§8 — revert, not defend */
if (!g1cal || !g2cal) {
  R.verdict = 'INSTRUMENT-SUSPECT: an arm-A calibration band failed — do not score B against it; re-examine the scorer before any re-queue (registered wording of GATE 1/2)';
} else if (!R.gates.g3.pass) {
  R.verdict = 'VOID — GATE 3 (BACK ≢ A beyond threshold and/or bound reading failed); re-queue (prereg §6)';
} else if (R.gates.g1.pass && R.gates.g2.pass && R.gates.g4.pass) {
  R.verdict = 'OUTCOME A — all gates pass. Registered meaning: the yaw mechanism holds in the graded frame; ship decision (capYaw −0.175 as TUNE constant, token retired) is the COORDINATOR\'s, per §8. §151.4 closes as "model fixed at 33–45°; dead band relocated to −5..+10 where no scored camera sits" with §5\'s sweep as the honest statement.';
} else if (!R.gates.g1.pass && R.gates.g2.pass) {
  R.verdict = 'OUTCOME C — closeup fails: the yaw mechanism is refuted in the graded frame (the shader/ink/PostFX gap shotsil\'s header names). Token off is already the shipped state; do not ship, do not re-tune ψ in this window. §153.6 stands confirmed for all three rotation axes; the bill is not deliverable at 33° by geometry within the measured records (prereg §8C).';
} else if (R.gates.g1.pass && !R.gates.g2.pass) {
  R.verdict = 'OUTCOME B — combat paid for closeup: the no-trade premise is wrong in frame. Revert path; do NOT argue elevation/pose after the fact (they are in the projection). Coordinator decides per-shot-condition vs geometry (prereg §8B).';
} else if (!R.gates.g4.pass) {
  R.verdict = 'GATE 4 FAIL — the token gated more than the cap (collateral pixels or headratio moved): treat as instrument/wiring defect, revert, re-queue only after the leak is explained.';
} else {
  R.verdict = 'REFUTED on both bearings — revert (token off is shipped state); record and stop.';
}
writeFileSync(path.join(REC, 'capbill-score-out.json'), JSON.stringify(R, null, 2));
console.log(`\nVERDICT: ${R.verdict}`);
