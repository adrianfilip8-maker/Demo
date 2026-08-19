# Camera framing: what actually reaches the screen

> **Read this section and stop, unless you want the derivation.** Everything below it is how the
> table was arrived at, and two of its earlier revisions were wrong in the same direction.

Both open feel decisions — **full lead compensation** and **`land.tau`** — were previously priced
in `FRAMES` channel numbers. A `FRAMES` entry is an offset into a chain of up to three blends, not
a pixel value, so those numbers were wrong by up to an order of magnitude. This is the same
question asked at the screen.

Method: drive the real `Controller` through the shipped temple, replay the trajectory through a
`CameraRig` sharing the same `Collision`, and for every framing residency replay it a second time
with the state **pinned** — which settles every blend at the same motion and gives the pixel value
the screen converges to if the player stays in the state. Delivered = how far toward that the
screen actually got. Aggregated **absolute-weighted** (`Σ|got| / Σ|asked|`), because a mean of
per-visit fractions flatters: `wall_run`'s boom reads 47 % as a mean and **5 %** in metres.

```
  framing    visits  frames  len med/max |  boom    fov   pivY   lead   side  pitch
  ─────────────────────────────────────────────────────────────────────────────────
  idle (=move)   19     617      14/166   |   41%    50%    77%    90%    94%    89%
  air            13     467      24/202   |   16%    88%   100%    73%     —    103%
  glide           1     175     175/175   |  100%   100%   112%   120%     —    107%
  sneak           1     158     158/158   |  100%   100%    61%   100%     —    100%
  wall_run        3     112      46/ 46   |    5%     —    113%     —     94%   106%
  combat          6      93      16/ 24   |   35%    28%     —      —      —     71%
  dive            2      57      49/ 49   |   61%    58%    93%     —      —     93%
  roll            2      38      23/ 23   |   60%    46%    74%    30%     —    105%
  land            2      12       6/  6   |    0%     —      —      —      —    100%
```

In metres and degrees, which is what the percentages are of:

```
  land        boom  0.00 of 0.54 m       <- the boom does not move on a landing. At all.
  wall_run    boom  0.13 of 2.59 m       <- 5 %, on a framing only made reachable this session
  air         boom  1.34 of 8.49 m
  combat      boom  0.96 of 2.70 m       fov  1.85 of 6.72 deg
  idle        boom  5.18 of 12.69 m      fov 12.38 of 24.55 deg
  dive        boom  3.47 of 5.65 m       fov  2.64 of 4.58 deg
  glide       boom  2.65 of 2.65 m       fov  3.85 of 3.87 deg   <- closes cleanly
  sneak       boom  2.19 of 2.19 m       fov  4.41 of 4.43 deg   <- closes cleanly
```

> ## The `lead` column delivers almost nothing, on most rows by construction
>
> `_pivotGoal` floors the lead at the follow spring's own trail, so the delivered lead is
> `max(leadTime × f.lead − followTimeH × f.stiff, 0) × speed − deadzoneH`. **On 11 of 19 framings
> that margin is negative** — `idle walk sneak crawl balance spire dive ledge_hang climb land
> combat` — so the delivered lead is exactly −`deadzoneH` at every speed and the authored `lead`
> number has no effect at all. `air` authors 1.20 and delivers **0.159 m**; `hook_swing` authors
> 1.60 under *"Lead frames the landing"* and delivers **0.130 m**. Only `run_fast` (1.19 m) and
> `rail_slide` (1.30 m) carry real lead.
>
> So the `lead` percentages in the table below are ratios of small numbers and should not be read
> as feel. The metres are in `camdrive` D8, in closed form. (The 92 %-vs-26 % `air` spread that
> sent me looking was exactly this: the goal lead is 1.25 m throughout a jump and the pivot sits
> 1.35–1.78 m behind it — on the ground as well, so it was never a jump problem.)

