# NOTE — the shadow-tint item's SPACE question, settled offline: it is a SHADING defect

Offline. No boot, no capture, no `src` change. Written before any PREREG, because §333 says the
last three seals in the neighbouring arc died by aiming an in-shader lever at a defect that was
produced downstream, and the shade-scoped shadow-tint item is one seal away from repeating that.

Tools written for this and living in `progress/records/shadowtint/`; every number below is
reproducible from a checkout with `node progress/records/shadowtint/<tool>.mjs`.

---

## 0. Verdict

**SHADING. Fix it in the toon shader. High confidence.**

The courtyard colossus terminator is warm *in scene-linear*, before the composite touches it. It
reaches `c = scene * uExposure` at **R/G 3.74**, against **0.72–0.78** for the three shadows the
r13 critic passed and **0.52** for courtyard's own ground in the same frame. The display transform is not innocent — it rotates that pixel a further 11° and
cuts its HSV saturation by 27% — but it rotates it **toward** the target, and it closes 8% of the
gap rather than opening it. There is no dose of a POSTFX lever that makes a linear R/G of 3.74
display at 218°, because the same transform, in the same frame, at the same display luminance,
delivers 214° from the courtyard *ground's* shadow.

**One sub-question is left open and it is load-bearing for the seal, not for the verdict:** I
cannot tell from a PNG whether the sampled face is in the ramp's **shadow** band or its **mid**
band. If it is the mid band it is 50% direct sunlight by construction (`TUNE.bands` 3,
`toon.glsl.js:314`), and then the r13 target "345 → 218" is **unreachable by any legal
shadow-tint dose** — the §332 failure shape, in advance. §10 names the one measurement that
settles it, and §11 names the one capture that would falsify the verdict itself.

---

## 1. The frames: `shots/r13/` is gone; `shots/r12/` is the substitute, and it is checked

`shots/r13/` does not exist on disk. It was never tracked — `.gitignore` ignores every `shots`
subdirectory except `pass1`/`pass2` — it was captured 08-15 01:02, and a rollback wiped it.
**§335 records this independently and closes it** ("not on disk and was never committed", with
the force-add rule that follows). The newest roster capture on disk is `shots/r12/`
(08-13 23:20–23:46), and the g1 lane made the same substitution on the same justification.

Substituting r12 for a **shading** reading is sound, and §328 is the authority for that, not me:
it records that r13 "reproduces the r12 calibration to three decimals", and `git log -- src/`
between the two captures shows only inert mechanisms plus a props dedupe (`cef6a5b`, `677b914`,
`273cca1`, `11b852c`, `7a06bf1`); the last shipping change before **both** is `0525d5e`,
08-13 22:51, ahead of r12's own frames.

The substitution is still a substitution, so `repro.mjs` checks it instead of asserting it:

| critic's r13 quote | nearest match on `shots/r12/courtyard.png` | RGB distance |
|---|---|---|
| lit `#ba5244` h 7.1 s 0.634 | 16×16 block @(924,340) `#ba5045` h 5.8 s 0.631 | **2.2**/255 |
| lit `#ba5244` | nearest *clean* 10×10 patch @(870,485) `#ac4c44` h 4.6 s 0.604 | 15.4/255 |
| shade `#563d43` h 345.6 s 0.291 | nearest clean 10×10 patch @(1045,300) `#60394f` h 326.7 | 16.1/255 |

The passing side corroborates the substitution independently: r13's critic measured kaykit
211° / hero 203° / dunes 207°, and the same measurement on r12 gives **215.1° / 210.2° / 212.9°**
(§3.2) — the same three shots passing by the same margin on the earlier capture.

The critic's HSV convention reproduces exactly (`measure.mjs --selftest`): `#ba5244` → h 7.1 /
s 0.634, `#563d43` → h 345.6 / s 0.291, `#2a3f66` → h 219.0. Standard HSV, `s = (max−min)/max`.

---

## 2. My own measurement of the terminator

