# RESULT-tone1 — task #32, the tone curve

Sealed prereg: `PREREG-tone1.md`. Owner: SHADING/POSTFX.
**Sections 1–4 below are arithmetic and are final. Section 5 (the frame verdict) is the only
part that needs a capture, and it is the part that decides whether anything ships.**

Written down before the capture lands because §83.2's whole lesson is that a measurement living
only in a PNG can evaporate.

---

## 1. The instrument §70.2 used was destroyed by the rollback, and is rebuilt and re-validated

`progress/records/tonecurve.mjs` (promoted out of the scratchpad, which is what §83 took).
§70.3 records the original failing its own validation **twice**, both times by the author. Both
traps were live again and both were re-avoided, deliberately:

| trap (§70.3) | how it was avoided this time |
|---|---|
| a bare number-regex over the matrix declarations matched the `3` in `mat3` and the `2020` in `SLY_REC2020_TO_SRGB`, so every AgX matrix was garbage | matrices are cut **by name**, identifiers stripped *before* numbers are read, count asserted at 9, and a **rec2020 round-trip self-check** (`max err 9.8e-5`) would catch a misparse outright |
| expected values were taken from `bloomcalc.mjs`'s inline comment, which quotes a **retracted** row | validated against the row at `PostFX.js:524`, which is the one anchored to a rendered pixel. `bloomcalc.mjs`'s comment **still quotes the retracted row** — the annotation §70.3 added to it was itself lost in the rollback, so the trap is live for the next reader |

Validation, against four numbers recorded from the destroyed instrument:

| check | result | recorded |
|---|---|---|
| shipped grey row, max error | **0.35 L** | 0.35 L |
| `G(scene 3)` | **0.084** | 0.084 |
| contrast 1.25 → `G(scene 3)` | **0.066** | 0.066 |
| exposure 0.182 → L(lit sandstone) | **126.0** | 125.7 |

Three of those reproduce to the digit. The rebuild is the same function.

**One thing did not reproduce, and it is a scope error rather than a discrepancy.** §70.2's bin
*ratio* (0.390) is over the in-frame distribution of material base luma; my offline proxy over a
log-uniform grey sweep gives 0.319. These are different populations, so the numbers are not
comparable and **the ratio is not quotable from this instrument** — exactly §70.4's own warning
against bridging two ratios that look alike. All design below therefore uses **point-wise `G`**,
which is the part validated to the digit.

## 2. The ceiling theorem — no curve fixes this for free, and that is new

§70.2 established "no *scalar* in this grade can fix it". The stronger statement is available for
nothing, from the fundamental theorem of calculus:

> The mean of `d(ln poly)/dx` across a band equals `( ln poly(hi) − ln poly(lo) ) / (hi − lo)`.
> It depends **only on the curve's values at the two ends of the band.** No reshaping *inside*
> the band can change it.

Since `poly` is bounded above by display white, the only way to raise mean highlight slope is to
**lower the curve below the highlights**. Measured on the band where lit architecture actually
lives (x ∈ [0.72, 0.90], display L ≈ 190–244):

```
shipped mean d(ln poly)/dx                         1.509
absolute max holding the upper-mid anchor fixed    1.792   = x1.19
```

So even sacrificing **all** highlight separation above scene ≈ 4.4 — every sky gradient and every
specular rolloff flattened to white — buys **×1.19** against §70.2's **×2.56** gap.

**Task #32 is therefore not "find a better curve". It is "decide how much brightness to trade for
highlight detail", and that is a look call.** That reframing is the main result here and it cost
no capture.

## 3. The shoulder is a materially cheaper lever than the only one previously sized

§70.2 sized exposure and rejected it (L 202.2 → 125.7). A shaped shoulder buys the same detail
much more cheaply, because it spends brightness only where the crush is:

| at matched detail gain | lit sandstone | shadowed stone |
|---|---|---|
| exposure (the §70.2 lever), ×1.5 | L 164.5 | L 37.3 |
| **AgX shoulder, ×1.5** | **L 180.0** | **L 52.4** |
| exposure, ×2.0 | L 126.0 | L 20.9 |
| **AgX shoulder, ×2.0** | **L 160.1** | **L 41.7** |

+15 L on lit stone and +15 L in shadow at ×1.5; +34 L and +21 L at ×2.0.

A **redistributive** variant (both curve ends pinned, contrast moved from the shadows — which
§68.1 measures as having surplus, 73–82% coverage — into the highlights) was built and **rejected
on measurement**: pinning both ends sags the entire mid-range, costing 36 L on lit sandstone for
×1.58, which is worse than the plain shoulder at the same gain. Recorded so it is not re-derived.

## 4. Shipped implementation, and it is verified in the driver before spending a capture

`TUNE.toneShoulder` in `PostFX.js`, `slyAgxShoulder` in `passes/Common.js`.
**Shipped value 1.0, at which both branches reduce to `poly(x)` identically — the default is
bit-exact, not approximately unchanged.**

`progress/records/agxshoulder-compile.mjs` closes the model→driver gap the §24.6 way rather than
trusting the model: it compiles the real `GLSL_AGX` on the harness's own ANGLE/SwiftShader and
renders 24 known radiances (including two off the grey axis) through `slyAgX` at b ∈ {1.0, 1.2, 1.5}.

```
renderer: ANGLE (SwiftShader)      glError 0
max |shader - model| = 0 of 255    (all 24 samples, exact)
b = 1.0 arms: bit-identical to the shipped curve
```

Modelled cost on the grey axis:

| b | G @ lit sandstone | L(sand) | L(mid) | L(shadow) |
|---|---|---|---|---|
| 1.00 (shipped) | 0.191 ×1.00 | 202.2 | 151.4 | 65.1 |
| 1.20 | 0.267 ×1.40 | 186.9 | 131.4 | 55.3 |
| 1.50 | 0.382 ×2.00 | 166.5 | 105.8 | 42.8 |

Curve verified monotone and never overshooting white for all b tested to 2.0.

## 5. Frame verdict — PENDING

`shots/tone1`, 3 shots × 3 arms + a duplicate-arm bracket, one boot, clock pinned (§28).
Bands, nulls and the revert falsifier are sealed in `PREREG-tone1.md`.

**Nothing ships from sections 1–4.** They say the knob does what it claims and what it costs;
they cannot say whether the cost is acceptable, and §70.1 is the precedent for honouring a
falsifier against one's own work. `toneShoulder` stays at **1.0** unless the frames earn a change.
