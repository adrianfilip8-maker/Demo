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
| 2 | `sly-closeup` `dunes` `interior` | `8d95cd7` | **dirty** — page load 12:11:52 | 12:20 / 12:22 / 12:24 |
| 3 | `night` `traversal` `combat` `guard` | — | — | **not captured — see below** |

**Batch 2 is a different build from batch 1, and materially so.** Its page froze at ~12:11:52.
At that instant `src/textures/Materials.js` had been rewritten 19 seconds earlier (12:11:33) with
the gilding fix that was later committed as `e4b1a36` — so **batch 2 contains the gold fix and
batch 1 does not**. `src/player/SlyModel.js`, the other half of `e4b1a36`, was still being rewritten
(mtime 12:18:48, and `08ba373` "Snapshot in-flight cane and idle-pose work" landed at 12:18:16),
so `sly-closeup` is a *mid-surgery* character. I score what rendered and flag it.

Batch 1 is a clean `073d075`. I can state that precisely because `vite.config.js:12-13` sets
`hmr:false` and `watch:{ignored:['**/*']}` under `SANDS_NO_HMR`, which the harness always sets —
so the page's module graph is frozen at page load and later edits on disk cannot reach it. Batch
1's page loaded at ~11:20; the first agent edit landed at 11:28:03 (`src/player/Body.js`), after
`hero` had already rendered. **Batch 1 is one coherent build.**

By 11:35 the tree already carried uncommitted edits to `src/fx/Particles.js`, `src/player/Body.js`,
`src/player/Clips.js`, `src/player/SlyModel.js`, `src/world/EgyptLevel.js` and `src/world/Kit.js` —
five agents are working live. **So this is not one review set, it is two (soon three) adjacent
builds**, and the per-shot deltas below should be read with that in mind. Where a difference could
plausibly be a build difference rather than a real change, I say so at the shot.

**What this build does NOT contain.** `PAL.shadowTintPeak = 0.52` (`ToonMaterial.js:182`) and the
`k = Math.min(k, maxK)` clamp (`:879-881`) are **both still present**. The daylight-shadow fix I
was told was "being tested right now" **is not in the tree I captured.** Every daylight score
below is against the clamped build and should be re-run when that lands.

**The `src/fx/Particles.js` parse error did NOT affect this set.** I was warned some recent
captures ran with `fx` absent and a placeholder world. My batch-1 manifest, saved before the next
batch overwrote it, reports **all 17 modules present and zero absent** — `fx` included. Consistent
with the timeline: `Particles.js` was edited at 11:35:27, fifteen minutes after this page froze
its module graph. Any frame in `shots/` *other than* the ones I captured should still be checked.

**HEAD has moved under this review.** It was `073d075` when batch 1 ran; it is now `e4b1a36`
(`+8d95cd7`, `+e4b1a36`). Batches 2 and 3 had not acquired the lock at that point, so **they will
boot a newer build than batch 1 did.** This set is therefore not internally coherent, and I flag
per-batch rather than pretending otherwise. On a box with five agents committing live this is
unavoidable; what is avoidable is not saying so.

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

*(**Six of ten shots scored.** `night`, `traversal`, `combat` and `guard` were **not captured** —
see "Harness gaps" item 5 for why, and read that as a process defect rather than as four missing
opinions. I will not score them from stale frames or from source; pass 1's worst failure was
exactly that, and my own previous pass repeated it in the other direction by clearing a condition
its measurement could not see.)*

| shot | pass 2 | pass 3 | Δ | one-line |
|---|---|---|---|---|
| `hero` | 5 | **3** | −2 | Lost two-thirds of its light values. Key light is expressed *backwards* |
| `temple` | 4 | **4** | 0 | Real shafts, real depth, best composition — on columns with no form |
| `courtyard` | 5 | **4** | −1 | Best colour in the set; its title object is a 1.18:1 cube |
| `sly-closeup` | 4 | **5** | +1 | **Best shot in the set.** Real gold, real fur, real bloom — and a broken face |
| `dunes` | 5 | **3** | −2 | Sand is terracotta; pyramids are 1.7 luma off the sky; speckle artifact unfixed |
| `interior` | 4 | **3** | −1 | A torch-lit tomb that is **1.9% warm, 0.1% above L140, and has no torch** |

**Mean so far: 3.67 across six shots, against 4.5 for those same six in pass 2 and the 4.2
all-ten baseline.** Best shot is a 5. The floor is 8.

---

## Did it move the needle? Measured, not asserted

I was given a list of things fixed since the 4.2 baseline. Here is what the pixels say.

**Genuinely landed — credited once, briefly, per `CRITIC.md`:**

- **Ink lines are exactly on spec and stay that way.** Darkest 0.5% of each frame measures
  `#18121f` / `#19131e` / `#1b141c` — dark violet-brown, sitting between §2.1.2's `#1a1210` and
  `#161022`. **Zero pure-black pixels in 2.76 M.** Stop touching this.
- **The bright cool contact line is gone at wall/ground contacts.** Pass 2's `#598aa2` L129 line
  between surfaces at L87 and L65 does not appear at any architectural contact. Walking down the
  `hero` ledge/pier contact gives 91 → 36 (ink) → 62; the `courtyard` obelisk/plinth gives
  82 → 54 → 47. Darkening, not brightening — the `uRimCurve` convexity gate did the job it was
  added for. **It survives on floor tile joints**, though: see `sly-closeup`, where paving grout
  runs `#668095` L124 against slabs at L69–76.
