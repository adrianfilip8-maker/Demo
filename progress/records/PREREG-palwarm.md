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
