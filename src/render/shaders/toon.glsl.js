/**
 * toon.glsl.js — the whole game's lighting model, as GLSL template strings.
 *
 * Why a set of injectable snippets rather than a standalone ShaderMaterial: everything here
 * is spliced into three.js's `meshphysical` program via `onBeforeCompile`. That buys us
 * shadow mapping, skinning, morph targets, instancing, batching, screen-space-derivative
 * tangents and the whole UV/channel plumbing for free — reimplementing any of that by hand
 * would be strictly worse and would break the moment three.js changes a chunk.
 *
 * What we *do* replace is the PBR accumulation, wholesale. Sly Cooper is not a PBR game.
 *
 * Coordinate trick worth knowing: no extra varyings are added to the vertex shader at all.
 * `vViewPosition` already exists in meshphysical, and the view matrix's 3x3 block is a pure
 * rotation, so its inverse is its transpose — which means world-space position and normals
 * can be reconstructed exactly in the fragment shader from `viewMatrix` + `cameraPosition`.
 * A stock vertex shader is a stock vertex shader: skinning and instancing cannot break.
 */

/* ---------------------------------------------------------------------------
   Shared: space reconstruction + the atmosphere model.
   Included by both the surface shader and the outline shell shader so a line
   and the surface it wraps agree on distance haze to the last decimal.
--------------------------------------------------------------------------- */
export const SLY_COMMON = /* glsl */ `
uniform vec3  uKeyDir;        // unit vector pointing TOWARD the key light (world space)
uniform vec3  uKeyColor;      // linear radiance of the key
uniform float uKeyIntensity;
uniform vec3  uSkyColor;      // fill from above  (sky bounce)
uniform vec3  uBounceColor;   // fill from below  (hot sand GI)
uniform float uAmbIntensity;
uniform vec3  uShadowColor;   // pre-scaled: shadow hue at uShadowFloor x key luminance
uniform float uShadowWash;
uniform vec2  uShadowSharp;
uniform vec3  uHaze;          // horizon haze colour
uniform vec3  uHazeSun;       // forward-scatter colour looking into the sun
uniform float uHazeGain;
uniform float uHazeDensity;
uniform float uHazeFalloff;   // 1 / height scale, metres^-1
uniform float uHazeBase;      // world y the density is quoted at
uniform float uHazeStart;     // metres of grace before haze bites
uniform float uTime;
uniform vec2  uRes;

/* view -> world for a direction. mat3(viewMatrix) is orthonormal, so transpose == inverse. */
vec3 slyToWorldDir( vec3 v ) {
	return vec3( dot( viewMatrix[ 0 ].xyz, v ), dot( viewMatrix[ 1 ].xyz, v ), dot( viewMatrix[ 2 ].xyz, v ) );
}

vec3 slyToViewDir( vec3 v ) {
	return mat3( viewMatrix ) * v;
}

/* Exact world position from the view-space position, no extra varying required. */
vec3 slyWorldPos( vec3 viewPos ) {
	return cameraPosition + slyToWorldDir( viewPos );
}

float slyLum( vec3 c ) {
	return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
}

/**
 * Analytic exponential *height* fog. Flat distance fog on a stylised desert reads as a grey
 * curtain; height fog keeps the sky-facing tops of pyramids clear while the valley floor
 * silts up, which is what actually sells scale.
 *
 * optical depth = integral of  d * exp( -(y - base) * falloff )  along the ray.
 */
float slyHaze( vec3 camPos, vec3 rd, float dist ) {
	float b = max( uHazeFalloff, 1e-5 );
	float dy = rd.y * b;
	float base = uHazeDensity * exp( - ( camPos.y - uHazeBase ) * b );
	float depth = ( abs( dy ) > 1e-4 )
		? base * ( 1.0 - exp( - dist * dy ) ) / dy
		: base * dist;
	float gate = smoothstep( uHazeStart, uHazeStart * 3.0 + 1.0, dist );
	return clamp( 1.0 - exp( - max( depth, 0.0 ) ), 0.0, 1.0 ) * gate;
}

/* Aerial perspective tint: cool haze away from the sun, hot flare into it. */
vec3 slyHazeColor( vec3 rd ) {
	float sunAmt = max( dot( rd, uKeyDir ), 0.0 );
	vec3 c = mix( uHaze, uHazeSun, pow( sunAmt, 3.0 ) * 0.8 );
	return c * uHazeGain;
}
`;

