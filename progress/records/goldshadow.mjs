/**
 * goldshadow — is the gilded architecture in the money shots LIT?
 *
 * The gating question for every geometry lever on gold. `toon.glsl.js:527`:
 *
 *     vec3 spec = specTint * ( specAmt * specStep * sh * step( 0.02, ndl ) );
 *
 * `sh` multiplies the whole specular term, so in shadow the lobe is identically zero at any
 * curvature. Rounded arrises raise the PROBABILITY of catching the lobe when lit and do
 * nothing whatsoever when not. If most gilded area in the money shots is shadowed, no amount
 * of edge treatment can matter and that is the finding.
 *
 * Two corrections over goldcurve/goldspec, both of which mattered:
 *   - the REAL per-shot key direction from `evalAtmosphere(shot.tod)`, not one hardcoded
 *     golden-hour vector for all fifteen framings. The night shots (tod 0.02 / 0.10) are lit
 *     by a moon in a completely different part of the sky.
 *   - a real occlusion test: a ray from each gilded triangle toward the key, against the whole
 *     built level (architecture + props). This is the term goldspec explicitly did not model,
 *     and §121.8 flagged that omission as the reason its ranking was "a coincidence with a
 *     good track record".
 *
 * Reports, per shot, over frustum-visible front-facing gilded triangles, area-weighted:
 *   ndl>0   — faces the key at all (the `step(0.02, ndl)` gate)
 *   lit     — faces the key AND the ray to the key is unoccluded (the `sh` gate)
 *   lit&lobe — lit AND within the specular lobe's onset window (what can actually be gold)
 */
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '/home/user/Demo/src/render/Atmosphere.js';

const MATS = (process.env.CTL_MATS||'arch:hieroglyph_gilded,arch:gold_leaf').split(',');
const RG = 0.608;
const GLOSS = Number(process.argv[2] || 64);
const BIAS = Number(process.env.BIAS || 0.01);   // normal-offset, stands in for the shadow map's bias
const glossP = Math.max(GLOSS * (1 - 0.6 * RG), 4);
const NDH_ON = Math.pow(0.02, 1 / glossP);
const ONSET = Math.acos(NDH_ON) * 180 / Math.PI;

const { A, root } = await buildLevel({ withProps: true });
const world = root; world.updateMatrixWorld(true);

/* Every visible triangle in the level = the occluder set. Gilded ones also become targets. */
const OCC = [];                 // flat [ax,ay,az, bx,by,bz, cx,cy,cz]
const GILD = [];                // {c:Vector3, n:Vector3, area}
{
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
  world.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    if (o.userData?.slyOutline || o.userData?.isOutlineShell) return;
    const gild = MATS.includes(o.material?.name || '');
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    if (!pos) return;
    const cnt = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < cnt; i += 3) {
        const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
        p0.fromBufferAttribute(pos, a).applyMatrix4(m);
        p1.fromBufferAttribute(pos, b).applyMatrix4(m);
        p2.fromBufferAttribute(pos, c).applyMatrix4(m);
        OCC.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        if (!gild) continue;
        e1.subVectors(p1, p0); e2.subVectors(p2, p0); nn.crossVectors(e1, e2);
        const area = nn.length() * 0.5; if (area < 1e-9) continue;
        GILD.push({
          c: new THREE.Vector3().addVectors(p0, p1).add(p2).multiplyScalar(1 / 3),
          n: nn.clone().multiplyScalar(1 / (area * 2)), area,
        });
      }
    }
  });
}
console.log(`occluders ${OCC.length / 9} tris,  gilded ${GILD.length} tris,  gloss ${GLOSS} -> onset half-angle ${ONSET.toFixed(2)}°`);

/* ---- uniform grid over the occluder set so the shadow rays finish this decade ---- */
const CELL = 8;
const bounds = new THREE.Box3();
{ const v = new THREE.Vector3();
  for (let i = 0; i < OCC.length; i += 3) bounds.expandByPoint(v.set(OCC[i], OCC[i + 1], OCC[i + 2])); }
const gmin = bounds.min.clone().addScalar(-1);
const dim = bounds.max.clone().sub(gmin).addScalar(1).divideScalar(CELL).ceil();
const NX = Math.max(1, dim.x | 0), NY = Math.max(1, dim.y | 0), NZ = Math.max(1, dim.z | 0);
const grid = new Map();
const cellIdx = (x, y, z) => (x * NY + y) * NZ + z;
for (let t = 0; t < OCC.length / 9; t++) {
  const o = t * 9;
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let k = 0; k < 3; k++) {
    const x = OCC[o + k * 3], y = OCC[o + k * 3 + 1], z = OCC[o + k * 3 + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const i0 = Math.max(0, Math.floor((x0 - gmin.x) / CELL)), i1 = Math.min(NX - 1, Math.floor((x1 - gmin.x) / CELL));
  const j0 = Math.max(0, Math.floor((y0 - gmin.y) / CELL)), j1 = Math.min(NY - 1, Math.floor((y1 - gmin.y) / CELL));
  const k0 = Math.max(0, Math.floor((z0 - gmin.z) / CELL)), k1 = Math.min(NZ - 1, Math.floor((z1 - gmin.z) / CELL));
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
    const id = cellIdx(i, j, k);
    let l = grid.get(id); if (!l) { l = []; grid.set(id, l); }
    l.push(t);
  }
}

