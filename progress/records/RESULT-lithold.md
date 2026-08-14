# RESULT-lithold — VOID by the seal's own staging gate: the action-shot bleach is NOT PRESENT on this tree, and that is the finding

Scored against `PREREG-lithold.md` (677b914). Run 5 — the four earlier launches were killed by
container rollbacks and a contention triage (§316/§325); this is the first to reach its scorer.
68 frames, no install, `src/render` + `src/player` clean at release. Log `lithold-score.log`.

## The gate that fired

`BG` is the seal's registered staging gate — *"a staging that isn't the diagnosed one VOIDs"* —
and it measures costume saturation on the **off** arms, before any candidate acts:

```
              sealed bar        r12 frames (calibration)      THIS RUN (off arm)
traversal     <= 0.30           0.205                          0.678
combat        <= 0.18           0.080                          0.486
sly-key       >= 0.42 (control) 0.516                          0.516
```

`BG` FAIL ⇒ `E1/E2/E3/KO/PC_*` all VOID by construction. **Nothing about the candidate was
measured, and nothing is claimed about it.** `subjLitHold` stays 0.0.

## What the numbers say, and how far I will take it

Traversal's costume saturation is **3.3×** its calibrated value and combat's is **6.1×**, while
**the control shot is identical to three decimal places** (0.516 → 0.516). An unchanged control
rules out a global exposure or grade shift: whatever moved, moved *only* on the two shots that
§312 characterised as "barely key-lit (ramp 0.05 / 0.00)" — precisely the shots where the
additive legs (spec, rim, screen-rim, bloom) dominated because the multiplicative key was
absent. **On this tree, Sly's blue survives in the action frames.**

**Cause is NOT established by this run**, and I am not going to assert one. Two candidates:
1. **The two lighting ships landed between the r12 capture and this run** (`goldenrake` +
   `nightfloor`, 0525d5e). Note against this: goldenrake carries `* (1.0 - vSlySkin)` and so
   explicitly excludes the subject, meaning any effect on Sly's own pixels would have to be
   indirect. Not dismissed, not assumed.
2. **The r12 frames were captured with a LIVE world clock** (the harness warning recorded in
   §308/§304), so the character sat at an uncontrolled animation phase and position; this run
   stages deterministically. A phase difference alone can change how much of the costume is
   key-lit in a swing or an impact frame.
Both are testable and neither is free to assume. The blind r13 round settles the visible
question independently, which is the right place for it.

## The lesson, which is mine

The seal calibrated its BG separation on `shots/r12/` frames that **predate two shipped lighting
changes on the tree it then captured against**. That is the §282 error class — a constant
derived in one context and applied in another — and the sequencing was my doing: I shipped
goldenrake/nightfloor and then ran a seal whose calibration came from pre-ship frames.
**Rule: re-derive any frame-derived calibration against the CURRENT tree whenever a ship has
landed since those frames were captured, and say in the seal which tree the numbers came from.**
The seal's BG gate is what caught it — an instrument that refuses to measure a defect that is
not there is doing exactly its job, and it saved a verdict that would have been meaningless.

## Also on record

`ENV_dunes` and `ENV_interior` FAIL (environment protection) and `ENV_combat` VOID; these sit
inside a voided block and are not adjudicated here, but a successor must not inherit them
unexamined — the vSlySkin debug-mask arms exist precisely so PROT-ENV is measured rather than
asserted, and they should be read on the next valid run.

## Disposition

Nothing ships. The §277/§312 item does **not** get re-sealed on the old calibration. Next step is
r13's blind read of traversal and combat: if the bleach is gone there too, the item closes as
resolved-by-side-effect and the ledger records which ship did it; if the critic still sees it,
the seal is re-derived on current frames.
