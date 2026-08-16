/**
 * PlayerHealth — the thing that makes a guard's spear mean something.
 *
 * `tests/eventbus.test.mjs` found seventeen dead ends on the bus and this was the largest of
 * them: `health` and `damage` were both **subscribed and never published**. The HUD had a pip
 * row, a hit flash, a vignette punch and a screen shake all wired to numbers that nothing in the
 * game could change; the guards had a full alert ladder, a chase, an attack range and an attack
 * cooldown, and **none of it could hurt him**. Two halves, each individually finished, never
 * introduced — §247's shape exactly.
 *
 * ── This is NOT a hit-point bar, and that is a design decision, not an omission ────────────────
 * Sly Cooper has never had one. In *Sly Cooper and the Thievius Raccoonus* a single touch kills
 * him; a lucky charm — the horseshoe, bought with 100 coins — absorbs exactly one hit and is gone.
 * The health bar arrives in *Sly 2*, and with it a different game: one where you trade damage for
 * position. The one-hit rule is what makes the first game a stealth game, because it means no
 * amount of skill at taking hits can substitute for not being seen.
 *
 * So the rule here is Sly's:
 *
 *   · **Every hit costs exactly one thing.** The `amount` on a `damage` request is deliberately
 *     ignored. There is no such thing as a heavier hit — a Heavy's club and a spear tip cost the
 *     same, because what they cost is *a charm*, and a charm is indivisible.
 *   · **With no charm, one hit is the end of the run** — down, then a respawn at the last calm
 *     checkpoint. Not attrition, not a slow slide: caught is caught.
 *   · **Charms are carried, not regenerated.** They come from coins at the series' own rate, they
 *     do not come back on their own, and death does not refund them.
 *
 * `hp` is therefore `1 + charms` and its maximum is `1 + maxCharms`: Sly himself is the last pip.
 * The HUD renders that row unchanged — it never needed to know the difference.
 *
 * ── The bus contract, written down because the last one was not ───────────────────────────────
 * Three events with three distinct meanings, one publisher and one subscriber each. The whole
 * defect this module closes was two reasonable pieces of code holding different opinions about
 * what an event name meant, so:
 *
 *   `damage`  IN.  A *request* to hurt the player: `{ amount?, dir?, force?, source? }`. Anything
 *                  that can hurt him emits it — a guard landing a swing, a hazard. **This module
 *                  is the only subscriber**, and it is the only thing entitled to decide whether
 *                  the request lands: invulnerability, being already down, and charm accounting
 *                  all live here. That is why the HUD no longer listens to it. A view that
 *                  deducts a pip on a `damage` request cannot know the hit was refused by
 *                  i-frames, and would have desynced from the truth on the very first hit.
 *   `hurt`    OUT. The *physical* consequence: knockback and the hurt animation. `Controller.js`
 *                  has subscribed to this since before there was anything to publish it.
 *   `health`  OUT. The absolute state, `{ hp, max, charms, down, purse, charmCoins,
 *                  charmProgress }`. The HUD renders it and owns no opinion of its own about
 *                  what the number should be. Fields are only ever ADDED to this payload — see
 *                  `_publish` for why renaming one is a different and much worse kind of edit.
 *
 * It also listens to `coin` and `guardPickpocket` to bank charms, and to `guardAlert` so that a
 * checkpoint is never taken somewhere a guard is standing over — a respawn point recorded mid-
 * chase is a death loop, and finding that out in play is expensive.
 *
 * Nothing new is added to the bus. Every event named here already existed with a live counterpart
 * on the other side, so the census's dead-end list gets shorter and never longer.
 */
import { STATE } from '../ai/Patrol.js';

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

/**
 * The numbers, with the reasoning attached.
 *
 * `charmCoins` is the series' own price for a horseshoe. `maxCharms` 2 gives a three-pip row,
 * which is deliberately not five: a five-pip row reads as a health bar, and this is not one.
 */
