# Critic — scoring pass 1

**Review set:** `shots/pass1/` — 1280×720, quality `high`, captured 2026-07-31.
**Reviewer:** adversarial art director, per `tools/CRITIC.md`. No involvement in the build.
**Method:** every PNG and every 2× centre crop opened and looked at. Nothing reviewed from
filenames, the manifest, or source.

This is the first adversarial scoring pass the project has had (`KNOWN_ISSUES.md` §6).

---

## Standing caveats

**Cast shadows are broken engine-wide** (`KNOWN_ISSUES.md` §1 — shadow term ≈0, which cancels
the key light and leaves ambient-only lighting). That defect is visible in all ten frames. I am
recording it **once**, here, and not re-litigating it per shot. Its downstream consequences —
no form-turning, no cel banding, no ground contact, no raking read — are attributed to it and
not counted as separate findings. Everything else in this report is a defect that will **still
be there after the shadow bug is fixed**.

**Frame times ignored.** Software renderer, no GPU. Draw calls and triangles are judged.

**Correction to my brief: `guards` is now present.** I was told the module was absent. In the
capture that produced `guard.png` the manifest reports `"guards": true` and all 17 modules
loading. So the `guard` frame's emptiness is **not** explained by a missing module, and I judge
it on its own terms below.

**Capture note.** The first run was killed after 9 of 10 shots and before `manifest.json` was
written; `guard` and `hero` were re-captured in a second run. All shot reviews except `hero` are
of run-1 frames; `hero` is reviewed against the run-2 frame currently on disk.

**Set validity warning — read before acting on detail.** Other agents were editing
`toon.glsl.js`, `ToonMaterial.js`, `AO.js` and `Materials.js` *during* this capture. The ten
frames therefore do not represent one consistent build. See "The review set was captured against a
moving codebase" under Cross-cutting findings for the timeline and for which findings survive it.

---

## §1 budget — both constraints breached, badly

| Constraint | Budget | `hero` @ high | `guard` @ high | Verdict |
|---|---|---|---|---|
| Draw calls | ≤ 250 | **548** | 507 | **OVER by 119%** |
| Triangles | ≤ 1.2 M | **2.355 M** | 2.331 M | **OVER by 96%** |
| Programs | — | 87 | 87 | — |

At the target quality setting the scene costs **more than double** its draw-call budget and
nearly double its triangle budget. (`shots/report.json` from the prior session measured 342 /
1.474 M at `med` — so the earlier, milder-looking numbers were a lower quality tier, not the
shipping one.)

The overspend is buying nothing the camera can see. The frames read as stacked boxes, so the
triangles are going into per-block masonry subdivision — the same subdivision that makes the
squint test fail (Problem 1). This is the rare case where the performance fix and the art fix are
the same fix: fewer, larger, more deliberately shaped blocks.

---

## Shot scores

| shot | score | one-line |
|---|---|---|
| `hero` | **3** | Monochrome orange, no sky, no pyramid, Sly is a 30 px smudge |
| `temple` | **3** | Zero light shafts — the one thing it exists to prove; columns are smeared lavender |
| `sly-closeup` | **0** | Camera buried inside geometry. No subject. Not a renderable frame |
| `courtyard` | **3** | Sky is marbled stone; no colossi, braziers or palms; no character |
| `dunes` | **4** | Best of the set — real 3-plane depth — but sand reads as streaky bacon |
| `interior` | **2** | Leopard-print walls, no torch, no volumetrics, daylight leaking into a tomb |
| `night` | **2** | Crushed to black, edges glow blue like a wireframe, no stars, no sparkles |
| `traversal` | **3** | Sly is at least posed; dominated by a giant unidentifiable croissant |
| `combat` | **1** | No Sly, no guard, no FX. It is a photograph of a floor |
| `guard` | **1** | ~85% pure black. No guard, no Sly, no light cone |

**Mean 2.2. Highest score 4.** Nothing is within 4 points of the pass floor of 8.

---

### `hero` — 3/10

The money shot. Sly on the architrave, obelisk left of centre, colonnade right.

**§7.3 conditions failed:**
- *"No single hero focal read"* — the brightest thing in frame is a blank pale limestone wall at
  mid-right and the empty sky. There is no gold anywhere in the frame. Sly, the intended subject,
  is a ~30 px dark violet blob at centre.
- *"Silhouette not instantly readable as Sly (cap, mask, tail, cane)"* — at 2× he is a featureless
  purple-black lump. None of the four identifiers are present.
- *"Empty sky, or background not atmospherically hazed"* — the left third of frame is a flat cream
  wash with a dead-flat horizon line. No clouds, no birds, no dust, and **no Great Pyramid**,
  which §7.2 names as the point of the shot and §8.1 places at (−150, ·, −190).
- *"No dark foreground framing element; flat depth"* — the foreground bottom-left slab is one of the
  *brightest* elements in frame, inverting the intended depth read. It also carries dark blue-grey
  diagonal smears that read as spilled oil rather than as stone or shadow.
- *"No rim light separating silhouettes from the background"* — nothing in frame has a fresnel rim.
- *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"* — the whole
  frame is axis-aligned rectangular prisms. Nothing leans, nothing tapers, nothing is top-heavy.
