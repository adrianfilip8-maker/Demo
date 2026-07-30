import * as THREE from 'three';
import { TOON_PARS, TOON_DETAIL, TOON_SHADE } from './shaders/toon.glsl.js';
import {
  weldNormals, createOutlineMaterial, buildOutlineShell, removeOutlineShell,
} from './Outline.js';

/**
 * Shading — the game's single lighting model, plus its ink lines.
 *
 * Every visible surface goes through `toon()`, which returns a MeshStandardMaterial whose PBR
 * accumulation has been surgically replaced (via onBeforeCompile) by a cel model: banded
 * diffuse ramp, coloured transparent shadows, fresnel rim, hard-stepped specular, wrap-around
 * SSS, triplanar detail, and height-fog aerial perspective — see shaders/toon.glsl.js.
 *
 * Inheriting from MeshStandardMaterial rather than writing a ShaderMaterial from scratch is a
 * deliberate call: it means shadow mapping, skinning, morph targets, instancing, batching,
 * screen-space-derivative tangents and every UV channel keep working exactly as three.js
 * intends them to, forever. Nothing here reimplements engine plumbing.
 *
 * Public surface (AGENTS.md §4.4) plus a few additive helpers other agents will want:
 *   toon(opts)                        cached material factory
 *   outline(mesh, opts)               attach an inverted-hull ink shell
 *   applyOutlines(root, opts)         walk a subtree and shell everything asking for it
 *   setKeyLight({...})                LIGHTING pushes the key here every frame
 *   setAtmosphere({...})              SKY pushes haze colour/density here
 *   normalMaterial                    override material for POSTFX's normal pass
 *   beginNormalPass() / endNormalPass()
 *   setOutlinesVisible(v)
 */

/* ---------------------------------------------------------------------------
   TUNE — every feel/look constant the critic loop might want to move.
--------------------------------------------------------------------------- */
const TUNE = {
  /* --- ramp --- */
  bands: 3,
  termLo: 0.14,          // first terminator, in N.L. Pushed off zero so the shadow side reads chunky.
  termHi: 0.52,          // last terminator; the gap between the two is the mid-tone band
  termSoft: 0.024,       // half-width of the smoothstep. ~0.05 total ≈ AGENTS' "≈0.03, hard but not aliased"
  shadowSharp: [0.10, 0.66],   // remap of the shadow map: hard, with a sliver of penumbra

  /* --- key / fill --- */
  keyIntensity: 2.55,
  ambIntensity: 0.52,
  shadowFloor: 0.155,    // shadow illumination as a fraction of key luminance. AGENTS: never below ~14%
  shadowWash: 0.16,      // additive part of the shadow light — keeps the hue alive on warm albedo.
                         // Unmultiplied by albedo, so at 0.34 it painted flat blue over everything.
  shadowSat: 0.34,       // albedo saturation BOOST inside shadow (not a cut)

  /* --- rim --- */
  rim: 0.55,
  rimPower: 3.1,
  rimGain: 2.05,         // scales the art-directed rim colour into bloom range

  /* --- spec --- */
  spec: 0.25,
  gloss: 32,
  rough: 0.62,
  metalGain: 0.62,

  /* --- sss --- */
  sss: 0.2,

  /* --- outline --- */
  inkPx: 2.5,            // AGENTS: lines stay ~2.5 px on screen
  inkFalloff: 150,       // metres over which lines thin out so distant clutter stays quiet
  inkSun: 0x1a1210,
  inkShade: 0x161022,

  /* --- atmosphere (SKY overrides these) --- */
  hazeDensity: 0.020,
  hazeFalloff: 0.055,    // 1/metres — ~18 m scale height, so the courtyard floor silts up
  hazeBase: 0.0,
  hazeStart: 26,
  hazeGain: 1.30,

  /* --- detail --- */
  detailFade: 95,        // metres at which the triplanar layer is fully faded out
};

/* The Egypt palette, AGENTS.md §2.2. THREE.Color decodes sRGB hex to linear working space. */
const PAL = {
  sun: 0xffd9a0,
  sunHigh: 0xfff2d8,
  sunLow: 0xff9a5c,
  moon: 0x9fc4ff,
  fillSky: 0x6fa8d8,
  fillSkyNight: 0x2f4a7a,
  bounce: 0xe8a852,
  bounceNight: 0x243350,
  rim: 0x7fd4ff,
  rimNight: 0xa8e0ff,
  shadowHue: 0x2a3f66,
  /* Ceiling on the shadow light's brightest channel after the floor rescale. Above roughly
     this the violet-teal clips toward blue and stops reading as shadow. */
  shadowTintPeak: 0.42,
  /* How much warm sand bounce is mixed into the shadow light. Desert shadow is sky plus
     sand bounce; pure sky turns warm albedo mauve. */
  shadowBounceMix: 0.45,
  haze: 0xe8b878,
  hazeNight: 0x2a3f66,
  hazeSun: 0xffc98a,
  goldSpec: 0xfffbe8,
  sandstoneMid: 0xc9915a,
  wrapWarm: 0xffb07a,
};

const DAY_START = 0.23, DAY_END = 0.85;

/* Scratch — hoisted so update() allocates nothing. */
const _v3 = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v2 = new THREE.Vector2();
const _col = new THREE.Color();

