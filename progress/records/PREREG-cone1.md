# PREREG-cone1 — the guard cone heading, judged on the shipped camera

Task #14, blocked since the guard camera went under review and unblocked by §201. `RESULT-geocert2.md`
withdrew the arithmetic objection that held it up; this seal tests whether a **rendered capture**
agrees with that arithmetic, which the geocert result explicitly declined to assert on its own.

**SEALED 2026-08-07, after instrument validation, committed BEFORE the A/B boots.**

## 0.1 How this instrument was validated, and the two versions that failed

This seal was drafted, demoted, and re-sealed. Recorded because the failures were caught for the
price of my time rather than a capture:

- **ROI v1** (apex-derived, `x[120,1180] y[330,610]`, warm > 8): validated against the committed
  `a2` frames — the SAME 0.35-vs-−0.20 lever on the old camera — it read **0.71–0.87**, i.e. it
  claimed the candidate puts LESS cone in frame, contradicting both the arithmetic and a2's own
  scoring. Too broad, dominated by ambient sand, reaching where no cone falls.
- **ROI v2** (from geocert2's projected pool bbox, `x[0,680] y[290,719]`, warm > 8 ∧ L > 60):
  **190,449 warm-bright px on a base frame, 65 % of its own area.** Saturated by lit desert floor.
- Neither could be validated further, because a new-camera ROI cannot be checked against
  old-camera frames.

So `cone0.mjs` ran **base-only** — three prerolls, `base`, `restore`, no candidate arm — purely to
place the ROI on evidence. A base-only look reveals nothing about the candidate, so the bands below
remain honest.

**Measured on that base frame**, saturation across candidate regions and thresholds:

| region | area | warm>8 ∧ L>60 | warm>8 ∧ L>120 | **warm>20 ∧ L>150** |
|---|---|---|---|---|
| x[0,667] y[295,660] | 243,455 | 75.0 % | 21.9 % | **0.2 % (467 px)** |
| x[0,560] y[300,520] | 123,200 | 89.2 % | 33.3 % | 0.4 % |
| x[0,667] y[295,719] | 282,808 | 69.7 % | 18.9 % | 0.2 % |

**Chosen: `x ∈ [0, 667], y ∈ [295, 660]` at (R−B) > 20 ∧ L > 150.**

The region is the **discriminating band** — where geocert says the candidate has cone
(`y[295,720]`) and the base does not (`y[664,720]` only) — so the bottom strip both share is
excluded and cannot dilute the ratio. The threshold isolates bright warm light from ambient warm
floor: at 0.2 % the base has enormous headroom, where every looser threshold was 20–90 % full.

**That 467 px is also a finding in its own right.** It says the shipped cone is essentially absent
from the band it should occupy — independently corroborating geocert's 0.7 % pool share from a
rendered frame rather than arithmetic, and it is the design complaint §7.2 raises, measured.

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

**Ground ROI** — `x ∈ [0, 667], y ∈ [295, 660]`, threshold (R−B) > 20 ∧ L > 150. Derivation and
the two rejected versions are in §0.1. Base reference measured at **467 px (0.2 %)**.

| id | quantity | band on `cand` |
|---|---|---|
| **C1** | ROI bright-warm px, ratio `cand / base` | **≥ 2.0** |
| C2 | ROI bright-warm px, absolute on `cand` | **≥ 2000** (0.8 % of the region — a pool a viewer can actually see, which is what §7.2 asks for) |
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
