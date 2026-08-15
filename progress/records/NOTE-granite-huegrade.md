# NOTE — the colossus's red, attributed: half mineral mix, half a sign-flipped grade row

Closes the step `NOTE-colossus-albedo.md`'s ADDENDUM named for itself:

> **The next step is to read `src/textures/` for `granite_pink` and measure its mean texel R/G
> directly** — a pure offline check that either confirms this or sends it somewhere else again.

It confirms it, and then localises it one stage further than the ADDENDUM could. Everything below
is CPU arithmetic on byte buffers. No frame, no browser, no capture lock, nothing staged.

---

## 1. The control is proven, not asserted (§340)

`progress/records/granite/granitab.mjs` bakes `granite_pink` through `Bake.bake()` — the pure,
THREE-free half of the texture pipeline — and **before reading any arm** checks the CTL build
against the two digests already committed in `src/textures/baked.json`:

```
CTL guard@256  want 0550b2bf6581d6e3  got 0550b2bf6581d6e3  MATCH
CTL slot @512  want 2c6622885483fbc9  got 2c6622885483fbc9  MATCH
```

The first is the digest `bakeassets.mjs` recorded from a Node bake and cross-checked against the
browser's. The second is the digest of the bytes that were PNG-encoded into `textures.bin`. Both
matching means the fresh build and the shipped blob are **the same bytes**, so the run and the blob
are measurements of one object rather than two. The script aborts and reports nothing if either
fails — an arm read off an unproven baseline is not a control.

