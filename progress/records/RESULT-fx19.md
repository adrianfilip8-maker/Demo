# RESULT-fx19 — the bracket is entirely past the cliff, and the seal is what makes that visible

Scored by the coordinator, 2026-08-03, against `PREREG-puff.md` as sealed at `b5ec3f1`.
FX had stopped before the arms landed. Nothing is shipped by this run, as the seal required.

## Provenance and applied state — both pass

`fx19.log` ends `fx19 DONE — wrote shots/fx19/fx19.json`. Seven arms on disk. Per §98.1 the
discriminator is PNGs plus the manifest, not the directory.

**Requested-vs-applied matches on every arm**, which is the check §89.2's uniform leak forced into
the harness:

| arm | `applied` readback | verdict |
|---|---|---|
| `base` | `sandLow:0 sandHigh:0` | no ceiling |
| `cap120` | `uMaxSize=0.12 … readback[sandLow:0.12 sandHigh:0.12]` | applied |
| `cap085` | `readback[…0.085 …0.085]` | applied |
| `cap055` | `readback[…0.055 …0.055]` | applied |
| `back` | `sandLow:0 sandHigh:0` | **restored** |

No arm is VOID. The restore-from-boot-originals fix held — `back` reads the same state as `base`.

## The controls, and they are the strongest part of the run

| pair | differing px | of frame |
|---|---|---|
| `base` vs `back` — **revert-and-restore** | **0** | 0.000% |
| `base` vs `no-sandLow` — **absence control** | 34 258 | 3.717% |

Zero on the restore control, on a 921 600-pixel frame, means the poke went out and came back with
no residue and the scene is deterministic frame-for-frame. That is the cleanest control in the
record. The absence control moves 3.717%, so the batch under test genuinely has that much presence
in this framing — the run is measuring something real.

## The result: three arms that are the same arm

| pair | differing px | of frame |
|---|---|---|
| `base` vs `cap120` | 34 253 | 3.717% |
| `base` vs `cap085` | 34 271 | 3.719% |
| `base` vs `cap055` | 34 377 | 3.730% |
| **`cap120` vs `no-sandLow`** | **718** | **0.078%** |
| `cap120` vs `cap085` | 788 | 0.086% |
| `cap085` vs `cap055` | 217 | 0.024% |

**Capping at 0.120 — the value the seal calls "deliberately weak" — is within 0.078% of deleting
the ground-haze sheet outright.** Going from no ceiling to *any* ceiling in this bracket moves
34 000 pixels; moving across the entire bracket, 0.120 → 0.055, moves about 1 000.

The step that matters happens **before** the bracket starts. All three arms are past the cliff.

## What this does and does not establish

**Established, at the frame level and independent of mechanism:** the three ceilings are mutually
near-identical and near-identical to absence, so **this bracket cannot rank them.** Applying the
seal's ship rule — *"ship the largest ceiling that passes both bands"* — would select 0.120, a value
empirically equivalent to deleting the sheet that Band 2 exists to protect. Band 2 should catch
that, and if it does, the seal has worked exactly as designed: it will refuse all three rather than
bank a Band 1 pass.

**Not established: why.** Two mechanisms fit the same frames and this run cannot separate them.

1. **Clamping, with every sprite already above 0.120.** Then the ceiling is doing its job and the
   bracket is simply sited far below the size distribution.
2. **The ceiling culls rather than clamps** at any non-zero value. Then the knob is not a size
   ceiling at all and no bracket of it means anything.

`fx19.json` cannot decide this: its `maxSize` field reports the **ceiling uniform**, not the
observed sprite size, so `base`'s `sandLow.maxSize: 0` is the no-ceiling sentinel and says nothing
about how large the sprites actually are. Reading it as a measurement would be §11 again.

## The one arm that separates them, and it is cheap

**A ceiling far above the current range — 0.5 and 1.0.** Under clamping those must converge on
`base` as the ceiling rises past the largest sprite. Under culling they stay pinned at
deletion-level regardless. One boot, two arms, and the same readback discipline.

Until that runs, **no value should ship**, and §57's rule is the one that applies:

> A search whose winners pile against an edge is reporting that its optimum is outside the box.

Here the winners do not pile against an edge — they pile on top of *each other*, and on top of the
absence control. That is the same signal in a different shape: **a bracket whose arms cannot be
told apart from each other or from absence is reporting that its range is entirely on one side of
the transition**, and the fix is to move the range, not to pick a winner inside it.

## Credit where the design earned it

This run was pre-registered before a value was chosen, poked by uniform rather than by shipping,
carried a revert-and-restore control that returned exactly zero, and carried an absence control
that gave the effect a scale to be judged against. **Every one of those was necessary to see the
result.** Without the absence control, `base → cap120` at 3.717% reads like a large, healthy
effect — and it is a large effect; it is just the wrong one. The number that turns it from a
success into a mis-sited bracket is the 0.078% against `no-sandLow`, which only exists because
somebody registered an absence arm before knowing they would need it.
