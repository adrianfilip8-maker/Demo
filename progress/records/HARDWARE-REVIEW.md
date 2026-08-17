# Feel decisions awaiting a person on hardware

Five changes have shipped this session that are **correct by measurement and unsettled by feel**. Each
was landed because leaving it alone was worse — a coin flip, a dead framing, a silent telegraph — but
where the new number sits is a judgement no headless drive can make.

This sheet exists so that judgement can be made in one sitting rather than rediscovered five times.
Every number here was measured, not estimated, and each item says **what to watch** and **which lever
moves it** — because in three of the five the obvious lever is the wrong one.

None of these is a bug report. If something feels right, the answer is "leave it", and that answer is
worth recording too.

**Item 6 is a different kind of entry and is marked as one.** Items 1–5 shipped and ask *is this right?*
Item 6 has **not** shipped: it is a change priced so that it can be decided, because the measurement
that motivates it moves what a player sees on more than one row at once and no headless drive can
arbitrate that. It carries a recommendation rather than a menu, and it names what the recommendation
costs and which row pays.

---

## 1. Landing threshold — `landHard` 9.0 → 15.0 m/s

**Commit** `57c2c9e` · **File** `src/player/Controller.js` (`TUNE.landHard`)

Landings used to be a coin flip. `landImpact` was read as `-velocity.y`, but the swept capsule — which
is what actually stops a fall — zeroed `v.y` before the probe looked. The probe won only when the frame
before touchdown happened to leave Sly inside its 0.06 m band: **12 wins in 40 sub-frame phases**. Driven
on the shipped temple that produced silent landings at 0.5, 4, 6 and 10 m and audible ones at 1, 2.5, 8
and 15 m — *not ordered by arrival speed*, so unlearnable.

Silent meant completely silent: no `land` state, no `landed` event, so no sound, no shake, no impact pose.

Fixing the race made every landing register — and an ordinary jump then arrived at 10.874 m/s, above
the old `landHard` of 9.0. So the correct measurement would have turned **every jump in the game** into a
hard landing. The threshold had to move, and it was derived rather than chosen:

| population | range | how measured |
|---|---|---|
| what the player can do under his own power | 6.196 – 14.586 m/s | 1550 arcs: a 31 × 50 grid of hold/release/press timings at 1-frame resolution |
| authored route descents | 7.753 · 23.749 · 25.368 m/s | dropped for real, not solved for, from `architecture.api.route` |

Two populations separated by an empty band **9.16 m/s wide**, and 14.586 is a hard ceiling — nothing in
1550 arcs exceeds it. The rule taken from the moveset:

> `landHard` is the first landing that was not a move you meant.

The margin has to be quoted in the right units, because **arrivals are quantized**: the sweep records the
velocity the move was made with, so every arrival sits on a ladder spaced one frame of gravity apart,
0.400 m/s. The top three rungs the player can reach are 14.586, 14.186, 13.786. **15.0 clears the top rung
by 1.04 rungs** — a whole step, but only just one. `landBeat` stays at 3.2, so every real landing still
speaks.

> **These numbers were corrected after this sheet was first written** (§443.3). The original entry quoted
> 10.474 – 14.186 m/s, a 5.7 % margin, and "a 4.69 m drop against a maximum reachable apex of 4.262 m".
> That last clause was false and it was the load-bearing one: it invited the conclusion that his own
> jumping *geometrically cannot* cause a hard landing. The real maximum apex is **4.502 m**, which is
> above the 4.441 m whose arrival equals `landHard`. He cannot cause one because the descent is quantized
> and he never gets the extra frame of fall — not because he cannot get high enough. The first derivation
> measured `max(-velocity.y last frame, landImpact)`, which is one gravity tick below the field
> `Land.enter` actually compares against `landHard`; every number in it was a tick low.

