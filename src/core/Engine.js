import * as THREE from 'three';

/**
 * Engine — owns the renderer, the scene, the frame loop and the module registry.
 *
 * Deliberately thin. It knows nothing about Egypt, Sly, or shading; it just guarantees
 * every module gets a consistent renderer, a clamped dt, and a way to find its peers.
 * See AGENTS.md §4 for the contract this implements.
 */

/**
 * Frames per second, measured against the WALL CLOCK.
 *
 * The counter this replaces accumulated `Engine.dt` — the SIMULATION delta, which `renderFrame`
 * clamps to 1/20 s and multiplies by `timeScale`. Two consequences, and both of them empty the
 * readout of meaning exactly where a reader needs it:
 *
 *   · **It saturated at 20.** Below 20 fps every frame contributes exactly 1/20 to the
 *     accumulator, so `frames / accum` is 20 whatever the machine is doing. There is no input
 *     below 20 fps on which the old expression could return anything else. Measured in this
 *     container during a driven play session: the game presented **0.70 frames per second** and
 *     `Debug.js`'s on-screen readout said **21**.
 *   · **Slow motion made it go UP.** Thief-o-Vision sets `timeScale` below 1, which shrinks every
 *     frame's contribution, so the reported rate rises while the game visibly slows.
 *
 * A frame rate is frames per second of real time, so real time is what this accumulates.
 *
 * It is an object rather than three more fields on Engine for one reason: Engine needs a WebGL
 * context and a DOM to exist, so nothing about it can be driven from a test. This can be handed
 * a synthetic clock, which is what lets `tests/enginefps.test.mjs` show the meter reading 60 on
 * one input and 0.7 on another — the two inputs the old expression could not have.
 */
export class FpsMeter {
  constructor(windowSec = 0.5) {
    this.windowSec = windowSec;
    this.fps = 0;
    /**
     * How many windows have closed — i.e. how many times `fps` has been *published*.
     *
     * `fps` starts at 0 and a genuinely stalled machine also publishes 0, so the value alone
     * cannot distinguish "not measured yet" from "measured, and it is dreadful". Anything that
     * needs to tell those apart (a readout deciding whether to print a number, a test asserting
     * on the first published value) reads this instead of guessing from `fps`.
     */
    this.windows = 0;
    this._accum = 0;
    this._frames = 0;
    this._last = -1;
  }

  /**
   * Forget the previous timestamp.
   *
   * Called whenever the loop is (re)started, so that the wall-clock gap spent stopped — a pause,
   * a backgrounded tab, a screenshot harness holding the loop for a minute between steps — is not
   * charged to the next frame as if it had taken a minute to draw.
   */
  reset() { this._last = -1; this._accum = 0; this._frames = 0; }

  /**
   * Record one presented frame at monotonic `nowMs` and return the current estimate.
   *
   * The first call after a reset establishes the origin: it has no interval behind it, so it
   * contributes neither time nor a frame, and `fps` holds its previous value until a real
   * interval has been seen. An interval that is non-positive or absurd (a clock stepped
   * backwards, a suspended process) is dropped rather than allowed into the window.
   */
  sample(nowMs) {
    if (this._last >= 0) {
      const d = (nowMs - this._last) / 1000;
      if (d > 0 && d < 60) { this._accum += d; this._frames++; }
    }
    this._last = nowMs;
    if (this._accum >= this.windowSec && this._frames > 0) {
      const raw = this._frames / this._accum;
      /* Integer above 10, one decimal below it. Rounding to an integer throughout is what the old
         counter did, and at the rates this fix exists to expose it re-hides them: 0.70 fps would
         print as "1 fps", which is the same lie one digit smaller. */
      this.fps = raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10;
      this.windows++;
      this._accum = 0; this._frames = 0;
    }
    return this.fps;
  }
}

const QUALITY_PRESETS = {
  low:   { pixelRatio: 1.0, shadowMap: 1024, shadowCascades: 1, aniso: 4,  msaa: 0, ssao: false, volumetrics: false, particles: 0.35, texSize: 512 },
  med:   { pixelRatio: 1.0, shadowMap: 2048, shadowCascades: 2, aniso: 8,  msaa: 0, ssao: true,  volumetrics: true,  particles: 0.7,  texSize: 1024 },
  high:  { pixelRatio: 1.5, shadowMap: 3072, shadowCascades: 3, aniso: 16, msaa: 4, ssao: true,  volumetrics: true,  particles: 1.0,  texSize: 1024 },
  ultra: { pixelRatio: 2.0, shadowMap: 4096, shadowCascades: 4, aniso: 16, msaa: 4, ssao: true,  volumetrics: true,  particles: 1.4,  texSize: 2048 },
};

