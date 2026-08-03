/**
 * Hieroglyphs — a real vector glyph library, plus the register/quadrat layout engine that
 * arranges it the way an Egyptian scribe would.
 *
 * Why this file exists at all: random squiggles read as fake instantly, and a wall of glyphs is
 * the single most Egyptian surface in the game. So every sign below is an actual Gardiner sign
 * drawn from its real silhouette, each carries the *conventional* paint colour Egyptian painters
 * used for it (red men, yellow women, blue water and sky, green plants, white linen, black hair),
 * and the layout packs signs into **quadrats** — the square-ish groups real inscriptions use —
 * rather than spacing them evenly like a font.
 *
 * Contract with the recipes
 * -------------------------
 * Every layout function is called three times with a different `mode`, and the three passes
 * become three different buffers in Materials.js:
 *   'cut'   — silhouettes, filled white → the sunk-relief depth mask
 *   'line'  — incised interior detail and register rules → extra depth, the hard chisel lines
 *   'paint' — the same silhouettes in their conventional pigment → paint-remnant colour
 * Drawing happens in canvas space (y down). `rasterMask` flips rows on readback, so glyphs are
 * authored the way they read on the wall.
 *
 * Glyph space: each sign draws inside [0,g.w] × [0,g.h] with y = 0 at the sign's top. `h < 1`
 * marks the flat signs (water, bread, basket) that stack two or three to a quadrat.
 */

import { rng } from '../core/Rand.js';
import { PAL, css, TAU, clamp } from './Canvas2D.js';

/* ------------------------------------------------------------------------- */
/*  path primitives (unit space)                                             */
/* ------------------------------------------------------------------------- */

function ell(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, 0, TAU); ctx.fill();
}
function circ(ctx, cx, cy, r) { ell(ctx, cx, cy, r, r); }

function poly(ctx, pts, close = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
  ctx.fill();
}

/** Tapered limb / stem / stalk — the shape most of the animal signs are built from. */
function taper(ctx, x0, y0, x1, y1, w0, w1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / l, ny = dx / l;
  poly(ctx, [
    [x0 + nx * w0 * 0.5, y0 + ny * w0 * 0.5],
    [x1 + nx * w1 * 0.5, y1 + ny * w1 * 0.5],
    [x1 - nx * w1 * 0.5, y1 - ny * w1 * 0.5],
    [x0 - nx * w0 * 0.5, y0 - ny * w0 * 0.5],
  ]);
}

/** Thick curved band (cobra bodies, ropes, brows). */
function band(ctx, pts, w) {
  ctx.save();
  ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.stroke();
  ctx.restore();
}

function rect(ctx, x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); }

function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath(); ctx.fill();
}

function line(ctx, pts, w) {
  ctx.save();
  ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}

/** Five-pointed star — the Egyptian ceiling star, also sign N14. Exported for ceiling_stars. */
export function star5(ctx, cx, cy, r, rot = -Math.PI / 2, inner = 0.42) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}

/* ------------------------------------------------------------------------- */
/*  the glyph library                                                        */
/* ------------------------------------------------------------------------- */

const G = (w, h, paint, s, d) => ({ w, h, paint, s, d });

/**
 * Paint conventions follow Egyptian practice, which is what makes a painted wall read as Egyptian
 * rather than as a colour-randomised one.
 */
