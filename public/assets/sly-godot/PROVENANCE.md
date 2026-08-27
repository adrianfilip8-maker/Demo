# Godot Sly imports — provenance

*(This file began as the character mesh's record and now covers everything taken from that one
repository: the rig, its animation sets, and the clue-bottle pickup. The licence paragraph below
governs all of it.)*

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
| `bottle.glb` | the clue-bottle pickup: 190 verts, 272 tris, 3 materials, 0 images, 0 animations — see below |

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

---

# The clue bottle (`bottle.glb`)

Imported on the same owner-instruction basis as everything above — the standing instruction is
that copyright is not a legal obstacle here, **licence: none stated**, and the paragraph at the
top of this file governs this file too. Instruction for this one: *"substitute in the bottle asset
from the repo instead of the current one"*. It replaces a hand-authored lathe in
`src/world/PropKit.js` (`clueBottle()` — "dumpy glass body, cork, wax seal"), which was 147 verts
/ 198 tris. Nothing else about the twelve-bottle set changed.

**Repo HEAD taken from:** `a312a99` *("The REAL Godot 4.7 Update")*, shallow anonymous clone.

## Which file, and how that was established

By reading the scene graph, not by matching a filename — the same discipline that resolved the two
different `Sly_Body.png` above, and it mattered again here for the same reason:

```
Scenes/Design Tools/bottle.tscn
  ├─ ExtResource("1_q8b3u")  =  res://Assets/Models/Pickups/BOTTLE.glb      ← THE PICKUP
  ├─ ExtResource("1_2e5h4")  =  res://Scripts/bottle.gd                     (NOT taken — see below)
  ├─ Area3D/CollisionShape3D    SphereShape3D radius 0.625 at y 0.666
  └─ BOTTLE ROT / BOTTLE        Transform3D(scale 0.875, translate y 0.125)
       └─ AnimationPlayer       autoplay "idle" — where the motion actually lives
```

`Assets/Models/Detail Items/ParisWineBottle.glb` is a **scenery prop and is not this**; a filename
search returns both and there is nothing in the names to separate them. Nothing else in the
repository instances `BOTTLE.glb` — this is the pickup, singular.

## What the file actually contains, measured rather than described

`node tools/godot2bottle.mjs` re-prints all of this from the committed bytes:

```
10,700 bytes   glTF 2.0   Khronos glTF Blender I/O v5.0.21
1 mesh (Cube.001), 3 primitives, 190 verts / 272 tris
0 images        0 animations        0 skins
source bounds  y 0.000167 .. 0.999983   =>  height 0.999816 — a UNIT bottle, base at origin

  Glass   94 verts  152 tris   y 0.000..0.709   linear [0.00372, 0.09565, 0]        sRGB #0c5700
  Cork    80 verts  104 tris   y 0.709..1.000   linear [0.24449, 0,       0.00042]  sRGB #880001
  label   16 verts   16 tris   y 0.278..0.460   linear [0.80001, 0.46756, 0]        sRGB #e7b600
```

**Zero images is the fact that decided how this is used.** With no textures, those three
`baseColorFactor`s *are* the entire surface authoring — so importing the shape and repainting it
in our old pickup blue would have been importing half the asset. They are carried in verbatim as a
vertex-colour stream (they are linear, and three treats a colour attribute as linear working
space; converting them to sRGB on the way in would wash them out), which also keeps the twelve
bottles at **one draw call** instead of the three that three materials would have cost.

## How it is consumed

The runtime never fetches this file. `tools/godot2bottle.mjs --import` copies it here and bakes it
to `src/world/BottleMesh.js`, normalised to unit height with the base at y = 0; `PropKit.
clueBottle()` scales that to the height the level was tuned around and stays synchronous, which it
has to be because `Props` and `Pickups` both build from it. A baked module also has no asset URL,
which is the whole class of production-only fault recorded as §666. The `.glb` is committed so
these numbers can be checked against the bytes rather than believed, and so the bake is re-runnable
— the same arrangement as `sly-godot-moves.glb`, and it is registered in
`tests/bundle.test.mjs`'s unshipped-payload list for the same reason.

```
node tools/godot2bottle.mjs --import --src <checkout root>   # checkout → glb + baked module
node tools/godot2bottle.mjs                                  # measure the committed asset
```

