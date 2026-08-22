import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { installDom, fakeEngine } from './_hudshim.mjs';
import { Health, CHARM } from '../src/player/Health.js';

/**
 * §248's largest dead end: `health` and `damage` were both subscribed and never published, so
 * **nothing in the game could hurt the player**. The HUD had a pip row, a hit flash, a vignette
 * punch and a shake all wired to a number no code path could move; the guards had an alert
 * ladder, a chase, an attack range and an attack cooldown that ended in an animation and nothing
 * else. Two finished halves, never introduced — `tests/pickpocket.test.mjs`'s defect exactly.
 *
 * These boot the real `Health` and, where the claim is about the HUD, the real `HUD.js` against
 * the DOM shim. The claims are behavioural — "this event costs exactly one charm", "this hit is
 * refused" — and a regex over the source cannot tell a live subscription from a commented-out
 * one, nor a hit that landed from one that was thrown away by invulnerability.
 *
 * ── What is being defended, and why it is not a hit-point bar ──────────────────────────────────
 * Sly dies in one hit unless a lucky charm eats it. That is the series' rule and it is the reason
 * the first game is a stealth game rather than a combat one. The tests that matter most here are
 * therefore the ones that would pass just as happily against a generic HP bar and *must not*:
 * `damage { amount: 99 }` has to cost exactly one charm, and a hit with no charm has to be the
 * end of the run rather than a dent in a meter.
 */

const HEALTH_SRC = readFileSync(new URL('../src/player/Health.js', import.meta.url), 'utf8');

/** A movement module with only the surface `Health` is allowed to touch. */
function fakeMovement(pos = new THREE.Vector3(4, 0, 12), yaw = 1.1) {
  return {
    position: pos.clone(),
    yaw,
    grounded: true,
    teleports: [],
    teleport(v, y) { this.teleports.push({ pos: v.clone(), yaw: y }); this.position.copy(v); this.yaw = y; },
  };
}

/**
 * Engine + Health, with the bus traffic recorded. `fakeEngine`'s `get` always returns null, so
 * the module map is layered on top — `Health` asks for `movement` and must degrade when it is
 * absent, which is itself asserted below.
 */
async function boot({ movement = fakeMovement(), withHud = false } = {}) {
  installDom();
  const camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 500);
  camera.position.set(0, 2, 0); camera.lookAt(0, 2, -20);
  camera.updateMatrixWorld(true);
  const engine = fakeEngine(camera);
  const mods = { movement };
  engine.get = (k) => mods[k] ?? null;
  engine.has = (k) => !!mods[k];

  const seen = [];
  for (const evt of ['health', 'hurt', 'damage', 'shake', 'toast']) {
    engine.on(evt, (p) => seen.push({ evt, p }));
  }

  let hud = null;
  if (withHud) {
    const { HUD } = await import('../src/ui/HUD.js');
    hud = new HUD(engine);
    await hud.init();
    mods.hud = hud;
  }

  const health = new Health(engine);
  await health.init();
  mods.health = health;

  const of = (evt) => seen.filter((s) => s.evt === evt);
  return { engine, health, movement, hud, seen, of };
}

/** Advance `Health` by `secs` in 1/60 steps, the way the frame loop does. */
const tick = (health, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) health.update(1 / 60); };

/* ─────────────────────────────────────── calibration ───────────────────────────────────────── */

test('CALIBRATION (must fire): a hit can reach the player at all', async () => {
  /* §211.1 — most assertions below are "this hit was REFUSED". If the harness could never land
     one, every one of them would pass having tested nothing. Prove a hit lands first. */
  const { engine, health } = await boot();
  health.addCharm(1);
  const before = health.charms;
  engine.emit('damage', { source: 'calibration' });
  assert.equal(health.charms, before - 1,
    'CALIBRATION FAILED — emitting `damage` did not cost a charm, so every "was refused" '
    + 'assertion below is vacuous. Interrogate the harness; do not adjust the tests.');
  assert.equal(health.hits, 1);
});

