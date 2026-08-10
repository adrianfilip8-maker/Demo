# PREREG-bodyhue2 — the same question, on a same-boot instrument

Sealed **before** run 2 captures anything. `shots/bodyhue2/` does not exist at the time of writing.

Supersedes the *instrument* of `PREREG-bodyhue.md`. **Every threshold below is carried over from
that seal verbatim** — this is a new instrument for an unchanged question, not a re-tuned bar.

---

## 1. Why there is a run 2

Run 1 is VOID (`ADDENDUM-bodyhue-run1.md`). Its instrument assumed *only the body texture differs
between arms*, and that premise failed: `?body=` is read at module load, so the two arms needed two
page loads, and two page loads are not bit-identical. `sly-perch`'s mask came back at 24.69% of the
frame with **85.6% of it differing by ≤ 2 levels** — boot noise, not costume. §269 had already
measured 2.69% cross-boot drift on `dunes`; I built on a premise the ledger contradicted.

Nothing about the candidate was learned, and nothing about the thresholds changes.

## 2. The instrument change

`SlyModelDLRig` now attaches `mesh.userData.slySwapBodyTex(mode)` — a lazy, promise-returning
in-page swap of the body albedo that matches the original's colour space, anisotropy, wrap and
flipY, so the arms cannot differ by filtering. It is reachable by scene traversal and changes
nothing in the shipped build (the alternate texture is loaded only if the swap is called).

Both arms are therefore **two renders of one boot**, with the clock frozen (`dt = 0`, §251) and
nothing else touched between them. The definitional mask is restored:

> **costumeMask = { p : A(p) ≠ B(p) }**

- **Arm A — `raw`.** The supplied albedo. Also the same-run control (§273).
- **Arm B — `fix`.** The derived albedo, after `slySwapBodyTex('fix')`.

## 3. Shots, and why there are two rather than four

**`sly-closeup` and `sly-perch`.**

The reason is operational and is stated because it is a scope reduction: **the container has
rebuilt twice tonight, roughly hourly, reverting all non-git state to a 16:13 snapshot.** It
destroyed four overnight captures and then killed run 1 at two of four shots. A four-shot run does
not survive the window; a two-shot run does. This scope is chosen for survivability **before any
run-2 frame exists**, not after seeing which shots were inconvenient.

These two are also where the costume occupies the most frame — Sly is 72.1% and 64.7% of frame
height — so they carry the most signal per minute of a lock that may not last the hour.

`temple` and `combat` remain excluded for the reason given in `PREREG-bodyhue.md` §3: §231 measured
`temple` as 97.5% cast-shadowed, its costume renders through the shadow path, and an albedo
rotation is a claim about the key path. `hero` and `courtyard` are dropped only for the window, and
their absence must be reported as a limit on the result rather than passed over.

## 4. Registered predictions and falsifiers — carried over VERBATIM

### CAL-1 — must fire
`costumeMask` non-empty on both shots, and **≥ 0.20%** of the frame on each. Empty or trivial means
the swap did not take: **VOID**, not FAIL.

### CAL-2 — must fire
`sha(A) ≠ sha(B)` on every shot, and the runner must read back the mode the swap reported.

### CAL-3 — new, and specific to this instrument (MUST FIRE)
**Boot noise must be absent, not assumed absent.** At most **2.0%** of `costumeMask` may differ by
≤ 2 levels. Run 1's `sly-perch` was 85.6% by that measure; a same-boot pair should be ~0%. If this
fails, the swap is not the only thing changing between arms and the run is **VOID**.

*This is an addition, not a relaxation: it can only make the run harder to score. It exists because
run 1's defect was invisible to CAL-1 and CAL-2.*

### P1 — the mechanism
Median hue over `costumeMask` moves by **−21.1° ± 4.0°** from A to B, on each shot.
- **F1:** a shift outside **−10° … −32°** refutes the pre-compensation model.

### P2 — the target
Arm B's median hue over `costumeMask` is within **±6.0°** of the reference's **213.5°**.
- **F2:** outside refutes the target even if P1 passes.

### Registered outcomes
`PASS` (all calibrations, P1 and P2) · `MECHANISM-ONLY` (P1 met, P2 refuted) · `FAIL` (P1 refuted) ·
`VOID` (any calibration null).

**Only `PASS` may flip `bodyMode()`'s default off `'raw'`,** and only with the two-shot limit stated
alongside it.

## 5. Inadmissible

Run 1's numbers (`sly-closeup` 229.0° → 210.8°, shift −18.2°) are recorded in the addendum and are
**not** evidence here. They were computed over a contaminated mask flagged invalid by the straddle
guard. They cannot influence this run because every bar above was fixed in a pushed commit before
run 2 rendered a pixel.

Also out of scope, unchanged from `PREREG-bodyhue.md` §5: saturation (routed to the render by
§277), D3's value structure (§276), and the six r9 shots whose frames the rebuild destroyed.
