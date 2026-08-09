# RESULT — hilite2: the specular is now coupled to the key, and it is still not the highlight

Registered in `PREREG-hilite2.md` before any candidate arm existed. Scored against those
thresholds and no others. **Verdict by the registered ship rule: DO NOT SHIP.** `TUNE.specKey`
stays **0** and the shipped build is bit-identical to what it was.

Record: `progress/records/hilite2/` (`score.json`, `arms.json`, `where.txt`, `capture.txt`).
Runner `hilite2.mjs`; post-hoc analyser `hilite2-where.mjs`; model `specmodel.mjs`.
Frames in `shots/hilite2/` (gitignored by project convention).

---

## 1. The instrument

| criterion | result |
|---|---|
| **I1 NULL ARM** — `base2` vs `base`, captured after `key`, `dt = 0` | **0 px** on all four shots. **FIRED** |
| **I2 POSITIVE CONTROL** — `off` (`uSpecGain 0`) vs `base`, must be > 0 px | 36 624 / 8 133 / 74 429 / 59 586 px = **3.97 / 0.88 / 8.08 / 6.47 %**. **FIRED on all four** |
| **I3 APPLIED STATE** | four distinct states per shot, read back off the live uniform. No collapse |
| **I4 READBACK CALIBRATION** — `debugTerm(4)` triple > 5 % of frame | **75.66 / 27.16 / 15.61 / 17.47 %**. **FIRED** (`hero`'s 75.66 % reproduces §256's 75.99 %) |

§255's lesson is honoured: the null arm passing means nothing on its own, and `off` is what
proves the term reaches the frame at all. It does — the specular is worth a **mean of 8.4 L and a
max of 135 L** on the 3.97 % of `hero` it touches.

Provenance, reported not vetoed: `hero` `base` reads p1 15 / p50 71 / p99 **183** / max 232.2
against §256's p99 **182.6** on the same shot. 0.4 L apart across four commits.

## 2. The frame numbers

```
shot          arm      p1   p50   p90   p99  p99.9    max     >200%    >230%   >250%
hero          base     15    71   155   183    195   232.18   0.066    0.000   0.000
hero          key      16    72   155   184    204   232.79   0.134    0.002   0.000
temple        base     31    89   145   181    195   230.21   0.069    0.000   0.000
temple        key      31    89   145   181    196   230.21   0.077    0.000   0.000
courtyard     base     23   104   160   180    210   237.17   0.222    0.003   0.000
courtyard     key      23   104   160   187    215   245.47   0.596    0.030   0.000
sly-closeup   base     25    82   124   179    214   239.39   0.212    0.005   0.000
sly-closeup   key      25    82   124   184    215   239.39   0.328    0.007   0.000
```

| gate | result |
|---|---|
| **T1** p99 ≥ 200 on ≥ 3 of 4 | **0/4 — FAIL** |
| **T2** >230 ≥ 0.20 % on ≥ 3 of 4 | **0/4 — FAIL** |
| **T3** p50 ≤ 130 everywhere | PASS (72 / 89 / 104 / 82) |
| **T4** >250 ≤ 1.0 % everywhere | PASS (0.000 % on every arm of every shot) |
| **T5** p1 ≤ 45 everywhere | PASS (16 / 31 / 23 / 25) |
| **H6** highlight exists, ≥ 2 of 4 | **1/4 — FAIL.** Only `courtyard`: 0.003 % → **0.030 %** |
| **H7** no material inversion | PASS — 102 sly materials, 23 spec classes, one shared `uSpecKey`, one `keyRad` per shot |
| **H8** no blowout | PASS — >250 stays at 0.000 % on every shot, +0.000 pp |

**Registered ship rule: I1–I3 fire, T3/T4/T5 pass, H8 passes, H6 passes → ship. H6 failed at
1 of 4 against a bar of 2 of 4, so nothing ships.** The threshold is not moved and the arm is not
re-scored on a different statistic. `TUNE.specKey` stays 0; the uniforms, the incidence channel
and this record are what the work leaves behind.

## 3. What the coupling actually did

It is not inert, and it is not a rounding error:

```
shot          changed px    % frame   max +dL   p99      p99.9      >200%           >230%
hero              87 355     9.48 %    +86.8   183->184  195->204  0.066->0.134   4 px -> 20 px
temple             8 443     0.92 %    +38.6   181->181  195->196  0.069->0.077   1 px ->  1 px
courtyard        118 200    12.83 %    +80.6   180->187  210->215  0.222->0.596  29 px -> 272 px
sly-closeup       84 610     9.18 %    +49.0   179->184  214->215  0.212->0.328  42 px ->  60 px
```