**Scale is not inherited.** Their scene instances the mesh at `scale 0.875`, so their bottle stands
0.875 m. Ours delivers **0.43260 m** — measured off the procedural bottle it replaces, to five
decimals, so that `TUNE.clueHeight`, `TUNE.clueCollect` and `tests/cluevault.test.mjs`'s R2 magnet
all keep meaning what they meant. Both meshes are base-origin, so the pickup point does not move.
Matched on height, the imported bottle is the slimmer silhouette (±0.084 m against ±0.134 m) —
that is their design and it is the visible part of the substitution.

## What was NOT taken

- **`Scripts/bottle.gd`.** Design references and adapted mechanics only, for code. The pickup
  logic here was already ours.
- **The motion, as data.** The `.glb` has no animations; `bottle.tscn`'s AnimationPlayer holds
  them. Its numbers were read and **re-implemented** in our own loop (`Pickups.TUNE.clueRock`): a
  1.5 s cycle, `BOTTLE ROT` swinging ±0.349066 rad (±20°) about Z, the child swaying x ±0.125 and
  dipping y 0.25 → 0.20. The sway crossed over by proportion, not by copying — theirs is 1/7 of
  their bottle's height, so ours is 1/7 of 0.4326 m.
- **`Assets/Models/Detail Items/ParisWineBottle.glb`** — the scenery bottle. Named here so the
  next person does not have to re-establish that it was considered and rejected.
- **Anything under `Assets/Music/` or `Assets/Effects/`.** Untouchable, per this project's absolute
  rule; nothing in the import tool reads, decodes or references either directory. `Assets/Models/`
  is a different category and is the only one this took from.

---

## Carmelita's two albedos — 2026-08-24, repo HEAD `a312a99`

The character herself is not in this directory — she lives in `../sly-anim/`, and the full record
of that import (census, clip list, what was deliberately not taken) is in
`../sly-anim/PROVENANCE.md`'s second and third sections. This entry exists because she comes from
**this** repository, so the licence paragraph at the top of this file governs her too, and because
the method that resolved her textures is the one already written down here for Sly.

**Source repository:** <https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot>, at HEAD
`a312a997ca7d085a88b7443d754e5d3f57d66311` ("The REAL Godot 4.7 Update"). Read-only and anonymous;
nothing was pushed there.

**The update turned out to change nothing about Carmelita.** Her mesh and both textures at
`a312a99` are byte-identical to what was imported on 2026-08-08, established by hash rather than by
timestamp — `6dad373f…` for `Carmelita_Animations7.glb`, `f3fac1a6…` and `dadeef93…` for the two
PNGs. There was no new geometry, clip or texture to take.

**What was taken, and how each file was identified:**

```
Assets/Temp Imports/tempcarmelita/
  Carmelita_Animations7_CarmelitaBody_TestMaterialBody_BaseColor.png  → ../sly-anim/carmelita-body.png
  Carmelita_Animations7_CarmelitaHead_TestMaterialBody_BaseColor.png  → ../sly-anim/carmelita-head.png
```

Identified the same way this file identified Sly's two atlases — by reading the Godot importer's
material remap, not by matching filenames:

```
Carmelita_Animations7.fbx.import  "materials":
    BodyMat → uid://bnewj3kvedjat → Assets/Materials/Carmelita Body.tres → …CarmelitaBody…png
    EyeMat  → uid://4r18yagxqqq   → Assets/Materials/Carmelita Eyes.tres → …CarmelitaHead…png
    HeadMat → uid://dcdj8rdtni3ux → Assets/Materials/Carmelita Head.tres → …CarmelitaHead…png
```

That is what settles which of her 21 meshes wears which atlas — `MATERIAL_ATLAS` in
`src/ai/CarmelitaGuard.js`. §241 had recorded the split as unrecoverable offline on the grounds
that the glTF carries no `baseColorTexture`; true of the glTF, false of the repository. Both PNGs
are 2048², 8-bit, colour-type 2, checked in their headers — this file's own note about
`Sly_Body.png` existing in both 16-bit and 8-bit is why that is checked rather than assumed.

