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
 * `Architecture.js` uses for its merge buckets, against §1's 250-call budget that ARCHITECTURE
 * has already mostly spent.
 *
 * This used to end "…the reason the whole set costs one draw plus its ink shell". There is no ink
 * shell. Measured on the booted module (`tests/kaykit.test.mjs`): the group holds TWO visible
 * meshes — `kaykit:props` and the `world.decals.kaykit` contact batch — plus 29 invisible collider
 * boxes, and `stats.hulls` is 0 because `_maybeHull` is off by default (its own docblock, below,
 * says so and says why). The second draw is the contact decals, which `init()` already calls out.
 *
 * The models load from `public/` rather than through `src/`: each `.gltf` references its `.bin`
 * and the atlas by RELATIVE uri, and vite hashes anything imported through `src/`, which would
 * break those references. `public/` is copied verbatim, so the paths survive and the build stays
 * self-contained — served from the app's own origin, nothing fetched externally.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ContactDecals, baseRadiusOf } from './Decals.js';

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
 * z −26/−38; tomb paving y = −12 over x ±14, z −78…−59.
 *
 * This used to end "Every x below is outboard of the aisle columns and inboard of the walls, so
 * nothing lands in a column or on a route." The conclusion is true and the premise is not.
 * Measured over the shipped table (`tests/kaykit.test.mjs`): **16 of the 36 placements have
 * |x| ≤ 16.5** — the ten tomb entries, which are in a different room where the aisle grid does not
 * apply, and the six camera entries at the bottom, which are deliberately inboard and say so.
 * What survives is the part worth keeping: nothing lands in a column. The closest any placement
 * comes to a column CENTRE is 4.27 m (`barrel_large` at (−6.5, −34), against the nave column at
 * (−8, −30)), which clears the 1.4 m footprint bar the camera block below grid-searched against.
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

  /* ---- and six placed FOR THE CAMERAS, because the thirty above were placed for the player ----
   *
   * The first capture of this set showed the tomb hoard reading beautifully and the courtyard and
   * hall showing nothing at all. `tools/shotsee.mjs` says why: of the thirty above, `interior` is
   * far and away the nearest shot, at 8.09 m. `temple` has ONE in its cone, at 35.2 m, because it
   * looks down the nave while the stores are against the aisle walls; `courtyard` has all thirty
   * in its cone, behind the colossi.
   *
   * ── three numbers in this banner were wrong. They are corrected above, and recorded here ────
   * Measured by `tests/kaykit.test.mjs`, the first instrument that has ever booted this module —
   * KNOWN_ISSUES §393.2 recorded that none could, and that turned out to be untrue.
   *
   *   "eight placed FOR THE CAMERAS"    the block below holds SIX. Six shipped; two were dropped,
   *                                     and they are the two named further down. The count was
   *                                     never brought back down after they went.
   *   "all thirty ... at 35-51 m"       all thirty ARE in courtyard's cone — that half is exact —
   *                                     but at 34.6–116.8 m. 35–51 m is the range of the ELEVEN
   *                                     colonnade props alone (34.6–50.9 m); the hypostyle stores
   *                                     reach 88.7 m and the tomb hoard 107.5–116.8 m. One
   *                                     sentence, and its count and its range described different
   *                                     sets.
   *   "`interior` is the only shot      `sly-key`'s nearest is 24.99 m. That is 13 mm inside the
   *    with a prop inside 25 m"         bar, i.e. a rounding coin-flip rather than a finding, so
   *                                     the sentence now states the gap it exists to convey:
   *                                     interior at 8.09 m, then 16 m of nothing.
   *
   * Both aims are legitimate — a follow camera passes within a couple of metres of the colonnade
   * stores — but only one of them had been considered. `Props.js` already settled the precedent in
   * its header: a handful of its props are positioned by eye for the canonical cameras specifically.
   *
   * These eight are NOT positioned by eye. Each was grid-searched against three tests at once: on
   * real paving, clear of every column and plinth footprint by 1.4 m, and inside its target shot's
   * frame at 6-26 m. All three matter — five positions chosen by eye first sat inside the obelisk
   * terrace or a colossus plinth, and two more inside nave columns (x +/-8, not the +/-11.4 I had
   * assumed). Distances below are to the shot named. */
  ['crates_stacked',            5.5, 0, -34.0,  0.30],   // temple    15.2 m
  ['barrel_large',             -6.5, 0, -34.0, -0.60],   // temple    18.1 m
  ['barrel_small_stack',      -12.5, 0, -33.5,  1.10],   // temple    21.7 m
  ['crates_stacked',           -5.5, 0,  30.5, -0.40],   // courtyard 11.8 m, sly-profile edge — see below
  /* THE COURTYARD GETS EXACTLY ONE NEAR PROP, and the reason is structural rather than taste.
   *
   * All six `sly-*` cameras sit 8.7-13.5 m from the courtyard camera and all aim at spawn, so
   * `courtyard`'s near field IS the character close-ups' field. A grid search over the whole
   * courtyard found ZERO cells that read at 8-20 m in `courtyard` while staying 14 m clear of
   * every character shot — not a near miss, an empty set.
   *
   * Two candidates were dropped on that finding rather than shipped:
   *   (4, 26.5)   16.7 m in `courtyard`, but 6.9 m in `sly-key` and 8.2-8.8 m in
   *               `sly-startle`/`sly-closeup`/`sly-perch`.
   *   (6.5, 32)   13.5 m in `courtyard`, but 8.9 degrees off-axis at 10.3 m in `sly-arm` — a 2.5 m
   *               barrel directly behind Sly, subtending ~37 % of frame height, in the shot whose
   *               job is reading the cane arc. Every east-side alternative tested lands in
   *               `sly-arm` at 7-10 m too.
   *
   * The crates above are the one position that reads near in `courtyard` while staying out of the
   * close-up frames both dropped candidates fell into. The resulting east/west asymmetry is not a
   * defect — mirrored pairs are a complaint this level has already had.
   *
   * NOT "appears in no character frustum at all", which is what this used to say. Measured at 16:9
   * on the placement's own eight box corners (`tests/kaykit.test.mjs`): the crate IS in
   * `sly-profile`, at 8.17 m, with four of eight corners inside NDC, occupying the leftmost 9.0 %
   * of frame width and 60.5 % of frame height, and unoccluded by any registered Architecture or
   * Props collider. What actually distinguishes it from the two rejects is WHERE in frame: it is
   * 36.3° off-axis, hard against the left edge, rather than behind Sly. So the decision stands and
   * the reason given for it did not — which is the §393.1 shape a third time, in this same file.
   *
   * The general lesson, which cost two candidates: "in frame" and "in frame at 7 m" are different
   * findings, and I checked the first while quoting the distance from a different shot. */
  ['crates_stacked',          -11.5, 0,   9.5,  0.50],   // hero      23.8 m
  ['barrel_large',            -11.5, 0,   2.5, -1.20],   // night     21.0 m
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
    this.stats = { models: 0, placed: 0, failed: 0, tris: 0, colliders: 0, decals: 0 };
    /* Geometric ground contact. A screen-space contact term cannot reach these: `courtyard` holds
       all THIRTY-SIX of them in its cone, 35 of the 36 at 33.4–116.8 m, and at that near end
       4.5 cm of world subtends 1.11 px (fov 55 over 900 px is 24.7 px/m at 35 m — that arithmetic
       re-derives exactly). The count used to read "thirty" and the range "35–51 m": the count
       predates the six camera placements below, and the range only ever described the eleven
       colonnade props. The one placement that IS near — the courtyard crate at 11.8 m — is the
       exception the camera block was added to create, and it does not weaken the argument, since
       a term that cannot reach 35 m is not saved by one prop at 12 m.
       See `Decals.js` for the measured defect and for why the shape is a hard-edged ellipse. */
    this.decals = new ContactDecals(engine, { name: 'kaykit' });
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

    /* One extra draw for every prop's ground contact, parented to this module's own group so
       it disposes with it. Built after the props so the batch knows its final count. */
    this.decals.build(this.group);

    this.engine.scene.add(this.group);
    this.engine?.warn?.(`KayKit (${this.mode}): ${this.stats.placed} placed from ${this.stats.models} models, `
      + `${this.stats.failed} failed, ${Math.round(this.stats.tris)} tris, ${this.stats.colliders} colliders, `
      + `${this.stats.decals} contact decals, ${this.stats.hulls || 0} hulls`);
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
         * These models are not authored around their origin, and for one of them the amount is
         * large: `rubble_half` sits 2.000 m off in x (it is a wall-segment piece, origin at one
         * end). A placement rotates about the origin, so without this a rotated prop swings that
         * far off the coordinate the table names — and the collider, which is built at the named
         * coordinate, would not follow it.
         *
         * This used to add "and both chests 0.355 m in z", and that number does not describe
         * anything this code ever sees. Measured: **both chests are 0.0229 m off in z.** 0.355 m
         * is what you get by unioning the raw accessor bounds WITHOUT applying the node transform
         * — `chest_lid` carries `translation: [0, 0.5, −0.5648832]`, the raw union spans
         * z −0.6000…1.3107, centre 0.3554 — and the `applyMatrix4(o.matrixWorld)` a dozen lines
         * above has already folded that translation in before any of this runs. So `rubble_half`
         * is the entire case for this block and the chests are a rounding error. The lesson is
         * narrower than "the number was stale": it was measured on geometry the loader does not
         * produce, which is a class of error a comment cannot show and a harness can.
         *
         * Y is deliberately NOT touched: `bb.min.y` is what sets each prop down on its floor,
         * and it is the one axis where the asset's own authoring is the useful reference. */
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        if (Math.abs(cx) > 1e-4 || Math.abs(cz) > 1e-4) {
          geo.translate(-cx, 0, -cz);
          geo.computeBoundingBox();
          bb = geo.boundingBox;
        }
        /* Base footprint radius, measured on the model's own lowest 25 cm rather than taken
           from `bb`. The two disagree by enough to matter: `barrel_large` is 0.635 m at the
           floor and 0.932 m at its belly, and `crates_stacked` reaches 1.427 m only at a
           corner. A decal sized off the bounding box would be up to 47 % too wide under every
           barrel in the level, which reads as a puddle rather than a contact. */
        lib.set(file, { geo, bb: bb.clone(), rBase: baseRadiusOf(geo) });
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
      /* Every placement, not just the SOLID ones. A coin hoard you can wade through still has
         to sit ON the floor — the collider set is a gameplay decision and grounding is not.
         Height comes from the model's own bounds and sets the decal's downwind reach, so a
         2.5 m barrel and a 0.5 m coin stack do not get the same shadow at a 26° sun. */
      if (this.decals.add(x, groundY, z, entry.rBase, entry.bb.max.y - entry.bb.min.y)) this.stats.decals++;
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
    this._maybeHull(mesh);
  }

  /**
   * Hull presence, decided by ROLE.
   *
   * **These props no longer carry an inverted-hull shell, and the ink they lose is not ink they
   * were entitled to.** `Outline.js` made width uniform (`INK_PX = 2.5`, `thickness` accepted
   * and ignored), which turned every remaining `outline()` call site into a pure PRESENCE
   * decision — and this one was never made on purpose. It was inherited from whichever module
   * built the mesh.
   *
   * What the rule says. AGENTS §2.1.2 gives the inverted hull to "characters and hero props"
   * and gives "interior creases and architectural edges" to the post-process detector. This
   * file's own header calls its contents set dress in as many words — "small, scattered, and
   * read as *containers* rather than as architecture" — and the placement table has half of
   * them shoved against a colonnade wall where the porters would stop. A crate is not a hero
   * prop under any reading.
   *
   * What was actually on screen. The state this replaces is: KayKit set dress carried a hull
   * while the shipped protagonist carried none at all (`SlyModelDLRig.js` never calls
   * `Shading.outline()` — `Outline.js`'s own header lists it, with Architecture and Vegetation,
   * as the larger half of the "ink varies 20x" defect). Measured here on `interior.g00.png` by
   * profiling median luminance in 1 px rings outward from each prop's rasterised silhouette,
   * the ink band is 3 px deep at `temple`'s 15–22 m (L 40.6 / 42.5 / 55.7 against a settled
   * surround of 66.2) and still resolvable at `courtyard`'s 35–51 m. So the reading that
   * decided this is not an argument from the rulebook: a barrel out-inked the protagonist in
   * shipped frames, and it did so because of which loader built it.
   *
   * The scored precedent is in the sibling file. `Props.js` ran exactly this experiment —
   * hulls on set dress — under `PREREG-propshull.md`, and it came back REJECT on two of its
   * three named look conditions: "sticker edge" and "doubles visibly against the PostFX line".
   * `HULL_KEYS` there is now `{gold}` alone, i.e. hero sculpture only. The doubling has a
   * mechanism, not just a look: POSTFX's crease pass and a hull draw the same silhouette twice,
   * which is what turns a 2.5 px line into a fat smear (`PostFX.js`, the normal-prepass note).
   * Applying the same finding to the same class of object in the neighbouring file is the
   * cheapest correct move available.
   *
   * These props keep an ink line. It is the post-process crease line, which is the line §2.1.2
   * assigns to them and the line everything else in the level that is not a character or a
   * hero prop is already using.
   *
   * **Defeatable, so the claim can be tested rather than believed.** `?kaykithull=1`, or
   * `engine.debug.kaykitHull = true` before `init()`, restores the shell exactly as it shipped.
   * It is read here rather than toggled per frame on purpose: a hidden shell would still weld a
   * `slyNormal` stream onto the geometry and would count as `inked` in `Outline.inkAudit()`
   * while drawing nothing, and an audit that reports ink nobody can see is the failure this
   * whole change is about.
   */
  _maybeHull(mesh) {
    if (!this._hullWanted()) return null;
    const shell = this.engine?.get?.('shading')?.outline?.(mesh, { thickness: 1.0 });
    if (shell) this.stats.hulls = (this.stats.hulls || 0) + 1;
    return shell;
  }

  _hullWanted() {
    if (this.engine?.debug?.kaykitHull) return true;
    try {
      if (typeof location !== 'undefined' && location.search) {
        const v = (new URLSearchParams(location.search).get('kaykithull') || '').toLowerCase();
        return v === '1' || v === 'on' || v === 'true';
      }
    } catch { /* no location in a plain-module host */ }
    return false;
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
       first run silently turned every barrel into a piece of floor. `misc` is in SOLID_TAGS, so
       it blocks. That much is true and it is the reason for the tag.

       WHAT THIS COMMENT USED TO CLAIM, AND WHAT IS ACTUALLY TRUE. It said `misc` blocks "without
       `wall`'s wall-run semantics, `ledge`'s grabbability or `pole`'s climbability — none of
       which a crate should offer". Two thirds of that is false, and it was cited to a line
       (`Controller.js:583`) that is an unrelated field initialiser. Measured on a real
       `Controller` against a real `Collision`, one synthetic box per tag:

         wall / misc / ledge   wallRun 38 frames, wallCling 83, apex 2.90 — IDENTICAL
         wall / misc / ledge   ledgeClimb 18 frames                       — IDENTICAL

       `Controller.probeWall` and `probeLedge` are **tag-agnostic**: they gate on surface normals
       (`|n.y|` against `TUNE.wallNormalMax`, plus a special case that ignores flat `ground`),
       never on the rec's tag. So a KayKit crate IS wall-runnable and IS ledge-grabbable, exactly
       like a temple wall. Only the third claim holds: `PoleClimb.canEnter` goes through
       `afford('pole')`, which IS tag-filtered, so a crate offers no shaft to climb.

       Nothing is changed here on the strength of that. The tag is still right — `misc` is what
       stops a barrel being FLOOR, which was the actual bug — and whether a 1 m crate should be
       wall-runnable is a MOVEMENT question about normal-gated affordances, not a WORLD question
       about tags. It is recorded so the next person does not re-derive a guarantee that the
       collision layer never offered. */
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
    /* Same call as the props path, and the showcase has the weaker claim of the two: half its
       row (`column`, `wall_arched`, `stairs`, `pillar_decorated`) is architecture, which §2.1.2
       hands to the crease detector explicitly. It is a diagnostic view for judging the atlas
       palette (`?kaykit=show`) and it should judge that palette under the same ink the shipped
       frames use, or it is judging something the game does not render. */
    this._maybeHull(mesh);
  }

  update() { this.decals?.update(); }

  /** What the contact decals actually applied this frame — see `ContactDecals.state()`. */
  decalState() { return this.decals?.state?.() ?? null; }

  dispose() {
    this.decals?.dispose();
    this.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.material?.map?.dispose?.();
    this.material?.dispose?.();
    this.group.parent?.remove(this.group);
  }
}
