# RESULT-inkblack — §270 / D5a

Scores `PREREG-inkblack.md`. **INTERIM: the run is still in flight.** Six of the registered ten
frames are still to capture. This file exists now so that the one result already settled is on
the record rather than in a scrollback, and it is marked at every claim which part is final.

---

## 1. Final: PRED-1 fired, and the instrument the pre-registration shipped with would have VOIDed

Registered in `PREREG-inkblack.md` **before run-1 existed**, from reading `PostFX._renderChain`
while run-1 was queued on the capture lock:

> `_renderChain` renders the **scene first** (step 1) and the **normal prepass second** (step 2),
> and the prepass's `finally` calls `endNormalPass()` → `setOutlinesVisible(true)` on every frame.
> The capture renders four frames per arm. **Therefore the arm-C hide is honoured by the first
> frame's scene render and reverted before the second. Arm C will be arm B.**

**CAL-4**, registered as a two-sided sensitivity test — one lever provably dead, the other
provably alive, in the same boot on the same frame:

| shot | sha(B) | sha(C0) `.visible=false` | sha(C) `layers.disable(0)` | C0==B | C!=B |
|---|---|---|---|---|---|
| courtyard | `bcb7897d2c0c2a29` | `bcb7897d2c0c2a29` | `3f4edd2cef24ca61` | **yes** | **yes** |
| dunes | `bd342ecfeb0a4f9a` | `bd342ecfeb0a4f9a` | `3ad41ac02a9cda1a` | **yes** | **yes** |
| hero | `0015956d7818bad8` | `0015956d7818bad8` | `639505d32326d7ff` | **yes** | **yes** |
| interior | `730ea3fcbcee1dd0` | `730ea3fcbcee1dd0` | `12c123462dcdadab` | **yes** | **yes** |

The broken lever is **bit-identical** to no lever at all, on every shot, and the working lever
changes the frame on every shot. PRED-1, PRED-2 and PRED-3 are confirmed by measurement rather
than by the reading that produced them.

**What that means for the shipped pre-registration.** `PREREG-inkblack.md` §3 committed a hull
defeat lever that does not work. Had run-1 been executed as written it would have returned
`hullMask` empty on every frame, failed CAL-2, and produced a VOID — and the natural misreading
of an empty hull mask is "the hull contributes nothing to the ink", which is the opposite of what
the run was for. The pre-registration's own CAL-2 was the backstop and would have caught it; what
the four-arm restructure added was catching it **without spending ten shots of a FIFO-serialised
resource on an unevaluable run**, and turning the diagnosis into a measurement.

This is the one part of the §270 lane where reading the source produced a claim that then
*survived* its test. The reason it survived is that it was written down as a falsifiable
prediction with an arm attached, before the run, rather than asserted afterwards.

## 2. Still open — do not read anything into their absence

- **P1** (does the hull own the darkest decile of the union ink mask, within 0.010 L) is **not
  scored here**. The registered frame set is all ten of `shots/r9`; four are captured.
- **PRED-5** — the warning, registered before the numbers, that P1 can be met while the crease
  owns the population a ridge detector actually samples, so "P1 MET" may not be reported as "the
  hull owns the ink" unless the hull also wins on coverage.
- **P2** (is the hull's authored colour the locus, or the grade's floor) needs
  `tools/inkhullcol.mjs`, a separate capture.

No decile, coverage or attribution number appears anywhere in this file, because none has been
computed. The shas above are calibration, not a result about the ink.

## 3. Run provenance

- Run-1: killed after acquiring the lock and **before writing a single frame**. Nothing measured,
  nothing discarded. Reason recorded in `PREREG-inkblack.md`: it had just been registered as
  predicted-VOID, and spending ten lock slots to watch that happen is a cost paid by every other
  agent in the repo.
- Run-2: four arms, ten shots. Killed by its harness after **four** completed shots (dunes, hero,
  interior, courtyard — 16 frames) and before `arms.json` was written. The frames survived; the
  record of them did not.
- Run-2 resumed: `tools/inkblack.mjs` now writes `arms.json` after every shot and reuses a shot
  whose four PNGs are already on disk, recomputing every sha from the bytes. Resuming is sound
  because **every arm of a shot is captured inside one boot and every gate is computed within a
  shot** — other agents editing `src/` between shots can move a whole shot but cannot move one
  arm relative to its own siblings, which is the only comparison any threshold reads.
- Run-3: after the lead's cross-lane provenance warning, `G-TREE` was added to the scorer and a
  per-shot **content hash of `src/`** to the capture. Run-2's sixteen frames predate it, so their
  tree is unrecorded, and an unverifiable guard is VOID rather than PASS. They were **moved to
  `shots/inkblack-run2a/` and the whole run restarted with provenance** rather than exempted on
  the argument that one boot per shot makes the property true by construction. The CAL-4 table in
  §1 stands as the observation it was — those four shots each rendered their four arms in one
  boot, which is what CAL-4 reads — and run-3 re-tests it under the guard.

**Why a content hash and not a commit sha.** Vite bundles the working tree. At the time of writing
`src/world/Props.js` and `src/world/Statues.js` are modified and uncommitted by other agents, so
two captures at the identical commit can render different pictures; a sha would call them the same
provenance and be wrong.

### The staged-player move, checked against run-3 rather than assumed

The lead flagged that the hero lane moved the staged character in two of these ten frames — `hero`
`[2.2, 9.0, 8.4]` → `[4.0, 8.99, 13.2]` and `courtyard` `[-6.6, 5.12, 12.4]` → `[2.4, 0.02, 26.4]`
— with no camera change, because `hero` had been staging him **3.80 m above the surface** under his
own xz. That matters here more than it might elsewhere: **Sly is the largest single carrier of hull
ink in the frame**, so moving him changes the hull mask's size and content, which are P1's inputs.

Checked, not assumed:

- `src/core/Shots.js` in run-3's target tree already carries the **post-change** values
  (`hero` `[4.0, 8.99, 13.2]` yaw 5.889; `courtyard` `[2.4, 0.02, 26.4]` yaw 5.341).
- Run-3's only completed shot, `dunes`, records src digest `dab8c4d3cd36ee59`, which **equals the
  current tree digest**. So the change landed before run-3's first frame and every remaining shot
  will be captured on the same side of it.

Run-3 is therefore homogeneous so far, and if the tree moves again mid-run `G-TREE-ACROSS` VOIDs
rather than scores and the resume re-captures the drifted shots. What the move **does** invalidate
is any comparison against the two sets that predate it: `shots/inkblack-run2a/` (already excluded)
and `shots/r9` — which §273 rule 4 already forbids as a gate and which this lane uses only to
describe the defect.

## 4. Staleness, recorded

`shots/r9` is ~120 commits old. Nothing in this pre-registration gates on an r9 absolute — P1 and
F1 are a delta between two arms of one boot, and CAL-3 is a property of the frame being scored.
The r9 numbers in `KNOWN_ISSUES` §270.1 (`p10 0.0955`, `p90/p10 4.06`, "floor lifted 2.01x")
describe a 120-commit-old build, motivate the work, and gate nothing. What *would* be exposed is a
future claim of the form "the ink now matches the reference's 0.0474": that needs a same-run
shipped control, and none is registered.
