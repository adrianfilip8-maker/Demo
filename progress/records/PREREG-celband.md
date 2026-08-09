# PREREG-celband — the albedo carries continuous noise where cel wants discrete steps

Sealed before `src/textures/Canvas2D.js` or `src/textures/Bake.js` contain any part of the
candidate. Everything below is written against measurements of the **shipped** build only.

Owner: TEXTURES. Target: critic 9 **D6** ("environment surfaces carry painterly/photographic noise
where cel wants flat"). D7 is measured in the same run and **is not claimed** — see §7, which
records a refutation of my own starting premise.

---

## 1. The instrument, and the calibration that says it is the critic's instrument

`tools/celsurf.mjs`. D6 quotes one statistic that is recoverable exactly from the review —
*"the fraction of pixels in a truly flat 3×3 neighbourhood is 0.15–0.18 in
`hero`/`courtyard`/`temple`/`traversal` versus 0.296 in the reference"* — and "truly flat" is not a
definition. Nine candidate definitions were run against those five published numbers **before the
candidate existed**:

| definition | hero | courtyard | temple | traversal | ref-venice |
|---|---|---|---|---|---|
| rec709, rounded, span 0 | 0.0216 | 0.0106 | 0.0075 | 0.0399 | 0.0956 |
| rec709, raw, span ≤ 1 | 0.0508 | 0.0367 | 0.0348 | 0.0862 | 0.1742 |
| **rec709, raw, span ≤ 2** | **0.1549** | **0.1506** | **0.1770** | **0.1833** | **0.2950** |
| rec601, rounded, span ≤ 2 | 0.2172 | 0.2147 | 0.2529 | 0.2355 | 0.3491 |
| mean-RGB, rounded, span ≤ 2 | 0.1796 | 0.2181 | 0.2344 | 0.2271 | 0.3387 |
| RGB all-equal | 0.0029 | 0.0006 | 0.0002 | 0.0053 | 0.0779 |

Exactly one puts all four of ours inside "0.15–0.18" **and** the reference on 0.296:
`L = 0.2126R + 0.7152G + 0.0722B` on 0..255 floats, unrounded, flat ⇔ 3×3 span ≤ 2.0. That is the
definition `celsurf.mjs` implements. The reference is `sly3-venice.jpg` decoded once to PNG (the
decode is in the scratchpad and is not committed).

**Registered as the instrument's own falsifier:** if a later reader re-runs the sweep and a second
definition also reproduces all five numbers, the calibration is ambiguous and every threshold below
is void.

D6's per-surface table (`hero` temple wall 3.66, `dunes` pylon 5.97, …) is **hand-placed and not
recoverable**, and guessing those ROIs after seeing which frames failed is the re-scoping §141.1
forbids. It is reproduced instead as a *distribution*: every 64×64 window on a 32-px grid whose
CIELAB (a\*,b\*) standard deviation is ≤ 4.0 (one material) and whose mean L\* ≥ 20 (not
near-black), summarised by percentiles. Baseline, shipped `shots/r9/`:

| frame | flat | grad p10/p50/p90 | top3 p50 | levels p50 | n windows |
|---|---|---|---|---|---|
| `hero` | 0.1549 | 0.65 / **1.41** / 4.03 | 0.281 | 19 | 82 |
| `traversal` | 0.1833 | 0.22 / **1.12** / 4.63 | 0.334 | 18 | 116 |
| `courtyard` | 0.1506 | 0.78 / **1.02** / 3.08 | 0.337 | 15 | 57 |
| `temple` | 0.1770 | 0.67 / **1.07** / 2.50 | 0.236 | 25 | 86 |
| `dunes` | 0.3616 | 0.16 / **0.54** / 0.80 | 0.356 | 13 | 228 |
| `interior` | 0.1377 | 0.82 / **1.52** / 3.42 | 0.252 | 20 | 195 |
| **REF-venice** | **0.2950** | 0.18 / **0.30** / 0.52 | 0.337 | 19 | 135 |

The four D6 frames sit at **3.4–5.1× the reference's median window gradient** and at
**0.51–0.62× its flat share**. `dunes` does not: at the window level it is already close to the
reference, which disagrees with D6's hand-placed "pylon 5.97" row. That disagreement is recorded
now, before any candidate, and `dunes` is carried as a **do-no-harm** frame rather than as a target.

## 2. Where the noise is — measured on the layer TEXTURES owns

`tools/celtex.mjs` runs the same statistics on the built **albedo**, offline, at mip 2 (one sample
per two texels — a 3.4 m tile at 1024 is 6.6 mm/texel against the ~8 mm/px the architecture is seen
at in `hero`). Eighteen recipes, shipped constants:

```
mean over 18 recipes:  grad 6.03   top3 0.100   levels>1% 32.2   flat 0.0717
worst: gold_hammered 26.4 · wood_old 14.1 · gold_leaf 10.9 · plaster_painted 9.7
best:  bronze_aged 1.15 · limestone_polished 2.22 · sandstone_block 2.54
```

Against the reference **frame**'s 0.337 / 19 / 0.295. The albedo is 3–5× less concentrated in its
top three levels than the frame we are trying to match, and lighting can only spread a distribution
further, never concentrate it. **The albedo is therefore a sufficient cause of D6 on its own**, and
that is the claim this run tests.

## 3. The candidate: a value lattice, not less amplitude

The obvious lever — turn the noise amplitude down — is **declined**, and the ledger says why: the
`sandstone_worn` header records that this recipe is already 3.2× quieter than the control at the
frequency that competes with a terminator, and §69/§70 record the blotching regression that more
albedo variance produced. AGENTS §2.1.7 requires visible brush/chisel character. Flat is not the
goal; **few, discrete, hard-edged value steps** are.

`celband(surface, { steps, radius, keep })`, run once per recipe after `build()` and before
`derive()`:

1. `y` = luma. `sm` = `y` box-blurred at `radius`, wrapping (the tile is a torus).
2. snap `sm` onto a lattice of `steps` values spanning the surface's own p02..p98, extended at the
   same spacing beyond both ends (**not clamped** — clamping would pile every crevice onto one
   value and lift the dark tail).
3. `y' = lattice(sm) + (y − sm) · keep`, then clamped into the surface's **own** existing
   [min, max].
4. RGB scaled by `y'/y`, so hue and chroma are untouched; scale reduced if a channel would clip.

Three invariants are preserved **by construction**, not by hope:
- **`rampFloor`'s crevice floor / `darkTail`** — step 3 cannot put a texel below the surface's own
  minimum, so no recipe can acquire a dark tail it did not already have.
- **`hueGrade`** — the operator is a per-texel luma scale, so every hue and every chroma ratio the
  grade authored is unchanged.
- **height, normal, AO, roughness** — `s.h`, `s.occ` and `s.rough` are not read or written. All
  relief survives at full detail; only the *painted value* is banded. That is the answer to "dead
  flat looks like plastic": the surface is not flat, its colour is.

**Scope:** groups `stone`, `carved`, `metal`, `organic`. **Not** `fx` (alpha/emissive sprites and
decals) and **not** `sly` (D3 is CHARACTER's, and §267 shipped a surface split there this week).

### Parameter derivation

Offline sweep, nine high-coverage recipes, mip 2, means:

| arm (steps:radius:keep) | grad | top3 | levels | flat |
|---|---|---|---|---|
| shipped | 5.02 | 0.069 | 37.4 | 0.0318 |
| 6:0:1 (snap raw luma) | **5.22** | 0.476 | 18.6 | 0.2802 |
| 6:2:0.25 | 4.14 | 0.403 | 15.9 | 0.3140 |
| 6:3:0.25 | 3.70 | 0.362 | 17.4 | 0.3045 |
| 8:3:0.25 | 3.60 | 0.289 | 19.6 | 0.2443 |
| 6:3:0.0 | 3.19 | 0.552 | 15.0 | 0.3855 |
| 8:2:0.4 | 4.30 | 0.286 | 18.9 | 0.2248 |
| **5:4:0.25** | **3.41** | **0.380** | **16.3** | **0.3228** |

**Snapping the raw luma makes the gradient WORSE** (5.02 → 5.22): noise of amplitude comparable to
the step maps adjacent texels onto different lattice levels, so total variation goes up. That is why
the operator snaps the *smoothed* value. It is the one thing in this design that was wrong in the
first draft and is recorded here rather than quietly fixed.

Selection rule, fixed before the sweep was read:
- the albedo's `top3` must be **≥ 0.337** and its `levels>1%` **≤ 19** — the reference frame's own
  values, because lighting can only spread a distribution;
- `keep > 0` — a constraint given to this work before it started ("dead-flat surfaces at this scale
  look like untextured plastic") and independently supported by §69/§70;
- among survivors, **lowest mean gradient**.

Winner: **`steps 5, radius 4 at size 1024 (= size/256), keep 0.25`**. `6:3:0.0` scores lower on
gradient and is excluded by the `keep > 0` constraint, not by its score.

## 4. Arms

All three are procedural (`VITE_TEX_BAKED=off`) so no arm depends on the committed blob, and all
three are the same tree. Shots: `hero, traversal, courtyard, temple, dunes, interior`.

| arm | build | role |
|---|---|---|
| **A0** | `VITE_TEX_AB=celband` | CONTROL — stage off. Must reproduce the r9 baseline for the four D6 frames within the boot-to-boot floor. |
| **A1** | (default) | TREATMENT — `5 / size÷256 / 0.25`. |
| **A2** | `VITE_TEX_AB=celbandsoft` | **CALIBRATION, MUST FIRE** — same stage at `keep = 0`, i.e. dead-flat plateaus. |

**A2 is the sensitivity arm and it is not a candidate.** If A2's frame flat share does not exceed
A0's by ≥ 0.04 on the mean of the four D6 frames, then the texture layer is not reaching the frame
in a quantity this instrument can see, and **every other verdict in this run is VOID** — including a
null. A null arm proves repeatability, not sensitivity.

## 5. Registered outcomes (`tools/gate.mjs`, tri-state)

`F` = mean over `hero, traversal, courtyard, temple` of the frame-wide flat share.
`G` = mean over the same four of the window-gradient p50.
Baselines from §1: `F₀ = 0.1665`, `G₀ = 1.155`. Reference: `F_ref = 0.2950`, `G_ref = 0.30`.

| id | quantity | bar | basis |
|---|---|---|---|
| **C1** | A2 `F` − A0 `F` | **≥ 0.04** | calibration, MUST FIRE, else all VOID |
| **C2** | A0 vs `shots/r9/` on the four frames | \|Δ`F`\| ≤ 0.010 | the control is the shipped build |
| **P1** | A1 `F` | **≥ 0.2093** | closes ≥ ⅓ of the measured gap `F₀ → F_ref`. A change that closes less than a third of a gap this large does not earn a 25 MB blob rewrite. |
| **P2** | A1 `G` | **≤ 1.048** | closes ≥ ⅛ of the gap `G₀ → G_ref`. Deliberately weaker than P1: §3's own sweep shows a lattice can *raise* total variation, so this is the axis the mechanism is least sure of. |
| **P3** | A1 `dunes` `F` | **≥ 0.3436** | do no harm — within 0.018 (5 %) of its 0.3616 baseline. |
| **P4** | A1 `interior` `F` | **≥ 0.1377** | do no harm on the one frame critic 9 rated as working. |
| **S1** | A1 cross-class albedo confusion (`celtex`) | ≤ A0 + 0.01 | D7 must not be paid for. Reported, not gating. |
| **S2** | every recipe's `jointSign.dY` | < 0 | build-time invariant. A positive dY is `paving_courtyard`'s pale-grid bug. **Blocking.** |
| **S3** | every recipe's `darkTail` (`texlab`) | = its A0 value | §3's construction claim, measured. **Blocking.** |

**Ship iff C1 fires, C2 holds, P1 and P2 and P3 and P4 all pass, and S2/S3 hold.** P1 or P2 failing
alone is DO NOT SHIP: a change that flattens the histogram while raising the gradient is the
"Okami-via-Borderlands" failure with a different texture on it.

## 6. Falsifiers, stated as things that would make me withdraw the claim

1. **A2 does not fire** → the mechanism claim ("the albedo is a sufficient cause of D6") is
   untestable in this build and the run is VOID. Not a pass.
2. **A1 raises `G`** → the lattice is converting noise into step-flicker at frame scale, exactly the
   `6:0:1` failure, and the operator is wrong even if `F` improves.
3. **A0 does not reproduce r9** → another agent's work landed inside my window; nothing is
   attributable and the run is VOID.
4. **`interior` or `dunes` drops** → the change is not free, and §269 has already shown what it
   costs to break the one frame that works.

## 7. D7 is measured here and **the premise I was given is refuted**

My brief asked me to make sandstone / granite / gold / plaster / painted separable. `celtex.mjs`
says they already are, **in the albedo**, before any light:

```
cross-class pairs (18 recipes, 8 classes):  mean confusion 0.103   mean separation 3.25
                                            only 3 of 126 pairs at confusion ≥ 0.30
gold_leaf  vs sandstone_block   dE 26.0    granite_pink vs sandstone_block  dE 28.9
plaster    vs sandstone_block   dE 27.0    granite_pink vs limestone        dE 43.7
gold_leaf  vs granite_pink      dE 52.6    bronze_aged  vs sandstone_block  dE 18.1
```

Critic 9 measures the same materials **in frame** at ΔE 2.1–6.2. The albedo separates them at
18–53. **D7 is not an authoring defect; it is destroyed between the albedo and the frame**, which is
what the review's own §4 says and what §269 then measured directly. And it cannot be bought back
from this file: the entire AGENTS §2.2 palette spans ΔE 116 end to end and only ΔE 31 from sandstone
mid to gold mid, so recovering a factor of five in frame ΔE would need albedo separations the
palette does not contain.

**So no D7 change is proposed, and S1 exists only to prove this run does not make D7 worse.**

## 7a. AMENDMENT 1 — the frame set is cut from six to two, before any candidate frame exists

Written and committed **before the first capture**, for a cost reason stated in `shot.mjs`'s own
header: *"~14 s per frame at 1280×720/high, a `setShot` is 17 frames, so one shot is 4–6 minutes
and a full ten-shot set is 40–60 minutes of exclusive hold"*, and *"a 10-shot run is a decision to
block everyone else for an hour"*. Three arms × six shots is ~90 minutes of exclusive hold with
three other agents queued behind it. That is not a defensible use of a shared FIFO.

**Shots: `hero` and `interior` only.**

- `hero` is the D6 target: the worst window gradient in the set (p50 **1.41**, p90 **4.03**) and
  the frame D6 names first. `F` and `G` are redefined on it alone.
- `interior` is the do-no-harm watchdog **and** a second target. `RESULT-grain1.md` closes with
  *"there is a second, texture-level noise source in the interior materials, and it is not this
  pass's lever. Filed for follow-up."* This is that follow-up, and `interior` is the frame §269
  named as the one working relationship in the game — so it is exactly the frame a texture change
  must not break.

Revised table. Baselines from §1 (`shots/r9/`): `F₀ = 0.1549`, `G₀ = 1.41`, `interior F = 0.1377`.

| id | quantity | bar | basis |
|---|---|---|---|
| **C1** | A2 `F` − A0 `F` on `hero` | **≥ 0.04** | calibration, MUST FIRE, else all VOID |
| **C2** | A0 `F` vs `shots/r9/hero.png` | \|Δ\| ≤ 0.010 | the control is the shipped build |
| **P1** | A1 `F` on `hero` | **≥ 0.2016** | closes ≥ ⅓ of `F₀ → F_ref` (0.1549 → 0.2950) |
| **P2** | A1 `G` on `hero` | **≤ 1.2713** | closes ≥ ⅛ of `G₀ → G_ref` (1.41 → 0.30) |
| **P4** | A1 `F` on `interior` | **≥ 0.1377** | do no harm on the frame that works |
| **S1/S2/S3** | unchanged | | |

**P3 (`dunes`) is withdrawn, not left to VOID.** `dunes` is not captured, so its guard cannot be
evaluated, and §263.1's lesson is that an unevaluable guard must never be allowed to read as a
pass. It is removed from the ship rule here, in writing, rather than scored as VOID later.

**Ship iff C1 fires, C2 holds, and P1, P2, P4, S2, S3 all pass.**

Forecast, recorded now so it can be scored: `interior` improves *more* than `hero` in `F`, because
`RESULT-grain1` measured it as the one surface where the composite grain was **not** the dominant
noise source (R3 moved 32.0 → 39.8 against 20.5 → 63.3 elsewhere), which is what "the remaining
noise is in the textures" predicts.

## 7b. AMENDMENT 2 — the armTook predicate, registered before capture

§46 and §255 are both the same failure: an instrument that cannot distinguish its own two inputs.
The arms here are environment variables, which are invisible in a PNG and identical in the SHA, so
each arm must carry a signature into `report.json`. Two already exist and neither needs new code:

1. `Textures.init()` warns `textures: A/B CONTROL BUILD — treatments disabled: <list>` whenever
   `TEX_AB()` is non-empty. So **A1 must carry `celbandon` in `warnings`, A2 must carry
   `celbandflat`, and A0 must carry no such line at all.**
2. The prewarm warning reports `N baked / M generated`. All three arms run
   `VITE_TEX_BAKED=off`, so **all three must read `0 baked / 23 generated`.** An arm that reports
   `23 baked` read the committed blob and did not run the recipe at all — its texture arm never
   happened, whatever its environment said.

**Both must hold on all three arms or the run is VOID**, ahead of C1. A capture whose arms cannot
be told apart afterwards is not three arms.

## 8. Records

`progress/records/RESULT-celband.md`, `shots/celband/{a0,a1,a2}/`, `logs/celband.log`.
