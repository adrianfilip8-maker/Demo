# PREREG-sphinxrim — §82.4's teal sphinxes: the surface rim's magnitude on shadowed stone

Owner: SHADING (`ToonMaterial.js`, `toon.glsl.js`). Sealed before `tone2`'s sphinx arms land.
Instrument: `scratchpad/sphinxhue.mjs`, offline, no lock. Reproduce with `node sphinxhue.mjs`.

## 1. What the arithmetic establishes, and what it deliberately does not

The surface rim is **additive in scene-linear** (`toon.glsl.js:709`, summed into `outgoingLight`
at `:735`) and then goes through the whole AgX chain. On a shadowed sandstone sphinx at
`rim 0.55`, `rimGain 4.10 × 0.50` daylight, `rimShadowFloorArch 0.55`:

| | delivered | hue | L |
|---|---|---|---|
| shadowed stone, no rim | `rgb(93,69,71)` | 355° | 74 |
| shadowed stone + rim, **all gates at 1.0** | `rgb(138,175,189)` | **196°** | **168** |

That is **×2.26 in luma** and a swing from warm stone to pale blue-grey. The mechanism is the
channel asymmetry §61 found on the hero plinth lip, and it is more extreme here because the
*shadowed* surface has almost no blue to begin with:

```
scene-linear rim add   [0.132, 0.408, 0.620]
shadowed stone surface [0.083, 0.054, 0.043]     <- rim is 14x the surface's own BLUE

R: scene +159%   -> display  92.6 -> 138.3
G: scene +763%   -> display  69.2 -> 174.5
B: scene +1434%  -> display  71.4 -> 189.3
```

At the shipped floor the rim is **6.5× the stone's own radiance**. At that ratio the term does not
*tint* the stone, it **replaces** it — which is what "teal sphinxes" describes.

> **This is a capability result, not an attribution.** All three geometry gates (`rimBand`,
> `rimSil`, `wrapRim`) are pinned at 1.0, so it is an **upper bound**. §23 is the standing warning:
> *a term can be present, firing, and provably able to produce the exact signature — and still not
> be the cause.* The discriminating test is the capture, below.

## 2. A borrowed acceptance threshold scores this defect as a pass

Task #16's bar — *shadowed architecture hue ≤ 226°* — was shaped to catch **violet/magenta**
(260–294°) on the high side of the G ≥ R line. Cyan sits at **196°**. It passes that bar by 30°
while being exactly the defect.

> A threshold inherited from a neighbouring population can be arithmetically satisfied by the
> defect it was never shaped to see. §85.1 refused a number for a population mismatch; this is the
> same mismatch pointed the other way, and it would have read as a clean pass.

**The right statistic here is dominance, not hue** — how much of the delivered pixel is rim rather
than stone. Registered below as the rim:stone scene ratio and the luma multiple.

## 3. Why this is a magnitude question and not a gate question

The §8 gate was built to kill rim on **flat planes at grazing angles** (floors). It is designed to
*keep* rim on curved convex surfaces — that is the temple-column case it exists to protect. A sphinx
is a curved convex organic form, so the gate passes it **over a broad area rather than at an edge**,
and the magnitude that is correct for a 2 px silhouette band is a wash over a whole flank.

So the lever is `rimShadowFloorArch` (shipped **0.55**), not the gate. `[0,0,0]` on the gate would
restore the artefact the gate was built to remove.

## 4. Night is what the floor is actually paying for — and it is re-measured FIRST

§61 records the shadow floor as what carries night's silhouette rims, so cutting it globally is the
obvious wrong move. Modelled at night (`uRimGain × 0.72`, unrimmed night stone `rgb(34,24,38)`, L 27):

| floor | cool `#7fd4ff` | warm `#ff9a5c` | lift over unrimmed |
|---|---|---|---|
| 0.550 (shipped) | L 178 | L 163 | +151 / +136 |
| 0.275 | L 146 | L 130 | +119 / +103 |
| **0.150** | L 119 | L 103 | **+91 / +76** |

**The floor buys far more at night than in daylight, for the same value** — because the night base
is L 27 and the daylight-shadow base is L 74. At floor **0.15** night still gets a **+91 L**
silhouette lift over a near-black surround, which is an unmistakable rim; daylight shadow at that
floor sits at ×1.62 rather than ×2.26.

That asymmetry is the fix: **make the floor time-of-day dependent** rather than cutting it globally.

Side corroboration for §61's flagged-not-changed item: the warm night variant lands at hue **21–26°**
when used, so §2.2's warm rim is available and simply is not reaching the frame.

## 5. Pre-registered A/B — the discriminating test, in `tone2`

Three arms on `dunes` (its camera at (26, 19.5, 84) looks straight down the sphinx avenue,
x = ±7, z = 40…84), one boot, clock pinned, gates untouched:

| arm | `shading.tune.rimGain` | `postfx.tune.rimStrength` |
|---|---|---|
| `sphinx-dunes-base` | 4.10 (shipped) | 0.70 (shipped) |
| `sphinx-dunes-surfoff` | **0.0** | 0.70 |
| `sphinx-dunes-screenoff` | 4.10 | **0.0** |

**Attribution rule, registered in advance.** ROI = the shadowed flanks of the avenue sphinxes.

- If `surfoff` removes the teal and `screenoff` does not → the **surface** rim owns it, §1's
  arithmetic is the mechanism, and the fix is §4's floor.
- If `screenoff` removes it and `surfoff` does not → it is **PostFX's** screen-space rim, whose
  colour is a constant `#7fd4ff` in all ten shots (§61 records it has no time-of-day hook at all),
  and §1 is a true statement about a term that is not the cause — §23 again.
- If **neither** removes it, the cyan is not rim at all and both §1 and §82.4's routing are wrong.
  Candidates then: the split-tone cool leg (gains `(0.914, 0.999, 1.265)`, §8) and `aoTint`.
- If **both** remove it substantially, they are additive and the fix must be sized against the pair.

**Null:** `sphinx-dunes-base` must differ from the shipped build only by the clock pin. Any other
difference means an arm leaked (`tune.rimStrength` is re-read every render, `rimGain` is a
per-frame write — §80.5), and the run is void for this item.

## 6. What ships, and what does not

**Nothing ships from section 1.** It is an upper bound with the gates pinned open; it says the term
*can* produce the signature, not that it does. If §5 attributes it to the surface rim, the proposed
change is a time-of-day ramp on `rimShadowFloorArch` — high at night, ~0.15–0.20 in daylight — and
that change is itself re-sealed with **`night` and `guard` measured before `dunes`**, because those
are the two shots the floor exists for and they are the ones a global cut would break.
