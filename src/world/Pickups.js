import * as THREE from 'three';
import { rng, WORLD_SEED } from '../core/Rand.js';
import { coin as coinGeo, ingot, scarab, collar, place, mergeAll } from './PropKit.js';

/**
 * Pickups — the collect loop. Coins, treasure, and the fence they are carried to.
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
    this.treasures = [];    // { id, name, value, pos, taken, banked, mesh, phase }
    this.fence = new THREE.Vector3().fromArray(FENCE.pos);

    this._geoms = [];
    this._materials = [];
    this._offs = [];
    this._coinMesh = null;
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
    /* Sync the HUD to the starting purse through the absolute channel it already owns. It had
       no emitter either — `HUD.js:390 on('coins', ...)` was the second dead listener in the
       same file. */
    this._emit('coins', this.wallet.coins);
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
    const adopted = props?._collect?.[0]?.spots;
    if (Array.isArray(adopted)) {
      for (const s of adopted) {
        if (!Array.isArray(s) || s.length < 3) continue;
        specs.push({ kind: 'single', value: COIN_VALUE.single, x: s[0], y: s[1], z: s[2] });
      }
      /* Hide the decorative twin rather than edit a file we do not own. Reversible, and it
         leaves exactly one set of coins in the frame. */
      const deco = props.group?.getObjectByName?.('coins');
      if (deco) { deco.visible = false; this._decoHidden = deco; }
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
  }

  /* --------------------------------------------------------------------- */

  _build() {
    if (!this.coins.length && !this.treasures.length) return;

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
    if (!(dt > 0)) { this._writeCoinMatrices(t || 0); return; }
    const mv = this.engine.get?.('movement');
    if (mv?.position) this._playerPos.copy(mv.position);
    const player = this._playerPos;

    for (const c of this.coins) {
      if (c.taken) continue;
      if (stepPickup(c, player, dt, TUNE)) this._collectCoin(c);
    }

    for (const tr of this.treasures) {
      if (tr.taken || tr.banked) continue;
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
    for (const tr of this.treasures) {
      if (!tr.mesh) continue;
      tr.mesh.visible = !tr.taken && !tr.banked;
      if (!tr.mesh.visible) continue;
      const y = tr.magnet ? tr.pos.y : tr.home + Math.sin(t * TUNE.treasureRate + tr.phase) * TUNE.treasureBob;
      tr.mesh.position.set(tr.pos.x, y, tr.pos.z);
      tr.mesh.rotation.y = t * TUNE.treasureSpin + tr.phase;
    }
  }

  /* --------------------------------------------------------------------- */

  _collectCoin(c) {
    const milestone = this.wallet.credit(c.value);
    this._coin(c.value, c.pos);
    if (milestone) this._emit('toast', { text: `${milestone} coins`, icon: 'coin' });
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
      lastPocket: this._lastPocket || null,
    };
  }

  dispose() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    if (this._decoHidden) this._decoHidden.visible = true;
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
