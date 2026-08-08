# RESULT-celband — the cel ramp was never soft. It is multiplied by zero.

Criterion registered in `PREREG-celband.md` and committed (`43036e4`) **before** the subject was
read. Instrument: `progress/records/celcyl.mjs`. Cross-check: `tools/bandprobe.mjs` (not mine,
not written for this, and it agrees).

---

## 1. What was inherited, and what was actually wrong with it

The previous run of `celcyl.mjs` was VOID (§228): its POSITIVE control drew three plateaus 85.0
luma apart and was scored "cannot see banding" because its `maxStep` came in at 15.62 against an
authored threshold of 20.

The threshold was not merely mis-derived. **`maxStep` is the wrong statistic for this geometry and
no threshold on it can be right.** `TUNE.termSoft` is a ±0.024 smoothstep and N·L turns slowly on
a cylinder, so a *perfectly* banded face spends pixels in transition and never shows one large
per-pixel step. The instrument now prints that figure directly: **12 of 193 measured pixels (6.2%)
lie inside a ±termSoft window**.

Three further facts, all geometry rather than opinion, kill any criterion built on *where* a band
lands — and the old ray-caster modelled none of them:

| | fact | size |
|---|---|---|
| **Ribs** | `Kit.papyrusColumn` lathes `r(θ) = R(1 + 0.075·cos 8θ)` at ribScale 1, and `computeVertexNormals()` overwrites the pushed cylinder normals with the lobed ones | normal azimuth ±31°, N·L ±0.45, **four** terminator crossings on the measured face |
| **Lean** | `dx = lean·y`; deterministic for the nave (−1.205° on this column) plus a `leanZ` jitter from the level rng | ~13 cm ≈ 11 px of registration error |
| **Taper** | `dr/dy ≈ −0.049` at mid-shaft, so `n.y ≈ +0.049` | N·L offset +0.027 — **larger than `termSoft` itself** |

*Incidental finding:* `Kit.papyrusColumn`'s `spin` does **not** rotate the flutes in world space.
The same `a = j/seg·2π + spin` feeds both the vertex azimuth and `cos(a·lobes)`, so the polar curve
is identical for every `spin` and the crests are welded to world azimuth 0/45/90…° on every column
in the level. Only the 48-gon sampling phase moves. That makes the rib phase *known*, which is why
it could be modelled at all.

## 2. The re-derived criterion, and why it is sound

**Design rule forced by the table above:** the statistic may use the SET of luma values on the
face; it may not use WHERE they fall.

**`gapFrac`** — sort the face's luma profile, trim 2% per tail, sum the `bands−1` largest gaps
between consecutive sorted values, divide by the trimmed range. *How much of the occupied tonal
range is empty.* Sort-order invariant (lean, rib phase, silhouette registration cannot enter) and
affine invariant (exposure, albedo, tone-curve gain cannot enter).

**The threshold is computed from the arms, not authored.** Both controls run on this face's own
N·L — lathed ribs, taper and lean included — at the subject's own tonal range and measured noise,
as the two ends of one continuum:

```
profile(λ) = base + amp·[ (1−λ)·norm(slyRamp(N·L)) + λ·norm(clamp(N·L)) ] + N(0,σ),  quantised to 8 bits
```

λ = 0 is the positive control, λ = 1 the negative, and λ is literally *what fraction of the shading
response is continuous*. The decision point is **λ = 0.5**: the only value equidistant from the two
arms, and a restatement of the critic's own charge, since "soft Lambert with a slight posterize"
**is** the claim λ > 0.5.

This is the specific repair to the void run. The old assertion compared an arm to a number someone
had guessed. Every assertion here compares an arm to the other arm:

1. `min(gapFrac | λ=0) > max(gapFrac | λ=1)` — the arms must separate at all.
2. `G(0) > G(0.5) > G(1)` — or λ̂ cannot be inverted.
3. All nine sheared rows must return the same verdict (§220) — else INDETERMINATE, never "banded".

**Operating envelope, measured with no PNG open** (`--arm=envelope`): the ideal endpoints separate
up to a noise/range ratio of 0.05 and break down at 0.08.

Two numbers in that envelope are worth reading before any subject exists. The ideal *banded*
endpoint scores ~0.50, not ~1.0 — that is `termSoft` populating the ends of each gap. The ideal
*smooth* endpoint scores ~0.06, not ~0.01 — that is the ribs making N·L revisit values, which
concentrates a continuous profile. **Modelling the ribs made the negative control harder to beat**,
i.e. it moved the threshold in the direction that costs the fix, not the one that flatters it.

## 3. Subject verdict — DOES NOT BAND

Nave column (x 8, z −30), row 289, 193 px of lit face at 11.3 m, N·L −0.367 … 0.865, both
terminators, four crossings. The strongest test face in the frame, chosen by crossing count.

