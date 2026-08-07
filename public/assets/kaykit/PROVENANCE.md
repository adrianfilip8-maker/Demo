# KayKit Dungeon Asset Pack — provenance

**Source:** KayKit : Dungeon Asset Pack (1.1), created and distributed by Kay Lousberg,
<https://www.kaylousberg.com>.

**Licence: Creative Commons Zero (CC0 1.0)** — <http://creativecommons.org/publicdomain/zero/1.0/>.
The pack's own licence file, kept verbatim beside this note as `LICENSE.txt`, states: *"This content
is free to use in personal, educational and commercial projects."* Crediting Kay Lousberg is
explicitly **not mandatory**; this file exists anyway, because a project that ships should be able
to say where every asset came from without relying on someone's memory.

**What was taken:** 58 of the pack's 211 models, chosen for an Ancient-Egypt temple setting —
pillars, columns, arched/broken/cracked walls, corners, doorways, stairs, stone floor tiles and
foundations, torches, candles, barrels and crates (as urn and vessel stand-ins), chests, coin stacks
and rubble. Deliberately excluded: 42 banners, wooden floors and stairs, dirt tiles, and everything
else that reads medieval-European rather than desert.

**Why `public/` and not `src/assets/`:** each `.gltf` references its `.bin` buffer and the shared
texture by RELATIVE URI (`pillar.bin`, `dungeon_texture.png`). Vite hashes files imported through
`src/`, which would break those references; `public/` is copied verbatim with paths intact. The
build stays self-contained — everything is served from the app's own origin and nothing is fetched
from an external host.

**One shared atlas.** All 58 models sample a single 1024² texture, so the whole set costs one
texture and one material. Two variants are installed:

- `dungeon_texture.png` — the pack as shipped: dungeon grey stone and warm brown wood.
- `dungeon_texture_sandstone.png` — retinted toward sandstone for this game's palette, **generated
  by `tools/kaykit-retint.mjs`**, which is the authority on the recipe. Run it to reproduce the file;
  run it with `--check` to print the numbers below without writing anything.

  Saturation is `0.42 + 0.30 s` and hue is set toward sandstone with a blend weight that rises with
  the texel's ORIGINAL saturation, so near-grey stone (whose hue is meaningless) is set outright
  while vivid texels keep 35 % of their own and gold still reads as gold. Value is gained only 1.06:
  the cel shader bands on luminance, so a retint that flattened value would flatten the shading
  with it.

  **The first version of this recipe was backwards, and the paragraph that used to sit here
  described it approvingly.** It scaled saturation to 0.75 with a 0.18 floor. The architecture
  texels — `wall_arched` and `stairs` sample only u[0.037, 0.215] × v[0.006, 0.214], the atlas's
  top-left corner, which is near-neutral blue-grey at saturation 0.110 — fell under that floor and
  came out at it, while the already-vivid props were scaled *down* from 0.610 to 0.459. Rendered,
  the walls and stairs sat at median (R−B) +2 against this level's own stone at +45 in the same
  shade. Recorded here because installing an asset and colour-matching it are separate jobs, and
  the note claiming the second was done was written before anything had been rendered.

  | patch | pack | old recipe | current recipe | this level's stone |
  |---|---|---|---|---|
  | architecture, median (R−B) | −12 | ≈ 0 | **+51** | +38…+45 |
  | architecture, median sat | 0.110 | 0.182 | **0.453** | 0.50…0.55 |
  | props, median sat | 0.610 | 0.459 | **0.604** | — |

**Scale needs no adjustment:** `pillar` measures 1.5 × 1.5 × 4 m against this project's 1.80 m
character, i.e. the pack was authored in metres at human scale.

**Not yet placed in the world.** Installing the files is not the same as using them: putting these
in a scene is a visible change and gets captured and judged like any other, rather than landing on
assertion.
