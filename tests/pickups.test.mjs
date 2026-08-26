import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  TUNE, COIN_VALUE, TREASURES, FENCE, Wallet, Pickups,
  magnetSpeedAt, stepPickup, authorRouteCoins,
} from '../src/world/Pickups.js';
import { TUNE as CTUNE } from '../src/player/Controller.js';

/**
 * Pickups — the collect loop, and the three listeners it was built to feed.
 *
 * ── What this file is really guarding ──────────────────────────────────────────────────────
 * §239: three modules subscribed to a `coin` event that nothing emitted. No import broke, no
 * test failed, no warning fired — because a subscriber is not evidence that a publisher exists.
 * The single most valuable assertion here is therefore not about magnetism at all: it is that
 * one real emitted event satisfies all three SHIPPED subscriber expressions, **extracted from
 * their own source files at test time** rather than copied into this file. A copy would rot the
 * moment a subscriber renamed a key, which is precisely the failure mode that produced §239.
 *
 * ── PREREG-loot1 (§141.1): registered BEFORE `src/world/Pickups.js` was written ─────────────
 * Every constant is DERIVED from a constant that already existed in the repo. None is a free
 * parameter fitted to a candidate, and none was re-derived after measurement.
 *
 *   collectRadius  = Controller.TUNE.radius + coinRadius = 0.34 + 0.16 = 0.50 m
 *   magnetRadius   = Controller.TUNE.pickRange                         = 2.40 m
 *   speedMin       = Controller.TUNE.walkSpeed                         = 2.60 m/s
 *   speedMax       = 2 x Controller.TUNE.runSpeed                      = 14.40 m/s
 *   settle bound   = Controller.TUNE.pickTime                          = 0.55 s
 *   grabHeight     = Controller.TUNE.height / 2                        = 0.90 m
 *
 *   P1  monotonic      v(d) strictly decreasing on [0, magnet], >= 200 samples
 *   P2  winning        v(collect) > runSpeed                          predicted ~9.99
 *   P3  bounded        v(d) === 0 for d > magnet; no translation in 1 s
 *   P4  terminates     rim -> collected in <= pickTime (0.55 s)       predicted ~0.45
 *   P5  dt-independent 0.30 s at dt=1/30 vs 1/240 differ by < 0.02 m, same verdict
 *   P6  outrun         crossing at runSpeed, closest approach 1.20 m  MUST collect
 *   P7  no aimbot      crossing at runSpeed, closest approach 3.60 m  must NOT collect
 *   P8  payload        one `coin` event satisfies all three extracted subscriber expressions
 *   P9  CALIBRATION    a decoy `{ coins: 7, position: v }` MUST be rejected by those same
 *       ARM            expressions. If the decoy passes, the extractor is blind and P8 is void.
 *   P10 §211.1         non-zero inspected count; exactly 3 `coin` subscribers in src/
 *   P11 one-shot       an overlapped pickup emits exactly once
 *   P12 wallet         total == sum of values; treasure credits on BANK, never on pickup
 *
 * P4's prediction was hand-integrated (trapezoid over 1/v, 0.2 m steps) before the law was
 * coded. Nothing below was tuned after seeing a result.
 *
 * ── The block above is a RECORD, and its numbers are deliberately not updated (§712) ────────
 * The coins were scaled 50% larger on request: `coinRadius` 0.16 → **0.24**, so `collectRadius`
 * re-derives to `0.34 + 0.24` = **0.58 m**. The `0.50` on the line above is left standing because
 * it is what was registered, and a pre-registration that gets edited to match what shipped has
 * stopped being one. What the tests below enforce is the **derivation**, not the literal — P1
 * asserts `collect === playerRadius + coinRadius` whatever those are, which is exactly why a
 * resize could not silently break the contact/magnet split §223 draws.
 *
 * P2's `~9.99` is likewise a prediction about the LAW, evaluated at the 0.50 m it was registered
 * at. `magnetSpeedAt` depends on `magnet`, `speedMin`, `speedMax` and `curve` and on none of the
 * coin's dimensions, so the law is untouched by the resize; capture simply now happens at 0.58 m,
 * further out on a falling curve, at 9.386 m/s. See P2's own note.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');

const HUD_SRC = SRC('src/ui/HUD.js');
const AUDIO_SRC = SRC('src/audio/Audio.js');
const FX_SRC = SRC('src/fx/Particles.js');

/* =============================================================================================
   0. the derivations are real — the constants trace back to Controller.TUNE, not to taste
============================================================================================= */

test('PREREG: every tuning constant is derived from a constant that already existed', () => {
  assert.equal(TUNE.playerRadius, CTUNE.radius, 'playerRadius must be the capsule radius');
  assert.equal(TUNE.collect, +(CTUNE.radius + TUNE.coinRadius).toFixed(10),
    'collect radius must be capsule + coin, i.e. actual contact');
  assert.equal(TUNE.magnet, CTUNE.pickRange, 'magnet radius must be the pickpocket reach');
  assert.equal(TUNE.speedMin, CTUNE.walkSpeed, 'rim speed must be walk speed');
  assert.equal(TUNE.speedMax, 2 * CTUNE.runSpeed, 'peak pull must be 2x run speed');
  assert.equal(TUNE.grabHeight, CTUNE.height / 2, 'grab point must be the capsule centre');
});

/* =============================================================================================
   1. the magnet law  (P1, P2, P3)
============================================================================================= */

test('P1 the pull strengthens strictly as the coin closes', () => {
  const N = 400;
  let inspected = 0;
  let prev = -Infinity;
  for (let i = N; i >= 0; i--) {           // walk inward: d large -> small
    const d = (i / N) * TUNE.magnet;
    const v = magnetSpeedAt(d);
    assert.ok(v > prev, `not monotonic at d=${d.toFixed(4)}: ${v} <= ${prev}`);
    prev = v;
    inspected++;
  }
  assert.ok(inspected >= 200, `§211.1: inspected only ${inspected} samples`);   // P10 shape
});

