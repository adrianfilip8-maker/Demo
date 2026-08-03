# PREREG-gate1 — the depth-dependent shadow bounce (§115.4's structural candidate)

Written **before any arm frame exists**. Everything below is source arithmetic and archived
measurement, both of which cost no lock. Implementation is in the tree
(`ToonMaterial.TUNE.shadowBounceMixLit` / `.shadowDepth`, `toon.glsl.js` `slyShadD`).

## The design

`_refreshShadowColor` now builds the shadow light **twice** — same teal blend, same floor,
same peak cap `k`, differing only in bounce share — and the shader picks between them on
`shadowMix = 1 - key`:

```glsl
vec3 slyShadD = mix( uShadowColorLit, uShadowColor,
                     smoothstep( uShadowDepth.x, uShadowDepth.y, shadowMix ) );
```

Deep shade keeps `shadowBounceMix` (0.05, the value that passes the ledger); the shallow end
gets `shadowBounceMixLit`. **Default is `Lit == Mix`, which makes the two uniforms bitwise
equal and the mix a no-op** — `base` and `base2` test that on the frame rather than assuming it.

## What the arithmetic already says, at zero lock cost

**The model is validated.** `scratchpad/depthbounce.mjs` transcribes `_refreshShadowColor` and
reproduces all three live `uShadowColor` readbacks in `sweep.json` to **1.06e-11**
(`base`, `sbm20`, `teal0`). It caught its own error doing so: the module default
`keyIntensity 2.55` under-scales `k` by **19.74%** because LIGHTING republishes the key per
time-of-day and the peak cap binds on the republished value (hero `keyLum` 2.424, not 1.858).
`teal0` matched at the wrong `keyLum` and the other two did not — a *constant ratio* across
arms, which is what localised it as a scale bug rather than a hue bug.

**The knob's authority is exactly proportional to shadow depth.** This is algebra over the
shipped expression, not a render model, and it does not depend on albedo, ao, normal or the
tone curve. `uShadowColor` enters the composite in exactly two places and both carry a
`shadowMix` factor:

```
+ albShadow * shadCol * shadowMix * mix(0.55, 1.0, ao)
+ shadCol   * uShadowWash * shadowMix * ao
```

so `d(diff)/d(sbm) ∝ shadowMix`, with a shadowMix-independent prefactor
(`scratchpad/gateauth.mjs`). In linear radiance the knob adds red and removes blue:
`d(uShadowColor)` for 0.05 → 0.20 is `(+0.0628, −0.0116, −0.0703)`.

**Therefore the briefed shape has an arithmetic ceiling, and I am registering it as such
rather than discovering it after the capture.** Protecting deep shade forfeits most of the
available authority *by construction*:

| hand-over at shadowMix | recovery vs a full revert (uniform / shade-heavy / lit-heavy depth distribution) |
|---|---|
| 0.70 | 25.8% / 16.6% / 40.5% |
| 0.85 | 43.0% / 32.4% / 60.1% |
| 0.95 | 57.0% / 47.1% / 72.9% |

Against §115.1's measured full revert (**120% / 65% / 74%** of the drift on
hero / temple / sly-closeup), a gate handing over at 0.85 can deliver roughly
**39–72% of hero's drift and 21–39% of temple's**. The true frame weighting needs a capture;
the three columns bracket it.

> **This contradicts the brief's premise that the depth gate is "the only shape that satisfies
> both acceptances".** It is the only shape that satisfies the *hue* acceptance while moving
> b−r at all, but it cannot on its own return b−r to tx7 unless the frame's depth distribution
> is strongly lit-heavy. The authority it cannot reach lives in terms **not** gated by
> `shadowMix` — principally the ambient fill, which §115.1 already measured at 32% / 24% / 15%
> (`fill0`). If the gate lands inside its predicted band, the completion is gate + fill, not a
> bigger gate.

## Arms (one boot, live TUNE pokes, `dt = 0`, per §115's method)

`shadowBounceMix` stays 0.05 in every gate arm; only `Lit` and the window move.

| arm | Lit | window | why |
|---|---|---|---|
| `base` | 0.05 | — | null; must equal `base2` |
| `gate20_70` | 0.20 | [0.30, 0.70] | conservative protection |
| `gate20_85` | 0.20 | [0.45, 0.85] | the registered primary |
| `gate20_95` | 0.20 | [0.55, 0.95] | protect only the deepest |
| `gate35_85` | 0.35 | [0.45, 0.85] | overdrive the shallow end to buy back the ceiling |
| `sbm20` | — | — | full revert: known +120/65/74% b−r, known magenta failure |
| `sbm085` | — | — | uniform 0.085 — the b−r-parity **extrapolation** |
| `sbm175` | — | — | uniform 0.175 — the tx7-parity **extrapolation** |
| `base2` | 0.05 | — | self-control; if it differs from `base`, every number here is void |

Shots: **hero, temple, sly-closeup, night**. Night is not optional — acceptance #3.

## Predictions — falsifiable, scored against the sweep

- **P1 (null).** `base2` is bit-identical to `base` on all four shots, and `base` reproduces
  the shipped frame. *If not, the poke/restore path leaked and nothing here is scoreable.*
- **P2 (the ceiling).** `gate20_85` closes **20–60%** of hero's drift and **13–40%** of
  temple's — the band the algebra predicts. *Landing outside it falsifies either the
  proportionality argument or my reading of the frame's depth distribution, and I want to know
  which.* Above the band would mean the frame is far more lit-heavy than any column assumed.
