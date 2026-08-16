import * as THREE from 'three';
import { rng } from '../core/Rand.js';
import { TILE, PAL } from './Emitters.js';

/**
 * Decals — projected surface marks: dive-attack cracks, landing scuffs, scorch.
 *
 * One instanced draw for the whole pool. A decal is an oriented quad lifted a couple of
 * centimetres along the surface normal and drawn with depth *test* but no depth *write* and
 * a polygon offset, which is the cheap projection that suits a cel-shaded game: real
 * box-projected decals buy correctness around corners that nobody sees at this scale, at the
 * cost of a second geometry pass.
 *
 * Fade is analytic in the vertex shader, same as particles: `hold` for most of the life, then
 * a fast dissolve, so a crack looks like damage rather than like a projector timing out.
 */

/* Exported so a test can enumerate it — `SMASH` in Emitters.js names decals by string, and a
   recipe pointing at a decal that does not exist would otherwise fall through to `scuff` at
   runtime (see `add()`) and look like a styling choice rather than a typo. Same reason
   `SFX_NAMES` and `SECTION_NAMES` are exported. */
export const DECALS = {
  crack: { tile: TILE.CRACK, life: 14, size: 2.2, alpha: 0.85, color: 0x4a2f22, hold: 0.72, spin: true },
  scuff: { tile: TILE.SCORCH, tile2: true, life: 6, size: 1.6, alpha: 0.42, color: PAL.sandLight, hold: 0.45, spin: true },
  scorch: { tile: TILE.SCORCH, life: 20, size: 1.2, alpha: 0.7, color: 0x241a16, hold: 0.8, spin: true },
  dust_ring: { tile: TILE.RING, life: 3, size: 2.0, alpha: 0.35, color: PAL.sandMid, hold: 0.3, spin: false },
};

const DECAL_VERT = /* glsl */`
precision highp float;
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec4 aData;    // t0, life, tile, rot
attribute vec4 aStyle;   // size, alpha, hold, unused
attribute vec3 aColor;

uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;

void main() {
  float age = uTime - aData.x;
  float life = max( aData.y, 1e-3 );
  float u = age / life;
  if ( age < 0.0 || u >= 1.0 ) {
    vUv = vec2( 0.0 ); vCol = vec4( 0.0 );
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    return;
  }

  vec3 n = normalize( aNormal + vec3( 0.0, 1e-4, 0.0 ) );
  vec3 t1 = normalize( cross( n, abs( n.y ) > 0.9 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 ) ) );
  vec3 t2 = cross( n, t1 );
  float cs = cos( aData.w ), sn = sin( aData.w );
  vec2 c = ( uv - 0.5 ) * 2.0;
  vec2 r = vec2( c.x * cs - c.y * sn, c.x * sn + c.y * cs );

  // Punch in fast (impact damage appears instantly), hold, then dissolve.
  float grow = smoothstep( 0.0, 0.06, u );
  float fade = 1.0 - smoothstep( aStyle.z, 1.0, u );

  vec3 p = aPos + n * 0.03 + ( t1 * r.x + t2 * r.y ) * aStyle.x * mix( 0.82, 1.0, grow );
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;

  vec2 tileXY = vec2( mod( aData.z, 4.0 ), floor( aData.z * 0.25 ) );
  vUv = tileXY * 0.25 + vec2( 0.02 ) + uv * 0.21;
  vCol = vec4( aColor, aStyle.y * fade * grow );
}
`;

