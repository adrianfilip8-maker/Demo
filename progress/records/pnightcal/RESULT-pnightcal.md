# RESULT-pnightcal — registered scoring of the pnightcal r3 capture

Scored by SHADING (fresh spawn, post-§163/§164 rollbacks), 2026-08-05, from committed
evidence only. Seal: `PREREG-pnightcal.md` as committed — every threshold executed as sealed,
including the two logged amendments (O1's ROI pairing; G1 gating on dHue sign + R/G only,
B/max reported never gated). Nothing in this file re-derives a line. This file is being
written incrementally as gates compute (§163.2 rollback protection); an abrupt end means a
rollback took the session, not that scoring stopped by choice.

**STATUS: FINAL — VERDICT: FAIL.** L1 +1.556° > 1.40° with all V-gates, all G-gates, and
L2/L3/L4 passing; compose does not ship on this seal (A.4). The verdict block at the end
has the full statement; the published recut number is the night-safe sbm ceiling **0.0845**.

## Evidence scored (all committed at `794d277`)

- Frames: `progress/records/pnightcal/frames/night-{base,sbm020,sbm040,compose,base2}.png`
- Provenance + per-arm readback: `progress/records/pnightcal/pnightcal.json`
  (run sha `a35e37e`, srcTree `bc13c4632863fc15` before AND after, renderTree
  `5b075ca0b494f8d2` before and after, five arms, every `mismatch` list `[]`)
- Run log: `progress/records/logs/pnightcal-r3.log` — boot ok (SwiftShader), lever probe
  matches ship (`sbm 0.05/0.05, fill 0.7, rimFloor 0.55`), five arms `applied ok`,
  `srcTree after (STABLE)`, `done` at +1530 s.
- Scorer: `progress/records/pnightcal/pncscore.mjs` (sealed, committed 04:16Z, before the
  capture finished 04:45Z). Not modified for this scoring.
