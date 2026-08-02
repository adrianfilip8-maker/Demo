# ADDENDUM to PREREG-aokey — the frozen before-measurement, and two premises it corrects

TEXTURES, 2026-08-02 ~16:45 UTC. Tree at measurement: `1006744` for the repo, **`src/textures/**`
unchanged since `4a5140b` (10:36)**, so every texture number below is current. No src edit was
made or is proposed here; task #23's freeze is respected throughout. Instruments (scratchpad,
CPU-only, no capture lock): `aocdf.mjs`, `goldcover.mjs`, `gildframe.mjs`, `aodisjoint.mjs`,
`shotgeo.mjs`.

This amends the seal already in `progress/records/PREREG-aokey.md` **before it spends a lock**,
in the discipline §27.5 records: the amendment lands inside the existing seal rather than as a
new instrument built around a known answer, and the corroborating A/B in §5 is quarantined from
setting any band.

---

## 1. The seal's authored numbers are a percentile mislabel — measured, not argued

`tools/texlab.mjs:170` emits `aoP: [1, 5, 50].map(p => pct(aoS, p/100))`. The array is
**p1 / p5 / p50**. It has been read everywhere as p5 / p50 / p95 — in KNOWN_ISSUES §8's table, in
`PREREG-aokey.md:17`, and in two shipped source comments (`ToonMaterial.js:422`,
`toon.glsl.js:398`).

Full CDF of `hieroglyph_gilded`'s ORM.R, re-measured today (`aocdf.mjs`, albedo 256 / orm 128,
the built map, no mip, no `uAoStrength`, no lighting):

| p1 | p5 | p10 | p25 | **p50** | p75 | p90 | p95 | p99 | mean |
|---|---|---|---|---|---|---|---|---|---|
| 0.247 | 0.416 | 0.569 | 0.722 | **0.992** | 0.996 | 0.996 | 1.000 | 1.000 | 0.8654 |

Area below thresholds: **<0.9 = 31.3 %, <0.75 = 27.0 %, <0.5 = 7.5 %, <0.3 = 3.0 %.**

**The authored median is 0.992, not 0.412.** 0.412/0.416 is the *fifth percentile*. Three
consequences for the seal as written:

- "authored **4.02:1** AO span" is `p50/p1`, not a p95/p5 span.
- the sizing table's rows are displaced by two percentile steps: the row labelled `p50`
  (ΔL −11.0 … −16.7) is the behaviour of the **5th percentile of texels**, and the row labelled
  `p95` (ΔL 0 … −0.3) is the **median**. Area-weighted, the seal's own model therefore predicts
  roughly **5× less** than the table reads as predicting.
- the closed-form mean is checkable in one line: `ao' = 1 − 0.55·(1 − aoTex)`, so a fully
  key-lit gilded surface loses `0.55 × (1 − 0.8654) = **7.4 %**` of its key term on average,
  41.4 % at p1, 32.1 % at p5, 15.3 % at p25, **0.4 % at the median**.

Two neighbouring recipes, same instrument, for calibration: `gold_leaf` p1/p5/p50 =
0.047/0.047/0.733, mean 0.664, 29.2 % below 0.5 — this one *is* a deep occlusion map.
`bronze_aged` 0.090/0.784/0.980, mean 0.936.

## 2. "renders with a frame AO median of 0.992" has no instrument behind it

Searched: the whole repo, `progress/records/`, and the scratchpad. The only `0.992` that exists
anywhere is `aoP[2]` — the **authored** p50 above — and the three documents that quote a *frame*
AO median cite no tool, no run and no artefact. Nothing in the tree reads back an AO channel from
a frame; `goldbase.mjs`, the tool that produced the neighbouring "in frame" row, reads albedo
PNGs only.

Stated at its strongest: **the frame-side AO median is unmeasured.** And if it were measured and
came back 0.992, that is *equal to the authored median* and would show the map arriving intact,
not "no occlusion at all". Either way the sentence cannot support the routing built on it. This
is §32's shape again (a prose sentence became a premise), one step worse because the premise is
now in two shipped source files that SHADING owns and I cannot edit — **flagged to SHADING**.

## 3. The seal's in-frame anchor is an albedo-debug capture, not a frame

