# PREREG — hilite1: the frames have no highlight range

**Owner:** LIGHTING (`src/render/Lighting.js`, `src/render/Atmosphere.js`, `src/render/Sky.js`)
**Written:** before any candidate arm was captured. The baseline and the arithmetic below were
in hand; **no arm at k > 1 had been rendered or looked at when the thresholds in §4 were fixed.**
(§141.1: thresholds are registered before the candidate, not re-derived after it.)

---

## 1. The defect, restated as a number

Critic pass 8's top-ranked lighting complaint: the scene has no highlight range. Reproduced
here on the shipped frames (`shots/r8/`, commit 9015847), Rec.709 luma on display bytes:

| shot | mean | p1 | p50 | p90 | p95 | p99 | max | >200 | >230 |
|---|---|---|---|---|---|---|---|---|---|
| hero | 74.0 | 15.2 | 65.5 | 145.4 | 165.9 | **181.4** | 223.1 | 0.028% | **0.000%** |
| temple | 78.8 | 23.2 | 75.0 | 134.9 | 158.9 | **174.9** | 231.9 | 0.039% | **0.004%** |
| courtyard | 89.3 | 21.1 | 75.0 | 157.9 | 165.7 | **177.8** | 241.7 | 0.077% | **0.003%** |
| sly-closeup | 68.3 | 20.3 | 64.5 | 111.9 | 132.7 | **172.2** | 233.5 | 0.106% | **0.000%** |

`sly-closeup` p50 64.5 / p99 172.2 / 0.000% > 230 reproduces the critic's quoted figures
exactly, so the extractor is reading the same statistic the complaint is about.

## 2. Why the top is empty — measured, not guessed

**The tone chain is not the wall.** `scratchpad/chain.mjs` transcribes the shipped composite
grade (exposure → lift → gain → split-tone → saturation → pivot contrast → AgX → sRGB) from
`PostFX.js` COMPOSITE_FRAG and `passes/Common.js` GLSL_AGX. Its calibration arm is the repo's
own validated grey-axis row (the `splitRange` and `liftDayScale` comments in PostFX.js):

```
scene   0.002  0.004  0.006  0.010  0.018  0.030  0.060  0.105  0.18   0.5    1.0
repo      7.7   11.7   15.9   23.4   36.0   50.8   76.3  100.5  126.3  175.7  204.8
mine      7.7   11.7   15.9   23.4   36.0   50.8   76.3  100.5  126.3  175.7  204.8
```

Exact on all eleven entries, and on the second published row (39/69/88/126/159/176/192/205/227)
to ≤ 0.4 L. **The transcription is calibrated.** With it:

```
grey scene  1.0 -> L 204.8    2.0 -> 227.2    2.5 -> 232.7    4 -> 241.7    8 -> 250.1   >=20 -> 254.7
```

So display L 230 needs scene ~2.3 on the grey axis, and the chain delivers 254.7 if given
enough radiance. **Nothing above L 230 is missing because the tonemap ate it.**

**The supply is the wall.** The cel shader clamps the key term at `ramp * sh <= 1`
(`slyRamp` returns `clamp(acc/steps, 0, 1)`), so the brightest a diffuse surface can be is
`albedo * keyRad`. At the golden anchor `keyRad = keySun(#ffd9a0) * 3.30 = (3.30, 2.29, 1.18)`,
luma **2.425**. Through the calibrated chain:

| lit surface (ramp = 1, no shadow) | display L |
|---|---|
| §2.2 `sandMid` #c9915a albedo | **197.1** |
| §2.2 `sandLight` #e6b878 albedo | **213.2** |
| a perfectly white albedo (1,1,1) | **230.8** |

**A perfect white, fully sunlit, under the shipped key, renders at L 230.8 — the exact
threshold the critic says nothing reaches.** Real stone renders 197–213. There is no term in
the light rig that exceeds that: the sun disc is a genuine HDR emitter (`Sky.js` `sunCore` 26)
but it is **out of frame in every canonical daylight shot** (hero cam az 233° vs sun 186°;
courtyard 279° vs 180°; temple 257° vs 170°; all far outside a 34–55° fov).

So the cause is **key radiance**, not exposure, not the ramp's shape, not a missing tonemap
headroom. §2 is arithmetic and needed no capture.

