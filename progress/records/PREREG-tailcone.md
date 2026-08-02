# PREREG — tail terminal cone (the cap6 T-tip FAIL remedy, SRC-FROZEN prep)

Sealed BEFORE any implementation edit. `src/player/**` at seal time **4d9bb82 == HEAD d0f781c**
(verified empty diff). This is the remedy `PREREG-tailtip.md`'s own outcome routing named for
this exact result: *"Any FAIL-unmet with gates ok: … named next lever: tip = extend the spine cap
geometry itself (terminal cone)"*. It is being taken as written, not re-chosen after the fact.

## What failed and why the previous lever could not have worked

cap6: **T-tip 3 lobes against a PASS band of {0, 1}** — regressed from baseline 2. Both deletion
gates passed (tip meanDepth 2.8 ≥ 2.0, under meanDepth 4.5 ≥ 3.5) and the ratio held at 1.077, so
the verdict is readable and the fail is real. T-under improved 7 → 5 (IMPROVED-not-met).

The tip is currently made **entirely out of fur clumps**. `SlyModel.js:2784` authors three wedges
(`TIPLOCK`, offsets −0.010/−0.050/−0.090, azimuths 0/+0.35/−0.35) past a tail tube that ends in a
**flat cap** — `addTube(… capEnd: true)` at `:1038`, terminating at spine[n−1] with radius
`0.026·G` (G = `TUNE.tailGirth` 0.92), i.e. a disc ~2.4 cm across.

