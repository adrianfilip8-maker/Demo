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
   Debug-channel self-calibration constants — the single source of truth.

   Every diagnostic channel in this file carries a mode that writes a fixed triple and
   nothing else. Run that mode FIRST: if the PNG does not carry the triple, the channel is
   not reporting the shader and no other mode's numbers from it mean anything.

   This is not belt-and-braces. It is the one procedure that would have caught the defect
   this table was added for: between 6e0cc8f and its fix, `TOON_SHADE` carried thirteen lines
   of prose OUTSIDE a comment (a stray close-comment marker ended the block one paragraph
   early — see tests/shader.test.mjs, which now scans for exactly that), so the whole
   cel fragment program failed to LINK — `ERROR: 0:2502: '*' : syntax error`, zero active
   uniforms — and every toon-shaded pixel in the game silently stopped drawing. Read through
   a graded composite that still had sky, ink and post in it, that looked like an ordinary
   frame. `debugTerm(4)`'s calibration DID catch it (KNOWN_ISSUES §210.2: "zero pixels carry
   the constants") and was read as "the debug channel is broken" rather than as "the program
   is dead", which is what it was actually saying.

   The triples are DISTINCT per channel on purpose: a probe that reads one and gets the
   other's is reading a channel it did not select.

   **The ARRIVAL contract is unchanged from §210.2: (64, 128, 191) for debugTerm.** What has
   changed is the float the shader writes to produce it, and the reason is measured rather
   than theoretical. Rendering mode 4 offline into a linear RGBA8 target and reading the
   pixels back gave THREE modal triples, not one:

       (64,127,192) x959    (64,127,191) x902    (64,128,191) x890

   Two independent causes, both removed here:

   1. **0.50 is a rounding TIE.** unorm8 quantisation is round(v * 255), and 0.50 * 255 =
      127.5 exactly, so whether it lands on 127 or 128 is up to the driver. A calibration
      constant may not be a coin flip. Every value is now the exact CENTRE of its 8-bit
      bucket (u8 / 255), which is half an LSB from either edge, so the round trip is
      unambiguous by construction and the documented u8 triple is bit-for-bit what it was.
   2. **Every cel material ships `dithering: true`** (ToonMaterial.js — the haze gradient
      banded visibly without it, and that is a shipped look decision worth keeping). three's
      dithering chunk adds up to +/-0.5 LSB of hash noise to gl_FragColor AFTER everything in
      this file has run, which is exactly enough to move a calibration constant by one. The
      splice in `_patch` now suppresses the dither while either debug channel is on, and only
      then: with both off the expression is three's own, unmodified.

   Both are only meaningful with `postfx.debugRaw('scene')`. Without that half the triple is
   carried through AgX, the grade and bloom, and what comes out describes the pipeline
   instead of the channel — KNOWN_ISSUES §1, which cost eight dead ends.
--------------------------------------------------------------------------- */
const bucket = ( u ) => u.map( ( v ) => v / 255 );

export const DEBUG_CALIB = {
	/** shading.debugTerm(4) — the rim/ramp visualiser's bypass check. */
	term:   { channel: 'debugTerm',   mode: 4, u8: [ 64, 128, 191 ], rgb: bucket( [ 64, 128, 191 ] ) },
	/** shading.debugShadow(9) — the shadow visualiser's bypass check. */
	shadow: { channel: 'debugShadow', mode: 9, u8: [ 191, 64, 128 ], rgb: bucket( [ 191, 64, 128 ] ) },
};

const glslVec3 = ( c ) => `vec3( ${ c.rgb.map( ( v ) => v.toFixed( 6 ) ).join( ', ' ) } )`;

/**
 * Replaces three's `#include <dithering_fragment>`.
 *
 * Bit-identical to the stock chunk whenever both debug channels are off, which is every
 * shipped draw: the guard is a pure branch, it changes no arithmetic, and `dithering()` is
 * called with the same argument it always was. See the DEBUG_CALIB note for why it exists.
 */
export const TOON_DITHER = /* glsl */ `
	#ifdef DITHERING
		/* A dithered diagnostic is not a diagnostic: three's dither adds up to half a least
		   significant bit of hash noise, and a calibration constant that moves by one is a
		   calibration that cannot be scored exactly. Suppressed for debug draws only. */
		if ( uDebugTerm < 0.5 && uDebugShadow < 0.5 ) gl_FragColor.rgb = dithering( gl_FragColor.rgb );
	#endif
`;

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
/* Depth-dependent warm bounce (see KNOWN_ISSUES 115.4). uShadowColorLit is the SAME light
   built with a different shadowBounceMix, for the shallow end of the shade; uShadowDepth is
   the smoothstep window over shadowMix that hands over between them. Both colours are built
   by the one _refreshShadowColor, so the teal blend, the floor and the peak cap apply to
   each identically and only the bounce share differs.

   INERT BY DEFAULT: ToonMaterial ships shadowBounceMixLit == shadowBounceMix, so the two
   uniforms are bitwise equal and this mix() is a no-op. Stated precisely rather than as
   "bit-identical", because that depends on the implementation: mix(x, y, a) returns x
   exactly when it is computed as x + a*(y-x) (y-x is exactly 0), but the spec's
   x*(1-a) + y*a can differ by an ulp. The A/B therefore carries a null arm and VERIFIES
   the no-op on the frame instead of assuming it — the same check that cleared base2 in
   the 115 sweep. */
uniform vec3  uShadowColorLit;
uniform vec2  uShadowDepth;
uniform float uShadowWash;
/* uShadowHold / uShadowHoldKnee — the shade band derived from the surface's OWN albedo.
   KNOWN_ISSUES §269, PREREG-shadowhold.md. Everything above this line describes the shadow
   *light*; these two are the only terms that let the *material* decide its own shade hue.
   0 is bit-identical to the pre-§269 build (mix(x,y,0.0) == x, (1.0-0.0) == 1.0). */
uniform float uShadowHold;
uniform float uShadowHoldKnee;
uniform vec2  uShadowSharp;
uniform vec3  uHaze;          // horizon haze colour
uniform vec3  uHazeSun;       // forward-scatter colour looking into the sun
uniform float uHazeGain;
uniform float uHazeDensity;
uniform float uHazeFalloff;   // 1 / height scale, metres^-1
uniform float uHazeBase;      // world y the density is quoted at
uniform float uHazeStart;     // metres of grace before haze bites
/* atmowire seam (PREREG-atmowire.md C1): published-curve branch. uAtmoWire 0.0 = shipped
   side-door bit-identically (the branch is untaken; no arithmetic changes). */
uniform float uAtmoWire;
uniform float uHazeHeightFalloff; // metres — published fog.heightFalloff (read only when wired)
uniform float uHazeInscatter;     // published fog.inscatter (read only when wired)
uniform vec3  uHazeTint;          // published fog.sunTint (read only when wired)
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
	if ( uAtmoWire > 0.5 ) {
		/* atmowire: ATMOSPHERE_GLSL applyAerial's exact blend (PREREG-atmowire.md C1). */
		float hw = exp( - max( camPos.y + rd.y * dist, 0.0 ) / max( uHazeHeightFalloff, 1.0 ) );
		float dw = dist * uHazeDensity * mix( 0.55, 1.0, hw );
		return clamp( 1.0 - exp( - dw * dw ), 0.0, 1.0 );
	}
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
	if ( uAtmoWire > 0.5 ) {
		/* atmowire: published haze colour — pole mix and uHazeGain retired when wired. */
		return uHaze + uHazeTint * ( pow( sunAmt, 5.0 ) * uHazeInscatter );
	}
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
uniform vec3  uShadowBands;   // cast-shadow penumbra quantiser: steps, softness, amount (0 = off)
uniform float uShadowSat;
/* The two diagnostic channels. BOTH are written after the haze mix, and BOTH carry a
   self-calibration mode (DEBUG_CALIB above) that must be run and scored before any other
   mode of that channel is quoted. Neither is meaningful without postfx.debugRaw('scene'). */
uniform float uDebugShadow;   // >0.5 → shadow diagnostics instead of shading; 9 = calibration
uniform float uDebugTerm;     // >0.5 → a rim/ramp term instead of shading; 4 = calibration —
                              // see the block at the end of TOON_SHADE, and read it first
uniform float uRim;
uniform vec3  uRimColor;
uniform float uRimPower;
uniform float uRimGain;
uniform vec3  uRimCurve;      // silhouette gate: xy = normal turn per screen height, lo..hi;
                              // z = how strictly to require convexity (0 = not at all)