export const GLYPHS = {
  /* --- S34 ankh, "life" ------------------------------------------------- */
  ankh: G(0.60, 1.0, PAL.turquoise, (c) => {
    c.save();
    // loop: ring drawn as an outer ellipse minus an inner one
    c.beginPath();
    c.ellipse(0.30, 0.215, 0.185, 0.215, 0, 0, TAU);
    c.ellipse(0.30, 0.215, 0.095, 0.115, 0, 0, TAU);
    c.fill('evenodd');
    c.restore();
    rect(c, 0.0, 0.44, 0.60, 0.095);      // crossbar
    rect(c, 0.245, 0.40, 0.11, 0.60);     // stem
  }),

  /* --- D10 wedjat, eye of Horus ---------------------------------------- */
  wedjat: G(1.30, 0.78, PAL.black, (c) => {
    // brow
    band(c, [[0.10, 0.20], [0.45, 0.06], [0.90, 0.10]], 0.10);
    // eye: almond
    c.beginPath();
    c.moveTo(0.06, 0.42);
    c.bezierCurveTo(0.30, 0.24, 0.72, 0.24, 1.00, 0.40);
    c.bezierCurveTo(0.74, 0.56, 0.32, 0.58, 0.06, 0.42);
    c.closePath(); c.fill();
    // teardrop marking below the inner corner
    poly(c, [[0.30, 0.50], [0.40, 0.50], [0.30, 0.78], [0.24, 0.72]]);
    // curled tail from the outer corner
    band(c, [[0.62, 0.54], [0.72, 0.70], [0.94, 0.74], [1.00, 0.62]], 0.085);
  }, (c) => {
    circ(c, 0.53, 0.40, 0.085);           // pupil, cut deeper
    line(c, [[0.14, 0.26], [0.46, 0.13]], 0.028);
  }),

  /* --- L1 scarab -------------------------------------------------------- */
  scarab: G(0.78, 1.0, PAL.lapis, (c) => {
    for (let s = -1; s <= 1; s += 2) {          // legs first, under the body
      taper(c, 0.39 + s * 0.16, 0.34, 0.39 + s * 0.40, 0.20, 0.075, 0.035);
      taper(c, 0.39 + s * 0.17, 0.55, 0.39 + s * 0.40, 0.58, 0.075, 0.035);
      taper(c, 0.39 + s * 0.16, 0.72, 0.39 + s * 0.38, 0.92, 0.075, 0.035);
    }
    ell(c, 0.39, 0.62, 0.235, 0.315);           // elytra
    ell(c, 0.39, 0.315, 0.20, 0.135);           // pronotum
    poly(c, [[0.22, 0.20], [0.56, 0.20], [0.50, 0.06], [0.28, 0.06]]);  // clypeus
  }, (c) => {
    line(c, [[0.39, 0.36], [0.39, 0.90]], 0.030);
    line(c, [[0.22, 0.20], [0.56, 0.20]], 0.026);
  }),

  /* --- G5 falcon (Horus) ------------------------------------------------ */
  falcon: G(0.86, 1.0, PAL.black, (c) => {
    taper(c, 0.40, 0.72, 0.38, 0.96, 0.055, 0.05);   // legs
    taper(c, 0.52, 0.72, 0.55, 0.96, 0.055, 0.05);
    poly(c, [[0.36, 0.94], [0.16, 0.99], [0.40, 0.99]]);
    poly(c, [[0.53, 0.94], [0.33, 0.99], [0.57, 0.99]]);
    // body: leaning oval, breast to the left
    c.beginPath();
    c.moveTo(0.22, 0.50);
    c.bezierCurveTo(0.20, 0.26, 0.44, 0.18, 0.54, 0.28);
    c.bezierCurveTo(0.68, 0.42, 0.72, 0.62, 0.60, 0.74);
    c.bezierCurveTo(0.44, 0.84, 0.24, 0.72, 0.22, 0.50);
    c.closePath(); c.fill();
    poly(c, [[0.62, 0.42], [0.86, 0.60], [0.84, 0.74], [0.60, 0.68]]);   // tail
    circ(c, 0.30, 0.145, 0.105);                                          // head
    poly(c, [[0.20, 0.13], [0.06, 0.19], [0.21, 0.22]]);                  // hooked beak
  }, (c) => {
    line(c, [[0.34, 0.34], [0.60, 0.62]], 0.026);   // wing coverts
    line(c, [[0.30, 0.44], [0.56, 0.70]], 0.026);
    line(c, [[0.64, 0.48], [0.84, 0.64]], 0.024);
    circ(c, 0.27, 0.13, 0.030);
  }),

  /* --- A1 seated man ---------------------------------------------------- */
  seated: G(0.80, 1.0, PAL.red, (c) => {
    circ(c, 0.30, 0.145, 0.115);                                    // head
    poly(c, [[0.20, 0.10], [0.09, 0.16], [0.21, 0.20]]);            // face
    poly(c, [[0.34, 0.05], [0.47, 0.10], [0.44, 0.32], [0.32, 0.26]]); // wig
    poly(c, [[0.24, 0.24], [0.46, 0.26], [0.56, 0.66], [0.34, 0.66]]); // torso, leaning back
    taper(c, 0.30, 0.32, 0.10, 0.56, 0.10, 0.06);                    // arm to knee
    poly(c, [[0.30, 0.62], [0.60, 0.62], [0.62, 0.80], [0.06, 0.82], [0.06, 0.70]]); // thigh + shin
    poly(c, [[0.06, 0.80], [0.62, 0.80], [0.62, 0.94], [0.30, 0.96], [0.04, 0.90]]);
  }, (c) => {
    line(c, [[0.30, 0.62], [0.58, 0.64]], 0.026);
    line(c, [[0.26, 0.30], [0.48, 0.32]], 0.024);   // collar
  }),

  /* --- G17 owl, "m" ----------------------------------------------------- */
  owl: G(0.62, 1.0, PAL.black, (c) => {
    taper(c, 0.30, 0.76, 0.28, 0.96, 0.05, 0.045);
    poly(c, [[0.26, 0.94], [0.10, 0.99], [0.32, 0.99]]);
    c.beginPath();                                   // body in profile
    c.moveTo(0.18, 0.46);
    c.bezierCurveTo(0.18, 0.30, 0.46, 0.28, 0.50, 0.44);
    c.bezierCurveTo(0.56, 0.62, 0.48, 0.80, 0.34, 0.82);
    c.bezierCurveTo(0.20, 0.80, 0.16, 0.62, 0.18, 0.46);
    c.closePath(); c.fill();
    poly(c, [[0.46, 0.56], [0.62, 0.74], [0.56, 0.82], [0.44, 0.74]]);  // tail
    // frontal facial disc with ear tufts — the sign's tell
    rrect(c, 0.12, 0.06, 0.40, 0.30, 0.11);
    poly(c, [[0.12, 0.14], [0.06, 0.02], [0.22, 0.08]]);
    poly(c, [[0.52, 0.14], [0.58, 0.02], [0.42, 0.08]]);
  }, (c) => {
    line(c, [[0.32, 0.12], [0.32, 0.30]], 0.026);
    circ(c, 0.22, 0.19, 0.028); circ(c, 0.42, 0.19, 0.028);
  }),

  /* --- M17 reed, "i" ---------------------------------------------------- */
  reed: G(0.30, 1.0, PAL.malachite, (c) => {
    taper(c, 0.15, 0.28, 0.15, 1.0, 0.075, 0.05);
    poly(c, [[0.15, 0.30], [0.00, 0.10], [0.13, 0.20]]);
    poly(c, [[0.15, 0.30], [0.30, 0.08], [0.17, 0.20]]);
    taper(c, 0.15, 0.26, 0.15, 0.0, 0.045, 0.02);
  }),

  /* --- N35 water ripple, "n" -------------------------------------------- */
  water: G(0.95, 0.24, PAL.lapis, (c) => {
    band(c, [[0.03, 0.18], [0.18, 0.05], [0.33, 0.19], [0.48, 0.05],
             [0.63, 0.19], [0.78, 0.05], [0.92, 0.18]], 0.105);
  }),

  /* --- D21 mouth, "r" --------------------------------------------------- */
  mouth: G(0.90, 0.26, PAL.red, (c) => {
    c.beginPath();
    c.moveTo(0.02, 0.13);
    c.bezierCurveTo(0.28, -0.04, 0.62, -0.04, 0.88, 0.13);
    c.bezierCurveTo(0.62, 0.30, 0.28, 0.30, 0.02, 0.13);
    c.closePath(); c.fill();
  }),

  /* --- G43 quail chick, "w" --------------------------------------------- */
  quail: G(0.62, 0.78, PAL.ochre, (c) => {
    taper(c, 0.32, 0.60, 0.30, 0.76, 0.045, 0.04);
    poly(c, [[0.28, 0.74], [0.14, 0.78], [0.34, 0.78]]);
    ell(c, 0.34, 0.44, 0.19, 0.17);
    poly(c, [[0.46, 0.36], [0.62, 0.44], [0.58, 0.56], [0.44, 0.50]]);   // tail up
    circ(c, 0.20, 0.24, 0.105);
    poly(c, [[0.12, 0.22], [0.00, 0.27], [0.13, 0.30]]);
    taper(c, 0.22, 0.32, 0.28, 0.42, 0.09, 0.12);                         // neck
  }, (c) => { circ(c, 0.17, 0.22, 0.026); }),

  /* --- H6 feather (maat) ------------------------------------------------ */
  feather: G(0.40, 1.0, PAL.malachite, (c) => {
    c.beginPath();
    c.moveTo(0.20, 1.0);
    c.bezierCurveTo(0.02, 0.62, 0.02, 0.20, 0.20, 0.02);
    c.bezierCurveTo(0.40, 0.20, 0.40, 0.62, 0.24, 1.0);
    c.closePath(); c.fill();
  }, (c) => {
    line(c, [[0.21, 0.98], [0.20, 0.06]], 0.028);
    for (let i = 0; i < 7; i++) {
      const t = 0.14 + i * 0.115;
      const w = 0.16 * Math.sin(Math.PI * (1 - t) * 0.9);
      line(c, [[0.20 - w, t + 0.05], [0.20, t]], 0.020);
      line(c, [[0.21 + w, t + 0.05], [0.21, t]], 0.020);
    }
  }),

  /* --- R11 djed pillar -------------------------------------------------- */
  djed: G(0.46, 1.0, PAL.turquoise, (c) => {
    taper(c, 0.23, 0.34, 0.23, 0.88, 0.13, 0.15);
    rect(c, 0.06, 0.88, 0.34, 0.11);
    for (let i = 0; i < 4; i++) rect(c, 0.02, 0.06 + i * 0.075, 0.42, 0.048);
    rect(c, 0.17, 0.02, 0.12, 0.34);
  }),

  /* --- S40 was sceptre -------------------------------------------------- */
  was: G(0.40, 1.0, PAL.turquoise, (c) => {
    taper(c, 0.20, 0.20, 0.20, 0.86, 0.075, 0.075);
    poly(c, [[0.06, 0.02], [0.30, 0.05], [0.30, 0.20], [0.14, 0.20]]);   // canine head
    poly(c, [[0.24, 0.02], [0.34, 0.00], [0.31, 0.10]]);                  // ear
    poly(c, [[0.20, 0.84], [0.04, 1.0], [0.14, 1.0], [0.24, 0.90]]);      // forked foot
    poly(c, [[0.20, 0.84], [0.36, 1.0], [0.26, 1.0], [0.17, 0.90]]);
  }),

  /* --- N5 sun disc, "ra" ------------------------------------------------ */
  sun: G(0.86, 0.86, PAL.red, (c) => { circ(c, 0.43, 0.43, 0.41); },
    (c) => { circ(c, 0.43, 0.43, 0.085); }),

  /* --- M12 lotus / blue water lily -------------------------------------- */
  lotus: G(0.62, 1.0, PAL.lapis, (c) => {
    band(c, [[0.30, 1.0], [0.26, 0.76], [0.31, 0.56]], 0.06);   // stem
    poly(c, [[0.31, 0.56], [0.02, 0.30], [0.16, 0.50]]);         // outer petals
    poly(c, [[0.31, 0.56], [0.60, 0.30], [0.46, 0.50]]);
    poly(c, [[0.31, 0.56], [0.20, 0.06], [0.31, 0.30], [0.42, 0.06]]);
    ell(c, 0.31, 0.55, 0.13, 0.10);
  }),

  /* --- I10 cobra, "dj" -------------------------------------------------- */
  cobra: G(0.95, 0.62, PAL.malachite, (c) => {
    band(c, [[0.92, 0.58], [0.66, 0.52], [0.46, 0.58], [0.30, 0.44], [0.30, 0.24]], 0.10);
    poly(c, [[0.18, 0.26], [0.42, 0.26], [0.36, 0.06], [0.24, 0.06]]);   // hood
    circ(c, 0.30, 0.10, 0.075);
    poly(c, [[0.24, 0.08], [0.10, 0.12], [0.24, 0.16]]);
  }),

  /* --- E16 recumbent jackal on a shrine (Anubis) ------------------------ */
  jackal: G(1.25, 0.82, PAL.black, (c) => {
    rect(c, 0.00, 0.66, 1.25, 0.16);                       // shrine
    poly(c, [[0.02, 0.66], [1.23, 0.66], [1.16, 0.56], [0.09, 0.56]]);
    c.beginPath();                                          // body
    c.moveTo(0.14, 0.56);
    c.bezierCurveTo(0.20, 0.34, 0.70, 0.36, 0.84, 0.46);
    c.lineTo(0.92, 0.56); c.closePath(); c.fill();
    taper(c, 0.84, 0.44, 0.94, 0.18, 0.13, 0.10);           // neck
    poly(c, [[0.86, 0.22], [1.16, 0.14], [1.18, 0.26], [0.90, 0.32]]);  // muzzle
    poly(c, [[0.88, 0.20], [0.90, 0.00], [1.00, 0.16]]);    // ears
    poly(c, [[0.99, 0.18], [1.03, 0.00], [1.10, 0.15]]);
    band(c, [[0.16, 0.52], [0.06, 0.42], [0.02, 0.24]], 0.055);  // tail
  }, (c) => { line(c, [[0.09, 0.62], [1.16, 0.62]], 0.024); circ(c, 0.98, 0.20, 0.024); }),

  /* --- D46 hand, "d" ---------------------------------------------------- */
  hand: G(0.92, 0.42, PAL.red, (c) => {
    poly(c, [[0.06, 0.10], [0.52, 0.06], [0.56, 0.26], [0.10, 0.30]]);   // palm
    for (let i = 0; i < 4; i++) rect(c, 0.52, 0.07 + i * 0.055, 0.40 - i * 0.03, 0.040);
    poly(c, [[0.14, 0.28], [0.40, 0.30], [0.34, 0.42], [0.12, 0.36]]);   // thumb
  }),

  /* --- V31 basket, "k" -------------------------------------------------- */
  basket: G(0.88, 0.34, PAL.malachite, (c) => {
    c.beginPath();
    c.moveTo(0.03, 0.06);
    c.lineTo(0.85, 0.06);
    c.bezierCurveTo(0.80, 0.34, 0.10, 0.34, 0.03, 0.06);
    c.closePath(); c.fill();
    rect(c, 0.03, 0.02, 0.16, 0.07);
  }),

  /* --- X1 bread loaf, "t" ----------------------------------------------- */
  bread: G(0.72, 0.34, PAL.white, (c) => {
    c.beginPath();
    c.moveTo(0.02, 0.32);
    c.bezierCurveTo(0.04, 0.02, 0.68, 0.02, 0.70, 0.32);
    c.closePath(); c.fill();
  }),

  /* --- S29 folded cloth, "s" -------------------------------------------- */
  cloth: G(0.34, 1.0, PAL.white, (c) => {
    taper(c, 0.17, 0.22, 0.17, 1.0, 0.085, 0.085);
    band(c, [[0.17, 0.24], [0.06, 0.10], [0.20, 0.04], [0.30, 0.12]], 0.065);
  }),

  /* --- G1 vulture, "a" -------------------------------------------------- */
  vulture: G(0.88, 1.0, PAL.black, (c) => {
    taper(c, 0.40, 0.76, 0.38, 0.96, 0.05, 0.045);
    poly(c, [[0.36, 0.94], [0.18, 0.99], [0.42, 0.99]]);
    taper(c, 0.54, 0.76, 0.57, 0.96, 0.05, 0.045);
    poly(c, [[0.54, 0.94], [0.36, 0.99], [0.60, 0.99]]);
    c.beginPath();                                     // hunched body
    c.moveTo(0.24, 0.56);
    c.bezierCurveTo(0.24, 0.30, 0.52, 0.24, 0.62, 0.36);
    c.bezierCurveTo(0.74, 0.52, 0.68, 0.72, 0.54, 0.80);
    c.bezierCurveTo(0.34, 0.84, 0.24, 0.74, 0.24, 0.56);
    c.closePath(); c.fill();
    poly(c, [[0.64, 0.46], [0.88, 0.62], [0.86, 0.76], [0.62, 0.70]]);
    band(c, [[0.34, 0.34], [0.24, 0.20], [0.30, 0.10]], 0.085);  // bare neck
    circ(c, 0.30, 0.10, 0.085);
    poly(c, [[0.24, 0.08], [0.10, 0.14], [0.25, 0.18]]);
  }, (c) => { line(c, [[0.36, 0.40], [0.62, 0.66]], 0.026); line(c, [[0.32, 0.50], [0.58, 0.74]], 0.026); }),

  /* --- Y1 papyrus scroll ------------------------------------------------ */
  scroll: G(0.92, 0.28, PAL.white, (c) => {
    rrect(c, 0.02, 0.06, 0.88, 0.17, 0.075);
    rect(c, 0.40, 0.02, 0.07, 0.25);                  // tie
  }, (c) => { line(c, [[0.10, 0.14], [0.34, 0.14]], 0.024); line(c, [[0.54, 0.14], [0.82, 0.14]], 0.024); }),

  /* --- R8 netjer, "god" ------------------------------------------------- */
  netjer: G(0.36, 1.0, PAL.turquoise, (c) => {
    taper(c, 0.18, 0.14, 0.18, 1.0, 0.075, 0.055);
    poly(c, [[0.10, 0.02], [0.36, 0.06], [0.34, 0.22], [0.10, 0.18]]);
  }),

  /* --- F35 nefer, "good/beautiful" -------------------------------------- */
  nefer: G(0.38, 1.0, PAL.malachite, (c) => {
    taper(c, 0.19, 0.06, 0.19, 0.62, 0.075, 0.075);
    for (let i = 0; i < 3; i++) rect(c, 0.06, 0.12 + i * 0.13, 0.26, 0.040);
    c.beginPath();
    c.moveTo(0.19, 1.0);
    c.bezierCurveTo(0.00, 0.86, 0.04, 0.58, 0.19, 0.58);
    c.bezierCurveTo(0.34, 0.58, 0.38, 0.86, 0.19, 1.0);
    c.closePath(); c.fill();
  }),

  /* --- D28 ka, upraised arms -------------------------------------------- */
  ka: G(0.70, 0.78, PAL.red, (c) => {
    rect(c, 0.08, 0.62, 0.54, 0.12);
    taper(c, 0.16, 0.66, 0.10, 0.10, 0.11, 0.085);
    taper(c, 0.54, 0.66, 0.60, 0.10, 0.11, 0.085);
    poly(c, [[0.04, 0.14], [0.16, 0.10], [0.18, 0.00], [0.06, 0.02]]);
    poly(c, [[0.66, 0.14], [0.54, 0.10], [0.52, 0.00], [0.64, 0.02]]);
  }),

  /* --- N37 pool, "sh" --------------------------------------------------- */
  pool: G(0.92, 0.30, PAL.lapis, (c) => { rect(c, 0.03, 0.05, 0.86, 0.20); },
    (c) => { for (let i = 0; i < 6; i++) line(c, [[0.13 + i * 0.13, 0.08], [0.13 + i * 0.13, 0.22]], 0.024); }),

  /* --- M23 sedge, "sw" (king of Upper Egypt) ---------------------------- */
  sedge: G(0.44, 1.0, PAL.malachite, (c) => {
    taper(c, 0.22, 0.30, 0.22, 1.0, 0.07, 0.05);
    poly(c, [[0.22, 0.30], [0.10, 0.02], [0.22, 0.16], [0.34, 0.02]]);
    band(c, [[0.20, 0.42], [0.04, 0.44], [0.00, 0.34]], 0.05);
    band(c, [[0.24, 0.42], [0.40, 0.44], [0.44, 0.34]], 0.05);
  }),

  /* --- L2 bee, "bit" (king of Lower Egypt) ------------------------------ */
  bee: G(0.80, 0.62, PAL.ochre, (c) => {
    ell(c, 0.46, 0.36, 0.24, 0.145);
    circ(c, 0.17, 0.30, 0.10);
    poly(c, [[0.10, 0.26], [0.00, 0.30], [0.11, 0.34]]);
    poly(c, [[0.30, 0.24], [0.62, 0.02], [0.68, 0.16], [0.40, 0.28]]);   // wings
    poly(c, [[0.32, 0.44], [0.62, 0.60], [0.68, 0.48], [0.42, 0.40]]);
    poly(c, [[0.68, 0.32], [0.80, 0.36], [0.68, 0.42]]);
  }, (c) => { for (let i = 0; i < 3; i++) line(c, [[0.40 + i * 0.11, 0.24], [0.40 + i * 0.11, 0.48]], 0.022); }),

  /* --- N14 star --------------------------------------------------------- */
  star: G(0.66, 0.66, PAL.goldMid, (c) => { star5(c, 0.33, 0.35, 0.32); }),

  /* --- D4 eye, "ir" ----------------------------------------------------- */
  eye: G(0.92, 0.34, PAL.black, (c) => {
    c.beginPath();
    c.moveTo(0.03, 0.19);
    c.bezierCurveTo(0.26, 0.02, 0.66, 0.02, 0.89, 0.17);
    c.bezierCurveTo(0.66, 0.32, 0.26, 0.34, 0.03, 0.19);
    c.closePath(); c.fill();
  }, (c) => { circ(c, 0.46, 0.18, 0.07); }),

  /* --- D36 forearm, "a" ------------------------------------------------- */
  arm: G(1.15, 0.32, PAL.red, (c) => {
    poly(c, [[0.02, 0.10], [0.78, 0.06], [0.80, 0.24], [0.04, 0.26]]);
    poly(c, [[0.76, 0.05], [1.13, 0.09], [1.12, 0.20], [0.78, 0.24]]);
  }),

  /* --- Z1 plural strokes ------------------------------------------------ */
  strokes: G(0.50, 0.56, PAL.red, (c) => {
    for (let i = 0; i < 3; i++) rect(c, 0.06 + i * 0.17, 0.04, 0.075, 0.50);
  }),

  /* --- X8 conical loaf, "di" -------------------------------------------- */
  cone: G(0.44, 0.50, PAL.white, (c) => { poly(c, [[0.22, 0.02], [0.42, 0.48], [0.02, 0.48]]); }),

  /* --- M15 papyrus clump ------------------------------------------------ */
  papyrus: G(0.66, 1.0, PAL.malachite, (c) => {
    taper(c, 0.33, 0.34, 0.33, 1.0, 0.085, 0.06);
    for (let i = -4; i <= 4; i++) {
      const a = i * 0.17;
      line(c, [[0.33, 0.36], [0.33 + Math.sin(a) * 0.34, 0.36 - Math.cos(a) * 0.34]], 0.038);
    }
    ell(c, 0.33, 0.36, 0.10, 0.055);
  }),

  /* --- V30 neb basket, "lord" ------------------------------------------- */
  neb: G(0.90, 0.24, PAL.goldDark, (c) => {
    c.beginPath();
    c.moveTo(0.03, 0.04); c.lineTo(0.87, 0.04);
    c.bezierCurveTo(0.82, 0.24, 0.08, 0.24, 0.03, 0.04);
    c.closePath(); c.fill();
  }),

  /* --- Aa1 placenta, "kh" ----------------------------------------------- */
  kh: G(0.56, 0.56, PAL.black, (c) => {
    c.save();
    c.beginPath();
    c.ellipse(0.28, 0.28, 0.26, 0.26, 0, 0, TAU);
    c.ellipse(0.28, 0.28, 0.12, 0.12, 0, 0, TAU);
    c.fill('evenodd');
    c.restore();
  }),

  /* ── The flat class, part two: signs that are short AND shape-distinct ──────────────────────
   *
   * `quadrat` draws three of its five layouts by stacking, and asks `pick()` for a sign under
   * `maxH` 0.36–0.5 each time, so **the flat signs are the majority of every inscription this
   * file paints** — and until now the flat set was `water · mouth · scroll · pool · arm ·
   * basket · bread · eye · neb · hand`, of which nine are a horizontal bar, arc or oval of
   * roughly 3:1. Individually they are correct signs. Together, resampled to the 8–25 px a
   * sign actually subtends in the canonical framings, they are one shape drawn ten ways, which
   * is what critic pass 5 read as *"rows of identical rounded rectangles"* on `interior`'s
   * upper wall and *"a visibly repeating tile of identical rounded rectangles"* on `traversal`.
   *
   * This is the §13 falcon defect one level up, and it is worth naming as its own class: that
   * one was **one sign** repeated, and the census fixed it by spreading the *identity*
   * distribution. Identity variety is not shape variety. A field can be perfectly uniform over
   * sign names and still be perfectly uniform over silhouettes, and the eye reads silhouettes.
   *
   * So the criterion for every addition below is not "is it a real sign" — the old ten are all
   * real — it is **"does its outline survive a box filter down to 10 px as something other than
   * a bar"**: a П, three humps, a ring, a hatched disc, a stepped mat, a stool. Two are
   * deliberately *round* and one deliberately *square*, because those are the two silhouettes
   * the old set had none of at all. Paint follows Egyptian practice as elsewhere, and the five
   * additions are balanced three-cool to two-warm to push against the one-hue reading of §36
   * without swinging `b−r` (see the recipe-side note on `PAINT_HUE`). */

  /* --- N1 sky, "pt" — a flat lintel with two short drops. The one flat sign whose silhouette
   *     is concave, which is why it survives minification as something other than a bar. --- */
  sky: G(1.05, 0.26, PAL.lapis, (c) => {
    rect(c, 0.02, 0.02, 1.01, 0.12);
    rect(c, 0.02, 0.10, 0.10, 0.19);
    rect(c, 0.93, 0.10, 0.10, 0.19);
  }),

  /* --- N25 hill country, "khaset" — three humps. Reads as a scallop at any size. --- */
  hills: G(0.94, 0.32, PAL.ochre, (c) => {
    for (let i = 0; i < 3; i++) {
      const x = 0.10 + i * 0.32, h = i === 1 ? 0.34 : 0.26;
      c.beginPath();
      c.moveTo(x - 0.10, 0.35);
      c.bezierCurveTo(x - 0.09, 0.35 - h, x + 0.09, 0.35 - h, x + 0.10, 0.35);
      c.closePath(); c.fill();
    }
  }),

  /* --- V9 shen ring — a closed ring on a bar. Round, and the only outlined void in the flat
   *     set, so at distance it holds a hole where every other flat sign holds a solid. --- */
  shen: G(0.52, 0.44, PAL.turquoise, (c) => {
    c.save();
    c.beginPath();
    c.ellipse(0.26, 0.22, 0.24, 0.20, 0, 0, TAU);
    c.ellipse(0.26, 0.22, 0.13, 0.10, 0, 0, TAU);
    c.fill('evenodd');
    c.restore();
    rect(c, 0.06, 0.40, 0.40, 0.09);
  }, (c) => { line(c, [[0.12, 0.22], [0.40, 0.22]], 0.02); }),

  /* --- R4 hetep, offering loaf on a mat, "htp" — a stepped profile: low mat, high loaf. --- */
  hetep: G(0.86, 0.34, PAL.white, (c) => {
    rect(c, 0.02, 0.26, 0.82, 0.13);
    c.beginPath();
    c.moveTo(0.22, 0.27);
    c.bezierCurveTo(0.24, 0.02, 0.62, 0.02, 0.64, 0.27);
    c.closePath(); c.fill();
  }),

  /* --- Q3 stool, "p" — a square. The flat set had no orthogonal silhouette at all. --- */
  stool: G(0.52, 0.42, PAL.malachite, (c) => {
    rect(c, 0.04, 0.03, 0.44, 0.30);
    rect(c, 0.04, 0.31, 0.16, 0.14);
  }),

  /* --- N16 land with grains, "ta" — a bar, but a bar with three dots under it, which is a
   *     different mark from a plain bar once the bar itself has blurred. --- */
  land: G(0.98, 0.26, PAL.ochre, (c) => {
    rect(c, 0.02, 0.03, 0.94, 0.13);
    for (let i = 0; i < 3; i++) circ(c, 0.22 + i * 0.27, 0.23, 0.055);
  }),

  /* --- W24 pot, "nw" — a round-bottomed bowl. Round, and taller than it is wide at the rim,
   *     so it breaks the 3:1 aspect the whole flat class shared. --- */
  pot: G(0.50, 0.42, PAL.carnelian, (c) => {
    c.beginPath();
    c.moveTo(0.04, 0.12);
    c.bezierCurveTo(0.02, 0.48, 0.46, 0.48, 0.44, 0.12);
    c.closePath(); c.fill();
    rect(c, 0.01, 0.04, 0.46, 0.10);
  }),
};

