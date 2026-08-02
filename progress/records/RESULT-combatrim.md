# RESULT — §24.4's combat rim anomaly: located, with the differing predictions that settled it

Quarantine question: `combat` reported `surfonly` 8,625 and `screenonly` 11,992 against `base`
301 (rim1 causal artefact counts) — both single-term legs WORSE than both terms together, which
no additive model explains. Paper analysis + existing `shots/rim1/combat-*.png` frames only; no
capture, no source touched. Tree `f026ef3`.

## The anomaly is real and threshold-robust

Re-implemented with an independent threshold set (L≥150, B>R, B−R≥18, B≥G−4, lift≥8): base
**138**, surfonly **3,254**, screenonly **3,198**. Different absolute scale (thresholds differ
from the lost analyzer's), same inverted structure — not an artifact of one metric's constants.

## Three hypotheses, each with its differing prediction, tested in order

1. **Leg mislabel / gate-vs-term confusion** (the §8-correction family): predicts the leg
   uniforms differ from their names. **Refuted at the source** — rim1's ANALYSIS.txt prints the
   live readback per arm: `surfonly rimGain=2.05 rimStr=0 curve=[3,10,1] planar=[..,1]`,
   `screenonly rimGain=0 rimStr=0.7`. The legs are what they claim.
2. **Exit-upward (AgX-shoulder band-crossing)**: both terms together push band pixels past the
   cool band toward white, so they stop counting. Differing prediction: at surfonly's artefact
   locations, base is BRIGHTER with a smaller B−R margin. **Refuted by measurement**: base is
   *dimmer* — median L 135.7 vs surfonly 193.2 at those 3,254 px; 2,847 (87.5%) fail the L≥150
   cut in base and only 16 fail by chroma; B≥250 share 0% in both. Rim knobs cannot subtract
   57 L; whatever varies is not rim.
3. **FX-phase aliasing (located cause)**: arms are captured sequentially in one boot, +2
   stepped frames each, and combat carries animated FX. Differing predictions, both land:
   - *Spatial confinement*: 95% of the base-dimmer population sits in one right-edge region —
     64-px cells (1216,256..448): 2,706 of 2,847 px — which the crops identify as the
     **spire-tip blue-white sparkle glow (§2.1 #8fd8ff)**: an animated feature that is
     bright+cool BY DESIGN, i.e. it lands exactly inside the artefact signature.
   - *Order-tracking, knob-indifferent*: quiet-box median L per arm in capture order (base,
     gateoff, norim, surfonly, screenonly): sparkle region [1180,300..1280,470] = **68.7,
     71.5, 18.1, 74.0, 49.9** — non-monotone in rim energy, wild in time — while true quiet
     controls are stable (sky 48.9–51.4, far arch 17.2–17.7, floor 66.4–68.6). The impact
     zone drifts secondarily (102.5–110.0), matching the smaller clusters at (512–640,512).

**Mechanism in one sentence: the causal metric scores each arm against a single `norim`
reference captured at a different FX phase, so a pulsing bright-cool sparkle is counted as
"rim-caused artefact" wherever its phase in that arm out-brightens its phase in `norim` — and
`norim` caught the pulse near its minimum (18.1), inflating every other arm.** The record's own
base-301 cluster list already pointed there — 31px@(1248,384), 19px@(1248,416).

## Consequences, stated as rules

- The quarantine holds for **every count-family rim number on `combat`** (artf, rimPx,
  charRimPx — the char box contains the impact FX). `combat`'s §8 row "retention 86.9% / char
  102.1%" carries the same contamination.
- General defect class: **a within-boot sequential A/B is unsound wherever the frame contains
  time-driven FX** — the reference leg is a different instant. §11's probe-header rule wearing
  a capture harness: the skipped transform is *time*.
- Cheap general fix, recommended as sweep standard: **bracket every sweep with a duplicate
  reference arm** (norim first AND last, or a0/a0b as goldhalo already does) and **exclude
  pixels where the duplicates differ** (temporal mask) before any per-arm statistic. One extra
  capture per shot converts unknown temporal noise into a measured per-boot mask.
- `courtyard`'s legs behave ~additively (surfonly 4,897 + screenonly 7,398 vs base 8,610,
  gateoff ≈ base) — no large pulsing FX in frame — so the contamination is combat-shaped, not
  global. Shots with sparkles/flames in frame (`night`'s sparkle language, brazier shots)
  deserve the same duplicate-arm bracket before their counts are trusted.

Crops kept: `csk-fxr-{norim,surfonly,screenonly}.png` (the sparkle at three phases). No knob is
proposed; nothing here needs tuning — the frames were never wrong, the comparison was.
