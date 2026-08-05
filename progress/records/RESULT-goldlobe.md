# RESULT-goldlobe — registered scoring of the goldlobe1 capture (PREREG-goldlobe.md, sealed 87e5efd)

Scored by SHADING, 2026-08-05, per `PREREG-goldlobe.md` exactly as sealed. **Written
incrementally (§163/§164); an abrupt end means a rollback took the session.**

**STATUS: SCORING IN PROGRESS — capture landed (commit f023921), fresh scoring session.**

## Sequencing note, recorded before the fact

The seal's §7 preference — scaffold committed BEFORE the shared window so every chunk stamps
one tree — was not available: the coordinator's execute order ran banda's chunks first on the
pre-scaffold tree (banda chunk A srcTree `820ace395b9664ae`), and the scaffold lands after
them. The seal's own fallback governs ("chunk E is self-contained"): banda's arms do not
reference the scaffold, chunk E boots the scaffolded tree and stamps its own hash, and
**G-0base arbitrates** that the defect is unchanged on the scaffolded tree (base tail ∈
[1.2, 3.0] %, lobe ≤ 20 px). The banda↔goldlobe cross-chunk tree difference is exactly the
inert scaffold, whose in-boot null arm (P-F2, 0 px vs base) is the inertness proof.

## Evidence and provenance (filled as the phase runs)

- Scaffold: `src/render/ToonMaterial.js` (TUNE.goldGlint 0.0 / glintPow 20 + shared uniforms
  uGoldGlint/uGlintPow) and `src/render/shaders/toon.glsl.js` (TOON_PARS decls + the glint
  leg inside the `uMetal > 0.001` branch) — exact §2 GLSL; applied by
  scratchpad/apply-goldlobe-scaffold.py (dry-run verified on a copy: module imports, no
  backticks, anchors unique). Ships inert by design; commit is the coordinator's.
- Runner: `progress/records/goldlobe1.mjs` (committed) — chunk E, one boot, traversal +
  combat, arms base / Alo(1.6/20) / cand(2.6/20) / KBchrome(2.6/5) / null(0/20), per-arm
  readback, frames to `progress/records/goldlobe1/`.
