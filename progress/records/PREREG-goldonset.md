# PREREG — goldonset: metal-aware bloom ONSET A/B (§25 amendment's "live redesign")

Sealed before any frame exists. Successor to `progress/records/PREREG-goldhalo.md` /
`RESULT-goldhalo.md`, whose verdict this implements: the gain formulation is dead
(w ≈ 0.004 at the shipped onset; ×25 of nearly-nothing is sub-quantization); the lever with
headroom is a per-pixel threshold `T − cut·metal`. Coordinator ruling: bracket rule from §25's
amendment applies — **every falsifier on an FX-bearing shot is written duplicate-arm-bracket +
temporal-mask native from the start**. Capture joins the coordinated batch; NOT launched by me.

## The change under test (implemented, zero-default, in tree at seal time)

`PostFX.js`: `TUNE.bloomMetalCut = 0` (shipped), uniform `uMetalCut`, and in BRIGHT_FRAG the
threshold becomes `t = uThreshold.x − uMetalCut·m` with `m = clamp(1 − s.a, 0, 1)` (the
fail-closed inverted-alpha tag from b77b614, unchanged). Exact no-op at 0: `0·m = 0` and
`x − 0 = x` in IEEE for finite m; every downstream line is textually the old arithmetic.
Knee unchanged (0.30). The gain path (`uMetalBloom`, measured inert) is untouched and stays 0.
All three render modules import clean post-edit (node import check, this session).

## Registered arithmetic (scratchpad/onsetcalc.mjs, run before this seal)

Anchors carry §25/RESULT-goldhalo provenance (hottest gilded px scene ≈ 2.0; bright cohort
0.9–2.0; temple architrave body ≈ 0.5):

| u | off (T 2.20) | c070 (1.50) | c085 (1.35) | c100 (1.20) |
|---|---|---|---|---|
| 0.50 | 0 | 0 | 0 | 0 |
| 1.20 | 0 | 0 | 0.016 | 0.063 |
| 1.50 | 0 | 0.050 | 0.113 | 0.200 |
| 2.00 | 0.004 | 0.250 | 0.325 | 0.400 |

Feed onset per arm: 1.90 / 1.20 / 1.05 / 0.90. The architrave (u ≈ 0.5) is at w = 0 exactly at
every arm — the DG guard holds by construction, not by tolerance. Display-side: a +0.02
scene-linear add on an L70 annulus px is +13.5 display L through the validated grade+AgX
transcription, so the +6 L mechanism bar is reachable at c100 if any meaningful blurred energy
lands in the annulus. Ceiling: the zero-blur-loss upper bound from the u = 2.0 source puts the
annulus at maxch ≈ 201 — **L235 is predicted unreachable in hero's framing at any registered
arm**; that outcome is a named band below, not a failure of the run.

## The run (one boot; runner `scratchpad/goldonset.mjs`, drafted, coordinator launches)

Shots `hero` (kiosk gilded lintel halo — verdict) and `temple` (distance guard + torch/shaft FX,
the worst temporal case). Arms in capture order per shot: **c0, c070, c085, c100, c0b** —
`pf.tune.bloomMetalCut` ∈ {0, 0.70, 0.85, 1.00, 0} poked live (per-frame republish, no
recompile), live uniform readback recorded per arm.

**Temporal mask, from the start (the §25-amendment rule):** per shot, the *unstable* set is
every px where c0 and c0b differ in any channel; it is dilated 1 px (2-phase-mask
undercoverage mitigation, goldhalo D1) and excluded from every statistic below. No
bit-identity bar is registered on any whole frame — that class is sealed off by design.

## Registered verdicts — bands partition the outcome line (§26.1), thresholds on every claim (§26.2)

- **F0 — arm applied:** live readback `tune == uniform == commanded cut` at every arm. Any
  mismatch → run invalid from that arm forward (goldhalo's F0, unchanged).
- **F1' — state leak, bracket-native:** the temporal-diff population's share within 12 px of
  the gilded mask: **[0, 40%] → time-shaped, PASS** (goldhalo measured 22.8% hero / 4.2%
  temple for pure time); **(40%, 100%] → gain-order state suspected, run stands for diagnosis
  only, no ship**.
- **F2' — scope leak:** brightest 1,000 non-metal px ≥ 200 px from any gilded px (masks rebuilt
  on the capture tree), temporally-masked mean |ΔL| vs c0, per arm, both shots:
  **[0, 0.5) PASS / [0.5, ∞) FAIL → "metal-aware" claim falsified, no ship** (goldhalo's
  masked figures were 0.005–0.04 — 12–100× under this bar).
- **MECH — the §25 routing claim, second formulation:** hero halo annulus
  (dilate(gilded, 12) − gilded), temporally-stable px, p95 display-L lift over c0:
  - lift(c100) ≥ **+6.0 L** AND lift non-decreasing across c070 → c085 → c100 → **mechanism
    confirmed**; ship candidate = smallest arm with lift ≥ +6.0.
  - lift(c100) ∈ (+1.0, +6.0) → present-but-thin: report, no ship this round; any further
    bracket is a new prereg (upward in cut only — the DG guard's w ≡ 0 must be re-derived
    before any Tmetal < 1.2 is considered).
  - lift(c100) ≤ +1.0 → **the onset formulation is not the lever either**; §25's routing is
    wrong twice — say so, stop. (Predicted not to land: see the arithmetic table.)
  - non-monotone with lift(c100) ≥ +6.0 → time-mask undercoverage diagnosis (goldhalo D1's
    2-phase-mask caveat) before any verdict is claimed.
- **DG — distance guard (temple):** architrave-band px newly ≥ L200 at c100, temporally
  masked: **[0, 50) PASS** (predicted 0 — w ≡ 0 at u ≤ 0.9) / **[50, ∞) FAIL → no ship, the
  anchor arithmetic is wrong and says so in the record**.
- **TGT — report shape, not auto-ship:** smallest arm with any temporally-stable halo px
  ≥ L235. Registered expectation: **none** (upper bound 201). If none: the §7.3 "gold-hot ≥
  235" line closes as *unreachable from hero's kiosk source under the shipped grade at
  Tmetal ≥ 1.2*, and the ship decision rests on MECH + look — an art call routed to the
  coordinator, exactly as RESULT-goldhalo's alternative already framed it.
- **LOOK (binding gate on ship, not on verdicts):** open `hero` c0 vs c100 kiosk crops at 3×
  and `temple` c0 vs c100 architrave crop. Ship requires: visible tight warm-tinted halo on
  the glint row (the §7.3 "tight coloured halo", not a wash), and no visible architrave/stone
  lift in temple. A number is not a result until the image agrees.

## Reader

Frozen from this spec before any frame is read (goldhalo-read/goldhalo-diag machinery: same
mask rebuild path, same annulus construction, temporal mask added as the first step). The
frozen file ships alongside the frames' report.json; any reconstruction delta is declared in
the RESULT like RESULT-goldhalo §"Reconstruction deltas".

## What this run cannot decide (scope, stated at seal)

Body-of-the-band gold (98.6% shadowed, spec sh-gated) — carried by dark occlusion + metalEnv,
out of scope per §25. The crook — bloom is not its lever at any onset (median L38–54 scene is
below every arm's feed onset; RESULT-goldhalo routing stands). Nothing here touches stone
thresholds: uThreshold.x is unmodified on m = 0 paths by construction.
