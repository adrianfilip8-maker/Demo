/* Build Architecture headless and expose world-space triangles. */
import * as THREE from 'three';

export async function buildLevel() {
  const warnings = [];
  const engine = {
    quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
    warn: (m) => warnings.push(m),
    get: () => null, has: () => false,
    on: () => () => {}, emit: () => {},
    registerCollider: () => {},
  };
  const { Architecture } = await import('../src/world/Architecture.js');
  const A = new Architecture(engine);
  await A.init();
  return { A, engine, warnings };
}

/** Collect world-space triangles from visible meshes whose bbox overlaps `box`. */
export function trisIn(root, box) {
  const out = [];        // {ax..cz, name}
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const g = o.geometry;
    if (!g?.attributes?.position) return;
    if (!g.boundingBox) g.computeBoundingBox();
    /* An InstancedMesh's geometry bbox is the UNIT piece at the origin, so testing it against
       a probe box 50 m away rejected every paving slab in the level and made every downward
       ray report "no floor". Instanced meshes skip the cheap reject. */
    if (!o.isInstancedMesh) {
      const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (!bb.intersectsBox(box)) return;
    }
    const pos = g.attributes.position;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    const inst = o.isInstancedMesh ? o.count : 1;
    for (let ii = 0; ii < inst; ii++) {
      const m = new THREE.Matrix4();
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); }
      else m.copy(o.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        const t = [];
        let lo = new THREE.Vector3(1e9,1e9,1e9), hi = new THREE.Vector3(-1e9,-1e9,-1e9);
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(i + k) : i + k;
          v.fromBufferAttribute(pos, vi).applyMatrix4(m);
          t.push(v.x, v.y, v.z);
          lo.min(v); hi.max(v);
        }
        if (hi.x < box.min.x || lo.x > box.max.x) continue;
        if (hi.y < box.min.y || lo.y > box.max.y) continue;
        if (hi.z < box.min.z || lo.z > box.max.z) continue;
        out.push({ t, name: o.name });
      }
    }
  });
  return out;
}

/** Möller–Trumbore. Returns t or -1. Two-sided. */
export function rayTri(ox, oy, oz, dx, dy, dz, T) {
  const e1x = T[3]-T[0], e1y = T[4]-T[1], e1z = T[5]-T[2];
  const e2x = T[6]-T[0], e2y = T[7]-T[1], e2z = T[8]-T[2];
  const px = dy*e2z - dz*e2y, py = dz*e2x - dx*e2z, pz = dx*e2y - dy*e2x;
  const det = e1x*px + e1y*py + e1z*pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1/det;
  const tx = ox-T[0], ty = oy-T[1], tz = oz-T[2];
  const u = (tx*px + ty*py + tz*pz) * inv;
  if (u < -1e-7 || u > 1+1e-7) return -1;
  const qx = ty*e1z - tz*e1y, qy = tz*e1x - tx*e1z, qz = tx*e1y - ty*e1x;
  const vv = (dx*qx + dy*qy + dz*qz) * inv;
  if (vv < -1e-7 || u+vv > 1+1e-7) return -1;
  const t = (e2x*qx + e2y*qy + e2z*qz) * inv;
  return t > 1e-6 ? t : -1;
}

export function firstHit(o, d, tris) {
  let best = Infinity, who = null;
  for (const tr of tris) {
    const t = rayTri(o[0],o[1],o[2], d[0],d[1],d[2], tr.t);
    if (t > 0 && t < best) { best = t; who = tr.name; }
  }
  return { t: best, who };
}
