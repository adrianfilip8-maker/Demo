/**
 * kaykit.test.mjs — the first instrument that has ever exercised `src/world/KayKit.js`.
 *
 * ── the premise ───────────────────────────────────────────────────────────────────────────────
 * KNOWN_ISSUES §393 ranked KayKit first for one reason: it was the only world module no Node
 * harness had ever booted, and it was the module that shipped the session's one confirmed false
 * comment. §393.3's rule is that a harness missing a module returns plausible numbers; the sharper
 * form found here is that **a module no harness can reach accumulates claims nobody can check.**
 *
 * §393.2 said booting it was impossible ("`KayKit.js:180` … needs `document`. **KayKit cannot be
 * booted headless at all.**"). That is retired: `tests/_kaykitboot.mjs` boots it with no source
 * change and no DOM, by priming the cache three's own loaders consult before they reach for
 * `document` or `fetch`. The seam, and what is and is not stubbed, is documented there.
 *
 * ── what this file measures ───────────────────────────────────────────────────────────────────
 * Three things, in rising order of what they cost to establish:
 *
 *   1. A registration and draw census, pinned. What KayKit puts into the collision layer and the
 *      scene graph, so a change to it surfaces here rather than in a frame nobody diffs.
 *   2. Overlap, measured EXACTLY. Every overlap question about this module has to be asked of
 *      oriented boxes: the colliders are yaw-rotated, and the world-AABB of a yaw-rotated box
 *      overstates its footprint by up to 0.48 m here. The AABB test reports two overlaps in this
 *      level and both are artifacts — `A-CALIB` below is that demonstration, kept as an arm.
 *   3. **The numeric claims in the module's own comments, re-derived.** §393.1's finding was that
 *      "a line number in a comment is an assertion with a shelf life, and nothing in this project
 *      checks it." These arms are that missing check for this file: a stale number here fails the
 *      build. That is the only durable answer to a defect whose cause was that nothing could
 *      measure the file.
 *
 * Every data-driven arm asserts a non-zero inspected count (§211.1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { trisIn, rayTri } from '../tools/lvl.mjs';
import { bootKayKit, readPlacements, KAYKIT_SRC } from './_kaykitboot.mjs';

const { kaykit: K, lib: LIB, REG: ALLREG, engine: ENGINE } = await bootKayKit({ withLevel: true });
const KK = ALLREG.filter((r) => r.owner === 'kaykit');
const OTHER = ALLREG.filter((r) => r.owner !== 'kaykit');
for (const r of ALLREG) r.mesh.updateMatrixWorld(true);

const { rows: PLACE, nBefore, nAfter } = readPlacements();

console.log(`\n[kaykit] booted headless, document=${typeof document}: `
  + `${K.stats.models} models, ${K.stats.placed} placed, ${K.stats.failed} failed, `
  + `${K.stats.colliders} colliders, ${K.stats.decals} decals, ${Math.round(K.stats.tris)} tris\n`);

/* ── exact convex overlap, by separating axis over each mesh's own world vertices and faces ────
   Both populations here are convex (BoxGeometry colliders, CylinderGeometry pole proxies), which
   is what makes SAT exact rather than conservative for them. Architecture's `proxy:wall` entries
   are general BufferGeometry and may be non-convex, so wall results are reported, never sealed. */
const worldVerts = (mesh) => {
  const p = mesh.geometry.attributes.position, out = [], v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) out.push(v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).clone());
  return out;
};
/** Distinct world-space face normals AND distinct world-space edge directions. */
const axesOf = (mesh) => {
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : p.count;
  const normals = [], edges = [];
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const wa = new THREE.Vector3(), wb = new THREE.Vector3(), wc = new THREE.Vector3();
  const add = (arr, v) => {
    if (v.lengthSq() < 1e-12) return;
    v.normalize();
    if (!arr.some((s) => Math.abs(s.dot(v)) > 0.9999)) arr.push(v.clone());
  };
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    wa.copy(a).applyMatrix4(mesh.matrixWorld);
    wb.copy(b).applyMatrix4(mesh.matrixWorld);
    wc.copy(c).applyMatrix4(mesh.matrixWorld);
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (nrm.lengthSq() > 1e-12) add(normals, nrm.applyMatrix3(nm));
    add(edges, new THREE.Vector3().subVectors(wb, wa));
    add(edges, new THREE.Vector3().subVectors(wc, wb));
    add(edges, new THREE.Vector3().subVectors(wa, wc));
  }
  return { normals, edges };
};

/**
 * Is this mesh a convex polyhedron? Every vertex on or behind every face plane.
 *
 * This is the precondition that makes `separation()` decide rather than merely bound, and round 12
 * held a finding for want of it: the wall proxies were assumed possibly-non-convex, so a reported
 * penetration could not be trusted. Measured, all 75 of them are convex to 2.2e-16 m.
 */
