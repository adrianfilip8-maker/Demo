# RESULT-attractor2 — NEITHER ink system either; the mixer survives every named-subsystem toggle, and the eroded-mask split is now mandatory

Sealed `PREREG-attractor2.md` (e97091c), run on 57f6324, tree `61de3de51735d6dc`, floor 9.
Both boots gate-clean: C-DRIFT 0 px, readbacks echo, hull traversal matched **14 shells** on
every hull condition, all CAL-2/CAL-C green.

## Outcome

```
hero      base R 0.33   nocrease R 0.33   nohull R 0.33   noink R 0.33   → NEITHER
interior  base R 0.37   nocrease R 0.37   nohull R 0.37   noink R 0.37   → NEITHER
```

Two details sharpen the exoneration:

- **`nohull` is byte-equivalent to base inside the mask** — identical mask counts (4303 /
  2811) and identical medians to the decimal. Fourteen hidden hull shells changed nothing the
  mask can see: at these distances the inverted hull contributes no pixels that carry
  texture-delta.
- **`nocrease` grows the mask** (hero 4303 → 4993, interior 2811 → 3319 — crease-ink pixels
  stop being near-identical dark in both arms and start clearing the floor) **and still moves
  the swing ≤ 0.1°.** More pixels, same answer.

My registered expectation (ink family, lean HULL) was wrong: forecast record **2/7**. The
260°-violet-partner story fit every observed constraint and is nonetheless refuted by the
toggle — which is exactly why the toggles run before any fix gets designed.

## Standing after three exonerations

Rims (≤ 0.2°), mips (offline, −11.3° at every level), ink (≤ 0.1°). The §281 attenuation
(R ≈ 0.33–0.37) reproduces bit-for-bit across two independent boots — `hero` base read
227.6°/223.9° in both runs. Whatever the mixer is, it is not a named cosmetic subsystem.

Per PREREG-attractor2 §1, the **eroded-mask split is now mandatory before any further
toggle**: `PREREG-erosion.md` seals it on the four gate-clean base pairs already captured
(two shots × two boots), separating boundary pixels — partial-coverage blends against
whatever lies behind each limb — from interior pixels. EDGE-MIX and BULK-MIX have very
different consequences: the first reclassifies D2's mid-range residue as scale behaviour to
be checked against the reference at matched character size; the second sends the hunt into
the frame-wide passes (bloom, veil, AO, tonemap).
