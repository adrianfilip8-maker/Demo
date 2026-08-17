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

## Known limits of this instrument, stated rather than discovered later

- **The camera is a passive observer.** In the game its yaw decides what "forward" means, so a
  camera change perturbs the trajectory. One recorded trajectory replayed under both modes is what
  isolates the framing question; the feedback path is real and excluded by construction.
- **The recorded routes are scripted, not played.** They are the shipped moveset on real geometry,
  which is a strictly better instrument than a stub player and a strictly worse one than a human.
- **`hook_swing`, `balance`, `rail_slide`, `spire`, `combat` and `ledge_hang` are unpriced here.**
  Five of those six are attach framings whose driven routes end in geometry that dominates the
  shot; the sixth has never been observed in play at all.
