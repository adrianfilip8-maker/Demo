# Feel decisions awaiting a person on hardware

Five changes have shipped this session that are **correct by measurement and unsettled by feel**. Each
was landed because leaving it alone was worse — a coin flip, a dead framing, a silent telegraph — but
where the new number sits is a judgement no headless drive can make.

This sheet exists so that judgement can be made in one sitting rather than rediscovered five times.
Every number here was measured, not estimated, and each item says **what to watch** and **which lever
moves it** — because in three of the five the obvious lever is the wrong one.

None of these is a bug report. If something feels right, the answer is "leave it", and that answer is
worth recording too.

> ## ✅ FIRST HARDWARE VERDICTS (the user, on hardware)
> Four items are answered by the person this sheet was written for:
> **item 1** — landings are right as shipped, and there is to be **no fall damage, ever** (the build
> already complies: the only `damage` emitters are hazards and guard swings; a hard landing costs a
> control beat and a shake, never health — to be pinned as an invariant);
> **item 2** — the boom chain reads as responsive: **leave it**;
> **item 3** — a short slam and a tall slam **should look the same**: the merge is wanted, the
> split-by-drop-height contingency retired;
> **item 8** — the camera should **not** open up much at a sprint: the shipped continuous gains
> stand, the ladder's 1.6 m pull-back rejected, §463's deletion ratified.
>
> The same session reported three defects, now in work: attacks not firing on real hardware, no way
> to release a hook ring, and rig faults (arms appearing switched, head pinned upward).

**Items 7, 8 and 9 are a different kind of entry and are marked as such.** Items 1–6 shipped and ask
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

> ### ✅ FIFTH CORRECTION (§511) — the route's own alternative no longer lands hard
>
> §485.2 found §8.1 step 2's documented alternative — pole-climb the obelisk, spire-land the
> pyramidion, drop 13 m to the kiosk — landing at **31.0 m/s HARD**. Traced at the transition level,
> that was two bugs in the §502 term, not a feel question: a jump PRESSED at the pole top was filed
> as a lost grip (`poleClimb` is in `BEAT_LOST`, and the `jump` state is only enterable through
> input), and `spireLand`'s exits fired neither classification branch, so the flag kept its history.
> Both fixed (§511.2, R7-pinned): the pyramidion drop now lands soft, and a wallCling loss from 17 m
> still lands 28.4 HARD. **The walk-south-off-stage-2 15.600 remains**: that is the ~0.15 m collider
> notch (§500.5), filed for the world lane, not a threshold or classification input.

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

> ### ✅ USER VERDICT — responsive. Leave it. Item closed.

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

> ### ✅ USER VERDICT — they SHOULD look the same. The merge is wanted; the split contingency is retired. Item closed.

> ### ✅ PHOTOGRAPHED (§467, run 4) — and the pair's answer is that one identity is not on screen
>
> The side-by-side this item asked for exists: `shots/camlane4-s2-hop-impact0/4.png` beside
> `camlane4-s3-high-impact0/4.png` — the first frames of a REAL Cane Slam ever taken. (Runs 2 and 3's
> "slams" were plain falls: the apparatus could not press attack, §468.) The hop slam is a composed
> impact shot — Sly centred, cane raised, the slam FX ringing him, `ndcY` −0.29 at boom 5.13. The
> 16 m slam's impact frame **contains no subject at all** — `ndcY` −2.75 at boom 1.51, Sly nearly
> three screen-heights below the bottom edge, with the slam's own red wash proving the move fired.
>
> So "have the two identities merged" cannot be judged by eye at height: item 12 now carries the
> mechanism (§467 — leash + occlusion recovery + fallPitch unwind, no single term sufficient) and
> the priced levers. The delivery percentages above stand as statements about the boom *channel* —
> §467 is the proof that a channel delivering 98 % can frame empty air.

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

> **First data (thief1, T2).** The colossi tightrope's E-press entry rides as `railSlide` at
> 9.7 m/s, and the telemetry logged the delivered lead per frame: **1.730 m settled** over 84
> frames — the closed form at that speed plus the documented discrete-spring correction predicts
> 1.728, agreement to 2 mm — with the settled frames composed (`t2t1-late`: ndcY −0.37 at boom
> 4.8). So the repair's number is confirmed live; what nobody has seen is the shot at
> `railMax` 15, and the walk-on balance beat is a different row (`railWalk` → `balance`). Both
> get their look on the §497 re-shoot.
>
> **✅ ANSWERED (thief3, §473).** On §497's re-hung rope the fling rides at own speed and the
> settled lead is **1.420 m measured vs 1.406 predicted at 7.42 m/s** — the model's second live
> confirmation at a second speed — with the ride composed throughout (`thief3-t2t3-late`, boom
> 6.18). `railMax` 15 is unvisited because no route reaches it: a fact about the level, not the
> instrument. And the balance beat exists on camera at last: `railWalk` both directions, boom
> 7.0–7.6 mid-span, `thief3-t2t2-balance`. This flag is watched; nothing about it is open.

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

