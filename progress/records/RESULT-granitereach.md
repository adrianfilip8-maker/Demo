# RESULT-granitereach — `granite_pink`'s inline relief, per term

Answers the question §158.4 left open and the coordinator routed back: *does `granite_pink` need
inline instrumentation, or do the recipe-level numbers (mean tilt 3.00°, height p05/p50/p95
0.406/0.512/0.614) already say the relief reaches the normal map?*

**Answer: the recipe-level numbers were right, and they are now backed rather than trusted.
No inline term is silent. Close it.**

Instrument `progress/records/granitereach.mjs`, output `progress/records/granitereach-out.json`.
Textures tree hash `ab02f1b6afca`; `src/textures/**` clean, **no recipe edit was needed or made**.
Offline, no capture lock, ~40 s.

---

## 0. Why the composite could not settle it on its own

`granite_pink` writes its relief in one statement in the recipe body (`Materials.js:1338`):

```js
s.h[i] = hh + (1 - edge) * 0.10 + (sm.id - 0.5) * 0.06 - sq * 0.30;
```

`reliefreach.mjs` works by reassigning a *wrapped primitive* binding, so there is nothing here for
it to hold. A composite mean tilt is dominated by whichever addends are live, so 3.00° is
consistent both with "all four reach the map" and with "three reach it and one is in the §125.1
bit-exact-zero state". That is the same ambiguity §158.1 found in `reliefreach`'s own filter, one
level down.

## 1. Method, and the guard that makes it trustworthy

The four addends are **reconstructed in the tool** from the same exported noise functions, the same
seed and the same `Surface.field` divisors — no edit to `src/textures/**`, so nothing about the
shipped build changes. Each arm is `builtH − contribution_T` (an exact subtraction, the statement
being a sum) swapped into a clone of the shipped Surface and pushed through `NormalMap.derive()`
with granite's own `bump 0.011 / tile 2.2 / microSoft 0.35`.

**The reconstruction is a model of the recipe, so it is gated against the recipe before any arm is
read** — §18's failure is a model validated against a tree that has since moved:

| gate | value |
|---|---|
| corr(built `s.h`, reconstruction) | **0.999941** |
| \|residual\| p50 / p95 / max | 5.35e-4 / 1.24e-3 / **1.50e-3** |

`weather()` writes no height and `grain`/`speckle` write theirs after the loop, so the residual
should be the grain term and nothing else. `grain(heightAmt: 0.003)` is ±0.0015 — the max residual
is 1.50e-3, i.e. **exactly the grain amplitude and no structure left over**. The model is the recipe.

Two independent cross-checks of the recipe-level figures, from a tool written separately from
`reliefreach`: built height p05/p50/p95 **0.4058 / 0.5123 / 0.6144** against §158.4's
0.406/0.512/0.614, and base mean tilt **2.996°** against 3.00°.

## 2. Arms — all four addends are live

512², `normalStrength` 2.56, 8.59 mm per texel.

| arm | what it is | dH | dTilt | texels moving >1° | arm tilt mean |
|---|---|---|---|---|---|
| **null (control)** | subtract nothing | **0** | **0.000** | **0.0 %** | 2.996 |
| mineral step | feldspar/quartz/biotite hh, 0.62/0.60/0.56 | 1.35e-2 | 0.482 | 17.3 % | 2.839 |
| crystal edge | `(1−edge)·0.10`, Worley f2−f1, ~23 mm | 1.90e-2 | **1.345** | **50.8 %** | 2.056 |
| small cell | `(sm.id−0.5)·0.06` | 1.50e-2 | 0.797 | 30.9 % | 2.668 |
| wind scour | `−sq·0.30`, the 55 cm hollows | **1.14e-1** | 0.733 | 26.5 % | 2.733 |
| **ALL inline (known-bad)** | subtract all four | 9.85e-2 | 2.676 | 85.4 % | **0.320** |

**Every addend moves ≥17.3 % of texels past 1° of tilt.** For scale, §158.3's `chiselMarks` — which
this file family calls *small* — moves 0.4–4.4 %, and `grain`/`speckle` move 0.0 %. None of the four
is anywhere near the silent shape.

### 2.1 The calibration, which is what licenses reading the table

§13: a metric never shown to move on a state known to carry the defect is not evidence about it.

- **Null arm reads exactly 0.000 in every column** — the floor is a real zero, not a small number.
- **Known-bad arm**: with all four inline addends removed, the map falls **2.996° → 0.320°**, i.e.
  grain and speckle alone deliver 0.32° and **89 % of the shipped tilt is the inline relief.**
  0.320° is below `ceiling_stars`' 0.77°, the flattest map that appears in any framing — so the
  instrument does separate "authored relief reaching the map" from "not", by a wide margin, on this
  recipe.

### 2.2 One result worth keeping: amplitude and slope rank differently, and correctly

`wind scour` has **6× the height amplitude of any other term** (dH 1.14e-1; p05..p95 −0.201..−0.040)
and only the **third** largest tilt (0.733°), because a 55 cm hollow on a 4.4 m repeat is a gentle
slope. `crystal edge` is the mirror image: dH 1.90e-2, the smallest but one, and the **largest**
tilt at 1.345°, because a 23 mm grain boundary is steep.

That is the recipe's own stated design — the scour was added for the *coarse* band at `interior`
(§ the note at `Materials.js:1244`), the crystals for the fine one — and it is the first measurement
showing both arrive in the normal map, on their intended sides of the spectrum. It also means a
future edit must not read the scour's small tilt as weakness: it is the term carrying the coarse
structure, and it is doing it through albedo and roughness as well.

## 3. What this does not say

Per §11, the suffix not implemented: no geometry, no camera, no consumer UV factor (granite takes
the ARCH_UV = 2 default), no lighting, no shadow map, no cel quantiser, no AgX, no ink, no mip
chain, no anisotropic filter. It measures the authored Surface and `derive()`, and stops there.

Specifically it is **not** a claim that granite reads well in any frame. It is the narrow claim
§158 asked for: no authored relief in this recipe is discarded on its way to the map the shader
samples.
