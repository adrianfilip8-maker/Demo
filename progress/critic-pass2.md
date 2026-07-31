# Critic — scoring pass 2

**Review set:** `shots/pass2/` — 1280×720, quality `high`, captured 2026-07-31T03:29:05 → 04:09:38Z.
**Reviewer:** adversarial art director, per `tools/CRITIC.md`. No involvement in the build.
**Method:** every PNG and every 2× centre crop opened and looked at. Nothing reviewed from
filenames, the manifest, or source. Where a claim was made about a fix, I measured it off the
pixels rather than taking it on trust — those measurements are quoted inline.

---

## Verdict: **REJECT**

**Mean 4.2/10, up from 2.2. Best score 5. Pass floor is 8.**

| shot | pass 1 | pass 2 | Δ | one-line |
|---|---|---|---|---|
| `hero` | 3 | **5** | +2 | Ink and stone fixed; still monochrome-warm, no gold, foreground still brightest |
| `temple` | 3 | **4** | +1 | Columns finally read as columns — still zero light shafts, the shot's whole purpose |
| `sly-closeup` | 0 | **4** | +4 | There is a subject now. Cap/tail/cane read. **The face is broken** |
| `courtyard` | 3 | **5** | +2 | Blue sky is a real win; clouds read as marbled endpaper; obelisk still a bunker |
| `dunes` | 4 | **5** | +1 | Sand still streaky; pyramids now visible *and* visibly stair-stepped |
| `interior` | 2 | **4** | +2 | Treasure and jars legible; still no torch, no volumetrics, skybox still leaking |
| `night` | 2 | **5** | +3 | Biggest fix in the set — crush and blue-wireframe both gone. Daylight leak unfixed |
| `traversal` | 3 | **5** | +2 | Sly reads as hanging; the giant croissant and its smearing are untouched |
| `combat` | 1 | **3** | +2 | Subject exists but is washed to near-white. No guard, no impact FX |
| `guard` | 1 | **2** | +1 | Traded an 85%-black frame for a 60%-blurred-blank one. **Still no subject** |

Every shot moved up and none moved down. That is real progress and the root-cause work behind
it is visible in the pixels. It is also still four points short of the bar in the best case, and
§7.3's final condition — *"Placed blind next to Mario Odyssey / Sly 4, an art director picks the
other one"* — is failed ten times out of ten, same as pass 1.

---

## Set validity — resolved, and this set **is** coherent

I was told mid-review that GUARDS had landed underneath me (commit `b87c462`) and that pass 2
might have pass 1's coherence defect. Checked against timestamps rather than assertion:

```
capture process start          03:29:05
last source mtime before it    03:24     src/render/shaders/toon.glsl.js
b87c462 commit time            03:35:54  ← lands mid-capture
b87c462 contents               shots/guards/*.png ×4  — ZERO source files
find src tools -newermt '03:29:05'   →  0 files
```

`b87c462` is a screenshot-artifact commit. It changed no code, so it cannot change what the
renderer produced. `src/ai/Guard.js` was last written 03:06:24 and `src/ai/GuardModel.js`
00:58:01 — 23 minutes and 2.5 hours before capture began. **Not one file under `src/` or
`tools/` changed during the 40-minute capture window.** This is case 3: the whole set postdates
every source change. No re-capture needed, and unlike pass 1 every finding below is against one
consistent build.

On the leg fix specifically: `buildLeg` in `GuardModel.js:853` builds 3-element tuples and reads
only `k[0]`/`k[1]`/`k[2]`. There is no fourth-element index. Whatever the NaN bug was, the tree I
captured does not contain it. It is moot anyway — see `guard`, where no guard is in frame at all.

---

## §1 budget — still breached, ~2×

| Constraint | Budget | best shot | worst shot | Verdict |
|---|---|---|---|---|
| Draw calls | ≤ 250 | 410 (`guard`) | **542** (`night`) | **OVER by 64–117%** |
| Triangles | ≤ 1.2 M | 1.92 M (`interior`) | **2.33 M** (`night`) | **OVER by 60–94%** |
| Programs | — | 87 → **137** mid-run | | grew 57% during one capture |

Marginally better than pass 1 (548 / 2.355 M) but not materially. The programs count rising from
87 to 137 partway through a single run — every shot from `dunes` onward reports 137 — means
~50 shader variants are being compiled lazily at shot-switch time rather than warmed up front.

Unchanged manifest signals from pass 1, all still live:

- **`fx: no emitter named "embers"` ×8.** Identical to pass 1. This is the direct cause of two
  §7.2 failures — no lit braziers in `night`, and **no airborne particulate in any of the ten
  frames**. Owner: **FX**. It is the cheapest outstanding item in this report.
- **`consoleErrors`: one 404.** §1 forbids external asset fetches. Still unidentified.
- **`collision: pole … has no userData.spline — synthesised one`** ×2.
- All 17 modules load; all 52 required clips present.

---

## What I verified as genuinely fixed

I measured each headline claim rather than trusting it. These hold up:

| claim | measurement | verdict |
|---|---|---|
| Ink was effectively `#000000`, now on-palette | darkest 0.15% of pixels: pass1 `#3b0312`, 0.9% pure black → pass2 **`#1a111b`, 0.0% pure black** | **VERIFIED.** Sits between §2.1.2's `#1a1210` and `#161022` |
| Grade was clipping red to zero in dark pixels | `night` dark pixels with R exactly 0: **52.1% → 0.0%**; min luma 0.0 → 4.6 | **VERIFIED.** Cleanest fix in the set |
| Sky was ~100% overcast | top-30% pixels with B>R: `courtyard` 0.8% → **65.7%**, `dunes` 0% → **21.5%** | **VERIFIED** directionally, though my metric is stricter than the one quoted |
| Cast shadows now work | `hero` colonnade floor swings luma 25→201 in banded structure; `guard` carries a crisp diagonal shadow edge across a wall | **VERIFIED.** Shadows are real and placed |
| Outlines depth-graded | near obelisk edge 3 px, background architecture 1–2 px | **VERIFIED** — pass 1 was uniform |
| Violet blotching gone | no violet on any stone surface in any of the ten frames | **VERIFIED** |
| White-cyan outline halo gone | edges are dark ink, no overshoot | **VERIFIED** |
| Blue "wireframe rain" at night gone | `night` masonry no longer draws itself in glowing blue | **VERIFIED** |
| Sly's cap/tail/cane rebuilt | all three legible in `sly-closeup` and `dunes` | **VERIFIED** |
| Three empty frames reframed | 2 of 3 now have subjects | **PARTIAL** — `guard` still empty |

That is a substantial, honest body of work and it is why every score moved.

## What I could not verify, or found still broken

| claim | measurement | verdict |
|---|---|---|
| Shadows read correctly | `hero` architrave, same surface: lit `#816455` L=105 **R/G 1.29**, shadowed `#814f53` L=90 **R/G 1.63** | **STILL BROKEN.** The shadow is a *redder, more saturated* version of the lit hue. §2.2 wants `#2a3f66` (R/G 0.66, blue-dominant). Exactly the open item in `KNOWN_ISSUES.md §1`, unmoved |
| Crevice value inversion fixed | `interior` floor at y=520: faces 103–115, joints **24–38**. Joints are correctly the darkest | **VERIFIED on floors.** But see `guard` below — the wall/ground *contact* is a bright cyan line |
| Cel banding | luma across a `temple` column and across Sly's torso both vary ~12 L over 100 px with no plateau-and-step structure | **NOT PRESENT.** I could find no 3-band terminator anywhere in the set |

---

## The rim light question — my independent read, and it is worse than the claim

I was asked to judge this myself rather than accept GUARDS' assertion. I scanned across
silhouette edges pixel by pixel.

**Sly, `sly-closeup`, y=430.** The sun is west (−X); for this camera west is frame-left, so his
frame-left edge is the key-lit silhouette and frame-right is the shadow-side silhouette.

```
LEFT  (key-lit) : ink 20 → 25 → 42 → 100 → 138 (#6093ac, cyan) → 137 → 102 → 57 → shirt 113
RIGHT (shadow)  : shirt 115 → 123 → 76 → ink 33 → 19 → wall 92
```

There is a ~2 px cyan band at `#6093ac` on the lit edge — a rim exists. On the shadow edge there
is a single pixel of +8 luma, which is not a rim. **So the claim is correct: the rim gates to
zero on the shadow side.**

But it is broader than that. **`courtyard`, the obelisk against open sky** — the highest-value
rim in the entire set, a warm monument on a blue field:

```
LEFT edge : sky 158…182 → ink 26 → obelisk 137 → 152    (first pixel inside the ink is DARKER than the interior)
RIGHT edge: obelisk 102 → ink 24 → sky 155
```

**No rim on either edge, lit or shadowed.** Worse, the sky *brightens* from 158 to 182 as it
approaches the silhouette and warms from `#8ba2c3` to `#c1b3b2` — a halo on the outside of the
object, which actively *reduces* figure-ground separation rather than increasing it.

So my finding is: **rim is configured on the character and effectively absent on architecture,
and on the character it fires only on the key-lit side.** Nine of ten frames fail §7.3's *"No rim
light separating silhouettes from the background"*. Fixing only the `rimBand` shadow-side gate
would fix one third of the problem. Owner: **SHADING**.

---

## The two questions the stone agent asked me

### 1. "Is flat vertex colour now a failure?" — **Yes, and you named the right offender**

The obelisk is the worst case, exactly as predicted. In `courtyard.crop.png` its lit face is a
large featureless salmon plane; the carvings are darker-orange rectangles at so little contrast
they are nearly invisible, with zero relief, and the only saturated accent on the whole monument
is a small teal crescent that reads as a sticker someone left on it. There is no chisel
character, no grime in the joints, no colour variation between courses.

It is not confined to the obelisk. The wall behind Sly in `sly-closeup` is a flat orange field
with sparse dark dots that read as flyspecks. The `combat` wall is the same. The `temple` columns
are broad uniform salmon with painted-on lines and speckle.

§7.3 *"Any surface reads as flat vertex colour with no texture detail"* now fails in more frames
than it did in pass 1 — where the usual failure was the opposite, too much noise. **This is a
genuine regression on that specific condition** even though the frames are better overall. You
did not trade richness for calm; you traded noise for emptiness, and neither is the target. §2.1.7
asks for "visible brush/chisel character, hand-placed grime in crevices, and colour variation
between blocks" — the grime and the variation are what got removed along with the violet, and
they were the parts worth keeping.

### 2. "Is the baked AO now double-counting?" — **Yes, visibly, in two places**

On the `courtyard` obelisk's upper-right face there is a broad soft dark wash with **no occluder
anywhere near it** — nothing above or beside that face could cast it. It reads as an airbrush
smudge, not contact darkening. Same on the mauve blocks bottom-left of `hero.crop.png`: each
block carries a soft dark gradient across its top that follows the block's UV, not the geometry
around it.

The symptom is that occlusion is *broad and soft* everywhere and *tight and dark* nowhere. Where
the architrave meets its piers in `hero.crop.png` there is darkening, which is more than pass 1
had — but it is a wide gradient rather than a crease, so it reads as dirt rather than as contact.
Real AO gets narrower and darker as surfaces converge. Turn the baked term down now that the
cast shadows are carrying the low frequencies, and let the GTAO pass own the contact scale.

