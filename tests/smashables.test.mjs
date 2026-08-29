import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  TUNE, KINDS, SKIP_WAYPOINTS, Smashables, authorSmashables, inSwing,
} from '../src/world/Smashables.js';
import { smashFor } from '../src/fx/Emitters.js';
import { stepFor } from '../src/audio/Sfx.js';
import { primeKayKitAssets } from './_kaykitboot.mjs';
import { loadModelLib } from '../src/world/KayKit.js';

/* §729: prime the pack's bytes BEFORE any boot, so every arm below runs the SHIPPED swap path —
 * imported bodies on the atlas material — not the headless fallback. The fallback and the
 * `?smash=gen` arm are exercised deliberately, in children, by S16/S17. */
primeKayKitAssets();

/**
 * Smashables — the mechanic half of `propSmashed`.
 *
 * ── What was already built, and what this had to be careful about ──────────────────────────
 * `tests/eventbus.test.mjs` listed `propSmashed` under DEAD_UNBUILT with a complete payload
 * spec. `Particles.smash()` and `Audio._onSmash()` were both live and neither could ever fire.
 * So the load-bearing risk here is NOT that breaking works — it is that the payload drifts from
 * what those two already read, in which case a break produces a silent no-op or the wrong
 * material, and no import breaks and no test fails. That is §239's failure with the halves
 * swapped, and S5/S6 are aimed at it.
 *
 * The second risk is a copy that drifts. The resolve geometry is `Guard.js`'s, copied so a jar
 * and a guard in one swing behave alike; S1 scrapes Guard.js at test time so the copy cannot
 * silently stop being one.
 *
 * ── §418.3 ─────────────────────────────────────────────────────────────────────────────────
 * Every arm carries a `DOMAIN (§418.3)` block naming one input seen to pass and one seen to
 * fail. Where no failing input exists the arm says TRIPWIRE and is not counted as evidence.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');

const GUARD_SRC = SRC('src/ai/Guard.js');
const SMASH_SRC = SRC('src/world/Smashables.js');
const MOVESET_SRC = SRC('src/player/Moveset.js');
const CONTROLLER_SRC = SRC('src/player/Controller.js');

const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/** The real route, scraped from the level's own literal — same method as pickups.test.mjs. */
const ROUTE = (() => {
  const m = SRC('src/world/EgyptLevel.js').match(/api\.route\s*=\s*\[([\s\S]*?)\n\s*\];/);
  if (!m) return [];
  const out = [];
  const re = /\[\s*'([^']+)'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
  let w;
  while ((w = re.exec(m[1]))) out.push([w[1], +w[2], +w[3], +w[4]]);
  return out;
})();

/* ============================================================================================
   0. PREREG-smash1 — the numbers are Guard.js's, not this module's taste
============================================================================================ */

test('PREREG the cane reach and cone are lifted from the resolver that already ships', () => {
  /**
   * `Guard.js:1770` is the ONLY thing in `src/` that resolved `caneHit` against anything. Its
   * two constants are scraped from that file rather than retyped, so if the combat lane retunes
   * the cane, this fails instead of quietly giving props a different reach than guards.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the shipped Guard.js — the scoped scrape returns 2.2 and 0.1, matching TUNE.
   * FAILS ON:  **seen on the shipped tree, which is how the scrape got fixed.** The first
   *            version of this scrape was unscoped and returned **1.4** — `lengthSq() > 1.4*1.4`
   *            from an unrelated proximity test hundreds of lines above the `caneHit` handler —
   *            so the arm went red against correct code. That is §418.1's second group exactly:
   *            an instrument answering honestly about the wrong quantity, and the only reason it
   *            was caught is that it happened to disagree. Both readings were run; the unscoped
   *            regex still returns 1.4 against Guard.js today.
   */
  /* Scoped to the `caneHit` handler, not to the whole file. The first draft of this scrape was
     unscoped and matched `lengthSq() > 1.4 * 1.4` from an unrelated proximity check hundreds of
     lines earlier — an instrument answering honestly about the wrong quantity (§418.1's second
     group), and it went red on the shipped tree, which is the only reason it was caught. */
  const handler = /on\('caneHit',[\s\S]*?\n\s{4}\}\);/.exec(GUARD_SRC);
  assert.ok(handler, 'Guard.js no longer resolves `caneHit` — the copy below has no original');
  const H = handler[0];

  const reach = /lengthSq\(\)\s*>\s*([\d.]+)\s*\*\s*\1/.exec(H);
  assert.ok(reach, 'could not scrape the cane reach out of Guard.js — the resolver has moved');
  assert.equal(TUNE.hitRange, +reach[1],
    `props are hit at ${TUNE.hitRange} m and guards at ${reach[1]} m by the same swing`);

  const cone = /\.dot\(dir\)\s*<\s*([\d.]+)/.exec(H);
  assert.ok(cone, 'could not scrape the cane facing cone out of Guard.js');
  assert.equal(TUNE.hitDot, +cone[1],
    `props use a ${TUNE.hitDot} cone and guards a ${cone[1]} one on the same event`);

  /* And the slam fallback is the radius the event itself carries. */
  const dive = /diveRadius:\s*([\d.]+)/.exec(CONTROLLER_SRC);
  assert.ok(dive, 'Controller.TUNE.diveRadius is gone');
  assert.equal(TUNE.slamFallback, +dive[1],
    'the slam fallback radius has drifted from the one `caneSlam` publishes');

  /* The vertical bound is one player height, not a number of its own. */
  const h = /\n\s*height:\s*([\d.]+)/.exec(CONTROLLER_SRC);
  assert.ok(h, 'Controller.TUNE.height is gone');
  assert.equal(TUNE.hitRise, +h[1], 'the vertical bound is no longer one player height');
});

