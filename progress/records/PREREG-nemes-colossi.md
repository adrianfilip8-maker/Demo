# PREREG — the shared `nemes()` change, read off geo3's `courtyard` frame

Sealed **before geo3 boots** and before any pixel of it exists. Tree under test `d542055`
(working tree clean and byte-identical at seal time). Written because the coordinator caught a
real error in my own audit — see §50 below — and because a frame I interpret after seeing it
is worth nothing.

## What actually changed, and why a triangle count could not see it

Two hunks in `src/world/Statues.js`, both inside `nemes()` (`Statues.js:76`), which is a
**shared helper**:

| hunk | before | after |
|---|---|---|
| crown terraces (`@@ -79,8`) | `round: 0.05w`, `c: 0.055w` | `round: 0.13w`, `c: 0.10w` |
| lappets (`@@ -92,7`) | `c: 0.05w`, no `round` | `round: 0.07w`, `c: 0.09w` |

Four builders call it — `seatedColossus` (w **2.4**), `sphinx` (1.02), `coffinLid` (0.70L),
`fallenHead` (1.65). I originally reported this change as reaching the avenue only. **That was
wrong**, and the reason is the finding: both parameters modify geometry that was *already*
`chamferBox`, so the edit changes silhouette and shading at **exactly zero triangle cost**. My
audit instrument was a triangle count, which returns a clean bill for the entire class of
change it cannot represent. Fourth instance of that shape (cf. §39, §40, §43); recorded as §50.

## Where it lands — measured against built geometry, not estimated

Camera `courtyard`: `pos [-2.5, 4.0, 41.5]`, `target [1.5, 6.4, 16.0]`, `fov 55`, `tod 0.76`.
Half-angles: **27.5° vertical, 42.8° horizontal** at 16:9. Colossi at x ±9.5, z 25, plinth top
y 2.0, crown band world y 10.54 … 13.32.

| crown | verts in frustum | min off-axis | distance | screen box (1280×720) |
|---|---|---|---|---|
| west (x −9.5) | **660 / 660** | 23.9° | 19.5 m | x 60…333, y 26…151 |
| east (x +9.5) | **660 / 660** | 18.9° | 21.8 m | x 877…1112, y 92…190 |

Both crowns are wholly inside the frustum with ~19° of margin — not marginal. (The
coordinator's estimate was 28°/32°; measured they are *more* central than that. Confirmed
independently as asked, `scratchpad/frustum.mjs`.)

**Arris width, the quantity under test:** `c` 13.2 cm → 24.0 cm on the colossal nemes, which at
19.5 m subtends **5.4 px → 9.8 px**. On the avenue sphinx the same edit is 1.3 px → 2.4 px. So
geo3's courtyard frame reads this change at **~4× the pixel width** the `dunes` avenue ever
will. This is the strongest available look at the nemes work and it arrives for free.

## Registered predictions — bands partition, every claim carries a number

Scored on the two crown boxes above, at 2× crop.

- **N1 — the three terraces survive as three steps.** §2.4 requires the ink line to read three
  terraces, *not* one dome, and `round: 0.13w` = 31 cm of inward corner pull at w 2.4 is the
  plausible way to destroy that. Count distinct horizontal step edges across the crown:
  **=3 → PASS** · **=2 → MARGINAL, the change overshot and `round` reverts to ~0.09w** ·
  **≤1 → FAIL, revert both hunks to the sealed prior values.**
  Offline prediction from the built mesh (`scratchpad/col-new.png`, same camera, same tod):
  **3, steps clearly separated.** I have looked at this; it is a prediction, not a hope.
- **N2 — the arris reads as a lit band, not a line.** Width of the bright bevel strip along the
  top terrace's front arris: **≥6 px → PASS** · **3–6 px → weak-but-present** ·
  **<3 px → FAIL** (the widening did not survive the grade, and `c` is not the lever I think).
  Point prediction **9.8 px**.
- **N3 — terrace tops stop being plateaux.** Luma range sampled across one terrace's top face,
  perpendicular to its arris, excluding the bevel: **≥8 L → PASS** (the `round` dome is
  carrying a gradient) · **3–8 L → marginal** · **<3 L → FAIL, `round` buys nothing at this
  scale and only `c` matters.** This is the one I am least confident of and the one most worth
  knowing.
- **N4 — falsifier, registered to fail.** If the crown now reads *softer* overall — i.e. the
  silhouette loses the hard stepped read and the critic's next pass calls the colossus heads
  "melted" or "soft" rather than "carved" — that is a **loss**, and it is not to be absorbed as
  "smoother is better". The §7.3 condition in play is "Architecture reads as boxes; proportions
  realistic instead of exaggerated-cartoon", and over-rounding fails it from the other side.

## What geo3 cannot answer, stated now so it is not claimed later

The `loft` body — the rump-to-chest curve and the terminator sweeping the back — is
**sphinx-only** and appears in none of geo3's three shots (`courtyard`, `temple`, `traversal`).
The avenue is a `dunes` subject. That work remains genuinely unverified in-engine and needs a
`dunes` capture at some later point. Nothing in geo3 should be read as evidence about it.

Verified offline only, which is not the same as verified: `scratchpad/celraster.mjs` renders the
built mesh with the shader's own band edges (0.52 / 0.14) and no grade, AO, rim or bloom. It is
a form instrument, not a frame instrument.
