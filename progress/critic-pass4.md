# Critic pass 4 — the four shots nobody had ever scored

`night` · `traversal` · `combat` · `guard` — plus a re-score of `hero`, `sly-closeup`, `temple`

**Verdict: REJECT.** Mean **3.50 / 10** across the four new shots; **4.29** across all seven
scored this pass. Passing floor is 8. Best single frame in the project is now a 6.

---

## Provenance — read this before using any number below

**Build under review: `ed67555`, working tree clean at capture time.**

The manifest at `shots/r3/manifest.json` carries no `commit` block, so I reconstructed it. The
result is clean, and I am stating the evidence rather than the conclusion:

- The capture process waited **3,455 s** on the capture lock (`batch3.log`) and rendered between
  **13:43 and 13:53**. Frame mtimes: `night` 13:45, `traversal` 13:48, `combat` 13:51, `guard` 13:53.
- No file under `src/` had an mtime later than **13:04:58** (`src/fx/Particles.js`) at that point,
  and `git status` was clean at `ed67555`. The dev server therefore served `ed67555` for all four.
- The missing stamp is explained: `critic.mjs` gained the provenance block in `2d1c9bc` at
  **12:53:51**, and this process started at roughly **12:45** — Node had already loaded the older
  file. The stamp works; it just could not retroactively stamp a run that predated it. **The next
  capture will carry it.** Nothing to fix.

**These four frames do not straddle two builds.** Unlike pass 3, this is a single-build set.

### One caveat that is not about the frames

While I was analysing, **five source files were edited under me** — `src/world/Kit.js` (14:09:22),
`src/fx/Particles.js` (14:09:19), `tools/raster.mjs` (14:08:38), `src/fx/Emitters.js` (14:07:33),
`src/render/ToonMaterial.js` (14:07:13). Two of my offline measurements ran either side of that
boundary and disagreed by three orders of magnitude, which I chased to ground before believing
either (see §2). **Every pixel number below is from the `ed67555` frames.** Where I quote an
offline tool I say which version of it produced the number.

---

## 1. The method correction I owe from pass 3, and it reverses my own finding

Pass 3 scored `hero` on this, and I flagged at the time that I did not trust the reading:

> *"measured by plane: foreground L79.7, midground L92.4, background L94.8. Value **rises
> monotonically front to back** — the inverse of the dark-frame / lit-hero / hazed-distance
> structure §2.3 asks for"*

That was bucketed by **horizontal thirds of the image**, which assumes the near geometry is at the
bottom of frame. That is a guess, not a measurement, and it is the same class of error as the
tiling probe: I picked the buckets and then read the answer out of my own choice of buckets.

I have rebuilt it against **true scene depth** — the offline rasteriser's z-buffer at the identical
camera and resolution (`planes.mjs`), bucketing each live pixel by the depth of the architecture
actually at that pixel. Architecture-only, so sky/terrain/props/character are reported separately
rather than silently assigned to a plane.

| shot | arch coverage | NEAR luma | MID luma | FAR luma | near < mid? | sat NEAR → FAR |
|---|---|---|---|---|---|---|
| `traversal` | 83.7% | 57.1 (1.6–2.5 m) | 67.5 (2.5–29 m) | 71.0 (29–229 m) | **yes** | 0.375 → 0.347 |
| `night` | 83.6% | 19.0 (7.7–14 m) | 20.8 (14–18 m) | 28.0 (18–67 m) | **yes** | 0.679 → 0.648 |
| `guard` | 97.0% | 41.2 (1.9–5.5 m) | 66.9 (5.5–12 m) | 76.0 (12–18 m) | **yes** | 0.433 → 0.356 |
| `combat` | 97.3% | 66.0 (0.5–6.2 m) | 96.8 (6.2–10 m) | 99.3 (10–38 m) | **yes** | 0.530 → 0.341 |

**All four pass the dark-foreground half of §2.3, and my pass-3 conclusion had the sign backwards.**
A near plane darker than the mid plane, rising toward the distance, *is* the dark-frame /
lit-mid / hazed-distance structure. I read "rises front to back" as the inverse of it. It is the
shape of it. Whoever was going to act on that line in `hero`: **don't.** I have since re-run
`hero` itself and it measures 45.8 → 68.1 → 82.9, spread 37.1 luma (§10). The method error is mine,
it is corrected here, and the finding it produced is retracted.

**What actually fails is the other half of the rule — "hazed background at ≥ 60% atmospheric
blend".** `traversal`'s furthest architecture sits at **229 m** and is only **7.5% less saturated**
and 13.9 luma brighter than architecture at **2 m**. There is essentially no atmospheric
perspective at golden hour. `combat` is the only one doing real work (36% desaturation over 37 m).
This is a different defect from the one I named in pass 3, it routes to a different module, and it
is real.

### The tiling result, redone the way you asked

Pass 3's tiling probe sampled a fixed set of lags (32/48/64/96/128) when the real repeat was at
234–292 px, and concluded "no tiling" from a set that could not have found it. Corrected: a
**continuous normalised autocorrelation sweep** over lags 6–300 px, letting the data name the
period instead of me naming it.

- `traversal` rear wall (330,250 300×120): mean r **0.065**, **no peak above r = 0.30 anywhere in
  6–300 px**; global max is lag 6 px at r = 0.561, which is local smoothness, not a repeat.
- `guard` cream wall (200,60 320×200): mean r **−0.138**, **no peak above 0.30**; global max again
  lag 6 px.

**"Visible texture tiling repetition" genuinely passes**, and now for a reason the method can
support. Nobody needs to look at it again.

