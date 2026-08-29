import * as THREE from 'three';
import { rng, WORLD_SEED } from '../core/Rand.js';
import { canopicJar, basket, chunk, place, mergeAll } from './PropKit.js';
import { COIN_VALUE } from './Pickups.js';
/* §727: the colours below now READ Props.MATERIALS instead of restating its hexes, so the
 * mirror this file promises ("so this does not become a fourth clay") is structural — when
 * §727 dropped the wood double tint, a crate restating 0x6b4a2c would have kept the old
 * grade and stood beside the un-tinted scaffold as exactly the divergence the mirror exists
 * to prevent. Pickups already imports from Props (same direction), so this cannot cycle. */
import { MATERIALS as PROP_MATERIALS } from './Props.js';
/* §729: the imported bodies come through KayKit.js's own reduction — the ONE adoption path the
 * pack already has (§707 measures clearance off it, §718 records its single-atlas merge as the
 * strength to keep) — never a second loader here. `SMASH_GEN` is the `?smash=gen` revert. */
import { SMASH_GEN, VAULT_URNS, loadModelLib, loadAtlasTexture, makeAtlasMaterial } from './KayKit.js';
/* §730: the treasure-room volume, shared with Architecture's portal gate and Props' offering
   table — one definition of "inside the vault", asked here of a prop instead of a camera. */
import { CRYPT, inCrypt } from './EgyptLevel.js';

