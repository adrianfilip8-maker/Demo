/**
 * vegwater.test.mjs — the first instrument to exercise `Vegetation` and `Water`.
 *
 * ── the premise, which is §395's one round later ──────────────────────────────────────────────
 * KNOWN_ISSUES §393.2 established that these two are sub-modules rather than MANIFEST entries:
 * `Terrain.js` constructs them, they read `terrain.tune` / `terrain.tex()` / `terrain.mat()`
 * unguarded, and "there is no way to boot either without a Terrain". That is TRUE. The inference
 * everybody drew from it — that they therefore could not be measured — is the same inference
 * §395 just retired for KayKit, and it is wrong for the same reason.
 *
 * **You boot the Terrain.** It already carries its own headless canvas (`Terrain.js:704-729`,
 * written after a missing `document` cost the entire sand mesh), so the whole chain builds in
 * plain Node in about two seconds with zero warnings, and both children run their real `init()`
 * against a real parent. Nothing here is stubbed except the engine's service lookups.
 *
 * This is the distinction worth keeping: "cannot be constructed standalone" is a fact about these
 * two files, and "cannot be measured" was a claim laid on top of it that nobody checked. §395.1's
 * rule generalises — *"this cannot be measured" has the same shelf life as any other claim, and it
 * is the one claim that, believed, guarantees nothing downstream of it gets checked.*
 *
 * ── attribution ──────────────────────────────────────────────────────────────────────────────
 * `registerCollider` says nothing about who called it, so the two children's `init()` are wrapped
 * to stamp an owner. That is how the five colliders §393.2 counted are split three ways here, and
 * it is what lets these arms be about VEGETATION and WATER rather than about Terrain.
 *
 * Every data-driven arm asserts a non-zero inspected count (§211.1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

const VEG_SRC = readFileSync(new URL('../src/world/Vegetation.js', import.meta.url), 'utf8');

const REG = [], WARN = [];
let owner = 'terrain';
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {},
  warn: (m) => WARN.push(String(m)), get: () => null, has: () => false,
  on: () => () => {}, emit: () => {},
  registerCollider: (mesh, opts) => REG.push({ mesh, opts, owner }),
};

const { Terrain } = await import('../src/world/Terrain.js');
const { Vegetation } = await import('../src/world/Vegetation.js');
const { Water } = await import('../src/world/Water.js');
const { Collision } = await import('../src/world/Collision.js');

const vInit = Vegetation.prototype.init;
Vegetation.prototype.init = async function (...a) {
  owner = 'vegetation';
  try { return await vInit.apply(this, a); } finally { owner = 'terrain'; }
};
const wInit = Water.prototype.init;
Water.prototype.init = async function (...a) {
  owner = 'water';
  try { return await wInit.apply(this, a); } finally { owner = 'terrain'; }
};

/* the palm scatter, captured before the instancing loop erases which spot is which */
let PALM_SPOTS = null;
const origScatter = Vegetation.prototype._scatterPalms;
Vegetation.prototype._scatterPalms = function (rand) {
  const out = origScatter.call(this, rand);
  PALM_SPOTS = out;
  return out;
};

const T = new Terrain(engine);
await T.init();
Vegetation.prototype.init = vInit;
Water.prototype.init = wInit;
Vegetation.prototype._scatterPalms = origScatter;

const V = T.vegetation, W = T.water;
const VEG = REG.filter((r) => r.owner === 'vegetation');
const WAT = REG.filter((r) => r.owner === 'water');

/* a real Collision, so the affordance arms measure what the game builds rather than a model of it */
const C = new Collision(engine);
for (const r of REG) C.add({ mesh: r.mesh, ...r.opts });
C.build();

console.log(`\n[vegwater] Terrain booted headless, document=${typeof document}: `
  + `${REG.length} colliders (terrain ${REG.length - VEG.length - WAT.length}, vegetation ${VEG.length}, water ${WAT.length}), `
  + `${WARN.length} warnings, counts ${JSON.stringify(V.counts)}\n`);

/** The number a TUNE field states, read from the source. */
function tuneValue(key) {
  const m = new RegExp(`${key}:\\s*(\\d+)`).exec(VEG_SRC);
  assert.ok(m, `could not read TUNE.${key} out of Vegetation.js`);
  return +m[1];
}

/**
 * Pull a number out of `Vegetation.js`'s own comment text — §395.3's standard.
 *
 * Any figure that appears BOTH here and in a source comment is read from the comment, so the two
 * cannot drift apart in either direction. Figures that exist only as measurements stay as literals
 * below: those are pins on the world, not claims about it. Getting that split wrong is what made
 * round 12's first comment arms useless, and a planted edit caught it there too.
 */
function claim(re, label) {
  const m = re.exec(VEG_SRC);
  assert.ok(m, `could not find the claim "${label}" in Vegetation.js — the comment was reworded, so `
    + 'this arm is no longer checking anything and must be re-anchored');
  return m.slice(1).map(Number);
}
function agrees(measured, claimed, tol, what) {
  assert.ok(Math.abs(measured - claimed) <= tol,
    `${what}: the comment says ${claimed}, measurement says ${measured.toFixed(4)} (tolerance ${tol})`);
}

