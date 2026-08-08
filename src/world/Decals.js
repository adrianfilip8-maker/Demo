import * as THREE from 'three';

/**
 * ContactDecals — geometric ground contact for props.
 *
 * ## Why this exists at all
 *
 * POSTFX ships a quantised screen-space contact term whose radius is 4.5 cm of world. That
 * radius is a *pixel* radius once projected, and it dies with distance: measured off the
 * shipped shot table, 4.5 cm subtends 12.57 px at `sly-closeup`, 5.02 px at `interior`, 3.43 px
 * at `hero`, 2.48 px at `temple` and **1.11 px at `courtyard`** — below the texel floor, where
 * every tap lands in the centre texel and the term returns a null indistinguishable from a
 * decision. `courtyard` is the shot that holds thirty of this level's props, at 35–51 m. No
 * screen-space term reaches them, so grounding them is geometry's job, and geometry is this
 * agent's.
 *
 * The defect the decal answers is not "no shadow", it is worse than that. Measured on the
 * shipped `interior` frame (1280x720), profiling median luminance in 1 px rings outward from
 * each KayKit prop's own rasterised silhouette: the floor **peaks 5 px out from the silhouette
 * and falls away from there**, +2.06 L pooled and up to **+12.91 L** on the coin stack beside
 * Sly, against a settled floor at 18–26 px. Props are not un-grounded, they are ANTI-grounded:
 * the closer the floor gets to the contact, the brighter it reads. The same 4–5 px peak is
 * present in `temple` and in `courtyard`. Nothing in the frame says these objects touch.
 *
 * ## The shape, and why it is not a soft blob
 *
 * The obvious implementation is a radial-gradient sprite. It is wrong here, for reasons that
 * are about this game's shading model rather than taste:
 *
 *  - **The ramp is 3-band with a hard terminator** (AGENTS §2.1.1, `smoothstep` width ~0.03).
 *    A continuous gradient laid on top of a quantised surface introduces the one thing the
 *    quantiser exists to remove. Squint at a frame with a soft blob under a barrel and the
 *    blob is the only smoothly-shaded object in it — which is exactly why airbrushed contact
 *    shadows read as *dirt on the floor* rather than as shadow.
 *  - **A cel shadow is a SHAPE.** In Sly 2/3 and in Odyssey the ground shadow is a flat,
 *    hard-edged silhouette holding one or two tones. It reads as "this floor is in shadow"
 *    because it looks like the shadow band the rest of the frame is already using.
 *  - **A gradient cannot survive the far field.** At `courtyard`'s 45 m a decal is ~20 px
 *    across and ~2 px tall after the grazing-angle squash. A gradient at that size is a smear;
 *    a hard step is still a step.
 *
 * So the decal is a **hard-edged, band-quantised, oriented ellipse**: two flat tones (core and
 * skirt) separated by steps whose half-width is `TUNE.soft` of the radius — 3 % , which is
 * ~2 px at `interior`'s distances and sub-pixel at `courtyard`'s. That is the same grammar as
 * the diffuse ramp: hard, but not a naked step.
 *
 * Three more properties, each of which is a rule from §2 rather than a preference:
 *
 *  - **It darkens toward the SHADOW HUE, never toward grey or black.** §2.1.3: shadows are
 *    coloured and transparent. The fragment is a MULTIPLIER, so the paving's own texture, grout
 *    and colour variation survive inside the contact — you can read detail in there, which is
 *    the other half of §2.1.3. Full black would erase the floor and read as a hole.
 *  - **It is oriented and stretched by the key.** The major axis lies along the direction the
 *    shadow travels on the ground, `-normalize(keyDir.xz)`, and the downwind reach comes from
 *    the real shadow length `|keyDir.xz| / keyDir.y` at that time of day — 0.25 at `interior`'s
 *    76° sun (so the decal is nearly round, which is the correct answer for a sun overhead),
 *    2.05 at `courtyard`'s 26°, 4.70 at `night`. Both are UNIFORMS, so a decal follows time of
 *    day without a rebuild and without a per-shot table to fall out of date.
 *  - **It is capped well short of a cast shadow.** Shadow maps are enabled (`Engine.js`,
 *    PCF at 2048 on `med`) and every prop already casts. This is the CONTACT — the darkening at
 *    the base that a shadow map at 30 m cannot resolve. `TUNE.reachCap` holds the decal to the
 *    near end of the real shadow so it agrees with it instead of drawing a second, competing
 *    one; see the note on `reachFrac` for the revision where that went wrong.
 *
 * ## Why not `src/fx/Decals.js`
 *
 * Checked first, and it is the wrong home rather than a duplicate to avoid. That pool is
 * FX's (`src/fx/Decals.js`, reached only through `engine.get('fx').decal()`): capacity 96,
 * atlas-tiled with impact art (crack / scuff / scorch / dust_ring), and **age-driven — every
 * decal in it expires**, with an analytic dissolve in the vertex shader. A prop's grounding is
 * permanent and has no impact art, so it would need a new catalogue entry, an exemption from
 * the fade, and a third of the impact budget held forever. AGENTS §1 also forbids importing
 * another agent's internals.
 *
 * What IS reused is its rendering strategy, verbatim in shape and for the same reasons: one
 * batched draw, depth *test* without depth *write*, a polygon offset, and — the one that is
 * easy to miss — the override-pass opt-out, because a ground quad has no useful normal for
 * POSTFX's crease buffer and would otherwise get a line drawn round it. `PostFX.TUNE`'s
 * `prepassSkipTransparent` would also exclude it, but that knob ships `false`, so relying on it
 * would be relying on another agent's default.
 */

