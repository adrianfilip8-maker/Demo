# Critic — scoring pass 3

**Review set:** `shots/r3/` — 1280×720, quality `high`, captured by me on 2026-08-01 11:17–.
**Reviewer:** adversarial art director per `tools/CRITIC.md`. No involvement in the build.

> **This supersedes the partial pass-3 report that previously occupied this file.** That one
> scored six shots against commit `9616d7d`; the container was restarted and that run was lost.
> Everything below is re-measured against `073d075`. Where the two agree I say so, because two
> independent captures twelve commits apart agreeing to one decimal place is itself evidence.

---

## Provenance — read this before using any number below

`tools/critic.mjs` **still does not stamp `commit` into its `manifest.json`.** `gitDesc()` exists
only in `tools/shot.mjs`, which writes `shots/report.json`. I recorded provenance by hand around
every batch:

| batch | shots | HEAD | tree at page-load | frames |
|---|---|---|---|---|
| 1 | `hero` `temple` `courtyard` | `073d075` | **clean** | 11:28 / 11:31 / 11:35 |
| 2 | `sly-closeup` `dunes` `interior` | `073d075` | **dirty** (see below) | pending |
| 3 | `night` `traversal` `combat` `guard` | `073d075` | **dirty** | pending |

Batch 1 is a clean `073d075`. I can state that precisely because `vite.config.js:12-13` sets
`hmr:false` and `watch:{ignored:['**/*']}` under `SANDS_NO_HMR`, which the harness always sets —
so the page's module graph is frozen at page load and later edits on disk cannot reach it. Batch
1's page loaded at ~11:20; the first agent edit landed at 11:28:03 (`src/player/Body.js`), after
`hero` had already rendered. **Batch 1 is one coherent build.**

Batches 2 and 3 are not the same build as batch 1. By 11:35 the tree carried uncommitted edits to
`src/fx/Particles.js`, `src/player/Body.js`, `src/player/Clips.js`, `src/player/SlyModel.js`,
`src/world/EgyptLevel.js` and `src/world/Kit.js` — five agents are working live. Their scores are
against `073d075 + those working-tree edits`, and I say so again at each shot.

**What this build does NOT contain.** `PAL.shadowTintPeak = 0.52` (`ToonMaterial.js:182`) and the
`k = Math.min(k, maxK)` clamp (`:879-881`) are **both still present**. The daylight-shadow fix I
was told was "being tested right now" **is not in the tree I captured.** Every daylight score
below is against the clamped build and should be re-run when that lands.

**Method.** Every PNG and every 2× centre crop opened with the Read tool and looked at. Every
number is measured off the captured pixels with a decoder I validated first by reproducing pass
2's published `hero` figures exactly (L 121.6, sat 0.423, warm 88.7%, cool 1.9%). Nothing is
judged from `shots/*.png` at the repo root or from any other label.

**Blind comparison.** I am working from my own knowledge of Super Mario Odyssey, Tears of the
Kingdom, Breath of the Wild and Sly Cooper: Thieves in Time. There are no reference images in this
repo and I did not download any. Every comparison below is memory against pixels, and I say so
rather than implying I have a frame open beside me.

---

## Verdict: **REJECT**

*(Scores complete for batch 1. Batches 2 and 3 append below as they clear the lock.)*

| shot | pass 2 | pass 3 | Δ | one-line |
|---|---|---|---|---|
| `hero` | 5 | **3** | −2 | Lost two-thirds of its light values. Key light is expressed *backwards* |
| `temple` | 4 | **4** | 0 | Real shafts, real depth, best composition — on columns with no form |
| `courtyard` | 5 | **4** | −1 | Best colour in the set; its title object is a 1.18:1 cube |

---

## Did it move the needle? Measured, not asserted

I was given a list of things fixed since the 4.2 baseline. Here is what the pixels say about the
ones that touch batch 1.

**Genuinely landed — credited once, briefly, per `CRITIC.md`:**

