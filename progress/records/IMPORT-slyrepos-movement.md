# Movement, controls and character assets from the two NoahChase Sly repositories

**Sources**
- <https://github.com/NoahChase/Sly-Cooper-A-Thief-in-Paris> (Godot, 2,157 files)
- <https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot> (Godot, 720 files)

**Licence: none stated in either repository** — checked, not assumed. Same status as the earlier
asset import; see `public/assets/sly-anim/PROVENANCE.md`, which records the owner's standing
instruction and why it is written down rather than inferred.

**What the earlier pass took** (already in the build): `sly-anims.glb` (16 clips, now retargeted into
`src/player/MixamoClips.js`), `sly-rig.glb`, `sly-cane.glb`, `sly-body.png`, `sly-head.png`.

**What it missed, and this pass takes.** The earlier pass took models. It never looked at the
*scripts*, which is where the movement and controls live — 66 GDScript files across the two repos,
including a 1,260-line player controller.

---

## 1. Newly imported assets

| file | what it is |
|---|---|
| `public/assets/sly-anim/carmelita-anims.glb` | **a second character, 199 bones, 11 clips**, 3.86 MB |
| `public/assets/sly-anim/carmelita-body.png` | 1.30 MB albedo |
| `public/assets/sly-anim/carmelita-head.png` | 0.71 MB albedo |

Clips, read off the keyframe buffers rather than trusted from their names:

```
Air 0.50s · CasualWalking 0.83s · HitTaken 0.58s · Idle 1.00s · Jump 0.58s
Lookaround 2.00s · PatrolWalk 1.00s · Run 0.50s · Run.001 0.50s
Shoot(BodyMovement) 0.58s · Shoot(GunMovement) 0.33s
```