- **Texture tiling passes — but not on my evidence. See "A method error of mine" below.**
- **Airborne particulate exists.** Motes are visible in all six frames and clearly resolved in
  `temple`'s shafts and `interior` at 2×. Pass 2's `fx: no emitter named "embers"` warning is gone
  from both manifests. §7.3's particulate condition **passes** six for six.
- **Volumetric shafts are real and they are the best thing in the build.** See `temple`. They are
  still absent from `courtyard` and `interior`, both of which §2.3 requires them in.
- **Gold is finally metal — in the one frame whose build contains the fix.** `sly-closeup`'s cane
  runs `#cea76a` L171 → `#9c6c33` L114 across the tube with frame max 236.3. See that shot.
- **The character is in frame in `courtyard`.** The occlusion fix landed: he measures L93.5 against
  neighbours at L155.6 and L121.4.

**Did not move at all:**

- **The daylight palette. This is the strongest evidence in the report.** Four shots, measured
  twice, twelve-plus commits apart:

  | shot | warm% `9616d7d` → r3 | cool% `9616d7d` → r3 | mean L |
  |---|---|---|---|
  | `hero` | 21.1 → **21.1** | 62.5 → 63.5 | 86.7 → 86.5 |
  | `temple` | 13.5 → **13.9** | 64.3 → 63.0 | 85.9 → 85.8 |
  | `dunes` | 73.8 → **74.0** | 8.2 → 8.5 | 124.6 → 124.5 |
  | `interior` | 1.6 → **1.9** | 86.7 → 86.3 | 67.6 → 67.5 |

  **Two independent captures agreeing to a decimal place on every shot.** Nothing in the
  intervening work touched the daylight palette at all — exactly what you would predict from
  `shadowTintPeak` still clamping every daylight shot to the identical shadow light.
- **The `hero` sky.** Like-for-like patches, pass 2 → r3: top-left `#a29da2` sat 0.059 → `#8e8a91`
  sat 0.100; left horizon `#b8a8a2` sat 0.12 → `#af9f9b` sat 0.137. Still grey. Still no cloud, no
  bird, and **still no pyramid** in the shot §7.2 defines as "Sly on a temple ledge, sun raking,
  **pyramid behind**". Third pass running.

**Moved backwards — and this is the most consistent single result in the pass.** Value structure as
fractions of frame area, all six shots, pass 2 → r3:

| shot | **mid-tone** L80–139 | **dark** <L80 | light ≥L140 |
|---|---|---|---|
| `hero` | 55.4% → **40.9%** | 12.4% → **47.8%** | 32.2% → **11.3%** |
| `temple` | 73.8% → **51.6%** | 24.2% → **41.7%** | 1.9% → 6.7% |
| `courtyard` | 43.7% → **26.8%** | 10.5% → **28.8%** | 45.8% → 44.4% |
| `sly-closeup` | 73.9% → **22.3%** | 19.9% → **70.2%** | 6.2% → 7.6% |
| `dunes` | 41.8% → 40.5% | 9.0% → **17.6%** | 49.1% → 41.9% |
| `interior` | 71.0% → **27.0%** | 24.2% → **72.9%** | 4.8% → **0.1%** |

**Six of six lost mid-tone. Six of six gained dark mass.** Mean dark fraction across the set went
from **16.7% to 46.5% — nearly tripled.** `sly-closeup` and `interior` each lost about 50 points of
mid-tone outright.

That is the fingerprint of a shadow term that is both too bright *and* applied to too much of the
frame: surfaces that should sit in the lit mid-band get pushed into the shadow band instead, and
the band they land in is a narrow one. `hero` separately lost **two-thirds of its light values**.
The frame that has to sell the game is now half shadow, and the character sheet is 70% shadow.

**Moved forwards, and it deserves saying.** Composition-scale structure — the squint test, measured
as the standard deviation of 40×40 px block means — improved where the shafts and the staging
landed:

| shot | block-SD p2 → r3 | |
|---|---|---|
| `temple` | 15.4 → **25.2** | **+64%** — the shafts and the reframing |
| `sly-closeup` | 15.4 → **23.5** | **+53%** |
| `courtyard` | 28.1 → **36.0** | +28% |
| `dunes` | 28.1 → **34.7** | +23% — the pyramids arriving |
| `hero` | 27.0 → 27.6 | flat |
| `interior` | 17.1 → **13.0** | **−24%** — the only regression |

**Five of six improved their large-shape read**, `temple` and `sly-closeup` dramatically. `interior`
alone got flatter, which is exactly what you expect when 72.9% of a frame collapses below L80.

So the honest summary is not "everything got worse". **Large-shape read improved; palette and
local terminator did not.** `temple` gained more low-frequency structure than any other change in
this pass produced, and it came from the shafts and the reframing.

---

## A method error of mine, and the correction

I cleared §7.3's *"Visible texture tiling repetition"* by sweeping horizontal-period |ΔL| at
**16–192 px** and reporting no repeat peak. That was worthless, and I am recording it because the
same mistake would clear a wall that was visibly striped.