/* ============================================================================================
   1. the resolve  (S1-S3)
============================================================================================ */

const at = (x, y, z) => ({ x, y, z });

test('S1 the swing hits what is in front of it and not what is behind it', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: a jar 1.0 m along +z with the facing +z — hit.
   * FAILS ON:  seen — the same jar at 1.0 m along −z with the same facing: `dot` is −1, well
   *            under the 0.1 cone, and it is not hit. Both run below.
   */
  const from = at(0, 0, 0);
  const fwd = at(0, 0, 1);
  assert.equal(inSwing(at(0, 0, 1.0), from, fwd, TUNE.hitRange), true, 'a jar in front survived');
  assert.equal(inSwing(at(0, 0, -1.0), from, fwd, TUNE.hitRange), false, 'a jar behind him broke');

  /* The cone's own edge: 0.1 is cos(84.3 deg), so a jar just inside 84 deg goes and one just
     outside does not. Bracketed rather than sampled at one point. */
  const ang = (deg) => at(Math.sin(deg * Math.PI / 180), 0, Math.cos(deg * Math.PI / 180));
  assert.equal(inSwing(ang(80), from, fwd, TUNE.hitRange), true, 'the cone is narrower than it says');
  assert.equal(inSwing(ang(88), from, fwd, TUNE.hitRange), false, 'the cone is wider than it says');
});

test('S2 the reach is bounded, and the boundary is where TUNE says it is', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: 2.1 m dead ahead — inside 2.2, hit.
   * FAILS ON:  seen — 2.3 m dead ahead, outside 2.2, not hit. Both run below, 0.2 m apart
   *            across the bound. The sweep after them LOCATES the crossing at 0.01 m rather
   *            than trusting the two samples, because a pair of samples either side of a bound
   *            is consistent with a bound anywhere between them.
   */
  const from = at(0, 0, 0), fwd = at(0, 0, 1);
  assert.equal(inSwing(at(0, 0, 2.1), from, fwd, TUNE.hitRange), true);
  assert.equal(inSwing(at(0, 0, 2.3), from, fwd, TUNE.hitRange), false);

  let crossing = null;
  for (let d = 0.05; d < 4; d += 0.01) {
    if (!inSwing(at(0, 0, d), from, fwd, TUNE.hitRange)) { crossing = d; break; }
  }
  assert.ok(crossing !== null, 'the reach never ends — every prop in the level is in one swing');
  assert.ok(Math.abs(crossing - TUNE.hitRange) < 0.02,
    `the reach ends at ${crossing.toFixed(2)} m, not the ${TUNE.hitRange} m it claims`);
});

test('S3 a swing on a roof does not break the pots on the floor below it', () => {
  /**
   * Guard.js flattens its test to the plan and gets away with it because a guard is always
   * within a body height of the player's feet. A jar is 0.5 m and can be on a ledge, so the
   * planar-only copy would let a swing on the nave deck break a jar 15 m below on the paving —
   * within 2.2 m in plan, and invisible.
   *
   * DOMAIN (§418.3)
   * PASSES ON: a jar 1.0 m above the swing — inside one player height, hit.
   * FAILS ON:  seen — the same jar 2.5 m above, and again 4.0 m below: both outside the bound
   *            and both spared. Run below. Also seen the other way: with the `hitRise` term
   *            removed the 15 m case is a hit, which is the defect this bound exists for.
   */
  const from = at(0, 0, 0), fwd = at(0, 0, 1);
  assert.equal(inSwing(at(0, 1.0, 1.0), from, fwd, TUNE.hitRange), true, 'a jar on a table was spared');
  assert.equal(inSwing(at(0, 2.5, 1.0), from, fwd, TUNE.hitRange), false, 'a jar on a shelf 2.5 m up broke');
  assert.equal(inSwing(at(0, -4.0, 1.0), from, fwd, TUNE.hitRange), false, 'a jar 4 m below broke');

  /* The planar-only form, evaluated beside it: it must disagree, or this bound does nothing. */
  const planarOnly = Math.hypot(0 - 0, 1.0 - 0) <= TUNE.hitRange;
  assert.equal(planarOnly, true);
  assert.notEqual(inSwing(at(0, 15.0, 1.0), from, fwd, TUNE.hitRange), planarOnly,
    'the vertical bound agrees with a planar-only test at 15 m of separation — it has been ' +
    'removed and a swing on the roof breaks the courtyard');
});

