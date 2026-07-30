import * as THREE from 'three';
import {
  createAtmosphereState, evalAtmosphere, PALETTE, SHADOW_FLOOR,
} from './Atmosphere.js';

/**
 * Lighting — the key light, the fill, the bounce, the shadow cascades, the torch pool,
 * and the published geometry of the clerestory light shafts.
 *
 * Design notes worth knowing before editing:
 *
 * · One sun, N shadow maps. three.js gives a DirectionalLight exactly one shadow map, so
 *   the cascades are N co-directional lights and a small patch to `lights_fragment_begin`
 *   that gates each light to its own slice of view depth. Without the gate, N lights at
 *   1/N intensity would give shadows 1/N as dark; with it, exactly one cascade lights any
 *   given fragment, so the shadow is full strength and the cascade seam is invisible.
 *
 * · Cascade frusta are fitted to a *bounding sphere* of the camera's frustum slice, not to
 *   its corners. A sphere is rotation-invariant, so the ortho box stops resizing as the
 *   camera turns — that plus texel snapping is what kills shadow crawl.
 *
 * · SHADING is the real consumer. It gets the key light, the ambient floor, the rim, and
 *   every cascade matrix/map through `setKeyLight()` once per frame.
 */

const TUNE = {
  /* Cascades */
  shadowNear: 0.5,
  shadowDistance: 420,      // must reach the Great Pyramid at (−150, ·, −190) so it casts
  splitLambda: 0.90,        // 0 = uniform splits, 1 = logarithmic
  cascadeFade: 3.2,         // metres of cross-fade between cascades
  radiusQuantum: 0.25,      // tidy the fitted radius; it is already camera-invariant
  casterPadMin: 34,         // metres of extra depth behind a cascade to catch tall casters
  casterPadMax: 190,
  maxCascadeMap: 2048,      // VSM burns an RG16F *and* an F32 depth target per cascade
  vsmRadius: [2.4, 2.0, 1.7, 1.5],
  vsmBlurSamples: [10, 8, 8, 8],
  /* Acne is a texel-size problem, so the offset that fixes it has to be measured in
     texels — not in hand-picked constants that only work at one cascade width. */
  normalBiasTexels: 1.7,
  normalBiasClamp: [0.012, 1.4],
  depthBiasMetres: 0.06,    // converted to normalised depth per cascade at fit time

  /* Key / fill */
  keyBoost: 1.0,
  hemiBoost: 1.0,
  bounceBoost: 1.0,
  ambientBoost: 1.0,

  /* Local lights */
  localCap: { low: 2, med: 4, high: 6, ultra: 8 },
  localCullDistance: 68,
  flickerRate: 5.7,
  flickerPos: 0.055,        // metres of positional wobble — a still flame reads as a lamp

  /* Shafts (§8.1: clerestory slots at y = 15.5, every 8 m in z through the hall) */
  shaftZ: [-18, -26, -34, -42, -50],
  shaftY: 15.5,
  shaftWidth: 1.8,
  shaftSpanX: 21,
  shaftMaxLength: 46,
};

/* ── The cascade shader patch ────────────────────────────────────────────────────
   Only cascade 0 carries light intensity; cascades 1..N−1 exist purely to render extra
   shadow maps. So an *unpatched* built-in material still sees exactly one correctly
   exposed sun (with cascade-0 shadows), and a patched one swaps cascade 0's single
   shadow lookup for a distance-weighted blend across all N maps. No double-lighting,
   no 1/N-strength shadows, and no dependency on which materials got patched. */

const CSM_DECLS = (n) => /* glsl */`
uniform vec2 csmSplits[${n}];
uniform float csmFade;
// Complementary fades: the two masks that overlap at a split always sum to 1, so the
// shadow cross-dissolves while the light stays constant. That is why the seam is invisible.
float csmMask( const in vec2 s, const in float d ) {
  return smoothstep( s.x - csmFade, s.x + csmFade, d )
       * ( 1.0 - smoothstep( s.y - csmFade, s.y + csmFade, d ) );
}
`;