```
noise/range ratio       0.0671        (envelope breaks at 0.08 — inside it, narrowly)
MUST-FIRE 1  min(λ=0) 0.1513 > max(λ=1) 0.1346   PASS
MUST-FIRE 2  G(0) 0.2263 > G(0.5) 0.1382 > G(1) 0.0784   PASS
decision point          0.1382
subject gapFrac         0.0795        λ̂ 0.851
VERDICT                 DOES NOT BAND — all nine rows, λ̂ 0.579 … 1.000   (ROW AGREEMENT PASS)
```

The subject sits **on top of the negative control's median (0.0784)**. On the surface with the most
terminator crossings in the frame, the shading is indistinguishable from ideal smooth Lambert.

### 3a. And it is worse than that: the frame is under-resolved

Dry-running the scorer on a uniformly *darkened* copy of the capture moved gapFrac 0.0795 → 0.0986
under a change the statistic is exactly invariant to. The statistic was fine; the controls were
float while the subject was 8-bit, and rounding a compressed range manufactures gaps. Quantising
the controls closes that (`--quant=0` restores the original, both reproducible from one file).

That change was made **after** the base number was known, so its direction is stated: quantising
can only raise the controls' gapFrac, therefore only raise `G(0.5)`, therefore only make "BANDS"
**harder**. It cannot manufacture the verdict it serves — and it did not help:

| instrument | MUST-FIRE 1 | verdict |
|---|---|---|
| `--quant=0`, as registered | 0.1513 > 0.1346 **PASS** | DOES NOT BAND |
| `--quant=1`, faithful | 0.1364 > 0.1500 **FAIL** | not interpretable |

At a tonal range of **17.7 luma**, one 8-bit code is 5.6% of the entire signal, and the ideal
3-band and ideal-Lambert endpoints overlap. So the honest statement is stronger than "it does not
band": **the shading on that column has so little contrast that hard bands are not representable
at 8 bits**, and the corrected instrument refuses to answer rather than returning a number. The
blindness is specific to the *unfixed* frame — every forecast arm passes both must-fires
comfortably, because the fix is what supplies the tonal range.

## 4. Why — and it is not what the defect statement assumed

`tools/bandprobe.mjs` rasterises the real architecture and its own ortho shadow map offline. Run on
three shipped captures:

| shot | architecture px | key-lit | step at T=0.14 | its own control | ratio |
|---|---|---|---|---|---|
| **interior** | 921 600 | **0 (0.00%)** | — | — | no lit px at all |
| **night** | 776 555 | **10 435 (1.34%)** | — | — | too few lit px |
| **temple** | 905 878 | **14 230 (1.57%)** | +6.8 | −7.9 | 0.86× |
| hero | 836 843 | 153 879 (18.4%) | +23.1 | −2.3 | **10.11×** |
| courtyard | 632 704 | 201 291 (31.8%) | +21.8 | −1.8 | **12.25×** |
| courtyard, T=0.52 | | | +24.8 | −1.0 | **25.07×** |

**Where the key reaches, the ramp bands hard, and always did.** `slyRamp` is not soft. What fails
is everything the key does *not* reach: `key = ramp * sh`, so on a cast-shadowed surface the cel
quantiser is multiplied by zero. `temple` is a roofed hypostyle hall and **97.5% of its
architecture is in that state**; `interior` is the extreme — **not one architecture pixel in that
frame is key-lit**, so the cel quantiser contributes nothing to it at all.

The split is not shot-by-shot bad luck, it is roofed-versus-open: every enclosed shot measures at
or under 1.6% lit, both open ones 18–32%. That is also why this defect reads as "the cel shading
does not band" rather than as "some shots are dark" — the shots the critic scores worst are
precisely the ones in which the feature under complaint is switched off.

And nothing else on such a surface varies with the normal either. From the shader: `fill` depends
only on `hemi = smoothstep(−0.72, 0.55, Nw.y)`; `albAmb`, the shadow multiply and the wash depend
only on `shadowMix = 1 − key`, which is the constant 1 when key = 0; `spec` is gated by `sh` *and*
`step(0.02, ndl)`; `sss` is gated by `sh`. **A shadowed vertical column is one flat tone**, and the
only thing moving across it is the fresnel rim — visible in the subject profile as a ~50 px ripple,
at the ribs' own half-period.

So the correct reading of the critic's complaint is not "the ramp is too soft". It is:

> **The shade side of the model has no normal-dependent structure at all.**

The note at `slyShadowBand` blamed flat geometry for §7.3's failures and was half right. The half
it missed is that the quantiser is switched off wherever the sun is.

## 5. The fix

`src/render/shaders/toon.glsl.js` + `src/render/ToonMaterial.js`, one term:

```glsl
float shadeForm = 1.0 - uShadeBand * ( 1.0 - ramp );
diff = alb*keyRad*key*mix(1,ao,uAoKey)
     + ( albAmb*slyFillX*ao
       + albShadow*slyShadX*shadowMix*mix(0.55,1,ao)
       + slyShadX*uShadowWash*shadowMix*ao ) * shadeForm;
```