---

## Shot by shot

### `hero` — 3 → **5**

The frame is transformed at the material level and unchanged at the composition level. The violet
blotching is gone, the white-cyan halo is gone, the lines are warm-dark ink with real depth
grading, the Great Pyramid is finally in frame as a hazed silhouette behind the obelisk, and cast
shadows are visible as banding on the right-hand colonnade floor. Sly now has a blue cap and a
readable head at ~45 px.

**§7.3 still failed:**
- *"No single hero focal read"* — there is still **no gold anywhere in the frame**. The brightest
  element is the bottom-left foreground slab.
- *"No dark foreground framing element; flat depth"* — that foreground slab is still one of the
  brightest things in frame, so the framing element still advances instead of receding. Unchanged
  from pass 1.
- *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"* — every
  mass is still an axis-aligned rectangular prism. Nothing leans, tapers or goes top-heavy.
- *"Any surface reads as flat vertex colour with no texture detail"* — the large tan piers and the
  obelisk shaft are near-featureless.
- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"* — no terminator anywhere.
- *"No rim light separating silhouettes from the background"*.
- *"No airborne particulate (sand drift, dust motes)"*.
- *"Shadows are grey/black instead of coloured"* — coloured, but the wrong colour: measured
  R/G 1.63 in shadow against 1.29 lit, i.e. warmer and more saturated than the sunlit stone
  instead of §2.2's violet-teal.

Only 14.0% of the upper frame is blue-dominant here, against 65.7% in `courtyard` — **the money
shot got the least of the sky fix.** The obelisk still exits frame-top as a plain tapering tube
with no pyramidion, so it still reads as a factory chimney rather than a 22 m monument. The
horizon at left is still a dead-flat line with black speckle noise along it.

**Blind comparison — Mario Odyssey, Sand Kingdom.** *My own judgment against Odyssey as I know it;
there is no reference image in this repo and I am not looking at one.* Odyssey, still, and for a
narrower reason than in pass 1. Tostarena's read comes from a hard warm/cool split — bleached
ochre architecture against genuinely blue sky and violet-blue shadow — so the gold reads as gold
*because* there is blue to push against. We now have blue in the sky but the shadows went the
other way: they are warmer than the lit stone. So the frame is still, functionally, monochrome.

**Highest-leverage fix:** re-tint the daylight shadow toward §2.2's `#2a3f66`. The measurement is
already in `KNOWN_ISSUES.md §3` (`shadowBounceMix` / `shadowSat` / `shadowWash`) and my own numbers
reproduce it exactly. The shadows are now correctly *placed*; they just need to stop being orange.
That single change puts warm/cool tension into all seven daylight frames at once.
Owner: **SHADING**.

---

### `temple` — 3 → **4**

The lavender smearing is gone and the columns now read as fat papyrus columns in on-palette
terracotta with vertical fluting. The glyph vocabulary has become recognisably Egyptian — bird
forms, seated figures, cartouche frames — instead of pass 1's confetti. That is real progress.

**§7.3 still failed:**
- *"No volumetric light shafts anywhere they'd be motivated"* — **still zero**. §7.2 says this shot
  exists to prove "columns, light shafts", and §8.1 puts clerestory slots at y=15.5 every 8 m to
  motivate them. This was my nominated highest-leverage fix in pass 1 and nothing happened. It is
  the single most important absence in the set for the second review running.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — at 2× the
  flutes are thin dark lines that do not turn with the light, and the glyphs are flat decals with
  a hard offset drop shadow. The horizontal teal/yellow bands around each shaft read as tape.
- *"Any surface reads as flat vertex colour with no texture detail"* — broad uniform salmon with
  random dark speckle that reads as dirt spots.
- *"No dark foreground framing element; flat depth"* — the right-hand foreground column is still
  the *brightest* object in frame, and it carries a broad pale vertical smear down its length.
  **The curved-surface texture projection defect is not fixed**; this is one of two clear instances.
- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"*, *"No rim light…"*,
  *"No airborne particulate"*, *"Visible texture tiling repetition"* (wall blocks still lattice).

**Unfixed geometry defect, and it is now the second-worst thing in the frame.** At centre-right
(roughly x 630–780, y 240–580) the masonry breaks into a cascade of misaligned blocks stepping
diagonally with hard aliased edges. It is not architecture — it reads as a corrupted or exploded
wall. I flagged this in pass 1. It recurs in `courtyard` (left, x 130–320), `dunes` (right pylon)
and `night` (left-mid), so it is systematic, not a one-off.

The painted star ceiling still puts a crescent moon and a night sky over a `tod: 0.72` golden-hour
shot, and it is still so far below the walls in value that it reads as a hole to the sky rather
than as a ceiling. Sly, specified at (6, 0, −26), is not findable.

**Blind comparison — TotK shrine interiors.** *Own recall, no reference image.* TotK, comfortably.
A shrine interior is mostly empty dark surface with one or two emissive accents and a shaft of
light doing all the storytelling. We now have the right colour and the right column silhouette and
still no hierarchy — every square metre carries the same mid-frequency detail at the same value,
so nothing leads the eye.

**Highest-leverage fix:** the clerestory light shafts, unchanged from pass 1. The slots are in the
roof. A raking shaft supplies the missing focal read, the missing separation between column ranks,
and the motivation for the dust that is also missing. Owner: **POSTFX** with **LIGHTING**.

---

### `sly-closeup` — 0 → **4**

The biggest single jump in the set, from an unrenderable frame to a real character sheet. The
reframe worked. Cap, ringed tail and a gold hook cane are all present and legible, and the cane in
particular is the best-authored object on the model.

