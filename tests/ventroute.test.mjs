import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * ventroute.test.mjs — the vent passage, driven end to end in BOTH directions (§600).
 *
 * This replaces `reachcensus.test.mjs` arm V, which was a tripwire on the passage being SHUT:
 * it pinned the wall face at z −49.90, the crawl stopping at z −49.56, and the escape
 * distances, and its own docblock said *"if this arm goes red, somebody has done that work —
 * delete the tripwire and assert the crawl instead"*. It went red. This is the crawl.
 *
 * ── What the route is, and what it is NOT ─────────────────────────────────────────────────
 * §8.1 offered it as a stealth ALTERNATE. Guards, cameras, searchlights and motion trackers are
 * out of scope by the user's ruling, so there is nothing to bypass and §565 was right to strike
 * it on that ground. It is rebuilt as TRAVERSAL, and the claim is narrower than "short cut":
 * measured, the vent line from the hall's north-west corner to the sarcophagus is 53.8 m
 * against the front route's 56.2 m, which is 2.4 m and does not earn 19 m of tunnel on its own.
 * What it is, is a SECOND ENTRANCE — R4 drives it and asserts the path never passes through the
 * inner pylon gate or the stairwell, which every other way into the burial chamber does — and
 * the only place in the level you look DOWN on the sarcophagus from, which R4 also measures.
 *
 * ── The three things this file exists to keep honest ──────────────────────────────────────
 *   · the bore is sized by the STEP PROBE, not the crawl capsule. `_moveHorizontal` lifts a
 *     grounded capsule `TUNE.stepHeight` before every horizontal sweep, so the ceiling a
 *     crawler needs is 0.42 + 2·radius/cos(pitch) — 1.19 m at the mouth ramp, not 0.68 m. R2
 *     asserts the clearance in the form that bounds it.
 *   · the passage is TWO-WAY. R1 drives in, R3 drives out, R6 drives every riser of the landing
 *     chain from the crypt floor back up to the gallery. A chain you can only fall down is a
 *     one-way door and §565 retired one for exactly that.
 *   · nothing in it holds a grounded player. R7 is the local form of `pincensus` (§566).
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* The profile, duplicated from `EgyptLevel.js`'s VENT table ON PURPOSE — a test that imports
   the constants it checks cannot notice the constants moving. */
const HEAD = { z: -48.70, y: 0.00 };
const KNEE = { z: -52.00, y: -2.00 };
const FOOT = { z: -62.15, y: -5.40 };
const EXIT_X = -12.05;
const yAt = (z) => (z >= KNEE.z
  ? HEAD.y + (z - HEAD.z) * (KNEE.y - HEAD.y) / (KNEE.z - HEAD.z)
  : KNEE.y + (z - KNEE.z) * (FOOT.y - KNEE.y) / (FOOT.z - KNEE.z));
/* The two things every other way into the burial chamber goes through (§8.1 steps 6-8). */
const GATE = new THREE.Box3(V(-3.4, -1, -52.1), V(3.4, 9, -49.8));
const STAIRWELL = new THREE.Box3(V(-14.2, -12.5, -59.4), V(4.4, 0.5, -54.4));

async function harness() {
  const { engine, collision, c } = await realWorld();
  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const step = (script) => {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    script(engine.input);
    engine.time += DT; c.update(DT, engine.time);
    engine.events.length = 0;
  };
  /** Settle, then walk the waypoint list holding forward. Records the path. */
  const walk = (start, waypoints, budget = 3000) => {
    hardReset(engine, c, V(...start), Math.atan2(waypoints[0][0] - start[0], waypoints[0][1] - start[2]));
    for (let i = 0; i < 30; i++) step(() => {});
    const settled = c.grounded;
    let wp = 0, sawCrawl = false, frames = 0;
    const path = [];
    for (let i = 0; i < budget; i++) {
      const t = waypoints[Math.min(wp, waypoints.length - 1)];
      step((inp) => { aim(t[0], t[1]); inp.move.y = 1; });
      frames = i;
      if (c.stateName === 'crawl') sawCrawl = true;
      if (i % 4 === 0) path.push(c.position.clone());
      const d = Math.hypot(c.position.x - t[0], c.position.z - t[1]);
      if (d < 1.1 && wp < waypoints.length - 1) wp++;
      else if (wp === waypoints.length - 1 && d < 1.1) break;
    }
    return { settled, sawCrawl, frames, wp, path, end: c.position.clone(), state: c.stateName, grounded: c.grounded };
  };
  return { engine, collision, c, step, aim, walk };
}

