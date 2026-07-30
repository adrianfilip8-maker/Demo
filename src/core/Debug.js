import * as THREE from 'three';
import { SHOTS, SHOT_NAMES, applyShot } from './Shots.js';

/**
 * Debug — the bridge between the running game and the automated critic.
 *
 * Everything the screenshot harness needs hangs off `window.__GAME`. Treat this as public
 * API: the quality loop breaks if these signatures change (AGENTS.md §4.5).
 */
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

        // Let particles seed, shadows settle, and any lazily-compiled program warm up.
        await api.step(14);
        applyShot(engine, name);
        await api.step(3);
        return { name, shot, stats: { ...engine.stats }, warnings: engine.warnings.slice() };
      },

      /** Deterministic fixed-step advance — no reliance on wall clock. */
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
      capture: () => {
        engine.renderFrame(0);      // guarantee the buffer holds the current frame
        return engine.canvas.toDataURL('image/png');
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
