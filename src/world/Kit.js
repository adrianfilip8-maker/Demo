import * as THREE from 'three';

/**
 * Kit — the parametric building-block library for the Temple of Ra.
 *
 * Every piece here exists because the silhouette matters more than the archaeology:
 * pylons lean, columns are fat at the base, cornices overhang absurdly, and no two blocks
 * in a course are the same length. Nothing is textured here — Kit hands back raw
 * BufferGeometry in *local* space with world-scale UVs, and Architecture merges it.
 *
 * Conventions
 *   - Local space: +X = "along" (length), +Y = up, +Z = "outward" (face normal / thickness).
 *   - Every geometry has exactly position / normal / uv so merges never fail.
 *   - UVs are at a consistent world scale: UV_PER_M units per metre (1 unit ≈ 2 m), so
 *     TEXTURES' `repeat` values behave the same on a paving slab and on a pylon.
 *   - All randomness arrives as an `rng` from core/Rand.js. Never Math.random.
 */

/** 1 UV unit per 2 m — the whole project's texel density contract. */
export const UV_PER_M = 0.5;

/**
 * The one surface in the level whose V is *registered* rather than tiled.
 *
 * `column_papyrus` is not a repeating stone: its map paints binding bands at fixed fractions
 * of the column's height (0.035 / 0.115 near the foot, 0.80 / 0.865 under the capital) and a
 * text register between them. That only lands where the recipe says it lands if exactly one
 * repeat covers exactly one column — and V was `y * UV_PER_M`, i.e. world metres, so with
 * `column_papyrus.tile[1] = 4.5` (one repeat per 9.0 m of world) a 12.3 m shaft got 1.7
 * repeats: a second set of painted bands two thirds of the way up, in the middle of the shaft,
 * where a band is both archaeologically wrong and the first thing to alias at 30 m. TEXTURES
 * damped the chroma so it stopped reading as a rainbow; this is the actual registration fix.
 *
 * **This number is one half of a two-file contract** and must equal `column_papyrus.tile[1]`
 * in `src/textures/Materials.js`. The other half is the rib count: `papyrusColumn`'s
 * `lobes = 8` is matched by that recipe's `stalks = 8`, deliberately, so changing either one
 * needs the other changed with it.
 */
export const COLUMN_V_TILE = 4.5;

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/* ============================ helpers ================================== */

/** Strip everything but position/normal/uv so mergeGeometries never mismatches. */
export function normaliseAttrs(geo) {
  for (const k of Object.keys(geo.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    const n = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return geo;
}

/**
 * Box-project UVs from the *current* vertex positions using the dominant normal axis.
 * Because it runs after the geometry is placed, neighbouring blocks share one continuous
 * projection — the thing that stops merged masonry from looking like a UV patchwork.
 *
 * **Run this last.** It reads positions, so it bakes in whatever space the geometry is in at
 * the moment of the call, and any transform applied afterwards moves the geometry without
 * moving the UVs. A later *translation* is harmless (it only shifts the projection's phase,
 * which is why the local-space calls below are fine). A later *scale* is not: it stretches the
 * map by that scale. That has now caused two defects — a `place({sy})` that left V local-Y
 * scaled, and `slabUnit()`, where an InstancedMesh scaled a unit box to 2.4 m and stretched
 * every paving texture in the level by 2.4x while giving all 675 slabs one identical patch.
 * Both call sites reasoned correctly about unit-space-times-instance-scale for the *geometry*
 * and did not carry it to the UVs.
 *
 * Audited call sites: everything else in this file projects then translates only. `hookRing`
 * is instanced at scale 1.0/0.94 (≤6% density error on a 0.62 m ring) and `ruin:drums` at
 * scale 1, so both are correct to within measurement; they are the only two that would go
 * wrong if someone gave them a non-unit instance scale.
 */
export function boxProjectUVs(geo, s = UV_PER_M) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = geo.attributes.uv || new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x * s; v = z * s; }
    else if (nx >= nz) { u = z * s; v = y * s; }
    else { u = x * s; v = y * s; }
    uv.setXY(i, u, v);
  }
  geo.setAttribute('uv', uv);
  uv.needsUpdate = true;
  return geo;
}