test('CALIBRATION (must fire): the HUD pip row is reachable from the bus', async () => {
  const { engine, hud } = await boot({ withHud: true });
  const pips = () => hud.el.pips.childElementCount;
  const lit = () => [...hud.el.pips.children].filter((c) => !c.classList.contains('sly-pip-lost')).length;
  assert.ok(pips() > 0, 'the HUD built no pips at all — the shim is not rendering the row');
  const before = lit();
  engine.emit('damage', {});
  assert.notEqual(lit(), before,
    'CALIBRATION FAILED — a landed hit did not change the lit pip count, so the HUD assertions below are vacuous');
});

/* ──────────────────────────────── the Sly rule, not an HP bar ──────────────────────────────── */

test('with no charm, one hit ends the run', async () => {
  const { engine, health, of } = await boot();
  assert.equal(health.charms, 0, 'the default state is carrying nothing');
  assert.equal(health.hp, 1, 'alive with no charm is exactly one pip: Sly himself');

  engine.emit('damage', { source: 'guard' });

  assert.equal(health.down, true, 'a single hit with no charm must be fatal, not a dent in a meter');
  assert.equal(health.hp, 0);
  assert.equal(health.deaths, 1);
  assert.equal(of('health').at(-1).p.hp, 0, 'the fatal state must be published, not just held');
});

test('the amount on a damage request is ignored — every hit costs exactly one charm', async () => {
  /* THE test that separates this from a hit-point bar. A generic implementation subtracts
     `amount`; 99 would clear the whole row and kill him outright. */
  const { engine, health } = await boot();
  health.addCharm(2);
  assert.equal(health.charms, 2);

  engine.emit('damage', { amount: 99, source: 'a very big spear' });

  assert.equal(health.charms, 1,
    'a hit of `amount: 99` cost more than one charm — this is a hit-point bar, not Sly\'s rule');
  assert.equal(health.down, false, 'and it certainly must not have killed him through a charm');
});

test('two hits in the same instant cost one charm; the second lands once the i-frames expire', async () => {
  const { engine, health } = await boot();
  health.addCharm(2);

  engine.emit('damage', {});
  engine.emit('damage', {});
  engine.emit('damage', {});
  assert.equal(health.charms, 1, 'three hits inside the invulnerability window must cost one charm');
  assert.equal(health.refused, 2, 'and the two that did not land must be counted as refused, not lost');

  tick(health, CHARM.invuln + 1 / 30);
  engine.emit('damage', {});
  assert.equal(health.charms, 0, 'once the i-frames expire the next hit lands');
  assert.equal(health.down, false, 'spending the last charm is survival, not death');

  tick(health, CHARM.invuln + 1 / 30);
  engine.emit('damage', {});
  assert.equal(health.down, true, 'and the hit after that, with nothing left to spend, is fatal');
});

test('a hit that lands publishes `hurt` exactly once; a refused one publishes nothing', async () => {
  /* `hurt` is what `Controller.js` has subscribed to since before anything published it — the
     knockback and the hurt animation. It must fire per LANDED hit, never per request, or the
     player gets shoved by hits that invulnerability already threw away. */
  const { engine, health, of } = await boot();
  health.addCharm(1);

  engine.emit('damage', { dir: { x: 1, y: 0, z: 0 }, force: 7 });
  assert.equal(of('hurt').length, 1);
  assert.deepEqual(of('hurt')[0].p.dir, { x: 1, y: 0, z: 0 }, 'the knockback direction must survive the trip');
  assert.equal(of('hurt')[0].p.force, 7);

  engine.emit('damage', {});
  engine.emit('damage', {});
  assert.equal(of('hurt').length, 1, 'refused hits must not shove the player');
});

test('while down, further hits do nothing at all', async () => {
  const { engine, health, of } = await boot();
  engine.emit('damage', {});
  assert.equal(health.down, true);
  const hurts = of('hurt').length;
  engine.emit('damage', {});
  engine.emit('damage', {});
  assert.equal(health.deaths, 1, 'a downed player cannot die twice');
  assert.equal(of('hurt').length, hurts, 'and cannot be knocked about while down');
});

