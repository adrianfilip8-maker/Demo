import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Particles } from '../src/fx/Particles.js';
import { smashFor } from '../src/fx/Emitters.js';
import { stepFor } from '../src/audio/Sfx.js';
import { MAT_NAMES } from '../src/world/BVH.js';

/**
 * `caneSlam.material` — the field that was published, correct, and read by nobody.
 *
 * ── What this guards ───────────────────────────────────────────────────────────────────────
 * §428.4 censused payload fields nobody reads and found 25. This was the sharpest, because the
 * defect was not an oversight spread across two teams — it was a contradiction inside one file.
 * `Moveset.js:347` publishes `material: c.groundMaterial` on every Cane Slam, while the same
 * file **deliberately withholds** material from `caneHit` under a long comment saying a swing is
 * not a contact and a wrong material is worse than none. The author reasoned about it once and
 * got the harder case right; the easy case was published and dropped by all three subscribers,
 * so a slam into the desert and a slam onto temple paving were the same sound and the same
 * particles.
 *
 * The failure mode this file exists to prevent is the field going quiet again. A subscriber that
 * stops reading `material` breaks nothing, warns nobody and looks fine — which is how it got
 * here. So the bars are behavioural: **do two different surfaces produce two different results.**
 *
 * ── §418.3 / §418.9 ────────────────────────────────────────────────────────────────────────
 * Every arm names an input it passes on and one it fails on, and all seven counterexamples below
 * are RUN inside the arm, against the same call path, one argument apart.
 *
 * ── Two notes from the census this came out of, for whoever arrives here next ───────────────
 *
 * **1. `damage.amount` is the shape the other unread fields should be in.** Of the 25 payload
 * fields §428.4 found that no subscriber reads, exactly one is *documented* as ignored:
 * `Health.applyDamage` says *"`p.amount` is read and discarded, on purpose and visibly. Every hit
 * costs one charm."* That is a finished decision. The other 24 are silent, and silence is
 * indistinguishable from an oversight — which is what this one turned out to be. **A published
 * field should be read, or carry a line saying why it is not.** `Smashables`' `caneSlam` handler
 * now carries such a line: it drops `material` correctly, because a jar's material is the jar's
 * and not the floor's, and it says so rather than looking like the third module that forgot.
 *
 * **2. The census's clean answers cover the world half only.** §428.2 walked the built scene and
 * found nothing orphaned and nothing empty — across `terrain`, `architecture`, `props` and
 * `collision`, the modules that boot headless. `character`, `fx`, `hud`, `lighting` and `postfx`
 * need WebGL or a DOM and no instrument in this project can reach them. They are **unmeasured,
 * not clean**, and a future reader should not promote the one into the other. This file is a
 * small instance of the gap: `_onDiveImpact` is exercised here through its prototype precisely
 * because booting `Particles` needs a GPU.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * Run the REAL `_onDiveImpact` and record what it emitted.
 *
 * Called through the prototype against a minimal receiver rather than on a booted `Particles`:
 * the method reads `this.engine`, `this._emit` and `this.decal` and nothing else, and booting the
 * module needs a GPU. This exercises the shipped method body — not a transcription of it — which
 * is the only property that matters here.
 */
function slamOn(material, { radius = 1.2 } = {}) {
  const emits = [];
  const decals = [];
  const self = {
    engine: { get: () => null },
    _emit: (name, pos, opts) => { emits.push({ name, opts: opts || {} }); },
    decal: (name, pos, up, opts) => { decals.push({ name, opts: opts || {} }); },
  };
  Particles.prototype._onDiveImpact.call(self, { x: 1, y: 2, z: 3 }, radius, material);
  return { emits, decals, named: (n) => emits.find((e) => e.name === n) || null };
}

/* ============================================================================================
   1. the publisher still publishes it
============================================================================================ */

