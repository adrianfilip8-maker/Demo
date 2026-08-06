# NOTE-traversal-contrast — who collapsed traversal's figure-to-surround contrast, Δ5.87 → Δ3.41

**Owner:** SHADING. **Date:** 2026-08-06. **Status: COMPLETE — attributed.**
**Verdict: it is `banda2`, and specifically its L2 (`shadowTintPeak` 0.52 → 0.62). Not `uGraze`,
not the sparkle preroll, not staging. The mechanism is arithmetic and was declared in advance
by banda2's own §17: L2 is a LUMA lever on architecture, L1 is a luma-MATCHED hue lever on the
subject, and the collapsed statistic is a luma difference. The surround rose and the figure did
not, by construction.**

No `src/**` touched, no capture, no git run (the coordinator sweeps). Every number below is
from committed frames: `progress/records/sbs2/traversal.png` vs `progress/records/sbs3/traversal.png`,
CRITIC-sbs3 §3.9's rects verbatim — figure `(525,195,715,365)`, surround `(300,195,490,365)`.
Conventions §122.1-stated: luma = Rec.709 on 0–255 display bytes; "differing px" = ΣRGB ≥ 4.

---

## 1. CRITIC's numbers reproduce exactly

| quantity | sbs2 | sbs3 | Δ |
|---|---|---|---|
| figure medL | 76.40 | 76.45 | **+0.05** |
| surround medL | 70.53 | 73.04 | **+2.51** |
| **figure − surround** | **5.87** | **3.41** | **−2.46** |

**The surround's lift is 102 % of the lost contrast.** The figure contributed +0.05 L, i.e.
nothing. Whatever moved is something that moves *architecture luma* and leaves *character luma*
alone. That is a one-sided signature and it is enough to eliminate most candidates before any
further measurement.

## 2. The three suspects, each eliminated or convicted on its own evidence

### Sparkle preroll — ELIMINATED, quantitatively

`#8fd8ff` at CRITIC's tolerance 40: **0 → 239 px frame-wide**, of which **78 px land inside the
surround rect** and **3 px inside the figure rect**. The surround rect is 190 × 170 = **32,300
px**, so the markers are 0.24 % of it — a median cannot be moved 2.5 L by 0.24 % of its
population, and it was not: **recomputing both arms' surround medL with every sparkle-tolerance
pixel of BOTH frames masked out gives 70.47 → 73.01, i.e. +2.54** against the unmasked +2.51.
The preroll accounts for **−0.03 L** of a −2.46 L collapse. It is not the cause and cannot be.

### `uGraze` — ELIMINATED, on population and on signature

`uGraze` is a grazing-elevation sky dissolve. Two independent reasons it is not this:

- **Signature.** Where `uGraze` acts it moves *hue* hard — CRITIC-sbs3 §3.6 measures dunes'
  clean-sky band going medHue 286.0° → 250.2°, mean R−B −4.06 → −14.48. The traversal surround
  moved **mean R−B −24.85 → −25.17, i.e. −0.32**, with a per-band hue movement of −1.6 to +0.1
  (table below). A 2.5 L lift at zero hue change is not what a sky-colour dissolve does.
- **Depth ordering.** The surround's lift is ordered by the *base arm's own shadow depth*
  (§3), which is a property of the shadow term, not of an elevation-keyed sky blend.

### `banda2` L2 (`shadowTintPeak` 0.52 → 0.62) — CONVICTED

Per-pixel Δ over the two rects, banded by the **base** arm's luma (a fixed mask — see §4 on why
this matters):

| base luma | surround n | surround ΔL | surround Δ(R−B) | figure n | figure ΔL | figure Δ(R−B) |
|---|---|---|---|---|---|---|
| L0–40 | 3,004 | **+0.85** | −0.30 | 5,648 | +0.16 | **+1.58** |
| L40–60 | 5,401 | **+2.53** | −1.62 | 4,534 | −0.27 | **+4.04** |
| L60–80 | 13,477 | **+2.82** | −0.01 | 7,316 | +0.45 | **+3.76** |
| L80–120 | 9,210 | **+3.80** | +0.05 | 11,781 | +3.68 | **+5.66** |
| L120+ | 1,208 | +0.55 | −0.75 | 3,021 | −8.16 | +32.52 |