- **Ink lines are exactly on spec and stay that way.** Darkest 0.5% of each frame measures
  `#18121f` / `#19131e` / `#1b141c` — dark violet-brown, sitting between §2.1.2's `#1a1210` and
  `#161022`. **Zero pure-black pixels in 2.76 M.** Stop touching this.
- **The bright cool contact line is gone.** Pass 2's `#598aa2` L129 line between surfaces at L87
  and L65 does not exist in any of these three frames. Walking down the `hero` ledge/pier contact
  gives 91 → 36 (ink) → 62; the `courtyard` obelisk/plinth contact gives 82 → 54 → 47. Darkening,
  not brightening. The `uRimCurve` convexity gate did the job it was added for.
- **Texture tiling stays fixed.** Horizontal-period |ΔL| on `hero`'s ledge runs 18.2 / 21.6 / 23.8
  / 25.9 / 25.1 / 28.0 / 28.3 / 27.5 / 25.3 at 16…192 px — no repeat peak. Do not re-open it.
- **Airborne particulate exists.** Motes are visible in all three frames and clearly resolved in
  `temple`'s shafts at 2×. Pass 2's `fx: no emitter named "embers"` warning is gone from the
  manifest. §7.3's particulate condition **passes** three for three.
- **Volumetric shafts are real and they are the best thing in the build.** See `temple`.

**Did not move at all:**

- **The daylight palette.** `hero` measures warm **21.1%** / cool **63.5%**, L 86.5, sat 0.331.
  My capture twelve commits earlier at `9616d7d` measured warm 21.1 / cool 62.5 / L 86.7 / sat
  0.331. `temple`: warm 13.9 / cool 63.0 now against 13.5 / 64.3 then. **Two independent captures,
  twelve commits apart, agreeing to a decimal place.** Nothing in those twelve commits touched the
  daylight palette, which is exactly what you would predict from `shadowTintPeak` still clamping.
- **The `hero` sky.** Like-for-like patches, pass 2 → r3: top-left `#a29da2` sat 0.059 → `#8e8a91`
  sat 0.100; left horizon `#b8a8a2` sat 0.12 → `#af9f9b` sat 0.137. Still grey. Still no cloud, no
  bird, and **still no pyramid** in the shot §7.2 defines as "Sly on a temple ledge, sun raking,
  **pyramid behind**". Third pass running.

**Moved backwards.** Value structure, as fractions of frame area:

| shot | dark <L80 (p2 → r3) | light ≥L140 (p2 → r3) |
|---|---|---|
| `hero` | 12.4% → **47.8%** | 32.2% → **11.3%** |
| `temple` | 24.2% → **41.7%** | 1.9% → 6.7% |
| `courtyard` | 10.5% → **28.8%** | 45.8% → 44.4% |

`hero` lost **two-thirds of its light values** and **quadrupled its dark mass**. The frame that
has to sell the game is now half shadow.

**Moved forwards, and it deserves saying.** Composition-scale structure — the squint test, measured
as the standard deviation of 40×40 px block means — improved where the shafts and the staging
landed:

| shot | block-SD p2 → r3 |
|---|---|
| `hero` | 27.0 → 27.6 (flat) |
| `temple` | 15.4 → **25.2** (+64%) |
| `courtyard` | 28.1 → **36.0** (+28%) |

So the honest summary is not "everything got worse". **Large-shape read improved; palette and
local terminator did not.** `temple` gained more low-frequency structure than any other change in
this pass produced, and it came from the shafts and the reframing.

---

## The one measurement that matters most — the shadow term is ~3× its spec, proved from pixels

I can show the `shadowTintPeak` clamp is the root cause **without reading the shader**, by picking
two faces of one block whose light is known exactly from the sun table.

`Atmosphere.js:46-56` at `hero`'s `tod 0.79` gives elevation **22°**, azimuth **186°**, with
azimuth 0° = +X east and 180° = −X west. That is a unit sun direction of **(−0.922, 0.375,
−0.097)**. For the foreground ledge:

| face of the same block | normal | **N·L** | what it should receive |
|---|---|---|---|
| top | (0, 1, 0) | **+0.375** | 37.5% of the key |
| camera-facing front | ≈(0.59, 0.17, 0.79) | **−0.557** | **zero direct sun — shadow term only** |

