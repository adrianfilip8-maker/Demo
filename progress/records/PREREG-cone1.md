# PREREG-cone1 — the guard cone heading, judged on the shipped camera

Task #14, blocked since the guard camera went under review and unblocked by §201. `RESULT-geocert2.md`
withdrew the arithmetic objection that held it up; this seal tests whether a **rendered capture**
agrees with that arithmetic, which the geocert result explicitly declined to assert on its own.

> # ⚠ NOT SEALED. This document is DRAFT and must not score a shipping decision.
> 
> Its ROI has been wrong twice, and I cannot validate a third guess without frames from this
> camera. **A base-only exploratory capture runs first** (`cone0.mjs`: three prerolls + `base`,
> no candidate arm), the ROI is placed on what that shows, and only then is this sealed and the
> full A/B run. A base-only look reveals nothing about the candidate, so the candidate bands stay
> honest.
> 
> **Why, in one line:** ROI attempt 1 (apex-derived, 1060×280) read the a2 arms *backwards* at
> 0.71–0.87; ROI attempt 2 (pool-footprint-derived, 680×429) reads 190,449 warm-bright px on a
> base frame — 65 % of itself — so it is saturated by ambient lit desert and is measuring the
> ground, not the cone. Running a sealed capture on an instrument I cannot validate is what
> produced three void captures in the staging series today.

No `src/**` touched by this draft or its runner. No git run by the runner — the coordinator sweeps.

## 0. Provenance — what I had seen before writing these bands

I have seen `geocert2`'s **arithmetic** output on the shipped camera (lit-facing fraction base
0.4155 / cand 0.3923; cone pool in frame base 0.7 % / cand 20.6 %, guaranteed floor 1.3 % / 37.9 %).
I have **not** seen any rendered frame of the candidate heading on this camera — the last cone
captures (`a2`) were on the old camera and their ROI is not transferable.

**This makes the round a genuine test rather than a confirmation**, and it is the reason the
headline band below is stated as a *prediction of the model*, not a target for the lever:

> geocert2 predicts the candidate puts **~29×** more cone pool in frame (20.6/0.7 full throw,
> 37.9/1.3 guaranteed floor). **I do not expect the render to deliver that, and the band says so.**
> The committed `a2` capture ran this same lever on the old camera, where geocert predicted 3.8×,
> and the original seal's own scoring measured **1.08×** rendered. Geometric pool share and
> rendered warm-pixel content are not the same quantity and the historical gap is large.
>
> So the two questions are separated: **C1 gates shipping** at a modest, directional ≥ 1.5 — the
> cone must be meaningfully more present, which is the design claim. **P-F10 tests the MODEL** and
> gates nothing about shipping: if the rendered ratio comes in below 10×, geocert's ~29× is
> recorded as overstated and no future geocert number may carry a shipping argument without a
> capture behind it.

## 1. The lever

`debug.guardTowardCamera`, read by `Guard.js:1832` (`clamp(debug ?? spec.towardCamera ?? 0.35,
-0.6, 0.9)`). **In-page only** — no file is written, so §186's install hazard does not arise and
the in-lock tree pair should be identical by construction.

| arm | toward | role |
|---|---|---|
| `preroll1..3` | 0.35 | **discarded** — compile + the §198.1 warm-up transition |
| `base` | 0.35 | shipped heading |
| `cand` | −0.20 | candidate: cone swung across the lens |
| `restore` | 0.35 | determinism — must reproduce `base` exactly |
| `KBmid` | 0.08 | graded calibration, between base and cand |
| `KBover` | −0.55 | over-swing, gateless |

Camera fixed at the §201-shipped `pos [-13.25, 2.6, 30.5]` / `target [-18.75, 1.1, 28.0]` on every
arm, `tod` 0.10.