Method, so it is not the critic's eye twice: sweep every 10×10 patch of the right colossus
(ROI 870,250 300×370), keep only patches whose per-channel sd ≤ 3 — that is what excludes ink
lines, the silhouette rim and FXAA edges, none of which the display inverse models — then take
the darkest and brightest 12% of what survives. 493 clean patches.

```
courtyard / colossus-R  DARK 12% (59 patches)   #793848  h 345.2  s 0.537  L  70.7
courtyard / colossus-R  LIT  12% (59 patches)   #a25749  h   9.4  s 0.546  L 101.9
```

**h 345.2 against the critic's 345.6.** The reading reproduces. My saturation is higher (0.537 vs
0.291) purely because a flat-patch filter selects chromatic surface over the darker,
ink-adjacent pixel the critic quoted; the hue — the thing the item is about — lands on top of it.

The row scan (`measure.mjs --scanrow`, y = 340, 16 px blocks) shows the terminator directly:
lit `#ba5045` h 5.8 s 0.631 at x 924, falling to `#743e47` h 350.3 s 0.461 by x 1084, with no
excursion toward blue anywhere across it.

---

## 3. The space test, run in both directions

The transform is deterministic, so this needs no capture. `progress/records/tonecurve.mjs`
already models it forward and is validated on the one grey row `PostFX.js` anchors to a rendered
pixel (max 0.35 L). I wrote **`shadowtint/invchain.mjs`** to invert the same chain stage by
stage — encode, AgX, contrast, saturation+split (one 1-D root in the post-gain luma), gain, lift,
exposure.

`shadowtint/selfcheck.mjs` drives 3,119 colours — a grid that deliberately over-samples the dark
low-red blue-dominant corner, plus 3,000 random HDR triples — through `tonecurve.grade()` and
back through the inverse:

```
|grade(unGrade(D)) − D|   p50 4.6e-13   p99 3.0e-12   max 6.6e-12 display L
```

One trap worth recording, because it produced a plausible-looking wrong answer first: the two
rec2020 matrices in `Common.js` are inverse to only ~1e-4 (`tonecurve.mjs`'s own self-check 1
prints that residual). Using one as the other's inverse leaves a **systematic 0.03 display L
bias on every pixel** — invisible against a grey row, and the same size as the chroma effects
this investigation reasons about. Every inverse in `invchain.mjs` is computed numerically.

### 3.1 FORWARD — does the chain deliver blue from blue?

`space.mjs` §2 pushes the specified shadow colour `#2a3f66` (scene-linear h 225.5) through the
shipped chain at seven exposures:

```
  x0.05  ->  #040826  h 232.2  L   9.4
  x0.10  ->  #040f33  h 225.8  L  15.1
  x0.20  ->  #041a46  h 219.7  L  24.8
  x0.40  ->  #092c61  h 215.7  L  40.6
  x0.80  ->  #194581  h 214.6  L  64.2     <- the terminator's own luminance band
  x1.60  ->  #366097  h 213.9  L  91.4
  x3.20  ->  #5780b2  h 212.7  L 123.1
```

Across a 13× luminance range spanning L 9 to L 123, a correctly blue linear radiance arrives on
screen at **213–232°**. It never approaches 345°. **The transform cannot manufacture the miss.**

### 3.2 INVERSE — what linear radiance is behind the measured pixel?

```
                                   display                     scene-linear                   R/G   B/G
courtyard colossus DARK 12%   #793848 h 345.2 s0.54 L 70.7   0.1350 0.0361 0.0422  h 356.3   3.74  1.17
critic's own hex #563d43      #563d43 h 345.6 s0.29 L 66.7   0.0737 0.0432 0.0348  h  13.0   1.71  0.80
nearest clean patch to it     #60394f h 326.7 s0.41 L 67.0   0.0897 0.0372 0.0454  h 350.7   2.41  1.22
--- the three the critic PASSED ---
kaykit floor      DARK 12%    #334154 h 215.1 s0.40 L 63.3   0.0349 0.0449 0.0482  h 194.9   0.78  1.07
dunes sand        DARK 12%    #283647 h 212.9 s0.44 L 52.1   0.0280 0.0380 0.0389  h 184.9   0.74  1.02
hero  floor       (L65 bin)   #334354 h 210.2 s0.40 L 65.0   0.0361 0.0501 0.0518  h 186.0   0.72  1.03
--- and courtyard's OWN ground, same frame ---
courtyard ground  DARK 12%    #162e46 h 209.3 s0.68 L 43.0   0.0144 0.0277 0.0329  h 197.0   0.52  1.19
--- the specification ---
#2a3f66 inverted                                             0.0277 0.0389 0.0652  h 222.1   0.71  1.68
```