`courtyard` gains **+7 L at p99**, **2.7×** the >200 population and **9.4×** the >230 population,
and its frame max goes 237.2 → **245.5**.

On the population where every geometric precondition for a highlight is already met — lobe fully
saturated, sun unobstructed, toon-masked (§4) — the lift is much larger than the frame aggregates
suggest:

```
shot            n px    base  p50  p90  max      ->   key  p50  p90  max
hero            2 478          159  192  227               180  213  233
temple            908          173  175  206               175  176  204
courtyard       5 442          175  190  225               203  213  240
sly-closeup     2 176          104  113  200               113  121  209
```

`courtyard`'s highlight population moves **+28 L at its median**. That is a visible change on
exactly the surfaces a highlight belongs on.

It is simply not 230, and 20–272 pixels is not the "region, not a glint" that T2 asks for.

## 4. Why not — measured, with the channel built to answer exactly this

`debugTerm(6)` writes `vec3( specStep/1.35, lobe, sh * step(0.02, ndl) )`.

**These shares are over the mode-4 toon population, not over the frame, and that correction is
not cosmetic — see §8.** Mode 6 only writes on draws that run the cel program; every non-toon
draw renders normally into the same buffer, and its ordinary colours then read as channel values.

```
shot          toon%  | of TOON px: gates>0  gatesFULL  lobe>0  quant>=50%  quantSAT | rise on quantSAT
                                                                                      p50    p90    max
hero           75.7% |    11.065%     9.205%   3.874%      0.687%     0.355% |       17.6   33.9   86.8
temple         27.2% |     0.954%     0.650%   0.631%      0.401%     0.363% |        1.9    2.1   27.3
courtyard      15.6% |    24.022%    18.807%   8.069%      4.087%     3.782% |       26.7   29.2   68.7
sly-closeup    17.5% |    26.890%    24.576%   4.487%      1.730%     1.352% |        8.4    9.9   28.1
interior       73.7% |     0.000%     0.000%   0.000%      0.000%     0.000% |        0.0    0.0    0.0

quantSAT as pixels of the whole frame:  hero 2 478 · temple 908 · courtyard 5 442 ·
                                        sly-closeup 2 176 · interior 0
```

**The lobe lands.** 0.36–3.78 % of the toon population — 908 to 5 442 px — has a *fully
saturated* specular quantiser under a *fully unobstructed* sun. `courtyard`'s 5 442 px is three
times T2's own 1 843 px bar. So on the outdoor shots this is **not** an incidence failure in the
sense of "the geometry never makes a highlight".

And on those pixels the coupling does exactly what it should: it lifts them by a **median of
+17.6 L on `hero` and +26.7 L on `courtyard`**, with peaks of +87 and +69.

The failure is what those pixels are made of. The census — identical in all five shots, because
the level is built once: 102 sly materials, 23 spec classes — says what the lobe lands on:

```
uSpec  gloss  metal  roughness  meshes   what
 0.95    110   0.85      1        14     gold_leaf   (hooks:rings, pylon, tomb)
 0.90     96   0.85      1         6     props gold  (coins, pickups)
 0.62     72   0.85      1         3     bronze_dark
 0.55     64   0.85      1         4     hieroglyph_gilded
 0.42     62   0          1         3    granite_pink
 0.32     46   0          1         2    limestone_polished
 0.25     32   0        0.62        7    kaykit props, slydlrig:mesh  <- THE CHARACTER
 0.16     24   0          1         4    hieroglyph_wall
 0.14     20   0          1         3    sandstone_block
 0.10     16   0          1        16    paving                       <- the largest mesh count
 0.08     14   0          1         5    sandstone_worn
 0.05     10   0          1         3    mudbrick
```

The two materials that cover most of a daylight frame are `paving` (uSpec **0.10**, 16 meshes)
and the sandstones (**0.08–0.14**). Corrected model (`specmodel.mjs`, second table), fully lit,
lobe saturated:

```
material              spec NOW -> x keyRad     lit surface total, display L
sandstone_block         0.055  ->  0.134         199.4 -> 202.6      (+3.2 L)
paving_courtyard        0.037  ->  0.091         204.3 -> 206.1      (+1.8 L)
limestone_polished      0.222  ->  0.543         222.5 -> 226.8      (+4.3 L)
granite_pink            0.349  ->  0.852         198.9 -> 214.5     (+15.6 L)
hieroglyph_gilded       1.506  ->  3.845         221.6 -> 240.4     (+18.8 L)
gold_leaf               4.025  -> 10.328         241.4 -> 251.4     (+10.0 L)
```

