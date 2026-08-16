import * as THREE from 'three';
import { TILE, PAL } from './Emitters.js';

/**
 * Trails — ribbon trails: the gold cane arc, motion streaks, anything that needs to draw
 * where a thing has *been*.
 *
 * A trail is a fixed-length history of world points, rebuilt into a camera-facing strip every
 * frame. The buffers are allocated once and shifted with `copyWithin`, so a live trail costs
 * a couple of hundred float writes and zero garbage.
 *
 * Two decisions that make it read like Sly's cane rather than like a ribbon primitive:
 *
 *  · **Width tapers to a point** at the tail with a `pow` curve, and the head is the widest
 *    part — the shape of a swing, not a streamer.
 *  · **Opacity is driven by segment speed.** A cane held still draws nothing; a cane swung
 *    hard draws a solid gold arc. The trail therefore never has to be turned on and off by
 *    hand, and it can't leave a stripe hanging in a screenshot where nothing is moving.
 */

const TRAIL_VERT = /* glsl */`
precision highp float;
attribute float aFade;      // 0 at the tail, 1 at the head
attribute float aAlpha;     // per-point speed gate
varying vec2 vUv;
varying float vFade;
varying float vAlpha;
void main() {
  vUv = uv;
  vFade = aFade;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const TRAIL_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uAtlas;
uniform vec3 uHead;
uniform vec3 uTail;
uniform float uOpacity;
uniform float uTile;
uniform float uFxMaskPass;   // PREREG-fxink2 coverage pass; 0 = shipped path
varying vec2 vUv;
varying float vFade;
varying float vAlpha;
void main() {
  vec2 tileXY = vec2( mod( uTile, 4.0 ), floor( uTile * 0.25 ) );
  vec2 uvA = tileXY * 0.25 + vec2( 0.02 ) + vec2( vUv.x, clamp( vUv.y, 0.02, 0.98 ) ) * 0.21;
  vec4 t = texture2D( uAtlas, uvA );
  // Hard-ish core with a quick shoulder: a soft gaussian ribbon reads as smoke, not metal.
  float across = 1.0 - smoothstep( 0.55, 1.0, abs( vUv.x * 2.0 - 1.0 ) );
  float a = t.a * across * vFade * vAlpha * uOpacity;
  if ( a < 0.004 ) discard;
  vec3 col = mix( uTail, uHead, vFade * vFade );
  /* PREREG-fxink2 coverage pass — the swing band is the r11 defect this seal is named for.
     Same limitation as SPARKLE_FRAG: no depth uniform here, so an occluded trail segment marks
     the mask (over-cut, not under-cut) and the containment bars measure it. */
  if ( uFxMaskPass > 0.5 ) { gl_FragColor = vec4( vec3( clamp( a, 0.0, 1.0 ) ), 1.0 ); return; }

  gl_FragColor = vec4( col, a );
  #include <colorspace_fragment>
}
`;

const _wp = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _side = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _next = new THREE.Vector3();

export class Trails {
  constructor(engine, { atlas } = {}) {
    this.engine = engine;
    this.atlas = atlas;
    this.root = new THREE.Group();
    this.root.name = 'fx.trails';
    this.root.matrixAutoUpdate = false;
    this.list = [];
  }

  /**
   * @param {THREE.Object3D} object3d  the thing to follow
   * @param {object} opts  { offset, segments, width, headColor, tailColor, speedFor, opacity }
   */
  add(object3d, opts = {}) {
    if (!object3d) return null;
    const segments = Math.max(4, Math.min(64, opts.segments ?? 22));
    const n = segments + 1;

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 2 * 3);
    const uvs = new Float32Array(n * 2 * 2);
    const fade = new Float32Array(n * 2);
    const alpha = new Float32Array(n * 2);
    const index = new Uint16Array(segments * 6);
    for (let i = 0; i < n; i++) {
      const f = 1 - i / segments;                  // 1 at the head, 0 at the tail
      uvs[(i * 2) * 2] = 0; uvs[(i * 2) * 2 + 1] = 1 - f;
      uvs[(i * 2 + 1) * 2] = 1; uvs[(i * 2 + 1) * 2 + 1] = 1 - f;
      fade[i * 2] = f; fade[i * 2 + 1] = f;
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      index.set([a, b, c, b, d, c], i * 6);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      name: 'fx.trail',
      uniforms: {
        uAtlas: { value: this.atlas },
        uHead: { value: new THREE.Color().setHex(opts.headColor ?? PAL.goldSpec, THREE.SRGBColorSpace).multiplyScalar(1.9) },
        uTail: { value: new THREE.Color().setHex(opts.tailColor ?? PAL.goldMid, THREE.SRGBColorSpace).multiplyScalar(0.7) },
        uOpacity: { value: opts.opacity ?? 1 },
        uTile: { value: opts.tile ?? TILE.STREAK },
        uFxMaskPass: opts.maskPass ?? { value: 0 },  // PREREG-fxink2 (0 = shipped path)
      },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      userData: { outline: 0 },   // §381.3: FX takes no hull — see the Batch material's note
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: opts.blending ?? THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'fx.trail';
    mesh.frustumCulled = false;
    mesh.renderOrder = 16;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;

    const h = {
      object: object3d,
      offset: opts.offset ? opts.offset.clone() : null,
      segments, n,
      halfWidth: (opts.width ?? 0.14) * 0.5,
      taper: opts.taper ?? 1.6,
      speedFor: opts.speedFor ?? 6.0,       // m/s at which the trail is fully opaque
      pts: new Float32Array(n * 3),
      spd: new Float32Array(n),
      filled: 0,
      mesh, geo, mat, positions, alpha,
      alive: true,
    };
    // Opt out of POSTFX's override (normal-buffer) pass — see Particles.js.
    mesh.onBeforeRender = function (r, s, c, geometry, material) {
      if (material !== mat) geometry.setDrawRange(0, 0);
    };
    mesh.onAfterRender = function (r, s, c, geometry, material) {
      if (material !== mat) geometry.setDrawRange(0, Infinity);
    };

    this.root.add(mesh);
    this.list.push(h);
    return h;
  }