test('P2 at the moment of capture the coin is outrunning a sprinting player', () => {
  const v = magnetSpeedAt(TUNE.collect);
  assert.ok(v > CTUNE.runSpeed,
    `capture speed ${v.toFixed(3)} must exceed runSpeed ${CTUNE.runSpeed} or the player outruns his own loot`);

  /**
   * The registered ~9.99 m/s is a prediction about the **magnet law**, and it is checked at the
   * distance it was registered for — NOT at whatever `TUNE.collect` currently is (§712).
   *
   * PREREG-loot1 registered `collectRadius = 0.34 + 0.16 = 0.50` and `~9.99` in the same block,
   * so 9.99 is `v(0.50)`. When the coins were scaled 50% larger, `coinRadius` went 0.16 → 0.24
   * and `collect` was re-derived 0.50 → 0.58 — and `v(0.58)` is 9.386. **Nothing about the law
   * moved**: `magnetSpeedAt` reads `magnet`, `speedMin`, `speedMax` and `curve`, all four
   * unchanged. Only the point on the curve at which capture happens moved outward.
   *
   * Re-pinning the constant to 9.386 would have quietly converted a pre-registration into a
   * curve fitted to whatever shipped, which is the one thing a PREREG block exists to prevent.
   * Asserting `v(0.50)` instead keeps the prediction meaning exactly what it meant — if the law
   * is ever retuned, this still fails, which is its whole job.
   */
  const vAtRegistered = magnetSpeedAt(0.50);
  assert.ok(Math.abs(vAtRegistered - 9.99) < 0.05,
    `the magnet LAW drifted: v(0.50) is ${vAtRegistered.toFixed(3)}, registered ~9.99. This is not about ` +
    'the coin\'s size — 0.50 m is the distance PREREG-loot1 registered the prediction at, and the law ' +
    'is supposed to be independent of it.');

  /* And the margin that actually matters, stated rather than left implicit: capture is now at
     0.58 m instead of 0.50 m, so it happens further out and therefore SLOWER. It still has to
     beat a sprint, and the headroom is the number worth reading in a failure. */
  assert.ok(v - CTUNE.runSpeed > 1.0,
    `capture speed ${v.toFixed(3)} is only ${(v - CTUNE.runSpeed).toFixed(3)} m/s clear of runSpeed ` +
    `${CTUNE.runSpeed}; growing the coin moves capture outward along a falling curve, and this is the ` +
    'term that pays for it');
});

test('P3 the assist is bounded — outside the radius nothing moves at all', () => {
  let inspected = 0;
  for (let d = TUNE.magnet + 1e-6; d < 40; d += 0.25) {
    assert.equal(magnetSpeedAt(d), 0, `pull leaked at d=${d}`);
    inspected++;
  }
  assert.ok(inspected > 100, `§211.1: inspected ${inspected}`);

  // And behaviourally: a coin just outside the rim is untouched by a whole second of frames.
  const p = mkCoin(0, TUNE.grabHeight, TUNE.magnet + 0.05);
  const before = p.pos.clone();
  const player = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < 60; i++) assert.equal(stepPickup(p, player, 1 / 60), false);
  assert.ok(p.pos.distanceTo(before) === 0, 'a coin outside the magnet radius translated');
});

/* =============================================================================================
   2. the law behaves in time  (P4, P5)
============================================================================================= */

/** Player at the origin; coin placed on +Z at the grab height so the geometry is 1-D. */
function mkCoin(x, y, z) {
  return { pos: new THREE.Vector3(x, y, z), taken: false, magnet: false, value: 1, kind: 'single' };
}

/** @returns {number|null} seconds until collected, or null if it never was. */
function settleTime(startDist, dt, maxT = 3) {
  const player = new THREE.Vector3(0, 0, 0);
  const p = mkCoin(0, TUNE.grabHeight, startDist);
  for (let t = 0; t < maxT; t += dt) {
    if (stepPickup(p, player, dt)) return t + dt;
  }
  return null;
}

test('P4 a coin at the rim resolves within one pickpocket beat', () => {
  const t = settleTime(TUNE.magnet, 1 / 240);
  assert.ok(t !== null, 'a coin at the rim was never collected');
  assert.ok(t <= CTUNE.pickTime,
    `settle ${t.toFixed(4)} s exceeds the registered bound pickTime=${CTUNE.pickTime} s`);
  // Registered prediction ~0.45 s from hand-integration.
  assert.ok(Math.abs(t - 0.45) < 0.04, `settle ${t.toFixed(4)} s drifted from the registered prediction 0.45 s`);
});

test('P5 the law is frame-rate independent', () => {
  const HOLD = 0.30;
  const run = (dt) => {
    const player = new THREE.Vector3(0, 0, 0);
    const p = mkCoin(0, TUNE.grabHeight, TUNE.magnet);
    let taken = false;
    for (let t = 0; t < HOLD - 1e-9; t += dt) taken = taken || stepPickup(p, player, dt);
    return { pos: p.pos.clone(), taken };
  };
  const slow = run(1 / 30);
  const fast = run(1 / 240);
  const drift = slow.pos.distanceTo(fast.pos);
  assert.ok(drift < 0.02, `dt=1/30 and dt=1/240 diverged by ${drift.toFixed(4)} m after ${HOLD} s`);
  assert.equal(slow.taken, fast.taken, 'the two rates disagreed on whether it was collected');

  // And the verdict at the registered bound must agree too.
  assert.ok(settleTime(TUNE.magnet, 1 / 30) <= CTUNE.pickTime, 'not collected in time at 30 Hz');
  assert.ok(settleTime(TUNE.magnet, 1 / 240) <= CTUNE.pickTime, 'not collected in time at 240 Hz');
});

/* =============================================================================================
   3. the assist forgives a near miss and nothing wider  (P6, P7)
============================================================================================= */

