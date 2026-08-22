import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * navefork.test.mjs — §575's nave lamp chain, and the fork it makes with §571's rope.
 *
 * §570 measured branch factor — how many affordances a standing player can commit to, using the
 * moveset's own `canEnter` gates — at **0 on all 170 route samples**. §571's rope moved 6 of them
 * to 1. A single line you must climb is not a choice, so this file is about the first stretch of
 * this level where a player can pick.
 *
 * ── The thing this file exists to stop being believed ────────────────────────────────────────
 * "Two affordances are in range, therefore the player has two options" is FALSE on this moveset
 * and arm F is the measurement. `afford` resolves the E press by tag priority, and `hookGrab` 9.0
 * beats `poleMount×1.5` 2.85 outright — so at the fork point E takes the ring every time, even
 * with the camera pointed at the rope. What makes this a fork is that the two branches are
 * entered with different VERBS: E for the chain, walking into the shaft for the rope. Any future
 * fork on this level has to be built that way for as long as E resolves by tag rather than aim.
 *
 * Arms:
 *   N  the chain works as a chain — every ring mounts from the floor beneath it, all four hops
 *      catch, and the dismount is a landing rather than a punishment.
 *   F  the fork is a fork — two verbs, two states, from one settled stance.
 *   G  branch factor after, reported honestly: the hook+hook pairs are counted separately from
 *      the hook+pole ones, because only the second kind is a choice of route.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/* The shipped ring line. Kept here as data so a drift in the level shows up as a failure in the
   arms below rather than as a silently relocated test. */
const RINGS = [
  [0.0, 6.75, -21.0], [-3.4, 6.65, -27.0], [-4.0, 6.70, -33.7],
  [-2.0, 6.60, -40.8], [0.6, 6.70, -47.6],
];
const ROPE = [2.40, -33.20];      // §571
const FORK = [0.0, -33.0];        // the stance both branches are reachable from

async function harness() {
  const { engine, collision, c } = await realWorld();
  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const step = (s) => {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    s?.(engine.input); engine.time += DT; c.update(DT, engine.time); engine.events.length = 0;
  };
  const settle = (x, z) => {
    const g = collision.groundCheck(V(x, 3, z), TUNE.radius, 10);
    hardReset(engine, c, V(x, (g?.hit ? g.y : 0) + 0.35, z), Math.PI);
    for (let i = 0; i < 70; i++) step();
    return c.grounded;
  };
  return { engine, collision, c, aim, step, settle };
}

