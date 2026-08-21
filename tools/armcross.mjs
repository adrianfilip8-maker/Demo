/**
 * armcross.mjs — is an asymmetric source pose landing crossed/mirrored on the shipped rig?
 *
 * The §470 instrument's question re-aimed at the swapped set: the user reads "arms crossed" on
 * ledge_hang (LedgeGrab Idle) and spire_balance (SpireJumpIdle) — both godot-swapped idles —
 * which smells like ONE retarget defect, not two clip defects. This measures the composition at
 * three seams so the story has nowhere to hide (§442.3):
 *
 *   SOURCE   the GLB's own sampled pose (mixer + node world matrices), facing-corrected into
 *            our frame (character faces +Z, character-left = +X) — the Godot-space truth.
 *   DELIVERED the emitted keys through the REAL pipeline: buildClipSet('godot') → compile()'d
 *            table → Clips.js sampleInto → SlyModel skeleton FK — what the player's rig does.
 *   REST     both rigs' bind arm geometry — the constant the world-delta method silently adds
 *            to every delivered pose (delta composed onto OUR rest, not theirs).
 *
 * Per sample: lateral (x) of hand/elbow per side relative to the hips midline, hand separation
 * (handL.x − handR.x; positive = uncrossed for a +Z-facing character), elbow interior angle, and
 * whether the frontal projections of the two forearms intersect (the literal "crossed arms").
 *
 * Usage: node tools/armcross.mjs "LedgeGrab Idle:ledge_hang" "SpireJumpIdle:spire_balance" [...]
 *        node tools/armcross.mjs --rest        # rest-pose geometry of both rigs only
 */
import './_domshim.mjs';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET = path.join(ROOT, 'public/assets/sly-godot/sly-godot-moves.glb');