Measured:

| face | colour | luma | warm% |
|---|---|---|---|
| top — receives 37.5% of key | `#654a3d` | **78.7** | 77.2 |
| front — receives **no** direct sun | `#605f7c` | **97.7** | 0.0 (99.7% cool) |

**A face in full shadow is 19.0 luma — 24% — brighter than a face carrying 37.5% of the key.**
For that to happen the shadow light must exceed roughly 0.375 × key. §2.2 specifies
`SHADOW HUE #2a3f66 … ~14% of key luminance, never below`. It is running at **more than double,
probably triple, its specified magnitude**, and it is doing so identically in every daylight shot.

That is exactly the signature `KNOWN_ISSUES` §3 predicts from `PAL.shadowTintPeak` pinning `k` at
3.904 while every daylight shot asks for 6.5–9.8. **I am confirming that diagnosis from the
pixels, independently.** It is correct, it is the single most expensive defect in the build, and
the fix is not in the tree I captured.

The consequence is not subtle. Because the shadow term is this bright and this blue, it wins the
value contest against the key almost everywhere: the *next* block's top face — same +0.375 of the
same sun — measures `#5b5a73`, **87.1% blue-dominant**. The key is reaching it and losing.

This is the same inversion I measured on the `courtyard` plinth at `9616d7d` (120%). It has not
moved. It is why five of six daylight frames read as violet concrete, and it is why the
golden-hour key survives on almost nothing but a few horizontal faces — those are simply the
faces where 0.375 of the key happens to beat the flood.

---

## Shot by shot — batch 1

### `hero` — 5 → **3**

Draws 427 (budget 250). Triangles **2.790 M** (budget 1.2 M) — worst in the set and **up** from
2.297 M in pass 2 and 2.657 M at `9616d7d`.

§7.3 conditions failed, quoted:

- *"Shadows are grey/black instead of coloured, or crush to zero detail"* — the hue is right
  (violet, `#605f7c`) but the **value is inverted**, see above. Failing this on the crush half:
  47.8% of the frame is below L80 against 12.4% in pass 2.
- *"Any surface reads as flat vertex colour with no texture detail"* — the pylon at x 215–265
  holds **78.8% of its pixels in three L/4 buckets spanning L56–L72**, 98.4% blue-dominant, p05
  54.3 → p95 69.6. A 15-luma window over 12,000 px. It is a flat navy wash.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — worse than
  painted-on. The right-hand wall (x 900–1270, y 60–200) measures **horizontal edge energy 5.95:1
  over vertical** (22.25% strong horizontal-rule pixels against 3.74% vertical). A wall built of
  stacked horizontal rules is the signature of panelling and louvres. There is not one Egyptian
  glyph on it; at 2× it reads as a **server rack**.
- *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"* — the
  foreground ledge is a row of chamfered rectangular prisms. Nothing leans, tapers or sags,
  against §2.1.4's explicit "pylons lean, columns are fat at the base and taper hard".
- *"Empty sky, or background not atmospherically hazed"* — top-left sky `#8e8a91`, **saturation
  0.100**. Grey. No cloud, no bird, no dust bank, and no pyramid. §2.2's zenith is `#3f7fc4`;
  there is **no blue anywhere in this sky**.
- *"No dark foreground framing element; flat depth"* — measured by plane: foreground L79.7,
  midground L92.4, background L94.8. Value **rises monotonically front to back** — the inverse of
  the dark-frame / lit-hero / hazed-distance structure §2.3 asks for — and the spread is only 15
  luma across the whole depth of the shot.
- *"No single hero focal read"* — max luma 213.8, **>L230 = 0.000%**, >L200 = 0.019%. The
  brightest large area in frame is the sky at L169. §2.3 wants "a single brightest thing, usually
  gold"; there is no gold in this frame at all.
- *"Bloom is a grey wash instead of a tight coloured halo on bright things"* — with nothing above
  L230 there is no bloom source, so the condition fails by absence.
