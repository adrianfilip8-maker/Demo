# PREREG-charmat — the protagonist's materials, and the gold that is only a colour

Registered **before** the candidate exists, per §141.1. Ground truth in §1 was measured first
(`node tools/charmat.mjs`, committed alongside this file); everything from §2 down is written
against numbers that do not exist yet.

---

## §1 — GROUND TRUTH, measured, and it corrects the brief that sent me

The task I was given quotes §262's census:

> `sly cane gold` is not a material in this build. The character is a single `slydlrig:mesh`
> at `TUNE` defaults, with `metal` 0.

**Two thirds of that is wrong, and the third that is right is the one that matters.**
`node tools/charmat.mjs` walks the player root of the shipped build (`?char=dlrig`, the
`main.js` default) and reports:

```
--- meshes ---
  slydlrig:mesh       SkinnedMesh  tris 13063  groups 4  mats [body, eyeball, head, tail]
  cane                Mesh         tris  1356  groups 1  mats [slydlrig:cane]
  cane_ink            Mesh         tris  1356  groups 1  mats [slyInk_2.5@1080]
  slydlrig:mesh_ink   SkinnedMesh  tris 13063  groups 4  mats [slyInk_2.5@1080]

--- materials (6) ---
  name                toon   color    spec   gloss  metal  rim    map
  slydlrig:body       true   #ffffff  0.25   32     0      0.62   sly_body.png
  slydlrig:eyeball    true   #ffffff  0.25   32     0      0.62   sly_eyeball.png
  slydlrig:head       true   #ffffff  0.25   32     0      0.62   sly_head.png
  slydlrig:tail       true   #ffffff  0.25   32     0      0.62   sly_tail.png
  slydlrig:cane       true   #e8b942  0.25   32     0      0.62   (vertexColors)
  slyInk_2.5@1080     false  —        —      —      —      —
```

- **WRONG — "not a material".** There is a cane material. It is `slydlrig:cane`, built at
  `SlyModelDLRig.js:_buildCane`, on its own `Mesh` named `cane`, at `#e8b942` — byte-identical
  to `Props.js MATERIALS.gold` and `Architecture.js gold_leaf`. The name the census searched for
  (`sly cane gold`) belongs to `SlyModel.js`, the **legacy** model, which is not what ships. The
  census looked for the legacy name, did not find it, and reported absence.
- **WRONG — "a single mesh".** The character is **four meshes and six materials** (five toon +
  one shared ink hull), and `slydlrig:mesh` carries four geometry groups.
- **RIGHT, and it is the whole finding — `metal` 0, and one spec class for all of him.** All
  five toon materials sit at *identical* `spec 0.25 / gloss 32 / metal 0 / rim 0.62 / sss 0.38`.
  The character is five materials wearing one shading response. **Sly's cane is gold in albedo
  and in nothing else**, and there is no metal anywhere on the protagonist.

So the *conclusion* the brief drew survives its own broken premise: this is not a missing
material, it is an **un-art-directed** one. That is a smaller bug to describe and exactly the
same bug to fix.

### §1.1 — the art direction already exists in this repo, twice, and was thrown away

`SlyModel.js:_matSpec` (the legacy procedural model, ~line 3569) is a fully art-directed
per-part table **for this same character**, with its evidence recorded inline:

```
fur        spec 0.025  gloss  8   sss 0.38   ("fur scatters; it has no highlight to speak of,
furCream   spec 0.02   gloss  8   sss 0.44    and a wide soft one is exactly the cue that
furDark    spec 0.03   gloss  9   sss 0.228   reads as moulded vinyl")
cloth      spec 0.085  gloss 20   sss 0.14
clothDark  spec 0.18   gloss 34   sss 0.10
gold       spec 0.9    gloss 96   sss 0.0    metal: true
```

and the world agrees with its gold row in two more places:

```
Props.js MATERIALS.gold     color 0xe8b942  rough 0.28  spec 0.9   gloss  96  metal 0.85
Pickups.js pickups:gold     color 0xe8b942              spec 0.9   gloss  96  metal 0.85
Architecture.js gold_leaf   color 0xe8b942  rough 0.22  spec 0.95  gloss 110  metal 0.85
```

