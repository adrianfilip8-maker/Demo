# NOTE-budgetattrib — the §1 breach, attributed: who owns the triangles, and what the counter counts

Offline, no boot, no capture lock, no GPU. Tree `083c755`, run from a clean `git archive HEAD`
export. Probe: `tools/budgetattrib.mjs` (new). Durable tables and machine-readable rows:
`progress/records/budgetattrib/{table-headless.txt, table-inpage.txt, headless.json, inpage.json}`.

Two blind critic rounds (§308 / RESULT-critic12, RESULT-critic11) put a §1 budget breach on the
record with numbers: *"15 of 16 shots exceed the 1.2 M triangle cap — night 2,574,537 = 2.1×"*.
Nobody had ever attributed it. This note attributes it, and the attribution changes the item.

---

## The three findings

**F1 — The breached column is not the budgeted quantity, and this is the fourth time it has been
found.** `shots/r12/manifest.json`'s `triangles` is `renderer.info.render.triangles`
(`Engine.js:274`) with `autoReset = false`: reset at `Engine.js:267`, read after the entire
PostFX chain. It is a **per-frame, all-passes submission counter** — three shadow-cascade renders
plus the beauty pass plus a full-scene normal prepass plus the blits, summed. §1 caps *visible*
geometry, and this repo's own `tools/scenebudget.mjs` header, AGENTS §1.2, §51.3, §53.5, §215.2
and `RESULT-budget34-verdict.md` all already say so. **On the scored column, 0 of 16 shots breach
§1 on either cap, under either reading below** — worst 54% of the triangle cap and 34% of the draw
cap on the headless floor, worst 96% and 45% on the in-page substitution (F3). The friendlier
number is not the one this rests on: both readings are printed in every table here, and the
verdict is the same under the harsher one.

**F2 — The first per-shot, per-owner attribution exists now, for all 16 shots.** Table below.
Nothing in `src/world/**` is a plausible cut target: the *entire* level — architecture, props,
terrain, vegetation, water, guards — is **0.647 M triangles in total, with culling switched off**.
That is the ceiling no camera can exceed, and it is 54% of the 1.2 M cap. **You cannot cut 1.35 M
triangles out of a 0.647 M scene.** The cut the critics' number implies is larger than everything
that exists, twice over.

**F3 — The one real mass story is new, and it is GUARDS, not the world.** `carmelita-guard.glb`
landed 2026-08-08 (`f365058`), six days *after* the last in-page budget table, and
`Guard.js:1301` swaps it onto the `temple` and `heavy` roster types — **9 of 11 guards**. Measured
off the asset: **29,791 triangles per guard body**, against ~1.2–5 k for the procedural body it
replaces, and `Guard.js:1501` shells every guard (an ink shell is a second draw of the same
triangles). Substituting the measured asset mass onto the headless roster puts the level at
**1.149 M — 96% of the cap** and makes guards the largest triangle owner in seven of sixteen
shots, ahead of architecture. That leg is a *model*, not an in-page measurement; it is
pre-registered for settling below (§Open leg), and it is the only part of the §1 question that is
still open.

---

## The attribution table (offline, 1280×720, quality `high`)

`floor` = what builds headlessly (architecture, props, terrain+vegetation+water, procedural
guards). `in-page` = the same, with the measured Carmelita body / character / ink-shell mass
substituted. `counted` = the manifest column the critics quoted, at r12.

| shot | counted (r12) | floor main-view | in-page main-view | counted ÷ floor |
|---|---|---|---|---|
| night | 283 / 2.575 M | 78 / 0.632 M (53%) | 102 / 1.029 M (86%) | 4.07× |
| courtyard | 276 / 2.434 M | 84 / 0.640 M (53%) | 110 / 1.090 M (91%) | 3.80× |
| dunes | 261 / 2.314 M | 85 / 0.647 M (54%) | 113 / 1.149 M (96%) | 3.58× |
| hero | 253 / 2.306 M | 77 / 0.623 M (52%) | 98 / 0.967 M (81%) | 3.70× |
| sly-perch | 258 / 2.253 M | 78 / 0.625 M (52%) | 100 / 0.970 M (81%) | 3.61× |
| sly-closeup | 256 / 2.253 M | 78 / 0.625 M (52%) | 100 / 0.970 M (81%) | 3.61× |
| kaykit | 230 / 2.201 M | 69 / 0.613 M (51%) | 88 / 0.904 M (75%) | 3.59× |
| sly-key | 250 / 2.193 M | 76 / 0.625 M (52%) | 98 / 0.970 M (81%) | 3.51× |
| traversal | 239 / 2.181 M | 73 / 0.607 M (51%) | 92 / 0.899 M (75%) | 3.59× |
| temple | 227 / 2.008 M | 65 / 0.573 M (48%) | 75 / 0.653 M (54%) | 3.50× |
| sly-profile | 218 / 1.886 M | 68 / 0.593 M (49%) | 80 / 0.726 M (60%) | 3.18× |
| combat | 205 / 1.807 M | 53 / 0.537 M (45%) | 65 / 0.670 M (56%) | 3.36× |
| guard | 189 / 1.737 M | 38 / 0.399 M (33%) | 40 / 0.451 M (38%) | 4.36× |
| sly-startle | 171 / 1.398 M | 39 / 0.394 M (33%) | 47 / 0.421 M (35%) | 3.55× |
| sly-arm | 166 / 1.397 M | 37 / 0.393 M (33%) | 45 / 0.421 M (35%) | 3.55× |
| interior | 149 / 0.834 M | 40 / 0.363 M (30%) | 49 / 0.392 M (33%) | 2.30× |

