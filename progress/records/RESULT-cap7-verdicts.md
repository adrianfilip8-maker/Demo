# RESULT — cap7 verdicts: `heroline` PASS-with-a-divergence, `tailcone` on its own re-shoot boundary

Capture A, pid 26240, launched 16:04:07, `hero` + `sly-closeup` + `sly-startle` → `shots/cap7/`,
1280×720, `--q high`. Scored against `PREREG-heroline.md`, `PREREG-tailcone.md` and
`SPEC-startle-pupils.md`.

## Provenance — the report stamps a different sha than the one I was given, and it does not matter

`report.json` records **`6fc9e51`, dirty false**. The tree I was told was captured is `528ee54`.
Checked rather than assumed: `git diff --stat 6fc9e51 528ee54` is **`KNOWN_ISSUES.md` only, 1 file,
+26/−1**, and `-- src/` is empty. The captured `src/` is byte-identical to HEAD's, so both verdicts
stand on the tree they were sealed against. Recorded because §10's lesson is that a sha mismatch
gets explained away comfortably, and the cheap check is the one that earns the right to ignore it.

**A harness fact worth carrying:** `shot.mjs` writes `report.json` **after each shot**, not once at
the end. A monitor whose exit condition is "report.json exists" fires on the first frame and calls
a three-shot capture complete. Mine did, at 8 minutes into an ~19-minute run. Wait on the **pid**,
or on all N frames — not on the report. Same family as §11: the artefact existed, and its existence
meant something other than what its reader assumed.

Timing for planning: `hero` alone took **371.8 s** at 1280×720 `--q high` — 6.2 min/shot, not 2–5.

---

## `heroline` — all four bands PASS on their predicted values, and the binding look criterion fails

`silmerge.mjs` (frozen at the seal, `progress/records/`), `hero`, 720 rows, run against the
post-change tree. **Every band reproduced its sealed prediction to the digit.**

| metric | baseline 4d9bb82 | predicted | measured | band |
|---|---|---|---|---|
| H1 hook % of union outline | 5.5% | 9.1% | **9.1%** | PASS [8.0, 100] |
| H2 hook boundary buried | 41.2% | 24.7% | **24.7%** | PASS [0, 30] |
| H3 hook aperture | 0.235 | 0.492 | **0.492** | PASS [0.35, 0.85] |
| H4 neck background channel | 5 px | 12 px | **12 px** | PASS [8, ∞) |

Deletion gates, all holding:

| gate | threshold | measured |
|---|---|---|
| tail share of union outline | ≥ 17.0% | **17.9%** |
| head+cap **cluster** burial | ≤ 42.0% | **38.6%** |
| visible hook | ≥ 150 px | **242 px** |
| cane tip model y ≥ lowest boot y | — | **0.059 ≥ −0.061** |
| 52/52 clips, `missing []` | — | **52/52, `[]`** |

### H-look: clause 1 passes, clause 2 fails, and the seal has no routing for that state

The criterion is two clauses. Judged first, before the table, per the house rule — `hero` at 1×,
figure at 6×, then 12× on the head.

- **"identifiable as an open C with visible background inside its curve" — PASS, unambiguously.**
  In the captured frame at 12× the crook is a clean open C with tan background legible inside it.
  The parts raster shows the same. The capture does not falsify the offline result; it confirms it.
- **"traceable to its own shaft without crossing the torso mass" — FAIL, measured.**

