import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Audio, TUNE } from '../src/audio/Audio.js';
import { OfflineCtx, rms } from './webaudio.mjs';

/**
 * listener — where the ear is, and why no audio test could ever have told us (§669).
 *
 * ── The three compounding blindnesses, established rather than asserted ───────────────────────
 *
 * The user reports near-silence with one exception. §548 had already counted 43 sounds, 26
 * subscribed events and 22 that start a voice, and proved every publication has a subscriber. All
 * of that is true and none of it is about whether a sound is HEARD. Three separate properties of
 * the existing audio suite make "the player cannot hear this" unrepresentable in it:
 *
 *   1. **`webaudio.mjs`'s `PannerNode` is a pass-through.** Its own header says so — "this
 *      renderer answers questions about *what a sound is*, not about where it sits". It stores
 *      `positionX/Y/Z` and applies **no distance attenuation whatever**. A sound 200 m away
 *      renders at exactly the level of one at your feet. A3 below proves that, rather than
 *      trusting the comment.
 *   2. **No audio test supplies a camera.** `audio.test.mjs`, `audiowired.test.mjs` and
 *      `audiolatency.test.mjs` all set `camera: null`; `audiosession.test.mjs`'s engine stub has
 *      no `camera` key at all. `Audio.update` reads `const cam = this.engine.camera; if (cam)` —
 *      so **`setListener` has never been called by any test in this project.** The listener sits
 *      at its constructor value `(0, 2, 0)` for the entire life of every audio suite.
 *   3. **Every source is fired within the cull radius of that pinned listener.**
 *      `audiosession`'s player stands at `(0, 0, 20)`, 20 m from a listener at the origin, and
 *      `TUNE.cull` is 95 m. Nothing is ever near the boundary that decides audibility.
 *
 * Any one of those alone would hide a spatialisation fault. Together they make the audio suite
 * structurally incapable of distinguishing a game you can hear from one you cannot — §439, in the
 * subsystem the user is complaining about.
 *
 * ── What this file does and does not settle ──────────────────────────────────────────────────
 *
 * MEASURED here: that `Audio` tracks a camera when it is given one; that `play()` culls by
 * distance from the listener; and that the offline renderer cannot see the difference.
 * NOT measured here: whether the SHIPPED game's camera moves — that is a browser question and
 * `tools/audible.mjs` is where it is asked. This file is the guard that would go red if the
 * listener stopped following, and the proof that nothing else would.
 */

const SR = 44100;

/** The engine stub the audio tests use, plus the one field every one of them left null. */
function engineStub({ camera = null } = {}) {
  const listeners = new Map();
  const player = { position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(), speed: 0, grounded: true, stateName: 'idle' };
  return {
    camera, scene: null, quality: 'high', dt: 1 / 60, time: 0, warnings: [],
    warn(m) { this.warnings.push(String(m)); },
    get(k) { return k === 'movement' ? player : null; },
    has() { return false; },
    on(e, f) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e).add(f); return () => listeners.get(e).delete(f); },
    emit(e, p) { for (const f of listeners.get(e) || []) f(p); },
    _player: player,
  };
}

function liveAudio({ camera = null } = {}) {
  const engine = engineStub({ camera });
  const audio = new Audio(engine);
  audio.unlock(new OfflineCtx(SR));      // the module's own documented offline entry
  return { engine, audio };
}

const cam = (x, y, z) => {
  const c = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 4000);
  c.position.set(x, y, z);
  c.updateMatrixWorld(true);
  return c;
};

