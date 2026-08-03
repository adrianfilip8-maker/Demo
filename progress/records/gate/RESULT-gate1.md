# RESULT-gate1 — the depth-dependent bounce is built, inert-by-default, and **falsified as a fix**

Scored against `PREREG-gate1.md` + its amendment, both written before any arm frame existed.
One boot, 36 arms planned, live TUNE pokes, `dt = 0`, zero readback mismatches.

## Headline

**The gate works exactly as specified and delivers essentially nothing, because the population
it targets barely exists.** `gate20_85` closes **0.7%** of hero's drift, **0.0%** of temple's and
**0.2%** of sly-closeup's, against a pre-registered band of 20–60% / 13–40%. P2 is falsified by
roughly two orders of magnitude, and the cause is structural rather than a tuning miss.

> `shadowMix = 1 − key` and `key = ramp · sh` is a **product of two banded quantisers** — the
> 3-band cel ramp and the banded cast-shadow mask. So `shadowMix` is effectively **bimodal at 0
> and 1**, not smoothly distributed. There is no "shallow shade" for a depth gate to act on.
>
> This is the one thing none of PREREG's three depth-distribution columns modelled: all three
> assumed a smooth distribution, and the real one is banded. My amendment A2 predicted
> tri-modality (0, ~0.5, 1) and got the mechanism right and the middle mode's *size* wrong — it
> is not a population, it is a fringe.

## The measurement

Frame b−r, hero / temple / sly-closeup. Drift to close: **+0.0413 / +0.0982 / +0.0812** (PREREG-drift1).

| arm | hero Δb−r (% of drift) | temple Δb−r (%) | sly-closeup Δb−r (%) | changed% (hero/temple/closeup) |
|---|---|---|---|---|
| `gate20_70` | −0.0002 (0.5%) | −0.0000 (0.0%) | −0.0001 (0.1%) | 4.36 / 0.26 / 4.75 |
| **`gate20_85`** | **−0.0003 (0.7%)** | **−0.0000 (0.0%)** | **−0.0002 (0.2%)** | 6.07 / 0.43 / 6.91 |
| `gate20_95` | −0.0004 (1.0%) | −0.0000 (0.0%) | −0.0003 (0.4%) | 6.40 / 0.52 / 7.35 |
| `gate35_85` | −0.0006 (1.5%) | −0.0000 (0.0%) | −0.0004 (0.5%) | 7.35 / 0.57 / 7.77 |
| `sbm085` (uniform) | −0.0120 (29.1%) | −0.0142 (14.5%) | −0.0153 (18.8%) | 85.4 / 91.1 / 87.3 |
| `sbm175` (uniform) | −0.0410 (99.3%) | −0.0487 (49.6%) | −0.0522 (64.3%) | 91.9 / 97.3 / 92.7 |
| `sbm20` (full revert) | −0.0487 (117.9%) | −0.0579 (59.0%) | −0.0619 (76.2%) | 92.3 / 97.6 / 93.3 |

`sbm20` reproduces §115.1's 120 / 65 / 74% to within rounding — the sweep is calibrated against
the previous one.

**P1 (null) PASSES**: `base2` is bit-identical to `base` on every shot measured — 0 px, max
channel delta 0. The poke/restore path is clean and the numbers are scoreable.

**P4 (monotone) HOLDS** and is the tell that the implementation is correct rather than dead:
recovery and changed-pixel count both rise strictly with the hand-over point
(4.36 → 6.07 → 6.40 → 7.35% changed). The gate is wired, live and doing precisely what it was
designed to do. It is the *design* that does not reach.

**P7 (collateral) CONFIRMED, and it is the diagnostic**: uniform arms change 85–98% of frame;
gate arms change 0.26–7.8%. That ratio *is* the finding.

## Looked at, not just counted

`mask-temple-gate20_85.png` (magenta = pixels the renderer drew differently). The changed set is
**thin ribbons along terminator and cast-shadow edges** — column shoulders, clerestory slot rims,
the boundaries of the light shafts — not a broad mid-tone region. At 0.43% of `temple` it is
piping, not a population.