> ## SUPERSEDED by the per-speed census — `KNOWN_ISSUES.md` §450, §460; sheet items 6–7
>
> The box above was read at `runSpeed` for every row, and the sample was the instrument (§440):
> the delivered lead is a metre quantity under a metre cap, so no row's number is readable at
> another row's speed. Re-driven at each row's own speed, and corrected on four counts:
>
> - **13 of 19 were floored, not 11.** `hook_swing` (−0.037 m at its own 8.0 m/s) and `rail_slide`
>   (+0.022 m at `railMax` 15) were floored too, by a different constant: `leadMax` was applied to
>   the *authored* lead where it was calibrated against the *delivered* one, so above 7.29 m/s
>   (swing) / 13.67 m/s (rail) the cap landed under the spring's own trail and **no value of
>   `leadTime` or `f.lead` moved either row at all** (§460). The 0.130 m quoted above was the
>   single-speed read of a row the cap holds at its real speed.
> - **That stage error is repaired** (sheet item 6, the constant unmoved): `hook_swing` now
>   delivers **+0.219 m** and `rail_slide` **+1.772 m**. "Only `run_fast` and `rail_slide` carry
>   real lead" is doubly stale — and `walk`/`run`/`run_fast` were deleted in §463; no state ever
>   routed to them.
> - `air` delivers **0.217 m** driven — the 0.159 was the continuous-time closed form, which
>   understates by half a frame of travel (§450.1). Thin against an authored 1.20, not inert. And
>   *"lead hard"* was never `air`'s comment; it belonged to `run`/`run_fast` two rows up — the
>   same misattribution class as §442.
> - The decision this box priced is now **sheet item 7**, priced not shipped: `leadTime`
>   0.17 → 0.22 recommended; every value in 0.180…0.315 wakes `land` (margin −0.001 s, the one
>   authored intention that never arrives) and leaves the deliberately-still rows floored; `glide`
>   pays, `ndcY` −0.514 → −0.552. The constants stand. `camdrive` D9 holds the per-speed census by
>   mechanism; D8 remains as the closed form whose single-speed read this box quoted.

> ## Read the row names before quoting this table
>
> **A framing key is not a move**, and two rows are not about what they are called (audited by
> `camdrive` D7, `KNOWN_ISSUES.md` §442):
>
> - **`wall_run` is 100 % `wallCling`.** Not one frame behind that row is the `wallRun` state. The
>   published 5 % was a measurement of the wall *cling* — held against a wall, not running along
>   one — and the row was quoted to three lanes before anyone checked. A real lateral wall run is
>   reachable (50 of 62 entries across 14 sites) and simply never occurred on these routes.
> - **`idle` is 51 % the `move` state.** That is the documented `move → idle` routing, so it is
>   known rather than new, but the row is majority *running* and reads as though it were standing.
>
> Pooling also hides spread where the name is fine: **`air` is 68 % `fall` and 32 % `jump`, and
> their `lead` delivery is 92 % against 26 %.** One number for both told nobody that. `sneak`,
> `dive`, `roll`, `land` and `glide` are single-state and correctly named.

**Rows where the answer is essentially none:** `land` (0 %) and `wall_run` (5 %) — but see the box
above for what `wall_run` actually measured. **Rows that close cleanly:** `glide` and `sneak` — the
two with long uninterrupted residencies. Everything else is partial, and the partiality is not
random.

### The one sentence that explains the whole table

**Delivery tracks chain depth, not `tau`.** `pitch` is one blend from the screen and closes on 8 of
9 framings. `boom` is three (`_frame.dist` → `_boomWant` → `boom`) and misses on 7 of 9. `fov` and
`lead` are two and sit in between. Shortening a framing's `tau` moves only the first stage.

### What this changes about the two open decisions

- **`land.tau`** was going to be arbitrated at "45 %". The screen figure is **0 %** — the boom
  travels 0.00 m of the 0.54 m it is asked for. Whether that matters is still a feel question: the
  channel that would be felt is `stiff` (the landing snap), which has no single screen quantity
  because it modulates a rate rather than a position, and it blends on the same clock.
- **Full lead compensation** is priced on the `lead` column, and that column is the *healthiest* in
  the table — 73–120 % everywhere it is authored. So the lead decision was priced roughly right,
  and it remains what it was: a trade between `air` gaining apparent size and `glide` dropping
  further down frame.