/* ---------------------------------------------------------------------------
   Surface shader: uniforms, ramp, triplanar detail, and the shading function.
   Spliced in immediately before `void main()`.
--------------------------------------------------------------------------- */
export const TOON_PARS = /* glsl */ `

#include <shadowmask_pars_fragment>

${SLY_COMMON}

uniform float uBands;
uniform float uTermLo;
uniform float uTermHi;
uniform float uTermSoft;
uniform float uShadowSat;
uniform float uDebugShadow;   // >0.5 → output shadow diagnostics instead of shading
uniform float uRim;
uniform vec3  uRimColor;
uniform float uRimPower;
uniform float uRimGain;
uniform float uSpec;
uniform vec3  uSpecColor;
uniform float uGloss;
uniform float uMetal;
uniform float uMetalGain;
uniform float uSss;
uniform vec3  uSssColor;
uniform float uAoStrength;
uniform float uHazeAmount;

/* One terminator of the ramp. k is its 0-based index; masked off above "steps". */
float slyTerm( float x, float k, float steps ) {
	float f = ( steps > 1.0 ) ? k / ( steps - 1.0 ) : 0.0;
	float t = mix( uTermLo, uTermHi, f );
	return step( k + 0.5, steps ) * smoothstep( t - uTermSoft, t + uTermSoft, x );
}

/**
 * The banded diffuse ramp. Terminators are spread between uTermLo and uTermHi rather than
 * evenly over 0..1: pushing the first one *past* zero drags the terminator onto the lit side,
 * which is what gives Sly's shading its chunky, graphic read. Unrolled — no dynamic loops.
 */
float slyRamp( float ndl, float bands ) {
	float steps = max( floor( bands + 0.5 ) - 1.0, 1.0 );
	float x = clamp( ndl, 0.0, 1.0 );
	float acc = slyTerm( x, 0.0, steps ) + slyTerm( x, 1.0, steps ) + slyTerm( x, 2.0, steps )
	          + slyTerm( x, 3.0, steps ) + slyTerm( x, 4.0, steps );
	return clamp( acc / steps, 0.0, 1.0 );
}

#ifdef SLY_DETAIL

	uniform sampler2D uDetailMap;   // rgb = tangent-space normal, a = albedo grain
	uniform float uDetailScale;
	uniform float uDetailStrength;
	uniform float uDetailGrain;
	uniform float uDetailFade;

	/* Blend weights from the world normal. High exponent = narrow transition bands, which
	   keeps the projection from smearing across a 45-degree batter on a pylon wall. */
	vec3 slyTriWeights( vec3 wn ) {
		vec3 b = abs( wn );
		b = pow( b, vec3( 6.0 ) );
		return b / max( b.x + b.y + b.z, 1e-4 );
	}

	/**
	 * Triplanar sample. Returns the world-space perturbed normal in xyz and the grain in w.
	 * Normals are combined with the Whiteout blend, which preserves detail contrast far
	 * better than lerping the decoded vectors.
	 */
	vec4 slyTriplanar( vec3 wp, vec3 wn, vec3 b, float scale ) {
		vec4 tx = texture2D( uDetailMap, wp.zy * scale );
		vec4 ty = texture2D( uDetailMap, wp.xz * scale );
		vec4 tz = texture2D( uDetailMap, wp.xy * scale );

		vec3 nx = tx.xyz * 2.0 - 1.0;
		vec3 ny = ty.xyz * 2.0 - 1.0;
		vec3 nz = tz.xyz * 2.0 - 1.0;

		nx.z *= sign( wn.x );
		ny.z *= sign( wn.y );
		nz.z *= sign( wn.z );

		vec3 wx = vec3( nx.xy + wn.zy, abs( nx.z ) * wn.x ).zyx;
		vec3 wy = vec3( ny.xy + wn.xz, abs( ny.z ) * wn.y ).xzy;
		vec3 wz = vec3( nz.xy + wn.xy, abs( nz.z ) * wn.z ).xyz;

		vec3 n = normalize( wx * b.x + wy * b.y + wz * b.z );
		float g = tx.w * b.x + ty.w * b.y + tz.w * b.z;
		return vec4( n, g );
	}

#endif
`;