- *"No ambient occlusion in crevices / where forms meet"* — walking down the ledge/pier contact at
  x=760: 104, 104, 103, 99, 91, **36**, 62, 84, 85, 87. The only dark event is a one-pixel ink
  line; there is no occlusion gradient on either side of it.
- *"Placed blind next to Mario Odyssey / Sly 4, an art director picks the other one"*.

Passing, and worth stating so nobody re-opens them: outlines, tiling, particulate, pure black,
and — contrary to the brief I was handed — **Sly does have a rim here**. Walking across his
silhouette at y=250, his sunward edge carries `#4a6085` / `#3f567e` / `#4f6b94` at L84–104 against
a body at L28–40. It is ~3 px and it works. The rim regression is real elsewhere; it is not what
is wrong with this frame.

**Blind comparison — vs Super Mario Odyssey, Sand Kingdom, the approach to Tostarena from the
south.** From memory, not from an image. **Odyssey wins, decisively.** Two concrete reasons.
First, Tostarena's sunlit stone is a high-value saturated ochre and its shadow faces drop to a
deep violet at a *fraction* of that value, so every block states the sun's direction; ours states
it backwards — our most-lit face is 19 luma *darker* than its own shadow side. Second, Odyssey
never leaves the horizon empty: the inverted pyramid anchors the skyline and the sky is a real
saturated gradient with cloud banks. Ours is a sat-0.10 grey void where §7.2 promises a pyramid.
The one-second tell for any art director: in Odyssey the environment is warm and Mario is
red-and-blue, so you find him instantly; here the environment is 63.5% blue and so is Sly.

**Highest-leverage fix:** get the key light onto the stone with the correct sign. Everything else
in this shot is downstream of it.

### `temple` — 4 → **4**

Draws 370. Triangles 2.622 M.

The best-composed frame in the set and the only one that passes the squint test outright: the
shafts rake, the column rhythm recedes, and the doorway is an unambiguous focal point. Then it is
let down by the geometry the shafts land on.

§7.3 conditions failed, quoted:

- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"* — walking the **full width** of
  the left column at y=400: L 81, 83, 80, 82, 75, 81, 85, 85, 88, 89, 81, 86, 87, 82, 77, 86, 84,
  86, 80. That is a **14-luma range with no directional trend** across a 3.8 m cylinder under a
  raking sun. Boxed, the two halves are L84.4 and L80.9 — **Δ3.5 luma**. The right column is the
  same: 12 luma across its whole width. Better than the 0.1 luma I measured at `9616d7d`, still no
  terminator. 69.6% of the column sits in three L/4 buckets spanning **L80–L88**: one band, not
  the three §2.1.1 requires.
- *"Any surface reads as flat vertex colour with no texture detail"* — same measurement; the left
  column is 100% blue-dominant with p05 74 → p95 90.9. A lilac wash.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — at 2× the
  walls are fine horizontal panel lines and small rectangular insets. There is one recognisable
  ankh (right column, x 1010–1060) in the entire frame; everything else is greebling.
- *"No rim light separating silhouettes from the background"* — the character measures `#2b2e48`
  L47.0 against a floor of `#342e43` L48.8. **Δ1.8 luma, and he is the darker of the two.** This
  is the 5%-separation figure I was handed; it is real and it is worse than the 4.2 luma I
  measured at `9616d7d`.
- *"Bloom is a grey wash instead of a tight coloured halo on bright things"* — the shaft cores
  measure `#78696f` **sat 0.249** and `#7d6e75` **sat 0.168**. A shaft carrying a `#ffd9a0` key
  should be warm cream. These read as light only because they are brighter than their surround,
  not because they have a hue. Frame max 217, **>L230 = 0.000%**.
- *"No single hero focal read"* — there *is* a focal point, the doorway, and it works
  compositionally. But it is a hole, not an object, and its sky half measures `#aba7b1`
  **sat 0.084** — a colourless grey-white. The brightest large area in the frame is again nothing.
- *"No ambient occlusion in crevices / where forms meet"* — the column base at x=250 drifts L87 →
  L61 over 78 px with no localised darkening at the contact at all.