- Scoring: fresh `matmask.mjs` masks at the scaffolded tree, `gildlit.mjs` gates (G-0a,
  G-0base, B2'/B3'), occluder map re-derived per goldtraversal §6 (FX-glow exclusion +
  positive control), `goldgap.py` with a goldlobe jobs file (B1'/B4/B5/p99).

## 0. Provenance of this scoring (measured first)

- **Capture:** `progress/records/goldlobe1/` — `<shot>.<arm>.png` × {traversal, combat} ×
  {base, Alo, cand, KBchrome, null} + `readback-E.json`; run log
  `progress/records/logs/goldlobe1.log`. One boot, 14:09–14:21Z; every arm's poke readback
  matches its request (`mismatch: []` × 10); traversal tod 0.77 / 252 draws / 1.751 M tris,
  combat tod 0.74 / 222 draws / 1.542 M tris.
- **Tree:** capture stamps srcTree `2b7683df9d0ef6ad` before AND after (runner's find-based
  `src/**/*.js` convention, relative paths); **scoring-time hash, same convention:
  `2b7683df9d0ef6ad` — identical.** The masks below are built from the exact tree that
  captured the frames (§121.4 satisfied by hash, not SHA).
- **Scaffold in-tree check (read-only):** `toon.glsl.js:537–550` carries §2's exact glint leg
  inside the `uMetal > 0.001` branch; `ToonMaterial.js:543–544` `TUNE.goldGlint: 0.0` /
  `glintPow: 20.0`; uniforms at `:767–768`. Boot LEVER readback: glint 0, pow 20,
  tuneGlint 0, tunePow 20 — inert at boot as specified.
- **Masks:** fresh `matmask.mjs` at scoring tree, 1280×720 both shots. Raw shares reproduce
  gold1's sidecars to the digit: traversal `arch:hieroglyph_gilded` **14.00 %** /
  `sandstone_worn` 3.61 %; combat gilded **5.81 %** / sandstone_worn 34.98 %. Camera and
  architecture have not moved between gold1 and this capture. Mask bins scratchpad-only
  (regenerable); gilded maskid 7, sandstone_worn maskid 3, both shots.
- Instruments: committed `matmask.mjs` / `gildlit.mjs` / `goldgap.py` unchanged; jobs file
  `progress/records/goldlobe1/goldgap-jobs-goldlobe1.json` (new, gold1 structure, exclusion
  rects re-derived below).

## 1. Structural falsifiers first — P-F2 (scaffold inertness) and P-F4 (restore)

Threshold stated per §122.1: differing px counted at **ΣRGB ≥ 4** (Σ of per-channel abs
deltas), and at ΣRGB ≥ 1 beside it.

| comparison | px ΣRGB ≥ 4 | px ΣRGB ≥ 1 | max ΣRGB |
|---|---|---|---|
| traversal.null vs traversal.base | **0** | 0 | 0 |
| combat.null vs combat.base | **0** | 0 | 0 |

**P-F2 PASS / P-F4 PASS** — the null arm (0/20, the restored TUNE-default state; the
committed runner's header registers it as "P-F2 scaffold-inertness + P-F4 restore in one
arm") is **bit-identical** to base on both shots. The scaffold is inert at gain 0 and the
poke path restores exactly; final LEVER readback glint 0 / pow 20 / tuneGlint 0 / tunePow 20.

Arm deltas vs base at ΣRGB ≥ 4 (the lever is live and dose-ordered, §122.3's "was the
subject in the frame" answered): traversal Alo 9,769 / cand 13,972 / KBchrome 37,421 px;
combat Alo 3,459 / cand 5,085 / KBchrome 12,307 px.

## 2. Gates (§3 of the seal — void conditions, run on the capture's own base arm)

### G-0a share — **PASS, Δ = 0.0 %**

Seal: *"fresh `matmask.mjs` + `gildlit.mjs` eroded-2 share within ±20 % of 12.94 %. Outside ⇒
VOID."* Measured on `traversal.base.png`: **12.94 % eroded-2 / 119,251 px** (raw 14.00 %) —
identical to the registered 12.94 %.

### G-0base defect-present anchor — **PASS**

Seal: *"base-arm gild tail over L160 ∈ [1.2, 3.0] % and largest lobe ≤ 20 px (gold1: 2.10 % /
5 px)."* Measured on the base arm: tail over L160 **2.08 %** (in-band; gold1 2.10 % → Δ
−0.02 pp across boots) and largest lobe **5 px (5×1) at (885,157)** — the same arris rim line
at the same centroid as gold1. The tree under capture is the diagnosed one; base reproduces
gold1's quantities to the rounding digit (p50 86.2 vs 86.3, p99 185.1 vs 185.1 on the
occluded ROI, max 230.4 vs 230.4, ring p05 27.6, contrast 8.4).

### G-0c registration look — **PASS**

Tinted-mask overlay (gild magenta, `sandstone_worn` green) over `traversal.base.png` itself,
eyeballed at overview and 1:1: magenta rides the gilded beams/cornices with the beadRoll
molding visible through the tint and stops at the beam silhouette; green sits pixel-tight on
the sandstone door jambs; **no tinted patches on sky**. Saved:
`goldlobe1/reg-tinted-overview.png` (960×540), `goldlobe1/reg-crop-1to1.png` (420×320 at
x860,y223 — gild/sandstone/doorway triple boundary). A look, no numeric form, per the
goldtraversal §0.3 procedure.

**All three gates pass — P-F3 does not fire; this is a scoreable capture.**

## 3. Occluder derivation (goldtraversal §6 procedure, re-derived on goldlobe1 base)

Worked-example rects NOT reused — re-derived on this capture's own frames:

- **Pass 1 (no excludes):** raw gild mask 128,997 px, max L 255.0, thr 234.6 → **172 hot px,
  all in one cell x480-640 y240-360**, bbox x585–601 y246–262. Cropped: the **white FX glow
  sprite behind Sly**, brightest ~(585–594, 259–261) — same class, same place as gold1's
  (gold1: 178 px, brightest ~(588–603, 245–262)). Sly hangs from the rail mid-frame with
  cane and banded tail (visual extent ~x518–710, y202–360 incl. cane hook and tail tip);
  a rooftop guard with light headwrap stands through the top-right beam edge (~x878–940,
  y10–95).
- **Exclusion rects, derived from those extents and stamped into the jobs file:**
  `[500,190,740,400]` (Sly + FX glow + tail + cane hook, with margin), `[870,0,940,100]`
  (rooftop guard). Numerically identical to gold1's rects because the staging reproduces
  exactly (raw share 14.00 % to the digit, hot cell in the same cell, guard on the same
  parapet) — derived here from this capture's own hot-cell map and crops, then found to
  coincide.
