# PREREG — inkscale: ink width in pixels, across distance and across screen size

Registered **before any capture has produced a number** — the baseline run is queued behind the
capture lock as this is written — and before any `src/**` edit. §141.1: a criterion derived after
seeing the candidate is void, and saying so afterwards does not repair it. Every threshold below is
either absolute or expressed as a required *movement* against a control I have not yet seen.

Critic pass 8 (`RESULT-critic8.md`), the ranked ink complaint:

> **Ink width varies 1 px → 29 px on a single character in one frame**, and tracks
> depth-discontinuity magnitude — "the signature of an edge detector, not an art-directed line."
> `Outline.js` documents itself as one width. At 76 px tall in `courtyard`, median ink is 5 px =
> **6.6 % of his height**, so a 12 px arm is 100 % ink and the silhouette is an asterisk.

---

## 1. Instrument — `progress/records/inkw.mjs`

### How ink is separated from shadow and terminator

**Ink is what an ink pass DARKENED.** Every arm comes from one boot, one staged frame, `dt = 0`,
with exactly one lever moved; a pass's mask is the set of pixels that got *darker* when that pass
was switched on. A cel shadow, the terminator, and Sly's own near-black albedo are present in both
arms and cancel to zero — they cannot enter the mask however dark they are. **Nothing in this
instrument thresholds absolute luminance anywhere.** The critic's figure is a dark-pixel count and
therefore cannot make that separation; whether the 29 px is ink at all is the first thing this run
has to settle, and P0 below is the pre-registered outcome in which it is not.

### How width is measured

**Minimum chord.** For each mask pixel, take the maximal run of mask pixels through it along four
axes (horizontal, vertical, both diagonals) and keep the smallest. For a straight band of thickness
*t* this returns exactly *t* at 0°/90° and *t*+1 at 45° (rasterisation), and — the property that
matters — it does not grow with the band's *length*. A dark-run or pixel-count estimator reports a
horizontal ink line as hundreds of pixels wide; this reports its thickness.

Verified on synthetic bands, `t ∈ {1,2,3,5,9} × {0°,45°,90°}`, before any frame is read; the run
aborts if that self-test fails. Bias is at most +1 px and always toward *wider*, which is the
conservative direction for a claim that the ink is too wide.

A LINE has a small minimum chord everywhere along it. A SMEAR does not. Median chord is the line
weight; p99 and max say whether the pass is also painting blobs.

### Arms — one boot, `dt = 0`, FXAA off in all of them

| arm | lever | what it yields |
|---|---|---|
| `base` | — | the subject |
| `nohull` | `shading.setOutlinesVisible(false)` | inverted-hull band |
| `noink` | `postfx.tune.inkStrength = 0` | screen-space crease band |
| `noao` | `postfx.setEnabled('ao', false)` | ambient-occlusion band |
| `nochar` | `character.root.visible = false` | CALIBRATION + subject box |
| `hull2x` | hull `uThickness` × 2 | CALIBRATION |
| `fxaa` | FXAA on | the AA filter's own cost on any measured width |
| `null` | nothing, captured last | CALIBRATION |

FXAA is off because it is a spatial filter running after the composite: it spreads every one-pixel
change into its neighbours and adds roughly a pixel to anything measured through it. The `fxaa` arm
quantifies that instead of assuming it.

### The three calibration arms, and what each one proves

- **`null` MUST report 0 changed pixels against `base`.** §220 measured a 3087/57600 px drift floor
  between captures four frames apart. Every arm renders at `dt = 0`; the null is what proves the
  clock stood still *and* that every lever was fully restored. **Non-zero ⇒ the run is VOID.**
- **`nochar` MUST move > 200 px.** §218: `G.step(n, 0)` does not render, and two of the three probes
  it voided carried no "does anything move a pixel at all" control. These arms poke a lever and force
  a render *without* going back through `setShot`. If that path were dead, every arm would silently
  return the base frame and every mask would be empty — and an empty mask is indistinguishable from
  a working pass without this arm.