> ### ⚠ SECOND CORRECTION — the band below does not exist, and this item is no longer a free judgement
>
> Everything from **"What to watch"** to the end of this item was written against a population measured
> **on flat ground**, and the shipped level is not flat. It is struck through in meaning rather than
> deleted, because it was quoted to two lanes. Read §500 before acting on any of it.
>
> - **"Jump around normally: no landing should cost you control" is false on this level.** The hard
>   landing starts at a **3.15 m hop** and a **4.75 m walk-off** (§447.2, driven). Of the level's 101
>   standable elevated surfaces, **85 are above the jump line and 71 above the walk line**.
> - **The 14.586 … 23.749 band is gone.** Rebuilt against the level's real surfaces, a plain walk-off
>   reaches **29.600 m/s** and the median walk-off is **17.200** — above the threshold itself. 67
>   reachable edges already arrive at or above population B's floor. The two populations overlap.
> - **The caveat immediately below came back CLEAN and it was the wrong caveat.** §447.3 drove wall
>   exits (worst 12.400, zero hard), and the Cane Slam cannot produce one by construction. Nothing
>   moved the ceiling — what moved it was *standing on the level at all*, which nobody had listed as a
>   self-inflicted vertical because it is not a move.
> - **So there is no number to choose.** §500.4's table has no row with zero ordinary hard landings and
>   every authored descent still hard. `landHard` stays at **15.0** pending a second term in the rule,
>   because every alternative is wrong differently rather than less.

> ### ⚠ THIRD CORRECTION (§501) — the second term does not exist either
>
> §500 said the rule needed a second term and named three. **All three were tested and all three
> fail**, so the decision below is no longer "pick a term":
>
> - **"Was it a walk-off?"** — the favourite, and dead on the authored descent itself. Route leg 5→6,
>   `hall-front-cornice → hall-floor`, is population B's 25.368 member, and the cornice is a standable
>   ledge at y **17.004** with the hall floor at y **0.004** beneath it. It *is* a walk-off. The term
>   makes population B's own largest descent soft.
> - **"Was it on the authored route?"** — no radius partitions. At 20 m it calls 78 ordinary walk-offs
>   hard; at 3 m it has stopped covering the route. The level's highest walk-off (29.600 m/s, 18.14 m)
>   is **0.1 m from a waypoint**, so tightening cannot exclude the worst case.
> - **"Was an affordance live and declined?"** — of the 102 hard walk-offs, **51 had one. Exactly
>   half.** And the six highest arrivals all had none, so the term is inverted where it matters.
>
> **And population B contains no falls.** Forced to look at L1's three "authored route descents"
> individually: 7.753 is a 1.2 m hook release, 25.368 is the walk-off above, and 23.749 is a
> **staircase** — §447.1 measured the authored stair into the vault and found it built, correct and
> walkable. Nobody falls into the vault; they walk down. The band `landHard` was placed inside was
> bounded below by a walk-off and above by a stair.

**The decision you are actually being asked to make.** Not a number, and not a rule over the descent.

1. **Do you want some drops on this level to hurt and others not to?** If yes, it has to be **authored
   per surface** — a flag on the collider, a volume, or a property of the landing surface. Every term
   that is a property of the *fall* has now been measured and none carries the information, because
   walking off a terrace and walking off a cornice are the same act on the same kind of surface,
   differing only in height — and height is what arrival speed already measures.
2. **If you do not want to author it**, then pick which way to be wrong from §500.4's table, knowing
   that 15.0 makes 103 of 189 edges hard and the median walk-off on this level is 17.200 m/s — above
   the threshold itself.

**Cost of option 1**, so it is priced rather than gestured at: 101 standable elevated surfaces, of
which 189 driven edges have a drop.

**What is still safe to say.** `landBeat` 3.2 is not in question — every landing speaking is right, and
§443.1's coin-flip silence is genuinely fixed. Arrivals are quantized at 0.400 m/s, so any future
choice moves in whole steps. And one number on this page that *is* a plain defect rather than a
judgement: walking south off stage 2 lands 15.600 because of a ~0.15 m notch in the ground proxies
(§500.5), filed for the world lane and not a threshold input.

**What is still safe to say.** `landBeat` 3.2 is not in question — every landing speaking is right, and
§443.1's coin-flip silence is genuinely fixed. The arrival quantum is 0.400 m/s and every threshold sits
on that ladder, so any future choice moves in whole steps.