export const CHARM = {
  maxCharms: 2,
  charmCoins: 100,

  /** i-frames after a charm eats a hit. Long enough to walk out of a guard's swing arc, which at
      `DETECT.attackCooldown` 1.6 s means a single guard can never chain two hits through it. */
  invuln: 1.25,
  /** Longer on respawn: appearing at a checkpoint with 0.2 s of grace is not a second chance. */
  respawnInvuln: 2.4,
  /** The beat between the fatal hit and the world resetting — the knockback needs to read. */
  downTime: 1.15,

  /* Checkpointing. Sampled rather than authored, because the level has no checkpoint markers and
     inventing a set of them is a level-design decision this module has no business making. */
  checkpointEvery: 1.25,
  checkpointMinMove: 2.5,
  /** How long after the last non-patrol alert a spot stops counting as safe to respawn onto. */
  calmTime: 3.0,
};

export class Health {
  constructor(engine) {
    this.engine = engine;

    /** Lucky charms carried. Zero is the normal state and means the next hit ends the run. */
    this.charms = 0;
    /** Down = the fatal hit has landed and the respawn has not happened yet. */
    this.down = false;
    this.invuln = 0;

    /** Coins banked toward the next charm. Not the player's purse — the HUD owns that. */
    this.purse = 0;

    /** Counters, for the record and for tests that need to distinguish "refused" from "landed". */
    this.hits = 0;
    this.deaths = 0;
    this.charmsSpent = 0;
    this.refused = 0;

    this.checkpoint = null;
    this.checkpointYaw = 0;

    this._downTimer = 0;
    this._alertHeat = 0;
    this._cpTimer = 0;
    this._announced = false;
    this._offs = [];
  }

  /** `1 + charms`, or 0 while down. Sly himself is the last pip. */
  get hp() { return this.down ? 0 : 1 + this.charms; }
  get hpMax() { return 1 + CHARM.maxCharms; }

  /**
   * How full the next charm is, 0..1 — or **−1 when there is no next charm to buy**.
   *
   * That sentinel is the whole reason this is computed here instead of being left to whoever
   * renders it. At `maxCharms` the purse is CLAMPED to `charmCoins - 1` by `bank()`, so the
   * obvious `purse / charmCoins` a view would write sits at 0.99 for the rest of the run and
   * reads as "one coin away" while the row is already full. Both naive readings are lies: 0.99
   * says a charm is one coin off, 1.0 says one is about to arrive, and what is actually true is
   * that nothing is accruing at all. The module that owns the clamp is the only thing that can
   * say that without a second copy of the clamp living somewhere else.
   *
   * −1 rather than `null` because every consumer here guards numbers with `Number.isFinite` (or
   * the `num()` helper that wraps it), and `null` fails that guard and silently becomes whatever
   * default the reader supplied — a wrong number rather than a refused one. `HUD._goalDist` uses
   * the same −1 idiom for the same reason.
   *
   * The `min` is belt-and-braces: `bank()`'s loop only exits with `purse >= charmCoins` when it
   * has hit the cap, and that case returns above.
   */
  get charmProgress() {
    if (this.charms >= CHARM.maxCharms) return -1;
    return Math.min(1, this.purse / CHARM.charmCoins);
  }

  async init() {
    const on = (evt, fn) => { this._offs.push(this.engine.on(evt, fn)); };

    on('damage', (p) => this.applyDamage(p));
    on('coin', (p) => this.bank(num(p?.amount, 1)));
    on('guardPickpocket', (p) => this.bank(num(p?.coins, 0)));
    /* Any state above PATROL means somebody is looking. `STATE` is imported rather than compared
       against the string 'chase' so that renaming a state breaks the import instead of silently
       turning this check into a constant `false`. */
    on('guardAlert', (p) => { if (p?.state && p.state !== STATE.PATROL) this._alertHeat = CHARM.calmTime; });

    this._publish();
  }

