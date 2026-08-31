import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { installDom, fakeEngine } from './_hudshim.mjs';
import {
  Pickups, POCKET, POCKET_FALLBACK_UP, POP_ON, TUNE, popCount, COIN_VALUE,
} from '../src/world/Pickups.js';

/**
 * pocketpop.test.mjs — §742. The coins that pop out of a guard's pouch and fly to Sly.
 *
 * ── THE ONE CLAIM THIS FILE EXISTS FOR ──────────────────────────────────────────────────────
 * **A steal must move the wallet by the guard's rolled loot exactly once.**
 *
 * That is not a nicety here, it is the shape of a defect this project has already shipped.
 * `tests/pickpocket.test.mjs` exists because `HUD.js` once credited a flat 25 on `pickpocket` —
 * MOVEMENT's INTENT event, which fires with no guard anywhere near — and mashing E in an empty
 * courtyard minted about 45 coins a second. The repair pointed the credit at `guardPickpocket`
 * (the outcome), and `Health.js:149` banks the same number into the charm purse off the same
 * event. So the steal is paid, once, on that event, through two independent readers.
 *
 * §742 adds coins the player can SEE arriving. If those coins paid on arrival, the steal would
 * pay through two or three paths at once and the exploit would be back in a new costume — worse
 * than the first time, because it would look like a feature. **They are therefore purely
 * cosmetic**: they never enter `Pickups.coins`, are never stepped by `stepPickup`, are retired
 * only by `_absorbPop`, and nothing on the bus is emitted when they arrive — not even `coin`
 * with `amount: 0`, because `Audio._onCoins` would still chime and a chime for a payment that
 * did not happen is a lie the player can hear.
 *
 * E1 is that claim, driven end to end through the real HUD, the real `Health` and the real
 * `Pickups` on one bus. E1b is the same run with the pops made payable, and it MUST fail E1's
 * assertion — without it, "the wallet moved by exactly the loot" would be indistinguishable from
 * "this harness cannot see a second payment".
 *
 * ── The rest ────────────────────────────────────────────────────────────────────────────────
 * The FLIGHT arms pin the beat the owner asked for: out from behind the guard, a bowed path, and
 * absorbed at his chest inside a second, faster than he can run away. The CAPACITY arms pin that
 * the headroom on the coin mesh costs nothing while it is empty. The SOURCE arms pin the two
 * cross-module wirings a behavioural test cannot see: that `Guard.pickpocket()` still publishes
 * the pouch, and that FX's gold puff moved off the intent event and onto the steal.
 *
 * Numbers quoted in DOMAIN blocks come from `tools/pocketpop.mjs`, which drives the same code
 * against the real level with real guards, and are re-derived here rather than carried.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DT = 1 / 60;
const SRC = new URL('../src/', import.meta.url);
const read = (p) => readFileSync(new URL(p, SRC), 'utf8');

/** A guard's pouch, as `Guard.pickpocket()` publishes it: rig-derived, behind his facing. */
function stealPayload(coins, { at = V(0, 0, 2), facing = V(0, 0, -1), item = 'brass key' } = {}) {
  const pocket = at.clone().addScaledVector(facing, -0.34);
  pocket.y += POCKET_FALLBACK_UP;
  return { id: 'g-test', coins, item, pos: at.clone(), pocket, forward: facing.clone() };
}

/**
 * The whole economy on one bus: the real HUD, the real `Health`, the real `Pickups`.
 *
 * Booting the real modules rather than scraping their source, for `tests/pickpocket.test.mjs`'s
 * own stated reason: the claim is behavioural ("this event moves this counter by exactly this
 * much") and a regex cannot tell a live subscription from a commented-out one.
 */
/**
 * The level's own authored route, scraped rather than typed — `tests/pickups.test.mjs`'s rule:
 * a hand-copied fixture measures a layout nobody plays the moment the level moves a waypoint.
 * PICKUPS needs it to place any coins at all, and the C arms are about the mesh those coins size.
 */
const ROUTE = (() => {
  const src = readFileSync(new URL('world/EgyptLevel.js', SRC), 'utf8');
  const m = src.match(/api\.route\s*=\s*\[([\s\S]*?)\n\s*\];/);
  if (!m) throw new Error('pocketpop: could not scrape api.route from EgyptLevel.js');
  // eslint-disable-next-line no-new-func
  return new Function(`return [${m[1]}];`)();
})();