- **Arm-aware check the base derivation cannot see:** the cand-vs-base diff footprint was
  cell-mapped against the mask — the glint moves px on Sly's cane (uMetal 1.0; changed px
  attributed to `hieroglyph_wall`/`hieroglyph_gilded` behind him, inside rect 1) and on the
  guard's fittings (cell x800–960 y0–120, inside rect 2 where gilded). Both stay covered in
  every arm.
- **Lobe-detector positive control (seal §3):** exclusion lifted, the detector returns the
  **170 px (17×15) FX glow lobe at (594,256)** (gold1: 173 px at (594,255)); exclusion
  applied, **5 px**. The instrument finds a lobe when one exists and the exclusion removes
  exactly the known non-gold one.

**Mask-census finding that shapes the crops below:** the hook-ring Sly hangs from and the
top-left Ra-disc are **`arch:gold_leaf` in the mask** (ring area census: 2,942 px gold_leaf
vs 800 hieroglyph_gilded), so the two most curved gilded objects in the frame are **not in
the registered `hieroglyph_gilded` ROI** — recorded here, adjudicated nowhere (the seal's
ROI is what it is).

## 4. Scores — every band quoted verbatim, number beside it

`goldgap.py` with `goldlobe1/goldgap-jobs-goldlobe1.json` (mask ROI maskid 7,
occluder-excluded, `lobe_min_rmb -5`) + `gildlit.mjs` (erode 2). Raw outputs:
`goldlobe1/RESULT-goldlobe-raw.json`.

### Cand arm (2.6 / 20), traversal — the candidate under scoring

| band | seal text (verbatim) | measured on cand | verdict |
|---|---|---|---|
| **B1'** | *"largest 4-connected component of L ≥ 0.92·ROImax ∈ [30, 400] px (the goldtraversal B1 band verbatim; the reference 84–146 px is the aim inside it)"* | **5 px (5×1) at (885,157)** — identical component to base; the glint formed no new lobe in the ROI | **FAIL — below interval** |
| **B2'** | *"gild share over L160 ∈ [3 %, 20 %] (the registered defect floor becomes the pass floor; combat same-boot re-anchor must stay > 20 %)"* | **2.17 %** (base 2.08 %); combat re-anchor **42.12 %** > 20 % ✓ | **FAIL — below floor** (re-anchor clause holds) |
| **B3'** | *"gild p50 / same-frame `sandstone_worn` p50 ∈ [0.85, 1.8] — the glint must not wash the body"* | **1.35** (86.3 / 64.0) | **PASS** |
| **B4** | *"ring p05 / gold body p50 ≤ 0.65 … > 0.65 ⇒ REVERT regardless of B1–B3"* | **0.32** (27.6 / 85.9), contrast 8.4 | **PASS — the winning half held** |
| **B5** | *"px past lobe edge ∈ [0, 40] (march convention as committed)"* | **0 px** (march [0,1], bg p50 80.8) | **PASS** |
| **B-p99** | *"gold ROI p99 ∈ [222, 252], reference window 239–244 named as the aim; p99 < 222 ⇒ the term under-delivers ⇒ REVERT (a bigger gain is a NEW prereg, not a live retune)"* | **186.5** (base 185.1; +1.4 L); ROI max 231.1 (base 230.4) | **FAIL — below 222 ⇒ REVERT** |
| **Cane guard** | *"on the same-boot `combat` frames, the cane region share over L250 must stay ≤ 2 % and the look note names the cane explicitly"* | measured below (§4-cane) | see §4-cane |

### Calibration arms, same boot

- **A-lo (1.6/20)** — seal: *"every scored quantity must order base < A-lo < cand on the tail
  axis."* Tail over160: **2.08 < 2.13 < 2.17** ✓; p99: **185.1 < 186.1 < 186.5** ✓; p95:
  134.5 < 134.9 < 135.2 ✓. **Dose ordering PASS** — the lever is live, monotone, and tiny.
- **KB-chrome (2.6/5)** — seal: *"must read as its own failure: B1' > 400 px (facet-wide
  over-lobe) OR B2' > 20 %. If it lands inside the pass bands, the area metric has not
  separated a known over-lobe ⇒ UNSCOREABLE registered outcome."* Measured: **B1' 7 px
  (3×3) at (283,206); B2' 2.50 %; p99 191.0; max 233.1.** KB-chrome did **not** read as the
  registered over-lobe failure — and it also did **not** land inside the pass bands: it
  failed **low**, a third outcome the seal did not enumerate. **P-F6 as worded does not
  fire** (nothing "passed"), but the chrome arm equally did not do its registered job of
  proving the metric sees a facet-wide over-lobe — because **the frame never produced one at
  a dose the port called certain**. Adjudication in §5.

