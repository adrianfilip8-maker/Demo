# PREREG-bodyhue4 — circular median, and CAL-3 deleted rather than re-thresholded

Sealed **before** run 4 captures anything. `shots/bodyhue4/` does not exist at the time of writing.

Fourth instrument, one unchanged question. **P1, F1, P2 and F2 carry over verbatim for the fourth
time.** Three runs have voided; no bar has ever moved, and no bar has ever been evaluated.

---

## 1. The three voids, and what each was

| run | voided by | the actual defect |
|---|---|---|
| 1 | instrument | mask assumed one boot; `?body=` is read at module load and forces two |
| 2 | CAL-3 (≤ 2 % at ≤ 2 levels) | cannot distinguish boot noise from anti-aliased edges |
| 3 | CAL-3 (no straddle) | tests *existence* of an extreme pixel, not its *mass* |

Every one was a calibration I wrote badly. None was the candidate. Run 3 voided on **131 pixels out
of 19 969** while 90.4 % / 96.8 % of the mask sat inside a single 30° bin.

## 2. The change: stop taking a linear median of an angle

The straddle guard exists only because a **linear** median over a circular quantity is invalid when
the set wraps. The fix is not a better threshold on the guard — it is to use the right statistic.

> **Registered statistic: the circular median of hue over `costumeMask`.**
> Computed by rotating the sample so its mean resultant direction sits at 180°, taking the linear
> median there, and rotating back. That is exact for a unimodal sample and is standard practice for
> angular data.
>
> **CAL-3 is DELETED.** Wraparound is handled by construction; there is nothing left for it to
> protect. This is a correctness fix, not a relaxation — and it is the reason the guard can go,
> rather than the guard going because it was inconvenient.

With 90–97 % of the mass in one 30° bin, the circular and linear medians will agree closely. That
is precisely why run 3's void was wrong, and it is also why this change cannot manufacture a pass:
the numbers it produces will be near-identical to the ones already recorded as inadmissible.

## 3. Everything else is unchanged

- **Mask:** `{ p : maxChannelDelta(A(p), B(p)) ≥ 18 }`, the cutoff derived in `PREREG-bodyhue3.md`
  §2 from the two textures alone (95 % of rotated texels change by ≥ 18 levels; p50 = 78).
- **Arms:** same-boot via `mesh.userData.slySwapBodyTex`; shot staged once, clock frozen (`dt = 0`),
  A rendered, albedo swapped in-page, B rendered.
- **Shots:** `sly-closeup`, `sly-perch`. Two-shot scope and its reason unchanged
  (`PREREG-bodyhue2.md` §3 — hourly container rebuilds). `hero` and `courtyard` remain absent and
  that remains a stated limit on any result.
- **Fresh frames.** Run 3's PNGs are on disk and re-scoring them would be free; refused for the
  same reason as before — I have seen what they produced.

## 4. Registered predictions and falsifiers

### CAL-1 — must fire
`costumeMask` non-empty and **≥ 0.15 %** of the frame on each shot.

### CAL-2 — must fire
`sha(A) ≠ sha(B)`, and the swap reports the mode it was asked for.

### P1 — the mechanism *(verbatim, 4th time)*
Circular median hue over `costumeMask` moves by **−21.1° ± 4.0°** from A to B, on each shot.
- **F1:** a shift outside **−10° … −32°** refutes the pre-compensation model.

### P2 — the target *(verbatim, 4th time)*
Arm B's circular median hue is within **±6.0°** of the reference's **213.5°**.
- **F2:** outside refutes the target even if P1 passes.

### Registered outcomes
`PASS` · `MECHANISM-ONLY` (P1 met, P2 refuted) · `FAIL` (P1 refuted) · `VOID` (CAL-1 or CAL-2 null).

**Only `PASS` may flip `bodyMode()`'s default off `'raw'`,** with the two-shot limit stated
alongside it.

## 5. The expected outcome, written down in advance

Runs 2 and 3 both pointed at **MECHANISM-ONLY** — shifts inside P1 (−20.1/−19.1, then −22.5/−22.3
agreeing to 0.2°), arm B below P2's band (210.0/205.4, then 206.3/199.3). Recording that prediction
here, before the run, so that if run 4 returns MECHANISM-ONLY it is a **confirmed forecast** rather
than a result I claim to have expected afterwards — and so that a PASS would be a genuine surprise
that deserves scrutiny rather than celebration.

**−21.1° must not be retuned** on any of it. It is derived (§277/§278: 213.5 − 5.6) and corroborated
to 0.1° by the original hand-authored `0x2f7fc4` = 207.8°. If run 4 scores MECHANISM-ONLY, the next
step is to re-derive the render's hue shift **per lighting condition** — §277 measured it as a
single +5.6° across all frames, and two runs now suggest it is not constant — and then re-seal. That
is a re-derivation from a sound measurement, not a nudge toward a bar.
