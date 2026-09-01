import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import * as K from '../src/world/Kit.js';
import { Architecture } from '../src/world/Architecture.js';
import { buildEgyptLevel } from '../src/world/EgyptLevel.js';
import { Guards, GUARD_TUNE } from '../src/ai/Guard.js';
import {
  ROUTES, ROSTER, VISION, DETECT, STATE, Route, buildRoutes, Senses,
  stateForSuspicion, coneColourStop,
} from '../src/ai/Patrol.js';
import { TUNE as PLAYER } from '../src/player/Controller.js';

/**
 * The guard patrols, measured against the temple they are supposed to walk in.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────────────────
 * `src/ai/Guard.test.mjs` has 44 tests and they all pass. They run the shipped `Guards` module
 * against a **stub** world: five hand-placed boxes and four rectangular floors, one of which is
 * a flat plane covering the whole map at y = 0. That suite proves the follower code is correct
 * — the spline maths, the alert machine, the wall refusal, the cone transforms — and it is
 * completely blind to the question of whether the authored waypoints lie anywhere a guard can
 * stand in the real level. Under it, `hall_weave` ran its north-south legs straight down the
 * line of the aisle columns and passed every test in the file.
 *
 * So: this suite builds the **shipped level** (`buildEgyptLevel`, ~1.3 s, plain Node, no
 * browser, no renderer, no lock), harvests every collision proxy it registers into a world-space
 * AABB, and serves the real `raycast` / `groundCheck` contract off those boxes. The guards then
 * walk the actual temple.
 *
 * The first run convicted **6 of 9 routes and 8 of 11 guards**. See `KNOWN_ISSUES.md` §230 and
 * `progress/records/PREREG-routeaudit.md` / `PREREG-patrolgap.md`, which hold the thresholds —
 * every one of them sealed before the corresponding measurement.
 *
 * ── The rule every data-driven test here obeys (§211.1) ───────────────────────────────────
 * Nine assertions once passed in this project while inspecting nothing, because they read a
 * field that did not exist. **Every test below counts what it inspected and asserts the count
 * is non-zero.** A passing test has to prove it looked.
 *
 * ── Calibration ───────────────────────────────────────────────────────────────────────────
 * Every measurement carries a positive arm that MUST fire, because an instrument that cannot
 * demonstrate it can see the defect says nothing when it reports the defect absent. The arms
 * are tests in their own right, named `CAL-*`, and they fail loudly if the thing they are
 * supposed to detect goes undetected.
 */

K.setMergeFn?.(mergeGeometries);

/* ====================================================================== */
/* the shipped level, as a collision oracle                                */
/* ====================================================================== */

const TAGS = new Map();

function quietEngine() {
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    warnings: [],
    debug: { freeCam: false, showColliders: false, wireframe: false },
    get: () => null, has: () => false, on: () => () => {}, emit() {},
    registerCollider: (m, o) => TAGS.set(m, o?.tag || 'ground'),
    warn(m) { this.warnings.push(String(m)); },
  };
}

const arch = new Architecture(quietEngine());
const BUILD_T0 = Date.now();
buildEgyptLevel(arch);
const BUILD_MS = Date.now() - BUILD_T0;

/** Every registered collision proxy as `{ tag, min, max }` in world space. */
const BOXES = [];
for (const m of arch._colliders) {
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m);
  if (!Number.isFinite(b.min.x) || !Number.isFinite(b.max.z)) continue;
  BOXES.push({ tag: TAGS.get(m) || 'ground', min: b.min.clone(), max: b.max.clone() });
}

const SUPPORT_TAGS = new Set(['ground', 'ledge']);
const BLOCK_TAGS = new Set(['wall', 'pole']);

/**
 * Uniform XZ bucket index. 248 boxes × ~600 k queries is 150 M box tests without it, which
 * turns a 12-second suite into a two-minute one.
 */
const CELL = 8;
const GRID = new Map();
const key = (ix, iz) => ix * 100003 + iz;
for (let i = 0; i < BOXES.length; i++) {
  const b = BOXES[i];
  for (let ix = Math.floor(b.min.x / CELL); ix <= Math.floor(b.max.x / CELL); ix++) {
    for (let iz = Math.floor(b.min.z / CELL); iz <= Math.floor(b.max.z / CELL); iz++) {
      const k = key(ix, iz);
      let a = GRID.get(k);
      if (!a) GRID.set(k, a = []);
      a.push(i);
    }
  }
}
function near(x, z, pad = 0) {
  const out = [];
  const seen = new Set();
  for (let ix = Math.floor((x - pad) / CELL); ix <= Math.floor((x + pad) / CELL); ix++) {
    for (let iz = Math.floor((z - pad) / CELL); iz <= Math.floor((z + pad) / CELL); iz++) {
      for (const i of GRID.get(key(ix, iz)) || []) {
        if (seen.has(i)) continue;
        seen.add(i); out.push(BOXES[i]);
      }
    }
  }
  return out;
}

/** Ray/AABB slab. Entry distance, or −1. */
function slab(o, d, b) {
  let tmin = 0, tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    if (Math.abs(d[ax]) < 1e-9) { if (o[ax] < b.min[ax] || o[ax] > b.max[ax]) return -1; continue; }
    let t1 = (b.min[ax] - o[ax]) / d[ax], t2 = (b.max[ax] - o[ax]) / d[ax];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/**
 * COLLISION, served off the real level. Same result shapes as `src/world/Collision.js` and the
 * same `ignoreTags` semantics — the guards cannot tell the difference, which is the point.
 */
class LevelCollision {
  constructor(extra = []) {
    this.ready = true;
    this.rays = 0;
    this.extra = extra;              // injected boxes, for the calibration arms
    this._d = new THREE.Vector3();
    this._ray = { hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0, tag: 'wall', rec: null };
    this._gnd = { hit: false, y: 0, normal: new THREE.Vector3(0, 1, 0), slope: 0, tag: 'ground', material: 'stone', rec: null, distance: 0 };
  }

  _candidates(x, z, pad) {
    const c = near(x, z, pad);
    return this.extra.length ? c.concat(this.extra) : c;
  }

  raycast(origin, dir, maxDist, opts) {
    this.rays++;
    const r = this._ray;
    r.hit = false;
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-9) return r;
    const d = this._d.set(dir.x / len, dir.y / len, dir.z / len);
    const ig = opts?.ignoreTags;
    let best = maxDist > 0 ? maxDist : 100;
    let hitTag = null;
    // One bucket lookup padded by the ray's own reach; cheap, and never misses a box the
    // unindexed scan would have found, because `pad` covers the whole segment.
    const pad = best + CELL;
    for (const b of this._candidates(origin.x, origin.z, pad)) {
      if (ig && ig.includes(b.tag)) continue;
      const t = slab(origin, d, b);
      if (t >= 0 && t < best) { best = t; hitTag = b.tag; }
    }
    if (hitTag !== null) {
      r.hit = true; r.distance = best; r.tag = hitTag;
      r.point.set(origin.x + d.x * best, origin.y + d.y * best, origin.z + d.z * best);
    }
    return r;
  }

  groundCheck(pos, radius, maxDist) {
    const g = this._gnd;
    g.hit = false;
    let bestY = -Infinity, bestTag = 'ground';
    const r = radius || 0;
    for (const b of this._candidates(pos.x, pos.z, r + CELL)) {
      if (!SUPPORT_TAGS.has(b.tag)) continue;
      if (pos.x < b.min.x - r || pos.x > b.max.x + r) continue;
      if (pos.z < b.min.z - r || pos.z > b.max.z + r) continue;
      if (b.max.y > pos.y + 1e-3) continue;
      if (pos.y - b.max.y > maxDist) continue;
      if (b.max.y > bestY) { bestY = b.max.y; bestTag = b.tag; }
    }
    if (bestY > -Infinity) { g.hit = true; g.y = bestY; g.tag = bestTag; g.distance = pos.y - bestY; }
    return g;
  }
}

/** Highest support at (x, z) at or below `yMax`, probed with the guard's own foot radius. */
function supportAt(x, z, yMax, footR, extra = []) {
  let hi = null;
  const list = extra.length ? near(x, z, footR + CELL).concat(extra) : near(x, z, footR + CELL);
  for (const b of list) {
    if (!SUPPORT_TAGS.has(b.tag)) continue;
    if (x < b.min.x - footR || x > b.max.x + footR) continue;
    if (z < b.min.z - footR || z > b.max.z + footR) continue;
    if (b.max.y > yMax) continue;
    if (hi === null || b.max.y > hi) hi = b.max.y;
  }
  return hi;
}

/** Is (x, y, z) inside a wall or a column? Returns the tag, or null. */
function blockedAt(x, y, z, extra = []) {
  const list = extra.length ? near(x, z, CELL).concat(extra) : near(x, z, CELL);
  for (const b of list) {
    if (!BLOCK_TAGS.has(b.tag)) continue;
    if (x <= b.min.x || x >= b.max.x || z <= b.min.z || z >= b.max.z) continue;
    if (y <= b.min.y || y >= b.max.y) continue;
    return b.tag;
  }
  return null;
}

/**
 * Horizontal distance from (x, z) to the nearest ground slab a walker on plane `baseY` cannot
 * get onto — and the reason this function exists at all.
 *
 * ── C1 CLAIMED THE MASONRY AND CHECKED TWO TAGS OUT OF FOUR ────────────────────────────────
 * `clearanceAt` filters on `BLOCK_TAGS`, which is `{wall, pole}`. Every terrace, plinth, deck
 * and platform in the level is registered by `groundProxy`/`ledgeProxy` as `ground` or `ledge`,
 * so **C1 has never inspected a single one of them**, at any height, on any route. Its title
 * says "clears the masonry"; its body could only ever see walls and columns.
 *
 * That is not a hypothetical gap. `obelisk_watch` spent 12% of its arc inside the obelisk
 * terrace's stage-2 block — a 3.2 m mass of stone — and C1 passed it on every run, including
 * the runs where the guard was physically pinned at 0.9 m of a 144.2 m beat. The defect was
 * found by the stall test, three arms further down, which notices only that *somebody stopped
 * moving*: C1 is the arm that is supposed to say **where** and **why**, and it was silent.
 *
 * CAL-1 did not catch this and structurally could not: it grazes a hall *column* and proves the
 * instrument fires on the class it already sees. A calibration that only exercises the covered
 * class certifies coverage it does not have (§418).
 *
 * ── The predicate, and why it is these two clauses ─────────────────────────────────────────
 * A ground box is an obstacle to a walker when he can neither climb it nor pass under it:
 *
 *   · top above `baseY + GUARD_TUNE.stepUp` — below that he steps up onto it, which is what
 *     `Guard._step` actually does, so a kerb is not a wall;
 *   · underside below `baseY + headTop` — a deck 3 m over his head is a canopy, not an obstacle,
 *     and the terrace's own upper ledge is exactly that for the guard on the tier below.
 *
 * Both bounds are read out of `GUARD_TUNE` rather than chosen here. A number picked to make the
 * shipped level pass would make this arm a record of the level rather than a check on it.
 */
