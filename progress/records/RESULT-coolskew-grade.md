# RESULT — cool-blue character skew, GRADE side, scored against PREREG-coolskew-grade.md verbatim

Provenance: frames `shots/cap5/sly-closeup.png` + `sly-key.png` (boot 7b0e3f8 dirty:false, the
RESULT-cap5 verdict frames — no new capture). Instrument `coolskew-read.mjs` frozen from the
sealed ROI spec before any statistic existed; model `coolskew-model.mjs` run and recorded before
the seal. Tree at analysis `f026ef3`, SRC FREEZE respected — no source touched. Blind protocol
respected: TEXTURES' `PREREG-blueskew-albedo.md` and every TEXTURES blueskew artifact remain
UNOPENED by me at write time; my seal was announced after writing, and the coordinator holds the
comparison.

## Controls (bind on the verdict frame): PASS

WALL-SHADOW hueP50 **216** ∈ [200,240]; WALL-LIT **19** ∈ [10,60] (sly-closeup). The frame's
grade state matches the t16ab record; verdict bands are claimable. (sly-key's WALL-LIT box has
n 0 — the +4 m translation moved the lit wall out of that box; controls were sealed on the
verdict frame and pass there. PAVING-SHADOW reads warm 19° in closeup and cool 216° in key —
the two frames' shadow environments differ by design, K1.)

## P1 — PRIMARY: **Band A, GRADE-owned**

TAIL-LIGHT-SHADOW, cap5/sly-closeup: n **1088** (≥400 ✓), satP50 **0.470** (≥0.10 ✓),
hueP50 **197**, med rgb 79,129,148, G≥R with **R>G share 0%**.

- Band A is [150,226] AND G≥R → met exactly. Model point prediction 194 ± 25 → measured 197
  (Δ3°); sat band 0.36 ± 0.12 → measured 0.470 (inside, at the top edge).
- H-AUTH's registered-by-me counterfactual for this population — warm cream, hue ~34, R>G —
  is **refuted on the primary population**: not one pixel of 1,088 has R>G. The tail's light
  bands are authored warm (`cream #e4dfcb`, sRGB hue 48) and display teal-blue; only the light
  can do that.
- Replicate MUZZLE-CREAM (same albedo family, same frame): 195 / 0.286, Band A again.

## P2 — CHEEK-FURMID: **joint band [0.22, 0.40)**, measured satP50 **0.374** (n 272)

Not GRADE-dominant by 0.026. Reported as sealed — joint. Observation outside the seal, marked
as such: this ROI is lighting-mixed (its sly-key twin drops to 0.239 with G-dark 32%), and the
neutral-grey counterfactual at fur luma predicts 0.55 — the measured 0.374 sitting between the
authored-only ceiling (0.15) and the light-only prediction (0.55) is what a partial-key mix
looks like. Also true and worth keeping: furMid is authored slate blue-grey *on purpose*
(SlyModel.js's own comment), so "joint" on the fur is the authored intent working WITH the cool
light, not a contradiction.

## P3 — keyed flip: valid half lands **warm → multiplicative chain sufficient**

- MUZZLE-CREAM in sly-key: n 241 (≥100 ✓) — med rgb **141,132,127**, hueP50 **30**, satP50
  0.157, R>G 90% → sealed **warm** band. The same box in sly-closeup reads 195/0.286 cool.
  One authored material, cool in fill+shadow, warm cream under the key — lighting covariance
  confirmed; no additive display-space cool term is needed on keyed pixels.
- TAIL-TIP-WARM: n **36 < 100 → validity FAILS**, no band claimable. (The 36 gated px read
  pale blue 196/0.324; the cream blob visible in the crop is evidently smaller than the sealed
  box. A finding about the box, not about the mechanism; left uninterpreted per the seal.)

## Supporting rows (report, non-verdict)

| ROI | closeup | sly-key |
|---|---|---|
| TAIL-DARK | 211 / 0.940 / B/max 1.91 | 211 / 0.943 |
| RUFF-DARK | 219 / 0.590 | 237 / 0.386 (n 129, transit region) |
| TAIL-LIGHT | 197 / 0.470 | 196 / 0.461 |

Tail statistics are near-identical across the pair → the tail sits in fill+shadow in BOTH
frames (the +4 m key corridor did not reach it), which is exactly K4's "in both frames".

## Verdict, and what it routes to

**The cool-blue character skew is owned by the light+grade chain — the intended coloured
fill/shadow machinery (`fillSkyMix 0.70` sky fill, teal shadow light G/R 3.26, split cool leg,
saturation 1.30) acting on a subject that stands almost entirely inside the fill+shadow
population (§24.5). It is not authored-albedo blueness: the warm-authored cream displays teal
with zero R>G pixels, and the same material flips warm the moment the key reaches it.**
Model-vs-frame deltas for the record: hue +3°, sat +0.11 (model skips GTAO/aoTint and the fur
detail layer; both push measured sat above the model).

Routing as sealed: this is now an art-direction *magnitude* question, not a defect hunt —
- cheapest lever: staging/key access (§24.5's +2 m x corridor), not a grade knob;
- grade levers (`saturation`, split leg, fill hue) are global — §20's bleed warning attached,
  and **night must be re-measured first** per the ledger before any of them moves;
- no subject-scoped grade term exists today; creating one is a coordinator design decision.
- P2's joint band means TEXTURES' authored slate-blue fur is a real co-contributor on mid fur
  — by authoring intent. The coordinator's cross-comparison with their sealed registration
  decides whether any albedo question remains open.

Files: PREREG-coolskew-grade.md (seal), coolskew-model.mjs, coolskew-read.mjs, gridcrop.mjs,
csk-*.png (ROI placement crops). No commits from me.
