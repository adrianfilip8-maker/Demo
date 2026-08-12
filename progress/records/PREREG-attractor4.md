# PREREG-attractor4 — the scene-side term lattice, on the codebase's own attribution arms

Sealed **before** any capture. `shots/attractor4/` does not exist at the time of writing.

## 1. Standing

RESULT-attractor3b: SHARED, scene-side majority (~43 % of the swing dies in shading). The
albedo-pipeline read that followed found three purpose-built levers already in TUNE:

- **`neutralFill` / `neutralShadow`** — "ATTRIBUTION ARMS, never ship": lerp the fill / the
  shadow colour (wash follows) to luma-matched grey, globally. Defaults 0 = bit-identical.
- **`subjWarmShade`** — shipped **0.65** (creamfix; night pin 0.50): lerps BOTH shade-side
  lights' chroma toward luma-matched warm, **vSlySkin-scoped** — Sly and guards only.

`subjWarmShade` is the new prime suspect and the first candidate that also fits the owner's
"this coloring issue did not always exist": it shipped mid-project to warm the face's cream,
it acts only on the subject, only on shade-side light — dominant in the mid-range framings,
escaped by the key-lit close-ups — and a warm light multiplying a blue albedo compresses the
blue's expressed hue differences. The blueskew record gives the sibling prior: per-term B
shares on the cream were shadowMul 66 / fill 29 / wash 5.

Exonerated so far, under seal: rims, mips, ink, edges, shade-band concentration, all-tonemap,
shadowHold (inert at 0.0 by inspection).

## 2. Instrument

`tools/attractor4.mjs`. Shots `sly-closeup` (calibration), `hero`, `interior`; one boot each;
**every pair captured through `debugRaw('scene')`** — the scene side is the target and the
PostFX share is already quantified. Four conditions per boot, each an A(raw)/B(fix) pair:

| cond | pokes (tune AND live uniform, per the rimGain/rimsweep2 both-poke rule) |
|---|---|
| `base` | none |
| `neutfill` | `neutralFill = 1` / `uNeutralFill` |
| `neutshadow` | `neutralShadow = 1` / `uNeutralShadow` |
| `nowarmshade` | `subjWarmShade = 0` (tune; per-frame republish consumes it) |

Readback per condition from the **LIVE uniforms** after the step (PostFX.js's contact-term
lesson), never from tune. All pokes restored per condition; C-DRIFT re-renders the base pair's
arm A after final restore — zero px ≥ floor 9 or the boot voids.

## 3. Gates

CAL-2 (sha differ) and CAL-C (cov ≥ 0.20 %; close-up ≥ 1.5 %) per pair · **CAL-FULL-RAW**
(must fire): close-up base swing within ±2.0° of attractor3b's rawscene **−10.8°** — derived
from THIS pair's record · C-READBACK per condition · C-DRIFT per boot.

## 4. Registered attribution (per shot; R = swing / (−11.3°); R_ref = R(close-up base))

Per term T ∈ {neutfill, neutshadow, nowarmshade}, on each mid shot:

- **OWNER**: R(T) ≥ **0.85**
- **MAJOR**: R(T) − R(base) ≥ **0.5 ×** (R_ref − R(base))
- **MINOR**: R(T) − R(base) ≥ **0.15**
- **NULL**: otherwise

The run's call per term is the weaker of the two shots' calls; shots disagreeing by two rungs
→ MIXED, reported without a call. No fix ships from this run — `subjWarmShade` in particular
is a certified creamfix deliverable, and any change to it must re-run creamfix's V-gates in
its own seal (the face may not be traded for the costume silently).

## 5. The expected outcome, written down in advance

**`nowarmshade` MAJOR-or-OWNER on both shots**, with `neutshadow` MAJOR as the secondary
(blueskew's 66 % cream share came from shadowMul). If both come back NULL and `neutfill`
carries it instead, the fill's 29 % share was the real driver and the cream prior misled.
Forecast record going in: **2/10** — ten sealed calls, eight wrong, every wrong one killed by
its own registered toggle, which is the system working.