function slabClearanceAt(x, baseY, z, stepUp, headTop, extra = []) {
  let best = Infinity;
  const list = extra.length ? near(x, z, 6 + CELL).concat(extra) : near(x, z, 6 + CELL);
  for (const b of list) {
    if (!SUPPORT_TAGS.has(b.tag)) continue;
    if (b.max.y <= baseY + stepUp) continue;      // he steps onto it
    if (b.min.y >= baseY + headTop) continue;     // it passes over his head
    const dx = Math.max(b.min.x - x, 0, x - b.max.x);
    const dz = Math.max(b.min.z - z, 0, z - b.max.z);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

/** Horizontal distance from (x, z) to the nearest wall/pole that spans height `y`. */
function clearanceAt(x, y, z, extra = []) {
  let best = Infinity;
  const list = extra.length ? near(x, z, 6 + CELL).concat(extra) : near(x, z, 6 + CELL);
  for (const b of list) {
    if (!BLOCK_TAGS.has(b.tag)) continue;
    if (y < b.min.y || y > b.max.y) continue;
    const dx = Math.max(b.min.x - x, 0, x - b.max.x);
    const dz = Math.max(b.min.z - z, 0, z - b.max.z);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

/* ====================================================================== */
/* engine stub + driver                                                    */
/* ====================================================================== */

class StubEngine {
  constructor(collision, tod = 0.06) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.quality = 'med';
    this.warnings = [];
    this.debug = { timeOfDay: tod };
    this.time = 0;
    this.alerts = [];
    this._mods = new Map();
    this._ev = new Map();
    // Parked 400 m away: nothing in this file wants a guard reacting to a phantom player
    // unless it puts one there deliberately.
    this.movement = {
      position: new THREE.Vector3(0, 0, 400), velocity: new THREE.Vector3(),
      speed: 0, maxSpeed: PLAYER.runSpeed, grounded: true, stateName: 'idle',
    };
    this._mods.set('collision', collision);
    this._mods.set('movement', this.movement);
  }
  get(k) { return this._mods.get(k) ?? null; }
  has(k) { return this._mods.has(k); }
  warn(m) { this.warnings.push(String(m)); }
  on(e, fn) {
    if (!this._ev.has(e)) this._ev.set(e, new Set());
    this._ev.get(e).add(fn);
    return () => this._ev.get(e)?.delete(fn);
  }
  emit(e, p) {
    if (e === 'guardAlert') this.alerts.push({ id: p?.id, state: p?.state, prev: p?.prev });
    for (const fn of this._ev.get(e) || []) fn(p);
  }
  registerCollider() { return {}; }
}

async function makeGarrison({ extra = [], tod = 0.06 } = {}) {
  const collision = new LevelCollision(extra);
  const engine = new StubEngine(collision, tod);
  const guards = new Guards(engine);
  await guards.init();
  return { guards, engine, collision };
}

function step(guards, engine, seconds, dt = 1 / 30, onFrame = null) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    engine.time += dt;
    guards.update(dt, engine.time);
    if (onFrame) onFrame(engine.time, i);
  }
  return n;
}

/* Read off the guard's own tuning rather than restated here. The literal copy that used to sit
   in this file is exactly the drift hazard §235 was written about: the C1 clearance floor is
   `radius + 0.20`, so a body swap that changed a radius would have left this suite certifying a
   clearance the guards no longer have. `tests/carmguard.test.mjs` separately asserts the shipped
   radii still bound the mesh they wrap. */
const RAD = GUARD_TUNE.radius;
const widestOn = (routeName) => Math.max(0.26,
  ...ROSTER.filter((e) => e.route === routeName).map((e) => RAD[e.type] || 0.42));
/** The tallest head on a route — the height above which a slab is a canopy rather than a wall. */
const tallestOn = (routeName) => Math.max(0.34,
  ...ROSTER.filter((e) => e.route === routeName).map((e) => GUARD_TUNE.headTop[e.type] || 1.95));

const ROUTE_NAMES = Object.keys(ROUTES);
const SEED = 0x9a2d10;

/* Built once and shared: `buildRoutes` is deterministic and the geometry tests do not mutate. */
const ROUTE_OBJS = buildRoutes(SEED);

/** Sample a route's spline at N arc-uniform points, with the level's answer at each. */
function sampleRoute(name, N = 400, extra = []) {
  const route = ROUTE_OBJS[name];
  const baseY = ROUTES[name].baseY ?? 0;
  const footR = widestOn(name) * 0.7;
  const yMax = baseY + 2.5;
  const p = new THREE.Vector3();
  const rows = [];
  for (let i = 0; i < N; i++) {
    route.at(i / N, p);
    const s = supportAt(p.x, p.z, yMax, footR, extra);
    const y = (s === null ? baseY : s) + 1.15;
    rows.push({ x: p.x, z: p.z, support: s, chestY: y });
  }
  return { rows, baseY, radius: widestOn(name) };
}

console.log(`\n[patrol] shipped level built in ${BUILD_MS} ms — ${BOXES.length} collision AABBs, `
  + `${ROUTE_NAMES.length} routes, ${ROSTER.length} guards\n`);

/* ====================================================================== */
/* C1 — clearance                                                          */
/* ====================================================================== */

test('C1: every route clears the masonry by the widest body that walks it, plus 20 cm', () => {
  let inspected = 0;
  const bad = [];
  const report = [];
  for (const name of ROUTE_NAMES) {
    const { rows, radius, baseY } = sampleRoute(name);
    const need = radius + 0.20;
    const headTop = tallestOn(name);
    let worst = Infinity, worstAt = null, worstKind = '';
    let wSlab = Infinity;
    for (const r of rows) {
      inspected++;
      const cw = clearanceAt(r.x, r.chestY, r.z);
      const cs = slabClearanceAt(r.x, baseY, r.z, GUARD_TUNE.stepUp, headTop);
      wSlab = Math.min(wSlab, cs);
      const c = Math.min(cw, cs);
      if (c < worst) { worst = c; worstAt = r; worstKind = cs < cw ? 'slab' : 'wall'; }
      if (c <= need) bad.push(`${name} @ (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) clear ${c.toFixed(2)} m `
        + `(${cs < cw ? 'ground slab' : 'wall/pole'}), needs > ${need.toFixed(2)}`);
    }
    report.push(`  ${name.padEnd(18)} radius ${radius.toFixed(2)}  tightest ${worst === Infinity ? '  none' : worst.toFixed(2)} m`
      + (worstAt && worst < 9 ? ` ${worstKind} at (${worstAt.x.toFixed(1)}, ${worstAt.z.toFixed(1)})` : '')
      + `   slabs alone ${wSlab === Infinity ? ' none' : wSlab.toFixed(2)} m`);
  }
  console.log('[C1] clearance to the nearest wall, column OR unclimbable ground slab, per route:');
  for (const line of report) console.log(line);
  assert.ok(inspected >= ROUTE_NAMES.length * 400, `inspected only ${inspected} samples`);
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} clearance violations`);
});

test('CAL-1: the clearance test detects a route threaded past a hall column', () => {
  // The east aisle column at x 15.1‥17.9, z −27.4‥−24.6. Run the line 0.1 m off its face.
  const grazing = new Route('cal1', {
    closed: false, baseY: 0, points: [[15.0, -34.0], [15.0, -26.0], [15.0, -18.0]],
  }, 1);
  const p = new THREE.Vector3();
  let inspected = 0, violations = 0, tightest = Infinity;
  for (let i = 0; i < 400; i++) {
    grazing.at(i / 400, p);
    inspected++;
    const c = clearanceAt(p.x, 1.15, p.z);
    tightest = Math.min(tightest, c);
    if (c <= RAD.temple + 0.20) violations++;
  }
  console.log(`[CAL-1] grazing route: tightest ${tightest.toFixed(3)} m, ${violations}/${inspected} samples violate`);
  assert.ok(inspected === 400, `inspected ${inspected}`);
  assert.ok(violations > 0, 'CAL-1 DID NOT FIRE — the clearance test is blind, every C1 pass is void');
});

/* CAL-1's route grazes a hall COLUMN, which is a `pole`. It therefore calibrates C1 against the
   one class C1 could already see, and was passing throughout the period in which C1 was blind to
   every terrace in the level. This is the missing half.

   DOMAIN (§418.3) — both inputs run here, in this arm, on the shipped level:
     PASSES  the shipped `obelisk_watch` as rewritten — corner waypoints on the band; measured
             clearance 1.10 m against a 0.62 m bar.
     FAILS   the seven-point heptagon this route shipped as until now, verbatim below. It is
             inside the stage-2 block on 12% of its arc and never clears −0.36 m on any seed.
   The failing input is the real prior text rather than a constructed one, so if someone widens
   the predicate until the level passes, the thing that goes green is a route that pinned a
   guard at 0.9 m of 144.2 m — and that is the failure this arm exists to make impossible. */
test('CAL-1b: the clearance test detects a route walking through the obelisk terrace', () => {
  const HEPTAGON = {
    closed: false, baseY: 2.0, space: 'terrace',
    points: [
      [5.5, 18.0, 2.0, 'look'], [7.6, 12.0, 0, null], [7.6, 6.2, 1.2, null], [0.0, 4.4, 1.8, 'look'],
      [-7.6, 6.2, 1.2, null], [-7.6, 12.0, 0, null], [-5.5, 18.0, 2.0, 'look'],
    ],
  };
  const need = RAD.temple + 0.20;
  const headTop = GUARD_TUNE.headTop.temple;
  const scan = (def) => {
    const r = new Route('cal1b', def, SEED + 2 * 7919);   // obelisk_watch's own seed
    const p = new THREE.Vector3();
    let tightest = Infinity, violations = 0;
    for (let i = 0; i < 400; i++) {
      r.at(i / 400, p);
      const c = slabClearanceAt(p.x, def.baseY, p.z, GUARD_TUNE.stepUp, headTop);
      tightest = Math.min(tightest, c);
      if (c <= need) violations++;
    }
    return { tightest, violations };
  };
  const old = scan(HEPTAGON);
  const now = scan(ROUTES.obelisk_watch);
  console.log(`[CAL-1b] heptagon (the route until now): tightest ${old.tightest.toFixed(3)} m, ${old.violations}/400 violate`);
  console.log(`[CAL-1b] shipped obelisk_watch:          tightest ${now.tightest.toFixed(3)} m, ${now.violations}/400 violate`);
  assert.ok(old.violations > 0,
    'CAL-1b DID NOT FIRE — a route driven through a 3.2 m terrace reads as clear, so C1 is still '
    + 'blind to every ground slab in the level and its "clears the masonry" is two tags out of four');
  assert.equal(now.violations, 0,
    `the shipped route violates its own bar at ${now.tightest.toFixed(3)} m — needs > ${need.toFixed(2)}`);
  /* The improvement has to exceed the bar itself, not merely reach it: a route that scrapes past
     0.62 m is one jitter draw from failing, and the point of the rewrite was the corner geometry
     rather than a nudge. Measured at 0.87 m against a 0.62 m bar. */
  assert.ok(now.tightest - old.tightest > need,
    `the rewrite bought only ${(now.tightest - old.tightest).toFixed(2)} m against a ${need.toFixed(2)} m bar `
    + '— the chamfered corners are not doing the work');
});

/* ====================================================================== */
/* C2 — geometry (PREREG-routeaudit T1–T4, verbatim)                       */
/* ====================================================================== */

const STEP_UP = GUARD_TUNE.stepUp;
const STEP_DOWN = GUARD_TUNE.stepDown;

function geometryVerdict(name, extra = []) {
  const { rows, baseY } = sampleRoute(name, 400, extra);
  const wall = rows.filter((r) => blockedAt(r.x, r.chestY, r.z, extra));
  const unsupported = rows.filter((r) => r.support === null);
  const supported = rows.filter((r) => r.support !== null);
  const mismatch = supported.filter((r) => Math.abs(r.support - baseY) > STEP_DOWN);
  const cliffs = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a.support === null || b.support === null) continue;
    const d = b.support - a.support;
    if (d > STEP_UP || d < -STEP_DOWN) cliffs.push({ from: a.support, to: b.support, x: b.x, z: b.z });
  }
  return {
    inspected: rows.length, wall, unsupported, supported, mismatch, cliffs,
    T1: wall.length >= 1,
    T2: cliffs.length >= 1,
    T3: unsupported.length / rows.length > 0.05,
    T4: supported.length > 0 && mismatch.length / supported.length > 0.05,
  };
}

test('C2: every route lies on a floor the level actually has, with no step a guard refuses', () => {
  let inspected = 0;
  const broken = [];
  console.log('[C2] per route: wall samples / unsupported / floor-mismatch / cliff steps');
  for (const name of ROUTE_NAMES) {
    const v = geometryVerdict(name);
    inspected += v.inspected;
    const flags = [v.T1 && 'T1-WALL', v.T2 && 'T2-CLIFF', v.T3 && 'T3-VOID', v.T4 && 'T4-MISMATCH'].filter(Boolean);
    console.log(`  ${name.padEnd(18)} ${String(v.wall.length).padStart(4)} `
      + `${String(v.unsupported.length).padStart(5)} ${String(v.mismatch.length).padStart(6)} `
      + `${String(v.cliffs.length).padStart(6)}   ${flags.length ? flags.join(' ') : 'CLEAN'}`);
    if (flags.length) {
      const where = v.wall[0] || v.cliffs[0] || v.unsupported[0] || v.mismatch[0];
      broken.push(`${name}: ${flags.join(' ')} first at (${where.x.toFixed(1)}, ${where.z.toFixed(1)})`);
    }
  }
  assert.ok(inspected === ROUTE_NAMES.length * 400, `inspected ${inspected} samples`);
  assert.deepEqual(broken, [], 'routes that a guard cannot physically walk');
});

/**
 * The first version of this arm ran the line down x = 0 through z −60‥−44 and **did not fire**.
 * That was correct of it: x = 0 at chest height is the inner pylon's *gateway*, which is open,
 * and the mass above it starts at y = 8.4. The arm was mis-specified, it is recorded here as
 * having failed, and it is replaced with a line through the pylon's west tower — `wall
 * x −11.0‥−3.5, y 0‥8.40, z −55.5‥−48.5` — which is solid at the height a guard walks. The
 * threshold it calibrates (T1: ≥ 1 sample inside stone) is untouched.
 */
test('CAL-2a: the geometry test detects a route driven through the inner pylon tower', () => {
  const through = new Route('cal2a', { closed: false, baseY: 0, points: [[-7, -58], [-7, -52], [-7, -46]] }, 1);
  const p = new THREE.Vector3();
  let inspected = 0, walls = 0;
  for (let i = 0; i < 400; i++) {
    through.at(i / 400, p);
    inspected++;
    if (blockedAt(p.x, 1.15, p.z)) walls++;
  }
  console.log(`[CAL-2a] pylon-tower route: ${walls}/${inspected} samples inside stone`);
  assert.ok(inspected === 400, `inspected ${inspected}`);
  assert.ok(walls > 0, 'CAL-2a DID NOT FIRE — T1 is blind and every "no wall hit" is void');
});

test('CAL-2b: the geometry test detects a step past stepUp, and unsupported ground', () => {
  // The courtyard terrace: paving at y = 0 to stage 1 at y = 2.0, a 2 m riser.
  const overEdge = new Route('cal2b', { closed: false, baseY: 0, points: [[0, -2], [0, 6], [0, 12]] }, 1);
  const p = new THREE.Vector3();
  let inspected = 0, cliffs = 0, prev = null;
  for (let i = 0; i < 400; i++) {
    overEdge.at(i / 400, p);
    inspected++;
    const s = supportAt(p.x, p.z, 2.5, 0.29);
    if (prev !== null && s !== null && (s - prev > STEP_UP || s - prev < -STEP_DOWN)) cliffs++;
    prev = s;
  }
  // And the desert, where there is no collision at all.
  let voidSamples = 0;
  for (let i = 0; i < 100; i++) voidSamples += supportAt(200 + i, 200, 2.5, 0.29) === null ? 1 : 0;
  console.log(`[CAL-2b] terrace edge: ${cliffs} cliff steps in ${inspected} samples; desert: ${voidSamples}/100 unsupported`);
  assert.ok(inspected === 400, `inspected ${inspected}`);
  assert.ok(cliffs > 0, 'CAL-2b DID NOT FIRE — T2 is blind and every "no cliff" is void');
  assert.ok(voidSamples === 100, `CAL-2b DID NOT FIRE — T3 is blind (${voidSamples}/100 off-mesh samples read as supported)`);
});

/* ====================================================================== */
/* C3 — no stall: the real garrison walks the real temple                  */
/* ====================================================================== */

const SOAK_SECONDS = 180;

/** Run the garrison and record, per guard, distance covered and dwell stops visited. */
async function soak(seconds, opts = {}) {
  const { guards, engine, collision } = await makeGarrison(opts);
  const trace = guards.list.map((g) => ({
    id: g.id, route: g.route.name, type: g.type,
    dist: 0, last: g.position.clone(), stops: new Set(), maxOff: 0, laps: 0,
  }));
  const frames = step(guards, engine, seconds, 1 / 30, () => {
    for (let i = 0; i < guards.list.length; i++) {
      const g = guards.list[i], t = trace[i];
      t.dist += g.position.distanceTo(t.last);
      t.last.copy(g.position);
      t.maxOff = Math.max(t.maxOff, g._offRoute);
      if (g.dwell > 0) t.stops.add(Math.round(g.u * 200));
    }
  });
  for (let i = 0; i < guards.list.length; i++) trace[i].laps = guards.list[i].laps;
  return { guards, engine, collision, trace, frames };
}

test('C3: 180 s of patrol in the real temple, and nobody is stuck', async () => {
  const { guards, engine, trace, frames } = await soak(SOAK_SECONDS);
  assert.ok(frames > 5000, `only ${frames} frames stepped`);
  assert.ok(trace.length === ROSTER.length, `traced ${trace.length} guards`);

  console.log(`[C3] ${frames} frames — per guard: distance / route length / dwell stops visited`);
  const stuck = [];
  for (let i = 0; i < trace.length; i++) {
    const t = trace[i];
    const g = guards.list[i];
    const len = g.route.length;
    // Expected ground covered if he never stopped, discounted for dwells and the 0.55 floor.
    const cruise = 1.55 * (ROSTER[i].speed ?? 1) * (t.type === 'heavy' ? 0.74 : t.type === 'scarab' ? 1.25 : 1);
    const want = 0.55 * cruise * SOAK_SECONDS;
    const ok = t.dist >= want && t.stops.size >= 3;
    console.log(`  ${t.id} ${t.route.padEnd(18)} ${t.dist.toFixed(1).padStart(7)} m / route ${len.toFixed(1).padStart(6)} m`
      + `  stops ${String(t.stops.size).padStart(2)}  laps ${t.laps}  maxOff ${t.maxOff.toFixed(2)} m  ${ok ? '' : '  <-- STALLED'}`);
    if (!ok) stuck.push(`${t.id} (${t.route}): ${t.dist.toFixed(1)} m < ${want.toFixed(1)} m required, ${t.stops.size} dwell stops`);
  }
  assert.equal(engine.warnings.length, 0, engine.warnings.join(' | '));
  assert.deepEqual(stuck, [], 'guards that could not complete their beat');
});

test('CAL-2c: the stall test detects a guard pinned by a wall dropped across his beat', async () => {
  /* A slab across both of hall_weave's inner aisles, at z = −31 where the route's long legs
     run. Both, because the guard starts mid-route and a fence on the leg he happens to be
     walking away from tests nothing — the first version of this arm fenced only the west aisle
     and reported an identical distance with and without, which is a calibration arm quietly
     measuring nothing. */
  const fence = [
    { tag: 'wall', min: new THREE.Vector3(-16.5, 0, -32.0), max: new THREE.Vector3(-8.5, 4, -30.0) },
    { tag: 'wall', min: new THREE.Vector3(8.5, 0, -32.0), max: new THREE.Vector3(16.5, 4, -30.0) },
  ];
  const { trace } = await soak(60, { extra: fence });
  const hall = trace.filter((t) => t.route === 'hall_weave');
  assert.ok(hall.length >= 1, `expected at least one hall_weave guard, traced ${hall.length}`);
  const free = await soak(60);
  const freeHall = free.trace.filter((t) => t.route === 'hall_weave');
  const pinnedDist = Math.min(...hall.map((t) => t.dist));
  const freeDist = Math.min(...freeHall.map((t) => t.dist));
  console.log(`[CAL-2c] hall guards with a fence: ${hall.map((t) => t.dist.toFixed(1)).join(', ')} m; `
    + `without: ${freeHall.map((t) => t.dist.toFixed(1)).join(', ')} m`);
  assert.ok(freeDist > 0, 'the unobstructed control covered no ground — the instrument is dead');
  assert.ok(pinnedDist < freeDist * 0.75,
    `CAL-2c DID NOT FIRE — a wall across the beat cost only ${(100 - 100 * pinnedDist / freeDist).toFixed(0)} % of the distance; `
    + 'the stall test cannot see a pinned guard and every C3 pass is void');
});

/* ====================================================================== */
/* C6/C7 — the props, which everything above this line is blind to         */
/* ====================================================================== */

/**
 * ── Why C1–C3 were green while five of nine guards could not move (§707) ──────────────────
 *
 * Everything above harvests `arch._colliders`, and that is Architecture's list. `Props` and
 * `KayKit` are separate modules registered after it in `main.js`'s manifest, each with its own
 * colliders, and this file built neither. So "the route clears the level" meant "the route
 * clears the masonry", and the level has 36 KayKit placements and nine merged prop buckets in
 * it that a guard's forward ray hits exactly as hard as a column.
 *
 * Measured in the shipped browser build over 200 s (`tools/patrolstall.mjs`), with C1–C3 green:
 * guard1 5.3 m, guard2 10.5 m, guard4 0.0 m, guard8 0.2 m, and guard6 fine for 100 s and then
 * stopped for the remaining 99.5 s. Five bodies, four of them from spawn.
 *
 * ── What is measured here, and why each choice ────────────────────────────────────────────
 *
 *  1. **The shipped props, built by the shipped code.** `tests/_kaykitboot.mjs` primes three's
 *     `Cache` so `GLTFLoader` never reaches the DOM, and `Props` needs nothing but an engine
 *     stub. Both run their real placement paths on the real assets. Nothing here retypes a
 *     coordinate out of `KayKit.PLACEMENTS` or `Props._courtyardDress`, because a test that
 *     restates the table it checks is a copy, not a measurement.
 *
 *  2. **Triangles, not boxes.** `Props._flushBuckets` registers ONE collider per material for
 *     the whole level — `props_bronze` is a single mesh whose AABB spans x ±22, z −74…33. An
 *     AABB oracle would report every courtyard route as buried inside it and every tomb route
 *     as clear of it, both wrong. So the soup is per-triangle, gridded on XZ.
 *
 *  3. **Only the tags the guard can hit.** `Guard`'s `RAY_OPTS` ignores hazard/water/rail/hook/
 *     spire/vent, so the brazier's own `hazard` volume is not an obstacle and is not counted.
 *     What stopped guard1 and guard2 was the bronze *geometry*, registered `ground`.
 *
 *  4. **Along the spline, not at the waypoints.** Sampled by DISTANCE (≤ 8 cm), so a 12 m route
 *     and a 152 m one are measured at the same resolution. C7 below is the arm that proves this
 *     matters rather than asserting it: a prop planted mid-segment is invisible to a
 *     waypoint-only check and caught here.
 *
 *  5. **Over the jitter, not at one draw.** `Route`'s constructor moves every waypoint by
 *     `r.jitter(0.22)`, so the shipped spline is one of a family. C1 measures the family's
 *     single shipped member; this measures the worst over `PROP_SEEDS` draws, because a
 *     clearance that holds only at seed 0x9a2d10 is not a clearance.
 *
 *  6. **Asserted for routes with a walker; reported for the rest.** `ROSTER` decides. §589 took
 *     both scarab bodies off the level, so `architrave_ledge` and `tomb_scarab` have nobody on
 *     them and nobody can stall on them — and `tomb_scarab`'s ring is threaded through the tomb
 *     hoard on purpose. They are printed every run with their real numbers, and the moment a
 *     scarab line is appended to `ROSTER` they become assertions and fail until re-authored.
 *     That is the point at which they start to matter.
 */

const PROP_BOOT_T0 = Date.now();
const PROP_REG = [];
let _propOwner = 'props';
const propEngine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
  warn(m) { this.warnings.push(String(m)); },
  get: () => null, has: () => false, on: () => () => {}, emit: () => {},
  registerCollider: (mesh, opts) => PROP_REG.push({ mesh, opts, owner: _propOwner }),
};
{
  const { primeKayKitAssets } = await import('./_kaykitboot.mjs');
  primeKayKitAssets();
  const { Props } = await import('../src/world/Props.js');
  const { KayKit } = await import('../src/world/KayKit.js');
  _propOwner = 'props'; await new Props(propEngine).init();
  _propOwner = 'kaykit'; await new KayKit(propEngine).init();
}
const PROP_BOOT_MS = Date.now() - PROP_BOOT_T0;

/** The six tags `Guard`'s forward rays pass through. Anything else is a solid to a guard. */
const RAY_IGNORED = new Set(['hazard', 'water', 'rail', 'hook', 'spire', 'vent']);

/** Every prop triangle a guard can walk into, in world space, with its owner. */
const PROP_TRIS = [];
for (const r of PROP_REG) {
  if (RAY_IGNORED.has(r.opts?.tag || 'ground')) continue;
  const m = r.mesh;
  if (!m?.geometry?.attributes?.position) continue;
  m.updateMatrixWorld(true);
  const g = m.geometry, pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const src = `${r.owner}:${m.name || '(unnamed)'}`;
  for (let i = 0; i < n; i += 3) {
    for (let k = 0; k < 3; k++) {
      v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld);
    }
    PROP_TRIS.push({
      x: [v[0].x, v[1].x, v[2].x], z: [v[0].z, v[1].z, v[2].z],
      lo: Math.min(v[0].y, v[1].y, v[2].y), hi: Math.max(v[0].y, v[1].y, v[2].y),
      minx: Math.min(v[0].x, v[1].x, v[2].x), maxx: Math.max(v[0].x, v[1].x, v[2].x),
      minz: Math.min(v[0].z, v[1].z, v[2].z), maxz: Math.max(v[0].z, v[1].z, v[2].z),
      src,
    });
  }
}

/* 1 m cells: the query radius is PROP_FAR, so a handful of cells are scanned per sample. */
const PCELL = 1;
const PGRID = new Map();
for (let i = 0; i < PROP_TRIS.length; i++) {
  const t = PROP_TRIS[i];
  for (let ix = Math.floor(t.minx / PCELL); ix <= Math.floor(t.maxx / PCELL); ix++) {
    for (let iz = Math.floor(t.minz / PCELL); iz <= Math.floor(t.maxz / PCELL); iz++) {
      const k = key(ix, iz);
      let a = PGRID.get(k);
      if (!a) PGRID.set(k, a = []);
      a.push(i);
    }
  }
}

/** Clearances above this are not distinguished — every bar in this file is far below it. */
const PROP_FAR = 2.0;

function pointSeg2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  let t = L > 0 ? ((px - ax) * dx + (pz - az) * dz) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Horizontal distance from (x, z) to a triangle's XZ projection. 0 when inside it. */
function pointTri2(px, pz, t) {
  const [x0, x1, x2] = t.x, [z0, z1, z2] = t.z;
  const d1 = (px - x1) * (z0 - z1) - (x0 - x1) * (pz - z1);
  const d2 = (px - x2) * (z1 - z2) - (x1 - x2) * (pz - z2);
  const d3 = (px - x0) * (z2 - z0) - (x2 - x0) * (pz - z0);
  if (!(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)))) return 0;
  return Math.min(pointSeg2(px, pz, x0, z0, x1, z1),
    pointSeg2(px, pz, x1, z1, x2, z2),
    pointSeg2(px, pz, x2, z2, x0, z0));
}

/**
 * Horizontal clearance from (x, z) to the nearest PROP surface standing in the body band
 * `[yLo, yHi]`, capped at `PROP_FAR`. `extra` is a triangle list for the calibration arms.
 */
function propClearanceAt(x, z, yLo, yHi, extra = []) {
  let best = PROP_FAR, src = null;
  const consider = (t) => {
    if (t.hi < yLo || t.lo > yHi) return;
    if (x < t.minx - best || x > t.maxx + best || z < t.minz - best || z > t.maxz + best) return;
    const d = pointTri2(x, z, t);
    if (d < best) { best = d; src = t.src; }
  };
  for (let ix = Math.floor((x - PROP_FAR) / PCELL); ix <= Math.floor((x + PROP_FAR) / PCELL); ix++) {
    for (let iz = Math.floor((z - PROP_FAR) / PCELL); iz <= Math.floor((z + PROP_FAR) / PCELL); iz++) {
      for (const i of PGRID.get(key(ix, iz)) || []) consider(PROP_TRIS[i]);
    }
  }
  for (const t of extra) consider(t);
  return { d: best, src };
}

/** A solid box as 12 world-space triangles, for planting obstacles in the calibration arms. */
function boxTris(cx, cy, cz, sx, sy, sz, src = 'planted') {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const c = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
    [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
  ];
  const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1],
    [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  return faces.map(([a, b, d]) => {
    const p = [c[a], c[b], c[d]];
    return {
      x: p.map((q) => q[0]), z: p.map((q) => q[2]),
      lo: Math.min(...p.map((q) => q[1])), hi: Math.max(...p.map((q) => q[1])),
      minx: Math.min(...p.map((q) => q[0])), maxx: Math.max(...p.map((q) => q[0])),
      minz: Math.min(...p.map((q) => q[2])), maxz: Math.max(...p.map((q) => q[2])), src,
    };
  });
}

/* The per-route seed offset `buildRoutes` uses, so a Route built here is a Route the game could
   build. `ROUTE_NAMES` is the same `Object.keys(ROUTES)` ordering `buildRoutes` walks, which is
   what makes `i * 7919` mean the same thing in both places. */
const ROUTE_ORDER = Object.fromEntries(ROUTE_NAMES.map((n, i) => [n, i]));
const PROP_SEEDS = 6;
const PROP_STEP = 0.08;                       // metres between spline samples
const walkersOn = (name) => ROSTER.filter((e) => e.route === name);
const chestOn = (name) => Math.max(0.34,
  ...walkersOn(name).map((e) => GUARD_TUNE.chestY?.[e.type] ?? 1.15));

/**
 * Worst prop clearance along a route, over the jitter. Returns the worst sample and the count
 * inspected — a pass has to prove it looked (§211.1).
 */
function propSweep(name, { points = null, extra = [], seeds = PROP_SEEDS } = {}) {
  const base = ROUTES[name];
  const def = points ? { ...base, points } : base;
  const baseY = def.baseY ?? 0;
  const radius = widestOn(name);
  const yLo = baseY + 0.02, yHi = baseY + chestOn(name) + 0.10;
  const p = new THREE.Vector3();
  let worst = Infinity, at = null, src = null, inspected = 0, len = 0;
  for (let s = 0; s < seeds; s++) {
    const route = new Route(name, def, SEED + s * 131 + ROUTE_ORDER[name] * 7919);
    len = Math.max(len, route.length);
    const N = Math.max(120, Math.ceil(route.length / PROP_STEP));
    for (let i = 0; i < N; i++) {
      route.at(i / N, p);
      inspected++;
      const c = propClearanceAt(p.x, p.z, yLo, yHi, extra);
      if (c.d < worst) { worst = c.d; at = [p.x, p.z]; src = c.src; }
    }
  }
  return { name, radius, need: radius + 0.20, worst, at, src, inspected, len };
}

console.log(`\n[patrol] props built in ${PROP_BOOT_MS} ms — ${PROP_REG.length} prop colliders, `
  + `${PROP_TRIS.length} guard-blocking triangles in ${PGRID.size} cells\n`);

test('C6: every route a guard actually walks clears the PROPS by his radius plus 20 cm', () => {
  const walked = ROUTE_NAMES.filter((n) => walkersOn(n).length > 0);
  const idle = ROUTE_NAMES.filter((n) => walkersOn(n).length === 0);
  assert.ok(walked.length >= 8, `only ${walked.length} routes have a walker — ROSTER did not load`);
  assert.ok(PROP_TRIS.length > 10000, `only ${PROP_TRIS.length} prop triangles — the props did not build`);

  const bad = [];
  let inspected = 0;
  console.log('[C6] nearest PROP surface along each route, worst over '
    + `${PROP_SEEDS} jitter seeds, sampled every ${PROP_STEP * 100} cm:`);
  for (const name of walked) {
    const r = propSweep(name);
    inspected += r.inspected;
    console.log(`  ${name.padEnd(18)} ${walkersOn(name).map((e) => e.type).join('+').padEnd(13)} `
      + `need ${r.need.toFixed(2)}  nearest ${(r.worst >= PROP_FAR ? '>2.00' : r.worst.toFixed(3)).padStart(6)} m`
      + `  at (${r.at[0].toFixed(2)}, ${r.at[1].toFixed(2)})  ${r.src || 'nothing within 2 m'}`);
    if (r.worst <= r.need) {
      bad.push(`${name} (${walkersOn(name).map((e) => e.type).join('+')}): ${r.worst.toFixed(3)} m at `
        + `(${r.at[0].toFixed(2)}, ${r.at[1].toFixed(2)}) on ${r.src}, needs > ${r.need.toFixed(2)}`);
    }
  }

  /* Reported, not asserted — see point 6 in the banner. These two routes have no body on them
     and cannot stall anybody; `tomb_scarab` is threaded through the tomb hoard deliberately. */
  console.log('[C6] routes with no walker in ROSTER — measured, NOT asserted until one is added:');
  for (const name of idle) {
    const r = propSweep(name, { seeds: 2 });
    inspected += r.inspected;
    console.log(`  ${name.padEnd(18)} (no walker)   would need ${r.need.toFixed(2)}  nearest `
      + `${(r.worst >= PROP_FAR ? '>2.00' : r.worst.toFixed(3)).padStart(6)} m  ${r.src || 'nothing within 2 m'}`);
  }

  assert.ok(inspected > 30000, `inspected only ${inspected} spline samples`);
  assert.deepEqual(bad, [], `${bad.length} route(s) run into level props:\n  ${bad.join('\n  ')}`);
});

test('CAL-6: the prop check detects a crate dropped on a beat that is currently clear', () => {
  /* `rooftop_run` is 17 m above every prop in the level and reports nothing within 2 m on any
     seed, so it is the one route where a positive arm cannot be confused with a real prop.
     Planted at a waypoint's own coordinates: 1.4 m of crate, on the deck. */
  const clean = propSweep('rooftop_run');
  assert.ok(clean.worst >= PROP_FAR,
    `rooftop_run is no longer prop-free (${clean.worst.toFixed(3)} m) — pick another control`);

  const crate = boxTris(-8.5, 17.0 + 0.7, -32.7, 1.4, 1.4, 1.4, 'CAL-6 crate');
  const hit = propSweep('rooftop_run', { extra: crate });
  console.log(`[CAL-6] rooftop_run clean: >${PROP_FAR.toFixed(2)} m; with a 1.4 m crate on the leg: `
    + `${hit.worst.toFixed(3)} m at (${hit.at[0].toFixed(2)}, ${hit.at[1].toFixed(2)})`);
  assert.ok(hit.inspected > 4000, `inspected ${hit.inspected} samples`);
  assert.ok(hit.worst <= hit.need,
    `CAL-6 DID NOT FIRE — a crate standing on the route measured ${hit.worst.toFixed(3)} m against a `
    + `${hit.need.toFixed(2)} m bar, so C6 is blind to props and every C6 pass is void`);

  /* And the negative half: the same crate 6 m off the beat must NOT trip it, or the arm is
     reporting "something exists in the level" rather than "something is on the route". */
  const aside = propSweep('rooftop_run', { extra: boxTris(-14.5, 17.7, -32.7, 1.4, 1.4, 1.4, 'CAL-6 aside') });
  assert.ok(aside.worst > aside.need,
    `CAL-6's negative arm failed: a crate 6 m off the route measured ${aside.worst.toFixed(3)} m, `
    + 'so C6 fires on props that are nowhere near the beat');
});

