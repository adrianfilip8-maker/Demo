# RESULT — critic pass 5

**Verdict: REJECT. 2.88 / 10 across 13 shots.** Passing floor is 8. No shot reaches it; the
best frame (`temple`) reaches 4.5. Prior passes returned 3.50 and 4.29; this pass scores a
larger set that includes three shots those passes did not judge (`sly-profile`, `combat`,
`guard`), and those three are the weakest in the set.

Every one of the thirteen frames loses its blind side-by-side against the comparison title.
Nine of them lose in ways a player would notice inside one second.

---

## 1. Provenance ruling — the run is VALID

I was asked to rule on this before looking at pixels. I did, and I verified the mechanism
rather than accepting the summary.

**The facts.** Manifest stamps `4339c50`, `dirty:false`, boot `2026-08-02T16:47:59.443Z`.
Frame mtimes run `hero` 16:55 → `sly-key` 17:38. `HEAD` is now `a5102aa`; five commits landed
during the capture window (`b87d40f` 16:49, `615e47c` 17:06, `85c3808` 17:11, `0f0a42c` 17:15,
`a5102aa` 17:21). Four `src/**` files have mtimes inside the window and **do differ** from the
stamped commit:

```
git diff --stat 4339c50 -- <the four>
 src/core/Debug.js       | 31 ++--    src/player/Rig.js      | 20 ++--
 src/player/Animation.js | 27 ++--    src/render/Lighting.js | 72 ++++---
 4 files changed, 128 insertions(+), 22 deletions(-)
```

The two files at 16:47 (`ToonMaterial.js`, `Terrain.js`) are byte-identical to `4339c50` — they
are that commit's own writes, 15–30 s before boot.

**Why the frames are nonetheless all one build.** Three independent legs, each checked:

1. **The module graph is fully static.** `grep -rn "import(" src/` returns 17 hits and every
   one is a JSDoc type annotation (`@param {import('../core/Engine.js').Engine}`). There is not
   one runtime `import()` in `src/`. A static ESM graph is fetched in full before the entry
   module finishes evaluating, and `tools/shot.mjs` waits on `window.__GAME.ready === true`
   after that. Nothing can be fetched from disk later, because nothing asks.
2. **The page is loaded once.** `tools/shot.mjs` does a single `page.goto`, then drives every
   shot through `page.evaluate(setShot)`. No reload, no new context.
3. **The server cannot push an invalidation.** `SANDS_NO_HMR=1` sets `hmr:false` and
   `watch:{ignored:['**/*']}` in `vite.config.js`.

So the running page holds `4339c50`'s code, frozen at ~16:48. The 17:00–17:13 edits never
reached it. `KNOWN_ISSUES.md` §14's prior analysis of this situation holds.

**The one loose thread, and its null control.** `programs` steps 94 → 136 at `dunes`
(17:14) and 136 → 138 at `combat` (17:24). `Lighting.js` was written at 17:13:59 — one minute
before the first step. That coincidence is the only thing in the run that looks like
contamination, so I tested it against runs where no edit happened:

| run | tree | `dunes` position | programs sequence |
|---|---|---|---|
| `bud35` | `c61941c`, clean | 3rd of 10 | 94, 94, **136**, 136, 136, 136, 136, 136, **138**, 138 |
| `critic5` | `4339c50`, clean | 6th of 13 | 94×5, **136**×4, **138**×4 |
| `geo1` | `de2feb1` | 2nd of 2 | 91, **139** |

The +42 step is bound to the shot named `dunes` and the +2 step to `combat`, in three runs, at
three different positions in the run order and three different wall-clock times. It is
three.js's program cache accumulating as new materials enter the frustum. It is not the
17:13:59 write.

**The 404.** Present in **every** `report.json` under `shots/` that records console output — 24
of 24, including runs on clean trees (`agx1`, `cap5`, `cap6`, `cap7`, `geo2`, `bud35`). It is a
standing artifact of this harness, not a signal about this build.