/* ─────────────────────────────────── charms come from coins ────────────────────────────────── */

test('charms are bought with coins at the series price, from both the ground and a pocket', async () => {
  const { engine, health } = await boot();
  engine.emit('coin', { amount: CHARM.charmCoins - 1 });
  assert.equal(health.charms, 0, `${CHARM.charmCoins - 1} coins is not yet a charm`);
  engine.emit('coin', { amount: 1 });
  assert.equal(health.charms, 1, 'the charm arrives on the coin that completes the price');

  /* Stolen money is money. An economy that counts only found coins presents as "the charm price
     feels wrong" and is very hard to see from the outside. */
  engine.emit('guardPickpocket', { id: 'g1', coins: CHARM.charmCoins, item: 'brass key' });
  assert.equal(health.charms, 2, 'a pickpocketed purse must buy a charm like any other coins');
});

test('the purse stops filling at the charm cap rather than banking an invisible surplus', async () => {
  const { engine, health } = await boot();
  engine.emit('coin', { amount: CHARM.charmCoins * (CHARM.maxCharms + 4) });
  assert.equal(health.charms, CHARM.maxCharms, 'charms cap');
  assert.ok(health.purse < CHARM.charmCoins,
    `the purse banked ${health.purse} at the cap — spending one charm would then mint another instantly`);

  /* And after spending one, the next charm costs a full price again. */
  engine.emit('damage', {});
  assert.equal(health.charms, CHARM.maxCharms - 1);
  const need = CHARM.charmCoins - health.purse;
  engine.emit('coin', { amount: need - 1 });
  assert.equal(health.charms, CHARM.maxCharms - 1, 'one coin short must still be one coin short');
  engine.emit('coin', { amount: 1 });
  assert.equal(health.charms, CHARM.maxCharms);
});

/* ────────────────────────────────── death, respawn, checkpoints ────────────────────────────── */

test('the respawn puts him back at the last calm checkpoint, and does not refund a charm', async () => {
  const movement = fakeMovement(new THREE.Vector3(4, 0, 12), 1.1);
  const { engine, health } = await boot({ movement });

  tick(health, CHARM.checkpointEvery + 0.1);              // bookmark where he is standing
  assert.ok(health.checkpoint, 'standing still, grounded and calm, must produce a checkpoint');
  const safe = health.checkpoint.clone();

  movement.position.set(40, 0, -30);                       // he wanders off and gets caught
  tick(health, CHARM.checkpointEvery + 0.1);
  engine.emit('damage', {});
  assert.equal(health.down, true);
  assert.equal(movement.teleports.length, 0, 'the respawn must not be instant — the hit needs a beat to read');

  tick(health, CHARM.downTime + 1 / 30);
  assert.equal(health.down, false, 'he must come back');
  assert.equal(movement.teleports.length, 1);
  assert.ok(health.invuln > 0, 'and must not appear at the checkpoint with no grace at all');
  assert.equal(health.charms, 0, 'death must not hand back a charm — dying would be the cheapest way to get one');
});

test('a checkpoint is never taken while a guard is alerted — otherwise the respawn is a death loop', async () => {
  const movement = fakeMovement(new THREE.Vector3(0, 0, 0));
  const { engine, health } = await boot({ movement });

  tick(health, CHARM.checkpointEvery + 0.1);
  const safe = health.checkpoint.clone();

  /* Chased across the level. Every one of these positions is somewhere a guard is standing over. */
  engine.emit('guardAlert', { state: 'chase', level: 1 });
  for (let i = 1; i <= 6; i++) {
    movement.position.set(i * 6, 0, i * 6);
    tick(health, CHARM.checkpointEvery + 0.1);
    engine.emit('guardAlert', { state: 'chase', level: 1 });   // still on him
  }
  assert.deepEqual(
    [health.checkpoint.x, health.checkpoint.y, health.checkpoint.z],
    [safe.x, safe.y, safe.z],
    `the checkpoint moved to ${health.checkpoint.toArray()} during a chase — respawning there drops `
    + 'him in front of the guard who just caught him, forever');

  engine.emit('damage', {});
  tick(health, CHARM.downTime + 1 / 30);
  assert.equal(movement.teleports.at(-1).pos.x, safe.x, 'and the respawn uses the calm spot');
});

