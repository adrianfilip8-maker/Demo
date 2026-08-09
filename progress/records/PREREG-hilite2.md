# PREREG — hilite2: couple the specular to the key radiance

**Owner:** SPECULAR (`src/render/shaders/toon.glsl.js`, `src/render/ToonMaterial.js`)
**Written:** before any candidate arm was captured. The levers exist in the tree and are inert
at their shipped defaults; **no frame at `uSpecKey > 0` had been rendered or looked at when the
thresholds in §6 were fixed.** (§141.1: thresholds are registered before the candidate, not
re-derived after it. A mis-derived criterion is VOID and does not get re-derived — see §261's C5.)

---

## 1. The finding this picks up

`toon.glsl.js` before this change:

```glsl
596:  vec3 diff = alb * keyRad * key * mix( 1.0, ao, uAoKey ) …          // scales with the sun
622:  vec3 sss  = alb * uSssColor * keyRad * ( sssAmt * uSss * 2.4 * sh );  // scales with the sun
674:  vec3 spec = specTint * ( specAmt * specStep * sh * step( 0.02, ndl ) );  // DOES NOT
919:  outgoingLight = diff + sss + spec + metalEnv + rim + emissiveTerm;
```

`keyRad = uKeyColor * uKeyIntensity` has luma **2.423**. `spec` was the only lit term decoupled
from the sun, and it is the one term physically entitled to exceed the albedo — a specular
highlight is a reflection *of the light source*, not of the surface. Verified in the source
before this file was written; the line numbers above are pre-edit.

§256 closed off the tonemap (transcribed and calibrated to 0.0 L on 11 of 11 grey-axis rows;
display 230 needs scene 2.236 and the chain delivers 254.7 if given radiance), the sun
(`sunIntensity` 3.30 → 8.58 moved `hero` p99 from 182.6 to 186.4; both gates failed), and §261
closed off the shadow clamp (both shadow terms carry `shadowMix = 1 - key`, which is exactly 0
on the brightest pixels, so the clamp has no authority over p99 *by construction*).

## 2. The change, and why 0 is bit-identical legacy

Two shared uniforms, merged into every material by identity in `onBeforeCompile`, neither
republished per frame — so a poke of `shading.uniforms.uSpecKey.value` reaches the whole scene
and sticks across `__GAME.step()`.

```glsl
vec3 spec = specTint * mix( vec3( 1.0 ), keyRad, uSpecKey )
          * ( specAmt * specStep * sh * step( 0.02, ndl ) * uSpecGain );
```

* `uSpecKey = 0` (**shipped default**) is bit-identical to the legacy line. `mix(x, y, 0)` is
  `x*(1-0) + y*0 = x + 0 = x` exactly for every finite `y`, however a driver spells `mix`
  (the `x + a*(y-x)` form gives `x + 0*(y-x) = x` too). `specTint * vec3(1.0) == specTint`
  componentwise, and `(specTint) * s` is the same expression the legacy line evaluated.
* `uSpecGain = 1` (**shipped default**) is `s * 1.0 == s` exactly. `uSpecGain = 0` removes the
  whole term — that is the attribution instrument, not art direction.

**Declared, and NOT measured in this run:** the IEEE argument above is why no arm here compares
the edited build against the pre-edit build. A cross-boot comparison has a measured drift floor
(§220: 3087/57600 px between boots) and `shots/r8` is several commits stale — PREREG-hilite1's
T6b already missed on exactly that, by 1.22–7.24 L. So bit-identity with the legacy build is an
arithmetic claim in this document, and what the capture proves instead is that returning
`uSpecKey` to 0 after visiting 1 reproduces `base` on **exactly zero** differing pixels (I1).

## 3. What the coupling is worth per material — modelled BEFORE the capture

`scratchpad/specmodel.mjs` (the `progress/records/supply.mjs` chain, extended with the real
per-material `uSpec`/`uGloss`/`uMetal` from `Architecture.RECIPES`, `SlyModel.js`, `Props.js`
and `Terrain.js`, and with the material roughness scalar `TUNE.rough` 0.62 that
`Architecture.mat()` actually leaves in place — the recipes' own `rough:` goes to the bake, not
to `material.roughness`). Every row is a **ceiling**: lobe fully saturated (`specStep` 1.35),
`sh` 1, `ndl > 0.02`.

```
material              rgh   glossP  halfAng   spec NOW   L    spec x KEY   L    lit total NOW -> KEY
sandstone_block      0.533   13.6    17.6°     0.109   102      0.266    143    201.5 -> 207.1
sandstone_worn       0.570    9.2    21.3°     0.059    75      0.145    113    191.8 -> 196.2
limestone_polished   0.422   34.4    11.1°     0.284   148      0.694    188    223.5 -> 228.6
granite_pink         0.161   56.0     8.7°     0.479   173      1.171    208    204.4 -> 221.0
paving_courtyard     0.583   10.4    20.1°     0.073    84      0.179    123    205.5 -> 208.8
hieroglyph_wall      0.533   16.3    16.1°     0.125   108      0.304    149    210.1 -> 214.8
hieroglyph_gilded    0.434   47.3     9.5°     1.729   221      4.414    242    225.0 -> 242.4
gold_leaf            0.124  101.8     6.5°     4.372   242     11.218    252    242.6 -> 252.2
bronze_dark          0.174   64.5     8.1°     1.180   210      2.937    234    211.4 -> 234.9
mudbrick             0.614    6.3    25.6°     0.035    55      0.086     88    172.1 -> 176.7
plaster_painted      0.484   18.5    15.2°     0.149   116      0.364    158    222.1 -> 225.2
sly fur body         0.384    6.9    24.5°     0.028    48      0.068     78    124.8 -> 135.0
sly cane gold        0.136   88.1     7.0°     4.766   243     12.303    253    243.7 -> 253.3
sly eyewhite         0.384   15.4    16.6°     0.000     5      0.000      5    227.8 -> 227.8
water (terrain)      0.056   11.6    19.1°     0.075    85      0.182    124    158.3 -> 171.2
```

Three things follow, all of them registered as predictions rather than found afterwards:

1. **The coupling cannot re-order materials.** `uSpecKey` is one scene-wide scalar against one
   scene-wide `keyRad`, so every material's specular is multiplied by the identical vector.
   `mudbrick` and `gold_leaf` keep their 19:1 `uSpec` ratio exactly. Dull stone gains +3.3 to
   +5.6 L on a fully lit surface; `limestone_polished` gains +5.1 L, which is the answer to
   "does this turn limestone into plastic" — it cannot, by construction.
2. **Only materials already authored shiny cross 230.** `gold_leaf` is *already* above it
   (spec ceiling 4.372, display L 242, and above `TUNE.bloomThreshold` 2.20) before any change.
   The coupling takes `hieroglyph_gilded` from 221 → 242 and `bronze_dark` from 210 → 234.
3. **So the whole question is incidence, not amplitude.** The saturated half-angles on the
   spec-capable materials are 6.5–11°, and the term is gated by `step(0.02, ndl)` and by `sh` —
   dead on the 32–85% of every daylight frame §256 measured as receiving no key at all.
   `gold_leaf`'s ceiling exceeds the 230 threshold today and §256 measured 0.000% of `hero` and
   `temple` above scene 2.3, so on those shots that lobe demonstrably never lands.

## 4. Arms — one boot, `dt = 0` at every frame-advancing call

`shots/hilite2/`, 1280×720, q=high. 1280×720 = 921 600 px, the same denominator PREREG-hilite1's
gates were written against, so T1–T5 below transfer without rescaling.

| arm | `uSpecKey` | `uSpecGain` | what it is |
|---|---|---|---|
| `base` | 0 | 1 | the shipped build |
| `off` | 0 | 0 | attribution + positive control: what spec is worth today |
| `key` | 1 | 1 | **the candidate** |
| `base2` | 0 | 1 | the null arm, captured last |

Shots: `hero`, `temple`, `courtyard`, `sly-closeup` — the four the critic scored and the four
§256 bracketed, so every number here is comparable to a number already on the record.

Diagnostic pass, not an arm and carrying no threshold: `debugTerm(6)` read through
`debugRaw('scene')` on each shot at base settings.

## 5. `debugTerm(6)` — the specular incidence channel

Added with this change. Writes `vec3( specStep / 1.35, lobe, sh * step( 0.02, ndl ) )`:
the quantiser as a fraction of its own ceiling, the raw Blinn lobe under it, and the two gates.
It exists because **"the highlight is too dim" and "the highlight never lands" are
indistinguishable in a composite and have opposite fixes** — the first is amplitude (`uSpec`,
`uSpecKey`), the second is geometry, which no gain can reach. Read B first: where B is 0 the
term is multiplied out and R/G mean nothing.

## 6. Registered criteria — FIXED BEFORE ANY CANDIDATE WAS RENDERED

### Instrument (must fire, or the run is VOID)

* **I1 NULL ARM.** `base2` minus `base`, same boot, same settings, `dt = 0`, captured *after*
  `key`: **exactly 0 differing pixels** on all four shots. Anything else and the instrument moved
  under me and nothing here is quotable.
* **I2 POSITIVE CONTROL (this is the one that matters).** §255: a null arm proves repeatability,
  not sensitivity — an entire capture block rendered black and its null arm passed, because black
  equals black. `off` minus `base` must differ on **> 0 pixels on all four shots**. If it differs
  on zero pixels on a shot, the specular term contributes nothing visible there, every amplitude
  claim about that shot is VOID, and that is itself the finding.
* **I3 APPLIED STATE (§40).** Every arm reports `uSpecKey` and `uSpecGain` read back from the
  live uniform. Two arms with equal applied state are COLLAPSED and score nothing.
* **I4 READBACK CALIBRATION.** `debugTerm(4)` + `debugRaw('scene')` must find `(64, 128, 191)`
  on **> 5%** of the frame through the identical readback used for every scene-radiance number.
  If it does not, the readback is blind (§210.2) and **only the linear numbers are VOID** — the
  display-byte numbers come off the canvas by a different path and stand either way.

### Ship gates — inherited VERBATIM from PREREG-hilite1 §4, so they cannot be moved

* **T1** luma **p99 ≥ 200** on at least 3 of the 4 shots.
* **T2** share of pixels with luma **> 230 ≥ 0.20%** on at least 3 of the 4 shots.

### Must not fail — inherited verbatim

* **T3** luma **p50 ≤ 130** on every shot.
* **T4** share above luma **250 ≤ 1.0%** on every shot.
* **T5** luma **p1 ≤ 45** on every shot.

### New here, weaker than T1/T2, and labelled as such

* **H6 A HIGHLIGHT EXISTS.** On at least **2 of the 4** shots, `key` has **≥ 0.02%** of pixels
  above display L 230 where `base` has ≤ 0.005%.
  Motivation, fixed now rather than after: a specular highlight is by construction a *small*
  population — §3's saturated half-angles are 6.5–11° on every spec-capable material — so p99 is
  the 9 216th brightest pixel and is the wrong statistic for one, and T2's 0.20% is 1 843 px,
  i.e. a region rather than a glint. 0.02% is **184 px**, a 14×14 blob: the smallest thing a
  critic could point at and call a highlight. The `base` side is pinned at ≤ 0.005% because that
  is what §256 measured on three of these four shots.
* **H7 NO MATERIAL INVERSION.** Scored on a live material census (every `ToonMaterial` in the
  scene, its `uSpec`/`uGloss`/`uMetal`/`roughness` and its mesh count): every material must share
  one `uSpecKey` and one `uKeyColor`/`uKeyIntensity` **by object identity**, and no material's own
  `uSpec` may differ between arms. This is what makes §3's "cannot re-order materials" a
  measurement rather than a reading of the source.
* **H8 NO BLOWOUT.** On `key`, the share above L 250 must rise by **< 0.5 percentage points**
  from `base` on every shot, and stay ≤ 1.0% absolute (T4). The "gold sings but limestone turns
  to plastic" guard, pointed at the end that the model says is actually at risk: `gold_leaf`
  going from a spec ceiling of 4.372 to 11.218 is a 2.6× deeper clip, not a subtler one.

### Ship rule, fixed now

Ship `TUNE.specKey = 1.0` **iff** I1–I3 fire, T3/T4/T5 do not fail, H8 does not fail, and **H6
passes**. T1 and T2 are scored and reported either way; they are not required to ship, because
they were written for a *global sun* lever whose population is the whole lit frame, and this is a
term-local change whose size is bounded by §3's table. If H6 fails, **do not ship**: leave
`TUNE.specKey` at 0 with the scaffolding and the incidence channel in place, and report the
measured account. Do not move a threshold afterwards.

## 7. Registered forecast — written before any arm was rendered, scored either way

* **T1 fails on all four.** p99 is the 9 216th brightest pixel; §3 says the coupling adds ≥ 5 L
  only where the lobe is at least half saturated, and a 6.5–21° half-angle population is far
  smaller than 1% of a frame.
* **T2 fails on all four**, for the same reason at a 1 843 px bar.
* **H6 passes on 2 of 4** — on `sly-closeup` (the cane is `uSpec` 0.90 / gloss 96 / metal 1.0 and
  it is a close shot, so the cane is many pixels) and on `temple` (`hieroglyph_gilded`, 0.55/64) —
  and fails on `hero` and `courtyard`, whose visible surface is sandstone and paving at
  `uSpec` 0.10–0.16. Exactly at the bar, which is where a forecast should be uncomfortable.
* **The `off` arm shows the current specular is worth < 3 L at p99 on every shot** and changes
  **< 5%** of frame pixels. If it changes more than that, the term is bigger than §3 says and the
  model is wrong.
* **`debugTerm(6)` shows the joint population — both gates open AND `specStep` ≥ 0.99 of its
  ceiling — is < 0.5% of the frame on all four shots.** This is the population *any* amplitude
  lever can move, and if it is that small then amplitude is not the binding constraint and I
  will say so instead of reaching for a bigger multiplier.

If the forecast is wrong in the direction that makes the change look better, that is recorded as
prominently as a miss.

## 8. Out of scope — declared now so it is not smuggled in later

* **`specStep`'s missing energy normalisation.** The quantiser is a *shape* function capped at
  1.35, so raising `uGloss` makes a highlight **smaller but not brighter**. In a microfacet model
  the normalisation is where a tight lobe's blow-out comes from — concentrating the same energy
  into fewer pixels — and this shader has none. That is the second half of the physics and it is
  a much larger art change than a scene-wide multiply; it is measured here only through
  `debugTerm(6)`'s R channel and is **not** touched.
* **Per-material `uSpec` values** (`Architecture.RECIPES`, `SlyModel.js`, `Props.js`) — art
  direction, and the thing this change is careful *not* to disturb.
* **`TUNE.bloomThreshold` 2.20** — POSTFX's. Reported: whether the coupling puts any pixel past
  it, since `gold_leaf`'s ceiling already does and nothing in `hero`/`temple` reaches scene 2.3.
* **Composition** — camera azimuth against sun azimuth. §256 measured it as the dominant cause
  and the owner has ruled out moving the sun or re-aiming the cameras.