/* ======================= 1. the boot, and what each child registers ======================= */

test('S1: both sub-modules ran their real init against a real Terrain, with no warnings', () => {
  assert.equal(typeof document, 'undefined', 'a DOM appeared — this is not the headless path');
  assert.ok(V && W, 'Terrain did not construct its children');
  assert.deepEqual(WARN, [], `Terrain booted with warnings, so something silently degraded:\n  ${WARN.join('\n  ')}`);
  assert.ok(V.group.children.length > 0, 'vegetation added no meshes');
  assert.ok(W.mesh, 'water built no mesh');
  /* §393.2 counted five colliders for TERRAIN and named their split. That is the claim. */
  assert.equal(REG.length, 5, 'TERRAIN registers five colliders in total (§393.2)');
});

test('S2: the five colliders split 1 ground / 1 water / 3 misc, by owner', () => {
  const tag = (arr) => arr.map((r) => r.opts?.tag).sort();
  const ter = REG.filter((r) => r.owner === 'terrain');
  console.log(`  S2: terrain ${JSON.stringify(tag(ter))} · water ${JSON.stringify(tag(WAT))} · vegetation ${JSON.stringify(tag(VEG))}`);
  assert.ok(REG.length > 0, 'inspected 0 registrations');
  assert.deepEqual(tag(ter), ['ground'], 'Terrain itself registers the desert');
  assert.deepEqual(tag(WAT), ['water'], 'WATER registers the Nile');
  assert.deepEqual(tag(VEG), ['misc', 'misc', 'misc'], 'VEGETATION registers one trunk batch per palm variant');
  assert.deepEqual(VEG.map((r) => r.opts?.material), ['wood', 'wood', 'wood'], 'trunk material');
  assert.deepEqual(WAT.map((r) => r.opts?.material), ['water'], 'water material');
  /* every vegetation collider is an InstancedMesh, which is the whole subject of A2 below */
  for (const r of VEG) assert.ok(r.mesh.isInstancedMesh, 'a vegetation collider stopped being instanced');
  assert.equal(VEG.reduce((s, r) => s + r.mesh.count, 0), V.counts.palms,
    'the three trunk batches must account for every palm');
});

/* ============================ 2. the counts nobody had checked ============================ */

test('D1: TUNE names an intent, not an outcome — 37 palms against palmCount 74', () => {
  /* The comment on the palm block used to say "repeated 74 times". `palmCount` is a CAP: the
     scatter offers 44 bank + 22 dune + 8 framing = 74 candidates and `slice(0, 74)` truncates
     nothing, so what ships is whatever survives the water and slope filters. */
  const cap = tuneValue('palmCount');
  const [claimed] = /level ships (\d+)\s*\n?\s*\*?\s*palms, not (\d+)/.exec(VEG_SRC)?.slice(1) ?? [];
  console.log(`  D1: palms ${V.counts.palms} (TUNE.palmCount ${cap}) · papyrus ${V.counts.papyrus} `
    + `(TUNE.papyrusClumps ${tuneValue('papyrusClumps')}) · tufts ${V.counts.tufts} (TUNE.tuftCount ${tuneValue('tuftCount')})`);
  assert.ok(V.counts.palms > 0, 'inspected 0 palms');
  assert.equal(cap, 74, 'TUNE.palmCount');
  assert.equal(V.counts.palms, 37, 'palms actually placed');
  assert.ok(claimed !== undefined && +claimed === V.counts.palms,
    `the comment states ${claimed} palms, the level places ${V.counts.palms}`);
  assert.ok(V.counts.palms < cap, 'the cap has never bound; if it now does, the comment is wrong again');
  /* the same shape one field down */
  assert.equal(tuneValue('papyrusClumps'), 58, 'TUNE.papyrusClumps');
  assert.equal(V.counts.papyrus, 28, 'papyrus clumps actually placed');
  const [cPap] = /`papyrusClumps: 58` delivers \*\*(\d+)\*\*/.exec(VEG_SRC)?.slice(1) ?? [];
  assert.ok(cPap !== undefined && +cPap === V.counts.papyrus,
    `the comment states ${cPap} papyrus clumps, the level places ${V.counts.papyrus}`);
  /* tufts DO hit their target, which is what makes the other two legible as a shortfall */
  assert.equal(V.counts.tufts, tuneValue('tuftCount'), 'tufts reach their TUNE count');
});

