# PREREG-tx8-hue — albedo hue variety and glyph authoring, registered before any capture

Registered by TEXTURES. Tree at write time: `d98d414` + uncommitted `src/textures/**` only
(`git status --porcelain` shows `src/textures/Hieroglyphs.js` and `src/textures/Materials.js`
and nothing else from me). **No frame of the changed state exists**; every number below is from
the CPU lab. Answers critic pass 5 findings **#2 (palette is two colours)** and **#9 (the
hieroglyphs are not glyphs)**, `progress/records/RESULT-critic5.md` §3.2 / §3.9 / §4.2.

## 0. Instruments and their controls

| instrument | what it is | control |
|---|---|---|
| `scratchpad/huelab.mjs` | the critic's M11 (best-two-40°-window share of chromatic pixels, chroma gate ≥8/255) on **built albedo × the consumer's material colour**, area-weighted per framing by `angsize.json` shares | full-360° sweep → **0.222**, two-hue field → **1.000**; the critic's own controls returned 0.223 and 1.000. Run before any material is measured; the script exits non-zero if they miss. |
| `scratchpad/huewhere.mjs` | 10° hue histogram, cool/green mass, and where in v it sits | — (diagnostic, not a verdict instrument) |
| `scratchpad/huechain.mjs` | authored albedo → display hue through the committed light+grade chain | the chain is `pavegate.mjs`'s transcription, validated to **3 display counts of b−r** on `WALL-SHADOW` in `PREREG-blueskew-albedo` ADDENDUM1 §4a |
| `tools/wallstrip.mjs` | the render at the framing's own px/repeat | the only tiling instrument in this project calibrated against a known-bad (§13) |
| `tools/texlab.mjs`, `tools/census.mjs` | invariants; per-sign census | — |

**Scope stamp (§11) — transforms between these numbers and the renderer that are NOT implemented:**
the shadow map (`keyF` is a parameter, not a lookup, so the lit/shade mix per shot is an input);
GTAO; haze; bloom; vignette; FXAA; grain; screen-space rim and ink; the surface fresnel rim;
normal-map perturbation of `ndl`; mip minification; and **every non-architecture pixel** — sky,
terrain, character, FX, vegetation — which is most of what the critic's whole-frame M11 sees in
`dunes` and `night`. Level 4 of `huelab` predicts the hue of ARCHITECTURE pixels only and is not
to be quoted as a prediction of the critic's number.

## 1. What changed (all of it in `src/textures/**`)

- `Hieroglyphs.js`: seven new **shape-distinct flat signs** (`sky`, `hills`, `shen`, `hetep`,
  `stool`, `land`, `pot`); `POOLS` deduplicated by *silhouette* rather than by name;
  `khekerFrieze` redrawn as a reed bundle with a tie (it was a pentagon) and cycling four
  pigments instead of two.
- `Materials.js` `glyphWall`: a fourth `'bandpaint'` pass so flat painted decoration is laid down
  by the recipe at near-full chroma instead of through `paintRemnants`; a kheker crown; a dado
  (narrow polychrome band over a broad malachite field); cartouches in **every other** text column
  instead of one per repeat; `tall` 0.30 → 0.26 to pay for the crown.
- `hieroglyph_wall`: `paintRemnants.fade` 0.42 → 0.15; band paint applied as thresholded
  *coverage* rather than uniform opacity; `rampFloor` → `SAND_CREV_FLOOR` + `lift: 0.5`.
- `column_papyrus`: cord bands ochre → malachite; five-colour bands trade ochre for malachite;
  `BAND_FADE` 0.26 → 0.08 with the same coverage threshold; `paintRemnants.fade` 0.45 → 0.18;
  `bandWear` freq 8 → 16 (patch 1.1 m → 0.56 m).

## 2. Measured, CPU-side, before → after

