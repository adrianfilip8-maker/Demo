# PREREG-bandgate2 — the band question again, with an ORDERING control and a histogram instead of a mean

**Lane:** SHADING (shadow-tint). **Date sealed:** 2026-08-15.
**Ancestry:** §336 (the item is SHADING; AgX refuted) → PREREG-bandgate (f3d314d) → **§340**
(VOID on `PF_LIT`: my control was mis-aimed).

**Status: REGISTERED before any capture.** `progress/records/bandgate2run/` does not exist at
this sha. **Frame count: 4**, one shot, one chunk, warm-up 2 (§331). **No `src` change.**
§141.1: this is a NEW file, not an edit, and it is scored on FRESH frames.

## 1. What §340 established, and the two things it changed

bandgate VOIDed because `PF_LIT` demanded the lit control read `ramp >= 0.80` and it read
**0.561**. The instrument was fine (`CAL` 23.5%, `CLIP` 0.0%, bracket 0 px); **my control was
wrong.** `slyRamp` with `TUNE.bands: 3` gives `steps = 2`, so the nominal levels are **0, 0.5,
1.0** — and 0.561 is the **mid** band plus shipped `rakeTrack`'s increment. The colossus's
brightest face is not in the top band, so no absolute top-band control exists on this shot.

**Change 1 — an ORDERING control, not an absolute one.** It tests that the channel *discriminates*
without requiring me to know in advance which band either rect occupies, i.e. without assuming the
thing this seal exists to discover.

**Change 2 — a HISTOGRAM, not a mean.** This is a second flaw in bandgate that its VOID masked:
the terminator rect sits **on a band boundary**, so a mean conflates *"all shadow"* with
*"84% shadow, 16% mid"*. bandgate's 0.079 mean is consistent with either. A boundary rect must be
scored by distribution.

## 2. Instrument (unchanged, and it worked)

`toon.glsl.js:1454` — `debugTerm(5)` writes `vec3(ramp, ndl, key)`; read through
`debugRaw('scene')`, linear and undecoded, proven in-boot by `debugTerm(4)` → `(64,128,191)`
(§333). `ramp = R/255`.

## 3. Rects (unchanged, verified in §340's fold)

```
LIT reference  [ 908, 322,  948, 358]     TERMINATOR  [1044, 322, 1090, 358]
```
Not extended past x ≈ 1090: x ≥ 1096 reads L 102.6, brighter than the terminator, i.e. off the
colossus.

## 4. Arms — 4 frames
`off` · `ramp` (`debugRaw('scene')` + `debugTerm(5)`) · `cal` (`debugTerm(4)`) · `back`.

## 5. Per-pixel band classification (sealed)

With nominal levels 0 / 0.5 / 1.0, classify each pixel by `ramp`:
```
SHADOW  ramp <  0.25        MID  0.25 <= ramp < 0.75        LIT  ramp >= 0.75
```
Boundaries are the midpoints between nominal levels, so `rakeTrack`'s measured increment (0.061)
cannot move a pixel across a class.

## 6. VALIDITY — fail-closed

| gate | bar | on failure |
|---|---|---|
| `CAL` | `(64,128,191)` ±1 over ≥ 5% of frame | **VOID** |
| `R` | `diff(off, back) == 0 px` | **VOID** |
| `CLIP` | < 5% of terminator px at 255 in `ramp` | **VOID** |
| `V_ROWS` | 4 rows | **VOID** |
| **`PF_ORDER`** | `median ramp(LIT) − median ramp(TERMINATOR) >= 0.25` | **VOID** — the channel does not discriminate between a face the frame shows lit and one it shows shaded, so no class assignment from it means anything |

`PF_ORDER` replaces `PF_LIT`. It is satisfiable on this shot by construction — the two rects are
visibly a lit face and a shaded face — while asserting nothing about which band either occupies.
0.25 is half a band step: smaller than the gap between adjacent nominal levels, larger than
`rakeTrack`'s increment.

## 7. THE MEASUREMENT AND ITS SEALED BANDS

Over the TERMINATOR rect, the fraction of pixels in each class:

| outcome | bar | meaning |
|---|---|---|
| **SHADOW BAND** | `frac(SHADOW) >= 0.80` | the face is in the ramp's shadow band. **§336's item is ALIVE** — a shade-scoped lever can reach it, and the successor targets the RED (linear R/G 3.74 → ≤ 0.90; B/G 1.17 is already passing). |
| **MID BAND** | `frac(MID) >= 0.50` | the face receives direct key. **345° → 218° is unreachable at any legal dose** (§332's shape) and the item CLOSES as mis-aimed; the successor must target the LIT path or the geometry. |
| **MIXED / INCONCLUSIVE** | neither | the rect straddles the boundary too evenly to call. Report the histogram and re-aim the rect in a NEW seal — do not pick whichever reading is convenient. |

## 8. Registered forecast

**~70/30 SHADOW BAND.** bandgate's voided mean of 0.079 implies roughly 84% of the rect below the
mid level, which would clear the 0.80 bar — but it is a voided number from a run whose control
failed, so it is weak evidence and it is labelled as such. The honest position is that I expect
SHADOW and cannot claim it until a valid run says so.

## 8.1 DISCLOSED: I have seen a histogram from the voided frames, and it is not the verdict

After writing §5-§7's bars — and only after — I ran this scorer against **bandgate's VOIDED
frames** as a smoke test, to confirm it executes and that `PF_ORDER` behaves where `PF_LIT` did
not. It reported `PF_ORDER` 0.549 − 0.063 = **0.486** (passing), and a terminator histogram of
**SHADOW 96.4% / MID 3.6% / LIT 0.0%**.

This is disclosed rather than buried because it is material: I am not blind to the likely outcome.
Three things keep it honest:
1. **The bars in §5-§7 were written before that run** — `SHADOW_FRAC 0.80`, `MID_FRAC 0.50`,
   `ORDER_MIN 0.25` and the class boundaries were all fixed in this file first.
2. **It is not the verdict and cannot become one.** bandgate VOIDed; re-scoring a voided run under
   new bars is exactly the post-hoc reinterpretation §141.1 forbids. Only fresh frames decide.
3. **It raises the standard for the fresh run rather than lowering it.** If the fresh capture
   disagrees with 96.4%, that disagreement is the finding and gets reported as such.

## 9. What this seal does NOT do

No candidate, no dose, no `TUNE` change. A measurement seal; its only product is a number and the
route that number selects.

## 10. Disposition

- Any validity gate FAIL ⇒ **VOID**, nothing claimed either way.
- §141.1 absolute: no band here moves once a frame exists. A further re-seal is a NEW file.
