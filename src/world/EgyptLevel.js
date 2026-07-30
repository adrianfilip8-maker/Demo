import * as THREE from 'three';
import * as K from './Kit.js';

/**
 * EgyptLevel — the Temple of Ra, laid out to the AGENTS.md §8.1 coordinate contract.
 *
 * ============================ THE TRAVERSAL ROUTE ============================
 * A complete spawn -> sarcophagus line using nothing but the §6 moveset. MOVEMENT and
 * COLLISION should be able to walk this on paper and then in the game.
 *
 *  0. SPAWN (0, 0, 30) on courtyard paving, facing -Z. The entry pylon is behind; the
 *     obelisk terrace, kiosk, colossi and the hall front are all in view. Everything
 *     visible from here is climbable.
 *  1. WALK north to the terrace south stair at (0, 0, 19.6). Climb: paving 0 -> stage 1
 *     (y 2.0) -> stage 2 (y 5.2). Both `ground`.
 *  2. DOUBLE JUMP (2.5 + 1.9 = 4.4 m > 3.8 m) from stage 2 onto the obelisk kiosk lintel
 *     ring, top y = 9.0 — the `ledge` Sly perches on in the `hero` shot at (2.2, 9, 8.4).
 *     Alternative: POLE CLIMB the obelisk (0, ·, 11) all 22 m and SPIRE LAND on its
 *     pyramidion tip at y = 22, then drop to the kiosk.
 *  3. CANE HOOK the ring at (4.2, 14.8, 4.5) — 5.8 m above the lintel, inside jump+hook
 *     reach — and SWING the chain north-west: rings at y 14.8 -> 13.2 across z 4.5 -> -13.
 *     Release onto the hall front cornice ledge at (-9.5, 13.6, -15.2).
 *  4. WALK the hall front cornice west to the west aisle roof (y 13.5), or drop through the
 *     hall's great south doorway (x ±4, y 0..9) to the hypostyle floor.
 *  5. INSIDE THE HALL: pole climb any of the 12 papyrus columns; the aisle architrave
 *     circuit (y 13.5) and the interior tiptoe cornice (y 10.0) ring the whole room. The
 *     taut cable at y 12.6 crosses the nave diagonally as a `rail`.
 *  6. NORTH END: walk out of the hall through the inner pylon gate (x ±3, y 0..7.6) at
 *     z -52 onto the descent landing (0, 0, -57).
 *  7. TOMB DESCENT: flight A drops west 0 -> -5.6, landing, flight B drops east -5.6 -> -12,
 *     arriving on the vault floor at (0.4, -12, -57.6). Both flights `ground`, cheek
 *     balustrades `rail`.
 *  8. Through the vault gate doorway at (0, -12, -59.2) into the pillared crypt and north
 *     to the SARCOPHAGUS at (0, -12, -72).
 *
 *  ALTERNATE (stealth): from the hall's north-west corner, CRAWL the `vent` at
 *  (-21, 0, -49.5). It slopes down to y -3.1, turns east, and opens onto the vault's west
 *  shelf at (-14, -3.2, -63). Shelves at y -3.2 / -6.4 / -9.4 ledge-drop to the floor,
 *  bypassing the stair entirely.
 *
 *  ROOFTOP RUN (the §8.6 payoff line, west -> east across the whole complex):
 *    east entry pylon top (14, 26.6, 34)  ->  RAIL 'pylon-drop' down to the east peristyle
 *    architrave (22.6, 9.2, 27)  ->  RAIL WALK / tiptoe the y = 9.0 ledge ring north to
 *    (23, 9, -13)  ->  WALL RUN the hall's south-east return and ledge-climb to the east
 *    aisle roof (y 13.5)  ->  run north to z -50  ->  SPIRE LAND the east pinnacle tip
 *    (16, 21, -50)  ->  double jump to the nave deck (y 17, rails at x ±11.4)  ->  north to
 *    the inner pylon, WALL RUN its battered south face  ->  SPIRE LAND (6, 27, -50)  ->
 *    the y 26 south stage  ->  wall jump to the pylon summit deck (y 34): the highest point
 *    in the level, whole complex and both pyramids in frame.
 *
 *  RAIL ENTRY (§8.1 "first rail slide down into the complex"): rail 'approach' runs from the
 *  ridge anchor mast (10, 15.4, 61) down to the courtyard paving at (2.2, 1.1, 23).
 * =============================================================================
 */

/* ---- the §8.1 numbers, in one place so they can be checked against the table ---- */
export const L = {
  court:   { x0: -26, x1: 26, z0: -16, z1: 34, y: 0 },
  obelisk: { x: 0, z: 11, base: 2.6, h: 22 },
  terrace: { s1: { x: 9.4, z0: 2.6, z1: 19.4, y: 2.0 }, s2: { x: 6.6, z0: 5.4, z1: 16.6, y: 5.2 } },
  kiosk:   { x: 3.4, z0: 7.4, z1: 14.6, top: 9.0 },
  colossi: { x: 9.5, z: 25, plinth: 2.0, knee: 4.5, h: 13 },
  pylon:   { x: 14, z: 34, w: 11, d: 6, h: 26 },
  peri:    { x: 23, z0: -14, z1: 32, ledge: 9.0 },
  hall:    { x0: -24, x1: 24, z0: -52, z1: -16, nave: 8.8, aisleRoof: 13.5, naveRoof: 17.0 },
  clere:   { y: 15.5, w: 2.8, h: 1.3, zs: [-20, -28, -36, -44] },
  inner:   { x: 0, z: -52, w: 22, d: 7, h: 34, stage: 26 },
  tomb:    { x0: -14, x1: 14, z0: -78, z1: -56, floor: -12, ceil: -2, sarc: [0, -12, -72] },
  pyr1:    { x: -150, z: -190, base: 148, h: 105 },
  pyr2:    { x: 95, z: -250, base: 104, h: 72 },
};

const D = THREE.MathUtils.degToRad;

/* ============================ small helpers ============================ */

function box(A, zone, mat, w, h, d, x, y, z, o = {}) {
  const g = K.block(w, h, d, { rng: A.rng, jitter: o.jitter ?? 0.018, chip: o.chip ?? 0, taper: o.taper ?? 0 });
  K.place(g, { x, y, z, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0 });
  A.add(zone, mat, K.boxProjectUVs(g));
  return g;
}

/** Axis-aligned volume from extents — reads closer to the §8.1 table than w/h/d does. */
function vol(A, zone, mat, x0, x1, y0, y1, z0, z1, o = {}) {
  return box(A, zone, mat, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
}

function groundProxy(A, x0, x1, y, z0, z1, opts = {}) {
  const t = opts.thick ?? 1.0;
  A.proxy(new THREE.BoxGeometry(x1 - x0, t, z1 - z0),
    { tag: 'ground', material: opts.material || 'stone', ...opts },
    { x: (x0 + x1) / 2, y: y - t / 2, z: (z0 + z1) / 2 });
}

function ledgeProxy(A, x0, x1, y, z0, z1, opts = {}) {
  const t = opts.thick ?? 0.5;
  A.proxy(new THREE.BoxGeometry(Math.max(0.3, x1 - x0), t, Math.max(0.3, z1 - z0)),
    { tag: 'ledge', material: 'stone', climbable: true, ...opts },
    { x: (x0 + x1) / 2, y: y - t / 2, z: (z0 + z1) / 2 });
}

function wallProxy(A, x0, x1, y0, y1, z0, z1, opts = {}) {
  A.proxy(new THREE.BoxGeometry(Math.max(0.25, x1 - x0), y1 - y0, Math.max(0.25, z1 - z0)),
    { tag: 'wall', material: 'stone', climbable: true, ...opts },
    { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 });
}

function poleProxy(A, x, z, y0, y1, r, opts = {}) {
  const m = A.proxy(new THREE.CylinderGeometry(r, r, y1 - y0, 8, 1),
    { tag: 'pole', material: 'stone', climbable: true, ...opts },
    { x, y: (y0 + y1) / 2, z });
  m.userData.axis = new THREE.Vector3(0, 1, 0);
  m.userData.top = y1; m.userData.bottom = y0;
  A.api.poles.push({ pos: new THREE.Vector3(x, y0, z), top: y1, r });
  return m;
}

function spirePoint(A, x, y, z) {
  const p = new THREE.Vector3(x, y, z);
  const m = A.proxy(new THREE.ConeGeometry(0.5, 1.2, 5),
    { tag: 'spire', material: 'stone' }, { x, y: y - 0.6, z });
  m.userData.point = p.clone();
  A.api.spires.push(p);
  return m;
}

function hookPoint(A, x, y, z) {
  const p = new THREE.Vector3(x, y, z);
  const m = A.proxy(new THREE.SphereGeometry(0.55, 8, 6), { tag: 'hook', material: 'metal' }, { x, y, z });
  m.userData.point = p.clone();
  A.api.hooks.push(p);
  return m;
}

/** Build a rail: visible tube + a `rail` collider carrying the spline MOVEMENT snaps to. */
function rail(A, name, pts, matKey = 'granite_pink', r = 0.16, zone = 'court') {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.35);
  const geo = K.railGeo(curve, { r, seg: Math.max(24, Math.round(curve.getLength() * 1.4)), rad: 6 });
  const mesh = A.mesh(matKey, geo, `rail:${name}`);
  if (mesh) {
    mesh.userData.spline = curve;
    A.collide(mesh, { tag: 'rail', material: matKey === 'rope_fibre' ? 'cloth' : 'metal' });
  }
  A.api.rails.push({ name, curve });
  return curve;
}