test('D2: one of the eight hand-placed framing palms is silently thrown away', () => {
  /* The eight are described as "placed by eye for the `hero`, `courtyard` and `dunes` cameras".
     `push` drops any candidate on slope > 0.55 and says nothing, and (36, 46) is on a 0.625
     flank. This arm exists because an authored placement discarded in silence is exactly the
     class of defect the last two rounds have been about — nothing counts what `push` refused. */
  const FRAMING = [[-33, 44], [-38, 30], [36, 46], [31, 62], [-30, 70], [42, 24], [-44, 12], [46, 68]];
  assert.ok(PALM_SPOTS?.length > 0, 'inspected 0 palm spots');
  const rows = FRAMING.map(([x, z]) => {
    const y = T.heightAt(x, z);
    const slope = T.slopeAt(x, z);
    let nearest = Infinity;
    for (const s of PALM_SPOTS) nearest = Math.min(nearest, Math.hypot(s.x - x, s.z - z));
    return { x, z, slope, blocked: V._blocked(x, z, y), nearest };
  });
  /* the jitter is +/-1.6 m, so "landed" means a palm within jitter range of the named spot */
  const dropped = rows.filter((r) => r.nearest > 1.6 * Math.SQRT2);
  console.log(`  D2: ${rows.length} framing palms, ${dropped.length} dropped — `
    + rows.map((r) => `(${r.x},${r.z}) slope ${r.slope.toFixed(3)} nearest ${r.nearest.toFixed(2)} m`).join(' · '));
  assert.equal(dropped.length, 1, 'the number of framing palms that fail to land has changed');
  assert.equal(`${dropped[0].x},${dropped[0].z}`, '36,46', 'a different framing palm is now the one that fails');
  assert.ok(dropped[0].slope > 0.55, 'the drop is no longer attributable to the slope filter');
  const [cNear] = claim(/that does land is ([\d.]+) m away/, 'the gap left by the dropped framing palm');
  agrees(dropped[0].nearest, cNear, 0.05, 'nearest palm to the dropped framing spot');
  const [cSlope] = claim(/dune flank of slope ([\d.]+)/, 'the dropped palm\'s slope');
  agrees(dropped[0].slope, cSlope, 0.002, 'slope at the dropped framing spot');
  const [cSurv] = claim(/land within ([\d.]+) m of their named coordinate/, 'the surviving-seven margin');
  const worstSurv = Math.max(...rows.filter((q) => q !== dropped[0]).map((q) => q.nearest));
  agrees(worstSurv, cSurv, 0.02, 'worst offset among the seven that land');
  /* and the seven that do land, land where they were asked to */
  for (const r of rows.filter((q) => q !== dropped[0])) {
    assert.ok(r.nearest <= 1.6 * Math.SQRT2, `framing palm (${r.x}, ${r.z}) landed ${r.nearest.toFixed(2)} m off`);
  }
});

/* ==================== 3. the affordance phantom the comment denied ==================== */

test('A1: every palm trunk really is solid in the BVH — the half of the comment that holds', () => {
  /* `BVH.js:326-333` walks an InstancedMesh's `count` and applies each instance matrix, so the
     trunks are real triangles wherever the palms actually stand. Probed at the palms themselves
     rather than inferred from the triangle total. */
  assert.ok(C.bvh?.triCount > 0, 'the BVH built no triangles');
  const spots = PALM_SPOTS.slice(0, 12);
  let solid = 0;
  for (const s of spots) {
    const hits = C.overlap(new THREE.Vector3(s.x, s.y + 1.2, s.z), 1.4, ['misc']);
    if (hits.some((r) => r.tag === 'misc')) solid++;
  }
  console.log(`  A1: ${solid}/${spots.length} sampled palm positions report a solid \`misc\` trunk; BVH ${C.bvh.triCount} tris`);
  assert.ok(spots.length > 0, 'inspected 0 palm spots');
  assert.ok(solid >= spots.length - 1,
    `only ${solid} of ${spots.length} palm positions are solid — "keeps every trunk solid in the BVH" `
    + 'is the load-bearing half of the trunk comment and it has stopped being true');
});

