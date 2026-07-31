import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, WORLD_SEED } from '../core/Rand.js';
import * as K from './Kit.js';
import { buildEgyptLevel } from './EgyptLevel.js';

/**
 * Architecture — the Temple of Ra complex.
 *
 * This module is the plumbing: materials (with fallbacks, because SHADING and TEXTURES land
 * in parallel), geometry merge buckets, InstancedMesh helpers, and collider registration.
 * The *layout* lives in EgyptLevel.js so the coordinate contract (AGENTS.md §8.1) reads as
 * one document instead of being smeared through a build function.
 *
 * Performance strategy (§1 budget: ≤250 draws, ≤1.2M tris):
 *   - Every static block goes into a bucket keyed by (zone, material) and is merged into a
 *     single mesh at the end of init. Zones keep frustum culling useful; materials keep the
 *     merge legal. That lands the whole complex in ~25 draw calls.
 *   - Repeated identical pieces (paving slabs, hook rings, drums) use InstancedMesh.
 *   - COLLISION gets invisible proxy meshes with clean planes instead of the chipped art
 *     geometry. Zero draw calls, and a capsule sweep against a battered pylon gets the
 *     correct 6.8°-off-vertical normal instead of a jitter field.
 */

/* Feel/art constants the critic loop is allowed to tune without archaeology. */
const TUNE = {
  batterPylon: 0.105,       // inward lean, metres per metre. Real pylons ~0.05; cartoon wants more.
  batterHall: 0.055,
  courseHeight: 0.66,       // fat courses read as "megalithic" at gameplay distance
  mortarRecess: 0.06,       // geometric joint depth — this is what catches shadow
  chipChance: 0.19,
  fallenBlockChance: 0.05,
  corniceFlare: 1.25,       // the overhang that makes the silhouette Egyptian
  corniceHeight: 2.1,
  rollRadius: 0.44,
  ledgeDepth: 1.6,          // grabbable ledges, way over the 0.6 m minimum
  sandHeight: 1.7,
  rimStrength: 0.52,
};

/** Palette-locked material recipes. Keys are the names requested from TEXTURES. */
const RECIPES = {
  sandstone_block:     { color: 0xc9915a, rough: 0.93, spec: 0.14, gloss: 20, detail: 'sandstone' },
  sandstone_worn:      { color: 0xb8845a, rough: 0.97, spec: 0.08, gloss: 14, detail: 'sandstone' },
  limestone_polished:  { color: 0xe0d0a8, rough: 0.62, spec: 0.32, gloss: 46, detail: 'limestone' },
  granite_pink:        { color: 0xa9705c, rough: 0.48, spec: 0.42, gloss: 62, detail: 'granite' },
  paving_courtyard:    { color: 0xcfa068, rough: 0.95, spec: 0.10, gloss: 16, detail: 'sandstone' },
  hieroglyph_wall:     { color: 0xd6a874, rough: 0.86, spec: 0.16, gloss: 24, detail: 'sandstone' },
  hieroglyph_gilded:   { color: 0xdcae5e, rough: 0.55, spec: 0.55, gloss: 64, detail: 'sandstone' },
  column_papyrus:      { color: 0xd8a468, rough: 0.88, spec: 0.15, gloss: 22, detail: 'sandstone' },
  ceiling_stars:       { color: 0x1f4f96, rough: 0.80, spec: 0.20, gloss: 30, detail: 'plaster', emissive: 0x0a1a3a, emissiveIntensity: 0.18 },
  gold_leaf:           { color: 0xe8b942, rough: 0.22, spec: 0.95, gloss: 110, detail: null, metal: true },
  mudbrick:            { color: 0x9a6a44, rough: 0.99, spec: 0.05, gloss: 10, detail: 'mudbrick' },
  plaster_painted:     { color: 0xe4d3ab, rough: 0.78, spec: 0.18, gloss: 26, detail: 'plaster' },
  /* Not requested from TEXTURES — small utility surfaces. */
  rope_fibre:          { color: 0x8a6a3c, rough: 1.0, spec: 0.06, gloss: 8, detail: null },
  bronze_dark:         { color: 0x6e5a34, rough: 0.42, spec: 0.62, gloss: 72, detail: null, metal: true },
  shadow_stone:        { color: 0x6a4630, rough: 0.95, spec: 0.06, gloss: 12, detail: 'sandstone' },
};

/** Pieces that deserve an inverted-hull ink line; the rest rely on the post-process pass. */
const HULL_OUTLINE = new Set(['gold_leaf', 'granite_pink', 'bronze_dark']);