So the terminal contour is the union of three separate wedge tips. Three wedges that each reach
past the flat cap produce three contour extrema, which is three lobes — **by construction, and no
staggering or azimuth clustering can remove it**, exactly as the previous iteration's own
reasoning (the fan's "perp 0.30 = separated by construction") applied one level up. cap6's prose
impression that the mass reads *more* consolidated is consistent with this and is not a
contradiction: the wedges did merge into one mass; the mass still ends in three points.

## The change

Append a **terminal cone** as a separate short tube, after the main tail tube, and let the
existing wedges break its edge instead of constituting the tip:

- start at `spine[n-1]` with radius `radius(1.0)` = `0.026·G` (continuous with the tube's own
  end, so no seam step), 3 rings along `tipT` at `+0.035·G`, `+0.075·G`, `+0.115·G`, radii
  `0.017·G`, `0.008·G`, `0.0` — a cone whose apex is the single most distal point of the tail.
- `seg: TUNE.segTail` (18), `group: 'furDark'` — the last authored ring band is `[0.975, 1.001]`,
  which is dark, so the cone continues the dark tip rather than introducing a new colour event.
- `weights: [['tailD', 1]]` — the same binding the tip wedges already use, so it rides the tail's
  last bone and no clip's tail motion changes.
- `TIPLOCK` wedge lengths drop `0.085/0.065/0.050` → **`0.055/0.045/0.035`·G** so they sit
  *inside* the cone's silhouette and ripple its edge rather than out-reaching the apex. Their
  offsets, azimuths, widths, bend and group are unchanged.

**Why a separate tube and not extra spine centres — this is the load-bearing design decision.**
`t` is normalised over the `spine` array, and both the six ring `BANDS` and the whole skin `RAMP`
are expressed in `t`. Appending centres to `spine` re-parameterises every existing centre, which
would silently shift all six ring bands and the bone-weight ramp along the entire tail — a global
change to the tail's colour and skinning, arriving through what looks like a local tip edit, on
the one part that is half the silhouette and is driven by all 52 clips. A separate tube leaves
the main tube, its `t`, its bands and its ramp **bit-identical**.

**Cost, with §27.3's multiplier applied and not forgotten.** 3 rings × 18 segments ≈ 54 vertices,
≈ 90 triangles for the cone, less the vertices freed by the flat `capEnd` becoming interior; the
shortened wedges cost 0. The character carries a 1:1 inverted-hull ink shell, so the shipped cost
is **≈ +180 triangles, ×2**, on a ~16.0k body — ~1.1%. Draw groups unchanged (no new material).

Non-binding prose intent, marked as such per §26.2: the tip reads as one dark tapering point with
a ragged fur edge, and the tail keeps a raccoon's blunt-then-pointed terminal rather than a brush.

## Instrument and baseline (§27.1)

`taillobes.mjs`, **unmodified from the tailtip seal** — thresholds fixed in its header (dark-half
Otsu on erode-3 interior; lobe = smoothed depth ≥8 run with peak ≥10, bounded by ≤3, arc width
4–80). It builds its tail mask **from the live rig**, so per §27.1 its baseline is not the cap6
PNG on its own: it is the instrument re-run against `git archive 9401cc7` (the tree cap6 was shot
from), the pairing that reproduced the previous seal to the digit. `interiorink.mjs` (ratio) is
likewise unmodified and runs on the same verdict frame.

Baseline for this seal = **cap6 numbers**: T-tip **3**, T-under **5**, tip meanDepth 2.8, under
meanDepth 4.5, ratio 1.077.

Transforms not implemented, stated as the gap (§11): `taillobes` reads a rendered frame, so it
carries the shader and the ink shell but not the pose of any clip other than the frozen one.

## Registered bands — partitioning the outcome line (§26.1)

**T-tip (integer ≥ 0), primary:**
- PASS: {0, 1}
- IMPROVED-not-met: {2} — back to the pre-tailtip value; direction right, verdict not claimable;
  routes to shortening the wedges a second step (0.045/0.035/0.028).
- FAIL-unmet: [3, ∞)

**T-under (integer ≥ 0)** — not targeted by this change; it must not be damaged by it:
- PASS: [0, 2]
- HOLD: [3, 5] — cap6's value (5) lives here; acceptable, no claim
- FAIL-regressed: [6, ∞)

**Deletion guards (gates; no PASS claimable unless all hold):**
- tip meanDepth ≥ **2.0 px** (cap6 2.8). A cone that thins the tip to a bare contour would also
  count 0 lobes and is *not* the fix — this is the band that distinguishes them.
- under meanDepth ≥ **3.5 px** (cap6 4.5).
- `interiorink` ratio in **[0.97, 1.22]** (cap6 1.077); ink-gate failure on either ROI ⇒ the ratio
  carries nothing (pre-registered instrument failure, not an outcome).
- 52/52 clips present, `missing []`, zero new warnings.
- character triangle delta ≤ **+400 total** across `sly_body` + `sly_outline` (predicted ≈ +180),
  measured per mesh as cap6 did — the check that caught the ×2 in the first place.

**T-look (binding, judged FIRST):** view 1×, then tail at 3×, before the table. Mechanical form,
so look and number cannot diverge (§26.2): **the distal end of the tail must terminate in a single
identifiable point, with fur texture visible along its edges and no second or third spike of
comparable length beside it.** Any other impression is observation and non-binding.

## Verdict procedure and frame sharing

Verdict frame: **`sly-closeup`**, 1280×720 — the frame `taillobes` was calibrated on. It is
**not** shareable with `PREREG-heroline`'s `hero` frame: at 120 px the whole figure is smaller
than the tail-tip ROI this instrument needs, and lobe counting there would be measuring noise.

The two seals do share a **boot**: `hero` + `sly-closeup` (+ `sly-startle`, see the catchlight
note) is one three-shot capture. That is the request — one boot, three frames, three independent
verdicts.

## Outcome routing

- T-tip PASS + gates: the tail-tip authoring closes. Remaining tail work is T-under's [3,5], which
  the tailtip seal already routed to a second underside density step.
- T-tip IMPROVED {2}: ship, shorten wedges one step as named above. Do not add a fourth wedge.
- T-tip FAIL [3,∞) with gates ok: the cone is not out-reaching the wedges — measure the apex
  against the wedge tips in model space before touching the frame again, since that is arithmetic
  and does not need a capture.
- tip meanDepth gate fail: the cone thinned the tip; revert the wedge shortening, keep the cone.
- Triangle gate fail: the cone's ring count is the lever (3 → 2), not the segment count, which is
  shared with the tube's cross-section.

**Remedy as a function of state, not schedule (§26.3):** on FAIL the cone does not remain in the
tree, whether that means withholding the patch or reverting a commit.
