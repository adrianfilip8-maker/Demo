import * as THREE from 'three';
import { Bag, chunk, chunkAt, wedge, place, boxProjectUVs, collar, loft } from './PropKit.js';

/**
 * Statues — the figurative sculpture of the Temple of Ra.
 *
 * These carry the shots, so every one of them is built to a silhouette brief first:
 *
 *   COLOSSUS  a wedge of shoulder under an enormous nemes. Head + headdress is a quarter of
 *             the figure (AGENTS.md §2.4 wants ~1:4, not the 1:7.5 of an actual human), the
 *             shoulders are wider than the throne, and the crown is stepped so the ink line
 *             reads three distinct terraces instead of one dome.
 *   SPHINX    a long low body ending in a head that is far too big for it — the read is
 *             "cat with a pharaoh's face", instantly, from sixty metres up the avenue.
 *   ANUBIS    ears. The whole silhouette is ears, snout and a vertical chest.
 *   RA        a golden falcon-headed column with a sun disc: the brightest thing in the tomb.
 *
 * Everything returns a `Bag` in local space with +Z facing forward and y = 0 at the piece's
 * seating plane, so the caller only ever needs a position and a yaw.
 *
 * Material keys used here (resolved by Props.js): stone lime dark gold lapis carnelian
 * turquoise paintWhite paintDark.
 */

const D = THREE.MathUtils.degToRad;

/* Where the eye lands on a face, in fractions of head height. Faces are the one place a
   millimetre matters, because a wrong eyeline reads as "wrong" from any distance. */
const FACE = { eye: 0.62, nose: 0.50, mouth: 0.26, brow: 0.74 };

/**
 * A carved face at any scale. Egyptian sculpture paints the eye far larger than life and
 * runs a cosmetic line out past the temple; that line is the single most recognisable
 * feature at distance, so it is real geometry rather than a texture.
 */
function carveFace(bag, { w, h, y0, z, rng, gold = false, brows = true }) {
  const eyeY = y0 + h * FACE.eye;
  const key = gold ? 'gold' : 'stone';
  // nose: a blunt wedge, broad at the nostrils
  bag.add(key, place(wedge(w * 0.30, h * 0.30, w * 0.36, { rng, tipW: 0.55, tipZ: -0.1 }),
    { y: y0 + h * FACE.nose, z: z + w * 0.10, rx: D(-8) }));
  // mouth: wide, flat, slightly smiling — chunky enough to catch a terminator
  bag.add(key, place(chunk(w * 0.46, h * 0.10, w * 0.13, { rng, jitter: 0.004 }),
    { y: y0 + h * FACE.mouth, z: z + w * 0.05 }));
  for (const sx of [-1, 1]) {
    // eye: white almond, dark pupil, and the long kohl line past the outer corner
    bag.add('paintWhite', place(chunk(w * 0.34, h * 0.12, w * 0.07, { rng, jitter: 0.003 }),
      { x: sx * w * 0.30, y: eyeY, z: z + w * 0.03 }));
    bag.add('paintDark', place(chunk(w * 0.15, h * 0.10, w * 0.07, { rng, jitter: 0.003 }),
      { x: sx * w * 0.28, y: eyeY, z: z + w * 0.05 }));
    bag.add('paintDark', place(chunk(w * 0.30, h * 0.045, w * 0.06, { rng, jitter: 0.003 }),
      { x: sx * w * 0.58, y: eyeY - h * 0.02, z: z + w * 0.02, rz: sx * D(6) }));
    if (brows) {
      bag.add('paintDark', place(chunk(w * 0.52, h * 0.05, w * 0.06, { rng, jitter: 0.003 }),
        { x: sx * w * 0.34, y: y0 + h * FACE.brow, z: z + w * 0.02, rz: sx * D(5) }));
    }
  }
}

/** The cobra at the brow. Small, but it is what says "king" rather than "man". */
function uraeus(bag, { s = 1, y, z, rng }) {
  bag.add('gold', place(chunk(0.16 * s, 0.30 * s, 0.13 * s, { rng, jitter: 0.004 }), { y: y + 0.13 * s, z, rx: D(-14) }));
  bag.add('gold', place(chunk(0.34 * s, 0.34 * s, 0.11 * s, { rng, jitter: 0.004, taper: -0.10 * s }),
    { y: y + 0.42 * s, z: z + 0.05 * s, rx: D(-22) }));
  bag.add('gold', place(wedge(0.16 * s, 0.20 * s, 0.20 * s, { rng, tipW: 0.4 }),
    { y: y + 0.60 * s, z: z + 0.12 * s, rx: D(48) }));
  bag.add('carnelian', place(chunk(0.05 * s, 0.05 * s, 0.05 * s, { rng, jitter: 0.002 }),
    { x: 0.05 * s, y: y + 0.58 * s, z: z + 0.19 * s }));
}

/**
 * The x envelope of a placed slab, sampled from its own vertices.
 *
 * `sx` names which side is "outer" (+1 = the +x side). Returns linear interpolants for the
 * outer and inner arris as a function of world y, taken from the extreme vertices in the top
 * and bottom fifths of the mesh — exact for a six-sided slab however it has been tapered,
 * leaned, rounded, chipped, chamfered, jittered or tilted, which between them defeated four
 * attempts to place inlay inside one by arithmetic.
 */
function edgeEnvelope(geo, sx) {
  const p = geo.attributes.position;
  let yLo = Infinity, yHi = -Infinity;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < yLo) yLo = y; if (y > yHi) yHi = y; }
  const band = (yHi - yLo) * 0.2;
  let oTop = -sx * Infinity, oBot = -sx * Infinity, iTop = sx * Infinity, iBot = sx * Infinity;
  const outer = (a, b) => (sx > 0 ? Math.max(a, b) : Math.min(a, b));
  const inner = (a, b) => (sx > 0 ? Math.min(a, b) : Math.max(a, b));
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = p.getX(i);
    if (y >= yHi - band) { oTop = outer(oTop, x); iTop = inner(iTop, x); }
    if (y <= yLo + band) { oBot = outer(oBot, x); iBot = inner(iBot, x); }
  }
  const at = (a, b) => (y) => {
    const t = Math.min(1, Math.max(0, (y - yLo) / Math.max(1e-6, yHi - yLo)));
    return b + (a - b) * t;
  };
  return { yLo, yHi, outerAt: at(oTop, oBot), innerAt: at(iTop, iBot) };
}