- **`wall_run` is new information.** Routing it correctly (`STATE_FRAME`, this session) made the
  framing reachable, and it still does not arrive: 0.13 m of 2.59 m. Fixing a route is not the same
  as delivering a framing, and nothing before this measured the difference.

**Nothing is retuned.** Every candidate change here is a feel decision.

## What shortening the chain would buy — priced, not shipped

`land.tau` was never the lever, because `tau` moves only the first of three stages. So the question
is what collapsing the **boom** to the depth `pitch` already has would do. Measured on a patched
copy that does not land, same absolute-weighted scorer, identical trajectories.

**Exactly two of the 19 blend sites were collapsed, and which two is the result:**

1. `_boomWant`'s own `smoothDamp` (`zoomTime` 0.16 s) — removed; `want` feeds through directly.
2. `this.boom`'s `smoothDamp` **on the free-air path only** — when the boom is *extending* and no
   occlusion is in play, it takes the value directly.

**Left exactly as shipped:** the occlusion pull-in (already instant), and the entire recovery
design — `recoverDelay` 0.22 s, `recoverTime` 0.62 s, `recoverSpeed` 6.0. Collapsing those would
have deleted a documented behaviour rather than shortened a chain, and the numbers would then be
about a different camera.

**Re-measured after the objects lane's `landImpact` repair — it holds** (§440.5). The repair made
2.5x as many landings register, so `land` now asks for 2.13 m instead of 0.83 m and the collapse
delivers 1.11 m against 0.44 m before. Post-repair figures in brackets.

```
  framing        boom SHIPPED -> COLLAPSED      in metres, got of asked
  land                6%   ->   52%             0.10/1.68  ->  1.11/2.13
  combat             35%   ->   73%             0.96/2.70  ->  2.68/3.66
  dive               61%   ->   88%             3.47/5.65  ->  4.98/5.68
  roll               65%   ->   89%             0.59/0.91  ->  0.85/0.95
  idle (=move)       43%   ->   63%             5.33/12.52 ->  8.85/13.77
  air                13%   ->   32%             1.19/8.86  ->  3.19/9.69
  wall_run            8%   ->   10%             0.21/2.72  ->  0.28/2.80
  glide             100%   ->  100%             2.65/2.65  ->  2.42/2.42
  sneak             100%   ->  100%             2.19/2.19  ->  2.20/2.20
```

**The two healthy rows cost nothing.** `glide` and `sneak` are 100 % before and 100 % after. That
was the question, and the answer is the second of the two the brief named.

**The cost is continuous motion, not pops.** Over the identical trajectories:

```
                 mean |Δboom|/frame     p99 step      direction reversals
  shipped            11.12 mm           108.6 mm        40 in 1852 frames
  collapsed          14.79 mm           111.9 mm        48 in 1852 frames
```

+33 % mean boom motion and +20 % reversals, but the **p99 single-frame step is unchanged** (+3 %),
which is the useful shape: the worst steps are occlusion pull-ins and those were left alone.
Collapsing does not add snaps; it adds small continuous movement.

**And it separates two causes that looked like one.** `land` 0 → 53 % is chain depth. `wall_run`
5 → 8 % is not — chain shortening does not reach it.

> **RETRACTED TWICE — see `KNOWN_ISSUES.md` §439 and §440.** The `wall_run` row above aggregates
> `wallClimb`/`wallCling`/`wallJump`, which share the framing key and are not wall runs; a real
> lateral wall run is reachable at 14 sites and lasts 24 frames against a 40-frame blend.
>
> **First retraction:** This note previously said `wall_run`'s boom is
> "governed by the wall it is running along". Instrumented, the boom is cut by **0.03 m** — it is
> not occluded at all. What is actually wrong is the bank: `_wallSide` is 0 on 121 of 121 frames
> and `_roll` is exactly 0.00000, because the level's wall runs are head-on and the probe casts
> sideways. The chain-collapse numbers above are unaffected; only the explanation of `wall_run`'s
> row was wrong.

Still a human's call: +33 % of continuous boom motion against `land` going from nothing to half.

