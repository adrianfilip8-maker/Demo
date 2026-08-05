# PREREG-fxcluster-c2 — sub-arm C successor: warmer flash core, staged clean

**Owner:** FX. **Date sealed:** 2026-08-05, before any capture window for this arm exists.
**Parent:** PREREG-fxcluster §1 sub-arm C (first letter: RESULT-fxcluster §4 — seven of eight
in band, NO SHIP by Q-C4 at 0.192 vs ≥ 0.20, restore blob 8465 vs 7304±15%). This seal
registers the successor named there: **warmer col0 on the same block**, plus the staging
hygiene the first letter's wobble turns out to require. Nothing in the parent is re-scored;
its verdict stands.
**Registration tree:** `src/**/*.js` find-relative sha256 `3be168ae28832f69` (same convention
as the parent seal; this is also the tree the parent's capture ran on — no src has moved).
**Scorer:** the SEALED `fxcluster1/fxcluster-diag.mjs` §C with `FXC_COMBAT`/`FXC_COMBAT_B`
env-overridden per arm + `fxcluster1/score-aux.mjs C` (Q-C4/Q-C3 bbox), via
`fxcluster1/c2score.mjs` — same relocation pattern as b2, c2-prefixed outputs, thresholds
transcribed not judged.

---

## 0. Diagnosis — why the first letter wobbled AND why its cand was biased

**The restore blob's +17% (8465 vs base 7235) was not stochastic flicker. It is a
deterministic accumulation mechanism, named in source:**

- `Batch.commit` empties a non-looping pool only when `time > this._deathMax`
  (Particles.js:1527-1529; Decals has the identical test, Decals.js:209). But `_stageShot`
  REBASES the FX clock to 0 on every 'shot' event (Particles.js:2559-2560). After a re-stage,
  `time` at capture is ≈ 0.05 while `_deathMax` holds deaths stamped in the previous epoch
  (0.11-0.55 for the cane family, seconds for smoke) — the test can never pass, `_used` never
  resets, and `instanceCount = _used` keeps drawing the old instances.
- Worse than "kept": in the shader their age is `uTime − born` with both re-based, so a
  particle born at ≈ 0.017 in a PREVIOUS epoch reads age ≈ 0.033 at the next arm's capture —
  **the previous staging's burst is resurrected near peak brightness**, stacked additively on
  the new one. Each re-stage appends a cohort (`slot()` continues the ring, :1509-1510).
- Evidence from the first letter (all committed): monotone growth base → cand → restore in
  blob px (7235 → — → 8465), frame-wide L≥230 (7878 → — → 9356), goldPx (21602 → 21928),
  with the restore EMITTERS defs byte-identical to base in the probe (readback-2.json). The
  L≥230 pixels restore has and base lacks: 1478 px, of which 1382 sit in the two 160×120
  cells x∈[320,640) y∈[360,480) — **at the flash site**, not at torches or sky. Defs exact +
  growth monotone + growth localized at the impact = pool residue, not phase noise.
- **The bias this puts on the parent's cand:** base's resurrected WHITE cohort sat inside
  cand's scored bbox, dragging blob-bbox medSat white-ward. The parent's Q-C4 = 0.192 was
  measured over cand's own carnelian core PLUS white residue — the 0.008 miss is partly or
  wholly an artefact of arm order. (Recorded as diagnosis, not as a re-score of the parent.)
- The frame-anchored base bands themselves are safe: gold1/sbs1 were each their boot's FIRST
  combat staging (that is why they were pixel-identical cross-boot, parent §0.3), and each
  `setShot` double-applies (Debug.js:128/:140), so the anchors describe a **clean first
  staging's double-cohort state** — exactly the state the wipe below reproduces per arm.

**Design consequence — phase-PINNED staging, not a phase-tolerant metric.** The dispatch
offered either. A tolerant metric (ratios, wider restore bands) would absorb the ±17% wobble
but CANNOT remove the white-ward bias residue puts inside cand's own measurement — a bias is
not noise. The pin: before EVERY arm identically (base included, so arms differ only by the
EMITTERS poke), wipe the transient pools' ring state and let the fresh `setShot('combat')`
staging pass rebuild everything through shipped code — fires (`_prerollFires`), burst
(`_onCaneHit`), decal — the b2 restore-by-restage philosophy applied to pools:

```
for each non-looping Batch b of fx.batches:  b._used = 0; b._head = 0; b._deathMax = -1;
                                             b.geometry.instanceCount = 0
fx.decals: same four fields
```

Looping/ambient fields (motes, airMotes) are untouched — they are density-sized, carry no
born stamps that survive re-basing into visibility, and `_motesBuilt = -1` re-seats them per
staging anyway. Sparkles untouched (not staged content in `combat`; B's seal owns that
field). `_fold` re-shows folded meshes on the next non-empty commit by construction
(one-sided fold, Particles.js:1543-1550), so a wipe cannot leave a mesh stuck hidden.

## 1. The arm — one lever, registered values

Poked via `fx.EMITTERS` (the parent's committed seam (c)); ships as an Emitters.js data edit
only on PASS. Alphas are the parent block's values UNCHANGED; the lever is col0 alone —
**one rank warmer along the port ordering the parent registered (d4823a > e8912a > ff9a3c >
goldLight in surviving chroma), on the three members the dispatch names:**

```
cane_flash  alpha [1.3,1.3] (keep)   col0 0xe8912a → 0xd4823a   col1 0xd4823a (keep)
cane_arc    alpha [1.0,1.6] (keep)   col0 0xe8912a → 0xd4823a   col1 goldMid (keep)
cane_spark  alpha [1.6,2.4] (keep)   col0 0xffc84d → 0xe8912a   col1 goldMid (keep)
cane_ring   alpha [1.4,1.4] (keep)   colours keep (rimCool tail stays the FX-blue pole)
```

Restore arm pokes the SHIPPED values back (snapshot taken in-page at cand poke, §94.4
requested-vs-applied in every probe).

Why this clears 0.008: two independent mechanisms, either sufficient — (1) the wipe removes
the white residue that biased Q-C4 down in the parent's cand; (2) d4823a is the next rank in
surviving post-AgX chroma per the parent's committed port. Port prediction (direction-only,
per the parent's stated port caveat): cand Q-C4 ≈ 0.22-0.28.

## 2. Bands (sealed; scorer masks identical to the parent's)

| quantity | band |
|---|---|
| Q-C1 figure (360,390,720,670) medSat | base 0.370±0.02 (anchor); **cand [0.40, 0.62]** |
| Q-C2 figure chalk share (L≥180 & sat≤0.20) | base 0.137±0.010; **cand [0.015, 0.095]** |
| Q-C3 flash blob: largest L≥230 comp in (300,300,760,600), px | base 7304±15%; **cand [400, 4800]** |
| Q-C4 blob-bbox medSat at L≥200 | **cand ≥ 0.20** (carried verbatim — the parent's failed gate) |
| restore ≡ base on Q-C1..C3 | within the base tolerances (carried) |
| Q-C5r (report, non-gating) | \|restore−base\| on Q-C3 as a share; predicted ≤ 5% with the wipe (parent measured 17% without) |

All cand/base bands carried verbatim from the parent seal — same thresholds beside same
masks (§122.1). Q-C4 base value is REPORTED beside cand as the known-bad reference.

## 3. Calibration and known-bad (§13, house pattern)

**The shipped white flash IS the known-bad, and it is measured in-run as the base arm** — the
same shape as sub-arm B's calibration. Scale for Q-C4: the parent measured the known-bad
class at 0.159 (base) / 0.165 (restore) and the treatment at 0.192 — the metric moves with
the treatment and its known-bad sits ≈ 0.16. Registered separation condition: **cand−base on
Q-C4 must exceed 2× |restore−base| on Q-C4** (both measured in this run). If the base/restore
spread reaches half the treatment gap, the instrument cannot certify at this noise —
**UNSCOREABLE is the registered outcome** (§141), recorded, not defended.

## 4. Falsifiers (revert-not-defend; all levers are runtime pokes — nothing on disk to revert)

- **P-C2a (wipe validity):** base arm misses ANY of its three frame anchors (Q-C1/Q-C2/Q-C3
  base bands) → the wipe deleted something staging does not rebuild → UNSCOREABLE, no ship,
  re-diagnose from the pool-stat probes. The anchors were measured on known-clean first
  stagings, so a clean-staged base has no excuse to miss them.
- **P-C2b (lever ceiling):** probe confirms applied defs AND clean staging AND Q-C4 < 0.20 →
  the emitted-spectrum lever cannot reach the band through the AgX shoulder at these alphas →
  NO SHIP; the residual routes to SHADING with this run's numbers (the parent's §0.3
  boundary). FX does not iterate another colour rank mid-run (§141).
- **P-C2c (any other cand band miss):** revert the block poke, record which band and the
  probe state. If Q-C3 < 400, the specific reading is: the carnelian core dropped below the
  L230 instrument floor — a successor would need re-anchored blob luma, not a warmer colour.
- **Restore gate breach despite the wipe:** a REAL staging-determinism finding — the residue
  mechanism above is not the whole story; record the pool-stat probes (before-wipe /
  after-wipe / after-staging per arm) and stop. No design iteration mid-run.

**§17 declaration:** the impact flash reads deeper carnelian instead of pale gold; spark
streaks warm one rank. Declared, intended, bounded to staged combat captures until the
coordinator ships the block.

## 5. Chunk plan — one boot, combat only (§164)

Runner `fxcluster1/c2rerun.mjs` (b2 pattern: per-chunk resume, FIFO lock via withGame,
frames + readback INCREMENTALLY, no git, no src edits — seam presence verified before boot,
abort if absent). The lock queue currently holds skyswirl/mradius work — queue politely.

| step | action |
|---|---|
| arm base | wipe pools → setShot('combat') → settle (step 10, dt=0) → probe → capture |
| arm cand | poke c2 block (snapshot shipped) → wipe pools → setShot → settle → probe → capture |
| arm restore | poke shipped values back → wipe pools → setShot → settle → probe → capture |

Probe per arm: EMITTERS cane defs (requested-vs-applied), pool stats {used, head, deathMax}
for every batch + decals at three moments (before wipe / after wipe / after staging+settle),
playerPos, tod, camera, srcAtArm tree hash. Frames `c2-combat.<arm>.png`, rows
`c2-readback.json`, log `c2-run.log`.

## 6. Decision table

| outcome | action |
|---|---|
| all cand bands + restore gates + separation condition PASS | **ship = the §1 block verbatim as an Emitters.js data edit (coordinator's commit)**, wipe stays capture-harness-only |
| P-C2a | UNSCOREABLE — wipe re-diagnosis, nothing ships |
| P-C2b | NO SHIP — chalk residual to SHADING with numbers |
| P-C2c | NO SHIP — record the band and mechanism |
| restore breach | REAL finding — record pool-stat evidence, stop |

Note the staging-residue mechanism itself (§0) is a capture-protocol defect, not a shipped
look defect (players never re-stage shots); whether `Batch.commit`'s epoch test deserves a
source fix is routed to the COORDINATOR as a hygiene item with this seal's evidence — it is
deliberately NOT a lever here.

## 7. Files of record

- `progress/records/PREREG-fxcluster-c2.md` (this seal)
- `progress/records/fxcluster1/c2rerun.mjs`, `c2score.mjs`
- `progress/records/fxcluster1/c2-combat.{base,cand,restore}.png`, `c2-readback.json`,
  `c2-run.log`, `c2-scores.json`, `diag-c2-combat.*.json`, `crops/c2-combat.*`
- verdict appended to `RESULT-fxcluster.md`
