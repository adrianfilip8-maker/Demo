# NOTE — PROPS lane handoff: what is shipped, what is queued, and exactly how to finish it

## Shipped

**basketvary (seal a)** — `11b852c`. Seven registered rows PASS. The coil clone family is gone:
8 identical placements -> 6 authored props with one silhouette each, max identical in ANY
registered camera 8 -> 1 (courtyard 7 -> 1), bbox-diagonal CV 0.0025 -> 0.2667, and the seal is
**2,672 triangles negative**. Gameplay volumes pinned EXACTLY equal (colliders 272 + tag
histogram, decals 46, fx 24, lights 24) by `tests/basketvary.test.mjs`. Suite 536/536.

## Queued — one run serves both remaining seals

`progress/records/props1/props1.mjs`, launched detached (log
`progress/records/logs/props1-run1.log`, pid file `/tmp/sands-of-ra/props1-run1.pid`), waiting on
the FIFO capture lock. It installs `cand-colossus.patch` **only under the lock** and reverts on
release (§186); `src/` is clean the whole time it queues.

* **coinlit (seal b)** — a same-boot poke A/B, 6 shots x 5 arms (`off/mon/non/both/back`), no
  install needed for its own levers. `diff(off, back)` per shot is the only validity block and
  is claimed SAME-BOOT ONLY (§302). Score: `node progress/records/props1/coinlit-score.mjs`.
* **colossus (seal c)** — its seven NUMERIC rows already PASS on the tree that ships it
  (`801a748`): infW 2/2 -> 6/6, front relief 0.734/0.742 -> 1.162/1.128, knee tops 5/5 at
  y 4.49-4.51 with the ledge collider covering them, pair asymmetry 0.0218 -> 0.192 m, lane
  triangles -180. The **LOOK gate is the only binding condition left** and its frames are the
  run's `off` arms — read `props1run1/courtyard.off.png` and `kaykit.off.png` against
  `shots/r12/courtyard.png`.

## Finishing sequence (in this order)

1. `node progress/records/props1/coinlit-score.mjs` -> RESULT-coinlit.md. On PASS the ship-write
   is the three edits named in PREREG-coinlit §6 plus `tests/coinlit.test.mjs`. On FAIL/VOID
   nothing ships.
2. Read the LOOK frames -> RESULT-colossus.md. On PASS,
   `git apply progress/records/props1/cand-colossus.patch` plus `tests/colossus.test.mjs`
   pinning C1/C2/C3/C4/C5. On a numeric-PASS + LOOK-FAIL, record it as a measured falsification
   of the metric — a sculpt that passes an inflection count and still reads as a crate is a
   finding about the instrument and gets written down as one (PREREG-colossus §4).
3. KNOWN_ISSUES entry for the lane.

## Two findings worth keeping whatever the run returns

* **`tools/pixat.mjs` + camera projection named every object in this lane before a single frame
  was captured** — the three visible coils (`props_rope`), the strung coins, the eleven hook
  rings and their apparent pixel sizes. §296's "projection arithmetic is the free instrument",
  used twice more.
* **A shared `rng` stream makes any triangle-count bar a measurement of the whole level.**
  Adding one box inside the colossus re-rolled every prop placed after it — 400+ triangles of
  churn from a `chance(0.6)` vessel/basket flip four hundred metres away, on a sculpt that added
  1232. Forking the stream per hero prop is what made the seal's own bill measurable.
