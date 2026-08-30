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

/**
 * §729 revert token: `?smash=gen` (or `globalThis.__SMASH_AB = 'gen'` from a test) restores the
 * PROCEDURAL destructible bodies — PropKit's canopic jar, woven basket and chunk-built crate —
 * at every placement the KayKit swap covers: Smashables' route clusters AND the static twins in
 * `Props.js` (the vault's offering-table jars, the courtyard wall baskets). Same seam as
 * `?pile=` / `?props=`: read at module load, independent of every other lane's token, and
 * independent of `?kaykit=` — that flag governs the pack's own set-dress scatter, this one
 * governs whose BODY the destructibles wear. It lives here rather than in Smashables.js because
 * Props.js also reads it and Smashables already imports from Props — the other direction would
 * be a cycle.
 */
export const SMASH_GEN = (() => {
  let raw = '';
  try {
    if (typeof location !== 'undefined' && location.search) raw = new URLSearchParams(location.search).get('smash') || '';
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__SMASH_AB != null) raw = String(globalThis.__SMASH_AB);
  } catch { /* plain-module hosts have no location; that is the test path */ }
  return String(raw).trim().toLowerCase() === 'gen';
})();

/**
 * §730 revert token: `?vault=barrels` (or `globalThis.__VAULT_AB = 'barrels'` from a test) puts
 * the TREASURE ROOM back on §729's imported bodies — i.e. it reverts §730 and nothing else.
 *
 * The owner: *"The urns in the treasure room can be put back"*, then *"By urns, I mean canopic
 * jars"*. So this is a PER-LOCATION policy, not a second global swap flag: inside
 * `EgyptLevel.CRYPT`, a destructible whose kind is `jar` and the four offering-table statics
 * build the procedural `canopicJar` again; every other spot in the level, and the vault's own
 * crate, keep the KayKit body §729 gave them. Everything outside the treasure room was accepted
 * by silence and is not this token's business.
 *
 * Sits beside `SMASH_GEN` rather than in Smashables.js for the identical reason: Props.js reads
 * it too (the offering table is a Props static) and Smashables already imports from Props, so
 * the other direction would be a cycle. Independent of every other lane's token, read once at
 * module load. The two flags COMPOSE, and only one order is meaningful — `?smash=gen` already
 * generates everything everywhere, so the urn policy is a no-op under it and says so at the
 * one branch that could disagree (`Smashables.init`).
 */
export const VAULT_BARRELS = (() => {
  let raw = '';
  try {
    if (typeof location !== 'undefined' && location.search) raw = new URLSearchParams(location.search).get('vault') || '';
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__VAULT_AB != null) raw = String(globalThis.__VAULT_AB);
  } catch { /* plain-module hosts have no location; that is the test path */ }
  return String(raw).trim().toLowerCase() === 'barrels';
})();

/** §730: are the treasure room's canopic jars generated on this boot? False under either
 *  token — `?smash=gen` because everything is already generated, `?vault=barrels` because the
 *  owner asked for a way back. The ONE expression both files branch on. */
export const VAULT_URNS = !SMASH_GEN && !VAULT_BARRELS;

/**
 * §734 revert token: `?torch=gen` (or `globalThis.__TORCH_AB = 'gen'` from a test) puts the
 * WALL SCONCES back on `PropKit.wallTorch()` — the generated bracket-and-cup — at both of
 * `Props._torch`'s call sites (the six crypt pier torches and the ten hypostyle hall torches).
 *
 * It is a THIRD independent flag rather than a widening of `?smash=`, because the two answer
 * different questions: `?smash=gen` is about which body a SMASHABLE wears, and a wall torch is
 * not smashable and never was. Composing them is meaningful and untangled — `?smash=gen
 * &torch=gen` generates both families, either alone generates one — so neither flag has to
 * know the other exists.
 *
 * Lives here beside the other two for the identical reason (`Props.js` reads it, and
 * `Smashables` imports from `Props`, so the other direction would be a cycle), and is read once
 * at module load so no per-frame branch can disagree with a per-boot one.
 */