function csmShadowFn(n) {
  let taps = '';
  for (let i = 0; i < n; i++) {
    taps += `
  #if NUM_DIR_LIGHT_SHADOWS > ${i}
  w = csmMask( csmSplits[ ${i} ], d );
  if ( w > 0.0 ) {
    sum += w * getShadow( directionalShadowMap[ ${i} ],
      directionalLightShadows[ ${i} ].shadowMapSize, directionalLightShadows[ ${i} ].shadowIntensity,
      directionalLightShadows[ ${i} ].shadowBias, directionalLightShadows[ ${i} ].shadowRadius,
      vDirectionalShadowCoord[ ${i} ] );
    wsum += w;
  }
  #endif`;
  }
  return /* glsl */`
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && defined( CSM_CASCADES )
float csmShadow( const in float d ) {
  float sum = 0.0, wsum = 0.0, w;${taps}
  return wsum > 1e-4 ? sum / wsum : 1.0;
}
#endif
`;
}

/* The one line inside lights_fragment_begin's directional loop that applies the shadow. */
const CSM_SHADOW_LINE =
  'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

const CSM_SHADOW_PATCH = /* glsl */`
		#if defined( CSM_CASCADES ) && ( UNROLLED_LOOP_INDEX < CSM_CASCADES )
			#if UNROLLED_LOOP_INDEX == 0
			directLight.color *= ( directLight.visible && receiveShadow ) ? csmShadow( vViewPosition.z ) : 1.0;
			#endif
		#else
			${CSM_SHADOW_LINE}
		#endif`;

/** Built-in materials whose light loop we know. Anything else (SHADING's ShaderMaterial)
 *  consumes setKeyLight() instead and is never touched. */
const PATCHABLE = new Set([
  'MeshStandardMaterial', 'MeshPhysicalMaterial',
  'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial',
]);

/* Scratch — update() allocates nothing (§5). */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _lightDir = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _c1 = new THREE.Color();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_FWD = new THREE.Vector3(0, 0, 1);