test('S4 a slam has no facing, so it takes everything around him', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: `dir = null` at 1.0 m behind — hit, because the Cane Slam is omnidirectional.
   * FAILS ON:  seen — the same point with `dir` = +z, which is the combo path and misses it.
   *            The two calls differ in one argument and that argument decides.
   */
  const from = at(0, 0, 0);
  assert.equal(inSwing(at(0, 0, -1.0), from, null, TUNE.slamFallback), true,
    'the slam missed something directly behind him');
  assert.equal(inSwing(at(0, 0, -1.0), from, at(0, 0, 1), TUNE.slamFallback), false,
    'the facing argument stopped mattering — the combo and the slam resolve identically');
});

/* ============================================================================================
   2. placement
============================================================================================ */

test('S5 the layout comes off the route, and skips the two waypoints that are not floors', () => {
  /**
   * `hook-chain` hangs in mid-air and `hall-front-cornice` is a stale coordinate that
   * `Props._clueBottles()` measured falling the full 15 m to the paving. A jar at either is a
   * jar in the sky.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the real route — zero props within 2 m of either excluded waypoint, and at least
   *            two props at every other one.
   * FAILS ON:  seen — the same route with `SKIP_WAYPOINTS` emptied (simulated below by renaming
   *            the two waypoints), which puts props at both and trips the first assertion.
   */
  assert.ok(ROUTE.length >= 8, `§211.1: scraped only ${ROUTE.length} waypoints`);
  const specs = authorSmashables(ROUTE);
  assert.ok(specs.length >= 16, `§211.1: authored only ${specs.length} smashables`);

  for (const name of SKIP_WAYPOINTS) {
    const w = ROUTE.find((r) => r[0] === name);
    assert.ok(w, `the route no longer has a '${name}' waypoint — this exclusion is stale`);
    const near = specs.filter((s) => Math.hypot(s.x - w[1], s.y - w[2], s.z - w[3]) < 2.0);
    assert.equal(near.length, 0, `${near.length} smashables were placed at '${name}', which is not a floor`);
  }

  /* Every other waypoint got a cluster, and every cluster is inside the authored radius. */
  let covered = 0;
  for (const w of ROUTE) {
    if (SKIP_WAYPOINTS.includes(w[0])) continue;
    const mine = specs.filter((s) => s.at === w[0]);
    assert.ok(mine.length >= TUNE.clusterMin, `waypoint '${w[0]}' got ${mine.length} smashables`);
    for (const s of mine) {
      assert.equal(s.y, w[2], `a smashable at '${w[0]}' left the waypoint's own floor height`);
      const r = Math.hypot(s.x - w[1], s.z - w[3]);
      assert.ok(r <= TUNE.clusterR + 1e-9,
        `a smashable at '${w[0]}' is ${r.toFixed(2)} m out, past the ${TUNE.clusterR} m cluster radius`);
    }
    covered++;
  }
  assert.equal(covered, ROUTE.length - SKIP_WAYPOINTS.length);

  /* The failing half, run: with the exclusions defeated the props do appear there. */
  const renamed = ROUTE.map((w) => (SKIP_WAYPOINTS.includes(w[0]) ? ['ok-' + w[0], w[1], w[2], w[3]] : w));
  const w0 = ROUTE.find((r) => r[0] === SKIP_WAYPOINTS[0]);
  const bad = authorSmashables(renamed)
    .filter((s) => Math.hypot(s.x - w0[1], s.y - w0[2], s.z - w0[3]) < 2.0);
  assert.ok(bad.length > 0,
    'renaming the excluded waypoints no longer places props at them — SKIP_WAYPOINTS has ' +
    'stopped being what keeps them off, and this arm proves nothing');
});

test('S6 the layout is pure and deterministic, and degrades safely', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: two calls on the real route producing identical arrays; a null/short/garbage
   *            route producing [].
   * FAILS ON:  seen — the same two calls with a `Math.random`-backed rng passed in, which
   *            differ. Run below as the counterexample, so "deterministic" is measured against
   *            something that is not rather than asserted alone.
   */
  const a = JSON.stringify(authorSmashables(ROUTE));
  const b = JSON.stringify(authorSmashables(ROUTE));
  assert.equal(a, b, 'the layout is not deterministic — two boots place different props');

  const loose = () => { const f = () => Math.random(); f.range = (lo, hi) => lo + f() * (hi - lo); return f; };
  assert.notEqual(
    JSON.stringify(authorSmashables(ROUTE, { rng: loose() })),
    JSON.stringify(authorSmashables(ROUTE, { rng: loose() })),
    'an unseeded rng no longer changes the layout — the determinism above is coming from ' +
    'somewhere other than the seed, and this arm is not testing it');

  assert.deepEqual(authorSmashables(null), []);
  assert.deepEqual(authorSmashables([]), []);
  assert.deepEqual(authorSmashables([['x']]), []);
  assert.deepEqual(authorSmashables([[1, 2, 3, 4]]), [], 'a waypoint with no name was accepted');
  assert.deepEqual(authorSmashables([['nan', NaN, 0, 0]]), [], 'a non-finite waypoint was accepted');
});