**Licence: none stated**, exactly as for everything else taken from these two repositories. The
paragraph at the top of this file is the governing statement and applies unchanged. Nothing under
`Assets/Music/` or `Assets/Effects/` was opened, copied, decoded or referenced.

---

# The NATIVE Sly import — `sly27.glb` + `sly27-clips.glb` — 2026-08-26, repo HEAD `a312a99`

Imported on the owner's instruction: *"Pull the new Sly character from the godot repo and attempt
to use it with the repos rig, textures, etc. There should be some new animations for Sly to import
and use. Use the godot repo's cane as well."* (§711)

**Licence: none stated**, exactly as for everything else taken from this repository. The paragraph
at the top of this file is the governing statement and applies unchanged. **Nothing under
`Assets/Music/` or `Assets/Effects/` was opened, copied, decoded, converted or referenced.**

**Source repository:** <https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot> at HEAD
`a312a997ca7d085a88b7443d754e5d3f57d66311` ("The REAL Godot 4.7 Update") — the **same HEAD** the
Carmelita and bottle entries above were taken at. Read-only and anonymous; nothing was pushed
there. **There was no new upstream push**: what is new here is new to *us*.

## The one source file, and what it replaces

```
Assets/Models/Characters/SlyCooper_Anims27.gltf   (+ .bin)     ← EVERYTHING below
```

This is the file `sly-godot-moves.glb` already takes its 23 clips from. What is new is that the
**mesh, the skeleton, the skin weights and the cane** are now taken from it too, instead of only
the motion. The arrangement it replaces (still shipped, still the default) is:

| | mesh + rig | clips |
|---|---|---|
| `?char=godot` (`SlyModelGodot.js`) | `Assets/Temp Imports/tempsly/SlyCooper_Anims4.gltf`, rebound to RIG3 | Anims27, **retargeted** onto RIG3 |
| `?char=sly27` (`SlyModel27.js`) | **Anims27, native** | **Anims27, native** |

So the incumbent runs Anims27 motion on an Anims4 body across a retarget layer. This takes one
file whole.

## "The new Sly character" is the SAME SCULPT — measured, not assumed

This was checked before anything was built, because the answer changes what the import is for. All
21 mesh-bearing **nodes** carry the same names in both files and both total **30,346 triangles**.
Comparing `POSITION` accessor by accessor:

- **14 of 21 are byte-identical** — every unskinned part (teeth, both eyes, hat, belt, **and the
  cane**).
- **7 differ**, and they are exactly the 7 skinned parts. The difference is a **rigid translation
  of (0.0675, 2.255, ≈−0.03)** with a max residual of 3.7 cm after removing it, compensated by the
  inverse bind matrices. Skin-space height is 1.6367 m (Anims4) against 1.6372 m (Anims27) — a
  0.5 mm difference.
- **All 21 `TEXCOORD_0` sets are byte-identical**, and every node's material assignment matches.

**What IS new** is the rig and the motion: 166 joints against 174 (Anims4's extra 18 are
`FingerCTL_*`/`Index_CTL_*`/`Thumb_CTL_*` control bones; Anims27 adds 10 `f_index.03.*`), and
**24 clips against 9** — of which four of Anims4's nine are `[Action Stash]*`, Blender's dump of
unassigned actions. Sixteen of the 24 have no counterpart in Anims4 at all.

## The cane — and a correction to §479.20

`CaneMat` is one of the four materials, and the cane is **inside the rig**:

```
metarig/…/shoulder.R/upper_arm.R/forearm.R/hand.R/CaneBone.001/Cane_LowPoly
```

Established by hierarchy and by skin binding rather than by material name:

- `Cane_LowPoly` is **not skinned** — no `skin`, no `JOINTS_0`. It is a rigid 896-triangle mesh
  **parented to a bone**.
- `CaneBone.001` **is** joint #104 of the 166-joint skin, and **zero vertices weight to it**. It is
  a prop-attachment bone, not a deformer. (`hand.R` itself is also a zero-weight joint on this rig
  — the glove is skinned to `palm01/04`, `f_index/middle/ring/pinky*` and `thumb01..03`.)
- **23 of the 24 clips animate it**, and six carry real articulation on it rather than a held
  constant: Canehit, LedgeGrab, PickPocket, PoleClimbIdle, PoleClimbing, PoleGrab.