  /**
   * Take a hit, or refuse it.
   *
   * Returns whether the hit landed, so a caller that cares (a guard deciding whether to play a
   * connect reaction) can tell the difference without reading state back out of this module.
   */
  applyDamage(p = {}) {
    /**
     * A staged frame is not gameplay.
     *
     * `Debug.setShot` teleports the subject, freezes his pose and then runs 17 settle frames with
     * the guards still updating. Before this module existed the worst a guard could do in that
     * window was walk; now one standing within `attackRange` of a shot's player position would
     * land a swing, and `hurt` sets a velocity and requests a state — so the character would be
     * knocked out of the pose the shot asked for, and every capture staged near a guard would stop
     * reproducing itself. Four agents are scoring frames against each other; that is not a cost to
     * discover from a confusing A/B.
     *
     * `debug.freeCam` is set for exactly the duration of that staging and cleared by `clearShot`,
     * so it is the honest question to ask: "has the camera been taken away from gameplay?"
     */
    if (this.engine.debug?.freeCam) { this.refused++; return false; }
    if (this.down || this.invuln > 0) { this.refused++; return false; }
    this.hits++;

    /* `p.amount` is read and discarded, on purpose and visibly. Every hit costs one charm. A test
       fires `{ amount: 99 }` and asserts it costs exactly one, because the moment this scales
       with the request it has stopped being Sly's health system and become a hit-point bar. */
    const dir = p?.dir ?? null;
    const force = num(p?.force, 8.5);

    if (this.charms > 0) {
      this.charms--;
      this.charmsSpent++;
      this.invuln = CHARM.invuln;
      this.engine.emit('hurt', { dir, force });
      this._publish();
      return true;
    }

    this.down = true;
    this.deaths++;
    this._downTimer = CHARM.downTime;
    this.engine.emit('hurt', { dir, force: force * 1.35 });
    this.engine.emit('shake', 0.55);
    this._publish();
    return true;
  }

  /**
   * Bank coins toward the next charm — the series' own way of earning one.
   *
   * Both `coin` (Pickups) and `guardPickpocket` (Guard) feed this, because a charm bought with
   * stolen money and a charm bought with found money are the same charm, and an economy that
   * counts only half the coins is a bug that presents as "the charm price feels wrong".
   */
  bank(n) {
    const d = Math.max(0, Math.round(num(n, 0)));
    if (!d) return 0;
    this.purse += d;
    let gained = 0;
    while (this.purse >= CHARM.charmCoins && this.charms < CHARM.maxCharms) {
      this.purse -= CHARM.charmCoins;
      this.charms++;
      gained++;
    }
    /* At the cap the purse stops filling rather than banking an invisible surplus that would pay
       out the instant a charm is spent — a charm you did not see arrive is a charm you do not
       know you have, which is worse than not having it. */
    if (this.charms >= CHARM.maxCharms) this.purse = Math.min(this.purse, CHARM.charmCoins - 1);

    /**
     * Published on EVERY banked coin, not only on the ones that complete a charm.
     *
     * This `_publish()` used to sit inside the `if (gained)` below, which is §357.1's shape —
     * machinery wired at one end only. The purse moved on every single coin and the bus was told
     * about it exactly twice a run, at the two instants it reset to zero, so anything trying to
     * draw "progress toward the next charm" could only ever observe 0. Publishing the number is
     * the cheap half of that feature; it is worth anything at all only because somebody can now
     * watch it move.
     *
     * The cost is one emit per `coin`, and `coin` is per PICKUP, not per frame:
     * `Pickups._collectCoin` fires once per coin taken and `COIN_VALUE` tops out at 5, so a
     * player running the densest trail in the level produces single figures a second against one
     * subscriber. `guardPickpocket` is one emit per steal. Nothing here is on the frame clock.
     */
    this._publish();
    if (gained) {
      this.engine.emit('toast', { text: gained > 1 ? `${gained} lucky charms` : 'Lucky charm', icon: 'health' });
    }
    return gained;
  }