export const GLYPH_NAMES = Object.keys(GLYPHS);

/**
 * Pools that read as plausible text rather than a bag of signs.
 *
 * **Every pool must contain flat signs, and `divine` and `royal` did not.** `quadrat` builds three
 * of its five layouts by *stacking* signs — two deep at `maxH 0.5`, three deep at `0.36`, one
 * floated at `0.40` — and asks `pick()` for a sign short enough each time. The shortest sign in
 * `divine` was `wedjat` at h 0.78 and in `royal` (bar `neb`) `bee` at 0.62, so those three
 * branches filtered to **nothing**, and `pick()`'s `if (!ok.length) return pool[0]` quietly
 * returned the same sign for every one of them. Weighted by the branch probabilities that is
 * **72.8 % of all signs drawn from either pool**, and measured on the built tiles it was exactly
 * that: `falcon` 46 of 64 placements on `column_papyrus` (71.9 %) and 52 of 109 on
 * `hieroglyph_wall`, `neb` 17 of 38 on `relief_figures` — on the recipe that dresses **54.5 % of
 * `temple`**, seven signs in ten were the same near-black falcon.
 *
 * That is §7.3's "visible texture tiling repetition" in its most literal form, and no tiling
 * metric in this project could ever have caught it, because the repetition is *inside* the tile
 * rather than at the repeat: every global statistic over the tile sees a dense varied inscription,
 * and only a per-instance census of what was actually drawn shows one sign in three-quarters of
 * the slots. It also explains why a handful of rare coloured signs read as landmarks — the field
 * they sit in had almost no variety to hide them in.
 *
 * The flat signs added here are the ones the writing system actually leans on: `nb` (neb), `n`
 * (water), `r` (mouth), `t` (bread), the scroll determinative, and `ꜥ` (arm). They are also
 * chosen for *tone*: `falcon` paints near-black (#241a16), so replacing three-quarters of the
 * field wholesale with lapis signs would have swung §3's warm/cool balance on the biggest surface
 * in the interior shot. Four of the five additions to each pool are ochre / red / white and one
 * is cool, which is both what a real wall looks like and what keeps `b-r` still.
 */