/* ============================ courtyard ================================ */

function courtyard(A) {
  const c = L.court, R = A.rng;

  /* Paving: individual slabs, instanced. A textured plane here would sink the whole shot. */
  const holes = [
    [-9.8, 9.8, 2.2, 19.8],                       // obelisk terrace
    [-13.6, -5.4, 21.4, 28.6], [5.4, 13.6, 21.4, 28.6],   // colossi plinths
    [-20, -8, 30.6, 34], [8, 20, 30.6, 34],       // entry pylon feet
  ];
  const slabs = K.pavingMatrices({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y: 0, slab: 2.45, rng: R, sink: 0.055, holes });
  A.instance('paving_courtyard', K.slabUnit(0.55, R), slabs, 'paving:court');
  groundProxy(A, c.x0, c.x1, 0, c.z0, c.z1, { material: 'stone' });

  /* Stylobate apron so the complex is planted rather than floating on TERRAIN's sand. */
  for (const [x0, x1, z0, z1] of [[c.x0 - 1.4, c.x1 + 1.4, c.z1, c.z1 + 1.4], [c.x0 - 1.4, c.x0, c.z0, c.z1 + 1.4], [c.x1, c.x1 + 1.4, c.z0, c.z1 + 1.4]]) {
    vol(A, 'court', 'sandstone_worn', x0, x1, -1.5, 0.02, z0, z1, { jitter: 0.03 });
  }

  /* ---- Obelisk terrace: two stages, so the courtyard has vertical mass in its middle.
     Stage 2's top is where the `night` shot puts Sly at (-4, 5.2, 12.5). ---- */
  const t1 = L.terrace.s1, t2 = L.terrace.s2;
  A.add('court', 'sandstone_block', K.place(K.masonryShell({
    w: t1.x * 2, d: t1.z1 - t1.z0, h: t1.y, batter: 0.05, course: 0.62, thick: 1.0, rng: R,
    blockLen: [1.3, 2.3], recess: 0.06, chipChance: 0.22, gapChance: 0.02, buried: 0.35, hollow: true,
    openings: [{ face: 0, a0: -3.2, a1: 3.2, y0: -1, y1: 3 }],
  }), { z: (t1.z0 + t1.z1) / 2 }));
  vol(A, 'court', 'paving_courtyard', -t1.x, t1.x, t1.y - 0.5, t1.y, t1.z0, t1.z1, { jitter: 0.02 });
  groundProxy(A, -t1.x, t1.x, t1.y, t1.z0, t1.z1);
  ledgeProxy(A, -t1.x, t1.x, t1.y, t1.z0, t1.z0 + 0.9);

  A.add('court', 'sandstone_block', K.place(K.masonryShell({
    w: t2.x * 2, d: t2.z1 - t2.z0, h: t2.y - t1.y + 0.4, batter: 0.06, course: 0.6, thick: 0.95, rng: R,
    blockLen: [1.2, 2.1], recess: 0.06, chipChance: 0.2, gapChance: 0.02, hollow: true,
    openings: [{ face: 0, a0: -2.8, a1: 2.8, y0: -1, y1: 4 }],
  }), { y: t1.y - 0.4, z: (t2.z0 + t2.z1) / 2 }));
  vol(A, 'court', 'paving_courtyard', -t2.x, t2.x, t2.y - 0.45, t2.y, t2.z0, t2.z1, { jitter: 0.02 });
  groundProxy(A, -t2.x, t2.x, t2.y, t2.z0, t2.z1);
  ledgeProxy(A, -t2.x, t2.x, t2.y, t2.z0, t2.z0 + 0.9);

  /* Stairs up the south face of each stage — the readable way in. */
  const st1 = K.stairFlight({ steps: 4, rise: 0.5, run: 0.75, width: 6.4, rng: R });
  A.add('court', 'sandstone_worn', K.place(st1, { x: 0, y: 0, z: t1.z1 + 3.0, ry: -Math.PI / 2 }));
  groundProxy(A, -3.2, 3.2, 2.05, t1.z1, t1.z1 + 3.1, { thick: 3.4, slope: true });
  const st2 = K.stairFlight({ steps: 7, rise: 0.46, run: 0.7, width: 5.2, rng: R });
  A.add('court', 'sandstone_worn', K.place(st2, { x: 0, y: t1.y, z: t2.z1 + 2.6, ry: -Math.PI / 2 }));
  groundProxy(A, -2.6, 2.6, 5.25, t2.z1, t2.z1 + 2.7, { thick: 3.6 });

  /* ---- Obelisk: 22 m, `pole` for its full height per §8.1. ---- */
  const ob = L.obelisk;
  vol(A, 'court', 'granite_pink', -2.5, 2.5, t2.y - 0.1, t2.y + 1.1, ob.z - 2.5, ob.z + 2.5, { jitter: 0.02, chip: 0.12 });
  const obGeo = K.obelisk({ h: ob.h - (t2.y + 1.1), base: ob.base, rng: R });
  A.add('court', 'granite_pink', K.place(obGeo, { x: ob.x, y: t2.y + 1.1, z: ob.z, ry: D(1.1) }));
  poleProxy(A, ob.x, ob.z, t2.y + 1.1, ob.h - 1.6, 1.5);
  ledgeProxy(A, -2.5, 2.5, t2.y + 1.1, ob.z - 2.5, ob.z + 2.5);
  spirePoint(A, ob.x, ob.h, ob.z);       // pyramidion tip: a Ninja Spire Landing target

  /* ---- Barque kiosk around the obelisk. Its lintel ring at y 9.0 is the `hero` perch. ---- */
  const ki = L.kiosk;
  for (const sx of [-1, 1]) for (const pz of [ki.z0, ki.z1]) {
    const px = sx * ki.x;
    A.add('court', 'limestone_polished', K.place(K.masonryShell({
      w: 1.7, d: 1.7, h: ki.top - 1.25 - t2.y, batter: 0.035, course: 0.58, thick: 0.85, rng: R,
      blockLen: [1.0, 1.7], recess: 0.05, chipChance: 0.16, gapChance: 0, hollow: false,
    }), { x: px, y: t2.y, z: pz, ry: D(R.jitter(0.5)) }));
    wallProxy(A, px - 0.9, px + 0.9, t2.y, ki.top - 1.25, pz - 0.9, pz + 0.9);
  }
  /* Lintels: 1.25 m deep, chunky, and the south one is cracked. */
  for (const [len, ry, px, pz, crack] of [
    [ki.x * 2 + 2.2, 0, 0, ki.z0, 0], [ki.x * 2 + 2.2, 0, 0, ki.z1, 0.05],
    [ki.z1 - ki.z0, Math.PI / 2, -ki.x, (ki.z0 + ki.z1) / 2, 0], [ki.z1 - ki.z0, Math.PI / 2, ki.x, (ki.z0 + ki.z1) / 2, 0],
  ]) {
    const g = K.beam(len, 1.25, 1.5, { rng: R, pieces: Math.max(2, Math.round(len / 2.4)), crack, chip: 0.14 });
    A.add('court', 'hieroglyph_gilded', K.place(g, { x: px, y: ki.top - 0.625, z: pz, ry }));
  }
  for (const pz of [ki.z0, ki.z1]) ledgeProxy(A, -ki.x - 1.1, ki.x + 1.1, ki.top, pz - 0.75, pz + 0.75, { thick: 1.25 });
  for (const sx of [-1, 1]) ledgeProxy(A, sx * ki.x - 0.75, sx * ki.x + 0.75, ki.top, ki.z0, ki.z1, { thick: 1.25 });

  /* ---- Colossi: plinths + thrones are architecture; the seated figures are PROPS. ---- */
  for (const sx of [-1, 1]) {
    const cx = sx * L.colossi.x, cz = L.colossi.z;
    A.add('court', 'sandstone_block', K.place(K.masonryShell({
      w: 8.0, d: 7.0, h: L.colossi.plinth, batter: 0.04, course: 0.65, thick: 1.0, rng: R,
      blockLen: [1.5, 2.6], recess: 0.07, chipChance: 0.24, gapChance: 0.02, buried: 0.4, hollow: false,
    }), { x: cx, y: 0, z: cz }));
    groundProxy(A, cx - 4, cx + 4, L.colossi.plinth, cz - 3.5, cz + 3.5);
    /* Throne: seat block to the knee ledge at 4.5, then the high back slab. */
    vol(A, 'court', 'sandstone_block', cx - 3.4, cx + 3.4, L.colossi.plinth, L.colossi.knee, cz - 3.0, cz + 2.6, { jitter: 0.03, chip: 0.18 });
    ledgeProxy(A, cx - 3.4, cx + 3.4, L.colossi.knee, cz + 1.4, cz + 2.6, { thick: 0.9 });   // the knees
    vol(A, 'court', 'hieroglyph_wall', cx - 3.2, cx + 3.2, L.colossi.knee, 9.6, cz - 3.0, cz - 1.2, { jitter: 0.035 });
    wallProxy(A, cx - 3.2, cx + 3.2, L.colossi.knee, 9.6, cz - 3.0, cz - 1.2);
    ledgeProxy(A, cx - 3.2, cx + 3.2, 9.6, cz - 3.0, cz - 1.2, { thick: 0.7 });
    /* Sand banked against the north face — the wind comes down the valley. */
    A.add('court', 'sandstone_worn', K.place(K.sandDrift({ len: 7.4, h: 1.35, depth: 3.4, rng: R }), { x: cx, z: cz - 3.0, ry: Math.PI }));
  }

  /* ---- Peristyle colonnade: the §8.1 architrave ledge ring at y = 9.0, x = ±23. ---- */
  const pe = L.peri;
  const pierZ = [];
  for (let z = pe.z0 + 1; z <= pe.z1 - 1; z += 5.5) pierZ.push(z);
  for (const sx of [-1, 1]) {
    for (const pz of pierZ) {
      A.add('court', 'sandstone_block', K.place(K.masonryShell({
        w: 2.1, d: 1.9, h: 7.7, batter: 0.03, course: 0.64, thick: 0.85, rng: R,
        blockLen: [1.1, 1.9], recess: 0.06, chipChance: 0.2, gapChance: 0.03, buried: 0.3, hollow: false,
      }), { x: sx * pe.x, y: 0, z: pz, ry: D(R.jitter(0.45)) }));
      wallProxy(A, sx * pe.x - 1.05, sx * pe.x + 1.05, 0, 7.7, pz - 0.95, pz + 0.95);
    }
    /* Architrave: top face exactly y = 9.0, 1.6 m deep — obviously grabbable. */
    const g = K.beam(pe.z1 - pe.z0 + 2.2, 1.3, A.TUNE.ledgeDepth, { rng: R, pieces: 12, chip: 0.16 });
    A.add('court', 'hieroglyph_wall', K.place(g, { x: sx * pe.x, y: pe.ledge - 0.65, z: (pe.z0 + pe.z1) / 2, ry: Math.PI / 2 }));
    ledgeProxy(A, sx * pe.x - 0.8, sx * pe.x + 0.8, pe.ledge, pe.z0 - 1.1, pe.z1 + 1.1, { thick: 1.3 });
    /* Torus roll along the outer face — reads the cornice motif at colonnade scale. */
    const roll = new THREE.CylinderGeometry(0.3, 0.3, pe.z1 - pe.z0 + 2.2, 8, 1);
    K.normaliseAttrs(roll);
    A.add('court', 'sandstone_worn', K.boxProjectUVs(K.place(roll, { x: sx * (pe.x + 0.82), y: pe.ledge - 1.15, z: (pe.z0 + pe.z1) / 2, rx: Math.PI / 2 })));

    /* Temenos wall behind the colonnade: mudbrick, buried, wall-runnable, top a ledge. */
    A.add('court', 'mudbrick', K.place(K.masonryShell({
      w: 1.5, d: pe.z1 - pe.z0 + 3.0, h: 5.6, batter: 0.075, course: 0.5, thick: 0.7, rng: R,
      blockLen: [0.85, 1.4], recess: 0.05, chipChance: 0.26, gapChance: 0.06, buried: 0.6, hollow: true,
    }), { x: sx * (pe.x + 2.3), y: 0, z: (pe.z0 + pe.z1) / 2 - 0.5 }));
    wallProxy(A, sx * (pe.x + 2.3) - 0.8, sx * (pe.x + 2.3) + 0.8, 0, 5.6, pe.z0 - 1.5, pe.z1 + 1.5);
    ledgeProxy(A, sx * (pe.x + 2.3) - 0.7, sx * (pe.x + 2.3) + 0.7, 5.6, pe.z0 - 1.5, pe.z1 + 1.5);
  }
  /* Short south returns — enclosure without blocking the entry axis. */
  for (const sx of [-1, 1]) {
    for (const px of [sx * 18.5]) {
      A.add('court', 'sandstone_block', K.place(K.masonryShell({
        w: 2.1, d: 1.9, h: 7.7, batter: 0.03, course: 0.64, thick: 0.85, rng: R, hollow: false,
        blockLen: [1.1, 1.9], recess: 0.06, chipChance: 0.2, gapChance: 0.03, buried: 0.3,
      }), { x: px, y: 0, z: 31.5 }));
      wallProxy(A, px - 1.05, px + 1.05, 0, 7.7, 30.5, 32.5);
    }
    const g = K.beam(pe.x - 17.4, 1.3, A.TUNE.ledgeDepth, { rng: R, pieces: 3, chip: 0.14 });
    A.add('court', 'hieroglyph_wall', K.place(g, { x: sx * 20.7, y: pe.ledge - 0.65, z: 31.5 }));
    ledgeProxy(A, sx * 17.4, sx * pe.x, pe.ledge, 30.7, 32.3, { thick: 1.3 });
  }
}

