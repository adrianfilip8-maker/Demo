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
