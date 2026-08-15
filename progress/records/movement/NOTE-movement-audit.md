# NOTE-movement-audit — what the moveset actually has, what it was missing, and one whole tag of the level that soft-locked on contact

Offline. No boot, no capture, no GPU, no `withGame`. Everything below was measured by running the
real `Controller` / `Moveset` / `States` / `Targets` headlessly in plain Node against scripted
input and stub COLLISION/GUARDS modules — the same technique `tests/targets.test.mjs` established,
and for the same reason: every claim here is about a trajectory over dozens of frames, and a frame
cannot hold one.

Scope: `src/player/` only. `node --test "tests/*.test.mjs"` → **549 passing, 0 failing.**

---

## 1. The audit — implemented vs missing, read from code, not from docs

`§6` lists 28 moves and says "all of it ships". Most of it does. The interesting column is the
third one.

| Sly vocabulary | status | where |
|---|---|---|
| cane-hook swing | **present, complete** — true pendulum, tangential-only gravity, speed-scaled pumping, release ×1.15 + up-kick, airborne auto-grab so chains flow | `Moveset.HookSwing` |
| rail slide | **present** — gravity-driven along the spline, friction, ±6° sway | `Moveset.RailSlide` |
| rail walk / balance | **present** — player-driven, hands back to slide above 1.5× walk speed | `Moveset.RailWalk` |
| ledge tiptoe (narrow-ledge balance) | **present** — `narrowGround()` probes both sides and the ledge decides, not the player | `Moveset.Tiptoe` |
| spire land | **present** — snap to point, two-octave wobble, deliberate 0.16 s walk-off delay | `Moveset.SpireLand` |
| spire jump (×1.25, the triple jump) | **present** — hands back two air jumps | `Moveset.SpireLand.update` |
| wall run (along) | **present** | `Moveset.WallRun` |
| wall run (up, head-on) | **present** — entry angle picks along vs up; ~2.5 m of rise | `WallRun._vertical` |
| wall cling / wall jump | **present** — cling re-arms one wall run, jump resets the chain | `WallCling`, `WallJump` |
| **vertical wall climb (sustained)** | **partial by design** — the head-on wall run is a 1.4 s burst, not a climb. Left alone deliberately; see §4 | — |
| paraglide | **present** | `Moveset.Paraglide` |
| **circle-strafe around a target** | **ABSENT — nothing at all.** No lock-on locomotion existed; `focus` drove only Thief-o-Vision and hook lock-on | *added, §2* |
| roll | **present** — momentum-preserving, steerable | `Moveset.Roll` |
| dive attack (Cane Slam) | **present** | `Moveset.DiveAttack` |
| sneak / crouch / crawl | **present** — crawl is vent-gated, and the vent decides | `Sneak`, `Crouch`, `Crawl` |
| ledge hang / shimmy / climb | **present, complete** — shimmy re-probes the lip before committing; the mantle is up-then-forward, not a lerp | `LedgeHang`, `LedgeClimb` |
| **pickpocket approach** | **STUB** — the reach fired on E with **no guard anywhere near**. No mark, no approach, no closing | *rebuilt, §2* |
| **pole climb** | **BROKEN — soft-locked the game on contact** | *fixed, §2* |
| **pole slide** | **BROKEN** — same cause | *fixed* |
| **pole swing** | **BROKEN** — same cause, plus a second bug underneath it | *fixed* |
| double jump (cane twirl, redirects) | present | `DoubleJump` |
| enemy bounce | present | `Bounce` |
| cane combo (3-hit, lunging) | present | `Combo` |
| skid / land / coyote / jump buffer | present (`land` had two defects, §3) | `Skid`, `Land` |
| Thief-o-Vision | present | `Controller._thiefVision` |
| authored target magnetism | present, and genuinely good | `Targets.js` |

---

## 2. What I implemented, and why those

Gaps were ranked by **how much level geometry is standing idle behind them**, per the brief.

### 2.1 Pole climb / slide / swing — dead on arrival, on 17 bodies (the top gap by a wide margin)

`Moveset.PoleClimb` and `PoleSwing` have always read `c.pole` (`Moveset.js:817, 837, 843, 888`).
**`Controller` never created that object.** Both `enter()` and `update()` are wrapped in the state
machine's `softFail` try/catch (`States.js:95-96, 111-112`), so grabbing a pole did not throw
visibly — it *silently half-ran*, which is far worse.

Measured headlessly against a stub obelisk:

```
frame 10: entered poleClimb
final state : poleClimb      final pos: 0.00, 17.85, 5.77      warnings: 190  (the softFail cap)
  - movement: enter failed in "poleClimb": Cannot set properties of undefined (setting 'rec')
  - movement: update failed in "poleClimb": Cannot read properties of undefined (reading 'top')
```