function convexity(mesh) {
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : p.count;
  const verts = [], v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) verts.push(v.fromBufferAttribute(p, i).clone());
  const planes = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (nrm.lengthSq() < 1e-14) continue;
    nrm.normalize();
    const d = nrm.dot(a);
    if (planes.some((q) => q.n.dot(nrm) > 0.9999 && Math.abs(q.d - d) < 1e-5)) continue;
    planes.push({ n: nrm, d });
  }
  let worst = 0;
  for (const pl of planes) for (const vv of verts) worst = Math.max(worst, vv.dot(pl.n) - pl.d);
  return { convex: worst <= 1e-5, worst, planes: planes.length };
}
const span = (vs, ax) => {
  let lo = Infinity, hi = -Infinity;
  for (const v of vs) { const d = v.dot(ax); if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
};
/**
 * Signed separation: > 0 is a gap in metres, <= 0 is a penetration depth.
 *
 * FULL SAT — face normals of both bodies plus every edge-edge cross product. Round 12 used face
 * normals alone, which is sound in one direction only: a missed axis can hide a gap but cannot
 * invent one, so `> 0` proved disjointness while `<= 0` proved nothing. That asymmetry is exactly
 * what forced a real finding to be held for a round. With the edge axes in, and with `convexity()`
 * asserted on both bodies, the test decides in both directions.
 *
 * It is not free — it changed an answer. The barrel at (−11.5, 2.5) scored −1.0087 m under face
 * normals and −1.0027 m under the full set, because an edge-cross axis gave a tighter bound.
 */
function separation(mA, mB) {
  const va = worldVerts(mA), vb = worldVerts(mB);
  const A = axesOf(mA), B = axesOf(mB);
  const axes = [...A.normals, ...B.normals];
  for (const e of A.edges) {
    for (const f of B.edges) {
      const c = new THREE.Vector3().crossVectors(e, f);
      if (c.lengthSq() > 1e-10) axes.push(c.normalize());
    }
  }
  let best = -Infinity;
  for (const ax of axes) {
    const [a0, a1] = span(va, ax), [b0, b1] = span(vb, ax);
    const sep = Math.max(a0 - b1, b0 - a1);
    if (sep > best) best = sep;
  }
  return best;
}
const aabbOf = (m) => new THREE.Box3().setFromObject(m);

/* ── camera helpers, at the capture aspect (`tools/shot.mjs` defaults to 1600x900) ───────────── */
const ASPECT = 16 / 9;
const camOf = (s) => {
  const cam = new THREE.PerspectiveCamera(s.fov, ASPECT, 0.1, 600);
  cam.position.fromArray(s.pos);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  return cam;
};
/** The eight world corners of a placement's own yaw-rotated bounding box. */
const cornersOf = (p) => {
  const e = LIB.get(p.file), s = new THREE.Vector3();
  e.bb.getSize(s);
  const c = Math.cos(p.ry), si = Math.sin(p.ry), out = [];
  for (const sx of [-0.5, 0.5]) for (const sy of [0, 1]) for (const sz of [-0.5, 0.5]) {
    const lx = sx * s.x, lz = sz * s.z;
    out.push(new THREE.Vector3(p.x + lx * c + lz * si, p.y + sy * s.y, p.z - lx * si + lz * c));
  }
  return out;
};
const inNdc = (n) => n.x >= -1 && n.x <= 1 && n.y >= -1 && n.y <= 1 && n.z >= -1 && n.z <= 1;
const seenBy = (cam, p) => cornersOf(p).some((v) => inNdc(v.clone().project(cam)));
/** Distance to the prop's mid-height, which is the convention the annotated table uses. */
const midOf = (p) => {
  const e = LIB.get(p.file);
  return new THREE.Vector3(p.x, p.y + (e.bb.max.y - e.bb.min.y) / 2, p.z);
};

/* ============================ 1. the seam, and the census ============================ */

test('S1: KayKit boots headless with no DOM, and every model it wanted actually loaded', () => {
  assert.equal(typeof document, 'undefined',
    'a `document` appeared in this process — then this suite is not demonstrating the DOM-free seam');
  assert.equal(K.stats.failed, 0, `${K.stats.failed} models failed to load — the numbers below would be a subset`);
  assert.ok(K.stats.models > 0, 'inspected 0 models');
  assert.equal(K.stats.models, 11, 'the props path wants 11 distinct models');
  assert.equal(LIB.size, 11, 'the captured library disagrees with stats.models');
  assert.equal(K.mode, 'props', 'no `location` here, so the shipped props branch must be what ran');
});

test('S2: the table is 36 placements — thirty for the player, six for the cameras', () => {
  /* Read from the source table and cross-checked against what `_buildProps` actually placed, so
     a row that parses but does not place (or vice versa) cannot pass. The banner used to say
     "eight"; six shipped and two were dropped, and the count had never come back down. */
  assert.equal(PLACE.length, 36, 'parsed placement rows');
  assert.equal(K.stats.placed, 36, 'placements the shipped code actually built');
  assert.equal(nBefore, 30, 'rows above the FOR THE CAMERAS banner');
  assert.equal(nAfter, 6, 'rows below the FOR THE CAMERAS banner');
  assert.match(KAYKIT_SRC, /---- and six placed FOR THE CAMERAS/,
    'the banner names a count that is not the six rows beneath it');
});

test('S3: the registration census — 29 colliders, every one `misc` / `wood`', () => {
  const tags = {}, mats = {};
  for (const r of KK) {
    tags[r.opts?.tag] = (tags[r.opts?.tag] || 0) + 1;
    mats[r.opts?.material] = (mats[r.opts?.material] || 0) + 1;
  }
  console.log(`  S3: ${KK.length} kaykit colliders  tags ${JSON.stringify(tags)}  materials ${JSON.stringify(mats)}`);
  assert.ok(KK.length > 0, 'inspected 0 registrations');
  assert.equal(KK.length, 29, 'collider registrations from KayKit');
  assert.equal(K.stats.colliders, 29, 'stats.colliders disagrees with what the engine received');
  assert.deepEqual(tags, { misc: 29 },
    '`misc` is the whole point of the tag (KayKit.js\'s own note): an unknown tag is treated as GROUND');
  assert.deepEqual(mats, { wood: 29 }, 'material drift on the solid set');

  /* The tag is a gameplay decision and the SOLID set is where it is made — 29 of 36, because
     coins and rubble are deliberately not solid. Derived from the table, not hand-counted. */
  const solid = /const SOLID = new Set\(\[([\s\S]*?)\]\);/.exec(KAYKIT_SRC);
  assert.ok(solid, 'could not read the SOLID set');
  const names = new Set([...solid[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
  const expect = PLACE.filter((p) => names.has(p.file)).length;
  assert.equal(KK.length, expect, `SOLID covers ${expect} of the 36 placements but ${KK.length} registered`);
});

test('S4: the group is two visible draws plus 29 invisible boxes — and no ink shell', () => {
  const vis = K.group.children.filter((c) => c.visible).map((c) => c.name);
  const hidden = K.group.children.filter((c) => !c.visible);
  console.log(`  S4: visible [${vis.join(', ')}]  hidden ${hidden.length}  hulls ${K.stats.hulls || 0}`);
  assert.ok(K.group.children.length > 0, 'inspected an empty group');
  assert.deepEqual(vis, ['kaykit:props', 'world.decals.kaykit'],
    'the header claims ONE DRAW CALL; this is the list that has to stay short');
  assert.equal(hidden.length, 29, 'invisible collider boxes parented to the group');
  assert.equal(K.stats.hulls || 0, 0,
    '`_maybeHull` is off by default and the header no longer claims an ink shell — a hull here '
    + 'means the default flipped and the header is wrong again');
  assert.equal(K.stats.decals, 36, 'every placement gets a contact decal, not just the solid ones');
});

/* ============================ 2. overlap, measured exactly ============================ */

test('A1: no KayKit collider overlaps another KayKit collider', () => {
  /* The claim is about the 29 oriented boxes, so it is measured on oriented boxes. The bar is a
     gap > 0 — there is no tuned threshold to calibrate here, because "these two solids interpenetrate"
     is exact. What needs calibrating is the METHOD, and A-CALIB below does that. */
  const bad = [];
  let tightest = Infinity, pairs = 0;
  for (let i = 0; i < KK.length; i++) {
    for (let j = i + 1; j < KK.length; j++) {
      pairs++;
      const sep = separation(KK[i].mesh, KK[j].mesh);
      if (sep < tightest) tightest = sep;
      if (sep <= 0) {
        bad.push(`${KK[i].mesh.position.toArray().map((v) => v.toFixed(1))} <-> `
          + `${KK[j].mesh.position.toArray().map((v) => v.toFixed(1))} by ${(-sep).toFixed(3)} m`);
      }
    }
  }
  console.log(`  A1: ${pairs} pairs, closest approach ${tightest.toFixed(3)} m`);
  assert.ok(pairs > 0, 'inspected 0 pairs');
  assert.deepEqual(bad, [], `KayKit props interpenetrate:\n  ${bad.join('\n  ')}`);
  assert.ok(tightest > 0.3,
    `closest approach ${tightest.toFixed(3)} m — measured 0.353 m today, between the two west `
    + 'colonnade barrels at (-19.2, -3.4) and (-21.0, -2.0)');
});

test('A1 CALIBRATION: a collider planted on top of an existing one IS caught', () => {
  /* MUST FIRE. A1 asserts an absence, and an absence-arm that cannot detect the presence is worth
     nothing (this project has voided a run over exactly that). The lever is the thing A1 exists to
     catch: a second collider built at an existing one's own position and dimensions, which is what
     "two props were placed on the same spot" looks like once `_collider` has run on both. It must
     be rejected by the same `separation()` A1 calls, not by a re-implementation. */
  const victim = KK[0].mesh;
  const g = victim.geometry.parameters;
  const plant = new THREE.Mesh(new THREE.BoxGeometry(g.width, g.height, g.depth));
  plant.position.copy(victim.position);
  plant.position.x += 0.25;                    // offset well inside the box, so it is a real clash
  plant.rotation.y = victim.rotation.y;
  plant.updateMatrixWorld(true);

  const sep = separation(victim, plant);
  console.log(`  A1 calib: a duplicate collider offset 0.25 m scores separation ${sep.toFixed(3)} m `
    + `(A1's bar rejects anything <= 0; the real level's tightest pair is +0.353 m)`);
  assert.ok(sep <= 0,
    `a collider planted 0.25 m inside another scored ${sep.toFixed(3)} m, which A1 would ACCEPT — `
    + 'A1 cannot detect the thing it exists to detect');
  assert.ok(sep < 0.3, 'the plant must also fall the wrong side of A1\'s 0.3 m margin');
});

test('A2: no KayKit collider intrudes on a climbable `pole`', () => {
  /* This is the overlap that would matter. `misc` blocks, and `PoleClimb.canEnter` goes through
     `afford('pole')` — the one affordance KayKit.js's own tag note establishes IS tag-filtered —
     so a solid crate sitting inside a column's climb volume would take a route away silently.
     The AABB screen says one crate does exactly that. It does not; see A-CALIB. */
  const poles = OTHER.filter((r) => r.opts?.tag === 'pole');
  assert.ok(poles.length > 0, 'inspected 0 pole proxies — Architecture did not boot');
  const bad = [];
  let tightest = Infinity, checked = 0;
  const kAabb = KK.map((r) => aabbOf(r.mesh));
  for (let i = 0; i < KK.length; i++) {
    for (const p of poles) {
      if (!kAabb[i].intersectsBox(aabbOf(p.mesh))) continue;   // exact test only where it can bite
      checked++;
      const sep = separation(KK[i].mesh, p.mesh);
      if (sep < tightest) tightest = sep;
      if (sep <= 0) bad.push(`${KK[i].mesh.position.toArray().map((v) => v.toFixed(1))} into "${p.mesh.name}" by ${(-sep).toFixed(3)} m`);
    }
  }
  console.log(`  A2: ${poles.length} pole proxies, ${checked} near-misses examined exactly, `
    + `closest ${Number.isFinite(tightest) ? `${tightest.toFixed(3)} m` : 'none in range'}`);
  assert.ok(checked > 0, 'inspected 0 candidate pairs — the AABB pre-filter matched nothing, so this arm proved nothing');
  assert.deepEqual(bad, [], `a KayKit collider is inside a climbable pole:\n  ${bad.join('\n  ')}`);
});

test('A2 CALIBRATION: a collider planted inside a pole IS caught', () => {
  /* MUST FIRE, and it is a separate lever from A1's because the geometry pair is different: A1
     tests box against box, A2 tests box against the `CylinderGeometry` the pole proxies are built
     from, and a tessellated cylinder is where a face-normal-only axis set is least like a textbook
     SAT. The plant is a crate-sized box at a real pole's own centre — which is what "a store prop
     was placed in the aisle column" would look like — and A2's own `separation()` must reject it. */
  const pole = OTHER.find((r) => r.opts?.tag === 'pole');
  assert.ok(pole, 'inspected 0 pole proxies');
  const g = KK[0].mesh.geometry.parameters;
  const plant = new THREE.Mesh(new THREE.BoxGeometry(g.width, g.height, g.depth));
  plant.position.copy(new THREE.Box3().setFromObject(pole.mesh).getCenter(new THREE.Vector3()));
  plant.updateMatrixWorld(true);

  const sep = separation(plant, pole.mesh);
  /* the true margin, over every crate against every pole — round 12 printed the minimum against
     ONE pole here and called it "the nearest shipped crate", which read as a global figure and
     was not one. The real tightest pair is an order of magnitude closer. */
  const poles = OTHER.filter((r) => r.opts?.tag === 'pole');
  let real = Infinity;
  for (const r of KK) for (const p of poles) real = Math.min(real, separation(r.mesh, p.mesh));
  console.log(`  A2 calib: a crate planted at "${pole.mesh.name}"'s centre scores ${sep.toFixed(3)} m; `
    + `the tightest shipped crate-to-pole pair in the level is ${real.toFixed(3)} m clear`);
  assert.ok(sep <= 0, `a crate planted inside a pole scored ${sep.toFixed(3)} m, which A2 would ACCEPT`);
  assert.ok(real > 0, 'the shipped level should already be on the clear side of this lever');
});

test('A-CALIB: the AABB screen A1/A2 refuse to trust is the one that reports overlaps here', () => {
  /* Kept as an arm rather than a comment because it is the reason A1 and A2 are written the way
     they are, and because it will fail loudly if a future three ever changes `setFromObject`.
     A yaw-rotated 2.09 x 2.25 m box has a world-AABB up to 0.48 m wider per side than the box, and
     that inflation is the entire content of both hits below. Reported today:
       kaykit vs kaykit   AABB 1 pair, exact 0    (barrel_large_decorated / barrel_small, west colonnade)
       kaykit vs pole     AABB 1 pair, exact 0    (crates_stacked at (-19.2,-24.8) vs the aisle column) */
  let aabbSelf = 0, exactSelf = 0;
  for (let i = 0; i < KK.length; i++) {
    for (let j = i + 1; j < KK.length; j++) {
      if (!aabbOf(KK[i].mesh).intersectsBox(aabbOf(KK[j].mesh))) continue;
      aabbSelf++;
      if (separation(KK[i].mesh, KK[j].mesh) <= 0) exactSelf++;
    }
  }
  let aabbPole = 0, exactPole = 0;
  for (const r of KK) {
    for (const p of OTHER.filter((o) => o.opts?.tag === 'pole')) {
      if (!aabbOf(r.mesh).intersectsBox(aabbOf(p.mesh))) continue;
      aabbPole++;
      if (separation(r.mesh, p.mesh) <= 0) exactPole++;
    }
  }
  console.log(`  A-CALIB: self AABB ${aabbSelf} / exact ${exactSelf};  pole AABB ${aabbPole} / exact ${exactPole}`);
  assert.ok(aabbSelf + aabbPole > 0,
    'the AABB screen now reports nothing, so this arm no longer demonstrates that AABB and exact '
    + 'disagree — A1/A2 keep their value but this calibration has gone dead and must be re-derived');
  assert.equal(exactSelf + exactPole, 0, 'A1/A2 disagree with themselves');
});

test('A3: the four crates buried in colonnade walls — held in round 12, decided here', () => {
  /* ROUND 12 HELD THIS AND SAID WHY: `proxy:wall` is general `BufferGeometry` and might be
     non-convex, so a face-normal SAT could only bound the answer, not give it. Both halves of
     that are now settled — the axis set is complete (see `separation`) and convexity is measured
     rather than assumed, below — so the penetrations are real numbers and are pinned.

     It is a PIN, not a bar. Two solids overlapping do not make a hole: the player cannot enter
     either, and nothing here claims a crate half-inside a colonnade wall is wrong. What the pin
     buys is that the depth cannot grow, or a fifth appear, without somebody saying so. Whether
     the visible art clips needs a frame, and this lane has not rendered one. */
  const walls = OTHER.filter((r) => r.opts?.tag === 'wall');
  assert.ok(walls.length > 0, 'inspected 0 wall proxies — Architecture did not boot');

  /* the precondition, asserted rather than assumed */
  let nonConvex = 0, worstDev = 0;
  for (const w of walls) {
    const cv = convexity(w.mesh);
    if (!cv.convex) nonConvex++;
    worstDev = Math.max(worstDev, cv.worst);
  }
  console.log(`  A3: ${walls.length} wall proxies, ${nonConvex} non-convex, worst vertex-outside-plane ${worstDev.toExponential(2)} m`);
  assert.equal(nonConvex, 0,
    `${nonConvex} wall proxies are non-convex, so \`separation()\` no longer decides against them `
    + 'and the depths below revert to bounds — this arm must go back to being a held finding');

  const kAabb = KK.map((r) => aabbOf(r.mesh));
  const hits = [];
  for (let i = 0; i < KK.length; i++) {
    for (const w of walls) {
      if (!kAabb[i].intersectsBox(aabbOf(w.mesh))) continue;
      const sep = separation(KK[i].mesh, w.mesh);
      if (sep <= 0) hits.push({ at: KK[i].mesh.position.clone(), depth: -sep, type: w.mesh.geometry.type });
    }
  }
  hits.sort((a, b) => b.depth - a.depth);
  console.log(`  A3: ${hits.length} crate-into-wall penetrations — `
    + hits.map((h) => `${h.depth.toFixed(3)} m @(${h.at.x.toFixed(1)}, ${h.at.z.toFixed(1)})`).join(' · '));
  assert.equal(hits.length, 4, 'the number of KayKit colliders inside a wall proxy has changed');
  assert.ok(Math.abs(hits[0].depth - 1.003) < 0.005, `deepest is ${hits[0].depth.toFixed(3)} m, recorded 1.003 m`);
  assert.ok(Math.abs(hits[3].depth - 0.097) < 0.005, `shallowest is ${hits[3].depth.toFixed(3)} m, recorded 0.097 m`);
  assert.ok(hits[0].depth < 1.1, 'a crate has gone deeper into a wall than anything measured so far');
});

/* ── section 2b support: naming the four, and asking whether they are on screen ─────────────────
   §397.5 settled that the four penetrations are REAL. It did not say which placements they are,
   whether anyone can see them, or whether they change the game. These three arms are that, and
   the ordering matters: identity is cheap and exact, visibility needs the drawn masonry rather
   than the proxy, and the foothold question is about the proxy again. */

/** The SOLID rows, in table order — which is the order `_buildProps` registers colliders in. */
const SOLID_ROWS = (() => {
  const m = /const SOLID = new Set\(\[([\s\S]*?)\]\);/.exec(KAYKIT_SRC);
  assert.ok(m, 'could not read the SOLID set');
  const names = new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((q) => q[1]));
  return PLACE.map((p, i) => ({ ...p, row: i })).filter((p) => names.has(p.file));
})();

/** World triangles of one placement, composed the way `_buildProps` composes it. */
function propTris(p) {
  const e = LIB.get(p.file);
  const mtx = new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y - e.bb.min.y, p.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const g = e.geo, pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count, out = [], v = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const t = [];
    for (let k = 0; k < 3; k++) {
      const vi = idx ? idx.getX(i + k) : i + k;
      v.fromBufferAttribute(pos, vi).applyMatrix4(mtx);
      t.push(v.x, v.y, v.z);
    }
    out.push(t);
  }
  return out;
}
const segTri = (p0, p1, T) => {
  const d = new THREE.Vector3().subVectors(p1, p0), len = d.length();
  if (len < 1e-9) return null;
  d.multiplyScalar(1 / len);
  const t = rayTri(p0.x, p0.y, p0.z, d.x, d.y, d.z, T);
  return t > 1e-6 && t < len ? new THREE.Vector3(p0.x + d.x * t, p0.y + d.y * t, p0.z + d.z * t) : null;
};
/**
 * DRAWN masonry only.
 *
 * The engine's scene holds Architecture, Props AND KayKit, and the first version of the arm below
 * walked all of it. It reported the shallowest of the four "intersecting" — against `props_gold`
 * and `props_lapis`, the tomb treasure, and against `kaykit:props`, which is the prop itself.
 * Both are true and neither is the question. `arch:` is Architecture's own naming for a drawn
 * masonry bucket; `paving:` is the floor, which every standing prop intersects by design.
 */
const isMasonry = (name) => /^arch:/.test(name);

/** The eight world corners of a registered collider box, as a convex point set. */
const colliderCorners = (mesh) => {
  const g = mesh.geometry.parameters;
  const out = [];
  for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
    out.push(new THREE.Vector3(sx * g.width, sy * g.height, sz * g.depth).applyMatrix4(mesh.matrixWorld));
  }
  return out;
};
/** Face planes of a convex mesh, in world space. `<= 0` is inside. */
function hullPlanes(mesh) {
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : p.count, planes = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, i0).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(p, i1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(p, i2).applyMatrix4(mesh.matrixWorld);
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (nrm.lengthSq() < 1e-14) continue;
    nrm.normalize();
    const d = nrm.dot(a);
    if (planes.some((q) => q.n.dot(nrm) > 0.9999 && Math.abs(q.d - d) < 1e-5)) continue;
    planes.push({ n: nrm, d });
  }
  return planes;
}
const sdf = (planes, p) => Math.max(...planes.map((pl) => p.dot(pl.n) - pl.d));