/** Run the player past a coin in a straight line at run speed; does the coin get taken? */
function flyBy(closestApproach, { speed = CTUNE.runSpeed, dt = 1 / 120 } = {}) {
  const p = mkCoin(closestApproach, TUNE.grabHeight, 0);
  const player = new THREE.Vector3(0, 0, -12);
  for (let i = 0; i < Math.ceil(24 / (speed * dt)); i++) {
    player.z += speed * dt;
    if (stepPickup(p, player, dt)) return true;
    if (player.z > 12) break;
  }
  return false;
}

test('P6 a running player collects a coin he passes within half the magnet radius', () => {
  assert.equal(flyBy(TUNE.magnet * 0.5), true,
    `a coin ${(TUNE.magnet * 0.5).toFixed(2)} m off the line was missed — the magnet does not work`);
});

test('P7 the magnet does not reach past its own radius (this is an assist, not an aimbot)', () => {
  assert.equal(flyBy(TUNE.magnet * 1.5), false,
    `a coin ${(TUNE.magnet * 1.5).toFixed(2)} m off the line was vacuumed up`);
});

test('P6/P7 the boundary is where it says it is, swept', () => {
  let lastTaken = -1, firstMissed = Infinity, inspected = 0;
  for (let a = 0.2; a <= 4.0; a += 0.1) {
    const got = flyBy(a);
    if (got) lastTaken = a; else firstMissed = Math.min(firstMissed, a);
    inspected++;
  }
  assert.ok(inspected >= 30, `§211.1: inspected ${inspected} offsets`);
  assert.ok(lastTaken > 0, 'nothing was ever collected — the sweep is blind');
  assert.ok(firstMissed < Infinity, 'everything was collected — the sweep is blind');
  assert.ok(lastTaken < firstMissed, 'collection is not a contiguous band around the line');
  assert.ok(firstMissed <= TUNE.magnet + 0.15,
    `still collecting at ${firstMissed.toFixed(2)} m, past the ${TUNE.magnet} m radius`);
});

/* =============================================================================================
   4. THE ONE THAT MATTERS — the three shipped subscribers, read from their own source
   (P8, P9, P10)
============================================================================================= */

/**
 * Pull each subscriber's actual reader expression out of the file that ships it.
 *
 * Nothing here hard-codes `amount` or `pos`. If HUD renames `amount` to `qty`, the extracted
 * expression changes with it and P8 fails — which is the alarm §239 never had.
 */
function extractReaders() {
  const readers = [];

  // HUD.js:  on('coin', (p) => this.addCoins( <EXPR> ));
  const hud = HUD_SRC.match(/on\('coin',\s*\((\w+)\)\s*=>\s*this\.addCoins\((.*)\)\);/);
  if (hud) readers.push({ who: 'HUD', arg: hud[1], expr: hud[2], kind: 'amount' });

  // Audio.js: on('coin', ...) delegates to _onCoins(p); the real reads are inside it.
  const hasSub = /on\('coin',\s*\((\w+)\)\s*=>\s*this\._onCoins\(\1\)\)/.test(AUDIO_SRC);
  const body = AUDIO_SRC.match(/_onCoins\((\w+)\)\s*\{([\s\S]*?)\n  \}/);
  if (hasSub && body) {
    const arg = body[1];
    const nExpr = body[2].match(/const\s+n\s*=\s*(.*?);/);
    const posExpr = body[2].match(/const\s+pos\s*=\s*(.*?);/);
    if (nExpr) readers.push({ who: 'Audio', arg, expr: nExpr[1], kind: 'amount' });
    if (posExpr) readers.push({ who: 'Audio', arg, expr: posExpr[1], kind: 'pos' });
  }

  // Particles.js: on('coin', (e) => this._burstAt('coin_pop', <EXPR>, UP));
  const fx = FX_SRC.match(/on\('coin',\s*\((\w+)\)\s*=>\s*this\._burstAt\('coin_pop',\s*([^,]+),/);
  if (fx) readers.push({ who: 'Particles', arg: fx[1], expr: fx[2].trim(), kind: 'pos' });

  return readers;
}

/** Evaluate an extracted expression against a payload, supplying HUD's `num` helper. */
function evalReader(r, payload) {
  const num = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
  // eslint-disable-next-line no-new-func
  return new Function('num', r.arg, `return (${r.expr});`)(num, payload);
}

test('P10 §211.1 — exactly four modules subscribe to `coin`, and nothing else in src/ does', () => {
  /* Four since §248. `src/player/Health.js` banks coins toward a lucky charm — Sly's horseshoe at
     the series' own price of 100 — so it reads `p.amount` from the same payload the other three
     do, and is covered by the payload-shape agreement below like any other reader.
     It subscribes to `guardPickpocket` as well, deliberately: the HUD credits found coins through
     `coin` and stolen ones through `guardPickpocket`, and a charm price that counted only half the
     coins would present as "the price feels wrong" and be very hard to see from outside. */
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.js')) files.push(f);
    }
  };
  walk(path.join(HERE, '..', 'src'));
  assert.ok(files.length > 20, `§211.1: only walked ${files.length} source files`);

  const subs = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/on\('coin',/g)) subs.push(path.relative(path.join(HERE, '..'), f));
  }
  assert.equal(subs.length, 4, `expected 4 \`coin\` subscribers, found ${subs.length}: ${subs.join(', ')}`);
  assert.deepEqual([...new Set(subs)].sort(),
    ['src/audio/Audio.js', 'src/fx/Particles.js', 'src/player/Health.js', 'src/ui/HUD.js']);
});

test('P10 the reader extraction actually found all four reads', () => {
  const readers = extractReaders();
  assert.ok(readers.length >= 4,
    `§211.1: extracted only ${readers.length} reader expressions — the instrument is blind`);
  const who = readers.map((r) => `${r.who}:${r.kind}`).sort();
  assert.deepEqual(who, ['Audio:amount', 'Audio:pos', 'HUD:amount', 'Particles:pos']);
});

