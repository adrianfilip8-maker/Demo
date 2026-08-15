# AMENDMENT A2 to PREREG-guardcone — per-shot chunked capture, a §331 warm-up, and force-added chunks

**Date:** 2026-08-15. **Amends:** `PREREG-guardcone.md` (sealed 2026-08-14) as already amended by
**AMENDMENT A1** (cone-only re-scope, 083c755). A1 stands in full; A2 sits on top of it.

**Status at writing: ZERO frames of a scoreable capture of this seal exist.** Checked, not
assumed:

| location | manifest rows | PNGs on disk | what it is |
|---|---|---|---|
| `progress/records/guardcone1/` | **0** (run 7's manifest, launched 03:57:17Z, head `07039cb9`) | 12 | run 7 died before its first frame; the 12 PNGs are **run 4's orphans** — `hero/kaykit/temple/sly-closeup × off/bon/back`, sha `1a8009c6…`/`a954cef2…`/`65d28269…`/`1ea8cbb6…`, matching run 4's manifest exactly — left behind when run 4's manifest alone was archived. **No manifest references them. They are unreferenced bytes, not frames of a seal**, and PF7 requires this directory be emptied before any relaunch. |
| `guardcone1-void-run4/` | 12 | **0** | frames gone |
| `guardcone1-void-run5/` | 24 | **0** | frames gone (the log recorded 23 — §325.1's disk/log mismatch) |
| `guardcone1-void-run6/` | 0 | **0** | died still booting shot 1 |
| `guardcone1-void-treechurn/` (run 1) | — | — | **does not exist on disk and never entered git.** Run 1's 49 frames and its manifest are gone; the only surviving record of that capture is the tracked scorer log `logs/guardcone-score-run1.log`. |

Every one of those PNG sets was destroyed the same way: `progress/records/*/**/*.png` is
gitignored (`.gitignore:49`, §272.4), so a rollback that wipes the working tree wipes them with
no durable copy anywhere. That is not an aside — it is §A2.6, and it is why this amendment is
worth writing at all.

So this is an amendment written **while none of its seal's frames exist**, which is the only
position from which one is legitimate. A threshold touched after frames exist is §141.1's
forbidden move; nothing here is touched.

**No bar, band, ROI, hue window, pixel count, share, dose, roster entry, arm or forecast in
`PREREG-guardcone` or in `AMENDMENT A1` is altered by this amendment.** The frame count stays at
**49**. The roster stays at all **16** shots. What changes is how many boots those 49 frames are
collected across, that two renders per shot are discarded before the first is kept, and that a
completed chunk is force-added the moment it completes.

## A2.1 Why — the capture is longer than any container life measured tonight

§329 recorded the arithmetic and §325/§325.1/§329.1 recorded the cadence. Against this seal
specifically:

```
run 1   49/49 captured, VOID on V-TREE (three trees, §315) — frames since destroyed
run 4   died  12/49   ~24.5 min of frames on the clock when it went
run 5   died  23/49   ~73 min survived
run 6   died   0/49   ~36 min survived (still booting shot 1)
run 7   died   0/49   (log: 5 lines — boot verified, no frame)
```

Four consecutive attempts, none past half. Measured from run 5's own manifest timestamps the run
costs **2.06 min/frame** end to end, so 49 frames is **~100–150 min** depending on how the
staging cost falls; §329's 3.1 min/frame reading gives ~152. Either number is longer than every
container life observed tonight, and the rollback interval has tightened to **~35–40 min**
(§329.1: rollback nine destroyed litbleach's working tree outright). Relaunching unchanged is a
lottery ticket, as §329 said.

**Shortening the seal is not available and this amendment does not attempt it.** §141.1 stands:
the 16-shot roster is precisely what the `PROT-B_<shot>` ×15 rows measure, `ROSTER` is a
hardcoded const in `guardcone.mjs` with no env or argv path, and dropping shots to fit the
infrastructure would let the container decide what the seal proves. All 16 shots and all 49
frames survive A2 intact.

## A2.2 What changes — one shot per boot

The runner takes a **shot name** as `process.argv[2]`, captures **only that shot's arms**, and
writes `manifest.<shot>.json`. Sixteen invocations. Fifteen chunks are 3 frames
(`off → bon → back`); the `guard` chunk is 4 (`off → bon → blamp → back`). 15×3 + 4 = **49**,
unchanged. The scorer merges the sixteen chunk manifests and scores the identical table.

Cost per chunk, from run 4's and run 5's own row timestamps rather than from a guess: boot +
lock + first staging + the `off` capture is ~7.9–8.6 min, and each subsequent arm is ~17–41 s.
A chunk is therefore **~10 min**, ~12–14 min with A2.5's warm-up (which mostly *absorbs* the
first-render cost the `off` arm currently pays). Against an observed container life of 35–40 min
that is roughly a third; against 152 min it is the difference between a plan and a wager.

Wall clock across all sixteen chunks is not lower — it is somewhat higher, sixteen boots instead
of one. That is the correct trade and it is deliberate: **the binding constraint is not total
work, it is the longest unit of work that must survive uninterrupted**, and that drops from 152
minutes to about twelve.

PF7 (no resume) now applies **per chunk**: a chunk aborts if its own frames or its own
`manifest.<shot>.json` already exist. A half-finished chunk is archived and re-run whole; chunks
are never resumed mid-shot. PF6's launch pins run **per chunk** — sixteen independent
verifications that the cone mechanism and §309's parked levers are still inert in HEAD, where the
single-process run checked once.

## A2.3 Why every bar survives this, bar by bar

This is the argument A2 stands on, and like A1's it is checkable rather than asserted. Read
against `guardcone-score.mjs` line by line. "Crosses a boot" means *the bar's own comparison now
has one side in one boot and the other side in a different boot.*

| bar | what it compares | crosses a boot? |
|---|---|---|
| **R_\<shot\>** ×16 | `diff(off, back)` over the full frame, **one shot** | **no** — both arms are captured in that shot's own boot |
| **BS1** | `guard.bon` alone: any px with L ≥ 200 ∧ R−B ≥ 8 inside r16 of `guard.bon`'s own probe apex | **no** — single arm, single shot; the apex comes from the same row's probe |
| **BH1** | `guard.bon` alone: near-half vs far-half hue/S inside its own beam ROI | **no** — one frame compared against itself, split by its own recorded apex→far segment |
| **BF1** | blown share of `guard.bon` beam ROI vs blown share of `guard.off` beam ROI | **no** — both arms are in the `guard` chunk |
| **BL1** | `diff(guard.bon, guard.blamp)`, containment against `guard`'s own probe rects | **no** — both arms are in the `guard` chunk |
| **PROT-MOON** | `diff(night.off, night.bon)` in [300,20,480,140] | **no** — one shot |
| **PROT-LAMPS** | `diff(night.off, night.bon)` in [640,0,1140,130] | **no** — one shot |
| **PROT-SPARK** | `diff(traversal.off, traversal.bon)` in [430,190,620,280] | **no** — one shot |
| **PROT-B_\<shot\>** ×15 | `diff(off, bon)` whole-frame or split by that shot's own container union | **no** — one shot, and the containers come from that shot's own off/bon probes |
| **LOOK-B** | `guard.bon` vs `guard.off`; `night.bon` vs `night.off` | **no** — two within-shot pairs (A1.2 already dropped the `abon` pointer) |
| report-only ΔL stddev | `guard.bon` vs `guard.off` beam ROI | **no** |
| **BV1** | live readbacks vs the §2 candidate **constants**: `guard.bon` shape/lampW/tuple, `guard.off` shape 0 & w 0, `interior.bon` w = 0 | **yes — but not as pixels.** See below |
| **PARK1** | every captured row's readback vs the constants 0 / 0 / false / false | **yes — but not as pixels.** See below |
| **V-TREE** | 49 rows in one manifest, one `tree.src` across all of them, equal to `expect.head` | **YES, and this one genuinely breaks.** See A2.4 |

**Twelve of the thirteen scored bar families are strictly within one shot, and therefore within
one boot.** §302's boot-identity constraint says cross-boot *pixel* bars are unachievable on this
renderer, and this seal's own frames prove it directly rather than by citation: runs 4 and 5
captured the same four shots on the **same src tree** (`2b5c7c49ad9c4668`, both manifests) in two
different boots, and **0 of 12 frames matched byte for byte** — `hero.off` is `1a8009c6…` in run 4
and `c0fad6bc…` in run 5. Chunking must therefore never put a pixel comparison across a chunk
boundary, and after the audit above, **none does**.

The same pair of runs is the positive half of the evidence: within each boot the bracket held
byte-exactly — `hero.off` = `hero.back` at `1a8009c6…` in run 4 and at `c0fad6bc…` in run 5, and
likewise every other shot both runs reached. Combined with run 1's `off`-vs-`back` **0 px on all
sixteen shots**, that is **28 shot-brackets across three independent boots, all exactly zero**.
The per-shot bracket is a within-boot property and it has never once failed here. Chunking keeps
every bracket within its boot, so it neither helps nor threatens the one bar that has the most
right to be nervous about a re-boot.

**BV1 and PARK1 cross boots and survive, for A1's `PF_STAGE` reason.** Both compare *measurements
against fixed constants sealed in §2/§3*, never one row against another row. BV1 asserts
`guard.bon` reads shape 1, `lampW > 0`, `colPatrol 0xffd9a0`, base 0.26, pool 0.30, core 0.62,
glow 0.42, lampToon 1.0; `guard.off` reads shape 0 and w exactly 0; `interior.bon` reads w exactly
0. The first two clauses are both inside the `guard` chunk anyway; the third is a comparison
against the literal `0` in §303's window, not against `guard`'s value, so which boot produced it
is irrelevant to the predicate. PARK1 likewise tests each row against `guardArt = 0 ∧
guardSkin = 0 ∧ painted = false ∧ skinShift = false`. Chunking makes PARK1 **stronger, not
weaker**: §309's parking is now verified independently in sixteen separate boots, and the
runner's boot-side §309 abort (`guardcone.mjs`, before the first frame) fires sixteen times
instead of once. A bar that can only get harder to pass is not a bar this amendment needs to
defend.

## A2.4 The one bar that cannot survive chunking — V-TREE — and the stronger gate that replaces it

**Stated plainly rather than papered over: V-TREE as sealed cannot survive chunking.** Its
predicate (`guardcone-lib.mjs:treeBar`) is *49 rows in one `manifest.json`, one distinct
`tree.src` across those rows, equal to `manifest.expect.head`*. Under chunking there is no single
manifest and no single process, so the bar has no object to evaluate. It is exactly the guarantee
one process gave for free, and it is exactly the guarantee this seal died of the last time it was
scored — run 1 was VOID on three trees.

It is therefore **replaced, not dropped, and the replacement is strictly stronger**:

| gate | predicate | on failure |
|---|---|---|
| `V_CHUNK_TREE` | every one of the 16 chunk manifests records the same `srcHash`, **and** that hash equals HEAD's `git archive HEAD src` hash | **VOID** — the tree moved between chunks; §141.1's "one tree" requirement is not satisfied |
| `V_CHUNKS` | all 16 `manifest.<shot>.json` present, one per ROSTER entry, **49 rows total**, with `guard` contributing 4 and every other shot 3 | **VOID** |

`V_CHUNK_TREE` verifies the tree at **sixteen points in time instead of two**, and each chunk
independently re-derives its expectation from `git archive HEAD src` before it renders (the
existing `EXPECT_HEAD` computation) and re-checks it under the lock. The 49-row census half of
V-TREE survives verbatim as `V_CHUNKS`' row total — A1.2 already established that the census is a
count, not a threshold, and the count does not move.

Both gates are fail-closed and neither can turn a FAIL into a PASS.

## A2.5 §331's warm-up — two discarded renders after staging, and why chunking makes it mandatory

§331 measured with `convprobe` that the **first render after staging is not converged**: r0 vs r1
is **1125 px at max channel delta 21**, and r1 through r7 are **bit-exact**, six consecutive pairs
at 0/0. One render settles it; everything after is stable. That single fact was the whole of
litbleach's VOID, because litbleach captured `off` as the first render after staging and `back` as
the fourth.

**Where guardcone actually stands, from the code rather than by analogy.** `STAGE_ONLY` already
does `setShot(name, {dt:0})` → `step(3,0)` → `renderFrame(0)` **without capturing**, so this
runner's `off` is the *second* render after staging, not the first. That is consistent with the
28 zero brackets above, and it must be said honestly: guardcone has not been observed to suffer
§331. Three things nevertheless make the warm-up required rather than optional here, and none of
them is a re-reading of evidence guardcone already has:

1. **The existing discarded render is not arm-shaped.** It runs *before* any lever assignment and
   is followed by `step(2,0)` inside `ARM` before the captured render. `convprobe` rendered eight
   times with **no `step()` between renders**, so it cannot answer whether a `step()` re-dirties
   whatever settles. A2's warm-up must therefore be the *arm's own path with nothing written*:
   assign `CONE_OFF`, `step(2,0)`, `renderFrame(0)`, discard — the shape litbleach2 sealed
   (`litbleach2.mjs:WARM`). That closes the gap `convprobe` left open instead of assuming it shut.
2. **Chunking makes every staging a cold, first-of-boot staging.** In a single-process run only
   `hero` was staged into a cold renderer; the other fifteen inherited a warm one. The logs show
   the difference is real and large — run 5: `staged hero (1/16, 56s)` against `staged kaykit
   (2/16, 0s)` — and the first `off` capture of a boot costs ~8 min against ~3.5–6 min for later
   shots. Under A2 **all sixteen stagings are the cold path**, which is precisely where lazy
   shader compilation, texture upload and first-frame settling live. The 28 zero brackets were
   measured 3 cold / 25 warm; they are *not* evidence for a run that is 16 cold.
3. **The pre-registered findings in `RESULT-guardcone.md` depend on it.** That document commits in
   advance (A2.7) that reproducing BS1 = 0 hot-warm apex px and BF1 = 0.0000/0.0000 on a single
   tree makes them real findings. Those readings come off `guard.bon` and `guard.off`. A finding
   read from a pre-convergence frame is not a finding, it is an artifact with a conclusion
   attached. The warm-up is what earns the right to call those numbers results.

**Registered:** `WARMUP = 2`, discarded after staging and before the first captured arm, on every
shot. §331 says one suffices; the second costs one render per shot and buys margin against a shot
that settles more slowly, exactly as `PREREG-litbleach2` sealed it. The warm-up frames are
**never written and never measured**. The bracket bands do not move: `R_<shot>` stays **[0,0]**,
and with the warm-up in place a bracket failure means something real — which is what a validity
gate is supposed to mean.

## A2.6 §329.1's force-add — without this the amendment delivers nothing

`progress/records/*/**/*.png` is gitignored (`.gitignore:49`). A rollback wipes the working tree
**and `/tmp`**. So an un-force-added chunk has **no durable copy anywhere**, and a completed chunk
is destroyed by the next rollback exactly as thoroughly as an in-flight one — which means chunking
would buy nothing at all. This is not hypothetical for this seal: the frame census at the top of
this document is four separate runs' worth of PNGs reduced to zero by that exact mechanism, and
run 1's entire 49-frame archive erased with them.

**Registered as a step of the capture procedure, not as advice:** the moment a chunk exits clean,

```
git add -f progress/records/guardcone1/<shot>.*.png progress/records/guardcone1/manifest.<shot>.json
git commit --no-gpg-sign -m "guardcone chunk <shot>: N frames (AMENDMENT A2)"
git push
```

before the next chunk launches. ~2.0 MB per PNG here, so ~6 MB per 3-frame chunk and ~8 MB for
`guard`; ~100 MB for the seal. §329.1 measured this working under fire — after rollback nine the
ff-merge brought litbleach's chunk 1 back from origin **byte-identical**, the first time in nine
rollbacks that captured frames survived one.

**A chunked seal that does not force-add its frames is a chunked seal in name only.** If the
force-add is skipped, A2 delivers nothing and this document should be treated as unimplemented.

## A2.7 Carried forward from `RESULT-guardcone.md` — what a re-run's readbacks already MEAN

Pre-registered here so the re-run cannot be read as fishing, restating run 1's fold rather than
adding to it. None of this changes a bar.

1. **BS1 = 0 and BF1 = 0.0000/0.0000 become real findings on a single tree.** Run 1 read BS1 hot-
   warm apex px = **0** (maxL 196, bar L ≥ 200) and BF1 blown share **0.0000 in both arms**, so
   BF1 could not discriminate at all. `RESULT-guardcone.md` §2 committed in advance that
   reproducing these on a valid single-tree capture means *the visible source card is not
   rendering* and *BF1 is mis-aimed* — both are findings against the seal's own instrument, and
   PF1 routes them to a NO-SHIP with the numbers recorded, never to a re-tune. A2's warm-up
   (A2.5) is what makes those numbers trustworthy enough to say so.
2. **BH1's far half read 0 px in run 1** (near hue 17.5 over 516,040 px, far `n/a` over 0 px), so
   BH1 returned `null` rather than a judgement and the near hue landed **below** the [20°, 60°]
   band. Recorded now: if the re-run reproduces an empty far half, that is a finding about the
   ROI's near/far split at the recorded apex→far segment, not a hue result.
3. **`bon lampW` is SHOT-DEPENDENT, and BV1's `interior` clause may not discriminate.** Run 5's
   partial capture, per-shot on the `bon` arm:

   ```
   hero        lampW 8.5   _light 0.5388     sly-startle lampW 8.5   _light 0.5157  (inframe 0)
   sly-closeup lampW 8.5   _light 0.5157     sly-perch   lampW 8.5   _light 0.5157
   sly-arm     lampW 8.5   _light 0.5157     kaykit      lampW 0.0   _light 0.7206
   temple      lampW 0.0   _light 0.6847  (inframe 2)   courtyard   lampW 0.0   _light 0.6049
   ```

   `w` tracks `_light` against §303's 0.56 knee and **nothing else** — not guards-in-frame
   (`sly-startle` has inframe 0 and reads 8.5; `courtyard` has inframe 10 and reads 0.0; `temple`
   has guards in frame and reads 0.0). BV1 requires `interior.bon` `lampW` **exactly 0** per
   §303's underground window, and §2 predicts interior's `_light` is 0.90 — but **three other
   shots also read exactly 0** for the ordinary reason that they sit above 0.56. So a 0 at
   `interior` does not by itself distinguish "the underground window fired" from "this shot is
   simply above the knee", **which is precisely the shape of BF1's failure in run 1**: a reading
   that cannot discriminate is not evidence, however correct it looks.
   **The bar does not change** — BV1's predicate stays exactly as sealed, and `interior.bon`
   `lampW` must still be exactly 0. What is registered here is that the **fold must adjudicate the
   window from the whole `_light`/`lampW` curve across all sixteen `bon` rows** (the readback
   already carries `light` on every row), not from interior's single zero. `guard` at `_light`
   0.263 (§2 predicts window ≈ 1.0) and `night` are the rows that actually discriminate.
   Related and flagged for the same fold: §2's prose says the window is "exactly 0 for every
   daylight canonical", yet five canonicals sit **below** 0.56 and read 8.5. That is a modelling
   statement in §2, not a bar, and their `PROT-B_<shot>` rows are what protect them (run 1:
   `PROT-B hero` outside = 0). Recorded as a fold item, not as a change.
4. **§309 parks the guard MODEL; the guard CONE is explicitly NOT covered** (§309's own closing
   sentence, quoted in A1). PARK1 is kept in full and, per A2.3, is strengthened by chunking.
   Nothing in A2 touches `guardArt`, `guardSkin` or `applyArt()`.
5. **Run 1's PROT failures are not carried as verdicts.** `PROT-MOON` 4,557 px, `PROT-LAMPS`
   8,018 px and `PROT-B_sly-startle` outside 6,108 px were read on a three-tree capture and
   `RESULT-guardcone.md` says in terms that they are **not a refutation and must not be cited as
   one**. They are re-measured, not inherited.

## A2.8 Risks disclosed before capture

Neither of these is a promise, and both are stated so a later reader cannot claim they were
unforeseen.

1. **Sixteen boots means a much longer window in which `src/` must not move.** `V_CHUNK_TREE`
   catches a moving tree by construction — one differing `srcHash` VOIDs the whole run — but
   catching it costs every chunk captured so far. This is the failure that killed run 1 (§315:
   six lanes committing into the shared tree mid-capture). The mitigation is scheduling, not
   arithmetic: run the chunks when the ship FIFO is drained, and per §329.3 a lane may land a
   PREREG document, scorer or runner during the window but **must not land an inert mechanism**,
   because that touches `src/` and `V_CHUNK_TREE` hashes `src/`. A chunk whose HEAD has moved
   should not be launched; it should wait.
2. **Each shot is now staged in its own boot.** This is the class of problem that VOIDed lithold,
   so it is named. Three things bound it here, and the first is measurement rather than argument:
   guardcone stages `{dt:0}` frozen — deterministic by construction, unlike litbleach's live
   settle — and runs 4 and 5 staged the same four shots in two different boots with the same
   `_light`, the same guard counts in frame and the same probe geometry, differing only in the
   sub-perceptual render noise that §302 predicts. Second, A2.5's warm-up specifically targets
   cold-boot first-staging convergence, the one thing chunking genuinely changes. Third, the
   per-shot bracket `R_<shot>` still gates everything downstream and is unchanged at [0,0]: a
   chunk whose boot staged differently from its own arms fails its own bracket and nulls its own
   dependent rows, exactly as designed. If a chunk's bracket fails, the finding is that per-boot
   staging is not reproducible for that shot — and that is worth knowing on its own.

## A2.9 What this amendment explicitly does NOT do

- It does not move a band, a share, a pixel count, an ROI, a hue window, a dose or the §7
  forecast. Not one number in `PREREG-guardcone` §3 or in A1.2 changes.
- It does not shorten the roster. All **16** shots and all **49** frames are captured. §329's
  "short captures are the only viable kind" is satisfied by making each *unit of capture* short,
  not by making the seal smaller.
- It does not re-tune the candidate. `CONE_ON` is §2's tuple, verbatim.
- It does not touch `TUNE.guardArt`, `TUNE.guardSkin`, `applyArt()` or any guard-model lever, in
  the runner, the scorer or `src/` — A1.4 in full, and §309 unchanged.
- It does not re-open `PREREG-guardart` (WAIVED-UNSCORED) or task #14's shipped night grade.
- It changes **no code in this pass.** `guardcone.mjs` and `guardcone-score.mjs` are untouched
  here by design: the argument is committed before any mechanism moves, so the implementation can
  be checked against a document that predates it. The implementing change is exactly four things
  — the `argv[2]` shot chunk + per-shot manifest, `WARMUP = 2` on the arm's own render path, the
  scorer's chunk merge with `V_CHUNK_TREE`/`V_CHUNKS` replacing `treeBar`, and per-chunk PF7 —
  and nothing else in either file may move with them.

**§141.1 stands in full. If the chunked run fails a bar, it fails.**
