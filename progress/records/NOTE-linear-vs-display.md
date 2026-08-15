# NOTE — the model/capture divergence, and why it re-routes §277/§312 to POSTFX

Offline, no capture. Written after RESULT-litbleach2 and pushed before any successor seal.

## The divergence

`progress/records/lithold-model.mjs` drives the real `Atmosphere` + `Shading`, transcribes
`TOON_SHADE`'s diff assembly, and displays through `tonecurve.mjs` (validated against PostFX's own
grey row, 0.35 L worst). Run today, for traversal at the sealed dose:

```
model    traversal   off S 0.192  ->  hold 0.70: S 0.438   (h 0.35)
capture  traversal   off S 0.205  ->  hold 0.70: S 0.215
```

**The baselines agree** (0.192 vs 0.205) — so the model's lighting, albedo and display chain are
sound. **The candidate responses differ by ~25×.**

## What it is not

- **Not scope dilution.** The statistic uses the *brightest half* of the rect, and `PF_MASK`'s
  81.2% describes the *whole* rect — a real gap worth checking. Measured: the bright half is
  **95.2% subject**, and **95.2% of it moved** between `off` and `on`. The hold is reaching
  essentially every pixel the statistic reads.
- **Not the branch failing to run.** `KO` passed strictly (0.205 < 0.211 < 0.215), so the uniform
  reaches the draw and the lever is a live monotonic dial.
- **Not the knee.** Traversal passes `PF_COSTUME` at 223.3°, and the model puts the costume's
  albedo chroma well above `uShadowHoldKnee` (0.25) — the knee terms it prints for other materials
  at the traversal state are 1.000 wherever chroma is high.

## What it must be

`slyLitH = hold · vSlySkin · smoothstep(0, knee, albChroma) · loss`. With hold 0.70, vSlySkin 1
and knee 1, the model's h 0.35 implies **loss ≈ 0.5**. The captured effect is ~25× smaller, which
implies an effective **loss ≈ 0.02**.

`loss = 1 − outChroma/albChroma`, computed in **scene-linear**. An effective loss of 0.02 means
**the outgoing light in linear space still carries ~98% of the albedo's chroma** — the costume
pixel is still essentially blue when the shader hands it off.

## The conclusion, and its status

**The bleach is produced by the display transform, not inside the shader.** The pixel leaves the
shader chromatic; AgX plus a grade carrying `saturation: 1.30` is what lands it at display S
0.205. The hold declines because, in the space it measures, almost nothing has been lost — it is
behaving *correctly*, and it was pointed at the wrong stage of the pipeline.

That is the §4 hypothesis of RESULT-litbleach2, now supported by an independent line of evidence:
the model overstates the linear loss because it was **fitted** to an achromatic additive derived
from r12 display-space frames, and the real shader's linear state does not carry that loss.

**Status: strongly supported inference, NOT a direct measurement.** It rests on inverting the
capture's effect through the shader's own arithmetic, plus a model disagreement. The direct test
is one `debugTerm` arm reading pre-tonemap `outgoingLight` chroma at the traversal rect: if linear
chroma is ~0.98 of albedo chroma, this is settled. That is a 5-frame, one-chunk capture.

## Consequences if it holds

1. **§277/§312 re-routes from SHADING to POSTFX** — three seals (lithold, litbleach, litbleach2)
   have now aimed shader levers at a display-transform defect. `subjLitHold` should be abandoned,
   not tuned; RESULT-litbleach2 already showed no legal dose reaches its bar.
2. **The grade's `saturation: 1.30` becomes a suspect worth measuring**, not assuming: a global
   saturation boost interacts with AgX's highlight desaturation differently per luminance, which
   is exactly the shape of the defect (close-ups keep the blue, bright action framings do not).
3. **§312's own routing needs revisiting.** It concluded "the driver is ADDITIVE" from a
   display-space fit. That conclusion may be an artefact of fitting in the wrong space — the adds
   are real, but they may matter only because they push the pixel up AgX's desaturating shoulder,
   which is a tonemap story, not an additive-leg story.

## The rule this adds

`lithold-model.mjs` was treated as authoritative for three seals because its display chain is
validated. **A model validated on one axis is not validated on all of them**: its grey-row
calibration proves the *transform*, and proves nothing about a *fitted* linear state. When a model
and a capture disagree by 25×, the model is evidence about the model until shown otherwise —
and here the disagreement was itself the most informative measurement of the round.