/**
 * A nemes headdress: three stacked terraces above the brow, then two lappets falling to the
 * chest, banded with lapis inlay.
 *
 * `stripes` is gone as a parameter. It was a per-call band *count*, so the same authored
 * number gave a 3.5 m sphinx and a 13 m colossus completely different band pitches, and the
 * count was the wrong knob anyway — pitch is a property of the cloth. It is now derived from
 * `w`, so every nemes in the level bands at the same physical rhythm.
 */
function nemes(bag, { w, browY, topY, faceZ, backZ, rng, lappetDrop, crownKey = 'stone' }) {
  const crownH = topY - browY;
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const t = i / steps, t1 = (i + 1) / steps;
    const ww = w * (1.76 - t * 0.84);
    /* The terraces are deliberate (§2.4 wants the ink line to read steps, not one dome) — but
       each terrace was a flat-topped slab, so the whole headdress landed in a single band and
       the crown had no modelling at all. `round` domes each terrace's top and a chamfer three
       times the old one turns the arris over ~10 cm of real width. The steps survive in the
       silhouette; the faces stop being plateaux.

       Three terraces became four, and the crown starts at 1.76w rather than 1.34w. The reason
       is the junction below, not the crown: the lappets used to be 0.43w WIDER than the crown
       at the brow, so the headdress stepped outward at the temple and read as a narrower box
       on a wider box (D9's "stacked rectangular slabs"). Pinning the lappets to the crown's
       width instead left the cloth 0.18w wide at the temple — too narrow to carry inlay, which
       then had nowhere to sit but on the silhouette. Widening the crown's base gives the cloth
       0.38w there and lets the headdress read as one flaring trapezoid. The FOURTH terrace
       keeps each step at 0.105w, i.e. the same per-step width the three-terrace crown had, so
       the ink line's step rhythm is unchanged by the widening. Widest half-width is now 0.88w
       against the old figure's 1.10w at the lappet top, so the head is marginally NARROWER
       overall despite the wider crown. */
    bag.add(crownKey, chunkAt(-ww / 2, ww / 2, browY + crownH * t, browY + crownH * t1,
      backZ - 0.10 * w, faceZ - t * 0.16 * w,
      { rng, jitter: 0.012 * w, round: 0.13 * w, c: 0.10 * w }));
  }
  // Brow band, the fillet the uraeus sits on. Gold, always — it frames the face.
  bag.add('gold', chunkAt(-w * 0.72, w * 0.72, browY - crownH * 0.16, browY + crownH * 0.06,
    backZ, faceZ + 0.05 * w, { rng, jitter: 0.008 * w }));
  bag.add('lapis', chunkAt(-w * 0.70, w * 0.70, browY - crownH * 0.10, browY - crownH * 0.02,
    faceZ - 0.30 * w, faceZ + 0.07 * w, { rng, jitter: 0.005 * w }));

  /* Lappets: the two falls of cloth beside the face and over the chest.
     ------------------------------------------------------------------------------------
     They used to run 0.52w..1.02w with a NEGATIVE taper, i.e. widest at the brow — where the
     crown is only 0.67w — so the headdress stepped outward by 0.43w in the space of the
     chamfer and read as a narrower box sitting on a wider box. Critic 9 D9 called the result
     "stacked rectangular slabs… closer to a hi-fi amplifier or a Lego minifig".
     A nemes is one piece of cloth: it leaves the crown at the crown's own width and *flares*
     as it falls to the chest. So the top outer edge is pinned to 0.68w — a hair outside the
     crown's widest terrace at 0.67w, so the two overlap rather than butt — and it opens to
     1.00w at the hem. `taper` alone cannot do that (it is symmetric about the piece's centre
     and would open the inner edge away from the jaw too), so it is paired with `lean` to hold
     the inner edge flush against the head block at 0.50w down the whole drop. */
  const drop = lappetDrop ?? crownH * 1.9;
  const IN = 0.50, OUT_TOP = 0.88, OUT_HEM = 1.06;
  for (const sx of [-1, 1]) {
    const x0 = sx * w * IN, x1 = sx * w * OUT_HEM;
    const shrink = (OUT_HEM - OUT_TOP) * w;                 // the cloth's flare over the drop
    /* `round`, `chip` and the chamfer all pull the cloth's outer arris *inside* its nominal
       trapezoid — up to `round + c` at the top corners. That was survivable when the lappet was
       a constant 0.50w wide and it is not now that the temple end is 0.18w, so all three are
       roughly halved and `ROUND`/`CHIP` are named because the band inset below is derived from
       them. Get this wrong and the inlay reappears outside the silhouette, which is the whole
       defect. */
    const ROUND = 0.025 * w, CHIP = 0.05 * w;
    const g = chunk(Math.abs(x1 - x0), drop, w * 0.42, {
      rng, jitter: 0.01 * w, taper: shrink, lean: -sx * shrink * 0.5,
      round: ROUND, chip: sx > 0 ? CHIP : 0, c: 0.045 * w,
    });
    place(g, { x: (x0 + x1) / 2, y: browY - drop * 0.5, z: faceZ - w * 0.12, rz: sx * D(2.5) });
    bag.add('gold', g);

    /* Stripes are INLAY. Two rules were broken and each produced one of D9's symptoms.
       (1) They must not reach the silhouette. Every band was authored `1 + i*0.02` times the
       lappet's width and pushed outward by `i*0.006*w`, so the lowest ones stood clear of the
       figure into open sky — 11.7% (west) / 17.8% (east) of stripe pixels outside the figure's
       own outline, protruding up to 47 px. Bands now take the cloth's own interpolated edges
       and step in from the outer one by `ROUND + CHIP + jitter`, which is exactly the distance
       the arris can retreat; a flat 84%-of-width inset was tried first and still left 14.5%
       outside, because a percentage of a trapezoid that closes to 0.18w is a much smaller
       absolute margin at the temple than at the hem.
       (2) They must band at cloth frequency. Five bands 12-15 px thick is eye-scale in this
       frame (the critic's own "single eye" is 37x51 px), and a pair of eye-scale bars at one
       height either side of a slab is read as eyes either side of a nose. Pitch is derived from
       the headdress width rather than passed, so every nemes in the level bands at the same
       physical rhythm and a small one is not a large one wearing fat stripes. */
    /* The band's edges are READ OFF THE CLOTH MESH that was actually built, not recomputed
       from the numbers it was asked for. Every attempt to derive them arithmetically leaked:
       `round`, `chip`, the chamfer, the per-corner jitter and the `rz` tilt each move the
       arris by a few centimetres, they compose differently at the temple and at the hem, and
       an inset that cleared them at one end did not at the other — the version that took a
       flat 84% of the nominal trapezoid still left 14.5% of the inlay outside the figure.
       Sampling the placed geometry costs one pass over 48 vertices and is exact by
       construction. */
    const env = edgeEnvelope(g, sx);
    const bandN = Math.max(4, Math.round(drop / (w * 0.095)));
    /* A plain hemmed border down the outer edge of each lappet, and it is load-bearing rather
       than decorative: at this camera the cloth's outer arris is close to grazing, so a band
       placed a few centimetres inside it still projects OUTSIDE its silhouette — measured, at
       12-18% of band pixels and up to 14 px, with the band demonstrably inside the cloth in
       object space. A border wide enough to survive that projection is also what a real nemes
       has, so the honest fix and the authentic one are the same one. */
    const margin = w * 0.16;
    for (let i = 0; i < bandN; i++) {
      /* (i+1)/(bandN+1) keeps the first and last band clear of the hem and temple rims, where
         the chamfer is turning the arris over and the cloth's outline is receding. */
      const t = (i + 1) / (bandN + 1);
      const yy = browY - drop * t;
      const b = env.outerAt(yy) - sx * margin;
      const a = env.innerAt(yy) - sx * w * 0.02;
      if (Math.abs(b - a) < w * 0.05) continue;              // too narrow to band at the temple
      bag.add('lapis', place(chunk(Math.abs(b - a), drop / bandN * 0.36, w * 0.05, { rng, jitter: 0.003 }),
        { x: (a + b) / 2, y: yy, z: faceZ + w * 0.085 }));
    }
  }
}

