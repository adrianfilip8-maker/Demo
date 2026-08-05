# PREREG-fxcluster-c3 — sub-arm C, third letter: same warmer block, re-anchored instrument

**Owner:** FX. **Date sealed:** 2026-08-05, before any c3 capture exists.
**Parents:** PREREG-fxcluster §C (first letter: NO SHIP by Q-C4 0.192, restore wobble) →
PREREG-fxcluster-c2 (second letter: NO SHIP by P-C2c — Q-C3's L230 blob collapsed to 3 px
under the treatment; pool-wipe staging pin PROVEN at 0% restore error; Q-C4 uncertifiable on
an n=4 denominator). Both verdicts stand. This seal changes ONLY the instrument, exactly as
the c2 verdict's successor clause names: **fixed-geometry disc at the impact projection, sat
gate at L≥180, blob floor at L200** — and re-runs the SAME treatment block (its direction is
proven; its values do not move again this family).
**Registration tree:** `4ae5982932ab36be` (the tree all three c2 arms stamped; src/fx and
src/core/Debug.js byte-identical to HEAD at sealing).

## 0. Instrument calibration — measured on the COMMITTED c2 frames before sealing

All numbers below were measured on `fxcluster1/c2-combat.{base,cand,restore}.png` (committed
5c33e65) with the masks stated beside them (§122.1). The c2 frames are the IN-SAMPLE
calibration set; the c3 capture is the out-of-sample test — bands sealed here, before those
frames exist.

- **Blob floor at L200 (verifying the successor clause):** largest L≥200 4-neighbour
  component in the parent rect (300,300,760,600): base/restore **16048 px** (bbox touches
  the rect's left edge at x=300 — at L200 the white-class component MERGES with the doorway
  pool; stated so nobody reads the base anchor as a pure flash), cand **1899 px**, compact
  bbox (412,380)-(487,438). At L≥215 cand holds only 241 px — L215 would repeat c2's
  instrument miss. L200 is the highest floor that sees the treated core at thousands of px.
- **Fixed-geometry sat gate:** disc r=70 at the impact projection **(452,433)** (the parent
  seal's port, §0.3; coverage verified — cand's entire bright bbox sits inside). Pixels with
  L≥180 inside the disc: base/restore n=9392 medSat **0.153**, cand n=6657 medSat **0.398**.
  The denominator is geometric (disc ∩ luma floor) and holds thousands of px in BOTH
  classes — the §128.2 failure mode of c2's Q-C4 (n=4) is structurally excluded, and the
  classes separate by 2.6×.
- Restore ≡ base on every one of these numbers to the pixel in c2 (16048=16048, 0.153=0.153)
  — the wipe's determinism transfers to the new instrument unchanged.

## 1. The arm — treatment identical to c2 (no new lever)

The c2 block verbatim (alphas = parent block, col0 one rank warmer, poked via the committed
`fx.EMITTERS` seam; ships as an Emitters.js data edit only on PASS):

```
cane_flash  alpha [1.3,1.3]  col0 0xd4823a  col1 0xd4823a
cane_arc    alpha [1.0,1.6]  col0 0xd4823a  (col1 goldMid keep)
cane_spark  alpha [1.6,2.4]  col0 0xe8912a  (col1 goldMid keep)
cane_ring   alpha [1.4,1.4]  (colours keep)
```

Staging: the PROVEN c2 pool-wipe before EVERY arm identically (non-looping Batch rings +
Decals zeroed, fresh setShot('combat') rebuilds staged content through shipped code).

## 2. Bands (sealed)

| quantity (masks as §0 / parent) | band |
|---|---|
| Q-C1 figure (360,390,720,670) medSat | base 0.370±0.02; **cand [0.40, 0.62]** (carried) |
| Q-C2 figure chalk share (L≥180 & sat≤0.20) | base 0.137±0.010; **cand [0.015, 0.095]** (carried) |
| Q-C3′ largest L≥200 comp in (300,300,760,600), px | base 16048±15%; **cand [800, 12000]** |
| Q-C4′ medSat of L≥180 px in disc r=70 @ (452,433) | base 0.153±0.03; **cand [0.30, 0.55]** |
| Q-C4′ denominator floor (scoreability, both arms) | n(L≥180 in disc) ≥ **2000**, else UNSCOREABLE |
| restore ≡ base | Q-C1 ±0.02, Q-C2 ±0.010, Q-C3′ ±15%, Q-C4′ ±0.02 |
| separation (§13) | (cand−base) on Q-C4′ > 2×\|restore−base\| on Q-C4′ |