---

## 2. The 18.4% backface number is a measurement artifact. Stop chasing it.

`KNOWN_ISSUES.md` §10 asks the next agent to chase `traversal` at 18.4% of frame and `combat` at
4.9%. **Both numbers are wrong, and the file's own committed evidence frames disagree with its own
table.**

Running the tool committed at `ed67555`, unmodified, at its own 800×450:

```
traversal  12,351 px = 3.43%     (table says 64,715 px = 18.4%)
combat        880 px = 0.24%     (table says 16,849 px = 4.9%, "bronze_dark")
```

12,351 is exactly the magenta count in `progress/frames/geo-traversal.png`, the evidence frame
committed alongside the table in the same commit. **The frames are right; the table is stale.**

That is still not the true figure, because the committed tool is the naive single-buffer version.
The corrected version — two depth buffers, near-plane Sutherland–Hodgman clipping — was written
into the working tree at **14:08:38**, uncommitted. Its own header says 95% of `combat`'s and 80%
of `traversal`'s reported backfaces were an artifact of the missing near-plane clip. To get a
clean answer for the build I actually captured, I extracted `ed67555` with `git archive` into a
scratch tree (no change to anybody's working copy) and ran the **corrected tool against the
committed geometry**:

| shot | naive tool @ `ed67555` | **corrected tool @ `ed67555`** | corrected tool @ working tree 14:09 |
|---|---|---|---|
| `traversal` | 3.43% | **3.23%** (29,735 px) | 0.01% (79 px) |
| `hero` | 0.76% | **0.69%** (6,346 px) | 0.00% |
| `night` | 0.59% | **0.59%** (5,392 px) | — |
| `guard` | 6.32% | **0.00%** (3 px) | 0.00% |
| `combat` | 0.24% | **0.00%** (1 px) | 0.00% |

Four things follow, and each saves somebody an iteration:

1. **`combat` has no backface problem at all — one pixel.** The geo agent's own caveat ("if the
   offline rasteriser builds those shells, its `combat` figure is a false positive") was correct.
2. **`guard`'s 6.32% is entirely the sand-drift twin**, exactly as the corrected tool's comment
   predicts. I nearly filed it as a new finding — the largest unreported backface in the set — and
   it would have been a false positive. It is 3 pixels.
3. **`traversal`'s 3.23% is real and it is the single biggest thing wrong with that frame** (§5).
   Depth gap p50 **0.87 m**, and **182 px see straight through to sky**. A shallow open shell.
4. **It is already fixed in the working tree.** Kit's uncommitted change closes the back plane of
   `sweep()` and caps `cornerRolls`. `traversal` goes 3.23% → 0.01%. Verify it in the next capture;
   do not re-derive it.

**Whoever owns `KNOWN_ISSUES.md` should correct §10's table rather than leave it to send the next
agent after a 5.7× overstatement and a 4,900× one.**

---

## 3. The warm-fraction criterion, restated per shot — and a second cause I can corroborate

The shading agent has shown offline that at `hero`'s 22°/azimuth-186° sun only **4.7% of the frame
has N·L > 0.52** and **67% faces away from the sun entirely**, before cast shadows. That makes
"daylight frames above 60% warm" unreachable on `hero` by any shading setting: it is a **backlit**
composition, and the criterion was measuring the camera, not the renderer. **I accept that and I am
withdrawing the frame-wide form.** It was the weakest of my three and this is the right correction.

My other two stand unchanged, and for the reason given: they are ratios on the *same surface*, so
composition cannot move them.

- **A. Sunlit sandstone R−B ≥ +60.** Binding.
- **B. Unlit luma ≤ 45% of lit, sign never inverted.** Binding.

### Replacing the withdrawn one — three shot-independent forms

**C1 — the lit test (binding, replaces the frame-wide number).** Of pixels on sun-facing
architecture (N·L > 0.3, which the offline rasteriser already computes per shot): **≥ 90% warm
(R > B), median hue in 20–45.** Conditioning on the surface rather than the frame makes this
immune to how much of the shot happens to be lit. `combat`'s lit wall passes today (100% warm, hue
36); `traversal`'s lit wall fails (R−B −3.3, hue 273).

**C2 — the haze test (binding, new, and the one that matters most right now).** Sky and any surface
at ≥ 60% atmospheric blend must satisfy **B/R ≤ 0.70** at golden hour. §2.2's horizon `#f0c88a` is
0.575 and its haze `#e8b878` is 0.517, so 0.70 is already generous. **This is a better detector of
the cast than warm-fraction ever was**, because the sky is one surface, is never in shadow, and
carries no composition dependence at all.

**C3 — per-shot frame-warm floor (recorded, not binding).** Where a frame-wide number is still
wanted, derive it rather than fixing it: `floor = sunlitFrac + 0.5 × (1 − sunlitFrac − awayFrac)`.
For `hero` that is 0.047 + 0.5 × 0.283 = **18.9%**, and `hero` measures **41.0% warm** — it passes
comfortably. For `courtyard`, 0.245 + 0.5 × 0.566 = **52.8%**. The old flat 60% was failing `hero`
for being backlit, which is exactly the diagnosis.

### The split-tone: I can corroborate it from my own frames, and it re-routes one of my fixes

The claim is that PostFX's `smoothstep(0.08, 0.72, l)` crossover runs in scene-linear where 0.72
maps to display L192, so nearly every pixel takes the cool leg — B × 1.265, R × 0.914, a 38% B/R
swing on sky included. That makes a falsifiable prediction I can test without touching the code:
**the brightest, least-shadowed, most-should-be-warm regions in my frames must come out neutral or
cool.** They do.

