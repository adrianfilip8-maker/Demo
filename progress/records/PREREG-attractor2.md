# PREREG-attractor2 — the ink lattice: is §281's mid-distance mixer the ink, and which system

Sealed **before** any run-3 capture. `shots/attractor2/` does not exist at the time of writing.

## 1. Standing and disclosed deviation

RESULT-attractor: both rims exonerated (NEITHER × 2, ≤ 0.2° effect); mips refuted offline
(miphue.mjs, prediction registered first); the attenuation is asymmetric — arm A stationary at
~228°, arm B dragged up from 218° toward it — so the partner's hue is ≥ the raw costume's.

PREREG-attractor §4 named the eroded-mask split as the NEITHER follow-up. This seal runs the
**ink toggle lattice instead**, because two facts post-date that registration: the
stationary-hueA asymmetry and the mip refutation. The ink fits every constraint — identical in
both arms, fixed screen width at all distances by design (`INK_PX = 2.5`), present indoors,
and coloured **260° dark violet** (`inkShade = inkCool = 0x161022`). The eroded-mask split
becomes **mandatory before any further toggle** if this lattice returns NEITHER.

## 2. Instrument — attractor.mjs's shape, ink toggles in place of rim toggles

`tools/attractor2.mjs`. Shots `hero`, `interior`; one boot each; staged once, clock frozen;
four conditions, each an A(raw)/B(fix) same-boot swap pair on the mode-faithful swap:

| cond | toggles (idioms from tools/inkblack.mjs, proven under seal there) |
|---|---|
| `base` | none |
| `nocrease` | `postfx.tune.inkStrength = 0` |
| `nohull` | every mesh with `material.name` starting `slyInk_` set `visible = false` |
| `noink` | both |

Hull meshes are counted; toggles restored per condition (crease to its live boot value, hulls
to visible); readback after the step. After the last condition, base arm A re-renders (`A'`).

Mask floor **9** (§282 rule, current pair). Circular median hue; swing = hue(B) − hue(A);
**R(cond) = swing / (−11.3°)**.

## 3. Gates — attractor's, verbatim, plus the hull count

- **CAL-2** per pair: `sha(A) ≠ sha(B)`, modes echo. → pair VOID.
- **CAL-C** per pair: mask ≥ 0.20 % of frame. → pair VOID.
- **C-READBACK** per condition: crease value echoes as set; for hull conditions the traversal
  reports **> 0 hulls** and the hidden count equals the found count (a traversal that matches
  nothing must void the condition, not quietly answer "the hull contributes 0"). → cond VOID.
- **C-DRIFT** per boot: `A'` vs base `A`, zero px ≥ 9. → boot VOID.

## 4. Attribution rule — attractor §4's arithmetic, verbatim bars

On R over {base, nocrease, nohull, noink}: PREMISE-GONE if R(base) ≥ 0.85 ·
**CREASE-INK** if R(nocrease) ≥ 0.85 and R(nohull) < R(base)+0.15 ·
**HULL-INK** if R(nohull) ≥ 0.85 and R(nocrease) < R(base)+0.15 ·
**BOTH** if each single toggle gains ≥ 0.15 and R(noink) ≥ 0.85 ·
**PARTIAL-\<sys\>** if only R(noink) ≥ 0.85 and exactly one single toggle gains ≥ 0.15 ·
**NEITHER** if R(noink) < 0.85 and no single toggle gains ≥ 0.15 → eroded-mask split next,
mandatorily. Two shots disagreeing → MIXED, both reported. This run ships nothing; a fix is
its own seal.

## 5. The expected outcome, written down in advance

**The ink family is the mixer: R(noink) ≥ 0.85 on both shots.** Between systems I lean
**HULL** — at a ~100 px character the silhouette hull wraps every limb where they are thinnest,
while the crease pass needs interior edges to key on — but that lean is weak and either
single-system call, or BOTH, confirms the family. A second NEITHER would leave AA/edge
blending against the background as the last fixed-pixel candidate and force the eroded-mask
instrument. Forecast record going in: **2/6**.