test('M1 MOVEMENT still publishes the ground material with every slam', () => {
  /**
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: the shipped `emit('caneSlam', { pos, radius, material: c.groundMaterial })`.
   * FAILS ON:  RUN in-arm — the same source with `material: c.groundMaterial` spliced out; the
   *            regex finds nothing and the assertion fires. Without this arm every behavioural
   *            bar below would keep passing on a payload that had lost the field, because they
   *            pass the material in by hand.
   */
  const MOVESET = strip(SRC('src/player/Moveset.js'));
  const m = /emit\('caneSlam',\s*\{([^}]*)\}/.exec(MOVESET);
  assert.ok(m, 'nothing publishes `caneSlam` any more');
  assert.ok(/material:\s*c\.groundMaterial/.test(m[1]),
    'the slam no longer carries the ground material — the subscribers below are reading a field ' +
    'that is not sent, and every one of them silently falls back to stone');

  const gutted = MOVESET.replace(/,\s*material:\s*c\.groundMaterial/, '');
  const m2 = /emit\('caneSlam',\s*\{([^}]*)\}/.exec(gutted);
  assert.ok(!/material:/.test(m2[1]),
    'the counterexample no longer removes the field, so this arm has stopped discriminating');

  /* And `caneHit`'s deliberate withholding is untouched — the census fix must not "helpfully"
     extend to the case the author reasoned about and refused. */
  const hit = /emit\('caneHit',\s*\{([^}]*)\}/.exec(MOVESET);
  assert.ok(hit, 'nothing publishes `caneHit` any more');
  assert.ok(!/material/.test(hit[1]),
    '`caneHit` has grown a material. Moveset.js explains at length why a cane swing has none — ' +
    'it fires on the wind-up, before and independently of connecting with anything.');
});

/* ============================================================================================
   2. FX — two surfaces, two results
============================================================================================ */

test('M2 a slam on sand and a slam on stone throw differently coloured debris', () => {
  /**
   * The shipped effect was a mix that was right for neither surface: `dive_dust` defaults to
   * `sandLight/sandMid` (identical to `SMASH.sand.dustCol`) while `dive_debris` defaults to
   * `limeMid/sandDark`, limestone. Limestone chips inside a sand cloud, on every surface.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: sand vs stone — `dive_debris` `color0` differs, and so does `dive_dust`.
   * FAILS ON:  RUN in-arm — stone vs stone through the same call path, which must be identical.
   *            That is the calibration: without it, "the colours differ" could be satisfied by a
   *            handler that randomises them.
   */
  const sand = slamOn('sand');
  const stone = slamOn('stone');

  const dSand = sand.named('dive_debris');
  const dStone = stone.named('dive_debris');
  assert.ok(dSand && dStone, 'the slam stopped throwing debris entirely');
  assert.notEqual(dSand.opts.color0, dStone.opts.color0,
    'sand and stone throw identically coloured chips — the material is being dropped again');
  assert.equal(dSand.opts.color0, smashFor('sand').col[0], 'sand debris is not sand-tinted');
  assert.equal(dStone.opts.color0, smashFor('stone').col[0], 'stone debris is not stone-tinted');

  const uSand = sand.named('dive_dust');
  const uStone = stone.named('dive_dust');
  assert.notEqual(uSand.opts.color0, uStone.opts.color0, 'the dust cloud ignores the surface');

  /* The calibration, run: same material in, identical colours out. */
  const stone2 = slamOn('stone');
  assert.equal(stone2.named('dive_debris').opts.color0, dStone.opts.color0,
    'two slams on the same material differ — the colours are not coming from the material');
  assert.equal(stone2.named('dive_dust').opts.color0, uStone.opts.color0);
});