uniform float uRimSkinExempt; // 1 = skinned geometry skips the convexity half of the gate
uniform float uRimMagExempt;  // 1 = skinned geometry skips the MAGNITUDE half — see rimSil
uniform float uRimShadowFloorArch; // shadow-side rim floor for NON-skinned geometry; 0.55 = no-op
uniform float uAoKey;         // 0 = key light ignores AO (shipping); 1 = key is multiplied by it
uniform float uShadeBand;     // banded form on the SHADE side — see slyShadeForm in TOON_SHADE.
                              // 0 = bit-identical legacy, and exactly so: the term is spelled
                              // 1 - uShadeBand*(1-ramp), never mix(), so 0 multiplies out to a
                              // literal 1.0 without depending on how a driver spells mix().
varying float vSlySkin;       // 1.0 on a SkinnedMesh, 0.0 otherwise — see the note at slyConvex
uniform float uSpec;
uniform vec3  uSpecColor;
uniform float uSpecKey;       // PREREG-hilite2 §2 - how much of keyRad the specular carries.
                              // 0 = the legacy uncoupled term, BIT-IDENTICALLY: the factor is
                              // spelled mix( vec3( 1.0 ), keyRad, uSpecKey ), and at 0 that is
                              // x*(1-0) + y*0 = x + 0 = x exactly for every finite keyRad.
uniform float uSpecGain;      // attribution lever. 1 = shipped (x*1.0 == x exactly); 0 removes
                              // the whole specular term, which is how base-minus-off measures
                              // what spec is worth in a frame today.
uniform float uSpecNormPow;   // PREREG-specnorm §2 - exponent on the Blinn energy normalisation
                              // (glossP+8)/8. 0 takes a literal-1.0 BRANCH, so the shipped
                              // default is bit-identical without depending on how a driver
                              // spells pow(). 1 = textbook energy conservation.
uniform float uGloss;
uniform float uMetal;
uniform float uMetalGain;
uniform float uGoldGlint;
uniform float uGlintPow;
uniform float uGlintSharp;
uniform float uSss;
uniform vec3  uSssColor;
uniform float uAoStrength;
uniform float uHazeAmount;
uniform float uBounceGain;    // attenuation on the sand-bounce half of the hemispheric fill
uniform float uFillSkyMix;    // hue blend of that half toward the sky, luma-matched. 0 = legacy
/* Grade-lever scaffolding (ToonMaterial TUNE.neutralShadow/neutralFill/subjWarmShade — the
   comment block there is the why). All three are luma-matched chroma blends on the two
   shade-side lights; every default 0 is bit-identical legacy (mix at 0 is exact). */
uniform float uNeutralShadow; // uShadowColor chroma -> grey, globally. Attribution arm only.
uniform float uNeutralFill;   // fill chroma -> grey, globally. Attribution arm only.
uniform float uSubjWarmShade; // both shade lights' chroma -> luma-matched uSssColor, vSlySkin-scoped.

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

/**
 * The same quantiser, applied to the cast-shadow penumbra instead of to N.L.
 *
 * Why this exists: §7.3 fails every shot for "diffuse ramp reads as smooth/realistic instead
 * of banded-cel", and slyRamp above is not the reason. slyRamp is correct — but it can only
 * draw a terminator where the *normal* turns, and this level is boxes and faceted cylinders,
 * so a flat face has one normal, lands wholly inside one band, and gives the quantiser no
 * gradient to band. Every large surface in the game is therefore a single flat tone no matter
 * how the ramp is tuned, and geometry work is the only fix on that path.
 *
 * The shadow map's penumbra is the one gradient that exists *on a flat face*: it comes from
 * the PCF kernel, not from the surface, so it is there on a plain wall. Quantising it puts a
 * stepped terminator on every cast-shadow edge in the level regardless of the shape of what
 * it falls on — which is the same graphic read, bought without geometry.
 *
 * n thresholds evenly spaced over 0..1 give n+1 output levels evenly spaced over 0..1, so
 * steps = 2 is the classic three-tone shadow edge (lit / mid / core).
 *
 * uShadowBands.z = 0 disables it and restores the plain smoothstep, so the A/B that sets the
 * default here stays reproducible rather than being a claim in a comment.
 */
float slyShadowBand( float x, float steps, float soft ) {
	float n = max( floor( steps + 0.5 ), 1.0 );
	float d = 1.0 / ( n + 1.0 );
	float acc = smoothstep( d - soft, d + soft, x );
	acc += step( 1.5, n ) * smoothstep( 2.0 * d - soft, 2.0 * d + soft, x );
	acc += step( 2.5, n ) * smoothstep( 3.0 * d - soft, 3.0 * d + soft, x );
	acc += step( 3.5, n ) * smoothstep( 4.0 * d - soft, 4.0 * d + soft, x );
	return clamp( acc / n, 0.0, 1.0 );
}

