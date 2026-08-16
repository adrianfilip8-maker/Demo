/**
 * camspeed.test.mjs — the speed dolly, bracketed in both directions.
 *
 * ── why this is not in camera.test.mjs ─────────────────────────────────────────────────────
 * That file states its design and defends it: *"the player is a stub, not the real Controller …
 * driving the real controller would couple every camera assertion to `Moveset.js`'s tuning."*
 * That is right, and it is why the dolly's SIZE cannot be settled there. The size was chosen by
 * the level — the hypostyle nave's column spacing against the boom length — so the arm that pins
 * it needs real terrain, architecture, props and collision. Rather than drag a real world into a
 * file whose whole premise is that it does not have one, the boom-vs-speed half runs on the same
 * stub camera.test.mjs uses, and the level half boots the world here.
 *
 * ── the decision this pins ────────────────────────────────────────────────────────────────
 * `FRAMES` carries an authored speed ladder (walk/run/run_fast `dist` 0.20/0.90/1.60) that
 * nothing reaches: the moveset's only ground locomotion state is `move`, which matches no
 * `STATE_RULES` key and falls to the `idle` default. So the shipped boom was 5.400 m at a stand
 * and 5.400 m at a full sprint. The fix is NOT to light up that ladder — measured, its +1.60 m
 * asks for more boom than the room it is spent in will give — but a continuous `distSpeedGain`
 * on the smoothed ground speed, sized at 0.30 m by what the nave absorbs.
 *
 * ── both directions, because one bound is not a bracket ───────────────────────────────────
 *   LOW   the boom must actually move with speed.  Planted: `distSpeedGain` 0 — the state that
 *         shipped for the whole life of the rig — must be REJECTED by the same predicate.
 *   HIGH  and must not move so far the columns take it back. Planted: the authored ladder's own
 *         1.60 m must be REJECTED by the same predicate.
 * The shipped 0.30 must sit inside both. A bar with only the low arm would accept +1.60; a bar
 * with only the high arm would accept 0, which is the defect being fixed. §408.3 / §409.3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';
import { TUNE as CTUNE } from '../src/player/Controller.js';

const RUN = CTUNE.runSpeed;

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

class StubInput {
  constructor() { this.look = { x: 0, y: 0 }; this.move = { x: 0, y: 0 }; this.zoom = 0; }
  pressed() { return false; }
  down() { return false; }
}
class StubCollision {
  constructor() { this.ready = true; this.raycast = () => null; this.capsuleSweep = () => null; }
  query() { return []; }
  overlap() { return false; }
}

function baseEngine(collision) {
  const movement = {
    position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    grounded: true, stateName: 'idle', yaw: Math.PI,
  };
  const listeners = new Map();
  return {
    input: new StubInput(),
    camera: new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 1000),
    scene: new THREE.Scene(), movement, collision,
    time: 0, dt: 0, timeScale: 1, width: 1920, height: 1080, quality: 'high',
    debug: { freeCam: false, showColliders: false, wireframe: false },
    warn() {}, has() { return false; },
    on(e, f) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e).add(f); return () => {}; },
    emit(e, p) { for (const f of listeners.get(e) || []) f(p); },
    get(n) { return n === 'movement' ? this.movement : n === 'collision' ? this.collision : null; },
  };
}

/** Hold a constant ground speed until the rig has settled, then read the boom. */
function settledBoom(speed, seconds = 6) {
  const engine = baseEngine(new StubCollision());
  const rig = new CameraRig(engine);
  rig.init?.();
  const mv = engine.movement;
  mv.stateName = speed > 0 ? 'move' : 'idle';
  mv.velocity.set(0, 0, -speed);
  rig.snap?.(true);
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    mv.position.z -= speed * dt;
    engine.dt = dt; engine.time += dt;
    rig.update(dt);
  }
  return rig.boom;
}

/** Temporarily run with a different dolly gain, always restoring it. */
function withGain(g, fn) {
  const keep = TUNE.distSpeedGain;
  TUNE.distSpeedGain = g;
  try { return fn(); } finally { TUNE.distSpeedGain = keep; }
}

/* ====================================================================== */