**And then the face.** At 2× the head is a narrow grey-blue wedge with a **pale khaki diagonal band
across the muzzle and black spiky triangular fringes hanging off it, and no eyes at all**. Sly's
single most identifiable feature — large cartoon eyes inside a black bandit mask — is absent. The
head reads as a hockey mask or a bird skull with a cap balanced on it. In the one shot whose entire
job is *"Character: cel shading, outlines, fur, cloth, cane, face"*, the face is the failure.

**§7.3 failed:**
- *"Silhouette not instantly readable as Sly (cap, mask, tail, cane)"* — three of four now read.
  **The mask does not, and there are no eyes.** The tail also attaches at the right *shoulder*,
  above the elbow, so it reads as a stole draped over him rather than a tail.
- *"Fur reads as smooth plastic"* — smooth plastic, everywhere, with a broad satin specular smear
  down the left of the shirt. The black spiky fringes at the face and collar appear to be the
  attempt at fur tufts; they read as a torn or burnt edge.
- *"Pose is A-pose/T-pose/stiff instead of a confident line-of-action"* — dead vertical, feet
  together, both arms symmetric on a horizontally-held cane. It reads as a barbell lift. The clip
  is `idle_confident`.
- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"* — measured across his torso,
  luma runs 106–119 over 100 px. That is not a 3-band ramp; it is one flat value.
- *"No rim light…"* on the shadow-side silhouette (measured above).
- *"Any surface reads as flat vertex colour with no texture detail"* — the wall behind him.
- *"No ambient occlusion in crevices / where forms meet"* — **and he casts no shadow at all.** He
  is standing on open paving under a 22° raking sun and there is nothing on the ground. Whatever
  fixed cast shadows for architecture did not reach the character; this is the clearest instance
  because the ground beside him is empty and lit.

Limbs are uniform-width tubes with no taper and no elbow; the hands are dark mittens with no
fingers. Proportions are acceptable — roughly 5 heads — so §7.3's proportion condition passes.

**Blind comparison — Sly 4 character rendering.** *Own recall, no reference image.* Sly 4, and the
gap is the face. Sly 4's character read is carried almost entirely by the mask-and-eyes shape
inside the cap brim; it is what makes a 40 px silhouette identifiable. Ours has the cap and the
cane, which is most of the way there, and then puts a blank wedge where the face goes.

**Highest-leverage fix:** build the eyes and the bandit mask. Two large white eye shapes with dark
pupils inside a black mask band, sized to read at 40 px. Everything else on this model is now
close enough that the face is the only thing standing between it and a recognisable Sly Cooper.
Owner: **CHARACTER**.

---

### `courtyard` — 3 → **5**

The sky fix landed here hardest: 0.8% → 65.7% blue-dominant in the upper frame, and the frame
finally holds a warm/cool tension. It is the clearest demonstration in the set of why that was
worth doing.

**§7.3 still failed:**
- *"Empty sky, or background not atmospherically hazed"* — I am failing it on the clouds, not the
  colour. At 2× they are fine hairline white filaments in a fingerprint/contour pattern, uniform in
  scale across the entire dome, with no soft-edged masses, no layering and no compression toward
  the horizon. It reads unmistakably as **marbled endpaper or a topographic contour map**. Pass 1's
  sky was a marbled beige swirl; this is a marbled blue swirl. The colour was fixed and the
  structure was not.
- *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"* — the
  obelisk is still a squat two-storey block with a small pyramidion, roughly 2:1. §8.1 specifies
  22 m on a 2.6 m² base, i.e. 8:1. It still reads as a decorated bunker.
- *"Any surface reads as flat vertex colour with no texture detail"* — the offender, discussed above.
- *"No single hero focal read"* — brightest thing is the sky. No gold in frame.
- *"No dark foreground framing element; flat depth"*.
- *"No rim light…"* — measured: none on either obelisk edge, against open sky.
- *"Bloom is a grey wash instead of a tight coloured halo"* — a white blob at the pyramidion tip.
- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"*, *"No airborne particulate"*.

**Content gaps against §7.2, unchanged from pass 1.** This shot exists to prove *"obelisk, statues,
braziers, palms"*. I can identify hook rings on wires and nothing else — **no seated colossi, no
braziers, no palms, no banners**. Sly, specified at (−9.5, 0, 20) posed `run`, is absent. §2.1.6's
blue diamond sparkle is still missing from the hook rings.

New observation: the flat top surfaces throughout this frame (the plinth, the ledges) are a
desaturated **grey-green**, which is off-palette in both directions — §2.2 has no green, and a
sandstone top face in shadow should be the violet-teal. It recurs in `hero`, `dunes` and
`traversal`, so it is a material-wide choice, not a one-off.

**Blind comparison — Mario Odyssey, Sand Kingdom.** *Own judgment, no reference image.* Odyssey,
but this is now the closest frame in the set. What Odyssey still does that this does not: its
monuments are *few, large and simply shaped*, so they read at silhouette scale, and its clouds are
soft-edged masses at two or three distinct scales that tell you how far away the sky is. Ours puts
a mid-value monument in front of a maximum-frequency filigree sky, so the most important object in
frame competes with the background for attention instead of separating from it.

**Highest-leverage fix:** rebuild the cloud layer as a small number of soft-edged masses at two
scales with the higher deck smaller and paler, and drop the filament frequency by roughly an order
of magnitude. The colour is already right; only the structure is wrong. Owner: **SKY**.

---

### `dunes` — 4 → **5**

Still the most complete composition — the three-plane depth read continues to work and aerial
perspective is genuinely functioning. Sly now reads with a cap, a ringed tail and a hook cane, and
his body colour is corrected from pass 1's near-black navy to blue.