test('CAL-6b: the oracle holds both prop families — a KayKit box and a Props bucket', () => {
  /* The two register completely differently and only one of them is the drawn art:
     `KayKit._collider` makes an invisible per-item box, `Props._flushBuckets` registers the
     visible merged mesh itself. An oracle that had silently dropped either family would still
     look healthy on the other, so both are asserted present by name. */
  const owners = new Set(PROP_TRIS.map((t) => t.src.split(':')[0]));
  const buckets = new Set(PROP_TRIS.filter((t) => t.src.startsWith('props:')).map((t) => t.src));
  const kk = PROP_TRIS.filter((t) => t.src === 'kaykit:kaykit:solid').length;
  console.log(`[CAL-6b] owners ${[...owners].join(', ')} — ${buckets.size} Props buckets, ${kk} KayKit box triangles`);
  assert.ok(owners.has('props'), 'no Props triangles in the oracle');
  assert.ok(owners.has('kaykit'), 'no KayKit triangles in the oracle');
  assert.ok(kk >= 12 * 20, `only ${kk} KayKit collider triangles — 29 boxes would be 348`);
  assert.ok(buckets.size >= 5, `only ${buckets.size} Props buckets registered as solid`);
  /* And the hazard volumes are NOT in it: a brazier's fire is not an obstacle to a guard. */
  assert.ok(PROP_REG.some((r) => r.opts?.tag === 'hazard'), 'Props registered no hazard volumes at all');
  assert.ok(!PROP_TRIS.some((t) => t.src.includes('hazard')), 'a hazard volume leaked into the solid set');
});