So the cane is posed by the clip and needs no attach logic of ours. **§479.20's sentence "their rig
has no cane bone" is false of the source, and always was** — `SlyCooper_Anims4.gltf` carries the
same `CaneBone.001` under the same `hand.R`, and it is present in the committed `sly-godot.glb`
today. The true, narrower statement is that **RIG3** has no cane bone, so `godot2clips.mjs`'s bone
map had nowhere to send those channels and dropped them.

**How much articulation, in numbers (§713.2).** Re-derived by reading the `.gltf` accessors directly
rather than through `GLTFLoader`, so the retarget's own bone map cannot launder the answer. In glTF
a node's TRS is expressed in its parent's frame and `CaneBone.001` is a direct child of `hand.R`, so
its rotation channel *is* cane-relative-to-hand — no FK and no skinning are involved. Max pairwise
angle over each clip, with slide scaled to this rig's own forearm→hand bone length (0.2326):

```
Canehit         130.62°  slide 204%      PoleGrab        173.89°
PickPocket       51.35°  slide 170%      LedgeGrab        78.52°
CaneSwing         0.00°  slide   0%      PoleClimbing     35.32°
CaneSwing Grab    0.00°  slide 180%      PoleClimbIdle     9.17°
CaneSwing Idle    0.00°  slide   0%      KeyAction.001   no channel at all
```

Controls that make those numbers admissible (§418.3): `forearm.R` on the same clip reads 136.274°
(pass) and a synthetic constant quaternion reads 0.000° (fail).

**This is why no cane bone was added to RIG3** — the decision, with its reasoning, is §713.2. Our
cane is a separate prop on a per-key `cane` aim track, and the donor fill already gives every
swapped clip more cane motion than the source bone carries (163.36° vs 130.62° on the attack,
106.88° vs 51.35° on the pickpocket, and 127.98° vs **0.00°** on the hook catch). Importing these
channels would reduce the cane's motion, not restore it.

## The textures — none copied, and why that is the correct answer here

Anims27's own image URIs are an author-local path that **does not exist in the repository**:

```
Sly Cooper Character anims  July2026/…/Sly Cooper/Textures/Sly_Body.png
Sly Cooper Character anims  July2026/…/Sly Cooper/Textures/Sly_Head_Paint.png
```

and its `SlyCooper_Anims27.gltf.import` sets `materials/extract=0`, so **Godot supplies no material
override to resolve them against** — unlike `SlyCooper_Anims4.gltf.import`, whose override chain is
what identified the two atlases in the first place. Nothing in the Godot project references Anims27
at all; it is an orphan asset there.

What settles it is measurement rather than the filename: **all 21 UV sets are byte-identical to
Anims4's and every material assignment matches**, so the two atlases already committed here are
pixel-correct for this mesh. `sly27.glb` points its two images at `sly-body.png` and `sly-head.png`
by URI. Re-copying them under new names would have added 3.3 MB of duplicate bytes and could not
have been more correct than identical UVs already make them.

**Recorded because it is a live discrepancy, not a clean match.** The committed `sly-body.png` is
the same 2,053,664 bytes and the same 2048² / 8-bit / colour-type 2 header as
`Assets/Textures/Sly_Body.png` but is **not byte-identical** to it (first difference at offset 116);
`sly-head.png` is 1,807,387 bytes and **interlaced**, where `Assets/Textures/Sly_Head_Paint.png` is
1,390,444 bytes and not. Both committed files are therefore re-encoded derivatives of the source
rather than the verbatim copies `godot2rig.mjs`'s `--import` writes today. That predates this lane;
it is written down here so the next person does not spend a round rediscovering it.

Material → atlas, read off the source's own `baseColorTexture`, not typed from memory:

```
BodyMat → sly-body.png       HeadMat → sly-head.png
EyeMat  → sly-head.png       CaneMat → sly-head.png   (the cane samples the HEAD atlas)
```

`Assets/Textures/Sly Cane Metalic.png` is **not** what CaneMat points at and was not taken.

## What is emitted, and how to rebuild it

```
node tools/godot2sly27.mjs --import --src <checkout root>   # checkout → the two .glb
node tools/godot2sly27.mjs                                  # measure the committed assets
node tools/sly27fit.mjs                                     # does it fit the engine? (no renderer)
node tools/sly27shot.mjs --arm default|godot|sly27          # the frames
```