test('M3 only metal throws sparks, and it used to throw them off sand', () => {
  /**
   * `SMASH` calls metal "the only material that throws light, and the only one that leaves a
   * burn". `_onDiveImpact` emitted `dive_spark` unconditionally, so a slam into the desert struck
   * sparks off sand.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: metal — `dive_spark` present.
   * FAILS ON:  RUN in-arm — sand, stone and wood, none of which may emit it. Three failing
   *            inputs rather than one, because the bar is "only metal" and a single negative
   *            would not distinguish that from "not sand".
   */
  assert.ok(slamOn('metal').named('dive_spark'), 'metal no longer throws sparks');
  let inspected = 0;
  for (const m of ['sand', 'stone', 'wood', 'cloth']) {
    assert.equal(slamOn(m).named('dive_spark'), null, `a slam on ${m} threw sparks`);
    inspected++;
  }
  assert.equal(inspected, 4);
  /* The gate is the table's, not a hand-written list of materials. */
  assert.ok(smashFor('metal').spark, 'SMASH.metal lost its spark and this arm is now vacuous');
  for (const m of ['sand', 'stone', 'wood', 'cloth']) assert.equal(smashFor(m).spark, null);
});

test('M4 the slam still has its shape — ring, dust, debris and both marks', () => {
  /**
   * TRIPWIRE (§418.5) on the half that must NOT vary. Reading the material was supposed to change
   * colours and the spark gate, not the vocabulary: the emitters stay `dive_*` and the marks stay
   * `crack`/`scuff`, because swapping in `SMASH`'s `land_dust`/`dust_ring`/`scorch` would be
   * authoring a new look rather than reading a published field.
   *
   * DOMAIN: PASSES ON the shipped tree. FAILS ON nothing reachable — every branch emits these
   * four unconditionally. Kept as a tripwire against a future edit that "finishes the job" by
   * routing the emitters through SMASH too, which would silently restyle the biggest effect in
   * the game. NOT evidence that the effect reads well.
   */
  for (const m of ['stone', 'sand', 'wood', 'metal']) {
    const r = slamOn(m);
    for (const n of ['dive_ring', 'dive_dust', 'dive_debris']) {
      assert.ok(r.named(n), `a slam on ${m} lost ${n}`);
    }
    assert.equal(r.decals.length, 2, `a slam on ${m} does not leave both marks`);
    assert.deepEqual(r.decals.map((d) => d.name), ['crack', 'scuff'],
      `a slam on ${m} changed its decal vocabulary`);
  }
});

/* ============================================================================================
   3. AUDIO — the transient, and that it is the recipe that already shipped
============================================================================================ */

test('M5 the slam plays a material transient, and it is `_onSmash`\'s recipe unchanged', () => {
  /**
   * §239's method: the contract is extracted from the shipping source, not retyped, so a
   * subscriber that quietly stops reading `material` fails here instead of going silent.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: the shipped handler — it calls `stepFor(p?.material)` and reuses rate 0.62.
   * FAILS ON:  RUN in-arm — the same source with `stepFor(p?.material)` replaced by the
   *            material-free `stepFor()`, which the assertion rejects. That is precisely the
   *            state this file was written after: a handler that plays a sound and ignores the
   *            surface.
   */
  const AUDIO = strip(SRC('src/audio/Audio.js'));
  const h = /on\('caneSlam',\s*\(p\)\s*=>\s*\{([\s\S]*?)\n\s{4}\}\);/.exec(AUDIO);
  assert.ok(h, 'AUDIO no longer subscribes to `caneSlam` with a block handler');
  assert.ok(/dive_boom/.test(h[1]), 'the slam lost its weight layer');
  assert.ok(/stepFor\(p\?\.material\)/.test(h[1]),
    'the slam plays no material transient — the published surface is being dropped again');

  /* The rate is `_onSmash`'s, not a second set of numbers invented for this. */
  const smash = /_onSmash\(p\)\s*\{([\s\S]*?)\n\s{2}\}/.exec(AUDIO);
  assert.ok(smash, 'could not read `_onSmash` to compare against');
  const rateOf = (s) => (/stepFor\([^)]*\),\s*\{[^}]*rate:\s*([\d.]+)/.exec(s) || [])[1];
  assert.equal(rateOf(h[1]), rateOf(smash[1]),
    'the slam transient uses a different rate than the break transient. Two differently-felt ' +
    'material impacts is the drift this file refuses elsewhere.');

  /* The counterexample, run. */
  const gutted = h[1].replace('stepFor(p?.material)', 'stepFor()');
  assert.ok(!/stepFor\(p\?\.material\)/.test(gutted),
    'the counterexample no longer removes the material read, so this arm proves nothing');
});

