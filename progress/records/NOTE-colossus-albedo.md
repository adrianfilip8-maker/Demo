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
