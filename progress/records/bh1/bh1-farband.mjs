/**
 * bh1-farband.mjs — why did BH1's FAR band contain zero pixels?
 *
 * OFFLINE ONLY. Reads the committed capture (progress/records/guardcone1/) and the committed
 * scorer's own predicates. Renders nothing, launches nothing, re-scores nothing: the BH1 row
 * stays VOID and RESULT-guardcone's DO NOT SHIP stands (§141.1). This file only explains the
 * arithmetic that produced `far … (0px)`.
 *
 * It replicates, byte for byte in behaviour, the two functions that decide the split:
 *   guardcone-score.mjs:87-104   beamRoiPx()   — which pixels the loop visits, and `t`
 *   guardcone-score.mjs:106-138  the BH1 block — S >= 0.05, then t < 0.5 ? near : far
 * and instruments every condition so each drop-out is counted rather than inferred.
 *
 *   node progress/records/bh1/bh1-farband.mjs
 */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = path.join(ROOT, 'progress/records/guardcone1');
const MF = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const row = (shot, arm) => MF.rows.find((r) => r.shot === shot && r.arm === arm) || null;
const num = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : (+v).toFixed(d));
const H = (s) => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 86 - s.length))}`);

const r = row('guard', 'bon');
const im = readPNG(path.join(DIR, r.file));
const p = r.probe;
const subj = p.guards[p.subjIdx];

/* ═══ 1. what the scorer reads ══════════════════════════════════════════════════════════ */
H('1. the inputs BH1 reads out of the probe');
console.log(`  frame        ${r.file}  ${im.w}x${im.h}  ch=${im.ch}`);
console.log(`  subjIdx      ${p.subjIdx}  (guard ${subj.i}, type=${subj.type}, state=${subj.state}, world pos ${JSON.stringify(subj.pos)})`);
console.log(`  bbox         ${JSON.stringify(subj.bbox)}`);
console.log(`  beamRect     ${JSON.stringify(subj.beamRect)}`);
console.log(`  apexS        ${JSON.stringify(subj.apexS)}   <- [screenX, screenY, round(ndcZ)]`);
console.log(`  farS         ${JSON.stringify(subj.farS)}   <- SAME triple, and it is NOT on the frame`);

const [ax, ay] = subj.apexS, [fx, fy] = subj.farS;
const dx = fx - ax, dy = fy - ay;
const len2 = Math.max(1, dx * dx + dy * dy);
console.log(`\n  apex->far screen vector  (${dx}, ${dy})   |v| = ${num(Math.hypot(dx, dy), 1)} px`);
console.log(`  direction                ${num(Math.atan2(dy, dx) * 180 / Math.PI, 1)}deg (left and slightly down — the direction is sane, the LENGTH is not)`);
console.log(`  t = 0.5 lands at         (${num(ax + dx * 0.5, 0)}, ${num(ay + dy * 0.5, 0)})  — frame is [0,0,${im.w},${im.h}]`);
console.log(`  t = 1.0 lands at         (${fx}, ${fy})`);
console.log(`  frame diagonal is ${num(Math.hypot(im.w, im.h), 0)} px; the near/far axis is ${num(Math.hypot(dx, dy) / Math.hypot(im.w, im.h), 1)}x longer than that`);

/* ═══ 2. beamRoiPx, verbatim + instrumented ════════════════════════════════════════════ */
H('2. beamRoiPx() — every pixel the loop visits, and what happens to it');
const rr = subj.beamRect, bb = subj.bbox;
const x0 = Math.max(0, rr[0]), x1 = Math.min(im.w, rr[2]);
const y0 = Math.max(0, rr[1]), y1 = Math.min(im.h, rr[3]);

let rectPx = 0, skippedBbox = 0, visited = 0;
let dropS = 0, keptS = 0, nearN = 0, farN = 0, tGE = 0;
let tMin = Infinity, tMax = -Infinity;
const acc = { near: { cx: 0, cy: 0, w: 0, s: 0, n: 0 }, far: { cx: 0, cy: 0, w: 0, s: 0, n: 0 } };
/* t histogram over the visited ROI, 20 buckets across the OBSERVED range */
const tvals = [];

for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
  rectPx++;
  if (bb && x >= bb[0] && x < bb[2] && y >= bb[1] && y < bb[3]) { skippedBbox++; continue; }
  const t = ((x - ax) * dx + (y - ay) * dy) / len2;
  visited++;
  if (t < tMin) tMin = t;
  if (t > tMax) tMax = t;
  if (t >= 0.5) tGE++;
  if ((visited & 1023) === 0) tvals.push(t);

  const o = (y * im.w + x) * im.ch;
  const R = im.data[o] / 255, G = im.data[o + 1] / 255, B = im.data[o + 2] / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  const S = mx > 1e-6 ? d / mx : 0;
  if (S < 0.05) { dropS++; continue; }
  keptS++;
  let h = 0;
  if (d > 1e-6) {
    if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const a = t < 0.5 ? (nearN++, acc.near) : (farN++, acc.far);
  a.cx += d * Math.cos(h * Math.PI / 180); a.cy += d * Math.sin(h * Math.PI / 180);
  a.w += d; a.s += S; a.n++;
}
const hue = (a) => (a.w > 1e-9 ? ((Math.atan2(a.cy, a.cx) * 180 / Math.PI) + 360) % 360 : NaN);

console.log(`  beamRect clamped to frame      [${x0},${y0},${x1},${y1}]  =  ${rectPx} px`);
console.log(`  minus subject bbox             -${skippedBbox} px`);
console.log(`  PIXELS THE LOOP VISITS         ${visited}   (${num(100 * visited / (im.w * im.h), 1)}% of the whole frame — beamRect is the`);
console.log('                                 axis-aligned bound of a cone aimed at the lens, so it is not a tight beam mask)');
console.log(`    dropped by S < 0.05          ${dropS}   (${num(100 * dropS / visited, 2)}% — the band's own predicate rejects almost nothing)`);
console.log(`    survive the saturation gate  ${keptS}`);
console.log(`      -> near bucket (t < 0.5)   ${nearN}`);
console.log(`      -> far  bucket (t >= 0.5)  ${farN}`);
console.log(`  visited px with t >= 0.5 REGARDLESS of saturation: ${tGE}`);
console.log(`\n  t range over the whole visited ROI: [${tMin.toExponential(4)}, ${tMax.toExponential(4)}]`);
console.log(`  the far bucket needs t >= 0.5. Observed max t is ${num(0.5 / tMax, 1)}x too small.`);
console.log(`  reproduced BH1 line:  near hue=${num(hue(acc.near), 1)} S=${num(acc.near.n ? acc.near.s / acc.near.n : NaN, 3)} (${acc.near.n}px)  `
  + `far hue=${num(hue(acc.far), 1)} S=${num(acc.far.n ? acc.far.s / acc.far.n : NaN, 3)} (${acc.far.n}px)`);
console.log(`  RESULT-guardcone §2 recorded:  near hue=17.8 S=0.453 (516057px)   far hue=n/a S=n/a (0px)`);

/* the four ROI corners, to show t never gets near 0.5 anywhere on the frame */
H('3. t at the four corners of the WHOLE frame (not just the ROI)');
for (const [cx2, cy2, nm] of [[0, 0, 'top-left'], [im.w - 1, 0, 'top-right'], [0, im.h - 1, 'bottom-left'], [im.w - 1, im.h - 1, 'bottom-right']]) {
  const t = ((cx2 - ax) * dx + (cy2 - ay) * dy) / len2;
  console.log(`  (${String(cx2).padStart(4)},${String(cy2).padStart(4)}) ${nm.padEnd(13)} t = ${t.toExponential(4)}`);
}
/* where would the t=0.5 half-plane boundary cross the frame's scanline y=360? */
{
  const yq = 360;
  const xq = (0.5 * len2 - (yq - ay) * dy) / dx + ax;
  console.log(`\n  the t = 0.5 boundary is a line perpendicular to the axis; on scanline y=360 it sits at x = ${num(xq, 0)}`);
  console.log(`  every visited pixel is on the t < 0.5 side of it, by ~${num((0 - xq) / 1000, 0)}k px.`);
}

/* the bound that makes this independent of what is IN the picture */
{
  const rmax = Math.max(...[[0, 0], [im.w - 1, 0], [0, im.h - 1], [im.w - 1, im.h - 1]].map(([cx2, cy2]) => Math.hypot(cx2 - ax, cy2 - ay)));
  const L = Math.hypot(dx, dy);
  console.log(`\n  BOUND — t = (p-apex)·(far-apex)/|far-apex|^2, so |t| <= |p-apex| / |far-apex| for ANY pixel p.`);
  console.log(`  furthest any pixel on a ${im.w}x${im.h} frame can be from apexS (${ax},${ay}):  ${num(rmax, 1)} px`);
  console.log(`  therefore t <= ${num(rmax / L, 6)} everywhere, for every possible image.`);
  console.log(`  the far bucket needs t >= 0.5, so it is reachable ONLY IF |far-apex| <= 2 x ${num(rmax, 1)} = ${num(2 * rmax, 0)} px.`);
  console.log(`  measured |far-apex| = ${num(L, 0)} px — ${num(L / (2 * rmax), 1)}x over that ceiling.`);
  console.log('  => no arrangement of pixels in guard.bon.png could have produced a non-empty far band.');
  console.log('     BH1 did not look at the far half of the beam and dislike it. It could not look at all.');
}

/* ═══ 4. is farS in the frustum at all? ════════════════════════════════════════════════ */
H('4. what farS actually is — the probe writes it WITHOUT the frustum test it applies to rects');
console.log('  guardcone.mjs:302-313  rectOf() drops every point whose ndcZ is outside (-1,1):');
console.log('      if (!(z > -1 && z < 1)) continue;   // "behind/past the frustum planes"');
console.log('  guardcone.mjs:340-341  apexS/farS are written with NO such test:');
console.log('      apexS = proj(ax).map(Math.round);  farS = proj(ax + zc).map(Math.round);');
console.log(`  so apexS[2] = ${subj.apexS[2]} (in front, normal) and farS[2] = ${subj.farS[2]} — and guardcone-score.mjs never reads [2].`);
console.log('  BH1 guards on truthiness only:  if (bonIm && subj?.beamRect && subj?.apexS && subj?.farS)');
console.log('  — an array of nonsense is still truthy, so the bar runs on a coordinate the probe itself would have rejected.');

/* ndcZ -> distance along the view axis, for a 0.1/4000 perspective camera */
{
  const n = 0.1, f = 4000;
  const A = (f + n) / (f - n), B2 = 2 * f * n / (f - n);
  const dOf = (z) => B2 / (A - z);          // z_ndc = A - B/d  (d = distance along -view axis)
  console.log(`\n  ndcZ is stored ROUNDED, so farS[2] = 0 means the true ndcZ was in [-0.5, 0.5).`);
  console.log(`  For this camera (near ${n}, far ${f}):  ndcZ = ${num(A, 5)} - ${num(B2, 5)}/d`);
  console.log(`    ndcZ = -0.5  ->  d = ${num(dOf(-0.5), 4)} m      ndcZ = +0.5  ->  d = ${num(dOf(0.5), 4)} m`);
  console.log(`  => the beam's far tip sits ${num(dOf(-0.5), 3)}-${num(dOf(0.5), 3)} m along the view axis: essentially IN the camera's own plane.`);
  console.log(`  (apexS[2] = 1 rounds from d >= ${num(dOf(0.5), 2)} m and is an ordinary in-frustum depth.)`);
}

/* ═══ 5. reconstruct the shot camera and confirm the geometry ══════════════════════════ */
H('5. independent reconstruction: rebuild the guard-shot camera and re-derive the probe');
{
  const CAM = new THREE.Vector3(-13.25, 2.6, 30.5), TGT = new THREE.Vector3(-18.75, 1.1, 28.0);
  const cam = new THREE.PerspectiveCamera(38, 1280 / 720, 0.1, 4000);   // Shots.js guard.fov, Engine.js near/far
  cam.position.copy(CAM); cam.up.set(0, 1, 0); cam.lookAt(TGT);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  const V = new THREE.Vector3();
  const proj = (x, y, z) => { V.set(x, y, z).project(cam); return [(V.x * 0.5 + 0.5) * 1280, (1 - (V.y * 0.5 + 0.5)) * 720, V.z]; };
  const camFwd = TGT.clone().sub(CAM).normalize();
  const camRgt = camFwd.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const [gx, gy, gz] = subj.pos;

  /* CHECK A — the recorded bbox is rectOf() over the 8 corners of a 1.1 x (headTop+0.15) x 1.1 box.
     This is what validates the camera model; nothing downstream is worth anything without it. */
  const top = 1.95 + 0.15;               // TUNE.headTop.temple + 0.15  (Guard.js:67, guardcone.mjs:322)
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (const ddx of [-0.55, 0.55]) for (const ddy of [0, top]) for (const ddz of [-0.55, 0.55]) {
    const q = proj(gx + ddx, gy + ddy, gz + ddz);
    bx0 = Math.min(bx0, q[0]); by0 = Math.min(by0, q[1]); bx1 = Math.max(bx1, q[0]); by1 = Math.max(by1, q[1]);
  }
  const bboxR = [Math.max(0, bx0), Math.max(0, by0), Math.min(1280, bx1), Math.min(720, by1)].map(Math.round);
  console.log(`  CHECK A  bbox   reconstructed ${JSON.stringify(bboxR)}   recorded ${JSON.stringify(subj.bbox)}   <- camera model is right`);

  /* CHECK B — the naive eye (pos + VISION.temple.eyeHeight) does NOT reproduce apexS, and that is
     expected: _eyePosition (Guard.js:1203-1210) prefers the LIVE HEAD BONE + coneEyeFwd/-Up and
     only falls back to pos+eyeHeight. A skinned bone cannot be reproduced offline. */
  const apexNaive = proj(gx, gy + 1.66, gz).map(Math.round);
  console.log(`  CHECK B  apexS  from pos+eyeHeight ${JSON.stringify(apexNaive)}  vs recorded ${JSON.stringify(subj.apexS)}`);
  console.log('           -> mismatch EXPECTED: the apex rides the animated head bone, not the root. Recover it instead:');

  /* CHECK C — the eye must lie on the camera ray through apexS. Take the point on that ray
     closest to the guard's own vertical axis, displaced forward by TUNE.coneEyeFwd. */
  const ray = (sx, sy) => {
    const nx = (sx / 1280) * 2 - 1, ny = 1 - (sy / 720) * 2;
    const a = new THREE.Vector3(nx, ny, -1).unproject(cam), b = new THREE.Vector3(nx, ny, 1).unproject(cam);
    return b.sub(a).normalize();
  };
  const eDir = ray(ax, ay);
  let eye = null, eBest = Infinity;
  for (let s = 3; s < 9; s += 0.0005) {
    const P = CAM.clone().addScaledVector(eDir, s);
    const e = Math.hypot(P.x - gx, P.z - gz);            // distance to the guard's vertical axis
    if (e < eBest) { eBest = e; eye = P; }
  }
  console.log(`  CHECK C  eye recovered from the apexS ray: (${num(eye.x, 3)}, ${num(eye.y, 3)}, ${num(eye.z, 3)})`);
  console.log(`           passes within ${num(eBest, 3)} m of the guard's own axis (${num(gx, 2)}, ·, ${num(gz, 2)}) — i.e. it IS his head. y=${num(eye.y, 2)} m.`);

  /* CHECK D — the heading, two independent ways. */
  let best = null;
  for (let i = 0; i < 360 * 20; i++) {
    const a = i / 20 * Math.PI / 180, fw = [Math.sin(a), 0, Math.cos(a)];
    const q = proj(gx + fw[0] * 2.2, gy + 0.03, gz + fw[2] * 2.2);
    const e = Math.hypot(q[0] - p.ahead.c[0], q[1] - p.ahead.c[1]);
    if (!best || e < best.e) best = { a, fw, e };
  }
  /* Guard.js:2240-2256 — side-on to the lens, then tipped `towardCamera` back at the viewer. */
  const t35 = 0.35, side = -1;                             // SHOT_POSE.guard (Guard.js:193-201)
  const flat = (v) => new THREE.Vector3(v.x, 0, v.z).normalize();
  const head = flat(camRgt).multiplyScalar(side * Math.sqrt(1 - t35 * t35))
    .addScaledVector(flat(camFwd), -t35).normalize();
  console.log(`  CHECK D  forward from the recorded 'ahead' disc ${JSON.stringify(p.ahead.c)}: `
    + `(${num(best.fw[0], 3)}, 0, ${num(best.fw[2], 3)})  residual ${num(best.e, 2)} px`);
  console.log(`           forward from SHOT_POSE.guard's own formula (side-on, towardCamera=0.35): `
    + `(${num(head.x, 3)}, 0, ${num(head.z, 3)})`);
  console.log(`           the two agree to ${num(Math.hypot(head.x - best.fw[0], head.z - best.fw[2]), 4)} — the subject is aimed AT THE LENS by design.`);

  /* CHECK E — the tip's depth along the view axis as a function of reach. */
  const pitch = 0.115, cpit = Math.cos(pitch);              // TUNE.conePitch (Guard.js:85)
  const dir = new THREE.Vector3(best.fw[0] * cpit, -Math.sin(pitch), best.fw[2] * cpit);
  const d0 = eye.clone().sub(CAM).dot(camFwd), slope = dir.dot(camFwd);
  console.log(`\n  CHECK E  depth along the view axis:  d(reach) = ${num(d0, 3)} ${slope < 0 ? '-' : '+'} ${num(Math.abs(slope), 4)} x reach   [metres]`);
  console.log(`           the eye itself sits ${num(d0, 2)} m down the axis; the beam throws BACK toward the lens at ${num(-slope, 3)} m per metre.`);
  console.log(`           d = 0 (the camera's own plane, where the projection diverges) at reach = ${num(-d0 / slope, 2)} m.`);
  console.log(`           the authored cone is coneLength = 15.0 m (VISION.temple), floor 15.0*0.55 = 8.25 m.`);
  console.log('\n      reach   tip world (x,y,z)              d(axis)   projected farS            ndcZ');
  for (const reach of [8.25, 10, 12, 14, 15]) {
    const tip = eye.clone().addScaledVector(dir, reach);
    const q = proj(tip.x, tip.y, tip.z);
    console.log(`      ${num(reach, 2).padStart(5)}   (${num(tip.x, 2).padStart(7)},${num(tip.y, 2).padStart(6)},${num(tip.z, 2).padStart(7)})`
      + `   ${num(d0 + slope * reach, 3).padStart(7)}   (${num(q[0], 0).padStart(9)}, ${num(q[1], 0).padStart(7)})   ${num(q[2], 3).padStart(7)}`);
  }
  console.log(`      ${num(-d0 / slope, 2).padStart(5)}   ${'(the camera plane)'.padEnd(30)}   ${'0.000'.padStart(7)}   (   +/-inf,  +/-inf)   -inf`);

  const tip15 = eye.clone().addScaledVector(dir, 15);
  const q15 = proj(tip15.x, tip15.y, tip15.z);
  console.log(`\n  at the authored 15.0 m the tip is ${num(d0 + slope * 15, 3)} m in front of the camera plane and projects to `
    + `(${num(q15[0], 0)}, ${num(q15[1], 0)}); recorded farS is (${fx}, ${fy}).`);
  console.log(`  ndcZ ${num(q15[2], 4)} rounds to ${Math.round(q15[2])}, matching the recorded farS[2] = ${subj.farS[2]}.`);
  console.log(`\n  The magnitudes differ by x${num(fx / q15[0], 2)} — and that is itself the confirmation, not a miss:`);
  console.log(`    ratio in x  ${num(fx / q15[0], 3)}      ratio in y  ${num(fy / q15[1], 3)}      (equal to ${num(100 * Math.abs(fx / q15[0] - fy / q15[1]) / (fx / q15[0]), 1)}%)`);
  console.log('  Two points on the SAME ray from the camera, differing only in depth: a screen coordinate near the');
  console.log('  camera plane goes as 1/d, so a common scale factor in BOTH axes means my head-bone estimate is off');
  console.log(`  along the beam and nothing else. Back out the depth the recorded farS implies: d = ${num((d0 + slope * 15) * q15[0] / fx, 3)} m,`);
  console.log(`  which lands inside the 0.133-0.400 m band that §4 derived independently from farS[2] rounding to 0.`);
  console.log(`  (That implies an eye ~${num(((d0 + slope * 15) - (d0 + slope * 15) * q15[0] / fx) / -slope, 2)} m further along the beam than recovered — i.e. ~20 cm of head-bone position I cannot reproduce offline.)`);

  /* CHECK F — close the loop WITHOUT the ray recovery. The stand search steps `d` along the lens
     axis (Guard.js:2199-2202) and then drops the candidate to the ground, so the guard's own
     recorded root position pins which rung was taken; the eye follows from it by source constants
     alone. This predicts d(15) with no free parameter except the head height. */
  const root = new THREE.Vector3(gx, gy, gz);
  const dRoot = root.clone().sub(CAM).dot(camFwd);
  const rung = (dRoot - 0.6266) / 0.9419;                 // invert  stand_axis_depth(d) for gp.y = 0
  console.log(`\n  CHECK F  the guard's recorded root sits ${num(dRoot, 3)} m down the lens axis.`);
  console.log(`           _solveShotPose places a candidate at cam + dir*d, then drops it to the ground, so`);
  console.log(`           axis-depth(d) = 0.9419 d + 0.6266 for a y=0 floor  =>  d = ${num(rung, 2)} m — a grid rung (0.5 m steps from 4.5).`);
  console.log('           eye = root + coneEyeFwd 0.45 along the heading, at head-bone height y_e:');
  console.log('             y_e      eye axis depth     d(15 m)      farS implied by the recorded pixels');
  for (const ye of [1.40, 1.505, 1.60]) {
    const e2 = new THREE.Vector3(gx + best.fw[0] * 0.45, ye, gz + best.fw[2] * 0.45);
    const dd = e2.clone().sub(CAM).dot(camFwd);
    console.log(`             ${num(ye, 3)}    ${num(dd, 3).padStart(8)}          ${num(dd + slope * 15, 3).padStart(6)}       ${num((d0 + slope * 15) * q15[0] / fx, 3)}`);
  }
  console.log('           => reach ~ 15.0 m (the unclipped authored length) predicts the depth the recorded farS');
  console.log('              implies, for every plausible head height. Three routes, one answer.');
}

/* ═══ 6. how common is this? ═══════════════════════════════════════════════════════════ */
H('6. census — is a far tip near/through the camera plane rare, or normal in this capture?');
{
  const inFrame = (q) => q && q[0] >= 0 && q[0] < 1280 && q[1] >= 0 && q[1] < 720;
  let nG = 0, farOff = 0, farBad = 0, both = 0, subjBad = 0, scored = 0;
  const rows = [];
  for (const rw of MF.rows) {
    const pr = rw.probe; if (!pr?.guards) continue;
    for (const g of pr.guards) {
      if (!g.farS) continue;
      nG++;
      if (!inFrame(g.farS)) farOff++;
      if (g.farS[2] !== 1) farBad++;
      if (!inFrame(g.farS) && g.beamRect) both++;
    }
    const s = pr.guards[pr.subjIdx];
    if (s?.beamRect && s?.apexS && s?.farS) {          // exactly BH1's own precondition
      scored++;
      if (!inFrame(s.farS)) { subjBad++; rows.push(`${rw.shot}.${rw.arm}: farS ${JSON.stringify(s.farS)}`); }
    }
  }
  console.log(`  guard entries with a farS across all ${MF.rows.length} rows:            ${nG}`);
  console.log(`    farS off the 1280x720 frame:                            ${farOff}  (${num(100 * farOff / nG, 1)}%)`);
  console.log(`    farS with rounded ndcZ != 1 (rectOf would have dropped): ${farBad}`);
  console.log(`    off-frame farS on an entry that ALSO has a beamRect:     ${both}`);
  console.log(`  rows where BH1's precondition (beamRect ∧ apexS ∧ farS on the SUBJECT) holds: ${scored}`);
  console.log(`  ...of those, subject farS off-frame: ${subjBad}`);
  for (const l of rows) console.log(`      ${l}`);
  console.log('\n  Note the two kinds. hero/traversal are off-frame but ndcZ=1 — ordinary in-frustum points that');
  console.log('  simply project past the viewport edge, and their t-axis is still a few hundred px, so a near/far');
  console.log('  split there would be well posed. Only `guard` has the 1/d blow-up. BH1 scores ONE row and only');
  console.log('  one — guardcone-score.mjs:61-64 hardwires row(\'guard\',\'bon\') — and that row is the pathological one.');
  const gsub = row('guard', 'bon').probe.guards[1];
  console.log(`\n  For contrast, the OTHER in-frame guard in the same frame (index 1): apexS ${JSON.stringify(gsub.apexS)} `
    + `farS ${JSON.stringify(gsub.farS)} — axis ${num(Math.hypot(gsub.farS[0] - gsub.apexS[0], gsub.farS[1] - gsub.apexS[1]), 0)} px, both ends in frustum.`);
  console.log('  The subject is index 0 because SHOT_POSE.guard pins index 0 (Guard.js:193-201, 2144, 2162).');
}

H('done — nothing above re-scores BH1. The row is VOID and stays VOID.');