/**
 * **Deduplicated by silhouette, not by name.** The flat half of each pool below used to hold four
 * or five members of one shape family — `neb`, `basket` and `bread` are all a filled arc; `mouth`,
 * `eye` and `scroll` are all a flat lozenge — so even with a perfectly uniform draw over sign
 * *names* the field came out uniform over *outlines*. Each pool now keeps at most one arc and one
 * lozenge and takes its remaining flats from the shape-distinct set added above (`sky`, `hills`,
 * `land`, `hetep`, `shen`, `stool`, `pot`). Every branch of `quadrat` still has ≥5 candidates in
 * every pool, which is the property `pick()`'s fallback note asks for; that is asserted by
 * `tools/census.mjs` rather than believed.
 */
export const POOLS = {
  royal: ['sedge', 'bee', 'sun', 'ankh', 'was', 'djed', 'netjer', 'nefer', 'neb', 'falcon', 'cobra', 'star',
    'mouth', 'scroll', 'arm', 'water', 'sky', 'shen', 'hetep', 'land', 'stool'],
  offering: ['bread', 'water', 'mouth', 'hand', 'arm', 'cone', 'pool', 'ka', 'strokes',
    'hetep', 'pot', 'stool', 'land', 'hills'],
  divine: ['falcon', 'jackal', 'scarab', 'wedjat', 'feather', 'lotus', 'papyrus', 'ankh', 'was', 'djed', 'netjer', 'sun',
    'neb', 'mouth', 'water', 'sky', 'shen', 'hills', 'stool', 'pot'],
  common: GLYPH_NAMES,
};