/* ====================================================================================== */
test('ventroute R1: the crawl runs hall -> crypt, driven, on the shipped capsule', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level — a walker settled on the hall floor at (-21.85, 0, -46.0)
   *             reaches the crypt side of the tomb's west wall (x > -12.5) at the gallery's own
   *             y, having been in `crawl`.
   * fails on  : the SAME drive translated 10 m east, to x -12.0 (run in-arm). The hall's north
   *             wall is uncut there, so the walker stops against it — and stops at the
   *             coordinate §563 recorded for the whole wall before the cut, which is the
   *             control and the reproduction in one.
   * does not discriminate: art (R5), difficulty (one held stick, no timing), and the return
   *             leg, which is R3's — a drive one way says nothing about the other. */
  const { walk } = await harness();

  const r = walk([-21.85, 0.20, -46.0], [[-21.85, -52], [-21.85, -60], [-18.0, -63.0], [-11.4, -63.0]]);
  assert.ok(r.settled, 'the hall stance did not settle grounded');
  assert.ok(r.sawCrawl, 'the walker never entered `crawl` — the mouth affordance has moved');
  assert.ok(r.end.x > -12.5 && r.grounded,
    `the crawl ended at (${r.end.x.toFixed(2)}, ${r.end.y.toFixed(2)}, ${r.end.z.toFixed(2)}) state ${r.state} — it `
    + 'did not reach the crypt side of the tomb west wall (x > -12.5)');
  assert.ok(Math.abs(r.end.y - FOOT.y) < 0.2,
    `the crawl arrived at y ${r.end.y.toFixed(2)}, not the gallery at ${FOOT.y}`);

  /* The failing input: the same drive 12 m east, where the wall was never cut. */
  const solid = walk([-12.0, 0.20, -46.0], [[-12.0, -52], [-12.0, -60], [-12.0, -63.0]], 900);
  assert.ok(solid.end.z > -50.2 && !solid.sawCrawl,
    `10 m east of the mouth the walker reached z ${solid.end.z.toFixed(2)} (crawl ${solid.sawCrawl}) — the hall's `
    + 'north wall is uncut there and should stop it, so this arm is not measuring the doorway');
  assert.ok(Math.abs(solid.end.z + 49.56) < 0.2,
    `the uncut control stopped at z ${solid.end.z.toFixed(2)}, not §563's -49.56 (the wall face -49.90 plus the `
    + '0.34 capsule radius) — the wall itself has moved and both halves of this need re-measuring');

  console.log(`[ventroute R1] hall -> crypt in ${r.frames} frames, arrives (${r.end.x.toFixed(2)}, `
    + `${r.end.y.toFixed(2)}, ${r.end.z.toFixed(2)}); 10 m east the same drive stops at z ${solid.end.z.toFixed(2)} `
    + '(§563\'s coordinate, reproduced as the control)');
});

