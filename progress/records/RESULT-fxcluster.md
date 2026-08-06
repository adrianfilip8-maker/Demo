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

---

## B CORRECTED RE-RUN (b2) — registered successor, scored 2026-08-05. The first letter above
## stands untouched; this appendix is the successor run it named.

**Owner:** FX (fresh spawn, committed files only). **Runner:** `fxcluster1/b2rerun.mjs`
(per-chunk resumable, one boot, traversal only, FIFO lock queued behind a banda2 hold —
handoff observed between banda2 chunks). **Scorer:** the SEALED instrument via
`fxcluster1/b2score.mjs` — same path as score-all.mjs §B verbatim (relocated
`fxcluster1/fxcluster-diag.mjs` section B with `FXC_TRAVERSAL` env-overridden per arm +
`score-aux.mjs B` for the Q-B1 hook-disc union). Bands quoted from PREREG-fxcluster §1
sub-arm B unchanged — this run re-scores the SAME seal; nothing was re-registered.

### Provenance

- srcTree `3be168ae28832f69` at seam-verify, at every arm (`srcAtArm` ×3), and after —
  **STABLE, and byte-identical to the first letter's attempt-2 capture tree.** No src edits
  were made (the sub-arm B seams were verified present before boot; the runner aborts if not).
- One boot; arms base → cand (`debug.sparklePreroll=true`, re-setShot) → restore-by-restage.
  All three arms tod 0.77, cam pos (6,14,6) fwd (−0.442,−0.147,−0.885) fov 44, player
  (1,12.4,−3), 22 markers latched, uTime 0.05 at capture — matching the first run's staging
  row for row. Frames + readback: `fxcluster1/b2-traversal.{base,cand,restore}.png`,
  `b2-readback.json`, log `b2-run.log`, evidence crops `crops/b2-traversal.*-B-hook4-crop.png`.

### The corrected restore — RESTORE BY RE-STAGE, mechanism as executed