test('a checkpoint is only taken with both feet down', async () => {
  const movement = fakeMovement(new THREE.Vector3(0, 0, 0));
  movement.grounded = false;
  const { health } = await boot({ movement });
  tick(health, CHARM.checkpointEvery * 3);
  assert.equal(health.checkpoint, null, 'mid-air is not a place to come back to');
  movement.grounded = true;
  tick(health, CHARM.checkpointEvery + 0.1);
  assert.ok(health.checkpoint, 'and landing makes it one');
});

test('with no movement module the whole thing degrades instead of throwing', async () => {
  /* §5 — a module that is absent must cost features, never frames. */
  const { engine, health } = await boot({ movement: null });
  tick(health, CHARM.checkpointEvery * 2);
  engine.emit('damage', {});
  tick(health, CHARM.downTime + 1 / 30);
  assert.equal(health.down, false, 'he still gets back up');
  assert.equal(health.checkpoint, null);
});

/* ──────────────────────────────────── the HUD renders it ───────────────────────────────────── */

test('the HUD pip row is the charm row: one pip per charm, plus Sly', async () => {
  const { engine, hud, health } = await boot({ withHud: true });
  const pips = () => hud.el.pips.childElementCount;
  const lit = () => [...hud.el.pips.children].filter((c) => !c.classList.contains('sly-pip-lost')).length;

  assert.equal(pips(), 1 + CHARM.maxCharms,
    `the HUD is showing ${pips()} pips for a maximum of ${CHARM.maxCharms} charms — it is still `
    + 'rendering its own placeholder five-pip bar, so the row does not mean what it draws');
  assert.equal(lit(), 1, 'carrying nothing, exactly one pip is lit');

  engine.emit('coin', { amount: CHARM.charmCoins * 2 });
  assert.equal(lit(), 1 + CHARM.maxCharms, 'two charms light the whole row');

  engine.emit('damage', {});
  assert.equal(lit(), CHARM.maxCharms, 'a hit takes exactly one pip');
  assert.equal(hud.health, health.hp, 'and the HUD number is the module\'s number, not its own');
});

test('the HUD does not deduct on a hit invulnerability refused', async () => {
  /* The §247 failure mode, pointed the other way: the HUD used to subscribe to `damage` and
     `hurt` and deduct a pip on each. Under a real publisher that is three pips for one hit, and
     — worse — a pip lost on a hit the health module already refused, because a view cannot know
     about i-frames. The pips must follow the state event and nothing else. */
  const { engine, hud } = await boot({ withHud: true });
  const lit = () => [...hud.el.pips.children].filter((c) => !c.classList.contains('sly-pip-lost')).length;
  engine.emit('coin', { amount: CHARM.charmCoins * 2 });
  const before = lit();

  engine.emit('damage', {});
  const after = lit();
  assert.equal(before - after, 1, `one hit cost ${before - after} pips`);

  engine.emit('damage', {});
  engine.emit('damage', {});
  engine.emit('damage', {});
  assert.equal(lit(), after, 'hits refused by i-frames must not move the row');
});

test('the HUD survives module init running before it', async () => {
  /* `HUD.init()` sets a placeholder full row of its own. Whether that happens before or after
     `Health.init()` depends on MANIFEST order, so the state is re-announced on the first frame
     and the ordering stops mattering. This boots them in the losing order on purpose. */
  installDom();
  const camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 500);
  camera.updateMatrixWorld(true);
  const engine = fakeEngine(camera);
  engine.get = () => null; engine.has = () => false;

  const health = new Health(engine);
  await health.init();                       // publishes into an empty bus — nobody is listening
  const { HUD } = await import('../src/ui/HUD.js');
  const hud = new HUD(engine);
  await hud.init();                          // and now paints its own placeholder

  health.update(1 / 60);
  assert.equal(hud.el.pips.childElementCount, 1 + CHARM.maxCharms,
    'the HUD kept its placeholder row — the first-frame re-announcement is not happening, so '
    + 'MANIFEST order silently decides whether the HUD tells the truth');
});

