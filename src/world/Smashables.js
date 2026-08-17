import * as THREE from 'three';
import { rng, WORLD_SEED } from '../core/Rand.js';
import { canopicJar, basket, chunk, place, mergeAll } from './PropKit.js';
import { COIN_VALUE } from './Pickups.js';

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
 *   jar     clay, and `stone` is the right tag for it in this palette: limestone chips into
 *           `PAL.crevice`, a `dust_ring` settles, no sparks. `SMASH.stone`.
 *   basket  wicker. `SMASH.cloth` throws NO chips — its own comment says "a basket does not
 *           produce shrapnel" — which is why a basket is worth the least: it is the quiet one.
 *   crate   `SMASH.wood`, and `PAL.woodChip` exists for exactly this and had one reader in the
 *           whole project before the SMASH table.
 */
export const KINDS = Object.freeze({
  jar:    { material: 'stone', scale: 1, value: COIN_VALUE.stack,  h: 0.58 },
  basket: { material: 'cloth', scale: 1, value: COIN_VALUE.single, h: 0.44 },
  crate:  { material: 'wood',  scale: 2, value: COIN_VALUE.pile,   h: 0.62 },
});

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
      this.props.push({
        kind: s.kind, at: s.at, ry: s.ry, broken: false,
        pos: new THREE.Vector3(s.x, s.y, s.z),
      });
    }
    this._build();
    this._wire();
  }

  /* --------------------------------------------------------------------- */

  _build() {
    for (const kind of Object.keys(KINDS)) {
      const list = this.props.filter((p) => p.kind === kind);
      if (!list.length) continue;
      const geo = this._geoFor(kind);
      if (!geo) continue;
      this._geoms.push(geo);
      const mesh = new THREE.InstancedMesh(geo, this._mat(kind), list.length);
      mesh.name = `smashable_${kind}`;
      mesh.frustumCulled = false;
      /* Half a metre of pot self-shadowing is acne, the same call `Props._collectibles` and
         `Pickups._build` both make for the same reason. */
      mesh.userData.noShadow = true;
      this.root.add(mesh);
      this._meshes.set(kind, { mesh, list });
      this._writeMatrices(kind);
    }
  }

  _geoFor(kind) {
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

  /**
   * One material per kind, mirroring `Props.MATERIALS` so this does not become a fourth clay.
   * The same construction `Pickups._mat` uses, including its fallback: SHADING may be absent in
   * a headless boot and a missing material must not cost the module its meshes.
   */
  _mat(kind) {
    const spec = {
      jar:    { name: 'smash:clay',   color: 0xd4c19a, rough: 0.62, tex: 'limestone_polished' },
      basket: { name: 'smash:wicker', color: 0xa8875c, rough: 0.95, tex: 'rope' },
      crate:  { name: 'smash:wood',   color: 0x6b4a2c, rough: 0.90, tex: 'wood_old' },
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
    if (!m) m = new THREE.MeshStandardMaterial({ color: opts.color, roughness: spec.rough, map: opts.map });
    this._materials.push(m);
    return m;
  }

  _writeMatrices(kind) {
    const entry = this._meshes.get(kind);
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
       (`Controller.TUNE.diveRadius`) rather than a second copy of it here. */
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
    for (const kind of this._dirty) this._writeMatrices(kind);
    this._dirty.clear();
    return n;
  }

  _break(p, dir) {
    const K = KINDS[p.kind];
    p.broken = true;
    this.broken++;
    this._dirty.add(p.kind);

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

  /** For the debug overlay and the analysis harness. */
  debugInfo() {
    const by = {};
    for (const p of this.props) if (p.broken) by[p.kind] = (by[p.kind] || 0) + 1;
    return { placed: this.props.length, broken: this.broken, byKind: by };
  }

  dispose() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    for (const g of this._geoms) g.dispose?.();
    for (const m of this._materials) m.dispose?.();
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