/**
 * Shadow-caster discipline. At `high` there are three shadow cascades, so every caster is
 * drawn four times, not once — a mesh whose shadow lands nowhere a canonical camera can see
 * costs three draw calls and three times its triangles for nothing. These are the cases where
 * that is provably true:
 *   `far`          — 150 m+ out behind ≥60% haze; their shadows fall off the far side of the
 *                    world and the cascades are fitted around the view.
 *   paving         — 5 cm-relief slabs lying on the ground plane they would shadow.
 *
 * `ceiling_stars` looks like an obvious fourth entry and is not: three of the four painted
 * ceilings do sit directly under a roof slab that already casts, but the tomb's is the only
 * thing between the vault and the sun, and excluding it floods the `interior` shot with
 * daylight. Left casting deliberately.
 * Everything else casts. Cutting a caster that matters is a visible bug, so this list stays
 * short and each entry has to argue for itself.
 *
 * The opt-out is `userData.noShadow`, not `castShadow = false`: main.js sweeps the whole scene
 * after init and turns `castShadow` back on for every opaque mesh, so clearing the flag here
 * on its own is silently undone.
 */
const NO_CAST_ZONE = new Set(['far']);
const NO_CAST_MAT = new Set();

export class Architecture {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group();
    this.root.name = 'architecture';
    this.proxyRoot = new THREE.Group();
    this.proxyRoot.name = 'architecture:colliders';

    this.rng = rng(WORLD_SEED ^ 0x7a11);
    this.TUNE = TUNE;

    this._buckets = new Map();     // "zone|mat" -> BufferGeometry[]
    this._meshes = [];
    this._materials = new Map();
    this._geoms = new Set();
    this._colliders = [];