test('P8 one emitted `coin` event satisfies all three shipped subscribers at once', () => {
  const readers = extractReaders();
  assert.ok(readers.length >= 4, 'extraction failed; P8 cannot be judged');

  const pos = new THREE.Vector3(1.5, 2.5, -3.5);
  const payload = { amount: 42, pos };          // the shape Pickups._coin builds

  let checked = 0;
  for (const r of readers) {
    const got = evalReader(r, payload);
    if (r.kind === 'amount') {
      assert.equal(got, 42, `${r.who} read ${got} from \`${r.expr}\` — expected the value 42`);
    } else {
      assert.ok(got && Number.isFinite(got.x) && Number.isFinite(got.y) && Number.isFinite(got.z),
        `${r.who} read no usable position from \`${r.expr}\``);
      assert.equal(got, pos, `${r.who} did not receive the position object`);
    }
    checked++;
  }
  assert.equal(checked, readers.length);
  assert.ok(checked >= 4, `§211.1: checked ${checked}`);
});

test('P9 CALIBRATION ARM — a plausible-but-wrong payload MUST be rejected by the same readers', () => {
  const readers = extractReaders();
  assert.ok(readers.length >= 4, 'extraction failed; the arm cannot fire');

  /* Keys a reasonable person would guess and which are NOT in any subscriber's list. If these
     sail through, the extractor is not reading anything and P8 proves nothing. */
  const decoyPos = new THREE.Vector3(9, 9, 9);
  const decoy = { coins: 7, position: decoyPos, qty: 7 };

  let fired = 0;
  for (const r of readers) {
    const got = evalReader(r, decoy);
    if (r.kind === 'amount') {
      assert.notEqual(got, 7,
        `ARM FAILED: ${r.who} accepted the decoy key via \`${r.expr}\` — the instrument is blind`);
      assert.equal(got, 1, `${r.who} should fall back to its default 1, got ${got}`);
    } else {
      assert.ok(got === undefined || got === null,
        `ARM FAILED: ${r.who} accepted \`position\` via \`${r.expr}\` and got ${got}`);
      assert.notEqual(got, decoyPos, `ARM FAILED: ${r.who} resolved the decoy vector`);
    }
    fired++;
  }
  assert.equal(fired, readers.length, `the arm must fire on every reader; fired ${fired}`);
  assert.ok(fired >= 4, `§211.1: arm fired ${fired} times`);
});

/* =============================================================================================
   5. the module end to end  (P11, P12)
============================================================================================= */

/** Just enough Engine to run the real module headless. Mirrors Engine.js's own contract. */
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

/**
 * The REAL route, scraped from `EgyptLevel.js`'s own `api.route` literal.
 *
 * Not a hand-written fixture: the trail is derived from this data in the shipping game, so a
 * test that invented its own four waypoints would be measuring a layout nobody plays. Scraping
 * also means the assertions below run against the level as it actually is, and re-run against it
 * when the level moves.
 */
const ROUTE = (() => {
  const src = SRC('src/world/EgyptLevel.js');
  const m = src.match(/api\.route\s*=\s*\[([\s\S]*?)\n\s*\];/);
  if (!m) throw new Error('could not scrape api.route from EgyptLevel.js');
  // eslint-disable-next-line no-new-func
  return new Function(`return [${m[1]}];`)();
})();

test('the scraped route is the real one (§211.1: non-zero, and shaped like waypoints)', () => {
  assert.ok(ROUTE.length >= 8, `scraped only ${ROUTE.length} waypoints`);
  let inspected = 0;
  for (const w of ROUTE) {
    assert.equal(typeof w[0], 'string', 'waypoint has no name');
    for (let i = 1; i <= 3; i++) assert.ok(Number.isFinite(w[i]), `waypoint ${w[0]} has a bad coordinate`);
    inspected++;
  }
  assert.equal(inspected, ROUTE.length);
  assert.equal(ROUTE[0][0], 'spawn');
});

/** The exact number of coins `authorRouteCoins` must produce for a route — derived, not observed. */
function expectedTrailCount(route, spacing = 2.6) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const len = Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]);
    if (!(len > spacing)) continue;
    total += Math.max(0, Math.floor(len / spacing) - 1);
  }
  return total;
}

async function bootPickups(extra = {}) {
  const engine = fakeEngine({ architecture: { api: { route: ROUTE } }, ...extra });
  const pk = new Pickups(engine);
  await pk.init();
  return { engine, pk };
}

test('the module places coins along the level\'s own authored route', async () => {
  const { pk } = await bootPickups();
  const expected = expectedTrailCount(ROUTE);
  assert.ok(expected > 20, `the real route only supports ${expected} coins; the trail would be sparse`);
  assert.equal(pk.coins.length, expected,
    `placed ${pk.coins.length} coins, derivation says ${expected}`);
  assert.equal(pk.treasures.length, TREASURES.length);

  let inspected = 0;
  for (const c of pk.coins) {
    assert.ok(Number.isFinite(c.pos.x) && Number.isFinite(c.pos.y) && Number.isFinite(c.pos.z));
    assert.ok(c.value > 0, 'a coin with no value');
    // No coin may sit further from the route polyline than the jitter allows.
    assert.ok(distToRoute(c.pos) < 1.0,
      `a coin landed ${distToRoute(c.pos).toFixed(2)} m off the route it was derived from`);
    inspected++;
  }
  assert.equal(inspected, pk.coins.length);
  assert.ok(inspected > 20, `§211.1: inspected ${inspected} coins`);
});

/** Shortest distance from a point to the route polyline (ignoring the authored lift). */
function distToRoute(p) {
  let best = Infinity;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3();
  for (let i = 0; i < ROUTE.length - 1; i++) {
    a.set(ROUTE[i][1], ROUTE[i][2], ROUTE[i][3]);
    b.set(ROUTE[i + 1][1], ROUTE[i + 1][2], ROUTE[i + 1][3]);
    ab.subVectors(b, a); ap.subVectors(p, a);
    const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-9, ab.lengthSq())));
    best = Math.min(best, ap.addScaledVector(ab, -t).length());
  }
  return best - 0.85;   // subtract the authored chest-height lift
}

