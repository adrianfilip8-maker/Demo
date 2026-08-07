/**
 * KayKit — the CC0 pack's PROPS, placed in the level.
 *
 * (KayKit Dungeon Asset Pack 1.1, Kay Lousberg, CC0 1.0 — licence and provenance in
 * `public/assets/kaykit/`, retint recipe in `tools/kaykit-retint.mjs`.)
 *
 * **Props only, and that is a decision rather than an omission.** The pack's 58 curated models
 * include walls, pillars, stairs and floor tiles, and none of them are used. Three showcase arms
 * and §206's matched-luminance table settled why: this level's stone swings 136 points of chroma
 * from its darkest band to its brightest, and a flat per-patch atlas swings about 50, so KayKit
 * architecture cannot sit beside hieroglyph walls and papyrus capitals without reading as a
 * different game. What the pack does supply is exactly what `PropKit.js` does not model —
 * barrels, crates, chests, coin hoards — and those are small, scattered, and read as *containers*
 * rather than as architecture, which is where a flat atlas costs least and a Sly Cooper level
 * wants loot.
 *
 * `?kaykit=off`   nothing at all
 * `?kaykit=show`  the showcase row instead of the props, for judging the palette again
 * `?kaykit=showraw` the same row on the pack's own dungeon-grey atlas
 *
 * ONE DRAW CALL. Every prop shares the single 1024² atlas, so all placements are baked into one
 * merged geometry rather than instanced or added as separate meshes. That is the same strategy
 * `Architecture.js` uses for its merge buckets and the reason the whole set costs one draw plus
 * its ink shell, against §1's 250-call budget that ARCHITECTURE has already mostly spent.
 *
 * The models load from `public/` rather than through `src/`: each `.gltf` references its `.bin`
 * and the atlas by RELATIVE uri, and vite hashes anything imported through `src/`, which would
 * break those references. `public/` is copied verbatim, so the paths survive and the build stays
 * self-contained — served from the app's own origin, nothing fetched externally.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BASE = 'assets/kaykit/';

/* Showcase row, kept for re-judging the palette. No x coordinates: it packs itself from measured
   bounding boxes, after a hand-spaced version produced an unreadable pile-up (§205). */
const SHOWCASE = [
  'pillar_decorated', 'column', 'wall_arched', 'stairs', 'torch_mounted',
  'barrel_large_decorated', 'chest_gold',
];
const GAP = 1.0;

/**
 * Placements: [model, x, groundY, z, ry].
 *
 * `groundY` is the FLOOR the prop stands on, not the prop's origin — each model is lifted by its
 * own measured `-bbox.min.y` at build time, so entries need no per-model fudge (`chest` is
 * authored with its base at −0.17, `coin_stack_*` at −0.06, and getting those wrong by hand is
 * precisely the §205 class of error).
 *
 * Placement is not scatter, following `Props.js`: things cluster where someone would have put
 * them. Stores stand against the colonnade where the porters would stop, not out in the
 * processional axis; the hoard is in the tomb around the sarcophagus, because that is the room
 * the whole level descends toward.
 *
 * Floors, from the §8.1 table: courtyard paving y = 0 (x ±26, z −16…34, holes only at the
 * obelisk terrace z 2.2…19.8, the colossi plinths z 21.4…28.6 and the pylon feet z 30.6…34);
 * hypostyle floor y = 0 with nave columns at z −22/−30/−38/−46 and aisle columns at x ±16.5,
 * z −26/−38; tomb paving y = −12 over x ±14, z −78…−59. Every x below is outboard of the aisle
 * columns and inboard of the walls, so nothing lands in a column or on a route.
 */
