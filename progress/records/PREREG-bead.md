# Pre-registration — geo-bead capture (hero, courtyard, temple)
Sealed before any PNG of this run was opened.

Tree: Kit.js + EgyptLevel.js dirty (beads on 7 gilded beams). NOTE: I edited Kit.js at ~15:33
(UV-only, geometry bit-identical, verified: hero area-in-lobe 0.87% before and after) while this
capture was already booted at 15:15. With SANDS_NO_HMR the page cannot reload, so these frames
render the PRE-UV-fix Kit.js. That is §121.4's hazard and I am recording it rather than hoping
it does not matter: it is immaterial for the lit/lobe questions (identical geometry + normals)
and material only for bead texture seams.

## Predictions

P1. Draw calls and triangles essentially unchanged vs the offline count: ~86 draws / 0.73M tris
    for world modules; report.json totals will be higher because they include character+guards.

P2. The kiosk lintel ring reads as having a ROUNDED lower arris at 7-14 m in `hero` — a soft
    gradient band along the underside edge instead of a hard 90° corner.

P3. NO black bands, no z-fighting, no floating beads, no inverted-normal artifacts anywhere.

P4. THE ONE THAT MATTERS. Offline I measure, camera-visibility culled, at the shipped gloss 64:
    `hero` visible gilded 231.9 m2, of which 9.9% lit and 1.6% lit-and-inside-the-specular-lobe;
    and essentially all of that in-lobe area is the kiosk ring (kiosk alone: 48.3 m2 visible,
    45.4% lit, 7.0% lit&lobe = 3.4 m2, against 3.7 m2 for the whole frame).
    So IF the shader delivers what the geometry makes available, `hero` should show a visible
    warm specular on the kiosk lintel ring, order 1-3% of frame area.
      - If it DOES: geometry is not the blocker, gloss 64 is defensible, and the remaining gap
        is amplitude/grade.
      - If it does NOT: the loss is downstream of geometry (grade/tonemap/bloom eating it), the
        lever is SHADING/POSTFX, and no amount of arris rounding or `gloss` widening in my files
        can close §7.3's gold line. This is the falsifiable split and it decides my recommendation.

P5. `temple` shows no gold specular at all (measured 0.0% lit — the gild there is genuinely
    shadowed). If `temple` DOES show gold, my shadow model is wrong and P4's reading is void.
    This is the control that catches a broken instrument.