**§7.3 still failed:**
- *"Empty sky, or background not atmospherically hazed"* — the pyramids are now properly visible,
  which is a fix, but their silhouettes carry **hard stair-stepped aliasing** — the central
  pyramid's left flank is a visible staircase of roughly 15 px steps against the sky. It reads as
  a compression artifact. Making them visible has made a pre-existing defect prominent.
- *"Geometry silhouettes are straight/symmetric everywhere"* — inverted, and it does not help: the
  right pylon is a cascade of misaligned courses with blocks missing, so it reads as **damage**
  rather than as authored hand-built irregularity. The temple still reads as a half-demolished
  brick factory and the tall thin dark-red poles still read unmistakably as **scaffolding**. §8.1
  calls for battered, inward-sloping pylon walls; these are vertical.
- *"No rim light separating silhouettes from the background"* — a dark blue figure against
  mid-orange masonry, no cool edge.
- *"Any surface reads as flat vertex colour with no texture detail"* — at 2× Sly's head, shoulders
  and torso merge into a single flat blue mass. He reads as a traffic cone with a striped flag.
- *"Pose is A-pose/T-pose/stiff instead of a confident line-of-action"* — dead vertical, unchanged.
- *"No airborne particulate"* — a desert wide shot at golden hour with no blowing sand.
- *"No ambient occlusion"* — and again **no contact shadow under Sly** on the dune crest.

**The sand still does not read as sand, and in one respect it reads worse.** The foreground dune is
bright orange overlaid with broad horizontal grey-white wavy stripes that follow the image plane
rather than the terrain's form. In pass 1 those stripes were pale salmon; now they are grey-white,
so instead of streaky bacon it reads as **dirty snow or spilled paint**. There is still no violet
slip face — the entire dune is one hue plus streaking, so its form is described by a pattern that
ignores its geometry.

Vegetation is unchanged: the palms are dark scribbles with no trunk or frond structure, and the
reeds are straight pale lines that read as scratches on the lens.

**Blind comparison — BotW, Gerudo Desert.** *Own recall, not a downloaded image.* BotW, and the
reason is exactly §2.3's: BotW's dunes read as sand because the lit slopes are warm ochre while the
slip faces opposite the sun go violet-blue, so the dune's form is described by a *hue shift*. Ours
still describes it with horizontal stripes that ignore the terrain, and now in a colour that
belongs to a different biome.

**Highest-leverage fix:** put the shadowed side of the dune into violet-blue and delete the
image-plane striping. This is the same shadow-hue fix as `hero`, applied to terrain, and it would
give the frame the one thing its composition is otherwise ready for. Owner: **TERRAIN** with
**SHADING**.

---

### `interior` — 2 → **4**

Real material progress: the leopard-print violet blotching is gone, the treasure pile now reads as
gold rings and torcs rather than dog biscuits, and the canopic jars are legible vessels. I also
measured the floor and **the crevice inversion is genuinely fixed there** — joints run 24–38 luma
against tile faces at 103–115, so joints are correctly the darkest value. That claim holds.

**§7.3 still failed:**
- **There is still no torch and no torchlight.** No flame, no falloff, no warm pool, no visible
  source. The room is lit flat and uniformly. §7.2 says this shot proves *"warm/cool tension,
  volumetrics"*; it demonstrates neither. Unchanged from pass 1.
- *"No volumetric light shafts anywhere they'd be motivated"* — a torch-lit tomb is the most
  motivated location in the game.
- *"Gold doesn't read as metal (needs hard spec + bloom + dark occlusion)"* — the treasure is now
  *legible* as objects but is still matte, with no specular hit, no bloom and no dark occlusion
  beneath the pile. At 2× it reads as **rusty chain links**. This is the clearest instance in the
  set because here the gold is the narrative point of the room.
- *"Any surface reads as flat vertex colour with no texture detail"* — the walls are flat rose
  planes with a fine uniform violet-grey dot pattern that reads as **flyspecks or mould**. Better
  than pass 1's camouflage, still the wrong idea: noise substituted for chisel character.
- *"No rim light…"*, *"Diffuse ramp reads as smooth…"*, *"No airborne particulate"*.
- *"No ambient occlusion in crevices / where forms meet"* — the dark patches on the floor are broad
  shapeless smudges with no edge definition; nothing reads as a cast shadow of anything.

**Geometry holes unfixed.** Flat pale-cream wedges at the bottom-right corner, the left edge around
y 120–250, and at (940–1010, 400–440) are the skybox showing through gaps in the tomb shell. A
vault 12 m underground still has daylight leaking in at floor level. Identical to pass 1.

**The tail is rendering across his chest** — the grey-and-cream striped form angled over his torso
is the tail, in front of the body, and it reads as a striped scarf or a snowboard. Combined with
the shoulder attachment in `sly-closeup`, tail placement is wrong on the rig, not just in one pose.
His head from this angle is a featureless blue dome with a single orange dot, and the cap does not
separate from it — pass 1's "cap hidden against the head" is only fixed at closeup range.

The floor also carries cool pale-blue specular streaking across the tile faces (measured: 4.4% of
floor pixels are blue-dominant at L>90, sampling `#6c7985`/`#7a7c85`). That is a wet-look sheen on
the faces, not an inverted joint — but it is why the floor still reads as wet ceramic.

**Blind comparison — TotK depths / shrine interiors.** *Own recall, no reference image.* TotK, and
for the same reason as pass 1. Its interiors are built on a single motivated light source doing
enormous work — a brazier or a lightroot pooling warm light into deep cool darkness. Ours is still
uniformly lit at one value from no direction, so the room has no volume and the treasure, which
should be the payoff of the level, is barely brighter than the floor.