**P-F7 is re-formed for this seal, deliberately.** In staging4 the arm was the camera, so reading the
camera back proved the arm took. Here the camera is IDENTICAL on every arm — reading it proves
nothing, and a poke that never landed would produce eight identical frames and a very confident
null (§194's exact shape). The runner therefore reads `debug.guardTowardCamera` back out of the
engine and requires it to equal the arm's value to 1e-6, **and** the camera to be unmoved.

## 2. Protocol

Carried from PREREG-staging4 §2, which produced the series' first scoreable capture: three
discarded prerolls (the first absorbs shader compile, the next two the early-boot state transition
`staging4-floor` measured); `dt: 0` at every `setShot` and `step`; one boot asserted by `bootId` on
every stage; in-lock `srcTree` pair; per-stage wall-time; arm order
`preroll1→2→3 → base → cand → restore → KBmid → KBover`, with `restore` adjacent to `cand` so P-F4
brackets exactly the window the verdict rests on.

## 3. Registered quantities

Conventions per §122.1: L = Rec.709 on 0–255 bytes; warm = (R−B) > +8; differing px at ΣRGB ≥ 4.

**Ground ROI** — `x ∈ [0, 680], y ∈ [290, 719]`.

**This is the second ROI this seal has had, and the first one was wrong** — recorded because
catching it cost nothing here and would have cost a capture later. My first attempt,
`x ∈ [120,1180], y ∈ [330,610]`, was written from the cone's *apex* alone. Running it over the
committed `a2` frames (the SAME 0.35-vs-−0.20 lever, old camera) gave a cand/base ratio of
**0.71–0.87 at every threshold** — i.e. it said the candidate put LESS cone in frame, the opposite
of both the arithmetic and the original a2 scoring. The reason: at 1060×280 it was dominated by
ambient warm sand, and it reached to x = 1180 where no cone ever falls while stopping at y = 610,
above where the base cone actually sits. The prior a2 seal used a narrow purpose-placed strip
(340,280,700,350) for exactly this reason.

The corrected ROI is derived from `geocert2`'s projected pool footprint on THIS camera, extended
to report its in-frame bounding box: base's pool lands at x [1,384], y [664,720] (375 samples);
the candidate's at x [0,665], y [295,720] (11,853). The ROI is their union, and it excludes the
figure column and the upper frame where §198.1 located sky/FX volatility.

| id | quantity | band on `cand` |
|---|---|---|
| **C1** | ground-ROI warm-and-bright px ((R−B) > 8 ∧ L > 60), ratio `cand / base` | **≥ 1.5** |
| C2 | ground-ROI warm-and-bright px, absolute on `cand` | ≥ 3000 |
| C3 | ground-ROI median L, `cand` | [base − 4, base + 40] — the cone should brighten the floor, not darken it |
| C4 | figure-rect median L (820,244,900,625), `cand` | [base − 6, base + 6] — the lever must not regrade the character |
| C5 | cone-air column median L (700,300,850,500), `cand` | [base − 5, base + 12] |

### Base gates (P-F3 — VOID, not FAIL)

Carried from PREREG-staging4 §4.1, the figure-column family that four boots showed reproduces to
0.6 % or better: base `P1 ∈ [15.4, 16.5]`, `P2 ∈ [300, 312]`, `P3 ∈ [88.5, 91.0]`, `P7 ∈ [32, 34]`,
figure-rect medL ∈ [22.7, 23.7]. Guard-mass and doorway-pool medL are REPORTED and gate nothing
(§198.1: boot-dependent by 16 %).

### Determinism

**P-F4: `restore` vs `base`, frame-wide, differing px = 0.** Unchanged from staging4, where it
passed at exactly 0 with three prerolls.

### Calibration

**P-F2:** on C1's ground-ROI warm px, the chain `base < KBmid < cand ≤ KBover` must hold, with
`KBmid` strictly inside `(base, cand)` by ≥ 5 % of the base→cand span. A metric that cannot grade a
graded stimulus is not measuring the lever (§13).

## 4. Falsifiers — revert, do not defend

- **P-F1** any of C1–C5 outside on `cand` ⇒ candidate **not shipped**. No retune.
- **P-F2** the calibration chain fails ⇒ **UNSCOREABLE**, no verdict either way.
- **P-F3** a base gate out ⇒ **VOID**.
- **P-F4** restore-vs-base differing px > 0 ⇒ **VOID**.
- **P-F7** any scored arm's `armTook` false — camera moved OR lever not read back — ⇒ that arm VOID.
- **P-F8** scored arms not one `bootId`, or `srcTreeAtLock ≠ srcTreeAtRelease` ⇒ **VOID**. **No
  source edit while this capture holds the lock.**
- **P-F9** any preroll frame absent or from another boot ⇒ **VOID**.
- **P-F10** *(specific to this seal, and it gates NOTHING about shipping)* if the rendered C1 ratio
  is **< 10×** against geocert2's predicted ~29×, the arithmetic model is recorded as
  **overstated for this lever**, and no future geocert number may carry a shipping argument
  without a capture behind it. This fires independently of whether the candidate ships.

## 5. Decision table

| outcome | action |
|---|---|
| P-F3 / P-F4 / P-F8 / P-F9 | VOID, re-run |
| P-F7 on a scored arm | that arm VOID |
| P-F2 | UNSCOREABLE |
| any of C1–C5 out on `cand` | candidate **not shipped**; report which and by how much |
| all in band, P-F4 = 0, calibration holds | **SHIP** `towardCamera -0.20` into `Guard.js` SPECS.temple; KNOWN_ISSUES entry; task #14 closed |
| C1 < 10× | P-F10 fires alongside whatever else: record geocert as overstated for this lever |

## 6. Files

`PREREG-cone1.md` (this file), `progress/records/cone1.mjs`, `progress/records/cone1-score.mjs` —
all committed before the boot. Then `progress/records/cone1/` frames + `readback.json` +
`score.json`, `logs/cone1.log`, and `RESULT-cone1.md` on scoring.