## 3. The lever, and why this one

`Lighting.TUNE.keyBoost` multiplies `A.keyIntensity` in both `_applyAtmosphere()` (the
DirectionalLight) and `_publishKeyLight()` (`p.intensity` → `uKeyIntensity`). It does **not**
multiply `A.ambientIntensity` (computed inside `evalAtmosphere` from the un-boosted key), so
the fill stays put while the key rises. SHADING's shadow light *does* scale with it
(`_refreshShadowColor` reads `lum(uKeyColor) * uKeyIntensity`), so this is a partial, not a
total, contrast lever — stated up front so the result is not oversold.

Raising the key rather than PostFX's exposure is deliberate and is the second half of the
diagnosis: `courtyard`'s sky rows measure L 132–146 against ground rows L 68–73, i.e. the sky
is twice the ground. That is inverted for a desert. Exposure would raise both; the key raises
only what the sun reaches.

**Ship vehicle, and why it is not the same field as the bracket lever.** `keyBoost` is a
*global* multiplier: at night `keyIntensity = moonIntensity`, so shipping a raised `keyBoost`
would brighten the moon in `night` and `guard` — two shots this change has no business
touching. The shipped form is therefore a new, day-gated field

```js
export function keyGain(sunBoost, dayAmount, keyBoost = 1) {
  return keyBoost * (1 + (sunBoost - 1) * dayAmount);   // exactly keyBoost at sunBoost === 1
}
```