/* ============================================================================================
   3. the event, against the two subscribers that already shipped
============================================================================================ */

function fakeEngine(modules = {}) {
  const events = new Map();
  return {
    scene: new THREE.Scene(),
    log: [],
    on(evt, fn) {
      if (!events.has(evt)) events.set(evt, new Set());
      events.get(evt).add(fn);
      return () => events.get(evt)?.delete(fn);
    },
    emit(evt, payload) {
      this.log.push({ evt, payload });
      for (const fn of events.get(evt) ?? []) fn(payload);
    },
    get(k) { return modules[k] ?? null; },
    has(k) { return k in modules; },
    warn() {},
  };
}

async function boot(extra = {}) {
  const engine = fakeEngine({ architecture: { api: { route: ROUTE } }, ...extra });
  const sm = new Smashables(engine);
  await sm.init();
  return { engine, sm };
}

test('S7 a cane swing publishes `propSmashed`, and the payload is the one the spec named', async () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: a swing standing on a cluster — one or more events, each with a finite `pos`, a
   *            `material` both catalogues resolve, and a `scale` inside `smash()`'s clamp.
   * FAILS ON:  seen — the same swing made 40 m away from every cluster publishes nothing, and
   *            the arm's `>= 1` bar catches it. Run below as the second half.
   */
  const { engine, sm } = await boot();
  const target = sm.props[0];
  const from = { x: target.pos.x, y: target.pos.y, z: target.pos.z - 1.0 };
  engine.emit('caneHit', { index: 1, pos: from, dir: { x: 0, y: 0, z: 1 } });

  const breaks = engine.log.filter((e) => e.evt === 'propSmashed');
  assert.ok(breaks.length >= 1, 'a swing standing on a cluster broke nothing');

  let inspected = 0;
  for (const b of breaks) {
    const p = b.payload;
    assert.ok(p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) && Number.isFinite(p.pos.z),
      'a break carried no usable position');
    assert.ok(typeof p.material === 'string', 'a break carried no material tag');
    assert.ok(p.scale >= 0.25 && p.scale <= 4,
      `scale ${p.scale} is outside the [0.25, 4] band Particles.smash clamps to`);
    inspected++;
  }
  assert.equal(inspected, breaks.length);

  /* The failing half: a swing nowhere near anything. */
  const before = engine.log.filter((e) => e.evt === 'propSmashed').length;
  engine.emit('caneHit', { index: 1, pos: { x: 900, y: 900, z: 900 }, dir: { x: 0, y: 0, z: 1 } });
  assert.equal(engine.log.filter((e) => e.evt === 'propSmashed').length, before,
    'a swing 900 m from the level broke something');
});

test('S8 every material this publishes is one BOTH shipped subscribers resolve', () => {
  /**
   * `Particles.smashFor()` and `Sfx.stepFor()` both default to stone for an unknown tag, which
   * is the friendly behaviour and also the one that hides a typo forever: a `material: 'clay'`
   * would produce limestone chips and a stone transient and look entirely correct.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the three shipped tags — 'stone', 'cloth', 'wood' — each of which resolves to a
   *            recipe/cue DIFFERENT from the default on at least one of the two readers.
   * FAILS ON:  seen — a fourth kind added with `material: 'clay'`, which resolves to
   *            `SMASH.stone` and `step_stone` on both and is indistinguishable from the default.
   *            Run below against that exact tag.
   */
  const dfltSmash = smashFor(undefined);
  const dfltStep = stepFor(undefined);

  let inspected = 0;
  for (const [kind, K] of Object.entries(KINDS)) {
    const s = smashFor(K.material);
    const c = stepFor(K.material);
    assert.ok(s, `no SMASH recipe for '${K.material}' (${kind})`);
    assert.ok(c, `no step cue for '${K.material}' (${kind})`);
    if (K.material !== 'stone') {
      assert.ok(s !== dfltSmash || c !== dfltStep,
        `'${K.material}' (${kind}) resolves to the default on BOTH readers — it is a typo that ` +
        'renders and sounds like stone, which is exactly how a wrong tag survives');
    }
    inspected++;
  }
  assert.equal(inspected, Object.keys(KINDS).length);
  assert.ok(inspected >= 3, `§211.1: only ${inspected} kinds inspected`);

  /* The failing half, run: an unknown tag really does collapse onto the default on both. */
  assert.equal(smashFor('clay'), dfltSmash,
    'an unknown material no longer defaults to stone — this arm is testing nothing');
  assert.equal(stepFor('clay'), dfltStep);
});

