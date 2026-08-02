import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/Rand.js';

/**
 * Everything that grows. Date palms are the hero plant — they frame shots (AGENTS.md §2.3
 * wants a dark foreground element) and they read almost entirely in silhouette, so the
 * frond shapes get the detail budget and the trunk gets the character.
 *
 * Everything is instanced with a per-instance phase, and the wind lives in the vertex
 * shader keyed off a `flex` attribute (0 at the anchored base, 1 at the free tip) — CPU
 * wind on this many instances would cost more than the rest of the frame.
 */

const TUNE = {
  /* --- palms --- */
  palmCount: 74,
  palmHMin: 6.0, palmHMax: 12.0,
  palmLean: 0.30,          // radians of trunk curvature away from vertical
  frondMin: 9, frondMax: 14,
  frondLen: 3.5,           // at palm height 9 m; scales with trunk
  deadFronds: 3,           // brown fronds hanging below the crown

  /* --- papyrus --- */
  papyrusClumps: 58,
  papyrusPerClump: 14,
  papyrusH: 3.4,

  /* --- ground cover --- */
  tuftCount: 900,
  tuftH: 0.5,

  /* --- wind --- */
  windDir: [0.82, 0, 0.57],   // matches the dune-forming wind
  windSpeed: 1.35,
  gustScale: 0.055,           // spatial frequency of the gust envelope
  trunkSway: 0.055,           // radians at the crown
  frondFlutter: 0.20,
};

/* Dry, sun-bleached greens that sit against §2.2's sandstone without fighting it. */
const PAL = {
  barkLight: 0xa8875c, barkMid: 0x7d6242, barkDark: 0x4e3a26,
  frondLight: 0x8fa348, frondMid: 0x5f7a33, frondDark: 0x374a22,
  frondDry: 0xa8863f, frondDead: 0x7a5a2c,
  papyrusStalk: 0x6f8a3c, papyrusHead: 0x9fae5a,
  tuftDry: 0x9a8447, tuftDead: 0x7d6a3a,
};

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/* ───────────────────────── geometry builders ───────────────────────── */

/**
 * Trunk: a lofted tube along a curved spine, tapering, with the diamond leaf-scar
 * lattice that makes a date palm instantly recognisable cut in as radial ridges.
 */
