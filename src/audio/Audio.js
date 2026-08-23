import * as THREE from 'three';
import { rng, WORLD_SEED } from '../core/Rand.js';
import { SFX, SFX_NAMES, stepFor } from './Sfx.js';
import { Music, SECTION_NAMES } from './Music.js';

/**
 * Three ADAPTIVE CUES. Provenance in `public/assets/audio/PROVENANCE.md`.
 *
 * These replace the single-recording-plus-lowpass approximation that shipped first. That version
 * faked a section change by dropping level and closing a filter on one fixed track, which is the
 * best a single recording can do and is audibly not a different arrangement.
 *
 * **THIS FILE USED TO CALL THEM "three different arrangements of one piece" AND SAY THEY WERE AT
 * "the same tempo". THEY ARE NOT, AND THAT WAS LOAD-BEARING.** Decoded in an `OfflineAudioContext`
 * and cross-correlated on their short-time energy envelopes over the first 120 s (50 ms frames,
 * lags searched +-5 s), `explore` against `sneak` scores **0.122** at zero lag and against `chase`
 * **0.013**; the best lag anywhere in +-5 s is 0.225 and 0.091. The calibration arm — the same
 * measure against a time-reversed copy of `explore` itself — scores 0.163, so the instrument can
 * tell "unrelated" from "aligned", and 0.122 is squarely in the unrelated half. Autocorrelation
 * puts `explore` at 120 BPM and the other two at 80. The commit that installed them
 * (6f03a03) calls them "the three Black Chateau loops": three separate pieces from one episode's
 * score, which is exactly what the numbers say.
 *
 * Two things followed from believing otherwise, and both are fixed below:
 *
 *  1. The old `_stemEpoch` started a newly-decoded cue at the *elapsed position of a different
 *     cue*, on the reasoning that they were bar-locked. They are not, so that dropped the player
 *     into an arbitrary interior point of an unrelated piece. Cues now start at their own zero.
 *  2. `_selectStem` cross-faded with LINEAR ramps, which is the correct law for correlated
 *     material and the wrong one for uncorrelated material. See `equalPowerCurve`.
 *
 * LOADED LAZILY, ONE AT A TIME, and that is a memory decision rather than laziness. Decoded PCM is
 * Float32 at the context rate: 168 s x 48 kHz x 2 ch x 4 B is **~64 MB per stem**, so holding all
 * three from boot costs ~193 MB of AudioBuffer for audio nobody has asked for yet. Most sessions
 * need `explore` plus at most one other. The cost of deferring is a decode gap on the first
 * transition, which `_selectStem` covers by leaving the current stem up until the new one is ready.
 */
export const STEM_FILES = {
  explore: 'bc-explore.mp3',
  sneak: 'bc-sneak.mp3',
  chase: 'bc-chase.mp3',
};

/**
 * Measured, not estimated. Decoded through Chromium's `decodeAudioData` into an
 * `OfflineAudioContext` at 8 kHz mono; `duration` independently agrees with a pure-Node scan of
 * the committed MPEG frame headers to under a millisecond, and `tests/audio.test.mjs` re-derives
 * that scan on every run so these constants cannot drift away from the files they describe.
 *
 * `rms` is the whole-file RMS and it is the reason this table exists: **`sneak` is 17.0 dB
 * quieter than `explore`**, and `TRACK_SECTION` then multiplied it by a further 0.55. The stealth
 * cue — the one that has to sit under footsteps rather than vanish — was landing 22.2 dB below
 * the exploration cue, which is not "quieter", it is "off".
 */
export const STEM_STATS = {
  explore: { duration: 168.0456, peak: 1.011022, rms: 0.252636 },
  sneak:   { duration: 172.5910, peak: 0.865267, rms: 0.035718 },
  chase:   { duration: 167.2620, peak: 1.018388, rms: 0.170547 },
};
/* Music.js's six sections onto the three arrangements that exist. `menu` and `treasure` borrow
   `explore` rather than getting a stem of their own — TRACK_SECTION still moves their level and
   filter, so they are distinguishable without pretending an arrangement exists that does not. */
/** §551: the gesture kinds that count as "the player has touched the page". */
const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'];

export const SECTION_STEM = {
  explore: 'explore', treasure: 'explore',
  sneak: 'sneak', alert: 'chase', chase: 'chase',
};

/**
 * Level and filter shape per section, applied ON TOP of whichever stem `SECTION_STEM` selected.
 * Level multiplies `TUNE.trackLevel`; cutoff drives the shared `musicFilter`, the same lowpass the
 * synthesised path used for the same purpose.
 *
 * Both layers still earn their place. The stems differ in ARRANGEMENT, this differs in PRESENCE,
 * and `menu`/`treasure` have no stem of their own so the shape is the only thing distinguishing
 * them. The shape follows what the procedural sections did with their layer mixes: `sneak` dropped
 * the kit and lead almost to nothing, so here it drops level and closes the filter.
 */
export const TRACK_SECTION = {
  explore:  { level: 1.00, cutoff: 20000 },
  /* 0.55 -> 0.85. The old value was set as if `sneak` were the same recording heard more
     quietly. It is a different, far quieter recording, and `STEM_MAKEUP` now carries the level
     matching, so this number is free to mean what it says: a section that pulls back a little. */
  sneak:    { level: 0.85, cutoff: 1800 },
  alert:    { level: 1.00, cutoff: 20000 },
  chase:    { level: 1.00, cutoff: 20000 },
  treasure: { level: 0.95, cutoff: 20000 },
};

/**
 * Per-cue makeup gain, so three separately-mastered recordings arrive at the mixer at comparable
 * level. Derived, not dialled: the rule is
 *
 *     makeup = min( rms(explore)/rms(stem),  1 / (peak(stem) * trackLevel * maxSectionLevel) )
 *
 * — match `explore`'s loudness if you can, and stop at whatever keeps the peak at unity if you
 * can't. `sneak` hits the peak arm: its crest factor is 27.7 dB (a sparse, quiet piece with big
 * transients), so no amount of makeup makes it as loud as `explore` without clipping its peaks
 * or compressing them. It lands 11.6 dB down instead of 22.2 dB down, which is a stealth cue
 * that pulls back rather than one that disappears.
 *
 * `maxSectionLevel` is the loudest `TRACK_SECTION` entry any section mapped to this stem uses,
 * because the peak has to survive the loudest case, not the average one.
 */
export const STEM_MAKEUP = { explore: 1.0000, sneak: 2.1930, chase: 1.4813 };
/* All six of Music.js's sections are covered deliberately. An earlier version of this table had
   four and relied on the `|| TRACK_SECTION.explore` fallback for `chase` and `treasure` — which
   works, and would have silently made the two most dramatic beats in the game indistinguishable
   from ordinary walking. A fallback that never fires is a safety net; one that quietly carries two
   real cases is a missing feature wearing a safety net's clothes. */
/**
 * Equal-power cross-fade shape, as an explicit curve rather than a ramp.
 *
 * When two signals are CORRELATED, their amplitudes add and a linear ramp pair sums to a
 * constant — that is the right law for cross-fading two mixes of one performance, and it is the
 * law this file used to use. When they are UNCORRELATED their POWERS add instead, and a linear
 * pair sums to sqrt(a^2+b^2) which bottoms out at 0.707 halfway across: an audible level hole in
 * the middle of every transition. Measurement says these three cues correlate at 0.012-0.122
 * (see `STEM_STATS`), so equal-power is the correct law and linear was measurably wrong.
 *
 * With rho the measured correlation, the perceived level through the fade is
 *     L(x) = sqrt(a(x)^2 + b(x)^2 + 2*rho*a(x)*b(x))
 * At rho = 0.122 the linear pair dips to **-2.74 dB** at the midpoint and the equal-power pair
 * rises to **+0.25 dB**. `tests/audio.test.mjs` holds both against a +-0.5 dB gate registered
 * before this function was written, and uses the linear pair as the arm that must fail.
 *
 * `v0` is where the fader already is, so an interrupted transition resumes from the right point
 * on the curve instead of jumping: the two faders are parameterised by the same `x`, so if they
 * were power-complementary when the interruption arrived they stay power-complementary through
 * the new fade.
 */
export function equalPowerCurve(v0, target, n = 129) {
  const v = Math.max(0, Math.min(1, v0));
  const up = target >= 0.5;
  // Where on the quarter-cycle this fader already sits. Both directions solve for the same x.
  const x0 = up ? (2 / Math.PI) * Math.asin(v) : (2 / Math.PI) * Math.acos(v);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = x0 + (1 - x0) * (i / (n - 1));
    curve[i] = up ? Math.sin((Math.PI / 2) * x) : Math.cos((Math.PI / 2) * x);
  }
  curve[n - 1] = up ? 1 : 0;      // land exactly, so a fade-out really is silence
  return curve;
}

/**
 * The detection ladder, and the reason it is a table.
 *
 * `src/ai/Patrol.js` (the GUARDS agent's file, not this one) grades detection across seven
 * states. This file used to parse them with an inline conditional that recognised `'chase'`,
 * `'alert'` and `'suspicious'` and sent **everything else to calm** — so `searching` and `lost`,
 * the two states where a guard has lost sight of Sly but is actively hunting him, both read as
 * "he gave up". The music relaxed and a stand-down grunt played while the guard was walking the
 * route looking for you. It also recognised `'alert'`, which is not a state any guard can be in.
 *
 * A state the player can only see is a state they miss while looking somewhere else, and these
 * were the two rungs where the player still has the option to leave.
 *
 * Keys are the exact `STATE` values from Patrol.js. `tests/audio.test.mjs` reads that file and
 * fails if it ever grows a state this table does not name.
 */
export const ALERT_FOR_STATE = {
  patrol: 0,
  stunned: 0,
  ko: 0,
  suspicious: 1,
  searching: 2,
  lost: 2,          // he has lost sight of you and is still looking. That is not calm.
  chase: 3,
};

/** Section per rung. `suspicious` thins the mix out rather than escalating — the classic tell. */
export const SECTION_FOR_ALERT = ['explore', 'sneak', 'alert', 'chase'];

import { ReverbRack, SPACES } from './Reverb.js';