async function economy({ player = V(0, 0, 0), route = ROUTE } = {}) {
  installDom();
  const { HUD } = await import('../src/ui/HUD.js');
  const { Health, CHARM } = await import('../src/player/Health.js');
  const camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 500);
  const engine = fakeEngine(camera);
  engine.scene = new THREE.Group();
  const mv = { position: player.clone() };
  const arch = route ? { api: { route } } : null;
  engine.get = (m) => (m === 'movement' ? mv : m === 'architecture' ? arch : null);

  const hud = new HUD(engine); await hud.init();
  const health = new Health(engine); await health.init();
  const pickups = new Pickups(engine); await pickups.init();

  let coinEvents = 0;
  engine.on('coin', () => { coinEvents++; });

  /**
   * ONE update before anything is measured, and it is not a formality.
   *
   * `Pickups.update` publishes `coins` — HUD's ABSOLUTE-set channel — exactly once, on its first
   * frame, to sync the HUD to its own starting purse. `HUD.on('coins')` is `setCoins`, not
   * `addCoins`. A steal that lands before that first frame is therefore credited and then
   * silently overwritten back to `Pickups.wallet.coins`. `tools/pocketpop.mjs` read `HUD wallet
   * +0` on its first run for exactly that reason. It cannot happen in the shipped game — MANIFEST
   * updates PICKUPS from frame 1 and a steal needs a guard inside 2.4 m — but it is a real
   * property of the wiring and it is written down rather than quietly stepped around.
   */
  pickups.update(DT, 0);

  const banked = () => health.purse + health.charms * CHARM.charmCoins;
  const step = (n = 240) => { for (let f = 1; f <= n && pickups._popLive > 0; f++) pickups.update(DT, f * DT); };
  return { engine, hud, health, pickups, mv, banked, step, coins: () => coinEvents };
}

/* ====================================================================================== */
/*  E — the economy                                                                        */
/* ====================================================================================== */

test('pocketpop E0 CALIBRATION (must fire): this harness can move both counters at all', async () => {
  /* §211.1 — E1 is a family of "moved by exactly N, and nothing else moved". If the harness
     could never move either counter, half of it would pass while inspecting nothing. */
  const { engine, hud, banked } = await economy();
  const w0 = hud.coins, p0 = banked();
  engine.emit('coin', { amount: 7, pos: [0, 0, 0] });
  assert.equal(hud.coins - w0, 7,
    'CALIBRATION FAILED — the harness cannot move the wallet, so every delta below is vacuous.');
  assert.equal(banked() - p0, 7,
    'CALIBRATION FAILED — the harness cannot move the charm purse.');
});

test('pocketpop E1: a steal pays the guard\'s roll EXACTLY ONCE, however many coins fly', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped cosmetic pop — a scripted `guardPickpocket` of 137 coins, all seven
   *             discs flown to the player and absorbed, with the real HUD and the real `Health`
   *             subscribed. Wallet +137, purse +137, module wallet +0, zero `coin` events.
   * fails  on : E1b below — RUN IN-ARM, the identical steal with the popped coins made payable.
   *             The wallet then reads 137 + 7 and this assertion goes red, which is the only
   *             thing that shows it can see a second payment at all.
   * does NOT  : say anything about the intent event. `tests/pickpocket.test.mjs` owns that, and
   *             §742 did not touch it.
   * discrim.  : the equality is `=== LOOT`, not `>= LOOT`. A tolerance here would pass the very
   *             defect the arm exists for.
   */
  const LOOT = 137;
  const { engine, hud, pickups, banked, step, coins } = await economy();
  const w0 = hud.coins, p0 = banked(), m0 = pickups.wallet.coins;

  engine.emit('guardPickpocket', stealPayload(LOOT));
  const flew = pickups._popLive;
  assert.equal(flew, popCount(LOOT), `a roll of ${LOOT} popped ${flew} discs, not ${popCount(LOOT)}`);
  step();
  assert.equal(pickups._popLive, 0, 'coins were still in the air after four seconds of flight');

  assert.equal(hud.coins - w0, LOOT,
    `the wallet moved by ${hud.coins - w0} for a steal of ${LOOT}. ${flew} cosmetic coins flew and `
    + 'were absorbed; if any of them paid, this is the E-mash exploit back in a new costume.');
  assert.equal(banked() - p0, LOOT, `the charm purse moved by ${banked() - p0}, not ${LOOT}`);
  assert.equal(pickups.wallet.coins - m0, 0,
    'PICKUPS\' own wallet moved on a steal. It never has — `guardPickpocket` records `_lastPocket` '
    + 'and nothing else — and a divergence between it and the HUD is exactly what `award`\'s '
    + 'docblock warns about.');
  assert.equal(coins(), 0,
    `${coins()} \`coin\` events were published by an absorption. Even at amount 0 that chimes in `
    + 'AUDIO and bursts in FX for a payment that did not happen.');
});

