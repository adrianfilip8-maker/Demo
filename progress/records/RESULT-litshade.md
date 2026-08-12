# RESULT-litshade — UNIFORM: the compression is not a function of shading, and the fifth family is exonerated

Sealed `PREREG-litshade.md` (945a833); statistic `progress/records/litshade.mjs`, same four
gate-clean base pairs as RESULT-erosion.

## Outcome

```
             R_LIT   R_SHADE   |diff|   top-25%   bottom-25%
hero          0.36    0.30      0.06     0.47       0.31
interior      0.40    0.30      0.10     0.44       0.30
(both boots byte-equivalent, agreement check trivially met)
```

**UNIFORM** by the sealed bars on both shots: |R_LIT − R_SHADE| ≤ 0.10 < 0.15, and R_LIT
(0.36/0.40) never approaches SHADE-MIX's 0.60 floor. The shade/fill tint family
(`shadowHue`/`shadowTintPeak`/`shadowTeal`/`shadowBounceMix`) is exonerated as *the* mixer.
Forecast record: **2/9** — five candidate families sealed, predicted, and refuted in a row.

Reported, not deciding: a mild monotone luma trend exists (brightest quartile R 0.44–0.47
against dimmest 0.30–0.31). It is far too shallow to explain the close-ups' R ≈ 1.0 by
brightness alone WITHIN a mid-range frame — but across frames, brightness remains the one
axis that separates full-swing shots from compressed ones.

## Where this leaves the hunt

Exonerated under seal: rims, mips, ink, edges, shade concentration. Every named scene-side
cosmetic term is out. What remains is the pipeline itself, and it has exactly one seam:
the scene buffer that toon shading writes, versus the display transform (AgX + grade) that
presents it. `PREREG-attractor3.md` (dffabc1) bisects at that seam with
`postfx.debugRaw('scene')`, calibrated for the linear channel by the close-up's own rawscene
pair. Expected outcome, registered there: POSTFX-SIDE, named suspect AgX toe/purity
compression — with the luma trend above and the bright-close-up pattern as the two hints.