I nearly scored clause 2 off `silmerge`'s `HOOK->SHAFT connected in silhouette: true`. That flag
does not test this clause: `connectedHookShaft()` flood-fills through `inSil()`, i.e. through **any**
silhouette pixel, body included. Its own comment states the stricter intent ("a crook severed from
its own shaft by the body reads as two unrelated marks") while the code implements the looser test.
So `true` there is not evidence for the clause — it is compatible with the cane being severed.

`$SCRATCH/canetrace.mjs` walks **cane pixels only**, on the same parts raster the bands were scored
on, so the two cannot disagree about their input:

```
H-look clause 2 — hook traceable to shaft through CANE pixels only: NO (severed by the body)
nearest hook->shaft gap: 16.51 source px   (ink shell bridges ~5 px => would NOT bridge)
```

In `perch_idle` the crook sits on one side of the crouched torso and the shaft emerges on the other;
16.5 px is far outside what the inverted hull closes. **The seal asserts "the look criterion is
mechanical so it cannot diverge from the bands." It has diverged** — four bands at their predicted
values to the digit, one binding look clause failing by 3× the bridging distance. The seal defines
no routing for this state because its author believed the state impossible, so I am **not** claiming
PASS on my own authority and not reverting either.

Two things that bound how much this matters, both stated as observation (non-binding per the seal):

- It is specific to `perch_idle` at 120 px. In `sly-closeup` the same cane reads as one continuous
  hooked stick, crook to ferrule, with nothing severing it.
- Clause 2 may simply be too strict as written: a character holding a cane across a crouched body
  occludes its middle in any pose. That is a criticism of the criterion, not a defence of the frame,
  and it is the coordinator's to rule on — which is why it is flagged rather than reinterpreted.

**Direction is not in doubt.** Baseline had the crook as a bump on a grey mass (5.5% outline, 41.2%
buried, aperture 0.235); it is now an open C owning 9.1% with a 0.492 aperture, and it reads at 12×.

---

## `tailcone` — T-tip lands exactly on the `{2}` boundary the seal pre-registered as "re-shoot"

`taillobes.mjs` and `interiorink.mjs`, both unmodified, on `shots/cap7/sly-closeup.png`.

| metric | cap6 baseline | measured | band |
|---|---|---|---|
| **T-tip lobes** | 3 | **2** | **IMPROVED-not-met `{2}`** |
| T-under lobes | 5 | **5** | HOLD [3, 5] — undamaged |
| tip meanDepth | 2.8 | **2.2** | gate ≥ 2.0 — holds, by 0.2 |
| under meanDepth | 4.5 | **4.5** | gate ≥ 3.5 — holds |
| interiorink ratio | 1.077 | **1.139** | gate [0.97, 1.22] — holds |
| character tri delta | — | **+180** | gate ≤ +400 — holds, exactly as predicted |

`sly_body` 16004 → 16094 (+90) and `sly_outline` likewise (+90): the ×2 ink-shell multiplier landed
where the seal said it would.

**I am not routing this, because my own seal says not to.** T-tip = 2 is precisely the `{2}` band,
and both the seal's §28 caveat and the coordinator's instruction say: *re-shoot before routing on it
rather than treating the boundary as decided* — lobe counting is count-family (§30), the statistic
class phase noise dominates, and this is a cross-boot comparison. So the named next lever
(shortening the wedges to 0.045/0.035/0.028) is **not** being taken on this evidence.

Two observations that make the re-shoot more informative, not less (non-binding):

- **T-look PASSES.** At 3× and 6× the distal end terminates in one clear apex with ragged fur along
  its edges and no second spike of comparable length. The cone is doing its job.
- **Neither counted lobe is at the apex.** On the overlay both green-boxed tip lobes sit on the
  contour's right flank; the apex is between them and is single. At cap6 a "tip lobe" was a
  competing terminal spike, because the wedges *were* the tip. Now the wedges sit inside the cone
  and ripple its edge — which is what the change was designed to make them do — and the metric
  counts those ripples with the same procedure and the same name. **The number-generating procedure
  is unchanged while the object it counts has changed**, so cap6's 3 and cap7's 2 are not strictly
  commensurable. That is a §11-family caveat on the instrument, and it argues the re-shoot should
  also settle whether the tip strip should exclude wedge-authored ripples.
- tip meanDepth fell 2.8 → **2.2** against a 2.0 gate. It holds, but the cone did thin the tip and
  there is 0.2 of margin left. The re-shoot should re-read this alongside the lobe count; if it
  drops below 2.0 the seal's routing is explicit (revert the wedge shortening, keep the cone).

---

## Two unsealed implementation details, put in the record as requested

Both are load-bearing for a seam-free cone, neither touches the tube's `t`, bands or ramp — which
was the design's whole point.

1. **The cone inherits the tube's last ring frame instead of re-calling `frames()`.**
   `frames()` is a parallel transport: a fresh call starting at the tip would arrive at an
   **arbitrary roll** about the tail axis and rotate the (lumpy, super-elliptical) cross-section
   against the ring it is supposed to continue, producing a visible twist at the join. The cone
   takes `T`/`R`/`U` from `spine[n−1]` and reuses that one frame for all four rings — valid because
   the cone is straight. It also freezes the tube's `t = 1` cross-section shape, since radius
   continuity alone would still leave a kink where the lump and super-ellipse deform the ring.

2. **`capEnd` flipped to `false` on the main tail tube.**
   The cone's base ring *is* the tube's end ring — same centre, same radius, same cross-section,
   same smoothing group — so they weld into one and the join has neither a hole nor a shading seam.
   Keeping the flat cap as well would bury a disc of **backward-facing** triangles inside the cone,
   and because `toGeometry` welds by position the disc's rearward normals would be averaged into
   the rim it shares, tipping the taper's shading back on itself.

---

## `sly-startle` / pupils — endpoint only, no Δ

Per instruction, **no Δ computed**: the minuend does not exist until Capture B (`sly-startle` with
the pupil `sc:` keys neutralised). This capture supplies the **verdict** endpoint (keys active) only.
See `NOTE-catchlight-attribution.md` for why the right-eye glint attribution rides on the same pair
and why no eye geometry change may land between A and B.

**The requested framing landed and its prediction is confirmed.** `tools/eyefacing.mjs` on the
captured shot def:

| | predicted | measured |
|---|---|---|
| left eye | 0.907 / 98 px | **0.908 / 97.6 px** |
| right eye | 0.920 / 102 px | **0.920 / 101.5 px** |

The two eyes are within **0.012** dot (predicted 0.013), and the previously 47°-off-axis eye went
from 0.684 / 33.8 px to 0.920 / 101.5 px — 3× its pixels. A single catchlight bar is now a fair test.

**Verdict endpoint, keys ACTIVE** — `interiorink --eyes`, `shots/cap7/sly-startle.png`. Note the
tool's screen-left/right are the anatomical mirror of `eyefacing`'s L/R; boxes given so B can be
differenced against exactly these:

| eye (screen) | box | median | p95 | **glintMax** |
|---|---|---|---|---|
| left  (anat. R) | [585,219..609,244] | L90.9 | L93.6 | **L102.7** |
| right (anat. L) | [680,222..704,247] | L90.6 | L93.4 | **L135.7** |

Looked at, at 8×: both pupils are small dark ovals in large pale sclera discs, and **each carries a
visible catchlight** — a few px, at the top of the pupil. The catchlight survives the constriction.

Two cautions attached to those numbers, neither of which I am resolving here:

- The SPEC's guard is `glintMax ≥ L180` **both** eyes. Measured **102.7 and 135.7 — both below.**
  That is recorded, not scored: the guard was written against the *calibration* pairing, and with no
  minuend the number cannot yet distinguish "the constriction dimmed it" from "this framing and
  grade put both eyes here anyway". Capture B is exactly what separates those.
- **cap6's 198.8 / 121.9 are not commensurable with these.** The camera was deliberately moved
  between cap6 and cap7 — that was the point of the framing request — so a cap6→cap7 glint
  comparison spans a changed variable. Anyone reading "the glint fell from 198.8 to 135.7" as a
  regression would be making §18's mistake against a baseline that was intentionally superseded.

**One instrument misfire, recorded so its number is not quoted.** `interiorink` run on
`sly-startle` prints `tail-tip … inkGate FAIL … ratio 0.582`. Its tail ROI resolves to
`[550,142..704,398]` on this pose+framing, which is **over the head and face**, not the tail — the
`hurt` pose and the new lens put the tail outside the box the tool calibrates on `sly-closeup`.
It is the §11 shape again (a correct computation about the wrong surface). The tailcone gates are
registered on `sly-closeup`, where the ratio is 1.139 with both ink gates ok. **0.582 means nothing
here and is not a tailcone regression.**

---

## Outside my ownership, observed in these frames

- **The frame is two-tone cold-grey against warm tan; stone does not read as gold sandstone.** I
  first wrote this up as a new catastrophic palette failure. Checked before reporting: cap7's
  architecture band means R/B **1.187** against `tx7`'s **1.310** — cooler, but the same
  two-tone-with-no-middle signature §3 already documents at length, not a new defect. Owner remains
  SHADING/LIGHTING/POSTFX. Recorded this way because §3's own warning is that this exact frame
  produces confident wrong diagnoses.
- **Fur on the limbs is still a smooth tube, and this one is mine.** At 4× the leg's front contour
  is a clean unbroken line; the dark markings on arms and legs are flat, hard-edged **colour**
  patches that read as camouflage blotches, not as clumps breaking the outline. The tail, cheeks and
  chest do break their outline. §9's "fur improved, not proven at close range; arms and legs are
  still fairly smooth tubes" is still exactly true, and §7.3's fur condition is **not** closed.
  Not actionable this window under the no-src-edits rule.
