/**
 * What is in front of the eyes? Casts a ray from each eye's outer surface toward the shot
 * camera and reports every triangle it passes through, with the material group that owns it.
 * Exact, and it answers "occlusion or lighting" in one run without booting the renderer.
 *
 *   node occlude.mjs <shot>
 */
import * as THREE from 'three';

const warnings = [];
const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings, warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {} };
const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const { SHOTS } = await import('../src/core/Shots.js');

const GROUPS = ['fur', 'furCream', 'furDark', 'cloth', 'clothDark', 'gold', 'ink', 'eye'];
const shotName = process.argv[2] || 'sly-closeup';
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
sly.root.updateMatrixWorld(true);
sly.skeleton.update();

/* CPU skin into world (root at identity — we work in model space and put the camera there) */
const geo = sly.mesh.geometry;
const posA = geo.attributes.position, siA = geo.attributes.skinIndex, swA = geo.attributes.skinWeight;
const bones = sly.mesh.skeleton.bones, inv = sly.mesh.skeleton.boneInverses;
const V = new Float32Array(posA.count * 3);
{
  const v = new THREE.Vector3(), t = new THREE.Vector3(), m = new THREE.Matrix4();
  for (let i = 0; i < posA.count; i++) {
    t.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = swA.getComponent(i, k); if (w === 0) continue;
      m.multiplyMatrices(bones[siA.getComponent(i, k)].matrixWorld, inv[siA.getComponent(i, k)]);
      v.fromBufferAttribute(posA, i).applyMatrix4(m);
      t.addScaledVector(v, w);
    }
    V[i * 3] = t.x; V[i * 3 + 1] = t.y; V[i * 3 + 2] = t.z;
  }
}
const groupOf = (k) => {
  for (const g of geo.groups) if (k >= g.start && k < g.start + g.count) return GROUPS[g.materialIndex];
  return '?';
};

/* camera direction in model space: undo the root yaw */
const yaw = shot.player.yaw ?? 0;
const camW = new THREE.Vector3().fromArray(shot.pos).sub(new THREE.Vector3().fromArray(shot.player.pos));
const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
const camM = new THREE.Vector3(camW.x * cy + camW.z * sy, camW.y, -camW.x * sy + camW.z * cy);

const idx = geo.index.array;
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), pv = new THREE.Vector3(), tv = new THREE.Vector3(), qv = new THREE.Vector3();
function trace(origin, dir, label) {
  const hits = [];
  for (let k = 0; k < idx.length; k += 3) {
    a.fromArray(V, idx[k] * 3); b.fromArray(V, idx[k + 1] * 3); c.fromArray(V, idx[k + 2] * 3);
    e1.subVectors(b, a); e2.subVectors(c, a);
    pv.crossVectors(dir, e2);
    const det = e1.dot(pv);
    if (Math.abs(det) < 1e-12) continue;
    const invDet = 1 / det;
    tv.subVectors(origin, a);
    const u = tv.dot(pv) * invDet; if (u < 0 || u > 1) continue;
    qv.crossVectors(tv, e1);
    const v = dir.dot(qv) * invDet; if (v < 0 || u + v > 1) continue;
    const t = e2.dot(qv) * invDet;
    if (t > 1e-4) hits.push([t, groupOf(k)]);
  }
  hits.sort((x, y2) => x[0] - y2[0]);
  const seen = [];
  for (const [t, g] of hits) { if (!seen.length || seen[seen.length - 1][1] !== g) seen.push([t, g]); }
  const boneNames = sly.boneNames;
  const nearestBone = (p) => {
    let best = -1, bd = 1e9;
    for (let i = 0; i < posA.count; i++) {
      const dx = V[i * 3] - p.x, dy = V[i * 3 + 1] - p.y, dz = V[i * 3 + 2] - p.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    let bi = -1, bw = -1;
    for (let k = 0; k < 4; k++) { const w = swA.getComponent(best, k); if (w > bw) { bw = w; bi = siA.getComponent(best, k); } }
    return boneNames[bi];
  };
  const fmt = seen.map(([t, g]) => {
    const p = origin.clone().addScaledVector(dir, t);
    return `${g}@${t.toFixed(3)}m[${nearestBone(p)}]`;
  });
  console.log(`  ${label}: ${fmt.length ? fmt.join(' -> ') : 'CLEAR to camera'}`);
}

console.log(`shot ${shotName} — ray from each eye toward the camera (model space)`);
for (const side of [1, -1]) {
  const th = side * 0.455;
  const c0 = sly.headSurf(th, 0.165, 0.80);
  const outward = new THREE.Vector3(side * 0.36, 0.10, 1).normalize();
  // surface of the sclera on the outward side — where the white would be visible from
  const surf = c0.clone().addScaledVector(outward, 0.073 * 1.31 * 0.98);
  const headBone = sly.bones.head;
  const invH = sly.skeleton.boneInverses[sly.boneNames.indexOf('head')];
  const skinM = new THREE.Matrix4().multiplyMatrices(headBone.matrixWorld, invH);
  const p = surf.clone().applyMatrix4(skinM);
  const dir = camM.clone().sub(p).normalize();
  trace(p, dir, `eye${side > 0 ? 'L' : 'R'} centre `);
  /* The white ring: the pupil sits on the outward axis, so a centre ray always passes through
     it. These probe the sclera either side of the pupil — that is the white that has to reach
     the camera for an eye to read at all. */
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, outward).normalize();
  const trueUp = new THREE.Vector3().crossVectors(outward, right).normalize();
  for (const [nm, off] of [['white+x', right.clone().multiplyScalar(0.062)],
    ['white+y', trueUp.clone().multiplyScalar(0.062)]]) {
    const q = c0.clone().addScaledVector(outward, 0.052).add(off).applyMatrix4(skinM);
    trace(q, camM.clone().sub(q).normalize(), `eye${side > 0 ? 'L' : 'R'} ${nm} `);
  }
}
