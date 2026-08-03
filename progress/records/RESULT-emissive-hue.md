# Finding #10, SHADING's half — the flame loses its hue inside the shipped configuration, and turning it up makes it worse

Owner: SHADING/POSTFX. **No capture was needed for this**, and none was spent on it.
Instrument: `progress/records/emissivehue.mjs`, on the chain model validated in `RESULT-tone1`
§1 and §4 (0.35 L against the row at `PostFX.js:524`; **0 of 255** against the real driver).

Routed as: *"a sconce falls below ambient 50 px out and its emissive clips to neutral white,
losing the flame hue"*, with GEOMETRY reporting that after its brazier-occlusion fix the coals
**"render pale grey-cream rather than fire"**.

## The observation is right; the mechanism is not a clip

`Props.js` authors `ember #ff6a20 @ 2.4` and `flame #ffa040 @ 3.0`. Pushed through the shipped
grade + AgX:

| material | authored sat | **at its shipped intensity** | hue drift |
|---|---|---|---|
| `ember` (×2.4) | 0.986 @ 7.9° | **0.439 — 45% kept** | 7.9° → 17.7° |
| `flame` (×3.0) | 0.949 @ 19.0° | **0.349 — 37% kept** | 19.0° → 30.0° |

**It is not clipping.** At ×1.0 — *below* the shipped intensity, with no channel pinned
(224,159,104) — `flame` is already down to 56% of its authored saturation. The desaturation is
progressive through AgX's per-channel log compression, present at every intensity, and merely
*more advanced* at the shipped one. This is §78's shape again: **the critic's observation is
correct and its mechanism is wrong**, and the distinction matters because it changes the fix.

## The trap: the obvious response makes it worse

The natural reading of "the coals don't read as fire" is that they are not bright enough. They are
already too bright for their own hue to survive:

```
flame   x3.0 (shipped)  sat 0.349  (37%)      <- reads as fire, weakly
        x6.0            sat 0.224  (24%)
        x12.0           sat 0.125  (13%)      <- "pale grey-cream"
```

**Raising `emissiveIntensity` moves it monotonically toward white.** Anyone chasing this symptom
by turning the emissive up will make it worse while the numbers say the surface got brighter —
which is precisely the "pale grey-cream" GEOMETRY is looking at. Recorded here so that lever is
not spent.

Bloom is not modelled and **adds** energy along this same axis, so every figure above is a *lower
bound* on the frame's desaturation.

## Two levers, and one of them is already implemented

1. **Lower `emissiveIntensity` and let bloom carry the brightness.** Halving it takes `flame`
   from 37% to ~56% saturation retained. `emissiveIntensity` is `src/world/Props.js` — **PROPS'
   file, not mine** — so this is routed, not taken.
2. **The task-#32 tone shoulder helps this for free**, because it lowers the curve exactly where
   the flame is being crushed:

   | b | `flame` sat kept @ ×3.0 | `ember` sat kept @ ×2.4 |
   |---|---|---|
   | 1.00 (shipped) | 37% | 45% |
   | 1.20 | 47% | 54% |
   | 1.50 | **61%** | **66%** |

   So finding #10 and task #32 are **the same defect measured on two different populations** —
   saturated highlights losing chroma, and bright textures losing detail, are both the AgX
   shoulder. That is an argument for the shoulder change carrying two conditions at once, and it
   should be scored on the `interior` and `night` frames of `tone1`, where the torches live.

## Caveat carried, not buried (§11)

The emissive is modelled as scene radiance = `linear(hex) × emissiveIntensity`. The shader may
scale emissive differently before the composite; if it does, the *absolute* multipliers move but
the shape does not — the finding is that saturation falls monotonically with radiance through
this tonemap, which is a property of the curve and not of the scale factor. Worth one readback of
the actual emissive radiance reaching the composite before the PROPS lever is tuned on it.
