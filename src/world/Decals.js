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
 *    shadow travels on the ground, `-normalize(keyDir.xz)`, and the elongation comes from the
 *    real shadow length `|keyDir.xz| / keyDir.y` at that time of day — 0.25 at `interior`'s 76°
 *    sun (so the decal is nearly round, correctly), 2.05 at `courtyard`'s 26°, 4.70 at `night`.
 *    Both are UNIFORMS, so the decal follows time of day without a rebuild.
 *  - **It is capped well short of a cast shadow.** Shadow maps are enabled (`Engine.js`) and
 *    every prop already casts. This is the CONTACT — the darkening at the base that a 2048 map
 *    at 30 m cannot resolve. `TUNE.stretch` scales the elongation to a fraction of the shadow
 *    length precisely so the decal agrees with the cast shadow's direction instead of drawing
 *    a second, competing one.
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
  /** Decal minor radius = the prop's own base footprint radius x this. */
  spread: 1.34,
  /** Metres. Nothing gets a contact shadow wider than this, however big its footprint. */
  maxRadius: 2.4,
  /** Elongation = 1 + stretch * min(shadowLength, stretchCap). Fraction of a real cast shadow. */
  stretch: 0.30,
  stretchCap: 3.0,
  /** How much of the extra length is pushed downwind, so the near edge keeps hugging the base. */
  push: 0.55,
  /** Core opacity of the darkening, 0..1. `debug.decalScale` multiplies this. */
  strength: 0.72,
  /** The skirt band's share of the core. Two flat tones is the whole point — see the header. */
  skirt: 0.45,
  /** Band radii as a fraction of the decal radius: core out to `core`, skirt out to `edge`. */
  core: 0.44,
  edge: 0.94,
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
attribute float aAlpha;

uniform vec2 uKey;        // unit ground direction the shadow travels (away from the key)
uniform float uElong;     // >= 1, major/minor
uniform float uPush;      // downwind offset, in units of (uElong - 1) * radius
uniform float uRadius;    // global radius multiplier — debug.decalRadius

varying float vA;