- *"Visible texture tiling repetition"* — the cartouche motif on the right-hand pylon repeats on a
  visible grid.
- *"No ambient occlusion in crevices / where forms meet"* — in the crop, where the ledge slab lands
  on its supporting piers and where the obelisk enters the slab, there is zero contact darkening.
- *"Outlines … uniform-thickness regardless of depth"* — plus a defect the checklist does not
  anticipate: many edges carry a **bright white-cyan halo on the outside of the dark line**
  (clearest down the obelisk's left edge and along the architrave top edges). That is edge
  overshoot from the post pass, and it reads as a Photoshop "poster edges" filter, not ink.
- *"No airborne particulate (sand drift, dust motes)"* — none.

The obelisk is a pale salmon shaft blotched with off-palette violet patches, and it has no
pyramidion in frame — it exits the top of the frame as a plain tapering tube, so it reads as a
factory chimney rather than as the 22 m climbable monument §8.1 specifies. The architrave slab
directly under Sly is nearly untextured flat tan, which separately trips *"Any surface reads as
flat vertex colour with no texture detail"*.

**Blind comparison — Mario Odyssey, Sand Kingdom.** *This is my own judgment against Odyssey as I
know it; there is no reference image in this repo and I am not looking at one.* Odyssey, without
hesitation. The specific thing Odyssey does that this does not: Tostarena holds a hard warm/cool
split — bleached ochre architecture against a genuinely blue sky and violet-blue shadow — so the
gold reads as gold *because* there is blue to push against. Our frame has no blue at all. Every
pixel is between salmon and cream, so nothing can be the hero read, and the eye has nowhere to go.

**Highest-leverage fix:** put the specified zenith blue (`#3f7fc4`) back into the sky and let the
horizon haze (`#f0c88a`) occupy only the bottom third. That single change restores the
complementary tension the whole art direction is built on, and it will make the sandstone read as
warm for the first time. Owner: **SKY**.

---

### `temple` — 3/10

Hypostyle hall, looking down the column forest.

**§7.3 conditions failed:**
- *"No volumetric light shafts anywhere they'd be motivated"* — **zero**. §7.2 says this shot exists
  to prove "columns, light shafts", and §8.1 puts clerestory slots at y = 15.5 every 8 m
  specifically to motivate them. The roof is closed (it is a painted star-ceiling, not open sky),
  which makes shafts *more* motivated, not less. This is the single most important absence in the set.
- *"Any surface reads as flat vertex colour with no texture detail"* / *"No normal-map relief on
  stone"* — the columns are pale lavender-white with long vertical cyan and white **smears** running
  their full height. That is texture stretching on a curved surface, not fluting. They read as
  melted candle wax. They are also completely off-palette: §2.2 specifies SANDSTONE `#e6b878` /
  `#c9915a`; these measure around lavender `#c8b8d8`.
- *"Visible texture tiling repetition"* — the back walls are a regular grid of identical small blocks
  each carrying a small glyph, and the glyph motifs repeat on an obvious lattice. At crop scale it
  reads as a wall of postage stamps.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — flat coloured
  shapes on a geometrically flat surface. No bevel that responds to light.
- *"No dark foreground framing element; flat depth"* — the right-hand foreground column is the
  *brightest* object in frame, so the framing element advances instead of receding.
- *"No ambient occlusion in crevices / where forms meet"* — the columns intersect the floor with a
  hard line and no contact darkening at all.
- *"No airborne particulate"* — a shaft-lit hall with no dust is the wasted opportunity here.

Two further defects: the deep-blue star ceiling is so far below the walls in value that at
full-frame scale it reads as **a hole to a night sky** rather than as architecture, and it puts a
crescent moon over a `tod: 0.72` golden-hour shot. And in the crop at mid-right the masonry breaks
into a jumbled staircase of misaligned blocks that do not form a coherent surface — a geometry or
merge defect, not a lighting one.

Sly is specified at (6, 0, −26) and is not findable in the frame.

**Blind comparison — TotK shrine interiors.** *My own recall, not a downloaded frame.* TotK, easily.
A shrine interior is mostly *empty dark surface* with one or two emissive accents and a shaft of
light doing all the storytelling; the restraint is what makes it read as a built space. Ours puts
maximum-frequency detail on every square metre and then lights it flat, so there is no hierarchy
and no volume — the hall reads as wallpaper wrapped around cylinders.

**Highest-leverage fix:** add the clerestory light shafts. This frame is composed around them —
there are literal slots in the roof to emit them — and a raking shaft would simultaneously supply
the missing focal read, the missing depth separation between column ranks, and the motivation for
dust. Owner: **POSTFX** (volumetrics) with **LIGHTING**.

---

### `sly-closeup` — 0/10

**There is no subject in this frame.** The camera is inside or hard against opaque geometry. The
left half is a blurred red-orange surface; the right half is a mauve field with a hard, unfiltered
**stair-stepped diagonal edge**. Heavy defocus suggests DOF with the focal plane far away and a
surface pressed against the lens.

The camera is at (1.9, 1.72, 3.35) looking at (0, 1.35, 0) — 3.8 m from a character standing at the
origin. Instead we are buried in something. Either Sly is grossly mis-scaled so the camera sits
inside his body, or there is world geometry sitting at the world origin.

**§7.3:** every character condition fails vacuously — no proportions, no silhouette, no fur, no
pose, because there is no character. Also *"Any surface reads as flat vertex colour with no texture
detail"* — the two visible surfaces are untextured colour fields.

**Blind comparison:** not applicable. There is nothing to compare. Sly 4's character rendering wins
against a blank wall by default.

**Highest-leverage fix:** triage what the occluder is before anything else — check whether the frame
is filled by Sly's own geometry (a scale bug in **CHARACTER**) or by world geometry standing at
(0, 0, 0) (**ARCHITECTURE** / **PROPS**). This is the shot that proves the entire character
pipeline and it currently returns nothing, so it blocks any assessment of cel shading, outlines,
fur, cloth, cane or face.

---

### `courtyard` — 3/10

**§7.3 conditions failed:**
- *"Empty sky, or background not atmospherically hazed"* — the sky is a **marbled beige-grey
  swirl**. It has visible veining and streaking like polished travertine. It does not read as air;
  it reads as a stone ceiling. There is no zenith-to-horizon gradient and no blue whatsoever.
  This is the worst sky in the set and it makes the frame airless.
- *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"* — the
  obelisk is specified in §8.1 as 22 m tall on a 2.6 m² base, i.e. roughly 8:1. What is rendered is
  a squat two-storey block roughly 2:1 with a small pyramidion perched on it. It reads as a
  decorated bunker.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — at 2× the
  glyphs are flat decals with a **baked-in fake bevel** (light top-left, dark bottom-right) that
  does not correspond to the sun direction and does not change across faces.
- *"Visible texture tiling repetition"* — the low wall at bottom-centre is a perfect running bond of
  identical blocks with a heavy dark line between each. It reads as LEGO.
- *"Bloom is a grey wash instead of a tight coloured halo on bright things"* — desaturated white
  bleed along the obelisk cornice and around the hook ring at top-left, plus general milkiness in
  the upper-left corner.
- *"No single hero focal read"* — brightest things are the sky and a pale interior glimpsed through
  the left colonnade. No gold.
- *"No dark foreground framing element; flat depth"*.
- *"No ambient occlusion in crevices / where forms meet"* — the horizontal joint between the
  obelisk's two blocks is a line with no occlusion; the structure meets the ground with nothing.
- *"Outlines … uniform-thickness regardless of depth"* — the near obelisk corner and the far right
  wall carry the same ~2 px line.

**Content gaps against §7.2 and §8.1:** this shot exists to prove "obelisk, statues, braziers,
palms". From (−19, 5.6, 30) looking at (1, 9, 12), the 13 m colossi at (±9.5, ·, 25) should dominate
the frame. **There are no colossi, no braziers, no palms and no banners in frame.** Sly, specified
at (−9.5, 0, 20) posed `run`, is also absent.

The hieroglyph vocabulary is not Egyptian — green crescents, red lozenges, pink discs, a yellow
triangle. It reads as abstract confetti, which is *why* the walls read as noise: the shapes carry no
semantic weight, so the eye files them as random rather than as writing.

**§2.1.6 miss:** the hook rings and the pole-tagged obelisk carry **no blue sparkle**. §2.1 calls
this non-negotiable Sly UI grammar.

**Blind comparison — Mario Odyssey, Sand Kingdom.** *Own judgment, no reference image.* Odyssey.
Tostarena's inverted pyramid and the town's monuments read instantly at silhouette scale because
they are few, large, and strongly contrasted against sky. Ours puts a mid-value orange monument
against a mid-value beige sky, so the most important object in the frame has almost no
figure-ground separation.

**Highest-leverage fix:** fix the sky (same fix as `hero`, same owner). A blue sky would separate
the obelisk silhouette, restore the complementary tension and stop the frame reading as an interior.
Owner: **SKY**.

---

### `dunes` — 4/10

The best frame in the set, and the only one with a working three-plane depth read: dune foreground,
temple mid-ground, hazed pyramids background. Aerial perspective is genuinely functioning.

**§7.3 conditions failed:**
- *"Fur reads as smooth plastic"* — Sly is a **single flat violet colour** across head, torso, arms
  and legs. No fur, no cloth, no material variation of any kind. Note this is *not* explained by a
  dropped texture: the prior session's manifest logged `textures: budget exhausted, refusing to
  build "fur_tail_rings"` / `"leather_boot"`, but **this session's manifest logs no such warnings**,
  so those maps were built and he still renders flat.
- *"Silhouette not instantly readable as Sly (cap, mask, tail, cane)"* — at 2×: **no cap** (the head
  is a bare rounded lump), a faint darker smudge where the mask should be, **no tail at all** — the
  geometry appears absent, not just untextured — and the cane reads as a grey slab across his hips
  with a detached orange hook floating beside it. It looks like a satchel and a bangle, not a cane.
- *"Pose is A-pose/T-pose/stiff instead of a confident line-of-action"* — dead vertical, weight even
  on both feet, shoulders square, no hip/shoulder counter-rotation. The clip is named
  `idle_confident`; nothing about the pose is confident.
- *"No rim light separating silhouettes from the background"* — a dark violet figure against
  mid-orange masonry with no cool fresnel. This is the frame where a rim would earn the most and it
  is absent.
- *"Empty sky"* — a warm cream-to-tan gradient with no clouds, no birds, no dust, no blue. The
  pyramids are hazed so far toward the sky value that they read as compression smudges rather than
  as 105 m monuments; the haze has overshot past "atmospheric" into "invisible".
- *"No airborne particulate"* — a desert wide shot at golden hour with no blowing sand.
- *"Any surface reads as flat vertex colour with no texture detail"* — Sly.

**The sand does not read as sand.** The foreground dune is bright salmon and white in **horizontal
wavy stripes** that follow the image plane rather than the terrain's form. It reads as marbled
endpaper or streaky bacon. Vegetation is worse: the palms are a dark green scribble with no trunk
or frond structure (reads as steel wool), and the reeds at bottom-right are straight pale lines
with no taper or curve (reads as scratches on the lens).

The temple complex reads as **a half-demolished brick factory** — the pylons have ragged eroded
edges with blocks missing, and the tall thin red poles around them read unmistakably as
scaffolding. §8.1 calls for *battered* (inward-sloping) pylon walls; these are straight and vertical.

One genuine positive: Sly's outline is a warm dark brown rather than pure black, which is correct
per §2.1.2. It is the only part of the line work in the whole set that behaves as specified.

**Blind comparison — BotW, Gerudo Desert.** *Own recall, not a downloaded image.* BotW, decisively,
and the reason is exactly the one §2.3 cares about: BotW's dunes read as sand because the lit slopes
are warm ochre while the slip faces opposite the sun go **violet-blue**, so the dune form is
described by a hue shift, not just a value shift. Ours has one hue everywhere and describes the dune
with horizontal stripes that ignore its actual geometry — so the terrain has no readable form.

**Highest-leverage fix:** give Sly a cap, a tail and a readable cane silhouette. He is legible in
only three frames in the entire set and in none of them can you tell who he is; this is a Sly Cooper
game and the title character currently reads as a generic purple mannequin. Owner: **CHARACTER**.

---

### `interior` — 2/10

Torch-lit tomb. Nothing about that description is true of the frame.

**§7.3 conditions failed:**
- *"No volumetric light shafts anywhere they'd be motivated"* — a torch-lit tomb is the single most
  motivated location in the game and there are none.
- **There is no torch and no torchlight.** No visible light source, no falloff, no warm pool.
  Everything is flat uniform ambient. §7.2 says this shot proves "warm/cool tension, volumetrics";
  it demonstrates neither.
- *"Visible texture tiling repetition"* — the walls are covered in large soft-edged **violet blotches
  on salmon**. At full-frame scale it reads as mould, lichen or camouflage. This is the most
  damaging material in the set.
- *"No ambient occlusion in crevices / where forms meet"* — worse than missing, it is **inverted**:
  the floor's crazy-paving joints are rendered in **white/pale blue**, i.e. the crevices are
  *brighter* than the tile faces. §2.2 puts crevice at `#4a2f22`, the darkest value in the sandstone
  ramp. The floor reads as cracked ice.
- *"Gold doesn't read as metal (needs hard spec + bloom + dark occlusion)"* — the treasure pile at
  centre-right is matte tan lumps with no specular, no bloom and no occlusion. It reads as gravel or
  dog biscuits. This is the clearest instance of this failure in the set, because here the gold is
  the narrative point of the room.
- *"Any surface reads as flat vertex colour with no texture detail"* — the tan lintel across the
  centre is a completely untextured flat slab.
- *"Shadows are grey/black instead of coloured"* — no shadows at all; Sly has **no contact shadow**
  and reads as pasted onto the floor.
- *"No dark foreground framing element; flat depth"* — a symmetric box corridor with the stela
  centred.
- *"Fur reads as smooth plastic"*, *"Silhouette not instantly readable as Sly"* — flat navy body,
  cyan feet, and the cane rendered as a **wide striped plank** held diagonally across his chest. It
  reads as a snowboard.

**Geometry holes.** Flat pale cream wedges at the bottom-right corner and the left edge around
y ≈ 150–260 are the skybox showing through gaps in the tomb shell. A vault 12 m underground has
daylight leaking in at floor level.

The canopic jars are plain tan capsules with no lids, no Anubis or Horus heads, no glaze. The stela
is the one place the glyph vocabulary looks Egyptian — I can read bird forms and a seated figure —
and it is the only element in the frame that provides a focal read, though it is matte, not gilded.

**Blind comparison — TotK depths / shrine interiors.** *Own recall, no reference image.* TotK.
Its interiors are built on a single motivated light source doing enormous work — a brazier or a
lightroot pooling warm light into deep cool darkness — which gives both depth and a reason to look
somewhere. Ours is uniformly lit at one value from no direction, so the room has no volume and the
treasure, which should be the payoff of the entire level, is the same brightness as the floor.

**Highest-leverage fix:** replace the violet-blotch stone material with the specified sandstone ramp
(`#e6b878` / `#c9915a` / `#8a5a38`, crevice `#4a2f22`) and invert the crevice value so joints are
the darkest thing rather than the brightest. Owner: **TEXTURES**.

---

### `night` — 2/10

The palette flip. It flips into a failure mode rather than a palette.

**§7.3 conditions failed:**
- *"Shadows are grey/black instead of coloured, or crush to zero detail"* — the majority of the frame
  is crushed to near-#000 with **no readable detail whatsoever**: the entire right third, the
  lower-left, and the central pylon. §2.2 sets the floor at `#2a3f66`, "~14% of key luminance, never
  below". These are an order of magnitude below that.
- *"Outlines … or pure `#000000`"* — the opposite failure, and it is severe: in the dark regions
  **every geometric edge and masonry joint is rendered as a bright glowing blue line**, turning the
  lower half of the frame into blue wireframe. In the crop these read as vertical blue "rain"
  streaks across the walls. §2.1.2 specifies lines as dark violet `#161022` in shadow. This is the
  same root defect as the white halo in the daylight frames — the edge pass *adds* light instead of
  drawing ink — and at night, with no bright pixels for it to darken, it produces Tron.
- *"Empty sky"* — a deep blue field with a mottled/streaky texture and **no stars, no moon, no
  clouds**. The `temple` shot has a moon and stars painted on its ceiling; the night sky has neither.
- *"No rim light separating silhouettes from the background"* — in a moonlit stealth frame the rim
  *is* the shot. Nothing has one. Sly is a black blob identifiable only by two glowing yellow eye
  dots, which reads as a cat in a hedge.
- *"No single hero focal read"* — the brightest thing in the frame is a **golden-hour-lit corridor
  at centre-left**, fully daylit inside a `tod: 0.02` night shot. Either a geometry hole to the
  skybox or materials that did not adopt the night lighting state. It is an error and it is the
  focal point.
- *"No ambient occlusion"*, *"No airborne particulate"*, *"Bloom is a grey wash"*.

**§2.1.6 miss:** this is the shot where the blue diamond sparkle should be most visible and most
useful, and there is **none** — not on the hook rings, not on the obelisk, not on any rail. §7.2
names "blue sparkles" as one of three things this shot proves.

**§7.2 miss:** "warm brazier accents" — there are no lit braziers anywhere.

**Blind comparison — Sly 2/3 HD rooftop stealth.** *Own recall, no reference image.* Sly 2, and it
is not close. Sly's night levels stay *readable*: the darks sit at a raised violet-blue floor with a
strong cyan rim on every silhouette, so you can always parse the geometry you are meant to climb.
Ours crushes to black and then draws the geometry back in as glowing blue outlines — which is
legible in the worst way, like a debug wireframe view.

**Highest-leverage fix:** make the edge pass subtractive-only and clamp the shadow floor to the
specified `#2a3f66` at ≥14% key luminance. Those two changes together stop the frame reading as a
wireframe and give the darks somewhere to live. Owner: **POSTFX** (edge pass), **SHADING**
(shadow floor in the toon ramp).

---

### `traversal` — 3/10

Sly mid-swing on a hook. The only frame where the character is doing something.

**§7.3 conditions failed:**
- *"Silhouette not instantly readable as Sly"* — he is a grey-blue rag doll with a **blown-out white
  specular blob** where his chest and hip should be, which destroys the middle of his silhouette. No
  cap, no tail, no mask, and the cane he is supposedly hanging from is not visible. His arms do not
  read as reaching up. He looks like an empty jumpsuit hanging on a hook.
- *"No rim light separating silhouettes from the background"* — a dark figure against busy
  mid-orange masonry. This is the highest-value rim light in the set and it is absent.
- *"Visible texture tiling repetition"* — the clearest instance in the whole review. At 2× the wall
  is a grid of small blocks each stamped with a flat glyph, and I can count the same pink oval at
  least eight times and the same green crescent at least six.
- *"Any surface reads as flat vertex colour with no texture detail"* — the white slab at centre-left
  is a featureless blown-white quad with a hard bloom, and it is the brightest thing in frame, so
  the eye goes to a blank rectangle instead of to Sly.
- *"Architecture reads as boxes"* / *"Geometry silhouettes are straight/symmetric everywhere"* — with
  one exception, below.
- *"No ambient occlusion in crevices / where forms meet"* — the ledge Sly hangs over, the block
  corners and the recesses between courses are all uniformly lit.
- *"No airborne particulate"*.

**The large curved form occupying the right third of the frame is unidentifiable.** It is a swooping
salmon ribbon or shell with heavy cyan-white streaking. I could not determine what it is meant to
be — a banner, a sail, a collapsed vault. Whatever its intent, it dominates ~35% of the image and
reads as a giant croissant or a car fender.

**A systematic material defect is now diagnosable across shots.** Severe directional smearing — long
parallel cyan/white streaks stretched along the surface's sweep — appears on the `temple` columns,
this curved form, and the columns at centre-right here. It appears on curved and non-axis-aligned
geometry and *not* on flat axis-aligned walls. That is a triplanar / UV projection failure on
non-planar surfaces, and it is specific and actionable.

The sky shows a hard **stair-stepped diagonal edge** at top-centre where a hazed background element
meets it — no antialiasing on that silhouette, reads as a JPEG artifact.

One positive: there is a white four-point glint at the hook ring, so a sparkle system exists. But it
is a generic white lens glint, not the specified `#8fd8ff` core with `#2a7fd4` glow, so it does not
read as Sly's iconography.

**Blind comparison — Sly 2/3 HD rooftop stealth.** *Own recall, no reference image.* Sly 2. The
reason is pose clarity: Sly's swing frames put the cane, both arms and the arc of the body in clean
profile against open sky, so you read the mechanic instantly. Ours puts a low-contrast figure
against a maximum-detail wall with a specular blowout through his torso, so the mechanic is
illegible even though it is correctly simulated.

**Highest-leverage fix:** add the fresnel rim light in the complementary hue (`#7fd4ff`). §2.1.5
calls it "the single biggest AAA tell", and this frame is the proof — a dark character on a busy
warm wall is exactly the case a rim exists to solve. Owner: **SHADING**.

---

### `combat` — 1/10

**No Sly, no guard, no FX, no impact.** The frame is 55% empty floor and 45% wall. Sly is specified
at (0, 0, 2.0) posed `cane_combo_3` and should sit near frame centre from a camera at
(4.6, 2.35, 5.4). He is not in the frame. The absent `guards` module explains the missing guard; it
does not explain the missing player.

**§7.3 conditions failed:**
- *"No single hero focal read"*, *"No dark foreground framing element; flat depth"* — there is no
  subject at all.
- *"Visible texture tiling repetition"* / *"Any surface reads as flat vertex colour"* — the wall is
  the **worst instance of the violet-blotch material in the set**: at 2× it is a mosaic of irregular
  polygons in salmon, orange, deep violet and tan with a soft emboss. It reads as camouflage netting
  or crazy paving stood on end. The violets measure around `#5a4a7a` and are **not in the §2.2
  palette at all** — the sandstone ramp is entirely warm browns.
- *"No ambient occlusion in crevices / where forms meet"* — the wall base meets the floor at a hard
  line with no darkening; the right-hand mass reads as floating.
- *"Bloom is a grey wash instead of a tight coloured halo"* — a broad white specular wash across the
  lower-right of the floor.
- *"No normal-map relief on stone"*.

**The floor is the single worst material in the review.** Large soft tiles in bright salmon and
white, with **pale grout** and a broad glossy sheen. It reads as wet ceramic or a bathroom floor. It
also demonstrates the **detail-distribution inversion** that runs through the whole set: the floor
carries almost no high-frequency detail while the walls carry far too much — the exact opposite of
§2.3's "Large simple areas of colour, detail concentrated at focal points."

A band of ~8 parallel grey/white horizontal stripes runs the full frame width where the paving meets
the wall base — z-fighting or broken step geometry. It reads as a barcode.

**Blind comparison — Sly 4 character rendering / combat framing.** *Own recall, no reference image.*
Sly 4, trivially — it has a character in the frame. There is no art-direction comparison to make
here because there is no subject to compare.

**Highest-leverage fix:** find out why the player is not rendered in this shot. It is the second
frame in the set (with `sly-closeup`) where the character is specified and does not appear, which
suggests a shared cause rather than two coincidences. Owner: **CHARACTER**, with **ANIMATION** if
the `cane_combo_3` freeze is what is failing.

---

### `guard` — 1/10

**Roughly 85% of this frame is pure black.** The crop is black but for a single thin teal
horizontal line. There are exactly three non-black elements in the full frame:

1. A small cream/tan patch at top-left — **golden-hour daylight** inside a `tod: 0.06` night shot.
   The same leak as `night`.
2. A saturated cyan-blue vertical band at top-right with heavy vertical streaking — the curved-
   surface texture smear defect (see `traversal`), here lit brightly enough to be the most
   prominent thing in the image. It reads as a blue shower curtain.
3. A dark navy field at lower-left carrying faint bright-blue vertical squiggles — the edge pass
   firing on masonry joints in near-black, the same "blue rain" artifact as `night`.

**No guard is visible. No patrol light cone is visible. Sly, specified at (−6, 0, 6) posed
`sneak_idle`, is not visible either.** I cannot tell whether the guard is absent or merely
invisible, because the exposure destroys everything below the top-right band.

**§7.3 conditions failed:**
- *"Shadows are grey/black instead of coloured, or crush to zero detail"* — the most extreme
  instance in the set. §2.2 requires a `#2a3f66` floor at "~14% of key luminance, never below";
  this is at zero across most of the frame.
- *"No rim light separating silhouettes from the background"* — the entire purpose of a
  character-sheet shot at night is rim separation. There is nothing to separate because there is
  nothing lit.
- *"No single hero focal read"* — the brightest object is a texture artifact.
- *"Empty sky"*, *"No dark foreground framing element; flat depth"*, *"No ambient occlusion"*,
  *"No airborne particulate"* — all trivially true.
- All four **Character** conditions fail vacuously; there is no character to judge.

**Blind comparison — Sly 4 character rendering.** *Own recall, no reference image.* Sly 4 wins by
forfeit. The relevant lesson from it is that Sly's guards are designed to read as **flat coloured
silhouettes with one saturated accent** (the uniform, the lantern) so they parse instantly at any
distance in a dark level. That approach would survive this exposure. Ours does not, because the
guard — if present — is being asked to read via diffuse shading that has been crushed to zero.

**Highest-leverage fix:** raise the night shadow floor to the specified `#2a3f66` at ≥14% key
luminance. Until the darks sit above zero, nothing in this shot or `night` can be judged at all,
and any work GUARDS does on the model is unverifiable. Owner: **SHADING** (toon ramp floor),
**LIGHTING** (night key/fill levels).

---

## Cross-cutting findings

### The review set was captured against a moving codebase — read the scores with this in mind

I initially wrote this section up as a determinism failure (§1: *"The same seed must always build
the same level"*), because the two `hero` captures differ visibly. **That was wrong and I am
retracting it.** The git timeline explains it completely — another agent was editing shading,
texture and AO source *throughout* my capture window:

```
00:39  hero (run 1) captured
00:42  temple          00:49  sly-closeup      00:52  courtyard      00:56  dunes
01:00  interior            ← src/render/shaders/toon.glsl.js  modified 01:00
01:03                      ← src/core/Engine.js               modified 01:03
01:06  night
01:10                      ← src/render/ToonMaterial.js       modified 01:10
01:13  traversal        01:22  combat
01:29                      ← src/render/passes/AO.js          modified 01:29
01:35                      ← src/ai/Guard.js                  modified 01:35  (guards absent → present)
01:39                      ← src/textures/Materials.js        modified 01:39
01:50  guard captured
01:54  hero (run 2) captured
```

So the `hero` run-1 / run-2 difference is four source edits, not non-determinism, and the
texture-budget difference against the prior session is equally confounded. There is **no evidence
of a §1 determinism violation in this data** and it should not be routed to anyone.

**What this does mean, and it matters:** the ten frames are not a consistent set. Eight of ten were
captured before `AO.js` changed and nine of ten before `Materials.js` changed, so some of my
ambient-occlusion and stone-material findings may already be stale.

**Which findings I can still stand behind.** `hero` (01:54) and `guard` (01:50) were captured
*after* every one of those edits, and both still show: off-palette violet blotching, no blue in the
sky, uniform-thickness outlines with bright halos, no contact darkening where the architrave piers
meet the slab, Sly as a sub-40 px unreadable blob, and the blue-rain edge artifact in the dark.
The headline problems survived the edits. The per-shot detail on the eight older frames should be
re-verified rather than trusted outright.

**Recommendation:** re-capture the full set against a frozen tree before acting on the finer
points. The three ranked problems below are safe to start on now.

### Other manifest signals

- **`consoleErrors`: one `Failed to load resource: 404 (Not Found)`.** §1 forbids external asset
  fetches outright. Worth identifying what is being requested — even a benign 404 (favicon) should
  be eliminated so this channel stays clean.
- **`fx: no emitter named "embers"` × 8.** Eight brazier call sites are requesting an emitter that
  does not exist. This is the direct cause of two visible failures: no lit braziers in `night`
  (§7.2 names "warm brazier accents" as one of three things that shot proves) and no airborne
  particulate anywhere in the set. Owner: **FX**.
- **`collision: pole "unnamed" / "proxy:pole" has no userData.spline — synthesised one`** × 2.
  Not visible in any frame; noted only so it is not lost. Owner: **PROPS** / **ARCHITECTURE**.
- **Animation clip set is complete.** All 52 names required by §4.7 are present in
  `manifest.poses`. The character problems below are model and posing problems, not missing clips.

### What genuinely works

Briefly, per the brief's instruction not to pad:

- `dunes` has a real three-plane depth read and functioning aerial perspective — the only frame
  where §2.3's depth rule is satisfied.
- Sly's inverted-hull outline is a warm dark brown, not pure black. Correct per §2.1.2, and the
  only line work in the set that behaves as specified.
- The `temple` columns do taper and carry capitals — the proportions are the least-bad geometry
  in the set.
- A sparkle system exists (the hook ring glint in `traversal`), so §2.1.6 is a tuning job rather
  than a from-scratch build.

---

## Overall verdict: **REJECT**

Ten shots, mean score 2.2, best score 4, pass floor 8. Three of the ten frames (`sly-closeup`,
`combat`, `guard`) contain **no subject at all** and are not reviewable as images. Both §1
performance budgets are breached by ~2×.

This is not a build that needs polish. Read blind against Mario Odyssey, TotK, BotW or Sly 4, an
art director picks the other one in every single frame — §7.3's final condition, failed ten times
out of ten.

The shadow bug (`KNOWN_ISSUES.md` §1) is real and it is suppressing the lighting model, but I want
to be clear that **fixing it will not move these scores much on its own.** The violet-blotch stone,
the light-adding edge pass, the absent character silhouette, the blue-free sky, the missing light
shafts and the missing subjects are all independent of it. Shadows will make a bad frame
directional; they will not make it good.

---

## The three worst problems, ranked by cost

### 1. The procedural stone material — **TEXTURES**, with **ARCHITECTURE**

`src/textures/**` (primary) · `src/world/Architecture.js` (per-block application)

Present in all ten frames, on essentially every surface. Six distinct symptoms, one system:

| symptom | clearest frame |
|---|---|
| Off-palette violet blotches (~`#5a4a7a`) reading as mould / camouflage | `combat`, `interior` |
| Per-block hue randomised at maximum frequency with no spatial correlation | `traversal`, `hero` |
| Stamped glyph motifs repeating on a visible lattice | `traversal` (same oval ×8) |
| Carvings painted-on with a baked fake bevel, no normal relief | `courtyard` |
| **Inverted** crevice value — joints and grout brighter than faces | `interior`, `combat` |
| Directional smearing on curved / non-axis-aligned geometry | `temple` columns, `traversal` |

Why it is first: it is the reason the squint test fails everywhere, it is the reason the set reads
as amateur regardless of lighting, and it is entangled with the draw-call/triangle overspend. §2.2
gives an exact sandstone ramp (`#e6b878` / `#c9915a` / `#8a5a38`, crevice `#4a2f22`) that is simply
not being used — there is no violet in the specified palette at all.

*Caveat:* `Materials.js` changed at 01:39, after nine of ten captures. The violet blotching is
still clearly present in `hero` (01:54) and the smearing in `guard` (01:50), so the problem is
live — but re-verify the per-frame detail above against a fresh capture.

**Start here:** clamp the material to the §2.2 sandstone ramp and invert the crevice value so
joints are the darkest thing in the ramp rather than the brightest. That alone changes every frame.

### 2. The character does not read as Sly — **CHARACTER**, with **ANIMATION**

`src/player/SlyModel.js` (primary) · `src/player/Rig.js`, `Animation.js`, `Clips.js` (pose)

Across ten frames Sly is: **absent from frame** in 3 (`temple`, `courtyard`, `combat`), **occluding
the camera or occluded by geometry** in 1 (`sly-closeup`), **a sub-40 px dark blob** in 2 (`hero`,
`night`), and **legible but unrecognisable** in 3 (`dunes`, `interior`, `traversal`). He reads
correctly as Sly Cooper in **zero**.

Specifically, in the frames where he is legible: **no cap**, **no tail** (the geometry appears
absent, not merely untextured), **no readable cane** (a grey slab in `dunes`, a striped plank in
`interior`, invisible in `traversal`), a single flat body colour with no cel bands and no fur, and
an effectively straight A-pose under a clip named `idle_confident`.

The clip set is complete, so this is a model-and-posing problem. The two frames where he is
specified and simply does not appear (`sly-closeup`, `combat`) look like one shared root cause, not
two coincidences, and should be triaged together first — they are blocking any evaluation of the
character pipeline at all.

### 3. The edge pass adds light instead of drawing ink — **POSTFX**, with **SHADING**

`src/render/PostFX.js` (primary) · `src/render/Outline.js` (hull + depth-scaled thickness)

One defect with two presentations:

- **Daylight:** a bright white-cyan halo on the *outside* of every dark edge — clearest down the
  obelisk in `hero`, along the lintel in `interior`, on the block corners in `courtyard`. It reads
  as a Photoshop "poster edges" filter, which is the single strongest tell that this is a
  post-processed render rather than an authored look.
- **Night:** with no bright pixels to darken, the pass *adds* — every masonry joint becomes a
  glowing blue line and the lower half of `night` becomes blue wireframe. `guard` shows the same
  "blue rain" streaks.

Plus, everywhere: **uniform line thickness regardless of depth**, against §2.1.2's requirement that
"thickness scales with view distance so lines stay ~2.5 px on screen".

**Start here:** make the edge contribution subtractive-only and tint it to the specified
`#1a1210` warm brown in sunlight / `#161022` dark violet in shadow.

---

### Close fourth, flagged for routing: the sky — **SKY**

`src/render/Sky.js`, `src/render/Atmosphere.js`

Not in the top three only because the three above are worse, but it may be the **cheapest** large
win available. §2.2 specifies `SKY zenith #3f7fc4` — a real blue — and **there is no blue in any
daylight sky in this set.** `hero`, `dunes` and `traversal` are featureless warm cream gradients;
`courtyard`'s sky is a marbled beige swirl that reads as a travertine ceiling; `night` has no stars
and no moon.

The consequence is that §2.3's "warm/cool tension… in every shot" — which the entire art direction
is built on — is absent from every shot. Everything is between salmon and cream, so nothing can be
a hero read and gold has nothing to push against. Putting the specified zenith blue back, with the
`#f0c88a` haze confined to the lower third, is the single highest ratio of visual change to work in
this report. It was my nominated highest-leverage fix for both `hero` and `courtyard`.

---

## Suggested routing order

0. **Freeze the tree, re-capture the set.** These ten frames span four source edits and are not a
   consistent build. Cheap, and everything below is easier to verify against a clean baseline.
1. **TEXTURES** — sandstone ramp to §2.2; invert the crevice value; fix the curved-surface
   projection smear.
2. **SKY** — zenith blue back in; stars and moon at night. Cheap, affects all ten frames.
3. **CHARACTER** — triage the two no-subject frames, then cap + tail + cane silhouette.
4. **POSTFX** — edge pass subtractive-only and tinted; then the `temple` light shafts.
5. **SHADING** — night shadow floor to `#2a3f66` @ ≥14%; fresnel rim (`#7fd4ff`) on everything.
6. **FX** — the missing `embers` emitter; then sand drift / dust motes generally.

Re-score after 1–3. Do not re-score after the shadow fix alone — it will not be informative.