| file | what it is |
|---|---|
| `sly27.glb` | 1,591 KB — 21 mesh nodes, the 166-joint skin, 4 materials, the full node hierarchy, **0 animations**. The cane is in here. |
| `sly27-clips.glb` | 3,662 KB — the 24 clips and the node hierarchy they address, **no** meshes/skins/materials/images. |

Both are **fetched by the runtime** (`src/player/SlyModel27.js`) when `?char=sly27` is set, so they
are shipped assets in the same class as `sly-godot.glb` — not build-time inputs, and correctly
absent from `tests/bundle.test.mjs`'s `KNOWN_UNSHIPPED_PAYLOAD`.

**297 dead channels were dropped and counted** (23 translation, 14 rotation, 260 scale) — constant
AND equal to the target node's own rest TRS, so provably no-ops. That is *all* that could be
dropped: 10,168 of the source's 11,478 samplers hold two keys, but these clips bake an **absolute**
pose on nearly every joint, so a constant that differs from rest is the clip's static pose and is
load-bearing. `CaneBone.001` is the proof — every clip pins it ≈148° away from its bind rotation.
**The clip set genuinely cannot be thinned**, and 3.66 MB is what 24 clips × 166 joints costs.

## What is deliberately NOT taken

- **`KeyAction.001` is kept, not cut.** It has 1 channel and serves no verb of ours. It stays in
  the emitted file so that "24 clips" means 24 clips — a native import that silently drops a clip
  is a retarget by another name. `SlyModel27.UNUSED_CLIPS` names it.
- **`Assets/Textures/Sly Body AO/Normal.png`, `Sly Head AO/Normal.png`,
  `Sly Head Normal Inverted.png`, `Sly Cane Metalic.png`, `SlyCooper_RigNoPhysics_*`** — the same
  maps the section above already records as unexamined, plus the `RigNoPhysics` variants of both
  atlases. None is what any of the four materials points at. Still open, still unexamined.
- **The separate tail.** Unchanged from the entry above: Godot deletes the glTF's tail on import
  and plays a physics chain instead; we keep `Tail_LowPoly`.
- **Anything under `Assets/Music/` or `Assets/Effects/`** — untouchable, per this project's
  absolute rule. `tools/godot2sly27.mjs` reads one `.gltf` and one `.bin` and nothing else.

---

# §715 — the sealed animation libraries, opened, and five clips extracted

**Source:** `NoahChase/sly-cooper--a-thief-in-godot` at `a312a99` (same tree, licence NONE STATED —
the owner's standing instruction on record covers the whole reference).

The repo's `Assets/Animations/*.res` are Godot COMPRESSED resource containers (`RSCC` magic,
mode 2 = Zstd) that §714.2 proved unreadable by `strings` — the §715 lane wrote the reader
(`tools/godotlib2clips.mjs`: container decompress, then the Godot 4.3 binary-resource format,
ver 6). It is OUR code reading THEIR data — an asset importer, not a ported mechanic. The full
fourteen-library census (13 under `Assets/Animations/` + `Assets/Temp Imports/tempsly/
SlyCooper_Anims4_Anims.res`) is in `KNOWN_ISSUES.md` §715.2.

**Extracted** into `sly-godot-lib.glb` (300 KB, node hierarchy + tracks, no meshes — an OFFLINE
intermediate like `sly-godot-moves.glb`; the runtime consumes the baked `GodotLibClips.js` and
never fetches it):