---

## 2. Camera boom chain collapsed

**Commit** `be55d6f` · **File** `src/player/CameraRig.js` (`_boomLength`)

The camera's authored framings were not reaching the screen, and the cause was structural rather than
tuning: delivery tracked **chain depth, not `tau`**. `pitch` sits one blend from the screen and closed on
8 of 9 framings; `boom` sits three and missed on 7 of 9. Shortening any row's `tau` moves only the first
stage of three.

Two of nineteen blend sites were collapsed — `_boomWant`'s own `smoothDamp`, and `this.boom`'s **on the
free-air path only**. The occlusion pull-in and the entire recovery design are untouched.

| framing | before | after |
|---|---|---|
| `land` | 6% | **52%** |
| `combat` | 35% | **73%** |
| `dive` | 61% | **88%** |
| `roll` | 65% | **89%** |
| `idle` | 43% | **63%** |
| `air` | 13% | **32%** |
| `glide` | 100% | 100% |
| `sneak` | 100% | 100% |

**Cost.** Mean boom motion 11.35 → 15.27 mm/frame (**+35%**) and direction reversals 38 → 52 over 1852
frames. The **p99 single-frame step is unchanged** (108.6 → 111.9 mm), which is the evidence that this
adds small continuous movement rather than snaps — and the reason the occlusion pull-ins were left alone.

**What to watch.** Whether the camera now reads as *responsive* or as *restless*. The +35% is continuous
low-amplitude motion; the question is whether it registers as life or as noise. Stand still, then move,
then stop — the reversal count is where busyness would show.

---

## 3. The Cane Slam's two visual identities have largely merged

**Same commit as item 2.** Listed separately because it is a different kind of consequence, nobody
predicted it, and a reviewer will not notice it unless told to look.

The dive framing's delivery across drop heights was **5 / 50 / 86 / 96 / 100 %** and is now
**71 / 92 / 98 / 97 / 100 %**. A jump-apex dive went from 5% of its boom to 71%, so a short slam and a
full-height slam now look substantially alike where they used to read as two different moves.

The crossover arithmetic explains the residual exactly, so this is understood rather than mysterious.
Whether it is *wanted* is the open question.

**What to watch.** Cane Slam from a small hop, then from the top of something. If those should be two
distinct reads, this needs the dive framing separated by drop height rather than the collapse reverted.

---

## 4. Traversal telegraph — half a second of warning

**Commit** `8a3af14` · **Files** `src/player/Controller.js`, `src/ui/HUD.js`

The game did not tell you what it would let you grab. `targetLocked` — the signal meaning *the game has
chosen this hold* — had exactly one listener, `Particles`, and never reached the HUD. `hookGrab` and
`railMount` reached Audio and FX only, and fired **on contact**. The one telegraph that existed was gated
behind holding `focus`. Measured on both grab paths: announcement and commitment on the **same frame**.

The renderer already existed; what was missing was an emit and a subscription. Now:

```
E-grab (kiosk lintel -> ring 3)   telegraph@0, hookGrab@30   ->  30 frames, 0.50 s
```

The mark names the exact hold that gets taken. An early version ranked by *nearest* affordance and
pointed at the ledge under Sly's own feet — the frame count was already correct with the wrong hold
marked, which is why the arm now asserts the specific ring.

**What to watch.** Whether half a second is enough time to see a hold, decide, and act. **The lever if it
is short is `AFFORD.hook.range`, not the telegraph** — the telegraph fires the moment `afford` sees the
hold, and it cannot warn earlier than the game knows.

*Still unmeasured:* the auto-grab path, whose lead is bounded by `hookAuto` rather than `hookGrab` and is
structurally shorter. Expect it to be the weaker of the two.

---

## 5. Camera lead compensation — `TUNE.leadMode`

**Ships as** `'floor'`, with full compensation retained as a switch.

`FRAMES.lead`'s sign was inverted — −0.939 m delivered against +0.428 m authored — and floored rather
than fully compensated, pending exactly this review. The `lead` channel is the healthiest column in the
delivery table (73–120% wherever authored), so the decision was priced roughly right and remains the
trade it was.