/* ============================================================================================
   4. the boundary: what was NOT authored, and what is NOT affected
============================================================================================ */

test('M6 every material a player can stand on is distinct in BOTH catalogues', () => {
  /**
   * The scope rule for this fix was: read what is published, and where a catalogue has no entry
   * for a material, report it rather than author one. This arm is that report, as an assertion.
   *
   * The level's standable colliders (`ground`/`ledge`) carry three materials — stone 140, sand 1,
   * wood 2 — and all three resolve to a distinct recipe AND a distinct cue, so nothing needed
   * inventing.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: stone, sand, wood — pairwise distinct under `smashFor` and `stepFor`.
   * FAILS ON:  RUN in-arm — `flesh` and `misc`, which are real entries in COLLISION's own
   *            `MAT_NAMES` and collapse onto stone in both catalogues. They are asserted to
   *            collapse, so if either ever gains its own entry this arm says so rather than
   *            quietly continuing to claim a gap that has closed.
   */
  const STANDABLE = ['stone', 'sand', 'wood'];
  for (const m of STANDABLE) assert.ok(MAT_NAMES.includes(m), `${m} is not a COLLISION material`);

  let pairs = 0;
  for (let i = 0; i < STANDABLE.length; i++) {
    for (let j = i + 1; j < STANDABLE.length; j++) {
      const a = STANDABLE[i], b = STANDABLE[j];
      assert.notEqual(smashFor(a), smashFor(b), `${a} and ${b} share one SMASH recipe`);
      assert.notEqual(stepFor(a), stepFor(b), `${a} and ${b} share one step cue`);
      pairs++;
    }
  }
  assert.equal(pairs, 3);

  /* The gap, asserted rather than described: these two have no entry of their own. */
  for (const m of ['flesh', 'misc']) {
    assert.ok(MAT_NAMES.includes(m), `${m} is no longer a COLLISION material`);
    assert.equal(smashFor(m), smashFor('stone'),
      `${m} has gained its own SMASH recipe — the "nothing was authored" note in §428 is stale`);
    assert.equal(stepFor(m), stepFor('stone'),
      `${m} has gained its own step cue — the note in §428 is stale`);
  }
});

test('M7 no canonical shot is affected — the staged impact has its own path', () => {
  /**
   * The only reason this change could be made without a capture round. `_stageImpact` builds the
   * certified `impact` frame from its own `STAGE_IMPACT` list; if it ever routes through
   * `_onDiveImpact`, the shot inherits material-dependent colours and every certificate against
   * it is measuring something else.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: the shipped tree — `_onDiveImpact` has exactly one call site, the `caneSlam`
   *            subscription.
   * FAILS ON:  RUN in-arm — the same scan against a copy with a `_onDiveImpact` call spliced
   *            into `_stageImpact`, which raises the count to two and trips the bar.
   */
  const FX = strip(SRC('src/fx/Particles.js'));
  const calls = (s) => (s.match(/this\._onDiveImpact\(/g) || []).length;
  assert.equal(calls(FX), 1,
    `_onDiveImpact now has ${calls(FX)} call sites. If one of them is shot staging, the ` +
    'canonical `impact` frame has become material-dependent and its certificates are stale.');
  assert.ok(/on\('caneSlam',\s*\(e\)\s*=>\s*this\._onDiveImpact\([^)]*e\?\.material\)/.test(FX),
    'the one call site no longer forwards the material');

  const spliced = FX.replace('_stageImpact() {', '_stageImpact() {\n    this._onDiveImpact();');
  assert.equal(calls(spliced), 2,
    'the counterexample no longer adds a call site, so this arm has stopped discriminating');
});
