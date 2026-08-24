import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Guards, GUARD_TUNE } from '../src/ai/Guard.js';

/**
 * guardground — a guard's support must be a surface he could actually stand on.
 *
 * ── What this file is, and what it is NOT ──────────────────────────────────────────────────
 *
 * **The evidence for the fix is not here.** It is in the running game: `tools/guardfloat.mjs`
 * walks all nine guards through the shipped `Guards.update` path in a booted level and
 * measures each one's lowest skinned foot vertex against a raycast of the RENDERED scene, and
 * `tools/guardlift.mjs` traces the individual frame on which a guard leaves the floor. Three
 * of the nine stood 1.32 m, 1.95 m and 1.82 m above the paving and never came down.
 *
 * A stub cannot establish that, and must not be read as if it had (§439/§440): a stub is built
 * from the same model of the world as the code under test, so it can only confirm the model.
 * What it CAN do is hold the fix in place — the two rules below are cheap to delete by accident
 * and expensive to rediscover, and they are the kind of thing a later refactor "simplifies"
 * back out. So the stub here is not an invented shape. Both scenarios reproduce numbers
 * measured in the level, and the measurements are quoted at each one.
 *
 * ── The two rules, and why neither alone is enough ────────────────────────────────────────
 *
 * `Collision.groundCheck` sweeps a sphere and reports the height of the sphere's BOTTOM at
 * contact — the surface height only when the contact is directly underneath. Two different
 * things went wrong with that, and each is invisible to the other's fix:
 *
 *   1. LATERAL GRAZE. The probe touches the top edge of a crate a probe-radius to one side and
 *      reports a height no surface occupies. Measured on guard1: no support at all at radius
 *      0.02-0.25, then y 1.289 at 0.294, y 1.406 at 0.392, y 1.428 at 0.450 — an answer that
 *      moves with the probe, where a real floor reads the same height at every radius. Its
 *      slope was 10.4 deg and its `walkable` flag was true, so no slope rule can see it.
 *      Caught by `TUNE.groundProbe`.
 *
 *   2. STEEP FACE. `Props` registers every solid prop as a collider tagged `ground` — props
 *      ARE standable — so the wall of a brazier bowl is floor as far as `groundCheck` is
 *      concerned, and it is genuinely underneath him, so no narrow probe can see it. Traced
 *      frame by frame, guard1 left the pavement onto an 87.2 deg face and then a 46.0 deg one.
 *      Caught by `TUNE.groundSlopeMax`.
 *
 * Each test below therefore runs BOTH arms against the SAME stub (§418.3): the rule off, where
 * the guard is lifted, and the rule on, where he is not. A test that only ran the passing arm
 * would keep passing if the rule were deleted.
 */

/* --------------------------------------------------------------------------------------- */
/* stubs                                                                                     */
/* --------------------------------------------------------------------------------------- */

/**
 * A floor at y = 0 plus one obstacle, answered the way the real `Collision` answers.
 *
 * **The obstacle is described by the probe's measured RESPONSE, not by invented geometry.** An
 * earlier version of this stub modelled the brazier as a box and walked the guard into it, which
 * measures the box someone typed rather than the defect. What was actually measured is a
 * response curve — at guard1's stand, `groundCheck` returned no support at all for radii 0.02
 * through 0.25, and a support from 0.294 upward whose height climbed with the radius. So that
 * is what `minRadius` and `growth` encode. Nothing here claims to know the brazier's shape;
 * the shape is `Props`' business and the fix does not depend on it.
 *
 * `groundCheck` here takes `radius` seriously, which the stub in `src/ai/Guard.test.mjs` does
 * not — and that is the whole point: the defect is a function of the probe radius, so a stub
 * that ignores the radius cannot express it in either direction.
 */
class Stub {
  /**
   * @param {object} o
   * @param {number} o.minRadius smallest probe radius that finds this surface at all. > 0 models
   *                             the lateral graze; 0 means it is directly beneath him and every
   *                             probe finds it.
   * @param {number} o.reach     how far outside the footprint the probe may stand and still find
   *                             it — again the graze, and 0 for a surface underfoot.
   * @param {number} o.topY      the height reported at `minRadius`
   * @param {number} o.growth    extra height per extra metre of probe radius. A real surface
   *                             reads the same height at every radius, so this is 0 for one.
   * @param {number} o.slopeDeg  the surface normal's tilt
   * @param {number[]} o.at      obstacle centre [x, z]
   * @param {number} o.span      obstacle half-extent in XZ
   */
  constructor(o = {}) {
    this.o = { minRadius: 0, reach: 0, topY: 0.4, growth: 0, slopeDeg: 0, at: [0, 4], span: 1.2, ...o };
    this.ready = true;
    this.calls = [];
    this._g = { hit: false, y: 0, normal: new THREE.Vector3(0, 1, 0), slope: 0, distance: 0,
                tag: 'ground', material: 'stone', walkable: true, oneWay: false, rec: null };
    this._r = { hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
                distance: 0, tag: 'wall', rec: null };
  }