That image also retires the risk I registered: there is no coloured fringe to worry about,
because the gate's effect is far too small to see. Had it been large enough to matter, it would
have painted that same ribbon set — so **increasing `shadowBounceMixLit` to compensate is not
available**: the only way for this lever to gain authority is to colour exactly the band edges,
which is the failure mode, not the fix.

## P5 — the two extrapolations, and the conflict they expose

Registered as predictions to falsify, not candidates to confirm. Both are informative:

- **`sbm175` reaches hero's b−r parity almost exactly** (99.3%), vindicating the arithmetic
  behind the 0.175 figure — on hero. It reaches only 49.6% on temple and 64.3% on closeup, so
  "tx7 parity" is a hero-specific claim, not a global one. §115.5's note that ~39% of temple's
  drift is outside `src/render/` accounts for temple's shortfall.
- **`sbm085` closes 29.1 / 14.5 / 18.8%.**

Before measuring, I interpolated §115.4's two published ledger points (`0.05` → hue 211;
`0.20` → 270) and predicted the hue line binds at **sbm ≈ 0.088**, and registered P5 as
"`sbm085` **fails** the hue line". **Both were wrong, and the caveat I attached to them — that
two points cannot establish linearity — is exactly what fired.** See the measured section below.

## Where the remaining authority actually is

Not on the depth axis. The terms carrying `uShadowColor` are both multiplied by `shadowMix`, and
`shadowMix` is bimodal — so *any* lever indexed on shadow depth inherits this ceiling. The
authority the shadow light cannot reach lives in the term that is **not** gated by `shadowMix`:

```
+ albAmb * fill * ao          <- no shadowMix factor; acts on lit and shaded pixels alike
```

§115.1 already measured `fillSkyMix` 0.70 → 0 at **32% / 24% / 15%** of the drift, and it is not
gated by `shadowMix`, so it reaches the pixels the shadow light cannot.

The composed recommendation is quantified in the *Revised recommendation* section below, against
the **measured** ledger ceiling (~0.10) rather than the pre-measurement interpolation (0.088).
Nothing in this section should be read as a number to act on — see that section.

## Status of the code

`ToonMaterial.TUNE.shadowBounceMixLit` / `.shadowDepth` and `toon.glsl.js`'s `slyShadD` are in
the tree at HEAD (swept by the coordinator in `72dedc9`; reviewed in §118). **Shipped inert** —
`Lit == Mix` makes the two uniforms bitwise equal and P1 confirms bit-identity on the frame.

**Recommendation: keep it, do not tune it, do not ship it non-inert.** It costs one `mix` and two
uniforms, it is proven correct and proven inert, and it is the only instrument that can *measure*
the depth axis. But it is not the fix and should not be described as one. If it is thought to be
carrying weight later, this document is the record that it does not.

## Correction owed to the record

§118.1 states the inertness as `mix(a, a, t) == a for every t` and calls `uShadowColorLit`
"bit-identical". That is the exact overclaim the shipped comment deliberately declines to make:
GLSL spells `mix` as `x*(1-a) + y*a`, which need not return `x` to the last ulp; only the
`x + a*(y-x)` form does. **P1 now shows it is bit-identical in practice on this driver** (0 px
across four shots), so §118.1's conclusion is right — but it was right by measurement, not by the
identity it cites, and on a different driver the citation would not hold.

## MEASURED — the ledger line, and P5 falsified in the useful direction

`deepscore.mjs`, renderer-derived deep-shade population (top quartile of `|sbm20 − base|`,
23–28% of frame). Its header carries the §11 gap: it is **not** roigen's `archShade` and its
absolutes are not comparable to §115.4's — the `base` row is its own reference. It nonetheless
lands `base` at hue **210 / 209 / 211** on temple / hero / sly-closeup against §115.4's
published 211 for archShade, which is a strong independent cross-check of both instruments.