**What to watch.** Full compensation buys `air` apparent size at the cost of `glide` sitting further down
frame. Glide across the courtyard, then jump off something — the two are in direct tension and one of
them has to give.

**Related and unresolved:** `land`'s felt channel is `stiff` — the landing snap — and it has **no screen
quantity at all**, because it modulates a rate rather than a position. It cannot be measured headlessly
and can only be judged by eye. Now that item 1 makes every landing register and item 2 gives the boom 52%
instead of 6%, this is the first time it has been watchable.

---

## 6. The velocity lead reaches four rows a player can meet — *priced, not shipped*

**Proposed** `TUNE.leadTime` **0.17 → 0.24** · **File** `src/player/CameraRig.js` · **Nothing has changed
in source.** The nineteen framings each author a `lead`, and on most of them that number does nothing at
all. This item says which ones, whether that is wrong, and what fixing it would cost.

### What actually reaches the screen

`_pivotGoal` applies the lead to the follow *goal*, and the follow spring then trails the goal by its own
smoothing time. So the authored number is not the delivered one:

```
  delivered = max( min(leadTime × f.lead, leadMax / v) − followTimeH × f.stiff , 0 ) × v − deadzoneH
                   \__ what the row asks for __/  \_ the cap _/   \___ the spring's own trail ___/
```

Two constants can each independently cancel the whole authored value, and **which one does it decides
which repair works**:

* **`stiff` floors it** when `leadTime × f.lead` is simply smaller than `followTimeH × f.stiff`. Eleven
  rows. Fixable by `leadTime`, by that row's `f.lead`, or by `followTimeH`.
* **`leadMax` floors it** when the 1.75 m cap lands *below* the trail — which happens above
  `leadMax / (followTimeH × f.stiff)` m/s. Two rows. **Not fixable by `leadTime` or by `f.lead` at any
  value**, because the cap bites first. `leadMax` was calibrated against *delivered* metres and is
  applied to *authored* ones, which is why it does something nobody intended at speed.

### The census, at each row's own speed

Measured by driving the shipped rig to steady state, at the speed each row actually occurs at
(`Controller.TUNE`: `runSpeed` 7.2, `sneakSpeed` 1.4, `railMax` 15, `shimmy` 1.05, a dive's horizontal
30 % retention, and so on). **Speed matters because the cap is a metre cap on a per-second quantity**, so
one row's number cannot be read at another row's speed.

```
  row          v     authored  delivered   floored by
  idle        7.20     0.35     -0.043     stiff   — short by 0.1245 s
  walk        2.60     0.90     -0.079     stiff   — short by 0.0070 s      no state routes here
  run         7.20     1.40     +0.612     —                                no state routes here
  run_fast    7.20     1.85     +0.729     —                                no state routes here
  sneak       1.40     0.50     -0.089     stiff   — short by 0.1150 s
  crawl       1.15     0.50     -0.091     stiff   — short by 0.1070 s
  hook_swing  8.00     1.60     -0.037     leadMax — cap 0.219 s < trail 0.240 s
  rail_slide 15.00     1.90     +0.022     leadMax — cap 0.117 s < trail 0.128 s
  balance     2.40     0.20     -0.081     stiff   — short by 0.2220 s
  spire       0.10     0.15     -0.099     stiff   — short by 0.2785 s
  dive        2.16     0.40     -0.082     stiff   — short by 0.0200 s
  wall_run    4.80     1.30     +0.308     —
  ledge_hang  1.05     0.20     -0.092     stiff   — short by 0.1740 s
  climb       3.00     0.35     -0.076     stiff   — short by 0.1245 s
  glide       5.60     1.50     +0.207     —
  land        7.20     0.70     -0.041     stiff   — short by 0.0010 s      ← knife edge
  roll        8.40     1.20     +0.607     —
  air         7.20     1.20     +0.217     —
  combat      4.60     0.50     -0.063     stiff   — short by 0.0590 s
```

