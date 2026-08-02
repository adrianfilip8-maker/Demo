# cap5 — verdict against PREREG-cap5.md (committed copy, progress/records/PREREG-cap5.md @ c61941c)

Provenance: run `shots/cap5/` (sly-key, sly-closeup), pid 3751 (coordinator-relaunched,
init-rooted), lock acquired ~11:50 after agx1 released. PREREG re-typed and calibration record
sealed before any cap5 pixel existed; instrument `$SCRATCH/interiorink.mjs` (re-derivation #2,
mask-ROI form) frozen before the verdict frame landed. Commit stamp at capture, read directly
from `shots/cap5/report.json`: **7b0e3f8, dirty:false**, boot 2026-08-02T11:53:44Z, 1280x720
high, SwiftShader, 2 shots 0 failed, boot warnings the familiar trio, one benign 404 (matches
the g1/curated-capture line). Same tree as the agx1 preview — and the verdict numbers below
were RE-MEASURED on cap5 pixels, not carried over; they reproduce the preview exactly
(deterministic render, §1), which is itself a provenance check passed.

Confound registered before the verdict: between the lost cap4 baseline and this run, POSTFX's
AgX gamut clip (48d7e08) and other tone-affecting commits landed, so cap4-era absolute lumas
are not comparable for a second, independent reason beyond the instrument loss. The same-frame
torso control is the designed defense; the ratio form carries the verdict per the calibration
record.

52/52 clips verified present on this tree before the frames landed (§4.7 contract).

House-rule order was followed: both frames viewed at 1x, tail at 2x, faces at 3x, BEFORE any
number was taken. Crops kept: `cap5-tail2x.png`, `cap5-closeup-face3x.png`,
`cap5-key-face3x.png`, overlay `ii-cap5-overlay.png` (+`ii-cap5-overlay2x.png`).

## T — tail (verdict frame cap5/sly-closeup.png)

**T-look (binding, judged first): NOT met.** At 1x and 2x the tail reads better than the
registered cap4 description mid-length — several interior chips now merge into larger
overlapping wedge masses with ink between them, and the deeper bend (0.34) helps the sweep —
but the **tip carries a crown of separated near-black triangles**, the **underside contour is a
row of separated dark studs**, and a population of interior chips remains disconnected. The
frame still sits in the plates-and-thorns family at the tip and along both contours. Per the
seal, the look wins regardless of the number, so **T1 is not met on the frame**.

**Instrument (valid on the verdict frame):**

```
tail-tip: maskbb [798,207..906,374] 7698px eroded3 1242tris rows 159 meanW 48px
          thr L27.5  darkFurMode L38  inkGate ok   runs/row 2.52  (p10 0 p50 2 p90 5)
torso  : maskbb [594,247..621,290]  584px eroded3  256tris rows 25 meanW 18px
          thr L23.5  darkFurMode L33  inkGate ok   runs/row 2.16  (p10 1 p50 2 p90 3)
ratio tail/torso: 1.168
```

Overlay verified on the rendered frame: tail mask fully inside the raised tip mass, chest mask
on the ruff; counted ink lands on the dark wedges, not on contour hull (3-px erosion held).

**Decision path, exactly as registered:** ink gates ok on both ROIs → instrument valid.
Control gate: torso 2.16 is outside 3.20 ± 0.6 → **gate fires, ratio form carries the verdict**
(pre-registered in the calibration record; absolutes reported, no verdict weight). Ratio bands:
pass 0.97–1.16 · fail-low <0.75 · fail-null ≥1.22.

**Measured ratio 1.168 lands in the registered gap between T1-pass and T3-fail-null — outside
all three bands.** Distances: 0.008 above the pass ceiling as sealed (0.012 above the exact
3.7/3.20 = 1.156); 0.051 below fail-null (1.219). Not fail-low. Per the seal and the
coordinator's routing instruction this is **a finding, not a verdict**: no band is claimable.