- ROI: `roi-night-cal.json` was absent at scoring start (a rollback took the pre-capture
  generation); regenerated for scoring with the registered generator `roigencal.mjs night 4`
  and since committed by the coordinator's sweep at `13cf0c4`. The
  current tree's `find src -name '*.js'` hash is `bc13c4632863fc15` — **equal to the
  capture's stamped srcTree** — so the regenerated ROI is built at the capture's tree by
  construction (V3's own definition). Generation runs `nice`d, no lock, no renderer
  (§157.6 class); fx22 holds the capture lock throughout and is untouched.

## Offline half — status at scoring time

Both offline results predate the capture and are recorded durably (O1's corrected-pairing
PASS in the prereg amendment at §6; O2's G4 gain 0.961 as a constant in the sealed scorer).
Per §160.1 — *a number you did not measure yourself is a citation, and a citation gets
re-derived before it licenses anything* — both are re-derived here from committed inputs
before the G-gates are read.

- **O2 re-derived: PASS, identical to the recorded run.** `synthcal.mjs` on the durable
  pnight1 base + stride-4 ROI: null re-encode dHue **exactly 0.000** on both populations;
  gains archShade 0.961 / 0.921 / 1.042 / 1.032 and sky 1.042 / 0.938 / 0.998 / 0.999 at
  δ = +1/+2/+5/+13, all inside [0.7, 1.3], sign positive. **G4's constant in the sealed
  scorer (gain 0.961 at +1°) is re-measured, not cited.** The sky half re-confirms L2's
  teeth: gain ~1.0 means a global warm drift ≥ 0.43° trips the 0.30° band.
- **Scorer selftest re-run (`scoretest.mjs`): every prediction hit.** The real `pncscore.mjs`,
  unmodified via `PNC_DIR`, on constructed rot-frames: V1–V4 PASS, G1–G3 PASS, L1 PASS
  (+0.961 ≤ 1.40), **L2 FAIL (1.042 > 0.30) as predicted** — the sky control catches the
  global-rotation failure class — L3 PASS, provisional verdict FAIL as predicted. (The
  wrapper's "exited 0 — UNEXPECTED" tail is its own noted quirk: the scorer exits 0 on a
  FAIL verdict, reserving nonzero for VOID/UNSCOREABLE; the verdict line matched.)
- **O1 re-derived: PASS under the amendment's corrected pairing, both halves.**
  `continuity.mjs` (as committed, stride-4 pairing) reproduces the amendment's recorded
  stride-4 triple **0.556 / 12.947 / 1.556** exactly — its printed "O1 FAIL — STOP" is the
  as-first-written pairing the amendment struck, reproduced as expected. A scratchpad
  harness (sealed statistic verbatim, `roi-night-preview.json` stride 12) reproduces the
  **published** §156.2 triple digit-for-digit: rimfloor0 **+0.882**, sbm040 **+13.025**,
  compose **+1.882**, sky(sbm040) **+0.019**, old compose sky bleed **+0.000** (inside the
  0.15° half-band → the L2 band stood at 0.30° unamended, as sealed). Old-tree L3 context:
  compose archShade meanLuma **+0.531 %** rel.

## V-gates (validity)

- **V2 (per-arm readback): PASS.** All five rows in `pnightcal.json` carry `"mismatch": []`;
  requested vs applied agree on every arm (base 0.05/0.05/0.7/0.55; sbm020 0.2/0.2/0.7/0.55;
  sbm040 0.4/0.4/0.7/0.55; compose 0.1/0.1/**0**/0.55; base2 = base). The run log prints
  `applied ok` beside each arm's md5.
- **V4 (tree stability): PASS.** `srcTreeBefore == srcTreeAfter == bc13c4632863fc15`,
  `renderTreeBefore == renderTreeAfter == 5b075ca0b494f8d2` (log line: STABLE/STABLE).
  No §155.3 handling needed.
- **V1 (base ≡ base2 bit-identity)**: full md5 of the committed files:
  `night-base.png` = `night-base2.png` = `a46bae328c6cc385a1b83b9a06d16b0e` — byte-identical.
  The harness's truncated stamps (`a46bae328c6c`, `351c1d17be3b`, `a68ba204b537`,
  `c27eb3fe1a9d`) are exact prefixes of the committed files' full hashes, closing the
  run-log → json → committed-bytes provenance chain. Pixel-level confirmation at the
  registered threshold (any channel ≥ 1, §122.1) is the sealed scorer's V1 check — below.
- **V3 (ROI at capture tree)**: `roigencal.mjs night 4` run at the current tree, whose
  `src` hash equals the capture's stamp; the scorer re-checks the stamp from the artifacts.
  Result below.

## L4 — the P-frame look (done before the scorer's verdict was read)

Method: all five frames opened 1:1; per-arm 4× nearest-neighbour crops of three regions
(shaded hieroglyph wall x60–380 y200–440; central shaded platform x560–880 y380–620; sky
x880–1200 y40–220), stacked base/sbm020/sbm040/compose; plus ×8-amplified |diff| maps vs
base for each arm. Threshold stated per §122.1 for every count below.

- **The known-bads are visibly bad, in dose order — the frames calibrate the eye the way
  the arms calibrate the statistic.** At 4×, `sbm040`'s shaded platform deck and hieroglyph
  wall shift from the authored blue-slate to a muddy brown-violet; the cool identity of the
  shaded mass is visibly gone. `sbm020` shows the same shift faintly (visible in
  side-by-side, would not be flagged alone). In the ×8 diff maps the signature is a
  red-channel lift covering every away-facing architecture surface, sky black.
- **`compose` is visually indistinguishable from `base`** at 1:1 and in all three 4× crop
  regions. Its ×8 diff map shows the same red-channel architecture-confined signature at
  trace amplitude plus a few isolated sparkle/ember specks — the mechanism's footprint,
  far below visibility, exactly where the lever feeds and nowhere else.
- **The sky dome does not move in any arm, including sbm040** (4× crops identical; diff
  maps black over sky). The L2 control's cleanliness is mechanical — no poked uniform
  feeds the dome — not statistical luck.
- Frame-wide pixel movement vs base (any-channel ≥ 1 / ΣRGB ≥ 8): compose **69.58 % /
  0.47 %** (max |Δch| 52), sbm020 81.28 % / 3.47 % (max 54), sbm040 84.13 % / **37.18 %**
  (max 81). compose's any-channel share echoes the old tree's published 69.44 % — the
  change is overwhelmingly sub-threshold dither; the ΣRGB ≥ 8 share is dose-ordered
  compose < sbm020 < sbm040.
- **Picture and statistic agree.** No divergence finding; L4 raises nothing against the
  hue table, and the subject is present in every frame (§122.3 answered: same staging,
  Sly at the lantern, moon upper-left, all five frames).

**L4: PASS.**

## ROI (V3 input) — landed and stamped

`roigencal.mjs night 4` (offline, `nice`d, no lock, no `src/**` writes) emitted
`roi-night-cal.json` with `srcTree bc13c4632863fc15` — **equal to both capture stamps**.
Populations: archShade **42 812**, archLit 3 400, sky **9 097** (a real control denominator,
§128.2 answered; `sphinx` 0 — not in the night framing, not a scored population).
**§158.5 drift on this shot-tree pair is exactly zero:** sample membership is point-for-point
identical to the pnight1 ROI on all three scored populations — so O2's calibration (run on
the old ROI) transfers to the scoring ROI sample-for-sample. The old ROI carried no tree
stamp (that was roigencal's registered change #2); the new one does.

**Frames-are-new proof** (the median coincidences below made this worth nailing): every
pnightcal frame md5 differs from every pnight1 frame md5 (base `a46bae…` vs `05c1b3…`,
compose `c27eb3…` vs `6fdf00…`, sbm040 `a68ba2…` vs `c374aa…`). The archShade hue medians
landing on the same lattice points across trees (224.444, +1.556) is quantization of a
median over 8-bit-derived hues; the columns that do differ (satP50 0.793 vs 0.783 on sky,
R/G 0.550 vs 0.552, sky hueP50 215.604 vs 215.625, frame-wide B−R 0.1609 vs 0.1605,
meanLuma 21.85 vs 21.89) prove the frame sets are distinct.

## The registered scoring — sealed scorer output (`pncscore.mjs`, unmodified, exit 0)

Scorer-confirmed V-gates: **V1 PASS** (0 differing px at anyCh ≥ 1), **V2 PASS**,
**V3 PASS** (ROI tree == capture tree), **V4 PASS** (srcTree stable). No VOID.

### night / archShade (subject, 42 812 samples)

| arm | hueP50 | dHue | satP50 | R/G | B/max | meanLuma | G-darkest% |
|---|---|---|---|---|---|---|---|
| base | 224.444 | +0.000 | 0.800 | 0.550 | 2.064 | 21.85 | 6.2 % |
| sbm020 | 229.286 | **+4.841** | 0.733 | 0.679 | 2.100 | 22.18 | 12.3 % |
| sbm040 | 237.391 | **+12.947** | 0.667 | 0.842 | 2.152 | 22.55 | 36.0 % |
| compose | 226.000 | **+1.556** | 0.775 | 0.598 | 2.075 | 21.98 | 7.6 % |
| base2 | 224.444 | +0.000 | 0.800 | 0.550 | 2.064 | 21.85 | 6.2 % |

### night / archLit (reported population, 3 400 samples)

base 221.311; sbm020 +3.689; sbm040 +9.458; compose **+1.546**; base2 +0.000.

### night / sky (control, 9 097 samples)

base 215.604; sbm020 **+0.021**; sbm040 **+0.021**; compose **+0.000**; base2 +0.000.
Even the 4×-ceiling known-bad moves the sky only 0.021° — the control is mechanically
clean (no poked uniform feeds the dome), and compose's sky is exactly zero.

### Frame-wide mean(B−R) — continuity link to §133.2 only, carries no verdict (§141.2)

base 0.1609; sbm020 −0.0082; sbm040 −0.0182; compose **−0.0033**; base2 +0.0000.
compose's −0.0033 on a base of +0.1609 reproduces §133.2's published −0.0033 on +0.1605.

## Calibration gates — the §13 half, on same-axis known-bads

- **G1 (sign + corroboration): PASS.** dHue(sbm020) **+4.841** > 0, dHue(sbm040)
  **+12.947** > 0; R/G rises on both: 0.550 → **0.679** (sbm020) and → **0.842** (sbm040).
  Warm-ward on this tree is **positive**, derived not assumed. Reported beside the gate,
  never gated (the registered amendment): B/max **rises** 2.064 → 2.100 / 2.152 — §156.2's
  expected signature (G falls at constant B; §115.2 green-blindness); G-darkest share
  6.2 % → 12.3 % / 36.0 % — the green-suppression signature, dose-ordered.
- **G2 (separation): PASS.** |dHue(sbm020)| = **4.841° ≥ 0.50°** — the 2×-ceiling arm
  separates at ~10× the registered floor. (pnight1's defect — a unit chosen from a
  blind-spot arm — cannot recur here: both units are same-axis and both separate.)
- **G3 (dose response): PASS.** 12.947 > 4.841 — the metric orders the 4× violation above
  the 2× violation.
- **G4 (resolution): PASS.** Offline synthcal, re-derived this session from committed
  inputs: gain **0.961** at δ = +1° (band [0.7, 1.3]), null re-encode exactly 0.000.

**The seal is scoreable.** No UNSCOREABLE path fires.

## The registered line

- **L1 (hue): FAIL.** |dHue(compose vs base)| on archShade = **+1.556°** against the
  registered **≤ 1.40°**. Warm-ward (positive), same sign as the known-bads, 0.156° over
  the line (11 % relative). The margin is resolved by the instrument: within the one fixed
  registered ROI the statistic's null is an exact zero (O2), and G4 measured gain ~1.0 at
  1°; the O1 amendment's ~0.3° figure is between-ROI sampling spread on identical frames
  and "does not apply arm-to-arm within one fixed ROI" (its own registered wording).
- **L2 (sky control): PASS.** |dHue(sky, compose)| = **0.000° ≤ 0.30°**.
- **L3 (luma guard): PASS.** Δ meanLuma(archShade) = 21.85 → 21.98 = **+0.584 %**,
  inside ±10 %. The hue drift is not bought by crushing or lifting the shade.
- **L4 (P-frame): PASS** — executed above, before the scorer's verdict was read. The
  known-bads are visibly bad in dose order; compose is visually indistinguishable from
  base; sky identical everywhere; picture and statistic tell one coherent story.

## Cross-tree continuity (report-only, voids nothing)

- sbm040 12.947° in [6.5, 26.1] — ok (old tree 13.025°).
- compose 1.556° in [0.94, 3.76] — ok (old tree 1.882°; the current tree moved compose
  0.33° **down**, toward the line, not over it from below).
- base hueP50 224.444° within ±3° of old base (224.444) — ok, dead centre.

## Published next to the verdict (registered in §4, whatever the verdict)

- compose = **32.1 %** of the 2×-ceiling separation (4.841°), **12.0 %** of the
  4×-ceiling separation (12.947°).
- Night response slope (deg per unit sbm): via020 **32.3**, via040 **37.0**, two-point
  **40.5** → conservative (registered: largest) **40.5**.
- **Implied night-safe sbm ceiling = 0.05 + 1.40°/40.5 = 0.0845** — compose ships at
  0.10, i.e. **above the measured night-safe ceiling**. This is the actionable number a
  future day-side recut needs; the prereg's own pre-capture linear forecast was ≈ 0.088.
- Not registered but adjacent and free: compose's dose is +0.05 of sbm **plus** the fill
  removal; via020 linearity forecasts 32.3 × 0.05 ≈ 1.6° for the sbm half alone, and
  compose measures 1.556° — consistent with §119.3 P6's finding that the fill gate moves
  night by ~nothing. The warmth is the bounce's, not the fill removal's.

---

## VERDICT: FAIL

**L1 fails (+1.556° > 1.40°) with every V-gate and every G-gate passing and L2–L4 clean.**
Per the seal's registered verdict rule (PASS iff L1 ∧ L2 ∧ L3 ∧ L4 ∧ G1–G4 ∧ V1–V4):
**P-night FAILS as registered, and per PREREG-compose1 A.4 — "a night regression voids the
day arms regardless of what they showed" — the compose treatment (sbm/Lit 0.10,
fillSkyMix 0) does not ship on this seal.**