**The sharpest single statement in this note: the terminator's blue is not missing. Its red is.**
Measured B/G is **1.17**, sitting inside the passing band (1.02–1.19). Only R is wrong — 3.74
against 0.72–0.78, i.e. **≈4.8× too much red**, at G and B that are already correct.

---

## 4. The matched-luminance control — the AgX-shoulder hypothesis is refuted by name

The hypothesis worth taking seriously was: courtyard's terminator sits further up AgX's
desaturating shoulder than the passing shots', so the same transform treats it worse.

That hypothesis makes a prediction the frames can test. **The transform has no shot input and no
surface input.** Two pixels at the same display value entered it from the same place. So if the
miss were a shoulder artefact, patches at matched display L would have to come out alike.
`table.mjs` bins every clean patch across all five ROIs by display luminance:

```
---- display L 65 ± 2 ----                       display          scene-linear             R/G
   courtyard / colossus-R shade face    2 pat   h 333  s0.48    0.1022 0.0340 0.0427      3.00
   courtyard / ground plane             4 pat   h 214  s0.33    0.0409 0.0511 0.0518      0.80
   dunes     / dune sand               72 pat   h 201  s0.42    0.0327 0.0525 0.0488      0.62
   hero      / floor + ledge          160 pat   h 210  s0.40    0.0361 0.0501 0.0518      0.72
   kaykit    / floor                  172 pat   h 213  s0.40    0.0357 0.0475 0.0501      0.75

---- display L 75 ± 2 ----
   courtyard / colossus-R shade face   13 pat   h 347  s0.46    0.1233 0.0445 0.0467      2.77
   courtyard / ground plane            32 pat   h 199  s0.34    0.0422 0.0657 0.0627      0.64
   dunes     / dune sand               85 pat   h 187  s0.37    0.0391 0.0738 0.0650      0.53
   hero      / floor + ledge           92 pat   h 198  s0.35    0.0410 0.0661 0.0631      0.62
   kaykit    / floor                  193 pat   h 202  s0.31    0.0438 0.0629 0.0603      0.70
```

Two things fall out and both are fatal to the transform story:

1. **Courtyard's terminator is not brighter.** It sits at display L 70.7; hero's passing floor
   shadow sits at L 70.0 with display hue 201.6, and all five populations are simultaneously
   present at L 65 *and* at L 75. There is no luminance separation to attribute anything to.
2. **At matched L the display-hue gap is 133–148°**, and it survives *inside one frame*:
   courtyard's own ground shadow reads 214° while its colossus reads 333°, four pixels' worth of
   luminance apart, through one composite, in one image. A display transform cannot be selective
   between them.

---

## 5. What the transform *does* do here — measured, not waved away

It is not nothing, and §333's 76.5% chroma figure is not contradicted:

```
courtyard terminator   linear h 356.3  HSV-s 0.733   ->   display h 345.2  HSV-s 0.537
```

The chain rotates the pixel **−11.1°** and removes **27%** of its HSV saturation. Both are real.
But the rotation runs *toward* 218°, closing 11° of a 134° linear gap — **8%**. The remaining
92% was there before the composite ran. §333 and this note are consistent: AgX genuinely eats
chroma, and it is still not what makes this particular pixel the wrong colour.

---

## 6. The two POSTFX terms that run BEFORE the grade are closed too

The inverse recovers the radiance entering `c = scene * uExposure`. Between the toon shader and
that point `PostFX.js` does three things (~1372–1421), and if one of them were reddening the
terminator the miss would still be POSTFX, just earlier than §333 looked. `pregrade.mjs`:

- **chromatic aberration** — `TUNE.chroma` is 0.0; the three taps collapse to one texel.
- **AO / contact multiply** — `aoTint` is **`0x2a3f66`**, the §2.2 *blue* shadow hue, normalised
  by `tintColor` so the multiply can only subtract light. It moves pixels toward blue. It is
  arithmetically incapable of raising R/G, which is the entire defect signature.
- **bloom add** — onset is `bloomThreshold − bloomKnee` = **1.90** scene-linear. The brightest
  *clean patch* in courtyard peaks at **1.263**; 0 pixels in the frame are white-clipped. A few
  isolated sparkle pixels do exceed it (3.85 at (778,187)) — and they exceed it in kaykit, hero
  and dunes too (3.27 / 4.13 / 3.96), so bloom cannot be what makes courtyard alone miss.
  Bounded locally as well: sky 10 px to the right of the colossus inverts to h 226.4 against
  mid-frame sky at h 222.4 and far-left sky at h 222.9. There is no red veil around the statue.

---

## 7. What distinguishes courtyard — measured, with the mechanism left as a hypothesis

`bands.mjs` histograms the colossus's 493 clean patches by display L:

```
display L |  n  | display          | scene-linear                | R/G
       60 |   2 | #61324b h 328    | 0.0907 0.0298 0.0395 h 350  | 3.05
       70 |  29 | #783848 h 345    | 0.1328 0.0364 0.0421 h 356  | 3.65
       80 |  88 | #8c4044 h 356    | 0.1837 0.0446 0.0455 h 360  | 4.12
       90 |  62 | #974a46 h   3    | 0.2292 0.0588 0.0536 h   2  | 3.90
      105 |  24 | #a3594e h   8    | 0.2838 0.0858 0.0708 h   4  | 3.31
```

**Nothing on that statue is ever cool.** From its brightest face to its darkest, R/G stays pinned
at 3.0–4.1 and the linear hue moves 350→8°. A surface that actually reached the shade band would
show a cool population somewhere in that distribution. There isn't one.

The obvious first explanation — "vertical faces take the warm sand bounce, horizontal ones take
the cool sky" (`hemi = smoothstep(-0.72, 0.55, Nw.y)`, `toon.glsl.js:577`, which hands a vertical
face ~40% bounce and a ground plane 0%) — **is insufficient, and I checked rather than assumed**:

```
hero   / shaded column (vertical)   lin 0.0125 0.0192 0.0273  R/G 0.65  -> display h 218.6
kaykit / shaded left wall (vertical) lin 0.0256 0.0369 0.0388  R/G 0.69  -> display h 211.7
dunes  / shaded statue (vertical)   lin 0.0346 0.0869 0.0832  R/G 0.40  -> display h 186.1
```

Vertical shaded surfaces in the other three shots are cool. What *does* separate the ladder is
whether the surface is on a **sunlit** object, and courtyard supplies the whole ladder in one
frame, one light rig, one transform:

```
courtyard ground, cast-shadowed, horizontal          R/G 0.52       -> display 209   PASS
courtyard colossus-L, cast-shadowed twin, vertical   R/G 1.02-1.86  -> display 234..358
courtyard colossus-R, shade side of a SUNLIT statue  R/G 3.00-4.26  -> display 333..351   FAIL
```

Both other objects have `sh = 0` there, hence `key = 0` and `shadowMix = 1`. The colossus-R shade
face is the only one of the three that is still receiving direct key. **Hypothesis, not a
finding:** the sampled pixel is not in the shade band at all — it is a partially key-lit band,
and the shadow tint has only `1 − key` of the authority there. §10 names what settles it.

---

## 8. The shipped shadow-tint code, and why it is inert on this surface

Read from `src/render/shaders/toon.glsl.js` and `src/render/ToonMaterial.js`:

```glsl
// toon.glsl.js:732-734  the hold gate, per-pixel on the albedo's OWN chroma
float albChroma = ( albMax - min(...) ) / max( albMax, 1e-4 );
float hold      = clamp( max( uShadowHold, uSubjShadowHold * vSlySkin ), 0.0, 1.0 )
                * smoothstep( 0.0, max( uShadowHoldKnee, 1e-4 ), albChroma );
// :751-754  the shade band
vec3 shadTint = albShadow * slyShadX;                       // the MULTIPLY
vec3 shadHeld = albShadow * slyLum( slyShadX );             // hue-held, luma-renormalised
vec3 shadBand = mix( shadTint, shadHeld, hold );
// :756-759  the sum
vec3 diff = alb * keyRad * key * mix( 1.0, ao, uAoKey )
          + ( albAmb * slyFillX * ao
            + shadBand * shadowMix * mix( 0.55, 1.0, ao )
            + slyShadX * uShadowWash * ( 1.0 - hold ) * shadowMix * ao ) * shadeForm;
```

**`hold` is exactly 0 on the colossus.** `TUNE.shadowHold` is `0.0` (`ToonMaterial.js:226`) and
`subjShadowHold` `1.0` (`:316`) is `vSlySkin`-scoped — a prop draw has `vSlySkin = 0`, so
`max(0.0, 1.0 × 0) = 0`. `uShadowHold` is additionally gated on `ambient.skyOpen > 0.5`
(`:1772`). So the whole §269 hold mechanism, the one thing in the shader that would carry a
material's own hue into shade, is off for every piece of architecture and every prop in the game.
The colossus gets `shadBand = shadTint = albShadow × slyShadX` — the bare multiply.

Three more shipped facts a seal will need:

- `shadowSat` is **−0.35** (`:173`), so `albShadow` is a lerp toward the albedo's grey. That holds
  hue *exactly* and only scales saturation (`toon.glsl.js:550` and the note above it).
- `shadowBounceMix` **0.05** == `shadowBounceMixLit` **0.05** (`:520`, `:546`), so
  `uShadowColor == uShadowColorLit` and the depth blend at `toon.glsl.js:626` is an **exact
  no-op today**. That is a free lever the seal could use, or a trap if it assumes the blend is live.
- `shadowTintPeak` **0.62** (`:454`) is **not binding on courtyard** — §261's live readback in
  that comment records courtyard asking k 3.417 against maxK 3.742. `shadowFloor` is what sets
  the shadow light's magnitude there, not the cap.

---

## 9. `lithold-model.mjs` was NOT used, per §333

§333 warns that the offline model was treated as authoritative for three seals and then diverged
25× from a real capture. Nothing in this note fits or trusts a linear state. The only imported
thing is the **transform**: `tonecurve.mjs` forward (validated on the grey row) and its inverse
(validated against that same forward at 1e-12). The measured quantities are display bytes off
disk; every linear number here is those bytes carried back through an arithmetic identity.

The grey-row calibration validates the transform *on the grey axis*, and this note reasons about
chroma — that is the honest residual, and it is why the verdict rests on the **within-frame,
matched-luminance** control (§4), which needs no model at all: it is two display readings from
one image, and their difference cannot have been made by a per-pixel function of display value.

---

## 10. Acceptance bars for the successor seal — sketch only, no PREREG this round

The r13 target is stated in display space; a SHADING lever has to be aimed in linear.
`target.mjs` converts it by holding the measured terminator's linear luminance fixed (a
shadow-tint lever is a hue lever — `shadHeld` renormalises to `lum(shadTint)` at
`toon.glsl.js:753` for exactly this reason) and rotating hue:

```
lin h  lin s | R/G   B/G  | display          h      s      L
  210  0.30  | 0.82  1.18 | #414c60        218.9  0.319   75.3
  220  0.30  | 0.87  1.25 | #434c62        223.8  0.314   75.6
  210  0.45  | 0.71  1.29 | #3b4e66        214.2  0.419   75.5
  220  0.45  | 0.79  1.43 | #3f4d6a        220.0  0.410   76.1
MEASURED     | 3.74  1.17 | #793848        345.3  0.537   70.7
```

