# NOTE — §342.2's arithmetic, re-derived against §344's measured `key`

§344 measured `colossus-L` at `sh` **0.1768**, `key` **0.0281**, refuting the record's claim that
that object sits at `sh = 0`. §342.2 had computed its reachability figures *"at full shadow
authority (`sh = 0`)"* on the strength of that claim, so its arithmetic is owed a re-derivation.
This is that re-derivation.

**Offline throughout.** No boot, no capture, no browser, no capture lock, no `src` change. Every
number below comes from frames already committed — `shots/r12/courtyard.png` and the five arms in
`progress/records/keyprobe1/` — through instruments already committed. Tool and full output beside
this file: `rederive.mjs`, `rederive-out.txt`.

**Nothing here moves a bar, re-draws a rect, proposes a candidate, a dose or a new bar.** §141.1:
this is post-hoc arithmetic written after the fact, and §348's standing lesson is that on this item
every pre-registered bar has held while every piece of post-hoc arithmetic has needed correcting.
Mine is post-hoc arithmetic. It should be read with that prior.

**PREREG-keyprobe stays VOID.** Its `PF_KEY_LO` bar was registered on the mean `key` over the
registered rect; that mean measured 0.0281; 0.0281 > 0.02; the gate failed and `K1` was not read.
Nothing below re-scores it, and **nothing below claims anything about whether the colossus's shade
face is receiving direct key** — that question is `K1`, it is unread, and it stays unread.

---

## 0. What the re-derivation found

Four things, in decreasing order of how much they change:

1. **"Full authority" is `key = 0`, not `sh = 0`,** and the distinction is not pedantic —
   `key = ramp * sh`, so a surface with `sh > 0` is still at full authority wherever `ramp = 0`.
   §344 refuted a claim about `sh`; §342.2 spent it as a claim about `key`.
2. **§342.2's figures were, in fact, already taken at 99.2–100 % authority — by accident, not by
   design.** Re-basing them against measured `key` barely moves them. The reason it barely moves
   them is itself a defect nobody had recorded: R/G and `key` were never computed over the same
   pixels. The R/G came from the darkest 12 % of *flat* patches, and the flat-patch filter
   systematically excludes exactly the keyed pixels.
3. **§342.2's second line — "hueGrade off → 0.64–1.18, straddles the bar" — is not re-basable at
   any authority.** It transfers a suppression ratio across a change of albedo, and the shipped
   diffuse sum contains a term with no albedo factor at all. That defect is independent of the
   `sh` premise and survives every correction to it.
4. **The two captures the item has been reasoning across do not agree about colossus-R.** §336's
   own statistic — darkest 12 % of clean patches — gives **3.74** on `shots/r12`, reproducing the
   published figure exactly, and **1.18** on the frame §344 measured `key` on. §342.2's 1.02 on
   colossus-L and §336's 0.52 on the ground reproduce on both. **§336's 3.74 and §344's 0.1017 are
   measurements of two different states of colossus-R and may not be combined.**

Consequence for the question asked: **for §336's `R/G ≤ 0.90` bar the honest answer is CANNOT BE
DETERMINED from what is measured** — not "still unreachable", not "now reachable". §7 shows why,
and names the measurements that would decide it.

---

## 1. What "full authority" means, read out of the shader

`toon.glsl.js`, at this sha, read rather than modelled:

```glsl
:492   float sh   = smoothstep( uShadowSharp.x, uShadowSharp.y, shadowRaw );
:495   float ramp = slyRamp( ndl, uBands );
:528   float key  = ramp * sh;
:583   float shadowMix = 1.0 - key;
:756   vec3 diff = alb * keyRad * key * mix( 1.0, ao, uAoKey )
:757             + ( albAmb * slyFillX * ao
:758               + shadBand * shadowMix * mix( 0.55, 1.0, ao )
:759               + slyShadX * uShadowWash * ( 1.0 - hold ) * shadowMix * ao ) * shadeForm;
```

and the file's own prose at `:622`: *"Both terms that carry this light are multiplied by
`shadowMix`, so the knob's authority is exactly proportional to shadow depth."*