export class Shading {
  constructor(engine) {
    this.engine = engine;
    this.tune = TUNE;

    /** @type {Map<string, THREE.Material>} */
    this._cache = new Map();
    /** @type {Map<string, THREE.ShaderMaterial>} */
    this._inkCache = new Map();
    /** @type {Map<string, THREE.DataTexture>} */
    this._detail = new Map();
    /** @type {THREE.Mesh[]} */
    this._shells = [];

    this._patchWarned = false;
    this._autoKey = true;          // until LIGHTING calls setKeyLight()
    this._autoLight = null;
    this._autoScan = 0;
    this._wireframe = false;
    this._outlinesVisible = true;
    this.shadowMatrix = null;

    this._shadowTint = new THREE.Color(PAL.shadowHue);
    this._shadowTintLum = lum(this._shadowTint);
    this._shadowFloor = TUNE.shadowFloor;

    /**
     * Shared uniform objects. Every material created by toon() references these *by identity*,
     * so writing a value once in update() reaches the whole scene — and costs no allocation.
     * three re-uploads a material's uniforms on its first draw of each frame, so this is safe.
     */
    this.uniforms = {
      uKeyDir:       { value: new THREE.Vector3(-0.62, 0.34, 0.71).normalize() },
      uKeyColor:     { value: new THREE.Color(PAL.sun) },
      uKeyIntensity: { value: TUNE.keyIntensity },
      uSkyColor:     { value: new THREE.Color(PAL.fillSky) },
      uBounceColor:  { value: new THREE.Color(PAL.bounce) },
      uAmbIntensity: { value: TUNE.ambIntensity },
      uShadowColor:  { value: new THREE.Color(0x000000) },
      uShadowWash:   { value: TUNE.shadowWash },
      uShadowSharp:  { value: new THREE.Vector2(TUNE.shadowSharp[0], TUNE.shadowSharp[1]) },
      uHaze:         { value: new THREE.Color(PAL.haze) },
      uHazeSun:      { value: new THREE.Color(PAL.hazeSun) },
      uHazeGain:     { value: TUNE.hazeGain },
      uHazeDensity:  { value: TUNE.hazeDensity },
      uHazeFalloff:  { value: TUNE.hazeFalloff },
      uHazeBase:     { value: TUNE.hazeBase },
      uHazeStart:    { value: TUNE.hazeStart },
      uTime:         { value: 0 },
      uRes:          { value: new THREE.Vector2(1600, 900) },
      uTermLo:       { value: TUNE.termLo },
      uTermHi:       { value: TUNE.termHi },
      uRimGain:      { value: TUNE.rimGain },
      uShadowSat:    { value: TUNE.shadowSat },
      uMetalGain:    { value: TUNE.metalGain },
    };

    this._refreshShadowColor();

    /**
     * POSTFX's interior-crease pass needs view-space normals. three's default depth texture
     * covers the depth term, so all that is missing is this: a plain MeshNormalMaterial used
     * as scene.overrideMaterial. It picks up skinning/instancing/morphing automatically.
     */
    this.normalMaterial = new THREE.MeshNormalMaterial({ name: 'slyNormalPass' });

    this._onTimeOfDay = () => { if (this._autoKey) this._applyAutoLight(); };
    engine.on?.('timeOfDay', this._onTimeOfDay);
  }

  async init() {
    const s = this.engine.settings || {};
    this._detailSize = s.texSize >= 1024 ? 256 : 128;
    this._detail2 = this.engine.quality !== 'low';
    this._syncResolution();
    this._applyAutoLight();
  }

  /* ======================================================================
     Material factory
  ====================================================================== */

  /**
   * The one material factory. Cached by an option hash: identical options always return the
   * identical instance, so a thousand calls from ARCHITECTURE cost one program and one upload.
   *
   * All options optional. Unknown keys are ignored.
   *
   *   color            base albedo. Defaults to sandstone mid, or white when a `map` is given
   *   map normalMap roughnessMap aoMap emissiveMap alphaMap
   *   bands   3       diffuse quantisation steps (2..6)
   *   rim     0.55    fresnel rim strength      rimColor  0x7fd4ff
   *   spec    0.25    hard-stepped specular     gloss     32
   *   rough   0.62    dielectric roughness (ignored when roughnessMap is set)
   *   metal   0       1 = read as metal: killed diffuse, hot lobe, stylised reflection
   *   sss     0.2     warm wrap-around for fur/skin/cloth   wrapColor 0xffb07a
   *   detail  null    triplanar detail key: sandstone limestone gold plaster sand cloth fur metal
   *   detailScale/detailStrength/detailGrain   override the preset
   *   outline 1.0     inverted-hull thickness multiplier recorded for outline(); 0 = never
   *   haze    1.0     aerial-perspective multiplier; 0 for sky domes and UI
   *   emissive 0x000000  emissiveIntensity 0
   *   ao      1.0     aoMap strength
   *   transparent opacity side vertexColors depthWrite depthTest alphaTest flatShading
   *   skinning        accepted and ignored — three handles it from the mesh type
   */
  toon(opts = {}) {
    let key;
    try {
      const o = this._resolve(opts);
      key = o.key;
      const hit = this._cache.get(key);
      if (hit) return hit;
      const mat = this._build(o);
      this._cache.set(key, mat);
      return mat;
    } catch (err) {
      // A material factory must never take the frame down.
      this._warn(`toon() failed (${err?.message || err}); falling back to standard material`);
      const fallback = new THREE.MeshStandardMaterial({
        color: opts.color ?? PAL.sandstoneMid,
        map: opts.map || null,
        roughness: 0.7,
      });
      if (key) this._cache.set(key, fallback);
      return fallback;
    }
  }