export const TORCH_GEN = (() => {
  let raw = '';
  try {
    if (typeof location !== 'undefined' && location.search) raw = new URLSearchParams(location.search).get('torch') || '';
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__TORCH_AB != null) raw = String(globalThis.__TORCH_AB);
  } catch { /* plain-module hosts have no location; that is the test path */ }
  return String(raw).trim().toLowerCase() === 'gen';
})();

/**
 * Is there a transport that will actually SETTLE for this url? In the browser, always. In plain
 * Node, only a primed `THREE.Cache` (tests/_kaykitboot.mjs seeds it) — `CarmelitaGuard.js:330`
 * records the third case: a `fetch` of a relative URL in Node does not reject, it never settles,
 * and an `await` on it hangs the suite. So a headless host with no cache entry is answered NO
 * up front rather than discovered by a hang. §418.3: the failing input is RUN —
 * `tests/smashswap.test.mjs` boots the swap in an unprimed child and asserts the fallback.
 */
function transportReady(url) {
  if (typeof document !== 'undefined') return true;
  try { return !!(THREE.Cache.enabled && THREE.Cache.get(`file:${url}`)); } catch { return false; }
}

/**
 * Load KayKit models and reduce each to ONE bind-space geometry plus its measured bounds — the
 * §729 export of what `KayKit._load` has always done, so the destructibles swap (Smashables.js,
 * Props.js) adopts the pack through the ONE path that already ships instead of growing a second
 * loader (§707 reads clearance off this same reduction; §702/§705: the bounds are measured here,
 * never assumed at a call site).
 *
 * Returns `Map(file -> { geo, bb, rBase })`. A file that cannot load (bad data, or no transport
 * that settles — see `transportReady`) is reported through `onFail(file, err)` and skipped; the
 * caller decides whether a hole is fatal. Smashables and Props both fall back to the generated
 * body per missing model, so a 404 costs the swap, never the level.
 */
export async function loadModelLib(names, onFail = () => {}) {
  const loader = new GLTFLoader();
  const lib = new Map();
  for (const file of names) {
    try {
      if (!transportReady(`${BASE}${file}.gltf`)) throw new Error('no transport that settles (headless, cache not primed)');
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
    } catch (err) {
      onFail(file, err);
    }
  }
  return lib;
}

/**
 * §734 — where the fire sits on an imported sconce, measured on its own vertices.
 *
 * The problem this solves: FX anchors a flame at a POINT, and for the generated wall torch that
 * point was published by the builder that shaped the cup (`PropKit.wallTorch`'s `bag.flameAt`).
 * An imported body publishes nothing, so an anchor for it is either measured or invented, and an
 * invented one hangs the flame in the air beside the torch — the failure `Particles.js:4444`
 * already documents from the other direction.
 *
 * The measurement: a torch bowl is the widest thing on the sconce ACROSS the arm, because the
 * arm is a shaft and the bowl is a mouth. So take the vertices at maximum |x| (for a sconce
 * whose arm reaches along +z, x is the across-arm axis) and return their centroid. On a tilted
 * bowl the two extreme-x vertices land on opposite lips, so the centroid is the mouth centre in
 * all three axes rather than just in x.
 *
 * Returns null on a geometry with no position attribute or a degenerate girth, so a caller can
 * fall back rather than place a flame at a NaN.
 *
 * §418.3 DOMAIN — both inputs RUN, in `tests/torchswap.test.mjs` T3:
 *   PASSES (lands on the cup): `torch_mounted`'s own geometry — the ring is exactly the 4
 *     vertices at |x| = 0.2751, centroid (0, 0.6078, 0.3478), which is inside the bowl's own
 *     bounding box on every axis.
 *   FAILS (lands off the cup): the same geometry with the bowl deleted (every vertex above the
 *     arm's waist dropped). The girth ring then falls back onto the BRACKET, the centroid comes
 *     out at the wall end, and T3 asserts the two answers differ by more than the bowl's own
 *     radius — i.e. the estimator is shown to move when the cup moves, which is the property a
 *     centroid taken over a fixed band would NOT have had.
 */