* reuses the **already computed** `ramp`, so the shade-side bands line up **across** a cast-shadow
  boundary instead of fighting it — and no second set of thresholds enters the project;
* **only darkens** (floor `1 − uShadeBand`), so it cannot blow out a shade tone, and it moves critic
  pass 3's "unlit ≤ 45% of lit" the helpful way;
* **one scalar on all three shade-side terms alike** — it moves shade *luminance* and cannot move
  shade *hue*, so the violet/teal balance of §115/§16/§19 is arithmetically untouched;
* `uShadeBand = 0` is bit-identical, exactly and driver-independently, because `1.0 − 0.0·x` is
  `1.0`. Spelled that way rather than as `mix()` precisely so it does not depend on how a driver
  folds `mix(x,x,a)`.

`glslink` (§219): **LINK OK**, 76 active uniforms; the POISON arm still fails, so the instrument is
not blind.

### Registered forecast, written while the capture was queued

`celcyl --predict=b` multiplies the *existing* capture by the shade term and scores the criterion —
an **upper bound**, because it applies the multiply in display luma rather than scene-linear before
a compressive tone curve, and to the whole pixel rather than only the shade-side terms.

| b | predicted gapFrac | decision point | λ̂ | forecast | margin |
|---|---|---|---|---|---|
| 0.15 | 0.1496 | 0.2000 | — | DOES NOT BAND | −0.0504 |
| 0.30 | 0.1287 | 0.2500 | — | DOES NOT BAND | −0.1213 |
| 0.45 | 0.2689 | 0.2653 | — | BANDS | **+0.0036** |
| 0.60 | 0.3503 | 0.2623 | — | BANDS | +0.0880 |

**Stated so it can be wrong: `sb45` fails in frame and `sb60` ships — or nothing ships.** 0.45
clears an optimistic bound by 0.0036, a fourteenth of the nine-row noise spread (0.0527).

The **non-monotonicity** is mechanism, not noise: b = 0.30 scores *below* b = 0.15. The band step
must beat the continuous ripple it competes with before the sorted profile's gaps consolidate — the
rim lays 17.7 luma of continuous range across this face and the band step is roughly `83·b/2`, so
they cross at b ≈ 0.4. **This fix is a threshold, not a dial.**

## 6. Sweep — PENDING

`progress/records/celband.mjs`, one boot, capture order `base-a → sb15 → sb30 → sb45 → sb60 →
base-b` per shot, on **temple** (subject) and **courtyard** (guard — the shot where the ramp already
works at 12–25× its control). The two base arms bracket the sweep, so their difference is the drift
floor (§220). `sb60` vs `base-a` is the LEVER arm that must fire — the §210.2 dead-knob check made
*before* a verdict rather than after — and the harness reads `uShadeBand` back **after** the step and
the render, so the `uRimGain` revert trap throws instead of quietly producing a baseline.

`night` is a **required** arm (§10a, registered before any frame existed) and runs as a second short
boot: at tod 0.02 the key is the moon and nearly the whole frame is shade, so a term that multiplies
the shade side multiplies almost every pixel, downward. `bandprobe` sizes that exposure exactly —
`night` is **1.34% key-lit**, so ~94% of its architecture takes the full `shadeForm` multiply. It is
the highest-risk shot for this change by a wide margin, and it is the one that has not been seen.

> **Status: the sweep has been queued behind other agents' captures for the whole session and had
> not been granted the lock at the time of writing.** `TUNE.shadeBand` therefore ships at **0**,
> which is bit-identical to the pre-change build. The mechanism, the instrument, the ship rule and
> the forecast are all on the record; the frames are not. Nothing has been shipped on a forecast.

## 7. Honest limits

* **On a flat face the fix is a uniform darkening, not a band.** `shadeForm` is constant wherever
  the normal is, so a wall gets one tone keyed to its orientation — real form, but not plateaus.
  Bands still require a normal that turns. That is the same limit `slyShadowBand`'s note describes,
  and it is not repaired here.
* The subject is one column in one shot. `hero` and `courtyard` were measured only through
  `bandprobe`, and only for the *lit* population.
* `σ` is estimated from row-to-row scatter, and the flutes run vertically, so it is a mild
  **under**-estimate — which raises `G(0.5)` and is therefore conservative.
* The base frame's noise/range ratio (0.0671) is close to the instrument's 0.08 breakdown, and
  under the faithful controls it is past it. Any future comparison at that contrast is not
  measurable with this instrument; the fix is what moves it back into the envelope.
* `npm test` is 215/216. The one red is `tests/textures.test.mjs`'s cache-staleness guard, which is
  another agent's in-flight work in `src/textures/` — verified by stashing only my two files, where
  it fails identically.
