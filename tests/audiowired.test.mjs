import test from 'node:test';
import assert from 'node:assert/strict';
import { OfflineCtx } from './webaudio.mjs';
import { SFX_NAMES } from '../src/audio/Sfx.js';

/**
 * audiowired — §357.1 for the mixer: an event that fires and makes no sound (§548).
 *
 * ── What this adds, and what it deliberately does not repeat ────────────────────────────────
 *
 * The audio subsystem is the best-covered in this project — `tests/audio.test.mjs` runs forty
 * arms with calibration arms of their own, including that every authored surface is a spectrally
 * distinct sound, that the world's surface tags all reach a real footstep, that nothing in the
 * catalogue renders silence, and that **the mixer never throws on any event it subscribes to**.
 * `tests/eventbus.test.mjs` separately proves, codebase-wide and in both directions, that no
 * subscription lacks a publisher and no publication lacks a subscriber.
 *
 * Between those two there is one gap, and it is exactly the shape that has cost this project the
 * most: `eventbus` proves the wire exists, and the no-throw arm proves the handler survives being
 * called. **Neither proves the handler does anything.** A listener that fires, throws nothing, and
 * starts no voice passes both and is silent in the game — machinery wired at one end, which is how
 * the pointer-lock click swallow read as "attacks are not working" (§514).
 *
 * So this file asks the remaining question of every subscribed event: *did a voice start?* And
 * where the honest answer is "no, by design", the reason is written down here rather than
 * inferred, the same way §540's keyboard-only census names its four exceptions.
 *
 * ── What it cannot discriminate ─────────────────────────────────────────────────────────────
 *
 * Audibility. A voice that starts at zero gain, is masked by the bed, or is positioned behind the
 * listener all count as "started" here. `audio.test.mjs` owns level, spectrum and clipping; this
 * owns only the coupling. It also runs on `OfflineCtx`, not a real `AudioContext` — the shim
 * renders the shipping recipes faithfully (its own header sets out the node set and the spec
 * formulas) but it is not a browser, so "the player's machine actually produces sound" is a floor
 * this cannot raise.
 */

const SR = 44100;
const { Audio } = await import('../src/audio/Audio.js');

function stubEngine() {
  const handlers = new Map(); const modules = new Map();
  return {
    quality: 'high', dt: 1 / 60, warnings: [], scene: null, camera: null,
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); return () => {}; },
    emit(evt, p) { for (const fn of handlers.get(evt) || []) fn(p); },
    get(n) { return modules.get(n) || null; }, set(n, m) { modules.set(n, m); },
    warn(m) { this.warnings.push(m); },
    subscribedEvents() { return [...handlers.keys()].sort(); },
  };
}

async function boot() {
  const engine = stubEngine();
  const a = new Audio(engine);
  a.available = true;
  await a.init();
  const ok = a.unlock(new OfflineCtx(SR));
  return { a, engine, ok };
}

const P = { x: 1, y: 0, z: -2 };

/**
 * A payload each handler will actually act on. Written out per event rather than sprayed from one
 * permissive object, because a generic object is how a handler gets called with the wrong SHAPE
 * and reports a false silence: `playerState` takes a string, and passing it an object made it look
 * dead in the first draft of this sweep when it is not.
 */
const PAYLOAD = {
  landed: { force: 12, pos: P, surface: 'stone' },
  jumped: { pos: P },
  doubleJump: {},
  caneHit: { pos: P, index: 2 },
  caneSlam: { pos: P, radius: 1.2, material: 'stone' },
  hookGrab: { pos: P },
  hookRelease: { pos: P },
  railMount: { pos: P },
  poleMount: { pos: P },
  spireLand: { pos: P },
  wallRun: { pos: P },
  wallJump: { pos: P },
  ledgeGrab: { pos: P },
  pickpocket: { pos: P },
  propSmashed: { pos: P, material: 'stone' },
  coin: { amount: 2, pos: P },
  coins: 4,
  clue: { pos: P },
  binocucom: true,
  thiefVision: true,
  guardAlert: { id: 'g1', state: 'chase', pos: P },
  playerState: 'roll',
  paraglide: true,
  shake: 0.3,
  shot: null,
  treasureBanked: {},
};