test('A2: and three phantom `misc` boxes sit at the world origin — the half that did not', () => {
  /* `Collision.js:902-906` builds a rec's world box from `geometry.boundingBox` times the mesh's
     own `matrixWorld`, so for an InstancedMesh it describes ONE instance at the group origin.
     `_addBoxEntry` is tag-agnostic, so `misc` gets that box as an affordance. The comment said
     `misc` "registers no affordance"; it registers three, all in the wrong place.

     Pinned rather than barred: nothing in `src/` queries `afford('misc')` and solidity comes from
     the BVH, so this is inert today. It is the same mechanism that already shipped one real bug
     with `pole`, and Collision warns for line tags and is silent for box tags. */
  const aff = C._aff.filter((a) => a.rec?.tag === 'misc');
  assert.equal(aff.length, 3, 'expected one box affordance per trunk batch');
  const rows = [];
  for (const a of aff) {
    const m = a.rec.mesh;
    const size = new THREE.Vector3(); a.box.getSize(size);
    m.computeBoundingBox();
    const trueBox = m.boundingBox.clone().applyMatrix4(m.matrixWorld);
    const trueSize = new THREE.Vector3(); trueBox.getSize(trueSize);
    rows.push({ size, trueSize, centre: a.box.getCenter(new THREE.Vector3()) });
  }
  rows.sort((a, b) => a.size.y - b.size.y);
  console.log('  A2: ' + rows.map((r) => `[${r.size.toArray().map((v) => v.toFixed(1)).join('x')} at origin `
    + `vs ${r.trueSize.toArray().map((v) => v.toFixed(0)).join('x')} spanned]`).join(' '));

  for (const r of rows) {
    /* HORIZONTAL distance: these boxes span y 0..11, so their centre is 5.5 m up by construction
       and a 3D length would be measuring the trunk's own height, not its displacement. */
    const off = Math.hypot(r.centre.x, r.centre.z);
    assert.ok(off < 2.0,
      `a trunk affordance is centred ${off.toFixed(1)} m from the origin in plan — if these have `
      + 'started following their instances, three\'s bounds behaviour changed and the comment needs revisiting');
    assert.ok(r.trueSize.x / r.size.x > 50 && r.trueSize.z / r.size.z > 50,
      'the affordance box now covers a real fraction of the grove, so it is no longer a phantom');
  }
  /* the three box sizes the comment states, read from it. The 11.0 m one is the same ~11 m the
     comment already describes from the `pole` era — the tell that the mechanism was never fixed,
     only re-tagged. */
  const [a0, b0, c0, a1, b1, c1, a2, b2, c2] = claim(
    /sized\s*\n?\s*\*?\s*([\d.]+) x ([\d.]+) x ([\d.]+), ([\d.]+) x ([\d.]+) x ([\d.]+) and ([\d.]+) x ([\d.]+) x ([\d.]+) m/,
    'the three phantom box sizes');
  const stated = [[a0, b0, c0], [a1, b1, c1], [a2, b2, c2]];
  for (let i = 0; i < 3; i++) {
    agrees(rows[i].size.x, stated[i][0], 0.05, `phantom ${i} width`);
    agrees(rows[i].size.y, stated[i][1], 0.05, `phantom ${i} height`);
    agrees(rows[i].size.z, stated[i][2], 0.05, `phantom ${i} depth`);
  }

  /* and the consequence check: nothing is actually solid at the origin */
  const atOrigin = C.overlap(new THREE.Vector3(0, 5, 0), 1.0, null);
  console.log(`  A2: solids within 1 m of (0, 5, 0): ${atOrigin.length}`);
  assert.equal(atOrigin.length, 0,
    'something is now solid at the world origin, which is where the phantom trunk boxes live — '
    + 'the phantom has stopped being inert');
});

/* ============================== 4. Water ============================== */

test('W1: the Nile is one collider, spanning the tune it is built from', () => {
  const m = W.mesh;
  m.geometry.computeBoundingBox();
  const bb = m.geometry.boundingBox;
  const T2 = T.tune;
  console.log(`  W1: nile ${bb.min.toArray().map((v) => v.toFixed(0))} .. ${bb.max.toArray().map((v) => v.toFixed(0))} at y ${T2.waterY}`);
  assert.equal(WAT.length, 1, 'the Nile is a single registration');
  assert.equal(m.name, 'nile', 'the water mesh name is what a collider dump identifies it by');
  /* built from `nileFar` .. `nileEast + 6`, so the bounds are a claim about the tune */
  assert.ok(Math.abs(bb.min.x - T2.nileFar) < 1e-6, `west edge ${bb.min.x} should be tune.nileFar ${T2.nileFar}`);
  assert.ok(Math.abs(bb.max.x - (T2.nileEast + 6)) < 1e-6, `east edge ${bb.max.x} should be nileEast + 6`);
  assert.ok(Math.abs(bb.min.y - T2.waterY) < 1e-6 && Math.abs(bb.max.y - T2.waterY) < 1e-6,
    'the water plane is flat at tune.waterY');
});

test('W2: the water rec is a VOLUME with zero thickness, and that is a distance test not a containment test', () => {
  /* `Collision.js:917` routes `water` into `_volumes`, which are "tested as boxes, not as
     triangles". The box here is 212 x 0 x 760 m — a plane. That works only because
     `_volumeDistance` returns a DISTANCE and `overlap` accepts `<= radius`; a containment test
     would never report the player as in the river at all.

     Recorded, not judged: what SHOULD happen when Sly is 3 m under the surface is a MOVEMENT
     question, and this lane is not the one to answer it. What is measurable is that detection
     falls off with depth rather than persisting, which is a property nobody had written down. */
  const rec = C.recs.find((r) => r.tag === 'water');
  assert.ok(rec, 'no water rec reached Collision');
  const s = new THREE.Vector3(); rec._world.getSize(s);
  assert.ok(s.y < 1e-6, `the water volume is ${s.y.toFixed(3)} m thick; this arm describes a plane`);

  const surface = new THREE.Vector3(-100, T.tune.waterY, 0);
  const probe = (dy, r) => C.overlap(new THREE.Vector3(surface.x, surface.y + dy, surface.z), r, ['water'])
    .some((q) => q.tag === 'water');
  const atSurface = probe(0, 0.35);
  const shallow = probe(-0.3, 0.35);
  const deep = probe(-3.0, 0.35);
  console.log(`  W2: water detected — at surface ${atSurface}, 0.3 m under ${shallow}, 3 m under ${deep}`);
  assert.ok(atSurface, 'the river is not detected at its own surface');
  assert.ok(shallow, 'the river is not detected just under the surface');
  assert.equal(deep, false,
    'the river is now detected 3 m down, so the zero-thickness plane has gained depth — good, but '
    + 'this arm recorded the opposite and the note above needs rewriting');
});

/* ====================== 5. clone family, asked of the grove ====================== */