const { buildClipSet } = await import('../src/player/Animation.js');
const { sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const { SlyModel } = await import('../src/player/SlyModel.js');

/* ---------------- source side ---------------- */
const buf = readFileSync(ASSET);
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const root = gltf.scene;
root.updateMatrixWorld(true);
const nodes = new Map();
root.traverse((o) => { if (o.name) nodes.set(o.name, o); });
const resolve = (nm) => nodes.get(nm) || nodes.get(nm.replace(/\./g, '')) || nodes.get(nm.replace(/\./g, '_'));

/* facing, measured the same way godot2clips measures it */
const _v = new THREE.Vector3();
const wpos = (n) => _v.setFromMatrixPosition(resolve(n).matrixWorld).clone();
const toeZ = wpos('toe.L').z - wpos('foot.L').z;
const FLIP = toeZ < 0;
/* facing-corrected source position: character faces +Z, char-left = +X */
const fix = (p) => (FLIP ? new THREE.Vector3(-p.x, p.y, -p.z) : p.clone());

const S = {
  hips: 'spine.001', chest: 'spine.004',
  shL: 'shoulder.L', uaL: 'upper_arm.L', elL: 'forearm.L', haL: 'hand.L',
  shR: 'shoulder.R', uaR: 'upper_arm.R', elR: 'forearm.R', haR: 'hand.R',
};

const mixer = new THREE.AnimationMixer(root);

function srcSample(clip, t) {
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  const o = {};
  for (const [k, nm] of Object.entries(S)) o[k] = fix(wpos(nm));
  return o;
}

/* ---------------- delivered side ---------------- */
const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const sly = new SlyModel(engine);
await sly.init();
const { table, origin } = buildClipSet('godot');
const pb = new PoseBuffer(sly.boneNames);

const D = {
  hips: 'hips', chest: 'chest',
  shL: 'shoulderL', uaL: 'upperArmL', elL: 'lowerArmL', haL: 'handL',
  shR: 'shoulderR', uaR: 'upperArmR', elR: 'lowerArmR', haR: 'handR',
};

function dlvSample(clip, t) {
  pb.clear();
  sampleInto(clip, t, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  const at = (n) => new THREE.Vector3().setFromMatrixPosition(sly.bones[n].matrixWorld);
  const o = {};
  for (const [k, nm] of Object.entries(D)) o[k] = at(nm);
  return o;
}

/* ---------------- metrics ---------------- */
const ang = (a, b, c) => {           // interior angle at b, degrees
  const u = a.clone().sub(b).normalize(), w = c.clone().sub(b).normalize();
  return Math.acos(THREE.MathUtils.clamp(u.dot(w), -1, 1)) * 180 / Math.PI;
};
/* 2D segment intersection in the frontal (x,y) plane — the literal crossed-forearms test */
function segX(p1, p2, p3, p4) {
  const d = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function report(tag, o, scale) {
  /* BODY-FRAME axes, from the pose itself: a clip may yaw the whole body in model space
     (several procedural attach poses do), so model X is NOT the character's lateral. The
     shoulder line is rigid to the chest and yaw-invariant: lat = uaL − uaR, horizontalised. */
  const lat = o.uaL.clone().sub(o.uaR); lat.y = 0; lat.normalize();
  const latOf = (p) => p.clone().sub(o.hips).dot(lat);
  const upOf = (p) => p.y;
  const L = { el: latOf(o.elL), ha: latOf(o.haL) };
  const R = { el: latOf(o.elR), ha: latOf(o.haR) };
  const sep = (L.ha - R.ha) / scale;
  const elbL = ang(o.uaL, o.elL, o.haL), elbR = ang(o.uaR, o.elR, o.haR);
  /* forearm crossing in the body's frontal (lat, up) plane */
  const forX = segX(
    { x: latOf(o.elL), y: upOf(o.elL) }, { x: latOf(o.haL), y: upOf(o.haL) },
    { x: latOf(o.elR), y: upOf(o.elR) }, { x: latOf(o.haR), y: upOf(o.haR) });
  console.log(`    ${tag}  handL lat ${(L.ha / scale).toFixed(2).padStart(6)}  handR lat ${(R.ha / scale).toFixed(2).padStart(6)}`
    + `  sep ${sep.toFixed(2).padStart(6)}${sep < 0 ? ' CROSSED' : '        '}`
    + `  elbLat L ${(L.el / scale).toFixed(2).padStart(5)} R ${(R.el / scale).toFixed(2).padStart(5)}`
    + `  elbowL ${elbL.toFixed(0).padStart(4)}°  elbowR ${elbR.toFixed(0).padStart(4)}°`
    + `  forearmsX ${forX ? 'YES' : 'no '}`
    + `   handY L ${o.haL.y.toFixed(2)} R ${o.haR.y.toFixed(2)}`);
  return { sep, elbL, elbR, forX };
}

/* delivered sample of a weighted two-clip blend — the runtime's own crossfade composition */
function dlvBlend(clipA, tA, wA, clipB, tB) {
  pb.clear();
  sampleInto(clipA, tA, pb, wA);
  sampleInto(clipB, tB, pb, 1 - wA);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  const at = (n) => new THREE.Vector3().setFromMatrixPosition(sly.bones[n].matrixWorld);
  const o = {};
  for (const [k, nm] of Object.entries(D)) o[k] = at(nm);
  return o;
}

/* ---------------- rest geometry (both rigs) ---------------- */
const srcShoulderW = Math.abs(fix(wpos(S.uaL)).x - fix(wpos(S.uaR)).x);
mixer.stopAllAction();
root.updateMatrixWorld(true);
const restSrc = {}; for (const [k, nm] of Object.entries(S)) restSrc[k] = fix(wpos(nm));
pb.clear();
for (const n of sly.boneNames) { const b = sly.bones[n]; if (b) { b.quaternion.identity(); b.scale.set(1, 1, 1); } }
sly.bones.hips.position.copy(sly.bp('hips'));
sly.root.updateMatrixWorld(true);
const restDlv = {}; for (const [k, nm] of Object.entries(D)) restDlv[k] = new THREE.Vector3().setFromMatrixPosition(sly.bones[nm].matrixWorld);
const dlvShoulderW = Math.abs(restDlv.uaL.x - restDlv.uaR.x);

console.log(`facing: source toes ${toeZ >= 0 ? '+Z' : '-Z'} — positions ${FLIP ? '' : 'NOT '}flip-corrected`);
console.log(`shoulder width  source ${srcShoulderW.toFixed(3)}  rig3 ${dlvShoulderW.toFixed(3)}  (lateral x normalised by each)`);
console.log('\nREST geometry (x lateral from hips, y up; arm dir = shoulder→hand unit):');
for (const [tag, o, w] of [['source', restSrc, srcShoulderW], ['rig3  ', restDlv, dlvShoulderW]]) {
  const dirL = restSrc === o ? o.haL.clone().sub(o.uaL).normalize() : o.haL.clone().sub(o.uaL).normalize();
  const dirR = o.haR.clone().sub(o.uaR).normalize();
  console.log(`  ${tag} elbowL ${ang(o.uaL, o.elL, o.haL).toFixed(1).padStart(6)}°  elbowR ${ang(o.uaR, o.elR, o.haR).toFixed(1).padStart(6)}°`
    + `  armdirL [${dirL.toArray().map((v) => v.toFixed(2)).join(',')}]  armdirR [${dirR.toArray().map((v) => v.toFixed(2)).join(',')}]`);
}

if (process.argv.includes('--rest')) process.exit(0);

/* ---------------- blend-seam sweep: the runtime crossfade, measured ---------------- */
if (process.argv.includes('--blend')) {
  /* Partner B comes from the SHIPPED table — these are the real crossfades the moveset drives
     (hang↔shimmy on any ledge input change, rail_walk↔balance_idle across the 0.25 m/s line,
     spire_land→spire_balance at state time 0.3). */
  for (const [aName, bName, aT, bT] of [
    ['ledge_hang', 'ledge_shimmy_r', 0.45, 0.45],
    ['ledge_hang', 'ledge_shimmy_l', 0.45, 0.45],
    ['rail_walk', 'balance_idle', 0.45, 0.45],
    ['spire_balance', 'spire_land', 0.45, 0.95],
  ]) {
    const A = table[aName], B = table[bName];
    if (!A || !B) { console.log(`!! blend ${aName}+${bName}: missing`); continue; }
    console.log(`\n=== BLEND ${aName} (${origin[aName]}) × ${bName} (${origin[bName]}) — w sweep, phases ${aT}/${bT}`);
    let minSep = Infinity, minW = 0, anyX = false, xw = [];
    for (let w = 0; w <= 1.001; w += 0.1) {
      const o = dlvBlend(A, aT * A.dur, w, B, bT * B.dur);
      const r = report(`w=${w.toFixed(1)}`, o, dlvShoulderW);
      if (r.sep < minSep) { minSep = r.sep; minW = w; }
      if (r.forX) { anyX = true; xw.push(+w.toFixed(1)); }
    }
    console.log(`    => min sep ${minSep.toFixed(2)} at w=${minW.toFixed(1)}; forearm crossing ${anyX ? `AT w=${xw.join(',')}` : 'never'}`);
  }
  process.exit(0);
}

/* ---------------- per-clip comparison ---------------- */
const procTable = buildClipSet('proc').table;
const pairs = process.argv.slice(2).filter((a) => a.includes(':'));
for (const pair of pairs.length ? pairs : ['LedgeGrab Idle:ledge_hang', 'SpireJumpIdle:spire_balance']) {
  const [srcName, gameName] = pair.split(':');
  const clip = gltf.animations.find((a) => a.name.trim() === srcName.trim());
  const dlv = table[gameName];
  if (!clip || !dlv) { console.log(`!! ${pair}: missing (src ${!!clip}, table ${!!dlv})`); continue; }
  console.log(`\n=== ${srcName} → ${gameName}   (origin ${origin[gameName]})  srcDur ${clip.duration.toFixed(2)}  dlvDur ${dlv.dur.toFixed(2)}`);
  const act = mixer.clipAction(clip);
  act.reset(); act.play();
  for (const f of [0.15, 0.45, 0.75]) {
    const s = srcSample(clip, f * clip.duration);
    const d = dlvSample(dlv, f * dlv.dur);
    const p = dlvSample(procTable[gameName], f * procTable[gameName].dur);
    console.log(`  t ${(f * clip.duration).toFixed(2)}s (${(f * 100).toFixed(0)}%)`);
    report('SOURCE   ', s, srcShoulderW);
    report('DELIVERED', d, dlvShoulderW);
    report('PROC-BASE', p, dlvShoulderW);
  }
  act.stop();
}
if (warnings.length) console.log('\nwarnings:', warnings.join(' | '));