Coupling a `uSpec` 0.10 paving stone to the sun buys **1.8 L**. It cannot be otherwise: the
coupling is one scene-wide multiply, so it preserves the authored 19:1 ratio between `mudbrick`
and `gold_leaf` exactly (H7), and a material authored dull stays dull *on purpose*.

And the materials that would cross were already known to be unavailable. §34's census, quoted
unchanged: **`hero`'s gilded mass is 98.6 % shadowed**, `spec` is `sh`-gated, and *"every
key-side lever this project has tried on gold — spec (§25), bloom gain, bloom onset (§28),
AO-on-key — operates on the same 1.4 % of pixels."* `uSpecKey` is a key-side lever and inherits
that ceiling exactly. `hero`'s twenty >230 pixels **are** that 1.4 %: the individual hits go from
base L 197–227 to 230–233, i.e. **+25 to +33 L each**, which is the gilded row of the table above
arriving on the sixteen pixels available to it.

`temple` is the control from the other side: only **0.65 %** of its toon population sees full
sun, and its landed lobe moves by a median of 1.9 L. A roofed hypostyle hall has no specular to
couple.

## 5. Corroboration from an independent measurement, quoted before the capture ran

§25 / `RESULT-goldmip.md` (TEXTURES, pre-registered, unrelated to this work) back-solved that on
`hieroglyph_gilded`'s spec-responsive cohort **display L 235 needs ≈ 2.7× the scene spec of the
`uSpec` 0.95 arm**, and that every texture-side lever stacked tops out **< ×1.9**.

The `keyRad` coupling is **×2.423** — larger than the entire texture-side stack, and the largest
single multiplier anyone has found for this term. At the shipped `uSpec` 0.55 it is ×1.40 in
units of that 0.95 arm, against a requirement of ×2.7. **The prereg said so before the frames
existed, and the frames agree.**

## 6. The forecast, scored — I was wrong on more of it than I was right

Registered in PREREG-hilite2 §7, scored here either way.

| forecast | outcome |
|---|---|
| T1 fails on all four | **RIGHT** — 0/4 |
| T2 fails on all four | **RIGHT** — 0/4 |
| H6 passes on `sly-closeup` and `temple`, fails on `hero` and `courtyard` | **WRONG on 3 of the 4 shots.** It passed on `courtyard` alone. I named the two shots with the *most* gold in the material list and got both wrong; `temple`'s gild is roofed, and the `sly-closeup` cane I was counting on **is not a material in this build** (see §7) |
| H6 passes 2 of 4 | **WRONG, and wrong optimistically** — 1 of 4 |
| the `off` arm shows spec worth < 3 L at p99, on < 5 % of frame | **WRONG on the size, RIGHT on the extent.** p99 of the removed luma is **88.6 L on `hero`** and 64.6 on `courtyard`, not < 3. Extent 0.88–8.08 %, and only `courtyard` exceeded 5 %. I had the specular's *reach* about right and its *magnitude* wrong by more than an order of magnitude — it is already a large term where it lands |
| joint saturated population < 0.5 % of frame on all four | **RIGHT as stated, for the wrong reason, and I nearly scored it wrong.** Against the frame the corrected shares are 0.269 / 0.099 / **0.591** / 0.236 % — `courtyard` misses. Against the *toon population*, which is the meaningful denominator, they are 0.355 / 0.363 / **3.782** / 1.352 %. My first, unmasked pass read 1.643 % and 1.189 % and I recorded a miss on that basis; both readings were contaminated (§8). Scored as **MISSED on `courtyard`**, whichever denominator is used, and the lobe lands considerably more often than I predicted — which is the single most useful thing this run found |

The last two misses matter more than the gate results, because together they overturn the
sentence I wrote in the prereg's own §3.3 — *"the whole question is incidence, not amplitude"*.
**It is amplitude, on the materials the lobe lands on.** The geometry makes highlights; the
`uSpec` values under them are 0.08–0.16 by art direction.

## 7. Two model inputs were wrong, and the live census is what caught them

Recorded rather than quietly fixed, because the prereg's §3 table is quoted in `toon.glsl.js`.

1. **`rgh` was too low on every mapped material.** `ToonMaterial.js:1082` reads
   `roughness: o.roughnessMap ? 1.0 : o.rough` — three's own convention — so
   `roughnessFactor = 1.0 × ormG`, not `TUNE.rough(0.62) × ormG` as the prereg modelled.
   `packORM` writes roughness straight into G with no rescale, so ormG is the recipe's own
   `rough`. Every architecture material in the census reports `roughness: 1` with a map; only the
   map-less ones (the rig mesh, kaykit props, sand rings, pyramids) sit at 0.62. Direction: the
   prereg table **over-states** the specular on every mapped material, `sandstone_block`'s
   ceiling by ×2.0 (0.109 → 0.055).
