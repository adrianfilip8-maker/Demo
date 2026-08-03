# PREREG — Task #28's call site: gated inverted-hull shells on hero props

Registered before the capture. Scored at `RESULT-propshull.md`.

## The decision being made

§132.5 priced Task #28 and made a recommendation but explicitly left the judgement open:

> **Recommendation taken: gate the call site on the accent/hero keys** (~6 draws, ~50 k tris)
> rather than all 11 … **And it needs one capture to judge, not zero:** a 2.5 px hull lands on
> top of a 1.5 px post-process line on the same silhouettes, so hero props will carry a visibly
> heavier line than architecture. That is the intended §2.1 distinction, but *"intended"* and
> *"looks right at this exposure"* are different claims, and no such weight has ever reached a
> frame.

So this capture is not asking "does the hull work". It is asking **whether the combined
2.5 px hull + 1.5 px PostFX line on hero props, against bare 1.5 px PostFX on the architecture
behind them, reads as a deliberate hierarchy or as a defect.**

## What shipped ahead of the capture, and why that is not a prejudged result

`Props.js` `HULL_KEYS = {stone, lime, gold, dark, lapis, carnelian}`, called per merged hero
mesh in `_flushBuckets()`. It is in the tree because the arms have to be *in one boot* to be
comparable, and because the null result is a one-line revert. **Shipping the mechanism is not
the same as accepting the look**, and this file is the record of which claim the capture tests.

Cost is settled and is not what is being judged. Priced offline against the real merged meshes
(`hullprice.mjs`): **+6 draws / +55 718 tris**, identical on every canonical camera — these
meshes are merged by material across the whole level, so frustum culling removes none of them.
Against the measured main-view worst case (71 draws / 0.572 M) that is 77 draws (31 % of 250)
and 0.628 M (52 % of 1.2 M).

## Arms — one boot, dt pinned to 0 on every step

Shells are toggled by **detaching them from their host**, not by `.visible`. That is deliberate:
`PostFX` calls `beginNormalPass()`/`endNormalPass()` every frame, and `setOutlinesVisible()`
rewrites `.visible` on every shell in `_shells` — so a per-shell `.visible = false` would be
silently reverted before the frame was drawn, and the "off" arm would not be off.

| arm | state | purpose |
|---|---|---|
| `base` | hulls detached | the shipped frame before this change |
| `base2` | hulls detached | **noise floor — must be 0 px vs `base`** |
| `hull` | hulls attached | the treatment |
| `restore` | hulls detached | **must re-equal `base`** |

Shots: `courtyard` (hero sculpture and architecture at comparable distance — the hierarchy
question) and `interior` (gilded Ra and tomb furniture against a wall a short distance behind —
the low depth/normal-contrast case that is the entire stated reason a hull earns its draw).

## Predictions, registered

- **P1.** `base` vs `base2` = **0 px**. If not, the clock pin failed and every number below is void.
- **P2.** `restore` vs `base` = **0 px**. If not, detach/attach is not a clean toggle.
- **P3.** The changed-pixel population in `hull` vs `base` is **confined to silhouette edges of
  the six hero keys**. Concretely: no changed pixel may sit on a surface interior. If the diff
  shows broad-area change, the shell is not doing what an inverted hull is supposed to do and
  the result is void rather than negative.
- **P4 (the actual question).** On `interior`, the gilded-Ra silhouette gains a legible dark
  edge where it currently merges into the wall behind it. **This is the prediction I most
  expect to be wrong**, because §132.5's own argument is that PostFX's depth+normal pass
  already handles most silhouettes, and the hull only earns its keep where that pass fails.

## Acceptance

**ACCEPT** requires all of: P1 and P2 clean; P3 clean; and, on looking at every frame, the hero
props reading as *more emphatically drawn* rather than *outlined*. A line that reads as a sticker
edge, doubles visibly against the PostFX line, or crawls at grazing angles is a **REJECT**.

**REJECT** ships as a revert of the `HULL_KEYS` call site, and the null gets written up — three
routes into §7.3's gold line have already returned null or regression (§137.2) and a fourth is
worth exactly as much as the three.

Explicitly **not** claimed by this capture: anything about `spec: 0.55` (§137.2's remaining
Architecture-side lever, upstream-blocked on SHADING's `diff`-assembly question), and anything
about the guard's unmasked `uMetal` (§137.1, routed to an owner-less module).
