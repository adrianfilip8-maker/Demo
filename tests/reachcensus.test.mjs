import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * reachcensus.test.mjs — EVERY thief spot in the level, entered, from a surface a player can
 * already stand on.
 *
 * `thiefspots.test.mjs` drives the three §495 lines end to end. This asks the wider question the
 * user's request implies: a spot that exists in the level data but cannot be ENTERED from a
 * standable neighbour is decorative, not interactable. The set under test is not the three that
 * were added — it is everything COLLISION actually offers after the §514.3 thin-pole gate:
 *
 *     pole   4    (obelisk rope r 0.15, SE drainpipe r 0.18, east mast r 0.40, and §571's nave
 *                 rope r 0.14, which fills §570's worst route gap). The NORTH mast
 *                 was a fourth until §568: `poleProxy` gave it a `pole` affordance 0.40 m tall,
 *                 a climb that arrives where it started. It is still solid, it is no longer an
 *                 offer, and dropping it is why this count is 3 and not 4.
 *     rail   7    colossi-rope, approach, pylon-drop, roof-w, roof-e, hall-cable, pylon-summit
 *     hook  11    seven main-chain rings, four low-chain rings
 *     spire  5    obelisk pyramidion, two pylon pinnacles, two stage spires
 *     vent   4    the hall NW mouth, the sloping shaft, and two buried segments
 *                                                                            = 31 affordances
 *
 * The other 15 `pole` recs — the hypostyle colonnade (r 1.62), the pylon pinnacles (r 0.85), the
 * obelisk shaft (r 1.50) — are deliberately NOT offered: the user's ruling is "do not climb up
 * columns, only poles that are thin like pipes or ropes", and §514.3 gates them at affordance
 * build. They are solid and not climbable, which is the intent, so they are not thief spots.
 *
 * ── How the stances were found, and why they are written down ──────────────────────────────
 * By search, not by authorship: for every affordance, a ring of candidate positions around each
 * sample point of its curve/point, every floor found under each by repeated downward raycast,
 * and then the REAL capsule settled at each for 30 frames — a stance is a position the shipped
 * Controller ends up GROUNDED at, never a coordinate that looked right (§435.4). The winners of
 * that search are the constants below, so the arm runs in seconds instead of minutes; the search
 * itself is the thing that produced them and is not re-run here.
 *
 * ── The two that are not reachable, and the real boundary ─────────────────────────────────
 * Of the 31, twenty-four are entered from a settled ground stance and five more are entered from
 * a driven NEIGHBOUR of their own class (arm C) — including `hook-low-0`, which the level's own
 * source records as an open reachability hole because its nearest `pole` is 21.01 m away. Driven,
 * a release from `hook-low-1` catches it. *A frontier whose own neighbour passes is not a
 * frontier*, and the geometric claim that made it look like one is a distance, not a route.
 *
 * The two that remain are the buried vent segments, and arm V finds the real boundary: the
 * tunnel's interior is hollow but BOTH its portals are solid — the hall's north wall
 * (`proxy:wall` x -24..-3.4, y 0..13, z -52..-49.9) across the mouth, and the tomb's west wall
 * (x -14.05..-12.05, y -12..-2) across the exit. So the §8.1 ALTERNATE ("CRAWL the `vent`") is
 * a dead end, and it has been WITHDRAWN from the route header (§565).
 *
 * CORRECTION to this file's first version: it also named "the desert sand sheet an unbroken lid
 * over everything between" as a third blocker. That is wrong and arm V now measures it the other
 * way — the sand surface sits 1.2-4.6 m ABOVE the channel the whole way down the shaft, so it
 * is overhead, not pressing. Two blockers, not three, and both are walls.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** [label, stance, target, tag, verb] — every stance is a MEASURED settled position. */
const SPOTS = [
  ['spire obelisk pyramidion', [0.60, 20.40, 11.00], [0, 21.40, 11.00], 'spire', 'walkE'],
  ['pole obelisk rope (§495.A)', [0.60, 6.30, 13.00], [0, 15.00, 13.00], 'pole', 'walkE'],
  /* §497's own contract: the colossi rope's buttonless walk-on is a SNEAK off the knee ledge —
     `mountSpeed: 0` mounts at the walker's own speed, and at full walk the step-off overshoots
     the from-above catch window and the walker tiptoes along the shelf instead (measured). */
  ['rail colossi-rope (§495.B)', [-7.90, 4.72, 27.00], [9.00, 4.95, 27.00], 'rail', 'sneak'],
  ['pole SE drainpipe (§495.C)', [21.95, 0.00, -2.00], [21.35, 4.80, -2.00], 'pole', 'walk'],
  ['pole nave rope (§571)', [0.00, 0.00, -33.20], [2.40, 8.00, -33.20], 'pole', 'walkE'],
  ['pole east mast', [22.40, 9.00, 27.50], [20.60, 12.45, 27.50], 'pole', 'walk'],
  ['hook main-0', [20.42, 15.90, 27.42], [20.00, 14.90, 27.00], 'hook', 'walk'],
  ['hook main-3', [4.20, 9.00, 6.90], [4.20, 14.80, 4.50], 'hook', 'walkE'],
  ['hook main-6', [-9.50, 15.36, -16.60], [-9.50, 14.00, -13.00], 'hook', 'walk'],
  ['hook low-1', [-11.01, 9.56, 21.84], [-11.00, 11.70, 19.00], 'hook', 'walk'],
  ['hook low-2', [-4.20, 9.00, 14.00], [-6.00, 11.80, 14.00], 'hook', 'walk'],
  ['hook low-3', [-0.90, 6.30, 9.50], [-1.50, 11.90, 9.50], 'hook', 'walkE'],
  ['rail approach', [10.60, 12.74, 61.00], [10.00, 15.30, 61.00], 'rail', 'walkE'],
  ['rail pylon-drop', [13.60, 28.56, 33.20], [13.60, 26.30, 32.00], 'rail', 'walk'],
  ['rail roof-w', [-10.80, 17.00, -18.50], [-11.40, 17.42, -18.50], 'rail', 'jumpE'],
  ['rail roof-e', [12.00, 16.60, -18.50], [11.40, 17.42, -18.50], 'rail', 'walkE'],
  ['rail hall-cable', [-7.40, 15.36, -16.40], [-8.00, 13.33, -16.40], 'rail', 'walkE'],
  ['spire pylon pinnacle W', [-15.40, 19.50, -50.00], [-16.00, 21.00, -50.00], 'spire', 'jumpE'],
  ['spire pylon pinnacle E', [16.60, 19.50, -50.00], [16.00, 21.00, -50.00], 'spire', 'jumpE'],
  ['rail pylon-summit', [-6.99, 34.00, -51.91], [-7.59, 34.40, -51.91], 'rail', 'walkE'],
  ['spire stage W', [-5.40, 26.00, -50.00], [-6.00, 27.00, -50.00], 'spire', 'jumpE'],
  ['spire stage E', [6.60, 26.00, -50.00], [6.00, 27.00, -50.00], 'spire', 'jumpE'],
  ['vent shaft (hall NW)', [-21.00, -0.03, -52.70], [-21.00, -1.55, -54.50], 'vent', 'walk'],
  ['vent mouth (hall NW)', [-20.40, 0.00, -49.40], [-21.00, -0.20, -49.40], 'vent', 'walk'],
];

const ATTACH = {
  pole: new Set(['poleClimb', 'poleSwing']),
  rail: new Set(['railSlide', 'railWalk']),
  hook: new Set(['hookSwing', 'toTarget']),
  spire: new Set(['spireLand', 'toTarget']),
  vent: new Set(['crawl']),
};

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
  /** Settle at `start`, then drive `verb` at `target`. Returns the state that took him. */
  const enter = (start, target, tag, verb, frames = 200) => {
    hardReset(engine, c, V(...start), Math.atan2(target[0] - start[0], target[2] - start[2]));
    for (let i = 0; i < 25; i++) step(() => {});
    if (!c.grounded) return { ok: false, why: `the stance did not settle grounded (y ${c.position.y.toFixed(2)})` };
    const want = ATTACH[tag];
    for (let i = 0; i < frames; i++) {
      step((inp) => {
        aim(target[0], target[2]);
        inp.move.y = 1;
        if (verb === 'sneak') inp.hold('sneak');
        if (verb === 'walkE' || verb === 'jumpE') {
          if (i > 3 && i % 6 === 0) inp.hold('interact'); else inp.let_go('interact');
        } else inp.let_go('interact');
        if (verb === 'jumpE') { if (i >= 5 && i < 16) inp.hold('jump'); else inp.let_go('jump'); }
      });
      if (want.has(c.stateName)) return { ok: true, st: c.stateName, at: c.position.clone(), i };
    }
    return { ok: false, why: `never entered ${[...want].join('/')} (ended ${c.stateName})`, end: c.position.clone() };
  };
  return { engine, collision, c, step, aim, enter };
}

