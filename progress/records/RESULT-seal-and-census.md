# Seal integrity + the 1.73 M triangle question — both settled offline

Tree at measurement: `ee0ed99` + dirty (`src/textures/Materials.js` only, not mine — I edited
no `src/` file for this work). No capture lock taken; nothing here needs a GPU.

Artifacts: `progress/records/scenecensus.mjs`, `progress/records/voidwhere.mjs`.

---

## 1. Seal integrity: **INTACT. 0 genuine leaks in 144,000 rays.**

`tools/void.mjs` on the current tree reports **10 into-void first hits** (temple 2, dunes 8)
against the last recorded state of **0** (`NOTE-task20-verification.md §3`, 319,840 tris). The
tri count has moved 319,840 → 323,108, so geometry did change underneath that record. It looks
like a regression. It is not one.

**`tools/void.mjs`'s headline number is not the leak condition it documents.** Its own loop
comment states the test:

> *"In the void is not enough on its own: a reveal pier or a niche back legitimately STANDS in
> the void… The leak is the ray that reaches the **inside** of a leaf — a face pointing away
> from the camera."*

No facing test is applied. The code does `hits++` immediately after the volume test, so any
first hit landing in the void volume is counted, including front-facing stone.

`voidwhere.mjs` re-runs the identical cast and adds the missing test (hit triangle's geometric
normal · ray direction; `>0` = backface = camera seeing the inside of a leaf = real leak):

| | count |
|---|---|
| backface (**genuine leak**) | **0** |
| frontface (legitimate occupancy) | 10 |

All ten are front faces at `n·d` = −0.748 … −0.918 — the camera is looking at the *outside* of
stone. That is conclusive independently of which block it is: **a front-facing first hit means
no interior is visible along that ray.**

**Why they land in the void volume at all — measured, not argued.** Depth inside the analytic
boundary for all ten: **0.050 – 0.162 m**. `void.mjs` sets its margin `P = 0.30 m` and
documents it as covering `bow`+`drift` (≤ 0.24 m). It does not track per-block `settle`, `chip`,
`recess` or the chamfer, so blocks near the boundary get misclassified by a few centimetres.
Every hit is inside that slop; none is a deep intrusion.

- temple ×2 — `arch:hall:hieroglyph_gilded`, (−6.5, 13.7, −51.3), 0.16 m inside, inner pylon.
- dunes ×8 — `arch:court:hieroglyph_wall`, y 0.17–0.88, z ≈ 32.5, 0.05–0.10 m inside, entry pylon feet.

### The facing test was control-validated before I trusted it

An unvalidated tracer already produced a false conclusion on this project (§128.3), so the sign
convention was proven, not assumed:

- **Synthetic unit control** — `BoxGeometry`, ray from inside → `n·d = +1.000` (BACKFACE); ray
  from outside → `n·d = −1.000` (frontface). **PASS.**
- **In-level control** — rays cast from inside each shell void outward: 1 backface / 35
  frontface. Weak (interior fill and cores are hit first from those origins), which is why the
  synthetic control is the one the claim rests on.

**Verdict: seals hold. No action. The 0 → 10 movement is a tool artifact, not a geometry
regression.** The durable fix is a facing test in `tools/void.mjs` — not my file; routing that
is the coordinator's call.

---

## 2. The budget: **1.73 M is the all-pass counted column. It is not a §1 breach.**

### Provenance of the number I reported

`shots/geo-bead/report.json`, hero: **250 draws / 1,728,539 tris.** That comes from
`shot.mjs` → `__GAME.setShot().stats` → `engine.stats`, and `Engine.js:267-274` is decisive:

```
this.renderer.info.reset();          // ← reset BEFORE the chain
postfx.render(this.dt);              // ← 3 cascade shadow passes + AO + outline + composite
this.stats.drawCalls = info.render.calls;
```

So `stats` accumulates **every pass**. It is exactly the "counted" column that
`RESULT-bud34-repin.md` ends with: *"Do not quote a row of the table above against 250/1.2M."*
I quoted one against 250/1.2M. That is the error, and it is mine.

