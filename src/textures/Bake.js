/**
 * Bake — the pure, THREE-free half of building a material.
 *
 * Everything from "name a recipe" to "here are the finished RGBA byte buffers" lives here and
 * nothing else does. `Textures.js` owns the THREE.Texture lifecycle, the cache and the memory
 * policy; this file owns the arithmetic. The split exists for one reason: **the same code has to
 * run on the main thread and inside a worker, and a second copy of it would be a second thing to
 * keep in sync.** `TextureWorker.js` imports `bake()` and so does `Textures._buildLocal()`, so a
 * texture built on a background thread and the same texture built on the main thread are the same
 * function applied to the same seed — not two implementations that agree today.
 *
 * Nothing in here may import `three`. A module worker that pulls in the renderer pays the parse
 * cost of the whole engine per worker, and none of it is reachable from a Float32Array.
 */

import { Surface, celband, celbandArm } from './Canvas2D.js';
import { MATERIALS } from './Materials.js';
import { derive } from './NormalMap.js';

/**
 * Which groups `celband` is allowed to touch (`PREREG-celband.md` §3).
 *
 * `fx` is excluded because those recipes are alpha-tested or emissive sprites and decals — a
 * value lattice on a soft-edged flame or a crack decal bands its falloff, which is a different
 * artefact, not a cel look. `sly` is excluded because D3 is CHARACTER's defect and §267 shipped a
 * per-part surface split there this week; two agents quantising the same fur is how a result
 * stops being attributable.
 */
const CELBAND_GROUPS = new Set(['stone', 'carved', 'metal', 'organic']);

/** Stable per-name seed, so a material looks the same on every run and across commits. */
export function hashName(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Resolution contract (Materials.js header): tier 0 = detail-critical, full budget resolution;
 * tier 1 = standard, half; tier 2 = sprite/decal, half. A recipe may pin its own `size`, which
 * is then clamped to the budget.
 *
 * This is also the cost model. Build time is very close to linear in texel count — the profile
 * that motivated the parallel prewarm measured the six tier-0 recipes at 19.99 s and the ten
 * tier-1/2 recipes at 6.55 s, i.e. ~3.3 s each against ~0.65 s each for a 4× texel ratio. So
 * `size` is the only estimate the scheduler needs.
 */
export function bakeSize(recipe, texSize) {
  return recipe.size
    ? Math.min(recipe.size, texSize)
    : (recipe.tier >= 1 ? Math.max(256, texSize >> 1) : texSize);
}

/**
 * The joint-sign invariant, measured here rather than in `Textures.js` because it needs the
 * masonry masks, which live only as long as the `Surface` does — and once the build moves to a
 * worker the Surface never crosses the thread boundary at all. Two scalars are kept, not the
 * masks: a size² Float32Array per material would cost more than the whole texture budget.
 *
 * Both deltas must come out negative. Mortar and recesses are darker and lower than the faces
 * they sit between; `paving_courtyard` once shipped with a positive luma delta and rendered as
 * pale flags divided by a raised white grid. The caller warns — this function only measures.
 */
function jointSign(surface) {
  const m = surface.masonry;
  if (!m) return null;
  let jy = 0, jh = 0, jn = 0, fy = 0, fh = 0, fn = 0;
  for (let i = 0; i < surface.n; i++) {
    const y = surface.r[i] * 0.2126 + surface.g[i] * 0.7152 + surface.b[i] * 0.0722;
    if (m.joint[i] > 0.6) { jy += y; jh += surface.h[i]; jn++; }
    else if (m.joint[i] < 0.05) { fy += y; fh += surface.h[i]; fn++; }
  }
  if (!jn || !fn) return null;
  return {
    dY: +((jy / jn) - (fy / fn)).toFixed(4),
    dH: +((jh / jn) - (fh / fn)).toFixed(4),
  };
}

/**
 * Build one catalogue entry into transferable byte buffers.
 *
 * @param {string} name catalogue key (already de-aliased by the caller)
 * @param {number} texSize the quality tier's budget resolution
 * @param {string} quality engine quality label, forwarded to the recipe
 * @returns {{name, size, albedo:Uint8Array, normal:Uint8Array, orm:{data:Uint8Array,size:number},
 *            emissive:?Uint8Array, hasAlpha:boolean, normalStrength:number, joint:?object}}
 */
export function bake(name, texSize, quality) {
  const recipe = MATERIALS[name];
  if (!recipe) throw new Error(`no recipe named "${name}"`);
  const size = bakeSize(recipe, texSize);

  const surface = new Surface(size, (recipe.seed ?? hashName(name)) >>> 0);
  recipe.build(surface, { seed: surface.seed, size, name, quality });

  /* PREREG-celband: the value lattice, between `build()` and everything that reads the Surface.
   *
   * Placed here rather than at 44 call sites for the reason `Bake.js` exists at all — one
   * function applied to every recipe cannot drift from itself. Placed BEFORE `jointSign()`
   * deliberately: that assertion exists to check what shipped, and an invariant measured on a
   * surface the consumer never sees is not an invariant. `radius` is quoted per 1024 texels and
   * scaled here, so a tier-1 recipe at 512 gets the same world plateau size and not the same
   * texel count.
   *
   * `celbandArm()` returns null on the shipped path, so this is a no-op and the committed blob is
   * unchanged — which is checkable rather than asserted: `tests/textures.test.mjs` verifies every
   * digest in `baked.json` against a fresh procedural build, so if this changed a single texel on
   * the default arm that suite would go red. */
  const arm = celbandArm();
  if (arm && CELBAND_GROUPS.has(recipe.group)) {
    celband(surface, {
      steps: arm.steps,
      radius: Math.max(1, Math.round((arm.radius1024 * size) / 1024)),
      keep: arm.keep,
    });
  }

  const joint = jointSign(surface);

  const out = derive(surface, {
    bump: recipe.bump ?? 0.03,
    tile: recipe.tile ?? 2.0,
    normalScale: recipe.normalScale ?? 1.0,
    aoStrength: recipe.aoStrength ?? 1.0,
    aoFloor: recipe.aoFloor ?? 0.16,
    micro: recipe.micro ?? 0.10,
    ormDiv: recipe.ormDiv ?? 2,
    smoothH: recipe.smoothH ?? 0,
    // Default fractional low-pass on the normal's last octave. Detail below ~3 texels cannot
    // survive a mip chain; leaving it in only buys shimmer. Recipes may override.
    microSoft: recipe.microSoft ?? 0.35,
  });

  return {
    name,
    size,
    albedo: out.albedo,
    normal: out.normal,
    orm: out.orm,
    emissive: out.emissive,
    // Sprites carry alpha; everything else is opaque and shouldn't pay for blending.
    hasAlpha: !!surface.a,
    normalStrength: out.normalStrength,
    joint,
  };
}

/** The ArrayBuffers in a `bake()` payload, for a worker's `postMessage` transfer list. */
export function bakeTransfers(p) {
  const t = [p.albedo.buffer, p.normal.buffer, p.orm.data.buffer];
  if (p.emissive) t.push(p.emissive.buffer);
  return t;
}
