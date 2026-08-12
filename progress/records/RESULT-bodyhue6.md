# RESULT-bodyhue6 — PASS. The costume fix ships, six runs and three instruments after the question was first sealed

Sealed `PREREG-bodyhue6.md` (69a080c), candidate unchanged from run 5 (78e142c: −11.3°, target
218.0°), fresh frames, tree `06207c684e79dbf1`, floor 9 by the §282 rule.

## Outcome

```
sly-closeup  mask 2.08%  hueA 227.9°  hueB 218.9°  swing  -9.0°  |B-ref| 5.4°  CAL-R 2.3°  P1 PASS  P2 PASS
sly-perch    mask 1.92%  hueA 221.7°  hueB 211.1°  swing -10.6°  |B-ref| 2.4°  CAL-R 0.7°  P1 PASS  P2 PASS

CAL-1/CAL-4 coverage in [1.5, 3.0]:  2.08 ✓  1.92 ✓      CAL-2 swap took: ✓ ✓
OUTCOME: PASS
```

**`bodyMode()` default flips `'raw'` → `'fix'`** in this commit, with `?body=raw` as the escape
and the lever test re-pinned to the new default. The costume renders at 218.9° / 211.1° against
the reference 213.5° ± 6.0° — the supplied asset rendered at 227.9° / 221.7° (14.4° and 8.2°
violet of reference).

## The forecast, checked to the decimal

`PREREG-bodyhue6.md` §4 predicted, from run 5's re-masked frames: closeup ≈ 218.9°, perch ≈
211.0°. Fresh frames: **218.9°** and **211.1°**. The prediction held to 0.1°, which also
retro-validates the run-5 diagnostic: the biased mask was the only thing wrong with that run.
Forecast record: **2/4** (bodyhue4 ✓, bodyshift ✗, bodyhue5 ✗, bodyhue6 ✓).

## What is and is not claimed

- **Claimed:** at close range — the only range where the albedo governs screen hue (§281) — the
  costume now lands inside the reference band on both canonical close-ups. The close-range half
  of critic 9's D2 is resolved.
- **Not claimed:** the mid-range violet. That is §281's blue ≈ 222° attractor, a render-side
  defect the texture cannot reach (task #23, unsealed). D3 (value structure) and the render's
  saturation destruction (§277's other half) are likewise untouched.

## The arc, for the ledger

Six capture runs. Runs 1–3 voided on calibrations (two-boot mask; edge-vs-noise; existence-vs-
mass). Run 4 scored MECHANISM-ONLY and refuted the +5.6° render-shift average that had set the
−21.1° target. The bodyshift measurement then found the render's offset is per-shot and only
exists at close range, which re-derived the target to 218.0°. Run 5 was confounded by carrying
the mask floor across texture pairs (§282). Run 6 fixed the floor by rule and passed everything.
P1/P2's bands never moved across any of it — which is what makes this PASS worth shipping.