void main() {
  vec2 d = vec2( position.x, position.z );
  vec2 t = vec2( -uKey.y, uKey.x );
  float along = d.x * uElong + ( uElong - 1.0 ) * uPush;
  vec2 p = uKey * along + t * d.y;
  vec3 w = iCentre + vec3( p.x, 0.0, p.y ) * ( iRadius * uRadius );
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

/** Elongation of the contact ellipse for a ground-shadow length (metres per metre of height). */
export function elongationFor(shadowLen, tune = TUNE) {
  return 1 + tune.stretch * Math.min(Math.max(shadowLen, 0), tune.stretchCap);
}

/** Ground shadow length per unit height for a key direction. Infinite below the horizon. */
export function shadowLengthOf(keyDir) {
  const y = keyDir.y;
  if (!(y > 1e-3)) return Infinity;
  return Math.hypot(keyDir.x, keyDir.z) / y;
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
    this._applied = { strength: 0, elong: 1, keyAz: 0, shadowLen: 0, radius: 1, count: 0, visible: false };
  }

  /**
   * Queue one prop's contact.
   *
   * @param {number} x      prop axis, world
   * @param {number} y      the FLOOR the prop stands on — not the prop's origin
   * @param {number} z
   * @param {number} footprintRadius  the prop's own base radius, in metres
   */
  add(x, y, z, footprintRadius) {
    const r = Math.min(this.tune.maxRadius, footprintRadius * this.tune.spread);
    if (!(r > 0.01) || !Number.isFinite(x + y + z + r)) return false;
    this._pending.push(x, y + this.tune.lift, z, r);
    return true;
  }

  get count() { return this._pending.length / 4; }

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

    const centre = new Float32Array(n * 3), radius = new Float32Array(n);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, maxR = 0;
    for (let i = 0; i < n; i++) {
      const x = this._pending[i * 4], y = this._pending[i * 4 + 1], z = this._pending[i * 4 + 2], r = this._pending[i * 4 + 3];
      centre[i * 3] = x; centre[i * 3 + 1] = y; centre[i * 3 + 2] = z;
      radius[i] = r;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      maxR = Math.max(maxR, r);
    }
    geo.setAttribute('iCentre', new THREE.InstancedBufferAttribute(centre, 3));
    geo.setAttribute('iRadius', new THREE.InstancedBufferAttribute(radius, 1));
    geo.instanceCount = n;
    /* The instances are displaced in the vertex shader, so three's own bounds would be a point
       cloud of centres. Padded by the largest decal's worst-case reach — radius x the elongation
       cap x (1 + push) — because a wrong bounding sphere frustum-culls the whole batch at the
       screen edge, which is the far side of exactly the shots this feature exists for. */
    const pad = maxR * elongationFor(this.tune.stretchCap, this.tune) * (1 + this.tune.push);
    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(minX - pad, minY - 0.1, minZ - pad),
      new THREE.Vector3(maxX + pad, maxY + 0.1, maxZ + pad),
    );
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());

    const mat = new THREE.ShaderMaterial({
      name: `world.decals.${this.name}`,
      uniforms: {
        uKey: { value: new THREE.Vector2(1, 0) },
        uElong: { value: 1 },
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
    /* Below the horizon the ground shadow length diverges; the moon key at `night` sits at
       y = 0.208 and is fine, but a key at y <= 0 has no ground shadow at all and the cap is
       what keeps the ellipse finite rather than a NaN. */
    const shadowLen = shadowLengthOf(_key);
    const elong = elongationFor(shadowLen, this.tune);

    // The shadow travels AWAY from the key.
    let kx = -_key.x, kz = -_key.z;
    const kl = Math.hypot(kx, kz);
    if (kl > 1e-5) { kx /= kl; kz /= kl; } else { kx = 1; kz = 0; }
    u.uKey.value.set(kx, kz);
    u.uElong.value = elong;
    u.uPush.value = this.tune.push;

    const scale = dbg.decalScale ?? 1;
    const radius = dbg.decalRadius ?? 1;
    u.uRadius.value = radius;
    u.uStrength.value = this.tune.strength * scale;
    tintMultiplier(_c.copy(atmos?.shadowTint || _c.setHex(SHADOW_HUE)), this.tune, u.uTint.value);

    const on = u.uStrength.value > 1e-4 && radius > 1e-4;
    if (this.mesh) this.mesh.visible = on;

    this._applied = {
      strength: u.uStrength.value, elong, keyAz: Math.atan2(kx, kz),
      shadowLen: Number.isFinite(shadowLen) ? shadowLen : null,
      radius, count: this.count, visible: on,
      tint: [u.uTint.value.r, u.uTint.value.g, u.uTint.value.b],
    };
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

/**
 * Base footprint radius of a geometry, measured over the lowest `slab` metres of it.
 *
 * The bounding-box corner is the wrong number and by a lot: `crates_stacked` measures 1.427 m
 * to its base corner but `barrel_large` only 0.635 m at the floor against 0.932 m at its widest
 * belly, so a bbox-derived decal would be 47 % too wide under every barrel in the level. What
 * touches the floor is the widest ring in the bottom slab, and that is what this returns.
 *
 * @param {THREE.BufferGeometry} geo   geometry whose local origin is the prop's vertical axis
 * @param {number} slab                height of the band to measure, metres
 */
export function baseRadiusOf(geo, slab = 0.25) {
  const pos = geo?.attributes?.position;
  if (!pos) return 0;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const minY = geo.boundingBox.min.y;
  const cx = (geo.boundingBox.min.x + geo.boundingBox.max.x) / 2;
  const cz = (geo.boundingBox.min.z + geo.boundingBox.max.z) / 2;
  let r = 0, rAny = 0;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - cx, dz = pos.getZ(i) - cz;
    const d = Math.hypot(dx, dz);
    if (d > rAny) rAny = d;
    if (pos.getY(i) <= minY + slab && d > r) r = d;
  }
  /* A prop whose lowest slab is a point — a tipped statue, a cone — would otherwise get a decal
     of nothing. Fall back to a third of the widest radius, which is a contact rather than a
     silhouette. */
  return r > 1e-3 ? r : rAny / 3;
}
