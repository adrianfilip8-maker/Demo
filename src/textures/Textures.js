import * as THREE from 'three';
import { Surface, mkCanvas, css } from './Canvas2D.js';
import { derive } from './NormalMap.js';
import { MATERIALS, MATERIAL_NAMES, MATERIAL_GROUPS, PREWARM } from './Materials.js';

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

const _tmpCanvas = new WeakMap();

export class Textures {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this._cache = new Map();       // name → texture set
    this._textures = [];           // everything we own, for dispose()
    this._bytes = 0;
    this._swatch = null;
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

    // Build only what the canonical shots actually put on screen; everything else is built
    // lazily on first get(). Yielding between recipes keeps the loading bar painting.
    for (const name of PREWARM) {
      if (!MATERIALS[name]) continue;
      this.get(name);
      await new Promise((r) => setTimeout(r, 0));
    }

    this.stats.ms = performance.now() - t0;
    this.stats.bytes = this._bytes;
    if (this.stats.ms > 6000) {
      this.engine.warn(`textures: prewarm took ${(this.stats.ms / 1000).toFixed(1)}s at size ${this.size}`);
    }
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
    const hit = this._cache.get(name);
    if (hit) return hit;

    const recipe = MATERIALS[name];
    if (!recipe) {
      this.engine.warn(`textures: no recipe named "${name}"`);
      return null;
    }
    if (this._bytes > this._budget) {
      this.engine.warn(`textures: budget exhausted, refusing to build "${name}"`);
      return null;
    }

    let set = null;
    try {
      set = this._build(name, recipe);
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

  _build(name, recipe) {
    // Small utility maps (sprites, decals) don't need the full budget resolution.
    const size = recipe.size
      ? Math.min(recipe.size, this.size)
      : (recipe.tier === 2 ? Math.max(256, this.size >> 1) : this.size);

    const surface = new Surface(size, (recipe.seed ?? hashName(name)) >>> 0);
    recipe.build(surface, { seed: surface.seed, size, name, quality: this.engine.quality });

    const out = derive(surface, {
      bump: recipe.bump ?? 0.03,
      tile: recipe.tile ?? 2.0,
      normalScale: recipe.normalScale ?? 1.0,
      aoStrength: recipe.aoStrength ?? 1.0,
      aoFloor: recipe.aoFloor ?? 0.16,
      micro: recipe.micro ?? 0.10,
      ormDiv: recipe.ormDiv ?? 2,
      smoothH: recipe.smoothH ?? 0,
    });

    const aniso = this.engine.maxAniso;
    const wrap = recipe.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;

    const map = this._tex(out.albedo, size, {
      colorSpace: THREE.SRGBColorSpace, wrap, aniso,
      // Sprites carry alpha; everything else is opaque and shouldn't pay for blending.
      alpha: !!surface.a,
    });

    const normalMap = this._tex(out.normal, size, { colorSpace: THREE.NoColorSpace, wrap, aniso });

    const orm = this._tex(out.orm.data, out.orm.size, { colorSpace: THREE.NoColorSpace, wrap, aniso });

    const emissiveMap = out.emissive
      ? this._tex(out.emissive, size, { colorSpace: THREE.SRGBColorSpace, wrap, aniso })
      : null;

    // One UV unit of a mesh is one metre by the level's convention, so `tile` (metres the
    // texture spans) inverts into the repeat.
    const rep = 1 / Math.max(0.05, recipe.tile ?? 2.0);
    for (const t of [map, normalMap, orm, emissiveMap]) {
      if (t) t.repeat.set(rep, rep);
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
      repeat: [rep, rep],
      tile: recipe.tile ?? 2.0,
      normalScale: out.normalStrength,
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
    const canvas = mkCanvas(cols * cell, rows * (cell + label));
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

  /* ───────────────────────────── lifecycle ───────────────────────────── */

  _flush() {
    for (const t of this._textures) t.dispose();
    this._textures.length = 0;
    this._cache.clear();
    this._swatch = null;
    this._bytes = 0;
  }

  dispose() { this._flush(); }
}

/** Stable per-name seed, so a material looks the same on every run and across commits. */
function hashName(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