/** The four, recomputed here so every arm below shares one derivation. */
const PEN = (() => {
  const walls = OTHER.filter((r) => r.opts?.tag === 'wall');
  const kAabb = KK.map((r) => aabbOf(r.mesh));
  const hits = [];
  for (let i = 0; i < KK.length; i++) {
    for (let wi = 0; wi < walls.length; wi++) {
      if (!kAabb[i].intersectsBox(aabbOf(walls[wi].mesh))) continue;
      const sep = separation(KK[i].mesh, walls[wi].mesh);
      if (sep <= 0) hits.push({ i, wi, depth: -sep, k: KK[i], w: walls[wi], row: SOLID_ROWS[i] });
    }
  }
  return hits.sort((a, b) => b.depth - a.depth);
})();

test('A3b: the four are NAMED — which placement, and which wall it is inside', () => {
  /* §397.5 published four depths and no identities, which is a finding nobody can act on: "1.003 m"
     does not tell a level author which row to move. The collider-to-row map is the one thing here
     that could silently be wrong, so it is asserted by POSITION rather than assumed from ordering. */
  assert.equal(SOLID_ROWS.length, KK.length, 'the SOLID row list and the collider list are different lengths');
  for (let i = 0; i < KK.length; i++) {
    const m = KK[i].mesh, r = SOLID_ROWS[i];
    assert.ok(Math.hypot(m.position.x - r.x, m.position.z - r.z) < 0.01,
      `collider ${i} is at (${m.position.x.toFixed(2)}, ${m.position.z.toFixed(2)}) but SOLID row ${i} `
      + `is ${r.file} at (${r.x}, ${r.z}) — the row-to-collider map is wrong and every name below with it`);
  }

  assert.equal(PEN.length, 4, 'the number of KayKit colliders inside a wall proxy has changed');
  const named = PEN.map((h) => {
    const wb = aabbOf(h.w.mesh);
    return {
      file: h.row.file, row: h.row.row, x: h.row.x, z: h.row.z, depth: +h.depth.toFixed(3),
      wall: `x ${wb.min.x.toFixed(1)}..${wb.max.x.toFixed(1)} z ${wb.min.z.toFixed(1)}..${wb.max.z.toFixed(1)}`,
    };
  });
  console.log('  A3b:\n' + named.map((n) => `     ${n.depth} m  ${n.file} row ${n.row} @(${n.x}, ${n.z})  into wall ${n.wall}`).join('\n'));

  /* the pin. Two gateway pylons in the courtyard, two crypt piers in the tomb. */
  assert.deepEqual(named.map((n) => `${n.file}@${n.x},${n.z}`), [
    'barrel_large@-11.5,2.5',            // W-inner processional gateway pylon, EgyptLevel `foreground`
    'chest@-6.8,-74.2',                  // W crypt pier at (-5.5, -74)
    'barrel_small_stack@-20.3,2.6',      // W-outer processional gateway pylon
    'chest@4.6,-70',                     // E crypt pier at (5.5, -68)
  ], 'the identity of at least one of the four penetrating placements has changed');
  assert.deepEqual(named.map((n) => n.row), [35, 26, 3, 21],
    'a penetrating placement has moved to a different row of the PLACEMENTS table');

  /* THE CAUSE, and it is readable in the module's own comment. The camera block states its grid
     search as "on real paving, clear of every column and plinth footprint by 1.4 m, and inside its
     target shot's frame at 6-26 m". `barrel_large` at (-11.5, 2.5) clears the nearest `pole` proxy
     — the columns — by 14.3 m, so the stated test PASSED. The gateway pylons are `wall` proxies
     and were never in the constraint set. The search is sound; the constraint list is short. */
  const poles = OTHER.filter((r) => r.opts?.tag === 'pole');
  assert.ok(poles.length > 0, 'inspected 0 pole proxies');
  const deep = PEN[0].row;
  let nearestPole = Infinity;
  for (const p of poles) {
    const c = aabbOf(p.mesh).getCenter(new THREE.Vector3());
    nearestPole = Math.min(nearestPole, Math.hypot(deep.x - c.x, deep.z - c.z));
  }
  assert.match(KAYKIT_SRC, /clear of every column and plinth footprint by 1\.4 m/,
    'the camera block no longer states the grid search that this arm attributes the defect to');
  assert.ok(nearestPole > 1.4,
    `the deepest penetrating placement is ${nearestPole.toFixed(2)} m from the nearest column, so it `
    + 'no longer passes the stated grid search and the cause recorded here is wrong');
  console.log(`  A3b: the deepest one clears the nearest \`pole\` (column) by ${nearestPole.toFixed(2)} m — `
    + 'the stated 1.4 m constraint PASSED; the pylons it is inside are `wall` proxies, never in that list');
});