/* ------------------------------------------------------------------------- */
/*  mode handling                                                            */
/* ------------------------------------------------------------------------- */

/** Style the context for one of the three passes. */
export function setMode(ctx, mode, glyph) {
  if (mode === 'paint') {
    const hex = glyph?.paint ?? PAL.ochre;
    ctx.fillStyle = css(hex); ctx.strokeStyle = css(hex);
  } else {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  }
}

/**
 * Draw one sign, fitted into a box and centred, preserving its own aspect.
 * `mode === 'line'` draws only the incised interior detail.
 *
 * **The census hook is deliberate and is kept.** Setting `globalThis.__GLYPHLOG` to an array
 * before building a recipe records every sign actually placed — name, position and drawn size in
 * tile pixels, and paint colour. Nothing sets it at runtime, so this is inert in the game.
 *
 * It is here because it is the only instrument that has ever found this class of defect. Twenty-
 * eight global scalars failed to separate `hieroglyph_wall` from a known-bad control (§13), and
 * the same twenty-eight would have reported a dense varied inscription while 72 % of the signs on
 * `column_papyrus` were literally the same falcon — because a statistic over the finished tile
 * cannot see what the tile is made of. A per-instance list can, and it took about a minute to
 * read once it existed. Where a texture is assembled from parts, keep a way to count the parts.
 */
export function drawGlyph(ctx, name, x, y, bw, bh, mode) {
  const g = typeof name === 'string' ? GLYPHS[name] : name;
  if (!g) return;
  if (mode === 'line' && !g.d) return;
  const k = Math.min(bw / g.w, bh / g.h);
  const ox = x + (bw - g.w * k) * 0.5, oy = y + (bh - g.h * k) * 0.5;
  if (globalThis.__GLYPHLOG) {
    /* Transform-aware: `column_papyrus` draws its registers inside `scale(1, BAND_ASPECT)`, so
       raw `x`/`y` are not tile coordinates there. */
    const t = ctx.getTransform ? ctx.getTransform() : { a: 1, d: 1, e: 0, f: 0 };
    globalThis.__GLYPHLOG.push({
      name: typeof name === 'string' ? name : '?', mode,
      x: t.a * ox + t.e, y: t.d * oy + t.f,
      w: g.w * k * t.a, h: g.h * k * t.d,
      paint: g.paint ?? null,
    });
  }
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  setMode(ctx, mode, g);
  ctx.lineWidth = 0.03;
  if (mode === 'line') g.d(ctx);
  else g.s(ctx);
  ctx.restore();
}