**Ruling: the run is valid and I judged it. Do not re-shoot.** A wasted 70-minute capture would
have been cheap, but it would also have been unnecessary.

---

## 2. Scores

Look-first order was: every frame at 1× before any crop, impressions written, then
magnification, then instruments. Where an instrument later contradicted my eye, §5 records it.

| # | shot | score | the frame it loses to, and by how far |
|---|---|---|---|
| 1 | `temple` | **4.5** | BOTW divine-beast interior / Sly 2 Contessa's castle. Closest call in the set. |
| 2 | `sly-startle` | **4.0** | Sly 2 cutscene reaction shot. Ours is recognisably in the family and still loses. |
| 3 | `hero` | **3.5** | Sly 2 "The Black Chateau" rooftop establishing shot. Not close. |
| 4 | `interior` | **3.5** | BOTW shrine interior. Not close. |
| 5 | `sly-key` | **3.0** | Sly 2 character beauty render. Not close. |
| 6 | `courtyard` | **3.0** | Mario Odyssey, Tostarena / BOTW Gerudo Town. Not close. |
| 7 | `traversal` | **3.0** | Sly Cooper hook-rail traversal beat. Not close. |
| 8 | `sly-closeup` | **2.5** | Sly 2 dialogue closeup. Badly. |
| 9 | `dunes` | **2.5** | BOTW Gerudo Desert. Badly. |
| 10 | `night` | **2.5** | Sly 2 night rooftops. **The largest margin in the set.** |
| 11 | `combat` | **2.0** | Sly 2 cane strike / Odyssey capture-throw. Badly. |
| 12 | `guard` | **2.0** | Sly Cooper guard + vision cone. Badly. |
| 13 | `sly-profile` | **1.5** | Any Sly Cooper profile pose. It is not a contest. |

**Mean 2.88.** Median 2.5.

### The blind test, shot by shot

**`temple` — 4.5.** The one frame where a player might stop. A hypostyle hall in perspective,
god-rays raking across it, blue starred ceiling, dust in the air, real sense of scale. It loses
to BOTW's interiors on three specific things: (a) the shafts are three broad parallel bands of
near-uniform opacity with hard straight edges — they cross the near-left column at full
strength with no occlusion notch, which is the tell that they are additive quads rather than
volumetrics sampling the shadow map; (b) the papyrus capitals are lumpy undifferentiated blobs
— no abacus, no bell profile, no ribbing, and the black outline on them breaks into dashes;
(c) the floor is featureless grey tile with no rubble, no sand drift, no wall-to-floor AO.

**`sly-startle` — 4.0.** Best character read in the set: the mask is present, the ears have
cream inners, the cap has a brim, the cane hook is well shaped. It loses to Sly 2 on the muzzle
and the fur. At 3× the muzzle resolves as **three flat planes meeting at hard creases** — an
upper nasal wedge, a lower kite around the nose, and the jaw — with no smoothing between them
and the nose sitting on top as an unmerged black ellipse offset left of centre. The cheek fur is
roughly twenty **hard-edged flat navy spikes** radiating from the jaw; each is a separate card
with its own outline and no shading variation, so they read as thorns. Sly's cheek fur is two or
three large rounded tufts that *continue* the head silhouette. The sclera is lavender-grey and
**darker than the muzzle**, so the eyes recede instead of popping, and the catchlight is 2–3 px.

**`hero` — 3.5.** At 1×, before any measurement, my written impression was "industrial catwalk,
not Egypt". The Egyptian cues are present — glyph registers on the right wall, a colonnade
through the far door, a cavetto lip — but they are subordinate to a blue-grey material read that
says painted steel. Sly 2's equivalent establishing shot tells you the country, the era and the
mood in the first 200 ms. This one does not. Figure/ground here is genuinely good (see §5, I was
wrong about it), but the protagonist is 18.8% of frame height with no readable face, his cane
crosses his whole body as a stick, ~8 detached black fur spikes float clear of his silhouette,
and the tail runs dead horizontal for his own body length.