test('pocketpop E1b (the failing input, run in-arm): a PAYING pop double-counts, and E1 sees it', async () => {
  /* This is E1's `fails on` executed, not described. The mutation is the naive implementation:
     give the popped coins a value and let them through `_collectCoin`, which is what handing
     them to the magnet would do. */
  const LOOT = 137;
  const { engine, hud, pickups, banked, coins } = await economy();
  const w0 = hud.coins, p0 = banked();

  engine.emit('guardPickpocket', stealPayload(LOOT));
  const flew = pickups._popLive;
  assert.ok(flew > 0, 'nothing popped, so the mutation would prove nothing');
  for (let i = 0; i < flew; i++) {
    const c = pickups.pocketCoins[i];
    c.pay = true; c.value = COIN_VALUE.single;
    pickups._collectCoin(c);
  }

  assert.equal(hud.coins - w0, LOOT + flew,
    'the mutation did NOT double-pay, so E1\'s equality is not discriminating. Interrogate the '
    + 'harness before trusting E1.');
  assert.equal(banked() - p0, LOOT + flew, 'the charm purse did not double-count either');
  assert.equal(coins(), flew, 'a paying pop must publish one `coin` per coin');
});

test('pocketpop E2: the `pay` guard is live — it is the door a magnet handoff would come back through', async () => {
  /* §742's own first draft handed the pops to `stepPickup`, which routes every collected coin
     through `_collectCoin`. The guard there is what makes that draft safe rather than a second
     payout, so it is asserted in both directions on the same record. */
  const { engine, hud, pickups } = await economy();
  engine.emit('guardPickpocket', stealPayload(60));
  const c = pickups.pocketCoins[0];
  assert.equal(c.pay, false, 'a popped coin is not marked `pay: false`');

  const w0 = hud.coins;
  c.value = 5;
  pickups._collectCoin(c);
  assert.equal(hud.coins - w0, 0, '`_collectCoin` paid a `pay: false` record');

  c.pay = true;
  pickups._collectCoin(c);
  assert.equal(hud.coins - w0, 5,
    'flipping `pay` did not pay, so the guard above is not what stopped the first call');
});

/* ====================================================================================== */
/*  P — the count                                                                          */
/* ====================================================================================== */

test('pocketpop P1: the disc count tracks the loot, monotonically, and is CAPPED', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped `popCount` — 0 → 0, and 10/45/90/150 → 3/3/5/8 against a loot table
   *             (`Guard.TUNE.loot`) of scarab 10-25, temple 45-90, heavy 80-150.
   * fails  on : an UNCLAMPED `Math.ceil(v / perCoin)`, which agrees on every value in the loot
   *             table and diverges at 400 → 20. The cap is invisible inside the table, so a
   *             domain drawn only from the table would not test it — asserted at 400 for exactly
   *             that reason.
   * does NOT  : claim the mapping is the right FEEL. It claims it is monotone, bounded and
   *             derived from the roll rather than a fixed number.
   */
  assert.equal(popCount(0), 0, 'a zero roll must pop nothing at all');
  assert.equal(popCount(-5), 0);
  assert.equal(popCount(NaN), 0);

  let prev = 0;
  for (let v = 1; v <= 400; v++) {
    const n = popCount(v);
    assert.ok(n >= POCKET.min && n <= POCKET.max, `popCount(${v}) = ${n} is outside [${POCKET.min}, ${POCKET.max}]`);
    assert.ok(n >= prev, `popCount is not monotone: ${v - 1} → ${prev} but ${v} → ${n}`);
    prev = n;
  }
  assert.equal(popCount(400), POCKET.max,
    'the cap is not holding at 400 — an unclamped ceil(v / perCoin) would return 20 here, and '
    + 'every value in the actual loot table agrees with the unclamped form, so this is the only '
    + 'input that separates them.');
  assert.equal(popCount(POCKET.max * POCKET.perCoin), POCKET.max);
});

test('pocketpop P2: the pool is NOT the authored coin set, and a steal never grows it', async () => {
  /* `this.coins` is the authored 82 and three things read it as such — `stats.coins`,
     `tools/coinfit.mjs`'s interpenetration census, and `tests/pickups.test.mjs`'s placement arms.
     A pool record leaking into it would move all three and none of them would say why. */
  const { engine, pickups, step } = await economy();
  const placed = pickups.coins.length;
  const stat = pickups.stats.coins;
  for (let i = 0; i < 5; i++) { engine.emit('guardPickpocket', stealPayload(90)); step(30); }
  assert.equal(pickups.coins.length, placed, 'a steal grew the authored coin set');
  assert.equal(pickups.stats.coins, stat, 'a steal moved `stats.coins`');
  for (const c of pickups.pocketCoins) {
    assert.ok(!pickups.coins.includes(c), 'a pool record was pushed into `this.coins`');
  }
});

/* ====================================================================================== */
/*  C — capacity                                                                           */
/* ====================================================================================== */