  remove(handle) {
    if (!handle) return;
    const i = this.list.indexOf(handle);
    if (i >= 0) this.list.splice(i, 1);
    handle.alive = false;
    handle.mesh.removeFromParent();
    handle.geo.dispose();
    handle.mat.dispose();
  }

  update(dt, t) {
    if (!this.list.length) return;
    this.engine.camera.getWorldPosition(_cam);

    for (let k = 0; k < this.list.length; k++) {
      const h = this.list[k];
      if (!h.object || !h.object.parent) { h.mesh.visible = false; continue; }

      h.object.updateWorldMatrix(true, false);
      if (h.offset) _wp.copy(h.offset).applyMatrix4(h.object.matrixWorld);
      else _wp.setFromMatrixPosition(h.object.matrixWorld);

      const pts = h.pts, spd = h.spd, n = h.n;
      if (h.filled === 0) {
        for (let i = 0; i < n; i++) { pts[i * 3] = _wp.x; pts[i * 3 + 1] = _wp.y; pts[i * 3 + 2] = _wp.z; spd[i] = 0; }
        h.filled = 1;
      } else {
        const dx = _wp.x - pts[0], dy = _wp.y - pts[1], dz = _wp.z - pts[2];
        const step = Math.hypot(dx, dy, dz);
        // A teleport (shot staging, respawn) must not draw a kilometre-long streak.
        if (step > 3.0) {
          for (let i = 0; i < n; i++) { pts[i * 3] = _wp.x; pts[i * 3 + 1] = _wp.y; pts[i * 3 + 2] = _wp.z; spd[i] = 0; }
        } else {
          pts.copyWithin(3, 0, (n - 1) * 3);
          spd.copyWithin(1, 0, n - 1);
          pts[0] = _wp.x; pts[1] = _wp.y; pts[2] = _wp.z;
          spd[0] = dt > 1e-5 ? step / dt : 0;
        }
      }

      /* Build the strip. Width tapers to a point at the tail; opacity comes from how fast
         the head was moving when each point was laid down. */
      const pos = h.positions, alpha = h.alpha;
      let anyAlpha = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        _wp.set(pts[o], pts[o + 1], pts[o + 2]);
        const pi = Math.max(0, i - 1) * 3, ni = Math.min(n - 1, i + 1) * 3;
        _prev.set(pts[pi], pts[pi + 1], pts[pi + 2]);
        _next.set(pts[ni], pts[ni + 1], pts[ni + 2]);
        _tan.subVectors(_prev, _next);
        if (_tan.lengthSq() < 1e-10) _tan.set(0, 1, 0);
        _toCam.subVectors(_cam, _wp);
        _side.crossVectors(_tan, _toCam);
        if (_side.lengthSq() < 1e-10) _side.set(1, 0, 0);
        _side.normalize();

        const f = 1 - i / h.segments;
        const w = h.halfWidth * Math.pow(Math.max(f, 0), 1 / h.taper);
        const a = Math.min(1, spd[i] / h.speedFor);
        anyAlpha = Math.max(anyAlpha, a * f);

        const v0 = (i * 2) * 3, v1 = (i * 2 + 1) * 3;
        pos[v0] = _wp.x - _side.x * w; pos[v0 + 1] = _wp.y - _side.y * w; pos[v0 + 2] = _wp.z - _side.z * w;
        pos[v1] = _wp.x + _side.x * w; pos[v1 + 1] = _wp.y + _side.y * w; pos[v1 + 2] = _wp.z + _side.z * w;
        alpha[i * 2] = a; alpha[i * 2 + 1] = a;
      }

      h.geo.attributes.position.needsUpdate = true;
      h.geo.attributes.aAlpha.needsUpdate = true;
      h.mesh.visible = anyAlpha > 0.02;
    }
  }

  dispose() {
    for (const h of this.list.slice()) this.remove(h);
    this.list.length = 0;
    this.root.removeFromParent();
  }
}