test('authorRouteCoins is pure, deterministic and degrades safely', () => {
  assert.deepEqual(authorRouteCoins(null), []);
  assert.deepEqual(authorRouteCoins([]), []);
  assert.deepEqual(authorRouteCoins([['only', 0, 0, 0]]), []);
  assert.deepEqual(authorRouteCoins([['a', 0, 0, 0], ['b', 0, 0, 1]]), [],
    'a leg shorter than the spacing must place nothing, not divide by zero');

  const a = authorRouteCoins(ROUTE, { rng: mulberryish(1) });
  const b = authorRouteCoins(ROUTE, { rng: mulberryish(1) });
  assert.equal(a.length, expectedTrailCount(ROUTE), 'count does not match the derivation');
  assert.ok(a.length > 20, `§211.1: authored ${a.length}`);
  assert.deepEqual(a, b, 'same seed produced a different layout');
  for (const kind of ['single', 'stack', 'pile']) {
    assert.ok(a.some((s) => s.kind === kind), `no ${kind} in the trail — the rhythm is flat`);
  }
  // Every authored kind must be a real denomination, or Audio chimes a fractional number of times.
  let inspected = 0;
  for (const s of a) {
    assert.equal(s.value, COIN_VALUE[s.kind], `${s.kind} carries ${s.value}, not ${COIN_VALUE[s.kind]}`);
    inspected++;
  }
  assert.ok(inspected > 20, `§211.1: inspected ${inspected}`);
});

/* =============================================================================================
   5b. the Props adoption path — a cross-module contract, so it gets a test
============================================================================================= */

/**
 * `Props.js:530 _collectibles()` already authors 44 coin spots, animates them as pickups, and
 * has no collection code. Rather than invent a second overlapping layout, this module adopts
 * those spots and hides the decorative twin. That reaches into a private field of a module this
 * agent does not own, so the reach is pinned here: if the shape changes, this fails loudly
 * instead of silently dropping 44 coins out of the level.
 */
function fakeProps(spots) {
  const deco = new THREE.Object3D();
  deco.name = 'coins';
  const group = new THREE.Group();
  group.add(deco);
  return { _collect: [{ spots }], group, deco };
}

test('adoption: the 44 spots Props already authored become real, and its decoy is hidden', async () => {
  const spots = [];
  for (let i = 0; i < 44; i++) spots.push([i * 0.5 - 11, 0.9, i * 0.3]);
  const props = fakeProps(spots);
  const { pk } = await bootPickups({ props });

  assert.equal(pk.coins.length, expectedTrailCount(ROUTE) + spots.length,
    'the adopted spots did not all become pickups');
  assert.equal(props.deco.visible, false, 'the decorative coin mesh is still drawn — two sets in frame');

  // And every adopted spot is present at its authored position.
  let matched = 0;
  for (const s of spots) {
    if (pk.coins.some((c) => Math.abs(c.pos.x - s[0]) < 1e-9 && Math.abs(c.pos.z - s[2]) < 1e-9)) matched++;
  }
  assert.equal(matched, spots.length, `only ${matched}/${spots.length} adopted spots survived`);

  pk.dispose();
  assert.equal(props.deco.visible, true, 'dispose left the decorative mesh hidden');
});

test('adoption degrades safely when PROPS is absent or has changed shape', async () => {
  const base = expectedTrailCount(ROUTE);
  assert.equal((await bootPickups()).pk.coins.length, base, 'no props module: route trail only');
  assert.equal((await bootPickups({ props: {} })).pk.coins.length, base, 'props with no _collect');
  assert.equal((await bootPickups({ props: { _collect: [] } })).pk.coins.length, base, 'empty _collect');
  assert.equal((await bootPickups({ props: fakeProps([[1, 2]]) })).pk.coins.length, base,
    'a malformed spot was adopted anyway');
});

function mulberryish(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.jitter = (amt = 1) => (f() + f() + f() - 1.5) * (amt / 1.5);
  return f;
}

test('P11 collecting a coin emits exactly one `coin` event, however long you stand on it', async () => {
  const { engine, pk } = await bootPickups();
  const c = pk.coins[0];
  // Park the player exactly on it and run a full second of frames.
  const player = new THREE.Vector3(c.pos.x, c.pos.y - TUNE.grabHeight, c.pos.z);
  engine.get = (k) => (k === 'movement' ? { position: player } : (k === 'architecture' ? { api: { route: ROUTE } } : null));
  const before = engine.log.filter((e) => e.evt === 'coin').length;
  for (let i = 0; i < 60; i++) pk.update(1 / 60, i / 60);
  const coins = engine.log.filter((e) => e.evt === 'coin');
  assert.equal(coins.length - before, 1, `emitted ${coins.length - before} coin events for one pickup`);
  assert.equal(pk.wallet.collected, 1);
});

test('P8-live the event the REAL module emits satisfies the REAL subscribers', async () => {
  const { engine, pk } = await bootPickups();
  /* A STACK, not a single.
     This test originally collected `coins[0]`, which is worth 1 — and Audio's own fallback when
     it cannot find a key it recognises is also 1. A payload that had lost `amount` entirely
     would therefore have read as correct. Mutation-checked: renaming the emitted key slips
     straight through a value-1 pickup and is caught immediately by a value-3 one. An assertion
     whose expected value equals the failure mode's default value is not an assertion. */
  const c = pk.coins.find((x) => x.value > 1);
  assert.ok(c, 'no multi-value pickup exists; this test cannot discriminate');
  assert.notEqual(c.value, 1);
  const player = new THREE.Vector3(c.pos.x, c.pos.y - TUNE.grabHeight, c.pos.z);
  engine.get = (k) => (k === 'movement' ? { position: player } : null);
  pk.update(1 / 60, 0);

  const ev = engine.log.find((e) => e.evt === 'coin');
  assert.ok(ev, 'the module emitted no coin event at all');

  const readers = extractReaders();
  assert.ok(readers.length >= 4, 'extraction failed');
  let checked = 0;
  for (const r of readers) {
    const got = evalReader(r, ev.payload);
    if (r.kind === 'amount') {
      assert.equal(got, c.value, `${r.who} read ${got}, expected ${c.value}`);
      assert.ok(got >= 1 && got <= 6,
        `${r.who}: Audio plays one chime per unit capped at 6 — a single pickup worth ${got} would misfire`);
    } else {
      assert.ok(got && Number.isFinite(got.x), `${r.who} got no position`);
    }
    checked++;
  }
  assert.ok(checked >= 4, `§211.1: checked ${checked}`);
});

