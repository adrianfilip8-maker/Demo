/**
 * canecensus.mjs — is Sly's cane metal in every framing, or only in the one §121.9 measured?
 *
 * §121.9 generalised "a tube's normal sweeps through the half-vector *somewhere* along its
 * length — the lobe is guaranteed a place to land" from ONE object in ONE frame (`sly-startle`).
 * That claim is now routing work to GEOMETRY. This runs the same colour census across every
 * framing that has a frame on disk, and reports the DISTRIBUTION.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT SITS BETWEEN THIS NUMBER AND WHAT THE RENDERER DREW  (§11: name the missing suffix)
 * ---------------------------------------------------------------------------------------
 * This is a *mask* built offline, intersected with a colour gate, applied to a REAL captured
 * PNG. The pixels are the renderer's; the region is mine. What my region does NOT model:
 *
 *   - **Foot IK.** `freezePose` sets `_ikW = 1` and `Rig.footIK` re-solves both legs at
 *     runtime. It drives ankles, not the hand, so the cane's grip does not move — but if
 *     footIK ever displaces hips, this mask shifts with it and I would not see that.
 *   - **Springs / breath / lean.** `freezePose` clears them (`settle()`, `breath = 0`,
 *     `lean = 0`, `caneCur.identity()`), so the frozen frame is spring-free by construction
 *     and this matches it. Live frames would not.
 *   - **Architecture occlusion.** Not ray-tested here. Cane pixels hidden behind a column are
 *     still inside my mask; the colour gate is what removes them, and it removes them as
 *     "not gold" rather than as "occluded". Reported as gate-reject rate so it is visible.
 *   - **The ink outline shell.** The cane carries a 1.25x hull. Its pixels lie ON the mask
 *     boundary and are near-black, so they fail the colour gate. That is the intended
 *     behaviour (§121.9 also selected by colour) but it means the gate rejects a real,
 *     shipped part of the cane's screen area.
 *   - **Self-occlusion within the cane** IS modelled — triangles are z-buffered.
 *
 * So: a HIGH reading here is trustworthy (those pixels are gold and they are the cane's).
 * A LOW reading is "the cane's screen region contains little gold", which is the union of
 * "not lit as metal", "occluded" and "too few pixels" — disambiguated by the columns below.
 *
 *   node canecensus.mjs
 */
import * as THREE from 'three';
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false,
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
};

const { SlyModel } = await import('/home/user/Demo/src/player/SlyModel.js');
const { CLIPS, sampleInto, sampleCane } = await import('/home/user/Demo/src/player/Clips.js');
const { PoseBuffer } = await import('/home/user/Demo/src/player/Rig.js');

const sly = new SlyModel(engine);
await sly.init();

const cane = sly.cane;
if (!cane?.mesh) { console.error('no cane mesh built'); process.exit(1); }
const caneBase = sly._canePivot.quaternion.clone();

/* Which PNG is the current frame for each shot, chosen newest-first, with its commit. */
const FRAMES = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/caneframes.json', 'utf8'));

/** Stage the character+cane for a shot and return the cane's world-space triangles. */
function caneTris(shotName) {
  const shot = SHOTS[shotName];
  const clip = CLIPS[shot.player.pose];
  const pb = new PoseBuffer(sly.boneNames).clear();
  const t = clip.hold ?? 0;
  sampleInto(clip, t, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const hb = sly.bp('hips');
  sly.bones.hips.position.set(hb.x + pb.pos.x, hb.y + pb.pos.y, hb.z + pb.pos.z);

  /* The cane aim, exactly as `Animation._applyCane` does it for a frozen pose:
     freezePose sets caneCur=identity, then k=1 so caneCur := caneTarget, then
     pivot.quaternion = caneTarget * caneBase. Skipping this projects the BIND cane and puts
     the ROI in the wrong place — the §11 failure this file's header is about. */
  const q = new THREE.Quaternion();
  const has = sampleCane(clip, t, q);
  if (!has) q.identity();
  sly._canePivot.quaternion.copy(q).multiply(caneBase);

  sly.root.updateMatrixWorld(true);

  const geo = cane.mesh.geometry;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const mw = cane.mesh.matrixWorld;
  const yaw = shot.player.yaw ?? 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const [px, py, pz] = shot.player.pos;
  const v = new THREE.Vector3();
  const pts = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mw);
    pts[i] = new THREE.Vector3(px + v.x * cy + v.z * sy, py + v.y, pz - v.x * sy + v.z * cy);
  }
  const tris = [];
  for (let i = 0; i < idx.count; i += 3) {
    tris.push([pts[idx.getX(i)], pts[idx.getX(i + 1)], pts[idx.getX(i + 2)]]);
  }
  return tris;
}

