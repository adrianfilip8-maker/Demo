# PREREG — cool-blue character skew, GRADE-side registration (task: coordinator routing off RESULT-cap5.md K4)

Sealed BEFORE any ROI statistic is computed. Written 2026-08-02, tree `f026ef3`, SRC FREEZE in
effect — analysis uses the existing `shots/cap5/` frames (7b0e3f8 dirty:false boot) and committed
constants only. No capture, no source edit.

Two-owner attribution, run §23-style: the differing prediction settles it, coefficients alone do
not (§25). TEXTURES independently registers the AUTHORED side. This file is the GRADE side: the
character sits in fill+shadow (§24.5: sly-closeup 37% key-facing-unoccluded, mostly shadowed at
the staged spot), so the terms that act on that population are the hemispheric fill
(`fillSkyMix 0.70` — sky leg `#6fa8d8` by construction), the shadow light
(`shadowTeal 0.15` / `shadowBounceMix 0.05` / `shadowTintPeak 0.52`), the wash (0.05), the
split-tone cool leg (0.16 over [0.04, 0.24]), `saturation 1.30`, and AgX.

## Model (frozen: `coolskew-model.mjs`; run output recorded before this seal)

t16chain2's validated chain transcription updated to current constants. Skipped transforms are in
the script header (§11): GTAO/aoTint, bloom, sss warm wrap (biases TERMINATOR pixels warm — not
the flat-shadow population scored here), normal maps, fur detail layer, banded-ramp intermediate
keys, FXAA/grain.

**Validation, stated honestly:** current-constants arch model + t16chain2's per-material frame
offsets vs the t16ab in-frame record: block |err| 5 PASS, paving 6 PASS, **worn 22 FAIL**. The
offsets were fitted on the pre-teal tree and do not fully transfer. Consequence, binding on how
this seal is scored: **absolute hue predictions carry ±25 deg; the binding discriminators are
channel-order and large-separation predictions**, which a 25 deg offset cannot flip.

Light triples at tod 0.80 (scene-linear): shadowLight (0.096, 0.313, 0.497) G/R 3.26; fill Ny=0
(0.062, 0.121, 0.200) G/R 1.96; keyRad (3.286, 2.274, 1.151) B/R 0.35. **Keyed bound: an albedo
needs linear B/R ≥ 2.86 to hold B ≥ R under the full key; the bluest committed character triple
(tailDark 2.35, ink 1.88) does not reach it — so BOTH multiplicative hypotheses predict keyed
character surfaces read warm.** A cool keyed surface falsifies both and implicates an additive
display-space term.

Point predictions (H-GRADE, authored triples × modelled light × grade, fill+shadow population):

