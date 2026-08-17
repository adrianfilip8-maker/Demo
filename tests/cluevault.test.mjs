import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import { TUNE, TREASURES, Pickups } from '../src/world/Pickups.js';

/**
 * The clue bottles, end to end — and the vault they were always supposed to open.
 *
 * ── What this file guards, and why it is a separate file ───────────────────────────────────
 * `tests/pickups.test.mjs` guards the COIN loop: the magnet law, the payload shape, the wallet.
 * It says nothing about clue bottles, which shipped with geometry, placement, a collect loop, a
 * publisher, a sound and a tested cue — and no consumer of the SET. Every bottle emitted
 * `{ found, total }` into a subscriber that reads neither field, so collecting all twelve was
 * indistinguishable from collecting one twelve times.
 *
 * That is §357.1's shape one notch further along than §239's: not "an event with no publisher"
 * but **an event whose payload carries a fact nobody reads**. A census that only counts
 * publishers and subscribers cannot see it — `clue` has both — which is why the bar this file
 * exists for is V3: *does anything in the game change on the twelfth bottle?*
 *
 * ── §418.3 ─────────────────────────────────────────────────────────────────────────────────
 * Every arm below carries a `DOMAIN (§418.3)` block naming one input it has been SEEN to pass
 * on and one it has been SEEN to fail on. Where a bar cannot fail in this level it says so and
 * is labelled a tripwire (§418.5) rather than counted as evidence.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');

const PROPS_SRC = SRC('src/world/Props.js');
const PICKUPS_SRC = SRC('src/world/Pickups.js');
const AUDIO_SRC = SRC('src/audio/Audio.js');
const HUD_SRC = SRC('src/ui/HUD.js');
const EVENTBUS_SRC = SRC('tests/eventbus.test.mjs');

/* Strip comments before scraping. `tests/eventbus.test.mjs` records the failure this prevents:
   three separate COMMENTS mentioning `emit('clue')` each registered as a publisher, and a
   comment could keep a dead event looking alive indefinitely. Same conservative rule as there. */
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * The twelve clue-bottle spots, scraped from `Props._clueBottles()`'s own literal.
 *
 * Scraped rather than copied for the reason `tests/pickups.test.mjs` scrapes the route: a
 * hand-copied fixture measures a layout nobody plays the moment PROPS moves one. If the scrape
 * finds nothing the arms below fail loudly instead of asserting over an empty array (§211.1).
 */