test('D3: the grove is not a clone family — three variants, and per-instance scale', () => {
  /* The KayKit question, asked here. KayKit failed it: 36 placements at `Vector3(1,1,1)`, so
     repeats differed in yaw alone. Vegetation passes it, and by a different mechanism than the
     comment claims credit for — three geometries is the small part, continuous per-instance
     scale is the large one. */
  const scales = PALM_SPOTS.map((s) => s.scale);
  const yaws = PALM_SPOTS.map((s) => s.yaw);
  const mean = scales.reduce((a, b) => a + b, 0) / scales.length;
  const cv = Math.sqrt(scales.reduce((a, b) => a + (b - mean) ** 2, 0) / scales.length) / mean;
  console.log(`  D3: ${VEG.length} geometry variants over ${PALM_SPOTS.length} palms; `
    + `scale ${Math.min(...scales).toFixed(2)}–${Math.max(...scales).toFixed(2)} (CV ${cv.toFixed(4)}), `
    + `${new Set(yaws.map((y) => y.toFixed(4))).size} distinct yaws`);
  assert.ok(PALM_SPOTS.length > 0, 'inspected 0 palms');
  assert.equal(VEG.length, 3, 'three trunk variants');
  /* basketvary's rope-coil bar is a bbox-diagonal CV >= 0.12; palm scale is the same quantity */
  assert.ok(cv >= 0.12, `palm scale CV ${cv.toFixed(4)} < 0.12 — the grove has become a clone family`);
  assert.equal(new Set(yaws.map((y) => y.toFixed(4))).size, PALM_SPOTS.length, 'every palm has its own yaw');
});

test('D4: the palm scatter has no spacing rule, and one pair of trunks grows through another', () => {
  /* THE OVERLAP QUESTION, ASKED OF THE GROVE. `_scatterPalms` filters on water and on slope and
     on nothing else — there is no minimum-separation check anywhere in the file — so whether two
     palms interpenetrate is left to the seed. The seed is fixed (`rng(0x9a17e5)`), so the answer
     is deterministic, and it is: **one pair does, by 0.133 m.**

     The bar is DERIVED, not picked. Round 12's first attempt at this arm used a hand-chosen 0.9 m
     centre-to-centre minimum and it failed on HEAD at 0.820 m, which is what a picked number does.
     The quantity that means something is trunk surface clearance: each variant's own base radius,
     measured off its geometry's lowest 0.5 m, scaled by that instance's scale. Two trunks touch
     at exactly 0 and interpenetrate below it, and no tuning enters.

     Pinned, not barred. It is one pair in 666, it is 0.133 m out of a 0.953 m combined width, and
     a date grove with two trunks forking from one clump is not obviously wrong — that needs a
     frame. What the pin buys: the count cannot grow and the depth cannot deepen unremarked, and
     the absent spacing rule is now written down where the next person to touch TUNE will see it. */
  const radii = VEG.map((r) => {
    const g = r.mesh.geometry, p = g.attributes.position;
    g.computeBoundingBox();
    const y0 = g.boundingBox.min.y;
    let b = 0;
    for (let i = 0; i < p.count; i++) if (p.getY(i) <= y0 + 0.5) b = Math.max(b, Math.hypot(p.getX(i), p.getZ(i)));
    return b;
  });
  assert.equal(radii.length, 3, 'expected three trunk variants');
  assert.ok(radii.every((v) => v > 0.2 && v < 1.0), `implausible trunk base radii: ${radii.map((v) => v.toFixed(3))}`);
  assert.ok(!/minSpacing|minDist|separation/i.test(VEG_SRC),
    'Vegetation.js has gained something that looks like a spacing rule — this arm describes a file '
    + 'that has none, and its whole framing needs revisiting');

  /* palm k is assigned to variant k % 3 by `perVariant[i % 3]` in init() */
  let worst = Infinity, pair = null, colliding = 0, pairs = 0;
  for (let i = 0; i < PALM_SPOTS.length; i++) {
    for (let j = i + 1; j < PALM_SPOTS.length; j++) {
      pairs++;
      const d = Math.hypot(PALM_SPOTS[i].x - PALM_SPOTS[j].x, PALM_SPOTS[i].z - PALM_SPOTS[j].z);
      const need = radii[i % 3] * PALM_SPOTS[i].scale + radii[j % 3] * PALM_SPOTS[j].scale;
      const clear = d - need;
      if (clear < 0) colliding++;
      if (clear < worst) { worst = clear; pair = { i, j, d, need }; }
    }
  }
  console.log(`  D4: ${pairs} pairs · ${colliding} interpenetrating · tightest ${worst.toFixed(4)} m `
    + `(palms ${pair.i}/${pair.j}, centres ${pair.d.toFixed(3)} m, combined trunk width ${pair.need.toFixed(3)} m)`);
  assert.ok(pairs > 0, 'inspected 0 pairs');
  assert.equal(colliding, 1, 'the number of interpenetrating palm pairs has changed');
  assert.ok(Math.abs(worst + 0.133) < 0.005, `deepest interpenetration is ${(-worst).toFixed(4)} m, recorded 0.133 m`);
});