/* ====================================================================== */
test('listener A1: the ear follows the camera when there is one', () => {
  /* DOMAIN (§418.3)
   * passes on : a real `Audio` on an engine WITH a camera — after `update()` the cached listener
   *             `_lx/_ly/_lz` equals the camera's world position, and follows it when it moves.
   * fails on  : `camera: null` — the exact configuration `audio.test.mjs`, `audiowired.test.mjs`
   *             and `audiolatency.test.mjs` all ship — run in-arm. The listener must then STAY at
   *             the constructor's (0, 2, 0). Without that arm this would pass on a build where
   *             `setListener` did nothing, because the constructor value already looks plausible.
   * does not discriminate: whether the SHIPPED camera moves (browser question,
   *             `tools/audible.mjs`), and anything about level or spectrum. */
  const c = cam(40, 3, -60);
  const { audio } = liveAudio({ camera: c });
  audio.update(1 / 60, 0);
  assert.ok(Math.abs(audio._lx - 40) < 1e-3 && Math.abs(audio._ly - 3) < 1e-3 && Math.abs(audio._lz + 60) < 1e-3,
    `the ear did not follow the camera: (${audio._lx}, ${audio._ly}, ${audio._lz})`);

  c.position.set(-12, 8, 5); c.updateMatrixWorld(true);
  audio.update(1 / 60, 1 / 60);
  assert.ok(Math.abs(audio._lx + 12) < 1e-3 && Math.abs(audio._lz - 5) < 1e-3,
    `the ear did not track a MOVE: (${audio._lx}, ${audio._ly}, ${audio._lz})`);

  /* The failing input, run in-arm: the configuration every existing audio test uses. */
  const nocam = liveAudio({ camera: null });
  nocam.audio.update(1 / 60, 0);
  assert.deepEqual(
    [nocam.audio._lx, nocam.audio._ly, nocam.audio._lz], [0, 2, 0],
    'with camera:null the listener moved — then this arm is not measuring the camera path at all');

  console.log('[listener A1] with a camera the ear tracks to the centimetre; with `camera: null` — '
    + 'what every existing audio test passes — it never leaves (0, 2, 0)');
});

/* ====================================================================== */
test('listener A2: play() culls a positional sound by distance from the EAR, not the player', () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped `play()` — with the ear pinned at the origin, a one-shot fired beyond
   *             `TUNE.cull` returns null and starts no voice, while the same sound at the ear
   *             returns a handle. That is the mechanism by which a mis-placed listener produces
   *             SILENCE rather than quiet, and it is plain JS, so it is real here.
   * fails on  : the same far sound with the ear MOVED to it, run in-arm — it must then play. If
   *             it did not, the arm would be measuring some other refusal (throttle, pool
   *             exhaustion, a missing def) and would read as a cull that is not there.
   * does not discriminate: loudness. `def.loop` sounds bypass the cull entirely, and the offline
   *             panner applies no attenuation at all — see A3. */
  const { audio } = liveAudio({ camera: cam(0, 2, 0) });
  audio.update(1 / 60, 0);

  const near = audio.play('step_stone', { position: { x: 0, y: 0, z: 0 } });
  assert.ok(near, 'the control sound did not play at the ear — this arm cannot show a cull');

  const far = audio.play('step_stone', { position: { x: 0, y: 0, z: -(TUNE.cull + 40) } });
  assert.equal(far, null,
    `a sound ${TUNE.cull + 40} m from the ear was NOT culled — TUNE.cull no longer bounds audibility`);

  /* The failing input, run in-arm: move the ear to the far sound and it must play. */
  const c2 = cam(0, 2, -(TUNE.cull + 40));
  const two = liveAudio({ camera: c2 });
  two.audio.update(1 / 60, 0);
  const moved = two.audio.play('step_stone', { position: { x: 0, y: 0, z: -(TUNE.cull + 40) } });
  assert.ok(moved,
    'with the ear AT the far sound it still did not play — the refusal above is not a distance cull');

  console.log(`[listener A2] ear at origin: a step at 0 m plays, the same step at ${TUNE.cull + 40} m is `
    + 'culled to null; move the ear there and it plays again');
});