test('C7: clearance is measured ALONG the segments — a waypoint-only check cannot see this', () => {
  /* The third thing §707 had to establish: C1 samples the spline, but "clearance at the
     waypoints" is a different measurement, and a reader who assumed the cheaper one would have
     been wrong about what protects this file. So it is demonstrated rather than described.

     A crate is planted at the MIDPOINT of `hall_nave`'s longest leg — a route with no prop
     within 2 m of it — and both measurements are run on the same geometry. If the waypoint-only
     check ever caught it, the distance-sampled sweep would be redundant and this arm says so. */
  const name = 'hall_nave';
  const pts = ROUTES[name].points;
  const [ax, az] = pts[1], [bx, bz] = pts[2];
  const mid = [(ax + bx) / 2, (az + bz) / 2];
  const crate = boxTris(mid[0], 0.7, mid[1], 1.2, 1.4, 1.2, 'C7 crate');

  const baseY = ROUTES[name].baseY ?? 0;
  const yLo = baseY + 0.02, yHi = baseY + chestOn(name) + 0.10;
  const need = widestOn(name) + 0.20;

  // (a) the waypoint-only measurement, on the authored coordinates
  let wpWorst = Infinity;
  for (const [x, z] of pts) wpWorst = Math.min(wpWorst, propClearanceAt(x, z, yLo, yHi, crate).d);
  // (b) the same geometry, sampled along the spline
  const seg = propSweep(name, { extra: crate });

  console.log(`[C7] a 1.2 m crate at the midpoint of ${name}'s longest leg (${mid[0].toFixed(1)}, ${mid[1].toFixed(1)}): `
    + `waypoint-only sees ${wpWorst >= PROP_FAR ? '>2.00' : wpWorst.toFixed(3)} m, `
    + `segment sweep sees ${seg.worst.toFixed(3)} m, bar ${need.toFixed(2)} m`);
  assert.ok(pts.length >= 3, `inspected ${pts.length} waypoints`);
  assert.ok(seg.inspected > 1000, `inspected ${seg.inspected} spline samples`);
  assert.ok(seg.worst <= need,
    `C7 is not set up: the planted crate measured ${seg.worst.toFixed(3)} m even along the segments`);
  assert.ok(wpWorst > need,
    'C7 PROVED NOTHING — the waypoint-only check also caught the mid-segment crate at '
    + `${wpWorst.toFixed(3)} m, so this arm is not demonstrating the gap it claims`);
});