/* ====================================================================================== */
test('navefork N: the chain is entered from the floor, every hop catches, and the drop is a landing', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped chain — five rings at 6.60–6.75 down the nave, each mounted by E
   *             from the floor beneath it, all four hops caught on a release, dismount under
   *             `landHard`.
   * fails  on : RUN IN-ARM — the same four hops with the JUMP suppressed. Nothing is released,
   *             so nothing may catch; without this the arm would pass on a chain whose rings
   *             are simply close enough to be re-acquired while hanging.
   * does NOT  : claim the release phase is easy to find. Each hop is driven at one scripted
   * discrim.    cadence (release at frame 8), not swept, so this measures that the chain CAN be
   *             traversed, not that it is comfortable.
   */
  const { collision, c, aim, step, settle } = await harness();

  const mounted = [];
  for (let k = 0; k < RINGS.length; k++) {
    const [x, y, z] = RINGS[k];
    assert.ok(settle(x, z), `ring ${k}: no standable floor beneath (${x}, ${z}) to grab from`);
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      step((inp) => { aim(x, z); if (i % 4 === 0) inp.hold('interact'); else inp.let_go('interact'); });
      if (c.stateName === 'hookSwing') ok = true;
    }
    if (ok) mounted.push(k);
    /* the ring must be inside the gate it is advertised by */
    const g = collision.groundCheck(V(x, 3, z), TUNE.radius, 10);
    const d = V(x, y, z).distanceTo(V(x, (g?.hit ? g.y : 0) + 1.15, z));
    assert.ok(d <= TUNE.hookGrab,
      `ring ${k} hangs ${d.toFixed(2)} m above the eye, past hookGrab ${TUNE.hookGrab} — it cannot be `
      + 'taken from the floor at all, which is the entry this chain is for');
  }
  assert.deepEqual(mounted, [0, 1, 2, 3, 4],
    `only rings ${mounted.join(',')} could be taken by E from the floor beneath them`);

  const hop = (a, b, release) => {
    const A = V(...RINGS[a]), B = V(...RINGS[b]);
    hardReset(c.engine ?? undefined, c, A.clone().add(V(0, -TUNE.hookL, 0)), Math.atan2(B.x - A.x, B.z - A.z));
    c.velocity.set(0, 0, 0);
    let on = false;
    for (let i = 0; i < 40 && !on; i++) {
      step((inp) => { aim(B.x, B.z); inp.move.y = 1; if (i % 4 === 0) inp.hold('interact'); else inp.let_go('interact'); });
      if (c.stateName === 'hookSwing') on = true;
    }
    if (!on) return { ok: false, why: 'never mounted the source ring' };
    let rel = false;
    for (let i = 0; i < 220; i++) {
      step((inp) => {
        aim(B.x, B.z); inp.move.y = 1;
        if (release && !rel && i === 8) inp.hold('jump'); else inp.let_go('jump');
        if (rel && i % 3 === 0) inp.hold('interact'); else inp.let_go('interact');
      });
      if (!rel && i >= 8 && c.stateName !== 'hookSwing') rel = true;
      if (rel && c.stateName === 'hookSwing' && c.anchor.distanceTo(B) < 1.0) return { ok: true, i };
      if (c.grounded && i > 40) break;
      if (c.position.y < 0.6) break;
    }
    return { ok: false, why: `released=${rel}, ended ${c.stateName}` };
  };

  const bad = [];
  for (let k = 0; k + 1 < RINGS.length; k++) {
    const r = hop(k, k + 1, true);
    if (!r.ok) bad.push(`ring ${k} -> ${k + 1}: ${r.why}`);
  }
  assert.deepEqual(bad, [], `${bad.length} of 4 chain hops did not catch:\n  ` + bad.join('\n  '));

  let suppressed = 0;
  for (let k = 0; k + 1 < RINGS.length; k++) if (hop(k, k + 1, false).ok) suppressed++;
  assert.equal(suppressed, 0,
    `${suppressed} hops "caught" the next ring with the release suppressed, so this arm is not `
    + 'measuring a release-and-catch and would pass on a chain nobody can traverse');

  /* the dismount */
  const A = V(...RINGS[4]);
  hardReset(c.engine ?? undefined, c, A.clone().add(V(0, -TUNE.hookL, 0)), Math.PI);
  c.velocity.set(0, 0, 0);
  for (let i = 0; i < 40 && c.stateName !== 'hookSwing'; i++) {
    step((inp) => { aim(0.6, -52); inp.move.y = 1; if (i % 4 === 0) inp.hold('interact'); else inp.let_go('interact'); });
  }
  let released = false, impact = 0, landedY = null;
  for (let i = 0; i < 200; i++) {
    step((inp) => { aim(0.6, -52); inp.move.y = 1; if (!released && i === 8) inp.hold('jump'); else inp.let_go('jump'); });
    if (!released && i >= 8 && c.stateName !== 'hookSwing') released = true;
    if (released) impact = Math.min(impact, c.velocity.y);
    if (released && c.grounded) { landedY = c.position.y; break; }
  }
  assert.ok(landedY !== null, 'stepping off the last ring never reached the ground');
  assert.ok(Math.abs(impact) < TUNE.landHard,
    `the dismount arrives at ${Math.abs(impact).toFixed(1)} m/s against landHard ${TUNE.landHard}. The `
    + 'chain is hung low precisely so that stepping off is a landing and not a punishment — if this '
    + 'has risen the rings were raised and the dismount needs re-siting, not the threshold');
  console.log(`[navefork N] 5/5 rings taken from the floor · 4/4 hops catch (0 with the release `
    + `suppressed) · dismount ${Math.abs(impact).toFixed(1)} m/s onto y ${landedY.toFixed(2)}`);
});