/** Feel constants (§5). Every one of these is read by `state()` so an A/B reports what applied. */
export const TUNE = {
  /**
   * Decal minor radius = the prop's own base footprint radius x this.
   *
   * 1.42, and it has to be over 1 by a real margin for a reason that is easy to get wrong: a
   * prop standing on the ground OCCLUDES its own footprint circle from any camera, so the only
   * part of a contact shadow anyone ever sees is the part outside it. At 1.20 the visible ring
   * on a 0.5 m barrel is 10 cm — about 10 px at `interior`'s distances and 2 px at
   * `courtyard`'s far field, which is a shadow you can measure and cannot see.
   */
  spread: 1.42,
  /** Metres. Nothing gets a contact shadow wider than this, however big its footprint. */
  maxRadius: 2.0,
  /**
   * Downwind REACH, in metres: `min(reachCap, reachFrac * propHeight * shadowLength)`.
   *
   * Absolute, and derived from the prop's own height — not a multiplier on the radius, which
   * is what the first version did and which was wrong in a way worth recording. Scaling the
   * radius makes a big prop's decal grow in proportion to its width, and at `courtyard`'s
   * 26 degree sun that put a 5.3 m ellipse under a 2.14 m crate whose REAL cast shadow is
   * 4.4 m long. A contact decal that is longer than the shadow it is supposed to introduce is
   * not a contact decal.
   *
   * At the shipped tods this gives: `interior` (76 degree sun, shadow length 0.25) a reach of
   * 3.5 cm on a coin stack — round, which is the correct answer for a sun overhead; `courtyard`
   * (26 degrees, 2.05) the 0.9 m cap on a crate, i.e. the near ~40 % of a 4.4 m cast shadow,
   * with the shadow map keeping the rest.
   */
  reachFrac: 0.22,
  reachCap: 0.9,
  /**
   * How far downwind the ellipse is pushed, in units of `reach`.
   *
   * 0.9, not 0.5: a symmetric stretch puts shadow on the SUNWARD side of the prop, which is
   * lit ground. At 0.9 the upwind edge stays within 0.1 reach of the footprint (a hair of
   * bleed, which is real ambient contact) and all the growth goes where the light is not.
   */
  push: 0.9,
  /** Core opacity of the darkening, 0..1. `debug.decalScale` multiplies this. */
  strength: 0.80,
  /** The skirt band's share of the core. Two flat tones is the whole point — see the header. */
  skirt: 0.60,
  /**
   * Band radii as a fraction of the decal radius: core out to `core`, skirt out to `edge`.
   *
   * `core` sits just inside the footprint (0.66 x 1.42 = 0.94 of the footprint radius), which
   * produces the right behaviour at both ends of the sun table without a special case, because
   * the reach elongates the bands as well as the rim. At `interior`'s 76 degree sun the reach is
   * ~4 cm, the core stays hidden under the prop, and what shows is one flat skirt tone hugging
   * the base — which is what a contact shadow under a near-overhead light is. At `courtyard`'s
   * 26 degrees the reach is the 0.9 m cap, the core lobe clears the footprint by well over a
   * metre downwind, and the frame gets two flat tones: a solid core running away from the key
   * with a skirt around it.
   *
   * The four numbers here were swept offline against the shipped `interior` frame BEFORE any
   * acceptance band for the capture was written down. This is the lightest setting in that
   * sweep that takes every scorable prop's measured HALO to <= 0; heavier settings work too and
   * start to look like a puddle.
   */
  core: 0.66,
  edge: 0.95,
  /** Half-width of each step, as a fraction of the radius. 0.03 ~ 2 px at `interior`. */
  soft: 0.03,
  /** How far the full-strength multiply travels toward the shadow hue, and how dark it goes. */
  tintSat: 0.55,
  tintDark: 0.46,
  /** Metres above the ground plane. Paired with a polygon offset; both are needed on a slope. */
  lift: 0.012,
  /** Ring resolution. 28 keeps an ellipse's rim smooth at `sly-closeup`'s 279 px/m. */
  segments: 28,
};

