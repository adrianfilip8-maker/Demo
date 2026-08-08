# "Tomb Chaser" Egyptian art pack — provenance

**Licence: CC0 1.0 Universal**, a full public-domain dedication. The pack ships its own
`LICENSE.txt`, which is the verbatim Creative Commons CC0 1.0 legal code — read and confirmed, not
inferred from a repository badge. This is the cleanest licence status of any third-party content in
this project, and unlike `assets/sly-anim/` and `assets/sly-godot/` (fan works with **no stated
licence at all**) it carries no encumbrance whatsoever.

**Source URL: not yet recorded.** These files were staged by the research agent, which was still
running when this note was written. A GitHub repository search for `tombchaser` and for the pack's
distinctive filenames returned nothing, so the upstream location is *unknown to me* rather than
assumed — deliberately left blank instead of guessed, since a fabricated provenance URL is worse
than an admitted gap. **To be filled in from the research agent's report.**

## What was verified here, independently of the agent that staged it

Every claim below was checked by reading the files, after §227 — where an imported asset that
reported success turned out to crash three's loader and nobody noticed because nothing had loaded
it yet.

| check | result |
|---|---|
| GLBs that parse and resolve every accessor reference | **32 / 32** |
| dangling or wrong-but-in-range accessor references | **0** (via `assertAccessorsResolved`) |
| total triangles across the pack | **14,329** |
| textures | **embedded**, no external URIs — self-contained, nothing fetched at runtime |
| generator | `Khronos glTF Blender I/O v4.0.44` |
| `asset.copyright` declared in the GLBs | none — `LICENSE.txt` is the authority |
| on-disk size | 22 MB (32 `.glb` + 27 PNGs in `textures/`) |

The pack is low-poly: 14,329 triangles across **all 32 models** averages under 450 each, which
suits a cel-shaded target — flat faces band cleanly, where dense curvature smears the terminator.

## What is in it

Egyptian deities as statuary — **Anubis, Bastet, Ra** — plus an obelisk, columns, temple arches,
three wall variants, two floor variants, embellishers, a door, podium, platform and beams, canopic
jars, a lance, gems, coins, two fire torches and a standing torch, a palm tree, a trap, and a
spiderweb. The `textures/` directory carries albedo/metallic/normal triples per material.

## Status: staged, NOT wired in

Nothing loads these yet. Before any of it ships, three things need deciding, and none is automatic:

1. **The metallic/normal maps may be wrong for this renderer.** The cel shader replaces three's
   light loop entirely (§221), so a metalness workflow does not reach it. Normal maps on a
   flat-banded toon surface often fight the ramp rather than help it.
2. **Palette.** The EGYPT agent is concurrently re-warming the project's own texture set, which
   measured 78.8% cool. Dropping in an unexamined third-party palette mid-flight would confound
   that measurement — these must be assessed against the corrected palette, not the current one.
3. **Overlap with `assets/kaykit/` and the procedural `Kit.js`/`PropKit.js` props.** The temple's
   nave columns are procedural and are the subject geometry of the cel-banding instrument
   (`progress/records/celcyl.mjs`, §228). Replacing them with imported meshes would invalidate
   that instrument's geometric predictions. Not a reason never to do it; a reason not to do it
   quietly.
