# ADDENDUM-bodyhue3 run 3 — VOID again, on a straddle guard that has no mass requirement. Three runs, three of my own guards.

Run 3 of `PREREG-bodyhue3.md` is **VOID**. No threshold is touched. The candidate is still unjudged.

## Result as scored

| shot | mask px | cov | hue A | hue B | shift |
|---|---|---|---|---|---|
| `sly-closeup` | 19 969 | 2.17 % | 228.8° | 206.3° | **−22.5°** |
| `sly-perch` | 17 746 | 1.93 % | 221.6° | 199.3° | **−22.3°** |

```
PASS  CAL-1 mask is the costume
PASS  CAL-2 swap took
FAIL  CAL-3 no straddle
VOID  P1, P2 — unevaluable behind a failed calibration
OUTCOME: VOID
```

## The ≥18 cutoff worked

The mask fell from 28 691 / 26 624 px (run 2) to 19 969 / 17 746, and the two shifts came in at
**−22.5° and −22.3°** — 0.2° apart, against −20.1°/−19.1° from run 2's edge-contaminated mask.
Excluding filtered blends made the measurement markedly more consistent, which is what it was for.

## CAL-3 is wrong, and this is the third guard of mine in three runs

The straddle test asks whether *any* pixel sits below 30° and *any* above 330°. It carries **no
mass requirement**, so a handful of outliers voids a sound measurement. Measured over the run-3
mask:

| shot | mass in 210–240° | hue < 30° | hue > 330° |
|---|---|---|---|
| `sly-closeup` | **90.4 %** | 89 px (0.446 %) | 42 px (0.210 %) |
| `sly-perch` | **96.8 %** | 58 px (0.327 %) | 44 px (0.248 %) |

The distribution is overwhelmingly unimodal — 90–97 % inside a single 30° bin — and the guard
rejected it on **131 pixels out of 19 969**. A linear median over that population is perfectly
well-defined. The guard was written to protect the median's meaning and instead destroyed a run
where the median was meaningful.

The tally is worth stating plainly rather than buried:

| run | voided by | why the guard was wrong |
|---|---|---|
| 1 | (instrument) | mask assumed one boot; `?body=` forced two |
| 2 | CAL-3 ≤ 2 % at ≤2 levels | could not tell boot noise from anti-aliased edges |
| 3 | CAL-3 no-straddle | tests existence, not mass |

Three runs, three voids, and every one of them a calibration *I* specified badly — never the
candidate. The bars that matter (P1, F1, P2, F2) have never moved and have never been evaluated.

**CAL-3 is not relaxed.** It is sealed and the run is VOID against it.

## The numbers, recorded and INADMISSIBLE

Shifts **−22.5°** and **−22.3°** sit inside P1's −21.1° ± 4.0°, and now agree with each other to
0.2°. Arm B lands at **206.3°** and **199.3°**, both below P2's 207.5°–219.5° band.

Had the calibration been sound, that pattern scores **MECHANISM-ONLY**: the rotation survives to
the frame at very nearly the authored amount, and it overshoots the target. Run 2 hinted the same
thing from a worse mask. **This is not evidence and must not retune −21.1°** — a derived constant,
corroborated to 0.1° by the original hand-authored `0x2f7fc4` = 207.8°, is not adjusted against
runs that never scored.

If it holds up under a sound instrument, the interesting question is *why* the frame overshoots —
most likely that §277's +5.6° render shift, measured as a single number, is not constant across
lighting conditions. That is a re-derivation, not a nudge.

## Run 4 — use circular statistics and delete the guard

The straddle guard exists because a **linear** median over an angle is invalid when the set wraps.
The correct fix is not a better threshold on the guard; it is to stop taking a linear median.

> Register a **circular median** (equivalently, the direction of the mean resultant vector) over
> `costumeMask`, and **drop CAL-3 entirely** — wraparound is handled by construction and there is
> nothing left for the guard to protect.

Circular statistics are the standard tool for angular data; choosing them is a correctness fix, not
a tuning decision, and it removes the failure mode rather than thresholding around it. With 90–97 %
of the mass in one 30° bin the circular and linear medians will agree closely — which is precisely
why the guard should never have fired.

P1, F1, P2 and F2 carry over **verbatim for the fourth time**.
