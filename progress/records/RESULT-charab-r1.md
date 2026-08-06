# RESULT-charab-r1 — blind round 1: incumbent vs SlyModel3 **stage 2**

**PROVISIONAL per PREREG-charab C-F4** — the rebuild was early-form when these frames were
captured, so this round is a work list, not a shipping verdict. Protocol held: fresh agent, only
the four pair images + the two on-disk reference images, key written before the round
(`charab/blind-key.json`, seed 1), verdicts per side letter with a named feature each.

## Verdict, translated through the key

| pair | A | B | winner (by letter) | winner (by model) |
|---|---|---|---|---|
| sly-closeup | base | model3 | A ×4 | **incumbent** ×4 |
| sly-profile | base | model3 | A ×4 | **incumbent** ×4 |
| sly-perch | model3 | base | B ×4 | **incumbent** ×4 |
| traversal | base | model3 | A ×4 | **incumbent** ×4 |

**Incumbent 16, stage-2 rebuild 0.** The critic independently noticed the alternation and stated
the same total by build ("one build actually took 16 of 16") — and its per-letter verdicts match
the key exactly, including the one flipped pair. That agreement is itself evidence the blinding
held: the critic tracked the *builds*, not a side habit.

## What the critic named (each answer carried a feature, per protocol)

Against stage 2: tail "a flat unbanded tan ribbon" / "bare bent wire" that vanishes at quarter
size; head ~1/7 of height on "pipe-cleaner limbs"; the eye region "one round dark lens reading as
sunglasses"; the muzzle "a detached rectangular block ... with a visible seam"; the cane "a thin
gold thread that reads as a hanging chain", floating detached in profile and clipping the torso in
perch.

For the incumbent: the banded S-curve tail, cap-and-skull mass, boot mass, bold heavy outline.

**And the critic's unprompted flag, quoted in full because it is the strategic finding:**

> "the winning build's own weakness is palette, not form. Across all four pairs it shows no
> crimson sash, no gold collar V or belt or cuff bands, blue-grey trousers where the reference has
> cream, and a desaturated teal-leaning blue — the losing build gets all four of those right. Its
> costume colour blocking is the thing to port over."

A blind judge with no knowledge of either build's provenance reproduced the exact form-vs-palette
split read off the frames before the round. The two independent reads agreeing is what makes the
work list trustworthy.

## The critic's three changes → status

| critic's change | status at the time the verdict arrived |
|---|---|
| 1. tail as a volume: root thicker than head, 4–5 HARD-edged bands, real S | **already applied in stage 3** (committed `f4cace4` BEFORE the verdict arrived: PAL.tailDark, doubled rings at band boundaries, lower S-arc, gentler taper) — convergent, not responsive |
| 2. mass + proportions: head → ~1/5, limbs thicker with taper, knee break + ragged hem, wider shoulders, thicker cane | **partially in stage 3** (+25% limbs, shorts + ragged hem). **Stage 4 owes: bigger-reading head, wider shoulders, thicker cane + bigger hook, cane grip alignment** |
| 3. face rebuild: mask to points, amber eyes with whites inside it, muzzle fused to the skull, tall ears | **partially in stage 3** (eyes 30% bigger + proud, muzzle level at mid-face). **Stage 4 owes: muzzle-to-skull fusion (kill the seam), mask corner points, taller ears** |

Stage 3 was derived from my own reading of the stage-2 frames, independently of and before the
critic's report; where the two lists agree (tail, limbs, hem, eyes, muzzle angle) the fix is
already rendering. Stage 4's list is the remainder: **head presence, shoulders, cane weight,
muzzle fusion, mask points, ears.**

## Standing consequence

Per the seal: ties and losses restore the incumbent, and restoration is the default (no token ⇒
`SlyModel.js`). Nothing to do — the incumbent is live everywhere except when a capture explicitly
passes `?char=model3`. The rebuild continues toward round 2 with the stage-3 frames.