/**
 * Injected right after three's normal-map resolution. Perturbs `normal` (view space) and
 * tints `diffuseColor` with the triplanar detail layer, so everything downstream — including
 * the specular lobe — sees the chiselled surface rather than a smooth proxy.
 */
export const TOON_DETAIL = /* glsl */ `
	vec3 slyViewPos = - vViewPosition;
	vec3 slyWP = slyWorldPos( slyViewPos );
	vec3 slyWN = normalize( slyToWorldDir( normal ) );
	float slyDist = length( slyViewPos );

	#ifdef SLY_DETAIL
	{
		/* Two octaves at incommensurable scales: one reads as chisel tooth, the wide one
		   breaks up the repeat so a 40 m wall never shows a tiling grid. */
		float fade = 1.0 - smoothstep( uDetailFade * 0.4, uDetailFade, slyDist );
		if ( fade > 0.001 ) {
			vec3 b = slyTriWeights( slyWN );
			vec4 d0 = slyTriplanar( slyWP, slyWN, b, uDetailScale );
			#ifdef SLY_DETAIL2
				vec4 d1 = slyTriplanar( slyWP + vec3( 37.7, 11.3, 91.1 ), slyWN, b, uDetailScale * 0.137 );
			#else
				vec4 d1 = vec4( slyWN, 0.5 );
			#endif

			float amt = uDetailStrength * fade;
			vec3 delta = ( d0.xyz - slyWN ) + ( d1.xyz - slyWN ) * 0.55;
			normal = normalize( normal + slyToViewDir( delta ) * amt );
			slyWN = normalize( slyToWorldDir( normal ) );

			/* Grain modulates albedo multiplicatively and stays centred on 1.0 so the
			   art-directed base colour is never pushed off palette. */
			float g = mix( d0.w, d0.w * ( 0.55 + 0.9 * d1.w ), 0.6 );
			float k = uDetailGrain * fade;
			diffuseColor.rgb *= mix( 1.0, 0.62 + 0.80 * g, k );
		}
	}
	#endif
`;

/**
 * Replaces `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;`.
 * Everything above this point in meshphysical still ran (albedo, alpha, normal maps,
 * roughness, emissive) — the PBR accumulation itself was stripped out.
 */
