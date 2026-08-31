import * as THREE from 'three';
import { rng, WORLD_SEED } from '../core/Rand.js';
import {
  coin as coinGeo, COIN_RADIUS, COIN_THICKNESS, clueBottle, CLUE_ATTRS, CLUE_HEIGHT,
  ingot, scarab, collar, place, mergeAll, offsetUVs,
} from './PropKit.js';
import { decodeCoinBadge, COIN_BADGE_SIZE, COIN_BADGE_RIM_UV } from './CoinBadge.js';
/* §724: the treasure shares the hoard's coloring — same token, same derived un-tint — because
   the Eye of Ra is built from the same `coin()` discs at the same UV-origin window and wears
   the same double-tinted `gold_leaf` (the mechanism `_treasurePile`'s header measures). Props
   does not import Pickups, so this direction cannot cycle. */
import { PILE_FADED, PILE_UNTINT } from './Props.js';

/**
 * Pickups — the collect loop. Coins, clue bottles, treasure, and the fence they are carried to.
 *
 * ── The clue bottles and the vault (§357.1, the ninth) ─────────────────────────────────────
 * The bottle feature arrived in four pieces built by four lanes and joined at three of its four
 * seams: `PropKit.clueBottle()` draws one, `Props._clueBottles()` places twelve on the authored
 * route, this file collects them and publishes `clue`, and `Audio.js` plays a built and tested
 * `clue_bottle` sting. What nothing did was **consume the set**. `found` and `total` went out on
 * every collection into a listener that reads neither, so twelve bottles were twelve identical
 * chimes and completing them changed nothing — a collectible with no collection.
 *
 * The end of the set is `_openVault()`. See its docblock for why the payoff is one treasure and
 * not a system, and for the second dead subscription (`objective`) that closing this one closed.
 *
 * ── Why this file exists (§239, and what §239 got half-right) ──────────────────────────────
 * `src/fx/Particles.js:2221`, `src/ui/HUD.js:391` and `src/audio/Audio.js:1251` each subscribe
 * to a **`coin`** event and nothing in `src/` ever emitted one. Three teams built three halves
 * of a reward loop against a contract no publisher fulfilled, and nothing could tell them: no
 * import breaks when an event has no emitter.
 *
 * §239 recorded the cause as "coins exist only as set dressing in KayKit.js and PropKit.js".
 * That undersells it. `Props.js:530 _collectibles()` places **44 coin instances** at authored
 * spots — 34 scattered plus a deliberate 10-coin trail along the architrave ledge "rewarding
 * the rooftop route" — names the mesh `coins`, and animates them every frame under the comment
 * *"Collectibles bob and spin so they read as pickups rather than scenery."* They were authored
 * as collectibles, labelled as collectibles and animated as collectibles. The only thing nobody
 * wrote was the four lines that let you touch one.
 *
 * ── The one payload shape ──────────────────────────────────────────────────────────────────
 * The three subscribers do not agree on their key names, and the intersection is narrow:
 *
 *     HUD.js:391        typeof p === 'number' ? p : num(p?.amount ?? p?.value ?? p?.n, 1)
 *     Audio.js:1363     typeof p === 'number' ? p : (p?.amount ?? p?.count ?? 1)
 *     Particles.js:2221 e?.pos
 *
 * `amount` is the ONLY key both readers accept, and `pos` is the only thing FX looks at. So the
 * shape is `{ amount, pos }` and nothing else may be load-bearing. `tests/pickups.test.mjs`
 * extracts those three expressions **from their own source files at test time** and evaluates
 * them against a real emitted event, so if a subscriber renames a key this fails loudly instead
 * of going quiet again.
 *
 * One genuine disagreement is left standing, deliberately, because it is a feature: HUD reads
 * `amount` as *value to credit*, Audio reads it as *how many chimes to play* (capped at 6). So
 * the denominations are chosen to make both readings true at once — a single coin is worth 1
 * and chimes once, a small stack is worth 3-5 and chimes 3-5 times, and a treasure is worth
 * hundreds and chimes the full 6. The cap stops being a clamp and starts being a flourish.
 *
 * ── `pos` is freshly allocated on purpose ──────────────────────────────────────────────────
 * §5 says update() allocates nothing, and this is the documented exception. `Audio._onCoins`
 * forwards `pos` into `play(..., { delay: i * 0.065 })` — a scheduled read, not a synchronous
 * one — so a reused scratch vector could be overwritten before the sound that references it is
 * built. §237's `_emit` aliasing trap is the same bug one file over. A collection is a rare
 * event (a handful per second at the very most); one Vector3 per collection buys immunity to an
 * entire class of defect and costs nothing measurable.
 *
 * ── Treasure is carried, not banked (and why that is the right call here) ──────────────────
 * In Sly 2 and 3 a treasure is picked up and must be carried to the safe house; you are slower
 * while holding it and you drop it if you are caught. This level has no safe house, but it has
 * something that serves the same dramatic function: the way you came in. The fiction is a heist
 * on the Temple of Ra, the sarcophagus is 100 m and a whole guard roster from spawn, and the
 * series' real tension has always been that **the return leg is harder than the approach** —
 * you have already spent your surprise. So the fence sits at the courtyard entrance beside
 * spawn, picking a treasure up credits nothing, and only reaching the fence pays. Being driven
 * to CHASE while carrying drops it back into the world where you were caught.
 *
 * That costs no new level geometry, needs no new HUD, and puts the coin event on the beat where
 * it belongs: the moment the loot is actually yours.
 */

/* ============================ tuning ==================================== */

/**
 * Every number here is derived from a constant that already existed in the project. Registered
 * before the implementation was written — see the PREREG block in `tests/pickups.test.mjs`.
 *
 * The two radii come from different places on purpose. `collect` is a CONTACT test: the player
 * capsule (`Controller.TUNE.radius` 0.34) actually overlapping the coin Props already draws
 * (`PropKit.COIN_RADIUS`). Any generosity beyond touching belongs in the magnet term, not in the
 * contact term — that is exactly the distinction §223 drew between a snap radius and a catch
 * radius.
 *
 * `magnet` is `Controller.TUNE.pickRange` (2.4), the reach at which Sly's hands can already
 * take something off a guard's belt. A coin magnet and a pocket reach are the same gesture at
 * different scale, and borrowing the number keeps the game's two theft ranges consistent
 * instead of introducing a second, differently-felt one.
 */
export const TUNE = {
  /* ---- radii (m) ---- */
  /* NOT a literal any more (§712): `PropKit.COIN_RADIUS` is the single authored size and this
     reads it, so the pickup mesh, its decorative twin in `Props._collectibles()` and the derived
     term below cannot be scaled apart — the same arrangement `clueHeight` has carried since §701,
     and for the same reason. Four literals used to hold this number between two files. */
  coinRadius:    COIN_RADIUS,                          // 0.16 → 0.24 (§712, "50% larger")
  playerRadius:  0.34,   // Controller.TUNE.radius
  /**
   * playerRadius + coinRadius: 0.34 + 0.24 = **0.58**.
   *
   * **RE-DERIVED at every resize, never scaled — 0.50 → 0.58 (§712).** §705 is the precedent and
   * the trap. Scaling this term with the art gives 0.50 × 1.5 = **0.75**, which is 0.17 m of
   * reach the player is not touching anything at: it silently converts a CONTACT radius into a
   * second, smaller magnet and collapses the §223 snap/catch split this block's own header
   * states. The formula is the value; `stepPickup` measures the capsule centre against the coin
   * centre and the term is `playerRadius + coinRadius` and nothing else.
   *
   * `tests/pickups.test.mjs`'s PREREG arm asserts exactly this equality (and C2 names the scaled
   * value as its fail input), so a scaled 0.75 fails the suite rather than shipping — which is the
   * whole reason the derivation is pinned there and not here.
   */
  collect:       0.58,
  magnet:        2.40,   // Controller.TUNE.pickRange
  fence:         2.20,   // a body-length short of the magnet; banking is a place you stand, not brush past
  /* `movement.position` is the capsule BASE. Measuring a coin against the player's feet would
     make a chest-height coin read as 0.9 m away while it is visually inside him, so everything
     is measured against the capsule's centre: Controller.TUNE.height / 2. */
  grabHeight:    0.90,   // Controller.TUNE.height (1.80) / 2

  /* ---- magnet law (m/s) ---- */
  speedMin:      2.60,   // Controller.TUNE.walkSpeed — at the rim it already moves, so it never looks stuck
  speedMax:     14.40,   // 2 x Controller.TUNE.runSpeed — must strictly beat a sprinting player
  curve:         2,      // ease-in exponent; 1 is linear and reads limp, 3 overshoots into a snap

  /* ---- presentation ---- */
  bobAmp:        0.09,   // Props.js's own bob, kept so adopted spots do not visibly change
  bobRate:       2.2,
  spinRate:      1.8,
  treasureBob:   0.16,   // treasure is bigger, so it swims wider and slower — a different silhouette
  treasureRate:  1.25,
  treasureSpin:  0.75,
  /* Clue bottles. NOT a literal any more (§701): `PropKit.CLUE_HEIGHT` is the single authored
     size and this reads it, so the pickup, its decorative twin in `Props._clueBottles()` and the
     two radii below cannot be scaled apart — the same reason `coinRadius` is pinned to
     `PropKit.COIN_RADIUS`. `h` is the lathe parameter; the DELIVERED height is `h * CLUE_HEIGHT_RATIO`
     and that is the number the two derivations under it use. */
  clueHeight:    CLUE_HEIGHT,                          // 0.84 → 0.86520 m delivered
  /**
   * playerRadius 0.34 + half the DELIVERED height, rounded down to the file's two places:
   * 0.34 + 0.86520/2 = 0.7726 → 0.77. A bottle stands up where a coin lies flat, so its
   * grabbable extent is vertical and larger than a coin's; using `collect` 0.50 unchanged would
   * make you clip through the neck of one before it registered.
   *
   * **RE-DERIVED at every resize, never scaled: 0.55 → 0.98 (§701) → 0.77 (§705).** Re-deriving
   * and scaling happen to agree when the bottle grows and disagree when it shrinks — 0.98 × 2/3
   * is 0.653, which is 0.12 m SHORT of contact and would leave the player pushing into the glass
   * before it registered. `stepPickup` measures the capsule centre against the bottle's BASE, so
   * the term is `playerRadius + half height` and nothing else; the formula is the value.
   *
   * The two-place rounding goes DOWN, and that direction is the file's doctrine rather than
   * tidiness: this is a CONTACT term, and **any generosity beyond touching belongs in `magnet`,
   * not here** — §223's snap-radius/catch-radius split, stated in this block's own header. So
   * 0.77 sits 2.6 mm inside true contact rather than 0.2 mm outside it, which is negligible
   * against a 0.34 m capsule and is on the correct side of the line. `cluevault` V1b enforces
   * exactly that: `clueCollect ≤ playerRadius + height/2`, and within 0.015 of it.
   */
  clueCollect:   0.77,
  clueBob:       0.11,
  clueRate:      1.7,
  clueSpin:      1.1,
  /**
   * The rock, ADAPTED from the reference project's own bottle — numbers, not code.
   *
   * `Scenes/Design Tools/bottle.tscn` carries the motion in an AnimationPlayer, not in the
   * `.glb` (which has zero animations): a **1.5 s loop** in which `BOTTLE ROT:rotation` swings
   * **±0.349066 rad — ±20°** about Z while the child's position sways `x ±0.125` and dips
   * `y 0.25 → 0.20`. That side-to-side rock is the franchise's read of a floating bottle and
   * our continuous Y-spin alone did not have it.
   *
   * `clueRockRate` is `2π / 1.5` so the loop is theirs to the digit. `clueSway` is their 0.125
   * carried across by PROPORTION rather than copied: their bottle stands 0.875 m (a unit mesh at
   * `scale 0.875`), so the sway is 1/7 of its height, and 1/7 of ours is `clueSway`.
   * Copying 0.125 would have been a sway 29% of the bottle's height as it then stood — the same
   * class of mistake as assuming their `scale 0.875` transfers.
   *
   * **The proportion is the value; the metres are not (§701).** It has now tracked the delivered
   * height through two resizes in opposite directions — 0.0618 → 0.1854 (§701) → 0.1236 (§705) —
   * because it is defined as 1/7 of that height and nothing else. `clueRock` is an ANGLE and does
   * not scale in either direction; the arc a ±20° lean sweeps follows the bottle on its own,
   * which is the point of expressing it as an angle. `clueBob` was never height-derived and does
   * not move either.
   *
   * **Its price was measured, not waved at, and shrinking pays it back.** `SWAY=` on
   * `tools/bottlefit.mjs` moves this one term against the same world. Tripling it cost the two
   * tightest placements most of their margin (peristyle architrave 0.281 → 0.192 m, tomb vault
   * floor 0.105 → 0.033 m) while changing no verdict; §705's reduction hands that back, and the
   * measured clearances there are the check rather than the expectation.
   *
   * The Y-spin STAYS, which is a departure from the reference and a deliberate one: their bottle
   * does not spin, but theirs is placed to be seen from one side and ours sit on a route walked
   * from every angle. The imported mesh's most legible feature is a gold label band around one
   * belly; without the spin it faces one direction forever and half the level never sees it.
   */
  clueRockRate:  Math.PI * 2 / 1.5,
  clueRock:      0.349066,
  clueSway:      0.1236,   // (CLUE_HEIGHT * CLUE_HEIGHT_RATIO) / 7 = 0.86520 / 7

  /* ---- economy ---- */
  milestone:     100,    // coins between purse toasts — "something reacts when it changes"
  respawnDrop:   0.0,    // a dropped treasure does not decay; it waits where you lost it

  /**
   * Fixed integration step for the magnet, in seconds.
   *
   * The pull speed varies steeply with distance, so a plain `pos += v(d) * dt` at the caller's
   * frame rate is NOT frame-rate independent: a 30 Hz frame overshoots the curve a 240 Hz frame
   * follows. Registered gate P5 (< 0.02 m of divergence over 0.30 s) caught it at 0.0291 m —
   * the gate was right and the integrator was wrong. Sub-stepping on a fixed grid makes the
   * result depend only on elapsed time, which is what the gate was asserting all along.
   * 1/240 divides every frame rate the engine can produce (dt is clamped to 1/20 upstream), so
   * the worst case is 12 sub-steps of arithmetic on a handful of magnetised coins.
   */
  subStep:       1 / 240,
};