/**
 * Smashables — things you break, and the publisher `propSmashed` never had.
 *
 * ── §357.1 again, and this one was on the project's own to-do list ─────────────────────────
 * `tests/eventbus.test.mjs` has carried `propSmashed` under DEAD_UNBUILT with an unusually
 * complete brief: *"both FX halves of a prop coming apart exist and nothing breaks props yet.
 * `Particles.smash()` throws the debris, the contact puff and (on metal) the sparks, and leaves
 * a `dust_ring` — or a `scorch`, metal only; `Audio._onSmash()` lays the material transient over
 * `stone_grind`. Between them they are the second end of three catalogue entries that had no
 * reader at all. The missing half is the mechanic ... which is `src/world/`'s and has an owner."*
 *
 * This is that half. It publishes nothing new: the payload is the one that brief specifies,
 * `{ pos, material, scale, normal, dir }`, and both subscribers were live before this file
 * existed. Three FX catalogue entries — `dust_ring`, `scorch` and `PAL.crevice` — reach a screen
 * for the first time as a consequence.
 *
 * ── The swing that breaks them is the swing that already hits guards ───────────────────────
 * `Moveset.Combo.swing` publishes `caneHit` and its comment says exactly what was missing:
 * *"If AUDIO wants a surfaced impact it needs a hit event from whatever resolves the strike."*
 * Nothing resolved the strike against the world — only `Guard.js:1770` resolved it against
 * guards. So the geometry of the resolve is **borrowed from Guard.js rather than invented**:
 * the same 2.2 m planar radius and the same `dot >= 0.1` facing cone, so a jar and a guard
 * standing side by side in front of one swing either both take it or both do not. A second,
 * differently-felt cane reach is the exact class of drift `Pickups._clueMat` refuses one file
 * over, and there is no reason for a prop to be harder to hit than a person.
 *
 * Two consequences of borrowing it, both deliberate and neither hidden:
 *   · `caneHit` fires on the WIND-UP, before the swing connects — `Combo.swing`'s own comment
 *     says so. A jar therefore bursts a few frames early. Guards already take their hit on that
 *     frame; matching them is worth more than being right alone.
 *   · `pos` and `dir` on that event are **live references into MOVEMENT's scratch** (`_a` is a
 *     module-level scratch vector in `Moveset.js`, and `pos` is `c.position` itself). Everything
 *     read out of the payload is consumed synchronously or copied. §237's aliasing trap.
 *
 * ── What was NOT carried over from the reference, and why ──────────────────────────────────
 * `Scripts/smashable.gd` in NoahChase/Sly-Cooper--A-Thief-in-Godot (**licence: none stated** —
 * design reference only, nothing ported) respawns a crate on a timer and fans five raycasts
 * before doing it, restarting the timer if any is colliding, so a crate never rematerialises
 * around the player. The eventbus brief calls that "one thing worth carrying from `smashable.gd`
 * and nothing else".
 *
 * **Nothing here respawns**, so none of it is carried — and the reason is worth recording,
 * because the careful part of that GDScript is a fix for a problem this design does not have.
 * A smashable pays coins. A smashable that comes back pays coins again, which is a money farm
 * with a two-second cycle time, and `Wallet.credit` is add-only with no sink anywhere in `src/`.
 * The respawn timer is what makes the five raycasts necessary; removing the timer removes both.
 * A broken jar stays broken for the level, exactly as a collected coin does.
 *
 * ── They are not colliders, and that is a measured constraint rather than a shortcut ───────
 * `Collision.add()` appends to `recs` and sets `_dirty`; `Collision.build()` then rebuilds the
 * WHOLE triangle soup and the whole BVH from every record. There is no per-record removal and
 * no incremental path. Disabling one jar's collider therefore costs a full BVH rebuild, which is
 * not a thing to do on a cane swing. So a smashable is a prop you can run through — its only
 * physical presence is the break test in this file. That is the honest trade at 0.5 m of jar,
 * and the alternative (register them, then leave phantom colliders behind after the break) is
 * strictly worse: an invisible wall is a bug, a pot you clip is set dressing.
 *
 * ── §729: the bodies are the imported set now, and everything above survives it ────────────
 * "Switch out the generated destructible props in all locations for those imported props."
 * The KINDS docblock carries the per-slot model decision with its measured conforms; what
 * matters here is what did NOT move: the resolve (same borrowed reach and cone, same early
 * wind-up burst), the no-respawn latch, the no-collider trade — all body-independent, and the
 * swapped bodies are 0.60–0.70 m where the trade was priced at 0.5, same class of clip. One
 * consequence IS new and deliberate: the pack's own set dress places these same models at
 * FULL size with solid `kaykit:solid` colliders (§707 shows guards pathing around them), so
 * size is now the vocabulary — a knee-high container smashes and can be waded through, a
 * waist-high-or-bigger one is furniture and blocks. Recorded rather than hidden, because two
 * behaviours on one silhouette is exactly the kind of lie this header already prices.
 * `?smash=gen` (KayKit.js, shared with Props.js's static twins) is the whole-swap revert.
 *
 * ── §730: the treasure room takes its urns back, and NOTHING else moves ────────────────────
 * "The urns in the treasure room can be put back." / "By urns, I mean canopic jars."
 * §729's own KINDS note records the fact that makes this the right ask: the pack holds **no
 * jar, pot or basket model**, so a `jar` slot got `barrel_small` — which reads fine on a dock
 * or a terrace and reads wrong in the one room whose entire set dress is Egyptian ceramic,
 * standing beside the offering table, the coffin lid and the treasure pile.
 *
 * So this is a PER-LOCATION body policy, not a revert. A spot is an URN when it is a `jar`
 * AND `inCrypt(pos)` — every other spot in the level, and the vault's own crate, keep the
 * imported body §729 gave them, because the owner named urns and everything else was accepted
 * by silence. `?vault=barrels` is the way back; `?smash=gen` still generates the whole level
 * and makes the policy moot.
 *
 * Three consequences, all deliberate, none hidden:
 *   · RNG-NEUTRAL BY CONSTRUCTION. The policy draws ZERO values from `this.rng`. Placement is
 *     authored before `_loadBodies` runs (§729's own ordering), and the urn BODY is the very
 *     geometry `_loadBodies` already builds to measure the jar's conform — kept instead of
 *     disposed. So the stream, and therefore every placement in the level, is bit-for-bit what
 *     §729 shipped. §724's precedent: a per-item change that draws nothing keeps the world.
 *   · THE COLLIDER IS RE-DERIVED, NOT CARRIED — trivially here, because a smashable has no
 *     collider at all (see the trade above) and never had one. The real collider consequence
 *     is on the STATIC twins in `Props.js`, where the four offering-table jars move off the
 *     `props_kaykit` mesh (`ground`/`wood`) back into the `lime` bucket (`ground`/`stone`) and
 *     get a jar's own merged bounds again. Stated here so the two halves read as one policy.
 *   · IT BREAKS LIKE CLAY AGAIN, which is the point. `material` goes back to `stone`, and that
 *     one tag is read by `Particles.smashFor` AND `Sfx.stepFor`, so BOTH halves of the break
 *     change together: pale limestone chips (`PAL.limeLight` #f0e3c8 → `PAL.crevice`) instead
 *     of wood chips (`PAL.woodChip` #8a6a44), and `step_stone` instead of `step_wood` under
 *     `_onSmash`'s 0.62 rate — a bright, short crack with a 2.2 kHz heel tick and no ring-out,
 *     where the barrel gave a 434 Hz resonant thunk with a 267 Hz wooden ring. The `stone_grind`
 *     rubble layer is identical: it keys off `scale`, and `scale` is 1 in both arms.
 */

/* ============================ tuning ==================================== */

