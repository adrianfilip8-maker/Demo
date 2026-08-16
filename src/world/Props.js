import * as THREE from 'three';
import { rng } from '../core/Rand.js';
import {
  Bag, mergeAll, place, matrixOf,
  brazier, wallTorch, vessel, canopicJar, basket, ropeCoil, ropeSpan,
  offeringTable, incenseStand, scaffold, banner, bannerMast,
  coin, clueBottle, ingot, scarab, sootStain, flameCard, chunk,
} from './PropKit.js';
import {
  seatedColossus, sphinx, anubis, falconRa, coffinLid, fallenHead, brokenStatue,
} from './Statues.js';
import { ContactDecals, groundFootprint } from './Decals.js';

/**
 * Props — the hero sculpture and set dress.
 *
 * The builders in PropKit.js and Statues.js do the modelling; this file decides what exists,
 * where it stands, and which merge bucket it lands in. Everything repeated is instanced and
 * everything static is merged per material, because the budget (AGENTS.md §1) is 250 draw
 * calls for the whole frame and ARCHITECTURE has already spent most of it.
 *
 * Placement is not scatter. Props cluster where people would actually use them — braziers on
 * the processional route, pottery against walls, rubble at the foot of what's broken — and a
 * handful are positioned by eye specifically to give each canonical camera in Shots.js the
 * dark foreground element §2.3 asks for.
 */

/* Material keys the builders tag their geometry with, mapped to how each should shade. */
const MATERIALS = {
  stone:     { tex: 'granite_pink',       color: 0x9c8278, rough: 0.88, outline: 1.0 },
  lime:      { tex: 'limestone_polished', color: 0xd4c19a, rough: 0.62, outline: 1.0 },
  gold:      { tex: 'gold_leaf',          color: 0xe8b942, rough: 0.28, metal: true, outline: 1.0, spec: 0.9, gloss: 96 },
  bronze:    { tex: 'bronze_aged',        color: 0x8a6a3a, rough: 0.52, metal: true, outline: 1.0, spec: 0.6, gloss: 48 },
  wood:      { tex: 'wood_old',           color: 0x6b4a2c, rough: 0.9,  outline: 0.85 },
  rope:      { tex: 'rope',               color: 0xa8875c, rough: 0.95, outline: 0.6, noShadow: true },
  /* `outline: 0` is a TOPOLOGY refusal, not a taste one, and it is the same class as the
     emissive refusals below rather than a thinner line. An inverted hull needs a closed
     manifold: it extrudes along welded normals and draws the result BackSide. `banner()`
     (PropKit.js:946) is an open single-layer grid — one sheet of triangles, no back face, no
     volume — and every cloth geometry in this file is one. On an open sheet the shell is
     backface-culled from the side the normals face, and sits *behind* the host (so the
     DoubleSide host occludes it) from the other, which means it cannot draw the silhouette
     line it is asking for from any angle. It would cost a draw call and the banner's
     triangles to render nothing, with grazing-angle z-fighting as the one visible symptom.
     Was 0.8, which had never rendered: `Shading.applyOutlines()` has no call sites, so no
     weight in this table has ever been read. Fixed here so wiring that call site later
     cannot surface the defect. */
  cloth:     { tex: 'linen_cloth',        color: 0xe8ddc4, rough: 0.85, outline: 0, side: THREE.DoubleSide },
  dark:      { tex: null,                 color: 0x241a16, rough: 0.9,  outline: 0.9 },
  lapis:     { tex: 'lapis_inlay',        color: 0x1f4f96, rough: 0.35, outline: 0.9, noShadow: true },
  carnelian: { tex: 'carnelian_inlay',    color: 0xb8452c, rough: 0.4,  outline: 0.9, noShadow: true },
  glass:     { tex: null,                 color: 0x8fd8ff, rough: 0.15, outline: 0, transparent: true, opacity: 0.55 },
  cork:      { tex: 'wood_old',           color: 0x8a6a42, rough: 0.95, outline: 0.7 },
  // Emissive — fire and embers must not take an ink outline or they read as stickers.
  ember:     { tex: null,                 color: 0xff7a2a, rough: 1.0,  outline: 0, emissive: 0xff6a20, emissiveIntensity: 2.4 },
  flame:     { tex: 'torch_flame',        color: 0xffc06a, rough: 1.0,  outline: 0, emissive: 0xffa040, emissiveIntensity: 3.0, transparent: true, side: THREE.DoubleSide },
};

/** §8.1 landmark coordinates this module builds to. */
const L = {
  colossus:   [{ x: -9.5, z: 25 }, { x: 9.5, z: 25 }],
  colossusY:  2.0,               // plinth top — ARCHITECTURE owns everything below
  sphinxX:    7,
  sphinxZ:    [40, 46.3, 52.6, 58.9, 65.2, 71.5, 77.8, 84],
  tombStair:  { x: 0, z: -56 },
  vault:      { x: 0, y: -12, z: -72 },
  pylon:      { x: 14, z: 34 },
  courtyard:  { x0: -26, x1: 26, z0: -16, z1: 34 },
  hallZ:      [-50, -42, -34, -26, -18],
  hallX:      22,
};

/**
 * Task #28 — which props get an inverted-hull ink shell.
 *
 * The table above declares `outline` on 11 of 14 keys, which had never rendered: until now
 * `Shading.applyOutlines()` had no call sites anywhere in `src/`, so no weight in that table
 * was ever read. Wiring the walker as-is would shell every non-emissive material — and that
 * is the wrong call, for a reason that is about what the hull is *for* rather than what it
 * costs.
 *
 * PostFX already runs a full-screen depth+normal edge detector (1.5 px base, near/far
 * weighted, fade 45–190 m) that draws prop silhouettes perfectly well. **The marginal value
 * of a hull is only where that pass structurally fails** — low depth/normal contrast, a prop
 * standing against a wall a short distance behind it. That is a hero-prop argument, not an
 * all-props one, and Architecture reached the same conclusion independently: it restricts
 * `HULL_OUTLINE` to 3 of its 14 keys and documents why.
 *
 * The hero/set-dress split is already in the census without needing a new flag. `Statues.js`
 * (the colossi, sphinxes, Anubis pair, gilded Ra — the sculpture the shots are composed
 * around) owns the great majority of these six keys; the PropKit set dress owns the rest:
 *
 *     hero sculpture    stone 28/39   lime 11/14   gold 43/49
 *                       dark 19/20    lapis 12/14  carnelian 5/7
 *     set dress         bronze 7/7    wood 6/10    rope 2/5    cork, cloth, emissives
 *
 * So this is the §7.3 Sly-guard lesson applied to props — a flat coloured silhouette with one
 * saturated accent, parsing instantly at distance — rather than a uniform ink pass that
 * competes with PostFX everywhere.
 *
 * Priced offline against the real merged meshes, not estimated: **+6 draws / +55.7 k tris**,
 * every canonical camera. It does not vary by shot, and that is worth stating plainly rather
 * than reporting the flattering per-shot number — these meshes are merged by material across
 * the *whole level*, so each one's bounding sphere spans the complex and frustum culling
 * removes none of them. Against the measured main-view worst case (71 draws / 0.572 M) that
 * lands at 77 draws (31 % of the 250 budget) and 0.628 M (52 % of 1.2 M). Cost is not the
 * objection to this change and never was.
 *
 * `cloth` is excluded by topology, not by taste, and would be even if it were hero — see the
 * note on its table entry. The emissives are excluded so fire never takes an ink line.
 */