| population (albedo) | display rgb | hue | sat | order |
|---|---|---|---|---|
| tail light band (cream #e4dfcb) | 112,160,175 | **194** | **0.36** | G≥R |
| cheek fur (furMid #7a8ba8) | 57,115,155 | 204 | **0.63** | G≥R |
| dark rings (tailDark #2a3142) | 2,54,99 | 208 | 0.98 | G≥R |
| ink (#101319) | 2,39,74 | 209 | 0.97 | G≥R |

H-AUTH counterfactual (authored albedo × NEUTRAL light of equal luminance): cream reads **warm**
(hue 34, sat 0.13, R>G); furMid weak blue (227, sat 0.15); tailDark blue (228, 0.43). The
neutral-grey counterfactual at cream's luma differs from the authored-cream H-GRADE row by only
4 deg / 0.03 sat — on the light bands the authored chroma is ~nothing and the light is
~everything, **if** H-GRADE holds.

## Registered discriminators, bands partition the outcome line (§26.1), thresholds on every claim (§26.2)

**ROIs** (frame coords 1280x720, [x0,y0..x1,y1), placed from gridded crops BEFORE any statistic
was computed; luma gates select the population inside the box; per-pixel hue median with hues
>340 wrapped to negative for median stability; instrument `coolskew-read.mjs` frozen from this
spec):

- TAIL-LIGHT-SHADOW `[802,306..862,356]` L∈[90,200] — primary; K4's own subject
- TAIL-DARK `[802,306..862,356]` + `[820,250..880,300]` L∈[26,55]
- TAIL-TIP-WARM `[878,234..900,258]` L≥120 — apparent lit spot on the tip (keyed-on-tail check)
- MUZZLE-CREAM `[590,196..616,226]` L≥90 — cream discriminator #2; keyed in sly-key (K2)
- CHEEK-FURMID `[618,208..638,236]` L∈[56,140]
- RUFF-DARK `[594,247..621,290]` L∈[26,55] — RESULT-cap5's torso control box, reused verbatim
- WALL-SHADOW `[922,210..962,320]` L∈[26,140]; WALL-LIT `[990,220..1080,290]` L≥90;
  PAVING-SHADOW `[960,350..1100,395]` L∈[26,140] — frame-state controls, not verdict carriers

**Controls (calibration claims, must hold or the frame state is not the one modelled):**
WALL-SHADOW median hue ∈ [200, 240] (t16ab recorded 224/226 on this tree family) and WALL-LIT
median hue ∈ [10, 60]. Either failing routes to "frame/grade state differs from the t16ab
record — stop, re-anchor" and no verdict band is claimable.

**P1 — cream-in-shadow (PRIMARY; verdict ROI = TAIL-LIGHT-SHADOW in cap5/sly-closeup.png).**
Validity gate: n ≥ 400 px AND satP50 ≥ 0.10; if n < 400 the box missed the bands (re-derive box
from the tail mask, say so); if sat < 0.10 the population reads near-grey → band V ("K4's
observation not reproduced on this ROI — finding, not verdict").
Outcome = median hue (with channel order at the per-channel-median rgb). Bands over [0,360):

- **A [150, 226] AND G≥R → GRADE-owned.** The light+grade puts it there (prediction 194±25);
  H-AUTH's prediction for this population is warm — refuted on this population.
- **B [0, 90] ∪ (330, 360) → AUTH-visible / light-insufficient.** Warm cream survives; the
  GRADE model is wrong about the operative light on the character.
- **C (226, 270] → joint transit.** Neither refuted; decomposition step with TEXTURES'
  registered triples follows (measured ÷ modelled-light ratios → implied albedo ratio).
- **D (270, 330] → outside BOTH models** (every modelled row and every authored triple is
  G≥R); route a paint run (terms into the framebuffer, tonemap bypassed), not a tuning.
- **E (90, 150) → outside both, green corridor; instrument check first.**
MUZZLE-CREAM in sly-closeup is scored on the same bands as a replicate (reported, not verdict).

**P2 — magnitude on mid fur (CHEEK-FURMID, cap5/sly-closeup).** Validity: n ≥ 150. Outcome =
satP50: **[0.40, 1] GRADE-dominant** (model 0.63 neutral-grey-counterfactual 0.55 — the light's
chroma does the majority) / **[0.22, 0.40) joint** / **[0, 0.22) authored-level-only** (H-AUTH
ceiling 0.15 under neutral light — light chroma contributes ~nothing).

**P3 — keyed flip (MUZZLE-CREAM in sly-key; TAIL-TIP-WARM in sly-closeup).** Validity: n ≥ 100
each. Outcome per ROI = (channel order, satP50, median hue): **warm** (R>G AND hue in
[0,90]∪(330,360)) → multiplicative chain sufficient on keyed populations, no additive cool term
needed. **cool** (G≥R AND hue in [150,270] AND sat ≥ 0.15) → additive display term implicated
(rim add / split cool leg) — falsifies BOTH multiplicative models on keyed pixels; route the
paint run. **neither** (any other combination, incl. sat < 0.15) → indeterminate-neutral; report.

**P4 — rim's share: eliminated by arithmetic, not measured.** Model rows: adding the surface rim
at rimBand·rimSil = 0.35 on the shadow side moves cream by 0 deg hue / −0.02 sat and furMid by
−2 deg / −0.09 (the add is small against the fill on these albedos, and it *desaturates* toward
its own pale cyan rather than deepening blue). Claim, binding as routing only: the rim term
cannot own a body-wide sat ≥ 0.4 skew; it is an edge-band term. Any challenge to this goes
through §24.1's paint method, not a knob.

## What each verdict routes to (non-binding routing, recorded at seal time)

- P1=A + P2 GRADE-dominant: the skew is the *intended* coloured-shadow/fill machinery acting on
  a subject that stands ~entirely inside it. The attribution question becomes art-direction
  magnitude, and the levers are: staging/key access (§24.5: +2 m x doubles his lit fraction —
  CAMERA/coordinator, cheapest); fill hue/intensity share (`fillSkyMix`, `ambientBoost` —
  LIGHTING, global; §20 warning attached); `saturation 1.30` / split leg 0.16 (mine, global —
  they amplify every shadow, not just his). **Any grade lever change must re-measure `night`
  first** — the ledger's own acceptance from task16: night is what the cool terms pay for. There
  is currently NO subject-scoped grade term; inventing one is a design decision for the
  coordinator, not a tuning.
- P1=B: my model's operative-light claim is wrong for the character — first check whether the
  character's materials bypass any chain term (sss, detail layer), then hand the line to
  TEXTURES' verdict.
- P1=C: joint decomposition with TEXTURES' registered triples; shares quoted per factor.
- P1=D/E or P3=cool: paint run prereg follows; no knob moves before it.

No commits from me; coordinator sweeps. Verdict file: `RESULT-coolskew-grade.md`.
