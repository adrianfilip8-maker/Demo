# PREREG — creamfix: the grade-lever A/B (cool-blue character skew fix + TEXTURES' neutral-arm settle, one capture)

Sealed before any frame exists. Unblocked by the coordinator on CHARACTER's palette ruling
(`progress/records/NOTE-tailpalette.md`: cream+navy IS authored intent; the fix restores warm
cream, it does not chase grey). Inputs, all committed: `RESULT-coolskew-grade.md` (Band A —
light+grade owned; B shares shadowMul 66 / fill 29 / wash 5), `PREREG-blueskew-albedo.md`
(TEXTURES' registered neutral-arm bands — **their seal fires on this same run**),
`NOTE-blueskew-comparison.md` (the sign-flip conviction). §26 discipline + §25's duplicate-arm
bracket rule (sly-closeup has no animated emitters; bracket-native anyway — night has torches
and needs it regardless). Capture joins the coordinated batch; NOT launched by me.

## The change under test (implemented, zero-default, in tree at seal time)

Three knobs in `ToonMaterial.js` TUNE + shared uniforms + `toon.glsl.js` (all my files; module
import check clean; `mix` at 0 exact, so 0/0/0 is bit-identical legacy):

- `neutralShadow` / `neutralFill` (uniforms `uNeutralShadow`/`uNeutralFill`) — attribution
  arms, NEVER ship: lerp `uShadowColor` (wash follows it) / the hemispheric fill toward
  luma-matched grey, globally. With PostFX pokes (`saturation` 1.0, `splitStrength` 0, new
  zero-default `aoTintNeutral` 1.0) they produce TEXTURES' registered neutral arm; separately
  they are the single-knob legs its gate-fail branch reads against the B shares (nS carries
  shadowMul+wash = 71%, nF carries fill = 29%).
- `subjWarmShade` (uniform `uSubjWarmShade`) — THE FIX: `vSlySkin`-scoped (skinned draws only
  — Sly and guards; §24.1 verified this scope channel on the rim gate), lerps BOTH shade-side
  lights' chroma toward luma-matched `uSssColor` (PAL.wrapWarm #ffb07a on the character).
  Luma-matched by construction: a hue lever, not a brightness lever. Architecture is
  bit-identical at any value because `vSlySkin = 0` makes the blend factor exactly 0.

## Registered model (scratchpad/creammodel.mjs, run before this seal)

t16chain2's validated transcription (arch gate re-run at seal: block |err| 5 PASS, paving 6
PASS, worn 22 known-FAIL) → binding predictions are **sign and channel-order**; absolute hue
±25°, b−r ±20 display counts. Key rows (tod 0.80, key 0, shade population):

| subjW | cream b−r | tailDark (rings) b−r | furMid b−r |
|---|---|---|---|
| 0 | +63 (measured +35..+57) | +97 | +98 |
| 0.35 | ≈ 0 (interp of +16 @0.25 / −24 @0.50) | ≈ +47 | ≈ +39 |
| 0.50 | **−24** | +30 | +16 |
| 0.65 | −49 | +15 | −8 |

Cream crosses the coordinator's acceptance corridor **b−r ∈ [−25, −16]** between ≈0.45 and
≈0.52. Neutral arm (nS=1, nF=1, sat 1, split 0): cream **−9** (inside TEXTURES' floor band
[−34, −6]), rings **+11** (inside their [+8, +30]). Night (DIRECTION only; torch/moon locals
skipped): cream +97 → ≈+22 at 0.50 → −49 at 1.0.

**Declared cross-seal disagreement, found by this arithmetic and flagged to the coordinator
BEFORE the capture is scheduled:** TEXTURES' arm-effectiveness gate ("shadowed-paving b−r ∈
[−15, +15] in the neutral arm") is predicted to FAIL by my transcription — a warm-authored
paving under chroma-neutral light shows its own albedo at ≈ **−38**, warm, outside their gate
band on the warm side. If the frame agrees, their own prereg's fallback (single-knob legs read
against the B shares) is the operative path — the nS/nF arms below exist for exactly that —
but the cleaner outcome is TEXTURES re-anchoring the gate band before the run. Their seal,
their call; registered here so the gate failing warm is not read as "arm broken".

## The run (one boot; runner `scratchpad/creamfix.mjs`, drafted, coordinator launches)

