# RESULT-pnightcal — registered scoring of the pnightcal r3 capture

Scored by SHADING (fresh spawn, post-§163/§164 rollbacks), 2026-08-05, from committed
evidence only. Seal: `PREREG-pnightcal.md` as committed — every threshold executed as sealed,
including the two logged amendments (O1's ROI pairing; G1 gating on dHue sign + R/G only,
B/max reported never gated). Nothing in this file re-derives a line. This file is being
written incrementally as gates compute (§163.2 rollback protection); an abrupt end means a
rollback took the session, not that scoring stopped by choice.

**STATUS: IN PROGRESS — do not cite until the VERDICT block at the end is present.**

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
- ROI: `roi-night-cal.json` was NOT committed (rollback took the pre-capture generation);
  regenerated for scoring with the registered generator `roigencal.mjs night 4`. The
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

*(scoring continues below as the ROI lands)*
