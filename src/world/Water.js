import * as THREE from 'three';

/**
 * The Nile. Cel-shaded, not photoreal: the sun glitter is a hard-stepped band pattern
 * rather than a smooth Fresnel highlight, because a physically-correct water shader next
 * to banded toon sandstone reads as a bug (AGENTS.md §2.1).
 *
 * It is the brightest thing in the `dunes` shot, so the glitter carries that frame.
 */

const TUNE = {
  segments: 96,
  waveA: { len: 7.4, amp: 0.085, speed: 0.42, dir: [0.9, 0.44] },
  waveB: { len: 3.1, amp: 0.045, speed: 0.63, dir: [-0.5, 0.86] },
  waveC: { len: 1.35, amp: 0.018, speed: 0.95, dir: [0.3, -0.95] },
  glitterScale: 34.0,      // spatial frequency of the specular band pattern
  glitterSpeed: 0.16,
  foamWidth: 1.15,         // metres of shore foam
};

/* §2.2-derived. The Nile at golden hour: deep teal body, warm sky reflection, gold glitter. */
const PAL = {
  deep: new THREE.Color(0x1c3f52),
  shallow: new THREE.Color(0x3f7d78),
  skyTint: new THREE.Color(0x6fa8d8),
  sunTint: new THREE.Color(0xffe9a8),
  foam: new THREE.Color(0xe8ddc4),
};

export class Water {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {import('./Terrain.js').Terrain} terrain
   */
  constructor(engine, terrain) {
    this.engine = engine;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'water';
    this.mesh = null;
    this.material = null;
    this.geometry = null;
  }

  async init() {
    const T = this.terrain.tune;

    // The river runs north–south west of the complex. Span it generously past the camera
    // frustum in every canonical shot so there is never a visible edge.
    const x0 = T.nileFar, x1 = T.nileEast + 6;
    const z0 = -420, z1 = 340;
    const w = x1 - x0, d = z1 - z0;

    this.geometry = new THREE.PlaneGeometry(w, d, TUNE.segments, TUNE.segments);
    this.geometry.rotateX(-Math.PI / 2);
    this.geometry.translate(x0 + w / 2, T.waterY, z0 + d / 2);

    this.material = this._buildMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'nile';
    this.mesh.receiveShadow = false;   // a shadowed water plane just looks like dirt
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    this.terrain.group.add(this.group);

    // Falling in is a soft fail, not a hazard — MOVEMENT decides what to do with it.
    this.engine.registerCollider(this.mesh, { tag: 'water', material: 'water' });
  }

