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

---

## Sand and sandstone, re-probed 2026-08-08 — with sizes this time

Asked specifically for sand/sandstone packs. The reachable surface is unchanged: every dedicated
texture host still fails to connect (`3dtextures.me`, `texturecan.com`, `cc0-textures.com`,
`ambientcg.com`, `polyhaven.com` all return **000**), so anything usable has to live in a GitHub
repo or an npm package. A web search surfaces plenty of good CC0 sand and sandstone — *and every
single hit is on a blocked host*, which is worth stating plainly rather than listing as if it were
available.

### What is actually reachable, measured rather than estimated

**`Null-MC/Oversized`** — the derived-CC0 chain, each material a full PBR set (`color`, `normal`,
`height`, `occlusion`, `smooth`, sometimes `porosity`), with `source.txt` naming its upstream:

| material | total | upstream (all CC0-only platforms) |
|---|---|---|
| `chiseled_sandstone` | **3.9 MB** | 3dtextures.me *Wall Stone Hieroglyphs 001* |
| `chiseled_red_sandstone` | 5.0 MB | — |
| `smooth_sandstone` | 6.8 MB | texturehaven *medieval_blocks_05* |
| `red_sand` | 42.3 MB | — |
| `sand` | **46.3 MB** | cc0textures *Ground033* |
| `sandstone` | **57.8 MB** | ambientCG *Rock029* |

The three big ones are non-starters: 42–58 MB **per material** for a build that has to be
self-contained. `sand`'s colour map alone is 22 MB. Only the two chiselled sets and
`smooth_sandstone` are even in the conversation.

**`BabylonJS/Assets`** — `sand.jpg` 894² (448 KB), `rockyGround_{basecolor,normal}` 1024²
(1.8/2.4 MB). Repo README: **CC BY 4.0**, attribution required.

### Recommendation: don't adopt any of it, and the reason is style rather than licensing

`chiseled_sandstone` is the one genuinely tempting file — seamless carved hieroglyphs on warm
sandstone, and exactly the subject this game needs. Two things sink it:

1. **It is 1024² but not 1024² of content.** Its `mat.yml` declares `ctm: of-repeat, count-x: 2,
   count-y: 2`, so the image is a 2×2 grid and the unique content is ~512². That is not a
   resolution upgrade over what `Textures.js` already generates.
2. **It is photoreal, and this game is not.** The renderer bands luminance into 3 hard steps and
   draws ink outlines. Dropping a photographic carved-stone surface into that fights the shader —
   and §7.3's whole direction has been *more* stylisation, not less.

**And the procedural system it would replace is better, not merely cheaper.** `src/textures/
Hieroglyphs.js` is 1,105 lines of actual Gardiner signs drawn from their real silhouettes, each
carrying the conventional pigment Egyptian painters used (red men, yellow women, blue water, green
plants), laid out in **quadrats** the way a scribe grouped them rather than evenly spaced like a
font — and rendered in three passes (`cut` / `line` / `paint`) that feed sunk-relief depth and
paint-remnant colour separately. A photograph of one wall cannot do any of that, and it cannot be
re-laid-out per surface.

The same argument retires the sand textures independently: TERRAIN drives sand with UV = metres at
repeat 1/9.6, so a single 894² photo would tile visibly across open dunes. The original catalogue
already concluded dunes should stay procedural; the sizes above are the quantitative version of
that.

**Footnote on the supplied font.** `NotoSansEgyptianHieroglyphs-Regular.ttf` (SIL OFL, 1,071 real
glyphs) is installed and currently unused — no `.ttf` reference exists anywhere in `src/`. That is
not an oversight to fix by wiring it up: `Hieroglyphs.js` already draws real signs as vectors *with
scribal layout and conventional colour*, which a font's glyph outlines alone would not provide. The
font remains the right fallback if a UI surface ever needs literal Unicode hieroglyph text.