test('pocketpop C1: the coin mesh has headroom, and it costs nothing while it is empty', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped mesh — capacity `coins.length + POCKET.pool`, drawing exactly
   *             `coins.length` with nothing popped, and `coins.length + N` with N in the air.
   * fails  on : the PRE-§742 sizing, `new InstancedMesh(geo, mat, coins.length)`. Reproduced
   *             in-arm below: a buffer of that size cannot hold instance `coins.length`, so a
   *             `setMatrixAt` past the end writes nothing and the pop is invisible. That is the
   *             defect the brief names — "there is nowhere to spawn into".
   * does NOT  : measure GPU cost. The claim is about DRAW COUNT and instance capacity, both of
   *             which are exact integers here; `Engine.stats.drawCalls` is unusable in this
   *             harness (five frozen values, zero spread) and is not consulted.
   */
  const { engine, pickups, step } = await economy();
  const mesh = pickups._coinMesh;
  const placed = pickups.coins.length;
  assert.ok(mesh, 'no coin mesh was built');
  assert.equal(mesh.instanceMatrix.count, placed + POCKET.pool,
    'the coin mesh was not given the pool as headroom');

  pickups.update(DT, 1);
  assert.equal(mesh.count, placed,
    `an idle frame draws ${mesh.count} instances against ${placed} authored coins — the headroom `
    + 'is being drawn, so it is not free.');

  engine.emit('guardPickpocket', stealPayload(150));
  pickups.update(DT, 2);
  assert.equal(mesh.count, placed + pickups._popLive,
    'the draw count does not track the live pool');
  assert.equal(pickups._popLive, POCKET.max, 'the biggest roll in the loot table did not pop the cap');

  step();
  pickups.update(DT, 9);
  assert.equal(mesh.count, placed, 'the draw count did not come back down after the flight');

  /**
   * The failing input, executed: the pre-§742 buffer cannot hold the first pool slot.
   *
   * And it does not THROW — which is the whole reason this feature needed headroom decided
   * deliberately rather than discovered. `InstancedMesh.setMatrixAt` writes into a `Float32Array`
   * through `Matrix4.toArray`, and a write past the end of a typed array is silently discarded by
   * the language. So the pre-§742 mesh would have accepted every pop and drawn none of them, with
   * no error anywhere. The control asserts the write is LOST, not that it is refused; the first
   * draft asserted `throws` and went red, which is §418.3 catching the person writing the bar.
   */
  const old = new THREE.InstancedMesh(mesh.geometry, mesh.material, placed);
  assert.equal(old.instanceMatrix.count, placed,
    'the pre-§742 sizing is not the placed count, so this control is not reproducing it');
  assert.ok(mesh.instanceMatrix.count > old.instanceMatrix.count,
    'the shipped mesh is no larger than the pre-§742 one');
  const probe = new THREE.Matrix4().makeTranslation(1, 2, 3);
  const back = new THREE.Matrix4();
  old.setMatrixAt(placed, probe);
  old.getMatrixAt(placed, back);
  assert.notDeepEqual([...back.elements], [...probe.elements],
    'a buffer sized to exactly the placed count round-tripped a write past its end — then this '
    + 'control is not reproducing the "nowhere to spawn into" defect at all.');
  /* …and the shipped mesh does hold it, which is the other half of the pair. */
  mesh.setMatrixAt(placed, probe);
  mesh.getMatrixAt(placed, back);
  assert.deepEqual([...back.elements], [...probe.elements],
    'the shipped mesh lost a write to the first pool slot');
  pickups.update(DT, 10);                    // put the buffer back the way the module wants it
});

test('pocketpop C2: the pool is bounded, and overflow recycles instead of leaking', async () => {
  const { engine, pickups } = await economy();
  for (let i = 0; i < 12; i++) engine.emit('guardPickpocket', stealPayload(150));
  assert.equal(pickups._popLive, POCKET.pool, 'the live count did not saturate at the pool size');
  assert.ok(pickups._popLive <= pickups.pocketCoins.length, 'the pool overflowed its own array');
  assert.ok(pickups.debugInfo().pop.evicted > 0,
    'twelve maximum steals in one frame did not evict anything — then the pool is not bounded ' +
    'by what it says it is bounded by');
});

/* ====================================================================================== */
/*  F — the flight                                                                         */
/* ====================================================================================== */

