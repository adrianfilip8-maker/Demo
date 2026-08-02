# rimstarve — the prereg refutes itself (coordinator transcription of SHADING's report, 2026-08-02 ~16:2x)

No lock consumed (headless depth path, ~5–9 s/shot). Both runs at `f51b1c1`, `src/` clean.
Transcribed because the analysis lived in a transcript and the instruments are restart-mortal.

## Instrument proved on a known input BEFORE any scene number was read

With the level removed every tap is sky, so S must be exactly `FAR/z0 − 1`. Returned **313.5**
→ z0 = 4000/314.55 = **12.72 m**, against an independently frozen 12.54–12.94. Tap geometry and
the axial conversion are correct before the first real measurement.

## S = median (z_bg − z0)/z0 over the subject's rim band — gate opens 0.05, full at 0.16

| shot | S | %≥0.05 | %≥0.16 | Gate B cost to subject |
|---|---|---|---|---|
| temple | **0.418** | 93.9 | 81.2 | 5.9% |
| interior | **0.441** | 95.6 | 89.0 | 2.5% |
| night *(control)* | 0.168 | 89.8 | 54.4 | **21.9%** |
| traversal | 1.492 | 100 | 100 | 0.0% |
| combat | 0.442 | 94.6 | 84.7 | 5.3% |
| courtyard | 0.244 | 99.6 | 99.3 | 0.4% |
| hero / sly-closeup / dunes | 2.840 / 1.269 / 6.546 | 100 / 94.3 / 100 | 94.8 / 89.0 / 100 | 2.0 / 1.9 / 0.0% |
| guard | character is behind the camera by design — reported as such, not as a pixel count |

**§5 registered S ≥ 0.16 on either `temple` or `interior` as outright refutation. Both refute,
by 8×.** The `night` control passed as predicted. Resolution-invariant (720 vs 900 agree to
three decimals).

**Gate A was never shut, so `rimSubjExempt` not reaching it is true and irrelevant** — the
prereg's load-bearing claim was correct and load-bearing on nothing. Gate B costs the character
0–6% everywhere except `night`. That is the arithmetic reason an earlier ±0.4 L null was the
*expected* number rather than a puzzle.

## Current-tree retention — the old retention column describes a dead tree

`shots/rim1/` predates `rimSkinExempt: 1.0` (shipped in rim2 precisely to stop the convexity
gate eating the character), so its 20–25% retention column is not current behaviour (§18/§27.1).
Re-measured now: mean ΔL on the 0–2 px ring inside the geometric silhouette —

- **temple +4.95, interior +4.77** — clean monotonic falloff to ~0 inward. **Pass.**
- **courtyard +13.55, combat +17.02** — strong, but from pre-skinfix frames; refresh wanted.
- **`night` +1.69, negative inward. Weak, and confirmed by eye** — a dark shape on a dark
  parapet with almost no separating rim.
- **traversal −0.76 mean, but 29.9% of edge px gain > 2 L, p90 +9.78** — near-clipping bright
  against mid-value paving. Headroom, not regression. (The old brief's "mid-air against open
  sky" premise is wrong for this framing; the depth run independently found 0 sky taps.)

Mask alignment verified by overlay before any of it was trusted — the outline tracks cap, ear,
tail rings and legs, and correctly excludes the non-skinned cane. **A first mask was caught and
discarded:** hiding Sly also removes his cast shadow, which yielded a 16%-of-frame "silhouette"
for a 193 px character.

## What is actually open: `night` only

Pre-registered A/B, sealed here before capture: `PostFX.TUNE.rimSubjExempt` 0 → 1.
**Predicted: `night` subject rim-band mask 0.3601 → 0.4528 (+25.8%)**, computed offline.
Acceptance: off-subject pixels bit-identical (the subject mask is 0 there, so the mix is the
identity by construction — checked, not asserted); `night` artefact-lower must not exceed 182.
**Falsifier: if the edge ring does not rise ≥ +0.5 L, the mask gain does not survive the
tonemap and the lever is dead — report that rather than raising it.** Night-only by
construction: every other shot gains 0–6%.

## Flagged, not claimed

- **The rim's displayed delta is warm-biased on 5 of 6 shots** (temple dR +5.58 / dG +5.42 /
  dB **−1.45**; interior +6.05/+6.11/−0.55; combat +25.95/+16.02/+0.63), only `courtyard`
  reading cool — against §2.2's specified `#7fd4ff`. Confounded by AgX highlight desaturation
  and the split-tone cool leg, so it needs an isolated test, but it corroborates PostFX's own
  existing note about the rim lip turning pale grey.
- **The in-page `charBox` in the rim1/int1 reports is the REST-POSE bbox** (interior 340×375
  where the posed figure is 291×253). Anything derived from that rectangle includes background.
- `Terrain` will not build headless (`document is not defined`), so it is absent from the depth
  set. That biases Gate A **open** — the direction that would refute the prereg — so it cannot
  have manufactured this refutation, but a future PASS must be read against it.
