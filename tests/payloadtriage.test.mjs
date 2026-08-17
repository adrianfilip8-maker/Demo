import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SFX } from '../src/audio/Sfx.js';

/**
 * The 25 unread payload fields, triaged — and the bar that keeps the triage honest.
 *
 * ── Why this file exists ───────────────────────────────────────────────────────────────────
 * §428.4 censused every field published on the bus and read by no subscriber: 25, across 16
 * events. §429 fixed the one that was a real dropped feature (`caneSlam.material`). The other 24
 * are **not one thing**, and the whole risk of holding that list is that a later reader treats it
 * as a to-do: "here are 24 fields nobody reads, wire them up." Four of them look exactly like
 * `caneSlam.material` from the name and are not, and the difference is only visible by opening
 * the consumer.
 *
 * So the triage is asserted here rather than written down, in the two places it could rot:
 *   · the fields listed as unread must still BE unread — otherwise the list is stale and someone
 *     may "fix" what has already been fixed;
 *   · the reason each REJECTED candidate was rejected must still hold — and every one of those
 *     reasons is a fact about the consumer, which is the half a payload census cannot see.
 *
 * ── §418.3 / §418.9 ────────────────────────────────────────────────────────────────────────
 * Each arm names an input it passes on and one it fails on, and every counterexample runs in-arm.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ============================================================================================
   1. the four that look like caneSlam.material and are not
============================================================================================ */

test('T1 `jumped.v0` cannot be wired: the `jump` cue does not read `force`', () => {
  /**
   * The strongest-looking candidate in the list, and the one that proves the triage needed doing
   * rather than reading. `landed` carries `force` and BOTH its consumers scale by it — AUDIO
   * plays `land_hard` at `force: f / 9`, FX sizes `_onLand` by it. Jumps carry `v0`, publish it,
   * and AUDIO plays a flat `this.play('jump', { position: p?.pos })`. Every jump sounds identical
   * and the launch speed is right there.
   *
   * **And wiring it would change nothing.** `SFX.jump.build` never reads `o.force`. The generic
   * `force` parameter exists on `play()`, but a recipe has to consult it, and only `land_hard`
   * does. Making a jump scale with its launch would mean authoring a new recipe — the thing this
   * round was told not to do — not reading a dropped field.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: the shipped catalogue — `land_hard` reads `force`, `jump` does not.
   * FAILS ON:  RUN in-arm — the same predicate against `land_hard`, which must come out true.
   *            Without that half, "jump ignores force" is satisfied by a broken predicate that
   *            says no to everything.
   */
  const readsForce = (n) => /\bforce\b/.test(String(SFX[n]?.build ?? ''));
  assert.equal(readsForce('jump'), false,
    'the `jump` cue now reads `force`, so `jumped.v0` HAS a consumer mechanism and has been ' +
    'reclassified — it belongs in the "real dropped feature" bucket, not this one');
  assert.equal(readsForce('land_hard'), true,
    'no cue in the catalogue reads `force` any more, so this predicate cannot distinguish ' +
    'anything and T1 proves nothing');

  /* And the asymmetry that made it look like a candidate is real, not imagined. */
  const AUDIO = strip(SRC('src/audio/Audio.js'));
  assert.ok(/land_hard.*force:/s.test(AUDIO), 'AUDIO no longer scales a landing by its force');
  assert.ok(/on\('jumped',\s*\(p\)\s*=>\s*this\.play\('jump',\s*\{\s*position:[^}]*\}\)\)/.test(AUDIO),
    'the `jumped` handler has changed shape; re-triage `v0` rather than trusting this arm');
});

test('T2 `hookRelease.vel` and `targetJump.vy` have no consumer curve either', () => {
  /**
   * Same test, same answer, and one extra reason for `vel`.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: `rope_creak` (hookRelease's cue) does not read `force`; `dive_boom` does not
   *            either, which is why §429 layered a material transient under it rather than
   *            scaling it.
   * FAILS ON:  RUN in-arm — `land_hard` again, the one cue that does.
   */
  const readsForce = (n) => /\bforce\b/.test(String(SFX[n]?.build ?? ''));
  for (const n of ['rope_creak', 'dive_boom']) {
    assert.equal(readsForce(n), false, `${n} now reads force — re-triage the field that feeds it`);
  }
  assert.equal(readsForce('land_hard'), true, 'the predicate has stopped discriminating');

  /* `vel` carries a second, independent reason it is not a one-line wire-up: it is published as
     a LIVE reference to the controller's own velocity vector, so any consumer must copy before
     any deferred read. §237's aliasing trap, and AUDIO defers (`play` schedules). */
  const MOVESET = strip(SRC('src/player/Moveset.js'));
  assert.ok(/emit\('hookRelease',\s*\{\s*pos:\s*c\.position,\s*vel:\s*c\.velocity\s*\}\)/.test(MOVESET),
    'hookRelease no longer publishes the live vectors this note is about');
});

/* ============================================================================================
   2. the redundant ones — the information already reaches the consumer
============================================================================================ */

