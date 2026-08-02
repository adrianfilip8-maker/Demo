# PREREG rimwarm — the warm-biased rim delta, isolated

Sealed before any new capture. Task #23's window is open, so **no src edit is applied and none
is proposed here**; the test below is a uniform poke plus offline arithmetic. Instrument:
`scratchpad/rimwarm.mjs`. Tree at writing: `528ee54`, `src/` clean.

## The flag, and why it cannot be read the way it was posed

RESULT-rimstarve flagged: the rim's displayed delta reads warm on 5 of 6 shots — temple
dR +5.58 / dG +5.42 / dB **−1.45**, interior +6.05/+6.11/−0.55, combat +25.95/+16.02/+0.63 —
only `courtyard` cool, against §2.2's `#7fd4ff`. It was flagged, correctly, as confounded by
AgX and the split-tone, and routed for an isolated test.

**Two structural facts, both found by reading the composite and both load-bearing.**

1. **The two rims are composited at different points in the chain, with different transfer
   functions.** The surface fresnel rim (`toon.glsl.js:683`, `uRimColor`) is scene-linear and
   passes through grade + AgX. The screen-space rim (`PostFX.js:920-924`) is applied **after
   AgX and after the sRGB encode**, in display space, as a bounded wrap
   `c += rimCol * amt * (1.0 - c)`. `norim` kills both, so `base − norim` is a **sum of two
   terms with different transfer functions** and is not "the rim's colour" under either.

   The `(1 - c)` factor is also, on its own, the mechanism behind PostFX's own note that the rim
   lip goes pale grey: it attenuates most in whichever channel is already largest, so on a
   blue-dominant ring pixel a perfectly cool `rimCol` gets its blue contribution damped hardest.
   That is a desaturation finding, not a hue finding.

2. **Neither insertion point can lower a channel.** Both are non-negative additions
   (`(1 - c) ≥ 0` because AgX output is clamped to [0,1] before the sRGB encode). A monotone
   per-channel addition cannot produce **dB < 0**. So the measured −1.45/−1.83 dB is *not* the
   rim, and cannot be, at any rim colour.

## Forward model, anchored and round-trip gated

`rimwarm.mjs` copies the grade+AgX transcription from `t16chain2.mjs` (validated against
washcap's live `uShadowColor` readback and eye1/tx7 medians) and **refuses to print** unless it
reproduces that model's published pair `linear (0.0795, 0.0668, 0.0881) -> display (90, 81, 102)`.
It fits each shot's real no-rim ring pixel back to scene-linear and **gates on a round trip**:
`grade(fit)` must return the pixel it was fitted from.

> The first version of the fit did not converge and its non-convergence branch returned an
> unscaled direction, so it printed a full table of predicted deltas about a base pixel 5× too
> dark. Every row looked reasonable. The round-trip gate exists because of that, not in
> anticipation of it.

Measured (my instrument, ring 0–2 px inside the geometric silhouette, same erosion as
`rimframe.mjs`) — it reproduces the flagged figures, so this is the same population:

| shot | frames | norim ring mean | dR | dG | dB |
|---|---|---|---|---|---|
| temple | rim2 | 25.3, 28.4, 55.7 | +5.14 | +4.92 | **−1.83** |
| interior | int1 | 29.2, 35.7, 65.9 | +6.05 | +6.11 | **−0.55** |
| night | rim2 | 25.6, 27.3, 53.0 | +0.34 | +1.65 | **−0.29** |
| traversal | rim2 | 72.8, 65.5, 76.2 | +4.63 | +5.87 | +3.74 |
| combat | rim1 | 83.5, 71.3, 75.0 | +25.95 | +16.02 | +0.63 |
| courtyard | rim1 | 56.5, 54.9, 75.3 | +9.61 | +14.84 | +12.41 |

Predicted, pure `#7fd4ff` additive on those same fitted bases, all strengths 0.005 → 0.30:
**dR is the smallest channel in every row of every shot, and dB is the largest or joint-largest
at every strength that matches the measured ring ΔL.** At temple's measured ring ΔL of 4.48 the
prediction is dR ≈ +1, dG ≈ +6, dB ≈ +7 against a measurement of +5.14 / +4.92 / −1.83.

**The flag survives the chain.** AgX and the split-tone do not explain it — they were the named
confounds and they are eliminated in the direction that makes the flag *stronger*, not weaker.

## Leading candidate, named rather than assumed

**The pairs are unpinned.** `rimsweep2.mjs` (which wrote `shots/rim2`) and `intsweep.mjs`
(`shots/int1`) both advance with `window.__GAME.step(1)` at **default dt** — the exact defect
§28/goldonset2 documents, where every arm lands at a different FX phase and no pixel statistic
in the run has power. So each pair above differs by one 1/60 s of dust, shafts and torch flicker
*as well as* by the rim. On temple those shafts are warm, which is the right sign and roughly
the right magnitude for a spurious +4 R and −9 B.

This is a candidate, not a verdict — §10's lesson is that the first sufficient explanation is
exactly the one that should not be accepted without checking the instrument too. What is
*established* independently of it is fact 2 above: a non-negative addition cannot lower a
channel, so whatever else is true, `base − norim` on these frames contains something that is
not the rim.

## The test, pre-registered

One shot (`temple`, the largest |dB|), four arms, **clock-pinned** with `step(n, 0)`, one boot:
`e0` (shipping) · `norim` (both rims off) · `surfonly` (`rimStrength` 0, `uRimGain` live) ·
`e0b` (pin control, captured last). `surfonly` is what `norim` has never provided: it separates
the two rim paths, which no measurement in this project has yet done.

- **PREDICTION.** Under a pin, temple's ring `dB` is **≥ 0** and `dR` is no longer the largest
  channel. Predicted pinned values at the measured ΔL: dR ≈ +1, dG ≈ +6, dB ≈ +7 (±3 per
  channel, the model's stated scope — no bloom, no FXAA).
- **FALSIFIER.** If pinned `dB` on temple stays **≤ −0.5**, phase did not own it, the model is
  wrong about something structural, and the rim colour becomes a live suspect that earns its own
  hunt. Report that rather than adjusting the rim colour to chase the number.
- **NULL CONTROL.** `e0` vs `e0b` must be **0 px** different. Without it a pinned re-run proves
  nothing, because the pin is the whole hypothesis.
- **NOT A KNOB CHANGE EITHER WAY.** No value ships from this run. §2.2's `#7fd4ff` stands
  unless the falsifier fires.

## Recorded regardless of the verdict

Every `base − norim` rim number this project has published — rim1, rim2, int1, and the retention
columns derived from them — comes from unpinned pairs. That does not make them wrong; it makes
their error bars unknown and unstated. The pinned `norim` above re-baselines them for one shot,
and the same defect should be assumed in the rest until each is re-run.