What this verdict is and is not:

- **The seal worked.** Unlike pnight1, this FAIL is decided against same-axis known-bads
  that both separate (4.841° / 12.947°), with the sign derived, the dose ordered, the
  resolution proven, and the control at zero. There is no calibration artefact to escalate;
  the number the line was built for is the number that decided.
- **The frame looks fine, and that does not overturn L1.** The prereg's L4 clause makes
  the picture the finding when picture and statistic *disagree*; here they do not — the
  eye simply cannot resolve 1.5° of median hue on a 22-luma population, which is exactly
  why G4 exists (the instrument proves 1° where the eye proves nothing). The 1.40° line
  is a drift *budget* against the authored palette (1/5 of the spec's 7.0° headroom),
  not a visibility threshold; converting FAIL to PASS on "but it looks identical" would
  be §141.1's forbidden move, and §156.2 already records the project's answer: *the
  cheapest time to honour a seal is when the thing it blocks does not matter.*
- **The prereg's own honesty note forecast this outcome** (linear forecast FAIL at
  ~1.88°); the fresh measurement (1.556°) landed closer to the line than the forecast
  but on the same side. The seal stayed falsifiable in both directions and answered.
- **The actionable path is published above, as registered:** the measured night-safe sbm
  ceiling is **0.0845**. A composite recut at sbm/Lit ≤ 0.08 (fillSkyMix 0 unchanged —
  the fill removal contributes ~nothing to night warmth) is forecast at ~1.2° by this
  run's own conservative slope (40.5 × 0.03), under the line — but that is a **new
  treatment**, needing its
  own registration and capture; this seal licenses nothing about it beyond the numbers.
- The day-side measurements (§133.1: P-null 0 px, bands met, additive within noise)
  remain valid *measurements*; what A.4 voids is shipping this composite's values.

**STATUS: FINAL.** Scored same-wake as the landed capture (§163.2). No threshold was
re-derived, no gate was converted, no sealed file was modified.

## Files of this scoring

| path | role |
|---|---|
| `progress/records/pnightcal/RESULT-pnightcal.md` | this verdict (new) |
| `progress/records/pnightcal/roi-night-cal.json` | ROI at capture tree (generated this session by the registered tool) |
| `progress/records/pnightcal/{pncscore,roigencal,continuity,synthcal,scoretest}.mjs` | registered instruments, all run **unmodified** |
| scratchpad only (not durable): `o1-preview-pairing.mjs`, `l4/` crops + ×8 diff maps, synth frames | verification working files |