**So the wash's authority is `shadowMix = 1 − key`, and full authority means `key == 0` exactly.**

This matters more than a change of variable. `sh = 0` implies `key = 0`, but the converse is false:
`key = 0` needs only `ramp = 0`, which happens wherever `N·L` falls below `termLo`. **`sh` is not
the quantity that sets authority and never was.** `NOTE-shadowtint-space.md:258` asserted
`sh = 0, hence key = 0`; §344 falsified the antecedent by measurement; but the figure §342.2
actually needed was the consequent, and that one was never measured on the population it was
applied to. §2 and §3 measure it.

Four shipped constants simplify the sum and each was read, not assumed:
`shadeBand 0.0` (`ToonMaterial.js:763`) ⇒ `shadeForm == 1` exactly; `shadowHold 0.0` (`:226`) with
`subjShadowHold` `vSlySkin`-scoped ⇒ `hold == 0` on architecture and props; `aoKey 0.0` (`:736`) ⇒
the key term is not multiplied by AO; `shadowBounceMix == shadowBounceMixLit == 0.05` (`:520`,
`:546`) ⇒ the depth blend at `:627` is an exact no-op, so `slyShadX` does not move with
`shadowMix`. The first three were used below; the fourth removes a confound §342.2 would otherwise
have inherited.

### Authority, measured

Recomputed from `keyprobe1/courtyard.term5.png` — the committed §344 table reproduces exactly, to
all four decimals, on all four rects (`rederive-out.txt` §1):

| rect | mean `key` | authority `1 − key` | shortfall |
|---|---|---|---|
| `CAST_L` (colossus-L, the control) | 0.0281 | **0.9719** | 2.81 % |
| `SHADE_R` (the rect under test) | 0.1017 | **0.8983** | 10.17 % |
| `GROUND` | 0.3010 | 0.6990 | 30.10 % |
| `LIT_R` | 0.5382 | 0.4618 | 53.82 % |

`SHADE_R`'s 0.1017 is used here **only** as a raw instrument reading, to compute a number,
0.8983. `RESULT-keyprobe` §6 states in terms that the scorer's rect table is *"the instrument's raw
output, not a verdict"*. Whether that face is "keyed" is `K1`, and `K1` is not read.

**§342.2's label was wrong: its control's rect mean sits at 97.19 % of authority, not 100 %.**
Whether that matters to its numbers is §3, and the answer is surprising.

---

## 2. Does anything in the data actually reach full authority?

**Yes — per pixel. No — at the level any published statistic is computed at.**

A mean over a rect is not a state. Two things the mean hides, both computable from the committed
frames (`rederive-out.txt` §3):

**(a) 1.19 % of the `CAST_L` rect is background.** A pixel no debug-term draw covers keeps the same
value in the `cal`, `term5` and `term6` arms; 997 of the rect's 84,000 pixels do. Their blue
channel is not `key` at all — it is whatever the non-toon passes left in the buffer. Removing them:

```
mean key, WHOLE rect      0.0281      <- the statistic PF_KEY_LO scored
mean key, SURFACE only    0.0229      <- the statistic about the surface
background supplies 18.6% of the scored mean
```

This does **not** rescue the seal, and I want to be explicit about that. The bar was registered on
the mean over the registered rect. That mean is 0.0281. 0.0281 > 0.02. `PF_KEY_LO` failed, the run
VOIDed, and §141.1 forbids re-drawing the rect after the fact to improve it. The surface-only
figure is the right one for a *physical* re-derivation and the wrong one for the *gate*, and those
are different questions.

**(b) The distribution is bimodal, and the mean sits where almost nothing is.**

```
surface pixels at key == 0 (byte 0)   46,638 = 56.2% of surface pixels
key percentiles, surface pixels       p50 0.0000  p75 0.0039  p90 0.0078  p95 0.0118  p99 0.6039
```