function palmTrunk(rand, height) {
  const RINGS = 22, SIDES = 9;
  const lean = rand.range(-TUNE.palmLean, TUNE.palmLean);
  const leanAxis = rand.range(0, Math.PI * 2);
  const pos = [], nor = [], uv = [], idx = [], flex = [];

  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    // Curvature accumulates toward the crown — palms bend, they don't hinge at the base.
    const bend = lean * t * t;
    const cx = Math.cos(leanAxis) * bend * height * 0.42;
    const cz = Math.sin(leanAxis) * bend * height * 0.42;
    const y = t * height;
    // Fat, flared base; slow taper; a slight swell under the crown.
    const taper = 0.30 * (1 - t) ** 1.7 + 0.135 + 0.022 * Math.sin(t * Math.PI);
    const r = taper * (height / 9);

    for (let s = 0; s <= SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      // Diamond leaf-scar lattice: two counter-rotating helices beating against each other.
      const scar = Math.sin(a * 4.5 + t * 46) * Math.sin(a * -4.5 + t * 46);
      const rr = r * (1 + 0.085 * scar * (1 - t * 0.55));
      pos.push(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr);
      nor.push(Math.cos(a), 0.12, Math.sin(a));
      uv.push(s / SIDES, t * (height / 3));
      flex.push(t * t);            // quadratic: the crown moves, the base does not
    }
  }
  const stride = SIDES + 1;
  for (let i = 0; i < RINGS; i++) {
    for (let s = 0; s < SIDES; s++) {
      const a = i * stride + s, b = a + 1, c = a + stride, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('flex', new THREE.Float32BufferAttribute(flex, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, lean, leanAxis, crown: new THREE.Vector3(
    Math.cos(leanAxis) * lean * height * 0.42,
    height,
    Math.sin(leanAxis) * lean * height * 0.42) };
}

/**
 * One frond: a bent spine with pinnae stepping down both sides, shortening toward the tip.
 * Built as flat quads — the two-sided material plus a wrap term lets the low sun glow
 * through them, which is most of why palms look good at golden hour.
 */
function palmFrond(rand, len, droop) {
  const SEG = 9;
  const pos = [], nor = [], uv = [], idx = [], flex = [], col = [];
  const c = new THREE.Color();
  const dry = rand() < 0.22;
  const base = new THREE.Color(dry ? PAL.frondDry : PAL.frondMid);
  const tip = new THREE.Color(dry ? PAL.frondDead : PAL.frondLight);

  let vi = 0;
  const spine = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    // Droop accelerates along the length — a frond is a cantilever, not an arc.
    const y = -droop * t * t * len;
    spine.push(new THREE.Vector3(t * len, y, 0));
  }

  // Rachis (the central rib), a thin strip so the frond reads even edge-on.
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, p = spine[i], w = 0.035 * (1 - t * 0.7) * (len / 3.5);
    c.copy(base).lerp(tip, t);
    pos.push(p.x, p.y, -w, p.x, p.y, w);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(t, 0.48, t, 0.52);
    flex.push(t, t);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < SEG) { const a = vi, b = vi + 1; idx.push(a, b, a + 2, b, b + 2, a + 2); }
    vi += 2;
  }

  // Pinnae: paired leaflets, angled back, shortening and steepening toward the tip.
  for (let i = 1; i < SEG; i++) {
    const t = i / SEG, p = spine[i];
    const plen = (0.42 + 0.30 * Math.sin(t * Math.PI)) * (len / 3.5) * (1 - t * 0.35);
    const back = 0.30 + t * 0.34;              // sweep toward the tip
    const drop = 0.20 + t * 0.30;
    c.copy(base).lerp(tip, t * 0.8 + 0.1);
    for (const side of [-1, 1]) {
      const jl = plen * rand.range(0.86, 1.12);
      const tipP = _v.set(p.x + back * jl, p.y - drop * jl, side * jl * 0.95);
      pos.push(p.x, p.y, 0, tipP.x, tipP.y, tipP.z, p.x + jl * 0.16, p.y - jl * 0.05, side * jl * 0.10);
      for (let k = 0; k < 3; k++) {
        nor.push(0, 1, 0);
        flex.push(t + 0.25 * (k === 1 ? 1 : 0));   // leaflet tips flutter most
        col.push(c.r, c.g, c.b);
      }
      uv.push(t, 0.5, t, 1.0, t, 0.62);
      idx.push(vi, vi + 1, vi + 2);
      vi += 3;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('flex', new THREE.Float32BufferAttribute(flex, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A whole palm crown: living fronds radiating up-and-out, dead ones hanging below. */
function palmCrown(rand, height) {
  const n = rand.int(TUNE.frondMin, TUNE.frondMax);
  const len = TUNE.frondLen * (height / 9);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand.jitter(0.3);
    // Living fronds arc up then over; the lift varies so the crown isn't a flat wheel.
    const lift = rand.range(0.18, 0.92);
    const g = palmFrond(rand, len * rand.range(0.85, 1.15), rand.range(0.30, 0.62));
    _q.setFromEuler(new THREE.Euler(0, -a, lift));
    g.applyMatrix4(_m.compose(_v.set(0, 0, 0), _q, _s.set(1, 1, 1)));
    parts.push(g);
  }
  for (let i = 0; i < TUNE.deadFronds; i++) {
    const a = rand.range(0, Math.PI * 2);
    const g = palmFrond(rand, len * rand.range(0.7, 0.95), rand.range(0.9, 1.3));
    // Dead fronds have collapsed against the trunk.
    const cAttr = g.getAttribute('color');
    const dead = new THREE.Color(PAL.frondDead);
    for (let k = 0; k < cAttr.count; k++) cAttr.setXYZ(k, dead.r, dead.g, dead.b);
    _q.setFromEuler(new THREE.Euler(0, -a, -0.95));
    g.applyMatrix4(_m.compose(_v.set(0, 0, 0), _q, _s.set(1, 1, 1)));
    parts.push(g);
  }
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

/** Papyrus: triangular stalk with the radiating umbel head. One clump, merged. */
function papyrusClump(rand) {
  const parts = [];
  const n = TUNE.papyrusPerClump;
  for (let i = 0; i < n; i++) {
    const h = TUNE.papyrusH * rand.range(0.6, 1.25);
    const lean = rand.range(0.03, 0.20);
    const a = rand.range(0, Math.PI * 2);
    const ox = Math.cos(a) * rand.range(0, 0.75);
    const oz = Math.sin(a) * rand.range(0, 0.75);

    // Stalk — a 3-sided prism, which is both cheap and botanically right.
    const stalk = new THREE.CylinderGeometry(0.018, 0.045, h, 3, 1);
    stalk.translate(0, h / 2, 0);
    const flexS = new Float32Array(stalk.attributes.position.count);
    for (let k = 0; k < flexS.length; k++) {
      flexS[k] = (stalk.attributes.position.getY(k) / h) ** 2;
    }
    stalk.setAttribute('flex', new THREE.BufferAttribute(flexS, 1));
    _q.setFromEuler(new THREE.Euler(lean * Math.cos(a), 0, lean * Math.sin(a)));
    stalk.applyMatrix4(_m.compose(_v.set(ox, 0, oz), _q, _s.set(1, 1, 1)));
    parts.push(stalk);

    // Umbel — thin rays bursting from the crown.
    const rays = 16;
    const rpos = [], rnor = [], ruv = [], ridx = [], rflex = [];
    let vi = 0;
    for (let r = 0; r < rays; r++) {
      const ra = (r / rays) * Math.PI * 2 + rand.jitter(0.4);
      const rl = rand.range(0.22, 0.44);
      const tipY = h + rand.range(-0.06, 0.14);
      rpos.push(ox, h, oz,
        ox + Math.cos(ra) * rl, tipY - rl * 0.5, oz + Math.sin(ra) * rl,
        ox + Math.cos(ra + 0.22) * rl * 0.9, tipY - rl * 0.58, oz + Math.sin(ra + 0.22) * rl * 0.9);
      for (let k = 0; k < 3; k++) { rnor.push(0, 1, 0); rflex.push(1.0); }
      ruv.push(0, 0, 1, 0, 1, 1);
      ridx.push(vi, vi + 1, vi + 2);
      vi += 3;
    }
    const head = new THREE.BufferGeometry();
    head.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
    head.setAttribute('normal', new THREE.Float32BufferAttribute(rnor, 3));
    head.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
    head.setAttribute('flex', new THREE.Float32BufferAttribute(rflex, 1));
    head.setIndex(ridx);
    parts.push(head);
  }
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

/** A dry grass tuft — crossed blades, cheap, instanced in bulk. */
function grassTuft(rand) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const h = TUNE.tuftH * rand.range(0.5, 1.5);
    const a = rand.range(0, Math.PI * 2);
    const bend = rand.range(0.15, 0.5);
    const g = new THREE.BufferGeometry();
    const w = 0.022;
    const pos = new Float32Array([
      -w, 0, 0, w, 0, 0,
      Math.cos(a) * bend * h, h, Math.sin(a) * bend * h,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2));
    g.setAttribute('flex', new THREE.BufferAttribute(new Float32Array([0, 0, 1]), 1));
    g.rotateY(rand.range(0, Math.PI * 2));
    g.translate(rand.jitter(0.16), 0, rand.jitter(0.16));
    parts.push(g);
  }
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

/* ───────────────────────────── the module ───────────────────────────── */

export class Vegetation {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {import('./Terrain.js').Terrain} terrain
   */
  constructor(engine, terrain) {
    this.engine = engine;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    this._materials = [];
    this._geoms = [];
    this._windMats = [];
    this.counts = { palms: 0, papyrus: 0, tufts: 0 };
  }

  async init() {
    const t = this.terrain;
    const rand = rng(0x9a17e5);

    /* --- materials ------------------------------------------------------- */
    const barkTex = t.tex('palm_bark');
    const frondTex = t.tex('palm_frond');
    const reedTex = t.tex('papyrus_reed');

    const barkMat = t.mat({
      color: PAL.barkMid, map: barkTex?.map ?? null, normalMap: barkTex?.normalMap ?? null,
      bands: 3, rim: 0.45, rimColor: 0x7fd4ff, spec: 0.08, gloss: 12, sss: 0.15,
      outline: 0.85, detail: 'palm_bark',
    }, { roughness: 0.92 });

    // Two-sided with a strong wrap term: the low sun has to glow *through* the fronds.
    const frondMat = t.mat({
      color: 0xffffff, vertexColors: true,
      map: frondTex?.map ?? null, normalMap: frondTex?.normalMap ?? null,
      bands: 3, rim: 0.70, rimColor: 0xd8ff9a, spec: 0.14, gloss: 20,
      sss: 0.85, outline: 0.6, side: THREE.DoubleSide,
    }, { roughness: 0.78, flatShading: false });

    const reedMat = t.mat({
      color: PAL.papyrusStalk, map: reedTex?.map ?? null,
      bands: 3, rim: 0.6, rimColor: 0xd8ff9a, sss: 0.7, spec: 0.1,
      outline: 0.4, side: THREE.DoubleSide,
    }, { roughness: 0.85 });

    const tuftMat = t.mat({
      color: PAL.tuftDry, bands: 2, rim: 0.5, rimColor: 0xffd9a0, sss: 0.6,
      outline: 0, side: THREE.DoubleSide,
    }, { roughness: 0.95 });

    for (const m of [barkMat, frondMat, reedMat, tuftMat]) this._addWind(m);

    /* --- palms ----------------------------------------------------------- */
    // Three trunk/crown variants, instanced — one silhouette repeated 74 times reads as
    // wallpaper, three with per-instance scale and rotation reads as a grove.
    const trunkVariants = [], crownVariants = [];
    for (let v = 0; v < 3; v++) {
      const h = 9 * [0.82, 1.0, 1.22][v];
      const tr = palmTrunk(rand, h);
      trunkVariants.push({ geo: tr.geo, crown: tr.crown, height: h });
      crownVariants.push(palmCrown(rand, h));
      this._geoms.push(tr.geo, crownVariants[v]);
    }

    const palmSpots = this._scatterPalms(rand);
    this.counts.palms = palmSpots.length;
    const perVariant = [[], [], []];
    palmSpots.forEach((s, i) => perVariant[i % 3].push(s));

    for (let v = 0; v < 3; v++) {
      const spots = perVariant[v];
      if (!spots.length) continue;
      const tv = trunkVariants[v];

      const trunks = new THREE.InstancedMesh(tv.geo, barkMat, spots.length);
      const crowns = new THREE.InstancedMesh(crownVariants[v], frondMat, spots.length);
      const phase = new Float32Array(spots.length);

      spots.forEach((s, i) => {
        const sc = s.scale;
        _q.setFromAxisAngle(_up, s.yaw);
        _m.compose(_v.set(s.x, s.y, s.z), _q, _s.set(sc, sc, sc));
        trunks.setMatrixAt(i, _m);
        // The crown rides the top of the *curved* trunk, so it has to follow the lean.
        _v.copy(tv.crown).multiplyScalar(sc).applyQuaternion(_q).add(_s.set(s.x, s.y, s.z));
        _m.compose(_v, _q, _s.set(sc, sc, sc));
        crowns.setMatrixAt(i, _m);
        phase[i] = rand.range(0, Math.PI * 2);
      });

      for (const im of [trunks, crowns]) {
        im.instanceMatrix.needsUpdate = true;
        im.geometry.setAttribute('iPhase', new THREE.InstancedBufferAttribute(phase, 1));
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;   // instances span the whole map; the per-mesh bounds lie
        this.group.add(im);
      }

      // Trunks are SOLID but deliberately not `pole`: an InstancedMesh's bounds ignore its
      // instances, so a line-affordance tag here made Collision synthesise a phantom
      // climbable spline at the group origin — ~11 m of mountable air on the courtyard
      // walking route (see progress/records/NOTE-void-and-poles.md §2b). `misc` keeps every
      // trunk solid in the BVH and registers no affordance. Real palm climbing, if wanted,
      // needs one collider per palm spot with an authored 2-point spline from _scatterPalms.
      this.engine.registerCollider(trunks, { tag: 'misc', material: 'wood' });
    }

    /* --- papyrus along the waterline ------------------------------------- */
    const clumpGeo = papyrusClump(rand);
    this._geoms.push(clumpGeo);
    const clumps = this._scatterPapyrus(rand);
    this.counts.papyrus = clumps.length;
    if (clumps.length) {
      const im = new THREE.InstancedMesh(clumpGeo, reedMat, clumps.length);
      const phase = new Float32Array(clumps.length);
      clumps.forEach((s, i) => {
        _q.setFromAxisAngle(_up, s.yaw);
        _m.compose(_v.set(s.x, s.y, s.z), _q, _s.set(s.scale, s.scale, s.scale));
        im.setMatrixAt(i, _m);
        phase[i] = rand.range(0, Math.PI * 2);
      });
      im.instanceMatrix.needsUpdate = true;
      im.geometry.setAttribute('iPhase', new THREE.InstancedBufferAttribute(phase, 1));
      im.castShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
    }

    /* --- dry ground cover ------------------------------------------------ */
    const tuftGeo = grassTuft(rand);
    this._geoms.push(tuftGeo);
    const tufts = this._scatterTufts(rand);
    this.counts.tufts = tufts.length;
    if (tufts.length) {
      const im = new THREE.InstancedMesh(tuftGeo, tuftMat, tufts.length);
      const phase = new Float32Array(tufts.length);
      tufts.forEach((s, i) => {
        _q.setFromAxisAngle(_up, s.yaw);
        _m.compose(_v.set(s.x, s.y, s.z), _q, _s.set(s.scale, s.scale, s.scale));
        im.setMatrixAt(i, _m);
        phase[i] = rand.range(0, Math.PI * 2);
      });
      im.instanceMatrix.needsUpdate = true;
      im.geometry.setAttribute('iPhase', new THREE.InstancedBufferAttribute(phase, 1));
      im.frustumCulled = false;
      this.group.add(im);
    }

    this.terrain.group.add(this.group);
  }

  /* ───────────────────────── placement ───────────────────────── */

  /** True where a plant would be standing in the temple's paving or in the river. */
  _blocked(x, z, y) {
    const T = this.terrain.tune;
    if (y < T.waterY + 0.15) return true;                                  // in the Nile
    if (Math.abs(x) < T.padX + 2 && z > T.padZ0 - 2 && z < T.padZ1 + 2) return true;  // paving
    return false;
  }

  /**
   * Palms cluster where there's water: a dense grove along the Nile bank, a thinner
   * scatter in the interdune hollows, plus a deliberate handful near the courtyard
   * approach placed to frame the camera (AGENTS.md §2.3 wants a dark foreground element).
   */
  _scatterPalms(rand) {
    const t = this.terrain, T = t.tune, out = [];
    const push = (x, z) => {
      const y = t.heightAt(x, z);
      if (this._blocked(x, z, y)) return;
      if (t.slopeAt(x, z) > 0.55) return;         // palms don't grow on a slip face
      out.push({ x, z, y: y - 0.15, yaw: rand.range(0, Math.PI * 2), scale: rand.range(0.8, 1.3) });
    };

    // Nile bank grove — the band between the water's edge and the escarpment.
    for (let i = 0; i < 44; i++) {
      push(rand.range(T.nileEast - 26, T.nileEast + 12), rand.range(-150, 110));
    }
    // Interdune hollows, sparse.
    for (let i = 0; i < 22; i++) {
      push(rand.range(-180, 150), rand.range(-140, 150));
    }
    // Framing palms: these are placed by eye for the `hero`, `courtyard` and `dunes`
    // cameras, not scattered. They sit just outside the paving on the approach side.
    for (const [x, z] of [[-33, 44], [-38, 30], [36, 46], [31, 62], [-30, 70], [42, 24], [-44, 12], [46, 68]]) {
      push(x + rand.jitter(1.6), z + rand.jitter(1.6));
    }

    return out.slice(0, TUNE.palmCount);
  }

  _scatterPapyrus(rand) {
    const t = this.terrain, T = t.tune, out = [];
    for (let i = 0; i < TUNE.papyrusClumps * 3 && out.length < TUNE.papyrusClumps; i++) {
      const z = rand.range(-160, 120);
      // Hug the waterline: papyrus stands with its feet wet.
      const x = T.nileEast + rand.range(-14, 3);
      const y = t.heightAt(x, z);
      if (y < T.waterY - 0.5 || y > T.waterY + 1.4) continue;
      out.push({ x, z, y: y - 0.1, yaw: rand.range(0, Math.PI * 2), scale: rand.range(0.75, 1.3) });
    }
    return out;
  }

  _scatterTufts(rand) {
    const t = this.terrain, out = [];
    for (let i = 0; i < TUNE.tuftCount * 3 && out.length < TUNE.tuftCount; i++) {
      const x = rand.range(-200, 170), z = rand.range(-160, 170);
      const y = t.heightAt(x, z);
      if (this._blocked(x, z, y)) continue;
      // Grass survives in the lee and the hollows, not on exposed crests.
      if (t.slopeAt(x, z) > 0.42) continue;
      out.push({ x, z, y: y - 0.05, yaw: rand.range(0, Math.PI * 2), scale: rand.range(0.6, 1.5) });
    }
    return out;
  }

  /* ───────────────────────── wind ───────────────────────── */

  /**
   * Inject gusting wind into whatever material we were handed. `onBeforeCompile` rather
   * than a bespoke ShaderMaterial, so this works identically on SHADING's toon material
   * and on the MeshStandardMaterial fallback — and we keep shadows, fog and instancing.
   */
  _addWind(mat) {
    const uniforms = {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector3(...TUNE.windDir).normalize() },
      uWindSpeed: { value: TUNE.windSpeed },
      uGustScale: { value: TUNE.gustScale },
      uSway: { value: TUNE.trunkSway },
      uFlutter: { value: TUNE.frondFlutter },
    };
    mat.userData.windUniforms = uniforms;

    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      prev?.call(mat, shader, renderer);
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          attribute float flex;
          #ifdef USE_INSTANCING
            attribute float iPhase;
          #endif
          uniform float uTime;
          uniform vec3  uWindDir;
          uniform float uWindSpeed;
          uniform float uGustScale;
          uniform float uSway;
          uniform float uFlutter;
        `)
        // Displace in object space before skinning/instancing folds it into world space.
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          {
            float ph = 0.0;
            #ifdef USE_INSTANCING
              ph = iPhase;
            #endif
            // A gust envelope in world space, so neighbouring plants gust together
            // rather than each doing its own thing — that coherence is what reads as wind.
            vec3 wp = transformed;
            #ifdef USE_INSTANCING
              wp = (instanceMatrix * vec4(transformed, 1.0)).xyz;
            #endif
            float gust = sin(dot(wp.xz, uWindDir.xz) * uGustScale + uTime * 0.55 + ph)
                       * 0.5 + 0.5;
            gust = 0.35 + 0.65 * gust * gust;

            float t = uTime * uWindSpeed + ph;
            // Two beating frequencies stop it reading as a metronome.
            float swayA = sin(t) * 0.7 + sin(t * 1.73 + 1.1) * 0.3;
            float flut  = sin(t * 3.1 + wp.y * 1.7) * 0.6 + sin(t * 5.3 + ph * 2.0) * 0.4;

            float k = flex * gust;
            transformed.xz += uWindDir.xz * (swayA * uSway * k * 12.0);
            transformed.y  -= abs(swayA) * uSway * k * 3.0;          // arc, don't stretch
            transformed    += vec3(flut, flut * 0.6, -flut) * uFlutter * k * k * 0.55;
          }
        `);
    };
    mat.needsUpdate = true;
    this._windMats.push(mat);
  }

  update(dt, t) {
    for (let i = 0; i < this._windMats.length; i++) {
      const u = this._windMats[i].userData.windUniforms;
      if (u) u.uTime.value = t;
    }
  }

  dispose() {
    for (const g of this._geoms) g.dispose();
    for (const m of this._materials) m.dispose?.();
    this.group.removeFromParent();
    this.group.clear();
  }
}
