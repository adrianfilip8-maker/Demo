# RESULT-charab-r6 — blind round 6: incumbent vs SlyModel3 **stage 7** (tail crease fix)

Protocol held: fresh agent, seed-6 pairs, key committed before the spawn.

## Verdict, translated through the key

| pair | A | B | letters | by model |
|---|---|---|---|---|
| sly-closeup | base | model3 | A,A,B,A | incumbent 3 — rebuild 1 |
| sly-profile | model3 | base | A,A,A,A | **rebuild 4** — incumbent 0 |
| sly-perch | model3 | base | B,B,A,A | 2 — 2 |
| traversal | base | model3 | A,A,B,B | 2 — 2 |

**Rebuild 9, incumbent 7.** The rebuild still wins the round — but the margin collapsed from two
consecutive 15–1s. **The pre-committed decision rule fires: r6 regressed ⇒ `git revert 0ada772`;
the final round runs on stage 6 (`314a8c3`).**

## Why the revert is taken even though stage 7 "won"

The rule was committed before the round precisely so it could not be argued with afterwards
(§193.1's discipline). And the evidence asymmetry is decisive on its own: **stage 6 carries two
independent 15–1 rounds on its own frames; stage 7 carries one 9–7.** The final is a single round
— it should run on the variant with the strongest direct evidence, which is stage 6 regardless of
whether stage 7's geometry is "really" better.

## Confounds, recorded so the regression is not over-read

- **Judge variance exists at the feature level.** r4 praised stage 6's traversal tail ("smooth
  banded arc"); r5, on the *same frames*, called it "a thin blade in traversal". r6's harshest
  new line — the tail "thins to a pale crescent" in traversal — may be the same judge-to-judge
  read variance, not stage 7's 4 mm ring separation, which cannot thin a tail.
- **Cross-boot phase variance is real and mine.** `charab.mjs` freezes its own settle
  (`step(12,0)`) but stages through `setShot(name)` **without** `{dt: 0}` — the option shipped
  after charab was written. So every arm's frames carry a different live-settle phase per boot
  (§28/§193): the incumbent frames are one boot, stage 6's another, stage 7's a third. r4-vs-r5
  was immune (same frames); r6-vs-r4 is not. Part of the 15–1 → 9–7 delta is boot phase, not
  geometry. Recorded, not used to overturn the rule — the rule knew renders differ by boot when
  it was written.
- r6 re-names the cane "detached" in perch on the rebuild: hook and shaft are one rigid strip on
  one bone, so this is the body occluding the mid-shaft at that camera, not geometry separating.

## Standing

- `0ada772` reverted; the tree's SlyModel3 is stage 6 again (verify: smoke verts = 2,801).
- The model3 arm re-renders from the reverted tree so the frames on disk match the final round's
  assumption (stage-6 vs incumbent).
- The 15:20Z final-round trigger decides ship/restore per PREREG-charab §6, then resumes all
  paused tasks. The series it inherits: 16–0, 9–7, 10–5, 1–15, 1–15, 7–9 — with the two 15–1s
  being stage 6's direct record.
