# PREREG-pnightcal — the successor seal §156.2's escalation required

Registered by SHADING, 2026-08-05T01:42Z, at tree `ed1667a` (clean), before any offline
analysis in §6 was run and before any new frame exists. Every threshold in this file is fixed
here; the offline runs and the capture come after the commit of this file.

**Lineage, stated first because the resume brief disagrees with the repo.** The DIGEST's
P-night entry says "registered, not scored." That is stale. `PREREG-pnight.md` ran as
`pnight1` (frames and readback survive at `progress/records/pnight1/`), was scored at §156.2
and confirmed on the registered stride at §157.5: **P-night FAILED as registered** — compose
+1.882° on `archShade` against S/5 = 0.176° — and the failure was a calibration-design
artefact: `min()` selected `rimfloor0`, a rim-removal known-bad this hue statistic is nearly
blind to, as the unit. The coordinator's escalation, already decided in the ledger: **the FAIL
stands, compose does not ship on that seal, re-deriving its line is forbidden, and a fresh
seal needs same-axis known-bads and a NEW capture.** This file is that fresh seal. It does
**not** rescore the pnight1 frames — their numbers are published, and a seal scored against
frames whose numbers are known is not a pre-registration (§156.2's own words).

Cross-seal note carried from PREREG-pnight §3.2: this run captures no `norim` arm and makes
**no** claim on PREREG-kerb's V3, and it does not rescore any other seal's question in this
statistic (§122.1).

---

## 0. Disclosure — the contamination and what it forces

I have read every published number this seal is adjacent to: compose **+1.882°**, sbm040
**+13.025°**, rimfloor0 **+0.882°** on `archShade` (§156.2), the 14.4 % / 213 % ratios, the
±177 px compose-vs-base pixel counts, base/base2 bit-identity, and §133.2's four figures.
Unavoidable: they are in the committed ledger and in the mandatory resume reading.

The consequence is not just "someone else should pick the number." It is structural, and it
drives this design:

> **The treatment and the same-axis known-bads sit on one scalar lever
> (`shadowBounceMix`), and the old run's data are consistent with near-linear response
> (compose's +0.05 above ship produced 1.88°; sbm040's +0.35 produced 13.03°; ratio 6.9 vs
> dose ratio 7.0).** Under linearity, ANY line of the form "fraction of a known-bad
> separation" is decided at registration time by the choice of known-bad dose, not by the
> capture: S/5 of an sbm020 arm forecasts ~1.1° (compose FAILS), S/5 of sbm040 forecasts
> ~2.6° (compose PASSES). A contaminated author choosing the arm roster would be choosing
> the verdict and calling it a measurement.

Therefore, in this seal:

- the known-bad arms serve **§13 instrument calibration only** — the metric must be shown to
  move on states the record already calls wrong, with the right sign and a dose response —
  and their separations are **published next to the verdict**, never used as the unit of the
  line;
- the **binding line is anchored outside the arms**, in quantities that predate this seal
  and are not P-night measurements (§3);
- my linear forecast of the outcome under the registered line is written down (§3, honesty
  note) so it cannot be retro-fitted either way.

## 1. The item, unchanged

P-night: the `compose` treatment (`shadowBounceMix`/`Lit` 0.05→0.10, `fillSkyMix` 0.70→0,
`PREREG-compose1` A.4) must not buy its day gains by warming the moonlit `night` palette.
Per A.4, a night regression voids the day arms regardless of what they showed.

## 2. Instrument — the sealed one, verbatim

- Statistic: `pnighthue.mjs`'s columns exactly — per-population **hue median (hueP50)** with
  signed circular **dHue vs `base`**, satP50, R/G, B/max, channel means, G-darkest share —
  over `roigen` populations: **`archShade`** (subject), **`sky`** (control), `archLit`
  (reported). The §11 gap travels with every quote: `archShade` means *"on an away-facing
  architecture surface"*, **not** *"in shadow"*.
- Warm-ward sign is **derived, not assumed**: the sign of dHue on the highest-dose same-axis
  arm, corroborated by R/G rising and B/max falling — the sealed scorer's own mechanism.
  (Old tree: warm-ward = positive. Must reproduce or G1 fails.)
- ROI: **regenerated at the capture's tree** (`roigen night 4`, stride 4 — §158.5: framing
  shares are not stable across trees). The ROI file records the `src` tree hash it was built
  from; scoring requires it to match the capture's stamp (V3).
- Frame-wide Δb−r is printed for continuity with §133.2 only and carries no verdict
  (§141.2 stands: it cannot see green and cannot localise).

