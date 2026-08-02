# PREREG — shadow-cache fingerprint: the geometry-not-hashed hazard

> STATUS (13:4x): unfrozen by coordinator after goldhalo; **the fix below is IMPLEMENTED
> in src/render/Lighting.js** exactly as specified (terms 31/37/41/43/47, Infinity→−1;
> trigger-4 doc line amended; syntax-checked; uncommitted for sweep). The sealed
> verification V1–V3 below is UNCHANGED and still pending — it runs in the coordinator's
> next FIFO batch (no captures before the explicit green light). The seal's bands were
> registered before any code existed and have not been touched since.

Written under the src freeze (until goldhalo/28178 completes). No code has been changed;
this is the fix plan and the sealed verification design, §26-compliant.

## The hazard, stated precisely

`Lighting._updateShadowCache()`'s per-frame static fingerprint hashes, per tracked mesh:
matrixWorld elements (12,13,14,0,5,10), effective visibility (own flag AND ancestors),
castShadow, material.side, and instanceMatrix.version. It does NOT hash geometry content.
A static caster whose GEOMETRY is mutated in place — position attribute rewritten
(`attr.needsUpdate`), index buffer swapped, `geometry.drawRange` changed, or the whole
`mesh.geometry` object replaced — keeps serving its stale cached depth: the shadow of the
OLD geometry persists indefinitely, and nothing warns. This is §15's exact failure shape
(invisible wrongness, stats normal). Not currently reachable in shipped code — world
geometry is built once at init and never mutated (Architecture/Terrain/Props freeze
matrices AND buffers) — which is why it is latent, and why it stays frozen rather than
hotfixed. It becomes live the day any agent adds destructibles, sand deformation, or LOD
swapping on a caster.

## The fix (one term class, same discipline as the existing terms)

Fold into the per-mesh fingerprint sum, weights continuing the prime sequence:
    + geometry.id * 31                      (object replacement)
    + (geometry.index ? geometry.index.version : 0) * 37
    + posAttr.version * 41                  (posAttr = geometry.attributes.position)
    + geometry.drawRange.start * 43 + drawRangeCount * 47
where drawRangeCount = drawRange.count === Infinity ? −1 : drawRange.count (Infinity in a
float sum makes the whole sig Infinity — Infinity === Infinity, so a SECOND edit elsewhere
would compare equal and be missed; −1 keeps the term finite and distinct from any real
count ≥ 0). All reads, no allocation, ~5 flops/mesh on the existing 48-mesh loop.
Morph targets: not hashed — no static caster has morphs; if one ever does, its influences
array joins the sum then (noted, non-binding).

## Sealed verification (runs after the freeze lifts, before the fix ships)

One boot, frozen clock, hero staged, cache engaged (probe.cache.engaged must read true on
every cached job — a tripped valve voids the run). Three legs:

  V1 (in-place attribute edit): pick the tracked static with the most triangles (probe
     names it); scale its position attribute by 1.06 about its centroid + needsUpdate +
     recompute bounds; 3 dt-0 frames; capture cached and legacy.
  V2 (drawRange edit): restore V1; set drawRange.count to 50% of index count; 3 dt-0
     frames; capture cached and legacy.
  V3 (null control): restore all; 100 dt-0 frames; read refresh counter delta.

Registered bands — each partitions its outcome line (§26.1):

  V1/V2, diff(cached, legacy) in changed px:
      = 0        → PASS (cache tracked the geometry edit)
      ≥ 1        → FAIL (stale depth served; fix wrong or term dead)
  V1/V2 non-vacuity, diff(cached-after-edit, cached-before-edit):
      ≥ 200 px   → test is probative
      1–199 px   → WEAK — edit barely visible; re-pick target mesh, re-run (named band,
                   declared meaning: instrument insufficient, not a verdict on the fix)
      = 0        → VOID — edit changed nothing on screen; test proves nothing
  V3 refresh-counter delta over 100 frames:
      = 2        → PASS (exactly one refresh per cached cascade from the restore itself)
      3–8        → MARGINAL — a term is jittering; find which before shipping (named band)
      ≥ 9 or NaN → FAIL (fingerprint thrash; fix costs the cache its point)
      0–1        → FAIL (restore was not seen; invalidation path broken)

No adjectives anywhere in the seal (§26.2): every claim above carries a number and every
number lands in exactly one band. Baseline numbers to pin at seal time: refresh counter
value immediately before V3's window, and the V1 target mesh's name + triangle count.
