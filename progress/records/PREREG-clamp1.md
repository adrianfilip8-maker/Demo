# PREREG — clamp1: is `TUNE.shadowTintPeak` still the daylight shadow's operating point?

Registered **before** the probe runs. §141.1: a criterion re-derived after seeing the candidate
is VOID, and I will say so rather than restate it.

## Background

KNOWN_ISSUES §3 and the comment block at `ToonMaterial.js:1723-1758` both state that the
daylight shadow light is pinned by `shadowTintPeak / peak` and that every daylight shot asks for
far more than the cap allows (hero 6.50, temple 6.82, courtyard 6.52, combat 6.63, interior 9.79
against a cap of 3.904). §256 repeats it. My assignment is written on that premise.

**An offline transcription of `_refreshShadowColor()` says the premise is stale.**
`scratchpad/clampmodel.mjs`. Two constants have moved since §3 was written:

- `TUNE.shadowTeal` 0.15 was introduced, and the teal blend feeds *both* `tintLum` and `peak`.
  It raises `tintLum` 0.05007 → 0.08928, which **divides `k asked` by 1.783**.
- `shadowTintPeak` was raised 0.52 → 0.62, which **multiplies `maxK` by 1.192**.

Net, the ratio `kAsked / maxK` has moved by **2.13×**, and the model says the cap no longer
binds outdoors:

```
  k asked = shadowFloor * keyLum / tintLum = 0.125 * 2.424 / 0.08928 = 3.392
  maxK    = shadowTintPeak / peak          = 0.62 / 0.16567          = 3.742
  k used  = min(3.392, 3.742) = 3.392   <- floor-bound, NOT cap-bound
```

Predicted per shot, using §256's own measured `keyLum`: **hero, temple, courtyard, combat and
night are unclamped; only `interior` (keyLum 3.652 → asks 5.113) is still clamped.** The cap
releases at `shadowTintPeak = 0.5620`; the shipped value is 10.3 % above it.

The transcription is validated against two figures it was not fitted to — the comment at
`ToonMaterial.js:1716-1717` states the shadow light was "8.1 % of key" before the teal blend and
"11.6 % of key" after it, and the transcription reproduces **8.1 % and 11.6 %** from the
era-appropriate constants (`shadowTintPeak` 0.52, `shadowTeal` 0/0.15). The light triple quoted
at `ToonMaterial.js:1748` — `(0.123, 0.175, 0.423)` — is **not** reproducible and is not used as
a check, because §3 quotes a *different* triple `(0.142, 0.189, 0.423)` for the same quantity;
the two disagree with each other, so neither can validate anything.

## Instrument

One boot, headless, `tools/harness.mjs`. Per shot: `setShot(name, { dt: 0 })` (§251), then read
`shading.uniforms.uShadowColor.value` and the model's inputs (`uKeyColor`, `uKeyIntensity`,
`_shadowFloor`, `_shadowTint`) straight off the live module. Then poke
`Shading.TUNE.shadowTintPeak`, call `_refreshShadowColor()`, and read the light back again.

This is a **uniform readback, not a render** — no framebuffer, no tonemap, no drift floor.
Three arms per shot, same boot, one lever (§233/§243).

## Registered criteria

- **C1 — model validity.** At the shipped `shadowTintPeak` 0.62, the live `uShadowColor` must
  match the transcription to `max |Δ| < 0.002` per channel on every shot tested. If C1 misses,
  the model is wrong and **nothing below is quotable**.

- **C2 — the finding (null arm).** `shadowTintPeak` 0.62 → 4.00 must leave `uShadowColor`
  **exactly bit-identical** (`max |Δ| == 0`) on hero, temple, courtyard, combat, dunes and
  traversal. This is the prediction that the cap is inert upward outdoors.

- **C3 — POSITIVE CONTROL, must fire.** `shadowTintPeak` 0.62 → 0.30 must change
  `uShadowColor` luma by **≥ 20 %** on every one of those same shots. A null arm proves
  repeatability, not sensitivity (§255); if C3 does not fire, the poke path is dead and C2 means
  nothing.

- **C4 — second positive control and per-shot discriminator.** `interior` is predicted
  **clamped**, so on `interior` alone the 0.62 → 4.00 arm must **change** the light by ≥ 20 %
  luma — the opposite of C2, from the same poke. If C4 fires while C2 holds, the model's
  per-shot prediction is confirmed by a discriminating comparison rather than by a bare null.

## What each outcome means

- **C1 ✓, C2 ✓, C3 ✓, C4 ✓** → the cap is not the daylight operating point any more. The route
  I was handed does not exist; `shadowTintPeak` cannot be lifted because it is already above the
  demand. Report and stop, do not ship a knob change.