| | before | after |
|---|---|---|
| `hieroglyph_wall` cool/green share of chromatic texels | **0.54 %** | **8.22 %** |
| `column_papyrus` same | **0.86 %** | **6.41 %** |
| `huelab` M11, `temple` (architecture albedo) | 0.989 | **0.942** |
| `huelab` M11, `traversal` | 0.999 | **0.979** |
| `huelab` M11, `hero` / `interior` / `courtyard` / `night` / `dunes` | 1.000 | 0.999 / 0.999 / 0.998 / 0.999 / 0.998 |
| `huelab` M11, `guard` / `combat` / `sly-closeup` | 1.000 | **1.000 (unmoved)** |
| `hieroglyph_wall` `darkTail` | 0.0001 | **0.0000** |
| `column_papyrus` `darkTail` | 0.0000 | 0.0000 |
| joint `dY`/`dH`, wall | −0.0335 / −0.2784 | −0.0280 / −0.3017 |
| joint `dY`/`dH`, column | −0.0602 / −0.1326 | −0.0614 / −0.1332 |
| all 44 recipes: joint sign / build | ok | **ok, 0 violations** |
| wall `lumaRms` (full res) | 0.0652 | 0.0877 (**+34.5 %**) |
| wall mip 2/3/4/5 (the squint band) | 0.0495/0.0433/0.0350/0.0302 | 0.0636/0.0456/0.0383/**0.0307 (+1.7 %)** |
| column `lumaRms` | 0.0612 | 0.0670 (+9.5 %) |
| wall albedo mean b−r | −0.3523 (§13) | **−0.2851** |
| column albedo mean b−r | −0.3799 (§13) | **−0.3467** |
| wall commonest sign / 107 placements | `mouth` 17.9 % (§13) | **`stool` 10.3 %**; 38 % of placements from the new distinct-shape set |

## 3. Registered predictions and their bands

Capture wanted: **`temple`, `traversal`, `courtyard`, `interior`** (the four framings where
`column_papyrus` + `hieroglyph_wall` are 33–71 % of frame). Before-frames: `shots/tx7/temple.png`,
`shots/tx7/interior.png`; `shots/critic5/` for `traversal` and `courtyard`.

**P1 — green reaches the frame.** Share of *chromatic* pixels with hue ∈ [60,170) inside a
sunlit ROI on a `hieroglyph_wall` or `column_papyrus` surface. Bands partition ℝ:

| band | verdict |
|---|---|
| < 1.0 % | **FAIL — inert.** The albedo change did not survive to the frame; the residual is downstream (material colour multiply, or the shade regime) and TEXTURES cannot close #2. |
| 1.0 – 3.0 % | PARTIAL — arrived and was compressed; report the compression factor against the 6.4–8.2 % authored. |
| ≥ 3.0 % | **PASS** — authored hue survives at better than half strength. |

Reachability is established from both sides, which §33 requires: the pre-change frames are the
low control (the authored mass was 0.5–0.9 %, so the frame cannot have exceeded it), and
`huechain` puts a *fully lit* malachite band at display hue 95° with chroma 105, i.e. the high end
is reachable by construction.

**P2 — no tiling regression.** At 2× on the capture, `traversal`'s glyph panel and `temple`'s
axial wall must show no mark, blob or wear patch that can be matched to the next repeat.
FAIL if any single feature is countable at the framing's own px/repeat. *This is the risk the
cartouche change takes on knowingly* — §13 records that a once-per-repeat cartouche made repeats
trivially countable, and the claim here is only that a five-per-repeat one cannot.

**P3 — the squint test holds.** Frame downsampled to 1/16: the masses must be structurally
unchanged from the before-frame and free of new blotching. FAIL if any new mottling appears.

**P4 — the glyphs read as writing** (critic §3.9). At 2–4× on the closest wall in `courtyard` or
`interior`: cartouches present, register rules present, and the flat signs no longer read as a row
of identical rounded rectangles. Qualitative by construction — the critic's finding is qualitative
and no scalar in this project has ever separated a shape-variety defect (§13's twenty-eight).

**P5 — the busy guard.** `relLocalContrast` (5×5 luma sd/mean) in the critic's `temple` ROI
(950,200 180×380, the near nave column). Registered *before* the capture: **|Δ| ≤ 25 %** of the
tx7 value 0.05433. The change is chroma, and §12's corollary says a luma metric is largely blind
to a pigment change, so a large luma move means I added busyness rather than colour and the band
paint should come down. > +25 % ⇒ FAIL.

## 4. What I expect to be small, said before the capture so it cannot be spun afterwards

The whole-frame M11 the critic measures will move **little** — my own architecture-albedo analogue
moves 0.989 → 0.942 on the best shot and 1.000 → 0.999 on five others. Three measured reasons,
all of which bound what `src/textures/**` can do:

1. **The dominant hue is the stone, not the decoration.** `sandstone_block`, `sandstone_worn`,
   `paving_courtyard`, `granite_pink`, `limestone_polished` and `mudbrick` are 60–100 % of every
   framing, all read 1.000 on their own, and §2.2 gives them exactly one hue family. `guard`,
   `combat` and `sly-closeup` are ~83–98 % those six materials, which is why they do not move at
   all.
2. **The consumer multiplies my map by a saturated warm.** `Architecture.RECIPES` colours are
   `0xd6a874`, `0xd8a468`, `0xcfa068`, `0xc9915a`; in linear that attenuates blue 3.7× harder than
   red. Measured: full-strength malachite survives it (display hue 95°), a 60:40 malachite-stone
   mix does not (43°, back inside the warm bin). Not my file — **routes to ARCHITECTURE**.
3. **In shadow the chain collapses every albedo to one hue.** `huechain` at `keyF 0.00`: every
   pigment in §2.2 lands between 152° and 244°, and `huelab`'s shaded column reads **1.000 on all
   ten framings**. So authored hue buys nothing on a shaded surface, and §34 already records that
   `hero`'s largest material is 98.6 % shadowed. **Routes to SHADING/LIGHTING.**

If P1 passes and the frame number still barely moves, that is the result, and it means finding #2
is not closable from this file alone.