§1 is scored on **main-view visible** (fixed ruling, ledger #34), and on that line §1 already
closed as bookkeeping across all ten shots.

### Beware the numeric coincidence

- counted column: 1.73 M against 1.2 M → **44 % over**
- scored main-view line: 0.675 M against 1.2 M → 56 % of budget → **44 % headroom**

Same digits, opposite meaning. This is very likely how the figure entered the brief as a breach.

### Current main-view census, measured (`scenecensus.mjs`, quality `high`)

Whole buildable scene, every mesh counted **once by uuid**, worst-case camera:

| | draws | tris | vs budget |
|---|---|---|---|
| **worst main-view (`dunes`)** | **88** | **0.675 M** | 35 % draws, **56 % tris** |
| in-boot direct measure, ledger #34 (`night`) | 93 | 0.668 M | 37 % / 56 % |

The offline census and the in-boot `budget.mjs` measurement agree to ~1 %. Offline is a *lower*
bound (it cannot build ink shells, fx or sky), and the agreement shows those add little
triangle mass — the architecture `HULL_OUTLINE` set is only three materials.

Counted / main-view for hero = 1.729 / 0.644 = **2.68×**, inside the independently measured
multiplier band 2.46–3.14. The 1.73 M is fully explained as main-view × pass multiplication.

### Answer to "is 44 % over a real problem at this quality tier?"

**No.** It is not a §1 compliance question at all. What it does measure is real frame cost —
casters are re-submitted per shadow cascade and are not culled to the main camera — and that is
the FRAME-TIME item ledger #34 explicitly classified as unsettleable on this GPU-less
container, where SwiftShader ms is meaningless.

### Where the content actually is

Scene content, counted once, no camera: **88 meshes / 0.675 M tris.**

| owner | meshes | tris | share |
|---|---|---|---|
| architecture | 43 | 323 k | 47.8 % |
| terrain (incl. vegetation + water) | 15 | 173 k | 25.6 % |
| props | 13 | 76 k | 11.3 % |
| guards | 13 | 72 k | 10.7 % |
| sly_root | 4 | 31 k | 4.6 % |

Largest single meshes: `arch:hall:hieroglyph_wall` 74.8 k · `sand_ring0` **73.7 k** (TERRAIN's,
the single largest mesh in the scene) · `arch:court:mudbrick` 46.4 k · `arch:court:hieroglyph_wall`
40.4 k · `arch:hall:column_papyrus` 29.5 k.

Mine (architecture + props) = 399 k = **59 % of scene content**. With 44 % headroom on the
scored line there is no §1 reason to cut it. If frame cost is ever pursued, the two cheapest
targets are `arch:court:mudbrick` (46.4 k for a temenos wall that stands *behind* the
colonnade) and `sand_ring0` (73.7 k, not mine).

---

## 3. Correction: `tools/scenebudget.mjs` over-reports world modules by ~25 %

The coordinator's brief quotes world modules at **89 draws / 0.728 M**. That figure is inflated.

`Terrain`'s constructor creates `Vegetation` and `Water` (`Terrain.js:471-472`), and
`Vegetation.init()` parents its group into `terrain.group` (`Vegetation.js:467`). `scenebudget.mjs`
then builds both a *second* time and also lists them as separate roots, so those meshes are
reachable by more than one traversal and are counted three times.

Verified by walking the terrain subtree directly: it contains `vegetation/` and `water/nile`.

| | draws | tris |
|---|---|---|
| `scenebudget.mjs` reports | 89 | 0.728 M |
| deduped truth (arch + terrain incl. veg/water + props) | **71** | **0.572 M** |
| over-report | +18 | +0.155 M |

Decomposition: terrain-proper 6 meshes / 94.7 k; vegetation 8 / 59.5 k; water 1 / 18.4 k.
`scenebudget`'s `terra` column is 6 + 9 + 9 = 24, then its `veget` and `water` columns count
that same second instance a third time.

`scenecensus.mjs` dedupes by uuid and does not build Terrain's children separately.
`tools/scenebudget.mjs` is not my file; the fix is one line (drop the separate veg/water builds).

---

## Open, with owners

- **`tools/void.mjs` facing test** — implement the test its comment specifies, so the headline
  number is the leak count. Until then its non-zero output needs `voidwhere.mjs` to interpret.
- **`tools/scenebudget.mjs` double-count** — stop building Terrain's children separately.
- **Pass multiplication (2.46–3.14×)** — real frame cost, not §1, unmeasurable here.

Nothing on this page requires a capture to re-verify; all of it re-runs offline in ~2 min.
