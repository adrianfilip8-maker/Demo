import * as THREE from 'three';
import { makeRT, sizeRT, killRT, passMaterial, GLSL_VIEW, GLSL_NOISE } from './Common.js';

/**
 * Ground-truth ambient occlusion (GTAO), half resolution, with a separable depth-aware
 * bilateral blur.
 *
 * §7.3 fails a shot for "no ambient occlusion in crevices / where forms meet", and a
 * hemisphere-sampled SSAO of the SAO/HBAO family is not good enough for that line: it
 * darkens *everything* slightly instead of concentrating in the corners. GTAO integrates
 * the actual visible arc of the hemisphere per slice, so a flat wall reads as 1.0 and a
 * block-to-ground contact reads as a tight dark seam — which is the whole point.
 *
 * The occlusion is NEVER applied here. It is written as a scalar and consumed by the
 * composite, which applies it to the ambient term only and tints it toward the §2.2
 * shadow hue rather than toward grey.
 *
 * Maths follows three.js's own GTAOShader (Jimenez et al. 2016, "Practical Realtime
 * Strategies for Accurate Indirect Occlusion"), rewritten for GLSL ES 1.0 — the addon
 * version needs textureLod/texelFetch and therefore GLSL3, which the rest of my chain
 * does not want.
 */

const AO_FRAG = /* glsl */`
precision highp float;
precision highp sampler2D;

varying vec2 vUv;

uniform sampler2D uDepth;
uniform sampler2D uNormal;
uniform mat4 uProj;
uniform vec2 uNearFar;
uniform vec4 uParams;      // x radius(m)  y thickness(m)  z power  w distanceFalloff
uniform vec2 uFadeRange;   // start, end distance in metres — AO is a contact cue, not a fog

${GLSL_VIEW}
${GLSL_NOISE}

const float PI_AO = 3.141592653589793;

vec3 sceneViewPosAt( vec3 sampleViewPos, out float valid ) {
  vec4 clip = uProj * vec4( sampleViewPos, 1.0 );
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  // Off-screen taps must not fabricate a horizon, or the frame edges rim with fake AO.
  valid = ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) ? 0.0 : 1.0;
  float d = texture2D( uDepth, clamp( uv, 0.0, 1.0 ) ).x;
  if ( slyIsSky( d ) ) valid = 0.0;
  return slyViewPos( uv, d );
}

void main() {
  float depth = texture2D( uDepth, vUv ).x;
  if ( slyIsSky( depth ) ) { gl_FragColor = vec4( 1.0 ); return; }

  vec3 viewPos = slyViewPos( vUv, depth );
  float dist = length( viewPos );
  float fade = 1.0 - smoothstep( uFadeRange.x, uFadeRange.y, dist );
  if ( fade <= 0.001 ) { gl_FragColor = vec4( 1.0 ); return; }

  vec3 viewNormal = slyDecodeNormal( texture2D( uNormal, vUv ).xyz );
  vec3 viewDir = normalize( -viewPos );

  float radius = uParams.x;
  float thickness = uParams.y;

  /* Rotate the slice fan per pixel and jitter the step position. Static (interleaved
     gradient noise on the pixel coordinate), so a held frame is bit-identical — the
     bilateral blur below is what turns the interleaving back into a smooth field. */
  float rot = slyIGN( gl_FragCoord.xy ) ;
  float jitter = 0.5 + 0.5 * slyHash12( gl_FragCoord.xy + 17.3 );

  float ao = 0.0;

  for ( int i = 0; i < AO_DIRECTIONS; i ++ ) {
    float angle = ( float( i ) + rot ) / float( AO_DIRECTIONS ) * PI_AO;
    vec3 sampleDir = vec3( cos( angle ), sin( angle ), 0.0 );

    vec3 sliceBitangent = normalize( cross( sampleDir, viewDir ) );
    vec3 sliceTangent = cross( sliceBitangent, viewDir );
    vec3 normalInSlice = normalize( viewNormal - sliceBitangent * dot( viewNormal, sliceBitangent ) );
    vec3 tangentToNormal = cross( normalInSlice, sliceBitangent );

    vec2 cosHorizons = vec2( dot( viewDir, tangentToNormal ), dot( viewDir, -tangentToNormal ) );

    for ( int j = 0; j < AO_STEPS; j ++ ) {
      float f = ( float( j ) + jitter ) / float( AO_STEPS );
      vec3 off = sampleDir * radius * f * f;   // quadratic: dense near the pixel, where it matters

      float valid;
      vec3 hitA = sceneViewPosAt( viewPos + off, valid );
      vec3 dA = hitA - viewPos;
      if ( valid > 0.5 && abs( dA.z ) < thickness ) {
        float c = dot( viewDir, normalize( dA ) );
        cosHorizons.x += max( 0.0, ( c - cosHorizons.x ) * mix( 1.0, 2.0 / float( j + 2 ), uParams.w ) );
      }

      vec3 hitB = sceneViewPosAt( viewPos - off, valid );
      vec3 dB = hitB - viewPos;
      if ( valid > 0.5 && abs( dB.z ) < thickness ) {
        float c = dot( viewDir, normalize( dB ) );
        cosHorizons.y += max( 0.0, ( c - cosHorizons.y ) * mix( 1.0, 2.0 / float( j + 2 ), uParams.w ) );
      }
    }

    vec2 sinHorizons = sqrt( max( vec2( 0.0 ), 1.0 - cosHorizons * cosHorizons ) );
    float nx = dot( normalInSlice, sliceTangent );
    float ny = dot( normalInSlice, viewDir );
    float nxb = 0.5 * ( acos( clamp( cosHorizons.y, -1.0, 1.0 ) ) - acos( clamp( cosHorizons.x, -1.0, 1.0 ) )
                        + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y );
    float nyb = 0.5 * ( 2.0 - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y );
    ao += nx * nxb + ny * nyb;
  }

  ao = clamp( ao / float( AO_DIRECTIONS ), 0.0, 1.0 );
  ao = pow( ao, uParams.z );
  ao = mix( 1.0, ao, fade );

  // G carries linear depth so the blur can be bilateral without a second texture fetch.
  gl_FragColor = vec4( ao, dist / uNearFar.y, 0.0, 1.0 );
}
`;

