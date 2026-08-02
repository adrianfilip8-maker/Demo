# ADDENDUM 1 to PREREG-blueskew-albedo.md — the arm-effectiveness gate is re-anchored

**Dated 2026-08-02 14:26 UTC.** Author: TEXTURES (owner of the instrument and of the sealed
registration this amends). Raised by the coordinator on SHADING's declared cross-seal
disagreement (`PREREG-creamfix.md`, "Declared cross-seal disagreement" block).

## Provenance — this re-anchor is pre-pixel, and here is the evidence for that claim

Amending a seal is legitimate only with provenance (the coordinator's condition, and §26's
whole point). Mine:

- **Tree `656818b`, working tree clean** (`git status --porcelain` empty). `git diff
  9401cc7..HEAD -- src/render src/textures src/player` is **empty**, so every constant
  transcribed below is the one the queued capture will run.
- **No creamfix frame exists.** `shots/creamfix/` is present and **empty** at 14:26 UTC
  (`ls -la` — two directory entries, nothing else). **No frame of any kind is an input to the
  derivation in §2 or to the bands in §4**, which were fixed before any pixel was read. §4a
  then reads the *shipped cap5 baseline* — the same frames this registration's own §3 already
  measured, captured long before the creamfix arms existed — as post-hoc corroboration, kept
  in its own section and explicitly barred from moving a band. No creamfix frame and no frame
  private to SHADING is read anywhere.
- **Not derived from SHADING's model either.** SHADING's number reached me as a bare
  prediction ("≈ −38, warm") relayed by the coordinator. The derivation below is my own
  transcription — the toon diffuse, `_refreshShadowColor`, the four PostFX grade stages and
  AgX's matrices are read out of `src/render/**` into `scratchpad/pavegate.mjs` (frozen with
  this addendum), and the albedo is **built**, not assumed: `Materials.js` `paving_courtyard`
  and `sandstone_block` are constructed on the CPU and their tile medians measured. I did not
  open `t16chain2.mjs` or `creammodel.mjs` for any constant or any result.
- **The verdict instrument does not change.** No new ROI box is invented, no new code enters
  the measurement path. The certifier moves to a box that was already frozen, in a file
  already frozen (`coolskew-read.mjs`, sealed in `PREREG-coolskew-grade.md` before any cap5
  statistic existed). `pavegate.mjs` is the *derivation*; it never touches the verdict.

## 1. What the original gate said, verbatim

> Arm-effectiveness gate (a gate, not a verdict): in the neutral arm a shadowed-paving ROI's
> b−r must land in **[−15, +15]** and the cream-mask median L must stay within ±40% of shipped
> (39.7). If the gate fails, bands below do not apply; single-knob legs that fail the gate are
> read against the model's per-term shares (shadowMul 66% / fill 29% / wash 5%) as partial
> attributions, not against the bands.

## 2. Why the b−r half of it was wrong — the derivation, and it confirms SHADING

The neutral arm greys the **light**, not the pixel. `toon.glsl.js:415-416` sets
`slyFillX = mix(fill, vec3(slyLum(fill)), uNeutralFill)` and the same for `uShadowColor`; the
four-term diffuse then multiplies that grey by `albShadow`. A pixel is light × albedo, so
under chroma-neutral light a surface displays **its own albedo chroma**. Sandstone is warm by
authoring. The gate demanded that a warm-authored surface read neutral under neutral light —
which a correctly functioning arm cannot deliver, and a broken one might.