Deriving the period properly — tile size against framing distance — for `temple`'s rear wall: the
camera at (3.5, 2.6, −19) is ~33 m from the hall's rear wall; at fov 55 on 1280×720 that is 14.96
px per horizontal degree, so a **10.4 m tile repeats every 268 px**. My sweep topped out at 192.
**I probed an order of magnitude below the period I was claiming to test.** (268 px lands inside
the 234–292 px band the textures agent measured independently, so the derivation checks out.)

Re-running at the derived periods makes it worse than a near-miss:

| surface | visible span | result at 200–400 px |
|---|---|---|
| `temple` rear wall beside the doorway | **100 px** | `NaN` — not testable |
| `temple` left aisle wall | **140 px** | `NaN` — not testable |
| `hero` right-hand wall | 370 px | 26.2 → 21.6, shallow min at 320 px |
| `hero` foreground ledge (widest surface in the set) | 800 px | rises 26.5 → 29.2, no repeat |

**On most architecture at these framings the visible span of a surface is smaller than one tile
period**, so a game frame physically cannot answer the tiling question. Where the span *is* wide
enough — `hero`'s 800 px ledge — the curve rises monotonically with no repeat signature, which is
a genuine pass but only for that one surface.

**The condition passes**, on the textures agent's per-surface renders at true scale with a real
mip pyramid (hall walls 3.5–4.6 repeats, floors 5.2–5.9, gilded cornice 7.2, no countable
landmark). That is better evidence than the shot set can produce.

**Standing note for this role:** tiling cannot be adjudicated from `shots/`. Judge it from
per-surface renders, and derive the period from tile size and framing distance rather than
sweeping a fixed ladder. The symmetrical error is equally easy — the same agent's first attempt
used a square 6×6 render that *exaggerated* vertical repetition on a 13 m wall with a 10.4 m tile.
Both failures are the same shape: measuring at a scale the consumer does not use.

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

| face | colour | mean L | **median L** | warm% |
|---|---|---|---|---|
| top — receives 37.5% of key | `#654a3d` | 78.7 | **69.5** | 77.2 |
| front — receives **no** direct sun | `#605f7c` | 97.7 | **100.9** | 0.0 (99.7% cool) |

**A face in full shadow is 19.0 luma brighter at the mean and 31.4 luma brighter at the median
than a face carrying 37.5% of the key.** The front face is not catching a specular either — it is
`sat 0.243`, 99.7% cool, p05 82.2 → p95 106.0, i.e. a narrow low-saturation ambient wash.
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
  brightest large area in frame is the sky at L169.