/**
 * A wesekh — the broad collar — as a **filled bib**, which is what D9 turned on.
 *
 * `PropKit.collar()` builds concentric `TorusGeometry` arcs rotated `-arc/2 - PI/2`, which
 * centres the sweep on the bottom of the ring: seen frontally, a 225-degree arc is a crescent
 * with its horns up. On a frontal, rigid, symmetric figure, sitting at mid-chest at half the
 * body's width, directly under a vertical slab (the false beard) and a compact blob (the
 * uraeus), that crescent is read as a mouth — "an upturned gold arc that reads unambiguously
 * as a grinning mouth", and the measurement agrees: width 0.50 of the figure's own width at
 * that row, filling 0.12 of its own bounding box. It is a drawn line, not a garment.
 *
 * A real wesekh is worn shoulder to shoulder and is solid — strung rows of beads covering the
 * upper chest. Built here as stacked horizontal courses on a half-ellipse profile, so the
 * shape is filled by construction (a half-ellipse occupies pi/4 of its bounding box) and
 * spans the shoulders. The rows alternate material, which is the whole reason it reads as
 * jewellery rather than as a bare plate, and it is flat colour blocking rather than detail.
 *
 * The arc version is left untouched in PropKit for `falconRa` and `coffinLid`: on the coffin
 * lid it sits under a mask that fills the frame, and on Ra it is 0.66 m at tomb distance —
 * neither is anywhere near the angular size at which this defect appears.
 */
function wesekh(bag, { halfW, rows = 5, yTop, drop, zFront, depth = 0.34, bulge = 0.11, rng,
  keys = ['gold', 'lapis', 'turquoise', 'gold', 'carnelian'] }) {
  for (let i = 0; i < rows; i++) {
    const t0 = i / rows, t1 = (i + 1) / rows;
    const hw = halfW * 0.5 * (Math.sqrt(Math.max(0, 1 - t0 * t0)) + Math.sqrt(Math.max(0, 1 - t1 * t1)));
    if (hw < halfW * 0.12) continue;
    /* Lower courses stand further off the chest than upper ones — the collar lies ON a body
       rather than hanging in front of one, and the z walk is what lets the cel ramp put a
       terminator across it instead of leaving one flat band.
       `zFront` is set by the caller IN FRONT of the nemes lappets, deliberately: with the
       collar behind them the lappet hems cut its outer top quadrants away and the visible
       garment stopped being a filled shape (measured: it occupied 0.335 of its own bounding
       box, against 0.759 for the stack as built). In front, the collar is one unbroken bib and
       the lappet hems tuck under it, which also shortens the "stacked slab" run of the
       headdress by the height of the collar. */
    const zf = zFront + bulge * t1;
    bag.add(keys[i % keys.length], chunkAt(-hw, hw, yTop - drop * t1, yTop - drop * t0,
      zf - depth, zf, { rng, jitter: 0.008 }));
  }
}

/* ===================== colossal seated pharaoh ========================= */

/**
 * The 13 m seated colossus of the Great Courtyard.
 *
 * Local y = 0 is the plinth top (world y = 2.0). ARCHITECTURE owns the plinth, the throne
 * block up to the knee ledge at local 2.5, and the back slab to local 7.6 — this builds the
 * figure that sits on them and never re-registers their colliders.
 *
 * The lap between z = 1.5 and the throne's front face is deliberately left clear: it is the
 * registered `ledge` at world y 4.5 and Sly has to be able to stand on it.
 */
