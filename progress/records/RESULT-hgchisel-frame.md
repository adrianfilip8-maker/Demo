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

Frames: `shots/hgc/{temple,hero}.png` (cand) and `{temple,hero}-ctl.png` (ctl), 1280×720, quality
`high`, one boot / one vite server / one browser / two page loads. `shots/hgc/report.json` records
**`cand.abStamp = false`, `ctl.abStamp = true`** and the control's boot warnings carry
`textures: A/B CONTROL BUILD — treatments disabled: hgchisel` — so the control arm is *asserted*,
not inferred from the filename, which is what the seal required. Scorer
`progress/records/hgcscore.mjs`; its autocorrelation is confirmed to be the bounded per-lag Pearson
NCC (`hgcscore.mjs:149–179`, means removed per overlap window, normalised by `√(sxx·syy)`), not the
§144 estimator — every ρ printed below is inside [−1, 1]. `hgframe.mjs` and `acf.mjs` still carry
the unbounded form behind their warning headers and were not used.

### 4.0 Provenance, stated before the numbers

**The capture tree is not the seal tree, and I am recording it rather than letting the stamp pass
unremarked.** The seal is `a190e81` clean; `report.json` stamps **`5b3d9ae`, dirty**. Between them,
`src/world/EgyptLevel.js` (+15/−1) and `src/world/Props.js` (+65) landed — PROPS' Task #28
inverted-hull shells on hero sculpture. Nothing in `src/textures/**` moved.

Three consequences, in order of how much they matter:

1. **The A/B is unaffected.** Both arms are the same process and the same module graph
   (`vite.config.js:13` disables the watcher under `SANDS_NO_HMR`, so a live `src/` edit between
   the two page loads cannot reach arm 2). Whatever tree the frames are of, both arms are of *that*
   tree.
2. **The masks in `ab-hgc/` were built at 17:46, before `8dd664f` (18:12).** So they do not know
   about the new prop hulls. A hull that covers a masonry pixel makes the mask attribute ink to
   masonry. This is **common-mode** — identical in both arms — so it cannot create a cand−ctl
   delta; it can only add pixels that are incapable of changing, which **dilutes** every Δ below.
   Every P1 figure is therefore a lower bound on the in-material effect, not an upper one.
3. The `dirty` flag is another agent's working tree, not mine; `src/textures/**` is clean and
   unchanged this session.

### 4.1 P4 first — the null floor, because nothing above it is quotable until it is measured

Five materials bit-identical between arms by construction. `relLocalContrast` r=8, cand vs ctl:

| null material | `hero` Δ | `temple` Δ |
|---|---|---|
| `arch:sandstone_block` | **−0.05 %** | +0.00 % |
| `arch:paving_courtyard` | +0.05 % | −0.00 % |
| `arch:hieroglyph_wall` | −0.01 % | −0.00 % |
| `arch:column_papyrus` | +0.04 % | +0.00 % |
| `arch:limestone_polished` | +0.00 % | +0.00 % |

**The run's drift-plus-coupling floor is ±0.05 % on `hero` and ±0.01 % on `temple`.** `temple`'s
nulls move 0–72 pixels each out of 13 k–472 k; `hero`'s largest is `paving_courtyard` at 830 px
(0.70 % of its mask), which is where bloom and ink spill from the changed architrave lands. **P1 is
quotable.** It also confirms §0.1's config reading by measurement rather than by argument: the two
page loads saw the same code.

Independent confirmation that the treatment is scoped where the seal said it was — every pixel
changing by >2 codes on `hero`, filed by *un-eroded* mask label:

```
arch:hieroglyph_gilded  55 797   (95.6 %)      arch:column_papyrus     145
arch:paving_courtyard    1 064                 arch:sandstone_block    132
(none / other)             532                 arch:limestone_polished 116
arch:hieroglyph_wall       297                 …7 more, ≤107 each      TOTAL 58 360
```

95.6 % inside the target material; the 4.4 % remainder is a thin halo of edge antialiasing, ink and
bloom spill, spread across every other material in the frame. No second material moved.

### 4.2 P1 — LEGIBILITY: **PASS on `hero`, decisively. PASS in direction on `temple`, marginally.**

| | mask px (eroded) | % frame | r=8 ctl → cand | **Δ (GATE)** | r=4 | r=16 | mask px changed >2 codes |
|---|---|---|---|---|---|---|---|
| **`hero`** | 252 700 | 27.42 % | 0.28733 → 0.30233 | **+5.22 %** | +4.44 % | +5.29 % | 53 534 (**21.18 %**) |
| **`temple`** | 10 781 | 1.17 % | 0.14983 → 0.15025 | **+0.28 %** | +0.06 % | +0.39 % | 743 (**6.89 %**) |

