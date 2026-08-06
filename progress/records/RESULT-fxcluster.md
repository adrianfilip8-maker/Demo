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