2. **`sly cane gold` is not a material in this build.** The character traverses as one
   `slydlrig:mesh` at the TUNE defaults — `uSpec` **0.25**, gloss 32, rough 0.62, metal **0**.
   `SlyModel.js`'s per-part table (0.025–0.9, cane at 0.9/96/metal) is not what the scene holds.
   That row was the whole basis of my `sly-closeup` forecast, and it does not exist. It also
   means **the character has no metal on him at all in these frames**, which is worth its own
   look by CHARACTER and is not mine to change.

Both corrections make the *measured* result more consistent, not less: a weaker modelled
specular is what the frames show.

## 8. Two instrument problems, one of them mine

### 8.1 My `debugTerm(6)` shares were contaminated, and `interior` is what caught it

The first pass at §4's table was computed over **every pixel in the frame**. That is wrong, and
badly: mode 6 only writes on draws that run the cel program, so sky, particles and every other
non-toon draw render **normally** into the same buffer and their ordinary colours are then read
as if they were `specStep` / `lobe` / gate values. `B >= 1` counts any pixel with a little blue
in it, which is most of a sky.

`debugTerm(4)` is the mask — *"nothing else in a frame writes that triple"*, `toon.glsl.js`'s own
`DEBUG_CALIB` says so, and §256's T7 called it "the toon-population map" in as many words. I had
already captured it, on the same frame, for I4. I did not use it.

Size of the error, unmasked → masked, as a share of the whole frame:

```
                gates > 0          quantiser saturated
hero          29.338% -> 11.065%*   0.308% -> 0.269%
temple        68.413% ->  0.954%*   0.127% -> 0.099%
courtyard     83.955% -> 24.022%*   1.643% -> 0.591%     (2.8x over-stated)
sly-closeup   80.210% -> 26.890%*   1.189% -> 0.236%     (5.0x over-stated)
interior      22.668% ->  0.000%*   0.069% -> 0.000%     (the true answer is EXACTLY ZERO)
                        (*now of the toon population)
```

`interior` is what exposed it: the unmasked map claimed 22.7 % of the frame was gated and 637 px
had a saturated lobe, while all four of its arms were **byte-identical**. Those two facts cannot
both be true, and checking which of the 637 carried the mode-4 triple answered it: **none of
them.** A number that could not be reconciled with a zero is what forced the check — a run
without that zero in it would have shipped the contaminated table.

The runner and the analyser now both mask, and both carry the reason at the site.

### 8.2 One thing left unexplained

The coupling **darkens** some pixels — up to −62 L on `hero`, −27 on `temple`. A term that is
added cannot darken a pixel, so it is a post-pass. It is spatially local to the brightening:
of `hero`'s 133 pixels darkened by more than 20 L, the share lying within R px of a pixel
*brightened* by more than 20 L is

```
R = 2 px  54.9 %     R = 4 px  71.4 %     R = 8 px  83.2 %     R = 16 px  93.7 %
```

which is the signature of the composite's spatial passes — FXAA's edge blend, the chromatic
offset, and the bloom pyramid's neighbourhood — rather than of any per-pixel term. **I did not
isolate which of the three**, and it is 133 px out of 87 355, so it did not change a verdict.

## 9. What I did NOT measure

* **Bit-identity of the edited build against the pre-edit build.** It is an IEEE argument
  (PREREG §2), not a measurement. What is measured is that returning `uSpecKey` to 0 after
  visiting 1 reproduces `base` on exactly 0 px (I1).
* **A per-pixel material segmentation.** The delta-tint split in `hilite2-where.mjs` is a
  two-class metal-vs-neutral separation, not a per-recipe one. `hero`'s changed set is
  17 972 warm / 69 058 neutral / 325 cool; `courtyard`'s 7 436 / 110 396 / 368. That is
  consistent with "mostly stone, a minority metal" and cannot say more.
* **Linear scene radiance.** I4 fired, so the readback path is proven, but every number above is
  display bytes. The linear figures §256 quotes were not re-derived here.
* **Anything at a time of day other than the four shots' own.** `night`, `guard` and `interior`
  were outside the registered set; `interior` is §10 below.
* **The `specStep` quantiser's missing energy normalisation.** Declared out of scope in PREREG
  §8, untouched, and it is the first item in §11.
