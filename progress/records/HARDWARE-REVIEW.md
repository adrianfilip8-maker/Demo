# Feel decisions awaiting a person on hardware

Five changes have shipped this session that are **correct by measurement and unsettled by feel**. Each
was landed because leaving it alone was worse — a coin flip, a dead framing, a silent telegraph — but
where the new number sits is a judgement no headless drive can make.

This sheet exists so that judgement can be made in one sitting rather than rediscovered five times.
Every number here was measured, not estimated, and each item says **what to watch** and **which lever
moves it** — because in three of the five the obvious lever is the wrong one.

None of these is a bug report. If something feels right, the answer is "leave it", and that answer is
worth recording too.

**Items 7 and 8 are a different kind of entry and are marked as such.** Items 1–6 shipped and ask
*is this right?* Items 7 and 8 have **not** shipped; item 8 is not even a proposal, only a question
with both of its answers measured. Item 7: it is a change priced so that it can be decided, because the
measurement that motivates it moves what a player sees on more than one row at once and no headless
drive can arbitrate that. It carries a recommendation rather than a menu, and it names what the
recommendation costs and which row pays.

**Item 6 shipped and re-priced item 7 on its way past**, which is worth noticing as a pattern rather
than an accident: a mechanical repair upstream of a feel knob changes what that knob buys, so a value
chosen before the repair is not the same value after it.

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

> ### ✅ FOURTH CORRECTION (§502) — SHIPPED. The second term exists after all, and the decision below is no longer owed
>
> §501 rejected "was it a controlled departure?" because it made population B soft — **and that
> rejection was wrong.** Population B is a 1.2 m hook release, a walk-off and a staircase (§501.3).
> All three are moves the player meant. Making them soft is the term working.
>
> **Shipped:** a landing is hard when it was fast **and** the descent was not a controlled
> departure. `Controller.onStateChanged` records whether the airborne episode began from a ground
> state (walked off, or jumped) or from a lost traversal beat; `Land.enter` requires both.
> **`landHard` stays 15.0 and `landBeat` stays 3.2** — every landing still speaks, and no threshold
> was re-derived.
>
> The verification is a controlled experiment — same heights, identical arrivals, only the departure
> differs:
>
> ```
>   arrival            13.600   19.600   24.000   28.400   30.800
>   began on a wall     soft     HARD     HARD     HARD     HARD
>   began on the ground soft     soft     soft     soft     soft
> ```
>
> Of 188 driven walk-offs, **158 now land soft however fast they arrive** — including the 29.600 m/s
> one. The median walk-off no longer costs control. The 29 still hard were traced and are correct:
> the walk-off dropped them onto a rail, they rode it, and came off the end.
>
> **What to watch on hardware, and it is now a small question.** Walk off things and jump off things
> at every height the level offers: none of it should cost you control, only sound and squash. Then
> lose a wall cling or come off the end of a rail at height: that should. The one residual to listen
> for is a *deliberate* hook release from high up — it currently reads as hard, because `HookSwing`
> cannot distinguish a chosen release from losing the hook (§502.5). If that feels wrong, the fix is
> a ~40-site tagging job and that is the only thing that buys it.

**~~The decision you were being asked to make~~** (superseded by §502 above, kept because it was
quoted). Not a number, and not a rule over the descent.

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

## 6. `leadMax` was capping the authored lead, not the delivered one — *shipped*

**Commit** `46c584e` · **File** `src/player/CameraRig.js` (`_pivotGoal`) · **The constant did not move.**
1.75 stands; only the stage it is applied at changed.

The floor arm applied `leadMax` *before* the floor, to the authored lead. Above
`leadMax / (followTimeH × f.stiff)` m/s the cap therefore landed **below the follow spring's own
trail**, the floor took over, and the row delivered −`deadzoneH` however much lead it authored.
That threshold is 7.29 m/s for the hook swing and 13.67 for the rail — **both of them ordinary
operating speeds for those moves**.

This was a bug rather than a missing seam, and the file settles that itself: `_pivotGoal`'s own
header names the failure mode — *"`leadMax` bounds the lead and NOTHING bounds the trail, so above
the speed where the clamp binds the net lead falls linearly with speed and changes sign"* — and the
`full` arm, three lines from the defect, says *"`leadMax` moves to NET space here — capping the raw
would re-create the defect at exactly the speeds it bites."* A claimed invariant, violated in the
sibling branch of the same `if`.

