import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Debug } from './core/Debug.js';

/**
 * Boot. Modules are discovered rather than hard-imported: agents land files over time and
 * the build must never break because one of them hasn't been written yet. `import.meta.glob`
 * resolves at build time against files that actually exist, so a missing module is simply
 * absent from the map and we degrade instead of exploding.
 */
const MODULE_FILES = import.meta.glob('./{render,textures,world,player,fx,ai,ui,audio}/*.js');

/**
 * CHARACTER MODEL SELECTION — the incumbent is the DEFAULT, deliberately.
 *
 * Two character models can exist side by side: `SlyModel.js` (the shipped one) and
 * `SlyModel3.js` (the Sly-3-reference rebuild). Which one boots is chosen by the same
 * `__CHAR_AB` token mechanism the character already uses for its own A/B levers, so an A/B
 * capture is a RUNTIME choice made in-page — no `src/` edit, no arm to install, and therefore
 * none of §186's contamination hazard or §191/§192's install-vs-drift ambiguity. The capture
 * runner sets `globalThis.__CHAR_AB` before boot exactly as `staging2` mutates the shot table.
 *
 * Restoring the incumbent is the ABSENCE of a token, not an action: if the token is missing, or
 * misspelled, or the rebuild file has been deleted, this resolves to `SlyModel.js`. A rebuild
 * can only ship by someone changing this default on purpose.
 */
/* DEFAULT FLIPPED — deliberately — 2026-08-07, per PREREG-charab §6's ship row. The deciding
 * blind round (RESULT-charab-FINAL.md, seed 9, the series' first phase-free frames after C-F3
 * voided every earlier round) scored the rebuild 15–1, taking all four questions, with all five
 * gates passing. The pre-rebuild model remains one token away (`?char=legacy`) — restoration is
 * still the cheap path, exactly as the seal designed. */
/* DEFAULT FLIPPED AGAIN — 2026-08-07, on direct instruction ("use this new character model and
 * proceed"), to the SUPPLIED model. Note what this does and does not rest on: the blind-round
 * requirement I had been enforcing exists to stop ME promoting work I am invested in, and an
 * explicit choice by the project's owner is not that. So the seal's machinery is not being
 * overridden — it never governed this decision.
 *
 * `dl` (auto-skinned) is the default rather than `dlraw` (untouched geometry), and that is a
 * judgement worth stating: dlraw is the more faithful of the two and renders correctly standing
 * still, but every vertex is rigid to `hips`, so it holds its authored T-pose and never animates.
 * As the playable character it would cross the world arms-out in every shot. `dl` animates and
 * deforms cleanly everywhere except the tail, which is one wrong element against a character that
 * does not move at all. Both remain one token away in either direction. */
const CHAR_MODELS = {
  /* SHIPPED: the supplied model on its own artist skin weights. It took four captures and one
     revert to get here — the first `dlrig` attempt went into this slot unseen and was broken,
     which is why the default moved back to `dl` in between. It now beats `dl` on both counts:
     the face reads correctly AND the tail holds volume, where `dl` never resolved its tail. */
  '': ['./player/SlyModelDLRig.js', 'SlyModel'],      // supplied model, artist weights — SHIPPED
  dlrig: ['./player/SlyModelDLRig.js', 'SlyModel'],   // explicit alias
  dl: ['./player/SlyModelDL.js', 'SlyModel'],         // auto-skinned fallback (tail never fixed)
  dlraw: ['./player/SlyModelDLRaw.js', 'SlyModel'],   // the supplied model untouched; T-pose, static
  model3: ['./player/SlyModel3.js', 'SlyModel'],      // the Sly-3-reference procedural rebuild
  legacy: ['./player/SlyModel.js', 'SlyModel'],       // the pre-rebuild procedural model
};
function characterModule() {
  let raw = '';
  try {
    /* `?char=` first: the selector is read at module-load time, so a capture harness cannot poke
       it in-page after boot the way it pokes a uniform. A URL param is the only seam that is
       reliably set BEFORE this module evaluates. */
    if (typeof location !== 'undefined' && location.search) {
      const q = new URLSearchParams(location.search).get('char');
      if (q) raw = String(q);
    }
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__CHAR_AB != null) raw = String(globalThis.__CHAR_AB);
    else if (!raw && typeof import.meta !== 'undefined' && import.meta.env) raw = String(import.meta.env.VITE_CHAR_AB || '');
  } catch { /* plain-module hosts have no location/import.meta.env; that is the shipped path */ }
  const tokens = raw.split(/[,\s]+/).filter(Boolean);
  for (const t of tokens) {
    const pick = CHAR_MODELS[t];
    // Fall through to the incumbent if the file is not in the glob — a deleted or not-yet-written
    // rebuild must degrade, never explode (the reason this whole map is data and not an import).
    if (pick && MODULE_FILES[pick[0]]) return pick;
  }
  return CHAR_MODELS[''];
}
const CHARACTER = characterModule();

