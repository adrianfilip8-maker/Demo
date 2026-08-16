import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as THREE from 'three';

import { OfflineCtx, rms, peak, centroid } from './webaudio.mjs';
import { Audio, TUNE } from '../src/audio/Audio.js';
import { SECTION_NAMES } from '../src/audio/Music.js';
import { SPACES } from '../src/audio/Reverb.js';

/** Just the wet levels, for the space-transition log line. */
const SPACES_WET = Object.fromEntries(Object.entries(SPACES).map(([k, v]) => [k, v.wet]));

/**
 * audiosession — the capture pipeline this project has never had for sound.
 *
 * ── Why it exists ──────────────────────────────────────────────────────────────────────────
 * `tools/critic.mjs` renders twelve canonical frames and every visual decision in this project
 * is argued against them. Audio has no equivalent and never has: `Audio.js` stops every loop on
 * the `shot` event (so no capture has ever contained sound), there is no rendered session, and
 * every audio verdict here — including every one in the §367/§383 lineage — was reached by
 * reading source. That is the whole of the evidence base for half a shipping subsystem.
 *
 * This drives the SHIPPED module through a scripted traversal and renders it. Not a model of
 * the bus: the real `Audio` class, the real `_buildGraph`, the real 44-voice pool, the real
 * `ReverbRack`, the real limiter, the real `Music` scheduler. The only substitution is the
 * context itself, and that substitution is one the module already supports — `unlock(existing)`
 * takes an injected context and is documented as the path "every headless capture in this
 * project boots through", including the branch that skips the 6.9 MB track fetch.
 *
 * ── How the clock works, which is the one non-obvious part ─────────────────────────────────
 * `OfflineCtx.currentTime` is a plain writable field that nothing advances on its own. The
 * shipped code reads `this.ctx.currentTime` everywhere it schedules, so **advancing that field
 * frame by frame IS driving the real scheduler** — every `setTargetAtTime`, every `delay`, every
 * `linearRampToValueAtTime` lands at its true absolute offset, and one `render()` at the end
 * resolves the whole timeline. Nothing here reimplements timing.
 *
 * ── What is NOT rendered, stated rather than hidden ────────────────────────────────────────
 * `webaudio.mjs` implements Panner, StereoPanner, Convolver and DynamicsCompressor as
 * pass-throughs. So this session is a faithful render of *what each source sounds like and when
 * it fires*, and it is NOT a render of where anything sits in space, how wet the room is, or
 * what the limiter does to a peak. Level, spectrum, timing and material identity are real here;
 * spatialisation, reverb tail and dynamics are not. Every assertion below is written to depend
 * only on the first group. A claim about the reverb cannot be settled by this instrument, and
 * saying so is the point — that is the same bounding the FX lineage applied to every gap it
 * could not close.
 */

/**
 * ═══ PRE-REGISTERED, UNRUN — the blind listening protocol ═══════════════════════════════════
 *
 * §379.4 frames one question for one frame, and it is blocked on the capture lock. **This one is
 * not blocked on anything but an ear.** The wav below is produced by `node --test`, takes no
 * lock, contends with no lane, and can be rendered this afternoon. Nobody has ever heard this
 * game; the only thing standing between that and a verdict is somebody putting headphones on.
 *
 * ── Why this can be stricter than the visual protocol ──────────────────────────────────────
 * The frame question had to be open-ended ("which elements are made of the same material as the
 * picture") because you cannot easily render two frames differing in exactly one authored idea.
 * Audio can: `AUDIO_SESSION_WAV` renders the shipped module, and a second render with one field
 * forced is the same session minus one decision. So this is a **forced-choice discrimination**,
 * which is a much harder bar than an impression — and that is a property of the medium, not of
 * the writing.
 *
 * ── Material ───────────────────────────────────────────────────────────────────────────────
 *   A. the session as it ships.
 *   B. the same session with every contact's `material` forced to `stone` — i.e. the game as it
 *      sounded before §383/§389. One field, nothing else.
 * Present A and B in a random order the listener does not know, twice each, no script, no
 * picture, no transcript.
 *
 * ── Q1 · the "one place" question, and the analogue of the ink question ────────────────────
 *   "Describe the space this was recorded in. Then: is everything you hear in that space, or is
 *    some of it somewhere else?"
 * NOT "can you hear the reverb" — routing is settled (`far/near 2.286` against a predicted 2.29,
 * `flat/near 0.800` against 0.80), so every class demonstrably reaches the room at the published
 * level. If a listener still places something outside it, the cause cannot be routing, and it is
 * therefore spectrum, dynamics or timing — which is exactly the class of finding no arithmetic
 * here can reach, and exactly the shape the ink hypothesis took for the picture.
 *
 * ── Q2 · the forced choice, and the bar that decides §389 ──────────────────────────────────
 *   "Between 4 and 8 seconds the character touches five things. How many different materials do
 *    you hear? Name them."  Then, on the pair: "Which of these two recordings has more variety
 *    in what he is touching?"
 * The render says the four rail materials span 1.63× in spectral centroid and a material-blind
 * control spans 1.000×. That proves they DIFFER. It cannot prove they are DISCRIMINABLE, and the
 * gap between those two words is the whole reason this protocol exists.
 *   · A named correctly, and A picked over B → the payload work landed and is audible.
 *   · A and B indistinguishable → the material layer is real, measurable and inaudible. That is
 *     not a refutation of §383; it is an instruction to raise the layer's level or widen the
 *     vocabulary, and it is a finding worth more than the fix that produced it.
 *
 * ── Q3 · the stealth question ──────────────────────────────────────────────────────────────
 *   "At some point a guard notices him. When? When does he stop looking?"
 * The ladder ascends and descends in the render and fires all five of its cues. A listener who
 * cannot locate either edge means the ladder is graded on paper and flat in the ear — and the
 * descent is the half to watch, because a stealth game whose room never audibly becomes safe
 * again has only told the player half of what it knows.
 *
 * ── Q4 · the negative control, which every instrument here carries ─────────────────────────
 *   "Is there a moment where something clearly happens and you hear nothing?"
 * `enemyBounce` is in the session and is silent (§384.1) — the one moment Sly strikes a body.
 * If a listener reports a hole there, the silence is audible and voicing it stops being a
 * design call. If nobody notices across four passes, it stays one, and that is a real answer.
 *
 * ── What this protocol CANNOT answer, stated so nobody asks it to ──────────────────────────
 * The renderer treats Panner, StereoPanner, Convolver and DynamicsCompressor as pass-throughs.
 * So the wav carries no spatialisation, no reverb TAIL and no limiter behaviour. Q1 asks about
 * belonging, not about the room's decay, and a listener's answer about *where* a sound sits is
 * about spectrum and level only. A verdict on the tail, the HRTF or the limiter needs a real
 * `AudioContext` and this protocol must not be read as covering them.
 */