`enter` threw on its first write and initialised nothing. `update` then threw *after*
`c.position.y += vy * dt` but *before* the top clamp — so holding W climbed at 3 m/s **forever**,
with no shaft, no top, no `place()` and no collision, straight up into the sky. `jump` could not
release, because it dereferenced `p.angle` and threw before it could return. Crouch was worse:
−8 m/s down through the floor until `voidY` −220 respawned him.

Every `pole`-tagged body in §8.1 was a soft-lock on contact: **the 22 m obelisk, all twelve
hypostyle columns, the two hook-cable masts, the two aisle pinnacle poles.**

Fix: `Controller.js:423` — the missing state slot, documented field by field, alongside its exact
counterpart `this.rail`. Two further bugs surfaced the moment the path became reachable, and both
are fixed here because shipping a newly-reachable broken path is worse than leaving it crashed:

* **The top hop was defeated by the auto re-grab.** `PoleClimb.update`'s "reaching the top and
  still pushing up hops you onto it" branch returns `'jump'`, but `PoleClimb.canEnter` immediately
  re-grabs the shaft — inside the *same frame*, because `States.update` runs up to four passes —
  and `enter` re-clamps `position.y` to `top − 0.25`. Measured: Sly pinned at y 11.75 forever.
  The obelisk was the dead end its own code comment says the hop exists to prevent.
  Fix: `TUNE.poleLockout` 0.40 s (`Controller.js:117`), the exact counterpart of the existing
  `hangLock` on ledges, set on every pole exit (`Moveset.js:881, 912`).
* **One tap of LMB on a pole read as a cane slam.** `PoleClimb.update` returns `'poleSwing'` on
  `pressed('attack')`; the *same still-true press* then satisfied `PoleSwing`'s own release test on
  its first pass, which launched into `jump` (group `air`) with the press still live, which
  `DiveAttack` (priority 95) took. Measured: `poleClimb → dive`, never `poleSwing`.
  Fix: `TUNE.poleSwingMin` 0.14 s (`Controller.js:125`) — the rope already has exactly this in
  `hookMinSwing`, the pole simply had no equivalent.

After: `poleClimb → poleSwing → jump → fall → land`, 0 warnings; top hop, jump-off and slide all
behave; the shaft, top clamp and grip radius are all honoured.

### 2.2 Circle-strafe around a mark — the one item on the list with no code at all

`Moveset.CombatStrafe` (`Moveset.js:1112`), priority 45. With RMB held and a guard in range, the
stick stops meaning *north/east* and starts meaning *tangent/radius*: A/D swing Sly round the mark
at fixed distance, W/S tighten or open the orbit, facing is welded to the body throughout.

Weighting: 11 patrolling guards across every zone (`Patrol.ROSTER`) — second only to the poles.

Reuse rather than reinvention, throughout:

* the mark comes from `Guards.nearest()` — public API whose own comment names HUD lock-on as its
  consumer. MOVEMENT imports nothing from `src/ai/**` (§1 forbids it) and a build without guards
  gets exactly zero behavioural delta, the same discipline `TargetField` keeps against an empty
  registry. Verified: with no `guards` module, RMB does nothing new.
* raw stick axes (`wishRaw`), not camera-relative `wishDir` — the idiom `PoleClimb` and `LedgeHang`
  already use when the world defines the axes.
* named **`combatStrafe`** so `CameraRig.STATE_RULES` matches `combat` and resolves the `combat`
  framing (pulled in 0.90 m, offset 0.30 m, lens tightened) for free. **No edit to CAMERA's
  table** — not MOVEMENT's file to write.
* `lockOn` on the bus. That event had a HUD subscriber (`HUD.js:492`, reticle) and no publisher;
  this closes the pair end to end.
* `animation.setLookAt()` — §4.7's look-at channel, which MOVEMENT had never used. Aimed at
  `Guard.headY`, the guards' own public accessor.

Measured: orbit radius held 3.50 → 3.65 over 3 s (Euler drift, 0.15 m); yaw error to the mark
1.2°; radial clamps at 1.75 / 5.35 against targets 1.9 / 5.2 — the 0.15 m overshoot is exactly
one stopping distance at `strafeClose` 3.2 and `strafeAccel` 30, and is intended: the clamp
**rejects the input**, it does not clamp the position, because being teleported off a boundary is
the classic lock-on shove.

Shift and Ctrl outrank the lock, deliberately: sneaking past a guard must never be overridden by
noticing him. Attack hands off to `combo` and back. A KO'd body is not a mark.

*One flaw I shipped into this file and measured back out, recorded because the reasoning matters:*
the acquisition cone was initially applied to **retention** as well, so circling ~100° carried the
mark behind the camera's forward and the lock dropped mid-orbit through no act of the player's.
A lock is broken by walking away or letting go, never by the move you are performing with it.
`mark(wide)` now means "we already hold this" and skips the cone.