/** Shot camera, matching Shots.js applyShot (pos/target/fov/roll). */
function shotCamera(shotName, W, H) {
  const s = SHOTS[shotName];
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, W / H, 0.1, 2000);
  cam.position.fromArray(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** Rasterise cane triangles into a z-buffered mask at frame resolution. */
function caneMask(tris, cam, W, H) {
  const mask = new Uint8Array(W * H);
  const zbuf = new Float32Array(W * H).fill(Infinity);
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const p = new THREE.Vector4();
  let behind = 0, total = 0;
  for (const tri of tris) {
    total++;
    const sc = [];
    let bad = false;
    for (const w of tri) {
      p.set(w.x, w.y, w.z, 1).applyMatrix4(vp);
      if (p.w <= 1e-6) { bad = true; break; }         // behind the lens — drop, do not wrap
      sc.push([(p.x / p.w * 0.5 + 0.5) * W, (1 - (p.y / p.w * 0.5 + 0.5)) * H, p.w]);
    }
    if (bad) { behind++; continue; }
    const minx = Math.max(0, Math.floor(Math.min(sc[0][0], sc[1][0], sc[2][0])));
    const maxx = Math.min(W - 1, Math.ceil(Math.max(sc[0][0], sc[1][0], sc[2][0])));
    const miny = Math.max(0, Math.floor(Math.min(sc[0][1], sc[1][1], sc[2][1])));
    const maxy = Math.min(H - 1, Math.ceil(Math.max(sc[0][1], sc[1][1], sc[2][1])));
    const [x0, y0, w0] = sc[0], [x1, y1, w1] = sc[1], [x2, y2, w2] = sc[2];
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-12) continue;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const cx = x + 0.5, cyy = y + 0.5;
        const a = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cyy - y2)) / den;
        const b = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cyy - y2)) / den;
        const c = 1 - a - b;
        if (a < 0 || b < 0 || c < 0) continue;
        const z = a * w0 + b * w1 + c * w2;
        const i = y * W + x;
        if (z < zbuf[i]) { zbuf[i] = z; mask[i] = 1; }
      }
    }
  }
  return { mask, behind, total };
}

/* ---- the colour gate -------------------------------------------------------------------
   §121.9 selected "by colour rather than by mask". Applied to a whole frame that selects any
   gold in shot — on `hero` or `courtyard` that is mostly gilded ARCHITECTURE, which is the
   very thing the cane is being contrasted against, and is the §104 ROI failure. So the gate
   here runs only INSIDE the cane's own rasterised region. Gate is deliberately loose: warm
   (r > b) and not ink-black. Everything rejected is counted and reported. */
const isGold = (r, g, b) => (r > b) && (r + g + b) > 90;

const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function chroma(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }

const rows = [];
for (const [shotName, info] of Object.entries(FRAMES)) {
  if (!SHOTS[shotName]) { rows.push({ shotName, note: 'no such shot' }); continue; }
  const file = info.file;
  if (!fs.existsSync(file)) { rows.push({ shotName, note: 'no frame on disk' }); continue; }
  const im = readPNG(file);
  const W = im.w, H = im.h;
  const tris = caneTris(shotName);
  const cam = shotCamera(shotName, W, H);
  const { mask, behind, total } = caneMask(tris, cam, W, H);

  let n = 0, ng = 0, sr = 0, sg = 0, sb = 0, hot = 0;
  const chs = [], brs = [], Ls = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) continue;
    n++;
    const o = i * im.ch;
    const r = im.data[o], g = im.data[o + 1], b = im.data[o + 2];
    if (!isGold(r, g, b)) continue;
    ng++; sr += r; sg += g; sb += b;
    const l = L(r, g, b);
    Ls.push(l); chs.push(chroma(r, g, b)); brs.push((b - r) / 255);
    if (l >= 170) hot++;
  }
  const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  rows.push({
    shotName, file: file.replace('/home/user/Demo/', ''), sha: info.sha, W, H,
    maskPx: n, goldPx: ng, rejectPct: n ? (100 * (n - ng) / n) : NaN,
    behindPct: 100 * behind / total,
    meanR: ng ? sr / ng : NaN, meanG: ng ? sg / ng : NaN, meanB: ng ? sb / ng : NaN,
    L: ng ? L(sr / ng, sg / ng, sb / ng) : NaN,
    br: ng ? ((sb / ng) - (sr / ng)) / 255 : NaN,
    chromaMean: ng ? chs.reduce((a, b2) => a + b2, 0) / ng : NaN,
    chromaMed: med(chs), Lmed: med(Ls),
    hot170: hot, hotPct: ng ? 100 * hot / ng : NaN,
  });
}

const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '   -  ');
console.log('\nCANE COLOUR CENSUS — cane-rasterised ROI, colour-gated inside it');
console.log('shot          frame                              mask   gold  rej%   meanRGB              L     (b-r)/255  chroma(mean/med)  px>=L170  %hot');
console.log('-'.repeat(150));
for (const r of rows) {
  if (r.note) { console.log(`${r.shotName.padEnd(13)} ${r.note}`); continue; }
  console.log(
    `${r.shotName.padEnd(13)} ${r.file.padEnd(34)} ${String(r.maskPx).padStart(5)} ${String(r.goldPx).padStart(6)} ${f(r.rejectPct, 1).padStart(5)}  ` +
    `${f(r.meanR, 1).padStart(5)},${f(r.meanG, 1).padStart(6)},${f(r.meanB, 1).padStart(6)}  ${f(r.L, 1).padStart(6)}  ${f(r.br).padStart(8)}   ${f(r.chromaMean).padStart(6)}/${f(r.chromaMed)}   ${String(r.hot170).padStart(6)}  ${f(r.hotPct, 1).padStart(5)}`
  );
}
const G = { cwd: '/home/user/Demo', encoding: 'utf8' };
console.log('\nprovenance: HEAD', execFileSync('git', ['rev-parse', '--short', 'HEAD'], G).trim(),
  '| dirty files under src/:', execFileSync('git', ['status', '--porcelain', '--', 'src/'], G).split('\n').filter((l) => l.length > 3).length);
