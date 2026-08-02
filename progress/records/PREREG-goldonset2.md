# PREREG — goldonset2: the metal-aware bloom ONSET A/B, re-run with the clock PINNED

Sealed before any frame of `shots/goldonset2/` exists. Successor to `PREREG-goldonset.md` /
`RESULT-goldonset.md`, whose verdict was **"the run has no power to decide its own question"**.

**This is a NEW seal. The old seal's stop-band is spent and is NOT inherited.** `RESULT-goldonset`
recorded its MECH stop-band (*"lift ≤ +1.0 → the onset formulation is not the lever either; say
so, stop"*) as **satisfied-but-unfireable**, because it was the false-negative branch of a run
that could not have detected a positive. A stop-band that has once read satisfied on a powerless
run cannot be re-used as if it were fresh evidence: re-running the same band would let the
earlier null leak into the new verdict. Every band below is re-derived, and the stop-band now
carries a power condition of its own (POW) without which it may not fire.

## What changed since the last seal — one token, and it is the whole reason to re-run

§28 (`3566311`): `__GAME.step(n)` advances `engine.time` by `n/60` s, so sequential arms in one
boot render at **different FX phases**. Every animated term rides that clock. On goldonset the
phase floor exceeded the knob's entire effect — `c0b` moved *more* pixels than `c100` at an
identical setting — so no pixel statistic could attribute a difference to the knob.

**The fix, at the call site only:** `__GAME.step(n, 0)`. Frames still advance and poked uniforms
still propagate (`update()` runs either way), but `dt = 0`, so `engine.time` is frozen and every
arm shares one phase. Runner change; **no `src/` change**; `src/core/Debug.js` is not touched
(coordinator hold — the default `dt` stays as-is until the batch drains).

Consequence for the design: the duplicate arm stops being a *mask source* and becomes a
**bit-identity gate**. The temporal mask is removed entirely, not retuned — it was the instrument
that nulled the bracket by construction while leaving the intermediate arms at their own phases.

## The change under test (unchanged from the last seal, still zero-default in tree)

`PostFX.js`: `TUNE.bloomMetalCut = 0` (shipped), uniform `uMetalCut`, and in BRIGHT_FRAG the
threshold is `t = uThreshold.x − uMetalCut·m`, `m = clamp(1 − s.a, 0, 1)`. Exact no-op at 0.
Knee unchanged (0.30). The gain path (`uMetalBloom`, measured inert in RESULT-goldhalo) stays 0.

## The run — one boot, two shots, six arms

Shots `hero` (kiosk gilded lintel halo — the verdict shot) and `temple` (distance guard + the
worst FX case). Arms in capture order, per shot:

| arm | cut | role |
|---|---|---|
| `c0` | 0 | reference |
| `c070` | 0.70 | substantive (inherited) |
| `c085` | 0.85 | substantive (inherited) |
| `c100` | 1.00 | substantive (inherited) — the verdict arm |
| **`c200`** | **2.00** | **NEW — positive control, POW. Not a ship candidate.** |
| `c0b` | 0 | duplicate arm: **evidence the pin held**, captured last so it brackets every poke |

`pf.tune.bloomMetalCut` poked live (per-frame republish, no recompile); live uniform readback
recorded per arm. Every inter-arm advance is `step(2, 0)`.

`c0b` is deliberately **last**, after the largest poke, so F0b tests that the pin survived the
whole arm sequence rather than just the first step.

## Registered verdicts — bands partition the outcome line (§26.1), thresholds on every claim (§26.2)

- **F0 — arm applied.** Live readback `tune == uniform == commanded cut`, `gain == 0`, every arm.
  Mismatch → run invalid from that arm forward. (Unchanged; readback, not pixels.)

- **F0b — THE PIN HELD (gate on everything below).** `c0` vs `c0b`, **whole frame, raw, no mask**:
  - **exactly 0 moved px → PASS.** The clock is pinned; every population below is phase-free and
    all statistics are read verbatim.
  - **≥ 1 moved px → the pin FAILED. The run is VOID on that shot** and nothing else on that shot
    may be read — not "read with a wider band", not "read through the noise". Report the count and
    stop. (§28's standard, reverting §25's retracted bracket-and-mask ruling.)

  With F0b passing, **no temporal mask is applied anywhere.** This is the design change.

- **POW — the instrument has demonstrated power (gate on the stop-band).** On `hero`, the annulus
  moved-set at `c200`: **≥ 200 moved px AND median |ΔL| ≥ 2.0 → POW PASS.**
  - POW FAIL → the reader cannot be shown to detect an effect of *any* size on this population.
    **The MECH stop-band may not fire**; MECH is reported as UNDECIDABLE and the run is diagnostic
    only. This clause exists because the last run's stop-band read satisfied on exactly this
    failure and had no way to know.
  - `c200` is a control, never a ship candidate: it drives `t = 2.20 − 2.00 = 0.20`, far below the
    bright cohort, so it is expected to bloom the gilded set grossly. **If it does not, the fault
    is in the instrument or the wiring, not in the art.**

- **MECH — the §25 routing claim, movement-selected (fixes RESULT-goldonset §4.1).** The old
  statistic was p95 display-L over the **whole** hero annulus (n = 45,984) against an effect
  population of ~50–130 px: rank ~2,299, so the effect was invisible *by construction* whatever
  its amplitude. Replaced:

  **Primary — the moved subpopulation.** `M(a)` = annulus px where arm `a` differs from `c0` in
  any channel. Report `|M(a)|`, and over `M(a)`: median ΔL, p90 ΔL, max ΔL, ΣΔL. Bands on `c100`:
  - `|M(c100)| ≥ 50` **AND** median ΔL over `M(c100)` ≥ **+3.0 L** **AND** `|M|` non-decreasing
    across c070 → c085 → c100 → **MECHANISM CONFIRMED**; ship candidate = smallest arm meeting
    both, subject to LOOK.
  - `|M(c100)| ≥ 50` AND median ΔL ∈ (+0.5, +3.0) → **present-but-thin**: report, no ship this
    round; any further bracket is a new prereg.
  - `|M(c100)| < 50` OR median ΔL ≤ +0.5 → **the onset formulation is not the lever** — §25's
    routing is wrong twice. **Fires only if POW passed**; otherwise UNDECIDABLE.
  - non-monotone `|M|` with `|M(c100)| ≥ 50` → report as non-monotone and diagnose before any
    verdict. With the clock pinned there is no phase explanation available, so a non-monotone
    result here is a real finding about the knob, not an artefact.

  **Secondary, reported but NOT banded:** p95 and mean display-L over the whole annulus — the old
  primary, kept only so the two runs can be compared on the same axis.

- **F2'' — scope leak, selected by MOVEMENT then classified (fixes RESULT-goldonset §4.2).** The
  old F2' sampled the *brightest* 1,000 non-metal px and measured their movement; a frame-wide
  scan later found 1,072 moved px at ≥ 200 px from gilded on `hero` that it never sampled, so its
  PASS was true as written and established nothing. Replaced:

  Scan the **whole frame** for px moved between `c0` and arm `a`, then classify by distance to
  gilded. Bar on the far class: **moved px at dist ≥ 200 with |ΔL| ≥ 1.0**:
  - **[0, 50) → PASS.** **[50, ∞) → FAIL, the "metal-aware" claim is falsified, no ship.**
  - Also report the far-class ΔL distribution and the near/far split of the whole moved set.

- **F1' — RETIRED.** Its population was the bracket's own noise; with the pin that population is
  empty by construction and its 40% band is meaningless. Superseded by F0b. Recorded as retired
  rather than silently dropped.

- **DG — distance guard (`temple`).** Architrave-band px newly ≥ L200 at `c100`, raw (no mask):
  **[0, 50) PASS** (predicted 0 — `w ≡ 0` at u ≤ 0.9) / **[50, ∞) FAIL → no ship, and the anchor
  arithmetic is wrong and says so in the record.** Also reported at `c200`, where a large value is
  *expected* and is not a failure — it is the control confirming the band can move at all.

- **TGT — report shape, not auto-ship.** Smallest arm with any halo px ≥ L235. Registered
  expectation: **none** at c070–c100 (zero-blur-loss upper bound 201). `c200` excluded from the
  expectation. If none: the §7.3 "gold-hot ≥ 235" line closes as *unreachable from hero's kiosk
  source under the shipped grade at Tmetal ≥ 1.2*, and ship rests on MECH + LOOK.

- **LOOK — binding gate on ship, not on verdicts.** `hero` `c0` vs `c100` kiosk crop at 3×, and
  `temple` `c0` vs `c100` architrave crop. Ship requires a visible **tight warm-tinted halo** on
  the glint row (§7.3's "tight coloured halo", not a wash) and **no** visible architrave/stone
  lift on `temple`.

  **Mandatory null crop (carried from ADDENDUM-creamfix-phase §3).** Every LOOK crop is rendered a
  second time as `c0` vs `c0b` at the identical box and amplification. With the pin held this
  image must be **uniformly zero** — and that is the proof, in the same currency as the claim,
  that the halo crop shows the knob and not the clock. *A difference image is not evidence until
  the same image has been rendered on a known-null pair.* This is the control that caught my own
  misreading last run, where two tight warm blobs reproduced identically at an unchanged setting.

## Reader

`scratchpad/goldonset2-read.mjs`, frozen from this spec **before any frame exists**, per
`NOTE-readers-frozen.md`. It carries a `GOLDONSET2_DIR` env override so it can be proven on a
known input (the previous run's frames, re-labelled) before the real frames land — §1's rule that
a diagnostic must be proven on a known input first. Any reconstruction delta is declared in the
RESULT.

## Instrument proving — done BEFORE the frames exist, and it found a bug in the reader

Per §1 ("your diagnostic can be the bug — prove it on a known input first"), the frozen reader was
run against two constructed inputs while `shots/goldonset2/` was empty. This changed **no band, no
threshold and no population**; it tested code paths and branch logic only.

1. **Known-BAD (the real, unpinned goldonset frames).** F0b must catch an unpinned run.
   It did: `hero` **120,216** moved px, `temple` **286,407** moved px, whole frame — both correctly
   **VOIDED**, with the downstream statistics refusing to run. (These are whole-frame figures; the
   17,787 in `RESULT-goldonset` was the gilded-architecture subset, so the two agree in kind.)
2. **Known-GOOD (synthetic: `c0b` copied from `c0`, so the pin is held by construction).**
   F0b passed at **0** moved px and every downstream verdict executed end-to-end.

**The proving run found a genuine defect in my reader.** `Math.max(...arr)` overflowed the call
stack at ~130k far-class pixels — a population size the real frames will certainly reach. Had this
been discovered on the real frames it would have destroyed the read *after* the capture and the
FIFO wait. Replaced with a loop (`amax`). A second fix: the reader could print "engine.time
identical" when the field was simply absent (every value `undefined` compares equal) — the §11
failure shape, a precise sentence about something never measured. It now prints `NOT RECORDED`.

**The null-image machinery is proven in both directions**, which is the part that matters, because
a null crop that is black due to broken diff code proves nothing:

| crop | nonzero px / 172,800 | max |
|---|---|---|
| `hero` NULL `c0b` vs `c0` | **0** | 0 |
| `hero` `c100` vs `c0` | 5,571 | 255 |
| `temple` NULL `c0b` vs `c0` | **0** | 0 |
| `temple` `c100` vs `c0` | 52,677 | 255 |

No number from either proving input is evidence about the art. The known-GOOD input is synthetic
(`c200` is a copy of `c100`, and its "moved" populations are the *previous run's phase noise*), so
its POW/MECH/F2'' figures describe the old defect, not this knob. They are reported here solely as
proof that the branches execute.

## What this run cannot decide (scope, stated at seal)

Unchanged from the last seal: body-of-the-band gold (98.6% shadowed, spec sh-gated) is carried by
dark occlusion + metalEnv and is out of scope; the crook's median L38–54 scene sits below every
arm's feed onset, so bloom is not its lever at any cut; nothing here touches stone thresholds,
since `uThreshold.x` is unmodified on `m = 0` paths by construction.

**One thing this run still cannot decide, stated plainly:** `setShot()` internally calls
`step(14)` and `step(3)` at their default `dt` while staging (`Debug.js`, which I am held off).
Staging therefore still advances the clock — but it runs **once per shot, before any arm**, so all
arms of a shot share one post-staging phase. F0b is what tests that claim rather than assuming it;
if staging leaked phase into the arms, F0b fails and the run voids.
