import * as THREE from 'three';
import { HUD_CSS } from './hud.css.js';
import * as Ico from './Icons.js';
import { alertFor, threatFor, suspicionColour, ALERT_STATES } from './Alert.js';

/**
 * HUD — Sly's interface. Registered as module key 'hud' (AGENTS.md §4.3).
 *
 * Design position: the Sly games never draw a "UI layer". They draw *props* — a struck coin,
 * a printed objective cel, a keycap you could press, the Binocucom's optics. So everything in
 * here is an inked shape with a flat §2.2 fill and a degree of rotation, and nothing is a
 * translucent grey rounded rectangle.
 *
 * It is built from DOM + SVG rather than drawn into the WebGL canvas, which buys two things:
 *   · crisp vector text at any resolution with no font atlas and no extra draw calls, and
 *   · a hard guarantee for the screenshot critic — `window.__GAME.capture()` reads back the
 *     WebGL drawing buffer, and DOM never lands in it. The canonical plates are structurally
 *     clean. `engine.debug.hideHud` is honoured on top of that anyway (§4.5), re-checked every
 *     single frame rather than trusted to an event, because a leaked HUD invalidates the whole
 *     visual review.
 *
 * Everything this module consumes arrives over the event bus, and every peer may be null:
 * MOVEMENT/GUARDS/FX can land after us and the HUD still runs on its own placeholder state.
 */

/* Feel constants live together so the critic loop can tune timing without archaeology. */
const TUNE = {
  coinTickRate: 4.2,      // fraction of the remaining gap consumed per second
  coinPunch: 1.45,        // scale kick on a digit that changed
  toastLife: 2.6,         // s
  toastMax: 3,
  promptSwapPunch: 1.12,
  objectiveHold: 5.0,     // s before the card collapses to its compact tab
  /**
   * `guardAlert` is EDGE-triggered — `Patrol._setState()` emits once per transition and never
   * again (`Guard.js:647`). So there is no such thing as an alert "going stale": the last state
   * received is still true until the next one arrives. A live state therefore has no TTL at all.
   *
   * The old 2.2 s TTL assumed a heartbeat that is not emitted, and quietly erased guards who were
   * still hunting: `DETECT.searchTime` is 9.0 s, so a real search outlived the badge by 4×.
   * Only the non-live states (patrol / stunned / ko) linger and retire, and this is their fade.
   */
  alertFade: 1.2,         // s a *retired* badge lingers before removal
  alertLerp: 9,           // arc catch-up rate
  /**
   * The suspicion lash follows `Guards.alertLevel` almost rigidly. This is deliberately much
   * faster than `alertLerp`: the badge arc is smoothing between two *canonical* fractions and
   * the ease is presentation, whereas this meter IS the signal, and a warning that arrives
   * eased is a warning that arrives late. Enough smoothing to kill the per-frame jitter of a
   * line-of-sight ray clipping a column edge, and no more.
   */
  susLerp: 22,
  /** Below this the arc is not drawn at all — a meter that never rests at zero is noise. */
  susFloor: 0.04,
  goalTick: 5,            // frames between objective-distance recomputes (~12 Hz)
  bustHold: 1.6,          // s the CAUGHT stamp holds; PlayerHealth.CHARM.downTime is 1.15
  markMax: 16,
  shakeDecay: 9.5,
  shakeGain: 0.55,        // fraction of a world shake the UI inherits
  vignetteDecay: 2.2,
  recTick: 1,
};

const CIRC = 2 * Math.PI * 36;   // matches Icons.alertArc()'s r=36

/** Ladder order for the exposure chip — only used to decide whether a change is an escalation. */
const THREAT_RANK = { hidden: 0, noticed: 1, hunted: 2, spotted: 3 };

/* Hoisted scratch — update() allocates nothing (AGENTS.md §5). */
const _v = new THREE.Vector3();
const _mInv = new THREE.Matrix4();

/* ------------------------------------------------------------ control map */
/* Straight out of AGENTS.md §6.1, with the move tech each binding unlocks (§6) attached —
   the game ships 25 moves and no tutorial, so the pause screen *is* the tutorial. */
const M = (b) => ({ mouse: b });
const CONTROLS = [
  {
    title: 'GET AROUND',
    rows: [
      { k: ['W', 'A', 'S', 'D'], d: 'Move', s: 'Camera-relative' },
      { k: [M('wheel')], d: 'Look', s: 'Scroll to zoom' },
      { k: ['Shift'], note: 'hold', d: 'Sneak', s: 'On a narrow ledge — tiptoe' },
      { k: ['Ctrl'], d: 'Crouch', s: 'Tap while running — roll · in a vent — crawl' },
      { k: ['Space'], d: 'Jump', s: 'Again in the air — double jump (cane twirl)' },
      { k: ['Q'], note: 'hold', d: 'Paraglide' },
      { k: ['R'], d: 'Recentre camera' },
    ],
  },
  {
    title: 'CLIMB & SWING',
    rows: [
      { k: ['Space'], note: 'at a wall', d: 'Wall run', s: 'Space again — wall jump · hold into it — cling' },
      { k: ['Space'], note: 'under a ledge', d: 'Ledge hang', s: 'A / D — shimmy · W — climb up' },
      { k: ['E'], note: 'at a hook ring', d: 'Cane hook + swing', s: 'Space releases with the swing' },
      { k: ['E'], note: 'on a rail', d: 'Rail slide', s: 'Shift — rail walk (balance)' },
      { k: ['E'], note: 'on a pole', d: 'Pole climb', s: 'Ctrl — slide down · Space — pole swing' },
      { k: ['Space'], note: 'onto a spire tip', d: 'Ninja Spire Landing', s: 'Jumping off a spire goes 25% higher' },
    ],
  },
  {
    title: 'CANE & THIEVERY',
    rows: [
      { k: [M('left')], d: 'Cane combo', s: 'Three hits — the third one staggers' },
      { k: [M('left')], note: 'in the air', d: 'Dive attack', s: 'The Cane Slam — 1.2 m shockwave' },
      { k: ['Space'], note: 'onto a guard', d: 'Enemy bounce' },
      { k: ['E'], note: 'behind a guard', d: 'Pickpocket', s: 'Take the coins, stay unseen' },
      { k: [M('right')], note: 'hold', d: 'Thief-o-Vision', s: 'Highlights every affordance · hook lock-on · slow-mo' },
    ],
  },
  {
    title: 'SYSTEM',
    rows: [
      { k: ['Tab'], d: 'Binocucom', s: 'Scout ahead · call the gang' },
      { k: ['Esc'], d: 'Pause / release the pointer' },
      { k: ['P'], d: 'Freeze the simulation' },
      { k: ['F1'], d: 'Free camera', s: 'Debug' },
    ],
  },
];

/**
 * Until MOVEMENT starts emitting prompts, the HUD finds affordances itself through the documented
 * COLLISION query API (§4.6 — "for lock-on UI and Thief-o-Vision"). The moment a real `prompt`
 * event arrives this shuts off permanently and MOVEMENT owns the channel.
 *
 * ── KNOWN HAZARD, deliberately NOT worked around here ─────────────────────────────────────────
 * The retirement is WHOLESALE and this table has five entries MOVEMENT does not currently
 * announce. `tests/eventbus.test.mjs` names the consequence in advance: *"the first module to
 * publish this silently kills every contextual verb in the game"*. It is live as of this writing —
 * `Controller._pushPrompt` publishes `prompt`, and its own comment says *"Only pickpocket marks
 * are announced. A prompt for hook/rail/pole would be nice and is left out deliberately"* because
 * `afford()` costs a BVH `nearest()` per tag.
 *
 * A per-channel handover (MOVEMENT owns the pocket, the HUD keeps traversal — one
 * `collision.query` covers all five tags and is cheaper than the per-tag `nearest()` MOVEMENT
 * declined) was written and then reverted on coordinator instruction: it spans two lanes' files
 * and is being routed as one coordinated change rather than as two lanes editing around each
 * other. It is filed as a RECOMMENDATION in `progress/records/ui/NOTE-ui-audit.md`. Do not
 * re-apply half of it here.
 */