test('pocketpop F1: they leave from BEHIND him, at his belt, and arrive at his chest', async () => {
  /* The owner asked for coins that pop out from BEHIND the guard. Both halves are geometry and
     both are asserted: the launch point is behind his facing, and the arrival point is the same
     chest offset every other coin in the game is taken at. */
  const at = V(0, 0, 2), facing = V(0, 0, -1);
  const { engine, pickups } = await economy({ player: V(0, 0, 0) });
  engine.emit('guardPickpocket', stealPayload(90, { at, facing }));
  const n = pickups._popLive;
  assert.ok(n >= 3, 'not enough coins to say anything about direction');

  for (let i = 0; i < n; i++) {
    const c = pickups.pocketCoins[i];
    const rel = c.pos.clone().sub(at);
    assert.ok(rel.dot(facing) < 0,
      `coin ${i} launched at dot ${rel.dot(facing).toFixed(3)} along his facing — that is in FRONT of him`);
    assert.ok(c.pos.y - at.y > 0.3 && c.pos.y - at.y < 1.2,
      `coin ${i} launched ${(c.pos.y - at.y).toFixed(2)} m above his feet. A temple guard's head is `
      + 'at 1.95 m and his belt at 0.62; this is neither.');
  }

  /* And the first frames go further away from him before they come back. */
  const start = pickups.pocketCoins[0].pos.clone();
  let peak = 0;
  for (let f = 1; f <= 240 && pickups._popLive > 0; f++) {
    if (pickups.pocketCoins[0].born >= 0) peak = Math.max(peak, pickups.pocketCoins[0].pos.distanceTo(at));
    pickups.update(DT, f * DT);
  }
  assert.ok(peak > start.distanceTo(at) + 0.25,
    `the coin never got more than ${peak.toFixed(2)} m from the guard — that is not a pop, it is a `
    + 'straight line to the player.');
  assert.equal(pickups._popLive, 0, 'a coin never reached him');
});

test('pocketpop F2: the path BOWS — thrown, not teleported', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped `homeTurn` 9.0, which blends the residual pop velocity into the
   *             homing direction rather than replacing it. Measured on the real level by
   *             `tools/pocketpop.mjs`: 0.36-0.45 m of bow off the straight line at every guard.
   * fails  on : RUN IN-ARM — the same flight with the steering made instantaneous, which is the
   *             obvious implementation (`vel = dir * speed`) and collapses the bow to the pop
   *             phase alone. Without this the arm would pass on a straight line with a kink.
   * does NOT  : claim a bow magnitude is correct. It claims the shape is not a straight line and
   *             that the term responsible is `homeTurn`.
   */
  const at = V(0, 0, 2), facing = V(0, 0, -1), player = V(0, 0, -1);

  /**
   * The bow is measured over the HOMING segment only — from where the coin is when `popTime`
   * expires to the chest — and not over the whole path.
   *
   * The first draft measured from the launch point and could not discriminate: shipped 0.332 m
   * against 0.257 m with the steering made instantaneous, because the pop phase is ballistic in
   * BOTH arms and contributes most of that on its own. A control that the subject shares with
   * its mutant measures the part they have in common. §418.3's failure mode, in a ratio.
   */
  const bowOf = async (turn) => {
    const { engine, pickups } = await economy({ player });
    const saved = POCKET.homeTurn;
    POCKET.homeTurn = turn;
    try {
      engine.emit('guardPickpocket', stealPayload(90, { at, facing }));
      const c = pickups.pocketCoins[0];
      const to = player.clone(); to.y += TUNE.grabHeight;
      let from = null, line = null, len2 = 1, bow = 0;
      for (let f = 1; f <= 240 && c.born >= 0; f++) {
        pickups.update(DT, f * DT);
        if (c.born < 0) break;
        if (c.t < POCKET.popTime) continue;
        if (!from) { from = c.pos.clone(); line = to.clone().sub(from); len2 = line.lengthSq() || 1; continue; }
        const rel = c.pos.clone().sub(from);
        const proj = line.clone().multiplyScalar(rel.dot(line) / len2);
        bow = Math.max(bow, rel.distanceTo(proj));
      }
      return bow;
    } finally { POCKET.homeTurn = saved; }
  };

  const shipped = await bowOf(POCKET.homeTurn);
  const snapped = await bowOf(1e6);          // instantaneous steering: `vel = dir * speed`
  assert.ok(shipped > 0.10,
    `the homing segment bows only ${shipped.toFixed(3)} m off the straight line — that reads as a `
    + 'coin being teleported to the player, which is the thing `homeTurn` exists to prevent.');
  assert.ok(shipped > snapped * 3,
    `bow ${shipped.toFixed(3)} m against ${snapped.toFixed(3)} m with instantaneous steering. If `
    + 'those are close, `homeTurn` is doing nothing and the arc is not coming from where this '
    + 'file says it comes from.');
});

