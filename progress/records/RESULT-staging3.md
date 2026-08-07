# RESULT-staging3 — the §195.4 re-seal's capture: VOID on two falsifiers, both diagnosed, and the calibration that failed twice finally works

Capture: `staging3.mjs`, bootId `bedb7315-ee4`, 2026-08-07, seal committed at `877aced` **before**
the boot. Six arms, all `armTook` true, one bootId, in-lock `srcTree` pair identical, framing
invariance holding to a tenth of a pixel across the 1.75 m move. Scorer: `staging3-score.mjs`,
self-calibrated against two committed eras (sbs3 12/12 anchors, deriveA 6/6) before scoring.

## The table, verbatim from `staging3-score.mjs`

```
quantity                     preroll2     base     cand  restore    KBmid   KBover  deriveA
  P1                            15.93    15.93    81.15    15.93    82.54    87.12    15.99
  P2                              306      306      668      306      642      720      306
  P3                            89.79    89.79    24.46    89.79    68.81    14.24    89.99
  P4                              514      514    10383      514     3064    13558
  P5                            28.78    28.78    41.68    28.78    28.99    39.75
  P7                               33       33        0       33        0        0       33
  R1_coneAir_medL               27.62    27.62    24.86    27.62    23.08    22.84
  R2_guardMassRect_medL         65.86    65.86    49.22    65.86    49.87    42.34    59.51
  R3_frameNBC_pct               32.99    32.99    18.96    32.99    25.34    31.31
  R4_cornerNBC_pct              91.87    91.87    33.73    91.87    99.31     6.51
  R6_retired_figureRectMedL     23.19    23.19    25.94    23.19    17.78    23.99
  G_doorwayPool_medL           115.89   115.89   114.31   115.89   115.18   123.61   114.45
```

Wall-times: preroll2 485s, base 245s, cand 231s, restore 248s, KBmid 228s, KBover 217s.
**§185's question is answered for the third time and the answer is stable:** the preroll absorbs
the first-stage compile (485 s) and every scored arm lands in a 217–248 s band. The repair works.

## Verdict — each falsifier's registered text quoted before any reasoning (§193.1)

**P-F3, verbatim:** *"a base gate out ⇒ **VOID** (with §4.1's diagnosis duty)."* — base
`R2_guardMassRect_medL` = **65.86**, band **[55.9, 63.2]**. Out. **P-F3 FIRES ⇒ VOID.**

**P-F4, verbatim:** *"restore-vs-base differing px > 2F ⇒ **VOID**."* — 110 px against the
derived band **[0, 0]**. **P-F4 FIRES ⇒ VOID.**

**P-F2, verbatim:** *"§4.3's P2 clause fails ⇒ **UNSCOREABLE**."* — P2 chain
**306 < 642 < 668 ≤ 720**, KBmid inside the open interval by 336 and 26, both ≥ 10.
**P-F2 does NOT fire. The calibration passes for the first time in the series.**

**P-F1, verbatim:** *"any of P1–P5, P7 outside on `cand` ⇒ candidate **not shipped**. No
retune."* — all six in band, by wide margins (P1 81.15 ∈ [70,100]; P2 668 ∈ [560,720]; P3 24.46
∈ [0,70]; P4 10,383 ∈ [2500,22000]; P5 41.68 ∈ [26,55]; P7 0 ∈ [0,4]). **Does not fire.**

**P-F6 / P-F7 / P-F8 / P-F9:** all clean — feet 625.3 / head 244.3 within ±12; `armTook` true on
every arm; one bootId with the in-lock tree pair identical; preroll2 present and same-boot.

**⇒ The capture is VOID. The guard camera does not move on this run**, and per P-F1's own
"no retune" clause no band is adjusted toward anything measured here.

## P-F3 diagnosed — the §4.1 duty discharged, and the gate is the defect

