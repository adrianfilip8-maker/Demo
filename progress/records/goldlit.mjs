/* Is `hieroglyph_gilded` LIT in any canonical framing?
 *
 * SCOPE — the suffix NOT implemented (§11): no shadow map, no normal map, no AO, no post, and
 * no occlusion test. ndl = max(0, n·keyDir) exactly as the shader's diffuse term computes it,
 * area-weighted over frustum-visible front-facing triangles of one material. So this is an
 * UPPER BOUND on how lit the material can be: a triangle counted lit here can still be inside a
 * cast shadow. It cannot overstate darkness, which is the direction the question needs.
 */
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
const MAT = process.argv[2] || 'arch:hieroglyph_gilded';
const { A, root } = await buildLevel();
const world = root || A.root; world.updateMatrixWorld(true);
const tris = [];
{
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  world.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    if (o.userData?.slyOutline || o.userData?.isOutlineShell) return;
    if ((o.material?.name || '') !== MAT) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i+1) : i+1, c = idx ? idx.getX(i+2) : i+2;
        p0.fromBufferAttribute(pos,a).applyMatrix4(m); p1.fromBufferAttribute(pos,b).applyMatrix4(m); p2.fromBufferAttribute(pos,c).applyMatrix4(m);
        tris.push([p0.clone(), p1.clone(), p2.clone()]);
      }
    }
  });
}
console.log(`# ${MAT}: ${tris.length} triangles in the level`);
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3(), ctr = new THREE.Vector3();
for (const name of Object.keys(SHOTS)) {
  const s = SHOTS[name];
  const key = s.keyDir ? new THREE.Vector3().fromArray(s.keyDir).normalize()
            : new THREE.Vector3(-0.899, 0.438, 0).normalize();   // evalAtmosphere(0.76).sunDir, §8
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, 1280/720, 0.1, 900);
  cam.position.fromArray(s.pos); cam.up.set(0,1,0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const eye = cam.position;
  let aTot = 0, aLit = 0, aHot = 0;
  for (const [p0,p1,p2] of tris) {
    ctr.copy(p0).add(p1).add(p2).multiplyScalar(1/3);
    if (!fr.containsPoint(ctr)) continue;
    e1.subVectors(p1,p0); e2.subVectors(p2,p0); nn.crossVectors(e1,e2);
    const area = nn.length()*0.5; if (area < 1e-9) continue;
    nn.multiplyScalar(1/(area*2));
    if (nn.dot(ctr.clone().sub(eye)) > 0) continue;      // back-facing to the camera
    const ndl = Math.max(0, nn.dot(key));
    aTot += area; if (ndl > 0.14) aLit += area; if (ndl > 0.52) aHot += area;
  }
  if (aTot > 0.5) console.log(`${name.padEnd(13)} visible area ${aTot.toFixed(0).padStart(6)} m2   above lo-terminator(0.14) ${(100*aLit/aTot).toFixed(1).padStart(5)}%   above hi(0.52) ${(100*aHot/aTot).toFixed(1).padStart(5)}%`);
}