test('pocketpop F3: the beat is sub-second, and it beats a sprinting player', async () => {
  /* The flight speed is borrowed from `TUNE.speedMax` on the stated grounds that it is
     2 x runSpeed and must beat a sprint. That is an argument until it is driven. */
  const at = V(0, 0, 2), facing = V(0, 0, -1);
  const { engine, pickups, mv } = await economy({ player: V(0, 0, 0) });

  engine.emit('guardPickpocket', stealPayload(150, { at, facing }));
  let f = 0;
  for (; f <= 240 && pickups._popLive > 0; f++) pickups.update(DT, f * DT);
  assert.ok(f * DT < 1.0, `the beat took ${(f * DT).toFixed(2)} s — it must read inside a second`);
  assert.equal(pickups._popLive, 0);

  /* Now with the player running flat out, away. */
  const run = TUNE.speedMax / 2;                    // TUNE.speedMax is 2 x Controller runSpeed
  engine.emit('guardPickpocket', stealPayload(150, { at, facing }));
  let g = 0;
  for (; g <= 400 && pickups._popLive > 0; g++) { mv.position.z += run * DT; pickups.update(DT, g * DT); }
  assert.equal(pickups._popLive, 0,
    `${pickups._popLive} coins never caught a player running at ${run.toFixed(1)} m/s. The flight `
    + 'speed is TUNE.speedMax precisely so that cannot happen.');
  assert.ok(g * DT < POCKET.life, `the chase took ${(g * DT).toFixed(2)} s, past the ${POCKET.life} s life cap`);
});

test('pocketpop F4: a coin that cannot reach him gives its slot back rather than hanging', async () => {
  const { engine, pickups, mv } = await economy();
  mv.position.set(1e4, 0, 1e4);                     // unreachable inside `life`
  engine.emit('guardPickpocket', stealPayload(90));
  assert.ok(pickups._popLive > 0);
  for (let f = 1; f <= Math.ceil((POCKET.life + 0.5) / DT); f++) pickups.update(DT, f * DT);
  assert.equal(pickups._popLive, 0, 'an unreachable coin held its slot past `POCKET.life`');
  assert.ok(pickups.debugInfo().pop.expired > 0, 'the expiry was not counted');
});

/* ====================================================================================== */
/*  T — the tune, and the mirrors that must not drift                                      */
/* ====================================================================================== */

test('pocketpop T1: the fallback belt height mirrors GUARDS, and cannot drift silently', async () => {
  /* PICKUPS does not import GUARDS — the collect loop must not depend on the AI module — so the
     one number it needs is mirrored. A mirror with nothing checking it is how two halves of one
     value end up in two files, which is the defect §712 spent a section removing. */
  const { GUARD_TUNE } = await import('../src/ai/Guard.js');
  assert.equal(POCKET_FALLBACK_UP, GUARD_TUNE.pocketUp,
    `PICKUPS' fallback belt height is ${POCKET_FALLBACK_UP} and GUARDS' \`pocketUp\` is `
    + `${GUARD_TUNE.pocketUp}. They are the same number in two files and have drifted.`);
});