/* ========================== entry pylons =============================== */

function entryPylons(A) {
  const p = L.pylon, R = A.rng, B = A.TUNE.batterPylon;

  for (const sx of [-1, 1]) {
    const cx = sx * p.x;
    A.add('court', 'hieroglyph_wall', K.place(K.masonryShell({
      w: p.w, d: p.d, h: p.h, batter: B, course: A.TUNE.courseHeight, thick: 1.05, rng: R,
      blockLen: [1.4, 2.5], recess: A.TUNE.mortarRecess, chipChance: A.TUNE.chipChance,
      gapChance: A.TUNE.fallenBlockChance, buried: 0.55, hollow: true,
      /* Flagstaff niches: the four vertical grooves down the south face. */
      openings: [
        { face: 0, a0: -3.9, a1: -2.9, y0: 1.2, y1: 22 },
        { face: 0, a0: 2.9, a1: 3.9, y0: 1.2, y1: 22 },
        { face: 1, a0: -1.6, a1: 1.6, y0: -1, y1: 4.2 },   // service door on the north face
      ],
    }), { x: cx, y: 0, z: p.z }));
    A.add('court', 'sandstone_worn', K.place(
      K.cornerRolls({ w: p.w, d: p.d, h: p.h - 1.0, r: A.TUNE.rollRadius, batter: B, rng: R }),
      { x: cx, y: 0, z: p.z }));

    /* Cavetto + torus cornice. This silhouette IS Egyptian architecture. */
    const inset = B * (p.h - 0.4);
    const cw = p.w - 2 * inset, cd = p.d - 2 * inset;
    const cor = K.cornice({ w: cw, d: cd, h: A.TUNE.corniceHeight, flare: A.TUNE.corniceFlare, roll: A.TUNE.rollRadius });
    A.add('court', 'hieroglyph_gilded', K.place(cor.geo, { x: cx, y: p.h - 0.4, z: p.z }));
    /* Roof deck on top of the cornice. */
    vol(A, 'court', 'paving_courtyard', cx - cw / 2, cx + cw / 2, p.h - 0.4 + cor.height - 0.35, p.h - 0.4 + cor.height,
      p.z - cd / 2, p.z + cd / 2, { jitter: 0.02 });
    const deckY = p.h - 0.4 + cor.height;
    groundProxy(A, cx - cw / 2, cx + cw / 2, deckY, p.z - cd / 2, p.z + cd / 2);
    ledgeProxy(A, cx - cw / 2 - A.TUNE.corniceFlare, cx + cw / 2 + A.TUNE.corniceFlare, deckY - 0.36, p.z - cd / 2 - 1.4, p.z - cd / 2 - 0.2);

    /* Battered wall-run faces. atan(0.105) = 6.0 deg off vertical -> 84 deg slope, still `wall`. */
    A.proxy(K.proxyBattered(p.w, p.d, p.h - 0.4, B, A._proxyMat()),
      { tag: 'wall', material: 'stone', climbable: true, batter: B }, { x: cx, y: 0, z: p.z });

    /* Sand drift on the north (leeward) face. */
    A.add('court', 'sandstone_worn', K.place(K.sandDrift({ len: p.w * 0.95, h: A.TUNE.sandHeight, depth: 4.2, rng: R }),
      { x: cx, z: p.z - p.d / 2, ry: Math.PI }));
  }

  /* Great gate lintel bridging the towers: the frame you see the obelisk through. */
  const span = 2 * (p.x - p.w / 2) + 1.6;
  const lint = K.beam(span, 2.6, 5.4, { rng: R, pieces: 7, crack: 0.06, chip: 0.2 });
  A.add('court', 'hieroglyph_gilded', K.place(lint, { x: 0, y: 14.3, z: p.z - 0.2 }));
  ledgeProxy(A, -span / 2, span / 2, 15.6, p.z - 2.9, p.z + 2.5, { thick: 2.6 });
  const gcor = K.cornice({ w: span, d: 5.6, h: 1.5, flare: 0.95, roll: 0.34 });
  A.add('court', 'sandstone_block', K.place(gcor.geo, { x: 0, y: 15.6, z: p.z - 0.2 }));
  ledgeProxy(A, -span / 2, span / 2, 15.6 + gcor.height, p.z - 3.2, p.z + 2.8, { thick: 0.5 });
  /* Underside of the gate reads as a dark ceiling in the `dunes` shot. */
  vol(A, 'court', 'ceiling_stars', -span / 2 + 0.4, span / 2 - 0.4, 14.0, 14.32, p.z - 2.6, p.z + 2.6);
}