Both up, at every scale in the profile, so the gate and the profile agree and there is no
disagreement to report. `hero` is **104× its own null floor**; `temple` is ~28× a floor that is
itself at the arithmetic noise of the instrument.

**Amendment 6's decomposition, which is the part that decides how strong this is.** The statistic is
`rms(L − box8) / mean(L)`, and the chisel pass sinks the sign floors, so a pure darkening would pass
it with no added detail:

| | numerator `rms(L−box8)` | denominator `mean L` | verdict |
|---|---|---|---|
| **`hero`** | 0.05857 → 0.06109 **(+4.30 %)** | 0.20384 → 0.20206 (−0.87 %) | **carried by added detail** — 82 % of the ratio's rise is the numerator |
| **`temple`** | 0.06251 → 0.06258 (+0.11 %) | 0.41720 → 0.41651 (−0.17 %) | **majority carried by the darkening** — 39 % numerator, 61 % denominator |

So `temple`'s P1 passes as sealed and must be reported as the weaker result Amendment 6 defined in
advance: at 18–35 m the sign row is 17–32 px and what survives the grade is mostly the sink, not the
relief.

**The image, which is not subordinate to the above** (P5).
`progress/records/crops/hgc-hero-near-4x-sbs.png` and `hgc-hero-near-1x-sbs.png` — ctl | cand |
|Δ|×8, the near architrave at 4× and at **1:1**:

- **ctl**: the architrave face is a smooth rust-and-teal mottle. Nothing on it reads as writing.
  At whole-frame scale (`shots/hgc/hero-ctl.png`) that surface is 27 % of the money shot and it is
  close to §7.3's *"any surface reads as flat vertex colour with no texture detail"*.
- **cand**: distinct carved signs — a seated-figure blob, vertical strokes, a horizontal bar, ovals,
  two club/mace forms — each with a dark core and a lit arris on one edge, reading as **cut into**
  the stone rather than painted on. **They read at 1:1**, not only at 4×, which is the check that
  matters and the one that has been failed here before.
- **|Δ|×8**: the change is *sign-shaped*. It is confined to the sign bodies and their bevels; there
  is no global wash. A darkening-only treatment would show as a flat grey field in this panel.

`hgc-temple-band-4x-sbs.png` shows the same thing at `temple`'s scale and honestly: the diff is a
scatter of small sign-shaped marks, visible but faint. It agrees with +0.28 % / 6.89 %.

### 4.3 P2 — THE BUSY/NOISY CONDITION, which outranks P1: **PASS on `hero`. Vacuous on `temple`.**

| | whole-frame squint sd 1/8, ctl → cand | **Δ (GATE ≤ +10 %)** | cells ≥80 % gilded | verdict |
|---|---|---|---|---|
| **`hero`** | 0.14962 → 0.15025 | **+0.42 %** | 3 751 / 14 400 (26.05 %) | **PASS, with power** |
| `temple` | 0.12595 → 0.12595 | −0.00 % | 119 / 14 400 (0.83 %) | **vacuous**, as pre-registered |

`temple`'s pass is arithmetic and is reported as such, per Amendment 3. **`hero` is where P2 was
registered to be decided and `hero` passes it with 4 % of its allowance used.**

**This is the number I pre-registered as the one I would fail on, and it is worth being explicit
about what happened to it.** The texture-side band squint sd was **+35.7 %**, against **+49 %** for
the historic ashlar-blotching known-bad. In frame the in-mask squint sd — the direct analogue of
that statistic, registered as diagnostic and not as a gate — is **+2.50 %** on `hero` and +0.35 % on
`temple`. A **14× attenuation**. The disturbance is real and it is at sign scale; by the time it is
box-averaged 8× into frame masses and put through the grade at a mean luma of 0.204, it is a
fortieth of the whole-frame allowance.

So the question the clause existed to answer is answered, and answered the way the seal said only
the frame could answer it: **it was sign-scale structure, not mass-scale blotching.**
**`HG_SIGN.sink` does not come down. P1 is not forfeit.**

The picture (`hgc-hero-squint8-sbs.png`, 1/8 downsample shown at 4×, |Δ|×12): the two squint frames
are indistinguishable — pylon, architrave, doorway and paving masses read identically, subjects
still instant. The diff panel is a scatter of sign-scale specks confined to the architrave, with no
blotch, no camouflage patching and no new mass-scale variation. Both §7.3 conditions hold at once at
this framing.

### 4.4 P3 — TILING: **NOT TESTABLE on `temple`. FAILS its registered threshold on `hero`, identically in both arms.**

