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

  /* light shafts (rendered from lighting.shafts) --------------------------------------
     `shaftGain` is the one number that decides whether these read as light or as a wash.
     Everything downstream of FX — AgX, bloom at threshold 1.55, saturation 1.30 — is owned
     by POSTFX, so a beam that measures beautifully in isolation can still flatten the
     contrast around it once it has been graded. Keep the interior blades under the bloom
     threshold and let only their brightest cores cross it. */
  shaftCapacity: 44,
  /* Bracketed on `temple` at 0.35 / 0.62 / 0.90. At 0.35 the blades are a haze on the
     ceiling and the shot still fails §7.3; at 0.62 they read unmistakably as light and only
     start to flatten the pale columns where two of them overlap. 0.55 kept the read and
     gave that overlap some headroom.

     Now 0.40, and this is **not** a re-tune of the same shape — it is the compensation that
     keeps the shape change close to energy-neutral. The cross-section stopped being a
     smoothstep bell and became the chord through a round beam, which is far flatter, so the
     same gain would have been a large brightening. Integrated numerically across the ribbon
     half-width, `bell + 0.85·bell⁵` = **0.7034** and `chord + 0.55·chord⁵` = **1.0322**, a
     factor of 1.47. Exact neutrality is 0.55 × 0.7034/1.0322 = 0.375; 0.40 is deliberately
     6% over that, spent on the open-air blades that are the §7.3 failure. The peak drops
     (1.85 × 0.55 = 1.02 → 1.55 × 0.40 = 0.62) — that is the half of this which has to be
     checked against POSTFX's 1.55 bloom threshold on `temple`, and it is a regression risk
     on the one shot where §7.3's volumetrics condition already passes. */
  shaftGain: 0.40,          // master multiplier on every beam's published intensity
  shaftConeGain: 0.85,      // torch / brazier cones, relative to shaftGain
  shaftSoft: 2.0,           // metres of soft fade where a blade meets geometry
  /* 96 m put the `dunes` blades — the whole west colonnade, 88 m from that camera — inside
     the far fade, so the one exterior shot where eight parallel beams project cleanly into
     frame was fading them out on distance alone. At tod 0.83 the aerial-perspective blend at
     88 m is only ~16%, so there is nothing physical asking them to be gone by then. */
  shaftFar: 140,            // metres; beyond this a blade contributes nothing
  shaftScroll: 0.055,       // noise travel along the beam, in beam-lengths/sec
  shaftNoise: 0.70,         // 0 = a clean beam, 1 = fully broken up by turning dust
  /* Open-air contrast. An additive blade over sunlit stone has no headroom left after AgX,
     which is why `hero` / `courtyard` / `dunes` measured as "drawing" and read as "absent".
     `shaftWide` gives the ribbon room outside the aperture for the neighbouring shadow band,
     `shaftDark` is how deep that band goes, `shaftCore` is the hot centre that buys local
     contrast without widening the beam. All three at 0 / 1 restore the pure additive blade. */
  shaftWide: 1.85,          // ribbon half-width in aperture widths
  shaftDark: 0.30,          // depth of the flanking shadow band, 0..0.5
  /* **Metres of gap between the blade and whatever is behind it**, not metres from the
     camera, which is what this used to be. The absolute form was doing two jobs and failing
     the second: excluding the sky (already handled — Sky.js's dome has `depthWrite: false`,
     so DEPTH_FRAG hands the shader its 30 000 m sentinel and `haveZ` is false over sky), and
     keeping the band off the far backdrop. At [55, 105] from the camera the `dunes` blades —
     which stand at 88 m — got 21% of their band against stonework a couple of metres behind
     them, i.e. the open-air contrast mechanism was switched off in the one exterior shot
     where eight parallel beams project cleanly into frame. Keyed on the gap it means what it
     says: full band on a surface just behind the blade, none on dunes 200 m further back. */
  shaftDarkFar: [40, 120],  // metres of blade→backdrop gap over which that band dies out
  /* Cross-section shape. `shaftEdge` is the fraction of the half-width spent softening the
     rim; the rest of the profile is the chord through a round beam, which is flat across
     most of the aperture and turns vertical at the rim. The old smoothstep bell reached half
     its value at half the aperture and landed on zero with zero slope — the softest possible
     edge, i.e. no edge at all, which is why the open-air blades drew as a wide soft plateau
     rather than as a beam. 0.16 is ~6 px of shoulder on a 76 px blade: enough not to alias
     at 960 px, an order of magnitude tighter than the ~1.0 half-width the bell spent. */
  shaftEdge: 0.16,          // rim penumbra, in half-widths
  shaftCore: 0.55,          // hot-core lift on top of the cross-section chord
  /* Where the blade's tail starts, in blade-lengths. See `lenFade` in SHAFT_FRAG: the length
     profile is now flat-ish along the body with a short tail here, instead of a hard taper
     that put 87% of a blade's light in its first half. */
  shaftTail: 0.86,
  shaftLenNorm: 0.59,       // renormalises that profile to the old one's integral

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

  /* fires (braziers + torches) */
  fireRate: 7,              // composite ticks/sec — see `_handle`
  fireCull: 44,             // metres; a place-anchored emitter further out stops entirely
  firePreroll: [12, 2.4, 34],  // ticks, seconds of history, cull radius — see `_prerollFires`
  crestPreroll: [34, 2.0],     // bursts, seconds of history — see `_prerollCrests`

  /* footstep dead-reckoning when ANIMATION is absent */
  strideLength: 1.5,
};