export class Engine {
  constructor({ container, quality = 'high' } = {}) {
    this.container = container || document.getElementById('app') || document.body;

    this.quality = quality;
    this.settings = { ...QUALITY_PRESETS[quality] };

    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    /* ---- Renderer ------------------------------------------------------- */
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.settings.msaa > 0,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      // Screenshots read back from the canvas, so the drawing buffer must survive the frame.
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Tone mapping is the single biggest lever on whether the frame reads "AAA" or "WebGL demo".
    // AgX holds saturated golds without hue-shifting them to white the way Reinhard does.
    this.renderer.toneMapping = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.renderer.shadowMap.enabled = true;
    /* PCF, not VSM and not PCFSoft.
     *
     * VSM was the original choice for its cheap wide penumbra, but it light-bleeds badly
     * across the high-contrast, large-depth-range geometry here, and bleeding reads as
     * "everything is lit".
     *
     * PCFSoftShadowMap must not be used on three ≥ r185: the constant is deprecated and,
     * more importantly, `WebGLProgram`'s shadowMapTypeDefines table has no entry for it, so
     * any program compiled while it is still set gets `SHADOWMAP_TYPE_BASIC` — a plain
     * sampler2D — while `WebGLShadowMap` silently rewrites the type to PCF and allocates the
     * depth textures with hardware comparison enabled. main.js warms the whole scene through
     * renderer.compile() before the first shadow render, so that is exactly when it happens.
     * Sampling a compare-mode depth texture through a non-shadow sampler is undefined, and it
     * is the sort of mismatch that reads as a uniformly zero shadow term. Setting the type
     * three actually implements keeps program and texture in agreement from the first frame. */
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;

    this.renderer.autoClear = true;
    this.renderer.info.autoReset = false;

    this.container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;

    this.maxAniso = Math.min(
      this.settings.aniso,
      this.renderer.capabilities.getMaxAnisotropy?.() ?? 4
    );

    /* ---- Scene / camera ------------------------------------------------- */
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, this.width / this.height, 0.1, 4000);
    this.camera.position.set(0, 6, 14);
    this.camera.lookAt(0, 2, 0);
    this.scene.add(this.camera);

    /* ---- Time ----------------------------------------------------------- */
    this.clock = new THREE.Clock();
    this.time = 0;
    this.dt = 1 / 60;
    this.frame = 0;
    this.timeScale = 1;      // Thief-o-Vision slow-mo writes here
    this.paused = false;

    /* ---- Modules / events ----------------------------------------------- */
    this._modules = new Map();
    this._ordered = [];
    this._events = new Map();

    /**
     * Colliders can be registered before the COLLISION module exists (module init order
     * is not guaranteed), so they queue here and get flushed once it shows up.
     */
    this._colliderQueue = [];

    this.debug = {
      freeCam: false,
      showColliders: false,
      wireframe: false,
      timeOfDay: 0.78,       // 0 = midnight, 0.5 = noon, 0.78 = golden hour
      paused: false,
      hideHud: false,
      hidePlayer: false,
    };