> **The section below is the item's original tail, measured at `leadTime` 0.24 on the rig *before*
> item 6's repair.** Kept because it carries the four-route motion table, which the re-priced tail
> above does not repeat — p99 flat and reversals flat-or-down held on all four routes, not just the
> busiest. Its `'full'` contrasts (+48 % to +116 %) are the pre-repair rig. The recommendation and
> every number to act on are above.

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

> **Since §463 the ladder rows are deleted, not merely unrouted.** Their numbers survive verbatim in
> a comment at the deletion site, and the resolver map was proved identical before/after — so the
> question below is unchanged: it was never routing, it is **size**. The closing line's "marked as
> superseded" has happened; if sprint framing is ever wanted, the way back is one row routed from
> `move`, re-derived — not the ladder (§463.1).

`FRAMES` carried a three-rung speed ladder — `walk`/`run`/`run_fast`, `dist` 0.20/0.90/1.60, `fov`
0.6/2.4/4.6 — and **no state routed to any of it.** The camera instead opens up continuously, through
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

> ### ✅ USER VERDICT — do NOT open up much at a sprint. Shipped gains stand; the ladder's answer is rejected; item 7 decouples and stands alone. Item closed.

---

## 9. The wall-run framing arrives at 76–91 % — how snappy should it be? — *priced, not shipped*

**Nothing has changed.** `wall_run.tau` stands at 0.22 and the bank's clock at 0.22.

This item exists because the number that made it look broken was wrong. The standing figure was *24
frames of residency against a 40-frame blend, capping delivery at 84 %*. **That residency came from a
test driver that taps jump every 9 frames during the wall run** — it was built to chain wall-jumps, and
used as a stopwatch it ends the run it is timing. Driven again with a driver that just holds forward,
across eight sites with a flat run-up: **1, 2, 15, 15, 18, 20, 29, 85 frames — median 18 (0.30 s).**

So the real delivery at the shipped clock is **76–91 %**, and 100 % on the two longest takes. Not
broken. The question is whether 76 % of a −1.0° pitch and 80 % of a 0.35 m shoulder offset, arriving
over 0.4 s, is *snappy enough for a move that lasts 0.3 s.*

| `wall_run.tau` | 3τ | dist | side | pitch | height | mean pivot motion | p99 step | reversals |
|---|---|---|---|---|---|---|---|---|
| **0.22** (ships) | 40 f | 91 % | 80 % | 76 % | 86 % | 22.60 mm | 74.5 mm | 2 |
| 0.16 | 29 f | 95 % | 88 % | 86 % | 91 % | 24.14 mm | 74.3 mm | 2 |
| **0.12** | 22 f | 97 % | 94 % | 93 % | 95 % | 25.48 mm | 74.2 mm | 2 |
| 0.08 | 14 f | 99 % | 98 % | 98 % | 99 % | 27.04 mm | 74.1 mm | 2 |

**The cost is the same shape as item 2** — +13 % mean pivot motion at 0.12 with the **p99 single-frame
step unchanged and reversals unchanged**, which is the evidence it adds continuous movement rather than
a snap. **And it costs nothing on any other row**: `tau` is read per-framing, so this is a one-row
constant, unlike the boom chain which was shared.

**The catch, and it is the reason this is not simply "set it to 0.12".** The bank — the horizon roll
into the wall, which is the whole visual identity of the move — **does not read `tau` at all**:

```
  this._roll = ease(this._roll, -this._wallSide * TUNE.wallRoll, 0.22, dt);   ← a literal
```

Every value in the table above leaves the bank exactly where it is. It has its own clock, and its own
prices:

| bank clock | roll delivered (of `wallRoll` 0.096) | mean \|Δroll\| |
|---|---|---|
| **0.22** (ships) | 78 % | 0.893 mrad |
| 0.14 | 90 % | 1.070 mrad |
| 0.09 | 97 % | 1.179 mrad |

**What to watch.** Run at a wall from a flat approach and let the run play out without tapping jump. Two
separate questions, and they need separating by eye because no headless measure distinguishes them:
does the camera *arrive* in time (that is `tau`), and does the horizon *tilt* in time (that is the bank's
literal 0.22). If the shot feels late but level, it is `tau`. If it feels placed but flat, it is the bank.

**Two things that will limit what you see, both measured and neither fixable by a clock.**

* **The bank fires on four of eight sites.** `_wallSide` probes ±1.3 m along the camera's right; a
  head-on run has no side to find, so there is nothing to roll into. Half the wall runs in the temple
  are bankless by geometry.