/* ====================================================================== */
/* C4 — the timing gap                                                     */
/* ====================================================================== */

/**
 * Chokepoints named in `PREREG-patrolgap.md` before any of this was measured: the points the
 * traversal line in `EgyptLevel.js`'s own header passes through.
 */
const CHOKEPOINTS = [
  ['spawn', 0, 0, 30],
  ['terrace-foot', 0, 0, 20],
  ['obelisk-base', 0, 2, 11],
  ['court-west', -18, 0, 8],
  ['court-east', 18, 0, 8],
  ['hall-door', 0, 0, -17],
  ['hall-nave-mid', 0, 0, -34],
  ['hall-west-aisle', -20, 0, -34],
  ['inner-gate', 0, 0, -52],
  ['crypt-nave', 0, -12, -66],
];

const GAP_FLOOR = 6.0;          // seconds — derived in the seal from 5.5 m ÷ sneakSpeed × 1.5
const COVER_FLOOR = 0.08;       // fraction of the window a chokepoint must be watched at all
const WINDOW = 240;             // seconds
const PROBE_DT = 0.1;

/** Is `p` inside guard `g`'s bright core right now, line of sight included? */
const _eye = new THREE.Vector3(), _to = new THREE.Vector3(), _fwd = new THREE.Vector3();
function seesPoint(g, p, collision) {
  const cfg = g.vision;
  g._eyePosition(_eye);
  _to.subVectors(p, _eye);
  const dist = _to.length();
  if (dist > cfg.range || dist < 1e-4) return false;
  _fwd.copy(g.forward).setY(0).normalize();
  const flat = _to.clone().setY(0);
  if (flat.lengthSq() < 1e-6) return false;
  flat.normalize();
  const ang = Math.acos(THREE.MathUtils.clamp(_fwd.dot(flat), -1, 1));
  if (ang > cfg.halfAngle) return false;
  const hit = collision.raycast(_eye, _to, dist, { ignoreTags: ['hazard', 'water', 'rail', 'hook', 'spire', 'vent'] });
  if (hit?.hit && hit.distance < dist - 0.45) return false;
  return true;
}

/** Coverage timeline for a set of probes over `seconds` of patrol. */
async function coverage(probes, seconds, opts = {}) {
  const { guards, engine, collision } = await makeGarrison(opts);
  const only = opts.freeze ? opts.freeze(guards) : null;
  const pts = probes.map(([, x, y, z]) => new THREE.Vector3(x, y + 1.0, z));
  const seen = probes.map(() => []);
  const every = Math.max(1, Math.round(PROBE_DT / (1 / 30)));
  let samples = 0;
  step(guards, engine, seconds, 1 / 30, (t, i) => {
    if (i % every) return;
    samples++;
    for (let k = 0; k < pts.length; k++) {
      let hit = false;
      for (const g of guards.list) {
        // Calibration arms restrict to the one guard they pinned; otherwise the other ten are
        // still patrolling and their genuine sightings contaminate the arm.
        if (only && g !== only) continue;
        if (seesPoint(g, pts[k], collision)) { hit = true; break; }
      }
      seen[k].push(hit);
    }
  });
  return probes.map((pr, k) => {
    const tl = seen[k];
    let covered = 0, run = 0, longest = 0;
    for (const v of tl) {
      if (v) { covered++; run = 0; } else { run++; longest = Math.max(longest, run); }
    }
    return {
      name: pr[0], samples: tl.length,
      coverFrac: tl.length ? covered / tl.length : 0,
      longestGap: longest * PROBE_DT,
    };
  });
}

test('C4: every named chokepoint is watched, and every one has a learnable window', async () => {
  const rows = await coverage(CHOKEPOINTS, WINDOW);
  console.log(`[C4] ${WINDOW} s of patrol, ${rows[0].samples} probes each — coverage / longest safe window`);
  let inspected = 0;
  const tooTight = [], unguarded = [];
  for (const r of rows) {
    inspected += r.samples;
    const flag = r.coverFrac < COVER_FLOOR ? 'UNGUARDED'
      : r.longestGap < GAP_FLOOR ? 'NO WINDOW' : '';
    console.log(`  ${r.name.padEnd(16)} covered ${(100 * r.coverFrac).toFixed(1).padStart(5)} %   `
      + `longest gap ${r.longestGap.toFixed(1).padStart(6)} s   ${flag}`);
    if (r.coverFrac < COVER_FLOOR) unguarded.push(r.name);
    else if (r.longestGap < GAP_FLOOR) tooTight.push(`${r.name}: ${r.longestGap.toFixed(1)} s < ${GAP_FLOOR} s`);
  }
  assert.ok(inspected > CHOKEPOINTS.length * 2000, `inspected only ${inspected} probe samples`);
  assert.deepEqual(tooTight, [], 'chokepoints with no window a player could use');
  // Unguarded points are a reported design gap, not a failure of the routes — but at least
  // half the named chokepoints must carry real pressure or this is not a stealth level.
  const guarded = rows.length - unguarded.length;
  console.log(`[C4] ${guarded}/${rows.length} chokepoints carry guard pressure; unguarded: ${unguarded.join(', ') || 'none'}`);
  assert.ok(guarded >= Math.ceil(rows.length / 2),
    `only ${guarded} of ${rows.length} chokepoints are watched at all — the garrison is not covering the traversal line`);
});