/**
 * The clue-bottle view of `TUNE`, built once at module scope.
 *
 * `stepPickup` reads `tune.collect`, and a bottle's is wider than a coin's. Deriving it per
 * frame with a spread would allocate an object per bottle per frame, which §5 forbids and which
 * the sub-stepping integrator would then do 12 times over. One frozen object instead.
 */
const CLUE_TUNE = Object.freeze({ ...TUNE, collect: TUNE.clueCollect });

/** Denominations. `amount` doubles as Audio's chime count, so these stay small and legible. */
export const COIN_VALUE = { single: 1, stack: 3, pile: 5 };

/* ====================== the pickpocket pop (§742) ======================== */

/**
 * The coins that burst out of a guard's pouch when Sly takes it, and fly straight to him.
 *
 * ── THEY PAY NOTHING, AND THAT IS THE WHOLE DESIGN (§742.1) ─────────────────────────────────
 * A steal is ALREADY paid, exactly once, on `guardPickpocket`: `HUD.js:786` credits the wallet
 * with the guard's own rolled `coins` and `Health.js:149` banks the same number into the charm
 * purse. `tests/pickpocket.test.mjs` pins both directions of that — it exists because a flat 25
 * on the raw `pickpocket` INTENT event shipped once and could be farmed by mashing E in an
 * empty courtyard. So a paying pop would be a SECOND credit path off one steal, and the exploit
 * would come back wearing a different hat.
 *
 * These records therefore carry `pay: false`, they never enter `this.coins`, they are never
 * stepped by `stepPickup`, and `_absorbPop` — the ONLY way one is retired — emits nothing on
 * the bus. What the player sees is not a second payment; it is the FIRST one, drawn. The wallet
 * ticks up at the instant of the steal (with the "+83" punch and the toast) and the coins are
 * the picture of that transfer arriving.
 *
 * ── They fly to him. They do not land (owner's amendment, mid-§742) ─────────────────────────
 * The first draft of this section arced them onto the floor and handed them to the existing
 * magnet, which made the §732 buried-coin hazard live and cost two sweeps per coin per frame.
 * The owner's amendment — *"The coins don't need to fall to the ground, but can instead go
 * directly to the character"* — deletes all of it. There is no ground query, no resting state
 * and no collision in the flight at all. What is left is two phases and no world interaction:
 *
 *   POP    `popTime` of pure ballistics away from the pouch, into a fan about −forward. Short,
 *          fast and slightly up. This is the beat that says "out of his pocket".
 *   HOME   the residual pop velocity is STEERED toward Sly's chest rather than replaced, so the
 *          path bows out and back — thrown, not teleported — and the speed ramps to a snatch.
 *
 * A coin may clip a metre of masonry mid-flight. That is accepted deliberately: it is two or
 * three frames of a 0.3 m sprite behind a wall, and the alternative is a per-coin sweep every
 * frame for a beat that is over before the player could look at it.
 *
 * ── The count is derived from the loot and then CAPPED, because the loot is huge ────────────
 * `Guard.TUNE.loot` rolls temple 45–90, heavy 80–150, scarab 10–25. Popping one disc per coin
 * would be 150 physical objects out of one pouch — a firework, not a pickpocket, and 150
 * instances of headroom for a beat that reads at eight. `perCoin` maps loot to a legible count
 * and `min`/`max` clamp it: 10 → 3, 45 → 3, 90 → 5, 150 → 8. The mapping is monotone so a
 * heavy visibly out-pops a scarab, which is the only thing a count can usefully say.
 */
export const POCKET = {
  /* ---- the pool ---- */
  /**
   * Instances of headroom on the coin mesh. THREE steals' worth of maximum pops in the air at
   * once (3 × `max`), which the level cannot produce: `Guard.looted` latches so a guard can be
   * robbed once, `Controller.TUNE.pickTime` 0.55 floors the gap between two steals, and a whole
   * flight is over in well under half of that. Overflow recycles the oldest live coin rather
   * than dropping the pop, and `debugInfo().pop.evicted` reports if it ever happens.
   */
  pool:          24,

  /* ---- how many ---- */
  perCoin:       20,     // loot per popped disc
  min:           3,      // a scarab's 10-25 still reads as a handful
  max:           8,      // the cap. See the header: the loot goes to 150 and eight is the beat.

  /* ---- the pop (m/s, s) ---- */
  popTime:       0.16,   // pure ballistics out of the pouch before the homing takes over
  gravity:       11.0,   // only ever acts during `popTime`; it is what bends the burst
  up:            2.30,
  upJitter:      0.55,
  out:           2.05,   // away from his back
  outJitter:     0.55,
  spread:        0.72,   // rad, half-angle of the fan about −forward (±41°)

  /* ---- the flight ---- */
  /**
   * How hard the velocity is steered onto the player, per second.
   *
   * This is the number that decides "thrown" against "teleported". The pop velocity is not
   * discarded when the homing starts — it is BLENDED toward the target direction at this rate —
   * so a coin still travelling outward at 2 m/s takes a fifth of a second to come round, and the
   * path it draws in that time is the arc. Raise it and the coins turn on a pin; drop it and
   * they sail past him.
   *
   * **Swept rather than picked.** Deviation from the straight pouch→chest line, and the length
   * of the whole beat, measured at a realistic 1.5 m steal distance:
   *
   *     homeTurn      3      4      5      6      7      9     12
   *     bow (m)    0.441  0.406  0.381  0.363  0.349  0.330  0.311
   *     beat (s)    0.65   0.60   0.57   0.55   0.53   0.52   0.48
   *
   * A clean monotone trade with no knee in it, so the choice is a judgement and is stated as
   * one: 5.0 buys 0.38 m of arc — a fifth of the whole flight's length — for 0.57 s, which is
   * still comfortably inside the "sub-second" the beat was asked for. The first draft shipped
   * 9.0 and `tests/pocketpop.test.mjs` F2 could barely see its curve.
   */
  homeTurn:      5.0,
  homeRamp:      0.30,   // s over which the flight speed ramps from `speedMin` to `speedMax`
  life:          2.50,   // s before a coin that cannot reach him gives its slot back
  fade:          0.35,   // of which the last N are spent scaling to nothing
};

/**
 * §742 revert token: `?pop=off` (or `globalThis.__POP_AB = 'off'` from a test) takes the
 * physical pop back out and leaves the steal exactly as §741 shipped it — the suspicion bump,
 * the wallet credit, the toast, and no visible coins. Precedent: `?kk=`, `?react=`, `?vault=`.
 * The gate is read once at module scope so a per-frame path never touches `location`.
 */