**Thirteen of nineteen floored, not eleven**, and the two additions — `hook_swing` and `rail_slide` — are
floored by the cap rather than by `stiff`. Of the six that deliver, **three have no registered state that
routes to them**: `walk`, `run` and `run_fast` are authored rows nothing can reach, because `Move` falls
through to the `idle` framing and the speed ladder was never wired. So **four rows a player can actually
meet deliver any lead at all: `air`, `glide`, `roll`, `wall_run`.**

### Which of the inert rows are inert *on purpose*

This is the part that decides whether anything should be done, and there is evidence for it in the table
rather than only an opinion. **Across all nineteen rows `lead` and `stiff` are anti-correlated (r = −0.35).**
An author compensating for the trail by hand would have raised `lead` *with* `stiff`; instead the stiller
a row is authored, the less lead it asks for. The two knobs were reached for **in the same direction**, so
on those rows the inertness is intent expressed twice, not an accident:

| inert **on purpose** | the tell |
|---|---|
| `spire` | lowest `lead` in the table (0.15) **and** highest `stiff` (1.90). Comment: *"back and up to show the drop, and go very still."* |
| `balance` | second-lowest `lead` (0.20), second-highest `stiff` (1.60), same comment |
| `ledge_hang` | `lead` 0.20. *"drop under the lip and look up past it — the point is what's* above*"* — the shot is vertical |
| `sneak`, `crawl` | *"close, tight, low. Intimate and tense"* at 1.4 and 1.15 m/s. A camera that runs ahead of a creep is wrong |
| `climb` | `vtrack: 1`. The move is vertical; horizontal lead is not its channel |
| `dive` | `DiveAttack.enter` cuts horizontal velocity to 30 %. The dive's channel is the drop, and `stiff` 0.55 is the snap |
| `combat` | the orbit's channel is `side: 0.30`, which opens toward the circle. Running ahead of a man circling a mark is the wrong shot |
| `idle` | correct **as authored** — it is the standing-still framing |

**Eight of those nine want no lead and get none, which is the system working.** That leaves the actionable
set far smaller than "eleven rows are inert":

| authored intention that never arrives | evidence it was meant to lead |
|---|---|
| `hook_swing` | `lead` **1.60**, the second-highest in the table, under the comment ***"Lead frames the landing."*** It is also the one row that breaks the anti-correlation — high `lead` *and* high `stiff` (1.50) — i.e. the one place an author asked for both, and the only place the two knobs genuinely conflict. Delivers **−3.7 cm**. |
| `rail_slide` | `lead` **1.90**, the highest authored value in the file, on the fastest move. Delivers **+2.2 cm**. |
| `land` | margin **−0.001 s**. Not a decision anybody made — a knife edge on the wrong side. Delivers **−4.1 cm**. |
| `idle`-as-`move` | not a lead defect at all. Ordinary running is framed by the *standing-still* row because the walk/run/run_fast ladder is unrouted. Belongs to whoever owns that ladder. |

`air` is **not** in this set: it delivers 21.7 cm, thin against an authored 1.20 but not inert.

### What each lever does, all nineteen rows, metres on screen

Measured, one lever at a time. A per-row `f.lead` edit is measured too: only the product
`leadTime × f.lead` is ever read, so raising one row's `lead` is exactly that row run at the equivalent
`leadTime`, which lets a per-row edit be driven rather than solved for.

