import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every event subscribed to in `src/` must be published somewhere in `src/`, and vice versa.
 *
 * This is the test §239 proposed and did not write. It is written now because the same defect has
 * appeared **three times in one session**, and each time it was found by accident:
 *
 *   · `coin` had three subscribers — `Particles.js`, `HUD.js`, `Audio.js` — and no publisher. The
 *     coin burst, the coin counter and the coin chime were all built, all correct, and all dead.
 *     Found by the FX agent while budgeting emitters (§239).
 *   · `guardPickpocket` was the mirror image: `Guard.pickpocket()` rolled real loot from a real
 *     table and emitted it to **nobody**, while the HUD paid a flat 25 on the unrelated *intent*
 *     event — which is why mashing E in an empty courtyard minted money (§247).
 *   · `playerState`, `ledgeGrab`, `hookGrab`, `hookRelease` and `enemyBounce` were all emitted into
 *     nothing until the FX agent subscribed them. The "missing" skid dust and rail sparks were not
 *     missing features; they were unheard events (§237).
 *
 * **An event bus cannot fail loudly.** A publisher with no subscriber and a subscriber with no
 * publisher both compile, both run, both pass every existing test, and both warn nobody. There is no
 * import to break and no type to mismatch. The only thing that can catch it is a census, and a
 * census costs milliseconds.
 *
 * ── Why an exact set rather than "must be empty" ────────────────────────────────────────────────
 * **Seventeen** live dead ends exist right now — 11 subscriptions with no publisher, 6 publications
 * with no subscriber — and several are not one-line fixes. The HUD's health pips have no publisher
 * because **the player has no health system at all**. Asserting "empty" would land permanently red
 * and be ignored within a day. So this follows `tests/api.test.mjs`'s pattern: pin the exact set and
 * fail in BOTH directions. A new dead end turns it red; fixing one also turns it red, telling
 * whoever fixed it to delete the line rather than leave a stale exception behind.
 *
 * The lists are a defect register, not a permission.
 *
 * ── This scrape lied three times before it was trustworthy ──────────────────────────────────────
 * Each draft produced a confident, plausible, wrong answer, and each would have sent someone to
 * "fix" working code:
 *
 *   1. `\bemit\(` — the word boundary refuses to cross an underscore, so `Pickups.js`'s
 *      `this._emit('coin', …)` wrapper was invisible and `coin`, `coins` and `toast` were reported
 *      as unpublished. Three accusations against correct code.
 *   2. any `…emit(` — swung the other way and swallowed `Particles.js`'s `_emit(name, pos, opts)`,
 *      which is a **particle spawner**, not a bus call. Thirty recipe names — `cane_arc`,
 *      `coin_sparkle`, `dive_dust` — appeared as events nothing listens to.
 *   3. excluding `this.emit` — but **`Engine` IS the bus** (`core/Engine.js:180`), and publishes
 *      `resize` and `quality` through exactly that form. Seven modules' subscriptions looked orphaned.
 *
 * The resolutions are in `PUB_DIRECT` and `wrapperIsBus` below. The general point is worth more than
 * the regexes: **a census that cries wolf is worse than no census**, because someone acts on it. The
 * tempting repair each time was to add the offending names to an exception list until the output
 * looked sensible — which fits the instrument to the answer and destroys the only thing it was for.
 * Each was instead fixed by making the scrape understand what the code actually does.
 */