export const POP_ON = (() => {
  let raw = '';
  try {
    if (typeof location !== 'undefined' && location.search) raw = new URLSearchParams(location.search).get('pop') || '';
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__POP_AB != null) raw = String(globalThis.__POP_AB);
  } catch { /* plain-module hosts have no location; that is the test path */ }
  return String(raw).trim().toLowerCase() !== 'off';
})();

/**
 * Belt height above a guard's feet, used ONLY when `guardPickpocket` arrives without a `pocket`
 * key (an older GUARDS, or a bare test payload). `Guard.TUNE.pocketUp` is the authored value and
 * this mirrors it rather than importing it, because PICKUPS importing GUARDS to read one number
 * would couple the collect loop to the AI module; `tests/pocketpop.test.mjs` asserts the two
 * agree, so the mirror cannot drift silently. Never used on the shipped path.
 */
export const POCKET_FALLBACK_UP = 0.62;

/**
 * How many discs a roll of `n` coins is worth, on screen.
 * Pure, exported, and pinned — the cap is a design claim and belongs where it can be asserted.
 */
export function popCount(n) {
  const v = Number.isFinite(n) ? n : 0;
  if (v <= 0) return 0;
  return Math.max(POCKET.min, Math.min(POCKET.max, Math.ceil(v / POCKET.perCoin)));
}

/**
 * The treasures. Rare, hand-placed, each on a different route so no single traversal skill
 * collects them all — the scarab is the vertical route's prize, the collar the rooftop run's,
 * the ingot the one you have to go all the way into the tomb for and all the way back out with.
 *
 * Values are scaled against the economy that already exists rather than invented: `Guard.js`
 * rolls 45-90 for a temple guard, 80-150 for a heavy. A treasure is worth several pickpockets,
 * which is what makes the walk back worth the risk.
 */
export const TREASURES = [
  { id: 'scarab', name: 'Scarab of Khepri', value: 180, shape: 'scarab', pos: [2.2, 9.35, 8.4] },
  { id: 'collar', name: 'Wesekh of Ra',     value: 240, shape: 'collar', pos: [23.0, 9.4, -13.0] },
  { id: 'ingot',  name: 'Ingot of Amun',    value: 320, shape: 'ingot',  pos: [0.0, -11.75, -72.0] },
  /**
   * The Eye of Ra — the vault's prize, and the one treasure that is not lying in the open.
   *
   * `HUD.js:338` has printed **"Steal the Eye of Ra"** on the objective card since the HUD was
   * written, and `HUD.js:515` has Bentley saying *"The Eye of Ra is in the vault under the
   * hall"* on the Binocucom. There was no Eye of Ra anywhere in `src/`. The game has stated its
   * own objective from the first frame and the object it names did not exist — the same defect
   * as §239's coin, one layer up: a goal is a contract too, and this one had no publisher
   * either.
   *
   * `locked: 'clues'` is the only gate in this file. While it holds the mesh is not drawn and
   * `stepPickup` never sees it, so an ungated player cannot brush past the vault and take it.
   *
   * Position: dead centre on the front lip of Ra's plinth (`Props.js` puts `falconRa` at
   * `L.vault.z - 3.2 = -75.2`; `Statues.falconRa`'s base is `chunkAt(-1.00, 1.00, 0, 0.52,
   * -0.90, 0.90)`, so its top is `L.vault.y + 0.52 = -11.48` and its front face is `z = -74.3`).
   * The Eye floats 0.28 m over that lip under the sun disc — `Statues.js:594` calls that disc
   * "the brightest single shape in the tomb", which is the light this is staged to catch.
   *
   * 500 is the top of the ladder on purpose: `Guard.js` rolls 45-90 for a temple guard and
   * 80-150 for a heavy, and the ingot — the deepest treasure before this one — is 320. The Eye
   * costs twelve bottles AND the walk back out, so it has to be worth more than the thing you
   * could already carry out of the same room.
   */
  { id: 'eye', name: 'Eye of Ra', value: 500, shape: 'eye', pos: [0.0, -11.20, -74.30],
    locked: 'clues' },
];

/** Where loot turns into money. Beside spawn (0,0,30) — the way in, and the way out. */
export const FENCE = { pos: [-3.4, 0.0, 32.2], name: 'Fence' };

/* ============================ the magnet law ============================ */

/**
 * Pull speed for a pickup whose centre is `d` metres from the player.
 *
 * Zero outside `magnet` — a bounded assist, not a global attractor. §223's whole argument for
 * why traversal magnetism is not an aimbot is that it corrects a timing error the input layer
 * already forgives and *nothing wider*; the same rule applies here, and P7 asserts it.
 *
 * The square is what makes it read as magnetism rather than as a tractor beam: a coin at the
 * rim drifts, and the last half-metre is a snatch.
 */
export function magnetSpeedAt(d, tune = TUNE) {
  if (!(d >= 0) || d > tune.magnet) return 0;
  const t = 1 - d / tune.magnet;
  return tune.speedMin + (tune.speedMax - tune.speedMin) * Math.pow(t, tune.curve);
}

const _d = new THREE.Vector3();

/**
 * Advance one pickup against the player for `dt`. Mutates `p.pos`.
 *
 * @returns {boolean} true on the frame it is collected. Never true twice — `p.taken` latches,
 *   which is P11 and is the difference between a coin and a slot machine.
 */
export function stepPickup(p, playerPos, dt, tune = TUNE) {
  if (!p || p.taken || !playerPos) return false;
  let remaining = dt;
  /* Fixed sub-steps, so the outcome depends on elapsed time and not on the caller's frame rate
     (P5). The player is treated as stationary within one frame — he already is, from the
     module's point of view: `movement.position` is sampled once per update(). */
  let guard = 0;
  while (remaining > 1e-9 && guard++ < 4096) {
    const h = Math.min(tune.subStep, remaining);
    remaining -= h;

    /* Against the capsule's CENTRE, not its base — see TUNE.grabHeight. */
    _d.subVectors(playerPos, p.pos);
    _d.y += tune.grabHeight;
    const d = _d.length();

    if (d <= tune.collect) { p.taken = true; return true; }

    const v = magnetSpeedAt(d, tune);
    if (v <= 0) return false;      // outside the radius; no later sub-step can change that

    p.magnet = true;
    const stepLen = v * h;
    if (stepLen >= d - tune.collect) {
      /* Snap to the grab point so the FX burst goes off at his chest, not at his ankles. */
      p.pos.set(playerPos.x, playerPos.y + tune.grabHeight, playerPos.z);
      p.taken = true;
      return true;
    }
    p.pos.addScaledVector(_d.divideScalar(d), stepLen);
  }
  return false;
}

/* ============================ the wallet ================================ */

/**
 * The running total for the level. Lives as long as the module does, which is as long as the
 * level does — that is the persistence the loop was missing. Deliberately NOT `localStorage`:
 * the screenshot harness boots this level repeatedly and a purse that carried over between
 * boots would make captures depend on capture order (§234's lesson, one layer up).
 */
/**
 * ── READ THIS BEFORE BUILDING ANYTHING THAT SPENDS COINS ──────────────────────────────────
 *
 * `Wallet.coins` here and `Health.purse` (`src/player/Health.js:98`) are **two independent
 * counters fed by the same event**, and neither knows the other exists. `Pickups._coin()` emits
 * one `coin`; `Wallet.credit()` banks it here and `Health.js:148` — one of the four subscribers
 * `tests/pickups.test.mjs` P10 censuses — banks the same coin into the charm purse. **Every coin
 * is credited twice, to two different totals, on purpose** — one is the player's money, the
 * other is progress toward a lucky charm, and today they agree because nothing has ever taken
 * money out.
 *
 * (Spelling that subscription out as a literal call expression here is what broke P10 once: it
 * scrapes `src/` for the subscribe token with a regex that cannot tell code from prose, so a
 * comment *describing* the contract counts as a fifth subscriber. Documenting an event by name
 * is safe; quoting the call is not.)
 *
 * `credit()` is add-only: `Math.max(0, …)`, no debit path, and nothing in `src/` spends. The
 * instant anything does — a shop, a bribe, a toll — the two diverge silently and in a specific
 * direction: **the charm arc the HUD draws keeps filling from money the player has already
 * spent**, because `Health.purse` never hears about the spend. There is no assertion that will
 * catch this and no visual that will look wrong until a charm is awarded for an empty wallet.
 *
 * So whoever builds the first coin sink owns a decision, not a bug fix: either `purse` is
 * gross-earned (and the two are meant to differ, which should be said out loud somewhere the
 * HUD can read), or it is net-spendable (and the sink has to publish a debit both counters
 * consume). Recorded here rather than in KNOWN_ISSUES because this is the file the sink's
 * author will be reading.
 */
export class Wallet {
  constructor(tune = TUNE) {
    this.tune = tune;
    this.coins = 0;         // banked, spendable
    this.collected = 0;     // how many pickups taken
    this.treasures = 0;     // how many banked at the fence
    this.carrying = null;   // the treasure in hand, or null
    this._nextMilestone = tune.milestone;
  }

  /** @returns {number|null} the milestone just crossed, or null. */
  credit(n) {
    const v = Math.max(0, Math.round(n) || 0);
    if (!v) return null;
    this.coins += v;
    this.collected++;
    if (this.coins >= this._nextMilestone) {
      const hit = this._nextMilestone;
      while (this.coins >= this._nextMilestone) this._nextMilestone += this.tune.milestone;
      return hit;
    }
    return null;
  }

  state() {
    return {
      coins: this.coins, collected: this.collected, treasures: this.treasures,
      carrying: this.carrying ? this.carrying.id : null,
    };
  }
}

/* ============================ authoring ================================= */

/**
 * Coin placements along the level's own authored route.
 *
 * `architecture.api.route` is a published contract — the header calls it "public data other
 * agents legitimately need" — so the trail is derived from the route the level designer wrote
 * rather than from thirty hand-typed magic numbers that would drift the moment the temple moved.
 * Coins on the line you are supposed to walk are the oldest tutorial in the medium: they teach
 * the route without a single word of UI.
 *
 * Pure and deterministic, so `tests/pickups.test.mjs` can assert the layout without a renderer.
 */