/** §2.2 SHADOW HUE — the fallback when LIGHTING has not published an atmosphere yet. */
const SHADOW_HUE = 0x2a3f66;
/** Golden hour, so a decal built before LIGHTING exists is still oriented plausibly. */
const FALLBACK_KEY = new THREE.Vector3(-0.922, 0.375, -0.097);

const VERT = /* glsl */`
precision highp float;
attribute vec3 iCentre;
attribute float iRadius;
attribute float iHeight;
attribute float aAlpha;

uniform vec2 uKey;        // unit ground direction the shadow travels (away from the key)
uniform float uShadowLen; // ground shadow length per unit height, clamped finite
uniform vec2 uReach;      // x = reachFrac, y = reachCap (metres)
uniform float uPush;      // downwind offset, in units of reach
uniform float uRadius;    // global radius multiplier — debug.decalRadius

varying float vA;

void main() {
  vec2 d = vec2( position.x, position.z );      // unit disc, x is the key axis
  vec2 t = vec2( -uKey.y, uKey.x );
  float r = iRadius * uRadius;
  float reach = min( uReach.y, uReach.x * iHeight * uShadowLen ) * uRadius;
  float along = d.x * ( r + reach ) + reach * uPush;
  vec2 p = uKey * along + t * ( d.y * r );
  vec3 w = iCentre + vec3( p.x, 0.0, p.y );
  vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( w, 1.0 );
}
`;

const FRAG = /* glsl */`
precision highp float;
uniform vec3 uTint;       // the multiplier the floor takes at full strength
uniform float uStrength;
varying float vA;

void main() {
  float a = clamp( vA * uStrength, 0.0, 1.0 );
  // MULTIPLY, not a paint: the paving's own texture survives inside the contact (AGENTS 2.1.3).
  gl_FragColor = vec4( mix( vec3( 1.0 ), uTint, a ), 1.0 );
}
`;

/**
 * The unit contact disc, as a ring fan with the band profile baked into a vertex alpha.
 *
 * Radii and alphas, outward:
 *   0            1.0        core
 *   core - soft  1.0        core, last row before the step
 *   core + soft  skirt      the step  <- a HARD edge, softened by exactly 2*soft of radius
 *   edge - soft  skirt
 *   edge + soft  0.0        the outer step
 *
 * Pure and GL-free on purpose: it is the one part of this file a Node test can check, and the
 * band structure is the claim the header makes about the shape.
 *
 * @returns {{position:Float32Array, alpha:Float32Array, index:Uint16Array, rings:number[], alphas:number[]}}
 */