applied at the same two sites `keyBoost` already is (`_applyAtmosphere()`'s cascade-0 intensity
and `_publishKeyLight()`'s `p.intensity`).

**The bracket lever and the ship vehicle are the same arithmetic on every captured shot, and
this is exact rather than approximate.** `dayAmount = smoothstep(-7, 4, sunElevation)`; the four
captured shots sit at el 20.5–33°, so `dayAmount === 1` **exactly**, and
`1 + (k - 1) * 1 === k` in IEEE. So `keyBoost = k` and `sunBoost = k` multiply the same quantity
at the same two sites by the same number in every frame this run captures. They differ only at
tods this run does not capture, where the shipped form is provably inert: at tod 0.02 / 0.10 the
sun is at el −58° / −42°, `dayAmount === 0` exactly, and `1 + (k - 1) * 0 === 1` exactly, so
`night` and `guard` are bit-identical for every k. All four identities are asserted in
`tests/tone.test.mjs` as pure arithmetic — no capture, no renderer (§211.1).

This paragraph was written **before the capture ran**, because the alternative — bracketing one
field and shipping another without saying so — is the §40 failure this project keeps paying for.

## 4. Registered arms and thresholds — FIXED BEFORE ANY CANDIDATE WAS RENDERED

Arms, one boot, `dt = 0` throughout, `shots/hilite1/`:

`base` (k = 1.00) · `k140` (1.40) · `k170` (1.70) · `k210` (2.10) · `k260` (2.60) ·
`base2` (1.00, the null arm)

Shots: `hero`, `temple`, `courtyard`, `sly-closeup` — the four the critic scored.

k values derived from §2's table, not chosen to look good: sunlit `sandMid` reaches L 209 at
k = 1.36, L 216 at k = 1.67 and L 223 at k = 2.12, so the bracket spans "just clears the
critic's 215 floor" to "comfortably inside 215–245" with a null on each side of the decision.

`k260` was added to the bracket **after the arms above were written and before any candidate
was rendered**, for a reason recorded here rather than discovered later: the p99 population is
not all key-lit. Sky pixels do not scale with the key at all, so p99 will move by *less* than
sunlit stone does, and a bracket whose top arm only just reaches the gate can fail for the
wrong reason. Extending the bracket costs four captures; re-running the boot costs an hour.

### Gates that must PASS
* **T1** luma **p99 ≥ 200** on at least 3 of the 4 shots.
* **T2** share of pixels with luma **> 230 is ≥ 0.20%** on at least 3 of the 4 shots.
  (0.20% of 921 600 px ≈ 1 840 px — a region, not a glint. Baseline is ≤ 0.004%.)

### Gates that must NOT fail
* **T3** luma **p50 ≤ 130** on every shot. (Chain middle grey is L 126 at scene 0.18; a median
  above that means the frame is over-exposed, and I would have bought the top by blowing the
  whole image.)
* **T4** share above luma **250 ≤ 1.0%** on every shot — no large clipped white field.
* **T5** luma **p1 ≤ 45** on every shot (baseline 15–23). Shadows must stay dark.

### Instrument arms — if either fails, the run is VOID and no number here is quotable
* **T6a NULL ARM (must fire; the verdict rests on this one):** `base2` minus `base`, same
  setting, captured after all other arms in the same boot at `dt = 0`, must differ on
  **0 pixels**. §220 measured a 3087/57600 px drift floor *between boots*; within one boot at
  dt = 0 the correct expectation is exactly zero, and anything else means the instrument moved
  under me and the run is VOID.
* **T6b PROVENANCE (reported, not a veto):** `base` should reproduce `shots/r8/`'s luma p99 to
  within **2.0 L** per shot. Stated separately and *before* the capture because other agents are
  committing to this branch concurrently (`git status` at the time of writing shows
  `src/textures/Materials.js`, `src/textures/Canvas2D.js` modified in the working tree). A T6b
  miss attributes to tree drift between r8 and this boot, **not** to the lever under test, and
  it does not void the within-boot A/B — but it is reported with its size either way, and if it
  misses, no cross-boot comparison to r8 is quoted anywhere in the result.
* **T7 CALIBRATION ARM (must fire):** `shading.debugTerm(4)` writes (64,128,191)/255 into the
  linear scene RT; the HalfFloat readback used for every scene-radiance number in this run must
  find that triple on **> 5% of the frame**. If it does not, the readback is blind (§210.2's
  lesson: that failure is indistinguishable from a dead program, so it is reported as VOID, not
  interpreted).
* **T8 APPLIED STATE (§40):** every arm reports `uKeyIntensity` read back from the live uniform.
  Two arms with equal applied state are COLLAPSED and score nothing. Each arm's `uKeyIntensity`
  must equal `k × atmoSunIntensity(base)` to within 1e-4.

### Registered forecast (written before any arm was rendered; scored either way in the result)

Two facts make a forecast possible rather than a guess. (i) The chain response above, and
(ii) the top-1% population is **key-lit, not sky**: classifying each shot's top 1% by R−B on
the *baseline* frames gives warm (R−B > 18) **94.8% hero · 81.0% temple · 93.7% sly-closeup ·
36.7% courtyard** (courtyard is 57.9% neutral). So p99 should scale nearly with the key on
three of the four shots, and less on `courtyard`.

| arm | predicted p99 (from 172–181 baseline) | T1 (p99 ≥ 200) | T2 (>230 ≥ 0.20%) |
|---|---|---|---|
| k140 | 182–191 | fails on all 4 | fails |
| k170 | 188–200 | passes on ≤ 1 | fails |
| k210 | 196–208 | passes on 2–3 | first plausible pass |
| k260 | 202–215 | passes on 3–4 | passes |

**Predicted winner: `k210` or `k260`.** If `k140` or `k170` wins, my model of where the top of
the range comes from is wrong and I will say so. If nothing passes, the lever is insufficient
and I will say that instead of moving a gate.

### Selection rule
Ship the **smallest** k that passes T1 **and** T2 and fails none of T3–T5. If no arm passes both
T1 and T2, **the defect is not closed by this lever** — report the best arm's numbers plainly
and say so. Do not move a threshold afterwards.

## 5. Out of scope, declared now so it is not smuggled in later

* The diffuse ramp's `{0, 0.5, 1}` levels put a ground plane at a 22° sun on the **0.5** step
  (`ndl = 0.375`, between `termLo` 0.14 and `termHi` 0.52), so sunlit *ground* is at half key
  whatever this lever does. That is `ToonMaterial.TUNE` and belongs to RAMP; routed, not touched.
* The specular / metal path (`uSpec`, `uMetalGain`) and the bloom feed thresholds are SHADING's
  and POSTFX's. "Gold leaf should be pushing the top" is theirs.
* `Sky.js`'s sun neighbourhood (`sunHaloStrength` 0.85, `mieStrength` 0.55) is mine and *is*
  under-powered relative to the disc's 26×, but the sun is out of frame in all four canonical
  daylight shots, so any change there is unverifiable in this capture set. Reported, not shipped.