- **`hull2x` MUST widen the hull band's median chord by ≥ 1.6 ×.** A mask can be non-empty while the
  width estimator is blind. This doubles a known input and requires the output to follow it.

---

## 2. What the source predicts, computed before the capture

From the shipped constants alone (`INK_PX = 2.5`, `TUNE.edgeThickness = 1.5` × the 1.8/0.70 depth
weight, `AOPass.tune.radius = 1.35 m`, `depthPush = 0.0022`), projected through each shot's own
camera. This is a prediction, not a measurement, and it is recorded now so that the measurement can
contradict it:

| shot | dist | px/m | char px | hull | crease | **AO radius** | ndc r | push disp | ink lo–hi |
|---|---|---|---|---|---|---|---|---|---|
| courtyard | 28.1 | 24.6 | 42 | 2.50 | 2.02 | **33** | 0.33 | 0.46 | 2.04–2.96 |
| hero | 11.1 | 76.3 | 130 | 2.50 | 2.67 | **103** | 0.32 | 0.25 | 2.25–2.75 |
| combat | 6.0 | 166.1 | 282 | 2.50 | 2.70 | **224** | 0.38 | 0.32 | 2.18–2.82 |
| sly-closeup | 3.7 | 279.3 | 475 | 2.50 | 2.70 | **377** | 0.08 | 0.06 | 2.44–2.56 |

(1280×720. At 640×360 every column is unchanged except `char px` and `AO radius`, which halve —
**the hull stays at 2.50 px**, which is the resolution defect stated as a number.)

Three mechanisms are in play and they are not the same mechanism:

1. **Resolution invariance.** The hull is 2.50 device px at every resolution, so it is 6 % of a
   42 px `courtyard` character at 720p and 12 % of the same 21 px character at 360p. The critic's
   "6.6 % of his height" is this, exactly.
2. **The depth push displaces the hull, it does not widen it.** `toon.glsl.js:1094` does
   `mvPosition.z *= 1.0 + uDepthPush` *before* projecting, which scales `gl_Position.w` while
   leaving `gl_Position.xy` alone, so the whole shell is pulled toward the frame centre by
   `(1 − 1/k)` of its NDC radius. Reproduced in plain three arithmetic
   (`scratchpad/pushrepro.mjs`): the ink offset is **2.500000 px at z = −2, −10 and −60, with and
   without the push** — the width term is exactly preserved because the extrusion is multiplied by
   `gl_Position.w` and then divided by it — while the shell moves 0.89 px at NDC 0.42, 2.11 px at
   NDC 1.0 and 2.42 px at the corner (1920×1080, fov 46). The line therefore goes thin on the
   outward-facing side of a form and thick on the inward-facing side, **and the mean is exactly
   conserved**, which is why a median could never have found this.
3. **The crease pass's band width tracks edge magnitude** up to its sampling radius: on a strong
   silhouette the Roberts response saturates across the whole ±o band, on a weak crease it clears
   the threshold only in the middle. That is the critic's "signature of an edge detector" and it is
   inherent to the detector; what is fixable is the radius it is bounded by.

---

## 3. Registered thresholds

`Wmean/Wmed/Wp99` are the mean / median / 99th percentile minimum chord of a band. "Subject" is the
padded bounding box of the largest connected component that moves when the character is hidden.

**P0 — attribution, and a permitted outcome that is not a fix.** If the AO band's `Wp99` on the
subject exceeds **3 ×** the combined-ink band's `Wp99` on the subject in **≥ 2 of the 4 shots** at
1280×720, then the wide dark run adjacent to the silhouette is **ambient occlusion, not ink**, the
RESULT must lead with that, and a screen-space pixel clamp on the AO radius comes into scope with
its own before/after and its own null. Otherwise AO is reported and left alone.

**P1 — ink width scales with screen size (the headline).** Hull band and combined-ink band, over
the subject, pooled across the four shots:

> **`Wmean(720 rows) / Wmean(360 rows) ≥ 1.25`**