#ifdef SLY_DETAIL

	uniform sampler2D uDetailMap;   // rgb = tangent-space normal, a = albedo grain
	uniform float uDetailScale;
	uniform float uDetail2Scale;
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
		   breaks up the repeat so a 40 m wall never shows a tiling grid.

		   "Incommensurable" was the intent and was NOT what the second octave's multiplier
		   delivered: at the literal 0.137 it stood at 0.97-1.84x every tiled consumer's
		   repeat, i.e. near unison, so each repeat got the same macro phase and the layer
		   decorrelated nothing. It is TUNE.detail2Scale now (see the derivation there) and a
		   uniform rather than a literal so the ratio can be A/B'd.
		   (No backticks in this file: the whole shader is a template literal.) */
		float fade = 1.0 - smoothstep( uDetailFade * 0.4, uDetailFade, slyDist );
		if ( fade > 0.001 ) {
			vec3 b = slyTriWeights( slyWN );
			vec4 d0 = slyTriplanar( slyWP, slyWN, b, uDetailScale );
			#ifdef SLY_DETAIL2
				vec4 d1 = slyTriplanar( slyWP + vec3( 37.7, 11.3, 91.1 ), slyWN, b, uDetailScale * uDetail2Scale );
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
	/* Exported for the SLY_METAL_TAG alpha write that ToonMaterial splices in after
	   <opaque_fragment> — the block below scopes everything else, so the tag cannot see
	   slyMetal itself (proven the hard way: scratchpad/goldproof.mjs failed the naive
	   version on exactly this). Initialised to 0.0 = non-metal so any future path that
	   skips the assignment fails closed, per the PostFX.bloomMetalGain contract. */
	float slyMetalOut = 0.0;
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
		/* uShadowSharp remaps the raw PCF value; the window is what decides how much of the
		   kernel's penumbra survives into the image at all, so it and uShadowBands are one
		   decision, not two. Measured on the graded frame, a [0.10, 0.66] window leaves a
		   10-90% transition about 2 px wide — too narrow for a banded edge to read, which is
		   why widening the window is part of banding it rather than a separate tuning. */
		float sh = smoothstep( uShadowSharp.x, uShadowSharp.y, shadowRaw );
		sh = mix( sh, slyShadowBand( sh, uShadowBands.x, uShadowBands.y ), uShadowBands.z );

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

		/* The albedo the shadow terms multiply, saturation-adjusted (uShadowSat).
		 *
		 * This used to push saturation *up*, on the principle that desaturated shadow is what
		 * makes cheap cel shading look muddy. The principle is right about the finished pixel
		 * and wrong here: warm sandstone saturated further has effectively no blue left, so
		 * multiplying it by a violet-teal shadow light can only produce a dark orange, which
		 * is exactly the defect the critic measured. The chroma in a shadow comes from the
		 * light; the albedo's job is to let it through and keep the surface's detail legible.
		 * See TUNE.shadowSat in ToonMaterial.js for the measurements. */
		vec3 albShadow = clamp( mix( vec3( lumA ), alb, 1.0 + uShadowSat ), 0.0, 1.0 );

		vec3 keyRad = uKeyColor * uKeyIntensity;

		/* Hemispheric fill: cool sky above, hot sand bounce below.
		 *
		 * On a lit surface the key is ~6x this, so in practice this term decides the hue of
		 * everything the sun does *not* reach — it is a shadow knob wearing an ambient's name.
		 * Two things about it were making daylight shadows come out warmer than the sunlight,
		 * which is the exact inversion of §2.2:
		 *
		 * 1. uBounceColor arrives as the palette's sand at full radiance — linear (0.81, 0.39,
		 *    0.08), i.e. brighter in red than the sun's own colour. It is a *bounce*: sunlight
		 *    that has already been absorbed once by sand. Arriving unattenuated, it puts more
		 *    red on a shaded wall than the key puts on a lit one.
		 * 2. '0.5 + 0.5 * N.y' hands every vertical face 50% of that. A wall in an open desert
		 *    sees most of the sky dome and only a grazing sliver of hot ground, so the
		 *    crossover belongs below the horizon, not on it.
		 *
		 * uFillSkyMix (task #19) blends the bounce leg's HUE toward the sky at matched
		 * luminance — the sand bounce is the one remaining G-poor light term (G/R 0.78 on a
		 * wall at golden hour), and on shadow-side pixels it is what keeps green in last
		 * place. Luma-matched so the blend cannot change how bright the fill is, only what
		 * colour it is; mix(x, y, 0.0) == x exactly, so 0 is bit-identical legacy. Modelled
		 * in scratchpad/t19corridor.mjs: this lever alone is measured INSUFFICIENT for the
		 * temple violet (7-14 deg of a 10-30 deg residual) — it ships as one leg of the
		 * teal-consistency package with PostFX's splitShadowTeal/aoTintTeal, not alone. */
		float hemi = smoothstep( -0.72, 0.55, Nw.y );
		vec3 bounceLeg = mix( uBounceColor,
		                      uSkyColor * ( slyLum( uBounceColor ) / max( slyLum( uSkyColor ), 1e-4 ) ),
		                      uFillSkyMix );
		vec3 fill = mix( bounceLeg * uBounceGain, uSkyColor, hemi ) * uAmbIntensity;

		float shadowMix = 1.0 - key;

		/* The ambient is part of the shadow, so it gets the shadow albedo too — in proportion,
		   so a lit surface is untouched. Leaving it on the raw albedo was why uShadowSat
		   measured as a near-dead knob (-0.30 and -0.10 differ by 0.07 in R/G on a shadowed
		   pier): the fill is the largest single term on a shaded vertical face and the reddest,
		   so it was quietly re-warming whatever the shadow terms had just cooled. */
		vec3 albAmb = mix( alb, albShadow, shadowMix );

		/* Coloured, transparent shadow. The multiplied term keeps albedo detail readable
		   inside the shadow; the small additive wash keeps the *hue* alive, because a warm
		   sandstone albedo multiplied by a violet light neutralises to grey otherwise. */
		/* uAoKey: whether baked occlusion multiplies the DIRECT key term as well as the
		   ambient ones. It does not today: on a sunlit surface alb * keyRad * key dominates and
		   is the one term ao never reaches. Default 0 keeps the shipping look; 1 is the A/B.

		   The numbers that used to appear here were wrong and are withdrawn (§34). They read
		   "authors AO p5/p50/p95 = 0.247/0.412/0.992 and renders with a frame median of 0.992,
		   i.e. no occlusion at all" — but texlab emits p1/p5/p50, so the authored MEDIAN is
		   0.992 and 0.412 was the 5th percentile; the two figures in that sentence were the same
		   statistic labelled twice. And nothing reads AO out of a frame, so "renders with a
		   frame median" described a measurement that does not exist.
		   Whoever turns it on must measure the whole frame's midtones, not only the gilded mask:
		   this darkens every crevice in every sunlit surface in the game. */
		/* Grade-lever scaffolding (see ToonMaterial TUNE): the two shade-side lights pass
		   through two luma-matched chroma blends before they touch the surface.
		   - uNeutralShadow / uNeutralFill: -> grey. Global attribution arms, never shipped.
		   - uSubjWarmShade: -> the material's own warm wrap colour, on skinned draws only
		     (vSlySkin — same subject scope §24.1 verified for the rim gate). This is the
		     blueskew/coolskew fix candidate: it restores the authored warm cream in
		     fill+shadow without moving one architecture pixel, because for vSlySkin = 0 the
		     blend factor is exactly 0 and mix(x, y, 0.0) == x.
		   All blends preserve luminance by construction (targets are pre-scaled to the
		   source light's own luma), so this is a hue lever, not a brightness lever. */
		float slySubjT  = clamp( uSubjWarmShade, 0.0, 1.0 ) * vSlySkin;
		vec3  slyWarmT  = uSssColor / max( slyLum( uSssColor ), 1e-4 );
		vec3  slyFillX  = mix( fill, vec3( slyLum( fill ) ), clamp( uNeutralFill, 0.0, 1.0 ) );
		/* One knob, two jobs with opposite optima (KNOWN_ISSUES 115.4): the shadow light's RED
		   reaches ~88.8% of frame while its HUE only decides the image in deep shade. Both
		   terms that carry this light are multiplied by shadowMix, so the knob's authority is
		   exactly proportional to shadow depth — which is also where the magenta risk lives.
		   Blending toward a warmer build at the shallow end spends the bounce where it costs
		   no hue. */
		vec3  slyShadD  = mix( uShadowColorLit, uShadowColor,
		                       smoothstep( uShadowDepth.x, uShadowDepth.y, shadowMix ) );
		vec3  slyShadX  = mix( slyShadD, vec3( slyLum( slyShadD ) ), clamp( uNeutralShadow, 0.0, 1.0 ) );
		slyFillX = mix( slyFillX, slyWarmT * slyLum( slyFillX ), slySubjT );
		slyShadX = mix( slyShadX, slyWarmT * slyLum( slyShadX ), slySubjT );

		/* ── slyShadeForm — the shade side gets the SAME three bands as the key. ───────────
		 *
		 * The note at slyShadowBand above says the diffuse ramp "is not the reason" §7.3 fails
		 * and blames flat geometry. Half right, and the half it got wrong is the expensive half.
		 * Measured on the shipped temple capture with tools/bandprobe.mjs, which rasterises
		 * the real architecture and its own ortho shadow map offline:
		 *
		 *     temple     architecture px 905878   lit 14230 (1.57%)   shadow 883435 (97.5%)
		 *     courtyard  lit 201291 (31.8%)   step at T=0.14 +21.8 luma, control -1.8  -> 12.3x
		 *                                     step at T=0.52 +24.8 luma, control -1.0  -> 25.1x
		 *     hero       lit 153879 (18.4%)   step at T=0.14 +23.1 luma, control -2.3  -> 10.1x
		 *
		 * So where the key reaches, the ramp bands hard and always did. What fails is everything
		 * the key does NOT reach — and key = ramp * sh, so on a cast-shadowed surface the ramp
		 * is multiplied by zero and the quantiser never runs. temple is a roofed hypostyle
		 * hall: 97.5% of its architecture is in that state, which is why it is the shot the
		 * critic keeps scoring as unbanded.
		 *
		 * Now look at what is left on such a surface. Every remaining diffuse term is a function
		 * of hemi = smoothstep(-0.72, 0.55, Nw.y) and of shadowMix = 1 - key, and with key 0
		 * BOTH are constant in the normal's azimuth. spec is gated by sh and by
		 * step(0.02, ndl); sss is gated by sh. A shadowed vertical column therefore renders
		 * as ONE FLAT TONE, and the only thing that varies across it is the fresnel rim. That is
		 * measured too, on the real nave column at 11.3 m through the shipped camera
		 * (progress/records/celcyl.mjs): its lit face spans N.L -0.367..0.865 — the full sweep,
		 * both terminators, four crossings — and delivers 17.7 luma of range, all of it
		 * continuous, at gapFrac 0.0795 against an ideal-smooth-Lambert control of 0.0784.
		 * Indistinguishable from Lambert, on the surface with the most terminator crossings in
		 * the frame.
		 *
		 * This term is the missing half. ramp already carries the three-band quantisation of
		 * N.L; the shade-side lights simply never consulted it. Multiplying them by it puts the
		 * same plateaus, at the same terminators, on surfaces the sun does not reach — which is
		 * also why it uses ramp rather than a second set of thresholds: the bands then line up
		 * ACROSS a cast-shadow boundary instead of fighting it.
		 *
		 * It only ever DARKENS (shadeForm <= 1, minimum 1 - uShadeBand at ramp 0), so it cannot
		 * blow out a shade tone and it moves critic pass 3's "unlit <= 45% of lit" the helpful
		 * way rather than the other one. It is a single scalar applied to all three shade-side
		 * terms EQUALLY, so it changes shade luminance and cannot change shade hue — the
		 * violet/teal balance LIGHTING and TEXTURES spent §115/§16/§19 on is arithmetically
		 * untouched.
		 *
		 * uShadeBand 0 is bit-identical: 1.0 - 0.0 * x is 1.0 exactly, for any finite x, on any
		 * driver. Nothing republishes this uniform per frame, so unlike uRimGain a poke of
		 * shading.uniforms.uShadeBand.value sticks and the A/B is one boot. */
		float shadeForm = 1.0 - uShadeBand * ( 1.0 - ramp );

		/* ── the shade band, derived from this surface's own albedo (KNOWN_ISSUES §269) ────
		 *
		 * Everything above builds a shadow LIGHT and multiplies it into the albedo. That is
		 * already a per-material derivation on paper, and on warm stone it is not one in
		 * practice, for a reason that is arithmetic rather than aesthetic. Measured offline
		 * from the shipped constants (scratchpad/hue/model.mjs, which reads them out of
		 * ToonMaterial.js by regex rather than transcribing, and reproduces the G/R 3.258 that
		 * ADDENDUM-shadowhue-restate.md §1 computed independently):
		 *
		 *     shadow light, linear      (0.1039, 0.3384, 0.5367)     G/R 3.258
		 *     break-even                an albedo flips R>G to G>R when its linear G/R > 0.307
		 *
		 *     material          lit h    shipped shade h    dh
		 *     SANDSTONE mid      22.5              175.9   153.4
		 *     SANDSTONE light    29.0              177.8   148.8
		 *     LIMESTONE mid      37.6              193.2   155.6
		 *
		 * Sandstone's linear G/R is 0.485 against a break-even of 0.307, so the MULTIPLY ITSELF
		 * inverts the channel order and carries ~153 of critic 9's measured ~174 degrees. The
		 * additive uShadowWash makes it worse but is not the cause, and an earlier draft of this
		 * comment that blamed it ("the multiply neutralises, the wash repaints") was WRONG and is
		 * withdrawn — the multiply does not neutralise, it substitutes.
		 *
		 * The same arithmetic is already in the repo, in ADDENDUM-shadowhue-restate.md §2, where
		 * it is recorded as a PASS ("shaded sandstone multiplies to ~176-181 degrees ... the
		 * entire stone family passes"). It passed because it was scored against
		 * DERIV-shadowhue-target.md's dh ~ 180 band. Same numbers, opposite verdict; the
		 * disagreement is entirely in the acceptance, never in the mechanism. §269 settles which
		 * acceptance governs.
		 *
		 * hold is the fix and it is gated on a quantity the old model never consulted — the
		 * albedo's OWN chroma, per pixel:
		 *
		 *   - Chromatic material (sandstone, Sly's blue, lapis): hold -> 1. The band becomes
		 *     the albedo scaled by the shadow light's LUMINANCE, i.e. the material's own hue
		 *     at a lower value, and the albedo-independent wash is withdrawn in step.
		 *   - Near-achromatic material (limestone, granite, plaster): hold -> 0 and NOTHING
		 *     changes. This is the case the mechanism has to be safe for, because hue is
		 *     ill-defined there: an achromatic surface has no hue of its own to hold, so it
		 *     keeps taking the light's, and §2.1.3's "shadows are never grey" survives on
		 *     exactly the materials where it would otherwise be violated.
		 *
		 * held is renormalised to lum(tint), so the mix is a pure HUE lever: it cannot
		 * buy a hue result with brightness, and the guard that checks the shadow still reads
		 * as shadow (PREREG G3) is protected by construction. The only luminance this block
		 * moves is the wash it withdraws.
		 *
		 * Note what this does NOT touch: the hemispheric fill. slyFillX is a real ambient
		 * with a directional colour story §2.2 names separately (FILL sky bounce / BOUNCE sand
		 * GI), and it is what makes interior's sconce relationship work — the one frame
		 * critic 9 rated as having a working colour relationship. Its residual share is
		 * measured by the A5 arm rather than assumed away. */
		float albMax    = max( alb.r, max( alb.g, alb.b ) );
		float albChroma = ( albMax - min( alb.r, min( alb.g, alb.b ) ) ) / max( albMax, 1e-4 );
		float hold      = clamp( uShadowHold, 0.0, 1.0 )
		                * smoothstep( 0.0, max( uShadowHoldKnee, 1e-4 ), albChroma );

		vec3  shadTint  = albShadow * slyShadX;
		vec3  shadHeld  = alb * slyLum( slyShadX );
		shadHeld       *= slyLum( shadTint ) / max( slyLum( shadHeld ), 1e-5 );
		vec3  shadBand  = mix( shadTint, shadHeld, hold );

		vec3 diff = alb * keyRad * key * mix( 1.0, ao, uAoKey )
		          + ( albAmb * slyFillX * ao
		            + shadBand * shadowMix * mix( 0.55, 1.0, ao )
		            + slyShadX * uShadowWash * ( 1.0 - hold ) * shadowMix * ao ) * shadeForm;

		/* uMetal is the art-directed metal *amount*; the ORM texture's blue channel is the
		   mask that says where on the surface it applies — the gilding on a hieroglyph, the
		   inlay in a cartouche. three's own metalnessFactor is unusable for this: the
		   material sets metalness = 0 on purpose (our metal read is stylised, three's PBR
		   term is gone), so the stock metalnessmap chunk multiplies the map by zero. Sample
		   it directly instead.

		   Without this the blue channel had no consumer anywhere in the game. */
		float slyMetal = uMetal;
		#ifdef USE_METALNESSMAP
			slyMetal *= texture2D( metalnessMap, vMetalnessMapUv ).b;
		#endif
		slyMetalOut = slyMetal;

		/* Metals have almost no diffuse; that plus a hot lobe is what reads as gold. */
		diff *= mix( 1.0, 0.20, slyMetal );

		/* Wrap-around subsurface. Peaks exactly at the terminator and decays into the dark
		   side — this is the difference between fur and painted plastic. */
		float wrapv = clamp( ( ndl + uSss ) / ( 1.0 + uSss ), 0.0, 1.0 );
		float sssAmt = clamp( wrapv - clamp( ndl, 0.0, 1.0 ), 0.0, 1.0 );
		vec3 sss = alb * uSssColor * keyRad * ( sssAmt * uSss * 2.4 * sh );

		/* Hard-stepped Blinn-Phong. Threshold on the lobe, not on N.H, so the highlight is
		   a crisp shape whose size tracks gloss instead of a soft blob.

		   **"Gold has no specular path in the shader at all" is false — correct the record.**
		   That claim reached me as a handoff and it is a misreading of the note at
		   Materials.js:148-190, which says something different and narrower. What is true:
		   Materials.js's own PAL.goldSpec reaches no specular term, because this module
		   declares a private palette. What does NOT follow is that gold has no highlight.
		   Three lines below there is a dedicated metal branch, and it is what that same
		   Materials.js note concludes is *correct by design*:

		     specAmt  = uSpec * (1 - 0.75*rgh) * mix( 1.0, 3.4, slyMetal )      -> x3.4 on metal
		     specTint = mix( uSpecColor, alb * 2.0 + uSpecColor * 0.25, slyMetal )
		     metalEnv = alb * env * ( slyMetal * uMetalGain * ef ) * ...        (the block below)

		   i.e. on metal the highlight colour is derived from the ALBEDO (1.7x albedo plus a
		   0.36 white core) rather than from any palette hex — "sun-times-gold, arrived at
		   without any palette entry", which is exactly why goldSpec not reaching here is
		   harmless rather than a bug. gold_leaf ships spec 0.95 / gloss 110 / metal 0.85,
		   so the term is live and strong. Adding a second gold specular on top of this one,
		   on the strength of the "no path at all" claim, would double the highlight.

		   The measured defect (gold reading B/max 1.08-1.39 in frame against 0.24-0.26 on the
		   albedo) is real but is NOT a missing lobe, and the arithmetic rules out the obvious
		   candidates: metalEnv and the diffuse are both multiplied by the gold albedo, whose
		   linear blue is ~0.05, so neither can make blue the max channel. The terms that can
		   are the ones NOT multiplied by albedo — the additive shadow wash on the line above,
		   the additive rim, and the multiplicative AO tint and split-tone cool leg, all four
		   of which are blue. What makes gold uniquely exposed to them is one line up:
		   diff *= mix( 1.0, 0.20, slyMetal ) removes 68% of gold's own colour at metal 0.85,
		   leaving little signal for those blue terms to sit against. That is the hypothesis to
		   test first, it is a one-line A/B, and per the handoff's own sequencing it should be
		   measured only AFTER the split-tone cast is fixed — otherwise it is sized against a
		   moving baseline. TEXTURES holds the material masks and owns that verification.

		   **68% is the value at metal 0.85 — the WORLD's gilding — and it is quoted for the
		   character's cane, where it is wrong.** SlyModel.js binarises metal to (spec.metal ? 1 : 0),
		   so every gilded surface on Sly runs uMetal **1.0**, the maximum in the project, and the
		   multiply is 0.20 — **80% removed, not 68%.** The figure is stated per-metal-value here
		   because it has already travelled without its qualifier (KNOWN_ISSUES §48.3). If you
		   quote it, quote the uMetal it belongs to. */
		float rgh = clamp( roughnessFactor, 0.03, 1.0 );
		vec3 Lv = slyToViewDir( L );
		vec3 H = normalize( Lv + V );
		float ndh = clamp( dot( N, H ), 0.0, 1.0 );
		float glossP = max( uGloss * ( 1.0 - 0.6 * rgh ), 4.0 );
		float lobe = pow( ndh, glossP );
		float specStep = smoothstep( 0.30, 0.52, lobe ) + 0.35 * smoothstep( 0.02, 0.30, lobe );

		/* **specStep is a SHAPE function capped at 1.35 for every glossP, and that is a physical
		   error: it makes a tighter highlight strictly DIMMER in total energy.**

		   The stepped lobe's support is the spherical cap ndh >= 0.30^(1/glossP). To first order
		   1 - ndh ~ 1.204/glossP, and a cap's solid angle goes as (1 - ndh), so the support
		   shrinks as 1/glossP while the peak stays pinned at 1.35. Amplitude constant x support
		   1/glossP = total reflected energy falling as 1/glossP. Raising uGloss narrows the
		   highlight and makes it no brighter, which is backwards — concentrating the same energy
		   into fewer pixels is exactly what a highlight IS. That is what KNOWN_ISSUES §256's "no
		   highlight range" bottoms out in once §262 ruled out the incidence explanations.

		   The missing factor is the normalised Blinn-Phong term (glossP + 8)/8 — the usual
		   1/(8pi) convention minus the pi, which this shader drops everywhere else too.

		   uSpecNormPow is the exponent, not a gain: amplitude ∝ glossP^p keeps the ordering by
		   gloss a clean power law at partial strength, where an ad-hoc blend to 1.0 would not.
		   An ANCHORED spelling (glossP+8)/(ref+8) is deliberately NOT offered — it is exactly
		   this expression divided by the constant (ref+8)/8, and a scene-wide divisor is what
		   uSpecGain already is (PREREG-specnorm §2, verified numerically in normmodel.mjs).
		   The family has two degrees of freedom, slope and level, and it already had the level.

		   **The branch is why 0 is exact.** uSpecNormPow > 0.0 ? pow(...) : 1.0 evaluates no
		   arithmetic at all at the shipped default, so the no-op does not depend on a driver
		   spelling pow(x, 0) as exp2(0 * log2(x)). Same standard as uShadeBand three lines up
		   in this file. The test is on the uniform, so control flow stays quad-uniform and the
		   derivatives taken earlier in this function keep their meaning.

		   What it does NOT do: it leaves glossP alone, so it cannot widen the lobe or put one
		   where the geometry makes none. The affected pixel set is bounded above by today's
		   specStep > 0 population. It raises amplitude only.

		   What it DOES do that the per-pixel arithmetic here cannot show: it feeds bloom
		   (PostFX.js bloomThreshold 2.20; §25 measured gold_leaf already crossing it at 4.025
		   scene). Bloom is a spatial gather, so this term can raise pixels that never ran it. */
		float specNorm = uSpecNormPow > 0.0 ? pow( ( glossP + 8.0 ) * 0.125, uSpecNormPow ) : 1.0;

		float specAmt = uSpec * ( 1.0 - 0.75 * rgh ) * mix( 1.0, 3.4, slyMetal );
		vec3 specTint = mix( uSpecColor, alb * 2.0 + uSpecColor * 0.25, slyMetal );

		/* **The specular is a reflection of the LIGHT, and until uSpecKey it was not multiplied
		   by the light.** diff (line 596) and sss (line 622) both scale with
		   keyRad = uKeyColor * uKeyIntensity; this term did not, so it was a fixed fraction of
		   *unit* radiance under a sun of luma 2.423 — the one lit term decoupled from the sun,
		   and the one term physically entitled to exceed the albedo.

		   That is what KNOWN_ISSUES §256's "no highlight range" bottoms out in. The diffuse is
		   albedo-bounded (slyRamp clamps at 1, so a lit surface tops out at alb * keyRad) and
		   the sandstone palette caps that at display L 197. The only additive terms that can go
		   past it are the rim — a silhouette band, already indicted for the courtyard plinth
		   lip — and this one.

		   uSpecKey is a scene-wide constant, so the coupling multiplies **every** material's
		   specular by the same number. The art-directed ordering across materials is therefore
		   preserved exactly: mudbrick (uSpec 0.05) and gold_leaf (0.95) keep their 19:1 ratio,
		   dull stone stays dull, and only the materials already authored to be shiny gain the
		   headroom to blow out. Modelled ceilings at a saturated lobe (PREREG-hilite2 §3):

		     material              spec NOW -> x keyRad     lit surface total, display L
		     sandstone_block         0.109  ->  0.266        201.5 -> 207.1
		     limestone_polished      0.284  ->  0.694        223.5 -> 228.6
		     granite_pink            0.479  ->  1.171        204.4 -> 221.0
		     hieroglyph_gilded       1.729  ->  4.414        225.0 -> 242.4
		     gold_leaf               4.372  -> 11.218        242.6 -> 252.2
		     mudbrick                0.035  ->  0.086        172.1 -> 176.7

		   What the coupling does NOT fix, stated here because it is the larger term: this lobe
		   is gated by step( 0.02, ndl ) and by sh, so it is exactly zero on every surface the
		   sun does not reach — which §256 measured as 32-85% of every daylight frame. A
		   highlight also needs ndh near 1, i.e. the normal near the L/V bisector, and twelve of
		   fourteen shots have their camera-facing walls at ramp 0 or 0.5. Coupling raises the
		   ceiling; it cannot put a lobe where the geometry does not make one. */
		vec3 spec = specTint * mix( vec3( 1.0 ), keyRad, uSpecKey )
		          * ( specAmt * specStep * specNorm * sh * step( 0.02, ndl ) * uSpecGain );

		/* Cheap stylised environment for metal: a banded sky/sand gradient off the reflection
		   vector. Without a reflected term gold is just a yellow ball with a dot on it. */
		vec3 metalEnv = vec3( 0.0 );
		// Branch on the uniform, not the masked value: control flow stays uniform across the
		// quad (so the derivatives above keep their meaning) and a non-metal material still
		// skips the whole block.
		if ( uMetal > 0.001 ) {
			vec3 R = reflect( - slyToWorldDir( V ), Nw );
			float up = smoothstep( -0.25, 0.65, R.y );
			vec3 env = mix( uBounceColor, uSkyColor, floor( up * 3.0 + 0.5 ) / 3.0 );
			env = mix( env, uHaze * 0.8, 0.35 * ( 1.0 - abs( R.y ) ) );
			float ef = mix( 0.25, 1.0, pow( 1.0 - ndv, 3.0 ) );
			metalEnv = alb * env * ( slyMetal * uMetalGain * ef ) * mix( 0.35, 1.0, sh ) * ao;
			/* Sun-glint leg (PREREG-goldlobe §2): the lobe term the spec assembly's L207
			   ceiling cannot produce. INERT until uGoldGlint > 0 — the add is multiplied
			   by exactly 0.0 at the shipped TUNE default. */
			/* goldlobe2 (PREREG-goldlobe2 §2): re-steepen the relief tilt for the glint's R
			   only. nonPerturbedNormal = three r185's pre-normal-map view-space normal
			   (normal_fragment_begin, unconditional); Nw carries normalMap + triplanar
			   detail. uGlintSharp 1.0 reproduces the predecessor's arithmetic; the whole
			   add stays x0.0-inert at the shipped TUNE.goldGlint 0.0. */
			vec3 NgW = normalize( slyToWorldDir( nonPerturbedNormal ) );
			vec3 Ns  = normalize( mix( NgW, Nw, uGlintSharp ) );
			vec3 Rg  = reflect( - slyToWorldDir( V ), Ns );
			float slyGlint = pow( max( dot( Rg, uKeyDir ), 0.0 ), uGlintPow );
			metalEnv += ( alb * 1.4 + uSpecColor * 0.45 )
			          * ( uGoldGlint * slyGlint * slyMetal * mix( 0.25, 1.0, sh ) * ao );
		}

		/* Fresnel rim — §2.1.5, "the single biggest AAA tell".
		 *
		 * It still wraps from the lit side: full strength where the key grazes the surface,
		 * dimmer where it does not. What it must not do is gate to *zero* on the shadow
		 * side, which is what the previous form did. 'mix( 0.22, 1.0, wrapRim )'
		 * multiplied fres by 0.22 there, and the band that consumed it started at 0.30 — so
		 * the term was not merely weak on a shadow-side silhouette, it was arithmetically
		 * incapable of firing at any fresnel value. The critic measured the result exactly: a
		 * 2 px cyan band on Sly's key-lit edge, +8 luma on his shadow edge. A rim that only
		 * exists where the key already lights the surface does no separation work at all.
		 *
		 * So the wrap is now carried by *amplitude* (mix 0.45 -> 1.0) rather than by a
		 * threshold the shadow side can never reach: the shadow-side rim is 45% as bright and
		 * a little narrower, which reads as light bending round the form, and it is never nil.
		 *
		 * What this term cannot do is rim a flat face *at its own silhouette*. A box's normal
		 * does not turn toward grazing at its edge, so fres stays near zero right up to it and
		 * the 'courtyard' obelisk against open sky gets nothing from here at any tuning. That
		 * case belongs to the screen-space silhouette rim in PostFX, which keys off the depth
		 * discontinuity instead of the normal. The two are complementary by design: this one
		 * wraps light around curved forms, that one guarantees every silhouette against a
		 * background separates.
		 *
		 * Read the next block before believing the sentence above says anything reassuring
		 * about flat faces in general. It does not: a flat face *tilted* away from the eye
		 * reaches a high fres for a reason that has nothing to do with silhouettes, and that
		 * is the bug the gate below exists to close. */
		float fres = pow( 1.0 - ndv, uRimPower );
		float wrapRim = smoothstep( -0.35, 0.45, ndl );
		float rimBand = smoothstep( 0.26, 0.58, fres * mix( 0.60, 1.0, wrapRim ) );

		/* The silhouette gate — and the reason the counter-rim's post-mortem above did not go
		   far enough.
		 *
		 * 1 - N.V is high in two unrelated situations: at a silhouette, where the form turns
		 * away from the eye, and on a *flat face seen edge-on*, where nothing turns at all. The
		 * counter-rim was deleted for confusing the two. This term makes exactly the same
		 * confusion, and it is the larger offender of the two, because a floor running away
		 * from a standing camera is edge-on over most of its visible length. Worked through on
		 * the 'hero' camera: the open paving spans 11 to 21 degrees of grazing, i.e. N.V 0.19
		 * to 0.37, so fres runs 0.53 to 0.24 and rimBand from 0.91 down to 0 — nine tenths of a
		 * full-strength cool rim laid flat across the courtyard at its far edge, fading to
		 * nothing at the near one. The surface's own normal variation then cuts that gradient
		 * into the streaks the critic measured, and the same term at the same grazing angles is
		 * what draws the line at the wall/ground contact in 'guard' and quantises the dune
		 * ripple field into hard cyan quadrilaterals in 'dunes'.
		 *
		 * What separates the two cases is not the value of the fresnel but its *cause*. At a
		 * silhouette the normal sweeps through ninety degrees within a few pixels; on a plane it
		 * does not move at all, however grazing the plane is. The screen-space derivative of the
		 * interpolated normal measures precisely that, and is identically zero on any planar
		 * patch — which is what makes this a gate and not another tuning knob. Scaled by uRes.y
		 * it reads as "how far the normal turns per screen height", so a threshold means the
		 * same thing at any resolution: a courtyard floor is 0, a background dune 1-3, the
		 * silhouette band of a head or a limb 10-40.
		 *
		 * The second half of the gate is the sign of that turn, and it is what §7.3's "no
		 * ambient occlusion where forms meet" actually needs. A hard edge also turns the normal
		 * within a pixel, so magnitude alone would keep a rim on every crease — including the
		 * *concave* ones, which is precisely the wall-meets-ground contact the critic measured
		 * at '#598aa2', brighter than both surfaces it separates. Light does not rim a concave
		 * corner; occlusion darkens it. dot(dN, dP) is positive where the surface bulges toward
		 * the eye and negative where it folds away from it, so requiring it positive keeps the
		 * rim on chiselled convex edges and takes it off every contact in the game.
		 *
		 * uRimCurve = (0,0,0) disables the whole gate and restores the old term — kept as a
		 * knob so the A/B that established this is reproducible rather than a claim in a
		 * comment. */
		#ifdef FLAT_SHADED
			float slyTurn = 0.0;
			float slyConvex = 1.0;
		#else
			vec3 slyDNx = dFdx( vNormal ), slyDNy = dFdy( vNormal );
			float slyTurn = ( length( slyDNx ) + length( slyDNy ) ) * uRes.y;
			/* uRimCurve.z is a GLOBAL knob and must stay at 1.0. Setting it to 0 has been
			   measured and it reopens the defect the note above describes. Recorded here so
			   nobody pays for that A/B twice.

			   The convexity half is genuinely wrong about characters: it rejects 69.7-79.7% of
			   Sly's own fresnel rim band in all seven staged shots, cutting the mean gate from
			   ~1.000 (magnitude alone) to 0.203-0.302, and it cannot be repaired by threshold
			   because his normalised fold (-0.64) is indistinguishable from a real concave
			   crease (-0.645). The cause is faceting, not the test: on an analytic sphere,
			   convex by construction, slyFold < 0 fires on 0.0% of the rim band at every scale
			   from a temple column to Sly's head. Low-poly skinned quads straddle facet
			   boundaries; smooth geometry does not.

			   But it cannot simply be switched off globally, because it is the ONLY thing
			   suppressing a concave contact. At a wall-meets-ground wedge the magnitude half
			   reads exactly 0 over 918,322 planar px yet 1018 over the 1,279 crease px, and
			   smoothstep(3,10,1018) = 1.0 — wide open. Measured on hero, uRimCurve.z = 0 puts
			   an 824 px cyan line 329 px wide (13:1) back along the lintel edge, visually
			   indistinguishable from the ungated build.

			   So the fix is to exempt characters specifically, and the obvious spelling of that
			   does NOT work: a preprocessor test on USE_SKINNING is always false in a fragment
			   shader, because three defines it only in prefixVertex — three.module.js:6811 is
			   its one and only definition. An exemption has to come from a per-material define
			   set where character materials are built, which also means escaping this file's
			   single shared uniform block. */
			float slyFold = dot( slyDNx, dFdx( slyViewPos ) ) + dot( slyDNy, dFdy( slyViewPos ) );
			/* uRimSkinExempt is the exemption the note above says the fix has to be, spelled as a
			   varying rather than a define: three sets USE_SKINNING in prefixVertex only, so the
			   vertex stage is the only place that can answer "is this a skinned mesh", and it
			   answers it into vSlySkin. This is strictly better than a per-material define would
			   have been — the same material instance shared between a SkinnedMesh and a static
			   one gets the right answer on each, because the program cache already splits them.

			   Default 0, i.e. no behaviour change, so the A/B is a uniform poke and the shipping
			   frame is whatever the measurement says it should be, not whatever this edit does.
			   At 0 the arithmetic is an exact identity: mix(a,b,0) = a and z*(1-0*x) = z.

			   Verified before hand-off, without the capture lock, by compiling this program on
			   the same ANGLE/SwiftShader stack the harness uses — on a THREE.SkinnedMesh and a
			   THREE.Mesh — and reading vSlySkin straight out of the framebuffer through a
			   test-local debug write that bypasses the shading, the tonemap and the grade:
			   0 on the static mesh, 255 on the skinned one, gl.getError 0, no shader log.
			   Reproduce with scratchpad/compilecheck.mjs. */
			float slyConvex = mix( 1.0, step( 0.0, slyFold ),
				uRimCurve.z * ( 1.0 - uRimSkinExempt * vSlySkin ) );
		#endif
		/* uRimMagExempt: MEASURED NULL. Keep it at 0. Read this before trusting any figure
		 * attributing the character's rim loss to this gate — including the one in the commit
		 * that introduced this knob, which is overstated and is corrected here.
		 *
		 * What is solid. RESULT-rim3 §3 blamed the screen-space rimPlanar gate for temple's
		 * silhouette regression, by construction, from a chain of shader readings. gate5 moved
		 * the two knobs inside gateoff ONE AT A TIME — which no run had ever done; rim1's
		 * surfonly/screenonly split the two TERMS with both gates left on. Mean L lift vs
		 * norim over the character's silhouette band, one boot per row:
		 *
		 *   shot         base  planaroff  subj  magex  curveopen  oldrim   base2 (noise)
		 *   temple       3.77    3.70     3.67   3.75    16.43     21.80    3.64
		 *   sly-closeup  2.92    3.98     3.89   3.44     8.82      8.94    3.41
		 *   hero         4.40    4.68     4.47   4.39     7.01      7.30    4.31
		 *
		 * planaroff turns the screen gate off EVERYWHERE and moves the character by ±0.4 L, so
		 * rimPlanar is NOT the suppressor and rim3 §3's attribution is withdrawn. That much is
		 * measured three ways and stands.
		 *
		 * What does NOT follow, and what I asserted anyway. curveopen — this smoothstep opened
		 * for ALL geometry — lifts the character band 4-12 L, and I read that as "the magnitude
		 * half starves the character's rim". Then magex, which opens the identical smoothstep
		 * on exactly the skinned population, moves it by -0.02 / +0.53 / -0.01 L: inside the
		 * base-vs-base2 noise in all three shots. A subject-restricted change that reproduces
		 * none of its global version's effect on the subject means the global version's lift on
		 * those pixels was not coming from the subject's own surface. The prime suspect is the
		 * artefact this gate exists to remove: curveopen raises the paving immediately BEHIND
		 * him by +13 to +20 L, and bloom does not respect a silhouette.
		 *
		 * So this is the brief's own opening lesson arriving a second time in the same
		 * investigation — a knob moving the image proves it is connected, not that it is the
		 * cause — and gateoff/curveopen are global legs with the identical confound.
		 *
		 * The knob is kept, at 0, because it is the one clean way to ask the question again:
		 * it isolates the skinned population, which no global leg can. Whoever picks this up
		 * should first paint vSlySkin and rimMag straight to the framebuffer with the tonemap
		 * bypassed (scratchpad/compilecheck.mjs already proves that bypass on a known input) and
		 * confirm the population is what this file thinks it is, BEFORE tuning anything.
		 * At 0 the mix is an exact identity and the frame is bit-identical. */
		float rimMag = uRimCurve.y > uRimCurve.x
			? smoothstep( uRimCurve.x, uRimCurve.y, slyTurn ) : 1.0;
		rimMag = mix( rimMag, 1.0, uRimMagExempt * vSlySkin );
		float rimSil = rimMag * slyConvex;

		/* The mix( 0.55, 1.0, sh ) below is a shadow FLOOR: rim keeps 55% strength where the key
		   is fully shadowed. That floor is what carries night's silhouette rims (the whole shot
		   is sh~0 and it is the difference between a readable rooftop and mud — measured, base
		   traces every deck edge that norim loses). It is also the one term behind the single
		   bright-cool artefact rim2 left standing: hero's worn step lip at px (832-1056,500-620),
		   a ~1453 px cyan band on arch:sandstone_worn INSIDE cast shadow. Both gates pass it
		   honestly — a worn bevel turns the normal fast (magnitude open) and bulges toward the
		   eye (convex) — so the only property separating it from a rim we want is that it is lit
		   by nothing. Any fix lives in this floor (shape it by tod or by distance-to-key), and
		   its A/B must re-measure night before it ships, because night is what the 0.55 buys.

		   uRimShadowFloorArch is that A/B's scaffolding, and it is SCOPED rather than tuned.
		   The §24.3 trap is that narrowing the band narrows the CHARACTER's rim in the same
		   proportion — so the knob applies to non-skinned geometry only, and at vSlySkin = 1
		   the floor holds 0.55 at every arm by construction. That sidesteps the trap instead
		   of trading against it.
		   **Default 0.55 = bit-identical no-op**: mix(0.55, 0.55, x) is 0.55 for every x, so
		   the expression is the old one until someone pokes the uniform.
		   Registered in PREREG-kerb.md, and sized offline there at ~110 L of lift on hero's
		   kerb band against a 7.2 L luma margin over the artefact threshold — a cause fifteen
		   times its own margin. NOT SHIPPED and not measured in a frame: the A/B that decides
		   its value must re-measure night, and until it does, 0.55 is the shipping value. */
		float rimShadeFloor = mix( uRimShadowFloorArch, 0.55, vSlySkin );
		vec3 rim = uRimColor * ( uRim * uRimGain * rimBand * rimSil * mix( rimShadeFloor, 1.0, sh ) * mix( 0.45, 1.0, wrapRim ) );

		/* There used to be a second, sky-coloured "counter-rim" here for the shadow side. It
		   is gone, and its removal is a fix rather than a loss.

		   The bet it made was that a high fresnel means a silhouette. It does not: a *flat
		   face seen edge-on* reaches fres = 1 for exactly the same reason a silhouette does,
		   and there is no way to tell them apart from a normal and a view vector alone. So
		   the term fired hardest on the surfaces that needed it least, and every symptom
		   followed from that one confusion:

		     · 'guard' — a floor running to the horizon is edge-on at its far end, so the
		       wall/ground junction drew a saturated cyan line, '#598aa2' at L=129 between
		       surfaces at L=87 and L=65. A contact brighter than both surfaces it separates.
		     · 'hero' / 'courtyard' / 'dunes' / 'traversal' — flat top surfaces, viewed from a
		       standing camera, are all near-grazing: the critic logged every one of them as a
		       desaturated grey-green, off-palette in both directions.
		     · the obelisk's oblique shadow face lit up across its *whole* area rather than at
		       its edge, which is not a rim, it is a wash.

		   The screen-space rim in PostFX answers the question this term could not: it keys off
		   a depth discontinuity, so it fires on silhouettes and nowhere else, and it carries
		   its own shadow-side floor. That is where the shadow-side rim lives now. */

		vec3 emissiveTerm = totalEmissiveRadiance;

		outgoingLight = diff + sss + spec + metalEnv + rim + emissiveTerm;

		/* Deferred debug write. Both visualisers land AFTER the haze mix (see the note on the
		   debugShadow block); these two carry the value across. 0.0 = no channel selected, and
		   that is the shipping state on every draw. */
		vec3  slyDbg   = vec3( 0.0 );
		float slyDbgOn = 0.0;

		/* Shadow diagnostics. shading.debugShadow(mode) selects a channel set — each one
		   isolates a different link in the chain, so a bad frame names its own culprit:

		     1  R = shadow term   G = receiveShadow   B = N.L
		     2  RGB = cascade 0's shadow coordinate after the perspective divide. Must land
		        in 0..1 on R and G anywhere the near cascade is meant to cover.
		     3  R = the depth actually stored in cascade 0's map at this fragment's lookup,
		        G = the fragment's own projected depth, B = inside the map's [0,1] square.
		        R > G is lit, R < G is occluded; R flat at 0 or 1 means the map is empty
		        or the sampler is reading garbage rather than depth.
		     4  R/G = the cascade blend weights, i.e. which cascade this fragment resolved to.
		     9  SELF-CALIBRATION — the constants in DEBUG_CALIB.shadow. Run it first.

		   The value is COMPUTED here and APPLIED after the haze mix, next to debugTerm's.
		   It used to be applied here, which put every reading through mix( dbg, hazeColour,
		   haze ) on its way out: a channel that is 0.31 at 40 m because the term is 0.31, and
		   0.31 at 40 m because the term is 1.0 and the haze is thick, are the same pixel. That
		   is KNOWN_ISSUES §1's eight dead ends, and it was a four-line fix. Nothing shipped
		   moves: uDebugShadow defaults to 0, the block is not entered, and the write below is
		   gated on a flag that stays 0. */
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

			/* Mode 9 — SELF-CALIBRATION. Overrides every branch above deliberately: it must
			   be reachable whatever the #ifdef soup did or did not compile in, because its
			   whole job is to answer "does this channel reach the PNG at all". */
			if ( uDebugShadow > 8.5 ) dbg = ${ glslVec3( DEBUG_CALIB.shadow ) };

			slyDbg = dbg;
			slyDbgOn = 1.0;
		}

		/* Aerial perspective, in linear radiance, before tone mapping. Doing this with
		   three's flat sRGB-space fog would grey the whole frame out. */
		vec3 rd = slyDist > 1e-4 ? ( slyWP - cameraPosition ) / slyDist : vec3( 0.0, 0.0, -1.0 );
		float haze = slyHaze( cameraPosition, rd, slyDist ) * uHazeAmount;
		outgoingLight = mix( outgoingLight, slyHazeColor( rd ), haze );
		/* Emitters punch through haze — a torch at 60 m should still be a hot point. */
		outgoingLight += emissiveTerm * haze * 0.6;

		/* ---- rim-gate term visualiser. shading.debugTerm(n); 0 = off and bit-identical. ----
		 *
		 * This exists because §20 ended with "no un-confounded lever has moved this character's
		 * rim at all", and the way past that is to stop inferring the terms from their effect on
		 * a graded frame and read them directly. KNOWN_ISSUES §1 is the standing warning about
		 * how NOT to do it: debugShadow writes into outgoingLight and is then carried through
		 * haze, AgX, the grade, the split-tone and bloom, so it reports the pipeline rather than
		 * the value, and it cost eight dead ends.
		 *
		 * Two things make this one a measurement instead of a repeat of that:
		 *
		 *   1. It is written HERE — after the haze mix, which is the last statement in this
		 *      shader — so nothing downstream *in this file* can touch it. debugShadow now
		 *      lands here too, through slyDbg; it used to write ~50 lines earlier and be hazed
		 *      on its way out.
		 *   2. PostFX.debugRaw(true) blits the scene target straight to the canvas, skipping
		 *      AO, the ink pass, bloom, the composite (exposure/lift/gain/split/saturation/
		 *      contrast/AgX/sRGB) and FXAA. Without that half, everything below is a lie.
		 *
		 * Mode 4 is the calibration: it writes DEBUG_CALIB.term's constants, which must arrive
		 * at the PNG as (64, 128, 191) ±1 on every toon-shaded pixel. If it does not, the
		 * bypass is not a bypass and no other mode's numbers mean anything. Prove it first —
		 * that is the §1 lesson stated as a procedure.
		 *
		 * **What a mode-4 failure means, stated precisely, because it has already been misread
		 * once at a cost of a day.** The calibration does not distinguish "the bypass leaks"
		 * from "this program never ran". §210.2 read zero calibration pixels and concluded
		 * debugTerm does not reach the shader; the true cause was that the whole cel fragment
		 * program had stopped LINKING nineteen minutes earlier (a stray close-comment marker,
		 * commit 6e0cc8f), so there were no toon pixels of any kind to carry the constants.
		 * A dead program and a leaky bypass look identical from the PNG. Ask the driver, not
		 * the image: shading.programHealth() reads LINK_STATUS and the info log off every
		 * program this module built, and debugTerm() / debugShadow() now call it for you and
		 * warn. Order of interrogation is programHealth -> mode 4 -> anything else.
		 *
		 * Mode 4 doubles as the population map: every pixel that reaches this shader is stamped
		 * with a colour nothing else in the frame produces, so "is this pixel toon-shaded" stops
		 * being a guess made from a graded image.
		 *
		 * Caveat that travels with the numbers: sceneRT is allocated with engine.settings.msaa
		 * samples, and a resolve AVERAGES these values across a geometry edge — which is exactly
		 * where the rim band lives. Read interiors of bands, not their outermost pixel, or
		 * capture with msaa 0.
		 *
		 * Mode 5 is the RAMP channel, added for the defect critic pass 7 called "there is no toon
		 * ramp anywhere". It writes vec3( ramp, ndl, key ) — the quantised diffuse ramp, the raw
		 * N.L that feeds it, and their product with the shadow term. Every other channel here
		 * reports the rim; nothing reported the one term the whole cel look rests on, which is why
		 * two sealed experiments had to infer the ramp's behaviour from a graded, grain-covered,
		 * albedo-textured composite instead of reading it.
		 *
		 * What it settles that a flat-area metric cannot: with bands 3 the terminators sit at
		 * N.L 0.14 and 0.52 (uTermLo/uTermHi, +/- uTermSoft 0.024), so above 0.544 the ramp is a
		 * flat 1.0 by construction. If G (ndl) shows these surfaces living entirely above 0.544
		 * then the ramp is CORRECT and flat, and the residual variation the metric was scoring
		 * belongs to albedo texture, the shadow penumbra or the rim — none of which is the ramp.
		 * Read R against G, not R alone.
		 *
		 * Mode 6 is the SPECULAR INCIDENCE channel (PREREG-hilite2 §5). It writes
		 * vec3( specStep / 1.35, lobe, sh * step( 0.02, ndl ) ) — the quantiser normalised to its
		 * own ceiling, the raw Blinn lobe under it, and the pair of gates that decide whether the
		 * term runs at all. It exists because "the highlight is too dim" and "the highlight never
		 * lands" are indistinguishable in a composite, and they have opposite fixes: the first is
		 * amplitude (uSpec, uSpecKey) and the second is geometry, which no amount of gain can
		 * reach. B is 0 on every surface the sun does not touch, and R is the fraction of the
		 * quantiser's ceiling actually reached — R = 1 is a saturated highlight core, and the
		 * share of the frame at R = 1 with B = 1 is the population any amplitude lever can move.
		 * Read B first: where B is 0, R and G are meaningless because spec is multiplied out. */
		if ( uDebugShadow > 0.5 && slyDbgOn > 0.5 ) outgoingLight = slyDbg;

		if ( uDebugTerm > 0.5 ) {
			vec3 dbgT;
			if      ( uDebugTerm < 1.5 ) dbgT = vec3( vSlySkin, rimMag, slyConvex );
			else if ( uDebugTerm < 2.5 ) dbgT = vec3( rimBand, rimSil, rimBand * rimSil );
			else if ( uDebugTerm < 3.5 ) dbgT = vec3( clamp( slyTurn / 40.0, 0.0, 1.0 ), ndv, fres );
			else if ( uDebugTerm < 4.5 ) dbgT = ${ glslVec3( DEBUG_CALIB.term ) };
			else if ( uDebugTerm < 5.5 ) dbgT = vec3( ramp, ndl, key );
			else if ( uDebugTerm < 6.5 ) dbgT = vec3( specStep / 1.35, lobe, sh * step( 0.02, ndl ) );
			/* 7 — the per-material CLASS MAP (PREREG-specnorm §7). §262's per-class table was
			   MODELLED, and its fallback — classifying a delta by whether its tint is warm —
			   is a two-class split that cannot tell sandstone from limestone.
			   R = uSpec identifies the class (23 distinct values in the live census).
			   B = slyMetal separates metal from dielectric.
			   G = glossP/128 carries the PER-PIXEL gloss exponent, which varies inside a single
			   material with ormG, and therefore names the exact normalisation factor applied at
			   that pixel. Read it against the mode-4 mask like every other reading mode. */
			else if ( uDebugTerm < 7.5 ) dbgT = vec3( uSpec, glossP / 128.0, slyMetal );
			/* 8 — the class map again, with the B channel replaced by vSlySkin
			   (PREREG-specnorm2 §2). Mode 7's B is slyMetal, i.e. uMetal TIMES the metalness
			   map — a per-pixel TEXTURE read. That is a useful picture of where the gilding is
			   and it is a terrible class key: it shatters one material into a bucket per mask
			   level, which is how PREREG-specnorm's I5 went BLIND (§263.1).

			   vSlySkin is 1.0 on a SkinnedMesh and 0.0 otherwise, so it quantises to 255 or 0
			   and a small additive offset cannot move it across a 0.5 threshold. That matters
			   for a second reason (§263.2): the mode-4 mask requires the calibration triple
			   EXACTLY, and over the character mode 4 arrives as the triple PLUS an offset, so
			   an exact-match mask silently drops the subject. A guard scoped to the character
			   must take its denominator from THIS channel, not from mode 4.

			   Mode 7 is left exactly as it was — it is already published in §263 and
			   re-defining a documented channel would make old frames unreadable. */
			else                         dbgT = vec3( uSpec, glossP / 128.0, vSlySkin );
			outgoingLight = dbgT;
		}
	}