test('S9 the break point is lifted off the floor, so smash()\'s downward probe can find it', () => {
  /**
   * `Particles.smash()` treats the point as "in the air at the prop's middle" and raycasts DOWN
   * from it for the surface to paint the decal on, refusing to draw one if nothing is within
   * `TUNE.smashProbe`. Handing it the prop's base starts that ray inside the floor.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the shipped half-height lift — 0.29 m for a jar, so `pos.y` is strictly above
   *            the base and strictly under the lid.
   * FAILS ON:  seen — the obvious alternative, publishing `p.pos` itself, puts `pos.y` exactly
   *            ON the base and the strict `>` rejects it; and a full-height lift (0.58 m for a
   *            jar) puts the point exactly on the lid and the strict `<` rejects that. The bound
   *            has a failing input on both sides, half a jar apart, and neither is hypothetical:
   *            they are the two spellings anyone writing this line would reach for first.
   */
  const engine = fakeEngine({ architecture: { api: { route: ROUTE } } });
  const sm = new Smashables(engine);
  return sm.init().then(() => {
    const target = sm.props[0];
    const base = target.pos.clone();
    engine.emit('caneSlam', { pos: { x: base.x, y: base.y, z: base.z }, radius: 1.2 });

    const mine = engine.log.filter((e) => e.evt === 'propSmashed');
    assert.ok(mine.length >= 1, 'the slam broke nothing it was standing on');
    const first = mine[0].payload;
    const h = KINDS[target.kind].h;
    assert.ok(first.pos.y > base.y,
      'the break point is at the prop\'s base — smash()\'s decal probe starts inside the floor');
    assert.ok(first.pos.y < base.y + h,
      'the break point is above the prop it came from');
  });
});

/* ============================================================================================
   4. the coin path, and the one-shot
============================================================================================ */