/* ====================================================================================== */
test('reachcensus A: every offered affordance is entered from a settled standable stance', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level — 24 affordances, each driven from a stance the real capsule
   *             settles GROUNDED on, with the verb the search found.
   * fails  on : the same drives with the stance moved 12 m back along its own approach — RUN
   *             IN-ARM at the end: none of them enters, so the arm is measuring the entry and
   *             not merely the existence of the affordance.
   * does NOT  : test the five mid-chain hook rings (arm C) or the two buried vents (arm V);
   * discrim.    see art — a spot whose rope is invisible passes here, which is the standing
   *             art/collision seam this project audits elsewhere; or judge difficulty.
   */
  const { enter, collision } = await harness();

  /* The set is asserted against the collider layer, so an affordance appearing or vanishing
     fails here rather than being silently unswept. */
  const offered = new Map();
  for (const e of collision._aff) {
    const t = e.rec.tag;
    if (!ATTACH[t]) continue;
    offered.set(t, (offered.get(t) || 0) + 1);
  }
  assert.deepEqual(Object.fromEntries([...offered].sort()),
    { hook: 11, pole: 4, rail: 7, spire: 5, vent: 4 },
    'the offered-affordance census moved. Either the level gained/lost a thief spot or §514.3\'s '
    + 'thin-pole gate changed which poles are climbable — re-run the stance search before editing '
    + 'the table in this file');

  const fails = [];
  for (const [label, start, target, tag, verb] of SPOTS) {
    const r = enter(start, target, tag, verb);
    if (!r.ok) fails.push(`${label}: from (${start.join(', ')}) with ${verb} — ${r.why}`);
  }
  assert.equal(fails.length, 0,
    `${fails.length} of ${SPOTS.length} thief spots could not be entered from their measured stance:\n  `
    + fails.join('\n  '));

  /* The failing input, driven: back each stance off 12 m along its own approach. */
  let entered = 0;
  for (const [, start, target, tag, verb] of SPOTS.slice(0, 8)) {
    const dx = start[0] - target[0], dz = start[2] - target[2];
    const l = Math.hypot(dx, dz) || 1;
    const far = [start[0] + (dx / l) * 12, start[1], start[2] + (dz / l) * 12];
    if (enter(far, target, tag, verb, 120).ok) entered++;
  }
  assert.ok(entered <= 1,
    `${entered} of 8 spots were entered from 12 m away — the drive is finding the affordance from `
    + 'anywhere, so this arm is not measuring an entry from a neighbouring surface');
  console.log(`[reachcensus A] ${SPOTS.length}/${SPOTS.length} entered from a settled stance; `
    + `${entered}/8 from 12 m back (the discriminator)`);
});