  /** Normalise + hash the option bag. */
  _resolve(opts) {
    // Every texture slot is validated before it reaches a material. A caller that passes a
    // TEXTURES *bundle* (§4.4 returns {map, normalMap, ...}) instead of a THREE.Texture makes
    // three.js read `.matrix` off a plain object deep inside refreshMaterialUniforms, which
    // throws mid-render and takes the whole frame down. Unwrap what we can, drop the rest,
    // and name the slot so the caller can be found.
    for (const slot of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'metalnessMap']) {
      const v = opts[slot];
      if (!v || v.isTexture) continue;
      const unwrapped = v[slot]?.isTexture ? v[slot] : (v.map?.isTexture ? v.map : null);
      opts[slot] = unwrapped;
      this.engine?.warn(
        `shading.toon: "${slot}" was not a THREE.Texture` +
        (unwrapped ? ' — unwrapped it from the texture bundle.' : ' — dropped it.')
      );
    }

    const hasMap = !!opts.map;
    const detailKey = typeof opts.detail === 'string' && opts.detail ? opts.detail : null;
    const preset = detailKey ? DETAIL_PRESETS[detailKey] || DETAIL_PRESETS.generic : null;

    const o = {
      color: hex(opts.color, hasMap ? 0xffffff : PAL.sandstoneMid),
      map: opts.map || null,
      normalMap: opts.normalMap || null,
      roughnessMap: opts.roughnessMap || null,
      aoMap: opts.aoMap || null,
      emissiveMap: opts.emissiveMap || null,
      alphaMap: opts.alphaMap || null,

      bands: clamp(num(opts.bands, TUNE.bands), 2, 6),
      termSoft: num(opts.bandSoftness, TUNE.termSoft),
      rim: num(opts.rim, TUNE.rim),
      rimColor: hex(opts.rimColor, PAL.rim),
      rimPower: num(opts.rimPower, TUNE.rimPower),
      spec: num(opts.spec, TUNE.spec),
      specColor: hex(opts.specColor, PAL.goldSpec),
      gloss: Math.max(num(opts.gloss, TUNE.gloss), 2),
      rough: clamp(num(opts.rough ?? opts.roughness, TUNE.rough), 0.02, 1),
      metal: clamp(num(opts.metal ?? opts.metalness, 0), 0, 1),
      sss: clamp(num(opts.sss, TUNE.sss), 0, 1),
      wrapColor: hex(opts.wrapColor ?? opts.sssColor, PAL.wrapWarm),
      ao: num(opts.ao ?? opts.aoIntensity, 1),
      haze: num(opts.haze, 1),

      detail: detailKey,
      detailScale: num(opts.detailScale, preset ? preset.scale : 1),
      detailStrength: num(opts.detailStrength, preset ? preset.strength : 0.7),
      detailGrain: num(opts.detailGrain, preset ? preset.grain : 0.35),
      detailFade: num(opts.detailFade, TUNE.detailFade),

      outline: num(opts.outline, 1),
      emissive: hex(opts.emissive, 0x000000),
      emissiveIntensity: num(opts.emissiveIntensity, 0),

      transparent: !!opts.transparent,
      opacity: num(opts.opacity, 1),
      side: opts.side ?? THREE.FrontSide,
      vertexColors: !!opts.vertexColors,
      depthWrite: opts.depthWrite ?? !opts.transparent,
      depthTest: opts.depthTest ?? true,
      alphaTest: num(opts.alphaTest, 0),
      flatShading: !!opts.flatShading,
      normalScale: num(opts.normalScale, 1),
      name: typeof opts.name === 'string' ? opts.name : '',
    };

    if (this.engine.quality === 'low') o.detail = null;   // triplanar is 6 taps; not worth it

    o.key = [
      o.color, tid(o.map), tid(o.normalMap), tid(o.roughnessMap), tid(o.aoMap),
      tid(o.emissiveMap), tid(o.alphaMap),
      o.bands, r3(o.termSoft), r3(o.rim), o.rimColor, r3(o.rimPower),
      r3(o.spec), o.specColor, r3(o.gloss), r3(o.rough), r3(o.metal),
      r3(o.sss), o.wrapColor, r3(o.ao), r3(o.haze),
      o.detail, r3(o.detailScale), r3(o.detailStrength), r3(o.detailGrain), r3(o.detailFade),
      r3(o.outline), o.emissive, r3(o.emissiveIntensity),
      +o.transparent, r3(o.opacity), o.side, +o.vertexColors, +o.depthWrite, +o.depthTest,
      r3(o.alphaTest), +o.flatShading, r3(o.normalScale),
    ].join('|');

