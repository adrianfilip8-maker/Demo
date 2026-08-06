# PREREG-charab — how the character rebuild is judged, sealed before any verdict

**Owner:** coordinator. **Subject:** `SlyModel.js` (incumbent) vs `SlyModel3.js` (Sly 3 rebuild).
**Reference:** `SPEC-sly3model.md` and the four user-supplied Sly 3 images it records.

Written now, while the rebuild is a blockout and nobody could yet prefer it, because a criterion
authored after seeing the frames is not a criterion. Three verdicts were published and retracted
in this project on 2026-08-06 alone; every retraction came from the prereg's own text rather than
from new data (§193.1).

## 1. The user's instruction, quoted, because it fixes the default

> *"let the critic decide between the current model and the new model, restoring the current one
> if it is still better."*

Two things follow and are binding:

- **The incumbent wins ties.** The rebuild must be **better**, not equal. "No clear winner" ⇒
  restore the incumbent.
- **Restoration is not an action.** `main.js` resolves to `SlyModel.js` whenever the `?char=` /
  `__CHAR_AB` token is absent, misspelled, or its file is missing. So the incumbent is restored by
  *doing nothing*, and the rebuild can only ship if someone changes that default deliberately.

## 2. Blindness — the protocol, and why the obvious version does not work

The critic compares **pairs**, told only "A" and "B".

**The hazard specific to this comparison:** the two models are trivially distinguishable by anyone
who has read this repository — the rebuild has a visibly larger head. So blinding by "don't say
which is which" is not blinding at all if the same agent wrote the model. Therefore:

- the critic is a **fresh agent** with no access to `SPEC-sly3model.md`, this file, or the rebuild
  source, and is given only the frames and the reference images;
- **side assignment is randomised per shot** and recorded to `charab/blind-key.json` **before** the
  critic runs, so the key exists and cannot be retro-fitted;
- the critic writes verdicts **per side letter**, never per model name.

## 3. What the critic is asked — the same four questions per pair

Scored against the **Sly 3 reference images**, not against taste:

1. **Identity at a glance.** Which side reads as Sly Cooper faster? (mask, muzzle, cap, tail)
2. **Silhouette.** Which side has the stronger read as a black shape at 1/4 scale?
3. **Proportion fidelity to the reference.** Head-to-body, leg length, foot size, tail mass.
4. **Craft.** Which side would survive a screenshot next to the reference without excuses?

Each answer is **A / B / neither**, with one sentence of reason naming a visible feature. A verdict
with no named feature is discarded — that is the rule that makes the round re-runnable.

## 4. Gates that are decided by arithmetic, not opinion

These run against the frames regardless of what the critic says, and a failure on any of them means
the rebuild does not ship **even if the critic prefers it**. They are `SPEC-sly3model` §5's
falsifiers, made measurable:

| id | quantity | rule |
|---|---|---|
| **G1** | hue of cap / shirt / gloves / boots on the rebuild | max pairwise hue spread ≤ 6° (F1: it is one blue) |
| **G2** | gold elements (belt, collar, cuffs, cane) | max pairwise hue spread ≤ 8° (F5) |
| **G3** | subject height in frame, rebuild vs incumbent, same shot | within ±2 % (F6 — otherwise the A/B is about size) |
| **G4** | tail root width ÷ head width, rebuild | ≥ 0.40 (F3) |
| **G5** | rebuild renders on all four shots with no console error | any error ⇒ not shippable, full stop |

**G3 is the one most likely to bite** and it is registered deliberately: the rebuild's head is
larger by design, so if total height drifted, the critic would be comparing a bigger character
rather than a better one.

## 5. Falsifiers on the comparison itself

- **C-F1 — arm identity.** Each arm's readback must report the model it claims (`root.name`
  `sly3` for the rebuild, otherwise the incumbent). A mismatch ⇒ **VOID**, both arms re-run. The
  runner already checks this, because a silently-ignored `?char=` would produce two identical arms
  and a confident null — §194's shape.
- **C-F2 — no pixel band.** The arms are separate boots, so §193's cross-boot floor (28,431 px on
  an FX shot) applies. **No verdict in this seal may rest on a differing-pixel count between
  arms.** Every gate in §4 is a within-frame measurement or a per-arm property, by construction.
- **C-F3 — clock.** Both arms capture through `step(n, 0)`. If a frame is produced by any path
  that advances the world clock (`grab()`, `setShot`'s live steps), that shot is **UNSCOREABLE**
  for silhouette comparison (§28/§195).
- **C-F4 — stage.** If the rebuild is still a blockout when the round runs, the critic is told so,
  and the round is recorded as **provisional**: a blockout losing on "craft" is expected and is not
  evidence about the rebuild's ceiling. Only an **on-form** rebuild produces a shipping verdict.

## 6. Outcomes, enumerated in advance

| outcome | action |
|---|---|
| critic prefers rebuild on ≥3 of 4 questions **and** G1–G5 all pass | **SHIP** — change the default in `main.js`, record in `KNOWN_ISSUES` |
| critic prefers rebuild but any gate fails | **DO NOT SHIP.** Fix the gate, re-run. A gate is not overridden by preference |
| split, or "neither" dominates | **RESTORE INCUMBENT** (§1: ties go to the incumbent) |
| critic prefers incumbent | **RESTORE INCUMBENT**, and record which features it won on — that is the rebuild's work list |
| C-F1 or C-F3 fires | **VOID**, re-run |
| round is provisional (C-F4) | no shipping decision; the result is a work list only |

**In every non-ship outcome the action is identical and requires no edit**: leave the default
alone. That asymmetry is intentional — it makes "restore the current one" the cheapest possible
path and the rebuild has to earn its way past it.
