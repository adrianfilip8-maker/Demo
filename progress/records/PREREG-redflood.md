# PREREG-redflood — what blows the twilight walls: haze, split-tone, or saturation

Sealed **before** any capture. `shots/redflood/` does not exist at the time of writing.

## 1. The defect and the suspects

Critic 10 (§290): `sly-perch` 3.5/10 and `sly-arm` 3.5/10 — "the right wall is a blown
monochrome plane… the whole right half smears", Sly's blue washed to white; same family on
`combat` and `courtyard`. Offline: the atmosphere anchors are sane (el-2° sun `#ffb072`,
twilight `#d08050` — nothing authored red), and these shots stage at `tod 0.80`, past the
sunset knee. The candidates are therefore the multiplicative/additive stages that act on
those sane inputs:

- **Toon haze** (`hazeDensity 0.020`, warm `#e8b878`/`#ffc98a`, forward-scatter boost) —
  ToonMaterial's aerial perspective on the walls;
- **Split-tone grade** (`pf.tune.splitStrength`) — warm-pushed highlights, exactly what a
  twilight-bright wall is made of;
- **Global saturation** (`pf.tune.saturation` 1.30-era) — multiplying already-warm walls.

ROI, derived by looking at the r10 frame before this seal (shadowhold's rule): **WALL =
[900, 60, 1260, 330]** on `sly-perch` (the blown top-right plane; avoids tail and ledge).
Contrast control, report-only: LEFTWALL = [40, 260, 260, 480]. On `sly-arm`, WALL =
[900, 40, 1260, 300] (same plane family; that frame's flood is frame-wide right).

## 2. Instrument

`tools/redflood.mjs`. One boot per shot (`sly-perch`, `sly-arm`), staged once, clock frozen;
five conditions, ONE render each (no texture swap — this is not a costume question):

| cond | pokes (tune AND live uniform where present; readback after step) |
|---|---|
| `base` | none |
| `haze0` | `shading.tune.hazeDensity = 0` (+ `uniforms.uHazeDensity`) |
| `split0` | `pf.tune.splitStrength = 0` |
| `sat1` | `pf.tune.saturation = 1` |
| `alloff` | all three |

All pokes restored per condition; C-DRIFT (base re-render, zero px ≥ 9) per boot. If a
readback shows a poke reverted (SKY republishing haze from its own source is the known risk),
that condition is VOID and the RESULT names the real override surface for the re-seal.

## 3. Registered statistics and attribution

Per condition, over WALL: **S** = mean HSV saturation · **T** = std of Rec.709 luma
(the "blown monochrome plane" is high-S, low-T). Effect of a condition:
`E(c) = [S(base) − S(c)] + [T(c) − T(base)] / 64` (T normalised so ~16 L of recovered
texture ≈ 0.25 saturation points; fixed here, not tuned later).

- **FLOOR (must fire):** E(alloff) ≥ **0.08** on each shot — the three suspects together
  must explain a visible share of the flood, else outcome **NONE-OF-THESE** (next suspects:
  sky-dome reflectance, anchor interpolation; new seal).
- **OWNER**: E(c) ≥ 0.70 × E(alloff) · **CONTRIB**: ≥ 0.25 × · **NULL** otherwise.
  Calls per condition take the weaker shot (attractor4's rule); shots disagreeing by two
  rungs → MIXED, reported.

Attribution only — no constant changes, no ship. The fix (which may be per-anchor rather
than global: daylight shots must not pay for twilight's flood) is its own seal.

## 4. Expected outcome, in advance

**split0 and sat1 jointly OWNER-adjacent** (the grade multiplies warm-on-warm at twilight;
creamfix-era measurements already showed the grade chain moving character hue hard), with
haze0 CONTRIB at most (the walls are near — hazeStart is 26 m). Held loosely: the ledger is
**4/14**, and the attractor arc earned its verdicts precisely by expecting one term and
finding another.