/**
 * PREREG-smash1 (§141.1): registered before the resolve was written, and every number is
 * DERIVED from one that already shipped. Nothing here is a free parameter.
 *
 *   hitRange   2.2   `Guard.js:1773` — `_v1.lengthSq() > 2.2 * 2.2`, the cane's own reach
 *   hitDot     0.1   `Guard.js:1774` — the same swing's facing cone
 *   slamFallback 1.2 `Controller.TUNE.diveRadius`, which is what `caneSlam` carries in `radius`
 *   scale      1/2   `Particles.smash`'s documented unit: "the prop's size in units of a
 *                    canopic jar — 1 for a jar or a basket, 2-3 for a stele or a lid"
 *   values           `Pickups.COIN_VALUE`, so a break chimes on the same ladder a coin does
 *                    (`amount` doubles as Audio's chime count, capped at 6)
 */
export const TUNE = Object.freeze({
  hitRange:     2.2,
  hitDot:       0.1,
  slamFallback: 1.2,
  /* Vertical tolerance on the resolve. Guard.js flattens to the plan (`_v1.y = 0`) because a
     guard is 1.8 m tall and always within a body-height of the player's feet. A jar is 0.5 m
     and may be on a table or a ledge above him, so a planar-only test would let a swing on the
     floor break a pot on a shelf 4 m up. One player height is the bound, and it is
     `Controller.TUNE.height` — the same 1.8 the guard test gets away with implicitly. */
  hitRise:      1.8,
  /* Per-waypoint cluster. Small on purpose: the offsets are applied around a route waypoint,
     which is the centre of a walkable line rather than a surveyed floor, so the further a jar
     is thrown from it the less the route guarantees. 0.85 m is under a body-width. */
  clusterMin:   2,
  clusterMax:   3,
  clusterR:     0.85,
});

/**
 * The three breakables, and the material each reports.
 *
 * `material` is COLLISION's own tag, which is what `Particles.smashFor()` and `Sfx.stepFor()`
 * both key on — so the tag chosen here decides the debris colour, the decal and the transient
 * in one, and all three tables already have an entry for each of these.
 *
 * ── §729: the shipped bodies are the IMPORTED set, and the model row is a measured decision ──
 * The owner: "switch out the generated destructible props in all locations for those imported
 * props." The pack holds NO jar, pot or basket model — its containers are barrels, crates and
 * chests (enumerated on disk; stated rather than papered over) — so each slot gets the nearest
 * container silhouette, conformed by UNIFORM scale to the measured height of the exact
 * generated body it replaces (§702/§705: both heights are measured at build, in `_loadBodies`;
 * neither is typed here — the shipped seed makes them exactly reproducible, and `debugInfo().swap`
 * echoes what a given boot actually took). At the shipped seed:
 *
 *   jar    → `barrel_small`    1.018 m native → ×0.603 to the jar's measured 0.614 m
 *   basket → `chest`           1.300 m native → ×0.385 to the basket's measured 0.500 m
 *   crate  → `crates_stacked`  2.142 m native → ×0.308 to the crate's measured 0.659 m
 *
 * A stretched barrel was rejected up front: conforms are uniform, so the swapped footprints
 * (0.60 / 0.65 / 0.70 m) grow past the generated ones but stay inside the cluster ring's
 * worst-case neighbour chord (2·0.47·sin 60° = 0.81 m against a worst radius-sum of 0.65).
 *
 * `material` is `wood` across the swapped set, and that is a MEASUREMENT, not a default: the
 * area-weighted mean of the sandstone atlas under each model's own UVs is #ab7e4f / #9e6f46 /
 * #a06d43, and `SMASH.wood`'s debris start (`PAL.woodChip` #8a6a44) is the nearest recipe in
 * the table for crates and chest (Δ22, Δ21) and within 3 RGB units of nearest for the barrel
 * (sand Δ37 vs wood Δ40 — a tie the material family breaks). So the shards a swing throws
 * already match the new bodies with NO retint and no second palette — the §712 rule, satisfied
 * by finding the derived answer already in the table. The same tag keys `Sfx.stepFor`, so a
 * barrel now CRACKS instead of grinding, which is the sound of the thing that actually broke.
 *
 * `?smash=gen` restores the generated bodies AND their original tags — a canopic jar must not
 * throw wood chips — so the table is armed at module load, exactly as `Props.PILE_FADED` is.
 * `h` (the event's mid-height lift and the S9 bound) and the value ladder are UNTOUCHED in
 * both arms: same places, same pay, new bodies.
 *
 *   jar     gen: clay under `stone` — limestone chips into `PAL.crevice`, `SMASH.stone`.
 *   basket  gen: wicker under `cloth` — NO shrapnel, the quiet one, worth the least.
 *   crate   both arms wood: `PAL.woodChip` existed for exactly this.
 */
