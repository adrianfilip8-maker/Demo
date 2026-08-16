/**
 * ringextent.mjs — how big `dive_ring` actually draws, derived once from the shipped recipe.
 *
 * ── Why this is a module and not a constant ─────────────────────────────────────────────────
 * The number has been written down five times in this repo and has been wrong in three
 * different ways:
 *
 *   `Particles._stageImpact` returns          1.50 m   the authored footprint, `1.2 * scale`
 *   §405 corrected it to                      4.035 m  the size ramp at jitter exactly 1.0
 *   `impactframe` cropped against             4.035 m  inheriting that
 *   `tests/fxrim.test.mjs` recomputed          4.035 m  its own copy of the same expression
 *   `src/fx/Particles.js`'s header quotes     4.035 m  as "what the sprite actually draws"
 *
 * All five are one number, and the number is **the mean of a random variable with the jitter
 * term dropped**. `_emit` computes `const s = R.range(0.8, 1.25) * scale`, so `sz` spans
 * **3.228 to 5.043 m** per particle. 4.035 m is `s = 1.25` exactly; the midpoint is 4.135.
 *
 * The lesson this file is the response to is `framelib`'s own: *a second copy is a second thing
 * to keep true, and the copy is always the one that goes stale.* So nothing here is a literal
 * transcribed from the emitter — every quantity is read out of `EMITTERS.dive_ring` and
 * `TUNE.impactScale` at import, and a recipe edit moves these numbers with it.
 *
 * ── What is NOT derived here, and is a measurement ──────────────────────────────────────────
 * `ATLAS_WINDOW` is the fraction of the sprite quad the ring painter's own outer edge occupies
 * — the quad's edge samples the atlas at |U| = 0.8904, so a painter radius r lands at world
 * `r * sz / 0.8904`. That is a property of the painted texture, not of the recipe, and it was
 * measured by unprojecting the lit pixels of the `ring` batch onto the impact plane
 * (`tools/ringspill.mjs`). It carries its provenance because it cannot be re-derived from code.
 */
import { readFileSync } from 'node:fs';
import { EMITTERS } from '../src/fx/Emitters.js';
import { TUNE } from '../src/fx/Particles.js';

const E = EMITTERS.dive_ring;

/** `STAGE_IMPACT`'s staged age for `dive_ring` — 97.6% of its own peak ink. */
export const STAGED_AGE = 0.088;

/** `_emit`'s per-particle size jitter: `const s = R.range(0.8, 1.25) * scale`. */
export const JITTER = [0.8, 1.25];

/** The vertex shader's size ramp: `sz = mix(size0 * s, size1 * s, u^sizeExp)`. */
function szAt(jitter, age = STAGED_AGE, life = E.life[0]) {
  const s = jitter * TUNE.impactScale;
  const u = Math.pow(age / life, E.sizeExp);
  return E.size[0] * s + (E.size[1] * s - E.size[0] * s) * u;
}

export const RING_SZ_MIN = szAt(JITTER[0]);          // 3.228 m
export const RING_SZ_MAX = szAt(JITTER[1]);          // 5.043 m
export const RING_SZ_MID = szAt((JITTER[0] + JITTER[1]) / 2);   // 4.135 m
/** The figure every previous consumer used: the ramp with the jitter term left out. */
export const RING_SZ_NOJITTER = szAt(1.0);           // 4.035 m

/** Measured, not derived — see the header. */
export const ATLAS_WINDOW = 0.8904;

/** The outermost world radius the painted ring reaches, for a given size draw. */
export const litRadius = (sz) => sz / ATLAS_WINDOW;

/**
 * What a CROPPING bar should be run against: the worst case over the draw.
 *
 * Two choices, both deliberate, and both stated because they are the kind that get inverted by
 * whoever next touches the file:
 *
 * **A radius, not the quad's corner.** The ink is circular. The quad is a world-axis-aligned
 * square with extremes at `sz * sqrt(2)` = 7.13 m, but those corners are transparent atlas, and
 * cropping transparent corners is not cropping the ring.
 *
 * **The maximum of the draw, not this tree's value.** `sz` is an RNG draw: stable for a given
 * tree, and it moves whenever anything upstream perturbs the stream — one capture read the ring
 * at x 7..1247 where an earlier tree read x 0..1272. **A shipped camera may not depend on an RNG
 * draw.** Taking the maximum also makes the bar monotone-safe: a camera that clears this radius
 * clears every draw, so revising the number downward can never invalidate a staged shot.
 */
export const RING_R_CROP = litRadius(RING_SZ_MAX);   // 5.664 m