/* ====================================================================== */
test('listener A3: the offline renderer cannot hear distance — proved, not assumed', () => {
  /* DOMAIN (§418.3)
   * passes on : two renders of the SAME sound through the shipped graph, one at the ear and one
   *             at 90 m (inside `cull`, so both actually play), coming out at the same level.
   *             That is `webaudio.mjs`'s `PannerNode` being a pass-through, demonstrated.
   * fails on  : the two levels differing — which would mean the renderer HAD gained distance
   *             attenuation, and then this file's whole premise, and §669's, needs re-deriving.
   *             Also asserted in-arm: both renders must be non-silent, or "equal" would be the
   *             trivial equality of two silences, which is exactly the vacuity this session keeps
   *             finding.
   * does not discriminate: what a browser would do — a real `PannerNode` at 90 m with
   *             `refDistance` 6 and `rolloff` 1.05 is roughly -23 dB, and nothing here can show
   *             that. This arm exists to bound the instrument, not the game. */
  const render = (z) => {
    const { audio } = liveAudio({ camera: cam(0, 2, 0) });
    audio.update(1 / 60, 0);
    const h = audio.play('step_stone', { position: { x: 0, y: 0, z } });
    assert.ok(h, `the probe sound did not play at z ${z}`);
    return rms(audio.ctx.render(1.0));
  };

  const atEar = render(0);
  const far = render(-90);
  assert.ok(atEar > 1e-5 && far > 1e-5,
    `one of the renders is silent (ear ${atEar.toExponential(2)}, far ${far.toExponential(2)}) — `
    + 'two silences are trivially equal and would fake this arm');
  const ratio = far / atEar;
  assert.ok(ratio > 0.7 && ratio < 1.4,
    `the offline renderer attenuated by distance (ratio ${ratio.toFixed(3)}) — it has gained a real `
    + 'panner, and §669\'s account of why the audio suite is blind must be re-derived');

  console.log(`[listener A3] same sound at the ear and at 90 m renders at ratio ${ratio.toFixed(3)} — `
    + 'the offline panner applies no distance attenuation, so no offline test can measure audibility');
});

/* ====================================================================== */
test('listener A4: no filter corner is ever set above the context Nyquist', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped graph built on a **32 kHz** context — the rate the user's own console
   *             reported ("nominal range [0, 16000]") — with every filter corner this file can set
   *             landing at or below 16000: the build default, all six section cutoffs, and both
   *             directions of the Thief-o-Vision ramp.
   * fails on  : the same corners taken RAW, run in-arm — 20000 must be shown to exceed that
   *             Nyquist. Without it the arm would pass on a build where every corner happened to
   *             be small, and would say nothing about the clamp.
   * does not discriminate: audibility. A 16 kHz lid on music is very nearly transparent, so this
   *             fixes a console warning and a correctness bug, and is NOT evidence about what the
   *             user can hear (§690).
   *
   * ── Why no test caught this ────────────────────────────────────────────────────────────────
   * `tests/webaudio.mjs` implements `BiquadFilterNode` without the spec's nominal-range clamp, so
   * an out-of-range corner renders silently. `audiosession.test.mjs` has run at **SR 22050** —
   * Nyquist 11025 — the whole time, setting 20000 Hz corners on every render, and nothing said a
   * word. §669's disease in a new parameter: the instrument cannot express the failure.
   */
  const { OfflineCtx: OC } = await import('./webaudio.mjs');
  const RATE = 32000;                       // the user's context, from their own console
  const ny = RATE / 2;

  const engine = engineStub({ camera: cam(0, 2, 0) });
  const audio = new Audio(engine);
  audio.unlock(new OC(RATE));
  assert.equal(audio.ctx.sampleRate, RATE, 'the harness did not build at the rate under test');

  /* The build default. */
  assert.ok(audio.musicFilter.frequency.value <= ny,
    `musicFilter opened to ${audio.musicFilter.frequency.value} on a ${RATE} Hz context (Nyquist ${ny})`);

  /* Every corner the module can ask for, through the shipped clamp. */
  const { SECTION_STEM } = await import('../src/audio/Audio.js');
  const corners = [20000, TUNE.thiefFilter, TUNE.airShelfHz, 1800, 4600];
  for (const c of corners) {
    assert.ok(audio._hz(c) <= ny, `_hz(${c}) returned ${audio._hz(c)}, above Nyquist ${ny}`);
    assert.ok(audio._hz(c) > 0, `_hz(${c}) returned ${audio._hz(c)} — an exponential ramp needs > 0`);
  }

  /* Both directions of the Thief-o-Vision ramp actually run, on this context, without throwing. */
  engine.emit('thiefVision', true);
  engine.emit('thiefVision', false);
  assert.ok(audio.musicFilter.frequency.value <= ny, 'the un-duck left the corner above Nyquist');

  /* The failing input, run in-arm: raw 20000 must exceed this Nyquist, or the clamp is vacuous. */
  assert.ok(20000 > ny,
    `20000 does not exceed Nyquist ${ny} at ${RATE} Hz — this arm cannot show the clamp doing anything`);

  /* And a 48 kHz context must NOT be clamped, or the fix would be quietly dulling everyone else. */
  const wide = new Audio(engineStub({ camera: cam(0, 2, 0) }));
  wide.unlock(new OC(48000));
  assert.equal(wide._hz(20000), 20000, 'a 48 kHz context had its 20 kHz corner clamped — the fix is over-reaching');

  console.log(`[listener A4] at ${RATE} Hz every corner lands <= ${ny} (raw 20000 would not); `
    + `at 48000 Hz 20000 passes through untouched`);
});

