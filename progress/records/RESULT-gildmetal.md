# RESULT-gildmetal — should `hieroglyph_gilded` carry a lower metalness than solid metal?

Scored against `progress/records/PREREG-gildmetal.md`. One boot, four arms, `hero` 1280×720
quality `high`. Frames: `shots/gild/hero-{base,base2,lo,restore}.png`.
Tools: `tools/gildrim.mjs` (offline population), `tools/gildmetal.mjs` (arms),
`tools/gilddiff.mjs` (scoring), `tools/gildwhy.mjs` (the two follow-ups).

## Verdict

**No. Ship the mechanism, keep the value.** `hieroglyph_gilded` stays at 0.85.

Lowering it to 0.45 made the gold **measurably worse on the exact axis §7.3 complains about**,
and the frames agree with the numbers. The recipe-level inconsistency the routing identified is
real and is now fixed structurally (per-recipe `metalAmount`, `Architecture.js:179`,
`Props.js:529`) — but no recipe declares a reduced amount, because the one arm that tested the
idea is a regression.

## Validity — both gates pass, and the first one is the expensive one

| gate | result |
|---|---|
| `base` vs `base2` (dt=0 clock pin) | **0 px changed** — the pin held |
| `base` vs `restore` (poke reversible) | **0 px changed** |

The pin gate matters: `Debug.js`'s own note records a gold-bloom sweep voided because its
*duplicate* arm moved more pixels than its strongest real arm. Every step here ran `step(n, 0)`
and the duplicate is bit-identical, so nothing below is phase noise.

## P1 — FALSIFIED, and in the informative direction

Gild population, 271,394 px:

| metric | base 0.85 | lo 0.45 | Δ |
|---|---|---|---|
| L | 52.11 | 58.89 | **+6.78** |
| R | 53.81 | 56.40 | +2.59 |
| G | 50.97 | 58.90 | +7.93 |
| B | 58.43 | 66.18 | +7.75 |
| **R−B** | **−4.62** | **−9.79** | **−5.17** |
| saturation | 0.3259 | 0.3260 | +0.0001 |

P1 predicted warmer and more saturated. The arm delivered **brighter and bluer, at flat
saturation**. Note `R−B` is *already negative at base*: the gilding measures blue-dominant in
frame before anything is changed, which is §7.3's "gold doesn't read as metal" stated as a
number. The arm doubled that deficit.