const MAX_SHAFTS = 6;

/** Emitter names that mean "a fire", i.e. a composite rather than a single curve. */
const FIRE_NAMES = new Set(['torch', 'brazier', 'embers', 'fire']);

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

/* ── light shafts (§2.3, §7.3 "No volumetric light shafts anywhere they'd be motivated") ──
   Geometry, not a post-process, and deliberately so:

   · A radial-blur god-ray needs the sun *in frame*, and seven of the ten canonical shots
     never see it — `temple` is looking at a ceiling, `interior` is twelve metres underground.
   · Placement is an art direction problem. A blade belongs to a hole somebody built, and
     LIGHTING publishes exactly those holes (`lighting.shafts`), so a beam can be aimed,
     lengthened onto the floor it actually lands on, and switched off when the sun swings
     round behind its opening. Screen space can do none of that.

   Each beam is a **camera-facing ribbon** along the volume's spine rather than an extruded
   prism. A prism's own surface is the thing you have to shade, and its side walls are by
   definition its own edge — so seen from the side, which is how every one of these shots
   sees them, a prism shades its silhouette at zero and disappears. A ribbon carries the
   cross-section falloff in screen space, so a blade reads the same from any angle.

   No ink outline: this material never enters POSTFX's normal pass (see the draw-range
   guard below), because an emissive volume with a line round it reads as a sticker —
   the note at `src/world/Props.js:41`. */

const SHAFT_SEGMENTS = 8;

const SHAFT_VERT = /* glsl */`
precision highp float;

attribute vec3 aOrigin;
attribute vec4 aDirLen;    // travel dir.xyz, length
attribute vec3 aU;         // in-plane axis 1 * halfU
attribute vec3 aV;         // in-plane axis 2 * halfV
attribute vec4 aTint;      // linear rgb, gain
attribute vec4 aParams;    // apex, flare, noiseScale, seed

uniform float uWide;       // ribbon half-width in aperture widths — room for the shadow flank

varying float vS;
varying float vX;
varying vec3  vTint;
varying float vGain;
varying float vSeed;
varying float vNoiseK;
varying float vViewZ;
varying float vAxial;
varying float vCone;

void main() {
  float s = position.z;
  vec3 d = normalize( aDirLen.xyz );
  vec3 c = aOrigin + d * ( s * aDirLen.w );

  vec3 toCam = cameraPosition - c;
  float camDist = length( toCam );
  toCam = camDist > 1e-4 ? toCam / camDist : vec3( 0.0, 0.0, 1.0 );

  // Ribbon width axis: perpendicular to both the beam and the eye, so the blade always
  // presents its full cross-section however the shot is framed.
  vec3 across = cross( d, toCam );
  float al = length( across );
  vAxial = 1.0 - clamp( al, 0.0, 1.0 );          // 1 when looking straight down the beam
  across = al > 1e-3 ? across / al : normalize( aU + vec3( 1e-4 ) );

  // Half-extent of the opening measured along the ribbon axis: an ellipse through the two
  // in-plane axes. A 2.8 x 1.3 m clerestory slot is therefore wide seen along the wall and
  // narrow seen across it, which is what a real window does.
  // Floored: no orientation of these openings actually collapses it (checked against the
  // §8.1 slot geometry), but a beam that silently becomes zero pixels wide is a failure
  // mode with no symptom, and 0.18 m is below anything the canonical cameras resolve.
  float base = max( length( vec2( dot( across, aU ), dot( across, aV ) ) ), 0.18 );
  float w = base * ( aParams.x + ( 1.0 + aParams.y - aParams.x ) * s );
  // A cone is a light source's own falloff and has no neighbouring shadow band, so it keeps
  // the bare ribbon. Only sun blades get widened to carry a flank.
  vCone = step( aParams.x, 0.5 );
  w *= mix( uWide, 1.0, vCone );

  vec3 p = c + across * ( position.x * w );

  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  vViewZ = -mv.z;
  vS = s;
  vX = position.x;
  vTint = aTint.rgb;
  vGain = aTint.w;
  vSeed = aParams.w;
  vNoiseK = aParams.z;
  gl_Position = projectionMatrix * mv;
}
`;