test('C1: the boom moves with ground speed, by exactly the designed amount', () => {
  /* The predicate is "how many metres does the boom gain between a stand and a full sprint".
     It has to be able to answer both "none" and "the designed amount", so both are measured. */
  const gain = (g) => withGain(g, () => settledBoom(RUN) - settledBoom(0));

  /* PLANTED — the state that shipped until this change. Nothing keys on speed, so the boom
     cannot move, and the predicate must say so. */
  const off = gain(0);
  console.log(`  C1: distSpeedGain 0 -> boom gains ${off.toFixed(6)} m from stand to sprint`);
  assert.ok(Math.abs(off) < 1e-6,
    `with the dolly gain at zero the boom still moved ${off.toFixed(4)} m with speed. Something ELSE `
    + 'is now coupling the boom to velocity, so this arm is no longer measuring `distSpeedGain` and '
    + 'the bracket below is attributing that other term to it');

  /* SHIPPED — and it must land on the closed form, not merely somewhere above zero. `_speedNorm`
     saturates at `speedRef`, and the player tops out below it, so the delivered dolly is the
     gain scaled by that ratio. Deriving it rather than restating a measured number is what makes
     this track the constants instead of freezing an afternoon's reading. */
  const predicted = TUNE.distSpeedGain * Math.min(RUN / TUNE.speedRef, 1);
  const live = gain(TUNE.distSpeedGain);
  console.log(`  C1: distSpeedGain ${TUNE.distSpeedGain} · runSpeed ${RUN} / speedRef ${TUNE.speedRef} `
    + `-> predicted ${predicted.toFixed(4)} m · measured ${live.toFixed(4)} m`);
  assert.ok(Math.abs(live - predicted) < 1e-3,
    `the boom gains ${live.toFixed(4)} m with speed against a closed form of ${predicted.toFixed(4)} m. `
    + 'They are the same quantity computed two ways, so a divergence means some other term is '
    + 'adding to the boom under speed, or the dolly is being clamped before it lands');
  assert.ok(live > off,
    'the shipped configuration does not move the boom any further than the zero-gain one, so the '
    + 'dolly is not reaching `_boomWant` at all');

  /* The FOV stretch shares `_speedSm` with the dolly now. If the shared read regressed, the two
     would disagree about full speed — so check the lens still moves too, from the same source. */
  const engine = baseEngine(new StubCollision());
  const rig = new CameraRig(engine);
  rig.init?.();
  rig.snap?.(true);
  const dt = 1 / 60;
  engine.movement.stateName = 'move';
  engine.movement.velocity.set(0, 0, -RUN);
  for (let i = 0; i < 360; i++) {
    engine.movement.position.z -= RUN * dt; engine.dt = dt; engine.time += dt; rig.update(dt);
  }
  const fovPred = TUNE.fovBase + Math.min(RUN / TUNE.speedRef, 1) * TUNE.fovSpeedGain;
  console.log(`  C1: fov at sprint ${engine.camera.fov.toFixed(3)} against closed form ${fovPred.toFixed(3)}`);
  assert.ok(Math.abs(engine.camera.fov - fovPred) < 0.05,
    `the FOV stretch reads ${engine.camera.fov.toFixed(2)} against ${fovPred.toFixed(2)}. It shares `
    + '`_speedSm` with the dolly, so this catches the shared read being broken by a change to either');
});

/* ---------------------------------------------------------------------- */
/* the level half                                                          */
/* ---------------------------------------------------------------------- */

async function realWorld() {
  const { Terrain } = await import('../src/world/Terrain.js');
  const { Architecture } = await import('../src/world/Architecture.js');
  const { Props } = await import('../src/world/Props.js');
  const { Collision } = await import('../src/world/Collision.js');
  const queued = [], mods = {};
  let collision = null;
  const engine = baseEngine(null);
  engine.get = (m) => (m === 'collision' ? collision : m === 'movement' ? engine.movement : (mods[m] || null));
  engine.registerCollider = (mesh, opts = {}) => {
    const rec = { mesh, tag: opts.tag || 'ground', climbable: !!opts.climbable,
      material: opts.material || 'stone', oneWay: !!opts.oneWay, ...opts };
    if (collision?.add) collision.add(rec); else queued.push(rec);
    return rec;
  };
  mods.terrain = new Terrain(engine); await mods.terrain.init();
  mods.architecture = new Architecture(engine); await mods.architecture.init();
  mods.props = new Props(engine); await mods.props.init();
  collision = new Collision(engine);
  for (const r of queued) collision.add(r);
  await collision.init();
  return engine;
}

const ENGINE = await realWorld();

/**
 * Sprint the hypostyle nave and score how hard the columns cut the boom.
 *
 * The run STARTS IN THE COURTYARD and only the hall is scored. That is not padding: the rig eases
 * its orbit yaw toward the direction of travel over ~2-3 s, the hall is 4.7 s long, and scoring
 * from a standing start measures the settle rather than the run — with the camera swung metres
 * off the lane and parked inside a column. A first version of this measurement did exactly that
 * and produced a clean, monotonic, entirely false result. `lateral` is returned so the arm can
 * assert the camera really is trailing before it believes anything else.
 */
const START_Z = 12, HALL_Z0 = -17, HALL_Z1 = -51;
function naveSprint(bucket, lane = 0) {
  const engine = ENGINE, mv = engine.movement;
  const rig = new CameraRig(engine);
  rig.init?.();
  mv.position.set(lane, 0, START_Z);
  mv.velocity.set(0, 0, -RUN);
  mv.yaw = Math.PI; mv.stateName = 'move'; mv.grounded = true;
  rig.snap?.(true);
  const dt = 1 / 60;
  let n = 0, over = 0, worst = 0, boomSum = 0, lateral = 0;
  for (let z = START_Z; z > HALL_Z1; z -= RUN * dt) {
    mv.position.set(lane, 0, z);
    engine.dt = dt; engine.time += dt;
    rig.update(dt);
    if (z > HALL_Z0) continue;                       // run-up: settle only, never scored
    const cut = Math.max(0, rig._boomWant - rig.boom);
    n++; boomSum += rig.boom;
    if (cut > bucket) over++;
    if (cut > worst) worst = cut;
    lateral = Math.max(lateral, Math.abs(engine.camera.position.x - lane));
  }
  return { n, over: over / n, worst, boom: boomSum / n, lateral };
}