test('A3c: only ONE of the four is visible, and it is visible in `night`', () => {
  /* The question §395.5 held the finding for ("whether the visible art clips needs a frame") asked
     of geometry rather than of a capture. A prop standing BEHIND a pylon corner is occluded along
     the pylon's own silhouette edge and has no seam; a prop INSIDE it has an intersection curve.
     So the curve is computed — every prop edge crossing a drawn masonry triangle and every masonry
     edge crossing a prop triangle — and each point is ray-tested against the drawn level.

     Sub-sampled at stride 6 for runtime. That biases the COUNT and cannot invent or destroy a
     verdict: a seam either has unoccluded points or it does not, and stride only thins them. */
  const STRIDE = 6;
  const scene = ENGINE.scene;
  scene.updateMatrixWorld(true);
  const rows = [];
  for (const h of PEN) {
    const p = h.row;
    const tris = propTris(p);
    const bb = new THREE.Box3();
    for (const t of tris) for (let k = 0; k < 9; k += 3) bb.expandByPoint(new THREE.Vector3(t[k], t[k + 1], t[k + 2]));
    const near = trisIn(scene, bb.clone().expandByScalar(0.6)).filter((T) => isMasonry(T.name));
    const seam = [];
    for (let ti = 0; ti < tris.length; ti += STRIDE) {
      const t = tris[ti];
      const a = new THREE.Vector3(t[0], t[1], t[2]), b = new THREE.Vector3(t[3], t[4], t[5]), c = new THREE.Vector3(t[6], t[7], t[8]);
      for (const [q0, q1] of [[a, b], [b, c], [c, a]]) {
        for (const T of near) { const q = segTri(q0, q1, T.t); if (q) { seam.push(q); break; } }
      }
    }
    let bestShot = '', bestVis = 0;
    if (seam.length) {
      for (const [name, s] of Object.entries(SHOTS)) {
        const cam = camOf(s);
        const inF = seam.filter((q) => inNdc(q.clone().project(cam)));
        if (!inF.length) continue;
        const box = new THREE.Box3().setFromPoints([cam.position.clone(), bb.min.clone(), bb.max.clone()]).expandByScalar(1.0);
        const arch = trisIn(scene, box);
        let v = 0;
        for (const q of inF) {
          const d = new THREE.Vector3().subVectors(q, cam.position), len = d.length();
          d.multiplyScalar(1 / len);
          let blocked = false;
          for (const T of arch) {
            const t = rayTri(cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, T.t);
            /* 0.03 m back-off: a seam point LIES ON a masonry triangle, so its own host must not
               be counted as its occluder. */
            if (t > 0.05 && t < len - 0.03) { blocked = true; break; }
          }
          if (!blocked) v++;
        }
        if (v > bestVis) { bestVis = v; bestShot = name; }
      }
    }
    rows.push({ file: p.file, x: p.x, z: p.z, depth: h.depth, seam: seam.length, vis: bestVis, shot: bestShot });
  }
  console.log('  A3c:\n' + rows.map((r) => `     ${r.depth.toFixed(3)} m  ${r.file}@(${r.x}, ${r.z})  `
    + `${String(r.seam).padStart(4)} sampled masonry-seam pts, ${String(r.vis).padStart(4)} unoccluded`
    + (r.vis ? ` in "${r.shot}"` : ' from any of the 18 cameras')).join('\n'));

  assert.equal(rows.length, 4, 'inspected the wrong number of penetrations');
  const visible = rows.filter((r) => r.vis > 0);
  assert.equal(visible.length, 1,
    `${visible.length} of the four now show an unoccluded masonry seam (${visible.map((v) => `${v.file}@${v.x},${v.z} in ${v.shot}`).join(', ')}); `
    + 'one did when this was measured, and which ones are visible is the whole content of the finding');
  assert.equal(`${visible[0].file}@${visible[0].x},${visible[0].z}`, 'barrel_large@-11.5,2.5',
    'a different placement is now the visible one');
  assert.equal(visible[0].shot, 'night', 'the visible one is no longer visible in `night`');

  /* the shallowest is a PROXY-ONLY overlap: its collider is 0.097 m inside the crypt pier's
     `wallProxy` box while the DRAWN pier — a `masonryShell` under `cornerRolls` of radius 0.2 m,
     with its own batter and jitter, none of which the axis-aligned proxy carries — is not touched
     at all. That is a different defect from the other three and must not be reported with them. */
  const shallow = rows.find((r) => r.file === 'chest' && r.x === 4.6);
  assert.ok(shallow, 'the shallowest penetration is no longer the chest at (4.6, -70)');
  assert.equal(shallow.seam, 0,
    `the chest at (4.6, -70) now intersects ${shallow.seam} drawn masonry triangles — it used to be `
    + 'a proxy-only overlap, which is the reason it is graded differently from the other three');
  const deepSeams = rows.filter((r) => r.file !== 'chest' || r.x !== 4.6).map((r) => r.seam);
  assert.ok(deepSeams.every((n) => n > 0), 'the other three no longer intersect drawn masonry at all');
});