**Three independent shipped sites agree on `spec 0.9 / gloss 96 / metal 0.85 / 0xe8b942`.**
Nothing below is invented. The cane row is `Props.js MATERIALS.gold` — taken because
`pickups:gold` already declares itself a copy of it ("Mirrors Props.js MATERIALS.gold exactly —
pickups must not become a sixth gold"), so it is the settled house gold, and because it makes
Sly's cane the same metal as the treasure he steals.

### §1.2 — two things I will NOT do, and why

- **No `detail` key.** `toon.glsl.js:366` samples the triplanar detail at `slyWorldPos(...)` —
  **world space**. On a character that moves through the world the detail would swim across the
  surface. That is very likely why no character material carries one today. A brushed-metal
  detail on the cane is the obvious idea and it is wrong here.
- **`slydlrig:eyeball` is not touched at all.** §15 records an eye hierarchy restored
  end-to-end. Zero fields change on it; it appears below only as an untouched control.

---

## §2 — THE CANDIDATE

Applied in `src/player/SlyModelDLRig.js` only. `rim` and `bands` are left at `TUNE` on every
part — they are silhouette/quantisation terms with their own seals, and this change is about
the **specular response and subsurface**, which is what "he reads flat" names.

| material | spec | gloss | metal | rough | sss | source |
|---|---|---|---|---|---|---|
| `slydlrig:cane` | 0.25 → **0.9** | 32 → **96** | 0 → **0.85** | 0.62 → **0.28** | 0.38 → **0.0** | `Props.js MATERIALS.gold` |
| `slydlrig:head` | 0.25 → **0.025** | 32 → **8** | 0 | — | 0.38 | `SlyModel.js` `fur` |
| `slydlrig:tail` | 0.25 → **0.03** | 32 → **9** | 0 | — | 0.38 → **0.228** | `SlyModel.js` `furDark` |
| `slydlrig:body` | 0.25 → **0.085** | 32 → **20** | 0 | — | 0.38 → **0.14** | `SlyModel.js` `cloth` |
| `slydlrig:eyeball` | 0.25 | 32 | 0 | — | 0.38 | **UNCHANGED (§15)** |

`specColor` is left at its default `PAL.goldSpec 0xfffbe8` for every part: the "warm tint" the
task asks for arrives anyway, because `toon.glsl.js:721` sets
`specTint = mix(uSpecColor, alb*2.0 + uSpecColor*0.25, slyMetal)` — at `metal 0.85` the cane's
highlight is derived from its own gold albedo. Tinting the uniform as well would double it.

### §2.1 — `metal` 0.85 vs 1.0 is a real fork, and it is swept, not chosen

`toon.glsl.js:664-675` already argues about this material by name:

> `diff *= mix( 1.0, 0.20, slyMetal )` removes 68% of gold's own colour at metal 0.85 […]
> **68% is the value at metal 0.85 — the WORLD's gilding — and it is quoted for the character's
> cane, where it is wrong.** `SlyModel.js` binarises metal to `(spec.metal ? 1 : 0)`, so every
> gilded surface on Sly runs `uMetal` **1.0** […] the multiply is 0.20 — **80% removed**.

So the two reusable sources disagree: the world's gold says 0.85, the character's own legacy
gold says 1.0. Both are swept as arms (C1, C2). The registered default if both pass is **0.85**,
because it is the value the *current* build actually runs in three places and the more
conservative of the two on diffuse.

---

## §3 — THE INSTRUMENT

One boot. `setShot(name, { dt: 0 })` on every arm (§251). Arms are live pokes of
`mat.userData.slyUniforms` + `mat.roughness`, which `onBeforeCompile` Object.assigns into the
program by identity, so a poke is live and no recompile reorders anything (the `gildmetal.mjs`
pattern).

**The cane mask.** The cane's exact screen footprint is obtained by *differencing*, not by
projecting a bounding box: render with `cane.visible = true`, render with `cane.visible =
false`, and the mask is every pixel that differs. All cane statistics below are computed inside
that mask, on `sly-closeup` and `hero`.

Shots: **`sly-closeup`** (cane nearest camera) and **`hero`**. Both are registered; a guard must
hold on *both* unless it names one.

### §3.1 — arms

| arm | what | role |
|---|---|---|
| I1 `base` | shipped values | reference |
| I2 `base2` | I1 repeated, nothing poked | **null arm — MUST be 0 px vs I1** |
| I3 `hide` | `cane.visible = false` | **positive control — MUST differ from I1**, and defines the mask |
| C1 `gold85` | cane at spec .9 / gloss 96 / metal 0.85 / rough .28 | candidate |
| C2 `gold100` | as C1 but `metal 1.0` | candidate (§2.1 fork) |
| I4 `restore` | every poke reverted to I1 | **MUST re-equal I1 at 0 px** |
| C3 `split` | head/tail/body at §2's fur/cloth rows, cane at C1 | candidate |
| I5 `eyectl` | `slydlrig:eyeball` uniforms read back after C3 | **MUST be bit-identical to I1's** |

**I2 and I3 are the pair that makes this readable.** §255's lesson is that a null arm proves
repeatability, not sensitivity — a whole block rendered black and its null passed, because black
equals black. I3 is the arm that **must fire**: if hiding the cane changes zero pixels, I am not
looking at the cane and every number below is VOID regardless of what it says.

---

## §4 — GUARDS, registered now, scored with `tools/gate.mjs` (tri-state, VOID ≠ PASS)

Let `M` = the cane mask; `L` = display luminance (Rec.709 on the 8-bit PNG).

**Instrument guards — any VOID/FAIL here voids the whole run:**

- **I2** `base2` vs `base`: differing pixels **== 0**.
- **I3** `hide` vs `base`: differing pixels **> 200** on `sly-closeup` (the cane is ~1356 tris
  held at chest height in a 38° lens; a two-order-of-magnitude smaller mask means the wrong
  object). `|M|` is reported per shot and is the population every C-guard is defined over.
- **I4** `restore` vs `base`: differing pixels **== 0**.
- **I5** eyeball `uSpec/uGloss/uMetal/uSss/uRim` after C3 **==** their I1 values, exactly.

**Candidate guards, on `M`:**

- **G1 (it is brighter where a lobe belongs)** — `p99(L)` inside `M` rises by **≥ +10 L**
  on `sly-closeup`. A tight bright lobe shows in the top percentile; the mean is the wrong
  statistic for a lobe that is supposed to be small.
- **G2 (it is not merely brighter everywhere)** — the rise is *concentrated*:
  `Δp99 − Δp50 ≥ +6 L` on `sly-closeup`. A metal read that lifts the whole cane uniformly is a
  brighter dielectric, not a metal, and fails this even if G1 passes.
- **G3 (metal does not eat the cane)** — `p50(L)` inside `M` must not fall by more than
  **25 L** on either shot. `diff *= mix(1,0.20,slyMetal)` is a real risk and this is the arm
  that catches it; a bigger fall means the stylised `metalEnv` is not paying back what the
  diffuse kill costs, and the correct answer is a lower `metal`, not a shipped dark cane.
- **G4 (nothing else moved)** — for C1/C2, pixels differing from `base` **outside** `M` **== 0**.
  `slydlrig:cane` is carried by one mesh and nothing else may respond to its poke.
- **G5 (the split does not wash the character out)** — for C3, outside `M`, `p99(L)` must not
  *rise*: `Δp99 ≤ +1 L`. Every part except the cane gets *less* specular, so the body must get
  duller or stay put. A rise means I have poked something I did not intend.

**Ship rule.** The cane row ships iff `I2 ∧ I3 ∧ I4` PASS and `G1 ∧ G2 ∧ G3 ∧ G4` PASS for the
chosen `metal`. The split ships iff additionally `I5 ∧ G5` PASS. The two ship **independently**:
a failed split does not block the cane, which is the point of measuring them apart.

---

## §5 — FORECAST, to be scored against the result

Written before any capture. I expect to be wrong somewhere and the interesting part is where.

1. **I3 fires with `|M|` between 1 000 and 6 000 px on `sly-closeup`.** (0.7)
2. **G1 passes.** Spec amount goes `uSpec` ×3.6, metal `mix(1,3.4,·)` ×3.04, and
   `(1−0.75·rgh)` 0.535→0.79 ×1.48 — about **×16** on `specAmt`. If any of the mask is lit, the
   top percentile has to move. (0.85)
3. **G2 passes** — `gloss` 32→96 narrows the lobe, so the lift should be concentrated by
   construction. (0.75)
4. **G3 is the one I expect to be close, and I forecast p50 FALLS by 5–20 L** at metal 0.85 —
   passing, but not comfortably — and **falls further at metal 1.0**, possibly failing there.
   This is the guard I most expect to decide the 0.85/1.0 fork. (0.55 that 0.85 passes and 1.0
   fails; 0.30 that both pass; 0.15 that both fail.)
5. **G4 passes.** (0.9)
6. **G5 passes.** (0.8)
7. **A prediction that costs me something:** I expect the cane to get *visibly darker in shadow*
   and much brighter in the lobe, i.e. **higher contrast, not higher brightness** — so I forecast
   the cane mask's *mean* L moves by **less than 8 L** even when p99 moves by more than 10.
   If mean and p99 move together by similar amounts, my model of this shader is wrong. (0.6)

## §6 — relation to PREREG-specnorm2, which is NOT mine to resolve

SPECNORM's seal predicts DO NOT SHIP at every swept `uSpecNormPow`, with the conflict located in
`p ∈ [0.84, 0.95]` — described to me as the width of the disagreement between energy
conservation and **Sly's un-art-directed `uSpec 0.25`**. §2 moves the three body materials from
0.25 to **0.025–0.085**, i.e. below the `paving` 0.10 / `sandstone_block` 0.14 that §262's census
shows behaving under the same lever, and moves the cane to **0.9**, next to `gold_leaf`'s 0.95,
which that census also shows behaving (+10.0 L). **I make no claim that this clears that seal**
and I score nothing against it. It is recorded only so that, if the interval moves after this
lands, the cause is already written down instead of reconstructed.