`;

/* ---------------------------------------------------------------------------
   Inverted-hull outline shell.
--------------------------------------------------------------------------- */

export const OUTLINE_VERT = /* glsl */ `
#define SLY_OUTLINE

attribute vec3 slyNormal;   // position-welded, averaged normal (see Outline.js)

/* Per-vertex ink weight, derived from geometry.groups + each group material's
   userData.outline (see Outline.js applyInkWeights). It exists because Sly is ONE
   SkinnedMesh with a material ARRAY: three renders the single-material shell as one draw,
   so the per-material outline weight that outlineAll() already honours for props was
   being thrown away for the one mesh that most needs it. A float stream costs no extra
   draw call, where giving the shell a material array would cost one draw per group.

   ALWAYS WRITTEN. buildOutlineShell is the only path that creates a shell and it fills
   this for every geometry, uniformly 1.0 where nothing asks otherwise. That is not
   defensive tidiness: an unbound float attribute reads 0.0 from the generic vertex
   attribute, which would silently collapse EVERY ink line in the game.

   (No backticks in this file's comments — the GLSL lives in a template literal and a
   stray backtick terminates it, which is a boot-time SyntaxError, not a shader warning.) */
attribute float slyInk;

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
	/* Multiplying by slyInk is bit-exact at the shipped weight of 1.0 — unlike §119.5's
	   mix(x, x, a), an IEEE754 multiply by exactly 1.0 returns its operand unchanged. The
	   null arm still measures it rather than trusting that (§119.3 P1). */
	float w = uThickness * slyInk * mix( 1.0, 0.62, smoothstep( 18.0, uFalloff, dist ) );
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
