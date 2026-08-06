# RESULT-charab-r5 — reproducibility check: SAME stage-6 frames, fresh critic, new sides

**Purpose:** r3→r4 swung 10–5 → 1–15 in one stage. Before trusting the final round to a single
judge, this round measures inter-critic variance on identical frames — no render, only the seed
and the judge changed.

## Verdict, translated through the key (seed 5)

| pair | A | B | letters | by model |
|---|---|---|---|---|
| sly-closeup | model3 | base | A,B,A,A | **rebuild 3** — incumbent 1 |
| sly-profile | model3 | base | A,A,A,A | **rebuild 4** — incumbent 0 |
| sly-perch | base | model3 | B,B,B,B | **rebuild 4** — incumbent 0 |
| traversal | model3 | base | A,A,A,A | **rebuild 4** — incumbent 0 |

**Rebuild 15, incumbent 1 — the identical total to r4, from a different critic on different side
assignments.** The single conceded point is even in the same pair and question (closeup
silhouette; r4's critic credited the incumbent's head mass, r5's its tail volume at that one
camera). Fifth consecutive round of verified blinding.

## What this establishes

- **Inter-critic variance on these frames is ≈ zero at the total level.** Two independent judges,
  15–1 and 15–1. The r3→r4 flip was therefore the MODEL changing, not judge noise, and a
  single-round final verdict is methodologically sound.
- The critics' remaining note for the rebuild is consistent across both rounds: the tail's
  closeup/backlight read (r5: "flat creased ribbon ... a thin blade in traversal" at those two
  cameras). Logged as the one open item; **the freeze holds** — it is not worth risking an r3-style
  regression for one point out of sixteen.
- Both critics independently describe the incumbent the same way (multi-hue desaturated blues,
  no trousers/belt/sash, "a raccoon in a jumpsuit") — the palette findings of every round since
  r1 are stable across four different judges.

## Series to date

| round | rebuild stage | incumbent | rebuild |
|---|---|---|---|
| r1 | 2 (blockout+) | **16** | 0 |
| r2 | 4 | **9** | 7 |
| r3 | 5 | **10** | 5 |
| r4 | 6 | 1 | **15** |
| r5 | 6 (same frames) | 1 | **15** |

## Standing

Model frozen at stage 6 (`314a8c3`). The deciding round runs at the window's end per the user's
instruction; on these numbers PREREG-charab §6's ship condition is satisfied twice over, and the
final round is the confirmation that decides.