test('CAL-3/4: the coverage instrument reads 0 % off in the desert, high point-blank, and 0 % through a wall', async () => {
  // Low arm: nothing within 300 m.
  const low = await coverage([['desert', 0, 0, 300]], 20);
  // High arm: pin a guard and stand a probe 2.5 m down his sight line.
  const pinAt = (guards) => {
    const g = guards.list[0];
    g.update = () => {};                               // frozen mid-beat, facing +Z
    g.position.set(0, 0, -6);
    g.yaw = 0; g.forward.set(0, 0, 1);
    g.root.position.copy(g.position);
    g.root.rotation.set(0, 0, 0);
    g.root.updateMatrixWorld(true);
    return g;
  };
  const high = await coverage([['point-blank', 0, 0, -3.5]], 20, { freeze: pinAt });
  // LOS arm: same geometry, with a slab between them.
  const slabBox = [{ tag: 'wall', min: new THREE.Vector3(-3, 0, -5.2), max: new THREE.Vector3(3, 4, -4.6) }];
  const occl = await coverage([['point-blank-occluded', 0, 0, -3.5]], 20, { freeze: pinAt, extra: slabBox });

  console.log(`[CAL-3] desert ${(100 * low[0].coverFrac).toFixed(1)} % (gap ${low[0].longestGap.toFixed(1)} s) | `
    + `point-blank ${(100 * high[0].coverFrac).toFixed(1)} % (gap ${high[0].longestGap.toFixed(1)} s) | `
    + `occluded ${(100 * occl[0].coverFrac).toFixed(1)} %`);
  assert.ok(low[0].samples > 100 && high[0].samples > 100 && occl[0].samples > 100,
    'the calibration arms inspected almost nothing');
  assert.equal(low[0].coverFrac, 0, 'CAL-3 low arm DID NOT FIRE — the desert reads as covered');
  assert.ok(high[0].coverFrac > 0.9,
    `CAL-3 high arm DID NOT FIRE — a probe 2.5 m down a frozen guard's sight line read ${(100 * high[0].coverFrac).toFixed(1)} %; `
    + 'the instrument cannot see a guard looking straight at something and every C4 number is fiction');
  assert.equal(occl[0].coverFrac, 0,
    'CAL-4 DID NOT FIRE — a wall between guard and probe changed nothing, so coverage is being scored through stone');
});

/* ====================================================================== */
/* C5 — determinism                                                        */
/* ====================================================================== */

test('C5: the same seed rebuilds the identical patrol', async () => {
  const a = await makeGarrison();
  const b = await makeGarrison();
  step(a.guards, a.engine, 60);
  step(b.guards, b.engine, 60);
  let inspected = 0;
  const drift = [];
  for (let i = 0; i < a.guards.list.length; i++) {
    inspected++;
    const p = a.guards.list[i].position, q = b.guards.list[i].position;
    const d = p.distanceTo(q);
    if (d > 1e-9) drift.push(`${a.guards.list[i].id}: ${d.toExponential(2)} m apart after 60 s`);
  }
  console.log(`[C5] ${inspected} guards compared after 60 s, max drift ${drift.length ? 'NONZERO' : '0'}`);
  assert.ok(inspected === ROSTER.length, `compared ${inspected} guards`);
  assert.deepEqual(drift, []);
});

/* ====================================================================== */
/* the detection model — arithmetic, not pixels                            */
/* ====================================================================== */

/**
 * `Senses.evaluate` reads `moving` as a *normalised* speed — the player's speed over his own
 * maximum — so these are the game's own numbers, not invented ones.
 */
const MOVE = {
  still: 0,
  sneak: PLAYER.sneakSpeed / PLAYER.runSpeed,
  walk: PLAYER.walkSpeed / PLAYER.runSpeed,
  run: 1,
};

/** Drive a bare `Senses` with a fixed stimulus. Returns the meter timeline. */
function meter(over, dt, mut = {}) {
  const s = new Senses('temple', 7);
  const p = {
    eye: new THREE.Vector3(0, 1.66, 0),
    forward: new THREE.Vector3(0, 0, 1),
    target: new THREE.Vector3(0, 0, 6),
    targetTop: 0.95, collision: null, moving: MOVE.walk, sneaking: false, crouching: false,
    airborne: false, light: 0.3, alerted: false, dt,
    ...mut,
  };
  const out = [];
  for (let t = 0; t < over; t += dt) { s.evaluate(p); out.push(s.suspicion); }
  return { s, out };
}

/**
 * ── A criterion this test registered and then had to void (§141.1) ─────────────────────────
 *
 * The first version asserted `1.0 s < tChase < 3.0 s`, and it failed at 0.53 s. Both halves of
 * that were wrong and neither failure was the game's:
 *
 *   - the stimulus was labelled "walking" and fed `moving: 1`, which is *sprinting* — `moving`
 *     is normalised against `runSpeed`, so the number under test was never the walk case;
 *   - the 1.0 s floor was derived from a sentence in `Patrol.js`'s own docstring claiming the
 *     reference condition "fills the meter in roughly 1.4 s". That sentence had never been
 *     measured. Deriving a threshold from an unverified comment is deriving it from nothing.
 *
 * **That bound is VOID and is not re-derived to fit the number that came back.** What replaces
 * it is the weakest criterion that still catches the failure this test exists for — detection
 * that is effectively instantaneous, which is the single thing that makes a stealth game feel
 * unfair — and it is derived from the guard's own reaction window rather than from prose: the
 * meter must take longer to fill than `DETECT.reactDelay`, so the player always has at least
 * that window before anything happens, and it must not be so slow that a guard is no threat.
 * The *relative* assertions in the next test are the ones that encode the design, and all of
 * them passed on the first run, unchanged.
 *
 * The docstring has been corrected to the measured value.
 */
test('detection is a meter that fills monotonically and is never instant', () => {
  const dt = 1 / 60;
  const { out } = meter(8, dt);
  let inspected = 0, decreases = 0;
  for (let i = 1; i < out.length; i++) { inspected++; if (out[i] < out[i - 1] - 1e-12) decreases++; }
  const tChase = out.findIndex((v) => v >= DETECT.chase) * dt;
  const tSusp = out.findIndex((v) => v >= DETECT.suspicious) * dt;
  const runT = meter(8, dt, { moving: MOVE.run }).out.findIndex((v) => v >= DETECT.chase) * dt;
  console.log(`[detect] 6 m, dead centre, moonlit — walking: suspicious ${tSusp.toFixed(2)} s, `
    + `full ${tChase.toFixed(2)} s (+${DETECT.reactDelay} s react = ${(tChase + DETECT.reactDelay).toFixed(2)} s to chase); `
    + `running: full ${runT.toFixed(2)} s`);
  assert.ok(inspected > 400, `inspected ${inspected} steps`);
  assert.equal(decreases, 0, 'the meter went down while the player was in plain sight');
  assert.ok(tSusp > DETECT.reactDelay * 0.5,
    `suspicion crossed in ${tSusp.toFixed(3)} s — that is effectively instant detection`);
  assert.ok(tChase > DETECT.reactDelay,
    `the meter filled in ${tChase.toFixed(2)} s, inside the guard's own ${DETECT.reactDelay} s reaction window — `
    + 'the player has no frame in which to react and failure reads as arbitrary');
  assert.ok(tChase < 5.0, `full detection took ${tChase.toFixed(2)} s — a guard staring at you is not a threat`);
  assert.ok(runT < tChase, 'running is not more dangerous than walking');
});

test('sneaking, distance and darkness each buy the player measurable time', () => {
  const dt = 1 / 60;
  const cases = {
    walking: {},
    running: { moving: MOVE.run },
    sneaking: { moving: MOVE.sneak, sneaking: true },
    crouching: { crouching: true },
    'standing still': { moving: MOVE.still },
    'far (15 m)': { target: new THREE.Vector3(0, 0, 15) },
    'daylight': { light: 1 },
    'edge of cone': { target: new THREE.Vector3(3.6, 0, 6) },
  };
  const times = {};
  let inspected = 0;
  for (const k in cases) {
    const { out } = meter(60, dt, cases[k]);
    inspected++;
    const i = out.findIndex((v) => v >= DETECT.chase);
    times[k] = i < 0 ? Infinity : i * dt;
    console.log(`[detect] ${k.padEnd(16)} time to full detection: ${times[k] === Infinity ? 'never' : times[k].toFixed(2) + ' s'}`);
  }
  assert.ok(inspected === Object.keys(cases).length, `ran ${inspected} cases`);
  assert.ok(times.sneaking > times.walking * 2, 'sneaking barely helps');
  assert.ok(times.crouching > times.walking, 'crouching does not help');
  assert.ok(times['standing still'] > times.walking, 'standing still does not help');
  assert.ok(times['far (15 m)'] > times.walking, 'distance does not help');
  assert.ok(times.daylight < times.walking, 'daylight is not worse than moonlight');
  assert.ok(times['edge of cone'] > times.walking, 'the cone edge is as dangerous as its centre');
});

test('the meter drains back to zero after the grace period, so there is a way down', () => {
  const dt = 1 / 60;
  const { s } = meter(2.0, dt);
  const peak = s.suspicion;
  assert.ok(peak > DETECT.suspicious, `never got suspicious: ${peak}`);
  const gone = { target: new THREE.Vector3(0, 0, 400) };
  const p = {
    eye: new THREE.Vector3(0, 1.66, 0), forward: new THREE.Vector3(0, 0, 1),
    targetTop: 0.95, collision: null, moving: 0, sneaking: false, crouching: false,
    airborne: false, light: 0.3, alerted: false, dt, ...gone,
  };
  let t = 0, tDrainStart = -1, inspected = 0;
  const before = s.suspicion;
  while (s.suspicion > 0 && t < 30) {
    s.evaluate(p); t += dt; inspected++;
    if (tDrainStart < 0 && s.suspicion < before - 1e-9) tDrainStart = t;
  }
  console.log(`[detect] peak ${peak.toFixed(2)} → grace ${tDrainStart.toFixed(2)} s → empty at ${t.toFixed(2)} s`);
  assert.ok(inspected > 100, `inspected ${inspected} steps`);
  assert.ok(tDrainStart >= DETECT.drainDelay - dt * 2, `drain began after ${tDrainStart.toFixed(2)} s, before the ${DETECT.drainDelay} s grace`);
  assert.equal(s.suspicion, 0, 'the meter never emptied — there is no way back to patrol');
  assert.ok(t < 20, `it took ${t.toFixed(1)} s to forget, which is longer than any player will wait`);
});

test('hearing fills toward searching but can never reach chase on its own', () => {
  const dt = 1 / 60;
  const s = new Senses('temple', 3);
  const p = {
    eye: new THREE.Vector3(0, 1.66, 0), forward: new THREE.Vector3(0, 0, 1),
    target: new THREE.Vector3(0, 0, -4),                 // directly behind him
    targetTop: 0.95, collision: null, moving: 1, sneaking: false, crouching: false,
    airborne: false, light: 0.3, alerted: false, dt,
  };
  let inspected = 0;
  for (let t = 0; t < 60; t += dt) { s.evaluate(p); inspected++; }
  console.log(`[detect] 60 s of running behind his back: meter rests at ${s.suspicion.toFixed(3)} (cap ${DETECT.hearCap})`);
  assert.ok(inspected > 3000, `inspected ${inspected} steps`);
  assert.ok(s.suspicion > DETECT.suspicious, 'he never heard a thing');
  assert.ok(s.suspicion < DETECT.chase, 'noise alone escalated to full detection');
  assert.ok(s.suspicion <= DETECT.hearCap + 0.02, `hearing overran its cap: ${s.suspicion}`);
});

