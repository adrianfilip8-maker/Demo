# PREREG-bodyhue6 — same candidate, the floor carried as a RULE instead of a number

Sealed **before** any run-6 capture. `shots/bodyhue6/` does not exist at the time of writing.
Candidate unchanged from run 5: `sly_body_fix.png` at −11.3° (78e142c), derivation
`PREREG-bodyhue5.md` §2. **P1, F1, P2, F2 verbatim from PREREG-bodyhue5 §4** — the bars have
never moved across six seals and do not move here.

## 1. What run 5 got wrong, and the fix

`RESULT-bodyhue5.md` ADDENDUM: the ≥ 18 mask floor was PREREG-bodyhue3 §2's *p05 of
rotated-texel deltas* computed on the −21.1° pair. Carried onto the −11.3° pair it selects a
biased, half-sized subset (arm A read 221.1° where three valid runs read 228.4°). The carry-over
should have been the rule.

> **Registered floor: p05 of the rotated-texel max-channel deltas of the CURRENT texture pair,
> computed from the textures alone.** For raw ↔ fix@−11.3° that is **9** (146 294 rotated texels,
> p50 = 42; derivation in the addendum, from the two PNGs only — no frame involved).

## 2. Gates, per shot — all must fire

- **CAL-2** — swap took: `sha(A) ≠ sha(B)`, modes echo.
- **CAL-1 / CAL-4** — coverage in **[1.5 %, 3.0 %]** of the frame. The lower bound is the guard
  that would have caught run 5 (biased masks: 0.88 %/1.06 %; every valid mask on these shots:
  1.92–2.17 %); the upper bound catches a floor low enough to sweep in background.
- **CAL-R** — arm agreement |dS_A − dS_B| ≤ **3.0°**. Widened from 2.0° with the derivation
  stated: the gap is quantisation noise that scales inversely with rotation size (0.2–1.2°
  observed at −21.1° → ~0.4–2.4° expected at −11.3°; 2.3° observed in the run-5 diagnostic),
  while the NONLINEAR signal it exists to catch starts at 6.6°. The cap stays ≥ 2.8× below that
  signal. This is an instrument-validity guard, not a candidate bar; P1/P2 are untouched.

## 3. Predictions and falsifiers

### P1 — mechanism *(verbatim, sixth seal)*
Circular median hue moves **−11.3° ± 4.0°** from A to B, on each shot. **F1:** outside refutes.

### P2 — target *(verbatim, sixth seal)*
Arm B's circular median within **213.5° ± 6.0°**, on each shot. **F2:** either shot outside
refutes offset stability.

### Registered outcomes
`PASS` · `MECHANISM-ONLY` · `FAIL` · `VOID`, as in PREREG-bodyhue5 §4, including:
**PASS — and only PASS — flips `bodyMode()`'s default to `'fix'`**, `?body=raw` remaining, lever
test updated in the same commit, claim scoped to close range with §281 open.

## 4. The expected outcome, written down in advance — with its provenance disclosed

**PASS**, and this time the prediction is unusually strong because it comes from run 5's own
frames re-masked at floor 9 (the quarantined diagnostic): closeup ≈ **218.9°** (5.4° in-band),
perch ≈ **211.0°** (2.5° in-band), swings ≈ −9.0° / −10.4°. Those numbers were computed after
seeing run 5's frames, which is why they are a *forecast for fresh frames* here rather than a
result there. Cross-boot median drift on these shots has measured ≤ 0.4°, so a fresh capture
landing more than ~1° from the forecast would itself be informative. If P2 nevertheless fails on
fresh frames, the diagnostic was fit to boot noise and the fresh numbers win — F2 is scored on
the fresh frames alone, with no appeal back to the diagnostic.

Forecast record to date: 1/3.
