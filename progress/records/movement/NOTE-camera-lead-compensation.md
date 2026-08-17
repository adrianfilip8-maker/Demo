# Camera lead: the full-compensation question, priced against the driven temple

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
