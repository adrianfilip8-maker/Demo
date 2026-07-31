import * as THREE from 'three';
import { Blit, makeRT, sizeRT, killRT, passMaterial, GLSL_VIEW, GLSL_NOISE, GLSL_AGX, GLSL_SRGB } from './passes/Common.js';
import { AOPass } from './passes/AO.js';

/**
 * PostFX — owns the final image.
 *
 * Engine calls `render()` instead of doing a plain scene render, so if this throws the screen
 * goes black. Every stage is therefore wrapped: on any failure we drop the chain and present
 * the raw scene, and say so once in the warnings.
 *
 * Order: scene (HDR) → normals → AO → ink edges → bloom pyramid → composite (tonemap,
 * grade, vignette, grain) → FXAA.
 *
 * Tone mapping happens exactly once, in the composite, so the renderer's own tone mapping is
 * turned off for the scene pass — otherwise everything is transformed twice and washes out.
 */

const TUNE = {
  /* --- ink lines (AGENTS.md §2.1: the interior creases the hull shells can't give us) --- */
  edgeDepth: 1.05,        // depth discontinuity sensitivity, view-distance normalised
  edgeNormal: 0.62,       // normal discontinuity sensitivity (cos threshold)
  edgeThickness: 1.5,     // px, before the depth weighting below
  // §2.1.2 + §7.3: line weight must vary with depth. Near geometry inks at 1.8x the base
  // width, the far field at 0.7x, so a foreground corner reads heavier than a distant wall
  // instead of every edge in frame carrying the same hairline.
  edgeNearMul: 1.8,
  edgeFarMul: 0.70,
  edgeNearZ: 7,           // m — full weight closer than this
  edgeFarZ: 55,           // m — minimum weight beyond this
  edgeFadeStart: 45,      // m — lines thin out with distance so the far field isn't a black mess
  edgeFadeEnd: 190,
  inkWarm: 0x1a1210,      // §2.1: lit-side line colour, a warm near-black
  inkCool: 0x161022,      // shadow-side line colour, violet
  inkStrength: 0.85,      // was 0.60 — with the colour bug fixed the line can be a line

  /* --- bloom --- */
  bloomThreshold: 1.02,   // in HDR units; above 1 so only genuinely bright things bloom
  bloomKnee: 0.55,
  bloomIntensity: 0.62,
  bloomMips: 6,

  /* --- grade --- */
  // Was lifted to 1.45 to fight darkness that turned out to be the AO feedback bug below.
  // With that fixed the lift became a double correction and blew the stone out to white,
  // which is what AgX then desaturated into pale lavender.
  exposure: 0.95,
  contrast: 1.08,
  saturation: 1.30,                // AgX desaturates hard; the sandstone has to be pushed back
  lift: [0.006, 0.004, 0.010],     // open the toe just enough to keep shadow detail (§7.3)
  // Warm the highlights — but the blue leg was pulled to 0.95, which is a 5% cut on every
  // blue in the frame including the sky. The warm/cool split is meant to come from the
  // palette, not from throwing blue away globally.
  gain: [1.035, 1.0, 0.985],
  splitShadow: 0x2a3f66,           // §2.2 shadow hue
  splitHighlight: 0xffd9a0,        // §2.2 sun
  // 0.22 -> 0.16. The split is hue-only and correct in direction, but at 0.22 it pulled the
  // whole mid-tone range warm — and the daylight sky lives in the mid-tones, so it was
  // eating a measurable part of the zenith blue that §2.3's warm/cool tension depends on.
  splitStrength: 0.16,

  /* --- finishing --- */
  vignette: 0.16,                  // was compounding with dark shadows into a black frame
  chroma: 0.0016,         // edge-only chromatic aberration, in uv
  grain: 0.016,
};

/* ─────────────────────────────── shaders ─────────────────────────────── */

const EDGE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uDepth;
uniform sampler2D uNormal;
uniform vec2  uTexel;
uniform vec4  uParams;     // depthSens, normalSens, thickness, unused
uniform vec2  uFade;       // fadeStart, fadeEnd (metres)
uniform vec4  uWeight;     // nearMul, farMul, nearZ(m), farZ(m)
${GLSL_VIEW}