/** Place a local-space geometry into world space. Rotations are radians. */
export function place(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(_v.set(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

export function mergeAll(list) {
  const clean = list.filter(Boolean);
  if (!clean.length) return null;
  for (const g of clean) normaliseAttrs(g);
  // Lazily imported to keep this module usable without the example utils at parse time.
  return clean.length === 1 ? clean[0] : _merge(clean);
}

let _mergeFn = null;
export function setMergeFn(fn) { _mergeFn = fn; }
function _merge(list) {
  if (!_mergeFn) return list[0];
  const g = _mergeFn(list, false);
  for (const x of list) x.dispose?.();
  return g || list[0];
}

/* ============================ blocks =================================== */

/**
 * One masonry block. Corners are grouped by position so the box stays watertight while
 * every one of them drifts a centimetre or two — the cheapest possible "cut by hand" tell.
 * `chip` knocks a single corner well in so the silhouette gets a genuine broken bite.
 */
export function block(w, h, d, opts = {}) {
  const { rng, jitter = 0.02, chip = 0, taper = 0, lean = 0, pillow = PILLOW } = opts;
  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const pos = geo.attributes.position;

  // corner key -> offset
  const off = new Map();
  const key = (x, y, z) => `${x > 0 ? 1 : 0}${y > 0 ? 1 : 0}${z > 0 ? 1 : 0}`;
  const chipCorner = chip > 0 && rng ? rng.int(0, 7) : -1;
  for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 2; cy++) for (let cz = 0; cz < 2; cz++) {
    const id = cx * 4 + cy * 2 + cz;
    let ox = 0, oy = 0, oz = 0;
    if (rng) {
      ox = rng.jitter(jitter); oy = rng.jitter(jitter); oz = rng.jitter(jitter);
    }
    // Taper: shrink the top face. Lean: shear the whole block sideways with height.
    if (cy === 1) { const t = taper * 0.5; ox += cx ? -t : t; oz += cz ? -t : t; ox += lean; }
    if (id === chipCorner) {
      const c = chip * (rng ? rng.range(0.55, 1.0) : 1);
      ox += cx ? -c : c; oy += cy ? -c * 0.7 : c * 0.7; oz += cz ? -c : c;
    }
    off.set(`${cx}${cy}${cz}`, [ox, oy, oz]);
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const o = off.get(key(x, y, z));
    pos.setXYZ(i, x + o[0], y + o[1], z + o[2]);
  }
  geo.computeVertexNormals();
  /* Same face pillow as chamferBox (see PILLOW). BoxGeometry lays its 24 vertices out four
     per face, so the group of 4 IS the face; centroid comes from the displaced positions. */
  if (pillow > 0) {
    const nor = geo.attributes.normal;
    for (let f = 0; f < 6; f++) {
      let cx = 0, cy = 0, cz = 0;
      for (let v = f * 4; v < f * 4 + 4; v++) { cx += pos.getX(v) / 4; cy += pos.getY(v) / 4; cz += pos.getZ(v) / 4; }
      for (let v = f * 4; v < f * 4 + 4; v++) {
        const n = pillowN([nor.getX(v), nor.getY(v), nor.getZ(v)],
          [pos.getX(v), pos.getY(v), pos.getZ(v)], cx, cy, cz, pillow);
        nor.setXYZ(v, n[0], n[1], n[2]);
      }
    }
    nor.needsUpdate = true;
  }
  return geo;
}

/**
 * Shading-normal pillow, in tan units (0.06 ≈ 3.4° tilt at a face rim, zero at centre by
 * interpolation). Positions are untouched, so this costs nothing and moves no silhouette.
 *
 * Why it exists (79c0496 / 882429f): a flat face has ONE normal, so whole face populations
 * can land exactly ON a cel terminator — `temple`'s +Z walls at ndl 0.145 vs termLo 0.14 were
 * 40% of the shot's visible architecture, rendering a uniform half-transition value with no
 * gradient, one normal-map perturbation from flipping band. Between terminators the ramp
 * output is constant, so a 3.4° pillow is invisible inside a band and only manifests where a
 * face straddles a terminator — as a swept band edge instead of that flat mid-value. The
 * "blocked-in colour" property the flat normals bought is therefore kept by the quantiser
 * itself, not by the flatness.
 *
 * Sized against the surface-rim planarity gate (toon.glsl.js): the pillow turns the normal
 * ~7° across a whole face, which on a near slab is slyTurn ≈ 0.35 per screen height against
 * the gate's lo threshold of 3 — an ~8x margin, so the guard-shot contact-line fix stays
 * closed. See PREREG-pillow.md for the registered predictions.
 */
export const PILLOW = 0.06;

/** Tilt `n` toward (p − centroid), projected off n — the per-vertex pillow direction. */
function pillowN(n, p, cx, cy, cz, k) {
  let dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
  const along = dx * n[0] + dy * n[1] + dz * n[2];
  dx -= along * n[0]; dy -= along * n[1]; dz -= along * n[2];
  const l = Math.hypot(dx, dy, dz);
  if (l < 1e-6) return n;
  const ox = n[0] + (k * dx) / l, oy = n[1] + (k * dy) / l, oz = n[2] + (k * dz) / l;
  const ol = Math.hypot(ox, oy, oz);
  return [ox / ol, oy / ol, oz / ol];
}

/**
 * A chamfered block — the single highest-value shape in this file.
 *
 * A plain box has one normal per face, so the 3-band cel ramp lands the whole face in one
 * band and there is no terminator anywhere in the frame. This adds a narrow bevel along the
 * arrises whose vertices carry the *adjacent face* normals, so the interpolated normal sweeps
 * the full 90° across a 3 cm strip: the quantiser draws all three bands inside it and every
 * edge reads as a lit line. The face interiors carry the `pillow` above rather than a single
 * flat normal — flat colour inside a band either way, a swept terminator instead of a stuck
 * half-transition value when a face population lands on one.
 *
 * `c` is the chamfer in metres; `only:'top'` bevels just the top rim (24 tris instead of 44),
 * which is what anything sitting on the ground wants.
 */
export function chamferBox(w, h, d, opts = {}) {
  const { rng, jitter = 0.0, chip = 0, taper = 0, lean = 0, shear = 0, round = 0, c = 0.035, only = 'all',
    pillow = PILLOW, edges = null } = opts;
  const W = w * 0.5, H = h * 0.5, D = d * 0.5;
  const cc = Math.min(c, w * 0.32, h * 0.32, d * 0.32);

  // Per-corner offset (identical scheme to block(), so the two are interchangeable).
  const off = new Map();
  const chipCorner = chip > 0 && rng ? rng.int(0, 7) : -1;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    let ox = rng ? rng.jitter(jitter) : 0, oy = rng ? rng.jitter(jitter) : 0, oz = rng ? rng.jitter(jitter) : 0;
    if (j === 1) { const t = taper * 0.5; ox += i ? -t : t; oz += k ? -t : t; ox += lean; oz += shear; }
    if (round > 0) {
      ox += (i ? -round : round) * (j ? 1 : 0.35);
      oz += (k ? -round : round) * (j ? 1 : 0.35);
    }
    if (i * 4 + j * 2 + k === chipCorner) {
      const q = chip * (rng ? rng.range(0.55, 1.0) : 1);
      ox += i ? -q : q; oy += j ? -q * 0.7 : q * 0.7; oz += k ? -q : q;
    }
    off.set(i * 4 + j * 2 + k, [ox, oy, oz]);
  }
  // 'top' leaves the underside square — nothing sees it and it halves the cost.
  const cAt = (j) => (only === 'top' && j === 0 ? 0 : cc);

  /* `edges` masks the horizontal (y-rim) bevel per vertical face: { px, nx, pz, nz },
   * true = bevelled. A masked-off side keeps a sharp square arris — the face reaches full
   * height and the top face reaches the full footprint, so the strip there collapses and
   * `face()` drops it. The vertical corner arrises are deliberately NOT maskable: they carry
   * the silhouette break, and leaving them stable keeps the corner topology closed whatever
   * the mask. Why mask at all: a floor of slabs whose every joint carries the swept-normal
   * bevel draws one continuous lit rule down every joint line — under the night key that
   * rule reads as the §7.3 "AO inverted at contact" cyan hairline (measured on `guard`:
   * bevel ndl 0.712 vs floor 0.473 at tod 0.10, one band up, cool). Dashing the rims per
   * slab keeps the day-time carved read and breaks the night-time wireframe one.
   */
  const eMask = edges
    ? { px: edges.px !== false, nx: edges.nx !== false, pz: edges.pz !== false, nz: edges.nz !== false }
    : null;
  const sideOn = (axis, s) => !eMask || (axis === 0 ? (s ? eMask.px : eMask.nx) : (s ? eMask.pz : eMask.nz));

  const pos = [], nor = [], idx = [];
  const push = (p, n) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); return pos.length / 3 - 1; };
  const S = (i) => (i ? 1 : -1);
  // The three bevel vertices at a corner: one pulled off each of the meeting faces.
  const cor = (i, j, k, axis) => {
    const o = off.get(i * 4 + j * 2 + k), e = cAt(j);
    const p = [S(i) * W + o[0], S(j) * H + o[1], S(k) * D + o[2]];
    if (axis !== 0 && (axis !== 1 || sideOn(0, i))) p[0] -= S(i) * e;               // top-face x-inset, masked; z-face vertical arris, always
    if (axis !== 1 && sideOn(axis === 0 ? 0 : 2, axis === 0 ? i : k)) p[1] -= S(j) * e; // side-face y-rim bevel, masked per its own face
    if (axis !== 2 && (axis !== 1 || sideOn(2, k))) p[2] -= S(k) * e;               // top-face z-inset, masked; x-face vertical arris, always
    return p;
  };

  /* Face normals are measured off the *placed* corners rather than assumed axis-aligned:
     taper, lean and jitter all tilt a face, and a bevel is only worth having if the two
     normals it interpolates between are the ones the faces are actually shaded with. */
  const quadOf = (axis, s) => [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
    const ijk = [0, 0, 0];
    ijk[axis] = s; ijk[(axis + 1) % 3] = u; ijk[(axis + 2) % 3] = v;
    return { ijk, p: cor(ijk[0], ijk[1], ijk[2], axis) };
  });
  const FN = [[null, null], [null, null], [null, null]];
  for (let axis = 0; axis < 3; axis++) for (let s = 0; s < 2; s++) {
    const q = quadOf(axis, s);
    const n = [0, 0, 0];
    for (let t = 0; t < 4; t++) {
      const a = q[t].p, b = q[(t + 1) % 4].p, c = q[(t + 2) % 4].p;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      n[0] += uy * vz - uz * vy; n[1] += uz * vx - ux * vz; n[2] += ux * vy - uy * vx;
    }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    // orient outward
    const sgn = (axis === 0 ? n[0] : axis === 1 ? n[1] : n[2]) * S(s) < 0 ? -1 : 1;
    FN[axis][s] = [sgn * n[0] / l, sgn * n[1] / l, sgn * n[2] / l];
  }
  const nrm = (i, j, k, axis) => FN[axis][axis === 0 ? i : axis === 1 ? j : k];

  /** Emit a polygon, dropping it if the chamfer collapsed it to nothing. */
  const face = (verts) => {
    let area = 0;
    for (let t = 1; t < verts.length - 1; t++) {
      const a = verts[0].p, b = verts[t].p, e = verts[t + 1].p;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      area += Math.hypot(cx, cy, cz);
    }
    if (area < 1e-9) return;
    // Orient by the vertex normals rather than by hand-tracking winding per face family.
    const a = verts[0].p, b = verts[1].p, e = verts[2].p;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    let ax = 0, ay = 0, az = 0;
    for (const v of verts) { ax += v.n[0]; ay += v.n[1]; az += v.n[2]; }
    const flip = gx * ax + gy * ay + gz * az < 0;
    const ids = verts.map((v) => push(v.p, v.n));
    for (let t = 1; t < ids.length - 1; t++) {
      if (flip) idx.push(ids[0], ids[t + 1], ids[t]);
      else idx.push(ids[0], ids[t], ids[t + 1]);
    }
  };

  // Six inset faces, interiors pillowed (see PILLOW above; zero-cost, positions untouched).
  for (let axis = 0; axis < 3; axis++) {
    for (let s = 0; s < 2; s++) {
      const quad = [];
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const ijk = [0, 0, 0];
        ijk[axis] = s;
        ijk[(axis + 1) % 3] = u; ijk[(axis + 2) % 3] = v;
        quad.push({ p: cor(ijk[0], ijk[1], ijk[2], axis), n: nrm(ijk[0], ijk[1], ijk[2], axis) });
      }
      if (pillow > 0) {
        let cx = 0, cy = 0, cz = 0;
        for (const q of quad) { cx += q.p[0] / 4; cy += q.p[1] / 4; cz += q.p[2] / 4; }
        for (const q of quad) q.n = pillowN(q.n, q.p, cx, cy, cz, pillow);
      }
      face(quad);
    }
  }
  // Twelve bevel strips: normals step from one face to the next across the strip.
  for (let axis = 0; axis < 3; axis++) {
    const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
    for (let s1 = 0; s1 < 2; s1++) for (let s2 = 0; s2 < 2; s2++) {
      const ends = [0, 1].map((e) => {
        const ijk = [0, 0, 0];
        ijk[axis] = e; ijk[a1] = s1; ijk[a2] = s2;
        return ijk;
      });
      face([
        { p: cor(...ends[0], a1), n: nrm(...ends[0], a1) },
        { p: cor(...ends[1], a1), n: nrm(...ends[1], a1) },
        { p: cor(...ends[1], a2), n: nrm(...ends[1], a2) },
        { p: cor(...ends[0], a2), n: nrm(...ends[0], a2) },
      ]);
    }
  }
  // Eight corner facets.
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    face([
      { p: cor(i, j, k, 0), n: nrm(i, j, k, 0) },
      { p: cor(i, j, k, 1), n: nrm(i, j, k, 1) },
      { p: cor(i, j, k, 2), n: nrm(i, j, k, 2) },
    ]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * A torus roll. Smooth all the way round both ways, so wherever one of these sits — a column
 * base, the foot of a pier, a capital astragal — there is a guaranteed terminator. Egyptian
 * architecture is full of them, which is convenient.
 */
export function torusRoll(R, r, { radial = 24, tube = 8, arc = Math.PI * 2 } = {}) {
  const g = new THREE.TorusGeometry(R, r, tube, radial, arc);
  normaliseAttrs(g);
  place(g, { rx: Math.PI * 0.5 });
  return g;
}

/* ========================= masonry courses ============================= */

/**
 * A battered masonry shell: four faces of individually placed blocks around a rectangle,
 * every course stepped inward so the whole mass leans. This is the shape that makes a
 * pylon read as Egyptian from a hundred metres away, so the batter is deliberately
 * exaggerated (default ~7°, roughly double the real thing).
 *
 * Returns geometry centred on the footprint, base at y = 0.
 *
 * openings: [{ face, a0, a1, y0, y1 }]  face 0=+Z 1=-Z 2=+X 3=-X, `a` is the along-axis
 * coordinate measured from the footprint centre. Blocks overlapping a hole are dropped.
 */
export function masonryShell(o) {
  const {
    w, d, h, batter = 0.09, course = 0.62, thick = 0.9, rng,
    blockLen = [1.15, 2.0], recess = 0.055, chip = 0.16, chipChance = 0.18,
    gapChance = 0.04, buried = 0, openings = [], quoin = true, courseJitter = 0.018,
    tiltDeg = 0.3, hollow = true, chamfer = 0, skipFaces = null,
    /* Diagnostics only. Pass an array and every emitted block's face/course/span is recorded,
       which is how reveal straightness gets debugged without guessing. Inert when null. */
    _spans = null,
    sag = 0, windFace = null, windK = 2.0, bow = 0, drift = 0, reveal = true,
  } = o;

  const out = [];
  const nCourse = Math.max(1, Math.round(h / course));
  const ch = h / nCourse;

  /* ---- The course joint was a through-hole ------------------------------
   *
   * Blocks were cut at `ch * 0.985` to leave a mortar joint, which on a 0.72 m course is a
   * 10.8 mm horizontal gap between every pair of courses. That is fine on a solid mass and
   * wrong on a shell: both leaves of a wall are laid on the *same* course lines, so their
   * joints line up and each one is a slot straight through the wall. Measured on the hall's
   * south facade — a 0.15 m probe grid found 55 openings up to 19 mm tall and at least 120 mm
   * wide, all of them on course boundaries, none of them a designed opening. It is the same
   * class of defect as the 26 aisle-roof slots, in the other axis, and it is why daylight
   * pinholes survive in the interior shots.
   *
   * Courses now *overlap* by `weld` instead of parting. The joint line does not disappear with
   * them: each block is independently pulled back from the face plane by 1.2–6 cm of `recess`,
   * so consecutive courses still step against each other, and with `chamfer` on, the two
   * bevels meet as a V-groove — both of which read as a joint far more strongly than a 1 cm
   * slot ever did. The overlap grows with `sag` to swallow the settle curve's tangent error.
   */
  const weld = 0.012 + sag * 0.15;

  /* ---- Settlement ------------------------------------------------------
   *
   * §7.3 fails a shot for "geometry silhouettes are straight/symmetric everywhere". Per-block
   * jitter does not fix that: it is high-frequency, it averages out over a wall, and at
   * twenty metres it reads as noise rather than as age. What reads is the *low* frequency —
   * one long dip where the ground under a wall gave way, so every course line above it curves
   * and the whole mass is visibly not level.
   *
   * The dip is a single raised cosine per shell, evaluated in the along-face coordinate and
   * forced to zero at both ends of every face, so corners and quoins still meet exactly.
   *
   * HAZARD — this is the mechanism that "Seal the shells" was about. Offsetting each block
   * *rigidly* by f(a) opens a horizontal slot wherever two vertically-adjacent blocks sit at
   * different along-positions: the stagger is up to a block length, and f can change by more
   * than the 1.5% mortar joint over that distance. So each block is also *rotated* to sit on
   * the local tangent f'(a). Then every block's top and bottom edges lie on the same pair of
   * curves and consecutive courses match everywhere, to within the curve's second derivative
   * over one block — about 5 mm here, well inside the joint. Verified by ray-escape probe, not
   * by argument: see the seal check in the offline level probe.
   *
   * Amplitude scales with face length so a 1.7 m kiosk pier does not fold in half, which also
   * keeps the gradient constant at roughly 1 cm per metre whatever the wall.
   */
  const sagCentre = 0.5 + (rng ? rng.jitter(0.16) : 0);
  const sagWidth = 0.42 + (rng ? rng.jitter(0.08) : 0);
  const settle = (u, len) => {
    if (sag <= 0) return 0;
    const amp = sag * Math.min(1, len / 14);
    const t = (u - sagCentre) / sagWidth;
    if (t <= -1 || t >= 1) return 0;
    return -amp * 0.5 * (1 + Math.cos(Math.PI * t));
  };
  const settleSlope = (u, len) => {
    if (sag <= 0) return 0;
    const amp = sag * Math.min(1, len / 14);
    const t = (u - sagCentre) / sagWidth;
    if (t <= -1 || t >= 1) return 0;
    // d/da of the above; `u` is a/len, so divide the chain rule through by len.
    return amp * 0.5 * Math.PI * Math.sin(Math.PI * t) / (sagWidth * len);
  };

  /* ---- The batter line was a ruler -------------------------------------
   *
   * `sag` curves the course *lines*; nothing curved the *silhouette*. Inset was exactly
   * `batter · y`, so every wall's edge was a straight line to within per-block jitter.
   * Measured on the two entry pylons, off a least-squares straight batter: the two faces with
   * no dropped blocks came in at 3.6 cm and 3.9 cm RMS over 26 m — 0.7 px at `dunes`, 1.9 px
   * at `hero`. That is a CAD extrusion, and it is §7.3's "silhouettes are straight/symmetric
   * everywhere (no hand-built irregularity)" stated as a number.
   *
   * Two low-frequency curves fix it, both free (they move blocks that already exist):
   *   `bow`   — the mass bellies and dishes over its height. Strictly INWARD of the nominal
   *             batter, never outward, so the collision proxy (a straight tapered box, and
   *             not mine) is always at or outside the stone. The failure direction is then a
   *             capsule stopping a few centimetres early, never one clipping through.
   *   `drift` — the centreline itself wanders, so the mass is not a straight prism and the
   *             two silhouette edges stop being mirrors of each other.
   *
   * Both are bounded per course by construction: over one 0.66 m course neither can move a
   * block more than ~2 cm, against a `thick` of ~1 m of overlap with the course below, so
   * neither can reopen the seams that "Seal the shells" closed.
   */
  /* X and Z carry INDEPENDENT curves, and that independence is the point rather than a
     detail. One shared curve makes the mass thinner and fatter over its height but leaves it
     a symmetric trapezoid in every elevation — which is the half of §7.3's complaint that
     says "symmetric", and a critic reading a silhouette catches it before they catch
     "straight". With separate phases the plan-form wanders too, so the two edges of any one
     view stop being reflections of each other. Costs nothing: same blocks, different offsets. */
  const ph = () => rng ? rng.range(0, Math.PI * 2) : 1.1;
  const bowPhX = ph(), bowPhZ = ph(), drPhX = ph(), drPhZ = ph();
  // Inward-only, zero at the base and back to zero over the top ~13% so the wall head still
  // meets the cornice on the nominal batter line.
  const bowAt = (t, phase) => bow <= 0 ? 0
    : bow * 0.5 * (1 - Math.cos(t * Math.PI * 2.3 + phase)) * Math.sin(Math.PI * Math.min(1, t * 1.15));
  const driftAt = (t, phase) => drift <= 0 ? 0
    : drift * Math.sin(t * Math.PI * 1.7 + phase) * t;

  /* ---- The bright line at the `guard` wall/ground contact: NOT here -----
   *
   * A battered wall steps every course back by `batter · ch` and recesses each block by
   * 1–5 cm, which does leave up-facing strips along every course line. That looked like an
   * exact match for the reported "kerb top at ndl ≈ 0.62", and counting them found 727 in the
   * `guard` frustum below y = 1.4 m. It was the wrong answer twice over, and both errors are
   * worth leaving written down:
   *
   *   1. That count had no occlusion test. `weld` overlaps every course by ~6 cm, so most of
   *      those strips are interior faces buried inside the course above and never render. A
   *      z-buffered rasterisation of the same view (scratch `zbuf.mjs`) puts the number of
   *      VISIBLE bright up-facing contact pixels at 86 — 0.009% of the frame, longest run
   *      14 px. There is no 200 px kerb line in this geometry to remove.
   *   2. Holding the batter off with a vertical plinth — the obvious fix, and the one the
   *      brief suggested — measured *worse*: 86 → 464 flagged pixels, 3 → 9 runs. Flush
   *      plinth courses turn many short broken ledges into one clean unbroken one.
   *
   * So the batter ledges stay as they are. Whatever draws that line, it is not this.
   */

  /* ---- Openings had no reveals: every hole was a hole into the hollow ---
   *
   * A shell is four one-block-thick leaves around a void. `openings` cut blocks out of a leaf,
   * which is right for the elevation and wrong for everything behind it, because nothing ever
   * closed the cut. Measured by casting axis rays from inside each opening volume against the
   * built level (`shots/_scratch/gate.mjs`), before this existed:
   *
   *   inner-pylon gate    sideways ±X mean first hit 4.6 m   38–40 of 64 rays beyond 2.5 m
   *   south stage gate    sideways ±X mean 3.5 / 3.8 m       39–40 of 64
   *   terrace s1 opening  sideways ±X mean 6.9 m             56 of 64, and −Z ran 12.8 m
   *                                                          clean through to the far leaf
   *
   * A gate passage therefore had a soffit and a floor and no side walls: standing in it and
   * looking sideways you saw down the inside of the tower. The single-face openings — the
   * flagstaff niches, the service door, the west tower's collapsed corner — were worse, being
   * simply windows onto the void with nothing behind them at all.
   *
   * Three pieces close it, all built here rather than at each call site so that no future
   * opening can be added without them:
   *
   *   jambs   — for an opening cut through BOTH leaves (a passage), a pier on each side
   *             spanning the void from leaf to leaf. This is the missing side wall.
   *   back    — for an opening in ONE leaf (a niche), a slab across the back of the recess,
   *             so the niche is a niche and not a window.
   *   soffit  — for a passage whose head is below the wall head, a slab over it, so the void
   *             above the opening is not visible from inside the passage.
   *
   * All three are skipped when the two leaves already meet (`inner <= 0.06`), which is the
   * case for every thin wall in the level — the hall facades, the clerestory band, the tomb
   * gate — so those shells are untouched and stay bit-identical.
   *
   * None of this draws from `rng`. That is deliberate and load-bearing: the whole level shares
   * one stream, so a single extra draw here would re-shuffle every block placed after it.
   */
  const revealSpecs = [];
  if (reveal) {
    for (const op of openings) {
      if (op.reveal === false) continue;
      const y0 = op.y0 ?? -1, y1 = op.y1 ?? 1e3;
      const near = (p, q) => Math.abs(p - q) < 0.26;
      /* Same span cut in the opposite leaf = one passage, not two niches. Matched with a
         tolerance because call sites write the two faces out by hand. */
      const twin = openings.some((q) => q !== op && q.face === (op.face ^ 1)
        && near(q.a0, op.a0) && near(q.a1, op.a1)
        && near(q.y0 ?? -1, y0) && near(q.y1 ?? 1e3, y1));
      if (twin && (op.face === 1 || op.face === 3)) continue;   // the +face owns the pair
      revealSpecs.push({
        axis: op.face < 2 ? 'x' : 'z',
        sign: op.face === 0 || op.face === 2 ? +1 : -1,
        a0: op.a0, a1: op.a1, y0, y1, through: twin,
      });
    }
  }

  for (let c = 0; c < nCourse; c++) {
    const yb = c * ch, yc = yb + ch * 0.5;
    const t = h > 0 ? yc / h : 0;
    const insetX = batter * yc + bowAt(t, bowPhX);
    const insetZ = batter * yc + bowAt(t, bowPhZ);
    const drX = driftAt(t, drPhX), drZ = driftAt(t, drPhZ);
    const wc = Math.max(1.2, w - 2 * insetX);
    const dc = Math.max(1.2, d - 2 * insetZ);
    /* Bottom courses sink into the sand — never let the base sit on a crisp line.
       The block is *grown downward* rather than translated down: translating it left the
       course above hanging in mid-air, so every buried wall in the level had a horizontal
       slot at its foot with the block tops exposed inside it. */
    const sink = buried > 0 && yb < buried ? (buried - yb) * 0.55 : 0;

    // Quoin interlock: alternate which pair of faces owns the corners.
    const xOwnsCorner = quoin ? c % 2 === 0 : true;
    const faces = [
      { f: 0, len: xOwnsCorner ? wc : wc - 2 * thick, axis: 'x', sign: +1, cross: dc * 0.5, len0: xOwnsCorner ? w : w - 2 * thick },
      { f: 1, len: xOwnsCorner ? wc : wc - 2 * thick, axis: 'x', sign: -1, cross: dc * 0.5, len0: xOwnsCorner ? w : w - 2 * thick },
      { f: 2, len: xOwnsCorner ? dc - 2 * thick : dc, axis: 'z', sign: +1, cross: wc * 0.5, len0: xOwnsCorner ? d - 2 * thick : d },
      { f: 3, len: xOwnsCorner ? dc - 2 * thick : dc, axis: 'z', sign: -1, cross: wc * 0.5, len0: xOwnsCorner ? d - 2 * thick : d },
    ];

    for (const face of faces) {
      if (face.len <= 0.6) continue;
      /* A face that is buried in solid earth or backed onto another wall is triangles the
         camera can never reach. Faces: 0 = +Z, 1 = −Z, 2 = +X, 3 = −X.
         HAZARD, learned the hard way: dropping a face leaves the wall one block thick, and
         each block is built at 98.5% of its course height to leave a mortar joint — so a
         one-row wall has a ~1 cm slot at every course line that you can see straight through.
         Only use where the far side is genuinely never rendered *and* nothing behind the wall
         is visible through a 1 cm gap. Not currently used anywhere, for that reason. */
      if (skipFaces && skipFaces.includes(face.f)) continue;
      let a = -face.len * 0.5;
      let guard = 0;
      /* Openings are given in the footprint's coordinates but a battered wall narrows as it
         rises, so on a pylon with a 2.7 m inset at the top an absolute 1 m flagstaff niche
         walked off the edge of the face two thirds of the way up and sliced the corner away.
         Scaling the opening with the course makes the niches follow the batter, which is what
         they do on a real pylon anyway. */
      const oScale = face.len0 > 0.01 ? face.len / face.len0 : 1;
      while (a < face.len * 0.5 - 0.15 && guard++ < 200) {
        /* Course the wall *to* the reveal rather than through it. Tiling straight across an
           opening and clipping afterwards leaves the first block past the hole starting
           wherever the tiling happened to land — measured at 0.58 m short of the reveal on two
           courses of the inner pylon's gate, which is a visible notch in a doorway. Restarting
           the run on the far jamb is also what a mason does. No rng is drawn here, but blocks
           that fell wholly inside an opening are no longer generated-then-discarded, so shells
           that HAVE openings do re-shuffle downstream; shells without openings are untouched. */
        for (const op of openings) {
          if (op.face !== face.f) continue;
          const oy0 = op.y0 ?? -1, oy1 = op.y1 ?? 1e3;
          if (!(yb + ch > oy0 && yb < oy1)) continue;
          const oa0 = op.a0 * oScale, oa1 = op.a1 * oScale;
          /* Snapping across the last 16 cm before a jamb left the reveal 16 cm short of where
             it was specified, on every course that landed in that window — the near-jamb means
             in the reveal probe were 0.05–0.21 m and this was most of them. 7 cm instead, which
             is under the mortar joint and so cannot read as a notch. Paired with the same
             change to the sliver drop below: laying a 7 cm jamb block is only useful if the
             block survives. */
          if (a > oa0 - 0.07 && a < oa1) a = oa1;
        }
        if (!(a < face.len * 0.5 - 0.15)) break;
        let bl = rng ? rng.range(blockLen[0], blockLen[1]) : (blockLen[0] + blockLen[1]) * 0.5;
        bl = Math.min(bl, face.len * 0.5 - a);
        if (bl < 0.45) break;
        let s0 = a, s1 = a + bl;
        /* The vertical joint has the same problem the course joint had: `a` used to advance
           past the block by 1.2–5 cm of daylight, and where a gap on one leaf happened to line
           up with a gap on the other you could see straight through the wall. Rarer than the
           course-line slots — 2 places in 48 m rather than 55 — but it is the same hole, and
           it is a candidate for the skybox that keeps leaking into the interior shots.
           `a` still advances by the gap, so the coursing pattern is untouched; the block is
           simply cut long enough to bridge it. */
        const gapA = rng ? rng.range(0.012, 0.05) : 0.03;
        a += bl + gapA;

        /* Openings *clip* the coursing; they do not delete whole blocks.
           Dropping any block that touched a hole meant the jamb wandered by up to a block
           length per course, so a 1 m flagstaff niche came out as a ragged diagonal scar
           twenty metres tall — the "misaligned blocks stepping diagonally, reads as an
           exploded wall" the critic found in four separate shots. Clipping gives every
           opening a straight jamb, and gives the door mouldings something to land on. */
        let skip = false, jamb = false, resume = -Infinity;
        for (const op of openings) {
          if (op.face !== face.f) continue;
          const y0 = op.y0 ?? -1, y1 = op.y1 ?? 1e3;
          if (!(yb + ch > y0 && yb < y1)) continue;
          const oa0 = op.a0 * oScale, oa1 = op.a1 * oScale;
          /* A block that happens to finish flush against a reveal is a jamb block even though
             no clip was needed, so proximity counts as well as overlap. */
          if (Math.abs(s1 - oa0) < 0.06 || Math.abs(s0 - oa1) < 0.06) jamb = true;
          if (s1 <= oa0 || s0 >= oa1) continue;                     // clear of the hole
          if (s0 >= oa0 && s1 <= oa1) { skip = true; resume = Math.max(resume, oa1); break; }
          jamb = true;                                               // this block *is* the reveal
          // Cut at the near jamb (the `s1 > oa1` case is the same clip: oa0 < oa1 < s1).
          if (s0 < oa0) { s1 = Math.min(s1, oa0); resume = Math.max(resume, oa1); }
          else s0 = Math.max(s0, oa1);
        }
        /* ---- The far reveal landed late -----------------------------------
         * `a` is advanced by the block's *un-clipped* length, above, before the clip below is
         * known. So a block that runs into the near jamb and is cut back to it still advances
         * the run by its full length, which lands the next block past the far jamb by however
         * much of it was thrown away. On the 1.4 m flagstaff niches that is up to
         * `blockLen.max − width`, and it measured ~0.6 m of missing wall on the far side —
         * the niche reading 2.0 m wide on the courses where it happened.
         *
         * A mason restarts the run on the far jamb, and so does this now. `resume` is only ever
         * set by a block that was cut at the near jamb, and `oa1 > oa0 >= s0`, so `a` still
         * advances strictly and the loop still terminates. */
        if (resume > -Infinity) a = resume;
        if (skip) continue;
        /* Erosion is directional. The wind comes up the valley and loads one face with sand
           all year; that face loses blocks and takes chips at twice the rate of the sheltered
           one. It costs nothing, and because the two entry pylons are seen from the south it
           is what stops them reading as a mirrored pair. */
        const exposure = windFace == null ? 1
          : face.f === windFace ? windK
          : face.f === (windFace ^ 1) ? 1 / windK : 1;
        /* A fallen block is characterful in the middle of a wall and a defect at a doorway: it
           re-cuts exactly the ragged notch the clipping above exists to prevent, and `windFace`
           doubles the odds of it on the one face the camera is looking at. Measured on the inner
           pylon's gate — the critic's "cascade of misaligned blocks" — the reveal held to ±0.35 m
           on 11 of 13 courses and blew out to 1.0 and 1.5 m on the two the drop had eaten.
           The roll is still *taken* so the RNG stream, and therefore every other block in the
           level, stays bit-identical; only its effect on reveal blocks is suppressed. */
        const fell = rng ? rng.chance(Math.min(0.35, gapChance * exposure)) : false;
        if (fell && !jamb && yb > 1.2) continue;
        bl = s1 - s0;
        if (bl < 0.07) continue;      // see the snap threshold above — a jamb block this short
                                      // is still the difference between a straight reveal and
                                      // one that steps in and out by a joint width per course.
        const ac = (s0 + s1) * 0.5;
        if (_spans) _spans.push({ f: face.f, c, s0, s1, jamb, len: face.len, oScale });

        // Mortar recess: pull most blocks back from the face plane so shadow catches the joint.
        const rec = rng ? rng.range(0.2, 1.0) * recess : recess * 0.6;
        const doChip = rng ? rng.chance(Math.min(0.6, chipChance * exposure)) : false;
        /* Overlap the neighbour by `weldA` whatever the two random gaps turn out to be:
           the worst case is this block drawing a 1.2 cm gap and the next a 5 cm one, which
           costs half their difference, so the bridge has to beat 1.9 cm. */
        const blW = bl + gapA + 0.024;
        const mk = chamfer > 0 ? chamferBox : block;
        const g = mk(
          face.axis === 'x' ? blW : thick, ch + weld + sink, face.axis === 'x' ? thick : blW,
          { rng, jitter: courseJitter, chip: doChip ? chip : 0, c: chamfer }
        );
        const ry = rng ? THREE.MathUtils.degToRad(rng.jitter(tiltDeg)) : 0;
        const px = face.axis === 'x' ? ac : face.sign * (face.cross - thick * 0.5 - rec);
        const pz = face.axis === 'x' ? face.sign * (face.cross - thick * 0.5 - rec) : ac;
        // Settle: drop onto the dip and rotate onto its tangent, so the course line curves
        // as one continuous run instead of stepping block to block.
        /* `a` maps straight onto world X (axis 'x' faces) or world Z (axis 'z' faces) for
           both signs of the face, so the tangent needs no per-face flip — only the rotation
           axis differs, and rx runs the opposite way to rz because rotating about +X carries
           +Z toward −Y. */
        const u = (ac + face.len * 0.5) / face.len;
        const dy = settle(u, face.len);
        const sl = Math.atan(settleSlope(u, face.len));
        const jz = rng ? THREE.MathUtils.degToRad(rng.jitter(tiltDeg * 0.6)) : 0;
        place(g, {
          x: px + drX, y: yb + ch * 0.5 - sink * 0.5 + dy, z: pz + drZ,
          ry,
          rz: face.axis === 'x' ? jz + sl : jz,
          rx: face.axis === 'z' ? -sl : 0,
        });
        out.push(g);
      }
    }

    /* ---- Reveals for this course (see the note above the loop) ---- */
    if (revealSpecs.length) {
      /* Openings are given in footprint coordinates and the wall narrows as it rises, so the
         reveal has to take the same per-course scale the coursing took, or the jamb pier and
         the jamb blocks part company by the batter's inset near the top. `faces[0]` carries
         the along-X scale and `faces[2]` the along-Z one. */
      const sc = {
        x: faces[0].len0 > 0.01 ? faces[0].len / faces[0].len0 : 1,
        z: faces[2].len0 > 0.01 ? faces[2].len / faces[2].len0 : 1,
      };
      const yMid = yb + ch * 0.5 - sink * 0.5;
      const hh = ch + weld + sink;
      for (const sp of revealSpecs) {
        if (!(yb + ch > sp.y0 && yb < sp.y1)) continue;
        const s = sc[sp.axis];
        const oa0 = sp.a0 * s, oa1 = sp.a1 * s;
        if (oa1 - oa0 < 0.12) continue;
        const crossHalf = (sp.axis === 'x' ? dc : wc) * 0.5;
        const inner = crossHalf - thick;              // half-depth of the void between leaves
        if (inner <= 0.06) continue;                  // leaves already meet: nothing to close
        const emit = (aC, aL, cC, cL, yC, yL) => {
          const g = block(sp.axis === 'x' ? aL : cL, yL, sp.axis === 'x' ? cL : aL, {});
          place(g, {
            x: (sp.axis === 'x' ? aC : cC) + drX,
            y: yC,
            z: (sp.axis === 'x' ? cC : aC) + drZ,
          });
          out.push(g);
        };
        if (sp.through) {
          const jt = Math.min(thick, 1.15);
          for (const [c0, c1] of [[oa0 - jt, oa0], [oa1, oa1 + jt]]) {
            emit((c0 + c1) * 0.5, c1 - c0, 0, inner * 2, yMid, hh);
          }
          // Head of the passage, once, on the course the opening's top falls in.
          if (sp.y1 < h && yb + ch > sp.y1 && yb <= sp.y1) {
            const st = Math.min(0.8, Math.max(0.3, ch));
            // +2 cm so a lintel or painted soffit placed by the level at exactly y1 stays the
            // visible surface and this one never lands coplanar with it.
            emit((oa0 + oa1) * 0.5, oa1 - oa0 + 0.1, 0, inner * 2, sp.y1 + 0.02 + st * 0.5, st);
          }
        } else {
          const bt = Math.min(0.4, Math.max(0.12, thick * 0.35));
          emit((oa0 + oa1) * 0.5, oa1 - oa0 + 0.24,
            sp.sign * (crossHalf - thick - bt * 0.5 + 0.02), bt, yMid, hh);
        }
      }
    }

    if (!hollow) {
      // Solid core for small masses (piers): one cheap box behind the skin.
      const core = block(Math.max(0.2, wc - thick * 1.7), ch + sink, Math.max(0.2, dc - thick * 1.7), { rng, jitter: 0.01 });
      place(core, { x: drX, y: yb + ch * 0.5 - sink * 0.5, z: drZ });
      out.push(core);
    }
  }
  const g = mergeAll(out);
  return g ? boxProjectUVs(g) : null;
}

/** Flat slab / lintel / architrave built from a short run of blocks so the joints show. */
export function beam(len, h, d, opts = {}) {
  const {
    rng, pieces = Math.max(1, Math.round(len / 2.2)), crack = 0, chip = 0.1, chamfer = 0.05,
    tilt = 0, bow = 0,
  } = opts;
  const out = [];
  let a = -len * 0.5;
  /* `tilt` sets the whole beam off level, `bow` drops its middle. Both are in degrees /
     metres and both are meant to be *small* — a lintel one degree out of true is the kind of
     wrongness that reads as hand-built rather than as broken, and it is the specific thing
     §7.3 means by "no hand-built irregularity". Above about 1.5° it stops reading as settled
     masonry and starts reading as a modelling mistake. */
  const tiltR = THREE.MathUtils.degToRad(tilt);
  for (let i = 0; i < pieces; i++) {
    const bl = (len / pieces) - (i < pieces - 1 ? 0.03 : 0);
    const g = chamfer > 0
      ? chamferBox(bl, h, d, { rng, jitter: 0.014, chip: rng && rng.chance(0.25) ? chip : 0, c: chamfer })
      : block(bl, h, d, { rng, jitter: 0.014, chip: rng && rng.chance(0.25) ? chip : 0 });
    // A cracked lintel: one joint opens and the piece beyond it sags a fraction of a degree.
    const sag = crack > 0 && i >= pieces / 2 ? crack : 0;
    const cx = a + bl * 0.5;
    const u = cx / (len * 0.5);                       // −1 .. +1 along the beam
    const bowY = -bow * Math.max(0, 1 - u * u);       // parabolic droop, zero at the bearings
    const bowSlope = bow === 0 ? 0 : Math.atan(2 * bow * u / (len * 0.5));
    place(g, {
      x: cx, y: -sag * 0.5 + tiltR * cx + bowY,
      rz: THREE.MathUtils.degToRad(sag * 14 + (rng ? rng.jitter(0.25) : 0)) + tiltR + bowSlope,
      ry: rng ? THREE.MathUtils.degToRad(rng.jitter(0.3)) : 0,
    });
    out.push(g);
    a += bl + 0.03;
  }
  const g = mergeAll(out);
  return g ? boxProjectUVs(g) : null;
}

/* ======================= swept mouldings =============================== */

/**
 * Sweep a 2D profile ([out, up] pairs) along X. Indexed so normals average along the
 * profile — a cavetto has to read as a smooth hollow, not as a staircase.
 */
export function sweep(profile, len, opts = {}) {
  const { caps = true, s = UV_PER_M } = opts;
  const n = profile.length;
  const verts = [], uvs = [], idx = [];
  // arclength for V so the moulding's texture doesn't stretch through the curve
  const arc = [0];
  for (let i = 1; i < n; i++) {
    arc[i] = arc[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
  }
  for (let i = 0; i < n; i++) {
    for (let e = 0; e < 2; e++) {
      const x = (e ? 0.5 : -0.5) * len;
      verts.push(x, profile[i][1], profile[i][0]);
      uvs.push(x * s, arc[i] * s);
    }
  }
  /* ---- Every cornice in the level was inside out --------------------------
   *
   * This wound `a, c, b`, which puts the surface normal at (0, +Δout, −Δup): pointing INTO the
   * wall. `computeVertexNormals()` follows the winding, so the whole swept surface carried
   * inward normals, and since every architecture material is `THREE.FrontSide` the cornices
   * were being backface-culled — not mis-lit, absent. Measured two ways before changing it:
   * summed over one straight cornice run, 34 of 36 surface triangles faced −Z where +Z is
   * outward, and the mean stored vertex normal Z was −0.643; and an offline z-buffered
   * rasterisation of the `dunes` camera drew 8,208 pixels of `court:hieroglyph_gilded` as
   * backfaces — both entry pylon crowns, the great gate cornice and both processional gateway
   * cornices, i.e. every cavetto in the frame.
   *
   * That is a direct cause of §7.3's "architecture reads as boxes": the cavetto-and-torus crown
   * is the one silhouette that reads as Egyptian at a hundred metres, and no frame has ever
   * contained one. It also removed the biggest curved surface in the level, which is where a
   * three-band ramp had its best chance of showing a terminator.
   *
   * Correct winding puts the normal at (0, −Δout, +Δup) — outward and downward over the
   * cavetto's overhang, which is what an overhanging moulding does.
   */
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, dd = a + 3;
    idx.push(a, b, c, b, dd, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  if (!caps) return geo;
  // End caps: fan the profile so mitred corners don't show daylight.
  const capGeos = [geo];

  /* ---- The back of the moulding, and why a cornice ring was hollow --------
   *
   * The swept ribbon plus its two end caps is an open shell: the profile runs from (out 0, up 0)
   * to (out 0, up top), so the whole `out = 0` plane down the length of the run — the face that
   * sits against the wall — was never built. Against a wall nobody can tell. But `cornice()`
   * assembles four runs into a *ring*, and a ring's four open backs face a shared void that is
   * open at the top and the bottom, so any camera that gets level with the moulding or looks in
   * past the end of a run sees the inside of the far run.
   *
   * This is the same failure mode as the winding bug and it hid the same way: an open shell does
   * not look broken, it looks like a smear. It was 3.2% of the `traversal` frame — the "giant
   * croissant" — and it is also present in `hero`, `night`, `courtyard` and `dunes`.
   *
   * Wound to face −Z, i.e. into the wall the moulding is applied to, so the ring reads as solid
   * from outside and the back plane reads as solid from inside the void. 38 triangles a run, and
   * +6.6k over the level — 2.1% more architecture triangles to close every moulding in it.
   */
  {
    /* Subdivided to the same profile rows the end caps use. A single quad here is geometrically
       coincident but leaves a T-junction against each cap's `out = 0` rim — 38 unpaired boundary
       edges on one run, measured — and a T-junction is a hairline crack waiting for a camera to
       find it. Row-for-row, the run closes to zero boundary edges. */
    const bv = [], bu = [], bi = [];
    for (let i = 0; i < n; i++) {
      const y = profile[i][1];
      bv.push(-0.5 * len, y, 0, 0.5 * len, y, 0);
      bu.push(-0.5 * len * s, y * s, 0.5 * len * s, y * s);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, dd = a + 3;
      bi.push(a, c, b, b, c, dd);           // wound to −Z: into the wall the moulding sits on
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bv, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
    bg.setIndex(bi);
    bg.computeVertexNormals();
    capGeos.push(bg);
  }
  for (const e of [-0.5, 0.5]) {
    const cv = [], cu = [], ci = [];
    for (let i = 0; i < n; i++) {
      cv.push(e * len, profile[i][1], profile[i][0]);
      cu.push(profile[i][0] * s, profile[i][1] * s);
      cv.push(e * len, profile[i][1], 0);
      cu.push(0, profile[i][1] * s);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, dd = a + 3;
      // Inverted for the same reason as the surface above: the +X cap was winding to −X.
      if (e > 0) ci.push(a, b, c, b, dd, c); else ci.push(a, c, b, b, c, dd);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    cg.setIndex(ci);
    cg.computeVertexNormals();
    capGeos.push(cg);
  }
  return mergeAll(capGeos);
}

/**
 * The Egyptian cornice profile: a torus roll moulding, then a cavetto hollow flaring out,
 * capped by a flat fillet. Nearly vertical where it leaves the wall, then it throws itself
 * outward at the top — that overhang is the whole silhouette, so `flare` is generous.
 */
export function corniceProfile({ h = 2.0, flare = 1.15, roll = 0.42, steps = 9 } = {}) {
  const p = [[0, 0]];
  // torus roll: half-round bulging out of the wall face
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, a = -Math.PI * 0.5 + t * Math.PI;
    p.push([roll * Math.cos(a) * 0.92 + 0.02, roll + roll * Math.sin(a)]);
  }
  const y0 = roll * 2;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    p.push([0.04 + flare * (1 - Math.cos(t * Math.PI * 0.5)), y0 + h * t]);
  }
  const top = y0 + h;
  /* The fillet *overhangs the cavetto and undercuts back*, instead of continuing straight out.
     That 8 cm lip is worth more than its three vertices: it is a hard horizontal shadow line
     under the widest part of the silhouette, running the full length of every cornice in the
     level, and it is the detail that separates "carved cornice" from "flared box". The
     underside faces down and slightly outward, so it is always the darkest band on the mass.
     Deliberately fitted *inside* the original 0.34 m fillet rather than added on top of it:
     `height` is what every roof deck and ledge in EgyptLevel is positioned from, several of
     them §8.1 contract surfaces, so this profile may get wider but it may not get taller. */
  p.push([flare + 0.28, top - 0.06]);   // lip, projecting past the cavetto
  p.push([flare + 0.30, top + 0.04]);
  p.push([flare + 0.22, top + 0.34]);   // fillet slab, drafted back in
  p.push([0, top + 0.34]);              // walkable top, back to the wall plane
  return { profile: p, height: top + 0.34, flare: flare + 0.30 };
}

/** Cornice ring around a rectangular mass. Sides overlap at the corners; rolls hide it. */
export function cornice({ w, d, h = 2.0, flare = 1.15, roll = 0.42 }) {
  const { profile, height, flare: f } = corniceProfile({ h, flare, roll });
  const out = [];
  const ext = f * 2 + 0.1;
  for (const [len, ry, px, pz] of [
    [w + ext, 0, 0, d * 0.5], [w + ext, Math.PI, 0, -d * 0.5],
    [d + ext, Math.PI * 0.5, w * 0.5, 0], [d + ext, -Math.PI * 0.5, -w * 0.5, 0],
  ]) {
    const g = sweep(profile, len);
    place(g, { x: px, z: pz, ry });
    out.push(g);
  }
  const g = mergeAll(out);
  return { geo: g, height };
}

/** Vertical torus rolls down the corners of a battered mass — the other half of the motif. */
export function cornerRolls({ w, d, h, r = 0.4, batter = 0.09, rng }) {
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    /* 16 radial segments is what turns this from a nonagonal post into the lit vertical line
       the pylon silhouette needs.
       Closed, not openEnded. The caps were left off on the assumption that both ends are
       buried in the mass, and on a pylon they are — but a roll stands *proud* of the corner it
       hugs (`w*0.5 - r*0.35`), so on the small masses it is also used on, the barque kiosk
       piers above all, the ends are out in the air and an open tube shows its own bore. That
       was 759 backface pixels of `court:limestone_polished` in `hero`, at the kiosk the shot is
       named for. Two caps at 16 segments is 32 triangles a roll — cheaper than reasoning about
       which masses happen to swallow their ends. */
    const g = new THREE.CylinderGeometry(r * 0.82, r, h, 16, 1, false);
    normaliseAttrs(g);
    // Lean with the batter so the roll hugs the wall for its whole run.
    const lean = Math.atan(batter);
    place(g, {
      x: sx * (w * 0.5 - r * 0.35), y: h * 0.5, z: sz * (d * 0.5 - r * 0.35),
      rx: sz * lean, rz: -sx * lean,
    });
    out.push(g);
  }
  const g = mergeAll(out);
  return g ? boxProjectUVs(g) : null;
}

/* ========================== columns ==================================== */

/**
 * A closed-bud papyrus column. Eight shallow lobes run the whole height so the shaft reads
 * as a bundle of stems, the capital swells to a belly and then closes in again, and the
 * cord bands under it are cut as real geometry rather than left to the texture.
 * Fat at the base, hard taper: r 1.9 -> 1.4 per the art bible.
 *
 * Segment budget, and why it is spent this way round: the shading model quantises N·L into
 * three bands, so a terminator only exists where the normal *turns*. On a column that is
 * entirely the radial direction — so `seg` is generous and the vertical profile is as coarse
 * as the silhouette will tolerate. `seg` must also give each lobe at least ~5 samples or the
 * rib cosine aliases into a zigzag and the shaft goes back to reading as a faceted tube;
 * that aliasing (22 segments against 8 lobes = 2.75 samples per lobe) is why this column had
 * no terminator on it before.
 */
export function papyrusColumn(o = {}) {
  const {
    hShaft = 13.2, rBase = 1.9, rTop = 1.4, capH = 2.4, abacus = 0.62,
    lobes = 8, rib = 0.075, rng, bandCount = 4, shaftSegs = 4, belly = 1.92, neck = 0.80,
    abacusK = 3.68, lean = 0, leanZ = 0,
  } = o;
  // Enough radial samples to resolve the ribs, rounded up to a multiple of the lobe count so
  // every stem is identical and the seam at a=0 lands on a crest.
  const seg = o.seg ?? lobes * 6;

  const prof = [];   // [y, r, ribScale]
  const push = (y, r, rs = 1) => prof.push([y, r, rs]);

  // Base: a real half-round torus roll rather than a flare, so the foot of every column
  // carries a guaranteed terminator at standing eye height.
  const rollR = rBase * 0.20;
  for (let i = 0; i <= 3; i++) {
    const a = -Math.PI * 0.5 + (i / 3) * Math.PI;
    push(rollR + rollR * Math.sin(a), rBase * 1.04 + rollR * Math.cos(a) * 0.9, 0.15);
  }
  const y0 = rollR * 2;
  for (let i = 0; i <= shaftSegs; i++) {
    const t = i / shaftSegs;
    // Entasis, exaggerated: the shaft stays fat well past half height and then necks in
    // hard under the capital. A straight cone is the thing that reads as architectural CAD.
    const r = rBase + (rTop - rBase) * Math.pow(t, 0.62);
    push(y0 + (hShaft - y0) * t, r, 1);
  }
  // Cord bands: the papyrus bundle tied under the capital, cut as half-round cords so each
  // one is its own little terminator. They also neck the shaft in below the bell — the
  // neck-to-belly ratio is what actually reads as "cartoon proportions" at distance, and it
  // is cheaper to buy by pinching the neck than by growing the bell, which here would run
  // the capital straight into the clerestory wall at x = ±11.4.
  let y = hShaft;
  for (let b = 0; b < bandCount; b++) {
    const bh = 0.15;
    push(y, rTop * neck, 0.5);
    push(y + bh * 0.5, rTop * (neck + 0.17), 0.3);
    push(y + bh, rTop * neck, 0.5);
    y += bh + 0.05;
  }
  // Closed bud: swell to a heavy belly then draw back in at the top.
  //
  // The bell's *maximum radius* is not a free parameter — at x = ±8 in the nave it is 2.6 m
  // from running into the clerestory wall's inner face at x = ±10.64. So the "heavier capital"
  // read is bought where it is actually free: the bell now leaves the neck almost vertically
  // and reaches its widest point lower (t = 0.62 rather than 0.74), which is the overhanging,
  // top-heavy profile, and the neck it springs from is thinner. Ratio bell/neck was 2.07; it
  // is now 2.56.
  const capBase = y;
  const bud = [
    [0.00, 1.00], [0.10, 1.34], [0.22, 1.66], [0.36, 1.88],
    [0.50, 2.00], [0.62, 2.05], [0.78, 1.94], [1.00, 1.44],
  ];
  const bk = belly / 2.05;   // `bud` is authored at belly = 2.05; `belly` rescales it
  for (const [t, k] of bud) push(capBase + capH * t, rTop * k * bk, 1.25);
  const capTop = capBase + capH;
  push(capTop, rTop * 1.44 * bk, 0.2);

  /* V is *registered to the column*, not tiled in world metres — see COLUMN_V_TILE. One
     texture repeat spans base to the top of the bell, so the painted binding bands land on
     the cord bundle and just above the base roll, where the recipe draws them, instead of
     wherever 9.0 m happens to fall. U stays in world arclength: it has to, because the ribs
     have to keep their world period as the shaft tapers. */
  const vScale = COLUMN_V_TILE / capTop;

  // build the lobed surface of revolution by hand (LatheGeometry can't do angular ribs)
  const verts = [], nors = [], uvs = [], idx = [];
  const rows = prof.length;
  for (let i = 0; i < rows; i++) {
    const [py, pr, rs] = prof[i];
    // A hand-raised column is not plumb: the whole shaft drifts off vertical by `lean`
    // radians, taken up smoothly over the height rather than as a rigid tilt, so the foot
    // stays planted on its plinth while the capital moves.
    const dx = lean * py, dz = leanZ * py;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const lobe = 1 + rib * rs * Math.cos(a * lobes);
      const r = pr * lobe;
      verts.push(Math.cos(a) * r + dx, py, Math.sin(a) * r + dz);
      nors.push(Math.cos(a), 0, Math.sin(a));
      uvs.push((a * pr) * UV_PER_M, py * vScale);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, dd = c + 1;
      idx.push(a, c, b, b, c, dd);
    }
  }
  const shaft = new THREE.BufferGeometry();
  shaft.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  shaft.setAttribute('normal', new THREE.Float32BufferAttribute(nors, 3));
  shaft.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  shaft.setIndex(idx);
  shaft.computeVertexNormals();
  // Weld the a=0 / a=2π seam so the ring of normals is continuous — otherwise there is a
  // one-quad-wide facet down the column where the two ends of the strip meet unaveraged.
  const nn = shaft.attributes.normal;
  for (let i = 0; i < rows; i++) {
    const a = i * (seg + 1), b = a + seg;
    const nx = nn.getX(a) + nn.getX(b), ny = nn.getY(a) + nn.getY(b), nz = nn.getZ(a) + nn.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nn.setXYZ(a, nx / l, ny / l, nz / l);
    nn.setXYZ(b, nx / l, ny / l, nz / l);
  }
  nn.needsUpdate = true;

  // The abacus is deliberately oversized against the neck it sits on — a wide flat plate
  // capping a narrow bundle is most of what makes an Egyptian capital read as top-heavy.
  const ab = chamferBox(rTop * abacusK, abacus, rTop * abacusK, { rng, jitter: 0.012, c: 0.06 });
  place(boxProjectUVs(ab), {
    x: lean * (capTop + abacus * 0.5), y: capTop + abacus * 0.5, z: leanZ * (capTop + abacus * 0.5),
  });

  return {
    geo: mergeAll([shaft, ab]), height: capTop + abacus, capBase, capTop,
    // What the caller needs to keep proxies and neighbours clear of the bell.
    rMax: rTop * belly, rAbacus: rTop * abacusK * 0.5,
  };
}

/**
 * A square prism with bevelled arrises, given as profile rows [y, half-width, chamfer].
 * Obelisks, pyramidions and spire tips are all this shape, and all three of them used to be
 * four-sided cylinders — which is to say, boxes, with one normal per face and nothing for the
 * ramp to do. The bevels put a lit line down every arris instead.
 *
 * `channel: { frac, depth, y0, y1 }` sinks a vertical trough down the middle of each face
 * between y0 and y1 — the sunk-relief inscription column an obelisk carries on all four sides.
 * It splits the face panel into margin / wall / floor / wall / margin, so each face gains two
 * normals perpendicular to itself: one of them faces the sun and one faces away, at every hour
 * of the day. That is the difference between the obelisk reading as a carved monolith and
 * reading as the bunker the critic called it — four flat faces have four normals between them,
 * and a three-band ramp cannot show anything on that. 8 triangles per face per interval.
 */
export function bevelPrism(rows, { capBottom = true, channel = null } = {}) {
  const pos = [], nor = [], idx = [];
  const push = (p, n) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); return pos.length / 3 - 1; };
  // side s: 0 = +X, 1 = +Z, 2 = -X, 3 = -Z. Outward normal tilts with the taper.
  const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const faceN = (s, i) => {
    const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)];
    const dh = b[1] - a[1], dy = b[0] - a[0];
    const [dx, dz] = dir[s];
    const n = new THREE.Vector3(dx, 0, dz);
    // outward-and-up by the slope of the face
    n.multiplyScalar(dy).add(new THREE.Vector3(0, -dh, 0)).normalize();
    return [n.x, n.y, n.z];
  };
  // corner point between side s and s+1, pulled back onto side `on`
  const pt = (i, s, on) => {
    const [y, half, c] = rows[i];
    const [ax, az] = dir[s], [bx, bz] = dir[(s + 1) % 4];
    const cc = Math.min(c, half * 0.7);
    const p = [(ax + bx) * half, y, (az + bz) * half];
    if (on === 0) { p[0] -= bx * cc; p[2] -= bz * cc; }        // stay on side s
    else { p[0] -= ax * cc; p[2] -= az * cc; }                 // stay on side s+1
    // Optional rows[i][3..4]: shift this row's centre. A prism whose axis wanders is the
    // difference between a symmetric trapezoid and a mass someone piled up — see
    // steppedPyramid, where the apex is deliberately off the footprint centre. `faceN`
    // ignores it on purpose: the offsets in use are metres against tens of metres of
    // half-width, so the normal error is under a degree and not worth four more rows.
    p[0] += rows[i][3] || 0; p[2] += rows[i][4] || 0;
    return p;
  };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  for (let i = 0; i < rows.length - 1; i++) {
    for (let s = 0; s < 4; s++) {
      const nA = faceN(s, i), nB = faceN(s, i + 1);
      // the face panel, between the two bevels that flank it
      const p0 = pt(i, (s + 3) % 4, 1), p1 = pt(i, s, 0);
      const q0 = pt(i + 1, (s + 3) % 4, 1), q1 = pt(i + 1, s, 0);

      const inCh = channel && rows[i][0] >= channel.y0 - 1e-6 && rows[i + 1][0] <= channel.y1 + 1e-6;
      if (!inCh) {
        quad(p0, p1, q1, q0, nA, nA, nB, nB);
      } else {
        const { frac = 0.44, depth = 0.06 } = channel;
        const t0 = 0.5 - frac * 0.5, t1 = 0.5 + frac * 0.5;
        const [dx, dz] = dir[s];
        const sink = (p) => [p[0] - dx * depth, p[1], p[2] - dz * depth];
        const A0 = lerp3(p0, p1, t0), A1 = lerp3(p0, p1, t1);
        const B0 = lerp3(q0, q1, t0), B1 = lerp3(q0, q1, t1);
        const A0i = sink(A0), A1i = sink(A1), B0i = sink(B0), B1i = sink(B1);
        // Along-face tangent. The two trough walls face each other, so their normals are
        // ±tangent — perpendicular to the face, which is the whole point of cutting it.
        const tg = norm3([p1[0] - p0[0], 0, p1[2] - p0[2]]);
        const tgN = [-tg[0], -tg[1], -tg[2]];
        quad(p0, A0, B0, q0, nA, nA, nB, nB);          // margin, hinge side
        quad(A0, A0i, B0i, B0, tg, tg, tg, tg);        // trough wall
        quad(A0i, A1i, B1i, B0i, nA, nA, nB, nB);      // trough floor — the sunk field
        quad(A1i, A1, B1, B1i, tgN, tgN, tgN, tgN);    // trough wall
        quad(A1, p1, q1, B1, nA, nA, nB, nB);          // margin, bevel side
      }

      // the bevel, whose two edges carry the two neighbouring face normals
      const m0 = pt(i, s, 1), m1 = pt(i + 1, s, 1);
      quad(p1, m0, m1, q1, nA, faceN((s + 1) % 4, i), faceN((s + 1) % 4, i + 1), nB);
    }
  }
  function quad(a, b, c, d, na, nb, nc, nd) {
    const ia = push(a, na), ib = push(b, nb), ic = push(c, nc), id = push(d, nd);
    // orient outward using the averaged vertex normal
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const ax = na[0] + nb[0] + nc[0], ay = na[1] + nb[1] + nc[1], az = na[2] + nb[2] + nc[2];
    if (gx * ax + gy * ay + gz * az < 0) idx.push(ia, ic, ib, ia, id, ic);
    else idx.push(ia, ib, ic, ia, ic, id);
  }
  if (capBottom) {
    const [y, half] = rows[0];
    const ox = rows[0][3] || 0, oz = rows[0][4] || 0;
    const n = [0, -1, 0];
    const a = push([ox - half, y, oz - half], n), b = push([ox + half, y, oz - half], n);
    const c = push([ox + half, y, oz + half], n), d = push([ox - half, y, oz + half], n);
    idx.push(a, b, c, a, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/* ========================== obelisk ==================================== */

/**
 * Obelisk: hard-tapered square shaft under a pyramidion. Tagged `pole`, so keep it clean.
 * The arrises are bevelled — an obelisk is four flat faces and a point, which is to say a
 * box, and the four lit edges are the only thing that gives it any modelling at all.
 */
export function obelisk({ h = 22, base = 2.6, rng, relief = true } = {}) {
  const tipH = base * 1.25;
  const shaftH = h - tipH;
  const rt = base * 0.60;
  const c = Math.min(0.075, base * 0.05);
  /* The inscription column runs from a plinth margin up to a margin under the benben.
     Its two bounding rows exist only to stop the trough — vertical subdivision buys nothing
     on a flat face, so there are exactly as many rows as the shape needs and no more. */
  const cy0 = Math.min(1.1, shaftH * 0.14), cy1 = shaftH - Math.min(0.45, shaftH * 0.06);
  /* t² not t: the old three-row shaft put its mid-row at 0.75·base + 0.25·rt, which is a
     convex taper, not a cone. Keep that exactly — an obelisk that tapers linearly reads as a
     wedge — so this reproduces the old silhouette at t = 0, ½ and 1 and interpolates between. */
  const halfAt = (y) => { const t = y / shaftH; return 0.5 * (base + (rt - base) * t * t); };
  const g = bevelPrism([
    [0, base * 0.5, c],
    [cy0, halfAt(cy0), c],
    [shaftH * 0.5, halfAt(shaftH * 0.5), c],
    [cy1, halfAt(cy1), c],
    [shaftH, rt * 0.5, c],
    // A benben fillet: the pyramidion sits on a lip rather than growing out of the shaft,
    // so the tip reads as a separate carved stone from a hundred metres.
    [shaftH + 0.10, rt * 0.56, c * 0.8],
    [shaftH + 0.22, rt * 0.54, c * 0.8],
    [h - 0.04, base * 0.035, c * 0.3],
    [h, 0.012, c * 0.2],
  ], relief ? { channel: { frac: 0.46, depth: Math.max(0.045, base * 0.038), y0: cy0, y1: cy1 } } : {});
  place(g, { ry: Math.PI * 0.25 + (rng ? rng.jitter(0.02) : 0) });
  return boxProjectUVs(g);
}

/* =========================== stairs ==================================== */

/**
 * A flight climbing along +X from the origin. Treads are separate blocks with drifting
 * front edges — a stair is where "hand-cut" reads hardest because you see every nose.
 */
export function stairFlight({ steps = 12, rise = 0.5, run = 0.62, width = 6, rng, cheek = 0 }) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    // A chamfered nose is what makes a flight read as cut stone rather than as a ramp of
    // boxes: every tread edge picks up a lit line along its whole width.
    const g = chamferBox(run + 0.06, rise + 0.9, width - (rng ? rng.range(0, 0.06) : 0),
      { rng, jitter: 0.018, chip: rng && rng.chance(0.2) ? 0.12 : 0, c: 0.05, only: 'top' });
    place(g, {
      x: (i + 0.5) * run, y: (i + 1) * rise - (rise + 0.9) * 0.5,
      ry: rng ? THREE.MathUtils.degToRad(rng.jitter(0.22)) : 0,
    });
    out.push(g);
  }
  if (cheek > 0) {
    for (const s of [-1, 1]) {
      const len = steps * run;
      const g = chamferBox(len, cheek, 0.7, { rng, jitter: 0.02, c: 0.05 });
      // The ramped balustrade doubles as a rail line.
      place(g, {
        x: len * 0.5, y: steps * rise * 0.5 + cheek * 0.5 - 0.1, z: s * (width * 0.5 + 0.3),
        rz: Math.atan2(steps * rise, len),
      });
      out.push(g);
    }
  }
  const g = mergeAll(out);
  return boxProjectUVs(g);
}