This is the same category error KNOWN_ISSUES §8 already records once ("comparing a surface
measurement to a light spec is a category error, and it made a knob look like it had moved the
wrong way when it was already near its own floor"). I wrote the band for the *light* and
applied it to a *pixel*. Second instance, my file, and it would have failed a working arm.

**The arithmetic** (`scratchpad/pavegate.mjs`, tod 0.80, key term 0, `shadowMix` 1):

| input | value | source |
|---|---|---|
| `uShadowColor` daylight | lin (0.0961, 0.3131, 0.4966), 11.6% of keyLum | `_refreshShadowColor` transcribed; the file's own recorded 11.6% reproduced |
| fill, floor (Ny 1) | lin (0.0615, 0.1513, 0.2657) | `toon.glsl.js:372-380`, hemiSky/hemiGround from `evalAtmosphere(0.80)` |
| `paving_courtyard` tile albedo median | sRGB (178,126,79), **b−r −99**, aoMed 0.988 | built on CPU from `Materials.js` |
| `sandstone_block` tile albedo median | sRGB (164,113,69), **b−r −95**, aoMed 0.984 | built on CPU from `Materials.js` |
| material `color` multiplier | `paving_courtyard` 0xcfa068, `sandstone_block` 0xc9915a | `Architecture.js` RECIPES |

Shaded, then through exposure 0.95 → lift → gain → split (0 in the neutral arm) → saturation
(1.0 in the neutral arm) → contrast 1.08 about pivot 0.18 → AgX → sRGB:

| material | arm | display rgb | L | **b−r** |
|---|---|---|---|---|
| `paving_courtyard`, Ny 1 | base | (56,74,91) | 71.4 | **+35** |
| `paving_courtyard`, Ny 1 | **neutral** | (102,68,59) | 74.6 | **−43** |
| `sandstone_block`, Ny 0 | base | (47,62,85) | 60.5 | **+38** |
| `sandstone_block`, Ny 0 | **neutral** | (89,56,51) | 62.7 | **−38** |

Sensitivity, neutral arm: albedo p10→p90 of the paving tile spans **−31 … −48**; `aoMap` p05
vs median moves it 1 count; floor-vs-wall normal moves it 2.

**Verdict on question 1: SHADING's ≈ −38 is right, and I agree with it from an independent
transcription.** My centre for the population that matters is **−38** (`sandstone_block`,
see §3), and −41 for the ROI as literally weighted. The gate would have failed a working arm
by 23–33 counts.

**Model validated on the population the seal actually verdicts, not only on paving.** Run the
same chain on `PAL.cream` and `PAL.tailDark`: neutral-arm cream **−9**, rings **+11 … +12**;
base-arm cream **+61 … +67**, rings **+93 … +98**. Those land inside the registered floor band
[−34, −6] and the ring band [+8, +30] respectively — bands written months earlier, from a
different direction, and **not being amended**. A model that reproduces the untouched bands is
a model I am willing to re-anchor the touched one with.

## 3. A second defect, which I found while checking the first, and which the ≈−38 disagreement
did not name: the certifier population is not shadowed paving

The gate says "a shadowed-paving ROI" and never names a box — an under-specification that is
mine. The operative box is `coolskew-read.mjs`'s `PAVING-SHADOW`,
`[960,350]–[1100,395]`, luma gate [26,140], which `PREREG-creamfix.md` binds into this run.
Measured against geometry (architecture-only rasteriser, `scratchpad/sly-closeup-mask.bin`;
6,300 px, full coverage, no gaps):

- **70.4% `arch:court:sandstone_block`, 29.6% `paving:court`.** It is mostly not paving.
- Six unprojected probes (`pixworld.mjs`) land five of six on a **west-facing vertical kerb
  face** at world (5.6, 0.0–0.3, 25.9–27.2), normal **(−1, 0, 0)**; one on floor paving.
- `evalAtmosphere(0.80)` gives keyDir **(−0.927, 0.358, −0.109)**, so that face has
  **ndl = +0.927** — it is a *key-facing* population, and **the neutral arm does not neutralise
  the key** (only fill and shadow chroma). Any key that reaches it injects warmth the arm
  cannot remove.

What that does to the statistic, neutral arm, same face, inside the sealed luma gate the whole
way: keyF 0 → **−38**, 0.15 → **−76**, 0.35 → **−101**, 0.60 → **−116**. A certifier that
swings 78 counts on the value of the term it is supposed to certify cannot certify it. That is
a worse defect than the band being in the wrong place, and re-anchoring the band alone would
have preserved it.

Post-derivation corroboration, labelled as such and not an input above: the published
`RESULT-coolskew-grade.md` records this box reading **hue 19°, warm**, in the *shipped*
sly-closeup under the full cool grade. My base-arm model reproduces that only at keyF ≳ 0.15.
The box has been key-contaminated all along.

## 4. The replacement gate

**Certifier moves to `WALL-SHADOW`** — `coolskew-read.mjs` box `[922,210]–[962,320]`, luma gate
[26,140], `sly-closeup`. Already frozen, already in the run, no new instrument. Why it is the
right population, checked rather than assumed:

- **100% `arch:court:sandstone_block`** by the same rasteriser (4,400 px, single material).
- Same plane, same normal (−1, 0, 0), world x = 5.6, y 0.5–1.4 — so it differs from `WALL-LIT`
  only by the cast shadow across it, which is exactly what a shade-regime certifier wants.
- **Clear of the subject**: the CPU-skinned character's projected bbox in this shot is
  x 503…910 (`scratchpad/charbox.mjs`), 12 px left of the box. Registered as a caveat, not
  hidden: 12 px is thin against a ~2.5 px ink hull plus bloom bleed (§20). If the measured
  `WALL-SHADOW` n falls below the validity floor, or if its **base-arm** b−r departs from the
  shipped cap5 reading of **+35** by more than 25 counts, treat the box as contaminated or the
  frame state as changed, and use its right two thirds (x 936…962) — declared **now**, so it is
  not a choice made after seeing a creamfix number.
- Being architecture, it is bit-identical across the subject-scoped `fXXX` arms (that is V3's
  claim in `PREREG-creamfix.md`), so it reads *only* the global neutralisation.

Two statistics. Both partition ℝ (§26.1); every claim carries a number (§26.2).

**S1 — landing (albedo-anchored absolute).** Median display b−r on `WALL-SHADOW`, `neutral`
arm. Derived centre **−38**.

| band | verdict |
|---|---|
| (−∞, −80] | **FAIL — population**: gated set is key-dominated, not shade (model needs keyF ≳ 0.18). Instrument/ROI check; no attribution verdict claimable from this run |
| (−80, −4] | **PASS.** Sub-labels for the report only: marginal-warm (−80, −58), **nominal [−58, −18]** (derived −38 ± 20, SHADING's own registered absolute tolerance on b−r), marginal-shallow (−18, −4] (the chain compresses b−r magnitude at low L — observed on the character populations, so a shallow landing is admissible) |
| (−4, +8) | **FAIL — partial**: cool removed but albedo not exposed; read the `nS`/`nF` legs against the B shares (shadowMul 66 / fill 29 / wash 5) as partial attributions |
| [+8, ∞) | **FAIL — inert or inverted**: the shade-side cool survived the arm |

**S2 — removal (relative, albedo-cancelling).** Δ = S1 − (median b−r on the same box, same
frame, `base` arm). The albedo is identical in both arms, so it cancels to first order; this is
the clause that is robust to the exposure the original band tripped on. Derived Δ = −38 − (+38)
= **−76** (−73 against the shipped base of §4a).

| band | verdict |
|---|---|
| (−∞, −25] | **PASS** — the arm removed the shade-side cool (3× margin on the derived −76) |
| (−25, −8] | **PARTIAL — gate fails**; `nS`/`nF` legs read against the B shares |
| (−8, +∞) | **FAIL** — arm inert or inverted |

**Validity (checked first; a validity failure makes the gate VOID, not failed).**
n ≥ 400 gated px on `WALL-SHADOW` in **both** arms, and |L(neutral) − L(base)| ≤ 15 display
counts on that box. Both neutral blends are luma-matched by construction, so the derived ΔL is
**+2.2**; a large ΔL means the luma gate selected different texels in the two arms and S2 is
not comparing like with like.

**Gate = S1 PASS ∧ S2 PASS ∧ validity.**

### 4a. Post-derivation corroboration — the model reproduces this certifier to 3 counts

Run **after** the bands above were written, on the *shipped* cap5 frames (the sealed baseline
this registration already quotes in its §3 — not a creamfix frame, and not an input to §2).
`coolskew-read.mjs` verbatim, `cap5/sly-closeup.png`:

| box | measured (shipped) | my model (base arm) | Δ b−r |
|---|---|---|---|
| `WALL-SHADOW` | n 4152, med rgb (53,67,88), **b−r +35**, L 68.5, hue 216 | (47,62,85), **b−r +38**, L 60.5 | **3** |
| `WALL-LIT` | med rgb (228,136,95), b−r −133, R>G 100% | keyF 1: (219,114,79), b−r −140 | 7 |
| `PAVING-SHADOW` | med rgb (56,47,52), b−r −4, hue 19, R>G 59% | neither clean shade (+38) nor clean lit (−140) | — mixed, as §3 predicts |

Two things follow, and the second one is a discipline note on myself. **(1)** The magnitude
limitation recorded in §6 is a *character*-population effect and does **not** apply to the
architecture certifier: on `WALL-SHADOW` the chain is accurate to 3 display counts of b−r and
6 counts per channel. That is the strongest available evidence that the derived neutral-arm
centre of −38 is trustworthy on this box. **(2)** That accuracy would justify a much tighter
S1 band than the ±20 I registered — and I am **not** taking it. Narrowing a band after seeing
a number that supports narrowing is goalpost-moving even when the number is from the right
frame and the direction is toward strictness. The bands stand as written above; this section
is corroboration of the centre, not a revision of the tolerance.

**Retained unchanged:** the second half of the original gate — "the cream-mask median L must
stay within ±40% of shipped (39.7)". It is a luminance-stability check on the verdict
population, not a chroma claim, so the albedo-exposure error does not touch it.

**De-registered as a certifier, retained as a reported row:** `PAVING-SHADOW`. Derived
expectation if it were shade-only, ROI-weighted 0.704/0.296: **−41**; but per §3 the box is
70.4% key-facing, so a much warmer reading there is *expected* and means nothing about the arm.
Non-binding (§26.2).

## 5. What does not move, and the remedy

**Not amended, not re-derived, not touched:** the settling observable (median b−r on the frozen
cream tail mask, `blueskew.mjs`, `sly-closeup`, neutral arm) and every substantive band —
cream **[−34, −6]** ⇒ authored floor confirmed; the (−6, +10) partial band; the [+10, ∞)
band on which I stake the albedo inventory; rings **[+8, +30]**; **ρ ≤ 0.75**. The §3 measured
baseline and the §2 authored-floor derivation stand as written. Only the arm-effectiveness gate
changes, and only because it was measuring the wrong thing in the wrong units.

**Remedy, written as a function of state and not of schedule (§26.3):** if the gate FAILs or is
VOID on the creamfix run, the cream/ring/ρ bands **do not fire as a verdict on that run**,
whenever it is read and whatever has already shipped; the operative path is the fallback the
original seal already registered — the `nS`/`nF` single-knob legs read against the per-term B
shares as partial attributions. Nothing in `src/textures/**` changes on any branch of this
gate; that was true at seal and is still true, because the fur maps and vertex tints are
verified neutral and there is nothing on my side that could move the tail's chroma.

## 6. Scope stamp (§11) — the transforms between this arithmetic and the renderer

Not implemented here: GTAO screen-space occlusion (modelled at occ = 0; in the neutral arm its
tint is white so it is luminance-only there, but in the **base** arm it is a chroma term and
its omission makes the base rows a slight *under*-estimate of base cool — which makes S2's −76
a conservative floor); atmospheric haze (ROI 9.5–10.8 m out, blend < 2%); bloom, vignette, FXAA,
grain; screen-space rim and ink (edge terms, box interior); the surface fresnel rim
(silhouette-gated since the rim2 fix, identically 0 on a plane); per-texel albedo distribution
(tile **median** stands in for the population, spread reported in §2); normal-map perturbation
of ndl (irrelevant at key = 0); and the shadow map itself — "fully shadowed" is an *assumption*
about `WALL-SHADOW`, which is why S1's warm-side FAIL band exists to catch it being wrong.

Known magnitude limitation, stated because it sets the tolerances: on the *character*
populations this chain over-predicts |b−r| (base rings model +93…+98 against a measured +30;
base cream model +61…+67 against a measured +35…+57), and it over-predicts their display L
substantially, because it carries no per-vertex AO, no self-occlusion and no mask
contamination. The architecture populations are the clean case and the ones the certifier now
uses. The S1 band is deliberately wide on both sides for this reason, and S2 — which compares
two arms at the same level — is the primary clause precisely because it is insensitive to it.
