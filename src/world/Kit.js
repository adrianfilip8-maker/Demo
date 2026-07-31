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
  const { rng, jitter = 0.02, chip = 0, taper = 0, lean = 0 } = opts;
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
  return geo;
}

/**
 * A chamfered block — the single highest-value shape in this file.
 *
 * A plain box has one normal per face, so the 3-band cel ramp lands the whole face in one
 * band and there is no terminator anywhere in the frame. This adds a narrow bevel along the
 * arrises whose vertices carry the *adjacent face* normals, so the interpolated normal sweeps
 * the full 90° across a 3 cm strip: the quantiser draws all three bands inside it and every
 * edge reads as a lit line. The flat faces keep their flat normals on purpose — that is what
 * keeps the stone reading as blocked-in colour rather than as a smooth render.
 *
 * `c` is the chamfer in metres; `only:'top'` bevels just the top rim (24 tris instead of 44),
 * which is what anything sitting on the ground wants.
 */
export function chamferBox(w, h, d, opts = {}) {
  const { rng, jitter = 0.0, chip = 0, taper = 0, lean = 0, shear = 0, round = 0, c = 0.035, only = 'all' } = opts;
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

  const pos = [], nor = [], idx = [];
  const push = (p, n) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); return pos.length / 3 - 1; };
  const S = (i) => (i ? 1 : -1);
  // The three bevel vertices at a corner: one pulled off each of the meeting faces.
  const cor = (i, j, k, axis) => {
    const o = off.get(i * 4 + j * 2 + k), e = cAt(j);
    const p = [S(i) * W + o[0], S(j) * H + o[1], S(k) * D + o[2]];
    if (axis !== 0) p[0] -= S(i) * e;
    if (axis !== 1) p[1] -= S(j) * e;
    if (axis !== 2) p[2] -= S(k) * e;
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

  // Six inset faces.
  for (let axis = 0; axis < 3; axis++) {
    for (let s = 0; s < 2; s++) {
      const quad = [];
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const ijk = [0, 0, 0];
        ijk[axis] = s;
        ijk[(axis + 1) % 3] = u; ijk[(axis + 2) % 3] = v;
        quad.push({ p: cor(ijk[0], ijk[1], ijk[2], axis), n: nrm(ijk[0], ijk[1], ijk[2], axis) });
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
    sag = 0, windFace = null, windK = 2.0,
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

  for (let c = 0; c < nCourse; c++) {
    const yb = c * ch, yc = yb + ch * 0.5;
    const inset = batter * yc;
    const wc = Math.max(1.2, w - 2 * inset);
    const dc = Math.max(1.2, d - 2 * inset);
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
        let skip = false;
        for (const op of openings) {
          if (op.face !== face.f) continue;
          const y0 = op.y0 ?? -1, y1 = op.y1 ?? 1e3;
          if (!(yb + ch > y0 && yb < y1)) continue;
          const oa0 = op.a0 * oScale, oa1 = op.a1 * oScale;
          if (s1 <= oa0 || s0 >= oa1) continue;                     // clear of the hole
          if (s0 >= oa0 && s1 <= oa1) { skip = true; break; }        // wholly inside it
          if (s0 < oa0 && s1 > oa1) s1 = oa0;                        // spans it: keep the jamb side
          else if (s0 < oa0) s1 = Math.min(s1, oa0);
          else s0 = Math.max(s0, oa1);
        }
        if (skip) continue;
        /* Erosion is directional. The wind comes up the valley and loads one face with sand
           all year; that face loses blocks and takes chips at twice the rate of the sheltered
           one. It costs nothing, and because the two entry pylons are seen from the south it
           is what stops them reading as a mirrored pair. */
        const exposure = windFace == null ? 1
          : face.f === windFace ? windK
          : face.f === (windFace ^ 1) ? 1 / windK : 1;
        if (rng && rng.chance(Math.min(0.35, gapChance * exposure)) && yb > 1.2) continue;
        bl = s1 - s0;
        if (bl < 0.16) continue;
        const ac = (s0 + s1) * 0.5;

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
          x: px, y: yb + ch * 0.5 - sink * 0.5 + dy, z: pz,
          ry,
          rz: face.axis === 'x' ? jz + sl : jz,
          rx: face.axis === 'z' ? -sl : 0,
        });
        out.push(g);
      }
    }

    if (!hollow) {
      // Solid core for small masses (piers): one cheap box behind the skin.
      const core = block(Math.max(0.2, wc - thick * 1.7), ch + sink, Math.max(0.2, dc - thick * 1.7), { rng, jitter: 0.01 });
      place(core, { y: yb + ch * 0.5 - sink * 0.5 });
      out.push(core);
    }
  }
  const g = mergeAll(out);
  return g ? boxProjectUVs(g) : null;
}

