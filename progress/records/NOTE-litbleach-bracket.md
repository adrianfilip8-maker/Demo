# NOTE — combat's §302 bracket break, measured: 2 px at ±1 LSB, and my first hypothesis was wrong

Written while chunk 3 is still capturing, so the diagnosis is on record before the fold and
cannot be shaped by the verdict it will produce.

## What happened

`combat.off` (sha 529340b81834a5cc) and `combat.back` (sha badfc30eb2da8cb4) differ. `back` is a
byte-identical re-assignment of `off` (hold 0, dbgTerm 0), so the seal's `R_combat` bar — 0 px —
fails, and because PREREG-litbleach is fail-closed that VOIDs every acceptance and protection row.

## What it actually is

Measured offline from the committed frames (`scratchpad/bracket.mjs`):

```
shot        off vs back   max channel delta   where                    candidate off-vs-on
traversal      0 px            —              —  (bracket HOLDS)          3,040 px
combat         2 px            1              on subject, x377-378 y519-522   10,372 px
```

**Two pixels, one least-significant bit, on the subject.** That is 0.02% of the candidate's own
effect on the same shot.

## The hypothesis I published, and its refutation

The chunk-2 commit (4b02250) guessed the cause was FX: *"combat is the impact frame and carries
FX (cane trail, impact starburst, veil) whose state may advance per render call rather than per
world-clock tick, which dt:0 would not freeze."* It was labelled untested, and it is **wrong**.
FX drift would show as a cluster on the trail or the starburst, tens to thousands of pixels, at
large channel deltas. What is there instead is 2 px at delta 1 sitting **on the character**, in a
single 8×8 grid cell. That is floating-point/rasterisation non-determinism in a skinned draw, not
world state moving between arms.

## What it means for §302

§302 established that **cross-boot** `[0,0]` pixel bars are unachievable on this renderer and
that only same-boot bars are valid. This measurement narrows that further, and the pair of shots
is what makes it credible rather than anecdotal: traversal returns **exactly 0 px** in the same
run, so same-boot exact-zero *is* achievable — just not universally. **Same-boot 0-px brackets
hold on some shots and not others; combat carries ~2 px of ±1 LSB subject drift within one boot.**

## What I am NOT doing about it

**The bar does not move.** `R_combat` was sealed at 0 px before any frame existed, frames now
exist, and §141.1 is absolute. Two pixels at ±1 LSB is exactly the kind of number that invites
"that is basically zero" — and PREREG-litbleach §11 already committed, in writing and before the
capture, that a **one-pixel** PROT_ENV failure would be a real failure blocking the ship. It
would be indefensible to hold that line for a bar I expected to fail and abandon it for one I did
not. The run VOIDs on `R_combat`.

## Successor

A NEW seal (never an edit to this one) may register a bracket tolerance justified by this
measurement — e.g. `≤ 8 px AND max channel delta ≤ 2`, which admits this class of noise while
still catching any real world-state movement, since the candidate's own effect is 10,372 px and
three orders of magnitude clear of it. That tolerance must be argued from the numbers above and
sealed before its own capture. Everything else in PREREG-litbleach — rects, doses, acceptance
bands, PF gates, the §9 LOOK — carries over untouched, exactly as this seal carried lithold's.

The traversal chunk's `R` passed, so its measurements remain **evidence-grade** and belong in the
RESULT as such: informative, and explicitly not a verdict.