const SR = 22050;
const DUMP = process.env.AUDIO_SESSION_WAV || '';

/* ══════════════════════════════════════════════════════════════ the stub world ══
   Only what `Audio` actually reads. Every field is one the module already probes for and
   tolerates the absence of, so this cannot accidentally exercise a path the game does not. */
function makeWorld() {
  const listeners = new Map();
  const player = {
    position: new THREE.Vector3(0, 0, 20),
    velocity: new THREE.Vector3(0, 0, 0),
    faceDir: new THREE.Vector3(0, 0, -1),
    speed: 0,
  };
  const guards = { list: [{ id: 'g1', position: new THREE.Vector3(8, 0, 14), state: 'patrol' }] };
  const scene = new THREE.Scene();
  const brazier = new THREE.Object3D();
  brazier.name = 'brazier_court_0';
  scene.add(brazier);

  const animHandlers = new Map();
  const engine = {
    scene,
    time: 0,
    dt: 1 / 60,
    quality: 'high',
    warnings: [],
    warn(m) { this.warnings.push(String(m)); },
    get(k) {
      if (k === 'movement') return player;
      if (k === 'guards') return guards;
      if (k === 'character') return { root: { position: player.position } };
      if (k === 'animation') return anim;
      return null;
    },
    has() { return false; },
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn);
    },
    emit(evt, payload) { for (const fn of listeners.get(evt) || []) fn(payload); },
  };
  const anim = {
    onEvent(name, fn) {
      if (!animHandlers.has(name)) animHandlers.set(name, new Set());
      animHandlers.get(name).add(fn);
    },
    fire(name, p) { for (const fn of animHandlers.get(name) || []) fn(p); },
  };
  return { engine, player, guards, anim };
}

/* ══════════════════════════════════════════════════ the script, and what it is for ══
   Each beat names the thing nobody can currently hear. `at` is seconds into the session.
   The three rail/ledge/spire beats are the §383 payloads that landed this hour: before them,
   every one of these contacts played a constant. */
const SCRIPT = [
  { at: 0.35, label: 'walk on sand', act: (w) => { w.player.speed = 3; w.player.velocity.set(0, 0, -3); w.anim.fire('footstep', { surface: 'sand' }); } },
  { at: 0.7, label: 'walk on sand', act: (w) => w.anim.fire('footstep', { surface: 'sand' }) },
  { at: 1.1, label: 'sneak on stone', act: (w) => { w.engine.emit('playerState', 'sneak'); w.player.speed = 1.6; w.anim.fire('footstep', { surface: 'stone' }); } },
  { at: 1.5, label: 'sneak on stone', act: (w) => w.anim.fire('footstep', { surface: 'stone' }) },
  { at: 1.95, label: 'jump', act: (w) => { w.engine.emit('playerState', 'jump'); w.engine.emit('jumped', { pos: w.player.position }); } },
  { at: 2.35, label: 'land on stone', act: (w) => w.engine.emit('landed', { pos: w.player.position, force: 11, surface: 'stone' }) },
  { at: 2.85, label: 'ledge grab — STONE ledge (was step_cloth)', act: (w) => w.engine.emit('ledgeGrab', { pos: w.player.position, material: 'stone' }) },
  { at: 3.35, label: 'rail mount — METAL cable', act: (w) => w.engine.emit('railMount', { pos: w.player.position, material: 'metal' }) },
  { at: 3.9, label: 'rail mount — CLOTH rope', act: (w) => w.engine.emit('railMount', { pos: w.player.position, material: 'cloth' }) },
  { at: 4.45, label: 'pole mount — WOOD pole', act: (w) => w.engine.emit('poleMount', { pos: w.player.position, material: 'wood' }) },
  { at: 4.95, label: 'spire land — STONE spire (was step_metal)', act: (w) => w.engine.emit('spireLand', { pos: w.player.position, material: 'stone' }) },
  { at: 5.45, label: 'cane hit', act: (w) => w.engine.emit('caneHit', { pos: w.player.position, index: 3 }) },
  { at: 5.95, label: 'prop smashed — clay jar', act: (w) => w.engine.emit('propSmashed', { pos: w.player.position, material: 'stone', scale: 1 }) },
  { at: 6.45, label: 'enemy bounce — SILENT, no audio subscriber (§384.1)', act: (w) => w.engine.emit('enemyBounce', { pos: w.player.position, strength: 0, stunned: true }) },
  { at: 6.95, label: 'guard spots you — alert ladder to chase', act: (w) => { w.guards.list[0].state = 'chase'; w.engine.emit('guardAlert', { state: 'chase', level: 1, pos: w.guards.list[0].position }); } },
  { at: 7.55, label: 'coin', act: (w) => w.engine.emit('coin', { amount: 1, pos: w.player.position }) },
  { at: 8.05, label: 'treasure fenced — the payoff cue', act: (w) => w.engine.emit('treasureBanked', { id: 't1', name: 'Scarab', value: 120, total: 300 }) },
];
const SESSION = 9.0;

