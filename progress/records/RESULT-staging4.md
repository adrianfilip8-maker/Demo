# RESULT-staging4 — the guard-camera decision: SHIP, on the first capture this seal series has been able to score

Capture: `staging4.mjs`, bootId `45e8c28f-10a`, 2026-08-07. Seal, runner and scorer all committed
**before** the boot. Eight stages — three discarded prerolls then five scored arms — every one
`armTook` true, the guard solving to `[-15.4871, 0, 27.5446]` identically on every shipped-vector
arm, and `srcTree` identical at lock and release.

## The table

```
quantity                     preroll1 preroll2 preroll3     base     cand  restore    KBmid   KBover     sbs3
  P1                            15.92    15.92    15.92    15.92    81.59    15.92    82.51    87.05    15.89
  P2                              306      306      306      306      668      306      642      720      306
  P3                            89.82    89.82    89.82    89.82    24.25    89.82    68.82    14.18    89.56
  P4                              515      515      515      515    10288      515     3064    13596      692
  P5                            28.78    28.78    28.78    28.78     42.1    28.78    28.99    39.68    29.99
  P7                               33       33       33       33        0       33        0        0       33
  R6_figureRectMedL             23.19    23.19    23.19    23.19    25.55    23.19    17.78    23.97    23.19
  G_doorwayPool_medL           115.73   115.73   115.73   115.73    114.3   115.73    115.1   123.46   113.46
```

Wall-times: preroll1 358 s, then 169 / 172 / 169 / 160 / 171 / 163 / 157 s. **§185's question is
answered for the fifth run running** — the first stage absorbs shader compile and every stage after
it lands in a 157–172 s band.

**Look at the four discarded-and-base columns.** preroll1, preroll2, preroll3 and base are
IDENTICAL on every quantity, to the last decimal. That is the warm-up transition completing before
scoring begins, which is what the three-preroll repair was for.

## Verdict — each falsifier's registered text quoted before any reasoning (§193.1)

**P-F3, verbatim:** *"a §4.1 base gate out ⇒ **VOID**."*

| gate | band | base | |
|---|---|---|---|
| P1 | [15.4, 16.5] | **15.92** | ok |
| P2 | [300, 312] | **306** | ok |
| P3 | [88.5, 91.0] | **89.82** | ok |
| P7 | [32, 34] | **33** | ok |
| figure-rect medL | [22.7, 23.7] | **23.19** | ok |

**Does not fire.** Moving the gates onto the figure-column family was correct: every one lands
mid-band. The two boot-dependent quantities are reported and gate nothing — `guard-mass medL`
reads **64.79** this boot against 59.51 / 65.86 / 69.10 / 69.104 across the previous four, a fifth
sample inside the 16 % spread §198.1 measured and exactly the reason it no longer gates.

**P-F4, verbatim:** *"restore-vs-base differing px > 0, frame-wide ⇒ **VOID**."* —
**0 differing px, maxΣ|Δ| 0.** **Does not fire.**

This is the seal's vindication. The same band voided staging3 at 110 px and staging2 r12 at 110 px.
Nothing about it was relaxed; three discarded stages were added because `staging4-floor` measured a
one-time early-boot transition and showed that two stages past it are byte-identical. The band was
never unreachable — it was being measured across the warm-up. **A frame-wide, zero-tolerance
determinism check now passes on a real capture.**

**P-F2, verbatim:** *"§4.3's P2 clause fails ⇒ **UNSCOREABLE**."* — P2 chain
**306 < 642 < 668 ≤ 720**, KBmid strictly inside by 336 and 26, both ≥ 10. **Does not fire.**

**P-F1, verbatim:** *"any of P1–P5, P7 outside on `cand` ⇒ candidate **not shipped**. No retune."*

| id | band | cand | base | |
|---|---|---|---|---|
| P1 | [70, 100] | **81.59** | 15.92 | ok |
| P2 | [560, 720] | **668** | 306 | ok |
| P3 | [0, 70] | **24.25** | 89.82 | ok |
| P4 | [2500, 22000] | **10288** | 515 | ok |
| P5 | [26, 55] | **42.1** | 28.78 | ok |
| P7 | [0, 4] | **0** | 33 | ok |

**Does not fire.** Six for six, and these bands are byte-identical to their first sealing three
seals ago — they have never been moved, so they cannot have been moved toward this result.

**P-F6 / P-F7 / P-F8 / P-F9:** all clean. Framing 625.3 / 244.3 within ±12; `armTook` true on
every arm; one bootId with the in-lock tree pair identical; all three prerolls present and
same-boot.

## Decision, per PREREG-staging4 §7 applied mechanically

> "all gates in band, P-F4 = 0, KBmid strictly inside on P2 ⇒ **SHIP** the two vectors"

- Base gates **5 / 5** ✓ · P-F4 **0 px** ✓ · P-F2 inside by 336 and 26 ✓ · candidate bands **6 / 6** ✓
- No protocol falsifier fired.

**⇒ SHIP.** `SHOTS.guard` moves 1.75 m west: `pos [-11.5, 2.6, 30.5] → [-13.25, 2.6, 30.5]`,
`target [-17.0, 1.1, 28.0] → [-18.75, 1.1, 28.0]`. `fov`, `tod`, `player` and `roll` unchanged.

## What the lever actually does, from P7

The clearest statement is the per-row continuity shares. The base frame has **26 of 39** row-bands
more than 60 % occluded by the near-black plinth mass, including **nineteen consecutive rows at
exactly 0.000** — the subject's whole midsection cut. The candidate has **zero** such rows, every
band between 0.504 and 0.995. That is precisely the "nothing may cut the subject" intent P7 was
re-formed to measure, satisfied completely, and it has now reproduced across four captures.

## What this series cost, and what it bought

Three captures voided before this one: staging2 r12 (unscoreable calibration), staging3 (base gate
narrower than its rect's cross-boot floor; determinism measured across the warm-up), and the
staging3 re-run I contaminated by editing source under its lock. Every void was called by a
pre-registered falsifier rather than noticed afterwards, and each pointed at a specific defect in
the instrument rather than the candidate. The candidate's own bands never moved once. **The lever
was measurably right on the first capture and took four to prove**, which is the correct ratio when
the alternative is shipping on an instrument that cannot tell you when it is lying.

Next: task #14's cone re-judgement runs against `staging4/guard.cand.png` with `PLINTH_Y → 720`.