### 2.3 Pickpocket — the approach, which is the whole move

`tests/pickpocket.test.mjs` already says it in as many words: *"`Moveset.Pickpocket.canEnter`
requires only that the player is grounded, pressed `interact`, and has no hook/rail/pole to grab.
**It never checks that a guard is anywhere near.**"* That test fixed the half it owned (HUD pays on
`guardPickpocket`, the steal, not on `pickpocket`, the reach). This is the other half: the reach
should not happen with nobody to rob.

Rebuilt as two phases (`Moveset.js:1198`):

* **creep** — a mark 2.4…4.6 m away is closed on at `pickCreep` 1.4 m/s (= `sneakSpeed`, shared
  deliberately), facing on the body, re-reading the mark every frame so a *patrolling* guard is
  followed rather than lunged at. Bounded by `pickCreepMax` 2.2 s and refusable by steering away
  (`pickBreakDot` −0.5, the same threshold and the same reason as magnetism's `magBreakDot`).
* **reach** — the original 0.55 s beat, unchanged, now firing `pickpocket` at the *start of the
  reach* rather than on entry, so GUARDS resolves its own target with Sly's hand already there.

Measured: E pressed at 3.9 m → creeps to 2.37 m → fires **exactly once**. E mashed in an empty
courtyard → **0 events** (was: one per press, anywhere in the level).

---

## 3. Bugs found in existing code

| # | bug | site | status |
|---|---|---|---|
| B1 | `c.pole` never created; pole climb/slide/swing soft-lock on contact | `Moveset.js:817,837,843,888` vs `Controller` ctor | **fixed** |
| B2 | `PoleClimb`'s top hop re-grabbed inside the same frame | `Moveset.PoleClimb.canEnter/update` | **fixed** (`poleLockout`) |
| B3 | one LMB tap on a pole becomes a dive attack | `Moveset.PoleSwing.update` | **fixed** (`poleSwingMin`) |
| B4 | `Land.canEnter` compared against an undefined `c._landFrame` → `NaN <= 2` → **permanently false** | `Moveset.js:156` | **fixed** (`Controller.js:464,768`) |
| B5 | `landImpact` is measured after the thing it measures has been zeroed | `Controller.js:1182` | **diagnosed, NOT fixed — see below** |

### B4, in full

`Land.canEnter` is `grounded && landImpact > 3.2 && c._frame - c._landFrame <= 2`. Nothing ever
set `_landFrame`, so the third term was `NaN <= 2` — false, always. The polled entry to `land` was
dead; only the explicit `return 'land'` inside `AirState.landed()` ever reached it. Touching down
out of a wall run, a wall cling or a magnet arrival landed in complete silence. Fixed by stamping
the frame where `landImpact` is written, and seeded to −99 so frame 1 cannot look like a landing.
The bare `3.2`, repeated in three places, is now `TUNE.landBeat` at its shipped value (§5 wants
feel constants in `TUNE`) — behaviour-identical.

### B5 — diagnosed, deliberately not landed. **This needs arbitration.**

`move()` runs `_moveVertical` then `_probeGround`. The **swept capsule** is what actually stops a
fall and it sets `v.y = 0` (`Controller.js:1182`); `_probeGround` then reads `-velocity.y` off a
velocity that has already been zeroed. The ground probe only wins the race when the frame before
touchdown happens to leave Sly inside its 0.06 m snap band.

Measured over the sub-frame phase of a standard jump arc:

```
  probe wins (landImpact real): 12/40      sweep wins (landImpact = 0): 28/40
  => whether a landing registers at all is decided by arithmetic the player cannot see
```

On any descent faster than ~3.6 m/s — i.e. any drop over ~0.27 m — it is decided *against*. A 14 m
drop was measured landing in total silence: `land` never entered, no `landed` event for FX or
AUDIO, no shake, and `land_soft` / `land_hard` / `land_roll` all unreachable.

**The fix is one line and I did not land it, because it is not one line in effect.** With the
measurement corrected, every ordinary jump reliably arrives at **10.474 m/s** (measured against
the shipped `gravity()` at 60 Hz; apex 2.356 m) — which is *above* `landHard` 9.0. So correcting
the number turns **every jump in the game** into a hard landing with a 0.19 s control tax and a
camera shake. Fixing B5 therefore forces re-deriving `landHard`, and that is a feel decision that
wants a playtest I am not able to run.

It also, on first attempt, broke `tests/targets.test.mjs:493` — *"the descent is ballistic — the
assumption every measurement above rests on"* — whose second assertion uses `states.has('land')` as
a **proxy** for "he arrived fast". That proxy is sound today only because of the 12/40 coin flip
above; the base run happens to be one of the 12. The file's *direct* measurement of ballistic-ness,
`fallTime < 0.60`, passed throughout and was never in question.

Proposed derivation, from this moveset's own arcs, for whoever arbitrates:

```
  single jump   v0 11.00  apex 2.356 m  lands 10.474 m/s
  double jump   v0  9.90  apex 1.906 m  lands  9.386 m/s
  jump+double stacked     apex 4.262 m  lands 14.304 m/s
  spire jump   v0 13.75   apex 3.755 m  lands 13.293 m/s
  step height 0.42 m -> 4.49 m/s        (the height the capsule steps over without leaving ground)

  landBeat = jumpV0 = 11.0   "a landing interrupts you when you arrive faster than you can
                              launch yourself" — clears the routine jump and the double jump,
                              sits far above a kerb, so ordinary platforming pays no beat.
  landHard = 14.5            just over the fastest arrival the moveset can reach under its own
                              power — i.e. the first landing that was NOT a move you meant.
                              A 4.38 m free fall.
```

If that lands, `tests/targets.test.mjs:493`'s second assertion should be re-pointed at the
quantity it actually cares about — the file already computes `vImpact` — rather than at a state
name whose meaning has changed. **That is a test change and it is not mine to make.** The full
diagnosis is written at the declaration site, on `TUNE.landBeat`.

---

## 4. What I deliberately left, and why

* **A sustained vertical wall climb.** The brief lists it, and it is the one vocabulary item I
  chose *not* to build. Every `wallProxy` in `EgyptLevel.js` is registered `climbable: true` —
  all 19 of them — so a free climb keyed on that flag is a free climb on every wall in the temple,
  including the 26 m entry pylons and the 34 m inner pylon. §8.1 designs the Pylon Ascent as
  "wall runs, spire tips, swinging hooks, up the pylon face"; a free climb does not add to that
  set piece, it deletes it. Doing this properly needs a *distinguished* climbable surface, which
  is level-authoring in ARCHITECTURE's file, not a movement constant. Flagged, not built.
* **Publishing `prompt`.** A draft of this shipped and was reverted. It is not a gap:
  `HUD._tickAffordancePrompt` already drives contextual verbs — the pocket via
  `Guards.nearestPickpocketTarget`, and hook/rail/pole/spire/vent via one `collision.query`. The
  first publisher retires that fallback (`tests/eventbus.test.mjs` names the trap in advance and
  parks `prompt` in `DEAD_UNBUILT` for it), so a partial publication costs four traversal verbs
  and buys nothing. The correct version spans `src/player/` and `src/ui/` and is routed as one
  coordinated change; the UI lane has it recorded in `progress/records/ui/`.
  **The cost argument my first draft gave was also simply wrong** and is corrected at the site:
  `collision.query` takes a tag array and answers all five in one BVH walk, which is *cheaper*
  than the per-tag `afford()` calls the draft was avoiding. The reason not to publish traversal
  verbs from MOVEMENT is ownership, not cost.
* **Extending §4.7's `setLocomotion` with a strafe axis.** `CombatStrafe` plays `walk`/`run` while
  orbiting, so a hard sideways orbit plays a forward stride. Stated in the code rather than hidden.
  Widening that contract is ANIMATION's call. What the orbit *does* feed honestly is `turnRate`
  (constant signed `v/r` for a circle — it drives the existing lean and turn-in-place blends) and
  the look-at.
* **A regression test for any of this.** `tests/` is outside my lane. Everything above was verified
  with throwaway harnesses in the scratchpad; a permanent `tests/movement.test.mjs` — pole grab
  does not soft-lock, E with no guard fires nothing, the orbit holds its radius — belongs to
  whoever owns that directory and would be cheap to write from the numbers here.

---

## 5. §8.1 reachability

**Reachability increases, and only back to what §8.1 already specifies.** No geometry moved; no
new traversal graph edge was invented. Fixing B1–B3 restores links the contract asserts and that
were unreachable because the mechanic crashed:

* **Obelisk (0, ·, 11), `pole`, "climbable full height"** — climbable again to the pyramidion, and
  the top hop now completes, which is the intended feed into the `spire` tip at its apex (and from
  there the ×1.25 spire jump). §8.1's own wording; previously a soft-lock.
* **Twelve hypostyle columns, `pole`-tagged, shaft 0.42 → 11.9/12.3** — climbable again, feeding
  the abacus `ledge` on each capital and thence §8.1's "ledge tiptoe circuit around the
  architrave" at y 10.01.
* **Two hook-cable masts and the two aisle pinnacle poles** — the east mast (20.6, ·, 27.5) is the
  authored entry to the main hook chain per `EgyptLevel`'s own comment. It was unusable.

Nothing became reachable that §8.1 does not name. `combatStrafe` and the pickpocket approach are
both ground moves with no vertical component and change no traversal edge. `poleLockout` 0.40 s
*narrows* one thing — you cannot re-grab a pole you just left for 0.4 s — which is what makes the
top hop work at all.

---

## 6. Provenance

**None recorded, because none is owed.** No external code was brought in; every line here was
written against this repo's own files and its own numbers. The only imported *structure* in this
lane predates me (`Targets.js`, from `progress/records/IMPORT-slyrepos-movement.md`, with its
constants re-derived dimensionally and asserted by `tests/targets.test.mjs`) and I did not touch it.
Every constant I added is derived from a number already in `TUNE` and carries that derivation in a
comment at its declaration.

---
---

# Continuation — 2026-08-15. The free climb the moveset already had, and the tips it never let go of

Second pass over the same lane. Scope unchanged: `src/player/Controller.js` + `Moveset.js` only.
`node --test "tests/*.test.mjs"` → **549 passing, 0 failing**, before and after.

The instrument changed, and it is the reason this pass found what the first one did not. §2's
measurements ran the controller against *stub* collision. This pass builds the **shipped level and
a real BVH** headlessly — `Architecture` → `buildEgyptLevel` → `Collision.build()` → `Controller`,
all of which import in plain Node — so every probe below hits real temple geometry: 248 colliders,
4 030 triangles, 88 `ledge`, 75 `wall`, 42 `ground`, 17 `pole`, 11 `hook`, 6 `rail`, 5 `spire`,
4 `vent`. `tests/level.test.mjs` established that the level builds headless; adding COLLISION to it
is the whole difference between "does this state machine crash" and "does this state machine play
the temple".

**First, the negative result, because it is what the rest of the pass rests on.** A level-wide fuzz
— 133 spawn points × 3 trials × 420 frames of randomised stick and buttons, 167 000 frames — found
**0 NaN, 0 void respawns, 0 stuck runs, 0 warnings**. §2's repairs hold up against the real BVH.
Nothing here is a crash. Both items below are moves that *complete and are then silently undone*,
which is the failure mode a warning count cannot see and a frame cannot hold.

---

## 7. C1 — the moveset contained a free vertical wall climb, and it deleted the Pylon Ascent

### 7.1 What was measured

Hold forward into any flat wall face and tap jump on a five-frame cadence — no timing skill, a
button mash. Measured against the shipped level, 900 frames (15 s) per face:

```
  face                          gain      top reached
  hall front wall     (13 m)   17.81 m       y 17.81      ← climbed 4.8 m past the wall's own top
  entry pylon S face  (26 m)   16.53 m       y 16.53
  colossus throne back         12.74 m       y 12.74
  entry pylon W face  (26 m)    7.99 m       y 26.11      ← standing on top of the 26 m pylon
  inner pylon N face  (34 m)    6.30 m       y 23.19
                       TOTAL   68.52 m
```

The loop, read off a per-transition trace on the hall's front wall (one rec, one face, contact
normal a constant (0, 0, 1) throughout, 18 cycles in 700 frames):

