# RESULT — fx9: the `courtStackBudget` family cap, verified. **Task #13 CLOSES as MET.**

Frames `shots/fx9/` (6 jobs, 15:04–15:11), scored against the acceptance sealed in
`progress/records/fx9.mjs`'s header before the frames existed.

## Instruments, stated with the numbers (§122's rule)

fx9's thresholds are **absolute lifts, not ratios**, so the convention is load-bearing:

- **`tools/roilift.mjs`** — mean luma lift over **every pixel of the rect**, no difference
  threshold at all. This is the instrument the combat targets are denominated in, and the one
  the fx8 pins were produced by, so those comparisons are like-for-like.
- **`fx5an.mjs`** (scratchpad; blob/contrast) — counts a pixel only where
  **`|ΔR|+|ΔG|+|ΔB| ≥ 4`**. Every px count and bbox below carries that threshold. Quoted
  against a different threshold these counts would move by ~1.9× (§122) without any bug.

## Provenance — the tree moved during the window and it does not matter here

GEOMETRY wrote `src/world/EgyptLevel.js` at **15:07:38** and `src/world/Kit.js` at **15:08:49**,
i.e. *between* `traversal.full` (15:07) and `traversal.noshaft` (15:08). That is §121.4's hazard
in the direction that bites — but it cannot have reached this run: `harness.mjs:54` sets
`SANDS_NO_HMR=1`, `vite.config.js:12-13` turns that into `hmr:false` + `watch:{ignored:['**/*']}`,
and the harness navigates **once** (`page.goto`, line 103) with no reload between jobs. All six
frames are therefore on the **boot-time tree**, and each pair is dt-0 within one shot
(`combat` t=0.5652 both, `traversal` 0.8486 both, `dunes` 1.1319 both). Internally coherent.

**What does span trees:** the fx8 and fx5 pins below, which were captured on earlier trees. They
are used as targets because the acceptance named them, but a cross-tree delta is not attributable
to this change alone. Where that matters I say so.

## 1. `combat` — the target. PASS, with margin.

| ROI | fx8 pin | target | **fx9** | verdict |
|---|---|---|---|---|
| left edge (0,28)-(150,355) | +29.11 | ≤ 9.5 | **+1.50** (peak +29) | PASS, 6.3× inside |
| doorway (652,95)-(821,192) | +15.95 | ≤ 5.1 | **+3.25** (peak +31) | PASS |

Probe: **`courtCap` = 0.259** against the pre-registered ≈ 0.26 (2.0/7.8 = 0.2564). The
mechanism is confirmed at the value it was predicted to take, not merely in direction.

Blade footprint (at fx5an's ≥4 threshold): **19,522 px (2.12%), mean +6.48, peak +31**, against
fx5's 39,986 px (4.34%) at +41.83, peak +122. The cream veil is gone as an artefact rather than
merely reduced; what remains reads as the doorway cone the acceptance explicitly allowed to stay.

## 2. `traversal` — the fail-safe claim. PASS, and it is stronger than a measurement.

**`courtCap` = 1.000 exactly** (smoothN 1.38 < budget 2.0), on both variants. The cap is
therefore **inert in this framing by construction**, so the change under test cannot have altered
this frame at all — no pixel comparison is even required to establish that half. Any delta
against fx5's pin is other agents' work on the intervening tree, and I do not claim it.

The beam is present and healthy on all three criteria the acceptance named: largest blob
**63,769 px, mean +46.6** (fx5 pin: 33k at +43.1), contrast **sd 19.9 → 34.1, RISING** inside the
bbox (fx5: 30.5 → 39.7). Not flattened. The blob is ~1.9× larger than the pin, which I attribute
to the intervening tree rather than to this change, for the reason above.

## 3. `dunes` — accepted cost, **and my own sealed prediction was wrong**

Predicted: the faint courtw haze "drops to roughly a quarter" of fx5's 1.13% / +7.5.
Measured: **0.88% (8,083 px) at mean +6.14** — a ~22% reduction in touched pixels, not ~75%.

The prediction failed because **it mis-attributed the dunes haze to the court family.** The
dominant blob is bbox (1037,338)-(1140,411) at mean **+7.1** — against fx5's (1012,331)-(1140,412)
at **+7.0**, i.e. essentially *unchanged* by a 4× cut to the court family, which is only possible
if it is not court family. `courtCap` is 0.25 here and the court blades did take their cut; they
simply are not what that frame's haze is made of.

Consequence, recorded rather than smoothed over: the accepted cost is **smaller than accepted**
(good), but the acceptance's model of *which* blades dominate `dunes` was wrong, so the "record,
do not chase" line should not be read as evidence that the court family drives dunes haze. It
does not.

## Verdict

**Task #13: MET. Close it.** Both combat targets pass with margin, at a `courtCap` matching its
prediction to three digits; the traversal fail-safe is exact; the dunes cost is real, accepted,
and smaller than forecast. Nothing shipped in this run — it is verification of a change already
in the tree.

Log preserved at `progress/records/logs/fx9.log` (keeplog). Not committed — reporting by
filename per instruction.
