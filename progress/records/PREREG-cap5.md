# cap5 — acceptance, re-typed before the frames exist

Provenance: the original PREREG-cap5.md was lost with the scratchpad in the ~11:33 container
restart, together with `shots/cap4/` and the original `interiorink.mjs`. This file re-types the
registration from its two surviving verbatim copies — the 44dede5 commit message and the
`tuftRollW` note in `src/player/SlyModel.js` (both written against the lost original, before any
frame was queued) — plus the coordinator's ledger line: "tail-tip runs/row 4.04 → 3.1–3.7,
fail-low <2.4 falsifies the width, fail-null ≥3.9 falsifies ink-fraction; contour roughness
barred." Nothing in this file was written after seeing a cap5 pixel; the instrument-transfer
rules in T-I below are new at re-type time (forced by the instrument loss) and are themselves
registered here before the pixels.

Run: `shots/cap5/`, shots `sly-key sly-closeup`, pid 3751 (coordinator-relaunched, init-rooted),
first ticket behind lock holder agx1 (3742). Expected tree at capture: 7b0e3f8 clean — confirm
from `cap5/report.json`'s commit stamp before quoting anything (KNOWN_ISSUES §10/§18 provenance
rule). SANDS_NO_HMR is set by shot.mjs since e04c9ec, so source edits cannot contaminate the run.

## T — tail verdict, on cap5/sly-closeup.png

Change under test: 44dede5 — `tuftRollW` 1.0 → 1.35, tail clump base reach 0.070 → 0.058,
band-edge boost 1.30 → 1.12, bend 0.26 → 0.34. Counts (STEP 2, six rolls) deliberately untouched.

Registered baseline (registration of record; frames + instrument lost): cap4 sly-closeup,
tail-tip INTERIOR runs/row **4.04**, same-frame torso control **3.20**, ROI adaptive threshold
landed at L39.6 — darker than the tailDark ring renders, i.e. the counted runs were hull ink,
not dark fur.

- **T1 pass:** tail-tip runs/row lands **3.1–3.7** (toward the control; the separators thin
  because a wider clump is proportionally less hull).
- **T2 fail-low:** **< 2.4** — the width overshot, locks fused; 1.35 is falsified and joins 3.40
  in the SlyModel note.
- **T3 fail-null:** **≥ 3.9** — the ink-fraction hypothesis is falsified; clump size was not the
  binding variable.
- **Barred:** contour roughness is not a criterion in any direction (outer-contour metric,
  structurally blind to lock legibility — it is what falsely justified 3.40).

### T-I — instrument transfer (new at re-type, pre-pixels)

`interiorink.mjs` is re-derived a second time, as `$SCRATCH/interiorink.mjs`, per this spec:

1. ROIs are boxes fully inside the projected tail-tip mass and the chest mass, derived from the
   CPU-skinned pose at the shot's own staging (shotsil machinery; footIK does not move tail or
   chest, so the §11 IK caveat does not bite these ROIs). Boxes and an overlay PNG go in the
   RESULT so "inside the mass" is checkable against the real frame.
2. Threshold: adaptive per ROI (Otsu over the ROI luma histogram, L in 0–255).
3. runs/row: per pixel row of the ROI, count maximal horizontal runs of L < threshold; mean over
   rows. Same code path for tail-tip and torso.
4. **Ink gate:** the threshold must land below the dark-fur mode of the ROI (the property that
   made 4.04 mean "ink"). If it lands inside the fur band instead, the instrument is not
   measuring ink — report instrument failure, not a verdict number.
5. **Control gate:** absolute bands T1–T3 transfer only if the same-frame torso control reads
   3.20 ± 0.6. Outside that, the re-derived instrument is not the registered instrument at
   absolute scale; the verdict then falls back to the ratio form (registered bands ÷ 3.20):
   tail/torso **pass 0.97–1.16**, **fail-low < 0.75**, **fail-null ≥ 1.22**, and the report says
   the fallback fired.
6. Calibration smoke test before cap5 lands, era caveat attached: run on
   `shots/cap2/sly-closeup.png` (Aug 1 19:09, b96409c dirty — pre-change tail, different era,
   NOT the baseline). Expectation: tail-tip reads above its own torso. This checks box placement
   and the ink gate against real pixels; its numbers are not comparable to cap4's.

### T-I calibration record (written 12:0x, before any cap5 pixel existed; cap5 was mid-boot/
### rendering sly-key — sly-closeup, the verdict frame, had not been captured)

The instrument as registered above was built and calibrated, with two pre-pixel refinements,
both recorded here with reasons:

1. **ROI is a rasterised, 3-px-eroded triangle mask** (tailC/tailD fur tris; chest∪spine fur
   tris), not a central AABB box: the first overlay on cap2 showed the AABB leaking background
   near the curved tip and under a prop arc crossing behind. Erosion 3 px keeps the ~2.5 px
   contour hull out of the count — "interior ink" by construction. Rows with mask span < 12 px
   are not counted.
2. **cap2 is disqualified as the pre-change reference for the tail** (kept only as an eye-state
   before): its b96409c-dirty build authored a different tail, so today's mask lands on
   yesterday's pixels — its numbers moved arbitrarily between ROI shapes (rect 2.87 → mask
   2.30) and its gates fail. No valid pre-change frame of the current tail authoring survives.

Calibration frame: `shots/agx1/sly-closeup.png` — **7b0e3f8 clean** (report stamp), rendered
11:44, same tree cap5 will render. Mask verified ON the rendered tail by overlay
(`ii-agx1-overlay.png` / `ii-agx1-tail2x.png`). Readings: tail-tip **2.52** (thr L27.5, mode
L38, gate ok), torso **2.16** (thr L23.5, mode L33, gate ok), ratio **1.168**.

Registered interpretation, fixed now: torso 2.16 is outside 3.20 ± 0.6, so the **control gate
fires and the ratio form is the verdict form** for cap5 unless cap5's own torso lands inside
the gate. The re-derived instrument's absolute scale reads ~0.7x the lost one; absolutes will
be reported but carry no verdict. Known limitation, shared with the lost instrument's physics:
in the closeup's shadowed side, dark-fur pixels near the threshold contribute runs; the gate
bounds this but does not zero it. agx1's numbers are a same-tree preview, not the verdict —
the verdict is cap5/sly-closeup.png judged by eye first, then these bands.

**T-look (binding, decided by eye at 1x and 2x before any number is quoted):** the cap4
stegosaurus read — separated near-black triangles along both tail contours plus interior chips —
should be materially reduced; locks read as a few big overlapping masses with ink around them
(aspect ~1:2.4), not plates and not thorns. If the number passes and the look does not, the look
wins and T1 is reported as not met on the frame.

## K — sly-key first frames (a121e9a; additive twelfth shot, sly-closeup untouched)

- **K1 staging sanity**, against the commit's measured predictions: full figure in frame
  (projection rows ~123..639 at 720 rows), ~81 px of ground under the boots, no clipping,
  charvis 100% visibility. A contradiction here is staging drift — check the report commit
  stamp first, then report, don't tune.
- **K2 keyed face:** the shot exists because face lighting is yaw+sun only. CPU-predicted
  key-lit-and-visible **63%** vs sly-closeup's **37%** (unshadowed 100% vs 62%). In-frame check:
  the mask/eye/muzzle region reads in the lit band, terminator crossing the head rather than the
  whole face sitting in shadow; mechanical support — matched face ROI mean L, sly-key vs
  cap5/sly-closeup (same boot, valid comparator), sly-key materially brighter.
- **K3 the raccoon read** (coordinator ledger §33; on-disk source critic-pass3 sly-closeup:
  "skull or a bird of prey, not a raccoon" — one blown eye at median L233 vs a L88 socket, 145
  apart, plus a muzzle reading as a detached pale wedge). Since that finding: scleraTint
  0.82 → 0.15 (dde0ac9) and glint 0.021 → 0.013 (b96409c), neither yet seen in a closeup-facing
  frame. Check at 2x on BOTH cap5 frames: two matched eyes inside the mask — neither eye's
  median in the clipped regime (≥ L220), iris/pupil present in both, matched 24×25 boxes
  reported; asymmetry judged within the same lighting band since a raking key legitimately
  splits the face. Muzzle attached to the eye mass, not a floating wedge. The warm key's effect
  on this read is the open question of the shot — report it as seen, favourable or not.
- **K4 warm-key palette:** mask band continuous and dark (pass3 measured L27–39 — it exists; do
  not re-add), grey/black/white raccoon scheme holding under #ffd9a0 key without the face going
  monochrome-amber. Qualitative, look first.

## Verdict rule

House rule (char10): look at both frames at 1x and 2x first, then measure. Frames are judged
only against this file; anything outside these lines is observation, not verdict. Comparators:
cap5's own two frames (same boot) primary; cap2/sly-closeup as pre-change era reference with
provenance stated; cap4 numbers are registration of record only. Any line failing goes to the
report with its owner named (T is mine; K2/K3 eye materials are mine; exposure/key colour is
POSTFX/LIGHTING's). No commits; the coordinator sweeps.