void main() {
  float d0 = texture2D( uDepth, vUv ).x;
  if ( slyIsSky( d0 ) ) { gl_FragColor = vec4( 0.0 ); return; }

  float z0 = slyLinearZ( d0 );

  // Line weight by depth. §7.3 fails a shot for "outlines uniform-thickness regardless of
  // depth", and this pass was sampling at one fixed pixel offset everywhere, so the near
  // obelisk corner and the far wall carried an identical hairline. A hand-inked frame gets
  // heavier on what is close: near geometry samples wider, distant geometry narrower.
  float weight = mix( uWeight.x, uWeight.y, smoothstep( uWeight.z, uWeight.w, z0 ) );
  vec2 o = uTexel * uParams.z * weight;

  // Roberts cross on depth, in metres and normalised by view distance: a 5 cm step matters
  // at 2 m and is invisible at 80 m, so a fixed threshold would either miss near creases or
  // outline every distant polygon.
  float dA = slyLinearZ( texture2D( uDepth, vUv + vec2(  o.x,  o.y ) ).x );
  float dB = slyLinearZ( texture2D( uDepth, vUv + vec2( -o.x, -o.y ) ).x );
  float dC = slyLinearZ( texture2D( uDepth, vUv + vec2(  o.x, -o.y ) ).x );
  float dD = slyLinearZ( texture2D( uDepth, vUv + vec2( -o.x,  o.y ) ).x );
  float dEdge = ( abs( dA - dB ) + abs( dC - dD ) ) / max( 0.35, z0 );
  // These thresholds were ~10x too sensitive: a 0.3% relative depth step fired a line, so
  // every course of masonry got inked and the architecture read as a circuit board. Creases
  // worth drawing are real steps in the form, not block joints the texture already shows.
  float depthLine = smoothstep( 0.030 * uParams.x, 0.075 * uParams.x, dEdge );

  // Normal discontinuity catches creases between coplanar-depth faces — a wall meeting a
  // wall at 90 degrees has almost no depth step at the corner but a hard normal step.
  vec3 n0 = slyDecodeNormal( texture2D( uNormal, vUv ).xyz );
  vec3 nA = slyDecodeNormal( texture2D( uNormal, vUv + vec2(  o.x,  o.y ) ).xyz );
  vec3 nB = slyDecodeNormal( texture2D( uNormal, vUv + vec2( -o.x, -o.y ) ).xyz );
  vec3 nC = slyDecodeNormal( texture2D( uNormal, vUv + vec2(  o.x, -o.y ) ).xyz );
  vec3 nD = slyDecodeNormal( texture2D( uNormal, vUv + vec2( -o.x,  o.y ) ).xyz );
  float nEdge = ( 1.0 - dot( nA, nB ) ) + ( 1.0 - dot( nC, nD ) );
  // Only genuine corners, not the chamfers and facets every block carries. 0.55 is roughly
  // a 60-degree fold; below that the shading already separates the surfaces.
  float normalLine = smoothstep( 0.55, 0.55 + ( 1.0 - uParams.y ) * 0.75, nEdge );

  // A normal step alone still fires on every masonry joint in a flat wall, which inked the
  // architecture into a circuit board. Require the normal fold to be corroborated by at
  // least a hint of depth step, so creases mark real folds in the form while the block
  // joints are left to the texture, which already draws them.
  float corroborate = smoothstep( 0.004, 0.020, dEdge );
  float line = max( depthLine, normalLine * corroborate );

  /* Keep only the near side of a silhouette.
   *
   * §2.1.2: an ink line is dark and *inside* the shape. A Roberts cross is symmetric, so
   * every depth step used to paint a band straddling the boundary — half of it landing on
   * whatever was *behind* the object. That outer half is the "halo outside the edge" the
   * critic saw: a smear of the foreground's line lying on the background, which is exactly
   * what a Photoshop edge filter does and an ink line never does.
   *
   * Where the 4-tap neighbourhood is nearly coplanar we are on an interior crease, not a
   * silhouette, and both sides should ink — so the gate is applied in proportion to how
   * much of a real depth step this is. */
  float zMin = min( min( dA, dB ), min( dC, dD ) );
  float zMax = max( max( dA, dB ), max( dC, dD ) );
  float span = zMax - zMin;
  float silhouette = smoothstep( 0.010, 0.060, span / max( 0.35, z0 ) );
  float side = ( z0 - zMin ) / max( 1e-5, span );          // 0 = nearest, 1 = furthest
  float nearSide = 1.0 - smoothstep( 0.30, 0.70, side );
  line *= mix( 1.0, nearSide, silhouette );

  // Thin the lines out with distance rather than cutting them, or the transition pops.
  line *= 1.0 - smoothstep( uFade.x, uFade.y, z0 );

  gl_FragColor = vec4( line, 0.0, 0.0, 1.0 );
}
`;

const BRIGHT_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uThreshold;   // threshold, knee
void main() {
  vec3 c = texture2D( uScene, vUv ).rgb;
  float l = max( c.r, max( c.g, c.b ) );
  // Soft knee, so a surface drifting past the threshold ramps in instead of snapping on.
  float k = uThreshold.y;
  float soft = clamp( l - uThreshold.x + k, 0.0, 2.0 * k );
  soft = soft * soft / ( 4.0 * k + 1e-5 );
  float w = max( soft, l - uThreshold.x ) / max( l, 1e-5 );
  gl_FragColor = vec4( c * w, 1.0 );
}
`;