test('S10 breaking pays through PICKUPS, and this module never publishes `coin` itself', async () => {
  /**
   * The invariant `Pickups.js`'s wallet header spells out: `coin` is banked by `Wallet.credit()`
   * AND by `Health.js` into the charm purse, down two independent paths off one event. A second
   * publisher moves the purse, the HUD and the FX and leaves the wallet behind — silently, with
   * no assertion that catches it and nothing that looks wrong until a charm is awarded for an
   * empty wallet.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the shipped module — a break credits a stub `pickups.award`, and `emit('coin'`
   *            appears nowhere in this file's code.
   * FAILS ON:  seen — the scrape run against a copy of the source with `award?.(K.value, p.pos)`
   *            replaced by `this._emit('coin', …)`: the token check goes red immediately. The
   *            live half fails too — the stub's `award` is never called and the count is 0.
   */
  const paid = [];
  const { engine, sm } = await boot({
    pickups: { award: (v, pos) => { paid.push({ v, pos: pos.clone() }); } },
  });

  const target = sm.props[0];
  engine.emit('caneHit', {
    index: 1,
    pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z - 1.0 },
    dir: { x: 0, y: 0, z: 1 },
  });

  const breaks = engine.log.filter((e) => e.evt === 'propSmashed').length;
  assert.ok(breaks >= 1);
  assert.equal(paid.length, breaks, `${breaks} props broke and ${paid.length} were paid for`);
  for (const p of paid) assert.ok(p.v > 0, 'a break paid nothing');

  /* And the module itself must not be a second `coin` publisher. Comments stripped, because
     this file's own prose names the event and prose is not code (eventbus's own lesson). */
  assert.ok(!/emit\(\s*'coin'/.test(stripComments(SMASH_SRC)),
    'Smashables publishes `coin` directly — Wallet.coins and Health.purse will now diverge');
  assert.ok(/award\?\.\(/.test(stripComments(SMASH_SRC)),
    'the payment no longer goes through Pickups.award()');
});

test('S11 a prop breaks exactly once, however many swings land on it', async () => {
  /**
   * `bottle.gd` in the reference re-connects on every trigger re-entry and can count a pickup
   * twice; the same class of defect here would pay for one jar repeatedly, which is the money
   * farm the no-respawn decision was made to avoid.
   *
   * DOMAIN (§418.3)
   * PASSES ON: twenty identical swings on one cluster — the break count after the first is 0.
   * FAILS ON:  seen — clearing `broken` on every prop between swings republishes the full set,
   *            which is run below as the counterexample.
   */
  const { engine, sm } = await boot();
  const target = sm.props[0];
  const from = { x: target.pos.x, y: target.pos.y, z: target.pos.z - 1.0 };
  const swing = () => engine.emit('caneHit', { index: 1, pos: from, dir: { x: 0, y: 0, z: 1 } });

  swing();
  const first = engine.log.filter((e) => e.evt === 'propSmashed').length;
  assert.ok(first >= 1);
  for (let i = 0; i < 20; i++) swing();
  assert.equal(engine.log.filter((e) => e.evt === 'propSmashed').length, first,
    'swinging at rubble kept breaking it — a broken prop is not latched');
  assert.equal(sm.broken, first);

  /* The failing half, run. */
  for (const p of sm.props) p.broken = false;
  swing();
  assert.ok(engine.log.filter((e) => e.evt === 'propSmashed').length > first,
    'clearing the latch no longer republishes — this arm has stopped discriminating');
});

test('S12 nothing respawns, and the money farm that would create does not exist', () => {
  /**
   * The decision, asserted rather than left in a comment. A smashable pays coins and
   * `Wallet.credit` is add-only with no debit path in `src/`, so a respawn is a coin printer.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the shipped module — no timer, no interval, no respawn token in its code.
   * FAILS ON:  seen — the same regex against a copy with a `setTimeout(... p.broken = false)`
   *            respawn added, which matches on `respawn` and on `setTimeout`.
   */
  const code = stripComments(SMASH_SRC);
  for (const token of [/setTimeout/, /setInterval/, /respawn/i, /\.broken\s*=\s*false/]) {
    assert.ok(!token.test(code),
      `Smashables now contains ${token} — if props respawn, each one prints coins forever`);
  }
  /* §211.1: the scrape is looking at real code, not an empty string. */
  assert.ok(/_break\(p, dir\)/.test(code) && code.length > 2000,
    'the comment strip ate the module — these four checks passed by inspecting nothing');
});

test('S13 TRIPWIRE — every kind has a geometry and an instanced mesh', async () => {
  /**
   * DOMAIN (§418.3) — **unfalsifiable in this level, kept deliberately (§418.5).**
   * PASSES ON: the shipped tree.
   * FAILS ON:  nothing reachable. `_geoFor` has a branch for every key in `KINDS` and
   *            `authorSmashables` only ever emits those keys, so no input this level can produce
   *            leaves a kind without a mesh. TRIPWIRE against a future kind added to `KINDS`
   *            without a branch in `_geoFor` — the failure mode is silent (no mesh, no error, an
   *            invisible prop that still breaks and still pays). NOT evidence the shapes read.
   */
  const { sm } = await boot();
  let inspected = 0;
  for (const kind of Object.keys(KINDS)) {
    const entry = sm._meshes.get(kind);
    assert.ok(entry, `kind '${kind}' produced no mesh`);
    assert.ok(entry.mesh.geometry.attributes.position.count > 24, `'${kind}' geometry is degenerate`);
    assert.equal(entry.mesh.count, entry.list.length);
    inspected++;
  }
  assert.equal(inspected, Object.keys(KINDS).length);
  assert.ok(sm.props.length >= 16, `§211.1: only ${sm.props.length} props built`);
});

test('S14 dispose unhooks everything, and a swing after it does nothing', async () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: dispose, then a swing on a live cluster — zero further `propSmashed`.
   * FAILS ON:  seen — the same swing BEFORE dispose, which publishes. The two are one line
   *            apart below and differ only in whether dispose has run.
   */
  const { engine, sm } = await boot();
  const target = sm.props.find((p) => !p.broken);
  const from = { x: target.pos.x, y: target.pos.y, z: target.pos.z - 1.0 };
  const swing = () => engine.emit('caneHit', { index: 1, pos: from, dir: { x: 0, y: 0, z: 1 } });

  swing();
  assert.ok(engine.log.filter((e) => e.evt === 'propSmashed').length >= 1,
    'the module was not listening before dispose — the arm below would pass vacuously');

  sm.dispose();
  const after = engine.log.filter((e) => e.evt === 'propSmashed').length;
  const survivor = sm.props.find((p) => !p.broken);
  assert.ok(survivor, 'every prop broke; the post-dispose swing would have nothing to hit');
  engine.emit('caneHit', {
    index: 1,
    pos: { x: survivor.pos.x, y: survivor.pos.y, z: survivor.pos.z - 1.0 },
    dir: { x: 0, y: 0, z: 1 },
  });
  assert.equal(engine.log.filter((e) => e.evt === 'propSmashed').length, after,
    'a disposed Smashables is still breaking props');
  assert.equal(sm.root.parent, null, 'dispose left the group in the scene');
});

