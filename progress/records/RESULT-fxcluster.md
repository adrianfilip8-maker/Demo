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