export function cupCentre(geo) {
  const pos = geo?.attributes?.position;
  if (!pos || !pos.count) return null;
  let mx = 0;
  for (let i = 0; i < pos.count; i++) mx = Math.max(mx, Math.abs(pos.getX(i)));
  if (!(mx > 0)) return null;
  /* The tolerance is bounded from BOTH sides by measurement rather than chosen. Below: the
     ring's own coordinates are ±0.2751, where float32 spacing is ~1.6e-8, so 1e-4 is four
     orders of magnitude clear of representation error. Above: on `torch_mounted` the next
     widest ring in is 0.2211, a gap of 0.054 — 540x this tolerance — so nothing but the rim
     can be swept in. A model whose rings were closer together than this would need it derived
     rather than fixed, and would show up as a cup centre that failed the containment bar in
     torchswap T3. */
  const eps = 1e-4;
  let n = 0, sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(Math.abs(pos.getX(i)) - mx) > eps) continue;
    n++; sx += pos.getX(i); sy += pos.getY(i); sz += pos.getZ(i);
  }
  if (!n) return null;
  return new THREE.Vector3(sx / n, sy / n, sz / n);
}

/**
 * The pack's atlas, with the three settings every consumer needs and none of them can skip
 * (`flipY = false` is the glTF convention — see SlyModelDL). Headless with no primed image
 * cache returns null instead of hanging (same reasoning as `transportReady`); a null atlas
 * still yields a working material below, just an untextured one.
 */
export async function loadAtlasTexture(file = 'dungeon_texture_sandstone.png') {
  if (typeof document === 'undefined') {
    try { if (!(THREE.Cache.enabled && THREE.Cache.get(`image:${BASE}${file}`))) return null; } catch { return null; }
  }
  const atlas = await new THREE.TextureLoader().loadAsync(BASE + file);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.flipY = false;                            // glTF convention, unlike OBJ — see SlyModelDL
  atlas.anisotropy = 4;
  return atlas;
}

/**
 * §736 revert token: `?kk=flat` (or `globalThis.__KK_AB = 'flat'` from a test) puts the imported
 * set back on the UNGRADED albedo it wore before §736 — `color: 0xffffff` through the atlas,
 * which is the state the owner has called faded four times. The name is the measurement's own
 * word for it, not a judgement: the props' albedo was the flattest in the level.
 *
 * A FOURTH independent flag, beside `?smash=`, `?vault=` and `?torch=`, and independent for the
 * same reason they are of each other: those three choose whose BODY a prop wears, this one
 * chooses how the atlas is GRADED, and every combination is meaningful. It reaches all three
 * consumers at once because they all build through `makeAtlasMaterial` — which is exactly what
 * §729's header promises ("the imported set cannot drift into two grades") and what this token
 * must not be allowed to break. Read once at module load, like the others.
 */
/**
 * §738 EXTENDS this token rather than adding a parallel switch: `?kk=` now reads a COMMA LIST, so
 * `?kk=flat` still means exactly what §736 shipped, `?kk=nohold` reverts §738's shade hold alone,
 * and `?kk=flat,nohold` reverts both — one key for one surface's look, which is what a second
 * `?kkhold=` would have broken. Whitespace and case are tolerated; an unknown word is ignored
 * rather than throwing, because a token in a URL is a debugging affordance and a typo in one
 * should not take the level down.
 */
const KK_TOKENS = (() => {
  let raw = '';
  try {
    if (typeof location !== 'undefined' && location.search) raw = new URLSearchParams(location.search).get('kk') || '';
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__KK_AB != null) raw = String(globalThis.__KK_AB);
  } catch { /* plain-module hosts have no location; that is the test path */ }
  return new Set(String(raw).toLowerCase().split(',').map((t) => t.trim()).filter(Boolean));
})();

export const KK_FLAT = KK_TOKENS.has('flat');

/** §738's revert: the imported set stops holding its own hue in shade. */
export const KK_NOHOLD = KK_TOKENS.has('nohold');