/* ====================================================================== */
test('listener A5: every music duck is followed by an un-duck, and the log cannot be silently dead', async () => {
  /* DOMAIN (§418.3)
   * passes on : three Thief-o-Vision cycles interleaved with ducks, on a 32 kHz context — the
   *             `musicLog` records equal numbers of `thief-on` and `thief-off`, no duck target
   *             below `TUNE.musicFloor`, and the filter restored to Nyquist at the end.
   * fails on  : an EMPTY log, asserted in-arm. The first version of `_logMusic` pushed to an
   *             uninitialised array, the logger's own try/catch swallowed the TypeError and
   *             `selfTest()`'s `|| []` rendered a permanently empty list that read exactly like
   *             "nothing has ducked yet" (§691). A length assertion is the only thing that can
   *             tell those two apart, and without it this whole arm would pass on a dead logger.
   * does not discriminate: audibility, and whether a REAL session ducks in this pattern — this
   *             drives the transitions directly rather than through gameplay. */
  const { OfflineCtx: OC } = await import('./webaudio.mjs');
  /* BOTH, in the module's own order: `init()` is where `_wireEngine` subscribes to `thiefVision`,
     `unlock()` is where the graph is built. A rig that only unlocks builds a perfect graph nothing
     is routed into — and the first draft of this arm did exactly that, logging the ducks it called
     directly and none of the mode changes it emitted. */
  const engine = engineStub({ camera: cam(0, 2, 0) });
  const audio = new Audio(engine);
  await audio.init();
  audio.unlock(new OC(32000));

  const DT = 1 / 60;
  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { t += DT; audio.ctx.currentTime = t; audio.update(DT, t); } };
  step(60);
  for (let k = 0; k < 3; k++) {
    engine.emit('thiefVision', true);  step(45);
    audio.duckMusic(0.9);              step(30);
    engine.emit('thiefVision', false); step(60);
    audio.duckMusic(0.5);              step(30);
  }

  const log = audio._musicLog;
  assert.ok(Array.isArray(log) && log.length > 0,
    'the music log is empty or missing — a logger that cannot record is indistinguishable from a '
    + 'game that never ducks, which is exactly how §691 shipped broken');

  const on = log.filter((e) => e.ev === 'thief-on').length;
  const off = log.filter((e) => e.ev === 'thief-off').length;
  assert.equal(on, off, `${on} duck-downs against ${off} ups — a mode is latching shut`);
  assert.ok(on >= 3, `only ${on} cycles recorded of the 3 driven — the log is dropping entries`);

  const targets = log.filter((e) => e.to !== undefined).map((e) => e.to);
  assert.ok(targets.length > 0, 'no duck targets recorded');
  assert.ok(Math.min(...targets) >= TUNE.musicFloor - 1e-9,
    `a duck targeted ${Math.min(...targets)}, below the floor ${TUNE.musicFloor}`);

  assert.equal(audio._musicBase, 1, 'the score was left ducked after the last un-duck');

  console.log(`[listener A5] ${on} on / ${off} off — paired; lowest duck target `
    + `${Math.min(...targets)} (floor ${TUNE.musicFloor}); ${log.length} entries recorded`);
});

