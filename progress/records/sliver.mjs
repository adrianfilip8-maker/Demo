#!/usr/bin/env node
/* sliver — offline census of NARROW UP-FACING STRIPS in the built level.
 *
 * The `guard` cyan-line family is mechanically always the same object: a narrow up-facing
 * strip between two surfaces that face elsewhere. Up-facing means it collects the key at a
 * high N·L while its neighbours do not, so it renders one band brighter than both — exactly
 * where the eye expects a contact crease to be darker. A kerb top, a chamfer arris, a plinth's
 * far edge and a proud stylobate apron are all instances of it. The brief that opened this
 * item stated the fix in the same terms: *"either give it real width or bury it in the wall."*
 *
 * `kerbline.mjs` asks whether the symptom is visible in the frames. This asks the
 * complementary question those frames cannot answer: **does the level still contain the shape,
 * anywhere?** A shot-level null does not imply a level-level null — it can equally mean the
 * camera moved, which is exactly what happened here (`Shots.js` raised the `guard` camera 2 m
 * off the colossus plinth it was standing on).
 *
 * METHOD, and why it is not a raycast. The first version of this cast one ray per pixel and
 * was abandoned: with no BVH installed, `intersectObjects` tests every triangle of every mesh,
 * so 115 k rays against ~0.5 M triangles is ~5·10^10 triangle tests and does not finish. This
 * version is O(triangles) instead of O(rays × triangles) and runs in seconds.
 *
 * The discriminator is WORLD-SPACE WIDTH, not projected size, and that choice is the whole
 * point. A large up-facing surface seen at a grazing angle also projects to a few pixels — the
 * courtyard paving near the horizon does — but it is not a sliver and burying it would be
 * wrong. A genuine kerb top is a few centimetres wide in the world no matter where you stand.
 * So: up-facing (n.y >= UP) triangles whose minimum world-space extent is <= NARROW metres.
 *
 * Not handled: occlusion. A strip found here may be hidden behind something. That makes this a
 * census of CANDIDATES, and it is reported as such — the frame test is what settles visibility.
 *
 * ── READ THIS BEFORE QUOTING THE COUNT ──────────────────────────────────────────────────────
 * **The headline number is not a defect count, and it must not be reported as one.** The first
 * run returned 11 913 strips, and the great majority of them are the CHAMFER WORK THIS PROJECT
 * DELIBERATELY ADDED. A 2–4 cm chamfer along every masonry arris is the single highest-value
 * item in the geometry brief — it is what catches the cel ramp as a bright line and makes stone
 * read as carved rather than as a box — and a chamfer facet is, geometrically, precisely a
 * narrow up-facing strip. `paving:court` alone contributes 2 744 of them at a 5.6 cm median:
 * that is the paving doing its job, not 2 744 bugs.
 *
 * So this instrument **cannot by itself separate an intended chamfer from a kerb defect**, and
 * the threshold that would do it does not exist in this data — both are narrow, both are
 * up-facing, and the difference is whether the strip sits at a silhouette the eye reads as an
 * edge or at a contact the eye reads as a crease. That is a question about context, not about
 * width.
 *
 * What the census IS good for: (a) confirming the shape class is present or absent at a
 * specific location, (b) ranking by projected width per camera, which is the one place a
 * chamfer and a defect genuinely differ — a chamfer is meant to be a hairline, so anything
 * resolving to tens of pixels is worth looking at by name. Use it to generate suspects, and
 * settle them in a frame. Do not use it to score.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * usage: node progress/records/sliver.mjs
 */
import * as THREE from 'three';
import { buildLevel } from '../../tools/lvl.mjs';
import { SHOTS } from '../../src/core/Shots.js';

const UP = 0.85;        // n.y at or above this is up-facing
const NARROW = 0.12;    // m — a strip this narrow cannot read as a surface, only as a line
const YMAX = 3.0;       // only near ground/contact height, where the artefact lives

const { root } = await buildLevel({ withProps: true });
root.updateMatrixWorld(true);

const meshes = [];
root.traverse((o) => { if (o.isMesh && o.visible !== false) meshes.push(o); });
console.log(`level built: ${meshes.length} meshes`);

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();

/* Minimum altitude of a triangle = its narrowest width. That is the right measure of "how
 * wide is this strip": the longest edge is the run of the kerb, the altitude to it is the
 * width of the top face. */