/* ========================== paving ===================================== */

/**
 * Per-slab instance matrices for a paved area. Real slabs, real joints, real height
 * variation — a single textured plane is the fastest way to look like a WebGL demo.
 */
export function pavingMatrices({ x0, x1, z0, z1, y = 0, slab = 2.2, rng, sink = 0.05, holes = [] }) {
  const list = [];
  const nx = Math.max(1, Math.round((x1 - x0) / slab));
  const nz = Math.max(1, Math.round((z1 - z0) / slab));
  const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cx = x0 + (i + 0.5) * sx, cz = z0 + (j + 0.5) * sz;
      let skip = false;
      for (const hRect of holes) {
        if (cx > hRect[0] && cx < hRect[1] && cz > hRect[2] && cz < hRect[3]) { skip = true; break; }
      }
      if (skip) continue;
      const jx = rng ? rng.jitter(0.05) : 0, jz = rng ? rng.jitter(0.05) : 0;
      const dy = rng ? rng.jitter(sink) : 0;
      const m = new THREE.Matrix4();
      _e.set(0, rng ? THREE.MathUtils.degToRad(rng.jitter(0.7)) : 0, rng ? THREE.MathUtils.degToRad(rng.jitter(0.35)) : 0, 'YXZ');
      _q.setFromEuler(_e);
      m.compose(
        _v.set(cx + jx, y + dy, cz + jz), _q,
        new THREE.Vector3((sx - 0.07) / 1, 1, (sz - 0.07) / 1)
      );
      list.push(m);
    }
  }
  return list;
}

