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

## 8. VERDICT OF THE SUBJECT RUN (recorded here because §9 depends on it)

All three MUST-FIRE assertions passed. `min(λ=0) 0.1513 > max(λ=1) 0.1346`; `G(0) 0.2263 >
G(0.5) 0.1382 > G(1) 0.0784`; all nine rows agree.

```
noise/range ratio       0.0671   (envelope breaks down at 0.08 — inside the envelope, narrowly)
decision point G(0.5)   0.1382
subject gapFrac         0.0795   lambda_hat 0.851
VERDICT                 DOES NOT BAND        (all nine rows, lambda_hat 0.579 .. 1.000)
```

The subject sits on top of the NEGATIVE control's median (0.0784). On the surface with the most
terminator crossings in the frame, the shading is indistinguishable from ideal smooth Lambert.

### Why — and this is not what the defect statement assumed

`tools/bandprobe.mjs`, an independent offline instrument that rasterises the real architecture and
its own ortho shadow map, was run on three shipped captures:

| shot | architecture px | key-lit | step at T=0.14 | its own control | ratio |
|---|---|---|---|---|---|
| temple | 905878 | **14230 (1.57%)** | +6.8 | −7.9 | 0.86× |
| hero | 836843 | 153879 (18.4%) | +23.1 | −2.3 | **10.11×** |
| courtyard | 632704 | 201291 (31.8%) | +21.8 | −1.8 | **12.25×** |
| courtyard T=0.52 | | | +24.8 | −1.0 | **25.07×** |

**Where the key reaches, the ramp bands hard, and always did.** `slyRamp` is not soft. What fails
is everything the key does *not* reach: `key = ramp * sh`, so on a cast-shadowed surface the cel
quantiser is multiplied by zero. `temple` is a roofed hypostyle hall and 97.5% of its architecture
is in exactly that state.

And on such a surface nothing else varies with the normal either. Reading the shader: `fill`
depends only on `hemi = smoothstep(-0.72, 0.55, Nw.y)`; `albAmb`, the shadow multiply and the wash
all depend only on `shadowMix = 1 − key`, which is the constant 1 when key = 0; `spec` is gated by
`sh` and by `step(0.02, ndl)`; `sss` is gated by `sh`. A shadowed vertical column is ONE FLAT TONE
and the only thing moving across it is the fresnel rim — which is the ~50 px ripple visible in the
subject profile, at the ribs' own half-period.

So the correct reading of the critic's complaint is **not** "the ramp is too soft". It is: *the
shade side of the model has no normal-dependent structure at all.*

## 9. THE FIX AND ITS SHIP RULE — registered before the capture

`uShadeBand` / `TUNE.shadeBand`, `src/render/shaders/toon.glsl.js` + `src/render/ToonMaterial.js`:

```glsl
float shadeForm = 1.0 - uShadeBand * ( 1.0 - ramp );
diff = alb*keyRad*key*mix(1,ao,uAoKey)
     + ( albAmb*slyFillX*ao
       + albShadow*slyShadX*shadowMix*mix(0.55,1,ao)
       + slyShadX*uShadowWash*shadowMix*ao ) * shadeForm;
```

`ramp` is the *already computed* `slyRamp(ndl, uBands)`. Reusing it rather than authoring a second
set of thresholds is deliberate: the shade-side bands then line up **across** a cast-shadow
boundary instead of fighting it. The term only ever darkens (≤ 1, floor `1 − uShadeBand`), so it
cannot blow out a shade tone, and it is one scalar on all three shade-side terms alike — it moves
shade **luminance** and cannot move shade **hue**, so the violet/teal balance of §115/§16/§19 is
arithmetically untouched. `uShadeBand = 0` is bit-identical, exactly and driver-independently,
because `1.0 − 0.0·x` is `1.0`; it is spelled that way rather than as `mix()` for that reason.

### Sweep and arms — one boot, `progress/records/celband.mjs`

Capture order per shot: `base-a` (0) → `sb15` → `sb30` → `sb45` → `sb60` → `base-b` (0).
The two base arms bracket the whole sweep, so their difference is the drift floor for the run.
Shots: **temple** (subject) and **courtyard** (guard — the shot where the ramp already works).

### SHIP RULE

Ship the **smallest** `v ∈ {0.15, 0.30, 0.45, 0.60}` satisfying **all** of:

* **(A)** `celcyl` on `shots/celband/temple-sb<v>.png` returns **BANDS** at dy = 0 *and* on all
  nine null rows, with MUST-FIRE 1 and 2 passing.
* **(B)** the move clears the drift floor:
  `gapFrac(sb<v>) − gapFrac(base-a) > |gapFrac(base-b) − gapFrac(base-a)|`.
* **(C)** guard: on `courtyard`, `bandprobe`'s pooled lit-architecture step/control ratio at
  T = 0.14 for `sb<v>` is not below `base-a`'s by more than the `base-a`↔`base-b` null difference
  of that same statistic.

If **no** swept value satisfies all three, **nothing ships**. The run is reported as a failure to
reach the criterion — not re-swept with new values, and not re-scored against a moved threshold.

### VOID CONDITIONS

