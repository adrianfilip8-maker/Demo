# PREREG — palwarm: is the *source* palette cool, and does warming it at the source move a number?

Registered **before** the instrument was run and before any recipe was edited. §141.1: a criterion
derived after seeing the candidate is void, and saying so afterwards does not repair it.

Context: critic pass 8 (`RESULT-critic8.md`) reports `sly-closeup` at **15.5 % warm / 78.8 % cool**
over saturated pixels, and every one of its four frames majority blue-cyan. That number is taken
off a **rendered frame**, so it is the product of albedo x light x ramp x grade, and this week two
other agents are moving exposure and the shading ramp. **No number in this document is taken from a
frame.** Everything here is measured on the albedo bytes that the texture cache ships.

---

## 1. Instrument

`tools/palwarm.mjs`. Plain Node. No browser render, no WebGL, no capture lock, no 2D canvas
anywhere on the path (§224: a canvas round-trip returned 57 % of `torch_flame`'s bytes wrong, peak
184/255 on red — so the pixels come out of the committed blob through the runtime's own
`PngCodec.unfilter` and `zlib.inflateSync`, which is byte-exact by construction).

Pixel source: `public/assets/tex/textures.bin`, described by `src/textures/baked.json` — i.e. the
bytes that actually ship. `--live` re-bakes in headless Chromium instead, for iterating without a
full 1024 bake; the two sources are cross-checked against each other (CAL-5).

## 2. What "warm" means — registered numerically

Per texel, on the stored sRGB bytes (this is the space the art is authored in and the space the
critic read):

| quantity | definition |
|---|---|
| alpha gate | texels with `A < 128` are dropped — not a visible surface |
| chroma `C` | `(max-min)/255` |
| hue `H` | standard HSV hue, degrees |
| **achromatic** | `C < 0.06` (≈ 15/255). Counted and reported, **never** counted warm or cool |
| **warm** | `H ∈ [330,360) ∪ [0,90)` — the 120° wedge centred on **30°** (orange) |
| **cool** | `H ∈ [150,270)` — the 120° wedge centred on **210°** (azure), exactly opposite |
| **neither** | `[90,150)` green-teal and `[270,330)` violet-magenta — two 60° transition wedges |

The two wedges are the same width and 180° apart on purpose: an asymmetric split would bias the
share before a single texel was read. Shares are quoted **as a fraction of chromatic texels**,
which is the critic's own denominator ("share of saturated pixels").

A wedge partition has cliffs at its boundaries, so a second, continuous statistic is reported
beside it and neither is allowed to stand alone:

> **warmth `W` = mean over all gated texels of `C · cos(H − 30°)`**

i.e. mean chroma projected onto the orange↔azure axis. Positive = warm. Insensitive to wedge
boundaries; sensitive to both how much chroma there is and where it points.

## 3. Weighting — surface the player actually looks at, not one number per file

A per-file mean would let a 512² sprite outvote 36 m of temple wall. The weight is **screen
coverage in pixels**, rasterised from the canonical shot cameras over architecture + props +
terrain + vegetation, with **no lighting, no shadow, no grade, no mips** — coverage is a property
of geometry and framing only, so it does not move when LIGHTING or RAMP moves this week. Method is
`progress/records/ringpx.mjs`'s, which already reports these shares per material per shot.

Headline weight: the four shots the critic scored — `hero`, `temple`, `courtyard`, `sly-closeup` —
pooled by pixel count. The per-recipe table is printed unweighted as well, always, because the
aggregate is the thing being fixed and the table is the thing that says where.

## 4. Thresholds

Registered now, absolute (not relative to a control I have not yet seen):

- **P0 — attribution.** If the *control* already satisfies P1, then the source albedo is **not**
  the cause of the frame's 78.8 % cool, and the finding to report is that, not a fix. This clause
  exists so that "my files were already fine" is a permitted, pre-registered outcome and not
  something I get to discover and then re-frame.
- **P1 (primary).** Coverage-weighted **cool ≤ 8 %** and **warm ≥ 80 %** of chromatic texels.
- **P2.** Coverage-weighted **W ≥ +0.085**.
- **P3 (guard — must NOT fire).** Coverage-weighted mean albedo luma stays within **±0.02** (of
  1.0) of the control. The palette is to be fixed by hue, not by brightening the scene.