  /** Forward rays never hit: this file is about the DOWNWARD probe, nothing else. */
  raycast() { this._r.hit = false; return this._r; }

  groundCheck(pos, radius, maxDist) {
    const o = this.o;
    this.calls.push({ radius, maxDist, x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) });
    const g = this._g;
    g.hit = false;

    // Is the obstacle in reach of a probe of this radius at this XZ?
    const dx = Math.abs(pos.x - o.at[0]), dz = Math.abs(pos.z - o.at[1]);
    const gap = Math.max(dx - o.span, dz - o.span);          // 0 inside, >0 outside
    const inReach = gap <= o.reach + 1e-9 && radius >= o.minRadius - 1e-9;
    if (inReach) {
      const top = o.topY + Math.max(0, radius - o.minRadius) * o.growth;
      /* A lateral graze contacts as soon as the sweep starts, because sliding the sphere DOWN
         does not change its horizontal distance to the face it is touching. So the height comes
         back at the very top of the probe's band, not at the obstacle's own height — measured on
         guard1 as a `distance` of -0.010 to -0.060 against a `groundLift` of 0.06, i.e. the
         answer is `pos.y + lift` clamped by the obstacle. That is also why the guard climbed in
         two stages rather than one: each step can only lift him to the top of his own band. */
      const y = Math.min(top, pos.y + 0.06);
      // The real call reports the floor band [pos.y + lift, pos.y - maxDist], radius-independent.
      if (y <= pos.y + 0.06 + 1e-6 && pos.y - y <= maxDist) {
        g.hit = true; g.y = y;
        g.slope = o.slopeDeg * THREE.MathUtils.DEG2RAD;
        g.normal.set(0, Math.cos(g.slope), Math.sin(g.slope));
        g.walkable = o.slopeDeg <= 50;                        // Collision.TUNE.slopeWalkableDeg
        g.distance = pos.y - y;
        return g;
      }
    }
    // otherwise the flat floor at y = 0
    if (pos.y - 0 <= maxDist && 0 <= pos.y + 0.06 + 1e-6) {
      g.hit = true; g.y = 0; g.slope = 0; g.normal.set(0, 1, 0); g.walkable = true;
      g.distance = pos.y;
    }
    return g;
  }
}

class StubEngine {
  constructor(collision) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.quality = 'low';
    this.warnings = [];
    this.debug = { timeOfDay: 0.8 };
    this.time = 0;
    this._m = new Map([['collision', collision],
      ['movement', { position: new THREE.Vector3(0, 0, 900), velocity: new THREE.Vector3(),
                     speed: 0, maxSpeed: 7.2, grounded: true, stateName: 'idle' }]]);
  }
  get(k) { return this._m.get(k) ?? null; }
  has(k) { return this._m.has(k); }
  warn(m) { this.warnings.push(String(m)); }
  on() { return () => {}; }
  emit() {}
  registerCollider() { return {}; }
}

/** One real `Guard`, placed by the shipped placement path onto the stub's flat floor. */
async function subject(stub) {
  const engine = new StubEngine(stub);
  const guards = new Guards(engine);
  await guards.init();
  guards.collision = stub;
  const g = guards.guards.find((x) => x.type === 'temple') || guards.guards[0];
  g._place(new THREE.Vector3(0, 0, 0));
  return { guards, g };
}

/**
 * Walk him at the obstacle with the shipped `_step`, the same call `_locomote` makes, for as
 * many frames as it takes to cross it. Not a teleport: every metre is a real step, and the
 * ground probe runs on each one exactly as it does in the game (§435.4).
 */
function walkAt(g, x, z, frames = 240) {
  let maxY = g.position.y;
  for (let i = 0; i < frames; i++) {
    g._step(1 / 60, x, z, 1.2);
    if (g.position.y > maxY) maxY = g.position.y;
  }
  return { maxY, end: { x: +g.position.x.toFixed(3), y: +g.position.y.toFixed(4), z: +g.position.z.toFixed(3) } };
}

/** Run `fn` with TUNE keys temporarily overridden, always restoring them. */
async function withTune(over, fn) {
  const keep = {};
  for (const k of Object.keys(over)) { keep[k] = GUARD_TUNE[k]; GUARD_TUNE[k] = over[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(keep)) GUARD_TUNE[k] = keep[k]; }
}

/* --------------------------------------------------------------------------------------- */