* **V1 — NULL.** If `base-a` vs `base-b` differ by as much as the candidates do, the instrument
  cannot see the change through the drift. VOID.
* **V2 — LEVER.** If `sb60` does not differ from `base-a` by more than the null on the celcyl
  statistic, the knob is dead and this is §210.2 repeating. VOID. (The harness additionally reads
  `uShadeBand` back *after* the step and the render, and throws if the poke did not survive —
  the `uRimGain` trap.)
* **V3.** Any arm on which celcyl's MUST-FIRE 1 or 2 fails is VOID for that arm.

### Frames get looked at

§3's lesson — "the number was right and the frame was wrong" — applies. The shipped arm's frames
are opened, not just measured.

### Known contamination, stated up front

The working tree carries another agent's uncommitted texture work (`src/textures/Canvas2D.js`,
`Materials.js`), and `tests/textures.test.mjs`'s cache-staleness guard is red because of it —
verified by stashing only my two files and re-running, where it fails identically. Every arm here
is captured in ONE boot off that same tree, so the **within-boot A/B is sound**; what is not
claimed is that `base-a` reproduces `shots/r8/temple.png` byte-for-byte.

## 10. FORECAST — registered while the capture was still queued behind another agent's lock

`celcyl --predict=b` multiplies the *existing* `shots/r8/temple.png` profile by the shade-side
term `1 − b·(1 − slyRamp(N·L))` and scores the criterion against that simulation. It is an
**upper bound** on what `shadeBand = b` can buy, and both of its biases point the same way:

* it multiplies in **display** luma, where the shader multiplies in scene-linear *before* a
  compressive tone curve → the real change is smaller;
* it multiplies the **whole pixel**, where the shader multiplies only the three shade-side terms
  → on any pixel carrying rim or spec the real change is smaller again.

| b | predicted gapFrac | decision point | λ̂ | forecast verdict | margin |
|---|---|---|---|---|---|
| 0.15 | 0.1496 | 0.2172 | 0.706 | DOES NOT BAND | −0.0676 |
| 0.30 | 0.1287 | 0.2506 | 0.892 | DOES NOT BAND | −0.1219 |
| 0.45 | 0.2689 | 0.2619 | 0.483 | BANDS | **+0.0070** |
| 0.60 | 0.3503 | 0.2687 | 0.307 | BANDS | +0.0816 |

**The stated prediction, so it can be wrong: `sb45` fails in frame and `sb60` is the ship — or
nothing ships.** 0.45 clears its decision point by 0.0070 on a bound that is known to be
optimistic, and 0.0070 is a fifth of the nine-row noise spread already measured on the base
(0.0527). A value that only just clears an upper bound is a value that does not clear the real
thing.

Note the **non-monotonicity**: b = 0.30 scores *below* b = 0.15. That is not noise, it is the
mechanism. The band step has to beat the continuous ripple it is competing with before the sorted
profile's gaps consolidate — the fresnel rim puts ~17.7 luma of continuous range across this face,
and the band step is roughly `83·b/2` luma, so the two cross at b ≈ 0.4. **This fix is a
threshold, not a dial**, and any value below that crossover buys nothing at all. If the frames
show a smooth improvement with b instead, this paragraph is wrong and the mechanism needs
rethinking.

## 10a. NIGHT IS A REQUIRED ARM, ADDED BEFORE ANY FRAME EXISTED

Registered while the sweep was still queued, on noticing a gap in §9 rather than after seeing a
result. `TUNE.fillSkyMix`'s own note in `ToonMaterial.js` states the rule this fleet keeps
relearning:

> The acceptance required night to be MEASURED, and night's only evidence was `pkg30`/`pkg50` —
> strictly stronger variants, so night was bracketed rather than measured, and shipping on a
> bracket is the four-of-ten move this fleet keeps refusing.

`shadeBand` is more exposed to night than `fillSkyMix` was, and by construction. At `night`
(tod 0.02) the key is the moon and almost the whole frame is shade, so a term that multiplies the
shade side is a term that multiplies almost every pixel — and it multiplies them *down*. A value
that is right on `temple` could plausibly crush `night` to mud.

**The `celband.mjs` sweep as launched captures `temple` and `courtyard` only.** So, before
anything ships:

* **(D)** a second, separate boot captures `night` at `base-a` → the candidate → `base-b`, with
  its own within-boot null; and the candidate's frames are **opened and looked at**.
* Ship is blocked if `night`'s silhouette read or its overall exposure is visibly destroyed —
  and that is a judgement made on the image, deliberately, because there is no registered numeric
  acceptance for "night still looks like night" and inventing one after seeing the frame is
  exactly the move §141.1 forbids. The honest form is: measure what is registered, LOOK at what
  is not, and say which was which.

## 11. If the verdict is "DOES NOT BAND"

The fix is made in `src/render/ToonMaterial.js` / `src/render/shaders/*` only, and is proved with
the same instrument on a fresh capture, plus a **two-boot null arm** (§220): the drift floor
quoted here is intra-frame and does not bound capture-to-capture drift. Any shader edit is
verified to have reached the compiled GLSL via `progress/records/glslink.mjs` (§219), because
§210.2 has already burned one run on a lever that never reached the shader.