export function seatedColossus(opts = {}) {
  /* `collarSpan`/`collarRows` exist so the two courtyard colossi can differ. The broad collar
     is the widest horizontal feature on the figure and it sits at the centre of the mass, so
     when both figures carry the identical one the pair reads as matched — measured as the
     dominant mirror tell in `courtyard`, where raycasting the two crescents returned these
     statues at 16–20 m. These replace `collarArc`, which no longer means anything now that the
     collar is a bib rather than a torus sweep; the differentiation itself is preserved, because
     removing it would re-open a defect somebody already paid to close. */
  const { rng, worn = 0.5, collarSpan = 1.0, collarRows = 5, collarDrop = 1.46 } = opts;
  const bag = new Bag();
  const R = rng;

  const LAP = 2.5, SEAT_F = 2.6, BACK = -1.2;
  const HIP = 3.45, CHEST = 6.0, SHO = 6.65, CHIN = 7.1, BROW = 8.8, TOP = 10.8;
  const HW = 2.62;                      // shoulder half-width — wider than the throne

  /* ---- legs in relief on the throne front, feet on the plinth ---- */
  for (const sx of [-1, 1]) {
    const cx = sx * 1.72;
    bag.add('stone', chunkAt(cx - 0.86, cx + 0.86, 0.02, LAP - 0.02, 2.3, 3.16,
      { rng: R, jitter: 0.02, taper: -0.10, c: 0.11 }));
    // knee: bulges past the shin and past the throne face, so the ledge reads as a knee
    bag.add('stone', chunkAt(cx - 0.92, cx + 0.92, LAP - 0.72, LAP, 2.24, 3.34,
      { rng: R, jitter: 0.02, round: 0.16, c: 0.16 }));
    // foot
    bag.add('stone', chunkAt(cx - 0.80, cx + 0.80, 0, 0.46, 2.62, 3.42, { rng: R, jitter: 0.018, chip: worn * 0.14, c: 0.08 }));
    for (let i = 0; i < 4; i++) {
      bag.add('stone', chunkAt(cx - 0.72 + i * 0.38, cx - 0.40 + i * 0.38, 0, 0.22, 3.30, 3.52, { rng: R, jitter: 0.01 }));
    }
  }
  /* Pleated kilt apron falling between the knees. */
  bag.add('stone', chunkAt(-0.62, 0.62, LAP - 0.06, HIP, 1.55, 2.72, { rng: R, jitter: 0.02, taper: -0.22, c: 0.09 }));
  for (let i = 0; i < 5; i++) {
    bag.add('stone', chunkAt(-0.58 + i * 0.24, -0.46 + i * 0.24, LAP, HIP - 0.05, 2.66, 2.80, { rng: R, jitter: 0.008 }));
  }

  /* ---- hands flat on the lap, set back so the knee ledge stays landable ---- */
  for (const sx of [-1, 1]) {
    const cx = sx * 1.72;
    bag.add('stone', chunkAt(cx - 0.70, cx + 0.70, LAP, LAP + 0.34, 0.05, 1.30, { rng: R, jitter: 0.014, round: 0.06, c: 0.07 }));
    for (let i = 0; i < 4; i++) {
      bag.add('stone', chunkAt(cx - 0.66 + i * 0.34, cx - 0.38 + i * 0.34, LAP, LAP + 0.30, 1.24, 1.52, { rng: R, jitter: 0.008 }));
    }
    bag.add('gold', chunkAt(cx - 0.74, cx + 0.74, LAP + 0.30, LAP + 0.46, -0.02, 0.30, { rng: R, jitter: 0.006 }));  // wrist band
  }

  /* ---- torso ---- */
  bag.add('stone', chunkAt(-2.05, 2.05, LAP - 0.1, HIP + 0.35, BACK, 1.15, { rng: R, jitter: 0.022, taper: -0.30, c: 0.16 }));
  bag.add('stone', chunkAt(-2.42, 2.42, HIP + 0.3, CHEST, BACK, 1.30, { rng: R, jitter: 0.025, taper: -0.45, c: 0.20 }));
  bag.add('stone', chunkAt(-HW, HW, CHEST - 0.15, SHO, BACK, 1.12, { rng: R, jitter: 0.02, round: 0.18, chip: worn * 0.18, c: 0.26 }));
  for (const sx of [-1, 1]) {
    bag.add('stone', chunkAt(sx * 0.30, sx * 1.85, CHEST - 1.30, CHEST - 0.28, 1.05, 1.42, { rng: R, jitter: 0.015, round: 0.12, c: 0.11 }));
    // upper arm hugging the flank, elbow tucked, then the forearm down onto the thigh
    bag.add('stone', chunkAt(sx * 1.72, sx * 2.62, HIP - 0.15, CHEST + 0.25, -0.85, 0.60, { rng: R, jitter: 0.02, taper: 0.16, c: 0.15 }));
    const fore = chunk(0.95, 0.92, 1.85, { rng: R, jitter: 0.02, taper: 0.1, c: 0.12 });
    place(fore, { x: sx * 2.02, y: LAP + 0.62, z: 0.32, rx: D(28), rz: sx * D(4) });
    bag.add('stone', fore);
    bag.add('gold', chunkAt(sx * 1.70, sx * 2.66, CHEST - 0.62, CHEST - 0.30, -0.80, 0.62, { rng: R, jitter: 0.008 }));  // armlet
  }

  /* ---- belt and cartouche: the gold that reads from across the courtyard ---- */
  bag.add('gold', chunkAt(-2.16, 2.16, HIP - 0.05, HIP + 0.34, BACK, 1.30, { rng: R, jitter: 0.01 }));
  bag.add('lapis', chunkAt(-2.10, 2.10, HIP + 0.06, HIP + 0.20, BACK, 1.36, { rng: R, jitter: 0.006 }));
  bag.add('gold', chunkAt(-0.66, 0.66, HIP - 0.30, HIP + 0.60, 1.24, 1.46, { rng: R, jitter: 0.008 }));
  bag.add('lapis', chunkAt(-0.50, 0.50, HIP - 0.18, HIP + 0.46, 1.42, 1.50, { rng: R, jitter: 0.005 }));

  /* ---- broad collar: a bib on the shoulders, not a crescent at mid-chest (see `wesekh`) ---- */
  wesekh(bag, {
    halfW: HW * 0.92 * collarSpan, rows: collarRows,
    yTop: SHO - 0.18, drop: collarDrop, zFront: 1.50, rng: R,
  });

  /* ---- neck and head ---- */
  bag.add('stone', chunkAt(-0.88, 0.88, SHO - 0.35, CHIN + 0.15, -0.60, 0.86, { rng: R, jitter: 0.015, c: 0.09 }));
  bag.add('stone', chunkAt(-1.18, 1.18, CHIN, 9.34, -1.05, 1.22, { rng: R, jitter: 0.02, round: 0.18, c: 0.15 }));
  bag.add('stone', chunkAt(-0.95, 0.95, CHIN - 0.12, CHIN + 0.62, -0.80, 1.16, { rng: R, jitter: 0.015, round: 0.14, c: 0.11 }));   // jaw
  /* Face height stops short of the nemes band, so the eyeline sits under the headcloth. */
  carveFace(bag, { w: 2.3, h: 1.42, y0: CHIN, z: 1.20, rng: R });

  /* ---- false beard: a straight post off the chin, banded, tied to the collar ---- */
  const beard = chunk(0.62, 1.78, 0.60, { rng: R, jitter: 0.012, taper: -0.14, c: 0.06 });
  place(beard, { y: CHIN - 0.82, z: 1.14, rx: D(6) });
  bag.add('stone', beard);
  for (let i = 0; i < 5; i++) {
    bag.add('gold', place(chunk(0.66 + i * 0.02, 0.09, 0.10, { rng: R, jitter: 0.004 }),
      { y: CHIN - 0.30 - i * 0.34, z: 1.46 + i * 0.02, rx: D(6) }));
  }

  /* ---- nemes + uraeus ---- */
  nemes(bag, { w: 2.4, browY: BROW, topY: TOP, faceZ: 1.24, backZ: -1.35, rng: R, lappetDrop: 3.7 });
  uraeus(bag, { s: 1.7, y: BROW - 0.05, z: 1.34, rng: R });

  /* ---- back pillar carried up behind the crown (ARCHITECTURE's stops at 7.6) ---- */
  bag.add('stone', chunkAt(-1.72, 1.72, 7.55, TOP + 0.30, -2.90, -1.10, { rng: R, jitter: 0.02, taper: 0.14, c: 0.13 }));
  bag.add('gold', chunkAt(-1.60, 1.60, TOP + 0.28, TOP + 0.52, -2.95, -1.05, { rng: R, jitter: 0.01 }));

  /* ---- four thousand years of weather ---- */
  for (let i = 0; i < 5; i++) {
    const y = 2.8 + i * 1.35 + R.jitter(0.4);
    bag.add('dark', place(chunk(R.range(0.5, 1.6), 0.07, 0.10, { rng: R, jitter: 0.03 }),
      { x: R.jitter(2.0), y, z: 1.30, rz: R.jitter(0.7) }));
  }
  bag.ledge = { y: SHO, halfW: HW, z0: BACK, z1: 1.05 };
  bag.height = TOP + 0.52;
  return bag;
}