```
  wallJump → doubleJump → [wallCling] → wallJump → doubleJump → [wallCling] → …
                                                            +0.55 m every 5 frames
```

`WallJump.enter` re-grants `airJumps = 1` and zeroes `wallRunUsed`; the double jump redirects
horizontal velocity back into the face it just left; `WallCling.canEnter` accepted that face again,
unconditionally; and its `update` hands the jump straight back to `WallJump`. Nothing in the cycle
consumed anything. The cling is invisible in an end-of-frame trace because the machine runs up to
four passes, so `doubleJump → wallCling → wallJump` all land inside one frame.

### 7.2 Why this was the top item

**It is the exact thing §4 of this note refused to build.** The reason given there for not shipping
a sustained wall climb was: *"a free climb keyed on that flag is a free climb on every wall in the
temple, including the 26 m entry pylons and the 34 m inner pylon. §8.1 designs the Pylon Ascent as
'wall runs, spire tips, swinging hooks, up the pylon face'; a free climb does not add to that set
piece, it deletes it."* That argument was right and it was already being violated — the moveset had
a free climb under another name, reaching the top of the 26 m entry pylon from the courtyard floor
with no hook, no spire and no rail touched.

**And the guard for it was already written.** `c.lastWallRec` has been assigned by `WallRun.enter`
since the file was drafted and is **read nowhere in `src/`**. The field exists for precisely this
and was never wired up.