/**
 * A whole paved field as one merged geometry, with UVs projected in **world** space.
 *
 * This replaces an InstancedMesh over a `slabUnit()` — a unit box whose UVs were baked by
 * `boxProjectUVs` and which was then handed to an instance matrix that scaled it to ~2.4 m.
 * `boxProjectUVs` reads vertex *positions*, so geometry scales and baked UVs do not: the map
 * came out stretched by the instance scale (one repeat per ~21 m against the authored 8.8 m),
 * and every one of the 675 slabs showed the *same* 0.5-unit patch of it. Measured in frame
 * that read as more periodic than a deliberately planted perfect period.
 *
 * The comment that used to sit here is the cautionary part: it tracked unit-space-times-
 * instance-scale correctly for the bevel and did not carry it one line down to the UVs.
 * `boxProjectUVs` is sensitive to the space it runs in and this is the second defect of that
 * shape; the rule is now that it runs **after** every transform the geometry will ever take.
 *
 * The bevel genuinely does want to be in unit space — a 0.022 unit chamfer becomes ~5 cm
 * across and ~2.2 cm down on a 2.4 m slab, and that lit rim along every joint is most of what
 * stops a courtyard floor reading as one flat plane. So each slab is still built as a unit box
 * and scaled by its own matrix, and `applyMatrix4` carries normals through the inverse
 * transpose exactly as three's instancing path does: the emitted triangles and shading normals
 * are identical to the instanced version. Only the projection moved.
 *
 * Costs the same one draw call and the same triangles as the InstancedMesh it replaces,
 * trading instance memory for real vertices (~2 MB across the level's three fields).
 */