/* ============================ sphinx =================================== */

/**
 * Recumbent sphinx. `s` scales the whole animal; the avenue wants 3.5 m overall.
 *
 * `pedestal` adds a stepped base course *below* the plinth, from −pedestal up to the plinth
 * foot, so the animal rides that much higher while the stone still meets the sand. The caller
 * must raise its placement by the same amount — see `Props._sphinxAvenue`, which is the only
 * user and which measured why it needs it.
 */
export function sphinx(opts = {}) {
  const { rng, s = 1, worn = 0.5, pedestal = 0 } = opts;
  const bag = new Bag();
  const R = rng;

  if (pedestal > 0.01) {
    /* Wider than the plinth by 13 cm a side so the two courses read as a step rather than as
       one tall block, and chipped harder: this is the course the sand actually attacks. */
    bag.add('lime', chunkAt(-1.28, 1.28, -pedestal, 0.04, -2.68, 2.48,
      { rng: R, jitter: 0.035, chip: worn * 0.2, c: 0.10 }));
  }

  /* plinth. The cap slab is 19.4% of the whole animal's surface area — measured, and it was
     carrying it on twelve unchamfered triangles, which made it the single largest flat
     population on the piece. It gets a real arris. */
  bag.add('lime', chunkAt(-1.15, 1.15, 0, 0.72, -2.55, 2.35, { rng: R, jitter: 0.03, chip: worn * 0.16, c: 0.09 }));
  bag.add('lime', chunkAt(-1.22, 1.22, 0.66, 0.84, -2.62, 2.42, { rng: R, jitter: 0.02, c: 0.07 }));

  /* ---- body: haunch, barrel and chest as ONE lofted mass ----
     Three stacked `chunkAt` slabs used to do this job and the join between them was a hard
     arris across the animal's back at the waist and again at the shoulder. Lofting it puts a
     continuous curve from rump to chest with the back's normal turning through the whole
     quarter-circle, which is what the cel ramp needs to draw a terminator anywhere on it.
     The front sections keep y0 on the plinth: a sphinx's chest is a wall that comes down
     between the forelegs, not a box resting on the barrel. */
  bag.add('lime', loft([
    { z: -2.18, w: 0.72, y0: 0.84, top: 1.82, n: 2.4 },
    { z: -1.78, w: 0.90, y0: 0.84, top: 2.06, n: 2.3 },   // haunch, the widest station
    { z: -1.12, w: 0.87, y0: 0.84, top: 2.00, n: 2.4 },
    { z: -0.42, w: 0.79, y0: 0.84, top: 1.89, n: 2.6 },   // waist
    { z:  0.22, w: 0.80, y0: 0.84, top: 1.93, n: 2.6 },
    { z:  0.74, w: 0.84, y0: 0.84, top: 2.16, n: 2.7 },   // shoulder
    /* The last two stations square up (n 3.6, 4.2) and flatten their spring line. A rounded
       crown here left the head sitting on a curve and opened a gap under its outer edges;
       the neck platform has to be flat enough to actually carry it. */
    { z:  1.06, w: 0.80, y0: 0.84, top: 2.32, n: 3.6, spring: 0.55 },
    { z:  1.26, w: 0.70, y0: 0.84, top: 2.36, n: 4.2, spring: 0.60 },   // chest front
  ], { arc: 9, rng: R, wobble: 0.035, capBack: true, capFront: true }));
  for (const sx of [-1, 1]) {
    bag.add('lime', chunkAt(sx * 0.32, sx * 0.92, 0.84, 1.45, -2.30, -1.35, { rng: R, jitter: 0.02, round: 0.12, c: 0.08 }));
    /* forelegs run right out to the front of the plinth — the classic sphinx read */
    bag.add('lime', chunkAt(sx * 0.30, sx * 0.86, 0.84, 1.42, 0.55, 2.18, { rng: R, jitter: 0.02, taper: 0.08, c: 0.07 }));
    bag.add('lime', chunkAt(sx * 0.26, sx * 0.92, 0.84, 1.20, 1.92, 2.34, { rng: R, jitter: 0.015, round: 0.08 }));
    for (let i = 0; i < 3; i++) {
      bag.add('lime', chunkAt(sx * 0.30 + i * sx * 0.19, sx * 0.44 + i * sx * 0.19, 0.84, 1.02, 2.20, 2.40, { rng: R, jitter: 0.008 }));
    }
  }
  /* tail curling around the right haunch */
  for (let i = 0; i < 4; i++) {
    bag.add('lime', place(chunk(0.42, 0.16, 0.16, { rng: R, jitter: 0.01 }),
      { x: 0.72 + Math.sin(i * 0.9) * 0.24, y: 1.0 + i * 0.12, z: -1.95 + i * 0.34, ry: D(30 + i * 22) }));
  }

  /* head — oversized on purpose */
  const CHIN = 2.34, BROW = 3.02, TOP = 3.44;
  bag.add('lime', chunkAt(-0.50, 0.50, CHIN, 3.10, -0.15, 1.25, { rng: R, jitter: 0.015, round: 0.14, c: 0.11 }));
  carveFace(bag, { w: 1.0, h: 0.80, y0: CHIN, z: 1.24, rng: R, brows: false });
  nemes(bag, { w: 1.02, browY: BROW, topY: TOP, faceZ: 1.28, backZ: -0.30, rng: R, lappetDrop: 1.30 });
  uraeus(bag, { s: 0.7, y: BROW - 0.02, z: 1.34, rng: R });
  bag.add('lime', place(chunk(0.26, 0.62, 0.24, { rng: R, jitter: 0.008, taper: -0.06 }), { y: CHIN - 0.24, z: 1.16, rx: D(8) }));

  bag.height = TOP + 0.2;
  if (s !== 1) bag.transform({ sx: s, sy: s, sz: s });
  return bag;
}