/**
 * Audio — the mixer, the spatialiser, and the glue to the rest of the game.
 *
 * Sfx.js says what things sound like, Music.js writes the score, Reverb.js builds
 * the rooms; this file decides what gets heard, from where, and how loud.
 *
 * **THIS FILE USED TO SAY "everything is synthesised (AGENTS.md §1): no files, no CDN, no
 * decodeAudioData", and that is no longer true.** The score is now three MP3 stems decoded through
 * `decodeAudioData` (see `STEM_FILES`), and §1's constraint is superseded for music only. Everything
 * else still holds and matters: SFX remain fully synthesised, nothing is fetched from a CDN, the
 * assets are served from the app's own origin, and `Music.js`'s procedural score is retained as the
 * fallback rather than deleted — a failed fetch or decode degrades to it instead of to silence. The
 * stale sentence is quoted rather than merely removed, because a reader who knows the old constraint
 * should be able to see that it was changed on purpose and not simply violated.
 *
 * **These three stems are NOT the owner-supplied recording, and this comment used to say they
 * were** (§548). The sentence was written when the single supplied track was swapped for three
 * stems, and it carried the supplied track's provenance across the substitution. The two are
 * different files from different commits: `9a8a06e` installed the owner-supplied
 * `museum-of-natural-history.mp3` "with provenance"; `6f03a03`, eighty minutes later, installed
 * `bc-explore/sneak/chase.mp3` encoded in-container "from 97 MB of WAV" whose origin its own
 * message does not state. `public/assets/audio/PROVENANCE.md` records that origin as **unstated**
 * and says in as many words that the owner's standing instruction names the museum track and the
 * `Sly_Cooper` model, **not** these. Nothing is claimed here on their behalf in either direction —
 * read that file, which is the record.
 *
 * Three constraints shape the design:
 *
 *  **Autoplay.** A context created before a user gesture is born suspended and
 *  Chrome logs a warning for every node you touch. So there is no context until
 *  `unlock()`, and every entry point is a no-op until then. `main.js` calls
 *  `unlock()` on the first click or keypress.
 *
 *  **Headless.** The screenshot harness boots the whole game with no audio device
 *  and no gesture. Nothing in here may throw in that world — it simply stays
 *  silent, and a capture is never lost to an audio bug.
 *
 *  **Frame budget.** `update()` allocates nothing: scratch vectors are hoisted,
 *  the voice pool is preallocated, and voices are reclaimed by index scan. Starting
 *  a sound does allocate source nodes, because the Web Audio API requires a fresh
 *  one per note — that is the only allocation, and it happens on events, not frames.
 */

export const TUNE = {
  master: 0.7,            // default master, before the limiter
  maxVoices: 32,          // hard concurrency cap
  poolSize: 44,           // slots > cap so a stolen voice can fade while a new one starts
  cull: 95,               // metres past which a one-shot is not worth a voice
  rolloff: 1.05,
  maxDistance: 220,
  airShelfDb: -11,        // high-shelf cut applied at max distance (air absorption)
  airShelfHz: 3200,
  musicSend: 0.10,        // the score gets a touch of the room, never a wash
  /* `sfxDuck: 0.45` lived here, commented "default sidechain depth for impacts", and **nothing
     ever read it**: the only duck in the play path is `if (def.duck) this.duckMusic(def.duck)`
     (line ~700), which takes the per-sound value or ducks not at all. So the "default" was a
     number describing a fallback that does not exist, and the nine sounds that declare their
     own `duck` in Sfx.js (0.16 … 0.55) were always the whole story. Removed rather than wired:
     applying it as a real fallback would sidechain the score under *every* sound including
     footsteps, which is a mix change no one can hear-test while §186 holds the capture lock.
     Recorded instead of deleted silently, so the next reader knows the fallback was considered
     and declined rather than overlooked. */
  duckAttack: 0.04,
  duckRelease: 0.5,
  thiefMusic: 0.34,       // music level while Thief-o-Vision is up
  /* Recorded score, below the 0.85 musicBus so the mix still has headroom for sfx. Set from the
     track's own loudness rather than to taste: the supplied file is a 64 kbps master that already
     sits hot, and matching the synthesised score's perceived level put it over the limiter. */
  trackLevel: 0.62,
  thiefFilter: 620,       // ...and the lowpass that puts it behind glass
  coinStreakWindow: 1.9,
  coinStreakMax: 11,
  listenerSmooth: 0.02,
  spaceFade: 1.5,
  alertHold: 7.0,         // seconds of calm before the score relaxes again
  /**
   * How long the score stays in `treasure` after a treasure is fenced.
   *
   * Derived, not chosen. `Music.barSeconds` is `(60 / bpm) * 4` and `SECTIONS.treasure` runs at
   * 96 bpm, so a bar is 2.500 s and **four bars is 10.000 s** — one complete harmonic statement
   * of `FORM_TREASURE` (Dmaj9#11 · Dmaj9#11 · Bm7 · Gmaj7), which is the whole point of the
   * section: its own comment reads "the parallel major finally arrives", and an arrival that is
   * cut off before it lands is not one. The full eight-bar form (20 s) was the other candidate
   * and is too long a tail on a beat the player answers by walking back out into the level.
   *
   * The floor this has to clear: `stemFade` is 1.6 s each way, so 10 s leaves 6.8 s at full
   * level. A cue whose cross-fades are longer than its plateau is not a cue, it is a wobble.
   */
  treasureHold: 10.0,
  sectionDebounce: 1.6,
  /* One number for the whole music transition. It used to be two — 1.6 s for the arrangement
     cross-fade and 1.2 s for the level/filter move — which meant the level finished shifting
     0.4 s before the arrangement did, and put a level step in the middle of every cross-fade.
     Long enough not to click, short enough that being spotted still reads as a cue. */
  stemFade: 1.6,
  /* ---- guards you can hear ---- */
  guardEarshot: 34,       // metres past which a guard's footsteps are not worth a voice
  guardVoices: 4,         // how many guards may be audible at once, nearest first
  guardStride: 0.92,      // metres of travel per footfall
  guardChatMin: 7.0,      // seconds between idle noises from any one guard
  guardChatMax: 17.0,
};

