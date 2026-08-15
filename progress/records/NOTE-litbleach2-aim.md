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