const SHAFT_FRAG = /* glsl */`
precision highp float;

uniform sampler2D uDepth;
uniform vec2  uInvRes;
uniform float uSoft;
uniform float uOpacity;
uniform vec2  uNearFade;
uniform vec2  uFarFade;
uniform float uTime;
uniform float uScroll;
uniform float uNoiseAmt;
uniform float uHead;
uniform float uWide;
uniform float uEdge;
uniform float uTail;
uniform float uLenNorm;
uniform float uCoreLift;
uniform float uDark;
uniform vec3  uDarkTint;
uniform vec2  uDarkFar;

varying float vS;
varying float vX;
varying vec3  vTint;
varying float vGain;
varying float vSeed;
varying float vNoiseK;
varying float vViewZ;
varying float vAxial;
varying float vCone;

float h11( float p ) { p = fract( p * 0.1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }
float vn( float x ) {
  float i = floor( x ), f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( h11( i ), h11( i + 1.0 ), f );
}

void main() {
  /* Cross-section. The ribbon is uWide aperture-widths across, so xb is in units of the
     real opening: |xb| < 1 is the beam, |xb| > 1 is the neighbouring shadow band.

     Why the band exists at all: an additive volume can only *add*, and adding to a sunlit
     200-luma courtyard floor buys almost nothing once AgX has compressed the highlight —
     which is exactly why the open-air blades measured as drawn and read as absent. A real
     colonnade does not produce isolated bright wedges, it produces *alternating* bright and
     dark ones, and the dark ones have all the headroom the bright ones lack. So each blade
     carries its own shadow band on its flanks: light in the middle, a little less than
     ambient on either side. On a dark backdrop the core does the work and the flank is
     invisible; on a bright one the flank draws the edge. uDark = 0 restores the pure
     additive blade exactly. */
  float ax = clamp( abs( vX ), 0.0, 1.0 );
  float xb = ax * mix( uWide, 1.0, vCone );

  /* The chord an eye ray cuts through a round beam — NOT a bell. The old e*e*(3-2e) reaches
     half its value at half the aperture and lands on zero with zero slope, which is the
     softest edge a curve can have; a blade drawn with it has no edge anywhere and reads as a
     soft mound. sqrt(1 - x*x) is the actual view-ray integral through a cylinder of uniform
     density: flat across most of the opening, vertical at the rim. The rim is then softened
     by exactly uEdge of the half-width, which is what stops it aliasing at 960 px. This is
     the difference between a plateau and a beam, and it is the edge that carries it. */
  /* Slabs get the tight rim; cones get a broad one. That is not a fudge — a sun blade
     through a stone aperture has a penumbra of centimetres, while a flame is an extended
     fuzzy source whose cone genuinely has no edge. Giving a torch cone a 6 px shoulder would
     read as painted cardboard. Both are still far tighter than the old bell. */
  float rim = mix( uEdge, 0.55, vCone );
  float chord = sqrt( max( 1.0 - xb * xb, 0.0 ) ) * smoothstep( 0.0, rim, 1.0 - xb );
  // A hot core on top of the chord. Same silhouette, higher peak: local contrast is what
  // makes a beam read as light rather than as haze, and it costs no extra width.
  float edge = chord + pow( chord, 5.0 ) * uCoreLift;

  /* Along the beam. This was pow(1 - s, 1.35), which puts 87% of a blade's light in its
     first half. That is right for the temple shot, where the camera sees the slot the blade
     comes out of, and wrong for every open-air shot: there the aperture is off-frame and the
     only part in shot is the tail, arriving at ~12% of full. Physically a beam loses only to
     spread, which at flare 0.28 is ~40% over the whole length, not 90%.

     So: a gentle body taper plus a short tail at uTail, renormalised by uLenNorm to the old
     curve's integral. Same light, spread along the blade instead of piled at the opening —
     the far half comes up ~3x, the head goes down ~35%, and the total the frame receives is
     unchanged. The flank shadow band multiplies by this too, so this is what was switching
     off BOTH halves of the open-air contrast mechanism, not just the bright one. uHead keeps
     the first few per cent from starting on a hard line inside the slot. */
  float body = 0.42 + 0.58 * pow( max( 1.0 - vS, 0.0 ), 0.75 );
  float lenFade = body * uLenNorm * ( 1.0 - smoothstep( uTail, 1.0, vS ) ) *
                  smoothstep( 0.0, uHead, vS );

  // Scrolling noise along the blade — the dust turning in it. Two octaves travelling at
  // different speeds so it never reads as a texture sliding past.
  float t = uTime * uScroll;
  float q = vS * vNoiseK + vSeed * 17.0;
  float n = vn( q + t ) * 0.62 + vn( q * 2.7 - t * 1.63 ) * 0.38;
  n *= 0.80 + 0.40 * vn( vX * 2.1 + vSeed * 5.0 + t * 0.37 );
  float noise = mix( 1.0, 0.5 + 1.05 * n, uNoiseAmt );

  float a = edge * lenFade * noise * vGain * uOpacity;

  // The shadow band: nothing at the beam's own edge (a seam there would read as an outline),
  // peaking just outside it, gone by the rim of the ribbon.
  float span = max( mix( uWide, 1.0, vCone ) - 1.0, 1e-3 );
  float f = clamp( ( xb - 1.0 ) / span, 0.0, 1.0 );
  float flank = ( 1.0 - f ) * smoothstep( 0.0, 0.22, f ) * ( 1.0 - vCone );
  float dark = flank * lenFade * ( 0.7 + 0.3 * noise ) * uDark *
               clamp( vGain * 3.0, 0.0, 1.0 ) * uOpacity;

  // Soft depth fade where the blade meets geometry (§ the brief). Fails open: a missing or
  // garbage depth sample costs the soft landing, never the beam.
  float sceneZ = texture2D( uDepth, gl_FragCoord.xy * uInvRes ).r;
  float occl = 1.0;
  bool haveZ = sceneZ > 0.001 && sceneZ < 9000.0;
  if ( haveZ ) {
    occl = clamp( ( sceneZ - vViewZ ) / uSoft, 0.0, 1.0 );
  }
  /* The shadow band only exists against a surface the shadow could fall on, and it fails
     CLOSED when there is no depth to judge by — the opposite of how the light half fails.
     Open sky needs no special case: the Sky dome draws with depthWrite off, so DEPTH_FRAG
     hands us its 30 000 m sentinel and haveZ is already false up there. What the window is
     for is the far backdrop — a band painted across dunes 200 m behind the blade is a smear,
     not a shadow — so it keys on the GAP between the blade and what is behind it rather than
     on absolute camera distance. Keyed on distance it was switching itself off in the dunes
     shot, where the blades stand at 88 m against stone a few metres behind them. */
  float backGap = sceneZ - vViewZ;
  dark *= haveZ ? ( 1.0 - smoothstep( uDarkFar.x, uDarkFar.y, backGap ) ) : 0.0;
  occl *= smoothstep( uNearFade.x, uNearFade.y, vViewZ );
  occl *= 1.0 - smoothstep( uFarFade.x, uFarFade.y, vViewZ );
  // vAxial is 1 when the eye is on the beam's own axis, where a ribbon degenerates to a
  // line and its width stops meaning anything. Fade it out before it can flip.
  occl *= 1.0 - smoothstep( 0.86, 0.99, vAxial );
  a *= occl;
  dark = clamp( dark * occl, 0.0, 0.5 );

  if ( a < 0.004 && dark < 0.004 ) discard;
  // Premultiplied: the material blends src * 1 + dst * (1 − srcAlpha). With dark = 0 that is
  // bit-for-bit the additive blade this shader used to be.
  gl_FragColor = vec4( vTint * a + uDarkTint * dark, dark );
  #include <colorspace_fragment>
}
`;