export const TOON_SHADE = /* glsl */ `
	vec3 outgoingLight;
	{
		vec3 N = normalize( normal );
		vec3 V = normalize( vViewPosition );
		vec3 Nw = slyWN;
		vec3 L = uKeyDir;

		float ndl = dot( Nw, L );
		float ndv = clamp( dot( N, V ), 0.0, 1.0 );

		/* Shadow map, hardened but not binary: a sliver of penumbra keeps contact shadows
		   from stair-stepping.

		   Must go through LIGHTING's csmShadow(), not getShadowMask(). getShadowMask()
		   *multiplies* every directional shadow together, but cascaded shadow maps require
		   selecting exactly one cascade per fragment: the cascade ortho boxes nest, so a near
		   fragment also lands inside the coarse far cascade, whose depth test fails, and the
		   product goes to zero. The whole scene reported as fully shadowed — key light
		   cancelled everywhere, which read as flat ambient-only lighting with no cast shadows
		   at all. csmShadow() picks the cascade by view depth and blends across the split.

		   LIGHTING injects csmShadow() and #define CSM_CASCADES into this material (its
		   onBeforeCompile runs after ours), so guard for the un-patched case. */
		#if defined( CSM_CASCADES ) && defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
			float shadowRaw = csmShadow( vViewPosition.z );
		#else
			float shadowRaw = getShadowMask();
		#endif
		float sh = smoothstep( uShadowSharp.x, uShadowSharp.y, shadowRaw );

		float ramp = slyRamp( ndl, uBands );
		float key = ramp * sh;

		/* AO is an *ambient* occlusion term. Letting it touch the key light is the classic
		   way to make a cel-shaded surface look like dirty PBR. */
		float ao = 1.0;
		#ifdef USE_AOMAP
			ao = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
		#endif
		ao = mix( 1.0, ao, uAoStrength );

		vec3 alb = diffuseColor.rgb;
		float lumA = slyLum( alb );

		/* Saturation goes UP in shadow, not down. Desaturated shadow is what makes cheap
		   cel shading look muddy; real ink-and-paint art pushes the hue instead. */
		vec3 albShadow = clamp( mix( vec3( lumA ), alb, 1.0 + uShadowSat ), 0.0, 1.0 );

		vec3 keyRad = uKeyColor * uKeyIntensity;

		/* Hemispheric fill: cool sky above, hot sand bounce below. */
		float hemi = 0.5 + 0.5 * Nw.y;
		vec3 fill = mix( uBounceColor, uSkyColor, hemi ) * uAmbIntensity;

		float shadowMix = 1.0 - key;

		/* Coloured, transparent shadow. The multiplied term keeps albedo detail readable
		   inside the shadow; the small additive wash keeps the *hue* alive, because a warm
		   sandstone albedo multiplied by a violet light neutralises to grey otherwise. */
		vec3 diff = alb * keyRad * key
		          + alb * fill * ao
		          + albShadow * uShadowColor * shadowMix * mix( 0.55, 1.0, ao )
		          + uShadowColor * uShadowWash * shadowMix * ao;

		/* Metals have almost no diffuse; that plus a hot lobe is what reads as gold. */
		diff *= mix( 1.0, 0.20, uMetal );

		/* Wrap-around subsurface. Peaks exactly at the terminator and decays into the dark
		   side — this is the difference between fur and painted plastic. */
		float wrapv = clamp( ( ndl + uSss ) / ( 1.0 + uSss ), 0.0, 1.0 );
		float sssAmt = clamp( wrapv - clamp( ndl, 0.0, 1.0 ), 0.0, 1.0 );
		vec3 sss = alb * uSssColor * keyRad * ( sssAmt * uSss * 2.4 * sh );

		/* Hard-stepped Blinn-Phong. Threshold on the lobe, not on N.H, so the highlight is
		   a crisp shape whose size tracks gloss instead of a soft blob. */
		float rgh = clamp( roughnessFactor, 0.03, 1.0 );
		vec3 Lv = slyToViewDir( L );
		vec3 H = normalize( Lv + V );
		float ndh = clamp( dot( N, H ), 0.0, 1.0 );
		float glossP = max( uGloss * ( 1.0 - 0.6 * rgh ), 4.0 );
		float lobe = pow( ndh, glossP );
		float specStep = smoothstep( 0.30, 0.52, lobe ) + 0.35 * smoothstep( 0.02, 0.30, lobe );
		float specAmt = uSpec * ( 1.0 - 0.75 * rgh ) * mix( 1.0, 3.4, uMetal );
		vec3 specTint = mix( uSpecColor, alb * 2.0 + uSpecColor * 0.25, uMetal );
		vec3 spec = specTint * ( specAmt * specStep * sh * step( 0.02, ndl ) );

		/* Cheap stylised environment for metal: a banded sky/sand gradient off the reflection
		   vector. Without a reflected term gold is just a yellow ball with a dot on it. */
		vec3 metalEnv = vec3( 0.0 );
		if ( uMetal > 0.001 ) {
			vec3 R = reflect( - slyToWorldDir( V ), Nw );
			float up = smoothstep( -0.25, 0.65, R.y );
			vec3 env = mix( uBounceColor, uSkyColor, floor( up * 3.0 + 0.5 ) / 3.0 );
			env = mix( env, uHaze * 0.8, 0.35 * ( 1.0 - abs( R.y ) ) );
			float ef = mix( 0.25, 1.0, pow( 1.0 - ndv, 3.0 ) );
			metalEnv = alb * env * ( uMetal * uMetalGain * ef ) * mix( 0.35, 1.0, sh ) * ao;
		}

		/* Fresnel rim. Modulated by N.L so it wraps around from the lit side rather than
		   haloing the whole silhouette — a uniform glow reads as a bad bloom, not as light. */
		float fres = pow( 1.0 - ndv, uRimPower );
		float wrapRim = smoothstep( -0.30, 0.45, ndl );
		float rimBand = smoothstep( 0.30, 0.60, fres * mix( 0.22, 1.0, wrapRim ) );
		vec3 rim = uRimColor * ( uRim * uRimGain * rimBand * mix( 0.40, 1.0, sh ) );

		/* A weak sky-coloured counter-rim on the shadow side. Nothing separates a dark
		   silhouette from a dark background as cheaply as this. */
		float skyRimAmt = smoothstep( 0.22, 0.85, fres ) * ( 1.0 - wrapRim ) * ( 0.5 + 0.5 * Nw.y );
		rim += uSkyColor * ( uRim * uRimGain * 0.55 * skyRimAmt );

		vec3 emissiveTerm = totalEmissiveRadiance;

		outgoingLight = diff + sss + spec + metalEnv + rim + emissiveTerm;

		/* Shadow diagnostics. shading.debugShadow(mode) selects a channel set — each one
		   isolates a different link in the chain, so a bad frame names its own culprit:

		     1  R = shadow term   G = receiveShadow   B = N.L
		     2  RGB = cascade 0's shadow coordinate after the perspective divide. Must land
		        in 0..1 on R and G anywhere the near cascade is meant to cover.
		     3  R = the depth actually stored in cascade 0's map at this fragment's lookup,
		        G = the fragment's own projected depth, B = inside the map's [0,1] square.
		        R > G is lit, R < G is occluded; R flat at 0 or 1 means the map is empty
		        or the sampler is reading garbage rather than depth.
		     4  R/G = the cascade blend weights, i.e. which cascade this fragment resolved to. */
		if ( uDebugShadow > 0.5 ) {
			float dbgRecv = 0.0;
			#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
				dbgRecv = receiveShadow ? 1.0 : 0.0;
			#endif
			vec3 dbg = vec3( shadowRaw, dbgRecv, clamp( ndl, 0.0, 1.0 ) );

			#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
				vec4 dbgSC = vDirectionalShadowCoord[ 0 ];
				vec3 dbgP = dbgSC.xyz / dbgSC.w;
				float dbgIn = ( dbgP.x >= 0.0 && dbgP.x <= 1.0 && dbgP.y >= 0.0 && dbgP.y <= 1.0 ) ? 1.0 : 0.0;

				if ( uDebugShadow > 1.5 && uDebugShadow < 2.5 ) dbg = dbgP;

				#if defined( SHADOWMAP_TYPE_PCF )
					/* Reconstruct the stored depth through the comparison sampler: summing
					   32 references spread over 0..1 counts how many fall below the stored
					   value, which is the stored value itself (the cascade ortho makes depth
					   linear). It is the only way to *see* a sampler2DShadow. */
					if ( uDebugShadow > 2.5 && uDebugShadow < 3.5 ) {
						float dbgAcc = 0.0;
						for ( int i = 0; i < 32; i ++ ) {
							dbgAcc += texture( directionalShadowMap[ 0 ], vec3( dbgP.xy, ( float( i ) + 0.5 ) / 32.0 ) );
						}
						dbg = vec3( dbgAcc / 32.0, clamp( dbgP.z, 0.0, 1.0 ), dbgIn );
					}
				#endif
			#endif

			#if defined( CSM_CASCADES ) && defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
				if ( uDebugShadow > 3.5 ) {
					float dbgW1 = 0.0;
					#if CSM_CASCADES > 1
						dbgW1 = csmMask( csmSplits[ 1 ], vViewPosition.z );
					#endif
					dbg = vec3( csmMask( csmSplits[ 0 ], vViewPosition.z ), dbgW1, 0.0 );
				}
			#endif

			outgoingLight = dbg;
		}

		/* Aerial perspective, in linear radiance, before tone mapping. Doing this with
		   three's flat sRGB-space fog would grey the whole frame out. */
		vec3 rd = slyDist > 1e-4 ? ( slyWP - cameraPosition ) / slyDist : vec3( 0.0, 0.0, -1.0 );
		float haze = slyHaze( cameraPosition, rd, slyDist ) * uHazeAmount;
		outgoingLight = mix( outgoingLight, slyHazeColor( rd ), haze );
		/* Emitters punch through haze — a torch at 60 m should still be a hot point. */
		outgoingLight += emissiveTerm * haze * 0.6;
	}
`;