## 3. The binding line — registered now, before any new number

**L1 (hue).** `night` passes P-night iff `archShade` **|dHue(compose vs base)| ≤ 1.40°**.

Derivation — every input predates this seal, and none is a P-night measurement:

1. The repo's one accepted "shadow stayed cool" form is an **absolute hue line with headroom
   over the authored anchor**: the day-side ledger line *"shadowed architecture hue ≤ 226° at
   comparable saturation"* against the authored `SHADOW HUE #2a3f66` = **219.0°** (AGENTS.md
   §2.2). The spec therefore grants shadowed architecture **7.0° of warm-ward hue headroom**
   under the light it was specced for.
2. PREREG-pnight §3.4 stands: the day **line** (226°) cannot transfer to a moonlit frame
   (§8's category error). What transfers is the **headroom**: 7.0° is the drift the project
   has already accepted as "still the authored shadow" under its own key. Night gets no more.
3. The composite may consume at most **1/5** of that headroom — the single free fraction of
   the predecessor seal, fixed at PREREG-pnight §3.3 *before any number existed*, carried
   unchanged because re-choosing it now is the contaminated move. 7.0° / 5 = **1.40°**.

Context, not derivation: the authored night-cool family spans 200.2° (`RIM cool #7fd4ff`) →
211.1° (`SKY zenith #3f7fc4`) → 219.0° (`SHADOW`), ≈ 18.8°; 1.40° is ~7 % of the family span.

**Honesty note, written before the capture:** 1.40° sits **below** the old tree's known
compose value (1.882°), so my own linear forecast is **FAIL**. It is registered anyway: with
reference downloads policy-blocked (§7) this is the defensible anchor available, and a line
placed *above* a known value would be §13's forbidden move in its exact recorded form —
"choosing a line now that happens to clear." The seal stays falsifiable in both directions:
the current tree is not the Aug-3 tree, and the forecast is a model, not a measurement.

**L2 (sky control — a band, not a point; §133.1).** |dHue(`sky`, compose)| ≤ **0.30°**.
None of the poked uniforms feeds the sky dome; residual movement is PostFX bleed. The offline
step O1 measures the OLD run's compose sky bleed **before** the new capture: if it exceeds
0.15° (half the band), the band is amended *at this site, with the measured number and the
reason, before the capture boots* — never silently (§154.5).

**L3 (luma guard).** |Δ mean(`archShade` luma, compose vs base)| ≤ **10 % relative**. The
palette spec's own floor ("shadows ~14 % of key luminance, never below") is a luminance
commitment; a hue pass bought by crushing or lifting the shade is not a pass. (Old-tree
context: compose moved ±177 px at ≥8 L on the whole frame — the forecast here is ≪ 1 %.)

**L4 (P-frame).** base vs compose vs both known-bads looked at, 1:1 and 4× crops, before the
verdict is written. If the picture and the statistic disagree, the picture is the finding.

**Verdict:** PASS iff **L1 ∧ L2 ∧ L3 ∧ L4** and gates **G1–G4** (§4) and validity **V1–V4**
(§5) all hold. Any G-gate failure → **UNSCOREABLE** (reported, never converted). Any V-gate
failure → **VOID**.

## 4. Calibration arms and gates — §13 done as calibration, not as chooser-hygiene

Arms, all live TUNE/uniform pokes in one boot, absolute values per arm (order-independent),
`night` only:

| arm | poke (absolute values) | role |
|---|---|---|
| `base` | ship: sbm 0.05/0.05, fillSkyMix 0.70, rimFloor 0.55 | reference |
| `sbm020` | shadowBounceMix/Lit = **0.20** | same-axis known-bad, 2× the §119.4 ceiling |
| `sbm040` | shadowBounceMix/Lit = **0.40** | same-axis known-bad, 4× the ceiling |
| `compose` | sbm/Lit = 0.10, fillSkyMix = 0 | the treatment (PREREG-compose1 values) |
| `base2` | ship again | bit-identity control (§119.3 P1) |

Both known-bads are bad **by the ledger's own commitment, not by eye**: §119.4 — *"the ledger
ceiling on the uniform knob is ~0.10 (temple binds)"* — and both sit on the exact axis the
acceptance is about (warm sand bounce mixed into the shadow term), which is §156.2's stated
requirement for this seal. `rimfloor0` is deliberately **absent**: it is a rim-removal state,
demonstrated blind-spot bait for a hue statistic, and reusing it would rebuild the defect
this seal exists to fix.

- **G1 (sign):** dHue(sbm020) > 0 AND dHue(sbm040) > 0, with the corroborations agreeing on
  both (R/G rises, B/max falls). Else UNSCOREABLE.
- **G2 (separation):** |dHue(sbm020)| ≥ **0.50°** — ten times the registered instrument
  noise floor of 0.05° (O2's δ=0 arm must read exactly 0.000; 0.05° is the operative bound).
  Else UNSCOREABLE. Explicitly **not** "fall back to sbm040 alone" — that is the permissive
  conversion §141.3 forbids.
- **G3 (dose response):** |dHue(sbm040)| > |dHue(sbm020)|. Else UNSCOREABLE — a metric that
  does not order a 2× violation below a 4× violation is not tracking the lever.
- **G4 (resolution, offline):** O2 must demonstrate gain in **[0.7, 1.3]** at δ = +1° —
  below L1's 1.40° — else the line is beneath the instrument's resolution and P-night is
  UNSCOREABLE at this line.

**Cross-tree continuity — REPORT-ONLY, voids nothing:** sbm040 expected in [6.5°, 26.1°]
(0.5–2× the old 13.025°); compose in [0.94°, 3.76°]; base hueP50 within ±3° of the old base.
Landing outside is reported as cross-tree drift next to the verdict.

**Published next to the verdict, whatever it is:** compose as a percentage of each known-bad
separation, and the measured night response slope (dHue per unit of sbm) with the implied
**night-safe sbm ceiling** = 0.05 + 1.40°/slope — the actionable number a future day-side
recut needs. On the old tree's linearity that forecasts ≈ 0.088, below compose's 0.10; the
capture measures it fresh.

## 5. Validity gates

- **V1:** base ≡ base2 **bit-identical**: 0 differing pixels at threshold *any channel
  differing by ≥ 1* (threshold stated per §122.1). Else VOID.
- **V2:** per-arm applied-state readback (the pnight1 mechanism, carried verbatim): every
  arm's requested-vs-readback mismatch list must be empty. Else VOID.
- **V3:** ROI built at the capture's stamped `src` tree (hash recorded in the ROI file).
  Mismatch → regenerate ROI at the correct tree and rescore; frames stay valid.
- **V4:** capture's `srcTreeBefore == srcTreeAfter`. This harness **navigates once** and
  pokes live, so §124.4 applies in its §159.1-qualified form; if the tree moves mid-run the
  arm-vs-arm deltas remain internally comparable but the absolute attribution is dirty —
  handled per §155.3 (direction-of-effect argument written, or VOID).

## 6. The offline half — run first, and what it cannot prove

Run after this file is committed, before any capture request:

- **O1 (continuity / provenance):** the sealed statistic re-run against the DURABLE pnight1
  copies (`progress/records/pnight1/frames/` + `progress/records/pnight1/roi-night.json`)
  must reproduce §156.2 digit-for-digit: rimfloor0 0.882°, sbm040 13.025°, compose 1.882°.
  Proves the durable artifacts are the scored ones and measures the old compose **sky** bleed
  for L2's band check. Reading these numbers is not new contamination — they are published.

  > **AMENDED 2026-08-05T01:5xZ, before any capture, thresholds untouched.** O1 as first
  > written paired the published digits with the wrong ROI file. Run: the stride-4
  > `roi-night.json` gives 0.556 / 12.947 / 1.556 on the durable frames; the published
  > triple belongs to `roi-night-preview.json` (stride 12), which reproduces **every**
  > published digit exactly — 0.882 / 13.025 / 1.882, sky(sbm040) 0.019 — from the same
  > frames. So the durable artifacts **are** the scored ones (O1 PASS under the corrected
  > pairing), and the mis-specification was mine, in the check, not in the artifacts. Two
  > additions carried forward: (a) the ~0.3° spread between the two ROIs' dHue values on
  > identical frames is the median statistic's sampling sensitivity — it does not apply
  > arm-to-arm within one fixed ROI, but it sizes the metric's granularity and sits
  > consistent with G2's 0.50° floor and below L1's 1.40° line; (b) the new seal's
  > cross-tree continuity bands (§4) already contain both variants, so no band moves.
  > L2 check: old compose sky bleed 0.000°, sbm040 sky 0.019° — the 0.30° band stands.
  > L3 context: old compose archShade mean-luma +0.53 % relative, well inside ±10 %.
- **O2 (synthetic §13 state — the instrument moved on a constructed defect):**
  `night-base.png` (a) re-encoded unchanged: every population dHue **exactly 0.000**; and
  (b) hue-rotated warm-ward (positive) whole-frame by δ ∈ {+1°, +2°, +5°, +13°}: predicted
  `archShade` **and** `sky` dHue in **[0.7·δ, 1.3·δ]**, sign positive, for every δ. The sky
  half doubles as proof the L2 control would catch a global drift: gain ≥ 0.7 means a global
  ≥ 0.43° shift trips the 0.30° band.
  A rotation confined to `archShade` sample coordinates is deliberately **not** run: the
  metric reads only sampled points, so "localisation" would be true by bookkeeping and prove
  nothing.

**What the offline half cannot prove — explicitly:**

1. It cannot score this seal. The pnight1 frames' numbers are published; §156.2: a
   calibration re-registered against frames whose numbers are known is not a
   pre-registration. Scoring needs the new capture.
2. It cannot show the live lever moves the metric on the **current** tree — the durable
   frames are of the Aug-3 tree (`c318ac2` / src f964e9cf…), and the tree has moved
   (§158.5's framing instability is the recorded hazard).
3. A hue rotation is the defect **quantity**, not the defect **mechanism**. Warm-bounce
   admixture moves hue, saturation and luma jointly; only live arms show the metric sees the
   mechanism's own signature on this tree.
4. base/base2 bit-identity, per-arm readback, and the sbm020 dose point (never captured on
   any tree) exist only in the new capture.

## 7. Reference frames — attempted, policy-blocked, recorded

AGENTS.md §7.4 (new) licenses fetching real Sly Cooper night-stealth frames to pin a moonlit
palette's warm-ward tolerance as a measured quantity. **The egress proxy denies every
image/screenshot host tried** — mobygames, static.wikia.nocookie.net, ignimgs (×2),
gamefaqs, upload.wikimedia.org, images.pushsquare.com, i.ytimg.com, duckduckgo.com,
archive.org / web.archive.org — all `403 CONNECT` (policy denial; `/root/.ccr/README.md`:
report, do not retry). Only GitHub-family hosts resolve. So the reference anchor **cannot be
measured in this environment**, and L1's authored-spec anchor is the registered replacement
rather than a silent substitution.

**Preserved for a future session with working egress** (formula registered now so a later
measurement cannot be shaped by its result): per-frame median hue of the cool-shadow mass
(luma ∈ [8, 80], sat ≥ 0.10, hue ∈ [140°, 320°]) across ≥ 8 frames from ≥ 3 Sly night
scenes; **T_ref = median across scenes of the within-scene MAD** of those medians where ≥ 2
scenes have ≥ 3 frames, else 0.5 × the across-frame MAD. If a measured T_ref disagrees with
the 1.40° line, that is a **new seal**, not an amendment to this one.

## 8. Capture registration

- One boot, one shot (`night`), five arms in §4's order; harness
  `progress/records/pnightcal.mjs` — `pnight1.mjs` with the arm table, output paths and
  provenance stamps changed, changes enumerated in its header. Frames land directly in
  `progress/records/pnightcal/frames/` — durable at write time; the blast radius of a
  rollback is fixed before the capture starts (§161.1).
- Queued behind the current holder (`fx22`, pid 24278) and the `sbs1` ticket via
  `tools/lock.mjs`'s FIFO (inside `withGame`); launched detached via `tools/launch.sh`
  (ppid-1 proof or loud kill); never waited on manually.
- Scorer `progress/records/pnightcal/pncscore.mjs` is committed **before** the capture
  finishes; every threshold in it is this file's.
- Cost: ~65 min of lock (pnight1's precedent). `roigen night 4` runs outside the lock
  (offline tool, CPU-competition only — §157.6), output copied durable with its tree hash.

## 9. Escalation

UNSCOREABLE and VOID are reported as themselves. No line in this file is re-derived after
any new number is read. If this seal dies, a third needs a new anchor and a new capture.

## 10. Files

| path | what |
|---|---|
| `progress/records/PREREG-pnightcal.md` | this seal |
| `progress/records/pnightcal.mjs` | capture harness |
| `progress/records/pnightcal/roigencal.mjs` | ROI generator, durable output + tree stamp |
| `progress/records/pnightcal/roi-night-cal.json` | ROI at the capture tree |
| `progress/records/pnightcal/continuity.mjs` | O1 |
| `progress/records/pnightcal/synthcal.mjs` | O2 |
| `progress/records/pnightcal/pncscore.mjs` | registered scorer |
| `progress/records/pnightcal/frames/…` | the five new frames |
| `progress/records/pnightcal/pnightcal.json` | provenance + per-arm readback |
| `progress/records/pnightcal/RESULT-pnightcal.md` | the verdict, whatever it is |
