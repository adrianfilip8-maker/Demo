# PREREG-celband — does the cel shading band?

Registered **before** the subject arm was run. `progress/records/celcyl.mjs` is committed in the
same change so the criterion is on the record ahead of the number. The subject numbers of the
prior (VOID) run were deliberately not read by the author of this document.

## 1. The defect

A blind critic scored the build 3/10 and ranked "the cel shading does not band" first. The
standing measurement is a max luma step of 3.79 across a 420 px sweep: the shading reads as soft
Lambert with a slight posterize rather than as a hard-edged toon ramp.

## 2. Why the previous criterion was VOID, and what is wrong with it

The first run of `celcyl.mjs` asserted `plateaus >= 2 && maxStep > 20` on its POSITIVE control.
It failed:

```
[calib-banded] plateaus 3, maxStep 15.62   MUST-CHANGE: plateaus>=2 && maxStep>20 -> FAIL
[calib-smooth] plateaus 1, maxStep  1.12   MUST-CHANGE: maxStep<20               -> PASS
```

The positive control drew three clean plateaus 85.0 luma apart — unmistakable banding — and was
scored blind, because `20` was authored rather than derived. By §141.1 the run is VOID and its
subject numbers are discarded rather than re-scored.

`maxStep` is not merely mis-thresholded, it is the wrong statistic for this geometry and **no**
threshold on it can be right:

* `TUNE.termSoft` is a ±0.024 smoothstep, so every band boundary is deliberately soft.
* On a cylinder N·L changes slowly, so that soft window is several pixels wide. The instrument
  now prints the figure: **12 of 193 measured pixels (6.2%) sit inside a ±termSoft window**, so
  a *perfectly* banded face spends 6% of its width in transition and never shows one large
  per-pixel step.

A statistic whose value depends on how many pixels a terminator happens to be wide cannot answer
"how many tones does this surface take".

## 3. Three facts that kill any criterion built on *where* a band lands

Established from `Kit.papyrusColumn` and `EgyptLevel.hypostyleHall`, not from the frame:

1. **Ribs.** The shaft is lathed as `r(θ) = R·(1 + 0.075·cos 8θ)` with ribScale 1 on every shaft
   row, and `computeVertexNormals()` overwrites the pushed cylinder normals with the lobed ones.
   Normal azimuth swings ±atan(8·0.075) = **±31°** with a 45° period (~98 px here); N·L swings
   ±0.45 with it and crosses the terminators four times on the measured face.
   *Incidental finding:* `spin` does **not** rotate the flutes in world space. `Kit` uses the same
   `a = j/seg·2π + spin` for the vertex azimuth *and* for `cos(a·lobes)`, so the polar curve is
   identical for every value of `spin`; the crests are welded to world azimuth 0/45/90…° on every
   column in the level. `spin` only re-phases which 48-gon vertex lands where inside a lobe. That
   makes the rib phase *known*, and leaves only the sub-facet sampling phase unknown.
2. **Lean.** `dx = lean·y`, deterministic for the nave (`-sx·(0.4 + NAVE_LEAN_IN[cz]·0.7)` deg =
   −1.205° for the measured column), plus a `leanZ` jitter drawn from the level rng. The x half is
   modelled; the z half is not, and is worth several terminator widths of registration error.
3. **Taper.** `dr/dy ≈ −0.049` at mid-shaft, so the true normal carries `n.y ≈ +0.049` and every
   N·L is offset by ~+0.027 — larger than `termSoft` itself.

**Design rule that follows:** the statistic may use the SET of luma values on the face; it may
not use WHERE they fall.

## 4. The statistic — `gapFrac`

Sort the face's luma profile, trim 2% off each tail, and report the sum of the `bands − 1` (= 2)
largest gaps between consecutive sorted values, as a fraction of the trimmed range.

> **How much of the tonal range this surface occupies is EMPTY.**

* A surface that takes `k` discrete tones puts its whole range into `k−1` gaps → `gapFrac → 1`.
* A continuously shaded surface spreads `n` samples over the range → `gapFrac → ~(k−1)/n`.
* Invariant to sort order, so lean, rib phase and silhouette registration cannot enter.
* Invariant to any affine change of luma, so exposure, albedo and tone-curve gain cannot enter.

## 5. The threshold — computed from the arms, not authored

Both controls are built on **this face's own N·L sequence** (lathed ribs, taper and lean
included), at **the subject's own tonal range and its own measured noise**, and they are the two
ends of one continuum:

```
profile(λ) = base + amp · [ (1−λ)·norm(slyRamp(N·L)) + λ·norm(clamp(N·L,0,1)) ] + N(0, σ)
```

`λ = 0` is the POSITIVE control (an ideal three-band cel ramp at the shipped `TUNE`), `λ = 1` is
the NEGATIVE control (ideal smooth Lambert). Each endpoint is affine-normalised to the same
`[0,1]` before mixing, so `λ` is a pure shape parameter and neither endpoint has a knob the other
lacks. `λ` is literally *what fraction of the shading response is continuous*.

**DECISION POINT: λ = 0.5**, i.e. the subject bands iff `gapFrac(subject) > G(0.5)`, where `G` is
the ensemble-median `gapFrac` of the mixture. This is the only threshold equidistant from the two
arms — the midpoint of the sole two references that exist — and it restates the critic's charge
exactly: "soft Lambert with a slight posterize" *is* the claim λ > 0.5.

Nothing in the decision is authored. `G(0.5)` is computed at run time from the arms.

### Nuisance scales taken from the capture

* `amp` = p98 − p2 of the dy = 0 profile.
* `σ` = median over x of the sd across the nine sheared rows.

Both are fed **identically to both arms**, so neither can favour an endpoint. `σ` is
verdict-neutral by construction: it measures variation *along* the column while the statistic
reads *across* it. It is expected to be a mild **under**-estimate (the flutes run vertically), so
the control arms get slightly less noise than the subject carries, which pushes `G(0.5)` **up** —
conservative against declaring "it bands".

### Ensemble

`6 rib sampling phases × 6 noise seeds = 36` deterministic realisations per λ; λ on a 21-point
grid from 0 to 1.

## 6. MUST-FIRE assertions (registered; failure ⇒ the run is VOID/blind, not "smooth")

| # | Arm | Assertion |
|---|-----|-----------|
| 1 | calib-banded vs calib-smooth | `min(gapFrac \| λ=0) > max(gapFrac \| λ=1)`. If the two ideal endpoints overlap, no threshold between them exists and every subject number is meaningless. |
| 2 | well-posedness | `G(0) > G(0.5) > G(1)` on ensemble medians, or λ̂ cannot be inverted and the verdict is undefined. |
| 3 | noise / §220 null | The verdict must be identical on all nine rows y−4…y+4, sheared along the column's own screen axis. Rows disagreeing ⇒ **INDETERMINATE**, never "banded". |

Note assertion 1 is a statement about *arms*, with no authored constant anywhere in it. That is
the specific repair to the void run: the previous assertion compared an arm to a number someone
had guessed; this one compares an arm to the other arm.

## 7. Operating envelope, measured before the capture was read

`--arm=envelope` reads no PNG. Ideal-endpoint separation vs the noise/range ratio:

| noise/range | λ=0 (min..max) | λ=1 (min..max) | separated |
|---|---|---|---|
| 0.000 | 0.473..0.538 | 0.057..0.063 | YES |
| 0.010 | 0.427..0.559 | 0.075..0.131 | YES |
| 0.020 | 0.361..0.573 | 0.078..0.131 | YES |
| 0.030 | 0.297..0.538 | 0.069..0.139 | YES |
| 0.050 | 0.229..0.452 | 0.052..0.124 | YES |
| 0.080 | 0.094..0.285 | 0.049..0.114 | **no** |
| 0.120 | 0.062..0.119 | 0.047..0.094 | no |

**Breakdown at noise/range ≈ 0.08.** The subject is measurable only below that; the measured
ratio is reported in the subject arm and assertion 1 enforces it.

Two things worth reading off this table before any subject number exists:

* the ideal *banded* endpoint scores ~0.50, not ~1.0 — that is `termSoft` populating the ends of
  each gap, and it is why an "ideal" reference had to be computed rather than assumed;
* the ideal *smooth* endpoint scores ~0.06, not ~0.01 — that is the ribs making N·L revisit the
  same values, which concentrates a continuous profile. Modelling the ribs made the NEGATIVE
  control harder to beat, which is the direction that costs the fix, not the direction that
  flatters it.

## 8. If the verdict is "DOES NOT BAND"

The fix is made in `src/render/ToonMaterial.js` / `src/render/shaders/*` only, and is proved with
the same instrument on a fresh capture, plus a **two-boot null arm** (§220): the drift floor
quoted here is intra-frame and does not bound capture-to-capture drift. Any shader edit is
verified to have reached the compiled GLSL via `progress/records/glslink.mjs` (§219), because
§210.2 has already burned one run on a lever that never reached the shader.