/* ===================== hooks, cables, entry rail ======================= */

function courtyardTraversal(A) {
  const R = A.rng;

  /* Masts to hang the hook cable from — a cable needs an anchor to be believable. */
  for (const [mx, my, mz] of [[20.6, 15.9, 27.5], [-13.4, 13.9, -15.0]]) {
    const g = new THREE.CylinderGeometry(0.26, 0.42, my - (mz > 0 ? L.peri.ledge : 13.5), 8, 1);
    K.normaliseAttrs(g);
    const y0 = mz > 0 ? L.peri.ledge : 13.5;
    A.add('court', 'bronze_dark', K.boxProjectUVs(K.place(g, { x: mx, y: (y0 + my) / 2, z: mz, rz: D(R.jitter(0.7)) })));
    poleProxy(A, mx, mz, y0, my, 0.4, { material: 'metal' });
  }

  /* ---- Main hook chain: z 27 -> -13, y 14.8 -> 13.2, swingable end to end. ---- */
  const hookLine = [
    [20.0, 14.9, 27.0], [14.0, 14.9, 20.0], [8.5, 14.9, 12.0],
    [4.2, 14.8, 4.5], [1.0, 14.5, -3.0], [-4.0, 13.9, -8.5], [-9.5, 13.2, -13.0],
  ];
  const cable = new THREE.CatmullRomCurve3(
    [[20.6, 15.75, 27.5], ...hookLine.map(([x, y, z]) => [x, y + 0.85, z]), [-13.4, 13.85, -15.0]]
      .map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.4);
  A.mesh('rope_fibre', K.railGeo(cable, { r: 0.075, seg: 90, rad: 5 }), 'cable:hooks');

  const ringGeo = K.hookRing({ r: 0.62, tube: 0.115, rng: R });
  const mats = [];
  for (const [x, y, z] of hookLine) {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(D(R.jitter(2.5)), D(R.jitter(30)), D(R.jitter(2.5)), 'YXZ')), new THREE.Vector3(1, 1, 1));
    mats.push(m);
    hookPoint(A, x, y, z);
    A.add('court', 'bronze_dark', K.place(K.chain({ len: 0.9, r: 0.06, links: 4 }), { x, y: y + 1.65, z }));
  }

  /* ---- Second, lower chain: west colonnade -> obelisk kiosk. Gives the swing a return. ---- */
  const low = [[-16.5, 11.6, 24.0], [-11.0, 11.7, 19.0], [-6.0, 11.8, 14.0], [-1.5, 11.9, 9.5]];
  const cable2 = new THREE.CatmullRomCurve3(
    [[-21.0, 12.9, 26.0], ...low.map(([x, y, z]) => [x, y + 0.85, z]), [2.2, 11.6, 7.0]]
      .map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.4);
  A.mesh('rope_fibre', K.railGeo(cable2, { r: 0.07, seg: 60, rad: 5 }), 'cable:hooks2');
  for (const [x, y, z] of low) {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(D(R.jitter(2)), D(R.jitter(25)), D(R.jitter(2)), 'YXZ')), new THREE.Vector3(0.94, 0.94, 0.94));
    mats.push(m);
    hookPoint(A, x, y, z);
    A.add('court', 'bronze_dark', K.place(K.chain({ len: 0.85, r: 0.055, links: 4 }), { x, y: y + 1.6, z }));
  }
  A.instance('gold_leaf', ringGeo, mats, 'hooks:rings');

  /* ---- The approach rail: §8.1's "first rail slide down into the complex". ---- */
  A.add('court', 'sandstone_block', K.place(K.masonryShell({
    w: 3.4, d: 3.4, h: 9.0, batter: 0.08, course: 0.6, thick: 0.9, rng: R, hollow: false,
    blockLen: [1.1, 1.8], recess: 0.06, chipChance: 0.22, gapChance: 0.03, buried: 1.2,
  }), { x: 10, y: 0, z: 61 }));
  wallProxy(A, 8.3, 11.7, 0, 9, 59.3, 62.7);
  ledgeProxy(A, 8.3, 11.7, 9.0, 59.3, 62.7);
  const mast = new THREE.CylinderGeometry(0.24, 0.4, 6.6, 8, 1);
  K.normaliseAttrs(mast);
  A.add('court', 'bronze_dark', K.boxProjectUVs(K.place(mast, { x: 10, y: 12.3, z: 61 })));
  rail(A, 'approach', [
    [10.0, 15.3, 61.0], [8.6, 12.0, 51.0], [7.0, 7.6, 42.0],
    [5.2, 3.9, 34.5], [3.4, 1.7, 28.0], [2.2, 1.15, 23.0],
  ], 'bronze_dark', 0.13);

  /* Rooftop-run entry: east pylon deck down to the peristyle architrave. */
  rail(A, 'pylon-drop', [[13.6, 26.3, 32.0], [15.6, 22.0, 31.0], [19.0, 15.0, 29.4], [21.8, 10.2, 28.2], [22.6, 9.25, 26.0]], 'bronze_dark', 0.13);
}

/* ========================= hypostyle hall ============================== */

