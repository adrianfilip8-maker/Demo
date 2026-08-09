# PREREG-specnorm — energy normalisation of the stepped specular lobe

Registered **before** the candidate exists (§141.1). Every threshold below is derived here, from
the census-corrected model in `progress/records/specmodel.mjs` + `normmodel.mjs` and from §262's
*measured* frames. Nothing in this file may be re-derived after a frame is captured. A
mis-derived threshold is VOID, stated as VOID, and not replaced.

Predecessors: §256 (no highlight range), §261 (`shadowTintPeak` is inert), §262 (`uSpecKey` —
committed, correct, shipped **INERT** at `TUNE.specKey = 0` because it failed its own ship rule).

---

## 1. The defect

`toon.glsl.js:676-678`:

```glsl
float glossP   = max( uGloss * ( 1.0 - 0.6 * rgh ), 4.0 );
float lobe     = pow( ndh, glossP );
float specStep = smoothstep( 0.30, 0.52, lobe ) + 0.35 * smoothstep( 0.02, 0.30, lobe );
```

`smoothstep` returns [0,1], so `specStep` is bounded at **1.35 for every `glossP`**. The support
of the stepped lobe is the spherical cap `ndh >= 0.30^(1/glossP)`; to first order
`1 - ndh ~ 1.204/glossP`, and the cap's solid angle goes as `(1-ndh)`, i.e. **as `1/glossP`**.
Amplitude constant x support `1/glossP` means **total reflected energy falls as `1/glossP`**:
raising gloss makes a highlight smaller *and no brighter*, which is backwards. A physical lobe
conserves energy, so a tighter highlight must be a brighter one. The missing factor is the
normalised Blinn-Phong term, `(glossP + 8) / 8` (the `1/8pi` convention minus the `pi`, which
this shader drops everywhere).

## 2. The candidate — one uniform, exponent on the textbook normalisation

```glsl
float specNorm = uSpecNormPow > 0.0 ? pow( ( glossP + 8.0 ) * 0.125, uSpecNormPow ) : 1.0;
```

`uSpecNormPow = 0` takes the **literal-`1.0` branch**: no arithmetic at all, so the shipped
default is bit-identical without depending on how a driver spells `pow` or `mix`. That is the
standard `uShadeBand` already sets in this file. The branch is on a uniform, so control flow
stays quad-uniform and nothing inside it samples a texture.

`p = 1` is textbook energy conservation; `0 < p < 1` is a partial normalisation that keeps the
*ordering* by gloss as a clean power law (`amplitude ∝ glossP^p`) rather than an ad-hoc blend.

**Level is not a second normalisation knob.** An anchored form `(glossP+8)/(ref+8)` is exactly
`(glossP+8)/8` divided by the constant `(ref+8)/8` — verified numerically in `normmodel.mjs`
(`ref14` is `ref0 x 0.3636 = 8/22` on every row). A scene-wide divisor is what `uSpecGain`
already is, so `ref` would be a redundant uniform and is not added. The family has exactly two
degrees of freedom: **slope** (`uSpecNormPow`, new) and **level** (`uSpecGain`, existing).

### 2.1 Whether `specKey` rides along — decided here, in advance

They multiply. §262 shipped `uSpecKey` inert at 0. The model (§3) says the two stacked at `p=1`
move `slydlrig:mesh` by **+65.4 L** and `ceiling_stars` by **+77.8 L** on lobe-saturated pixels,
which is a scene re-light and not a highlight. **The registered candidate is normalisation
alone, with `specKey` left at 0.** One stacked arm (`p=0.5 x specKey 1`) is captured to *size*
the interaction, and it is registered as measurement, **not** as a ship candidate: `specKey`
cannot be enabled by this ticket whatever that arm shows, because its own ship rule in
PREREG-hilite2 already failed and this run does not re-litigate it.

## 3. The model, and what it corrects in the handoff

`normmodel.mjs`, census-corrected inputs (`rgh = ormG`; `material.roughness = 1.0` on every
mapped material — §262). `glossP` and the factor `(glossP+8)/8` per class, with mesh counts from
the live 102-material census:

```
material              n   rgh   glossP  halfAng   (n+8)/8   ^0.5   ^0.35
gold_leaf            14  0.22    95.5     6.7      12.94    3.60    2.44
props gold (coins)    6  0.28    79.9     7.3      10.98    3.31    2.29
bronze_dark           3  0.42    53.9     8.9       7.73    2.78    2.02
granite_pink          3  0.48    44.1     9.8       6.52    2.55    1.90
hieroglyph_gilded     4  0.55    42.9    10.0       6.36    2.52    1.88
limestone_polished    2  0.62    28.9    12.1       4.61    2.15    1.70
slydlrig:mesh         7  0.62    20.1    14.5       3.51    1.87    1.55
ceiling_stars         4  0.80    15.6    16.5       2.95    1.72    1.46
sandstone_block       3  0.93     8.8    21.8       2.10    1.45    1.29
paving_courtyard     16  0.95     6.9    24.6       1.86    1.36    1.24
sandstone_worn        5  0.97     5.9    26.6       1.73    1.32    1.21
mudbrick              3  0.99     4.1    31.7       1.51    1.23    1.15
```

**The handoff's "≈ x12.9" is gold_leaf only, and it is the least of the problem.** The frame is
made of `paving` (16 meshes) at `glossP` **6.9** and the sandstones at 5.9-8.8, where the factor
is **x1.7-2.1** — the same order as `uSpecKey`'s x2.423, not five times it. Written down now
because it changes what this ticket can possibly deliver.

**And the re-ordering risk is not the one the handoff names.** In *display* space (AgX; the
tonecurve model is validated to 0.35 L against the shipped chain) the movers at `p=1`, on
lobe-saturated pixels, are:

```
material              lit total NOW -> p=1 (norm only)      d L
ceiling_stars           131.1 -> 177.5                    +46.4
bronze_dark             203.1 -> 248.8                    +45.7
slydlrig:mesh           154.7 -> 193.5                    +38.9
granite_pink            198.9 -> 234.9                    +36.0
hieroglyph_gilded       221.6 -> 251.0                    +29.4
gold_leaf               241.4 -> 254.7                    +13.2   <- x12.94 buys 13 L
limestone_polished      222.5 -> 232.6                    +10.1
sandstone_block         199.4 -> 201.7                     +2.3
paving_courtyard        204.3 -> 205.3                     +1.1
mudbrick                170.5 -> 171.3                     +0.8
```

"Gold sings, limestone turns to plastic" is **not** what the arithmetic predicts. Gold is already
on the flat of the tonemap: x12.94 in scene radiance buys **13 display levels** and then clips.
The materials that move are the **dark and glossy** ones, which sit where the curve is steep —
`ceiling_stars` (dark blue, gloss 30), `bronze_dark`, `granite_pink`, and **Sly's own mesh**.
That is the regression this run must guard, and it is why G4 exists.

## 4. Predicted mechanism, named in advance

1. **Normalisation raises amplitude and does not widen the lobe.** `glossP` is untouched, so the
   affected pixel set is bounded above by today's `specStep > 0` population. It cannot create
   new highlight *area*, only make the existing area brighter.
2. **It feeds bloom.** `PostFX.js:428 bloomThreshold 2.20`; §25 measured `gold_leaf` at 4.025
   scene already reaching bloom. At `p=1` gold is 52.1 scene. Bloom is a spatial gather, so this
   can raise *neighbouring* pixels and therefore `p50` — a mechanism the per-pixel model in §3
   does **not** contain. G2 is the gate that catches it.
3. **It cannot touch a shadow.** `spec` is multiplied by `sh * step( 0.02, ndl )`. G3 and G5 turn
   that into falsifiable predictions.

## 5. Arms — one boot, one browser, `dt: 0` at every frame-advancing call (§195/§251)

