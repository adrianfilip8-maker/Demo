# PREREG — per-albedo shadow band (`uShadowHold`)

Registered **before** the candidate exists. Instrument, ROIs, arms and thresholds below are frozen;
`scratchpad/hue/score.py` is the scorer and it is not edited after the first candidate run (§141.1).

---

## 1. The question

Critic pass 9 (`progress/records/RESULT-critic9.md`, D1) measures our shadow ramps rotating hue by
**176–187°** against a reference that rotates by **6–45°**, and names it upstream of five of its
eleven defects. `DERIV-shadowhue-target.md` §4 pre-registers the *opposite* acceptance —
`|180 − Δh| ≤ 30°` — and `ADDENDUM-shadowhue-restate.md` §5 records the shipped build **passing**
it on four shots. Both cannot be right. §5 of this file resolves that; this section only fixes what
is measured.

## 2. Instrument (frozen)

`scratchpad/hue/score.py`. For one rectangle of a **single material** that spans a cast-shadow
boundary: sort its pixels by HSV value, take the **top 20 %** as *lit* and the **bottom 20 %** as
*shade*, take the HSV of each group's mean RGB, report circular `Δh`, the value ratio
`V_sha / V_lit`, and both saturations. Frame-wide it also reports warm % / cool % (sat > 0.15,
hue < 60 ∪ ≥ 330 warm, 170–260 cool), the circular mean hue of each population with its resultant
length `R`, and the fractions below L 0.15 and above 230.

The quantile split is deliberate: it removes my hand from the choice of which pixels are "shadow".

**Calibration against an independent measurement.** Run on `shots/r9/`, this instrument returns
`dunes` lit `(203.3, 112.7, 68.2)` h 19.8° and shade h 205.9°, against the critic's independently
chosen patches `(201, 108, 65)` h 19.1° and h 206.0°; and `dunes` dark % 1.27 against the critic's
1.27 %. Two instruments, two ROI choices, same numbers. The instrument is not the defect.

## 3. ROIs (frozen; each was cropped and looked at before registration)

| shot | ROI | rect | why |
|---|---|---|---|
| `dunes` | dune sand | `(80, 545, 760, 700)` | one continuous dune, sunlit right / cast-shadowed left, hard boundary |
| `hero` | courtyard floor | `(930, 500, 1275, 715)` | one tile material, lit strips and shadowed tiles |
| `interior` | floor | `(150, 560, 450, 700)` | protected frame; sconce-warm vs cool ambient |

Rejected before registration, and why (they are the §11 failure mode and I hit it twice on the
reference): `sly3-venice` `rbuild` and `midroof` returned Δh 112° and 110° and are **multi-material**
— `rbuild` is the Italian flag against a wall, `midroof` is roof tiles plus a wall plus a bird. Both
VOID, stated, not re-derived. `interior`'s first warm ROI `(250,195,340,285)` was the sconce fitting
itself, not a wall the sconce lights; replaced by the frame-wide warm/cool populations.

## 4. Baseline (`shots/r9/`, the frames critic 9 judged)

| shot | ROI Δh | lit h / s | shade h / s | V ratio | warm % (h) | cool % (h) | dark % |
|---|---|---|---|---|---|---|---|
| `dunes` | **173.8** | 19.8 / 0.664 | 205.9 / 0.419 | 0.367 | 64.63 (26.2) | 18.82 (205.2) | 1.27 |
| `hero` | **165.6** | 24.0 / 0.564 | 218.4 / 0.347 | 0.342 | 25.98 (27.0) | 53.31 (210.0) | 14.28 |
| `interior` | 61.3 | 164.5 / 0.217 | 225.8 / 0.282 | 0.600 | 8.05 (9.4) | 75.25 (215.3) | 9.49 |

Reference (`sly3-venice.jpg`), same instrument, three regions each verified single-material:

| region | Δh | lit s → shade s | V ratio |
|---|---|---|---|
| walkway boards | **15.0** | 0.466 → 0.142 | 0.559 |
| right wall stone | **24.8** | 0.407 → 0.809 | 0.535 |
| statue plinth | **12.6** | 0.518 → 0.716 | 0.678 |

Note the reference does **not** uniformly drop saturation — the warm wood desaturates, the two teal
stones *gain* saturation. What it holds is **hue**, and what it always drops is **value**.

## 5. Thresholds (frozen)

Scored through `tools/gate.mjs`; anything not exactly `true`/`false` is VOID, and VOID does not ship.