  /** Give a charm outright — for a pickup, a reward, or a test. Returns whether it fitted. */
  addCharm(n = 1) {
    const before = this.charms;
    this.charms = Math.min(CHARM.maxCharms, this.charms + Math.max(0, Math.round(num(n, 1))));
    if (this.charms === before) return false;
    this._publish();
    return true;
  }

  update(dt) {
    /* Announce once from the frame loop as well as from `init`. Module init order decides which
       of this module and the HUD runs first, and the HUD's own `init` sets a placeholder 5/5 — so
       an init-time announcement alone is silently lost whenever the order is the wrong way round.
       One extra emit on frame one costs nothing and makes the ordering irrelevant. */
    if (!this._announced) { this._announced = true; this._publish(); }

    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this._alertHeat > 0) this._alertHeat = Math.max(0, this._alertHeat - dt);

    if (this.down) {
      this._downTimer -= dt;
      if (this._downTimer <= 0) this.respawn();
      return;
    }
    this._sampleCheckpoint(dt);
  }

  /**
   * Bookmark where he is standing, if it is worth coming back to.
   *
   * Three conditions, each of which exists because its absence is a specific bad respawn: he must
   * be **grounded** (mid-jump is not a place), the spot must be **`checkpointMinMove` from the
   * last one** (so a player standing still does not re-bookmark forever), and **no guard may have
   * been above PATROL in the last `calmTime` seconds** (a checkpoint taken mid-chase drops him
   * back in front of the guard who just caught him, over and over).
   */
  _sampleCheckpoint(dt) {
    this._cpTimer -= dt;
    if (this._cpTimer > 0) return;
    this._cpTimer = CHARM.checkpointEvery;
    if (this._alertHeat > 0) return;
    const mv = this.engine.get?.('movement');
    if (!mv?.position || !mv.grounded) return;
    if (this.checkpoint && this.checkpoint.distanceTo(mv.position) < CHARM.checkpointMinMove) return;
    if (!this.checkpoint) this.checkpoint = mv.position.clone();
    else this.checkpoint.copy(mv.position);
    this.checkpointYaw = num(mv.yaw, 0);
  }

  /**
   * Put him back. Charms are NOT restored — they were spent or never held, and handing them back
   * on death would make dying the cheapest way to get one.
   */
  respawn() {
    this.down = false;
    this._downTimer = 0;
    this.invuln = CHARM.respawnInvuln;
    const mv = this.engine.get?.('movement');
    /* No checkpoint yet means he died before ever standing still anywhere calm. `Controller` still
       owns its own spawn and its own out-of-world safety net, so leaving him where he fell is the
       honest thing to do rather than inventing a position here. */
    if (this.checkpoint && mv?.teleport) mv.teleport(this.checkpoint, this.checkpointYaw);
    this._publish();
  }

  /**
   * The absolute state, on the one event the HUD renders.
   *
   * Seven call sites reach this and exactly one subscriber reads it (`HUD.js:564`), so ADDING a
   * field is free and RENAMING one is not: a renamed field is a silent `undefined` at the far
   * end, which every guard in the HUD converts into a plausible default rather than an error.
   *
   * `purse` and `charmCoins` are the raw pair — anything that wants to print "43 / 100" has what
   * it needs and does not have to import `CHARM` to learn the price. `charmProgress` is the
   * INTERPRETATION of that pair, and it exists because the pair alone cannot express the capped
   * case without restating `bank()`'s clamp; see the getter.
   */
  _publish() {
    this.engine.emit('health', {
      hp: this.hp, max: this.hpMax, charms: this.charms, down: this.down,
      purse: this.purse, charmCoins: CHARM.charmCoins, charmProgress: this.charmProgress,
    });
  }

  dispose() {
    for (const off of this._offs) { try { off(); } catch { /* a detach must not throw */ } }
    this._offs.length = 0;
  }
}
