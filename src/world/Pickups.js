import * as THREE from 'three';
import { rng, WORLD_SEED } from '../core/Rand.js';
import { coin as coinGeo, clueBottle, ingot, scarab, collar, place, mergeAll } from './PropKit.js';

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
 * (r 0.16). Any generosity beyond touching belongs in the magnet term, not in the contact term
 * — that is exactly the distinction §223 drew between a snap radius and a catch radius.
 *
 * `magnet` is `Controller.TUNE.pickRange` (2.4), the reach at which Sly's hands can already
 * take something off a guard's belt. A coin magnet and a pocket reach are the same gesture at
 * different scale, and borrowing the number keeps the game's two theft ranges consistent
 * instead of introducing a second, differently-felt one.
 */
export const TUNE = {
  /* ---- radii (m) ---- */
  coinRadius:    0.16,   // Props.js draws coin(0.16, 0.035); the collectible must match the art
  playerRadius:  0.34,   // Controller.TUNE.radius
  collect:       0.50,   // playerRadius + coinRadius — the capsule actually overlapping the coin
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
  /* Clue bottles. `PropKit.clueBottle`'s own default `h`, kept in step so the collect radius
     below and the art agree — the same reason `coinRadius` is pinned to `coin(0.16, …)`. */
  clueHeight:    0.42,
  /* playerRadius 0.34 + half the bottle's height. A bottle stands up where a coin lies flat, so
     its grabbable extent is vertical and larger than a coin's; using `collect` 0.50 unchanged
     would make you clip through the neck of one before it registered. */
  clueCollect:   0.55,
  clueBob:       0.11,
  clueRate:      1.7,
  clueSpin:      1.1,

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
  }

  /* --------------------------------------------------------------------- */

  async init() {
    this.engine.scene.add(this.root);
    this._author();
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
      /* `clueBottle()` hands back a Bag whose parts are `glass` and `cork`. Merged into one
         geometry and instanced against the gold material would be wrong — a clue bottle is
         glass and its whole job is to read as the §2.1.6 blue that means "pickup" — so this
         gets its own material rather than sharing `_mat('gold')`. */
      const parts = [];
      clueBottle({ h: TUNE.clueHeight, rng: this.rng }).drain((_k, g) => parts.push(g));
      const geo = mergeAll(parts);
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
      const geo = coinGeo(TUNE.coinRadius, 0.035);
      this._geoms.push(geo);
      const mesh = new THREE.InstancedMesh(geo, this._mat('gold'), this.coins.length);
      mesh.name = 'pickup_coins';
      mesh.frustumCulled = false;
      mesh.userData.noShadow = true;   // tiny, and self-shadowing them is pure acne (Props' own note)
      this._coinMesh = mesh;
      this.root.add(mesh);
    }

    for (const t of this.treasures) {
      const geo = this._treasureGeo(t.shape);
      if (!geo) continue;
      this._geoms.push(geo);
      const m = new THREE.Mesh(geo, this._mat('gold'));
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
  _treasureGeo(shape) {
    const R = this.rng;
    if (shape === 'scarab') return place(scarab({ len: 0.42, rng: R }), { y: -0.05 });
    if (shape === 'ingot') return place(ingot({ w: 0.46, h: 0.16, d: 0.26, rng: R }), {});
    /* The Eye of Ra: an upright sun disc with a stepped rim, not a big coin. `coin()` is
       already a disc lathe and the only primitive in PropKit that is one, so the shape is two
       of them — a 0.30 m face standing proud of a 0.34 m backing plate, which gives the 4 cm
       rim that reads as beaten gold rather than as currency. `rx` stands it up: a cylinder's
       axis is +Y, and `Props._collectibles` rotates coins by the same quarter turn to lay them
       FLAT, so leaving it out here is what would make this a coin. The update loop spins it
       about Y, so it presents face, edge, face — the sun disc turning. */
    if (shape === 'eye') {
      return mergeAll([
        place(coinGeo(0.30, 0.08), { rx: Math.PI / 2 }),
        place(coinGeo(0.34, 0.04), { rx: Math.PI / 2, z: -0.05 }),
      ]);
    }
    if (shape === 'collar') {
      const parts = [];
      collar({ r: 0.34, rows: 4, rng: R }).drain((_key, geo) => parts.push(geo));
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
  _mat(key) {
    const shading = this.engine.get?.('shading');
    const tex = this.engine.get?.('textures')?.get?.('gold_leaf') || null;
    /* Mirrors Props.js MATERIALS.gold exactly — pickups must not become a sixth gold. */
    const opts = {
      name: 'pickups:gold',
      color: 0xe8b942, map: tex?.map ?? null, normalMap: tex?.normalMap ?? null,
      roughnessMap: tex?.roughnessMap ?? null, aoMap: tex?.aoMap ?? null,
      metalnessMap: tex?.metalnessMap ?? null,
      bands: 3, rim: 0.55, rimColor: 0x7fd4ff, spec: 0.9, gloss: 96, metal: 0.85,
    };
    let m = null;
    try { m = shading?.make ? shading.make(opts) : null; } catch { m = null; }
    if (!m) m = new THREE.MeshStandardMaterial({ color: opts.color, roughness: 0.28, metalness: 0.85, map: opts.map });
    this._materials.push(m);
    return m;
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

    /* A pickpocket is the other way loot enters the game, and `guardPickpocket` — which carries
       the guard's ACTUAL rolled loot — had no listener at all. See KNOWN_ISSUES: the HUD is
       currently paying a flat 25 for the raw intent event instead. Banking the real number here
       would double-pay against that line, so this only records it for the debug overlay until
       the HUD listener is corrected by its owner. */
    on('guardPickpocket', (p) => {
      if (!p) return;
      this._lastPocket = { coins: p.coins ?? 0, item: p.item ?? null, id: p.id ?? null };
    });
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
      for (let i = 0; i < this.coins.length; i++) {
        const c = this.coins[i];
        if (c.taken) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); continue; }
        const y = c.magnet ? c.pos.y : c.home + Math.sin(t * TUNE.bobRate + c.phase) * TUNE.bobAmp;
        _v.set(c.pos.x, y, c.pos.z);
        _m.compose(_v, _q.setFromEuler(_e.set(Math.PI / 2, 0, t * TUNE.spinRate + c.phase)), _one);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    const cm = this._clueMesh;
    if (cm) {
      for (let i = 0; i < this.clues.length; i++) {
        const c = this.clues[i];
        if (c.taken) { _m.makeScale(0, 0, 0); cm.setMatrixAt(i, _m); continue; }
        const y = c.magnet ? c.pos.y : c.home + Math.sin(t * TUNE.clueRate + c.phase) * TUNE.clueBob;
        _v.set(c.pos.x, y, c.pos.z);
        /* Upright and spinning about its own axis — a bottle laid flat like a coin reads as
           litter. Same argument as `Props.update`'s `upright` branch, which draws the
           decorative twin this one replaces. */
        _m.compose(_v, _q.setFromEuler(_e.set(0, t * TUNE.clueSpin + c.phase, 0)), _one);
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

  _collectCoin(c) {
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
  _clueMat() {
    const shading = this.engine.get?.('shading');
    const opts = {
      name: 'pickups:glass',
      color: 0x8fd8ff, rough: 0.15, roughness: 0.15,
      bands: 3, rim: 0.7, rimColor: 0x8fd8ff, spec: 0.8, gloss: 72,
      transparent: true, opacity: 0.55,
    };
    let m = null;
    try { m = shading?.make ? shading.make(opts) : null; } catch { m = null; }
    if (!m) m = new THREE.MeshStandardMaterial({ color: opts.color, roughness: 0.15, transparent: true, opacity: 0.55 });
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
const _one = new THREE.Vector3(1, 1, 1);

export default Pickups;
