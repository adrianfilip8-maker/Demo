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
- `dungeon_texture_sandstone.png` — retinted toward sandstone for this game's palette. Hue is SET
  rather than rotated (so the pack's greys and browns land in one family), saturation scaled to 0.75
  with a 0.18 floor, value gained 1.10. Value structure is preserved deliberately, because the cel
  shader bands on luminance and a retint that flattened value would flatten the shading with it.

**Scale needs no adjustment:** `pillar` measures 1.5 × 1.5 × 4 m against this project's 1.80 m
character, i.e. the pack was authored in metres at human scale.

**Not yet placed in the world.** Installing the files is not the same as using them: putting these
in a scene is a visible change and gets captured and judged like any other, rather than landing on
assertion.