- **G1** `dunes` ROI Δh **≤ 45.0°** (baseline 173.8; reference worst clean 24.8; critic's worst
  reference reading 44.9 — the bar is set at the critic's own loosest reference number, not at mine).
- **G2** `hero` ROI Δh **≤ 45.0°**.
- **G3** *the shadow must still read as shadow*: ROI V ratio ∈ **[0.20, 0.75]** on `dunes` and `hero`
  (baseline 0.367 / 0.342; reference 0.535–0.678). Guards against buying hue with brightness.
- **G4** *chroma must not be traded away*: ROI shade saturation **≥ baseline − 0.05** on `dunes`
  (≥ 0.369) and `hero` (≥ 0.297). Critic 9's D2 is an under-saturation complaint; a fix that
  desaturates is not a fix.
- **G5** `interior` warm % ≥ **6.04** (0.75 × 8.05) **and** cool % ≥ **56.44** (0.75 × 75.25).
- **G6** `interior` warm-population mean hue within **15°** of 9.4° and cool-population mean hue
  within **15°** of 215.3°, **both requiring `R ≥ 0.90`** — a bimodal population's circular mean
  describes nothing (`ADDENDUM-shadowhue-restate.md` §5 found exactly this), so `R < 0.90` is VOID,
  not PASS.
- **G7** `npm test` = **395/395**.

Reported, **not** gated: fraction below L 0.15. The build has 1.27–14.28 % against the reference's
18.95 %; this change touches the dark end and the number must be stated, but the black point is a
separate fix and is not bundled (per brief).

## 6. Arms — one boot per shot, `dt = 0` on every step (§251)

| arm | poke | role |
|---|---|---|
| **A0** base | none (shipped) | anchor; also confirms the r9 baseline transfers to a fresh boot |
| **A1** null | `hold = 1`, then `hold = 0` | **repeatability + reversibility.** Must be bit-identical to A0 |
| **A2** control | `uNeutralShadow = 1` | **positive control that MUST fire**: shadow light → grey. If `dunes` ROI Δh does not move **≥ 20°**, the shadow light is not what sets that hue, my mechanism story is wrong, and the whole run is VOID |
| **A3** candidate | `uShadowHold = 1` | full per-albedo hold |
| **A4** candidate | `uShadowHold = 0.6` | bracket |
| **A5** attribution | `uShadowHold = 1` + `uNeutralFill = 1` | how much of the residual is the hemispheric fill, which the candidate deliberately does not touch |

A1 is the null and A2 is the positive control. §255's lesson is that a null alone proves nothing —
black equals black — so A2 is registered with a magnitude it must clear.

## 7. Forecast (scored against the result afterwards)

1. `dunes` Δh 173.8 → **20–60°** at hold 1. G1 **passes, but not comfortably**.
2. `hero` Δh 165.6 → **25–70°** at hold 1. G2 is the one I expect to be marginal.
3. The **fill** is a large residual: A5 moves `dunes` shade hue by **≥ 30°** beyond A3.
4. `dunes` shade saturation **rises** (0.419 → 0.45–0.60) — the albedo's own chroma comes back.
5. `dunes` V ratio falls slightly (0.367 → 0.30–0.40) as the additive wash is withdrawn.
6. `interior` moves least of the three; G5/G6 pass.
7. Dark % rises on `dunes` (1.27 → 1.5–3.0), i.e. toward the reference, incidentally.

## 8. Mechanism the candidate implements

Not a constant tweak and not a new global tint. A new shader term, `uShadowHold`, gated on a
quantity computed **per pixel from `alb`**:

```
albChroma = (max(alb) − min(alb)) / max(alb)          // 0 for limestone/granite, ~0.55 for sandstone
hold      = uShadowHold · smoothstep(0, uShadowHoldKnee, albChroma)
tint      = albShadow · shadowLight                    // today's term, unchanged
held      = alb · lum(shadowLight),  renormalised to lum(tint)   // hue = the albedo's own, exactly
shadow    = mix(tint, held, hold)
wash      = shadowLight · uShadowWash · (1 − hold)     // the albedo-INDEPENDENT term, withdrawn where the material has its own hue
```

Three properties, all deliberate:

- **Achromatic-safe by construction.** Where hue is ill-defined (limestone, granite, plaster)
  `albChroma → 0`, `hold → 0`, and the material keeps today's violet-teal shadow. §2.1.3's "shadows
  are never grey" is preserved exactly where it is load-bearing.
- **Luminance-neutral.** `held` is renormalised to `lum(tint)`, so the mix is a pure hue lever and
  cannot buy G1 with brightness. Any V-ratio movement comes from the wash term alone.
- **`uShadowHold = 0` is bit-identical.** `mix(x, y, 0.0) == x` and `(1 − 0) == 1`, on any driver.
  A1 is therefore an exact null, not an approximate one.

**Nothing critic pass 2 set is reversed.** `shadowSat −0.35`, `shadowWash 0.05`, `shadowTeal 0.15`,
`shadowBounceMix 0.05` and `shadowTintPeak 0.62` all ship unchanged. The new term is gated on
albedo chroma, a quantity the old model never consulted, so both critics' findings survive in the
same build. That is the point of doing it this way rather than by moving a constant.

## 9. The §2.2 conflict, resolved before the measurement rather than after

Read literally, §2.2 says `SHADOW HUE #2a3f66 (violet-teal, ~14% of key luminance, never below)`.
"~14 % of key **luminance**" is a statement about a **light**, and the entry sits in the same list as
KEY LIGHT / FILL / BOUNCE / RIM. §2.2 therefore specifies the shadow's **illuminant**, and says
nothing about what hue a surface must render at once that illuminant multiplies it.

Back-derive the reference's own shadow illuminant from the walkway boards (linear, shade ÷ lit,
normalised to the max channel):

```
reference implied illuminant   (0.353, 0.402, 1.000)   hue 235.5°   sat 0.647
§2.2 SHADOW HUE #2a3f66        (0.174, 0.374, 1.000)   hue 225.5°   sat 0.826
```

**The reference confirms §2.2's hue to within 10°.** Where they differ is the light's *saturation*,
and that difference is decisive only because sandstone's own linear B/R (0.175) sits within 1 % of
the channel-order flip point of `#2a3f66` (0.174). Multiplied by §2.2's light, sandstone lands at
**4 % chroma** — near-perfect grey — and whatever small albedo-independent term is added next then
owns the hue. That is the actual mechanism behind the 176–187°: not a substitution *instead of* a
multiply, but a multiply that neutralises, plus an additive wash that repaints.

So §2.2 and the reference do **not** conflict. What conflicts with the reference is
`DERIV-shadowhue-target.md` §3's reading of §2.1.3 — "gold sandstone against deep teal shadow" taken
as a per-surface requirement that the shaded half of a material sit at its own complement. §5 of
this file picks against that reading, with reasons stated there and in KNOWN_ISSUES.