test('A3c CALIBRATION: the visibility test can say YES for a prop nobody can see', () => {
  /* MUST FIRE. A3c's headline is that three of the four are invisible, and an absence-arm that
     cannot detect a presence is worth nothing. The lever: take the placement A3c reports as
     invisible from all eighteen cameras — `barrel_small_stack` inside the west OUTER pylon — and
     point a camera at it from three metres away in the open. Its seam must come back visible
     through the SAME code path, or "invisible from every canonical camera" means only that the
     canonical cameras are elsewhere and the test never worked. */
  const scene = ENGINE.scene;
  const p = PEN.find((h) => h.row.file === 'barrel_small_stack')?.row;
  assert.ok(p, 'the barrel_small_stack penetration is gone; this calibration must be re-anchored');
  const tris = propTris(p);
  const bb = new THREE.Box3();
  for (const t of tris) for (let k = 0; k < 9; k += 3) bb.expandByPoint(new THREE.Vector3(t[k], t[k + 1], t[k + 2]));
  const near = trisIn(scene, bb.clone().expandByScalar(0.6)).filter((T) => isMasonry(T.name));
  const seam = [];
  for (let ti = 0; ti < tris.length; ti += 6) {
    const t = tris[ti];
    const a = new THREE.Vector3(t[0], t[1], t[2]), b = new THREE.Vector3(t[3], t[4], t[5]), c = new THREE.Vector3(t[6], t[7], t[8]);
    for (const [q0, q1] of [[a, b], [b, c], [c, a]]) {
      for (const T of near) { const q = segTri(q0, q1, T.t); if (q) { seam.push(q); break; } }
    }
  }
  assert.ok(seam.length > 0, 'inspected 0 seam points');
  /* stand in the open north-east of it, at eye height, looking at the seam's own centroid */
  const ctr = seam.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / seam.length);
  const eye = new THREE.Vector3(ctr.x + 2.6, 1.7, ctr.z + 2.2);
  const cam = camOf({ fov: 55, pos: eye.toArray(), target: ctr.toArray() });
  const box = new THREE.Box3().setFromPoints([eye.clone(), bb.min.clone(), bb.max.clone()]).expandByScalar(1.0);
  const arch = trisIn(scene, box);
  let vis = 0, inF = 0;
  for (const q of seam) {
    if (!inNdc(q.clone().project(cam))) continue;
    inF++;
    const d = new THREE.Vector3().subVectors(q, eye), len = d.length();
    d.multiplyScalar(1 / len);
    let blocked = false;
    for (const T of arch) {
      const t = rayTri(eye.x, eye.y, eye.z, d.x, d.y, d.z, T.t);
      if (t > 0.05 && t < len - 0.03) { blocked = true; break; }
    }
    if (!blocked) vis++;
  }
  console.log(`  A3c calib: from a lens 3.4 m away in the open, ${vis} of ${inF} in-frame seam points are `
    + 'unoccluded — the same path that reports 0 from all eighteen canonical cameras');
  assert.ok(inF > 0, 'the calibration camera does not even have the seam in frame');
  assert.ok(vis > 0,
    'a camera standing three metres from the seam in the open reports it fully occluded, so A3c\'s '
    + '"invisible from every canonical camera" is a property of the test rather than of the level');
});