/** Render the whole scripted session through the shipped module. */
function renderSession({ forceMaterial = null } = {}) {
  const w = makeWorld();
  /* The B arm, and the ONLY difference between the two renders. Intercepting at the bus rather
     than editing the script is what makes "one field different, nothing else" true by
     construction: every beat fires identically, the timeline is identical, the seed is
     identical, and the single substitution happens on the payload in flight. */
  if (forceMaterial) {
    const realEmit = w.engine.emit.bind(w.engine);
    w.engine.emit = (evt, payload) => realEmit(
      evt,
      payload && typeof payload === 'object' && 'material' in payload
        ? { ...payload, material: forceMaterial }
        : payload,
    );
  }
  const ctx = new OfflineCtx(SR);
  const audio = new Audio(w.engine);
  /* BOTH, in this order, and the order is the module's own: `init()` is where `_wireEngine` and
     `_hookAnimation` subscribe ("wiring happens now even though there is no context"), and
     `unlock()` is where the graph is built. A harness that calls only `unlock` builds a perfect
     graph that nothing is ever routed into — and the beat-presence bars still PASS, because the
     wind and brazier beds are loud enough to clear any absolute threshold. That is exactly the
     §357.1 shape this session has been auditing, committed by this file on its first run, and it
     is why the recipe ledger below exists: an rms bar cannot tell a cue from its own bed. */
  audio.init();
  audio.unlock(ctx);                       // the documented offline entry — skips the track fetch
  assert.ok(audio.ready, 'the shipped audio graph did not build on the offline context');

  /* ── The reclamation override, and why it is legitimate ────────────────────────────────
     `Audio.update` reclaims a voice once its `end` passes, and `_release` calls `stop()` and
     `disconnect()` on every source. In a live context that is a RESOURCE operation on samples
     the device has already played. In this shim `stop()` with no argument stores `_stop =
     undefined` and the source is erased from the WHOLE render — so reclamation becomes
     retroactive and un-plays the past.

     Left alone, a 9-second session renders its loops and its score and **not one of its
     one-shot cues**, because every one of them is reclaimed before `render()` is called. That
     is exactly what happened here: the fingerprint and the per-beat rms bars were measuring the
     wind and brazier beds, and the B arm is what caught it — two sessions playing demonstrably
     different recipes rendered to `mean |A−B| = 0.00e+0`.

     So the harness overrides the one thing that is a renderer artefact and nothing else: the
     bookkeeping still runs (the voice is freed, `_uncount` still fires, the pool still turns
     over, `max`/`gap` still bite), and only the retroactive teardown of already-scheduled
     sources is skipped. `renderContact` solves the same problem by driving only past the event;
     a full session cannot, because it has to keep running. */
  const realRelease = audio._release.bind(audio);
  audio._release = (v) => {
    if (!v.active) return;
    const srcs = v.srcs;
    v.srcs = [];                       // hide them from the teardown, keep them in the graph
    try { realRelease(v); } finally { v.srcs = srcs.length ? [] : v.srcs; }
    void srcs;
  };

  /* The ledger. Wrapping the shipped `play` is the only way to know a cue was REACHED rather
     than that the window was loud; the bed clears an absolute threshold on its own. */
  const played = [];
  const realPlay = audio.play.bind(audio);
  audio.play = (n, o) => { const v = realPlay(n, o); played.push({ n, ok: !!v, t: ctx.currentTime }); return v; };

  const DT = 1 / 60;
  const fired = [];
  let next = 0;
  for (let f = 0; f * DT <= SESSION; f++) {
    const t = f * DT;
    ctx.currentTime = t;                   // drive the REAL scheduler's clock
    w.engine.time = t;
    while (next < SCRIPT.length && SCRIPT[next].at <= t) {
      SCRIPT[next].act(w);
      fired.push({ ...SCRIPT[next], t });
      next++;
    }
    audio.setListener(w.player.position, w.player.faceDir, new THREE.Vector3(0, 1, 0));
    audio.update(DT, t);
  }
  assert.equal(fired.length, SCRIPT.length, `only ${fired.length} of ${SCRIPT.length} beats fired`);
  return { data: ctx.render(SESSION), audio, world: w, fired, played };
}


/**
 * One contact, rendered alone.
 *
 * The full session measures the MIX, which is right for "did this beat make a sound" and wrong
 * for "what does this contact sound like" — a 0.4 s window of the mix is mostly score and bed,
 * and a centroid over it barely moves when the contact changes. So the material bars use an
 * isolated render instead, and both silencing steps are the SHIPPED ones rather than new code:
 * emitting `shot` runs `Audio.js`'s own loop-stopper (the very line that makes every capture
 * silent — §367 — put to use), and `score.stop(0)` is `Music`'s own. Everything downstream of
 * the voice is untouched: same graph, same pool, same bus, same limiter.
 */
function renderContact(evt, payload, seconds = 0.9) {
  const w = makeWorld();
  const ctx = new OfflineCtx(SR);
  const audio = new Audio(w.engine);
  audio.init();
  audio.unlock(ctx);
  w.engine.emit('shot', { name: 'isolate' });   // shipped: stops every ambient loop
  audio.score?.stop?.(0);                        // shipped: stops the scheduler
  const DT = 1 / 60;
  const FIRE = 6;
  /* Drive only just past the event, then render the full window.
     `Audio.update` reclaims a voice once its `end` has passed, and `_release` calls `stop()` on
     every source with no argument — which this shim stores as `_stop = undefined` and which
     erases the source from the WHOLE render rather than truncating it at that instant. So a
     harness that keeps stepping to the end of the window renders silence and reports it as a
     cue that made no sound. That is a property of the renderer, not of the game: in a live
     context the samples have already reached the device by the time the voice is reclaimed.
     Stopping the driver early is the fix, and the scheduled sources still play out in full
     because everything downstream was scheduled in absolute time. */
  const drive = Math.min(seconds, (FIRE * DT) + 0.20);
  for (let f = 0; f * DT <= drive; f++) {
    const t = f * DT;
    ctx.currentTime = t;
    w.engine.time = t;
    if (f === FIRE) w.engine.emit(evt, { pos: w.player.position, ...payload });
    audio.setListener(w.player.position, w.player.faceDir, new THREE.Vector3(0, 1, 0));
    audio.update(DT, t);
  }
  return ctx.render(seconds);
}

