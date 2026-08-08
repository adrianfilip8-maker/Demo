import * as THREE from 'three';
import { mkCanvas, css, TEX_AB } from './Canvas2D.js';
import { MATERIALS, MATERIAL_NAMES, MATERIAL_GROUPS, PREWARM } from './Materials.js';
import { bake, bakeSize } from './Bake.js';

/**
 * Textures — the module wrapper over the procedural material catalogue.
 *
 * `Materials.js` holds the recipes: each one paints into a `Surface` (height, albedo,
 * roughness, metalness, occlusion, optional alpha/emissive as flat Float32 buffers), and
 * `NormalMap.derive()` turns that into GPU-ready buffers. This file owns the THREE.Texture
 * lifecycle, the cache, and the quality/memory policy.
 *
 * AO, roughness and metalness ship packed into one RGB texture (the glTF ORM convention) at
 * half resolution — all three are low-frequency next to albedo and normal, so it's free
 * quality-wise and buys back a third of the texture budget.
 */

/**
 * Names consumers ask for that aren't catalogue keys. Cheaper to alias than to make every
 * caller guess the exact recipe name, and it keeps a typo from silently producing an
 * untextured surface.
 */
const ALIASES = {
  rope_fibre: 'rope',
  bronze_dark: 'bronze_aged',
  sand: 'sand_ripples',
  stone: 'sandstone_block',
  gold: 'gold_leaf',
  cloth: 'linen_cloth',
  wood: 'wood_old',
  hieroglyphs: 'hieroglyph_wall',
  water: 'water_nile',
  sparkle: 'spark_diamond',
};

/**
 * World metres per declared `tile` unit, per consumer. Default 2 — `Kit.UV_PER_M = 0.5` puts
 * one UV unit every two metres, so everything ARCHITECTURE and PROPS dress shows one repeat per
 * two tiles. Terrain hands its meshes world-metre UVs and sets `repeat` itself, so those two
 * recipes get the tile they declare. See `_build()` for why this is documented rather than
 * compensated for.
 *
 * **This map is keyed by recipe and the factor is a property of the *consumer*, so two call
 * sites can disagree and this table cannot express it.** A sweep of every UV-scale expression in
 * `src/world/**` found two live exceptions to the default 2, and both are geometry dressed with
 * recipes that are *also* used at the default elsewhere, so neither can be added here.
 *
 * **That sweep was scoped to `src/world/**` and there is a fourth exception outside it.** Grepping
 * the shape itself — `repeat.set` / `.repeat =` across all of `src/` — finds `Guard.js:1105`,
 * where `_repeat()` clones the shared texture and calls `repeat.set(r, r)`, which *overwrites*
 * the repeat `_build()` set rather than composing with it. Two recipes go through it:
 *
 *   `Guard.js:1041`  `linen_cloth`  at repeat 2.0   (declared tile 0.55 → `_build()` set 1.818)
 *   `Guard.js:1054`  `bronze_aged`  at repeat 2.4   (declared tile 1.0  → `_build()` set 1.0)
 *
 * Guard UVs run 0..1 over a lofted garment, not at `UV_PER_M`, so one repeat covers half a
 * garment rather than the 1.1 m / 2.0 m `report()` prints for these two — and both are *also*
 * dressed by `Props.js` (banners, braziers) at the architecture default, so like the two cases
 * above they cannot be entered in the table. Checked for the sub-pixel failure this note exists
 * to catch, and both clear it: at guard range (~8 m, 1.2 mrad/px ⇒ 9.6 mm/px) `linen_cloth`'s
 * detail lands near 38 mm ≈ 4 px and `bronze_aged`'s near 105 mm ≈ 11 px. So this is a wrong
 * number, not a lost feature — but it is wrong in the same direction as the three below.
 *
 *
 *   `Kit.js:1259`   `steppedPyramid` → `boxProjectUVs(g, UV_PER_M * 0.25)`, i.e. one UV per 8 m.
 *                   `EgyptLevel.js:1262` dresses both pyramids with `limestone_polished`
 *                   (tile 3.8), so their real repeat is **30.4 m**, not the 7.6 m `report()`
 *                   prints — and `derive()` encoded the normal slope for 7.6 m, so the relief on
 *                   a pyramid is a quarter of its `bump`. Correct in the frame (§2.3 wants the
 *                   background hazed and simple) and wrong in every number quoted about it.
 *   `PropKit.js:701` banner cloth → `x * UV_PER_M * 2`, i.e. one UV per 1 m, so `linen_cloth`
 *                   (tile 0.55) repeats every **0.55 m**, half what is printed.
 *
 * `Vegetation.js` is a third case and is already noted in `_build()`: trunk UVs are 0..1 around
 * and 0..height/3 up, so `palm_bark` lands near [3.1, 5.4] m on a 9 m palm.
 *
 * The rule to carry: **`mmPerTexel` and `worldTile` from `report()` are only true for geometry
 * built at `UV_PER_M`.** Before sizing anything in metres against a specific surface, check that
 * surface's own UV expression. This is the same class of error as `sand_ripples` at 3.7x slope
 * and `MOTES.size` at sub-pixel; it has now been found three times.
 */