§4.1's registered duty, verbatim: *"If P-F3 fires while every figure-column base absolute
(P1/P2/P3/P7 of the base arm vs deriveA's) agrees, the RESULT must record the miss as a measured
cross-boot median floor — the run stays VOID (a gate that fired is a gate that fired), but the
number is the next seal's calibration, not a mystery."*

The condition is met, emphatically. Base arm vs deriveA:

| statistic | deriveA | scored base | Δ |
|---|---|---|---|
| P1 figure-column NOT-NBC | 15.99 | 15.93 | −0.06 |
| P2 dense-mass top row | 306 | 306 | **0** |
| P3 lower-right NBC | 89.99 | 89.79 | −0.20 |
| P7 per-row continuity | 33 | 33 | **0** |
| figure rect medL | 23.19 | 23.19 | **0.00** |
| cone-air medL | 27.62 | 27.62 | **0.00** |
| doorway pool medL | 114.45 | 115.89 | +1.43 (**1.3%** — inside its ±4.8% band, passed) |
| **guard-mass rect medL** | **59.51** | **65.86** | **+6.35 (10.7%)** |

**The measured cross-boot median floor for the guard-mass rect is 6.35 L / 10.7% relative**, on
two dt-0 boots of identical vectors on an identical tree. The band I carried was ±6.1/6.2%.
**The gate was narrower than the noise it sits in, so it was unpassable across boots by
construction** — the same family of defect as §190 (a gate that could not do its job) and
§191/§192 (a check measuring something other than what it named). The *within*-boot drift for the
same rect is **0.000** (deriveA vs deriveB), so the volatility is purely cross-boot.

**Where the volatility lives, and why that is coherent:** the guard-mass rect spans y ∈ [100,330]
— the frame's upper band, which at `guard`'s tod 0.10 is sky and atmospheric FX. §193 established
a cross-boot FX nondeterminism floor for differing-pixel counts; this is the first measurement of
it for a rect **median**, and it is large. Every statistic anchored on geometry and the character
(the whole figure column, the cone air, the figure rect) reproduces across boots to 0.00–0.20.
**The repair is not a wider band — it is a base gate whose rect does not sit in the FX band.**
Choosing that rect is the next seal's work, and it must be chosen from the frame's structure, not
from which candidate rect happens to make this run pass.

## P-F4 diagnosed — my registered mechanism is under-determined, and the data says so

§4.2's disclosed tension, verbatim: *"If this run's P-F4 lands at 0 < px with small maxΣ|Δ|, the
linear-accumulation model above was wrong in a specific, nameable way: the through-cand excursion
is **path-dependent** (state the intermediate arm leaves behind), which is a determinism defect
P-F4 exists to expose — the run is VOID, not re-banded, and the registered next step is a
derivation that measures the through-cand floor directly."*

The antecedent is satisfied — 110 px, maxΣ|Δ| 18, mean ΣRGB 5.55, i.e. barely over the ΣRGB ≥ 4
threshold. But `staging3-residue.mjs` localizes it, and the localization does **not** support the
mechanism I named:

- The residue is **one compact cluster**, bbox x ∈ [1167, 1278], y ∈ [107, 277] — the upper-right
  sky corner. The 16×12 block map puts 104 of 110 px in four adjacent blocks.
- **Zero residue pixels fall inside any registered rect** — not the figure rect, not the figure
  column, not the guard-mass rect, not the doorway pool, not the lower-right quadrant, not the
  corner-NBC bbox. 0 of 110, six for six.
- The guard's solved stand is **identical** between base and restore (`[-15.4871, 0, 27.5446]`),
  so the re-solve the excursion triggers is exactly reversible. Nothing about the residue is
  near the figure.

So the residue is in the same upper-frame sky/FX band that P-F3's volatility lives in — not in
anything the cand excursion moved mechanically. **Two candidate mechanisms remain and this
capture cannot separate them:**

1. **path-dependence** (what I registered): the cand stage leaves FX state that survives restage;
2. **boot-age drift**: something in the sky/FX advances with elapsed stages or wall-time
   regardless of camera path.

The evidence is genuinely split. deriveA→deriveB (one restage, no excursion, 240 s apart) read
maxΣ|Δ| **1** — nonzero but sub-threshold. base→restore (two restages **through** cand, 478 s
apart) reads maxΣ|Δ| 18. Residue grows, but time and restage-count and excursion all grew
together. **I recorded a mechanism as though the fire would confirm it; the fire is consistent
with it and does not establish it, and saying so is the point of quoting the registered text
first.**

**The registered next step is therefore replaced with a better one** — a plan, not a band, and
the run stays VOID either way. `base → cand → restore → restore2` (what §4.2 named) still cannot
separate the two, because it holds excursion-count fixed at one. The discriminating capture is
**one boot, five or six stages, ALL at the shipped vectors, evenly spaced**: if the residue grows
with stage index and elapsed time with no camera change at all, it is boot-age drift and
path-dependence is dead; if consecutive same-vector stages stay at 0 px indefinitely, the
excursion is implicated and the mechanism I named survives. That capture is cheap (one boot, no
lever) and it is a prerequisite to the next seal.

**One design question it settles, which must NOT be settled by preference:** P-F4 is registered
frame-wide, and the residue is entirely outside every rect any verdict reads. A determinism check
arguably should be scoped to the quantities the verdict depends on. But scoping it now — after
seeing that frame-wide fails and rect-scoped would pass — is precisely the move §141.1 forbids.
**The scoping decision is deferred to the next seal and must rest on the multi-stage floor
measurement above**, with the frame-wide number retained as a reported quantity regardless.

## What this run establishes despite being void

- **The §195.4 calibration re-form works.** P2 grades a graded stimulus cleanly
  (306 → 642 → 668 → 720) where P1 saturates (15.93 → 82.54 → 81.15 — KBmid *above* cand, the
  inversion that made r12 UNSCOREABLE). The instrument now has a scale, which is what §13 asks
  for and what two prior captures could not demonstrate.
- **The dt-0 staging fix holds at the derivation level**: two consecutive frozen-clock restages
  of identical vectors are byte-equivalent at the registered threshold (F = 0 px). The §195 clock
  leak is closed; what remains is a much smaller, differently-shaped FX residue.
- **The candidate's effect is large, consistent and reproduced across three captures.** P7 is the
  clearest statement of what the lever does: the base frame has **26 of 39** row-bands more than
  60% occluded by the near-black plinth mass — including a run of nineteen consecutive rows at
  **exactly 0.000** NOT-NBC share, i.e. the subject's midsection is entirely cut — and the
  candidate has **zero** such rows, with every band between 0.49 and 0.99. That is the "nothing
  may cut the subject" intent P7 was re-formed to measure, and the lever satisfies it completely.
  None of this ships on a void capture; all of it says the next capture is worth running.

## Decision

**VOID (P-F3 + P-F4). The two vectors are not applied. `src/core/Shots.js` is untouched.**
Task #14's cone re-judgement stays gated behind a valid staging capture, as PREREG-staging3 §7
requires.

**Next, in order:** (1) the all-same-vector multi-stage floor capture described above; (2)
PREREG-staging4, re-anchoring the base gate on a rect outside the FX band and deciding P-F4's
scope from that measurement; (3) the scored re-run. Nothing here is re-banded toward a number
this capture produced.