/** Samples for a window around a beat, so a beat can be measured on its own. */
function window_(data, from, to) {
  return data.subarray(Math.max(0, (from * SR) | 0), Math.min(data.length, (to * SR) | 0));
}

const SESSION_CACHE = new Map();
const session = (forceMaterial = null) => {
  const k = forceMaterial || 'A';
  if (!SESSION_CACHE.has(k)) SESSION_CACHE.set(k, renderSession({ forceMaterial }));
  return SESSION_CACHE.get(k);
};

/* ══════════════════════════════════════════════════════════════════ the assertions ══ */

test('the shipped audio graph renders a scripted session offline', () => {
  const { data, audio, world } = session();
  assert.equal(data.length, Math.round(SESSION * SR), 'session length is wrong');
  assert.ok(rms(data) > 1e-5, `the whole session is silent (rms ${rms(data)})`);
  assert.ok(peak(data) > 0, 'no peak at all');

  /* §211.1: prove the instrument drove the real thing, not a stub that happened to make noise. */
  assert.ok(audio._voices.length === TUNE.poolSize, `voice pool is ${audio._voices.length}, expected ${TUNE.poolSize}`);
  assert.ok(audio.reverb, 'no ReverbRack was built');
  assert.ok(audio.limiter && audio.musicBus && audio.sfxBus, 'the bus was not built');
  assert.ok(SECTION_NAMES.includes(audio._section), `score ended in an unknown section "${audio._section}"`);

  const warns = world.engine.warnings.filter((m) => !/track|stem|fetch|WebAudio unavailable/i.test(m));
  assert.deepEqual(warns, [], `the shipped module warned during the session:\n  ${warns.join('\n  ')}`);
  console.log(`  session: ${SESSION}s @ ${SR}Hz, rms ${rms(data).toFixed(5)}, peak ${peak(data).toFixed(4)}`);
});

test('every scripted beat that should make a sound does, and the one that should not does not', () => {
  const { data, fired } = session();
  const rows = [];
  for (const b of fired) {
    const w = window_(data, b.t, b.t + 0.45);
    rows.push({ label: b.label, t: b.t, rms: rms(w), peak: peak(w) });
  }
  for (const r of rows) console.log(`  ${r.t.toFixed(1).padStart(5)}s  rms ${r.rms.toFixed(5)}  ${r.label}`);

  /* The bounce is the §384.1 finding made audible: `enemyBounce` has a publisher, an FX
     subscriber and a Controller consumer, and NO audio subscriber — so the one moment Sly
     strikes a body is silent. `tests/eventbus.test.mjs` scores it live and always will, because
     the census cannot see an event whose SECOND listener is missing. This is the bar that can.
     It is written to FAIL THE DAY SOMEBODY VOICES IT, which is the correct behaviour: that is a
     design decision and it should have to come here and delete this line deliberately. */
  const bounce = rows.find((r) => r.label.startsWith('enemy bounce'));
  const bed = rms(window_(data, bounce.t - 0.35, bounce.t - 0.05));
  assert.ok(bounce.rms <= bed * 1.25,
    `enemyBounce now makes a sound (rms ${bounce.rms.toFixed(5)} against a ${bed.toFixed(5)} bed). `
    + 'If that was deliberate, delete this assertion and say so — §384.1 recorded it as silent.');

  /* Everything else must clear the bed it sits on. */
  let checked = 0;
  for (const r of rows) {
    if (r.label.startsWith('enemy bounce')) continue;
    assert.ok(r.rms > 1e-5, `"${r.label}" at ${r.t}s produced nothing (rms ${r.rms})`);
    checked++;
  }
  assert.equal(checked, rows.length - 1, 'did not check every audible beat');
});