**Looked at, not just counted** (the brief's standing instruction): in `hero-lo.png` the kiosk
lintel loses the warm rust-brown mottling it has in `hero-base.png` and flattens toward a uniform
grey-blue. The frames and the statistic say the same thing.

## Why — and it is NOT the AgX shoulder

§132.1's carried caution predicted the R/G/B asymmetry would be the AgX shoulder compressing R.
**That is refuted by the data.** If R were shoulder-limited, its deficit would *grow* with base
luma. It shrinks, monotonically, and reverses:

```
base L band      n        dR       dG       dB     dR-dG
  0-20        6811      2.58    10.85    11.65     -8.26
 20-35       78092      2.74     9.73     9.68     -6.98
 35-50       82302      3.86    12.58    12.45     -8.72
 50-70       41337      2.16     5.30     4.78     -3.15
 70-95       40552      1.03     1.16     0.85     -0.13
 95-130      18673      0.86     0.79     0.63     +0.08
130-256       3627      1.71     0.71     0.35     +1.00
```

The blue skew lives entirely in the **dark** half of the population, and dies at L≈70.

The mechanism is a term-ordering fact in `toon.glsl.js`, and it is the finding worth keeping:

```glsl
diff = albKey*…  +  albAmb*slyFillX*ao
     + albShadow*slyShadX*shadowMix*mix(0.55,1.0,ao)
     + slyShadX * uShadowWash * shadowMix * ao;     // <- NOT multiplied by albedo, and blue
diff *= mix( 1.0, 0.20, slyMetal );                 // <- scales all four, including the wash
```

The additive blue shadow wash sits **inside** `diff`, so `slyMetal` attenuates it along with the
three albedo-multiplied terms. Raising the diffuse multiplier from 0.32 to 0.64 therefore
restores the *blue wash* at the same rate as it restores the gold. On shadowed gild — and
167,205 of the 271,394 gild px sit below L 50 — the wash is the larger of the two, so "restoring
diffuse" restores mostly blue. On lit gild (L ≥ 95, 22,300 px) the albedo term dominates and the
response goes correctly warm (`dR−dG` +0.08 → +1.00), which is the same mechanism seen from the
other side and is what makes this an explanation rather than a curve fit.

**This is arguably a shader defect and it is not mine.** Metalness suppresses a surface's diffuse
*albedo response*; there is no physical reason for it to attenuate an additive atmospheric wash.
Moving that term outside the multiply would make the metalness knob mean what its name says on
exactly the population where it currently misbehaves. **Owner: SHADING** (`toon.glsl.js`, the
`diff` assembly). I have not touched it.

## P2 — holds, and is now moot

Predicted the arm would also reduce the metal read: `specAmt` −32%, `metalEnv` −47%. Both are
arithmetic identities in `slyMetal` and hold by construction. Since P1 also went the wrong way,
the arm has no compensating benefit — this is not a trade, it is a loss on both axes.

## P3 (control) — passes in substance

`gold_leaf` + `bronze` = 2,570 px in frame; 118 changed. Raw, that reads as a failure, so it was
instrumented rather than argued (`tools/gildwhy.mjs`):

| distance from changed control px to nearest gild px | n |
|---|---|
| ≤ 1 px | 42 |
| ≤ 2 px | 33 |
| ≤ 4 px | 33 |
| **> 4 px (interior — where a real leak would live)** | **10** |

108 of 118 are boundary-adjacent: post-process bleed plus 1–2 px misregistration between the
*offline* mask and the real render, on hook rings whose silhouette is 1–2 px wide. The decisive
number is not the count but the magnitude ratio: **control mean L moved 0.132 while gild mean L
moved 6.78 — 51:1.** A shared constant would have moved all 2,570 control px by a comparable
amount. It moved none of them meaningfully. The uniform readback confirms it directly: the poke
matched only `arch:hieroglyph_gilded` and the tool aborts if it matches zero or reads back a
different value.

## P4 (scope) — passes

227,654 px changed; 213,075 on the gild mask, 14,579 (6.4%) elsewhere, all of it consistent with
bloom and the ink pass spreading a gild change onto neighbours. The bbox test registered in the
prereg turned out to be uninformative for `hero` specifically — the gild spans the frame corner
to corner here — so the 6.4% figure carries it instead. Registered as a weakness of the
pre-registered test, not a pass I am claiming more strongly than it deserves.

## What was measured about the population, and what it settles

`tools/gildrim.mjs`, offline, no lock — CPU rasterisation reproducing the shader's own arithmetic
including GPU `dFdx`/`dFdy` semantics for the silhouette gate:

| shot | gild % of frame | rim share | spec share (upper bd) | env share |
|---|---|---|---|---|
| hero | 29.7% | 6.3% | 4.9% | **100%** |
| courtyard | 6.0% | 18.7% | 0.7% | **100%** |
| temple | 1.8% | 12.3% | 0.6% | **100%** |

Instrument validated independently: KNOWN_ISSUES §8 records this recipe as 28.7% of `hero` from a
different method; I measure 29.7%.

**The routing's premise needs one correction.** It asked for the rim share on the grounds that
"the multiply's effect is entirely conditional on rim/spec/env being present". Rim is **not a
metalness consumer**: `Architecture.mat()` sets `rim: TUNE.rimStrength * (r.metal ? 1.15 : 1.0)`
from the **boolean**, and `slyMetal` never reaches the rim term in `TOON_SHADE`. Confirmed in the
live renderer — all four Architecture metals report `uRim 0.598` regardless of anything else. So
the rim share, small as it is, could not have decided this either way. The population metalness
actually moves is `diff` and `metalEnv`, both at **100%** of the gild mask.

## Incidental findings, routed

1. **`guard_metal` runs `uMetal 0.85` with `metalnessMap false`** — unmasked, so the whole
   material is metal rather than the gilded texels only. Every Architecture and Props metal
   carries the ORM mask; this one does not. Owner: **GUARDS**. Not investigated further.
2. Five materials, five deliberately different `uSpec` values (0.95 / 0.55 / 0.20 / 0.62 / 0.95),
   all previously collapsed to one `uMetal`. That collapse is what this change removes.
3. TEXTURES already established (`Materials.js:230-270`) that `spec: 0.55` in
   `Architecture.RECIPES` is the binding constraint on this surface and that the frame cap is the
   AgX shoulder. **`spec` remains the untested Architecture-side lever; `metal` is now tested and
   closed.** A `uSpec` 0.55→0.85 arm on `hieroglyph_gilded` is the obvious next experiment and it
   is a one-uniform poke of exactly this shape.
