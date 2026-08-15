# AMENDMENT A1 to PREREG-litbleach — per-shot chunked capture

**Date:** 2026-08-15. **Amends:** `PREREG-litbleach.md` (sealed 096d31e).
**Status at writing: ZERO frames of this seal exist.** Run 1 was killed by rollback eight at
0/14 frames, before a single arm was captured. `progress/records/litbleach1/` does not exist.
**No bar, threshold, rect, dose or forecast in the seal is altered by this amendment.** The only
thing that changes is how many boots the 14 frames are collected across.

## Why

§329 measured that long captures no longer complete in this container. That was written against
guardcone's 152-minute run. It is now worse and the measurement has moved:

```
rollback 5  ~03:00     killed guardcone run 5 at 23/49
rollback 6  ~03:47     killed guardcone run 6 at  0/49      interval ~47 min
rollback 7  ~04:30     killed guardcone run 7               interval ~43 min
rollback 8  ~05:08     killed litbleach run 1 at  0/14      interval ~38 min
```

Five consecutive captures destroyed. litbleach was deliberately scoped to ~45 minutes to fit
§329's window and **it still did not survive** — the cadence has tightened below its runtime.

The seal cannot be shrunk further without weakening it. All three shots are load-bearing (the
control carries `PF_STAGE`'s ratio and `PROT_CTL`), `ko` carries the monotonicity bar, `msk`
carries `PF_MASK` and `PROT_ENV`. Cutting any of them to fit the infrastructure would let the
container dictate what the experiment proves, which is the wrong trade in the wrong direction.

## What changes

The runner takes a **shot name** and captures **only that shot's arms**, writing
`manifest.<shot>.json`. Three invocations, one per shot, each ~5 frames and ~15 minutes —
comfortably inside the observed cadence. The scorer merges the per-shot manifests and scores the
identical table.

PF7 (no resume) now applies **per shot**: a chunk aborts if its own frames already exist. A
half-finished chunk is archived and re-run whole; chunks are never resumed mid-shot.

## Why every bar survives this, bar by bar

This is the argument the amendment stands on, and it is checkable rather than asserted:

| bar | compares | crosses a boot? |
|---|---|---|
| `R_<shot>` off vs back, 0 px | two arms of ONE shot | no |
| `PF_MASK` | the `msk` arm of one shot against its own rect | no |
| `E_S`, `E_H`, `LUM` | `on` against `off` of the same shot | no |
| `KO` | `off` < `ko` < `on`, same shot | no |
| `PROT_CTL` | `on` against `off` of the control | no |
| `PROT_ENV` | `off` vs `on` masked by `msk`, same shot | no |
| `PF_STAGE` | S(traversal), S(combat), S(control) | **yes — see below** |

**Thirteen of the fourteen comparisons are strictly within one shot, and therefore within one
boot.** §302's boot-identity constraint says cross-boot *pixel* bars are unachievable on this
renderer; none of those thirteen becomes a cross-boot pixel comparison under chunking, because
each shot's arms are still captured in a single boot from a single live staging.

`PF_STAGE` is the one bar that reads three shots together. It survives because **it compares
measured saturations against fixed thresholds, not pixels against pixels.** S is a physical
property of the frame, not a boot artifact; comparing S(traversal)=0.205 to a 0.30 bar is the
same operation whether the two shots were captured in one boot or three. The one clause that
relates two shots — `S(control) ≥ 2.0 × S(traversal)` — is a ratio of two such measurements,
and r12 and r13 reproduced both to three decimal places **across entirely different boots**
(0.205/0.205 and 0.516/0.516), which is direct evidence that this quantity is boot-stable.

## New validity gate this amendment ADDS

Chunking removes the automatic single-tree guarantee that one process gave for free, so it is
replaced with an explicit one rather than dropped:

| gate | bar | on failure |
|---|---|---|
| `V_CHUNK_TREE` | every chunk manifest records the same `srcHash`, and it equals HEAD's | **VOID** — the tree moved between chunks; §141.1's "one tree" requirement is not satisfied |
| `V_CHUNKS` | all three chunk manifests present, 14 rows total | **VOID** |

`V_CHUNK_TREE` is strictly stronger than the single-process V-TREE check it replaces, because it
verifies the tree at three separate points in time instead of two.

## Risk disclosed before capture

Each shot is now live-staged in its own boot. If live settling has meaningful boot-to-boot
variance, a shot could land at a different animation phase than it would have in a single-process
run — which is precisely the class of problem that VOIDed lithold. Two things bound this risk,
and neither is a promise:

1. `PF_MASK` and `PF_STAGE` still run per chunk and still gate everything. A chunk that stages
   Sly out of the defect fails the pre-flight exactly as designed. The amendment does not weaken
   the instrument that catches this.
2. r12 and r13 agreeing to three decimals across different boots is evidence that live staging is
   reproducible for these shots. Evidence, not proof — if a chunk's pre-flight fails, the finding
   is that live staging is *not* boot-stable, and that is worth knowing on its own.

**No threshold moves. §141.1 stands in full.** If the chunked run fails a bar, it fails.
