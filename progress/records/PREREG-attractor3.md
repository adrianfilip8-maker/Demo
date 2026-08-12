# PREREG-attractor3 — scene or PostFX: bisecting the pipeline at the debugRaw('scene') seam

Sealed **before** any capture. `shots/attractor3/` does not exist at the time of writing.

## 1. Standing

Five exonerations under seal: rims ≤ 0.2° (§284), mips none-at-any-level (miphue), ink ≤ 0.1°
(§285), edges (RESULT-erosion, BULK-MIX), shade concentration (RESULT-litshade, UNIFORM —
R_LIT − R_SHADE ≤ 0.10). The §281 compression is homogeneous across the costume, uniform
across luma halves within a mid-range frame, texture-asymmetric with a fixed point near the
raw hue, non-proportional in rotation size, and absent on bright key-lit close-ups. What
remains is the pipeline itself: the toon shading that produces the scene buffer, or the
display transform (AgX tonemap + grade) that presents it. `postfx.debugRaw('scene')` is the
seam between them, already proven as an instrument in PREREG-holdscope.

## 2. Instrument

`tools/attractor3.mjs`. Shots **`sly-closeup`** (calibration), **`hero`**, **`interior`**;
one boot each; two conditions per boot, each an A(raw)/B(fix) same-boot swap pair:

| cond | toggle |
|---|---|
| `composed` | none — the shipped pipeline |
| `rawscene` | `postfx.debugRaw(true, 'scene')`, restored with `debugRaw(false)` after the pair |

Readback per condition: `pf._debugRaw` and `pf._debugSrc` as set. C-DRIFT: composed base A
re-rendered after restore, zero px ≥ floor. Mask floor 9 per pair (§282 rule); circular
median hue; swing; R = swing / (−11.3°).

**The linear-encoding caveat, handled by calibration:** the scene buffer is pre-tonemap and
hue is not gamma-invariant, so `rawscene` R values are NOT compared to composed R directly.
The close-up's rawscene pair defines full swing *in that channel*:

> **S(shot) = R_rawscene(shot) / R_rawscene(sly-closeup)** — swing survival, channel-relative.

## 3. Gates

- **CAL-2 / CAL-C** per pair as before (sha differ; cov ≥ 0.20 %, close-up cov ≥ 1.5 %).
- **CAL-FULL** (must fire): R_composed(sly-closeup) ≥ 0.85 — the run reproduces the known
  close-up behaviour, else VOID.
- **CAL-CHAN** (must fire): the close-up rawscene pair has cov ≥ 1.5 % and
  |R_rawscene(sly-closeup)| ≥ 0.5 — the raw channel can carry the statistic at all, else
  VOID-INSTRUMENT (the seam
  needs a different readout, e.g. sRGB-encoded debug blit; no mechanism verdict either way).
- **C-READBACK / C-DRIFT** per condition/boot as in PREREG-attractor2.

## 4. Registered outcomes (on the two mid shots, boots... one boot each; shots must agree)

- **POSTFX-SIDE**: S ≥ **0.85** on both mid shots — the scene buffer carries the full
  relative swing; the compression is applied by the display transform (AgX / grade). Next
  seal bisects inside PostFX (tonemap toggle vs grade toggle).
- **SCENE-SIDE**: S ≤ R_composed(shot)/R_composed(sly-closeup) + **0.15** on both mid shots —
  the raw scene is already as compressed as the composed frame; the toon shading is the
  mixer. Next seal bisects shader terms (debugTerm channels).
- **SHARED**: anything between, or the two mid shots disagree — both numbers reported; the
  next seal targets whichever side holds the larger share, stated arithmetic.

Attribution only. No fix, no constant, no ship.

## 5. The expected outcome, written down in advance

**POSTFX-SIDE, and the named suspect is AgX's toe/purity compression.** The two clean hints —
the brightest mid-range quartile keeps the most swing (R 0.44–0.47 vs 0.30 for the dimmest),
and the key-lit close-ups keep it all — both say the compression tracks LUMA ACROSS FRAMES,
which is what a display transform's purity compression does and what no scene-side term
measured so far has done. AgX also famously skews blue hues, which fits the fixed-point
direction. But the forecast record is **2/9**, the last four candidates that "fit everything"
were each refuted by their toggle, and if this is SCENE-SIDE the debugTerm bisection follows
with no complaint.