test('the three contacts that carried no material now sound like three different things', () => {
  /* §383: `ledgeGrab`, `railMount` and `spireLand` each played a hardcoded recipe because the
     event carried no material — `step_cloth` on a stone ledge, `step_metal` on a stone spire,
     and one metal catch for both the bronze cable and the three `rope_fibre` ropes the level
     authors. MOVEMENT publishes `material` on all eight contacts as of this hour, and AUDIO
     read none of them until this round. This is the bar that says it does now.

     Isolated renders, so the quantity is the contact and not the mix. A rail mount on metal and
     on cloth is the SAME event with one field different: if they come back identical, the field
     is not reaching the recipe, and no amount of level work would ever fix it. */
  /* `centroid` returns {hz, frames} normally and a bare 0 for an all-silent buffer. */
  const spec = (d) => { const c = centroid(d, SR, { size: 1024, hop: 256 }); return typeof c === 'number' ? c : c.hz; };
  const rail = (m) => renderContact('railMount', { material: m });

  const metal = spec(rail('metal'));
  const cloth = spec(rail('cloth'));
  const wood = spec(rail('wood'));
  const stone = spec(rail('stone'));
  console.log(`  railMount centroid — metal ${metal.toFixed(0)} · cloth ${cloth.toFixed(0)} · wood ${wood.toFixed(0)} · stone ${stone.toFixed(0)} Hz`);

  const all = [metal, cloth, wood, stone];
  const spread = Math.max(...all) / Math.min(...all);
  assert.ok(spread > 1.25,
    `four materials on one event span only ${spread.toFixed(2)}x (${all.map((v) => v.toFixed(0)).join('/')} Hz) — `
    + 'the payload is published but not reaching the recipe');
  /* 50 Hz, and the control below is what licenses a threshold this fine: a material-blind event
     renders at EXACTLY the same centroid across materials (spread 1.000x), so the noise floor on
     this instrument is zero and any separation at all is signal. The cable/rope pair is the
     narrowest of the four because `hook_catch` carries most of the energy and the material
     arrives as a layer under it — which is the right mix, and it is why the four-way spread
     above is the primary bar and this one is the specific-pair check. */
  assert.ok(Math.abs(metal - cloth) > 50,
    `a bronze cable (${metal.toFixed(0)} Hz) and a rope-fibre rail (${cloth.toFixed(0)} Hz) are only `
    + `${Math.abs(metal - cloth).toFixed(0)} Hz apart — the three rope_fibre rails the level authors `
    + 'are still being voiced as bronze');

  /* MUST FIRE: the same instrument on an event that carries no material has to show NO spread,
     or the spread above is measuring per-play variation rather than the material. `caneHit` is
     material-blind by design — the cane is the cane whatever it strikes. */
  const blind = ['metal', 'cloth', 'wood'].map((m) => spec(renderContact('caneHit', { material: m, index: 3 })));
  const blindSpread = Math.max(...blind) / Math.min(...blind);
  console.log(`  caneHit (control, material-blind) — ${blind.map((v) => v.toFixed(0)).join('/')} Hz, spread ${blindSpread.toFixed(3)}x`);
  assert.ok(blindSpread < 1.02,
    `the material-blind control moved ${blindSpread.toFixed(3)}x across materials — this instrument `
    + 'cannot tell a material apart from ordinary per-play variation, so the bar above proves nothing');

  /* And the two that were measurably wrong: a stone ledge must no longer be voiced as cloth,
     and a stone spire must no longer be voiced as metal. Compare each against what the level
     actually tags it, played through the same event. */
  const ledgeStone = spec(renderContact('ledgeGrab', { material: 'stone' }));
  const ledgeCloth = spec(renderContact('ledgeGrab', { material: 'cloth' }));
  assert.ok(Math.abs(ledgeStone - ledgeCloth) > 40,
    `ledgeGrab renders stone and cloth ${Math.abs(ledgeStone - ledgeCloth).toFixed(0)} Hz apart — still hardcoded`);
  const spireStone = spec(renderContact('spireLand', { material: 'stone' }));
  const spireMetal = spec(renderContact('spireLand', { material: 'metal' }));
  assert.ok(Math.abs(spireStone - spireMetal) > 40,
    `spireLand renders stone and metal ${Math.abs(spireStone - spireMetal).toFixed(0)} Hz apart — still hardcoded`);
  console.log(`  ledgeGrab stone ${ledgeStone.toFixed(0)} vs cloth ${ledgeCloth.toFixed(0)} Hz · spireLand stone ${spireStone.toFixed(0)} vs metal ${spireMetal.toFixed(0)} Hz`);
});

test('the session is diffable — a stable fingerprint over the shipped render', () => {
  /* A wav on disk is for listening; this is for arguing. Coarse enough not to trip on
     floating-point noise, fine enough that a changed recipe, bus level or schedule moves it. */
  const { data } = session();
  const BANDS = 15;
  const per = Math.floor(data.length / BANDS);
  const sig = [];
  for (let i = 0; i < BANDS; i++) {
    const w = data.subarray(i * per, (i + 1) * per);
    sig.push(`${rms(w).toFixed(4)}/${peak(w).toFixed(3)}`);
  }
  console.log(`  fingerprint: ${sig.join(' ')}`);
  assert.equal(sig.length, BANDS);
  assert.ok(sig.some((s) => !s.startsWith('0.0000')), 'every band is silent — the fingerprint says nothing');

  /* No dump here — the deliverable is the blind PAIR written by the A/B test below, and a
     third file in the directory a listener opens is one more thing to explain. */
});

/** Mono 16-bit PCM. The only thing here a listener can actually use. */
function writeWav(path, data) {
  {
    const n = data.length;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
      const v = Math.max(-1, Math.min(1, data[i]));
      buf.writeInt16LE((v < 0 ? v * 0x8000 : v * 0x7fff) | 0, 44 + i * 2);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buf);
    console.log(`  wrote ${path} (${(buf.length / 1024).toFixed(0)} kB, ${SESSION}s mono ${SR}Hz)`);
  }
}

/* ═══════════════════════════════════ round 12 — the three gaps the session did not cover ══
 *
 * Two of these ask BEHAVIOURAL questions — did the right cue fire at the right rung, did the
 * room change when the player walked into the tomb — and behavioural questions do not need a
 * render. Driving the frames is nearly free; `ctx.render()` is the expensive part and it is
 * superlinear (3 s : 1.6 s, 6 s : 3.4 s, 12 s : 12.1 s). So these drive and observe, and only
 * the spectral question below renders. Measuring the right quantity is also the cheap one here,
 * which is not usually the way round.
 */

/** Drive the shipped module through a timeline without rendering. Returns what it did. */
function drive(beats, seconds, { listener } = {}) {
  const w = makeWorld();
  const ctx = new OfflineCtx(SR);
  const audio = new Audio(w.engine);
  audio.init();
  audio.unlock(ctx);
  const played = [];
  const realPlay = audio.play.bind(audio);
  audio.play = (n, o) => { const v = realPlay(n, o); played.push({ n, ok: !!v, t: ctx.currentTime }); return v; };

  const DT = 1 / 60;
  const trace = [];
  let next = 0;
  for (let f = 0; f * DT <= seconds; f++) {
    const t = f * DT;
    ctx.currentTime = t;
    w.engine.time = t;
    while (next < beats.length && beats[next].at <= t) { beats[next].act(w, audio); next++; }
    const p = listener ? listener(t) : w.player.position;
    audio.setListener(p, w.player.faceDir, new THREE.Vector3(0, 1, 0));
    audio.update(DT, t);
    trace.push({ t, section: audio._section, space: audio._space, alert: audio._alert });
  }
  assert.equal(next, beats.length, `only ${next} of ${beats.length} beats fired`);
  return { audio, world: w, played, trace };
}