export function pavingField({ x0, x1, z0, z1, y = 0, slab = 2.2, thick = 0.5, rng, sink = 0.05, holes = [] }) {
  /* One unit slab, cloned — not one `chamferBox` call per slab. The InstancedMesh this
     replaces drew a single jittered unit box 675 times, so cloning reproduces its triangles
     exactly; building a fresh box per slab instead drew 675x more from `rng` and shifted the
     whole downstream stream, which re-rolled every chipped corner and fallen block in the
     level. A geometry change that silently reseeds the rest of the build is not a local fix. */
  /* Two of the four rim bevels, not four. A full rim draws one continuous lit rule down
     every joint of the field, and under the cool night key that rule is the measured `guard`
     defect: bevel ndl 0.712 vs floor 0.473 at tod 0.10 — a band up, rendered cyan, lying
     exactly where contact occlusion should read (critic pass 4 §12; probed to these bevels
     by raycast at px (470,556) → N (0, .925, −.381) on `paving:court`). Masking opposite
     sides and quarter-turning per slab keeps the day-time carved rim on ~half of every
     joint's length as *dashes* — hand-worn edges — and no joint line survives as a rule.
     The turn is hashed off the slab's own deterministic position, not drawn from `rng`:
     the unit build consumes exactly the draws it always did, so the level's downstream
     stream is untouched (the reseeding trap documented above). Odd turns swap the slab's
     footprint axes; grids are near-square (≤2.4 cm mismatch) and joints already jitter
     ±5 cm, so the swap disappears into the authored irregularity. */
  const unit = chamferBox(1, thick, 1, {
    rng, jitter: 0.006, c: 0.022, only: 'top',
    edges: { px: true, pz: true, nx: false, nz: false },
  });
  place(unit, { y: -thick * 0.5 });
  const out = [];
  const R = [0, 1, 2, 3].map((q) => new THREE.Matrix4().makeRotationY(q * Math.PI * 0.5));
  const mm = new THREE.Matrix4();
  for (const m of pavingMatrices({ x0, x1, z0, z1, y, slab, rng, sink, holes })) {
    const e = m.elements;
    const qt = Math.abs(Math.round(e[12] * 97 + e[14] * 57)) & 3;
    mm.copy(m).multiply(R[qt]);
    out.push(unit.clone().applyMatrix4(mm));
  }
  unit.dispose();
  const g = mergeAll(out);
  return g ? boxProjectUVs(g) : null;
}