test('the seal: both ground rules ship at the values the measurement chose', () => {
  assert.equal(GUARD_TUNE.groundProbe, 0.06,
    'groundProbe is the guard\'s downward probe radius. 0 restores the pre-fix `radius * 0.7`, '
    + 'which measured three of nine guards standing 1.3-2.0 m above the floor.');
  assert.equal(GUARD_TUNE.groundSlopeMax, 30,
    'groundSlopeMax is the steepest surface a guard accepts as floor. Measured: every real '
    + 'guard floor in the level reads 0.00 deg (rooftop peaks at 6.95); the two faces that '
    + 'lifted a guard read 45.96 and 87.23.');
  assert.ok(GUARD_TUNE.groundSlopeMax < 50,
    'must stay stricter than Collision.TUNE.slopeWalkableDeg (50), which is the PLAYER\'s limit: '
    + 'he has gravity and a slide, a guard has his height assigned outright and never comes down.');
});

test('LATERAL GRAZE: the fat probe finds a crate beside him; the narrow one does not', async () => {
  /* The measured shape on guard1, before the fix: nothing at radius <= 0.25, then a support at
     0.294 whose height climbs with the radius — 1.289 / 1.406 / 1.428 at 0.294 / 0.392 / 0.450.
     Flat-normalled and `walkable`, so only the probe width can see it. */
  const shape = { minRadius: 0.28, reach: 0.28, topY: 1.29, growth: 1.4, slopeDeg: 10.4,
                  at: [0, 4.5], span: 0.9 };

  const fail = await withTune({ groundProbe: 0 }, async () => {       // pre-fix: radius * 0.7
    const { g } = await subject(new Stub(shape));
    return walkAt(g, 0, 9);
  });
  assert.ok(fail.maxY > 1.0,
    `pre-fix arm should be lifted onto the phantom, got maxY ${fail.maxY.toFixed(3)} — if this `
    + 'stops failing the stub no longer reproduces the defect and the arm below proves nothing');

  const pass = await withTune({ groundProbe: 0.06 }, async () => {
    const { g } = await subject(new Stub(shape));
    return walkAt(g, 0, 9);
  });
  assert.ok(pass.maxY < 0.05,
    `fixed arm must stay on the floor, got maxY ${pass.maxY.toFixed(3)}`);
});

test('STEEP FACE: directly underneath, so no probe width can see it — the slope rule can', async () => {
  /* guard1's second lift, traced at t = 3.433 s: y 0 -> 0.369 on a face with n.y 0.695,
     slope 45.99 deg, `walkable` YES. Directly beneath him — a narrow probe finds it too. */
  const shape = { minRadius: 0, reach: 0, topY: 0.369, growth: 0, slopeDeg: 45.99,
                  at: [0, 4.5], span: 0.9 };

  const fail = await withTune({ groundSlopeMax: 0 }, async () => {    // rule disabled
    const { g } = await subject(new Stub(shape));
    return walkAt(g, 0, 9);
  });
  assert.ok(fail.maxY > 0.3,
    `with the slope rule off he must climb the face, got maxY ${fail.maxY.toFixed(3)}`);

  const pass = await withTune({ groundSlopeMax: 30 }, async () => {
    const { g } = await subject(new Stub(shape));
    return walkAt(g, 0, 9);
  });
  assert.ok(pass.maxY < 0.05,
    `with the rule on he must stay on the floor, got maxY ${pass.maxY.toFixed(3)}`);
});

test('and neither rule refuses a real step: a flat 0.40 m riser is still climbed', async () => {
  /* The failure mode of both rules is over-refusal — a guard who will not step onto anything.
     `stepUp` is 0.85, so a flat 0.40 m riser directly under him is a step he is supposed to
     take, and he must still take it with both rules at their shipped values. */
  const shape = { minRadius: 0, reach: 0, topY: 0.40, growth: 0, slopeDeg: 0,
                  at: [0, 4.5], span: 1.5 };
  const { g } = await subject(new Stub(shape));
  const r = walkAt(g, 0, 6);
  assert.ok(Math.abs(r.end.y - 0.40) < 1e-3,
    `should be standing on the riser at 0.40, got ${r.end.y}`);
});

test('a guard is probed with a radius that cannot reach past his own feet', async () => {
  const stub = new Stub({ minRadius: 0, reach: 0, topY: 0, growth: 0, slopeDeg: 0, at: [99, 99], span: 0.1 });
  const { g } = await subject(stub);
  walkAt(g, 0, 3, 30);
  const radii = [...new Set(stub.calls.map((c) => c.radius))];
  assert.deepEqual(radii, [0.06],
    `every groundCheck must use TUNE.groundProbe, saw ${JSON.stringify(radii)}`);
  assert.ok(g.radius > 0.06 * 3,
    'and it must be far narrower than the body radius the forward rays keep clear');
});
