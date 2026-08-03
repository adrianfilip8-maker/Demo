# PREREG-tone1 — the AgX highlight shoulder (task #32)

Sealed before the `tone1` capture boots. Owner: SHADING/POSTFX.
Files touched: `src/render/passes/Common.js`, `src/render/PostFX.js`.

## What is being tested

§68.1 measured texture coverage collapsing with brightness (dark bin 73–82%, bright bin
39–46%). §70.2 attributed it to the tonemap: the log-log display slope `G = dlnD/dlnc` is
0.625 in the dark bin against 0.244 in the bright one — a texture modulation must be **×2.56**
larger to survive in a highlight — and *"bypassing AgX takes it to 0.990"*. §74.5 corroborated
in delivered frames at r = −0.88 over 17 unchanged (material, framing) pairs.

`TUNE.toneShoulder` (`b`) multiplies the AgX sigmoid's log-slope in the highlights.
**b = 1.0 is bit-identical to the shipped curve** — both branches of `slyAgxShoulder` reduce to
`poly(x)` — so the control arm is the shipped look by construction, not by approximation.

## What is already established WITHOUT this capture, and is not what is being tested

Two results are arithmetic and do not need a frame. They are recorded here so the capture is not
credited with them:

1. **The ceiling theorem.** The mean of the tonemap's own log-slope `d(ln poly)/dx` across a band
   equals `( ln poly(hi) − ln poly(lo) ) / (hi − lo)` — the fundamental theorem of calculus — so it
   depends *only* on the curve's values at the band's two ends. No reshaping inside the band can
   change it. (`G` inherits this only up to the sRGB encode's mild nonlinearity; the identity is
   exact for `poly`, and the measured frontier table is the authority for `G`.)
   Since `poly` is bounded by display white, **buying highlight slope requires
   lowering the curve below the highlights.** Holding the upper-mid anchor fixed, the absolute
   ceiling is **×1.19** even if all separation above scene ≈4.4 is sacrificed, against the ×2.56
   gap. *There is no free curve.* This kills "reshape the shoulder at no cost" as an option
   permanently, and it generalises §70.2's "no scalar in this grade can fix it" to: no curve either.
2. **The shoulder is a cheaper lever than exposure**, which was the only one §70.2 sized. At
   matched detail gain (×1.5) it holds lit sandstone at **L 180 against exposure's L 164**, and
   shadowed stone at **L 52 against L 37**.

So this capture is **not** asking "does the shoulder recover highlight detail" — the arithmetic
says it does, and by how much. It is asking the only question arithmetic cannot answer:
**is the brightness it costs acceptable in the frame?** That is a look call and it is why this
ships on a frame verdict or not at all.

## Instrument provenance

`scratchpad/tonecurve.mjs` rebuilds the model §70.2 used (the original died in the §83 rollback).
It is validated, not assumed:

- rec2020 round-trip `max |err| 9.8e-5` — the check that would have caught §70.3's garbage-matrix
  failure, where a bare number-regex matched the `3` in `mat3` and the `2020` in an identifier;
- reproduces the **shipped validated grey row** (`PostFX.js:524`) to **0.35 L**, which is the exact
  figure §70.3 records for the original. It is validated against that row and *not* against
  `bloomcalc.mjs`'s inline comment, which still quotes the row `PostFX.js:527` explicitly
  **retracted** — §70.3 records that stale comment misleading a run, and the annotation warning
  about it was itself lost in the rollback;
- reproduces two independent recorded point predictions: `G(scene 3) = 0.084` to the digit, and
  contrast 1.25 → 0.066 to the digit;
- the exposure arm lands at L 126.0 against the recorded 125.7.

`scratchpad/agxshoulder-compile.mjs` then closes the model→driver gap the §24.6 way: it compiles
the real `GLSL_AGX` on the harness's own ANGLE/SwiftShader and renders 24 known radiances
(including two off the grey axis) through `slyAgX` at b ∈ {1.0, 1.2, 1.5}.
**Result: `glError 0`, max |shader − model| = 0 of 255, and b = 1.0 bit-identical.**
So the model and the shipped shader are the same function, verified in bytes before any capture.

## Arms

One boot, one lock. Shots `hero`, `temple`, `interior`. Arms b ∈ {1.0, 1.2, 1.5}.
World clock pinned with `step(n, 0)` per §28 so arms are byte-comparable.
Every arm reads back `postfx.toneState()` and the run is **VOID** if the applied value is not the
requested one (§40: the decisive arm that never ran was a knob whose requested value was never
the applied one).

`interior` is the built-in null: §68.1 puts its dark/bright coverage ratio at **0.99**, i.e. it has
no highlight-crush to fix, so it should move *least* of the three. `temple` should move most —
`column_papyrus` is 54.1% of that frame.

## Primary

Scored with `progress/records/matflat.mjs` — the instrument that produced §68's numbers, so the
figures are comparable to the ledger rather than to a metric invented for this run.

- **P1.** `cov1` on architecture pixels in the **bright bin** (base luma ≥ 0.50), b=1.2 and b=1.5
  against b=1.0, on `hero` and `temple`. Registered band: **+4 to +18 points.**
  Below +4 the change did not reach the frame in an amount worth a look change. Above +18 is
  implausible against the arithmetic and is to be treated as an instrument fault, not a win
  (§68.4's upper-bound discipline).
- **P2 (the cost).** Median display L of lit architecture must not fall below **L 165** at the
  arm that ships. The model predicts 186.9 at b=1.2 and 166.5 at b=1.5, so b=1.5 sits on the
  line and b=1.2 has margin.

## Nulls and falsifiers

- **N1.** `interior` bright-bin `cov1` must move **less** than `hero` and `temple`. If the null
  shot moves most, the statistic is reading something other than highlight crush and the primary
  is **unquotable, not passed** (§68.4).
- **N2.** b=1.0 must be **byte-identical** to the shipped build on all three shots. Not "close" —
  identical, because the default is bit-exact by construction and the clock is pinned. A
  non-zero diff means the pin failed or the uniform leaked, and the run is void. Per §25's
  retraction, on FX-bearing shots this is checked as a duplicate-arm bracket, not assumed.
- **F1 — the falsifier, and it is a revert.** If P1 lands in band but the frames show the
  darkening reading as murk — golden hour lost, §2.2's warm/cool tension flattened, or shadows
  crushing detail (§7.3) — **the change is reverted, not defended with the `cov1` number.**
  §70.1 is the precedent: that seal fired against its author's own shipped work and was honoured.
- **F2.** If b=1.2 and b=1.5 are indistinguishable in `cov1`, the knob is not connected in the
  frame despite being connected in the driver, and the run is void pending an attribution check.

## The trap this run is most likely to fall into

§70.1: an offline statistic can be measuring a band the frame fills from other sources. `cov1`
band-passes at 1.6 px; the frame's 1.6 px band already carries relief, joints, ink and shafts.
A `cov1` gain here is therefore **not** self-evidently texture legibility returning — it could be
the ink pass or the joints gaining contrast from the same slope change. The frames are the
arbiter, and the ROI crops go in the RESULT next to the numbers.

Second trap, from this session's own brief: *a knob moving the image proves it is connected, not
that it is the cause.* Disabling the shadow wash once changed 83.8% of the frame and left the
defect bit-intact. This knob will move a very large fraction of every frame; that fact carries no
evidential weight on its own.