**Highest-leverage fix:** put an actual torch in the room — a warm point light with visible falloff
and a flame sprite — and let the far corners fall to the §2.2 shadow floor. Every other complaint
about this frame is downstream of there being no light source. Owner: **LIGHTING** with **FX**
(the `embers` emitter that eight call sites are already asking for).

---

### `night` — 2 → **5**

The most improved frame, and the fixes here are unambiguous. The crush to black is gone — 0.0% of
dark pixels have red clipped to zero, against 52.1% in pass 1, and minimum luma is 4.6 rather than
0.0. The glowing blue wireframe is gone. The stone now sits at a readable blue-violet floor
consistent with §2.2's `#2a3f66`, and you can parse every ledge and block you are meant to climb.
The moon is present with a soft halo. Sly's ringed tail reads.

**§7.3 still failed:**
- *"No single hero focal read"* — **the brightest region in the frame is an error.** A fully
  daylit, golden-hour corridor at centre-left (roughly x 250–460, y 250–450) plus a warm-lit
  architrave underside across the top-left quadrant, inside a `tod: 0.02` shot. At 2× there is a
  hard vertical seam where night-blue stone abuts daylit cream stone with no transition. Identical
  to pass 1, entirely unfixed, and it is the first thing the eye goes to.
- *"Empty sky"* — **no stars.** The sky is dark blue with the same cloud filaments. `temple` has a
  star ceiling painted on its roof; the actual night sky has none.
- *"No rim light separating silhouettes from the background"* — in a moonlit stealth frame the rim
  *is* the shot. Sly is a dark form on a dark ledge with no cool edge.
- *"No ambient occlusion in crevices"* — the paving joints read *lighter* than the tile faces here.
- *"Architecture reads as boxes"* — stacked chamfered cubes.
- *"Diffuse ramp reads as smooth…"*, *"No airborne particulate"*.

**§2.1.6 miss, second review running:** no blue diamond sparkle on the hook rings, which hang
across the top of this frame as plain dark ellipses. §7.2 names "blue sparkles" as one of three
things this shot proves. **§7.2 miss:** "warm brazier accents" — no lit brazier anywhere, which
traces directly to the eight `embers` warnings.

Residual of the pass-1 edge defect: the masonry in the left third still carries pale-blue vertical
and diagonal streaks that do not correspond to any joint. Much weaker than pass 1's Tron
wireframe, but the same character.

**Blind comparison — Sly 2/3 HD rooftop stealth.** *Own recall, no reference image.* Sly 2, but
this is the frame that has come closest. Sly's night levels stay readable by holding the darks at a
raised violet-blue floor — which we now do, and it works. What they add and we do not is a strong
cyan rim on every climbable silhouette, so the traversal line reads as a *path* at a glance. Ours
is legible but undifferentiated: every surface is the same blue, so nothing says "climb me".

**Highest-leverage fix:** find the geometry or material that is not adopting the night lighting
state at centre-left. It is a large, bright, obviously-wrong region in the shot that exists to prove
the palette flip, and until it is gone the frame cannot be judged on its own terms.
Owner: **ARCHITECTURE** (if it is a hole) or **LIGHTING** (if those materials are missing the
time-of-day update).

---

### `traversal` — 3 → **5**

Sly now reads as hanging from the ring — arms up, legs dangling — where pass 1 had an empty
jumpsuit with a specular blowout through the torso. The blowout is gone, the violet blotching is
gone, and the wall glyphs are now recognisably Egyptian (a wedjat eye, birds, cartouche frames).
Three sparkles fire on the hook hardware.

**§7.3 still failed:**
- *"Any surface reads as flat vertex colour with no texture detail"* / *"Visible texture tiling
  repetition"* — **the large curved form occupying the right third of the frame is still
  unidentifiable and still smeared.** It is the same swooping salmon shell as pass 1, still
  carrying long parallel pale-grey streaks stretched along its sweep with no texel structure. This
  is the clearest surviving instance of the curved-surface projection failure, and it is
  ~30% of the image. I still cannot tell what the object is meant to be.
- *"No rim light separating silhouettes from the background"* — a dark figure against a busy warm
  wall is exactly the case a rim exists to solve, and this is the highest-value rim in the set.
- *"Silhouette not instantly readable as Sly"* — at 2× he has **no cap** (the head is a bare grey
  wedge), no readable tail, and **no cane** — he is hanging by his hands, not by the cane hook,
  which is the mechanic the shot exists to show. The clip is `hook_swing`.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — the glyphs
  are flat with a hard offset drop shadow, and the same eye and bird motifs repeat along the course.
- *"Empty sky"* — mostly warm cream; only a sliver of blue at top-left. Plus **hard stair-stepped
  aliasing** at top-centre where the hazed pyramid meets the sky, same defect as `dunes`.
- *"No ambient occlusion"* — **and he casts no shadow on the flat wall directly behind him**, in
  raking sun. That shadow would sell the entire shot.
- *"No airborne particulate"*, *"Diffuse ramp reads as smooth…"*, *"No single hero focal read"*.

The sparkles are white four-point lens glints, not the specified `#8fd8ff` core with `#2a7fd4`
glow, so they still do not read as Sly's iconography — unchanged from pass 1.

**Blind comparison — Sly 2/3 HD rooftop stealth.** *Own recall, no reference image.* Sly 2. Its
swing frames put the cane, both arms and the arc of the body in clean profile against open sky, so
you read the mechanic instantly. Ours puts a low-contrast, cap-less figure against a maximum-detail
wall, hanging from his hands, next to an unidentifiable 400 px object.

**Highest-leverage fix:** identify and fix the curved form on the right. Whatever it is, it is a
third of the frame, it is the worst material in the set, and it is drawing the eye away from the
character. If it cannot be made to read as an object, it should not be in this camera.
Owner: **PROPS** / **ARCHITECTURE** for the identity, **TEXTURES** for the projection.

