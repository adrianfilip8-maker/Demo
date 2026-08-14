# RESULT-fxink2 — DO NOT SHIP, and V2 voids the block; but the raster-scope thesis is strongly supported: containment 36% → 87–100%, combat exactly 100%

Scored against `PREREG-fxink2.md` (df1ccea). One boot, 55 frames, 11 shots × {off, bfx0, bon,
b50, back}, no install (mechanism inert in HEAD, arms are live pokes). Scorer log
`fxink2-score.log`.

## Validity first: V2 fails on EVERY row, including the controls

`V2 readback bad` fires on all 55 rows — `off` and `back` baselines included, where the
candidate is inert and nothing can be wrong with it. Every printed field is correct for its arm
(`cut` matches, `ok=true`, `fxVis` correct); the one constant is **`maskFlag=0`**, while
`V4_maskbound` PASSES. So V2 is asserting a probe field the runner never populates.
**A bar that fails on its own controls is measuring the instrument, not the candidate** (§322).
Fail-closed still applies — nothing ships — but the arms' verdicts are **not a refutation**, and
the C numbers below are recorded as EVIDENCE, not as a scored outcome.

## The substantive numbers, and why they matter

Registered bar: `C_<shot>` containment **≥ 99%** on all eleven shots. Measured at `bon`:

```
combat    100.00%   interior  100.00%   dunes     100.00%   night      99.90%
closeup    99.88%   profile    99.76%   guard      99.18%   temple     98.69%
courtyard  98.73%   traversal  97.45%   hero       89.72%
```

The parent seal (§306, composite alpha-excess) measured **36% on hero and 60% on combat** and
was routed for exactly that leak. Moving the signal to **FX raster time** takes containment to
87–100%, and **combat — the shot the whole item exists for, the porcelain-rimmed shockwave
donut — lands at exactly 100.00%**. Seven of eleven shots clear the 99% bar outright; the misses
are hero (89.7%), traversal (97.5%), courtyard (98.7%) and temple (98.7%).

**§141.1 note, stated because the temptation is obvious:** the seal itself anticipated this —
*"a follow-up that dropped that bar would be §141.1's exact prohibition."* The 99% bar stands.
The remaining leak is a real defect to fix, not a threshold to relax.

## Disposition

Nothing ships; `TUNE.fxInkCut` stays 0. Two items for the successor seal, in order:
1. **Fix the V2 probe** (populate `maskFlag`, or drop the field from the bar if `V4_maskbound`
   already covers it) so the next run produces a scored verdict rather than evidence.
2. **Chase the residual leak where it lives** — hero at 89.7% is the outlier by an order of
   magnitude over the other ten, so the successor should crop hero's uncontained pixels first
   rather than sweeping all eleven shots again. The parent's own diagnosis (ink lines crossing
   sunlit floor decals) is the obvious first suspect, and `decalVis=false` in these readbacks
   says the decal exclusion was active — so the hero residue is something else.