| region | measured | B/R | §2.2 target | cool shift |
|---|---|---|---|---|
| `traversal` sky | `#b3a6a4` | **0.916** | horizon `#f0c88a` = 0.575 | **+59%** |
| `hero` sky | `#6f6371` | **1.018** | 0.575 | **+77%** |
| `temple` doorway (brightest opening in the set) | `#ada4a9` | **0.977** | 0.575 | **+70%** |
| `combat` sunlit sandstone | `#d4b17e` | **0.594** | albedo `#c9915a` = 0.448 | **+33%** |

The `traversal` sky and the `temple` doorway both measure **sat 0.070** — a sun-blasted opening and
a golden-hour sky, bleached to near-neutral. And the internal consistency is the convincing part:
**`combat`'s sandstone, the one surface in the set that passes criterion A, is also the one bright
enough to take part of the warm leg** (+33% rather than +59–77%). The two facts are the same fact.

**Three consequences for the ranked list, and I am applying them:**

1. **§8's item 1 has two owners, not one.** A `shadowTintPeak` fix alone cannot clear it. Nobody
   should be credited or faulted for the whole delta on either lever.
2. **§8's item 6 is misrouted and I am correcting it.** I filed "the golden-hour sky is grey, sat
   0.076" against **SKY**. At B/R 0.92–1.02 on a surface that is never shadowed, that is the
   PostFX cast, not `Sky.js`. **Do not send the sky agent after it.** The night sky measuring
   `#123468` at sat 0.861 — a frame where the cool leg is *correct* — was the clue and I read it
   as evidence the module works rather than as evidence of where the bug is.
3. **The AgX toe means I must not score a shading fix on its linear value.** Shadow illumination
   measures 12.8–13.9% of key, exactly §2.2's 14%, and the toe lifts that to a 53–62% display
   ratio. My pixel measurement and the source value were both right. **Criterion B is a display-space
   test and should be stated as one** — the knob has to overshoot in linear to land in display, and
   a fix that makes the linear number look wrong may be the correct fix.

That the agent's instrument reproduced every pass-3 figure across all six shots before measuring
anything new is worth more than the finding itself: it means the numbers in these reports replicate.

---

## 4. `night` — **3 / 10**

Draws 444, triangles **2.834 M** against a 1.2 M budget — the heaviest frame in the project.

### §7.3 conditions failed, quoted

- *"Any surface reads as flat vertex colour with no texture detail"* — the left building mass
  (0,200 480×500), **26% of the entire frame**, holds **78.9% of its pixels in four L/4 buckets
  spanning L12–L24**. Range p05→p95 is **26.6 luma**; 99.6% blue-dominant; hue p50 238 with p25–p75
  spanning eleven degrees. A quarter of the frame is one colour. The lit kiosk face (800,330
  160×170) is worse: **88.6% in four buckets, L32 alone taking 44.7%, total range 15.9 luma**.
- *"Shadows are grey/black instead of coloured, or crush to zero detail"* — coloured, yes
  (darkest 0.5% mean `#06041a`, violet, not black). Failing on the crush: **78.5% of the frame is
  below L40 and 50.3% is below L20.** Half the image is in a 20-luma basement.
- *"No rim light separating silhouettes from the background"* — Sly at (680,390 80×70) measures
  luma **21.4**. Scanning across him at y=430, his immediate surround runs L18–21 on the left and
  L12–23 on the right. **He is separated from his background by 0–3 luma.** Three isolated cool
  pixels at x=676/706/724 (L41–44) are the entire rim. In the stealth shot, you cannot find the
  stealth character.
- *"No single hero focal read"* — `≥ L230` is 0.119% of frame and **all of it is the moon**
  (centroid 438,95, mean `#e6ecf3`, sat 0.053). **Zero pixels within tol-70 of gold `#e8b942`.**
  Nothing in the architecture is bright.
- *"No volumetric light shafts anywhere they'd be motivated"* — none; the two warm doorways at
  ~(700,360) and ~(985,360) are the only light sources in an interior-adjacent night scene and
  neither throws anything.
- *"Bloom is a grey wash instead of a tight coloured halo on bright things"* — the moon's core
  spans 30 px at L233–239, which is tight, but at **sat 0.053** it is achromatic, and it is the
  only bloom source in the frame.
- *"Architecture reads as boxes"* — with one real qualification, below.
- *"Placed blind next to Mario Odyssey / Sly 4, an art director picks the other one."*

### Passing, and worth not re-opening

**The sky is the best single element in this set.** (950,40 320×200) measures `#123468`, hue 216,
**sat 0.861**, luma 48.8, with real cloud striation. That is §2.2's palette, executed. Outline
colour passes (darkest 0.5% `#06041a`, **0.000% pure black**). Cornices are visibly present — the
crown on the central kiosk at (555–1150, 250–320) and the stepped crown at (890–1010, 130–190) both
read. Airborne particulate is present.

### The thing that is wrong that isn't on the list

Roughly **2.1% of the left mass (5,016 px)** is bright-cool speckle at mean `#335576`, in short
dashes — at y=380 the body runs L7–25 and single pixels spike to **L66 and L105**. Against an L16
field that is a 6.5× local contrast, and there are hundreds of them.

I checked what they are before calling it, because "cyan noise" could have been particulate.
**83.5% of them sit within 3 px of a >40-luma step**, and their horizontal runs are **p50 1 px,
p90 5 px, max 20 px**. They are not motes — they are **edge-located 1–5 px lines**. The outline
system, or the rim firing on depth discontinuities, is writing *light* where §2.1.2 specifies ink
that is "a very dark, slightly warm brown in sunlight and a dark violet in shadow". The right-hand
mass measures the same way (68.2% edge-located, p50 2 px).