### §4-cane — the cane/metal-population guard (combat, same boot) — **PASS**

Seal: *"the cane region share over L250 must stay ≤ 2 % and the look note names the cane
explicitly."* Cane region [400,390,730,600] (69,300 px — hook, shaft, and the FX slash
around Sly's lunge):

| arm | share L ≥ 250 | share L ≥ 240 | share L ≥ 230 | region max |
|---|---|---|---|---|
| base | **0.000 %** | 0.688 % | 7.319 % | 249.5 |
| Alo | 0.000 % | 0.693 % | 7.343 % | 249.5 |
| cand | **0.000 %** | 0.693 % | 7.352 % | 249.5 |
| KBchrome | 0.000 % | 0.711 % | 7.387 % | 249.5 |

Whole combat frame over L250: 0.000 % both arms. The region max (249.5, all arms identical)
is the **FX hit-spark**, glint-independent. **The look note, naming the cane explicitly: at
4x the cane's hook and shaft are visually unchanged base-vs-cand**
(`crops/cane-hook-4x.png`) — the uMetal 1.0 cane carries the strongest glint in the game by
construction, and in this framing its geometry still adds ≤ +0.005 pp at L240 and nothing at
L250. No clip, no blowout. Guard PASS.

## 4b. Where the glint actually went — the mechanism, measured (routing evidence, not a band)

ΔL = L(arm) − L(base) per pixel, occluded gilded ROI unless stated:

- **Cand on the registered ROI:** ΔL p99 **4.3** — 99 % of the 104k gilded px moved under
  ~4 L. 446 px ≥ +10, 103 px ≥ +25, max mover +71.4 at (525,184): base 92.9 → cand
  **164.3, still 48 L below the 212.6 lobe window**. The best-aligned beam pixel in the
  whole ROI never entered the detector's 0.92·max window — B1' 5 px is not a detection
  miss, it is the delivered dose on flat facets.
- **Cand on the hook-ring (`arch:gold_leaf`, outside the ROI):** ΔL max **+94.2**, absolute
  L 232.2 → **244.3** at (541,180) — **inside the seal's own 239–244 reference aim**. The
  crops show a connected, sun-aligned warm lobe on the ring's curved bar
  (`crops/ring-1to1.png`, `crops/ring-4x.png`, KB-chrome beside). **The term works exactly
  as designed where geometry sweeps R through the 15° cone — curvature — and the registered
  ROI has almost none of it.** The one curved gilded population in the seal's diagnosis
  (§1: beadRoll arris, "1–2 px wide by construction") is the 5 px line B1' keeps finding.
- **Cand on the Ra-disc (`gold_leaf`, top-left):** ΔL max 10.7, absolute max unchanged
  156.6 — its visible face is the unlit underside at this camera; R never approaches
  uKeyDir (`crops/radisc-1to1.png`, `radisc-4x.png`).
- **KB-chrome on the ROI:** ΔL p99 27.7, 3,607 px ≥ +10 — the pow-5 cone spreads wide, as
  registered — but abs p99 191.0 / max 233.1: **broad wash, no saturation**, so the
  0.92·max component stays 7 px. The port's "facet-wide over-lobe at a dose where it is
  certain" (R-G1's proving arm) assumed facets sit INSIDE the cone; the measured facet
  population sits far enough off-axis that even a 29.5° half-width lifts it by tens of L,
  not into a connected near-max patch.

The port (§1–§2) predicted core display **L 223** at the candidate dose, and the frame
delivers exactly that class of value — **but only on the ring (244.3 with bloom-side
shoulder), a `gold_leaf` surface outside the ROI.** The port's error was not amplitude; it
was **area**: it modeled the lobe's angular width and never modeled how much of the
`hieroglyph_gilded` population presents R within the cone. On flat beams the answer is
~zero, which is the same flat-facet mechanism the seal's own §1 diagnosis named for the old
`ndh` term (and R-G1 half-named for this one, in its fail-high direction).

## 5. Verdict

Pending. Ship decisions are the coordinator's; on any FAIL the registered move is
`TUNE.goldGlint` back to 0.0 (one constant — the scaffold itself stays, inert).
