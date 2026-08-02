# PREREG — quarry mottle (`column_papyrus`), in-frame verification on the pass-6 capture

Written **before** the pass-6 capture boots. Change under test: `1420def`, `src/textures/Materials.js`,
one recipe (`column_papyrus`) — an additive 17 cm quarry mottle, `s.field(1, warpN(u,v,60,2,1.0))`
at 0.45 of the ramp coordinate. Nothing else in `src/textures/**` moved; the catalogue diff is
1 recipe of 44.

## Instrument

`scratchpad/matflat.mjs <png> <shot> --props --erode 3`. Rasterises ARCHITECTURE+PROPS offline
with the shot's own camera at 1280×720, keys every pixel by material name, erodes 3 px to drop
silhouettes/ink/thin occluders, then measures inside each mask:

- `cov1` — share of pixels whose 1.6 px band-pass luma contrast clears **1 % of the local base**
  (14 px Gaussian). This is the flat-side statistic.
- `covC2` — the same at the 6 px scale, ≥2 %. Busy-side guard: blotching is coarse-scale.
- `deadBig` — share of pixels inside a connected sub-threshold blob ≥400 px. A flat *panel*.

Suffix not implemented (§11): no terrain/character/FX/sky in the mask, no lighting model, and the
mask comes from the current tree while the frame comes from whatever SHA the capture stamps.

## Baseline

`shots/rim4/temple-base.png` at **2f99d55**, whose `src/textures/**` is identical to the tree
immediately before `1420def` (`git diff 2f99d55 1420def^ -- src/textures` is empty). Measured:

| material | share% | cov1 | covC2 | deadBig | dead |
|---|---|---|---|---|---|
| `column_papyrus` | 53.98 | **68.4 %** | 65.5 % | 2.0 % | 31.6 % |
| `hieroglyph_wall` (control, untouched) | 17.10 | 78.7 % | 77.8 % | 3.0 % | 21.3 % |
| `paving_courtyard` (null, untouched) | 5.96 | 85.0 % | 81.3 % | 0.0 % | 15.0 % |
| `sandstone_block` (null, untouched) | 6.83 | 77.9 % | 77.3 % | 0.0 % | 22.1 % |

Texture side, same statistic on the built albedo resampled to `temple`'s own mm/px, at the
**runtime** size 1024: `column_papyrus` 50.7 → **68.3**, `hieroglyph_wall` bit-identical.

## Predictions

Everything is registered as a **difference in differences** against the in-frame control, because
the pass-6 tree also carries SHADING's and GEOMETRY's changes and the grade will not be the
baseline's. Let Δcol and Δwall be the cov1 changes on `temple`.

1. **Primary.** `Δcol − Δwall` ≥ **+2.0 points** and ≤ **+12.0**. Texture-side gain is +17.6
   points; the frame already carries relief, joint and lighting contrast the albedo does not, and
   this recipe's last measured texture→frame transfer was ~0.45, so a full-size gain in frame
   would itself be suspicious.
2. **Busy guard.** `Δ covC2(column) − Δ covC2(wall)` ≤ **+3.0 points**, and
   `deadBig(column)` must not rise. Squint sd moved +0.75 % against the +49 % of the state known
   to blotch, so a coarse-scale jump in frame would mean something other than this change.
3. **Nulls.** `paving_courtyard` and `sandstone_block` track the wall within ±2.5 points of each
   other. If the untouched materials disagree by more than that, the frame moved for reasons
   outside this change and the primary is unquotable, not passed.
4. **Secondary, not decisive.** `traversal` (+6.3 texture-side, 2.6 % of frame) and `hero`
   (+4.1, 1.9 %) should move in the same direction. Their shares are small, so a null there is
   not evidence against.

## Falsifier, stated in advance

If `Δcol − Δwall` < **+2.0 points** while the nulls hold, the change did not reach the frame in
an amount worth its risk and I revert it rather than defend it with the texture-side number.
If prediction 2 fails, revert regardless of prediction 1 — the busy condition is the one this
recipe has historically broken while fixing the flat one.

## Scope facts, registered before the frames exist

- `temple` is the only decisive framing: `column_papyrus` is 54 % of it and ≤2.6 % everywhere else.
- `courtyard`'s columns are at 63 m (82 mm/px). The mottle's upper octave is 1.0 px there and is
  *designed* to mip away; the 16.7 cm base is 2.0 px and should survive. No prediction is made for
  `courtyard` — it is below the instrument's useful resolution for this feature.
- This is an albedo change with no height component, so it cannot move the normal-map or AO
  statistics, and `darkTail` is 0.0000 before and after at both 512 and 1024.
