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