/* ====================================================================================== */
test('ventroute R2: the bore clears the step probe, not just the crawl ball', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped bore — at every station from inside the wall to the crypt reveal the
   *             ceiling is at least `stepHeight + 2·radius / cos(pitch)` above the floor and a
   *             crawl capsule depenetrates 0.000 m.
   * fails on  : the same stations measured against the crawl ball alone (2·radius = 0.68 m),
   *             run in-arm — that bound accepts every station including the profile that froze
   *             the first build at z -49.616, so it cannot tell a passable tunnel from a stuck
   *             one and asserting it would have shipped the wall.
   * does not discriminate: whether the ceiling is DRAWN (R5), and lateral width — 1.70 m of
   *             bore against a 0.68 m capsule is never the binding number. */
  const { collision } = await harness();
  const need = (pitchDeg) => TUNE.stepHeight + 2 * TUNE.radius / Math.cos(pitchDeg * Math.PI / 180);

  /* From z -50.2 north: south of the wall's reveal the ramp is an open recess in the hall floor
     with the hall itself overhead, which is the intended read and has no ceiling to measure. */
  const stations = [];
  for (let z = -50.2; z >= -61.8; z -= 1.0) stations.push([-21.85, yAt(z), z, z >= KNEE.z ? 31.2 : 18.5]);
  for (let x = -22.2; x <= EXIT_X - 0.2; x += 1.5) stations.push([x, FOOT.y, -63.0, 0]);

  let worstMargin = 99, worstAt = '', ballOnly = 0;
  for (const [x, fy, z, pitch] of stations) {
    const p = V(x, fy + 0.05, z);
    const pen = collision.capsuleSweep(p.clone(), p.clone(), TUNE.radius, TUNE.crawlHeight).position.distanceTo(p);
    assert.ok(pen < 0.02, `a crawl capsule at (${x.toFixed(2)}, ${fy.toFixed(2)}, ${z.toFixed(2)}) depenetrates ${pen.toFixed(3)} m`);
    const up = collision.raycast(V(x, fy + 0.05, z), V(0, 1, 0), 8);
    assert.ok(up?.hit, `no ceiling over (${x.toFixed(2)}, ${z.toFixed(2)}) — the bore is open to the sand there`);
    const head = up.point.y - fy;
    const m = head - need(pitch);
    if (m < worstMargin) { worstMargin = m; worstAt = `(${x.toFixed(2)}, ${z.toFixed(2)}) head ${head.toFixed(2)}`; }
    if (head >= 2 * TUNE.radius) ballOnly++;
  }
  assert.ok(worstMargin > 0.05,
    `the tightest station is ${worstAt}, only ${worstMargin.toFixed(3)} m over the step-probe requirement — `
    + 'a grounded capsule is lifted stepHeight before every horizontal sweep, so this is the bound that decides '
    + 'whether the crawl moves at all (§600.5: it froze at z -49.616 when this went negative)');
  assert.equal(ballOnly, stations.length,
    'the crawl-ball-only bound rejected a station — it is supposed to accept every one of them, which is what '
    + 'makes it the wrong bound');

  console.log(`[ventroute R2] ${stations.length} stations; tightest step-probe margin ${worstMargin.toFixed(3)} m at `
    + `${worstAt}; the crawl-ball-only bound passes ${ballOnly}/${stations.length} (the discriminator)`);
});

/* ====================================================================================== */
test('ventroute R3: the crawl runs crypt -> hall, and the passage is not a one-way door', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level — a walker settled on the crypt gallery reaches the hall floor
   *             at y 0 and stands up out of `crawl`.
   * fails on  : the same drive sent SOUTH along the gallery instead of into the portal, run
   *             in-arm — it ends on the ledge at the gallery's own y, so the arm is measuring an
   *             ascent rather than "the drive terminated somewhere".
   * does not discriminate: the landing chain below the gallery (R6), and time — the ascent is
   *             ~27 s of held stick and nothing here rewards doing it faster. */
  const { walk } = await harness();

  const r = walk([-11.0, FOOT.y + 0.1, -63.0], [[-16.0, -63.0], [-21.85, -62.6], [-21.85, -52], [-21.85, -46.5]]);
  assert.ok(r.settled, 'the gallery stance did not settle grounded');
  assert.ok(r.sawCrawl, 'the walker never entered `crawl` on the crypt side — the exit affordance has moved');
  assert.ok(r.end.z > -49.0 && Math.abs(r.end.y) < 0.2 && r.grounded,
    `the ascent ended at (${r.end.x.toFixed(2)}, ${r.end.y.toFixed(2)}, ${r.end.z.toFixed(2)}) state ${r.state} — it `
    + 'did not reach the hall floor, so the passage is one-way');
  assert.notEqual(r.state, 'crawl', `the walker is still in \`crawl\` at z ${r.end.z.toFixed(2)} — it never stood up`);

  const dead = walk([-11.0, FOOT.y + 0.1, -63.0], [[-11.0, -61.5], [-11.0, -60.8]], 900);
  assert.ok(Math.abs(dead.end.y - FOOT.y) < 0.4,
    `driven south along the gallery the walker ended at y ${dead.end.y.toFixed(2)} rather than staying on the ledge `
    + `at ${FOOT.y} — the control is not a control`);

  console.log(`[ventroute R3] crypt -> hall in ${r.frames} frames, stands up at (${r.end.x.toFixed(2)}, `
    + `${r.end.y.toFixed(2)}, ${r.end.z.toFixed(2)}) as \`${r.state}\`; the gallery control holds at y ${dead.end.y.toFixed(2)}`);
});