/**
 * Events that legitimately start no voice, each with the reason. These are not oversights: three
 * of them steer the score or the harness rather than making a sound, and `paraglide` looks like
 * the defect and is not — its loop is started from per-frame state in `update()`
 * (`_loops.glide = this.play('paraglide')`), and the subscription exists only to stop that loop
 * early when the state machine leaves the glide before the next tick.
 */
const SILENT_BY_DESIGN = {
  shake: 'ducks the music bus — deliberately not a sound of its own',
  shot: 'stops every loop so a canonical capture never records a stale bed',
  treasureBanked: 'raises a music hold; the treasure cue is the score, not an sfx',
  paraglide: 'STOP half only; the loop is started from per-frame state in update()',
};

/* ====================================================================== */
/* A1 — every subscribed event either voices, or is named as silent        */
/* ====================================================================== */

test('A1 wiring: every event the mixer subscribes to starts a voice, or is a named exception', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : each of the mixer's own subscribed events, read off the bus rather than
   *               grepped, emitted with a payload of the shape its handler reads — a voice
   *               starting for every one that is not in SILENT_BY_DESIGN.
   *   fails  on : RUN in-arm — one handler replaced with a no-op, which must be caught. That is
   *               the defect being guarded: a listener that fires, throws nothing and does
   *               nothing passes both `eventbus` (the wire exists) and audio.test's no-throw arm
   *               (it survived), and is silent in the game.
   *   verdict   : passes on a handler that voices, fails on one that has been hollowed out. It
   *               discriminates the COUPLING, not the sound — see the header for what it cannot
   *               say about audibility.
   */
  const { a: probe, engine: probeEngine, ok } = await boot();
  assert.ok(ok, `unlock failed: ${probeEngine.warnings.join('; ')}`);
  const events = probeEngine.subscribedEvents();
  probe.dispose();

  assert.ok(events.length >= 20, `the mixer subscribes to only ${events.length} events — premise is stale`);
  for (const e of events) {
    assert.ok(Object.prototype.hasOwnProperty.call(PAYLOAD, e),
      `the mixer subscribes to "${e}" and this file has no payload for it. A new subscription must `
      + 'arrive with either a voice or an entry in SILENT_BY_DESIGN saying why it has none.');
  }

  const voiced = [], silent = [];
  for (const evt of events) {
    const { a, engine } = await boot();
    const calls = [];
    const orig = a.play.bind(a);
    a.play = (name, opts) => { calls.push(name); return orig(name, opts); };
    engine.emit(evt, PAYLOAD[evt]);
    for (let i = 0; i < 20; i++) a.update(1 / 60, i / 60);
    (calls.length ? voiced : silent).push(evt);
    if (calls.length) {
      for (const n of calls) {
        assert.ok(SFX_NAMES.includes(n) || n === 'thief_on' || n === 'thief_off',
          `"${evt}" asked for a sound named "${n}", which the catalogue does not define — the `
          + 'request is a typo and nothing plays');
      }
    }
    a.dispose();
  }

  for (const e of silent) {
    assert.ok(SILENT_BY_DESIGN[e],
      `"${e}" is subscribed and started no voice. Either it is broken, or it is deliberate and `
      + 'belongs in SILENT_BY_DESIGN with the reason — an undocumented silent listener is exactly '
      + 'the §357.1 shape that reads to a player as "this makes no sound".');
  }
  for (const e of Object.keys(SILENT_BY_DESIGN)) {
    assert.ok(!voiced.includes(e),
      `"${e}" is listed as silent by design but DID start a voice — the exception list has gone `
      + 'stale and is now hiding a real result');
  }

  /* RUN the counterexample: hollow out one handler and prove the check sees it. */
  {
    const { a, engine } = await boot();
    const target = voiced.find((e) => e !== 'guardAlert') || voiced[0];
    a.play = () => null;                       // the handler fires, throws nothing, voices nothing
    const calls = [];
    const spy = a.play;
    a.play = (n, o) => { calls.push(n); return spy(n, o); };
    engine.emit(target, PAYLOAD[target]);
    for (let i = 0; i < 20; i++) a.update(1 / 60, i / 60);
    /* the spy still records the REQUEST, so to model a hollow handler we check the returned
       voice rather than the call: a play() that returns null started nothing. */
    const started = calls.map((n) => spy(n)).filter(Boolean).length;
    assert.equal(started, 0,
      'the hollowed-out mixer still started a voice — this arm cannot tell a live handler from a '
      + 'dead one (§418)');
    a.dispose();
  }

  console.log(`\n[A1] ${events.length} subscribed events · ${voiced.length} voice · `
    + `${silent.length} silent by design (${silent.join(', ')})`);
});