/* ====================================================================================== */
test('navefork F: the fork is chosen by AIM, and the second verb still works', async () => {
  /* THE POINT OF THE FILE, and it has moved once already — the record is in the arm because the
   * arm is what moved it.
   *
   * Written at §575 this asserted that E gives the hook EVEN WHEN AIMED AT THE ROPE, with the
   * note "if entry now resolves by aim, re-read this arm before trusting it". §579 made entry
   * resolve by aim and this arm went red, on purpose, and is now re-based on the new behaviour:
   * the fork is chosen the way a player would expect, by pointing at the thing you want.
   *
   * DOMAIN (§418.3)
   * passes on : the shipped fork — from one settled stance, E aimed at the ring gives
   *             `hookSwing`, E aimed at the rope gives `poleClimb`, and walking into the shaft
   *             with no E at all still gives `poleClimb`.
   * fails  on : RUN IN-ARM — the two E presses must give DIFFERENT states. A build where both
   *             give the same one has either lost the chooser (back to tag priority) or lost one
   *             of the two branches, and either way this stretch scores 2 on the metric and
   *             plays as 1.
   * control   : RUN IN-ARM — the same walk, at a stance on the same chain with no rope in
   *             range, must NOT enter `poleClimb`; otherwise "walking mounts the rope" would be
   *             indistinguishable from "walking mounts anything".
   * does NOT  : claim a player discovers the two verbs, or re-test the chooser's own guarantees
   * discrim.    (telegraph and auto-grab unmoved) — those are `tests/epress.test.mjs`.
   */
  const { c, aim, step, settle } = await harness();

  const press = (tx, tz) => {
    settle(FORK[0], FORK[1]);
    for (let i = 0; i < 90; i++) {
      step((inp) => { aim(tx, tz); if (i === 5) inp.hold('interact'); else inp.let_go('interact'); });
      if (c.stateName === 'hookSwing' || c.stateName === 'poleClimb') return c.stateName;
    }
    return c.stateName;
  };
  /* Drive the whole 200 frames rather than returning on the mount frame: `poleClimb` is entered
     at the foot of the shaft (y 0.20), so stopping at first sight of it measures the mount and
     calls it a climb. The height that means anything is the one after the stick has been held. */
  const walkInto = (x, z, tx, tz) => {
    settle(x, z);
    let mounted = false;
    for (let i = 0; i < 200; i++) {
      step((inp) => { aim(tx, tz); inp.move.y = 1; inp.let_go('interact'); });
      if (c.stateName === 'poleClimb') mounted = true;
    }
    return { state: mounted ? 'poleClimb' : c.stateName, y: c.position.y, ended: c.stateName };
  };

  const atRing = press(RINGS[2][0], RINGS[2][2]);
  const atRope = press(ROPE[0], ROPE[1]);
  assert.equal(atRing, 'hookSwing', 'E facing the ring did not enter hookSwing — the high branch is gone');
  assert.equal(atRope, 'poleClimb',
    `E facing the ROPE entered ${atRope}, not poleClimb. §579's chooser scores each tag's best `
    + 'candidate by distance x the facing weight, so a press aimed at the shaft must mean the shaft');
  /* the failing input, run in-arm: the two presses must not collapse to one answer */
  assert.notEqual(atRing, atRope,
    `both E presses gave ${atRing} regardless of aim. That is the pre-§579 behaviour — one button `
    + 'resolving by tag priority — and it means there is no fork here at all, only a metric that '
    + 'counts two things in range');

  const rope = walkInto(FORK[0], FORK[1], ROPE[0], ROPE[1]);
  assert.equal(rope.state, 'poleClimb',
    `walking into the rope from the fork stance ended in ${rope.state}, not poleClimb — the low `
    + 'branch cannot be chosen, so this stretch scores 2 on the metric and plays as 1');
  assert.ok(rope.y > 3.0,
    `the rope mounted but only reached y ${rope.y.toFixed(2)}; the low branch has to actually climb`);

  /* control: the same walk where no rope is in range must not mount anything */
  const ctrl = walkInto(RINGS[3][0], RINGS[3][2], RINGS[3][0] + 2.4, RINGS[3][2]);
  assert.notEqual(ctrl.state, 'poleClimb',
    'CONTROL: walking at empty air under ring 3 also entered poleClimb, so the mount above is not '
    + 'evidence the rope did anything');
  console.log(`[navefork F] E at the ring -> hookSwing, E at the rope -> poleClimb · walk -> poleClimb y `
    + `${rope.y.toFixed(2)} · control walk -> ${ctrl.state}`);
});