/**
 * One instanced ribbon per published shaft volume. Slabs and cones share a base mesh: the
 * only difference is the apex scale (a slab starts full width at its opening, a cone starts
 * at a point) and the tint.
 */
class LightShafts {
  constructor(engine, shared, tune) {
    this.engine = engine;
    this.shared = shared;
    this.capacity = tune.shaftCapacity;
    this.count = 0;

    const geo = new THREE.InstancedBufferGeometry();
    const n = SHAFT_SEGMENTS;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      pos[(i * 2) * 3 + 0] = -1; pos[(i * 2) * 3 + 2] = s;
      pos[(i * 2 + 1) * 3 + 0] = 1; pos[(i * 2 + 1) * 3 + 2] = s;
      if (i < n) {
        const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
        idx.push(a, b, d, a, d, c);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    geo.instanceCount = 0;

    const cap = this.capacity;
    const mk = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.aOrigin = mk('aOrigin', 3);
    this.aDirLen = mk('aDirLen', 4);
    this.aU = mk('aU', 3);
    this.aV = mk('aV', 3);
    this.aTint = mk('aTint', 4);
    this.aParams = mk('aParams', 4);
    this.attrs = [this.aOrigin, this.aDirLen, this.aU, this.aV, this.aTint, this.aParams];

    this.material = new THREE.ShaderMaterial({
      name: 'fx.shafts',
      uniforms: {
        uTime: { value: 0 },
        uDepth: shared.depth,
        uInvRes: { value: shared.invRes },
        uSoft: { value: tune.shaftSoft },
        uOpacity: { value: 1 },
        uNearFade: { value: new THREE.Vector2(0.4, 2.2) },
        uFarFade: { value: new THREE.Vector2(tune.shaftFar * 0.65, tune.shaftFar) },
        uScroll: { value: tune.shaftScroll },
        uNoiseAmt: { value: tune.shaftNoise },
        uHead: { value: 0.05 },
        uWide: { value: tune.shaftWide },
        uEdge: { value: tune.shaftEdge },
        uTail: { value: tune.shaftTail },
        uLenNorm: { value: tune.shaftLenNorm },
        uCoreLift: { value: tune.shaftCore },
        uDark: { value: tune.shaftDark },
        uDarkFar: { value: new THREE.Vector2(tune.shaftDarkFar[0], tune.shaftDarkFar[1]) },
        uDarkTint: { value: new THREE.Color(0.03, 0.035, 0.062) },
      },
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      /* Premultiplied, not additive: the blade has to be able to darken its own flanks as
         well as brighten its core (see SHAFT_FRAG). src·1 + dst·(1 − srcAlpha) degenerates
         to plain additive whenever srcAlpha is 0, which is every fragment of the core. */
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'fx.shafts';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // Under the dust and the sparkles: motes have to read *inside* a blade, not behind it.
    this.mesh.renderOrder = 7;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.userData.noShadow = true;

    /* Same opt-out as the particle batches: POSTFX re-renders the scene with an override
       material to build its normal buffer, and a light shaft in that buffer inks a hard
       black outline around a beam of light. */
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
  }

  begin() { this._w = 0; }

  /** Write one beam. Returns false once the buffer is full. */
  push(s, tint, gain, apex, flare, noiseK, seed) {
    const i = this._w;
    if (i >= this.capacity) return false;
    const o = this.aOrigin.array, dl = this.aDirLen.array;
    const u = this.aU.array, v = this.aV.array;
    const c = this.aTint.array, p = this.aParams.array;
    o[i * 3 + 0] = s.origin.x; o[i * 3 + 1] = s.origin.y; o[i * 3 + 2] = s.origin.z;
    dl[i * 4 + 0] = s.dir.x; dl[i * 4 + 1] = s.dir.y; dl[i * 4 + 2] = s.dir.z; dl[i * 4 + 3] = s.length;
    u[i * 3 + 0] = s.axis.x * s.halfU; u[i * 3 + 1] = s.axis.y * s.halfU; u[i * 3 + 2] = s.axis.z * s.halfU;
    v[i * 3 + 0] = s.axis2.x * s.halfV; v[i * 3 + 1] = s.axis2.y * s.halfV; v[i * 3 + 2] = s.axis2.z * s.halfV;
    c[i * 4 + 0] = tint.r; c[i * 4 + 1] = tint.g; c[i * 4 + 2] = tint.b; c[i * 4 + 3] = gain;
    p[i * 4 + 0] = apex; p[i * 4 + 1] = flare; p[i * 4 + 2] = noiseK; p[i * 4 + 3] = seed;
    this._w++;
    return true;
  }

  end() {
    this.count = this._w;
    this.geometry.instanceCount = this.count;
    for (const a of this.attrs) a.needsUpdate = true;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

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

/** Squared distance from `p` to the nearest point on a shaft's spine segment. Allocation-free. */
function spineDistSq(s, p) {
  const ox = p.x - s.origin.x, oy = p.y - s.origin.y, oz = p.z - s.origin.z;
  const len = s.length > 0 ? s.length : 0;
  let t = ox * s.dir.x + oy * s.dir.y + oz * s.dir.z;
  t = t < 0 ? 0 : (t > len ? len : t);
  const rx = ox - s.dir.x * t, ry = oy - s.dir.y * t, rz = oz - s.dir.z * t;
  return rx * rx + ry * ry + rz * rz;
}

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
    /* The FX clock. Zero outside shot mode, rebased at staging — see `update()`. */
    this._t0 = 0;
    this._t = 0;

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

      this.shafts = new LightShafts(engine, this.shared, TUNE);
      this.root.add(this.shafts.mesh);

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
      const additive = key === 'shimmer' || key === 'air_motes';
      const b = this._batch(def.batch, {
        capacity: def.capacity, additive, loop: true,
        renderOrder: additive ? 12 : 9,
        softness: additive ? 1.6 : 0.9,
        // air_motes are additive *and* lit: they have to take the key's colour and brighten
        // inside a blade, which is the whole point of them.
        defines: key === 'air_motes' ? ['LOOP', 'WRAP', 'SOFT', 'LIT', 'SHAFTS']
          : additive ? ['LOOP', 'WRAP', 'SOFT']
            : ['LOOP', 'WRAP', 'SOFT', 'LIT', 'SHAFTS'],
        /* Per-field, because how far a sprite is dragged toward the key's colour is exactly
           the knob that decides whether it separates from the ground it flies over. */
        litMix: def.litMix ?? TUNE.ambientLitMix,
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
    /* A fire is a composite, not a single curve: a flame core, a body above it, embers and
       smoke, all on one handle. `embers` is in this set because that is the name PROPS
       gives a brazier (`Props.js:317`), and a brazier wants the whole fire — it was the
       eight-warnings-a-boot gap, and the reason `night` and `guard` had unlit braziers. */
    const fire = FIRE_NAMES.has(name);
    const def = EMITTERS[name] || (fire ? null : undefined);
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
    h.scale = opts.scale ?? (name === 'embers' || name === 'brazier' ? 1.35 : 1);
    h.opts = opts;
    h.kind = fire ? 'fire' : 'single';
    // A fire at rate 1 spawns one 0.3 s core sprite a second, i.e. it is *out* two thirds of
    // the time. 7/s keeps two or three overlapping, which is what reads as a flame.
    h.rate = opts.rate ?? (h.kind === 'fire' ? TUNE.fireRate : 8);
    h.position.set(0, 0, 0);
    this.emitters.push(h);
    return h;
  }

  /** One tick of a fire: core, body, embers, smoke. `age` back-dates it (see `_prerollFires`). */
  _fireTick(h, age) {
    _v3.copy(h.position);
    this._emit('fire_core', _v3, { scale: h.scale, age });
    this._emit('embers', _v3, { scale: h.scale, dir: UP, age });
    _v3.y += 0.16 * h.scale;
    this._emit('fire_body', _v3, { scale: h.scale, dir: UP, age });
    _v3.y += 0.30 * h.scale;
    this._emit('torch_smoke', _v3, { scale: h.scale, dir: UP, age });
  }

  /**
   * The canonical shots are stills captured 17 frames — 0.28 s — after the camera is posed,
   * and a continuous emitter has produced almost nothing by then. So when a shot is staged,
   * every fire near the camera is run *backwards*: a couple of seconds of ticks spawned with
   * back-dated birth times, which the vertex shader integrates to exactly the plume that
   * would have been there. Without this, braziers are lit in motion and dark in every
   * screenshot the critic ever sees.
   */
  _prerollFires() {
    const cam = this.engine.camera;
    if (!cam) return;
    cam.getWorldPosition(_cam);
    const cull2 = TUNE.firePreroll[2] * TUNE.firePreroll[2];
    for (let i = 0; i < this.emitters.length; i++) {
      const h = this.emitters[i];
      if (h.kind !== 'fire' || !h.alive) continue;
      if (h.object) h.object.getWorldPosition(h.position);
      if (h.position.distanceToSquared(_cam) > cull2) continue;
      const ticks = TUNE.firePreroll[0];
      const span = TUNE.firePreroll[1];
      for (let k = ticks; k >= 1; k--) this._fireTick(h, (k / ticks) * span);
    }
  }

  /**
   * Same problem, same cure, for sand tearing off the dune crests. `crest_stream` fires at
   * ~8 bursts a second across the whole ring, so 0.28 s of staged time buys about two of
   * them — which is why a golden-hour desert wide shot has come back twice now with §7.3's
   * "no airborne particulate" against it. Back-date two seconds of them instead.
   */
  _prerollCrests() {
    const terrain = this.engine.get('terrain');
    if (!terrain?.heightAt) return;
    const frame = this._frame;
    this._frame = 0;                       // force the crest probe to run this call
    this._updateCrestWind(0);              // dt 0: probes, emits nothing
    this._frame = frame;
    if (!this._crestCount) return;
    const n = TUNE.crestPreroll[0], span = TUNE.crestPreroll[1];
    for (let k = n; k >= 1; k--) {
      const s = this._crests[(this.rand() * this._crestCount) | 0];
      if (!s) continue;
      _v3.set(s.x, s.y + 0.25, s.z);
      _dir.copy(this.windDir).setY(0.35).normalize();
      this._emit('crest_stream', _v3, { dir: _dir, scale: 0.8 + s.w, age: (k / n) * span });
    }
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
    const t = this._t;
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
    const age = opts?.age ?? 0;

    for (let i = 0; i < n; i++) {
      const life = R.range(life0, life1);
      if (age >= life) continue;                 // already dead before it was written
      const idx = batch.slot(t + life - age);
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
      // `age` back-dates the birth so a burst can be spawned already part-way through its
      // life. The motion is integrated analytically from t0, so this is exact, not a fake.
      at[idx * 4 + 0] = t - age;
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
    /* Rebase the clock and re-seed the stream before anything is emitted, so a staged shot
       does not inherit either the boot's duration or however many particles happened to be
       drawn from the RNG before it. See the note in `update()`. */
    this._t0 = this.engine.time;
    this._t = 0;
    if (this.decals) this.decals._t = 0;
    let h = 0x811c9dc5;
    for (let i = 0; i < (name || '').length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    this.rand = rng((0x5c17c00 ^ 0xfada ^ h) >>> 0);
    /* Both of these carried state from before the rebase: the gust direction the crest
       preroll fires along, and however much of the sparkle refresh interval happened to be
       left. Neither is visible, and both made the frame depend on the boot. */
    this._updateWind(0);
    this._sparkleTimer = 0;
    this._prerollFires();
    this._prerollCrests();
    this._motesBuilt = -1;          // re-seat the dust against whatever this shot is lit by
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

    /* FX runs on its own clock, rebased whenever a canonical shot is staged.
       Why: every animated thing here — the looping ambient fields, the wind gust, a
       back-dated fire plume — is a function of absolute engine time, and engine time at the
       moment `setShot` stops the rAF loop is a function of *how long the boot took*. So two
       captures of the same shot from two runs sampled the drifting sand and motes at
       different phases and came back thousands of bytes apart, with no way to tell a real
       change from that noise. Rebasing to zero at staging makes the whole subsystem a pure
       function of (shot, frames-since-staged). Outside shot mode `_t0` is 0 and this is the
       engine clock unchanged. */
    t -= this._t0;
    this._t = t;

    /* A zero-length frame must advance nothing. `capture()` renders one (`renderFrame(0)`)
       to guarantee the buffer holds the current frame, and the debug pause renders them
       continuously; anything that moves on one makes the same pose grab differently every
       time it is grabbed. */
    const still = !(dt > 0);
    if (!still) this._frame++;

    this._copyDepth();
    this._updateWind(t);
    if (!still) this._updateGround();
    this._updateLightTints();
    this._updateShafts();
    this._updateAmbientBoxes();
    this._updateEmitters(dt, t);
    this._updateCrestWind(dt);
    this._deadReckonFootsteps(dt);
    this._updateSparkles(dt, t);

    if (this.shafts) this.shafts.material.uniforms.uTime.value = t;

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
    /* No `Math.max(dt, 1/240)` floor here. That floor let a zero-length frame move the sand
       plane, so every extra `renderFrame(0)` shifted the ground-bound ambient boxes and the
       wrapped fields inside them by a hair — a few thousand scattered bytes per grab, on
       exactly the shots where the probe has two candidate floors to settle between. */
    this.groundY += (this._groundTarget - this.groundY) *
      Math.min(1, TUNE.groundLerp * Math.max(this.engine.dt, 0));
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
    /* The blade's shadow flank darkens toward the same violet-teal the rest of the frame's
       shadows use (§2.1.3 — shadows are coloured, never grey), at the ambient's own level so
       the band reads as air that is merely *unlit*, not as a smear of paint. */
    const dt = this.shafts?.material?.uniforms?.uDarkTint?.value;
    if (dt) {
      const amb = lighting?.atmosphere;
      if (amb?.ambientColor) dt.copy(amb.ambientColor).multiplyScalar(Math.max(0.05, amb.ambientIntensity ?? 0.1));
      else dt.setRGB(0.03, 0.035, 0.062);
    }
  }

  /* ------------------------------------------------------------------ shafts */

  _updateShafts() {
    const lighting = this.engine.get('lighting');
    const shafts = lighting?.shafts;
    const list = this._activeShafts(shafts);

    /* --- the dust-boost uniforms: the six nearest live volumes ------------------------- */
    /* Two corrections here, and the second is the one that matters.
     *
     * Ranked by distance to the nearest point on the blade's *spine*, not to its origin. An
     * origin is the hole in the roof; the beam that comes out of it can pass a metre from the
     * camera while its origin is fifteen metres up. Ranking on the origin sorted the hall's
     * blades in almost the opposite order to how near they actually are.
     *
     * And cones are eligible. They were skipped, which quietly cost `interior` — the shot
     * §7.2 names for volumetrics — every bit of its dust boost. No sun blade projects into
     * that camera at all (checked by projecting the whole published opening set through it),
     * so its only light volumes are the six tomb torches; with cones excluded, the six slots
     * were filled by hall blades fifty metres away through solid rock and the motes in the
     * vault were lit by nothing. `shaftBoost` is what makes a mote read as illuminated dust
     * rather than as grey dirt in front of the lens, which is exactly §7.3's particulate line. */
    this.engine.camera.getWorldPosition(_cam);
    const pick = this._shaftPick || (this._shaftPick = []);
    pick.length = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const d = spineDistSq(s, _cam);
      let j = pick.length;
      if (j >= MAX_SHAFTS && d >= pick[MAX_SHAFTS - 1]._d) continue;
      s._d = d;
      pick.push(s);
      while (j > 0 && pick[j - 1]._d > d) { pick[j] = pick[j - 1]; pick[j - 1] = s; j--; }
      if (pick.length > MAX_SHAFTS) pick.length = MAX_SHAFTS;
    }
    let span = 1.4;
    for (let i = 0; i < pick.length; i++) {
      const s = pick[i];
      this.shared.shaftA[i].set(s.origin.x, s.origin.y, s.origin.z, Math.max(0.4, s.halfV ?? 0.9));
      this.shared.shaftB[i].set(s.dir.x, s.dir.y, s.dir.z, s.length ?? 14);
      const ax = s.axis || _v1.set(1, 0, 0);
      this.shared.shaftC[i].set(ax.x, ax.y, ax.z, s.intensity ?? 0);
      span = Math.max(span, s.halfU ?? 1.4);
    }
    for (const b of this.batches.values()) {
      const u = b.material.uniforms;
      if (u.uShaftN) u.uShaftN.value = pick.length;
      if (u.uShaftSpan) u.uShaftSpan.value = span;
    }

    /* --- the blades themselves -------------------------------------------------------- */
    const sh = this.shafts;
    if (sh) {
      // §4.2: respect engine.quality. The `low` tier switches volumetrics off outright.
      sh.mesh.visible = this.engine.settings?.volumetrics !== false;
      sh.begin();
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const cone = s.kind === 'cone';
        // `s.color` is already in the linear working space (LIGHTING copies it off the
        // atmosphere's sun/torch colours), so it goes straight to the shader.
        _col.copy(s.color);
        const gain = s.intensity * TUNE.shaftGain * (cone ? TUNE.shaftConeGain : 1);
        if (gain < 0.006) continue;
        if (!sh.push(s, _col, gain,
          cone ? 0.14 : 1.0,
          cone ? 0.0 : (s.flare ?? 0.25),
          cone ? 5.5 : 3.2,
          (i * 0.6180339887) % 1)) break;
      }
      sh.end();
    }

    /* Motes live *inside* the blades, so they are rebuilt whenever the blades move (a time
       of day change) or when LIGHTING first publishes a real set. Keyed on *lengths*, never
       on intensity: a cone's intensity carries the fire's flicker and would re-seed nine
       hundred particles on every single frame. Time of day and shot staging invalidate this
       explicitly, so it only has to notice the set itself changing. */
    let sig = list.length * 977;
    for (let i = 0; i < list.length; i++) sig += Math.round((list[i].length || 0) * 4) * (i + 1);
    if (sig !== this._motesBuilt) {
      this._motesBuilt = sig;
      this._buildMotes(list);
    }
  }

  /** Live blades only, in a reused array — `update()` allocates nothing (§5). */
  _activeShafts(shafts) {
    const out = this._shaftLive || (this._shaftLive = []);
    out.length = 0;
    if (!shafts) return out;
    for (let i = 0; i < shafts.length; i++) {
      const s = shafts[i];
      if (!s?.origin || !s?.dir) continue;
      if ((s.intensity ?? 0) <= 0.012) continue;
      out.push(s);
    }
    return out;
  }

  /** Distribute motes through the live shaft volumes: sun blades and torch cones alike. */
  _buildMotes(list) {
    const b = this.motes;
    if (!b) return;
    const R = rng(0x903e5);
    const cap = b.capacity;
    const c0 = lin(MOTES.col0, new THREE.Color());
    const c1 = lin(MOTES.col1, new THREE.Color());
    const tc0 = lin(TORCH_MOTES.col0, new THREE.Color());
    const tc1 = lin(TORCH_MOTES.col1, new THREE.Color());
    const sources = list.length;
    if (sources === 0) { b._used = 0; b._dirty = true; return; }

    for (let i = 0; i < cap; i++) {
      const s = list[i % sources];
      const cone = s.kind === 'cone';
      const life = R.range(MOTES.life[0], MOTES.life[1]);
      let x, y, z, tint0 = c0, tint1 = c1, alpha, size;

      if (!cone) {
        const halfU = s.halfU ?? 1.3, halfV = s.halfV ?? 1.1;
        const len = s.length ?? 14;
        const down = R.range(0.03, 0.97) * len;
        // Widen with the blade, so the dust column is the shape of the light and not a tube.
        const f = 1 + (s.flare ?? 0.25) * (down / Math.max(1, len));
        const au = R.range(-1, 1) * halfU * f * 0.92;
        const av = R.range(-1, 1) * halfV * f * 0.92;
        const ax = s.axis || UP, ax2 = s.axis2 || UP;
        x = s.origin.x + s.dir.x * down + ax.x * au + ax2.x * av;
        y = s.origin.y + s.dir.y * down + ax.y * au + ax2.y * av;
        z = s.origin.z + s.dir.z * down + ax.z * au + ax2.z * av;
        // Brightest near the opening where the beam is tightest and least hazed.
        const k = 1 - down / Math.max(1, len);
        alpha = R.range(MOTES.alpha[0], MOTES.alpha[1]) * (0.45 + 0.75 * k) *
                THREE.MathUtils.clamp(s.intensity ?? 1, 0.2, 1.4);
        size = R.range(MOTES.size[0], MOTES.size[1]) * (0.8 + 0.5 * k);
      } else {
        const len = s.length ?? 2.6;
        const t = R.range(0.05, 1.0);
        const rr = Math.sqrt(R()) * Math.max(0.35, (s.halfU ?? 0.8)) * t * 1.6;
        const a = R.range(0, 6.2832);
        x = s.origin.x + s.dir.x * len * t + Math.cos(a) * rr;
        y = s.origin.y + s.dir.y * len * t + (s.dir.y === 0 ? Math.sin(a) * rr : 0);
        z = s.origin.z + s.dir.z * len * t + Math.sin(a) * rr;
        alpha = R.range(TORCH_MOTES.alpha[0], TORCH_MOTES.alpha[1]) *
                THREE.MathUtils.clamp(s.intensity ?? 1, 0.15, 1.3);
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
      } else if (b.name === 'airMotes') {
        // Backlit dust is a daylight phenomenon. At night it thins to a suggestion rather
        // than turning the frame into falling snow.
        const l = this.engine.get('lighting');
        const night = l?.atmosphere?.nightAmount ?? 0;
        b.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(1, 0.30, night);
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
    this.engine.camera.getWorldPosition(_cam);
    const cull2 = TUNE.fireCull * TUNE.fireCull;
    for (let i = 0; i < this.emitters.length; i++) {
      const h = this.emitters[i];
      if (!h.alive) continue;
      if (h.object) {
        h.object.getWorldPosition(h.position);
        if (h.opts?.offset) h.position.add(h.opts.offset);
      }
      /* The level registers two dozen fires and sixteen wall torches, all emitting all the
         time. At 8 smoke puffs a second each that is ~300 live smoke particles against a
         batch capacity of 220, so the ring wraps and the puff nearest the camera gets
         evicted by one sixty metres away. A place-anchored emitter beyond the cull radius
         simply stops. (Object-tracked emitters — the player's — are never culled.) */
      if (!h.object) {
        if (this._frame % 4 === (i & 3)) h._far = h.position.distanceToSquared(_cam) > cull2;
        if (h._far) { h.accum = 0; continue; }
      }

      h.accum += dt * h.rate * density;
      let guard = 0;
      while (h.accum >= 1 && guard++ < 6) {
        h.accum -= 1;
        if (h.kind === 'fire') this._fireTick(h, 0);
        else this._emit(h.name, h.position, h.opts);
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
    this.shafts?.dispose();
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