- **C1 ✓, C2 ✗** → the cap still binds; the model is wrong about which term is active and the
  original route is live. Proceed to the wash/clamp question as briefed.
- **C3 ✗** → run VOID, instrument dead, no claim either way.

## Highlight arithmetic, registered here so it is not re-derived later

Independently of the above, the cap **cannot** produce highlights, and this is closed-form:

1. Both shadow-light terms in `toon.glsl.js:596-599` are multiplied by `shadowMix = 1.0 - key`
   (line 499). At full key `shadowMix` is exactly 0, so the shadow light contributes **exactly
   zero** to the brightest pixels in the frame. The cap has no authority over p99 by
   construction.
2. `k` is `min(shadowFloor * keyLum / tintLum, shadowTintPeak / peak)`. Raising `shadowTintPeak`
   can at most restore the first expression, so the shadow light's luma saturates at
   `shadowFloor × keyLum` = 0.125 × 2.423 = **0.3029** — 12.5 % of key.
3. Display L 230 needs scene radiance **2.237** (validated chain, `progress/records/tonecurve.mjs`).
   Through a shaded sandstone albedo (post-`shadowSat` luma 0.334) plus the wash, that needs a
   shadow light of luma **5.82** — **19× the ceiling in (2), which no value of `shadowTintPeak`
   can reach.**

So the honest ceiling on this route was already zero before the staleness above was found.

---

# Addendum — clamp2, registered BEFORE the second run

## Outcome of run 1 (`clamp1.mjs`, `clamp1.json`)

- **C1 FAILED as registered.** Bar was `max |Δ| < 0.002` on *every* shot tested; `night`
  measured **3.93e-3**. I am not restating the bar. Per-shot: hero **2.99e-12**, traversal
  1.40e-5, courtyard 2.47e-5, combat 8.43e-5, temple 1.77e-4, dunes 5.20e-4, interior 1.77e-3,
  night 3.93e-3.
- C2 **PASS** — all six outdoor daylight shots bit-identical (Δ == 0) under 0.62 → 4.00.
- C3 **FIRED** — 31.4 % min luma move on 0.62 → 0.30.
- C4 **FIRED** — `interior` moved 36.3 % on the arm that moved the others by exactly zero.

C2/C3/C4 are live-vs-live readbacks inside one boot and do not depend on the model, so the
finding rests on them. C1's job was to certify the *offline arithmetic* (`k asked`, `maxK`,
the release point), and that arithmetic is **not certified**.

**Suspected cause of the C1 miss, stated as a hypothesis because this run cannot prove it:**
the model hard-codes `uBounceColor` to the daylight palette `#e8a852`, while
`_refreshShadowColor()` reads the *live* uniform, which LIGHTING repaints by time of day. The
error ordering is consistent with that (hero, at the palette value, is bit-exact at 2.99e-12;
`night` is furthest away and worst) — but `uBounceColor` was **not recorded**, so this is not a
measurement and I am not scoring it as one.

## Registered criteria for run 2

- **C5 — release point, measured not modelled.** Sweep `shadowTintPeak` on `hero` over
  {0.30, 0.50, 0.54, 0.56, 0.5620, 0.58, 0.60, 0.62, 0.70, 4.00}. Registered prediction: the
  readback luma is **strictly constant for every value ≥ 0.5620** and **strictly increasing in
  `shadowTintPeak` for every value below it**. A monotone-increasing-then-flat curve with its
  knee in [0.56, 0.58] confirms; a knee outside that interval, or any non-monotonicity below it,
  falsifies.

- **C6 — the re-bind threshold under a key boost.** Sweep `uKeyIntensity` on `hero` by factors
  {1.00, 1.05, 1.10, 1.15, 1.40, 1.70, 2.10, 2.60} (§256's own bracket, extended at the bottom),
  calling `_refreshShadowColor()` each time. Registered prediction: the shadow light's luma
  tracks `keyLum` **linearly below factor 1.1035** and is **flat above it**, and the total rise
  from factor 1.00 to 2.60 is **≤ 12 %** despite a 2.6× sun. This is the mechanism behind §256's
  "p1 moves ≤ 1.5 L across the whole bracket"; if the light instead keeps tracking the key, the
  mechanism is something else and I will say so.

- **C7 — C1 re-run with the omitted input.** Record `uBounceColor` and `uSkyColor` per shot and
  re-score the model. Bar: `max |Δ| < 0.002` on every shot, as before. This is a **new**
  criterion replacing a failed one, not a restatement of it — run 1's C1 stays FAILED on the
  record whatever C7 does.

- **C8 — POSITIVE CONTROL, must fire.** Within the C6 sweep, the factor-2.60 arm must change
  `uKeyIntensity`'s readback by ≥ 100 %. If the key poke does not take, C6's flatness is an
  artefact of a dead lever and the run is VOID.
