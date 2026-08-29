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
import { TUNE as PICK } from '../src/world/Pickups.js';
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

/**
 * The exception list, and it is now a BAR rather than a pin.
 *
 * Round 12 held four penetrations; round 14 decided them; this round acts on them. Two were in
 * the courtyard and are moved. Two are in the tomb and are ACCEPTED, each with its reason written
 * beside the placement in `KayKit.js` — one because it is invisible from every canonical camera
 * and moving it costs the hoard's composition, one because the drawn pier is not touched at all
 * and the overlap is against a proxy that is fatter than its own art.
 *
 * Naming them here is what turns the finding into a check. §395.4's rule is that a seal failing on
 * HEAD is a broken build, not a seal — so the seal is written as "no penetration EXCEPT these two,
 * at these depths", which holds today and fails the moment a third appears or one of the two
 * deepens. That is the shape a decided finding should leave behind.
 */
const ACCEPTED_PENETRATIONS = [
  { file: 'chest', x: -6.8, z: -74.2, depth: 0.759, why: 'W crypt pier; 446 drawn seam points, 0 unoccluded from any camera' },
  { file: 'chest', x: 4.6, z: -70.0, depth: 0.097, why: 'E crypt pier; proxy-only — 0 drawn seam points, the pier art is untouched' },
];

