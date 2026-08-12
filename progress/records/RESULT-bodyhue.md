# RESULT-bodyhue — MECHANISM-ONLY. The rotation works; the target was derived from a contaminated average.

Run 4 of the D2 costume-hue A/B is the **first of four runs to score**. Sealed in
`PREREG-bodyhue4.md`; three prior runs voided, and no bar moved in any of them.

## Outcome

| shot | mask | cov | hue A | hue B | shift |
|---|---|---|---|---|---|
| `sly-closeup` | 20 024 | 2.17 % | 228.4° | 207.1° | **−21.3°** |
| `sly-perch` | 17 761 | 1.93 % | 221.4° | 199.4° | **−22.0°** |

```
PASS  CAL-1 mask is the costume
PASS  CAL-2 swap took
PASS  P1 mechanism (-21.1 ± 4.0)
FAIL  P2 target   (213.5 ± 6.0)      worst |hue B - 213.5| = 14.1
OUTCOME: MECHANISM-ONLY
```

**`bodyMode()`'s default stays `'raw'`.** Only `PASS` may flip it.

## P1: the mechanism is confirmed, and precisely

The albedo was rotated **−21.1°**. The frame moved **−21.3°** and **−22.0°**. An authored hue
rotation survives the render essentially intact — the shading, grade and tonemap preserve hue
*differences* at these saturations. That is worth having established: it means costume colour is
correctable at the texture, which was never certain.

This also retires the alternative that the violet bias could only be fixed in the render.

## P2: the target was wrong, and the reason is a bad average in §277

§277 derived the render's own hue shift as **+5.6°**, from critic 9's ten-frame mean (234.6°) minus
the albedo (229.0°), and §278 used it to set the target albedo at 213.5 − 5.6 = **207.9°**.

Measured per shot, per arm, the render's shift is not +5.6° and is not one number:

| shot | arm A (raw) | arm B (fix) |
|---|---|---|
| `sly-closeup` | **−0.9°** | **−1.1°** |
| `sly-perch` | **−7.9°** | **−8.8°** |

Two things follow, and the second is the important one.

1. **The sign is wrong.** On both character shots the render moves hue *toward cyan*, not toward
   violet. The +5.6° came from a ten-frame average that included `temple` (326.1°) and `combat`
   (309.5°) — the two magenta outliers §231 explains as shadow-dominated frames. Averaging them
   into a "render shift" produced a number that describes no shot.
2. **It is per-shot, and the spread is large.** −0.9° against −7.9° is a **7.0° difference between
   two frames**, both of which are daylight character shots. The albedo hue that would land the
   costume on 213.5° is therefore **214.4°** for `sly-closeup` and **221.4°** for `sly-perch`.
   **No single albedo hue puts the costume on the reference in both.**

So D2's violet bias cannot be fully corrected by any one texture rotation. A rotation can move the
costume by a known amount — that is P1 — but where it *lands* depends on the shot.

## What this does not license

- **−21.1° is not retuned to chase P2.** The constant is derived and was corroborated to 0.1° by
  the original hand-authored `0x2f7fc4` = 207.8°. What run 4 refutes is the +5.6° that fed the
  target, not the arithmetic that used it.
- **The two-shot scope is a real limit.** `hero` and `courtyard` were dropped for the hourly
  container rebuilds (`PREREG-bodyhue2.md` §3). A 7.0° per-shot spread across *two* frames is a
  lower bound on the spread across ten.
- Nothing here touches saturation (§277 routed it to the render) or D3's value structure (§276).

## The forecast, checked

`PREREG-bodyhue4.md` §5 recorded before the run: *"runs 2 and 3 both pointed at MECHANISM-ONLY …
if run 4 returns MECHANISM-ONLY it is a confirmed forecast rather than a result I claim to have
expected afterwards — and a PASS would be a genuine surprise that deserves scrutiny."*

It returned MECHANISM-ONLY. **Forecast confirmed, 1/1**, and it was cheap to make it falsifiable.

## Next, and it is not another rotation

The open question is now the render's **per-shot hue shift**, not the texture. Re-deriving a target
means measuring that shift across the canonical shots on a sound instrument — the same-boot swap
plus the ≥18 mask plus the circular median, all of which now work — and then deciding whether a
single costume hue is the right deliverable at all, or whether D2 is a render defect after
§269/§271's fashion. That is a new question and needs its own seal.

## Cost, honestly

Four capture runs to score one A/B. Three voided on calibrations I specified badly:
run 1's mask assumed one boot while `?body=` forces two; run 2's CAL-3 could not tell boot noise
from anti-aliased edges; run 3's straddle test checked existence rather than mass and voided on
131 pixels out of 19 969. The candidate was never at fault, and P1/F1/P2/F2 survived all four runs
unchanged — which is the only reason run 4's result means anything.