test('T3 `health.charms` is redundant: the pip row already IS the charm count', () => {
  /**
   * The clearest case of a name inviting a wrong fix. "The HUD never shows how many charms you
   * have" is false: `Health.hp` is **`this.down ? 0 : 1 + this.charms`**, and the HUD draws `hp`
   * as pips. The count has been on screen the whole time; the field is a second way to say it.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: the shipped getter — `hp` is derived from `charms`.
   * FAILS ON:  RUN in-arm — the same regex against a copy with the getter rewritten to a stored
   *            field, which is the world in which `charms` would stop being redundant.
   */
  const HEALTH = strip(SRC('src/player/Health.js'));
  const re = /get hp\(\)\s*\{[^}]*this\.charms[^}]*\}/;
  assert.ok(re.test(HEALTH),
    '`hp` is no longer derived from `charms`. The pip row has stopped being the charm count and ' +
    '`health.charms` is no longer redundant — re-triage it.');
  assert.ok(!re.test(HEALTH.replace(/get hp\(\)\s*\{[^}]*\}/, 'get hp() { return this._hp; }')),
    'the counterexample no longer breaks the derivation, so this arm has stopped discriminating');
});

test('T4 the documented-redundant fields carry their reason at the publisher', () => {
  /**
   * §429's rule: **a published field should be read, or carry a line saying why it is not.**
   * `damage.amount` was the only one of the 25 already in that shape. These four publishers now
   * are too, and this arm is what stops the comments being deleted as noise by someone who reads
   * "unread field" as "dead code".
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: the shipped tree — each publish site names §430 next to the unread field.
   * FAILS ON:  RUN in-arm — the same scan with the comments stripped, which is exactly the state
   *            these files were in before this round and finds none of them.
   */
  const sites = [
    ['src/core/Engine.js', "emit('resize'"],
    ['src/world/Pickups.js', "_emit('clue'"],
    ['src/world/Pickups.js', "_emit('treasureBanked'"],
    ['src/player/Targets.js', "emit('targetLocked'"],
    ['src/player/Targets.js', "emit('targetReleased'"],
    ['src/player/Targets.js', "emit('targetReached'"],
  ];
  let documented = 0;
  for (const [file, anchor] of sites) {
    const raw = SRC(file);
    const i = raw.indexOf(anchor);
    assert.ok(i > 0, `${anchor} is gone from ${file}`);
    /* The 700 characters before the publish site — the comment block attached to it. */
    const before = raw.slice(Math.max(0, i - 700), i);
    assert.ok(/§430/.test(before),
      `${file} publishes ${anchor} with no note saying which of its fields nothing reads. ` +
      'That is the state §428.4 found the whole bus in.');
    documented++;
  }
  assert.equal(documented, sites.length);

  /* The counterexample, run: with comments stripped, not one site is documented. */
  let survived = 0;
  for (const [file, anchor] of sites) {
    const s = strip(SRC(file));
    const i = s.indexOf(anchor);
    if (i > 0 && /§430/.test(s.slice(Math.max(0, i - 700), i))) survived++;
  }
  assert.equal(survived, 0,
    'the §430 notes survive comment-stripping, so this arm is matching code rather than the ' +
    'documentation it is meant to guard');
});

/* ============================================================================================
   3. the list itself has not gone stale
============================================================================================ */

test('T5 the fields triaged as unread are still unread', () => {
  /**
   * A triage is a claim about today. If a subscriber starts reading one of these, the entry is
   * stale and the next reader may "fix" something already fixed — the failure mode §421's own
   * `DEAD_UNBUILT` line had before `clue` was deleted from it.
   *
   * Checked the cheap, conservative way: the field name must not appear as a property read on the
   * handler's parameter anywhere in the subscribing file. Deliberately blunt — it over-reports
   * rather than under-reports, so a genuine wire-up trips it.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: the shipped tree — none of the five sampled fields is read by its subscriber.
   * FAILS ON:  RUN in-arm — `caneSlam.material`, which §429 wired up, IS read by all of AUDIO,
   *            FX and the same predicate. The one field known to have moved buckets is the
   *            control, so the check cannot pass by being blind.
   */
  const reads = (file, field) => new RegExp(`[\\w$]\\??\\.${field}\\b`).test(strip(SRC(file)));

  const stillUnread = [
    ['src/ui/HUD.js', 'charmCoins', 'health.charmCoins'],
    ['src/fx/Particles.js', 'miss', 'targetLocked.miss'],
    ['src/audio/Audio.js', 'found', 'clue.found'],
    ['src/audio/Audio.js', 'v0', 'jumped.v0'],
    ['src/fx/Particles.js', 'vy', 'targetJump.vy'],
  ];
  let inspected = 0;
  for (const [file, field, label] of stillUnread) {
    assert.equal(reads(file, field), false,
      `${label} is now read in ${file} — the triage entry is stale, and the field has moved out ` +
      'of the "nothing reads it" bucket');
    inspected++;
  }
  assert.equal(inspected, 5);

  /* The control, run: the one field that WAS wired up reads as wired up. */
  assert.ok(reads('src/audio/Audio.js', 'material'),
    'AUDIO no longer reads `material` — §429 has been reverted, or this predicate is blind');
  assert.ok(reads('src/fx/Particles.js', 'material'),
    'FX no longer reads `material` — §429 has been reverted, or this predicate is blind');
});