test('D4 CALIBRATION: two palms stacked on one spot ARE caught', () => {
  /* MUST FIRE. D4 counts interpenetrations, so the lever is one more of them: the tightest real
     pair moved onto a shared coordinate, scored by the same arithmetic. */
  const radii = [0.362, 0.4417, 0.5404];
  const a = { x: 10, z: 10, scale: 1.0 }, b = { x: 10.05, z: 10.0, scale: 1.0 };
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  const need = radii[0] * a.scale + radii[1] * b.scale;
  const clear = d - need;
  console.log(`  D4 calib: two palms 0.05 m apart score ${clear.toFixed(4)} m clearance (D4 counts anything < 0)`);
  assert.ok(clear < 0, `two coincident palms scored ${clear.toFixed(4)} m, which D4 would count as clear`);
});

test('D3 CALIBRATION: a grove of clones IS caught by the same statistic', () => {
  /* MUST FIRE. D3 asserts variety, so the lever is uniformity: the same palm spots with the
     scale jitter removed, which is what `_scatterPalms` would produce if the `rand.range(0.8,
     1.3)` were ever replaced by a constant. It must fail D3's own CV bar. */
  const flat = PALM_SPOTS.map(() => 1.0);
  const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
  const cv = Math.sqrt(flat.reduce((a, b) => a + (b - mean) ** 2, 0) / flat.length) / mean;
  const real = (() => {
    const s = PALM_SPOTS.map((p) => p.scale);
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    return Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length) / m;
  })();
  console.log(`  D3 calib: a uniform-scale grove scores CV ${cv.toFixed(4)} against the shipped ${real.toFixed(4)} (bar 0.12)`);
  assert.ok(cv < 0.12, `a uniform grove scored CV ${cv.toFixed(4)}, which D3's bar would ACCEPT`);
  assert.ok(real >= 0.12, 'the shipped grove should be on the passing side of the same bar');
});

/* ============================ 5. what TERRAIN buries ============================
   These arms are not about Vegetation or Water. They are here because this is the file that
   boots a real `Terrain`, and the defect they measure is a TERRAIN-against-ARCHITECTURE one that
   no instrument in the project could see: `EgyptLevel` authors against y = 0 — "everything in
   this file is authored against y = 0, which is right inside the stylobate" — and TERRAIN lays
   sand over the world afterwards. Nothing compares the two. */

const { Architecture } = await import('../src/world/Architecture.js');
const ARCH_ENGINE = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warn: () => {},
  get: () => null, has: () => false, on: () => () => {}, emit: () => {},
  registerCollider: (mesh, opts) => ARCH_REG.push({ mesh, opts }),
};
const ARCH_REG = [];
const ARCH = new Architecture(ARCH_ENGINE);
await ARCH.init();
for (const r of ARCH_REG) r.mesh.updateMatrixWorld(true);