* **Which of the three spatial post-passes darkens (§8's 133 px).** Located, not identified.

## 10. `interior` — the addendum arm, and it returned an exact zero

Second boot, identical script, arms and thresholds; registered in PREREG-hilite2 §9 before the
frames existed and outside H6's 2-of-4 bar. I1 fired (0 px), I4 fired (73.73 %).

**All four `interior` arms are byte-identical PNGs — same md5.** `base`, `off` (`uSpecGain` 0),
`key` (`uSpecKey` 1) and `base2` are the same image. p1 14 / p50 66 / p99 143 / max 247.7 /
>230 **0.094 %**, unchanged on every arm.

* **I2 DID NOT FIRE on `interior`.** Registered consequence, applied: *"the specular term
  contributes nothing visible there, every amplitude claim about that shot is VOID, and that is
  itself the finding."* It is the finding.
* **The mechanism is exact, not marginal.** `debugTerm(6)` masked to the toon population:
  **0.000 % of `interior`'s 73.7 % toon coverage has `sh * step(0.02, ndl) > 0`.** Not a small
  number — zero pixels. The specular is multiplied by exactly 0 across the entire frame, which
  is why removing it changes nothing and why coupling it to a 3.642-luma key changes nothing.
* **E1 FAILED.** It asked `interior` to show a rise in >L230 share at least 4× the largest among
  the four registered shots (`courtyard`, +0.027 pp). `interior` showed **+0.000 pp**.
* **E2 FIRED, and it is the sharper one.** On `interior` the binding constraint is incidence,
  absolutely: there is no lit surface for a specular to sit on, so no amplitude lever —
  `uSpecKey`, `uSpec`, bloom gain, bloom onset — can touch it. `interior` already has the
  **largest >230 population of any shot measured (0.094 %)** and *none of it is specular*; it is
  emissive (`ceiling_stars`, torches).

**I read §34's census wrongly, and the correction matters.** "`interior`'s `gold_leaf` is 53.7 %
above the terminator" is a statement about **N·L**, the diffuse ramp's terminator. It says
nothing about **`sh`**, the cast-shadow term — and `interior` is a roofed tomb, so `sh` is 0
everywhere. `spec` is gated by *both*. I picked the shot with the most gold facing the sun and it
is the shot where none of it is *reached* by the sun. Recorded as a misreading of an existing
measurement, not as a new one.

So the answer to "is it amplitude or incidence" is **both, and which one depends on the shot** —
E2's either/or was too coarse:

* `hero`, `courtyard`, `sly-closeup`: the lobe lands on 0.24–0.59 % of the frame, saturated, in
  full sun. **Amplitude-bound** — the `uSpec` under it is 0.08–0.16.
* `temple`, `interior`: 0.65 % and **0.000 %** of the toon population sees full sun.
  **Incidence-bound** — there is nothing to amplify.

## 11. What would actually deliver a highlight, ranked by measured headroom

1. **The `specStep` quantiser has no energy normalisation, and that is where the blow-out lives.**
   `specStep = smoothstep(0.30, 0.52, lobe) + 0.35·smoothstep(0.02, 0.30, lobe)` is a *shape*
   function capped at **1.35** regardless of `glossP`. In any microfacet model the normalisation
   is what makes a tighter lobe *brighter* — the same energy into fewer pixels. Here raising
   `uGloss` makes a highlight smaller and no brighter at all. A Blinn normalisation at
   `glossP` 95 is ≈ ×12; the coupling this run measured is ×2.423. **That is the biggest
   remaining multiplier in the term by a factor of five, and it is the physics the shader is
   still missing.** It needs its own prereg and per-material `uSpec` re-tuning, because it would
   scale *with gloss* and so would re-order materials, which is exactly what the coupling does
   not do.
2. **The `uSpec` values under the population that actually catches the lobe.** `paving` at 0.10
   and the sandstones at 0.08–0.14 are 24 of the level's meshes and most of every daylight frame.
   Raising them is art direction (ARCHITECTURE's `RECIPES`), it *is* the "limestone turns to
   plastic" risk, and it is measurable in one boot with the levers this run leaves behind.
3. **Put lit gold in frame.** `gold_leaf` at 4.025 scene already clears both display 230 and
   `bloomThreshold` 2.20 **with no change at all** — §25 measured it reaching bloom on the hook
   rings, the cane and the gilded Ra. §34's census: `interior` 53.7 % of `gold_leaf` above the
   terminator, `courtyard` 10.0 %, `hero` **1.4 %**. The shot the gold line keeps being judged on
   is the one where the gold is in shadow. This is composition, which the owner has ruled out.
4. **Not the sun** (§256, measured), **not the tonemap** (§256, calibrated to 0.0 L on 11 of 11),
   **not the shadow clamp** (§261, zero authority over p99 by construction), and **not this
   coupling on its own** (this run).