**`interior` — 3.5.** Best ambient mood in the set. Loses on props: the torches are **radial
gradient blobs** with no flame shape, no sconce, no light shaft; the far wall panel is an
undetailed pale rectangle with three lines that reads as placeholder; the "rubble" is a scatter
of formless dark pebbles; the hieroglyph registers on the upper walls are rows of identical
rounded rectangles that read as a server rack. No volumetrics in a room built for them.

**`sly-key` — 3.0.** Better lit than `sly-closeup`, and the character's colour identity is
intact here (233° of hue across the body — see §4.6). Loses on the same model faults plus: the
legs are pale lavender with irregular navy blotches, which reads as bare mottled skin, not the
blue-black trousers; the tail is shard-plated; and the orange floor carries scattered blue
speckles that read as a texture defect.

**`courtyard` — 3.0.** Obelisk, glyph panels, big sky — the most Egyptian frame. Loses to
Tostarena on architecture and glyphs. Every structure is a chamfered cuboid: **no cavetto
cornice, no torus roll moulding, no batter on any wall** — the three shapes that say "Egypt"
before any texture does. The obelisk has almost no taper. The glyphs are randomised blobs and
bars with no cartouche ovals, no register lines and no baseline alignment. Palette
concentration 0.889 (§4.2).

**`traversal` — 3.0.** The traversal affordance is illegible: a thin black cable, a small
bracket and a bar, and you cannot tell what he is hanging from or how. Sly Cooper's hooks are
unmistakable high-contrast shapes with a rim, because the whole game reads them at a glance. A
blown bloom blob sits directly behind the character (0.44% of his bbox hard-clipped, the highest
in the set) and competes with him. The glyph panel is a visibly repeating tile of identical
rounded rectangles.

**`sly-closeup` — 2.5.** At 4× the mask is **asymmetric and effectively absent on one side** —
the screen-right eye is a clean grey circle on bare lavender skin with no mask around it at all,
while the screen-left pupil is a ragged blob bleeding into a dark patch. That is an eye-paint /
eyeball registration failure, and the mask is the single most load-bearing shape in this
character's design. The fur is thin detached navy dashes, several of which float **outside** the
head silhouette. The ear meets the skull with a visible gap. No contact shadow (§4.3).

**`dunes` — 2.5.** The pyramid — the largest silhouette in the frame — separates from the sky
behind it by **12.1 L, against an 8.1 L null taken within the pyramid face itself** (§4.7). It
is also darker than the sky, and it carries **no outline** while every other object in the frame
is heavily outlined, so it does not belong to the same drawing. Its silhouette is a hard,
un-antialiased staircase with irregular step heights. The foreground dune is a flat striped ramp
with no crest, no lee slope, no ripples. A hard straight diagonal seam cuts the terrain from
(0,355) to (410,480) with no physical explanation. About ten thin untextured poles stand around
the columns doing nothing. Vegetation is pure black spikes.

**`night` — 2.5. The worst loss in the set.** Sly 2's night rooftops are the direct comparison
and the reference for the entire genre. Theirs: deep blue-violet shadow, a hard cyan moon rim on
every top edge, and warm windows placed at three depths to build recession. Ours: palette
concentration **0.948** — 95% of chromatic pixels inside 200–230° — with a single warm doorway
as the only hue break, no stars, and a moon that is a blown white billboard with a bloom halo.
The character's whole body sits at **L 15–25 in a frame whose p95 is 81**, i.e. his entire form
is compressed into 4% of the display range. In a stealth game that is a gameplay failure, not
only an art one.

**`combat` — 2.0.** Measured: **all six body parts within an 8° hue window** (29–37°) where the
same six parts in `sly-key` span 233° (§4.6). Blue cap, blue shirt, blue boots and grey-black
tail are all rendered orange; the only saturated colour left on the figure is one hard-edged
navy rectangle where the cap should be. The impact FX is an eight-spoke asterisk. A broad white
smear crosses the middle third of the frame and veils wall and floor. The outline degrades to a
ragged 3–7 px variable-width smear with detached fragments and a white halo.

