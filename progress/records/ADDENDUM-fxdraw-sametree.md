# ADDENDUM to PREREG-fxdraw — same-tree arms, a provenance guard, and D2 gets a same-run control

Written **before any candidate exists** and before `shots/fxshape/` has been scored: the
attribution boot is still in the FIFO queue as this is committed. Nothing here relaxes a
threshold; two things are tightened and one arm table is restructured. §141.1 is intact because
there is nothing to see yet.

Cause: the materials lane VOIDed a run today on provenance — its two arms were captured twenty
commits apart, and the intervening commits included `src/core/Shots.js` (the hero lane's D4
re-framing). Four agents commit to this branch continuously and every arm waits on a FIFO, so a
comparison spanning two invocations spans two trees **by default, not by accident**.

## 1. The candidate run is ONE invocation, five arms, one tree

`PREREG-fxdraw` §3 listed `base`, `base2`, `<suspect>`, `cand`, `cand-off`. That table did not
say they had to share a boot, and read literally it permitted the exact defect above. It now
does say so, and the mechanism makes it cheap: **every arm is a page-side mutation, so there is
no source arm and no reason to take the lock twice.**

- `base` — shipped emitter table.
- `<suspect>` — the named emitter suppressed. Denominator for D1/D3/D4.
- `cand` — the candidate values written into the emitter definition object in-page.
- `cand-off` — candidate installed, emitter suppressed. Numerator's denominator.
- `base2` — the shipped table restored. **Doubles as the restore check**: it must match `base`
  to under 200 changed px, which proves both that the clock did not move and that installing
  and removing the candidate left no residue.

If the lock is lost between arms the run is abandoned and re-run whole. A partial arm set is
not scored.

## 2. `sameTree` guard, fail-closed

`fxshape.mjs` records `git rev-parse HEAD` and `git status --porcelain src/` at boot, and writes
both into `manifest.json` alongside every arm. `fxshapean.mjs` refuses to score — **VOID, not
FAIL, and not a warning** — if the manifest is missing the field, if the sha differs from the
tree it is scored against, or if `src/` was dirty at capture time. A scorer that prints a number
when it cannot establish provenance is the §263.1 shape: something that is not `true` being
treated as `true`.

## 3. D2 gains a same-run control and keeps its absolute

`PREREG-fxdraw`'s D1, D3 and D4 are ratios against a control captured in the same run, so the
staleness problem does not reach them. **D2 was the exception**: `mean saturation >= 0.35`, an
absolute whose justification came from `shots/r9`, now ~120 commits old. The materials lane was
bitten by exactly this — a registered absolute scoring PASS at 1.27 while its own same-run
control measured 1.22.

D2 becomes a **conjunction**, both halves required:

- **D2a (absolute, unchanged):** mean saturation of the candidate's own contribution `>= 0.35`.
- **D2b (same-run control, new):** that saturation `>= 2.5x` the same emitter's contribution
  saturation measured in the **same boot**, from the `base` / `<suspect>` pair.

2.5x is derived rather than picked: r9 measured the smear's own pixels at **0.089–0.108**, and
2.5x that spans 0.22–0.27, so D2b is the *weaker* half wherever the current build still resembles
r9 and D2a carries the decision. D2b exists to catch the case where it does not — where 120
commits of other lanes' grading work have already moved the effect's chroma, and 0.35 would
certify a candidate no better than its own control. Requiring both means the run cannot pass on
a stale number alone.

The reference figures quoted in `PREREG-fxdraw` §1 (`sly3-venice`: 0.02% largest bright
component, drawn VFX at saturation 0.736–0.740) are **not** stale — that file is a fixed
scratchpad artefact and does not move with our tree. Only our own r9 numbers do, and where they
are quoted as motivation rather than as a bar, they are labelled as of r9.

## 4. What is knowingly still anchored on r9, and is not a gate

`PREREG-fxdraw` §1's table of r9 measurements motivates the claim; it does not score it. The
attribution boot re-measures the frame under test in its own tree, so the ship decision rests on
same-run numbers throughout. Anywhere the RESULT quotes an r9 figure it will say "r9" beside it.