Bright ink on every architectural crease is the largest single reason this frame reads as a
**space station rather than a temple**: it is exactly how greebled hull panelling is drawn.

### Blind comparison — vs **Sly 2/3 HD, the Paris rooftops at night**

From my own knowledge of those games, not from a downloaded image. **Sly 2 wins, and it is not
close.** In the Sly 2 rooftop stealth sections the roof planes stay at a readable mid-value slate
under an indigo sky, warm window lights punch holes in it, and Sly is a hard near-black silhouette
carrying a bright cool rim and a blue cap you can pick out at any distance. The whole point of
that palette is that the *character* is the darkest committed shape against a lighter field. Ours
inverts it: the environment is L12–24 and Sly is L21, so he is not a silhouette against anything.
**The concrete tell: in Sly 2 you find Sly in the first quarter-second. Here I found him by
looking for his outline.**

### Highest-leverage fix

Lift the architecture out of the L12–24 basement so there is a field for a silhouette to sit
against — it is not a rim problem first, it is a **value-range** problem. The rim has nothing to
separate him from.

---

## 5. `traversal` — **2 / 10** · worst in the set

Draws 408, triangles 2.735 M.

### The frame is dominated by a shape that should never have been rendered

The right-hand 35% of the image — a huge smooth curved mass running from (540,0) through (760,300)
to (1000,720) — is **the inside of an unclosed cornice ring**. The geometry agent's own uncommitted
note calls it "the giant croissant". The corrected rasteriser puts **29,735 px (3.23%)** of true
see-into-a-shell backface in this frame, gap p50 0.87 m, **182 px straight through to sky**, and
the offline render (`geo-traversal.png`, 1280×720, `ed67555`) shows magenta wedges at (1000–1130,
260–450) and (860–1060, 580–720) inside exactly that mass.

In the untextured raster the croissant has **no architectural reading at all** — it is a curved
sheet with no profile, no course lines and no scale. The single largest object in the money-shot
traversal frame is a rendering artifact. **Fixed in the working tree at 14:09; unverified in a
capture.**

### §7.3 conditions failed, quoted

- *"Any surface reads as flat vertex colour with no texture detail"* — the croissant (950,300
  300×250): **69.0% of pixels in four L/4 buckets spanning L48–L60**, total range 44.0, hue p50 273.
- *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"* — the wall
  at (300–750, 200–620) is a grid of small rectangular recesses. At 2× crop, (150–330, 180–330)
  reads as **a bank of drawer fronts**. Not one Egyptian glyph on the primary wall of the shot.
- *"No rim light separating silhouettes from the background"* — Sly at (430,250 90×110) is a
  ~90 px white blur, luma p95 179.6 against a p25 of 54.5, sat p50 0.197. He has no cap, no mask,
  no tail and no cane you can point to.
- *"Silhouette not instantly readable as Sly (cap, mask, tail, cane)"* — same region. He is a blob.
- *"Empty sky, or background not atmospherically hazed"* — sky (40,40 380×160) mean `#a59c9d`,
  **sat 0.076**. Grey. §2.2's zenith is `#3f7fc4`. No cloud bank, no pyramid; two birds at ~(110,265)
  are the only content. And the FAR plane at 229 m is only 7.5% less saturated than the NEAR at 2 m.
- *"No single hero focal read"* — `≥ L200` is **0.099%**, `≥ L230` is 0.028%. **Zero gold pixels**
  within tol-70 of `#e8b942`. **Zero turquoise, zero malachite.** The §2.2 accent palette is unused.
- *"Gold doesn't read as metal"* — by absence: there is none.
- *"No ambient occlusion in crevices / where forms meet"* — walking down the wall/deck contact at
  x=560: 77, 77, 76, 79, 80, 79, 68, 72, **25**, 84, **137, 140**, 118… The only dark event is a
  1 px ink line, and the deck immediately below it *brightens* by 60 luma. No occlusion gradient
  on either side.
- *"Placed blind next to Mario Odyssey / Sly 4, an art director picks the other one."*

### The measurement that explains this whole frame

Same material, same sun (`tod 0.77`), 20 pixels apart at the wall/deck seam at x=560:

| surface | measured | R−B | hue |
|---|---|---|---|
| deck, normal ≈ up, N·L ≈ 0.55 | `#cc7b4a` | **+130** | 26 |
| wall above it, normal ≈ camera, N·L ≈ 0.10 | `#5c475c` | **+0.8** | 287 |
| `sandstone_block` albedo, as authored | `#c9915a` | +111 | 30 |

The wall is not "sandstone in shadow". It is **257° of hue away from its own albedo**, and it has
lost **110 of the 111 points of R−B the material author put into it**. The mid-ground wall
(330,250 300×120) reads hue p50 **287**, p75 **311** — that is magenta, and §2.2 contains no hue
above 220 anywhere.

The discriminator is **surface orientation, not lighting level**: up-facing faces stay correct,
faces past the terminator invert. And the binding acceptance criterion — *sunlit sandstone
R−B ≥ +60* — measures **−3.3** on the lit wall face at (600,60).

For contrast, this is not global: `combat`'s sunlit wall at (210,270 390×150) measures **R−B +75.6,
hue 36, 100% warm.** It passes there. `traversal` is a camera aimed at the shadow side of
everything, which is exactly the condition that exposes the bug.