**`PatrolWalk`, `Lookaround`, `Idle`, `HitTaken` and `Shoot` are a guard set, not a hero set.** That
is the direct answer to what our guards will need when they come off the backburner (§203): patrol
and look-around are the two clips a stealth guard cannot do without, and we have neither. Retargeting
follows the path already built for Sly — `tools/mixamo2clips.mjs`, which now costs one command and
prints its own sparse-key audit (§212.1). Not retargeted yet: guards are still deferred, and
retargeting onto RIG3 would need a second bone map (199 joints, not Mixamo's naming).

Deliberately **not** imported: everything Paris-themed. Both repos are mostly Parisian rooftops,
awnings, lamp posts, croissants and an Eiffel Tower — an Ancient Egypt level has no use for any of
it. `SlyCooper_RigNoPhysics.blend` is a Blender source with no three.js path; `.godot/imported/*` is
derived cache.

---

## 2. The mechanic we do not have: target magnetism

`player__sly.gd:1053`, whose own comment calls it *"the holy grail of magnetism"*. Grepping our
`src/player/*` for `magnet|homing|auto.?aim|targetJump|snapTarget` returns **nothing** — we have no
equivalent at any strength.

This is the defining reason Sly Cooper traversal feels the way it does, and it is not an animation or
a camera trick. It is a **level-authoring system plus a homing controller**:

- Traversal points are **authored objects** — `thief_moves_wall_notch.gd`, `pole.gd`, `hook_swing.gd`
  — each carrying an `Area3D` trigger, a `target_point`, and its own `magnet_force` and `jump_mult`.
- Entering the trigger *assigns* the player a `target`. The player then runs `TO_TARGET` state and
  homes.
- Targets are grouped `swing` / `pole` / `notch`, and the homing law differs per group.

The homing law itself, worth reading closely because the details are the feel:

| behaviour | value / rule |
|---|---|
| horizontal pull | `velocity.xz = lerp(velocity.xz, dir.xz * 4.0 * speed_mult * gravmult, 0.2)` |
| upward assist when far | `velocity.y = lerp(velocity.y, dir.y + 0.5*SPEED, 0.05/(horizDist+0.05))` — **weaker with distance** |
| upward assist when close and below | `velocity.y = lerp(velocity.y, dir.y * 8, 0.3)` — a hard yank up at the last moment |
| fall-speed clamp while homing | `velocity.y` floored at **−6.5** — you cannot fall past a target you are locked to |
| perfect snap | within **0.125 m** and at/below target height: `velocity = 0`, then lerp position with `0.2/(d+0.2)` |
| collider bypass | within **1.5 m** of a non-notch target the player's collision shape is **disabled**, so geometry cannot wedge you out of a move |
| target jump | `velocity.y += jump_mult_curve.sample_baked(clamp(velocity.y, -8, 8))` — a **curve**, not a constant, so the boost depends on how you arrived |
| release | if you fall more than 2 m below the target, emit `target_released`, drop to `AIR` |

Two of those are the non-obvious ones and are what stop it feeling like a cheat: the up-assist
*weakens* with horizontal distance (so it corrects near-misses rather than dragging you across a
room), and the collider is disabled at close range (so the assist cannot fail on a lip of geometry).

**Their tuning against ours**, for calibration — they are not the same game speed:

| | theirs | ours (`Controller.TUNE`) |
|---|---|---|
| ground speed | `SPEED = 4.0` m/s | `maxSpeed` 7.2 m/s |
| jump velocity | `JUMP_VELOCITY = 8.0` → ~2 m | `jumpV0` 11.0, `gravity` −24 → 2.52 m |
| coyote time | 5 frames (~0.083 s) | coyote + jump buffer already in `Jump.canEnter` |
| floor grace | 0.25 s | — |
| stair grace | 20 frames | — |

So their magnetism constants cannot be lifted verbatim: our character moves 1.8× faster and jumps
25% higher, and a pull tuned for 4 m/s will read as sluggish at 7.2. The **structure** transfers; the
numbers need deriving against our own speeds.

---

## 3. The tail, against critic defect #4

Three separate implementations exist across the two repos — `sly_tail_ik.gd`, `sly_tail.gd`,
`easy_tail.gd`, plus `Tail Script.gd` and a `jigglebones` addon. The most developed is
`sly_tail_ik.gd`: a **follow-the-leader chain** of 8 segments where each chases the previous one's
world transform, with the lerp factor decaying down the chain:

```
0.45 → 0.40 → 0.35 → 0.30 → 0.25 → 0.20 → 0.15 → 0.10
```

Position and rotation are both chased, position toward the *previous segment's IK node* rather than
its origin — which is what keeps segment length roughly constant without a real constraint solver.

Worth having as a comparison for our spring-driven tail. **One thing to take and one to leave:** the
decaying-follow structure is the useful part; its `lerp_shortest_rotation` lerps each Euler component
separately via `lerp_angle`, which is the exact per-component hazard measured in §212 — our engine
slerps quaternions, which is strictly better and should stay.

---

## 4. Everything else worth naming

| script | mechanic | our status |
|---|---|---|
| `hook_swing.gd` | pendulum with `damping = 0.99`, pitch clamped ±70°, basis lerped 0.2 toward the swing direction | we have `hook_swing`/`pole_swing` states and clips |
| `pole.gd` | slide along a `Curve3D` with `start_clamp 0.01` / `end_clamp 0.99` and a baked path length | we have `pole_slide`/`rail_slide` |
| `stair_detect` / `ledge_detect` | step-up and ledge grab with grace frames | we have ledge states; no stair step-up |
| `camera_smooth_follow` | follow with target framing | we have a camera module |
| `spotlight_detection.gd` | guard vision cone → detection | **backburner (§203)** |
| `motion_tracker.gd`, `enemy_walking_path.gd` | patrol routing | **backburner (§203)** |

---

## 5. What is proposed, and what is not

**Propose:** implement target magnetism as a new `src/player/Targets.js` module plus a `TO_TARGET`
state in `Moveset.js` — the structure above, with constants derived against our own speed and gravity
rather than copied. It is the one item here that adds a capability we genuinely lack, and it is the
difference between "the jump landed" and "the jump was going to land all along", which is the whole
feel of this series.

**Do not propose:** lifting GDScript. None of it runs in this engine, the repos carry no licence, and
the value is in the mechanism and the numbers, both of which are recorded above.

**Not started yet:** a capture is holding the lock (`PREREG-cel1`), and §186 forbids editing `src/**`
while one is in flight.
