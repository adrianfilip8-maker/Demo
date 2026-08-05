# RESULT-fxcluster — scoring of the PREREG-fxcluster capture (fxcluster1)

**Owner:** FX. **Executed:** 2026-08-05, fresh spawn, from committed files only.
**Status: IN PROGRESS — this file is written incrementally as chunks land (§163/§164
discipline; a rollback leaves whatever is above the waterline true).**

Capture: `progress/records/fxcluster1/` — runner `fxcluster1.mjs` (banda1 pattern: one
withGame boot per chunk, own FIFO lock hold, arms as live pokes, frames + readbacks written
the moment they exist, idempotent per-chunk resume). Scorer: the SEALED
`fxcluster-diag.mjs`, run per arm with env-overridden frame paths via the relocated copy
`fxcluster1/fxcluster-diag.mjs` (single changed line = the png.mjs import path, so its
outputs land in fxcluster1/ instead of overwriting the committed baseline out-JSON and
crops; verified byte-identical otherwise). The few registered quantities the sealed
scorer's sections do not emit (Q-A2 figure rect, Q-B1 hook-disc union count, Q-C4 blob-bbox
medSat, Q-E2/Q-E3 no-harm rects) come from `fxcluster1/score-aux.mjs`, which restates the
sealed masks verbatim and measures only — every threshold below is quoted from the seal.

## 0. Provenance and deviations (stated up front)

- **Tree drift since the seal.** The seal's registration tree is `342c51de123a5b26`; the
  tree at execution start is `2b7683df9d0ef6ad` (find-relative convention, both). Other
  owners landed between seal and capture. All three seam anchor sites were byte-identical
  to the lines the seal quotes (verified before edit), and every registered comparison is
  within-boot arm-vs-arm, so the A/Bs are unaffected; the frame-anchored base bands
  (C: medSat 0.370±0.02 etc.) are re-measured by each chunk's own base arm and adjudicated
  below. §128.6 flag, not a void.
- **Output directory.** The seal §2 names `fxc1/`; the coordinator's brief for this run
  names `progress/records/fxcluster1/`. The latter is used. Frames are FLAT
  `<shot>.<arm>.png` (banda layout), probe rows in `readback-<chunk>.json`.
- **Pre-edit.** Applied by the runner under a held capture-lock ticket BEFORE chunk 1,
  exactly as sealed (§1): Guard.js heading-tip debug read + clamp widened to (−0.6, 0.9);
  Particles.js SparkleField.preroll + debug-gated `_stageShot` call + `this.EMITTERS`
  exposure. All four seams are look-neutral by construction (flag undefined by default,
  shipped 0.35 inside both clamps, preroll uncalled, EMITTERS a reference exposure), and
  the seal registers them as **one ticketed commit** — i.e. they STAY for the coordinator
  to commit; per the decision table, a FAILED arm's seam is reverted instead. Fate of each
  seam is recorded in §6 after scoring.
- **base2 arm.** The seal's noise gate |base2−base| is read as a full pipeline repeat
  (re-`setShot`, same flag state), not a duplicate framebuffer read — otherwise Δ≡0 by
  construction and the gate gates nothing. Same procedure as every other arm minus the poke.

## 1. Chunk log

- 14:37Z pre-edit applied under a held capture-lock ticket, before any boot: srcTree
  `2b7683df9d0ef6ad` → **`a27b9bf12f7e1a82`** (the capture tree; every probe row below must
  stamp it). Seam sites (anchors as sealed, verified byte-identical before edit):
  - `src/ai/Guard.js` `_solveShotPose`: `const t = clamp(spec.towardCamera ?? 0.35, 0, 0.9)`
    → `clamp(this.engine.debug?.guardTowardCamera ?? spec.towardCamera ?? 0.35, -0.6, 0.9)`
    (+2-line comment naming the seal).
  - `src/fx/Particles.js` SparkleField: `preroll(sec)` method added between `end()` and
    `dispose()` (stamps `aData[i*4+2] = -sec` for live markers, `needsUpdate`).
  - `src/fx/Particles.js` `_stageShot`: after `this._sparkleTimer = 0;` →
    `if (this.engine.debug?.sparklePreroll === true) this.sparkles?.preroll(0.25);`.
  - `src/fx/Particles.js` constructor: `this.EMITTERS = EMITTERS;` after `this.TUNE = TUNE;`.
- Offline pre-checks (recorded before any frame existed):
  - The sealed E literals reproduce ×0.75-linear exactly: lin(0xdb9a68)×0.75 → `#c1875b`,
    lin(0xe8b878)×0.75 → `#cca269`. Expected el-15 poked blend (k=0.7183): linear
    ≈ (0.5840, 0.3278, 0.1309) ≈ `#c99b65`; shipped blend ≈ `#e4b074`; ratio ≈ 0.75. ✓
  - Expected A-cand applied heading from the committed port: (−0.588, 0.809), yaw ≈ −0.629;
    base heading (−0.069, 0.998), yaw −0.069.

