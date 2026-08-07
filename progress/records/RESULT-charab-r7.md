# RESULT-charab-r7 — blind round 7: incumbent vs SlyModel3 **stage 8** (closeup head + boots)

Protocol held: fresh agent, seed-7 pairs, key committed before the spawn.

## Verdict, translated through the key

| pair | A | B | letters | by model |
|---|---|---|---|---|
| sly-closeup | model3 | base | B,B,A,A | 2 — 2 |
| sly-profile | base | model3 | B,B,B,B | **rebuild 4** — 0 |
| sly-perch | model3 | base | A,A,A,A | **rebuild 4** — 0 |
| traversal | base | model3 | neither,A,B,A | incumbent 2 — rebuild 1 (+1 neither) |

**Rebuild 11, incumbent 4, neither 1.** The critic's by-build tally ("slim 11 / heavy 4") matches
the key exactly — seventh consecutive round of verified blinding.

## The sealed rule, applied mechanically

fb6a57f's commit message, before this round existed: *"stage 8 becomes the final-round model iff
r7's rebuild total >= 13 of 16 AND the closeup pair is at worst 2-2."*

- closeup 2–2: **satisfied**.
- total 11: **fails** the ≥13 bar.

**⇒ stage 8 REVERTED; the final runs on stage 6.** No relitigating: 11–4 is a strong round —
better than r6's 9–7 — but the bar demanded the 15–1 class, and it was set high deliberately
because stage 6 already holds two 15–1s. The revert costs nothing real: stage 8's changes are
recorded and can be re-tried after the window on their own evidence.

## What r7 actually says about stage 8's targets

The stage targeted the closeup head and boots. Closeup identity+silhouette **still went to the
incumbent** — the critic's note on the rebuild's face at 5×: "the mask is a horizontal black bar,
the amber eyes are two crushed smears at differing angles, and there is no black nose." The bigger
cranium and ruff did not flip the read; the face *construction* (eye stack, nose visibility at
closeup range) is the residual defect, and it is a different defect than the one stage 8 fixed.
Boots: no boot complaint this round (r6's "paddle-flat" did not recur) — that half landed.

Also recurring, third round running: the cane reads as two disconnected pieces in the perch
crouch on the incumbent-described side and "the hook crosses the muzzle" in profile. Pose-camera
interactions, logged for post-window work.

## Standing

- fb6a57f reverted; SlyModel3 is stage 6 again (smoke must read 2,801).
- model3 arm re-renders (s6c) so disk frames match the final trigger's assumption.
- Series: 16–0, 9–7, 10–5, **1–15, 1–15**, 7–9, 4–11 — the final runs on the variant with the
  two 15–1s.
