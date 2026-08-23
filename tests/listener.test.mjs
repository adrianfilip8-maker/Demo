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