/* ---------------------------------------------------------------------------
   Inverted-hull outline shell.
--------------------------------------------------------------------------- */

export const OUTLINE_VERT = /* glsl */ `
#define SLY_OUTLINE

attribute vec3 slyNormal;   // position-welded, averaged normal (see Outline.js)

uniform vec2  uRes;
uniform float uThickness;   // target line width in device pixels
uniform float uDepthPush;
uniform float uFalloff;     // shrink far lines slightly so distant clutter stays quiet

varying vec3 vSlyViewPos;
varying vec3 vSlyWorldN;

#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

/* view -> world for a direction; mat3(viewMatrix) is orthonormal so transpose == inverse. */
vec3 slyToWorldDirVS( vec3 v ) {
	return vec3( dot( viewMatrix[ 0 ].xyz, v ), dot( viewMatrix[ 1 ].xyz, v ), dot( viewMatrix[ 2 ].xyz, v ) );
}

void main() {

	#include <morphinstance_vertex>
	#include <batching_vertex>

	vec3 objectNormal = slyNormal;
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>

	/* Deliberately not <defaultnormal_vertex>: it honours FLIP_SIDED, and the shell is
	   BackSide, which would flip the extrusion inward and collapse the hull. */
	vec3 slyON = objectNormal;
	#ifdef USE_INSTANCING
		mat3 slyIM = mat3( instanceMatrix );
		slyON /= vec3( dot( slyIM[ 0 ], slyIM[ 0 ] ), dot( slyIM[ 1 ], slyIM[ 1 ] ), dot( slyIM[ 2 ], slyIM[ 2 ] ) );
		slyON = slyIM * slyON;
	#endif
	vec3 slyVN = normalize( normalMatrix * slyON );

	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>

	/* Nudge the hull away from the camera, proportionally to depth. Pure clip-space
	   expansion leaves camera-facing flats coplanar with the surface and they z-fight. */
	mvPosition.z *= 1.0 + uDepthPush;
	gl_Position = projectionMatrix * mvPosition;

	/**
	 * Screen-constant thickness. The extrusion happens in clip space, not world space:
	 * project the normal, normalise it in *pixel* units, then step exactly uThickness
	 * pixels. Multiplying by gl_Position.w cancels the perspective divide, so the line is
	 * the same width whether Sly is 2 m or 200 m away. Extruding a fixed number of metres
	 * — the usual shortcut — gives fat lines up close and none at distance.
	 */
	vec2 dpx = ( projectionMatrix * vec4( slyVN, 0.0 ) ).xy * uRes * 0.5;
	float dl = length( dpx );
	vec2 dir = dl > 1e-5 ? dpx / dl : vec2( 0.0 );
	float dist = - mvPosition.z;
	float w = uThickness * mix( 1.0, 0.62, smoothstep( 18.0, uFalloff, dist ) );
	gl_Position.xy += dir * ( w * 2.0 / uRes ) * gl_Position.w;

	vSlyViewPos = mvPosition.xyz;
	vSlyWorldN = normalize( slyToWorldDirVS( slyVN ) );

	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
}
`;

