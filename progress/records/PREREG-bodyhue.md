# PREREG-bodyhue — does the −21.1° albedo rotation actually put Sly's costume on the reference hue in a FRAME?

Sealed **before** the candidate capture exists. Nothing in `shots/bodyhue/` at the time of writing.

---

## 1. What is being tested, and why it is not already answered

`?body=fix` ships (default OFF, `d5f0311`). Everything established about it so far is measured on
the **texture**: a pure HSV rotation of −21.1° over the costume-blue window, 146 511 texels moved,
saturation and value unchanged to 0.0000, median hue 229.3° → 208.2° (`tests/slybody.test.mjs`).

None of that is a claim about a rendered frame, and the whole point of §277/§278 is that the render
adds violet of its own. So the open question is exactly one step long: **does an albedo rotated by
−21.1° render at the reference's 213.5°?**

Flipping `bodyMode()`'s default is gated on this run and on nothing else.

## 2. Instrument — a definitional mask, no ROI and no colour predicate

An earlier attempt of mine to isolate the shirt with a hue/saturation predicate **failed its own
sanity check**: it selected 42.8% of `hero` — sky, shadowed stone and haze, not a costume — and the
numbers were discarded. That failure is why this run uses no predicate at all.

Only the body texture differs between arms, so:

> **costumeMask = { p : A(p) ≠ B(p) }**

is exactly the set of pixels the costume texture reaches, with no threshold to choose and no way to
accidentally select the sky. Hue is then measured over that mask, separately in each arm.

- **Arm A — `?body=raw`.** The supplied albedo. This is also the same-run control (§273): the
  baseline is captured in this run, not read from `shots/r9`, seven tenths of which no longer exist.
- **Arm B — `?body=fix`.** The derived albedo.

Both arms in **one boot per shot**, `dt = 0` (§251), one `withGame` so the FIFO is taken once and
the tree cannot move between arms. `BODY_MODE` is read at module load, so each arm needs its own
`page.goto` with the query param — the same shape `?face=` A/Bs already use.

**Shots:** `sly-closeup`, `sly-perch`, `hero`, `courtyard`.

## 3. Scope, with its provenance stated rather than buried

`temple` and `combat` are **excluded from gating, deliberately, and I knew they were outliers when
I chose to exclude them** — critic 9's D2 table has them at 326.1° and 309.5° against a 224–251°
cluster. The exclusion is not "drop the inconvenient rows"; it rests on a mechanism established
independently of this run: §231 measured `temple` as a roofed hypostyle hall with **97.5% of it
cast-shadowed**, so `key = ramp · sh` is zero almost everywhere and the costume there is rendered
through the shadow/ambient path rather than the key path. An albedo rotation is a claim about the
key path.

They are therefore **not captured** in this run rather than captured and discarded, and no number
from this run may be quoted about them. If the fix ships, their behaviour is a separate question
owned by the enclosure/shadow work.

## 4. Registered predictions and falsifiers

### CAL-1 — must fire

`costumeMask` is non-empty on all four shots, and covers **≥ 0.20%** of the frame on
`sly-closeup` and `sly-perch` (where Sly is 72.1% and 64.7% of frame height). An empty or trivial
mask means the lever did not take effect and the run is **VOID**, not FAIL — the most likely cause
being that `?body=` was not read at module load.

### CAL-2 — must fire

Arm A and arm B must **differ** (`sha(A) ≠ sha(B)`) on every shot. Identical arms mean one page
never received its query param.

### P1 — the mechanism: does the authored rotation survive to the frame?

Median hue over `costumeMask` moves by **−21.1° ± 4.0°** from A to B, on each gated shot.

- **F1:** a shift outside **−10° … −32°** refutes the pre-compensation model — it would mean the
  albedo→frame hue mapping is not order-preserving at these saturations, and the whole "rotate the
  albedo by the deficit" approach is wrong regardless of where it lands.

### P2 — the target: does it land on the reference?

Arm B's median hue over `costumeMask` is within **±6.0°** of the reference's **213.5°**.

- **F2:** outside that band refutes the *target* even if P1 passes, i.e. the rotation behaves as
  authored but 207.9° was the wrong albedo to aim for.

P1 and P2 are separate on purpose. P1 can pass while P2 fails (mechanism sound, target mis-derived)
and that is a materially different outcome from both failing.

**Tolerances, derived not chosen.** ±4.0° on P1: hue quantisation at these saturations is under 1°,
and the residual is per-shot lighting variation — critic 9's own eight non-outlier frames span
224.3–251.2°, a 26.9° spread, of which ±4° is a conservative fraction. ±6.0° on P2: the same
variation, plus the 5.6° render shift being a single number applied to four different lighting
conditions.

### Registered outcomes

`PASS` (CAL-1, CAL-2, P1 and P2 all met) · `MECHANISM-ONLY` (P1 met, P2 refuted) ·
`FAIL` (P1 refuted) · `VOID` (either calibration arm null).

**Only `PASS` may flip `bodyMode()`'s default off `'raw'`.** `MECHANISM-ONLY` means re-deriving the
target and a new seal, not adjusting this one (§141.1).

## 5. What this run cannot say

- Nothing about **saturation**. §277 routed D2's saturation collapse (0.06–0.66 against 0.909) to
  the render, and no albedo change addresses it. If arm B's saturation is still low, that is
  expected and is not a failure of this candidate.
- Nothing about **D3** (the airbrushed value structure, §276). The rotation leaves value at 0.0000.
- Nothing about `temple` or `combat` — see §3.
- Nothing about the other six r9 shots, whose frames were lost in the 01:12 container rebuild and
  which are not being re-captured here.