### Blind comparison — vs **Sly 2/3 HD rooftop stealth**, and vs **BotW's Gerudo Highlands at dusk**

From my own knowledge of both. **Both win, comfortably.** Against BotW: Gerudo's sand holds a
committed hue split — lit faces a strong ochre, slip faces a distinct violet-blue that is *darker
and cooler but never a different colour family*, and the mesas at distance are blended most of the
way to the sky. Ours puts the lit deck at hue 26 and the wall four feet above it at hue 287, which
is not a shadow, it is a different material. Against Sly 2: their rooftop runs read as **stacked
readable planes with a clear path through them**; ours is one enormous smooth curved blob you
cannot name, with the character a white smudge in front of it.

### Highest-leverage fix

The shadow/ambient term. Nothing else in this frame survives it. The croissant is second and is
already fixed.

---

## 6. `combat` — **5 / 10** · best in the set

Draws 383, triangles 2.646 M.

### What genuinely works, stated once

Real warm/cool tension: 57.3% of the frame warm, lit sandstone at (210,270 390×150) **`#cfb083`,
R−B +75.6, hue 36, 100% warm, luma p50 180** — the §2.2 sandstone read, correct, and the only
place in this set I found it. A real bloom source: **0.940% of frame ≥ L230**, mean `#f6ead4`, tight
around the impact at (454,404). Floor slabs carry cast shadows with legible edges. Depth spread
33.3 luma near-to-far with 36% desaturation — the best atmospheric behaviour of the four.

### §7.3 conditions failed, quoted

- *"Silhouette not instantly readable as Sly (cap, mask, tail, cane)"* — his body (505,430 120×180)
  measures `#a68b6d`, **hue 31, R−B +57, luma p50 158**. The wall directly behind him measures
  **hue 36, luma 180**. **Twenty-two luma and five degrees of hue between the hero character and
  the wall he is standing in front of.** He reads as an unpainted mesh — a line drawing with no
  local colour. There is no blue anywhere on Sly.
- *"No rim light separating silhouettes from the background"* — with a 22-luma, 5° difference
  there is nothing for a rim to do, and there is none. Scanning y=470 across x 430–780, every
  transition in and out of his body is an ink line between two cream values.
- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"* — **this is the one I had wrong
  in pass 3 and the fresh frame says something worse.** I first read a scanline at y=600 as two
  plateaus (~L150 and ~L82) and was going to file "two bands, not three". A luma histogram of his
  torso and legs (520,470 140×190, FX flare excluded) shows **no plateau structure at all**:
  thirty consecutive L/4 buckets from L100 to L224 each carrying 1–5%, rising smoothly to a peak
  at L144 and falling away smoothly. That is a **continuous Lambert gradient**, not a 3-band ramp
  with a thin mid-tone. The lit wall behind him measures the same way — L124 through L236 with no
  step. Scanline plateaus were an artifact of where I put the scanline; the histogram is the
  honest instrument and it fails the condition outright rather than by one band.
- *"Any surface reads as flat vertex colour with no texture detail"* — the top-right wedge
  (950,40 300×250): **74.1% in four buckets, L16 alone at 37.5%**, hue p50 265. A near-black violet
  triangle with pale diagonal streaks occupying 8% of the frame.
- *"No normal-map relief on stone; carvings look painted-on"* — the right-hand wall (660,280
  340×180) reads as **orange corrosion blotches on a violet ground** (hue p50 227, p75 280,
  R−B +24.7). It is a rust texture, not chiselled limestone.
- *"Placed blind next to Mario Odyssey / Sly 4, an art director picks the other one."*

### Blind comparison — vs **Sly: Thieves in Time**, any cane-combo impact frame

From my own knowledge of the game. **Thieves in Time wins on one axis and it is the decisive one.**
Their characters carry **committed saturated local colour** — Sly's blues and greys are painted
into the model and hold their identity under any light, so at the moment of impact the FX flare
blows out *around* him and he stays a blue shape inside it. Ours has no local colour to defend:
Sly is rendered in the same warm cream as the wall, so when the flare fires he dissolves into it.
The pose and the FX are honestly close to shippable. **The character is a coloured drawing with
the colour missing.**

### Highest-leverage fix

Give Sly local colour that is not the environment's hue, then hold exposure off him. The impact
frame is otherwise the closest thing in this project to a real game.

---

## 7. `guard` — **4 / 10**

Draws 273, triangles 1.963 M — the only shot inside a plausible distance of the §1 budget.

### What works

**The Anubis silhouette is the best character read in the project so far.** Pointed ears, snout,
tall lean frame — it says Egypt at a glance, which nothing in the architecture manages. Real AO
at the wall/floor contact: scanning x=350 down through the seam gives 149, 149, 148, 147, 145, 145,
132, **34** (ink), 93, 102, 105, 107, 124 — **31 luma of contact darkening below the seam and 17
above it.** That is genuine occlusion, and it is the only place I found it in this set. The brick
pier at (590–720, 0–300) carries real masonry variation. Depth spread 34.8 luma.

### §7.3 conditions failed, quoted

- *"No rim light separating silhouettes from the background"* — his body (820,300 90×200) measures
  luma p50 **17.4**; the floor immediately left of him (700,560 90×90) measures luma p50 **13.0**.
  **Four point four luma of separation on his shadow side.** On the right he gets to ~3× (L15 vs
  L43), but by value step alone — scanning y=450, there is no bright edge pixel anywhere on his
  contour. He is legible on one side by luck of what is behind him.
- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"* — the guard's body (790,250
  170×300) has **exactly one mode, at L16, holding 59.3% of him**. Not three bands, not two: one
  value. He is clamped flat against the shadow floor, so no ramp exists on the character the shot
  is named for.
- *"Any surface reads as flat vertex colour with no texture detail"* — the cream wall (200,30
  320×270) is **sat 0.238, range 66.4 luma, 37.7% in four buckets**, and at 2× crop it is a smooth
  field with thin darker horizontal rules every ~40 px and **nothing else**. 86,400 px of blank
  plaster where §2.1.7 asks for chisel character, crevice grime and block-to-block variation.
- *"No volumetric light shafts anywhere they'd be motivated"* — this is *the light-cone shot*
  (§7.2: "Guard character + patrol light cone"). The doorway at x=780 reads **L8–L17 from y=60 to
  y=264** — a black hole where a shaft is maximally motivated. The floor wash at (200–700, 300–620)
  has no cone geometry, no origin and no falloff you can trace to a source.
- *"No single hero focal read"* — `≥ L200` is 0.234% and its centroid is **(1195, 243)**: the
  brazier, jammed against the right frame edge and cropped by it. **Zero gold pixels** in frame.
- *"Bloom is a grey wash instead of a tight coloured halo"* — ~25 soft cream discs 20–40 px across
  scattered over the walls at (250,80), (430,40), (270,215), (300,380), (460,410), (505,290),
  (1180,45)… Profiled at y=215 one of them lifts a L128 wall to **L152 over 40 px** with no hard
  edge. They are meant to be dust motes; at this size, count and softness they read as **a dirty
  camera lens**, and they sit in front of the architecture rather than in the air of the room.
- *"Shadows are grey/black instead of coloured, or crush to zero detail"* — 42.3% below L40, 28.9%
  below L20, and at y=560 the floor falls from **L88 at x=530 to L18 at x=550** — a 70-luma cliff
  in 20 px with no penumbra and no bounce.
- *"Placed blind next to Mario Odyssey / Sly 4, an art director picks the other one."*

### The cool contact line is still here

At y=560, x=470: **`#89a8b4`, B−R = +43, L162**, a cool blue-grey bright line lying on a warm
`#756b62` floor. The grazing-surface contact line was reported as fixed. In `guard` it is not.

### Blind comparison — vs **Sly: Thieves in Time**, any guard in the Egypt (or Arabia) chapter

From my own knowledge of the game. **Thieves in Time wins.** Their guards are lit so that the
*costume* does the work — a mid-value body with a saturated sash or helmet catching a hard key, so
the character is a composition of two or three colour blocks you can read across a room. Ours is
**81.6% of its pixels inside L12–L24**: one value, no blocks, no key. The head (830,180 110×120) is
`#1f2036` at sat 0.563 — the shape is right and there is nothing painted on it. Their frames also
always motivate the light; ours has a light cone in the shot name and not in the shot.

### Highest-leverage fix

Put the patrol cone in the patrol-cone shot, aimed so it rakes across the guard rather than the
empty floor. It fixes the missing volumetric, the missing focal read and the guard's separation in
one move.

---

## 8. Ranked — most damaging first

Ranked by what the defect costs the frame, not by effort.

### 1. Sandstone renders at hue 260–290 instead of 30 — **two independent causes, two owners** — **POSTFX** `src/render/PostFX.js` *and* **SHADING** `src/render/ToonMaterial.js`
**Read §3 before acting on this.** The split-tone crossover in PostFX puts ~89% of `hero`'s pixels
on the cool leg (B × 1.265, R × 0.914) including the sky, and the shadow term is the second lever.
**A fix to `shadowTintPeak` alone will leave most of the cast in place.** Split the work; measure
each lever separately against criteria A/C1/C2.
Wall `#5c475c` (hue 287, R−B **+0.8**) twenty pixels above deck `#cc7b4a` (hue 26, R−B **+130**),
same material, same sun. Albedo is `#c9915a` (hue 30, R−B +111) — **110 of 111 points of warm bias
destroyed**. Mid-ground wall hue p75 = **311**. §2.2 has no hue above 220. Binding criterion
"sunlit sandstone R−B ≥ +60" measures **−3.3**. Between them these two levers are why `traversal`
is a purple frame, why `temple`'s largest hue bucket is 270, and why nothing in the set except
`combat` reads as stone. Everything below is downstream of them.

### 2. Where a cel ramp is actually testable, it is a continuous gradient — **SHADING**
§2.1.1 is the first non-negotiable ingredient in the bible, and this is the first pass that has
measured it with a histogram rather than a scanline. The honest test is a curved surface under a
strong key: `combat`'s Sly (520,470 140×190) gives **thirty consecutive L/4 buckets from L100 to
L224 at 1–5% each**, a smooth rise to L144 and a smooth fall — no plateaus. `combat`'s lit wall is
the same from L124 to L236.

State the mixed evidence rather than overclaiming: `traversal`'s deck does show four modes
(L48/L68/L92/L128) and `guard`'s wall two (L124/L144), but those are flat planes where patchy
shadow and texture supply the steps. `night`'s kiosk face has **one** mode (L28, 81.8%) and the
guard's whole body has **one** (L16, 59.3%) — clamped flat, no ramp at all. **Nowhere in this set
did I find the shadow / thin-mid / light triple §2.1.1 specifies on a surface where it would show.**

### 3. Character/background separation is 0–4 luma in three of four shots — **SHADING** (rim) + **CHARACTER** (local colour)
`night` Sly L21.4 vs surround L18–21. `guard` jackal L17.4 vs floor L13.0. `combat` Sly hue 31 vs
wall hue 36, 22 luma apart. The rim regression is real but it is the *second* cause: **there is
nothing for a rim to separate because the character and the environment are the same colour.**
Committing Sly's local blue and the guard's costume blocks fixes more than the rim will.

