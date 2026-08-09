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

**Ship rule.** The cane row ships iff `I2 ∧ I3 ∧ I4` PASS and `G1 ∧ G2 ∧ G3 ∧ G4′` PASS for the
chosen `metal`. The split ships iff additionally `I5 ∧ G5` PASS. The two ship **independently**:
a failed split does not block the cane, which is the point of measuring them apart.

### §4.1 — AMENDMENT to G4, registered before the run booted and before any candidate number existed

Timestamped by its own commit, which lands while `tools/canegold.mjs` is still printing
`waiting for capture lock (168s, held by pid 6594)` — SPECNORM holds the lock, my run has not
booted, and no arm has been rendered. Nothing below is informed by a result.

**G4 as written above is mis-derived, and I found it by auditing my own guard rather than by
seeing it fail.** "Pixels differing outside the cane mask == 0" assumes a material poke can only
change the pixels the material paints. That is false in the presence of a **spatial**
postprocess: bloom is applied after compositing, so if the gold lobe crosses the bloom threshold
its light spreads into neighbouring pixels *outside* the mask. A cane that blooms is the correct
behaviour for polished gold, and the guard as registered would have called it a failure.

Two things were checked before amending, and one of them removed a different worry entirely:

- **The metal *tag* cannot leak.** `PostFX.js` ships `bloomMetalGain: 0` and `bloomMetalCut: 0`,
  both documented as exact no-ops, and "nothing else reads scene alpha — bright/down/up/
  composite/raw all sample `.rgb` only". So raising `uMetal` does **not** by itself reach any
  scene-wide term. This was the risk I went looking for and it does not exist.
- **Ordinary luminance bloom can still spread**, and that is what G4 fails to allow for.