---

# Appendix: the lead question, and how this table was arrived at

**Arbitration package, not a proposal.** Revision 2 — the first revision was priced on an open-sky
stub and the playtest lane found it understated the starting point. This one is measured by driving
the real `Controller` through `realWorld()` (terrain, architecture, props, one BVH) and replaying
the recorded trajectory through a `CameraRig` sharing that same `Collision`, so the boom cast, the
whisker set and the ceiling probe are all live.

Reproduce with `node --test tests/camdrive.test.mjs`. Both arms of `TUNE.leadMode` are exercised
there on every suite run, so this table cannot drift from the code it describes.

---

## Correction 1: the stub was wrong about the trajectory, not about the occlusion

The obvious mechanism for the stub understating `ndcY` is the thing it visibly lacks. **It is not
that.** Replaying one recorded trajectory through the real BVH and through an open-sky stand-in
gives the same `ndcY` to three decimals over open ground:

```
  route          framing    real BVH    open sky    camDist
  desert run     idle         -0.190     -0.189       5.83
  desert run     air          -0.002     -0.001       5.99
  glide          glide        -0.534     -0.534       8.36
  into masonry   wall_run     -4.542     -0.204       0.96   <- the only row that disagrees
```

Occlusion contributes **zero** to the glide framing. What the stub got wrong was the **motion**: it
held `velocity.y` at zero. `_pivotGoal` drops the look-at by `min(fall × fallLeadTime, fallLeadMax)`
and `_effectivePitch` tips down by `smoothstep(2, fallPitchSpeed, fall) × fallPitch`; a real glide
descends at `glideFall` −3.2 m/s and both engage. Driven, `glide` reads **−0.534**, which is the
playtest lane's live **−0.532** — not the stub's −0.330.

So the conclusion the lane reached is right and the mechanism is not, and the difference matters:
**adding occlusion to the stub would have changed nothing and looked like a fix.** The repair is to
drive real trajectories, which is what this revision does.

The masonry row is kept because it is the only place the two collisions disagree, and it is what
makes the agreement elsewhere a measurement rather than a property of an instrument that cannot
tell them apart. It also carries its own lesson: `Vector3.project()` returns numbers for points
behind the camera and they look like data. The first run of this instrument reported `ndcY` of
−11.650 for frames where the boom was cut to `distHardMin` and the camera was inside Sly. Every
projection is now gated on the near plane and the rejects are counted.

## Correction 2: the floor's promise is a steady-state promise, and chopped states sit outside it