/** 13-tap downsample (COD/Jimenez): stable under motion, no boxy pumping. */
const DOWN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec2 t = uTexel;
  vec3 a = texture2D( uSrc, vUv + t * vec2( -2.0, 2.0 ) ).rgb;
  vec3 b = texture2D( uSrc, vUv + t * vec2(  0.0, 2.0 ) ).rgb;
  vec3 c = texture2D( uSrc, vUv + t * vec2(  2.0, 2.0 ) ).rgb;
  vec3 d = texture2D( uSrc, vUv + t * vec2( -2.0, 0.0 ) ).rgb;
  vec3 e = texture2D( uSrc, vUv                        ).rgb;
  vec3 f = texture2D( uSrc, vUv + t * vec2(  2.0, 0.0 ) ).rgb;
  vec3 g = texture2D( uSrc, vUv + t * vec2( -2.0,-2.0 ) ).rgb;
  vec3 h = texture2D( uSrc, vUv + t * vec2(  0.0,-2.0 ) ).rgb;
  vec3 i = texture2D( uSrc, vUv + t * vec2(  2.0,-2.0 ) ).rgb;
  vec3 j = texture2D( uSrc, vUv + t * vec2( -1.0, 1.0 ) ).rgb;
  vec3 k = texture2D( uSrc, vUv + t * vec2(  1.0, 1.0 ) ).rgb;
  vec3 l = texture2D( uSrc, vUv + t * vec2( -1.0,-1.0 ) ).rgb;
  vec3 m = texture2D( uSrc, vUv + t * vec2(  1.0,-1.0 ) ).rgb;
  vec3 o = e * 0.125;
  o += ( a + c + g + i ) * 0.03125;
  o += ( b + d + f + h ) * 0.0625;
  o += ( j + k + l + m ) * 0.125;
  gl_FragColor = vec4( o, 1.0 );
}
`;

/** Tent-filter upsample, additive into the coarser mip. */
const UP_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 o = texture2D( uSrc, vUv + vec2( -t.x,  t.y ) ).rgb * 1.0;
  o += texture2D( uSrc, vUv + vec2(  0.0,  t.y ) ).rgb * 2.0;
  o += texture2D( uSrc, vUv + vec2(  t.x,  t.y ) ).rgb * 1.0;
  o += texture2D( uSrc, vUv + vec2( -t.x,  0.0 ) ).rgb * 2.0;
  o += texture2D( uSrc, vUv                      ).rgb * 4.0;
  o += texture2D( uSrc, vUv + vec2(  t.x,  0.0 ) ).rgb * 2.0;
  o += texture2D( uSrc, vUv + vec2( -t.x, -t.y ) ).rgb * 1.0;
  o += texture2D( uSrc, vUv + vec2(  0.0, -t.y ) ).rgb * 2.0;
  o += texture2D( uSrc, vUv + vec2(  t.x, -t.y ) ).rgb * 1.0;
  gl_FragColor = vec4( o / 16.0, 1.0 );
}
`;

const COMPOSITE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uEdge;
uniform sampler2D uAO;
uniform sampler2D uDepth;
uniform vec2  uTexel;
uniform float uTime;
uniform float uExposure, uContrast, uSaturation;
uniform float uBloomIntensity, uSplitStrength, uVignette, uChroma, uGrain;
uniform float uAOEnabled, uEdgeEnabled, uBloomEnabled, uInkStrength;
uniform vec3  uLift, uGain, uSplitShadow, uSplitHighlight, uInkWarm, uInkCool;
${GLSL_VIEW}
${GLSL_NOISE}
${GLSL_AGX}
${GLSL_SRGB}

const float SLY_PIVOT = 0.18;   // scene-linear middle grey; the contrast pivot