function minAltitude(a, b, c) {
  const eab = a.distanceTo(b), ebc = b.distanceTo(c), eca = c.distanceTo(a);
  ab.subVectors(b, a); ac.subVectors(c, a);
  const area2 = ab.cross(ac).length();          // 2 * area
  const longest = Math.max(eab, ebc, eca);
  return longest > 1e-9 ? area2 / longest : 0;  // altitude to the longest edge
}

const found = [];
let upTris = 0, totalTris = 0;

for (const mesh of meshes) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  if (!pos) continue;
  const idx = g.index;
  const count = idx ? idx.count : pos.count;
  const inst = mesh.isInstancedMesh ? mesh.count : 1;
  const m = mesh.matrixWorld;
  const nm = new THREE.Matrix3().getNormalMatrix(m);

  for (let i = 0; i < count; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(m);
    b.fromBufferAttribute(pos, i1).applyMatrix4(m);
    c.fromBufferAttribute(pos, i2).applyMatrix4(m);
    totalTris += inst;
    ab.subVectors(b, a); ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    const len = n.length();
    if (len < 1e-12) continue;
    n.divideScalar(len).applyMatrix3(nm).normalize();
    if (n.y < UP) continue;
    upTris += inst;
    const y = (a.y + b.y + c.y) / 3;
    if (y > YMAX) continue;
    const wdt = minAltitude(a, b, c);
    if (wdt > NARROW) continue;
    found.push({ obj: mesh.name || '?', y, wdt, p: a.clone(), inst });
  }
}

console.log(`triangles ${totalTris}, up-facing ${upTris}, narrow up-facing strips below y=${YMAX}: ${found.length}\n`);

const byObj = new Map();
for (const f of found) {
  if (!byObj.has(f.obj)) byObj.set(f.obj, []);
  byObj.get(f.obj).push(f);
}
const rows = [...byObj.entries()].sort((a, b) => b[1].length - a[1].length);
if (!rows.length) {
  console.log('NONE — the level contains no narrow up-facing strip near contact height.');
} else {
  console.log(`${'mesh'.padEnd(34)} ${'n'.padStart(6)} ${'median w'.padStart(9)} ${'world y'.padStart(14)}   example`);
  for (const [obj, list] of rows.slice(0, 18)) {
    const ws = list.map((l) => l.wdt).sort((x, y) => x - y);
    const ys = list.map((l) => l.y);
    const p = list[0].p;
    console.log(`${obj.padEnd(34)} ${String(list.length).padStart(6)} ${ws[ws.length >> 1].toFixed(3).padStart(8)}m ` +
                `${(Math.min(...ys).toFixed(2) + '..' + Math.max(...ys).toFixed(2)).padStart(14)}   ` +
                `(${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`);
  }
}

/* How wide would the worst of them be on screen, from each canonical camera? A strip is only
 * a defect where a camera can resolve it as a line. */
if (found.length) {
  const W = 1280, H = 720;
  console.log('\nworst-case projected width of these strips, per canonical camera:');
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 3000);
  for (const [name, s] of Object.entries(SHOTS)) {
    if (!s?.pos || !s?.target) continue;
    cam.fov = s.fov ?? 50;
    cam.position.fromArray(s.pos);
    cam.lookAt(new THREE.Vector3().fromArray(s.target));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    let worst = 0, worstObj = null;
    for (const f of found) {
      const d = cam.position.distanceTo(f.p);
      if (d < 0.1) continue;
      const v = f.p.clone().project(cam);
      if (v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1 || v.z > 1) continue;   // off-screen
      /* px per metre at this depth, then the strip's own width. */
      const pxPerM = (H * 0.5) / (Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) * d);
      const px = f.wdt * pxPerM;
      if (px > worst) { worst = px; worstObj = f.obj; }
    }
    console.log(`  ${name.padEnd(13)} ${worst > 0 ? `${worst.toFixed(1)} px  (${worstObj})` : 'none in frame'}`);
  }
}

console.log(`\nup-facing = n.y >= ${UP};  narrow = min world-space altitude <= ${NARROW} m;  near-ground = y <= ${YMAX}`);
console.log('CANDIDATES only — occlusion is not modelled. The frame test (kerbline.mjs) settles visibility.');
console.log('NOTE: no TERRAIN in this build — sphinx-avenue props sit at y=0, under their dune.');