/* ===================== traversal furniture ============================= */

/** Hook ring: a fat torus on a bracket. Chunky because it has to read as grabbable. */
export function hookRing({ r = 0.62, tube = 0.11, rng } = {}) {
  // A torus is one of the few shapes here that carries a terminator all the way round in
  // both directions; at 6 tubular segments it was a hexagonal wire and threw that away.
  const t = new THREE.TorusGeometry(r, tube, 10, 18);
  normaliseAttrs(t);
  place(t, { rx: Math.PI * 0.5 });
  const shackle = new THREE.CylinderGeometry(tube * 1.5, tube * 1.5, 0.42, 10);
  normaliseAttrs(shackle);
  place(shackle, { y: r + 0.16 });
  const g = mergeAll([t, shackle]);
  return boxProjectUVs(g);
}

/** Chain from a beam down to a ring: cheap twisted prism, reads as links at distance. */
export function chain({ len = 1.8, r = 0.075, links = 6 } = {}) {
  const out = [];
  for (let i = 0; i < links; i++) {
    const g = new THREE.BoxGeometry(r * 2.6, len / links * 0.96, r * 1.1);
    normaliseAttrs(g);
    place(g, { y: -(i + 0.5) * (len / links), ry: (i % 2) * Math.PI * 0.5 });
    out.push(g);
  }
  return boxProjectUVs(mergeAll(out));
}