### 7.3 The rule: one face, one bite

`TUNE.wallFaceDot` 0.5 (`Controller.js:100`), with `wallSpent` / `markWall` / `freeWall`
(`Controller.js:858, 865, 878`), polled by `WallRun.canEnter` (`Moveset.js:372`) and
`WallCling.canEnter` (`Moveset.js:435`).

A wall **face** — a collision rec *plus* its outward XZ normal — may carry Sly once per airborne
period. Four decisions worth their sentence:

* **A face, not a body.** 0.5 = 60°: the widest cone that still separates two faces of a
  rectangular mass (90° apart, dot 0 — a pylon corner stays a fresh face, which is what "up the
  pylon face" asks for) while still reading the 45°-apart facets of an 8-segment cylinder proxy
  (dot 0.707) as one surface, so a column cannot be laddered facet by facet. The battered temple
  faces drift by their own batter (~5°) along a single run; that is swallowed.
* **Polled entries only.** The `wallRun → wallCling` handoff — the one the run's own timeout
  performs when the player is still pressing into the wall — is a `return 'wallCling'`, which goes
  through `sm.request()` and never calls `canEnter`. The move the rule could have broken is
  structurally immune to it. Verified, not assumed.
* **Any hold gives the walls back.** `freeWall()` fires from `onStateChanged` whenever the next
  state's group is `attach` (`Controller.js:1434`) — hook, rail, pole, spire, ledge, authored magnet
  point — and from `Bounce.enter` (`Moveset.js:350`). One line at a hook the machine already
  funnels every transition through, and it is what turns the ascent back into §8.1's authored chain:
  the wall carries you to the next hold, and the hold pays for the next wall.
* **A null rec is never spent.** Under `FLAT`, or a COLLISION that answers without records, every
  wall would otherwise compare equal to every other and the wall run would vanish outright.
  Degrading to "no wall tech" is a far worse failure than degrading to "wall tech is free".

### 7.4 The A/B

One lever, both arms the shipped code: `OFF` neuters `wallSpent` to the constant `false`, which is
exactly what the file did before.

```
  jump-mash elevator, 900 frames          OFF        ON       delta
    hall front wall     (13 m)          17.81 m    2.05 m   -15.76
    entry pylon S face  (26 m)          16.53 m    2.64 m   -13.89
    colossus throne back                12.74 m    1.17 m   -11.57
    entry pylon W face  (26 m)           7.99 m    1.72 m    -6.27   (top y 26.11 -> 19.84)
    inner pylon N face  (34 m)           6.30 m    1.63 m    -4.67
    peristyle wall    (12.5 m)           4.40 m    4.67 m    +0.27
    hall side wall                       2.75 m    2.75 m     0.00
                                TOTAL   68.52 m   16.63 m
```

Ordinary wall tech, played with tapped jumps rather than a mash, is **unchanged**: `Δgain 0.00` on
peristyle head-on (9.03 m, `wallJump→…→jump→wallRun→fall→ledgeClimb`), peristyle glancing, hall side
glancing, tomb pier chimney (3.03 m, `wallRun→wallCling→land`), entry pylon, and inner pylon from
the hall (3.11 → 3.10 m). Where the ON arm *does* lose height — tomb chimney tap+bail 5.84 → 2.72,
inner pylon tap+bail 6.20 → 3.06, hall front wall tap+bail 7.21 → 1.30 — the OFF arm's extra metres
come from re-entering `wallRun`/`wallCling` **on the same face in the same frame as the wall jump**,
i.e. one unit step of the elevator. That is the whole delta, and it is the target.

The authored ladders are byte-identical in both arms:

```
  hypostyle column  move→poleClimb→jump→railSlide           maxY 12.75   identical
  obelisk           move→poleClimb→jump→toTarget→spireLand  ends exactly (0, 22, 11)   identical
  hook chain        658 / 700 frames in hookSwing           identical
```

---

## 8. C2 — a spire tip could be landed on and not left. Five bodies, and one of them is the obelisk

### 8.1 What was measured

`SpireLand.update` has two deliberate exits and a comment explaining one of them — *"Deliberately
walking off takes a beat, so a stray tap doesn't drop you off the tip."* **Neither exit had ever
worked.** Forcing a clean landing on each tip and then driving one input for 200 frames:

```
                                   lockout 0        lockout 0.30
  pinnacle W hi   walk-off      200/200 frames    left at f13
                                leftAt = NEVER
  pinnacle W lo   walk-off      200/200 NEVER     left at f13
  obelisk         crouch        200/200 NEVER     left at f4
  pinnacle W hi   crouch        200/200 NEVER     left at f4
  pinnacle W lo   crouch        200/200 NEVER     left at f4
  all three       spire jump      left at f4      left at f4      (unchanged — see below)
```

Both exits `return` a state name; the machine re-polls in the same frame; `SpireLand.canEnter`
(priority 90, the highest pollable move that is not the dive) re-took the tip with Sly still
standing on the point at zero velocity, so every clause passed — `!grounded` ✓, group `air` ✓,
`velocity.y > 0.8` false ✓, `distance` 0.30 ≤ `spireGrab` 3.4 ✓, `point.y <= position.y + 1.0` ✓ —
and `enter` copies `a.point` straight back into `c.position`.

The only exit that worked was the spire jump, and it worked by accident: `launch(13.75)` fails the
`velocity.y > 0.8` clause on its own.

**This is the same bug as B2, on the third member of a family this file already had two of.** B2 was
the pole top hop being re-grabbed inside its own frame, fixed with `poleLockout`; ledges have had
`hangLock` since before either of us. The spire simply had no equivalent.

### 8.2 The fix

`TUNE.spireLockout` 0.30 (`Controller.js:179`), `c.spireLock` (`Controller.js:464`), decremented in
`_preTimers` (`:723`), cleared by `teleport` (`:1504`), checked in `SpireLand.canEnter`
(`Moveset.js:1012`) and set on every `SpireLand.exit` (`Moveset.js:1060`) — the exact shape of
`poleLock`, deliberately, so the three of them read as one idea.

**0.30 s is read off the predicate it has to outlive, not chosen.** `canEnter`'s own "only from
above" clause is `point.y <= position.y + 1.0`, so the grab dies once Sly is more than 1.0 m below
the tip; a 1.0 m fall from rest at `gravity` −24 takes `sqrt(2/24) = 0.289` s, clean ballistic
(`apexHang` only trims a *rising* vy — see §3 of the pre-existing note on why that matters). 0.30
puts the lock just past that, so both exits clear their own re-grab window under gravity alone and
nothing wider is claimed. It sits naturally between `hangLock` 0.34 and `poleLockout` 0.40 without
being copied from either.

**It costs the spire jump nothing** — measured identical in both arms on all three tips, because a
13.75 m/s launch was never the thing being re-grabbed. The fix is scoped to the two exits that were
broken.

---

## 9. §8.1 reachability

**Reachability NARROWS, and only by removing something §8.1 never granted.** No geometry moved and
no traversal edge was invented.

* **Removed:** an unauthored free vertical climb on every flat wall face in the temple. Concretely,
  the top of the **26 m entry pylon** (y 26.11) is no longer reachable by mashing jump at its west
  face from the parapet, and the **13 m hall front wall** no longer yields 17.81 m of climb from the
  courtyard floor. §8.1 tags those as `wall` — "battered walls, `wall` run surface" — and a run
  surface is a rung, not a lift. Zone 4, the **Pylon Ascent**, is specified as "wall runs, spire
  tips, swinging hooks, up the pylon face"; it is a set piece again rather than a formality.
* **Restored:** the five `spire` bodies §8.1 names — the **obelisk pyramidion (0, 22, 11)** and the
  four pinnacles at **(±6, 27, −50)** and **(±16, 21, −50)** — are places you can now leave under
  your own power by walking off or crouching, not only by jumping. §8.1 calls them the Ninja Spire
  Landing; a landing you cannot step off is a trap, and it was the top of the obelisk climb.
* **Unchanged and verified identical in both arms:** the hypostyle column ladder
  (`poleClimb → jump → railSlide`, maxY 12.75), the obelisk ladder ending exactly on its authored
  spire (`poleClimb → jump → toTarget → spireLand` at (0, 22, 11)), and the courtyard hook chain
  (658 of 700 frames swinging). The authored magnetism registry, the six rails and the eleven hooks
  are untouched.

The wall rule is what makes the ascent a *chain*: `freeWall()` on any `attach` entry means one hook,
one ledge, one pole or one spire on the way up pays for the next wall face. That is §8.1's own
sentence, enforced.

---

## 10. Sustained wall climb — the specification ARCHITECTURE would need, and why I still say no

§4 deferred this on the grounds that all `wallProxy` are `climbable: true`. Measured against the
built level that is worse than recorded: **75 registered `wall` recs, 75 of them `climbable: true`.
There is no distinguished surface, and `climbable` carries no information at all** — MOVEMENT never
reads it, and a flag that is true everywhere could not gate anything if it did.

**Written out as instructed, then declined.** If ARCHITECTURE ever wants this, here is the exact
contract:

```js
// src/world/EgyptLevel.js — wallProxy(), one extra opt, passed through engine.registerCollider.
// Engine.registerCollider already spreads `...opts` onto the rec, so no COLLISION change is needed
// and no §4.4 tag is added: the tag list is a binding contract and this is not a new affordance,
// it is a property of an existing one.
wallProxy(A, x0, x1, y0, y1, z0, z1, { handhold: true })   //  -> rec.handhold === true
```

* **Name:** `handhold`, not `climbable`. `climbable` is already spent and already means nothing.
* **Which proxies get it:** *only* the two entry pylon towers at (±14, ·, 34) and the inner pylon at
  (0, ·, −52) — the three bodies §8.1 names as the vertical set piece — and only on their **south**
  faces, the ones the approach actually presents. Three bodies out of 75. If it goes on more than
  five, it is a free climb again and the answer above applies.
* **Why those:** they are the only walls in the level tall enough (26 m, 26 m, 34 m) that a
  sustained climb is a *traversal* rather than a shortcut, and they are the only ones whose ascent
  §8.1 has already designed a reward for (the spires at y 21/27, `rail:pylon-summit` at y 34.4,
  `rail:pylon-drop` from y 26.3).
* **What MOVEMENT would then build:** a `WallClimb` state at priority 79 (below `wallRun` 80, so a
  run still wins on a fast head-on entry), group `air`, entered by `wallSpent`-gated contact with a
  `handhold` face, climbing at roughly `poleUp` 3.0 m/s with a stamina bound in the shape of
  `wallRunMax`, and exiting to `wallCling`/`wallJump` exactly as the run does.

**I am still not building it, and now for a stronger reason than last time: it is not in the
contract.** §6's move list — the one headed "The full Sly moveset — all of it ships" — contains
`wall run · wall jump · wall cling` and no wall climb. The item on the audit table in §1 came from
the Sly games' general vocabulary, not from AGENTS.md. So the honest status is not "deferred gap"
but **"not a gap"**: the moveset is complete against §6, and C1 above shows that the marginal
version of this mechanic was already present and was costing the level a set piece. Adding a
deliberate one now would be re-litigating a decision this pass just made in the opposite direction.

I also did not stub a `WallClimb` that gates on a tag nothing sets. A state that can never be
entered is dead code that reads as a promise, and this file's own history (`c.pole` read by two
states and created by nobody, `lastWallRec` written by one state and read by nobody) is a record of
what unwired machinery costs. The specification above is cheaper to act on than a dead class, and it
is written where the decision lives.