The lane's `air` objection is correct and now has a number. A framing settles within about
**3 × followTimeH × stiff** seconds — 30 frames for `air`, 29 for `idle`, 37 for `glide`. Split on
that criterion (pre-registered, derived from the rig's own constants):

```
  framing  route        n   %run  maxRun  3tau  settled |  lead FLOOR
  idle     desert run  112   47%     69     29    yes   |   -0.074
  air      desert run  128   53%    108     30    yes   |   -0.070
  glide    glide       175   80%    175     37    yes   |   +0.108
  idle     glide        38   17%     29     29    yes   |   -0.087
  air      glide         7    3%      7     30    NO    |   -0.256   <- 2.5x outside the bound
```

**Whether `air` settles is a property of the route, not of the state.** On the desert run it holds
108 unbroken frames and sits inside the floor's bound; on the glide it is a 7-frame hinge between
`move` and `paraglide` and sits at −0.256 m, two and a half times outside it. The floor was never
wrong — it answers about settled motion, and a hinge is not settled motion.

Practical consequence for arbitration: **a row with `settled = NO` cannot be arbitrated on its
mean.** Read its occupancy first.

---

## The price of full compensation, on driven motion

```
  framing  route         n  %run maxRun settled | lead FLOOR  FULL | ndcY FLOOR   FULL | camDist FLOOR->FULL | mean v
  idle     desert run  112   47%    69    yes   |   -0.074  0.454 |   -0.190  -0.236 |    5.83 -> 5.32     | 6.87
  air      desert run  128   53%   108    yes   |   -0.070  0.509 |   -0.002  +0.019 |    5.99 -> 4.35     | 2.86
  idle     glide        38   17%    29    yes   |   -0.087  0.377 |   -0.281  -0.328 |    6.38 -> 5.96     | 6.28
  air      glide         7    3%     7     NO   |   -0.256  0.184 |   -0.281  -0.328 |    5.97 -> 5.55     | 7.20
  glide    glide       175   80%   175    yes   |   +0.108  1.197 |   -0.534  -0.676 |    8.36 -> 7.43     | 5.62
```

**What changed from revision 1, and it changes the recommendation of where to look:**

- **`glide` is now clearly the row that decides this.** It holds 80 % of its route, it settles, and
  FULL takes `ndcY` from −0.534 to **−0.676** — from 77 % of the way to the bottom edge to 84 %.
  That is spent from a floor 0.20 lower than revision 1 displayed, exactly as the lane predicted,
  and it is the case flagged as most likely to look wrong. It still is, and now by more.
- **Ordinary running is still the smallest change**, and the driven number is smaller than the stub
  suggested: `ndcY` −0.190 → −0.236, `camDist` 5.83 → 5.32 (+9.6 % apparent size).
- **`air` on the desert run gains 0.579 m of lead for +37 % apparent size** (5.99 → 4.35 m). That
  is the largest apparent-size change in the table and it happens at a mean 2.86 m/s, so it is not
  a top-speed edge case.

## Rows that revision 1 had and this one does not

- **`railSlide` is deleted.** The playtest lane found it unreachable in play — dropping onto the
  rail-tagged cable gave `sneak` once and `hook_swing` once — and no driven route here reached it
  either. Its +32.6 % was the largest number in revision 1's table and it was **about a state that
  has never been observed in the real level**. It should not have been weighted, and it is not
  weighted now.
- **`hook_swing` is not in the driven table.** The route that reaches a real ring ends in masonry
  with the boom cut to ~1 m, so the framing there is dominated by the wall rather than by the lead;
  the lane's own live figure ran at 4.18 m/s against the stub's 8.0 and is likewise not
  speed-matched. **The honest position is that hook swing is unpriced**, not that it is cheap.

## The cost side, unchanged and still the reason this is a question

Full compensation moves `leadMax` from raw space into net space — capping the raw re-creates the
defect at exactly the speeds it bites, since the raw cap binds while the trail keeps growing.
Four of eight framings never reach their bind speed in this game; four do. That changes what the
constant means, not what it is, and it is why this is not a constant edit.

---

## Correction 3: `FRAMES.tau` and state residency are two columns nobody had compared

Asked to characterise `air`'s settle behaviour, the measurement found a second clock in front of
the follow spring and a bigger result behind it.

`_blendFrame` eases every framing channel with `ease(cur, target, tau, dt)`. So the most of an
authored framing that a residency of `n` frames can **ever** deliver is `1 − exp(−n·dt/τ)` — a
ceiling with nothing to do with the follow spring and everything to do with how long the state
lasts. Measured on driven routes, scoring the `dist` channel:

```
  route              framing   visits  frames   len min/max   need 95%   peak best/worst
  flat run + jumps   air          3      255       28/182        47        100% /  73%
  flat run + jumps   land         1        6        6/  6        25         45% /  45%
  long fall          air          1      171      171/171        47        100% / 100%
  glide              glide        1      175      175/175        72        100% / 100%
  glide              air          1        7        7/  7        47         32% /  32%
  temple approach    air          7      117       10/ 27        47         81% /  60%
```

**`air` has no single answer, and that is the answer.** A long fall holds it 171 frames and
delivers 100 %; a glide hinge holds it 7 and delivers 32 %; ordinary platforming hops around the
temple hold it 10–27 frames and deliver 60–81 %. The framing a player sees for `air` genuinely
depends on how they got there.

**`land` is unreachable by construction, and that is a statement about the table.** `Land` runs
`landSoftTime` 0.09 s = 5.4 frames; `FRAMES.land.tau` is 0.14 s. Ceiling **47 %**, measured peak
**45 %**. A hard landing at `landHardTime` 0.19 s reaches 74 %. **No route, no player and no
machine has ever seen more than half of the `land` framing.** It has been authored, maintained and
reasoned about for the life of the file and has never once been on screen.

Reported, not fixed. The one-line change is `FRAMES.land.tau` → ~0.03 s, and that makes the framing
deliverable *and* turns a blend into something much closer to a cut on every landing in the game.
Same class of decision as full compensation, and it wants the same eyes.

Worth checking against the rest of the table by the same arithmetic: `roll` runs `rollTime` 0.44 s
against `tau` 0.16 → 94 % ceiling, fine. Every other framing belongs to a state a player can stay
in. That leaves `dive`, below.

## Correction 4: `dive` is a distribution, and its variance is the finding

`DiveAttack` descends at a constant `diveSpeed` 18 m/s, so its residency is `height / 18` and the
crossover falls out of the same identity: `18 × 3τ` = **4.86 m of fall** to reach 95 %. Driven from
five drop heights:

```
  apex (m)   dive frames   ceiling   dist channel  |   BOOM delivered      FOV delivered
    2.52          8          77 %        73 %      |    5 %  (5.29 m)      43 %  (53.51°)
    4.56         15          94 %        93 %      |   50 %  (4.31 m)      59 %  (54.06°)
    8           26          99 %        99 %      |   86 %  (3.50 m)      78 %  (54.73°)
   15           49         100 %       100 %      |   96 %  (3.29 m)     102 %  (55.55°)
   26           85         100 %       100 %      |  100 %  (3.21 m)     100 %  (55.50°)
```

Flat ground reaches 2.52 m from a jump and 4.56 m stacking a double jump — both under the 4.86 m
crossover. **On open ground the Cane Slam can never reach its own framing; from any architecture it
always does.** So this is the second of the two outcomes: the framing is fine, and its *variance* is
the finding. The same move has two visual identities and nothing tells the player which one they
are getting.

## Correction 5, which is the general form and makes 3 and 4 worse

**`FRAMES.tau` is never the delivery time of anything.** Every channel it authors passes through at
least one more blend before the screen, and the boom passes through two:

```
  boom (m)          _frame.dist   (FRAMES.tau)  ->  _boomWant (zoomTime)  ->  boom (zoomTime/recoverTime)
  camera.fov (deg)  _frame.fov    (FRAMES.tau)  ->  _fovCur (fovTime)
  lateral offset    _frame.side   (FRAMES.tau)  ->  _sideSign (0.35 s)
  pivot x/z         _frame.lead+stiff           ->  follow spring (followTimeH x stiff)
  pivot y           _frame.height               ->  follow spring (followTimeV x stiff)
  roll              _wallSide probe (0.1 s)     ->  _roll (0.22 s)
```

19 blend sites in the file, against 7 `FRAMES` channels. The single-clock ceiling
`1 − exp(−n·dt/τ)` is therefore an **upper bound on delivery, never the delivery** — measured, a
jump-apex dive reaches 73 % of the `dist` channel and **5 % of the boom**, a gap of more than an
order of magnitude. `land`'s 45 % is an overstatement for the same reason.

The longest clock in the file is `ceilTau` **1.103 s** — 199 frames to 95 %, and it is the one
adopted from the reference. It is gated on *moving under a ceiling*, so a doorway crossed in under a
second delivers about half of it. Reported rather than measured: no driven route in this file spends
3.3 s moving under a lintel, which is itself worth knowing.

## Known limits of this instrument, stated rather than discovered later

- **The camera is a passive observer.** In the game its yaw decides what "forward" means, so a
  camera change perturbs the trajectory. One recorded trajectory replayed under both modes is what
  isolates the framing question; the feedback path is real and excluded by construction.
- **The recorded routes are scripted, not played.** They are the shipped moveset on real geometry,
  which is a strictly better instrument than a stub player and a strictly worse one than a human.
- **`hook_swing`, `balance`, `rail_slide`, `spire`, `combat` and `ledge_hang` are unpriced here.**
  Five of those six are attach framings whose driven routes end in geometry that dominates the
  shot; the sixth has never been observed in play at all.
