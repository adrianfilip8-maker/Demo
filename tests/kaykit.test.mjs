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
import { bootKayKit, readPlacements, KAYKIT_SRC } from './_kaykitboot.mjs';

const { kaykit: K, lib: LIB, REG: ALLREG } = await bootKayKit({ withLevel: true });
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
const faceAxes = (mesh) => {
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : p.count, set = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    const ax = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (ax.lengthSq() < 1e-12) continue;
    ax.applyMatrix3(nm).normalize();
    if (!set.some((s) => Math.abs(s.dot(ax)) > 0.9999)) set.push(ax);
  }
  return set;
};
const span = (vs, ax) => {
  let lo = Infinity, hi = -Infinity;
  for (const v of vs) { const d = v.dot(ax); if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
};
/**
 * Signed separation: > 0 is a gap in metres, <= 0 is a penetration depth.
 *
 * WHICH WAY THIS IS UNSOUND, because it decides what the arms below may conclude. The axis set is
 * face normals only — a complete SAT for two convex polyhedra also needs the edge-edge cross
 * products. Omitting them can only cause a separating axis to be MISSED, never invented, so:
 *
 *     result > 0   ->  the two solids are provably disjoint          (sound, safe to seal on)
 *     result <= 0  ->  they may or may not overlap                   (conservative)
 *
 * A1 and A2 assert absence, so they lean on the sound direction and can only ever over-report.
 * That is also why A-CALIB may state flatly that the two AABB hits are artifacts: a positive gap
 * was found for both, and a found axis is proof.
 */
function separation(mA, mB) {
  const va = worldVerts(mA), vb = worldVerts(mB);
  let best = -Infinity;
  for (const ax of [...faceAxes(mA), ...faceAxes(mB)]) {
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
  const real = Math.min(...KK.map((r) => separation(r.mesh, pole.mesh)));
  console.log(`  A2 calib: a crate planted at "${pole.mesh.name}"'s centre scores ${sep.toFixed(3)} m; `
    + `the nearest shipped crate to that pole is ${real.toFixed(3)} m clear`);
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
  const others = Object.keys(SHOTS).filter((s) => s !== 'interior').map((s) => nearest(s).d);
  const runnerUp = Math.min(...others);
  assert.ok(runnerUp - interior.d > 12,
    `the banner claims a gap between interior and everything else; the runner-up is now `
    + `${runnerUp.toFixed(2)} m against interior's ${interior.d.toFixed(2)} m`);
  /* "`temple` has ONE in its cone, at 35.2 m" */
  const [cTemple] = claim(/`temple` has ONE in its cone, at ([\d.]+) m/, 'temple distance');
  assert.equal(temple.n, 1, `temple sees ${temple.n} of the thirty, comment says ONE`);
  agrees(temple.d, cTemple, 0.06, 'temple\'s one prop');
  /* "`sly-key`'s nearest is 24.99 m", the near-miss the banner records as a rounding coin-flip */
  const [cKey] = claim(/`sly-key`'s nearest is ([\d.]+) m/, 'sly-key nearest');
  agrees(nearest('sly-key').d, cKey, 0.02, 'sly-key nearest');
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