/* ============================ anubis =================================== */

/** Seated jackal. Ears and snout do all the work; everything else is a vertical. */
export function anubis(opts = {}) {
  const { rng, s = 1 } = opts;
  const bag = new Bag();
  const R = rng;

  bag.add('dark', chunkAt(-0.85, 0.85, 0, 1.20, -1.05, 1.05, { rng: R, jitter: 0.02, chip: 0.10, c: 0.06 }));
  bag.add('dark', chunkAt(-0.92, 0.92, 1.14, 1.34, -1.12, 1.12, { rng: R, jitter: 0.015 }));

  /* haunches and folded hind legs */
  bag.add('dark', chunkAt(-0.62, 0.62, 1.34, 2.10, -0.95, 0.05, { rng: R, jitter: 0.02, round: 0.16, c: 0.08 }));
  for (const sx of [-1, 1]) {
    bag.add('dark', chunkAt(sx * 0.34, sx * 0.72, 1.34, 1.86, -0.85, 0.35, { rng: R, jitter: 0.015, round: 0.12 }));
    /* straight front legs — the upright, alert line */
    bag.add('dark', chunkAt(sx * 0.20, sx * 0.52, 1.34, 2.86, 0.30, 0.72, { rng: R, jitter: 0.012, taper: 0.05 }));
    bag.add('dark', chunkAt(sx * 0.16, sx * 0.58, 1.34, 1.56, 0.52, 1.12, { rng: R, jitter: 0.01 }));
    for (let i = 0; i < 3; i++) {
      bag.add('dark', chunkAt(sx * 0.18 + i * sx * 0.13, sx * 0.28 + i * sx * 0.13, 1.34, 1.46, 1.00, 1.16, { rng: R, jitter: 0.006 }));
    }
  }
  /* torso: a straight sloping back, chest thrown forward */
  bag.add('dark', chunkAt(-0.52, 0.52, 2.00, 3.10, -0.45, 0.66, { rng: R, jitter: 0.018, taper: 0.12, c: 0.07 }));
  bag.add('dark', chunkAt(-0.36, 0.36, 2.95, 3.42, -0.28, 0.42, { rng: R, jitter: 0.014 }));

  /* head + snout */
  bag.add('dark', chunkAt(-0.36, 0.36, 3.30, 3.78, -0.38, 0.34, { rng: R, jitter: 0.014, round: 0.06, c: 0.05 }));
  const snout = chunk(0.30, 0.30, 1.00, { rng: R, jitter: 0.01, taper: 0.06, c: 0.04 });
  place(snout, { y: 3.44, z: 0.74, rx: D(-7) });
  bag.add('dark', snout);
  bag.add('paintDark', place(chunk(0.20, 0.16, 0.12, { rng: R, jitter: 0.006 }), { y: 3.46, z: 1.24 }));
  /* ears: tall, tapered, tipped back a few degrees so they are not parallel */
  for (const sx of [-1, 1]) {
    const ear = chunk(0.24, 0.86, 0.34, { rng: R, jitter: 0.008, taper: 0.14, c: 0.035 });
    place(ear, { x: sx * 0.26, y: 4.12, z: -0.06, rz: sx * D(9), rx: D(-6) });
    bag.add('dark', ear);
    bag.add('gold', place(chunk(0.13, 0.62, 0.10, { rng: R, jitter: 0.005, taper: 0.08 }),
      { x: sx * 0.26, y: 4.10, z: 0.14, rz: sx * D(9) }));
    bag.add('gold', place(chunk(0.10, 0.09, 0.09, { rng: R, jitter: 0.004 }), { x: sx * 0.20, y: 3.62, z: 0.30 }));   // eye
    bag.add('carnelian', place(chunk(0.05, 0.05, 0.05, { rng: R, jitter: 0.002 }), { x: sx * 0.20, y: 3.62, z: 0.36 }));
  }
  /* gold collar and a chest pendant */
  for (let i = 0; i < 2; i++) {
    bag.add('gold', chunkAt(-0.42, 0.42, 3.02 - i * 0.17, 3.14 - i * 0.17, -0.34, 0.56, { rng: R, jitter: 0.006 }));
  }
  bag.add('lapis', chunkAt(-0.14, 0.14, 2.74, 2.98, 0.52, 0.62, { rng: R, jitter: 0.005 }));
  /* tail down the flank */
  for (let i = 0; i < 4; i++) {
    bag.add('dark', place(chunk(0.30, 0.15, 0.15, { rng: R, jitter: 0.008 }),
      { x: 0.55, y: 1.9 - i * 0.16, z: -0.75 - i * 0.22, rz: D(20), ry: D(12 * i) }));
  }

  bag.height = 4.55;
  if (s !== 1) bag.transform({ sx: s, sy: s, sz: s });
  return bag;
}

/* ============================== Ra ==================================== */

/**
 * Falcon-headed Ra, gilded. The vault's hero read: a tall gold column with a hard silhouette
 * — beak, sun disc, sceptre — standing where the torchlight can rake it.
 */