const AFF_VERB = {
  hook: 'Cane hook', rail: 'Mount rail', pole: 'Climb pole',
  spire: 'Spire land', vent: 'Crawl in',
};
const AFF_TAGS = Object.keys(AFF_VERB);
const AFF_RANGE = 4.4;

/**
 * The pocket, when nobody else is announcing it. `Guards.nearestPickpocketTarget(pos, maxDist,
 * facing)` is documented public API on the registered `guards` module — the same standing as
 * `collision.query` above, and the sibling of `Guards.nearest`, whose own comment names the HUD
 * as a consumer.
 *
 * This is the one affordance in the game with a CLOSING WINDOW: `canBePickpocketed` goes false the
 * moment a guard is alerted or already looted, and the roster carries 45–150 coins a head. The
 * whole authored economy was reachable only by a player who already knew to walk up behind a
 * guard and press E. Range is left to the guards module's own `TUNE.pocketRange` rather than
 * restated here, so the prompt cannot promise a reach Sly does not have.
 *
 * Retired with the rest of the fallback the first time an external `prompt` arrives, which is
 * correct in both directions: if MOVEMENT owns the pocket, the HUD must not hold a second
 * opinion about it — `Controller.pickMark` knows `pickApproach`, whether the state machine is
 * busy and whether Sly is grounded, and this does not.
 */
const STEAL_VERB = 'Pickpocket';

/**
 * Verbs that get the closing-window treatment, WHOEVER announces them.
 *
 * A pocket is the only affordance in the game that expires on its own, so it is the only prompt
 * that earns colour and motion. Classified by verb because MOVEMENT's payload has no `kind`
 * field and demanding one would be a contract change to a file this lane does not own; an
 * explicit `kind` on the payload wins if one ever appears.
 */
const PROMPT_KIND = { pickpocket: 'steal' };

/* Prompt key strings arrive from MOVEMENT in whatever shape it likes; normalise here. */
const KEY_ALIAS = {
  space: 'Space', shift: 'Shift', ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt',
  tab: 'Tab', esc: 'Esc', escape: 'Esc', enter: 'Enter', return: 'Enter',
};