/* ─────────────────────────────── charm progress: BOTH ends of it ───────────────────────────── */

/**
 * §353. The purse existed and was correct; nothing outside this module could see it. §357.1's
 * standing failure mode here is *"machinery wired at one end only — a guard that exists is not a
 * guard that runs"*, and a publish with no consumer is exactly that, so the assertions below come
 * in pairs: what the module says, and what the row actually draws.
 *
 * Read one pip's progress stroke. `null` means the pip carries no stroke at all — a lit pip is
 * finished art, and index 0 is Sly's calling card and never a charm. The rest resolve to the
 * dash offset, which is 100 for "nothing drawn" and `100 - progress%` otherwise (`pathLength=100`
 * normalises it, the same idiom `threatEye`'s lash uses).
 *
 * The initial 100 arrives as an SVG ATTRIBUTE and the driver writes a STYLE, so both are read —
 * checking only one would make an untouched pip and a blanked pip indistinguishable.
 */
const charmArcs = (hud) => [...hud.el.pips.children].map((sp) => {
  const path = sp.querySelector('.sly-charm-fill');
  if (!path) return null;
  return Number(path.style.strokeDashoffset ?? path.getAttribute('stroke-dashoffset'));
});

test('the purse is published on every banked coin, not only on the one that completes a charm', async () => {
  /* The `_publish()` this asserts used to live inside `if (gained)`. The purse moved on every
     coin and the bus heard about it exactly twice a run — at the two instants it reset to zero —
     so a progress readout could only ever observe 0. */
  const { engine, of } = await boot();
  const before = of('health').length;

  engine.emit('coin', { amount: 1 });
  engine.emit('coin', { amount: 3 });
  engine.emit('coin', { amount: 5 });

  assert.equal(of('health').length - before, 3,
    'banking a coin that does not complete a charm published nothing — the purse is invisible '
    + 'between charms, which is every moment of the run except two');
  const p = of('health').at(-1).p;
  assert.equal(p.purse, 9, 'the published purse is the banked total');
  assert.equal(p.charmCoins, CHARM.charmCoins, 'and the price ships with it, so no consumer has to import CHARM');
  assert.equal(p.charmProgress, 9 / CHARM.charmCoins);
  assert.equal(p.hp, 1, 'and the fields that were already there are untouched');
  assert.equal(p.max, 1 + CHARM.maxCharms);
});

test('at the charm cap the published progress is −1, not a bar stuck one coin short forever', async () => {
  const { engine, health, of } = await boot();
  engine.emit('coin', { amount: CHARM.charmCoins * (CHARM.maxCharms + 4) });

  assert.equal(health.charms, CHARM.maxCharms);
  assert.equal(health.purse, CHARM.charmCoins - 1,
    'the clamp is what makes this test necessary: the purse rests one coin short at the cap');
  assert.equal(of('health').at(-1).p.charmProgress, -1,
    `the naive purse/price a consumer would compute is ${(CHARM.charmCoins - 1) / CHARM.charmCoins} `
    + 'and would sit there for the rest of the run, telling the player he is one coin from a charm '
    + 'he cannot buy. −1 means "there is no next charm", which is the fact.');

  /* And spending one makes the banked 99 mean something again — it is a real coin short of a real
     charm the moment there is a slot for it. */
  engine.emit('damage', {});
  assert.equal(health.charms, CHARM.maxCharms - 1);
  assert.equal(of('health').at(-1).p.charmProgress, (CHARM.charmCoins - 1) / CHARM.charmCoins);
});

test('CALIBRATION (must fire): the HUD redraws the charm arc when the purse moves', async () => {
  /* Two-sided on purpose. Every assertion below is "the row shows N"; if the row could not be
     moved from the bus at all they would be measuring a constant. */
  const { engine, hud } = await boot({ withHud: true });
  const before = charmArcs(hud);
  engine.emit('coin', { amount: 43 });
  assert.notDeepEqual(charmArcs(hud), before,
    'CALIBRATION FAILED — 43 coins through the bus changed nothing in the pip row, so the '
    + 'progress assertions below are vacuous. Interrogate the wiring, not the tests.');
});