**A majority of the control surface is at `key = 0` — full authority, to the 1/255 resolution of
the readback.** The rect mean of 0.0281 is a small hard-keyed tail (relief edges, inlay, collar)
averaged against a large population at exactly zero. **No single `sh` describes this control**, and
the "sh = 0.1768" figure — itself a mean of per-texel `key/ramp` over texels clearing a `ramp`
floor — describes neither mode.

So: *is full authority reached anywhere in the data?* At pixel level, in most of `CAST_L` and in
40.1 % of `GROUND`. At rect-mean level, nowhere: the closest is `CAST_L` at 97.19 %.

---

## 3. Line 1 re-derived — and the population §342.2 read was never at 97.19 %

§342.2's first line was `shipped albedo (input 6.344) at full authority → 1.02–1.86`. Those R/G
figures are the shadowtint lane's clean-patch aggregates over `CAST_L`: 10×10 patches with
per-channel sd ≤ 3, taken as the darkest 12 % and as display-luminance bins. The honest
re-derivation is not to apply the rect mean to them — it is to measure the `key` of **the exact
pixels each figure was computed over**. Inside one capture (`rederive-out.txt` §5):

| §342.2's own statistic | R/G | mean `key` of that population | authority |
|---|---|---|---|
| DARK 12 % — the "1.02" end | **1.02** | **0.0016** | **99.84 %** |
| display L 55 ± 2 bin | 0.97 | 0.0000 | 100.00 % |
| display L 65 ± 2 bin | 1.53 | 0.0034 | 99.66 % |
| display L 75 ± 2 bin — the "1.86" end | 1.85 | 0.0058 | 99.42 % |
| display L 85 ± 2 bin | 1.76 | 0.0079 | 99.21 % |

**Every one of the 329 clean patches in `CAST_L` carries `key ≤ 0.0080` — authority ≥ 99.2 %.**

That is the re-derivation, and it does not go the way the task's framing expects. §342.2's numbers
were already at essentially full authority. Re-basing them against the measured state moves them by
under one part in a hundred of `shadowMix`. **The premise §344 refuted was false about the rect and
almost true about the pixels §342.2 actually read.**

It got there by luck, and the luck has a mechanism worth writing down: **the sd ≤ 3 flat-patch
filter that produces every published R/G on this item systematically excludes keyed pixels.** Key
arrives on this object through relief edges, inlay bands and collar rows, which are not flat and
never survive the filter. So the instrument that measures the colour is blind to the very
population that carries the term the item is arguing about. That is not a small methodological
note — it is why "R/G and `key` were never computed over the same pixels" was invisible for three
sections of ledger.

**But the range is not a lighting range.** Across §342.2's whole cited 1.02–1.86, R/G varies
**1.9×** while authority varies by **under 0.8 percentage points**. Within this object, authority is
not what moves R/G. Whatever produces the spread — orientation, AO, or a different material — the
one thing it is not is shadow authority.

### The same patches, binned by their own measured `key`

```
key == 0 exactly      23pat  L 63  h 209   R/G 0.67   B/G 1.03
0 < key <= 0.01      306pat  L 73  h 348   R/G 1.70   B/G 0.87   (mean key 0.0049)
```

The naive reading — "removing the key leak takes granite from 1.70 to 0.67, under the bar" — is
**refuted by its own arithmetic**. If `key` alone carried R/G from 0.67 to 1.70 across a `key`
difference of 0.0049, the slope would be 210 per unit `key`, and the 0.1017 §344 measured on
`SHADE_R` would put that rect at R/G ≈ 22. Nothing in the frame reads anything of the sort.
**The two populations differ in something other than `key`, and the difference between them may not
be attributed to shadow authority.**

What they differ in is visible: **41 % of the darkest-12 % patches sit at x ≥ 290**, on a separate
block face at the right of the rect, across an ink line and an edge highlight from the large mauve
body (`tools/crop.mjs progress/records/keyprobe1/courtyard.off.png out.png 70 150 280 300 2`, looked
at at 2×; the boundary at 6× from `250 350 100 100`). **The `CAST_L` rect is not one surface**, and
§342.2's "colossus-L reads 1.02–1.86" is a mixture statistic over at least two of them.

---