**`night` FIRST** (the ledger's binding constraint — night is what the cool terms pay for):
arms `base`, `f050` (subjW 0.50), `baseB` (bracket — night has torch/shaft FX; every night
statistic is temporally masked per the §25 rule).

**`sly-closeup`** (verdict frame): arms in order `base`, `f035`, `f050`, `f065`, `nS`
(neutralShadow 1 only), `nF` (neutralFill 1 only), `neutral` (nS 1 + nF 1 + PostFX saturation
1.0 / splitStrength 0 / aoTintNeutral 1.0), `baseB` (bracket, last). Pokes via
`shading.uniforms.uX.value` + tune mirrors and `pf.tune.*` (grade tune is republished per
frame); live readback recorded per arm; all pokes restored after each shot.

Instruments, frozen already (nothing new to freeze): TEXTURES' `blueskew.mjs` masks (their
settling observable, scored by them on `neutral`); my `coolskew-read.mjs` ROIs verbatim —
TAIL-LIGHT-SHADOW is the verdict ROI, MUZZLE-CREAM the replicate, WALL-SHADOW / WALL-LIT /
PAVING-SHADOW the frame-state controls. Verdict statistic: median display **b−r** on the
cream population (per-channel medians, as RESULT-coolskew reported them).

## Registered verdicts — bands partition ℝ (§26.1), numbers on every claim (§26.2)

**V1 — the fix lands (PRIMARY: cream-mask median b−r on `f050`, sly-closeup):**
- **[−25, −16] → fix confirmed; ship candidate subjW 0.50.**
- (−16, −6] → under-warm at 0.50: if `f065` ∈ [−25, −16], ship candidate 0.65; else report
  the measured slope and stop — a further arm is a new prereg, not a taste retune.
- (−6, +10] → mechanism moved but insufficient (Δ from base ≥ 26 counts predicted even here);
  read nS/nF legs against the B shares, route diagnosis, no ship.
- (+10, ∞) → mechanism failed in sign-scale; model wrong; paint-run diagnosis, no ship.
- [−34, −25) → over-warm at 0.50: if `f035` ∈ [−25, −16], ship candidate 0.35; else report
  slope, stop.
- (−∞, −34) → anomaly (beyond the authored floor's own bottom) — instrument check first.

**V2 — rings hold (same arm as the V1 ship candidate; ring-mask median b−r):**
[+5, +45] → navy rings intact (NOTE-tailpalette's ladder stands; model +30 at 0.50).
Outside on either side → no ship; route to CHARACTER (the ladder condition reopens).

**V3 — day mood preserved = subject scope proven, bracket-native:** on the temporally-stable
population (base/baseB bracket, unstable set dilated 1 px), `base` vs each `fXXX` arm must
differ on **0 px outside the subject** (subject = charvis bbox padded 24 px ∪ vSlySkin ≥ 0.5
prepass mask). Any nonzero masked off-subject diff → vSlySkin scope leak → **run invalid for
ship** regardless of V1. This is the "world bit-identical" claim measured, not asserted.

**V4 — night retention (scored FIRST, before any sly-closeup number is read):** on night's
temporally-masked subject shade ROI (cream+fur population inside the charvis bbox):
- direction: median b−r falls from base (any decrease) — sanity that the knob is live at night;
- retention: `f050` median b−r ≥ **−10** (the subject may warm but must not flip hard-warm;
  model interpolation ≈ +22) AND night's off-subject masked diff = 0 px (arch/cones/sparkles
  untouched);
- b−r < −10 → the day-chosen value is too hot for night: no ship at that value; the follow-up
  (tod-scaling vs lower global value) is a coordinator design decision, band closed.
- LOOK: open night base vs f050. The moonlit-blue read on the character (§2.2 palette flip)
  is a gate on ship: if the subject reads daylit against a moonlit world, no ship — prose
  gate, marked binding-by-look per §7.1, no number claimed (§26.2 non-binding label).

**V5 — TEXTURES' settle (theirs, listed for the run design only):** their bands fire on
`neutral` via their frozen instrument: cream [−34, −6] floor-confirm, rings [+8, +30],
ρ ≤ 0.75, arm gate as discussed above. `nS`/`nF` are their gate-fail fallback legs. I claim
nothing from V5; the coordinator holds the comparison.

**Replicate (report, not verdict):** MUZZLE-CREAM on f050 — predicted into [−25, −16] ± 20;
reported beside V1 like RESULT-coolskew did.

**Ring legibility (report only, non-binding per NOTE-tailpalette's own condition):** shaded
ring-vs-band ΔL at closeup scale on the ship-candidate arm, reported for CHARACTER's
conditional acceptance; no threshold registered here — that re-open belongs to CHARACTER.

## What this run does not touch (scope, stated at seal)

Rim terms (display + surface, silhouette-gated — §24.1), ink, sparkles, key light, night
cones: all outside the edited terms. Guards are skinned and inside the fix's scope — reported
if a guard is in frame (night patrol), not banded. `uSssColor` doubles as the warm target: if
CHARACTER re-authors wrapColor later, the fix hue follows — recorded as a coupling, kept
because it makes the target authored rather than invented. splitShadowTeal/aoTintTeal (task
#19 knobs) stay 0 in every arm of this run — one lever family at a time.