* **The framing is shared with `wallCling`.** On three of eight takes the `wall_run` framing is
  substantially a cling — 64 %, 41 %, and one at **1 % wall run / 99 % cling**. Anything you judge about
  "the wall-run framing" on those sites is partly a judgement about hanging on a wall.

**Recommendation if you want one number to try: `tau` 0.12 and the bank clock 0.14 together**, because
changing only the first makes the shot arrive faster while the horizon stays behind, which is likely to
read worse than either alone. That pairing costs +13 % pivot motion and +20 % roll rate, with p99 and
reversals flat.

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

---

## 10. Telegraph on a hook chain — an unmeasured switch, default OFF

**Commit** this round · **File** `src/player/Controller.js` (`TUNE.telegraphNextHold`, `_telegraph`)

§449 measured the telegraph's lead across the authored four-ring chain at **34 / 3 / 7 / 7 / 5 / 1
frames** — the 34 is the first grab from standing, and every one after is under a fifth of a second.
The cause is structural: while `sm.group === 'attach'` the emit is `null` by design, so the next ring
cannot be announced until the current one is released, and the warning window collapses to the flight
time between rings.

**The fix is not lifting that gate.** Lifting it naively marks the hold you are already on (§441.5).
The switch announces the **next** hold, excluding the held one.

**What is measured.** On a 420-frame approach attached the whole time — the worst case for this
feature:

| | telegraph emits |
|---|---|
| gate as shipped | 0 |
| **switch ON** | **7** |
| naive lift, for comparison | 104 |

**93 % less clutter than lifting the gate**, and seven marks across seven seconds of continuous
attachment.

> ### ✅ MEASURED (§513) — the provisional table is replaced, and the chain now closes on a committed apparatus
>
> The two paragraphs below this box are superseded and kept because they were quoted. `telegraph.test.mjs`
> **T11** drives the full four-ring chain in one run (T10's recipe: pump along the velocity, bail on the
> correct face, steer the flight), on both gate settings, and pairs every `telegraph` with its `hookGrab`
> via the now-cloned payload. The leads, in frames from the FIRST naming of the ring in that approach:
>
> |  | ring 1 | ring 2 | ring 3 | ring 4 |
> |---|---|---|---|---|
> | gate as shipped (switch OFF) | — | **43** (0.72 s) | **21** (0.35 s) | **24** (0.40 s) |
> | **switch ON** | — | **196** (3.27 s) | **31** (0.52 s) | **45** (0.75 s) |
>
> Ring 1's lead is omitted: the driver holds interact from the start, so its 4-frame figure is an
> apparatus artifact — §441's E-grab arm owns that number (30 f). §449's provisional 34/3/7/7/5/1 is
> retired: its harness was never committed, and its repeated final ring matches the §505.2 payload
> aliasing. **The shipped gate's mid-chain warning is 0.35–0.72 s on this apparatus, not 0.05–0.12 s** —
> larger than §449 reported, because the leads scale with flight length and this drive bails fast.
> The switch ON turns ring 2's warning into *the remaining hang plus the flight* (3.27 s), and adds
> ~0.15–0.35 s to the later rings.
>
> **And the "Also partial" paragraph below is stale since §507**: the exclusion is plumbed into
> `afford` itself, so the switch DOES name the next ring of the same kind — T11's gate-ON run emits
> hook marks naming the actual next chain ring. What remains open is *preference*: a nearer
> unauthored hook can still outrank the authored ring (§506.3), which is the world lane's `bias`
> decision, and 10–19 of 61 release phases still grab one mid-flight.

**~~What is NOT measured~~** (superseded above). What the switch delivers *on the chain* —
the 3-to-7-frame leads it exists to widen. §449's harness was never committed and four drivers here
reached one grab against their six, so nobody can currently re-derive those leads (§505.1). The
number on this page is provisional until a committed driver produces it.

**~~Also partial~~** (superseded above — §507 plumbed the exclusion into `afford`). `afford(kind)`
returns one hold per kind, so excluding the held ring skips hooks
entirely rather than offering the *next ring*; what you would see announced is the best rail, pole or
ledge in reach. Announcing the next ring needs a ranked `afford`, which is a `Targets.js` change.

**What to watch.** Flip it on, swing the chain, and answer one question: does a mark appearing while
you are still on a ring read as help or as noise? If it reads as help, the `Targets.js` ranked-list
work is worth doing so it can name the next *ring*. If it reads as noise, the gate was right and this
switch should be deleted rather than tuned.

---

## 11. The hook chain's difficulty — a 0.25 s window and two untaught inputs

**No commit — nothing is broken.** §511.1 established leg 5 (and T11 the whole chain) completes from
the authored entry, and what remains is a difficulty judgement the numbers now frame precisely:

- **The release window is 15 frames (0.25 s), recurring every ~2.3 s swing period.** Bail inside it
  at 6.8–11.3 m/s with the swing's own ~60° bearing error, and air steering closes the rest.
- **Two inputs the game never teaches**: pumping is only effective ALONG the swing (holding toward
  the target nets zero — 2.03 vs 13.43 m/s, §509.4), and the flight must be steered toward the next
  ring (without it, 0 of 61 release phases connect, §511.1).
- Mid-chain, the flight's arrival speed carries into the next swing, so only ring 1 needs the long
  wind-up — T11's bails after it are 12 and 24 frames.

**What to watch.** Swing the chain cold, without reading anything. If you find the along-velocity
pump and the air steer within a few attempts, the window is a skill beat and the level stands. If
you bounce off it, the cheap levers in order: a wider `hookAuto` on rings only (a level-side bias,
§506.3), ring spacing (world lane's), or a HUD teach for the pump. `hookDamp`/`hookPump` are joint
under every swing in the game and are not the lever (§509.4).

---

## 12. The slam-from-height impact frame has no subject in it — *measured, not shipped*

> ### ✅ USER VERDICT — "Sly should always remain in frame." Shipped as an invariant. Item settled.
>
> The ruling overrides the decline below — which was a cost-based call, and whose measurements
> stay the right map: the three bounds still compose exactly as priced, none of them was
> retuned, and the levers below remain the levers if the SHOT (rather than the frame) is ever
> re-opened. What shipped instead is **rule 6 of `CameraRig.js` (§475)**: a subject-containment
> clamp as the final stage of `_write` — engage at `clampMargin` 0.88, pitch first, translate
> only where rotation may not go, exactly zero (bit-identical pose) while the subject is inside
> the margin. Measured on this item's own frames: the 16 m slam impact **−2.56 → −0.86**; the
> ring arrivals **41/41 uncontained (10 behind the camera plane) → 0**; the touchdown release
> **2.47°/frame worst** against the 10°/frame fallPitch cut it was predicted to recreate — the
> clamp absorbs that cut instead. The colonnade jumps — the cost every declined lever carried —
> engage **zero frames** and replay bit-identical (ordinary jumps peak 2.6× inside the margin);
> the full spawn2eye drive runs **5,870 frames, 0 out, clamp engaged 1,210 f**. Building the
> arms also caught two new instances of this item's boom family: the **dune ascent** (W held up
> a §515-walkable dune face crushes the boom into the sand and walked Sly off the top of frame
> — now caught at ~35°) and the **crushed-swing lateral orbit** (|ndcX| to 3.05 at boom 0.55 —
> why the clamp's stage 3 exists).
>
> **What to watch on hardware now, one question.** The failure frames are gone; what remains is
> whether the CATCH reads right: slam from the staircase top and watch the third of a second at
> impact — Sly now rides the bottom margin of frame while the camera holds him (with the §475.4
> shake finally live over it, see item 17). If that edge-hold reads as *impact*, done. If it
> reads as *the camera straining*, the levers for the SHOT are unchanged below (the leash in
> frame units first), and the clamp simply makes them a composition question instead of a
> lost-subject question.

> ### ✅ PHOTOGRAPHED (thief4, §476) — the ring arrival's browser pair, beside the slam's
>
> f54ea3f's camlane5 pair covered the slam half; the ring half now has its own: hold
> `thief2-t3t2-ring` (ndcY −41.59 at ndcZ −0.99 — behind the camera plane, the frame all sky
> and dunes) beside `thief4-t3t2-ring` (**−0.88** at z +0.90 — Sly from overhead, riding the
> bottom margin on the ring platform), and the settled shot **−2.11 → −0.88**. Whole takes,
> not snaps: T3's clean take goes 41 uncontained frames (4 behind the plane) → **0**, and the
> booms are unchanged (0.55 / 1.401) — the clamp bought the frame; the boom crush at arrival
> is still this item's open shot question, with the levers below.

**~~No commit — nothing has changed in source~~** (true until the verdict box above; everything
below describes the pre-ruling rig, which `clampMargin: 0` still runs — kept because three lanes
quote it). §467 is the mechanism; `tools/slamtrace.mjs` and
`shots/slamtrace*.json` are the apparatus; `camlane4-s2/s3` are the frames to hold beside this.
Three bounds, each authored and each defensible alone, compose at the impact of any fast descent:

1. **The occlusion recovery is a clock and a descent outruns it.** A boom cut during the fall
   recovers at `recoverDelay` 0.22 + τ 0.62 (capped 6 m/s) — tuned against colonnade flicker at
   run speed. On the 16 m staging the world re-permits the FULL boom for the last ~0.27 s of the
   fall and the camera arrives at 1.57 m of a permitted 5.95.
2. **The leash bounds the pivot in metres and the frame is angular.** `followLeashV` 2.6 is one
   half-frame-height at the DEFAULT boom (5.4 × tan(fov/2) = 2.63) and is enforced at every boom.
   Every descent past ~0.5 s rides the leash, so the pivot arrives a constant 2.6 m above the
   goal — three half-frames at a cut boom, and out of frame even at the dive's authored 3.2 m.
3. **`fallPitch` unwinds in one frame.** The +10° down-tip that kept the landing on screen reads
   the instantaneous `vy` and vanishes on the touchdown frame (20.2° → 10.2° measured) — a cut,
   timed at the impact.

Where it bites, at each row's own numbers (`ndcY`, frame bottom −1.0):

```
  hop slam (run 4, S2)      -0.29  composed        8 m fall    -0.85  in frame, barely
  8 m slam                  -1.47  subject gone    16 m fall   -3.33  three screen-heights gone
  16 m slam (run 4, S3)     -2.75  subject gone    16 m fall, open sky (no occluder)  -0.90  gone
```

The slam is WORSE than a plain fall at the same height — its own authored `dist` −2.2 halves the
frame its landing must fit into — and the open-sky column says the finding does not need the
staging's ledge. §500's walk-off population (median 17.2 m/s, max 29.6) says these heights are
ordinary play on this level. The shipped rig re-frames the subject ~0.25–0.35 s after touchdown.

### The levers, priced

| lever | what it buys, measured | what it costs |
|---|---|---|
| **leash in frame units** — `min(2.6, 0.48 × boom)` | −3.33→−1.11 · −2.75→−1.09 · −1.47→−1.04, whole-sequence (it also un-cuts the boom earlier: 1.57→2.20 at impact). Provably nothing at boom ≥ 5.42 — ordinary falls, glides, jumps at full boom are untouched to the digit | in frame **nowhere** on its own; and while the boom is occlusion-cut below 3.46 m a jump's 1.66 m apex error can newly clip — colonnade jumps pay, unmeasured |
| **recovery clock** during vertical flight | the last ~0.27 s of permitted boom (1.57 vs 5.95) | reopens the anti-flicker design `recoverSpeed`'s block measured; not priced as a change here |
| **fallPitch smoothing** at touchdown | removes a one-frame −10° view cut at every fast landing | smallest single effect (−3.34→−2.55 alone); adds a smoothing state to the one term that is deliberately instantaneous |
| **accept and watch** | nothing; the empty frame lasts ~1/3 s | the loudest move in the game spends its impact frame on empty stone |

**Ablation says the composition is the defect**: with any ONE term removed the subject is still
out of frame (best single: −0.90); with all three removed it is composed (−0.28). That is why
nothing shipped — there is no attributable one-constant fix, and a three-design retune is not a
measurement, it is a taste. The same call as item 7's, made on the same grounds.

**What to watch, and it is one question.** Hold `camlane4-s2-hop-impact0` beside
`camlane4-s3-high-impact0`, then slam from the staircase top on hardware and watch the third of
a second after impact. If the subject-free beat reads as *impact* — a hit so hard the camera is
still catching up — leave all of it alone and record that. If it reads as a *lost camera*, the
first lever is the leash re-derived in frame units: it is the one constant whose shipped value
already encodes the frame-height claim (2.6 = one half-frame at 5.4 m), it buys the largest
measured improvement everywhere, and its cost is bounded and nameable — measure the
occluded-jump clip before shipping it, and expect to want the fallPitch smoothing with it, since
−1.09 alone still leaves the subject just off the bottom edge.

> ### ✅ PHOTOGRAPHED AGAIN (thief1, §471) — on climbs and arrivals this time, and the two mechanisms split
>
> The T1/T3 thief-line run put this item's mechanisms on committed frames twice more. **The
> climb half turned out not to be this item at all**: the obelisk-rope climb at the 0.55
> hard-min (`thief1-t1t*`, subject above frame top for the whole beat) was the occlusion cast
> dying against the CLIMBED POLE'S OWN PROXY — a §471 defect with a one-gate fix, shipped; see
> item 15. **The arrival half is exactly this item**: `t3t1/t3t2-ring` land on the y 9.0 ring
> with the subject BEHIND THE CAMERA PLANE (ndcY −35.7/−41.6 at boom 0.55, the frame all sky
> and dunes), and the settled shot 40 frames later still holds Sly a full screen below the
> bottom edge (−1.90/−2.11 at boom 1.4–1.5). Mechanism confirmed at the casts
> (`tools/climbtrace.mjs`): the ring platform's own `ledge` proxy cuts the boom at want 6.2
> while the leash holds the pivot overhead — the same three-bound composition as the slams,
> now evidenced on ordinary traversal arrivals. The §471 gate provably does not move these
> frames (`tests/climbcam.test.mjs` asserts the arrival crush present in both arms), so the
> levers priced above are still the whole decision, with four more frames to judge them by.

---

## 13. The telegraph trades against the boom wherever tagged content hangs near a route — *structural, will recur*

**No commit — nothing has changed in source.** §496.2 is the measurement; `camdrive` D6's A/B (one
collider toggled, everything else fixed) is the apparatus. This item exists because the interaction
it measures is not a one-off: the user asked for **more interactable spots**, the world lane is
adding them, and every one that is telegraph-visible near a drivable corridor re-runs this trade.