`PREREG-aokey`'s "shipped" column (199,159,88 · 220,183,117 · 242,215,162 — luma 162/186/217,
span **1.34:1**) is §8's "in frame" row, and that row came from `goldbase.mjs`, which reads
`scratchpad/alb1/<shot>.png` — its own header says "albedo only … what the shader RECEIVES".

Measured on the **graded frame**, same material, same shot (`gildframe.mjs`; mask = `matmask`
architecture mask, 2 px erosion; `gh-hero-mask.bin` reproduces today's build pixel-exactly at
264,434 px, so mask and tree agree):

| frame | n (27.3 % of frame) | all p5/p50/p95 | span p95/p5 | lit >120 | lit p5/p50/p95 | lit span | 5×5 HP rms |
|---|---|---|---|---|---|---|---|
| **`shots/cap7/hero.png`** (6fc9e51, 16:04 today) | 251,789 | 25.8 / 43.6 / 100.1 | **3.879** | **1.4 %** | 121.5 / 139.4 / 183.2 | **1.508** | 7.758 |
| `shots/tx7/hero.png` (7dc4442, yesterday) | 251,789 | 23.1 / 39.4 / 93.5 | 4.044 | 1.3 % | 121.6 / 139.9 / 183.9 | 1.512 | 7.570 |

The two boots are a day and several grade commits apart and agree to within 4 % on every
statistic, so this anchor is stable enough to freeze.

