# PREREG-patrolgap — acceptance for the rerouted patrols and the stealth timing gap

Sealed **before** a single replacement waypoint was authored. `PREREG-routeaudit.md` has already
been scored and its verdict on the *shipped* routes stands unamended: 6 of 9 BROKEN, 8 of 11
guards on a broken route. This seal governs what may replace them.

## Why a second seal rather than an amendment

`PREREG-routeaudit.md` registered T1–T4 on a **centre-line** sample. That is enough to convict a
route that runs through masonry; it is not enough to accept one, because a guard is a cylinder,
not a point, and `Guard._step` stops him with forward rays at `radius` (0.42 temple / 0.56 heavy
/ 0.26 scarab). A route whose centre-line clears a column by 0.3 m passes T1 and still pins the
Heavy against it forever.

So C1 below is a **new and strictly stronger** criterion, registered here before the routes it
judges exist. It does not touch the shipped-route verdict, which was measured under the old seal
and is reported as measured. Nothing here re-derives anything already scored.

## Instrument

`tests/patrol.test.mjs`, plain Node, no browser, no lock. It builds the shipped level
(`buildEgyptLevel`) once, harvests every registered collision proxy into a world-space AABB, and
serves the **real** `raycast` / `groundCheck` contract off those boxes. The shipped `Guards`
module is then stood up against that oracle and stepped at a fixed 1/60 — so the guards walk the
actual temple, not the five hand-placed boxes `src/ai/Guard.test.mjs` uses.

Every count below is printed, and every data-driven assertion also asserts its inspected count is
non-zero (§211.1).

## Registered criteria

**C1 — CLEARANCE.** For all 9 routes, at 400 arc-uniform samples, the distance from the sample to
the nearest `wall` or `pole` AABB, measured in XZ at chest height, must be `> radius + 0.20 m`
for the widest body that walks it. Zero violations permitted.

**C2 — GEOMETRY.** All 9 routes CLEAN under `PREREG-routeaudit.md` T1–T4 verbatim: no wall/pole
sample, no consecutive-sample ground step outside `[−stepDown, +stepUp]` = `[−1.05, +0.85]`,
≤ 5 % unsupported, ≤ 5 % floor-mismatched against the authored `baseY`.

**C3 — NO STALL.** Stepping the real garrison for 180 s of pure patrol against the real level,
every guard must travel a **total path length ≥ 0.55 × (route length × 180 s ÷ expected lap
time)**. Stated plainly: a guard who is stuck against a wall covers almost no ground, and this
catches it whatever the cause. In addition every guard must visit **≥ 3 distinct dwell stops**
over the window — a guard oscillating in a corner can accumulate distance without ever
progressing along his beat.

**C4 — TIMING GAP.** For each of the designated chokepoints below, over a 240 s patrol window
sampled at 0.1 s:

  - **C4a** the longest contiguous interval in which the point is inside **no** guard's core
    detection cone (angle ≤ `halfAngle`, within `range`, line of sight clear) must be
    **≥ 6.0 s**. *Derivation, fixed here before measurement:* the widest corridor a player must
    cross in this level is the hall aisle at 5.5 m; at `TUNE.sneakSpeed` = 1.4 m/s that crossing
    is 3.93 s; × 1.5 for approach and commit = 5.9 s, rounded to 6.0 s.
  - **C4b** the point must be inside some guard's core cone for **≥ 8 %** of the window. A gap is
    only a gap if there is pressure around it; a point no guard ever looks at is not stealth
    content, and C4a passes trivially there. A point failing C4b is reported as UNGUARDED, and
    that is a design finding, not a pass.

  Chokepoints, named before measurement, chosen as the points the traversal line in
  `EgyptLevel.js`'s header actually passes through:
  `spawn (0, 0, 30)`, `terrace-foot (0, 0, 20)`, `obelisk-base (0, 2, 11)`,
  `court-west (−18, 0, 8)`, `court-east (18, 0, 8)`, `hall-door (0, 0, −17)`,
  `hall-nave-mid (0, 0, −34)`, `hall-west-aisle (−20, 0, −34)`, `inner-gate (0, 0, −52)`,
  `crypt-nave (0, −12, −66)`.

**C5 — DETERMINISM (AGENTS.md §1).** Two `Guards` instances built from the same seed and stepped
identically must agree on every guard's position to 1e-9 after 60 s.

## Calibration arms — every one MUST fire

- **CAL-1 (clearance detector).** A synthetic route threaded 0.1 m from a known hall column must
  violate C1. If it does not, every C1 pass is meaningless and the run is VOID.
- **CAL-2 (stall detector).** One guard is pinned by an injected wall across his beat; C3 must
  fail for him. A stall detector that cannot see a pinned guard proves nothing about the ones it
  passes.
- **CAL-3 (coverage detector, both signs).** A probe at (0, 0, 300) — open desert, no guard
  within 300 m — must report **0 %** coverage and therefore fail C4b. A probe pinned 2.5 m
  directly in front of a guard held facing it must report **> 90 %** coverage and a longest gap
  of ~0 s. Both must fire: one arm alone cannot distinguish a blind instrument from a quiet one.
- **CAL-4 (LOS detector).** The same probe as the high arm, with a wall injected between guard
  and probe, must drop to **0 %**. Otherwise the cone is being scored as if the temple were
  transparent and C4's coverage numbers are fiction.

## What the result licenses

C1–C3 passing licenses the statement "every guard can physically walk his whole beat in the
shipped temple". C4 passing at a chokepoint licenses "this point is guarded and has a learnable
window". **Neither licenses any claim about how the game looks or feels** — no frame is rendered
anywhere in this instrument, and no screenshot argument may be built on these numbers.

A chokepoint that fails C4b is reported UNGUARDED and left as a stated design gap unless fixing
it is a route edit; it is never fixed by widening a cone, because that would be retuning the
detection model to make a placement measurement pass.