**The mechanism, measured on the colossi tightrope.** The rope (`rail`, y 5.2–5.55, directly over
the corridor all eight D6 routes drive) is invisible to both boom casts by code
(`CAM_SWEEP_OPTS.ignoreTags`, `SOLID_TAGS`) and player-inert — every D6 row's visits and frames are
identical with it on or off. The one rig consumer that DOES read it is the route telegraph
(`ROUTE_TAGS`, sensing radius `routeRange` 9.5, boom lift ≤ `routeDist` 0.55). With the rope on,
`wall_run`'s boom went **asked 1.87 → 2.06 m, delivered 0.34 → 0.00 m** — the ask grew and the
delivery vanished — on the framing with the shortest residency in the drive set (~46-frame visits).
Other rows shifted a few points each (idle boom 60→62 %, air 61→68 %, sneak fov 61→41 %).

**Why this will get worse, not better.** The boom chain delivers last among the channels and pays
the chain-depth cost D5/D6 document; the telegraph's lift is one more term competing above it. A
framing with 100+ frames of residency absorbs the competition; a 46-frame visit never gets the
channel back before it exits. So the erosion lands precisely on the short-residency framings —
`wall_run`, `land` — the two this sheet has spent three items buying delivery for. Content authored
for a *crossing* beat (the rope) silently spends the camera budget of the *approach* beat under it.