## 4. Line 2 is not re-basable at any authority

§342.2's second line took the suppression implied by `1.02–1.86 ÷ 6.344` and applied it to a
smaller input, `4.006` (granite with `hueGrade` deleted), to get `0.64–1.18` and the conclusion
*"STRADDLES the bar"*.

That step requires the rendered R/G to be a function of the albedo's R/G alone — homogeneous of
degree 1 in the albedo. **The shipped diffuse sum is not.** With `shadeForm == 1`, `hold == 0` and
`aoKey == 0` (§1), `toon.glsl.js:756-759` is

```
D_c = alb_c·keyRad_c·key  +  albAmb_c·fill_c·ao  +  albShadow_c·slyShad_c·shadowMix·mix(0.55,1,ao)
                          +  slyShad_c·uShadowWash·shadowMix·ao
```

- the **last term carries no albedo factor at all** (`uShadowWash 0.05`, `ToonMaterial.js:172`) —
  it is a constant addition per channel, with the shadow light's own R/G, independent of what
  material is underneath;
- `albShadow` and `albAmb` mix `alb` toward its own **luma** (`uShadowSat −0.35`, `:173`) — a
  channel-**mixing** map, not a per-channel scale.

So `D = (a linear, non-diagonal map of alb) + (a constant independent of alb)`, and `D_R/D_G` is
**not** a function of `alb_R/alb_G` alone. "Apply the same suppression to a smaller input" is not an
operation this shader supports.

**This is a second, independent defect in §342.2, and it is the §348 shape exactly — a dropped
colour term.** It is also, retroactively, a defect in §342.1, which built its whole "albedo alone
must fall to 1.025" and "over by 2.62×" arithmetic on the same assumption. Neither line can be
repaired by measuring `sh` better. What would replace them is a rendered A/B: bake the `hueGrade`-off
granite and render the same shot, which is the only way to learn what a different albedo does to
this pixel. That is a capture, and it is not proposed here.

---

## 5. The finding that blocks the reachability question outright

Every suppression figure on this item pairs an R/G measured on `shots/r12/courtyard.png` with a
lighting state asserted about — and now measured on — `progress/records/keyprobe1/`. Those are two
captures, two days apart, and **no record checks that they describe one scene state**. §341 says how
to check: reproduce the statistic, not the bytes. Done (`rederive-out.txt` §4).

First in the lane's **own published statistic** — darkest 12 % of clean 10×10 patches, sd ≤ 3 —
which reproduces every committed figure on r12 exactly, so the instrument is not in question:

| statistic | r12 | keyprobe1 |
|---|---|---|
| colossus-R body-all — **§336's 3.74** | **3.74** (L71, h345) | **1.18** (L82, h342) |
| `SHADE_R` | 3.11 (L67, h335) | 1.08 (L80, h279) |
| `CAST_L` — **§342.2's 1.02** | **1.02** (L60, h234) | **1.02** (L60, h234) |
| `GROUND` — **§336's 0.52** | **0.52** (L43, h209) | 0.54 (L45, h209) |

And again over whole regions, flat pixels only, which removes any dependence on the 12 % selection:

| region | r12 | keyprobe1 | R/G ratio |
|---|---|---|---|
| colossus-L body box 1 / 2 / 3 | 1.62 / 1.62 / 1.71 | 1.62 / 1.62 / 1.71 | **1.00×** |
| colossus-L right block | 0.68 | 0.68 | **1.00×** |
| `CAST_L` whole rect | 1.32 | 1.32 | **1.00×** |
| `SHADE_R` whole rect | **2.75** | **1.21** | **0.44×** |
| `LIT_R` whole rect | **4.96** | **1.30** | **0.26×** |
| colossus-R body-all | **3.46** | **1.18** | **0.34×** |
| `GROUND` whole rect | 1.17 | 0.98 | 0.84× |

The left of the frame reproduces to four decimal places in linear. The colossus-R rects do not —
they are off by factors of 2.3 to 3.8, on both statistics.

