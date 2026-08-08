# PREREG-grain1 — is the screen grain what makes the toon ramp invisible?

**SEALED before capture.** Follows directly from `RESULT-ramp1.md`, which answered its own question
(the hemispheric fill is not the cause) and produced a larger one by accident.

## 0. Why this seal exists, stated against my own last one

`PREREG-ramp1` was careful in the wrong place. It recorded evidence against its hypothesis, bracketed
the lever, registered falsifiers, and passed every gate — while measuring with an instrument that
**could not detect the phenomenon it was built to find.** Median adjacent-pixel |ΔL| on all four
scored ROIs was **1.43–1.86 luma**, above the 1.0 threshold the flat-area metric uses, and it barely
moved when the fill was switched off entirely.

Removing only per-pixel noise from those same rows, with a median filter that leaves step edges
intact, took flatness from 20–32 % raw to **70–85 %** on the *shipping* build:

| ROI | raw | k=4 median-filtered |
|---|---|---|
| R1 `sly-startle` | 20.5 | 70.3 |
| R2 `temple` | 21.6 | 79.5 |
| R3 `interior` | 32.0 | 74.5 |
| R4 `courtyard` | 25.4 | **85.3** |

**Prediction under test: the ramp is already there and the grain is hiding it.** Critic pass 7's
defect 1 ("no toon ramp anywhere") would then be a *symptom* of its defect 2 ("a screen-space grain
sits on everything"), not an independent finding.

## 1. The lever

`debug.grainScale`, multiplying `PostFX.tune.grain` (shipping 0.016) at the composite. In-page only,
default 1 bit-identical to shipping.

| arm | grainScale | role |
|---|---|---|
| `preroll1..3` | 1.0 | discarded — compile and the §198.1 early-boot transition |
| `base` | 1.0 | shipping |
| `g00` | 0.0 | grain off |
| `restore` | 1.0 | determinism; must reproduce `base` |

Four shots per scored arm, the same four `RESULT-ramp1` scored: `sly-startle`, `temple`, `interior`,
`courtyard`. Same ROIs, restated from critic pass 7 and unchanged.

## 2. The instrument, and the one change from ramp1

**RAW FLAT fraction** — share of adjacent horizontal pairs with |ΔL| < 1, L = Rec.709 on 0–255 bytes.
No median filter. That is the point: ramp1 already showed a filter reveals the structure, and the
question here is whether the *shipped pixels* carry it.

Also reported per arm, because ramp1 showed it is the quantity that actually gated the metric:
**median adjacent |ΔL|** on each ROI row.

## 3. Registered bands, on `g00`

| id | quantity | band |
|---|---|---|
| **G1** | mean RAW FLAT across R1–R4 | **≥ 60 %** confirms the ramp is present and the grain was hiding it |
| G2 | median adjacent |ΔL|, mean across R1–R4 | **≤ 0.8** — the noise floor must actually drop below the metric's threshold |
| G3 | frame-wide flat-colour area on `sly-startle` (critic's 5×5 ≤ 2 luma) | **≥ 6.0 %** from 1.2 % |
| G4 | R4 `courtyard` RAW FLAT | ≥ 75 %, the shot the k=4 filter put highest |

## 4. Falsifiers — revert, do not defend

- **P-F1** If G1 lands **below 40 %**, the grain is NOT the primary concealer, the ramp1 median-filter
  inference is recorded as **overstated**, and the next suspect is the ramp's band positions against
  the `N·L` range these surfaces span. No grain change ships on this seal.
- **P-F2** If `g00` and `base` differ by **< 10 points** of raw FLAT on every ROI, the lever did not
  reach the composite ⇒ **UNSCOREABLE**.
- **P-F3** `restore` vs `base`, frame-wide differing px > 0 ⇒ **VOID**.
- **P-F4** any arm's `grainScale` not read back equal to its registered value ⇒ that arm VOID.
- **P-F5** scored arms not sharing one boot token ⇒ **VOID**. *(Minted by the runner; the engine has
  no `bootId` — see the amendment in `PREREG-ramp1.md` §4.)*
- **P-F6** G2 must fall. If the median |ΔL| does **not** drop with the grain off, the grain is not
  the source of that noise floor and every inference resting on it is withdrawn ⇒ **UNSCOREABLE**.

## 5. What a PASS licenses, and what it does not

A pass licenses **removing the grain from the character materials and from the composite**, which is
critic defect 2's own recommendation, and it would mean the shading does not need rebuilding.

It does **not** license declaring critic defect 1 closed. The critic's complaint was partly about
*band positions and count* — "a hard shading step at the cheek", "2–3 hard steps" — and a frame can
have 85 % flat area with its terminators in the wrong places. Whether the frame now reads as cel art
is a look judgement on the frames, made by a critic, not by this metric.

**And the grain exists for a reason**: `PostFX.js:622` calls it "the only thing keeping the sky
gradient off bands". Critic pass 7 measured `night`'s sky at 18 luma levels with 77/249 zero deltas —
banded *anyway* — so that defence is already weak, but removing the grain must be checked against
sky banding before it ships. That check is `G5`, reported and not gated: **distinct luma levels down
a 250-row sky column in `courtyard`, base vs g00.**

## 6. Files

`PREREG-grain1.md` (this file), `progress/records/grain1.mjs`, `progress/records/grain1-score.mjs`,
committed before the boot. Then `progress/records/grain1/` frames + `readback.json` + `score.json`,
`logs/grain1.log`, and `RESULT-grain1.md`.