/** Moller-Trumbore, any-hit, against triangles in the cells the ray walks. */
function occluded(ox, oy, oz, dx, dy, dz, maxT) {
  let ix = Math.floor((ox - gmin.x) / CELL), iy = Math.floor((oy - gmin.y) / CELL), iz = Math.floor((oz - gmin.z) / CELL);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(CELL / (dx || 1e-12)), tdy = Math.abs(CELL / (dy || 1e-12)), tdz = Math.abs(CELL / (dz || 1e-12));
  const bx = gmin.x + (ix + (dx > 0 ? 1 : 0)) * CELL, by = gmin.y + (iy + (dy > 0 ? 1 : 0)) * CELL, bz = gmin.z + (iz + (dz > 0 ? 1 : 0)) * CELL;
  let tmx = dx === 0 ? Infinity : (bx - ox) / dx, tmy = dy === 0 ? Infinity : (by - oy) / dy, tmz = dz === 0 ? Infinity : (bz - oz) / dz;
  let guard = 0;
  while (guard++ < 4096) {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= NX || iy >= NY || iz >= NZ) return false;
    const list = grid.get(cellIdx(ix, iy, iz));
    if (list) {
      for (let n = 0; n < list.length; n++) {
        const o = list[n] * 9;
        const ax = OCC[o], ay = OCC[o + 1], az = OCC[o + 2];
        const e1x = OCC[o + 3] - ax, e1y = OCC[o + 4] - ay, e1z = OCC[o + 5] - az;
        const e2x = OCC[o + 6] - ax, e2y = OCC[o + 7] - ay, e2z = OCC[o + 8] - az;
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-9 && det < 1e-9) continue;
        const inv = 1 / det;
        const tx = ox - ax, ty = oy - ay, tz = oz - az;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t > 1e-4 && t < maxT) return true;
      }
    }
    if (tmx < tmy && tmx < tmz) { ix += sx; tmx += tdx; }
    else if (tmy < tmz) { iy += sy; tmy += tdy; }
    else { iz += sz; tmz += tdz; }
  }
  return false;
}

const st = createAtmosphereState();
const V = new THREE.Vector3(), H = new THREE.Vector3();

console.log(`\nshot          tod   key el/az      inFrustum m2   ndl>0    LIT   lit&lobe   (of total gilded)`);
for (const name of Object.keys(SHOTS)) {
  const s = SHOTS[name];
  evalAtmosphere(s.tod ?? 0.8, st);
  const key = st.keyDir.clone().normalize();
  const el = Math.asin(key.y) * 180 / Math.PI, az = Math.atan2(key.z, key.x) * 180 / Math.PI;

  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, 1280 / 720, 0.1, 900);
  cam.position.fromArray(s.pos); cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const fr = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));

  let aTot = 0, aNdl = 0, aLit = 0, aLobe = 0;
  for (const g of GILD) {
    if (!fr.containsPoint(g.c)) continue;
    V.subVectors(cam.position, g.c); const dEye = V.length(); V.multiplyScalar(1 / dEye);
    if (g.n.dot(V) < 0) continue;
    /* CAMERA-VISIBILITY CULL. Without this the denominator is every gilded triangle inside the
       frustum VOLUME — including the tomb architraves 100 m away behind the hall's south wall,
       which no camera can see. That inflated `hero`'s gilded area from 48 m2 of visible kiosk
       ring to 1188 m2 and drove the lit fraction from 45% to 6%. This is exactly the
       availability-vs-visibility confusion §121.8 flagged in goldspec, reproduced in my own
       instrument before I caught it. */
    if (!process.env.NO_VISCULL &&
        occluded(g.c.x + g.n.x * 0.05, g.c.y + g.n.y * 0.05, g.c.z + g.n.z * 0.05, V.x, V.y, V.z, dEye - 0.1)) continue;
    aTot += g.area;
    const ndl = g.n.dot(key);
    if (ndl <= 0.02) continue;
    aNdl += g.area;
    if (occluded(g.c.x + g.n.x * BIAS, g.c.y + g.n.y * BIAS, g.c.z + g.n.z * BIAS, key.x, key.y, key.z, 400)) continue;
    aLit += g.area;
    H.copy(key).add(V).normalize();
    if (g.n.dot(H) > NDH_ON) aLobe += g.area;
  }
  const pc = (x) => aTot > 0 ? `${(100 * x / aTot).toFixed(1)}%`.padStart(6) : '   n/a';
  console.log(`${name.padEnd(13)} ${(s.tod ?? 0.8).toFixed(2)}  ${el.toFixed(0).padStart(3)}°/${az.toFixed(0).padStart(4)}°  ` +
    `${aTot.toFixed(1).padStart(11)}   ${pc(aNdl)} ${pc(aLit)}   ${pc(aLobe)}`);
}