test('the HUD draws the banked purse into the pip the next charm will fill', async () => {
  const { engine, hud } = await boot({ withHud: true });
  assert.deepEqual(charmArcs(hud), [null, 100, 100],
    'carrying nothing and saving nothing, both charm pips must be blank');

  engine.emit('coin', { amount: 43 });
  assert.deepEqual(charmArcs(hud), [null, 57, 100],
    '43 of 100 coins is 43% of the FIRST unlit charm pip — offset 57 — and the second must stay '
    + 'blank, because you are not saving toward two charms at once');

  engine.emit('coin', { amount: 20 });
  assert.deepEqual(charmArcs(hud), [null, 37, 100], 'and it tracks upward with the purse');

  /* Completing it moves the mark along: pip 1 becomes finished art with no stroke at all, and
     the 3 coins of change start pip 2. */
  engine.emit('coin', { amount: 40 });
  assert.deepEqual(charmArcs(hud), [null, null, 97],
    'the completed charm must stop being a progress bar and become a charm');
});

test('the HUD draws no charm arc at the cap — a full row is not 99% of anything', async () => {
  const { engine, hud } = await boot({ withHud: true });
  engine.emit('coin', { amount: CHARM.charmCoins * CHARM.maxCharms });
  assert.deepEqual(charmArcs(hud), new Array(1 + CHARM.maxCharms).fill(null),
    'every pip is lit, so there is no pip left to draw progress on and nothing that could');
});

test('spending a charm moves the arc down the row and does not leave a second one behind', async () => {
  /* The specific defect a remembered target element would have: `setHealth` repaints only pips
     whose lit state CHANGED, so the pip the mark moves off is never repainted and keeps whatever
     was drawn on it. Two charms in progress at once, from one hit. */
  const { engine, hud, health } = await boot({ withHud: true });
  engine.emit('coin', { amount: CHARM.charmCoins + 60 });
  assert.equal(health.charms, 1);
  assert.deepEqual(charmArcs(hud), [null, null, 40], '60 coins toward the second charm');

  engine.emit('damage', {});
  assert.equal(health.charms, 0, 'the hit cost the charm, not the purse');
  assert.deepEqual(charmArcs(hud), [null, 40, 100],
    'the 60 banked coins now buy back the FIRST charm, and pip 2 must have been blanked — a '
    + 'stale arc there would show two charms being saved for with one purse');
});

test('a payload from an older Health.js draws no arc rather than a wrong one', async () => {
  /* `charmProgress` absent must not be read as 0 (an empty bar the player is not owed) nor as
     NaN. The HUD floors anything non-finite to "no next charm" and draws nothing. */
  const { engine, hud } = await boot({ withHud: true });
  engine.emit('coin', { amount: 43 });
  assert.deepEqual(charmArcs(hud), [null, 57, 100]);
  engine.emit('health', { hp: 1, max: 3, charms: 0, down: false });
  assert.deepEqual(charmArcs(hud), [null, 100, 100]);
});

/* ──────────────────────────────────── the wiring, in source ────────────────────────────────── */