/**
 * Registration order == update order. Producers before consumers:
 * textures → shading → sky/lighting → world → collision → player → fx → ai → ui → postfx last.
 */
const MANIFEST = [
  ['textures',     './textures/Textures.js',      'Textures'],
  ['shading',      './render/ToonMaterial.js',    'Shading'],
  ['sky',          './render/Sky.js',             'Sky'],
  ['lighting',     './render/Lighting.js',        'Lighting'],
  ['terrain',      './world/Terrain.js',          'Terrain'],
  ['architecture', './world/Architecture.js',     'Architecture'],
  ['props',        './world/Props.js',            'Props'],
  /* Inert unless ?kaykit= is set — see KayKit.js. Registered so the showcase can be captured
     without a source edit at capture time. */
  ['kaykit',       './world/KayKit.js',           'KayKit'],
  ['collision',    './world/Collision.js',        'Collision'],
  ['character',    CHARACTER[0],                  CHARACTER[1]],
  ['animation',    './player/Animation.js',       'Animation'],
  ['movement',     './player/Controller.js',      'Controller'],
  ['camera',       './player/CameraRig.js',       'CameraRig'],
  ['guards',       './ai/Guard.js',               'Guards'],
  ['fx',           './fx/Particles.js',           'Particles'],
  ['audio',        './audio/Audio.js',            'Audio'],
  ['hud',          './ui/HUD.js',                 'HUD'],
  ['postfx',       './render/PostFX.js',          'PostFX'],
];

const bootEl = document.getElementById('boot');
const barEl = document.getElementById('bootBar');
const hintEl = document.getElementById('bootHint');
const clickEl = document.getElementById('bootClick');
const errEl = document.getElementById('err');

function setProgress(p, label) {
  if (barEl) barEl.style.width = `${Math.max(6, Math.round(p * 100))}%`;
  if (hintEl && label) hintEl.textContent = label;
}

function fatal(err) {
  console.error(err);
  if (!errEl) return;
  errEl.style.display = 'block';
  errEl.textContent = `Boot failed:\n${err?.stack || err}`;
  if (hintEl) hintEl.textContent = 'Failed to load — see console';
}

/** Minimal stand-in world so the harness always has something to photograph. */
function fallbackWorld(engine, missing) {
  engine.warn(`running with placeholder world; missing modules: ${missing.join(', ')}`);

  if (!engine.has('lighting')) {
    const hemi = new THREE.HemisphereLight(0x8fc4ff, 0xe8a852, 1.1);
    engine.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
    sun.position.set(-38, 34, 46);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 60;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 220 });
    engine.scene.add(sun);
  }
  if (!engine.has('sky')) {
    engine.scene.background = new THREE.Color(0x6fa8d8);
    engine.scene.fog = new THREE.FogExp2(0xe8b878, 0.0075);
  }
  if (!engine.has('terrain') && !engine.has('architecture')) {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400, 1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xc9915a, roughness: 0.95 })
    );
    g.receiveShadow = true;
    engine.scene.add(g);
    engine.registerCollider(g, { tag: 'ground', material: 'sand' });
  }
}

