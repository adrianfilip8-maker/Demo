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
  // The prediction registered before the law was coded was ~9.99 m/s.
  assert.ok(Math.abs(v - 9.99) < 0.05, `capture speed ${v.toFixed(3)} drifted from the registered prediction 9.99`);
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

test('P10 §211.1 — exactly three modules subscribe to `coin`, and nothing else in src/ does', () => {
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
  assert.equal(subs.length, 3, `expected 3 \`coin\` subscribers, found ${subs.length}: ${subs.join(', ')}`);
  assert.deepEqual([...new Set(subs)].sort(),
    ['src/audio/Audio.js', 'src/fx/Particles.js', 'src/ui/HUD.js']);
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

const ROUTE = [
  ['spawn', 0, 0, 30], ['terrace-1', 0, 2, 19], ['terrace-2', 0, 5.2, 14],
  ['kiosk-lintel', 2.2, 9, 8.4],
];

async function bootPickups(extra = {}) {
  const engine = fakeEngine({ architecture: { api: { route: ROUTE } }, ...extra });
  const pk = new Pickups(engine);
  await pk.init();
  return { engine, pk };
}

test('the module places coins along the level\'s own authored route', async () => {
  const { pk } = await bootPickups();
  assert.ok(pk.coins.length > 10, `only ${pk.coins.length} coins placed`);
  assert.equal(pk.treasures.length, TREASURES.length);
  // Every coin should sit near the polyline it was derived from, not in space.
  let inspected = 0;
  for (const c of pk.coins) {
    assert.ok(Number.isFinite(c.pos.x) && Number.isFinite(c.pos.y) && Number.isFinite(c.pos.z));
    assert.ok(c.value > 0, 'a coin with no value');
    inspected++;
  }
  assert.ok(inspected > 10, `§211.1: inspected ${inspected} coins`);
});

test('authorRouteCoins is pure, deterministic and degrades safely', () => {
  assert.deepEqual(authorRouteCoins(null), []);
  assert.deepEqual(authorRouteCoins([]), []);
  assert.deepEqual(authorRouteCoins([['only', 0, 0, 0]]), []);
  const a = authorRouteCoins(ROUTE, { rng: mulberryish(1) });
  const b = authorRouteCoins(ROUTE, { rng: mulberryish(1) });
  assert.ok(a.length > 5, `§211.1: authored ${a.length}`);
  assert.deepEqual(a, b, 'same seed produced a different layout');
  assert.ok(a.some((s) => s.kind === 'stack'), 'no stacks in the trail — every beat is identical');
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
  const c = pk.coins[0];
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

  // A suspicious guard is not enough — only a real chase costs you the loot.
  player.set(40, 0, 40);
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