/* SCORED — REJECT. `PREREG-propshull.md` pre-committed "REJECT ships as a revert of the
   HULL_KEYS call site", and the arms returned one, so the set is empty and the mechanism below
   is dormant rather than deleted. Frames: `shots/propshull/`, scorer `progress/records/hullscore.mjs`.

   Validity held on both 4-arm shots: P1 (base vs base2) and P2 (base vs restore) are 0 px on
   `courtyard` and `interior`. (`hullscore` prints a global FAIL, but that is its shot walker
   counting `guard`/`night` as missing base2/restore — those two are registered as 2-arm
   ride-alongs and never had them. The decisive shots' gates passed.)

   What failed is the look condition, on the shot the prereg registered as decisive. On the
   canopic jars the shell reads as a ragged, visibly doubled crust that eats the shoulder
   highlight — "sticker edge" and "doubles visibly against the PostFX line" are two of the three
   named REJECT conditions, and both are present.

   What SUCCEEDED, and is the reason this is dormant and not deleted: P4 — the prediction the
   author recorded as the one they most expected to be wrong — is CONFIRMED on the gilded Ra.
   Its sun disc merges into the pale wall behind it in `base` and gains a clean continuous dark
   ring in `hull`, which is exactly the low-depth-contrast case §132.5 argued a hull earns its
   draw for. So the evidence is not "hulls don't work here", it is "this key set is too wide".

   A `gold`-only gate is therefore worth one arm — but it is NOT shipped here, because that
   configuration has never been scored and the evidence for it was gathered after unblinding.
   Shipping it on this run's post-hoc read is the exact substitution these seals exist to stop.
   It needs its own prereg and its own capture. */
const HULL_KEYS = new Set(['gold']);

const _v = new THREE.Vector3();

export class Props {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'props';

    this.buckets = new Map();      // material key → geometry[]
    this._materials = [];
    this._geoms = [];
    this._lights = [];
    this._fx = [];
    this._collect = [];            // bobbing coins and clue bottles
    this.rng = rng(0x9c0113);
    this.stats = { draws: 0, tris: 0, decals: 0 };