function hypostyleHall(A) {
  const h = L.hall, R = A.rng, B = A.TUNE.batterHall;
  const WALL_H = 13.0, DECK = h.aisleRoof, NAVE = h.naveRoof, CL = 11.4;
  const zc = (h.z0 + h.z1) / 2;

  /* ---- Floor: worn slabs, holes where the columns land. ---- */
  const holes = [];
  const naveZ = [-22, -30, -38, -46], aisleZ = [-26, -38];
  for (const cz of naveZ) for (const sx of [-1, 1]) holes.push([sx * 8 - 2.5, sx * 8 + 2.5, cz - 2.5, cz + 2.5]);
  for (const cz of aisleZ) for (const sx of [-1, 1]) holes.push([sx * 16.5 - 2.3, sx * 16.5 + 2.3, cz - 2.3, cz + 2.3]);
  A.instance('paving_courtyard', K.slabUnit(0.5, R),
    K.pavingMatrices({ x0: -23, x1: 23, z0: -51, z1: -17, y: 0, slab: 2.3, rng: R, sink: 0.045, holes }), 'paving:hall');
  groundProxy(A, -23, 23, 0, -51.2, -16.8);

  /* ---- Outer walls. Battered, buried at the base, hieroglyph-faced. ---- */
  const winZ = [-21, -27, -33, -39, -45];
  const sideOpen = [];
  for (const wz of winZ) {
    for (const f of [2, 3]) sideOpen.push({ face: f, a0: wz - zc - 0.95, a1: wz - zc + 0.95, y0: 10.3, y1: 12.6 });
  }
  for (const sx of [-1, 1]) {
    A.add('hall', 'hieroglyph_wall', K.place(K.masonryShell({
      w: 2.1, d: h.z1 - h.z0, h: WALL_H, batter: B, course: 0.74, thick: 1.05, rng: R,
      blockLen: [1.7, 2.7], recess: A.TUNE.mortarRecess, chipChance: A.TUNE.chipChance,
      gapChance: 0.035, buried: 0.6, hollow: true, openings: sideOpen,
    }), { x: sx * 23.9, y: 0, z: zc }));
    wallProxy(A, sx * 23.9 - 1.1, sx * 23.9 + 1.1, 0, WALL_H, h.z0, h.z1);
    /* Window sills, inside and out — narrow `ledge` perches lining the hall. */
    for (const wz of winZ) {
      ledgeProxy(A, sx * 23.9 - 1.2, sx * 23.9 + 1.2, 10.3, wz - 1.0, wz + 1.0, { thick: 0.4 });
      const g = K.beam(2.2, 0.42, 2.8, { rng: R, pieces: 2, chip: 0.1 });
      A.add('hall', 'limestone_polished', K.place(g, { x: sx * 23.9, y: 12.75, z: wz, ry: Math.PI / 2 }));
    }
    A.add('hall', 'sandstone_worn', K.place(K.sandDrift({ len: 30, h: 1.5, depth: 3.6, seg: 22, rng: R }),
      { x: sx * 25.1, z: zc, ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2 }));
  }
  /* South facade: the great doorway (x ±4.2, 0..9.2) plus two side doors. */
  const sOpen = [];
  for (const f of [0, 1]) {
    sOpen.push({ face: f, a0: -4.4, a1: 4.4, y0: -1, y1: 9.4 });
    sOpen.push({ face: f, a0: -17.6, a1: -14.4, y0: -1, y1: 4.8 });
    sOpen.push({ face: f, a0: 14.4, a1: 17.6, y0: -1, y1: 4.8 });
  }
  A.add('hall', 'hieroglyph_wall', K.place(K.masonryShell({
    w: 48, d: 2.1, h: WALL_H, batter: B, course: 0.74, thick: 1.05, rng: R,
    blockLen: [1.7, 2.7], recess: A.TUNE.mortarRecess, chipChance: A.TUNE.chipChance,
    gapChance: 0.03, buried: 0.5, hollow: true, openings: sOpen,
  }), { x: 0, y: 0, z: h.z1 - 1.05 }));
  for (const [x0, x1] of [[-24, -17.6], [-14.4, -4.4], [4.4, 14.4], [17.6, 24]]) wallProxy(A, x0, x1, 0, WALL_H, h.z1 - 2.1, h.z1);
  for (const [x0, x1, y] of [[-4.4, 4.4, 9.4], [-17.6, -14.4, 4.8], [14.4, 17.6, 4.8]]) wallProxy(A, x0, x1, y, WALL_H, h.z1 - 2.1, h.z1);
  /* Great doorway lintel + its own cornice: the landing pad at the end of the hook chain. */
  A.add('hall', 'hieroglyph_gilded', K.place(K.beam(10.4, 1.5, 3.4, { rng: R, pieces: 4, crack: 0.045, chip: 0.18 }), { x: 0, y: 10.15, z: h.z1 - 0.9 }));
  const dcor = K.cornice({ w: 11.2, d: 3.9, h: 0.86, flare: 0.86, roll: 0.3 });
  A.add('hall', 'sandstone_block', K.place(dcor.geo, { x: 0, y: 10.9, z: h.z1 - 0.9 }));
  ledgeProxy(A, -6.4, 6.4, 10.9 + dcor.height, h.z1 - 3.2, h.z1 + 1.2, { thick: 0.6 });
  A.api.doorways.push({ center: new THREE.Vector3(0, 4.7, h.z1 - 1), w: 8.8, h: 9.4 });

  /* North wall, split by the inner pylon gate. */
  A.add('hall', 'hieroglyph_wall', K.place(K.masonryShell({
    w: 48, d: 2.1, h: WALL_H, batter: B, course: 0.74, thick: 1.05, rng: R,
    blockLen: [1.7, 2.7], recess: A.TUNE.mortarRecess, chipChance: 0.16, gapChance: 0.03, buried: 0.4, hollow: true,
    openings: [0, 1].flatMap((f) => [{ face: f, a0: -3.4, a1: 3.4, y0: -1, y1: 8.2 }]),
  }), { x: 0, y: 0, z: h.z0 + 1.05 }));
  for (const [x0, x1] of [[-24, -3.4], [3.4, 24]]) wallProxy(A, x0, x1, 0, WALL_H, h.z0, h.z0 + 2.1);
  wallProxy(A, -3.4, 3.4, 8.2, WALL_H, h.z0, h.z0 + 2.1);

  /* ---- 12 papyrus columns: 8 tall in the nave rows, 4 shorter in the aisles. ---- */
  const colProxies = [];
  for (const cz of naveZ) for (const sx of [-1, 1]) {
    const cx = sx * 8;
    const col = K.papyrusColumn({ hShaft: 12.3, rBase: 1.9, rTop: 1.4, capH: 2.4, abacus: 0.62, seg: 22, rng: R, bandCount: 5 });
    /* One column in the room leans — the eye needs a break from perfect verticals. */
    const lean = (cz === -38 && sx < 0) ? D(1.25) : D(R.jitter(0.28));
    A.add('hall', 'column_papyrus', K.place(col.geo, { x: cx, y: 0.35, z: cz, rz: lean, ry: D(R.range(0, 45)) }));
    vol(A, 'hall', 'sandstone_block', cx - 2.35, cx + 2.35, 0, 0.42, cz - 2.35, cz + 2.35, { jitter: 0.02, chip: 0.12 });
    poleProxy(A, cx, cz, 0.42, 12.6, 1.62);
    colProxies.push([cx, cz, col.height + 0.35]);
    ledgeProxy(A, cx - 2.3, cx + 2.3, col.height + 0.35, cz - 2.3, cz + 2.3, { thick: 0.62 });   // abacus top
  }
  for (const cz of aisleZ) for (const sx of [-1, 1]) {
    const cx = sx * 16.5;
    const col = K.papyrusColumn({ hShaft: 9.5, rBase: 1.62, rTop: 1.2, capH: 1.9, abacus: 0.55, seg: 20, rng: R, bandCount: 4 });
    A.add('hall', 'column_papyrus', K.place(col.geo, { x: cx, y: 0.34, z: cz, rz: D(R.jitter(0.3)), ry: D(R.range(0, 45)) }));
    vol(A, 'hall', 'sandstone_block', cx - 2.0, cx + 2.0, 0, 0.4, cz - 2.0, cz + 2.0, { jitter: 0.02 });
    poleProxy(A, cx, cz, 0.4, 12.3, 1.38);
    ledgeProxy(A, cx - 1.95, cx + 1.95, col.height + 0.34, cz - 1.95, cz + 1.95, { thick: 0.55 });
  }

  /* ---- Interior tiptoe cornice at y 10.0: the §8.3 ledge circuit round the room. ---- */
  for (const sx of [-1, 1]) {
    const g = K.beam(h.z1 - h.z0 - 3, 0.62, 0.95, { rng: R, pieces: 14, chip: 0.1 });
    A.add('hall', 'limestone_polished', K.place(g, { x: sx * 22.35, y: 9.7, z: zc, ry: Math.PI / 2 }));
    ledgeProxy(A, sx * 22.35 - 0.5, sx * 22.35 + 0.5, 10.01, h.z0 + 2.2, h.z1 - 2.2, { thick: 0.62 });
  }
  for (const [pz, ry] of [[h.z1 - 2.55, 0], [h.z0 + 2.55, 0]]) {
    const g = K.beam(45, 0.62, 0.95, { rng: R, pieces: 18, chip: 0.1 });
    A.add('hall', 'limestone_polished', K.place(g, { x: 0, y: 9.7, z: pz, ry }));
    ledgeProxy(A, -22.4, 22.4, 10.01, pz - 0.5, pz + 0.5, { thick: 0.62 });
  }

  /* ---- Architraves. Nave at 16.2..17.0, aisle at 12.65..13.5. ---- */
  for (const sx of [-1, 1]) {
    const g = K.beam(h.z1 - h.z0 - 2, 0.8, 3.0, { rng: R, pieces: 13, crack: 0.03, chip: 0.16 });
    A.add('hall', 'hieroglyph_gilded', K.place(g, { x: sx * 8, y: 16.6, z: zc, ry: Math.PI / 2 }));
    const a = K.beam(h.z1 - h.z0 - 2, 0.85, 2.6, { rng: R, pieces: 13, chip: 0.14 });
    A.add('hall', 'hieroglyph_wall', K.place(a, { x: sx * 16.5, y: 13.07, z: zc, ry: Math.PI / 2 }));
    const c = K.beam(h.z1 - h.z0 - 2, 0.85, 1.8, { rng: R, pieces: 13, chip: 0.12 });
    A.add('hall', 'hieroglyph_wall', K.place(c, { x: sx * CL, y: 13.07, z: zc, ry: Math.PI / 2 }));
  }
  for (const cz of naveZ) {
    A.add('hall', 'hieroglyph_wall', K.place(K.beam(16.6, 0.8, 2.4, { rng: R, pieces: 5, chip: 0.14 }), { x: 0, y: 16.6, z: cz }));
  }

  /* ---- Aisle roof (deck y 13.5) as individual transverse slabs. ---- */
  for (const sx of [-1, 1]) {
    for (let z = h.z0 + 1.4; z < h.z1 - 1.4; z += 2.55) {
      const len = 23.4 - CL;
      const g = K.block(len, 0.86, 2.42, { rng: R, jitter: 0.02, chip: R.chance(0.12) ? 0.12 : 0 });
      K.place(g, { x: sx * (CL + len / 2), y: 13.06, z: z + 1.27, ry: D(R.jitter(0.3)) });
      A.add('hall', 'sandstone_block', K.boxProjectUVs(g));
    }
    groundProxy(A, sx > 0 ? CL : -23.4, sx > 0 ? 23.4 : -CL, DECK, h.z0 + 1.4, h.z1 - 1.4);
  }

  /* ---- Clerestory band walls with the real §8.1 slots at y 15.5. ---- */
  const clOpen = L.clere.zs.flatMap((cz) => [2, 3].map((f) => ({
    face: f, a0: cz - zc - L.clere.w / 2, a1: cz - zc + L.clere.w / 2,
    y0: L.clere.y - 13.5 - L.clere.h / 2, y1: L.clere.y - 13.5 + L.clere.h / 2,
  })));
  for (const sx of [-1, 1]) {
    A.add('hall', 'limestone_polished', K.place(K.masonryShell({
      w: 1.5, d: h.z1 - h.z0 - 2.8, h: 3.1, batter: 0.02, course: 0.62, thick: 0.72, rng: R,
      blockLen: [1.3, 2.2], recess: 0.05, chipChance: 0.14, gapChance: 0, hollow: true, openings: clOpen,
    }), { x: sx * CL, y: DECK, z: zc }));
    wallProxy(A, sx * CL - 0.76, sx * CL + 0.76, DECK, DECK + 3.1, h.z0 + 1.4, h.z1 - 1.4);
    ledgeProxy(A, sx * CL - 0.76, sx * CL + 0.76, DECK + 3.1, h.z0 + 1.4, h.z1 - 1.4);
    for (const cz of L.clere.zs) {
      A.api.clerestory.push({
        center: new THREE.Vector3(sx * CL, L.clere.y, cz),
        normal: new THREE.Vector3(sx, 0, 0), w: L.clere.w, h: L.clere.h,
      });
      /* Mullion so the slot reads as a stone grille rather than a hole. */
      box(A, 'hall', 'limestone_polished', 1.6, L.clere.h, 0.22, sx * CL, L.clere.y, cz, { jitter: 0.01 });
    }
  }

  /* ---- Nave roof at y 17, with real slots punched through every 8 m in z. ---- */
  const slotZ = [-24, -32, -40, -48];
  for (let z = h.z0 + 1.4; z < h.z1 - 1.4; z += 2.42) {
    const cz = z + 1.21;
    const slot = slotZ.find((s) => Math.abs(s - cz) < 1.0);
    const spans = slot ? [[-CL, -1.3], [1.3, CL]] : [[-CL, CL]];
    for (const [x0, x1] of spans) {
      const g = K.block(x1 - x0, 0.82, 2.3, { rng: R, jitter: 0.02, chip: R.chance(0.1) ? 0.12 : 0 });
      K.place(g, { x: (x0 + x1) / 2, y: NAVE - 0.41, z: cz, ry: D(R.jitter(0.25)) });
      A.add('hall', 'sandstone_block', K.boxProjectUVs(g));
      groundProxy(A, x0, x1, NAVE, cz - 1.2, cz + 1.2, { thick: 0.85 });
    }
    if (slot) {
      A.api.roofSlots.push({ center: new THREE.Vector3(0, NAVE - 0.4, cz), normal: new THREE.Vector3(0, 1, 0), w: 2.6, h: 2.3 });
      for (const sx of [-1, 1]) ledgeProxy(A, sx * 1.3 - 0.4, sx * 1.3 + 0.4, NAVE, cz - 1.15, cz + 1.15, { thick: 0.5 });
    }
  }
  /* Painted star ceiling on the nave underside — the interior's one cool-hued surface. */
  vol(A, 'hall', 'ceiling_stars', -CL + 0.4, CL - 0.4, NAVE - 0.86, NAVE - 0.8, h.z0 + 1.6, h.z1 - 1.6);

  /* ---- Exterior cornice ring at the wall head: silhouette + a ledge all the way round. ---- */
  const ext = K.cornice({ w: 48 - 2 * B * WALL_H, d: (h.z1 - h.z0) - 2 * B * WALL_H, h: 1.3, flare: 1.05, roll: 0.36 });
  A.add('hall', 'hieroglyph_gilded', K.place(ext.geo, { x: 0, y: WALL_H, z: zc }));
  const cTop = WALL_H + ext.height;
  for (const sx of [-1, 1]) ledgeProxy(A, sx * 23.2 - 1.0, sx * 23.2 + 1.0, cTop, h.z0 + 0.5, h.z1 - 0.5, { thick: 0.5 });
  for (const pz of [h.z0 + 1.2, h.z1 - 1.2]) ledgeProxy(A, -23.4, 23.4, cTop, pz - 1.0, pz + 1.0, { thick: 0.5 });

  /* ---- Rooftop rails on the nave deck + the taut cable across the nave interior. ---- */
  for (const sx of [-1, 1]) {
    rail(A, `roof-${sx > 0 ? 'e' : 'w'}`, [
      [sx * CL, NAVE + 0.42, h.z1 - 2.5], [sx * CL, NAVE + 0.42, zc], [sx * CL, NAVE + 0.42, h.z0 + 2.5],
    ], 'bronze_dark', 0.13, 'hall');
  }
  rail(A, 'hall-cable', [[-8.4, 12.75, -20.5], [-3, 12.35, -27], [3, 12.35, -38], [8.4, 12.75, -45.5]], 'rope_fibre', 0.085, 'hall');

  /* Pinnacles on the aisle roof: the §8.1 spire tips at (±16, 21, −50). */
  for (const sx of [-1, 1]) {
    A.add('hall', 'granite_pink', K.place(K.obelisk({ h: 7.5, base: 1.5, rng: R }), { x: sx * 16, y: DECK, z: -50, ry: D(R.jitter(1.5)) }));
    poleProxy(A, sx * 16, -50, DECK, DECK + 6.0, 0.85);
    spirePoint(A, sx * 16, 21, -50);
  }
}