Distribution shape: surround per-pixel ΔL mean **+2.79**, median **+2.43**, p5 **+0.00**, p95
**+3.43**, and only **1.67 %** of its pixels move by more than 8 L. That is a smooth, global,
depth-ordered brightening of the shade register — not blobs, not an edge effect, not a
re-staging. The figure's median ΔL is **+0.00** while its Δ(R−B) runs **+1.6 to +5.7**: a hue
move at constant luma.

**Both halves are banda2's own declared behaviour, quoted from PREREG-banda2 §6 before this
capture existed:** *"L2 brightens every daylight cast-shadow/enclosure register ~2–5 display L
… L1 warms the skinned population's shade register"*, and L1 is *"a hue lever, not a brightness
lever"* — luma-matched by construction (`toon.glsl.js:465–466`, the targets are pre-scaled to
each light's own luma). RESULT-banda2's P4 measured the same L2 lift on interior walls at
**+4.36 / +4.37 medL**, in-band, PASS.

So: the surround is architecture and received the **luma** lever; the figure is skinned and
received the **luma-matched chroma** lever, which by construction adds ~0 L. The statistic
CRITIC tracks is a difference of lumas. **banda2 could not have moved it in any other direction.**

## 3. Mechanism, named at the line

`shadowTintPeak` is the ceiling on the shadow light's brightest channel after the floor rescale
(`ToonMaterial.js:241`, consumed at `_refreshShadowColor`, `ToonMaterial.js:1600` `maxK`). Raising
it 0.52 → 0.62 scales `uShadowColor`/`uShadowColorLit` by ×1.0736–1.1927 per shot (live
readbacks in `progress/records/banda2/readback-*.json`; traversal's tod 0.77 sits with hero's
×1.0808). The two terms that carry that light —

```
+ albShadow * slyShadX * shadowMix * mix( 0.55, 1.0, ao )      toon.glsl.js:470
+ slyShadX  * uShadowWash * shadowMix * ao                     toon.glsl.js:471
```

— are both multiplied by `shadowMix = 1 − key`, so **the lift is proportional to shadow depth**,
which is exactly the ordering the table in §2 shows (+0.85 → +3.80 as the base pixel gets
deeper into shade, falling away again at L120+ where `shadowMix → 0`). The figure's pixels get
the same lift where they are in shade — figure L80–120 also reads +3.68 — but the figure's
*median* pixel sits at L 76 on a surface whose radiance is dominated by the subject's own
key/fill, so the rect median barely moves.

**Corollary worth carrying:** this is not a defect in banda2, it is a cost of it that nobody
priced. Every registered banda2 quantity passed (38/38). The traversal contrast was not among
them, and the shot that lost is the one where a small dark figure is read against a large
shadowed surround — the staging most sensitive to a global shade lift.

## 4. A measurement hazard this investigation exposed, which reaches further than traversal

The table in §2 uses a **fixed mask** (bin membership frozen at the base arm, Δ taken per
pixel). CRITIC-sbs3 §3.1's luma-band table uses a **moving bin** (each frame binned by its own
luma). On a change that moves luma, those are different measurements, and the difference is
large. Same committed pair (`banda2/<shot>.base.png` vs `.ABg.png`), both statistics, one run —
`banda-diag.mjs lit bins` prints this:

| shot | band | moving-bin Δ(R−B) | **fixed-mask Δ(R−B)** | px crossing L=80 upward |
|---|---|---|---|---|
| temple | L0–40 | **+4.17** | **+0.24** | 8.27 % of frame |
| temple | L80–140 | **−5.31** | **−0.14** | ″ |
| interior | L0–40 | **+2.35** | **−0.41** | 6.69 % of frame |
| interior | L80–140 | **−3.26** | **+0.16** | ″ |
| hero | L0–40 | **+0.70** | **−0.33** | 1.65 % of frame |
| hero | L80–140 | **−2.44** | **−0.39** | ″ |