export const KINDS = Object.freeze(SMASH_GEN ? {
  jar:    { material: 'stone', scale: 1, value: COIN_VALUE.stack,  h: 0.58 },
  basket: { material: 'cloth', scale: 1, value: COIN_VALUE.single, h: 0.44 },
  crate:  { material: 'wood',  scale: 2, value: COIN_VALUE.pile,   h: 0.62 },
} : {
  jar:    { material: 'wood', scale: 1, value: COIN_VALUE.stack,  h: 0.58, model: 'barrel_small' },
  basket: { material: 'wood', scale: 1, value: COIN_VALUE.single, h: 0.44, model: 'chest' },
  crate:  { material: 'wood', scale: 2, value: COIN_VALUE.pile,   h: 0.62, model: 'crates_stacked' },
});

/**
 * §730 — the treasure room's own jar row: the `?smash=gen` arm's `jar` entry, verbatim.
 *
 * Written as the gen row rather than as a patch over the shipped one because that is what it
 * IS — the urn is the generated body wearing its own material tag again, and `stone` is the
 * tag §729's table documents for exactly this ("jar gen: clay under `stone` — limestone chips
 * into `PAL.crevice`, `SMASH.stone`"). `h`, `scale` and `value` are UNCHANGED from the shipped
 * row on purpose: same place, same pay, same event mid-height, only the body and the material
 * family move. `tests/vaulturn.test.mjs` U1 asserts this row equals a `?smash=gen` child's
 * `KINDS.jar` field for field, so a retuned jar cannot leave the urn behind.
 */
export const URN = Object.freeze({ material: 'stone', scale: 1, value: COIN_VALUE.stack, h: 0.58 });

/** The instancing slot a prop renders in. One mesh per slot, so the urns can carry a different
 *  geometry AND a different material from the barrels that share their kind. */
export const URN_SLOT = 'jar:urn';

/**
 * Is this spot an urn — a canopic jar standing in the treasure room?
 *
 * Pure, and exported for the same reason `inSwing` is: it is the whole of §730's selection and
 * a selection that drifts is worse than none. `kind` is the pre-§729 kind, straight off the
 * authored spot, so the census is a fact about the SEED rather than about the swap.
 */
export function isUrn(kind, pos) {
  return VAULT_URNS && kind === 'jar' && inCrypt(pos);
}

/**
 * Route waypoints a prop may stand on.
 *
 * `Architecture.api.route` is the level's own authored line and every waypoint on it is a place
 * the designer put a beat — but **not every waypoint is a floor**, and placing a jar on one that
 * is not puts it in mid-air. Two are excluded by name and the reasons are specific:
 *
 *   hook-chain           (4.2, 14.8, 4.5) is a point on a hook chain. There is nothing under it.
 *   hall-front-cornice   (-9.5, 13.6, -15.2) is STALE. `Props._clueBottles()` records measuring
 *                        it: a downward ray there falls the full 15 m to the courtyard paving,
 *                        and the built cornice ledge is at y 15.36, z -16.5. That coordinate is
 *                        not this module's to rewrite either, so it is simply not used.
 *
 * Everything else on the route is a floor or a ledge with known depth — `kiosk-lintel` included,
 * which is where `Pickups.TREASURES` already stands the Scarab of Khepri 0.35 m proud of y 9.
 */
export const SKIP_WAYPOINTS = Object.freeze(['hook-chain', 'hall-front-cornice']);

/**
 * Decide where the breakables go, from the route and nothing else.
 *
 * Pure and deterministic so the layout is testable without a renderer, exactly as
 * `Pickups.authorRouteCoins` is and for the same reason: thirty hand-typed coordinates drift the
 * moment the temple moves, and two of the twelve hand-typed clue-bottle spots were wrong when
 * first written.
 */
export function authorSmashables(route, opts = {}) {
  const R = opts.rng || rng(WORLD_SEED ^ 0x5346);
  const out = [];
  if (!Array.isArray(route)) return out;

  const kinds = Object.keys(KINDS);
  for (const w of route) {
    if (!Array.isArray(w) || w.length < 4) continue;
    const [name, x, y, z] = w;
    if (typeof name !== 'string' || SKIP_WAYPOINTS.includes(name)) continue;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

    const n = TUNE.clusterMin + Math.floor(R() * (TUNE.clusterMax - TUNE.clusterMin + 1));
    /* A ring rather than a scatter: two jars at the same jittered point interpenetrate, and a
       ring with a random phase is the cheapest arrangement that cannot produce one. */
    const phase = R.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      const r = TUNE.clusterR * (0.55 + 0.45 * R());
      out.push({
        kind: kinds[Math.floor(R() * kinds.length) % kinds.length],
        at: name,
        x: x + Math.cos(a) * r,
        y,
        z: z + Math.sin(a) * r,
        ry: R.range(0, Math.PI * 2),
      });
    }
  }
  return out;
}

