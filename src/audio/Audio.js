import * as THREE from 'three';
import { rng, WORLD_SEED } from '../core/Rand.js';
import { SFX, SFX_NAMES, stepFor } from './Sfx.js';
import { Music, SECTION_NAMES } from './Music.js';

/**
 * How each of Music.js's sections reads on a FIXED recording, which has no sections of its own.
 * Level is a multiplier on `TUNE.trackLevel`; cutoff is the shared `musicFilter`, so this is the
 * same lowpass the synthesised path already used for the same purpose.
 *
 * The shape follows what the procedural sections were doing with their layer mixes: `sneak` drops
 * the kit and lead almost to nothing, so here it drops level and closes the filter; `alert` pushes
 * bass and kit up, so here it opens both fully.
 */
const TRACK_SECTION = {
  menu:     { level: 0.90, cutoff: 20000 },
  explore:  { level: 1.00, cutoff: 20000 },
  sneak:    { level: 0.55, cutoff: 1800 },
  alert:    { level: 1.00, cutoff: 20000 },
  chase:    { level: 1.00, cutoff: 20000 },
  treasure: { level: 0.95, cutoff: 20000 },
};
/* All six of Music.js's sections are covered deliberately. An earlier version of this table had
   four and relied on the `|| TRACK_SECTION.explore` fallback for `chase` and `treasure` — which
   works, and would have silently made the two most dramatic beats in the game indistinguishable
   from ordinary walking. A fallback that never fires is a safety net; one that quietly carries two
   real cases is a missing feature wearing a safety net's clothes. */
import { ReverbRack, SPACES } from './Reverb.js';