**It also disarms the seal's falsifier.** The seal fails the run "if the gilded span does not
reach 1.45:1 at `uAoKey` 1" — the shipped span is **already 1.508**. As written the falsifier
cannot fire (§33's shape: a band that partitions the outcome line and discriminates nothing).

## 4. FROZEN BEFORE-MEASUREMENT (this is the deliverable)

**Population.** `arch:hieroglyph_gilded` pixels of `hero` at 1280×720, from a `matmask` built
from the *same tree as the capture* (§27.1: an instrument that reads geometry from source needs
the source that matches the pixels), 2 px eroded. Frozen count **251,789 px = 27.32 % of frame**.

**Sub-populations, frozen from the BASE arm and never re-thresholded per arm** — re-thresholding
each arm pins p5 at the threshold and hides the effect:

- `Plit` = {base display luma ≥ 120} — **n = 3,459** in `cap7/hero.png`.
- `Pshadow` = the complement — n = 248,330 (98.6 %).

**Statistics, all four reported together** (§8's rule that one ratio cannot see this):

- **S1** mean L over `Plit`. Frozen on `cap7/hero.png`: **143.80** (`tx7` boot: 144.21).
- **S2** p5/p50/p95 and span p95/p5 over `Plit`. Frozen: **121.5 / 139.4 / 183.2, span 1.508**.
- **S3** 5×5 high-pass RMS. Frozen: **34.496 on `Plit`** and **7.758 on the whole population**
  (`tx7` boot: 35.947 / 7.570).
- **S4** the change-by-base-luma table (§5's shape), which is what distinguishes "occlusion" from
  "dimming".

**What "the occlusion arrived" looks like in a frame** — registered now, bands partitioning:

| verdict | condition |
|---|---|
| **PASS** | S2 span ≥ **1.60** *and* S3 on `Plit` up ≥ **10 %** |
| **PARTIAL** | exactly one of those two |
| **NULL** | neither, and \|ΔS1\| < 1 L |
| **REGRESSION** | mean ΔL on `Pshadow` < **−1.0 L** (the mass went dark rather than the crevices), or whole-frame midtone p50 down > 3 L (the seal's own guard, kept unchanged) |

Occlusion is *contrast*, not darkening: a term that only dims fails S3 and lands in NULL or
REGRESSION by design.

## 5. Quarantined corroboration — an aoKey=1 arm already exists, and it is small

**Barred from setting any band above.** `shots/tx7/hero-aokey1.png` was captured in the tx7 boot
with `uAoKey` poked to 1 (13 materials), **unpinned** (§28), so FX drift is present; restricting
to an architecture mask bounds it but does not remove it.

- Fixed population (base ≥ 120, n = 3,225): mean **144.20 → 141.71 (−2.49 L)**;
  span **1.512 → 1.551 (+2.6 %)**; **S3 on `Plit` 35.942 → 35.855 (−0.24 %)**.
- Whole gilded population: Δp50 **−0.45 L**; 5×5 HP rms **7.573 → 7.564 (−0.1 %)**.
- Change by base-luma band (mean ΔL, % of band moving < −3 L): 20–40 (49.8 % of area)
  −0.11 / 1.3 % · 40–60 −0.73 / 12.3 % · 100–120 −0.83 / 14.4 % · **120–150 −2.52 / 26.9 %** ·
  **150–180 −2.51 / 26.5 %** · ≥180 −2.03 / 19.5 %. Worst individual pixels −30 to −48 L.

So the term is **wired, correctly signed, monotone in how lit the pixel was, and locally strong
at crevices** — and its population effect on the shot the seal names is ≈2.5 L on 1.4 % of the
material's pixels. Scored against the frozen bands in §4 it is **NULL/PARTIAL**: span 1.512 →
1.551 (bar 1.60), S3 on `Plit` −0.24 % (bar +10 %), whole-population S3 −0.1 %. Predicting from
measurement rather than from a model (§16), the sealed run should expect S2 ≈ 1.55 and S3 flat —
not 1.50–1.60 for the reason the seal gives. If the pinned run reproduces that, `uAoKey` is
**real, correctly implemented and not the gold lever**, and the honest write-up says so rather
than reading a 2.6 % span move as a partial win.

## 6. Why it is small, in one line of arithmetic and one census

`ao'` averages 0.926 over the authored map, and **only 1.4 % of `hero`'s gilded pixels are
key-lit at all**. 7.4 % of a term that is present on 1.4 % of the population is the −0.45 L that
was measured. The lever is real and it is not where §7.3's gold line is decided in this shot.

Geometric census of where key-lit gilded exists at all (`shotgeo.mjs`; face normals, no shadow
map, so an **upper bound**): `hero` 28.69 % of frame / 19.7 % above `termLo` (1.4 % actually lit
in frame) · `traversal` 14.09 % / 7.1 % · `interior` 5.19 % / 99.7 % but at ndl 0.238, plus
`gold_leaf` 1.00 % of frame with **53.7 % above `termHi`** · `courtyard` 3.81 % / **10.0 % above
`termHi`** · `dunes` 4.40 % / 2.5 % · `night` 11.12 % / **0 %** · `combat`, `guard`,
`sly-closeup` none. **If the sealed A/B wants a population where a key-side lever can move
anything, it is `interior`'s `gold_leaf` and `courtyard`'s gilded — not `hero`.**

## 7. The observation that outranks the arithmetic, made with the image on screen

`hero`'s gilded mass is **85.8 % non-metal by area**: the ORM metal mask exceeds 0.5 on only
**14.2 %** of `hieroglyph_gilded` (`goldcover.mjs`). The metal strokes are authored *darker and
warmer* than the stone they sit in — metal L p5/p50/p95 = 92/118/158, (b−r)/255 = −0.475;
stone 130/168/188, −0.231 — which is the cel-metal doctrine (dark base, hot crest) done right in
the texture.

In the frame that mass is **98.6 % shadowed at median luma 43.6**, and with the mask overlaid on
`cap7/hero.png` it reads as **cool blue-grey stone with rust mottling — there is no gold read in
the shot at all** (`scratchpad/hero-gildmask.png`, `hero-gild.png`).

So §7.3's "a bright yellow surface reads as painted plaster" is not what `hero` shows, and "needs
dark occlusion" is not what it is short of: **the mass is already dark, and it is violet.** Every
key-side lever proposed for this line so far — hard spec (§25), bloom gain (goldhalo, inert),
bloom onset (goldonset, void), AO on key (this) — operates on the 1.4 % of the population that
the key reaches. The levers with reach on the other 98.6 % are the **shadow-side** ones
(`metalEnv`, the shadow tint and wash on metal pixels — SHADING) and a **framing that puts key
light on gold at size** (LIGHTING/ARCHITECTURE/the shot list). TEXTURES' side of this line —
dark base, value mass, crest scatter, warm metal against cool stone — is measured above and is
authored as specified.
