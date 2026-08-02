import * as THREE from 'three';
import { SHOTS, SHOT_NAMES, applyShot } from './Shots.js';

/**
 * Debug — the bridge between the running game and the automated critic.
 *
 * Everything the screenshot harness needs hangs off `window.__GAME`. Treat this as public
 * API: the quality loop breaks if these signatures change (AGENTS.md §4.5).
 */
const _p = new THREE.Vector3();

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

    this._installGlobals();
    this._installOverlay();
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
      setShot: async (name) => {
        const shot = SHOTS[name];
        if (!shot) throw new Error(`unknown shot "${name}" (have: ${SHOT_NAMES.join(', ')})`);

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
        if (shot.player?.pose && animation?.freezePose) {
          animation.freezePose(shot.player.pose);
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
        await api.step(14);
        applyShot(engine, name);
        await api.step(3);

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
    if (input.pressed('pause')) engine.debug.paused = !engine.debug.paused;

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