/* ====================================================================================== */
test('ventroute R4: it is a SECOND ENTRANCE and a vantage, which is the claim that survives', async () => {
  /* The reason it is built, stated as narrowly as the measurements support.
   *
   * DOMAIN (§418.3)
   * passes on : the shipped level — R1's driven path enters neither the inner pylon gate
   *             (x ±3.4 at z -52) nor the stairwell (x -14.2..4.4, z -59.4..-54.4), which every
   *             other route into the burial chamber passes through; and from the gallery there
   *             is an unobstructed line to the sarcophagus.
   * fails on  : the front route itself, sampled at 0.25 m and run in-arm — it enters BOTH boxes,
   *             which is what makes "independent" mean something rather than being a property of
   *             any path that happens to miss two boxes.
   * does not discriminate: distance. The vent line is 53.8 m against the front route's 56.2 m
   *             and the saving is 2.4 m; this arm reports that and asserts nothing about it,
   *             because 2.4 m does not earn 19 m of tunnel and pretending otherwise would be the
   *             overstatement §565 caught in the first version of this route. */
  const { collision, walk } = await harness();

  const r = walk([-21.85, 0.20, -46.0], [[-21.85, -52], [-21.85, -60], [-18.0, -63.0], [-11.4, -63.0]]);
  const through = (path) => {
    let gate = 0, well = 0;
    for (const p of path) { if (GATE.containsPoint(p)) gate++; if (STAIRWELL.containsPoint(p)) well++; }
    return { gate, well };
  };
  const vent = through(r.path);
  assert.equal(vent.gate + vent.well, 0,
    `the vent path passes through the inner pylon gate ${vent.gate} times and the stairwell ${vent.well} — then it `
    + 'is not an independent entrance');

  /* The failing input: the front route, sampled densely. */
  const frontPts = [[-21.85, 0, -46.0], [-3.0, 0, -48.6], [0, 0, -51.0], [0, 0, -57.0],
    [-2.2, -5.6, -57.6], [0.4, -12, -57.6], [0, -12, -62], [0, -12, -72]];
  const dense = [];
  for (let i = 1; i < frontPts.length; i++) {
    const a = V(...frontPts[i - 1]), b = V(...frontPts[i]);
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.25));
    for (let k = 0; k <= n; k++) dense.push(a.clone().lerp(b, k / n));
  }
  const front = through(dense);
  assert.ok(front.gate > 0 && front.well > 0,
    `the front route enters the gate ${front.gate} times and the stairwell ${front.well} — it must enter both, or `
    + 'the two boxes are not the thing that makes a route dependent on the front door');

  /* The payoff: from the gallery you look down on the sarcophagus. Searched along the gallery
     rather than asserted at one lucky point — the crypt has six granite piers in the way. */
  const sarc = V(0.55, -9.40, -71.70);
  let clear = null;
  for (let z = -60.8; z >= -69.5 && !clear; z -= 0.5) {
    const eye = V(-11.30, FOOT.y + 1.55, z);
    const dir = sarc.clone().sub(eye);
    const dist = dir.length();
    const hit = collision.raycast(eye, dir.normalize(), dist - 0.6);
    if (!hit?.hit) clear = { eye, dist };
  }
  assert.ok(clear,
    'no point along the gallery has a clear line to the sarcophagus — the arrival looks at the backs of the crypt '
    + 'piers, which is not the vantage this passage is being built for');

  const len = (pts) => pts.slice(1).reduce((s, p, i) => s + V(...p).distanceTo(V(...pts[i])), 0);
  const ventLine = [[-21.85, 0, -46.0], [-21.85, 0, HEAD.z], [-21.85, KNEE.y, KNEE.z], [-21.85, FOOT.y, FOOT.z],
    [-18.0, FOOT.y, -63.0], [-11.4, FOOT.y, -63.0], [-11.4, -7.6, -70.8], [-11.4, -9.8, -73.2],
    [-11.4, -12, -75.0], [0, -12, -72]];
  console.log(`[ventroute R4] vent path: gate 0, stairwell 0 of ${r.path.length} samples; front route: gate `
    + `${front.gate}, stairwell ${front.well} of ${dense.length} (the discriminator). Sightline to the `
    + `sarcophagus clear from (${clear.eye.x.toFixed(1)}, ${clear.eye.y.toFixed(1)}, ${clear.eye.z.toFixed(1)}) `
    + `at ${clear.dist.toFixed(1)} m. Lengths: vent ${len(ventLine).toFixed(1)} m, front `
    + `${len(frontPts).toFixed(1)} m — reported, not claimed.`);
});

