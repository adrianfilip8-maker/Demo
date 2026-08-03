import * as THREE from 'three';

/**
 * Shared plumbing for the post chain: a fullscreen blitter, render-target helpers, and the
 * GLSL every pass needs (depth linearisation, view-space reconstruction, dither, AgX, sRGB).
 *
 * Everything here is deliberately dependency-free — no EffectComposer, no Pass base class.
 * POSTFX owns presenting the frame, so the chain has to be something I can reason about
 * line by line and always keep a safe path through.
 */

/* ---------------------------------------------------------------------------
   Fullscreen blitter — one triangle, not two. Half the vertex work, no diagonal
   seam for derivative-based passes to trip over.
--------------------------------------------------------------------------- */
export class Blit {
  constructor() {
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._geo = new THREE.BufferGeometry();
    this._geo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this._geo.setAttribute('uv', new THREE.BufferAttribute(
      new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this._geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    this._mesh = new THREE.Mesh(this._geo, null);
    this._mesh.frustumCulled = false;
    this._mesh.matrixAutoUpdate = false;
  }

  /** Draw `material` over the whole of `target` (null = canvas). */
  render(renderer, material, target = null, clear = true) {
    this._mesh.material = material;
    const prevAuto = renderer.autoClear;
    renderer.autoClear = clear;
    renderer.setRenderTarget(target);
    if (clear) renderer.clear(true, false, false);
    renderer.render(this._mesh, this._cam);
    renderer.autoClear = prevAuto;
  }

  dispose() {
    this._geo.dispose();
    this._mesh.material = null;
  }
}

/* ---------------------------------------------------------------------------
   Render targets
--------------------------------------------------------------------------- */

/**
 * @param {number} w @param {number} h
 * @param {{type?, format?, depth?:boolean, depthTexture?:boolean, samples?:number,
 *          filter?, wrap?, name?:string}} o
 */
export function makeRT(w, h, o = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type: o.type ?? THREE.UnsignedByteType,
    format: o.format ?? THREE.RGBAFormat,
    minFilter: o.filter ?? THREE.LinearFilter,
    magFilter: o.filter ?? THREE.LinearFilter,
    wrapS: o.wrap ?? THREE.ClampToEdgeWrapping,
    wrapT: o.wrap ?? THREE.ClampToEdgeWrapping,
    depthBuffer: o.depth !== false,
    stencilBuffer: false,
    generateMipmaps: false,
    // Post-process intermediates are data, never art. Any sRGB decode here would be a
    // second gamma transform on top of the one the final pass does.
    colorSpace: THREE.NoColorSpace,
    samples: o.samples || 0,
  });
  rt.texture.name = o.name || 'postfx.rt';
  if (o.depthTexture) {
    // DEPTH_COMPONENT24: plenty at near 0.1 / far 4000 (≈1 mm at 40 m), and it resolves
    // cleanly out of an MSAA target, which DEPTH24_STENCIL8 also does but for more memory.
    const dt = new THREE.DepthTexture(Math.max(1, w | 0), Math.max(1, h | 0));
    dt.type = THREE.UnsignedIntType;
    dt.format = THREE.DepthFormat;
    dt.minFilter = THREE.NearestFilter;
    dt.magFilter = THREE.NearestFilter;
    dt.name = `${o.name || 'postfx'}.depth`;
    rt.depthTexture = dt;
  }
  return rt;
}

export function sizeRT(rt, w, h) {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0);
  if (!rt || (rt.width === w && rt.height === h)) return;
  rt.setSize(w, h);
}

export function killRT(rt) {
  if (!rt) return;
  rt.depthTexture?.dispose();
  rt.dispose();
}

/* ---------------------------------------------------------------------------
   Shared GLSL
--------------------------------------------------------------------------- */

/** Depth → view space, plus the small numeric utilities every pass reaches for. */
export const GLSL_VIEW = /* glsl */`
uniform mat4 uProjInv;
uniform vec2 uNearFar;

float slyLuma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

/** Raw depth buffer value -> positive distance along the view axis, in metres. */
float slyLinearZ( float d ) {
  // perspectiveDepthToViewZ, sign-flipped so callers deal in positive metres.
  return ( uNearFar.x * uNearFar.y ) / ( uNearFar.y - d * ( uNearFar.y - uNearFar.x ) );
}

/** true when this pixel is sky / cleared background. */
bool slyIsSky( float d ) { return d >= 0.999999; }

/** Exact view-space position from a depth sample. Works for any projection. */
vec3 slyViewPos( vec2 uv, float d ) {
  vec4 ndc = vec4( uv.x * 2.0 - 1.0, uv.y * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
  vec4 v = uProjInv * ndc;
  return v.xyz / v.w;
}

/** Unit view-space direction through a pixel. Depth-independent: any ndc z gives the same ray. */
vec3 slyViewDir( vec2 uv ) {
  return normalize( slyViewPos( uv, 0.5 ) );
}

/** MeshNormalMaterial packs view-space normals as n*0.5+0.5. */
vec3 slyDecodeNormal( vec3 t ) { return normalize( t * 2.0 - 1.0 ); }
`;