| clip | from | how identified |
|---|---|---|
| `Idle Anim 1` | `Library Sly MASTER 005.res` | the 8.7 s animated standing idle (16 cm lateral weight shift; loop seam 1.4°) |
| `Idle Look` | `Library Sly Idle.res` | the 9.2 s lookout scan; loop_mode 1 authored |
| `Idle Crouch 2` | `Library Sly MASTER 005.res` | the deep crouch idle (hips −0.467 delivered — the only crouch source within 6 cm of the verb's incumbent) |
| `Walk Crouch 4` | `Library Sly MASTER 005.res` | the crouch walk with cleanly alternating contacts (R@0.34/L@0.77 of the cycle) |
| `Run 1` | `Library Sly MASTER 005.res` | the faster of the two sprint takes (4.10 m/s, stride 3.01) |

All five target the `%GeneralSkeleton` HUMANOID retarget these libraries share (none of them is
referenced by any scene or script in the reference project — authored shelf stock, never wired
into their game; their tree plays `Library_Sly_19`/`_14` + two inline libraries only). The rest
pose comes from the same library's `00 T-Pose` one-key bake; `MASTER 005` is canonical because
001 is an older generation (11 clips differ) and 002–005 differ only in `Idle Teeter` (four saves
iterating one clip — data hashes in §715.2).

**Rebuild:**

```
node tools/godotlib2clips.mjs --extract --src <checkout root>   # checkout → sly-godot-lib.glb
node tools/godotlib2clips.mjs                                   # measure the committed GLB
node tools/godotlib2clips.mjs --write src/player/GodotLibClips.js
```

**Deliberately NOT taken** (each with its §715 measurement): `Fall Glide` (prone skydive, hips
pitch 84.6° — the paraglide verb hangs under the cane), `Jump Pounce` (a forward pounce; the dive
verb plunges vertically), `RailrunStand` (both ankles float 0.46 m in clip space), `Walk Sneak
Slow`/`Walk Sneaky` (0.17 m/s creep against a 1.4 m/s verb), `Idle Air Hit` (a 4.4 s travelling
loop; `hurt` is a 0.62 s impulse), `Idle Teeter` (an about-to-fall alarm, not a calm balance),
`Cane Hit`/`Cane Hit 2` (exist — §714's existence answer is corrected in §715.2 — but the combo
binding is the owner's standing "repeats, not combos" ruling; **superseded by §716 below: the
owner's later conditional fires, both are now extracted, and `Cane Hit 2` is bound**), the four
disguise walks, the two
posture walks, `Idle Stand Carry`, the air poses (1 ms holds), and `mixamorig1_HeadTop_End` plus
all 150 finger channels (RIG3 has no such bones). Nothing under the reference's audio directories
was read, listed, or opened — the tool touches `Assets/Animations/*.res` and nothing else.

---

# §716 — the two library attacks, extracted for the cane combo

**Source:** the same `NoahChase/sly-cooper--a-thief-in-godot` checkout at `a312a99` (licence NONE
STATED — the owner's standing instruction on record covers the whole reference), read by the same
`tools/godotlib2clips.mjs` pipeline as §715. The owner's conditional — *"Add in the cane combo
only if the animations already exist for it"* — is answered YES by §715.2's census, so the two
attacks join `sly-godot-lib.glb` (now 346 KB, seven clips; the §715 five re-extract
byte-identically, verified per entry against the shipped module):

| clip | from | what it is (measured on RIG3, §716) |
|---|---|---|
| `Cane Hit 2` | `Library Sly MASTER 005.res` | 1.03 s heavy forward swing — contact t 0.375 (hand arrives at 13.5 m/s, reach 0.726 m), lunge depth −0.159, recovery 0.44 s. **Bound to `cane_combo_3`.** |
| `Cane Hit` | `Library Sly MASTER 005.res` | 1.37 s overhead roundhouse — body yaw sweeps 125°, hand crosses the front sector OVERHEAD (y 1.63 m) mid-spin; its max-forward-reach moment (t 0.971) is the unwind at 5.5 m/s, not a strike. **Baked, NOT bound** (`Run 1`'s standing): the §479.8 contact measure cannot locate a strike to hang the `cane_hit` contract on. |

Both are identical bytes in MASTER 001–005 (per-track hashes in KNOWN_ISSUES §716), so MASTER 005
is read per the census rule. NEITHER clip carries any cane/prop channel — 54 tracks each: 53
rotations + the Hips position over profile bones, fingers and the one Mixamo leaf, verified by
listing — so the shipped per-slot donor cane tracks remain the only cane articulation, by
construction rather than by preference. Both takes carry the idles' authored facing offset
(hips-yaw circular mean +67.0° / +80.4°, removed by the same `centerYaw` re-base §715.3
documents; the gaits' facing stays proven by travel). Fingers and the head-tip leaf are dropped
and counted at extract, exactly as §715's five. Nothing under the reference's audio directories
was read, listed, or opened.