export const OUTLINE_FRAG = /* glsl */ `
uniform vec3  uInkSun;      // warm brown ink where the surface faces the key
uniform vec3  uInkShade;    // violet ink where it does not
uniform float uInkOpacity;
uniform float uInkGain;

varying vec3 vSlyViewPos;
varying vec3 vSlyWorldN;

#include <common>
#include <tonemapping_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

${SLY_COMMON}

void main() {

	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>

	/* Line colour follows the surface's own lighting: never pure black, warm in sun and
	   violet in shade. Pure #000 lines are the single loudest "student project" tell. */
	float ndl = dot( normalize( vSlyWorldN ), uKeyDir );
	float lit = smoothstep( -0.20, 0.35, ndl );
	vec3 ink = mix( uInkShade, uInkSun, lit ) * uInkGain;

	/* Lines obey aerial perspective, or every distant silhouette stays razor sharp and the
	   depth cue the haze was buying gets thrown away.

	   But an ink line may only ever be *darker* than what it sits on. Blending toward the
	   haze colour unconditionally inverted the line wherever haze is brighter than ink —
	   at night the haze is a lit blue while the ink is near-black, so distant hull outlines
	   came out as glowing blue wires instead of receding. Clamping the target to the ink's
	   own luminance keeps the aerial-perspective *fade* (the line washes toward the
	   background's hue and loses contrast with distance) while making it arithmetically
	   impossible for a line to add light. Same rule the screen-space crease pass follows. */
	float dist = length( vSlyViewPos );
	vec3 wp = slyWorldPos( vSlyViewPos );
	vec3 rd = dist > 1e-4 ? ( wp - cameraPosition ) / dist : vec3( 0.0, 0.0, -1.0 );
	float haze = slyHaze( cameraPosition, rd, dist );
	vec3 hazeInk = min( slyHazeColor( rd ), ink );
	ink = mix( ink, hazeInk, haze * 0.92 );

	gl_FragColor = vec4( ink, uInkOpacity );

	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;