banda2 raised frame mean L by +1.3 (hero), +2.5 (temple), +3.5 (interior). Pixels therefore
migrated across the bin edges, and the migrants are the *coolest* members of the band they left
and of the band they joined — which inflates the lower band's warmth and deflates the upper
band's, without one pixel changing hue. **CRITIC-sbs3 §3.1's "+0.60 to +4.13 warming of the
deep-shade band" and "banda2 slightly cools L80+" are the same artefact read in two directions.**
The genuine per-pixel movements are ±0.4 on architecture; the genuine warming is on the SUBJECT
(sly-closeup fixed-mask Δ(R−B) **+0.97 / +0.75 / +1.87 / +0.69** across all four bands, positive
everywhere, which is what a `vSlySkin`-scoped lever should look like).

This does not overturn CRITIC's verdicts and does not touch RESULT-banda2's 38/38 — none of
banda2's registered bands is a luma-banded frame statistic.

**And the obvious next inference is WRONG, so it is written down rather than assumed.** The
natural guess is that CRITIC's frame warm-share fall is the same denominator effect — `warm% =
R > B+10 ∧ L > 40` over the whole frame, on a change that pushes more dark cool pixels up over
the L>40 floor. It is not. Recomputed inside the **base arm's own L>40 population**, so the
denominator cannot move:

| shot | warm% (CRITIC denominator) | warm% (base arm's own L>40 population) | L>40 share |
|---|---|---|---|
| hero | 23.29 → 23.06 (**−0.23**) | 28.78 → 28.45 (**−0.33**) | 80.93 % → 82.38 % |
| interior | 7.31 → 7.11 (**−0.20**) | 8.77 → 8.52 (**−0.25**) | 83.37 % → 85.78 % |
| temple | 17.11 → 16.94 (**−0.17**) | 19.04 → 18.85 (**−0.19**) | 89.89 % → 91.17 % |
| combat | 42.18 → 41.97 (**−0.21**) | 46.55 → 46.31 (**−0.24**) | 90.62 % → 91.37 % |
| sly-closeup | 11.62 → 11.68 (**+0.07**) | 13.38 → 13.46 (**+0.07**) | 86.82 % → 87.81 % |

The fixed-population fall is **slightly larger** than CRITIC's every time, i.e. the denominator
shift was *helping* the published number. **CRITIC-sbs3's warm-share finding stands, unqualified
and if anything understated; only §3.1's luma-BAND table is the artefact.** The two statistics
had to be measured, not reasoned about — which is the same lesson one paragraph up, arriving
again inside the correction to it.

This is §143.1's family — *a number that does not depend on the thing it claims to measure* —
and the remedy is the same one the ledger already uses: **state the mask with the band.** Any
successor measuring a luma-banded colour statistic across two arms of different brightness must
publish the fixed-mask number beside the moving-bin one, or it is reporting a luma change under
a hue's name. `banda-diag.mjs lit bins` is the instrument; PREREG-litwarm registers its shade-band
non-regression on the fixed-mask convention for exactly this reason.

## 5. Routing

- **The contrast loss is banda2's and is bounded, not reverted.** Reverting `shadowTintPeak`
  would give back RESULT-banda2's P3/P4 (hero <L40 −2.43 pp, interior walls +4.36 L) — a
  registered, shipped, four-shot gain — to buy 2.5 L on one rect of one shot. That trade is not
  proposed here. **PREREG-litwarm registers the traversal figure-to-surround contrast as a
  gated non-regression quantity** so the next SHADING ship cannot quietly take another 2.5 L,
  and its candidate is a chroma lever whose ported luma movement is ≤ 2 L in the same direction
  on *both* rects (differential ≤ ~1 L). → **SHADING** (bounded, registered).
- **The recovery is not SHADING's.** The figure is small, dark and on the top edge of frame in
  this staging (CRITIC-sbs3 §3.9); a rim/separation lever on a 190 × 170 rect where the subject
  is a fraction of the pixels is the weaker half. → **COORDINATOR** (staging/camera on the hook
  shot) is the primary owner, as CRITIC routed it.
- **`uGraze` and the sparkle preroll are cleared by measurement, in writing**, so neither is
  re-litigated: 239 sparkle px frame-wide with 78 in the rect and −0.03 L of the effect; sky
  hue movement absent from a rect whose hue did not move.

## 6. Files this note produced

- `progress/records/NOTE-traversal-contrast.md` — this file.
- `progress/records/banda-diag.mjs` — extended (not forked) with the `lit` mode; `lit bins`
  is the bin-migration calibration quoted in §4.
- Scratchpad only, never committed: the traversal probe and the reference band tables.