**`guard` — 2.0.** The vision cone is a hard-edged near-opaque wedge covering the left ~45% of
the frame at near-white, against a near-black navy quadrant on the right — the frame has no
midtone left. It also climbs the walls at the same intensity as it lies on the floor, which
means it composites at constant strength regardless of depth: it is a screen-space wedge, not a
projected cone. Sly Cooper's cones *tint* what they cover and keep it readable, because the
player has to read the floor inside the cone to plan the route. The guard himself is a flat
maroon mannequin — no linen, no gold, no jewellery, no shendyt pleating. The rope coil is a
stack of flat ellipses; a floor ring is an outlined oval with no thickness.

**`sly-profile` — 1.5.** In profile the muzzle is a **downward-hooking solid black beak** with no
mouth, no jaw line and no chin; the ear is a cupped shell with a visible dark cavity sitting on
the *cheek*, mid-face, not on the skull; the neck is a constant-diameter tube meeting the torso
at a hard black seam. And a large **untextured, unlit, faceted cream polyhedron** floats in
frame occluding the tail — no outline, no cel bands, no texture, visible flat facets, a shading
model shared with nothing else in the shot, occupying roughly 2.7% of the frame. Whatever it is
meant to be, a player reads it as a bug. It appears in this shot and no other.

---

## 3. Findings ranked by what they cost the frame

**1. The character model is the largest single loss, and it costs every frame.** Five faults, in
order of damage:
- *The mask is unreliable.* Present and readable in `sly-startle`; asymmetric and half-absent in
  `sly-closeup`; a soft blob in `sly-key`. It is the one shape that says "Sly Cooper" and it
  cannot be allowed to vary per pose. **Action:** author it as geometry or as a mask painted in
  a UV layout locked to the eyeball transform, and verify it in the same five poses.
- *The tail is built from shards, not fur.* At 3× it is a pale lavender tube with separate
  hard-edged navy plates stuck on, each carrying its own black outline, with pale gaps between
  them so the "rings" do not close. Silhouette is a sawtooth. **Action:** sweep a tube with a
  radius profile that bulges at ring centres; paint rings as continuous circumferential UV
  bands; reduce silhouette tufts to 5–7 large rounded lobes on the outer edge only. Target the
  Sly 2 test: the tail must read as one clean shape at 40 px.
- *Fur is card-based and the cards are wrong.* Too thin, too many, too dark, flat-shaded, not
  flow-aligned, and in `sly-closeup` and `hero` several float clear of the silhouette entirely.
  **Action:** fewer, larger, rounded, shaded, and clipped to the silhouette.
- *The muzzle is flat intersecting planes.* Hard creases between an upper wedge, a lower kite
  and the jaw, with the nose unmerged on top. Reads as a beak in profile. **Action:** smoothing
  groups / normal blending across the muzzle; shorten and blunt it; merge the nose.
- *The legs read as bare mottled skin*, not trousers.

**2. The palette is two colours.** Median across all 13 shots: **86.7% of chromatic pixels fall
inside just two 40° hue windows** (§4.2). 210° blue is a top-2 bin in 11 of 13 shots; 10–30°
orange in 8 of 13. Controls put the floor at 0.222 and the ceiling at 1.000, so this is measured
against a scale that is reachable at both ends. Teal-and-orange is a defensible style; 0.87 is
not a limited palette, it is two colours, and it is why the frames read as a grade smeared over
grey geometry rather than as materials. **Action, for a lighting artist and a material author:**
Egypt's own palette is five hues — Egyptian blue ~200°, malachite ~150°, red ochre ~5°, yellow
ochre/gold ~45°, plus black and white. Put hue variety into *albedo* and stop letting one warm
key and one cool ambient decide every pixel's hue.

