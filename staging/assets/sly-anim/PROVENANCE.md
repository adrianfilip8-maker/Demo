# Sly / Carmelita character assets — staged, not shipped

These files came from the same import as `public/assets/sly-anim/`, and **the full record lives
there**: `public/assets/sly-anim/PROVENANCE.md` — source repositories, what was taken, what was
verified by reading keyframe buffers rather than clip names, and the licence position.

**Licence: none stated**, same as the rest of that import. Neither source repository contains a
LICENSE, COPYING or licence section; that was checked, not assumed. They are fan works derived
from Sucker Punch / Sony's Sly Cooper. The owner's standing instruction is that copyright is not a
legal obstacle here for reasons they have not disclosed. This is **not** equivalent to
`public/assets/kaykit/`, which carries an explicit CC0 grant.

They are here rather than in `public/` because nothing in `src/` and no tool names them, so
shipping them bought nothing (§265). Nothing was deleted; see `staging/README.md`.

| file | what it is | why it is not shipped |
|---|---|---|
| `sly-rig.glb` | rigged Sly mesh, 144 joints, 21 meshes, 31,494 tris, 10.6 MB | the build ships the DL rig; this was the alternative that was not taken |
| `sly-body.png`, `sly-head.png` | 2048² albedos for that rig | unused with the rig unused. `sly-body.png` is 16-bit RGB, which `tools/png.mjs` could not read at all until it learned bit depth 16 |
| `carmelita-body.png`, `carmelita-head.png` | 2048² albedos, 1.30 MB and 0.71 MB | `carmelita-guard.glb` (still shipped) carries its own images embedded; these loose copies are fetched by nothing |
| `sly-cane.glb` | the Godot project's cane, 1,792 tris | ours is procedural |

What **stayed** in `public/assets/sly-anim/`, and why:

- `carmelita-guard.glb` — fetched at runtime by `src/ai/CarmelitaGuard.js`.
- `sly-anims.glb`, `carmelita-anims.glb` — build-time inputs. `tools/mixamo2clips.mjs`,
  `tools/carmelita2clips.mjs` and `tools/carmelita2guard.mjs` read them at that path, and
  `tests/carmguard.test.mjs` asserts one of them is there so the tool can be re-run. They ship
  today and should not; moving them means editing those four files, which is a decision with an
  owner rather than part of a sweep.