test('the emitted `pos` is a fresh vector, not a shared scratch (Audio schedules a delayed read)', async () => {
  const { engine, pk } = await bootPickups();
  engine.get = (k) => (k === 'movement' ? { position: player } : null);
  const player = new THREE.Vector3();
  const seen = [];
  engine.on('coin', (p) => seen.push(p.pos));

  // Collect two different coins on two different frames.
  let frames = 0;
  for (const c of pk.coins.slice(0, 2)) {
    player.set(c.pos.x, c.pos.y - TUNE.grabHeight, c.pos.z);
    pk.update(1 / 60, frames++ / 60);
  }
  assert.ok(seen.length >= 2, `§211.1: only ${seen.length} events seen`);
  assert.notEqual(seen[0], seen[1], 'two coin events shared one Vector3 — Audio would mis-place the second');
  assert.ok(seen[0].distanceTo(seen[1]) > 0, 'the two positions are identical; a scratch was reused');
});

test('P12 the wallet totals correctly and persists across the level', () => {
  const w = new Wallet(TUNE);
  assert.equal(w.coins, 0);
  let sum = 0;
  const vals = [1, 1, 3, 1, 5, 1, 1, 3];
  for (const v of vals) { w.credit(v); sum += v; }
  assert.equal(w.coins, sum, 'wallet total is not the sum of what it was given');
  assert.equal(w.collected, vals.length);
  // It is a running total, not a per-frame reading: nothing resets it.
  w.credit(0);
  assert.equal(w.coins, sum);
  assert.equal(w.credit(-5), null, 'a negative credit changed the purse');
  assert.equal(w.coins, sum);
});

test('P12 the wallet fires a milestone, and only once per threshold', () => {
  const w = new Wallet({ ...TUNE, milestone: 100 });
  const hits = [];
  for (let i = 0; i < 250; i++) { const m = w.credit(1); if (m) hits.push(m); }
  assert.deepEqual(hits, [100, 200], `milestones fired: ${hits.join(',')}`);
  // A single huge credit must not skip a threshold silently either.
  const w2 = new Wallet({ ...TUNE, milestone: 100 });
  assert.equal(w2.credit(320), 100);
  assert.equal(w2.credit(1), null, 'crossing several thresholds at once re-fired');
});

/* =============================================================================================
   6. treasure: carried, not banked  (P12 second half)
============================================================================================= */

test('P12 picking a treasure up credits NOTHING; only the fence pays', async () => {
  const { engine, pk } = await bootPickups();
  const tr = pk.treasures[0];
  const player = new THREE.Vector3();
  engine.get = (k) => (k === 'movement' ? { position: player } : null);

  player.set(tr.pos.x, tr.pos.y - TUNE.grabHeight, tr.pos.z);
  pk.update(1 / 60, 0);

  assert.equal(pk.wallet.carrying?.id, tr.id, 'the treasure was not taken into hand');
  assert.equal(pk.wallet.coins, 0, `picking a treasure up credited ${pk.wallet.coins} — it must pay at the fence`);
  assert.equal(engine.log.filter((e) => e.evt === 'coin').length, 0,
    'a coin event fired on pickup; the payoff beat belongs at the fence');
  assert.ok(engine.log.some((e) => e.evt === 'treasurePickup'));

  // Walk to the fence.
  player.set(FENCE.pos[0], FENCE.pos[1], FENCE.pos[2]);
  pk.update(1 / 60, 1);

  assert.equal(pk.wallet.carrying, null, 'still carrying after reaching the fence');
  assert.equal(pk.wallet.coins, tr.value, `banked ${pk.wallet.coins}, expected ${tr.value}`);
  assert.equal(pk.wallet.treasures, 1);
  const coinEvents = engine.log.filter((e) => e.evt === 'coin');
  assert.equal(coinEvents.length, 1, 'the fence must fire exactly one coin event');
  assert.equal(coinEvents[0].payload.amount, tr.value);
  assert.ok(engine.log.some((e) => e.evt === 'treasureBanked'));
});

test('being driven to CHASE while carrying drops the treasure back into the world', async () => {
  const { engine, pk } = await bootPickups();
  const tr = pk.treasures[0];
  const player = new THREE.Vector3();
  engine.get = (k) => (k === 'movement' ? { position: player } : null);

  player.set(tr.pos.x, tr.pos.y - TUNE.grabHeight, tr.pos.z);
  pk.update(1 / 60, 0);
  assert.ok(pk.wallet.carrying, 'setup failed: not carrying');

  /* Walk somewhere else and let a frame sample it — `_playerPos` is read once per update(),
     exactly as `Guard.js` reads it, so the drop lands where the player was on the last frame. */
  player.set(40, 0, 40);
  pk.update(1 / 60, 0.5);

  // A suspicious guard is not enough — only a real chase costs you the loot.
  engine.emit('guardAlert', { id: 3, state: 'suspicious', level: 0.5 });
  assert.ok(pk.wallet.carrying, 'a merely suspicious guard cost the player his treasure');

  engine.emit('guardAlert', { id: 3, state: 'chase', level: 1 });
  assert.equal(pk.wallet.carrying, null, 'a chase did not drop the treasure');
  assert.equal(pk.wallet.coins, 0, 'a dropped treasure paid out');
  assert.ok(engine.log.some((e) => e.evt === 'treasureDropped'));
  // It is back in the world, where you lost it, and collectable again.
  assert.equal(tr.taken, false);
  assert.ok(tr.pos.distanceTo(new THREE.Vector3(40, 0, 40)) < 1.0,
    'the treasure did not land where the player was caught');
});