/**
 * Is this prop inside the swing that was just made?
 *
 * Lifted out as a pure function because it is the one piece of this module worth a bar of its
 * own: it is a copy of `Guard.js`'s resolve with a vertical bound added, and a copy that drifts
 * is worse than no copy. Returns true on a hit.
 *
 * @param {{x:number,y:number,z:number}} prop  the prop's base
 * @param {{x:number,y:number,z:number}} from  the swing origin — the player's capsule BASE
 * @param {?{x:number,y:number,z:number}} dir  the facing, or null for an omnidirectional break
 * @param {number} range  planar radius
 */
export function inSwing(prop, from, dir, range, tune = TUNE) {
  if (!prop || !from) return false;
  const dx = prop.x - from.x, dz = prop.z - from.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > range * range) return false;
  /* Above his feet by at most one body height, and never below them by more than one either —
     a swing on a roof must not break the pots on the floor beneath it. */
  const dy = prop.y - from.y;
  if (dy > tune.hitRise || dy < -tune.hitRise) return false;
  if (!dir) return true;
  if (d2 < 1e-6) return true;                 // standing inside it
  const inv = 1 / Math.sqrt(d2);
  const dl = Math.hypot(dir.x, dir.z);
  if (dl < 1e-6) return true;                 // a facing with no plan component decides nothing
  return ((dx * inv) * (dir.x / dl) + (dz * inv) * (dir.z / dl)) >= tune.hitDot;
}

/* ============================ the module ================================ */

export class Smashables {
  constructor(engine) {
    this.engine = engine;
    this.rng = rng(WORLD_SEED ^ 0x5346);
    this.TUNE = TUNE;

    this.root = new THREE.Group();
    this.root.name = 'smashables';

    this.props = [];        // { kind, pos, ry, broken }
    this.broken = 0;
    this._meshes = new Map();   // kind -> InstancedMesh
    this._geoms = [];
    this._materials = [];
    this._offs = [];
    this._dirty = new Set();
  }

  async init() {
    this.engine.scene.add(this.root);
    const route = this.engine.get?.('architecture')?.api?.route;
    for (const s of authorSmashables(route, { rng: this.rng })) {
      /* §730: the urn decision is taken HERE, on the authored spot, and it draws nothing —
         `isUrn` is a kind test and a box test. It is deliberately independent of whether the
         KayKit load then succeeds: the policy is about WHERE a prop stands, and on the
         fallback path (a 404, an unprimed headless boot) the vault's jars are generated
         anyway, so an urn slot there is the same body wearing the right material instead of
         §729's `wood`. `slot` is what `_build`/`_writeMatrices`/`_dirty` key on from now on;
         `kind` keeps its old meaning everywhere so the value ladder and the census still read
         off the seed. */
      const urn = isUrn(s.kind, s);
      this.props.push({
        kind: s.kind, at: s.at, ry: s.ry, broken: false, urn,
        slot: urn ? URN_SLOT : s.kind,
        pos: new THREE.Vector3(s.x, s.y, s.z),
      });
    }
    this.urns = this.props.filter((p) => p.urn).length;
    /* §729: AFTER the placements are authored, deliberately — every body decision below is
       downstream of `this.rng`'s placement draws, so neither the swap, the `?smash=gen` arm
       nor a failed load can move a single `pos` (the determinism arm in smashswap.test.mjs
       runs all three and diffs the positions). */
    await this._loadBodies();
    this._build();
    this._wire();
  }

  /* --------------------------------------------------------------------- */