/* ====================================================================================== */
test('ventroute R5: the passage is DRAWN — the player sees a tunnel, not a void', async () => {
  /* §565 withdrew the route because nothing was drawn inside it: "0 triangles over 19 m". That
   * number did not reproduce as stated — 21 `arch:hall:hieroglyph_wall` triangles sat inside
   * z -51..-60 and the east run was the part that was genuinely empty — but the finding was
   * right and this arm inverts it.
   *
   * MEASURED BY RAY, not by counting triangle centroids in a box. The tunnel's jambs and roof
   * are long merged slabs whose triangles all sit at their ends, so a centroid census reads
   * ZERO in the middle of a wall that is completely solid — two of thirteen sections came out
   * empty on geometry a ray hits at 0.85 m. What the player sees is what a ray finds.
   *
   * DOMAIN (§418.3)
   * passes on : the shipped level — at every station down the bore, rays up / down / left /
   *             right all land on DRAWN geometry within 2 m.
   * fails on  : the same four rays fired from (-29, ·, ·), six metres west of the tunnel, run
   *             in-arm — 0 of 4 hit anything, which is what an unbuilt stretch looks like and
   *             is exactly what the shaft used to be.
   * does not discriminate: lighting, materials, or which way the triangles face. */
  const { engine, collision } = await harness();
  const drawn = [];
  engine.scene.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position && !o.userData?.collisionProxy) drawn.push(o); });
  const rc = new THREE.Raycaster();
  rc.far = 2.4;
  const seen = (from, dir) => {
    rc.set(from, dir.clone().normalize());
    const hits = rc.intersectObjects(drawn, false);
    return hits.length ? { name: hits[0].object.name, d: hits[0].distance } : null;
  };
  const DIRS = [['up', V(0, 1, 0)], ['down', V(0, -1, 0)], ['west', V(-1, 0, 0)], ['east', V(1, 0, 0)]];
  const RUN_DIRS = [['up', V(0, 1, 0)], ['down', V(0, -1, 0)], ['north', V(0, 0, -1)], ['south', V(0, 0, 1)]];

  const misses = [];
  const stations = [];
  for (let z = -50.4; z >= -61.6; z -= 1.2) stations.push([`shaft z ${z.toFixed(1)}`, V(-21.85, yAt(z) + 0.55, z), DIRS]);
  /* The run's stations start EAST of the shaft's own mouth: at x -22.70..-21.00 the run's south
     side is the shaft, and a `south` ray there correctly finds open tunnel rather than a wall. */
  for (let x = -20.6; x <= -12.6; x += 1.2) stations.push([`run x ${x.toFixed(1)}`, V(x, FOOT.y + 0.55, -63.0), RUN_DIRS]);
  for (const [label, p, dirs] of stations) {
    for (const [dn, d] of dirs) {
      const h = seen(p, d);
      if (!h) misses.push(`${label} ${dn}`);
    }
  }
  assert.equal(misses.length, 0,
    `${misses.length} of ${stations.length * 4} sightlines out of the bore hit nothing drawn (${misses.slice(0, 8).join(', ')}) `
    + '— the player would be looking into a void there');

  /* The failing input: the same four rays six metres west, where nothing is built. */
  let nowhere = 0;
  for (const [, d] of DIRS) if (seen(V(-29.0, -2.0, -55.0), d)) nowhere++;
  assert.equal(nowhere, 0,
    `${nowhere} of 4 rays in the unbuilt control box at x -29 hit drawn geometry — the census cannot tell built `
    + 'from unbuilt');

  /* THE ELBOW'S WEST END, which is the closure a station census cannot see and a frame found in
     one look. Every station above rays out SIDEWAYS from inside the bore; nothing rayed along the
     run's own axis at its blind end, so the run looked west onto 1.70 x 1.40 m of open sky and
     every clearance number in this file passed straight through it. A bore with one end missing
     is exactly as open as one with both. */
  rc.far = 2.0;
  const blindEnd = seen(V(-21.85, FOOT.y + 0.55, -63.0), V(-1, 0, 0));
  assert.ok(blindEnd && blindEnd.d < 1.2,
    `the elbow's west end shows ${blindEnd ? `${blindEnd.name} at ${blindEnd.d.toFixed(2)} m` : 'nothing at all'} — `
    + 'the run is open at the end the shaft does not join, which is a hole in the desert nobody is '
    + 'looking through only because nobody has stood there yet');
  const blindProxy = collision.raycast(V(-21.85, FOOT.y + 0.55, -63.0), V(-1, 0, 0), 2.0);
  assert.ok(blindProxy?.hit && blindProxy.point.x < -22.6,
    `the elbow's west end has no collider within 2 m either — a crawler holding west leaves the level`);

  /* And both portals are OPEN, in the art and in the collider. */
  rc.far = 3.0;
  const mouthArt = seen(V(-21.85, yAt(-49.6) + 0.55, -49.6), V(0, 0, -1));
  assert.ok(!mouthArt || mouthArt.d > 1.6,
    `something drawn stands ${mouthArt?.d.toFixed(2)} m into the hall mouth (${mouthArt?.name}) — the wall was not cut`);
  const exitArt = seen(V(-11.6, FOOT.y + 0.55, -63.0), V(-1, 0, 0));
  assert.ok(!exitArt || exitArt.d > 2.0,
    `something drawn stands ${exitArt?.d.toFixed(2)} m into the crypt exit (${exitArt?.name}) — the vault shell was not cut`);
  const mouth = collision.raycast(V(-21.85, yAt(-49.3) + 0.35, -49.3), V(0, 0, -1), 4);
  assert.ok(!(mouth?.hit && mouth.tag === 'wall'),
    `the hall mouth is still blocked by ${mouth?.tag} at z ${mouth?.point?.z?.toFixed(2)}`);
  const exit = collision.raycast(V(-11.0, FOOT.y + 0.35, -63.0), V(-1, 0, 0), 4);
  assert.ok(!(exit?.hit && exit.tag === 'wall'),
    `the crypt exit is still blocked by ${exit?.tag} at x ${exit?.point?.x?.toFixed(2)}`);

  console.log(`[ventroute R5] ${stations.length} stations x 4 sightlines, 0 into the void; the unbuilt control at `
    + `x -29 hits ${nowhere}/4 (the discriminator); both portals open in art and in collision`);
});