const DECAL_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 t = texture2D( uAtlas, vUv );
  float a = t.a * vCol.a;
  if ( a < 0.005 ) discard;
  gl_FragColor = vec4( vCol.rgb * ( 0.55 + 0.45 * t.r ), a );
  #include <colorspace_fragment>
}
`;

const _n = new THREE.Vector3();
const _c = new THREE.Color();

export class Decals {
  constructor(engine, { atlas, capacity = 96 } = {}) {
    this.engine = engine;
    this.capacity = capacity;
    this.rand = rng(0xdeca1);
    /* Birth times are stamped on FX's clock, not the engine's — Particles rebases that clock
       when a shot is staged so a capture cannot depend on how long the boot took, and a decal
       stamped with engine time would then be born hundreds of seconds in the future. */
    this._t = 0;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    geo.instanceCount = 0;

    const mk = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.aPos = mk('aPos', 3);
    this.aNormal = mk('aNormal', 3);
    this.aData = mk('aData', 4);
    this.aStyle = mk('aStyle', 4);
    this.aColor = mk('aColor', 3);
    this.attrs = [this.aPos, this.aNormal, this.aData, this.aStyle, this.aColor];

    this.material = new THREE.ShaderMaterial({
      name: 'fx.decals',
      uniforms: { uTime: { value: 0 }, uAtlas: { value: atlas } },
      vertexShader: DECAL_VERT,
      fragmentShader: DECAL_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'fx.decals';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.matrixAutoUpdate = false;
    const self = this;
    // Same override-pass opt-out as the particle batches: a decal has no useful normal for
    // POSTFX's crease buffer and would get inked into a black rectangle.
    this.mesh.onBeforeRender = function (r, s, c, geometry, material) {
      if (material !== self.material) { self._stash = geometry.instanceCount; geometry.instanceCount = 0; }
    };
    this.mesh.onAfterRender = function (r, s, c, geometry, material) {
      if (material !== self.material && self._stash !== undefined) {
        geometry.instanceCount = self._stash; self._stash = undefined;
      }
    };

    this.geometry = geo;
    this._head = 0;
    this._used = 0;
    this._deathMax = -1;
    this._dirty = false;
  }

  /** @returns {number} slot index, usable as a handle for `remove()` */
  add(name, position, normal, opts = {}) {
    const def = DECALS[name] || DECALS.scuff;
    if (!position) return -1;
    const R = this.rand;
    const i = this._head;
    this._head = (this._head + 1) % this.capacity;
    if (i + 1 > this._used) this._used = i + 1;

    const t = this._t;
    const life = opts.life ?? def.life;
    this._deathMax = Math.max(this._deathMax, t + life);

    _n.copy(normal || _n.set(0, 1, 0));
    if (_n.lengthSq() < 1e-8) _n.set(0, 1, 0);
    _n.normalize();

    this.aPos.array[i * 3 + 0] = position.x;
    this.aPos.array[i * 3 + 1] = position.y;
    this.aPos.array[i * 3 + 2] = position.z;
    this.aNormal.array[i * 3 + 0] = _n.x;
    this.aNormal.array[i * 3 + 1] = _n.y;
    this.aNormal.array[i * 3 + 2] = _n.z;

    this.aData.array[i * 4 + 0] = t;
    this.aData.array[i * 4 + 1] = life;
    this.aData.array[i * 4 + 2] = opts.tile ?? def.tile;
    this.aData.array[i * 4 + 3] = def.spin ? R.range(0, 6.2832) : 0;

    this.aStyle.array[i * 4 + 0] = (opts.size ?? def.size) * 0.5 * R.range(0.92, 1.1);
    this.aStyle.array[i * 4 + 1] = opts.alpha ?? def.alpha;
    this.aStyle.array[i * 4 + 2] = opts.hold ?? def.hold;
    this.aStyle.array[i * 4 + 3] = 0;

    _c.setHex(opts.color ?? def.color, THREE.SRGBColorSpace);
    this.aColor.array[i * 3 + 0] = _c.r;
    this.aColor.array[i * 3 + 1] = _c.g;
    this.aColor.array[i * 3 + 2] = _c.b;

    this._dirty = true;
    return i;
  }

  /**
   * Drop every live decal. Called by `Particles._stageShot`, which runs twice per capture and
   * rebases this clock on both calls — without it the first staging's marks are reborn at the
   * origin under the second's, and a `crack` painted twice at the same point is twice the ink.
   * Same shape as `Batch.clear()`, and for the same reason.
   */
  clear() {
    this._used = 0;
    this._head = 0;
    this._deathMax = -1;
    this._dirty = true;
  }

  remove(handle) {
    if (handle == null || handle < 0 || handle >= this.capacity) return;
    this.aData.array[handle * 4 + 1] = 0.0001;   // expire it next frame
    this._dirty = true;
  }

  update(dt, t) {
    this._t = t;
    this.material.uniforms.uTime.value = t;
    if (this._used > 0 && t > this._deathMax) { this._used = 0; this._head = 0; this._deathMax = -1; }
    if (this._dirty) {
      for (const a of this.attrs) a.needsUpdate = true;
      this._dirty = false;
    }
    this.geometry.instanceCount = this._used;
    // One-sided empty fold — same shape as Particles' Batch._fold and for the same reason:
    // a pool with zero live decals should not sit in the render list, and the mesh is only
    // ever re-shown if this guard was what hid it.
    if (this._used === 0) {
      if (this.mesh.visible) { this.mesh.visible = false; this._autoHidden = true; }
    } else if (this._autoHidden) {
      this.mesh.visible = true; this._autoHidden = false;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
