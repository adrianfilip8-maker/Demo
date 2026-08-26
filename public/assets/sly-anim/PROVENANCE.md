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
| `Carmelita_Animations7.fbx` | the master, 16.9 MB | **not copied.** Read in place from the read-only clone for §702's head recovery only; `carmelita-head-lp.glb` is what came back | — |

### Where these files live, and why some of them left

`public/` is copied into `dist/` verbatim, referenced or not, so an asset staged here without being
wired was buying download for nothing — 52% of the shipped bundle, measured (§265). Everything in
this import that **no code path and no tool names** has moved to `staging/assets/sly-anim/`, which
git keeps and Vite does not copy. Nothing was deleted, and `tests/bundle.test.mjs` asserts each
moved file is absent here and present there so the two cannot be confused.

What stayed, and why:

- `carmelita-guard.glb` — fetched at runtime by `src/ai/CarmelitaGuard.js` **and** by
  `src/ai/CarmelitaNative.js` (§704). Both arms read the same body; they differ only in what
  drives its bones.
- `carmelita-clips.glb` — **new in §704**, 1.70 MB, fetched at runtime by
  `src/ai/CarmelitaNative.js`. Her eleven animations and the 199-joint node hierarchy they
  address, cut out of `carmelita-anims.glb` by `tools/carmelita2native.mjs` with every mesh, skin,
  material, texture and image dropped — 56% smaller than the scene it came from. It is the exact
  inverse of `tools/carmelita2guard.mjs`, which keeps the meshes and drops the animations, so the
  two products cover the source with **no overlap**: neither carries a byte the other has.

  Nothing in it is retargeted. The channels are copied byte-for-byte and addressed by the source's
  own node names. One source defect is corrected rather than propagated:
  `Shoot(BodyMovement)` ships **1,194 channels for 597 distinct node/path pairs** — every channel
  twice — and which duplicate wins in `AnimationMixer` is an ordering accident, so they are
  collapsed and the count is reported.
- `sly-anims.glb`, `carmelita-anims.glb` — **build-time inputs**, read at these exact paths by
  `tools/mixamo2clips.mjs`, `tools/carmelita2clips.mjs`, `tools/carmelita2guard.mjs` and
  `tools/carmelita2native.mjs`, with `tests/carmguard.test.mjs` asserting one of them is present so
  the tool can be re-run. They ship today and should not; moving them is a four-file change across
  other people's live work, which is a decision with an owner rather than part of a sweep. They
  stay on the register meanwhile.

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
| `carmelita-body.png` | 1.30 MB albedo | ~~`staging/`, fetched by nothing~~ — **also here now, and sampled**; see the third import below |
| `carmelita-head.png` | 0.71 MB albedo | ~~`staging/`, fetched by nothing~~ — **also here now, and sampled**; see the third import below |

> **Correction (2026-08-24).** The reason given above for parking the two albedos in `staging/` —
> "`carmelita-guard.glb` embeds its own images" — is **false**, and was checked this time rather
> than assumed: the shipped GLB contains **0 images and 0 textures**, and all six of its materials
> carry no `baseColorTexture` at all. Nothing was ever sampling them. That is corrected below.

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

---

## Third import — 2026-08-24: her two albedos, and the atlas split that was never a guess

Prompted by the owner reporting the source repository as updated and asking to import "any relevant
files from the scripts, scenes, and assets folders about Carmelita". Two findings, in the order
they matter.

