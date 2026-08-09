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
 * ── Two buckets, because "no publisher" means two completely different things ───────────────────
 *
 * The first version of this file had one list, and a single list of subscriptions-without-a-
 * publisher reads as a **to-do list**. It is not one. Four of its eight entries are dead because
 * somebody decided they should be, and "close the gap" is the wrong action on every one of them:
 * the Binocucom was abandoned by owner instruction, and three of the guard events are legacy names
 * that were *replaced*. A census that demands a publisher for every subscriber is an instruction to
 * implement cancelled features, which is §248's own cries-wolf failure wearing a new hat — and the
 * agent who wrote the health system was pointed at this list and had to be told, out of band, not
 * to wire the Binocucom while it was there.
 *
 * So `DEAD_BY_DECISION` is not merely tolerated, it is **enforced in the other direction**: if
 * something ever starts publishing one of these, the census goes RED and names the decision. That
 * is the part a prose comment cannot do. `DEAD_UNBUILT` is the real to-do list, and it is short.
 */

/**
 * Dead on purpose. Each line carries the decision and where it is recorded. **Do not publish
 * these.** A publisher appearing for one of them fails `no ABANDONED event is quietly revived`.
 *
 *   binocucom      **Owner instruction, 2026-08-08: "Abandon the Binocucom goal for this project"**
 *                  (§242). The existing implementation was deliberately NOT deleted — §242 reasons
 *                  that "abandon the goal" is not "remove the code", and that deleting working code
 *                  is the destructive reading of an ambiguous phrase. So the subscription staying
 *                  here is the correct end state, not a loose end. `binocucomState`, its mirror
 *                  image, sits in `DEAD_PUBLICATIONS` for the same reason.
 *   guardLost      Superseded, not missing. The guards publish `guardAlert` with a `state`, and the
 *   guardSound     audio agent rebuilt its whole ladder on it (§219). These three are the names it
 *   guardSpotted   used before that, still subscribed in `Audio.js:1240-1242`. Publishing them would
 *                  give the audio ladder two disagreeing sources of truth. The right fix is to
 *                  delete the three listeners, which is an `Audio.js` change with an owner.
 */
const DEAD_BY_DECISION = ['binocucom', 'guardLost', 'guardSound', 'guardSpotted'];

/**
 * Dead because nobody has built the other half yet. **This** is the to-do list.
 *
 *   clue              `Audio.js:1252` has a sting for finding a clue. Nothing in the game is a clue.
 *   objective         the HUD renders an objective card and `HUD.init` sets the only one that ever
 *                     appears, by direct call. The event is the hook a mission script would use.
 *   prompt            contextual "press E to …" prompts, and a trap. `HUD.js:383` sets `_sawPrompt`
 *                     on the first one and *permanently* retires its affordance-detection fallback,
 *                     so **the first module to publish this silently kills every contextual verb in
 *                     the game**. Publishing it is not a one-line change.
 *   unregisterTarget  `Controller.js:378` can drop a magnetism target; nothing ever asks it to. The
 *                     `registerTarget` counterpart IS published (§223), so this is half a pair.
 *
 * ── Three lines were deleted from here, which is what fixing one looks like ─────────────────────
 * `damage`, `health` and `hurt` were the largest entry the census ever produced: **the player had
 * no health system at all**, so the HUD's pip row, hit flash, vignette punch and shake were wired
 * to a number nothing could move, and the guards' whole alert ladder ended in an animation. That is
 * closed — `src/player/Health.js` owns the state, guards and hazards publish `damage`, the
 * Controller still takes `hurt`, and the HUD renders `health`. See `tests/health.test.mjs`.
 *
 * They are **deleted, not commented out and not moved to a "fixed" list**, because this file fails
 * in both directions: a live event left in either list turns the census red just as a new dead end
 * does. That is the property that makes the register worth trusting, and the only way to keep it is
 * to actually delete lines when they stop being true.
 */
const DEAD_UNBUILT = ['clue', 'objective', 'prompt', 'unregisterTarget'];

const DEAD_SUBSCRIPTIONS = [...DEAD_BY_DECISION, ...DEAD_UNBUILT];
if (DEAD_SUBSCRIPTIONS.length !== 8) throw new Error('DEAD_SUBSCRIPTIONS miscounted');
if (DEAD_BY_DECISION.some((k) => DEAD_UNBUILT.includes(k))) throw new Error('an event is in both buckets');

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
    + '\n\nA new line here is NOT automatically a gap to close. Decide which it is and put it in the\n'
    + 'matching list:\n'
    + '  DEAD_UNBUILT      the other half has not been written yet. This is the to-do list.\n'
    + '  DEAD_BY_DECISION  it is dead because somebody decided so — abandoned, or superseded by a\n'
    + '                    newer event. Record the decision and where it is written down. Publishing\n'
    + '                    one of these is a FAILURE, not a fix.\n'
    + 'If you FIXED one, delete it — a stale exception is worse than none.');
});

test('eventbus: no ABANDONED event is quietly revived', () => {
  /* The half a single flat list cannot express. Everything above says "these have no publisher and
     that is expected"; this says "and giving them one is wrong". Without it the census reads as a
     backlog, and the next agent handed the failure output closes the Binocucom's `binocucom` /
     `binocucomState` pair in good faith against an explicit owner instruction to stop (§242) — or
     revives `guardSpotted` alongside `guardAlert` and gives the audio ladder two disagreeing
     sources of truth. Both are one small, reasonable-looking commit away.

     §211.1: assert the events are really in the corpus first, or this passes by inspecting nothing
     the day one of them is renamed. */
  for (const evt of DEAD_BY_DECISION) {
    assert.ok(subscribed.has(evt),
      `'${evt}' is no longer subscribed anywhere in src/. If the listener was deleted — which for `
      + 'the guard trio is the right fix — delete it from DEAD_BY_DECISION too.');
    assert.ok(!published.has(evt),
      `'${evt}' now has a publisher in ${where(published, evt)}, and it is dead ON PURPOSE.\n`
      + '  binocucom / binocucomState — abandoned by owner instruction, 2026-08-08 (§242).\n'
      + '  guardLost / guardSound / guardSpotted — legacy names; the guards publish `guardAlert`\n'
      + '  and Audio\'s ladder is built on it. A second source of truth is not an improvement.\n'
      + 'If the decision has genuinely been reversed, move the line out of DEAD_BY_DECISION and say '
      + 'so in the commit; do not delete this assertion.');
  }
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
    'ledgeGrab', 'hookGrab', 'hookRelease', 'enemyBounce',
    /* And the three that were the largest dead end this census ever found. They are here rather
       than merely absent from `DEAD_SUBSCRIPTIONS` because absence is a weak claim: deleting a
       whole health system would empty both sides at once and the set comparison above would go
       green on it. This says they must be live, in both directions, by name. */
    'damage', 'health', 'hurt']) {
    assert.ok(published.has(evt), `'${evt}' has no publisher — it went dead again (${where(subscribed, evt)} still listens)`);
    assert.ok(subscribed.has(evt), `'${evt}' has no subscriber — it fires into nothing again (${where(published, evt)} still emits)`);
  }
});
