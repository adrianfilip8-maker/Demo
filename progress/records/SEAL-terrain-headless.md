# Mini-seal — headless Terrain geometry equals shipped Terrain geometry

**Owner:** WORLD. **Item:** coordinator task — "`Terrain` will not build headless".
**Written:** before the browser reference run returned. The headless numbers were already in
hand (they cost 4.8 s and no lock); the browser numbers were queued behind Capture A at the
time these bands were fixed. That ordering is the point — the bands below are a prediction,
not a description.

**Status at seal time:** no `src/` edit applied. Task #23 holds; the patch is written and
verified out-of-tree only. Both hunks live in this directory as `.patch` files.

---

## What is being sealed

That a headless build of `src/world/Terrain.js`, with the proposed patch, produces **the same
ground** as a real browser boot at `q=high` — so that a headless depth/occlusion instrument
measuring against it is measuring the shipped world and not an approximation of it.

The coordinator's instruction is explicit and is adopted as the remedy: *"If they differ at
all, say so and stop."*

## Instrument

`terrain-headless-probe.mjs` (node, patched module, no global DOM shim) and
`terrain-browser-ref.mjs` (headless Chromium via `tools/harness.mjs`, `q=high`, boot only, no
shot capture). Both compute vertex count, triangle count, bounding box (6 components, 1e-6 m),
`meanY` (1e-9 m) and an FNV-1a hash over the raw Float32 position bytes, using
character-identical arithmetic. Any difference in the output is therefore a difference in the
geometry, not in how it was measured.

**Bound population — the 7 ground meshes:** `sand_ring0`, `sand_ring1`, `sand_ring2`,
`sand_ring3`, `sand_collision`, `pyramid_105`, `pyramid_72`. These are what a depth instrument
ray-casts for ground. Vegetation, water and the unnamed instanced meshes are reported but
**non-binding** (§26.2): they may legitimately vary with the presence of TEXTURES/SHADING,
which a stub engine does not provide, and no threshold is registered for them.

## Registered bands — these partition the outcome line (§26.1)

Evaluated over the bound population only. Every measurement the instrument can emit lands in
exactly one band.

| Band | Condition | Meaning |
|---|---|---|
| **EXACT** | All 7 meshes present both sides · vertex counts equal · triangle counts equal · all 6 bbox components equal within 1e-6 m · all 7 position hashes equal | Headless ground *is* the shipped ground, bit for bit. Instruments may trust it unconditionally. |
| **GEOMETRIC-MATCH** | Counts and bboxes as above, but ≥1 position hash differs, **and** every per-mesh \|Δ meanY\| ≤ 1e-6 m | Same lattice, same extent, sub-micron numeric drift (different V8 transcendentals between node and Chromium). Usable, with the divergence stated at the call site. |
| **DIVERGENT** | Any of: a bound mesh missing on either side · any vertex or triangle count unequal · any bbox component differing by > 1e-6 m · ≥1 hash differing with any \|Δ meanY\| > 1e-6 m | The headless ground is not the shipped ground. |

Partition check: counts+bbox equal splits on hashes; hashes-equal → EXACT; hashes-differ splits
on meanY at 1e-6 → GEOMETRIC-MATCH or DIVERGENT; counts+bbox not equal → DIVERGENT. No gap, no
overlap.

## Remedy, written as a function of state (§26.3)

- **EXACT or GEOMETRIC-MATCH** → the patch is offered for application when task #23 lifts, and
  the headless build is recorded as a valid foundation for depth instruments.
- **DIVERGENT** → I say so plainly and stop. The patch is **not** offered as an instrument
  foundation, the item stays open, and the next agent is told the ground is missing rather
  than being handed a near-miss. A headless terrain that is *nearly* the shipped one is worse
  than none.

This holds whenever it is scored, regardless of whether the patch has shipped by then.

## Secondary claim — browser path unchanged (binding, with a threshold)

**Claim:** hunk 1 cannot change what the browser produces.
**Metric:** the source lines executed when `document` exists, whitespace-trimmed, compared
character-for-character against the same lines in the current shipped file.
**Threshold:** must be exactly equal.
**Result (already measured):** equal — the only edit inside the browser-taken branch is two
spaces of indentation. `makeHeadlessCanvas` is a function declaration with no side effects and
is never called when `document` exists.

Hunk 2 (failure isolation) changes call order not at all — `cache → textures → sand →
pyramids → scene.add` before and after. It is observable in the browser *only* on a path that
throws, which does not occur on a successful boot. Marked **non-binding**; it is offered
separately and can be declined without affecting hunk 1.

## Pre-registered prediction

EXACT. Stated because the geometry is a pure function of `rawHeight` plus fixed module
constants, and the only engine input the geometry path reads is `engine.quality` (which sets
`INNER_STEP`), matched to `high` on both sides. The one thing that could defeat it is
`Math.sin`/`cos`/`pow` differing between node's V8 and Chromium's V8 — which would land in
GEOMETRIC-MATCH, not EXACT.

---

## VERDICT — **EXACT**

Scored by `score-seal.mjs`; full output in `SCORE-terrain-headless.txt`.

Browser reference: headless Chromium, ANGLE/SwiftShader/Vulkan, `q=high`, boot only.
Headless: node v22.22.2, patched module, no global DOM shim. three r185 both sides.

| mesh | verts | tris | max bbox Δ | position hash | Δ meanY |
|---|---|---|---|---|---|
| `sand_ring0` | 37,249 | 73,728 | 0.00e+0 | `6a819446` | 0.00e+0 |
| `sand_ring1` | 6,561 | 10,752 | 0.00e+0 | `674e8d75` | 0.00e+0 |
| `sand_ring2` | 2,401 | 3,808 | 0.00e+0 | `a7ee5684` | 0.00e+0 |
| `sand_ring3` | 3,721 | 6,048 | 0.00e+0 | `9d9ce9f3` | 0.00e+0 |
| `sand_collision` | 7,225 | 14,112 | 0.00e+0 | `2bc1c9a4` | 0.00e+0 |
| `pyramid_105` | 1,242 | 414 | 0.00e+0 | `9af4e0cd` | 0.00e+0 |
| `pyramid_72` | 954 | 318 | 0.00e+0 | `cd368f87` | 0.00e+0 |

7 of 7 bound meshes present both sides. 0 count mismatches, 0 bbox mismatches, **0 hash
mismatches**. Every bbox delta is exactly zero, not merely inside the 1e-6 m tolerance. The
prediction (EXACT) held; node's and Chromium's V8 agree bit-for-bit on this height field.

**Beyond the seal, all non-binding:**

- The unbound population also matched exactly — 9 meshes and 13,953 verts on both sides — so
  vegetation and water agree too. Not claimed in advance, so recorded as an observation.
- Totals: 73,306 verts / 130,626 tris, identical.
- All six `heightAt()` probe samples identical to 1e-6 m.
- **The browser boot was not a degraded one.** It carried the real TEXTURES module (its only
  boot warning was `textures: prewarm took 27.3s at size 1024`), while the headless side ran
  `engine.get() → null` throughout. Geometry matched anyway. This is the useful part: the
  equality is not an artifact of both sides being stripped to the same fallback path, it is
  evidence that TEXTURES/SHADING genuinely do not reach the geometry.

**Remedy discharged:** verdict is EXACT, so per the registered remedy the patch is offered for
application when task #23 lifts, and the headless build is recorded as a valid foundation for
headless depth instruments. Nothing was withheld and nothing needs reverting.

**Secondary claim (browser path unchanged):** PASS — trimmed browser-taken branch is
character-identical to the shipped lines.