/* =========================== inner pylon =============================== */

function innerPylon(A) {
  const p = L.inner, R = A.rng, B = A.TUNE.batterPylon * 0.85;
  const MASS = 31.5;

  A.add('pylon', 'hieroglyph_wall', K.place(K.masonryShell({
    w: p.w, d: p.d, h: MASS, batter: B, course: A.TUNE.courseHeight, thick: 1.1, rng: R,
    blockLen: [1.5, 2.7], recess: A.TUNE.mortarRecess, chipChance: A.TUNE.chipChance,
    gapChance: A.TUNE.fallenBlockChance, buried: 0.5, hollow: true,
    openings: [0, 1].flatMap((f) => [{ face: f, a0: -3.4, a1: 3.4, y0: -1, y1: 8.2 }]),
  }), { x: p.x, y: 0, z: p.z }));
  A.add('pylon', 'sandstone_worn', K.place(K.cornerRolls({ w: p.w, d: p.d, h: MASS - 0.5, r: 0.48, batter: B, rng: R }), { x: p.x, y: 0, z: p.z }));

  /* Battered faces on all four sides — the vertical set piece's wall-run surfaces. */
  A.proxy(K.proxyBattered(p.w, p.d, MASS, B, A._proxyMat()), { tag: 'wall', material: 'stone', climbable: true, batter: B }, { x: p.x, y: 0, z: p.z });

  /* Gate passage through to the tomb stair. */
  groundProxy(A, -3.4, 3.4, 0, p.z - p.d / 2 - 0.2, p.z + p.d / 2 + 0.2);
  vol(A, 'pylon', 'ceiling_stars', -3.2, 3.2, 8.2, 8.5, p.z - p.d / 2, p.z + p.d / 2);
  A.add('pylon', 'hieroglyph_gilded', K.place(K.beam(8.6, 1.4, p.d + 0.6, { rng: R, pieces: 3, crack: 0.05, chip: 0.16 }), { x: 0, y: 8.9, z: p.z }));
  A.api.doorways.push({ center: new THREE.Vector3(0, 4.1, p.z), w: 6.8, h: 8.2 });

  /* Summit: cornice, deck at y = 34 (the §8.1 height), rails, sand-free and windswept. */
  const inset = B * MASS;
  const cw = p.w - 2 * inset, cd = p.d - 2 * inset;
  const cor = K.cornice({ w: cw, d: cd, h: 1.44, flare: 1.3, roll: 0.46 });
  A.add('pylon', 'hieroglyph_gilded', K.place(cor.geo, { x: p.x, y: MASS, z: p.z }));
  vol(A, 'pylon', 'paving_courtyard', -cw / 2, cw / 2, p.h - 0.4, p.h, p.z - cd / 2, p.z + cd / 2, { jitter: 0.02 });
  groundProxy(A, -cw / 2, cw / 2, p.h, p.z - cd / 2, p.z + cd / 2);
  ledgeProxy(A, -cw / 2 - 1.3, cw / 2 + 1.3, p.h - 0.42, p.z + cd / 2 + 0.2, p.z + cd / 2 + 1.5, { thick: 0.5 });
  rail(A, 'pylon-summit', [[-cw / 2 + 0.6, p.h + 0.4, p.z + cd / 2 - 0.6], [0, p.h + 0.4, p.z + cd / 2 - 0.6], [cw / 2 - 0.6, p.h + 0.4, p.z + cd / 2 - 0.6]], 'bronze_dark', 0.13, 'pylon');

  /* ---- South stage: the stepped shoulder that carries the (±6, 27, −50) spires. ---- */
  const sz0 = p.z + p.d / 2 - 3.0, sz1 = p.z + p.d / 2 + 0.9;
  A.add('pylon', 'hieroglyph_wall', K.place(K.masonryShell({
    w: 21.4, d: sz1 - sz0, h: 24.0, batter: A.TUNE.batterPylon, course: A.TUNE.courseHeight, thick: 1.0, rng: R,
    blockLen: [1.4, 2.5], recess: A.TUNE.mortarRecess, chipChance: 0.2, gapChance: 0.04, buried: 0.5, hollow: true,
    openings: [0, 1].flatMap((f) => [
      { face: f, a0: -3.6, a1: 3.6, y0: -1, y1: 8.6 },
      { face: f, a0: -7.4, a1: -6.0, y0: 1.4, y1: 21 },     // flagstaff niches
      { face: f, a0: 6.0, a1: 7.4, y0: 1.4, y1: 21 },
    ]),
  }), { x: 0, y: 0, z: (sz0 + sz1) / 2 }));
  const sInset = A.TUNE.batterPylon * 24;
  const scor = K.cornice({ w: 21.4 - 2 * sInset, d: (sz1 - sz0) - 2 * sInset + 1.2, h: 0.94, flare: 1.1, roll: 0.4 });
  A.add('pylon', 'hieroglyph_gilded', K.place(scor.geo, { x: 0, y: 24.0, z: (sz0 + sz1) / 2 }));
  const stageTop = 26.0;
  vol(A, 'pylon', 'paving_courtyard', -8.0, 8.0, stageTop - 0.4, stageTop, sz0 + 0.4, sz1 - 0.2, { jitter: 0.02 });
  groundProxy(A, -8.0, 8.0, stageTop, sz0 + 0.4, sz1 - 0.2);
  ledgeProxy(A, -9.4, 9.4, 25.6, sz1 - 0.2, sz1 + 1.2, { thick: 0.5 });
  A.proxy(K.proxyBattered(21.4, sz1 - sz0, 24.0, A.TUNE.batterPylon, A._proxyMat()),
    { tag: 'wall', material: 'stone', climbable: true, batter: A.TUNE.batterPylon }, { x: 0, y: 0, z: (sz0 + sz1) / 2 });

  for (const sx of [-1, 1]) {
    A.add('pylon', 'gold_leaf', K.place(K.spire({ r: 0.52, h: 1.0, rng: R }), { x: sx * 6, y: stageTop, z: -50 }));
    spirePoint(A, sx * 6, 27, -50);
  }
  /* Sand banked on the leeward north face. */
  A.add('pylon', 'sandstone_worn', K.place(K.sandDrift({ len: 20, h: 2.0, depth: 5.0, seg: 18, rng: R }), { x: 0, z: p.z - p.d / 2, ry: Math.PI }));
}

