# PREREG — tail tip crown + underside stud row: authoring change (task #19, SRC-FROZEN prep)

Sealed BEFORE any implementation edit exists. Tree at prep time: f026ef3. No src file has
been touched; the change below is designed on paper against SlyModel.js as read at f026ef3.
Implementation is gated on the coordinator lifting the freeze (goldhalo/bud35 seal-tree
integrity).

## What is being fixed (cap5 verdict residual, RESULT-cap5.md)

T-look failed on two named structures that `tuftRollW` has no lever on:
- **tip crown**: the 4-lock radial tip fan (`_buildTufts`, "Tip fan" block, ~l.2714) — four
  `furDark` locks on one ring with perp 0.30 divergence, separated by construction; renders
  as a crown of separated near-black triangles on the raised tip.
- **underside stud row**: the roll-ring rows' underside sector. Rolls |roll0| ∈ {1.9, 2.5}
  exist only in alternating ring sets (l.2666-2668), so each underside roll line appears at
  every OTHER station; along the lower contour the clumps are isolated dark studs.

The mid-tail interior now reads as merged overlapping wedge masses (cap5's own read) — that
recipe (lay-back + overlap in the measured axis + midpoint colouring) is what both fixes
transfer.

## The authoring change (design, to implement post-freeze)

**A — tip fan → merged terminal lock** (replaces the 4-lock loop, same `put()` helper):
3 wedges laid nearly along the tip tangent, bases STAGGERED along −tipT (−0.010, −0.050,
−0.090), perp component 0.30 → 0.10 with small azimuth offsets (±0.35 rad) biased to the
down-swept side; lengths 0.085/0.065/0.050·G descending, widths 0.048/0.042/0.036·G,
bend 0.30, group furDark, weights tailD. Overlap arithmetic (the leg/forearm discriminator):
base spacing along tipT 0.040·G vs reach 0.050–0.085·G → spacing/reach 0.47–0.80, inside
the proven fur band (≤1.2); the current fan is one ring diverging at perp 0.30 = separated
by construction. Cost −1 clump (−18 tris).

**B — underside rolls: every station + lay-back** (roll-ring loop):
(1) both ring sets carry the underside pair — append the mirrored {±1.9, ±2.5} so underside
lines appear at EVERY station (along-contour spacing halves); (2) for |roll| > 1.7 the clump
`dir` outward component drops 0.46 → 0.30 (the exact leg-row change: scallop in the band,
not a protruding stud). Cost +2 clumps × ~16 stations ≈ +32 clumps ≈ +576 tris (~+4% of the
14.5k body) — stated, not hidden; if budget pushback comes, the trade offered is dropping
the near-top 0.14 roll, NOT re-thinning the underside.

Non-binding prose intent (per §26.2 marked as such): tip reads as one dark tapering point
with a ragged edge; underside reads as overlapping scallops.

## Instrument (frozen at this seal)

`$SCRATCH/taillobes.mjs` — contour depth-lobe counter, thresholds fixed in the file header
(thr = dark-half Otsu on erode-3 interior; lobe = smoothed depth ≥8 run with peak ≥10,
bounded by ≤3, arc width 4–80; strips tip/under/top/side as defined there). CALIBRATED on
cap5 pixels before this seal; overlay verified by eye (tl-tail2x.png: markers sit on the
actual crown spikes and studs). The sealed cap5 ratio instrument
(`interiorink.mjs`) is NOT modified and also runs on the verdict frame.

Calibration record (existing frames, measured before this seal):

```
                       tip lobes  under lobes  top lobes  under meanDepth  tip meanDepth
cap5/sly-closeup           2          7            3           4.1px           2.3px
cap5/sly-key               2          7            4           4.2px           2.0px
```

Lighting stability: tip and under counts identical across the two lightings; top flips 3↔4
(one marginal lobe) — top is therefore NOT a verdict strip, reported as observation only.

Instrument-scale caveat, carried per the calibration record: the re-derived interiorink
reads ~0.7x the lost instrument's absolute scale; only the ratio form carries verdicts.
taillobes is NEW — no cross-era comparability is claimed for it; its baselines are the cap5
numbers above and nothing earlier.

## Verdict procedure

Capture (post-freeze, after the fix lands): `sly-closeup` + `sly-key`, 1280x720, one boot —
working name cap6. Verdict frame: **cap6/sly-closeup**. sly-key is observation-only (the
torso ink gate is known lighting-fragile there). House rule first: view 1x, tail 2x, before
any number. 52/52 clips verified present before capture.

## Registered bands — every metric partitions its whole outcome line (§26.1)

**T-tip (tip lobes, integer ≥ 0):**
- PASS: {0, 1}
- FAIL-unmet: [2, ∞)

**T-under (under lobes, integer ≥ 0):**
- PASS: [0, 2]
- IMPROVED-not-met: [3, 5] — direction right, verdict not claimable; routes to a second
  authoring iteration on the same structures.
- FAIL-unmet: [6, ∞)

**Deletion guards (gates, not adjectives — a PASS band may only be claimed if both hold):**
- under meanDepth ≥ 3.5 px (baseline 4.1; merging must not thin the band away — a bare
  contour would also count 0 lobes and is NOT the fix)
- tip meanDepth ≥ 2.0 px (baseline 2.3)
Gate failure = no T verdict; result routes as "band removed — authoring regression", a
named outcome, not a judgment call.

**Ratio hold (sealed interiorink, ratio tail/torso, real ≥ 0):** the fix does not target
this number; it must not destroy it.
- REGRESSION-FAIL: [0, 0.75)
- LOW-BUFFER: [0.75, 0.97) — interior ink thinned; finding, routes to tuftDensity/length,
  T verdict still readable from lobes
- HOLD-PASS: [0.97, 1.16]
- HIGH-BUFFER: (1.16, 1.22) — cap5-family value (1.168 lives here); acceptable hold
- FAIL-NULL: [1.22, ∞)
Instrument-validity rule unchanged: ink gate failure on either ROI = ratio carries nothing
(pre-registered instrument failure, not an outcome).

**T-look (binding, judged first, as in cap5):** scored BY the lobe bands above — that is
the §26.2 fix: the adjective ("separated") now has a frozen mechanical form, so look and
number cannot diverge the way K2's "materially brighter" did. Any residual prose impression
is recorded as observation, non-binding.

## Outcome routing

- Both PASS (+gates): tip/underside authoring closes; residual tail work (if any) routes to
  whatever the next critic pass names.
- T-under IMPROVED + T-tip PASS: ship, iterate underside density one step (rolls ±1.62 lay-back).
- Any FAIL-unmet with gates ok: the specific structure's redesign was insufficient — named
  next lever: tip = extend spine cap geometry itself (terminal cone), underside = midpoint
  colouring review for the scallop band.
- Gate fail: revert the offending half, keep the other if its bands pass.