| bar | quantity | measured now | target |
|---|---|---|---|
| **E1** primary | terminator display hue, darkest 12% of clean patches, colossus ROI | 345.2° | **215–225°** |
| **E2** the actual defect | terminator **scene-linear R/G** (inverted, `invchain.mjs`) | 3.74 | **≤ 0.90** |
| **E3** don't break what works | terminator scene-linear **B/G** | 1.17 | **stay in 1.00–1.45** |
| **P1** shadow stays shadow | terminator display L | 70.7 | **≤ 80** (§7.3 / PREREG G3) |
| **P2** protection | courtyard **ground** shadow display hue | 209.3° | **±6°** — it already passes |
| **P3** protection | the three passing shots' shade hue (kaykit 215.1 and dunes 212.9, darkest 12%; hero 210.2, L 65 bin) | — | **±6°** each |
| **P4** protection | colossus **lit** face display hue | 9.4° | **±8°** — a shadow lever must not touch the sunlit band |
| **G1** the gate that decides whether the seal is even legal | see below | — | — |

**G1 must be resolved BEFORE the seal's doses are chosen, and it may kill the target.** The
question is whether the sampled face is in the ramp's shadow band or its **mid** band. With
`TUNE.bands` 3 and `slyRamp` unrolled to terminators at `termLo` 0.14 and `termHi` 0.52, the ramp
takes exactly three values — 0, 0.5, 1 — and with `shadeBand` 0 (`ToonMaterial.js:763`,
`shadeForm == 1`) and equal AO the three obey `band(0.5) == (band(1) + band(0)) / 2` per channel
in linear. I ran it: `2 × shade − lit = (−0.003, −0.009, +0.021)`, a residual at or below the
noise, which is *consistent* with the mid band but does not establish it — I cannot separate "mid
band" from "same band, different AO or albedo" from a PNG.

**The one measurement that settles G1**, and it is cheap: a one-boot readback of `key`
(= `ramp * sh`) over the colossus terminator rect — or equivalently a `uKeyIntensity = 0` arm on
that rect, where the mid band collapses by half and the shadow band does not move at all.

If the pixel is the mid band it is **50% direct sunlight by construction**, `shadowMix` is 0.5,
and no legal shadow-tint dose takes it to 218° without also flattening the mid-tone §2.1.1
requires — the seal would fail on its own bars exactly the way §332's did, and the honest move is
to re-aim E1 at the colossus's true shadow band (or to route the item to LIGHTING, since
`hemi`/`bounceGain` and `shadowFloor` are the terms that set the shade side's warmth).

---

## 11. What would falsify this verdict, in one capture

A `PostFX.debugRaw` linear readback over the colossus terminator rect on `courtyard` — the same
instrument §333 already proved in-boot (CAL `(64,128,191)` over 62.1% of frame). It reports the
scene-linear triple directly, with no inverse in the path.

- Predicted: **R/G ≈ 3.0–4.3** on that rect, against 0.5–0.8 on the courtyard ground rect in the
  same frame.
- If it comes back **R/G ≤ 1**, `invchain.mjs` is wrong somewhere despite round-tripping the
  forward model at 1e-12, and this verdict flips to POSTFX.

I am not the lane that captures, and this note does not ask for that capture as a prerequisite:
the matched-luminance control in §4 is already a within-frame refutation that needs no new frame.
It is offered as the cheap confirmation to fold into whichever capture the successor seal runs
anyway.

---

## Disposition

- **SHADING.** `subjLitHold`/`dispChromaHold`-style display-space levers are the *wrong lane* for
  this item, in the exact mirror of §333's finding for the costume bleach: that defect was made
  downstream and was being fixed upstream; **this one is made upstream and must not be chased
  downstream.**
- The defect is **excess linear red (R/G 3.74 vs 0.72–0.78), not missing blue** — B/G already
  passes at 1.17.
- The transform's own contribution is measured at **−11° of rotation and −27% of HSV saturation**,
  both toward the target, worth 8% of the gap.
- **G1 is unresolved and gates the seal's legality**, not its space. One `key` readback settles it.
- Nothing in `src` moves on this note. No PREREG this round, by instruction.
