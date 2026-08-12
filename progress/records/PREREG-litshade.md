# PREREG-litshade — does the mixer live in the shade, sealed before the split is computed

Sealed **before** `progress/records/litshade.mjs` exists or runs. Same four gate-clean base
pairs as PREREG-erosion (their aggregate and eroded statistics are known; **no luma split has
ever been computed on them**). Bars fixed here first, same footing as PREREG-erosion.

## 1. Why the shade term is accused

RESULT-erosion: the mixer is homogeneous (not edges), texture-asymmetric with a fixed point
near the RAW costume hue (~228°), indoors and out, absent on the key-lit close-up stagings,
non-proportional. A colour transform applied to the SHADE/FILL side of the cel shader fits
every property — the named machinery is `PAL.shadowHue = 0x2a3f66` (219° dark navy),
`TUNE.shadowTintPeak = 0.62`, `shadowTeal`, `shadowBounceMix` (ToonMaterial), plus the
possibility that bounce/fill carries raw-costume-coloured light (which would put the fixed
point AT the raw hue exactly). This seal does not distinguish those constants — it tests the
family: **is the compression concentrated in the shaded population?**

## 2. The statistic

Per pair (shot × boot): mask M as before (floor 9). Luma of arm A per mask pixel,
L = 0.2126 R + 0.7152 G + 0.0722 B.

> **LIT** = { p ∈ M : L(p) ≥ median L over M } · **SHADE** = the rest.
> Decision populations. Quartile extremes (top/bottom 25 % by L) computed and REPORTED,
> never deciding. Per population: circular median hue A, hue B, swing, R = swing / (−11.3°).

## 3. Registered outcomes (per shot; boots must agree on R within 0.10 as in PREREG-erosion)

- **SHADE-MIX**: R_LIT ≥ **0.60** and R_LIT − R_SHADE ≥ **0.30**, on both shots. The mixer is
  in the shade/fill term family; next step is a sealed TUNE toggle lattice over that family
  (shadowTintPeak / shadowTeal / shadowBounceMix), capture-based, its own document.
  (R_LIT ≥ 0.85 additionally reported as STRONG.)
- **UNIFORM**: |R_LIT − R_SHADE| < **0.15** on both shots. The compression is not a function
  of shading at all → the remaining suspects are the global tonemap/grade path, next seal.
- **MIXED**: anything else, including the shots disagreeing → report both, no call; the
  failing shot's populations get eyeballed (crops written) before any further seal.

No fix, no ship, no constant touched — attribution only.

## 4. The expected outcome, written down in advance

**SHADE-MIX.** It is the only account left standing that predicts every measured property,
including why four toggle/arithmetic instruments in a row found nothing: rims, mips, ink and
edges are all OUTSIDE the shading equation, and the mixer is inside it. If UNIFORM comes back
instead, the tonemap/grade is the last man standing and the close-ups' full swing becomes the
puzzle (their pixels ride the same curve — only their brightness distribution differs).
Forecast record going in: **2/8**, which is exactly why these calls keep getting sealed before
the data is looked at.