---

### `combat` — 1 → **3**

There is a subject now, the violet camouflage is gone from the walls, and pass 1's z-fighting
"barcode" band at the wall/floor junction has been eliminated. Those are real fixes.

Everything else about the frame is wrong.

**The character is washed out to near-white.** Measured against the identical model in
`sly-closeup`: torso mean saturation **0.426 → 0.126**, mean colour `#576992` (blue) → `#ada39b`
(neutral warm-grey), mean luma 105 → 165. Nothing is hard-clipped at 255, but he has lost roughly
70% of his chroma and gained 60 luma, so he renders as **a plaster statue**. The blue shirt, the
one thing that identifies him at a glance, is simply gone.

**§7.3 failed:**
- *"Any surface reads as flat vertex colour with no texture detail"* — the character, per the above.
- *"Silhouette not instantly readable as Sly"* — a white quadruped mass.
- *"Pose is A-pose/T-pose/stiff instead of a confident line-of-action"* — the pose is `cane_combo_3`,
  the third hit of a ground combo. What renders is a hunched, four-limbed crouch with the cane
  trailing to the floor. It reads as **a cat about to be sick**. There is no line of action, no
  weight transfer, no follow-through and no impact.
- *"Bloom is a grey wash instead of a tight coloured halo on bright things"* — a broad soft white
  band runs the full width of the frame at mid-height, lying *over* the architecture with no source
  object. It is the brightest thing in the image and it is not a thing.
- *"No single hero focal read"* — see above; the focal point is a lens smear.
- *"No ambient occlusion in crevices"* — the floor joints in the left half read lighter than the
  tile faces, and the character casts no shadow.
- *"No airborne particulate"*, *"No rim light…"*, *"Diffuse ramp reads as smooth…"*.

**There is no guard.** §7.2 defines this shot as *"cane combo impact frame with FX"*, landing on a
guard. `guards` reports loaded in the manifest and there is no guard in the frame, so Sly is
swinging at empty air. There is one genuine FX element — a pale radial starburst on a ledge at
left — but it is white, colourless, and disconnected from both the cane and the character.

**Blind comparison — Sly 4 combat framing.** *Own recall, no reference image.* Sly 4. Its impact
frames work because the cane, the arc of the swing and the enemy's reaction all sit in one clean
readable line, with the impact FX exactly where the cane is. Ours has a colourless figure in an
illegible crouch, no opponent, and the FX in the wrong place.

**Highest-leverage fix:** find why this shot's lighting desaturates and blows out the character
when the identical model renders correctly in `sly-closeup`. It is one camera and one time of day
apart, so it should be a short hunt, and until it is fixed nothing else in this frame can be judged.
Owner: **LIGHTING**, with **SHADING** if it is the specular/rim term rather than the key.

---

### `guard` — 1 → **2**

The exposure is fixed. Pass 1 was 85% pure black; this frame is correctly exposed, the masonry is
readable, and there is a **crisp diagonal cast-shadow edge** running up the wall at centre — the
single best piece of evidence in the whole set that the shadow work landed.

**But the shot still has no subject.** No guard. No Sly (specified at (−9, 0, 27.5) posed
`sneak_idle`). No patrol light cone. The reframe to (−11.5, 2.05, 25.4) beside the brazier swapped
an empty black frame for an empty blue one: the camera now points into the ground, and **the lower
~60% of the image is a defocused blank blue-grey surface** containing nothing. The 2× crop is
approximately 85% empty. This is the second review running in which the frame that exists to prove
the guard character contains no character.

For the record, this framing is the one on disk in `Shots.js` — the `(3, 2, 4.2)` coordinates I was
asked about are not what was captured, so the empty frame is not attributable to a stale reading of
the camera contract. Whatever is wrong, it is that the guard is not in this camera's frustum.

**§7.3 failed:**
- *"No single hero focal read"*, *"No dark foreground framing element; flat depth"* — no subject.
- *"No ambient occlusion in crevices / where forms meet"* — **inverted, and measurably.** At the
  wall/ground contact the pixel run is: wall L=87 → ink L=26 → L=72 → **`#598aa2` L=129** →
  L=34 → ground L=65. A saturated cyan line, brighter than both surfaces it separates, sitting
  exactly where the deepest contact occlusion should be. This is the pass-1 "teal line" finding,
  unfixed, and it is the one place the crevice inversion demonstrably survives.
- *"Architecture reads as boxes"*, *"No rim light…"*, *"Empty sky"*, *"No airborne particulate"*,
  *"Diffuse ramp reads as smooth…"*.
- All four **Character** conditions fail vacuously.

**Blind comparison — Sly 4 character rendering.** *Own recall, no reference image.* Sly 4 wins by
forfeit for the second time. The relevant lesson is unchanged: Sly's guards read as flat coloured
silhouettes with one saturated accent — the uniform, the lantern — so they parse instantly at any
distance. That approach would survive this exposure. We cannot test it because there is nobody here.

**Highest-leverage fix:** put the guard in the frustum. Query the module for the guard's actual
world position at `tod 0.10` and set the camera from that, rather than from a brazier's coordinates.
Owner: **GUARDS**, with whoever owns the shot definition.

---

## Regressions — stated plainly

Three things are worse than pass 1, and one is a new artifact created by an otherwise-good fix.

1. **Surface richness collapsed.** §7.3 *"Any surface reads as flat vertex colour with no texture
   detail"* now fails in more frames than it did in pass 1. The violet went and took the grime and
   the inter-block colour variation with it. Worst on the `courtyard` obelisk, the `sly-closeup`
   wall and the `combat` wall. The stone agent predicted this exactly and was right.