export class HUD {
  constructor(engine) {
    this.engine = engine;

    this.root = null;
    this.styleEl = null;
    this._offs = [];
    this._built = false;

    /* ---- state ---- */
    this._visible = true;
    this._hiddenNow = null;
    this.coins = 0;
    this._coinsShown = 0;
    this.health = 5;
    this.healthMax = 5;
    this.binocOn = false;
    this.tovOn = false;
    this.pauseOn = false;

    this._digits = [];
    this._toasts = [];
    this._alerts = new Map();
    this._marks = [];
    this._targets = [];
    this._promptKey = '';
    this._promptText = '';
    this._promptKind = '';
    this._objTimer = 0;
    this._objBase = null;       // the standing objective, restored when a carry ends
    this._carry = null;         // { name, value } — the treasure in hand
    this._goal = null;          // { point, label } — what the world marker points at
    this._goalCount = 0;
    this._goalDist = -1;
    this._sus = 0;              // smoothed Guards.alertLevel
    this._susCol = '';
    this._bustT = 0;
    this._shake = 0;
    this._vig = 0;
    this._vigPunch = 0;
    this._plusTimer = 0;
    this._recT = 0;
    this._wasLocked = false;
    this._sawPrompt = false;    // a real `prompt` event retires the affordance fallback
    this._lock = null;          // MOVEMENT's current lock-on mark
    this._affDead = false;
    this._pickDead = false;
    this._affCount = 0;
    this._threatKey = '';
    this._threatCount = 0;

    this.reduced = false;
    try { this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch {}
  }

  /* ==================================================================== */
  /* lifecycle                                                            */
  /* ==================================================================== */

  async init() {
    try {
      this._injectCss();
      this._build();
      this._wire();
      this._built = true;
    } catch (err) {
      // A broken HUD must never cost the critic a frame.
      this.engine.warn?.(`hud: init failed — ${err?.message || err}`);
      this.dispose();
      return;
    }

    this.setHealth(this.healthMax, this.healthMax);
    this.setCoins(0, true);
    this.objective('Steal the Eye of Ra', 'Temple of Ra · Great Courtyard');
    this._refreshThreat();
    this._applyVisibility();
  }

  _injectCss() {
    const el = document.createElement('style');
    el.id = 'sly-hud-css';
    el.textContent = HUD_CSS;
    document.head.appendChild(el);
    this.styleEl = el;
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'sly-hud';
    root.dataset.hidden = '0';
    root.innerHTML = `
      <div class="sly-tov">
        <div class="sly-tov-drain"></div>
        <div class="sly-tov-desat"></div>
        <div class="sly-tov-crush"></div>
        <div class="sly-tov-vig"></div>
        <div class="sly-tov-rings"></div>
        <div class="sly-tov-tag sly-ink sly-ink-s">THIEF-O-VISION</div>
      </div>

      <div class="sly-marks">
        <div class="sly-lock">${Ico.lockOn()}</div>
        <div class="sly-goal">
          <div class="sly-goal-pin">${Ico.goalPin()}</div>
          <div class="sly-goal-ring"><div class="sly-goal-arrow">${Ico.goalArrow()}</div></div>
          <div class="sly-goal-txt">
            <span class="sly-goal-lbl sly-ink sly-ink-s"></span>
            <span class="sly-goal-dist sly-ink sly-ink-s"></span>
          </div>
        </div>
      </div>

      <div class="sly-shake">
        <div class="sly-tl">
          <div class="sly-pips"></div>
          <div class="sly-coins">
            <span class="sly-coin-icon sly-drop">${Ico.coin()}</span>
            <span class="sly-coin-num sly-ink"></span>
            <span class="sly-coin-plus sly-ink sly-ink-s"></span>
          </div>
          <div class="sly-threat" data-state="hidden">
            <span class="sly-threat-eye">${Ico.threatEye()}</span>
            <span class="sly-threat-lbl sly-ink sly-ink-s">HIDDEN</span>
            <span class="sly-threat-num sly-ink sly-ink-s"></span>
          </div>
          <div class="sly-carry">
            <span class="sly-carry-ic sly-drop">${Ico.glyph('goal')}</span>
            <span class="sly-carry-name sly-ink sly-ink-s"></span>
            <span class="sly-carry-val sly-ink sly-ink-s"></span>
          </div>
        </div>

        <div class="sly-obj">
          <div class="sly-obj-card">
            <span class="sly-obj-eye">${Ico.eyeOfRa()}</span>
            <span class="sly-obj-kick">OBJECTIVE</span>
            <div class="sly-obj-title"></div>
            <div class="sly-obj-sub"></div>
          </div>
        </div>

        <div class="sly-toasts"></div>

        <div class="sly-prompt">
          <span class="sly-prompt-key"></span>
          <span class="sly-prompt-dash"></span>
          <span class="sly-prompt-verb sly-ink sly-ink-s"></span>
          <span class="sly-prompt-ic sly-drop">${Ico.coin()}</span>
        </div>
      </div>

      ${this._binocuHtml()}

      <div class="sly-vig"></div>
      <div class="sly-flash"></div>

      <div class="sly-busted">
        <span class="mark">${Ico.cooperMark()}</span>
        <div class="sly-busted-txt">BUSTED<span class="sly-busted-sub">BACK TO THE LAST QUIET SPOT</span></div>
      </div>

      ${this._pauseHtml()}
    `;
    document.body.appendChild(root);
    root.dataset.threat = 'hidden';
    this.root = root;

    const q = (s) => root.querySelector(s);
    this.el = {
      tov: q('.sly-tov'),
      marks: q('.sly-marks'),
      shake: q('.sly-shake'),
      pips: q('.sly-pips'),
      coinNum: q('.sly-coin-num'),
      coinPlus: q('.sly-coin-plus'),
      threat: q('.sly-threat'),
      threatLbl: q('.sly-threat-lbl'),
      threatNum: q('.sly-threat-num'),
      threatFill: q('.sly-eye-fill'),
      threatFillInk: q('.sly-eye-fill-ink'),
      carry: q('.sly-carry'),
      carryName: q('.sly-carry-name'),
      carryVal: q('.sly-carry-val'),
      lock: q('.sly-lock'),
      goal: q('.sly-goal'),
      goalRing: q('.sly-goal-ring'),
      goalLbl: q('.sly-goal-lbl'),
      goalDist: q('.sly-goal-dist'),
      busted: q('.sly-busted'),
      obj: q('.sly-obj'),
      objTitle: q('.sly-obj-title'),
      objSub: q('.sly-obj-sub'),
      toasts: q('.sly-toasts'),
      prompt: q('.sly-prompt'),
      promptKey: q('.sly-prompt-key'),
      promptVerb: q('.sly-prompt-verb'),
      binoc: q('.sly-binoc'),
      bxTl: q('.bx-tl'),
      bxBr: q('.bx-br'),
      bxTime: q('.bx-time'),
      vig: q('.sly-vig'),
      flash: q('.sly-flash'),
      pause: q('.sly-pause'),
    };

    this.el.pause.querySelector('.sly-btn')?.addEventListener('click', () => this.setPaused(false));
    // Clicking the scrim resumes; clicking the panel must not.
    this.el.pause.addEventListener('mousedown', (e) => {
      if (e.target === this.el.pause) this.setPaused(false);
    });
  }

  /* ---------------------------------------------------------- binocucom */

  _binocuHtml() {
    const ruler = new Array(9).fill('<i></i>').join('');
    const wave = new Array(7).fill('<i></i>').join('');
    return `
      <div class="sly-binoc">
        <div class="sly-binoc-lens">
          <div class="bx-grille"></div>
          <div class="bx-scan"></div>
          <div class="bx-sweep"></div>
          <div class="bx-crt"></div>
          <div class="bx-fringe"></div>
        </div>
        <div class="bx-ui">
          <div class="bx-corner tl">${Ico.bracket()}</div>
          <div class="bx-corner tr">${Ico.bracket()}</div>
          <div class="bx-corner br">${Ico.bracket()}</div>
          <div class="bx-corner bl">${Ico.bracket()}</div>

          <div class="bx-mono bx-tl">BINOCUCOM  MK-IV\nCH 04 · <b>SECURE</b>\nSITE: TEMPLE OF RA</div>
          <div class="bx-rec"><i></i><span class="bx-time">REC 00:00</span></div>
          <div class="bx-ruler">${ruler}</div>
          <div class="bx-cross">${Ico.crosshair()}</div>
          <div class="bx-mono bx-br">ZOOM <b>2.4×</b>  IR OFF\nBAT <b>87%</b>  SIG <span class="sig">${Ico.signal(3)}</span></div>

          <div class="bx-caller">
            <div class="bx-caller-pic">${Ico.caller()}</div>
            <div class="bx-caller-meta">
              <div class="bx-caller-name">BENTLEY</div>
              <div class="bx-caller-line">"The Eye of Ra is in the vault under the hall.
                 Two guards on the courtyard, Sly — take the high line."</div>
              <div class="bx-wave">${wave}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* -------------------------------------------------------------- pause */

  _keysHtml(row) {
    let out = '';
    for (const k of row.k) {
      out += (k && k.mouse) ? Ico.mouse(k.mouse) : Ico.keycap(k);
    }
    if (row.note) out += `<span class="plus">${row.note}</span>`;
    return out;
  }

  _pauseHtml() {
    const groups = CONTROLS.map((g) => `
      <div class="sly-grp">
        <h4>${g.title}</h4>
        ${g.rows.map((r) => `
          <div class="sly-row">
            <span class="ks">${this._keysHtml(r)}</span>
            <span class="dsc">${r.d}${r.s ? `<small>${r.s}</small>` : ''}</span>
          </div>`).join('')}
      </div>`).join('');

    return `
      <div class="sly-pause">
        <div class="sly-pause-panel">
          <div class="sly-pause-head">
            <span class="mark">${Ico.cooperMark()}</span>
            <div class="sly-pause-title">PAUSED<em>SANDS OF RA</em></div>
          </div>
          <div class="sly-pause-rule"><span class="cane">${Ico.cane()}</span></div>
          <div class="sly-cols">${groups}</div>
          <div class="sly-pause-foot">
            <button class="sly-btn" type="button">RESUME &nbsp;·&nbsp; ESC</button>
            <span class="sly-pause-tip">Every ledge, rail, pole and spire in this temple is climbable.
              Hold right mouse if you can't see the line.</span>
          </div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------ wiring */

  _wire() {
    const e = this.engine;
    const on = (evt, fn) => { const off = e.on(evt, fn); if (off) this._offs.push(off); };

    /* The screenshot contract. Belt: the event. Braces: the per-frame re-check in update(). */
    on('hideHud', () => this._applyVisibility());

    on('prompt', (p) => { this._sawPrompt = true; this._onPrompt(p); });
    /**
     * Hook / guard lock-on. MOVEMENT's `CombatStrafe` publishes `{ pos, body }` on entry and
     * `null` on exit and nothing was listening, so §6.1's "hold right mouse — hook lock-on"
     * committed the player to an orbit with no on-screen confirmation of *what* he had locked.
     * The reticle art already existed for Thief-o-Vision; this points it at the mark.
     */
    on('lockOn', (p) => this.setLockOn(p));
    on('toast', (p) => {
      if (!p) return;
      if (typeof p === 'string') this.toast(p);
      else this.toast(p.text ?? p.message ?? '', p);
    });

    on('coins', (n) => this.setCoins(num(n, this.coins)));
    on('coin', (p) => this.addCoins(typeof p === 'number' ? p : num(p?.amount ?? p?.value ?? p?.n, 1)));
    /**
     * Pay on the STEAL, not on the reach.
     *
     * `pickpocket` is Moveset's *intent* event — Sly put his hand out. It fires whenever the player
     * is grounded, presses `interact`, and nothing else is grabbable; `Moveset.Pickpocket.canEnter`
     * does not check that a guard is anywhere near. Crediting a flat 25 on it meant **mashing E in
     * an empty courtyard minted 25 coins a press**, roughly 45 per second at `pickTime` 0.55, with
     * toast and SFX, while `Guards` correctly stole nothing at all.
     *
     * `guardPickpocket` is the outcome. `Guard.pickpocket()` returns null unless
     * `canBePickpocketed`, latches `looted` so a guard cannot be robbed twice, and only then emits
     * `{ guard, id, pos, coins, item }` — with `coins` rolled from that guard's own table (temple
     * 45–90, heavy 80–150, scarab 10–25). That authored economy had **zero listeners** and had never
     * once reached the player.
     *
     * So the flat 25 is gone in both directions: the exploit closes, and a real steal now pays what
     * it was written to pay.
     */
    on('guardPickpocket', (p) => {
      this.addCoins(num(p?.coins, 0));
      this.toast(p?.item ? `Pickpocketed — ${p.item}` : 'Pickpocketed', { icon: 'coin' });
    });

    on('health', (p) => {
      if (typeof p === 'number') { this.setHealth(p, this.healthMax); return; }
      if (!p) return;
      this.setHealth(num(p.hp ?? p.current ?? p.value, this.health), num(p.max, this.healthMax));
      /* `down` is the fatal hit, not a hit. `PlayerHealth` publishes it on the same payload the
         pips already read, so telling "caught" apart from "hurt" costs no new interface — only
         the decision to stop discarding a field that was always there. */
      this._setBusted(!!p.down);
    });

    /**
     * The loot loop, which the HUD had no view of at all.
     *
     * `Pickups` emits all three of these already and the HUD subscribed to none of them, so the
     * one mechanic in the game with a *carry risk* — pick a treasure up, walk it back through the
     * guards you already woke, lose it if you are driven to CHASE — ran with a single toast at
     * pickup and nothing afterwards. The player could not see what he was holding, what it was
     * worth, where it had to go, or where it landed when it was knocked out of his hands.
     *
     * `treasureDropped` carries the spot it fell, so being caught leaves a mark instead of a
     * mystery. That is the difference between a setback and a lost run.
     */
    on('treasurePickup', (p) => this._onCarry(p, 'pickup'));
    on('treasureBanked', (p) => this._onCarry(p, 'banked'));
    on('treasureDropped', (p) => this._onCarry(p, 'dropped'));
    /* `health` is the ONLY thing that moves the pips, and that is a correctness requirement
       rather than tidiness. This used to be three subscriptions — `health`, `damage` and
       `hurt` — each of which deducted a pip, which was harmless only while nothing published
       any of them (§248). Under a real publisher one hit would have cost three pips.

       Worse than the triple-count: `damage` is a *request* to hurt the player, and
       `PlayerHealth` is the only thing entitled to decide whether it lands — invulnerability
       frames, being already down, and whether a lucky charm eats it. A view that deducts on
       the request cannot know the hit was refused, so the row would drift away from the truth
       on the first i-framed hit and never come back. That is §247's defect pointed the other
       way: a subscriber holding a different opinion about what an event name means.

       The flash, the vignette punch and the shake are not lost — `setHealth` fires them when a
       pip is actually lost, so they follow the hit that really landed. */

    on('thiefVision', (v) => this.thiefVision(!!v));
    on('thiefTargets', (list) => this._onTargets(list));
    on('binocucom', (v) => this.binocucom(!!v));
    on('guardAlert', (p) => this._onGuardAlert(p));
    on('objective', (p) => {
      if (typeof p === 'string') this.objective(p);
      else if (p) this.objective(p.title ?? p.text ?? '', p.sub ?? p.where ?? '');
    });

    // Sympathetic UI shake off world impacts — it stitches the overlay to the game.
    on('shake', (amt) => { this._shake = Math.min(1, this._shake + num(amt, 0.1) * TUNE.shakeGain); });

    // Losing pointer lock is the real "the player stepped away" signal; Esc never reaches us
    // while locked because the browser eats it to exit the lock.
    on('pointerlock', (locked) => {
      if (this._wasLocked && !locked) this.setPaused(true);
      this._wasLocked = !!locked;
    });

    this._onKey = (ev) => {
      if (ev.code !== 'Escape') return;
      if (this.engine.debug?.hideHud) return;
      this.setPaused(!this.pauseOn);
    };
    window.addEventListener('keydown', this._onKey);
  }

  /* ==================================================================== */
  /* public API                                                           */
  /* ==================================================================== */

  setVisible(v) {
    this._visible = !!v;
    this._applyVisibility();
  }

  toast(text, opts = {}) {
    if (!this._built || !text) return;
    const el = document.createElement('div');
    el.className = 'sly-toast sly-ink sly-ink-s';
    el.innerHTML = `<span class="ic">${Ico.glyph(opts.icon || 'sparkle')}</span><span>${esc(text)}</span>`;
    this.el.toasts.appendChild(el);
    const rec = { el, t: num(opts.duration, TUNE.toastLife) };
    this._toasts.push(rec);
    // Next frame, so the transition has a start value to animate from.
    requestAnimationFrame(() => el.classList.add('on'));
    while (this._toasts.length > TUNE.toastMax) this._killToast(this._toasts[0]);
    return rec;
  }

  /**
   * Contextual verb. `prompt(null)` clears. Fast in, slow out — the ease asymmetry is what
   * makes an affordance feel eager rather than laggy.
   *
   * `kind` is a presentation channel, not a second verb: `'steal'` marks the one affordance whose
   * window closes on its own (see STEAL_VERB). Everything else is permanent geometry and shares
   * the neutral treatment.
   */
  prompt(text, key, kind = '') {
    if (!this._built) return;
    if (!text) {
      this.el.prompt.classList.remove('on');
      this._promptText = '';
      this._promptKey = '';
      this._promptKind = '';
      this.el.prompt.dataset.kind = '';
      return;
    }
    const k = normKey(key);
    if (text === this._promptText && k === this._promptKey && kind === this._promptKind) {
      this.el.prompt.classList.add('on');
      return;
    }
    const swap = this.el.prompt.classList.contains('on');
    if (k !== this._promptKey) {
      this.el.promptKey.innerHTML = k
        ? (k.mouse ? Ico.mouse(k.mouse) : Ico.keycap(k))
        : Ico.keycap('E');
    }
    if (kind !== this._promptKind) {
      this._promptKind = kind;
      this.el.prompt.dataset.kind = kind;
    }
    this.el.promptVerb.textContent = text;
    this._promptText = text;
    this._promptKey = k;
    this.el.prompt.classList.add('on');
    if (swap) this._punch(this.el.prompt, TUNE.promptSwapPunch, 200);
  }

  setCoins(n, immediate = false) {
    this.coins = Math.max(0, Math.round(num(n, 0)));
    if (immediate) { this._coinsShown = this.coins; this._renderCoins(this.coins, true); }
  }

  addCoins(n) {
    const d = Math.round(num(n, 0));
    if (!d) return;
    this.setCoins(this.coins + d);
    if (!this._built) return;
    this.el.coinPlus.textContent = `${d > 0 ? '+' : ''}${d}`;
    this._plusTimer = 0.95;
    this._punch(this.el.coinPlus, 1.5, 320);
  }

  setHealth(n, max) {
    const m = Math.max(1, Math.round(num(max, this.healthMax)));
    const v = Math.max(0, Math.min(m, Math.round(num(n, this.health))));
    const lost = v < this.health;
    const rebuild = m !== this.healthMax || this.el?.pips?.childElementCount !== m;
    this.healthMax = m;
    const prev = this.health;
    this.health = v;
    if (!this._built) return;

    if (rebuild) {
      this.el.pips.innerHTML = '';
      for (let i = 0; i < m; i++) {
        const s = document.createElement('span');
        s.innerHTML = Ico.pip(i < v, pipKind(i));
        if (i === 0) s.classList.add('sly-pip-life');
        this.el.pips.appendChild(s);
      }
    } else {
      const kids = this.el.pips.children;
      for (let i = 0; i < m; i++) {
        const filled = i < v;
        const wasFilled = !kids[i].classList.contains('sly-pip-lost');
        if (filled === wasFilled) continue;
        kids[i].innerHTML = Ico.pip(filled, pipKind(i));
        kids[i].classList.toggle('sly-pip-lost', !filled);
        if (!filled) this._punch(kids[i], 1.75, 340);
        else this._punch(kids[i], 1.35, 280);
      }
    }
    for (let i = 0; i < m; i++) this.el.pips.children[i].classList.toggle('sly-pip-lost', i >= v);

    this._vig = 1 - v / m;
    if (lost) this._hitFx(prev - v);
  }

  /** Take damage: pips, flash, vignette punch and a shake in one call. */
  damage(amount = 1) {
    this.setHealth(this.health - Math.max(1, Math.round(num(amount, 1))), this.healthMax);
  }

  binocucom(on) {
    const v = !!on;
    if (v === this.binocOn || !this._built) { this.binocOn = v; return; }
    this.binocOn = v;
    this.el.binoc.classList.toggle('on', v);
    // The Binocucom is a screen, not an overlay: it carries its own readouts, so the gameplay
    // cluster stands down rather than showing through the lens and colliding with them. The
    // world marks stay — reading guard states through the optics is what it is for.
    this.root.dataset.binoc = v ? '1' : '0';
    if (v) this._flash(0.32, 130);
    this.engine.emit('binocucomState', v);
  }

  thiefVision(on) {
    const v = !!on;
    this.tovOn = v;
    if (!this._built) return;
    this.el.tov.classList.toggle('on', v);
    if (!v) for (const m of this._marks) m.el.classList.remove('on');
  }

  /**
   * Comic-cel objective card: slides in, holds, then collapses to a compact tab.
   *
   * `transient` marks a card the loot loop puts up for the duration of a carry. The standing
   * objective is remembered rather than overwritten, so banking a treasure puts the level's own
   * goal back instead of leaving the player staring at a step he has already finished.
   */
  objective(title, sub = '', transient = false) {
    if (!this._built || !title) return;
    if (!transient) this._objBase = { title, sub };
    this.el.objTitle.textContent = title;
    this.el.objSub.textContent = sub;
    this.el.obj.classList.remove('mini');
    this.el.obj.classList.add('on');
    this._objTimer = TUNE.objectiveHold;
  }

  /* ------------------------------------------------------------- the loot loop */

  /**
   * One treasure event, in or out of Sly's hands.
   *
   * Everything here is read off the payload `Pickups` already publishes — `{ id, name, value,
   * pos }` — plus the fence, which is a public field on the registered `pickups` module and so
   * comes through `engine.get()` (AGENTS.md §4.2) rather than an import.
   */
  _onCarry(p, kind) {
    if (!this._built) return;

    if (kind === 'pickup') {
      const name = String(p?.name ?? 'Treasure');
      const value = Math.max(0, Math.round(num(p?.value, 0)));
      this._carry = { name, value };
      this.el.carryName.textContent = name;
      this.el.carryVal.textContent = value ? String(value) : '';
      this.el.carry.classList.add('on');
      this.setGoal(this.engine.get?.('pickups')?.fence, 'FENCE');
      this.objective(`Fence the ${name}`,
        value ? `${value} coins · carry it back to the entrance` : 'Carry it back to the entrance',
        true);
      return;
    }

    this._carry = null;
    this.el.carry.classList.remove('on');

    if (kind === 'dropped') {
      /* Caught while carrying. The treasure is still in the world, exactly where it fell, and
         nothing else in the game will ever tell you where that was. */
      this.setGoal(p?.pos, 'DROPPED');
      this.objective('Recover the loot', `${p?.name ?? 'The treasure'} — where they caught you`, true);
      return;
    }

    this.setGoal(null);
    if (this._objBase) this.objective(this._objBase.title, this._objBase.sub);
  }

  /**
   * Point the world marker at something, or `setGoal(null)` to retire it.
   *
   * The reference is held, not copied — the same reasoning as the guard badges: a marker that
   * remembers where a thing *was* points at nothing, and is worse than no marker.
   */
  setGoal(point, label = '') {
    if (!this._built) return;
    if (!point || typeof point.x !== 'number') {
      this._goal = null;
      this._goalDist = -1;
      this.el.goal.classList.remove('on');
      this.el.goalDist.textContent = '';
      return;
    }
    this._goal = { point, label: String(label).toUpperCase() };
    this.el.goalLbl.textContent = this._goal.label;
    this._goalDist = -1;      // force a distance recompute on the next tick
    this._goalCount = 0;
  }

  /** The lock-on mark. `setLockOn(null)` clears it — MOVEMENT sends exactly that on exit. */
  setLockOn(p) {
    if (!this._built) return;
    const point = p?.pos ?? p?.point ?? p?.position ?? (p?.isVector3 ? p : null);
    if (!point || typeof point.x !== 'number') {
      this._lock = null;
      this.el.lock.classList.remove('on');
      return;
    }
    this._lock = point;
  }

  /**
   * The fatal hit. `PlayerHealth` holds the world for `CHARM.downTime` before respawning, and
   * the stamp runs on its own timer rather than on the respawn so the beat cannot be cut short
   * by a fast checkpoint.
   */
  _setBusted(down) {
    if (!this._built || !down || this._bustT > 0) return;
    this._bustT = TUNE.bustHold;
    this.el.busted.classList.add('on');
    this._shake = Math.min(1, this._shake + 0.5);
    this.prompt(null);
  }

  setPaused(v) {
    const on = !!v;
    if (on === this.pauseOn || !this._built) return;
    if (on && this.engine.debug?.hideHud) return;
    this.pauseOn = on;
    this.el.pause.classList.toggle('on', on);
    this.engine.paused = on;
    if (on) {
      this.binocucom(false);
      this.engine.input?.releaseLock?.();
    }
    this.engine.emit('paused', on);
  }

  /* ==================================================================== */
  /* frame                                                                */
  /* ==================================================================== */

  update(dt) {
    if (!this._built) return;

    // Re-checked every frame on purpose: the harness may set the flag without emitting, and a
    // single leaked frame ruins a canonical plate.
    this._applyVisibility();
    if (this._hiddenNow) return;

    const d = Math.min(num(dt, 0), 0.05) || 0;

    if (this.engine.input?.pressed?.('binocu')) this.binocucom(!this.binocOn);

    this._tickCoins(d);
    this._tickToasts(d);
    this._tickObjective(d);
    this._tickSuspicion(d);
    this._tickWorldMarks();
    this._tickFx(d);
    this._tickBusted(d);
    this._tickAffordancePrompt();
    if (this.binocOn) this._tickBinocu(d);
  }

  /**
   * The analog exposure meter — the one channel the HUD had none of.
   *
   * Every readout in this file was EDGE-TRIGGERED: `guardAlert` fires once per transition, so
   * until some guard actually crossed `DETECT.suspicious` (0.34) nothing on screen moved at all,
   * and nothing moved on the way back down out of a search either. A stealth player spends most
   * of his time strictly between thresholds, which is precisely where the HUD was silent.
   *
   * `Guards.alertLevel` is the garrison maximum of `suspicion / DETECT.chase`, a public getter
   * whose own comment records AUDIO as a consumer, so this needs no new interface from anybody.
   * It is polled rather than pushed because it is a continuous quantity — there is no edge to
   * subscribe to, and a per-frame max over a dozen guards is not a cost worth an event for.
   *
   * The badges stay discrete and untouched (see the ANALOG vs DISCRETE note in Alert.js): this
   * is the aggregate instrument, and the garrison maximum is not something any single vision
   * cone can show you, least of all the cone of a guard standing behind you.
   */
  _tickSuspicion(dt) {
    const guards = this.engine.get?.('guards');
    const raw = typeof guards?.alertLevel === 'number' ? guards.alertLevel : 0;
    const want = Math.max(0, Math.min(1, raw));
    this._sus += (want - this._sus) * Math.min(1, TUNE.susLerp * dt);

    const f = this._sus < TUNE.susFloor ? 0 : Math.min(1, this._sus);
    const off = (100 * (1 - f)).toFixed(1);
    this.el.threatFill.style.strokeDashoffset = off;
    this.el.threatFillInk.style.strokeDashoffset = off;

    const col = suspicionColour(this._sus);
    if (col !== this._susCol) {
      this._susCol = col;
      this.el.threat.style.setProperty('--sus-col', col);
    }
  }

  _tickBusted(dt) {
    if (this._bustT <= 0) return;
    this._bustT -= dt;
    if (this._bustT <= 0) this.el.busted.classList.remove('on');
  }

  /** Cheap stand-in prompt driver — see AFF_VERB. Retires itself the moment MOVEMENT speaks. */
  _tickAffordancePrompt() {
    if (this._sawPrompt || this._affDead || this.pauseOn || this._bustT > 0) return;
    if (--this._affCount > 0) return;
    this._affCount = 6;                     // ~10 Hz is plenty for a contextual verb
    const mv = this.engine.get('movement');
    if (!mv?.position) return;

    /* The pocket outranks every traversal affordance, and the ranking is not a preference: a rail
       will still be a rail in ten seconds, and a guard's pocket closes the instant he turns round.
       Its own failure is caught separately so a guards module that is not there yet cannot take
       the traversal prompts down with it. */
    const guards = this.engine.get('guards');
    if (!this._pickDead && typeof guards?.nearestPickpocketTarget === 'function') {
      try {
        if (guards.nearestPickpocketTarget(mv.position, undefined, mv.yaw)) {
          this.prompt(STEAL_VERB, 'E', 'steal');
          return;
        }
      } catch (err) {
        this._pickDead = true;
        this.engine.warn?.(`hud: pickpocket prompt disabled — ${err?.message || err}`);
      }
    }

    const col = this.engine.get('collision');
    if (!col?.query) { if (this._promptKind === 'steal') this.prompt(null); return; }
    try {
      const hits = col.query(mv.position, AFF_RANGE, AFF_TAGS);
      let best = null;
      for (let i = 0; i < hits.length; i++) {
        const tag = hits[i].tag || hits[i].rec?.tag;
        if (!AFF_VERB[tag]) continue;
        if (!best || hits[i].distance < best.distance) best = hits[i];
      }
      if (best) this.prompt(AFF_VERB[best.tag || best.rec.tag], 'E');
      else if (this._promptText) this.prompt(null);
    } catch (err) {
      this._affDead = true;
      this.engine.warn?.(`hud: affordance prompt disabled — ${err?.message || err}`);
    }
  }

  _tickCoins(dt) {
    if (this._plusTimer > 0) {
      this._plusTimer -= dt;
      const a = Math.max(0, Math.min(1, this._plusTimer / 0.55));
      this.el.coinPlus.style.opacity = String(a);
      this.el.coinPlus.style.transform = `translateY(${(1 - a) * -0.9}em)`;
    }
    if (this._coinsShown === this.coins) return;
    const gap = this.coins - this._coinsShown;
    // Ticks digit by digit but accelerates on big hauls, so +500 doesn't take eight seconds.
    const step = Math.max(1, Math.ceil(Math.abs(gap) * TUNE.coinTickRate * dt));
    this._coinsShown += Math.sign(gap) * Math.min(step, Math.abs(gap));
    this._renderCoins(this._coinsShown, false);
  }

  _renderCoins(value, silent) {
    const s = String(Math.max(0, value | 0));
    if (this._digits.length !== s.length) {
      this.el.coinNum.innerHTML = '';
      this._digits = [];
      for (const ch of s) {
        const i = document.createElement('i');
        i.textContent = ch;
        this.el.coinNum.appendChild(i);
        this._digits.push(i);
      }
      if (!silent) this._punch(this.el.coinNum, 1.2, 260);
      return;
    }
    for (let i = 0; i < s.length; i++) {
      if (this._digits[i].textContent === s[i]) continue;
      this._digits[i].textContent = s[i];
      if (!silent) this._punch(this._digits[i], TUNE.coinPunch, 240);
    }
  }

  _tickToasts(dt) {
    for (let i = this._toasts.length - 1; i >= 0; i--) {
      const t = this._toasts[i];
      t.t -= dt;
      if (t.t <= 0) this._killToast(t);
    }
  }

  _killToast(t) {
    const i = this._toasts.indexOf(t);
    if (i >= 0) this._toasts.splice(i, 1);
    t.el.classList.remove('on');
    setTimeout(() => t.el.remove(), 400);
  }

  _tickObjective(dt) {
    if (this._objTimer <= 0) return;
    this._objTimer -= dt;
    if (this._objTimer <= 0) this.el.obj.classList.add('mini');
  }

  /* --------------------------------------------------- projected markers */

  _tickWorldMarks() {
    const cam = this.engine.camera;
    const W = this.engine.width || window.innerWidth;
    const H = this.engine.height || window.innerHeight;
    if (!cam) return;

    // Build the view matrix ourselves: CAMERA writes matrixWorld this frame but
    // matrixWorldInverse is only refreshed at render time, one frame late.
    _mInv.copy(cam.matrixWorld).invert();

    this._tickGoal(cam, W, H);

    /* Lock-on. Not edge-clamped on purpose: a reticle pinned to the frame edge is pointing at
       nothing, and MOVEMENT drops the lock at `lockDrop` anyway, so off-screen is momentary. */
    if (this._lock) {
      const p = this._project(this._lock, cam, W, H);
      if (p.ok) {
        this.el.lock.style.transform =
          `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${p.s.toFixed(3)})`;
        this.el.lock.classList.add('on');
      } else this.el.lock.classList.remove('on');
    }

    /* ---- Thief-o-Vision lock-ons ---- */
    const showMarks = this.tovOn && this._targets.length > 0;
    for (let i = 0; i < this._marks.length; i++) {
      const m = this._marks[i];
      const tgt = showMarks ? this._targets[i] : null;
      if (!tgt) { m.el.classList.remove('on'); continue; }
      const p = this._project(tgt.point, cam, W, H);
      if (!p.ok) { m.el.classList.remove('on'); continue; }
      m.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${p.s.toFixed(3)})`;
      m.el.classList.toggle('gold', !!tgt.gold);
      if (m.label !== tgt.label) { m.lbl.textContent = tgt.label; m.label = tgt.label; }
      m.el.classList.add('on');
    }

    /* ---- guard alert badges ----
       A LIVE state never expires: the emitter is edge-triggered, so the last state received is
       still true until the next transition arrives. Only retired states (patrol / stunned / ko)
       run a fade and get collected. */
    const dt = this.engine.dt || 0.016;
    let retired = false;
    for (const [id, a] of this._alerts) {
      if (!a.live) {
        a.fade -= dt;
        if (a.fade <= 0) { a.el.remove(); this._alerts.delete(id); retired = true; continue; }
      }
      a.shown += (a.target - a.shown) * Math.min(1, TUNE.alertLerp * dt);

      // Re-read the guard's live position every frame so the badge follows him.
      if (a.src) a.pos.set(a.src.x, (a.src.y ?? 0) + 2.3, a.src.z);

      const p = this._project(a.pos, cam, W, H, true);
      a.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      a.el.classList.toggle('edge', !p.onScreen);
      a.fill.style.strokeDashoffset = String(CIRC * (1 - Math.max(0, Math.min(1, a.shown))));
      a.el.classList.add('on');
    }
    if (retired) this._refreshThreat();
  }

  /**
   * The objective marker.
   *
   * Two things make this readable during a fast pan rather than merely present:
   *   · off-screen it is clamped to the frame edge (the same path the guard badges take) and a
   *     chevron ORBITS the head to carry the bearing, so the shape the eye tracks never spins;
   *   · the distance is in whole metres and recomputed at ~12 Hz, because a number that changes
   *     every frame is a texture, not a readout.
   */
  _tickGoal(cam, W, H) {
    const g = this._goal;
    if (!g) return;
    const p = this._project(g.point, cam, W, H, true);
    this.el.goal.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    this.el.goal.classList.toggle('edge', !p.onScreen);
    if (!p.onScreen) {
      // Screen-space bearing from the centre. The chevron art points up, hence the +90°.
      const deg = Math.atan2(p.y - H * 0.5, p.x - W * 0.5) * 57.29577951308232 + 90;
      this.el.goalRing.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    }
    if (--this._goalCount <= 0) {
      this._goalCount = TUNE.goalTick;
      const mv = this.engine.get?.('movement');
      if (mv?.position) {
        const d = Math.round(Math.hypot(
          mv.position.x - g.point.x, mv.position.y - g.point.y, mv.position.z - g.point.z));
        if (d !== this._goalDist) {
          this._goalDist = d;
          this.el.goalDist.textContent = `${d} m`;
        }
      }
    }
    this.el.goal.classList.add('on');
  }

  /** World → screen. Returns pooled-ish plain numbers; `clamp` pins off-screen to the edge. */
  _project(p, cam, W, H, clamp = false) {
    _v.copy(p).applyMatrix4(_mInv);
    const dist = -_v.z;                 // view space: −Z is in front of the camera
    const behind = dist < 0.05;
    _v.applyMatrix4(cam.projectionMatrix);
    let x = _v.x, y = _v.y;
    if (behind) { x = -x; y = -y; }
    let sx = (x * 0.5 + 0.5) * W;
    let sy = (-y * 0.5 + 0.5) * H;
    const onScreen = !behind && sx > 0 && sx < W && sy > 0 && sy < H;
    if (!onScreen && clamp) {
      const m = Math.min(W, H) * 0.06;
      sx = Math.max(m, Math.min(W - m, sx));
      sy = Math.max(m, Math.min(H - m, sy));
    }
    // Distance falloff keeps far lock-ons from crowding the frame.
    const s = Math.max(0.5, Math.min(1.1, 16 / Math.max(4, dist)));
    return { ok: onScreen || clamp, onScreen, x: sx, y: sy, s };
  }

  _onTargets(list) {
    this._targets.length = 0;
    if (!Array.isArray(list)) return;
    for (const t of list) {
      if (this._targets.length >= TUNE.markMax) break;
      const point = t?.point ?? t?.position ?? (t?.isVector3 ? t : t?.rec?.mesh?.position);
      if (!point || typeof point.x !== 'number') continue;
      const tag = t?.rec?.tag ?? t?.tag ?? '';
      const gold = !!(t?.loot || t?.pickpocket || t?.rec?.loot || tag === 'loot' || tag === 'guard');
      this._targets.push({ point, gold, label: String(tag || '').toUpperCase() });
    }
    this._ensureMarks(this._targets.length);
  }

  _ensureMarks(n) {
    while (this._marks.length < Math.min(n, TUNE.markMax)) {
      const el = document.createElement('div');
      el.className = 'sly-mark';
      el.innerHTML = `${Ico.lockOn()}<span class="lbl sly-ink sly-ink-s"></span>`;
      this.el.marks.appendChild(el);
      this._marks.push({ el, lbl: el.querySelector('.lbl'), label: '' });
    }
  }

  _onGuardAlert(p) {
    if (!this._built) return;
    if (p == null) {           // a bare null clears the board
      for (const [, a] of this._alerts) a.el.remove();
      this._alerts.clear();
      this._refreshThreat();
      return;
    }
    const id = String(p.id ?? p.guard?.id ?? p.name ?? p.guard?.name ?? 'guard');
    const pres = alertFor(p);
    if (!pres) return;

    /* `Guard._alertPayload.pos` is the guard's own THREE.Vector3, assigned once in his
       constructor and mutated in place thereafter — so KEEPING the reference tracks him for
       free. Copying it, as this used to, froze the badge wherever he happened to be standing
       when he changed state: a guard who spotted you and gave chase left his marker behind at
       the spot he first saw you, which is worse than no marker, because it points nowhere. */
    const src = p.position ?? p.pos ?? p.worldPos ?? p.guard?.position ?? p.point;

    let a = this._alerts.get(id);
    if (!a) {
      const el = document.createElement('div');
      el.className = 'sly-alert';
      el.innerHTML = `<div class="inner">${Ico.alertArc()}` +
                     `<div class="sly-alert-glyph sly-ink sly-ink-s"></div></div>` +
                     `<span class="sly-alert-lbl sly-ink sly-ink-s"></span>`;
      this.el.marks.appendChild(el);
      a = {
        el,
        fill: el.querySelector('.sly-alert-fill'),
        glyph: el.querySelector('.sly-alert-glyph'),
        lbl: el.querySelector('.sly-alert-lbl'),
        pos: new THREE.Vector3(),   // scratch: the projected point, rebuilt every frame
        src: null,                  // live reference to the guard's own position vector
        state: '', shown: 0, fade: 0,
      };
      this._alerts.set(id, a);
    }

    if (src) {
      if (Array.isArray(src)) { a.src = null; a.pos.fromArray(src); }
      else if (typeof src.x === 'number') a.src = src;
    }

    if (pres.state !== a.state) this._applyAlertState(a, pres);
  }

  /** Paint one badge from its presentation entry. Called only when the state actually changes. */
  _applyAlertState(a, pres) {
    a.state = pres.state;
    a.live = pres.live;
    a.target = pres.ring;
    a.fade = pres.live ? 0 : TUNE.alertFade;

    a.glyph.textContent = pres.glyph;
    a.glyph.dataset.wide = pres.glyph.length > 1 ? '1' : '0';
    a.lbl.textContent = pres.label;
    a.fill.style.stroke = pres.colour;
    a.el.style.setProperty('--alert-col', pres.colour);
    a.el.dataset.state = pres.state;
    a.el.classList.toggle('full', pres.state === 'chase');
    a.el.classList.toggle('down', !pres.live && pres.state !== 'patrol');

    if (pres.state === 'chase') {
      this._punch(a.el.firstElementChild, 1.6, 300);
      this._shake = Math.min(1, this._shake + 0.25);
    }
    this._refreshThreat();
  }

  /** Aggregate every tracked guard into the one-glance exposure readout. */
  _refreshThreat() {
    if (!this.el?.threat) return;
    const states = [];
    for (const [, a] of this._alerts) if (a.state) states.push(a.state);
    const t = threatFor(states);
    if (t.key === this._threatKey && t.count === this._threatCount) return;
    const rose = THREAT_RANK[t.key] > (THREAT_RANK[this._threatKey] ?? -1);
    this._threatKey = t.key;
    this._threatCount = t.count;

    this.el.threat.dataset.state = t.key;
    /* Published on the root as well as the chip: the carried-loot chip has to know, because a
       chase is what takes the treasure off you, and CSS can only reach sideways from an ancestor. */
    if (this.root) this.root.dataset.threat = t.key;
    this.el.threat.style.setProperty('--threat-col', t.colour);
    this.el.threatLbl.textContent = t.label;
    this.el.threatNum.textContent = t.count > 1 ? `×${t.count}` : '';
    if (rose) this._punch(this.el.threat, 1.22, 300);
  }

  /* --------------------------------------------------------------- fx */

  _tickFx(dt) {
    if (this._vigPunch > 0) this._vigPunch = Math.max(0, this._vigPunch - dt * TUNE.vignetteDecay);
    const v = Math.min(0.95, this._vig * 0.72 + this._vigPunch);
    this.el.vig.style.opacity = v.toFixed(3);

    if (this._shake > 0.001) {
      this._shake *= Math.exp(-dt * TUNE.shakeDecay);
      if (this.reduced) { this._shake = 0; this.el.shake.style.transform = ''; return; }
      const t = this.engine.time * 61;
      const a = this._shake * 9;
      const x = Math.sin(t * 1.7) * a;
      const y = Math.cos(t * 2.3) * a * 0.7;
      const r = Math.sin(t * 1.1) * this._shake * 0.7;
      this.el.shake.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg)`;
      if (this._shake < 0.003) { this._shake = 0; this.el.shake.style.transform = ''; }
    }
  }

  _tickBinocu(dt) {
    this._recT += dt;
    const s = Math.floor(this._recT) % 60;
    const m = Math.floor(this._recT / 60) % 60;
    if (this.el.bxTime) {
      this.el.bxTime.textContent = `REC ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    const c = this.engine.camera;
    if (c && this.el.bxTl) {
      // Real telemetry: it costs nothing and makes the optics feel wired to the world.
      this.el.bxTl.innerHTML =
        `BINOCUCOM  MK-IV\nCH 04 · <b>SECURE</b>\nSITE: TEMPLE OF RA\n` +
        `X ${fx(c.position.x)}  Y ${fx(c.position.y)}  Z ${fx(c.position.z)}`;
    }
  }

  _hitFx(pips) {
    this._vigPunch = Math.min(1, 0.45 + pips * 0.18);
    this._shake = Math.min(1, this._shake + 0.4 + pips * 0.12);
    this._flash(0.7, 190);
    if (this.el.pips && !this.reduced) {
      this.el.pips.animate(
        [{ transform: 'translateX(-5%) rotate(-1.4deg)' },
         { transform: 'translateX(4%) rotate(1.2deg)' },
         { transform: 'translateX(-2%) rotate(-1.4deg)' },
         { transform: 'translateX(0) rotate(-1.4deg)' }],
        { duration: 260, easing: 'ease-out' }
      );
    }
  }

  _flash(strength, ms) {
    if (!this.el?.flash || this.reduced) return;
    this.el.flash.animate([{ opacity: strength }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }

  _punch(el, scale = 1.4, ms = 260) {
    if (!el || this.reduced) return;
    try {
      el.animate(
        [{ transform: `scale(${scale})` }, { transform: `scale(${1 + (scale - 1) * -0.06})` }, { transform: 'scale(1)' }],
        { duration: ms, easing: 'cubic-bezier(.16,1.4,.38,1)', composite: 'add' }
      );
    } catch {}
  }

  /* ------------------------------------------------------- housekeeping */

  _onPrompt(p) {
    if (p == null || p === false || p === '' || p?.hide || p?.show === false) { this.prompt(null); return; }
    if (typeof p === 'string') {
      // Accept "E — Pickpocket" / "E: Pickpocket" as well as a bare verb.
      const m = p.match(/^\s*([\w ]{1,12}?)\s*[—–\-:|]\s*(.+)$/);
      if (m) this.prompt(m[2].trim(), m[1].trim(), kindFor(m[2]));
      else this.prompt(p, undefined, kindFor(p));
      return;
    }
    const text = p.text ?? p.verb ?? p.label ?? p.action ?? p.name ?? '';
    if (!text) { this.prompt(null); return; }
    this.prompt(String(text), p.key ?? p.button ?? p.input ?? p.bind, p.kind ?? kindFor(text));
  }

  _applyVisibility() {
    const hidden = !!this.engine.debug?.hideHud || !this._visible;
    if (hidden === this._hiddenNow) return;
    this._hiddenNow = hidden;
    if (!this.root) return;
    this.root.dataset.hidden = hidden ? '1' : '0';
    if (hidden && this.pauseOn) {
      // Never leave the engine paused just because the HUD went away mid-menu.
      this.pauseOn = false;
      this.el.pause.classList.remove('on');
      this.engine.paused = false;
    }
  }

  dispose() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    if (this._onKey) window.removeEventListener('keydown', this._onKey);
    for (const t of this._toasts) t.el.remove();
    this._toasts.length = 0;
    for (const [, a] of this._alerts) a.el.remove();
    this._alerts.clear();
    this._marks.length = 0;
    this._digits.length = 0;
    this._goal = null;
    this._carry = null;
    this._objBase = null;
    this.root?.remove();
    this.styleEl?.remove();
    this.root = null;
    this.styleEl = null;
    this.el = null;
    this._built = false;
    if (this.engine) this.engine.paused = false;
  }
}

/* ------------------------------------------------------------- helpers */

function num(v, dflt) { return typeof v === 'number' && Number.isFinite(v) ? v : dflt; }

/**
 * Which shape a pip index is drawn as.
 *
 * `PlayerHealth` publishes `hp = 1 + charms` and `max = 1 + maxCharms`, and says in as many words
 * that *"Sly himself is the last pip"* — so index 0 is his life and everything above it is a
 * lucky charm. The row empties right-to-left (`filled = i < hp`), which means the card is the
 * last thing standing, which is exactly the fact it exists to communicate: with no charm left,
 * the next hit ends the run.
 *
 * Derived from the index rather than from a new field on the payload, so nothing in `src/player`
 * has to grow an interface for the HUD to stop drawing three identical gems.
 */
function pipKind(i) { return i === 0 ? 'life' : 'charm'; }

/** Presentation class for a verb, whoever announced it. See PROMPT_KIND. */
function kindFor(text) { return PROMPT_KIND[String(text).trim().toLowerCase()] ?? ''; }
function fx(v) { return (v >= 0 ? '+' : '') + v.toFixed(1); }
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Normalise whatever MOVEMENT calls a key into either a keycap label or a mouse button. */
function normKey(k) {
  if (!k) return '';
  if (typeof k === 'object') return k.mouse ? k : '';
  const s = String(k).trim();
  if (!s) return '';
  const l = s.toLowerCase();
  if (/^(lmb|left ?mouse|mouse ?1|m1|attack)$/.test(l)) return { mouse: 'left' };
  if (/^(rmb|right ?mouse|mouse ?2|m2|focus|aim)$/.test(l)) return { mouse: 'right' };
  if (/^(mmb|middle ?mouse|wheel|scroll)$/.test(l)) return { mouse: 'wheel' };
  if (KEY_ALIAS[l]) return KEY_ALIAS[l];
  if (s.length === 1) return s.toUpperCase();
  return s.length <= 6 ? s[0].toUpperCase() + s.slice(1) : s.slice(0, 6);
}
