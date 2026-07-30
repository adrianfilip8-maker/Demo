import * as THREE from 'three';
import { HUD_CSS } from './hud.css.js';
import * as Ico from './Icons.js';

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
  alertTTL: 2.2,          // s a suspicion arc survives without a refresh
  alertLerp: 9,           // arc catch-up rate
  markMax: 16,
  shakeDecay: 9.5,
  shakeGain: 0.55,        // fraction of a world shake the UI inherits
  vignetteDecay: 2.2,
  recTick: 1,
};

const CIRC = 2 * Math.PI * 36;   // matches Icons.alertArc()'s r=36

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

/* Until MOVEMENT starts emitting prompts, the HUD finds affordances itself through the
   documented COLLISION query API (§4.6 — "for lock-on UI and Thief-o-Vision"). The moment a
   real `prompt` event arrives this shuts off permanently and MOVEMENT owns the channel. */
const AFF_VERB = {
  hook: 'Cane hook', rail: 'Mount rail', pole: 'Climb pole',
  spire: 'Spire land', vent: 'Crawl in',
};
const AFF_TAGS = Object.keys(AFF_VERB);
const AFF_RANGE = 4.4;

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
    this._objTimer = 0;
    this._shake = 0;
    this._vig = 0;
    this._vigPunch = 0;
    this._plusTimer = 0;
    this._recT = 0;
    this._wasLocked = false;
    this._sawPrompt = false;    // a real `prompt` event retires the affordance fallback
    this._affDead = false;
    this._affCount = 0;

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

      <div class="sly-marks"></div>

      <div class="sly-shake">
        <div class="sly-tl">
          <div class="sly-pips"></div>
          <div class="sly-coins">
            <span class="sly-coin-icon sly-drop">${Ico.coin()}</span>
            <span class="sly-coin-num sly-ink"></span>
            <span class="sly-coin-plus sly-ink sly-ink-s"></span>
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
        </div>
      </div>

      ${this._binocuHtml()}

      <div class="sly-vig"></div>
      <div class="sly-flash"></div>

      ${this._pauseHtml()}
    `;
    document.body.appendChild(root);
    this.root = root;

    const q = (s) => root.querySelector(s);
    this.el = {
      tov: q('.sly-tov'),
      marks: q('.sly-marks'),
      shake: q('.sly-shake'),
      pips: q('.sly-pips'),
      coinNum: q('.sly-coin-num'),
      coinPlus: q('.sly-coin-plus'),
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
    on('toast', (p) => {
      if (!p) return;
      if (typeof p === 'string') this.toast(p);
      else this.toast(p.text ?? p.message ?? '', p);
    });

    on('coins', (n) => this.setCoins(num(n, this.coins)));
    on('coin', (p) => this.addCoins(typeof p === 'number' ? p : num(p?.amount ?? p?.value ?? p?.n, 1)));
    on('pickpocket', () => { this.addCoins(25); this.toast('Pickpocketed', { icon: 'coin' }); });

    on('health', (p) => {
      if (typeof p === 'number') this.setHealth(p, this.healthMax);
      else if (p) this.setHealth(num(p.hp ?? p.current ?? p.value, this.health), num(p.max, this.healthMax));
    });
    on('damage', (p) => this.damage(typeof p === 'number' ? p : num(p?.amount, 1)));
    on('hurt', () => this.damage(1));

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
   */
  prompt(text, key) {
    if (!this._built) return;
    if (!text) {
      this.el.prompt.classList.remove('on');
      this._promptText = '';
      this._promptKey = '';
      return;
    }
    const k = normKey(key);
    if (text === this._promptText && k === this._promptKey) {
      this.el.prompt.classList.add('on');
      return;
    }
    const swap = this.el.prompt.classList.contains('on');
    if (k !== this._promptKey) {
      this.el.promptKey.innerHTML = k
        ? (k.mouse ? Ico.mouse(k.mouse) : Ico.keycap(k))
        : Ico.keycap('E');
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
        s.innerHTML = Ico.pip(i < v);
        this.el.pips.appendChild(s);
      }
    } else {
      const kids = this.el.pips.children;
      for (let i = 0; i < m; i++) {
        const filled = i < v;
        const wasFilled = !kids[i].classList.contains('sly-pip-lost');
        if (filled === wasFilled) continue;
        kids[i].innerHTML = Ico.pip(filled);
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

  /** Comic-cel objective card: slides in, holds, then collapses to a compact tab. */
  objective(title, sub = '') {
    if (!this._built || !title) return;
    this.el.objTitle.textContent = title;
    this.el.objSub.textContent = sub;
    this.el.obj.classList.remove('mini');
    this.el.obj.classList.add('on');
    this._objTimer = TUNE.objectiveHold;
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
    this._tickWorldMarks();
    this._tickFx(d);
    this._tickAffordancePrompt();
    if (this.binocOn) this._tickBinocu(d);
  }

  /** Cheap stand-in prompt driver — see AFF_VERB. Retires itself the moment MOVEMENT speaks. */
  _tickAffordancePrompt() {
    if (this._sawPrompt || this._affDead || this.pauseOn) return;
    if (--this._affCount > 0) return;
    this._affCount = 6;                     // ~10 Hz is plenty for a contextual verb
    const mv = this.engine.get('movement');
    const col = this.engine.get('collision');
    if (!mv?.position || !col?.query) return;
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

    /* ---- guard suspicion arcs ---- */
    for (const [id, a] of this._alerts) {
      a.ttl -= this.engine.dt || 0.016;
      if (a.ttl <= 0 && a.level <= 0.02) { a.el.remove(); this._alerts.delete(id); continue; }
      if (a.ttl <= 0) a.level = Math.max(0, a.level - 0.9 * (this.engine.dt || 0.016));
      a.shown += (a.level - a.shown) * Math.min(1, TUNE.alertLerp * (this.engine.dt || 0.016));

      const p = this._project(a.pos, cam, W, H, true);
      a.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      a.el.classList.toggle('edge', !p.onScreen);
      a.fill.style.strokeDashoffset = String(CIRC * (1 - Math.max(0, Math.min(1, a.shown))));
      const full = a.shown > 0.985;
      if (full !== a.full) {
        a.full = full;
        a.el.classList.toggle('full', full);
        a.glyph.textContent = full ? '!' : '?';
        if (full) { this._punch(a.el.firstElementChild, 1.6, 300); this._shake = Math.min(1, this._shake + 0.25); }
      }
      a.el.classList.add('on');
    }
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
      return;
    }
    const id = String(p.id ?? p.guard?.id ?? p.name ?? p.guard?.name ?? 'guard');
    let level = p.level ?? p.suspicion ?? p.alert ?? p.value;
    if (typeof level !== 'number') {
      const st = String(p.state ?? p.status ?? '').toLowerCase();
      level = st === 'alert' || st === 'chase' || st === 'combat' ? 1
            : st === 'suspicious' || st === 'investigate' ? 0.6
            : st === 'calm' || st === 'patrol' ? 0 : 0.5;
    }
    level = Math.max(0, Math.min(1, level));

    const src = p.position ?? p.pos ?? p.worldPos ?? p.guard?.position ?? p.point;
    let a = this._alerts.get(id);
    if (!a) {
      const el = document.createElement('div');
      el.className = 'sly-alert';
      el.innerHTML = `<div class="inner">${Ico.alertArc()}<div class="sly-alert-glyph sly-ink sly-ink-s">?</div></div>`;
      this.el.marks.appendChild(el);
      a = {
        el, fill: el.querySelector('.sly-alert-fill'), glyph: el.querySelector('.sly-alert-glyph'),
        pos: new THREE.Vector3(), level: 0, shown: 0, ttl: TUNE.alertTTL, full: false,
      };
      this._alerts.set(id, a);
    }
    if (src) {
      if (Array.isArray(src)) a.pos.fromArray(src);
      else if (typeof src.x === 'number') a.pos.set(src.x, (src.y ?? 0) + 2.3, src.z);
    }
    a.level = level;
    a.ttl = TUNE.alertTTL;
    if (level <= 0) a.ttl = 0;
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
      if (m) this.prompt(m[2].trim(), m[1].trim());
      else this.prompt(p);
      return;
    }
    const text = p.text ?? p.verb ?? p.label ?? p.action ?? p.name ?? '';
    if (!text) { this.prompt(null); return; }
    this.prompt(String(text), p.key ?? p.button ?? p.input ?? p.bind);
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
