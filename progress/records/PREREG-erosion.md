# PREREG-erosion — boundary or bulk: the mandatory split, sealed before the statistic runs

Sealed **before** `progress/records/erosion.mjs` is written or run. The frames it will score
already exist (the four gate-clean `base` pairs of RESULT-attractor / RESULT-attractor2 —
`hero` and `interior`, two independent boots each, tree `61de3de51735d6dc`, floor 9). Their
AGGREGATE medians are known (they produced R ≈ 0.33–0.37); **no interior/boundary split has
ever been computed on them**, and this seal fixes that statistic's bars before it is looked at.
Scoring existing frames is acceptable here for the reason it wasn't in PREREG-bodyhue4 §3:
these frames carry no candidate and no bar was ever evaluated against the split populations.

## 1. The statistic

For each pair (shot × boot): mask M = { p : maxChannelDelta(A,B) ≥ 9 } (§282 rule, unchanged).

> **INT(k)** = { p ∈ M : every pixel within Chebyshev distance k of p is also in M }
> **BND(k)** = M \ INT(k)
>
> Primary **k = 2** (strips the ~1 px AA fringe plus one safety ring). Fallback **k = 1**,
> used for a pair only if |INT(2)| < 200 px on that pair; if |INT(1)| < 200 too, that pair is
> UNSCOREABLE-eroded. Secondary k = 4 computed and reported, never deciding.

Per population: circular median hue of A and of B, swing, **R = swing / (−11.3°)**.

## 2. Registered outcomes (decided on the primary k per pair, then across pairs)

- **EDGE-MIX**: R_INT ≥ **0.85** on every scoreable pair, and R_BND < R_base(pair) on every
  pair. The mixer is partial-pixel coverage at silhouettes/limb edges — not a defect of any
  pass but the arithmetic of drawing a striated character at ~0.5 % of frame. Registered
  consequence: task #23 pivots to **scale-matched reference measurement** — whether Sly 3's
  own frames compress costume hue identically at matched character size — before D2's
  mid-range residue may be called a defect at all. No render change is licensed by EDGE-MIX.
- **BULK-MIX**: R_INT < 0.85 on any scoreable pair — interior pixels are compressed too; the
  hunt continues into frame-wide passes (bloom / combat-veil / AO tint / tonemap), next seal.
- **SPLIT**: EDGE-MIX arithmetic holds on one shot and fails on the other → report both;
  the failing shot's population drives the BULK branch.
- **UNDERPOWERED**: all pairs UNSCOREABLE-eroded (both k). Then and only then a closer-range
  capture variant is designed under a new seal.

Cross-boot agreement is a validity check, not a bar: the two boots of a shot must agree on
R_INT within **0.10**, else that shot is INSTRUMENT-SUSPECT and reported without a call.

## 3. The expected outcome, written down in advance

**EDGE-MIX.** After rims, mips, and ink each measured ≤ 0.2°, partial-coverage blending is
the only remaining candidate that is (a) fixed-pixel-scale, (b) texture-asymmetric in exactly
the observed way — a boundary blend mixes each arm with the SAME backdrop, and mixing toward
a common partner compresses the arms' difference while barely moving the arm that already
sits near the blend's hue — and (c) present indoors. My earlier "6 % perimeter can't halve a
median" argument assumed a blob-shaped mask; the hero mask is striated limbs at ~0.5 %
coverage, where the perimeter IS the population. Forecast record going in: **2/7** — and if
this one is wrong too, BULK-MIX's pass-lattice runs next with no candidate favoured.
