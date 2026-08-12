# PREREG-attractor — which rim is §281's mid-distance blue, by same-boot toggle lattice

Sealed **before** any capture. `shots/attractor/` does not exist at the time of writing.

## 1. The question, and why rims are the accused

§281 (RESULT-bodyshift): at 6–10 m every canonical shot compresses the costume's authored hue
swing to ~half and pulls both arms toward a blue ≈ 222° attractor — indoors too, which
disqualifies distance haze (whose colour is in any case warm by day: `PAL.haze` #e8b878, and it
starts at 26 m). Mip blending inside the body texture is refuted by sign (fur pulls red).

Two rim systems fit "whole-surface blue that grows as the character shrinks":

- **Screen-space rim** (PostFX): `uRimLit` #7fd4ff (hue 200.2°), added in DISPLAY space after
  the tonemap, in bands of **fixed pixel width** (`rimInner 1.2 / rimMid 2.6 / rimOuter 4.4`).
  A ~4 px band is a sliver on a 300 px close-up and most of a limb on a 65 px mid-shot — and a
  *median* ignores it entirely until band pixels cross half the mask, then flips. That is the
  observed cliff.
- **Surface fresnel rim** (ToonMaterial): `uRimColor` (rimCool, clock-driven) × `uRim ×
  uRimGain`, scene-linear. Nominally scale-invariant, but its silhouette gate and minified
  normals could scale it anyway.

§270's lesson applies verbatim: two systems draw cool light on the character's edge; attribute
by toggle, never by reading the shader.

## 2. Instrument

`tools/attractor.mjs`. Shots **`hero`** (outdoor, §281 gap 10.8°) and **`interior`** (indoor,
gap 9.9° — the shot that kills any haze account). One boot per shot; the shot staged once,
clock frozen; then four conditions in this order, each an A(raw)/B(fix) same-boot swap pair:

| cond | toggles (poked on the live TUNE objects, per ToonMaterial.js's harness note) |
|---|---|
| `base` | none |
| `noscreen` | `postfx.tune.rimStrength = 0` |
| `nosurf` | `shading.tune.rimGain = 0` |
| `norim` | both |

Toggles are applied before the pair, restored after it, and **read back after a `step()`**,
never before (the per-frame recompute reverts naked uniform pokes — ToonMaterial.js:469).
After the last condition the toggles are restored and base arm A is re-rendered (`A'`).

Mask floor **9** per §282's rule (current pair = raw ↔ fix@−11.3°, p05 = 9, derived in
RESULT-bodyhue5). Circular median hue over the pair's own mask; swing = hue(B) − hue(A);
**R(cond) = swing / (−11.3°)**.

## 3. Gates

- **CAL-2** per pair: `sha(A) ≠ sha(B)`, modes echo. Failure → pair VOID.
- **CAL-C** per pair: mask ≥ **0.20 %** of frame (§281 history at the equivalent floor:
  hero 0.47 %, interior 0.31 %). Below → pair VOID.
- **C-READBACK** per condition: the poked values read back as poked, after the step. Else
  condition VOID.
- **C-DRIFT** (run gate): `A'` vs base `A` has **zero** pixels with maxChannelDelta ≥ 9.
  Else the toggles leaked state and the whole boot is VOID.

## 4. Registered attribution rule (per shot; the run's outcome is the pair of per-shot calls)

- **PREMISE-GONE** if R(base) ≥ 0.85 — the §281 attenuation does not reproduce at −11.3° on
  that shot; no attribution there. (Expected R(base) ≈ 0.45–0.55 from §281's swing ratios.)
- **SCREEN-RIM** if R(noscreen) ≥ 0.85 and R(nosurf) < R(base) + 0.15.
- **SURFACE-RIM** if R(nosurf) ≥ 0.85 and R(noscreen) < R(base) + 0.15.
- **BOTH** if R(noscreen) and R(nosurf) are each ≥ R(base) + 0.15 and R(norim) ≥ 0.85.
- **PARTIAL-\<sys\>** if only R(norim) ≥ 0.85 and exactly one single toggle gained ≥ 0.15.
- **NEITHER** if R(norim) < 0.85 and neither single toggle gained ≥ 0.15 — the rims are
  exonerated and the next instrument is the eroded-mask split (§281's sketch).

If the two shots disagree, the outcome is **MIXED** and both calls are reported; no averaging.

This run ships nothing: it is attribution only. Any fix (colour, distance-scaled band width,
strength) is a later seal with its own bars. No tune value is changed on disk by this run.

## 5. The expected outcome, written down in advance

**SCREEN-RIM on both shots.** The fixed-pixel band is the only candidate whose geometry
produces the observed cliff (median flips when band coverage crosses half the mask), its
display-space addition after the tonemap is the strongest hue-distorter available, and the
surface rim's silhouette gate exists precisely to keep it off broad surfaces. Confidence
moderate — the surface rim has surprised this project before (`courtyard`'s pale band was
entirely the surface rim, PostFX.js:101). Forecast record going in: 2/4.