- **P3 (the hue acceptance holds).** Every `gate*` arm keeps temple's shadowed bay at
  **hue ≤ 226° and G-darkest < 50%** — the ledger line `base` passes at 211° / 5.7% and the
  revert fails at 270° / 66.7%. *This is the blocking secondary. A gate arm that fails it is
  dead regardless of its b−r.*
- **P4 (monotone in the hand-over point).** b−r recovery rises `gate20_70 < gate20_85 <
  gate20_95` and bay hue worsens in the same order. *If recovery does not order that way the
  gate is not doing what the algebra says and P2's band is meaningless.*
- **P5 (the extrapolations are predictions, NOT candidates — registered to be falsified).**
  `sbm085` and `sbm175` are uniform values extrapolated **through AgX**, which is non-linear;
  they are not measurements. Registered expectation: `sbm085` closes ~35–45% of hero's drift
  and **fails P3's hue line** (a uniform value cannot protect deep shade — that is the whole
  of §115.4). *If `sbm085` passes P3, the depth gate is unnecessary and should not ship.*
- **P6 (night is not paid for).** No `gate*` arm moves `night`'s frame luma by more than
  **2%** or its b−r by more than **0.010**. §112.3 says night is what the cool terms buy; the
  gate acts on the shallow end of shade, which is most of a moonlit frame. *This is the arm I
  most expect to be surprised by, and it is why night is in the plan rather than assumed.*
- **P7 (collateral is wide).** `shadowMix` is non-zero over ~88.8% of frame, so every gate arm
  changes >50% of pixels. Measured, not assumed. A large changed-pixel count is **not**
  evidence the fix works — §8's shadow wash moved 83.8% of the frame and left the defect
  bit-intact.

## What would make me wrong in a way I would not otherwise notice

The gate is indexed on `shadowMix = 1 - key`, and `key = ramp * sh` folds the **cel-banded**
N·L together with the cast-shadow mask. So the hand-over point is not a smooth function of
geometry: it can land *on a band terminator*, where §8 records whole flat face populations
sitting exactly on a band edge (`temple` +Z walls at ndl 0.15 vs terminator 0.14, 39.75% of
visible architecture by solid angle). If the window straddles that population the gate will
switch bounce share across a face that has no gradient, and the failure mode is a visible
**hue step along a band edge** — which no frame-mean statistic in this plan can see.

Guard: the arm PNGs are written to be looked at at 1:1 on temple's near columns, and I will
say explicitly whether a hue seam appears, before quoting any number as a pass.

## Acceptance (inherited, not renegotiated)

Unchanged from PREREG-drift1 and the ledger: (1) frame b−r materially back toward tx7 on hero
**and** temple **and** sly-closeup; (2) shadowed-architecture hue ≤ 226° with saturation not
collapsing; (3) `night` re-measured; (4) the frames looked at side by side.

---

## AMENDMENT (written while the sweep was booting, before any arm frame existed)

Working through `shadowMix = 1 - ramp*sh` sharpens two of the predictions above into much
stronger, cheaper-to-falsify forms. Recording it now so it cannot be mistaken for a
post-hoc reading of the frames.

**A1. The gate is inert on the entire `archShade` population, by construction.**
`archShade` is `ndl < -0.05`, so `slyRamp(ndl) = 0`, so `key = ramp * sh = 0` and
`shadowMix = 1` *exactly* — not approximately. Every gate window here tops out at or below
0.95, so `smoothstep(lo, hi, 1.0) = 1` and the shader selects `uShadowColor` verbatim.

> **Therefore P3 cannot fail for a gate arm, and passing it is not evidence the gate works.**
> The ledger's hue line is measured exactly where the gate is switched off. I am registering
> the sharper prediction instead: **every `gate*` arm is bit-identical to `base` on all
> `archShade` samples** (`d(b-r) = 0.0000`, hue unchanged, G-darkest unchanged). If any gate
> arm moves `archShade` at all, my reading of the ramp is wrong and the window is reaching
> pixels I did not intend it to reach.

This is the same trap §115.2 names: a statistic that is structurally incapable of seeing the
thing being argued about. Reporting "the hue line still passes" as a *result* of this change
would be exactly that error, one section later.

**A2. The gate's real target is the cel MID-BAND, and that is where the visual risk is.**
`slyRamp` is a 3-band quantiser with terminators at `uTermLo` 0.14 / `uTermHi` 0.52 and
~0.03-wide smoothsteps, so `ramp` is near-discrete and `shadowMix` is close to tri-modal:
~0 (lit), ~0.5 (cel mid-tone), 1 (shadowed, by either mechanism — facing away *or* cast
shadow, since either zeroes the product). The `[0.45, 0.85]` window puts the mid-band at
`smoothstep = 0.043`, i.e. it receives ~96% of the *lit* bounce share.

So the gate is, in practice, a recolour of the cel mid-band. Two consequences:
- Its authority is bounded by how much frame the mid-band occupies — a quantity none of
  PREREG's three depth-distribution columns modelled, because they assumed a smooth
  distribution and the real one is banded.
- **The failure mode is a hue step co-located with the existing band terminator**: bounce
  share jumps ~0.20 -> 0.05 across the same edge where luminance already steps. §8 measures
  39.75% of `temple`'s visible architecture by solid angle sitting *on* the `lo` terminator.
  That is a large population to put a colour discontinuity through.

**Registered:** I will look at `temple` and `hero` at 1:1 across a terminator before quoting
any b-r number as a pass, and I will say whether a coloured fringe appears. If it does, the
window must move off the band edge (or the gate must be indexed on something continuous,
e.g. `sh` alone rather than `ramp * sh`) — and that is a redesign, not a retune.