2. **The `combat` character is desaturated and blown out** (mean sat 0.426 → 0.126 against the same
   model in `sly-closeup`). Pass 1 had no character in this frame at all, so this is not strictly a
   regression — but the pipeline now produces a broken subject where it previously produced none,
   and a white blob is not obviously an improvement on an empty floor.

3. **`dunes` sand changed hue for the worse.** The image-plane striping that made it read as streaky
   bacon is still there, but the stripes are now grey-white rather than pale salmon, so the dune
   reads as dirty snow. The underlying defect is unchanged; its presentation got further from
   "desert".

4. **Pyramid edge aliasing is newly prominent.** Making the pyramids visible was correct. It also
   exposed hard ~15 px stair-stepping on their silhouettes in `dunes` and `traversal`. Net positive,
   but it needs the same pass that made them visible to finish the job.

---

## The three worst problems, ranked by cost

### 1. Daylight shadows are the wrong colour — **SHADING**

`src/render/ToonMaterial.js`

Cast shadows now work; that is settled and verified. But measured on one continuous surface in
`hero` — the architrave top, part lit and part shadowed — the lit half is `#816455` at **R/G 1.29**
and the shadowed half is `#814f53` at **R/G 1.63**. The shadow is a *redder, more saturated* version
of the sunlit hue. §2.2 specifies `#2a3f66`, which is R/G 0.66 and blue-dominant.

This is why seven daylight frames still read as monochrome orange despite the sky now being blue,
and it is why the sky fix did not deliver the warm/cool tension §2.3 is built on. The bracket is
already documented in `KNOWN_ISSUES.md §3` (`shadowBounceMix` / `TUNE.shadowSat` /
`TUNE.shadowWash`) and my independent measurement reproduces it. Night is fine — `night` stone
measures R/B 0.79, correctly blue-dominant — so this is a daylight-path problem only.

**One change, seven frames.** It is the highest ratio of visual change to work in this report.

### 2. Rim light is absent from architecture and half-absent from the character — **SHADING**

`src/render/ToonMaterial.js`

Measured, not asserted. On Sly's key-lit edge there is a 2 px cyan band at `#6093ac`; on his
shadow-side edge there is a single pixel of +8 luma. **The `rimBand` gate does zero out on faces
turned away from the key — that flag is correct.** But it understates the problem: on the
`courtyard` obelisk against open sky there is no rim on *either* edge, lit or shadowed, and the sky
instead brightens 158 → 182 toward the silhouette, which reduces separation rather than increasing
it.

Nine of ten frames fail §7.3's rim condition. §2.1.5 calls it "the single biggest AAA tell", and
it is the specific thing that would fix `traversal` (dark figure, busy warm wall), `night` (dark
figure, dark stone) and `dunes` (dark figure, mid-orange masonry) simultaneously.

### 3. The character does not cast shadows, and neither does anything at contact scale — **SHADING** / **POSTFX**

`src/render/ToonMaterial.js` · `src/render/passes/AO.js`

Sly casts **no shadow at all** in `sly-closeup` (open lit paving, 22° raking sun), `dunes` (open
dune crest), `traversal` (flat wall directly behind him) or `combat`. Architecture casts shadows —
the diagonal on the `guard` wall and the banding on the `hero` colonnade floor prove it — so
something excludes the character rig from the caster set.

At the same time occlusion is broad and soft everywhere and tight and dark nowhere: the baked AO
raised to compensate for the missing shadows is now double-counting (visible as an occluder-less
smudge on the `courtyard` obelisk's upper-right face and on the `hero` mauve blocks), while the
`guard` frame renders its most important contact — wall meeting ground — as a **bright cyan line at
`#598aa2`, L=129 between surfaces at L=87 and L=65**.

Together these are why nothing in the set feels planted on the ground.

### Close fourth: light shafts, for the second review running — **POSTFX**

Zero volumetric shafts in ten frames. `temple` has literal slots in its roof to motivate them and
`interior` is a torch-lit tomb. It was my nominated highest-leverage fix for `temple` in pass 1 and
nothing has changed. Combined with the eight unserviced `embers` requests, the entire
"Atmosphere & FX" block of §7.3 is failed in every frame of both passes.

---

## Suggested routing order

1. **SHADING** — daylight shadow hue to `#2a3f66`; rim on architecture and on shadow-side faces;
   add the character rig to the shadow caster set. Three changes, all ten frames.
2. **CHARACTER** — Sly's eyes and bandit mask; move the tail from the shoulder to the base of the
   spine. The rest of the model is close.
3. **FX** — the `embers` emitter (eight call sites waiting, two shots blocked on it), then sand
   drift and dust motes generally.
4. **LIGHTING** — the `combat` blowout; an actual torch in `interior`; the `night` daylight leak if
   it is a time-of-day update rather than a hole.
5. **POSTFX** — clerestory light shafts; the `combat` full-width bloom smear; the contact-scale
   cyan edge in `guard`.
6. **TEXTURES** — put the grime and inter-block variation back without the violet; fix the
   curved-surface projection smear (`traversal` right third, `temple` foreground column).
7. **SKY** — clouds as soft-edged masses at two scales instead of contour filaments.
8. **GUARDS** — get the guard into the `guard` and `combat` frustums.
9. **ARCHITECTURE** — the misaligned block cascades (`temple`, `courtyard`, `dunes`, `night`); the
   `interior` skybox holes; obelisk to 8:1; the draw-call and triangle overspend.

Re-score after 1–3. Item 1 alone should be worth a point across every daylight frame, and it is
the only item in this report where I can hand over the exact measurement that defines "done":
shadowed stone must measure R/G below 1.0 on the same surface whose lit half measures 1.29.