- **P4 (guard — must NOT fire).** Coverage-weighted mean chroma must not end **below** the
  control's. Warmth bought by desaturating the cool is not warmth, it is grey.
- **P5 (guard — must NOT fire).** Vegetation must stay green: `palm_frond` and `papyrus_reed`
  must each keep ≥ 50 % of their chromatic texels **outside** the warm wedge. A global hue
  rotation would fail this, which is the point of having it.

Miss P1 and the run is reported as a miss, with the numbers.

## 5. Calibration — every arm must fire, or the instrument is blind

- **CAL-1 classifier.** Synthetic swatches `#d4823a` (ochre), `#1f4f96` (lapis), `#2f8f5a`
  (malachite), `#808080` (grey) must come back **warm / cool / neither / achromatic**. Any
  mis-label voids the run.
- **CAL-2 responsiveness, on the real data.** Rotate every texel of the real measured set by
  **+180°** in hue and re-measure. Warm and cool shares must **swap** to within 2 points and `W`
  must change sign with magnitude within 5 %. An instrument that cannot see a 180° rotation of its
  own input cannot see a 10° one either.
- **CAL-3 null.** The same input measured twice must produce bit-identical output.
- **CAL-4 weight sanity.** Weights sum to 1; the largest single recipe's weight is printed, and if
  any one recipe exceeds 0.60 the aggregate is reported as "one recipe's number wearing a hat".
- **CAL-5 source agreement.** The blob path and the `--live` bake path must agree on every
  recipe's warm share to within 2 points at matched resolution. They are different code paths to
  the same pixels and a silent divergence would make every iteration measurement a fiction.

## 6. Hieroglyph rebuild — separate claim, separate check

The critic: *"rounded rectangles, ovals and pills, no bird, eye, ankh or cartouche — a circuit
board."* Registered before the rebuild:

- **G1.** Over the signs actually placed in `hieroglyph_wall` (counted with the existing
  `__GLYPHLOG` census hook in `Hieroglyphs.drawGlyph`, so it counts what was drawn and not a
  re-derivation), **≥ 35 % of placed signs must be figurative** — bird, animal, human, or a named
  body part — against whatever the control reports.
- **G2.** Stroke-width variation: the standard deviation of per-sign drawn width, over placed
  signs, divided by its mean, must **rise**. A uniform grid has a low one.
- **G3 — depth cueing.** Every carved stroke must carry a light edge and a dark edge in the
  **albedo**, not only in the height field. Checked as: inside the glyph mask, the albedo's
  90th-percentile-minus-10th-percentile luma spread must be **≥ 0.10** where the control's is
  measured first and printed. A flat stamp has none.
- **G4 (guard — must NOT fire).** The tiling landmark defect §13 records must not come back:
  `tools/wallstrip.mjs` at the framing that separated the known-bad `cartouche: true` state.

---

Registered by EGYPT, before the first run.

---

# ADDENDUM 1 — the control came back P0, and here is the second criterion

Written **after** the control run and **before any recipe was edited**. Nothing below was measured
on a changed texture; the candidate does not exist yet. Stated plainly because a threshold set with
a control in hand is only honest if the order is on the record.

## The control, in full

Coverage-weighted over `hero, temple, courtyard, sly-closeup` (90.3 % of frame pixels attributed;
`props_*`, `sand_ring*` now mapped, pyramids and `props_dark/glass` carry no texture map at all and
stay unattributed):

```
COVERAGE-WEIGHTED  warm 94.9%   cool 3.5%   neither 1.6%   achromatic 0.1%
                   warmth W +0.3200   chroma 0.3468   luma 0.5098
HUE SEPARATION     h30 93.1% in one 30° bucket   hueN 2.44 effective 15° families
```

**P0 FIRES.** P1 (cool ≤ 8 %, warm ≥ 80 %) and P2 (W ≥ +0.085) are all satisfied *by the control*.
The shipped albedo is 94.9 % warm. Whatever makes `sly-closeup` measure 78.8 % cool in frame is
**not in `src/textures/`** — it enters downstream of the albedo. Per P0 that is the finding, and I
do not get to re-frame it into a fix I made.

## The defect that IS in these files

The same table says something the warm/cool split cannot:

| recipe | coverage | **median hue** |
|---|---|---|
| paving_courtyard | 21.2 % | **23°** |
| column_papyrus | 15.3 % | **23°** |
| sandstone_worn | 12.5 % | **23°** |
| hieroglyph_gilded | 12.1 % | 38° |
| sandstone_block | 11.2 % | **23°** |
| hieroglyph_wall | 9.7 % | **23°** |
| granite_pink | 8.3 % | **23°** |
| limestone_polished | 2.4 % | 38° |
| gold_leaf | 1.2 % | 38° |
| papyrus_reed | — | 38° |

**93.1 % of every chromatic texel in the scene is inside one 30° hue bucket**, and eight of the ten
highest-coverage recipes report *the identical* median hue. Aswan **granite is the same colour as
mudbrick**; **papyrus is the same colour as sandstone**; gold, limestone, rope, bronze and
carnelian are one shade of each other. The brief's "sandstone, limestone, gold, ochre, sun-bleached
plaster" is a list of five materials, and the texture set ships **one**. A scene painted in a single
hue at five brightnesses has no colour design in it, and it is the reason the whole frame moves
together when anything downstream tints it: there is no second hue for the eye to hold on to.

Two mechanisms produce it and both are shared code, which is why it is uniform: every recipe's dark
tail is pulled to the same `SAND_CREV_FLOOR` (`0x553627`, hue 19.6°) by `rampFloor`, and every
recipe's grime, dust and pitting come from the same sand-coloured constants.

Also recorded, because it is measured here and belongs to someone else's headline: the four largest
architectural surfaces have **albedo p99 of 0.596 / 0.616 / 0.639 / 0.765**. Critic pass 8's "0.000 %
of pixels above luma 230" has a texture-side ceiling under it — a 0.60 albedo cannot reach 230/255
at unity gain. Raising the sun-struck tail is in scope here; the exposure that would use it is not.

## Second criterion — registered now

- **S1.** `h30` ≤ **78 %** (control 93.1 %).
- **S2.** `hueN` ≥ **3.00** effective 15° families (control 2.44).
- **S3.** The eight highest-coverage recipes must span ≥ **4** distinct 15° median-hue bins
  (control: **2**).
- **S4.** `granite_pink` median hue ≤ **15°** and at least **15°** away from `sandstone_block`'s.
  Aswan granite is pink; this one is not.
- **S5** (supersedes P5, which the control already misses). `papyrus_reed` and `palm_frond` must
  each report a median hue in **[75°, 150°)**. Control: 38° and 83°, with `papyrus_reed`
  **100 % warm**.
- **S6.** Coverage-weighted albedo **p99 luma ≥ 0.70** (control 0.647), without breaching P3.
- **S7 (guard — must NOT fire).** `ceiling_stars` must stay ≥ 80 % cool. It is the night-sky
  ceiling and it is correct; "fixing the palette" must not mean deleting the one deliberate cool
  mass in the level.
- **P1, P2, P3, P4 continue to apply.** Separation must not be bought by turning the scene cool
  (P1), by brightening it (P3), or by desaturating it (P4).

Registered by EGYPT, control in hand, before the first recipe edit.

---

# ADDENDUM 2 — the glyph control, and a criterion G1 was too weak to catch

Written after running `tools/census.mjs hieroglyph_wall` on the shipped recipe and **before any
change to `Hieroglyphs.js`**.

## The control census — 111 sign placements per repeat

```
 13 mouth   12 neb    10 sky    10 water   9 pot    9 stool   7 arm    7 hills
  6 bread    5 hetep   4 pool     3 shen    2 land   2 hand    2 djed   2 ankh   2 strokes
  1 ka       1 papyrus 1 feather  1 was     1 cone   1 sedge
```

**Not one creature sign.** No falcon, no owl, no vulture, no quail, no jackal, no scarab, no
cobra, no bee, no seated figure, no wedjat — every one of which is in the library and in the pools
the wall draws from. 92 of the 111 placements are flat geometric signs: a pill, a bar, a zigzag, a
basket, a half-dome. The critic's "rounded rectangles, ovals and pills, a circuit board" is a
literal and accurate description of this list.

## G1 as registered is too weak, and I am saying so rather than quietly leaning on it