/* ------------------------------------------------------------------------- */
/*  quadrat packing                                                          */
/* ------------------------------------------------------------------------- */

/**
 * Choose a sign that fits the slot.
 *
 * **The empty-filter branch used to be `return pool[0]`, and that one line was the largest
 * single source of visible repetition in the level.** When a pool held no sign short enough for
 * a stacking slot the filter emptied, and every such slot then drew the *same* sign — silently,
 * because a plausible glyph appeared and nothing looked broken. See the note on `POOLS`: it cost
 * 72.8 % of the signs drawn from `divine` and `royal`.
 *
 * The pools are fixed, so this branch is now unreachable — verified bit-exactly, the built
 * Surfaces of all six glyph-bearing recipes are unchanged by this rewrite. It is kept, and kept
 * *non-degenerate*, so that the next edit to a pool cannot quietly re-create the defect: falling
 * back to the shortest few signs still yields variety, where falling back to a fixed index yields
 * a wall of one sign. A silent fallback that returns something valid is worse than one that
 * returns something wrong, because only the second one gets found.
 */
function pick(rand, pool, maxH, maxW = 2) {
  const ok = pool.filter((n) => GLYPHS[n] && GLYPHS[n].h <= maxH + 0.02 && GLYPHS[n].w <= maxW);
  if (ok.length) return ok[Math.floor(rand() * ok.length) % ok.length];
  const byH = pool.filter((n) => GLYPHS[n]).sort((a, b) => GLYPHS[a].h - GLYPHS[b].h);
  if (!byH.length) return pool[0];
  const k = Math.min(3, byH.length);
  return byH[Math.floor(rand() * k) % k];
}

/**
 * Fill one quadrat — the square group real inscriptions are built from. A tall sign fills it
 * alone; flat signs stack two or three deep; a tall sign can take the left half with two flats
 * beside it. This is the difference between "hieroglyphs" and "a row of icons".
 */
export function quadrat(ctx, x, y, w, h, rand, pool, mode) {
  const r = rand();
  const pad = w * 0.05;
  if (r < 0.34) {
    drawGlyph(ctx, pick(rand, pool, 1.01, 1.0), x + pad, y + pad, w - 2 * pad, h - 2 * pad, mode);
  } else if (r < 0.58) {
    const gap = h * 0.06;
    const hh = (h - gap) * 0.5;
    drawGlyph(ctx, pick(rand, pool, 0.5), x + pad, y, w - 2 * pad, hh, mode);
    drawGlyph(ctx, pick(rand, pool, 0.5), x + pad, y + hh + gap, w - 2 * pad, hh, mode);
  } else if (r < 0.72) {
    const hh = h / 3;
    for (let i = 0; i < 3; i++) {
      drawGlyph(ctx, pick(rand, pool, 0.36), x + pad, y + i * hh, w - 2 * pad, hh * 0.9, mode);
    }
  } else if (r < 0.88) {
    const lw = w * 0.52;
    drawGlyph(ctx, pick(rand, pool, 1.01, 0.7), x + pad, y + pad, lw - pad, h - 2 * pad, mode);
    const hh = (h - 2 * pad) * 0.5;
    drawGlyph(ctx, pick(rand, pool, 0.5), x + lw, y + pad, w - lw - pad, hh * 0.92, mode);
    drawGlyph(ctx, pick(rand, pool, 0.5), x + lw, y + pad + hh, w - lw - pad, hh * 0.92, mode);
  } else {
    // A single wide sign, floated — the breathing space a real column has.
    drawGlyph(ctx, pick(rand, pool, 0.4, 1.3), x + pad, y + h * 0.25, w - 2 * pad, h * 0.5, mode);
  }
}

/**
 * Quadrat height weights for one register.
 *
 * **A uniform division is what critic pass 6 called "a keypad".** Both registers used to split
 * their box into `q` identical cells, and every text column in a wall gets the same box — so
 * cell boundary `k` landed at exactly the same y in all twelve columns, and the wall carried a
 * *lattice*: 42 px column rules crossing 42 px cell divisions in perfect register. Rendered at
 * `interior`'s 20.6 mm/px that is a grid of equal boxes with one or two marks in each, which is
 * what a keypad is and is not what an inscription looks like.
 *
 * Real quadrats are as tall as their contents need: a standing figure takes a full square, a
 * stacked pair takes two thirds, a wide flat sign takes a third. The scribe's constraint is that
 * the *column* fills between the rules, not that the cells match. So: jitter the weights and
 * renormalise, which keeps the column exactly filling its box while the divisions inside it stop
 * agreeing with the neighbouring column's.
 *
 * **±18 %, and the bound is set by the beacon census rather than by eye.** Cell height scales the
 * sign inside it (`drawGlyph` fits to the box), so widening this widens the largest-sign tail —
 * and §13's mechanism is that a *rare large* sign is a landmark the eye can match across a
 * repeat. Width is untouched, so area scales with height alone; at ±18 % the rarest-and-largest
 * ratio stays inside the profile the census already accepts (~2.3x) instead of the 3.86x that
 * ten columns produced. Divisions de-register by the accumulated weight error — about 7 % of the
 * register height by the third cell, i.e. ~9 px at `interior` — which is enough to break the
 * lattice and far short of making the columns look ragged.
 */
/* **On its own stream, and that is not a detail.** Drawing the weights from the register's own
 * `rand` would shift every subsequent draw by `q` steps, which changes *which layout branch and
 * which sign* each quadrat picks — so a change meant to be pure geometry would silently
 * re-roll the whole inscription. Measured when it did: `column_papyrus` lost 8 of 65 sign
 * placements and its largest sign went 44.3 → 62.3 tile px, i.e. straight at §13's rare-large
 * beacon, while its albedo `lumaRms` fell 3.1 % — on the surface critic pass 6 already calls
 * flat. Off a derived stream the sign sequence is bit-identical to before and only the cell
 * boundaries move, which is the change that was intended. §12's rule, arriving through an RNG:
 * a feature paid for out of a neighbour's budget, invisible in its own metrics. */
function cellWeights(q, seed) {
  const wr = rng((seed ^ 0x9e3779b9) >>> 0);
  const wt = new Array(q);
  let sum = 0;
  for (let i = 0; i < q; i++) { wt[i] = 0.82 + wr() * 0.36; sum += wt[i]; }
  for (let i = 0; i < q; i++) wt[i] /= sum;
  return wt;
}

/** A vertical column of quadrats — how a temple wall is normally read. */
export function columnRegister(ctx, x, y, w, h, seed, pool, mode) {
  const rand = rng(seed >>> 0);
  const q = Math.max(1, Math.round(h / (w * 1.02)));
  const wt = cellWeights(q, seed >>> 0);
  let yy = y;
  for (let i = 0; i < q; i++) {
    const qh = h * wt[i];
    quadrat(ctx, x, yy, w, qh * 0.97, rand, pool, mode);
    yy += qh;
  }
}

/** A horizontal band of quadrats, for lintels and architraves. */
export function rowRegister(ctx, x, y, w, h, seed, pool, mode) {
  const rand = rng(seed >>> 0);
  const q = Math.max(1, Math.round(w / (h * 1.02)));
  const wt = cellWeights(q, (seed ^ 0x51ed270b) >>> 0);
  let xx = x;
  for (let i = 0; i < q; i++) {
    const qw = w * wt[i];
    quadrat(ctx, xx, y, qw * 0.97, h, rand, pool, mode);
    xx += qw;
  }
}

