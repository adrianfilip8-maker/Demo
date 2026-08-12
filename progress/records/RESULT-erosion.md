# RESULT-erosion — BULK-MIX: the interior compresses exactly like the boundary, and "distance" stops being the axis

Sealed `PREREG-erosion.md` (d1c952f); statistic `progress/records/erosion.mjs`, run on the four
gate-clean base pairs (two shots × two boots, tree `61de3de51735d6dc`).

## Outcome

```
                 R_base   R_INT(k=1)  R_INT(k=2)  R_INT(k=4)  R_BND(k=2)
hero    boot1/2   0.33      0.33        0.33        0.34        0.32
interior boot1/2  0.37      0.37        0.38        0.36        0.34
```

**BULK-MIX** on every scoreable pair (INT(2) = 1935 / 1024 px, INT(4) = 931 / 464 px — all far
above the 200 px floor; cross-boot agreement exact — the two boots produced byte-equivalent
populations, identical counts and medians, so the 0.10 agreement check passes trivially).

EDGE-MIX is refuted: pixels four deep inside the costume, untouched by any partial-coverage
blend, carry the same compressed swing as the fringe. My registered forecast was wrong again —
**2/8** — and the erosion split has now exonerated the fourth candidate family: rims (§284),
mips (miphue.mjs), ink (§285), and edges (here).

## What survives every exoneration

The mixer is: homogeneous across the costume surface (this run), asymmetric by texture content
— arm A stationary at ~228°, arm B dragged from 218° toward it (RESULT-attractor) — present
indoors, absent at the close-ups, and **non-proportional** (the −21.1° pair lost ~10.8° on
`hero`; the −11.3° pair loses ~7.6°: neither constant ratio nor constant offset).

That profile does not belong to a screen-space band, a filter chain, or a blend against
backdrop. It belongs to a **colour transform with a fixed point near the raw costume hue** —
and the render has exactly one of those: the shade/fill tint of the cel shader (the §4
lavender-grey saga's machinery). If the shade band tints toward ~228–235°, then: shaded raw
pixels (229°) barely move; shaded fix pixels (218°) get pulled up; lit pixels pass through —
and the close-ups read full swing not because they are CLOSE but because their staging is
key-lit (`sly-closeup` was staged at the lit corridor's lip, Shots.js §24.5), while `hero` and
`interior` frame the costume mostly in shade/fill. Distance was a confound.

## Next, sealed before it is looked at

`PREREG-litshade.md`: split the same masks by arm-A luma (lit vs shade populations) and score
each population's swing. SHADE-MIX (lit ≈ full swing, shade compressed) confirms the tint
account and names the constant to investigate; both-compressed sends the hunt to the
tonemap/grade. Same frames, new statistic, bars first — same footing as PREREG-erosion.