/* ====================================================================================== */
test('reachcensus C: the mid-chain hook rings are entered from their NEIGHBOUR — not a frontier', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped chains. Rings with no ground stance are reached by mounting the
   *             neighbouring ring and releasing toward them, driven: the six main-chain hops and
   *             `low-1 -> low-0`, the ring the level's own source calls an open reachability hole.
   * fails  on : the same drive with the release suppressed — RUN IN-ARM: hold forward, never
   *             press jump, and no hop catches, so the arm is measuring the release-and-catch
   *             and not the fact that two rings are near each other.
   * does NOT  : claim the chain is fun, or that a player finds the release phase easily — the
   * discrim.    hop is driven at one measured phase (release at frame 8 after the mount), not
   *             swept, so it says "reachable", not "forgiving".
   */
  const { engine, c, step, aim } = await harness();
  const MAIN = [
    [20.0, 14.9, 27.0], [14.0, 14.9, 20.0], [8.5, 14.9, 12.0], [4.2, 14.8, 4.5],
    [1.0, 14.5, -3.0], [-4.0, 13.9, -8.5], [-9.5, 14.0, -13.0],
  ];
  const LOW = [[-16.5, 11.6, 24.0], [-11.0, 11.7, 19.0], [-6.0, 11.8, 14.0], [-1.5, 11.9, 9.5]];

  const hop = (from, to, release) => {
    const f = V(...from), t = V(...to);
    hardReset(engine, c, f.clone().add(V(0, -TUNE.hookL, 0)), Math.atan2(t.x - f.x, t.z - f.z));
    c.velocity.set(0, 0, 0);
    let mounted = false;
    for (let i = 0; i < 40 && !mounted; i++) {
      step((inp) => { aim(t.x, t.z); inp.move.y = 1; if (i % 4 === 0) inp.hold('interact'); else inp.let_go('interact'); });
      if (c.stateName === 'hookSwing') mounted = true;
    }
    if (!mounted) return { ok: false, why: 'never mounted the source ring' };
    let released = false;
    for (let i = 0; i < 220; i++) {
      step((inp) => {
        aim(t.x, t.z); inp.move.y = 1;
        if (release && !released && i === 8) inp.hold('jump'); else inp.let_go('jump');
        if (released && i % 3 === 0) inp.hold('interact'); else inp.let_go('interact');
      });
      if (!released && i >= 8 && c.stateName !== 'hookSwing') released = true;
      if (released && c.stateName === 'hookSwing' && c.anchor.distanceTo(t) < 1.0) return { ok: true, i };
      if (c.grounded && i > 40) break;
      if (c.position.y < 1.0) break;
    }
    return { ok: false, why: `released=${released}, ended ${c.stateName} at (${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)})` };
  };

  const legs = [];
  for (let i = 0; i < MAIN.length - 1; i++) legs.push([`main-${i} -> main-${i + 1}`, MAIN[i], MAIN[i + 1]]);
  legs.push(['low-1 -> low-0 (the "open hole")', LOW[1], LOW[0]]);
  legs.push(['low-2 -> low-1', LOW[2], LOW[1]]);
  const bad = [];
  for (const [label, a, b] of legs) {
    const r = hop(a, b, true);
    if (!r.ok) bad.push(`${label}: ${r.why}`);
  }
  assert.equal(bad.length, 0,
    `${bad.length} of ${legs.length} chain hops did not catch the next ring:\n  ` + bad.join('\n  '));

  /* The failing input: same drive, no release. */
  let caught = 0;
  for (const [, a, b] of legs) if (hop(a, b, false).ok) caught++;
  assert.equal(caught, 0,
    `${caught} hops "caught" the next ring with the release suppressed — the arm is not measuring a `
    + 'release-and-catch, so it would pass on a chain nobody can traverse');
  console.log(`[reachcensus C] ${legs.length}/${legs.length} chain hops catch on release; ${caught} without it`);
});