The first letter's restore failed because toggling the flag restores nothing the flag wrote:
`SparkleField.mark()` stamps `born` only for NEW keys (Particles.js:1650-1654), so the cand
arm's −0.25 stamps survived re-marking (restore read 440 vs ≤5). The corrected restore arm
(1) deletes `debug.sparklePreroll`, (2) wipes ONLY the field's marker-identity table
(`count`/`instanceCount`/`_keys`/`_seen`), (3) runs a fresh `setShot('traversal')` — so every
stamp is REBUILT by the shipped staging refresh itself, not poked by hand. Provenance in
`b2-readback.json`: the restore poke's `prePoke` snapshot shows all 22 stamps at **−0.25**
(cand's contamination live at poke time); after the re-stage all 22 read **born +0.0167,
pop 0.062** — written by `mark()`'s new-key path during the staging pass.

### Scores (sealed bands beside every count)

| registered quantity | band | b2 value | gate |
|---|---|---|---|
| Q-B1 hook-disc bright-blue px (B−R≥30 & B≥180 & L≥80, union of r=30 discs at (591,185)/(507,239)/(434,268)) — base | ≤ 10 | **0** | PASS (known-bad reproduces) |
| Q-B1 — cand | [60, 4000] | **440** | PASS |
| Q-B2 strict ±40/±35/±40 of #8fd8ff frame-wide — cand | [10, 3000], non-gating | **236** | in band → per the registered decision rule, NO colour re-registration is needed |
| restore ≡ base on Q-B1 | \|Δ\| ≤ 5 px | **\|0 − 0\| = 0** | **PASS — §94.2d's success reading achieved** |

- **Cross-boot determinism, for the record:** cand's 440 (Q-B1) and 236 (Q-B2) equal the
  first letter's cand *to the pixel*, two boots and one banda2 run apart, on the same tree.
- Benign distribution note (recorded, not defended): base's born histogram is 16×0.0167 +
  6×0.0500 (six keys entered during setShot's second epoch) vs restore's 22×0.0167 (the wipe
  makes every key new in epoch 1). Both classes sit at pop ≤ 0.062 and render **zero**
  bright-blue px in the registered discs — the registered quantity is identical (0 = 0).
- Context, thresholds stated (§122.1), NOT registered quantities: frame-wide any-channel
  diff restore-vs-base is 183,374 px (ΣRGB≥4: 122,871) and cand-vs-base 196,545 px of
  921,600 — arm-to-arm animated phase (birds/flame ride engine.time across setShots;
  §110.3's narrow reading). This is exactly why the seal registered an occluder-free
  hook-disc count rather than a frame diff; on the registered quantity restore−base = 0.

### Verdict

**B: PASS.** Base reproduces the shipped known-bad (0 ≤ 10, attribution correct), cand renders
the §2.1.6 mandatory grammar (440 ∈ [60,4000]; strict-band 236 needs no colour follow-up), and
the restore-by-restage gate holds at 0 ≤ 5 — the first letter's only failed clause, closed with
the mechanism named there. Per the seal's decision table, **B ships on PASS: `_stageShot`
sparkle preroll default ON.** The ship edit is the coordinator's: `src/fx/Particles.js:2574` —
the debug-gated `if (this.engine.debug?.sparklePreroll === true) this.sparkles?.preroll(0.25);`
becomes an unconditional `this.sparkles?.preroll(0.25);` beside `_prerollFires()` at :2575
(same staging-only scope: `_stageShot` runs solely on the 'shot' event, so free-play behaviour
is untouched by construction). Seam fate: the committed sub-arm B seams stay as shipped code
once the gate flips; nothing to revert.

**Staging-determinism finding (positive):** a staged shot's sparkle field is exactly
reproducible cross-boot AND restorable within-boot once marker identity is rebuilt through
the staging pass — the persistence that voided the first letter was the treatment's own
back-dated stamps surviving `mark()`'s keep-known-keys path, not nondeterminism in staging.

---

## C SUCCESSOR RUN (c2) — PREREG-fxcluster-c2, scored 2026-08-05. The parent C verdict
## stands; this is the successor it named (warmer core), run under the c2 seal's pool-wipe.

**Runner/scorer:** `fxcluster1/c2rerun.mjs` / `c2score.mjs` (sealed instrument §C +
score-aux, c2-prefixed). Frames `c2-combat.{base,cand,restore}.png`, probes
`c2-readback.json`, log `c2-run.log`, scores `c2-scores.json`, crops `crops/c2-combat.*`.

### Provenance and drift (§128.6 flag, not a void)

Seal registered on `3be168ae28832f69`; the runner started on `bb822753ae7949e8` and every
arm stamped `4ae5982932ab36be` — the drift is another owner's uncommitted `src/world/
{EgyptLevel,Kit}.js` edits (18 lines) landing during the ~20-min FIFO queue wait; the tree
never moved between arms. `src/fx/**` + `src/core/Debug.js` were verified byte-identical to
HEAD before launch, and the base arm reproduced all three frame anchors (below), so the
drift is immaterial to every scored band. One boot, arms base → cand → restore, tod 0.74,
identical camera/player rows.

### The pool-wipe staging pin: PROVEN

Wipe verified per arm (all non-looping rings + decals read 0 after wipe), staged content
rebuilt by the shipped pass. **restore ≡ base EXACTLY on every scored stat**: blob 7250 =
7250 px, bbox identical, chalk 0.136 = 0.136, figure medSat 0.372 = 0.372, blobL200n
12961 = 12961, brightBand 7904 = 7904 (Q-C5r = 0% vs the parent's 17% and the predicted
≤ 5%). The parent letter's restore wobble is thereby CONFIRMED as pool residue
(`Batch.commit`'s `time > _deathMax` test unreachable after `_stageShot`'s clock re-base —
Particles.js:1527, Decals.js:209), and the §0 hygiene note rides to the COORDINATOR as a
capture-protocol item. Benign recorded variance: post-staging smoke/spark counts decrease
10/33 per arm (fire-age-coupled `_prerollFires` emission, engine.time monotone); dust 18 /
ring 1 / decals 2 identical every arm; the scored rects show zero effect (restore ≡ base).

### Scores (sealed bands beside every count)

| quantity | band | value | gate |
|---|---|---|---|
| Q-C1 figure medSat base / cand | 0.370±0.02 / [0.40, 0.62] | 0.372 / **0.435** | PASS / PASS |
| Q-C2 chalk share base / cand | 0.137±0.010 / [0.015, 0.095] | 0.136 / **0.022** | PASS / PASS — the chalk is gone |
| Q-C3 blob px base / cand | 7304±15% / [400, 4800] | 7250 / **3** | PASS / **FAIL — P-C2c fires** |
| Q-C4 blob-bbox medSat@L≥200 cand (base ref) | ≥ 0.20 (KB ~0.16) | 0.259 (base 0.158) | numerically in band — **but see below** |
| restore ≡ base (Q-C1..C3) | base tolerances | exact | PASS |
| separation (Q-C4 gap vs 2×noise) | gap > 2×\|restore−base\| | 0.101 > 0.000 | PASS |

### Adjudication: NO SHIP by P-C2c, and Q-C4 is not certified despite its number

- **Q-C3 = 3 px** means the largest L≥230 component collapsed — and with it Q-C4's
  denominator: the 0.259 was measured over **n = 4 pixels** (blobL200n), which §128.2 does
  not let stand as a certification. Recorded as the seal's own pre-named P-C2c reading:
  *the carnelian core dropped below the L230 instrument floor — the blob metric was
  calibrated on the white-blowout class and cannot see a core that no longer blows out.*
- **The design goal is nonetheless visibly and measurably achieved** (context, masks and
  thresholds stated, NOT registered gates): in the flash region (360,350,560,450), cand
  holds n=3794 px at L≥200 with medSat **0.373** vs base's 15434 at **0.167**, and n=8586
  at L≥180 medSat **0.396** vs base 0.174 — the chroma survives the tonemap at scale; the
  crops show a structured carnelian flash where base is a white wash. Figure-wide
  consequences recorded for the coordinator's look call: figMedL 154→120, goldPx
  22966→6912, bluePx 9→**853** (the `cane_ring` rimCool tail and backdrop read through now
  that the flash no longer blows the region to white — visible as the blue glint in the
  crop), chalk 0.136→0.022.
- Per the seal's decision table: **NO SHIP; nothing on disk to revert (runtime pokes).**
  No mid-run iteration (§141).

### Successor (named, not run): the instrument must move before the colour does again.
Re-anchor the core metrics off the L230 white-class floor — a fixed-geometry denominator
(disc at the staged impact projection, as B2's hook discs) carrying a sat gate at L≥180-200,
plus a blob floor re-anchored at L200 — then re-run this exact block (its Q-C1/Q-C2 numbers
are already in band and the restore story is now exact). Whether an alpha midpoint
(1.3→~1.8) belongs in that seal is the coordinator's routing call, not this run's.

**KB calibration honoured:** base measured the known-bad class at 0.158 (predicted ≈0.16);
the wipe's validity gate (base anchors) held; the separation condition held. The seal's
falsifier fired exactly where it was written to fire, and the finding it pre-named is the
verdict.

---

## C RE-ANCHORED INSTRUMENT (c3) — PREREG-fxcluster-c3, scored 2026-08-06. The parent C and
## c2 verdicts stand untouched; this is the successor c2 named — same block, new instrument.

**Registered question:** does the re-anchored instrument (fixed-geometry disc at the impact
projection, sat gate L≥180, blob floor L200) certify the carnelian flash that c2 proved but
could not measure? **Answer: yes, on every registered band.**

**Runner/scorer:** `fxcluster1/c3rerun.mjs` / `c3score.mjs` (both committed WITH the seal,
before the capture). Frames `c3-combat.{base,cand,restore}.png`, probes `c3-readback.json`,
log `logs/c3rerun-r3.log`, scores `c3-scores.json`, diag `diag-c3-combat.*.json`, crops
`crops/c3-combat.*-C-combat-flash-crop.png`.

### Provenance and drift (§128.6 flag, not a void)

- Seal registered on `4ae5982932ab36be`; this run stamped **`be5c1da17ca5bad4` at seam-verify,
  at all three arms (`srcAtArm` ×3), and after — STABLE**. The drift is other owners' commits
  landing between sealing and this boot; `src/fx/**` + `src/core/Debug.js` were verified
  byte-identical to HEAD before launch and the EMITTERS seam (`Particles.js:1831`) was probed
  live. Adjudicated per P-C3a's tree-drift clause (as c2): within-boot deltas remain valid.
  **The stronger evidence is that the base arm reproduced all four frame anchors exactly**
  (below) — a drifted tree that mattered could not do that.
- One boot 01:08:09Z–01:33:42Z, arms base (507s) → cand (442s) → restore (450s), no src edits.
  All three arms identical: tod 0.74, cam pos (4.6, 2.35, 31.4) fwd (−0.758, −0.124, −0.641)
  fov 40, playerPos (0, 0, 28), subject drift 0, onScreen true, draws 224/222/222, tris ~1.542 M.
- **Wipe verified per arm** (seal §0 / c2's pin): every non-looping pool reads 0 after the wipe
  in every arm (before-wipe dust 18 / smoke 198 / spark 492 / ring 1 / decals 2 at the cand and
  restore arms — the residue the pin exists to remove — all zeroed); looping/ambient fields are
  untouched by design (sandLow 460, sandHigh 900, airMotes 1000, shimmer 90, motes 900).
- **Requested ≡ applied (§94.4)** on every poked member: cand applied `cane_flash` alpha
  [1.3,1.3] col0/col1 `0xd4823a`, `cane_arc` [1.0,1.6] col0 `0xd4823a`, `cane_spark` [1.6,2.4]
  col0 `0xe8912a`, `cane_ring` [1.4,1.4]. Restore's applied defs are byte-identical to base's
  shipped defs (`0xffe9a8`/`0xe8b942`, alphas 2.6/1.6-2.6/2.2-3.4/2.0).

### Scores (sealed bands beside every value; masks as seal §0)

| registered quantity | band | c3 value | gate |
|---|---|---|---|
| Q-C1 figure (360,390,720,670) medSat — base | 0.370±0.02 | **0.372** | PASS (anchor reproduces) |
| Q-C1 — cand | [0.40, 0.62] | **0.435** | PASS |
| Q-C2 chalk share (L≥180 & sat≤0.20) — base | 0.137±0.010 | **0.136** | PASS (anchor) |
| Q-C2 — cand | [0.015, 0.095] | **0.022** | PASS — the chalk is gone |
| Q-C3′ largest L≥200 comp in (300,300,760,600) — base | 16048±15% | **16048** | PASS (anchor) |
| Q-C3′ — cand | [800, 12000] | **1899** | **PASS — the clause c2 failed** |
| Q-C4′ medSat of L≥180 px in disc r=70 @ (452,433) — base | 0.153±0.03 | **0.153** (n=9392) | PASS (anchor) |
| Q-C4′ — cand | [0.30, 0.55] | **0.398** (n=6657) | **PASS** |
| Q-C4′ denominator floor, both arms | n ≥ 2000 | **9392 / 6657** | PASS — §128.2 failure mode excluded |
| restore ≡ base (Q-C1/Q-C2/Q-C3′/Q-C4′) | ±0.02 / ±0.010 / ±15% / ±0.02 | **0.372 / 0.136 / 16048 / 0.153 — exact** | PASS |
| separation (§13) | (cand−base) > 2×\|restore−base\| on Q-C4′ | **0.245 > 0.000** | PASS |

**All eight gates PASS** (`c3-scores.json`: `baseAnchors, denomFloor, candC1, candC2, candC3p,
candC4p, restore, separation` all true).

### The instrument did the job it was re-anchored to do

- **Q-C3′ is the direct repair of c2's P-C2c.** The same treatment that collapsed to **3 px**
  under the L230 floor reads **1899 px** at L200 — mid-band, and the compact bbox
  **(412,380)-(487,438)** is the carnelian core itself. Base's L200 component is 16048 px with
  bbox (300,351,576,456), touching the rect's left edge exactly as the seal predicted (at L200
  the white class merges with the doorway pool). The cand ceiling 12000 sits below the white
  class, so a re-blown flash would have failed — and it did not.
- **Q-C4′ carries a real denominator.** c2's 0.259 rested on **n=4 px**; c3's 0.398 rests on
  **n=6657** against base's **n=9392**, both far above the sealed floor of 2000. The classes
  separate 0.153 → 0.398 (2.6×), out-of-sample, at the magnitude measured before sealing.
- **§122.3 checked:** the subject is in frame in every arm (drift 0, onScreen true), and the
  crops show it — base is a white wash over the impact, cand a structured carnelian flash with
  spark streaks, ring tail and backdrop reading through the un-blown region (the §17 picture).

**Out-of-sample determinism, verified not assumed.** Every scored quantity reproduces the seal
§0 in-sample calibration (measured on the *c2* frames) to the digit: 16048=16048, 1899=1899,
0.153=0.153 at n 9392=9392, 0.398=0.398 at n 6657=6657, plus 0.435/0.022/0.136 from the c2
table. That exactness was checked for the stale-frame hazard rather than trusted: the three c3
PNGs are distinct files with md5s differing from all three c2 PNGs, and base vs restore differ
in file size and by 0.1 on the **unscored** figure medL (154.4 vs 154.5) while agreeing exactly
on every **scored** stat. This is b2's cross-boot determinism finding reproduced on sub-arm C —
a deterministic staging measured by a geometric instrument — not one file scored three times.

### Verdict

**C (c3): PASS — all bands, restore, and separation.** The re-anchored instrument certifies
what c2 proved but could not measure. Per the seal's decision table, **c3 ships the §1 block
verbatim as an `Emitters.js` data edit — the coordinator's commit.** Exact edit, `src/fx/Emitters.js`:

| line | member | old → new |
|---|---|---|
| :454 | `cane_flash` | `alpha: [2.6, 2.6]` → `[1.3, 1.3]`; `col0: PAL.goldLight` → `0xd4823a`; `col1: PAL.goldMid` → `0xd4823a` |
| :473 | `cane_arc` | `alpha: [1.6, 2.6]` → `[1.0, 1.6]`; `col0: PAL.goldSpec` → `0xd4823a`; `col1: PAL.goldMid` **keep** |
| :448 | `cane_spark` | `alpha: [2.2, 3.4]` → `[1.6, 2.4]`; `col0: PAL.goldSpec` → `0xe8912a`; `col1: PAL.goldMid` **keep** |
| :460 | `cane_ring` | `alpha: [2.0, 2.0]` → `[1.4, 1.4]`; colours **keep** (`col0: PAL.goldSpec`, `col1: PAL.rimCool`) |

**SHIPPED — the coordinator applied this block while the a2 capture was still running**
(observed at 02:0xZ; `src/**/*.js` tree moved `be5c1da17ca5bad4` → `adb5629032309d19` after both
of this session's captures had finished, so neither run is affected). The landed values match
the sealed §1 block verbatim; a 3-line rationale comment above `cane_spark` shifted the line
numbers, so **the table above is the pre-ship record and these are the current lines**:
`Emitters.js:451` `cane_spark alpha [1.6, 2.4], col0 0xe8912a, col1 PAL.goldMid`; `:457`
`cane_flash alpha [1.3, 1.3], col0 0xd4823a, col1 0xd4823a`; `:463` `cane_ring alpha [1.4, 1.4]`
(colours kept); `:476` `cane_arc alpha [1.0, 1.6], col0 0xd4823a, col1 PAL.goldMid`. All four
verified against the poked values this run scored.

Colour provenance for the coordinator's naming call (a routing note, not a decision):
**`0xd4823a` is already the tree's PAINT ochre** (`src/textures/Canvas2D.js:102`), and
`Emitters.js:53` already cites it by name as one end of the §2.2 gold→carnelian axis — so a
named `PAL` constant may be preferable to a bare literal. `0xe8912a` is a new value one rank
along that same axis. Seam fate: the EMITTERS exposure (`Particles.js:1831`) is a harness poke
path only — the ship is pure data, nothing on disk to revert, and the seam stays or goes on the
coordinator's judgement independent of this block.

**Lineage closed:** the first C letter failed on Q-C4 0.192 (instrument reading a white-class
blob), c2 failed on Q-C3 3 px (same instrument, treatment below its floor) while proving the
direction and the wipe, and c3 — changing *only* the instrument, exactly as c2's successor
clause specified — passes every band with the treatment values untouched. Three letters, one
lever moved once, the instrument moved once.

---

## A NOISE-TOLERANT RE-DESIGN (a2) — PREREG-fxcluster-a2, scored 2026-08-06. The parent A
## verdict stands untouched; this is the successor it named (residue-pinned staging).

**Registered question:** does the noise-tolerant viewing design beat the 2–4 L ROI noise that
made the first letter UNSCOREABLE, and does the −0.20 heading express the cone?
**Answer: no and yes.** The wipe does not close the gates — **UNSCOREABLE again by the seal's
own P-A2a** — but the cone is expressed, and this run identifies the contaminant in source.

**Runner/scorer:** `fxcluster1/a2rerun.mjs` / `a2score.mjs` (committed with the seal). Frames
`a2-guard.{base,base2,cand,restore}.png`, probes `a2-readback.json`, log `logs/a2rerun-r1.log`,
scores `a2-scores.json`, diag `diag-a2-guard.*.json`, crops `crops/a2-guard.*`, pair structure
`a2-pairstruct.mjs` + `a2-pairstruct.json`.

### Provenance

- srcTree **`be5c1da17ca5bad4`** at seam-verify, at all four arms, and after — **STABLE, and
  identical to this seal's registration tree.** No src edits; the Guard.js heading seam
  (`:1832`) and the FX poke path (`Particles.js:1831`) were verified present before boot.
- One boot 01:34:08Z–01:56:28Z, arms base (358s) → base2 (307s) → cand (303s) → restore (251s).
  All four arms: tod 0.1, cam pos (−11.5, 2.6, 30.5) fwd (−0.884, −0.241, −0.402) fov 38,
  draws 205, guard pos (−15.487, 0, 27.545), `_light` 0.2628, uOpacity 0.8358 — identical.
- **Wipe verified per arm** exactly as designed: every non-looping pool zeroed after the wipe
  (before-wipe smoke 178-180 / spark 447-455 at arms 2–4 — the residue — all → 0); ambient
  fields untouched (sandLow 460, sandHigh 900, airMotes 1000, shimmer 90, motes 900).
- **The lever applied exactly as the committed port predicted** (RESULT §1's offline
  pre-check): cand `guardTowardCamera` −0.2, yaw −0.0691 → **−0.628**, forward
  (−0.069, 0, 0.998) → **(−0.588, 0, 0.809)** against the port's predicted (−0.588, 0.809),
  yaw ≈ −0.629. Restore deleted the flag; yaw and forward returned to base exactly.

### Scores (sealed bands beside every value)

| registered quantity | band | a2 value | gate |
|---|---|---|---|
| Q-A1 ΔmedL cand−base, ROI (340,280,700,350) | [+3.0, +45.0] | **+6.27** | in band (cf. parent +6.48) |
| noise \|base2−base\| ROI medL | ≤ 1.0 | **1.36** | **BREACH — P-A2a fires** |
| noise \|restore−base\| ROI medL | ≤ 1.0 | **4.63** | **BREACH — P-A2a fires** |
| §13: Q-A1 ≥ 3 × max same-state Δ | 6.27 vs required 13.89 | **fails** | void, as the parent |
| Q-A2 no-harm, figure (852,220,990,700) ΔmedL | ≥ −3.0 | **0.00** | nominally PASS — **but see caveat** |
| Q-A3 air column (700,300,850,500) \|Δ\| | ≤ 8, report | **0.13** | reported |

Per-arm ROI medL: base 94.19 → base2 95.55 → cand 100.46 → restore 98.82. The wipe **did**
help where residue dominated (|base2−base| 2.06 → **1.36**, −34% vs the parent) and did nothing
where it does not (|restore−base| 4.27 → **4.63**).

### The finding P-A2a names: two mechanisms, and only one of them was residue

Pair structure over the ROI (`a2-pairstruct.json`; |ΔL| ≥ 10 is the stated threshold, §122.1;
cells are the ROI split 6×2, so cell 6 is x ∈ [640,700)):

| pair | meanAbs\|ΔL\| | px ≥10 | ΔmedL | where the ≥10 px are |
|---|---|---|---|---|
| base→base2 | 2.067 | 945 | +1.36 | **942 of 945 in cell 6** (357 top + 585 bottom) |
| base2→restore | 2.400 | **5** | +3.27 | none in cell 6 — a broad sub-threshold lift |
| base→restore | 4.359 | 963 | +4.63 | 955 in cell 6 |
| base→cand | 7.870 | 7770 | +6.27 | **all six cells**, signed (below) |

1. **A once-only right-edge object, unaffected by the wipe.** 942 of base→base2's 945
   ≥10 px sit in the ROI's right-edge cell, and base2→restore has **5** — reproducing the
   seal's §0 measurement (679 of 684; then 5) in kind on wiped staging. It appears at the
   first restage and then freezes. The wipe does not prevent it.
2. **A broad monotone beam brightening — and this is what breaks the gate.** base2→restore
   moves the ROI median +3.27 with only **5** pixels crossing ≥10: every cell lifts a little,
   nothing lifts a lot. beamCol0[0] climbs 0.2440 → 0.2531 → 0.2861 → 0.2630 across the arms.

**Mechanism 2 identified in source: `src/ai/Guard.js:1588`** —
`bright *= 1 + TUNE.beamFlicker * Math.sin(t * 6.3 + g.senses.phase)`, with
`TUNE.beamFlicker = 0.09` (`:97`) and `t` the **absolute** beam-material time. Arms capture
250–360 s apart, so each samples a different flicker phase. Observed beamCol0[0] spread is
**±8.05 % about its mean against the ±9 % that term allows** — the fit is the identification.
Every other factor in that colour path is invariant across the four arms: `_light` 0.2628 and
uOpacity 0.8358 identical in all four probes (eliminating the `day` grade at `:1543` and the
`night` grade at `:1551`), guard position identical, suspicion/gain at rest.

**This is why residue-pinning could not have worked: the dominant contaminant is not pool
state.** It is a deterministic function of absolute engine time, and no wipe of a particle
ring can touch it. The seal's §0 diagnosis was not wrong — mechanism 1 is real and the wipe
measurably reduced it — it was **incomplete**. Per §141, recorded, not iterated mid-run.

### The cone IS expressed — structural proof, offered as evidence, not as a gate

The registered scalar cannot certify it, but the cone's signature is unmistakable and cannot
be produced by any brightness drift:

- **base→cand ROI cell mean ΔL is signed and spatially structured** — top row
  [−5.75, +5.39, +11.21, +12.16, +10.32, +12.27], bottom [−11.37, +2.48, +3.54, +5.71, +3.75,
  +2.67]. The leftmost cell **loses** light while the middle and right **gain**. A
  multiplicative flicker scales every cell the same way; it cannot make one −11.37 and
  another +12.16.
- **cand→restore mirrors it exactly** — top [+8.4, −2.22, −7.19, −6.71, −6.82, −3.74], bottom
  [+12.92, −0.23, +0.24, −1.48, −0.43, +4.79]. The sweep reverses when the flag is deleted.
- Frame-wide (16×9 grid of meanAbs|ΔL|, base→cand) the effect is **far larger than the ROI
  reports**: it peaks at **80.0 / 76.5 / 74.9 / 70.2 L in the bottom-left quadrant**
  (x 0–320, y 400–720) — the guard's ground pool (`poolMesh`, `Guard.js:1603-1611`) sweeping
  with his forward vector. The registered ROI sits *above* that, catching only 3–19 L.

### Named successor design — the losing quantity, not the verdict

The registered quantity is a **median of absolute luma over a fixed rect**. It is (a) maximally
sensitive to a uniform multiplicative beam-brightness change — precisely the form of the
flicker contaminant — and (b) sited where the cone's effect is weakest. Two independent
repairs, either sufficient, both scoreable off frames this run already committed:

1. **Re-site the ROI onto the ground pool** (x 0–560, y 400–700 by this run's grid), where the
   cone moves **24–80 L** against the same ~4.6 L contamination — an effect-to-noise ratio of
   5–17×, which satisfies the §13 3× clause with margin instead of failing it 6.27 vs 13.89.
2. **Score a signed spatial contrast instead of a level** (e.g. left-cell minus right-cell mean
   ΔL). A multiplicative flicker scales both regions and cancels in the difference; a heading
   change moves light from one region to the other and does not.

Pinning the flicker phase (freezing engine time at capture, or `beamFlicker = 0` under
measurement) is a third route, but it alters shipped behaviour while measuring it — the
coordinator's call, not FX's.

### Q-A2 construct-validity caveat — recorded, and the gate is NOT relied upon

Q-A2 read exactly **0.00**, and measurement shows why it could not read anything else: on the
16×9 grid, the lower **380 of the rect's 480 rows are bit-identical (0.0) across arms** — the
rect (852,220,990,700) is **79 % static**, so its median is pinned by the static majority.
Meanwhile **7705 px inside that rect (11.6 %) do change by ≥10 L** base→cand, and base→**restore**
changes it *more* (meanAbs 4.94, 7294 px ≥10) than base→cand does (3.32, 7705 px) — the flicker
again. **Q-A2's "PASS" is therefore not evidence of no-harm; it is a median that cannot move.**
This is the §143.1 shape ("a guard can bless the broken thing") caught by measurement rather
than by reading. It does not change this letter's verdict — a2 is UNSCOREABLE on the noise
gates regardless — but any successor must register a no-harm statistic that *can* move (mean
|ΔL| over the guard's silhouette, or a rect trimmed to the lit region).

### Verdict

**A (a2): UNSCOREABLE by P-A2a** — |base2−base| 1.36 and |restore−base| 4.63 against the
registered ≤ 1.0, despite a wipe that verifiably did its job. **Nothing ships; nothing to
revert** (runtime poke, flag deleted and probed null in restore). Q-A1's +6.27 sits in band and
reproduces the parent's +6.48 on independently-staged frames, and the cone's expression is
proven structurally — but the seal registered a scalar the instrument cannot certify at the
measured contamination, and UNSCOREABLE is the registered outcome (§141), recorded, not
defended.

**What this letter adds over the parent's UNSCOREABLE:** the parent attributed the ROI variance
to "guard idle + FX flicker" and the a2 seal re-attributed it to pool residue. Both were
partly right and neither was sufficient. This run **names the dominant term in source**
(`Guard.js:1588`, `beamFlicker` 0.09, absolute-time phase, ±8.05 % measured against ±9 %
allowed), shows the wipe removing the *other* term (2.06 → 1.36), and hands the successor two
re-sited quantities with measured effect-to-noise ratios instead of a third guess at the
staging. Per the parent's §4-R1 route, the cone item goes to the **COORDINATOR** with these
numbers.

---

## A RE-SITED INSTRUMENT + PINNED CLOCK (a3) — PREREG-fxcluster-a3, scored 2026-08-06. The
## parent A, a2 verdicts stand untouched; this is the successor §177 named.

**Registered question:** with the instrument re-sited by measurement and the capture clock
pinned, does the −0.20 heading express the cone under gates that are each shown able to fail?
**Answer: the cone expresses enormously and the instrument is vindicated — but the run is
UNSCOREABLE by its own P-A3a**, because the clock pin reached three arms out of four and the
one it missed is the reference arm.

**Runner/scorer:** `fxcluster1/a3rerun.mjs` / `a3score.mjs` (committed with the seal, plus
`a3-choose.mjs` pre-seal and `a3-pindiag.mjs` post-run diagnostic). Frames
`a3-guard.{base,base2,cand,restore}.png`, probes `a3-readback.json`, log `logs/a3rerun-r1.log`,
scores `a3-scores.json`, pool pair structure `a3-pairstruct.json`, clock diagnostic
`a3-pindiag.json`, scorer control `a3-scorer-control.{json,txt}`.

### Provenance

- srcTree **`adb5629032309d19`** at seam-verify, at all four arms and after — **STABLE and
  identical to the seal's registration tree.** No src edits; the Guard.js heading seam and the
  FX poke path were verified present before boot. Lock taken FIFO behind an sbs3 capture
  (9.8 min queued, ticket honoured).
- One boot 02:31:25Z–02:49:20Z; arms base (361 s) → base2 (250 s) → cand (233 s) → restore
  (231 s). `engine.time` writable confirmed at boot (`timeWritable: true`, boot t = 0.25, so
  the pin to 1000.0 is a forward set).
- **The lever applied exactly as both parents' port predicted:** cand yaw −0.0691 → **−0.628**;
  base, base2 and restore all −0.0691. Restore deleted the flag and returned to base exactly.

### Scores (sealed bands beside every value; a2's response beside every gate, §177 finding 2)

| registered quantity | band | a2 shown-able-to-move | **a3 value** | gate |
|---|---|---|---|---|
| Q-A3-1 ΔmedL cand−base, POOL ROI (0,400,560,700) | [−100, −15] | −59.84 | **−58.63** | **in band** |
| Q-A3-1m mirror ratio (restore−cand)/\|Q-A3-1\| | [0.60, 1.40] | 0.94 | **0.99** | **PASS** |
| N-1 \|base2−base\| medL, POOL ROI | ≤ 4.0 | 1.49 | **0.36** | **PASS** |
| N-2 \|restore−base\| medL, POOL ROI | ≤ 4.0 | 3.49 | **0.35** | **PASS** |
| §13: \|Q-A3-1\| ≥ 3 × max same-state Δ | ≥ 1.08 | a2's ROI FAILED 6.27 vs 13.89 | **58.63** | **PASS, 54× margin** |
| Q-A3-2 no-harm Δmean\|∇L\|, GUARD LIVE | ≥ −3.0 | −2.08 (mirror +2.56) | **−1.79** | nominal pass — **void, licence failed** |
| L-2 licence: same-state \|Δmean∇L\|, GUARD LIVE | ≤ 1.0 | 2.40 | **1.86** | **BREACH — P-A3f** |
| V-1 whole-frame px base vs base2 | ≤ 20 000 | 507 830 | **447 825** | **BREACH — P-A3a** |
| V-2 engine.time spread across arms | ≤ 1e−6 | (a2 did not pin) | **0.03** | **BREACH** |
| V-3 beamCol0 bit-identical base/base2/restore | exact | 0.2440 / 0.2531 / 0.2630 | **base ≠ base2** | **BREACH** |
| C-1 ΔmeanL, POOL ROI (context) | report | −38.41 | **−40.11** | reported |
| C-2 ΔmedL over a2's ROI (context) | report | +6.27 | **−0.06** | reported — see below |
| C-3 ΔmedL over a2's untrimmed figure (context) | report | 0.00 | **+0.02** | reported |

**Effect-to-noise on the registered quantity: 58.63 / 0.36 = 163×**, against a2's registered
ROI at 1.35× on the same frames. The §13 clause it failed 6.27-vs-13.89 in a2 now passes
58.63-vs-1.08.

### The pin worked — on three arms, and the fourth is the one everything is scored against

`a3-pindiag.json`, from the run's own probes:

| arm | t at capture | beamCol0 | yaw |
|---|---|---|---|
| base | **1000.313333** | **[0.267404, 0.246260, 0.172505]** | −0.0691 |
| base2 | 1000.283333 | [0.262957, 0.242165, 0.169637] | −0.0691 |
| cand | 1000.283333 | [0.262957, 0.242165, 0.169637] | **−0.628** |
| restore | 1000.283333 | [0.262957, 0.242165, 0.169637] | −0.0691 |

**base2, cand and restore captured at a bit-identical clock and a bit-identical beam colour** —
`beamCol0` equal to the last decimal across three arms including the poked one, which is the
direct proof that `Guard.js:1588`'s ±9 % oscillator, the term §177 named, is fully pinned. a2's
spread across the same probe was 0.2440 / 0.2531 / 0.2630.

**base is 0.03 s (1.8 frames at 1/60) late, and that is a staging-order defect, not a pin
failure.** `setShot` stops the rAF loop; on the first arm the loop is *still running* when the
pin is written, so ~2 real frames advance `engine.time` before `setShot` halts it. Arms 2–4 are
staged from an already-stopped loop and land on exactly 1000 + 17/60 = 1000.283333, the
deterministic cost of `setShot`'s own `step(14)` + `step(3)` (Debug.js:139/141). One arm, one
cause, one line to fix.

### The finding that matters most: both parents' Q-A1 was measuring the contaminant

**Under a pinned clock, a2's registered ROI (340,280,700,350) reads ΔmedL = −0.06 cand−base
(and +0.72 cand−base2). Unpinned it read +6.27 in a2 and +6.48 in the parent.** The quantity
that both earlier letters reported as "in band [+3, +45]" — the number that made the cone look
expressed at that rect — **was the beam flicker sampled at two phases, not the heading.** With
the phase pinned the lever moves that rect by essentially nothing, exactly as PREREG-fxcluster
§0.1's port said it must (only the `near`-suppressed throat, t ≤ 0.06, crosses it). The cone is
real and enormous; it was never in the registered rect. This is the §141.1 shape at full size:
a metric that did not depend on the thing it claimed to measure, agreeing with the prediction
twice by coincidence of phase.

### Where the residual lives — measured, and it spares the registered quantity

Between the two same-state arms that were **both** pinned (base2 → restore), 287 252 px still
differ, and the 16×9 mean|ΔL| grid puts essentially all of it in the upper right:

- pool ROI region (x 0–560, y 400–720): **0.01 – 1.53 L** — the registered quantity's ground.
- x 720–1280, y 0–320: **13.3 – 31.4 L**, peaking 31.43 at (x 1040–1120, y 0–80) — the band that
  contains the guard's live rect (hence L-2's 1.86) and the doorway air above him.
- Looping ambient occupancy is **identical in all four arms** (sandLow 460, sandHigh 900,
  airMotes 1000, shimmer 90, motes 900), so this is per-particle phase/history, not population.
  Those fields are *looping* and therefore deliberately outside the c2/a2 wipe.

So the two halves of the shot behave differently and the seal happened to site its primary gate
on the clean half: **Δpool between two pinned same-state arms is 0.01 L.**

### Verdict

**A (a3): UNSCOREABLE by P-A3a** (V-1 447 825 px against the registered ≤ 20 000), with
**P-A3f** also fired (L-2 1.86 against ≤ 1.0, so Q-A3-2's nominal −1.79 pass is **void** — an
uncertified no-harm gate cannot license a no-harm reading, which is the whole point of §177
finding 2 and was registered as such before the run). V-2 and V-3 breach for the same single
cause. **Nothing ships; nothing to revert** (runtime poke; flag deleted and probed null in
restore, yaw returned to base exactly).

**What this letter adds over a2's UNSCOREABLE.** a2 handed the successor two candidate
statistics with measured ratios; this run picked between them by measurement before sealing
(`a3-choose.json`: pool re-siting E/N 17.15 vs the named contrast's 12.53, against the
registered ROI's 1.35), showed every gate able to move *and* able to fail on committed pixels
before the capture (`a3-scorer-control.txt` prints FAIL for L-2 and V-1 on the a2 frames), and
then measured the redesigned instrument at **E/N 163 with the §13 clause passing 54×**. It also
proves the clock pin is the right hook — bit-identical `beamCol0` across three arms — and
retires the two earlier letters' central number as an artefact of the contaminant. The arm is
unscoreable on a staging-order defect that is fully localised, not on anything about the design
under test.

### Named successor (a4) — two changes, both one-liners, no new lever

1. **Stage a discard `setShot('guard')` before the first measured arm**, so every measured arm
   is staged from an already-stopped rAF loop and the pin lands identically on all four. Fixes
   V-1/V-2/V-3 at the root. Predicted: base2 ≡ base at ~0 px, as c2 achieved with the wipe.
2. **The no-harm gate must leave the contaminated quadrant, or the wipe must reach the looping
   ambient fields.** The guard's live band carries 13–31 L of same-state residual that the clock
   pin does not touch; the pool ground carries 0.01 L. Either re-site no-harm onto a region the
   ambient fields do not drive, or extend the wipe to the looping batches and re-verify — and
   whichever is chosen, register it with its response on these a3 frames, which now exist as the
   known-bad for exactly that question.

Per the parents' §4-R1 route, the cone item stays with the **COORDINATOR**. The ship this seal
would have named on a clean run is `src/ai/Guard.js:158`, `SHOT_POSE.guard.towardCamera: 0.35 →
−0.20` (widened clamp at `:1832` stays) — **not claimed here**, because the registered gates did
not clear and a3 is UNSCOREABLE.

---

## A CLOCK DEFECT REPAIRED (a4) — PREREG-fxcluster-a4, scored 2026-08-06. The parent A, a2, a3
## verdicts stand untouched; this is the successor the coordinator dispatched under §174.

**Registered question:** with a3's two named defects repaired, does the whole registered set
clear at once? **Answer: nine gates of ten, including every verification gate — and the tenth
fails for a defect in this seal's own design measurement, not in the treatment.** The warm-up
worked exactly as predicted. **Nothing ships: P-A4f.**

**Runner/scorer:** `fxcluster1/a4rerun.mjs` / `a4score.mjs`, with `a4-choose.mjs` (pre-seal),
`a4-scorer-control.{json,txt}` (pre-capture control) and `a4-harmsearch.mjs` (post-run successor
brief). Frames `a4-guard.{base,base2,cand,restore}.png`, probes `a4-readback.json`, log
`logs/a4rerun-r1.log`, scores `a4-scores.json`, pool pair structure `a4-pairstruct.json`.

### Provenance

- srcTree **`adb5629032309d19`** at seam-verify, at all four arms and after — **STABLE**, and the
  same tree a3 ran on. No src edits. Lock taken FIFO behind sbs3 chunk 2 (7.9 min queued).
- One boot 03:10:12Z–03:32:00Z; warm-up + base (510 s) → base2 (242 s) → cand (314 s) →
  restore (241 s).
- **The warm-up's own evidence, recorded before any arm:** `engine.time` 0.299 → **0.582333**
  across the discard `setShot` (exactly 17/60, i.e. `setShot`'s own `step(14)`+`step(3)`), then
  **0.582333 again after a dt = 0 frame** — the rAF loop is provably stopped before arm 1 stages.
  That is the a3 hypothesis confirmed directly, not inferred from the outcome.
- Pose identical in every arm (pos (−15.487, 0, 27.545), `_light` 0.2628, uOpacity 0.8358);
  cand yaw **−0.628**, all three others −0.0691.

### Scores

| registered quantity | band | a3 clean-pair | **a4** | gate |
|---|---|---|---|---|
| Q-A4-1 ΔmedL cand−base, POOL ROI | [−100, −15] | −58.273 | **−58.240** | **PASS** |
| Q-A4-1m mirror ratio | [0.60, 1.40] | 1.063 | **1.000** | **PASS** |
| N-1 \|base2−base\| medL, POOL ROI | ≤ 4.0 | 0.005 | **0.004** | **PASS** |
| N-2 \|restore−base\| medL, POOL ROI | ≤ 4.0 | 0.005 | **0.004** | **PASS** |
| §13: \|Q-A4-1\| ≥ 3 × max same-state Δ | ≥ 0.012 | — | **58.240** | **PASS, 4 853×** |
| Q-A4-2 no-harm silhouette ratio | ≥ 0.75 | 0.843 | 1.014 | nominal — **VOID** |
| L-2 licence \|silCount(base2)−silCount(base)\| | ≤ 400 px | 102 | **1 725** | **BREACH — P-A4f** |
| V-1 px \|ΔL\| ≥ 10 in POOL ROI, base vs base2 | ≤ 2 000 | 377 | **293** | **PASS** |
| V-2 engine.time spread, all four arms | ≤ 1e−6 | a3 failed 0.03 | **exactly 0** | **PASS** |
| V-3 beamCol0 bit-identical, all four arms | exact | a3 failed | **true** | **PASS** |
| C-1 ΔmeanL, POOL ROI | report | −39.672 | −39.631 | reported |
| C-2 ΔmedL over a2's ROI | report | +0.72 | +0.70 | §178 holds |

Pool medL per arm: base 86.404, base2 86.408, cand **28.164**, restore 86.408 — **three
same-state arms agreeing to 0.004 L**, and the cand arm reproducing a3's independent boot to
within 0.03 L (−58.240 vs −58.273). The instrument the coordinator told me to leave alone has
now replicated across two boots with three same-state samples.

### The one failure is this seal's own doing, and it is worth naming precisely

**PREREG-fxcluster-a4 §0.2 chose the no-harm statistic on a noise estimate of ONE pair.** a3
contained exactly one clean same-state pair (base2 ↔ restore), it read 102 px, and the seal
licensed the choice at E/N 15.90 on that basis. a4 has **three** same-state arms; their
silhouette-count spread is **3 016 px**, 30× the number that licensed the design. The gate that
caught it is the licence L-2, which is exactly what a licence is for — but the licence should
never have been needed, because **one sample is not a noise estimate**, and §133.1's sibling
lesson was available in the ledger the whole time.

### `a4-harmsearch.json` — the guard region cannot support a photometric no-harm gate at all

Re-derived with replication: noise = max pairwise spread over **every** same-state arm (a4's
three + a3's two = five samples over two independent boots); effect = the **weaker** of the two
runs. Six sites × seven forms = 42 combinations:

| | best E/N | sign consistent between runs? |
|---|---|---|
| **POOL ROI (control)** | **11 648** (medL); every form ≥ 124 | all seven forms consistent |
| every guard-sited candidate | **0.32** | 30 of 35 **FLIP SIGN** |

This is not "the wrong statistic was picked". **The guard's visible region in this shot is not
measurable at the precision a no-harm gate needs**, on any of medL / meanL / mean|∇L| /
silhouette counts at four thresholds, over four rects. The apparent −1622 that won a4's
pre-seal table reverses to +140 in a4.

**Mechanism, from a4's own probes.** Pool occupancies are *identical* in all four arms —
non-looping smoke 180, spark 455, dust 0, ring 0, decals 0; looping sandLow 460, sandHigh 900,
airMotes 1000, shimmer 90, motes 900 — and the guard's pose, `_light` and uOpacity are
identical too. So the residual is **per-particle history, not population**: the 180 smoke and
455 spark particles restaged at each arm land in different places because the emitter RNG
advances with every staging, and they overlay the doorway and the guard's visible band. The
ground pool is far enough from them to be immune, which is why one region reads 0.004 L and the
other 3 016 px.

### Verdict

**A (a4): the cone is certified; the arm does not ship — P-A4f.** Q-A4-2's nominal 1.014 is
**void** because its licence breached, and the seal registered that consequence before the run:
*nothing ships on an uncertified no-harm gate.* **Nothing to revert** (runtime poke; flag
deleted, yaw returned to base exactly).

**What is now settled, across four letters and three boots.** The −0.20 heading moves the
guard's ground pool by **−58.24 L**, mirrored to 1.000, against a same-state noise floor of
**0.004 L**; V-1 puts 137 910 px of structural change inside the ROI against 293 px same-state.
The §13 clause, which the parent and a2 both failed, passes by three orders of magnitude. The
cone question is **not** what is blocking a ship any more.

### Named successor (a5) — the blocker has moved, and so must the route

The remaining question is no longer about the lever. It is: **how is "no harm to the guard"
certified in a shot whose subject region carries per-arm particle noise that swamps any
photometric statistic?** Three routes, and the choice is the coordinator's, not FX's:

1. **Remove the source.** Pin the emitter RNG or preroll the smoke/spark cohorts identically per
   arm, so the 180 + 455 particles land in the same places. This is a staging change with real
   blast radius and needs its own prereg and its own control — it is not a one-liner.
2. **Certify no-harm geometrically, not photometrically.** The pose solve is already
   deterministic and probed (pos identical, yaw −0.0691 → −0.628 → back, exactly). A no-harm
   claim about the guard's *read* can be made from projected silhouette geometry, which carries
   none of the particle noise. This is the cheapest route and needs no new capture.
3. **Take the §17 declaration as the decision.** The turn is 30° lens-away, declared in every
   seal since the parent, and it is a look judgement a human can make from the committed cand
   frame in seconds. FX cannot certify it photometrically at this staging; saying so plainly is
   more useful than a fifth instrument.

Per §4-R1 the cone item stays with the **COORDINATOR**. The ship this would name is
`src/ai/Guard.js:158`, `SHOT_POSE.guard.towardCamera: 0.35 → −0.20` (widened clamp at `:1832`
stays). Every quantity bearing on the *cone* clears with margin; the only thing unresolved is
the no-harm certification route, which is a decision, not a measurement.