---

## 11. Bugs found in existing code (continuing §3's table)

| # | bug | site | status |
|---|---|---|---|
| C1 | `wallJump → doubleJump → wallCling → wallJump` is an unbounded vertical climb on one wall face; puts Sly on the 26 m entry pylon from the floor | `Moveset.js` `WallJump.enter` re-grants `airJumps`/`wallRunUsed` + unguarded `WallCling.canEnter` | **fixed** (`wallFaceDot`) |
| C2 | `SpireLand`'s walk-off and crouch exits are re-taken in the same frame; the tip is never left | `Moveset.js` `SpireLand.canEnter` vs its own two `return`s | **fixed** (`spireLockout`) |
| C3 | `c.lastWallRec` written by `WallRun.enter` on every wall run, **read nowhere in `src/`** — the guard for C1, built and never connected | `Controller.js:481` / `Moveset.js:381` | **now read** |
| C4 | `probeWall`'s first rejection is fully subsumed by its second: `if (r.tag === 'ground' && abs(n.y) > wallNormalMax) return;` followed by `if (abs(n.y) > wallNormalMax) return;` | `Controller.js:831-832` | dead branch, harmless — **left alone**, it is not a behaviour bug and churning it would only add diff noise |
| C5 | `c.spireLaunch` set by `SpireLand`, cleared by `_preTimers`, **read nowhere**; likewise `c.hitWall` | `Controller.js:487, 497` | inert — **left alone** for the same reason |