- *"Gold doesn't read as metal (needs hard spec + bloom + dark occlusion)"* — **NOT SCORED. My
  frame predates the fix.** I measured no gold anywhere in `hero`, but `e4b1a36` ("The gilding was
  authored into a V band no consumer ever samples") is **two commits after the `073d075` I
  captured**, and `src/textures/Materials.js` was rewritten at 12:11:33, ~50 minutes after this
  frame's page load. The great doorway lintel is reported to go chroma 0.33 → 0.77 under that fix.
  Scoring this condition off my frame would be exactly the stale-frame error the provenance stamp
  exists to prevent, running in the other direction. **Re-capture `hero` and re-score this one
  condition.** Note it does not rescue the *focal* condition on its own: a hero read needs
  something above L230, and this frame's ceiling is 213.8.
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

**5. The critic role is being structurally starved by the FIFO, and this is now the second pass it
has cost frames.** The lock is a fair FIFO, but a ticket lives and dies with its process, so a
waiter that is killed loses its accumulated seniority and re-queues at the back. My batch 3 sat
2nd in line for 64 minutes, was killed at 12:41 before ever acquiring the lock, and re-queued at
12:42 as **7th of 7**. My previous pass lost four shots to exactly this and recorded it; nothing
has changed. Meanwhile short runs cycle through ahead, so the longest-waiting job is the most
likely to be starved.

The critic is the worst-affected consumer because it is the only one that legitimately needs all
ten shots. Two cheap fixes, either of which would close it:
- **`--resume`** on `critic.mjs`: skip shots already present in the output dir, so a killed run
  restarts cheaply instead of re-rendering six frames it already has.
- **Ticket persistence**: write the ticket with the *label*, not the pid, and let a re-launched
  run reclaim its original timestamp. Correctness still rests on the atomic `tryTake()`, so the
  worst case degrades to the current race rather than to two holders.

Until then, budget for the critic taking two sessions to score ten shots, and do not read a
missing shot as a missing finding.

## Runtime signals — identical in both manifests

- `textures: prewarm took 26.0 s / 18.6 s at size 1024` — new since pass 2.
- `collision: pole "unnamed" / "proxy:pole" has no userData.spline — synthesised one` ×2 in each.
  Same as pass 2 and pass 1.
- **One console 404 in each batch.** §1 forbids external asset fetches. Unidentified across three
  passes now, and it is the only §1 *hard constraint* that may be being breached — worth ten
  minutes from someone with the network tab open.
- All 17 modules present in both batches, none absent.

*(§1 budget is tabled in full at ranked item 11.)*

---

## Shot by shot — batch 2 (build `8d95cd7` + the gilding fix, page load 12:11:52)

### `sly-closeup` — 4 → **5**  ·  best shot in the set

Draws 391. Triangles 2.606 M.

The first frame in three passes with a genuine hero read, and the first with real metal. Crediting
it properly because it proves the pipeline can do what the rest of the build is not doing.

**What works, measured:**

- **Gold is metal.** Sampled *on* the cane crook rather than in a box around it, y=250 runs
  `#cea76a` L171 → `#c18b49` L146 → `#a47233` L120 → `#9c6c33` L114 → `#755240` L88 across the
  tube — a proper specular rolloff in the `#e8b942` family. Frame max **236.3** with
  **>L230 = 0.073%**, the only frame in six with a real bloom source. §7.3's *"Gold doesn't read as
  metal"* **passes**. This is the one shot where §2.3's "single brightest thing, usually gold" is
  satisfied.
- **Fur does not read as smooth plastic.** Spiky fringe breaks the silhouette at chest, cheeks,
  knees and tail. Condition **passes**.
- **Proportions pass.** Cap top y≈118, boot sole y≈645, so 527 px of figure over a ~110–137 px
  head — **~4–5 heads**, comfortably cartoon, matching the 4.88 the rig reports.
- **He separates.** Torso `#3c5e7d` L88.8 (sat 0.539) against backgrounds at L63.5 and L60.2 —
  **Δ25–29 luma**. Not by rim, by being a saturated blue against a desaturated violet wall, but it
  reads.
- **The tail is the best-drawn thing on the character** — bushy, ringed, silhouette-breaking.

§7.3 conditions failed, quoted:

- *"Silhouette not instantly readable as Sly (cap, mask, tail, cane)"* — cap, tail and cane read
  instantly. **The face does not, and the reason is one clipped eye.**

  **Correction to my own earlier finding: the bandit mask is NOT absent.** At `9616d7d` I reported
  it missing off a box that straddled it. Scanning properly at y=150, x 612–648 is a continuous
  dark band at **L27–39** — the mask/brow is there and it is the right value. **CHARACTER should
  not go and add one.** I would rather correct myself than send someone to build a thing that
  exists.

  The actual defect is the eyes. Matched 24×25 px boxes on each: left eye `#e3d9c6` mean **L217.7,
  median L233.2, p95 236.2, 98.3% warm, sat 0.128** — half its pixels are clipped at L233+, a flat
  blown white disc with no iris or pupil left in it. Right eye at its own centre: mean L116.2,
  **median L88.3**, brightest point across it only **L158**. **The two eyes are 145 luma apart at
  the median.** He does not have a pair of eyes; he has one headlight and one socket. I measured 84
  luma at `9616d7d` off looser boxes — tightened up it is worse, not better.

  At 2× the muzzle compounds it: a long pale wedge detached down-left from the eye mass, so the
  combined read is a **skull or a bird of prey**, not a raccoon.
- *"Pose is A-pose/T-pose/stiff instead of a confident line-of-action"* — improved but still
  failing: the cane gives a diagonal, but both feet are planted, hips and shoulders are level and
  the weight is evenly distributed. There is no contrapposto.
- *"Any surface reads as flat vertex colour with no texture detail"* — the wall behind him.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — the wall is
  panel lines and rectangular insets again, plus an industrial rail/conduit crossing the orange
  wall at right.
- *"No ambient occlusion in crevices / where forms meet"* — and worse, **inverted on the floor**.
  The paving joints in the lower left are *brighter* than the paving: `#657d8b` L121 and `#668095`
  L124 against tiles at L69–76, a **50-luma bright cool line**. This is the pass-2 `#598aa2`
  contact-line defect surviving on tile joints after being fixed at wall/ground contacts. A grout
  line that catches light more than the slab reads as a swimming pool.
- *"Placed blind next to …, an art director picks the other one"*.

**Blind comparison — vs Sly Cooper: Thieves in Time, any Sly close-up in the Egypt episode.**
From memory, not from an image. **Thieves in Time wins, but for the first time this is a real
contest.** Our cane, tail, fur fringe and ink are genuinely in the same conversation. It loses on
the face and on weight: Thieves in Time's Sly reads because two matched eyes sit inside the mask
as one clean graphic unit, and because he stands in asymmetric contrapposto with the cane taking
load. We have the mask and we have the cane; what we have instead of a face is one clipped white
disc 145 luma off its partner, a muzzle that reads detached, and a symmetrically planted stance.
**Fix the eye and this shot competes.**

**Highest-leverage fix:** stop the left eye clipping. It is a single blown highlight —
median L233 against the other eye's L88 — and it is the one thing standing between this shot and a
7. Everything else on the character (cane, tail, fur, mask, proportions, separation) already works.

### `dunes` — 5 → **3**

Draws 437. Triangles 2.727 M.

The only shot that did not go cool — 74% warm — and it is wrong in the other direction.

§7.3 conditions failed, quoted:

- *"Empty sky, or background not atmospherically hazed"* — the pyramids are visible at last, which
  is a genuine fix, but they have **no value separation from the sky**. Left pyramid body L152.7
  against the sky directly above it at L151.0: **Δ1.7 luma**. Walking across its edge at y=120 the
  sky is `#b4a3a4`/`#baaaad` L167–174 and the pyramid is `#bf9d83` L162 — separated by **hue only**
  (sky rb 1.05, pyramid rb 1.44). The right pyramid is L156.6 against sky L167.2 and is *darker*
  than its background. A landmark that differs from the sky by under 2 luma is a flat cut-out.
- *"Any surface reads as flat vertex colour with no texture detail"* — the foreground dune is the
  largest surface in the set and has **no grain at all**: 26 luma levels with top-3 cover 34.3%,
  and horizontal |ΔL| of only **6.1 at 16 px** rising monotonically with no structure. A smooth
  brown gradient with horizontal streaking.
- *"Geometry silhouettes are straight/symmetric everywhere (no hand-built irregularity)"* — the
  pyramid silhouettes are a hard staircase of ~20 px axis-aligned steps which at this distance
  reads as aliasing rather than as masonry; the mid-ground vertical poles are constant-width tubes
  at assorted angles that read as **scaffolding standards**.
- *"Architecture reads as boxes"* — at 2× the mid-ground is a horizontal girder spanning the frame
  on lattice supports with a greebled tower at right. It reads as a **refinery or a grain
  elevator**. There is nothing Egyptian in the crop.
- *"No single hero focal read"* — max L215.2, **>L230 = 0.000%**.
- *"Placed blind next to …, an art director picks the other one"*.

**The sand is not sand.** It measures `#ad6044` — R 173, G 96, B 68, **sat 0.602, rb 2.53**. §2.2's
sandstone light is `#e6b878` (G/R 0.80) and the sand GI bounce is `#e8a852`; measured G/R is
**0.55**. That is a terracotta brick, not desert sand, and it is unchanged from the `#a45a41` I
measured at `9616d7d`. And the shadow wedge in the left foreground is a hard-edged violet shape at
`#524362` L72.0 sitting beside sand at L70.8 — **identical value, opposite hue**, which is why it
reads as torn paper laid on the surface rather than as a dune in shadow.

**The black speckle artifact is unfixed.** Still at ~(700–820, 230–290) — mean L100 against clean
sky at L126.3, with a row at y=255 alternating between L38–66 and L114–125 pixel to pixel. It
reads unmistakably as image corruption or a swarm of flies, and it is clearly visible in the 2×
crop. Reported at `9616d7d` at the same coordinates.

**Blind comparison — vs Zelda: Breath of the Wild, the Gerudo Desert approach in late afternoon**
(and Odyssey's Tostarena for the same reason). From memory. **BotW wins.** Two concrete things it
does that we do not. Its dunes carry a fine directional ripple that catches the raking light, so
the sand has grain at every distance; ours has |ΔL| 6.1 at 16 px, i.e. none. And its distant mesas
sit in real aerial perspective — they lose contrast *and* converge toward the sky hue with
distance, so depth is unambiguous. Ours converge in *value* (Δ1.7 luma) while staying warm against
a mauve sky, so the pyramid separates by hue alone and reads as a sticker on the backdrop rather
than as a mass twelve kilometres away.

**Highest-leverage fix:** put the sand back in the `#e6b878`/`#e8a852` family. It is the largest
surface in the frame and it is currently brick.

### `interior` — 4 → **3**  ·  worst in the set

Draws 337. Triangles 2.058 M.

§7.2 defines this shot as *"Lighting: torch-lit tomb, warm/cool tension, volumetrics"*. It has
none of the three.

§7.3 conditions failed, quoted:

- *"No single hero focal read"* — **0.1% of the frame is above L140. 72.9% is below L80. 43.8%
  sits in the single bucket L60–79.** And **`heroWarm` = 0.00%**: not one pixel in 921,600 is
  simultaneously warm, bright and saturated. There is nothing for the eye to go to.
- *"Shadows are grey/black instead of coloured, or crush to zero detail"* — coloured, yes, but the
  crush half fails outright on the numbers above.
- *"No volumetric light shafts anywhere they'd be motivated"* — §2.3 requires them in every
  interior. `temple` proves the tech works. There are none here.
- *"Gold doesn't read as metal"* — **this build contains the gilding fix** and the treasure pile at
  (770–990, 400–470) still measures `#3d3546` **L56.3, 47.8% cool**. At 2× it is a scatter of dark
  grey-brown lumps that reads as gravel or scrap. In a tomb this is exactly where the hero read
  should live. Note this is a *different* asset path from the `hieroglyph_gilded` beams `e4b1a36`
  repaired — fixing the lintels did not reach the hoard.
- *"Any surface reads as flat vertex colour with no texture detail"* — the walls hold **59.6% of
  their pixels in three buckets spanning L60–68**, and at 2× the surface is a uniform violet
  speckle at constant density that reads as **terrazzo or a granite worktop**. The floor is
  enormous flat pentagons ~200 px across.
- *"No rim light separating silhouettes from the background"* — character L58.8 against floor
  L63.3, **Δ4.5 and he is the darker of the two**.
- *"No normal-map relief on stone; carvings look painted-on"* — the glyph panels along the top
  wall are still the best-drawn glyphs in the build, with recognisable shapes in ruled registers,
  and they are still completely flat.
- *"Placed blind next to …, an art director picks the other one"*.

**There is no torch, for the third pass running.** The one warm feature is a sourceless wash on the
right wall at L99.7 / 60.4% warm with no flame, no origin and no readable falloff. Pass 1 and pass
2 both nominated "put a torch in this room" as this shot's highest-leverage fix.

**Blind comparison — vs Zelda: Tears of the Kingdom, a Depths chamber lit by a single Brightbloom
seed.** From memory. **TotK wins overwhelmingly**, and the comparison is almost unfair because the
entire point of that reference is one warm source in a cold volume: the light has a visible
origin, a falloff you can read across the floor, and it throws the surrounding stone into genuine
warm/cool opposition within a few metres. Ours has the cold volume — 86.3% of it — and no source
at all, so there is nothing to travel to and no depth cue. An art director would not need a second
glance.

**Highest-leverage fix:** one warm point light with visible falloff and a flame billboard. The
geometry, sarcophagus, canopic jars and glyph panel are all already built, so this is the largest
score gain per unit of work anywhere in this report.

---

# RANKED — what to fix next, most damaging first

Ranked by how much each defect costs the frame, not by effort. **Item 1 is worth more than
everything below it combined**, and items 2, 3 and 6 are substantially downstream of it — do not
start them in parallel or you will tune them twice.

*(Based on all six captured shots. Re-ranked once batch 3 clears the FIFO.)*

### 1. The daylight shadow term runs at ~3× its specified magnitude — **SHADING** `src/render/ToonMaterial.js`, `src/render/shaders/toon.glsl.js`

The single most expensive defect in the build, and already correctly diagnosed in
`KNOWN_ISSUES` §3: `PAL.shadowTintPeak` clamps `k` at 3.904 while every daylight shot asks 6.5–9.8,
so all of them receive the identical shadow light.

I confirmed it independently from pixels, which matters because five tuning cycles were lost
behind this clamp. On one `hero` block: the top face carries **N·L = +0.375** of the key and
measures **L 78.7**; the camera-facing face carries **N·L = −0.557**, i.e. *no direct sun at all*,
and measures **L 97.7**. An unlit face beating a 37.5%-lit face by 24% forces the shadow term
above ~0.375 × key. §2.2 specifies **~14% of key luminance, never below**.

Everything else in the palette complaint follows: daylight frames at 63% blue-dominant, sunlit
sandstone at R−B **−33** where `#c9915a` is **+111**, `hero` losing two-thirds of its light values,
and every daylight shot going lavender in the *same* way — which is what identical shadow light
predicts.

**Done when, measured off the next capture:** sunlit sandstone **R−B ≥ +60**; on any object with a
lit and an unlit face, **unlit luma ≤ 45% of lit**, sign never inverted; daylight frames back above
**60% warm**. Keep the violet — the *hue* is right and it is the thing the last pass got correct.
Put it in the shadows only.

### 2. The ramp has two steps, not the three §2.1.1 requires — **SHADING**

Same file, separable job, and it is why the frames read as a posterised filter rather than as
light. `courtyard`'s obelisk is the clearest case because its terminator otherwise works: the lit
face is one continuous tone clustered **L140–156** and the shadow face one continuous tone at
**L72–88**, with **nothing between L88 and L140**. Frame-wide only **26.8%** of `courtyard` sits in
L80–139. §2.1.1 asks for shadow / **mid** / light with a `smoothstep` terminator ≈0.03 wide.

`hero` and `temple` fail the same condition from the opposite side — crushed into *one* band
(`temple`'s column holds 69.6% of its pixels in three L/4 buckets spanning L80–88).

### 3. `interior` is a torch-lit tomb with no torch, and it is the cheapest big win on this list — **LIGHTING**

Promoted above the general focal-point item because it is one shot, one change, and the largest
score movement per unit of work anywhere in this report. The room measures **1.9% warm, 86.3%
cool, 0.1% of frame above L140, 72.9% below L80, and `heroWarm` exactly 0.00%** — not one pixel in
921,600 is warm, bright and saturated. There is no light source visible in a shot whose §7.2
purpose is *"torch-lit tomb, warm/cool tension, volumetrics"*. The geometry, sarcophagus, canopic
jars and glyph panel are all already built and all read. **One warm point light with visible
falloff plus a flame billboard** would take this frame from 3 to a plausible 6 on its own. Pass 1
and pass 2 both nominated it. Three passes, no torch.

### 4. Nothing else in the set can be a focal point or bloom — **LIGHTING** + **POSTFX** `src/render/PostFX.js`

**>L230 = 0.000% in five of six frames.** Ceilings are 213.8 / 217.0 / 224.8 / 215.2 / (236.9 on
18 stray pixels). §2.3's "one hero read — a single brightest thing, usually gold" fails 5/6: in
`hero` the brightest large area is grey sky at L169, in `temple` a **sat-0.084** grey doorway, in
`interior` nothing at all.

**`sly-closeup` is the counter-example and the proof it is fixable** — max 236.3, >L230 = 0.073%,
from the gold cane and an eye specular. Whatever that shot does, do it everywhere.

Note `e4b1a36`'s gilding fix helps but is not sufficient, and its reach is narrower than it looks:
`interior`'s treasure pile rendered **after** that fix was in the tree and still measures `#3d3546`
L56.3. The fix repaired `hieroglyph_gilded` on horizontal beams; it did not reach the hoard.

### 5. The architecture reads as science fiction, not Egypt — **TEXTURES** `src/textures/**` + **ARCHITECTURE** `src/world/Architecture.js`

This is the loudest thing in the frames after the colour, and it is the one an art director would
name first. **But it is not everywhere, and I nearly reported it as if it were.** Measuring
directional edge energy across the set — the ratio of strong horizontal rules to strong vertical
rules, which is the signature of stacked panelling against the mixed orientation of carved relief:

| surface | H:V | reads as |
|---|---|---|
| `sly-closeup` back wall | **7.98:1** | louvres / server rack |
| `hero` right-hand wall | **5.95:1** | panelling (22.25% horiz vs 3.74% vert px) |
| `dunes` mid architrave | **3.81:1** | a girder bridge |
| `temple` left aisle wall | 1.19:1 | mixed — fine |
| `dunes` right tower | 1.07:1 | mixed — fine |
| `courtyard` obelisk glyph face | 0.80:1 | glyph columns — correct |
| `interior` glyph frieze | 0.71:1 | glyph registers — correct |
| `interior` pilaster | 0.67:1 | correct |
| `temple` rear wall | 0.63:1 | correct |

**Fix the top three surfaces, not the whole material system.** The glyph-bearing surfaces are
already correctly vertical-leaning; sending someone to "de-greeble everything" would break the one
thing that works. The defect is specifically *large flat surfaces resolved as stacks of horizontal
rules* — get those onto ashlar coursing with irregular block heights and vertical joints, or onto
glyph registers like `interior`'s frieze.

The second half is separate and applies to the glyph surfaces that *are* correctly laid out:
`temple` has exactly **one** recognisable ankh in the whole frame and otherwise rectangular
greebles. `courtyard`'s glyphs have register structure, but walking across them gives
single-signed orange marks with **no highlight/shadow pair in a consistent direction** — painted,
not chiselled — and because the glyph
colour *is* the lit stone colour showing through the shadowed face, the read is chipped paint over
primer on a steel container.

Fix the glyphs to carry a bevel pair, and get the rectangular greebling off the walls.

### 6. The `courtyard` obelisk breaks the §8.1 contract by ~3× — **PROPS** `src/world/Props.js`

Not a taste call, arithmetic. §8.1: *"Obelisk at (0,·,11), base 2.6 m², 22 m"*. The camera is
26.87 m away at 16.14 px/degree, so a 2.6 m-across shaft projects to **89 px**, or **126 px** in
the worst case where a square section shows two faces at 45°. Measured silhouette: **205 px at
y=180, 340 px at y=300, 355 px at y=440** — **2.8× too wide** at the most generous reading, 4.6× at
the literal one. Height is broadly correct (530 px visible against 641 px for 22 m). **The height
is right and the width is ~3× wrong.** Result: a 1.6:1 shaft where a real obelisk is 9–10:1, so the
most recognisable silhouette in Egyptian architecture renders as the least. Asked for in pass 2,
unmoved in two passes.

### 7. Character/environment separation — **SHADING** (rim) + **LIGHTING**

`temple`: the character is `#2b2e48` **L47.0** against a floor at `#342e43` **L48.8** — **Δ1.8
luma, and he is the darker of the two.** Worse than the 4.2 I measured at `9616d7d`.

Ranked here, below the colour, deliberately, and with one correction to the brief I was handed:
**the rim is not simply "gone".** In `hero` it works — Sly's sunward edge carries `#4f6b94` at
L84–104 against a body at L28–40. The known `uRimCurve` convexity regression (documented in
`toon.glsl.js:486-511`, rejecting 69.7–79.7% of his rim band because low-poly facets are
indistinguishable from concave creases) is real and the per-material-define fix is the right one.
But **a perfect rim will not fix this while the environment sits in the same blue-violet family as
the character.** Sly is blue; the world has to be gold. Fixing item 1 does most of item 6 free.

### 8. No ambient occlusion where forms meet — **POSTFX** `src/render/passes/AO.js`

`temple`'s column base drifts L87 → L61 over 78 px with **no localised darkening at the contact at
all**. `hero`'s ledge/pier contact goes 104, 103, 99, 91, **36**, 62, 84, 87 — the only dark event
is a one-pixel ink line with no gradient either side. `courtyard`'s obelisk/plinth is the same.
Per `KNOWN_ISSUES` §5 the pass now compiles; it is compiling and contributing nothing visible at
contacts, and `PostFX.TUNE` still wants the re-bracket that note asks for.

Credit where due: the pass-2 **bright cyan contact line is gone** (`hero` reads 91 → 36 → 62,
darkening not brightening). The `uRimCurve` gate did its job.

### 9. The sky — **SKY** `src/render/Sky.js`

`hero`'s zenith is `#8e8a91` **sat 0.100** — grey — against §2.2's `#3f7fc4`; like-for-like against
pass 2 (`#a29da2` sat 0.059) that is essentially unchanged. No cloud, no bird, and **no pyramid**,
which §7.2 names as defining content of this shot ("Sly on a temple ledge, sun raking, **pyramid
behind**") — third pass running. `courtyard`'s sky is genuinely blue at last but **sat 0.187**, and
its clouds are white filaments that read as paper marbling; pass 2 asked for soft-edged masses at
two scales and they are unchanged.

### 10. No volumetrics in `courtyard` — **FX** / **POSTFX**

§2.3 requires shafts through at least one opening in every interior **or courtyard**. `temple`
proves the tech works and is the best asset in the build. `courtyard` has none.

### 11. Triangle budget, rising in a straight line — **ARCHITECTURE**

| shot | draws (≤250) | tris (≤1.2 M) | pass 2 |
|---|---|---|---|
| `hero` | 427 | **2.790 M** | 535 / 2.297 M |
| `temple` | 370 | **2.622 M** | 505 / 2.252 M |
| `courtyard` | 442 | **2.819 M** | 535 / 2.297 M |
| `sly-closeup` | 391 | **2.606 M** | 516 / 2.272 M |
| `dunes` | 437 | **2.727 M** | 520 / 2.215 M |
| `interior` | 337 | **2.058 M** | 443 / 1.918 M |
| **mean** | **401** (+60%) | **2.604 M** (+117%) | 509 / 2.209 M |

Draws improved ~21% and are still **35–77% over**. Triangles rose in **every single shot**, mean
+17.9% since pass 2, and are now **72–135% over** a 1.2 M ceiling. I judge no frame times per
`CRITIC.md`, but these counts are the fair part of §1 and they are moving the wrong way in a
straight line across three passes. On this container it is not free either: `hero` at 2.79 M took
~8 minutes for a single shot, which is why a ten-shot critic set now costs an hour of exclusive
lock and why five agents spent this session queued behind each other.

---

# Overall

## Verdict: **REJECT**

**Mean 3.67 / 10 across the six shots I captured**, against **4.5** for those same six in pass 2
and the **4.2** all-ten baseline. On a like-for-like basis the set is **down 0.83**. Best shot is a
**5** (`sly-closeup`). The passing floor is **8**. No shot reached it; no shot came within three
points of it.

§7.3's final condition — *"Placed blind next to Mario Odyssey / Sly 4, an art director picks the
other one"* — **fails six times out of six**, as it did in passes 1 and 2. I am working from my own
knowledge of Odyssey, TotK, BotW and Thieves in Time rather than from reference images, and I have
said which reference and which concrete difference decides it at every shot.

## What this pass genuinely achieved

Real work landed and it is visible in the pixels: **volumetric shafts exist and are competitive
with TotK's**; **gold is finally metal** in the one frame whose build contains the fix;
**particulate exists in all six frames**; **ink lines are exactly on spec with zero pure black in
5.5 M pixels**; **the bright cyan contact line is gone at architectural contacts**; **the pyramids
are visible in `dunes`**; **the character is in frame in `courtyard`**; and **five of six shots
improved their large-shape squint read**, `temple` by 64%.

That is not a small list, and most of it was on pass 2's routing list.

## Why the score went down anyway

**One defect dominates everything else, and it is not new — it is unfixed.** `PAL.shadowTintPeak`
clamps `k` at 3.904 while every daylight shot asks 6.5–9.8, so all of them receive an identical
shadow light that is running at roughly **three times its §2.2-specified magnitude**. I confirmed
that from the pixels alone: on one `hero` block, a face receiving **zero** direct sun is 31 luma
brighter at the median than a face receiving **37.5%** of the key.

Everything the critic has complained about for two passes falls out of that single number — the
lavender-grey stone, the daylight frames at 63% blue, sunlit sandstone at R−B −33 instead of +111,
six of six shots losing mid-tone, mean dark fraction nearly tripling, and the golden-hour key
surviving on almost nothing but a few horizontal faces. Four shots measured twice, twelve-plus
commits apart, agree to a decimal place: **nothing in the intervening work touched it.**

The good news is the same news: **this is one bug, not eleven.**

## How to split this across five agents

Ranked items 1 and 2 are worth more than 3–11 combined, but that does **not** mean everyone should
wait on SHADING. Three of the eleven are genuinely downstream of the shadow fix and will have to be
re-measured after it; the rest are independent and can run in parallel today.

**Blocked on item 1 — do not tune these until the shadow fix lands, you will tune them twice:**
- item 2 (three-band ramp — same code path)
- item 4 (focal point / bloom — thresholds move when the value range moves)
- item 7 (character separation — a perfect rim will not save a blue character in a blue world)

**Independent, start now, different owners:**
- item 3 — **LIGHTING**: one torch in `interior`. Cheapest big win on the list.
- item 5 — **TEXTURES / ARCHITECTURE**: three specific over-panelled surfaces, plus glyph bevels.
- item 6 — **PROPS**: the obelisk is ~3× too wide for its own §8.1 footprint.
- item 8 — **POSTFX**: AO contributes nothing visible at contacts; also the bright paving joints.
- item 9 — **SKY**: `hero`'s grey zenith, the missing pyramid, `courtyard`'s filament clouds.
- item 10 — **FX/POSTFX**: shafts in `courtyard`.
- item 11 — **ARCHITECTURE**: triangles, up in every shot in every pass.
- **`dunes` sand hue** (inside item 1's family but a separate constant) — **TERRAIN**. It is the
  only shot that stayed warm and it is warm in the *wrong* direction: `#ad6044`, G/R 0.55 against
  the spec's 0.80. Also the black speckle artifact at ~(700–820, 230–290), unfixed for two passes.

## Re-score trigger

A full ten-shot capture, one coherent build, with:
- sunlit sandstone at **R−B ≥ +60**,
- on any object with a lit and an unlit face, **unlit luma ≤ 45% of lit**, sign never inverted,
- daylight frames back above **60% warm**,
- and at least one object per frame above **L230**.

I would expect that alone to move every daylight frame by two points, which would still leave the
set short of the floor — but it would make the remaining nine items measurable for the first time.

---

*`night`, `traversal`, `combat` and `guard` append below when batch 3 clears the FIFO. They are
**not** scored above and the mean will be restated when they land.*