export function falconRa(opts = {}) {
  const { rng, s = 1 } = opts;
  const bag = new Bag();
  const R = rng;

  bag.add('dark', chunkAt(-1.00, 1.00, 0, 0.52, -0.90, 0.90, { rng: R, jitter: 0.02, chip: 0.08 }));
  bag.add('dark', chunkAt(-0.56, 0.56, 0.52, 4.30, -0.70, -0.30, { rng: R, jitter: 0.02, taper: 0.10 }));   // back pillar

  /* striding legs: left advanced, and the kilt above them */
  for (const [sx, adv] of [[-1, 0.34], [1, -0.02]]) {
    bag.add('gold', chunkAt(sx * 0.10, sx * 0.56, 0.52, 2.10, -0.30 + adv, 0.26 + adv, { rng: R, jitter: 0.014, taper: 0.10 }));
    bag.add('gold', chunkAt(sx * 0.08, sx * 0.60, 0.52, 0.76, 0.10 + adv, 0.62 + adv, { rng: R, jitter: 0.01 }));
    for (let i = 0; i < 3; i++) {
      bag.add('gold', chunkAt(sx * 0.12 + i * sx * 0.15, sx * 0.24 + i * sx * 0.15, 0.52, 0.66, 0.54 + adv, 0.68 + adv, { rng: R, jitter: 0.005 }));
    }
  }
  bag.add('gold', chunkAt(-0.64, 0.64, 1.96, 2.72, -0.44, 0.50, { rng: R, jitter: 0.015, taper: 0.24, c: 0.05 }));
  bag.add('gold', place(wedge(0.46, 0.70, 0.16, { rng: R, tipY: 1, tipW: 0.25 }), { y: 2.28, z: 0.54 }));   // kilt apron
  bag.add('lapis', chunkAt(-0.66, 0.66, 2.62, 2.76, -0.46, 0.52, { rng: R, jitter: 0.008 }));               // belt

  /* torso and shoulders */
  bag.add('gold', chunkAt(-0.60, 0.60, 2.68, 3.56, -0.42, 0.46, { rng: R, jitter: 0.015, taper: -0.26, c: 0.06 }));
  bag.add('gold', chunkAt(-0.88, 0.88, 3.44, 3.80, -0.44, 0.44, { rng: R, jitter: 0.012, round: 0.08, c: 0.07 }));
  for (const sx of [-1, 1]) {
    bag.add('gold', chunkAt(sx * 0.60, sx * 0.90, 2.44, 3.58, -0.24, 0.24, { rng: R, jitter: 0.012, taper: 0.06 }));
    bag.add('gold', chunkAt(sx * 0.56, sx * 0.94, 2.26, 2.52, -0.26, 0.30, { rng: R, jitter: 0.01, round: 0.06 }));   // fist
  }

  /* was-sceptre in the right hand, ankh in the left */
  bag.add('gold', chunkAt(0.68, 0.82, 0.52, 3.95, 0.02, 0.16, { rng: R, jitter: 0.008 }));
  bag.add('gold', place(wedge(0.30, 0.34, 0.30, { rng: R, tipW: 0.3 }), { x: 0.75, y: 4.06, z: 0.16, rx: D(20) }));
  bag.add('gold', chunkAt(0.62, 0.76, 0.52, 0.90, -0.24, 0.04, { rng: R, jitter: 0.006, taper: 0.06 }));
  const loop = new THREE.TorusGeometry(0.17, 0.05, 4, 12);
  place(loop, { x: -0.75, y: 2.58, z: 0.16 });
  bag.add('gold', boxProjectUVs(loop));
  bag.add('gold', chunkAt(-0.98, -0.52, 2.30, 2.42, 0.10, 0.22, { rng: R, jitter: 0.006 }));
  bag.add('gold', chunkAt(-0.81, -0.69, 2.02, 2.36, 0.10, 0.22, { rng: R, jitter: 0.006 }));

  /* falcon head */
  const CHIN = 3.74;
  bag.add('gold', chunkAt(-0.30, 0.30, 3.66, 3.86, -0.30, 0.32, { rng: R, jitter: 0.01 }));                 // neck
  bag.add('gold', chunkAt(-0.40, 0.40, CHIN, 4.42, -0.38, 0.40, { rng: R, jitter: 0.014, round: 0.12, c: 0.05 }));
  /* beak: two wedges, the upper one hooked down over the lower */
  bag.add('gold', place(wedge(0.22, 0.34, 0.42, { rng: R, tipW: 0.35, tipZ: -0.06 }), { y: 4.06, z: 0.52, rx: D(74) }));
  bag.add('dark', place(chunk(0.14, 0.10, 0.16, { rng: R, jitter: 0.005 }), { y: 3.96, z: 0.58, rx: D(14) }));
  for (const sx of [-1, 1]) {
    bag.add('dark', place(chunk(0.16, 0.16, 0.10, { rng: R, jitter: 0.006 }), { x: sx * 0.30, y: 4.14, z: 0.34 }));
    bag.add('carnelian', place(chunk(0.09, 0.09, 0.07, { rng: R, jitter: 0.004 }), { x: sx * 0.30, y: 4.14, z: 0.40 }));
    /* the falcon's cheek stripe, straight down from the eye */
    bag.add('dark', place(chunk(0.10, 0.30, 0.08, { rng: R, jitter: 0.004 }), { x: sx * 0.30, y: 3.90, z: 0.36 }));
  }
  /* stepped feather collar at the base of the head */
  for (let i = 0; i < 3; i++) {
    bag.add(i % 2 ? 'turquoise' : 'gold', chunkAt(-0.44 - i * 0.03, 0.44 + i * 0.03, 3.62 - i * 0.11, 3.72 - i * 0.11, -0.40, 0.42, { rng: R, jitter: 0.006 }));
  }

  /* sun disc + cobra: the brightest single shape in the tomb */
  const disc = new THREE.CylinderGeometry(0.44, 0.44, 0.16, 16, 1);
  place(disc, { y: 4.86, z: 0.02, rx: Math.PI / 2 });
  bag.add('gold', boxProjectUVs(disc));
  const discIn = new THREE.CylinderGeometry(0.33, 0.33, 0.06, 14, 1);
  place(discIn, { y: 4.86, z: 0.11, rx: Math.PI / 2 });
  bag.add('carnelian', boxProjectUVs(discIn));
  uraeus(bag, { s: 0.9, y: 4.40, z: 0.34, rng: R });

  const col = collar({ r: 0.66, rows: 3, arc: Math.PI * 1.3, rng: R, keys: ['gold', 'lapis', 'turquoise'] });
  col.transform({ y: 3.46, z: 0.44, rx: D(-8), sz: 0.55 });
  bag.absorb(col);

  bag.height = 5.05;
  if (s !== 1) bag.transform({ sx: s, sy: s, sz: s });
  return bag;
}

/* ======================= coffin lid / fragments ======================== */

/**
 * An anthropoid coffin lid, gilded, propped against something. Local y = 0 at the foot,
 * +Y toward the head, face on +Z.
 */
