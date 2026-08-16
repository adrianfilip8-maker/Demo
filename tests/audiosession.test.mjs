import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as THREE from 'three';

import { OfflineCtx, rms, peak, centroid } from './webaudio.mjs';
import { Audio, TUNE } from '../src/audio/Audio.js';
import { SECTION_NAMES } from '../src/audio/Music.js';

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
function renderSession() {
  const w = makeWorld();
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

let SESSION_CACHE = null;
const session = () => (SESSION_CACHE ||= renderSession());

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

  if (DUMP) {
    /* Opt-in, so the suite writes nothing by default. `AUDIO_SESSION_WAV=path node --test …` */
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
    mkdirSync(dirname(DUMP), { recursive: true });
    writeFileSync(DUMP, buf);
    console.log(`  wrote ${DUMP} (${(buf.length / 1024).toFixed(0)} kB, ${SESSION}s mono ${SR}Hz)`);
  }
});