/** Hashes + an interleaved-gradient dither. Static per pixel so a still frame is stable. */
export const GLSL_NOISE = /* glsl */`
float slyHash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

vec3 slyHash32( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yxz + 33.33 );
  return fract( ( p3.xxy + p3.yzz ) * p3.zyx );
}

/** Jimenez's interleaved gradient noise — the cheapest thing that dithers without a texture. */
float slyIGN( vec2 px ) {
  return fract( 52.9829189 * fract( dot( px, vec2( 0.06711056, 0.00583715 ) ) ) );
}

/**
 * Ordered Bayer dither, by the recursive definition. Static per pixel — a still frame is
 * bit-identical every time it is rendered, which the screenshot critic depends on.
 */
float slyBayer4( vec2 a ) {
  a = floor( a );
  return fract( a.x * 0.5 + a.y * a.y * 0.75 );
}
float slyBayer16( vec2 a ) {
  return slyBayer4( a * 0.5 ) * 0.25 + slyBayer4( a );
}
`;

/**
 * sRGB transfer functions, written out by hand.
 *
 * These are the ONLY gamma transform in the chain. Every pass material sets
 * `toneMapped:false` and includes no three.js colour chunks, so nothing can slip a second
 * encode in behind my back (AGENTS §7.3: a double encode washes the whole frame out).
 */
export const GLSL_SRGB = /* glsl */`
vec3 slyLinearToSrgb( vec3 c ) {
  c = max( c, vec3( 0.0 ) );
  return mix( c * 12.92, 1.055 * pow( c, vec3( 0.41666667 ) ) - 0.055, step( 0.0031308, c ) );
}
vec3 slySrgbToLinear( vec3 c ) {
  c = max( c, vec3( 0.0 ) );
  return mix( c * 0.0773993808, pow( c * 0.9478672986 + 0.0521327014, vec3( 2.4 ) ), step( 0.04045, c ) );
}
`;

/**
 * AgX, transcribed from three.js's own `tonemapping_pars_fragment` so the look matches
 * `renderer.toneMapping = AgXToneMapping` exactly.
 *
 * It is done here, once, by hand rather than through `#include <tonemapping_fragment>`:
 * three only injects that chunk when it is rendering to the canvas, and half this chain
 * renders to float targets. Owning it explicitly is the only way to *know* the frame is
 * tonemapped exactly once. Input: linear-sRGB scene radiance. Output: linear-sRGB [0,1].
 */