test('A3: no KayKit collider is inside a wall proxy except the two accepted in the tomb', () => {
  /* ROUND 12 HELD THIS AND SAID WHY: `proxy:wall` is general `BufferGeometry` and might be
     non-convex, so a face-normal SAT could only bound the answer, not give it. Both halves of
     that are now settled — the axis set is complete (see `separation`) and convexity is measured
     rather than assumed, below — so the penetrations are real numbers.

     Two solids overlapping still do not make a hole, and this arm does not claim they do: A3d
     measures what the burial actually costs and the answer is dead surface, not a trap. What
     changed is that the two that could be fixed HAVE been, so the remaining two are decisions
     rather than a backlog, and a decision belongs in an allowlist where the next one has to
     join it explicitly. */
  const walls = OTHER.filter((r) => r.opts?.tag === 'wall');
  assert.ok(walls.length > 0, 'inspected 0 wall proxies — Architecture did not boot');

  /* ── the precondition, narrowed rather than dropped (§600) ────────────────────────────────
     It used to read "every `wall` proxy is convex". That was true until the vent passage was
     built: a wall with a doorway cut in it is ONE collider carrying several boxes (that is what
     makes a portal cut free — see `EgyptLevel.js` `mergedProxy`), so it is non-convex by
     construction and `separation()` can only bound it. Five walls are now in that class.

     The precondition that actually matters is not "no wall is non-convex" — it is "no depth
     reported below was decided by a bound", so the check is that no KayKit collider comes NEAR
     a non-convex wall. Measured: 0 of 29 KayKit AABBs intersect any of the five even at AABB
     resolution, which is the loosest test available and therefore the strongest negative. The
     five are all §600's cuts: the hall north wall, the tomb west wall, the vent's two shaft
     jambs and its east-run shell. */
  let worstDev = 0;
  const nonConvexWalls = [];
  for (const w of walls) {
    const cv = convexity(w.mesh);
    if (!cv.convex) { nonConvexWalls.push(w); continue; }
    worstDev = Math.max(worstDev, cv.worst);   // over the CONVEX ones only — the others are metres
  }
  const kAabb = KK.map((r) => aabbOf(r.mesh));
  const contaminated = nonConvexWalls.filter((w) => {
    const b = aabbOf(w.mesh);
    return kAabb.some((k) => k.intersectsBox(b));
  });
  console.log(`  A3: ${walls.length} wall proxies, ${nonConvexWalls.length} non-convex (cut portals), `
    + `${contaminated.length} of those within AABB reach of any KayKit collider, `
    + `worst vertex-outside-plane on a convex one ${worstDev.toExponential(2)} m`);
  assert.equal(contaminated.length, 0,
    `${contaminated.length} non-convex wall proxies are within AABB reach of a KayKit collider, so at least one `
    + 'depth below is a BOUND from a face-normal SAT rather than a decision — this arm must go back to being '
    + 'a held finding, or the non-convex wall must be decomposed before it is measured');
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

  /* every hit must be on the list, and every entry on the list must still be a hit */
  const unexpected = hits.filter((h) => !ACCEPTED_PENETRATIONS.some((a) =>
    Math.hypot(h.at.x - a.x, h.at.z - a.z) < 0.05));
  assert.deepEqual(unexpected.map((h) => `${h.depth.toFixed(3)} m @(${h.at.x.toFixed(2)}, ${h.at.z.toFixed(2)})`), [],
    'a KayKit collider is inside a wall proxy that is not on ACCEPTED_PENETRATIONS. Either move the '
    + 'placement, or add it to that list WITH the reason and the visibility measurement A3c produces '
    + '— the list is the record of a decision, not a snooze button');
  for (const a of ACCEPTED_PENETRATIONS) {
    const h = hits.find((q) => Math.hypot(q.at.x - a.x, q.at.z - a.z) < 0.05);
    assert.ok(h, `${a.file} at (${a.x}, ${a.z}) is no longer inside a wall — good, and it should come `
      + 'off ACCEPTED_PENETRATIONS rather than be left as an exception nothing exercises');
    assert.ok(Math.abs(h.depth - a.depth) < 0.005,
      `${a.file} at (${a.x}, ${a.z}) is now ${h.depth.toFixed(3)} m in, accepted at ${a.depth} m`);
  }
  assert.equal(hits.length, ACCEPTED_PENETRATIONS.length, 'hit count and allowlist length disagree');
  assert.ok(hits[0].depth < 0.8, 'an accepted penetration has deepened past anything measured so far');
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

test('A3b: the camera block\'s four-part constraint list, enforced over EVERY placement', () => {
  /* THE FINDING THIS ARM EXISTS FOR. The camera block used to state its grid search as three
     tests: "on real paving, clear of every column and plinth footprint by 1.4 m, and inside its
     target shot's frame at 6-26 m." That search was not buggy — it passed every test it names.
     `barrel_large` at (-11.5, 2.5) cleared the nearest `pole` proxy, which is what "every column"
     means, by 14.30 m. It was also 1.003 m inside a gateway pylon, because the pylons are `wall`
     proxies and `wall` was never in the list. **A search is only as good as its constraint set**,
     and a constraint set written in prose is a claim nobody re-runs.

     The repair is not a longer sentence. It is that the list is checked here, over all 36 rows
     rather than the six it was written for, so the next placement cannot pass a test that is not
     being run. Two of the four constraints below caught something on the shipped tree:

       · `wall` clearance     the finding above, and the reason this arm exists
       · nothing overhead     found by the FIX. The first replacement cleared every wall proxy by
                              0.70 m and still cut 432 drawn masonry triangles — it stood on
                              courtyard paving at y 0 underneath the obelisk terrace, whose own
                              paving is 1.52 m up. "On real paving" had been asked as "is there a
                              floor at y = 0", which `framelib.groundColumn` documents as the
                              wrong shape of question. */
  assert.equal(SOLID_ROWS.length, KK.length, 'the SOLID row list and the collider list are different lengths');
  for (let i = 0; i < KK.length; i++) {
    const m = KK[i].mesh, r = SOLID_ROWS[i];
    assert.ok(Math.hypot(m.position.x - r.x, m.position.z - r.z) < 0.01,
      `collider ${i} is at (${m.position.x.toFixed(2)}, ${m.position.z.toFixed(2)}) but SOLID row ${i} `
      + `is ${r.file} at (${r.x}, ${r.z}) — the row-to-collider map is wrong and every name below with it`);
  }
  /* the comment must still state the list this arm enforces, or the two have drifted apart */
  for (const [re, what] of [
    [/clear of every `pole` proxy \(columns\) by 1\.4 m/, 'the pole constraint'],
    [/clear of every `wall` proxy \(pylons, temenos, piers, gate jambs\)/, 'the wall constraint'],
    [/the prop's OWN HEIGHT clear of everything above that floor/, 'the overhead constraint'],
  ]) assert.match(KAYKIT_SRC, re, `the camera block no longer states ${what}, which this arm enforces`);

  const poles = OTHER.filter((r) => r.opts?.tag === 'pole');
  const walls = OTHER.filter((r) => r.opts?.tag === 'wall');
  assert.ok(poles.length > 0 && walls.length > 0, 'inspected 0 pole or 0 wall proxies');

  /* 1+2: `wall` clearance, exact, over every placement — A3 owns the allowlist, so here it is
     only reported; what this arm adds is the MARGIN, so a near-miss is visible before it lands. */
  const margins = [];
  const kAabb = KK.map((r) => aabbOf(r.mesh));
  for (let i = 0; i < KK.length; i++) {
    let m = Infinity, who = null;
    for (const w of walls) {
      const wb = aabbOf(w.mesh);
      if (kAabb[i].max.y < wb.min.y - 0.5 || kAabb[i].min.y > wb.max.y + 0.5) continue;
      const cx = Math.max(wb.min.x, Math.min(KK[i].mesh.position.x, wb.max.x));
      const cz = Math.max(wb.min.z, Math.min(KK[i].mesh.position.z, wb.max.z));
      if (Math.hypot(KK[i].mesh.position.x - cx, KK[i].mesh.position.z - cz) > 6) continue;
      const s = separation(KK[i].mesh, w.mesh);
      if (s < m) { m = s; who = w; }
    }
    if (who) margins.push({ row: SOLID_ROWS[i], sep: m });
  }
  margins.sort((a, b) => a.sep - b.sep);
  console.log('  A3b: tightest crate-to-wall margins — '
    + margins.slice(0, 5).map((q) => `${q.row.file}@(${q.row.x}, ${q.row.z}) ${q.sep >= 0 ? '+' : ''}${q.sep.toFixed(3)}`).join(' · '));
  assert.ok(margins.length > 0, 'inspected 0 crate-to-wall pairs');

  /* the two placements moved this round, asserted at their new coordinates with real margin —
     because "it no longer penetrates" and "it has room to spare" are different claims, and the
     drawn pylon stands outside its own proxy by up to the corner-roll radius. */
  for (const [file, x, z, floor] of [['barrel_large', -9.0, 0.75, 0.6], ['barrel_small_stack', -20.25, 3.75, 0.35]]) {
    const q = margins.find((r) => r.row.file === file && Math.abs(r.row.x - x) < 0.01 && Math.abs(r.row.z - z) < 0.01);
    assert.ok(q, `${file} is no longer at (${x}, ${z}) — it was moved there this round out of a pylon, `
      + 'and moving it again needs the same four checks re-run');
    assert.ok(q.sep > floor,
      `${file} at (${x}, ${z}) clears its nearest wall proxy by only ${q.sep.toFixed(3)} m; it was placed `
      + `with ${floor} m of margin deliberately, because the drawn pylon stands outside this proxy`);
  }

  /* 3: nothing overhead. The prop's own height must be clear above the floor it stands on. */
  const scene = ENGINE.scene;
  scene.updateMatrixWorld(true);
  const buried = [];
  for (let i = 0; i < KK.length; i++) {
    const r = SOLID_ROWS[i], g = KK[i].mesh.geometry.parameters;
    const colBox = new THREE.Box3(
      new THREE.Vector3(r.x - 0.35, r.y - 3, r.z - 0.35), new THREE.Vector3(r.x + 0.35, r.y + 40, r.z + 0.35));
    const tris = trisIn(scene, colBox).filter((T) => /^(paving|arch):/.test(T.name));
    let over = null;
    for (const T of tris) {
      const t = rayTri(r.x, r.y + 35, r.z, 0, -1, 0, T.t);
      if (t < 0) continue;
      const y = r.y + 35 - t;
      if (y > r.y + 0.05 && y < r.y + g.height + 0.20 && (!over || y < over.y)) over = { y, who: T.name };
    }
    if (over) buried.push(`${r.file}@(${r.x}, ${r.z}) has ${over.who} at y ${over.y.toFixed(2)}, `
      + `inside its own ${g.height.toFixed(2)} m height above floor ${r.y}`);
  }
  console.log(`  A3b: ${KK.length} placements checked for architecture inside their own height — ${buried.length} buried`);
  assert.deepEqual(buried, [],
    'a placement stands under architecture that occupies its own volume:\n  ' + buried.join('\n  '));

  /* 4: the camera six stay out of the close-ups, which is the constraint that shaped that block */
  const sly = Object.keys(SHOTS).filter((s) => s.startsWith('sly-') && s !== 'sly-profile');
  const cameraSix = PLACE.slice(30);
  assert.equal(cameraSix.length, 6, 'the camera block is no longer six rows');
  for (const p of cameraSix) {
    for (const s of sly) {
      const cam = camOf(SHOTS[s]);
      if (!seenBy(cam, p)) continue;
      const d = cam.position.distanceTo(midOf(p));
      assert.ok(d >= 14,
        `${p.file} at (${p.x}, ${p.z}) is ${d.toFixed(1)} m into "${s}" — the camera block's whole `
        + 'argument is that these stay out of the character close-ups');
    }
  }
});

/** Seam and visibility for one placement, against DRAWN masonry. Shared by A3c and its lever. */
function seamOf(p, { stride = 6 } = {}) {
  const scene = ENGINE.scene;
  scene.updateMatrixWorld(true);
  const tris = propTris(p);
  const bb = new THREE.Box3();
  for (const t of tris) for (let k = 0; k < 9; k += 3) bb.expandByPoint(new THREE.Vector3(t[k], t[k + 1], t[k + 2]));
  const near = trisIn(scene, bb.clone().expandByScalar(0.6)).filter((T) => isMasonry(T.name));
  const seam = [];
  for (let ti = 0; ti < tris.length; ti += stride) {
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
  return { seam: seam.length, vis: bestVis, shot: bestShot };
}

test('A3c: nothing clips any more — the two that were visible are moved, the two that stay are not', () => {
  /* The question §395.5 held the finding for ("whether the visible art clips needs a frame") asked
     of geometry rather than of a capture. A prop standing BEHIND a pylon corner is occluded along
     the pylon's own silhouette edge and has no seam; a prop INSIDE it has an intersection curve.
     So the curve is computed — every prop edge crossing a drawn masonry triangle — and each point
     is ray-tested against the drawn level from all eighteen cameras.

     THE STATE THIS ARM NOW PINS is the outcome of acting on it: no placement in the level shows an
     unoccluded masonry seam from any canonical camera. Four rows are checked by name rather than
     just the two that still penetrate, because the two that were MOVED are the ones a careless
     revert would put back, and "it was moved for a reason" is only enforceable if the reason is
     still measured at the new coordinates.

     Sub-sampled at stride 6 for runtime. That biases the COUNT and cannot invent or destroy a
     verdict: a seam either has unoccluded points or it does not, and stride only thins them. */
  const WATCH = [
    { file: 'barrel_large', x: -9.0, z: 0.75, want: 0, note: 'MOVED out of the W-inner gateway pylon' },
    { file: 'barrel_small_stack', x: -20.25, z: 3.75, want: 0, note: 'MOVED out of the W-outer gateway pylon' },
    { file: 'chest', x: -6.8, z: -74.2, want: 'some', note: 'accepted: cuts the W crypt pier, no camera sees it' },
    { file: 'chest', x: 4.6, z: -70.0, want: 0, note: 'accepted: proxy-only, the drawn pier is untouched' },
  ];
  const rows = WATCH.map((w) => {
    const p = PLACE.find((q) => q.file === w.file && Math.abs(q.x - w.x) < 0.01 && Math.abs(q.z - w.z) < 0.01);
    assert.ok(p, `${w.file} is no longer at (${w.x}, ${w.z}) — ${w.note}, and moving it again means `
      + 're-running this measurement rather than re-pointing this arm at wherever it landed');
    return { ...w, ...seamOf(p) };
  });
  console.log('  A3c:\n' + rows.map((r) => `     ${r.file}@(${r.x}, ${r.z})  ${String(r.seam).padStart(4)} sampled `
    + `masonry-seam pts, ${String(r.vis).padStart(4)} unoccluded${r.vis ? ` in "${r.shot}"` : ''}   ${r.note}`).join('\n'));

  /* the headline: nothing clips, anywhere */
  const visible = rows.filter((r) => r.vis > 0);
  assert.deepEqual(visible.map((v) => `${v.file}@(${v.x}, ${v.z}) in ${v.shot}`), [],
    'a placement shows an unoccluded masonry seam again. If it is one of the two moved rows, the '
    + 'move has been reverted or undone; if it is one of the accepted two, the reason recorded '
    + 'beside it in KayKit.js no longer holds and the acceptance must be revisited');

  /* and the distinctions the acceptances rest on, each asserted rather than restated */
  for (const r of rows.filter((q) => q.want === 0)) {
    assert.equal(r.seam, 0,
      `${r.file}@(${r.x}, ${r.z}) now cuts ${r.seam} drawn masonry triangles where it cut none — `
      + `${r.note}, and that grading is what this arm exists to keep honest`);
  }
  const cut = rows.find((r) => r.want === 'some');
  assert.ok(cut.seam > 0,
    'the W crypt-pier chest no longer intersects drawn granite at all, so it has become the same '
    + 'proxy-only case as the east one and should be re-graded rather than left described as a cut');
});

test('A3c CALIBRATION: the barrel at its PRE-MOVE coordinates still reads as visible in `night`', () => {
  /* MUST FIRE, and this is the best lever available for it: A3c now asserts an absence across the
     whole level, and an absence-arm that cannot detect a presence is worth nothing. Rather than
     invent a synthetic clash, put `barrel_large` back at (-11.5, 0, 2.5) — the coordinates it
     actually shipped at until this round — and run A3c's own `seamOf` on it. The defect must come
     back, in `night`, through the identical code path.

     That makes this arm do two jobs at once. It proves the instrument fires, and it pins WHY the
     placement moved: if someone reverts the coordinate, A3c goes red and this arm explains it. A
     calibration drawn from the real history of the file beats one drawn from a synthetic case,
     because it cannot drift away from the thing it is calibrating. */
  const before = { file: 'barrel_large', x: -11.5, y: 0, z: 2.5, ry: -1.2 };
  const now = PLACE.find((p) => p.file === 'barrel_large' && Math.abs(p.x + 9.0) < 0.01 && Math.abs(p.z - 0.75) < 0.01);
  assert.ok(now, 'barrel_large is not at its post-move (-9.0, 0.75); this lever describes a move that '
    + 'no longer exists and must be re-anchored to whatever the current placement is');

  const was = seamOf(before);
  console.log(`  A3c calib: at the pre-move (-11.5, 2.5) the same instrument reports ${was.seam} sampled `
    + `masonry-seam points and ${was.vis} unoccluded in "${was.shot}" — the defect this round removed`);
  assert.ok(was.seam > 0, 'the pre-move position no longer intersects drawn masonry at all, so either '
    + 'the pylon moved or the instrument stopped detecting seams; A3c cannot be trusted either way');
  assert.ok(was.vis > 0,
    'the pre-move position now reports NO unoccluded seam, so A3c\'s all-clear may simply be an '
    + 'instrument that has stopped saying yes — the move it certifies is no longer demonstrated');
  assert.equal(was.shot, 'night',
    `the pre-move defect is now visible in "${was.shot}" rather than \`night\`; the record of what was `
    + 'fixed and the measurement no longer agree');
});

test('A3d: what the two accepted burials cost — dead crate-top, and nothing else', () => {
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

  assert.equal(rows.length, ACCEPTED_PENETRATIONS.length, 'inspected the wrong number of penetrations');
  for (const r of rows) assert.ok(r.top > 0.4, `${r.file}@(${r.x}, ${r.z}) has a ${r.top.toFixed(2)} m² top face — inspected almost nothing`);
  /* both of them DO add a real foothold, which is the half that is not a defect */
  for (const r of rows) {
    assert.ok(r.top - r.dead > 0.2,
      `${r.file}@(${r.x}, ${r.z}) offers only ${(r.top - r.dead).toFixed(2)} m² of occupiable top — it has `
      + 'become a foothold nobody can use, which is a bigger claim than the one recorded here');
  }
  /* and both waste some of it inside the masonry, which is the half that is — and is the whole
     price of the two acceptances, stated as a number so the next reader can weigh it */
  const dead = rows.reduce((s, r) => s + r.dead, 0);
  assert.ok(rows.every((r) => r.dead > 0),
    'an accepted burial no longer puts any of its top face inside the wall, which would mean it has '
    + 'stopped costing anything — take it off ACCEPTED_PENETRATIONS rather than leave it there');
  assert.ok(Math.abs(dead - 1.77) < 0.25,
    `${dead.toFixed(2)} m² of crate top now stands inside masonry across the two accepted burials; `
    + 'measured 1.77 m² — 1.48 at the west pier and 0.29 at the east. The two moved this round used '
    + 'to add 1.48 and 1.01 on top of that');
  /* NOT a snag and NOT a trap: the deepest a capsule stands inside a wall is under its own height,
     so there is no wedge a player can enter and no floor they can fall through. Driven against a
     real `Controller` and a real `Collision` this reproduces as a handful of `probeLedge` grabs
     landing 2-6 cm inside the pier and no route change at all; that run needs Terrain and two full
     worlds, so it is reported in the ledger rather than repeated here every suite. */
  assert.ok(Math.max(...rows.map((r) => r.worst)) < 1.3,
    'a crate top now stands a capsule more than 1.3 m inside a wall, which is deep enough to be a '
    + 'containment question rather than a wasted surface');
});

/* ============================ 2c. the category nothing had measured ============================
   A1 covers KayKit against KayKit and A2 KayKit against `pole`. Neither looks at `Props.js`, which
   draws the colossi, the hoard, the rope coils and the collectibles. The row-21 chest turned out to
   sit near 3887 triangles of `props_gold`, and that number is what prompted these arms.

   IT IS ALSO THE FIRST THING THEY CORRECT. 3887 is an AABB-PROXIMITY count — triangles whose
   bounding box overlaps the chest's — and the exact count inside the chest's own oriented box is
   615, of which 555 are within 0.15 m of the floor. That is a chest standing in a coin hoard, and
   a hoard is what it is supposed to look like. A-CALIB's lesson, arriving in my own flag.

   Every arm here states which pair of representations it measured, because §401 established those
   diverge: Architecture's crypt-pier proxy claims ~0.2 m its art does not occupy, and one of the
   four wall findings was entirely an artefact of not saying which. */

const PROPS = ALLREG.filter((r) => r.owner === 'props');

/** Exact oriented-box vs triangle (Akenine-Möller), in the box's own frame. */
function triBox(h, inv, T) {
  const v = [];
  for (let k = 0; k < 9; k += 3) v.push(new THREE.Vector3(T[k], T[k + 1], T[k + 2]).applyMatrix4(inv));
  for (let a = 0; a < 3; a++) {
    const c = ['x', 'y', 'z'][a];
    if (Math.min(v[0][c], v[1][c], v[2][c]) > h[a] || Math.max(v[0][c], v[1][c], v[2][c]) < -h[a]) return false;
  }
  const e0 = new THREE.Vector3().subVectors(v[1], v[0]);
  const e1 = new THREE.Vector3().subVectors(v[2], v[1]);
  const n = new THREE.Vector3().crossVectors(e0, e1);
  if (n.lengthSq() > 1e-20) {
    const d = n.dot(v[0]);
    const r = h[0] * Math.abs(n.x) + h[1] * Math.abs(n.y) + h[2] * Math.abs(n.z);
    if (d > r || d < -r) return false;
  }
  const e2 = new THREE.Vector3().subVectors(v[0], v[2]);
  const ax3 = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  for (const e of [e0, e1, e2]) for (let a = 0; a < 3; a++) {
    const ax = new THREE.Vector3().crossVectors(ax3[a], e);
    if (ax.lengthSq() < 1e-20) continue;
    let lo = Infinity, hi = -Infinity;
    for (const p of v) { const d = p.dot(ax); if (d < lo) lo = d; if (d > hi) hi = d; }
    const r = h[0] * Math.abs(ax.x) + h[1] * Math.abs(ax.y) + h[2] * Math.abs(ax.z);
    if (lo > r || hi < -r) return false;
  }
  return true;
}
/**
 * Box against triangle soup, NOT the edge-cross SAT `separation()` uses.
 *
 * That one is O(edges_A x edges_B) and is exactly right for two convex proxies. Props registers
 * `ground` colliders of up to 24,136 triangles, where it does not terminate — the first attempt
 * at this category ran past ten minutes before being killed. Tri-box SAT is 13 axes per triangle
 * and is exact for this pair, which is the whole reason to check the shape of a problem before
 * reaching for the instrument that solved the last one.
 */
function meshTris(o) {
  const g = o.geometry, pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1, out = [];
  const v = new THREE.Vector3();
  for (let ii = 0; ii < inst; ii++) {
    const m = new THREE.Matrix4();
    if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
    for (let i = 0; i < n; i += 3) {
      const t = [];
      let lox = 1e9, loy = 1e9, loz = 1e9, hix = -1e9, hiy = -1e9, hiz = -1e9;
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(i + k) : i + k;
        v.fromBufferAttribute(pos, vi).applyMatrix4(m);
        t.push(v.x, v.y, v.z);
        lox = Math.min(lox, v.x); loy = Math.min(loy, v.y); loz = Math.min(loz, v.z);
        hix = Math.max(hix, v.x); hiy = Math.max(hiy, v.y); hiz = Math.max(hiz, v.z);
      }
      out.push({ t, lox, loy, loz, hix, hiy, hiz, who: o.name });
    }
  }
  return out;
}
const PROPS_DRAWN = (() => {
  ENGINE.scene.updateMatrixWorld(true);
  const out = [];
  ENGINE.scene.traverse((o) => {
    if (o.isMesh && o.visible && /^(props_|coins|clue_bottles|ruin:|hooks:)/.test(o.name)) out.push(o);
  });
  return out;
})();
/** The oriented box `_collider` builds for a placement — solid or not, so all 36 can be asked. */
function placementBox(p) {
  const e = LIB.get(p.file), s = new THREE.Vector3();
  e.bb.getSize(s);
  const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z));
  m.position.set(p.x, p.y + s.y / 2, p.z);
  m.rotation.y = p.ry;
  m.updateMatrixWorld(true);
  return { mesh: m, size: s };
}

test('P1: Props\' `ground` colliders ARE its drawn art — the opposite of Architecture', () => {
  /* THE STRUCTURAL FACT EVERY OTHER PROP-VS-PROP FINDING DEPENDS ON, and it is not the same fact
     as for Architecture. `EgyptLevel.wallProxy` builds a separate axis-aligned box that stands in
     for a `masonryShell`, and §401 measured that stand-in claiming up to ~0.2 m the art does not
     occupy. `Props` does not do that for its ground: it hands COLLISION the merged draw bucket
     itself, the same `BufferGeometry` the frame rasterises.

     So the disclaimer that finding needs — "say whether you measured the proxy or the art" — has
     a different answer per module, and asserting it here means nobody has to guess:
       against a Props `ground` collider   proxy IS art, the two questions have one answer
       against a Props `ledge` / `hazard`  a separate proxy, and the divergence is open again
       against an Architecture `wall`      a separate proxy, measured divergence up to ~0.2 m */
  assert.ok(PROPS.length > 0, 'inspected 0 Props colliders — Props did not boot');
  assert.ok(PROPS_DRAWN.length > 0, 'inspected 0 drawn Props meshes');
  const drawnGeo = new Set(PROPS_DRAWN.map((m) => m.geometry.uuid));
  const split = {};
  for (const r of PROPS) {
    const isArt = drawnGeo.has(r.mesh.geometry.uuid);
    const k = `${r.opts?.tag}${isArt ? ':is-drawn-art' : ':separate-proxy'}`;
    split[k] = (split[k] || 0) + 1;
  }
  console.log(`  P1: ${PROPS_DRAWN.length} drawn Props meshes · ${PROPS.length} colliders — ${JSON.stringify(split)}`);
  /* 20 → 21 and 9 → 10 under §729, and the newcomer keeps the structural fact this arm exists
     for: `props_kaykit` (the destructible models' swapped STATIC twins — 4 vault jars, 7
     courtyard baskets, one merged mesh) registers the drawn bucket itself, exactly as the other
     nine ground colliders do — `ground:is-drawn-art`, not a proxy. The count moved because a
     §729 design line added one mesh; the SPLIT shape is the pin that would catch a proxy
     sneaking in. (This arm went red on the swap's own commit and was updated to the measured
     truth — the before is recorded here, per the §712 precedent in P2 below.) */
  assert.equal(PROPS.length, 21, 'the Props collider count has moved');
  assert.deepEqual(split, {
    'ground:is-drawn-art': 10,
    'ground:separate-proxy': 1,
    'ledge:separate-proxy': 2,
    'hazard:separate-proxy': 8,
  }, 'the split between Props colliders that ARE drawn art and those that stand in for it has '
   + 'changed — every prop-vs-prop overlap number below is a different claim once it does');
});

test('P2: KayKit against Props art — seven placements, and six of them are floor contact', () => {
  /* ART into ART, stated as such. Measured exactly, on each placement's own yaw-rotated bounds
     against every drawn Props triangle, and split at 0.15 m above the placement's floor because
     a prop RESTING on something intersects it and that is not a finding. Getting that split wrong
     is what made the first wall-seam count 665 instead of 503.

     None of this is called a defect. A chest standing in a coin hoard is what a hoard looks like;
     the pin is here so the census cannot drift, and so the one placement that is BOTH deep and
     near a camera stays visible as the only one worth a frame. */
  const ALL = [];
  for (const m of PROPS_DRAWN) ALL.push(...meshTris(m));
  assert.ok(ALL.length > 0, 'gathered 0 drawn Props triangles');
  const rows = [];
  for (let i = 0; i < PLACE.length; i++) {
    const p = PLACE[i], { mesh, size } = placementBox(p);
    const b = aabbOf(mesh), inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const h = [size.x / 2, size.y / 2, size.z / 2];
    let base = 0, body = 0, bodyHi = 0;
    const who = {};
    for (const T of ALL) {
      if (T.hix < b.min.x || T.lox > b.max.x || T.hiy < b.min.y || T.loy > b.max.y || T.hiz < b.min.z || T.loz > b.max.z) continue;
      if (!triBox(h, inv, T.t)) continue;
      who[T.who] = (who[T.who] || 0) + 1;
      if (T.hiy - p.y < 0.15) base++;
      else { body++; bodyHi = Math.max(bodyHi, T.hiy - p.y); }
    }
    if (base + body) rows.push({ i, p, base, body, bodyHi, who: Object.keys(who).join(',') });
  }
  rows.sort((a, b) => (b.base + b.body) - (a.base + a.body));
  console.log(`  P2: ${ALL.length} drawn Props triangles · ${rows.length} of ${PLACE.length} placements touch them\n`
    + rows.map((r) => `     row ${String(r.i).padStart(2)} ${r.p.file.padEnd(18)} @(${r.p.x}, ${r.p.z})  `
      + `${String(r.base).padStart(4)} base + ${String(r.body).padStart(4)} body (to ${r.bodyHi.toFixed(2)} m)  [${r.who}]`).join('\n'));

  assert.equal(rows.length, 7, 'the number of KayKit placements touching drawn Props art has changed');
  /**
   * The order is by total overlap, so it is a RANKING and it moved when the coins were scaled
   * 50% larger (§712) — while the SET did not. Measured on both sides, everything else identical:
   *
   *   row  7  barrel_large @(20.6, 4)  [coins]   0 base +  40 body (to 1.03 m)  →  0 + 66 (1.11 m)
   *
   * That is the only row that changed at all, its source is `[coins]`, and 40 → 66 lifts it past
   * row 16 (62) and row 22 (58) from last place to fifth. Nothing started or stopped touching:
   * `rows.length` is 7 before and after and the seven indices are the same seven.
   *
   * The pin is deliberately kept order-sensitive rather than softened to a set comparison. This
   * arm exists so the census cannot drift silently, and a ranking that reshuffles is exactly the
   * signal that some prop's footprint changed — which is what happened here, on purpose.
   *
   * AND IT FIRED AGAIN UNDER §729, which is the pin doing its job a second time. The
   * destructibles swap put KayKit bodies on the static twins — the vault's offering-table jars
   * became conformed `barrel_small`s (0.36 m of canopic jar → 0.62–0.75 m of barrel) and the
   * courtyard wall baskets became knee-high barrels on the merged `props_kaykit` mesh, which
   * this file's own `PROPS_DRAWN` regex rightly counts as drawn Props art. Same seven indices
   * before and after — nothing started or stopped touching — but THREE rows changed contents
   * and one changed rank, measured on both sides:
   *
   *   row 22  coin_stack_large @(-2.4, -68.6)  58 body [props_stone]  →  9 base + 124 body
   *           to 1.17 m [props_stone,props_kaykit] — the fatter vault barrels beside the tomb
   *           coin stack; last place → fifth, the one rank move.
   *   row 33  crates_stacked @(-5.5, 30.5)     [props_lime]  →  113 + 429 [props_kaykit] —
   *           the same mid-floor courtyard basket it always stood in, wearing its new body.
   *   row  4  crates_stacked @(-20.8, 6.5)     picks up props_kaykit beside props_stone —
   *           a swapped wall basket in the west store line.
   */
  assert.deepEqual(rows.map((r) => r.i), [18, 21, 33, 4, 22, 7, 16], 'a different set of placements now touches Props art');

  /* the one the whole category was opened over, and the correction to it */
  const chest = rows.find((r) => r.i === 21);
  assert.ok(chest.base > 8 * chest.body,
    `the row-21 chest is now ${chest.base} base / ${chest.body} body; it was 555/60, which is what `
    + 'makes it a chest standing in a hoard rather than a chest buried in one');
  assert.ok(chest.bodyHi < 0.30,
    `the row-21 chest now has Props art up to ${chest.bodyHi.toFixed(2)} m up its side, against 0.19 m`);

  /* and the only one that is both deep and near a camera — 0.52 m of body at 8 m in `sly-profile`,
     which is the same placement C4 pins. If anything here ever earns a frame, it is this. */
  const near = rows.find((r) => r.i === 33);
  assert.ok(near, 'the courtyard camera crate no longer touches Props art');
  assert.ok(near.body > 100 && near.bodyHi > 0.3,
    `the courtyard crate's overlap has shrunk to ${near.body} body triangles reaching ${near.bodyHi.toFixed(2)} m; `
    + 'good, and this arm should then stop calling it the one worth looking at');
});

test('P3: the coin scatter has no clearance test, and misses a barrel by 20 mm', () => {
  /* THE ONE OVERLAP WITH A GAMEPLAY OBJECT ON ONE SIDE, and the reason to ask about Props art at
     all rather than only about Props colliders. `Props._collectibles` places 34 coins at
     `R.range(-22, 22) x R.range(0.6, 1.2) x R.range(-14, 32)` — scatter, with no test against
     anything, and KayKit's solid props were placed years of commits later.

     Measured: no collectible CENTRE is inside a KayKit solid. The nearest misses by 0.020 m, and
     a coin is drawn at radius 0.16, so most of that disc is inside a barrel. The consequence is
     measured rather than assumed, and it is not what it looks like: `Pickups.stepPickup` magnets
     a coin at 2.40 m and moves it with NO collision test, while a capsule pressed against a 1.8 m
     barrel stands about 1.2 m from its centre. So the coin is still collected — it is pulled out
     THROUGH the staves. The cost is a look cost, not a lost pickup, and saying which is the whole
     job of this arm. */
  const sets = [];
  ENGINE.scene.traverse((o) => { if (o.isInstancedMesh && (o.name === 'coins' || o.name === 'clue_bottles')) sets.push(o); });
  assert.ok(sets.length > 0, 'inspected 0 collectible instance meshes');
  const centres = [];
  for (const s of sets) {
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (let i = 0; i < s.count; i++) {
      s.getMatrixAt(i, m); m.premultiply(s.matrixWorld);
      centres.push({ set: s.name, i, pos: p.setFromMatrixPosition(m).clone() });
    }
  }
  assert.ok(centres.length > 0, 'inspected 0 collectible instances');

  let nearest = Infinity, who = null, host = null, insideCount = 0;
  for (const c of centres) {
    for (const r of KK) {
      const g = r.mesh.geometry.parameters;
      const l = c.pos.clone().applyMatrix4(new THREE.Matrix4().copy(r.mesh.matrixWorld).invert());
      const dx = Math.abs(l.x) - g.width / 2, dy = Math.abs(l.y) - g.height / 2, dz = Math.abs(l.z) - g.depth / 2;
      if (dx < 0 && dy < 0 && dz < 0) insideCount++;
      const d = Math.hypot(Math.max(0, dx), Math.max(0, dy), Math.max(0, dz));
      if (d < nearest) { nearest = d; who = c; host = r; }
    }
  }
  const g = host.mesh.geometry.parameters;
  const standoff = Math.hypot(g.width, g.depth) / 2 + PICK.playerRadius;
  const reach = Math.hypot(standoff, Math.abs(who.pos.y - PICK.grabHeight));
  console.log(`  P3: ${centres.length} collectibles · ${insideCount} with their centre inside a KayKit solid · `
    + `closest ${who.set}#${who.i} at ${nearest.toFixed(3)} m from the collider at `
    + `(${host.mesh.position.x.toFixed(1)}, ${host.mesh.position.z.toFixed(1)})`);
  console.log(`  P3: a capsule pressed against that prop stands ${standoff.toFixed(2)} m out; centre-to-coin `
    + `${reach.toFixed(2)} m against a ${PICK.magnet} m magnet — collectible, pulled through the prop`);

  assert.equal(insideCount, 0,
    `${insideCount} collectible(s) now sit with their centre inside a solid KayKit collider. That is `
    + 'still collectible — the magnet moves them with no collision test — but it is a pickup the '
    + 'player cannot see until it flies out of a barrel, and the scatter that placed it tests nothing');
  assert.ok(nearest < 0.05,
    `the closest collectible is now ${nearest.toFixed(3)} m from a solid prop; it was 0.020 m, and the `
    + 'point of this arm is that 20 mm is luck rather than clearance — if the number has GROWN, a '
    + 'clearance test has appeared somewhere and this should be re-read, not just re-pinned');
  assert.ok(nearest < PICK.coinRadius,
    `the nearest collectible clears every solid by ${nearest.toFixed(3)} m, which now exceeds the coin's `
    + `own ${PICK.coinRadius} m radius — the disc no longer intersects the prop and the look defect is gone`);
  /* the reachability arithmetic, asserted so "still collectible" is not an opinion */
  assert.ok(reach <= PICK.magnet,
    `a capsule pressed against that prop is ${reach.toFixed(2)} m from the coin against a ${PICK.magnet} m `
    + 'magnet — the coin has become genuinely unreachable and this is a lost pickup, not a look defect');
  assert.ok(reach > PICK.collect,
    'the coin is now within the collect radius from outside the prop, so it is taken without the '
    + 'magnet ever running and the pull-through this arm describes does not happen');
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