const PLACEMENTS = [
  /* ---- west colonnade: the store, where the processional way is not ---- */
  ['crates_stacked',          -20.5, 0, -6.0,  0.32],
  ['barrel_large',            -19.2, 0, -3.4,  0.00],
  ['barrel_small',            -21.0, 0, -2.0,  1.10],
  ['barrel_small_stack',      -20.3, 0,  2.6, -0.42],
  ['crates_stacked',          -20.8, 0,  6.5, -0.90],
  ['barrel_large_decorated',  -19.4, 0, 10.2,  0.60],
  ['barrel_small',            -21.2, 0, 12.0,  2.20],

  /* ---- east colonnade: a thinner scatter, so the two sides are not a mirrored pair ---- */
  ['barrel_large',             20.6, 0,  4.0,  0.90],
  ['crates_stacked',           20.2, 0,  8.2, -0.50],
  ['barrel_small_stack',       21.0, 0, 11.4,  1.60],
  ['barrel_small',             19.6, 0, 15.1,  0.25],

  /* ---- hypostyle aisles: outboard of the x ±16.5 columns, against the wall ---- */
  ['barrel_large',            -19.6, 0, -21.5,  0.40],
  ['crates_stacked',          -19.2, 0, -24.8, -0.70],
  ['barrel_small',            -20.4, 0, -27.5,  1.90],
  ['barrel_small_stack',      -19.8, 0, -33.0,  0.20],
  ['barrel_large_decorated',   19.4, 0, -23.0, -1.10],
  ['crates_stacked',           19.8, 0, -29.4,  0.80],
  ['barrel_small',             20.5, 0, -35.2,  2.60],
  ['rubble_half',              19.2, 0, -43.0,  1.40],
  ['rubble_half',             -19.6, 0, -45.5, -0.60],

  /* ---- the tomb: the hoard, around the sarcophagus at (0, −12, −72) ---- */
  ['chest_gold',               -4.2, -12, -70.5,  0.50],
  ['chest',                     4.6, -12, -70.0, -0.40],
  ['coin_stack_large',         -2.4, -12, -68.6,  0.00],
  ['coin_stack_medium',         2.8, -12, -68.2,  1.20],
  ['coin_stack_small',         -5.6, -12, -67.4,  0.60],
  ['coin_stack_small',          5.9, -12, -73.2, -0.90],
  ['chest',                    -6.8, -12, -74.2,  1.90],
  ['coin_stack_medium',         6.4, -12, -67.0,  2.40],
  ['barrel_small',             -8.5, -12, -65.0,  0.70],
  ['crates_stacked',            8.6, -12, -64.4, -1.30],
];

/* Props Sly should bump into rather than walk through. Coins and rubble are deliberately absent:
   a hoard you can wade through reads as treasure, and a knee-high box collider on a rubble pile
   is a worse lie than no collider at all. */
const SOLID = new Set(['barrel_large', 'barrel_large_decorated', 'barrel_small',
  'barrel_small_stack', 'crates_stacked', 'chest', 'chest_gold']);