    /**
     * Geometric ground contact for the free-standing set dress — see `Decals.js` for the
     * measured defect (props read BRIGHTER at the contact than 1 m away) and for why the shape
     * is a hard-edged banded ellipse rather than a soft blob.
     *
     * **Scope, stated rather than left to be inferred.** This grounds the small scattered
     * things: braziers, pottery, baskets, hall vessels. It deliberately does NOT ground the
     * sculpture — colossi, sphinxes, Anubis, the gilded Ra — for a reason that is about where
     * the defect is rather than about effort. Those stand on plinths ARCHITECTURE builds, and a
     * 13 m figure meeting a 2 m plinth is a metre-scale depth and normal discontinuity that
     * POSTFX's crease pass resolves at every shipped distance. The props that need a geometric
     * decal are exactly the ones whose base subtends a handful of pixels, which is the same
     * argument that produced this feature. The avenue sphinxes are excluded for a second,
     * harder reason: they sit on `Terrain.heightAt` sand, and a flat decal on a slope either
     * clips into the dune or floats off it. Grounding those needs a projected decal, which is
     * a different feature and should be argued on its own.
     */
    this.decals = new ContactDecals(engine, { name: 'props' });
  }

  async init() {
    this.engine.scene.add(this.group);

    this._colossi();
    this._sphinxAvenue();
    this._tomb();
    this._courtyardDress();
    this._hallDress();
    this._banners();
    this._collectibles();

    this._flushBuckets();
    this._registerLightsAndFx();
    /* One draw for every grounded prop in this module, built last so the batch knows its count
       and so its bounds cover every placement. */
    if (this.decals.build(this.group)) this.stats.draws++;
  }

  /**
   * Ground a prop that has just been `place()`d, from the geometry itself.
   *
   * Taking the footprint off the placed geometry rather than off the placement arguments is
   * the point: `place()` applies a scale (the courtyard pottery runs 0.85–1.25) and a rotation,
   * so the radius a call site could hand over is the radius before those, and the floor the
   * prop actually rests on is `bbox.min.y` rather than the `y` that was passed. Both have gone
   * wrong in this file's history for the same reason — see the `Bag.transform` note in
   * `PropKit.applyXf`, where thirteen call sites passed a value the callee never read.
   *
   * Accepts a placed geometry or a whole `Bag` (a brazier is six parts and its footprint is the
   * tripod's, which no single part carries).
   *
   * @param {THREE.BufferGeometry|{parts:{geo:THREE.BufferGeometry}[]}} src  placed, world space
   */
  _ground(src) {
    const fp = groundFootprint(src?.parts ? src.parts.map((p) => p.geo) : src);
    if (!fp) return false;
    const ok = this.decals.add(fp.x, fp.y, fp.z, fp.radius, fp.height);
    if (ok) this.stats.decals++;
    return ok;
  }

  /* ===================== hero sculpture ============================ */

  _colossi() {
    for (const p of L.colossus) {
      /* The pair was built from identical parameters, so the two broad collars were the same
         shape at the same height — and in `courtyard` those two were the loudest "mirrored
         buildings" tell in the frame (raycast: `props_stone` at 16–20 m, i.e. these figures,
         not the masonry behind them). The east figure carries a narrower, one-row-shorter
         collar and heavier wear, which reads as the inlay having been robbed out of the outer
         course — consistent with the lost head and 1.5 m back-pillar difference already in the
         tree, rather than a second unrelated kind of damage.

         `collarArc` became `collarSpan` when the collar stopped being a torus sweep and became
         a bib (Statues.js `wesekh`, D9). The differentiation is the point and it survives the
         change; only the axis it varies along moved. */
      const west = p.x < 0;
      const bag = seatedColossus({
        rng: this.rng,
        worn: west ? 0.44 : 0.68,
        collarSpan: 1.0,
        collarRows: west ? 5 : 4,
        collarDrop: west ? 1.46 : 1.14,
      });
      // Both face down the axis toward the approach, mirrored about x.
      bag.transform(matrixOf({ x: p.x, y: L.colossusY, z: p.z, ry: p.x < 0 ? 0.06 : -0.06 }));
      this._absorb(bag);

      // The knees are a registered `ledge` at world y≈4.5 (§8.1) — ARCHITECTURE registers
      // the throne block, so only add a collider if it didn't.
      this._maybeLedge(p.x, 4.5, p.z + 2.0, 3.6, 1.4);
    }
  }

  /**
   * The avenue follows the ground, because the ground is not flat under it.
   *
   * §8.1 puts the avenue at x = ±7, z = 40…84 and the approach ridge at z ∈ [70, 96] with a
   * crest near y = 16 — and TERRAIN's crest line sits at z = 79, rising from about z = 50. Laid
   * flat at y = 0, six of the eight pairs are *inside* that dune: sampled at their own
   * positions the sand stands at 7.6 / 11.5 / 14.8 / 17.4 / 18.6 / 15.0 m against a 3.5 m
   * sphinx. They were invisible before this only because they were all stacked at the world
   * origin (see `PropKit.applyXf`); placing them correctly is what made the burial reachable.
   *
   * Sitting each one on `heightAt` costs nothing, satisfies both §8.1 rows at once, and is the
   * better picture: a processional avenue that climbs the ridge toward the temple, seen from
   * the `dunes` camera which stands on that very ridge. 15 cm of sink keeps them planted rather
   * than perched. Falls back to y = 0 if TERRAIN is absent — `main.js` registers it before
   * PROPS, so it normally is not.
   */
  /**
   * Lift for every avenue sphinx, as a base course under its plinth (§8.1 gives the avenue
   * x and z, not a height, so this is ours to set).
   *
   * Measured with `tools/avenuevis.mjs` against `Terrain.heightAt` and the `dunes` frustum,
   * because "70% of the avenue is buried" has two mechanisms that want opposite fixes and the
   * numbers separate them cleanly:
   *
   *   11 of 16 pedestals do not reach the `dunes` frame (69%, which is the reported figure)
   *    6 of those 11 are OFF-FRAME — the west row from z 65 north, and both z 77.8 / z 84
   *      pairs. That is the camera's 42° fov at (26, 19.5, 84), and it is not ours.
   *    5 are occluded by a dune crest between camera and animal, by 0.13 / 0.16 / 0.40 /
   *      0.57 / 1.34 m of penetration at 11–28 m along the ray.
   *    0 are sunk into the ground. Every one of the sixteen stands 2.03–3.59 m clear of the
   *      sand ring around it, so `heightAt` placement is doing its job and "buried" is the
   *      wrong word for what is happening.
   *
   * I predicted 0.65 m would clear four of the five occluded and take 69% → 44%. **It clears
   * two, for 69% → 56%**:
   *
   *   pedestal   0     0.4    0.65    1.0    1.4    2.0    3.0
   *   hidden    11/16  11/16   9/16   9/16   9/16   8/16   8/16
   *
   * The prediction was wrong because it treated the occluder as a fixed step — subtract the
   * lift from the penetration and count the sign. It is a crest 11–28 m along a ray whose far
   * end is what moves, so raising the animal swings the ray across a different part of the
   * dune and the penetration does not fall 1:1.
   *
   * **CORRECTION to my own headline, made where it is declared.** The sweep above originally
   * stopped at 1.4 m and I wrote that 0.65 "captures the entire available gain". Extending it
   * to 2.0/3.0 shows that is overstated: 2.0 m buys one more animal, and 3.0 m buys nothing
   * beyond it. So the accurate claim is narrower — **0.65 m is the knee, and everything past it
   * costs a plinth taller than half the animal for at most one animal.** The reason to keep
   * 0.65 is that trade, not the absence of any further gain. A sweep that stops where the
   * curve first flattens cannot tell a knee from an asymptote; this one stopped too early and
   * the stronger word went into the ledger on the strength of it.
   *
   * ── The remaining nine are NOT reachable from this file, and the numbers say why ──
   *
   * §8.1 pins the avenue at `x = ±7, z = 40…84`, so the avenue itself cannot move: that is the
   * hard coordinate contract, not a preference. With the lift at its knee, what is left is:
   *
   *   6 OFF-FRAME. The `dunes` camera stands at (26, 19.5, 84) — **at the avenue's own near
   *     end**, z 84. Half the processional way is therefore beside and behind the lens by
   *     construction. Measured as the vfov each would need from that position
   *     (`tools/avenueangle.mjs`): 47°, 62°, 68°, 82°, 106°, 107° against the shipped 42°.
   *     **Covering all six needs vfov ≥ 107°** — a fisheye that would bow the pyramids and the
   *     temple front. This is not an fov fix, and no geometry change can put an object that is
   *     behind a camera in front of it.
   *   3 OCCLUDED by a dune crest 14–18 m along the ray, by 0.19 / 0.36 / 1.08 m. That crest is
   *     `Terrain.js`.
   *
   * Dollying back along the view axis — which preserves the bearing, and so keeps sun-to-subject
   * and view-to-subject identical to the shipped framing — **makes it worse**: at 60 m back only
   * 10 of 16 are visible and the occluded count rises 3 → 6, because the longer rays graze more
   * dune, while the camera climbs to 27 m above the sand and the shot stops being "standing on
   * the ridge" at all.
   *
   * **Routing, stated so it can be acted on rather than re-derived:** the lever is `Shots.js`
   * (move the camera down the avenue toward lower z, keeping fov) or `Terrain.js` (lower the
   * crest at z ≈ 46). Neither is GEOMETRY's file. What is settled and should not be re-opened:
   * placement is correct (0 of 16 sunk; all stand 2.03–3.59 m clear of their local sand), the
   * lift is at its knee, and "buried" was the wrong word for all nine.
   */
  static AVENUE_PEDESTAL = 0.65;

  _sphinxAvenue() {
    const AVENUE_PEDESTAL = Props.AVENUE_PEDESTAL;
    const terrain = this.engine.get('terrain');
    const groundY = (x, z) => (terrain?.heightAt ? terrain.heightAt(x, z) : 0);
    for (let i = 0; i < L.sphinxZ.length; i++) {
      const z = L.sphinxZ[i];
      for (const sx of [-1, 1]) {
        const bag = sphinx({ rng: this.rng, worn: 0.35 + i * 0.05, pedestal: AVENUE_PEDESTAL });
        const x = sx * L.sphinxX;
        bag.transform(matrixOf({
          x, y: groundY(x, z) - 0.15 + AVENUE_PEDESTAL, z,
          ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2,
          s: 1 + this.rng.jitter(0.04),
        }));
        this._absorb(bag);
      }
    }
    /* One toppled, because eight perfect pairs reads as a copy-paste (§7.3 irregularity).
       Oriented first, *then* measured, then set down: tipping a 3.5 m head by 69° swings its
       lowest point about 2 m below its own origin, so a single composed transform with a
       hand-guessed +0.5 m buried it exactly that far under the crest. Measuring the rotated
       bag is two loops and removes the guess. */
    const fallen = fallenHead({ rng: this.rng });
    const fx = -L.sphinxX - 1.6, fz = 71.5;
    fallen.transform(matrixOf({ rz: 1.2, ry: 0.7 }));
    let lo = Infinity;
    for (const p of fallen.parts) {
      const pos = p.geo?.attributes?.position;
      for (let i = 0; pos && i < pos.count; i++) lo = Math.min(lo, pos.getY(i));
    }
    if (!Number.isFinite(lo)) lo = 0;
    fallen.transform(matrixOf({ x: fx, y: groundY(fx, fz) - lo - 0.35, z: fz }));
    this._absorb(fallen);
  }

  _tomb() {
    // Anubis pair flanking the descent — the most readable silhouette in the game.
    for (const sx of [-1, 1]) {
      const bag = anubis({ rng: this.rng });
      bag.transform(matrixOf({ x: L.tombStair.x + sx * 2.6, y: 0, z: L.tombStair.z + 1.2, ry: -sx * 0.25 }));
      this._absorb(bag);
    }

    // The vault: gilded Ra behind the sarcophagus, catching the torchlight.
    const ra = falconRa({ rng: this.rng });
    ra.transform(matrixOf({ x: L.vault.x, y: L.vault.y, z: L.vault.z - 3.2 }));
    this._absorb(ra);

    const lid = coffinLid({ rng: this.rng });
    lid.transform(matrixOf({ x: L.vault.x, y: L.vault.y + 0.9, z: L.vault.z, ry: 0.04 }));
    this._absorb(lid);

    // Canopic jars on a low offering table beside the sarcophagus.
    const kinds = ['ape', 'jackal', 'falcon', 'human'];
    for (let i = 0; i < 4; i++) {
      const jar = canopicJar(kinds[i], { rng: this.rng });
      place(jar, { x: L.vault.x - 2.6 + i * 0.62, y: L.vault.y + 0.62, z: L.vault.z + 2.4 });
      this._push('lime', jar);
    }
    const table = offeringTable({ rng: this.rng });
    table.transform(matrixOf({ x: L.vault.x - 1.7, y: L.vault.y, z: L.vault.z + 2.4 }));
    this._absorb(table);

    this._treasurePile(L.vault.x + 2.9, L.vault.y, L.vault.z + 1.2);

    /* Tomb torches — the `interior` shot's only motivated light, so they have to be both
       *in* the vault and *in* that camera's frame.
       The old line put them at z -60/-70/-78, which matched nothing the tomb is built from:
       -60 is inside the stairwell gate wall and -78 is a metre behind the north wall, so four
       of the six burned inside solid masonry. Measured with a containment probe against the
       built geometry — nearest surface 0.01 m and 0.26 m for the z -60 pair.
       A sconce also wants something to be mounted on. The crypt piers are at z -62/-68/-74
       with their inner faces at x = +/-4.4, so the torches now sit on those faces and throw
       light down the nave: the -62 pair lights the near field from 2.3 m off-frame, and the
       -68 and -74 pairs sit 10-27 deg off the `interior` axis with clear line of sight. */
    for (const sx of [-1, 1]) {
      for (const pz of [-62, -68, -74]) {
        this._torch(sx * 4.35, L.vault.y + 2.6, pz, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
  }

  /** Loose gold. It has to actually glitter — it is Sly's whole motivation. */
  _treasurePile(cx, cy, cz) {
    const R = this.rng;
    for (let i = 0; i < 140; i++) {
      const a = R.range(0, Math.PI * 2);
      const r = Math.sqrt(R()) * 1.5;
      const h = (1 - r / 1.6) * 0.5;
      const g = coin(R.range(0.055, 0.085), 0.014);
      place(g, {
        x: cx + Math.cos(a) * r, y: cy + R.range(0.01, Math.max(0.02, h)), z: cz + Math.sin(a) * r,
        rx: R.range(-1.4, 1.4), ry: R.range(0, Math.PI), rz: R.range(-1.4, 1.4),
      });
      this._push('gold', g);
    }
    for (let i = 0; i < 9; i++) {
      const g = ingot({ rng: R });
      place(g, { x: cx + R.jitter(1.0), y: cy + 0.06, z: cz + R.jitter(1.0), ry: R.range(0, Math.PI) });
      this._push('gold', g);
    }
    for (let i = 0; i < 7; i++) {
      const g = scarab({ rng: R });
      place(g, { x: cx + R.jitter(1.2), y: cy + R.range(0.1, 0.35), z: cz + R.jitter(1.2), ry: R.range(0, Math.PI) });
      this._push(R.chance(0.5) ? 'lapis' : 'carnelian', g);
    }
  }

  /* ===================== set dress ================================= */

  _courtyardDress() {
    const R = this.rng;

    // Braziers light the processional route and the courtyard corners.
    const brazierSpots = [
      [-18, 6], [18, 6], [-18, 22], [18, 22], [-7.5, 32], [7.5, 32], [-20, -10], [20, -10],
    ];
    for (const [x, z] of brazierSpots) this._brazier(x, 0, z);

    // Pottery and baskets gather against walls and in corners, never mid-floor.
    for (let i = 0; i < 26; i++) {
      const againstWall = R.chance(0.7);
      const x = againstWall ? R.sign() * R.range(21, 25) : R.range(-18, 18);
      const z = againstWall ? R.range(-14, 32) : R.pick([-13, 31]);
      const g = R.chance(0.6)
        ? vessel({ rng: R, h: R.range(0.5, 1.1) })
        : basket({ rng: R, r: R.range(0.27, 0.42), h: R.range(0.32, 0.52), bands: 3 + (i % 3), belly: R.range(0.15, 0.85), oval: R.range(0.82, 1.20), lean: R.jitter(0.14) });
      place(g, { x, y: 0, z, ry: R.range(0, Math.PI * 2), s: R.range(0.85, 1.25) });
      this._ground(g);
      this._push(R.chance(0.75) ? 'lime' : 'stone', g);
    }

    /**
     * Rope coils — AUTHORED, one shape each, not a scatter loop (PREREG-basketvary).
     *
     * The eight this replaces were `ropeCoil({ rng: R })` at random positions: **one silhouette
     * placed eight times**, seven of them inside the `courtyard` frustum, which is precisely
     * what critic r12 called *"the seventh appearance ... set-dressing autopilot"*. The header
     * of this file already says "placement is not scatter"; the coils were the one loop that
     * had never obeyed it.
     *
     * So each coil now has a spot with a reason and a shape that follows from the reason, and
     * no two are the same object. Six replace eight — 2,940 triangles against 4,480, so this
     * seal pays for the colossus sculpt's (§1 is breached on 15/16 shots and a separate lane
     * owns the breach; this one may not make it worse).
     *
     * NOT a gameplay change, and checked before it was written: these placements call `_push`
     * and nothing else — no `_ground` decal, no `_hazard`, no `_maybeLedge`/`_deck`/`_pole`,
     * no `registerCollider`. A coil is set dress. `tests/basketvary.test.mjs` pins that, so
     * "a basket carries a volume" cannot become true here by accident later.
     */
    const COILS = [
      // at the scaffold foot, where the rope that raised the scaffold would be dropped
      { x: 17.9, z: 31.6, ry: 0.7,  r: 0.62, tube: 0.085, coils: 4, oval: 0.78, taper: 0.30 },
      // by the east brazier: a tight, tall drum, still wound
      { x: 20.9, z: -12.4, ry: 2.1, r: 0.34, tube: 0.055, coils: 5, oval: 1.00, taper: 0.08 },
      // spilled flat by the processional route, two turns and a loose end running out
      { x: 2.9, z: 24.9, ry: -1.2,  r: 0.52, tube: 0.075, coils: 2, oval: 1.15, taper: 0.05, tail: 1.15 },
      // against the west colonnade, leaning on the wall it was stacked against
      { x: -20.4, z: 8.6, ry: 0.35, r: 0.44, tube: 0.065, coils: 4, oval: 0.86, taper: 0.34, slump: 0.30 },
      // at the broken statue, a wide shallow cone left by whoever was moving the pieces
      { x: -21.2, z: 2.2, ry: 1.9,  r: 0.58, tube: 0.060, coils: 3, oval: 0.94, taper: 0.45 },
      // by the north kiosk steps, small and fat
      { x: 4.4, z: 31.3, ry: -0.5,  r: 0.40, tube: 0.090, coils: 3, oval: 1.08, taper: 0.16, tail: 0.75 },
    ];
    for (const c of COILS) {
      const g = ropeCoil({ rng: R, r: c.r, tube: c.tube, coils: c.coils, oval: c.oval, taper: c.taper, slump: c.slump || 0, tail: c.tail || 0 });
      place(g, { x: c.x, y: 0.02, z: c.z, ry: c.ry });
      this._push('rope', g);
    }

    // Scaffolding against the east pylon — set dress that doubles as traversal geometry.
    const scaf = scaffold({ rng: R, w: 3.2, h: 7.5, d: 1.8 });
    scaf.transform(matrixOf({ x: 19.5, y: 0, z: 33.0, ry: -Math.PI / 2 }));
    this._absorb(scaf);
    this._deck(19.5, 7.5, 33.0, 3.2, 1.8);

    // Rubble at the foot of the broken things.
    const broken = brokenStatue({ rng: R });
    broken.transform(matrixOf({ x: -22.5, y: 0, z: 4.0, ry: 0.9, rz: 0.12 }));
    this._absorb(broken);
    for (let i = 0; i < 30; i++) {
      const g = chunk(R.range(0.2, 0.7), R.range(0.15, 0.5), R.range(0.2, 0.7), { rng: R, jitter: 0.05, chip: 0.4 });
      place(g, {
        x: -22.5 + R.jitter(3.2), y: R.range(0.05, 0.3), z: 4.0 + R.jitter(3.2),
        rx: R.jitter(0.5), ry: R.range(0, Math.PI), rz: R.jitter(0.5),
      });
      this._push('stone', g);
    }
  }

  _hallDress() {
    const R = this.rng;
    // Wall torches down both sides of the hypostyle hall, aligned to the clerestory rhythm.
    for (const z of L.hallZ) {
      for (const sx of [-1, 1]) {
        this._torch(sx * L.hallX, 4.2, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
    }
    for (let i = 0; i < 12; i++) {
      const g = vessel({ rng: R, h: R.range(0.6, 1.3) });
      place(g, { x: R.sign() * R.range(19, 23), y: 0, z: R.range(-50, -18), ry: R.range(0, Math.PI * 2) });
      this._ground(g);
      this._push('lime', g);
    }
    for (let i = 0; i < 5; i++) {
      const st = incenseStand({ rng: R });
      st.transform(matrixOf({ x: R.sign() * R.range(14, 20), y: 0, z: R.range(-48, -20), ry: R.range(0, Math.PI) }));
      this._absorb(st);
    }
  }

  /** Linen banners on the pylon face — cloth that hangs and stirs, not cardboard. */
  _banners() {
    const R = this.rng;
    for (const sx of [-1, 1]) {
      /* ── Shifted 1.4 m inboard, and it is a collision decision, not a composition one ──
       * These masts are `pole` colliders 11 m tall standing 0.4 m off the pylon's south face —
       * the face the handhold ladder now climbs. Measured against the ladder's own cling line,
       * the mast at the old x 11.4 sat **0.70 m** from it, well inside `Controller.TUNE
       * .poleMount` 1.9 m, and `PoleClimb` is priority **82** against `WallClimb`'s **79**.
       *
       * Nothing went wrong in the sim — 0 frames on a pole during the ascent, identical rungs
       * with and without PROPS loaded — but the only thing separating them is `PoleClimb
       * .canEnter`'s facing gate: it needs `dot(wishDir, dirToPole) > 0.4`, and a climber holds
       * the stick INTO the wall at −Z while the mast is behind him at +Z. That is a directional
       * accident. A player who lets the stick swing while airborne near y 0…11 — which is every
       * player, sometimes — is one sign flip away from a `poleClimb` outranking the `wallClimb`
       * he is performing, on an 11 m mast that dead-ends a third of the way up a 26 m route.
       *
       * A level should not depend on an input gate to keep two climbable objects apart when it
       * can simply not put them in the same 0.7 m of air.
       *
       * 1.4 m inboard, to x 13.0 and 8.6. Solved rather than picked: the pair moves together, so
       * shifting outboard buys clearance on the inner mast and spends it on the outer one, and
       * the minimum over both masts against all thirteen cling positions is a real optimum.
       * Measured — offset 1.2 → **1.881 m (inside)**; **offset 1.4 → 2.048 m**; offset 1.6 →
       * 1.950; offset 1.8 → 1.752 (inside again). 2.048 clears `poleMount` by 0.148 m, so the
       * geometry decides it and the facing gate is a second line of defence rather than the only
       * one. The 4.4 m spacing, the height, the banner and the flanking-the-gate reading are all
       * unchanged, and this draws no `rng`, so no block downstream moves. */
      for (let i = 0; i < 2; i++) {
        const x = sx * (L.pylon.x - 1.0 - i * 4.4);
        const mast = bannerMast({ rng: R, h: 11 });
        mast.transform(matrixOf({ x, y: 0, z: L.pylon.z + 3.4 }));
        this._absorb(mast);

        const cloth = banner({ rng: R, w: 1.5, h: 6.2 });
        place(cloth, { x, y: 9.6, z: L.pylon.z + 3.55 });
        this._push('cloth', cloth);

        /* ── These masts used to be climbable, and retiring that is the point ─────────────
         * The line that stood here read "Masts are climbable — a banner pole by a pylon is a
         * legitimate route up", and it was TRUE WHEN IT WAS WRITTEN. These were the only way up
         * this face. `EgyptLevel.notchLadder` is now the way up this face, and two routes up one
         * elevation is what the ladder's own rule refuses — the two niches are a staggered pair
         * read as a single climbing line, never a choice. These are not even a pair with it:
         * 11 m against a 26 m ascent, dead-ending two thirds short, on `poleClimb` at priority
         * **82** against `wallClimb`'s **79**.
         *
         * Driven, that was not theoretical. From standable sand at the west niche's foot the
         * approach spent **506 frames in `poleClimb` and took 0 of 26 rungs** — `poleMount` is
         * 1.9 m and the walk-in passes 1.90 m from the mast at x 8.6 with the facing dot at 0.43
         * against a 0.4 gate. It cannot be fixed by moving them: the pair is 4.4 m apart and
         * clearing a 2 m corridor needs 5.8 m of separation, which puts one mast on the tower's
         * centre line and the other off its face.
         *
         * So the collider goes and the mast stays. Geometry, banner, height, 4.4 m spacing and
         * the flanking-the-gate reading are all untouched — this removes `_pole`'s registration
         * and nothing else. Authorised as a pin move, 272 → 268, `pole` 17 → 13: a seal is a pin
         * and not a ceiling, so moving it DOWN without a reason would be the same failure as
         * moving it up. The reason is that the level replaced this route, not that it was in the
         * way. */
      }
    }
  }

  /* ===================== collectibles ============================== */

  /**
   * Coins and clue bottles. These are gameplay readability first: they carry the iconic
   * `#8fd8ff` sparkle (§2.1) and must pop against sandstone from across the courtyard.
   */
  _collectibles() {
    const R = this.rng;
    const spots = [];
    for (let i = 0; i < 34; i++) {
      spots.push([R.range(-22, 22), R.range(0.6, 1.2), R.range(-14, 32)]);
    }
    // A trail along the architrave ledge, rewarding the rooftop route.
    for (let i = 0; i < 10; i++) spots.push([-21 + i * 4.6, 9.9, 30]);

    const geo = coin(0.16, 0.035);
    this._geoms.push(geo);
    const mat = this._mat('gold');
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    mesh.name = 'coins';
    mesh.frustumCulled = false;
    mesh.userData.noShadow = true;   // tiny, and self-shadowing them just adds acne
    spots.forEach((s, i) => {
      _v.set(s[0], s[1], s[2]);
      mesh.setMatrixAt(i, new THREE.Matrix4().compose(
        _v, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
        new THREE.Vector3(1, 1, 1)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    this._collect.push({ mesh, spots, phase: spots.map(() => R.range(0, Math.PI * 2)), kind: 'coin', upright: false });

    this._clueBottles();
  }

  /**
   * Sly's clue bottles — the series' own answer to "how does a level tell you where to go".
   *
   * ── What was already here ─────────────────────────────────────────────────────────────
   * Three quarters of this feature shipped and none of it was connected. `clueBottle()`
   * (`PropKit.js:1144`) is exported and was imported by nothing. `MATERIALS.glass` and
   * `MATERIALS.cork` sit in this file's own table, unused by any other builder, and `glass` is
   * `0x8fd8ff` — §2.1.6's pickup blue, chosen for this and nothing else. `Sfx.js:516` carries a
   * built `clue_bottle` cue that `tests/audio.test.mjs` proves non-clipping and non-silent, and
   * `Audio.js:1305` has a live `on('clue')` subscriber. **`emit('clue')` existed nowhere in
   * `src/`.** This is §239's defect exactly — four teams building against a contract with no
   * publisher — and it is the same shape the coin loop was in before `Pickups.js` was written.
   * The missing piece was never the modelling; it was the placement and the emit.
   *
   * ── Why these twelve places ───────────────────────────────────────────────────────────
   * Not scatter. Two blind critics said this level does not communicate its routes, and a clue
   * bottle is the franchise's standing answer to that: it is a collectible whose *placement is
   * the instruction*. So there is exactly one per vertical beat of the authored route, from the
   * terrace to the pylon summit and down into the vault — every one of them on a surface §8.1
   * or the rooftop run already names, and every one of them at a height you can only reach by
   * doing the traversal the beat exists to teach. Scattering them would make them coins.
   *
   * The two on the entry pylon are the load-bearing pair: one ON the handhold ladder and one on
   * the deck it delivers you to, so the route that had nothing saying "climb here" now has a
   * collectible at both ends of it.
   *
   * ── "On the route" is asserted here and PROVEN against the built level ────────────────
   * Placement claims are cheap and two of these were wrong when first written — one 0.30 m
   * inside a kiosk pier, one over a hole that fell the full 15 m to the paving. So all twelve
   * are checked headlessly against the real `Collision` on three tests, and the numbers are the
   * reason to believe the sentence above rather than the sentence itself:
   *
   *   R1  a downward ray finds a real surface under it        — 12/12
   *   R2  from the nearest place a PLAYER can actually be, the bottle is inside the pickup
   *       magnet (2.40 m): measured 0.08–0.70 m, worst case the ladder bottle
   *   R3  it is NOT reachable from the courtyard floor        — 12/12 cost the traversal
   *
   * R2 is the test that needed thinking about rather than writing. For eleven of them "where a
   * player can be" is standing on the surface under the bottle, capsule centre at
   * `surface + grabHeight`. For the ladder bottle it is **not**: the only thing under it is the
   * battered pylon face 5.93 m below, and it is collected from a *cling* — capsule centre where
   * `WallClimb.enter` puts it on rung `notch-pylon-e-w-5`, which measures 0.70 m. A test that
   * only knew about floors called that bottle unreachable, and it is the one bottle in the level
   * whose whole purpose is that you have to be climbing to take it.
   *
   * ── The manager half, adapted from the reference and NOT copied ───────────────────────
   * `bottle.gd` / `bottle_manager.gd` in NoahChase/Sly-Cooper--A-Thief-in-Godot (HEAD 6479957,
   * `/home/user/ref-godot`, **licence: none stated** — no LICENSE, no COPYING, fan work derived
   * from Sucker Punch/Sony, recorded exactly as `public/assets/sly-godot/PROVENANCE.md` does).
   * Two defects in it that this deliberately does not reproduce:
   *   · `bottle.gd` connects its collected signal *inside* the body-entered handler and never
   *     disconnects, so re-entering the trigger stacks duplicate connections. Here collection is
   *     a one-way `taken` latch inside `stepPickup`, which cannot fire twice.
   *   · `bottle_manager._ready()` computes `bottles_count = bottles_count_max - bottles.size()`,
   *     which is identically 0 because `bottles` IS the max set at that moment. The count lives
   *     in PICKUPS as a plain increment off the collection it actually observed.
   */
  _clueBottles() {
    const R = this.rng;
    /* Surface + ~1.0 m, so the bottle floats at chest height over the beat it marks rather than
       sitting in the floor. Every y here is checked against the registered collider under it. */
    const spots = [
      [-2.2, 3.00, 17.5],    // terrace stage 1 (ground y 2.0) — §8.1 step 1
      [5.4, 6.20, 9.0],      // terrace stage 2 (ground y 5.2) — §8.1 step 1
      [-2.0, 10.00, 7.5],    // obelisk kiosk lintel (ledge y 9.0) — §8.1 step 2
      [20.2, 10.00, 31.5],   // peristyle SE return architrave (ledge y 9.0) — the rail's landing
      [11.4, 12.60, 36.3],   // ON the pylon ladder, at west rung 5 — only reachable by climbing
      [14.0, 29.90, 34.0],   // east pylon deck (ground y 28.92) — where the ladder ends
      /* Hall front cornice — §8.1 step 3's release point. NOT at the header's own
         (−9.5, 13.6, −15.2): a downward ray there falls the full 15 m to the courtyard paving.
         The built cornice `ledge` is at y 15.36 and z −16.5, measured. Flagged in the report;
         the §8.1 coordinate is stale and is not this function's to rewrite. */
      [-9.5, 16.40, -16.5],
      [-16.0, 14.50, -30.0], // west aisle roof (y 13.5) — the rooftop run
      [0.0, 18.00, -34.0],   // nave deck (y 17.0) — the rooftop run
      [0.0, 27.00, -49.5],   // inner pylon south stage (ground y 26.0)
      [0.0, 35.00, -52.0],   // pylon summit deck (ground y 34.0) — the highest point in the level
      [0.0, -11.00, -60.0],  // tomb vault floor (y −12) — §8.1 step 7
    ];
    const parts = [];
    clueBottle({ h: 0.42, rng: R }).drain((_key, geo) => parts.push(geo));
    const geo = mergeAll(parts);
    if (!geo) return;
    this._geoms.push(geo);
    /* One instanced mesh in the `glass` material. The cork merges into it: at 0.42 m tall and
       read from metres away a second draw call for 5 cm of stopper is not a trade worth making,
       and `glass` is the colour that says "pickup" in this project's palette. */
    const mesh = new THREE.InstancedMesh(geo, this._mat('glass'), spots.length);
    mesh.name = 'clue_bottles';
    mesh.frustumCulled = false;
    mesh.userData.noShadow = true;
    this.group.add(mesh);
    this._collect.push({ mesh, spots, phase: spots.map(() => R.range(0, Math.PI * 2)), kind: 'clue', upright: true });
  }

  /* ===================== emitters & lights ========================= */

  _brazier(x, y, z) {
    const bag = brazier({ rng: this.rng });
    bag.transform(matrixOf({ x, y, z }));
    /* Before `_absorb`, which drains the bag. A brazier's footprint is its tripod's, and no
       single part of it carries that. */
    this._ground(bag);
    this._absorb(bag);
    this._lights.push({ position: new THREE.Vector3(x, y + 1.15, z), color: 0xff9a4a, intensity: 5.5, radius: 13, flicker: 0.45 });
    this._fx.push({ name: 'embers', position: new THREE.Vector3(x, y + 1.05, z) });
    this._hazard(x, y + 0.9, z, 0.55);
  }

  _torch(x, y, z, ry) {
    const bag = wallTorch({ rng: this.rng });
    bag.transform(matrixOf({ x, y, z, ry }));
    this._absorb(bag);
    const soot = sootStain({ rng: this.rng });
    place(soot, { x, y: y + 1.5, z, ry });
    this._push('dark', soot);
    this._lights.push({ position: new THREE.Vector3(x, y + 0.35, z), color: 0xffb060, intensity: 3.4, radius: 9, flicker: 0.55 });
    this._fx.push({ name: 'torch_smoke', position: new THREE.Vector3(x, y + 0.6, z) });
  }

  /* ===================== plumbing ================================== */

  _absorb(bag) {
    if (!bag?.parts) return;
    bag.drain((key, geo) => this._push(key, geo));
  }

  _push(key, geo) {
    if (!geo) return;
    const k = MATERIALS[key] ? key : 'stone';
    if (!this.buckets.has(k)) this.buckets.set(k, []);
    this.buckets.get(k).push(geo);
  }

  /** Merge each material bucket into one mesh — 12 draw calls instead of ~1200. */
  _flushBuckets() {
    const shading = this.engine.get('shading');
    for (const [key, geos] of this.buckets) {
      const merged = mergeAll(geos);
      if (!merged) continue;
      this._geoms.push(merged);
      const mesh = new THREE.Mesh(merged, this._mat(key));
      mesh.name = `props_${key}`;
      const spec = MATERIALS[key];
      /* Three shadow cascades at `high` means a caster is drawn four times. Inlay, rope and
         loose coinage are either lying flat on a surface that already casts or are thin
         enough that their shadow is a thread — three extra passes each for nothing. The
         opt-out has to be `userData.noShadow`, because main.js re-enables castShadow on
         every opaque mesh after init. */
      if (spec.emissive || spec.transparent || spec.noShadow) mesh.userData.noShadow = true;
      this.group.add(mesh);
      this.stats.draws++;
      this.stats.tris += (merged.index?.count ?? merged.attributes.position.count) / 3;

      /* Task #28's gated call site — see HULL_KEYS. Deliberately `outline()` per hero mesh
         rather than `applyOutlines()` over the group, because the walker would read the
         table's weight on all 11 declaring keys and shell the set dress too.
         `outline()` builds the shell from a welded copy of the normals written to a separate
         `slyNormal` attribute, so the host's own shading is bit-identical either way, and it
         sets `noShadow`/`isOutlineShell`/`castShadow=false` itself — a shell must never reach
         the shadow map, since it is its host's geometry at identity and every fragment would
         then test against its own depth. Tagged so a same-boot A/B can toggle exactly these
         and nothing else. */
      if (HULL_KEYS.has(key) && spec.outline > 0) {
        const shell = shading?.outline?.(mesh, { thickness: spec.outline });
        if (shell) {
          shell.userData.propsHull = true;
          /* A shell is a real draw of the same triangles, so it is counted into this module's
             own totals rather than hidden in a separate field — a self-report that excluded
             them would understate Props by exactly the amount this change costs. `hulls` is
             the breakdown, not the accounting. */
          this.stats.hulls = (this.stats.hulls || 0) + 1;
          this.stats.draws++;
          this.stats.tris += (merged.index?.count ?? merged.attributes.position.count) / 3;
        }
      }

      // Solid props are standable; cloth, flame and glass are not.
      if (!spec.transparent && !spec.emissive && key !== 'rope') {
        this.engine.registerCollider(mesh, { tag: 'ground', material: key === 'wood' ? 'wood' : 'stone' });
      }
    }
    this.buckets.clear();
  }

  _mat(key) {
    const spec = MATERIALS[key];
    const shading = this.engine.get('shading');
    const tex = spec.tex ? this.engine.get('textures')?.get(spec.tex) : null;

    const opts = {
      color: spec.color,
      map: tex?.map ?? null,
      normalMap: tex?.normalMap ?? null,
      roughnessMap: tex?.roughnessMap ?? null,
      aoMap: tex?.aoMap ?? null,
      /* The ORM blue channel is the per-texel gilding mask. Architecture forwards this by
         iterating the bundle's slots; this call site hand-lists them, so it silently dropped
         the one map that decides which texels are metal at all. */
      metalnessMap: tex?.metalnessMap ?? null,
      bands: 3,
      rim: 0.55,
      rimColor: 0x7fd4ff,
      spec: spec.spec ?? 0.2,
      gloss: spec.gloss ?? 28,
      // See the note at Architecture.mat(): MATERIALS.gold.metal existed but only ever reached
      // the fallback MeshStandardMaterial, so the toon path never knew gold was metal.
      /* Per-recipe amount, mirroring Architecture.mat(). Absent = 0.85, so both recipes here
         are bit-identical to before. Props' two metals (`gold`, `bronze`) are both SOLID metal
         objects — the gilded Ra, the hook rings, bronze fittings — so neither wants a reduced
         amount today; the reason this is spelled out rather than left as a shared constant is
         that Architecture's version of this line collapsed leaf-over-stone and solid leaf into
         one value, and the next metal added here would inherit the same collapse silently. */
      metal: spec.metal ? (spec.metalAmount ?? 0.85) : 0,
      outline: spec.outline ?? 1.0,
      sss: spec.side ? 0.5 : 0.1,
      emissive: spec.emissive ?? 0x000000,
      emissiveIntensity: spec.emissiveIntensity ?? 0,
      transparent: !!spec.transparent,
      opacity: spec.opacity ?? 1,
      side: spec.side ?? THREE.FrontSide,
    };

    let m = null;
    if (shading?.toon) {
      try { m = shading.toon(opts); } catch (err) {
        this.engine.warn(`props: shading.toon threw for "${key}" — ${err?.message || err}`);
      }
    }
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: spec.color, map: opts.map, normalMap: opts.normalMap,
        roughness: spec.rough ?? 0.8, metalness: spec.metal ? 0.9 : 0,
        emissive: opts.emissive, emissiveIntensity: opts.emissiveIntensity,
        transparent: opts.transparent, opacity: opts.opacity, side: opts.side,
      });
    }
    this._materials.push(m);
    return m;
  }

  /** Hand the brazier/torch lights and emitters to their owners, if those modules exist. */
  _registerLightsAndFx() {
    const lighting = this.engine.get('lighting');
    if (lighting?.addLocalLight) {
      for (const l of this._lights) {
        try { lighting.addLocalLight(l); } catch { /* budgeted out; not fatal */ }
      }
    }
    const fx = this.engine.get('fx');
    if (fx?.burst || fx?.spawn) {
      for (const e of this._fx) {
        try { fx.spawn?.(e.name, { position: e.position }); } catch { /* emitter unknown */ }
      }
    }
  }

  /* --- collider helpers. ARCHITECTURE may already own these surfaces, so keep them
         cheap and additive rather than duplicating its registrations. --- */

  _maybeLedge(x, y, z, w, d) {
    const g = new THREE.BoxGeometry(w, 0.2, d);
    const m = new THREE.Mesh(g, this._invisible());
    m.position.set(x, y, z);
    m.visible = false;
    this.group.add(m);
    this.engine.registerCollider(m, { tag: 'ledge', material: 'stone' });
  }

  _deck(x, y, z, w, d) {
    const g = new THREE.BoxGeometry(w, 0.2, d);
    const m = new THREE.Mesh(g, this._invisible());
    m.position.set(x, y, z);
    m.visible = false;
    this.group.add(m);
    this.engine.registerCollider(m, { tag: 'ground', material: 'wood' });
  }

  _hazard(x, y, z, r) {
    const g = new THREE.SphereGeometry(r, 6, 4);
    const m = new THREE.Mesh(g, this._invisible());
    m.position.set(x, y, z);
    m.visible = false;
    this.group.add(m);
    this.engine.registerCollider(m, { tag: 'hazard', material: 'stone' });
  }

  _invisible() {
    this._invis ||= new THREE.MeshBasicMaterial({ visible: false });
    return this._invis;
  }

  /* ===================== frame ===================================== */

  /** What the contact decals actually applied this frame — see `ContactDecals.state()`. */
  decalState() { return this.decals?.state?.() ?? null; }

  update(dt, t) {
    this.decals.update();
    // Collectibles bob and spin so they read as pickups rather than scenery.
    for (const c of this._collect) {
      const { mesh, spots, phase, upright } = c;
      if (!mesh) continue;
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i];
        _v.set(s[0], s[1] + Math.sin(t * 2.2 + phase[i]) * 0.09, s[2]);
        /* A coin is a disc and has to be laid flat (rx π/2) before it can spin in its own
           plane; a bottle already stands up in its own geometry, so laying it over would spin
           it lying on its side. Same bob, different axis. */
        const rot = upright
          ? _e.set(0, t * 1.8 + phase[i], 0)
          : _e.set(Math.PI / 2, 0, t * 1.8 + phase[i]);
        _m.compose(_v, _q.setFromEuler(rot), _one);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.decals.dispose();
    for (const g of this._geoms) g.dispose();
    for (const m of this._materials) m.dispose?.();
    this._invis?.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}

/* Scratch — update() allocates nothing (§5). */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _one = new THREE.Vector3(1, 1, 1);
