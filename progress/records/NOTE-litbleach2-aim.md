# NOTE — where litbleach2 should aim, and why my PostFX thesis is probably WRONG

Written before PREREG-litbleach2 exists, from code and from measurements already in the repo.
No capture involved. This exists so the successor seal aims at the right thing, after litbleach
spent a full chunked capture to reach a VOID.

## The thesis I proposed last turn

That the hold looks near-inert (traversal +0.010, combat +0.000 at dose 0.70) because it runs on
`outgoingLight` **inside** the toon shader while §312's additive legs include **PostFX screen-rim
and bloom**, which composite **downstream** — so chroma restored in the shader gets re-diluted
after it. `PostFX.js:16` does confirm the ordering (`scene → normals → AO → ink edges → bloom
pyramid → composite`).

## Why it is probably wrong

Two measurements already in the tree, neither of which I made, undercut it:

1. **`bloomSubjectCut` ships at 1.0** (`PostFX.js`, RESULT-critic10-postfx2, reseal 0027611):
   *"At 1.0 the character never feeds the pyramid."* The character contributes nothing to bloom.
   (Caveat, stated because it is a real gap: the cut removes Sly from the bloom **feed**, not from
   **receiving** bloom that other bright sources spill over him. So bloom is weakened as a
   suspect, not eliminated.)
2. **The PostFX screen rim was measured at 0.1 / 0.3 / 0.3 mean display units** in the plinth box,
   with zero artefact pixels (`PostFX.js` ~654, rim1 frames, task #8a). The same comment states
   outright that this chain *"is not why the character reads blue… That part is the light reaching
   him, not this chain."*

So of §312's four named additive legs, the two downstream ones are small or absent on the
character. **The remaining two — spec and the surface rim (`uRimColor` #7fd4ff at rim 0.62 ×
rimGain 2.05) — are IN `outgoingLight` when the hold runs**, per the toon.glsl.js comment itself.
The hold can see them. Downstream re-contamination is therefore the wrong first suspect.

## The better hypothesis: the hold's own GATE is declining to act

```glsl
slyLitH = clamp(uSubjLitHold,0,1) * vSlySkin
        * smoothstep(0.0, max(uShadowHoldKnee,1e-4), slyLitAlbChroma)
        * slyLitLoss;
```

`slyLitAlbChroma` is the **albedo's** chroma at that pixel. The knee exists precisely so
achromatic materials — *"the guards' identity-white mannequins (albedo chroma 0.03) and Sly's
white trim"* — do not move. If the registered rects sit on **white/grey trim, fur or skin rather
than on the blue costume**, then `albChroma` is low, `smoothstep(...)` ≈ 0, `slyLitH` ≈ 0, and the
hold correctly declines to do anything. The lever would be working exactly as specified while
measuring as inert.

**This single explanation also covers the other anomaly**: `E_H_combat` read **348.5°** — nowhere
near the costume's 213.5° — while `PF_MASK` read **99.6% subject**. 99.6% *subject* is not 99.6%
*costume*. A rect sitting on Sly's face, gloves or trim is simultaneously (a) 99.6% subject,
(b) hue ~348°, and (c) low albedo chroma, hence gated off. One cause, three symptoms.

## What litbleach2 should therefore do

1. **Diagnose the gate before touching the dose or PostFX.** Add a debug arm that renders
   `slyLitAlbChroma` (and ideally `slyLitH` itself) through the existing `debugTerm` channel, so
   the seal measures *why the lever declines* rather than only the composited result. If
   `albChroma` at the rects is below `uShadowHoldKnee` (0.25), the finding is that the rects are
   not on the costume and everything downstream of that was measuring the wrong pixels.
2. **Make the costume-hue pre-flight a hard gate**, not a nicety: off-arm hue within a sealed band
   of 213.5°, or VOID. That is the instrument that would have caught this at the start.
3. **Consider re-deriving the rects** against a costume-hue + albedo-chroma mask rather than
   inheriting lithold's screen boxes. They were validated only against *the statistic's* r12/r13
   values (0.205/0.080/0.516), which a non-costume rect can reproduce perfectly while measuring
   the wrong surface — the agreement proved the rects were **stable**, never that they were **on
   the costume**.
4. Keep PostFX on the list as a **secondary** arm, since the bloom caveat above is unresolved.

## The honest summary

litbleach's VOID was caused by its brackets. But even had the brackets held, the acceptance
numbers would likely have been measuring the wrong surface — and the seal would have produced a
confident DO-NOT-SHIP against a lever that was never engaged. §328 taught "prove the runner
reproduces the defect". The rule this adds: **prove the ROI is on the material whose property you
are measuring.** A stable number is not a correct one.

---

## ADDENDUM (measured after the above, before any litbleach2 capture): combat cannot be measured by this statistic at all

The `PF_COSTUME` gate I added to the scorer was run against litbleach1's spent frames and settles
the hypothesis above on real data:

```
PF_COSTUME traversal  off H 223.3  |dH|   9.8 <= 30   PASS
PF_COSTUME combat     off H 355.2  |dH| 141.7 <= 30   FAIL
PF_COSTUME sly-key    off H 205.4  |dH|   8.1 <= 30   PASS
```

**Combat's inherited rect is not on the blue costume.** So litbleach's headline combat result —
"the lever moves it by +0.000" — was the hold *correctly declining* to act on a low-chroma,
off-hue, non-costume surface. Not a refutation of the lever. Exactly what the NOTE predicted.

Then I tried to re-derive the rect, and hit something worse. Searching combat.off for
subject-masked pixels within 30° of 213.5° at chroma ≥ 0.25 finds the costume **is** in frame —
1812 px, bbox x452–676 y411–676, centroid (582,608) — and the densest 40×40 window is
`[516, 635, 556, 675]`, well below the inherited rect's y468–522. But scoring that window with
the seal's own statistic gives:

```
combat.off  NEW rect  S 0.579  H 11.8    subject fraction 37.8%
```

Still orange. **The rect was never the whole problem: the STATISTIC is wrong for this shot.**
`S` is defined over the *brightest half* of the rect (§3). In traversal and sly-key the costume
is among the brightest things present, so the brightest half is costume. In combat the costume is
**in shadow** and the bright pixels are warm ground, fur and impact FX — so brightest-half
selects the environment wherever the rect is placed.

### Consequences for litbleach2

1. **Scope it to `traversal` + `sly-key`.** Both pass `PF_COSTUME`, both are calibrated
   (0.205 / 0.516, reproduced across r12/r13/litbleach), and the statistic genuinely measures
   costume there. A two-shot seal that measures the right pixels beats a three-shot seal that
   does not.
2. **Route combat out, do not bodge it in.** It needs a *costume-masked* statistic — mean S over
   pixels selected by subject ∧ hue ∧ chroma, not by luminance — and that is a different
   instrument whose bands must be derived and sealed separately. Inventing it under time
   pressure, uncalibrated, is how a seal produces a confident wrong answer.
3. **Keep `PF_COSTUME` as a hard gate anyway.** It is what caught this, and on a two-shot seal it
   costs nothing.

### The rule

§328 gave "prove the runner reproduces the defect". The addendum to it is now two-part:
**prove the ROI is on the material you are measuring, and prove the STATISTIC can see it there.**
Combat satisfied neither, and litbleach spent a full chunked capture — and would have spent a
confident DO-NOT-SHIP — on a number that was reading warm ground.