- *"Placed blind next to …, an art director picks the other one"*.

Passing: outlines, tiling, particulate (motes clearly resolved in the shafts), **volumetrics**,
and composition.

**Blind comparison — vs Zelda: Tears of the Kingdom, a shrine interior with light coming through
ceiling apertures.** From memory. **TotK wins, but this is the closest we get.** Our shafts are
genuinely competitive — comparable softness, real motes, believable falloff. TotK wins on what the
shafts illuminate: its shrine stone has a clear lit/shadow split that models the curvature of
every column and pillar, a visible material grain, and emissive inlay that gives the room a hero
read. Ours puts world-class shafts onto flat lilac cylinders with a 3.5-luma terminator and walls
that read as bulkheads, and the brightest thing in the room is a grey hole.

**Highest-leverage fix:** the column terminator. This is the one frame where fixing the shading
would immediately produce a good image, because the composition and the atmosphere are already
there.

### `courtyard` — 5 → **4**

Draws 442. Triangles **2.819 M** — the worst in the set, 135% over budget.

The best colour in the build. The obelisk is the only object I measured anywhere with a correct,
directional, §2.2-shaped terminator:

| face | colour | luma | sat | warm% |
|---|---|---|---|---|
| lit (west) | `#d57e55` | 141.9 | 0.602 | **99.6** |
| shadow (south) | `#604e6a` | 83.9 | 0.373 | 18.8 (75.6% cool) |

A 58-luma break, warm lit against violet shadow. **This is what the rest of the game should look
like.** Whatever path produces this surface, it is the reference.

§7.3 conditions failed, quoted:

- *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"* — **the
  obelisk violates the §8.1 coordinate contract by a factor of three.** This is arithmetic, not
  taste. The camera sits 26.87 m from the obelisk at (0, ·, 11); at fov 50 on a 1280×720 frame
  that is 16.14 px per horizontal degree. §8.1 specifies "**Obelisk at (0,·,11), base 2.6 m², 22 m**".
  A 2.6 m-across shaft at that distance projects to **89 px**, or **126 px** in the worst case
  where a square section is seen at 45° and shows two faces. Measured silhouette width: **205 px
  at y=180, 340 px at y=300, 355 px at y=440**. That is **2.8× too wide** at the most generous
  reading of the contract and **4.6×** at the literal one (2.6 m² of area = 1.61 m across).
  Meanwhile the height is broadly right — 22 m projects to 641 px and the visible silhouette is
  530 px with the base occluded by the terrace. **So the height is correct and the width is ~3×
  wrong**, giving a shaft aspect of roughly 1.6:1 against a real obelisk's 9–10:1. It reads as a
  substation cabinet wearing a party hat. Pass 2 asked for 8:1; pass 3 at `9616d7d` measured
  1.2:1; it has not moved in two passes. It does at least taper correctly — 205 px at the top
  against 355 px at the base.
- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"* — the ramp has **two steps, not
  three**. The obelisk's lit face is 38 levels clustered L140–156 (top-3 cover 43.0%, all adjacent
  buckets) and its shadow face is clustered L72–88 (top-3 cover 57.5%). Each face is one
  continuous tone; there is no mid-band anywhere between L88 and L140. Frame-wide the histogram is
  bimodal — modes at L76–80 and L156–164 — with only **26.8% of the frame in L80–139**. That is
  the "salmon-and-indigo with no middle" read, and its cause is a 2-step ramp, not the grade.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — walking
  across the glyph field at y=260: 87, 83, 76, 82, 63, 81, 80, **110**, 78, 84, 56, 76, 70, 74, 77,
  78, 87. Single-signed orange marks on a violet field with **no highlight/shadow pair** in a
  consistent direction. A chiselled glyph under a raking key must have both. At 2× the dominant
  read is **rust bleeding through paint on a steel container** — and the reason is specific: the
  glyph colour *is* the lit stone colour showing through the shadowed face, which is exactly what
  chipped paint over primer looks like.