    return o;
  }

  _build(o) {
    const mat = new THREE.MeshStandardMaterial({
      name: o.name || `toon${o.detail ? '_' + o.detail : ''}`,
      color: new THREE.Color(o.color),
      map: o.map,
      normalMap: o.normalMap,
      roughnessMap: o.roughnessMap,
      aoMap: o.aoMap,
      emissiveMap: o.emissiveMap,
      alphaMap: o.alphaMap,
      emissive: new THREE.Color(o.emissive),
      emissiveIntensity: o.emissiveIntensity,
      // roughnessMap fully drives roughness when present, otherwise the art value does.
      roughness: o.roughnessMap ? 1.0 : o.rough,
      metalness: 0,                 // our metal read is stylised; three's PBR term is gone
      transparent: o.transparent,
      opacity: o.opacity,
      side: o.side,
      vertexColors: o.vertexColors,
      depthWrite: o.depthWrite,
      depthTest: o.depthTest,
      alphaTest: o.alphaTest,
      flatShading: o.flatShading,
      dithering: true,              // the haze gradient banded visibly without this
      fog: false,                   // aerial perspective is done in-shader, in linear space
    });
    if (o.normalMap) mat.normalScale.set(o.normalScale, o.normalScale);
    if (o.aoMap) mat.aoMapIntensity = 1;

    const detailTex = o.detail ? this._detailTexture(o.detail) : null;
    const useDetail = !!detailTex;
    const useDetail2 = useDetail && this._detail2;

    /* Per-material uniforms. Shared ones are merged in at compile time by identity. */
    const own = {
      uBands:          { value: o.bands },
      uTermSoft:       { value: o.termSoft },
      uRim:            { value: o.rim },
      uRimColor:       { value: new THREE.Color(o.rimColor) },
      uRimPower:       { value: o.rimPower },
      uSpec:           { value: o.spec },
      uSpecColor:      { value: new THREE.Color(o.specColor) },
      uGloss:          { value: o.gloss },
      uMetal:          { value: o.metal },
      uSss:            { value: o.sss },
      uSssColor:       { value: new THREE.Color(o.wrapColor) },
      uAoStrength:     { value: o.ao },
      uHazeAmount:     { value: o.haze },
      uDetailMap:      { value: detailTex },
      uDetailScale:    { value: o.detailScale },
      uDetailStrength: { value: o.detailStrength },
      uDetailGrain:    { value: o.detailGrain },
      uDetailFade:     { value: o.detailFade },
    };

    mat.defines = {};
    if (useDetail) mat.defines.SLY_DETAIL = '';
    if (useDetail2) mat.defines.SLY_DETAIL2 = '';

    mat.userData.sly = true;
    mat.userData.slyUniforms = own;
    mat.userData.outline = o.outline;
    mat.userData.detail = o.detail;

    const cacheKey = `sly:${useDetail ? 1 : 0}${useDetail2 ? 1 : 0}`;
    mat.customProgramCacheKey = () => cacheKey;

    const self = this;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, self.uniforms, own);
      shader.fragmentShader = self._patch(shader.fragmentShader);
    };

    return mat;
  }

  /**
   * Splice the cel model into meshphysical's fragment shader.
   *
   * The PBR accumulation block is removed outright rather than left running and discarded —
   * it is the single most expensive thing in that shader and we use none of its output.
   * Everything before it (albedo, alpha, normal maps, roughness, emissive) is kept.
   */
  _patch(src) {
    let s = src;
    const cuts = [
      '#include <lights_physical_fragment>',
      '#include <lights_fragment_begin>',
      '#include <lights_fragment_maps>',
      '#include <lights_fragment_end>',
      '#include <aomap_fragment>',       // AO is re-applied to ambient only, inside TOON_SHADE
    ];
    for (const c of cuts) s = s.split(c).join('');

    s = replaceOnce(s, 'void main() {', `${TOON_PARS}\nvoid main() {`, this, 'pars');
    s = replaceOnce(s, '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>\n${TOON_DETAIL}`, this, 'detail');
    s = replaceOnce(s, 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      TOON_SHADE, this, 'shade');
    return s;
  }

  /* ======================================================================
     Outlines
  ====================================================================== */

  /**
   * Attach an inverted-hull ink shell to `mesh`.
   *
   * @param {THREE.Mesh} mesh
   * @param {{thickness?:number, color?:number, shadeColor?:number, opacity?:number}} opts
   *        thickness is a multiplier on TUNE.inkPx (device pixels), not metres.
   * @returns {THREE.Mesh|null} the shell
   */
  outline(mesh, { thickness = 1.0, color = null, shadeColor = null, opacity = 1.0 } = {}) {
    try {
      if (!mesh || !mesh.isMesh || thickness <= 0) return null;
      if (mesh.userData.slyOutline) return null;            // never shell a shell
      const existing = mesh.userData.slyShell;
      if (existing) return existing;

      const px = Math.max(TUNE.inkPx * thickness, 0.35);
      const sun = color === null ? TUNE.inkSun : hex(color, TUNE.inkSun);
      const shade = shadeColor === null
        ? (color === null ? TUNE.inkShade : hex(color, TUNE.inkShade))
        : hex(shadeColor, TUNE.inkShade);

      const ck = `${px.toFixed(3)}|${sun}|${shade}|${opacity.toFixed(2)}`;
      let inkMat = this._inkCache.get(ck);
      if (!inkMat) {
        inkMat = createOutlineMaterial(this.uniforms, {
          thickness: px, inkSun: sun, inkShade: shade, opacity,
          falloff: TUNE.inkFalloff,
        });
        this._inkCache.set(ck, inkMat);
      }

      const shell = buildOutlineShell(mesh, inkMat);
      if (shell) {
        shell.visible = this._outlinesVisible;
        this._shells.push(shell);
      }
      return shell;
    } catch (err) {
      this._warn(`outline() failed on "${mesh?.name || '?'}": ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Walk a subtree and shell every mesh whose material asks for it (`userData.outline > 0`).
   * Convenience for CHARACTER / PROPS / ARCHITECTURE — they set `outline` once in toon() and
   * call this on the finished object.
   */
  applyOutlines(root, { thickness = 1.0, max = 4000 } = {}) {
    let n = 0;
    root?.traverse?.((obj) => {
      if (n >= max) return;
      if (!obj.isMesh || obj.userData.slyOutline || obj.userData.slyShell) return;
      const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      const want = m?.userData?.outline;
      if (!(want > 0)) return;
      if (this.outline(obj, { thickness: thickness * want })) n++;
    });
    return n;
  }

  /** Hide/show every shell — POSTFX needs them gone during its normal pass. */
  setOutlinesVisible(v) {
    this._outlinesVisible = !!v;
    for (const s of this._shells) s.visible = this._outlinesVisible;
  }

  /**
   * For POSTFX. Returns the override material to install on the scene; shells are hidden for
   * the duration so they cannot contaminate the normal buffer with a silhouette fringe.
   * Always pair with endNormalPass().
   */
  beginNormalPass() {
    this.setOutlinesVisible(false);
    return this.normalMaterial;
  }

  endNormalPass() {
    this.setOutlinesVisible(true);
  }

  /** Rebuild welded normals for a geometry whose positions changed after the shell was built. */
  reweld(geometry) { return weldNormals(geometry, true); }

  removeOutline(mesh) {
    const shell = mesh?.userData?.slyShell;
    if (!shell) return;
    const i = this._shells.indexOf(shell);
    if (i >= 0) this._shells.splice(i, 1);
    removeOutlineShell(mesh);
  }

  /* ======================================================================
     Light + atmosphere input
  ====================================================================== */

  /**
   * LIGHTING hands us the key light. Called every frame; must stay allocation-free.
   *
   * @param {object} p
   * @param {THREE.Vector3} p.direction  unit vector pointing TOWARD the light. If you pass the
   *        light's *travel* direction (y < 0) it is negated for you, so either convention works.
   * @param {THREE.Color|number} p.color
   * @param {number} p.intensity
   * @param {number|THREE.Color|{sky?,ground?,intensity?}} p.ambient
   * @param {number|THREE.Color|{color?,gain?}} p.rim
   * @param {THREE.Matrix4} [p.shadowMatrix] accepted and stored; unused, because the shell of
   *        three's own shadow varyings is what getShadowMask() reads.
   */
  setKeyLight({ direction, color, intensity, ambient, rim, shadowMatrix } = {}) {
    this._autoKey = false;
    const u = this.uniforms;

    if (direction) {
      _v3.set(direction.x ?? 0, direction.y ?? 1, direction.z ?? 0);
      if (_v3.lengthSq() > 1e-8) {
        _v3.normalize();
        if (_v3.y < 0) _v3.negate();      // caller gave us the travel direction
        u.uKeyDir.value.copy(_v3);
      }
    }
    if (color !== undefined && color !== null) setCol(u.uKeyColor.value, color);
    if (typeof intensity === 'number') u.uKeyIntensity.value = intensity;

    if (ambient !== undefined && ambient !== null) {
      if (typeof ambient === 'number') u.uAmbIntensity.value = ambient;
      else if (ambient.isColor) u.uSkyColor.value.copy(ambient);
      else {
        if (ambient.sky !== undefined) setCol(u.uSkyColor.value, ambient.sky);
        if (ambient.ground !== undefined) setCol(u.uBounceColor.value, ambient.ground);
        if (ambient.bounce !== undefined) setCol(u.uBounceColor.value, ambient.bounce);
        if (typeof ambient.intensity === 'number') u.uAmbIntensity.value = ambient.intensity;
      }
    }

    if (rim !== undefined && rim !== null) {
      if (typeof rim === 'number') u.uRimGain.value = TUNE.rimGain * rim;
      else if (rim.isColor) this._setRimColor(rim);
      else {
        if (rim.color !== undefined) this._setRimColor(rim.color);
        if (typeof rim.gain === 'number') u.uRimGain.value = TUNE.rimGain * rim.gain;
        if (typeof rim.intensity === 'number') u.uRimGain.value = TUNE.rimGain * rim.intensity;
      }
    }

    if (shadowMatrix) this.shadowMatrix = shadowMatrix;
    this._refreshShadowColor();
  }

  /**
   * SKY pushes the atmosphere here so surfaces, ink lines and the sky dome agree on the haze.
   * @param {{haze?, hazeSun?, density?, falloff?, base?, gain?, start?, shadowTint?, shadowFloor?}} p
   */
  setAtmosphere(p = {}) {
    const u = this.uniforms;
    if (p.haze !== undefined) setCol(u.uHaze.value, p.haze);
    if (p.color !== undefined) setCol(u.uHaze.value, p.color);
    if (p.hazeSun !== undefined) setCol(u.uHazeSun.value, p.hazeSun);
    if (typeof p.density === 'number') u.uHazeDensity.value = p.density;
    if (typeof p.falloff === 'number') u.uHazeFalloff.value = p.falloff;
    if (typeof p.base === 'number') u.uHazeBase.value = p.base;
    if (typeof p.gain === 'number') u.uHazeGain.value = p.gain;
    if (typeof p.start === 'number') u.uHazeStart.value = p.start;
    if (p.shadowTint !== undefined) {
      setCol(this._shadowTint, p.shadowTint);
      this._shadowTintLum = lum(this._shadowTint);
    }
    if (typeof p.shadowFloor === 'number') this._shadowFloor = p.shadowFloor;
    this._refreshShadowColor();
    this._fogSynced = true;    // SKY is authoritative from here on; stop reading scene.fog
  }

  /** Move the global ramp. Exposed so the critic loop can retune the look in one place. */
  setRampTuning({ lo, hi, soft } = {}) {
    if (typeof lo === 'number') this.uniforms.uTermLo.value = lo;
    if (typeof hi === 'number') this.uniforms.uTermHi.value = hi;
    if (typeof soft === 'number') {
      for (const m of this._cache.values()) {
        const u = m.userData?.slyUniforms;
        if (u?.uTermSoft) u.uTermSoft.value = soft;
      }
    }
  }

  /**
   * Rim colour is a per-material uniform (a gold trinket may want a different complement from
   * fur), so a global flip has to walk the cache. Guarded on the value: this is reachable from
   * the per-frame auto-light path and must not iterate every material every frame.
   */
  _setRimColor(c, isOverride = true) {
    if (this._rimApplied === c) return;
    this._rimApplied = c;
    for (const m of this._cache.values()) {
      const u = m.userData?.slyUniforms;
      if (u?.uRimColor) setCol(u.uRimColor.value, c);
    }
    if (isOverride) this._rimOverride = c;
  }

  /**
   * Shadow illumination = the shadow hue, renormalised to unit luminance, scaled to
   * `shadowFloor` x key luminance. Renormalising is what guarantees AGENTS' "never below ~14%
   * of key luminance" holds no matter how dark the chosen hue is.
   */
  _refreshShadowColor() {
    const u = this.uniforms;
    const keyLum = lum(u.uKeyColor.value) * u.uKeyIntensity.value;
    let k = (this._shadowFloor * keyLum) / Math.max(this._shadowTintLum, 1e-4);

    /* Cap how far the hue may be scaled.
     *
     * With a golden-hour key at intensity 3.3, the floor target alone asks for k ≈ 2.8. Scaling
     * #2a3f66 that far drives its blue channel to clip while red lags, so the "dark violet-teal"
     * the palette specifies arrives at the shader as a bright periwinkle (#74a4ff was what was
     * actually reaching it). Multiplied into warm sandstone and then added again as the wash,
     * that is what turned every stone surface lavender.
     *
     * The floor is a readability rule — keep detail visible in shadow — not a licence to make
     * the shadow light brighter than the material it falls on. Capping the peak channel keeps
     * the hue intact and keeps shadow reading as shadow. */
    const peak = Math.max(this._shadowTint.r, this._shadowTint.g, this._shadowTint.b);
    const maxK = PAL.shadowTintPeak / Math.max(peak, 1e-4);
    k = Math.min(k, maxK);

    /* Mix warm sand bounce into the shadow light.
     *
     * A desert shadow is not lit by blue sky alone — it is lit by sky *and* by sunlight
     * bouncing off the sand all around it. LIGHTING models that with a separate bounce
     * light, but the shader's shadow term was purely the cool tint, so warm sandstone
     * albedo multiplied by a blue light neutralised to mauve. Every surface facing away
     * from the sun came out purple while the sunlit ones read correctly warm.
     *
     * Blending toward the bounce colour keeps the palette's violet-teal direction in the
     * shadow while letting the albedo's warmth survive the multiply. */
    _col.copy(this._shadowTint).lerp(u.uBounceColor.value, PAL.shadowBounceMix);
    u.uShadowColor.value.copy(_col).multiplyScalar(k);
  }

  /* ======================================================================
     Frame
  ====================================================================== */

  update(dt, t) {
    const e = this.engine;
    this.uniforms.uTime.value = t;
    this._syncResolution();

    if (this._autoKey) {
      // Rescan occasionally: LIGHTING may not exist, and main.js's fallback sun appears late.
      if ((this._autoScan = (this._autoScan + 1) % 24) === 1) this._findSceneLight();
      const tod = e.debug?.timeOfDay ?? 0.78;
      if (tod !== this._lastTod) this._applyAutoLight();
      else this._trackSceneLight();
    }

    // SKY may express the haze as scene.fog before it learns about setAtmosphere().
    if (!this._fogSynced) {
      const fog = e.scene?.fog;
      if (fog?.color) {
        this.uniforms.uHaze.value.copy(fog.color);
        if (typeof fog.density === 'number') {
          this.uniforms.uHazeDensity.value = Math.max(fog.density * 2.6, 0.004);
        }
      }
    }

    if (e.debug && e.debug.wireframe !== this._wireframe) {
      this._wireframe = e.debug.wireframe;
      for (const m of this._cache.values()) m.wireframe = this._wireframe;
      this.setOutlinesVisible(!this._wireframe);
    }
  }

  _syncResolution() {
    const r = this.engine.renderer;
    if (!r) return;
    r.getDrawingBufferSize(_v2);
    const u = this.uniforms.uRes.value;
    if (u.x !== _v2.x || u.y !== _v2.y) u.copy(_v2);
  }

  /** Find the brightest shadow-casting directional light — ground truth for the ramp. */
  _findSceneLight() {
    this._bestLight = null;
    this._bestScore = -1;
    this.engine.scene?.traverse(this._scanLight);
    this._autoLight = this._bestLight;
  }

  _scanLight = (o) => {
    if (!o.isDirectionalLight || !o.visible) return;
    const score = o.intensity * (o.castShadow ? 4 : 1);
    if (score > this._bestScore) { this._bestScore = score; this._bestLight = o; }
  };

  /**
   * Copy the scene's own sun into the key uniforms. The ramp MUST agree with whatever light
   * rendered the shadow map, or lit surfaces and cast shadows disagree about where the sun is.
   */
  _trackSceneLight() {
    const L = this._autoLight;
    if (!L) return;
    const u = this.uniforms;
    _v3.setFromMatrixPosition(L.matrixWorld);
    if (L.target) { _v3b.setFromMatrixPosition(L.target.matrixWorld); _v3.sub(_v3b); }
    if (_v3.lengthSq() > 1e-8) u.uKeyDir.value.copy(_v3).normalize();
    u.uKeyColor.value.copy(L.color);
    const i = Math.max(L.intensity, 0.05);
    if (i !== u.uKeyIntensity.value) { u.uKeyIntensity.value = i; this._refreshShadowColor(); }
  }

  /**
   * Fallback lighting so the frame is art-directed even before LIGHTING lands. Direction and
   * colour come from the real scene light when there is one — they must, or the ramp would
   * disagree with the shadow map — and everything else is derived from timeOfDay.
   */
  _applyAutoLight() {
    const u = this.uniforms;
    const tod = this.engine.debug?.timeOfDay ?? 0.78;
    this._lastTod = tod;
    const day = tod > DAY_START && tod < DAY_END;
    const t = clamp((tod - DAY_START) / (DAY_END - DAY_START), 0, 1);
    const az = Math.PI * t;
    const elev = Math.sin(az);

    const L = this._autoLight;
    if (L) {
      this._trackSceneLight();
    } else {
      u.uKeyDir.value.set(Math.cos(az), Math.max(elev * 0.95, 0.06), -0.34).normalize();
      if (!day) u.uKeyDir.value.set(0.42, 0.62, 0.66).normalize();
      const warm = 1 - clamp(elev * 1.5, 0, 1);
      _col.copy(_colOf(PAL.sunHigh)).lerp(_colOf(PAL.sun), clamp(warm * 1.4, 0, 1));
      if (warm > 0.62) _col.lerp(_colOf(PAL.sunLow), (warm - 0.62) / 0.38 * 0.75);
      u.uKeyColor.value.copy(day ? _col : _colOf(PAL.moon));
      u.uKeyIntensity.value = day ? 1.5 + 1.35 * clamp(elev * 2.2, 0, 1) : 0.55;
    }

    // Fill, rim and haze follow the clock regardless of who owns the sun.
    const night = day ? 0 : 1;
    u.uSkyColor.value.copy(_colOf(PAL.fillSky)).lerp(_colOf(PAL.fillSkyNight), night);
    u.uBounceColor.value.copy(_colOf(PAL.bounce)).lerp(_colOf(PAL.bounceNight), night);
    u.uAmbIntensity.value = day ? TUNE.ambIntensity : TUNE.ambIntensity * 0.55;
    u.uRimGain.value = TUNE.rimGain * (day ? 1 : 1.45);
    if (!this._rimOverride) this._setRimColor(day ? PAL.rim : PAL.rimNight, false);
    if (!this._fogSynced) {
      u.uHaze.value.copy(_colOf(PAL.haze)).lerp(_colOf(PAL.hazeNight), night);
      u.uHazeGain.value = TUNE.hazeGain * (day ? 1 : 0.7);
    }
    this._refreshShadowColor();
  }

  /* ======================================================================
     Procedural detail textures
  ====================================================================== */

  /**
   * The triplanar detail layer. Generated here rather than taken from TEXTURES because it is
   * part of the lighting model, not part of a surface's art: it is what stops a 40 m pylon
   * wall from reading as a flat plane, and it must exist even if a caller passes no maps.
   * RGB = tangent-space normal, A = albedo grain.
   */
  _detailTexture(key) {
    const size = this._detailSize || 256;
    const ck = `${key}@${size}`;
    const hit = this._detail.get(ck);
    if (hit) return hit;

    const p = DETAIL_PRESETS[key] || DETAIL_PRESETS.generic;
    const tex = buildDetailTexture(p, size);
    tex.anisotropy = this.engine.maxAniso || 4;
    this._detail.set(ck, tex);
    return tex;
  }

  /* ======================================================================
     Teardown
  ====================================================================== */

  dispose() {
    this.engine.off?.('timeOfDay', this._onTimeOfDay);
    for (const m of this._cache.values()) m.dispose();
    for (const m of this._inkCache.values()) m.dispose();
    for (const t of this._detail.values()) t.dispose();
    this._cache.clear();
    this._inkCache.clear();
    this._detail.clear();
    this._shells.length = 0;
    this.normalMaterial.dispose();
  }

  _warn(msg) {
    this.engine?.warn?.(`shading: ${msg}`);
  }
}

/* ===========================================================================
   Helpers
=========================================================================== */

const _colCache = new Map();
function _colOf(h) {
  let c = _colCache.get(h);
  if (!c) { c = new THREE.Color(h); _colCache.set(h, c); }
  return c;
}

function lum(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
function num(v, d) { return typeof v === 'number' && Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function r3(v) { return Math.round(v * 1000) / 1000; }
function tid(t) { return t ? t.uuid : '-'; }

function hex(v, d) {
  if (v === undefined || v === null) return d;
  if (typeof v === 'number') return v;
  if (v.isColor) return v.getHex();
  if (typeof v === 'string') { try { return new THREE.Color(v).getHex(); } catch { return d; } }
  return d;
}

function setCol(target, v) {
  if (v === undefined || v === null) return;
  if (v.isColor) target.copy(v);
  else if (typeof v === 'number') target.setHex(v);
  else if (typeof v === 'string') { try { target.set(v); } catch { /* keep */ } }
}

function replaceOnce(src, needle, replacement, mod, label) {
  if (src.indexOf(needle) === -1) {
    if (!mod._patchWarned) {
      mod._patchWarned = true;
      mod._warn(`shader splice "${label}" missed — three.js chunk layout changed?`);
    }
    return src;
  }
  return src.replace(needle, replacement);
}

/* ---------------------------------------------------------------------------
   Detail presets. `scale` is texture repeats per world metre.
--------------------------------------------------------------------------- */
const DETAIL_PRESETS = {
  sandstone: { kind: 'chisel', freq: 6,  oct: 4, relief: 1.15, streak: 0.55, streakY: 34, facet: 0.40, scale: 0.62, strength: 0.85, grain: 0.42, seed: 11 },
  limestone: { kind: 'pit',    freq: 9,  oct: 5, relief: 0.85, streak: 0.18, streakY: 20, facet: 0.22, scale: 0.80, strength: 0.62, grain: 0.30, seed: 23 },
  plaster:   { kind: 'tooth',  freq: 14, oct: 4, relief: 0.55, streak: 0.10, streakY: 12, facet: 0.05, scale: 1.25, strength: 0.45, grain: 0.22, seed: 37 },
  sand:      { kind: 'ripple', freq: 5,  oct: 4, relief: 0.70, streak: 0.85, streakY: 9,  facet: 0.00, scale: 0.35, strength: 0.55, grain: 0.20, seed: 41 },
  gold:      { kind: 'hammer', freq: 7,  oct: 3, relief: 0.45, streak: 0.12, streakY: 16, facet: 0.30, scale: 2.30, strength: 0.40, grain: 0.16, seed: 53 },
  metal:     { kind: 'brush',  freq: 3,  oct: 3, relief: 0.30, streak: 0.95, streakY: 64, facet: 0.00, scale: 1.60, strength: 0.35, grain: 0.14, seed: 67 },
  cloth:     { kind: 'weave',  freq: 10, oct: 3, relief: 0.70, streak: 0.30, streakY: 24, facet: 0.00, scale: 5.50, strength: 0.60, grain: 0.28, seed: 71 },
  fur:       { kind: 'strand', freq: 4,  oct: 4, relief: 0.90, streak: 1.00, streakY: 52, facet: 0.00, scale: 7.00, strength: 0.70, grain: 0.30, seed: 83 },
  generic:   { kind: 'tooth',  freq: 8,  oct: 4, relief: 0.70, streak: 0.25, streakY: 18, facet: 0.15, scale: 1.00, strength: 0.55, grain: 0.28, seed: 97 },
};

/* Local deterministic noise. Not imported from core/Rand.js on purpose: that module currently
   fails to parse (`WORLD_SEED = 0x5c1y`), and shading must not be able to break the boot. */
function ihash(x, y, s) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(s, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const sstep = (t) => t * t * (3 - 2 * t);

/** Tileable value noise with independent x/y periods. */
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = ihash(x0, y0, seed), b = ihash(x1, y0, seed);
  const c = ihash(x0, y1, seed), d = ihash(x1, y1, seed);
  const u = sstep(xf), v = sstep(yf);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function fbm(u, v, fx, fy, oct, seed) {
  let sum = 0, norm = 0, amp = 1, ax = fx, ay = fy;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(u * ax, v * ay, ax, ay, seed + i * 17);
    norm += amp; amp *= 0.5; ax *= 2; ay *= 2;
  }
  return sum / norm;
}

/**
 * Build the detail map. Every kind is a height field plus a grain field; the normal comes from
 * central differences on the height, so relief and albedo grain always agree about where the
 * crevices are (which is what makes the AO/shadow read believable at close range).
 */
function buildDetailTexture(p, size) {
  const n = size * size;
  const h = new Float32Array(n);
  const g = new Float32Array(n);
  const inv = 1 / size;
  const s = p.seed;

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const i = y * size + x;

      let base = fbm(u, v, p.freq, p.freq, p.oct, s);
      let hv;

      switch (p.kind) {
        case 'chisel': {
          // Ridged noise reads as tool marks; a hard-quantised term adds chisel facets.
          const r = 1 - Math.abs(base * 2 - 1);
          const streak = fbm(u, v, Math.max(2, p.freq >> 1), p.streakY, 3, s + 5);
          hv = 0.58 * r + p.streak * streak * 0.5;
          const q = Math.floor(hv * 6) / 6;
          hv = hv * (1 - p.facet) + q * p.facet;
          break;
        }
        case 'pit': {
          const pits = fbm(u, v, p.freq * 2, p.freq * 2, 2, s + 9);
          hv = base * 0.8 - Math.pow(Math.max(0, pits - 0.62) * 2.6, 2) * 0.55;
          hv += p.streak * fbm(u, v, 3, p.streakY, 2, s + 3) * 0.3;
          break;
        }
        case 'tooth':
          hv = base * 0.85 + p.streak * fbm(u, v, 4, p.streakY, 2, s + 7) * 0.4;
          break;
        case 'ripple': {
          const warp = fbm(u, v, 3, 3, 3, s + 2) * 0.6;
          hv = 0.5 + 0.5 * Math.sin((v * p.streakY + warp) * Math.PI * 2);
          hv = hv * 0.62 + base * 0.38;
          break;
        }
        case 'hammer': {
          const d = fbm(u, v, p.freq, p.freq, 2, s + 4);
          hv = 0.5 + 0.5 * Math.cos(d * Math.PI * 3.0);
          hv = hv * 0.7 + base * 0.3;
          const q = Math.floor(hv * 5) / 5;
          hv = hv * (1 - p.facet) + q * p.facet;
          break;
        }
        case 'brush':
          hv = fbm(u, v, 2, p.streakY, 3, s) * 0.9 + base * 0.1;
          break;
        case 'weave': {
          const wu = 0.5 + 0.5 * Math.sin(u * p.streakY * Math.PI * 2);
          const wv = 0.5 + 0.5 * Math.sin(v * p.streakY * Math.PI * 2);
          hv = Math.max(wu, wv) * 0.7 + base * 0.3;
          break;
        }
        case 'strand': {
          const drift = fbm(u, v, 3, 3, 3, s + 6) - 0.5;
          hv = fbm(u + drift * 0.25, v, 2, p.streakY, 3, s) * 0.85 + base * 0.15;
          break;
        }
        default:
          hv = base;
      }

      h[i] = hv;
      // Grain darkens where the height is low: grime settles in crevices.
      const mottle = fbm(u, v, 3, 3, 3, s + 13);
      g[i] = clamp(0.30 + 0.72 * hv * (0.75 + 0.5 * mottle), 0, 1);
    }
  }

  const data = new Uint8Array(n * 4);
  const amp = p.relief * size * 0.011;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) + size) % size, yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = ((x - 1) + size) % size, xp = (x + 1) % size;
      const dx = (h[y * size + xp] - h[y * size + xm]) * amp;
      const dy = (h[yp * size + x] - h[ym * size + x]) * amp;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + 1) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = Math.round(g[y * size + x] * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;   // this is data, not art — no sRGB decode
  tex.needsUpdate = true;
  tex.name = `slyDetail_${p.kind}`;
  return tex;
}