In-sample values sit mid-band by construction (cand Q-C3′ 1899 ∈ [800,12000], Q-C4′ 0.398 ∈
[0.30,0.55]); the cand ceiling 12000 sits BELOW the white-class 16048, so a flash that
re-blows to white FAILS Q-C3′ — the separation lives in the cand band, not the base anchor
(which at L200 includes the doorway pool, §0). Q-C2's floor keeps its §141.1 role: a frame
with no flash at all would read chalk ≈ 0 and FAIL the floor.

## 3. Known-bad and calibration (§13)

Base (shipped white flash, wiped staging) is the known-bad, measured in-run against anchors
taken from c2's committed clean stagings. Scale: the instrument separates known-bad from
treatment at 0.153 vs 0.398 (2.6×) with n ≥ 6.6k both sides — measured before sealing. The
in-run separation condition (table) re-proves it out-of-sample.

## 4. Falsifiers (revert-not-defend; levers are pokes, nothing on disk to revert)

- **P-C3a:** base misses any anchor (Q-C1/Q-C2/Q-C3′/Q-C4′ base bands) → wipe or world-drift
  re-diagnosis; UNSCOREABLE, nothing ships. (Tree-drift adjudication as c2: within-boot
  deltas remain valid; report.)
- **P-C3b:** Q-C4′ denominator floor breach on cand → the flash shrank below even L180 at
  scale → UNSCOREABLE; record; NO mid-run radius/threshold chase.
- **P-C3c:** cand Q-C4′ < 0.30 with probe-confirmed applied defs → emitted-spectrum ceiling
  through the AgX shoulder → NO SHIP, route to SHADING with numbers (parent §0.3 boundary).
- **P-C3d:** cand Q-C3′ outside [800, 12000] → low side: the core dims below L200 at scale —
  after two instrument generations this routes to the COORDINATOR (no third re-anchor by
  this owner mid-family); high side: the treatment re-blew white — regression, NO SHIP.
- **Restore breach:** staging-determinism finding — record pool probes, stop (§141).

**§17:** identical look change to c2 (carnelian flash, warm sparks, rimCool ring tail and
backdrop read through the un-blown region — the c2 crops are the declaration's picture).

## 5. Chunk plan — one boot, combat only

Runner `fxcluster1/c3rerun.mjs` (c2 pattern verbatim: seam verify no-edit, FIFO lock via
withGame — atmowire may queue too, politely — wipe+restage per arm, incremental frames
`c3-combat.<arm>.png` + `c3-readback.json` + log `c3-run.log`). Arms base → cand → restore.
Probes: EMITTERS defs requested-vs-applied, pool stats at three moments, playerPos, tod,
camera, srcAtArm.
**Scorer:** `fxcluster1/c3score.mjs`, committed WITH this seal before the capture — Q-C1/Q-C2
via the sealed relocated `fxcluster-diag.mjs` §C (unchanged masks), Q-C3′/Q-C4′ implemented
in the scorer itself restating §0's masks verbatim; outputs c3-prefixed (`c3-scores.json`,
`diag-c3-combat.*.json`, `crops/c3-combat.*`).

## 6. Decision table

| outcome | action |
|---|---|
| all bands + restore + separation PASS | **ship = the §1 block verbatim (Emitters.js data edit, coordinator's commit)** |
| P-C3a / P-C3b | UNSCOREABLE — named re-diagnosis, nothing ships |
| P-C3c | NO SHIP — residual to SHADING with numbers |
| P-C3d | NO SHIP — route per clause |
| restore breach | REAL finding — record, stop |

## 7. Files of record

`progress/records/PREREG-fxcluster-c3.md` (this seal); `fxcluster1/c3rerun.mjs`,
`c3score.mjs`; `c3-combat.{base,cand,restore}.png`, `c3-readback.json`, `c3-run.log`,
`c3-scores.json`, `diag-c3-combat.*.json`, `crops/c3-combat.*`; verdict appended to
`RESULT-fxcluster.md`.