/**
 * §738 — how hard the imported set holds its OWN albedo hue on its shade side.
 *
 * WHAT THIS FIXES, and what it does not. §737 measured every term the previous three rounds
 * blamed and acquitted all of them: the surface fresnel rim is worth 0.000 on these bodies, the
 * screen-space silhouette rim 0.000, bloom −0.002. What it DID find, judging per body rather than
 * pooled, is that **16 of 20 placed bodies sit below the architecture's median saturation**, that
 * the deficit is 0.103 by day and 0.105 at night, and that it lives on the SHADE side — present in
 * every brightness decile the props occupy, so not a brightness artefact.
 *
 * The mechanism is §269's, already written down in `ToonMaterial.js`: the shade light is saturated
 * enough (linear G/R 3.258) that on an albedo whose own G/R sits near the 0.307 break-even, the
 * multiply INVERTS the channel order and the surface takes the light's hue instead of its own. The
 * architecture survives it because its compounded albedo is sat 0.82–0.87; the atlas is 0.560
 * before §736's grade, which is nearer the break-even, so the same light costs it more.
 *
 * `TUNE.shadowHold` is §269's remedy and it ships at 0 for the world and 1 for the character
 * (`subjShadowHold`). It could not be turned on globally here: measured, that lifts the
 * ARCHITECTURE by +0.286 against the props' +0.267 — it moves the reference further than the
 * subject. Hence the per-material scope, and hence a value BELOW 1: at full strength the hold is
 * worth +0.267 against a 0.103 target, which would overshoot the dull bodies past the masonry and
 * push the four bodies that were already at parity well beyond it.
 *
 * THE VALUE IS SWEPT, NOT CHOSEN — seven strengths in one boot on one mask, scored per body at
 * both grades (§738.2). What the sweep says, on the crypt's 20 placed bodies against the
 * architecture's median surface saturation (0.371 by day, 0.709 at night):
 *
 *     hold      DAY dull median   still below   fine median      NIGHT dull median
 *     0.00        0.267  (−0.104)     16/16      0.462  (+0.090)   0.632  (−0.078)
 *     0.15        0.316  (−0.055)     12/16      0.487  (+0.116)   0.647  (−0.063)
 *     0.25        0.348  (−0.023)     10/16      0.506  (+0.135)   0.653  (−0.057)
 *     0.35        0.379  (+0.008)      7/16      0.526  (+0.155)   0.659  (−0.051)
 *     0.50        0.425  (+0.054)      2/16      0.563  (+0.192)   0.669  (−0.040)
 *     1.00        0.569  (+0.197)      0/16      0.652  (+0.281)   0.731  (+0.022)
 *
 * WHY 0.25 AND NOT THE 0.35 THAT LANDS THE DAY MEDIAN EXACTLY ON THE BAR. Because the lever
 * CANNOT SEPARATE THE TWO SUBSETS — one material serves all 20 bodies, so every strength that
 * lifts the 16 that were short also pushes the 4 that were already above the masonry further
 * above it, and those 4 start at +0.090 with the architecture's own brightest surface at 0.400.
 * Past 0.25 the trade turns: 0.25 → 0.35 buys +0.031 of day dull median and **+0.006 of NIGHT
 * dull median**, for +0.020 on the already-over subset and +0.036 more on the sconces (below).
 * The night half of the owner's complaint is barely reachable from this lever at any safe
 * strength, which §738.3 states rather than hides.
 *
 * THE ONE SURFACE THAT MOVES AGAINST THE METRIC, named because §734's look is owner-approved.
 * The six crypt wall sconces (`props_kaykit#0…#11`, measured at x ±4.16, y −9.1, z −62/−68/−74)
 * are the body §736.7 recorded reading TEAL — hue 166°/212° in a room whose paving reads 9°/1°.
 * The hold rotates them off the shade light's hue and onto their own, and the path crosses
 * neutral: day hue 186° → 170° at 0.25 → 30° at 0.50 → 21° at 0.70, with saturation dipping
 * 0.239 → 0.106 → 0.111 → 0.246 on the way. So their SATURATION falls at this strength while
 * their HUE moves toward the room's palette. That is a real change to an approved fixture and it
 * is reported as one; it is not certified as an improvement by this lane.
 *
 * Revert with `?kk=nohold`.
 */