**The decision a person should make on hardware.** Wall-run under the colossi rope and watch
whether the camera still pulls back as the wall-run starts. Three positions, in order of cost:

1. **Accept and record** — the rope's trade landed on a channel that delivered 18 % before and 0 %
   after, i.e. a framing that never visibly arrived (its substantive pin, boom < 0.25, passes both
   sides). If 18 % of 0.34 m was never readable, nothing a player sees changed, and the rule is
   simply: *authors of telegraph-tagged content near corridors are spending camera, and D6 is the
   meter that bills them.* Zero code. This is the shipped state.
2. **Scope the telegraph's boom lift** — let the mark and look-at stand but stop the lift from
   competing during short-residency framings (gate on `_frameKey` residency or on the framing's own
   `boom` still being undelivered). One mechanism, but it couples the telegraph to framing
   residency, a linkage nothing else has and §441's family of telegraph regressions argues against.
3. **Author around it** — hang telegraph content ≥ `routeRange` off corridor look-ats where a
   short-residency framing lives. Free in code, a real constraint on the level, and invisible to
   enforcement — it will be violated the first time nobody runs D6.

The evidence so far prices 1 as correct and free until a rope lands over a framing that DOES
deliver — that is the frame to re-read this item on, and D6's per-row table is the instrument that
will show it.

---

## 14. Attacks and ring release — fixed two ways, please re-test on the same machine

**Commit** this round · **Files** `src/core/Input.js`, `KEY_BINDINGS`

Your two reports were one bug: every left click was being consumed as a pointer-lock acquisition
click whenever the lock was pending, denied, or inside the browser's ~1.25 s post-Esc cooldown —
and `attack` had no keyboard binding, so there was no way around it. On a ring, the attack-click
release died the same way.

**Fixed**: a failed lock grant now opens the click gate (clicks attack normally while unlocked;
camera-look needs the lock and returns when it engages), and **F is attack** on the keyboard.

**What to re-test, on the machine that failed**: click-attack on the ground, after pressing Esc,
and immediately after alt-tabbing back. Then E-grab a ring and get off it four ways — Space, E, F,
and Ctrl (drop). If any of those leaves you hanging, say which and whether the mouse was moving the
camera at the time (that tells us the lock state directly).

---

## 15. Pole climbs no longer occlude on the climbed pole — the trade is sight-through, and it wants eyes

**Commit** this round · **File** `src/player/CameraRig.js` (`CAM_SWEEP_OPTS_POLE`, `_readPlayer`,
`_sweep`) · **Ledger** §471 · **Frames** `thief1-t1t*` (before) vs `thief2-t1t*` (after)

The obelisk-rope climb — content the user asked for by name — photographed as the inside of
Sly's own hat: boom pinned at the 0.55 hard-min from mount to top, subject above the frame's top
edge, both takes. The occluder was **the rope being climbed** (its own r 0.15 `pole` proxy, 182
of 211 frames), then the obelisk shaft behind it. The camera's ignore list (`rail`, `hook`,
`spire` — "visually see-through") predates §514.3's ruling that made every climbable pole thin;
nobody revisited it, and the climbed line became the thing cutting the shot.