/* ============================== tomb =================================== */

function tomb(A) {
  const t = L.tomb, R = A.rng;
  const F = t.floor, C = t.ceil, zc = (t.z0 + t.z1) / 2;

  /* ---- Descent: landing, then a dog-leg of two flights, 0 -> -12. ---- */
  groundProxy(A, -3.6, 3.6, 0, -58.6, -55.4);
  vol(A, 'tomb', 'sandstone_block', -13.6, 4.2, -0.9, 0.02, -59.4, -54.0, { jitter: 0.03 });
  const fA = K.stairFlight({ steps: 14, rise: 0.4, run: 0.69, width: 3.2, rng: R, cheek: 0.9 });
  A.add('tomb', 'sandstone_worn', K.place(fA, { x: 3.6, y: 0, z: -55.6, ry: Math.PI }));
  /* stairFlight climbs +X from its origin, so mirror it: descend west from x 3.6 to -6.1. */
  A.proxy(new THREE.BoxGeometry(9.9, 1.2, 3.2), { tag: 'ground', material: 'stone' },
    { x: -1.25, y: -2.8 - 0.6, z: -55.6, rz: Math.atan2(5.6, 9.9) });
  const fB = K.stairFlight({ steps: 16, rise: 0.4, run: 0.63, width: 3.2, rng: R, cheek: 0.9 });
  A.add('tomb', 'sandstone_worn', K.place(fB, { x: -9.9, y: -12.0, z: -57.9 }));
  A.proxy(new THREE.BoxGeometry(10.4, 1.2, 3.2), { tag: 'ground', material: 'stone' },
    { x: -4.7, y: -8.8 - 0.6, z: -57.9, rz: -Math.atan2(6.4, 10.1) });
  groundProxy(A, -13.6, -9.6, -5.6, -59.4, -54.2);        // mid landing
  vol(A, 'tomb', 'sandstone_block', -13.8, -9.4, -6.5, -5.6, -59.6, -54.0, { jitter: 0.03 });
  for (const sx of [-1, 1]) wallProxy(A, -14.2, 4.4, -12.4, 0.4, sx > 0 ? -54.4 : -60.0, sx > 0 ? -53.8 : -59.4);
  vol(A, 'tomb', 'mudbrick', -14.2, 4.4, -12.4, 0.4, -54.4, -53.6, { jitter: 0.04 });
  vol(A, 'tomb', 'mudbrick', -14.6, -13.8, -12.4, 0.4, -60.0, -53.6, { jitter: 0.04 });

  /* ---- Vault shell. ---- */
  A.instance('paving_courtyard', K.slabUnit(0.5, R),
    K.pavingMatrices({ x0: t.x0, x1: t.x1, z0: t.z0, z1: -59.0, y: F, slab: 2.35, rng: R, sink: 0.05, holes: [[-6.6, -4.4, -75.2, -60.8], [4.4, 6.6, -75.2, -60.8]] }), 'paving:tomb');
  groundProxy(A, t.x0, t.x1, F, t.z0, -58.6);
  const nicheZ = [-64, -70, -76];
  const vOpen = nicheZ.flatMap((nz) => [2, 3].map((f) => ({ face: f, a0: nz - zc - 0.8, a1: nz - zc + 0.8, y0: 3.0, y1: 4.9 })));
  vOpen.push({ face: 3, a0: -63 - zc - 1.0, a1: -63 - zc + 1.0, y0: 8.2, y1: 9.9 });   // vent mouth
  for (const sx of [-1, 1]) {
    A.add('tomb', 'hieroglyph_wall', K.place(K.masonryShell({
      w: 1.9, d: t.z1 - t.z0, h: C - F, batter: 0.015, course: 0.7, thick: 0.95, rng: R,
      blockLen: [1.4, 2.4], recess: 0.07, chipChance: 0.22, gapChance: 0.02, hollow: true, openings: vOpen,
    }), { x: sx * (t.x1 - 0.95), y: F, z: zc }));
    wallProxy(A, sx * (t.x1 - 0.95) - 1.0, sx * (t.x1 - 0.95) + 1.0, F, C, t.z0, t.z1);
    for (const nz of nicheZ) ledgeProxy(A, sx * (t.x1 - 0.95) - 1.0, sx * (t.x1 - 0.95) + 1.0, F + 3.0, nz - 0.8, nz + 0.8, { thick: 0.35 });
  }
  A.add('tomb', 'hieroglyph_wall', K.place(K.masonryShell({
    w: t.x1 - t.x0, d: 1.9, h: C - F, batter: 0.015, course: 0.7, thick: 0.95, rng: R,
    blockLen: [1.4, 2.4], recess: 0.07, chipChance: 0.2, gapChance: 0.02, hollow: true,
  }), { x: 0, y: F, z: t.z0 + 0.95 }));
  wallProxy(A, t.x0, t.x1, F, C, t.z0, t.z0 + 1.9);
  /* Gate wall + doorway, right behind the `interior` camera. */
  A.add('tomb', 'hieroglyph_wall', K.place(K.masonryShell({
    w: t.x1 - t.x0, d: 1.6, h: C - F, batter: 0.015, course: 0.7, thick: 0.9, rng: R,
    blockLen: [1.3, 2.2], recess: 0.07, chipChance: 0.2, gapChance: 0.01, hollow: true,
    openings: [0, 1].flatMap((f) => [{ face: f, a0: -2.6, a1: 2.6, y0: -1, y1: 3.8 }]),
  }), { x: 0, y: F, z: -59.4 }));
  for (const [x0, x1] of [[t.x0, -2.6], [2.6, t.x1]]) wallProxy(A, x0, x1, F, C, -60.2, -58.6);
  wallProxy(A, -2.6, 2.6, F + 3.8, C, -60.2, -58.6);
  vol(A, 'tomb', 'ceiling_stars', t.x0 + 0.9, t.x1 - 0.9, C - 0.85, C, t.z0 + 1.6, -58.8);

  /* ---- Pillared crypt. The nearest pier is the `interior` shot's foreground frame. ---- */
  for (const sx of [-1, 1]) {
    for (const pz of [-62, -68, -74]) {
      A.add('tomb', 'granite_pink', K.place(K.masonryShell({
        w: 2.2, d: 2.2, h: C - F - 1.2, batter: 0.02, course: 0.72, thick: 1.05, rng: R,
        blockLen: [1.1, 2.0], recess: 0.055, chipChance: 0.18, gapChance: 0, hollow: false,
      }), { x: sx * 5.5, y: F, z: pz, ry: D(R.jitter(0.5)) }));
      wallProxy(A, sx * 5.5 - 1.1, sx * 5.5 + 1.1, F, C - 1.2, pz - 1.1, pz + 1.1);
    }
    A.add('tomb', 'hieroglyph_gilded', K.place(K.beam(15.6, 1.2, 2.4, { rng: R, pieces: 5, crack: 0.04, chip: 0.14 }), { x: sx * 5.5, y: C - 0.6, z: -68, ry: Math.PI / 2 }));
    /* West-wall shelves: the vent's landing chain down to the floor. */
    if (sx < 0) {
      for (const [sy, z0, z1] of [[-3.2, -70, -60.5], [-6.4, -72, -64], [-9.4, -74, -66]]) {
        vol(A, 'tomb', 'sandstone_block', t.x0 + 0.6, t.x0 + 2.0, sy - 0.6, sy, z0, z1, { jitter: 0.025, chip: 0.12 });
        ledgeProxy(A, t.x0 + 0.6, t.x0 + 2.0, sy, z0, z1, { thick: 0.6 });
      }
    }
  }

  /* ---- Sarcophagus at (0, −12, −72). Lid shoved aside — someone got here first. ---- */
  const [sx0, sy0, sz0] = t.sarc;
  vol(A, 'tomb', 'granite_pink', sx0 - 2.4, sx0 + 2.4, sy0, sy0 + 0.55, sz0 - 1.7, sz0 + 1.7, { jitter: 0.02 });
  A.add('tomb', 'granite_pink', K.place(K.masonryShell({
    w: 3.5, d: 2.1, h: 1.6, batter: 0.02, course: 0.8, thick: 0.55, rng: R,
    blockLen: [1.2, 1.8], recess: 0.04, chipChance: 0.2, gapChance: 0, hollow: false,
  }), { x: sx0, y: sy0 + 0.55, z: sz0 }));
  const lid = K.block(3.8, 0.5, 2.35, { rng: R, jitter: 0.02, chip: 0.18 });
  K.place(lid, { x: sx0 + 0.55, y: sy0 + 2.4, z: sz0 + 0.3, ry: D(6.5), rz: D(2.2) });
  A.add('tomb', 'gold_leaf', K.boxProjectUVs(lid));
  ledgeProxy(A, sx0 - 1.9, sx0 + 2.6, sy0 + 2.65, sz0 - 1.1, sz0 + 1.5, { thick: 0.5 });
  A.proxy(new THREE.BoxGeometry(4.8, 2.2, 3.4), { tag: 'ground', material: 'stone' }, { x: sx0, y: sy0 + 1.1, z: sz0 });

  /* False door on the north wall — the tomb's one gilded hero read. */
  vol(A, 'tomb', 'hieroglyph_gilded', -2.6, 2.6, F, F + 6.2, t.z0 + 1.7, t.z0 + 2.1, { jitter: 0.02 });
  vol(A, 'tomb', 'gold_leaf', -1.9, 1.9, F + 0.4, F + 5.4, t.z0 + 1.6, t.z0 + 1.75, { jitter: 0.01 });

  /* ---- The `vent`: hall north-west corner -> vault west shelf. ---- */
  const ventMat = { material: 'sand' };
  A.proxy(new THREE.BoxGeometry(1.35, 1.2, 10.6), { tag: 'vent', crawl: true, ...ventMat },
    { x: -21, y: -1.55, z: -54.5, rx: -D(17.2) });
  A.proxy(new THREE.BoxGeometry(1.35, 1.2, 2.4), { tag: 'vent', crawl: true, ...ventMat }, { x: -21, y: -3.5, z: -60.6 });
  A.proxy(new THREE.BoxGeometry(7.6, 1.2, 1.35), { tag: 'vent', crawl: true, ...ventMat }, { x: -17.4, y: -3.55, z: -61.6 });
  /* Portal frames so the crawl reads as built, not as a hole in the maths. */
  vol(A, 'hall', 'mudbrick', -22.3, -19.7, 0.0, 1.55, -50.4, -49.9, { jitter: 0.02 });
  vol(A, 'hall', 'mudbrick', -22.3, -21.9, -0.1, 1.55, -50.4, -48.6, { jitter: 0.02 });
  vol(A, 'hall', 'mudbrick', -19.9, -19.6, -0.1, 1.55, -50.4, -48.6, { jitter: 0.02 });
  A.proxy(new THREE.BoxGeometry(2.2, 0.6, 1.9), { tag: 'vent', crawl: true, ...ventMat }, { x: -21, y: -0.2, z: -49.4 });
}