const CONSUMER_UV_SCALE = {
  sand_ripples: 1,   // Terrain: UV = metres, repeat 1/9.6
  sand_fine: 1,      // Terrain: UV = metres, repeat 1/8
};

export class Textures {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this._cache = new Map();       // name → texture set
    this._textures = [];           // everything we own, for dispose()
    this._bytes = 0;
    this._swatch = null;
    this._poolSize = 0;            // texture workers used by the last prewarm; 0 = main thread
    this.stats = { built: 0, ms: 0, bytes: 0 };

    // A hard ceiling so a pathological run can't exhaust GPU memory (AGENTS.md §1: 350 MB).
    this._budget = 350 * 1024 * 1024;

    engine.on('quality', () => {
      // Texture size is baked into every built map, so a quality change means starting over.
      this._flush();
    });
  }

  get size() {
    return Math.max(128, this.engine.settings.texSize | 0 || 1024);
  }

  async init() {
    const t0 = performance.now();

    /* **Stamp the A/B arm into the boot warnings, so a frame carries which build it is.**
     * `shot.mjs` copies `window.__GAME.warnings` into `report.json` (it stamps the SHA for the
     * same reason — see its header, and KNOWN_ISSUES §10 for the 25-commit-old PNG that was read
     * as a live bug). A control arm is invisible in a PNG and identical in the SHA, which is
     * exactly the provenance hole that stamp exists to close: two capture directories that
     * differ only in an environment variable are indistinguishable after the fact unless one of
     * them says so. Silent on the shipped path, so nothing is added to a normal run. */
    const ab = TEX_AB();
    if (ab.length) this.engine.warn(`textures: A/B CONTROL BUILD — treatments disabled: ${ab.join(',')}`);

    // Build only what the shipped level actually puts on screen; everything else is built
    // lazily on first get().
    const jobs = PREWARM.filter((n) => MATERIALS[n] && !this._cache.has(n));
    const built = await this._prewarmParallel(jobs);
    /* Serial fallback: no workers on this host, the pool died, or a job came back broken.
     * Identical code either way — `get()` calls `bake()` through `_buildLocal`, which is the
     * same function the worker calls. Yielding between recipes keeps the loading bar painting. */
    for (const name of jobs) {
      if (built.has(name)) continue;
      this.get(name);
      await new Promise((r) => setTimeout(r, 0));
    }

    this.stats.ms = performance.now() - t0;
    this.stats.bytes = this._bytes;
    if (this.stats.ms > 6000) {
      this.engine.warn(`textures: prewarm took ${(this.stats.ms / 1000).toFixed(1)}s at size ${this.size}`);
    }
    this.engine.warn(`textures: prewarm ${this.stats.built} recipes in ${(this.stats.ms / 1000).toFixed(2)}s `
      + `at size ${this.size} on ${this._poolSize} worker${this._poolSize === 1 ? '' : 's'} `
      + `(${(this._bytes / 1048576).toFixed(0)} MB)`);
  }

  /* ───────────────────────────── parallel prewarm ───────────────────────────── */

  /**
   * Build `names` across a pool of workers and return the set that succeeded.
   *
   * **Why this is worth a worker pool at all.** Measured offline against the shipped catalogue at
   * `texSize 1024`, the prewarm list is ~20 s of pure single-threaded arithmetic, and it used to
   * run on the main thread inside `init()` — which is where `textures: prewarm took 29.6s` and
   * first-frame times of 12.7 / 17.5 / 29.0 s came from. That is three orders of magnitude larger
   * than any frame-time number in the ledger and it was the one real performance problem in the
   * dataset (KNOWN_ISSUES §215.2). Every recipe is a pure function of `(name, seed, size)`,
   * shares no state, and touches no GPU object, so the only reason it was serial is that nobody
   * had moved it.
   *
   * **Longest-processing-time-first.** Jobs are dispatched biggest-first (`bakeSize` descending),
   * which is the standard LPT bound for makespan: with the shipped list the six 1024² recipes are
   * ~3.3 s each and the rest ~0.65 s, so dispatching in catalogue order would leave one worker
   * starting a 3.3 s job after the others had run dry. Workers pull the next job on completion
   * rather than being handed a fixed share, so a slow recipe cannot strand a queue behind it.
   *
   * **The main thread is deliberately left idle.** It has one job during boot — painting the
   * loading bar — and it could not do it before, because a 3.3 s recipe blocks rAF for 3.3 s and
   * the `setTimeout(0)` between recipes only yielded *between* them. `hardwareConcurrency - 1`
   * keeps a core for that, capped at 4 because each in-flight 1024² build holds ~120 MB of
   * Float32 working set and four of them at once is already 480 MB of transient heap.
   */
  async _prewarmParallel(names) {
    const done = new Set();
    if (!names.length) return done;

    const hw = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 0;
    const want = Math.max(1, Math.min(4, (hw || 2) - 1, names.length));
    const workers = this._spawnPool(want);
    this._poolSize = workers.length;
    if (!workers.length) return done;

    // Biggest first — see LPT note above.
    const queue = names.slice().sort((a, b) => bakeSize(MATERIALS[b], this.size) - bakeSize(MATERIALS[a], this.size));
    const texSize = this.size, quality = this.engine.quality;
    /* The A/B arm as a raw string, shipped with every job. A worker has its own global scope, so
     * `globalThis.__TEX_AB` set by a CPU-side lab on the main thread does not reach it — see the
     * header of `TextureWorker.js`. `TEX_AB()` is the parsed form; re-joining it hands the worker
     * exactly what this thread read, whichever source it came from. */
    const ab = TEX_AB().join(',');

    let next = 0, id = 0;
    const pending = new Map();
    await new Promise((resolve) => {
      let live = workers.length;
      const retire = (w) => { try { w.terminate(); } catch { /* already gone */ } if (--live === 0) resolve(); };
      const pump = (w) => {
        if (next >= queue.length) { retire(w); return; }
        const name = queue[next++];
        const jid = id++;
        pending.set(jid, { w, name });
        w.postMessage({ id: jid, name, texSize, quality, ab });
      };
      for (const w of workers) {
        w.onmessage = (e) => {
          const msg = e.data || {};
          const job = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.ok && msg.payload) {
            try {
              this._cache.set(msg.payload.name, this._finish(msg.payload.name, MATERIALS[msg.payload.name], msg.payload));
              done.add(msg.payload.name);
            } catch (err) {
              this.engine.warn(`textures: "${msg.payload.name}" failed to upload — ${err?.message || err}`);
            }
          } else if (job) {
            // Leave it out of `done` and the serial pass in init() rebuilds it here.
            this.engine.warn(`textures: worker build of "${msg.name || job.name}" failed — ${msg.error}`);
          }
          pump(w);
        };
        const die = (why) => {
          w.onmessage = null;
          this.engine.warn(`textures: texture worker died (${why}); remaining recipes build on the main thread`);
          next = queue.length;                       // stop handing out work
          retire(w);
        };
        w.onerror = (err) => die(err?.message || 'error');
        w.onmessageerror = () => die('messageerror');
        pump(w);
      }
    });
    return done;
  }

  /** Spawn up to `n` module workers. Returns [] on any host that cannot make one. */
  _spawnPool(n) {
    const out = [];
    if (typeof Worker === 'undefined') return out;
    for (let i = 0; i < n; i++) {
      try {
        /* `new URL(..., import.meta.url)` is the form the bundler recognises: Vite emits the
         * worker as its own chunk and rewrites this to a same-bundle URL, so the build stays
         * self-contained (AGENTS §1) — nothing is fetched from outside the build output. */
        out.push(new Worker(new URL('./TextureWorker.js', import.meta.url), { type: 'module' }));
      } catch (err) {
        if (!i) this.engine.warn(`textures: no worker pool (${err?.message || err}); building on the main thread`);
        break;
      }
    }
    return out;
  }

  update() {}

  /* ───────────────────────────── public API ───────────────────────────── */

  /** Every recipe name in the catalogue. */
  names() { return MATERIAL_NAMES.slice(); }

  /** Names grouped by material family — handy when browsing the catalogue. */
  groups() { return MATERIAL_GROUPS; }

  has(name) { return !!MATERIALS[name]; }

  /**
   * Fetch a material's texture set, building it on first request.
   * @returns {{map, normalMap, roughnessMap, aoMap, metalnessMap, emissiveMap, repeat, normalScale, tile}|null}
   */
  get(name) {
    const key = MATERIALS[name] ? name : (ALIASES[name] ?? name);
    const hit = this._cache.get(key);
    if (hit) return hit;

    const recipe = MATERIALS[key];
    if (!recipe) {
      this.engine.warn(`textures: no recipe named "${name}"`);
      return null;
    }
    name = key;
    if (this._bytes > this._budget) {
      this.engine.warn(`textures: budget exhausted, refusing to build "${name}"`);
      return null;
    }

    let set = null;
    try {
      set = this._buildLocal(name, recipe);
    } catch (err) {
      // A broken recipe must not take the frame down — the caller falls back to flat colour.
      this.engine.warn(`textures: "${name}" failed to build — ${err?.message || err}`);
      console.error(`[textures/${name}]`, err);
      set = null;
    }
    this._cache.set(name, set);
    return set;
  }

  /* ───────────────────────────── building ───────────────────────────── */

  /**
   * Build on this thread. The recipe arithmetic itself lives in `Bake.js`, which is the *same*
   * module `TextureWorker.js` calls — so a lazily-requested texture and a prewarmed one are the
   * same function of the same seed, not two implementations that happen to agree.
   */
  _buildLocal(name, recipe) {
    return this._finish(name, recipe, bake(name, this.size, this.engine.quality));
  }

  /**
   * Turn baked byte buffers into the texture bundle consumers hold. GPU-side only; runs on the
   * main thread whether the bytes came from here or from a worker.
   */
  _finish(name, recipe, out) {
    const size = out.size;

    /* Joint sign, measured in `Bake.js` while the masonry masks were still alive — they die with
     * the Surface, and once a build happens in a worker the Surface never crosses the thread
     * boundary at all. Both deltas must come out negative: see `report()` for why a positive luma
     * delta renders as bright grout. */
    const joint = out.joint;
    if (joint && (joint.dY > 0 || joint.dH > 0)) {
      this.engine.warn(`textures: "${name}" has an inverted joint (dLuma ${joint.dY}, dHeight ${joint.dH}) — mortar must be darker and lower than the block faces`);
    }

    // Anisotropy is what stops a grazing wall smearing its mip chain into mush; a driver that
    // reports 0 would otherwise disable minification filtering quality entirely.
    const aniso = Math.max(1, this.engine.maxAniso | 0);
    const wrap = recipe.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;

    const map = this._tex(out.albedo, size, {
      colorSpace: THREE.SRGBColorSpace, wrap, aniso,
      // Sprites carry alpha; everything else is opaque and shouldn't pay for blending.
      alpha: out.hasAlpha,
    });

    const normalMap = this._tex(out.normal, size, { colorSpace: THREE.NoColorSpace, wrap, aniso });

    const orm = this._tex(out.orm.data, out.orm.size, { colorSpace: THREE.NoColorSpace, wrap, aniso });

    const emissiveMap = out.emissive
      ? this._tex(out.emissive, size, { colorSpace: THREE.SRGBColorSpace, wrap, aniso })
      : null;

    /* `tile` inverts into the repeat. Recipes may give it anisotropically as [u, v] — column
     * flutes and tail rings both do — and treating that array as a number silently produced a
     * NaN repeat, which drops the texture entirely.
     *
     * **Correct the record on what `tile` means in world metres.** The comment that used to sit
     * here said "one UV unit of a mesh is one metre by the level's convention". That is true of
     * exactly one consumer and false of every other, and the discrepancy is the same class of
     * mistake that made `sand_ripples` render at 3.7x its authored slope:
     *
     *   Kit.js / PropKit.js   `UV_PER_M = 0.5` — "1 UV unit per 2 m, the whole project's texel
     *                         density contract". So every wall, column, prop and pavement in
     *                         the level shows one repeat per **2 x tile** metres.
     *   Terrain.js            UVs are world metres and Terrain overrides `repeat` itself
     *                         (1/9.6 for the ripple normal, 1/8 for `sand_fine`), so those two
     *                         recipes get exactly the tile they declare.
     *   Vegetation.js         trunk UVs are 0..1 around the trunk and 0..height/3 up it, i.e.
     *                         not world-scaled at all — `palm_bark`'s declared [1.4, 1.8] lands
     *                         at roughly [3.1, 5.4] m on a 9 m palm.
     *   SlyModel.js           builds its own maps and sets its own repeat; the catalogue's
     *                         `sly` group is not what dresses the character.
     *
     * Nothing here compensates for that, on purpose: the factor is a property of the consumer's
     * UVs, and halving every repeat to "correct" it would double the tiling frequency of every
     * surface in the game, which is the failure §7.3 lists two lines above this one. What it
     * does mean is that **every number in Materials.js quoted "in metres" is half the world
     * distance it actually covers on architecture**, and that `derive()` therefore encodes
     * normal slopes for `tile` metres that are then stretched over `2 x tile` — so the relief on
     * every architectural surface is twice as steep as its `bump` claims. Judged in frames that
     * reads as "chiselled" rather than "wrong", so it stays; judged in numbers it is a trap, and
     * the next person to reach for `bump` should know which one they are turning.
     * `report()` prints the true world period so this cannot be mis-read again. */
    const tile = recipe.tile ?? 2.0;
    const tu = Math.max(0.05, Array.isArray(tile) ? tile[0] : tile);
    const tv = Math.max(0.05, Array.isArray(tile) ? (tile[1] ?? tile[0]) : tile);
    const rep = [1 / tu, 1 / tv];
    for (const t of [map, normalMap, orm, emissiveMap]) {
      if (t) t.repeat.set(rep[0], rep[1]);
    }

    this.stats.built++;
    return {
      map,
      normalMap,
      // Same packed texture in all three slots — three.js reads R for AO, G for roughness,
      // B for metalness, which is exactly how packORM laid it out.
      roughnessMap: orm,
      aoMap: orm,
      metalnessMap: orm,
      emissiveMap,
      orm,
      joint,
      repeat: rep,
      tile,
      /* **1.0, and it has to be 1.0.** This field used to publish `derive()`'s `ku` — the slope
       * scale `bump * size / tile`, which runs 0.26 to 8.23 across the catalogue. But `ku` is
       * applied *inside* `heightToNormal`, before the vector is normalised, so what ships in the
       * normal map is already the finished, knee-limited normal. The correct `normalScale` for
       * any consumer of this bundle is therefore unity.
       *
       * Nothing reads it today — ARCHITECTURE and PROPS copy six named map slots out of the
       * bundle and TERRAIN and SlyModel set their own literals — so this was latent rather than
       * live. It was also one spread operator from being neither: `shading.toon()` accepts
       * `normalScale`, `Terrain.mat()` forwards `opts.normalScale` straight into a material, and
       * this key sits two lines from `normalMap` in the object every one of them destructures. A
       * consumer that wrote `shading.toon({ ...textures.get(name) })` would have multiplied every
       * tangent xy in the game by up to 8.2 and turned every surface into crumpled foil.
       *
       * Same shape as the `Math.max(0.05, [u,v])` NaN: right in one place, wrong and waiting in
       * another. The slope scale is still published, under a name that says what it is, because
       * the QA report wants it — see `report()`'s `slopeScale`. */
      normalScale: 1.0,
      slopeScale: out.normalStrength,
      rough: recipe.rough ?? 0.85,
      group: recipe.group ?? 'misc',
      size,
    };
  }

  _tex(data, size, { colorSpace, wrap, aniso, alpha = false }) {
    const t = new THREE.DataTexture(
      data, size, size,
      THREE.RGBAFormat, THREE.UnsignedByteType
    );
    t.colorSpace = colorSpace;
    t.wrapS = t.wrapT = wrap;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = aniso;
    t.premultiplyAlpha = false;
    // Surface row 0 is v=0, which is also where a DataTexture puts its first row — so no flip.
    // Canvas2D.rasterMask already accounts for canvas y running the other way.
    t.flipY = false;
    t.needsUpdate = true;
    if (alpha) t.format = THREE.RGBAFormat;

    this._textures.push(t);
    this._bytes += size * size * 4 * 1.34;   // ≈ +1/3 for the mip chain
    return t;
  }

  /* ───────────────────────────── QA swatch sheet ───────────────────────────── */

  /**
   * A contact sheet of every material's albedo, for visual review. Built on demand and
   * cached; not part of the shipped frame.
   */
  swatchSheet(cols = 8, cell = 128) {
    if (this._swatch) return this._swatch;

    const names = MATERIAL_NAMES;
    const rows = Math.ceil(names.length / cols);
    const label = 14;
    // Deliberately a DOM canvas, not `mkCanvas`: the sheet exists to be exported by the shot
    // harness and an OffscreenCanvas has no `toDataURL`. `this.swatchCanvas` is the handle.
    const canvas = typeof document !== 'undefined'
      ? Object.assign(document.createElement('canvas'), { width: cols * cell, height: rows * (cell + label) })
      : mkCanvas(cols * cell, rows * (cell + label));
    this.swatchCanvas = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.fillStyle = '#140f18';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    names.forEach((name, i) => {
      const cx = (i % cols) * cell;
      const cy = Math.floor(i / cols) * (cell + label);
      const set = this.get(name);
      if (set?.map?.image?.data) {
        // Nearest-neighbour the DataTexture buffer down into the cell.
        const src = set.map.image.data;
        const ss = set.size;
        const img = ctx.createImageData(cell, cell);
        for (let y = 0; y < cell; y++) {
          const sy = ((y / cell) * ss) | 0;
          for (let x = 0; x < cell; x++) {
            const sx = ((x / cell) * ss) | 0;
            const s = (sy * ss + sx) * 4, d = (y * cell + x) * 4;
            img.data[d] = src[s]; img.data[d + 1] = src[s + 1];
            img.data[d + 2] = src[s + 2]; img.data[d + 3] = 255;
          }
        }
        ctx.putImageData(img, cx, cy);
      } else {
        ctx.fillStyle = '#a83c26';
        ctx.fillRect(cx, cy, cell, cell);
      }
      ctx.fillStyle = css(0xefe6d6);
      ctx.font = '9px ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(name.slice(0, 22), cx + 3, cy + cell + 2);
    });

    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    this._textures.push(t);
    this._swatch = t;
    return t;
  }

  /**
   * Per-material numbers, for isolating a look problem without a full capture.
   *
   * A capture on this container costs 2–5 minutes and arrives with lighting, post-processing and
   * every other agent's work mixed in; these numbers come straight off the packed albedo and
   * answer material questions in isolation. Four of them are worth explaining, because each one
   * caught a defect in the scoring pass that was invisible in the source and obvious in a frame:
   *
   * - `lumaRms` — detail contrast at full resolution. High means "busy".
   * - `mipRms` — the same measured after averaging 16×16 blocks, i.e. what survives to twenty
   *   metres. This is the *blotchiness* number, and it is the one that matters for AGENTS §7.3's
   *   squint test: high-frequency grain averages away and is fine, but a mottle that is still
   *   there at mip 4 is a patch, and a wall of patches reads as camouflage. `granite_pink`
   *   scored 0.087 here when the obelisk was reading as pink-and-violet confetti.
   * - `darkTail` — the fraction of texels below the luminance of §2.2's `crevice #4a2f22`, which
   *   the palette names as the darkest value in the sandstone ramp. This is the direct predictor
   *   of the off-palette violet blotching, because the cel shader adds a flat `uShadowColor`
   *   wash proportional to `1 - key`: on a texel with albedo left to dominate the result reads
   *   as warm stone, and on a near-black texel the violet is all that is left. Stone recipes
   *   should report ~0.
   * - `jointDeltaY` / `jointDeltaH` — the joint-sign invariant, for any recipe built on
   *   `ashlar`. **Both must be negative.** Mortar and recesses are darker and lower than the
   *   faces they sit between; light collects on proud surfaces and dirt collects in the gaps.
   *   `paving_courtyard` shipped with a positive luma delta and rendered as pale flags divided
   *   by a raised white grid ("the floor reads as cracked ice").
   *
   * `built` only — pass `all: true` to force the whole catalogue.
   */
  report({ all = false } = {}) {
    const names = all ? MATERIAL_NAMES : [...this._cache.keys()];
    const CREVICE_LUMA = (0x4a * 0.2126 + 0x2f * 0.7152 + 0x22 * 0.0722) / 255;
    const rows = [];
    for (const name of names) {
      const set = all ? this.get(name) : this._cache.get(name);
      const src = set?.map?.image?.data;
      if (!src) { rows.push({ name, ok: false }); continue; }
      const ss = set.size, n = ss * ss;
      let r = 0, g = 0, b = 0, l = 0, l2 = 0, dark = 0;
      const luma = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        r += src[o]; g += src[o + 1]; b += src[o + 2];
        const y = (src[o] * 0.2126 + src[o + 1] * 0.7152 + src[o + 2] * 0.0722) / 255;
        luma[i] = y;
        l += y; l2 += y * y;
        if (y < CREVICE_LUMA) dark++;
      }
      const mean = l / n;
      const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
      const tu = Array.isArray(set.tile) ? set.tile[0] : set.tile;
      // World metres one repeat actually covers — see the note in _build(). Quoting `tile`
      // alone has now cost two separate scale bugs; quote what the frame sees.
      const wu = tu * (CONSUMER_UV_SCALE[name] ?? 2);

      // Box-average down four levels, then measure again: what is still varying at 20 m.
      let w = ss, cur = luma;
      for (let lvl = 0; lvl < 4 && w > 8; lvl++) {
        const h = w >> 1, next = new Float32Array(h * h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < h; x++) {
            const a = 2 * y * w + 2 * x;
            next[y * h + x] = (cur[a] + cur[a + 1] + cur[a + w] + cur[a + w + 1]) * 0.25;
          }
        }
        cur = next; w = h;
      }
      let mm = 0, mm2 = 0;
      for (let i = 0; i < cur.length; i++) { mm += cur[i]; mm2 += cur[i] * cur[i]; }
      mm /= cur.length;

      const row = {
        name, ok: true, size: ss, group: set.group,
        albedo: `#${hex(r)}${hex(g)}${hex(b)}`,
        lumaRms: +Math.sqrt(Math.max(0, l2 / n - mean * mean)).toFixed(4),
        mipRms: +Math.sqrt(Math.max(0, mm2 / cur.length - mm * mm)).toFixed(4),
        darkTail: +(dark / n).toFixed(4),
        /* The height-to-slope scale `bump * size / tile`, *not* a normal-map strength — it is
         * already baked into the shipped normal. Reported because it is the number that says
         * whether a recipe's relief is proportionate to its footprint; do not hand it to a
         * material. See the note on `normalScale` in `_build()`. */
        slopeScale: +(set.slopeScale ?? 0).toFixed(2),
        // Millimetres of *world* per texel, and metres of world per repeat. A feature has to
        // clear one screen pixel at the distance its surface is actually seen from or it is
        // decoration in the source file and nothing in the frame; both `MOTES.size` and
        // `sand_ripples` were lost exactly here.
        mmPerTexel: +((wu / ss) * 1000).toFixed(2),
        worldTile: +wu.toFixed(2),
        tile: set.tile,
      };

      // Joint sign, measured at build time while the masonry masks were still alive.
      if (set.joint) { row.jointDeltaY = set.joint.dY; row.jointDeltaH = set.joint.dH; }
      rows.push(row);
    }
    return { rows, megabytes: +(this._bytes / 1048576).toFixed(1), built: this.stats.built };
  }

  /* ───────────────────────────── lifecycle ───────────────────────────── */

  _flush() {
    for (const t of this._textures) t.dispose();
    this._textures.length = 0;
    this._cache.clear();
    this._swatch = null;
    this.swatchCanvas = null;
    this._bytes = 0;
  }

  dispose() { this._flush(); }
}
