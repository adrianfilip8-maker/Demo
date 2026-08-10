# ADDENDUM-bodyhue2 run 2 — VOID on CAL-3, a bar I mis-specified; but the instrument change worked

Run 2 of `PREREG-bodyhue2.md` is **VOID**. No threshold is touched. The candidate is not judged.

## Result as scored

| shot | mask px | cov | ≤2 share | hue A | hue B | shift |
|---|---|---|---|---|---|---|
| `sly-closeup` | 28 691 | 3.11 % | **12.01 %** | 230.1° | 210.0° | −20.1° |
| `sly-perch` | 26 624 | 2.89 % | **15.07 %** | 224.5° | 205.4° | −19.1° |

```
PASS  CAL-1 mask is the costume
PASS  CAL-2 swap took
FAIL  CAL-3 no boot noise (<=2%)
VOID  P1, P2  — unevaluable behind a failed calibration
OUTCOME: VOID
```

## The instrument change did what it was built to do

Run 1's `sly-perch` mask was 227 559 px (24.69 % of frame), **85.6 %** of it differing by ≤ 2
levels. Run 2's same-boot `sly-perch` mask is 26 624 px (2.89 %), **15.07 %** by that measure.

**Boot noise fell from 85.6 % to 15.1 %, and the mask shrank by 8.5×.** The same-boot swap is
sound. That is the one solid conclusion available from this run.

## CAL-3's bar was mine, and it was wrong

I set CAL-3 to "at most 2.0 % of the mask may differ by ≤ 2 levels", intending it to catch boot
noise. It cannot distinguish boot noise from **anti-aliased edge pixels**, where a costume pixel is
filtered against a background one and therefore changes by a small amount no matter how large the
albedo change is. That population is intrinsic and unavoidable in any same-boot run.

The proof that the residual is edges rather than noise is a coincidence I did not arrange:
**run 1's `sly-closeup` was 12.0 % and run 2's `sly-closeup` is 12.01 %** — the same figure, across
two different instruments and two different boots. Boot noise does not reproduce to two decimal
places across a boot boundary; a geometric edge population does.

So CAL-3 fired correctly on run 1's real defect (85.6 %) and then fired again on a run that had
fixed it. The guard was right to exist and wrong in its threshold.

**The bar is not moved.** It is sealed in a pushed commit and the run is VOID against it.

## The numbers, recorded and INADMISSIBLE

Both shifts — **−20.1°** and **−19.1°** — sit inside P1's registered −21.1° ± 4.0°. Arm B's hue
lands at **210.0°** (inside P2's 213.5° ± 6.0°) and **205.4°** (outside it, low by 2.1°).

Had the instrument been sound, that pattern would most likely have scored **MECHANISM-ONLY**, not
PASS: the rotation behaves as authored, and on `sly-perch` it overshoots past the reference.

This is written down and is **not evidence**. Both medians were computed over sets flagged
`STRADDLE` — the edge pixels blend costume blue into warm sand, dragging the hue set across 0/360
and making a linear median meaningless. Recording it is safe because every bar was fixed in a
pushed commit before run 2 rendered a pixel.

**It must not be used to retune the rotation.** −21.1° is derived (§277/§278: 213.5 − 5.6, and
corroborated to 0.1° by the original hand-authored 207.8°). Nudging it because a void run
overshot on one frame would be fitting the constant to contaminated data.

## What run 3 changes, and why the new cutoff is not circular

The mask must exclude filtered edge pixels. The cutoff is derived **from the two textures alone**,
with no frame measurement in it:

| texel Δ where the rotation changed anything (146 499 texels) | p01 | p05 | p10 | p50 | max |
|---|---|---|---|---|---|
| max-channel levels | 10 | **18** | 31 | 78 | 89 |

95 % of rotated texels change by **≥ 18 levels**. Therefore a frame pixel that changed by less than
18 **cannot be a fully-costume pixel** — it is necessarily a filtered blend of costume with
something else. That is a statement about the candidate texture, derivable before any frame exists,
and it is the mask predicate run 3 should register:

> `costumeMask = { p : maxChannelDelta(A(p), B(p)) >= 18 }`

This should also dissolve the straddle, since the pixels dragging hue across 0/360 are exactly the
blends being excluded.

Run 3 needs a new seal. Carry P1, F1, P2 and F2 over verbatim again; replace CAL-3 with a bar
stated against the *edge* population rather than against boot noise, and derive it, as above, from
the textures rather than from any frame.