Where the frames differ (mean max-channel byte difference, 160×120 cells) the change is confined to
the centre-right, and the **sky is unchanged** at all three sampled patches (h 217/209/214 → h
216/207/216, L within 4). So the sun did not move and the camera did not move: the geometry is
pixel-aligned, which is why `CAST_L` matches at all.

**Therefore §336's R/G 3.74 and §344's `key` 0.1017 are measurements of two different states of
colossus-R and may not be combined.** The rect under test has an R/G from one capture and a `key`
from another, and they disagree.

**This bears on `PREREG-keyprobe2` and is handed over rather than acted on.** That draft compares
`key` across three boots of the debug instrument (§350's A, C, D). Nothing in it, and nothing in
§344 or §350, checks whether those boots agree with each other or with `shots/r12` in **display
space on colossus-R** — and this note shows two committed captures that do not. Whether boot A
(`bandgate1/`, 12:26) sits on the r12 side of that difference or the keyprobe1 side is exactly the
sort of thing `R_BOOT` exists to find out, and §350 reserves those frames unscored, so I have left
them alone (§10).

**NOT CLAIMED: why.** I cannot run `git`, so I cannot diff the two shas. Candidate causes I can
name but not distinguish: the PROPS colossus lane was live in that window
(`PREREG-colossus.md`, `DESIGN-colossus-assets.md`, §320/§321 — the colossus sculpt failed its LOOK
gate and was under replacement), so the east statue may have been re-authored or re-materialled;
or a shading change touched key-lit surfaces only. **NOT CLAIMED: that the defect §336 measured is
fixed.** The keyprobe `off` arm is a legitimate shipped render at its sha — `uDebugTerm 0`,
`debugRaw false`, and byte-identical to the `back` arm — but it is one debug capture, not a roster
capture, and one frame proving something is exactly what §337 records as an overclaim.

---

## 6. Granite at full authority — bounded, not determined

The quantity §342.2 needed, and the one this re-derivation was supposed to supply, is: **what does
`granite_pink × 0x9c8278` read at `key = 0`?** The committed frames contain two candidate answers
and they disagree by 2× (`rederive-out.txt` §6). Holding object and material as fixed as the data
allows — flat pixels inside colossus-L's own large mauve face, split by their own measured `key`:

| sub-box (spatial, picked from the LOOK before any R/G in it was computed) | `key == 0` | `key > 0` |
|---|---|---|
| body box 1 `[120,255,120,60]` | R/G **1.32** (77 px, 1.4 %) | R/G 1.62 (5,387 px) |
| body box 2 `[150,330,100,50]` | R/G **1.21** (386 px, 14.1 %) | R/G 1.68 (2,358 px) |
| body box 3 `[100,290,80,60]` | *no key == 0 pixels* | R/G 1.71 (2,737 px) |
| the separate right-hand block `[300,395,45,30]` | R/G **0.68** (676 px, 100 %) | — |

Two readings of "the cast-shadowed twin at full authority": **1.21–1.32** on the body, **0.68** on
the block face beside it. Nothing committed establishes which of those surfaces carries the albedo
that "input 6.344" names — there is no material-identity readback, and §4's census plus the LOOK
show the rect holds granite, gold/ochre inlay and blue inlay together.

And the within-body split is not clean either: the `key == 0` pixels there are darker (L 56–58 vs
68–69) and a small minority share, so they sit in recesses and differ from the keyed pixels in AO
and normal as well as in `key`. **This is a bound, not a value.**

---

## 7. What this does to §336's `R/G ≤ 0.90` bar

Three answers were available. The honest one is the third.

**Not "now reachable".** §342.2's route to that verdict was line 2 — delete `hueGrade`, get
0.64–1.18, straddle the bar — and line 2 is invalid arithmetic (§4), not merely mis-based. Its
line 1 support is a mixture statistic over at least two surfaces (§3).

**Not "still unreachable" either.** §342.1's "over by 2.62×" rested on the same invalid transfer
and on a suppression taken from a surface in a different state; §342.2 withdrew it and the
withdrawal stands. Nothing here restores it.

**CANNOT BE DETERMINED, and here is the chain, each link a measurement rather than an argument:**

1. The bar is stated on the colossus's shade face. The only `key` measurement of that face
   (0.1017 → authority 0.8983) comes from a capture on which the bar's own statistic reads **1.18**,
   and the **3.74** the bar was written against comes from a capture on which its `key` was never
   measured (§5). **The bar's subject has no co-measured pair of (R/G, authority) anywhere in the
   record.**
2. Even with such a pair, moving from a measured authority to full authority requires the
   per-channel split of the pixel's radiance into its key term and its shade terms. `debugTerm(5)`
   writes the scalar `key`; nothing committed writes `alb·keyRad·key` per channel. So the
   extrapolation cannot be performed (§9.5).
3. The direction of that extrapolation is known even though its size is not. Removing key removes
   the reddest term in the sum (the key path multiplies an albedo at R/G 6.344 by a key that is
   warm at the shipped default — `PAL.sun 0xffd9a0`, `ToonMaterial.js:914`) and simultaneously
   raises `shadowMix`, which scales up a shade side whose additive wash is cool (`slyShad` linear
   `(0.1039, 0.3384, 0.5367)`, G/R 3.258, quoted in `toon.glsl.js`'s own §269 comment).
   **Both push R/G down**, so a measured R/G at `key > 0` is an **upper bound** on the same
   surface's full-authority R/G. That is INFERRED from the shader's structure, and it is a sign,
   not a magnitude.
4. The best-matched surface measured at genuine full authority — colossus-L's own body at
   `key == 0` — reads **1.21–1.32**, i.e. **1.3–1.5× over the 0.90 bar**, with the confounds in §6.
   The 0.68 reading beside it is on a surface not established to be the same material.

So the strongest defensible statement is directional and weak: **on the only granite-plausible
surface measured at full authority, closing the key leak alone does not get under 0.90** — it lands
around 1.2–1.3 — but that surface is confounded, its twin is in a state the frames disagree about,
and the albedo lever cannot be priced at all until a rendered A/B exists.

**What survives untouched, and is strengthened.** §342.2's structural point — the courtyard ground
was the wrong control, because it differs from the colossus face in cast-shadow state, orientation
and bounce — is correct and is not in question. And "**the bar must be relative**" is now supported
by a better number than either §342.1 or §342.2 had: inside one rect, on one object, in one frame,
with authority pinned between 99.2 % and 100 %, R/G ranges over **0.97 to 1.85** — and inside
colossus-L's own mauve face alone, over **1.21 to 1.71**. An absolute R/G bar cannot discriminate a
shading path when the path delivers a 1.4–1.9× spread at fixed authority. (It is *not* one material
across the rect — §3 — which is a second reason the bar cannot be absolute, and a reason its
successor needs the material mask in §9.2 whatever form it takes.) §342 is untouched throughout —
it is texture arithmetic against a double-digest-proven control and never depended on any of this.

---

## 8. VERIFIED / INFERRED / NOT CLAIMED

**VERIFIED** — reproducible from committed bytes by `rederive.mjs`, or read directly out of `src`:

- `shadowMix = 1 − key` (`toon.glsl.js:583`), every shade-side term multiplied by it (`:757-759`),
  `key = ramp * sh` (`:528`). Full authority ⇔ `key == 0`.
- `shadeForm == 1` (`shadeBand 0.0`), `hold == 0` on architecture (`shadowHold 0.0`), key term not
  AO-multiplied (`aoKey 0.0`), shadow-depth blend an exact no-op (`shadowBounceMix ==
  shadowBounceMixLit == 0.05`).
- §344's rect table reproduces exactly from `keyprobe1/courtyard.term5.png` — all four rects, four
  decimals.
- Authority: `CAST_L` 0.9719, `SHADE_R` 0.8983, `GROUND` 0.6990, `LIT_R` 0.4618.
- `CAST_L` is 1.19 % background, which supplies 18.6 % of its scored mean `key`; surface-only mean
  is 0.0229; 56.2 % of its surface pixels are at `key == 0`; the distribution is bimodal.
- All 329 clean patches in `CAST_L` carry `key ≤ 0.0080`. §342.2's DARK-12 % population carries
  mean `key` 0.0016; its L-bins carry 0.0000–0.0079.
- 41 % of the darkest-12 % patches lie at x ≥ 290, on a block face separated from the mauve body by
  an ink line and an edge highlight.
- The `CAST_L` rect contains more than one material (hue census + LOOK at 2× and 6×).
- Frame disagreement: colossus-L reproduces at 1.00× between r12 and keyprobe1; `SHADE_R` 0.44×,
  `LIT_R` 0.26×, colossus-R body-all 0.34×, `GROUND` 0.84×. Sky and camera unchanged.
- Within colossus-L's body, `key == 0` pixels read R/G 1.21–1.32 against 1.62–1.71 for `key > 0`;
  the right-hand block reads 0.68 at `key == 0`.
- The rendered diffuse sum is not homogeneous of degree 1 in the albedo.

**INFERRED** — follows from verified facts plus an argument, and is labelled as such:

- Removing a key leak lowers a surface's R/G (sign from the shader's structure; magnitude not
  derivable). A measured R/G at `key > 0` is therefore an upper bound on the same surface's
  full-authority R/G.
- The `key == 0` and `key > 0` populations inside `CAST_L` differ in something other than `key` —
  from the reductio in §3, which needs no model.
- Colossus-L's body at `key == 0` (R/G 1.21–1.32) is the closest thing in the committed data to
  "granite at full authority", and it is above 0.90. Confounded by AO, normal and minority share.
- The flat-patch filter's exclusion of keyed pixels explains why the R/G/`key` population mismatch
  went unnoticed.

**NOT CLAIMED:**

- **Whether the colossus's shade face is receiving direct key.** `K1` is not read. The registered
  decision (`KEYED ≥ 0.10` vs `DARK ≤ 0.02`, with `DARK` refuting §342.2) is untouched and open.
  §344's 0.1017 is used here only as a raw instrument reading, never as that verdict.
- Why the two captures differ on colossus-R, or which of the candidate causes in §5 is right.
- That §336's defect is fixed, or present, at the current sha.
- Any value for granite's full-authority R/G. §6 gives a bound with two disagreeing candidates.
- Any reachability verdict for the 0.90 bar, in either direction.
- That `PF_KEY_LO`'s failure was an artefact. It was a real failure of a registered gate on a
  registered statistic.

---

## 9. Quantities this re-derivation needed and nobody has measured

Named, not invented, each with the measurement that would supply it.

1. **The R/G of `granite_pink × 0x9c8278` at `key = 0`, on pixels established to be that material.**
   *Supplied by:* a **`uKeyIntensity = 0` arm** on `courtyard` over the existing rects — the
   measurement §336 §10 already named as equivalent to the `key` readback. It puts the whole rect
   at `key = 0` by construction, so R/G and authority are co-registered with no population mismatch
   possible, and the frames in `keyprobe1/` show the staging already works.
2. **A material-identity mask per rect.** Nothing committed establishes which pixels of `CAST_L` or
   `SHADE_R` are granite; §3/§4/§6 show they are not all granite. Without it, every "the colossus
   reads R/G x" in this arc is a mixture statistic of unknown composition. *Supplied by:* an
   object- or material-id readback in the same debug family as `debugTerm`, or narrower rects drawn
   against one.
3. **A per-rect albedo readback.** §342.1's own caveat, still outstanding: every "input" figure
   uses the whole-texture mean as a proxy, which §342 showed runs ~16 % high on the lit face — and
   §6 shows the rect-is-one-material error is larger than the 16 % one. *Supplied by:* a debug arm
   writing `alb` (albedo × tint) per channel; same shape and cost as the `key` readback.
4. **What changed on colossus-R between `shots/r12` and `keyprobe1/`.** *Supplied by:* a fresh
   roster capture of `courtyard` at the current sha plus a re-run of
   `progress/records/shadowtint/table.mjs` on it — which also re-establishes whether §336's 3.74,
   the number bar E2's "measured now" column quotes, is still the frame's value. This is the
   cheapest and most consequential of the five.
5. **The per-channel split of a pixel's radiance into its key term and its shade terms.** Needed to
   extrapolate any surface from a measured `key` to `key = 0` analytically rather than by capturing
   the endpoint. `debugTerm(5)` writes the scalar `key`; nothing writes `alb·keyRad·key` in RGB.
   *Supplied by:* a new debug mode writing the key term and the shade sum as separate colours — or,
   more cheaply, by (1), which measures the endpoint directly and needs no model. §333's warning
   applies: an offline forward model of this sum is exactly the thing that diverged 25× from a real
   capture, and I did not build one.
6. **A rendered `hueGrade`-off arm.** The only way to price the albedo lever, now that §4 shows the
   ratio transfer is not a legal operation. §342's A/B is a *texture* A/B; the frame side has never
   been run.

---

## 10. What I deliberately did not do

**I did not decompose `SHADE_R`'s `key`.** The tool computes nothing new on that rect beyond the
display-side R/G whose provenance §5 puts at issue; `rederive-out.txt` carries only the rect means
already tracked in `progress/records/logs/keyprobe-score.txt`. The distribution of `key` inside
`SHADE_R` is precisely the question `K1` was registered to answer, and §344 instructs the successor
to derive a new negative-control bar from *a measured distribution*. Publishing it would leave the
re-seal no bar it could register without §141.1's objection — *I have measured the candidate's own
axis, so a bar drawn after this is not a bar.*

That judgement is confirmed by a lane running concurrently with this one. **§350** refuses a
keyprobe re-seal on the committed frames and builds `PREREG-keyprobe2` on two un-read quantities,
one of which — **`MIX`, "is `SHADE_R` one population or a mixture"** — *is* that distribution; its
§0 lists "any distribution inside `SHADE_R` on any frame" among the things it refused to compute.
Had this note published one, that seal would have been dead on arrival.

**I have also not touched `bandgate1/courtyard.ramp.png`,** which §350 identifies as the only
genuinely independent boot of this instrument and reserves, unscored, for `keyprobe2`'s `R_BOOT`.
Every `key` figure here comes from `keyprobe1/courtyard.term5.png`.

**Disclosed, because withholding silently would be worse:** while probing the frames I did compute
a coarse histogram of that rect once, in a scratch file outside the repo, before deciding it should
not be reported. It is written to no committed file and appears in no output of `rederive.mjs`, and
the author of the `keyprobe2` draft has not seen it. Recorded so that whoever scores `MIX` knows the
quantity was looked at in a transient context and can decide whether that matters to them; my view
is that it does not, since nothing derived from it reached a file or a bar.

**I also did not:** re-score `PREREG-keyprobe`, re-draw any rect, propose a candidate, a dose, a
`TUNE` change or a new bar, or touch `src/**`, `KNOWN_ISSUES.md`, `AGENTS.md`, or any existing
NOTE / PREREG / RESULT. Nothing ships.

---

## 11. The lesson this item has now failed four times

§344 counted three controls, each wrong differently: §342.1 used a rect in the wrong lighting
state; §342.2 used the right object with an assumed state; keyprobe measured the state and found
the assumption wrong. The fourth is this: **keyprobe measured the state of a rect, and the R/G it
was to be paired with was measured over a different population, on a different capture, of a rect
that is not one material.** Identity was proven, then state was proven — and the *population* and
the *frame* were never proven at all.

The generalisation, offered because it is cheap and this arc keeps paying for it: **two numbers may
only be divided or compared if they were computed over the same pixels of the same frame.** §342.1
divided a terminator by an albedo across materials; §346 found a peak scored against an area bar;
§351 withdrew `PREREG-rimfloor` for the same peak-vs-area fault; and this divides an R/G by a `key`
across populations and across captures. Same failure, four costumes.

It also puts a cheap standing check in reach: **before quoting two numbers together, name the frame
and the pixel population of each.** Every defect in §3, §4 and §5 above would have been caught by
writing that one line, and none of them needed a capture to find.