const CLUE_SPOTS = (() => {
  const body = /_clueBottles\(\)\s*\{[\s\S]*?const spots = \[([\s\S]*?)\n\s*\];/.exec(PROPS_SRC);
  if (!body) return [];
  const out = [];
  const re = /\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
  let m;
  while ((m = re.exec(body[1]))) out.push([+m[1], +m[2], +m[3]]);
  return out;
})();

/* ============================================================================================
   0. the scrape is real  (§211.1 — a census over an empty set proves nothing)
============================================================================================ */

test('the clue-bottle spots scraped from PROPS are a real, well-formed set', () => {
  /* DOMAIN (§418.3)
     PASSES ON: the shipped `Props._clueBottles()` — 12 finite triples.
     FAILS ON:  seen — pointing the same regex at `src/world/Pickups.js`, which has no
                `_clueBottles()` at all, yields [] and trips the `>= 8` bar.  */
  assert.ok(CLUE_SPOTS.length >= 8,
    `scraped ${CLUE_SPOTS.length} clue spots from Props._clueBottles(); the scrape has broken ` +
    'or the bottles have been removed');
  let inspected = 0;
  for (const s of CLUE_SPOTS) {
    assert.equal(s.length, 3);
    for (const v of s) assert.ok(Number.isFinite(v), `a clue spot has a non-finite coordinate: ${s}`);
    inspected++;
  }
  assert.equal(inspected, CLUE_SPOTS.length);
});

test('no two bottles can be taken from one standing spot — each costs its own traversal', () => {
  /**
   * The design claim `Props._clueBottles()` makes is "one per vertical beat of the authored
   * route ... scattering them would make them coins". That claim is measurable: two bottles
   * inside one magnet diameter are collected by standing still, which is what a coin is.
   *
   * The bound is `2 * TUNE.magnet` = 4.80 m, derived, not chosen — one magnet radius to reach
   * each of them from a point between the two.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the shipped twelve — closest pair measured at **8.38 m**, spots 9 and 10, the
   *            inner pylon south stage to the pylon summit deck, 1.75x the bound. (Measured, not
   *            guessed: the first draft of this block named a different pair.)
   * FAILS ON:  seen — the same twelve with spot 1 moved from (5.4, 6.20, 9.0) to
   *            (-2.0, 9.50, 7.5), half a metre under the obelisk kiosk lintel at spot 2:
   *            **0.50 m**, and the arm reports that pair. Both halves are exercised below, so
   *            the bar is known to discriminate.
   */
  const bound = 2 * TUNE.magnet;

  const closestPair = (spots) => {
    let best = Infinity, at = null;
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const d = Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1], spots[i][2] - spots[j][2]);
        if (d < best) { best = d; at = [i, j]; }
      }
    }
    return { best, at };
  };

  const real = closestPair(CLUE_SPOTS);
  assert.ok(real.best > bound,
    `bottles ${real.at?.[0]} and ${real.at?.[1]} are ${real.best.toFixed(2)} m apart — inside ` +
    `one magnet diameter (${bound} m), so both are taken from one standing spot`);

  /* The failing half of the domain, run rather than asserted (§418.4: a rule against a defect
     class is not a defence against writing one — only running is). */
  const stacked = CLUE_SPOTS.map((s, i) => (i === 1 ? [-2.0, 9.50, 7.5] : s));
  assert.ok(closestPair(stacked).best < bound,
    'the counterexample this bar was calibrated against no longer fails it — the bar has ' +
    'stopped discriminating and the DOMAIN block above is stale');
});

/* ============================================================================================
   1. the chain — every seam of it, scraped from the files that ship
============================================================================================ */