test('the alert ladder climbs and comes back down, in cues and in the score', () => {
  /* The ladder is the one part of the audio design with a pre-registered suite behind it
     (`ALERT_FOR_STATE` → `SECTION_FOR_ALERT`), and nothing has ever heard it. The DESCENT
     matters as much as the climb: a stealth game that can only escalate tells the player the
     room never becomes safe again. `sectionDebounce` is 1.6 s, so each rung gets 1.8 s. */
  const RUNGS = ['patrol', 'suspicious', 'searching', 'chase', 'searching', 'suspicious', 'patrol'];
  const beats = RUNGS.map((state, i) => ({
    at: 0.4 + i * 1.8,
    act: (w) => {
      w.guards.list[0].state = state;
      w.engine.emit('guardAlert', { state, level: state === 'chase' ? 1 : 0.5, pos: w.guards.list[0].position });
    },
  }));
  const { trace, played } = drive(beats, 0.4 + RUNGS.length * 1.8 + 0.5);

  /* The score must reach the top and come back. `_wantSection` maps rung → section through
     SECTION_FOR_ALERT, and `alert`/`chase` are the two that only a real escalation reaches. */
  const sections = [...new Set(trace.map((r) => r.section))];
  const alerts = trace.map((r) => r.alert);
  const peakAlert = Math.max(...alerts);
  const endAlert = alerts[alerts.length - 1];
  console.log(`  ladder: sections visited ${sections.join(' → ')}; alert peaked ${peakAlert}, ended ${endAlert}`);

  assert.equal(peakAlert, 3, `the ladder peaked at rung ${peakAlert}, not chase`);
  assert.ok(endAlert < peakAlert, `the ladder never came down (ended at ${endAlert} of ${peakAlert})`);
  assert.ok(sections.includes('chase'), `the score never reached chase; visited ${sections.join(', ')}`);
  assert.ok(sections.length >= 3, `the score only visited ${sections.length} section(s) across a full ladder`);
  for (const s of sections) assert.ok(SECTION_NAMES.includes(s), `unknown section "${s}"`);

  /* And the cues. The ladder is not only a music change — `_onGuardAlert` fires a sting and a
     vocal per rung, and those are the part a player actually localises. */
  const names = new Set(played.filter((p) => p.ok).map((p) => p.n));
  const ladderCues = ['alert_sting', 'search_call', 'guard_shout', 'guard_grunt', 'guard_confused'];
  const heard = ladderCues.filter((n) => names.has(n));
  console.log(`  ladder cues heard: ${heard.join(', ') || '(none)'}`);
  assert.ok(heard.length >= 2,
    `a full ascent and descent fired only ${heard.length} of the ladder's ${ladderCues.length} cues (${heard.join(', ')})`);
});

test('walking into the tomb changes the room, and walking out changes it back', () => {
  /* The only bar on this list that asks whether the game sounds like ONE PLACE rather than a
     set of cues. `_autoSpace` reads the listener against §8.1's coordinate contract and needs
     two agreeing samples 0.35 s apart, so a doorway cannot flap. Driven by moving the listener,
     not by calling setSpace — the routing under test is the automatic one. */
  const COURT = new THREE.Vector3(0, 1, 20);      // z in (-16, 36), |x| < 30, y < 20  → courtyard
  const TOMB = new THREE.Vector3(0, -9, -66);     // y < -3 and z < -50                → tomb
  const path = (t) => (t < 2.0 ? COURT : t < 5.0 ? TOMB : COURT);
  const { trace, audio } = drive([], 7.5, { listener: path });

  const spaceAt = (t) => trace.find((r) => r.t >= t)?.space;
  const seq = [];
  for (const r of trace) if (seq[seq.length - 1] !== r.space) seq.push(r.space);
  console.log(`  spaces: ${seq.join(' → ')} (wet ${seq.map((s) => SPACES_WET[s]).join(' → ')})`);

  assert.equal(spaceAt(1.5), 'courtyard', 'did not start in the courtyard');
  assert.equal(spaceAt(4.5), 'tomb', `walked into the tomb and the room stayed "${spaceAt(4.5)}"`);
  assert.equal(spaceAt(7.0), 'courtyard', `walked back out and the room stayed "${spaceAt(7.0)}"`);
  assert.equal(audio.reverb.space, 'courtyard', 'the ReverbRack did not follow the listener back');

  /* MUST FIRE: the vote is what stops a doorway flapping, so a single sample in the tomb must
     NOT switch the room. Without this the test above passes on an implementation with no
     hysteresis at all, which is the bug `_autoSpace` was written to prevent. */
  const blip = (t) => (t > 2.0 && t < 2.2 ? TOMB : COURT);
  const flap = drive([], 4.0, { listener: blip });
  const flapped = [...new Set(flap.trace.map((r) => r.space))];
  assert.deepEqual(flapped, ['courtyard'],
    `a 0.2 s dip into the tomb changed the room to ${flapped.join('/')} — the two-sample vote is not holding`);
});