/* ====================================================================== */
/* legibility: the state has to be readable from outside                   */
/* ====================================================================== */

test('the four alert bands are ordered and separated, and hysteresis stops them chattering', () => {
  const bands = [0, DETECT.suspicious, DETECT.searching, DETECT.chase];
  let inspected = 0;
  for (let i = 1; i < bands.length; i++) {
    inspected++;
    assert.ok(bands[i] > bands[i - 1], 'thresholds are not ordered');
    assert.ok(bands[i] - bands[i - 1] > 0.2, `bands ${i - 1}/${i} are ${(bands[i] - bands[i - 1]).toFixed(2)} apart — too close to read`);
  }
  assert.ok(inspected === 3, `inspected ${inspected} band gaps`);

  // Chatter: hover the meter exactly on a threshold and jitter it by float noise.
  assert.ok(DETECT.hysteresis > 0, 'no hysteresis band declared');
  let flips = 0, checked = 0;
  let state = STATE.PATROL;
  for (let i = 0; i < 4000; i++) {
    const s = DETECT.suspicious + (i % 2 ? 1e-4 : -1e-4);
    const next = stateForSuspicion(s, state);
    checked++;
    if (next !== state) flips++;
    state = next;
  }
  console.log(`[legibility] 4000 frames hovering on the suspicious threshold: ${flips} state flips`);
  assert.ok(checked === 4000, `checked ${checked}`);
  assert.ok(flips <= 1, `the alert state flipped ${flips} times on a meter that never moved 0.0002 — `
    + 'a guard that chatters restarts his reaction animation every frame and reads as broken');
});

test('the cone colour is a three-stop ramp keyed to the thresholds, not a smooth slide', () => {
  const probes = [0, 0.15, DETECT.suspicious, 0.5, DETECT.searching, 0.9, DETECT.chase, 1.4];
  const stops = probes.map((s) => coneColourStop(s));
  let inspected = 0;
  for (let i = 1; i < stops.length; i++) { inspected++; assert.ok(stops[i] >= stops[i - 1], 'the ramp goes backwards'); }
  console.log('[legibility] suspicion → colour stop: '
    + probes.map((p, i) => `${p.toFixed(2)}→${stops[i].toFixed(2)}`).join('  '));
  assert.ok(inspected === probes.length - 1, `inspected ${inspected} pairs`);
  // Patrol must be unambiguously stop 0, and full detection unambiguously stop 2.
  assert.equal(coneColourStop(0), 0, 'a guard who has noticed nothing is not showing the patrol colour');
  assert.ok(coneColourStop(DETECT.chase) >= 1.999, 'a chasing guard is not showing the alert colour');
  // The middle band must actually be reached, or the amber stop is dead code.
  const mid = coneColourStop((DETECT.suspicious + DETECT.searching) / 2);
  assert.ok(mid > 0.35 && mid < 1.65, `the suspicious band maps to ${mid.toFixed(2)} — the warn colour is never shown`);
});

test('a suspicious guard walks over to look, and gives up if he finds nothing', async () => {
  const { guards, engine } = await makeGarrison();
  const g = guards.list[0];
  // Park the player where guard #0 can be made to notice, then take him away.
  const spot = g.position.clone().addScaledVector(g.forward, 7);
  g.senses.suspicion = DETECT.suspicious + 0.05;
  g.senses.lastSeen.copy(spot);
  g.senses.lastSeenValid = true;
  g._setState(STATE.SUSPICIOUS);
  const start = g.position.clone();
  let closest = Infinity, inspected = 0, sawSuspicious = false;
  step(guards, engine, 25, 1 / 30, () => {
    inspected++;
    if (g.state === STATE.SUSPICIOUS) sawSuspicious = true;
    closest = Math.min(closest, g.position.distanceTo(spot));
  });
  const moved = start.distanceTo(g.position);
  console.log(`[legibility] suspicious guard: closed to ${closest.toFixed(2)} m of the noise `
    + `(started ${start.distanceTo(spot).toFixed(2)} m away), moved ${moved.toFixed(2)} m, ended in "${g.state}"`);
  assert.ok(inspected > 500, `inspected ${inspected} frames`);
  assert.ok(sawSuspicious, 'never entered the suspicious state at all');
  assert.ok(closest < start.distanceTo(spot) - 1.0, 'a suspicious guard did not move toward what he noticed — '
    + 'the player gets no "he is coming to look" beat and no reason to move');
  assert.equal(g.state, STATE.PATROL, `he never stood down — still "${g.state}" after 25 s`);
});

test('the full ladder runs up and back down: patrol → suspicious → searching → chase → patrol', async () => {
  const { guards, engine } = await makeGarrison();
  const g = guards.list[0];
  const seen = [];
  engine.on('guardAlert', (p) => { if (p.id === g.id) seen.push(p.state); });

  const player = engine.movement;
  // Stand him in the bright core, 5 m out, walking, in daylight.
  const put = () => {
    player.position.copy(g.position).addScaledVector(g.forward, 5).setY(g.position.y);
    player.speed = PLAYER.walkSpeed;
    player.stateName = 'walk';
  };
  let inspected = 0;
  step(guards, engine, 6, 1 / 30, () => { inspected++; put(); });
  player.position.set(0, 0, 400);
  player.speed = 0;
  step(guards, engine, 40, 1 / 30, () => { inspected++; });

  const order = seen.filter((s, i) => s !== seen[i - 1]);
  console.log(`[legibility] state ladder: ${order.join(' → ')}`);
  assert.ok(inspected > 1000, `inspected ${inspected} frames`);
  assert.ok(order.length >= 3, `only ${order.length} transitions: ${order.join(', ')}`);
  assert.equal(order[0], STATE.SUSPICIOUS, `first transition was "${order[0]}", not suspicious — detection is binary`);
  assert.ok(order.includes(STATE.CHASE), 'never escalated to chase');
  assert.equal(order[order.length - 1], STATE.PATROL, `ended in "${order[order.length - 1]}" — he never stood back down`);
});

/* ====================================================================== */
/* §748 — the vertical ceiling on sight                                    */
/* ====================================================================== */

/**
 * The cone used to be tested **entirely in the horizontal plane**: `evaluate` flattened both the
 * vector to the player and the guard's forward and compared bearings, so there was no vertical
 * term anywhere and the sensed volume was an infinite vertical wedge. A player eight metres
 * straight up filled the meter faster than a player six metres away on the guard's own floor,
 * and directly overhead the flattened vector collapsed under the 1e-6 guard and the code
 * substituted `p.forward` — scoring him at angle 0, the dead centre of the bright core.
 *
 * `SIGHT.ceiling` closes that at Carmelita's own measured height above the guard's OWN base.
 * Every test below runs BOTH arms from the same run, because a number from the shipped arm
 * alone cannot say whether the ceiling did anything.
 *
 * **Why both ends of the comparison are soles.** The player's `target` is his feet and `baseY`
 * is the guard's; comparing body centres or heads would blind the scarab, whose eye is 0.26 m
 * off the ground, to a player standing on the same floor. V5 is that case, asserted rather
 * than argued.
 */

/** A fresh `Patrol.js` with the A/B token set as the game reads it — once, at module scope. */
async function patrolArm(arm) {
  if (arm) globalThis.__SIGHT_AB = arm; else delete globalThis.__SIGHT_AB;
  const mod = await import(`../src/ai/Patrol.js?sight=${arm || 'on'}`);
  delete globalThis.__SIGHT_AB;
  return mod;
}

/**
 * One frame of sight. `rise` is the player's FEET above the guard's base; `fwd`/`lat` are the
 * horizontal offsets along and across his facing. Returns the fill rate and whether he saw.
 */
function look(P, type, { rise = 0, fwd = 6, lat = 0, baseY = 0, moving = 0.36, airborne = false } = {}) {
  const cfg = P.VISION[type];
  const s = new P.Senses(type, 11);
  const gain = s.evaluate({
    eye: new THREE.Vector3(0, baseY + cfg.eyeHeight, 0),
    forward: new THREE.Vector3(0, 0, 1),
    target: new THREE.Vector3(lat, baseY + rise, fwd),
    targetTop: 0.95, baseY, collision: null,
    moving, sneaking: false, crouching: false, airborne,
    light: 0.3, alerted: false, dt: 1 / 60,
  });
  return { gain, saw: s.sawThisFrame, heard: s.heardThisFrame };
}

const ROSTERS = ['temple', 'heavy', 'scarab'];

test('V1 level ground is untouched — every roster, every distance, bit for bit', async () => {
  /* §418.3 DOMAIN. Passes on: the shipped tree, where the ceiling cannot engage at rise 0.
     Fails on: any ceiling measured from something other than the guard's own base — a limit
     taken from `eyeHeight` puts the scarab's at 0.26 m and this test goes red on him first.
     Does not discriminate: anything above the floor, which is V2/V3/V4's job. */
  const sky = await patrolArm('sky');
  const now = await patrolArm('');
  let inspected = 0;
  for (const type of ROSTERS) {
    for (const fwd of [1, 2, 4, 6, 8, 12]) {
      for (const lat of [0, 1, 3]) {
        const a = look(sky, type, { rise: 0, fwd, lat });
        const b = look(now, type, { rise: 0, fwd, lat });
        assert.equal(b.gain, a.gain, `${type} at fwd ${fwd} lat ${lat}: ${b.gain} != ${a.gain}`);
        assert.equal(b.saw, a.saw, `${type} at fwd ${fwd} lat ${lat}: sawThisFrame moved`);
        inspected++;
      }
    }
  }
  console.log(`[V1] ${inspected} level-ground stimuli, identical in both arms`);
  assert.ok(inspected === 54, `inspected ${inspected}`);
});

test('V2 straight overhead was the dead centre of the bright core, and now is nothing', async () => {
  /* §418.3 DOMAIN. Passes on: the shipped tree. Fails on: the pre-§748 tree, which is the `sky`
     arm here and is asserted to still show the defect — so this test cannot go green by the
     instrument losing its subject. */
  const sky = await patrolArm('sky');
  const now = await patrolArm('');
  let inspected = 0;
  for (const type of ROSTERS) {
    for (const rise of [2, 4, 8]) {
      /* exactly overhead: `_flat` collapses under 1e-6 and `p.forward` is substituted */
      const a0 = look(sky, type, { rise, fwd: 0 });
      const b0 = look(now, type, { rise, fwd: 0 });
      /* and half a metre in front of him, where the flattened bearing is a clean 0° at any
         height — the collapse is only the degenerate case of a defect covering the whole wedge */
      const a1 = look(sky, type, { rise, fwd: 0.5 });
      const b1 = look(now, type, { rise, fwd: 0.5 });
      assert.ok(a0.saw && a0.gain > 0.2, `[sky] ${type} overhead at ${rise} m read ${a0.gain} — the defect is gone from the control arm`);
      assert.ok(a1.saw && a1.gain > 0.2, `[sky] ${type} 0.5 m out at ${rise} m read ${a1.gain}`);
      assert.equal(b0.saw, false, `${type} still sees straight overhead at ${rise} m (gain ${b0.gain})`);
      assert.equal(b1.saw, false, `${type} still sees 0.5 m out at ${rise} m (gain ${b1.gain})`);
      inspected += 4;
    }
  }
  console.log(`[V2] ${inspected} overhead stimuli; the sky arm still shows the defect on every one`);
  assert.ok(inspected === 36, `inspected ${inspected}`);
});

