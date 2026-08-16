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

/** What `_stageImpact` RETURNS, kept so the gap to what it draws stays visible (§405). */
export const RING_R_DECLARED = 1.2 * TUNE.impactScale;   // 1.50 m

/** One line a consumer can print so the gap is never invisible in a tool's output. */
export const summary = () =>
  `dive_ring · sz ${RING_SZ_MIN.toFixed(3)}..${RING_SZ_MAX.toFixed(3)} m over the jitter draw`
  + ` (mid ${RING_SZ_MID.toFixed(3)}, no-jitter ${RING_SZ_NOJITTER.toFixed(3)})`
  + ` · crop radius ${RING_R_CROP.toFixed(3)} m · _stageImpact declares ${RING_R_DECLARED.toFixed(2)} m`;