test('pocketpop T2: the flight speed IS the magnet\'s, not a second one beside it', async () => {
  /* §223's snap/catch split and this file's TUNE header both say the same thing: a second,
     differently-felt convergence speed beside the magnet's is drift. `_stepPop` reads
     `TUNE.speedMin`/`TUNE.speedMax` directly, and this pins that it still does. */
  const src = read('world/Pickups.js');
  const body = /_stepPop\(c, dt, target\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(body, 'could not find `_stepPop` — has it been renamed?');
  assert.match(body[1], /TUNE\.speedMin/, '`_stepPop` no longer takes its floor from the magnet law');
  assert.match(body[1], /TUNE\.speedMax/, '`_stepPop` no longer takes its ceiling from the magnet law');
  assert.match(body[1], /TUNE\.collect/,
    '`_stepPop` no longer absorbs at `TUNE.collect` — then a popped coin and a magnetised one '
    + 'arrive at different distances and "identical to every other coin" is false.');
});

test('pocketpop T3: the revert token takes the whole feature back out', async () => {
  /* `?pop=off`, in the established style (`?kk=`, `?react=`, `?vault=`). Read at module scope,
     so the arm needs a fresh module instance rather than a live flag. */
  assert.equal(POP_ON, true, 'the feature is off by default — the token has inverted');
  const prev = globalThis.__POP_AB;
  globalThis.__POP_AB = 'off';
  try {
    const mod = await import(`../src/world/Pickups.js?pop-off=${Date.now()}`);
    assert.equal(mod.POP_ON, false, '`__POP_AB = "off"` did not turn the pop off');
    const { engine, pickups } = await economy();
    /* The live module still has POP_ON true, so drive the gate directly: with the token set, the
       subscriber must not call `_popPocket`. Asserted on the freshly-imported module's source
       gate rather than re-booting the world, because the gate is one `if`. */
    assert.match(read('world/Pickups.js'), /if \(POP_ON\) this\._popPocket\(p\)/,
      'the `guardPickpocket` subscriber no longer gates the pop on POP_ON');
    engine.emit('guardPickpocket', stealPayload(90));
    assert.ok(pickups._popLive > 0, 'sanity: the un-gated module still pops');
  } finally {
    if (prev === undefined) delete globalThis.__POP_AB; else globalThis.__POP_AB = prev;
  }
});

/* ====================================================================================== */
/*  S — the cross-module wirings a behavioural test cannot see                             */
/* ====================================================================================== */

test('pocketpop S1: `Guard.pickpocket()` publishes the pouch, off the rig', async () => {
  /* Source-level and deliberately so: the payload key is a contract between two modules, and the
     behavioural arms above supply it themselves. If GUARDS stops publishing `pocket`, PICKUPS
     falls back to the guard's FEET and the coins appear at his ankles — which still collects,
     still pays correctly, and still passes every arm in this file. */
  const g = read('ai/Guard.js');
  const body = /pickpocket\(\)\s*\{([\s\S]*?)\n  \}/.exec(g);
  assert.ok(body, 'could not find `Guard.pickpocket()` — has it been renamed?');
  assert.match(body[1], /payload\.pocket = this\._pocketWorld\(/,
    '`Guard.pickpocket()` no longer publishes the pouch position');
  assert.match(body[1], /payload\.forward = this\.forward\.clone\(\)/,
    '`Guard.pickpocket()` no longer publishes his facing — then "behind him" has no direction');
  assert.match(body[1], /emit\(\s*'guardPickpocket'/, 'the steal is no longer announced');

  const pw = /_pocketWorld\(out\)\s*\{([\s\S]*?)\n  \}/.exec(g);
  assert.ok(pw, 'could not find `Guard._pocketWorld`');
  assert.match(pw[1], /bones\.hips/,
    '`_pocketWorld` no longer reads the rig — a static offset does not follow the walk cycle');
  assert.match(pw[1], /capsuleSweep/,
    '`_pocketWorld` no longer sweeps the pouch offset. `tools/pocketpop.mjs` measures 7 of 7 '
    + 'spawns overlapping a solid collider without it.');
});

test('pocketpop S2: FX\'s gold puff moved off the INTENT and onto the steal', async () => {
  /* `pickpocket` is MOVEMENT's intent event. `Moveset.Pickpocket.canEnter` now requires a mark,
     so it is no longer free money — but it still fires on every reach that MISSES (the mark
     walked away inside `pickTime`, the guard was already `looted`, a heavy clutched his purse).
     A gold burst there says "you got it" when the answer was no, and it is now the ONLY thing
     saying anything, because §741 removed the guard's reaction. */
  const fx = read('fx/Particles.js');
  assert.match(fx, /on\('guardPickpocket',[^\n]*coin_pop/,
    'FX no longer bursts `coin_pop` on the successful steal');
  assert.match(fx, /on\('guardPickpocket',[^\n]*e\?\.pocket/,
    'the burst is not aimed at the pouch — then the puff and the coins have different origins');
  const intent = /on\('pickpocket',([\s\S]{0,200}?)\)\s*;/.exec(fx);
  if (intent) {
    assert.doesNotMatch(intent[1], /coin_pop/,
      'FX bursts `coin_pop` on the `pickpocket` INTENT event again — that fires on failed reaches');
  }
});

test('pocketpop S3: `_absorbPop` is the only retirement path, and it pays nothing', async () => {
  const src = read('world/Pickups.js');
  const body = /_absorbPop\(i\)\s*\{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(body, 'could not find `_absorbPop` — has it been renamed?');
  assert.doesNotMatch(body[1], /award|_coin\(|_emit\(/,
    '`_absorbPop` credits or publishes something. It is the arrival of a cosmetic coin and the '
    + 'steal was paid, in full, when `guardPickpocket` went out.');
  /* And the pool is never handed to the magnet, which is what would route it to `_collectCoin`. */
  const upd = /if \(this\._popLive\) \{([\s\S]*?)\n    \}/.exec(src);
  assert.ok(upd, 'could not find the pop loop in `update`');
  assert.doesNotMatch(upd[1], /stepPickup/,
    'the popped coins are being stepped by the magnet again — that routes them through '
    + '`_collectCoin` and reopens the double-pay.');
});

/* ====================================================================================== */
/*  R — the real input path (§435.4)                                                       */
/* ====================================================================================== */

test('pocketpop R1: the steal driven through INPUT — E pressed, not `Guard.pickpocket()` called', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped chain, driven end to end on the REAL level with the REAL roster —
   *             `Input.hold('interact')` → `Moveset.Pickpocket.canEnter` (which needs a mark) →
   *             `emit('pickpocket')` → `Guards._hookEvents` → `nearestPickpocketTarget` →
   *             `Guard.pickpocket()` → `emit('guardPickpocket')` → `Pickups._popPocket`. Seven
   *             modules and one keypress; the pool must end up holding `popCount(loot)` coins.
   * fails  on : RUN IN-ARM — the identical drive with the player standing 20 m away, where
   *             `canEnter` finds no mark, no intent goes out and nothing pops. Without it, "the
   *             pool filled" would be indistinguishable from "the pool fills on any frame".
   * does NOT  : replace the scripted arms above. A driven steal cannot control the roll, so the
   *             ECONOMY claim stays where it can assert an exact number.
   *
   * §435.4 is why this arm exists at all: every other arm in this file hands `Pickups` a payload
   * that I wrote, which tests my model of what GUARDS publishes. This one presses E.
   */
  const { realWorld, hardReset, DT: RDT } = await import('./_moveset.mjs');
  const { Guards } = await import('../src/ai/Guard.js');
  const { STATE } = await import('../src/ai/Patrol.js');

  const { engine, collision, c } = await realWorld();
  const guards = new Guards(engine);
  await guards.init();
  const mv = { position: c.position };
  const inner = engine.get.bind(engine);
  engine.get = (m) => (m === 'guards' ? guards : m === 'movement' ? mv
    : m === 'collision' ? collision : inner(m));
  const pickups = new Pickups(engine);
  await pickups.init();

  const g = guards.guards.find((x) => x.position.y === 0 && x.position.z > 20) || guards.guards[1];
  g.looted = false;
  g.state = STATE.PATROL;
  g._updatePocket();
  g.root.updateMatrixWorld(true);

  const drive = (from) => {
    /**
     * The yaw matters and the default is wrong for this arm.
     *
     * `hardReset(…, yaw = Math.PI)` faces him down −Z, and `Guards.nearestPickpocketTarget`
     * rejects any target whose direction dots below 0.1 with the player's facing — "he is behind
     * Sly; not a target". The first draft took the default and reported "pressing E next to a
     * guard never produced the intent", which was true and was a fact about the harness. So the
     * spawn yaw is derived from the guard's own position.
     */
    const yaw = Math.atan2(g.position.x - from.x, g.position.z - from.z);
    hardReset(engine, c, from.clone(), yaw);
    pickups._popLive = 0;
    const seen = { intent: 0, steal: 0, loot: 0 };
    const offA = engine.on('pickpocket', () => { seen.intent++; });
    const offB = engine.on('guardPickpocket', (p) => { seen.steal++; seen.loot = p?.coins ?? 0; });
    for (let i = 0; i < 90 && seen.steal === 0; i++) {
      /* Aim the camera at him: `Controller._readInput` is camera-relative (§6.1), and
         `pickMark` ranks by facing. */
      const dx = g.position.x - c.position.x, dz = g.position.z - c.position.z;
      const l = Math.hypot(dx, dz) || 1;
      engine.camera.rotation.set(0, Math.atan2(-dx / l, -dz / l), 0, 'YXZ');
      engine.camera.updateMatrixWorld(true);
      engine.input.beginFrame(RDT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      if (i % 6 === 0) engine.input.hold('interact'); else engine.input.let_go('interact');
      engine.time = i * RDT;
      c.update(RDT, i * RDT);
      guards.update(RDT, i * RDT);
      pickups.update(RDT, i * RDT);
    }
    offA(); offB();
    return { ...seen, popped: pickups._popLive };
  };

  /* Stand him inside `pocketRange`, BEHIND the guard — which is where a pickpocket happens, and
     which also keeps the roster's own AI from promoting him out of PATROL mid-arm. Nothing is
     teleported to the pouch: `hardReset` places the capsule and the press does the rest. */
  const near = g.position.clone().addScaledVector(g.forward, -1.4);
  near.y = g.position.y;
  const hit = drive(near);
  assert.ok(hit.intent > 0, 'pressing E next to a guard never produced the `pickpocket` intent');
  assert.equal(hit.steal, 1, `pressing E produced ${hit.steal} steals, not exactly one`);
  assert.ok(hit.loot > 0, 'the steal published no loot');
  assert.equal(hit.popped, popCount(hit.loot),
    `a driven steal of ${hit.loot} coins popped ${hit.popped} discs, not ${popCount(hit.loot)}`);

  /* The failing input: the same drive with nobody to rob. */
  g.looted = false;
  g.state = STATE.PATROL;
  const far = g.position.clone().addScaledVector(g.forward, -20);
  far.y = g.position.y;
  const miss = drive(far);
  assert.equal(miss.steal, 0, 'a steal landed from 20 m away');
  assert.equal(miss.popped, 0,
    `${miss.popped} coins popped with no guard in reach. Then the pool fills on something other `
    + 'than a steal and the arm above proves nothing.');
});
