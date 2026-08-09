# "Tomb Chaser" Egyptian art pack — provenance

**Licence: CC0 1.0 Universal**, a full public-domain dedication. The pack ships its own
`LICENSE.txt`, which is the verbatim Creative Commons CC0 1.0 legal code — read and confirmed, not
inferred from a repository badge. This is the cleanest licence status of any third-party content in
this project, and unlike `assets/sly-anim/` and `assets/sly-godot/` (fan works with **no stated
licence at all**) it carries no encumbrance whatsoever.

## Source — the gap below is now filled

The previous revision of this file recorded *"Source URL: not yet recorded … deliberately left blank
instead of guessed … To be filled in from the research agent's report."* That was the right call, and
here is the answer. (The reason a search for `tombchaser` found nothing: the pack is published under
the project name **"Tomb Chaser 1"** inside a multi-pack repository, so the string never appears in a
repository name.)

- **Pack:** *Tomb Chaser 1*, from the **Polygonal Mind Open Source Initiative**.
- **Fetched from:** <https://github.com/ToxSam/cc0-models-Polygonal-Mind>, path
  `projects/tomb-chaser-1` — a GLB conversion of the original FBX/Unity release.
- **Indexed by:** <https://github.com/ToxSam/open-source-3D-assets> (138★), whose registry entry
  reads `"creator_id": "Polygonal Mind"`, `"license": "CC0"`, and describes the pack as *"Egyptian
  pyramid platformer assets with sand, rocks, brick textures, and ancient gods"*.
- **Retrieved:** 2026-08-08, by `git clone --filter=blob:none --sparse` limited to that one
  directory. `LICENSE.txt` here is the upstream `License.md`, copied verbatim.

Full research context: `progress/records/RESEARCH-github-2026-08-08.md`.

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

**This is 32 of the pack's 55 models.** Not taken: `Oasis_Art` and `SandMount_Art` (~10 MB each,
terrain-scale meshes this project generates procedurally), `Layout_Floor01`–`05` (2 MB apiece level
blockouts), the `_Cut` floor duplicates, `PolygonalMindLogo_Art` and `Leaderboard_Art`, and the
per-model `*_thumbnail.png` previews. All remain available upstream if wanted.

## The textures, examined individually

Checked by opening the images, not by trusting filenames — and relevant to the palette question
raised in point 2 below, since **nine of the ten albedos measure warm** (mean R > B + 12):

- **`Bricks_Albedo.png`** — a tiling warm-orange **sandstone brick** course, mean RGB (235, 157, 82).
  The most directly reusable file in the pack for a sandstone/limestone material.
- **`Wall_Albedo.png`** — carved stone panels bearing **hieroglyph cartouches**, plus a teal
  decorative column band. A wall atlas with glyph panels, *not* a general glyph atlas — the
  project's glyph authority remains the Noto Egyptian Hieroglyphs font in `src/assets/fonts/`.
- **`Door_Albedo.png`** — winged sun-disc/scarab, red rosettes, teal feathering. Set-dressing motifs.
- **`Gods_Albedo.png`** — **flat colour bands, not detailed imagery**: the three statues are shaded
  from a palette strip. That is unusually good news for the cel path — there is no baked shading in
  the albedo to fight the ramp.
- `Obelisk_Albedo.png` — a UV atlas of obelisk parts, not a tiling surface.
- `Gems_Albedo.png` — the one cool-measuring albedo, which is correct for crystal.

All are 512×512 except `Flame&Spiderweb_Albedo.png` at 256².

**Duplication cost.** The pack embeds the *same* atlas into every GLB that uses it, so 17 MB of
models carry only 5.1 MB of distinct imagery. The `textures/` directory is that set, de-duplicated
by content hash — which is also why a material can sample these directly without loading a model.
If size becomes a problem, strip the embedded copies and repoint the materials.

## Status: staged, NOT wired in

Nothing loads these yet. Before any of it ships, three things need deciding, and none is automatic:

1. **The metallic/normal maps may be wrong for this renderer.** The cel shader replaces three's
   light loop entirely (§221), so a metalness workflow does not reach it. Normal maps on a
   flat-banded toon surface often fight the ramp rather than help it.
2. **Palette.** The EGYPT agent is concurrently re-warming the project's own texture set, which
   measured 78.8% cool. Dropping in an unexamined third-party palette mid-flight would confound
   that measurement — these must be assessed against the corrected palette, not the current one.
   (The measurements in the texture section above are offered as input to that assessment, not as a
   verdict on it.)
3. **Overlap with `assets/kaykit/` and the procedural `Kit.js`/`PropKit.js` props.** The temple's
   nave columns are procedural and are the subject geometry of the cel-banding instrument
   (`progress/records/celcyl.mjs`, §228). Replacing them with imported meshes would invalidate
   that instrument's geometric predictions. Not a reason never to do it; a reason not to do it
   quietly.