Uniform pokes on shared uniform objects; no source edit inside the held ticket, no rebuild, no
per-arm navigation. Order is fixed; `base2` is **last** so I1 proves that returning the lever to
0 reproduces `base` exactly, not merely that `base` repeats.

| arm | uSpecNormPow | uSpecKey | uSpecGain | role |
|---|---|---|---|---|
| `base`  | 0 | 0 | 1 | the shipped build |
| `off`   | 0 | 0 | 0 | **positive control** — must differ from `base` |
| `n035`  | 0.35 | 0 | 1 | candidate |
| `n050`  | 0.50 | 0 | 1 | candidate |
| `n100`  | 1.00 | 0 | 1 | candidate — textbook |
| `n050k` | 0.50 | 1 | 1 | interaction sizing only, **never a ship candidate** (§2.1) |
| `base2` | 0 | 0 | 1 | **null arm** — must be 0 px vs `base` |

Shots: `hero`, `temple`, `courtyard`, `sly-closeup` (§256's four) + `interior` (§262's exact
zero). 1280x720.

## 6. Instrument checks — a run that fails these reports VOID, not a result

- **I1 NULL** `base2` vs `base` = **exactly 0 px** on every shot. Repeatability.
- **I2 POSITIVE CONTROL** `off` vs `base` > 0 px on all four **outdoor** shots. §255: a null arm
  proves repeatability, not sensitivity — black equals black. `interior` is exempt and is
  predicted to be 0 (see G5).
- **I3 APPLIED STATE** read back off the live uniform per arm; all seven distinct.
- **I4 MODE-4 CALIBRATION** `debugTerm(4)` triple `(64,128,191)` on > 5 % of frame. Below that,
  every masked share is VOID and only display bytes stand.
- **I5 CLASS-MAP CALIBRATION** (new channel, §7): `debugTerm(7)` must resolve **>= 6** distinct
  `(uSpec, metal)` buckets summed over the five shots, and every bucket's `uSpec` must match a
  row of the live census to within **1/255**. If it does not, **all per-class attribution in
  this run is VOID** and the whole-frame numbers stand alone.

## 7. `debugTerm(7)` — the per-class map, so "what it did to each material class" is measured

§262's per-class table was **modelled**, and its two-class warm/neutral delta split cannot tell
sandstone from limestone. New mode:

```glsl
dbgT = vec3( uSpec, glossP / 128.0, slyMetal );
```

R identifies the class (23 distinct `uSpec` in the census), B separates metal from dielectric,
G carries the *per-pixel* `glossP` (it varies within a material with `ormG`) and therefore the
exact normalisation factor applied at that pixel. Mode 6 keeps its current triple and its
current numeric argument; its guard changes from `else` to `else if ( uDebugTerm < 6.5 )`, which
is the same branch for every value already in use.

## 8. Registered thresholds

### Deliverable

- **T1** — `p99 >= 200` on **>= 3 of the 4 outdoor shots**. *Inherited verbatim from
  PREREG-hilite1 / hilite2 so it cannot be moved.* Previous result 0/4.
- **T2** — `>230` share `>= 0.20 %` of frame (1 843 px at 1280x720) on **>= 3 of 4 outdoor**.
  *Inherited verbatim.* Previous result 0/4.
- **H1** — the weaker "a highlight exists at all" bar: `>230 >= 0.02 %` of frame on **>= 3 of 4
  outdoor** shots whose `base` is `<= 0.005 %`. Previous run's H6 passed **1 of 4**
  (`courtyard`). `sly-closeup` base is 0.0046 % and `interior` 0.0943 %, so H1's precondition
  admits `hero`, `temple`, `courtyard`, `sly-closeup` and excludes `interior`.

### Guards — a candidate that fails any of these does not ship at that value

- **G1 BLOW-OUT** `>250 <= 0.50 %` of frame on every shot **and** the rise over `base` is
  `<= 0.40 pp`. *Derived*: `base` is 0.0000 % on all five shots; the fully-saturated lobe is at
  most **0.59 %** of frame (`courtyard`, 5 442 px, §262). 0.50 % can therefore only be failed by
  clipping essentially the entire saturated lobe **and** recruiting more — i.e. by bloom
  spilling (§4.2), which is exactly what it is for.
