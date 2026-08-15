# NOTE — before the shadow-tint successor is sealed: the colossus's ALBEDO is the outlier, not its shadow

Offline, from `shots/r12`. Written because §341 unblocked the shadow-tint item with a target of
**linear R/G 3.74 → ≤ 0.90**, and that target compares the colossus against materials it is not.

## The measurement

Linear (sRGB-decoded) means over the §341 rects, and over bright/dark populations in the shots
§336 lists as **passing**:

```
                       linear (R, G, B)              R/G     B/G
colossus LIT           0.5028, 0.0918, 0.0649        5.48    0.71
colossus TERMINATOR    0.1714, 0.0451, 0.0615        3.80    1.36
hero  LIT              0.4886, 0.3319, 0.2263        1.47    0.68
hero  SHADE            0.0039, 0.0045, 0.0106        0.88    2.37
kaykit LIT             0.7947, 0.3592, 0.1691        2.21    0.47
kaykit SHADE           0.0048, 0.0059, 0.0119        0.81    2.01
```

## What it says

**The colossus is lit at R/G 5.48.** hero's lit surfaces sit at 1.47 and kaykit's at 2.21. Its
material is **2.5–3.7× redder than the surfaces whose shadows pass**, before any shadow term is
applied at all.

**And the shadow light is working on it.** Lit → terminator takes R/G from 5.48 to 3.80, a **31%
reduction**, against hero's 40% and kaykit's 63%. The cooling is present and of the same order;
it is starting from somewhere else.

## Why this matters before a seal exists

§341's proposed target — *terminator R/G 3.74 → ≤ 0.90* — asks the colossus's shade to land where
**sandstone's** shade lands. That is not a shadow-tint requirement, it is a demand that two
different materials produce the same shade ratio. To reach 0.90 from a 5.48 albedo the shadow
light would have to do roughly **6× the work** it does on hero, and `ToonMaterial.js` already
documents exactly what happens when this lever is pushed to hit a number:

> *wash 0.34 — correct hue, wrong material… Measured shadow R/G 1.09 and B/max 1.19, i.e.
> numerically on target, while `hero` went visibly lavender. This is the same trap the previous
> attempt fell into; **the number was right and the frame was wrong.***

A seal aimed at R/G ≤ 0.90 on this surface is aimed straight back into that trap, with the
additional cost that the lever is global and would drag every passing shot with it.

## What I am NOT claiming

- **Not** that the critic is wrong. Courtyard's terminator does read h 345° and it does look wrong
  next to the rest of the set. The observation stands; its **cause** is what moves.
- **Not** that B/G is settled. §336 reports the passing shots' shade at B/G ≈ 1.02–1.07 and I get
  2.01–2.37, because my dark population is the darkest 2000 px of a row band — near-ink pixels
  where channel ratios are unstable — while §336 used clean flat patches. **§336's B/G numbers are
  the better ones**; mine are included only to show the direction. The **lit** comparison is the
  robust half: those are bright, well-exposed pixels where the ratio is reliable, and it is the
  lit comparison the conclusion rests on.

## Where this leaves the item

Three candidate routes, and the seal should not be written until one is chosen on evidence:

1. **The colossus's albedo is too red** — a TEXTURES/PROPS item, not a shadow-tint one. Testable
   offline: read the material's authored colour rather than inferring it from a lit frame.
2. **`shadowHold` (§269) is the right lever after all** — it is the term that lets *the material*
   decide its own shade hue, and §336 verified it is **0.0 on all architecture**
   (`subjShadowHold` is `vSlySkin`-scoped). A material-scoped hold would address a
   material-specific problem without dragging the global shadow light.
3. **The target ratio is wrong** — R/G ≤ 0.90 may be the wrong bar for a red material, and the
   right bar might be a *relative* one (e.g. the lit→shade R/G reduction, where the colossus's 31%
   already sits within sight of hero's 40%).

Route 2 is the one that matches the shape of the evidence: a material-specific defect wants a
material-scoped lever. Route 3 deserves a paragraph in whatever seal follows, because §341's
absolute target was inherited from a cross-material comparison that this note shows is unsound.

---

## ADDENDUM — route A.1 answered: it is the TEXTURE, and the item re-routes to TEXTURES

Pure code reading, no boot.

**`seatedColossus` (`src/world/Statues.js:289`) uses five materials and carnelian is not one of
them.** Counting material tokens across its body: **19× `stone`, 6× `gold`, 2× `lapis`,
1× `lime`, 1× `dark`.** The body is `stone`.

```
stone:  { tex: 'granite_pink', color: 0x9c8278, rough: 0.88, outline: 1.0 }
```

`0x9c8278` is **linear R/G ≈ 1.48** — barely warm, and in the same neighbourhood as hero's lit
1.47. **The measured colossus lit is 5.48.** The base tint cannot produce that, and neither can
the other materials present: `gold` `0xe8b942` is linear R/G ≈ 1.63, `lime` `0xd4c19a` is cooler
still, and my lit rect measured `rgb(182,81,70)` — red, not the yellow gold would give.

**So the red is coming from the `granite_pink` TEXTURE modulating that base**, and the item is a
**TEXTURES** question, not a shading one.

### Why this matters more than it looks

Three routings have now been proposed for this defect and each was displaced by a measurement:
1. **POSTFX / display transform** — refuted by §336's within-frame matched-luminance control.
2. **SHADING / shadow-tint** — §341 unblocked it, and the top of this note showed its target was a
   cross-material comparison.
3. **TEXTURES / `granite_pink`** — where the evidence now points.

The pattern is worth naming: every time, the defect was attributed to the last stage that *touched*
the pixel rather than the stage that *originated* the value. §333 caught it once (shader vs
transform) and this is the same error one stage further upstream — light vs material.

### What is verified and what is inferred

- **Verified:** the material list, the base hex values, and that base `stone` is linear R/G 1.48
  against a measured lit 5.48. The arithmetic gap is real and large.
- **Inferred:** that `granite_pink` supplies the difference. It is the only remaining multiplier on
  that surface, but I have **not** read the texture generator. **The next step is to read
  `src/textures/` for `granite_pink` and measure its mean texel R/G directly** — a pure offline
  check that either confirms this or sends it somewhere else again.
- **Not claimed:** that `granite_pink` is *wrong*. A pink granite that reads red in sun may be
  exactly what was intended; the defect the critic saw is that its **shade** goes mauve at 345°
  rather than to the bible's violet-teal. If the texture is deliberate, the fix is `shadowHold`
  (§269) — the term that lets a material carry its own shade hue, verified at **0.0 on all
  architecture** — and not a change to the texture at all.

**Route 2 from the top of this note therefore survives, and gets sharper:** a red material whose
shade should still read cool is precisely what a material-scoped hold exists for. But read the
texture first — that check costs minutes and has now twice been the thing that stopped a seal
aimed at the wrong stage.