test('nothing else in src/ decides how much a hit costs', async () => {
  /* The census guarantees `damage` has a publisher and a subscriber. It cannot guarantee there is
     only ONE subscriber, and a second one — a HUD deducting a pip, an FX module counting hits —
     is precisely how the original defect got in. */
  const SRC = new URL('../src/', import.meta.url).pathname;
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const walk = (d, out = []) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, out); else if (n.endsWith('.js')) out.push(p);
    }
    return out;
  };
  const subs = walk(SRC).filter((f) => /\bon\(\s*['"`]damage['"`]/.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(SRC.length));
  assert.deepEqual(subs, ['player/Health.js'],
    `\`damage\` is subscribed in ${subs.join(', ')}. It is a REQUEST to hurt the player and only `
    + 'the health module may decide whether it lands; a second subscriber will disagree with it '
    + 'the first time a hit is refused.');
});

test('a staged capture frame cannot be hit', async () => {
  /* `Debug.setShot` teleports the subject, freezes his pose and runs 17 settle frames with the
     guards still updating. A guard within `attackRange` of a shot's player position would now land
     a swing during those frames, and `hurt` sets a velocity and requests a state — so the frame
     would render a knocked-back Sly instead of the pose the shot asked for, differently depending
     on where the guard happened to be. Four agents score frames against each other; a gameplay
     feature must not make their captures stop reproducing.

     Asserted with the flag BOTH ways, so this cannot pass by the hit having been refused for some
     unrelated reason. */
  const { engine, health } = await boot();
  health.addCharm(2);

  engine.debug.freeCam = true;                 // exactly what setShot sets, until clearShot
  engine.emit('damage', { source: 'guard' });
  assert.equal(health.charms, 2, 'a guard landed a hit during a staged capture frame');
  assert.equal(health.hits, 0, 'and it was not even counted as a hit');

  engine.debug.freeCam = false;                // clearShot returns the camera to gameplay
  engine.emit('damage', { source: 'guard' });
  assert.equal(health.charms, 1, 'and back in gameplay the very same hit must land');
});

/* ─────────────────────────── the guards' half: a swing that can miss ───────────────────────── */

const GUARD_SRC = readFileSync(new URL('../src/ai/Guard.js', import.meta.url), 'utf8');

/**
 * Run the real `_resolveSwing` source against a stub guard.
 *
 * The individual `Guard` class is not exported — only the `Guards` module is — and booting that
 * needs models, a collision world and a scene. So the method is lifted out of the shipped source
 * and executed, which is `pickups.test.mjs`'s `evalReader` trick: it is the actual code, not a
 * paraphrase of it, so deleting a guard clause inside it turns these red.
 */
function resolveSwingWith(guard) {
  const m = /\n {2}_resolveSwing\(\)\s*\{\n([\s\S]*?)\n {2}\}\n/.exec(GUARD_SRC);
  assert.ok(m, '`_resolveSwing` is no longer in src/ai/Guard.js in a form this test can extract');
  const STATE = { KO: 'ko', STUNNED: 'stunned' };
  const DETECT = { attackRange: 2.6, attackReach: 1.15, attackKnock: 9.5 };
  const _v3 = new THREE.Vector3();
  // eslint-disable-next-line no-new-func
  const fn = new Function('STATE', 'DETECT', '_v3', `return function () {\n${m[1]}\n};`)(STATE, DETECT, _v3);
  return fn.call(guard);
}

const stubGuard = (playerAt, { state = 'chase', at = new THREE.Vector3() } = {}) => {
  const emitted = [];
  return {
    state, position: at, id: 'g7', type: 'temple', _swing: 0.0001,
    owner: { playerPos: playerAt },
    engine: { emit: (evt, p) => emitted.push({ evt, p }) },
    /* §588.1's vertical reach band, mirrored here for exactly the reason `DETECT` above is: the
       extracted method only sees what this harness hands it, so a sibling it calls has to be
       provided or the lift throws. Faithful to the shipped one rather than a pass-through — a
       stub that always returned true would let the band be deleted from `Guard.js` without
       anything here noticing, which is the opposite of what this file is for. The numbers are the
       temple guard's own `headTop` 1.95 and MOVEMENT's 1.80 standing capsule. */
    _inSwingBand(y) { const dy = y - this.position.y; return dy <= 1.95 && dy >= -1.80; },
    emitted,
  };
};

test('CALIBRATION (must fire): a guard standing over the player does land his swing', async () => {
  const g = stubGuard(new THREE.Vector3(1, 0, 0));
  assert.equal(resolveSwingWith(g), true);
  assert.equal(g.emitted.length, 1, 'CALIBRATION FAILED — the extracted swing emits nothing at all');
  assert.equal(g.emitted[0].evt, 'damage');
  assert.equal(g.emitted[0].p.source, 'guard');
  assert.equal(g.emitted[0].p.dir.x, 1, 'the knockback points from the guard to the player');
});

test('a swing the player walked out of does not land', async () => {
  /* The telegraph is the mechanic. With one hit costing a charm or the run, an attack that cannot
     be avoided is not a stealth game's guard, it is a damage aura. */
  const reach = 2.6 * 1.15;
  const inside = stubGuard(new THREE.Vector3(reach - 0.05, 0, 0));
  assert.equal(resolveSwingWith(inside), true, 'just inside the reach must connect');
  const outside = stubGuard(new THREE.Vector3(reach + 0.05, 0, 0));
  assert.equal(resolveSwingWith(outside), false);
  assert.equal(outside.emitted.length, 0, 'a guard whose target left the reach must emit no damage');
});

test('a swing the player climbed out of does not land either (§588.1)', async () => {
  /* The vertical twin of the arm above, and it exists because the vertical case was missing for
     the whole project: both reach tests flattened `y` to zero, so the range check was a cylinder
     of unbounded height and a guard on the hypostyle floor was inside range of a player anywhere
     up the 16 m nave rope. Driven, the live run left that rope at y 10.24 into `hurt`.

     Leaving the reach upward is a thing the player can do, exactly like walking out of it, so it
     belongs beside it. The band is the guard's own body — floor to `headTop` — so the boundary
     here is 1.95 for a temple guard rather than a number chosen for the test. */
  const at = new THREE.Vector3();
  const under = stubGuard(new THREE.Vector3(0.5, 1.90, 0), { at });
  assert.equal(resolveSwingWith(under), true,
    'a player 1.90 m up — inside a temple guard\'s 1.95 m headTop — must still be hit; the band must '
    + 'not make anyone standing on a low block invulnerable');
  const above = stubGuard(new THREE.Vector3(0.5, 2.00, 0), { at });
  assert.equal(resolveSwingWith(above), false, 'a player just above headTop must not be hit');
  const climbed = stubGuard(new THREE.Vector3(0.5, 10.24, 0), { at });
  assert.equal(resolveSwingWith(climbed), false,
    'a guard on the floor still reached a climber at y 10.24 — the reported defect exactly');
  assert.equal(climbed.emitted.length, 0, 'a guard whose target climbed out of reach must emit no damage');
});

test('a guard knocked out or stunned mid-swing does not still connect', async () => {
  for (const state of ['ko', 'stunned']) {
    const g = stubGuard(new THREE.Vector3(1, 0, 0), { state });
    assert.equal(resolveSwingWith(g), false, `a ${state} guard connected`);
    assert.equal(g.emitted.length, 0);
  }
});

test('the guard emits damage in exactly one place, and it is not where the swing starts', async () => {
  /* The wind-up is worthless if a second site fires on contact. This pins the count rather than
     the text, so any new publisher in this file has to be a deliberate edit here too. */
  const sites = [...GUARD_SRC.matchAll(/emit\(\s*['"`]damage['"`]/g)];
  assert.equal(sites.length, 1, `Guard.js emits \`damage\` in ${sites.length} places; the wind-up only governs one`);
  const resolveAt = GUARD_SRC.indexOf('_resolveSwing() {');
  const endAt = GUARD_SRC.indexOf('/* --- locomotion', resolveAt);
  assert.ok(resolveAt > 0 && sites[0].index > resolveAt && sites[0].index < endAt,
    'the `damage` emit is outside `_resolveSwing` — it fires on the frame the animation starts, '
    + 'which is a hit the player was never given a chance to avoid');
  assert.match(GUARD_SRC, /this\._swing = DETECT\.attackWindup;/,
    'the attack branch no longer starts a timed swing');
});

test('the amount is read and discarded on purpose, and says so', () => {
  /* A guard on the comment rather than the code, because the next person to touch this file will
     see `p.amount` unused and "fix" it. If the explanation goes, this goes red. */
  assert.match(HEALTH_SRC, /amount[\s\S]{0,400}?hit-point bar/,
    'the note explaining why `amount` is ignored has gone — without it, scaling damage by amount '
    + 'looks like an obvious bug fix rather than the end of the design');
});