**3. The character is not grounded.** Measured (§4.3): floor 3 px below the boot sole reads
L = 72.0; two control columns of the same floor with nothing standing on them read 75.3 and
73.3 at the same rows. Rise from d = 3 to d = 55 under the boot is +2.6 L against nulls of −2.1
and −0.0. There is no contact shadow and no contact AO. Sly 2, Odyssey and BOTW all put a hard
darkening under the character. **Action:** a contact AO term or a blob shadow, and check that
the AO pass reaches character geometry at all.

**4. The Egyptian architectural vocabulary is missing.** Chamfered cuboids everywhere. No
cavetto cornice, no torus roll, no wall batter, no papyrus/lotus capital profile, obelisks
without taper. **Action:** these are five cheap kit pieces and they carry the entire read.

**5. The guard vision cone destroys the frame it is in.** Constant-strength screen-space wedge,
near-opaque, hard aliased edge, climbs walls. **Action:** project it, fall off with distance,
tint rather than replace, soften and animate the edge, put the apex at the guard's eyes.

**6. The combat frame loses the character's colour identity.** 8° of hue across the whole body.
**Action:** the strike key (or hit-flash) at ~33° is overwhelming albedo. Restrict the flash to
a rim/additive-on-edges term, or drop key intensity; and check whether the tonemapper's gamut
compression (see `KNOWN_ISSUES.md` §25 on the AgX shoulder) is rotating high-stimulus pixels
toward the light hue.

**7. Distant silhouettes have no aerial perspective, and the outline rule is inconsistent.**
12.1 L across the pyramid/sky boundary against an 8.1 L within-material null; and the pyramid is
unoutlined while everything nearer is heavily outlined. **Action:** a distance tint that *darkens
and cools* rather than washing to sky colour, and either extend the outline pass to distance or
fade it smoothly rather than at a hard cut.

**8. Subject scale.** The protagonist is 12.5%–27.2% of frame height in the seven environment
shots, and at those sizes none of his authored detail survives. Either frame him larger in the
canonical shots or accept that the character work is invisible in 7 of 13 frames.

**9. The hieroglyphs are not glyphs.** No cartouches, no register lines, no baseline, no
recognisable forms; and in `traversal` the panel is a visibly repeating tile of identical
rounded rectangles.

**10. The sky.** At 2× the clouds are thin white filaments of near-uniform width, uniform
density from horizon to zenith, at a single value with no self-shading — at a golden-hour sun
angle they need warm-lit tops and cool bases. There is visible banding in the blue gradient.
(My structural claim about this failed its own test — see §5.3.)

**11. Placeholder and broken assets visible in beauty shots:** the cream faceted polyhedron in
`sly-profile`; the pyramid's un-antialiased irregular staircase; pure-black spike vegetation in
`dunes`; ten purposeless untextured poles in `dunes`; the far-wall placeholder rectangle in
`interior`.

**12. Load time.** `bootWarnings`: `textures: prewarm took 28.6s at size 1024`. That is a
shipping problem independent of the pixels.

---

## 4. Instruments

All measurements use Rec.709 luma on sRGB 0–255. Every crop and read states its magnification,
per `tools/crop.mjs`'s own rule that a described read is only true at the zoom it was taken at.

**4.0 Instrument proof (§1).** `tools/png.mjs` + `tools/crop.mjs`: decoded dims match the
manifest 1280×720; a z1 crop is bit-identical to the source region (256/256 px); a z4 crop is an
exact nearest-neighbour expansion (1024/1024 px). My own `montage.mjs` and `overlay.mjs` were
proven against `crop.mjs` — a no-box overlay is bit-identical over 920×1040 px — and against
placement arithmetic (tile 2 lands at exactly (28,4) with pad 4). Statistic helpers proven on
known inputs: median of pure black = 0, of pure white = 255.0; IQR of a half-black/half-white
field = 255.0; `sat([255,0,0])` = 1, `sat([128,128,128])` = 0; `hue([0,0,255])` = 240,
`hue([255,128,0])` = 30; `michelson(255,0)` = 1, `(50,50)` = 0, `(30,20)` = 0.200.