Floor first, cap the net. Measured at each row's own speed, **exactly three rows move and sixteen
are identical to the digit**:

| framing | before | after | |
|---|---|---|---|
| `hook_swing` | −0.037 m | **+0.219 m** | authored 1.60, under *"Lead frames the landing"* |
| `rail_slide` | +0.022 m | **+1.772 m** | the highest authored `lead` in the file |
| `run_fast` | +0.729 m | +1.244 m | no state routes to this row |

**None of the nine deliberately-still rows moves at all** — the cap never bound on any of them.

**What to watch.** The hook swing, which `Controller.js` calls the best-feeling move in the game and
whose framing comment is *"Lead frames the landing."* Until this commit that comment described
something that did not happen: the camera sat 3.7 cm **behind** Sly through the fast part of every
swing. Swing a courtyard chain and look at whether the landing is now framed before you get there. If
22 cm reads as too little, the lever is `hook_swing.lead` upward — it is live again and it was not.

**One thing to flag rather than fix.** `rail_slide` now delivers the full 1.75 m cap, which is a large
lead, and nobody has seen it: `railSlide` produces zero frames on any drivable route, so the rail is
authored but unrouted. **If a route is ever given a rail, look at that row first** — it is the one
place this repair made a big change that no measurement here could evaluate.

---

## 7. The velocity lead — *priced, not shipped*

**Proposed** `TUNE.leadTime` **0.17 → 0.22** · **File** `src/player/CameraRig.js` · **Nothing has
changed in source.** The nineteen framings each author a `lead`; on eleven of them that number does
nothing. This item says which, whether that is wrong, and what fixing it would cost.

> **Re-priced after item 6 landed.** This item first recommended 0.24, measured on the rig *before*
> the `leadMax` repair — where the cap was silently limiting what a `leadTime` rise could buy on every
> fast row. With the cap in the right place the same lever is stronger, so the same number now
> over-delivers: 0.24 moves `glide` by 0.49 m where it used to move it by 0.33 m. **0.22 is the value
> that delivers what 0.24 was chosen to deliver.** The band below is unchanged, because the cap never
> bound on any of the rows that set it.

### What reaches the screen

`_pivotGoal` applies the lead to the follow *goal*, and the spring then trails the goal by its own
smoothing time, so the authored number is not the delivered one:

```
  delivered = min( max( leadTime × f.lead − followTimeH × f.stiff , 0 ) × v , leadMax ) − deadzoneH
                          \_ what the row asks for _/  \_ the spring's own trail _/
```

`f.stiff` — documented only as *"multiplier on the spring times (>1 = softer, stiller)"* — silently
subtracts from `f.lead`. Two knobs, one delivered quantity, and until this session nothing measured
the sum.

### The census, at each row's own speed