test('V1 the clue chain has all four seams: geometry, placement, publisher, subscriber', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the tree as it ships — `clueBottle` exported and imported, `kind: 'clue'` placed,
   *            `emit('clue'` in Pickups, `on('clue'` in Audio.
   * FAILS ON:  seen — each of the four run against a copy of its own source with that one token
   *            deleted; all four go red, and the fourth (`on('clue'`) is the seam that was
   *            already whole while the third was missing, which is how this feature shipped
   *            three-quarters connected in the first place.
   */
  const P = stripComments(PICKUPS_SRC);
  const A = stripComments(AUDIO_SRC);
  const PR = stripComments(PROPS_SRC);

  const seams = {
    geometry: /export function clueBottle\(/.test(stripComments(SRC('src/world/PropKit.js'))),
    placement: /kind:\s*'clue'/.test(PR),
    publisher: /_emit\('clue'|emit\('clue'/.test(P),
    subscriber: /on\('clue'/.test(A),
  };
  for (const [name, ok] of Object.entries(seams)) {
    assert.ok(ok, `the clue chain's ${name} seam is gone — the feature is back to partly wired`);
  }
  assert.equal(Object.keys(seams).length, 4);
});

test('V2 the SET is consumed, not just each bottle — `total` reaches something', () => {
  /**
   * The bar that this whole file exists for, stated as the thing that was false.
   *
   * `clue`'s payload has carried `found` and `total` since the publisher landed and its only
   * subscriber is `Audio.js:1377`, which reads `p?.pos` and nothing else. A publisher/subscriber
   * census cannot see that: `clue` has both ends. So this asserts against the CONSUMER instead —
   * `Pickups.clueComplete()` must exist and something must call it.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the tree as it ships — `clueComplete()` defined and called from `_collectClue`.
   * FAILS ON:  seen — the same two regexes against the revision immediately before this one
   *            (`git show <the commit that added the vault>^:src/world/Pickups.js`), where
   *            neither token exists. **That revision passes V1 in full** — publisher and
   *            subscriber both present — which is exactly the point: V1 was green for the whole
   *            time the set was unconsumed, and is why V2 had to be written as a separate bar.
   */
  const P = stripComments(PICKUPS_SRC);
  assert.ok(/clueComplete\(\)\s*\{/.test(P), 'nothing computes whether the clue set is finished');
  assert.ok(/if \(this\.clueComplete\(\)\)/.test(P),
    'clueComplete() is defined and never consulted — the set is still counted and not read');
});

/* ============================================================================================
   2. the vault  (V3 — the load-bearing arm)
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

/**
 * A PROPS stand-in carrying exactly the `_collect` shape `Pickups._author` adopts from.
 *
 * The empty `coin` entry is load-bearing and was found the hard way. `_author`'s `entryOf` falls
 * back to `_collect[0]` when it cannot find a `coin` kind — a compatibility shim for an older
 * PROPS — so a fake carrying ONLY clue spots hands the twelve bottle positions to the coin loop
 * as well, and every bottle collected also pays a coin. Real PROPS pushes coins first and
 * bottles second; the fake mirrors that, and the arms below measure the loop that ships rather
 * than an artefact of the stand-in.
 */
function fakeProps(clueSpots) {
  const deco = new THREE.Object3D();
  deco.name = 'clue_bottles';
  const group = new THREE.Group();
  group.add(deco);
  return {
    group,
    deco,
    _collect: [{ kind: 'coin', spots: [] }, { kind: 'clue', spots: clueSpots }],
  };
}

async function boot(clueSpots = CLUE_SPOTS) {
  const engine = fakeEngine({ props: fakeProps(clueSpots) });
  const pk = new Pickups(engine);
  await pk.init();
  return { engine, pk };
}

/** Stand the player where a pickup can be taken and run one frame. */
function takeAt(pk, engine, target) {
  const player = new THREE.Vector3(target.x, target.y - TUNE.grabHeight, target.z);
  const mods = { movement: { position: player } };
  const prev = engine.get;
  engine.get = (k) => (k in mods ? mods[k] : prev.call(engine, k));
  pk.update(1 / 60, 0);
  engine.get = prev;
}

test('V3 the vault stays shut on eleven bottles and opens on the twelfth', async () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: 12 of 12 collected — `vaultOpen` true, the Eye's `locked` cleared, one
   *            `objective` event on the bus.
   * FAILS ON:  seen — 11 of 12, run in the same arm below: `vaultOpen` false, `locked` still
   *            `'clues'`, zero `objective` events. Both sides are exercised here, in this order,
   *            against the same module instance, so the bar is known to discriminate on the one
   *            input that matters — the last bottle.
   */
  const { engine, pk } = await boot();
  const total = pk.clues.length;
  assert.ok(total >= 8, `§211.1: only ${total} bottles adopted; the arm would prove nothing`);

  const eye = pk.treasures.find((t) => t.id === 'eye');
  assert.ok(eye, 'the Eye of Ra is not in TREASURES');

  /* --- the failing side: one short --- */
  for (let i = 0; i < total - 1; i++) takeAt(pk, engine, pk.clues[i].pos);
  assert.equal(pk.clueCount, total - 1, 'the run did not collect what it meant to');
  assert.equal(pk.vaultOpen, false, `the vault opened on ${total - 1} of ${total} bottles`);
  assert.equal(eye.locked, 'clues', 'the Eye was unlocked before the set was finished');
  assert.equal(engine.log.filter((e) => e.evt === 'objective').length, 0,
    'the mission beat fired early');

  /* And with the set one short, walking onto the Eye must not take it. */
  takeAt(pk, engine, eye.pos);
  assert.equal(pk.wallet.carrying, null, 'a locked treasure was picked up');
  assert.equal(eye.taken, false);

  /* --- the passing side: the twelfth --- */
  takeAt(pk, engine, pk.clues[total - 1].pos);
  assert.equal(pk.clueCount, total);
  assert.equal(pk.vaultOpen, true, `the vault did not open on ${total} of ${total} bottles`);
  assert.equal(eye.locked, null, 'the vault opened and the Eye stayed locked');
  assert.equal(engine.log.filter((e) => e.evt === 'objective').length, 1,
    'the vault opened without publishing the mission beat, or published it twice');

  /* And now it can be taken. */
  takeAt(pk, engine, eye.pos);
  assert.equal(pk.wallet.carrying?.id, 'eye', 'the Eye is unlocked and still cannot be picked up');
});

test('V4 an empty bottle set does NOT open the vault (0 >= 0 is the trap)', async () => {
  /**
   * `found >= total` is TRUE at 0 and 0. With PROPS absent the clue array is empty and the
   * natural spelling springs the vault on the first frame of a level with no bottles in it.
   *
   * DOMAIN (§418.3)
   * PASSES ON: a boot with no PROPS at all — 0 bottles, vault shut, Eye locked.
   * FAILS ON:  seen — `clueComplete()` with the `total > 0` term removed returns true on that
   *            same boot. Re-run here as an explicit predicate so the guard cannot be deleted
   *            silently: the naive form is evaluated beside the real one and must disagree.
   */
  const engine = fakeEngine({});
  const pk = new Pickups(engine);
  await pk.init();

  assert.equal(pk.clues.length, 0, 'the no-PROPS boot adopted bottles from somewhere');
  assert.equal(pk.clueComplete(), false, 'an empty clue set reported itself complete');

  const naive = (pk.clueCount || 0) >= pk.clues.length;
  assert.equal(naive, true,
    'the naive predicate no longer returns true on an empty set, so this arm is no longer ' +
    'testing the trap it was written for');
  assert.notEqual(pk.clueComplete(), naive,
    'clueComplete() agrees with the naive predicate on an empty set — the `total > 0` guard ' +
    'has been removed and the vault will open in any level without bottles');

  pk.update(1 / 60, 0);
  assert.equal(pk.vaultOpen, false, 'the vault opened in a level containing no bottles');
});

test('V5 the vault beat fires exactly once, and the latch that stops it is doubled', async () => {
  /**
   * `bottle.gd` in the reference connects its collected signal INSIDE the body-entered handler
   * and never disconnects, so re-entering the trigger stacks duplicate connections and a bottle
   * can be counted twice. The adapted shape here is a latch. This arm is in two halves because
   * §418.3 says so and the two halves came out different kinds.
   *
   * ── Half A: 120 frames after completion produce one beat. **TRIPWIRE (§418.5).** ───────────
   * DOMAIN: PASSES ON the shipped tree. FAILS ON nothing reachable — and the honest reason is
   * structural, not a compliment to the latch. `_openVault` is called from ONE place,
   * `_collectClue`, which `update()` reaches only for a clue with `taken` false; `taken` latches
   * one frame earlier inside `stepPickup`. So after the last bottle there is no input in this
   * level that re-enters `_collectClue` at all, and the frame count cannot fail. Kept because a
   * future second call site — a debug unlock, a save restore — would give it one, which is
   * exactly what a tripwire is for. It is NOT evidence that the latch works.
   *
   * ── Half B: the guard is doubled, and this half DOES discriminate ──────────────────────────
   * DOMAIN: PASSES ON — `vaultOpen` forced back to false and `_openVault()` called directly
   * still publishes nothing, because the second guard (`!tr`) finds no treasure still carrying
   * `locked === 'clues'`. FAILS ON — seen — restoring `locked` as well, which publishes a second
   * beat. Running the second is what proves the first was suppressed by the guard rather than by
   * the test failing to call anything.
   */
  const { engine, pk } = await boot();
  const total = pk.clues.length;
  for (let i = 0; i < total; i++) takeAt(pk, engine, pk.clues[i].pos);
  for (let i = 0; i < 120; i++) pk.update(1 / 60, i / 60);

  assert.equal(engine.log.filter((e) => e.evt === 'objective').length, 1,
    'the vault beat did not fire exactly once over 120 frames');
  const vaultToasts = engine.log.filter((e) => e.evt === 'toast' && /vault is open/i.test(e.payload?.text ?? ''));
  assert.equal(vaultToasts.length, 1, `the vault toast fired ${vaultToasts.length} times`);

  /* Half B, passing side: one guard defeated, the other holds. */
  pk.vaultOpen = false;
  pk._openVault(null);
  assert.equal(engine.log.filter((e) => e.evt === 'objective').length, 1,
    'defeating `vaultOpen` alone republished the beat — the `!tr` guard is gone and the latch ' +
    'is single, not doubled');

  /* Half B, failing side, run rather than asserted: both guards defeated, and it fires. */
  const eye = pk.treasures.find((t) => t.id === 'eye');
  eye.locked = 'clues';
  pk.vaultOpen = false;
  pk._openVault(null);
  assert.equal(engine.log.filter((e) => e.evt === 'objective').length, 2,
    'the counterexample no longer produces a second beat — this arm has stopped discriminating ' +
    'and the passing side above proves nothing');
});

/* ============================================================================================
   3. the `objective` event, against the subscriber that ships  (§239's own method)
============================================================================================ */

/** HUD's shipped `objective` handler, extracted from `src/ui/HUD.js` at test time. */
const HUD_OBJECTIVE_READER = (() => {
  const m = /on\('objective',\s*\(p\)\s*=>\s*\{([\s\S]*?)\n\s{4}\}\);/.exec(HUD_SRC);
  if (!m) return null;
  return m[1];
})();

test('V6 the `objective` payload satisfies the HUD handler that ships, extracted not copied', () => {
  /**
   * §239's method: a copied expectation rots the moment the subscriber renames a key, which is
   * exactly the failure that produced §239. So the reader is lifted out of `HUD.js` itself.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the payload `_openVault` builds — `{ title, sub }` yields a non-empty title.
   * FAILS ON:  seen — the calibration arm V7 below, which feeds the SAME extracted reader a
   *            plausible-but-wrong `{ name, where }` and requires it to come out empty.
   */
  assert.ok(HUD_OBJECTIVE_READER, 'could not extract HUD\'s `objective` handler — the scrape is blind');

  const evaluate = (p) => {
    let title = null, sub = null;
    /* The two lines the handler actually runs, transcribed from the extracted text by
       evaluating it against a stub `this`. Guarded so a handler that grows a third branch
       fails the extraction check above rather than silently narrowing this one. */
    const fn = new Function('p', 'sink', `
      const self = { objective: (t, s) => { sink.title = t; sink.sub = s; } };
      ${HUD_OBJECTIVE_READER.replace(/this\.objective/g, 'self.objective')}
    `);
    const sink = {};
    fn(p, sink);
    ({ title, sub } = { title: sink.title, sub: sink.sub });
    return { title, sub };
  };

  /* Exactly the payload the module builds — kept in step by scraping it, not retyping it. */
  const built = /_emit\('objective', \{\s*title: '([^']*)'/.exec(stripComments(PICKUPS_SRC));
  assert.ok(built, 'the module no longer publishes an `objective` with a literal title');

  const got = evaluate({ title: built[1], sub: 'The vault under the hall' });
  assert.ok(got.title && got.title.length > 3,
    `the HUD handler read no title out of the published payload (got ${JSON.stringify(got)})`);
  assert.equal(got.title, built[1], 'the HUD reads a different title than the one published');
});

test('V7 CALIBRATION ARM — a plausible-but-wrong objective payload MUST come out empty', () => {
  /**
   * Without this, V6 proves only that the extractor produces SOMETHING. §418.1's second group is
   * the dangerous one: an instrument that answers honestly about the wrong thing agrees with you.
   *
   * DOMAIN (§418.3)
   * PASSES ON: `{ name: 'Steal the Eye of Ra', where: '…' }` — HUD reads `title ?? text`, so a
   *            payload keyed `name` yields '' and the decoy is correctly rejected.
   * FAILS ON:  seen — feeding the real `{ title, sub }` through the same assertion, which
   *            produces a non-empty title and trips it. That is V6, which is the point: the two
   *            arms are the two halves of one domain.
   */
  assert.ok(HUD_OBJECTIVE_READER);
  const fn = new Function('p', 'sink', `
    const self = { objective: (t, s) => { sink.title = t; sink.sub = s; } };
    ${HUD_OBJECTIVE_READER.replace(/this\.objective/g, 'self.objective')}
  `);
  const sink = {};
  fn({ name: 'Steal the Eye of Ra', where: 'Temple of Ra' }, sink);
  assert.ok(!sink.title,
    'a payload using the WRONG key names was accepted by the extracted reader — the extraction ' +
    'is blind and V6 proves nothing');
});

test('V8 §211.1 — `objective` has been removed from the dead-subscription register', () => {
  /**
   * `tests/eventbus.test.mjs` fails in BOTH directions: an event left in DEAD_UNBUILT that has
   * since gained a publisher turns that census red, exactly as `clue` did when its publisher
   * landed. This arm is the forward-facing half — it states, here, that the removal was the
   * point rather than a convenience.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the register as it now ships — DEAD_UNBUILT without `objective`.
   * FAILS ON:  seen — the same regex against `git show HEAD~1:tests/eventbus.test.mjs`, where
   *            `'objective'` is the first entry of the array.
   */
  const m = /const DEAD_UNBUILT = \[([^\]]*)\]/.exec(EVENTBUS_SRC);
  assert.ok(m, 'DEAD_UNBUILT is no longer scrapeable from the census file');
  assert.ok(!/'objective'/.test(m[1]),
    '`objective` is still listed as an unbuilt dead subscription while the vault publishes it');
  assert.ok(/'prompt'/.test(m[1]),
    '§211.1: the scrape matched an empty or unrelated array — `prompt`, which is still genuinely ' +
    'dead and must NOT be published (it retires the HUD\'s affordance fallback), is missing');
});

/* ============================================================================================
   4. the Eye itself
============================================================================================ */

test('V9 the Eye of Ra is the objective the HUD has printed since boot', () => {
  /**
   * The reason this treasure exists. `HUD.js:338` sets the standing objective by direct call and
   * `HUD.js:515` has Bentley naming the vault; neither had an object behind it.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the shipped tree — the HUD's objective string contains 'Eye of Ra', and a
   *            treasure named 'Eye of Ra' exists.
   * FAILS ON:  seen — the same assertion run against the TREASURES array with the `eye` entry
   *            spliced out, which is the state this arm was written against (three treasures,
   *            none of them the one the game asks for).
   */
  assert.ok(/objective\('Steal the Eye of Ra'/.test(HUD_SRC),
    'the HUD no longer names the Eye of Ra as the objective; this treasure has lost its reason');
  const eye = TREASURES.find((t) => /Eye of Ra/.test(t.name));
  assert.ok(eye, 'the game states an objective it contains no object for');
  assert.equal(eye.locked, 'clues', 'the Eye is no longer the vault\'s prize');
  assert.ok(eye.value > Math.max(...TREASURES.filter((t) => t !== eye).map((t) => t.value)),
    'the Eye costs twelve bottles and the walk out, and is not the most valuable thing in the level');
});

test('V10 the Eye is placed where the vault is, and within reach of its floor', () => {
  /**
   * Placement claims are cheap — `Props._clueBottles()`'s own header records two of its twelve
   * being wrong when first written. So the vault's coordinates are scraped from PROPS's `L`
   * table rather than retyped, and the reach is computed with `stepPickup`'s own arithmetic:
   * the player's capsule BASE stands on the vault floor and `grabHeight` lifts the measurement
   * to his centre.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the shipped (0, -11.20, -74.30) — 2.30 m from the vault landmark in plan, 0.80 m
   *            above the floor, 0.41 m from a player standing 0.40 m in front of it.
   * FAILS ON:  seen — both rejected candidates were measured rather than argued about.
   *            (0, -8.90, -75.2), the sun disc's own height in front of Ra's chest, passes the
   *            room test and fails reach at **2.24 m** against a 0.50 m contact radius — it is
   *            3.10 m over the floor and could not be taken at all. (0, -11.75, -72.0), the
   *            sarcophagus lid, fails reach too at **0.76 m** — and is the INGOT's spot, which
   *            is the second reason it is not this one's.
   */
  const L = /vault:\s*\{\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)\s*\}/.exec(PROPS_SRC);
  assert.ok(L, 'PROPS no longer publishes a `vault` landmark to place this against');
  const vx = +L[1], vy = +L[2], vz = +L[3];

  const eye = TREASURES.find((t) => t.id === 'eye');
  const [ex, ey, ez] = eye.pos;

  /* In the room. The vault chamber runs from the gate wall to behind Ra; 8 m of plan radius
     around the landmark is comfortably inside it and comfortably outside the hall above. */
  assert.ok(Math.hypot(ex - vx, ez - vz) < 8.0,
    `the Eye is ${Math.hypot(ex - vx, ez - vz).toFixed(2)} m from the vault landmark — outside the room`);

  /* Above the floor, and not buried in it. */
  assert.ok(ey > vy && ey - vy < 1.5,
    `the Eye sits ${(ey - vy).toFixed(2)} m over the vault floor — buried, or out of reach`);

  /* Reachable. A player standing 0.40 m in front of it, capsule base on the vault floor. */
  const player = new THREE.Vector3(ex, vy, ez + 0.40);
  const d = Math.hypot(player.x - ex, (player.y - ey) + TUNE.grabHeight, player.z - ez);
  assert.ok(d <= TUNE.collect,
    `the Eye is ${d.toFixed(2)} m from a player standing in front of it, past the ${TUNE.collect} m ` +
    'contact radius — it would have to be magnetised rather than taken');
});

test('V11 the Eye pays only at the fence, like every other treasure', async () => {
  /**
   * The payoff routes through machinery that was already live at both ends. This is the arm that
   * says the routing is real rather than asserted — if the Eye had been made a special case it
   * would credit somewhere else.
   *
   * DOMAIN (§418.3)
   * PASSES ON: unlock, take, walk to the fence — wallet 0 at pickup, `eye.value` at the fence.
   * FAILS ON:  seen — asserting the same `coins === 0` AFTER the fence walk, which reads
   *            `eye.value`. The two measurements are taken from the same run below.
   */
  const { engine, pk } = await boot();
  const eye = pk.treasures.find((t) => t.id === 'eye');
  for (let i = 0; i < pk.clues.length; i++) takeAt(pk, engine, pk.clues[i].pos);
  assert.equal(eye.locked, null);

  takeAt(pk, engine, eye.pos);
  assert.equal(pk.wallet.carrying?.id, 'eye');
  assert.equal(pk.wallet.coins, 0, 'picking the Eye up credited the wallet; only the fence pays');

  const player = new THREE.Vector3(pk.fence.x, pk.fence.y, pk.fence.z);
  const prev = engine.get;
  engine.get = (k) => (k === 'movement' ? { position: player } : prev.call(engine, k));
  pk.update(1 / 60, 1);
  engine.get = prev;

  assert.equal(pk.wallet.carrying, null, 'the Eye did not bank at the fence');
  assert.equal(pk.wallet.coins, eye.value, `the fence paid ${pk.wallet.coins} for a ${eye.value} treasure`);
  assert.equal(engine.log.filter((e) => e.evt === 'treasureBanked').length, 1);
});

test('V12 TRIPWIRE — the Eye has a geometry, and it is not the coin mesh', async () => {
  /**
   * DOMAIN (§418.3) — **unfalsifiable in this level, kept deliberately (§418.5).**
   * PASSES ON: the shipped tree.
   * FAILS ON:  nothing reachable. `_treasureGeo` returns a merged Bag for every shape in
   *            TREASURES, and a shape it does not know returns null — but every id in TREASURES
   *            has a branch, so no input this level can produce makes the mesh missing. This is
   *            a TRIPWIRE against a future edit that adds a treasure shape without a branch (the
   *            failure mode is silent: no mesh, no error, an invisible treasure that still
   *            collects). It is NOT evidence that the geometry is right.
   */
  const { pk } = await boot();
  const eye = pk.treasures.find((t) => t.id === 'eye');
  assert.ok(eye.mesh, 'the Eye has no mesh — `_treasureGeo` has no branch for its shape');
  assert.equal(eye.mesh.visible, false, 'the locked Eye is being drawn');
  assert.ok(eye.mesh.geometry.attributes.position.count > 24,
    'the Eye\'s geometry is degenerate');
});