test('A3d: the foothold each buried crate adds, and the part of it that is inside the wall', () => {
  /* The gameplay half. §393.1 established that `probeWall`/`probeLedge` gate on the surface normal
     and not on the tag, so a crate face is wall-runnable and its lip is grabbable exactly like
     masonry — which means a crate at a wall base is a foothold whether or not it is buried.
     What burial adds is a strip of that foothold standing INSIDE the wall, which the collision
     hash offers and no capsule can occupy.

     Measured on the collider's own top face against the wall proxy's convex hull (all 75 are
     convex — A3 asserts it), inflated by the player's radius, because a capsule whose axis is
     0.30 m from the masonry is inside it. Driving a real `Controller` against a real `Collision`
     reproduces this and is reported rather than run here: it needs Terrain and two full worlds. */
  const R = 0.34;
  const walls = OTHER.filter((r) => r.opts?.tag === 'wall');
  const hulls = walls.map((w) => ({ planes: hullPlanes(w.mesh), box: aabbOf(w.mesh) }));
  const rows = [];
  for (const h of PEN) {
    const corners = colliderCorners(h.k.mesh);
    const topY = Math.max(...corners.map((c) => c.y));
    const cb = new THREE.Box3().setFromPoints(corners);
    const g = h.k.mesh.geometry.parameters;
    /* sample the top face on a 4 cm grid, keeping only samples inside the yaw-rotated box */
    const inv = new THREE.Matrix4().copy(h.k.mesh.matrixWorld).invert();
    let total = 0, inside = 0, worst = 0;
    const STEP = 0.04;
    for (let x = cb.min.x; x <= cb.max.x; x += STEP) {
      for (let z = cb.min.z; z <= cb.max.z; z += STEP) {
        const w = new THREE.Vector3(x, topY - 0.01, z);
        const l = w.clone().applyMatrix4(inv);
        if (Math.abs(l.x) > g.width / 2 || Math.abs(l.z) > g.depth / 2) continue;
        total++;
        let deepest = 0;
        for (const H of hulls) {
          if (w.x < H.box.min.x - R || w.x > H.box.max.x + R || w.z < H.box.min.z - R || w.z > H.box.max.z + R) continue;
          if (topY + 1.8 < H.box.min.y || topY > H.box.max.y) continue;
          for (let t = R; t <= 1.8 - R + 1e-9; t += 0.15) {
            deepest = Math.max(deepest, R - sdf(H.planes, new THREE.Vector3(w.x, topY + t, w.z)));
          }
        }
        if (deepest > 0) { inside++; worst = Math.max(worst, deepest); }
      }
    }
    const cell = STEP * STEP;
    rows.push({ file: h.row.file, x: h.row.x, z: h.row.z, depth: h.depth,
      top: total * cell, dead: inside * cell, worst });
  }
  console.log('  A3d:\n' + rows.map((r) => `     ${r.file}@(${r.x}, ${r.z})  top face ${r.top.toFixed(2)} m², `
    + `${r.dead.toFixed(2)} m² of it stands a capsule up to ${r.worst.toFixed(2)} m inside the wall`).join('\n'));

  assert.equal(rows.length, 4, 'inspected the wrong number of penetrations');
  for (const r of rows) assert.ok(r.top > 0.4, `${r.file}@(${r.x}, ${r.z}) has a ${r.top.toFixed(2)} m² top face — inspected almost nothing`);
  /* every one of them DOES add a real foothold, which is the half that is not a defect */
  for (const r of rows) {
    assert.ok(r.top - r.dead > 0.2,
      `${r.file}@(${r.x}, ${r.z}) offers only ${(r.top - r.dead).toFixed(2)} m² of occupiable top — it has `
      + 'become a foothold nobody can use, which is a bigger claim than the one recorded here');
  }
  /* and every one of them wastes some of it inside the masonry, which is the half that is */
  const dead = rows.reduce((s, r) => s + r.dead, 0);
  assert.ok(rows.every((r) => r.dead > 0),
    'a penetrating crate no longer puts any of its top face inside the wall, which would mean the '
    + 'burial has stopped costing anything and this arm should be retired with it');
  assert.ok(Math.abs(dead - 4.25) < 0.35,
    `${dead.toFixed(2)} m² of crate top now stands inside masonry across the four; measured 4.25 m² — `
    + '1.48 + 1.48 + 1.01 + 0.29, deepest first');
  /* NOT a snag and NOT a trap: the deepest a capsule stands inside a wall is under half its own
     height, so there is no wedge a player can enter and no floor they can fall through. */
  assert.ok(Math.max(...rows.map((r) => r.worst)) < 1.3,
    'a crate top now stands a capsule more than 1.3 m inside a wall, which is deep enough to be a '
    + 'containment question rather than a wasted surface');
});

/* ============================ 3. the comments, re-derived ============================ */

/**
 * Pull a number OUT of the module's own comment text.
 *
 * This is the load-bearing detail of section 3 and the first version of it was wrong: the arms
 * below originally asserted measurements against numbers typed into this file, which pins the
 * measurement and lets the COMMENT rot freely — the exact defect §393.1 recorded. A planted edit
 * proved it (changing "0.635 m at the floor" in the source left the suite green). Every claim is
 * now read from `KAYKIT_SRC`, so the arm fails if the comment and the world disagree in either
 * direction, and a missing match throws rather than silently skipping.
 */
function claim(re, label) {
  const m = re.exec(KAYKIT_SRC);
  assert.ok(m, `could not find the claim "${label}" in KayKit.js — the comment was reworded, so `
    + 'this arm is no longer checking anything and must be re-anchored');
  return m.slice(1).map(Number);
}
/** Assert a measurement against the number the comment states. */
function agrees(measured, claimed, tol, what) {
  assert.ok(Math.abs(measured - claimed) <= tol,
    `${what}: the comment says ${claimed}, measurement says ${measured.toFixed(4)} (tolerance ${tol})`);
}

test('C1: the six annotated shot distances in the camera block are still true', () => {
  /* `['crates_stacked', 5.5, 0, -34.0, 0.30],   // temple    15.2 m` — the trailing annotation is
     a claim, and this is the check §393.1 said did not exist. Distance is to the prop's own
     mid-height, which is the convention that reproduces all six to within 0.13 m. */
  const re = /\['([a-z_]+)',\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\],\s*\/\/\s*([a-z-]+)\s+([\d.]+) m/g;
  const claims = [...KAYKIT_SRC.matchAll(re)];
  assert.equal(claims.length, 6, `expected the six annotated camera placements, parsed ${claims.length}`);
  const report = [];
  for (const c of claims) {
    const p = { file: c[1], x: +c[2], y: +c[3], z: +c[4], ry: +c[5] };
    const shot = c[6], claimed = +c[7];
    assert.ok(SHOTS[shot], `annotation names shot "${shot}", which is not in Shots.js`);
    const cam = camOf(SHOTS[shot]);
    const d = cam.position.distanceTo(midOf(p));
    report.push(`${p.file}@(${p.x},${p.z}) ${shot} claim ${claimed} measured ${d.toFixed(2)}`);
    assert.ok(Math.abs(d - claimed) <= 0.2,
      `${p.file} at (${p.x}, ${p.z}) is annotated "${shot} ${claimed} m" but measures ${d.toFixed(2)} m`);
    assert.ok(seenBy(cam, p), `${p.file} at (${p.x}, ${p.z}) is annotated for "${shot}" but is not in its frame`);
  }
  console.log(`  C1: ${report.length} annotations re-derived\n     ${report.join('\n     ')}`);
});