**1. The update changed nothing about Carmelita.** The repository is now at HEAD `a312a99` ("The
REAL Godot 4.7 Update"). Every Carmelita file in it is byte-identical to what was imported on
2026-08-08 — checked by hash, not by date or size:

```
6dad373fccebbdbf171cb5c10cee37d9  Assets/Temp Imports/tempcarmelita/Carmelita_Animations7.glb
6dad373fccebbdbf171cb5c10cee37d9  public/assets/sly-anim/carmelita-anims.glb
f3fac1a6bf8b29922631934448771da2  ..._CarmelitaBody_TestMaterialBody_BaseColor.png   → carmelita-body.png
dadeef93231629e47ef11dfa0d78bfaa  ..._CarmelitaHead_TestMaterialBody_BaseColor.png   → carmelita-head.png
```

So there was no new mesh, no new clip and no new texture to take. (The clone is shallow — one
commit — so this was established against the *files*, which is the stronger check anyway.)
`Assets/Models/Vehicles/helicopter-carmelita*.glb` is a vehicle, not the character, and is not here.

**2. What WAS missing: the two albedos, and which mesh wears which.** They are 2048², 8-bit,
colour-type 2 (no alpha) — checked in the PNG headers, because the sibling Sly import had a
16-bit/8-bit trap. They are now `carmelita-body.png` and `carmelita-head.png` **in this
directory**, fetched by `src/ai/CarmelitaGuard.js`'s `CARMELITA_TEX` at relative URLs.

`CarmelitaGuard.js` and §241 both recorded the head/body split as *unverified and unrecoverable
offline*, on the grounds that the glTF carries no `baseColorTexture`. That was true of the glTF and
false of the repository. The record lives one file up, in the Godot importer — which is exactly
where `sly-godot/PROVENANCE.md` had already read **Sly's** two atlases from. The same method,
applied to Carmelita:

```
Assets/Temp Imports/tempcarmelita/Carmelita_Animations7.fbx.import   "materials":
    BodyMat → uid://bnewj3kvedjat → Assets/Materials/Carmelita Body.tres → ..._CarmelitaBody_...png
    EyeMat  → uid://4r18yagxqqq   → Assets/Materials/Carmelita Eyes.tres → ..._CarmelitaHead_...png
    HeadMat → uid://dcdj8rdtni3ux → Assets/Materials/Carmelita Head.tres → ..._CarmelitaHead_...png
```

The discriminator is therefore the **source material**, not the node name. The retired node-name
guess was wrong where it counted: it put `BustRetopo` — 1,768 triangles of chest, and `BodyMat` —
on the *head* atlas on the strength of the word "Bust".

| group | meshes | from |
|---|---|---|
| body (`carmelita-body.png`) | Buckles.002, BustRetopo, Collar, Badge_Loop, Zip, Antennae.003, Barrel, Coat, Hand, Legs, MainBody, Shoes, Tail | `BodyMat`, remapped |
| head (`carmelita-head.png`) | Hair_LP, Scrunchy2, Head_LP, Irises, Eyeshine_001_L | `HeadMat` / `EyeMat`, remapped |
| body, **by fallback** | Stomach_LP, TeethUpper_LowPoly, Tongue_LowPoly | `OH_Outline_Material`, `OutlineMat.001`, `TestMaterialBody.001` — **not remapped by the source**, so neither atlas is theirs; they render as flat colours in Godot. 1,440 of 29,791 tris, all under the coat or inside the mouth. Grouped with body, and that choice is arbitrary within this stated bound. |

**3. The mesh census, re-run and unchanged.** `tools/carmelita2guard.mjs` keeps 21 skinned meshes
(29,791 tris) and drops 13 (7,260 tris) — `Arrow`, `Circle`, `Cube`, `IKPolehandle`, `singlecircle`,
`Starcircle`, `Handrot`, `HandCurlCTL`, `BézierCircle` and four `Text*`. The rule is *no skin and no
material*, asserted rather than listed, which is why it is not fooled by `Stomach_LP` and
`TeethUpper_LowPoly` wearing outline-shaped material names while being real body parts. The source
scene corroborates the drop independently: `Scenes/Character Mesh/carmelita_animations_7.tscn` sets
`visible = false` on all four `Text*` nodes.

**4. Not taken, deliberately.** `Scripts/carmelita_mesh.gd` was read for intent and not ported — it
is an `AnimationTree` state router plus a distance-based mesh rescale, and this project routes guard
state through `Patrol.js` already. Her behaviour wiring (`enemy_carmelita.tscn`,
`enemy_base_flashlight.gd`, `spotlight_detection.tscn`, `gun.tscn`) is out of scope: the existing
guard AI stays and only what the guard is *made of* changed. Nothing under `Assets/Music/` or
`Assets/Effects/` was opened, copied, decoded or referenced.

**5. §704 — the animations, taken as authored.** `carmelita-clips.glb` adds her eleven clips to the
runtime for the first time. Everything above still holds: the source was read from the read-only
clone at `a312a99`, nothing was downloaded, nothing was decoded from a format the source did not
already ship, and **nothing under `Assets/Music/` or `Assets/Effects/` was opened, copied, decoded
or referenced** (§364.3). `Scripts/carmelita_mesh.gd`'s `AnimationTree` router is still not ported
— §704 maps her clips onto guard states in `CLIP_FOR`, which is this project's own table over the
existing `Patrol.js` AI, not a transcription of hers.

One thing §704 measured that this file previously got wrong by omission: **six of her eleven clips
are two-handed weapon stances**, and the `ShockPistol` armature — dropped by the RIG3 rebind as an
unattached prop — is animated into her hands by those same clips. The gun is part of the authored
motion, not scene furniture beside it. It is still not drawn, on a triangle-budget ground recorded
in §704.5, and `gun.tscn` is still not ported.

**Licence: unchanged and still none stated** — the governing paragraph is in
`../sly-godot/PROVENANCE.md` and covers these files too.

---

## Fourth import — 2026-08-24: her FACE, which no glTF in that project has ever contained

Prompted by the owner, playing the deployed build: *"The Carmelita sculpt seems to be off and the
head seems to be missing."* Both halves were real and they had different causes; the ledger entry
is **KNOWN_ISSUES §702**. Only the second half is an import, and it is this.

**`Head_LP` — muzzle, nose, eyes, cheeks, ears — reaches us with 32 triangles.** Its index buffer
is 96 elements long and references 64 of its 3,040 vertices. The vertex cloud is intact and spans
the whole head; only the connectivity was lost, which is why every structural check in
`tests/carmguard.test.mjs` passed for sixteen days while 99.4% of the face went undrawn. What
reached the screen was a patch 0.150 × 0.068 × 0.062 m in the middle of her face.

It is upstream and it is not a mistake of ours. **The same mesh is 5,000 triangles in that
project's own `Carmelita_Animations7.fbx`**, and every other mesh in the scene matches the FBX
exactly:

```
Hair_LP 9528 = 9528   Coat 3188 = 3188   Hand 4606 = 4606   BustRetopo 1768 = 1768   Shoes 1076 = 1076
Head_LP    32 ≠ 5000
```

Both of that project's glTF exports carry the broken head — `Carmelita_Animations7.glb` keeps the
3,040-vertex cloud with a 96-element index, `Carmelita_Animations7.gltf` keeps only 48 vertices.
So the third import's hash check above, which correctly proved the `.glb` had not changed, was
comparing two copies of the same broken export. **The answer was one file up again**, which is now
the third time that has been true in this import (material overrides in the `.import` sidecar,
twice; the mesh itself in the `.fbx`, once).

| file | what it is | why | where it is now |
|---|---|---|---|
| `carmelita-head-lp.glb` | `Head_LP` at its authored 5,000 triangles, 15,000 vertices, 851 kB | the face | **here** — fetched by `CarmelitaGuard.CARMELITA_HEAD`, spliced by `spliceHead()` |
| `Carmelita_Animations7.fbx` | 16.9 MB, the authoring export | where the head came from | **not committed** — a development-time input only (AGENTS.md §1.1) |

### Why the spliced head is provably the same head

`tools/carmhead.mjs` refuses to write unless all three hold, and they are re-checked in the suite
from committed bytes so nobody needs the 16.9 MB FBX to believe this:

```
both skins list the same 199 bones in the same ORDER    199/199   → skinIndex transfers unremapped
every bind position agrees after the exact ×100 cm      max 0.0000003 m
the 64 SURVIVING vertices are a fiducial                64/64 position at distance 0
                                                        64/64 UV, under (u, 1−v)
                                                        64/64 dominant bone
```

The fiducial is the whole argument: a head taken from the wrong asset, the wrong scale, the wrong
axis convention or the wrong UV flip each fail it. It is shown able to reject — a head displaced by
1 cm matches 0 of 64. The single convention difference between the two exports is the UV v-axis,
and it is *derived* from the fiducial rather than declared: 0.2705 + 0.7295 = 1.0000 exactly, on
every one of the 64.

### What was NOT taken

- **The four morph targets** — `Ugh`, `Grr`, `Blink`, `Key 4`. This pipeline drops morph
  attributes, so the recovered face does not blink. On the register, not wired.
- **The shock pistol.** `MainBody`, `Barrel` and `Antennae.003` are 100% weighted to the
  `ShockPistol` armature root, a **sibling** of the body root `Bone001` rather than a descendant.
  The source parks the gun 0.86 m to her side and 0.9 m behind her, and a correct bind puts it
  back there — floating in mid-air beside every guard. Dropped by that structural rule, not by
  name; `Legs`, which carries 3.6% on the `Hips_Center` helper root, is kept.
- **Nothing under `Assets/Music/` or `Assets/Effects/`** was opened, copied, decoded or
  referenced. Unchanged from the previous three imports.

### One correction to the third import's own table, above

That table's last row calls `Stomach_LP`, `TeethUpper_LowPoly` and `Tongue_LowPoly` "all under the
coat or inside the mouth". That sentence was written from the node names and the material remap and
was never measured. `tools/carminterior.mjs` measures it — 14 rays per sampled vertex, counting how
many escape the body:

```
Tongue_LowPoly 100.0%   TeethUpper_LowPoly 99.8%      ← sealed; dropped for the triangle budget
Stomach_LP      80.8%   vs Collar 90.9%, Badge_Loop 81.6%, BustRetopo 81.2%  — all worn; KEPT
```

Two of the three are sealed. The third is not, and it stays. The sentence is left standing above
with this correction attached rather than rewritten, because it is what was believed then.

**Licence: unchanged and still none stated** — the governing paragraph is in
`../sly-godot/PROVENANCE.md` and covers `carmelita-head-lp.glb` exactly as it covers the rest.
