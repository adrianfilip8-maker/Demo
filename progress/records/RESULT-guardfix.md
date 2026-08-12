# RESULT-guardfix — FIXED: four lines at the merge seam, and the garrison renders

Sealed `PREREG-guardfix.md` (83011fd), candidate 964ded9, probe + fresh frame under
`shots/guardfix/`.

## Bars

```
B1  probe: 11/11 meshes hasColorAttr — nine import bodies at identity [1.00,1.00,1.00],
    both scarabs byte-unchanged ([0.20,0.25,0.18] / [0.15,0.07,0.02])          PASS
B2  frame (prose, binding): two patrol guards render as lit, clothed figures — pale linen
    with cel banding, dark wraps, readable limbs. Decisively not the black-gloss mannequin.
    Honest caveats, out of this seal's scope: the heads stay small and ink-dense (the
    critic's cross-character sculpt complaint), and the D12-family floaters persist.  PASS
B3  suite 466/466 green, source pin in place                                     PASS
OUTCOME: FIXED
```

## The defect, for the record

The garrison wears the Carmelita import's geometry (deliberate, IMPORT-slyrepos-movement),
whose sanitizer strips `color` — correct for a textured body — while the garrison materials
are `vertexColors: true`. An unbound colour attribute reads (0,0,0) in WebGL, so every roster
guard multiplied its linen and bronze to black; only spec and the #7fd4ff rim survived, which
is precisely critic 10's "glossy black body, forearms glowing blue-white". The procedural
scarabs, whose builder writes real colours, were the two healthy meshes that gave the split
away. Fix: the merge synthesizes the identity attribute for geometry that lacks it — the
multiply becomes a no-op, procedural colours untouched.

The forecast (FIXED) was right: ledger **4/14**. What this does NOT claim: the guard shot's
score. The white cone, the head, the pose, and the missing flashlight are round-11 material;
this seal only put cloth back on the antagonist.