test('V3 the ceiling is Carmelita\'s measured height, and it is soft rather than a wall', async () => {
  /* §418.3 DOMAIN. Passes on: the shipped smoothstep. Fails on: a hard cutoff, which would put
     a step in this ramp instead of a monotone fade, and on a ceiling moved by more than a
     centimetre in either direction. */
  const { SIGHT } = await import('../src/ai/Patrol.js');
  assert.ok(Math.abs(SIGHT.ceiling - 1.81628) < 5e-5,
    `SIGHT.ceiling is ${SIGHT.ceiling} — tools/sightceil.mjs --height measures 1.81628 m`);
  assert.ok(SIGHT.soft >= 0.25, `a ${SIGHT.soft} m soft band is a hard cutoff in disguise`);

  const now = await patrolArm('');
  const base = look(now, 'temple', { rise: 0, fwd: 6 }).gain;
  const ramp = [];
  for (let r = SIGHT.ceiling - SIGHT.soft - 0.1; r <= SIGHT.ceiling + 0.1; r += 0.05) {
    ramp.push({ r, g: look(now, 'temple', { rise: r, fwd: 6 }).gain / base });
  }
  /* monotone down, starts at full, ends at nothing, and takes more than one sample to do it */
  let drops = 0;
  for (let i = 1; i < ramp.length; i++) {
    assert.ok(ramp[i].g <= ramp[i - 1].g + 1e-9, `not monotone at rise ${ramp[i].r.toFixed(2)}`);
    if (ramp[i].g < ramp[i - 1].g - 1e-9) drops++;
  }
  assert.ok(ramp[0].g > 0.999, `the fade starts early: ${ramp[0].g} at rise ${ramp[0].r.toFixed(2)}`);
  assert.equal(ramp[ramp.length - 1].g, 0, 'the ceiling is not closed at the top');
  assert.ok(drops >= 5, `the boundary fell in ${drops} steps — that is a cutoff, not a fade`);
  console.log(`[V3] ceiling ${SIGHT.ceiling} m, soft ${SIGHT.soft} m: ${ramp.length} samples, ${drops} descending steps`);
});

test('V4 a slightly-raised surface — a step, a ramp, a plinth edge — is still seen', async () => {
  /* §418.3 DOMAIN. Passes on: the shipped ceiling, which sits above MOVEMENT's own 1.80 m
     standing capsule. Fails on: any per-type derivation from the guard's eye or head — the
     scarab's would be 0.26–0.34 m and a 0.4 m step would blind him. The heights below are the
     ones `tools/sightceil.mjs --drive` reads off the shipped collision at real stations. */
  const now = await patrolArm('');
  let inspected = 0;
  for (const type of ROSTERS) {
    for (const rise of [0.10, 0.25, 0.398, 0.75, 1.00, 1.25]) {
      const r = look(now, type, { rise, fwd: 5 });
      assert.ok(r.saw, `${type} lost a player standing ${rise} m up, 5 m away`);
      assert.ok(r.gain > 0.15, `${type} at rise ${rise}: gain fell to ${r.gain}`);
      inspected++;
    }
  }
  console.log(`[V4] ${inspected} raised-surface stimuli, all still seen`);
  assert.ok(inspected === 18, `inspected ${inspected}`);
});

test('V5 the scarab is not blinded on level ground — the hazard a per-type limit would have hit', async () => {
  /* §418.3 DOMAIN. Passes on: a ceiling measured feet-to-feet. Fails on: a ceiling measured
     from the guard's eye or head — `VISION.scarab.eyeHeight` is 0.26 m and a standing player's
     chest is 0.95 m up, so the beetle would stop seeing the floor it patrols. Asserted on the
     scarab specifically because it is the only roster where the two rules disagree. */
  const now = await patrolArm('');
  const sky = await patrolArm('sky');
  let inspected = 0;
  for (const fwd of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const a = look(sky, 'scarab', { rise: 0, fwd });
    const b = look(now, 'scarab', { rise: 0, fwd });
    assert.ok(b.saw, `the scarab lost a player standing ${fwd} m in front of it on its own floor`);
    assert.equal(b.gain, a.gain, `the scarab's floor read moved at ${fwd} m: ${b.gain} vs ${a.gain}`);
    inspected++;
  }
  console.log(`[V5] scarab, ${inspected} level-ground distances, unchanged`);
  assert.ok(inspected === 8, `inspected ${inspected}`);
});

test('V6 a guard standing on the raised floor still sees a player on it — baseY is HIS', async () => {
  /* §418.3 DOMAIN. Passes on: `baseY` taken per guard from his own `position.y`. Fails on: a
     ceiling measured from world y = 0, which would blind every guard above the courtyard to
     his own deck — and the shipped roster has guards standing at y = 2.00, 17.00 and −12.00. */
  const now = await patrolArm('');
  let inspected = 0;
  for (const baseY of [2.0, 7.75, 17.0, -12.0]) {
    for (const type of ROSTERS) {
      const flat = look(now, type, { rise: 0, fwd: 5, baseY });
      const zero = look(now, type, { rise: 0, fwd: 5, baseY: 0 });
      assert.ok(flat.saw, `${type} on a floor at y=${baseY} lost a player standing beside him`);
      assert.equal(flat.gain, zero.gain, `${type}'s read depends on his ABSOLUTE height (${flat.gain} vs ${zero.gain})`);
      inspected++;
    }
  }
  console.log(`[V6] ${inspected} guard-floor heights, every read identical to the courtyard's`);
  assert.ok(inspected === 12, `inspected ${inspected}`);
});

test('V7 ?sight=sky restores the pre-§748 sight exactly, and it is the only thing that does', async () => {
  /* §418.3 DOMAIN. Passes on: the token. Fails on: no token — the same sweep without it differs
     on every above-ceiling row, which the second half asserts so the revert cannot pass by the
     sweep being empty. */
  const sky = await patrolArm('sky');
  const now = await patrolArm('');
  let same = 0, differ = 0;
  for (const type of ROSTERS) {
    for (const rise of [0, 0.5, 1.0, 1.5, 2, 3, 4, 6, 8]) {
      for (const fwd of [0, 2, 6, 12]) {
        const a = look(sky, type, { rise, fwd });
        const b = look(now, type, { rise, fwd });
        if (rise < 1.31) { assert.equal(b.gain, a.gain, `${type} rise ${rise} fwd ${fwd}`); same++; }
        else if (a.gain > 0) { assert.ok(b.gain < a.gain, `${type} rise ${rise} fwd ${fwd}: ${b.gain} !< ${a.gain}`); differ++; }
      }
    }
  }
  console.log(`[V7] ${same} rows identical under the ceiling, ${differ} rows lowered above it`);
  assert.ok(same >= 36, `only ${same} rows below the fade`);
  assert.ok(differ >= 40, `only ${differ} rows above it — the sweep is not reaching the ceiling`);
});

test('V8 hearing is deliberately NOT ceilinged, and cannot reach chase from up there', async () => {
  /* §418.3 DOMAIN. Passes on: the shipped tree, where the ceiling is applied after the hearing
     block. Fails on: a ceiling applied before it, which would delete the noise term as well —
     the owner's words were about sight, and a guard who cannot hear a runner overhead is a
     second change hidden inside this one. */
  const now = await patrolArm('');
  const cfg = now.VISION.temple;
  const s = new now.Senses('temple', 3);
  const p = {
    eye: new THREE.Vector3(0, cfg.eyeHeight, 0), forward: new THREE.Vector3(0, 0, 1),
    target: new THREE.Vector3(0, 5, 2), targetTop: 0.95, baseY: 0, collision: null,
    moving: 0.9, sneaking: false, crouching: false, airborne: false,
    light: 0.3, alerted: false, dt: 1 / 60,
  };
  const gain = s.evaluate(p);
  assert.equal(s.sawThisFrame, false, 'he SAW a player 5 m above him');
  assert.equal(s.heardThisFrame, true, 'he stopped hearing a runner 5 m above him');
  assert.ok(gain > 0, `hearing produced no gain (${gain})`);
  let n = 0;
  for (let t = 0; t < 60; t += 1 / 60) { s.evaluate(p); n++; }
  console.log(`[V8] heard-not-seen from 5 m up: gain ${gain.toFixed(3)}, meter settles at ${s.suspicion.toFixed(3)} after ${n} frames`);
  /* The cap is tested BEFORE the frame's gain is added, so it can overshoot by exactly one
     frame of it — measured 0.663 against a 0.66 cap. That is the real bound and the earlier
     draft of this line asserted the wrong one; it is not a tolerance, it is the arithmetic. */
  assert.ok(s.suspicion <= now.DETECT.hearCap + gain * (1 / 60) + 1e-9,
    `noise from above carried the meter to ${s.suspicion}, past hearCap ${now.DETECT.hearCap} + one frame`);
  assert.ok(s.suspicion < now.DETECT.searching,
    `noise from above reached ${s.suspicion}, past SEARCHING ${now.DETECT.searching}`);
  assert.ok(s.suspicion < now.DETECT.chase, 'noise from above can reach CHASE');
});

test('V9 CALIBRATION: the three level-ground bars go red on the ceiling that was nearly shipped', async () => {
  /* §418.3, in the form that costs nothing to run: V1, V4, V5 and V6 pass on BOTH trees, so
     none of them is evidence about the ceiling until it has been seen to fail. The ceiling that
     would have been shipped by the obvious per-type derivation — each roster's own eye or head
     height — is set here and the same three reads are taken again. `SIGHT` is the tuning block
     the game reads per frame, so this is the real value being bracketed and not a copy.
     Restored in a `finally`, and V1..V6 run before this test in file order either way. */
  const P = await import('../src/ai/Patrol.js');
  const keep = P.SIGHT.ceiling;
  const broken = [];
  try {
    const level = ROSTERS.map((t) => look(P, t, { rise: 0, fwd: 5 }).gain);
    P.SIGHT.ceiling = 0.34;              // Guard.TUNE.headTop.scarab — the beetle's own height
    ROSTERS.forEach((type, i) => {
      /* V1 and V5 assert the level-ground read is IDENTICAL, not merely non-zero: a 0.34 m
         ceiling leaves the fade band straddling the floor, so a player standing on it is dimmed
         to 73 % rather than deleted. That is the failure those two bars actually catch. */
      const r = look(P, type, { rise: 0, fwd: 5 });
      if (r.gain !== level[i]) broken.push(`${type} level ground ${level[i].toFixed(3)}→${r.gain.toFixed(3)}`);
      const step = look(P, type, { rise: 0.398, fwd: 5 });
      if (!step.saw) broken.push(`${type} 0.4 m step BLIND`);
    });
  } finally {
    P.SIGHT.ceiling = keep;
  }
  console.log(`[V9] at ceiling 0.34 m the bars break on: ${broken.join(', ')}`);
  assert.ok(broken.length >= 4,
    `a 0.34 m ceiling broke only ${broken.length} reads — V1/V4/V5 cannot discriminate`);
  /* and everything is genuinely back */
  assert.equal(P.SIGHT.ceiling, keep);
  for (const type of ROSTERS) assert.ok(look(P, type, { rise: 0, fwd: 5 }).saw, `${type} not restored`);
});
