import * as THREE from 'three';
import { SHOTS, SHOT_NAMES, applyShot } from './Shots.js';

/**
 * Debug — the bridge between the running game and the automated critic.
 *
 * Everything the screenshot harness needs hangs off `window.__GAME`. Treat this as public
 * API: the quality loop breaks if these signatures change (AGENTS.md §4.5).
 */
const _p = new THREE.Vector3();

/* The settle steps `setShot` runs, named so the clock advance it costs can be DERIVED in the
   warning below rather than quoted at it. They were two bare literals and the "~0.28 s" figure
   in §251 was worked out by hand from them; a hand-worked number goes stale the first time
   somebody changes a 14 to a 16 and says nothing. */
const SETTLE_FRAMES = 14;
const SETTLE_FRAMES_2 = 3;

/* ── §726: the L1 / N day-night toggle ─────────────────────────────────────────────────────────
 *
 * The night endpoint is the shot catalogue's own `night` grade — `SHOTS.night.tod`, 0.02 —
 * because that value has been through the critic rounds (midnight 0.0 measured ~85% black there
 * and was rejected; the `night` entry is one of the ten environment shots the standing baseline
 * is scored over). The day endpoint is whatever the engine booted with (0.78 golden hour).
 *
 * The transition EASES the tod scalar along the corridor that runs FORWARD through midnight:
 * 0.78 → 1.02 ≡ 0.02 (sunset → twilight → deep night), and back the same way. The day-side
 * path (0.78 → 0.5 → 0.02) would brighten to full noon mid-fade, so it is not used.
 * `evalAtmosphere` wraps tod (`((tod % 1) + 1) % 1`) and its deep-night anchor covers the whole
 * sub-horizon span, so every intermediate frame is a grade the atmosphere model was built for —
 * including the hard sun→moon key switch, which the model's own comment places "where both keys
 * are dim" (twilight), exactly the region the ease crosses over ~0.2 s instead of in one frame.
 *
 * Propagation honours Guard.js's documented contract — "[the 'timeOfDay' event] fires only on
 * discontinuous sets, never per-frame": during the fade only `engine.debug.timeOfDay` is
 * written, which every consumer already polls per frame (Sky, Lighting, Shading, the guards'
 * own eased `_light`); the event is emitted ONCE, when the fade lands on its endpoint, so
 * event-only work (the dust-mote rebuild) runs once per completed toggle. A snap was driven
 * through the same pipeline and measured before choosing this — see KNOWN_ISSUES §726.
 *
 * The fade runs on the INPUT layer's real clock (`input.dtReal`), not the scaled game clock:
 * it is a presentation transition, so Thief-o-Vision's 0.35× and the debug pause neither slow
 * nor freeze it — the same reasoning `_padLook` records for camera input.
 *
 * Interruptible by design: L1 mid-fade flips the target and the scalar turns around from where
 * it is — nothing queues. Any OTHER writer of `engine.debug.timeOfDay` (shot staging, the
 * `setTimeOfDay` console facility) cancels the fade and wins; the toggle re-derives its state
 * from the world on the next press. Session-only on purpose: no storage is written, and a
 * reload boots at the day grade.
 */
const DN_FADE_S = 1.2;      // seconds, real time — §726.5's snap-vs-ease measurement
const DN_EPS = 1e-6;

/**
 * What the frame actually contains of the character, as opposed to what the shot asked for.
 *
 * Reports three separate things that are easy to conflate, and were:
 *   asked    where Shots.js staged him
 *   staged   where he was immediately after staging — differs from `asked` if the staging
 *            path silently did nothing
 *   final    where he was when the frame rendered — differs from `staged` if the 17 settle
 *            frames moved him (gravity, a collider push, a controller state)
 *
 * `ndc` and `onScreen` are frustum tests only. **`onScreen: true` is not visibility** — it
 * cannot see occlusion. Use it to rule a shot out, never to rule one in; settle visibility
 * with a visible/hidden A/B against a real frame.
 */
