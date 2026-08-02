# PREREG — hero kerb band A/B (§24.3's 1,692-px residual), sealed before the run exists

Written 2026-08-02 during SRC FREEZE; the run happens only after the freeze lifts and the
coordinator green-lights. Tree at seal `f026ef3`. Everything below is registered now so no
threshold is chosen after a pixel exists (§26). Bands partition their outcome lines (§26.1);
every claim carries a number (§26.2).

## Instrument, re-derived and calibrated (the original analyzer died with the ~11:33 restart)

`kerbband.mjs` (frozen): artefact px = `L ≥ 150 AND B > R AND B−R ≥ 18 AND B ≥ G−4`, causal
form adds `L − L_norim ≥ 8`. ROI `[820,500..1100,610]`. Calibration against the committed
record: rim2 hero base-vs-norim in-ROI **1,691 vs recorded 1,692**; bud35 (current tree,
non-causal) **1,704 vs bud34's recorded 1,704**. The instrument reproduces the lost one to
±1 px, and the band is still live on today's tree. Overlay kept: `kerb-hero-roi.png` — a fat
continuous pale-cyan bar on the kerb's rounded top edge, as §24.3 describes.

**Why the COUNT is not the primary outcome (measured, not taste):** margins over the sealed
thresholds on the 1,691 base px — `L−150` p50 **7.2**, `B−R−18` p50 45, `lift−8` p50 **102.9**.
The rim lifts this band ~110 L and the count sits 7 L over its luma cut: a 25% strength cut
zeroes the count (`kerbscale.mjs`: s=0.75 → 0 survivors) while leaving an obviously visible
~L132 cyan bar. A metric that reads 0 while the defect is on screen is §16's failure shape.
Primary is therefore the **frozen-set mean lift**: mean of `L(arm) − L(norim)` over the frozen
1,691-px base set (per-boot re-frozen from that boot's own base/norim pair; the ROI and
definition above are what is sealed). Count is reported for continuity only.

## The change under test (patch lands post-freeze, default no-op; goldhalo pattern)

`toon.glsl.js:660`'s shadow-side rim floor `mix(0.55, 1.0, sh)` — the term's own comment
already names it as the only lever for a rim "lit by nothing" and demands night re-measure.
Patch: `float rimFloor = mix(uRimShadowFloorArch, 0.55, vSlySkin);` then
`mix(rimFloor, 1.0, sh)`. Uniform default **0.55 = bit-identical no-op** (mix identity);
character (vSlySkin=1) keeps 0.55 at every arm by construction — the §24.3 trap ("narrowing
the band narrows the character's rim in the same proportion") is sidestepped by scoping, not
by tuning. The alternative lever named in §24.3 (uRimPower narrowing) is declined at design
time for exactly the §24.3 sentence. ToonMaterial.js exposes `TUNE.rimShadowFloorArch: 0.55`
and republishes per frame (poke-live, no recompile).

## The run (one boot, FIFO ticket, detached per §14)

Shots: `hero` (verdict), `sly-closeup` (character guard), `night` (the 0.55's stated
beneficiary), `courtyard` (intended-edge-rim guard, §24.4). Arms in order per shot:
**a0 (0.55), f35 (0.35), f20 (0.20), f10 (0.10), norim (rimGain 0 + rimStrength 0), a0b** —
uniform poked live, readback printed per arm (rimsweep discipline), report.json incremental.

## Registered predictions and bands

Offline arithmetic (`kerbscale.mjs`, display-linear scaling of the base−norim delta; DECLARED
BIAS: the true add is scene-linear pre-AgX, AgX concave ⇒ true display residual ≥ the linear
estimate): shadow-side scaling s = floor/0.55 → f35 s 0.64 → predicted V1 ≈ 70; f20 s 0.36 →
≈ 40; f10 s 0.18 → ≈ 20, each a lower bound.

- **F1 (validity, temporal-mask form — amended before any kerb pixel exists, on
  RESULT-combatrim's finding that within-boot sequential arms alias animated FX):** per shot,
  px where a0 ≠ a0b form the TEMPORAL MASK and are excluded from every statistic below
  (`night`'s sparkles and any flame are expected members). The sweep is invalid for a shot
  only if the temporal mask exceeds **3% of frame** or the per-arm uniform readback shows a
  knob not at its commanded value. Mask size and cluster locations are reported per shot.
- **V1 — kerb frozen-set mean lift (hero), per arm.** Bands (L units, partition [0,∞)):
  **[0,15] band-gone** (norim-equivalent for the eye; norim's own value is 0 by definition) ·
  **(15,45] reduced-visible** · **(45,∞) prominent**. Point predictions: a0 ≈ 110 (calibrated
  102.9+8), f35 ≥ 70, f20 ≥ 40, f10 ≥ 20 — if f10 lands in [0,15] the concavity bias was
  larger than modelled; that is a finding about the model, stated here so it cannot become a
  post-hoc explanation.
- **V2 — character retention (sly-closeup):** rim-lifted px in the charvis-current subject
  bbox (lift ≥ 8 L vs norim), r = arm/a0. Bands: **[0.97,∞) pass** · **[0.90,0.97)
  marginal-fail** · **[0,0.90) fail**. Prediction: 1.00 ± bloom-bleed (§20); the surface term
  is exempt by construction, so r < 0.97 means the screen rim or bloom coupling is carrying
  more of his rim than §24.1 measured — a finding that must be named, not absorbed.
- **V3 — night whole-frame rim retention:** rimPx (lift ≥ 8 L vs norim) ratio arm/a0. Bands:
  **[0.85,∞) pass** · **[0.70,0.85) marginal — coordinator judgment with crops attached** ·
  **[0,0.70) fail, arm dies** (the 0.55 floor is what night's rim buys; the shader comment is
  the contract).
- **V4 — courtyard intended-edge retention:** same rimPx ratio. Bands: **[0.80,∞) pass** ·
  **[0.60,0.80) marginal** · **[0,0.60) fail** (§24.4: courtyard's rim-caused count is the
  FEATURE; an arm that deletes it trades a defect for a §7.3 failure).
- **Ship rule (registered):** candidate = the LARGEST floor whose V1 band is "band-gone" or
  "reduced-visible" with V1 ≤ 45 AND V2 pass AND V3 pass AND V4 pass. No arm qualifying →
  report bands per arm, no ship, and the residual routes back to §24.3's "not fixed,
  deliberately" state with these numbers attached.
- Crops of the kerb ROI at every arm are published with the verdict (the look is reported
  with the numbers; no adjective in this file is load-bearing without its threshold).

Runner to be written as `kerbrun.mjs` from rimsweep2's INSTALL/SNAP pattern (uniform readback
printed per arm). No captures, no source edits, no commits until the coordinator lifts the
freeze and approves the run.