const SRC = new URL('../src/', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * `engine.emit('x')`, `this.emit('x')`, or a bare destructured `emit('x')`.
 *
 * `this.emit` is here because **`Engine` IS the bus** — `src/core/Engine.js:180` defines `emit`, and
 * publishes `resize` and `quality` through it. Excluding it (a negative lookbehind on `.`) made five
 * modules' `quality` subscription and two modules' `resize` subscription look orphaned. That was the
 * third distinct way this scrape produced a confident, wrong answer; see `wrapperIsBus` below.
 */
const PUB_DIRECT = /(?:\bengine\.emit|\bthis\.emit|(?<![\w.])emit)\(\s*['"`]([A-Za-z][\w:.-]*)['"`]/g;
/** `this._emit('x')` — a wrapper, which counts ONLY in files where the wrapper forwards to the bus. */
const PUB_WRAPPED = /\bthis\._emit\(\s*['"`]([A-Za-z][\w:.-]*)['"`]/g;
/** `on('x', …)` — the engine bus subscription form used throughout `src/`. */
const SUB = /\bon\(\s*['"`]([A-Za-z][\w:.-]*)['"`]/g;

/**
 * Does this file's `_emit` forward to the engine bus, or is it something else entirely?
 *
 * **This distinction is the whole reason the census is trustworthy, and getting it wrong is how the
 * first two drafts both lied.** Draft one matched `\bemit\(`, which refuses to cross the underscore,
 * so `Pickups.js`'s `_emit('coin', …)` wrapper was invisible and `coin`, `coins` and `toast` were
 * all reported as unpublished — three accusations against working code. Draft two matched any
 * `…emit(` and swung the other way: `Particles.js`'s `_emit(name, position, opts)` is a **particle
 * spawner**, not a bus call, so `cane_arc`, `coin_sparkle`, `dive_dust` and thirty more recipe names
 * were reported as events nothing listens to.
 *
 * Both drafts produced a plausible list of "defects" that were not defects. A census that cries wolf
 * is worse than no census, because someone will act on it — the wrong instinct here is to add
 * exceptions until the list looks right, which fits the instrument to the answer.
 *
 * So the wrapper is resolved by *reading what it does*: `_emit` counts as a publisher only if its
 * body reaches `engine.emit`. `Pickups._emit` does (`this.engine.emit(evt, payload)`); `Particles._emit`
 * does not. No per-file exception list, and a new module that writes its own forwarder is handled
 * with no edit here.
 */
function wrapperIsBus(text) {
  const m = /_emit\s*\([^)]*\)\s*\{([\s\S]{0,400}?)\n\s{0,4}\}/.exec(text);
  return !!m && /engine\.emit\(/.test(m[1]);
}

const files = walk(SRC);
const published = new Map();
const subscribed = new Map();
let wrapperFiles = 0;

for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const rel = f.slice(SRC.length);
  const add = (map, k) => {
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(rel);
  };
  for (const m of text.matchAll(PUB_DIRECT)) add(published, m[1]);
  if (wrapperIsBus(text)) {
    wrapperFiles++;
    for (const m of text.matchAll(PUB_WRAPPED)) add(published, m[1]);
  }
  for (const m of text.matchAll(SUB)) add(subscribed, m[1]);
}

const where = (m, k) => [...(m.get(k) || [])].join(', ');

/**
 * Subscribed, never published. **Every line here is a feature that cannot fire.**
 *
 *   binocucom         the Binocucom is abandoned as a goal by owner instruction (§242), so this
 *                     pair is expected to stay dead. Listed, not excused.
 *   clue              Audio has a sting for finding a clue. Nothing in the game is a clue.
 *   damage, health    THE PLAYER HAS NO HEALTH SYSTEM. There is no `takeDamage`, no health state
 *                     anywhere in `src/player/` or `src/ai/`, so the HUD's health pips display a
 *                     number nothing can ever change. The guards can chase, catch and alert, and
 *                     none of it can hurt him. This is the largest single gap the census found.
 *   hurt              `Controller.js:374` subscribes and `Controller.js:561` calls `this.hurt()`
 *                     directly, so the *mechanic* works internally — the event is a hook offered to
 *                     the rest of the game that nothing ever uses.
 *   guardLost         Audio listens for three guard events that do not exist. The guards publish
 *   guardSound        `guardAlert` (plus `guardPickpocket`, `enemyBounce`, `shake`), and the audio
 *   guardSpotted      agent rebuilt its ladder on `guardAlert` — these three are the legacy names,
 *                     left subscribed. Stale listeners, not missing publishers.
 *   objective         the HUD renders an objective card; nothing ever sets an objective.
 *   prompt            contextual "press E to …" prompts. NOTE `HUD.js:383` sets `_sawPrompt` on the
 *                     first one and *permanently* retires its affordance-detection fallback, so the
 *                     first module to publish this silently kills every contextual verb in the game.
 *                     Publishing it is not a one-line change.
 *   unregisterTarget  `Controller.js` can drop a magnetism target; nothing ever asks it to. The
 *                     `registerTarget` counterpart IS published (§223), so this is half a pair.
 */
const DEAD_SUBSCRIPTIONS = [
  'binocucom', 'clue', 'damage', 'guardLost', 'guardSound', 'guardSpotted',
  'health', 'hurt', 'objective', 'prompt', 'unregisterTarget',
];
if (DEAD_SUBSCRIPTIONS.length !== 11) throw new Error('DEAD_SUBSCRIPTIONS miscounted');

/**
 * Published, never subscribed. Each is a fact the game states that nothing listens to.
 *
 *   binocucomState  emitted by the HUD; abandoned as a goal (§242).
 *   paused          the HUD announces pause state and no module reacts to it. Audio does not duck,
 *                   FX do not freeze, the guards do not stop hearing.
 *   land            `Animation.js` announces a landing and nothing listens. FX drives its landing
 *                   dust off `playerState` instead, so this is a second, unused channel for the
 *                   same fact rather than a missing effect.
 *   treasureBanked  all three are `Pickups.js`'s brand-new fence economy (§246), emitted correctly
 *   treasureDropped and heard by nobody yet. The HUD should react to banking a treasure and to
 *   treasurePickup  dropping one under CHASE; that is the loot agent's own open item, and these
 *                   three lines are what will turn red when it is closed.
 */
const DEAD_PUBLICATIONS = ['binocucomState', 'land', 'paused',
  'treasureBanked', 'treasureDropped', 'treasurePickup'];

test('eventbus: the census inspected a real codebase', () => {
  /* §211.1 — every assertion below is a set comparison. If the scrape found nothing they would all
     pass having inspected nothing, which is exactly how nine assertions once passed while reading a
     field that did not exist. Assert the subject exists first. */
  assert.ok(files.length > 50, `only ${files.length} source files walked`);
  assert.ok(published.size > 40, `only ${published.size} distinct events published`);
  assert.ok(subscribed.size > 40, `only ${subscribed.size} distinct events subscribed`);
  /* The wrapper resolution must still work in BOTH directions, or one of the two lying drafts
     returns. `Pickups._emit` forwards to the bus and must be counted; `Particles._emit` spawns
     particles and must not be, or thirty recipe names reappear as phantom dead events. */
  assert.ok(wrapperFiles >= 1, 'no file was recognised as owning a bus-forwarding `_emit` wrapper');
  assert.ok(published.has('coin'), 'the scrape no longer sees `_emit(\'coin\')` — the wrapper form regressed');
  assert.ok(!published.has('cane_arc') && !published.has('dive_dust'),
    'particle recipe names are being counted as bus events again — `Particles._emit` is a spawner');
  assert.ok(published.has('guardPickpocket') && subscribed.has('guardPickpocket'),
    '§247 wired guardPickpocket end to end; the census should see both halves');
});

test('eventbus: no NEW subscription without a publisher', () => {
  const dead = [...subscribed.keys()].filter((k) => !published.has(k)).sort();
  assert.deepEqual(dead, [...DEAD_SUBSCRIPTIONS].sort(),
    'events subscribed in src/ that nothing in src/ ever emits:\n'
    + dead.map((k) => `  ${k} <- ${where(subscribed, k)}`).join('\n')
    + '\n\nIf you FIXED one, delete it from DEAD_SUBSCRIPTIONS — a stale exception is worse than none.');
});

test('eventbus: no NEW publication without a subscriber', () => {
  const dead = [...published.keys()].filter((k) => !subscribed.has(k)).sort();
  assert.deepEqual(dead, [...DEAD_PUBLICATIONS].sort(),
    'events emitted in src/ that nothing in src/ ever listens for:\n'
    + dead.map((k) => `  ${k} -> ${where(published, k)}`).join('\n')
    + '\n\nIf you WIRED one, delete it from DEAD_PUBLICATIONS.');
});

test('eventbus: the three events this census exists because of are all live', () => {
  /* The regression guard proper. Each of these was a silent dead end found by accident, and each
     cost real work to trace back from a symptom. They must never go dead again quietly. */
  for (const evt of ['coin', 'guardPickpocket', 'guardAlert', 'playerState',
    'ledgeGrab', 'hookGrab', 'hookRelease', 'enemyBounce']) {
    assert.ok(published.has(evt), `'${evt}' has no publisher — it went dead again (${where(subscribed, evt)} still listens)`);
    assert.ok(subscribed.has(evt), `'${evt}' has no subscriber — it fires into nothing again (${where(published, evt)} still emits)`);
  }
});
