/**
 * Where do the eyes actually land on screen in a given shot, and what colour is that pixel?
 *
 * Builds SlyModel, freezes the shot's clip exactly as Animation.freezePose() does, places the
 * root at the shot's player transform, and projects named landmarks through the shot camera.
 * Then samples the captured PNG at those pixels. No renderer boot.
 *
 *   node eyeprobe.mjs <shot> <png>
 */
import * as THREE from 'three';
import { readPNG } from './png.mjs';

const warnings = [];
const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings, warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {} };
const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const { SHOTS } = await import('../src/core/Shots.js');

const shotName = process.argv[2] || 'sly-closeup';
const pngPath = process.argv[3];
const shot = SHOTS[shotName];

const sly = new SlyModel(engine);
await sly.init();

const clip = CLIPS[shot.player.pose];
const pb = new PoseBuffer(sly.boneNames).clear();
sampleInto(clip, clip.hold ?? 0, pb, 1);
for (const n of sly.boneNames) {
  const b = sly.bones[n]; if (!b) continue;
  if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
  if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
}
const hb = sly.bp('hips');
sly.bones.hips.position.set(hb.x + pb.pos.x, hb.y + pb.pos.y, hb.z + pb.pos.z);
sly.root.position.fromArray(shot.player.pos);
sly.root.rotation.set(0, shot.player.yaw ?? 0, 0);
sly.root.updateMatrixWorld(true);

const W = 960, H = 540;
const cam = new THREE.PerspectiveCamera(shot.fov ?? 45, W / H, 0.1, 500);
cam.position.fromArray(shot.pos);
cam.lookAt(new THREE.Vector3().fromArray(shot.target));
if (shot.roll) cam.rotateZ(THREE.MathUtils.degToRad(shot.roll));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

const project = (v) => {
  const p = v.clone().project(cam);
  return [Math.round((p.x * 0.5 + 0.5) * W), Math.round((-p.y * 0.5 + 0.5) * H)];
};

/* Landmarks, in model space, taken from the same helpers the builders use. */
const S = 1;
const marks = [];
const headM = sly.bones.head.matrixWorld;
for (const side of [1, -1]) {
  const th = side * 0.455;
  // sclera centre and its outermost point, in bind head space then skinned via the head bone
  const c = sly.headSurf(th, 0.165, 0.80);
  marks.push([`eye${side > 0 ? 'L' : 'R'}`, c]);
  const outward = new THREE.Vector3(side * 0.36, 0.10, 1).normalize();
  marks.push([`eye${side > 0 ? 'L' : 'R'}-front`, c.clone().addScaledVector(outward, 0.10)]);
}
marks.push(['nose', new THREE.Vector3(0, sly.headSurf(0, -0.30, 1.0).y, 0).setX(0)]);
marks.push(['browMid', sly.headSurf(0, 0.62, 1.03)]);
marks.push(['chin', sly.headSurf(0, -0.72, 1.0)]);
void S; void headM;

// bind → world through the head bone (all these landmarks are head-weighted)
const headBone = sly.bones.head;
const inv = sly.skeleton.boneInverses[sly.boneNames.indexOf('head')];
const skinM = new THREE.Matrix4().multiplyMatrices(headBone.matrixWorld, inv);

const img = pngPath ? readPNG(pngPath) : null;
const sample = (x, y) => {
  if (!img) return '—';
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return 'off-frame';
  const ch = img.ch || img.data.length / (img.w * img.h);
  const o = (y * img.w + x) * ch;
  if (img.data[o] === undefined) return "no-data";
  const r = img.data[o], g = img.data[o + 1], b = img.data[o + 2];
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(0);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')} L${L}`;
};

console.log(`shot ${shotName}  ${W}x${H}  png ${pngPath || '(none)'}`);
for (const [name, p] of marks) {
  const w = p.clone().applyMatrix4(skinM);
  const [x, y] = project(w);
  console.log(`  ${name.padEnd(12)} world ${w.x.toFixed(2)},${w.y.toFixed(2)},${w.z.toFixed(2)}  px ${String(x).padStart(4)},${String(y).padStart(4)}  ${sample(x, y)}`);
}
// eye angular size in pixels
const cL = marks.find((m) => m[0] === 'eyeL')[1].clone().applyMatrix4(skinM);
const rWorld = 0.073 * 1.31;
const a = project(cL);
const b = project(cL.clone().add(new THREE.Vector3(0, rWorld, 0)));
console.log(`  sclera radius on screen: ${Math.abs(b[1] - a[1])} px  (diameter ${Math.abs(b[1] - a[1]) * 2} px)`);