```
  row          v    baseline  lead .20  lead .24  fTimeH .12  fTimeH .10  dead .05  dead 0  leadMax 3.0   'full'
  idle        7.20    -0.043    -0.043    -0.043      -0.042      -0.041    +0.007  +0.057    -0.043     +0.386
  walk *      2.60    -0.079    -0.027    +0.066      +0.007      +0.059    -0.029  +0.021    -0.079     +0.319
  run *       7.20    +0.612    +0.648    +0.648      +0.878      +1.011    +0.662  +0.712    +0.612     +1.672
  run_fast *  7.20    +0.729    +0.729    +0.729      +0.975      +1.098    +0.779  +0.829    +1.244     +1.708
  sneak       1.40    -0.089    -0.089    -0.089      -0.089      -0.089    -0.039  +0.011    -0.089     +0.030
  crawl       1.15    -0.091    -0.091    -0.091      -0.091      -0.091    -0.041  +0.009    -0.091     +0.007
  hook_swing  8.00    -0.037    -0.037    -0.037      +0.274      +0.514    +0.013  +0.063    +0.219     +1.713
  rail_slide 15.00    +0.022    +0.022    +0.022      +0.334      +0.575    +0.072  +0.122    +1.102     +1.772
  balance     2.40    -0.081    -0.081    -0.081      -0.081      -0.081    -0.031  +0.019    -0.081     +0.000
  spire       0.10    -0.099    -0.099    -0.099      -0.099      -0.099    -0.049  +0.001    -0.099     -0.097
  dive        2.16    -0.082    -0.082    -0.065      -0.078      -0.054    -0.032  +0.018    -0.082     +0.065
  wall_run    4.80    +0.308    +0.496    +0.745      +0.482      +0.569    +0.358  +0.408    +0.308     +1.000
  ledge_hang  1.05    -0.092    -0.092    -0.092      -0.092      -0.091    -0.042  +0.008    -0.092     -0.056
  climb       3.00    -0.076    -0.076    -0.076      -0.076      -0.075    -0.026  +0.024    -0.076     +0.102
  glide       5.60    +0.207    +0.459    +0.529      +0.499      +0.646    +0.257  +0.307    +0.207     +1.372
  land        7.20    -0.041    +0.103    +0.304      +0.169      +0.277    +0.009  +0.059    -0.041     +0.816
  roll        8.40    +0.607    +0.643    +0.643      +0.877      +1.012    +0.657  +0.707    +0.607     +1.682
  air         7.20    +0.217    +0.476    +0.498      +0.520      +0.672    +0.267  +0.317    +0.217     +1.426
  combat      4.60    -0.063    -0.063    -0.063      -0.062      -0.062    -0.013  +0.037    -0.063     +0.328

  * no registered state routes to this row — it cannot appear on screen as things stand
```

Read the columns for what each one *cannot* do:

* **`leadTime`** never moves a single one of the eight deliberately-still rows, at either value. It also
  never moves `hook_swing` or `rail_slide` **at any value whatsoever** — the cap, not the authored number,
  is what is holding them.
* **`followTimeH`** wakes everything that was meant to lead, including the two the cap holds, and also
  leaves the eight still rows alone. It is the *most effective* lever and the most global: it is the
  horizontal smoothing time of the entire follow, so it changes how the camera tracks on all nineteen rows
  whether or not the steady-state lead moves.
* **`deadzoneH`** is a uniform +5 cm or +10 cm on every row and wakes nothing. It buys almost no lead and
  spends the thing it exists for: during a fidget in place the pivot travels **0.219 m at 0.10, 1.153 m at
  0.05 and 2.456 m at 0** — 5× and 11× the motion in the shot the deadzone exists to hold still.
* **`leadMax` 1.75 → 3.0** is the surgical one: **every other row is identical to baseline to the digit**,
  and only the three the cap binds move. It is the only lever that repairs `hook_swing` without touching
  the follow spring.
* **`f.lead` per row** repairs `land` (0.70 → 1.03 delivers 0.30 m) and cannot repair `hook_swing` or
  `rail_slide` at all — 1.75, 3.00, any value, delivers **+0.000** against baseline.

### The recommendation

**Raise `TUNE.leadTime` from 0.17 to 0.24. One constant. Nothing else.**

It is not the lever that fixes the most rows — `followTimeH` is. It is the lever that fixes the rows a
player meets on **every jump in the game** while being provably unable to damage the rows built to be
still, and whose headroom is a derived band rather than a taste:

```
  land wakes at leadTime 0.180        ← the row this is for
  the first deliberately-still row to wake is dive at 0.315, then combat at 0.320
  -> every value in 0.180 … 0.315 delivers land and leaves all eight still rows floored
```

0.24 sits mid-band, so this is a free judgement across a window and not a nudge — the same shape as
item 1's 9 m/s band. On the driven temple (four routes, 960 frames, real moveset and real BVH):