    /**
     * Public data other agents legitimately need. LIGHTING places shafts through the
     * clerestory rects; MOVEMENT/COLLISION can sanity-check the traversal graph; FX hangs
     * sparkles on the interactables.
     */
    this.api = {
      spawn: new THREE.Vector3(0, 0, 30),
      clerestory: [],   // { center:Vector3, normal:Vector3, w, h } — real holes in the roof
      roofSlots: [],
      doorways: [],
      spires: [],       // Vector3
      hooks: [],        // Vector3
      rails: [],        // { name, curve }
      poles: [],        // { pos:Vector3, top:number }
      route: [],        // annotated spawn -> sarcophagus waypoints
      bounds: new THREE.Box3(new THREE.Vector3(-160, -14, -260), new THREE.Vector3(160, 40, 100)),
    };
  }

  /* ===================== materials ==================================== */

  /**
   * Resolve a named material. Goes through SHADING's toon factory when it exists so the
   * whole scene shares one lighting model, and degrades to MeshStandardMaterial with the
   * same palette colour when it doesn't — the work must always be visible.
   */
  mat(key) {
    if (this._materials.has(key)) return this._materials.get(key);
    const r = RECIPES[key] || RECIPES.sandstone_block;
    const maps = this._maps(key);

    const shading = this.engine.get('shading');
    let m = null;
    if (shading?.toon) {
      try {
        m = shading.toon({
          color: r.color, ...maps,
          bands: 3,
          rim: TUNE.rimStrength * (r.metal ? 1.15 : 1.0),
          rimColor: 0x7fd4ff,
          spec: r.spec, gloss: r.gloss,
          outline: HULL_OUTLINE.has(key) ? 0.85 : 0.0,
          sss: 0.0,
          detail: r.detail ?? null,
          emissive: r.emissive ?? 0x000000,
          emissiveIntensity: r.emissiveIntensity ?? 0,
        });
      } catch (err) {
        this.engine.warn(`architecture: shading.toon("${key}") failed — ${err?.message || err}`);
      }
    }
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: r.color, roughness: r.rough,
        metalness: r.metal ? 0.85 : 0.04,
        emissive: r.emissive ?? 0x000000,
        emissiveIntensity: r.emissiveIntensity ?? 0,
        ...maps,
      });
    }
    m.name = `arch:${key}`;
    this._materials.set(key, m);
    return m;
  }

  /** TEXTURES may hand back a THREE.Texture or a bundle of maps. Accept either, or none. */
  _maps(key) {
    const tex = this.engine.get('textures');
    if (!tex) return {};
    let t = null;
    try { t = tex.get?.(key) ?? tex.material?.(key) ?? tex.bundle?.(key) ?? null; }
    catch (err) { this.engine.warn(`architecture: textures.get("${key}") threw — ${err?.message}`); }
    if (!t) return {};
    if (t.isTexture) return { map: t };
    const out = {};
    for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap', 'metalnessMap']) {
      if (t[k]?.isTexture) out[k] = t[k];
    }
    return out;
  }

  /* ===================== build helpers =============================== */

  /** Queue a world-space geometry into a merge bucket. */
  add(zone, matKey, geo) {
    if (!geo) return;
    K.normaliseAttrs(geo);
    const id = `${zone}|${matKey}`;
    if (!this._buckets.has(id)) this._buckets.set(id, []);
    this._buckets.get(id).push(geo);
  }

  /** A standalone visible mesh (used where a piece needs its own transform or material). */
  mesh(matKey, geo, name = 'arch', { cast = true } = {}) {
    if (!geo) return null;
    K.normaliseAttrs(geo);
    const m = new THREE.Mesh(geo, this.mat(matKey));
    m.name = name;
    m.castShadow = cast; m.receiveShadow = true;
    if (!cast) m.userData.noShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    this.root.add(m);
    this._meshes.push(m); this._geoms.add(geo);
    return m;
  }

  /** InstancedMesh for genuinely repeated pieces. One draw call, per-instance jitter intact. */
  instance(matKey, geo, matrices, name = 'inst', { cast = true } = {}) {
    if (!geo || !matrices.length) return null;
    K.normaliseAttrs(geo);
    const im = new THREE.InstancedMesh(geo, this.mat(matKey), matrices.length);
    for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = true;
    if (!cast) im.userData.noShadow = true;
    im.name = name;
    im.computeBoundingSphere?.();
    this.root.add(im);
    this._meshes.push(im); this._geoms.add(geo);
    return im;
  }

  /** Register a collider and remember it so dispose() can free the proxy geometry. */
  collide(mesh, opts) {
    if (!mesh) return;
    mesh.updateMatrixWorld(true);
    this.engine.registerCollider(mesh, opts);
    this._colliders.push(mesh);
  }

  /**
   * Invisible collision proxy. Added to the scene graph (so matrixWorld is valid) but never
   * drawn. COLLISION must not filter registered meshes on `.visible`.
   */
  proxy(geoOrMesh, opts = {}, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0 } = {}) {
    const m = geoOrMesh.isMesh ? geoOrMesh : new THREE.Mesh(geoOrMesh, this._proxyMat());
    m.visible = false;
    m.userData.collisionProxy = true;
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.name = `proxy:${opts.tag || 'ground'}`;
    this.proxyRoot.add(m);
    m.updateMatrixWorld(true);
    this._geoms.add(m.geometry);
    this.engine.registerCollider(m, opts);
    this._colliders.push(m);
    return m;
  }

  _proxyMat() {
    if (!this._pm) {
      this._pm = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, visible: false });
      this._pm.name = 'arch:proxy';
    }
    return this._pm;
  }

  /* ===================== lifecycle =================================== */

  async init() {
    K.setMergeFn(mergeGeometries);
    this.engine.scene.add(this.root);
    this.engine.scene.add(this.proxyRoot);

    try {
      buildEgyptLevel(this);
    } catch (err) {
      this.engine.warn(`architecture: level build failed — ${err?.message || err}`);
      console.error('[architecture] build failed', err);
    }

    this._flushBuckets();

    // Debug colliders toggle piggybacks on the proxy group — free visualisation for COLLISION.
    this.engine.on('showColliders', (on) => {
      this.proxyRoot.traverse((o) => { if (o.isMesh) o.visible = !!on; });
      if (this._pm) this._pm.visible = true;
    });

    const tris = this._triCount();
    if (tris > 700000) this.engine.warn(`architecture: ${(tris / 1000).toFixed(0)}k triangles — over its share of the 1.2M budget`);
  }

  _flushBuckets() {
    for (const [id, list] of this._buckets) {
      const [zone, matKey] = id.split('|');
      const geo = K.mergeAll(list);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, this.mat(matKey));
      m.name = `arch:${zone}:${matKey}`;
      const cast = !NO_CAST_ZONE.has(zone) && !NO_CAST_MAT.has(matKey);
      m.castShadow = cast; m.receiveShadow = true;
      if (!cast) m.userData.noShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      this.root.add(m);
      this._meshes.push(m); this._geoms.add(geo);
    }
    this._buckets.clear();
  }

  _triCount() {
    let t = 0;
    for (const m of this._meshes) {
      const g = m.geometry;
      const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      t += n * (m.isInstancedMesh ? m.count : 1);
    }
    return t;
  }

  /** Static geometry: nothing to do per frame. Kept for the §4.1 contract. */
  update() {}

  dispose() {
    for (const g of this._geoms) g.dispose?.();
    for (const m of this._materials.values()) m.dispose?.();
    this._pm?.dispose();
    this.root.removeFromParent();
    this.proxyRoot.removeFromParent();
    this._geoms.clear(); this._materials.clear();
    this._meshes.length = 0; this._colliders.length = 0;
  }
}

export { TUNE };
