import * as THREE from 'three';
import { rng, fbm2, valueNoise2 } from '../core/Rand.js';
import { EMITTERS, AMBIENT, MOTES, TORCH_MOTES, TILE, PAL, buildAtlas } from './Emitters.js';
import { Decals } from './Decals.js';
import { Trails } from './Trails.js';

/**
 * Particles — every airborne thing in the game (AGENTS.md §3: agent FX).
 *
 * ── How it works ────────────────────────────────────────────────────────────────────────
 * Nothing is simulated on the CPU. A particle is a row of instance attributes describing a
 * *curve* — spawn point, initial velocity, drag, gravity, size ramp, colour ramp — and the
 * vertex shader evaluates that curve at `uTime - t0`. Spawning writes ~28 floats; after that
 * the particle costs zero JavaScript for its whole life. Ambient fields (sand, haze, shimmer,
 * motes) are written **once at init** and loop forever in the shader, so the drifting sand
 * that has to be in every frame of the game costs literally nothing per frame.
 *
 * Batches are pooled ring buffers: one draw call each, no allocation, and a batch collapses
 * to `instanceCount = 0` once its last particle has died.
 *
 * ── Soft particles ──────────────────────────────────────────────────────────────────────
 * POSTFX renders the scene into a target that owns the depth texture, and that texture is
 * *bound as the depth attachment while we draw*, so sampling it directly inside the scene
 * pass is a feedback loop. Instead, at the top of our update — before POSTFX starts the
 * frame — we blit that depth texture into our own half-res linear-depth target. The data is
 * one frame stale, which is invisible (and exactly zero frames stale for the screenshot
 * critic, whose camera is static), and it costs one fullscreen triangle instead of a second
 * scene render. Every fade fails *open*: if the sample is missing or garbage the particle is
 * drawn at full strength rather than vanishing.
 *
 * ── The blue sparkle (§2.1.6) ───────────────────────────────────────────────────────────
 * See `SparkleField`. The diamond is drawn analytically in the fragment shader, not sampled
 * from a texture, because the four-point silhouette has to stay razor sharp at 6 px and at
 * 200 px. It is Sly's UI grammar; a round blob would be a different game.
 */

const TUNE = {
  /* wind — a gust envelope from fBm, never a sine: a sine reads as a machine */
  windBase: 2.3,            // m/s at gust = 1
  windDirDeg: 62,           // travel direction, degrees CW from +Z. West→east, with the sun.
  windDirSwing: 0.55,       // radians of slow direction wander
  gustLo: 0.20, gustHi: 1.65,
  gustRate: 0.085,          // fBm time scale for the slow breath
  crackRate: 0.47,          // second octave: the sharp gust fronts

  /* ambient */
  ambientLitMix: 0.72,      // how far dust is tinted by the key light vs the ambient floor
  shaftBoost: 2.6,          // extra brightness for dust caught inside a light blade
  groundProbeEvery: 5,      // frames between ground-height probes
  groundLerp: 3.0,          // how fast the sand plane chases a new floor height

  /* soft particles */
  softDepth: 0.55,          // metres of depth over which a sprite fades into geometry
  nearFade: [0.28, 0.95],   // don't smear the lens with a particle inside the near plane

  /* sparkle markers (§2.1 point 6) */
  sparkleMax: 96,
  sparkleRadius: 34,        // metres of affordance search around the player
  sparkleRefresh: 0.22,     // seconds between collision queries
  sparkleSize: 0.42,
  sparkleNearBoost: 12,     // metres at which a marker starts brightening for the player
  sparkleTags: ['hook', 'spire', 'rail', 'pole'],

  /* crest streaming */
  crestProbeEvery: 17,      // frames between terrain crest probes
  crestRings: [26, 58],
  crestPerRing: 9,
  crestRate: 2.4,           // bursts/sec per crest anchor at gust 1

  /* footstep dead-reckoning when ANIMATION is absent */
  strideLength: 1.5,
};

const MAX_SHAFTS = 6;

/* ── shared GLSL ───────────────────────────────────────────────────────────────────────── */

const SHAFT_GLSL = /* glsl */`
uniform vec4 uShaftA[${MAX_SHAFTS}];   // origin.xyz, halfWidth
uniform vec4 uShaftB[${MAX_SHAFTS}];   // dir.xyz (travel), length
uniform vec4 uShaftC[${MAX_SHAFTS}];   // axis.xyz (slot long axis), intensity
uniform float uShaftSpan;
uniform int uShaftN;

/* How deep inside a clerestory blade a point sits, 0..1. Used to brighten dust so it reads
   as *illuminated* rather than as grey dirt floating in front of the lens (§7.3). */
float shaftBoost( vec3 p ) {
  float best = 0.0;
  for ( int i = 0; i < ${MAX_SHAFTS}; i++ ) {
    if ( i >= uShaftN ) break;
    vec3 o = uShaftA[i].xyz;
    float hw = max( uShaftA[i].w, 0.05 );
    vec3 d = uShaftB[i].xyz;
    float L = uShaftB[i].w;
    vec3 rel = p - o;
    float s = dot( rel, d );
    if ( s < 0.0 || s > L ) continue;
    vec3 r = rel - d * s;
    float along = dot( r, uShaftC[i].xyz );
    float cross_ = length( r - uShaftC[i].xyz * along );
    float w = 1.0 - smoothstep( hw * 0.6, hw * 1.9, cross_ );
    w *= 1.0 - smoothstep( uShaftSpan * 0.75, uShaftSpan, abs( along ) );
    w *= uShaftC[i].w * ( 1.0 - 0.3 * s / max( L, 0.001 ) );
    best = max( best, w );
  }
  return best;
}
`;

const PARTICLE_VERT = /* glsl */`
precision highp float;

attribute vec3 aP0;
attribute vec3 aV0;
attribute vec4 aTime;    // t0 (or phase), life, seed, windFollow
attribute vec4 aSize;    // size0, size1, sizeExp, spin
attribute vec4 aDyn;     // gravity, drag, turbulence, alpha
attribute vec4 aShape;   // tile, fadeInFrac, fadeOutExp, stretch
attribute vec3 aCol0;
attribute vec3 aCol1;

uniform float uTime;
uniform vec3  uWind;
uniform vec3  uBox;
uniform vec3  uBoxOrigin;
uniform vec4  uFade;      // farOut, farIn, nearOut, nearIn
uniform vec3  uLightTint;
uniform vec3  uAmbTint;
uniform float uLitMix;
uniform float uSizeScale;

#ifdef SHAFTS
${SHAFT_GLSL}
#endif

varying vec2  vUv;
varying vec4  vCol;
varying float vViewZ;

#include <fog_pars_vertex>

void main() {
  float life = max( aTime.y, 1e-4 );
  #ifdef LOOP
    float age = mod( uTime + aTime.x, life );
  #else
    float age = uTime - aTime.x;
  #endif
  float u = age / life;

  if ( age < 0.0 || u >= 1.0 ) {
    vUv = vec2( 0.0 ); vCol = vec4( 0.0 ); vViewZ = 1.0;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );   // clipped by the far plane
    return;
  }

  float seed = aTime.z;
  float k = aDyn.y;
  // Analytic drag integral. High k == the particle spends almost all of its travel in the
  // first few frames and then hangs: that is what "front-loaded then decelerating" is.
  float dc = ( k > 0.001 ) ? ( 1.0 - exp( -k * age ) ) / k : age;

  vec3 p;
  #ifdef WRAP
    // Toroidal field around the camera. mod() by the box makes the particle world-stable —
    // moving the box only ever teleports particles across the far edge, where they are
    // already faded out.
    vec3 q = aP0 * uBox + ( uWind * aTime.w + aV0 ) * ( uTime + seed * 37.0 );
    p = mod( q - uBoxOrigin, uBox ) + uBoxOrigin;
  #else
    p = aP0 + aV0 * dc + uWind * aTime.w * age;
    p.y -= 0.5 * aDyn.x * age * age;
  #endif

  float ph = seed * 31.4159;
  p += aDyn.z * age * vec3( sin( age * 2.7 + ph ),
                            sin( age * 1.9 + ph * 1.7 ) * 0.6,
                            cos( age * 2.3 + ph * 0.7 ) );

  float sz = mix( aSize.x, aSize.y, pow( u, aSize.z ) ) * uSizeScale;
  float alpha = aDyn.w
    * smoothstep( 0.0, max( aShape.y, 1e-3 ), u )
    * pow( max( 1.0 - u, 0.0 ), aShape.z );

  #ifdef WRAP
    float dcam = distance( p, cameraPosition );
    alpha *= 1.0 - smoothstep( uFade.y, uFade.x, dcam );
    alpha *= smoothstep( uFade.z, uFade.w, dcam );
  #endif

  vec3 col = mix( aCol0, aCol1, u );
  #ifdef LIT
    float boost = 1.0;
    #ifdef SHAFTS
      boost += shaftBoost( p ) * ${TUNE.shaftBoost.toFixed(2)};
    #endif
    col *= mix( uAmbTint, uLightTint * boost, uLitMix );
  #endif
  vCol = vec4( col, alpha );

  vec2 corner = ( uv - 0.5 ) * 2.0;
  vec4 mvPosition;

  #ifdef PLANAR
    // Rings and shockwaves lie on the surface they hit; aV0 carries the plane normal.
    vec3 n = normalize( aV0 + vec3( 0.0, 1e-4, 0.0 ) );
    vec3 t1 = normalize( cross( n, abs( n.y ) > 0.9 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 t2 = cross( n, t1 );
    mvPosition = modelViewMatrix * vec4( p + ( t1 * corner.x + t2 * corner.y ) * sz, 1.0 );
  #else
    mvPosition = modelViewMatrix * vec4( p, 1.0 );
    #ifdef STRETCH
      vec3 vel = aV0 * exp( -k * age );
      vec3 vv = ( modelViewMatrix * vec4( vel, 0.0 ) ).xyz;
      float sp = length( vv.xy );
      vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2( 0.0, 1.0 );
      mvPosition.xy += dir * corner.y * sz * ( 1.0 + aShape.w * length( vel ) )
                     + vec2( -dir.y, dir.x ) * corner.x * sz;
    #else
      float rot = aSize.w * age + seed * 6.2831;
      float cs = cos( rot ), sn = sin( rot );
      mvPosition.xy += vec2( corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs ) * sz;
    #endif
  #endif

  vViewZ = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vec2 tileXY = vec2( mod( aShape.x, 4.0 ), floor( aShape.x * 0.25 ) );
  vUv = tileXY * 0.25 + vec2( 0.02 ) + uv * 0.21;

  #include <fog_vertex>
}
`;