export function coffinLid(opts = {}) {
  const { rng, len = 3.1 } = opts;
  const bag = new Bag();
  const R = rng;
  const L = len / 3.1;   // everything below is authored at 3.1 m

  /* Mummiform body: cross-slabs of drifting width so the profile swells at the shoulders. */
  const rows = [
    [0.00, 0.30, 0.16], [0.14, 0.38, 0.22], [0.40, 0.44, 0.26], [0.80, 0.48, 0.28],
    [1.20, 0.52, 0.30], [1.55, 0.58, 0.31], [1.90, 0.62, 0.32], [2.20, 0.60, 0.30],
    [2.45, 0.52, 0.28],
  ];
  for (let i = 0; i < rows.length - 1; i++) {
    const [y0, w0, d0] = rows[i], [y1, w1] = rows[i + 1];
    const g = chunk((w0 + w1) * L, (y1 - y0) * L + 0.03, d0 * 2 * L, { rng: R, jitter: 0.012, round: 0.06, taper: (w0 - w1) * L, c: 0.05 * L });
    place(g, { y: (y0 + y1) * 0.5 * L, z: 0 });
    bag.add('goldWorn', g);
  }
  /* head: face, nemes and beard, at the scale of a coffin mask */
  const CHIN = 2.44 * L, BROW = 2.86 * L, TOP = 3.06 * L;
  bag.add('gold', chunkAt(-0.34 * L, 0.34 * L, CHIN, BROW + 0.06 * L, -0.30 * L, 0.34 * L, { rng: R, jitter: 0.01, round: 0.06 }));
  carveFace(bag, { w: 0.68 * L, h: 0.50 * L, y0: CHIN, z: 0.34 * L, rng: R, gold: true, brows: false });
  nemes(bag, { w: 0.70 * L, browY: BROW, topY: TOP, faceZ: 0.36 * L, backZ: -0.32 * L, rng: R, lappetDrop: 0.80 * L, crownKey: 'gold' });
  uraeus(bag, { s: 0.5 * L, y: BROW - 0.02 * L, z: 0.40 * L, rng: R });
  bag.add('gold', place(chunk(0.18 * L, 0.42 * L, 0.16 * L, { rng: R, jitter: 0.006, taper: -0.04 }), { y: CHIN - 0.20 * L, z: 0.30 * L, rx: D(8) }));

  const col = collar({ r: 0.55 * L, rows: 4, arc: Math.PI * 1.3, rng: R, keys: ['gold', 'lapis', 'carnelian', 'turquoise'] });
  col.transform({ y: 2.28 * L, z: 0.30 * L, rx: D(-6), sz: 0.5 });
  bag.absorb(col);

  /* crossed arms with crook and flail */
  for (const sx of [-1, 1]) {
    bag.add('gold', place(chunk(0.62 * L, 0.13 * L, 0.14 * L, { rng: R, jitter: 0.006 }),
      { x: sx * 0.10 * L, y: (1.96 - sx * 0.08) * L, z: 0.30 * L, rz: sx * D(14) }));
  }
  bag.add('lapis', chunkAt(-0.09 * L, 0.09 * L, 1.72 * L, 2.06 * L, 0.30 * L, 0.38 * L, { rng: R, jitter: 0.005 }));
  bag.add('lapis', chunkAt(-0.30 * L, -0.12 * L, 1.74 * L, 2.04 * L, 0.30 * L, 0.38 * L, { rng: R, jitter: 0.005 }));

  /* hieroglyph band down the front, blue on gold */
  for (let i = 0; i < 6; i++) {
    bag.add('lapis', chunkAt(-0.10 * L, 0.10 * L, (0.28 + i * 0.24) * L, (0.44 + i * 0.24) * L, 0.24 * L, 0.32 * L, { rng: R, jitter: 0.006 }));
  }
  bag.height = TOP;
  return bag;
}

/**
 * A colossal head, broken off and half sunk in the sand. Pure storytelling: it tells you
 * the complex is older than whoever is guarding it.
 */
export function fallenHead(opts = {}) {
  const { rng, s = 1.5 } = opts;
  const bag = new Bag();
  const R = rng;
  const CHIN = 0, BROW = 1.42, TOP = 2.02;
  bag.add('stone', chunkAt(-0.82, 0.82, CHIN, 1.62, -0.72, 0.86, { rng: R, jitter: 0.03, round: 0.14, chip: 0.22, c: 0.10 }));
  bag.add('stone', chunkAt(-0.66, 0.66, CHIN - 0.10, CHIN + 0.44, -0.55, 0.80, { rng: R, jitter: 0.02, round: 0.10, c: 0.08 }));
  carveFace(bag, { w: 1.6, h: 1.55, y0: CHIN, z: 0.84, rng: R });
  nemes(bag, { w: 1.65, browY: BROW, topY: TOP, faceZ: 0.86, backZ: -0.95, rng: R, lappetDrop: 1.5 });
  /* the break: a ragged stump where the neck was */
  for (let i = 0; i < 6; i++) {
    bag.add('stone', place(chunk(R.range(0.3, 0.7), 0.22, R.range(0.3, 0.6), { rng: R, jitter: 0.06, chip: 0.16 }),
      { x: R.jitter(0.6), y: CHIN - 0.12, z: R.jitter(0.5), ry: R.range(0, 3) }));
  }
  if (s !== 1) bag.transform({ sx: s, sy: s, sz: s });
  return bag;
}

/** A broken statue: legs and a plinth, snapped off at the knee. Ruin note, cheap. */
export function brokenStatue(opts = {}) {
  const { rng, h = 2.4 } = opts;
  const bag = new Bag();
  const R = rng;
  bag.add('stone', chunkAt(-0.9, 0.9, 0, 0.4, -0.7, 0.7, { rng: R, jitter: 0.03, chip: 0.2 }));
  for (const sx of [-1, 1]) {
    bag.add('stone', chunkAt(sx * 0.10, sx * 0.62, 0.36, h * (sx > 0 ? 0.62 : 0.46), -0.34, 0.34, { rng: R, jitter: 0.03, chip: 0.22, taper: 0.08 }));
    bag.add('stone', chunkAt(sx * 0.06, sx * 0.68, 0.36, 0.60, 0.20, 0.78, { rng: R, jitter: 0.02 }));
  }
  bag.add('stone', chunkAt(-0.5, 0.5, 0.36, h * 0.36, -0.44, -0.10, { rng: R, jitter: 0.03, chip: 0.2 }));
  return bag;
}