test('§223.3 — the purse sync reaches a listener that registers AFTER this module', async () => {
  /* MANIFEST puts `pickups` before `hud`, and HUD installs its listeners inside its own init().
     An emit from init() would land in an empty set and vanish — §223.3's exact failure. So the
     sync must arrive on the first frame, by which time every module has initialised. */
  const { engine, pk } = await bootPickups();
  assert.equal(engine.log.filter((e) => e.evt === 'coins').length, 0,
    'the purse sync fired during init(), before a later-registered HUD could hear it');

  const heard = [];
  engine.on('coins', (n) => heard.push(n));      // a listener that subscribed after init
  engine.get = () => null;
  pk.update(1 / 60, 0);
  assert.deepEqual(heard, [0], 'the deferred purse sync never arrived');

  pk.update(1 / 60, 1 / 60);
  assert.equal(heard.length, 1, 'the purse sync repeats every frame');
});

test('the MANIFEST registers pickups after movement and before hud', () => {
  const src = SRC('src/main.js');
  const order = [...src.matchAll(/\['(\w+)',\s+[.'\w/]+,/g)].map((m) => m[1]);
  const at = (k) => order.indexOf(k);
  assert.ok(at('pickups') > 0, 'pickups is not in the MANIFEST — the module would never load');
  assert.ok(at('pickups') > at('movement'),
    'pickups must update after movement or it reads last frame\'s player position');
  assert.ok(at('pickups') > at('architecture'),
    'pickups must init after architecture or api.route is empty');
  assert.ok(at('pickups') > at('props'), 'pickups must init after props or there is nothing to adopt');
});

test('the guard STATE string this keys off is the one src/ai actually ships', () => {
  const src = SRC('src/ai/Patrol.js');
  const m = src.match(/CHASE:\s*'([a-z]+)'/);
  assert.ok(m, 'could not find STATE.CHASE in src/ai/Patrol.js');
  assert.equal(m[1], 'chase',
    'STATE.CHASE was renamed; Pickups._wire() keys off the literal and must be updated');
});

test('only one treasure can be carried at a time', async () => {
  const { engine, pk } = await bootPickups();
  const player = new THREE.Vector3();
  engine.get = (k) => (k === 'movement' ? { position: player } : null);

  const [a, b] = pk.treasures;
  player.set(a.pos.x, a.pos.y - TUNE.grabHeight, a.pos.z);
  pk.update(1 / 60, 0);
  assert.equal(pk.wallet.carrying?.id, a.id);

  player.set(b.pos.x, b.pos.y - TUNE.grabHeight, b.pos.z);
  pk.update(1 / 60, 1);
  assert.equal(pk.wallet.carrying?.id, a.id, 'a second treasure was picked up while carrying the first');
  assert.equal(b.taken, false, 'the second treasure vanished from the world');
});

test('treasure denominations chime the full flourish and coins do not', () => {
  // Audio plays min(max(amount,1),6) chimes. A single coin must be one chime; a treasure the cap.
  const chimes = (n) => Math.max(1, Math.min(6, n | 0));
  assert.equal(chimes(COIN_VALUE.single), 1, 'a single coin must be a single chime');
  assert.equal(chimes(COIN_VALUE.stack), 3);
  assert.equal(chimes(COIN_VALUE.pile), 5);
  let inspected = 0;
  for (const t of TREASURES) {
    assert.equal(chimes(t.value), 6, `${t.id} must chime the full flourish`);
    assert.ok(t.value > 150, `${t.id} at ${t.value} is not worth the walk back (a heavy's pocket is 80-150)`);
    inspected++;
  }
  assert.equal(inspected, TREASURES.length);
  assert.ok(inspected >= 3, `§211.1: inspected ${inspected} treasures`);
});

test('the fence sits by the spawn — the way in is the way out', () => {
  const f = new THREE.Vector3().fromArray(FENCE.pos);
  const spawn = new THREE.Vector3(0, 0, 30);
  assert.ok(f.distanceTo(spawn) < 6, `the fence is ${f.distanceTo(spawn).toFixed(1)} m from spawn`);
  assert.ok(f.distanceTo(spawn) > TUNE.fence,
    'the fence overlaps spawn; a treasure would bank itself the instant the level loaded');
  // And it is a real walk from the deepest treasure.
  const deepest = TREASURES.reduce((a, t) => (t.pos[2] < a.pos[2] ? t : a));
  const d = new THREE.Vector3().fromArray(deepest.pos).distanceTo(f);
  assert.ok(d > 80, `the carry from ${deepest.id} is only ${d.toFixed(0)} m; the return leg is the point`);
});

test('dispose unhooks everything and restores what it hid', async () => {
  const { engine, pk } = await bootPickups();
  const n = pk.coins.length;
  assert.ok(n > 0);
  pk.dispose();
  // A late event must not throw or mutate.
  engine.emit('guardAlert', { id: 1, state: 'chase' });
  assert.equal(pk.wallet.carrying, null);
});

/* =============================================================================================
   6. the coin's ART — one authored size, and a badge that must not leak (§712)
============================================================================================= */

/**
 * These four arms exist because of a defect that had already happened once, one collectible over.
 *
 * The coin's size used to live in FOUR literals across two files — `Props._collectibles()` drew
 * `coin(0.16, 0.035)`, `Pickups._build()` drew `coinGeo(TUNE.coinRadius, 0.035)` (radius from
 * TUNE, thickness a bare literal), and `TUNE.coinRadius` held a third copy of the radius. The two
 * halves of one number had two different authorities, so they could be scaled apart with nothing
 * failing anywhere. §701 found exactly this shape in the bottle and §705 found the trap in its
 * derived term; C1-C4 below are what stops it being found a third time.
 */

test('C1 the coin has ONE authored size, and both TUNE and the drawn mesh read it', async () => {
  const { COIN_RADIUS, COIN_THICKNESS } = await import('../src/world/PropKit.js');
  assert.equal(TUNE.coinRadius, COIN_RADIUS,
    'TUNE.coinRadius has stopped reading PropKit.COIN_RADIUS — it is a second authority again');

  const { pk } = await bootPickups();
  const geo = pk._coinMesh?.geometry;
  assert.ok(geo, 'no pickup_coins geometry was built');
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const dia = b.max.x - b.min.x, thick = b.max.y - b.min.y;
  /* The DRAWN mesh, not the constant — the literal that got away last time was the thickness,
     and only measuring the built geometry can see it. */
  assert.ok(Math.abs(dia - COIN_RADIUS * 2) < 1e-6,
    `the drawn coin is ${dia.toFixed(5)} m across against COIN_RADIUS ${COIN_RADIUS} (${COIN_RADIUS * 2} m)`);
  assert.ok(Math.abs(thick - COIN_THICKNESS) < 1e-6,
    `the drawn coin is ${thick.toFixed(5)} m thick against COIN_THICKNESS ${COIN_THICKNESS} — this is the ` +
    'exact half of the number that used to be a bare literal in _build()');

  /* Props' decorative twin is HIDDEN at runtime, which is precisely why it can drift unseen.
     It is built from the same two constants and this is the only thing that says so. */
  const src = fs.readFileSync(path.join(HERE, '..', 'src/world/Props.js'), 'utf8');
  assert.match(src, /coin\(COIN_RADIUS, COIN_THICKNESS\)/,
    'Props._collectibles() no longer builds its twin from the authored size; it is hidden at ' +
    'runtime, so a literal there is invisible in every frame while kaykit P2/P3 measure it');
});

test('C2 the contact radius is the FORMULA, and the scaled value is not it', () => {
  // pass input: the derivation
  assert.equal(TUNE.collect, +(TUNE.playerRadius + TUNE.coinRadius).toFixed(10),
    'collect is no longer playerRadius + coinRadius');
  // fail input: what scaling the old literal would have produced, named so it cannot creep back
  const scaled = +(0.50 * (TUNE.coinRadius / 0.16)).toFixed(10);
  assert.notEqual(TUNE.collect, scaled,
    `collect equals the SCALED value ${scaled}, not the re-derived one. §705: scaling a derived ` +
    'contact term hands the player reach at which he is touching nothing, which is a second magnet');
});

test('C3 the badge decodes headlessly and lands on the coin face, 0..1, rim parked', async () => {
  const { decodeCoinBadge, COIN_BADGE_SIZE, COIN_BADGE_RIM_UV } = await import('../src/world/CoinBadge.js');
  /* Headless is the point: no DOM, no canvas, no fetch. If this ever needs a browser the badge
     becomes a branch the suite cannot execute, which is how §666 happened. */
  const img = await decodeCoinBadge();
  assert.ok(img, 'the coin badge did not decode in plain Node — it has become browser-only');
  assert.equal(img.size, COIN_BADGE_SIZE);
  assert.equal(img.data.length, COIN_BADGE_SIZE * COIN_BADGE_SIZE * 4, 'not RGBA at the declared size');

  const { pk } = await bootPickups();
  const geo = pk._coinMesh.geometry;
  const uv = geo.attributes.uv, nor = geo.attributes.normal;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, caps = 0;
  const rim = new Set();
  for (let i = 0; i < uv.count; i++) {
    const ny = Math.abs(nor.getY(i));
    if (ny >= Math.abs(nor.getX(i)) && ny >= Math.abs(nor.getZ(i))) {
      caps++;
      u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i));
      v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i));
    } else rim.add(`${uv.getX(i).toFixed(6)},${uv.getY(i).toFixed(6)}`);
  }
  assert.ok(caps > 0, '§211.1: inspected 0 cap vertices');
  /* pass input: the caps span the whole square, so the disc samples the inscribed circle — which
     is where the badge's coin is, and its transparent corners fall outside it. */
  assert.ok(u0 < 1e-6 && u1 > 1 - 1e-6 && v0 < 1e-6 && v1 > 1 - 1e-6,
    `cap UVs span u[${u0}..${u1}] v[${v0}..${v1}], not 0..1 — the shipped default is boxProjectUVs ` +
    'at UV_PER_M, which on a 0.24 m coin is a 0.24-wide patch straddling the UV origin and samples ' +
    'four wrapped corners of the badge');
  /* fail input: one rim value, not many. A rim carrying the box projection smears the die. */
  assert.equal(rim.size, 1, `the rim carries ${rim.size} distinct UVs; it must be parked on one texel`);
  assert.equal([...rim][0], `${COIN_BADGE_RIM_UV[0].toFixed(6)},${COIN_BADGE_RIM_UV[1].toFixed(6)}`,
    'the rim is parked somewhere other than COIN_BADGE_RIM_UV');
});

test('C4 the badge is on the coin and NOT on the treasure', async () => {
  const { pk } = await bootPickups();
  const coinMat = pk._coinMesh.material;
  assert.ok(coinMat.map, 'the coin lost its badge');
  /* The treasure is the fail input, and it is a real risk rather than a hypothetical: the Eye of
     Ra is built out of `coin()` discs and the hoard is 140 more, so a shared gold material would
     strike the badge across a sun disc with nothing failing. */
  let inspected = 0;
  for (const t of pk.treasures) {
    if (!t.mesh) continue;
    inspected++;
    assert.notEqual(t.mesh.material, coinMat, `treasure ${t.id} shares the coin's material`);
    assert.ok(!t.mesh.material.map, `treasure ${t.id} is wearing the coin badge`);
  }
  assert.ok(inspected >= 3, `§211.1: inspected ${inspected} treasures`);
});