const PARTICLE_FRAG = /* glsl */`
precision highp float;

uniform sampler2D uAtlas;
uniform sampler2D uDepth;
uniform vec2  uInvRes;
uniform float uSoftness;
uniform vec2  uNearFade;
uniform float uOpacity;

varying vec2  vUv;
varying vec4  vCol;
varying float vViewZ;

#include <fog_pars_fragment>

void main() {
  vec4 t = texture2D( uAtlas, vUv );
  float a = vCol.a * t.a * uOpacity;
  if ( a < 0.004 ) discard;

  #ifdef SOFT
    // Fail open: a zero (unbound / not yet rendered) or huge (sky) sample means "nothing in
    // front", so a broken depth copy costs the soft edge, never the particle.
    float sceneZ = texture2D( uDepth, gl_FragCoord.xy * uInvRes ).r;
    if ( sceneZ > 0.001 && sceneZ < 9000.0 ) {
      a *= clamp( ( sceneZ - vViewZ ) / uSoftness, 0.0, 1.0 );
    }
  #endif

  a *= smoothstep( uNearFade.x, uNearFade.y, vViewZ );
  if ( a < 0.004 ) discard;

  gl_FragColor = vec4( vCol.rgb * t.rgb, a );

  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/* ── depth linearisation blit ──────────────────────────────────────────────────────────── */

const DEPTH_VERT = /* glsl */`
precision highp float;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

const DEPTH_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uNearFar;
void main() {
  float d = texture2D( uSrc, vUv ).x;
  float z = 30000.0;
  if ( d > 0.0 && d < 1.0 ) {
    float n = uNearFar.x, f = uNearFar.y;
    float ndc = d * 2.0 - 1.0;
    z = ( 2.0 * n * f ) / ( f + n - ndc * ( f - n ) );
  }
  gl_FragColor = vec4( z, 0.0, 0.0, 1.0 );
}
`;

/* ── the sparkle shader (§2.1 point 6) ─────────────────────────────────────────────────── */

const SPARKLE_VERT = /* glsl */`
precision highp float;
attribute vec3 aPos;
attribute vec4 aData;     // seed, baseScale, bornAt, kind
uniform float uTime;
uniform vec3  uPlayer;
uniform float uThief;
uniform float uNearBoost;
uniform float uSizeScale;
varying vec2  vQ;
varying float vGain;