test('every class of cue reaches the room, and the send level follows the published formula', () => {
  /* §383.1 established from source that no class sits outside the reverb: positional voices send
     at `wet × (0.35 + 0.9k)` and flat ones at `wet × 0.28`. I have flagged that as a source
     reading for three rounds because `webaudio.mjs` renders Convolver as a pass-through.
     ROUTING AND TAIL ARE DIFFERENT CLAIMS and only the tail needs a convolution: `OfflineCtx
     .render(seconds, node)` takes any node, so rendering `audio.reverb.input` measures exactly
     what reached the send. The tail stays unsettleable here; the routing does not.

     Ratios throughout, so `wet`, the space, the recipe's own gain and everything downstream all
     cancel — the only thing under test is `_placeVoice`'s two branches. */
  const sendOf = (payload, seconds = 0.9) => {
    const w = makeWorld();
    const ctx = new OfflineCtx(SR);
    const audio = new Audio(w.engine);
    audio.init(); audio.unlock(ctx);
    w.engine.emit('shot', { name: 'isolate' });
    audio.score?.stop?.(0);
    const DT = 1 / 60;
    for (let f = 0; f * DT <= 0.3; f++) {
      const t = f * DT; ctx.currentTime = t; w.engine.time = t;
      if (f === 6) w.engine.emit('landed', { force: 11, surface: 'stone', ...payload });
      audio.setListener(w.player.position, w.player.faceDir, new THREE.Vector3(0, 1, 0));
      audio.update(DT, t);
    }
    return { send: rms(ctx.render(seconds, audio.reverb.input)), mix: rms(ctx.render(seconds)) };
  };

  const near = sendOf({ pos: new THREE.Vector3(0, 0, 20) });                 // dist 0   → k 0
  const far = sendOf({ pos: new THREE.Vector3(0, 0, -15) });                 // dist 35  → k 0.5
  const flat = sendOf({});                                                   // no position → flat
  console.log(`  send rms — near ${near.send.toFixed(6)} · far ${far.send.toFixed(6)} · flat ${flat.send.toFixed(6)}`);
  console.log(`  send/mix — near ${(near.send / near.mix).toFixed(4)} · flat ${(flat.send / flat.mix).toFixed(4)}`);

  /* 1. NO CLASS IS OUTSIDE THE ROOM. This is the §383.1 claim, and it is the half that matters:
        a flat cue that never reached the send would sit on top of the picture the way an
        un-inked sprite does. */
  for (const [label, r] of [['near', near], ['far', far], ['flat', flat]]) {
    assert.ok(r.send > 1e-6, `a "${label}" cue put nothing into the reverb send — it is outside the room`);
  }

  /* 2. The level SCALES WITH DISTANCE. A constant send would give a ratio of 1.0; the published
        formula gives (0.35 + 0.45)/0.35 = 2.29 before the air shelf, which cuts the top end at
        distance and pulls a broadband ratio down. 1.5 is comfortably between the two and cannot
        be reached by a send that does not move. */
  const distRatio = far.send / near.send;
  console.log(`  far/near send ratio ${distRatio.toFixed(3)} (formula predicts 2.29 pre-shelf, a constant send would give 1.00)`);
  assert.ok(distRatio > 1.5,
    `the send barely moved with distance (${distRatio.toFixed(3)}×) — it is not tracking (0.35 + 0.9k)`);

  /* 3. Flat cues send LESS than a near positional one, per 0.28 vs 0.35. Same recipe both times —
        `flat` is `def.flat || !pos`, so omitting the position is what flips the branch, and
        nothing else about the sound changes. */
  const flatRatio = flat.send / near.send;
  console.log(`  flat/near send ratio ${flatRatio.toFixed(3)} (formula predicts 0.28/0.35 = 0.80)`);
  assert.ok(flatRatio > 0.5 && flatRatio < 1.0,
    `a flat cue sent ${flatRatio.toFixed(3)}× a near positional one; the formula says 0.80`);
});

test('the A/B pair is comparable, differs, and renders blind for a listener', () => {
  /* Task #27's second arm. B is the session with every contact's `material` forced to `stone` —
     one field, substituted on the bus in flight, so the script, the timeline and the seed are
     bit-identical between arms. This is the control for Q2's forced choice: not "is A better
     than the old hardcoded guesses" (that would be a regression comparison against three
     different recipes) but "**is material variety audible at all**", which is the question the
     1.63× centroid spread cannot answer. */
  const A = session();
  const B = session('stone');

  /* ── COMPARABILITY FIRST, because two arms that are not comparable are worse than one ──────
     `step_*` recipes carry `max: 3` per NAME. In A the contacts spread across step_stone,
     step_metal, step_cloth and step_wood; in B they all pile onto step_stone, so B could start
     rejecting plays that A accepted — and then B would be quieter for a reason that has nothing
     to do with material, which would invalidate the whole comparison. Measured, not assumed. */
  const okOf = (r) => r.played.filter((p) => p.ok).length;
  const rejOf = (r) => r.played.filter((p) => !p.ok).length;
  console.log(`  A: ${okOf(A)} plays accepted, ${rejOf(A)} rejected · B: ${okOf(B)} accepted, ${rejOf(B)} rejected`);
  assert.equal(okOf(A), okOf(B),
    `A accepted ${okOf(A)} plays and B accepted ${okOf(B)} — B is hitting a per-name concurrency `
    + 'cap A does not, so the two arms differ by more than one field and cannot be compared. '
    + 'Widen the contact spacing in SCRIPT or ship A alone with this note.');
  assert.equal(A.data.length, B.data.length, 'the two arms are different lengths');

  /* ── AND THEY MUST DIFFER, or the B arm proves nothing ────────────────────────────────── */
  const recipes = (r) => [...new Set(r.played.filter((p) => p.ok).map((p) => p.n))].sort();
  const aOnly = recipes(A).filter((n) => !recipes(B).includes(n));
  console.log(`  recipes only in A: ${aOnly.join(', ') || '(none)'}`);
  assert.ok(aOnly.length >= 2,
    `forcing every material to stone removed only ${aOnly.length} recipe(s) from the session — `
    + 'the arms are nearly identical and a listener has nothing to choose between');

  let diff = 0;
  for (let i = 0; i < A.data.length; i++) diff += Math.abs(A.data[i] - B.data[i]);
  const meanDiff = diff / A.data.length;
  console.log(`  mean |A−B| ${meanDiff.toExponential(2)} over ${(A.data.length / SR).toFixed(1)}s`);
  assert.ok(meanDiff > 1e-6, 'the two arms render identically — the material substitution did nothing');

  if (DUMP) {
    /* Blind by construction: the arm→file assignment is randomised per run and written to a key
       the listener is not meant to open first. Nobody has to script anything — play 1, play 2,
       answer, then read KEY.txt. That is the whole reason the forced choice is the right
       question: it needs no expertise, only ears. */
    const dir = DUMP.replace(/\/$/, '');
    const flip = Math.random() < 0.5;
    writeWav(`${dir}/session-1.wav`, flip ? B.data : A.data);
    writeWav(`${dir}/session-2.wav`, flip ? A.data : B.data);
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/KEY.txt`,
      `audiosession task #27 — blind A/B\n\n`
      + `session-1.wav = ${flip ? 'B' : 'A'}\nsession-2.wav = ${flip ? 'A' : 'B'}\n\n`
      + `A = the session as it ships: each contact voiced by the material it actually struck.\n`
      + `B = identical in every way except that every contact's material is forced to "stone".\n\n`
      + `Q2: "Between 3 and 5 seconds the character touches five things. How many different\n`
      + `     materials do you hear? Name them." Then: "Which recording has more variety in\n`
      + `     what he is touching?"\n\n`
      + `A null result is USEFUL and is pre-registered: if the two are indistinguishable, the\n`
      + `material layer is real, measurable and inaudible — an instruction to raise its level,\n`
      + `not a refutation. See the protocol block at the head of tests/audiosession.test.mjs.\n`);
    console.log(`  wrote ${dir}/KEY.txt (blind assignment)`);
  }
});