/* ====================================================================================== */
test('navefork G: branch factor after, with the hook+hook pairs counted apart from the real fork', async () => {
  /* §570 reported 0 on 170 samples. This reports the same metric on the same walked line, and
   * splits it, because two rings of one chain in range at once is NOT a choice of route — E
   * picks one of them for the player (arm F).
   *
   * DOMAIN (§418.3)
   * passes on : the shipped hall — samples of the nave floor where two affordances are in gate,
   *             including at least one stance carrying a hook AND a pole.
   * fails  on : RUN IN-ARM — the same sweep with the hook gate shrunk to the pole's 2.85 m,
   *             which must collapse the mixed-kind count to 0. That proves the mixed samples
   *             come from the hook's REACH and not from the sampling.
   * does NOT  : re-measure the whole route (that is `routeplay` R1's job) or claim the gaps
   * discrim.    elsewhere on the level improved.
   */
  const { collision } = await harness();
  const GATES = [
    ['pole', 0.95, TUNE.poleMount * 1.5],
    ['rail', 0.55, TUNE.railMount * 1.6],
    ['hook', 1.15, TUNE.hookGrab],
    ['spire', 0.30, TUNE.spireGrab ?? 3.0],
  ];
  const sweep = (gates) => {
    const out = { mixed: 0, same: 0, one: 0, none: 0 };
    for (let z = -20; z >= -51; z -= 0.5) {
      const g = collision.groundCheck(V(0, 3, z), TUNE.radius, 8);
      const feet = V(0, g?.hit ? g.y : 0, z);
      const recs = new Set();
      for (const [tag, eye, range] of gates) {
        for (const h of collision.query(V(feet.x, feet.y + eye, feet.z), range, [tag]) || []) if (h.rec) recs.add(h.rec);
      }
      if (recs.size === 0) out.none++;
      else if (recs.size === 1) out.one++;
      else if (new Set([...recs].map((r) => r.tag)).size > 1) out.mixed++;
      else out.same++;
    }
    return out;
  };
  const now = sweep(GATES);
  assert.ok(now.mixed > 0,
    'no stance on the nave floor carries two DIFFERENT affordance kinds at once, so the level has '
    + 'no fork — only a chain and a rope that never overlap');
  assert.ok(now.mixed + now.same > 0, 'branch factor is still 0 everywhere on the hall floor');

  /* failing input: shrink the hook's reach to the pole's and the mixed samples must vanish */
  const shrunk = sweep(GATES.map(([t, e, r]) => [t, e, t === 'hook' ? TUNE.poleMount * 1.5 : r]));
  assert.equal(shrunk.mixed, 0,
    `with the hook gate cut to the pole's ${(TUNE.poleMount * 1.5).toFixed(2)} m, ${shrunk.mixed} `
    + 'mixed-kind stances survive. They should all vanish — if they do not, they are an artefact of '
    + 'the sweep rather than a product of the hook reaching across the room');
  console.log(`[navefork G] nave floor at 0.5 m: ${now.mixed} stances carry two different kinds, `
    + `${now.same} carry two of the same, ${now.one} carry one, ${now.none} carry none `
    + `(hook gate cut to 2.85 -> mixed ${shrunk.mixed})`);
});