async function boot() {
  const engine = new Engine({
    container: document.getElementById('app'),
    quality: new URLSearchParams(location.search).get('q') || 'high',
  });
  window.__ENGINE = engine;

  const input = new Input(engine);
  engine.input = input;
  const debug = new Debug(engine, input);
  engine.debugTools = debug;

  /* ---- discover + instantiate ---- */
  setProgress(0.04, 'Assembling');
  const missing = [];
  for (const [key, path, exportName] of MANIFEST) {
    const loader = MODULE_FILES[path];
    if (!loader) { missing.push(key); continue; }
    try {
      const mod = await loader();
      const Ctor = mod[exportName] || mod.default;
      if (typeof Ctor !== 'function') {
        engine.warn(`${path} has no export "${exportName}" (or default) — skipping.`);
        missing.push(key);
        continue;
      }
      engine.register(key, new Ctor(engine));
    } catch (err) {
      engine.warn(`failed to load ${path}: ${err?.message || err}`);
      console.error(err);
      missing.push(key);
    }
  }

  /* ---- init ---- */
  const LABEL = {
    textures: 'Carving hieroglyphs', shading: 'Mixing inks', sky: 'Raising the sun',
    lighting: 'Lighting braziers', terrain: 'Pouring sand', architecture: 'Building the temple',
    props: 'Placing treasures', collision: 'Testing every ledge', character: 'Tailoring a thief',
    animation: 'Teaching Sly to move', movement: 'Calibrating the cane', camera: 'Framing the shot',
    guards: 'Posting the guard', fx: 'Stirring dust', audio: 'Tuning the score',
    hud: 'Printing the Binocucom', postfx: 'Grading the film',
  };
  await engine.initModules((p, key) => setProgress(0.05 + p * 0.9, LABEL[key] || key));

  if (missing.length) fallbackWorld(engine, missing);

  /**
   * Sweep shadow flags across the world.
   *
   * Every module sets castShadow/receiveShadow on the meshes it remembers to, and the result
   * was 60 of 301 meshes participating — four fifths of the temple neither casting nor
   * receiving. Rather than chase each module, enforce it centrally: opaque world geometry
   * casts and receives unless it opts out via userData.
   *
   * Opt out with `mesh.userData.noShadow = true` (sky domes, particles, water, ink shells,
   * light shafts) — anything that would either self-shadow into artefacts or has no business
   * occluding the sun.
   */
  {
    let cast = 0, recv = 0, skipped = 0;
    engine.scene.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const opaque = m && !m.transparent && m.depthWrite !== false;
      if (o.userData?.noShadow || o.userData?.isOutlineShell || !opaque) { skipped++; return; }
      o.castShadow = true;
      o.receiveShadow = true;
      cast++; recv++;
    });
    console.log(`[boot] shadow sweep: ${cast} meshes cast+receive, ${skipped} opted out`);

    /**
     * Adopt every material into the cascaded-shadow setup now, rather than waiting for
     * LIGHTING's periodic sweep. That sweep runs once every 20 frames, and a canonical
     * screenshot poses the camera and steps ~17 — so a capture could render before any
     * material had been patched, silently falling back to the cascade-naive shadow path.
     */
    const lighting = engine.get('lighting');
    if (lighting?.enableCascades) {
      let adopted = 0;
      engine.scene.traverse((o) => {
        const m = o.material;
        if (!m) return;
        if (Array.isArray(m)) { for (const mm of m) { lighting.enableCascades(mm); adopted++; } }
        else { lighting.enableCascades(m); adopted++; }
      });
      console.log(`[boot] cascade adoption: ${adopted} materials`);
    }
  }

  /* ---- frame loop ---- */
  const origRenderFrame = engine.renderFrame.bind(engine);
  engine.renderFrame = (dt) => {
    input.beginFrame();
    debug.update();
    origRenderFrame(dt);
    input.endFrame();
  };

  engine.start();

  // Warm up shader compilation before revealing the scene, otherwise the first second is a
  // slideshow of stutters as programs link.
  try { engine.renderer.compile(engine.scene, engine.camera); } catch {}
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));

  setProgress(1, 'Ready');
  debug.markReady();

  /* ---- reveal ---- */
  const headless = new URLSearchParams(location.search).has('shot');
  if (headless) {
    bootEl?.classList.add('gone');
    setTimeout(() => bootEl?.remove(), 700);
  } else {
    clickEl?.classList.add('on');
    const begin = () => {
      bootEl?.classList.add('gone');
      setTimeout(() => bootEl?.remove(), 700);
      input.requestLock();
      engine.get('audio')?.unlock?.();
      window.removeEventListener('pointerdown', begin);
      window.removeEventListener('keydown', begin);
    };
    window.addEventListener('pointerdown', begin);
    window.addEventListener('keydown', begin);
  }

  if (engine.warnings.length) {
    console.warn(`[boot] ${engine.warnings.length} warning(s):\n` + engine.warnings.join('\n'));
  }
  console.log(
    `%c Sly Cooper: Sands of Ra %c ${engine.quality} · ${MANIFEST.length - missing.length}/${MANIFEST.length} modules `,
    'background:#2a7fd4;color:#fff;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px',
    'background:#1a1210;color:#f4e2b8;border-radius:0 3px 3px 0;padding:2px 6px'
  );
}

boot().catch(fatal);
window.addEventListener('error', (e) => { if (!window.__GAME?.ready) fatal(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { if (!window.__GAME?.ready) fatal(e.reason); });