**Worst scored draw count is 113 of 250 (45%).** The draw cap is not breached on any shot under
either reading, so the "6–7 shots over 250 draws" line has the same denominator error as the
triangle line.

### Per-owner, worst shot (`night`, in-page reading, 102 draws / 1.029 M)

| draws | tris | share | owner |
|---|---|---|---|
| 14 | 208,537 | 20.3% | guards / carmelita_body (7 visible × 29,791, 2 material groups each) |
| 7 | 208,537 | 20.3% | guards / carmelita_body **[ink shell]** |
| 1 | 74,876 | 7.3% | architecture / `arch:hall:hieroglyph_wall` |
| 1 | 73,728 | 7.2% | terrain / `sand_ring0` |
| 8 | 59,474 | 5.8% | terrain / vegetation (instanced) |
| 1 | 46,420 | 4.5% | architecture / `arch:court:mudbrick` |
| 1 | 40,352 | 3.9% | architecture / `arch:court:hieroglyph_wall` |
| 4 | 13,815 | 1.3% | player / `sly_root` (sly.fbx 13,321 + cane 494) |
| 4 | 13,815 | 1.3% | player / `sly_root` **[ink shell]** |

Full rows for `night`, `dunes` and `interior` in `budgetattrib/table-inpage.txt`.

**Architecture is already merged by material** — the whole temple is 43 draws for 323 k triangles,
and its single largest mesh is a 75 k hieroglyph wall. There is no draw-call win available there,
and decimation would spend look for ~2% of a budget that is not breached.

---

## Instrument verification, stated precisely (the brief's question, answered)

| question | answer, at `083c755` |
|---|---|
| is the counter per-frame-submitted or scene-total? | **per-frame submitted, summed over every pass.** `Engine.js:267` resets, `:273-274` reads after `PostFX.render()` returns. |
| which passes land in it? | 3 cascade shadow renders + beauty (`PostFX.js:1915`) + full-scene normal prepass with `overrideMaterial` (`PostFX.js:2029`) + ~11 full-screen blits. The prepass sets `renderer.shadowMap.autoUpdate = false` (`PostFX.js:1979`), so shadows are rendered **once**, inside the beauty pass. |
| are instanced draws counted once or per instance? | **once**, per `InstancedMesh`, with `count ×` its triangles — in the counter and in this probe alike. Vegetation is 8 draws for 59 k triangles because of it. |
| is frustum culling reflected? | **In the camera pass only.** The shadow cascades are fitted to their own ortho boxes (`Lighting._fitCascades`), not to the camera frustum, and `main.js:242` sweeps `castShadow = true` onto *every opaque mesh in the scene* — so the cascades redraw the level regardless of where the camera points. |
| does the counter measure what §1 caps? | **No.** §1 caps visible geometry; this counts submissions across passes. The two differ by 2.3×–4.4× (mean 3.55×). |

**The fingerprint, if the source reading is not enough.** `sly-closeup` — a tight portrait of a
1.8 m character — counts **2.253 M**. `hero`, a wide establishing shot of the whole courtyard,
counts **2.306 M**. Two framings that share almost no pixels land 2% apart. A number that barely
moves when the camera moves is not measuring what is in the frame; it is measuring the passes,
whose caster set is camera-independent. `interior` is the one low row for the same reason from the
other side: inside the sealed tomb the cascades have almost nothing to draw.

### The pass account, and what it cannot yet separate

Predicting the counted column from the pass structure (beauty + prepass + 3 cascades + blits,
cascades fitted with `Lighting`'s own split/sphere/pad arithmetic and the shot's own sun from
`evalAtmosphere(tod)`) reproduces it to about ±10% under **either** of two models, and the two
cannot be separated offline:

- **(A) procedural guards + the static shadow cache not saving** → night predicts 2.83 M vs 2.575 M measured.
- **(B) Carmelita guards + the static cache saving c1/c2 statics** → night predicts ~2.80 M vs 2.575 M measured.

Both over-predict slightly, which is what an AABB-vs-ortho-box caster test that ignores three's own
per-object shadow culling should do. **Both agree on F1**: the entire counted column is accounted
for by passes over a scene that is inside budget. Nothing is unexplained; there is no hidden
geometry anywhere in the frame.

---

## The frame-cost half, attributed for the first time: who is submitted into the shadow passes

The counted column is not a §1 quantity, but it *is* real work, and it had never been broken down
by owner either. The cascades are fitted around the camera slice, not the camera frustum, and
`main.js:242` marks **every opaque mesh in the scene** a caster — so this pass bills geometry that
is off-screen. Summed over the three cascades, `night` (in-page reading, 164 draws / 1.953 M
submitted):

| draws | tris | share | owner |
|---|---|---|---|
| 17 | 506,447 | 25.9% | guards / carmelita_body |
| 3 | 224,628 | 11.5% | architecture / `arch:hall:hieroglyph_wall` |
| 3 | 221,184 | 11.3% | terrain / `sand_ring0` |
| 24 | 178,422 | 9.1% | terrain / vegetation |
| 3 | 139,260 | 7.1% | architecture / `arch:court:mudbrick` |
| 3 | 121,056 | 6.2% | architecture / `arch:court:hieroglyph_wall` |

Every row is drawn **three times**, once per cascade. Under the in-page reading the guard bodies
are the single largest shadow cost in the frame — a 30 k-triangle body redrawn per guard per
cascade — which is the same owner F3 identifies from the other side, and the reason a guard LOD
would pay in the counted column even where it is invisible in the scored one.

**A second, smaller waste, quantified while it was in view.** The 12 meshes carrying
`frustumCulled = false` (vegetation's 8 instanced batches, `nile`, `coins`, `guard_beams`,
`guard_pools` — 86,200 triangles in total) are submitted whether or not the camera can see them,
in the beauty pass *and* the prepass. Per shot, the part that is off-screen and drawn anyway:

| shots | off-screen but drawn |
|---|---|
| temple, interior, guard, sly-startle, sly-arm | 11 draws / 67,768 tris (×2 passes) |
| traversal | 9 draws / 58,264 tris |
| combat | 8 draws / 52,000 tris |
| the other nine | 0 — they are all in frame |

Not a §1 item (those are the *low* shots), and not a free fix — `GuardModel.js:1900` documents
exactly why the flag gets turned off, and turning it back on needs a correct, generously inflated
bounding volume per mesh, not just the flag. Routed to TERRAIN / VEGETATION / PROPS with the
numbers rather than seized: those are their files, not this lane's (§1 module ownership).

`interior` shows the structural waste most clearly: 1.195 M triangles predicted into shadow maps
from inside a sealed tomb, the top items being the hypostyle wall, the desert sand ring, the palms
and the surface guards — none of which can cast into that room. Its *measured* counter is the
lowest of the set (0.834 M), which is the model's own over-prediction telling us something useful:
Architecture's zone-hiding does remove that geometry in-page, and the headless build does not
reproduce zone visibility. Read the interior row as "what a cascade fit would bill without zone
hiding", not as measured waste. **This is a FRAME-TIME item for RENDER/LIGHTING, not a §1 item,
and no geometry cut changes it** — the multiplier is the pass structure.

---

## Open leg — the guard mass, and the bands that settle it (pre-registered, §26.1)

Model (B) is the one that matters, because it is the difference between a level at 54% of the
triangle cap and a level at 96%. It needs **one** in-page reading —
`node tools/budget.mjs night dunes`, which walks the live scene graph and prints frustum-visible
draws/triangles per owner including shells. Bands stated **before** the run; every emittable value
lands in exactly one:

- **Band 1 — `guards` main-view triangles in `night` ≥ 150 k.** The Carmelita body is live in the
  captured build. The scored reading is ~0.9–1.15 M (75–96% of cap), headroom is thin, and **the
  §1 mass owner is GUARDS**: the seal that follows is a guard-body decimation / LOD / shell-drop
  A/B, highest-mass-first, not an architecture cut.
- **Band 2 — `guards` main-view triangles in `night` < 150 k.** The procedural body is what
  renders (the import is not reaching the capture path). The scored reading is ~0.63 M (53%),
  headroom is 47%, **no cut is warranted anywhere**, and the whole §1 item closes as the
  denominator error in F1.