test('T1: the vent mouth is buried under the dune, and its height is not what makes it so', () => {
  /* THE DIAGNOSIS THIS ARM WAS WRITTEN TO CORRECT. The mouth proxy at (-21, -0.2, -49.4) is
     `BoxGeometry(2.2, 0.6, 1.9)` while `Controller.TUNE.crawlHeight` is 0.64, and the obvious
     reading is that the aperture is 0.04 m too short for the capsule meant to pass through it.
     Measured, that reading is wrong twice over:

       1. `vent` is a VOLUME tag. `Collision.overlap` tests volume recs as boxes and never as
          triangles, and `Controller.inVent()` is a proximity test on the capsule BASE POINT
          against a `radius + 0.05` = 0.39 m sphere. **No capsule ever has to fit through this
          box.** Its height gates `Crawl.canEnter`, not passage, so comparing it to a capsule
          height is comparing two things that never meet. A ceiling probe over the whole mouth
          footprint reads OPEN — there is no solid aperture here at all.

       2. The mouth is 0.761 m UNDER the walkable surface. The column at (-21, -49.4) is
          sand 0.86 / hall paving 0.00, and the mouth's top face is at y 0.10. Raising it
          0.6 -> 1.2 lifts the top to 0.40 — still 0.46 m below the sand. The proposed fix does
          not reach, and would have looked like it landed because the arm that checks this did
          not exist.

     What actually makes `inVent()` true today is the NEXT segment down, the 1.2 m sloped run at
     z -54.5, whose top corner reaches y 0.59 — inside the 0.39 m sphere of a player standing on
     0.86 m sand. It fires in a 0.5 m band at z -49.50..-49.75 and nowhere else. The mouth proxy
     is inert: it contributes to nothing, at any height under 0.97 m. */
  const vents = ARCH_REG.filter((r) => r.opts?.tag === 'vent')
    .map((r) => ({ r, b: new THREE.Box3().setFromObject(r.mesh), h: r.mesh.geometry.parameters.height }));
  assert.ok(vents.length > 0, 'inspected 0 vent proxies — Architecture did not boot');
  assert.equal(vents.length, 4, 'the vent chain is no longer four segments');

  const mouth = vents.find((v) => Math.abs(v.r.mesh.position.z + 49.4) < 0.01);
  assert.ok(mouth, 'the vent mouth is no longer at z -49.4');
  const sand = T.heightAt(mouth.r.mesh.position.x, mouth.r.mesh.position.z);
  const gap = sand - mouth.b.max.y;
  console.log(`  T1: mouth top y ${mouth.b.max.y.toFixed(2)} (h ${mouth.h}) · sand ${sand.toFixed(3)} · `
    + `buried by ${gap.toFixed(3)} m · a 1.2 m mouth would still be ${(gap - 0.3).toFixed(3)} m under`);
  assert.ok(gap > 0,
    'the vent mouth now breaks the sand surface. That is the fix this arm was written to ask for — '
    + 'retire it and pin the new geometry instead of leaving it asserting a defect that is gone');
  assert.ok(gap > 0.3,
    `the mouth is only ${gap.toFixed(3)} m under the sand, so raising it to match its 1.2 m siblings `
    + 'would now surface it and that IS the cheap fix — this arm exists to say when that becomes true');

  /* The number a height-only fix would have to reach, derived under the convention the CODE uses.
     `A.proxy(geo, opts, { y })` fixes the box CENTRE, so growing the height grows it downward as
     much as upward — half of every metre added is spent digging. The first version of this line
     derived 0.97 m by holding the box FLOOR fixed, which is not what the call does, and it made a
     1.2 m mouth look like it would clear. It does not: centre -0.2 plus half of 1.2 puts the top
     at 0.40, and the threshold is sand - 0.39 = 0.47. It misses by 0.07 m — which is exactly the
     kind of near-miss that reads as a fix in a diff and changes nothing in the game. */
  const centreY = mouth.r.mesh.position.y;
  const threshold = sand - 0.39;
  const need = 2 * (threshold - centreY);
  console.log(`  T1: centre held at y ${centreY} · top must reach ${threshold.toFixed(2)} · `
    + `so a height-only fix needs >= ${need.toFixed(2)} m, and 1.2 m tops out at `
    + `${(centreY + 0.6).toFixed(2)} — short by ${(threshold - centreY - 0.6).toFixed(2)} m`);
  assert.ok(need > 1.2,
    `a ${need.toFixed(2)} m mouth would now reach, so matching the 1.2 m siblings has become a real fix `
    + 'and the recommendation recorded here is out of date');
  assert.ok(centreY + 0.6 < threshold,
    'a 1.2 m mouth now clears the inVent() threshold, so the cheap sibling-matching fix works and '
    + 'this arm should be saying so instead of warning against it');

  /* and the segment that is actually carrying the entrance */
  const slope = vents.find((v) => Math.abs(v.r.mesh.position.z + 54.5) < 0.01);
  assert.ok(slope, 'the sloped vent run is no longer at z -54.5');
  assert.ok(slope.b.max.y > sand - 0.39,
    `the sloped run's top is at ${slope.b.max.y.toFixed(2)} against a ${(sand - 0.39).toFixed(2)} m threshold — `
    + 'if it has dropped below, NOTHING makes inVent() true at the entrance and the crawl is unreachable');
});

test('T2: the drawn portal frames are 62 % under sand — the burial is the whole assembly', () => {
  /* The mouth proxy being low could be a proxy bug. The frames beside it exist "so the crawl reads
     as built, not as a hole in the maths", they are authored from y = 0, and if they are under the
     same sand then the authored intent was floor level and TERRAIN covered the lot. That is the
     difference between a wrong number and a module boundary nobody measured across. */
  const box = new THREE.Box3(new THREE.Vector3(-22.5, -1, -50.6), new THREE.Vector3(-19.4, 2.0, -48.4));
  let below = 0, above = 0;
  const names = {};
  ARCH.root.updateMatrixWorld(true);
  ARCH.root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const g = o.geometry;
    if (!g?.attributes?.position) return;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!o.isInstancedMesh && !g.boundingBox.clone().applyMatrix4(o.matrixWorld).intersectsBox(box)) return;
    const pos = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (!box.containsPoint(v)) continue;
      names[o.name] = (names[o.name] || 0) + 1;
      if (v.y <= T.heightAt(v.x, v.z)) below++; else above++;
    }
  });
  const frac = below / (below + above);
  console.log(`  T2: ${below + above} drawn vertices in the mouth's box (${Object.keys(names).join(', ')}) — `
    + `${(100 * frac).toFixed(1)} % under sand`);
  assert.ok(below + above > 100, 'inspected too few drawn vertices to say anything');
  assert.ok(frac > 0.4,
    `only ${(100 * frac).toFixed(1)} % of the mouth's drawn geometry is under sand. If the dune has been `
    + 'cut back, this defect is fixed and both T1 and T2 should be retired rather than relaxed');
  /* and the dune never lets go of it: there is no z along the axis where the sand reaches y = 0 */
  let clear = null;
  for (let z = -46; z >= -60; z -= 0.25) if (clear === null && T.heightAt(-21, z) <= 0) clear = z;
  console.log(`  T2: sand along x = -21 first reaches y <= 0 at z = ${clear ?? 'nowhere in -46..-60'}`);
  assert.equal(clear, null,
    `the dune now drops to the hall floor at z ${clear}, so the mouth has daylight and this arm is stale`);
});