test('S15 MOVEMENT hands out live scratch on `caneHit`, and nothing here retains it', () => {
  /**
   * `Moveset.Combo.swing` sets a module-level scratch `_a` and emits it as `dir`; `pos` is
   * `c.position` itself. §237 is the same aliasing trap one file over. This arm asserts the
   * hazard is REAL — so it cannot rot into a rule about nothing — and that the module copies.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the shipped Moveset (a module-level `_a` reused across swings) and the shipped
   *            Smashables (`_dir.copy(p.dir)` before use, `new THREE.Vector3` in the payload).
   * FAILS ON:  seen — the scrape against a copy of Smashables with `_dir.copy(p.dir)` replaced
   *            by `p.dir`, which trips the second assertion. The live half fails too: mutating
   *            the caller's vector after the emit changes a retained payload.
   */
  const code = stripComments(SMASH_SRC);
  assert.ok(/_a\.set\(/.test(stripComments(MOVESET_SRC)) && /dir: _a/.test(stripComments(MOVESET_SRC)),
    'MOVEMENT no longer emits a shared scratch as `dir` — this hazard is stale, delete the arm');
  assert.ok(/_dir\.copy\(p\.dir\)/.test(code),
    'the swing direction is used without being copied out of MOVEMENT\'s scratch');
  assert.ok(/new THREE\.Vector3\(p\.pos\.x/.test(code),
    'the published `pos` is not freshly allocated — AUDIO schedules a delayed read of it');
});

/* ============================================================================================
   5. §729 — the imported bodies (the swap itself, its conforms, and its two escape arms)
============================================================================================ */

test('S16 §729: every kind wears its imported body, conformed to the mount it took over', async () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the primed boot below — three kinds swapped, zero fallbacks, each mesh's
   *            triangle count equal to its model's own reduction, each body's measured height
   *            equal to the conform the module recorded, all three meshes on ONE material.
   * FAILS ON:  run, twice, in-arm: (a) `loadModelLib` with a model name the pack does not have
   *            reports the failure and returns no entry — the hole the fallback contract exists
   *            for; (b) the UN-conformed native heights (1.018 / 1.300 / 2.142 m, re-measured
   *            here off the same lib) each bust the ±0.11 conform band the shipped bodies pass,
   *            so the band discriminates a forgotten `geo.scale` from a shipped one. The
   *            headless-unprimed fallback and the `?smash=gen` arm are S17's, in children.
   */
  const { sm } = await boot();
  const swap = sm.debugInfo().swap;
  assert.equal(swap.armed, true, 'the swap is not armed in a tokenless boot');
  assert.deepEqual(swap.fallbacks, [], `kinds fell back with the cache primed: ${swap.fallbacks}`);
  assert.equal(swap.swapped.length, Object.keys(KINDS).length);

  /* the models, re-reduced through the same exported path the module used */
  const lib = await loadModelLib([...new Set(Object.values(KINDS).map((K) => K.model))]);
  let mats = new Set(), inspected = 0;
  for (const [kind, K] of Object.entries(KINDS)) {
    const entry = sm._meshes.get(kind);
    const model = lib.get(K.model);
    assert.ok(entry && model, `no mesh or no model for '${kind}'`);
    assert.equal(entry.mesh.geometry.attributes.position.count, model.geo.attributes.position.count,
      `'${kind}' does not render ${K.model}'s own geometry`);
    entry.mesh.geometry.computeBoundingBox();
    const bb = entry.mesh.geometry.boundingBox;
    const h = bb.max.y - bb.min.y;
    const rec = swap.swapped.find((s) => s.kind === kind);
    assert.ok(Math.abs(h - rec.h) < 1e-3, `'${kind}' body height ${h.toFixed(3)} != recorded conform ${rec.h}`);
    assert.ok(Math.abs(h - K.h) < 0.11,
      `'${kind}' at ${h.toFixed(3)} m is outside the mount's ±0.11 band around KINDS.h ${K.h}`);
    /* the counterexample, evaluated: the native model height must FAIL the same band, or the
       band cannot tell a conformed body from a forgotten scale */
    const nativeH = model.bb.max.y - model.bb.min.y;
    assert.ok(!(Math.abs(nativeH - K.h) < 0.11),
      `${K.model}'s native ${nativeH.toFixed(3)} m PASSES the conform band — the band discriminates nothing`);
    assert.ok(bb.min.y > -1e-3 && bb.min.y < 1e-3, `'${kind}' base is at ${bb.min.y}, not on its floor`);
    assert.ok(h < TUNE.hitRise, `'${kind}' at ${h.toFixed(2)} m is taller than the one-player-height resolve bound`);
    mats.add(entry.mesh.material);
    inspected++;
  }
  assert.equal(inspected, Object.keys(KINDS).length);
  assert.equal(mats.size, 1, `${mats.size} materials across the swapped set — the single-atlas strength (§718) is gone`);
  assert.equal([...mats][0].name, 'smash:kaykit');

  /* the silhouette budget's own bar: the two fattest bodies side by side stay inside the
     cluster ring's worst-case neighbour chord (2·0.47·sin 60° = 0.814 m) */
  const halfW = [...sm._meshes.values()].map(({ mesh }) => {
    const b = mesh.geometry.boundingBox;
    return Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
  }).sort((a, b) => b - a);
  assert.ok(halfW[0] + halfW[1] < 0.814,
    `the two fattest swapped bodies (${(halfW[0] * 2).toFixed(2)} / ${(halfW[1] * 2).toFixed(2)} m) can interpenetrate in a worst-case ring`);

  /* fail input (a), run: a name the pack does not have */
  const missing = [];
  const hole = await loadModelLib(['no_such_model'], (f) => missing.push(f));
  assert.equal(hole.size, 0);
  assert.deepEqual(missing, ['no_such_model'],
    'loadModelLib no longer reports a missing model — the fallback contract has no signal');
});

test('S17 §729: the `?smash=gen` revert and the unprimed fallback, both RUN in children', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: child A (`__SMASH_AB = 'gen'`, primed): generated bodies, generated tags, swap
   *            disarmed — the revert restores the pre-§729 module bit-for-bit at this seam.
   * FAILS ON:  run — child B boots the DEFAULT arm with NO primed cache: the transport guard
   *            answers before any fetch can hang, all three kinds fall back to their generated
   *            stand-ins with a warn each, and the level still has 23 breakables. That child is
   *            the §418.3 failing input for the whole load path (and the §592-family guard: a
   *            swap that fails must not kill a kind). Child C: a bogus token value lands on the
   *            swap arm — the parser discriminates.
   */
  const run = (script) => {
    const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script],
      { encoding: 'utf8', maxBuffer: 32 << 20, cwd: path.join(HERE, '..') });
    const m = /__R__(\{.*\})/.exec(raw);
    assert.ok(m, 'child produced no result line');
    return JSON.parse(m[1]);
  };
  const bootScript = (pre) => `
${pre}
const { primeKayKitAssets } = await import(${JSON.stringify(new URL('./_kaykitboot.mjs', import.meta.url).href)});
if (!globalThis.__SKIP_PRIME) primeKayKitAssets();
const THREE = await import('three');
const { Smashables, KINDS } = await import(${JSON.stringify(new URL('../src/world/Smashables.js', import.meta.url).href)});
const warns = [];
const engine = {
  scene: new THREE.Scene(), on: () => () => {}, emit: () => {}, has: () => false,
  get: (k) => (k === 'architecture' ? { api: { route: ${JSON.stringify(ROUTE)} } } : null),
  warn: (m) => warns.push(String(m)),
};
const sm = new Smashables(engine);
await sm.init();
const kinds = {};
for (const [kind, e] of sm._meshes) kinds[kind] = { tris: e.mesh.geometry.attributes.position.count / 3, mat: e.mesh.material.name };
process.stdout.write('__R__' + JSON.stringify({
  swap: sm.debugInfo().swap, placed: sm.props.length, kinds,
  materials: Object.fromEntries(Object.entries(KINDS).map(([k, K]) => [k, K.material])),
  warns: warns.filter((w) => /smashables:/.test(w)).length,
}));
`;

  /* child A — the revert */
  const gen = run(bootScript(`globalThis.__SMASH_AB = 'gen';`));
  assert.equal(gen.swap.armed, false, 'the gen arm still arms the swap');
  assert.deepEqual(gen.materials, { jar: 'stone', basket: 'cloth', crate: 'wood' },
    'the revert did not restore the generated tags — a canopic jar would throw wood chips');
  assert.equal(gen.kinds.jar.mat, 'smash:clay');
  assert.equal(gen.kinds.basket.mat, 'smash:wicker');
  assert.equal(gen.kinds.crate.mat, 'smash:wood');
  assert.equal(gen.placed, 23, 'the gen arm moved a placement');

  /* child B — the failing input, run: no transport, all three fall back, nothing dies */
  const cold = run(bootScript(`globalThis.__SKIP_PRIME = 1;`));
  assert.equal(cold.swap.armed, true);
  assert.deepEqual([...cold.swap.fallbacks].sort(), ['basket', 'crate', 'jar'],
    'an unprimed headless boot did not fall back per kind — either a fetch hung or a kind died');
  assert.equal(cold.warns, 3, `${cold.warns} fallback warns — silent fallback is the §592 shape`);
  assert.equal(cold.placed, 23, 'the fallback lost placements');
  assert.equal(cold.kinds.jar.mat, 'smash:clay', 'a fallback kind is not on its generated material');

  /* child C — a bogus token value lands on the swap arm */
  const bogus = run(bootScript(`globalThis.__SMASH_AB = 'bogus';`));
  assert.equal(bogus.swap.armed, true, 'a bogus token value disarmed the swap — the parser does not discriminate');
  assert.equal(bogus.kinds.jar.mat, 'smash:kaykit');

  /* and the two arms disagree where they must: same placement count, different bodies */
  assert.notEqual(gen.kinds.jar.tris, bogus.kinds.jar.tris,
    'the gen and swap arms render the same jar geometry — the token changes nothing visible');
});