**4.1 ROI verification by eye (§27.2).** Every ROI used for a claim was rendered with its box
drawn on it and inspected at magnification before it was believed. This caught a real error: my
first `night` figure/ground patches were **off-subject** — two of them sat on the platform face,
not on the character — and were discarded and replaced. Contact sheets:
`crops/bbox-sheet.png` (7 subject bboxes, magenta pad so containment is visible),
`crops/patch2-combat.png`, `crops/patch2-sly-key.png`, `crops/night-fg2.png`,
`crops/hero-fg.png`, `crops/verify-env.png`.

**4.2 Palette concentration (M11).** Share of chromatic pixels (max−min channel ≥ 8) falling
inside the best two 40° hue windows, whole frame, every 2nd px. Controls: a synthetic two-hue
field → 1.000; a synthetic full 360° hue sweep → 0.223. The statistic is therefore reachable
across [0.222, 1.000] in this setup (§33).

| shot | conc. | dominant bins | | shot | conc. | dominant bins |
|---|---|---|---|---|---|---|
| night | 0.948 | 210° / 220° | | dunes | 0.867 | 10° / 30° |
| sly-profile | 0.905 | 210° / 200° | | sly-startle | 0.862 | 210° / 10° |
| sly-key | 0.890 | 210° / 10° | | temple | 0.838 | 210° / 220° |
| courtyard | 0.889 | 210° / 20° | | traversal | 0.817 | 210° / 30° |
| sly-closeup | 0.886 | 210° / 10° | | guard | 0.806 | 30° / 220° |
| combat | 0.869 | 30° / 210° | | interior | 0.777 | 220° / 210° |
| | | | | hero | 0.691 | 210° / 220° |

**4.3 Contact shadow (M12), `sly-closeup`.** Median L of a 13-px-wide sample at increasing
distance below the left boot's sole, against two control columns on the same floor at the same
rows, 95 px and 145 px to the side.

```
d(px):          3     6    10    15    20    30    40    55
under boot:  72.0  74.2  73.8  73.8  72.2  74.7  75.4  74.6
control A:   75.3  74.1  73.2  72.3  72.2  71.1  84.4  73.1
control B:   73.3  73.0  73.6  75.7  76.2  72.9  72.7  73.3
```
rise(under, 3→55) = **+2.6 L**; nulls **−2.1** and **−0.0**. The floor immediately under the
foot is within 1.3–3.3 L of floor with nothing on it, and the two controls differ from each
other by 2.0 L at d = 3. **No measurable contact shadow or AO.**

**4.4 Subject scale (M1).** bbox height as % of frame height, all bboxes eye-verified:
`courtyard` 12.5% · `night` 13.3% · `temple` 16.0% · `hero` 18.8% · `traversal` 19.4% ·
`dunes` 22.2% · `interior` 27.2%.

**4.5 Night exposure (M4).** Frame p05/p50/p95 = 9 / 21 / 81. Subject bbox median 16.9 = 36th
percentile of the frame. Eye-verified on-subject patches: tail 15.3, torso 19.4, head 24.5.

**4.6 Combat hue collapse (M5).** Median HSV hue and saturation over six eye-verified body-part
patches, with a six-patch flat-wall null in the same frame:

| | head | torso | upperArm | thigh | boot | tail | hue spread | median S | wall-null S |
|---|---|---|---|---|---|---|---|---|---|
| `combat` H | 37 | 36 | 36 | 33 | 29 | 31 | **8°** | 0.415 | 0.371 |
| `sly-key` H | 16 | 191 | 217 | 237 | 223 | 249 | **233°** | 0.457 | 0.373 |

Saturation is unchanged and matches the wall null in both frames, so this is a **hue collapse,
not desaturation**. Reachability is demonstrated by `sly-key` scoring 233° on the identical
statistic and identical body parts (§33).

**4.7 Pyramid/sky separation (M8), `dunes`.** Pyramid face A L = 153.9, face B L = 162.0, sky
beside the silhouette edge L = 165.9. |pyramid − sky| = **12.1 L**; null |faceA − faceB|, same
material, no boundary = **8.1 L**. The pyramid is darker than the sky.