void main() {
  // Edge-only chromatic aberration: sampling the channels apart across the whole frame
  // reads as a broken display, but a touch at the corners reads as a lens.
  vec2 fromCentre = vUv - 0.5;
  float r2 = dot( fromCentre, fromCentre );
  vec2 ca = fromCentre * uChroma * r2 * 4.0;
  vec3 scene;
  scene.r = texture2D( uScene, vUv + ca ).r;
  scene.g = texture2D( uScene, vUv ).g;
  scene.b = texture2D( uScene, vUv - ca ).b;

  // AO, applied evenly and gently with a floor.
  //
  // This previously scaled occlusion by how *dark* the pixel already was, meaning shadowed
  // areas received maximum occlusion — a feedback loop straight to black that crushed the
  // bottom two-thirds of the frame and tripped §7.3's "shadows crush to zero detail".
  // Occlusion is a property of the geometry, not of the pixel's current brightness.
  if ( uAOEnabled > 0.5 ) {
    float ao = texture2D( uAO, vUv ).r;
    float occ = mix( 1.0, max( ao, 0.35 ), 0.7 );
    scene *= occ;
  }

  if ( uBloomEnabled > 0.5 ) {
    scene += texture2D( uBloom, vUv ).rgb * uBloomIntensity;
  }

  /* ---- grade, still in linear HDR ---- */
  vec3 c = scene * uExposure;
  c = max( vec3( 0.0 ), c + uLift * ( 1.0 - c ) );
  c *= uGain;

  // Split-tone toward the palette's complementary pair. Normalised so the tint shifts hue
  // without changing brightness — multiplying by a dark blue like #2a3f66 (as this did) both
  // darkened and desaturated the whole frame toward lavender, which is why the sandstone
  // stopped reading as warm stone.
  float l = slyLuma( c );
  vec3 tone = mix( uSplitShadow, uSplitHighlight, smoothstep( 0.08, 0.72, l ) );
  tone /= max( 1e-4, slyLuma( tone ) );      // hue only, unit luminance
  c = mix( c, c * tone, uSplitStrength );

  c = mix( vec3( l ), c, uSaturation );

  // Contrast about a mid-grey PIVOT, in log space — not (c - 0.5) * k + 0.5.
  //
  // This is still linear HDR, where 0.5 is not middle grey, so the old form was really a
  // flat −0.04 offset on every channel followed by a clamp. It silently amputated whole
  // channels out of anything dark: the §2.2 shadow hue #2a3f66 came out of the grade as
  // #00358c — red exactly zero — which is both "shadows crush to zero detail" and the
  // reason the night frames read as pure blue. A power about 0.18 is monotone, never
  // reaches zero, and leaves the hue alone.
  c = SLY_PIVOT * pow( max( c, vec3( 1e-6 ) ) / SLY_PIVOT, vec3( uContrast ) );

  /* ---- tonemap: exactly once, here. Exposure is already folded in above, so pass 1. ---- */
  c = slyAgX( c, 1.0 );
  // AgX returns linear sRGB. Nothing downstream encodes for us — a ShaderMaterial writing to
  // the canvas doesn't get three.js's output conversion — so do it here, once.
  c = slyLinearToSrgb( c );

  /* ---- ink lines ------------------------------------------------------------------
     Composited HERE, after slyAgX and after slyLinearToSrgb, so a line is a line and not
     something the tonemapper can bloom back open.

     Two rules this pass now obeys, and did not:

     1. The ink uniforms arrive already in DISPLAY space (see displayColor() in the module
        below). They used to be THREE.Color values, which colour management stores as
        *linear* — so mixing them into an image that had already been sRGB-encoded applied
        #1a1210 as if it were 0.010/0.006/0.005, i.e. effectively #030201. §2.1.2 says the
        lines are a warm brown and a dark violet and explicitly not pure black; §7.3 fails a
        shot for #000000 outlines. They were failing it.

     2. The contribution is strictly SUBTRACTIVE. Mixing toward a fixed colour brightens
        anything darker than that colour, which is how a night frame with crushed darks got
        drawn back in as glowing wireframe. A per-channel min() makes it arithmetically
        impossible for this pass to add light to any pixel, in any channel, ever.  */
  if ( uEdgeEnabled > 0.5 ) {
    float line = texture2D( uEdge, vUv ).r;
    float lum = slyLuma( c );
    // Don't ink what's already dark. A black line on a near-black surface adds nothing but
    // noise, and it was a large part of why the shadowed half of the frame turned to mush.
    line *= smoothstep( 0.05, 0.20, lum );
    // Warm ink where the surface is lit, violet ink where it's in shadow (§2.1).
    vec3 ink = min( mix( uInkCool, uInkWarm, smoothstep( 0.12, 0.55, lum ) ), c );
    c = mix( c, ink, clamp( line, 0.0, 1.0 ) * uInkStrength );
  }

  /* ---- finishing ---- */
  float vig = 1.0 - uVignette * smoothstep( 0.18, 0.95, r2 * 2.0 );
  c *= vig;

  // Dither in display space kills banding in the sky gradient, which is the one place an
  // 8-bit framebuffer visibly fails on a scene like this. Deliberately static per pixel,
  // not animated: the screenshot critic compares frames across commits and needs a still
  // frame to be bit-identical every time it renders.
  c += ( slyIGN( gl_FragCoord.xy ) - 0.5 ) * uGrain;

  gl_FragColor = vec4( c, 1.0 );
}
`;

const FXAA_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
float luma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }
void main() {
  vec3 rgbNW = texture2D( uSrc, vUv + vec2( -1.0, -1.0 ) * uTexel ).rgb;
  vec3 rgbNE = texture2D( uSrc, vUv + vec2(  1.0, -1.0 ) * uTexel ).rgb;
  vec3 rgbSW = texture2D( uSrc, vUv + vec2( -1.0,  1.0 ) * uTexel ).rgb;
  vec3 rgbSE = texture2D( uSrc, vUv + vec2(  1.0,  1.0 ) * uTexel ).rgb;
  vec3 rgbM  = texture2D( uSrc, vUv ).rgb;

  float lNW = luma( rgbNW ), lNE = luma( rgbNE );
  float lSW = luma( rgbSW ), lSE = luma( rgbSE ), lM = luma( rgbM );
  float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) );
  float lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );

  if ( lMax - lMin < 0.06 * lMax ) { gl_FragColor = vec4( rgbM, 1.0 ); return; }

  vec2 dir = vec2( -( ( lNW + lNE ) - ( lSW + lSE ) ), ( ( lNW + lSW ) - ( lNE + lSE ) ) );
  float dirReduce = max( ( lNW + lNE + lSW + lSE ) * 0.25 * 0.03125, 1.0 / 128.0 );
  float rcpDirMin = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + dirReduce );
  dir = clamp( dir * rcpDirMin, -8.0, 8.0 ) * uTexel;

  vec3 rgbA = 0.5 * ( texture2D( uSrc, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb
                    + texture2D( uSrc, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
  vec3 rgbB = rgbA * 0.5 + 0.25 * ( texture2D( uSrc, vUv - dir * 0.5 ).rgb
                                  + texture2D( uSrc, vUv + dir * 0.5 ).rgb );
  float lB = luma( rgbB );
  gl_FragColor = vec4( ( lB < lMin || lB > lMax ) ? rgbA : rgbB, 1.0 );
}
`;