/* ====================================================================================== */
test('ventroute R6: every riser of the landing chain climbs, driven from the crypt floor', async () => {
  /* The gallery is 6.6 m above the crypt floor. If the crawl is the only way onto it then the
   * crawl is a one-way door with extra steps: a player who drops into the burial chamber can
   * never take the passage back. The three west-wall shelves were built for this and could not
   * do it — 1.35 m of every one was inside the wall (a standing capsule depenetrated 0.29-0.60 m
   * on them) and they were stacked, each a ceiling over the one below. This drives the repaired
   * stair, whose risers are 2.20 m throughout.
   *
   * DOMAIN (§418.3)
   * passes on : the shipped stair — three risers, each driven walk+jump from a settled stance on
   *             the tread below, each ending GROUNDED on the tread above.
   * fails on  : the same three drives with the jump suppressed, run in-arm — 0 of 3 climb, so
   *             the arm is measuring a climb and not a walk up something left there.
   * does not discriminate: forgiveness. One jump phase is driven, not swept, so this says the
   *             riser is climbable, never that it is generous. */
  const { engine, c, step, aim } = await harness();

  const RISERS = [
    /* Each riser is approached from EAST of the tread above it — a shelf you are standing under
       cannot be climbed onto, which is the defect the old stacked chain had all the way down. */
    ['crypt floor -> -9.80', [-9.3, -12.0, -73.2], [-11.5, -73.2], -9.80],
    ['-9.80 -> -7.60', [-10.8, -9.75, -73.4], [-11.6, -71.2], -7.60],
    ['-7.60 -> the gallery', [-10.8, -7.55, -71.2], [-11.6, -68.8], -5.40],
  ];
  const climb = (start, target, want, jump) => {
    hardReset(engine, c, V(...start), Math.atan2(target[0] - start[0], target[1] - start[2]));
    for (let i = 0; i < 25; i++) step(() => {});
    if (!c.grounded) return { ok: false, why: `the stance did not settle (y ${c.position.y.toFixed(2)})` };
    for (let i = 0; i < 420; i++) {
      step((inp) => {
        aim(target[0], target[1]); inp.move.y = 1;
        if (jump && i % 26 >= 2 && i % 26 < 10) inp.hold('jump'); else inp.let_go('jump');
      });
      if (c.grounded && c.position.y > want - 0.15) return { ok: true, at: c.position.clone(), i };
    }
    return { ok: false, why: `ended y ${c.position.y.toFixed(2)} as ${c.stateName}` };
  };

  const rows = [];
  for (const [label, start, target, want] of RISERS) {
    const r = climb(start, target, want, true);
    assert.ok(r.ok, `riser "${label}" did not climb: ${r.why} — the landing chain is one-way`);
    rows.push(`  ${label.padEnd(24)} landed (${r.at.x.toFixed(2)}, ${r.at.y.toFixed(2)}, ${r.at.z.toFixed(2)}) at frame ${r.i}`);
  }
  let noJump = 0;
  for (const [, start, target, want] of RISERS) if (climb(start, target, want, false).ok) noJump++;
  assert.equal(noJump, 0,
    `${noJump} of ${RISERS.length} risers "climbed" with the jump suppressed — the arm is not measuring a climb`);

  console.log(`[ventroute R6] ${RISERS.length}/${RISERS.length} risers climb; ${noJump} without the jump `
    + `(the discriminator)\n${rows.join('\n')}`);
});

