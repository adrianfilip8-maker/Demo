# RESULT — creamfix: V1/V2/V4 and TEXTURES' re-anchored gate all PASS; V3 is VOID at its sealed granularity

Scored against, in the coordinator's order of authority: (1) `PREREG-creamfix.md`;
(2) `ADDENDUM-creamfix-phase.md` (sealed before frames existed, governs V3 given §28);
(3) TEXTURES' `ADDENDUM1-blueskew-albedo.md` §4 re-anchored gate.

**Provenance.** Boot tree `d0f781c`, dirty `["?? progress/records/PREREG-rimstarve.md"]` (a records
file, no `src/` change), 2026-08-02T14:48:50Z. **Booted ~12 minutes before §28's clock fix
(`3566311`), so its arms are unpinned by construction.** 11 frames, one boot: `night` ×
{base, f050, baseB}, `sly-closeup` × {base, f035, f050, f065, nS, nF, neutral, baseB}.

---

## 0. PHASE — the addendum's falsifier, scored first because it decides how everything else is read

| shot | `base` vs `baseB`, whole frame, raw | verdict |
|---|---|---|
| `night` | **181,071 px (19.65% of frame)**, max Δ 139 | DRIFT |
| `sly-closeup` | **245,674 px (26.66% of frame)**, max Δ 208 | DRIFT |

**A finding the addendum pre-registered as one:** the seal predicted `sly-closeup` has *no animated
emitters*, so PHASE = 0 was the expected outcome there. It is 26.66%. The verdict frame is noisier
than its seal assumed.

### The result that makes this run readable at all, and it corrects my own working assumption

I expected the phase floor to void the verdicts, because the arms under test move **fewer** whole-frame
pixels than a same-setting duplicate does (`f035/f050/f065` = 168k/208k/233k against a 245,674 px
floor) — the exact shape that voided goldonset. **That inference was wrong, and the reason is worth
more than the numbers:** *which statistic you choose decides whether phase matters.*

Measured **non-circular** nulls — the same ROI statistic on `base` vs `baseB`, **unmasked**, so the
population is not conditioned on the two arms agreeing:

| ROI | NULL `base`→`baseB` | effect at the verdict arm | ratio |
|---|---|---|---|
| TAIL-LIGHT-SHADOW (cream, V1) | **1.0** | −88.0 | 88× |
| TAIL-DARK (rings, V2) | **1.0** | −49.0 | 49× |
| MUZZLE-CREAM (replicate) | **0.0** | −57.0 | >114× |
| WALL-SHADOW (V5 certifier) | **0.0** | −77.0 (neutral) | >154× |
| PAVING-SHADOW | **0.0** | −75.0 (neutral) | >150× |

A median over 1,000–12,000 px is nearly immune to small-amplitude, spatially scattered phase
perturbation; a "did this pixel change at all" count is maximally sensitive to it. So the
**pixel-count legs are phase-dominated and the median legs are not.** V1/V2/V4/V5 are readable;
V3, which is a pixel-count claim, is not.

### Declared deviation from the frozen reader — an instrument correction, NOT a band re-anchor

`creamfix-read.mjs` applies the dilated temporal mask to every statistic. On `sly-closeup` that mask
excludes **2,965 of the 3,000 px** in the V1 box (98.8%), leaving **n = 0**, and the reader correctly
refused to score, printing *"ANOMALY — INSTRUMENT CHECK FIRST"*. The instrument check:

- The box **does** contain 1,091 cream px raw. The population was destroyed by the mask, not absent.
- The mask exists to suppress phase. On this statistic phase is worth **1.0 count**.

So V1/V2/V5 are scored on the **unmasked** population with **every band exactly as sealed**. I am
removing an instrument that destroys the population and is measurably unnecessary here; I am not
moving a threshold. (§27.5's warning is about re-anchoring a *band* to rescue a result — the bands
below are untouched.)

---

## 1. V4 — night retention. Scored FIRST, per the ledger's binding constraint.

Unmasked, night's staged subject box (697,364)–(784,486):

| arm | b−r |
|---|---|
| `base` | +27.0 |
| `f050` | **+23.0** |
| `baseB` (null) | +28.0 → null = **+1.0** |