test('C2: the framing claims in the camera banner are still true', () => {
  const player30 = PLACE.slice(0, 30);
  const nearest = (name) => {
    const cam = camOf(SHOTS[name]);
    const seen = player30.filter((p) => seenBy(cam, p));
    return { n: seen.length, d: seen.length ? Math.min(...seen.map((p) => cam.position.distanceTo(midOf(p)))) : Infinity };
  };
  const interior = nearest('interior');
  const temple = nearest('temple');
  const courtyard = nearest('courtyard');
  console.log(`  C2: interior ${interior.n} @ ${interior.d.toFixed(2)} m · temple ${temple.n} @ ${temple.d.toFixed(2)} m · courtyard ${courtyard.n}`);

  assert.ok(interior.n > 0 && temple.n > 0, 'inspected 0 props for one of the named shots');
  /* "of the thirty above, `interior` is far and away the nearest shot, at 8.09 m" */
  const [cInterior] = claim(/`interior` is\s*\n?\s*\*?\s*far and away the nearest shot, at ([\d.]+) m/, 'interior nearest');
  agrees(interior.d, cInterior, 0.02, 'interior nearest');
  /* "then 15.3 m of nothing" — the gap, read from the banner. Round 12 asserted a hand-picked
     `> 12` bar here; two cameras (`alert`, `impact`) have landed since and the gap closed from
     16.4 m to 15.26 m, so the bar held but told nobody the number had moved. Reading the stated
     gap instead means the next camera that narrows it has to come through this arm. */
  const others = Object.keys(SHOTS).filter((s) => s !== 'interior').map((s) => nearest(s).d);
  const runnerUp = Math.min(...others);
  const [cGap] = claim(/interior at [\d.]+ m, then ([\d.]+) m of nothing/, 'the interior gap');
  console.log(`  C2: nearest non-interior shot is ${runnerUp.toFixed(2)} m; gap ${(runnerUp - interior.d).toFixed(2)} m`);
  agrees(runnerUp - interior.d, cGap, 0.05, 'the gap between interior and the next camera');
  /* and the three the banner names as inside 25 m, so a fourth cannot appear unremarked */
  const inside = Object.keys(SHOTS).filter((s) => nearest(s).d < 25).sort();
  assert.deepEqual(inside, ['alert', 'interior', 'sly-key'],
    `the set of shots with a player-30 prop inside 25 m is now ${inside.join(', ')}; the banner names `
    + 'interior, alert and sly-key');
  /* "`temple` has ONE in its cone, at 35.2 m" */
  const [cTemple] = claim(/`temple` has ONE in its cone, at ([\d.]+) m/, 'temple distance');
  assert.equal(temple.n, 1, `temple sees ${temple.n} of the thirty, comment says ONE`);
  agrees(temple.d, cTemple, 0.06, 'temple\'s one prop');
  /* the three the banner names as inside 25 m, each re-derived from the distance it states */
  const [cAlert] = claim(/`alert`\s*\n?\s*\*?\s*([\d.]+) m, `sly-key`/, 'alert nearest');
  const [cKey] = claim(/`sly-key` ([\d.]+) m\./, 'sly-key nearest');
  agrees(nearest('alert').d, cAlert, 0.02, 'alert nearest');
  agrees(nearest('sly-key').d, cKey, 0.02, 'sly-key nearest');
  /* "over the eighteen canonical cameras that exist today" — the census must match Shots.js.
     This is the claim that went stale twice in two rounds without anybody noticing, so it is
     the one most worth wiring to the source of truth. */
  const words = { sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
  const wm = /over the (\w+) canonical/.exec(KAYKIT_SRC);
  assert.ok(wm && words[wm[1]] !== undefined, 'the banner no longer names a shot count in words');
  assert.equal(words[wm[1]], Object.keys(SHOTS).length,
    `the banner says ${wm[1]} canonical cameras, Shots.js has ${Object.keys(SHOTS).length}`);
  /* "`courtyard` has all thirty in its cone" — the count half of a sentence whose range half was
     wrong. The range is pinned in C3 against the set it actually describes. */
  assert.equal(courtyard.n, 30, `courtyard sees ${courtyard.n} of the thirty, comment says all thirty`);
});

test('C3: the courtyard distance bands the corrected comments now state', () => {
  const cam = camOf(SHOTS.courtyard);
  const seen = PLACE.filter((p) => seenBy(cam, p));
  const d = seen.map((p) => cam.position.distanceTo(midOf(p))).sort((a, b) => a - b);
  assert.equal(seen.length, 36, `courtyard sees ${seen.length} of the 36, the decal note says all thirty-six`);
  console.log(`  C3: courtyard 36/36 at ${d[0].toFixed(1)}–${d[35].toFixed(1)} m, second nearest ${d[1].toFixed(1)} m`);
  /* the decal note: "35 of the 36 at 33.4–116.8 m", the odd one out being the courtyard crate */
  const [n35, lo, hi] = claim(/(\d+) of the 36 at ([\d.]+)[–-]([\d.]+) m/, 'decal-note courtyard band');
  assert.equal(n35, 35, 'the decal note counts a different number of props into its band');
  agrees(d[1], lo, 0.06, 'second-nearest in courtyard');
  agrees(d[35], hi, 0.06, 'farthest in courtyard');
  const [cNear] = claim(/the courtyard crate at ([\d.]+) m/, 'the near courtyard crate');
  agrees(d[0], cNear, 0.06, 'nearest in courtyard');
  /* the banner: 35–51 m is the ELEVEN colonnade props, which is the set the old sentence
     attributed to all thirty. The first eleven rows are the two colonnade blocks. */
  const colonnade = PLACE.slice(0, 11);
  const cd = colonnade.map((p) => cam.position.distanceTo(midOf(p)));
  assert.equal(colonnade.length, 11, 'the colonnade block is the first eleven rows');
  const [cLo, cHi] = claim(/colonnade props alone \(([\d.]+)[–-]([\d.]+) m\)/, 'colonnade band');
  agrees(Math.min(...cd), cLo, 0.06, 'colonnade nearest');
  agrees(Math.max(...cd), cHi, 0.06, 'colonnade farthest');
  /* and the two bands the banner attributes to the other blocks */
  const [cHyp] = claim(/the hypostyle stores\s*\n?\s*\*?\s*reach ([\d.]+) m/, 'hypostyle far bound');
  const hyp = PLACE.slice(11, 20).map((p) => cam.position.distanceTo(midOf(p)));
  agrees(Math.max(...hyp), cHyp, 0.06, 'hypostyle farthest');
  const [tLo, tHi] = claim(/the tomb hoard ([\d.]+)[–-]([\d.]+) m/, 'tomb band');
  const tomb = PLACE.slice(20, 30).map((p) => cam.position.distanceTo(midOf(p)));
  agrees(Math.min(...tomb), tLo, 0.06, 'tomb nearest');
  agrees(Math.max(...tomb), tHi, 0.06, 'tomb farthest');
});

test('C4: the courtyard crate IS in `sly-profile` — the corrected claim, pinned', () => {
  /* The old comment said this placement "appears in no character frustum at all". It is in one.
     Pinned here so the correction cannot quietly rot back, and so that a lane which MOVES the
     crate to make the original claim true has to come through this arm to do it. */
  const p = PLACE.find((q) => q.x === -5.5 && q.z === 30.5);
  assert.ok(p, 'the courtyard camera crate is no longer at (-5.5, 30.5)');
  const cam = camOf(SHOTS['sly-profile']);
  const ndc = cornersOf(p).map((v) => v.clone().project(cam));
  const inside = ndc.filter(inNdc).length;
  const x0 = Math.max(-1, Math.min(...ndc.map((n) => n.x))), x1 = Math.min(1, Math.max(...ndc.map((n) => n.x)));
  const y0 = Math.max(-1, Math.min(...ndc.map((n) => n.y))), y1 = Math.min(1, Math.max(...ndc.map((n) => n.y)));
  const d = cam.position.distanceTo(midOf(p));
  console.log(`  C4: sly-profile — ${inside}/8 corners in frame at ${d.toFixed(2)} m, `
    + `${(50 * (x1 - x0)).toFixed(1)}% of width, ${(50 * (y1 - y0)).toFixed(1)}% of height`);
  const [cDist] = claim(/`sly-profile`, at ([\d.]+) m, with four of eight corners inside NDC/, 'sly-profile distance');
  const [cW, cH] = claim(/leftmost ([\d.]+) %\s*\n?\s*\*?\s*of frame width and ([\d.]+) % of frame height/, 'sly-profile frame share');
  const [cAng] = claim(/([\d.]+)° off-axis, hard against the left edge/, 'sly-profile off-axis');
  assert.equal(inside, 4, `${inside} of 8 corners in frame; the comment records four`);
  agrees(d, cDist, 0.02, 'sly-profile distance');
  agrees(50 * (x1 - x0), cW, 0.1, 'share of frame width');
  agrees(50 * (y1 - y0), cH, 0.1, 'share of frame height');
  const s = SHOTS['sly-profile'];
  const fwd = new THREE.Vector3().fromArray(s.target).sub(cam.position).normalize();
  const to = midOf(p).clone().sub(cam.position).normalize();
  const ang = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fwd.dot(to), -1, 1)));
  agrees(ang, cAng, 0.1, 'off-axis angle to the prop mid-height');

  /* and the part of the original decision that DID hold: it is in no other sly-* frame. */
  const others = Object.keys(SHOTS).filter((s) => s.startsWith('sly-') && s !== 'sly-profile');
  assert.ok(others.length === 5, `expected five other sly-* shots, found ${others.length}`);
  for (const s of others) assert.ok(!seenBy(camOf(SHOTS[s]), p), `the crate has entered ${s} as well`);
});