test('C2: and not far enough for the nave to take it back', () => {
  /* THE BUCKET IS DERIVED, NOT FITTED (§141.1). A cut is counted when it exceeds `2 * camRadius`
     — the camera pushed in by more than its own collision diameter, which is where a graze along
     a column becomes a distinct camera move. `camRadius` is the rig's own sphere-cast radius and
     is read from TUNE, so the bucket tracks the constant rather than freezing 0.68 m. It was
     fixed before the sides were known; it is not a number picked because it separated them. */
  const BUCKET = 2 * TUNE.camRadius;

  /* the harness's own precondition: if the camera is not trailing, nothing below means anything */
  const shipped = naveSprint(BUCKET);
  console.log(`  C2: bucket ${BUCKET.toFixed(2)} m (2 x camRadius ${TUNE.camRadius}) · `
    + `${shipped.n} scored frames · camera lateral wander ${shipped.lateral.toFixed(3)} m`);
  assert.ok(shipped.n > 200, `only ${shipped.n} frames scored — the nave run did not happen`);
  assert.ok(shipped.lateral < 0.05,
    `the camera wandered ${shipped.lateral.toFixed(2)} m off the lane it is supposed to be trailing. `
    + 'The rig has not settled by the time scoring starts, so these frames are the yaw transient '
    + 'and not the sprint — lengthen the run-up before reading anything else here');

  console.log(`  C2: shipped gain ${TUNE.distSpeedGain} -> ${(100 * shipped.over).toFixed(1)} % of frames `
    + `cut past ${BUCKET.toFixed(2)} m · worst ${shipped.worst.toFixed(3)} m · mean boom ${shipped.boom.toFixed(3)} m`);

  /* ── the HIGH bracket. The authored ladder's own number, read out of the framing table so it
     cannot drift away from what it is checking, must be rejected by this predicate. ────────── */
  const SRC = readFileSync(new URL('../src/player/CameraRig.js', import.meta.url), 'utf8');
  const rf = /^\s{2}run_fast:\s*\{ dist:\s*(-?[\d.]+)/m.exec(SRC);
  assert.ok(rf, 'could not read FRAMES.run_fast.dist out of CameraRig.js — re-anchor this arm');
  const LADDER = Number(rf[1]);
  const ladder = withGain(LADDER, () => naveSprint(BUCKET));
  console.log(`  C2: authored ladder ${LADDER} -> ${(100 * ladder.over).toFixed(1)} % of frames cut past `
    + `${BUCKET.toFixed(2)} m · worst ${ladder.worst.toFixed(3)} m`);
  assert.ok(ladder.over > 0,
    `the authored ladder's ${LADDER} m dolly costs nothing in the nave either. Then this arm cannot `
    + 'distinguish the shipped size from the one that was rejected, the bracket has no upper bound, '
    + 'and the reason recorded for choosing 0.30 over 1.60 no longer holds — re-measure before '
    + 'trusting either');
  assert.ok(shipped.over < ladder.over,
    `the shipped dolly cuts as hard as the authored ${LADDER} m one, so it was not sized by the level `
    + 'at all and the argument in `distSpeedGain` is wrong');

  /* ── the shipped size must sit under the budget outright, not merely under the ladder ────── */
  assert.equal(shipped.over, 0,
    `${(100 * shipped.over).toFixed(1)} % of nave sprint frames are now cut past ${BUCKET.toFixed(2)} m. `
    + 'The dolly was sized at 0.30 m precisely because that fraction was zero — the columns take '
    + 'back anything larger. Either the gain grew, the boom grew under it, or the hall changed');

  /* ── the LOW bracket, on the same run: turning the dolly off must be visible here too, or the
     level half is measuring a constant. ───────────────────────────────────────────────────── */
  const off = withGain(0, () => naveSprint(BUCKET));
  console.log(`  C2: dolly off -> mean boom ${off.boom.toFixed(3)} m vs shipped ${shipped.boom.toFixed(3)} m `
    + `(+${(shipped.boom - off.boom).toFixed(3)} m delivered of ${(TUNE.distSpeedGain * RUN / TUNE.speedRef).toFixed(3)} asked)`);
  assert.ok(shipped.boom > off.boom + 0.15,
    `the nave delivers only ${(shipped.boom - off.boom).toFixed(3)} m of the dolly. If the columns are `
    + 'eating it here, the dolly is invisible in the room it was sized for and the size is wrong');
});
