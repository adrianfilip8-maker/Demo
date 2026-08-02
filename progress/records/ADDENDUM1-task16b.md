# ADDENDUM 1 to PREREG-task16b — the sealed L2 breaks `interior`, and the acceptance
# cannot be settled offline

Written against the sealed `PREREG-task16b.md`, which is NOT edited. Offline only
(`t16f.mjs` = `t16chain2.mjs` + an appended third-lighting-state section; same skipped
transform suffix as t16chain2's header — haze, GTAO, bloom, vignette, FXAA, grain, normal
perturbation, local torches). No capture spent, no source touched.

Reason for the addendum: the seal registered acceptance on **night + day only**. `interior`
is a canonical shot at `tod 0.5` with a 76° sun and is one of the frames RESULT-task16
measured as violet (granite 269). It is a third, differently-lit state, and the sealed fix
was never evaluated there.

## Finding 1 — candidate I (the sealed L2, tint→TURQUOISE) sends `interior` out of §2.2

Sandstone_worn wall, full shadowMix, tod 0.5, display hue/sat:

| turq | mix 0.20 | mix 0.05 |
|---|---|---|
| 0.00 (shipped) | 287 / 0.136 | 246 / 0.182 |
| 0.10 | **345 / 0.039** | 203 / 0.151 |
| 0.20 | **69 / 0.067** | **169 / 0.160** |

At the shipped bounce mix the tint lever drives interior shadows to **hue 345 (magenta) and
then 69 (olive) with saturation collapsing to 0.039–0.067**. §2.2 sanctions "violet, teal, or
deep cyan" and says shadows are "never grey"; 0.039 is grey and 69° is neither. Even at the
paired mix 0.05, turq 0.20 lands at **169 (green-cyan)**.

The seal's own interlock note ("L2 at the shipped warm mix collapses shadow saturation to
grey — the levers ship together or not at all") is therefore **necessary but not sufficient**:
shipping them together still puts interior at 169–203, and only `turq 0.10 + mix 0.05`
(hue 203, sat 0.151) survives at all — already teal-past-210 and at 83% of base saturation.

**Consequence: no arm of the sealed A/B may be shipped without an `interior` frame.** The
sealed run order (night, sly-closeup, temple-if-budget) does not include one.

## Finding 2 — candidate F (bounceMix + split-tone teal) is better behaved but does not clear

`splitShadow` is PostFX's, `shadowBounceMix` is ToonMaterial's — both in scope. Day tod 0.8,
model hue (→ frame-predicted, using the seal's own validated per-material offsets +8/+23/+24):

| arm | worn | block | courtyard |
|---|---|---|---|
| mix 0.20 base (shipped) | 266 (→274) | 259 (→282) | 237 (→261) |
| mix 0.05 + teal `2a5f66` | 227 (→235) | 226 (→249) | 215 (→239) |
| mix 0.05 + teal `2a6f6a` | 225 (→233) | 224 (→247) | 213 (→237) |

Night is safe in every F arm (hue 221–228, sat 0.604–0.694 vs base 0.661) and interior stays
in band at mix ≤ 0.10 (231–248). Lit side moves **0.00°** — confirming the changed terms are
shadowMix-gated, as the seal predicted.

But **F does not reach the ≤226 acceptance in frame space**: raw model hues pass (225/224/213)
and frame-predicted hues fail (233/247/237).

## Finding 3 — the acceptance sits inside the model's own declared error

Every candidate that clears ≤226 in model space fails it once the seal's own validated frame
offsets (+8/+23/+24, attributed to GTAO tint, crevice albedo and haze modelled at zero) are
applied. The offsets are 8–24° and the decision margin is 0–20°.

**So the ≤226 acceptance cannot be adjudicated offline in either direction.** This is
KNOWN_ISSUES §11 in its exact form: the model's skipped-transform suffix is the same size as
the effect being decided. Quoting a model hue against the ledger's 226 would be a confident
wrong number of precisely the documented class.

## Registered consequences for whoever runs the #16 A/B

1. **Add `interior` to the run.** It is the state that falsifies the sealed lever, and it is
   not currently captured.
2. **The verdict statistic must be measured in-frame** (`framehue.mjs`, the RESULT-task16
   masks and splits), never model + offset.
3. **Bracket-native.** `interior` is torch-lit and `night` has sparkles; per RESULT-combatrim,
   a within-boot sequential A/B is unsound wherever the frame carries time-driven FX. Every
   arm needs a duplicate reference (base first AND last) and a temporal mask before any
   per-arm statistic.
4. **TEXTURES' routed first A/B (wash/fill hue teal-ward) is predicted insufficient by
   decomposition, not by taste**: the wash is 11.6% of shadow luminance (model row "B wash
   pure tint" moves night 231→230; the split-tone leg alone moves day worn 266→263). The
   legs that carry the violet are `mult` 57.3% (G/R 0.808) and `fill` 31.1% (G/R 0.787).
   A lever on an 11.6% leg cannot deliver a 40–56° swing.

## What this addendum does not claim

It does not retract the seal's attribution — that reproduced exactly on re-run (light G/R
1.336 against the ≥2.07 sandstone needs; SUM G/R 0.840, B/max 1.11). It adds a third lighting
state the seal omitted and records that the day acceptance is not offline-decidable. No ship
recommendation is made here.