/* ─────────────────────────────── module ─────────────────────────────── */

/**
 * A palette hex as raw 0..1 sRGB components — no linearisation.
 *
 * `new THREE.Color(0x1a1210)` does NOT give you 0x1a/255: colour management treats the hex
 * as sRGB and stores the *linear* equivalent, which is ~6x darker. That is exactly right for
 * anything multiplied into scene radiance and exactly wrong for anything mixed into an image
 * that has already been encoded for display — the ink lines, which land after the tonemap.
 * Getting this backwards turned every §2.1.2 ink colour into near-#000000.
 */
function displayColor(hex) {
  return new THREE.Color(
    ((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255
  );
}

export class PostFX {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.renderer = engine.renderer;
    this.blit = new Blit();
    this.tune = { ...TUNE };
    this.ok = false;
    this._complained = false;

    this.size = { w: 1, h: 1, hw: 1, hh: 1 };

    this.passes = {
      ao: { enabled: true }, edge: { enabled: true },
      bloom: { enabled: true }, grade: { enabled: true }, fxaa: { enabled: true },
    };

    /** Uniforms shared with sub-passes (AOPass reads these by reference). */
    this.shared = {
      uDepth: { value: null },
      uNormal: { value: null },
      uProj: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() },
      uNearFar: { value: new THREE.Vector2(0.1, 4000) },
    };

    this._rts = [];
    this._mats = [];
    engine.on('resize', () => this.setSize());
    engine.on('quality', () => this.setSize());
  }

  async init() {
    try {
      const { width: w, height: h } = this._pixelSize();
      const samples = this.engine.settings.msaa || 0;

      this.sceneRT = this._rt(makeRT(w, h, {
        type: THREE.HalfFloatType, depthTexture: true, samples, name: 'postfx.scene',
      }));
      this.normalRT = this._rt(makeRT(w, h, { depth: true, name: 'postfx.normal' }));
      this.edgeRT = this._rt(makeRT(w, h, { depth: false, name: 'postfx.edge' }));
      this.gradeRT = this._rt(makeRT(w, h, { depth: false, name: 'postfx.grade' }));

      // Bloom pyramid, half-res down. Six mips at 1080p bottoms out around 16 px, which is
      // wide enough for a convincing glow without the whole screen turning into a haze.
      this.bloomRTs = [];
      let bw = w >> 1, bh = h >> 1;
      for (let i = 0; i < this.tune.bloomMips; i++) {
        this.bloomRTs.push(this._rt(makeRT(Math.max(2, bw), Math.max(2, bh), { depth: false, name: `postfx.bloom${i}` })));
        bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      }

      this.edgeMat = this._mat(passMaterial('postfx.edge', {
        uDepth: this.shared.uDepth, uNormal: this.shared.uNormal,
        uProjInv: this.shared.uProjInv, uNearFar: this.shared.uNearFar,
        uTexel: { value: new THREE.Vector2() },
        uParams: { value: new THREE.Vector4() },
        uFade: { value: new THREE.Vector2() },
        uWeight: { value: new THREE.Vector4() },
      }, EDGE_FRAG));

      this.brightMat = this._mat(passMaterial('postfx.bright', {
        uScene: { value: null }, uThreshold: { value: new THREE.Vector2() },
      }, BRIGHT_FRAG));

      this.downMat = this._mat(passMaterial('postfx.down', {
        uSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
      }, DOWN_FRAG));

      this.upMat = this._mat(passMaterial('postfx.up', {
        uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 },
      }, UP_FRAG));
      this.upMat.blending = THREE.AdditiveBlending;

      this.compositeMat = this._mat(passMaterial('postfx.composite', {
        uScene: { value: null }, uBloom: { value: null }, uEdge: { value: null },
        uAO: { value: null }, uDepth: this.shared.uDepth,
        uProjInv: this.shared.uProjInv, uNearFar: this.shared.uNearFar,
        uTexel: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uExposure: { value: this.tune.exposure },
        uContrast: { value: this.tune.contrast },
        uSaturation: { value: this.tune.saturation },
        uBloomIntensity: { value: this.tune.bloomIntensity },
        uSplitStrength: { value: this.tune.splitStrength },
        uVignette: { value: this.tune.vignette },
        uChroma: { value: this.tune.chroma },
        uGrain: { value: this.tune.grain },
        uAOEnabled: { value: 1 }, uEdgeEnabled: { value: 1 }, uBloomEnabled: { value: 1 },
        uInkStrength: { value: this.tune.inkStrength },
        uLift: { value: new THREE.Vector3(...this.tune.lift) },
        uGain: { value: new THREE.Vector3(...this.tune.gain) },
        // Split-toning happens while the image is still linear, so these two stay linear.
        uSplitShadow: { value: new THREE.Color(this.tune.splitShadow) },
        uSplitHighlight: { value: new THREE.Color(this.tune.splitHighlight) },
        // The ink is mixed in AFTER slyLinearToSrgb, so it must be display-space.
        uInkWarm: { value: displayColor(this.tune.inkWarm) },
        uInkCool: { value: displayColor(this.tune.inkCool) },
      }, COMPOSITE_FRAG));

      this.fxaaMat = this._mat(passMaterial('postfx.fxaa', {
        uSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
      }, FXAA_FRAG));

      if (this.engine.settings.ssao) {
        this.ao = new AOPass(this);
        await this.ao.init();
      }

      // PostFX owns tone mapping from here on: the composite pass applies AgX exactly once.
      // Leaving the renderer's own tone mapping on would transform the image twice and wash
      // it out; toggling it per frame would recompile every shader every frame.
      this._prevToneMapping = this.renderer.toneMapping;
      this.renderer.toneMapping = THREE.NoToneMapping;

      this.setSize();
      this.ok = true;
    } catch (err) {
      this.engine.warn(`postfx: init failed, falling back to direct rendering — ${err?.message || err}`);
      console.error('[postfx] init failed', err);
      this.ok = false;
    }
  }

  _pixelSize() {
    const pr = this.renderer.getPixelRatio();
    return { width: Math.max(1, Math.round(this.engine.width * pr)), height: Math.max(1, Math.round(this.engine.height * pr)) };
  }

  _rt(rt) { this._rts.push(rt); return rt; }
  _mat(m) { this._mats.push(m); return m; }

  setSize() {
    if (!this.sceneRT) return;
    const { width: w, height: h } = this._pixelSize();
    this.size = { w, h, hw: Math.max(1, w >> 1), hh: Math.max(1, h >> 1) };

    sizeRT(this.sceneRT, w, h);
    sizeRT(this.normalRT, w, h);
    sizeRT(this.edgeRT, w, h);
    sizeRT(this.gradeRT, w, h);
    let bw = w >> 1, bh = h >> 1;
    for (const rt of this.bloomRTs) {
      sizeRT(rt, Math.max(2, bw), Math.max(2, bh));
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
    }

    const texel = new THREE.Vector2(1 / w, 1 / h);
    this.edgeMat.uniforms.uTexel.value.copy(texel);
    this.compositeMat.uniforms.uTexel.value.copy(texel);
    this.fxaaMat.uniforms.uTexel.value.copy(texel);
    this.ao?.setSize();
  }

  setEnabled(name, on) {
    if (this.passes[name]) this.passes[name].enabled = !!on;
  }

  update(dt, t) {
    if (!this.ok) return;
    this.compositeMat.uniforms.uTime.value = t;
  }

  /* ─────────────────────────── the frame ─────────────────────────── */

  render() {
    const { renderer, engine } = this;
    if (!this.ok) { renderer.setRenderTarget(null); renderer.render(engine.scene, engine.camera); return; }

    try {
      this._renderChain();
    } catch (err) {
      // A black screen is the worst possible failure, so degrade permanently and loudly-once.
      if (!this._complained) {
        this._complained = true;
        engine.warn(`postfx: render failed, falling back to direct rendering — ${err?.message || err}`);
        console.error('[postfx] render failed', err);
      }
      this.ok = false;
      // We took tone mapping off the renderer in init(); hand it back, or the direct-render
      // fallback presents an untonemapped image that reads as blown out and flat.
      renderer.toneMapping = this._prevToneMapping ?? THREE.AgXToneMapping;
      renderer.setRenderTarget(null);
      renderer.render(engine.scene, engine.camera);
    }
  }

  _renderChain() {
    const { renderer, engine, blit } = this;
    const cam = engine.camera;
    const scene = engine.scene;

    this.shared.uProj.value.copy(cam.projectionMatrix);
    this.shared.uProjInv.value.copy(cam.projectionMatrixInverse);
    this.shared.uNearFar.value.set(cam.near, cam.far);

    /* ---- 1. scene, linear HDR ----
       Tone mapping was disabled permanently in init(), not toggled per frame: flipping
       renderer.toneMapping mid-frame changes a shader define, which invalidates every
       cached program and recompiles the whole scene each frame. outputColorSpace is left
       alone entirely — when rendering to a target, three.js takes the encoding from the
       target texture's colorSpace, which makeRT already sets to NoColorSpace. */
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(scene, cam);

    this.shared.uDepth.value = this.sceneRT.depthTexture;

    /* ---- 2. view-space normals, for AO and for the crease pass ---- */
    const needNormals = (this.passes.edge.enabled || (this.ao && this.passes.ao.enabled));
    if (needNormals) {
      /* SHADING publishes beginNormalPass()/endNormalPass() precisely for this, and this
       * pass was reaching past them straight to `normalMaterial`.
       *
       * What that cost: the inverted-hull shells are children of their host meshes and stay
       * visible, so they were being drawn into the normal buffer too. `overrideMaterial`
       * replaces the shell's material outright — including its BackSide and its clip-space
       * expansion — so each shell rendered as a front-facing copy sitting exactly on top of
       * its host, z-fighting it, and left a ragged band of wrong normals around every
       * outlined silhouette. The crease pass then read that band as a normal discontinuity
       * and drew a line hugging the silhouette a second time, on top of the hull shell that
       * was already there. That is the doubling: shell + screen-space crease on the same
       * edge, which is what turns a 2.5 px line into a fat smear.
       *
       * begin/endNormalPass() hides the shells for the duration. Paired in try/finally so a
       * throw here can never leave every outline in the game switched off. */
      const shading = engine.get('shading');
      const canGate = typeof shading?.beginNormalPass === 'function'
        && typeof shading?.endNormalPass === 'function';
      const normalMat = (canGate ? shading.beginNormalPass() : shading?.normalMaterial)
        ?? this._fallbackNormalMat();
      const prevOverride = scene.overrideMaterial;
      const prevBg = scene.background;

      /* Freeze the shadow maps across this pass.
       *
       * three.js uses `scene.overrideMaterial` for shadow-map rendering as well as for the
       * main pass. Without this, the normal pass re-renders every cascade's shadow map using
       * MeshNormalMaterial, writing normal-encoded colour where depth should be. The
       * composite then samples those corrupted maps and the depth comparison fails
       * everywhere, which presents as the entire scene being in shadow — no cast shadows,
       * no key light, flat ambient-only lighting.
       *
       * The scene pass above has already produced correct maps this frame; this pass only
       * needs geometry, never shadows. */
      const prevShadowAuto = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;

      try {
        scene.overrideMaterial = normalMat;
        scene.background = null;
        renderer.setRenderTarget(this.normalRT);
        renderer.clear();
        renderer.render(scene, cam);
      } finally {
        scene.overrideMaterial = prevOverride;
        scene.background = prevBg;
        renderer.shadowMap.autoUpdate = prevShadowAuto;
        if (canGate) { try { shading.endNormalPass(); } catch { /* shells stay hidden at worst */ } }
      }
      this.shared.uNormal.value = this.normalRT.texture;
    }

    /* ---- 3. AO ---- */
    let aoTex = null;
    if (this.ao && this.passes.ao.enabled) aoTex = this.ao.render();

    /* ---- 4. ink creases ---- */
    if (this.passes.edge.enabled && needNormals) {
      const u = this.edgeMat.uniforms;
      u.uParams.value.set(this.tune.edgeDepth, this.tune.edgeNormal, this.tune.edgeThickness, 0);
      u.uFade.value.set(this.tune.edgeFadeStart, this.tune.edgeFadeEnd);
      u.uWeight.value.set(this.tune.edgeNearMul, this.tune.edgeFarMul,
        this.tune.edgeNearZ, this.tune.edgeFarZ);
      blit.render(renderer, this.edgeMat, this.edgeRT);
    }

    /* ---- 5. bloom pyramid ---- */
    if (this.passes.bloom.enabled && this.bloomRTs.length) {
      this.brightMat.uniforms.uScene.value = this.sceneRT.texture;
      this.brightMat.uniforms.uThreshold.value.set(this.tune.bloomThreshold, this.tune.bloomKnee);
      blit.render(renderer, this.brightMat, this.bloomRTs[0]);

      for (let i = 1; i < this.bloomRTs.length; i++) {
        const src = this.bloomRTs[i - 1];
        this.downMat.uniforms.uSrc.value = src.texture;
        this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        blit.render(renderer, this.downMat, this.bloomRTs[i]);
      }
      // Additive tent upsample back up the chain — accumulates a wide, smooth halo.
      for (let i = this.bloomRTs.length - 1; i > 0; i--) {
        const src = this.bloomRTs[i];
        this.upMat.uniforms.uSrc.value = src.texture;
        this.upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.upMat.uniforms.uRadius.value = 1.0;
        blit.render(renderer, this.upMat, this.bloomRTs[i - 1], false);
      }
    }

    /* ---- 6. composite: AO, bloom, grade, tonemap, ink, vignette, dither ---- */
    const cu = this.compositeMat.uniforms;
    cu.uScene.value = this.sceneRT.texture;
    cu.uBloom.value = this.bloomRTs[0]?.texture ?? null;
    cu.uEdge.value = this.edgeRT.texture;
    cu.uAO.value = aoTex;
    cu.uAOEnabled.value = aoTex && this.passes.ao.enabled ? 1 : 0;
    cu.uEdgeEnabled.value = this.passes.edge.enabled && needNormals ? 1 : 0;
    cu.uBloomEnabled.value = this.passes.bloom.enabled && this.bloomRTs.length ? 1 : 0;
    cu.uExposure.value = this.tune.exposure;
    cu.uContrast.value = this.passes.grade.enabled ? this.tune.contrast : 1;
    cu.uSaturation.value = this.passes.grade.enabled ? this.tune.saturation : 1;
    cu.uSplitStrength.value = this.passes.grade.enabled ? this.tune.splitStrength : 0;
    cu.uInkStrength.value = this.tune.inkStrength;
    cu.uBloomIntensity.value = this.tune.bloomIntensity;
    cu.uVignette.value = this.tune.vignette;
    cu.uChroma.value = this.tune.chroma;
    cu.uGrain.value = this.tune.grain;

    const last = this.passes.fxaa.enabled ? this.gradeRT : null;
    blit.render(renderer, this.compositeMat, last);

    /* ---- 7. FXAA, last so it antialiases the ink lines too ---- */
    if (this.passes.fxaa.enabled) {
      this.fxaaMat.uniforms.uSrc.value = this.gradeRT.texture;
      blit.render(renderer, this.fxaaMat, null);
    }

    renderer.setRenderTarget(null);
  }

  /** SHADING normally supplies this; stand one up if it hasn't loaded. */
  _fallbackNormalMat() {
    if (!this._normalFallback) {
      this._normalFallback = new THREE.MeshNormalMaterial({ name: 'postfx.normalFallback' });
      this._mats.push(this._normalFallback);
    }
    return this._normalFallback;
  }

  dispose() {
    if (this._prevToneMapping != null) this.renderer.toneMapping = this._prevToneMapping;
    for (const rt of this._rts) killRT(rt);
    for (const m of this._mats) m.dispose?.();
    this.ao?.dispose();
    this.blit.dispose();
    this._rts.length = 0;
    this._mats.length = 0;
  }
}