  /**
   * §729 — fetch the imported bodies and conform each to the mount it takes over.
   *
   * The conform is measured on BOTH sides at build time: the generated body is built once
   * (through the same `_genGeo` the `?smash=gen` arm renders), its height read off its own
   * bounding box, and the KayKit model is uniform-scaled to that height and re-seated base-at-
   * origin — so a retuned `KINDS.h`, a re-authored generator or a re-exported model all conform
   * themselves on the next boot with no number to chase (§702/§705).
   *
   * Failure is per model and non-fatal: a body that cannot load keeps its generated stand-in
   * (`_geoFor`'s fallback) and says so — the §592 shape is an event that dies in a swap, and
   * the cousin here would be a KIND that dies in one; neither a 404 nor a headless boot with no
   * primed cache (see `transportReady` in KayKit.js) may cost the level its breakables.
   */
  async _loadBodies() {
    this._swapGeo = new Map();          // slot -> conformed, base-at-origin geometry
    this._urnGeo = null;                // §730: the generated canopic jar the vault keeps
    this.swapState = { armed: !SMASH_GEN, swapped: [], fallbacks: [], urns: this.urns || 0 };
    if (SMASH_GEN) return;
    const models = [...new Set(Object.values(KINDS).map((K) => K.model).filter(Boolean))];
    const lib = await loadModelLib(models, (file, err) => {
      this.engine.warn?.(`smashables: KayKit '${file}' failed (${err?.message || err}) — the generated body stands in`);
    });
    try { this._atlas = await loadAtlasTexture(); } catch { this._atlas = null; }
    for (const [kind, K] of Object.entries(KINDS)) {
      const e = K.model ? lib.get(K.model) : null;
      if (!e) { this.swapState.fallbacks.push(kind); continue; }
      const gen = this._genGeo(kind);
      gen.computeBoundingBox();
      const genH = gen.boundingBox.max.y - gen.boundingBox.min.y;
      /* §730 — THE RNG-NEUTRALITY MECHANISM, and it is one `if`. This jar is already built:
         §729 builds it here purely to measure the height the barrel conforms to, then throws
         it away. Keeping it instead of disposing it is how the treasure room gets a generated
         urn for ZERO extra `this.rng` draws — a second `_genGeo('jar')` would advance the
         stream, and while nothing downstream of here places anything, "nothing downstream
         today" is not a property to lean on (§729's own reason for loading bodies AFTER
         authoring). Kept only when a spot actually wants it, so the default boot with no urns
         disposes exactly as before. */
      if (kind === 'jar' && this.urns > 0) this._urnGeo = gen;
      else gen.dispose();
      const kkH = e.bb.max.y - e.bb.min.y;
      const s = genH / kkH;             // uniform — the silhouette conforms, it does not stretch
      const geo = e.geo.clone();
      geo.scale(s, s, s);
      geo.translate(0, -e.bb.min.y * s, 0);   // base to y=0; XZ came centred from the loader
      geo.computeBoundingBox();
      this._swapGeo.set(kind, geo);
      this.swapState.swapped.push({ kind, model: K.model, s: +s.toFixed(4), h: +(kkH * s).toFixed(4) });
    }
    for (const e of lib.values()) e.geo.dispose();   // the clones above are the working copies
  }

  /** Every slot that may hold a mesh, in a FIXED order derived from `KINDS` — so the mesh and
   *  material construction order is the same on every boot and in both arms, and adding the
   *  urn slot cannot reshuffle §729's. `jar:urn` sits immediately after `jar`. */
  _slots() {
    return Object.keys(KINDS).flatMap((k) => (k === 'jar' ? [k, URN_SLOT] : [k]));
  }

  _build() {
    for (const slot of this._slots()) {
      const list = this.props.filter((p) => p.slot === slot);
      if (!list.length) continue;
      const geo = this._geoFor(slot);
      if (!geo) continue;
      this._geoms.push(geo);
      const mesh = new THREE.InstancedMesh(geo, this._matFor(slot), list.length);
      mesh.name = `smashable_${slot.replace(':', '_')}`;
      mesh.frustumCulled = false;
      /* Half a metre of pot self-shadowing is acne, the same call `Props._collectibles` and
         `Pickups._build` both make for the same reason. */
      mesh.userData.noShadow = true;
      this.root.add(mesh);
      this._meshes.set(slot, { mesh, list });
      this._writeMatrices(slot);
    }
  }

  /** The body a slot renders: §730's kept canopic jar for the urns, else the conformed import
   *  (§729), else the generated stand-in — which is the whole of the `?smash=gen` arm and the
   *  whole of the per-model failure path. The `||` on `_urnGeo` is the fallback path only: if
   *  `barrel_small` never loaded, `_loadBodies` skipped the measure and there is no kept jar,
   *  so the urns build their own (which costs rng draws AFTER every placement is authored, and
   *  therefore moves nothing — the determinism arm runs that boot too). */
  _geoFor(slot) {
    if (slot === URN_SLOT) return this._urnGeo || this._genGeo('jar');
    return this._swapGeo?.get(slot) || this._genGeo(slot);
  }

  _genGeo(kind) {
    const R = this.rng;
    const K = KINDS[kind];
    if (kind === 'jar') return canopicJar('human', { h: K.h, rng: R });
    if (kind === 'basket') return place(basket({ r: 0.3, h: K.h, rng: R, belly: 0.62 }), {});
    if (kind === 'crate') {
      /* A battered box with a lid band, so it is not a plain cube — `chunk` is the project's own
         chipped-box primitive and the band is a second, flatter one sat on top of it. */
      return mergeAll([
        place(chunk(0.54, K.h, 0.54, { rng: R, jitter: 0.012, chip: 0.05 }), { y: K.h / 2 }),
        place(chunk(0.58, 0.07, 0.58, { rng: R, jitter: 0.008 }), { y: K.h }),
      ]);
    }
    return null;
  }