export function authorRouteCoins(route, opts = {}) {
  const R = opts.rng || rng(WORLD_SEED ^ 0x1007);
  const spacing = opts.spacing ?? 2.6;      // a comfortable run-stride apart
  const lift = opts.lift ?? 0.85;           // chest height off the waypoint's own floor
  const out = [];
  if (!Array.isArray(route) || route.length < 2) return out;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const ax = num(a[1]), ay = num(a[2]), az = num(a[3]);
    const bx = num(b[1]), by = num(b[2]), bz = num(b[3]);
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > spacing)) continue;
    const n = Math.floor(len / spacing);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      /* A rhythm, so a long leg is not thirty identical beats — and the rhythm is audible,
         because `amount` is also Audio's chime count. Every fifth coin is a stack, and the last
         coin before the next waypoint is a pile: you get the bigger chime for ARRIVING, which
         is the beat the route is trying to teach. */
      const kind = k === n - 1 ? 'pile' : (k % 5 === 0 ? 'stack' : 'single');
      out.push({
        kind,
        value: COIN_VALUE[kind],
        x: ax + dx * t + R.jitter(0.22),
        y: ay + dy * t + lift,
        z: az + dz * t + R.jitter(0.22),
      });
    }
  }
  return out;
}

function num(v, d = 0) { return Number.isFinite(v) ? v : d; }

/* ============================ the module ================================ */

export class Pickups {
  constructor(engine) {
    this.engine = engine;
    this.rng = rng(WORLD_SEED ^ 0x1007);
    this.TUNE = TUNE;

    this.root = new THREE.Group();
    this.root.name = 'pickups';

    this.wallet = new Wallet(TUNE);
    this.coins = [];        // { pos, kind, value, taken, phase }
    /**
     * §742 — the pickpocket pop. A FIXED pool, allocated once, never grown.
     *
     * Deliberately NOT pushed into `this.coins`: that array is the authored 82 and three things
     * read it as such — `stats.coins`, `tools/coinfit.mjs`'s census (which would report 82 + 24
     * placements, most of them nowhere) and `tests/pickups.test.mjs`'s placement arms. The pool
     * shares the coin mesh's instance buffer and nothing else.
     *
     * Live records occupy `[0, _popLive)` and dead ones the tail, so the live set is always a
     * contiguous prefix and `_coinMesh.count` can be a plain sum. Freeing is a swap with the
     * last live slot — no splice, no allocation, and it is why a record's identity is its slot
     * and never its index.
     */
    this.pocketCoins = [];  // { pos, vel, t, life, born, phase, scale, pay }
    this._popLive = 0;
    this._popSeq = 0;       // monotonic, so the overflow eviction can find the oldest
    this._popRng = rng(WORLD_SEED ^ 0x50cc);
    this._popStats = { pops: 0, spawned: 0, evicted: 0, expired: 0, collected: 0 };
    this.clues = [];        // { pos, taken, magnet, phase, home } — Sly's clue bottles
    this.clueCount = 0;     // bottles found; the vault opens when it reaches clues.length
    this.vaultOpen = false; // latched by `_openVault`, so the beat cannot fire twice
    this.treasures = [];    // { id, name, value, pos, taken, banked, mesh, phase, locked }
    this.fence = new THREE.Vector3().fromArray(FENCE.pos);

    this._geoms = [];
    this._materials = [];
    this._offs = [];
    this._coinMesh = null;
    this._clueMesh = null;
    this._decoHidden = [];
    this._playerPos = new THREE.Vector3(0, 0, 30);
    this._alert = new Map();   // guard id -> state, so "am I being chased" is one lookup
    this.stats = { coins: 0, treasures: 0 };
    /* Allocated HERE and not on the first steal: a pop must not be the frame that allocates 24
       Vector3 pairs. `pay: false` is the field `_collectCoin` reads — see POCKET's header. */
    for (let i = 0; i < POCKET.pool; i++) {
      this.pocketCoins.push({
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        kind: 'pocket', value: 0, pay: false,
        t: 0, life: 0, born: -1, phase: 0, scale: 1,
      });
    }
  }

  /* --------------------------------------------------------------------- */

  async init() {
    this.engine.scene.add(this.root);
    this._author();
    /* AWAITED before `_build`, so the coin material is built once with its map already on it
       rather than built bare and patched later. `decodeCoinBadge` needs no DOM, no canvas and no
       fetch (see `CoinBadge.js`), so this resolves identically in the browser and under
       `node --test` — it does not become a browser-only branch that the suite never executes. */
    this._badgeTex = await this._badgeTexture();
    this._build();
    this._wire();
    /* The purse sync is DEFERRED to the first update() on purpose — see `_synced` below. */
    this._synced = false;
  }

  /** Decide where everything is. Kept separate from `_build` so placement is testable. */
  _author() {
    const arch = this.engine.get?.('architecture');
    const route = arch?.api?.route;

    /* 1. The authored route trail. */
    const specs = authorRouteCoins(route, { rng: this.rng });

    /* 2. Adopt the 44 spots `Props.js` already authored as collectibles.
       They are good placements — 34 scattered plus a deliberate architrave-ledge trail that
       rewards the rooftop route — and re-inventing a second layout beside them would leave two
       overlapping sets of coins in the frame, one of them fake. Reading a private field is not
       lovely; the alternative is worse, and the real fix is for `Props.js` to drop
       `_collectibles()` and hand placement here. Routed to the PROPS owner, see KNOWN_ISSUES. */
    const props = this.engine.get?.('props');
    /* Find the coin entry by its `kind`, not by index 0. Index worked while `_collect` had one
       element in it and became a latent bug the moment it had two — the clue bottles are pushed
       after the coins, and a later reorder in PROPS would silently turn every bottle into a
       one-coin pickup with no error anywhere. `kind` is now written by the producer. The `?? 0`
       keeps the old behaviour if an older PROPS is ever in the tree. */
    const entryOf = (k) => props?._collect?.find?.((c) => c?.kind === k)
      ?? (k === 'coin' ? props?._collect?.[0] : null);
    const adopted = entryOf('coin')?.spots;
    if (Array.isArray(adopted)) {
      for (const s of adopted) {
        if (!Array.isArray(s) || s.length < 3) continue;
        specs.push({ kind: 'single', value: COIN_VALUE.single, x: s[0], y: s[1], z: s[2] });
      }
    }

    /* 3. Clue bottles, adopted the same way. `Props._clueBottles()` owns the placement — one per
       vertical beat of the authored route — and this owns the collect loop and the publisher.
       `emit('clue')` did not exist anywhere in `src/` before this; `Audio.js:1305` has been
       subscribed to it, with a built and tested `clue_bottle` cue behind it, the whole time. */
    const clueSpots = entryOf('clue')?.spots;
    if (Array.isArray(clueSpots)) {
      for (const s of clueSpots) {
        if (!Array.isArray(s) || s.length < 3) continue;
        this.clues.push({
          pos: new THREE.Vector3(s[0], s[1], s[2]),
          taken: false, magnet: false, phase: this.rng.range(0, Math.PI * 2), home: s[1],
        });
      }
    }

    /* Hide the decorative twins rather than draw two sets. Reversible on dispose(), and it
       leaves exactly one set of each in the frame. */
    for (const name of ['coins', 'clue_bottles']) {
      const deco = props?.group?.getObjectByName?.(name);
      if (deco) { deco.visible = false; this._decoHidden.push(deco); }
    }

    for (const s of specs) {
      this.coins.push({
        pos: new THREE.Vector3(s.x, s.y, s.z), kind: s.kind, value: s.value,
        taken: false, magnet: false, phase: this.rng.range(0, Math.PI * 2), home: s.y,
      });
    }

    for (const t of TREASURES) {
      this.treasures.push({
        ...t, pos: new THREE.Vector3().fromArray(t.pos), taken: false, banked: false,
        mesh: null, phase: this.rng.range(0, Math.PI * 2), home: t.pos[1],
      });
    }
    this.stats.coins = this.coins.length;
    this.stats.treasures = this.treasures.length;
    this.stats.clues = this.clues.length;
  }

  /* --------------------------------------------------------------------- */