/* ====================================================================================== */
test('reachcensus V: the vent route is a dead end, and this is where it stops (§418.5 tripwire)', async () => {
  /* A TRIPWIRE. It records the one genuinely unreachable pair of thief spots in the level, with
   * the boundary MEASURED rather than inferred, so nobody re-derives it and nobody claims the
   * §8.1 ALTERNATE works without opening something.
   *
   * The tunnel's INTERIOR IS HOLLOW — a crouched capsule depenetrates by 0.000 m at every
   * sample from z -53 to -60.6 and along the whole east run to x -14. *Before calling a surface
   * a lid, look underneath it*: the lid is real and there is a room under it. What is solid is
   * the two PORTALS, and they are ordinary walls nobody cut a door in.
   *
   * Driven: a walker at the hall's NW corner enters `crawl` at z -48.1 (the mouth proxy pokes
   * above the floor there, which is the intended read), crawls 1.4 m, and stops dead at
   * z -49.56 — the hall north wall's south face at -49.90 plus the 0.34 capsule radius, to the
   * centimetre. It then holds there for as long as forward is held: 1290 frames measured,
   * grounded and stationary, which both §504 watchdogs exempt by design.
   *
   * Opening it means cutting a doorway through the hall's north wall AND the tomb's west wall
   * AND the terrain sand sheet above the shaft, and each is one collider that would have to
   * become two or three. `tests/basketvary.test.mjs:424` pins ARCHITECTURE+PROPS registrations
   * at 282. If this arm goes red, somebody has done that work — delete the tripwire and assert
   * the crawl instead.
   */
  const { collision, engine, c, step, aim } = await harness();

  /* the interior is hollow */
  const free = (p) => {
    const r = collision.capsuleSweep(p.clone(), p.clone(), TUNE.radius, TUNE.crouchHeight ?? 1.06);
    return r.position.distanceTo(p);
  };
  let hollow = 0;
  for (let z = -53; z >= -60.5; z -= 1.0) {
    const u = (-49.3 - z) / (60.6 - 49.3);
    if (free(V(-21, -3.5 * u, z)) < 0.01) hollow++;
  }
  assert.ok(hollow >= 6,
    `only ${hollow} of 8 shaft samples are open space — the tunnel has been filled, which changes the `
    + 'boundary this arm records');

  /* the two portals are solid, and named */
  const mouth = collision.raycast(V(-21, 0.8, -48.6), V(0, 0, -1), 6);
  assert.ok(mouth?.hit && mouth.tag === 'wall' && Math.abs(mouth.point.z + 49.90) < 0.05,
    `the vent mouth's blocker is ${mouth?.hit ? `${mouth.tag} at z ${mouth.point.z.toFixed(2)}` : 'gone'} — it was `
    + 'the hall north wall at z -49.90. If it has been cut, this tripwire is obsolete');

  /* and the drive stops there */
  hardReset(engine, c, V(-21.0, 0.2, -47.5), Math.PI);
  for (let i = 0; i < 30; i++) step(() => {});
  let sawCrawl = false;
  for (let i = 0; i < 400; i++) {
    step((inp) => { aim(-21, -64); inp.move.y = 1; });
    if (c.stateName === 'crawl') sawCrawl = true;
  }
  assert.ok(sawCrawl, 'the walker never entered `crawl` at the hall NW corner — the mouth affordance moved');
  assert.ok(c.position.z > -50.2,
    `the crawl reached z ${c.position.z.toFixed(2)}, past the wall at -49.90 — the vent route has been `
    + 'opened, so replace this tripwire with a driven crawl to the vault');
  assert.ok(Math.abs(c.position.z + 49.56) < 0.15,
    `the crawl stopped at z ${c.position.z.toFixed(2)}, not the measured -49.56 (wall face -49.90 plus the `
    + '0.34 capsule radius) — something else is stopping it now and the boundary needs re-measuring');
  /* The sand is OVERHEAD, not a lid pressing on the channel — the correction above, measured. */
  let minClear = 99;
  for (let z = -53; z >= -60.5; z -= 1.0) {
    const u = Math.min(1, Math.max(0, (-49.3 - z) / (60.6 - 49.3)));
    const g = collision.groundCheck(V(-21, 6, z), TUNE.radius, 40);
    if (g?.hit) minClear = Math.min(minClear, g.y - (-0.05 - 3.5 * u));
  }
  assert.ok(minClear > 1.0,
    `the surface over the shaft is only ${minClear.toFixed(2)} m above the channel at its tightest — `
    + 'the first version of this file called the sand a lid and was wrong; if it has become one, the '
    + 'terrain moved and the boundary needs re-measuring');

  /* And the half that sets the priority: this is a CUL-DE-SAC, not a soft-lock. Every input a
     stuck player actually produces gets them out, which is why §565 withdrew the route from the
     header rather than treating the geometry as an emergency. */
  const escape = (script) => {
    hardReset(engine, c, V(-21.0, 0.2, -47.5), Math.PI);
    for (let i = 0; i < 30; i++) step(() => {});
    for (let i = 0; i < 400; i++) step((inp) => { aim(-21, -64); inp.move.y = 1; });
    const wedged = c.position.clone();
    let far = 0;
    for (let i = 0; i < 400; i++) { step((inp) => script(inp, i)); far = Math.max(far, c.position.distanceTo(wedged)); }
    return far;
  };
  const back = escape((inp) => { aim(-21, -64); inp.move.y = -1; });
  const round = escape((inp) => { aim(-21, -20); inp.move.y = 1; });
  const held = escape((inp) => { aim(-21, -64); inp.move.y = 1; });
  assert.ok(back > 10 && round > 10,
    `the wedge is not escapable by ordinary input — back ${back.toFixed(2)} m, turn-round ${round.toFixed(2)} m. `
    + 'That would make it a soft-lock rather than the cul-de-sac §565 priced, and it would need repairing '
    + 'rather than un-advertising');
  assert.ok(held < 0.5,
    `holding forward at the wedge moved ${held.toFixed(2)} m — the wall no longer stops it, so the `
    + 'boundary has moved and this tripwire is stale');

  console.log(`[reachcensus V] tunnel interior open at ${hollow}/8 samples; surface ${minClear.toFixed(2)} m `
    + `overhead at its tightest; the crawl stops at z ${c.position.z.toFixed(2)} against the hall north wall `
    + `at -49.90 · escapes: back ${back.toFixed(1)} m, turn-round ${round.toFixed(1)} m, held-forward ${held.toFixed(2)} m`);
});