    this.warnings = [];
    /* `ms` is the CPU time spent inside `renderFrame`, and only that. GL commands complete
       asynchronously, so on a software rasteriser it reads 18-45 ms while frames are arriving
       1.4 s apart. `fps` is the honest cost figure; `ms` is where that cost was spent in JS. */
    this.stats = { fps: 0, drawCalls: 0, triangles: 0, programs: 0, ms: 0 };
    this._fps = new FpsMeter();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(this.container);
  }

  _pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.settings.pixelRatio);
  }

  /* ===================== module registry ============================= */

  /**
   * Register a module instance under a key from AGENTS.md §4.3.
   * Update order follows registration order, so register producers before consumers.
   */
  register(key, mod) {
    if (this._modules.has(key)) {
      this.warn(`Engine: module "${key}" registered twice; keeping the first.`);
      return this._modules.get(key);
    }
    this._modules.set(key, mod);
    this._ordered.push({ key, mod });
    return mod;
  }

  /** Fetch a peer module. Returns null when it hasn't been written yet — always guard. */
  get(key) {
    return this._modules.get(key) ?? null;
  }

  has(key) { return this._modules.has(key); }

  async initModules(onProgress) {
    const total = this._ordered.length || 1;
    let done = 0;
    for (const { key, mod } of this._ordered) {
      try {
        if (typeof mod.init === 'function') await mod.init();
      } catch (err) {
        // One broken module must not take the whole build down — the critic still needs a frame.
        this.warn(`init failed for "${key}": ${err?.message || err}`);
        console.error(`[${key}] init failed`, err);
      }
      done++;
      onProgress?.(done / total, key);
      // Yield so the loading bar actually paints between heavy module builds.
      await new Promise((r) => setTimeout(r, 0));
    }
    if (this._modules.has('collision')) this._flushColliders();
  }

  /* ===================== events ====================================== */

  on(evt, fn) {
    if (!this._events.has(evt)) this._events.set(evt, new Set());
    this._events.get(evt).add(fn);
    return () => this.off(evt, fn);
  }

  off(evt, fn) { this._events.get(evt)?.delete(fn); }

  emit(evt, payload) {
    const set = this._events.get(evt);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (err) { this.warn(`event "${evt}" handler threw: ${err?.message}`); }
    }
  }

  /* ===================== colliders =================================== */

  /**
   * Hand a mesh to the collision system with a surface tag (AGENTS.md §4.4).
   * Safe to call at any point during init.
   */
  registerCollider(mesh, opts = {}) {
    const rec = {
      mesh,
      tag: opts.tag || 'ground',
      climbable: !!opts.climbable,
      material: opts.material || 'stone',
      oneWay: !!opts.oneWay,
      ...opts,
    };
    const collision = this.get('collision');
    if (collision?.add) collision.add(rec);
    else this._colliderQueue.push(rec);
    return rec;
  }

  _flushColliders() {
    const collision = this.get('collision');
    if (!collision?.add) return;
    for (const rec of this._colliderQueue) collision.add(rec);
    this._colliderQueue.length = 0;
  }

  /* ===================== frame loop ================================== */

  start() {
    this.clock.start();
    this._fps.reset();
    this._looping = true;
    this._raf = requestAnimationFrame(this._tick);
  }

  /**
   * Halt the rAF loop so frames can be stepped by hand. The screenshot harness needs this:
   * a live loop makes captures non-deterministic and races the canvas readback.
   */
  stopLoop() {
    this._looping = false;
    cancelAnimationFrame(this._raf);
  }

  resumeLoop() {
    if (this._looping) return;
    this._looping = true;
    this.clock.getDelta();       // discard the gap spent paused
    this._fps.reset();           // ...and do not bill the next frame for it either
    this._raf = requestAnimationFrame(this._tick);
  }

  _tick = () => {
    if (!this._looping) return;
    this._raf = requestAnimationFrame(this._tick);
    this.renderFrame();
  };

  /** One full frame. Exposed so the screenshot harness can step deterministically. */
  renderFrame(forcedDt) {
    const t0 = performance.now();

    // Clamp dt: a GC hitch or a backgrounded tab must never let the player tunnel a wall.
    const raw = forcedDt ?? this.clock.getDelta();
    this.dt = Math.min(raw, 1 / 20) * this.timeScale;
    if (this.debug.paused || this.paused) this.dt = 0;
    this.time += this.dt;
    this.frame++;

    for (const { key, mod } of this._ordered) {
      if (typeof mod.update !== 'function') continue;
      try { mod.update(this.dt, this.time); }
      catch (err) {
        this.warn(`update failed in "${key}": ${err?.message || err}`);
        console.error(`[${key}] update failed`, err);
        mod.update = () => {};   // Stop the console flood; the frame keeps rendering.
      }
    }

    this.renderer.info.reset();
    const postfx = this.get('postfx');
    if (postfx?.render) postfx.render(this.dt);
    else this.renderer.render(this.scene, this.camera);

    const info = this.renderer.info;
    this.stats.drawCalls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.programs = info.programs?.length ?? 0;
    const t1 = performance.now();
    this.stats.ms = t1 - t0;
    /* Wall clock, NOT `this.dt` — see FpsMeter's header for what accumulating the simulation
       delta did to this number below 20 fps and under `timeScale`. */
    this.stats.fps = this._fps.sample(t1);
  }

  /* ===================== misc ======================================== */

  _onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(w, h, true);
    /* **Neither field is read** (§430), and that is correct rather than an oversight. Both
       subscribers — `Particles._resizeDepth` and `PostFX.setSize` — take no parameter and
       re-derive from the renderer, because a derived constant refreshed by events goes stale in
       whichever path forgets to forward one (`PostFX.js` says so at its `syncInkResolution`).
       The event is the *notification*; the size is read from the source of truth. */
    this.emit('resize', { width: w, height: h });
  }

  setQuality(q) {
    if (!QUALITY_PRESETS[q]) return;
    this.quality = q;
    this.settings = { ...QUALITY_PRESETS[q] };
    this.renderer.setPixelRatio(this._pixelRatio());
    this.emit('quality', this.settings);
  }

  /** Non-fatal problems surface here so the critic can read them off the page. */
  warn(msg) {
    if (this.warnings.length < 200) this.warnings.push(String(msg));
    console.warn('[engine]', msg);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this._ro?.disconnect();
    for (const { mod } of this._ordered) { try { mod.dispose?.(); } catch {} }
    this.renderer.dispose();
    this.canvas.remove();
  }
}