Nominal for the candidate is 1.85 (2.5 × 720/1080 = 1.67 px against a floor of 0.9 px). **The
baseline must fail this at ≈ 1.00**, because `INK_PX` is a device-pixel constant that
`tests/ink.test.mjs` currently locks. A baseline ratio outside **0.85–1.20** means the instrument is
measuring something other than the hull, and the run is void.

**P2 — within-frame spread falls.** Combined ink band on the subject, 1280×720: `Wp99 / Wmed` must
fall by **≥ 20 %** against baseline pooled across shots, and must not rise on any single shot by
more than 10 %.

**P3 — no ink deletion.** Combined ink mask pixel count on the subject, 1280×720, must land in
**[0.55, 1.20] ×** baseline, per shot. The candidate deliberately thins the line by 1.5 × at 720
rows, so ≈ 0.67 is the expected result; below 0.55 the line is being lost into antialiasing rather
than thinned, which is a different §7.3 failure ("outlines missing") and counts as a FAIL.

**P4 — the radial asymmetry is gone.** Hull band, whole frame, outer ring (NDC radius > 0.70 of the
corner): `p95 / p05` must **fall**, and `p05` must **rise**. This is the pre-registered test of
mechanism 2; the analytic prediction is a fall from ≈ 4.6 × to ≈ 1.0 ×, before antialiasing and
before the estimator's integer floor compress it.

**P5/P6/P7 — the three calibration arms**, in the candidate run as well as the baseline.

**P8 — `node --test "tests/*.test.mjs"` stays green (216 passing).**

**P9 — the shader that compiled is the shader I edited.** The depth-push fix is applied by string
patch to a shader source this agent does not own the file of, so: the patch throws if its anchor is
absent, a unit test asserts the patched source contains the new form and not the old, and
`progress/records/glslink.mjs` must still report the cel program linking.

---

## 4. The candidate, registered in full before it is written

1. **`Outline.js`** — `INK_PX = 2.5` becomes the width **at a reference frame height of 1080 device
   pixel rows** (§1's stated target), not at every resolution:
   `inkPixels(rows) = clamp(2.5 × rows/1080, 0.9, 5.0)`. The floor exists because a hull thinner
   than about a pixel renders as an *intermittently missing* line rather than a thin one; the
   ceiling binds only above 4K.
2. **`Outline.js`** — a resolution sync driven once per frame from `PostFX.render()` (the one place
   in my files that runs every frame and knows the drawing-buffer size), rewriting `uThickness` on
   every cached ink material only when the row count changes.
3. **`PostFX.js`** — the crease pass's `edgeThickness` is multiplied by the same
   `inkResScale(rows) = inkPixels(rows)/2.5`, so the two ink systems move together by construction
   rather than by two numbers in two files that have to be kept in step by hand.
4. **`Outline.js`** — the depth push is applied to **clip-space z only**, by patching the imported
   `OUTLINE_VERT` before it reaches `ShaderMaterial`. The replacement computes the pushed vertex's
   `ndc.z` and writes it into an otherwise unpushed `gl_Position`, so `xy` and `w` are untouched and
   the depth bias is unchanged for any projection matrix, orthographic included.
5. **Deliberately NOT changed, recorded so it is a decision and not an oversight:**
   - `edgeNearMul/edgeFarMul` (1.8/0.70). §7.3 fails a frame whose outlines are "uniform-thickness
     regardless of depth", so the depth weighting stays. Change 3 already shrinks the radius it
     multiplies.
   - The rim radii `rimInner/rimMid/rimOuter`, still in device pixels. They are a different term
     with its own measured tuning, and thinning the ink only *improves* the clearance the rim's own
     comment reasons about. The inconsistency is stated with a number in the RESULT.
   - `AOPass.tune.radius`, unless P0 fires.

---

## 5. What would falsify the whole framing

If the baseline's hull band already measures ≈ 2.5 px with `Wp99 ≈ Wmed` on the subject and the
crease band likewise, then ink is not what the critic measured, P0 fires, and the deliverable is the
attribution plus whatever P0 puts in scope — not a width change.
