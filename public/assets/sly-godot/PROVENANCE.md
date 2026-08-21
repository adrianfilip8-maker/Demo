# Godot Sly character mesh — provenance

**Source:** <https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot>, a fan-made Godot project,
imported at the project owner's explicit instruction ("be sure to use the character model from
[that repo]").

**Licence: none stated.** The repository contains no LICENSE, no COPYING and no licence section —
checked in the tree, not assumed. It is a fan work derived from Sucker Punch / Sony's Sly Cooper.
The owner's standing instruction for this project is that copyright is not a legal obstacle here
for reasons they have not disclosed; that is their call, and it is recorded plainly here so that
nobody reading this repository has to infer the status of these files. **This is not equivalent to
`assets/kaykit/`, which carries an explicit CC0 grant.**

This directory is a *different import from a different rig* than `assets/sly-anim/`, which was
taken from the sibling repository `Sly-Cooper-A-Thief-in-Paris`. They are not interchangeable:
`sly-anim/sly-rig.glb` has **144 joints**, this one has **174**.

## Which source files these came from, and how that was established

By reading the Godot scene graph, not by guessing from filenames:

```
Scenes/Character/player__sly.tscn
  └─ Scenes/Character Mesh/sly_cooper_anims_4.tscn
       └─ Assets/Temp Imports/tempsly/SlyCooper_Anims4.gltf     ← THE MESH
       └─ material overrides (SlyCooper_Anims4.gltf.import, "materials"):
              BodyMat → Assets/Materials/New Sly Body.tres → Assets/Textures/Sly_Body.png
              HeadMat → Assets/Materials/New Sly Head.tres → Assets/Textures/Sly_Head_Paint.png
```

Two things this resolved that a filename search cannot:

1. `Assets/Models/SlyCooper_2025.bin` and `Assets/Temp Imports/slygltf.bin` are **orphans** — their
   `.gltf` siblings are not in the repository, so neither is loadable and neither is what the game
   plays. `SlyCooper_RigNoPhysics.blend1` is a Blender auto-backup.
2. There are **two different `Sly_Body.png` files**. `tempsly/Sly_Body.png` is the glTF's own URI
   target: 16-bit, 7,459,591 bytes. `Assets/Textures/Sly_Body.png` is what the Godot *material
   override* points at: 8-bit, 2,053,664 bytes. The game samples the override, so that is what was
   taken. Confirmed by size and by reading the `.import` file, not assumed.

| file | what it is |
|---|---|
| `sly-godot.glb` | the rigged mesh: 174 joints, 21 meshes, 30,346 tris, 9 morph targets |
| `sly-godot-anims.glb` | 5 authored clips — Walk, Run, Jump, CrouchingStand, UprightStand — mesh-free |
| `sly-godot-moves.glb` | 23 clips (18 movement + 5 combat/pickpocket/hook) from `Assets/Models/Characters/SlyCooper_Anims27.gltf` — see below |
| `sly-body.png` | 2048² 8-bit albedo, the material override's target |
| `sly-head.png` | 2048² 8-bit albedo (RGBA) |

Rebuild either of the first two `.glb`s with:

```
node tools/godot2rig.mjs --import --src <dir containing the four source files>
node tools/godot2rig.mjs            # measure the committed asset
```

## The movement set (`sly-godot-moves.glb`)

Imported on the same owner-instruction basis as the mesh (the standing instruction above), at the
user's playtest direction to use this repository's movement animations. Source:
**`Assets/Models/Characters/SlyCooper_Anims27.gltf`** — 24 clips, 166-joint skin. Extracted
(mesh-free, dead channels dropped and counted) by `tools/godot2clips.mjs --extract`; the same tool
retargets it onto RIG3 as `src/player/GodotClips.js`. **Nothing from `Assets/Music/` or
`Assets/Effects/` — audio is untouchable here, per the project's absolute rule.**

The 18 movement clips taken first: FrontFlip, Walk, Run, Jump, Falling, Landing, LedgeGrab,
LedgeGrab Idle, PoleGrab, PoleClimbing, PoleClimbIdle, railrun, RailrunStand, SpireJump,
SpireJumpIdle, SpireJumplanding, Crouching stand, Standupright.