  _buildMaterial() {
    const sky = this.engine.get('sky');

    const uniforms = {
      uTime: { value: 0 },
      uDeep: { value: PAL.deep.clone() },
      uShallow: { value: PAL.shallow.clone() },
      uSkyTint: { value: PAL.skyTint.clone() },
      uSunTint: { value: PAL.sunTint.clone() },
      uFoam: { value: PAL.foam.clone() },
      uSunDir: { value: new THREE.Vector3(-0.62, 0.38, 0.68).normalize() },
      uWaterY: { value: this.terrain.tune.waterY },
      uBankX: { value: this.terrain.tune.nileEast },
      uFoamWidth: { value: TUNE.foamWidth },
      uGlitterScale: { value: TUNE.glitterScale },
      uGlitterSpeed: { value: TUNE.glitterSpeed },
      uFogColor: { value: new THREE.Color(0xe8b878) },
      uFogDensity: { value: 0.0055 },
    };
    this.uniforms = uniforms;

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
      vertexShader: /* glsl */`
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vShore;

        // Three gerstner-ish sine waves. Cheap, and at this viewing distance the extra
        // realism of true Gerstner displacement is invisible.
        vec3 wave(vec2 p, vec2 dir, float len, float amp, float speed, out vec2 slope) {
          float k = 6.28318 / len;
          float f = k * dot(normalize(dir), p) - uTime * speed * k;
          slope = normalize(dir) * (amp * k * cos(f));
          return vec3(0.0, amp * sin(f), 0.0);
        }

        void main() {
          vec3 p = position;
          vec2 s1, s2, s3;
          p += wave(position.xz, vec2(0.9, 0.44),  7.40, 0.085, 0.42, s1);
          p += wave(position.xz, vec2(-0.5, 0.86), 3.10, 0.045, 0.63, s2);
          p += wave(position.xz, vec2(0.3, -0.95), 1.35, 0.018, 0.95, s3);

          vec2 slope = s1 + s2 + s3;
          vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));

          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          // Shore proximity, for foam and for shallow-water tinting.
          vShore = wp.x;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3  uDeep, uShallow, uSkyTint, uSunTint, uFoam, uFogColor;
        uniform vec3  uSunDir;
        uniform float uBankX, uFoamWidth, uGlitterScale, uGlitterSpeed, uFogDensity;
        varying vec3  vWorld;
        varying vec3  vNormal;
        varying float vShore;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                     mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }

        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorld);

          // Depth by distance from the east bank — shallows go green, the channel goes dark.
          float shallowT = clamp((uBankX - vShore) / 46.0, 0.0, 1.0);
          vec3 body = mix(uShallow, uDeep, shallowT);

          // Banded sky reflection. Quantising the Fresnel is what keeps it in the same
          // visual language as the cel-shaded stone around it.
          float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
          float fresBand = floor(fres * 4.0) / 4.0;
          vec3 col = mix(body, uSkyTint, fresBand * 0.72);

          // Hard-stepped sun glitter: an animated interference pattern, thresholded so it
          // breaks into discrete sparkles instead of a smooth sheen.
          vec2 gp = vWorld.xz * (uGlitterScale / 34.0);
          float g = vnoise(gp * 1.7 + vec2(uTime * uGlitterSpeed, uTime * uGlitterSpeed * 0.6))
                  * vnoise(gp * 3.1 - vec2(uTime * uGlitterSpeed * 0.8, 0.0));
          vec3  H = normalize(uSunDir + V);
          float spec = pow(clamp(dot(N, H), 0.0, 1.0), 90.0);
          float glint = smoothstep(0.44, 0.52, g + spec * 1.6);
          col += uSunTint * glint * 1.35;

          // A second, broader warm sheen along the sun's azimuth keeps the river from
          // going flat where the glitter pattern is sparse.
          col += uSunTint * pow(clamp(dot(N, H), 0.0, 1.0), 14.0) * 0.16;

          // Shore foam: a soft band at the waterline, broken up with noise so it isn't a stripe.
          float shoreD = abs(uBankX - vShore);
          float foamMask = 1.0 - smoothstep(0.0, uFoamWidth, shoreD);
          foamMask *= 0.55 + 0.45 * vnoise(vWorld.xz * 2.6 + uTime * 0.35);
          col = mix(col, uFoam, clamp(foamMask, 0.0, 1.0) * 0.7);

          // Match the scene's aerial perspective, or the far river reads as a hard blue slab.
          float dist = length(cameraPosition - vWorld);
          float fog = 1.0 - exp(-uFogDensity * dist);
          col = mix(col, uFogColor, clamp(fog, 0.0, 0.92));

          // Edge-on water is more reflective and more opaque; looking down into it, less so.
          float alpha = mix(0.80, 0.97, fresBand);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    // Keep the sun direction in step with LIGHTING if it exists, so the glitter is on the
    // correct side of the river.
    const lighting = this.engine.get('lighting');
    if (lighting?.sunDirection) uniforms.uSunDir.value.copy(lighting.sunDirection).normalize();
    if (sky?.fogParams) {
      uniforms.uFogColor.value.set(sky.fogParams.color ?? 0xe8b878);
      uniforms.uFogDensity.value = sky.fogParams.density ?? 0.0055;
    }

    return mat;
  }

  update(dt, t) {
    if (!this.uniforms) return;
    this.uniforms.uTime.value = t;

    // Re-sync with the lighting/sky agents each frame; time of day moves both.
    const lighting = this.engine.get('lighting');
    if (lighting?.sunDirection) this.uniforms.uSunDir.value.copy(lighting.sunDirection).normalize();
    const sky = this.engine.get('sky');
    if (sky?.fogParams) {
      this.uniforms.uFogColor.value.set(sky.fogParams.color ?? 0xe8b878);
      this.uniforms.uFogDensity.value = sky.fogParams.density ?? 0.0055;
    }
  }

  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}