**Shipped**: while the collider Sly is holding is a pole (`movement.attached`, the moveset's
published contract), the boom casts ignore the `pole` class. Gated on the attachment, so it
cannot fire on any jump, run or wall move by construction; the class rather than the single rec,
because the crush is a stack (rope, then shaft) and a per-rec skip leaves the second layer
binding. The camera-inside-stone overlap check keeps `pole` solid.

**Measured** (`tools/climbtrace.mjs`, `tests/climbcam.test.mjs`): the rope climb goes 0.55 →
5.83–5.96 of boom with ndcY composed at −0.32..−0.50; the drainpipe control stays in its
photographed 5.8–6.0 band; ordinary jumps identical to the digit; the item-12 arrivals
untouched.

**The cost, and it is the one thing to watch.** While on the rope, orbit the camera with the
mouse so the obelisk crosses the sightline: the lens now **sights through the granite** (the
camera body still cannot enter it) instead of crushing to the hat. Two questions, in order:

1. Does anyone actually produce that orbit while climbing — or does the default behind-the-back
   framing (which never crosses the shaft) mean the sight-through is a shot you have to hunt
   for?
2. If it is found and it reads wrong, **the lever is authoring, not the gate**: this rope hangs
   0.30 m off the shaft face — inside `camRadius` — which is why the class ignore was needed at
   all. A rope hung ≥ 0.5 m clear of fat colliders never needs the obelisk ignored on its
   account. Re-solidifying the class reinstates the hat-cam, which is strictly worse than
   either answer above.

One sibling on the record (§471.5): a hook ring hung beside a column would still crush the same
way — `hook` attachments do not open this gate. No authored route does it today; if a ring is
ever authored against a column, that is the frame to re-read this item on.

> ### ⚠ RE-PHOTOGRAPHED (thief2, §472) — the climb composes; the MOUNT still shows the hat for a second, and that second is not this item's mechanism
>
> After-frames, both takes to the centimetre: climb boom 0.55 → **3.36–3.45** (ndcY +1.01 →
> **+0.21**, in frame), top 0.55 → **5.84** (composed at the authored want). The mount frame is
> **unchanged at 0.55** — and the telemetry names why: the sibling above is not hypothetical,
> it is ON the authored mount cadence. The E-mash approach catches a kiosk hook ring for a
> second (`hookSwing` beside the shaft), the swing is crushed 3.16 → 0.55 against the obelisk
> — `hook` does not open the gate, and the occluder is not the held object — and the recovery
> clock (0.22 s hold + 0.62 s τ at 6 m/s) then spends the climb's first ~1.5 s paying that
> debt off after every cast is already clear: §467.1's "the world re-permits and the camera
> declines", photographed on a mount. **What to watch on hardware**: jump-grab the rope and
> count the beat before the camera opens. If that beat reads wrong, the levers are item 12's
> recovery-clock family or the level (the ring beside the shaft), not this gate.

> ### ✅ THE MOUNT DIP INHERITS THE §475 CLAMP — measured, and the debt second now holds frame
>
> Item 12's ruling box covers this item's residual: camclamp's debt arm drives the ring-catch
> deliberately (jump-grab the kiosk ring, ride the swing crushed to 0.55 against the obelisk,
> bail to the rope) and the pre-ruling rig loses the subject on **117 frames** of that
> sequence — |ndcY| to 27 behind the camera plane on the swing, the +1.26-class mount frames,
> |ndcX| to 3.05 as the subject orbits the crushed boom. Shipped: **0 uncontained frames end
> to end**, with the composed climb after recovery bit-identical (153/153 frames) to the
> pre-ruling rig. What the clamp does NOT buy: the boom is still 0.55 through the debt second,
> so that beat is now an extreme close-up OF Sly rather than the inside of his hat — the
> recovery clock and the ring-beside-the-shaft remain the levers if the close-up itself reads
> wrong.

> ### ✅ PHOTOGRAPHED (thief4, §476) — the debt mount holds the margin in the browser
>
> Both T1 mounts: ndcY **+1.26/+1.34 → +0.88** (the margin, to the hundredth) at the same
> boom 0.55; the composed climb and top frames reproduce thief2's numbers **bit-identical**
> (3.362/3.452 · 5.845/5.842), and the T3 drainpipe control is byte-for-byte its photographed
> band — the clamp's zero-contribution guarantee, on camera.

---

## 16. The double jump now twirls — re-test P1

**Commit** this round · **File** `src/player/Clips.js` (`double_jump`) · **§474**

