# RESULT-hgchisel-frame — the frame half of §130.4's chisel pass

Scored against `PREREG-hgchisel-frame.md` (sealed + 5 timestamped amendments, all written while
`shots/hgc/` was empty and the capture was queued behind `fx21`).

Tree **a190e81, clean**. Arms captured by `progress/records/hgcframe.mjs` — one process, one vite
server, one browser, two page loads; `cand` = shipped, `ctl` = `globalThis.__TEX_AB='hgchisel'`
installed via `addInitScript` before reload. Instruments: `progress/records/hgcscore.mjs`,
`progress/records/gilddepth.mjs`, masks from `progress/records/matmask.mjs` in `ab-hgc/`.

---

## 0. What was verified before anything was built

- **`arrisPolish` is 0 in the shipped build**, confirmed independently rather than taken from the
  handoff. `Materials.js:2118` is `abOff('hgpolishx8') ? 0.60 : 0` and `Canvas2D.js:72`'s `abOff`
  returns false with no A/B flag set, so the shipped path is the `0` leg. §121.7's suspended rule
  stays discharged; `hgpolishx8` is retained as the calibration arm only.
- **The `hgchisel` arm is scoped to one expression.** `Materials.js:2076`; grep finds the key
  nowhere else in `src/`. Every other material is bit-identical between arms by construction and
  supplies the run's own drift floor (P4).
- **`src/textures/**` is unchanged this session.** The chisel pass shipped at `c54e41f` and
  survived the §139 rollback in the commit. Nothing below required a new texture edit.

### 0.1 One property of the one-boot design worth recording

`vite.config.js:13` sets `watch: { ignored: ['**/*'] }` under `SANDS_NO_HMR`, so the dev server's
file watcher is off and its module graph is never invalidated. Both arms are served from **one
server's module cache**, so a live `src/` edit by another agent between the two page loads cannot
reach arm 2 — a guarantee two separate `shot.mjs` boots do **not** have. Four agents were editing
during this run (`src/world/Props.js` was dirty in the working tree at capture time), so this is
not hypothetical.

Stated as what it is: a **reading of the config and of Vite's invalidation path, not a
measurement**. The measurement that backs or breaks it is P4 — if the bit-identical materials come
back near-still, the arms saw the same code; if one of them jumps, they did not.

---

## 1. The geometry findings, which changed what the frames could be asked

These are mask-and-camera measurements, arm-independent, and they were made *before* any frame
existed. Two of the three registered checks turned out to be aimed at surfaces the framings do not
present, and that is the substantive result of this section.

### 1.1 `temple` does not contain the architrave run P3 was written about

`gilddepth.mjs` rasterises the level twice, once whole and once with the material alone:

| `temple`, `arch:hieroglyph_gilded` | px | of frame |
|---|---|---|
| unoccluded | 167 801 | 18.2 % |
| **visible** | **16 451** | **1.79 %** |

**90.2 % of the gilded run is behind other architecture** — the nave column forest is 53.8 % of
that frame. What survives is three compact blobs whose **longest contiguous column run is 194 px**,
against a repeat of **127–244 px (p50 154)**. A 154 px lag cannot be measured inside 194 px, so
**P3 is NOT TESTABLE on `temple`** — recorded as untestable, not as a pass.

The repeat itself was right where the seal put it, by two errors that cancelled: the seal's 157 px
used `fov/H` (1.333 mrad/px) where the correct centre-of-frame scale is `2·tan(fov/2)/H` =
**1.446 mrad/px**, and the assumed 30.6 m against a measured p50 of 28.7 m absorbed the 8.4 %.

### 1.2 `hero`'s gilded mask is two populations 5× apart in depth

| `hero`, `arch:hieroglyph_gilded` | px | depth p5–p95 | px / repeat | longest contiguous run | repeats on screen |
|---|---|---|---|---|---|
| **far band, rows 24–140** | 45 789 | 26.2–42.0 m | **129–207 (p50 176)** | **552 px** | **2.7–4.3** |
| near mass, rows 300–620 | 190 653 | 4.5–11.6 m | 469–1202 (p50 873) | 844 px | ~1 |

The far band is **the only place in either shot where more than two contiguous repeats of this
recipe are on screen**, so it is the only framing in this pair where §130.4's stated tiling risk
can fail. Registered as P3's scoring band in Amendment 4, before any frame.

### 1.3 P2's whole-frame gate has power on `hero` and none on `temple`

1/8 squint cells that are ≥ 80 % gilded: `temple` **119 of 14 400 (0.83 %)**, `hero` **3 751
(26.05 %)**. A 0.83 % population cannot move a whole-frame sd by 10 % under any treatment, so a
`temple` whole-frame P2 pass is arithmetic. Registered as vacuous in advance.

### 1.4 §7.3's tiling condition at `temple`, measured rather than eyeballed

`temple` was named as the worst case for repeating wall and column texture. Measured through its
own camera:

| material | % of frame | depth p5–p95 | px / repeat | longest contiguous run | repeats on screen |
|---|---|---|---|---|---|
| `column_papyrus` | 53.8 % | 7.8–26.9 m | 257–892 (p50 562) | 435 px | 0.5–1.7 |
| `hieroglyph_wall` | 17.1 % | 14.3–35.6 m | 202–503 (p50 250) | 317 px | 0.6–1.6 |
| `hieroglyph_gilded` | 1.79 % | 18.2–34.8 m | 127–244 (p50 154) | 194 px | 0.8–1.5 |

Caveat on the `column_papyrus` row, stated rather than glossed: a column is a *curved* surface and
its U runs around the barrel, so "px per repeat" computed from a frontoparallel 10 m is only an
approximation — the visible face compresses toward the silhouette, which moves the true figure in
the conservative direction (fewer repeats visible, not more). The `hieroglyph_wall` and
`hieroglyph_gilded` rows are flat surfaces and carry no such caveat.

**No material at `temple` presents more than ~1.7 contiguous repeats.** The wall is seen in
vertical slices between columns and the columns are wider than half their own repeat. This agrees
with `RESULT-tx7` §2's by-eye and NCC result and supplies the missing *reason*: the condition
passes at this framing because the column forest never shows two repeats side by side — **not**
because the tile has been shown to be unusually good. Those are different claims and only the first
one is supported here.

### 1.5 Sub-pixel sweep of the chisel pass's own feature, at measured depths

`signM` is 0.85 m and is both the sign size and the gilded band height (`Materials.js:4721`). At the
corrected pixel scales and the *measured* depth distributions, the sign row subtends:

| | depth p5–p95 | sign row height |
|---|---|---|
| `temple` | 18.2–34.8 m | **32.3 → 16.9 px** |
| `hero` far band | 26.2–42.0 m | 27.5 → 17.2 px |
| `hero` near mass | 4.5–11.6 m | 160 → 62 px |

**I had this correction's sign backwards in a first draft and am recording it rather than quietly
fixing it.** `px = size / (d · mradPerPx)`, so the *larger* correct pixel scale makes features
**smaller**, not larger: if §130.4's four framings used the same `fov/H` approximation, its 5.2 px
minimum sign body is **~4.8 px**, not 5.6. Still comfortably above one pixel, so the conclusion is
unchanged — but the direction is the part that has cost this project real time before, and a
"correction" that moves a number the wrong way is worse than no correction.

The sign *bevel* is: `bevelPx 1.8` at the 512 build over a 6.4 m tile is 22.5 mm, which is
**0.45–0.86 px across `temple`'s depth range**. That is by design and is not a defect — the bevel
only softens the edge of a sign body that is itself 5–32 px, and `carve`'s ramp is 1 across the
sign's interior, which is where `signSink`/`signBurnish` are spent. Recorded because a bevel is
exactly the kind of feature the `MOTES.size` / `sand_ripples` class was lost in, and because the
arris ring (2.25–4.51 px) and panel bevel (0.75–2 px) both returned nulls at similar sizes.

---

## 2. Two instrument defects, both found before any frame existed

- **The inherited autocorrelation is not an NCC and returns out-of-range values.**
  `progress/records/hgframe.mjs:64` and `progress/records/acf.mjs:15` both normalise by
  `v0 · k / N`; on a 194 px strip that printed **ρ = −1.370**. No correlation can be −1.370.
  `hgcscore.mjs` uses a per-lag Pearson coefficient over the overlapping window instead, which is
  bounded by construction. **The expression is still live in those two files** — recorded rather
  than silently edited, because results were scored with them and a quiet fix would make those
  results unreproducible.
- **First-to-last column spans silently bridge occlusion gaps**, so a gap-filled profile
  correlates the interpolator rather than the wall. The span is now the longest *contiguous*
  supported run.

Instrument null verified: same PNG scored against itself gives **0.00 % on every statistic** and
0 differing pixels.

---

## 3. The registered P3 gate is a weak instrument, and this project has already withdrawn a finding of its shape

`tools/wallstrip.mjs`'s header records that across a bit-exact known-bad A/B on `hieroglyph_wall`
(`cartouche: true`, whose own note calls the repeats "trivially countable"), **none of 28 scalar
measurements separated shipped from known-bad** — 2D luma NCC **0.482 vs 0.488** among them —
because a landmark occupying ~1.2 % of a tile cannot move a global moment. It also records that
*"a withdrawn 0.482-against-a-0.45-threshold finding was produced exactly that way."*

**My P3 is that same statistic against that same threshold.** It is reported below with its number,
and the number is **not treated as evidence on its own**. The evidence for the tiling condition is
the render at the framing's own px/repeat next to its known-bad, which is the one instrument here
that was calibrated — `progress/records/gild/x-cmp-temple.png` is that calibration (top row
shipped, bottom row the same tile with a black oval stamped once per repeat; the bottom row's seven
repeats are countable at a glance and the top row's are not).

---

## 4. Frame results

*(pending — the capture is queued behind `fx21` and `charink`; this section is filled from
`shots/hgc/` and `ab-hgc/*.json` when the arms land.)*
