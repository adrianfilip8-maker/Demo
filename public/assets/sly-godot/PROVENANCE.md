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
| `sly-body.png` | 2048² 8-bit albedo, the material override's target |
| `sly-head.png` | 2048² 8-bit albedo (RGBA) |

Rebuild either `.glb` with:

```
node tools/godot2rig.mjs --import --src <dir containing the four source files>
node tools/godot2rig.mjs            # measure the committed asset
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