/** Organic 1-D value noise. Flicker built from a sine reads as a metronome, not a flame. */
function nz(x) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => {
    let t = (n | 0) * 0x27d4eb2d;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
/** Two octaves — one slow breath, one fast crackle. */
function flickerNoise(t, seed) {
  return nz(t * 1.0 + seed) * 0.62 + nz(t * 3.7 + seed * 7.13) * 0.38;
}

export class Lighting {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;

    this.atmosphere = createAtmosphereState();
    this.timeOfDay = engine.debug.timeOfDay ?? 0.79;

    /* ---- published interface (AGENTS.md §4.3 → engine.get('lighting')) ---- */
    this.keyLight = null;              // THREE.DirectionalLight — cascade 0, the lit one
    this.cascades = [];                // [{ light, camera, matrix, map, near, far, texel }]
    this.rimDirection = new THREE.Vector3();
    this.rimColor = new THREE.Color(PALETTE.rimCool);
    this.shafts = [];
    this.localLights = [];
    this.shadowTint = new THREE.Color(PALETTE.shadowHue);
    this.shadowFloor = SHADOW_FLOOR;

    this._cascadeCount = 1;
    this._splits = [];
    this._csmUniforms = null;
    this._patched = new Set();
    this._sweep = 0;

    this._hemi = null;
    this._bounce = null;
    this._ambient = null;
    this._pool = [];
    this._order = [];
    this._probe = null;
    this._offEvents = [];

    /* One reusable payload object for SHADING — mutated, never reallocated. */
    this._keyPayload = {
      direction: new THREE.Vector3(),        // unit, points TOWARD the light
      color: new THREE.Color(),
      intensity: 0,
      ambient: {
        color: new THREE.Color(), intensity: 0,
        sky: new THREE.Color(), ground: new THREE.Color(),
        tint: this.shadowTint, floor: SHADOW_FLOOR,
      },
      rim: { direction: this.rimDirection, color: this.rimColor, strength: 0.55 },
      shadowMatrix: null,                    // cascade 0 (by reference — three mutates it)
      cascades: [],
      shadowSplits: null,
      fog: null,
      timeOfDay: 0,
      nightAmount: 0,
    };
  }

  /* ===================================================================== init */

  async init() {
    const engine = this.engine;
    evalAtmosphere(this.timeOfDay, this.atmosphere);

    this._buildCascades();
    this._buildFill();
    this._buildLocalPool();
    this._buildShafts();

    /* Nothing in the placeholder world casts a shadow, and a bare plane cannot show
       whether the cascades are biased correctly. Only while ARCHITECTURE and TERRAIN are
       both absent, drop in a calibration rig: chunky blocks near the camera for acne /
       peter-panning, and the two §8.1 pyramid silhouettes so the far cascade and the
       aerial-perspective read can be judged. It vanishes the moment either agent lands. */
    if (!engine.has('architecture') && !engine.has('terrain')) this._buildCalibrationRig();

    this._offEvents.push(engine.on('timeOfDay', (v) => {
      this.timeOfDay = v;
      this._applyAtmosphere();
    }));
    this._offEvents.push(engine.on('quality', () => {
      this._rebuildForQuality();
    }));

    this._applyAtmosphere();
  }

  /* ------------------------------------------------------------- cascades --- */

  _cascadeMapSize(i, base) {
    // Cascade 0 gets the budget; the far ones cover 10× the area and nobody looks at a
    // 200 m shadow's edge. VSM allocates an RG16F *and* an F32 depth target per cascade,
    // so this is the difference between 60 MB and 500 MB of shadow memory.
    const cap = TUNE.maxCascadeMap;
    if (i === 0) return Math.min(base, cap);
    return THREE.MathUtils.clamp(i >= 2 ? base >> 1 : base, 1024, cap);
  }

  _buildCascades() {
    const engine = this.engine;
    const n = THREE.MathUtils.clamp(engine.settings.shadowCascades ?? 2, 1, 4);
    this._cascadeCount = n;

    const base = engine.settings.shadowMap ?? 2048;
    const A = this.atmosphere;

    for (let i = 0; i < n; i++) {
      const light = new THREE.DirectionalLight(A.keyColor.getHex(), 0);
      light.name = `lighting.sun.cascade${i}`;
      light.castShadow = true;

      const size = this._cascadeMapSize(i, base);
      light.shadow.mapSize.set(size, size);
      light.shadow.radius = TUNE.vsmRadius[i];
      light.shadow.blurSamples = TUNE.vsmBlurSamples[i];
      light.shadow.bias = -0.0004;      // refined per-cascade in _fitCascades()
      light.shadow.normalBias = 0.02;
      light.shadow.camera.near = 0.05;
      light.shadow.camera.far = 500;
      light.shadow.autoUpdate = true;

      // Order matters: WebGLLights sorts shadow-casters first but is stable, so scene
      // order fixes directionalLights[0..n-1] == cascade 0..n-1, which the shader mask
      // relies on. Every other light this module adds is castShadow:false and lands after.
      engine.scene.add(light);
      engine.scene.add(light.target);

      this.cascades.push({
        index: i,
        light,
        camera: light.shadow.camera,
        matrix: light.shadow.matrix,
        map: null,
        mapSize: size,
        near: 0, far: 0, radius: 0, texel: 0,
      });
    }
    this.keyLight = this.cascades[0].light;

    /* Practical split scheme: blend of uniform and logarithmic. Logarithmic alone wastes
       the near cascade on the first two metres; uniform alone leaves cascade 0 far too
       wide to ever look crisp on Sly. */
    this._splits.length = 0;
    const near = TUNE.shadowNear, far = TUNE.shadowDistance;
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      const log = near * Math.pow(far / near, p);
      const uni = near + (far - near) * p;
      this._splits.push(THREE.MathUtils.lerp(uni, log, TUNE.splitLambda));
    }

    const splitVecs = [];
    for (let i = 0; i < n; i++) {
      splitVecs.push(new THREE.Vector2(
        i === 0 ? -1e4 : this._splits[i],
        i === n - 1 ? 1e6 : this._splits[i + 1]
      ));
    }
    this._csmUniforms = {
      csmSplits: { value: splitVecs },
      csmFade: { value: TUNE.cascadeFade },
    };
    this._keyPayload.shadowSplits = splitVecs;
    this._keyPayload.shadowMatrix = this.cascades[0].matrix;
    this._keyPayload.cascades = this.cascades;
  }

  _rebuildForQuality() {
    // Cascade count is baked into every patched shader, so a quality change has to tear
    // the whole set down and force a relink.
    for (const c of this.cascades) {
      this.engine.scene.remove(c.light);
      this.engine.scene.remove(c.light.target);
      c.light.shadow.dispose?.();
      c.light.dispose?.();
    }
    this.cascades.length = 0;
    this._buildCascades();
    for (const mat of this._patchedMaterials()) mat.needsUpdate = true;
    this._patched.clear();
    this._applyAtmosphere();
  }

  _patchedMaterials() { return this._patchedList || (this._patchedList = []); }

  /* ----------------------------------------------------------------- fill --- */

  _buildFill() {
    const engine = this.engine;
    const A = this.atmosphere;

    // §2.2 FILL / BOUNCE. Sky above, hot sand below: this is what puts colour in the
    // shadows instead of grey, which §7.3 fails a shot for.
    this._hemi = new THREE.HemisphereLight(A.hemiSky.getHex(), A.hemiGround.getHex(), 1);
    this._hemi.name = 'lighting.hemi';
    engine.scene.add(this._hemi);

    // The opposing sand-GI bounce. Aimed slightly upward from the ground side so it fills
    // undersides — chins, ledge soffits, the inside of an arch.
    this._bounce = new THREE.DirectionalLight(PALETTE.bounceSand, 0.3);
    this._bounce.name = 'lighting.sandGI';
    this._bounce.castShadow = false;
    engine.scene.add(this._bounce);
    engine.scene.add(this._bounce.target);

    // Violet-teal floor so nothing ever crushes to black (§2.2 "never below").
    this._ambient = new THREE.AmbientLight(PALETTE.shadowHue, 0.2);
    this._ambient.name = 'lighting.ambientFloor';
    engine.scene.add(this._ambient);
  }

  /* ---------------------------------------------------------- local lights --- */

  _buildLocalPool() {
    const engine = this.engine;
    const cap = TUNE.localCap[engine.quality] ?? 4;
    for (let i = 0; i < cap; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 12, 2);
      l.name = `lighting.local${i}`;
      l.visible = false;
      l.castShadow = false;   // VSM does not support point shadows; see report
      engine.scene.add(l);
      this._pool.push({ light: l, owner: null });
    }
    this._localCap = cap;
  }

  /**
   * Register a brazier / torch / any local emitter. Returns a handle you keep and mutate:
   * `handle.position`, `handle.intensity`, `handle.color`, `handle.radius`, `handle.flicker`
   * are all live. PROPS and FX are the expected callers.
   */
  addLocalLight(opts = {}) {
    const h = {
      id: this._nextLocalId = (this._nextLocalId || 0) + 1,
      position: (opts.position ? _v1.copy(opts.position) : _v1.set(0, 0, 0)).clone(),
      color: new THREE.Color(opts.color ?? 0xffb060),
      intensity: opts.intensity ?? 6,
      radius: opts.radius ?? 10,
      flicker: opts.flicker ?? 0,
      castShadow: !!opts.castShadow,
      enabled: opts.enabled !== false,
      /* runtime */
      _slot: null, _dist: 1e9, _seed: (this._nextLocalId * 13.37) % 97,
      _live: 0, _wob: new THREE.Vector3(),
    };
    this.localLights.push(h);
    return h;
  }

  removeLocalLight(handle) {
    if (!handle) return;
    const i = this.localLights.indexOf(handle);
    if (i >= 0) this.localLights.splice(i, 1);
    if (handle._slot) {
      handle._slot.owner = null;
      handle._slot.light.visible = false;
      handle._slot = null;
    }
  }

  /** How many local lights can actually be lit at once on this quality tier. */
  get localLightBudget() { return this._localCap; }

  /* ---------------------------------------------------------------- shafts --- */

  _buildShafts() {
    // Published as data, not geometry: FX and POSTFX render the volumetrics, but they must
    // line up with the real openings in §8.1 or the shot reads as fog with no cause.
    for (let i = 0; i < TUNE.shaftZ.length; i++) {
      this.shafts.push({
        id: `clerestory${i}`,
        origin: new THREE.Vector3(0, TUNE.shaftY, TUNE.shaftZ[i]),
        dir: new THREE.Vector3(0, -1, 0),      // direction light travels
        axis: new THREE.Vector3(1, 0, 0),      // the slot's long axis
        width: TUNE.shaftWidth,
        span: TUNE.shaftSpanX * 2,             // slot length along axis
        length: TUNE.shaftY,
        intensity: 0,
        color: new THREE.Color(PALETTE.keySun),
      });
    }
  }

  _updateShafts() {
    const A = this.atmosphere;
    // Sun travel direction. A 22° sun through a roof slot throws a long oblique blade
    // across the hall, which is exactly the shot §2.3 asks for.
    _lightDir.copy(A.sunDir).multiplyScalar(-1).normalize();
    const drop = Math.max(0.12, -_lightDir.y);
    const len = Math.min(TUNE.shaftMaxLength, TUNE.shaftY / drop);
    // Blades die when the sun is too low to reach the floor, and at night entirely.
    const grazing = THREE.MathUtils.smoothstep(A.sunDir.y, 0.05, 0.45);
    const power = A.dayAmount * (0.35 + 0.65 * grazing);
    for (const s of this.shafts) {
      s.dir.copy(_lightDir);
      s.length = len;
      s.intensity = power;
      s.color.copy(A.sunColor);
    }
  }

  /* ------------------------------------------------------ calibration rig --- */

  _buildCalibrationRig() {
    const engine = this.engine;
    const g = new THREE.Group();
    g.name = 'lighting.__calibration';

    const stone = new THREE.MeshStandardMaterial({ color: 0xc9915a, roughness: 0.92, metalness: 0 });
    const pale = new THREE.MeshStandardMaterial({ color: 0xd4c19a, roughness: 0.88, metalness: 0 });

    const box = new THREE.BoxGeometry(1, 1, 1);
    const put = (mat, x, y, z, sx, sy, sz) => {
      const m = new THREE.Mesh(box, mat);
      m.position.set(x, y + sy / 2, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    };

    // Near cluster: tall thin pylons throw long raking shadows across the courtyard, the
    // exact case that exposes acne (too little bias) and peter-panning (too much).
    put(stone, -6, 0, 10, 2.4, 9, 2.4);
    put(stone, 2, 0, 14, 1.6, 6.5, 1.6);
    put(pale, 8, 0, 6, 3.2, 12, 3.2);
    put(stone, -12, 0, 2, 2.0, 4.0, 2.0);
    put(pale, 0, 0, -6, 5.0, 2.0, 22.0);       // low wall — shows contact shadow quality
    put(stone, 14, 0, 22, 2.2, 16, 2.2);
    put(pale, -20, 0, 26, 6.0, 9.0, 6.0);
    // Mid distance, for cascade 1/2 handover.
    put(stone, -30, 0, -40, 4, 22, 4);
    put(stone, 26, 0, -60, 5, 26, 5);

    const cone = new THREE.ConeGeometry(1, 1, 4, 1);
    const pyr = (x, z, h, base) => {
      const m = new THREE.Mesh(cone, pale);
      m.position.set(x, h / 2, z);
      m.scale.set(base, h, base);
      m.rotation.y = Math.PI / 4;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    };
    pyr(-150, -190, 105, 105);   // §8.1 Great Pyramid
    pyr(95, -250, 72, 74);       // §8.1 second pyramid

    engine.scene.add(g);
    this._probe = g;
    engine.warn('lighting: placeholder world detected — temporary shadow/haze calibration ' +
                'rig added. It removes itself once ARCHITECTURE or TERRAIN lands.');
  }

  /* =================================================================== frame */

  _applyAtmosphere() {
    const A = evalAtmosphere(this.timeOfDay, this.atmosphere);

    for (let i = 0; i < this.cascades.length; i++) {
      const l = this.cascades[i].light;
      l.color.copy(A.keyColor);
      // Cascade 0 is the sun. Cascades 1..N−1 are shadow-map providers only — zero
      // intensity, so nothing double-lights and unpatched materials stay correctly exposed.
      l.intensity = i === 0 ? A.keyIntensity * TUNE.keyBoost : 0;
    }

    if (this._hemi) {
      this._hemi.color.copy(A.hemiSky);
      this._hemi.groundColor.copy(A.hemiGround);
      this._hemi.intensity = A.hemiIntensity * TUNE.hemiBoost;
    }
    if (this._bounce) {
      this._bounce.color.copy(A.bounceColor);
      this._bounce.intensity = A.bounceIntensity * TUNE.bounceBoost;
      this._bounce.position.copy(A.bounceDir).multiplyScalar(140);
      this._bounce.target.position.set(0, 0, 0);
    }
    if (this._ambient) {
      this._ambient.color.copy(A.ambientColor);
      this._ambient.intensity = A.ambientIntensity * TUNE.ambientBoost;
    }

    this.rimDirection.copy(A.rimDir);
    this.rimColor.copy(A.rimColor);
    this._keyPayload.rim.strength = A.rimStrength;

    this._updateShafts();
  }

  update(dt, t) {
    const engine = this.engine;

    if (engine.debug.timeOfDay !== this.timeOfDay) {
      this.timeOfDay = engine.debug.timeOfDay;
      this._applyAtmosphere();
    }

    if (this._probe && (engine.has('architecture') || engine.has('terrain'))) {
      this._disposeProbe();
    }

    this._fitCascades();
    this._updateLocalLights(t);
    this._sweepMaterials();
    this._publishKeyLight();
  }

  /* --------------------------------------------------------- cascade fit --- */

  _fitCascades() {
    const cam = this.engine.camera;
    if (!cam) return;
    const A = this.atmosphere;

    _lightDir.copy(A.keyDir).multiplyScalar(-1).normalize();   // direction light travels

    // Stable basis perpendicular to the light. Fixed for a fixed sun, so the snap grid
    // does not rotate under the shadow — the other half of "shadows don't crawl".
    const upRef = Math.abs(_lightDir.y) > 0.95 ? WORLD_FWD : WORLD_UP;
    _right.crossVectors(upRef, _lightDir).normalize();
    _up.crossVectors(_lightDir, _right).normalize();

    cam.getWorldPosition(_camPos);
    cam.getWorldDirection(_v1);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    const tanH = tanV * cam.aspect;
    const k2 = tanV * tanV + tanH * tanH;

    for (let i = 0; i < this.cascades.length; i++) {
      const c = this.cascades[i];
      const n = this._splits[i], f = this._splits[i + 1];
      c.near = n; c.far = f;

      /* Closed-form bounding sphere of the frustum slice. Equating the near-ring and
         far-ring corner distances to a centre on the view axis gives
         z = (n+f)(1+k²)/2; when that runs past the far plane the far ring alone bounds
         the slice. A sphere is rotation-invariant, so the ortho box stops resizing when
         the camera turns — half of why shadows stop crawling. */
      let z = 0.5 * (n + f) * (1 + k2);
      let radius;
      if (z >= f) {
        z = f;
        radius = Math.max(f * Math.sqrt(k2), Math.hypot(n * Math.sqrt(k2), f - n));
      } else {
        radius = Math.sqrt((f - z) * (f - z) + f * f * k2);
      }
      radius = Math.ceil(radius / TUNE.radiusQuantum) * TUNE.radiusQuantum;
      c.radius = radius;

      // Slice centre in world space, along the camera's forward axis.
      _centre.copy(_camPos).addScaledVector(_v1, z);

      /* Texel snap. Express the centre in the light's own basis and round the two
         lateral components to whole shadow-map texels. Sub-texel motion of the box is
         exactly what makes shadow edges shimmer as the camera walks. */
      const texel = (2 * radius) / c.mapSize;
      c.texel = texel;
      const a = Math.round(_centre.dot(_right) / texel) * texel;
      const b = Math.round(_centre.dot(_up) / texel) * texel;
      const d = Math.round(_centre.dot(_lightDir) / 0.5) * 0.5;
      _v2.set(0, 0, 0)
        .addScaledVector(_right, a)
        .addScaledVector(_up, b)
        .addScaledVector(_lightDir, d);

      const pad = THREE.MathUtils.clamp(radius * 0.7 + 30, TUNE.casterPadMin, TUNE.casterPadMax);
      const back = radius + pad;

      c.light.position.copy(_v2).addScaledVector(_lightDir, -back);
      c.light.target.position.copy(_v2);
      c.light.target.updateMatrixWorld();

      const sc = c.camera;
      const farPlane = back + radius + 1;
      if (sc.left !== -radius || sc.far !== farPlane) {
        sc.left = -radius; sc.right = radius;
        sc.top = radius; sc.bottom = -radius;
        sc.near = 0.05;
        sc.far = farPlane;
        sc.updateProjectionMatrix();
      }

      /* Bias, derived rather than guessed. normalBias walks the shadow lookup along the
         surface normal by a fixed number of texels, which is the only offset that scales
         correctly from a 3 cm near cascade to a 35 cm far one; the depth bias stays a
         constant handful of centimetres in world units. Together they kill acne without
         detaching contact shadows (peter-panning). */
      const sh = c.light.shadow;
      sh.normalBias = THREE.MathUtils.clamp(
        texel * TUNE.normalBiasTexels, TUNE.normalBiasClamp[0], TUNE.normalBiasClamp[1]);
      sh.bias = -TUNE.depthBiasMetres / (farPlane - sc.near);

      if (!c.map && c.light.shadow.map) c.map = c.light.shadow.map;
    }
  }

  /* ------------------------------------------------------- local lights --- */

  _updateLocalLights(t) {
    const engine = this.engine;
    const cam = engine.camera;
    if (cam) cam.getWorldPosition(_camPos);

    const lights = this.localLights;
    const nl = lights.length;
    const cull2 = TUNE.localCullDistance * TUNE.localCullDistance;

    /* Distance cull + nearest-N promotion. Insertion order on a preallocated index array:
       no Array#sort, no closures, no garbage. */
    const order = this._order;
    order.length = 0;
    for (let i = 0; i < nl; i++) {
      const h = lights[i];
      if (!h.enabled) { h._dist = 1e9; continue; }
      h._dist = cam ? h.position.distanceToSquared(_camPos) : 0;
      if (h._dist > cull2) continue;
      let j = order.length;
      order.push(i);
      while (j > 0 && lights[order[j - 1]]._dist > h._dist) {
        order[j] = order[j - 1];
        order[j - 1] = i;
        j--;
      }
    }

    const cap = this._pool.length;
    const promote = Math.min(cap, order.length);

    // Release slots whose owner dropped out of the nearest-N set.
    for (let s = 0; s < cap; s++) {
      const slot = this._pool[s];
      if (!slot.owner) continue;
      let keep = false;
      for (let k = 0; k < promote; k++) if (lights[order[k]] === slot.owner) { keep = true; break; }
      if (!keep) {
        slot.owner._slot = null;
        slot.owner = null;
        slot.light.visible = false;
      }
    }

    for (let k = 0; k < promote; k++) {
      const h = lights[order[k]];
      if (!h._slot) {
        let slot = null;
        for (let s = 0; s < cap; s++) if (!this._pool[s].owner) { slot = this._pool[s]; break; }
        if (!slot) continue;
        slot.owner = h;
        h._slot = slot;
      }
      const L = h._slot.light;

      /* Flicker: two-octave noise in intensity *and* position. The positional wobble is
         what actually sells it — a flame's shadow should breathe, not just its brightness. */
      let amp = 1;
      if (h.flicker > 0) {
        const n1 = flickerNoise(t * TUNE.flickerRate, h._seed);
        const n2 = flickerNoise(t * TUNE.flickerRate * 0.61 + 11.0, h._seed * 1.7);
        amp = 1 + (n1 - 0.5) * 2 * h.flicker * 0.55 + (n2 - 0.5) * h.flicker * 0.3;
        h._wob.set(
          (flickerNoise(t * 3.1, h._seed + 3) - 0.5) * 2,
          (flickerNoise(t * 4.3, h._seed + 9) - 0.5) * 2 + 0.35,
          (flickerNoise(t * 2.7, h._seed + 21) - 0.5) * 2
        ).multiplyScalar(TUNE.flickerPos * h.flicker * 4);
      } else {
        h._wob.set(0, 0, 0);
      }

      // Distance fade so a promoted light never pops in at full strength.
      const fade = 1 - THREE.MathUtils.smoothstep(
        Math.sqrt(h._dist), TUNE.localCullDistance * 0.72, TUNE.localCullDistance);
      h._live = Math.max(0, h.intensity * amp * fade);

      L.visible = h._live > 0.001;
      L.position.copy(h.position).add(h._wob);
      L.color.copy(h.color);
      L.intensity = h._live;
      L.distance = h.radius;
      L.decay = 2;
    }
  }

  /* ------------------------------------------------- cascade shader patch --- */

  /**
   * Opt a material into cascade shadows. Built-in three materials only — SHADING's
   * ShaderMaterials get the same data through setKeyLight() and do their own lookup.
   * Safe to call repeatedly.
   */
  enableCascades(material) {
    if (!material || this._patched.has(material.uuid)) return material;
    if (material.userData?.csm === false) return material;
    if (material.isShaderMaterial || material.isRawShaderMaterial) return material;
    if (!PATCHABLE.has(material.type)) return material;

    const n = this._cascadeCount;
    const csm = this._csmUniforms;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      try { prev?.call(material, shader, renderer); } catch { /* not ours to fix */ }
      shader.uniforms.csmSplits = csm.csmSplits;
      shader.uniforms.csmFade = csm.csmFade;
      const chunk = THREE.ShaderChunk.lights_fragment_begin
        .replace(CSM_SHADOW_LINE, CSM_SHADOW_PATCH);
      if (chunk === THREE.ShaderChunk.lights_fragment_begin) {
        // three's chunk changed shape under us — bail loudly rather than silently
        // shipping a scene with no cascade blending.
        this.engine.warn('lighting: CSM patch anchor not found in lights_fragment_begin; ' +
                         'cascade blending disabled (cascade 0 still shadows).');
        return;
      }
      shader.fragmentShader =
        `#define CSM_CASCADES ${n}\n` + CSM_DECLS(n) +
        shader.fragmentShader
          .replace('#include <shadowmap_pars_fragment>',
                   '#include <shadowmap_pars_fragment>\n' + csmShadowFn(n))
          .replace('#include <lights_fragment_begin>', chunk);
    };
    const prevKey = material.customProgramCacheKey;
    material.customProgramCacheKey = () => `csm${n}|${prevKey ? prevKey.call(material) : ''}`;
    material.needsUpdate = true;
    this._patched.add(material.uuid);
    this._patchedMaterials().push(material);
    return material;
  }

  /** Walk the scene occasionally and adopt any new built-in material. Cheap and
   *  allocation-free; a full traverse of a few thousand nodes every third of a second. */
  _sweepMaterials() {
    if (this._cascadeCount < 2) return;
    if (--this._sweep > 0) return;
    this._sweep = 20;
    this._sweepFn ||= (obj) => {
      const m = obj.material;
      if (!m) return;
      if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) this.enableCascades(m[i]); }
      else this.enableCascades(m);
    };
    this.engine.scene.traverse(this._sweepFn);
  }

  /* ------------------------------------------------------- hand-off ------- */

  _publishKeyLight() {
    const A = this.atmosphere;
    const p = this._keyPayload;

    p.direction.copy(A.keyDir);
    p.color.copy(A.keyColor);
    p.intensity = A.keyIntensity * TUNE.keyBoost;
    p.ambient.color.copy(A.ambientColor);
    p.ambient.intensity = A.ambientIntensity * TUNE.ambientBoost;
    p.ambient.sky.copy(A.hemiSky);
    p.ambient.ground.copy(A.hemiGround);
    p.ambient.floor = A.shadowFloor;
    p.rim.strength = A.rimStrength;
    p.timeOfDay = this.timeOfDay;
    p.nightAmount = A.nightAmount;

    const sky = this.engine.get('sky');
    p.fog = sky?.fogParams ?? A.fog;

    const shading = this.engine.get('shading');
    if (shading?.setKeyLight) {
      try { shading.setKeyLight(p); }
      catch (err) { this.engine.warn(`shading.setKeyLight threw: ${err?.message || err}`); }
    }
  }

  /* ------------------------------------------------------------ teardown --- */

  _disposeProbe() {
    if (!this._probe) return;
    const seen = new Set();
    this._probe.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry.uuid)) { seen.add(o.geometry.uuid); o.geometry.dispose(); }
      if (o.material && !seen.has(o.material.uuid)) { seen.add(o.material.uuid); o.material.dispose(); }
    });
    this.engine.scene.remove(this._probe);
    this._probe = null;
  }

  dispose() {
    for (const off of this._offEvents) off?.();
    this._offEvents.length = 0;
    const scene = this.engine.scene;
    for (const c of this.cascades) {
      scene.remove(c.light); scene.remove(c.light.target);
      c.light.shadow?.dispose?.(); c.light.dispose?.();
    }
    this.cascades.length = 0;
    for (const s of this._pool) { scene.remove(s.light); s.light.dispose?.(); }
    this._pool.length = 0;
    if (this._hemi) { scene.remove(this._hemi); this._hemi.dispose?.(); }
    if (this._bounce) { scene.remove(this._bounce); scene.remove(this._bounce.target); this._bounce.dispose?.(); }
    if (this._ambient) { scene.remove(this._ambient); this._ambient.dispose?.(); }
    this._disposeProbe();
  }
}