The partition is wide by construction: the two models predict 208 k and ~9 k for that cell.
Secondary readings the same run yields, recorded but not gating: whether guard ink shells exist
in-page (the r12 critic calls the guards "outline-less"), and the same-tree counted-vs-main-view
pair for `night`, which re-measures the multiplier at HEAD.

---

## What this means for the standing §1 item

1. **The r12/r11 headline is withdrawn as stated.** "15 of 16 over the triangle cap, 6–7 over the
   draw cap" is a reading of the all-passes counter. On the scored column: **0 of 16 over on
   either cap**, worst 54% / 45%. This is now the fourth independent re-derivation of the same
   correction (§51.3 → §53.5 → §215.2 → here), and each time it was rediscovered from scratch.
2. **The defect that keeps causing it is a labelling defect in the artefact the critic reads.**
   `tools/critic.mjs` writes `drawCalls`/`triangles` into `manifest.json` with no indication of
   what they are, and `CRITIC.md` hands the critic the §1 numbers to compare them against. Any
   honest reader breaches. **The instruction half is fixed here** — `tools/CRITIC.md`'s "still fair
   game against the §1 budget" line now says the opposite, with the reason and the pointer to the
   scored tool. **The emitter half is routed, not done**, deliberately: `critic.mjs` is live
   capture tooling and five lanes are queueing runs against it. The minimal recipe for its owner,
   for whenever the queue is quiet: keep `drawCalls`/`triangles` byte-identical (renaming them is
   the §144 hazard — every historical manifest becomes unreadable), and *add* one field per shot,
   `submitted: true`, plus a top-level `budgetNote` string naming what the column is and where the
   scored one comes from. Additive, no reader breaks, and the next critic cannot make the mistake.
3. **The pass multiplication is real cost and stays open — as FRAME TIME, not as §1.** 3.55×
   mean submission multiplication over an in-budget scene is the cascades redrawing a level that
   `main.js:242` marked entirely as casters. Owner: RENDER/LIGHTING. Not settleable on this
   GPU-less container (SwiftShader ms is meaningless), and unchanged by any geometry cut.
4. **No cut is proposed in this note.** Under Band 2 none is warranted; under Band 1 the target is
   guards, and it is a character-art change that needs its own sealed A/B with pixel protection.
   Proposing an architecture/props decimation now would be spending look on a budget that is not
   breached — exactly the error §215.2 warned about when it withdrew §208.

---

## Method, and what this probe does not cover

`tools/budgetattrib.mjs`, offline: builds `Architecture`, `Props`, `Terrain` (which *contains*
vegetation and water — building them separately triple-counts, §130) and `Guards` against a stub
engine; walks each root; counts a mesh as one draw and `count ×` geometry triangles; tests each
mesh's world bounding sphere against each shot's camera frustum for the main-view column; and fits
the three `high`-preset cascades with `Lighting`'s own arithmetic for the pass account.

Stated gaps — every one of them makes the floor reading a **floor**:

- The character cannot load in Node (`SlyModelDLRig` resolves its FBX through `import.meta.glob`,
  §216). In `--inpage` it is substituted at its measured asset mass: `sly.fbx` parsed offline
  under `tools/_domshim.mjs` = 4 meshes / **13,321 triangles**, plus `sly-cane.glb` = **494**.
- `loadCarmelitaGuard()` returns null without fetch, so the headless guards wear the procedural
  body. `--inpage` substitutes **29,791** triangles per humanoid guard, summed off the GLB's 21
  primitive index accessors, at 2 draws each (`CarmelitaGuard.js` merges 21 meshes into one
  geometry with two material groups).
- FX emitters, the sky dome, the HUD and the KayKit showcase row are not built. budget34 measured
  FX and sky at 10–13 draws and ~3 k triangles combined; they do not move any conclusion here.
- Guards stand at their roster patrol positions at t = 0; `SHOT_POSE` staging (which reposes one
  guard for the `guard` shot) is not reproduced.
- **12 of 112 meshes carry `frustumCulled = false`** (vegetation's 8 instanced batches, `nile`,
  `coins`, `guard_beams`, `guard_pools`) and are therefore drawn whether or not they are in
  frame; this probe still frustum-tests them, so shots that do not see them are under-reported by
  up to ~86 k triangles / 12 draws. It matters only where they are off-screen — `interior`, whose
  0.363 M floor row should be read as ~0.45 M. No verdict in this note moves on it, and it is a
  cheap real saving for whoever owns those flags (an off-screen palm batch costs a full draw).

Reproduce: `node tools/budgetattrib.mjs [--inpage] [--json out.json] [shot ...]`. Runs in ~40 s.