/** Rail: a tube along a curve, plus the tube geometry for the visible mesh. */
export function railGeo(curve, { r = 0.14, seg = 60, rad = 6 } = {}) {
  const g = new THREE.TubeGeometry(curve, seg, r, rad, false);
  normaliseAttrs(g);
  const pos = g.attributes.position, uv = g.attributes.uv;
  // TubeGeometry's u runs 0..1 along the whole curve; rescale to world metres.
  const L = curve.getLength();
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L * UV_PER_M, uv.getY(i) * 2 * Math.PI * r * UV_PER_M);
  uv.needsUpdate = true; pos.needsUpdate = true;

  /* TubeGeometry has no end caps, so an open rail shows its own bore — the last few backface
     pixels left in the set after the cornice and roll seals, on `arch:hall:bronze_dark`. Fan
     each end ring off the curve's endpoint. `rad` triangles a cap, ~24 for the whole level. */
  const caps = [g];
  for (const e of [0, 1]) {
    const centre = curve.getPointAt(e);
    const cv = [centre.x, centre.y, centre.z], cu = [0, 0], ci = [];
    // TubeGeometry lays out (seg+1) rings of (rad+1) verts; ring `e ? seg : 0` is the end.
    const base = (e ? seg : 0) * (rad + 1);
    for (let j = 0; j <= rad; j++) {
      const k = base + j;
      cv.push(pos.getX(k), pos.getY(k), pos.getZ(k));
      cu.push(Math.cos(j / rad * Math.PI * 2) * r * UV_PER_M, Math.sin(j / rad * Math.PI * 2) * r * UV_PER_M);
    }
    for (let j = 0; j < rad; j++) {
      // Start cap faces −tangent, end cap faces +tangent. Verified against curve.getTangentAt,
      // not by inspection: the first winding here was inverted on both caps, and an inverted
      // cap is culled, so it neither closed the bore nor showed up as a backface. It looked
      // exactly like a fix and did nothing but cost triangles.
      if (e) ci.push(0, j + 2, j + 1); else ci.push(0, j + 1, j + 2);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    cg.setIndex(ci);
    cg.computeVertexNormals();
    caps.push(cg);
  }
  return mergeAll(caps) || g;
}

