# PREREG-subjhold2 — subjhold re-sealed with the face gate in delta form

Sealed **before** any run-2 capture. `shots/subjhold2/` does not exist at the time of writing.
Candidate unchanged (`subjShadowHold` = 1.0 poked; default 0.0 on disk, ed39b18). **Everything
not restated here is PREREG-subjhold.md (88d522a) verbatim** — boots, conditions, floor,
CAL-2/CAL-C, CAL-FULL, C-READBACK, C-DRIFT, P2-MID, PROT-CLOSE, PROT-ARCH, PROT-NIGHT
(numeric + LOOK), the outcomes, and what SHIP flips.

## The one change: the face protection

RESULT-subjhold: the absolute corridor was sealed from the wrong arc (banda arm-A instead of
banda2 BaseGate) and the ROI's absolute value has drifted across three arcs regardless
(−44 → −20 → −8, NOTE-readers-frozen §44). The protection's intent — the hold must not MOVE
the face — is a delta claim:

> **CAL-FACE-N** (replaces CAL-FACE-BASE): both face ROI populations alive on both closeup
> arms — n ≥ **200** for cream (L∈[90,200] in the TAIL rect) and for rings (L∈[26,55] in the
> TAIL+upper rects). Below → PROT-FACE VOID-INSTRUMENT, no ship.
>
> **PROT-FACE (delta form)**: |cream(hold) − cream(base)| ≤ **7** AND
> |rings(hold) − rings(base)| ≤ **7** — one quarter of banda's 28-count corridor width,
> derived from that sealed constant and not from run 1's data.

**Disclosure:** run 1's frames were seen and its numbers are quoted in RESULT-subjhold —
including face deltas of 1 count each, which make this gate likely to pass on fresh frames.
The bar's derivation is independent of those observations (corridor-width arithmetic from a
constant sealed months of arcs ago), and every verdict-bearing bar is re-scored on **fresh
frames only**.

## The expected outcome, written down in advance

**SHIP.** Run 1 passed every readable bar with margin (P2-MID |Δref| 2.7/3.9 against 6.0;
night went cooler, not warmer; architecture saw 133 subject-bbox pixels), cross-boot medians
on these shots have historically reproduced to ≤ 0.4°, and the only failed gate was the
mis-derived one. A miss on fresh frames would most plausibly be a reproduction failure —
which is exactly what re-capturing tests. Ledger going in: **2/12**.
