# PREREG-fxcluster-a2 — sub-arm A, second letter: same heading lever, residue-pinned staging

**Owner:** FX. **Date sealed:** 2026-08-05, before any a2 capture exists.
**Parent:** PREREG-fxcluster §A (first letter: UNSCOREABLE — Q-A1 +6.48 sat inside [+3,+45]
and Q-A2 held, but the arm's own noise gate breached: |base2−base| 2.06 and |restore−base|
4.27 against the registered ≤1.0, so the §13 3×-noise clause was void). The parent verdict
stands. This seal changes ONLY the viewing design; the lever is the parent's, port-proven:
`debug.guardTowardCamera = −0.20` through the committed Guard.js seam.
**Registration tree:** `be5c1da17ca5bad4` (src/fx, src/ai/Guard.js, src/core/Debug.js
verified byte-identical to HEAD at sealing; the hash differs from c2/c3-era stamps because
other owners' commits and mradius's revert landed — none touch the files this seal quotes).

## 0. Noise diagnosis — measured on the COMMITTED first-letter guard frames before sealing

The dispatch offered multi-frame median / frozen guard idle / noise-scaled gate, to be
picked "by measurement of the committed guard arms' noise structure". Measured on
`fxcluster1/guard.{base,base2,cand,restore}.png` (masks stated; ROI = the registered
(340,280,700,350)):

- **The first letter's "guard idle + FX flicker" attribution is REFUTED by geometry and by
  the pair structure.** The guard figure rect (852,220,990,700) lies entirely OUTSIDE the
  ROI — idle sway cannot move ROI pixels. And the two identical-state pairs are NOT equally
  noisy: base↔base2 meanAbs|ΔL| 2.26 with 684 px ≥10, base2↔restore **1.74 with 5 px ≥10**.
  Stochastic flicker would make every identical-state pair equally noisy; instead the noise
  happened ONCE, between arm 1 and arm 2, and then froze.
- **Where it lives:** the ≥10 diffs concentrate in the ROI's right-edge cells x∈[640,700)
  (679 of 684 px) — one object appearing after the first restage and persisting — and the
  broad component is a MONOTONE medL rise concentrated in the ROI's dark right half
  (71.76 → 73.89 → 75.32 across base → base2 → restore) while the lit left half barely
  moves (118.3 → 119.2 → 120.6).