const BLUR_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uStep;        // one texel along the blur axis
uniform float uSharpness;  // metres of depth difference that fully rejects a tap

void main() {
  vec2 c = texture2D( uAO, vUv ).rg;
  float z = c.g;
  float sum = c.r, wsum = 1.0;

  // 9-tap Gaussian, depth-gated. Radius 4 at half res == 8 px at full res, which is what
  // it takes to dissolve a 4x4 interleaved sampling pattern completely.
  for ( int i = 1; i <= 4; i ++ ) {
    float fi = float( i );
    float g = exp( -0.5 * ( fi * fi ) / 4.0 );
    vec2 o = uStep * fi;

    vec2 a = texture2D( uAO, vUv + o ).rg;
    float wa = g * max( 0.0, 1.0 - abs( a.g - z ) / uSharpness );
    sum += a.r * wa; wsum += wa;

    vec2 b = texture2D( uAO, vUv - o ).rg;
    float wb = g * max( 0.0, 1.0 - abs( b.g - z ) / uSharpness );
    sum += b.r * wb; wsum += wb;
  }

  gl_FragColor = vec4( sum / max( wsum, 1e-4 ), z, 0.0, 1.0 );
}
`;

const QUALITY = {
  low:   { dirs: 2, steps: 3 },
  med:   { dirs: 3, steps: 4 },
  high:  { dirs: 4, steps: 5 },
  ultra: { dirs: 5, steps: 6 },
};

export class AOPass {
  constructor(fx) {
    this.fx = fx;
    this.rt = null;
    this.rtB = null;
    this.mat = null;
    this.blurH = null;
    this.blurV = null;

    /** Tunables — named here so the critic loop can move the look without archaeology. */
    this.tune = {
      radius: 1.35,        // metres. Crevice-scale: this is a contact cue, not a GI approximation
      thickness: 1.1,      // metres of assumed occluder depth; stops thin rails over-occluding
      power: 1.55,         // >1 tightens AO into the corners instead of greying the whole surface
      distanceFalloff: 1.0,
      fade: [55, 110],     // metres — beyond this the haze owns the depth cue
      sharpness: 0.006,    // fraction of far plane; depth difference that rejects a blur tap
    };
  }

  async init() {
    const { engine } = this.fx;
    const q = QUALITY[engine.quality] || QUALITY.high;

    const u = {
      uDepth: this.fx.shared.uDepth,
      uNormal: this.fx.shared.uNormal,
      uProj: this.fx.shared.uProj,
      uProjInv: this.fx.shared.uProjInv,
      uNearFar: this.fx.shared.uNearFar,
      uParams: { value: new THREE.Vector4() },
      uFadeRange: { value: new THREE.Vector2() },
    };
    this.mat = passMaterial('postfx.gtao', u, AO_FRAG);
    this.mat.defines = { AO_DIRECTIONS: q.dirs, AO_STEPS: q.steps };
    this.u = u;

    const mk = (name) => {
      const m = passMaterial(name, {
        uAO: { value: null },
        uStep: { value: new THREE.Vector2() },
        uSharpness: { value: this.tune.sharpness },
      }, BLUR_FRAG);
      return m;
    };
    this.blurH = mk('postfx.gtao.blurH');
    this.blurV = mk('postfx.gtao.blurV');

    this.rt = makeRT(1, 1, { depth: false, name: 'postfx.ao' });
    this.rtB = makeRT(1, 1, { depth: false, name: 'postfx.ao.b' });
    this.setSize();
  }

  setSize() {
    const { hw, hh } = this.fx.size;
    sizeRT(this.rt, hw, hh);
    sizeRT(this.rtB, hw, hh);
    this.blurH.uniforms.uStep.value.set(1 / hw, 0);
    this.blurV.uniforms.uStep.value.set(0, 1 / hh);
  }

  /** @returns {THREE.Texture} the blurred AO (R = occlusion, G = normalised depth) */
  render() {
    const { renderer, blit } = this.fx;
    const t = this.tune;
    this.u.uParams.value.set(t.radius, t.thickness, t.power, t.distanceFalloff);
    this.u.uFadeRange.value.set(t.fade[0], t.fade[1]);
    this.blurH.uniforms.uSharpness.value = t.sharpness;
    this.blurV.uniforms.uSharpness.value = t.sharpness;

    blit.render(renderer, this.mat, this.rt);
    this.blurH.uniforms.uAO.value = this.rt.texture;
    blit.render(renderer, this.blurH, this.rtB);
    this.blurV.uniforms.uAO.value = this.rtB.texture;
    blit.render(renderer, this.blurV, this.rt);
    return this.rt.texture;
  }

  dispose() {
    killRT(this.rt); killRT(this.rtB);
    this.mat?.dispose(); this.blurH?.dispose(); this.blurV?.dispose();
  }
}