Your P1 — "the double jump seems to use the same animation as the single jump" — was measured
true twice over: the 360° cane twirl was authored into a channel the shipped model discards
(net cane rotation across a double jump: **−13.6°**, less than a single jump's own −28.3° of
arm swing), and the clip was timed so a quick second tap saw only its first 27 % — a wind-up
tuck indistinguishable from a jump squat. The turn is now carried by the hand (both cane rigs
hang off that bone) and completes inside the tapped window: **+346.4°** on the same drive, with
the single jump untouched to the decimal.

**What to re-test.** Run, jump, tap jump again mid-rise — the cane should whip a full turn
overhead on the second press, tapped or held, and the single jump must stay turn-free. Two
judgements only hardware can make:

1. **Speed.** The whip is three 120° steps ~0.09 s apart (~22°/frame) ending in 0.11 s of held
   pose — authored brisk because "whips" is the verb. If it reads as a flicker rather than a
   whip, the lever is the key times inside `double_jump` (spread 0.26 → 0.34 s), not the clip
   duration — past ~0.42 s the held rise runs out and the fall re-base eats the tail again
   (§474.3).
2. **Read from behind.** The follow camera sits ~5.4 m back, so the turn is a motion read (the
   cane crossing sides over ~10 frames), not a pose read. If it does not register at all from
   the default camera, the cheap amplifier is FX — Particles already fires a `cane_arc` burst
   on `doubleJump` (Particles.js:2620), so the lever is that burst's size and lifetime, not a
   bigger arm.

`shots/twirl1-before-double-f16.png` beside `twirl1-after-double-f16.png` is the pair to hold up.

---

## 13. Slopes — sand now walks to 58°, and the feel question that remains

**Commit** this round · **Files** `src/player/Controller.js` (`TUNE.slopeSandDeg`, `_walkableLimit`, `narrowGround`)

Your report — *"difficult to walk or run up slopes other than by jumping"* — was three stacked
mechanisms, all fixed: the dunes are steeper (up to 57.2°) than the single 50° walkable limit; a
half-scoped fix left gravity shedding you downhill to a constant 1.50 m/s; and the narrow-ledge
probe read any steep slope as a tightrope and forced balance-tiptoe. Sand now walks to **58°**
(stone keeps 50° — the spawn-stair jump beat and every shedding face are untouched), and the ledge
probe is slope-blind on planar ground.

**What to re-test**: run straight up the big western dunes without jumping. Expect full run speed on
moderate grades and a bounding rhythm (brief ballistic hops) on the steepest faces — that lofting is
physics at speed, not the old stutter.

**The open feel question**: there is deliberately NO speed penalty with angle — a 48° climb delivers
100 % of flat speed on clean ground. If steep climbs should feel like work (slower, heavier), that
is a slope-speed curve nobody has authored, and the measurements to derive one from are in §515.3.
Say whether the climb feels weightless before anyone builds it.

---

## 17. The impact shake reaches the lens for the first time — every amplitude is authored blind

> ### ✅ USER VERDICT — "the Impact shake is good." The blind-authored amplitudes are ratified by
> play as-shipped; every TUNE constant stands untouched. Item closed.

**Commit** this round · **File** `src/player/CameraRig.js` (`init`, one subscription) · **Ledger** §475.4

The camera's impact shake — rotation-dominant, three-octave noise, five TUNE constants, its own
docblock citing the dive slam's exact pair — has existed since the rig was written and **had zero
callers**: the moveset emits `'shake'` on the bus, and the only listeners were the HUD's DOM
wobble and Audio's music duck. The committed `slamtrace.json` drove a real 16 m slam with zero
nonzero-shake frames. Every impact anyone has ever watched on this project wobbled the HUD over a
tripod-still lens. Found when the §475 clamp arms' shake recorder refused to record anything;
wired as one subscription in `CameraRig.init` so the containment invariant could be measured
against the wobble live rather than a dead stage (it holds: slam impact −0.86 with the shake
riding it).

**What fires now, and at what size**: dive slam 0.35 (the AGENTS.md §6 spec number), hard
landings min(0.3, f×0.018) — soft landings stay still — hurt 0.22, the combo-3 finisher 0.16,
the bounce 0.10, the spire land 0.08; all 0.25 s, rotation ~0.055 rad/unit with a positional
whisper.

**What to watch.** Slam from height, take a hit, land hard off a lost wall — the lens should now
kick with each. Two judgements only eyes can make: (1) **size** — these amplitudes were authored
without ever being seen; if the slam's kick reads as flinch rather than impact the lever is
`TUNE.shakeRot`/`shakePos` (global character) or the per-emit amounts in the moveset (per-moment
size, that lane's). (2) **doubling** — the HUD's DOM wobble still fires on the same events; if
lens + HUD together read as a broken monitor, the HUD's `shakeGain` is the one to turn down, not
this wiring.