- *"No volumetric light shafts anywhere they'd be motivated"* — §2.3 requires shafts through at
  least one opening in every interior **or courtyard**. There are none here. `temple` proves the
  tech works.
- *"Empty sky, or background not atmospherically hazed"* — the sky is blue at last (`#97a1b4`,
  68% cool) but **sat 0.187** against §2.2's `#3f7fc4`, and the clouds are white filaments swirling
  in it. Pass 2 called them "marbled endpaper" and asked for soft-edged masses at two scales;
  unchanged. It reads as paper marbling or an oil slick.
- *"No single hero focal read"* — max 224.8, **>L230 = 0.000%**. The brightest large area is the
  sky at L160, ahead of the obelisk's lit face at L141.9. The hero read loses to the background.
- *"Placed blind next to …, an art director picks the other one"*.

The character **is** in frame and value-separated — L93.5 against neighbours at L155.6 and L121.4,
so 28–62 luma of separation. That fix landed. At ~45×70 px he is a periwinkle blob rather than a
readable Sly, but this shot is explicitly not about him.

**Blind comparison — vs Super Mario Odyssey, the Tostarena town square with its stone markers and
the inverted pyramid beyond.** From memory. **Odyssey wins.** The deciding difference is
silhouette hierarchy: in Odyssey tall thin things read as tall and thin, and one gold-lit object
dominates with everything else subordinate to it. Our shot is named for an obelisk and the obelisk
is a cube — the single most recognisable silhouette in Egyptian architecture, rendered as the
least. Odyssey's clouds are soft-edged masses at two scales; ours are filaments. Odyssey also has
a mid-tone: our frame is 28.8% below L80 and 44.4% above L140 with a hollow middle, which is what
makes it read as a posterised filter rather than as light.

**Highest-leverage fix:** take the obelisk to at least 8:1. It is the shot's title object and its
proportion is the reason the frame reads as an industrial yard.

---

## Harness gaps worth ten minutes from whoever owns `tools/`

1. **`tools/critic.mjs` has no `gitDesc()`.** The critic's own capture is the one artifact in the
   repo with no provenance stamp, which is backwards given that the stale-frame incident is what
   motivated the stamp. Copy it from `tools/shot.mjs:36-42`. I asked for this last pass.
2. **`tools/critic.mjs` has no per-shot deadline.** `shot.mjs` has `SHOT_TIMEOUT` (15 min) and
   fails one shot rather than the session; `harness.mjs:131`'s `grab()` wraps a bare
   `page.evaluate` with no timeout, so a wedged `setShot` hangs the whole run forever.
3. **`tools/critic.mjs` writes `manifest.json` only at the end**, and overwrites it per invocation,
   so batched captures into one label lose the earlier batches' draw/triangle stats. `shot.mjs`
   flushes `report.json` after every shot. I worked around it by saving stdout per batch.
4. **No `--resume`.** Asked for last pass; a killed run still re-renders everything.

## Runtime signals from the batch-1 manifest

- `textures: prewarm took 26.0s at size 1024` — new since pass 2.
- `collision: pole "unnamed" / "proxy:pole" has no userData.spline — synthesised one` ×2. Same as
  pass 2.
- **One console 404.** §1 forbids external asset fetches. Unidentified across three passes now.
- All modules present.

## §1 budget — triangles still climbing

| shot | draws (≤250) | tris (≤1.2 M) | tris p2 → `9616d7d` → r3 |
|---|---|---|---|
| `hero` | 427 | **2.790 M** | 2.297 → 2.657 → **2.790** |
| `temple` | 370 | **2.622 M** | 2.252 → 2.488 → **2.622** |
| `courtyard` | 442 | **2.819 M** | 2.297 → 2.701 → **2.819** |

Draws are 48–77% over. Triangles are **118–135% over and have risen in every capture**, +21% on
`hero` since pass 2. Per `CRITIC.md` I judge no frame times, but these counts are the fair part of
§1 and they are moving the wrong way in a straight line. On this container it is not free either:
`hero` at 2.79 M took ~8 minutes to render one frame set.

---

*Batches 2 and 3 append below.*
