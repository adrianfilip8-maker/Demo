# PREREG-routeaudit — do the authored guard patrols exist in the shipped level?

Sealed **before** any route sample was measured against level geometry (§141.1). Nothing below
may be re-derived after seeing a number; a mis-derived criterion voids the run and it is said so.

## Question

`src/ai/Patrol.js` authors 9 routes and an 11-guard ROSTER as hand-typed `[x, z]` waypoints.
`src/world/EgyptLevel.js` builds the temple. **Nothing has ever checked the two against each
other.** `src/ai/Guard.test.mjs` (44 tests, all green) runs against a *stub* collision world of
five hand-placed boxes — it proves the follower code works, and can say nothing at all about
whether the authored paths lie on the temple's actual floors.

## Instrument

Headless: `buildEgyptLevel(new Architecture(quietEngine()))` in plain Node — the same route
`tests/level.test.mjs` already uses, ~1 s, no browser, no lock. Harvest every registered
collision proxy into a world-space AABB (`Box3.setFromObject`) carrying its `tag`.

- `support(x, z)` — the highest AABB top over tags `ground` / `ledge` whose XZ footprint
  contains (x, z), searching only supports at or below `baseY + 2.5`. `null` if none.
- `blocked(x, z, y)` — the point (x, y) lies strictly inside a `wall` or `pole` AABB.

Sample each route's shipped `Route` object (the same Catmull-Rom the guard walks, same seed)
at **N = 400** arc-length-uniform values of u.

## Registered thresholds

Per route, measured over its own 400 samples:

- **T1 — WALL.** ≥ 1 sample where `blocked(x, support+1.15, z)` is true (chest height inside a
  wall or pole). A guard authored inside masonry. **BROKEN.**
- **T2 — CLIFF.** ≥ 1 consecutive-sample pair whose supported ground rises > `TUNE.stepUp`
  (0.85 m) or falls > `TUNE.stepDown` (1.05 m). These are the guard's own refusal gates in
  `Guard._step`; past either he sets `speed = 0` and does not move. **BROKEN** — the patrol
  stalls permanently at that point.
- **T3 — VOID.** > 5 % of samples have `support === null`. The guard is walking on the authored
  `baseY` fallback with no collision under him. **SUSPECT.**
- **T4 — FLOOR MISMATCH.** ≥ 5 % of *supported* samples where `|support − baseY| > 1.05`. The
  authored `baseY` is not the floor the level actually has there. **SUSPECT.**

A route is **CLEAN** only if it trips none of T1–T4.

## Calibration arms — both MUST fire, or the instrument is blind

- **CAL-A (wall detector).** A synthetic route straight through the inner pylon mass at
  (0, −52) — `L.inner` is 22 × 7 × 34 m of solid stone. T1 **must** fire on it. If it does not,
  every "no wall hit" result below is meaningless and the run is VOID.
- **CAL-B (support detector).** A synthetic route at x = 200, z = 200 — open desert, far outside
  every stylobate. T3 **must** fire on it at ~100 %. If it does not, every "supported" result is
  meaningless and the run is VOID.
- **CAL-C (cliff detector).** A synthetic route crossing the courtyard terrace edge at
  x = 0, z = 0 → z = 12 — `L.terrace.s1` tops at y = 2.0 over paving at y = 0. T2 **must** fire.

## What the result licenses

- A route tripping T1 or T2 is **rerouted or removed**. No amount of tuning fixes a guard who
  cannot take a step.
- A route tripping only T3/T4 is reported, and fixed only if the fix is the authored `baseY`.
- **A clean result licenses nothing.** It says the paths lie on floors; it says nothing about
  whether they are good patrols, which is a design judgement and is argued separately.

Counts are printed whatever they say, and every per-route line reports how many samples it
inspected — a route reporting 0 inspected samples is a failure of the instrument, not a pass
(§211.1: nine assertions once passed while inspecting nothing).