`landImpact` (B5) is untouched, as directed. The proposed `landBeat` 11.0 / `landHard` 14.5
derivation still sits at the `TUNE.landBeat` declaration awaiting a playtest, and this pass gives it
one more data point rather than an answer: across 167 000 fuzz frames `land` was entered on 547 of
them against 46 667 frames of `fall`, which is the 12-in-40 coin flip §3 measured, seen in bulk.

---

## 12. Interfaces needed from modules I do not own

**None taken, one offered.** Nothing new is imported and nothing outside `src/player/` was edited.

* From **ARCHITECTURE**: the `handhold` opt specified in §10, *if and only if* someone decides the
  sustained climb is wanted. Nothing depends on it today.
* From **COLLISION**: nothing new. `rec` identity off `raycast` — which `probeWall` already
  consumes — is the whole of what the wall rule needs, and §4.6 already returns it.
* From **whoever owns `tests/`**: C1 and C2 are both cheap permanent regressions and both are
  stated here as numbers rather than as prose — "mashing jump at (−8, 0, −14) facing −z gains
  ≤ 3 m, not 17.81" and "landing on (−6, 27, −50) and holding crouch leaves the tip inside 10
  frames". Still not my directory, still would be cheap.

## 13. Provenance

**None owed, again.** No external code, no new dependency, no runtime fetch. Both constants are
derived from numbers already in `TUNE` or from the predicates they gate, and both carry that
derivation at their declaration site. Every figure in this section was measured by running the
shipped `Controller`, `Moveset`, `EgyptLevel` and `Collision` headlessly in plain Node, and every
comparison carries an arm that moves.