  _build() {
    if (!this.coins.length && !this.treasures.length && !this.clues.length) return;

    if (this.clues.length) {
      /* `clueBottle()` hands back a Bag whose parts are the imported mesh's own three groups —
         `glass`, `cork`, `label`. They merge into ONE geometry carrying a vertex-colour stream,
         so the set is a single instanced draw and the label still reads; `CLUE_ATTRS` is what
         keeps that stream alive through `normaliseAttrs`, and without it the bottle draws white.
         Instancing it against the gold material would still be wrong — a clue bottle is its own
         object — so this keeps its own material rather than sharing `_mat('gold')`. */
      const parts = [];
      clueBottle({ h: TUNE.clueHeight, rng: this.rng }).drain((_k, g) => parts.push(g));
      const geo = mergeAll(parts, CLUE_ATTRS);
      if (geo) {
        this._geoms.push(geo);
        const mesh = new THREE.InstancedMesh(geo, this._clueMat(), this.clues.length);
        mesh.name = 'pickup_clues';
        mesh.frustumCulled = false;
        mesh.userData.noShadow = true;
        this._clueMesh = mesh;
        this.root.add(mesh);
      }
    }

    if (this.coins.length) {
      /* Thickness from `PropKit`, not a literal — this used to take its radius from `TUNE` and
         its thickness from a bare `0.035`, which is two halves of one number in two places
         (§712). `faceUV` re-authors the caps to a 0..1 disc for the badge and parks the rim on
         one texel; see `PropKit.coin`'s header for why that is an option and not the default. */
      const geo = coinGeo(TUNE.coinRadius, COIN_THICKNESS, { faceUV: true, rimUV: COIN_BADGE_RIM_UV });
      this._geoms.push(geo);
      /**
       * §742 — CAPACITY, and why it is headroom on this mesh rather than a second mesh.
       *
       * This used to be `new InstancedMesh(geo, mat, this.coins.length)` — sized to exactly the
       * placed count, so there was nowhere to spawn into. The two options were a second pooled
       * mesh or headroom here, and headroom wins on every axis that costs anything: the popped
       * coins are the SAME geometry with the SAME material, so they ride the same single draw
       * call, the same badge texture and the same `_writeCoinMatrices` loop. A second mesh would
       * have bought a second draw call and a second material for a set that is visually
       * indistinguishable from the first.
       *
       * The headroom is NOT free triangles: `_writeCoinMatrices` sets `mesh.count` to
       * `coins.length + _popLive` every frame, so with nothing in the air the mesh draws exactly
       * what it drew before this section and an idle frame is bit-identical. The standing cost is
       * the instance buffer — 24 × 16 floats = **1,536 bytes** — and nothing else.
       */
      const mesh = new THREE.InstancedMesh(geo, this._coinMat(), this.coins.length + POCKET.pool);
      mesh.count = this.coins.length;   // the pool draws nothing until something is popped
      mesh.name = 'pickup_coins';
      mesh.frustumCulled = false;
      mesh.userData.noShadow = true;   // tiny, and self-shadowing them is pure acne (Props' own note)
      this._coinMesh = mesh;
      this.root.add(mesh);
    }

    let seq = 0;
    for (const t of this.treasures) {
      const geo = this._treasureGeo(t.shape, seq++);
      if (!geo) continue;
      this._geoms.push(geo);
      /* §724: the treasure wears the hoard's coloring — `COLOR_0` carrying the exact linear
         inverse of the recipe's own tint (white under `?pile=faded`), so the gold you carry
         matches the gold you found it on. The attribute is authored on every vertex in both
         arms because the material declares `vertexColors` (§719's unbound-attribute trap). */
      const tint = PILE_FADED ? [1, 1, 1] : PILE_UNTINT;
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { col[k * 3] = tint[0]; col[k * 3 + 1] = tint[1]; col[k * 3 + 2] = tint[2]; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(geo, this._mat('gold', { vertexColors: true }));
      m.name = `treasure_${t.id}`;
      m.position.copy(t.pos);
      /* Treasure is a hero prop, not set dress — §2.1.2 gives the inverted hull to hero props,
         and the whole point of a treasure is that you can see it from across the room. */
      m.userData.hero = true;
      t.mesh = m;
      this.root.add(m);
    }
    this._writeCoinMatrices(0);
  }

  /**
   * One merged geometry per treasure. `collar()` hands back a Bag (its rows alternate gold and
   * stone inlay, which is why it is a Bag at all) — the inlay is lost by merging it into the one
   * gold material, and that is the right trade here: a treasure is 0.7 m of silhouette seen from
   * across a courtyard, and one draw call beats four rows of correct lapis nobody can resolve.
   */
  _treasureGeo(shape, seq = 0) {
    const R = this.rng;
    /* §724: every part built here projects its UVs from local positions, so — exactly as the
       treasure pile's coins did — each one samples `gold_leaf`'s origin-corner window, the
       below-median seam patch `Props._treasurePile`'s header measures. The same fix: translate
       each part's window by the R2 sequence on a deterministic counter (no `this.rng` draws,
       so placements and every downstream roll are identical in both arms). 16 indices of
       headroom per treasure keeps parts of one treasure on different patches. */
    let part = 0;
    const win = (g) => {
      if (PILE_FADED) return g;
      const i = seq * 16 + (part++) + 1;
      return offsetUVs(g, ((0.7548776662466927 * i) % 1) * 1.2, ((0.5698402909980532 * i) % 1) * 1.2);
    };
    if (shape === 'scarab') return place(win(scarab({ len: 0.42, rng: R })), { y: -0.05 });
    if (shape === 'ingot') return place(win(ingot({ w: 0.46, h: 0.16, d: 0.26, rng: R })), {});
    /* The Eye of Ra: an upright sun disc with a stepped rim, not a big coin. `coin()` is
       already a disc lathe and the only primitive in PropKit that is one, so the shape is two
       of them — a 0.30 m face standing proud of a 0.34 m backing plate, which gives the 4 cm
       rim that reads as beaten gold rather than as currency. `rx` stands it up: a cylinder's
       axis is +Y, and `Props._collectibles` rotates coins by the same quarter turn to lay them
       FLAT, so leaving it out here is what would make this a coin. The update loop spins it
       about Y, so it presents face, edge, face — the sun disc turning. */
    if (shape === 'eye') {
      return mergeAll([
        place(win(coinGeo(0.30, 0.08)), { rx: Math.PI / 2 }),
        place(win(coinGeo(0.34, 0.04)), { rx: Math.PI / 2, z: -0.05 }),
      ]);
    }
    if (shape === 'collar') {
      const parts = [];
      collar({ r: 0.34, rows: 4, rng: R }).drain((_key, geo) => parts.push(win(geo)));
      const merged = mergeAll(parts);
      return merged ? place(merged, { rx: -Math.PI / 2 }) : null;
    }
    return null;
  }

  /**
   * The gold material, through SHADING's own factory.
   *
   * The method is `make()` (aliased to `toon()` at ToonMaterial.js:2011). An earlier draft of
   * this file guessed a factory name that does not exist and `tests/api.test.mjs` caught it.
   * §213 is the reason that matters: a `<guess> ? <guess>(…) : new MeshStandardMaterial(…)`
   * ternary looks like a boot-order guard but silently absorbs a wrong method name, and then the
   * "temporary" fallback is what ships forever, on a material that renders perfectly plausibly.
   * That bug hid across five call sites for the life of the project. `tests/api.test.mjs` exists
   * to catch it and caught this file; the fix is to name the method that exists, not to widen
   * the guard. The optional chaining stays — SHADING genuinely may not be registered yet.
   *
   * Going through the shared factory is also what keeps a coin looking like it belongs: a
   * MeshStandardMaterial coin in a cel-shaded frame reads as a foreign object, and would not
   * receive the shade-side response the cel ramp is tuned around.
   */
  _mat(key, extra = null) {
    const shading = this.engine.get?.('shading');
    const tex = this.engine.get?.('textures')?.get?.('gold_leaf') || null;
    /* Mirrors Props.js MATERIALS.gold exactly — pickups must not become a sixth gold.
       `extra` (§724) spreads LAST so a caller can vary a slot INSIDE the option bag —
       `shading.make` caches by option key, so two calls that differ in their opts come back as
       two materials, while two calls with the same opts come back as ONE. That cache is why
       `_coinMat` must never again mutate what this returns: the mutation was reaching every
       later same-key call. See `_coinMat` for the measurement. */
    const opts = {
      name: 'pickups:gold',
      color: 0xe8b942, map: tex?.map ?? null, normalMap: tex?.normalMap ?? null,
      roughnessMap: tex?.roughnessMap ?? null, aoMap: tex?.aoMap ?? null,
      metalnessMap: tex?.metalnessMap ?? null,
      bands: 3, rim: 0.55, rimColor: 0x7fd4ff, spec: 0.9, gloss: 96, metal: 0.85,
      ...(extra || {}),
    };
    let m = null;
    try { m = shading?.make ? shading.make(opts) : null; } catch { m = null; }
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: opts.color, roughness: 0.28, metalness: 0.85, map: opts.map,
        vertexColors: !!opts.vertexColors,
      });
    }
    this._materials.push(m);
    return m;
  }

  /**
   * The reference project's coin badge as a `DataTexture`, or null where it cannot be decoded.
   *
   * ── What this is, stated plainly, because the instruction's premise was wrong ────────────────
   * The instruction was *"substitute out the texture of the coins with the coin texture from the
   * godot repo"*. **That repository has no coin texture.** Its 3D coin,
   * `Scenes/Design Tools/pickup_coin.tscn`, is a procedural `CylinderMesh` under a
   * `StandardMaterial3D` carrying an albedo colour, an emission colour, a rim and a clearcoat and
   * **no `albedo_texture`**; `Assets/Models/Pickups/` holds a bottle and a diamond and no coin.
   * What ships here is the one coin IMAGE in that repository — a gold coin struck with a
   * five-pointed star, filed under `Assets/Textures/Icons/` as a **UI icon**. It is a coin face,
   * so it goes on the coin's face. That it is an icon is recorded here, in `CoinBadge.js` and in
   * `staging/assets/sly-coin/PROVENANCE.md` rather than smoothed over, because it is the one fact
   * a reader needs in order to redirect this cheaply if they meant something else.
   *
   * ── Rows are flipped here, deliberately ─────────────────────────────────────────────────────
   * PNG stores rows top-down and three's UV origin is bottom-left, so an unflipped `DataTexture`
   * lands the badge upside down. `flipY` is NOT the fix: three has historically ignored it for
   * `DataTexture`, so relying on it is relying on a detail that has changed. The rows are
   * reversed in JS instead, which is deterministic and is what `tests/pickups.test.mjs` can
   * actually assert. (The star is mirror-symmetric about its vertical axis, so the fact that a
   * cylinder's two caps see the same image mirrored costs nothing here — worth knowing before
   * anyone maps an asymmetric die onto this.)
   */
  async _badgeTexture() {
    let img = null;
    try { img = await decodeCoinBadge(); } catch { img = null; }
    if (!img?.data || img.size !== COIN_BADGE_SIZE) return null;
    const n = img.size, row = n * 4;
    const flipped = new Uint8Array(img.data.length);
    for (let y = 0; y < n; y++) flipped.set(img.data.subarray(y * row, y * row + row), (n - 1 - y) * row);
    const t = new THREE.DataTexture(flipped, n, n, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    /* Clamp, not repeat: the cap UVs are exactly 0..1 and the rim UVs are one texel, so there is
       nothing to tile and a wrap would only ever be an artefact at the disc's edge. */
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    t.needsUpdate = true;
    this._geoms.push(t);          // disposed with the pool (`dispose?.()`), same as every geometry
    return t;
  }

  /**
   * The coin's own material: the gold recipe with the badge on `map`.
   *
   * A SEPARATE material from `_mat('gold')` on purpose, and it costs no extra draw: the coins are
   * already one `InstancedMesh`, so this swaps WHICH texture that one draw samples rather than
   * adding a draw. What it must not do is reach the treasure — `_treasureGeo` builds the Eye of
   * Ra out of `coin()` discs and the hoard is 140 more, and a badge struck across a sun disc is
   * exactly the silent regression a shared material would produce.
   *
   * ── §724 CORRECTION: for one release, in the browser, it DID reach the treasure ────────────
   * §712 wrote "`_mat` already returns a fresh material per call, so the separation is real
   * rather than assumed" — and that sentence was true only where it was checked. In plain Node
   * SHADING is unregistered, `_mat` falls to `new MeshStandardMaterial(...)`, and every call is
   * fresh — which is the arm `pickups` C4 runs in, so C4 passed. In the BROWSER, `shading.make`
   * CACHES by option key; this method used to take that cached instance and mutate it, and the
   * treasure loop's own `_mat('gold')` — same opts, same key — then received the mutated one.
   * Measured live (`tools/pileshot.mjs` at `defcf63`): all four treasures reported
   * `{shares: true, badge: true, color: #ffffff}` — the Eye of Ra was wearing the badge's four
   * wrapped corners at white, in the vault, next to the pile the owner called faded. The fix is
   * to ask the FACTORY for the difference instead of mutating its answer: the badge, the white
   * `color`, and the dropped tiling detail slots ride in the option bag, so the factory hands
   * back a DIFFERENT cached material rather than a corrupted shared one. (Dropped because they
   * sample `gold_leaf`'s UVs, which the badge coin no longer has — its caps are a 0..1 badge
   * lookup; leaving them on would drape a stone-scale normal and roughness pattern across a
   * 0.48 m face at one tile per coin.)
   *
   * `color` drops to white where the badge is present. The gold recipe tints `map` by `0xe8b942`,
   * which on a map that is *already* gold multiplies to a muddy olive; the badge carries its own
   * colour, exactly as `BOTTLE.glb`'s vertex stream does for the clue bottle (§700). With no
   * badge the recipe is untouched, so a host that cannot inflate gets today's plain gold coin
   * rather than a white one. This is a defect fix, not part of the §724 coloring, so
   * `?pile=faded` does NOT revert it.
   */
  _coinMat() {
    if (!this._badgeTex) return this._mat('gold');
    return this._mat('gold', {
      name: 'pickups:coin-badge',
      map: this._badgeTex, color: 0xffffff,
      normalMap: null, roughnessMap: null, aoMap: null, metalnessMap: null,
    });
  }

  /* --------------------------------------------------------------------- */

  _wire() {
    const on = (evt, fn) => { const off = this.engine.on(evt, fn); if (off) this._offs.push(off); };

    /* Being driven to CHASE while carrying costs you the treasure. This is the risk half of the
       loop; without it, carrying is just a longer walk. */
    on('guardAlert', (p) => {
      if (!p) return;
      if (p.id != null) this._alert.set(p.id, p.state);
      if (p.state === 'chase' && this.wallet.carrying) this._dropTreasure();
    });

    /**
     * A pickpocket is the other way loot enters the game, and `guardPickpocket` carries the
     * guard's ACTUAL rolled loot.
     *
     * **CORRECTION (§742), because the comment that stood here was two owners out of date.** It
     * read *"the HUD is currently paying a flat 25 for the raw intent event instead"*. That has
     * not been true since `tests/pickpocket.test.mjs` landed: `HUD.js:786` now credits
     * `p.coins` on THIS event and pins that it does not credit the intent, and `Health.js:149`
     * banks the same number into the charm purse. The conclusion the stale comment drew is still
     * the right one and now for the right reason — **this module must not bank, because the
     * steal is already paid exactly once and banking here would be the second path.** That is
     * also why the coins `_popPocket` throws pay nothing at all. See `POCKET`'s header.
     */
    on('guardPickpocket', (p) => {
      if (!p) return;
      this._lastPocket = { coins: p.coins ?? 0, item: p.item ?? null, id: p.id ?? null };
      if (POP_ON) this._popPocket(p);
    });
  }

  /* ------------------------------------------------------ §742 the pop --- */

  /**
   * Throw the guard's pouch open. One call per steal; never on the frame clock.
   *
   * ── The spawn point comes off the RIG, and the payload is what carries it ──────────────────
   * `Guard.pickpocket()` publishes `pocket` — the world position of the pouch, taken from the
   * guard's `hips` bone matrix and pushed `pocketBack` along −forward (see `Guard._pocketWorld`,
   * which also sweeps that offset once so a guard with his back to a wall does not open his
   * pouch inside the masonry). It is a fresh Vector3 per steal, so holding it for a spawn loop
   * is safe. Measured across all nine roster guards by `tools/pocketpop.mjs`: the spawn sits
   * **0.345 m behind his facing** and **0.60–0.62 m above his feet**, against a head that is at
   * ~1.95 m. That is a belt, not a skull, and it is the number rather than the intention.
   *
   * The fallback is `pos` (the guard's FEET) lifted to belt height — used only when an older
   * GUARDS is in the tree or a test emits a bare payload. Deliberately a bad-but-safe place:
   * behind him at his own waist rather than floating at head height, which is the failure the
   * brief named ("erupting from his head").
   *
   * @param {{coins?:number, pocket?:THREE.Vector3, pos?:THREE.Vector3, forward?:THREE.Vector3, yaw?:number}} p
   * @returns {number} how many discs were actually thrown
   */
  _popPocket(p) {
    const n = popCount(p?.coins);
    if (n <= 0) return 0;

    /* Behind him means behind his FACING, so the fan is aimed down −forward. `forward` is read
       here and never retained. */
    let fx = 0, fz = 1;
    if (p?.forward && Number.isFinite(p.forward.x)) { fx = p.forward.x; fz = p.forward.z; }
    else if (Number.isFinite(p?.yaw)) { fx = Math.sin(p.yaw); fz = Math.cos(p.yaw); }
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;

    const src = p?.pocket && Number.isFinite(p.pocket.x) ? p.pocket : null;
    const sx = src ? src.x : num(p?.pos?.x, 0);
    const sy = src ? src.y : num(p?.pos?.y, 0) + POCKET_FALLBACK_UP;
    const sz = src ? src.z : num(p?.pos?.z, 0);

    const R = this._popRng;
    let thrown = 0;
    for (let i = 0; i < n; i++) {
      const c = this._popSlot();
      if (!c) break;
      /* A fan about −forward, not a sphere: a sphere throws half the coins THROUGH him. */
      const a = (n === 1 ? 0 : ((i / (n - 1)) - 0.5) * 2) * POCKET.spread + R.jitter(0.12);
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = (-fx) * ca - (-fz) * sa;
      const dz = (-fz) * ca + (-fx) * sa;
      const out = POCKET.out + R.jitter(POCKET.outJitter);

      c.pos.set(sx, sy, sz);
      c.vel.set(dx * out, POCKET.up + R.jitter(POCKET.upJitter), dz * out);
      c.t = 0;
      c.life = POCKET.life;
      c.scale = 1;
      c.phase = R.range(0, Math.PI * 2);
      c.born = this._popSeq++;
      thrown++;
    }
    this._popStats.pops++;
    this._popStats.spawned += thrown;
    return thrown;
  }

  /**
   * Claim a slot. A full pool recycles the OLDEST live coin rather than refusing the pop — a
   * steal that produced nothing visible would read as a bug, and the oldest coin is by
   * construction the one furthest through its own beat.
   */
  _popSlot() {
    const pool = this.pocketCoins;
    if (!pool.length) return null;
    if (this._popLive < pool.length) return pool[this._popLive++];
    let oldest = 0;
    for (let i = 1; i < this._popLive; i++) if (pool[i].born < pool[oldest].born) oldest = i;
    this._popStats.evicted++;
    return pool[oldest];
  }

  /** Retire slot `i` by swapping it with the last live one. No splice, no allocation. */
  _popFree(i) {
    const pool = this.pocketCoins;
    const last = this._popLive - 1;
    if (i !== last) { const t = pool[i]; pool[i] = pool[last]; pool[last] = t; }
    this._popLive = last;
    pool[last].born = -1;
  }

  /**
   * Sly takes it. **The one and only way a popped coin is retired, and it pays nothing.**
   *
   * Kept as a named method with three lines in it rather than inlined into `update`, because
   * what it does NOT do is the load-bearing part and needs somewhere to be written down. It does
   * not call `award()`, it does not call `_coin()`, and it emits nothing at all — not even
   * `coin` with `amount: 0`. `HUD.addCoins` and `Health.bank` both no-op on 0, but
   * `Audio._onCoins` would still schedule a chime and FX would still burst, and a chime for a
   * payment that did not happen is a lie the player can hear. The steal has its own beat, its own
   * toast and its own "+N" punch, and all three already fired at the instant `guardPickpocket`
   * went out. See `POCKET`'s header for the whole argument.
   */
  _absorbPop(i) {
    this._popStats.collected++;
    this._popFree(i);
  }

  /**
   * One popped coin, one frame. Two phases, no world interaction.
   *
   * @param {object} c    the pool record
   * @param {number} dt
   * @param {THREE.Vector3} target  Sly's chest — see the call site for why it is the chest
   * @returns {boolean} true on the frame it reaches him
   */
  _stepPop(c, dt, target) {
    c.t += dt;
    if (c.t < POCKET.popTime) {
      /* Pure ballistics out of the pouch. `gravity` acts here and nowhere else: it is what turns
         a radial burst into a scatter with weight in it. */
      c.vel.y -= POCKET.gravity * dt;
      c.pos.addScaledVector(c.vel, dt);
      return false;
    }

    _pN.subVectors(target, c.pos);
    const d = _pN.length();
    /* `TUNE.collect` and nothing else. It is the contact radius every other coin in this game is
       taken at (`stepPickup`), so "absorbed at his chest" means the same distance here as there
       — one number, one meaning, and a coin resize moves both together. */
    if (d <= TUNE.collect) return true;
    _pN.divideScalar(d);

    /**
     * Speed ramps from the magnet's own floor to its own ceiling over `homeRamp`.
     *
     * Borrowed rather than invented, for the reason `TUNE.speedMax`'s comment gives: it is
     * `2 × Controller.TUNE.runSpeed` and it must strictly beat a sprinting player, or a coin
     * thrown at a retreating Sly never lands. A second, differently-felt convergence speed
     * beside the magnet's is exactly the drift this file's TUNE header exists to prevent.
     */
    const k = Math.min(1, (c.t - POCKET.popTime) / POCKET.homeRamp);
    const speed = TUNE.speedMin + (TUNE.speedMax - TUNE.speedMin) * k * k;

    /* STEER, do not replace. The residual pop velocity is still pointing away from him, so the
       blend draws the arc for free — see `POCKET.homeTurn`. */
    const turn = Math.min(1, POCKET.homeTurn * dt);
    c.vel.x += (_pN.x * speed - c.vel.x) * turn;
    c.vel.y += (_pN.y * speed - c.vel.y) * turn;
    c.vel.z += (_pN.z * speed - c.vel.z) * turn;
    c.pos.addScaledVector(c.vel, dt);
    return c.pos.distanceTo(target) <= TUNE.collect;
  }

  /* --------------------------------------------------------------------- */

  update(dt, t) {
    /**
     * Sync the HUD to the starting purse, on the first frame rather than in init().
     *
     * `HUD.js:540 on('coins', ...)` is the absolute-set channel, and it was the SECOND dead
     * listener in that file — nothing emitted `coins` either. But emitting it from init() would
     * have reproduced §223.3 exactly: MANIFEST registers `pickups` before `hud`, `initModules`
     * inits in registration order, and HUD installs its listeners in its own `init()` — so the
     * event would have landed in an empty listener set and vanished. It is invisible today only
     * because the purse starts at 0 and so does the HUD. By the first update() every module has
     * initialised, which is the same reasoning `Engine._flushColliders` already uses.
     */
    if (!this._synced) { this._synced = true; this._emit('coins', this.wallet.coins); }

    if (!(dt > 0)) { this._writeCoinMatrices(t || 0); return; }
    const mv = this.engine.get?.('movement');
    if (mv?.position) this._playerPos.copy(mv.position);
    const player = this._playerPos;

    for (const c of this.coins) {
      if (c.taken) continue;
      if (stepPickup(c, player, dt, TUNE)) this._collectCoin(c);
    }

    /**
     * §742 — the popped coins, flying to him.
     *
     * Backwards, because `_absorbPop`/`_popFree` swap the tail into the slot they retire and a
     * forward loop would then step the swapped-in coin twice on the same frame.
     *
     * The target is the capsule's CENTRE, not its base — `TUNE.grabHeight`'s own comment gives
     * the reason and `stepPickup` uses the same offset: `movement.position` is his feet, and a
     * coin converging on his feet reads as being dropped rather than pocketed. So a popped coin
     * and a magnetised one arrive at the same point, by the same number.
     */
    if (this._popLive) {
      _pTarget.set(player.x, player.y + TUNE.grabHeight, player.z);
      for (let i = this._popLive - 1; i >= 0; i--) {
        const c = this.pocketCoins[i];
        c.life -= dt;
        if (c.life <= 0) { this._popStats.expired++; this._popFree(i); continue; }
        if (c.life < POCKET.fade) c.scale = Math.max(0, c.life / POCKET.fade);
        if (this._stepPop(c, dt, _pTarget)) this._absorbPop(i);
      }
    }

    for (const c of this.clues) {
      if (c.taken) continue;
      if (stepPickup(c, player, dt, CLUE_TUNE)) this._collectClue(c);
    }

    for (const tr of this.treasures) {
      /* `locked` is checked here rather than inside `stepPickup`, which is a pure function over
         one pickup and must stay that way — the gate is a property of this level's economy, not
         of the magnet law. A locked treasure is not merely invisible: it never enters the
         magnet at all, so walking through the vault with eleven bottles cannot snag it. */
      if (tr.taken || tr.banked || tr.locked) continue;
      if (stepPickup(tr, player, dt, TUNE)) this._takeTreasure(tr);
    }

    if (this.wallet.carrying) {
      const d = Math.hypot(player.x - this.fence.x, player.z - this.fence.z);
      if (d <= TUNE.fence) this._bankTreasure();
    }

    this._writeCoinMatrices(t || 0);
  }

  /** Idle bob + spin. Magnetised coins stop bobbing — they are being pulled, not floating. */
  _writeCoinMatrices(t) {
    const mesh = this._coinMesh;
    if (mesh) {
      const base = this.coins.length;
      for (let i = 0; i < base; i++) {
        const c = this.coins[i];
        if (c.taken) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); continue; }
        const y = c.magnet ? c.pos.y : c.home + Math.sin(t * TUNE.bobRate + c.phase) * TUNE.bobAmp;
        _v.set(c.pos.x, y, c.pos.z);
        _m.compose(_v, _q.setFromEuler(_e.set(Math.PI / 2, 0, t * TUNE.spinRate + c.phase)), _one);
        mesh.setMatrixAt(i, _m);
      }
      /**
       * §742 — the popped coins share this buffer, in the headroom past the authored set.
       *
       * Same pose function as every other coin — that is the point of sharing the mesh — with
       * two differences, both properties of a coin that is in flight and never at rest: no bob
       * (a bob added to a position an integrator is already moving is the coin fighting itself),
       * and a scale, which is the last `POCKET.fade` seconds of a coin that could not reach him
       * shrinking away rather than blinking out.
       */
      for (let k = 0; k < this._popLive; k++) {
        const c = this.pocketCoins[k];
        _pScale.set(c.scale, c.scale, c.scale);
        _m.compose(c.pos, _q.setFromEuler(_e.set(Math.PI / 2, 0, t * TUNE.spinRate + c.phase)), _pScale);
        mesh.setMatrixAt(base + k, _m);
      }
      /* The headroom costs nothing while it is empty: with `_popLive` 0 this is exactly the
         count the mesh had before §742, so an idle frame draws the same triangles it always did. */
      mesh.count = base + this._popLive;
      mesh.instanceMatrix.needsUpdate = true;
    }
    const cm = this._clueMesh;
    if (cm) {
      for (let i = 0; i < this.clues.length; i++) {
        const c = this.clues[i];
        if (c.taken) { _m.makeScale(0, 0, 0); cm.setMatrixAt(i, _m); continue; }
        const y = c.magnet ? c.pos.y : c.home + Math.sin(t * TUNE.clueRate + c.phase) * TUNE.clueBob;
        /* Upright, spinning about its own axis, and rocking side to side on the reference's own
           1.5 s loop (see `TUNE.clueRock`). A bottle laid flat like a coin reads as litter; a
           bottle that only spins reads as a turntable. The sway is dropped the instant the
           magnet has it, because from then on the bottle is being pulled to a point and a
           lateral offset would only fight the integrator — the rock is pure rotation and costs
           the magnet nothing, so it rides all the way in. */
        const swing = Math.sin(t * TUNE.clueRockRate + c.phase);
        _v.set(c.pos.x + (c.magnet ? 0 : swing * TUNE.clueSway), y, c.pos.z);
        /* 'ZYX' so the rock is the OUTER rotation — the bottle yaws inside a frame that leans,
           which is the parenting `bottle.tscn` uses (`BOTTLE ROT` is the rocking node and the
           mesh is its child). Under the default 'XYZ' the lean would be applied inside the spin
           and the bottle would wobble like a gimbal instead of swinging like a pendulum. */
        _m.compose(_v, _q.setFromEuler(_eRock.set(0, t * TUNE.clueSpin + c.phase, swing * TUNE.clueRock)), _one);
        cm.setMatrixAt(i, _m);
      }
      cm.instanceMatrix.needsUpdate = true;
    }

    for (const tr of this.treasures) {
      if (!tr.mesh) continue;
      tr.mesh.visible = !tr.taken && !tr.banked && !tr.locked;
      if (!tr.mesh.visible) continue;
      const y = tr.magnet ? tr.pos.y : tr.home + Math.sin(t * TUNE.treasureRate + tr.phase) * TUNE.treasureBob;
      tr.mesh.position.set(tr.pos.x, y, tr.pos.z);
      tr.mesh.rotation.y = t * TUNE.treasureSpin + tr.phase;
    }
  }

  /* --------------------------------------------------------------------- */

  /**
   * A coin was touched. **`pay` decides whether that is a transaction (§742).**
   *
   * Every authored coin pays; the pickpocket pop does not, and is retired by `_absorbPop`
   * instead — it never reaches this method on the shipped path. **This guard is therefore not
   * decoration and it is not dead: it is a standing refusal at the one door a popped coin could
   * come back through.** §742's own first draft handed the pops to `stepPickup` and the magnet,
   * which routes every one of them straight here, and that draft is exactly what the guard
   * exists to make safe. A later change that reintroduces the handoff finds a wall rather than a
   * second payout.
   *
   * A per-record boolean rather than a `kind` string on purpose: `kind` is presentation
   * (`single`/`stack`/`pile`) and has already been read as an index once in this file's history.
   */
  _collectCoin(c) {
    if (c.pay === false) return;
    this.award(c.value, c.pos);
  }

  /**
   * Pay coins from somewhere that is not a coin. **Public, and the reason it is public matters.**
   *
   * The wallet header above records the trap in detail: `coin` is banked by `Wallet.credit()`
   * here AND by `Health.js:148` into the charm purse, through two independent paths off one
   * event. A second module emitting `coin` directly would therefore move the purse, the HUD and
   * the FX and leave `Wallet.coins` behind — a divergence with no assertion that catches it and
   * no visual that looks wrong until a charm is awarded for an empty wallet.
   *
   * `src/world/Smashables.js` needed to pay for a broken jar. Rather than let it publish, it
   * calls this, and `_coin` remains what its own docblock says it is: the one event shape and
   * the only place it is built. Any future coin source — a chest, a guard's dropped purse — is
   * expected to come through here for the same reason.
   *
   * @param {number} value  coins to credit. Doubles as Audio's chime count, capped at 6.
   * @param {THREE.Vector3} pos  where it happened; copied, never retained.
   */
  award(value, pos) {
    const milestone = this.wallet.credit(value);
    this._coin(value, pos);
    if (milestone) this._emit('toast', { text: `${milestone} coins`, icon: 'coin' });
    return milestone;
  }

  /**
   * The publisher `clue` never had.
   *
   * `Audio.js:1305` has subscribed to this event, with a built and tested `clue_bottle` cue
   * behind it, for as long as both files have existed; `emit('clue')` appeared nowhere in
   * `src/`. That is §239's shape exactly — the same defect the coin loop had — and it is why
   * this is four lines rather than a feature.
   *
   * NOT a coin. A clue bottle pays nothing into the wallet and nothing into `Health.purse`: in
   * the series it is a set you complete, and crediting it would make the charm arc and the
   * purse move on something the player will also expect to count separately. The count lives
   * here as a plain increment off the collection actually observed — see `_clueBottles()` in
   * PROPS for the reference manager's version of this, which computes it from set sizes at
   * `_ready()` and is identically zero.
   */
  _collectClue(c) {
    this.clueCount = (this.clueCount || 0) + 1;
    /* `pos` is read by AUDIO. **`found` and `total` are read by nothing** (§430), and they are
       kept as redundant rather than wired: the same two numbers already reach the player as the
       toast text one line below, and the *set* is consumed inside this module by
       `clueComplete()`, not off the bus. A HUD counter keyed on them would be a new widget, not
       a dropped field — which is the distinction §428.4 was drawn to make. */
    this._emit('clue', { pos: new THREE.Vector3().copy(c.pos), found: this.clueCount, total: this.clues.length });
    this._emit('toast', {
      text: `Clue bottle ${this.clueCount} / ${this.clues.length}`,
      icon: 'clue',
    });
    if (this.clueComplete()) this._openVault(c.pos);
  }

  /**
   * Is the set finished? **`total > 0` is the whole assertion**, and it is not defensive noise.
   *
   * `this.clues` is populated by adopting `Props._collect`. With PROPS absent — headless boot,
   * an early frame, a level that never placed bottles — the array is empty, and the natural
   * spelling `found >= total` is `0 >= 0`, which is TRUE. The vault would spring open on the
   * first update of a level containing no bottles at all, and nothing would look wrong: the Eye
   * would simply be sitting there.
   *
   * That is the same arithmetic that made `bottle_manager._ready()` in the reference compute
   * `bottles_count = bottles_count_max - bottles.size()` and get identically zero — a set-size
   * expression evaluated at a moment when the set is not yet what it will be. Different sign,
   * same trap, and worth naming because this file's own header already records that PROPS may
   * be absent or reshaped and that adoption must degrade safely.
   */
  clueComplete() {
    const total = this.clues.length;
    return total > 0 && (this.clueCount || 0) >= total;
  }

  /**
   * The twelfth bottle opens the vault. This is the whole payoff and it is deliberately small.
   *
   * ── Why a treasure and not a new system ───────────────────────────────────────────────────
   * In Sly 2 and 3 the bottles buy the combination to a safe and the safe holds an ability. This
   * project has no ability system and is not getting one, so an unlock that pointed at one would
   * be a tenth §357.1 machine wired at one end — the exact defect the clue bottles were sitting
   * in. The reward therefore routes entirely through plumbing that is ALREADY live at both ends:
   * the Eye becomes a normal treasure, and `_takeTreasure` / `_dropTreasure` / `_bankTreasure`
   * give it carry-slowdown, drop-on-CHASE, the fence walk, the HUD carry card (`HUD.js:650-652`)
   * and the Audio banking sting (`Audio.js:1380`) for free. Not one new subscriber is required
   * for the reward itself, which is the test of whether a payoff is modest.
   *
   * ── `objective` — a listed dead subscription, closed ──────────────────────────────────────
   * `tests/eventbus.test.mjs` lists `objective` under DEAD_UNBUILT: *"the HUD renders an
   * objective card and `HUD.init` sets the only one that ever appears, by direct call. The event
   * is the hook a mission script would use."* Opening the vault is the first thing in this game
   * that is a mission beat, so it is the right publisher and this is the second dead end the
   * clue bottles close. The census file's own doctrine is that the line is DELETED when it
   * lands, not moved to a "fixed" list, and it has been.
   *
   * The title is deliberately UNCHANGED from `HUD.js:338`'s. `HUD.objective()` stores a
   * non-transient objective as `_objBase` and restores it after a carry ends, so rewriting the
   * title here would permanently replace the level's standing goal with a line about a vault.
   * Only the subtitle moves — the goal was always "Steal the Eye of Ra"; what changed is that
   * it is now possible.
   */
  _openVault(at) {
    const tr = this.treasures.find((t) => t.locked === 'clues');
    if (!tr || this.vaultOpen) return;
    this.vaultOpen = true;
    tr.locked = null;

    this._emit('toast', { text: 'The vault is open — the Eye of Ra', icon: 'eye' });
    this._emit('objective', {
      title: 'Steal the Eye of Ra',
      sub: `The vault under the hall — all ${this.clues.length} clue bottles found`,
    });

    /* A glint on the Eye itself, so the thing that changed is visible from wherever the last
       bottle was taken. `spawn()` is FX's own public direct-call path (`Particles.js:2765`, the
       same one PROPS uses for braziers) rather than a new bus event nobody subscribes to.
       `coin_sparkle` is the catalogue's existing "a pickup announces itself" curve. Guarded:
       FX is absent headless, and a decoration must never cost the player his unlock. */
    try {
      const fx = this.engine.get?.('fx');
      fx?.spawn?.('coin_sparkle', { position: tr.pos });
      if (at) fx?.spawn?.('coin_sparkle', { position: at });
    } catch { /* see above */ }
  }

  /**
   * The clue bottle's own material — glass, not gold.
   *
   * Mirrors `Props.MATERIALS.glass` exactly (`0x8fd8ff` at 0.55 opacity), for the same reason
   * `_mat` mirrors `MATERIALS.gold`: two modules drawing the same object in two different
   * blues is the class of drift this file already refuses once. `0x8fd8ff` is §2.1.6's pickup
   * colour and was put in that table for this object, which had no consumer until now.
   */
  /**
   * The clue bottle's material — one recipe for all three of the imported mesh's groups.
   *
   * `color` is white and `vertexColors` is on: the geometry carries the source's own
   * `baseColorFactor`s per vertex, and a tint here would multiply a second grade over them. What
   * used to be here was `color: 0x8fd8ff` at `opacity 0.55` — §2.1.6's pickup blue — because the
   * bottle was a pale lathe with no surface of its own to lose.
   *
   * **The pickup-blue signal did not go away; it moved to the rim.** `rimColor 0x8fd8ff` is
   * unchanged, and a rim is what actually carries "collectable" at the distance these are read
   * from — the body colour was doing that job only by accident of having no other one. `spec`
   * and `gloss` are unchanged with it. Stated narrowly on purpose: `SparkleField`'s §2.1.6 blue
   * diamonds mark **traversal affordances** off COLLISION's query, not pickups, so no claim is
   * made here about a sparkle around the bottle — checked in `Particles.js`, not assumed.
   *
   * Opaque, because the source authors alpha 1 on every factor and declares no `alphaMode`, and
   * because a near-black glass at 0.55 is smoke.
   */
  _clueMat() {
    const shading = this.engine.get?.('shading');
    const opts = {
      name: 'pickups:glass',
      color: 0xffffff, rough: 0.15, roughness: 0.15, vertexColors: true,
      bands: 3, rim: 0.7, rimColor: 0x8fd8ff, spec: 0.8, gloss: 72,
      side: THREE.DoubleSide,
    };
    let m = null;
    try { m = shading?.make ? shading.make(opts) : null; } catch { m = null; }
    if (!m) m = new THREE.MeshStandardMaterial({ color: opts.color, roughness: 0.15, vertexColors: true, side: THREE.DoubleSide });
    this._materials.push(m);
    return m;
  }

  _takeTreasure(tr) {
    if (this.wallet.carrying) {
      /* One at a time — the series' own rule, and the reason carrying is a decision. */
      tr.taken = false;
      return;
    }
    tr.taken = true;
    tr.magnet = false;
    this.wallet.carrying = tr;
    this._emit('toast', { text: `${tr.name} — carry it to the fence`, icon: 'coin' });
    this._emit('treasurePickup', { id: tr.id, name: tr.name, value: tr.value, pos: tr.pos.clone() });
  }

  _bankTreasure() {
    const tr = this.wallet.carrying;
    if (!tr) return;
    this.wallet.carrying = null;
    tr.banked = true;
    tr.taken = true;
    this.wallet.treasures++;
    const milestone = this.wallet.credit(tr.value);
    /* The payoff beat: the coin event fires HERE, at the fence, not where it was picked up. All
       three listeners light up on the moment the loot actually becomes yours. */
    this._coin(tr.value, this.fence);
    this._emit('toast', { text: `${tr.name} fenced — ${tr.value}`, icon: 'coin' });
    /* HUD reads `name` and `value`; AUDIO's handler takes no parameter. **`id` and `total` are
       read by nothing** (§430). `total` is redundant — the HUD's purse is fed by the `coin`
       event `_coin()` emits two lines above, so wiring it would give one number two sources.
       `id` is provenance for a save file or an objective tracker, neither of which exists. */
    this._emit('treasureBanked', { id: tr.id, name: tr.name, value: tr.value, total: this.wallet.coins });
    if (milestone) this._emit('toast', { text: `${milestone} coins`, icon: 'coin' });
  }

  _dropTreasure() {
    const tr = this.wallet.carrying;
    if (!tr) return;
    this.wallet.carrying = null;
    tr.taken = false;
    tr.magnet = false;
    tr.pos.copy(this._playerPos);
    tr.pos.y += 0.35;
    tr.home = tr.pos.y;
    this._emit('toast', { text: `Dropped ${tr.name}`, icon: 'coin' });
    this._emit('treasureDropped', { id: tr.id, name: tr.name, pos: tr.pos.clone() });
  }

  /**
   * The one event shape, and the only place it is built.
   *
   * `pos` is a fresh Vector3 every time — see the header. Do not "optimise" this into a shared
   * scratch: `Audio._onCoins` schedules a delayed read of it.
   */
  _coin(amount, pos) {
    this._emit('coin', { amount, pos: new THREE.Vector3().copy(pos) });
  }

  _emit(evt, payload) {
    try { this.engine.emit(evt, payload); }
    catch { /* a listener must never cost the player his loot — Guard.js's own rule */ }
  }

  /* --------------------------------------------------------------------- */

  /** For the debug overlay and the analysis harness. */
  debugInfo() {
    return {
      ...this.wallet.state(),
      placed: this.stats.coins, treasuresPlaced: this.stats.treasures,
      remaining: this.coins.reduce((n, c) => n + (c.taken ? 0 : 1), 0),
      cluesPlaced: this.stats.clues, cluesFound: this.clueCount || 0,
      vaultOpen: !!this.vaultOpen,
      lastPocket: this._lastPocket || null,
      /* §742. `popLive` is the number of cosmetic coins in the air right now; the counters
         beside it are cumulative. `evicted` above zero means the pool is undersized for how the
         level is actually being played, which is the one number that would justify raising it. */
      popLive: this._popLive, pop: { ...this._popStats },
    };
  }

  dispose() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    for (const deco of this._decoHidden) deco.visible = true;
    this._decoHidden.length = 0;
    for (const g of this._geoms) g.dispose?.();
    for (const m of this._materials) m.dispose?.();
    this.root.removeFromParent();
    this.root.clear();
  }
}

/* Scratch — update() allocates nothing beyond the documented per-collection Vector3 (§5). */
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
/**
 * The clue bottle's rock needs order 'ZYX' and gets its OWN Euler rather than borrowing `_e`.
 *
 * `Euler.set(x, y, z, order)` leaves the order alone when the argument is omitted, so a single
 * `_e.set(…, 'ZYX')` in the clue loop would persist into the coin loop's
 * `_e.set(Math.PI / 2, 0, spin)` on every subsequent frame — and a coin composed 'ZYX' is spun
 * about world Z after being laid flat, which tumbles it instead of turning it on the spot. One
 * extra module-scope object, and the two loops cannot reach each other.
 */
const _eRock = new THREE.Euler(0, 0, 0, 'ZYX');
const _one = new THREE.Vector3(1, 1, 1);
/* §742's flight step. Its own scratch, because `_v`/`_d` are live inside `stepPickup` and
   `_writeCoinMatrices` on the same frame and aliasing them is §237's trap one file over. */
const _pN = new THREE.Vector3();
const _pTarget = new THREE.Vector3();
const _pScale = new THREE.Vector3(1, 1, 1);

export default Pickups;