/**
 * ── AND A RADIUS IS NOT A DISC UNTIL IT HAS A PLANE. THIS IS THE TERM THAT GETS DROPPED. ────
 *
 * `_stageImpact` puts the ring at `p.y + 0.06`, so every consumer so far has projected the disc
 * at ground + 0.06. **That is not the plane the sprite is drawn on.** `PARTICLE_VERT` computes
 *
 *     p = aP0 + aV0 * dc          dc = (1 - exp(-k*age))/k, or `age` when drag is 0
 *
 * and for PLANAR sprites `aV0` holds THE PLANE NORMAL — `_emit`'s own comment at the write site
 * says so, one line before the expression that treats it as a velocity. `dive_ring` has drag 0,
 * so `dc = age` and the ring is drawn **`STAGED_AGE` metres along its own normal**: 0.088 m
 * above the floor it is a decal on, for a total stand-off of 0.148 m.
 *
 * It moves the frame. The containment disc at `RING_R_CROP`, projected through `impact`'s
 * camera:
 *
 *     on the drifted plane y=0.148 (what is drawn)   x -190..1470   rows 200..1192
 *     on the staged plane  y=0.060 (what is checked) x -184..1464   rows 206..1205
 *
 * Small next to the crop itself — the ring is off three edges either way — but it is the sixth
 * term in a number that has already been wrong five times, and it points OUTWARD at the top and
 * the sides, which is the direction that certifies a cropped frame.
 *
 * ── DO NOT "FIX" THE DRIFT WITHOUT READING THIS. It is load-bearing. ─────────────────────────
 * The mechanism is plainly incidental: nothing wants a ground decal to fly. But the `ring` batch
 * ships `SOFT`, and `PARTICLE_FRAG`'s soft term is
 *
 *     a *= clamp( (sceneZ - vViewZ) / uSoftness, 0, 1 )        uSoftness = 0.9
 *
 * which fades the sprite by how far it stands off the surface behind it. The drift supplies 59%
 * of that stand-off. Measured through `impact`'s own camera, at five radii:
 *
 *     r        y=0.060 (staged)   y=0.148 (drifted)    gain
 *     1.5 m    a x 0.156          a x 0.390            2.505x
 *     4.5 m    a x 0.198          a x 0.495            2.502x
 *
 * **Removing the drift dims the largest sprite in the game by 2.50x at every radius.** It is not
 * a no-op and it is not a look-neutral cleanup. If it is to be removed, the staged height has to
 * absorb it — `p.y + 0.148` rather than `p.y + 0.06` — and even then the ring stops brightening
 * as it ages, which is a second behaviour change. Two further consequences of the drift as it
 * stands, neither measured here: a ring on a WALL slides off it at 1 m/s along the wall normal,
 * and a ring brightens as it dissipates, which is backwards for a shockwave.
 *
 * Registered, not repaired: it is a look decision with a measured 2.50x on it.
 */
export const RING_PLANE_LIFT = STAGED_AGE;           // metres along the plane normal, = dc at drag 0

/** Where `_stageImpact` puts the sprite before the drift, read out of the source, not transcribed. */
export const RING_STAGE_LIFT = (() => {
  const src = readFileSync(new URL('../src/fx/Particles.js', import.meta.url), 'utf8');
  const m = src.match(/_stg\.set\(\s*p\.x,\s*p\.y\s*\+\s*([\d.]+)/);
  if (!m) throw new Error('ringextent: _stageImpact no longer states its staged height in a readable form');
  return Number(m[1]);
})();

/** The y a consumer must project the ring's disc at, given the ground the slam landed on. */
export const ringPlaneY = (groundY = 0) => groundY + RING_STAGE_LIFT + RING_PLANE_LIFT;

/**
 * How far out the PAINTED ink actually reaches, as a fraction of the atlas window.
 *
 * `RING_R_CROP` above uses painter radius 1.0, and the ink never gets there: `ringPainter`'s
 * lip closes at `edge + 0.03` with `edge = 0.90 * wob` and `wob <= 1.075`, so the outermost
 * possible painter radius over every azimuth and every wobble phase is 0.9975. The exact
 * containment radius is therefore `0.9975 * RING_SZ_MAX / ATLAS_WINDOW` = 5.650 m, and
 * `RING_R_CROP` is 5.664 m — **0.014 m looser, which is the safe direction for a containment
 * bar, so the constant is deliberately left at the looser value.** Exported so the margin is a
 * number rather than a claim, and so nobody "tightens" the crop radius into being wrong.
 */
export const RING_INK_RHO_MAX = 0.90 * (1 + 0.045 + 0.03) + 0.03;   // 0.9975
export const RING_R_CROP_EXACT = RING_INK_RHO_MAX * litRadius(RING_SZ_MAX);   // 5.650 m

/** What `_stageImpact` RETURNS, kept so the gap to what it draws stays visible (§405). */
export const RING_R_DECLARED = 1.2 * TUNE.impactScale;   // 1.50 m

/** One line a consumer can print so the gap is never invisible in a tool's output. */
export const summary = () =>
  `dive_ring · sz ${RING_SZ_MIN.toFixed(3)}..${RING_SZ_MAX.toFixed(3)} m over the jitter draw`
  + ` (mid ${RING_SZ_MID.toFixed(3)}, no-jitter ${RING_SZ_NOJITTER.toFixed(3)})`
  + ` · crop radius ${RING_R_CROP.toFixed(3)} m · _stageImpact declares ${RING_R_DECLARED.toFixed(2)} m`;