Driven to steady state on the shipped rig, each row at the speed it actually occurs at
(`runSpeed` 7.2, `sneakSpeed` 1.4, `railMax` 15, `shimmy` 1.05, a dive's 30 % horizontal retention).
**Speed is not a detail**: the delivered lead is a metre quantity, so one row's number cannot be read
at another row's speed — reading the whole table at `runSpeed` is what hid item 6 for three rounds.

```
  row          v     authored  delivered
  idle        7.20     0.35     -0.043     ← and this is ORDINARY RUNNING: `move` falls through here
  walk        2.60     0.90     -0.079        no state routes to this row
  run         7.20     1.40     +0.612        no state routes to this row
  run_fast    7.20     1.85     +1.244        no state routes to this row
  sneak       1.40     0.50     -0.089
  crawl       1.15     0.50     -0.091
  hook_swing  8.00     1.60     +0.219     ← repaired by item 6; was -0.037
  rail_slide 15.00     1.90     +1.772     ← repaired by item 6; was +0.022
  balance     2.40     0.20     -0.081
  spire       0.10     0.15     -0.099
  dive        2.16     0.40     -0.082
  wall_run    4.80     1.30     +0.308
  ledge_hang  1.05     0.20     -0.092
  climb       3.00     0.35     -0.076
  glide       5.60     1.50     +0.207
  land        7.20     0.70     -0.041     ← margin -0.001 s. A knife edge, on the wrong side.
  roll        8.40     1.20     +0.607
  air         7.20     1.20     +0.217
  combat      4.60     0.50     -0.063
```

**Eleven of nineteen deliver no lead.** And of the eight that do, **three have no registered state
routing to them** — `walk`, `run` and `run_fast` are authored rows nothing can reach, because `Move`
falls through to the `idle` framing and the speed ladder was never wired. So **five rows a player can
actually meet deliver any lead at all**: `hook_swing`, `rail_slide`, `wall_run`, `roll`, `air`,
`glide` — six, of which `rail_slide` is on an unrouted move.

### Which of the inert rows are inert *on purpose*

This decides whether anything should be done, and there is evidence for it in the table rather than
only an opinion. **Across all nineteen rows `lead` and `stiff` are anti-correlated (r = −0.35).** An
author compensating for the trail by hand would have raised `lead` *with* `stiff`; instead the stiller
a row is authored, the less lead it asks for. Both knobs were reached for **in the same direction**, so
on these rows the inertness is intent expressed twice — in a quantity nobody was writing for an
audience:

| inert **on purpose** | the tell |
|---|---|
| `spire` | lowest `lead` in the file (0.15) **and** highest `stiff` (1.90). *"back and up to show the drop, and go very still."* |
| `balance` | second-lowest `lead` (0.20), second-highest `stiff` (1.60), same comment |
| `ledge_hang` | `lead` 0.20 — *"the point is what's* above*"*; the shot is vertical |
| `sneak`, `crawl` | *"close, tight, low. Intimate and tense"* at 1.4 and 1.15 m/s. A camera that runs ahead of a creep is wrong |
| `climb` | `vtrack: 1` — the move is vertical; horizontal lead is not its channel |
| `dive` | `DiveAttack.enter` cuts horizontal velocity to 30 %; the channel is the drop, and `stiff` 0.55 is the snap |
| `combat` | the orbit's channel is `side: 0.30`, which opens toward the circle. Running ahead of a man circling a mark is the wrong shot |
| `idle` | correct **as authored** — it is the standing-still framing |

**Nine rows want no lead and get none, which is the system working.** After item 6 that leaves an
actionable set of exactly one, plus one that is not a lead question at all:

| | |
|---|---|
| **`land`** | margin **−0.001 s**. Not a decision anybody made — a knife edge on the wrong side. Delivers −4.1 cm at running speed. **This is the row this item is for.** |
| `idle`-as-`move` | not a lead defect. Ordinary running is framed by the *standing-still* row because the walk/run/run_fast ladder is unrouted. Belongs to whoever owns that ladder. |

`air` is **not** in the set — it delivers 21.7 cm, thin against an authored 1.20 but not inert.

### What each lever does, all nineteen rows, metres on screen

Measured one lever at a time on the repaired rig. A per-row `f.lead` edit is measured too: only the
product `leadTime × f.lead` is ever read, so raising one row's `lead` is exactly that row run at the
equivalent `leadTime`.

```
  row          v    baseline  lead .20  lead .22  lead .24  fTimeH .10  dead .05  leadMax 3.0   'full'
  idle        7.20    -0.043    -0.043    -0.043    -0.043      -0.041    +0.007    -0.043     +0.386
  walk *      2.60    -0.079    -0.027    +0.020    +0.066      +0.059    -0.029    -0.079     +0.319
  run *       7.20    +0.612    +0.914    +1.116    +1.317      +1.011    +0.662    +0.612     +1.672
  run_fast *  7.20    +1.244    +1.643    +1.708    +1.708      +1.612    +1.294    +1.244     +1.708
  sneak       1.40    -0.089    -0.089    -0.089    -0.089      -0.089    -0.039    -0.089     +0.030
  crawl       1.15    -0.091    -0.091    -0.091    -0.091      -0.091    -0.041    -0.091     +0.007
  hook_swing  8.00    +0.219    +0.603    +0.859    +1.115      +0.940    +0.269    +0.219     +1.713
  rail_slide 15.00    +1.772    +1.772    +1.772    +1.772      +1.775    +1.822    +2.947     +1.772
  balance     2.40    -0.081    -0.081    -0.081    -0.081      -0.081    -0.031    -0.081     +0.000
  spire       0.10    -0.099    -0.099    -0.099    -0.099      -0.099    -0.049    -0.099     -0.097
  dive        2.16    -0.082    -0.082    -0.082    -0.065      -0.054    -0.032    -0.082     +0.065
  wall_run    4.80    +0.308    +0.496    +0.620    +0.745      +0.569    +0.358    +0.308     +1.000
  ledge_hang  1.05    -0.092    -0.092    -0.092    -0.092      -0.091    -0.042    -0.092     -0.056
  climb       3.00    -0.076    -0.076    -0.076    -0.076      -0.075    -0.026    -0.076     +0.102
  glide       5.60    +0.207    +0.459    +0.627    +0.795      +0.646    +0.257    +0.207     +1.372
  land        7.20    -0.041    +0.103    +0.204    +0.304      +0.277    +0.009    -0.041     +0.816
  roll        8.40    +0.607    +0.909    +1.111    +1.312      +1.012    +0.657    +0.607     +1.682
  air         7.20    +0.217    +0.476    +0.649    +0.822      +0.672    +0.267    +0.217     +1.426
  combat      4.60    -0.063    -0.063    -0.063    -0.063      -0.062    -0.013    -0.063     +0.328

  * no registered state routes to this row — it cannot appear on screen as things stand
```

Read the columns for what each one *cannot* do:

* **`leadTime`** never moves a single one of the nine deliberately-still rows at any value tried.
* **`followTimeH`** reaches everything `leadTime` reaches, and is the horizontal smoothing time of the
  *entire* follow — it changes how the camera tracks on all nineteen rows whether or not the
  steady-state lead moves. Most effective, most global.
* **`deadzoneH`** is a uniform shift that wakes nothing, and it spends the one thing it exists for:
  during a fidget in place the pivot travels **0.219 m at 0.10, 1.153 m at 0.05, 2.456 m at 0** — 5×
  and 11× the motion in the shot the deadzone exists to hold still.
* **`leadMax`** now moves only `rail_slide` (and `run_fast`, unreachable). Item 6 put it back in net
  space; raising it further is a question about the bound, not about the floor.
* **`f.lead` per row** repairs `land` (0.70 → 1.03 delivers 0.30 m) without touching anything else, and
  is the alternative to the global bump if only `land` should change.

### The recommendation

**Raise `TUNE.leadTime` from 0.17 to 0.22. One constant. Nothing else.**

Not the lever that moves the most rows — `followTimeH` is. It is the lever that repairs the one row
still carrying an authored intention that never arrives, while being provably unable to touch the nine
rows built to be still, and whose headroom is **derived rather than chosen**:

```
  land wakes at leadTime 0.180        ← the row this is for
  the first deliberately-still row to wake is dive at 0.315, then combat at 0.320
  -> every value in 0.180 … 0.315 delivers `land` and leaves all nine still rows floored
```

0.22 sits mid-band. **The band is the measurement; the point inside it is not** — the same shape as
item 1's 9 m/s window, and for the same reason: nothing headless can say whether 20 cm of lead at 5.4 m
of boom *reads*. On the driven temple (four routes, 960 frames, real moveset and real BVH):

| framing | frames | before | after |
|---|---|---|---|
| `land` | 23 | +0.050 | **+0.408** |
| `glide` | 175 | +0.109 | **+0.454** |
| `air` | 315 | −0.031 | **+0.138** |
| `idle` (= `move`) | 308 | −0.107 | −0.038 |
| `sneak` | 108 | +0.168 | +0.168 — unmoved |

### What it costs, and the row that pays

**`glide` suffers most.** It is the only row that loses something it did not ask to change: it already
delivered its authored lead, and it has the longest uninterrupted residency in the game — 175 of 175
frames at 100 % delivery — so a change there is fully visible where `land`'s 23 frames show a fraction.
More lead puts Sly further down-frame, which is exactly the tension item 5 names, and it can be quoted
in item 5's own units:

```
  glide, where the character sits in frame (ndcY, - = down-frame)
      baseline            -0.514
      leadTime 0.20       -0.536
      leadTime 0.22       -0.552      ← this proposal
      leadTime 0.24       -0.570
      leadMode 'full'     -0.648      ← the alternative already on this sheet as item 5
```

So this costs `glide` **28 % of what full compensation would cost it**. That is the trade in one
number: `land` gains 36 cm of lead, `glide` and `air` gain about the same, and `glide` pays by sitting
a little lower in frame during the longest shot in the game.

The motion cost, in the same three statistics item 2 uses (route `run + jumps`, the busiest):

| | mean \|Δpivot−player\| | p99 step | reversals |
|---|---|---|---|
| baseline | 15.88 mm | 114.7 mm | 39 |
| **leadTime 0.22** | **18.71 mm** | 123.2 mm | 35 |
| `leadMode 'full'` | 25.39 mm | 113.9 mm | 35 |

Reversals go **down**, which is the evidence this is continuous motion rather than snapping. For
contrast, `leadMode: 'full'` costs +60 % on the same route.

### What to watch

Run and jump repeatedly over uneven ground. The question is whether landing now shows you where you
are going instead of where you were — `land` is the row this is for, and until items 1 and 2 landed it
was not watchable at all. Then glide the courtyard and decide whether Sly sits too low.

**If glide is wrong, the lever is `glide.lead` 1.50 downward, not `leadTime` back down.** The point of
choosing a value mid-band is that per-row trims stay available on either side of it.

---

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

## 8. How much should the camera open up at a sprint? — *two authored answers, 5.9× apart*

**Nothing has shipped and nothing is proposed.** This is a question that has never been posed, because
its two answers live in different mechanisms and no instrument looked at both.

`FRAMES` carries a three-rung speed ladder — `walk`/`run`/`run_fast`, `dist` 0.20/0.90/1.60, `fov`
0.6/2.4/4.6 — and **no state routes to any of it.** The camera instead opens up continuously, through
`distSpeedGain` 0.30 m and `fovSpeedGain` 6.0°. Both are authored answers to one question, and they
disagree by a factor of six:

| at full run (7.2 m/s) | boom added | lens added | boom length | apparent size |
|---|---|---|---|---|
| **as shipped** (continuous gains) | +0.270 m | +5.40° | 5.670 m | — |
| **as the ladder authors** (adds to the above) | +1.870 m | +10.00° | 7.270 m | ≈ −60 % width |

The player's own zoom range is 2.5–9.0 m from a base of 5.4, so the ladder's answer parks the camera at
**81 % of the furthest the player can choose**, unasked.

**Why this is not simply "wire the ladder".** The ladder is already live on the animation side —
`Moveset.Move` picks the `walk`/`run`/`run_fast` *clip* at 3.4 and 6.3 m/s — but those thresholds
sequence a crossfade **during acceleration**, which is not the same as three speeds a player sits at.
Measured over `move` frames on three driven routes, `run_fast` owns **70–88 %** and the two lower rungs
are transients worth 5–15 % between them, with the rung changing **2.1–4.6 times a second** against a
camera blend of 0.26–0.35 s. Wired as framings, the camera would never settle on a rung. §461 has the
full report.

So the live question is not routing. It is **size**: the shipped speed effect is a 5 cm-per-metre-per-
second dolly that a player may not notice at all, and the authored one is a 1.6 m pull-back that
changes the shot. Nobody has looked at both and said which is right.

**What to watch.** Stand, then walk, then run flat-out across the courtyard, and ask whether the camera
*acknowledges* the speed. If a sprint feels identical to a stand, the shipped 0.30 is too small and the
ladder's 1.60 is the direction. If it already reads, leave it — and the three ladder rows should then be
marked as superseded rather than left looking reachable.

**The lever, and it is not the ladder.** `TUNE.distSpeedGain` and `TUNE.fovSpeedGain` are continuous,
reachable, and free of the three problems wiring the rows would bring. The ladder's numbers are useful
as the **upper endpoint** of a range, not as framings to route to.

**Decide this beside item 7.** They move the same row. Item 7's largest beneficiary is ordinary running
— `move`, framed as `idle`, delivering −0.043 m of lead — and the ladder would hand that same row
`run`'s +0.612 m or `run_fast`'s +1.244 m outright. Whichever is taken first makes the other smaller.

---

## What is *not* on this sheet

Decisions that were settled by measurement and need no review: the patrol route rewrite, the terrace
collision fix, `landBeat` staying at 3.2, the collision census (closed on a clean negative — every
deepest on-route candidate dissolved into intended traversal or centimetre registration), and the
framing-attribution audit.

Three entries that used to sit here are **closed and are recorded as closed so they are not chased
again**:

* *`leadMax` 1.75 calibrated in delivered metres and applied to authored ones.* **Repaired** — it is now
  item 6 above. It moved from an open defect to a shipped change with a feel consequence, which is why it
  has an item rather than a line here.

* *`jump`'s `lead` delivering 26 % where `fall` delivers 92 % under the same pooled row.* Driven per
  frame: the goal lead is 1.25 m throughout a jump and the pivot sits 1.35–1.78 m behind it — **and it
  does that in ground frames too**. Not a jump problem. The spread is a ratio of two small numbers, span
  0.36 m, not a 66-point difference anybody could see.
* *The wall-run blend clock — 24 frames of residency against a 40-frame blend.* True, and about a move no
  drivable route enters: the level has fourteen wall-run sites and the authored traversal visits none of
  them. A level-design observation, not a camera defect.
