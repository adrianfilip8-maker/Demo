# `staging/` — imported assets that are kept but not shipped

`public/` meant two different things to two audiences, and that cost 52% of the bundle (§265).

To this project it had become a **staging area**: an imported asset landed there with its
`PROVENANCE.md` while somebody decided whether to use it. To Vite it is the **verbatim-copy
directory** — every byte in it is copied into `dist/`, referenced or not. So every careful decision
to stage an asset *without* wiring it quietly added megabytes to the download. `npm run build` was
producing 104 MB of which 54 MB no code path ever requested.

This directory is the staging area, made explicit. Git keeps it; Vite does not copy it, because
Vite copies `publicDir` and `publicDir` is `public/`.

**Nothing here was deleted, and nothing here is unreachable.** `tests/bundle.test.mjs` pins every
moved file in both directions — absent from `public/`, present here — so that "moved" and "deleted"
cannot be confused, and moving one back is noticed.

## The rule for what may live here

An asset may leave `public/` when **no code path and no tool names it**. That is deliberately
stricter than "the runtime does not fetch it": the three build-time animation inputs
(`sly-anims.glb`, `carmelita-anims.glb`, `sly-godot-anims.glb`) are not fetched at runtime either,
but `tools/mixamo2clips.mjs`, `tools/carmelita2clips.mjs`, `tools/carmelita2guard.mjs`,
`tools/godot2rig.mjs` and `tests/carmguard.test.mjs` all name them at their current paths. Moving
those is a change across several other files and belongs to whoever owns them, not to a sweep.

## What is here

| path | size | why it is not shipped |
|---|---|---|
| `assets/tombchaser/` | 21.1 MB | CC0 Egyptian art pack, staged whole and wired to nothing — its normal and metallic maps may fight the cel ramp, and that judgement is still open |
| `assets/sly-anim/sly-rig.glb` | 10.1 MB | rigged Sly mesh; the build uses the DL rig instead |
| `assets/audio/museum-of-natural-history.mp3` | 6.6 MB | not in `STEM_FILES`; nothing can name it |
| `assets/sly-anim/*.png` | 4.7 MB | the Godot rig's albedos, used by nothing in the build |
| `assets/sly-cane/` | 0.7 MB | owner-supplied cane, staged unwired on purpose. **Licence UNKNOWN** — see its own `PROVENANCE.md` |
| `assets/sly-anim/sly-cane.glb` | 49 KB | the Godot project's cane; ours is procedural |
| `assets/audio/footstep.mp3` | 12 KB | nothing references it; footsteps are synthesised |

Every directory keeps the `PROVENANCE.md` that describes it. Where a record was split — `sly-anim/`
and `audio/` each had some files move and some stay — the record in `public/` says what left and
the record here says where it came from, so the trail works from either end. That is asserted, not
hoped: `tests/bundle.test.mjs` fails if a moved asset has no reachable provenance record, or if the
record left behind still describes it as though it were there.

## Putting one back

Move it into the mirrored path under `public/assets/`, wire it, and delete its line from
`MOVED_OUT_OF_PUBLIC` in `tests/bundle.test.mjs`. If you put it back **without** wiring it, add it
to `KNOWN_UNSHIPPED_PAYLOAD` instead and accept that it ships.