/* ========================= background mass ============================= */

function background(A) {
  const R = A.rng;
  for (const p of [L.pyr1, L.pyr2]) {
    A.add('far', 'limestone_polished', K.place(
      K.steppedPyramid({ base: p.base, h: p.h, courses: Math.round(p.h / 3.1), rng: R, casing: 0.2 }),
      { x: p.x, y: -1.5, z: p.z, ry: D(R.range(-3, 3)) }));
  }
  /* A third, distant, half-buried mastaba field staggers the horizon further. */
  for (let i = 0; i < 5; i++) {
    const x = -60 - i * 34 + R.jitter(12), z = -150 - i * 26 + R.jitter(20);
    box(A, 'far', 'sandstone_worn', 24 + R.range(0, 14), 7 + R.range(0, 5), 16 + R.range(0, 10), x, 2.4, z, { jitter: 0.2, taper: 2.6, ry: D(R.range(-8, 8)) });
  }
}

/* ==================== foreground framing (§2.3) ======================== */

function foreground(A) {
  const R = A.rng;

  /* Twin processional gateways across the courtyard's mid-line. These are the dark
     near-field frames for the `traversal` and `hero` cameras, and the hook chain flies
     over them, so they earn their keep three times. */
  for (const sx of [-1, 1]) {
    const inner = sx * 12.5, outer = sx * 21.0;
    for (const px of [inner, outer]) {
      A.add('court', 'hieroglyph_wall', K.place(K.masonryShell({
        w: 2.6, d: 3.0, h: 12.6, batter: 0.085, course: 0.64, thick: 0.95, rng: R, hollow: true,
        blockLen: [1.2, 2.1], recess: 0.06, chipChance: 0.22, gapChance: 0.04, buried: 0.4,
      }), { x: px, y: 0, z: 1.0, ry: D(R.jitter(0.5)) }));
      A.proxy(K.proxyBattered(2.6, 3.0, 12.6, 0.085, A._proxyMat()), { tag: 'wall', material: 'stone', climbable: true }, { x: px, y: 0, z: 1.0 });
    }
    const span = Math.abs(outer - inner) + 2.2;
    A.add('court', 'hieroglyph_gilded', K.place(K.beam(span, 1.7, 3.4, { rng: R, pieces: 4, crack: sx > 0 ? 0.05 : 0, chip: 0.16 }), { x: (inner + outer) / 2, y: 12.0, z: 1.0 }));
    const cor = K.cornice({ w: span, d: 3.6, h: 0.9, flare: 0.95, roll: 0.34 });
    A.add('court', 'sandstone_block', K.place(cor.geo, { x: (inner + outer) / 2, y: 12.85, z: 1.0 }));
    ledgeProxy(A, Math.min(inner, outer) - 1.1, Math.max(inner, outer) + 1.1, 12.85 + cor.height, -0.9, 2.9, { thick: 0.6 });
    ledgeProxy(A, Math.min(inner, outer) - 1.1, Math.max(inner, outer) + 1.1, 12.85, -1.7, -0.7, { thick: 0.5 });
  }

  /* Terrace parapets: dark vertical mass in the lower frame of the `night` shot. */
  for (const sx of [-1, 1]) {
    vol(A, 'court', 'sandstone_block', sx * 9.4 - (sx > 0 ? 1.1 : 0), sx * 9.4 + (sx > 0 ? 0 : 1.1), 2.0, 3.5, 3.4, 19.4, { jitter: 0.03, chip: 0.14 });
    ledgeProxy(A, sx * 9.4 - 0.6, sx * 9.4 + 0.6, 3.5, 3.4, 19.4);
  }

  /* Fallen architrave + column drums in the courtyard's east bay: the `hero` shot's
     lower-left dark mass, and a ruin note that stops the complex looking new-built. */
  const drum = new THREE.CylinderGeometry(1.72, 1.86, 1.5, 16, 1);
  K.normaliseAttrs(drum);
  const drums = [];
  for (const [x, y, z, rz, ry] of [[12.6, 0.95, 20.6, D(88), D(12)], [13.9, 0.9, 18.1, D(84), D(-40)], [11.4, 2.4, 21.3, D(80), D(30)]]) {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(D(R.jitter(4)), ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
    drums.push(m);
    A.proxy(new THREE.BoxGeometry(3.4, 1.8, 3.2), { tag: 'ground', material: 'stone' }, { x, y: y - 0.2, z });
  }
  A.instance('column_papyrus', K.boxProjectUVs(drum), drums, 'ruin:drums');
  box(A, 'court', 'hieroglyph_gilded', 6.2, 1.5, 2.6, 15.6, 0.72, 22.6, { jitter: 0.03, chip: 0.22, ry: D(-24), rz: D(3.5) });
  A.proxy(new THREE.BoxGeometry(6.2, 1.5, 2.6), { tag: 'ledge', material: 'stone' }, { x: 15.6, y: 0.72, z: 22.6, ry: D(-24) });
  A.add('court', 'sandstone_worn', K.place(K.sandDrift({ len: 9, h: 0.9, depth: 3.0, rng: R }), { x: 13.5, z: 19.6, ry: Math.PI * 0.85 }));
}

export function buildEgyptLevel(A) {
  courtyard(A);
  entryPylons(A);
  courtyardTraversal(A);
  hypostyleHall(A);
  innerPylon(A);
  tomb(A);
  background(A);
  foreground(A);

  A.api.route = [
    ['spawn', 0, 0, 30], ['terrace-1', 0, 2, 19], ['terrace-2', 0, 5.2, 14],
    ['kiosk-lintel', 2.2, 9, 8.4], ['hook-chain', 4.2, 14.8, 4.5], ['hall-front-cornice', -9.5, 13.6, -15.2],
    ['hall-floor', 0, 0, -20], ['inner-gate', 0, 0, -52], ['descent-landing', 0, 0, -57],
    ['vault-floor', 0.4, -12, -57.6], ['sarcophagus', 0, -12, -72],
  ];
}