test('T3: the burial is the PYRAMID PLATEAU, applied after the mask that exists to stop it', () => {
  /* T1 and T2 measure the burial. This arm names its cause, because "cut the dune back" is not
     actionable until you know which term put it there, and two plausible candidates are wrong:

       `drift`      the exterior sand ramp — returns 0 inside the pad rect (`outsideRect` really
                    does return 0 inside; I checked the function rather than its docstring).
       `paveDrift`  the thin sheet over the paving edge — capped at `padLip` 0.30 m, and the
                    burial reaches 1.17 m. It cannot be the source and is not.

     The cause is `pyramidPlateau`. Its weight is `1 - smoothstep(r, r + 110, d)` with
     `r = halfBase * 1.3`, so pyr1 (halfBase 82, baseY 6.5) still has weight at **d = 186.8 m** —
     which is where the hall's north-west corner stands. And it is applied as
     `h = lerp(h, baseY, w)` AFTER `h *= 1 - cm`, so the complex mask whose entire job is to hold
     the complex flush at y = 0 is overridden two lines later. `approachRidge` on the line above
     is weighted `* (1 - cm)` and behaves; the plateau is not.

     The control is what makes this attribution rather than correlation: the hall's two north
     corners have identical pad geometry, mirrored in x. The WEST one is 186.8 m from pyr1 and
     inside the falloff; the EAST one is 222.1 m away and outside it. West reads 1.17 m of sand,
     east reads flush. Nothing about `drift`, `paveDrift` or the mask distinguishes them. */
  const SRC = readFileSync(new URL('../src/world/Terrain.js', import.meta.url), 'utf8');
  const m = /\{ x: (-?[\d.]+), z: (-?[\d.]+), h: [\d.]+, halfBase: ([\d.]+), baseY: ([\d.]+)/.exec(SRC);
  assert.ok(m, 'could not read the first PYRAMIDS entry out of Terrain.js — re-anchor this arm');
  const [px, pz, halfBase, baseY] = m.slice(1).map(Number);
  const fall = /const t = 1 - smoothstep\(r, r \+ (\d+), d\);/.exec(SRC);
  assert.ok(fall, 'the plateau falloff is no longer `smoothstep(r, r + N, d)`');
  const reach = Number(fall[1]);
  const r0 = halfBase * 1.3;
  const wAt = (x, z) => {
    const d = Math.hypot(x - px, z - pz);
    const s = Math.max(0, Math.min(1, (d - r0) / reach));
    return 1 - s * s * (3 - 2 * s);
  };

  const WEST = [-24, -52], EAST = [24, -52];
  const hw = T.heightAt(...WEST), he = T.heightAt(...EAST);
  const ww = wAt(...WEST), we = wAt(...EAST);
  console.log(`  T3: pyr1 (${px}, ${pz}) halfBase ${halfBase} baseY ${baseY} · plateau reaches `
    + `${(r0 + reach).toFixed(1)} m`);
  console.log(`  T3: hall NW d ${Math.hypot(WEST[0] - px, WEST[1] - pz).toFixed(1)} m -> weight ${ww.toFixed(3)} · sand ${hw.toFixed(3)}`);
  console.log(`  T3: hall NE d ${Math.hypot(EAST[0] - px, EAST[1] - pz).toFixed(1)} m -> weight ${we.toFixed(3)} · sand ${he.toFixed(3)}`);

  assert.ok(ww > 0.05, `the plateau weight at the hall's NW corner is ${ww.toFixed(3)} — if it has fallen `
    + 'to zero the plateau no longer reaches the temple and this attribution is stale');
  assert.equal(we, 0, `the hall's NE corner now carries plateau weight ${we.toFixed(3)}, so it is no longer `
    + 'the control this arm rests on and the comparison proves nothing');

  /* the prediction: lerping the flush height toward baseY by that weight reproduces the burial.
     The east corner supplies the flush reference, since it is the same geometry with weight 0. */
  const predicted = he + (baseY - he) * ww;
  console.log(`  T3: lerp(flush ${he.toFixed(3)}, baseY ${baseY}, w ${ww.toFixed(3)}) = ${predicted.toFixed(3)} `
    + `against a measured ${hw.toFixed(3)} — ${(100 * Math.abs(predicted - hw) / hw).toFixed(1)} % apart`);
  assert.ok(Math.abs(predicted - hw) / hw < 0.08,
    `the plateau lerp predicts ${predicted.toFixed(3)} m and the field returns ${hw.toFixed(3)} m. They agreed `
    + 'to within 3 % when this was measured; if they have diverged, some OTHER term is now '
    + 'contributing and the single-cause attribution here is wrong');

  /* THE FIX THIS ARM IS WAITING FOR, stated so it is not re-derived: weight the plateau by the
     complex mask, exactly as `approachRidge` already is —
         h = lerp(h, _plateau[0], _plateau[1] * (1 - cm));
     One line, no new constant, and it leaves the plateau untouched outside the complex because
     `cm` is 0 there. Held while a capture holds the lock (§186). */
  assert.match(SRC, /h = lerp\(h, _plateau\[0\], _plateau\[1\]\);/,
    'the plateau lerp has changed. If it is now mask-weighted, this defect is fixed — retire T1, '
    + 'T2 and T3 together and pin the exposed hall floor instead of the buried one');
});