- **G2 MID-TONE HOLD** `p50` rises by `<= 4 L` on every shot **and** stays `<= 130`. *Derived*:
  `base` p50 is 71 / 89 / 104 / 82 / 66, so the `<= 130` half is slack and the **+4 L** half is
  the live bar. A specular must make a highlight, not lift the picture.
- **G3 SHADOW HOLD** `p1 <= 45` everywhere **and** `|dp1| <= 2 L`. *Derived*: `base` p1 is
  15 / 31 / 23 / 25 / 14. `spec` is gated by `sh * step( 0.02, ndl )`, so a shadow change means
  the edit escaped the gated term.
- **G4 CHARACTER HOLD** on `sly-closeup`, the **median** rise over pixels that are *both* in the
  `slydlrig:mesh` class (mode-7 `uSpec` 0.25, metal 0) *and* lobe-saturated (mode-6 `R >= 252`)
  is `<= 20 L`. *Derived*: the §3 model puts that population at **+38.9 L** at `p=1` and
  **+18.3 L** at `p=0.5`, so a 20 L bar admits `p ~ 0.5` and refuses `p = 1`. Sly's `uSpec` 0.25
  is the **TUNE default and was never art-directed for fur** (§262); amplifying an un-authored
  value until the character reads wet is a regression however correct the physics.
- **G5 GATED-TERM INVARIANCE** `interior` is **byte-identical** between `base` and every
  normalisation arm. *Derived*: §262 measured **0.000 %** of `interior`'s toon population with
  `sh * step( 0.02, ndl ) > 0`, so `specNorm` multiplies exactly zero there. A predicted exact
  zero; any non-zero diff means the change reached something other than `spec`.

### Ship rule

> **Ship the largest `uSpecNormPow` in {0.35, 0.50, 1.00} that satisfies G1-G5 with I1-I4 fired,
> provided H1 passes at that value. If no swept value satisfies both, `TUNE.specNormPow` stays
> 0 and the shipped build is bit-identical.** `uSpecKey` stays 0 regardless (§2.1).

## 9. Forecast — scored afterwards, wrong or right

Recorded so it can be marked wrong. §262's forecast was wrong on 3 of 4 shots and by >10x on
magnitude, and saying so is why its result is usable.

1. **T1 and T2 both FAIL, 0/4 or 1/4.** The frame's mass is `paving`/`sandstone` at `glossP`
   5.9-8.8 where `p=1` is only x1.7-2.1, worth **+1 to +2 L** (§3). p99 is a 9 216-px statistic
   and the entire saturated lobe is 908-5 442 px, so it cannot move p99 by 20 L.
2. **H1 passes on 2 of 4** — `courtyard` (already 272 px under `uSpecKey` alone) and `hero`.
   Confidence low: §262's equivalent call was wrong on 3 of 4 shots.
3. **G4 is the binding constraint, and it binds at `p = 1`.** Predicted: `p=1` FAILS G4 on
   `sly-closeup`, `p=0.5` passes, `p=0.35` passes. **Therefore the predicted ship value is
   `uSpecNormPow = 0.50`.**
4. **G1 holds at every swept value** (`>250` stays `<= 0.10 %`), because gold is already on the
   flat of the AgX curve. Named as the most likely place for me to be wrong, since it is the one
   prediction whose mechanism (bloom's spatial gather) is *not* in the model.
5. **G2 is the second most likely failure**, on `courtyard` at `p=1`, via bloom rather than via
   the direct term.
6. **`interior` is byte-identical on all normalisation arms** (G5). Exact zero predicted.
7. **The stacked arm `n050k` exceeds G4 and G2** and confirms §2.1's decision to leave
   `specKey` at 0.
8. Per class at the shipped value, the biggest display-space mover will be **`ceiling_stars` or
   `bronze_dark`, not `gold_leaf`** — the inversion of the handoff's expectation.