/* ====================================================================== */
test('listener A6: selfTest reports WHERE the sound goes, not only that it exists', async () => {
  /* DOMAIN (§418.3)
   * passes on : a machine whose `enumerateDevices()` lists a controller-shaped `audiooutput` —
   *             `output.controllerLike` names it and the hint leads with it, ahead of the
   *             "sound IS leaving the page" wording that six rounds ended on.
   * fails on  : the SAME call on a machine listing only "Speakers (Realtek High Definition
   *             Audio)", run in-arm — `controllerLike` must be empty and the hint must NOT name a
   *             controller. Without that arm a hint hard-coded to the most dramatic cause would
   *             pass, which is the failure this whole thread has been made of.
   * does not discriminate: **which device is actually selected.** `sinkId` is `''` for "system
   *             default", and that is precisely the failing case, so this can never prove the
   *             fault — only put it in front of someone. Asserted below as a property of the
   *             report rather than left as a caveat in prose.
   *
   * ── §691, the shape ────────────────────────────────────────────────────────────────────────
   * `selfTest` measures rms at `masterGain`: correct, downstream of the limiter, the sub-cut and
   * the reverb return — and blind to the last link. An instrument that verifies the whole chain up
   * to the final hop and never checks the final hop reads healthy through exactly this failure.
   * Same family as `webaudio.mjs`'s pass-through panner and the audio suite's missing camera, one
   * step further out.
   */
  const { OfflineCtx: OC } = await import('./webaudio.mjs');
  const realNav = globalThis.navigator;
  const withDevices = async (outs) => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: { enumerateDevices: async () => outs } },
      configurable: true, writable: true,
    });
    const engine = engineStub({ camera: cam(0, 2, 0) });
    const audio = new Audio(engine);
    await audio.init();
    audio.unlock(new OC(32000));
    audio.ctx.sinkId = '';                       // the browser's "system default" value
    return audio.selfTest({ seconds: 0.05 });
  };

  try {
    const pad = await withDevices([
      { kind: 'audiooutput', deviceId: 'default', label: 'Speakers (Realtek High Definition Audio)' },
      { kind: 'audiooutput', deviceId: 'abc123', label: 'Wireless Controller' },
      { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone' },
    ]);
    assert.deepEqual(pad.output.controllerLike, ['Wireless Controller'],
      'a controller-shaped audio output was listed and not reported');
    assert.match(pad.hint, /CONTROLLER IS REGISTERED AS AN AUDIO OUTPUT/,
      `the hint did not lead with the one cause a page cannot fix: "${pad.hint}"`);
    assert.equal(pad.output.audioOutputs.length, 2, 'the input device was counted as an output');

    /* The failing input, run in-arm. */
    const plain = await withDevices([
      { kind: 'audiooutput', deviceId: 'default', label: 'Speakers (Realtek High Definition Audio)' },
    ]);
    assert.deepEqual(plain.output.controllerLike, [],
      'a machine with only speakers reported a controller — the match is not discriminating');
    assert.doesNotMatch(plain.hint, /CONTROLLER IS REGISTERED/,
      `no controller was present and the hint still named one: "${plain.hint}"`);

    /* The limitation, asserted rather than left in prose: "" cannot clear the hypothesis. */
    assert.match(plain.output.note, /SYSTEM DEFAULT/,
      'an empty sinkId must say it means the system default, or the report implies it has ruled '
      + 'the device question out when it has not');

    console.log(`[listener A6] controller present -> ${JSON.stringify(pad.output.controllerLike)}, `
      + `hint leads with it; speakers only -> [] and it does not. sinkId "" note: `
      + `"${plain.output.note.slice(0, 46)}…"`);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: realNav, configurable: true, writable: true });
  }
});