- **That is the c2-proven pool-residue signature, not noise:** `Batch.commit`'s
  `time > _deathMax` empty test (Particles.js:1527) is unreachable after `_stageShot`'s
  clock re-base, so each restage resurrects the previous staging's cohorts near-peak
  (fires preroll + the guard shot's staged `coin_sparkle`). Deterministic, monotone,
  additive — exactly what the parent measured as 2.06/4.27 "noise". c2 measured the cure:
  with a pre-arm pool wipe, restore ≡ base to the pixel (0% on every stat).

**Pick: residue-pinned staging (the c2 pool wipe), NOT multi-frame median and NOT a
noise-scaled gate.** A median attacks stochastic variance; this variance is deterministic
accumulation, so K samples of the same contaminated state median to the contaminated state.
A noise-scaled gate at the measured 4.27 would demand ≥12.8 L from a +6.48 L effect —
certifying nothing. The wipe removes the mechanism; the parent's ORIGINAL ≤1.0 gate then
stands as registered.

## 1. The arm — lever identical to the parent

`debug.guardTowardCamera = −0.20` (shipped 0.35), poked in the cand arm through the parent's
committed Guard.js seam (`_solveShotPose` debug read + widened clamp — verified present
before boot, no src edits). Staging: the PROVEN pool wipe before EVERY arm identically
(non-looping Batch rings + Decals zeroed, fresh setShot('guard') rebuilds staged content).

Arms, one boot, guard only: **base → base2 → cand → restore** (base2 = full pipeline repeat,
no poke — the in-run noise measurement; restore deletes the flag).

## 2. Bands (parent §A carried verbatim; scorer = sealed diag §A + score-aux A)

| quantity | band |
|---|---|
| Q-A1 ΔmedL cand−base, ROI (340,280,700,350) | **[+3.0, +45.0]** |
| noise gates: \|base2−base\| and \|restore−base\| ROI medL | **≤ 1.0 each** (as originally registered) |
| §13 clause: Q-A1 ≥ 3 × max measured same-state Δ | carried (with the wipe this binds at ≤3.0) |
| Q-A2 no-harm: guard figure rect (852,220,990,700) ΔmedL cand−base | ≥ −3.0 |
| Q-A3 context (not a gate): air-column rect (700,300,850,500) \|Δ\| | expected ≤ 8, report |

Parent port prediction carried: −0.20 routes beam t 0.03-0.23 through the ROI at
un-suppressed `near`; first letter measured the effect at +6.48 — inside the band, blocked
only by the void calibration this seal repairs.

## 3. Known-bad and calibration (§13)

Base is the known-bad (Δ≡0 by construction); base2 is the in-run noise sample under the
wipe. c2's committed evidence (restore ≡ base at 0% across every stat) predicts
|base2−base| ≈ 0; the registered gate stays at the parent's ≤1.0, and the 3× clause becomes
satisfiable exactly as the parent §13 intended.

## 4. Falsifiers (revert-not-defend; the lever is a runtime poke)

- **P-A2a:** |base2−base| > 1.0 DESPITE the wipe → the residue mechanism is not the whole
  ROI variance → UNSCOREABLE again, and the recorded pair-structure (which pixels, which
  cells) is the finding. No design iteration mid-run (§141).
- **P-A2b:** Q-A1 < +3.0 → the heading cannot express the cone at this staging → no ship;
  the cone item rides the parent's §4-R1 route to COORDINATOR alone.
- **P-A2c:** Q-A2 breach → no ship (the shot's subject is the guard first).
- **Restore breach with base2 clean** → one-sided contamination from the cand poke itself
  (flag-delete path defect in the seam) → record, no ship, re-diagnose from probes.

**§17 declaration (parent's, carried):** the guard's body yaw turns ~30° lens-away in the
cand arm; `SHOT_POSE.guard.look` compensation is available but is NOT part of this arm — one
lever.

## 5. Chunk plan — one boot, guard only

Runner `fxcluster1/a2rerun.mjs` (c2/c3 pattern: seam verify no-edit — Guard.js
`guardTowardCamera` seam + Particles.js EMITTERS/batches poke path — FIFO lock via withGame,
wipe+restage per arm, incremental `a2-guard.<arm>.png` + `a2-readback.json` + `a2-run.log`).
Probes per arm: parent's guard probe (guard0 pos/yaw/forward, `_light`, uOpacity, beamCol0,
flag state) + pool stats at three moments + playerPos, tod, camera, srcAtArm.
**Scorer:** `fxcluster1/a2score.mjs` — the SEALED relocated `fxcluster-diag.mjs` §A with
`FXC_GUARD` env-overridden per arm + `score-aux.mjs A` (figure rect), a2-prefixed outputs;
thresholds transcribed from §2.

## 6. Decision table

| outcome | action |
|---|---|
| Q-A1 in band + noise gates + Q-A2 PASS | **ship = `SHOT_POSE.guard.towardCamera 0.35 → −0.20` (+clamp stays widened), coordinator's edit in src/ai/Guard.js** |
| P-A2a | UNSCOREABLE — pair-structure recorded, nothing ships |
| P-A2b | no ship — cone → COORDINATOR (parent §4-R1) |
| P-A2c | no ship |
| restore breach | record mechanism, no ship |

## 7. Files of record

`progress/records/PREREG-fxcluster-a2.md` (this seal); `fxcluster1/a2rerun.mjs`,
`a2score.mjs`; `a2-guard.{base,base2,cand,restore}.png`, `a2-readback.json`, `a2-run.log`,
`a2-scores.json`, `diag-a2-guard.*.json`, `crops/a2-guard.*`; verdict appended to
`RESULT-fxcluster.md`.
