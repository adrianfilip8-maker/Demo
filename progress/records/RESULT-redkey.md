# RESULT-redkey — DO NOT SHIP: the key-saturation clamp cannot restore albedo legibility, and its failure completes the proof that started with redflood

Scored against `PREREG-redkey.md` (34d0d3e). One boot, 49 poke frames, instrument fully
valid: off-vs-back 0 px ×16, off-vs-on 0 px on the three protected non-warm shots, five
FULL-frame protections inside caps, trees exact, dose arm live. Scorer log
`redkey-score-run2.log`; frames were in `progress/records/redkey/` (pipeline dir).

## Effect numbers (the kill, verbatim rows)

```
SHIRT  off L 135.3  R-B −75.0  S .519  hue 208.0  disp 44.0
       on  L 139.8  R-B −77.4  S .502  hue 211.0  disp 42.5      (clamp 0.45, strongest arm)
WALL   off/on: L 82.4/82.4  S .228/.228  disp 59.4/58.6           (unmoved)
COIL   off/on: L 69.9/69.7  S .508/.508  disp 60.3/59.2           (unmoved; ko 58.6 @0.35)
GROUND off/on: L 99.9/99.3  S .286/.286                            (unmoved)
E3 circDist(hue,220) 12.0 → 9.0, dS −0.016 — directionally right, an order short
==> BG1/E2/E3/PW FAIL, E1/KO1 VOID (population guards) — DO NOT SHIP
```

## The mechanism, now closed from both ends

RESULT-redflood measured the grade side: all grade knobs together recover ≲⅓ of the flood,
the key-sat knob alone ~⅕. This run tested the strongest defensible key-side clamp on
pixels and it moved the shirt 3° of hue and nothing else. Together they close the question:
**at tod 0.80 the albedo illegibility on sly-perch/sly-arm/combat is not recoverable by any
lighting/grade lever — every light in the anchor set is warm by authored design, and the
surfaces converge on the light's hue no matter which single source is tamed.** The
mechanism knob (`keySatMax`, inert at 1.0) stays in HEAD branch-untaken with its pin test;
nothing ships.

## Routing (decision-grade, for the owner)

The ONLY remaining fix for those framings is **Option A — re-stage sly-perch/sly-arm (and
combat's tod) from 0.80 to ≈ 0.74–0.76**, the deferred staging decision flagged in
DESIGN-twilight and §300. Evidence now: §293 (environment, not grade), §300 (no twilight
device reaches el 21), §305 (key clamp falsified on pixels). The alternative is accepting
the hot-monochrome dusk as the shots' look (the owner-taste flag, still standing). Queue
item for the next owner interaction; no further seals on this question are warranted.