**`temple` — NOT TESTABLE, exactly as Amendment 2 registered it.** Longest contiguous supported
column run **193 px**, so the maximum measurable lag is 96 px, below the band's own minimum repeat
of 127 px. The scorer prints the verdict rather than the number. This is **not** recorded as a pass.

**`hero` rows 24–140, the registered band (Amendment 4).** Gate: max ρ over lags 30–300 ≤ 0.45.

| band | run | ctl max ρ (lag) | cand max ρ (lag) | Δ |
|---|---|---|---|---|
| **far, rows 24–140** | 552 px, lags to 276 | **0.815** (30) | **0.816** (30) | **+0.001** |
| by rule, rows 301–652 | 844 px | 0.314 (30) | 0.326 (75) | +0.012 |
| near mass, rows 300–620 | 844 px | *not testable* — max lag 300 < 469 px min repeat | | |

**As sealed, the candidate is 0.816 against a 0.45 ceiling, so P3 fails on the band it was
registered on.** I am reporting that as a fail and not converting it into anything else. Two facts
sit next to it and neither is an excuse:

1. **The control fails identically at 0.815.** The treatment moved the statistic by **0.001**, or
   0.3 % of the 0.365 that separates the control from the gate. Whatever is producing 0.815, the
   chisel pass did not produce it and removing the chisel pass does not fix it.
2. **What is producing it is a ramp, not a repeat** — measured, not assumed
   (`progress/records/hgcdetrend.mjs`, labelled post-hoc, not a gate, and it cannot change P3's
   score):

   ```
   raw ρ at the short end:  lag1 0.987  lag2 0.965  lag3 0.944  lag4 0.927   ← monotone decline
   trend (box-300) carries 54.9 % of the profile's variation
   detrended max ρ in 30–300:                     0.317 (lag 270, the edge of the window)
   detrended max ρ inside the repeat range 129–207: 0.283 (lag 200)
   detrended ρ at 129 −0.174 · 137 −0.047 · 154 −0.105 · 157 −0.050 · 176 0.102 · 192 0.130
   ```

   A monotone decline from lag 1 with no peak at the repeat is the signature of a luminance ramp
   along a receding surface, which is what the far band is. Detrended, **nothing in the band's own
   repeat range reaches 0.29**, and both arms agree to within 0.003.

**The honest verdict on the gate itself: I registered a threshold my instrument could not meet on
this band regardless of the texture, and I did not notice because I chose the band from geometry
(where the repeats are) without checking what else was in the profile (a 55 % trend).** That is the
fourth instrument defect in this run's family and the third I found in my own tool. The seal's own
§3 already said this statistic is weak and *"not treated as evidence on its own"* — it was more
right than I knew when I wrote it.

**The tiling condition itself, decided by the render as the seal said it must be.** §130.4's
registered risk was that the seam row now carries a `bee` at 3.01× median area and a `falcon` at
2.85× **per repeat**, where before the change none of them rendered — so the condition previously
passed by having nothing to see, and a rhythm would be a real cost of a real fix.

- **At `hero`'s near mass** the repeat is 469–1202 px (p50 873) across an 844 px run: **at most one
  repeat is on screen**, so a repeating *sequence* cannot appear and a low ρ there is arithmetic.
  Two club/mace forms do occur inside the same 200 px (1:1) crop in `hgc-hero-near-4x-sbs.png` —
  well inside the 469–1202 px tile period, so that is two occurrences of one glyph within a single
  text run, which is what writing looks like, and not the tile repeating.
- **At `hero`'s far band**, where 2.7–4.3 repeats *are* on screen, the treatment is invisible:
  `hgc-hero-far-2x-sbs.png`'s diff panel is black. The gilded pixels in rows 24–140 are the
  architrave's **top fascia seen nearly edge-on at 26–42 m**, a ~10 px warm strip, not its sign face
  — so the oversized seam-row signs are not presented there at all.

**So the finding is Amendment 3's pre-registered one, and it must be written as the first of these
and not the second: *the tiling risk §130.4 raised is not reachable at these two framings* — not
*the tiling is fine*.** The one framing that shows enough repeats does not show the signs, and the
one that shows the signs does not show enough repeats. Closing this needs a camera that puts the
gilded band square-on at 15–25 m; no canonical shot does, and framing is not TEXTURES' to change.

### 4.5 P5 and the scoping diagnostic (Amendment 5) — not a gate

Sunlit share of the gilded mask at the registered `L ≥ 120/255` cut:

| band | px | mean L (0–255) | sunlit |
|---|---|---|---|
| `hero`, whole rule band | 192 953 | 45.2 → 44.6 | 1.24 % → 1.27 % |
| `hero`, far band | 39 372 | 85.3 → 85.3 | **2.03 %** |
| `hero`, near mass | 184 652 | 45.4 → 44.7 | 1.30 % |
| **`temple`, rule band** | 4 750 | **114.2 → 113.9** | **56.57 % → 56.29 %** |

`RESULT-tx7` §4 measured 1.4 % on `hero` and concluded *"no frame in the tested set has key-lit
gilded at size"*. **Both halves of that need narrowing in one direction and confirming in the
other.** `hero` is confirmed on a second, independent run and on both of its populations: the far
band is no better lit than the near mass in any way that matters (2.0 % vs 1.3 %), so splitting the
mask by depth does not find lit gold hiding inside it. But **`temple`'s gilded band is 56.6 % sunlit
at mean L 114** — four times `hero`'s mean and a majority-lit population. It is **4 750 px, 0.52 %
of frame**. So the sentence that survives is the one with *at size* in it, and the sentence "no
canonical frame has key-lit gilded" is false and should not be repeated. This changes nothing about
who owns §7.3's gold line — it is still SHADING's and POSTFX's — but it names the framing where a
gold-occlusion A/B would at least have lit pixels to act on.

### 4.6 Scorecard

| check | `hero` | `temple` |
|---|---|---|
| **P1** legibility | **PASS** +5.22 %, carried by detail (+4.30 % numerator), 21.18 % of mask changed, legible at 1:1 | **PASS** +0.28 %, majority carried by the darkening — the weaker result Amendment 6 defined |
| **P2** busy/noisy *(outranks P1)* | **PASS** +0.42 % vs a +10 % gate, with power (26.05 % of cells) | **vacuous** −0.00 %, 0.83 % of cells, pre-registered as such |
| **P3** tiling | **FAIL as sealed** 0.816 vs 0.45 — but ctl is 0.815, and detrending shows a ramp, max 0.283 in the repeat range. Not caused by, and not fixable by, this change | **NOT TESTABLE** — 193 px run vs a 127–244 px repeat |
| **P4** null floor | **PASS** ±0.05 % against a +5.22 % signal | **PASS** ±0.01 % |
| **P5** the image | **PASS** — legible carved signs at 1:1 where the control has an unreadable mottle; squint masses indistinguishable | consistent, faint |

**Action registered by the seal and now discharged: P2 did not fail, so `HG_SIGN.sink` stays where
it is and P1 stands.** The one thing this run cannot say anything about is tiling, and it cannot say
it because neither framing presents the surface — which was measured and written down before the
frames existed, not discovered in them.

### 4.7 Invariants, re-measured rather than asserted

`git status --porcelain` shows **`src/textures/**` clean** — no uncommitted edit, and the last
commit touching it is `c54e41f`, the chisel pass these frames verify. `tools/texlab.mjs --all
--size 512` over all 44 recipes, at the capture tree:

- **`darkTail` is 0.0000 on all 8 `group: 'stone'` recipes.** The only non-zero values in the whole
  catalogue are `ceiling_stars` 0.0005 (`carved`), `sand_wet` 0.0003 / `nile_mud` 0.0941
  (`organic`), the deliberately-black character maps (`mask_black` 1.0, `leather_boot` 0.767,
  `fur_tail_rings` 0.274, `fur_sly` 0.003) and the FX decals (0.022 / 0.513) — **identical to the
  state §13 records.** Nothing moved.
- **Every joint delta is negative**, on all 9 recipes that carry one, in both components:
  `hieroglyph_gilded` dY −0.1381 / dH −0.3048, `hieroglyph_wall` −0.0224 / −0.2972,
  `paving_courtyard` −0.1609 / −0.3904, `sandstone_block` −0.1538 / −0.3183, plus `sandstone_worn`,
  `limestone_polished`, `mudbrick`, `relief_figures`, `column_papyrus`. The chisel pass did not
  flip the gild's joint sign.

**My first version of this check passed both invariants and was measuring nothing**, and it is worth
one line because it is this file's own recurring shape. It opened with `if (!r.ok) continue;` — and
`texlab.mjs`'s rows carry **no `ok` field at all** (that is `Textures.report()`'s schema, not the
lab's), so the loop skipped all 44 rows and printed `NONE` twice. It was caught only because
`ceiling_stars`' 0.0005, which I already knew from §13, failed to appear in a list that should have
contained it. **A checker that returns the expected answer for zero rows is indistinguishable from
one that passed** — the second field name in the same check, `jointDeltaY`, was wrong too (the lab
nests it under `joint`), so both halves were vacuous simultaneously.