test('C5: the re-centring and footprint-radius numbers in `_load` are still true', () => {
  const rub = LIB.get('rubble_half'), chest = LIB.get('chest'), chestG = LIB.get('chest_gold');
  assert.ok(rub && chest && chestG, 'inspected 0 of the three named models');

  /* "`rubble_half` sits 2.000 m off in x" — the amount `_load` removed, recovered from the raw
     asset bound rather than re-asserted from the same code path that applied it. */
  const raw = JSON.parse(new TextDecoder().decode(
    new Uint8Array(THREE.Cache.get('file:assets/kaykit/rubble_half.gltf'))));
  const acc = raw.accessors.find((a) => a.min?.length === 3);
  const rawCx = (acc.min[0] + acc.max[0]) / 2;
  console.log(`  C5: rubble_half raw x-centre ${rawCx.toFixed(4)} m · chest z-centre ${((chest.bb.min.z + chest.bb.max.z) / 2).toFixed(4)} m post-recentre`);
  const [cRub] = claim(/`rubble_half` sits ([\d.]+) m off in x/, 'rubble_half offset');
  agrees(rawCx, cRub, 0.001, 'rubble_half x offset');

  /* "both chests are 0.0229 m off in z" — the corrected number. Re-derived the way the comment
     now explains it: raw union WITHOUT the node transform gives 0.3554 (the old, wrong figure),
     WITH it gives 0.0229. Both are checked, because the point of the correction is the difference. */
  const cRaw = JSON.parse(new TextDecoder().decode(
    new Uint8Array(THREE.Cache.get('file:assets/kaykit/chest.gltf'))));
  /* Per-mesh POSITION bounds, by name rather than by array position — a NORMAL accessor also
     carries a 3-vector min/max, and unioning one of those in would quietly poison the figure. */
  const posBounds = cRaw.meshes.map((mesh) => {
    const a = cRaw.accessors[mesh.primitives[0].attributes.POSITION];
    assert.ok(a?.min?.length === 3, 'a chest primitive has no POSITION bounds');
    return { min: a.min, max: a.max };
  });
  const nodeOf = (meshIdx) => cRaw.nodes.find((n) => n.mesh === meshIdx);
  assert.equal(posBounds.length, 2, 'chest.gltf is the lid + body pair the comment describes');

  /* the OLD number, reproduced deliberately: union the raw bounds and skip the node transform */
  const noXform = (Math.min(...posBounds.map((b) => b.min[2])) + Math.max(...posBounds.map((b) => b.max[2]))) / 2;
  const [cNoXform] = claim(/centre ([\d.]+) — and the/, 'the un-transformed chest centre');
  agrees(noXform, cNoXform, 0.0005, 'chest centre WITHOUT the node transform (provenance of the old 0.355 m claim)');

  const [cLid] = claim(/`chest_lid` carries `translation: \[0, 0\.5, .?([\d.]+)\]`/, 'chest_lid translation');
  const lidNode = cRaw.nodes.find((n) => /lid/.test(n.name || ''));
  assert.ok(lidNode?.translation, 'the asset no longer has a `chest_lid` node with a translation');
  agrees(-lidNode.translation[2], cLid, 1e-6, 'chest_lid translation z');

  /* the CORRECTED number: the same union with each node's translation folded in, which is what
     `applyMatrix4(o.matrixWorld)` does before `_load` measures anything */
  const [cChest] = claim(/both chests are ([\d.]+) m off in z/, 'chest z offset');
  const withXform = posBounds.map((b, i) => {
    const t = nodeOf(i)?.translation?.[2] ?? 0;
    return { lo: b.min[2] + t, hi: b.max[2] + t };
  });
  const preZ = (Math.min(...withXform.map((b) => b.lo)) + Math.max(...withXform.map((b) => b.hi))) / 2;
  agrees(preZ, cChest, 0.0005, 'chest z offset WITH the node transform applied');
  assert.ok(Math.abs(noXform - preZ) > 0.3,
    'the two derivations no longer differ, so the comment\'s explanation of where 0.355 came from '
    + 'is no longer demonstrable');

  /* and what `_load` leaves behind: nothing */
  for (const [name, e] of [['chest', chest], ['chest_gold', chestG]]) {
    const cz = (e.bb.min.z + e.bb.max.z) / 2;
    assert.ok(Math.abs(cz) < 1e-4, `${name} is ${cz.toFixed(4)} m off in z after _load re-centred it`);
  }

  /* "`barrel_large` is 0.635 m at the floor and 0.932 m at its belly, and `crates_stacked` reaches
     1.427 m only at a corner" — all three are max radial distance, and all three re-derive. */
  const radial = (name, slabOnly) => {
    const e = LIB.get(name), pos = e.geo.attributes.position;
    let r = 0;
    for (let i = 0; i < pos.count; i++) {
      if (slabOnly && pos.getY(i) > e.bb.min.y + 0.25) continue;
      r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    return r;
  };
  const floor = radial('barrel_large', true), belly = radial('barrel_large', false);
  const corner = radial('crates_stacked', false);
  console.log(`  C5: barrel_large floor ${floor.toFixed(4)} / belly ${belly.toFixed(4)} · crates corner ${corner.toFixed(4)}`);
  const [cFloor, cBelly] = claim(/`barrel_large` is ([\d.]+) m at the\s*\n?\s*floor and ([\d.]+) m at its belly/, 'barrel radii');
  const [cCorner] = claim(/`crates_stacked` reaches ([\d.]+) m only at a/, 'crate corner radius');
  agrees(floor, cFloor, 0.001, 'barrel_large at the floor');
  agrees(belly, cBelly, 0.001, 'barrel_large at the belly');
  agrees(corner, cCorner, 0.001, 'crates_stacked at a corner');

  /* "up to 47 % too wide" — the ratio the shipped `rBase` actually avoids. */
  const bb = new THREE.Vector3(); LIB.get('barrel_large').bb.getSize(bb);
  const bboxRadius = (bb.x + bb.z) / 4;                       // groundFootprint's metric, whole model
  const over = 100 * (bboxRadius / LIB.get('barrel_large').rBase - 1);
  const [cOver] = claim(/would be up to (\d+) % too wide/, 'decal oversize');
  console.log(`  C5: a bbox-sized decal would be ${over.toFixed(1)} % wider than the shipped rBase`);
  agrees(over, cOver, 0.5, 'bbox-sized decal oversize');
});

/* ============================ 4. the clone family, recorded ============================ */

test('D1: the repeat census — recorded as a pin, because it is a finding rather than a seal', () => {
  /* THE `ropeCoil` SHAPE, AND IT IS NOT SEALED. `tests/basketvary.test.mjs` bars any camera from
     seeing more than two coils of one silhouette. KayKit is well over that bar and this arm does
     NOT assert the bar, because a seal that fails on HEAD is not a seal, it is a broken build.
     What it does is pin the census so the number cannot drift without a conversation.
     Measured today: 36 placements from 11 models, and `_buildProps` composes every one with
     `new THREE.Vector3(1, 1, 1)`, so repeats differ in yaw ALONE — same geometry, same size.
       crates_stacked 9 · barrel_small 6 · barrel_large 5 · barrel_small_stack 4 · chest 2 ·
       barrel_large_decorated 2 · rubble_half 2 · coin_stack_medium 2 · coin_stack_small 2 ·
       chest_gold 1 · coin_stack_large 1
     Worst single frame: `courtyard` and `dunes` see all nine `crates_stacked`; `hero` six;
     `night` and `combat` five. basketvary's bar is two. Whether that matters at 35–117 m is a
     look question, and no frame has been rendered here — which is exactly why this is a pin. */
  const census = {};
  for (const p of PLACE) census[p.file] = (census[p.file] || 0) + 1;
  const scales = /new THREE\.Vector3\(1, 1, 1\)/.test(KAYKIT_SRC);
  console.log(`  D1: ${PLACE.length} placements from ${Object.keys(census).length} models — `
    + Object.entries(census).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
  assert.ok(PLACE.length > 0, 'inspected 0 placements');
  assert.equal(Object.keys(census).length, 11, 'distinct models in the table');
  assert.equal(census.crates_stacked, 9, 'the most-repeated model');
  assert.equal(Math.max(...Object.values(census)), 9, 'worst repeat count');
  assert.ok(scales, 'placements are composed at unit scale, so repeats vary in yaw alone');

  const worstShot = Object.entries(SHOTS).map(([name, s]) => {
    const cam = camOf(s), seen = {};
    for (const p of PLACE) if (seenBy(cam, p)) seen[p.file] = (seen[p.file] || 0) + 1;
    return { name, worst: Math.max(0, ...Object.values(seen)) };
  }).sort((a, b) => b.worst - a.worst)[0];
  console.log(`  D1: worst single frame is "${worstShot.name}" with ${worstShot.worst} identical silhouettes `
    + '(basketvary\'s bar for rope coils is 2 — recorded, not enforced)');
  assert.equal(worstShot.worst, 9, 'the worst-frame repeat count has moved without a note');
});