  /** One material for the WHOLE swapped set — the pack's single-atlas strength (§718) carried
   *  over: three instanced meshes, one `smash:kaykit` material, built through the same recipe
   *  `KayKit.init` uses so the two cannot drift into separate grades. A kind on its generated
   *  fallback keeps its own §727-mirrored material through `_mat`.
   *
   *  §730: the urn slot is NOT on the atlas — it is a clay pot, so it takes `smash:clay`, the
   *  same §727-mirrored `Props.MATERIALS.lime` grade the generated jar has always worn. That
   *  costs the vault one extra material and one extra draw call for its two urns, which is the
   *  honest price of two bodies on one kind and is measured rather than assumed (`budgetattrib`
   *  in §730's record). `_swapGeo` is keyed by KIND and the urn slot is never in it, so this
   *  falls through to `_mat` without a special case. */
  _matFor(slot) {
    if (slot === URN_SLOT) return this._mat('jar');
    if (!this._swapGeo?.has(slot)) return this._mat(slot);
    if (!this._atlasMat) {
      this._atlasMat = makeAtlasMaterial(this.engine, this._atlas ?? null, 'smash:kaykit');
      this._materials.push(this._atlasMat);
    }
    return this._atlasMat;
  }

  /**
   * One material per kind, mirroring `Props.MATERIALS` so this does not become a fourth clay.
   * The same construction `Pickups._mat` uses, including its fallback: SHADING may be absent in
   * a headless boot and a missing material must not cost the module its meshes.
   */
  _mat(kind) {
    const spec = {
      jar:    { name: 'smash:clay',   color: PROP_MATERIALS.lime.color, rough: 0.62, tex: 'limestone_polished' },
      basket: { name: 'smash:wicker', color: PROP_MATERIALS.rope.color, rough: 0.95, tex: 'rope' },
      crate:  { name: 'smash:wood',   color: PROP_MATERIALS.wood.color, rough: 0.90, tex: 'wood_old' },
    }[kind];
    const tex = this.engine.get?.('textures')?.get?.(spec.tex) || null;
    const opts = {
      name: spec.name, color: spec.color, rough: spec.rough, roughness: spec.rough,
      map: tex?.map ?? null, normalMap: tex?.normalMap ?? null,
      roughnessMap: tex?.roughnessMap ?? null, aoMap: tex?.aoMap ?? null,
      bands: 3, rim: 0.4, spec: 0.2, gloss: 24,
    };
    let m = null;
    try { m = this.engine.get?.('shading')?.make?.(opts) ?? null; } catch { m = null; }
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: opts.color, roughness: spec.rough, map: opts.map });
      m.name = spec.name;               // the headless branch answers to the same name
    }
    this._materials.push(m);
    return m;
  }

  _writeMatrices(slot) {
    const entry = this._meshes.get(slot);
    if (!entry) return;
    for (let i = 0; i < entry.list.length; i++) {
      const p = entry.list[i];
      if (p.broken) { _m.makeScale(0, 0, 0); }
      else { _m.compose(p.pos, _q.setFromEuler(_e.set(0, p.ry, 0)), _one); }
      entry.mesh.setMatrixAt(i, _m);
    }
    entry.mesh.instanceMatrix.needsUpdate = true;
  }

  /* --------------------------------------------------------------------- */

  _wire() {
    const on = (evt, fn) => { const off = this.engine.on(evt, fn); if (off) this._offs.push(off); };

    /* The combo swing. `p.dir` is MOVEMENT's scratch vector — copied on the same line it is
       read, never held. */
    on('caneHit', (p) => {
      if (!p?.pos) return;
      const dir = (p.dir && Number.isFinite(p.dir.x)) ? _dir.copy(p.dir) : null;
      this._resolve(p.pos, dir, TUNE.hitRange);
    });

    /* The Cane Slam. Omnidirectional by nature — he lands on the paving cane-first and
       everything around him goes — so no facing is passed, and the radius is the event's own
       (`Controller.TUNE.diveRadius`) rather than a second copy of it here.

       `p.material` is deliberately NOT read, and this is the one subscriber for which that is
       correct. §428.4 found all three `caneSlam` subscribers dropping the field, and AUDIO and FX
       now read it — but theirs is a question about the GROUND he landed on, and this one is about
       the JAR that broke. A basket standing on limestone is still wicker. The material published
       here would be the wrong answer to the question this file asks, so `_break` resolves it from
       `KINDS[p.kind]` instead. Recorded rather than left silent: "unread and said so" is the shape
       §428.4 asks for, and an unexplained omission beside two fixed ones reads as one that was
       missed. */
    on('caneSlam', (p) => {
      if (!p?.pos) return;
      const r = Number.isFinite(p.radius) ? p.radius : TUNE.slamFallback;
      this._resolve(p.pos, null, r);
    });
  }

  /**
   * Break everything the swing reached. Returns how many went.
   *
   * `from` and `dir` are borrowed references and are not retained past this call.
   */
  _resolve(from, dir, range) {
    let n = 0;
    for (const p of this.props) {
      if (p.broken) continue;
      if (!inSwing(p.pos, from, dir, range)) continue;
      this._break(p, dir);
      n++;
    }
    for (const slot of this._dirty) this._writeMatrices(slot);
    this._dirty.clear();
    return n;
  }

  /** What a prop breaks AS. §730's urns answer `URN` — the gen arm's own jar row — so the
   *  material tag, and with it BOTH halves of the break (`Particles.smashFor` shards,
   *  `Sfx.stepFor` transient), follow the body that is actually standing there. Everything
   *  else answers `KINDS`, exactly as §729 left it. */
  _spec(p) {
    return p.urn ? URN : KINDS[p.kind];
  }

  _break(p, dir) {
    const K = this._spec(p);
    p.broken = true;
    this.broken++;
    this._dirty.add(p.slot);

    /**
     * The event, in the exact shape `tests/eventbus.test.mjs` specified for it.
     *
     * `pos` is lifted to the prop's mid-height rather than its base, because `Particles.smash`
     * treats the point as "in the air at the prop's middle" and probes DOWNWARD from it for the
     * surface to paint the mark on. Handing it the base would make that probe start inside the
     * floor. `normal` is deliberately NOT passed: `smash()` probes for the real one and its own
     * comment explains why a guessed `UP` puts a disc in mid-air.
     */
    this._emit('propSmashed', {
      pos: new THREE.Vector3(p.pos.x, p.pos.y + K.h * 0.5, p.pos.z),
      material: K.material,
      scale: K.scale,
      dir: dir ? new THREE.Vector3(dir.x, 0.35, dir.z).normalize() : null,
    });

    /**
     * Coins, through PICKUPS rather than beside it.
     *
     * `Pickups._coin` is documented as "the one event shape, and the only place it is built",
     * and `Pickups.js`'s wallet header records the specific harm a second publisher does: the
     * `coin` event feeds `Wallet.coins` AND `Health.purse` through different paths, and a
     * publisher that is not PICKUPS credits the purse and the HUD while leaving the wallet
     * behind. The two counters would then disagree silently and in a direction nothing renders.
     *
     * So this asks PICKUPS to pay, and PICKUPS stays the only module that emits `coin`.
     * Guarded: a break must not cost a frame if PICKUPS is absent (headless, early boot).
     */
    try { this.engine.get?.('pickups')?.award?.(K.value, p.pos); } catch { /* see above */ }
  }

  _emit(evt, payload) {
    try { this.engine.emit(evt, payload); }
    catch { /* a listener must never cost the player his break — Pickups._emit's own rule */ }
  }

  /* --------------------------------------------------------------------- */

  update() { /* nothing per-frame: a smashable is inert until it is hit. */ }

  /** For the debug overlay and the analysis harness. `swap` is §729's self-report: which kinds
   *  wear an imported body (with the conform scale each took) and which fell back.
   *
   *  §730 adds `vault`: the treasure room's own CENSUS, straight off the authored spots — how
   *  many destructibles the seed put in the room and of which kinds, and how many of them this
   *  boot is rendering as generated urns. Reported because "the urns in the treasure room" is
   *  only a precise instruction once that census exists, and because a boot should be able to
   *  say what it did rather than have it inferred from a mesh count. */
  debugInfo() {
    const by = {};
    for (const p of this.props) if (p.broken) by[p.kind] = (by[p.kind] || 0) + 1;
    const inRoom = {};
    for (const p of this.props) if (inCrypt(p.pos)) inRoom[p.kind] = (inRoom[p.kind] || 0) + 1;
    const vault = {
      box: CRYPT,
      spots: Object.values(inRoom).reduce((a, b) => a + b, 0),
      byKind: inRoom,
      urns: this.urns || 0,
    };
    return { placed: this.props.length, broken: this.broken, byKind: by, swap: this.swapState, vault };
  }

  dispose() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    for (const g of this._geoms) g.dispose?.();
    if (this._swapGeo) { for (const g of this._swapGeo.values()) g.dispose?.(); this._swapGeo.clear(); }
    this._urnGeo?.dispose?.(); this._urnGeo = null;   // §730: also in `_geoms` once built; safe twice
    for (const m of this._materials) m.dispose?.();
    this._atlas?.dispose?.();
    this._meshes.clear();
    this.root.removeFromParent();
    this.root.clear();
  }
}

/* Scratch — §5: the resolve allocates nothing beyond the per-break event payload, which is a
   documented exception for the same reason `Pickups._coin`'s is (AUDIO schedules a delayed read
   of `pos`, so a shared vector could be overwritten before the sound that references it exists). */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _one = new THREE.Vector3(1, 1, 1);
const _dir = new THREE.Vector3();

export default Smashables;