/* ------------------------------------------------------------------------- */
/*  cartouche                                                                */
/* ------------------------------------------------------------------------- */

/**
 * The shen ring: a loop of doubled rope tied at the bottom, enclosing a royal name. The ring is a
 * *raised* frame around *sunk* glyphs, so `mode 'cut'` gets only the interior field and the ring
 * is returned as a separate ring mask via `ringOnly`.
 */
export function cartouche(ctx, x, y, w, h, seed, mode, o = {}) {
  const { ringOnly = false, interiorOnly = false, pool = POOLS.royal } = o;
  const r = w * 0.5;
  const t = w * 0.155;                        // rope thickness

  if (!interiorOnly) {
    ctx.save();
    setMode(ctx, mode, { paint: PAL.goldMid });
    ctx.lineWidth = t;
    ctx.lineJoin = 'round';
    // outer ring
    ctx.beginPath();
    ctx.moveTo(x + r, y + t * 0.5 + w * 0.5 - w * 0.5);
    roundedCapsule(ctx, x + t * 0.5, y + t * 0.5, w - t, h - t - w * 0.28, r - t * 0.5);
    ctx.stroke();
    // tie bar at the foot
    ctx.beginPath();
    ctx.rect(x + w * 0.16, y + h - w * 0.30, w * 0.68, w * 0.19);
    if (mode === 'line') ctx.stroke(); else ctx.fill();
    ctx.restore();
  }

  if (!ringOnly) {
    const ix = x + t * 1.25, iy = y + t * 1.25;
    const iw = w - t * 2.5, ih = h - w * 0.30 - t * 2.0;
    if (mode === 'cut' || mode === 'paint' || mode === 'line') {
      columnRegister(ctx, ix, iy, iw, ih, seed + 5, pool, mode);
    }
  }
}

function roundedCapsule(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
}

/* ------------------------------------------------------------------------- */
/*  friezes and rules                                                        */
/* ------------------------------------------------------------------------- */

/** The incised double rule that separates registers. Draw at both seam edges so the tile wraps. */
export function registerRule(ctx, size, y, thick, mode) {
  ctx.save();
  setMode(ctx, mode, { paint: PAL.ochre });
  ctx.fillRect(-2, y - thick * 1.9, size + 4, thick);
  ctx.fillRect(-2, y + thick * 0.9, size + 4, thick);
  ctx.restore();
}

/** Vertical rule between text columns. */
export function columnRule(ctx, size, x, thick, y0, y1, mode) {
  ctx.save();
  setMode(ctx, mode, { paint: PAL.ochre });
  ctx.fillRect(x - thick * 0.5, y0, thick, y1 - y0);
  ctx.restore();
}

/**
 * Kheker frieze — the row of stylised reed-bundle finials that crowns a temple wall.
 *
 * **Four pigments in rotation, not two.** The two-colour version alternated `lapis · ochre`,
 * which is one sample from each of the two hue windows critic pass 5 found the whole project
 * inside. A real kheker row runs blue / green / red / yellow, and `malachite` is the member that
 * is not reachable from either of those windows — see the note at `glyphWall`'s call site. The
 * cycle length is 4 against a finial count derived from the world tile, so it does not land in
 * phase with the tile and add a second countable rhythm.
 */