/** Flat slab / lintel / architrave built from a short run of blocks so the joints show. */
export function beam(len, h, d, opts = {}) {
  const { rng, pieces = Math.max(1, Math.round(len / 2.2)), crack = 0, chip = 0.1, chamfer = 0.05 } = opts;
  const out = [];
  let a = -len * 0.5;
  for (let i = 0; i < pieces; i++) {
    const bl = (len / pieces) - (i < pieces - 1 ? 0.03 : 0);
    const g = chamfer > 0
      ? chamferBox(bl, h, d, { rng, jitter: 0.014, chip: rng && rng.chance(0.25) ? chip : 0, c: chamfer })
      : block(bl, h, d, { rng, jitter: 0.014, chip: rng && rng.chance(0.25) ? chip : 0 });
    // A cracked lintel: one joint opens and the piece beyond it sags a fraction of a degree.
    const sag = crack > 0 && i >= pieces / 2 ? crack : 0;
    place(g, {
      x: a + bl * 0.5, y: -sag * 0.5,
      rz: THREE.MathUtils.degToRad(sag * 14 + (rng ? rng.jitter(0.25) : 0)),
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
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, dd = a + 3;
    idx.push(a, c, b, b, c, dd);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  if (!caps) return geo;
  // End caps: fan the profile so mitred corners don't show daylight.
  const capGeos = [geo];
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
      if (e > 0) ci.push(a, c, b, b, c, dd); else ci.push(a, b, c, b, dd, c);
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
     That 8 cm lip is worth more than its two vertices: it is a hard horizontal shadow line
     under the widest part of the silhouette, running the full length of every cornice in the
     level, and it is the detail that separates "carved cornice" from "flared box". The
     underside faces down and slightly outward, so it is always the darkest band on the mass. */
  p.push([flare + 0.28, top - 0.06]);   // lip, projecting past the cavetto
  p.push([flare + 0.30, top + 0.06]);
  p.push([flare + 0.22, top + 0.40]);   // fillet slab, drafted back in
  p.push([0, top + 0.40]);              // walkable top, back to the wall plane
  return { profile: p, height: top + 0.40, flare: flare + 0.30 };
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
    // openEnded: both caps are buried in the mass, and 16 radial segments is what turns
    // this from a nonagonal post into the lit vertical line the pylon silhouette needs.
    const g = new THREE.CylinderGeometry(r * 0.82, r, h, 16, 1, true);
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
    lobes = 8, rib = 0.075, rng, bandCount = 4, shaftSegs = 4, belly = 2.05, neck = 0.80,
    abacusK = 3.68, lean = 0,
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
  const bk = belly / 2.05;
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
    const dx = lean * py;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const lobe = 1 + rib * rs * Math.cos(a * lobes);
      const r = pr * lobe;
      verts.push(Math.cos(a) * r + dx, py, Math.sin(a) * r);
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
  place(boxProjectUVs(ab), { x: lean * (capTop + abacus * 0.5), y: capTop + abacus * 0.5 });

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
 */
export function bevelPrism(rows, { capBottom = true } = {}) {
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
    return p;
  };
  for (let i = 0; i < rows.length - 1; i++) {
    for (let s = 0; s < 4; s++) {
      const nA = faceN(s, i), nB = faceN(s, i + 1);
      // the face panel, between the two bevels that flank it
      const p0 = pt(i, (s + 3) % 4, 1), p1 = pt(i, s, 0);
      const q0 = pt(i + 1, (s + 3) % 4, 1), q1 = pt(i + 1, s, 0);
      quad(p0, p1, q1, q0, nA, nA, nB, nB);
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
    const n = [0, -1, 0];
    const a = push([-half, y, -half], n), b = push([half, y, -half], n);
    const c = push([half, y, half], n), d = push([-half, y, half], n);
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
export function obelisk({ h = 22, base = 2.6, rng } = {}) {
  const tipH = base * 1.25;
  const shaftH = h - tipH;
  const rt = base * 0.60;
  const c = Math.min(0.075, base * 0.05);
  const g = bevelPrism([
    [0, base * 0.5, c],
    [shaftH * 0.5, (base * 0.75 + rt * 0.25) * 0.5, c],
    [shaftH, rt * 0.5, c],
    // A benben fillet: the pyramidion sits on a lip rather than growing out of the shaft,
    // so the tip reads as a separate carved stone from a hundred metres.
    [shaftH + 0.10, rt * 0.56, c * 0.8],
    [shaftH + 0.22, rt * 0.54, c * 0.8],
    [h - 0.04, base * 0.035, c * 0.3],
    [h, 0.012, c * 0.2],
  ]);
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

/** Unit slab used by the paving InstancedMesh (scaled per instance). */
export function slabUnit(thick = 0.5, rng) {
  /* The chamfer is in *unit* space and the instance matrix scales it by the slab size, so a
     0.022 unit bevel lands at roughly 5 cm on a 2.4 m slab. Every paving joint then carries a
     lit rim, which is most of what stops a courtyard floor reading as one flat plane — and it
     is the largest single surface in five of the ten canonical shots. */
  const g = chamferBox(1, thick, 1, { rng, jitter: 0.006, c: 0.022, only: 'top' });
  place(g, { y: -thick * 0.5 });
  return boxProjectUVs(g, UV_PER_M);
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
  return g;
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
  return g;
}

/* ========================== pyramids =================================== */

/** Stepped background pyramid. Silhouette only — it lives behind 60% haze. */
export function steppedPyramid({ base = 105, h = 105, courses = 34, rng, casing = 0.22 }) {
  const out = [];
  for (let i = 0; i < courses; i++) {
    const t = i / courses, t2 = (i + 1) / courses;
    const b0 = base * (1 - t), b1 = base * (1 - t2);
    const ch = h / courses;
    const g = new THREE.CylinderGeometry(b1 * 0.5 * Math.SQRT2, b0 * 0.5 * Math.SQRT2, ch, 4, 1);
    normaliseAttrs(g);
    // A missing course-edge here and there keeps the profile from being a perfect triangle.
    place(g, {
      y: i * ch + ch * 0.5, ry: Math.PI * 0.25 + (rng ? rng.jitter(0.004) : 0),
      x: rng ? rng.jitter(0.35) : 0, z: rng ? rng.jitter(0.35) : 0,
    });
    out.push(g);
  }
  // smooth casing survives near the apex — the classic Khafre read
  if (casing > 0) {
    const ch = h * casing;
    const g = new THREE.CylinderGeometry(0.4, base * casing * 0.5 * Math.SQRT2 * 1.02, ch, 4, 1);
    normaliseAttrs(g);
    place(g, { y: h * (1 - casing), ry: Math.PI * 0.25 });
    place(g, { y: ch * 0.5 });
    out.push(g);
  }
  return boxProjectUVs(mergeAll(out), UV_PER_M * 0.25);
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