G1 counts "bird, animal, human, **or a named body part**" as figurative. Under that definition the
control already scores **20.7 %** (`mouth` 13 + `arm` 7 + `hand` 2 + `ka` 1 = 23/111), and the bar
of 35 % could be cleared by drawing *more pills*, because `mouth` is a body part that renders as a
pill. That is a criterion that can be satisfied without fixing the defect it was written for.

G1 stands as registered and will be reported. A second, stricter criterion is registered here,
before the candidate exists:

- **G1b — creature share.** Of signs actually placed, the share that are `falcon, owl, vulture,
  quail, jackal, scarab, cobra, bee, seated, wedjat` — the signs a viewer would call *a picture of
  something* — must be **≥ 20 %**. Control: **0.0 %** (0 of 111).

## G3 — depth cueing, instrument and control registered before the change

`tools/glyphrelief.mjs`, built for this and run on the control first. It bakes the recipe with the
existing `__GLYPHLOG` census hook set, so sign boxes come from what was *drawn*, and measures the
baked albedo inside them.

- **G3a.** Mean p90−p10 luma spread inside a placed sign's box, minus the same statistic over an
  equal number of same-sized boxes on plain wall. Must **rise**.
- **G3b — the light-and-dark-edge claim, stated as a signed number.** For each sign box, the mean
  albedo luma of the band just inside its **top** rim minus the band just inside its **bottom**
  rim. A flat stamp gives ~0. A cut with a sky-facing lower lip and a shaded overhang above gives a
  consistent sign. Required: **|mean| ≥ 0.020** with **≥ 70 %** of sign boxes sharing the sign —
  a *consistent* asymmetry, not noise that happens to average.
- **CAL-G (must fire).** The same instrument run on plain-wall boxes must report a G3b magnitude
  **below 0.008**. If unbroken wall shows the same asymmetry as a carved glyph, the instrument is
  measuring the masonry, not the carving, and the run is void.

**On the direction of the cue, because there is a recorded failure to avoid.** `carve()`'s own note
rejects `wallDark`/`skyward`'s baked top-left key: it is directional, it contradicts the sun on half
the building, and it is §7.3's "carvings look painted-on". That objection is about a **sun** cue and
it stands. What is authored here is a **gravity** cue: the lower lip of a sunk cut faces up, catches
sky and collects dust, and is pale; the overhang above it faces down, holds soot and grime, and is
dark. That is true on the lit and the shaded face of the same pylon, at every hour, which is exactly
the property the sun cue lacked.

Registered by EGYPT, control in hand, before the first glyph edit.

---

# ADDENDUM 3 — G3b is also too weak, and the criterion that replaces it

Written after the control run of `tools/glyphrelief.mjs` and **before** any change to the carve or
the layout.

**G3b as registered does not discriminate.** It asked for |lower-lip minus overhang| ≥ 0.020 with
≥70 % sign agreement. The control already reports **+0.0377** on `hieroglyph_wall` and **+0.0220**
on `column_papyrus`, with the vertical-shift calibration arm at −0.0111 and −0.0044 — so the cue is
real, it is tied to the cut, and it comes from `weather({directional})`'s existing sky term. A
threshold the control clears is not a threshold. Reported as such; not retuned into a pass.

**G3c — the criterion that replaces it, and it is a delta with its own control arm.** A new A/B
lever `hgcue` turns the authored gravity cue off inside the same process, at the same size, with
the same seed and the same mask. Required:

- `cue(on) − cue(off)` ≥ **+0.030** on `hieroglyph_wall`. The off arm is the existing baseline and
  is printed beside it, so nobody has to take the control's value on trust.
- **CAL-G must keep firing** on the on-arm: the same texels sampled from a vertically shifted copy
  of the albedo must come back below one third of the on-arm magnitude. Vertical, not horizontal —
  the first version of this arm shifted horizontally, failed to move (+0.0335 against +0.0377) and
  was rejected, because every confound in this recipe is a function of y and a horizontal shift
  breaks no association at all.
- **G3d.** The lower lip must be the **pale** side (positive cue). A sky-facing ledge collects dust
  and light; the overhang above it collects soot. Getting that sign backwards is the inverted
  contact shadow critic pass 8 found in the decals, in another place.

**G1b (creature share ≥ 20 %, control 0.0 %) stands unchanged** — that one separates.

Registered by EGYPT, controls printed, before the first glyph edit.