/** Spire tip: a squat four-sided pinnacle, arrises bevelled. The point is the landing target. */
export function spire({ r = 0.55, h = 2.3, rng } = {}) {
  const g = bevelPrism([
    [0, r * 0.62, 0.03], [h * 0.18, r * 0.58, 0.03], [h - 0.03, r * 0.05, 0.012], [h, 0.01, 0.006],
  ]);
  place(g, { y: 0, ry: Math.PI * 0.25 });
  const collar = chamferBox(r * 1.9, 0.34, r * 1.9, { rng, jitter: 0.01, c: 0.045 });
  place(collar, { y: 0.1 });
  return boxProjectUVs(mergeAll([g, collar]));
}

/* ============================ sand ===================================== */

/**
 * A drift piled against a wall: a ribbon whose crest wanders, whose toe wanders, and
 * which is deliberately tallest where two forms meet. Local X = along the wall, the drift
 * spills toward +Z.
 */
export function sandDrift({ len = 12, h = 1.5, depth = 3.2, seg = 14, rng }) {
  const verts = [], uvs = [], idx = [];
  /* Three rows, not two. A two-row ribbon is a single flat slope with one normal across its
     whole width, which is the same "nothing for the ramp to quantise" problem the walls had —
     and a drift sits exactly where a wall meets the ground, which is the most valuable place
     in the frame for a terminator. The middle row puts a convex shoulder on it. */
  const ROWS = [
    [1.00, 0.00],   // crest, hard against the wall
    [0.45, 0.22],   // the steep face just under the crest — about 50 deg
    [0.16, 0.58],   // shoulder, about 21 deg
    [0.00, 1.00],   // toe feathering into the ground, about 10 deg
  ];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, x = (t - 0.5) * len;
    const wob = rng ? rng.jitter(0.5) : 0;
    const hh = Math.max(0.12, h * (0.55 + 0.45 * Math.sin(t * Math.PI)) + wob * 0.35);
    const dd = depth * (0.6 + 0.4 * Math.sin(t * Math.PI * 1.3 + 0.7)) + (rng ? rng.jitter(0.4) : 0);
    for (const [hk, dk] of ROWS) {
      const jx = hk < 1 ? (rng ? rng.jitter(0.3 * dk) : 0) : 0;
      verts.push(x + jx, Math.max(0.015, hh * hk), dd * dk);
      uvs.push(x * UV_PER_M, dd * dk * UV_PER_M);
    }
  }
  const R = ROWS.length;
  for (let i = 0; i < seg; i++) {
    for (let r = 0; r < R - 1; r++) {
      const a = i * R + r, b = a + 1, c = a + R, dd = c + 1;
      idx.push(a, b, c, b, dd, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  /* ---- A drift is a membrane, and from behind it was a hole -------------
   * This is one open surface with no underside, so from its far side it is culled and you see
   * whatever is beyond it. Usually that is the wall it is banked against and nobody notices —
   * but the inner pylon's drift is banked on the north face, and the `temple` camera looks
   * north straight through the gate at it, so the bottom of that doorway rendered as a hole.
   * Measured on the offline raster: 896 backface pixels of `pylon:sandstone_worn`, all of them
   * inside the gate opening.
   *
   * Duplicated with the winding and the normals flipped rather than by setting the material
   * to `DoubleSide` — the drift shares a merged bucket with ordinary masonry, and turning that
   * bucket two-sided would cost every wall in it its backface culling for the sake of one
   * ribbon. About 40 extra triangles per drift.
   */
  const back = g.clone();
  const bi = back.index.array;
  for (let i = 0; i < bi.length; i += 3) { const t = bi[i + 1]; bi[i + 1] = bi[i + 2]; bi[i + 2] = t; }
  const bn = back.attributes.normal;
  for (let i = 0; i < bn.count; i++) bn.setXYZ(i, -bn.getX(i), -bn.getY(i), -bn.getZ(i));
  bn.needsUpdate = true; back.index.needsUpdate = true;
  return mergeAll([g, back]) || g;
}

/* ========================== pyramids =================================== */

/**
 * A background pyramid: one cased mass, not a staircase.
 *
 * The old build stacked 34 four-sided cylinders. From the `dunes` camera the near pyramid is
 * ~266 m away, where 720 px of frame covers 46°, so each 3.1 m course landed ~10 px tall with
 * a 7 px inset — a literal staircase down both silhouette edges at exactly the frequency that
 * reads as aliasing rather than as masonry. That stack also carried 68 interior cap faces per
 * pyramid: never visible, every one of them a shadow caster, and between them 87% of the whole
 * level's surface area, which silently invalidated every area-weighted measurement taken here.
 *
 * This is the Khafre read instead — smooth casing surviving over the top `casing` fraction of
 * the height, one crisp horizontal ledge where the casing was stripped, and bare core set back
 * behind it below. The four arrises are bevelled, so each corner carries a lit line for the
 * ramp to bite on, and the axis drifts on independent X and Z phases with the apex off the
 * footprint centre, so no elevation is a symmetric trapezoid.
 *
 * 114 triangles against ~560, and not one interior face.
 */
export function steppedPyramid({ base = 105, h = 105, rng, casing = 0.22 } = {}) {
  const hb = base * 0.5;
  const R = rng;
  const tC = Math.min(0.9, Math.max(0.1, 1 - casing));   // height fraction where casing starts

  /* Casing thickness, and therefore the width of the one horizontal ledge in the silhouette.
     3% of the half-base puts it at ~2.2 m on the near pyramid — about 7 px at the `dunes`
     camera, which is a feature you can point at. The old build's 7 px steps were a defect
     only because there were thirty-four of them. */
  const ct = hb * 0.03;
  const skirt = hb * 0.035;                              // talus of debris/sand at the foot
  const half = (t) => Math.max(0.8, hb * (1 - t));
  const cham = (t) => Math.max(0.4, hb * 0.05 * (1 - t * 0.65));

  // Axis drift. Independent phases per axis — one shared curve would lean the mass but leave
  // every elevation symmetric about its own centreline, which is the thing being fixed.
  const phX = R ? R.range(0, Math.PI * 2) : 0.7;
  const phZ = R ? R.range(0, Math.PI * 2) : 2.4;
  const dk = hb * 0.035;
  const ox = (t) => dk * Math.sin(t * 2.1 + phX) * t * t;
  const oz = (t) => dk * Math.sin(t * 1.7 + phZ) * t * t;
  const row = (t, halfW, c) => [h * t, halfW, c, ox(t), oz(t)];

  const tSkirt = 0.022;

  /* ---- Row count is the stair-stepping ---------------------------------
   *
   * This profile is straight by construction — `half(t)` is linear in t, so every row of the
   * stripped core lies on one line and the casing lies on another, with a single deliberate
   * `ct` ledge between them. That is the correct *shape*, and it is why the 34-course version
   * this replaced was the right thing to delete.
   *
   * It was still built from eight rows, and eight is not enough to draw it. pyr1's silhouette
   * is ~320 px tall at the `dunes` camera, so eight rows put a break every ~40 px. Worse, the
   * axis drift `ox`/`oz` below is sampled *per row* and interpolated straight between them:
   * at ±2.7 m it swings ±14 px at that camera, so coarse rows turn a smooth wander into a
   * chain of visible kinks, which is exactly what reads as a staircase on a silhouette that
   * is supposed to be a clean diagonal.
   *
   * `bevelPrism` costs ~16 triangles per row-pair, so the whole pyramid is a few hundred
   * triangles either way — subdividing to 20 row-pairs costs ~210 triangles against a 1.2 M
   * budget. There is no reason to be mean with it.
   */
  const CORE = 11, CASE = 7;
  const rows = [[0, hb + skirt, cham(0) * 0.6, 0, 0]];   // bedding: flares out into the sand
  for (let i = 0; i <= CORE; i++) {
    const t = tSkirt + (tC - tSkirt) * (i / CORE);
    rows.push(row(t, half(t) - ct, cham(t)));            // the stripped core
  }
  for (let i = 0; i <= CASE; i++) {                      // casing ledge -> apex platform
    const t = tC + 0.006 + (0.965 - tC - 0.006) * (i / CASE);
    rows.push(row(t, half(t), cham(t)));
  }

  const g = bevelPrism(rows, { capBottom: true });
  normaliseAttrs(g);
  return boxProjectUVs(g, UV_PER_M * 0.25);
}

/* ====================== collision proxies ============================== */

/**
 * Simple invisible proxy meshes for COLLISION. The art meshes are merged, chipped and
 * jittered — great to look at, miserable to sweep a capsule against. Proxies give
 * MOVEMENT clean planes with the right normals (including the battered wall angle) and
 * cost zero draw calls.
 */
export function proxyBox(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.visible = false;
  return m;
}

/** Battered wall proxy: tapered box whose faces carry the real lean. */
export function proxyBattered(w, d, h, batter, mat) {
  const top = new THREE.Vector2(Math.max(0.4, w - 2 * batter * h), Math.max(0.4, d - 2 * batter * h));
  const g = new THREE.BufferGeometry();
  const hw = w * 0.5, hd = d * 0.5, tw = top.x * 0.5, td = top.y * 0.5;
  const v = [
    -hw, 0, hd, hw, 0, hd, tw, h, td, -tw, h, td,     // +Z
    hw, 0, -hd, -hw, 0, -hd, -tw, h, -td, tw, h, -td, // -Z
    hw, 0, hd, hw, 0, -hd, tw, h, -td, tw, h, td,     // +X
    -hw, 0, -hd, -hw, 0, hd, -tw, h, td, -tw, h, -td, // -X
    -tw, h, td, tw, h, td, tw, h, -td, -tw, h, -td,   // top
  ];
  const idx = [];
  for (let f = 0; f < 5; f++) { const a = f * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  const m = new THREE.Mesh(g, mat);
  m.visible = false;
  return m;
}

/**
 * One flank of a battered mass, so a gate through it is actually walkable.
 *
 * `proxyBattered` is a solid tapered box. On a pylon with a gate cut through it that is wrong
 * in a way nothing in the art shows: measured by walking the inner pylon's centre line at
 * y = 1.0, §8.1 route step 6 — "out of the hall through the inner pylon gate" — was inside a
 * `wall` proxy for 8 consecutive metres, z −48 to −55. The passage could be seen through and
 * not entered.
 *
 * Splitting it into two flanks with an axis-aligned box would have cost the batter on the
 * bottom third of the tower, and the batter is the wall-run surface the rooftop route uses. So
 * the flank keeps it: the OUTER edge leans in with the mass, and the inner edge — the gate
 * reveal — stays vertical, which is what the jamb blocks in the art do too.
 *
 * `xOut` is the outer edge at the base, `xIn` the gate reveal. Both in the mass's local X.
 */
export function proxyFlank(xOut, xIn, d, h, batter, mat) {
  const s = Math.sign(xOut - xIn) || 1;                 // +1 for the +X flank
  const xOutTop = xOut - s * batter * h;
  const hd = d * 0.5, td = Math.max(0.2, hd - batter * h);
  // Wound so every face points out of the solid, same convention as proxyBattered.
  const lo = s > 0 ? xIn : xOutTop, hi = s > 0 ? xOutTop : xIn;   // top span
  const blo = s > 0 ? xIn : xOut, bhi = s > 0 ? xOut : xIn;       // base span
  const v = [
    blo, 0, hd, bhi, 0, hd, hi, h, td, lo, h, td,        // +Z
    bhi, 0, -hd, blo, 0, -hd, lo, h, -td, hi, h, -td,    // -Z
    bhi, 0, hd, bhi, 0, -hd, hi, h, -td, hi, h, td,      // +X
    blo, 0, -hd, blo, 0, hd, lo, h, td, lo, h, -td,      // -X
    lo, h, td, hi, h, td, hi, h, -td, lo, h, -td,        // top
  ];
  const idx = [];
  for (let f = 0; f < 5; f++) { const a = f * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  const m = new THREE.Mesh(g, mat);
  m.visible = false;
  return m;
}
