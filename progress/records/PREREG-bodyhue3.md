# PREREG-bodyhue3 — same question, same bars, a mask that excludes filtered edges

Sealed **before** run 3 captures anything. `shots/bodyhue3/` does not exist at the time of writing.

Third instrument for one unchanged question. **P1, F1, P2 and F2 are carried over verbatim for the
third time.** Two runs have now voided and no bar has moved.

---

## 1. Why there is a run 3

- **Run 1** (`ADDENDUM-bodyhue-run1.md`) — VOID. `?body=` is read at module load, so its arms
  needed two page loads, and two page loads are not bit-identical. `sly-perch`'s mask was 24.69% of
  frame with **85.6%** of it differing by ≤ 2 levels.
- **Run 2** (`ADDENDUM-bodyhue2-run2.md`) — VOID. The same-boot swap fixed that (boot noise
  85.6% → 15.1%, mask 8.5× smaller), but CAL-3's 2.0% bar was **mine and mis-specified**: it cannot
  tell boot noise from anti-aliased edge pixels, and edges are intrinsic to any same-boot run.

Run 2's own evidence for that: `sly-closeup` measured **12.0%** in run 1 and **12.01%** in run 2 —
the same figure across two instruments and two boots. Noise does not reproduce to two decimals
across a boot boundary; a geometric edge population does.

## 2. The mask, and why its cutoff is not fitted

Both previous masks were "any pixel that differs at all", which necessarily includes pixels where a
costume texel is filtered against a background one. Those pixels change by a small amount however
large the albedo change is, and they are also what drags the hue set across 0/360 and triggers the
straddle guard.

The cutoff is derived from **the two textures alone**, with no frame measurement in it. Differencing
`sly_body.png` against `sly_body_fix.png` over the 146 499 texels the rotation changed:

| percentile of max-channel Δ | p01 | p05 | p10 | p50 | max |
|---|---|---|---|---|---|
| levels | 10 | **18** | 31 | 78 | 89 |

95% of rotated texels change by **≥ 18 levels**. Therefore a frame pixel that changed by less than
18 **cannot be a fully-costume pixel** — it is necessarily a filtered blend. Registered predicate:

> **costumeMask = { p : maxChannelDelta(A(p), B(p)) ≥ 18 }**

This is a statement about the candidate texture, computable before any frame exists. It is not
chosen to make a number come out — and it cannot be, because P1 and P2 are unchanged.

**It also subsumes the boot-noise guard.** Boot noise measured ≤ 2 levels; the cutoff is 18. CAL-3
therefore no longer needs to police noise, and is restated below against the thing that can still
go wrong: a cutoff that leaves nothing to measure.

## 3. Arms — unchanged from run 2

Same-boot, via `mesh.userData.slySwapBodyTex`. Shot staged once, clock frozen (`dt = 0`), arm A
rendered, albedo swapped in-page, arm B rendered. Shots: **`sly-closeup`, `sly-perch`** — the
two-shot scope and its reason (hourly container rebuilds; see `PREREG-bodyhue2.md` §3) are
unchanged, and `hero`/`courtyard`'s absence remains a stated limit on any result.

**Fresh frames.** Run 2's PNGs are still on disk and re-scoring them under this predicate would be
cheaper. It is refused: I have already seen the hue medians those frames produced under the old
mask, and re-scoring seen frames under a predicate sealed afterwards is a weaker claim than a
sealed capture, however sound the cutoff's derivation. Run 3 re-renders.

## 4. Registered predictions and falsifiers

### CAL-1 — must fire
`costumeMask` non-empty and **≥ 0.15%** of the frame on each shot. (Lower than run 2's 0.20%
because the cutoff necessarily shrinks the mask; this is a *different quantity*, not a relaxed one —
run 2's bar applied to an all-differences mask that no longer exists.)

### CAL-2 — must fire
`sha(A) ≠ sha(B)`, and the swap reports the mode it was asked for.

### CAL-3 — must fire, restated
**No straddle.** Neither arm's hue set over `costumeMask` may contain both a value < 30° and a value
> 330°. A linear median over a circular quantity is meaningless if it wraps, and both previous runs
tripped this. If it still straddles after the cutoff, the mask is still not the costume: **VOID**.

### P1 — the mechanism *(verbatim)*
Median hue over `costumeMask` moves by **−21.1° ± 4.0°** from A to B, on each shot.
- **F1:** a shift outside **−10° … −32°** refutes the pre-compensation model.

### P2 — the target *(verbatim)*
Arm B's median hue over `costumeMask` is within **±6.0°** of the reference's **213.5°**.
- **F2:** outside refutes the target even if P1 passes.

### Registered outcomes
`PASS` · `MECHANISM-ONLY` (P1 met, P2 refuted) · `FAIL` (P1 refuted) · `VOID` (any calibration null).

**Only `PASS` may flip `bodyMode()`'s default off `'raw'`,** and only with the two-shot limit stated
alongside it.

## 5. Inadmissible, and one thing explicitly forbidden

Run 2's numbers (shifts −20.1°/−19.1°, arm B 210.0°/205.4°) are recorded in its addendum and are
**not** evidence here — both medians came from straddle-flagged sets. Every bar above was fixed in a
pushed commit before run 3 rendered a pixel, so having seen them cannot move anything.

**The −21.1° rotation must not be retuned.** It is derived (§277/§278: 213.5 − 5.6) and corroborated
to 0.1° by the original hand-authored `0x2f7fc4` = 207.8°. Run 2 hinted it overshoots on `sly-perch`;
that hint comes from a void run over a contaminated mask, and fitting a derived constant to it would
be the §141.1 move in its purest form. If run 3 returns MECHANISM-ONLY, the target is re-derived
from a *sound* measurement and re-sealed — not nudged.