test('guards are heard by distance, and only the nearest few are heard at all', () => {
  /* `_trackGuards` is the one path where the earshot cull and the voice budget do real work, and
     it has never been exercised by anything. Drive-and-observe: the question is which guards
     produced footfalls, which is a ledger question, not a spectral one. */
  const far = TUNE.guardEarshot + 20;

  /* Six guards: four inside earshot walking, one just outside, one far outside. Positions are
     advanced by hand each frame so `_trackGuards`' distance-travelled footfall driver fires. */
  const w = makeWorld();
  const ctx = new OfflineCtx(SR);
  const audio = new Audio(w.engine);
  audio.init(); audio.unlock(ctx);
  const heard = [];
  const realPlay = audio.play.bind(audio);
  audio.play = (n, o) => { const v = realPlay(n, o); if (v && n === 'guard_step') heard.push(o?.position); return v; };

  const G = [
    { id: 'near1', d: 6 }, { id: 'near2', d: 10 }, { id: 'near3', d: 14 }, { id: 'near4', d: 18 },
    { id: 'near5', d: 22 }, { id: 'outside', d: far },
  ].map((g, i) => ({ id: g.id, state: 'patrol', position: new THREE.Vector3(g.d, 0, 0), _d: g.d,
    /* Staggered speeds, deliberately. Six guards marching at an identical pace cross
       `TUNE.guardStride` on the SAME frame, and `guard_step`'s per-name concurrency cap then
       rejects all but the first few — so a lockstep test measures the cap and reports it as the
       nearest-few budget. Real patrols are not synchronised; this makes the cull and the budget
       the things under test rather than an artefact of the script. */
    speed: 1.4 + i * 0.37 }));
  w.guards.list = G;

  const DT = 1 / 60;
  for (let f = 0; f * DT <= 6.0; f++) {
    const t = f * DT;
    ctx.currentTime = t; w.engine.time = t;
    for (const g of G) g.position.z += g.speed * DT;      // each at its own pace
    audio.setListener(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
    audio.update(DT, t);
  }

  /* Which guards were audible, by the x they were standing at. */
  const xs = [...new Set(heard.map((p) => Math.round(p.x)))].sort((a, b) => a - b);
  console.log(`  guards heard at x = ${xs.join(', ')} (earshot ${TUNE.guardEarshot} m, budget ${TUNE.guardVoices} voices)`);
  assert.ok(heard.length > 0, 'six walking guards produced no footsteps at all');
  assert.ok(!xs.includes(Math.round(far)),
    `a guard at ${far} m was audible past the ${TUNE.guardEarshot} m earshot cull`);
  assert.ok(xs.length <= TUNE.guardVoices,
    `${xs.length} guards were audible at once against a budget of ${TUNE.guardVoices} — the nearest-few cap is not holding`);
  assert.ok(xs[0] <= 10, `the nearest guard (6 m) was not among those heard; heard ${xs.join(',')}`);
});

test('the ladder cues are not merely played — each one renders as sound', () => {
  /* Closing the hole I left in the ladder bar: it asserts from the play ledger, so a cue fired
     into a misconfigured voice would still pass. The ledger closed "the window was loud"; this
     closes "played but inaudible". Isolated renders, ~0.3 s each, so it costs a fraction of a
     session rather than a second one. */
  const rung = (state) => {
    const w = makeWorld();
    const ctx = new OfflineCtx(SR);
    const audio = new Audio(w.engine);
    audio.init(); audio.unlock(ctx);
    w.engine.emit('shot', { name: 'isolate' });
    audio.score?.stop?.(0);
    const names = [];
    const realPlay = audio.play.bind(audio);
    audio.play = (n, o) => { const v = realPlay(n, o); if (v) names.push(n); return v; };
    const DT = 1 / 60;
    for (let f = 0; f * DT <= 0.30; f++) {
      const t = f * DT; ctx.currentTime = t; w.engine.time = t;
      if (f === 6) {
        w.guards.list[0].state = state;
        w.engine.emit('guardAlert', { state, level: state === 'chase' ? 1 : 0.5, pos: w.guards.list[0].position });
      }
      audio.setListener(w.player.position, w.player.faceDir, new THREE.Vector3(0, 1, 0));
      audio.update(DT, t);
    }
    return { names, rms: rms(ctx.render(1.4)) };
  };

  let checked = 0;
  for (const state of ['suspicious', 'searching', 'chase']) {
    const r = rung(state);
    console.log(`  rung "${state}" → ${r.names.join(', ') || '(nothing)'}  rms ${r.rms.toFixed(6)}`);
    assert.ok(r.names.length > 0, `rung "${state}" played nothing`);
    assert.ok(r.rms > 1e-6,
      `rung "${state}" played ${r.names.join(', ')} and rendered SILENCE (rms ${r.rms.toExponential(2)}) — `
      + 'the cue reaches the voice and the voice makes no sound');
    checked++;
  }
  assert.equal(checked, 3, 'did not check every rung');
});
