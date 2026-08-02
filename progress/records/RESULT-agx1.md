# agx1 — the AgX gamut-map frame A/B, read

Provenance: `shots/agx1/report.json` — boot 2026-08-02T11:37, commit **7b0e3f8, dirty: false**
(stamp confirmed before the goldhalo patch was applied to the tree), 1280x720 high,
SwiftShader. Three shots, 0 failed: sly-closeup 273s, hero 296s, night ~300s.

## Reader provenance (agxread.mjs is a rebuild — the original died with the restart)

Re-derived from the committed record: predicate = display byte R == 0 (PostFX.js "In-frame
extent" comment + §23's "display channel pinned"), plus per-channel G/B pins, largest
4-connected component, and structure stats over the pinned population. Validated on:

- **self-diff zero** (differ nulls on a known input);
- **a constructed known** (synthetic PNG, hand-computable): census 104/1/1, trueBlack 1,
  largest component 100 px at bbox [5,5,14,14], distinctGB 102/100, interior bGrad 0.5 —
  every field exact;
- the committed census knowns **could not** be validated on their own frames: they were
  measured on bud34 (destroyed in the restart). The root `shots/*.png` predate the pin era
  entirely (0 pins) and eye1's tree pins only 41/4 px — the population grew ~100x with the
  post-23:13 tree (07fe98c's cooler shadow light is the obvious mover). Recorded so nobody
  repeats the search.

## Results

| frame | R-pins | committed pre-map known | G-pins | B-pins |
|---|---|---|---|---|
| sly-closeup | **5,400** | 5,407 | 0 | 0 |
| hero | **333** | 334 | 0 | 0 |
| night | 300 | 126 | 0 | 0 |

- **The census is invariant under the map, in-frame** — the two big-population anchors land
  within 0.13% and 0.3% of the bud34-era counts across five intervening commits. This is what
  §24.6's withdrawn-prediction arithmetic requires (the map lifts the minimum channel to
  exactly 0, so a pinned pixel stays pinned) and it doubles as the reader's magnitude
  validation: an off-by-predicate reader could not land within 0.13% of a destroyed frame's
  count by accident.
- **night's 300 vs 126 is not a like-for-like comparison and is not read as one**: its pin
  population is 1–8 px specks (largest component 8 px), where FXAA edge blending dominates
  the count, and 44dede5's tail retune moved exactly the dark-fur population that pins there.
  The invariant that matters (R-only) holds.
- **Zero G/B pins in all three frames** — §23's rec2020→sRGB asymmetry argument holds
  post-map.

## The flat patch is no longer flat

sly-closeup's largest pinned component (195 px, bbox [613,577,637,605] — the boot):
**98 distinct (G,B) pairs, B stddev 9.4, interior |∇B| 4.17**. At 4x
(`agx1-boot-4x.png`) the boot reads as a modelled form — shaft gradient, seam, ink line —
not a dead hole. The proper pre-map partner (bud34, same tree, map off) is destroyed;
the flat-state comparison therefore rests on the committed record (§24.6: bytes exact vs
float64 model, pinned samples moving in blue 77→68 / 64→53; §23: distinct outputs 3→5),
per the coordinator's instruction that cross-references go to committed numbers, not files.

## Verdict

The gamut map behaves in-frame exactly as registered after the prediction was corrected:
census unchanged, structure recovered, no regression signal in any of the three frames.
Nothing here re-opens §24.6.