/* ---- scratch: hoisted so update() never allocates ---- */
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export class Audio {
  constructor(engine) {
    this.engine = engine;

    this.ctx = null;
    this.ready = false;
    this.available = typeof window !== 'undefined'
      && !!(window.AudioContext || window.webkitAudioContext);

    this.master = TUNE.master;
    this.muted = false;

    /** One deterministic stream for every per-play variation (AGENTS.md §1). */
    this.rand = rng(WORLD_SEED ^ 0x4155440);

    this._voices = [];
    this._active = 0;
    this._nameCount = Object.create(null);
    this._lastPlay = Object.create(null);
    this._nextId = 1;

    this._space = 'courtyard';
    this._spaceVote = 'courtyard';
    this._spaceTimer = 0;

    this._section = 'explore';
    this._sectionAuto = true;
    this._sectionTimer = 0;
    this._autoOverrideFor = 0;

    /** 0 calm · 1 suspicious · 2 searching · 3 chasing — the four rungs of ALERT_FOR_STATE. */
    this._alert = 0;
    this._alertTimer = 0;
    /** Seconds of `treasure` left to run after a fence. See TUNE.treasureHold. */
    this._treasure = 0;
    this._thief = false;
    /** guard id -> rung, so the score tracks the whole garrison rather than the last speaker. */
    this._guardRung = new Map();
    /** guard id -> { x, z, acc, chat, clank } stride bookkeeping for audible footsteps. */
    this._guardStep = new Map();
    this._nearGuards = [];

    this._playerState = 'idle';
    this._loops = Object.create(null);   // state-driven continuous voices, by key

    this._coinStreak = 0;
    this._coinAt = -10;
    this._scuffTimer = 0;
    this._lastHook = null;

    this._lx = 0; this._ly = 2; this._lz = 0;
    this._listenerTime = 0;
    this._windOpen = 0.8;

    this._unsub = [];
    /* §551: stem bytes fetched BEFORE the gesture, waiting to be decoded. Keyed by stem name.
       `decodeAudioData` detaches the ArrayBuffer, so an entry is spent on first use. */
    this._bytes = new Map();
    this._prefetched = false;
    this._gestureGo = null;
    /* §551: true once the module loop has ticked us — i.e. `engine.start()` has run and boot's
       heavy phase is over. The stem fetch waits for it; see `unlock()`. */
    this._framed = false;
    this._offline = false;
    this._trackKicked = false;

    this._animHooked = false;
    this._animRetry = 0;
    this._pendingMusic = null;
    this._warned = false;

    /* §551: arm the gesture listener HERE, in the constructor, not in `init()`.
       Measured, and this is the correction to my own first attempt: `main.js` builds every module
       in one loop and then initialises them in a SECOND loop, and `audio` is 30th of 31. Arming in
       `init()` therefore armed it in the last moments of boot — a click 2 s into a 34 s boot was
       still thrown away, which a browser run caught after the unit test had passed. The
       construction loop only awaits dynamic imports; the init loop is where the texture bake, the
       level build and the shader compile happen, which is where the time goes and which is what
       the progress bar is showing. Arming at construction moves this from "after 30 module inits"
       to "after 30 module imports". */
    this._armGesture();
  }

  /* ===================== lifecycle =================================== */

  async init() {
    // Wiring happens now even though there is no context: events that arrive before
    // the first gesture are simply dropped, and nothing has to be re-subscribed later.
    this._wireEngine();
    this._hookAnimation();
    /* Idempotent: normally the constructor already armed this. It is repeated here as the
       safety net for a harness that constructs before `window` exists and only then supplies it. */
    this._armGesture();
    if (!this.available) this._warn('WebAudio unavailable — running silent.');
  }

  /**
   * §551 — take the FIRST gesture on the page, whenever it happens.
   *
   * The defect this closes, measured in §550: `main.js` registers its own gesture listener at
   * line 306, **after every module has initialised**. A player who clicks the progress bar — the
   * natural thing to do while a game loads — clicks nothing at all, because no handler exists yet,
   * and must click a second time once the game is up. The audio ceiling was `boot + gesture + 5 ms`
   * only because of that ordering.
   *
   * This listener is armed during module init, so it is live for the whole of the rest of boot.
   *
   * **It calls `unlock()` from inside the real handler rather than recording a flag and replaying
   * it later, and that is a deliberate choice about an assumption I could not verify.** The
   * cheaper design is to note "a gesture happened" and unlock at end of boot; it depends on
   * Chrome's autoplay policy keying on the activation having *occurred* rather than on the context
   * predating it. That is very likely true, but this container **cannot measure it**: headless
   * Chromium applies no autoplay restriction at all, and forcing
   * `--autoplay-policy=user-gesture-required` does not change that, because there is no audio
   * device for the policy to govern. The probe's own calibration arm caught it and voided itself
   * twice rather than reporting a comfortable answer (§551).
   *
   * Creating the context INSIDE the handler needs no such assumption: it satisfies the strictest
   * reading of the policy and the loosest one identically. It is also strictly earlier than end of
   * boot, so it beats the target it replaces.
   *
   * The consequence, stated rather than buried: a player who clicks during loading now hears the
   * ambience and the score for the remainder of loading, instead of silence and a wasted click.
   * `main.js`'s own `begin()` still runs on the next gesture and still owns pointer lock — that
   * half is not this file's and is unchanged.
   */
  _armGesture() {
    /* Not gated on `available`: `unlock()` already declines safely when WebAudio is missing, and
       gating here would mean a harness that sets `available` after construction never arms. */
    if (typeof window === 'undefined' || this._gestureGo) return;
    const go = () => {
      try { this.unlock(); } catch { /* a failed unlock must never break the page */ }
      /* §552: only stop listening once sound is genuinely running. A context created from a
         POLLED gamepad press may be born suspended — a pad button is not a DOM event and browsers
         do not count it as user activation — and in that state a real click is the only thing that
         can start it. Disarming on the first call would throw that click away, which is the same
         mistake §551 fixed one layer up. */
      if (this.audible) this._disarmGesture();
    };
    this._gestureGo = go;
    for (const t of GESTURE_EVENTS) {
      try { window.addEventListener(t, go, { passive: true, capture: true }); } catch {}
    }
  }

  _disarmGesture() {
    const go = this._gestureGo;
    if (!go) return;
    this._gestureGo = null;
    for (const t of GESTURE_EVENTS) {
      try { window.removeEventListener(t, go, { capture: true }); } catch {}
    }
  }

  /**
   * §551 — pull the first stem's BYTES while the player is still reading "click to start".
   *
   * Measured in §550: the fetch begins *inside* `unlock()`, 356 ms after the click, and nothing
   * preloads it — there is no `<link rel=preload>` anywhere and `_loadTrack` has two callers. The
   * bytes need no AudioContext, only the network, so the whole transfer can happen in time that is
   * currently spent waiting for a human to react.
   *
   * Called from `update()`'s not-ready branch, which is exactly the window this wants: frames are
   * running, so boot has reached `engine.start()`, and audio has not been unlocked yet.
   *
   * **The guard is the point.** The screenshot harness boots this game sixteen times a critic set
   * and never clicks, so an unguarded prefetch would pull 2.24 MB × 16 for a signal no frame can
   * show. `unlock(existing)` already declines `_loadTrack` for precisely that reason; this
   * inherits that decision by testing the same thing `main.js` tests, rather than inventing a
   * second policy that could drift away from it. `tests/audiolatency.test.mjs` asserts the guard.
   */
  _prefetchStem() {
    if (this._prefetched) return;
    this._prefetched = true;
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    try { if (new URLSearchParams(window.location.search).has('shot')) return; } catch { return; }
    const name = SECTION_STEM[this._section] || 'explore';
    /* `_stems` is built in `_buildGraph`, which only runs at unlock — and the whole point of this
       method is that it runs BEFORE that. Optional, therefore, rather than assumed. */
    if (this._stems?.has(name) || this._bytes.has(name)) return;
    const url = `assets/audio/${STEM_FILES[name] || STEM_FILES.explore}`;
    try {
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((b) => { if (b) this._bytes.set(name, b); })
        .catch(() => { /* the gesture path re-fetches; a failed prefetch costs nothing */ });
    } catch { /* no fetch in this environment */ }
  }

  /**
   * Create the context. Called from the first user gesture; safe to call again.
   * Everything expensive (noise tables, impulse responses, wavetables) is built
   * lazily on first use, so this returns fast enough to sit inside a click handler.
   *
   * `existing` lets the offline analysis harness hand in an OfflineAudioContext and
   * render the *shipping* signal path — pool, panners, sends, limiter and all —
   * rather than a reimplementation of it. Nothing in the game passes it.
   */
  unlock(existing) {
    /* §552: a REPEAT call retries `resume()` instead of returning flat.
       This used to be `if (this.ctx || …) return this.ready`, and that was a trap the moment
       anything could create the context without a qualifying user gesture. A context born
       SUSPENDED stayed suspended for the life of the page: the later, genuine click came back
       through here, hit the early return, and never resumed it. Silent forever, with a context
       that exists and a `ready` flag that says yes. Retrying costs one no-op promise. */
    if (this.ctx) { this._tryResume(); return this.ready; }
    if (!this.available && !existing) return this.ready;
    try {
      if (existing) this.ctx = existing;
      else {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      }
    } catch (err) {
      this.available = false;
      this._warn(`could not create AudioContext: ${err?.message || err}`);
      return false;
    }

    try {
      this._buildGraph();
      this._buildPool();
      this.ready = true;
    } catch (err) {
      this._warn(`audio graph failed: ${err?.message || err}`);
      this.ready = false;
      try { this.ctx.close(); } catch {}
      this.ctx = null;
      return false;
    }

    // Chrome can still hand back a suspended context; resume is a promise that may
    // reject if the gesture wasn't trusted. Either way we must not throw.
    this._tryResume();

    try {
      this._startBeds();
      this.music(this._pendingMusic || this._section);
      this._pendingMusic = null;
    } catch (err) {
      this._warn(`audio start failed: ${err?.message || err}`);
    }

    /* Fire-and-forget, and NOT under the offline harness.
     *
     * `existing` is the analysis harness's OfflineAudioContext, and every headless capture in this
     * project boots through it. Fetching and decoding a 6.9 MB file on that path would add seconds
     * to each of the sixteen shots in a critic set for a signal no frame can show. It is also
     * deliberately not awaited on the live path: `unlock()` is documented as returning fast enough
     * to sit inside a click handler, and that contract is worth more than the track starting a
     * few hundred milliseconds sooner. */
    this._offline = !!existing;
    /* §551: DEFER the stem fetch until frames are running.
       Now that a gesture during boot unlocks audio (see `_armGesture`), an unconditional fetch
       here would pull 2.24 MB alongside the level's own asset loading and make BOOT slower — and
       boot is the dominant term in §550's measurement. Trading a slower game for earlier music is
       the wrong trade. `update()` kicks it on the first frame instead, which is `engine.start()`,
       after boot's heavy phase. A player who clicks at the "click to start" prompt is already past
       that point, so for them this is unchanged. */
    if (!existing && this._framed) this._kickTrack();

    return this.ready;
  }

  /**
   * Ask the context to run. Safe to call any number of times, on any path.
   *
   * Deliberately swallows: `resume()` rejects when the call did not come from a qualifying user
   * gesture, and that rejection is information we cannot act on — it is the platform's answer, not
   * an error in the page. `state` afterwards is what tells the truth; see `audible`.
   */
  _tryResume() {
    try { this.ctx?.resume?.()?.catch?.(() => {}); } catch {}
  }

  /**
   * Is sound actually coming out — as opposed to "we built a graph"?
   *
   * `ready` means the graph exists. A context can be `ready` and SUSPENDED, which is exactly the
   * state a pad-only player can reach (§552), and the difference is the whole defect. `undefined`
   * state means a context that does not model suspension at all (the offline harness), which is
   * running by definition.
   */
  get audible() {
    if (!this.ready || !this.ctx) return false;
    const st = this.ctx.state;
    return st === undefined || st === 'running';
  }

  /**
   * ── `selfTest()` — the number only the player can read (§671) ────────────────────────────────
   *
   * The user has reported near-silence four times. Everything this project can measure says the
   * audio works: `tools/audible.mjs` taps analysers onto the real graph and reads **rms 0.186 at
   * `masterGain`** on the production build under `/Demo/`, with the listener exactly on the
   * camera, `trackGain` at its full 0.62 and the stem at 1. That is a healthy, clearly audible
   * level, and it is measured, not inferred.
   *
   * So this container and the player disagree, and the reason no round has closed that gap is
   * that **"I hear nothing" and "the page emits nothing" are the same sentence from the outside.**
   * They need a second quantity to tell them apart, and there is exactly one machine that can
   * produce it: the player's own.
   *
   * `__ENGINE.get('audio').selfTest()` measures the signal actually reaching `destination` on
   * THEIR machine and hands back a number:
   *
   *   · `rms` well above zero and they hear nothing  ->  the page is emitting sound and the fault
   *     is downstream of it: output device, tab muted, OS mixer, Bluetooth sink. Nothing in this
   *     repository can fix that and no further code round should be spent looking.
   *   · `rms` at or near zero  ->  the fault IS here, and every field returned alongside says
   *     which link: no context, a suspended context, master at 0, the stem never loaded, the
   *     listener somewhere the camera is not.
   *
   * It is a passive tap. An `AnalyserNode` with nothing connected to its output cannot alter what
   * reaches the destination, and the tap is removed before returning, so calling this can neither
   * change nor damage playback. Nothing calls it automatically; it costs nothing until asked.
   */
  async selfTest({ seconds = 1.5, sound = 'coin' } = {}) {
    const out = {
      ok: false, hint: '', rms: 0, peak: 0, rmsWithSfx: 0,
      ctxState: this.ctx ? this.ctx.state : null,
      ready: this.ready, audible: this.audible, muted: this.muted,
      master: this.master,
      trackState: this._trackState, activeStem: this._activeStem,
      animHooked: !!this._animHooked,
      listener: { x: +this._lx.toFixed(2), y: +this._ly.toFixed(2), z: +this._lz.toFixed(2) },
      voices: 0,
    };
    if (!this.ctx || !this.masterGain) {
      out.hint = 'No AudioContext yet — click the page (or press a controller button) and run this again.';
      return out;
    }
    let an = null;
    try {
      an = this.ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0;
      this.masterGain.connect(an);
      const buf = new Float32Array(an.fftSize);
      const sample = () => {
        an.getFloatTimeDomainData(buf);
        let s = 0, pk = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i];
          s += v * v;
          const av = v < 0 ? -v : v;
          if (av > pk) pk = av;
        }
        return { r: Math.sqrt(s / buf.length), pk };
      };
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));

      /* Pass 1: whatever is already running — ambience and music. */
      const half = Math.max(200, (seconds * 1000) / 2);
      let t0 = Date.now();
      while (Date.now() - t0 < half) {
        const { r, pk } = sample();
        if (r > out.rms) out.rms = r;
        if (pk > out.peak) out.peak = pk;
        await nap(25);
      }

      /* Pass 2: fire one one-shot AT the listener, so a player can tell "music plays but effects
         do not" from "nothing plays". Fired at the ear on purpose — `play()` culls a positional
         sound past TUNE.cull metres, so anywhere else would confound a routing fault with a
         distance one. */
      try { this.play(sound, { position: { x: this._lx, y: this._ly, z: this._lz } }); } catch {}
      t0 = Date.now();
      while (Date.now() - t0 < half) {
        const { r, pk } = sample();
        if (r > out.rmsWithSfx) out.rmsWithSfx = r;
        if (pk > out.peak) out.peak = pk;
        await nap(25);
      }

      out.voices = this._voices.filter((v) => v.active).length;
      out.rms = +out.rms.toFixed(5);
      out.peak = +out.peak.toFixed(5);
      out.rmsWithSfx = +out.rmsWithSfx.toFixed(5);
      out.ok = out.rms > 1e-4 || out.rmsWithSfx > 1e-4;
      out.hint = out.ok
        ? 'Sound IS leaving the page at this level. If you cannot hear it, the fault is after the '
          + 'page: output device, a muted tab, the OS mixer, or a Bluetooth sink.'
        : (this.ctx.state !== 'running'
          ? `The context is "${this.ctx.state}", not running — the browser has not let audio start.`
          : 'The page is producing no signal. The other fields say which link is down.');
    } catch (err) {
      out.hint = `self-test failed: ${err?.message || err}`;
    } finally {
      try { if (an) this.masterGain.disconnect(an); } catch { /* leave the graph as it was */ }
    }
    return out;
  }

  /** Start the first stem load exactly once, and never under the offline/capture harness. */
  _kickTrack() {
    if (this._trackKicked || this._offline || !this.ready) return;
    this._trackKicked = true;
    this._loadTrack(SECTION_STEM[this._section] || 'explore').catch(() => {});
  }

  /**
   * Owner-supplied score: "The Museum of Natural History", Peter McConnell, Sly 2 (2004).
   * Provenance in `public/assets/audio/PROVENANCE.md`.
   *
   * This does NOT delete the procedural score in Music.js. That system writes five sections across
   * seven layers and switches them on game state, which a fixed recording cannot do — so the score
   * is cross-faded down rather than removed, and it comes straight back if the file is missing or
   * fails to decode. `music(section)` keeps working either way; see the note there.
   */
  async _loadTrack(name = 'explore') {
    if (!this.ready || !this.ctx || this._trackState === 'loading') return false;
    const url = `assets/audio/${STEM_FILES[name] || STEM_FILES.explore}`;
    if (this._stems.has(name)) return true;
    this._trackState = 'loading';
    let buf;
    try {
      /* §551: use the bytes `_prefetchStem` already pulled, if it got there first. Spent on use —
         `decodeAudioData` DETACHES the ArrayBuffer, so a retained entry would decode to nothing
         the second time. Falling back to the fetch keeps this path correct when the prefetch was
         guarded off (the capture harness), failed, or simply has not landed yet. */
      let raw = this._bytes.get(name);
      if (raw) this._bytes.delete(name);
      else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        raw = await res.arrayBuffer();
      }
      buf = await this.ctx.decodeAudioData(raw);
    } catch (err) {
      this._trackState = this._stems.size ? 'playing' : 'failed';
      this._warn(`music stem "${name}" unavailable (${err?.message || err})`
        + (this._stems.size ? ' — other stems continue' : ' — procedural score continues'));
      return false;
    }
    if (!this.ready || !this.ctx) { this._trackState = 'idle'; return false; }

    try {
      const t = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      /* Makeup sits on its own node between the cue and the cross-fade gain, so the fade curve
         still runs cleanly 0..1 and the level matching cannot be confused with the transition. */
      const makeup = this.ctx.createGain();
      makeup.gain.value = STEM_MAKEUP[name] ?? 1;
      gain.connect(makeup);
      makeup.connect(this.trackGain);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);

      /* START AT ZERO. The previous version started a new cue at the elapsed position of
         whichever cue was already playing, on the stated grounds that all three were bar-locked
         mixes of one piece. Measurement says they are three unrelated pieces (see `STEM_STATS`),
         so that rule dropped the player into an arbitrary interior point of a piece they had
         never heard the start of — and, because each cue looped on its OWN length (168.05 /
         172.59 / 167.26 s, up to 5.33 s apart), the offset was not even stable. A cue that is
         its own piece should begin at its own beginning. */
      const offset = 0;
      src.start(t, offset);

      this._stems.set(name, { src, gain, makeup, duration: buf.duration });
      this._trackState = 'playing';

      /* First stem in also retires the synthesised score. Four seconds, because both are music
         and a fast swap between two pieces of music reads as a glitch. */
      if (this._stems.size === 1) {
        const FADE = 4.0;
        this.trackGain.gain.cancelScheduledValues(t);
        this.trackGain.gain.setValueAtTime(0, t);
        this.trackGain.gain.linearRampToValueAtTime(TUNE.trackLevel, t + FADE);
        const so = this.score?.output?.gain;
        if (so) {
          so.cancelScheduledValues(t);
          so.setValueAtTime(so.value, t);
          so.linearRampToValueAtTime(0, t + FADE);
        }
      }
      this._selectStem(this._section, t);
      this._warn(`music stem "${name}" ${buf.duration.toFixed(0)}s, looping from ${offset.toFixed(1)}s`);
      return true;
    } catch (err) {
      this._trackState = this._stems.size ? 'playing' : 'failed';
      this._warn(`music stem "${name}" start failed: ${err?.message || err}`);
      return false;
    }
  }

  _buildGraph() {
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.master;
    this.masterGain.connect(ctx.destination);

    /**
     * Limiter. Fast attack, high ratio, hard knee — this is a safety device, not a
     * sound. It exists because a dive attack landing on top of an alert sting on top
     * of six coins is a peak nobody budgeted for, and clipping is the one artefact a
     * player always notices.
     */
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -7;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.22;
    this.limiter.connect(this.masterGain);

    // Nothing musical lives below 28 Hz; letting it through only pumps the limiter.
    this.subCut = ctx.createBiquadFilter();
    this.subCut.type = 'highpass';
    this.subCut.frequency.value = 28;
    this.subCut.Q.value = 0.7;
    this.subCut.connect(this.limiter);

    this.preMaster = ctx.createGain();
    this.preMaster.gain.value = 1;
    this.preMaster.connect(this.subCut);

    this.reverb = new ReverbRack(ctx, this.preMaster, { space: this._space, fade: TUNE.spaceFade });

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.preMaster);

    /* ---- music path: duck → colour filter → bus ---- */
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.85;
    this.musicBus.connect(this.preMaster);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.5;
    this.musicFilter.connect(this.musicBus);

    this.musicDuck = ctx.createGain();
    this.musicDuck.gain.value = 1;
    this.musicDuck.connect(this.musicFilter);

    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = TUNE.musicSend;
    this.musicDuck.connect(this.musicSend);
    this.musicSend.connect(this.reverb.input);

    this._musicBase = 1;
    this.score = new Music(ctx, this.musicDuck, { seed: WORLD_SEED });

    /* The recorded track feeds the SAME node the score does, so it inherits the duck, the colour
       filter, the bus and the reverb send without any of that being re-implemented for it. Silent
       until the file actually decodes — if the fetch fails the score simply keeps playing. */
    this.trackGain = ctx.createGain();
    this.trackGain.gain.value = 0;
    this.trackGain.connect(this.musicDuck);
    this.track = null;
    this._trackState = 'idle';
    /** name -> { src, gain, makeup, duration }. Lazily filled; see STEM_FILES for why. */
    this._stems = new Map();
    /** ctx time the running cross-fade lands, so a re-request mid-fade doesn't restart it. */
    this._stemFadeEnd = 0;
  }

  /**
   * Raise the stem this section wants and lower the others, requesting a decode if it is absent.
   *
   * The current stem is deliberately left audible while a missing one decodes: a gap would be a
   * silence in the middle of a state change, which is worse than half a second of the previous
   * arrangement. Cross-fades are 1.6 s — long enough not to click, short enough that being spotted
   * still feels like a cue.
   */
  _selectStem(section, now = this.ctx?.currentTime ?? 0) {
    if (!this._stems.size) return;
    const want = SECTION_STEM[section] || 'explore';
    if (!this._stems.has(want) && this._trackState !== 'loading') {
      this._loadTrack(want).catch(() => {});
    }
    const active = this._stems.has(want) ? want : this._activeStem;
    if (active === this._activeStem && this._stemFadeEnd > now) return;   // already going there
    this._activeStem = active;
    for (const [name, s] of this._stems) {
      const target = name === active ? 1 : 0;
      const g = s.gain.gain;
      try {
        g.cancelScheduledValues(now);
        // Equal-power, because these three recordings are measurably uncorrelated. A linear
        // pair would put a 2.7 dB hole in the middle of every state change.
        g.setValueCurveAtTime(equalPowerCurve(g.value, target), now, TUNE.stemFade);
      } catch {
        // setValueCurveAtTime throws if it overlaps live automation; a ramp still beats a cut.
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(target, now + TUNE.stemFade);
      }
    }
    this._stemFadeEnd = now + TUNE.stemFade;
  }

  _buildPool() {
    const ctx = this.ctx;
    for (let i = 0; i < TUNE.poolSize; i++) {
      const positional = i < TUNE.poolSize - 12;
      const g = ctx.createGain();
      g.gain.value = 0;
      const shelf = ctx.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = TUNE.airShelfHz;
      shelf.gain.value = 0;
      const send = ctx.createGain();
      send.gain.value = 0;
      g.connect(shelf);
      shelf.connect(send);
      send.connect(this.reverb.input);

      let panner = null, stereo = null;
      if (positional) {
        panner = ctx.createPanner();
        // HRTF is worth its cost on a stealth game — knowing a guard is behind you
        // is gameplay information. It is the first thing dropped at low quality.
        panner.panningModel = this.engine.quality === 'low' ? 'equalpower' : 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 6;
        panner.maxDistance = TUNE.maxDistance;
        panner.rolloffFactor = TUNE.rolloff;
        shelf.connect(panner);
        panner.connect(this.sfxBus);
      } else {
        stereo = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
        shelf.connect(stereo);
        stereo.connect(this.sfxBus);
      }

      this._voices.push({
        id: 0, name: '', slot: i, active: false, loop: false, positional,
        gain: g, shelf, send, panner, stereo,
        srcs: [], set: null, start: 0, end: 0, pri: 0, vol: 1,
        x: 0, y: 0, z: 0, stolen: false, counted: false,
      });
    }
  }

  /* ===================== public interface ============================ */

  /**
   * Fire a sound. Returns an opaque handle (or null when it was culled, throttled,
   * or the context isn't up yet). Never throws.
   *
   * opts: { position:Vector3|{x,y,z}, volume, rate, delay, ...builder params }
   */
  play(name, opts) {
    if (!this.ready) return null;
    const def = SFX[name];
    if (!def) return null;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const when = now + (opts?.delay || 0) + 0.005;

    // Anti machine-gun: a name has both a minimum retrigger gap and a concurrency
    // cap. Footsteps are the reason — a blend tree can fire two in the same frame.
    const last = this._lastPlay[name] || -1;
    if (def.gap && when - last < def.gap) return null;
    const count = this._nameCount[name] || 0;
    if (def.max && count >= def.max) return null;

    let x = 0, y = 0, z = 0, dist = 0;
    const pos = opts?.position;
    const flat = def.flat || !pos;
    if (!flat) {
      x = pos.x; y = pos.y; z = pos.z;
      _tmp.set(x - this._lx, y - this._ly, z - this._lz);
      dist = _tmp.length();
      if (dist > TUNE.cull && !def.loop) return null;
    }

    const v = this._takeVoice(def, flat);
    if (!v) return null;

    /* ---- per-play variation. Identical repeats are the tell. ---- */
    const r = this.rand;
    const spread = def.vary ?? 0.05;
    const rate = (opts?.rate ?? 1) * (spread > 0 ? 1 + r.jitter(spread) : 1);
    const vol = (opts?.volume ?? 1) * (1 + r.jitter(0.15)) * def.g;

    v.id = this._nextId++;
    v.name = name;
    v.active = true;
    v.stolen = false;
    v.loop = !!def.loop;
    v.pri = def.pri || 0;
    v.vol = vol;
    v.start = when;
    v.end = def.loop ? Infinity : when + (def.dur || 0.5) + 0.35;
    v.srcs.length = 0;
    v.set = null;
    v.x = x; v.y = y; v.z = z;

    const g = v.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0, Math.min(2, vol)), now);

    this._placeVoice(v, flat, dist, def);

    // The builder writes into the voice gain; it knows nothing about space or mix.
    const o = this._opts;
    o.r = r;
    o.rate = rate;
    o.variant = r.int(0, 3);
    o.index = opts?.index || 1;
    o.streak = opts?.streak || 0;
    o.force = opts?.force || 1;
    o.surface = opts?.surface || 'stone';
    o.gait = opts?.gait || 'walk';

    let built = null;
    try {
      built = def.build(ctx, v.gain, when, o);
    } catch (err) {
      this._release(v);
      this._warn(`sfx "${name}" failed: ${err?.message || err}`);
      return null;
    }
    if (built) {
      for (let i = 0; i < built.srcs.length; i++) v.srcs.push(built.srcs[i]);
      if (built.set) v.set = built.set;
      if (!def.loop && Number.isFinite(built.end)) v.end = built.end + 0.12;
    }

    this._lastPlay[name] = when;
    this._nameCount[name] = count + 1;
    this._active++;
    v.counted = true;

    if (def.duck) this.duckMusic(def.duck);
    return v;
  }

  /** Stop a handle (loops especially), fading over `fade` seconds. */
  stop(handle, fade = 0.12) {
    if (!this.ready || !handle) return;
    const v = typeof handle === 'object' ? handle : null;
    if (!v || !v.active) return;
    const t = this.ctx.currentTime;
    const g = v.gain.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
    } catch {}
    v.end = t + Math.max(0.01, fade) + 0.02;
    v.loop = false;
  }

  /** Set a live parameter on a looping handle — rail speed, wind openness, ... */
  set(handle, key, value) {
    if (!this.ready || !handle?.set || !handle.active) return;
    try { handle.set(key, value, this.ctx.currentTime); } catch {}
  }

  /**
   * Request a music section. Also disables the automatic section chooser briefly.
   *
   * The section machinery survives the recorded track rather than being bypassed by it. It can no
   * longer change WHAT is playing — a fixed recording has no `sneak` variant — but the thing the
   * sections were really expressing is *how present the music should be*, and that still applies:
   * `sneak` pulls the level down and closes the filter so footsteps and guard chatter sit on top,
   * `alert` opens both. Without this, switching to Thief-o-Vision or being spotted would leave the
   * music completely unmoved, which is a worse result than the synthesised score gave.
   */
  music(section) {
    if (!SECTION_NAMES.includes(section)) return;
    this._section = section;
    if (!this.ready) { this._pendingMusic = section; return; }

    if (this._trackState === 'playing' || this._trackState === 'loading') {
      const t = this.ctx.currentTime, s = TRACK_SECTION[section] || TRACK_SECTION.explore;
      /* Pick the arrangement first, then apply the level/filter shape on top of it. Both still
         matter: the stems differ in instrumentation, TRACK_SECTION differs in presence, and
         `menu`/`treasure` have no stem of their own so the shape is all they get. */
      this._selectStem(section, t);
      /* Same window as the arrangement cross-fade. Two different windows put a level step in
         the middle of the fade, which is exactly the seam a cross-fade exists to avoid. */
      const g = this.trackGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(TUNE.trackLevel * s.level, t + TUNE.stemFade);
      const f = this.musicFilter.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(f.value, t);
      f.linearRampToValueAtTime(s.cutoff, t + TUNE.stemFade);
      return;
    }
    if (!this.score._started) this.score.start(this.ctx.currentTime, section);
    else this.score.setSection(section);
  }

  setListener(position, forward, up) {
    if (!this.ready || !position) return;
    const ctx = this.ctx;
    const L = ctx.listener;
    const t = ctx.currentTime;
    this._lx = position.x; this._ly = position.y; this._lz = position.z;
    const fx = forward?.x ?? 0, fy = forward?.y ?? 0, fz = forward?.z ?? -1;
    const ux = up?.x ?? 0, uy = up?.y ?? 1, uz = up?.z ?? 0;
    try {
      if (L.positionX) {
        // setTargetAtTime rather than a hard set: a teleporting listener zippers.
        const k = TUNE.listenerSmooth;
        L.positionX.setTargetAtTime(position.x, t, k);
        L.positionY.setTargetAtTime(position.y, t, k);
        L.positionZ.setTargetAtTime(position.z, t, k);
        L.forwardX.setTargetAtTime(fx, t, k);
        L.forwardY.setTargetAtTime(fy, t, k);
        L.forwardZ.setTargetAtTime(fz, t, k);
        L.upX.setTargetAtTime(ux, t, k);
        L.upY.setTargetAtTime(uy, t, k);
        L.upZ.setTargetAtTime(uz, t, k);
      } else {
        L.setPosition(position.x, position.y, position.z);
        L.setOrientation(fx, fy, fz, ux, uy, uz);
      }
    } catch { /* older impls throw on the deprecated path; silence is fine */ }
  }

  setSpace(name) {
    if (!SPACES[name] || name === this._space) return;
    this._space = name;
    if (!this.ready) return;
    this.reverb.setSpace(name, TUNE.spaceFade);
    const w = this._loops.wind;
    if (w) this.set(w, 'open', name === 'outdoor' ? 1 : name === 'courtyard' ? 0.78 : name === 'hall' ? 0.32 : 0.06);
  }

  masterVolume(v) {
    this.master = Math.max(0, Math.min(1.5, v));
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.master, t, 0.05);
  }

  mute(on = true) {
    this.muted = !!on;
    this.masterVolume(this.master);
  }

  toggleMute() { this.mute(!this.muted); }

  /** Sidechain the score under an impact. `amount` 0..1. */
  duckMusic(amount, attack = TUNE.duckAttack, release = TUNE.duckRelease) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const g = this.musicDuck.gain;
    const target = this._musicBase * (1 - Math.max(0, Math.min(0.9, amount)));
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(target, t + attack);
      g.linearRampToValueAtTime(this._musicBase, t + attack + release);
    } catch {}
  }

  /* ===================== frame ======================================= */

  update(dt, t) {
    this._framed = true;
    if (!this.ready) {
      // ANIMATION may land after AUDIO; keep trying for a while, cheaply.
      if (!this._animHooked && this._animRetry++ < 600 && (this._animRetry & 31) === 0) this._hookAnimation();
      /* Frames are running but nobody has touched the page yet: the one window in which the
         stem's bytes can be fetched for free. Guarded and idempotent — see `_prefetchStem`. */
      this._prefetchStem();
      /**
       * ── The second path, and why the first one was not a second path at all (§664) ──────────
       *
       * This line used to read `input?.lastDevice === 'pad'`, and it was written as the
       * belt-and-braces for the `inputDevice` subscription in `_wireEngine`. It was not:
       * `inputDevice` is *emitted by* `_setDevice`, and `_setDevice` is what sets `lastDevice`.
       * Two readings of one variable are one path wearing two hats — §439, exactly: an instrument
       * built from the same assumption as the thing it measures cannot falsify it.
       *
       * Measured on the shipped `Input` (`tests/padclaim.test.mjs`), `lastDevice` stays `'kbm'`
       * through a real Cross press in three states a player reaches immediately: after any focus
       * loss (`_adopt` deliberately sets no device — a re-discovered hold is not an event), with
       * the button already down on the first poll (§542's trust gate withholds it), and with the
       * pad first appearing on the same frame as the press — **which is the only order real
       * Chrome allows, because it exposes no gamepad to a page until one is used.** In all three
       * the button worked or was about to, and audio got nothing.
       *
       * `padTouched` is raw button state read straight off the device each frame. It shares no
       * mechanism with `_press`, `_adopt`, `_padValue` or `_setDevice`, so it can still be true
       * when every one of them has said nothing.
       */
      const inp = this.engine.input;
      if (!this.ctx && (inp?.lastDevice === 'pad' || inp?.padTouched)) { try { this.unlock(); } catch {} }
      return;
    }

    /**
     * §664 — a context that exists but is SUSPENDED is the state §552 designed for and nothing
     * ever retried. `unlock()` retries `resume()`, but the only things that call it again are the
     * DOM gesture listeners and the `inputDevice` edge; a pad-only player who never clicks and
     * never changes device calls neither. One cheap retry every half second costs a no-op promise
     * and turns "silent for the life of the page" into "silent until the platform relents".
     */
    if (!this.audible && ((this._resumeTick = (this._resumeTick | 0) + 1) & 31) === 0) this._tryResume();

    /* Deferred from `unlock()` when the gesture arrived mid-boot (§551); a no-op afterwards. */
    this._kickTrack();
    if (!this._animHooked && this._animRetry++ < 600 && (this._animRetry & 31) === 0) this._hookAnimation();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    /* ---- listener from the camera ---- */
    const cam = this.engine.camera;
    if (cam) {
      cam.getWorldPosition(_p);
      cam.getWorldDirection(_f);
      _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
      this.setListener(_p, _f, _u);
    }

    /* ---- reclaim finished voices ---- */
    const voices = this._voices;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      if (v.active && now >= v.end) this._release(v);
    }

    /* ---- ambience tracking ---- */
    this._spaceTimer += dt;
    if (this._spaceTimer > 0.35) {
      this._spaceTimer = 0;
      this._autoSpace();
      const w = this._loops.wind;
      if (w) this.set(w, 'height', this._ly);
    }

    /* ---- alert decay + section choice ---- */
    if (this._alert > 0) {
      this._alertTimer += dt;
      if (this._alertTimer > TUNE.alertHold) { this._alert = Math.max(0, this._alert - 1); this._alertTimer = 0; }
    }
    if (this._treasure > 0) this._treasure = Math.max(0, this._treasure - dt);
    if (this._autoOverrideFor > 0) this._autoOverrideFor -= dt;
    this._sectionTimer += dt;
    if (this._sectionAuto && this._autoOverrideFor <= 0 && this._sectionTimer > TUNE.sectionDebounce) {
      const want = this._wantSection();
      if (want !== this._section) { this._sectionTimer = 0; this.music(want); }
    }

    /* ---- state-driven loops ---- */
    this._trackStateLoops();
    this._trackGuards(dt);

    /* ---- the score ---- */
    this.score.update(now);
  }

  /* ===================== voices ====================================== */

  _takeVoice(def, flat) {
    const voices = this._voices;
    if (this._active >= TUNE.maxVoices) {
      // Steal: the cheapest thing playing that isn't more important than this one.
      let victim = null, worst = Infinity;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        if (!v.active || v.stolen || v.loop) continue;
        if (v.pri > (def.pri || 0)) continue;
        // Quietest, lowest priority, oldest — the sound nobody is still listening to.
        const score = v.pri * 100 + v.vol * 50 + (v.start - this.ctx.currentTime) * 2;
        if (score < worst) { worst = score; victim = v; }
      }
      if (!victim) return null;
      this._fadeOut(victim, 0.015);
    }
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      if (v.active) continue;
      if (flat !== !v.positional) continue;
      return v;
    }
    // No slot of the right kind free: take any, rather than dropping the sound.
    for (let i = 0; i < voices.length; i++) if (!voices[i].active) return voices[i];
    return null;
  }

  _placeVoice(v, flat, dist, def) {
    const t = this.ctx.currentTime;
    if (!flat && v.panner) {
      const p = v.panner;
      p.refDistance = def.ref || 6;
      try {
        if (p.positionX) {
          p.positionX.setValueAtTime(v.x, t);
          p.positionY.setValueAtTime(v.y, t);
          p.positionZ.setValueAtTime(v.z, t);
        } else p.setPosition(v.x, v.y, v.z);
      } catch {}
      // Air absorption: distant sources lose their top end. Cheap, computed once
      // per one-shot rather than per frame — nobody can hear the difference.
      const k = Math.min(1, dist / 70);
      v.shelf.gain.setValueAtTime(TUNE.airShelfDb * k, t);
      // ...and get wetter, which is most of what "far away" means to the ear.
      v.send.gain.setValueAtTime(this.reverb.wet * (0.35 + 0.9 * k), t);
    } else {
      v.shelf.gain.setValueAtTime(0, t);
      v.send.gain.setValueAtTime(this.reverb.wet * 0.28, t);
      if (v.stereo?.pan) v.stereo.pan.setValueAtTime(0, t);
    }
  }

  _fadeOut(v, fade) {
    const t = this.ctx.currentTime;
    try {
      const g = v.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + fade);
    } catch {}
    v.stolen = true;
    v.end = t + fade + 0.01;
    // Uncount immediately: the slot is spoken for but the *voice* is already gone,
    // otherwise a burst of stealing walks the active count past the cap.
    this._uncount(v);
  }

  _uncount(v) {
    if (!v.counted) return;
    v.counted = false;
    const c = this._nameCount[v.name] || 1;
    this._nameCount[v.name] = c - 1;
    this._active = Math.max(0, this._active - 1);
  }

  _release(v) {
    if (!v.active) return;
    for (let i = 0; i < v.srcs.length; i++) {
      const s = v.srcs[i];
      try { s.stop(); } catch {}
      try { s.disconnect(); } catch {}
    }
    v.srcs.length = 0;
    v.set = null;
    v.active = false;
    v.stolen = false;
    v.loop = false;
    try { v.gain.gain.cancelScheduledValues(this.ctx.currentTime); } catch {}
    v.gain.gain.value = 0;
    this._uncount(v);
  }

  /* ===================== ambience ==================================== */

  _startBeds() {
    this._loops.wind = this.play('wind');
    if (this._loops.wind) this.set(this._loops.wind, 'open', this._windOpen);

    // Braziers and torches announce themselves by name in the scene graph, which
    // is public Three.js data — no reaching into PROPS' internals to find them.
    const seen = [];
    try {
      this.engine.scene?.traverse((o) => {
        if (seen.length >= 6 || !o?.name) return;
        if (/brazier|torch|fire|flame/i.test(o.name) && o.visible !== false) seen.push(o);
      });
    } catch {}
    for (let i = 0; i < seen.length; i++) {
      seen[i].getWorldPosition(_tmp);
      const h = this.play('brazier', { position: _tmp, volume: 0.9 });
      if (h) this._loops['brazier' + i] = h;
    }

    try {
      let water = null;
      this.engine.scene?.traverse((o) => { if (!water && /nile|water|river/i.test(o?.name || '')) water = o; });
      if (water) {
        water.getWorldPosition(_tmp);
        _tmp.set(Math.min(_tmp.x, -70), 0, _tmp.z);
        const h = this.play('water', { position: _tmp, volume: 0.8 });
        if (h) this._loops.water = h;
      }
    } catch {}
  }

  /**
   * Pick the reverb space from where the listener is, using the level's coordinate
   * contract (AGENTS.md §8.1) rather than asking another module. Requires two
   * agreeing samples before switching so a doorway doesn't flap.
   */
  _autoSpace() {
    const x = this._lx, y = this._ly, z = this._lz;
    let want;
    if (y < -3 && z < -50) want = 'tomb';
    else if (z >= -54 && z <= -14 && y < 16 && Math.abs(x) < 27) want = 'hall';
    else if (z > -16 && z < 36 && Math.abs(x) < 30 && y < 20) want = 'courtyard';
    else want = 'outdoor';

    if (want === this._spaceVote && want !== this._space) this.setSpace(want);
    this._spaceVote = want;
  }

  /**
   * The score's four rungs. `suspicious` deliberately goes to `sneak` rather than to `alert`:
   * thinning the mix out when a guard first twitches is the older and better stealth idiom, and
   * it leaves `alert` free to mean the thing it should mean — he is up and hunting you.
   */
  _wantSection() {
    if (this._alert > 0) return SECTION_FOR_ALERT[Math.min(3, this._alert)];
    /* The payoff. `SECTIONS.treasure` — eight bars of Lydian, its own arrangement, and four
       `style === 'treasure'` branches across the vibes, oud, kit and lead generators — was
       **unreachable**: `setSection` is fed only by this function, and this function could only
       ever return the four alert-ladder sections. It rendered real music the whole time (10 s
       at seed 0x5c17c00: peak 0.367, rms 0.0363) that no player could reach.

       `Pickups.js:577` has published `treasureBanked` since the fence economy landed, and
       banking at the fence is the one moment in the level that the parallel major is *for* —
       §246's own framing is that picking a treasure up credits nothing and only reaching the
       fence pays. So the cue goes on the beat where the loot actually becomes yours.

       Deliberately BELOW the alert ladder: being spotted mid-fanfare must win, and it does,
       because that branch returns first. Getting driven to CHASE while carrying also drops the
       treasure (`Pickups.js:467`), so the two can never contradict each other. */
    if (this._treasure > 0) return 'treasure';
    const s = this._playerState;
    if (s === 'sneak' || s === 'crouch' || s === 'crawl' || s === 'tiptoe') return 'sneak';
    return 'explore';
  }

  /** Continuous sounds that belong to a movement state rather than to an event. */
  _trackStateLoops() {
    const s = this._playerState;
    const mv = this.engine.get('movement');

    const railWanted = s === 'railSlide' || s === 'railWalk';
    if (railWanted && !this._loops.rail) {
      this._loops.rail = this.play('rail_slide', { position: this._playerPos() });
    } else if (!railWanted && this._loops.rail) {
      this.stop(this._loops.rail, 0.14); this._loops.rail = null;
    }
    if (this._loops.rail) {
      const sp = Math.min(1, Math.abs(mv?.speed ?? 6) / 11);
      this.set(this._loops.rail, 'speed', sp);
      const pos = this._playerPos();
      if (pos && this._loops.rail.panner) {
        const p = this._loops.rail.panner;
        try {
          if (p.positionX) {
            const t = this.ctx.currentTime;
            p.positionX.setTargetAtTime(pos.x, t, 0.05);
            p.positionY.setTargetAtTime(pos.y, t, 0.05);
            p.positionZ.setTargetAtTime(pos.z, t, 0.05);
          }
        } catch {}
      }
    }

    const glideWanted = s === 'paraglide';
    if (glideWanted && !this._loops.glide) this._loops.glide = this.play('paraglide');
    else if (!glideWanted && this._loops.glide) { this.stop(this._loops.glide, 0.35); this._loops.glide = null; }
    if (this._loops.glide) this.set(this._loops.glide, 'speed', Math.min(1, Math.abs(mv?.speed ?? 4) / 9));

    // Pole climb and rope swing want a repeated one-shot, not a loop: a scuff every
    // third of a second reads as hand-over-hand, a sustained drone reads as a lift.
    if (s === 'poleClimb' || s === 'hookSwing') {
      this._scuffTimer -= this.engine.dt;
      if (this._scuffTimer <= 0) {
        this._scuffTimer = s === 'poleClimb' ? 0.34 : 0.9;
        this.play(s === 'poleClimb' ? 'pole_scuff' : 'rope_creak',
          { position: this._playerPos(), volume: s === 'poleClimb' ? 0.8 : 0.6 });
      }
    } else this._scuffTimer = 0;
  }

  /**
   * Guards you can hear before you can see them.
   *
   * The catalogue has had `guard_step`, `armour_clank`, `spear_scrape` and `guard_yawn` in it the
   * whole time and **nothing ever played any of them**: the `guardSound` event this file listens
   * for has no emitter anywhere in the project. So the one cue a stealth game cannot do without —
   * footsteps approaching from somewhere you are not looking — did not exist.
   *
   * This reads the GUARDS module's public data rather than reaching into it or asking for new
   * events: `list` (or `guards`) of objects with a `position` and a `state`, which is the same
   * kind of public read as `_startBeds` traversing the scene graph for braziers. Every field is
   * optional and a missing one costs silence, never a throw — the module is owned by another
   * agent and is being changed while this runs.
   *
   * Footfalls are driven by DISTANCE TRAVELLED, not by a timer. That is both physically right —
   * a guard who speeds up takes steps sooner, and one who stops takes none — and it is immune to
   * the animation clip names, which are not ours to depend on.
   */
  _trackGuards(dt) {
    const G = this.engine.get('guards');
    const list = G && (Array.isArray(G.list) ? G.list : Array.isArray(G.guards) ? G.guards : null);
    if (!list || !list.length) return;

    // Nearest few only. A courtyard of guards is a wall of footsteps, not information.
    const near = this._nearGuards;
    near.length = 0;
    const reach = TUNE.guardEarshot * TUNE.guardEarshot;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      const p = g?.position;
      if (!p) continue;
      const dx = p.x - this._lx, dy = p.y - this._ly, dz = p.z - this._lz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > reach) continue;
      near.push(g);
      g.__ad2 = d2;
    }
    if (!near.length) return;
    near.sort((a, b) => a.__ad2 - b.__ad2);
    const n = Math.min(TUNE.guardVoices, near.length);

    for (let i = 0; i < n; i++) {
      const g = near[i];
      const id = g.id ?? g.name ?? i;
      let st = this._guardStep.get(id);
      if (!st) {
        st = { x: g.position.x, z: g.position.z, acc: 0, chat: TUNE.guardChatMin * (0.3 + this.rand() * 0.7), clank: 0 };
        this._guardStep.set(id, st);
      }

      const dx = g.position.x - st.x, dz = g.position.z - st.z;
      st.x = g.position.x; st.z = g.position.z;
      const moved = Math.sqrt(dx * dx + dz * dz);
      st.acc += moved;

      const state = typeof g.state === 'string' ? g.state : 'patrol';
      const rung = ALERT_FOR_STATE[state] ?? 0;
      // A guard on patrol walks; one who has seen you runs, and a run is a different sound.
      const gait = rung >= 3 ? 'run' : rung >= 1 ? 'walk' : 'walk';
      const stride = TUNE.guardStride * (rung >= 3 ? 1.22 : 1);

      if (st.acc >= stride) {
        st.acc = 0;
        this.play('guard_step', {
          position: g.position, surface: this._groundSurface(), gait,
          volume: rung >= 3 ? 1.0 : 0.82,
        });
        // Armour answers the footfall, but not on every one — that reads as a machine.
        if (++st.clank % (rung >= 3 ? 2 : 4) === 0) {
          this.play('armour_clank', { position: g.position, volume: rung >= 3 ? 0.55 : 0.34 });
        }
      }

      // Idle noises, unaware guards only: the "he hasn't seen me" signal, and free comedy.
      st.chat -= dt;
      if (st.chat <= 0) {
        st.chat = TUNE.guardChatMin + this.rand() * (TUNE.guardChatMax - TUNE.guardChatMin);
        if (rung === 0 && moved < 0.002) this.play('guard_yawn', { position: g.position, volume: 0.6 });
        else if (rung === 0) this.play('spear_scrape', { position: g.position, volume: 0.45 });
      }
    }
  }

  /**
   * A prop came apart — the audible half of the destructible vocabulary.
   *
   * Two layers, because a break is a transient and a settle and neither alone reads as one:
   *
   *  · **The transient** is `stepFor(material)` pitched down. That is not a shortcut — a
   *    footstep recipe *is* a material impact: `buildStep` shapes a band-passed strike with a
   *    material-specific body, tick and ring (`STEP` in Sfx.js — stone gets a 3.6 kHz tick and
   *    a 620 Hz high-pass, wood a 430 Hz ring, metal a 2.65 kHz one). Playing it at rate 0.62
   *    drops it ~8 semitones, which turns "a boot on limestone" into "limestone breaking"
   *    while keeping the one thing that had to be material-correct. Building a second
   *    near-identical set of material transients would have been four more recipes saying what
   *    these four already say.
   *
   *  · **The settle** is `stone_grind`, which the §357.1 audit found had **zero references
   *    anywhere in the project, tests included** — a fully built 25-line recipe with a low
   *    brown-noise rumble, a resonant 480 Hz scrape and a 17 Hz stick-slip judder, proven
   *    non-silent and non-clipping by `tests/audio.test.mjs` and never once played. Its
   *    authored intent is a sarcophagus lid dragging, and it is reached here at rate 1.0 by a
   *    `scale` 3 break, which is that. Small breaks get it faster and quieter: `o.rate`
   *    multiplies every filter frequency in its build, so rate 2.1 is the same grit an octave
   *    up, which is what a jar's worth of rubble settling sounds like. Its own `duck: 0.2`
   *    sidechains the score, so a break is felt in the mix as well as heard.
   *
   * Both are gap- and concurrency-capped by `play()` already (`stone_grind` is `max: 2`,
   * `gap: 0.4`), so a shelf of jars broken in one swing cannot turn into a wall of rumble.
   *
   * NOT VERIFIED BY EAR. §186 held the capture lock and audio is silent in captures by
   * construction, so the rate and volume curves below are derived from the recipes' own
   * published constants, not auditioned.
   */
  _onSmash(p) {
    if (!this.ready) return;
    const pos = p?.pos || p?.position || null;
    const s = Math.max(0.25, Math.min(4, p?.scale ?? 1));
    /* Pitched down and loud: the same recipe a footfall uses, read as a break. */
    this.play(stepFor(p?.material), { position: pos, rate: 0.62, volume: 1.0, gait: 'run' });
    /* Rubble. Rate falls toward 1.0 — the full lid drag — as the prop gets heavier. */
    this.play('stone_grind', {
      position: pos,
      rate: 2.3 - 0.43 * s,
      volume: Math.min(1, 0.34 + 0.22 * s),
      delay: 0.05,
    });
  }

  /** Sly's gait, from the movement state first and his actual speed second. */
  _gait() {
    const s = this._playerState;
    if (s === 'sneak' || s === 'crouch' || s === 'tiptoe' || s === 'crawl') return 'sneak';
    const sp = Math.abs(this.engine.get('movement')?.speed ?? 0);
    return sp > 4.6 ? 'run' : 'walk';       // §6: walk 2.6 m/s, run 7.2 m/s — split between them
  }

  /** What the floor is made of where the listener is standing, for guard footsteps. */
  _groundSurface() {
    return this._space === 'outdoor' || this._space === 'courtyard' ? 'sand' : 'stone';
  }

  _playerPos() {
    const ch = this.engine.get('character');
    if (ch?.root?.position) return ch.root.position;
    const mv = this.engine.get('movement');
    if (mv?.position) return mv.position;
    return null;
  }

  /* ===================== event wiring ================================ */

  _wireEngine() {
    const e = this.engine;
    const on = (evt, fn) => { try { this._unsub.push(e.on(evt, fn)); } catch {} };

    /**
     * §552 — THE PAD HAS NO GESTURE, so give it the only signal it does produce.
     *
     * The user played on a controller and reported the music still did not start. §551 armed
     * `pointerdown`/`keydown`/`touchstart`, and **a gamepad button fires none of them**: the
     * Gamepad API is POLLED, `Input._padButtons` reads button state inside `beginFrame`, and
     * nothing in `src/core/Input.js` dispatches a DOM event for it — verified, zero
     * `dispatchEvent` in that file. So a player who boots the page, picks up a pad and never
     * touches mouse or keyboard had no path to audio at all.
     *
     * What a pad press DOES produce is this: `_press(a, 'pad')` calls `_setDevice('pad')`, which
     * emits `inputDevice`. `lastDevice` starts `'kbm'`, so the first pad press always emits.
     *
     * **What this can and cannot buy, stated honestly.** Creating the context here costs nothing
     * and may work. Whether `resume()` is HONOURED without a qualifying gesture is a platform
     * question this project cannot test — §551 established that headless Chromium applies no
     * autoplay policy and that forcing the flag changes nothing with no audio device — so this is
     * written to be correct either way: if the policy allows it, the pad player gets audio with no
     * click; if it refuses, the context sits suspended, the DOM listeners stay armed (see
     * `_armGesture`), and the first real click starts it instead of being swallowed. The one
     * outcome that is now impossible is the one that used to happen: nothing, forever.
     */
    on('inputDevice', (dev) => { if (dev === 'pad') { try { this.unlock(); } catch {} } });

    /* ---- movement (Moveset emits all of these) ---- */
    on('landed', (p) => {
      const f = p?.force || 1;
      const hard = f > 9;
      this.play(hard ? 'land_hard' : 'land_soft', { position: p?.pos, force: f / 9 });
      if (p?.surface) this.play(stepFor(p.surface), { position: p?.pos, volume: 0.55 });
    });
    on('jumped', (p) => this.play('jump', { position: p?.pos }));
    on('doubleJump', (p) => this.play('double_jump', { position: p?.pos }));
    on('caneHit', (p) => {
      this.play('cane_swing', { position: p?.pos, index: p?.index || 1 });
      this.play('cane_hit', { position: p?.pos, index: p?.index || 1, delay: 0.055 });
    });
    /**
     * The Cane Slam, on the surface he actually landed on (§428.4).
     *
     * `dive_boom` is the weight of the impact and is material-independent — that part was always
     * right. What was missing is the transient on top of it: `Moveset.js:347` has published
     * `material: c.groundMaterial` with every slam since the event existed, and this handler read
     * `pos` and dropped it, so a slam into the desert and a slam onto the temple paving were the
     * same sound.
     *
     * The second layer is **`_onSmash`'s own recipe, unchanged** — `stepFor(material)` at rate
     * 0.62, the footstep-as-material-impact argument spelled out in that method's header. Reusing
     * its numbers rather than picking new ones is deliberate: a second, differently-felt set of
     * material transients is exactly the drift this file refuses elsewhere, and the slam is the
     * same physical event as a break with a bigger body behind it.
     *
     * Every surface a player can stand on in this level — `stone`, `sand`, `wood` — has its own
     * `STEP` recipe, so nothing was authored for this. `flesh` and `misc` fall back to stone and
     * appear on no collider in the level; `water` has a cue but no standable collider.
     *
     * NOT VERIFIED BY EAR, for the reason `_onSmash` gives: captures are silent by construction.
     */
    on('caneSlam', (p) => {
      this.play('dive_boom', { position: p?.pos });
      this.play(stepFor(p?.material), { position: p?.pos, rate: 0.62, volume: 1.0, gait: 'run' });
    });
    /* ── Contacts, voiced by what was actually touched ──────────────────────────────────────
       These eight lines each used to name a fixed recipe, because the events carried no
       material and there was nothing else to name. MOVEMENT now publishes `material` on all of
       them (`Moveset.js` 409/627/734/771/919/1149/1237/1446) — COLLISION's own tag, the same
       vocabulary `stepFor()` resolves — so the guesses can go.

       Two of them were measurably wrong on this level. `spireLand` played `step_metal`
       (spectral centroid 1849 Hz) on geometry the level tags `stone` (1033 Hz), and `ledgeGrab`
       played `step_cloth` (2238 Hz) on a ledge also tagged `stone`. `railMount` could not tell
       a bronze cable from the three `rope_fibre` ropes the level authors, which are tagged
       `cloth`; it played the same metal catch on all of them.

       `ledgeGrab` keeps a cloth layer under the surface, and that is not a hedge. Cloth was
       always the right sound for the GLOVE — the author, having no surface, voiced Sly's hand
       because it was the only thing they could know. Now both are knowable, so the frame gets
       both: the ledge's own material as the contact and the glove under it, the same
       character-plus-material pair `landed` has always used.

       `stepFor(undefined)` returns `step_stone`, so a contact that resolves without a hit
       degrades to exactly the sound it made before rather than to silence. */
    on('hookGrab', (p) => {
      this.play('hook_catch', { position: p?.pos });
      this.play(stepFor(p?.material), { position: p?.pos, volume: 0.45, rate: 1.1 });
    });
    on('hookRelease', (p) => this.play('rope_creak', { position: p?.pos, volume: 0.5 }));
    on('railMount', (p) => {
      this.play('hook_catch', { position: p?.pos, volume: 0.5, rate: 1.35 });
      this.play(stepFor(p?.material), { position: p?.pos, volume: 0.6, rate: 1.15 });
    });
    on('poleMount', (p) => {
      this.play('pole_scuff', { position: p?.pos });
      this.play(stepFor(p?.material), { position: p?.pos, volume: 0.5 });
    });
    on('spireLand', (p) => this.play(stepFor(p?.material), { position: p?.pos, volume: 0.8, rate: 1.2 }));
    on('wallRun', (p) => this.play(stepFor(p?.material), { position: p?.pos, volume: 0.5, rate: 0.9 }));
    on('wallJump', (p) => {
      this.play('jump', { position: p?.pos });
      this.play(stepFor(p?.material), { position: p?.pos, volume: 0.7 });
    });
    on('ledgeGrab', (p) => {
      this.play(stepFor(p?.material), { position: p?.pos, volume: 0.9, rate: 0.8 });
      this.play('step_cloth', { position: p?.pos, volume: 0.5, rate: 0.85 });
    });
    on('pickpocket', (p) => this.play('pickpocket', { position: p?.pos }));
    on('paraglide', (onOff) => { if (!onOff && this._loops.glide) { this.stop(this._loops.glide, 0.3); this._loops.glide = null; } });

    on('playerState', (name) => {
      const prev = this._playerState;
      this._playerState = name || 'idle';
      if (name === 'roll' && prev !== 'roll') this.play('roll', { position: this._playerPos() });
      if (name === 'hurt' && prev !== 'hurt') this.play('hurt', { position: this._playerPos() });
      if (name === 'ko') this.play('ko');
      if (name === 'combo' && prev !== 'combo') this.play('cane_swing', { position: this._playerPos(), index: 1 });
    });

    /* ---- guards ---- */
    on('guardAlert', (p) => this._onGuardAlert(p));
    /* `guardSpotted`, `guardLost` and `guardSound` were subscribed here and had no publisher
       anywhere in `src/`. They are **superseded, not missing**: the guards publish `guardAlert`
       carrying a `state`, and this file's whole ladder (`_onGuardAlert` → `_rungOf` →
       `ALERT_FOR_STATE`) was rebuilt on it in §219. `tests/eventbus.test.mjs` registers all
       three under `DEAD_BY_DECISION` and states the fix explicitly — *delete the listeners*, do
       not give them publishers, because a second source of truth for the alert rung is not an
       improvement over one. Deleted here, which is that fix.

       `guardSound`'s loss costs nothing: the four sounds it was the channel for — `guard_step`,
       `armour_clank`, `spear_scrape`, `guard_yawn` — are already played by `_trackGuards`,
       which reads GUARDS' public list directly and drives footfalls off distance travelled
       (see its note above). That path was written precisely because this one never fired. */

    /* ---- systems ---- */
    on('thiefVision', (v) => this._onThiefVision(!!v));
    on('coins', (p) => this._onCoins(p));
    on('coin', (p) => this._onCoins(p));
    on('clue', (p) => this.play('clue_bottle', { position: p?.pos }));
    /* Fenced. Open the treasure window and let the score react on the next debounce tick
       rather than waiting up to `sectionDebounce` for one that was already pending. */
    on('treasureBanked', () => {
      this._treasure = TUNE.treasureHold;
      this._sectionTimer = TUNE.sectionDebounce;
    });
    /* NEW BUS EVENT `propSmashed` — see the note at the matching subscription in
       `src/fx/Particles.js`. FX draws the break; this makes it audible. Same payload, and the
       two subscribe independently rather than one calling the other. */
    on('propSmashed', (p) => this._onSmash(p));
    on('binocucom', () => this.play('binocucom'));
    on('shake', (a) => { if (a > 0.14) this.duckMusic(Math.min(0.4, a * 1.6), 0.03, 0.35); });

    // The critic drives the game through setShot(); it must never hear a stale bed.
    on('shot', () => { for (const k in this._loops) { if (this._loops[k]) { this.stop(this._loops[k], 0.2); this._loops[k] = null; } } });
  }

  _hookAnimation() {
    if (this._animHooked) return;
    const anim = this.engine.get('animation');
    if (!anim?.onEvent) return;
    this._animHooked = true;
    try {
      anim.onEvent('footstep', (p) => {
        const pos = this._playerPos();
        const name = stepFor(p?.surface || 'stone');
        /* Gait, not volume. A sneaking step used to be a walking step at 0.34 — the same
           spectrum, quieter — and a stealth game whose sneak is a fader move is telling the
           player nothing they could not read off the HUD. `buildStep` shapes the transient and
           the top end from this; see `GAIT` in Sfx.js. */
        this.play(name, { position: pos, gait: this._gait() });
      });
      anim.onEvent('cane_hit', (p) => this.play('cane_hit', { position: this._playerPos(), index: p?.index || 1 }));
      anim.onEvent('land', (p) => {
        const f = p?.force ?? 1;
        this.play(f > 9 ? 'land_hard' : 'land_soft', { position: this._playerPos(), force: f / 9 });
      });
    } catch (err) {
      this._warn(`animation events: ${err?.message || err}`);
    }
  }

  /** A guard's alert payload -> a rung on the ladder. Legacy numeric/boolean forms still work. */
  _rungOf(p) {
    if (typeof p === 'number') return Math.max(0, Math.min(3, p | 0));
    if (typeof p === 'boolean') return p ? 3 : 0;
    if (typeof p === 'string') return ALERT_FOR_STATE[p] ?? 0;
    if (p && typeof p === 'object') {
      const s = p.state ?? p.level ?? p.alert;
      if (typeof s === 'string') return ALERT_FOR_STATE[s] ?? 0;
      if (typeof s === 'number') return Math.max(0, Math.min(3, s | 0));
      if (typeof s === 'boolean') return s ? 3 : 0;
    }
    return 0;
  }

  /**
   * One guard changed state. Two separate things follow, and conflating them was the old bug.
   *
   *  **The MUSIC follows the whole garrison**, so it tracks the highest rung anyone is on. The
   *  old code assigned `this._alert = level` from whichever guard spoke last, so a guard at the
   *  far end of the temple returning to his patrol dropped the score out of `chase` while
   *  somebody else was still chasing you. With the roster this level actually posts, that is not
   *  an edge case, it is most alert transitions.
   *
   *  **The VOICE follows the one guard**, positionally, so you can hear *which* of them noticed
   *  and from where. That has to fire per guard even when the global rung does not move.
   */
  _onGuardAlert(p) {
    const rung = this._rungOf(p);
    const pos = (p && typeof p === 'object' && p.pos) || null;
    const id = (p && typeof p === 'object' && (p.id ?? p.name)) ?? '_';

    const was = this._guardRung.get(id) ?? 0;
    if (rung === was && this._guardRung.has(id)) return;
    this._guardRung.set(id, rung);

    // Per-guard voice: he says the thing, from where he is standing.
    if (rung > was) {
      if (rung >= 3) this.play('guard_shout', { position: pos, delay: 0.18 });
      else if (rung === 2) this.play('guard_grunt', { position: pos, volume: 0.85, rate: 0.94 });
      else this.play('guard_confused', { position: pos });
    } else if (rung === 0 && was > 0) {
      this.play('guard_grunt', { position: pos, volume: 0.55 });   // stand down
    } else if (rung < was) {
      this.play('guard_confused', { position: pos, volume: 0.7 }); // "...where'd he go"
    }

    // Global rung: the max over everyone, so nobody's stand-down cancels somebody's chase.
    let top = 0;
    for (const v of this._guardRung.values()) if (v > top) top = v;

    if (top > this._alert) {
      if (top >= 3) this.play('alert_sting');
      else if (top === 2) this.play('search_call');
    }
    this._alert = top;
    this._alertTimer = 0;
    this._sectionTimer = TUNE.sectionDebounce;    // let the score react immediately
  }

  _onThiefVision(on) {
    if (on === this._thief) return;
    this._thief = on;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.play(on ? 'thief_on' : 'thief_off');
    this._musicBase = on ? TUNE.thiefMusic : 1;
    try {
      this.musicDuck.gain.cancelScheduledValues(t);
      this.musicDuck.gain.setValueAtTime(this.musicDuck.gain.value, t);
      this.musicDuck.gain.linearRampToValueAtTime(this._musicBase, t + (on ? 0.25 : 0.6));
      this.musicFilter.frequency.cancelScheduledValues(t);
      this.musicFilter.frequency.setValueAtTime(this.musicFilter.frequency.value, t);
      this.musicFilter.frequency.exponentialRampToValueAtTime(on ? TUNE.thiefFilter : 20000, t + (on ? 0.3 : 0.5));
    } catch {}
  }

  _onCoins(p) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const n = typeof p === 'number' ? p : (p?.amount ?? p?.count ?? 1);
    const pos = (p && typeof p === 'object' && p.pos) || null;
    if (now - this._coinAt > TUNE.coinStreakWindow) this._coinStreak = 0;
    this._coinAt = now;
    const many = Math.max(1, Math.min(6, n | 0));
    for (let i = 0; i < many; i++) {
      this.play('coin', { position: pos, streak: this._coinStreak, delay: i * 0.065 });
      this._coinStreak = Math.min(TUNE.coinStreakMax, this._coinStreak + 1);
    }
  }

  /* ===================== misc ======================================== */

  get _opts() {
    // One reused options object — play() is called from events, but a footstep every
    // 300 ms for an hour is still 12k allocations we don't need to make.
    if (!this.__opts) this.__opts = { r: this.rand, rate: 1, variant: 0, index: 1, streak: 0, force: 1, surface: 'stone', gait: 'walk' };
    return this.__opts;
  }

  _warn(msg) {
    if (this._warned) return;
    this._warned = true;                       // one line, never a wall
    try { this.engine.warn?.(`audio: ${msg}`); } catch {}
  }

  /** For the analysis harness and the debug overlay. */
  debugInfo() {
    return {
      ready: this.ready, active: this._active, space: this._space,
      section: this._section, alert: this._alert, master: this.master,
      voices: this._voices.length, names: SFX_NAMES.length,
    };
  }

  dispose() {
    this._disarmGesture();
    this._bytes.clear();
    for (const off of this._unsub) { try { off(); } catch {} }
    this._unsub.length = 0;
    if (!this.ctx) return;
    try { this.score?.dispose(); } catch {}
    /* A looping BufferSource outlives its graph unless stopped: nothing else here holds a
       reference to it, so without this the track keeps running after dispose(). */
    try { this.track?.stop(); this.track?.disconnect(); } catch {}
    this.track = null;
    /* Every lazily-decoded stem is its own looping source and needs the same treatment; a Map that
       still holds three of them after teardown is three loops running against a dead graph. */
    for (const s of this._stems.values()) {
      try { s.src.stop(); s.src.disconnect(); s.gain.disconnect(); s.makeup?.disconnect(); } catch {}
    }
    this._stems.clear();
    this._stemFadeEnd = 0;
    this._activeStem = null;
    this._trackState = 'idle';
    for (let i = 0; i < this._voices.length; i++) {
      const v = this._voices[i];
      this._release(v);
      try { v.gain.disconnect(); v.shelf.disconnect(); v.send.disconnect(); v.panner?.disconnect(); v.stereo?.disconnect(); } catch {}
    }
    try { this.reverb?.dispose(); } catch {}
    try { this.ctx.close(); } catch {}
    this.ctx = null;
    this.ready = false;
  }
}