void main() {
  float seed = aData.x;
  float born = aData.z;
  // Pulse: two beats slightly out of phase so a row of markers never blinks in unison.
  float ph = seed * 6.2831;
  float pulse = 0.72 + 0.28 * sin( uTime * 3.1 + ph ) + 0.10 * sin( uTime * 7.7 + ph * 2.3 );

  float pop = smoothstep( 0.0, 0.22, uTime - born );
  float near = 1.0 - smoothstep( 2.0, uNearBoost, distance( aPos, uPlayer ) );
  float gain = pulse * ( 0.85 + 0.75 * near + 1.25 * uThief ) * pop;

  float sz = aData.y * uSizeScale * ( 0.86 + 0.28 * pulse + 0.35 * uThief );

  vec4 mvPosition = modelViewMatrix * vec4( aPos, 1.0 );
  vec2 corner = ( uv - 0.5 ) * 2.0;
  // Distance compensation: a marker 40 m away must still twinkle, not disappear.
  float dist = max( -mvPosition.z, 0.1 );
  sz *= 1.0 + 0.020 * dist;
  mvPosition.xy += corner * sz;

  vQ = corner;
  vGain = gain;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SPARKLE_FRAG = /* glsl */`
precision highp float;
uniform vec3 uCore;
uniform vec3 uGlow;
varying vec2 vQ;
varying float vGain;

void main() {
  // Astroid: |x|^0.5 + |y|^0.5 <= 1. The concave four-point diamond — Sly's mark. A round
  // falloff would read as a generic glow, so the star is hard-edged and the halo is separate.
  vec2 q = vQ * 1.05;
  float r = length( q );
  float d1 = sqrt( abs( q.x ) ) + sqrt( abs( q.y ) );
  float star = 1.0 - smoothstep( 0.90, 1.02, d1 );

  vec2 q2 = vec2( q.x + q.y, q.y - q.x ) * 0.7071 / 0.58;
  float d2 = sqrt( abs( q2.x ) ) + sqrt( abs( q2.y ) );
  float star2 = ( 1.0 - smoothstep( 0.90, 1.02, d2 ) ) * 0.5;

  float core = 1.0 - smoothstep( 0.0, 0.20, r );
  float halo = pow( max( 0.0, 1.0 - r ), 3.4 );

  float shape = max( star, star2 );
  float a = clamp( shape * 0.95 + core * 0.9 + halo * 0.30, 0.0, 1.0 ) * vGain;
  if ( a < 0.005 ) discard;

  vec3 col = mix( uGlow, uCore, clamp( shape * 0.7 + core * 1.6, 0.0, 1.0 ) );
  gl_FragColor = vec4( col * ( 0.9 + 0.9 * vGain ), a );
  #include <colorspace_fragment>
}
`;

/* ── scratch (§5: zero allocation in update) ───────────────────────────────────────────── */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _col = new THREE.Color();
const _size = new THREE.Vector2();
const UP = new THREE.Vector3(0, 1, 0);

const lin = (hex, out) => out.setHex(hex, THREE.SRGBColorSpace);

/* =========================================================================================
   Batch — one draw call, one pooled ring buffer of instances.
   ========================================================================================= */

class Batch {
  constructor(engine, opts) {
    this.engine = engine;
    this.name = opts.name;
    this.capacity = opts.capacity;
    this.looping = !!opts.loop;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    // Ambient fields follow the camera and impact bursts are tiny; culling either by a
    // bounding sphere that would have to be recomputed every frame is not worth it.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    geo.instanceCount = 0;

    const cap = this.capacity;
    const mk = (n, size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(n, a);
      return a;
    };
    this.aP0 = mk('aP0', 3);
    this.aV0 = mk('aV0', 3);
    this.aTime = mk('aTime', 4);
    this.aSize = mk('aSize', 4);
    this.aDyn = mk('aDyn', 4);
    this.aShape = mk('aShape', 4);
    this.aCol0 = mk('aCol0', 3);
    this.aCol1 = mk('aCol1', 3);
    this.attrs = [this.aP0, this.aV0, this.aTime, this.aSize, this.aDyn, this.aShape, this.aCol0, this.aCol1];

    const defines = {};
    for (const d of opts.defines || []) defines[d] = '';

    this.material = new THREE.ShaderMaterial({
      name: `fx.${opts.name}`,
      defines,
      uniforms: Object.assign({
        uTime: { value: 0 },
        uWind: { value: opts.shared.wind },
        uBox: { value: new THREE.Vector3(1, 1, 1) },
        uBoxOrigin: { value: new THREE.Vector3() },
        uFade: { value: new THREE.Vector4(1e4, 1e4, 0, 0) },
        uLightTint: { value: opts.shared.lightTint },
        uAmbTint: { value: opts.shared.ambTint },
        uLitMix: { value: opts.litMix ?? TUNE.ambientLitMix },
        uSizeScale: { value: 1 },
        uAtlas: { value: opts.shared.atlas },
        uDepth: opts.shared.depth,           // shared uniform object: one assignment re-points all
        uInvRes: { value: opts.shared.invRes },
        uSoftness: { value: opts.softness ?? TUNE.softDepth },
        uNearFade: { value: new THREE.Vector2(TUNE.nearFade[0], TUNE.nearFade[1]) },
        uOpacity: { value: 1 },
        uShaftSpan: { value: 21 },
        uShaftN: { value: 0 },
        uShaftA: { value: opts.shared.shaftA },
        uShaftB: { value: opts.shared.shaftB },
        uShaftC: { value: opts.shared.shaftC },
        // three's renderer writes straight into these when material.fog is on; they have to
        // exist or the first frame throws inside refreshFogUniforms.
        fogColor: { value: new THREE.Color(0xe8b878) },
        fogDensity: { value: 0.0002 },
        fogNear: { value: 1 },
        fogFar: { value: 2000 },
      }),
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,          // §"don't write depth from additive particles" — nor alpha ones
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
      fog: !opts.additive,
      toneMapped: false,          // POSTFX tonemaps once, at the end of the chain
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = `fx.${opts.name}`;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = opts.renderOrder ?? 10;
    this.mesh.matrixAutoUpdate = false;

    /* POSTFX renders the whole scene once more with an override material to build its
       normal buffer. Camera-facing alpha quads have no meaningful normal, and letting them
       into that buffer inks a black box around every puff. Skipping the draw when the
       material we are handed is not ours is the only way to opt out without touching
       another agent's file. */
    const self = this;
    this.mesh.onBeforeRender = function (r, scene, camera, geometry, material) {
      if (material !== self.material) { self._stash = geometry.instanceCount; geometry.instanceCount = 0; }
    };
    this.mesh.onAfterRender = function (r, scene, camera, geometry, material) {
      if (material !== self.material && self._stash !== undefined) {
        geometry.instanceCount = self._stash; self._stash = undefined;
      }
    };

    this.geometry = geo;
    this._head = 0;
    this._used = 0;
    this._deathMax = -1;
    this._dirty = false;
    this._lo = 1e9; this._hi = -1;
  }

  /** Claim the next slot in the ring. Oldest particle is overwritten when the pool wraps. */
  slot(death) {
    const i = this._head;
    this._head = (this._head + 1) % this.capacity;
    if (i + 1 > this._used) this._used = i + 1;
    if (death > this._deathMax) this._deathMax = death;
    if (i < this._lo) this._lo = i;
    if (i > this._hi) this._hi = i;
    this._dirty = true;
    return i;
  }

  /** Upload only the rows that changed, and fold the batch away when it is empty. */
  commit(time, density) {
    if (this.looping) {
      this.geometry.instanceCount = Math.min(this.capacity, Math.max(0, Math.round(this._used * density)));
      if (this._dirty) this._upload(true);
      return;
    }
    if (this._used > 0 && time > this._deathMax) {
      this._used = 0; this._head = 0; this._deathMax = -1;
    }
    if (this._dirty) this._upload(false);
    this.geometry.instanceCount = this._used;
  }

  _upload(full) {
    const lo = full ? 0 : Math.max(0, this._lo);
    const hi = full ? this.capacity - 1 : this._hi;
    for (const a of this.attrs) {
      if (!full && a.addUpdateRange) {
        a.clearUpdateRanges?.();
        a.addUpdateRange(lo * a.itemSize, (hi - lo + 1) * a.itemSize);
      }
      a.needsUpdate = true;
    }
    this._dirty = false;
    this._lo = 1e9; this._hi = -1;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* =========================================================================================
   SparkleField — the blue diamond markers on every traversal affordance.
   ========================================================================================= */

class SparkleField {
  constructor(engine, capacity) {
    this.engine = engine;
    this.capacity = capacity;
    this.count = 0;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aData.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aData', this.aData);
    geo.instanceCount = 0;

    this.material = new THREE.ShaderMaterial({
      name: 'fx.sparkle',
      uniforms: {
        uTime: { value: 0 },
        uPlayer: { value: new THREE.Vector3(0, 0, 0) },
        uThief: { value: 0 },
        uNearBoost: { value: TUNE.sparkleNearBoost },
        uSizeScale: { value: TUNE.sparkleSize },
        uCore: { value: lin(0x8fd8ff, new THREE.Color()).multiplyScalar(2.4) },
        uGlow: { value: lin(0x2a7fd4, new THREE.Color()).multiplyScalar(1.5) },
      },
      vertexShader: SPARKLE_VERT,
      fragmentShader: SPARKLE_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'fx.sparkles';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.mesh.matrixAutoUpdate = false;
    const self = this;
    this.mesh.onBeforeRender = function (r, s, c, geometry, material) {
      if (material !== self.material) { self._stash = geometry.instanceCount; geometry.instanceCount = 0; }
    };
    this.mesh.onAfterRender = function (r, s, c, geometry, material) {
      if (material !== self.material && self._stash !== undefined) {
        geometry.instanceCount = self._stash; self._stash = undefined;
      }
    };
    this.geometry = geo;

    /* Identity of what is already marked, so a marker keeps its pulse phase across refreshes
       instead of restarting (which would make the whole field flash in step). */
    this._keys = new Float64Array(capacity);
    this._seen = new Uint8Array(capacity);
  }

  begin() { this._live = 0; this._seen.fill(0); }

  /** Place (or keep) a marker. `key` identifies the affordance across frames. */
  mark(x, y, z, key, scale, time) {
    if (this._live >= this.capacity) return;
    // Reuse the slot that held this key last refresh, so its phase is continuous.
    let i = -1;
    for (let s = 0; s < this.count; s++) {
      if (this._keys[s] === key && !this._seen[s]) { i = s; break; }
    }
    if (i < 0) {
      i = this._live;
      this._keys[i] = key;
      this.aData.array[i * 4 + 0] = ((key * 0.6180339887) % 1 + 1) % 1;
      this.aData.array[i * 4 + 2] = time;
    } else if (i !== this._live) {
      // Compact: swap the found slot down to the write cursor.
      const j = this._live;
      for (let c = 0; c < 3; c++) {
        const t = this.aPos.array[j * 3 + c];
        this.aPos.array[j * 3 + c] = this.aPos.array[i * 3 + c];
        this.aPos.array[i * 3 + c] = t;
      }
      for (let c = 0; c < 4; c++) {
        const t = this.aData.array[j * 4 + c];
        this.aData.array[j * 4 + c] = this.aData.array[i * 4 + c];
        this.aData.array[i * 4 + c] = t;
      }
      const tk = this._keys[j]; this._keys[j] = this._keys[i]; this._keys[i] = tk;
      const ts = this._seen[j]; this._seen[j] = this._seen[i]; this._seen[i] = ts;
      i = j;
    }
    this._seen[i] = 1;
    this.aPos.array[i * 3 + 0] = x;
    this.aPos.array[i * 3 + 1] = y;
    this.aPos.array[i * 3 + 2] = z;
    this.aData.array[i * 4 + 1] = scale;
    this._live++;
  }

  end() {
    this.count = this._live;
    this.geometry.instanceCount = this.count;
    this.aPos.needsUpdate = true;
    this.aData.needsUpdate = true;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* =========================================================================================
   Particles — the module
   ========================================================================================= */

export class Particles {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.rand = rng(0x5c17c00 ^ 0xfada);
    this.TUNE = TUNE;

    this.root = new THREE.Group();
    this.root.name = 'fx';
    this.root.matrixAutoUpdate = false;

    this.batches = new Map();
    this.emitters = [];          // continuous / attached emitters
    this._emitterPool = [];
    this._offs = [];

    this.wind = new THREE.Vector3(0, 0, 1);
    this.windDir = new THREE.Vector3(0, 0, 1);
    this.gust = 1;

    this.shared = {
      wind: this.wind,
      lightTint: new THREE.Color(1, 1, 1),
      ambTint: new THREE.Color(0.5, 0.55, 0.62),
      atlas: null,
      depth: { value: null },     // replaced by a real uniform object below
      invRes: new THREE.Vector2(1 / 1280, 1 / 720),
      shaftA: [], shaftB: [], shaftC: [],
    };
    for (let i = 0; i < MAX_SHAFTS; i++) {
      this.shared.shaftA.push(new THREE.Vector4());
      this.shared.shaftB.push(new THREE.Vector4(0, -1, 0, 1));
      this.shared.shaftC.push(new THREE.Vector4(1, 0, 0, 0));
    }

    this.groundY = 0;
    this._groundTarget = 0;
    this._frame = 0;
    this._thief = 0;
    this._thiefTarget = 0;

    this._crests = [];
    for (let i = 0; i < TUNE.crestRings.length * TUNE.crestPerRing; i++) {
      this._crests.push({ x: 0, y: 0, z: 0, w: 0, live: false });
    }
    this._crestCount = 0;

    this._strideAccum = 0;
    this._prevPlayer = new THREE.Vector3();
    this._havePrev = false;

    this.stats = { spawned: 0, live: 0, batches: 0 };
    this.soft = { available: false, reason: 'not initialised' };
  }

  /* ==================================================================== init */

  async init() {
    const engine = this.engine;
    try {
      this._buildAtlas();
      this._buildDepthTarget();
      this._buildBatches();
      this._buildAmbient();
      this._buildSparkles();

      this.decals = new Decals(engine, { atlas: this.shared.atlas });
      this.root.add(this.decals.mesh);
      this.trails = new Trails(engine, { atlas: this.shared.atlas });
      this.root.add(this.trails.root);

      engine.scene.add(this.root);

      this._wireEvents();
      this._seedOrphanTorches();
      this._attachCaneTrail();
    } catch (err) {
      engine.warn(`fx: init failed — ${err?.message || err}`);
      console.error('[fx] init failed', err);
    }
  }

  _buildAtlas() {
    const canvas = buildAtlas(512, 0x5c17c00);
    const tex = new THREE.CanvasTexture(canvas);
    tex.name = 'fx.atlas';
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;                       // uv row 0 == canvas row 0, so TILE maths is direct
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(4, this.engine.maxAniso || 1);
    tex.needsUpdate = true;
    this.atlas = tex;
    this.shared.atlas = tex;
  }

  /**
   * Half-res linear-depth copy of POSTFX's scene depth, taken one frame late (see the file
   * header). Everything about this is optional: no POSTFX, no depth texture, or a failed
   * blit all degrade to hard-edged sprites rather than to no sprites.
   */
  _buildDepthTarget() {
    const engine = this.engine;
    const size = engine.renderer.getDrawingBufferSize(_size);
    const w = Math.max(2, size.x >> 1), h = Math.max(2, size.y >> 1);

    this.depthRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    this.depthRT.texture.name = 'fx.linearDepth';

    this.depthMat = new THREE.ShaderMaterial({
      name: 'fx.depthCopy',
      uniforms: { uSrc: { value: null }, uNearFar: { value: new THREE.Vector2(0.1, 4000) } },
      vertexShader: DEPTH_VERT,
      fragmentShader: DEPTH_FRAG,
      depthTest: false, depthWrite: false,
    });
    this._depthQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.depthMat);
    this._depthQuad.frustumCulled = false;
    this._depthScene = new THREE.Scene();
    this._depthScene.add(this._depthQuad);
    this._depthCam = new THREE.Camera();

    // The uniform object every batch shares, so one assignment re-points them all.
    this.shared.depth = { value: this.depthRT.texture };
    this._depthOK = false;
  }

  _batch(name, opts) {
    const b = new Batch(this.engine, Object.assign({ name, shared: this.shared }, opts));
    this.batches.set(name, b);
    this.root.add(b.mesh);
    return b;
  }

  _buildBatches() {
    const soft = ['SOFT'];
    this._batch('dust', {
      capacity: 900, additive: false, renderOrder: 10,
      defines: [...soft, 'LIT'],
    });
    this._batch('smoke', {
      capacity: 220, additive: false, renderOrder: 11, softness: 1.1,
      defines: [...soft, 'LIT'], litMix: 0.5,
    });
    this._batch('spark', {
      capacity: 700, additive: true, renderOrder: 14, softness: 0.25,
      defines: ['STRETCH'],
    });
    this._batch('ring', {
      capacity: 48, additive: true, renderOrder: 13, softness: 0.9,
      defines: ['PLANAR', 'SOFT'],
    });
  }

  _buildAmbient() {
    const R = this.rand;

    for (const key of Object.keys(AMBIENT)) {
      const def = AMBIENT[key];
      const additive = key === 'shimmer';
      const b = this._batch(def.batch, {
        capacity: def.capacity, additive, loop: true,
        renderOrder: additive ? 12 : 9,
        softness: additive ? 1.6 : 0.9,
        defines: additive ? ['LOOP', 'WRAP', 'SOFT'] : ['LOOP', 'WRAP', 'SOFT', 'LIT', 'SHAFTS'],
        litMix: key === 'sand_haze' ? 0.85 : TUNE.ambientLitMix,
      });
      b.material.uniforms.uBox.value.set(def.box[0], def.box[1], def.box[2]);
      b.material.uniforms.uFade.value.set(def.fade[0], def.fade[1], def.fade[2], def.fade[3]);
      b.def = def;
      b.yOffset = def.yOffset;

      const c0 = lin(def.col0, new THREE.Color());
      const c1 = lin(def.col1, new THREE.Color());
      for (let i = 0; i < def.capacity; i++) {
        const life = R.range(def.life[0], def.life[1]);
        const s = R.range(0.7, 1.35);
        b.aP0.array[i * 3 + 0] = R();
        b.aP0.array[i * 3 + 1] = R();
        b.aP0.array[i * 3 + 2] = R();
        // Per-particle drift on top of the shared wind: a field that all moves at exactly
        // the same speed reads as a texture scrolling, not as air.
        b.aV0.array[i * 3 + 0] = R.jitter(def.drift[1]);
        b.aV0.array[i * 3 + 1] = R.range(-def.drift[0], def.drift[1]) * 0.4;
        b.aV0.array[i * 3 + 2] = R.jitter(def.drift[1]);
        b.aTime.array[i * 4 + 0] = R.range(0, life);      // phase
        b.aTime.array[i * 4 + 1] = life;
        b.aTime.array[i * 4 + 2] = R();
        b.aTime.array[i * 4 + 3] = R.range(def.wind[0], def.wind[1]);
        b.aSize.array[i * 4 + 0] = def.size[0] * s;
        b.aSize.array[i * 4 + 1] = def.size[1] * s;
        b.aSize.array[i * 4 + 2] = def.sizeExp;
        b.aSize.array[i * 4 + 3] = R.range(def.spin[0], def.spin[1]);
        b.aDyn.array[i * 4 + 0] = 0;
        b.aDyn.array[i * 4 + 1] = 0;
        b.aDyn.array[i * 4 + 2] = def.turb;
        b.aDyn.array[i * 4 + 3] = R.range(def.alpha[0], def.alpha[1]);
        b.aShape.array[i * 4 + 0] = Array.isArray(def.tile) ? R.pick(def.tile) : def.tile;
        b.aShape.array[i * 4 + 1] = def.fadeIn;
        b.aShape.array[i * 4 + 2] = def.fadeOut;
        b.aShape.array[i * 4 + 3] = 0;
        const m = R.range(0.85, 1.15);
        b.aCol0.array[i * 3 + 0] = c0.r * m; b.aCol0.array[i * 3 + 1] = c0.g * m; b.aCol0.array[i * 3 + 2] = c0.b * m;
        b.aCol1.array[i * 3 + 0] = c1.r * m; b.aCol1.array[i * 3 + 1] = c1.g * m; b.aCol1.array[i * 3 + 2] = c1.b * m;
      }
      b._used = def.capacity;
      b._dirty = true;
      b._deathMax = Infinity;
    }

    /* Light-shaft motes: their own batch, positioned against LIGHTING's published shafts
       (or around torches when there are none) rather than in a camera box. */
    this.motes = this._batch('motes', {
      capacity: MOTES.capacity, additive: true, loop: true, renderOrder: 15, softness: 0.4,
      defines: ['LOOP', 'SOFT'],
    });
    this.motes._used = 0;
    this.motes._deathMax = Infinity;
    this._motesBuilt = -1;
  }

  _buildSparkles() {
    this.sparkles = new SparkleField(this.engine, TUNE.sparkleMax);
    this.root.add(this.sparkles.mesh);
    this._sparkleTimer = 0;
  }

  _wireEvents() {
    const engine = this.engine;
    const on = (evt, fn) => this._offs.push(engine.on(evt, fn));

    /* ANIMATION owns the authored timing of a footstep or a hit, so subscribe to it when it
       exists. MOVEMENT's own events are the fallback and cover everything else. */
    const anim = engine.get('animation');
    if (anim?.onEvent) {
      try {
        anim.onEvent('footstep', (e) => this._onFootstep(e?.surface, e?.foot));
        anim.onEvent('land', (e) => this._onLand(e?.force ?? 6, e?.pos));
        anim.onEvent('cane_hit', (e) => this._onCaneHit(e?.index ?? 1, e?.pos, e?.dir));
        this._animEvents = true;
      } catch (err) {
        engine.warn(`fx: animation.onEvent refused a subscription — ${err?.message || err}`);
      }
    }

    on('landed', (e) => this._onLand(e?.force ?? 6, e?.pos, e?.surface));
    on('caneHit', (e) => this._onCaneHit(e?.index ?? 1, e?.pos, e?.dir));
    on('caneSlam', (e) => this._onDiveImpact(e?.pos, e?.radius ?? 1.2));
    on('spireLand', (e) => this._onLand(4, e?.pos));
    on('wallRun', (e) => this._burstAt('footstep_stone', e?.pos, e?.normal));
    on('wallJump', (e) => this._burstAt('land_dust', e?.pos, UP, 0.5));
    on('doubleJump', (e) => this._burstAt('cane_arc', e?.pos, UP, 0.6));
    on('railMount', (e) => this._burstAt('footstep_metal', e?.pos, UP));
    on('poleMount', (e) => this._burstAt('footstep_stone', e?.pos, UP));
    on('pickpocket', (e) => this._burstAt('coin_pop', e?.pos, UP, 0.7));
    on('guardAlert', (e) => this._burstAt('guard_alert', e?.pos, UP));
    on('coin', (e) => this._burstAt('coin_pop', e?.pos, UP));
    on('thiefVision', (v) => { this._thiefTarget = v ? 1 : 0; });
    on('timeOfDay', () => { this._motesBuilt = -1; });
    on('shot', (e) => this._stageShot(e?.name));
    on('resize', () => this._resizeDepth());
    on('quality', () => this._resizeDepth());
  }

  /**
   * PROPS owns braziers and torches and calls `attach()` for them. Until it lands, the tomb
   * that the `interior` shot is named for has no fire in it at all, so seed the sconce
   * positions from the §8.1 coordinate contract. Removed the moment PROPS appears.
   */
  _seedOrphanTorches() {
    if (this.engine.has('props')) return;
    const P = [
      [-12.4, -9.5, -61], [12.4, -9.5, -61],
      [-12.4, -9.5, -69], [12.4, -9.5, -69],
      [-4.2, -9.9, -76.4], [4.2, -9.9, -76.4],
    ];
    this._orphans = [];
    for (const p of P) {
      _v1.set(p[0], p[1], p[2]);
      this._orphans.push(this.spawn('torch', { position: _v1 }));
    }
    this.engine.warn('fx: PROPS absent — seeded six tomb torch emitters at the §8.1 sconce ' +
                     'positions so the interior shot has fire in it. They yield to PROPS.');
  }

  /** The tapered gold arc off the cane's hook. Silent until the cane actually moves. */
  _attachCaneTrail() {
    const character = this.engine.get('character');
    const cane = character?.cane;
    if (!cane?.object) {
      if (!this._caneRetry) {
        this._caneRetry = true;
        this._offs.push(this.engine.on('characterReady', () => this._attachCaneTrail()));
      }
      return;
    }
    if (this._caneTrail) return;
    this._caneTrail = this.trail(cane.object, {
      offset: cane.hookPoint || new THREE.Vector3(0, 1.1, 0),
      segments: 20, width: 0.19, taper: 1.7, speedFor: 5.0,
      headColor: PAL.goldSpec, tailColor: PAL.goldMid,
    });
  }

  /* ================================================================= public API */

  /** One-shot burst of a named emitter at a world position. */
  burst(name, position, opts) {
    return this._emit(name, position, opts);
  }

  /** Continuous emitter at a fixed position. Returns a handle for `kill()`. */
  spawn(name, opts = {}) {
    const h = this._handle(name, opts);
    if (h) h.position.copy(opts.position || _v1.set(0, 0, 0));
    return h;
  }

  /** Continuous emitter that tracks an Object3D. PROPS calls this for braziers. */
  attach(name, object3d, opts = {}) {
    const h = this._handle(name, opts);
    if (h) h.object = object3d || null;
    return h;
  }

  kill(handle) {
    if (!handle) return;
    handle.alive = false;
    const i = this.emitters.indexOf(handle);
    if (i >= 0) {
      this.emitters.splice(i, 1);
      this._emitterPool.push(handle);
    }
    if (handle.trail) this.trails?.remove(handle.trail);
  }

  /** Projected decal. `normal` is the surface normal; the quad is offset along it. */
  decal(name, position, normal, opts) {
    return this.decals?.add(name, position, normal, opts) ?? null;
  }

  /** Ribbon trail following an object. Returns a handle for `kill()`. */
  trail(object3d, opts) {
    return this.trails?.add(object3d, opts) ?? null;
  }

  /** Emitter names in the catalogue — handy for the debug console. */
  names() { return Object.keys(EMITTERS); }

  _handle(name, opts) {
    const def = EMITTERS[name] || (name === 'torch' || name === 'brazier' ? null : undefined);
    if (def === undefined) {
      this.engine.warn(`fx: no emitter named "${name}"`);
      return null;
    }
    const h = this._emitterPool.pop() || {
      name: '', position: new THREE.Vector3(), object: null, alive: true,
      rate: 0, accum: 0, scale: 1, opts: null, kind: '', trail: null,
    };
    h.name = name;
    h.object = null;
    h.alive = true;
    h.accum = 0;
    h.scale = opts.scale ?? 1;
    h.opts = opts;
    h.kind = (name === 'torch' || name === 'brazier') ? 'fire' : 'single';
    h.rate = opts.rate ?? (h.kind === 'fire' ? 1 : 8);
    h.position.set(0, 0, 0);
    this.emitters.push(h);
    return h;
  }

  /* ================================================================= spawning */

  _burstAt(name, pos, normal, scale) {
    if (!pos) {
      const mv = this.engine.get('movement');
      pos = mv?.position;
    }
    if (!pos) return null;
    _v3.copy(pos);
    return this._emit(name, _v3, normal ? { dir: normal, scale } : { scale });
  }

  /**
   * Write one burst of instances. Everything here is typed-array writes — no objects are
   * created, so a hundred bursts a second cost nothing but bandwidth.
   */
  _emit(name, position, opts) {
    const def = EMITTERS[name];
    if (!def) { this.engine.warn(`fx: no emitter named "${name}"`); return null; }
    const batch = this.batches.get(def.batch);
    if (!batch || !position) return null;

    const R = this.rand;
    const t = this.engine.time;
    const density = this._density();
    const scale = (opts?.scale ?? 1);
    // Density scales the *count*, never the size: a low-end machine gets a thinner cloud,
    // not a smaller one.
    const countScale = (opts?.count ?? 1) * density;
    let n = Math.round(R.range(def.count[0], def.count[1] + 0.999) * countScale);
    n = Math.max(1, Math.min(n, batch.capacity));

    // Base direction: caller's normal, else up.
    if (opts?.dir) _dir.copy(opts.dir); else _dir.set(0, 1, 0);
    if (_dir.lengthSq() < 1e-8) _dir.set(0, 1, 0);
    _dir.normalize();
    // Tangent frame around the direction, for cone / disc sampling.
    _t1.copy(Math.abs(_dir.y) > 0.9 ? _v1.set(1, 0, 0) : _v1.set(0, 1, 0)).cross(_dir).normalize();
    _t2.copy(_dir).cross(_t1).normalize();

    const c0 = lin(opts?.color0 ?? def.col0, _col);
    const c0r = c0.r, c0g = c0.g, c0b = c0.b;
    lin(opts?.color1 ?? def.col1, _col);
    const c1r = _col.r, c1g = _col.g, c1b = _col.b;

    const life0 = def.life[0], life1 = def.life[1];
    const spd0 = def.speed ? def.speed[0] : 0, spd1 = def.speed ? def.speed[1] : 0;
    const speedScale = opts?.speed ?? 1;
    const alphaScale = opts?.alpha ?? 1;

    for (let i = 0; i < n; i++) {
      const life = R.range(life0, life1);
      const idx = batch.slot(t + life);
      const s = R.range(0.8, 1.25) * scale;

      /* direction */
      let dx, dy, dz;
      const mode = def.spread || 'cone';
      if (mode === 'sphere') {
        const z = R.range(-1, 1), a = R.range(0, 6.2832), r = Math.sqrt(Math.max(0, 1 - z * z));
        dx = Math.cos(a) * r; dy = z; dz = Math.sin(a) * r;
      } else if (mode === 'disc') {
        // Radial in the plane perpendicular to `dir`, with a small lift out of it: the shape
        // of dust leaving a footfall or sparks leaving a struck surface.
        const a = R.range(0, 6.2832);
        const lift = R.range(0, def.cone ?? 0.4);
        dx = (_t1.x * Math.cos(a) + _t2.x * Math.sin(a)) + _dir.x * lift;
        dy = (_t1.y * Math.cos(a) + _t2.y * Math.sin(a)) + _dir.y * lift;
        dz = (_t1.z * Math.cos(a) + _t2.z * Math.sin(a)) + _dir.z * lift;
      } else {
        const a = R.range(0, 6.2832);
        const th = R.range(0, def.cone ?? 0.5);
        const st = Math.sin(th), ct = Math.cos(th);
        dx = _dir.x * ct + (_t1.x * Math.cos(a) + _t2.x * Math.sin(a)) * st;
        dy = _dir.y * ct + (_t1.y * Math.cos(a) + _t2.y * Math.sin(a)) * st;
        dz = _dir.z * ct + (_t1.z * Math.cos(a) + _t2.z * Math.sin(a)) * st;
      }
      const inv = 1 / (Math.hypot(dx, dy, dz) || 1);
      dx *= inv; dy *= inv; dz *= inv;

      const jit = def.jitter ?? 0;
      const p = batch.aP0.array, v = batch.aV0.array;
      p[idx * 3 + 0] = position.x + (jit ? R.jitter(jit) : 0);
      p[idx * 3 + 1] = position.y + (jit ? R.jitter(jit) : 0);
      p[idx * 3 + 2] = position.z + (jit ? R.jitter(jit) : 0);

      if (def.batch === 'ring') {
        // PLANAR: aV0 is the plane normal, not a velocity.
        v[idx * 3 + 0] = _dir.x; v[idx * 3 + 1] = _dir.y; v[idx * 3 + 2] = _dir.z;
      } else {
        const sp = R.range(spd0, spd1) * speedScale;
        v[idx * 3 + 0] = dx * sp + (opts?.inherit ? opts.inherit.x : 0);
        v[idx * 3 + 1] = dy * sp + (opts?.inherit ? opts.inherit.y : 0);
        v[idx * 3 + 2] = dz * sp + (opts?.inherit ? opts.inherit.z : 0);
      }

      const at = batch.aTime.array;
      at[idx * 4 + 0] = t;
      at[idx * 4 + 1] = life;
      at[idx * 4 + 2] = R();
      at[idx * 4 + 3] = (def.wind ?? 0) * (0.6 + R() * 0.8);

      const az = batch.aSize.array;
      az[idx * 4 + 0] = def.size[0] * s;
      az[idx * 4 + 1] = def.size[1] * s;
      az[idx * 4 + 2] = def.sizeExp ?? 1;
      az[idx * 4 + 3] = def.spin ? R.range(def.spin[0], def.spin[1]) : 0;

      const ad = batch.aDyn.array;
      ad[idx * 4 + 0] = def.gravity ?? 0;
      ad[idx * 4 + 1] = def.drag ?? 0;
      ad[idx * 4 + 2] = def.turb ?? 0;
      ad[idx * 4 + 3] = R.range(def.alpha[0], def.alpha[1]) * alphaScale;

      const ash = batch.aShape.array;
      ash[idx * 4 + 0] = Array.isArray(def.tile) ? R.pick(def.tile) : def.tile;
      ash[idx * 4 + 1] = def.fadeIn ?? 0.1;
      ash[idx * 4 + 2] = def.fadeOut ?? 1.5;
      ash[idx * 4 + 3] = def.stretch ?? 0;

      const q0 = batch.aCol0.array, q1 = batch.aCol1.array;
      const m = R.range(0.88, 1.14);
      q0[idx * 3 + 0] = c0r * m; q0[idx * 3 + 1] = c0g * m; q0[idx * 3 + 2] = c0b * m;
      q1[idx * 3 + 0] = c1r * m; q1[idx * 3 + 1] = c1g * m; q1[idx * 3 + 2] = c1b * m;

      this.stats.spawned++;
    }
    return batch;
  }

  _density() {
    return THREE.MathUtils.clamp(this.engine.settings?.particles ?? 1, 0.2, 1.6);
  }

  /* ================================================ gameplay feedback handlers */

  _onFootstep(surface, foot) {
    const mv = this.engine.get('movement');
    const pos = mv?.position;
    if (!pos) return;
    const mat = surface || mv?.groundMaterial || 'stone';
    const name = mat === 'sand' ? 'footstep_sand'
      : mat === 'wood' ? 'footstep_wood'
      : mat === 'metal' ? 'footstep_metal'
      : 'footstep_stone';
    _v3.copy(pos);
    _v3.y += 0.04;
    // Offset to the foot that landed so the puffs alternate across the stride line.
    if (mv?.faceDir) {
      _v2.set(-mv.faceDir.z, 0, mv.faceDir.x).multiplyScalar(foot === 'l' ? -0.13 : 0.13);
      _v3.add(_v2);
    }
    this._emit(name, _v3, { dir: UP });
  }

  _onLand(force, pos, surface) {
    const mv = this.engine.get('movement');
    const p = pos || mv?.position;
    if (!p) return;
    const f = THREE.MathUtils.clamp(Math.abs(force) / 12, 0.25, 2.0);
    _v3.copy(p); _v3.y += 0.05;
    const mat = surface || mv?.groundMaterial || 'stone';
    this._emit('land_dust', _v3, { dir: UP, scale: 0.7 + f * 0.9, count: 0.6 + f * 0.7, speed: 0.7 + f * 0.6, color0: mat === 'sand' ? PAL.sandLight : PAL.limeLight });
    this._emit('land_ring', _v3, { dir: UP, scale: 0.6 + f * 0.8, alpha: 0.6 + f * 0.5 });
    if (f > 1.1) this.decal('scuff', _v3, UP, { size: 1.4 + f, life: 5 });
  }

  _onCaneHit(index, pos, dir) {
    const mv = this.engine.get('movement');
    const p = pos || mv?.position;
    if (!p) return;
    _v3.copy(p);
    if (!pos) _v3.y += 1.15;                       // chest height on the player's own position
    if (dir) _dir.copy(dir).normalize();
    else if (mv?.faceDir) _dir.copy(mv.faceDir).normalize();
    else _dir.set(0, 0, 1);
    if (!pos) _v3.addScaledVector(_dir, 0.95);

    const heavy = index >= 3 ? 1.35 : 1.0;
    this._emit('cane_flash', _v3, { scale: heavy });
    this._emit('cane_ring', _v3, { dir: _dir, scale: heavy });
    this._emit('cane_spark', _v3, { dir: _dir, scale: heavy, count: heavy });
    this._emit('cane_debris', _v3, { dir: _dir, scale: heavy });
  }

  _onDiveImpact(pos, radius) {
    const mv = this.engine.get('movement');
    const p = pos || mv?.position;
    if (!p) return;
    _v3.copy(p); _v3.y += 0.06;
    const s = (radius || 1.2) / 1.2;
    this._emit('dive_ring', _v3, { dir: UP, scale: s });
    this._emit('dive_dust', _v3, { dir: UP, scale: s });
    this._emit('dive_spark', _v3, { dir: UP, scale: s });
    this._emit('dive_debris', _v3, { dir: UP, scale: s });
    this.decal('crack', _v3, UP, { size: 2.2 * s, life: 14 });
    this.decal('scuff', _v3, UP, { size: 3.4 * s, life: 10, alpha: 0.5 });
  }

  /* ================================================================ shot staging */

  /**
   * The canonical shots are stills, so an impact frame has to be *posed* the way a fight
   * photographer poses one. `combat` fires the cane hit a beat before the capture; the
   * traversal frame gets the cane's gold arc. Everything else is ambient and needs nothing.
   */
  _stageShot(name) {
    const mv = this.engine.get('movement');
    if (name === 'combat') {
      _v3.set(0, 1.28, 2.05);
      if (mv?.position) { _v3.copy(mv.position); _v3.y += 1.28; }
      _dir.set(0.30, 0.10, 0.95).normalize();
      _v3.addScaledVector(_dir, 1.05);
      this._onCaneHit(3, _v3, _dir);
      this.decal('crack', _v1.copy(_v3).setY((mv?.position?.y ?? 0) + 0.02), UP, { size: 2.6, life: 30, alpha: 0.7 });
    } else if (name === 'traversal') {
      const p = mv?.position;
      if (p) {
        _v3.copy(p); _v3.y += 1.1;
        _dir.set(-0.7, 0.35, -0.6).normalize();
        this._emit('cane_arc', _v3, { dir: _dir, scale: 1.2 });
      }
    } else if (name === 'night' || name === 'guard') {
      const p = mv?.position;
      if (p) { _v3.copy(p); _v3.y += 0.9; this._emit('coin_sparkle', _v3, { count: 2 }); }
    }
  }

  /* ===================================================================== frame */

  update(dt, t) {
    const engine = this.engine;
    this._frame++;

    this._copyDepth();
    this._updateWind(t);
    this._updateGround();
    this._updateLightTints();
    this._updateShafts();
    this._updateAmbientBoxes();
    this._updateEmitters(dt, t);
    this._updateCrestWind(dt);
    this._deadReckonFootsteps(dt);
    this._updateSparkles(dt, t);

    const density = this._density();
    let live = 0;
    for (const b of this.batches.values()) {
      b.material.uniforms.uTime.value = t;
      b.material.uniforms.uSizeScale.value = 1;
      b.commit(t, b.looping ? density : 1);
      live += b.geometry.instanceCount;
    }
    this.stats.live = live;
    this.stats.batches = this.batches.size;

    this.decals?.update(dt, t);
    this.trails?.update(dt, t);
  }

  /* ---------------------------------------------------------------- depth copy */

  _resizeDepth() {
    if (!this.depthRT) return;
    const size = this.engine.renderer.getDrawingBufferSize(_size);
    this.depthRT.setSize(Math.max(2, size.x >> 1), Math.max(2, size.y >> 1));
  }

  _copyDepth() {
    const engine = this.engine;
    const renderer = engine.renderer;
    const size = renderer.getDrawingBufferSize(_size);
    this.shared.invRes.set(1 / Math.max(1, size.x), 1 / Math.max(1, size.y));
    if (this.depthRT && (this.depthRT.width !== (size.x >> 1) || this.depthRT.height !== (size.y >> 1))) {
      this._resizeDepth();
    }

    const postfx = engine.get('postfx');
    const src = postfx?.ok ? postfx.sceneRT?.depthTexture : null;
    if (!src || !this.depthRT) {
      if (!this._softWarned) {
        this._softWarned = true;
        this.soft = { available: false, reason: postfx ? 'postfx has no depth texture' : 'no postfx module' };
        engine.warn('fx: no scene depth texture available — particles fall back to hard edges ' +
                    'with a camera-facing near fade.');
      }
      return;
    }

    try {
      this.depthMat.uniforms.uSrc.value = src;
      this.depthMat.uniforms.uNearFar.value.set(engine.camera.near, engine.camera.far);
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.depthRT);
      renderer.render(this._depthScene, this._depthCam);
      renderer.setRenderTarget(prevTarget);
      if (!this._depthOK) {
        this._depthOK = true;
        this.soft = { available: true, reason: 'one-frame-late copy of postfx.sceneRT.depthTexture' };
      }
    } catch (err) {
      if (!this._softWarned) {
        this._softWarned = true;
        this.soft = { available: false, reason: `depth blit failed: ${err?.message || err}` };
        engine.warn(`fx: depth copy failed, soft particles disabled — ${err?.message || err}`);
      }
      this.shared.depth.value = null;
    }
  }

  /* --------------------------------------------------------------------- wind */

  /**
   * Gusting from two octaves of value noise, deliberately not a sine: a sine gives the sand
   * a metronome pulse that the eye reads as machinery within about four seconds.
   */
  _updateWind(t) {
    const slow = fbm2(t * TUNE.gustRate, 3.7, { octaves: 3, gain: 0.55, seed: 61 });
    const crack = valueNoise2(t * TUNE.crackRate, 11.3, 17);
    let g = 0.55 + slow * 0.62 + (crack - 0.5) * 0.45;
    // Sharpen the peaks so gusts arrive as fronts rather than as a smooth swell.
    g = g > 0 ? Math.pow(g, 1.35) : 0;
    this.gust = THREE.MathUtils.clamp(g, TUNE.gustLo, TUNE.gustHi);

    const swing = fbm2(t * 0.037, 21.0, { octaves: 2, seed: 13 }) * TUNE.windDirSwing;
    const a = THREE.MathUtils.degToRad(TUNE.windDirDeg) + swing;
    this.windDir.set(Math.sin(a), 0.06, Math.cos(a)).normalize();
    this.wind.copy(this.windDir).multiplyScalar(TUNE.windBase * this.gust);
  }

  /* ------------------------------------------------------------------ ground */

  /** Keep the low sand sheet on whatever floor the shot is actually about. */
  _updateGround() {
    const engine = this.engine;
    if (this._frame % TUNE.groundProbeEvery === 0) {
      const col = engine.get('collision');
      const cam = engine.camera;
      cam.getWorldPosition(_cam);
      cam.getWorldDirection(_fwd);
      let best = -Infinity;
      if (col?.groundCheck) {
        for (let i = 0; i < 2; i++) {
          _v1.copy(_cam).addScaledVector(_fwd, i * 15);
          _v1.y = _cam.y + 1.0;
          const g = col.groundCheck(_v1, 0.3, 45);
          if (g?.hit && Number.isFinite(g.y) && g.y < _cam.y - 0.3 && g.y > best) best = g.y;
        }
      }
      if (best === -Infinity) {
        const terrain = engine.get('terrain');
        if (terrain?.heightAt) {
          const h = terrain.heightAt(_cam.x, _cam.z);
          if (Number.isFinite(h)) best = h;
        }
      }
      if (best === -Infinity) best = 0;
      this._groundTarget = THREE.MathUtils.clamp(best, _cam.y - 30, _cam.y - 0.3);
    }
    this.groundY += (this._groundTarget - this.groundY) *
      Math.min(1, TUNE.groundLerp * Math.max(this.engine.dt, 1 / 240));
  }

  /* -------------------------------------------------------------- light tints */

  /** Dust is only convincing when it is the colour of the light falling on it (§7.3). */
  _updateLightTints() {
    const lighting = this.engine.get('lighting');
    const key = lighting?.keyLight;
    if (key) {
      const inten = THREE.MathUtils.clamp(key.intensity / 3.0, 0.16, 1.5);
      this.shared.lightTint.copy(key.color).multiplyScalar(0.55 + inten * 0.85);
    } else {
      lin(PAL.keySun, this.shared.lightTint);
    }
    if (lighting?.shadowTint) {
      this.shared.ambTint.copy(lighting.shadowTint).multiplyScalar(1.5).addScalar(0.25);
    } else {
      lin(PAL.shadow, this.shared.ambTint).multiplyScalar(1.5).addScalar(0.25);
    }
  }

  /* ------------------------------------------------------------------ shafts */

  _updateShafts() {
    const lighting = this.engine.get('lighting');
    const shafts = lighting?.shafts;
    const n = Math.min(MAX_SHAFTS, shafts?.length ?? 0);
    for (let i = 0; i < n; i++) {
      const s = shafts[i];
      if (!s?.origin || !s?.dir) continue;
      this.shared.shaftA[i].set(s.origin.x, s.origin.y, s.origin.z, (s.width ?? 1.8) * 0.5);
      this.shared.shaftB[i].set(s.dir.x, s.dir.y, s.dir.z, s.length ?? 14);
      const ax = s.axis || _v1.set(1, 0, 0);
      this.shared.shaftC[i].set(ax.x, ax.y, ax.z, s.intensity ?? 0);
    }
    const span = (shafts?.[0]?.span ?? 42) * 0.5;
    for (const b of this.batches.values()) {
      const u = b.material.uniforms;
      if (u.uShaftN) u.uShaftN.value = n;
      if (u.uShaftSpan) u.uShaftSpan.value = span;
    }

    // Motes are placed *inside* the blades, so they must be rebuilt when the blades move
    // (time of day) or when LIGHTING first publishes them.
    const sig = n * 1000 + Math.round((shafts?.[0]?.intensity ?? 0) * 100) +
                Math.round((shafts?.[0]?.length ?? 0) * 10) + (this._orphans?.length ?? 0);
    if (sig !== this._motesBuilt) {
      this._motesBuilt = sig;
      this._buildMotes(shafts, n);
    }
  }

  /** Distribute motes through the published shaft volumes (and around torches). */
  _buildMotes(shafts, n) {
    const b = this.motes;
    if (!b) return;
    const R = rng(0x903e5);
    const cap = b.capacity;
    const c0 = lin(MOTES.col0, new THREE.Color());
    const c1 = lin(MOTES.col1, new THREE.Color());
    const tc0 = lin(TORCH_MOTES.col0, new THREE.Color());
    const tc1 = lin(TORCH_MOTES.col1, new THREE.Color());
    const torches = this._orphans || [];
    const lit = n > 0 && (shafts[0]?.intensity ?? 0) > 0.02;
    const sources = (lit ? n : 0) + torches.length;
    if (sources === 0) { b._used = 0; b._dirty = true; return; }

    const span = (shafts?.[0]?.span ?? 42) * 0.5;
    for (let i = 0; i < cap; i++) {
      const src = i % sources;
      const life = R.range(MOTES.life[0], MOTES.life[1]);
      let x, y, z, tint0 = c0, tint1 = c1, alpha, size;

      if (lit && src < n) {
        const s = shafts[src];
        const along = R.range(-span * 0.92, span * 0.92);
        const down = R.range(0.04, 0.98) * (s.length ?? 14);
        const across = R.jitter((s.width ?? 1.8) * 0.55);
        const ax = s.axis || UP;
        x = s.origin.x + s.dir.x * down + ax.x * along + across * 0.6;
        y = s.origin.y + s.dir.y * down + ax.y * along;
        z = s.origin.z + s.dir.z * down + ax.z * along + across * 0.6;
        // Brightest near the top of the blade where the beam is tightest.
        const k = 1 - down / Math.max(1, s.length ?? 14);
        alpha = R.range(MOTES.alpha[0], MOTES.alpha[1]) * (0.45 + 0.75 * k) *
                THREE.MathUtils.clamp(s.intensity ?? 1, 0.2, 1.4);
        size = R.range(MOTES.size[0], MOTES.size[1]) * (0.8 + 0.5 * k);
      } else {
        const h = torches[(src - (lit ? n : 0) + torches.length) % torches.length];
        const p = h?.position || _v1.set(0, 0, 0);
        const a = R.range(0, 6.2832), rr = Math.sqrt(R()) * TORCH_MOTES.radius;
        x = p.x + Math.cos(a) * rr;
        y = p.y + R.range(-0.2, 1.9);
        z = p.z + Math.sin(a) * rr;
        alpha = R.range(TORCH_MOTES.alpha[0], TORCH_MOTES.alpha[1]);
        size = R.range(TORCH_MOTES.size[0], TORCH_MOTES.size[1]);
        tint0 = tc0;
        tint1 = tc1;
      }

      b.aP0.array[i * 3 + 0] = x; b.aP0.array[i * 3 + 1] = y; b.aP0.array[i * 3 + 2] = z;
      const d = MOTES.drift;
      b.aV0.array[i * 3 + 0] = R.jitter(d);
      b.aV0.array[i * 3 + 1] = R.range(-d * 0.35, d * 0.9);
      b.aV0.array[i * 3 + 2] = R.jitter(d);
      b.aTime.array[i * 4 + 0] = R.range(0, life);
      b.aTime.array[i * 4 + 1] = life;
      b.aTime.array[i * 4 + 2] = R();
      b.aTime.array[i * 4 + 3] = 0.12;
      b.aSize.array[i * 4 + 0] = size;
      b.aSize.array[i * 4 + 1] = size * 0.75;
      b.aSize.array[i * 4 + 2] = 1;
      b.aSize.array[i * 4 + 3] = 0;
      b.aDyn.array[i * 4 + 0] = 0;
      b.aDyn.array[i * 4 + 1] = 0;
      b.aDyn.array[i * 4 + 2] = 0.06;
      b.aDyn.array[i * 4 + 3] = alpha;
      b.aShape.array[i * 4 + 0] = R.pick(MOTES.tile);
      b.aShape.array[i * 4 + 1] = MOTES.fadeIn;
      b.aShape.array[i * 4 + 2] = MOTES.fadeOut;
      b.aShape.array[i * 4 + 3] = 0;
      b.aCol0.array[i * 3 + 0] = tint0.r; b.aCol0.array[i * 3 + 1] = tint0.g; b.aCol0.array[i * 3 + 2] = tint0.b;
      b.aCol1.array[i * 3 + 0] = tint1.r; b.aCol1.array[i * 3 + 1] = tint1.g; b.aCol1.array[i * 3 + 2] = tint1.b;
    }
    b._used = cap;
    b._dirty = true;
  }

  /* ---------------------------------------------------------- ambient boxes */

  _updateAmbientBoxes() {
    this.engine.camera.getWorldPosition(_cam);
    for (const b of this.batches.values()) {
      if (!b.def) continue;
      const box = b.material.uniforms.uBox.value;
      const o = b.material.uniforms.uBoxOrigin.value;
      const groundBound = b.def.box[1] < 6;      // low sheets track the floor, columns don't
      o.set(
        _cam.x - box.x * 0.5,
        groundBound ? this.groundY + b.yOffset - box.y * 0.5 : _cam.y + b.yOffset - box.y * 0.5,
        _cam.z - box.z * 0.5
      );
      // Shimmer only exists over hot sand in daylight.
      if (b.name === 'shimmer') {
        const l = this.engine.get('lighting');
        const day = THREE.MathUtils.clamp((l?.keyLight?.intensity ?? 2) / 2.4, 0, 1);
        b.material.uniforms.uOpacity.value = day * day;
      }
    }
  }

  /* -------------------------------------------------------------- emitters */

  _updateEmitters(dt, t) {
    if (this._orphans && this.engine.has('props')) {
      for (const h of this._orphans) this.kill(h);
      this._orphans = null;
      this._motesBuilt = -1;
    }
    const density = this._density();
    for (let i = 0; i < this.emitters.length; i++) {
      const h = this.emitters[i];
      if (!h.alive) continue;
      if (h.object) {
        h.object.getWorldPosition(h.position);
        if (h.opts?.offset) h.position.add(h.opts.offset);
      }
      h.accum += dt * h.rate * density;
      let guard = 0;
      while (h.accum >= 1 && guard++ < 6) {
        h.accum -= 1;
        if (h.kind === 'fire') {
          _v3.copy(h.position);
          this._emit('fire_core', _v3, { scale: h.scale });
          this._emit('ember', _v3, { scale: h.scale, dir: UP });
          _v3.y += 0.35 * h.scale;
          this._emit('torch_smoke', _v3, { scale: h.scale, dir: UP });
        } else {
          this._emit(h.name, h.position, h.opts);
        }
      }
    }
  }

  /* ------------------------------------------------------------ crest wind */

  /**
   * Sand tears off the *tops* of things. Probe a couple of rings of terrain around the
   * camera, keep the local maxima, and stream grains downwind off them.
   */
  _updateCrestWind(dt) {
    const terrain = this.engine.get('terrain');
    if (!terrain?.heightAt) return;
    this.engine.camera.getWorldPosition(_cam);

    if (this._frame % TUNE.crestProbeEvery === 0) {
      let c = 0;
      const wx = this.windDir.x, wz = this.windDir.z;
      for (let r = 0; r < TUNE.crestRings.length; r++) {
        const rad = TUNE.crestRings[r];
        for (let i = 0; i < TUNE.crestPerRing; i++) {
          const a = (i / TUNE.crestPerRing) * Math.PI * 2 + r * 0.35;
          const x = _cam.x + Math.cos(a) * rad;
          const z = _cam.z + Math.sin(a) * rad;
          const h = terrain.heightAt(x, z);
          if (!Number.isFinite(h)) continue;
          // Crest test: higher than the ground a few metres upwind and downwind.
          const up = terrain.heightAt(x - wx * 5, z - wz * 5);
          const dn = terrain.heightAt(x + wx * 5, z + wz * 5);
          if (!(h > up + 0.25 && h > dn + 0.45)) continue;
          const slot = this._crests[c++];
          slot.x = x; slot.y = h; slot.z = z; slot.w = Math.min(1, (h - dn) * 0.5); slot.live = true;
          if (c >= this._crests.length) break;
        }
      }
      this._crestCount = c;
    }

    if (!this._crestCount) return;
    this._crestAccum = (this._crestAccum || 0) +
      dt * TUNE.crestRate * this._crestCount * this.gust * this._density();
    let guard = 0;
    while (this._crestAccum >= 1 && guard++ < 8) {
      this._crestAccum -= 1;
      const s = this._crests[(this.rand() * this._crestCount) | 0];
      if (!s) continue;
      _v3.set(s.x, s.y + 0.25, s.z);
      _dir.copy(this.windDir).setY(0.35).normalize();
      this._emit('crest_stream', _v3, { dir: _dir, scale: 0.8 + s.w });
    }
  }

  /* ------------------------------------------------- footsteps without ANIMATION */

  /** ANIMATION owns footstep timing. Until it exists, dead-reckon from stride distance. */
  _deadReckonFootsteps(dt) {
    if (this._animEvents) return;
    const mv = this.engine.get('movement');
    if (!mv?.position) return;
    if (!this._havePrev) { this._prevPlayer.copy(mv.position); this._havePrev = true; return; }
    _v1.subVectors(mv.position, this._prevPlayer);
    this._prevPlayer.copy(mv.position);
    if (!mv.grounded) { this._strideAccum = TUNE.strideLength * 0.6; return; }
    _v1.y = 0;
    this._strideAccum += _v1.length();
    if (this._strideAccum >= TUNE.strideLength) {
      this._strideAccum -= TUNE.strideLength;
      this._foot = !this._foot;
      this._onFootstep(mv.groundMaterial, this._foot ? 'l' : 'r');
    }
  }

  /* ------------------------------------------------------------- sparkles */

  _updateSparkles(dt, t) {
    const engine = this.engine;
    const sp = this.sparkles;
    if (!sp) return;

    this._thief += (this._thiefTarget - this._thief) * Math.min(1, dt * 6);
    sp.material.uniforms.uTime.value = t;
    sp.material.uniforms.uThief.value = this._thief;

    const mv = engine.get('movement');
    const focus = mv?.position || (engine.camera.getWorldPosition(_cam), _cam);
    sp.material.uniforms.uPlayer.value.copy(focus);

    this._sparkleTimer -= dt;
    if (this._sparkleTimer > 0) return;
    this._sparkleTimer = TUNE.sparkleRefresh;

    const col = engine.get('collision');
    const list = col?.query ? col.query(focus, TUNE.sparkleRadius, TUNE.sparkleTags) : null;
    sp.begin();
    if (list && list.length) {
      for (let i = 0; i < list.length && i < sp.capacity; i++) {
        const e = list[i];
        if (!e?.point) continue;
        // A stable key per affordance so the marker keeps its phase between refreshes.
        const key = (e.rec?.mesh?.id ?? i) * 8191 + (e.tag ? e.tag.length : 0);
        const lift = e.tag === 'spire' ? 0.34 : e.tag === 'hook' ? 0.0 : 0.22;
        const scale = e.tag === 'spire' ? 1.25 : e.tag === 'hook' ? 1.15 : 1.0;
        sp.mark(e.point.x, e.point.y + lift, e.point.z, key, scale, t);
      }
    }
    sp.end();
  }

  /* =================================================================== teardown */

  dispose() {
    for (const off of this._offs) off?.();
    this._offs.length = 0;
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.sparkles?.dispose();
    this.decals?.dispose();
    this.trails?.dispose();
    this.atlas?.dispose();
    this.depthRT?.dispose();
    this.depthMat?.dispose();
    this._depthQuad?.geometry?.dispose();
    this.root.removeFromParent();
  }
}
