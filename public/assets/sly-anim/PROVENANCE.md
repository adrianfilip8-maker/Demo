# Sly character assets — provenance

**Source:** <https://github.com/NoahChase/Sly-Cooper-A-Thief-in-Paris> (a fan-made Godot project),
imported at the project owner's instruction along with its sibling
<https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot>.

**Licence: none stated.** Neither repository contains a LICENSE, COPYING or licence section — this
was checked, not assumed. They are fan works derived from Sucker Punch / Sony's Sly Cooper. The
owner's standing instruction for this project is that copyright is not a legal obstacle here for
reasons they have not disclosed; that is their call, and it is recorded plainly so nobody reading
this repository has to infer the status of these files. **This is not equivalent to
`assets/kaykit/`, which carries an explicit CC0 grant.**

## What was taken, and why

| file | what it is | why | where it is now |
|---|---|---|---|
| `sly-anims.glb` | **16 authored animation clips**, 1.0 MB | the reason this import happened | here — build-time input to `tools/mixamo2clips.mjs` |
| `sly-rig.glb` | rigged Sly mesh, 144 joints, 21 meshes, 31,494 tris, 10.6 MB | an alternative to the supplied FBX | **`staging/assets/sly-anim/`** |
| `sly-cane.glb` | the cane, 1,792 tris | ours is procedural | **`staging/assets/sly-anim/`** |
| `sly-body.png`, `sly-head.png` | 2048² albedo | the rig's textures | **`staging/assets/sly-anim/`** |

### Where these files live, and why some of them left

`public/` is copied into `dist/` verbatim, referenced or not, so an asset staged here without being
wired was buying download for nothing — 52% of the shipped bundle, measured (§265). Everything in
this import that **no code path and no tool names** has moved to `staging/assets/sly-anim/`, which
git keeps and Vite does not copy. Nothing was deleted, and `tests/bundle.test.mjs` asserts each
moved file is absent here and present there so the two cannot be confused.

What stayed, and why:

- `carmelita-guard.glb` — fetched at runtime by `src/ai/CarmelitaGuard.js`.
- `sly-anims.glb`, `carmelita-anims.glb` — **build-time inputs**, read at these exact paths by
  `tools/mixamo2clips.mjs`, `tools/carmelita2clips.mjs` and `tools/carmelita2guard.mjs`, with
  `tests/carmguard.test.mjs` asserting one of them is present so the tool can be re-run. They ship
  today and should not; moving them is a four-file change across other people's live work, which
  is a decision with an owner rather than part of a sweep. They stay on the register meanwhile.

The staged copies carry their own `staging/assets/sly-anim/PROVENANCE.md`, which points back here
for the full record. **The licence position is unchanged by the move: none stated.**

### The clips are the find

`sly-anims.glb` carries sixteen clips with real motion, verified by reading their keyframe buffers
rather than their names:

```
idle_01          5.87s  176 keys      jump_from_ground  0.87s   26 keys  (4.18 m forward)
idle_other       6.70s  201 keys      pole_up           2.43s   73 keys  (1.53 m up)
idle_side        2.30s   69 keys      hang_crawl_left   1.40s   42 keys
walk_forward     1.70s   51 keys      hang_crawl_right  1.43s   43 keys
walk_forward_02  0.93s   28 keys      hang_loose        4.73s  142 keys
walk_side_left   1.17s   35 keys      airtime_01        1.10s   33 keys
walk_side_right  1.17s   35 keys      fall_pose_01/02   static poses, 2 keys each
```

That is the complete Sly traversal vocabulary — idle, walk, run, jump, fall, hang, ledge-crawl,
pole-climb — and this project's character currently has **procedural animation only**.

### Why they are usable, which was not obvious

The clips share **zero joint names** with `sly-rig.glb` (144 joints vs 41). That looks like a
mismatch and is the opposite: the clips are authored on a **standard Mixamo humanoid**
(`mixamorig:Hips`, `mixamorig:LeftForeArm`, `mixamorig:LeftUpLeg`, …), not on the art rig.

Mixamo naming is an industry convention and maps one-to-one onto this project's `RIG3`:

```
hips ← Hips          shoulderL ← LeftShoulder     upperLegL ← LeftUpLeg
spine ← Spine1       upperArmL ← LeftArm          lowerLegL ← LeftLeg
chest ← Spine2       lowerArmL ← LeftForeArm      footL     ← LeftFoot
neck ← Neck          handL     ← LeftHand         toeL      ← LeftToeBase
head ← Head
```

So **their rig is not needed at all.** The clips can drive the skeleton this project already ships,
under the mesh it already ships, which makes this a far smaller and safer change than the 117-bone
FBX retarget in `SlyModelDLRig.js` — that one had to invent a bone correspondence; this one is given.

**What Mixamo does not have is a tail.** Sly's tail (`tailA`–`tailD`) has no counterpart in a
humanoid rig, so tail motion stays on the existing procedural spring chain, layered over the clip.
The same applies to the cane.

## What was deliberately NOT taken

Both repositories are overwhelmingly **Parisian**: `paris_block_*`, `paris_church`, Eiffel Tower,
balconies, awnings, Tabac signs, croissants, wine bottles, café chairs, and modern/vintage street
lamps — roughly 190 building and prop models across the two.

None of it is imported, for the same reason §206 kept the KayKit *architecture* out: this is an
Ancient Egypt temple, and Haussmann rooftops read as a different game no matter how they are
retinted. The sibling repo's animation libraries (`Library Sly *.res`) are also skipped — they are
Godot's own resource format, not usable outside Godot, and `sly-anims.glb` already carries the
motion in a portable one.

---

## Second import — 2026-08-08: Carmelita, and why the first pass missed her

Same two repositories, same licence status (**none stated in either**; see above). Taken at the
owner's instruction to import "character models, rigs, animations, movements, controls, and anything
else that may be usable".

| file | what it is | where it is now |
|---|---|---|
| `carmelita-anims.glb` | **a second character — 199 bones, 11 clips**, 3.86 MB | here — build-time input to `carmelita2clips` / `carmelita2guard` |
| `carmelita-body.png` | 1.30 MB albedo | **`staging/assets/sly-anim/`** — `carmelita-guard.glb` embeds its own images, so these loose copies are fetched by nothing |
| `carmelita-head.png` | 0.71 MB albedo | **`staging/assets/sly-anim/`** |

Source path: `Sly-Cooper--A-Thief-in-Godot/Assets/Temp Imports/tempcarmelita/`.

Clips, read off the keyframe buffers rather than trusted from their names:

```
Air 0.50s · CasualWalking 0.83s · HitTaken 0.58s · Idle 1.00s · Jump 0.58s
Lookaround 2.00s · PatrolWalk 1.00s · Run 0.50s · Run.001 0.50s
Shoot(BodyMovement) 0.58s · Shoot(GunMovement) 0.33s
```

**This is a guard set, not a hero set.** `PatrolWalk` and `Lookaround` are the two clips a stealth
guard cannot do without and we have neither. Not retargeted yet — guards are deferred (§203), and
199 joints need a second bone map, not Mixamo's naming.

The first pass missed this because it searched for *models* and stopped once it found Sly's. It never
read the 66 GDScript files, which is where the movement and control systems live — see
`progress/records/IMPORT-slyrepos-movement.md` for that half, including the target-magnetism system
this project has no equivalent of.

Nothing Paris-themed was taken. Both repos are largely Parisian rooftops, awnings, lamp posts and an
Eiffel Tower; an Ancient Egypt level has no use for any of it.