- **Direction (b−r must fall from base): PASS** — 27.0 → 23.0, effect −4.0 against a +1.0 null.
- **Retention (f050 b−r ≥ −10): PASS** — +23.0, nowhere near the floor.
- **LOOK (binding, prose): PASS.** `night-base` vs `night-f050` side by side: the subject still reads
  **moonlit-blue**, the world is unchanged, and there is no daylit-subject-against-moonlit-world
  failure. Night is what the cool terms pay for, and it survives at subjW 0.50.

## 2. V1 — the fix lands

Cream population (TAIL-LIGHT-SHADOW), median b−r, unmasked:

| arm | b−r | n |
|---|---|---|
| `base` | +69.0 | 1,091 |
| `f035` | +5.0 | 1,100 |
| **`f050`** | **−19.0** | 1,101 |
| `f065` | −44.0 | 1,079 |

**−19.0 ∈ [−25, −16] → V1 PASS: fix confirmed, ship candidate subjW 0.50.**

The seal predicted the corridor would be crossed between subjW ≈0.45 and ≈0.52. Measured, the
crossing is between 0.35 (+5) and 0.50 (−19). **A pre-registered quantitative prediction, confirmed.**

## 3. V2 — rings hold

Ring population (TAIL-DARK) on the V1 ship arm `f050`: **b−r +27.0** (n 1,650).
Band [+5, +45] → **PASS — navy rings intact.** The model predicted +30 at 0.50; measured +27.
NOTE-tailpalette's ladder stands.

## 4. V3 — VOID at the sealed granularity, PASS locally

**The sealed claim is whole-frame** ("the world is bit-identical"). It cannot be certified here, and
per the coordinator's standing instruction I am not reading through the noise to reach it:

- Whole-frame off-subject diff is a pixel-count statistic, and the phase floor is 26.66% of frame.
- The addendum's null-image test: of **127** 64-px cells carrying an arm diff, **120 also appear in
  the `base`/`baseB` null**. Seven do not (largest: `576,320`, 3,728 px). But a **2-phase null cannot
  establish absence** — a pixel can agree at both bracket phases and differ at a third. That is
  precisely the inference `RESULT-goldonset` §3 records as mine and invalid, and I am not repeating it.

**VOID. What settles it:** a pinned re-run (`step(n, 0)`, §28) in which `base` vs `baseB` is
bit-identical. Then any nonzero off-subject diff is a real scope leak with no ambiguity, and V3's
"0 px" bar becomes exactly the sharp instrument it was written to be.

**Locally, on the two declared off-subject architecture ROIs, there is real positive evidence** — and
unlike the whole frame, these have a measurable null:

| ROI (off-subject, verified single-material) | null `base`→`baseB` | `f035` | `f050` | `f065` |
|---|---|---|---|---|
| WALL-SHADOW (4,400 px) | 74 px | 20 | 20 | 41 |
| PAVING-SHADOW (6,300 px) | 13 px | 3 | 8 | 8 |

Every arm moves **fewer** px than the phase floor in the same box. And both ROIs' median b−r is
**exactly unchanged** across all three subject arms (WALL-SHADOW +35 → +35 → +35 → +35;
PAVING-SHADOW +32 → +32 → +32 → +32; effect 0.0). That is direct support for the seal's mechanism
(`vSlySkin = 0` ⇒ architecture untouched) on 10,700 px — but 10,700 px is not the frame, so it
supports the mechanism without certifying the scope claim.

## 5. V5 — TEXTURES' re-anchored gate (reported; their seal, their call)

Scored against `ADDENDUM1-blueskew-albedo.md` §4, on `WALL-SHADOW` `[922,210]–[962,320]`, luma [26,140]:

- **Validity: PASS.** n = 4,152 (base) / 4,174 (neutral), both ≥ 400. |ΔL| = 3.1 ≤ 15.
  Base-arm b−r = **+35**, deviating **0** counts from the shipped cap5 reading of +35 — so the box is
  uncontaminated by the subject and the right-two-thirds fallback is not needed.
