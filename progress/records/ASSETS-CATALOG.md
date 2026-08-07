# Downloadable assets reachable from this workspace — catalogue and licence findings

Surveyed 2026-08-07. **Every URL below was fetched and returned HTTP 200.** Recorded because the
reachable surface is narrow and non-obvious, and re-deriving it costs an hour.

## The reachable surface

Every dedicated asset host is blocked by the egress proxy — Poly Haven, ambientCG, cc0textures,
OpenGameArt, Kenney, freePBR, Sketchfab, models-resource, DeviantArt, archive.org, huggingface,
jsDelivr. So is the GitHub **API** and `github.com` HTML (403).

What works: **`git clone --filter=blob:none`** (full tree listing, no blob download) to enumerate,
then **`raw.githubusercontent.com`** to fetch. Plus `registry.npmjs.org`, which bypasses the proxy
entirely. That is the whole search space: assets living in a GitHub repo or an npm package.

## Clean licences — safe to ship

| asset | what | licence, and where it is stated |
|---|---|---|
| **KayKit Dungeon Remastered** — `KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0`, path `addons/kaykit_dungeon_remastered/Assets/gltf/` | 198 stylised low-poly GLBs, 20–100 KB each: `pillar`, `pillar_decorated`, `column`, `torch_lit`, `torch_mounted`, `wall_arched`, `wall_broken`, `stairs*`, `floor_tile_*`, `chest_gold`, `barrel_large`, `candle_*`, banners | **CC0 1.0**, `LICENSE.txt`, explicit: *"free to use in personal, educational and commercial projects"* — the cleanest grant found |
| **Noto Sans Egyptian Hieroglyphs** — `google/fonts/main/ofl/notosansegyptianhieroglyphs/` | 1,071 vector hieroglyphs, full U+13000 block, 1.0 MB TTF | **SIL OFL 1.1**, `OFL.txt` alongside |
| **Khronos CC0 props** — `KhronosGroup/glTF-Sample-Assets/main/Models/` | `Lantern` (9.3 MB, brazier), `GlassVaseFlowers` (1.8 MB, urn), `ScatteringSkull` (8.8 MB), `SheenCloth` (linen reference, glTF only) | **CC0**, per-model `README.md`. Of 148 models: 81 CC0, 53 CC BY 4.0, 1 CryEngine, 1 CC BY-NC-SA |
| **`three.js/examples/textures/decal/decal-diffuse.png`** | 512², 61 KB | **CC0 1.0**, `decal/LICENSE.TXT` — the only clean licence in that whole tree |

## Attribution required

- **BabylonJS/Assets** (`master/textures/`) — **CC BY 4.0**, repo-root `LICENSE`.
  `rockyGround_{basecolor,normal,metalRough}.png` 1024² is a complete PBR set and the best
  weathered ground here; also `sand.jpg`, `rock.png`+`rockn.png`, `fire/diffuse.png` (flame sprite).
- **`PotOfCoals`** (Khronos) — CC BY 4.0, Darmstadt Graphics Group / Eric Chadwick. The best
  literal brazier found.
- **`three.js/examples/textures/terrain/`** — CC BY 3.0 per `terrain/readme.txt`.

## Derived-chain CC0 — defensible, not first-party

`Null-MC/Oversized`, path `src/assets/minecraft/optifine/ctm/oversized/`. Root `LICENSE.txt` is
CC0, but the README says textures are *"not owned by me; each licensed separately"*. Resolved by
reading per-material `source.txt`: `chiseled_sandstone`←3dtextures.me (**hieroglyph-carved wall,
full PBR 1024²** — the most on-theme texture found anywhere), `sandstone`←ambientCG Rock029,
`sand`←cc0textures Ground033, `smooth_sandstone`←texturehaven, `stone_bricks`←cc0textures. All five
upstreams are CC0-only platforms, so the chain holds — but it is derived-and-modified, not a
first-party grant. **Keep the `source.txt` files alongside any asset used, as the provenance record.**
Practical caveat: these are Minecraft CTM textures, 2048² PNGs up to 26 MB. Recompress to KTX2 or
WebP before shipping, and check tiling seams — they are hand-modified toward a blocky look.

## Traps — on-theme and NOT usable

- **`three.js/examples/models/gltf/Nefertiti/`** — an actual Egyptian bust, and **CC BY-NC**. The
  most tempting wrong answer in the search.
- **`Khronos/Models/Sponza`** — ideal columned architecture, **CryEngine Limited License**.
- **`three.js/examples/textures/lensflare/`** — **CC BY-NC-SA 3.0**.
- **`three.js/examples/sounds/`** — **CC BY-NC-SA**.
- **Most of `three.js/examples/textures/`** carries *no licence statement at all* — brick, hardwood,
  the scratched-gold PBR set, the perlin noise, `planets/moon_1024.jpg`, and the
  `equirectangular/moonless_golf_2k` night HDR. Upstreams are probably CC0 (cgbookcase, Poly Haven,
  NASA) but nothing declares it in-repo. Treat the directory as unusable except `decal/`.

## Gaps — nothing good exists in reach

No palm trees, no Egyptian statuary or sarcophagi, no dune heightfields, no true starfield
equirectangular, and no wind, sand, cloth or bird audio. The one CC0 audio aggregation found
(`lavenderdotpet/CC0-Public-Domain-Sounds`, 4,504 files) has generic footsteps and ambient loops
only; its `kenney_*` subfolders are trustworthy, the rest is one person's collection under a
root CC0 file, which is weak evidence for shipping.

**Consequences for planning:** starfield and dunes should stay **procedural** — cheaper, tiles
perfectly, and sidesteps the licensing gap that has no clean answer here. Character assets must be
authored or supplied. Audio should not be planned around this catalogue.