Independently, a separate reader (pure-Python zlib PNG decode straight out of
`public/assets/tex/textures.bin` at the manifest's offsets, no shared code with the above) measured
the shipped albedo at linear R/G **4.2605**. The Node bake reports **4.260**. Two paths, one number.

---

## 2. `granite_pink` is the reddest albedo in the catalogue, by a wide margin

Mean **linear** R/G of every shipped albedo (23 recipes, read from the blob). Linear rather than
sRGB because `Textures.js:491` loads albedo as `THREE.SRGBColorSpace` — linear is what the shader
actually multiplies:

| rank | material | lin R/G | | rank | material | lin R/G |
|---|---|---|---|---|---|---|
| **1** | **granite_pink** | **4.260** | | 7 | sandstone_block | 1.838 |
| 2 | mudbrick | 2.737 | | 8 | sand_ripples | 1.813 |
| 3 | palm_bark | 2.469 | | … | … | … |
| 4 | torch_flame | 2.459 | | 20 | limestone_polished | 1.163 |
| 5 | carnelian_inlay | 2.065 | | 21 | linen_cloth | 1.120 |
| 6 | wood_old | 1.977 | | 22–23 | palm_frond / ceiling_stars | 0.697 / 0.601 |

It is **56 % above the next material** and **2.06× `carnelian_inlay`** — the recipe actually named
for being red, and one the palette policy deliberately exempts from grading as "manufactured
mineral colour". The pink granite is twice as red as the carnelian.

**This accounts for the measured frame.** The colossus's 19 stone parts resolve to
`Props.MAT.stone` → tex `granite_pink` × tint `0x9c8278` (linear R/G 1.489):

```
1.489  ×  4.260  =  6.35 predicted        against  5.48 measured (§341)
```

Same order, 16 % high, consistent with the lit rect sampling one patch rather than the whole-texture
mean. Hero's lit face, for contrast, measures **1.47** — essentially its tint alone.

---

## 3. The attribution: which stage of the texture?

`hueGrade` ships with its own A/B lever (`abOff('huegrade')`, `Canvas2D.js:1035`) and `TEX_AB()` is
read **per call, never latched** (`Textures.js:106`) *specifically* so a lab can bake one recipe
twice in one process with the treatment on and off. That is a within-run control at matched
resolution — the thing the function's own docstring says is the only way to attribute a chroma
delta to it rather than to the resolution it was measured at.

```
CTL (shipped)    sRGB(184.5, 93.8, 87.5)  lin(0.4919,0.1155,0.0986)  linR/G  4.260
A1 no huegrade   sRGB(160.7,101.8, 78.2)  lin(0.3652,0.1357,0.0786)  linR/G  2.690
ATTRIBUTION      hueGrade contributes +1.570 of linear R/G (48.2% of the excess over neutral)
```

**It splits almost exactly in half.** Neither stage alone is "the" cause: the base mineral mix
already lands at 2.690, and the final grade adds another 58 % on top of that.

---

## 4. The finding that is not a magnitude — it is a sign flip

Running the same A/B across every recipe that bakes in Node (12 of 23):

| material | CTL R/G | A1 (no hueGrade) | delta |
|---|---|---|---|
| **granite_pink** | **4.260** | **2.690** | **+1.570** |
| torch_flame | 2.459 | 2.459 | 0.000 *(ungraded)* |
| wood_old | 1.977 | 1.987 | −0.010 |
| paving_courtyard | 1.910 | 2.086 | −0.176 |
| sandstone_block | 1.838 | 2.202 | −0.364 |
| sand_ripples | 1.813 | 2.104 | −0.291 |
| sand_fine | 1.807 | 2.091 | −0.284 |
| sandstone_worn | 1.727 | 2.068 | −0.341 |
| bronze_aged | 1.531 | 1.774 | −0.243 |
| gold_leaf | 1.367 | 1.763 | −0.396 |
| limestone_polished | 1.163 | 1.297 | −0.134 |
| palm_frond | 0.697 | 0.697 | 0.000 *(ungraded, by design)* |

**`granite_pink` is the only material in the catalogue that `hueGrade` pushes toward red.** Every
other graded recipe is moved the other way, by −0.010 to −0.396. Granite goes **+1.570** — four
times the largest move in the opposite direction, and the only one whose sign differs at all.

The table row behind it is an outlier on exactly the two axes that would do this, and is 1-of-11 on
both:

```
granite: { lo: -16, mid: -15, hi: -7, satLo: 1.35, satMid: 1.20, satHi: 1.02 }
```

- the **only** entry of eleven whose three hue rotations are all negative (mudbrick is nearest at
  `-13 / -8 / 0`, and its `hi` is zero rather than negative);
- the **only** entry whose highlight saturation is boosted rather than held or cut — `satHi` 1.02,
  where gold alone matches at exactly 1.0 and the other nine run **0.66–0.88**.

The second is the one that reaches the frame hardest here. Every other material in the level
**desaturates as it goes toward the light**, which is what strong sun does to stone and what the
`sandstone` row's own comment describes ("sun-struck crest pale yellow and desaturated"). Granite
alone keeps full chroma at a hue rotated toward red — so on a 13 m figure under a full-strength key,
the lit face is the one surface in the frame that does not bleach.

---

## 5. Verified / inferred / not claimed

**Verified.** The colossus's material path (19× `stone` → `granite_pink` × `0x9c8278`); the shipped
albedo's mean linear R/G 4.260, by two independent readers, against a double-digest-proven control;
its rank 1 of 23 and 2.06× `carnelian_inlay`; the 6.35-predicted / 5.48-measured agreement; the
+1.570 hueGrade attribution; the sign flip across all 12 Node-bakeable recipes; the 1-of-11 status
of `HUE.granite` on both axes, counted programmatically.

**Inferred.** That the sign flip is *why the critic saw a red colossus*. The chain — albedo → tint →
key → tonemap → frame — is arithmetically consistent at both ends, but I have not run a frame with
the row changed, and §333 is a standing reminder on this exact tree that a value's fate at the
display transform is not predictable from its linear value.

**Not claimed: that any of this is a bug.** The sign flip is *deliberate*, and the table says so in
its own words:

> `granite` — Aswan granite is **pink**. It measured at sandstone's hue, which is the single most
> obviously wrong number in the control table.

The whole point of that table was hue **separation**: 93 % of the level's chromatic texels sat in one
30° bucket, with eight of the ten largest surfaces reporting the identical median hue of 23°. Aswan
granite measured the same hue as mudbrick. Pushing granite one way while sandstone, paving, sand and
gold went the other is how that bucket got broken up, and it worked. So the sign is defensible and
should probably stay.

What is *not* argued anywhere in the file is `satHi: 1.02` — the highlight-chroma exemption. That
one is unremarked, unique, and lands on the largest lit stone surface in `courtyard`.

**Also not claimed:** that `mudbrick` would not outrank granite ungraded. It is not Node-bakeable, so
it is absent from §4's A/B; its *graded* 2.737 is already above granite's *ungraded* 2.690, and where
its ungraded value sits is unmeasured. 11 of 23 recipes are outside that table for the same reason.

---

## 6. What this hands the successor

The item re-routes from TEXTURES-at-large to **one field of one row**, with a lever that is already
built, already A/B-able offline, and does not touch `src/**` shading at all.

It does **not** license changing that field now. Two reasons, both standing rules:

1. §141.1 — I have measured the candidate's own axis. A bar drawn after that is not a bar. Any
   change to `satHi` needs a PREREG sealed *before* the arm is baked, with a falsifiable frame-side
   criterion, not a texture-side one.
2. The critic's actual complaint (§336, §341) was about the colossus's **shade** going mauve at 345°
   rather than the bible's violet-teal. This NOTE explains the *lit* face. A redder albedo is the
   input to a redder shade, but `shadowHold` (§269, verified **0.0 on all architecture**) is the term
   that decides a material's shade hue, and it is untouched and still unmeasured on this surface.
   Those are two candidate fixes at two different stages and the ADDENDUM's warning applies to both:

   > every time, the defect was attributed to the last stage that *touched* the pixel rather than
   > the stage that *originated* the value.

   `satHi` is not obviously the originating stage either. It is now merely the best-localised one.

---

# ADDENDUM — §336's sketched `R/G ≤ 0.90` bar is **out of reach of the texture lever**, and the bar imports another material's albedo

Written immediately after §4 above, from §336's already-sealed frame numbers and §342's
digest-proven albedo numbers. Pure arithmetic on committed values; no new capture.

## The two inputs

§342 gives the colossus's albedo side. §336 gives the frame side, and it gives a **within-frame
control** — courtyard's own ground, measured in the same capture under the same wash:

| surface | albedo lin R/G | × tint | = input | terminator (§336) | suppression |
|---|---|---|---|---|---|
| colossus | 4.260 | 1.489 `0x9c8278` | **6.344** | **3.74** | **0.589** |
| courtyard ground | 1.910 | 1.775 `0xcfa068` | **3.390** | **0.52** | **0.153** |

Ground assignment verified: `EgyptLevel.js:451` `A.mesh('paving_courtyard', K.pavingField(…))`,
tinted by `Architecture.js:57`.

**The wash suppresses the ground's R/G 3.84× harder than the colossus's, inside one frame.**

## Two explanations for that gap, both ruled out

1. **§336's own kill-gate — "the colossus rect is the *mid* band, not the shadow band."** Already
   answered: §341's bandgate2 put that rect at **96.4 % shadow band**. Both surfaces are in the
   same band.
2. **An additive wash, which moves a dimmer surface's ratio further.** Refuted by sign. In linear,
   the ground is brighter than the colossus in **both** channels (R 0.2653 vs 0.1635, G 0.0783 vs
   0.0258), so an additive wash predicts the *ground* is suppressed **less**. It is suppressed
   3.84× **more**. The mechanism is something else — sky/bounce occlusion, a `sh` difference, or
   the rect's albedo diverging from the whole-texture mean. **Not distinguishable offline, and not
   claimed.**

## The reachability result

Take the colossus's own observed suppression (0.589) as given and ask what input reaches the bar:

```
to land at R/G 0.90 at suppression 0.589, input must be   1.527
  albedo x tint must fall                                 4.16x
  albedo alone must fall to                               1.025   (from 4.260)
```

The **maximum** move available on the texture lever is deleting `hueGrade` from granite entirely —
the A1 arm, albedo 2.690:

```
input        6.344 -> 4.006
terminator   at suppression 0.589 -> 2.362
bar 0.90     OVER BY 2.62x        -> DOES NOT REACH
```

And from the other side, holding the albedo and asking the shadow path to carry it alone requires
suppression **0.142** — *harder than the ground actually achieves in the same frame* (0.153).

**Neither lever alone reaches the bar. This is §332's failure shape — a lever that engages
correctly and cannot reach its own bar — predicted before the seal rather than discovered by a
capture.**

## What is actually wrong with the bar

§341 already called `R/G ≤ 0.90` a cross-material comparison. This says how far:

The bar was read off **other shots' terminators** (hero 0.72, dunes 0.74, kaykit 0.78). Those
surfaces have inputs near 3.4–3.8. The colossus's input is **6.344**. Asking a 6.3-input surface to
land where a 3.4-input surface lands is not asking the shadow path to work correctly — it is asking
it for a *different transform than it applies to anything else in the level*.

**An absolute R/G bar silently imports the albedo of whatever material it was calibrated on.** The
successor's bar should be **relative** — a suppression factor, or a hue-angle target — because those
are properties of the shading path rather than of the material that happened to be under it. That is
what §341's ADDENDUM was reaching for with "a relative rather than absolute ratio bar", and this is
the number that forces it.

## Caveat, stated plainly

Every "input" above uses the **whole-texture mean** albedo as a proxy for the specific rect's
albedo. §342 showed that proxy runs ~16 % high on the colossus's lit face. A 16 % error does not
overturn a 3.84× or a 2.62×, but these are order-of-magnitude statements and must not be quoted as
precision ones. The one measurement that would replace the proxy with the real thing is a
**per-rect albedo readback** — the same shape as the `key` readback §336 asked for, and cheap on
the same capture.

---

# ADDENDUM 2 — **CORRECTION.** I used the wrong control, and the reachability verdict flips

Found ~20 minutes after ADDENDUM 1 was committed, by reading the shadowtint lane's own working
(`NOTE-shadowtint-space.md:236-262`) rather than only the §336 summary of it. Two errors, one
consequence.

## Error 1 — the courtyard ground is not a matched control for the colossus

ADDENDUM 1 called it a "within-frame control". Same frame is not the same thing as same state, and
the two surfaces differ in at least three ways that all bear on the statistic: **cast-shadow state**
(the ground has `sh = 0`; the colossus face does not), **orientation** (horizontal vs vertical), and
**bounce exposure** — `hemi = smoothstep(-0.72, 0.55, Nw.y)` (`toon.glsl.js:577`) hands a vertical
face ~40 % bounce and a ground plane 0 %, a difference the lane had already checked and written down.

**The matched control was already in the record and I walked past it.** The lane measured a
three-rung ladder inside one frame, one light rig, one transform:

```
courtyard ground,    cast-shadowed, horizontal          R/G 0.52        display 209   PASS
courtyard colossus-L, cast-shadowed TWIN, vertical      R/G 1.02-1.86   display 234..358
courtyard colossus-R, shade side of a SUNLIT statue     R/G 3.00-4.26   display 333..351   FAIL
```

`colossus-L` is the west/east twin: **same recipe, same material tokens, same tint, same frame**,
differing only in `worn` and collar parameters (`Props.js:_colossi`). It is the control ADDENDUM 1
should have used.

And with it the picture inverts:

| surface | input | measured R/G | suppression |
|---|---|---|---|
| ground (cast-shadowed) | 3.390 | 0.52 | **0.153** |
| colossus-L (cast-shadowed) | 6.344 | 1.02–1.86 | **0.161–0.293** |
| colossus-R (still key-lit) | 6.344 | 3.00–4.26 | 0.473–0.672 |

**The two cast-shadowed surfaces agree on suppression despite different materials and different
orientations.** The wash is *not* material-dependent. ADDENDUM 1's headline — "the wash suppresses
the ground's R/G 3.84× harder than the colossus's" — is arithmetically correct and causally
misread: it was measuring **`sh`**, not the material. The lane had already named this: *"The
colossus-R shade face is the only one of the three that is still receiving direct key."*

## Error 2 — §341's bandgate2 does not rule out what I said it ruled out

ADDENDUM 1 claimed bandgate2's **96.4 % shadow band** disposed of the mid-band explanation. It does
not. bandgate2 measured the **toon ramp's** band, which is an **N·L** quantity. The live hypothesis
is about **`sh`** — the shadow-map term — and they are different factors of the same product.
§336 §10 says so precisely, and I quoted it in this very file without applying it: the settling
measurement is a **`key` (= `ramp * sh`) readback**. Ramp-band membership establishes one factor and
says nothing about the other. Two terms, conflated because both are called "shadow".

## The consequence: ADDENDUM 1's reachability verdict is WRONG

It derived a suppression of **0.589** from `colossus-R` — a surface still receiving direct key — and
then used it as though it were the wash's full authority. Redone at full authority (`sh = 0`), from
the matched control:

```
shipped albedo (input 6.344), full authority  ->  1.02 - 1.86    bar 0.90: miss by 1.13-2.07x
hueGrade deleted (input 4.006), full authority ->  0.64 - 1.18    <- STRADDLES THE BAR
```

against ADDENDUM 1's "2.362, over by 2.62×". **So the texture lever combined with full shadow
authority is plausibly sufficient, and "neither lever alone reaches the bar" is withdrawn.** What
the numbers now say is narrower and more useful: the colossus's shade is red mostly because that
face is *still being keyed*, and the albedo decides whether closing that gets it under the bar.

## What survives, and what does not

**Survives — §342 in full.** The attribution is pure texture arithmetic against a double-digest-proven
control and never touched a frame: albedo 4.260, rank 1 of 23, the +1.570 hueGrade sign flip, the
1-of-11 status of `HUE.granite`. None of it depends on anything corrected here.

**Survives — "the bar must be relative."** For a different and better reason than ADDENDUM 1 gave:
`colossus-L` is *fully cast-shadowed*, gets the wash at full authority, and still reads **1.02–1.86**
where hero reads 0.72 from a much lower input. An absolute R/G bar still imports the albedo of
whatever material calibrated it.

**Withdrawn — "neither lever alone reaches the bar"** and the §332-failure-shape framing attached to
it. Also withdrawn: ADDENDUM 1's "not distinguishable offline" about the suppression gap. It was
distinguishable, from material already in the repo.

## The lesson, stated so it is not repeated

§340's rule is *prove the CONTROL is in the state you assert it is in*. I proved the ground was in
the courtyard — which was never in question — and never checked it was in the **lighting state** I
was comparing against. I reached for the control that was in the same *frame* instead of the one in
the same *state*, and the ledger's own note for this item warned about precisely this class of
mistake two entries earlier: *the defect attributed to the last stage that touched the pixel rather
than the stage that originated the value.* Here it was the nearest control rather than the matched one.

**The measurement that settles it remains the one §336 named and this file has now twice failed to
substitute for: a `key` (= `ramp * sh`) readback over the colossus rect.** Until that exists, every
suppression figure here is conditioned on an unmeasured `sh`.