| framing | frames | before | after |
|---|---|---|---|
| `land` | 23 | +0.050 | **+0.402** |
| `glide` | 175 | +0.109 | **+0.438** |
| `air` | 315 | −0.031 | **+0.183** |
| `idle` (= `move`) | 308 | −0.107 | −0.009 |
| `sneak` | 108 | +0.167 | +0.167 |

**Deliberately not bundled:** `hook_swing` stays broken under this change, and that is on purpose. Its
repair is `leadMax`, which is a *different* defect — a constant calibrated in delivered metres and applied
to authored ones — and folding a structural correction into a feel bump is how a measured result stops
being attributable. It is filed separately.

### What it costs, and the row that pays

**`glide` suffers most.** It is the only row that loses something it did not ask to change: it already
delivered its authored lead, it has the longest uninterrupted residency in the game (175 of 175 frames,
100 % delivery), and so a change there is fully visible where `land`'s 23 frames show only a fraction.
More lead puts Sly further down-frame, which is exactly the tension item 5 above names — and it can be
quoted in item 5's own units:

```
  glide, where the character sits in frame (ndcY, - = down-frame)
      baseline            -0.514
      leadTime 0.20       -0.536
      leadTime 0.24       -0.551      ← this proposal
      leadMode 'full'     -0.648      ← the alternative already on this sheet as item 5
```

So this costs `glide` **28 % of what full compensation would cost it**. That is the trade in one number:
`land`, `air` and `glide` all gain roughly a third of a metre of lead, and `glide` pays for it by sitting
a little lower in frame during the longest shot in the game.

The motion cost, in the same three statistics item 2 uses:

| route | mean \|Δpivot−player\| | p99 step | reversals |
|---|---|---|---|
| desert run | 7.49 → **7.30** mm | 111.3 → 106.4 mm | 17 → 11 |
| glide | 8.55 → **9.96** mm | 105.9 → 105.9 mm | 9 → 9 |
| into masonry | 12.74 → **17.05** mm | 105.1 → 105.0 mm | 5 → 5 |
| run + jumps | 15.88 → **18.83** mm | 114.7 → 118.5 mm | 39 → 35 |

**p99 flat and reversals flat-or-down on every route** — the same signature as item 2, which is the
evidence that this is continuous motion rather than snapping. For contrast, `leadMode: 'full'` costs
+48 % to +116 % on the same routes.

### What to watch

Run and jump, repeatedly, over uneven ground. The question is whether landing now shows you where you are
going instead of where you were — `land` is the row this is for, and until item 1 and item 2 landed it was
not watchable at all. Then glide the courtyard and decide whether Sly sits too low. **If glide is wrong,
the lever is `glide.lead` 1.50 downward, not `leadTime` back down** — the point of choosing `leadTime`
mid-band is that per-row trims stay available on either side of it.

And one thing that will *not* change and should not be read as a failure: the hook swing. It is held by a
different constant and is filed as its own question.

---

## What is *not* on this sheet

Decisions that were settled by measurement and need no review: the patrol route rewrite, the terrace
collision fix, `landBeat` staying at 3.2, the collision census (closed on a clean negative — every
deepest on-route candidate dissolved into intended traversal or centimetre registration), and the
framing-attribution audit.

Open **defects** under investigation, which are not feel questions: `leadMax` 1.75 being calibrated in
delivered metres and applied to authored ones, which is what holds `hook_swing` and `rail_slide` at the
floor no matter what they author (item 6).

Two entries that used to sit here are **closed and are recorded as closed so they are not chased again**:

* *`jump`'s `lead` delivering 26 % where `fall` delivers 92 % under the same pooled row.* Driven per
  frame: the goal lead is 1.25 m throughout a jump and the pivot sits 1.35–1.78 m behind it — **and it
  does that in ground frames too**. Not a jump problem. The spread is a ratio of two small numbers, span
  0.36 m, not a 66-point difference anybody could see.
* *The wall-run blend clock — 24 frames of residency against a 40-frame blend.* True, and about a move no
  drivable route enters: the level has fourteen wall-run sites and the authored traversal visits none of
  them. A level-design observation, not a camera defect.