export function khekerFrieze(ctx, x, y, w, h, count, mode) {
  const cw = w / count;
  const CYCLE = [PAL.lapis, PAL.malachite, PAL.red, PAL.ochre];
  ctx.save();
  for (let i = 0; i < count; i++) {
    const cx = x + i * cw, mid = cx + cw * 0.5;
    setMode(ctx, mode, { paint: CYCLE[i % CYCLE.length] });
    /* **A kheker is a bundle of reeds tied at the neck, not a pentagon.** The five-point polygon
     * this drew read at frame scale as a row of flat bunting pennants — the first thing to look
     * wrong in the render, and wrong in a way that says "placeholder" rather than "Egypt". The
     * real motif is a narrow bundle that flares to a rounded, split crown above a banded waist,
     * and it is the *waist* that carries the read: a silhouette that pinches is unmistakable
     * where one that tapers straight is just a triangle. */
    const wSt = cw * 0.30, wCr = cw * 0.46;
    if (mode === 'line') {
      ctx.lineWidth = Math.max(1, h * 0.045);
      ctx.beginPath();
      ctx.moveTo(mid - wSt * 0.5, y + h * 0.46); ctx.lineTo(mid + wSt * 0.5, y + h * 0.46);
      ctx.moveTo(mid - wSt * 0.5, y + h * 0.58); ctx.lineTo(mid + wSt * 0.5, y + h * 0.58);
      ctx.moveTo(mid, y + h * 0.06); ctx.lineTo(mid, y + h * 0.40);
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    // crown: a rounded fan that splits at the top
    ctx.moveTo(mid - wSt * 0.5, y + h * 0.52);
    ctx.bezierCurveTo(mid - wCr, y + h * 0.30, mid - wCr * 0.92, y + h * 0.05, mid - wCr * 0.42, y + h * 0.02);
    ctx.lineTo(mid, y + h * 0.16);
    ctx.lineTo(mid + wCr * 0.42, y + h * 0.02);
    ctx.bezierCurveTo(mid + wCr * 0.92, y + h * 0.05, mid + wCr, y + h * 0.30, mid + wSt * 0.5, y + h * 0.52);
    // shaft below the tie
    ctx.lineTo(mid + wSt * 0.5, y + h);
    ctx.lineTo(mid - wSt * 0.5, y + h);
    ctx.closePath();
    ctx.fill();
    // the tie itself, a touch wider than the shaft
    rect(ctx, mid - wSt * 0.78, y + h * 0.50, wSt * 1.56, h * 0.10);
  }
  ctx.restore();
}

/** Painted band decoration: the stacked colour stripes that edge every register. */
export function paintedBand(ctx, x, y, w, h, mode, colours = [PAL.ochre, PAL.red, PAL.lapis, PAL.turquoise]) {
  if (mode === 'cut') return;
  const n = colours.length;
  const bh = h / n;
  ctx.save();
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = mode === 'paint' ? css(colours[i]) : '#fff';
    if (mode === 'line') { if (i % 2) continue; ctx.fillRect(x, y + i * bh, w, bh * 0.16); }
    else ctx.fillRect(x, y + i * bh, w, bh + 0.5);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------------- */
/*  figures                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * A striding figure in the Egyptian canon: profile head, frontal shoulders, profile hips and
 * legs, one leg advanced. Drawn from overlapping filled parts because a union of solids is far
 * more forgiving than one giant path — and in sunk relief the union is all that survives anyway.
 *
 * Unit space: x ∈ [0,0.62], y ∈ [0,1] with the crown at 0 and the sole at 1.
 * `dir = -1` faces left, `+1` faces right.
 */
export function strideFigure(ctx, x, y, hgt, mode, o = {}) {
  const { dir = -1, headdress = 'nemes', staff = true, arm = 'staff', paint = PAL.red } = o;
  ctx.save();
  ctx.translate(x + (dir < 0 ? 0 : 0.62 * hgt), y);
  ctx.scale(dir * hgt, hgt);
  setMode(ctx, mode, { paint });
  ctx.lineWidth = 0.022;
  const c = ctx;

  if (mode !== 'line') {
    // back leg
    poly(c, [[0.36, 0.56], [0.44, 0.56], [0.42, 0.78], [0.40, 0.94], [0.33, 0.94], [0.33, 0.78]]);
    poly(c, [[0.31, 0.92], [0.42, 0.92], [0.48, 0.99], [0.30, 0.99]]);
    // torso: wide frontal shoulders tapering to a narrow waist
    c.beginPath();
    c.moveTo(0.17, 0.19); c.lineTo(0.47, 0.19);
    c.bezierCurveTo(0.44, 0.32, 0.42, 0.38, 0.40, 0.44);
    c.lineTo(0.24, 0.44);
    c.bezierCurveTo(0.21, 0.36, 0.19, 0.28, 0.17, 0.19);
    c.closePath(); c.fill();
    // shendyt kilt
    poly(c, [[0.22, 0.42], [0.42, 0.42], [0.47, 0.62], [0.17, 0.62]]);
    // front (advanced) leg
    poly(c, [[0.22, 0.56], [0.32, 0.56], [0.24, 0.78], [0.19, 0.94], [0.12, 0.92], [0.15, 0.76]]);
    poly(c, [[0.10, 0.91], [0.20, 0.93], [0.22, 0.99], [0.03, 0.99]]);
    // neck + head + face
    rect(c, 0.27, 0.13, 0.09, 0.08);
    circ(c, 0.31, 0.105, 0.062);
    poly(c, [[0.25, 0.09], [0.19, 0.115], [0.26, 0.14]]);      // nose/chin profile
    if (headdress === 'nemes') {
      poly(c, [[0.25, 0.045], [0.40, 0.045], [0.43, 0.20], [0.36, 0.22], [0.35, 0.13], [0.26, 0.10]]);
      poly(c, [[0.24, 0.06], [0.20, 0.055], [0.19, 0.20], [0.26, 0.21]]);   // lappet on the chest
    } else {
      poly(c, [[0.24, 0.04], [0.40, 0.05], [0.41, 0.21], [0.24, 0.20]]);    // plain wig
    }
    // arms
    if (arm === 'staff') {
      taper(c, 0.22, 0.21, 0.13, 0.44, 0.075, 0.055);
      circ(c, 0.125, 0.455, 0.035);
      taper(c, 0.44, 0.21, 0.47, 0.50, 0.075, 0.05);
    } else {                                   // arms raised in adoration
      taper(c, 0.22, 0.21, 0.10, 0.10, 0.075, 0.05);
      taper(c, 0.44, 0.22, 0.52, 0.10, 0.075, 0.05);
    }
    if (staff) rect(c, 0.085, 0.03, 0.028, 0.96);
  } else {
    line(c, [[0.19, 0.20], [0.45, 0.20]], 0.020);                 // broad collar
    line(c, [[0.20, 0.24], [0.44, 0.24]], 0.018);
    line(c, [[0.22, 0.43], [0.42, 0.43]], 0.020);                 // belt
    for (let i = 0; i < 4; i++) line(c, [[0.23 + i * 0.05, 0.44], [0.20 + i * 0.06, 0.61]], 0.016);
    line(c, [[0.24, 0.31], [0.38, 0.31]], 0.014);                 // pectoral line
    line(c, [[0.15, 0.77], [0.24, 0.77]], 0.016);                 // knee
    line(c, [[0.33, 0.78], [0.42, 0.78]], 0.016);
    circ(c, 0.275, 0.10, 0.020);                                  // eye
    if (headdress === 'nemes') for (let i = 0; i < 4; i++) line(c, [[0.27 + i * 0.038, 0.06], [0.28 + i * 0.038, 0.20]], 0.014);
  }
  ctx.restore();
}

/** A seated offering figure, the other half of every offering scene. */
export function seatedFigure(ctx, x, y, hgt, mode, o = {}) {
  const { dir = -1, paint = PAL.red } = o;
  ctx.save();
  ctx.translate(x + (dir < 0 ? 0 : 0.78 * hgt), y);
  ctx.scale(dir * hgt, hgt);
  setMode(ctx, mode, { paint });
  const c = ctx;
  if (mode !== 'line') {
    poly(c, [[0.34, 0.52], [0.62, 0.52], [0.66, 0.98], [0.54, 0.98], [0.52, 0.62], [0.34, 0.62]]); // throne
    poly(c, [[0.26, 0.20], [0.52, 0.22], [0.50, 0.56], [0.30, 0.56]]);   // torso
    poly(c, [[0.30, 0.52], [0.52, 0.54], [0.54, 0.70], [0.08, 0.70], [0.10, 0.56]]);  // thighs
    poly(c, [[0.10, 0.68], [0.24, 0.68], [0.22, 0.96], [0.10, 0.96]]);  // shin
    poly(c, [[0.02, 0.94], [0.22, 0.94], [0.24, 0.99], [0.02, 0.99]]);
    rect(c, 0.31, 0.14, 0.09, 0.08);
    circ(c, 0.35, 0.115, 0.062);
    poly(c, [[0.29, 0.10], [0.23, 0.125], [0.30, 0.15]]);
    poly(c, [[0.29, 0.05], [0.45, 0.055], [0.46, 0.22], [0.29, 0.21]]);
    taper(c, 0.30, 0.24, 0.14, 0.50, 0.075, 0.05);
    taper(c, 0.48, 0.24, 0.52, 0.52, 0.075, 0.05);
  } else {
    line(c, [[0.28, 0.22], [0.50, 0.23]], 0.020);
    line(c, [[0.30, 0.52], [0.52, 0.54]], 0.020);
    circ(c, 0.315, 0.11, 0.020);
  }
  ctx.restore();
}

/** Falcon-headed Ra-Horakhty — the god in every temple relief, sun disc and all. */
export function falconHeaded(ctx, x, y, hgt, mode, o = {}) {
  const { dir = -1, paint = PAL.red } = o;
  strideFigure(ctx, x, y, hgt, mode, { dir, headdress: 'plain', staff: true, arm: 'staff', paint });
  ctx.save();
  ctx.translate(x + (dir < 0 ? 0 : 0.62 * hgt), y);
  ctx.scale(dir * hgt, hgt);
  const c = ctx;
  if (mode !== 'line') {
    setMode(c, mode, { paint: PAL.black });
    circ(c, 0.31, 0.115, 0.075);                                   // falcon skull
    poly(c, [[0.25, 0.10], [0.15, 0.145], [0.26, 0.165]]);         // hooked beak
    setMode(c, mode, { paint: PAL.red });
    circ(c, 0.32, 0.012, 0.055);                                   // sun disc
    setMode(c, mode, { paint: PAL.goldMid });
    band(c, [[0.36, 0.02], [0.44, 0.06], [0.42, 0.12]], 0.030);    // uraeus on the disc
  } else {
    circ(c, 0.285, 0.105, 0.022);
    line(c, [[0.26, 0.16], [0.36, 0.18]], 0.016);
  }
  ctx.restore();
}

/** Offering stand piled with loaves, a lotus and a jar. */
export function offeringTable(ctx, x, y, w, h, mode) {
  ctx.save();
  setMode(ctx, mode, { paint: PAL.limeMid });
  const c = ctx;
  if (mode !== 'line') {
    rect(c, x + w * 0.40, y + h * 0.42, w * 0.20, h * 0.58);      // stem
    rect(c, x + w * 0.18, y + h * 0.34, w * 0.64, h * 0.10);      // top
    rect(c, x + w * 0.24, y + h * 0.94, w * 0.52, h * 0.06);      // foot
    setMode(c, mode, { paint: PAL.white });
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(x + w * (0.30 + i * 0.20), y + h * 0.32, w * 0.11, h * 0.07, 0, Math.PI, TAU);
      c.fill();
    }
    setMode(c, mode, { paint: PAL.lapis });
    drawGlyph(c, 'lotus', x + w * 0.06, y + h * 0.02, w * 0.26, h * 0.30, mode);
  } else {
    line(c, [[x + w * 0.18, y + h * 0.39], [x + w * 0.82, y + h * 0.39]], w * 0.02);
  }
  ctx.restore();
}