Direction, stated with the instrument-loss caveat attached: the registration-of-record ratio
was 4.04/3.20 = 1.263; today reads 1.168 — ~89% of the distance to the pass ceiling, under a
re-derived instrument whose absolute scale reads ~0.7x the lost one (ratio transfer is the
seal's own fallback design, but cross-era comparison still leans on it). Consistent with the
look: mid-tail improved, tip structure unmoved. **Named residual: the tip crown and underside
stud row are separate authored structures from the band-edge clumps that `tuftRollW` widens** —
1.35 moved the clump population; it has no lever on the tip spikes. That routing (tip/underside
authoring, CHARACTER = mine) is the recommendation; 1.35 itself is neither falsified (T2 no)
nor exonerated (T1 no).

**sly-key tail, observation only (not the verdict frame):** tail-tip 2.28 with inkGate ok, but
the torso control's ink gate **FAILS** on this frame (thr L31.5 vs mode L39, margin 7.5 < 8) —
the printed 1.057 ratio is gate-invalid and carries nothing. Same composition, different
lighting broke the control ROI's histogram separation: the instrument is lighting-sensitive at
the margin, worth knowing before anyone reads cross-shot ratios.

## K — sly-key first frames

**K1 staging sanity: PASS.** charvis re-run on the live tree: sly-key **500/500 = 100.0%
visible, no blocker**; sly-closeup 100.0% (one paving contact within 15 cm, documented benign).
Full figure in frame with no edge clipping; head top ~row 125, boot bottom ~row 640 by eye
(registered prediction ~123..639), ~80 px of lit ground under the boots (~81 registered).
charview prints 484 px height for both shots — different vertex population than the
registration's row-span probe (516 px); noted, not a contradiction. The two shot defs confirm
the design: sly-key is the closeup's player+camera assembly translated +4 m in X (identical
relative camera, yaw 5.24, fov 38, tod 0.80), so the character's composition is pixel-identical
and only the cast-shadow environment changes. Measured: 86.4% of the frame differs, the eye
region differs by 3/2108 px.

**K2 keyed face: the mechanism is confirmed on the read; the registered mechanical support is
only weakly met.** At 3x, sly-key's muzzle/chin/ruff whites read warm cream in the key with the
cap-brim terminator crossing the brow — a lit face with a terminator across the head, exactly
what the shot was built to show. The closeup face sits in soft shadow with only an ear/hood rim.
Mechanical, matched head fur+ink mask (6367 px both frames, same derivation):

| | mean L | median | p75 | litFrac ≥L110 |
|---|---|---|---|---|
| cap5/sly-closeup | 72.8 | 54.9 | 104.4 | 23.8% |
| cap5/sly-key | 75.4 | 55.7 | 115.4 | 26.3% |

Mean +2.6L (+3.6%) is **not** "materially brighter" as sealed. The compression is explainable
and visible in the quartiles: the mask/ink/hood population (p25, median, and the shaded upper
face) is lighting-invariant, so the keyed gain concentrates in the bright tail (p75 +11L) and
on muzzle/chin area partly below the head-bone mask. The CPU 63/37 prediction was never given
an in-frame equivalent metric in the seal; litFrac-L110 is the frozen proxy and it moved +2.5pp
in the predicted direction. Reported as: **direction confirmed, in-frame read achieves the
shot's purpose, registered "materially brighter mean L" support not met at aggregate level.**

**K3 raccoon read: MET on both frames.** Two matched, structured eyes inside the mask in both
crops — whites in the L150–190 band, iris/pupil present in both, small painted glint (box max
L232, clipped ≥L220 fraction ≤2.3%). Neither eye's median is anywhere near the clipped regime:
left(screen) L67.5, right L124.3 against the ≥L220 bar (pass3's blown eye was median L233).
The 57L asymmetry sits within the same lighting band — the screen-left eye is the shadow-side
eye under the brim, and its box carries more mask ink; both eyes read matched in structure at
3x. Boxes reported per the instrument as built: [596,154..620,179] and [633,162..657,187] —
25×26 px (the seal's prose said "24×25"; the frozen instrument's box is 25×26, discrepancy
noted, instrument governs). Eye stats are byte-identical between the two frames — verified
genuine (composition identity + emissive-dominated eye), not a tooling error. Muzzle attached
to the eye mass in both frames; no floating wedge. The warm key's effect on the read — the
shot's open question — is **favourable**: the cream muzzle under warm light reads more raccoon,
not less. The skull/bird-of-prey read is gone from both frames.

**K4 warm-key palette: MET.** Mask band present, dark and continuous around both eyes (pass3's
L27–39 band survives; nothing re-added). Grey/black/white raccoon scheme holds under the
#ffd9a0 key; the face does not go monochrome-amber — the warm gain stays on the whites and the
ear/hood rim while the mask and fur hold their values. Observation outside the seal, for the
record only: in both frames the character's overall cast skews cool blue (the tail reads
light-blue with dark bands rather than grey) — a grade/palette question that belongs to the
POSTFX/LIGHTING side of the ledger, not scored here.

## Verdict summary

- **T1/T2/T3: no band met — registered finding.** Ratio 1.168 in the (1.16, 1.22) gap, 0.008
  above pass; T-look independently not met (tip crown + stud row). Routing recommendation:
  tip/underside spike authoring (CHARACTER — mine); `tuftRollW 1.35` stays neither falsified
  nor exonerated.
- **K1 pass · K2 mechanism confirmed, sealed mechanical support weak · K3 pass · K4 pass.**
- No commits from me; coordinator sweeps this file into progress/records/.