- **S1 landing:** neutral b−r = **−42** (derived centre −38) → **PASS, and inside the `nominal`
  [−58, −18] sub-label.**
- **S2 removal:** Δ = −42 − (+35) = **−77** (derived −76) → **PASS** (band (−∞, −25]).
- **GATE = S1 ∧ S2 ∧ validity → PASS.**

TEXTURES' derivation predicted −38 / −76 and the frame delivered −42 / −77. Their re-anchor was
correct, and my own transcription's prediction that the *original* PAVING-SHADOW gate [−15,+15] would
fail warm is also confirmed: that ROI reads −43 in the neutral arm.

---

## 6. Reported separately, as instructed: V1 PASSES and the shaded cream still reads muted

Not a softening of any band. The band is met; this is a different observation, and it needs the
per-channel report §8 mandates ("report R/G, B/max and per-channel means together or you will trade
one cast for another").

| arm | R | G | B | b−r | R/G | B/max | reads as |
|---|---|---|---|---|---|---|---|
| `base` | 79 | 129 | 148 | +69 | 0.612 | 1.147 | cool blue-green |
| `f035` | 122 | 121 | 127 | +5 | 1.008 | 1.041 | neutral |
| **`f050`** | 135 | 118 | 116 | −19 | **1.144** | **0.859** | warm, R>G>B |
| `f065` | 147 | 115 | 103 | −44 | **1.278** | **0.701** | warm, R>G>B |
| §2.2 sandstone **light** `#e6b878` | 230 | 184 | 120 | −110 | 1.250 | 0.522 | authored cream |
| §2.2 sandstone **mid** `#c9915a` | 201 | 145 | 90 | −111 | 1.386 | 0.448 | authored cream |

**The good news, and it closes a real risk:** there is **no magenta**. G is never the darkest channel
at any arm; the channel order at `f050`/`f065` is **R > G > B**, which is §2.2's authored order. The
pinkness visible on the muzzle crop is a *low-saturation warm*, not the G-suppressed violet of §3/§8.
The §8 trap was checked for and is not present.

**The gap:** the shaded cream is warm in *direction* but well short in *saturation*. B/max is 0.859
at `f050` against an authored 0.522, and b−r is −19 against an authored −110. In the frame this reads
as **greige/taupe** rather than as cream — visible directly in the tail crop, where the shaded bands
go from unmistakably blue (base) to a muted warm grey (f050), while the lit cream elsewhere in the
same frame is far more saturated.

Consequently: **the acceptance corridor [−25, −16] is a much cooler, more muted target than §2.2's
authored sandstone.** `f065` (b−r −44, R/G **1.278**) sits closer to the authored cream on both
ratios than `f050` (R/G 1.144) does — §2.2's light sandstone is R/G 1.250. Per the palette ruling
(cream+navy is authored intent; the fix restores authored warm cream and does not chase grey), this
is a "lands cool-of-authored" finding and is reported as one. **The corridor is the coordinator's to
set; V1 is scored against it as written and PASSES at 0.50.** V2 also passes at `f065` (rings +14,
inside [+5,+45]), so 0.65 is available without reopening the ladder if the corridor moves.

---

## 7. Status of the run

| leg | verdict |
|---|---|
| F0 (rim untouched, `uRimGain` 2.05 all arms) | **PASS** — readback, phase-immune |
| PHASE falsifier | DRIFT on both shots; `sly-closeup` drift contradicts the seal |
| **V4** night direction + retention + LOOK | **PASS** |
| **V1** cream lands in corridor | **PASS** — ship candidate subjW **0.50** |
| **V2** navy rings hold | **PASS** |
| **V3** off-subject scope, whole-frame | **VOID** — pinned re-run required |
| **V5** TEXTURES' re-anchored gate | **PASS** (S1 −42, S2 −77, validity clean) |

**Ship recommendation: subjW 0.50 is certified on V1/V2/V4 and on TEXTURES' gate.** The one thing
standing between this and a clean ship is V3, which is void rather than failed — no evidence of a
scope leak was found, and the two off-subject ROIs that *can* be tested show none. It needs one
pinned capture, not a redesign.