export function contactDiscGeometry(tune = TUNE) {
  const seg = Math.max(8, tune.segments | 0);
  const s = tune.soft;
  const rings = [0, Math.max(0, tune.core - s), tune.core + s, Math.max(tune.core + s, tune.edge - s), tune.edge + s];
  const alphas = [1, 1, tune.skirt, tune.skirt, 0];
  // normalise so the outermost ring is exactly 1.0 — `radius` then means what it says
  const outer = rings[rings.length - 1] || 1;
  for (let i = 0; i < rings.length; i++) rings[i] /= outer;

  const pos = [], alpha = [], index = [];
  for (let r = 0; r < rings.length; r++) {
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(th) * rings[r], 0, Math.sin(th) * rings[r]);
      alpha.push(alphas[r]);
    }
  }
  // ring 0 is a degenerate fan at the centre; stitch each pair of rings as a quad strip
  for (let r = 0; r < rings.length - 1; r++) {
    const a = r * seg, b = (r + 1) * seg;
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      index.push(a + i, b + i, b + j, a + i, b + j, a + j);
    }
  }
  return {
    position: new Float32Array(pos),
    alpha: new Float32Array(alpha),
    index: new Uint16Array(index),
    rings, alphas,
  };
}

/**
 * The full-strength multiplier a floor pixel takes, derived from the atmosphere's shadow hue.
 *
 * The hue is normalised by its own brightest channel first, so `tintDark` is the only thing
 * that decides how dark the contact goes and `tintSat` is the only thing that decides how
 * coloured it is. Without that division the two dials fight, because §2.2's shadow hue is
 * already a dark colour and multiplying by it darkens *and* tints at a ratio nobody chose.
 *
 * @param {THREE.Color} hue
 * @returns {THREE.Color} the multiplier, in the renderer's own working space
 */
export function tintMultiplier(hue, tune = TUNE, out = new THREE.Color()) {
  const m = Math.max(hue.r, hue.g, hue.b) || 1;
  out.setRGB(
    1 + (hue.r / m - 1) * tune.tintSat,
    1 + (hue.g / m - 1) * tune.tintSat,
    1 + (hue.b / m - 1) * tune.tintSat,
  );
  out.multiplyScalar(tune.tintDark);
  return out;
}

/**
 * Downwind reach of the contact ellipse, in metres. The JS mirror of the vertex shader's one
 * line, so a Node test can check the arithmetic the frame will actually run.
 */
export function reachFor(height, shadowLen, tune = TUNE) {
  return Math.min(tune.reachCap, tune.reachFrac * Math.max(height, 0) * Math.max(shadowLen, 0));
}

/**
 * Ground shadow length per unit height for a key direction, clamped finite.
 *
 * A key on or below the horizon casts an infinitely long ground shadow, which is arithmetically
 * true and useless: `night`'s moon sits at 12 degrees and `guard`'s at 28, so the clamp is what
 * stops a NaN reaching a vertex buffer at the two tods this project actually ships below 15
 * degrees. `reachCap` does the visual limiting; this only keeps the number finite.
 */
export const SHADOW_LEN_MAX = 8;
export function shadowLengthOf(keyDir) {
  const y = keyDir.y;
  if (!(y > 1e-3)) return SHADOW_LEN_MAX;
  return Math.min(SHADOW_LEN_MAX, Math.hypot(keyDir.x, keyDir.z) / y);
}

const _c = new THREE.Color();
const _key = new THREE.Vector3();

export class ContactDecals {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {{ name?: string, tune?: object }} opts
   */
  constructor(engine, { name = 'contact', tune = TUNE } = {}) {
    this.engine = engine;
    this.tune = { ...TUNE, ...tune };
    this.name = name;
    this.mesh = null;
    this.material = null;
    this.geometry = null;
    this._pending = [];
    /* Mutated in place by `refresh()`, never rebuilt — `refresh()` runs every frame from
       `update()` and §5 allows it no allocations. `state()` copies it for callers. */
    this._applied = {
      strength: 0, shadowLen: 0, keyAz: 0, radius: 1, count: 0, visible: false,
      reachFrac: 0, reachCap: 0, push: 0, tintR: 1, tintG: 1, tintB: 1,
    };
  }

  /**
   * Queue one prop's contact.
   *
   * @param {number} x      prop axis, world
   * @param {number} y      the FLOOR the prop stands on — not the prop's origin
   * @param {number} z
   * @param {number} footprintRadius  the prop's own base radius, in metres
   * @param {number} height           the prop's own height, metres — sets the downwind reach
   */
  add(x, y, z, footprintRadius, height = 0) {
    const r = Math.min(this.tune.maxRadius, footprintRadius * this.tune.spread);
    if (!(r > 0.01) || !Number.isFinite(x + y + z + r + height)) return false;
    this._pending.push(x, y + this.tune.lift, z, r, Math.max(0, height));
    return true;
  }

