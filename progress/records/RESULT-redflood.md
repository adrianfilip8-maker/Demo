# RESULT-redflood — NONE-OF-THESE: the grade explains a third of the flood, the haze poke never took, and the monochrome is the twilight light environment itself

Sealed `PREREG-redflood.md` (dadf9ef), two boots, C-DRIFT clean on both, tree
`8701fef02d82aa83`.

## Scoreboard

```
                     wall S          E(c) = ΔS + ΔT/64
sly-perch  base      0.227  T 31.2
           haze0     0.227  T 31.2   VOID — readback h=0.0122 in every condition (SKY
                                     republishes hazeDensity per frame; the seal's named risk)
           split0    0.202           E 0.028
           sat1      0.179           E 0.050
           alloff    0.158  T 31.5   E 0.074  < FLOOR 0.08
sly-arm    base      0.251  T 29.7
           split0    0.213           E 0.038
           sat1      0.189           E 0.065
           alloff    0.160  T 29.9   E 0.094  ≥ FLOOR

Weaker-shot rule → OUTCOME: NONE-OF-THESE (registered branch).
```

Forecast (split+sat owner-adjacent): wrong — **4/15**. sat1 is the largest single knob and
still explains barely a fifth of even the saturation excess.

## What the numbers actually say

1. **The wall is not saturation-blown.** Mean S 0.227 on the "blown monochrome plane" — the
   registered statistic was the wrong lens, and the FLOOR caught it doing what floors are
   for. The critic's "blown" is hue UNIFORMITY at high brightness: at tod 0.80 every light
   source in the anchor set is warm by authored design (sun #ffb072→#d08050, hemiGround
   #d08a48, fog #db9a68, horizon #ffb268), so every surface they light converges on one hue.
   The flood is the ENVIRONMENT, upstream of grade, haze, and saturation alike.
2. **No condition recovers texture** (T ±0.3 L across the lattice) — the wall genuinely has
   no legible detail at this sun angle; nothing the post chain does is hiding it.
3. **The real haze surface**: `shading.tune.hazeDensity` is overwritten per frame by SKY's
   atmosphere push; the poke surface for haze experiments is SKY-side (or the atmowire seam,
   PREREG-atmowire C1) — recorded for whoever next needs a haze arm.

## Fix directions (design decision, not this seal's license)

- **Staging**: the two worst shots sit at tod 0.80, past the sunset knee where the palette
  necessarily collapses; tod ≈ 0.74–0.76 keeps golden-hour separation (§2.2's triplet lives
  at the 22° anchor). Cheap, per-shot, but those stagings were themselves sealed choices.
- **Anchor separation**: give the ≤2° anchors a cooler fill/hemiSky leg so shadowed and lit
  surfaces diverge even at twilight (BotW's Gerudo dusk does exactly this — violet shadow
  against warm light; the critic's dunes note asks for the same physics).
- Either way the fix seal must protect the ten daylight shots (bit-identical above the knee)
  and re-run the two twilight framings with a hue-DISPERSION statistic, not mean saturation.

Owner: LIGHTING (anchors) / staging arbitration for the tod question. Priority call vs the
rest of the §290 queue belongs to the next planning pass, not to this file.