export class KayKit {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'kaykit';
    this.mode = 'props';
    this.stats = { models: 0, placed: 0, failed: 0, tris: 0, colliders: 0 };
  }

  async init() {
    let flag = '';
    try {
      if (typeof location !== 'undefined' && location.search) {
        flag = (new URLSearchParams(location.search).get('kaykit') || '').toLowerCase();
      }
    } catch { /* no location in a plain-module host — take the shipped path */ }
    if (flag === 'off') return;
    this.mode = flag === 'show' ? 'show' : flag === 'showraw' ? 'showraw' : 'props';

    const atlasFile = this.mode === 'showraw' ? 'dungeon_texture.png' : 'dungeon_texture_sandstone.png';
    const atlas = await new THREE.TextureLoader().loadAsync(BASE + atlasFile);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.flipY = false;                            // glTF convention, unlike OBJ — see SlyModelDL
    atlas.anisotropy = 4;

    const shading = this.engine?.get?.('shading');
    this.material = shading?.make
      ? shading.make({ name: 'kaykit:atlas', color: 0xffffff, map: atlas, bands: 3, rim: 0.5, outline: 0.0034, outlineColor: 0x1a1210 })
      : new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.9 });

    const wanted = this.mode === 'props'
      ? [...new Set(PLACEMENTS.map((p) => p[0]))]
      : SHOWCASE;
    const lib = await this._load(wanted);

    if (this.mode === 'props') this._buildProps(lib);
    else this._buildShowcase(lib);

    this.engine.scene.add(this.group);
    this.engine?.warn?.(`KayKit (${this.mode}): ${this.stats.placed} placed from ${this.stats.models} models, `
      + `${this.stats.failed} failed, ${Math.round(this.stats.tris)} tris, ${this.stats.colliders} colliders`);
  }

  /** Load each model once and reduce it to a single bind-space geometry plus its bounds. */
  async _load(names) {
    const loader = new GLTFLoader();
    const lib = new Map();
    for (const file of names) {
      try {
        const g = await loader.loadAsync(`${BASE}${file}.gltf`);
        g.scene.updateMatrixWorld(true);
        const parts = [];
        g.scene.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          let geo = o.geometry.clone();
          geo.applyMatrix4(o.matrixWorld);
          if (geo.index) geo = geo.toNonIndexed();
          if (!geo.attributes.uv) {
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
          }
          if (!geo.attributes.normal) geo.computeVertexNormals();
          for (const k of Object.keys(geo.attributes)) {
            if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
          }
          parts.push(geo);
        });
        const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
        if (!geo) throw new Error('parts disagree on attributes');
        geo.computeBoundingBox();
        let bb = geo.boundingBox;
        if (!bb || ![bb.min.y, bb.max.y].every(Number.isFinite)) throw new Error('non-finite bounds');

        /* Re-centre on the model's own XZ centre, ONCE, here.
         *
         * These models are not authored around their origin and the amounts are not small:
         * `rubble_half` sits 2.000 m off in x (it is a wall-segment piece, origin at one end)
         * and both chests 0.355 m in z. A placement rotates about the origin, so without this
         * a rotated prop swings that far off the coordinate the table names — and the collider,
         * which is built at the named coordinate, would not follow it.
         *
         * Y is deliberately NOT touched: `bb.min.y` is what sets each prop down on its floor,
         * and it is the one axis where the asset's own authoring is the useful reference. */
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        if (Math.abs(cx) > 1e-4 || Math.abs(cz) > 1e-4) {
          geo.translate(-cx, 0, -cz);
          geo.computeBoundingBox();
          bb = geo.boundingBox;
        }
        lib.set(file, { geo, bb: bb.clone() });
        this.stats.models++;
      } catch (err) {
        this.stats.failed++;
        this.engine?.warn?.(`KayKit: ${file} failed — ${err?.message || err}`);
      }
    }
    return lib;
  }

  _buildProps(lib) {
    const chunks = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [file, x, groundY, z, ry] of PLACEMENTS) {
      const entry = lib.get(file);
      if (!entry) continue;                                   // load already reported it
      const geo = entry.geo.clone();
      /* rotate about the model's own vertical axis, then set down on the named floor */
      m4.compose(new THREE.Vector3(x, groundY - entry.bb.min.y, z),
        q.setFromAxisAngle(up, ry), new THREE.Vector3(1, 1, 1));
      geo.applyMatrix4(m4);
      chunks.push(geo);
      this.stats.tris += geo.attributes.position.count / 3;
      this.stats.placed++;
      if (SOLID.has(file)) this._collider(entry, x, groundY, z, ry);
    }
    if (!chunks.length) return;
    const merged = mergeGeometries(chunks, false);
    if (!merged) { this.engine?.warn?.('KayKit: prop merge failed'); return; }
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.name = 'kaykit:props';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.engine?.get?.('shading')?.outline?.(mesh, { thickness: 1.0 });
  }

  /** An invisible box the size of the model's own bounds — no hand-typed extents. */
  _collider(entry, x, groundY, z, ry) {
    if (!this.engine?.registerCollider) return;
    const s = new THREE.Vector3();
    entry.bb.getSize(s);
    const g = new THREE.BoxGeometry(s.x, s.y, s.z);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, groundY + s.y / 2, z);
    m.rotation.y = ry;
    m.visible = false;
    m.name = 'kaykit:solid';
    this.group.add(m);
    /* `misc`, not `obstacle` — which is not a tag. Collision.js knows ground/wall/ledge/rail/
       pole/hook/spire/vent/water/hazard/misc, and an unknown one is treated as GROUND, so the
       first run silently turned every barrel into a piece of floor. `misc` is in SOLID_TAGS so
       it blocks, without `wall`'s wall-run semantics (Controller.js:583), `ledge`'s grabbability
       or `pole`'s climbability — none of which a crate should offer. */
    this.engine.registerCollider(m, { tag: 'misc', material: 'wood' });
    this.stats.colliders++;
  }

  /** The palette showcase — packed from measured widths, on the courtyard paving (§205). */
  _buildShowcase(lib) {
    const items = SHOWCASE.map((f) => ({ f, e: lib.get(f) })).filter((it) => it.e);
    const total = items.reduce((s, it) => s + (it.e.bb.max.x - it.e.bb.min.x), 0) + GAP * Math.max(0, items.length - 1);
    let cursor = -total / 2;
    const chunks = [];
    for (const { e } of items) {
      const w = e.bb.max.x - e.bb.min.x;
      const geo = e.geo.clone();
      geo.translate(cursor - e.bb.min.x, -e.bb.min.y, -6.0);
      chunks.push(geo);
      this.stats.tris += geo.attributes.position.count / 3;
      this.stats.placed++;
      cursor += w + GAP;
    }
    const merged = chunks.length ? mergeGeometries(chunks, false) : null;
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.name = 'kaykit:showcase';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.rowWidth = total;
    this.engine?.get?.('shading')?.outline?.(mesh, { thickness: 1.0 });
  }

  update() { /* static */ }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.material?.map?.dispose?.();
    this.material?.dispose?.();
    this.group.parent?.remove(this.group);
  }
}