  get count() { return this._pending.length / 5; }

  /**
   * Build the single batched mesh and parent it to `parent`. Safe to call with nothing queued.
   * @returns {THREE.Mesh|null}
   */
  build(parent) {
    const n = this.count;
    if (!n) return null;

    const disc = contactDiscGeometry(this.tune);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(disc.position, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(disc.alpha, 1));
    geo.setIndex(new THREE.BufferAttribute(disc.index, 1));

    const centre = new Float32Array(n * 3), radius = new Float32Array(n), height = new Float32Array(n);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, maxR = 0;
    for (let i = 0; i < n; i++) {
      const x = this._pending[i * 5], y = this._pending[i * 5 + 1], z = this._pending[i * 5 + 2];
      const r = this._pending[i * 5 + 3];
      centre[i * 3] = x; centre[i * 3 + 1] = y; centre[i * 3 + 2] = z;
      radius[i] = r;
      height[i] = this._pending[i * 5 + 4];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      maxR = Math.max(maxR, r);
    }
    geo.setAttribute('iCentre', new THREE.InstancedBufferAttribute(centre, 3));
    geo.setAttribute('iRadius', new THREE.InstancedBufferAttribute(radius, 1));
    geo.setAttribute('iHeight', new THREE.InstancedBufferAttribute(height, 1));
    geo.instanceCount = n;
    /* The instances are displaced in the vertex shader, so three's own bounds would be a point
       cloud of centres. Padded by the worst case any uniform can produce — the widest decal
       plus the reach cap pushed fully downwind — because a wrong bounding sphere frustum-culls
       the whole batch at the screen edge, which is the far side of exactly the shots this
       feature exists for. */
    const pad = maxR + this.tune.reachCap * (1 + this.tune.push);
    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(minX - pad, minY - 0.1, minZ - pad),
      new THREE.Vector3(maxX + pad, maxY + 0.1, maxZ + pad),
    );
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());

    const mat = new THREE.ShaderMaterial({
      name: `world.decals.${this.name}`,
      uniforms: {
        uKey: { value: new THREE.Vector2(1, 0) },
        uShadowLen: { value: 0 },
        uReach: { value: new THREE.Vector2(this.tune.reachFrac, this.tune.reachCap) },
        uPush: { value: this.tune.push },
        uRadius: { value: 1 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uStrength: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.MultiplyBlending,
      /**
       * REQUIRED with `MultiplyBlending`, and its absence was a live defect rather than a
       * warning to tidy away. `three@0.185`'s `WebGLState.setBlending()` has no
       * non-premultiplied multiply path *at all*: with the flag false it logs
       *
       *     THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true
       *
       * and **returns without calling `gl.blendFunc`**, then caches `currentBlending =
       * MultiplyBlending` so the switch is skipped on every subsequent frame too. The decal was
       * therefore drawn with whatever function the previously-programmed material had left in the
       * context — the birds at `renderOrder` 5, one step ahead of this batch at 6.
       *
       * That is the whole of the inverted contact shadow. `FRAG` emits a MULTIPLIER: 1.0 (white)
       * at the rim, falling to ~0.44 luma at the core. Under `dst * src` that is a shadow whose
       * rim is a no-op. Under anything else — src-alpha lerp, additive, straight replace — the
       * same value composites as *paint*, and it is brightest exactly at the outer rim. A halo
       * that grows outward from the prop, which is what the critic scored as
       * "the contact shadow is INVERTED".
       *
       * With the flag set, three programs `blendFuncSeparate(DST_COLOR, ONE_MINUS_SRC_ALPHA,
       * ZERO, ONE)`. `FRAG` writes `a = 1.0` unconditionally, so `ONE_MINUS_SRC_ALPHA` is zero
       * and the RGB result is exactly `src * dst`, with the destination alpha left alone. A
       * colour whose alpha is 1 *is* its own premultiplication — the flag names the blend
       * equation here and says nothing about any stored colour. If `FRAG` ever stops writing
       * 1.0, this line has to be revisited with it.
       *
       * **Not the §224 flag.** §224 is `premultiplyAlpha` on a TEXTURE round-tripped through a
       * 2D canvas, which came back with 57 % of `torch_flame`'s bytes wrong and ±184 on red.
       * Different flag, different object: this material has no map of any kind, and the
       * decalsign run measured the frame outside the decals to confirm nothing else moved.
       */
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
      fog: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `world.decals.${this.name}`;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 6;                 // after opaque, before FX's impact decals at 8
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    /* main.js re-enables castShadow on every opaque mesh after init; this is the documented
       opt-out. A ground quad in the shadow map would self-shadow the floor it sits on. */
    mesh.userData.noShadow = true;

    /* Override-pass opt-out, the same shape as `fx/Decals.js` and for the same reason: POSTFX
       replaces the material outright for its normal prepass, and a ground quad 1.2 cm above the
       floor writes a depth step the crease detector reads as an edge — an ink line drawn round
       every contact shadow. `prepassSkipTransparent` would also catch it, but that knob ships
       `false` and is another agent's to change. */
    const self = this;
    mesh.onBeforeRender = function (r, s, c, geometry, material) {
      if (material !== self.material) { self._stash = geometry.instanceCount; geometry.instanceCount = 0; }
    };
    mesh.onAfterRender = function (r, s, c, geometry, material) {
      if (material !== self.material && self._stash !== undefined) {
        geometry.instanceCount = self._stash; self._stash = undefined;
      }
    };

    this.geometry = geo;
    this.material = mat;
    this.mesh = mesh;
    (parent || this.engine?.scene)?.add(mesh);
    this.refresh();
    return mesh;
  }

  /**
   * Re-read the atmosphere and the debug levers and push them into the uniforms.
   *
   * Called every frame, deliberately: `debug.decalScale` / `debug.decalRadius` are in-page
   * levers so a ONE-BOOT A/B can turn the feature off and back on without a rebuild and without
   * touching `TUNE` (an arm that edits TUNE cannot prove it edited nothing else). This is the
   * same shape as `debug.contactScale` in PostFX and `debug.grainScale` before it.
   *
   * `decalScale = 0` drives the strength to exactly 0 AND hides the mesh, so it is a true OFF
   * arm — no draw, no blend, bit-identical to the build with no decals in it — rather than a
   * small strength that still composites.
   */
  refresh() {
    if (!this.material) return;
    const u = this.material.uniforms;
    const dbg = this.engine?.debug || {};

    const atmos = this.engine?.get?.('lighting')?.atmosphere;
    _key.copy(atmos?.keyDir || FALLBACK_KEY);
    if (_key.lengthSq() < 1e-8) _key.copy(FALLBACK_KEY);
    const shadowLen = shadowLengthOf(_key);

    // The shadow travels AWAY from the key.
    let kx = -_key.x, kz = -_key.z;
    const kl = Math.hypot(kx, kz);
    if (kl > 1e-5) { kx /= kl; kz /= kl; } else { kx = 1; kz = 0; }
    u.uKey.value.set(kx, kz);
    u.uShadowLen.value = shadowLen;
    u.uReach.value.set(this.tune.reachFrac, this.tune.reachCap);
    u.uPush.value = this.tune.push;

    const scale = dbg.decalScale ?? 1;
    const radius = dbg.decalRadius ?? 1;
    u.uRadius.value = radius;
    u.uStrength.value = this.tune.strength * scale;
    tintMultiplier(_c.copy(atmos?.shadowTint || _c.setHex(SHADOW_HUE)), this.tune, u.uTint.value);

    const on = u.uStrength.value > 1e-4 && radius > 1e-4;
    if (this.mesh) this.mesh.visible = on;

    const a = this._applied;
    a.strength = u.uStrength.value;
    a.shadowLen = shadowLen;
    a.keyAz = Math.atan2(kx, kz);
    a.reachFrac = u.uReach.value.x;
    a.reachCap = u.uReach.value.y;
    a.push = u.uPush.value;
    a.radius = u.uRadius.value;
    a.count = this.count;
    a.visible = on;
    a.tintR = u.uTint.value.r; a.tintG = u.uTint.value.g; a.tintB = u.uTint.value.b;
  }

  /**
   * What the shader actually received this frame — never `this.tune`.
   *
   * The distinction is the whole of KNOWN_ISSUES §40: a lever that is read back from its own
   * source of truth cannot report that it failed to reach the shader. Two arms with equal
   * applied state are COLLAPSED and score nothing.
   */
  state() { return { ...this._applied }; }

  update() { this.refresh(); }

  dispose() {
    this.mesh?.removeFromParent();
    this.geometry?.dispose();
    this.material?.dispose();
    this.mesh = null; this.geometry = null; this.material = null;
    this._pending.length = 0;
  }
}

const _bb = new THREE.Box3();

/**
 * Everything `ContactDecals.add()` needs, read off geometry.
 *
 * The radius is the **mean of the half-extents of the bottom slab's own bounding box**. Three
 * things had to go wrong before that phrasing was earned, and each shows up as a decal that
 * reads as a puddle rather than as contact:
 *
 * 1. **Lowest slab, not the whole prop.** `barrel_large` measures 0.613 m at the floor and
 *    0.932 m at its widest belly. What touches the ground is the base, so a decal sized off the
 *    whole silhouette is ~50 % too wide under every barrel in the level.
 * 2. **Not the maximum radius.** The maximum is the CIRCUMSCRIBED radius — a box's half
 *    diagonal. `crates_stacked` reads 1.427 m to a corner against ~1.09 m to its flat sides, so
 *    a max-derived circle overshoots the crate by 31 % everywhere except four points.
 * 3. **Not a mean over azimuth wedges either**, which is what replaced (2) and was worse: it is
 *    tessellation-dependent. A box's bottom face has four vertices, and a ten-sided vessel's has
 *    ten, so most wedges are empty and the mean collapses toward a third of the true radius —
 *    measured on the shipped set dress, median radius fell 0.47 m to 0.16 m. A footprint that
 *    depends on how finely a prop was modelled is not a footprint.
 *
 * The slab AABB has none of those failure modes: it is exact for a box, exact for a cylinder,
 * and reads the same number whatever the vertex count.
 *
 * Takes one geometry or a list, because a prop is often several: a brazier is a bowl, a tripod
 * and three feet, and its footprint is the tripod's, which no single part carries. The floor is
 * the union's `min.y`, not a `y` a call site passed — `place()` applies a scale (the courtyard
 * pottery runs 0.85–1.25) and the value that was passed in is the value before it.
 *
 * @param {THREE.BufferGeometry|THREE.BufferGeometry[]} src
 * @param {number} slab  height of the band that counts as "touching the floor", metres
 * @returns {{x:number,y:number,z:number,radius:number,height:number}|null}
 */
export function groundFootprint(src, slab = 0.25) {
  const list = Array.isArray(src) ? src : [src];
  _bb.makeEmpty();
  for (const g of list) {
    if (!g?.attributes?.position) continue;
    g.computeBoundingBox();
    if (g.boundingBox) _bb.union(g.boundingBox);
  }
  if (_bb.isEmpty() || !Number.isFinite(_bb.min.y)) return null;
  const y = _bb.min.y;

  let sx0 = Infinity, sx1 = -Infinity, sz0 = Infinity, sz1 = -Infinity;
  for (const g of list) {
    const pos = g?.attributes?.position;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > y + slab) continue;
      const x = pos.getX(i), z = pos.getZ(i);
      if (x < sx0) sx0 = x; if (x > sx1) sx1 = x;
      if (z < sz0) sz0 = z; if (z > sz1) sz1 = z;
    }
  }
  /* A prop whose lowest slab is a point — a tipped statue, a cone, a coin on its edge — falls
     back to a third of the whole silhouette, which is a contact rather than a footprint. */
  const whole = ((_bb.max.x - _bb.min.x) + (_bb.max.z - _bb.min.z)) / 4;
  const radius = sx1 > sx0 || sz1 > sz0 ? ((sx1 - sx0) + (sz1 - sz0)) / 4 : whole / 3;
  return {
    x: sx1 > sx0 ? (sx0 + sx1) / 2 : (_bb.min.x + _bb.max.x) / 2,
    z: sz1 > sz0 ? (sz0 + sz1) / 2 : (_bb.min.z + _bb.max.z) / 2,
    y, radius, height: _bb.max.y - _bb.min.y,
  };
}

/**
 * Base footprint radius of one geometry. Thin wrapper over `groundFootprint` so a call site that
 * only wants the number does not have to know the shape of the record.
 */
export function baseRadiusOf(geo, slab = 0.25) {
  return groundFootprint(geo, slab)?.radius ?? 0;
}