/**
 * Audio — the mixer, the spatialiser, and the glue to the rest of the game.
 *
 * Everything is synthesised (AGENTS.md §1): no files, no CDN, no decodeAudioData.
 * Sfx.js says what things sound like, Music.js writes the score, Reverb.js builds
 * the rooms; this file decides what gets heard, from where, and how loud.
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

const TUNE = {
  master: 0.7,            // default master, before the limiter
  maxVoices: 32,          // hard concurrency cap
  poolSize: 44,           // slots > cap so a stolen voice can fade while a new one starts
  cull: 95,               // metres past which a one-shot is not worth a voice
  rolloff: 1.05,
  maxDistance: 220,
  airShelfDb: -11,        // high-shelf cut applied at max distance (air absorption)
  airShelfHz: 3200,
  musicSend: 0.10,        // the score gets a touch of the room, never a wash
  sfxDuck: 0.45,          // default sidechain depth for impacts
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
  sectionDebounce: 1.6,
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

    this._alert = 0;          // 0 calm · 1 suspicious · 2 chasing
    this._alertTimer = 0;
    this._thief = false;

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
    this._animHooked = false;
    this._animRetry = 0;
    this._pendingMusic = null;
    this._warned = false;
  }

  /* ===================== lifecycle =================================== */

  async init() {
    // Wiring happens now even though there is no context: events that arrive before
    // the first gesture are simply dropped, and nothing has to be re-subscribed later.
    this._wireEngine();
    this._hookAnimation();
    if (!this.available) this._warn('WebAudio unavailable — running silent.');
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
    if (this.ctx || (!this.available && !existing)) return this.ready;
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
    try { this.ctx.resume?.().catch?.(() => {}); } catch {}

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
    if (!existing) this._loadTrack().catch(() => {});

    return this.ready;
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
  async _loadTrack(url = 'assets/audio/museum-of-natural-history.mp3') {
    if (!this.ready || !this.ctx || this._trackState !== 'idle') return false;
    this._trackState = 'loading';
    let buf;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      this._trackState = 'failed';
      this._warn(`music track unavailable (${err?.message || err}) — procedural score continues`);
      return false;
    }
    if (!this.ready || !this.ctx) { this._trackState = 'idle'; return false; }

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.trackGain);
      const t = this.ctx.currentTime;
      src.start(t);
      this.track = src;
      this._trackState = 'playing';

      /* Equal-length cross-fade: the recording up, the synthesised score down. Four seconds
         because both are music and a fast swap between two pieces of music reads as a glitch. */
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
      this._warn(`music: "${url.split('/').pop()}" ${buf.duration.toFixed(0)}s, looping`);
      return true;
    } catch (err) {
      this._trackState = 'failed';
      this._warn(`music track start failed: ${err?.message || err}`);
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

    if (this._trackState === 'playing') {
      const t = this.ctx.currentTime, s = TRACK_SECTION[section] || TRACK_SECTION.explore;
      const g = this.trackGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(TUNE.trackLevel * s.level, t + 1.2);
      const f = this.musicFilter.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(f.value, t);
      f.linearRampToValueAtTime(s.cutoff, t + 1.2);
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
    if (!this.ready) {
      // ANIMATION may land after AUDIO; keep trying for a while, cheaply.
      if (!this._animHooked && this._animRetry++ < 600 && (this._animRetry & 31) === 0) this._hookAnimation();
      return;
    }
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
    if (this._autoOverrideFor > 0) this._autoOverrideFor -= dt;
    this._sectionTimer += dt;
    if (this._sectionAuto && this._autoOverrideFor <= 0 && this._sectionTimer > TUNE.sectionDebounce) {
      const want = this._wantSection();
      if (want !== this._section) { this._sectionTimer = 0; this.music(want); }
    }

    /* ---- state-driven loops ---- */
    this._trackStateLoops();

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

  _wantSection() {
    if (this._alert >= 2) return 'chase';
    if (this._alert === 1) return 'alert';
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
    on('caneSlam', (p) => this.play('dive_boom', { position: p?.pos }));
    on('hookGrab', (p) => this.play('hook_catch', { position: p?.pos }));
    on('hookRelease', (p) => this.play('rope_creak', { position: p?.pos, volume: 0.5 }));
    on('railMount', (p) => this.play('hook_catch', { position: p?.pos, volume: 0.5, rate: 1.35 }));
    on('poleMount', (p) => this.play('pole_scuff', { position: p?.pos }));
    on('spireLand', (p) => this.play('step_metal', { position: p?.pos, volume: 0.8, rate: 1.2 }));
    on('wallRun', (p) => this.play('step_stone', { position: p?.pos, volume: 0.5, rate: 0.9 }));
    on('wallJump', (p) => { this.play('jump', { position: p?.pos }); this.play('step_stone', { position: p?.pos, volume: 0.7 }); });
    on('ledgeGrab', (p) => this.play('step_cloth', { position: p?.pos, volume: 0.9, rate: 0.8 }));
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
    on('guardSpotted', () => this._onGuardAlert(2));
    on('guardLost', () => this._onGuardAlert(0));
    on('guardSound', (p) => {
      const n = typeof p === 'string' ? p : p?.name;
      const pos = typeof p === 'object' ? p?.pos : null;
      if (n && SFX[n]) this.play(n, { position: pos });
    });

    /* ---- systems ---- */
    on('thiefVision', (v) => this._onThiefVision(!!v));
    on('coins', (p) => this._onCoins(p));
    on('coin', (p) => this._onCoins(p));
    on('clue', (p) => this.play('clue_bottle', { position: p?.pos }));
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
        const sneaking = this._playerState === 'sneak' || this._playerState === 'crouch'
          || this._playerState === 'tiptoe' || this._playerState === 'crawl';
        this.play(name, { position: pos, volume: sneaking ? 0.34 : 1 });
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

  _onGuardAlert(p) {
    let level = 1;
    if (typeof p === 'number') level = p;
    else if (typeof p === 'boolean') level = p ? 2 : 0;
    else if (typeof p === 'string') level = p === 'chase' || p === 'alert' ? 2 : p === 'suspicious' ? 1 : 0;
    else if (p && typeof p === 'object') {
      const s = p.state ?? p.level ?? p.alert;
      if (typeof s === 'number') level = s;
      else if (typeof s === 'string') level = s === 'chase' || s === 'alert' ? 2 : s === 'suspicious' ? 1 : 0;
      else if (typeof s === 'boolean') level = s ? 2 : 0;
    }
    level = Math.max(0, Math.min(2, level | 0));
    const pos = (p && typeof p === 'object' && p.pos) || null;

    if (level > this._alert) {
      if (level >= 2) {
        this.play('alert_sting');
        this.play('guard_shout', { position: pos, delay: 0.18 });
      } else {
        this.play('guard_confused', { position: pos });
      }
    } else if (level === 0 && this._alert > 0) {
      this.play('guard_grunt', { position: pos, volume: 0.6 });
    }
    this._alert = level;
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
    if (!this.__opts) this.__opts = { r: this.rand, rate: 1, variant: 0, index: 1, streak: 0, force: 1, surface: 'stone' };
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
    for (const off of this._unsub) { try { off(); } catch {} }
    this._unsub.length = 0;
    if (!this.ctx) return;
    try { this.score?.dispose(); } catch {}
    /* A looping BufferSource outlives its graph unless stopped: nothing else here holds a
       reference to it, so without this the track keeps running after dispose(). */
    try { this.track?.stop(); this.track?.disconnect(); } catch {}
    this.track = null;
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