export const GLSL_AGX = /* glsl */`
const mat3 SLY_REC2020_TO_SRGB = mat3(
  vec3(  1.6605, -0.1246, -0.0182 ),
  vec3( -0.5876,  1.1329, -0.1006 ),
  vec3( -0.0728, -0.0083,  1.1187 ) );
const mat3 SLY_SRGB_TO_REC2020 = mat3(
  vec3( 0.6274, 0.0691, 0.0164 ),
  vec3( 0.3293, 0.9195, 0.0880 ),
  vec3( 0.0433, 0.0113, 0.8956 ) );

vec3 slyAgxContrast( vec3 x ) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return + 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
         - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

/* Highlight-detail shoulder. KNOWN_ISSUES §68 measured texture coverage collapsing with
   brightness (dark surfaces 73-82%, bright 39-46%) and §70.2 attributed it to this curve:
   the log-log display slope G = dlnD/dlnc runs 0.625 in the dark bin against 0.244 in the
   bright one, so a texture modulation must be 2.56x larger to survive in a highlight.

   The governing identity is the fundamental theorem of calculus, not a curve shape argument:
   the MEAN of d(ln poly)/dx across any band equals ( ln poly(b) - ln poly(a) ) / (b - a) —
   fixed entirely by the curve's values at the band's two ENDS, so no reshaping INSIDE the band
   can change it. (G inherits this only up to the sRGB encode's mild nonlinearity: treat the
   identity as exact for the tonemap's own log-slope, and the measured frontier table as the
   authority for G.) Since poly is bounded by display white, buying highlight slope REQUIRES
   lowering the curve below the highlights — holding the upper-mid anchor fixed, the ceiling on
   that mean is x1.19 even if all separation above scene ~4.4 is sacrificed, against a x2.56
   gap. So this knob does not "recover" detail for free; it TRADES brightness for it,
   and it is a look change. It is cheaper than the only lever previously sized: at matched
   detail gain (x1.5) it holds lit sandstone at L 180 against exposure's L 164, and shadow at
   L 52 against L 37.

   b = 1.0 makes both branches reduce to poly(x) identically, so the default is bit-exact. */
vec3 slyAgxShoulder( vec3 p, vec3 x, float b ) {
  if ( b == 1.0 ) return p;
  const float xLo = 0.60, xHi = 0.86;
  float P1 = slyAgxContrast( vec3( 1.0 ) ).x;
  float k  = pow( max( slyAgxContrast( vec3( xLo ) ).x, 1e-9 ) / P1, b - 1.0 );
  vec3 lo = p * k;
  vec3 hi = P1 * pow( max( p, vec3( 1e-9 ) ) / P1, vec3( b ) );
  return mix( lo, hi, smoothstep( vec3( xLo ), vec3( xHi ), x ) );
}

vec3 slyAgX( vec3 color, float exposure, float shoulder ) {
  const mat3 inset = mat3(
    vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
    vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
    vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
  const mat3 outset = mat3(
    vec3(  1.1271005818144368, -0.1413297634984383, -0.14132976349843826 ),
    vec3( -0.11060664309660323,  1.157823702216272, -0.11060664309660294 ),
    vec3( -0.016493938717834573, -0.016493938717834257, 1.2519364065950405 ) );
  const float minEv = -12.47393;
  const float maxEv = 4.026069;

  color *= exposure;
  color = SLY_SRGB_TO_REC2020 * color;
  color = inset * color;
  color = max( color, 1e-10 );
  color = log2( color );
  color = ( color - minEv ) / ( maxEv - minEv );
  color = clamp( color, 0.0, 1.0 );
  vec3 agxX = color;                       // normalised log-exposure, kept for the shoulder
  color = slyAgxContrast( color );
  color = slyAgxShoulder( color, agxX, shoulder );
  color = outset * color;
  color = pow( max( color, vec3( 0.0 ) ), vec3( 2.2 ) );
  color = SLY_REC2020_TO_SRGB * color;

  /* Gamut-map instead of amputating. The rec2020->sRGB red row subtracts 0.5876 of green — an
     order of magnitude more than anything in the green or blue rows — so deep, cool, low-red
     surfaces (the character's clothDark boots, gloves and brim) arrive here with red slightly
     NEGATIVE and the old clamp pinned them flat at 0. Measured on the shipped frames: 5,407 px
     of sly-closeup (0.59%), 36.5% of the boot box, and red is the ONLY channel ever pinned in
     any of the ten shots. A flat pinned patch reads as a dead black hole in a surface that has
     modelling in it.

     Blending toward the pixel's own luminance by exactly enough to lift the minimum channel to 0
     desaturates that pixel instead of deleting a channel of it. It cannot touch a pixel the clamp
     was not already firing on: the branch is gated on mn < 0, and that no-op property is
     verified rather than asserted — scratchpad/gamutcheck.mjs parses these very constants out
     of this file and finds **0 of 42,123 in-gamut grid samples change by any amount** (float64,
     not a tolerance), while the out-of-gamut population moves by up to 20 display bytes, mostly
     in blue. It does NOT restore red: the colour is genuinely outside sRGB by this point.

     What it is NOT: the character's blue cast. That is the light reaching him (the architecture
     in the same frame is warm at R/G 1.55-1.65 through this identical code), and a global chain
     cannot be warm on the wall and cool on the subject. See KNOWN_ISSUES §23. */
  float lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  float mn  = min( color.r, min( color.g, color.b ) );
  if ( mn < 0.0 && lum > mn ) color = mix( color, vec3( lum ), min( 1.0, -mn / ( lum - mn ) ) );

  return clamp( color, 0.0, 1.0 );
}
`;

/** Boilerplate vertex shader — every pass uses it. */
export const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

/** ShaderMaterial with the pass defaults baked in. Nothing here is tonemapped or encoded. */
export function passMaterial(name, uniforms, fragmentShader, glsl3 = false) {
  const m = new THREE.ShaderMaterial({
    name,
    uniforms,
    vertexShader: VERT,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
    fog: false,
  });
  if (glsl3) m.glslVersion = THREE.GLSL3;
  // LIGHTING sweeps the scene and cascade-patches built-in materials; ours are ShaderMaterials
  // so it skips them, but be explicit — a post pass must never grow a shadow lookup.
  m.userData.csm = false;
  return m;
}