### 4. No gold anywhere, therefore no hero read — **PROPS** / **ARCHITECTURE** placement + **LIGHTING**
**Zero pixels** within tol-70 of `#e8b942` in `night`, `traversal` and `guard`. §2.3 says the
single brightest thing is usually gold. `combat` is the only shot with a focal read and it is an FX
flare, not an object. `guard`'s brightest pixels are a brazier cropped by the right frame edge.

### 5. `traversal`'s hollow cornice ring — **ARCHITECTURE** `src/world/Kit.js` — **already fixed, verify only**
3.23% of frame, 29,735 px, gap p50 0.87 m, 182 px through to sky, and it is the largest object in
the shot. Working tree at 14:09 takes it to 79 px. **Confirm in the next capture; do not re-derive.**

### 6. No atmospheric perspective at golden hour — **SKY** `src/render/Sky.js` for the depth blend; **POSTFX** for the colour
`traversal` FAR (229 m) is only 7.5% less saturated than NEAR (2 m) against §2.3's ≥ 60% blend —
**that half is SKY's.** The grey sky is **not**: at B/R 0.92–1.02 on an unshadowed surface it is the
PostFX cool cast (§3), and I had this misrouted. The night sky at `#123468` sat 0.861 is the same
module doing it right in the one frame where the cool leg is correct.

### 7. Large flat untextured fields — **TEXTURES** `src/textures/**`
`night`'s left mass: **26% of the frame inside 26.6 luma**, 78.9% in four buckets. `guard`'s cream
wall: 86,400 px at sat 0.238 with horizontal rules and nothing else. `traversal`'s primary wall
reads as drawer fronts at 2×. Tiling passes; *content* does not exist.

### 8. The outline system is writing *light* ink on `night`'s creases — **POSTFX** / **SHADING**
5,016 px on `night`'s left mass at `#335576`, spiking to L105 against an L16 field. **83.5% sit
within 3 px of a >40-luma step; runs are p50 1 px / p90 5 px.** Edge-located bright lines, not
particulate. §2.1.2 specifies dark warm-brown or dark violet ink. It is the main reason `night`
reads as a machine.

### 9. No sparkle language — **FX** `src/fx/**`
`traversal` contains **0 pixels** near `#8fd8ff`, and it is the shot where Sly is hanging from a
cane hook — the exact fixture §2.1.6 names. `night` 115 px, `combat` 12, `guard` 13.

### 10. No volumetric shaft in the one interior that names one — **FX** / **LIGHTING**
`guard`'s doorway is L8–17 over 200 px of height.

### 11. `combat`'s exposure blows the hero out — **POSTFX** `src/render/PostFX.js`
3.944% of frame ≥ L200 with the character inside the flare.

### 12. The cool contact line survives on grazing floors — **SHADING**
`guard` y=560 x=470: `#89a8b4`, B−R +43, on a warm floor. Reported fixed; is not.

### 13. Triangle budget — **ARCHITECTURE**
`night` **2.834 M** against 1.2 M, the highest yet recorded. `guard` 1.963 M is the only one within
reach. Draws 273–444 against 250.

---

## 9. Scores, and what the mean does and does not mean

| shot | score | one-line reason |
|---|---|---|
| `night` | **3** | half the frame in a 20-luma basement; the stealth character is 0–3 luma from his background |
| `traversal` | **2** | the largest object in frame is an unclosed shell; stone renders 257° from its own albedo |
| `combat` | **5** | correct sandstone, real bloom, real cast shadows — and the hero has no local colour |
| `guard` | **4** | the best silhouette in the project, at one value, with no light cone in the light-cone shot |

**Mean 3.50 across the four.** With §10's re-scores of `hero` (4), `sly-closeup` (6) and `temple`
(6), the seven shots scored this pass average **4.29**.

**Be careful what you compare that to.** The 4.2 baseline and my 3.67 are six-shot means over
`hero`/`temple`/`courtyard`/`sly-closeup`/`dunes`/`interior`. The four new shots share no members
with that set, so they cannot move it. The comparable figure is the three re-scored shots:
**`hero` 3→4, `sly-closeup` 5→6, `temple` 4→6 — every one up, +1.33 mean on matched shots.**
Against that, the four previously unscored shots come in at 3.50, which is *below* everything
measured so far. Both statements are true and neither cancels the other: **the work is improving
and the unmeasured half of the set was worse than the measured half.**

The honest read on trajectory: **the pass-3 fixes that landed are visible and they work.** Sly
has local colour, the cornices are in frame, `temple` has real volumetrics. Cornices
are in frame and reading in `night` and `traversal`. The night sky is genuinely good. `combat`
holds correct sandstone at R−B +75.6 and a real tight warm bloom. Outlines pass everywhere, none
of them pure black, all correctly warm-brown or violet. Tiling passes, properly measured this time.
The set did not score low because nothing improved; **it scored low because the four unscored shots
were the four worst, and one dominant shading defect is spread across all of them.**

---

## 10. Addendum — `hero`, `sly-closeup`, `temple` (set `r4`), and the stamp earning its keep

The queued capture landed at 14:29. **Its manifest carries the provenance block, and the block
immediately told me something I could not otherwise have known:**

```json
"commit": { "sha": "ed67555", "dirty": true, "capturedAt": "2026-08-01T14:29:58.384Z" }
```