function _subject(engine, shot, character, staged) {
  const asked = shot?.player?.pos ?? null;
  const root = character?.root ?? null;
  if (!root) return { asked, staged: null, final: null, present: false };

  const final = root.position.clone();
  _p.copy(final).project(engine.camera);
  const fwd = new THREE.Vector3();
  engine.camera.getWorldDirection(fwd);
  const behind = final.clone().sub(engine.camera.position).dot(fwd) < 0;

  const round3 = (v) => v && [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
  return {
    asked,
    staged: round3(staged),
    final: round3(final),
    // Non-zero means the settle steps moved him after staging — usually gravity or a collider.
    drift: staged ? +staged.distanceTo(final).toFixed(3) : null,
    visible: root.visible !== false,
    ndc: [+_p.x.toFixed(3), +_p.y.toFixed(3)],
    onScreen: !behind && Math.abs(_p.x) <= 1 && Math.abs(_p.y) <= 1,
    present: true,
  };
}

export class Debug {
  constructor(engine, input) {
    this.engine = engine;
    this.input = input;
    this.freeCam = null;
    this._shotMode = null;

    /* §726 day/night state. `_dnDay` reads the boot value rather than restating 0.78 so the
       toggle follows the engine default if it ever moves; `_dnNight` reads the catalogue. */
    this._dnDay = engine.debug.timeOfDay;
    this._dnNight = SHOTS.night?.tod ?? 0.02;
    this._dnSpan = (((this._dnNight - this._dnDay) % 1) + 1) % 1;   // 0.24, forward through midnight
    this._dnU = 0;              // 0 = day endpoint · 1 = night endpoint
    this._dnTarget = 0;
    this._dnActive = false;
    this._dnWrote = null;       // the exact value the fade last wrote; any other writer cancels

    this._installGlobals();
    this._installOverlay();
  }

  /* ── §726 helpers ──────────────────────────────────────────────────────── */

  /** Corridor position of a tod value, or null when it is off the day↔night corridor. */
  _dnUFor(tod) {
    if (!(this._dnSpan > 0)) return null;
    const rel = (((tod - this._dnDay) % 1) + 1) % 1;
    if (rel <= this._dnSpan + 1e-4) return Math.min(1, rel / this._dnSpan);
    return null;
  }

  /** tod at corridor position u, wrapped to [0, 1) and quantised so endpoints land exactly. */
  _dnTodAt(u) {
    const t = this._dnDay + this._dnSpan * u;
    return +((((t % 1) + 1) % 1).toFixed(4));
  }

  _dayNightToggle() {
    const engine = this.engine;
    if (this._dnActive) {
      // Second press mid-fade REVERSES from wherever the scalar is; nothing queues.
      this._dnTarget = this._dnTarget === 1 ? 0 : 1;
      return;
    }
    const u = this._dnUFor(engine.debug.timeOfDay);
    if (u == null) {
      /* A console-set tod off the corridor (noon, morning): no eased path is defined through
         the shipped corridor, so this press is the discontinuous set the debug facility
         already performs — classified by wrapped distance, to the far endpoint. */
      const wd = (a, b) => { const d = (((a - b) % 1) + 1) % 1; return Math.min(d, 1 - d); };
      const tod = engine.debug.timeOfDay;
      const toNight = wd(tod, this._dnDay) <= wd(tod, this._dnNight);
      this._dnU = this._dnTarget = toNight ? 1 : 0;
      const v = toNight ? this._dnNight : this._dnDay;
      engine.debug.timeOfDay = v;
      engine.emit('timeOfDay', v);
      return;
    }
    this._dnU = u;
    this._dnTarget = u >= 0.5 ? 0 : 1;
    this._dnActive = true;
  }

  _dayNightTick() {
    if (!this._dnActive) return;
    const engine = this.engine;
    if (this._dnWrote != null && engine.debug.timeOfDay !== this._dnWrote) {
      // Someone else wrote tod (shot staging, setTimeOfDay): the fade yields immediately.
      this._dnActive = false;
      this._dnWrote = null;
      this._dnU = this._dnTarget = (this._dnUFor(engine.debug.timeOfDay) ?? 0) >= 0.5 ? 1 : 0;
      return;
    }
    const dt = Math.min(Math.max(this.input?.dtReal ?? 1 / 60, 0), 1 / 20);
    const dir = this._dnTarget > this._dnU ? 1 : -1;
    this._dnU += (dir * dt) / DN_FADE_S;
    if ((dir > 0 && this._dnU >= this._dnTarget - DN_EPS) || (dir < 0 && this._dnU <= this._dnTarget + DN_EPS)) {
      this._dnU = this._dnTarget;
      this._dnActive = false;
    }
    const v = this._dnTodAt(this._dnU);
    engine.debug.timeOfDay = v;
    if (this._dnActive) {
      this._dnWrote = v;
    } else {
      // The landing is the discontinuous SET the event contract describes — emit once.
      this._dnWrote = null;
      engine.emit('timeOfDay', v);
    }
  }

  _installGlobals() {
    const engine = this.engine;

    const api = {
      engine,
      THREE,
      ready: false,
      shots: SHOT_NAMES.slice(),
      warnings: engine.warnings,
      get stats() { return engine.stats; },

      /**
       * Pose the world for a canonical shot: camera, time of day, and the player's
       * position + frozen animation pose. Resolves once the frame is renderable.
       */
      /* `opts.dt` (§195/§28): the settle steps below default to LIVE dt on purpose — staging
       * wants the sim to settle, and changing that default would silently change what every
       * historical capture in this project meant. But a within-boot A/B needs the world clock
       * frozen through EVERY frame-advancing call in the path, including these two, and until
       * this option existed §28's "pass dt = 0" advice was unreachable from any runner that
       * stages through setShot/grab — staging2's P-F4 [0,0] band was unachievable by
       * construction (§195, two VOID runs). A/B runners pass { dt: 0 }; everything else passes
       * nothing and gets today's behaviour bit-for-bit. */
      setShot: async (name, opts = {}) => {
        const shot = SHOTS[name];
        if (!shot) throw new Error(`unknown shot "${name}" (have: ${SHOT_NAMES.join(', ')})`);
        const dt = Number.isFinite(opts.dt) ? opts.dt : 1 / 60;
        /* §251. The comment above has said "A/B runners pass { dt: 0 }" since §195, and it was
           missed again: 32 of 59 runners never pass it, and `decalsign`'s null arm differed from
           itself on 51.97% of pixels at mean 3.85 L because its two arms were 0.28 s apart on the
           only clock anything in this build reads. A documented hazard is worth nothing until it
           fails loudly (§245).

           So the default is announced rather than changed. Changing it would silently alter what
           every historical capture in this project meant, and it is the RIGHT default for the
           one-shot renders that are most of the 32 — `shot.mjs` has no second frame to be
           inconsistent with. What was missing was that the choice was invisible at the point of
           use. `engine.warn` reaches `engine.warnings` and therefore `report.json`, so a run that
           staged with a live clock now says so in its own manifest.

           Once per boot, not per call: twelve runners call `setShot` two or more times and a
           per-call warning would be the census-that-cries-wolf §248 warns about. A runner that
           genuinely wants the clock passes `{ dt: 1/60 }` and hears nothing.

           `tests/clockfreeze.test.mjs` reads the line above by regex to check the default is still
           non-zero, so it stays one expression rather than being split into a named boolean —
           the duplicated `Number.isFinite` is the cheaper half of that trade. */
        if (!Number.isFinite(opts.dt) && !this._warnedShotDt) {
          this._warnedShotDt = true;
          const advance = (SETTLE_FRAMES + SETTLE_FRAMES_2) * dt;
          engine.warn?.(`setShot("${name}") was called without opts.dt, so the world clock is LIVE: `
            + `each call advances engine.time by ${advance.toFixed(3)} s over its `
            + `${SETTLE_FRAMES + SETTLE_FRAMES_2} settle frames. That clock is this build's only `
            + 'phase source — birds, particles, embers, shafts and water all ride it — so two arms '
            + 'captured in one boot render at DIFFERENT animation phases and a duplicate arm will '
            + 'not reproduce itself (§251: 51.97% of pixels differed at mean 3.85 L). If this run '
            + 'compares arms, pass { dt: 0 } to setShot AND to every step() in the path. If it '
            + 'genuinely wants the clock to run, pass { dt: 1/60 } and this goes quiet.');
        }

        // Take the camera away from the gameplay rig, and take frames away from rAF so the
        // capture is reproducible frame-for-frame.
        engine.stopLoop();
        engine.debug.freeCam = true;
        engine.debug.hideHud = true;
        engine.emit('hideHud', true);
        this._shotMode = name;

        const movement = engine.get('movement');
        const animation = engine.get('animation');
        const character = engine.get('character');

        if (shot.player && movement?.teleport) {
          movement.teleport(new THREE.Vector3().fromArray(shot.player.pos), shot.player.yaw ?? 0);
        }
        /* Staging failures here used to be SILENT, and silence is what made them expensive:
           two capture-to-capture divergences of 50-110 cm in the cane were traced (KNOWN_ISSUES
           §35.1) to exactly two candidates — the freeze not taking, and the rig never binding —
           and neither left any trace except a wrong picture. Bounded, not reproduced, precisely
           because there was nothing in the record to read afterwards. So both now announce
           themselves into `engine.warnings`, which reaches `report.json`: a capture that staged
           wrongly says so in its own manifest instead of quietly rendering a different pose.
           Warn, never throw (§5) — a diagnostic that kills the run destroys the evidence. */
        if (shot.player?.pose) {
          if (!animation?.freezePose) {
            engine.warn?.(`setShot("${name}"): shot asks for pose "${shot.player.pose}" but the `
              + 'animation module exposes no freezePose — the character is rendering whatever '
              + 'pose the sim happened to be in, NOT the one this shot specifies');
          } else {
            animation.freezePose(shot.player.pose);
            /* Confirm it took by reading the state it sets, rather than assuming the call
               implies it. `freezePose` already warns on an unknown clip name and returns with
               `frozen` still null, so this catches that path AND any future one that leaves the
               wrong clip held. Field names checked against Animation.js, not guessed — a
               condition written against a property that does not exist never fires, which is the
               most useless kind of check there is. */
            if (!animation.frozen) {
              engine.warn?.(`setShot("${name}"): freezePose("${shot.player.pose}") did not take — `
                + 'nothing is frozen, so this frame is whatever pose the sim was already in');
            } else if (animation.frozen.name !== shot.player.pose) {
              engine.warn?.(`setShot("${name}"): asked to freeze "${shot.player.pose}" but `
                + `"${animation.frozen.name}" is held — this frame is not the pose it claims`);
            }
          }
        }
        if (character?.root) character.root.visible = !shot.hidePlayer;

        applyShot(engine, name);

        /* Where the character actually is, recorded before the settle steps run.
           A projection check can only say "inside the frustum" — it cannot see occlusion and
           it cannot tell whether staging took effect. `courtyard` passed every projection
           check while hiding the character changed zero pixels, and the tools said nothing
           was wrong. Capturing this in the report means the next such question is answered by
           reading the record instead of re-running the investigation. */
        const staged = character?.root?.position?.clone?.() ?? null;

        // Let particles seed, shadows settle, and any lazily-compiled program warm up.
        // (At opts.dt = 0 the frames still render and flush — only the world clock stands still.)
        await api.step(SETTLE_FRAMES, dt);
        applyShot(engine, name);
        await api.step(SETTLE_FRAMES_2, dt);

        return {
          name, shot,
          subject: _subject(engine, shot, character, staged),
          stats: { ...engine.stats },
          warnings: engine.warnings.slice(),
        };
      },

      /**
       * Fixed-step advance. Deterministic across runs — no reliance on the wall clock — but
       * **NOT phase-stable within a run**, and the difference cost this project a whole A/B.
       *
       * At the default `dt` this advances `engine.time`, so two arms captured one after the
       * other in the same boot render at *different* animation phases: torch flames, dust,
       * shafts, sparkle and birds all ride that clock, and it is the only phase source in the
       * build (nothing in `src/fx` or `src/render` reads `performance.now()`/`Date.now()`).
       * A gold-bloom sweep was voided by exactly this — its duplicate arm, at an identical
       * setting, moved more pixels than its strongest real arm.
       *
       * **For any within-boot A/B, pass `dt = 0`:** `step(n, 0)`. Frames still advance, poked
       * uniforms still propagate and SwiftShader still flushes; only the world clock stands
       * still, and a duplicate arm then differs by exactly zero pixels. The default is left
       * live on purpose — staging wants the sim to settle — so the caller chooses.
       *
       * See KNOWN_ISSUES §28, and §30 for which statistics survive the unpinned case anyway.
       */
      step: async (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) {
          engine.renderFrame(dt);
          // Yield to the browser so SwiftShader actually flushes rather than queueing.
          await new Promise((r) => setTimeout(r, 0));
        }
      },

      /**
       * Read the framebuffer straight off the canvas. More reliable than a page screenshot:
       * it captures exactly the rendered frame with no compositor timing involved.
       * (Engine sets preserveDrawingBuffer so the buffer is still valid here.)
       */
      capture: (mime = 'image/png', quality = 0.92, maxWidth = 0) => {
        engine.renderFrame(0);      // guarantee the buffer holds the current frame
        const src = engine.canvas;
        if (!maxWidth || src.width <= maxWidth) return src.toDataURL(mime, quality);
        // Downscale for the progress page, which embeds every shot as a data URI.
        const s = maxWidth / src.width;
        const c = document.createElement('canvas');
        c.width = Math.round(src.width * s);
        c.height = Math.round(src.height * s);
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, c.width, c.height);
        return c.toDataURL(mime, quality);
      },

      /** Return the camera to gameplay control. */
      clearShot: () => {
        this._shotMode = null;
        engine.debug.freeCam = false;
        engine.debug.hideHud = false;
        engine.emit('hideHud', false);
        engine.get('animation')?.unfreezePose?.();
        const character = engine.get('character');
        if (character?.root) character.root.visible = true;
        engine.resumeLoop();
      },

      setQuality: (q) => engine.setQuality(q),
      setTimeOfDay: (v) => { engine.debug.timeOfDay = v; engine.emit('timeOfDay', v); },
      setPose: (p) => engine.get('animation')?.freezePose?.(p),
      poses: () => engine.get('animation')?.clipNames?.() ?? [],

      /** Which contracted modules actually exist yet — the progress page reads this. */
      modules: () => {
        const keys = ['shading','postfx','sky','lighting','textures','architecture','props',
                      'terrain','collision','character','animation','movement','camera',
                      'fx','guards','hud','audio'];
        return Object.fromEntries(keys.map((k) => [k, engine.has(k)]));
      },

      hideHud: (v = true) => { engine.debug.hideHud = v; engine.emit('hideHud', v); },
    };

    window.__GAME = api;
    this.api = api;
  }

  markReady() {
    this.api.ready = true;
    document.documentElement.setAttribute('data-game-ready', '1');
  }

  _installOverlay() {
    const el = document.createElement('div');
    el.id = 'dbg';
    el.style.cssText = `
      position:fixed;left:10px;top:10px;z-index:30;display:none;
      font:11px/1.5 ui-monospace,monospace;color:#bfe6ff;
      background:rgba(8,12,22,.72);border:1px solid rgba(143,216,255,.22);
      padding:7px 10px;border-radius:7px;pointer-events:none;white-space:pre;
      backdrop-filter:blur(6px);`;
    document.body.appendChild(el);
    this.el = el;
    this.visible = false;
  }

  update() {
    const { engine, input } = this;

    if (input.pressed('freecam')) {
      this.visible = !this.visible;
      this.el.style.display = this.visible ? 'block' : 'none';
    }
    if (input.pressed('colliders')) {
      engine.debug.showColliders = !engine.debug.showColliders;
      engine.emit('showColliders', engine.debug.showColliders);
    }
    /**
     * F2 cycles the quality preset.
     *
     * `quality` has been in `KEY_BINDINGS` since Input was written and **nothing read it** — it
     * sat between two live debug keys (F1 `freecam`, F3 `colliders`) doing nothing, while
     * `engine.setQuality()` and `__GAME.setQuality()` both existed. That is the milder of the
     * two ways an action can be broken, and the distinction is worth keeping: a bound-but-unread
     * action **advertises a key that does nothing** — it appears in `input.bindings()` and
     * `describe()`, so a control list or a rebinding screen offers it and the player blames
     * themselves when it is inert. An unbound-but-read verb is worse: it exists in code and no
     * input can reach it, so the feature is invisible. A census of every action against every
     * binding found **zero of the latter**, so this build's input surface is in the better state
     * — recorded here because that is the fact a future reader will want and it is cheap to lose.
     */
    if (input.pressed('quality')) {
      const order = ['low', 'med', 'high', 'ultra'];
      const next = order[(order.indexOf(engine.quality) + 1) % order.length];
      engine.setQuality(next);
    }
    if (input.pressed('pause')) engine.debug.paused = !engine.debug.paused;
    /* §726: the day/night toggle — L1 on the pad, N on the keyboard. Consumed here beside
       `pause`/`quality` because this file already owns every action that flips a field of
       `engine.debug`, and because main.js pumps this update OUTSIDE the dt-zero gate, so the
       toggle (and its fade, which runs on the real clock) works while the sim is paused. */
    if (input.pressed('daynight')) this._dayNightToggle();
    this._dayNightTick();

    if (!this.visible) return;
    const s = engine.stats;
    const mv = engine.get('movement');
    const state = mv?.stateName ?? '—';
    const vel = mv?.velocity ? mv.velocity.length().toFixed(1) : '—';
    const pos = mv?.position
      ? `${mv.position.x.toFixed(1)} ${mv.position.y.toFixed(1)} ${mv.position.z.toFixed(1)}`
      : '—';
    this.el.textContent =
      `${s.fps} fps   ${s.ms.toFixed(1)} ms\n` +
      `draws ${s.drawCalls}   tris ${(s.triangles / 1000).toFixed(0)}k   progs ${s.programs}\n` +
      `q ${engine.quality}   tod ${engine.debug.timeOfDay.toFixed(2)}\n` +
      `state ${state}   spd ${vel}\n` +
      `pos ${pos}` +
      (engine.warnings.length ? `\n! ${engine.warnings.length} warning(s)` : '');
  }
}