So G4 is superseded by **G4′**, which keeps the intent ("the poke changed nothing far from the
cane") while allowing a local halo:

> **G4′** — let `B` be the mask's bounding box dilated by **16 px** on each side. Pixels
> differing from `base` **outside `B`** must be **0**. The count of differing pixels that fall
> outside the mask but inside `B` is **reported, not gated** — it is the bloom halo, and its size
> is evidence about the lobe rather than a verdict on it.

**G4 is still computed and still reported.** If G4 fails while G4′ passes, that is the bloom
halo and it is stated as such; G4 is then recorded as **mis-derived ⇒ VOID**, per §141.1, and is
not re-derived a second time. The ship rule above names G4′ because G4′ is the guard that
survives its own audit.

---

## §4.2 — the two numbers I "reused" are not the numbers the shipped gold runs at

Also registered while the runner still prints `waiting for capture lock` and nothing has
rendered. Found by reading `src/textures/Materials.js`, not by seeing a result.

`Props.js MATERIALS.gold` — the row §2 copies — reaches the shader **through two maps the cane
does not have**, and both of them change the number that actually arrives:

- **`rough: 0.28` in that table is dead code.** `ToonMaterial.js` sets
  `roughness: o.roughnessMap ? 1.0 : o.rough`, and Props' gold passes a `roughnessMap`. So its
  `rough` field is never read; `rgh` comes from the map, whose **median is 0.638**
  (`Materials.js`, the `specAmt` derivation that computes `0.95 · (1 − 0.75·0.638) · 3.04 =
  1.506`). §262 recorded this same trap for `sandstone_block`. Copying `0.28` onto an unmapped
  tube does not reproduce Props gold — it makes the cane **less rough than any gold in the
  game**, and `specAmt ∝ (1 − 0.75·rgh)` turns that into ×1.51 more specular than the gilded Ra.
- **`metal: 0.85` is masked there and unmasked here.** The shader does
  `slyMetal *= texture2D( metalnessMap, … ).b`, and `Materials.js` percentiles gold "over the
  gild mask, `metal > 0.5`" — so only part of that surface is metal at all. The cane has no
  `metalnessMap`, so `uMetal` applies to **every texel**. `tools/gildmetal.mjs` warns about
  exactly this shape ("no metalnessMap — slyMetal is UNMASKED").

So "reuse rather than invent" has a trap in it: the *written* row and the *effective* row are
different, and §2 copied the written one. A third arm is registered to measure the difference
rather than argue it:

| arm | spec | gloss | metal | rough | what it reproduces |
|---|---|---|---|---|---|
| C1 `gold85` | 0.9 | 96 | 0.85 | **0.28** | Props gold as *written* |
| C2 `gold100` | 0.9 | 96 | **1.00** | 0.28 | `SlyModel.js` gold as written |
| **C4 `gold85r64`** | 0.9 | 96 | 0.85 | **0.638** | Props gold as it *effectively runs* |

**Ship preference among arms that pass, registered now:** **C4 → C1 → C2**, ordered by how
closely each reproduces the specular coefficient the shipped gold actually operates at
(`specAmt` 1.43 for C4 against 2.16 for C1). If C4 passes, C4 ships. This ordering is fixed
before any arm has rendered; it is not to be re-ordered afterwards.

G1/G2/G3/G4′ are evaluated on **C4** as well as C1, and the §4 ship rule reads "for the chosen
`metal`/`rough`" accordingly.

## §4.3 — G5 could not see its own subject; the split gets a character mask and a control

Third and last amendment, again registered while the runner prints `waiting for capture lock`
and nothing has rendered.

**G5 as registered in §4 is nearly blind.** It reads `p99` of everything *outside the cane mask*
— which at 1280×720 is 99.8 % of the frame, dominated by sky, sand and architecture. The split
changes four thousand-odd character pixels. A statistic computed over the whole frame cannot
resolve that, and would have returned "no change" whatever the split did. **This is §255's
failure exactly** — a whole block rendered black and its null passed, because black equals black
— and I would have shipped a guard that could only ever say PASS.

Fixed the same way the cane was: **by differencing.** Hide `slydlrig:mesh`, diff, and the
character's own screen footprint `B` falls out. The split is then measured on `B`.

- **I6 (positive control, must fire)** — `|B| > 2000 px` on `sly-closeup`, `> 0` on `hero`, and
  re-showing the body must return to `base` at **0 px**. If hiding the character changes nothing,
  every split number is VOID.
- **G5′** — on `B`: `p99` must not rise by more than **1 L**. Every part except the cane gets
  *less* specular, so the body must get duller or stay put.
- **G6 (the split is not a no-op)** — on `B`: `|Δmean| ≥ 0.5 L`. A split that changes nothing
  measurable is not worth the risk of shipping, and this is the arm that would catch me poking
  materials that were not the ones on screen.

G6 is deliberately a *two-sided* requirement paired with G5′: G6 says something happened, G5′
says it happened in the right direction. Neither alone is sufficient and I registered both
before seeing either.

## §4.4 — an external gold arrives mid-run, and it overturns §4.2's ship preference

The owner supplied `public/assets/sly-cane/sly-cane.glb` while this run was still queued
(`waiting for capture lock (1463s, held by pid 6594)`). **No arm had rendered.** Amending on new
external evidence, before data, is the same standing as §4.1–§4.3.

### What I verified myself rather than taking from PROVENANCE.md

`tools/glbpeek.mjs` parses the GLB's JSON chunk and decodes the embedded PNGs — no three, no DOM,
no capture lock. `tools/canesize.mjs` builds the real `Cane.js` geometry in plain node.

**Confirmed:** 494 tris / 576 verts / 2 prims / 2 materials, no skins, no animations, no
extensions, TANGENT present. `Cane.metalRough` measures **roughness (G) 0.250, metalness (B)
0.801** — the provenance's headline number, exactly. `Cane.normal` carries real detail
(R 7–249, G 14–245). The hook curls in **±X** (x spread 0.300–0.369 across the top three height
slabs against z 0.042–0.059), against `Cane.js`'s +Z, so a 90° Y rotation is needed; the shaft
sits at x ≈ −0.108 and the hook opens toward **+X**, which makes the sign **−90° about Y**.

**Corrected — and it matters.** PROVENANCE.md says "1.5904 units against `CANE_TUNE`'s ~1.30 m
cane ⇒ uniform ×0.817". `Cane.js`'s built geometry measures **y-extent 1.5150 m**, not ~1.30:

```
Cane.js         tris 1356   bbox y [-0.8140 .. 0.7010]   extent y 1.5150
                hookPoint [0, 0.4956, 0.1445]   tipPoint [0, -0.796, 0]
glb raw         extent y 2.0000        node scale 0.7952   ->  post-node 1.5904
uniform scale needed = 1.5150 / 1.5904 = x0.9526      (NOT x0.817)
```

The quoted factor would have shipped the cane **16 % too short**. This is exactly why the
instruction was to derive it rather than take the figure.

### The geometry does NOT come in. The values do.

Recorded plainly, as the coordinator asked, because "only the two material numbers" is a real
outcome and not a failure:

1. **§221 is decisive on its own.** The cel shader replaces three's light loop, so the
   `metalRough` and `normal` maps cannot be wired at all. The geometry would arrive with its
   authored materials unusable and I would *still* be hand-authoring `uMetal`/`uSpec`/`uGloss`.
   The asset's contribution is the numbers either way.
2. **It would put a verified behaviour at risk for an unmeasured gain.** `hookPoint`
   `[0, 0.4956, 0.1445]` and `tipPoint` `[0, −0.796, 0]` are what MOVEMENT catches rings with and
   what §10 tip-verified in GPU geometry. Foreign geometry re-derives both.
3. **It discards tuning that has recorded evidence behind it.** `hookRadius` 0.168 and
   `hookSweep` 3.35 rad (192°, "an open C, not a closed ring") were set against critic reports of
   "a bangle" and "a detached orange hook". Swapping the mesh throws that away unmeasured.
4. **494 tris with an empty mid-shaft** (y −0.75…0.00 carries no vertices) against 1356, and the
   inverted-hull ink quality on that tube is unmeasured.
5. **The normal map would likely fight the ramp** — the `assets/tombchaser/` precedent, where
   normal and metallic maps were staged and deliberately left unwired for this reason. And
   `shader.normal` is a 257 KB identity map that should be dropped whatever else happens.
6. **Licence is UNKNOWN**, which is weaker than `kaykit`/`tombchaser` (explicit CC0). Not a veto,
   but it is a reason not to prefer this geometry over geometry the project already owns.

### The revised ship preference, and why §4.2 was reasoning from the wrong referent

§4.2 preferred **C4 (`rough` 0.638)** because that is `gold_leaf`'s effective roughness once its
`roughnessMap` is accounted for. That observation is still true and still worth having. **But
`gold_leaf` is gold leaf over aged stone — an architectural gilding — and a cane is a polished
solid prop.** I applied a correct measurement to the wrong object.

Two independent sources now agree on what polished gold is:

| source | metal | rough |
|---|---|---|
| `Props.js MATERIALS.gold`, as written | 0.85 | 0.28 |
| this asset, authored by an external artist in a PBR tool | **0.80** | **0.25** |

That agreement is much stronger evidence for a cane than `gold_leaf`'s 0.638. So a fifth arm is
registered at the asset's authored pair, and the preference is re-ordered:

| arm | spec | gloss | metal | rough | source |
|---|---|---|---|---|---|
| **C5 `assetgold`** | 0.9 | 96 | **0.80** | **0.25** | the supplied asset's authored PBR |
| C1 `gold85` | 0.9 | 96 | 0.85 | 0.28 | Props gold as written |
| C4 `gold85r64` | 0.9 | 96 | 0.85 | 0.638 | Props gold as it effectively runs |
| C2 `gold100` | 0.9 | 96 | 1.00 | 0.28 | `SlyModel.js` gold |

**Ship preference among arms that PASS: C5 → C1 → C4 → C2.** `spec` and `gloss` are *not* taken
from the asset — a PBR file has no opinion about a cel shader's stepped lobe — so they stay at
the house `Props.js` values and only `metal`/`rough` come from the asset. Registered before any
arm has rendered; not to be re-ordered afterwards.

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