| arm | temple hue / G-dark | hero hue / G-dark | closeup hue / G-dark | ledger |
|---|---|---|---|---|
| `base` | 210 / 0.1% | 209 / 0.2% | 211 / 0.0% | pass |
| `gate20_85` | **210 / 0.1%** | **209 / 0.2%** | **211 / 0.0%** | pass (**identical to base**) |
| `gate20_95` | **210 / 0.1%** | **209 / 0.2%** | **211 / 0.0%** | pass (**identical to base**) |
| `sbm085` | 217 / 2.2% | 213 / 2.4% | 216 / 0.1% | **pass** |
| `sbm175` | 266 / 75.6% | 231 / 30.7% | 245 / 57.9% | FAIL |
| `sbm20` | 287 / 79.2% | 240 / 47.0% | 261 / 87.2% | FAIL |

**A1 CONFIRMED exactly.** Every gate arm is *identical* to `base` on the deep-shade population —
hue, saturation, luma and G-darkest all unchanged to the printed precision. The gate is switched
off where the ledger is measured, by construction, which is why "the gate passes the hue line"
was never going to be evidence of anything.

**P5 FALSIFIED, and the correction matters more than the prediction did.** `sbm085` **passes** on
all three shots (213–217°, G-darkest ≤ 2.4%). The hue response to `shadowBounceMix` is markedly
**non-linear** — nearly flat from 0.05 → 0.085 (+4 to +7°), then steep from 0.085 → 0.175
(+18 to +49°). My linear reading of two endpoints was pessimistic by roughly 15%.

Interpolating between *measured* neighbours (0.085 and 0.175) puts the 226° crossing at
**temple ≈ 0.10, closeup ≈ 0.116, hero ≈ 0.15**. **Temple binds**, and G-darkest's own 50%
crossing on temple (~0.144) is looser than hue's, so hue is the operative limit.

> **Corrected conflict.** The uniform knob's ceiling is **~0.10**, not 0.088 — and not 0.175.
> Interpolating the measured b−r arms, sbm 0.10 buys roughly **41% / 20% / 26%** of the drift on
> hero / temple / closeup while holding both ledger lines. `sbm175` does reach hero's b−r parity
> (99.3%) but fails the hue line on all three shots, so the brief's "0.175 for tx7 parity" is
> real on b−r and unusable on hue.

## P6 — night, measured, PASSES with a wide margin

| arm | night Δb−r | Δluma | changed% |
|---|---|---|---|
| `gate20_85` | −0.0000 | +0.0000 | 0.11% |
| `gate35_85` | −0.0000 | +0.0000 | 0.18% |
| `sbm085` | −0.0019 | +0.0002 (0.17%) | 56.9% |
| `sbm20` | −0.0082 | +0.0010 (0.86%) | 81.3% |

Night's frame b−r is +0.1607, so `sbm085` moves it by **1.2% of its own value** and luma by
0.17% — far inside P6's ±0.010 / 2% bands. `night` is not paid for by the gate (which barely
touches it: 0.11% of frame) *or* by a uniform value at the ledger ceiling. Acceptance #3 clears
for both candidates. §112.3's concern that night is what the cool terms buy is real, but this
knob at these magnitudes is not where it would be spent.

## Revised recommendation

1. **Do not ship the depth gate non-inert.** Keep it as a measured-null instrument; this document
   is the record that it delivers 0.0–1.5% and why.
2. **Uniform `shadowBounceMix` ≈ 0.10**, temple-binding, ledger-holding, ~41 / 20 / 26% of drift.
   Wants one confirming arm at 0.10 and 0.12 to locate the crossing directly rather than by
   interpolation between 0.085 and 0.175 — the same two-point-linearity error corrected above,
   and I am not repeating it in the other direction.
3. **Compose with `fillSkyMix`**, the term not gated by `shadowMix`: §115.1 measured `fill0` at
   32 / 24 / 15%. Together ≈ **73 / 44 / 41%** of the drift with the ledger intact, if they
   compose additively — which `fill0sbm20` in §115.1's sweep suggests but does not prove at
   these magnitudes.

Both legs are measured single arms already; the only untested claim is their composition. That
is the next prereg, and it is a different lever from this one.