**5 more added on the follow-up instruction** ("check to see if the attack and pickpocket
animations were properly ported"), §479.8: **Canehit, PickPocket, CaneSwing, CaneSwing Grab,
CaneSwing Idle** — 23 in the committed GLB. The `CaneSwing` three are in that list because reading
their scene graph showed they are *not* attacks: `CaneSwing`/`CaneSwing Idle` drive the
`swing_state` Swing BlendSpace (the hook swing) and `CaneSwing Grab` is the catch, so they serve
our hook verbs, not the combo chain. `Canehit` is their only ground attack
(`Hit Transition/hit_floor`, fired at `Scripts/player__sly.gd:640`); `PickPocket` fires on
circle-on-floor at `:607`.

Still NOT taken: **KeyAction.001** — 1 animated channel, no verb of ours to serve. That is the
whole remainder; the 24th clip of the source is accounted for.

Why Anims27 and not the files their game binds — established by reading the scene graph, and this
time by **measuring** the candidate sources against each other:

- Their tree (`sly_cooper_anims_4.tscn`) plays `Library_Sly_14` (Falling, FrontFlip, Landing — the
  `SlyCooper_Anims14.gltf` bake), `Library_Sly_19` (Walk/Run/Jump/pole/spire/rail — the Anims19
  bake) and a tscn-baked `Library Sly MASTER 006` (the LedgeGrab family). No library binds Anims27.
- Anims27 is the consolidated re-export of the SAME authored motions: FrontFlip's pelvis curve is
  byte-identical between Anims14 and Anims19, and Anims27 matches within 0.033° at the pelvis;
  the worst deviation found anywhere in a five-joint probe across FrontFlip/Walk/Run/railrun is
  0.127° (Walk, thigh.L) — export float noise, invisible.
- Its 166-vs-174-joint delta against Anims14/19 is finger control bones only (`FingerCTL_*`/
  `Index_CTL_*`/`Thumb_CTL_*` vs `f_index.03.*`), which the retarget map never touches; the shared
  skeleton's rest pose matches to 7 decimals (`spine.001` translation compared directly).
- It is the ONLY glTF in the repository carrying LedgeGrab / LedgeGrab Idle / PickPocket (their
  game plays those from the tscn-baked library; Anims27 is that family's only re-runnable source).

Delivered-speed note, measured in their scene rather than assumed: their air jump fires FrontFlip
through `TimeScale 2/scale = 0.85` (tscn default, never rewritten by any script), so THEIR
delivered flip is ≈ 0.88 s. Our alias table times it to OUR jump window instead (§474.3/§478).

Rebuild / re-measure with:

```
node tools/godot2clips.mjs --extract --src <checkout root>   # checkout → committed GLB
node tools/godot2clips.mjs                                   # report from the committed GLB
node tools/godot2clips.mjs --write src/player/GodotClips.js  # GLB → retargeted module
```

## Measured

```
sole -0.0044   crown 1.6563   height 1.6607 m
neck pinch y=1.3877 width=0.0637   head 0.2686   =>  6.18 heads
21 meshes, 30,346 tris
```

The engine's `Controller.TUNE.height` is **1.80 m**, so this mesh is 0.14 m short of the collision
capsule and needs a ×1.084 scale — or the capsule needs revisiting. That is a live decision, not a
solved one.

## What is deliberately NOT taken

- **The animation clips beyond those five.** The source has 9; four are `[Action Stash]*`, Blender's
  dump of unassigned actions.
- **The separate tail.** `SlyCooper_Anims4.gltf.import` carries
  `"PATH:metarig/Skeleton3D/Tail_LowPoly": {"import/skip_import": true}` — **Godot deletes the
  glTF's tail on import** and plays a separate `sly_tail.fbx` physics chain instead. We keep
  `Tail_LowPoly`: RIG3 has `tailA`..`tailD` with a procedural spring, which is the same idea in our
  engine, and this is the only ringed tail geometry in either repository.
- **`Assets/Textures/Sly Body Normal.png`, `Sly Body AO.png`, `Sly Head Normal.png`,
  `Sly Head AO.png`, `Sly Cane Metalic.png`** — normal, ambient-occlusion and metalness maps that
  exist in the source and were not imported. Not a judgement that they are useless; they are
  unexamined. A cel-shaded target may not want a normal map at all, but the AO could plausibly
  feed the ramp. **Open, and worth an experiment.**

## The morph targets are load-bearing

Five meshes carry blendshapes; the face (`RetopoFlow.007`) has **Angry, Smarmy, Purse, Blink,
Gasp**. Three ship with a non-zero authored weight — `Cube.014` and `Cube.007` at a full 1.0 — so
the targets cannot be stripped without changing the character's shape into something the source
game never displays. The first import emitted them with dangling accessor indices and produced a
file three's `GLTFLoader` throws on; `tests/godot.test.mjs` guards against both that and the
subtler wrong-but-in-range variant.