- **Attempt 1 aborted by its own lever probe, zero frames taken.** Seam (a)'s anchor (the
  `_autoHidden` fold + one-line `dispose()`) is NOT unique in Particles.js — it closes four
  classes — and a first-occurrence replace put `preroll` on **LightShafts** instead of
  SparkleField. Chunk 1's boot probed `fx.sparkles.preroll` → absent → FATAL before any
  capture; chunks 1–2 refused, runner stopped before chunk 3 staged anything. Fix applied
  under a fresh lock ticket (anchor = the dispose directly before the FlameField banner,
  uniqueness asserted): srcTree `a27b9bf12f7e1a82` → **`3be168ae28832f69`** — the capture
  tree for attempt 2. The runner's seam table now carries the corrected anchor
  (rollback-resume safe). Log of the aborted attempt: `fxcluster1/run-attempt1.log`.
  (The §143.1 lesson landing on this task's own tooling: the guard that "would have blessed
  the broken thing" was the reason it didn't.)

(per-chunk boot + arm rows appended below as they land)

## 2. Sub-arm A — cone heading (guard)

(pending chunk 1)

## 3. Sub-arm B — sparkle staging preroll (traversal)

(pending chunk 2)

## 4. Sub-arm C — cane-impact emitted block (combat)

(pending chunk 2)

## 5. Sub-arm D — interior rails + Sub-arm E — far-haze convergence (dunes)

(pending chunk 3)

## 6. Verdicts, ship list, seam fate

(pending scoring)

---

## PER-ARM VERDICTS — scored by the coordinator at first wake per §163.2 (committed scorer score-all.mjs over the sealed instrument; FX transcripts died in the §172 rollback)

- **A (cone heading −0.20): UNSCOREABLE.** Q-A1 +6.48 sits in [+3,+45] and Q-A2 holds (0 ≥ −3),
  but the arm's own noise gate breached: |base2−base| 2.06 and |restore−base| 4.27 against the
  registered ≤1.0. The ROI is noisier across identical arms than the seal registered (guard idle
  + FX flicker), so the §13 calibration the 3× clause rests on is void — a +6.48 signal cannot
  be certified at 3× the *measured* noise. Nothing to revert (runtime poke). Successor: a
  noise-tolerant design (multi-frame median or frozen guard animation in staging), same lever.
- **B (sparkle preroll): UNSCOREABLE on the letter; mechanism PROVEN.** Base 0 ≤ 10 (attribution
  correct), cand 440 ∈ [60,4000] — the §2.1.6 mandatory grammar renders, and Q-B2's 236 strict-
  band px mean no colour re-registration is needed. But the restore gate read 440 vs ≤5: the
  preroll's born-stamp back-dating persists after the flag re-asserts OFF, so restore ≠ base and
  §94.2d's success reading fails. The contamination is downstream of base→cand and mechanistically
  the treatment's own persistence — recorded, not defended. NO SHIP this seal; the corrected
  re-run (restore by re-stage, one boot, traversal only) is the cheapest item in the queue.
- **C (cane flash recolour): NO SHIP by Q-C4.** Seven of eight quantities in band (chalk halved
  0.136→0.061, blob 7235→1655 px, medSat 0.370→0.408, base anchors reproduce), but the blob-bbox
  medSat at L≥200 read 0.192 against ≥0.20 — the recoloured core is still a shade too pale, and
  the restore blob (8465 vs 7304±15%) wobbles with the registered flash-phase caveat. Successor:
  warmer col0 on the same block; the direction and magnitude are proven.
- **D (interior motes): VERIFICATION PASS.** Coverage 1.25% ≤ 2.5%, widest 44 px ≤ 60. CRITIC's
  156-px/11.3% population is confirmed absent on the current tree; the stale-frame hazard stands
  recorded; the rails become regression guards.
- **E (dunes fog anchor): NO SHIP.** Q-E1 cand 2.3 against [+8,+22] — the ×0.75 anchor barely
  moves the pyramid separation — and Q-E2's temple collateral breached (8.64 > 6.0). The
  isoluminance driver is not the anchor colour alone; the finding reinforces the seal's own
  routing: the dead `setAtmosphere()` side-door wiring (SHADING's) is the real fix.

**Ships from this seal: none. The committed seams stay (registered, debug-gated, proven inert
by base-arm bit-identity). Successor queue: B's corrected re-run (cheapest), C's warmer core,
A's noise-tolerant re-design, E rides SHADING's atmosphere-wiring fix.**