**4.8 Clipping on the subject (M7).** Fraction of subject-bbox px with all channels ≥ 250:
`traversal` 0.44% (L ≥ 240: 1.11%) — highest; every other shot 0.00%.

---

## 5. What I got wrong, recorded because a critic's misses are evidence too

**5.1 "The character doesn't separate from the background."** Written at 1× for `hero` and
`night`. **Refuted.** Michelson contrast between eye-verified on-subject patches and adjacent
background patches: `hero` 0.252–0.356 against a background-vs-background null of 0.010;
`night` 0.166–0.410 against a null of 0.032. Separation is real and 10–40× the null in both.
What is true for `night` is different and narrower: the *silhouette* separates, the *form* does
not, because the whole body occupies L 15–25 (§4.5). The `hero` criticism reduces to scale and
internal detail, not figure/ground. My first statistic here — subject-bbox median vs background
ring — conflated subject with background inside the bbox and I discarded it rather than quote it.

**5.2 "The combat character is flat."** **Refuted.** Spread of the six body-part medians is
111.1 L in `combat` against 109.7 L in `sly-key`, and 3.63× `combat`'s own flat-wall null. The
character carries as much value range there as anywhere. Pursuing this is what found the real
defect, which is chromatic (§4.6).

**5.3 "The courtyard sky has no large-scale structure."** **Refuted.** R64 (sd of 64×64 block
means ÷ per-pixel sd) = 0.727 for `courtyard`, against controls of 0.015 (white noise, all
contrast fine-grained) and 0.916 (two large soft masses, matched on per-pixel sd). `dunes` 0.777,
`night` 0.759. The sky does carry structure at cloud scale. The sky criticism that survives is
only what I can defend by eye at 2×: filament width uniformity, no cloud self-shading, no horizon
compression, banding in the blue.

**5.4 The guard vision-cone measurement does not discriminate and is not quoted as evidence.**
I tried brightness-invariant texture contrast (sd/mean) inside vs outside the cone. Between-group
ratio 0.14×; but the within-group nulls were 0.21× (outside vs outside) and **9.96×** (inside vs
inside). The ROIs were not matched on content — some straddle tile joints — so the statistic
cannot tell the groups apart. §33 exactly: it would have fired the same way whatever the cone
did. The cone finding in §3.5 stands **only as a described read at 2×**, not as a measurement.

**5.5 A control's expected value was wrong and the instrument was right.** I predicted the
full-hue-sweep control would return ~0.11 for palette concentration; the correct arithmetic is
two 40° windows over 360° = 0.222, and the instrument returned 0.223. The prediction was the
error, not the tool.

**5.6 One sign error at 1×.** I read the `dunes` pyramid as *brighter* than the sky. It is
darker, by 12.1 L. The finding (it barely separates) survives; the direction I asserted did not.

---

## 6. What this REJECT routes

Ranked for owners, by cost to the frame: **(1) character model** — mask reliability, tail
construction, fur cards, muzzle smoothing, trousers; **(2) palette** — hue variety in albedo,
five hues not two; **(3) grounding** — contact AO under the character; **(4) architecture kit** —
cavetto, torus roll, batter, capital profiles, obelisk taper; **(5) vision cone** — project it,
tint it, fall it off; **(6) combat key/flash hue** and the tonemapper's behaviour at high
stimulus; **(7) aerial perspective and the outline distance rule**; **(8) subject framing in the
canonical shots**; **(9) glyph authoring**; **(10) sky cloud shading**; **(11) the four
placeholder/broken assets named in §3.11**; **(12) the 28.6 s texture prewarm**.

The one thing I have not done is soften anything because the work has been long. The frames are
better than a project that had done nothing — `temple`, `sly-startle` and `interior` all contain
real craft. They are a long way from the mandate, which is not "better than before" but "utterly
wowed compared with the actual Sly Cooper, Mario and Zelda games", and against that question,
thirteen times out of thirteen, a player picks the other frame.