`dirty: true`, and worse than that — **source files were edited while the run was rendering.**
Frames: `hero` 14:23, `sly-closeup` 14:27, `temple` 14:29. Source mtimes inside that window:
`Clips.js` 14:16, `Kit.js` 14:19, `Lighting.js` 14:22, `Particles.js` 14:23, `Materials.js` 14:25,
`SlyModel.js` 14:27, `PostFX.js` 14:27. The page booted at roughly 14:14.

**These three frames are from up to three different code states and none of them is `ed67555`.**
That is exactly the straddle I had to reconstruct by hand in pass 3, and this time the tool said so
in one line. **The stamp works. It is the most valuable thing added to the harness this cycle.**

I am therefore scoring these three **provisionally**, and anyone acting on them should re-capture
against a quiet tree first. What follows is what the pixels show; the trend is trustworthy, the
exact numbers are not re-derivable.

### `hero` — pass 3: 3 → **provisionally 4**

**The pass-3 depth-plane claim is now disproven on `hero` itself.** Measured against true depth on
a fresh frame: **NEAR 45.8 → MID 68.1 → FAR 82.9, spread 37.1 luma.** Near is darker than mid. The
structure §2.3 asks for is present, and my pass-3 line — *"value rises monotonically front to back
— the inverse of the dark-frame structure"* — was wrong about what it was looking at, and wrong
about the magnitude too (I reported a 15-luma spread; it is 37.1). **That line is retracted.**

**The pass-3 unscored gold condition, now scorable.** Pass 3 explicitly deferred *"Gold doesn't
read as metal"* because my frame predated the gilding fix. Scored now: **2 pixels** within tol-70
of `#e8b942`, max frame luma 225.4, **0.000% above L230**. It still fails, and the focal read fails
with it — there is nothing bright enough in `hero` to be a hero.

Genuine progress, stated once: **Sly is legible.** He carries real local colour and a readable
cane and pose at (600,200). Cornices now read at (95–215, 90–130) and (700–900, 85–130) — the
cavetto crown is in frame and doing its job. Backfaces are **0.00%**.

Still failing: **62.1% of the frame sits in hue buckets 240/270/300** against 3.6% at sandstone's
hue 30. The pier at (235,60 70×300) is **82.1% inside L36–L48, range 19.5 luma, hue 260** — a flat
violet slab. And Sly at hue p50 261 is *the same hue as the pier behind him*: the local-colour fix
landed, and the environment moved onto his colour instead.

### `sly-closeup` — pass 3: 5 → **provisionally 6** · best shot in the project

**This is the first frame in four passes that would survive being shown to somebody.** Cap, mask,
striped tail, gloves, boots and cane all read instantly. The pose is a confident weight-shifted
stance on the cane, not an A-pose. Ink weight varies. And the thing I have asked for in every
ranked list has landed: **his jacket measures `#365975`, hue 203, sat 0.538, R−B −62.9, 95.1%
blue-dominant.** That is committed local colour, and it is what makes the silhouette work.

Two things stop it: **his eyes are two blown white discs.** The box at (608,152 76×42) puts
**13.5% of its pixels at L228–235 against a face at p50 87.8** — 145 luma of separation, at sat
0.180. The brightest pixels in the entire frame are his eyeballs, and they are colourless. The
KNOWN_ISSUES note warned the previous emissive read as "two yellow dots"; the correction has
overshot into headlights, and the mask is lost inside the glare. And the wall behind him is hue
p50 **278**, **77.8% inside L52–L64** — flat magenta.

### `temple` — pass 3: 4 → **provisionally 6**

**The volumetrics are real and they are good.** Scanning y=300 across the hall, the shaft at x=840
reads **L138 against L66–78 immediately beside it** — a +60 luma god-ray, with dust motes inside
it, raking the full depth of a receding colonnade to a bright framed doorway with an obelisk
silhouetted in it. Star ceiling overhead. This is the first frame in the project with a genuine
compositional idea, and §2.3's "volumetric light shafts raking through at least one opening" now
passes here.

Still failing: **hue bucket 270 is the single largest in the frame at 34.8%** — the hall is pink.
The columns (950,200 180×380) measure sat 0.265, hue p50 272, with **no fluting, no glyph and no
capital detail**; at this scale they are smooth tapered slabs. And **max luma 221.9, 0.000% above
L230, 0.011% above L200** — a hall full of light shafts with no bright thing in it.

### What the three add up to

All three moved up. The direction is right and the work landing is the right work. Every one of
them is still held back by **the same single defect at the top of §8's ranked list** — architecture
rendering at hue 260–290 instead of hue 30 — which now demonstrably costs the project its three
best frames, not just its worst one.

---

## 11. Still outstanding from my side

All three items I owed are discharged in §10:

1. **`hero`'s depth planes, re-measured against true depth** — done, and it **retracts** my pass-3
   finding. Near 45.8 → mid 68.1 → far 82.9, spread 37.1 luma.
2. **`hero`'s gold condition**, deferred in pass 3 — scored: **2 pixels**, still fails.
3. **`sly-closeup` at 1:4.16 and yaw 33°** — captured and scored at 6, the best frame in the
   project, with the eye blowout as the one thing standing between it and a 7.

**The one thing I could not do properly**: `r4` came back `dirty: true` with seven source files
edited mid-render, so those three scores are provisional. If someone wants them binding, the
capture needs a quiet tree. That is a coordination problem, not a harness one — the harness told me
about it correctly and immediately.

---

*Pass 4. Build `ed67555`, clean. Four frames, captured 13:43–13:53, single build, verified.
No source file was edited by me.*