export const KK_HOLD = 0.25;

/**
 * §736 — the world's grade, which the imported props were the only surfaces in the level not
 * to have. DERIVED, not chosen; `tests/kksurface.test.mjs` re-derives it from the shipped bytes
 * and refuses the literal if either input has moved.
 *
 * WHAT WAS MEASURED. Every `Architecture` recipe is `texture × color` and the two COMPOUND, so
 * the architecture's albedo is not its recipe hex — measured in-page over the live materials
 * (`tools/kkwhy.mjs`), `sandstone_block` is **L 74.0 / sat 0.865** and `paving_courtyard` is
 * **L 86.8 / 0.822**. This atlas went through `color: 0xffffff`, so the props' albedo was the
 * texture itself: world-area weighted over every body the level actually places
 * (`tools/kkalbedo.mjs`), **L 120.3 / sat 0.560**. Half again as bright as the masonry they
 * stand on and two thirds its chroma, before a photon is cast — and that is a property of the
 * ALBEDO, so it survives every light in the level, which is why the complaint survived §727.
 *
 * THE DERIVATION, in two steps, each from a measured population:
 *   1. the CHROMATICITY is the architecture's own — the linear mean of the four warm-stone
 *      recipe tints (`sandstone_block` 0xc9915a, `paving_courtyard` 0xcfa068, `hieroglyph_wall`
 *      0xd6a874, `column_papyrus` 0xd8a468) = 0xd2a068. Not a new colour: the grade the rest of
 *      the level already wears.
 *   2. the LEVEL is set by solving for the scale (×1.2359 in linear) at which the props' placed
 *      albedo lands on `paving_courtyard`'s graded luminance — the surface they stand on.
 * Result: **0xe6b073**, taking the props' albedo to **L 86.8 / sat 0.816**, inside the
 * architecture's band on both axes by construction.
 *
 * WHAT WAS TRIED AND DECLINED, each measured alone in-frame on a fixed footprint (§736.4):
 * a triplanar `detail` layer at the architecture's own preset moved mean L the WRONG way
 * (127.0 → 131.3 by day) for no chroma; `rough 0.9 / spec 0.14 / gloss 20 / sss 0` — the
 * architecture's own surface numbers — measured **bit-identical** to the shipped material in
 * the crypt at both grades, because every term it touches is gated by the key light and the
 * crypt has none. Neither is shipped. A change that measures zero is not a change.
 */
export const KK_GRADE = 0xe6b073;

/**
 * The ONE look for everything that wears the atlas — `KayKit.init` and the §729 destructible
 * swap build their materials through this so the imported set cannot drift into two grades
 * (Smashables' own header calls that drift out by name for the clays). Each consumer OWNS the
 * material it makes (and disposes it); what is shared is the recipe, not the instance.
 *
 * §736 put `KK_GRADE` where the `0xffffff` was, in BOTH branches — the headless fallback
 * included, so a boot without SHADING is not a third grade.
 */
