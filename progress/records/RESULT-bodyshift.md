# RESULT-bodyshift — UNDERPOWERED, and the scope limit IS the finding: albedo governs costume hue only at close range

Run sealed by `PREREG-bodyshift.md` (9890c33), instrument 6c910c7, tree `a210ff0d779dc426`.
All eleven shots captured fresh, in the registered order, none lost to rebuilds.

## The scoreboard

```
H_A 229.3°   H_B 208.2°   (circular medians; agree with the prior linear values)

sly-closeup  SCOREABLE    cov 2.17%   dS_A  -0.8°   dS_B  -1.0°   gap  0.2°   dist  3.9m
sly-perch    SCOREABLE    cov 1.92%   dS_A  -7.5°   dS_B  -8.8°   gap  1.2°   dist  3.8m
hero         NONLINEAR    cov 0.47%   dS_A  -1.7°   dS_B  +9.1°   gap 10.8°   dist  6.5m
combat       NONLINEAR    cov 0.54%   dS_A  +5.6°   dS_B +12.2°   gap  6.6°   dist  6.2m
dunes        NONLINEAR    cov 0.22%   dS_A  -2.8°   dS_B  +8.7°   gap 11.6°   dist  9.5m
interior     NONLINEAR    cov 0.31%   dS_A  -1.0°   dS_B  +8.9°   gap  9.9°   dist  6.9m
traversal    UNSCOREABLE  cov 0.11%                                dist 10.4m
night        UNSCOREABLE  cov 0.00%                                dist 13.7m
temple       UNSCOREABLE  cov 0.00%                                dist 14.0m
courtyard    UNSCOREABLE  cov 0.02%                                dist 16.4m
guard        VOID(CAL-2)  cov 0.00%                                dist  5.1m

P-S  sly-closeup  -0.8 vs -0.9 ± 2.0   PASS
P-S  sly-perch    -7.5 vs -7.9 ± 2.0   PASS
|D| = 2   range(D) = 6.7°   bar 12.0   →   VERDICT: UNDERPOWERED
P-M  MECHANISM-UNEVALUATED (|D| < 4)
P-O  temple UNSCOREABLE, combat NONLINEAR — both as predicted, 2/2
```

(`guard`'s CAL-2 label is literal: Sly is not in that frame, so the two arms rendered
byte-identical and the sha test fired before the coverage test. Under either label it
contributes nothing to D, which is the only thing that matters.)

## The verdict, and the forecast record

**UNDERPOWERED.** The sealed decision needed four shots where dS exists; the canonical set
contains **two**. I registered RENDER-DEFECT as my expected outcome — **that forecast was
wrong, 0/1** (running record: bodyhue4 1/1, bodyshift 0/1). I expected the wides to spread D
past 12.0°; instead they removed themselves from D entirely, which is a different and more
interesting failure of the question.

P-S passing 2/2 matters independently: `sly-closeup` reproduced run 4 to 0.1° and `sly-perch`
to 0.4° across fresh boots. The instrument is stable; run 4's numbers were not boot noise.

## What the classifications themselves establish

The run's real finding is not in D — it is the *pattern of exclusions*, all produced by gates
registered before capture:

- **≤ 4 m** (closeup, perch): the authored swing survives in full — CAL-R gaps of 0.2° and
  1.2° against an allowance of 2.0. Albedo governs.
- **6–10 m** (hero, combat, dunes, interior): every shot is NONLINEAR with the **same
  signature** — the 21.1° authored swing compresses to 9.6–14.5°, and the two arms are pulled
  toward a common attractor: arm midpoints 222.5° (hero), 221.7° (dunes), 222.7° (interior),
  227.7° (combat). Roughly half the costume's screen hue at mid distance comes from something
  blue at ≈ 222° that is not the albedo.
- **≥ 10 m** (traversal, night, temple, courtyard): the mask itself dies — blends fall below
  the ≥ 18 floor that PREREG-bodyhue3 §2 derived as "necessarily a filtered blend".

So the D2 complaint — "the costume reads violet" — is, across the canonical set, **majority
carried by pixels whose hue the albedo does not govern.** A texture fix, however well
targeted, can only ever move the two close-ups; run 4 already proved it moves them precisely,
and this run shows those are the only shots it can move.

## What is now known about the attractor (reported, not scored)

Whatever mixes into the costume at mid distance: it is **blue (≈ 222°)**, it acts on the
*bulk* of costume pixels (a 1-px screen edge on a 65-px character is ~6 % of its pixels and
cannot halve the median swing), and it is **present indoors** (`interior`, 6.9 m, compresses
exactly like the open-desert shots) — which argues against pure distance haze. Candidates
that fit all three: a whole-surface additive light contribution with sky-blue colour (rim /
ambient), or a haze applied without an indoor exemption. Candidates that fit none: mip
blending within the body texture (its non-costume texels are fur-brown and would pull toward
red, not blue). Distinguishing these is a measurement with its own seal — an eroded-mask
variant (score only pixels whose full neighbourhood is in-mask) separates surface effects
from silhouette effects, and a rim/ambient A/B separates the light candidates.

## What this licenses

- **No verdict on TEXTURE-VIABLE vs RENDER-DEFECT** — the sealed rule got no quorum, and no
  post-hoc substitute rule is entertained.
- **`bodyMode()` stays default `'raw'`.** Run 4's MECHANISM-ONLY still stands, now with its
  generality bounded: P1's "rotation survives the render" is true **at close range** and
  measurably false past ~6 m.
- The natural next question is the attractor's identity, sealed as above. Whether it is
  *worth* pursuing ahead of D1/D8/D12 is a prioritisation call, not a measurement.

## Cost

One run, eleven shots, six boots' worth of batches, zero voids of the run itself, zero shots
lost to rebuilds (the append-per-shot design was never needed — but the last four runs say
that was luck, not caution wasted).
