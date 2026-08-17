# Controls: where they stand, ranked by what a player feels in the first two minutes

Charter is "player camera **and controls** against the Godot reference". Every round so far has
been camera. This is the plain statement of the other half, for a **playtest demo** — no menus, no
upgrades, no Master Thief moves, no binocucom, no objective system.

## The headline

**Against the reference, controls are feature-complete for a demo. What is missing is delivery,
not verbs.** That is the same finding the camera work produced, arrived at independently: the
mechanics exist, are wired at both ends, and in several cases do not reach the player.

The full mechanic-by-mechanic comparison is `KNOWN_ISSUES.md` §422.1. Nothing has changed in it
except the two rows this session implemented (last-supported-stance respawn, and the consolation
impulse on a failed magnet lock). Of everything remaining in the reference and not here:

- **out of scope by the brief** — smoke bomb, mega jump, first-person/binocucom, the unlockable
  system and its L1/L2/R2 bindings, upgrades;
- **deliberately refused, with measurements** — decaying air control, two-stage gravity, the
  triple jump, dynamic walkable slope, frame-counted coyote time, the spatial jump buffer;
- **genuinely absent and minor** — a sprint modifier (theirs is `shift` → ×1.5 on the floor).

So the reference has essentially nothing left to give the demo. The list below is what a person
holding a controller would notice, and it is almost entirely about our own code.

---

## 1. Half of all landings are silent — and it is the first thing anyone will do

A player jumps within five seconds of starting. Measured on the shipped temple, every one of these
arriving well above `landBeat` 3.2 m/s:

```
  drop 0.5 m   arrival  4.51 m/s   SILENT      drop  6 m   arrival 16.09 m/s   SILENT
  drop 1.0 m   arrival  6.10 m/s   fires       drop  8 m   arrival 18.55 m/s   fires
  drop 2.5 m   arrival 10.07 m/s   fires       drop 10 m   arrival 20.98 m/s   SILENT
  drop 4.0 m   arrival 13.00 m/s   SILENT      drop 15 m   arrival 25.74 m/s   fires
```

**Silent means completely silent**: no `land` state, no `landed` event, so no sound from AUDIO, no
shake, no impact pose from ANIMATION. And it is not ordered by speed — a 4.51 m/s landing is silent
while a 25.74 m/s one fires — so a player cannot even learn the rule.

This is the `landImpact` race already documented in `Controller.TUNE`, **confirmed in substance and
corrected in description**: that note says it is decided against on any descent over ~3.6 m/s and
cites a 14 m drop landing in silence; a 15 m drop actually fires, and roughly half of all heights
do not. Pinned by `tests/recover.test.mjs` R4.

Its own note already explains why the one-line fix is not one line: correcting `landImpact` makes
*every* jump a hard landing, which forces re-deriving `landHard`. **That is a feel decision.** But
the current state is not a feel decision, it is a coin flip, and it is the single most visible
thing on this list.

## 2. Even when a landing does register, the camera does nothing about it

`land`'s framing delivers **0 %** of its boom — 0.00 m of the 0.54 m it asks for
(`NOTE-camera-lead-compensation.md`). So the ~50 % of landings that fire are, camera-side,
indistinguishable from the ~50 % that do not. Items 1 and 2 compound rather than overlap: fixing
either alone leaves landings under-read.

## 3. The wall run does not look like a wall run

Routing it correctly this session made the `wall_run` framing reachable for the first time, and its
boom still delivers **5 %** (0.13 m of 2.59 m). **The bank does not arrive either** — `_wallSide` is
0 on 121 of 121 driven frames and `_roll` is exactly 0.00000, because this level's wall runs are
head-on and the probe casts sideways (`KNOWN_ISSUES.md` §439). An earlier revision of this note said
the bank arrives at 94–106 % and that the boom was occluded; both were wrong, and the boom is cut by
3 cm. So a wall run currently reads as a plain jump: no bank, no pull-back.

## 4. There is one ground speed on a keyboard

`Move` accelerates to `runSpeed` 7.2 and nothing selects `walkSpeed` 2.6 as a mode. An analog stick
gets a genuine walk through `wishMag`; a keyboard does not, so on WASD Sly has exactly one gait
plus `sneak`. The reference solves this with a sprint modifier on top of a slower base. Minor for a
demo, and worth a line only because it is the one real verb the reference has that we lack.

## 5. Nothing on screen says what is grabbable

Every event a HUD would need is emitted and has listeners — `targetLocked`, `thiefTargets`,
`hookGrab`, `railMount`. Not audited here whether what they draw is legible in play; flagged as the
obvious first-two-minutes question this lane has not measured, because a traversal game that does
not telegraph its holds reads as a jumping puzzle with invisible walls. The camera's route
telegraph (§ route reveal) exists for exactly this and is the other half of the answer.

---

## What is deliberately not on this list

- **Anything requiring guards, cameras, objectives or upgrades.** Out of scope by the brief.
- **Retuning.** Items 1–3 all have candidate fixes and all three are feel decisions that need a
  person watching on hardware that renders. The measurements are the deliverable.
- **Porting anything.** The reference is a design reference and a source of adapted mechanics. Its
  remaining unimplemented mechanics are either out of scope or measured refusals; there is no
  round of "port the rest of the list" left to do.