export function makeAtlasMaterial(engine, atlas, name = 'kaykit:atlas') {
  const color = KK_FLAT ? 0xffffff : KK_GRADE;
  const shadeHold = KK_NOHOLD ? 0 : KK_HOLD;
  const shading = engine?.get?.('shading');
  if (shading?.make) {
    return shading.make({ name, color, map: atlas, bands: 3, rim: 0.5, shadeHold, outline: 0.0034, outlineColor: 0x1a1210 });
  }
  const m = new THREE.MeshStandardMaterial({ color, map: atlas, roughness: 0.9 });
  m.name = name;                        // the headless branch answers to the same name
  return m;
}

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
  /* ---- west colonnade: the store, where the processional way is not ----
   * `barrel_small_stack` was at (-20.3, 2.6), 0.731 m inside the west OUTER gateway pylon. Unlike
   * the camera placement further down it was invisible from all eighteen canonical cameras — 574
   * seam points, none of them unoccluded — so nothing in a frame would ever have shown it. It is
   * moved anyway, 1.15 m north to (-20.25, 3.75), because at this x the store line is inside the
   * pylon's own footprint and the move costs nothing: same line, same neighbours, no camera. An
   * invisible defect is still a defect when the fix is free; see the tomb hoard for the two where
   * it is not. */
  ['crates_stacked',          -20.5, 0, -6.0,  0.32],
  ['barrel_large',            -19.2, 0, -3.4,  0.00],
  ['barrel_small',            -21.0, 0, -2.0,  1.10],
  ['barrel_small_stack',     -20.25, 0, 3.75, -0.42],   // was (-20.3, 2.6) — 0.731 m inside a pylon
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
  /* §604 — moved 9.0 m SOUTH, from z -45.5. Same line, same neighbours, same rotation, same
     model: only the corner changes.
     It stood at (-19.6, -45.5), the hall's north-west corner, and §600-§603 put the vent mouth in
     that corner. Photographed from the two stances a player walks it — eye 1.60 m, gameplay fov,
     looking north — this ONE prop filled the right two thirds of both frames at 2.36 m and 2.48 m
     from the eye, and 21 of 41 rays in a +-40 deg fan from the bore axis hit it before anything
     else. The mudbrick frame §603 built to mark the entrance was not visible on the approach at
     all, behind it.
     It also carries no collider within 14 m of the mouth (§602), so a player walks straight
     THROUGH the thing hiding the way in: it occludes like a wall and does not read as one.
     Not deleted — it is the west aisle's northernmost store and the counterpart to the
     `rubble_half` at (19.2, -43.0) on the east, which are deliberately not a mirrored pair, and
     -36.5 keeps them unmirrored. It sits 3.5 m north of `barrel_small_stack` at (-19.8, -33.0),
     the next store down the same line, which is inside the 2.7-5.5 m spacing the rest of the line
     already runs at.

     -36.5 rather than -39.5, and that was measured rather than judged. Both clear the approach
     completely — frame 9/9 and 0 of 41 prop rays from either camera — but over the whole hall
     -39.5 COST 11 stances their only cue (149 -> 138), because at that z the prop moves into the
     sightline fan converging on the mouth from the south. -36.5 is far enough down the aisle to
     fall out of that fan: 150/384, a hair above where it was before this move, while direct sight
     of the aperture goes 104 -> 131. Strictly better on every row, so there was no trade to make. */
  ['rubble_half',             -19.6, 0, -36.5, -0.60],

  /* ---- the tomb: the hoard, around the sarcophagus at (0, −12, −72) ----
   *
   * TWO OF THESE ARE INSIDE CRYPT PIERS AND BOTH ARE ACCEPTED, for different reasons. §397.5
   * measured four KayKit colliders inside `wall` proxies; the two in the courtyard are moved
   * (see above) and these two stay. `tests/kaykit.test.mjs` A3b holds them as a named exception
   * list, so a THIRD one cannot appear without failing the build.
   *
   *   `chest` at (-6.8, -74.2)   0.759 m into the west pier at (-5.5, -74). It does intersect the
   *                              drawn granite — 446 seam points — and **not one of them is
   *                              unoccluded from any of the eighteen cameras**, because the pier
   *                              is between them and it. In the room it reads as a chest shoved
   *                              against a pier, which is what a looted crypt should look like.
   *                              Moving it costs the hoard's composition around the sarcophagus
   *                              and buys a frame nobody will ever render.
   *
   *   `chest` at (4.6, -70.0)    0.097 m into the east pier at (5.5, -68) — and **the drawn pier
   *                              is not touched at all**, zero seam points. This is not a
   *                              placement defect, it is a PROXY defect, and it generalises past
   *                              this chest: every crypt pier's `wallProxy` is an axis-aligned
   *                              2.2 m box while the pier it stands for is a `masonryShell` under
   *                              `cornerRolls` of radius 0.2 with batter and jitter, so the proxy
   *                              is fatter than its own art by up to ~0.2 m at every corner.
   *                              Recorded at the proxy in `EgyptLevel.js`, where it belongs.
   *
   * What the two cost in gameplay is measured rather than assumed, and it is small: 1.48 m² and
   * 0.29 m² of crate top standing inside masonry — surface the collision hash offers and no
   * capsule can occupy — plus a handful of `probeLedge` grabs that land the player 2-6 cm inside
   * the pier. No snag, no wedge, no route. See A3d. */
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
   * far and away the nearest shot, at 8.09 m. `temple` has ONE in its cone, at 28.99 m, because it
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
   *                                     reach 87.27 m and the tomb hoard 107.5–116.8 m. One
   *                                     sentence, and its count and its range described different
   *                                     sets.
   *   "`interior` is the only shot      THREE shots are inside it, over the eighteen canonical
   *    with a prop inside 25 m"         cameras that exist today: interior 8.09 m, `alert`
   *                                     14.22 m, `sly-key` 24.99 m. Two of those cameras
   *                                     (`alert`, `impact`) landed after this banner was written
   *                                     and `sly-key` is 13 mm inside the bar, so this is a claim
   *                                     that other files retired rather than one that was wrong
   *                                     when made — which is the more common way a comment dies.
   *                                     The sentence now states the gap it exists to convey:
   *                                     interior at 8.09 m, then 6.13 m of nothing.
   *
   *                                     THAT GAP WAS 15.3 m UNTIL `alert` WAS RE-STAGED
   *                                     (KNOWN_ISSUES §401/§406). Its first camera framed the
   *                                     west colonnade from the courtyard's east side with a
   *                                     `sandstone_block` wall in between; the repaired one sits
   *                                     at (-14, 3, 22) among the stores, and its nearest prop
   *                                     is 14 m rather than 23.35. So the second-nearest camera
   *                                     is now `alert` at 14.22 m, not `sly-key` at 24.99, and
   *                                     the level's props are one shot closer to being read at
   *                                     detail range than they were.
   *
   *                                     Kept as a measured gap rather than restored to the old
   *                                     number: this arm caught a camera move within minutes of
   *                                     it landing, which is what it is for.
   *
   * ── §604 moved one prop, and TWO numbers in this banner moved with it ───────────────────────
   * `rubble_half` went from (-19.6, -45.5) to (-19.6, -36.5) to clear the vent approach, and it
   * happened to be both of the props these sentences are about: `temple`'s single in-cone prop,
   * 35.2 -> 28.99 m, and the hypostyle's farthest from `courtyard`, 88.7 -> 87.27 m. `kaykit`
   * C2 and C3 caught both within a minute of the move, which is what they are for — the numbers
   * are re-measured rather than the tolerances widened.
   *
   * Both aims are legitimate — a follow camera passes within a couple of metres of the colonnade
   * stores — but only one of them had been considered. `Props.js` already settled the precedent in
   * its header: a handful of its props are positioned by eye for the canonical cameras specifically.
   *
   * These six are NOT positioned by eye. Each was grid-searched against three tests at once: on
   * real paving, clear of every column and plinth footprint by 1.4 m, and inside its target shot's
   * frame at 6-26 m. All three matter — five positions chosen by eye first sat inside the obelisk
   * terrace or a colossus plinth, and two more inside nave columns (x +/-8, not the +/-11.4 I had
   * assumed). Distances below are to the shot named.
   *
   * ── THAT CONSTRAINT LIST WAS SHORT BY TWO CATEGORIES, AND IT SHIPPED A CRATE INSIDE A PYLON ──
   * `barrel_large` stood at (-11.5, 2.5) — **1.003 m inside the west inner processional gateway
   * pylon**, deep enough that 140 of its 503 intersection-seam points were unoccluded in `night`,
   * an 87 x 104 px patch in the lower-left of the frame. The search that placed it was not buggy.
   * It passed every test it states: that position clears the nearest `pole` proxy — "every column"
   * — by **14.30 m**. The gateway pylons are `wall` proxies, and `wall` was never in the list.
   *
   * The second category was found by the FIX. Moved to (-10.0, 3.75) the barrel cleared every wall
   * proxy by 0.70 m and still cut 432 drawn masonry triangles: it was standing on courtyard paving
   * at y 0 **underneath the obelisk terrace**, whose own paving top is 1.52 m up. "On real paving"
   * had been asked as "is there a floor at y = 0", and a floor at y = 0 says nothing about what is
   * above it — `tools/framelib.mjs`'s `groundColumn` documents exactly that trap.
   *
   * So the list this block is searched against is now four tests, and it is a check rather than a
   * claim: `tests/kaykit.test.mjs` A3b re-derives it over every placement, not just these six.
   *
   *   1. on real paving  — and the prop's OWN HEIGHT clear of everything above that floor
   *   2. clear of every `pole` proxy (columns) by 1.4 m
   *   3. clear of every `wall` proxy (pylons, temenos, piers, gate jambs) — exact SAT, not AABB
   *   4. inside its target shot's frame at 6-26 m, and >= 14 m from every `sly-*` close-up
   *
   * `barrel_large` now stands at (-9.0, 0.75): 1.035 m clear of the nearest wall proxy, nothing
   * overhead, 22.93 m in `night`, and **zero** drawn-masonry seam points — measured after the
   * move rather than inferred from the clearance, because the drawn pylon is a `masonryShell` at
   * batter 0.095 under `cornerRolls` of radius 0.24 with its own jitter, while the proxy it was
   * cleared against is a batter-0.085 hull with none. The art can stand outside its own proxy. */
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
  ['barrel_large',             -9.0, 0,  0.75, -1.20],   // night     22.9 m
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
       4.5 cm of world subtends 1.166 px (fov 55 over 900 px is 25.90 px/m at 33.37 m — that
       arithmetic re-derives exactly). The count used to read "thirty" and the range "35–51 m":
       the count predates the six camera placements below, and the range only ever described the
       eleven colonnade props. The one placement that IS near — the courtyard crate at 11.8 m — is
       the exception the camera block was added to create, and it does not weaken the argument,
       since a term that cannot reach 33 m is not saved by one prop at 12 m.

       THE px FIGURE HERE WAS THE THIRD COPY OF ONE STALE NUMBER. It read "1.11 px … 24.7 px/m at
       35 m", which is the arithmetic of the OLD 35–51 m band — corrected two sentences above and
       left standing in the number derived from it. `Decals.js`'s header carried the same 1.11 and
       its own `hero` figure was stale too. A corrected range and an uncorrected number derived
       from it is the most durable kind of stale comment, because the sentence reads as if it had
       been checked. Re-derived by `tests/decalstat.test.mjs`, which reads both figures out of the
       comment text rather than out of this file's history.
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

    /* §729 folded these lines into `loadAtlasTexture`/`makeAtlasMaterial` above so the
       destructibles swap wears byte-for-byte this material recipe — same settings, same
       fallback branch, one place for both to drift from (which is to say: neither). */
    const atlasFile = this.mode === 'showraw' ? 'dungeon_texture.png' : 'dungeon_texture_sandstone.png';
    const atlas = await loadAtlasTexture(atlasFile);
    this.material = makeAtlasMaterial(this.engine, atlas);

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

  /**
   * Load each model once and reduce it to a single bind-space geometry plus its bounds.
   * §729 moved the body to the exported `loadModelLib` (top of this file) so the destructibles
   * swap shares it; this method keeps the class's own bookkeeping — `stats.models`/`failed`
   * and the warn line — byte-identical, and `tests/_kaykitboot.mjs` still wraps it by name.
   */
  async _load(names) {
    const lib = await loadModelLib(names, (file, err) => {
      this.stats.failed++;
      this.engine?.warn?.(`KayKit: ${file} failed — ${err?.message || err}`);
    });
    this.stats.models += lib.size;
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
