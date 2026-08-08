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

| file | what it is | why |
|---|---|---|
| `sly-anims.glb` | **16 authored animation clips**, 1.0 MB | the reason this import happened |
| `sly-rig.glb` | rigged Sly mesh, 144 joints, 21 meshes, 31,494 tris, 10.6 MB | an alternative to the supplied FBX |
| `sly-cane.glb` | the cane, 1,792 tris | ours is procedural |
| `sly-body.png`, `sly-head.png` | 2048² albedo | the rig's textures |

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