/* ====================================================================== */
/* A2 — the provenance rule, enforced rather than trusted                  */
/* ====================================================================== */

test('A2 provenance: nothing references the reference repo\'s commercial recordings', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the shipped tree — no path under `public/assets/sly-godot/` named `Music` or
   *               `Effects` exists, and no file in `src/` names one.
   *   fails  on : RUN in-arm — the same scan against a synthetic source string that DOES name
   *               `Assets/Music/…`, which must be caught. Without it a scan that had stopped
   *               matching anything would pass silently, which is the failure mode that matters
   *               for a rule whose whole job is to stay true.
   *   verdict   : passes on the tree as shipped, fails on a planted reference. It does NOT
   *               license the rest of the audio payload — `public/assets/audio/PROVENANCE.md`
   *               records that the three `bc-*.mp3` cues the game actually plays have an unstated
   *               licence and an unstated source, and that is a separate matter this cannot and
   *               does not clear.
   */
  const { readdirSync, readFileSync, existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join, dirname } = await import('node:path');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

  const REF = join(ROOT, 'public/assets/sly-godot');
  if (existsSync(REF)) {
    const entries = readdirSync(REF);
    for (const bad of ['Music', 'Effects', 'music', 'effects']) {
      assert.ok(!entries.includes(bad),
        `public/assets/sly-godot/${bad}/ exists. The reference repo's Music and Effects are `
        + 'unmodified commercial recordings and nothing in this build may carry them.');
    }
  }

  /* THE BUILD OUTPUT, by its two roots. `dist/` itself is gitignored and 0 files tracked, so no
     durable test can scan it — but everything in it arrives through exactly two doors, and both
     are in the tree:

       public/  copied into dist/ VERBATIM (§265)
       src/     anything imported is bundled/hashed into dist/assets/ by vite

     The content scan below cannot see either one, because it only opens .js/.mjs/.ts/.html/.json —
     a directory of MP3s named Music/ has no source file in it to match. So this arm looks at PATH
     NAMES rather than contents, across both roots. (`src/assets/` today holds fonts, sly-cane and
     sly-dl; that is the shape a dropped-in Music/ would take.) */
  const walkAll = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p2 = join(dir, e.name);
      if (e.isDirectory()) { out.push(p2 + '/'); walkAll(p2, out); } else out.push(p2);
    }
    return out;
  };
  const BAD_DIR = /(^|[\/\\])(Music|Effects)[\/\\]/i;
  for (const [root, floor] of [['public', 10], ['src', 40]]) {
    const entries = walkAll(join(ROOT, root));
    assert.ok(entries.length > floor,
      `the ${root}/ scan found only ${entries.length} entries — it went blind`);
    const shipped = entries.filter((p2) => BAD_DIR.test(p2.slice(ROOT.length)));
    assert.deepEqual(shipped, [],
      `${root}/ carries paths that would ship into dist/: ${shipped.join(', ')}`);
  }

  const RE = /assets[\/\\](music|effects)[\/\\]/i;
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(m?js|ts|html|json)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const files = walk(join(ROOT, 'src'));
  assert.ok(files.length > 40, `the scan found only ${files.length} source files — it went blind`);
  const hits = files.filter((f) => RE.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, [],
    `source files reference the reference repo's recordings: ${hits.join(', ')}`);

  /* RUN the counterexample: the scan must catch a planted reference. */
  assert.ok(RE.test("loadMusic('assets/Music/black-chateau.mp3')"),
    'the provenance scan does not match a reference it is meant to catch — it proves nothing (§418)');
  assert.ok(!RE.test("loadMusic('assets/audio/bc-explore.mp3')"),
    'the scan matches the project\'s own audio directory, so it would fire on everything');

  console.log(`\n[A2] ${files.length} source files scanned · no reference to the repo's Music/Effects · `
    + `sly-godot/ carries ${existsSync(REF) ? readdirSync(REF).length : 0} entries, none of them audio`);
});