/* ====================================================================================== */
test('ventroute R7: nothing in the passage holds a grounded player', async () => {
  /* §566 censused the whole level to zero places where a grounded player is held, and said in
   * terms that a new pocket inside a tunnel is the shape it hunts. This is that census, run at
   * ~1.4 m down the passage the level did not have when §566 ran, with §566's own instrument:
   * settle, then drive eight ways for 3 s and take the furthest reach.
   *
   * DOMAIN (§418.3)
   * passes on : the shipped passage — every station reaches more than 2.5 m in its best
   *             direction, against the 0.21-0.69 m §566 measured at a genuinely closed space.
   * fails on  : the under-courtyard paving void at (-18, -1.00, 22) — §566's own closed-space
   *             input, driven here with this instrument, which SETTLES GROUNDED (its mirror at
   *             +18 does not, and a stance that never settles reads 0.00 for a reason that has
   *             nothing to do with being closed — that distinction is why the west one is used).
   * does not discriminate: anything reached mid-air, and anything outside the bore. */
  const { engine, c, step, aim } = await harness();

  const reach = (p) => {
    let best = 0, settled = 0;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      hardReset(engine, c, p.clone(), a);
      for (let i = 0; i < 25; i++) step(() => {});
      if (!c.grounded) continue;
      settled++;
      const from = c.position.clone();
      for (let i = 0; i < 180; i++) {
        step((inp) => { aim(from.x + Math.sin(a) * 20, from.z + Math.cos(a) * 20); inp.move.y = 1; });
        best = Math.max(best, c.position.distanceTo(from));
      }
    }
    return { best, settled };
  };

  const stations = [];
  for (let z = -49.2; z >= -61.8; z -= 1.4) stations.push(V(-21.85, yAt(z) + 0.05, z));
  for (let x = -21.5; x <= -12.5; x += 1.8) stations.push(V(x, FOOT.y + 0.05, -63.0));

  const rows = [];
  let worst = 1e9, worstAt = '';
  for (const p of stations) {
    const { best, settled } = reach(p);
    assert.ok(settled > 0, `no heading settles grounded at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) — `
      + 'there is no floor under that part of the bore');
    rows.push(`${p.x.toFixed(1)},${p.z.toFixed(1)}:${best.toFixed(1)}`);
    if (best < worst) { worst = best; worstAt = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`; }
  }
  assert.ok(worst > 2.5,
    `the tightest station in the passage is ${worstAt}, where eight driven directions reach only `
    + `${worst.toFixed(2)} m — that is a pocket, which is what §566 censused this level to zero of`);

  const pocket = reach(V(-18, -1.00, 22));
  assert.ok(pocket.settled > 0,
    'the under-paving control never settles grounded, so its reading is not a measure of enclosure and this arm '
    + 'has no discriminator');
  assert.ok(pocket.best < 1.2,
    `§566's under-paving void reads ${pocket.best.toFixed(2)} m with this instrument — it measured 0.21 m walking, `
    + 'so the instrument cannot see a closed space and the number above means nothing');

  console.log(`[ventroute R7] ${stations.length} stations, worst eight-way reach ${worst.toFixed(2)} m at ${worstAt}; `
    + `§566's closed space settles ${pocket.settled}/8 and reaches ${pocket.best.toFixed(2)} m (the discriminator)`
    + `\n  ${rows.join(' ')}`);
});
