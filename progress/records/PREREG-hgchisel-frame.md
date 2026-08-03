# PREREG-hgchisel-frame — restated and re-sealed before any frame of this run exists

TEXTURES. The **frame half** of §130.4's chisel pass (`hieroglyph_gilded`'s `'sign'` layer, the
`HG_SIGN` carve). The texture half is shipped and scored offline: control 9/9, band luma span
p95/p5 **1.549 → 2.275**, §125's row/frieze ratio **5454× → 1.0×**, signed diff **−0.0439 on cut
texels against +0.0031 on the field**. Nothing below re-opens any of that.

## Provenance of this document, stated because it is a restatement and not the original

The original capture prereg for this change was written into the session scratchpad and **was
destroyed by the container rollback recorded as §139**. It was never promoted into the repo, which
is precisely the failure §139.1 says the sweep rule exists to prevent, and I am recording it as my
own miss rather than as an accident.

This restatement is still a genuine preregistration, and the reason is checkable rather than
asserted: **`shots/` contains no capture of this run, `ls shots/` is empty of `hgc-*`, and the
capture process has not been launched at the time this file is written.** The three checks and
their thresholds below are reproduced from the coordinator's verbatim recital and from §130.4's
own record of the two risks TEXTURES raised against itself ("the seam row now carries a `bee` and
a `falcon` per repeat" and "band squint sd is +35.7 %, the one number I would fail this on").
No threshold is invented here and none is loosened. If a number below disagrees with a copy of the
original that turns up later, **the original wins and this file is the error.**

§14's trap applies in the other direction too and is worth naming once: *a missing `shots/`
directory is not evidence that a run did not happen.* It is also not evidence that one did. The
claim above is about the launch, not about the directory.

## Tree

`git log` **a190e81**, working tree **clean** (`git status --porcelain` empty) at seal time.
The chisel pass, `glyphArchitrave`'s `'sign'` mode, `HG_SIGN`, and `arrisPolish` at 0 are all
**committed** — they survived the rollback because they had been swept before the report.

`arrisPolish` verified independently rather than taken from the handoff: `Materials.js:2118` reads
`const arrisPolish = abOff('hgpolishx8') ? 0.60 : 0;` and `Canvas2D.js:72`'s `abOff` returns false
when `VITE_TEX_AB` is unset, so the shipped build is **0**. §121.7's suspended rule is discharged
and stays discharged.

## Arms — one boot, one browser, two page loads

| arm | how | out |
|---|---|---|
| **cand** (shipped) | no A/B flag | `shots/hgc/temple.png`, `hero.png` |
| **ctl** | `globalThis.__TEX_AB = 'hgchisel'` via `addInitScript` + reload | `shots/hgc/temple-ctl.png`, `hero-ctl.png` |

`hgchisel` is scoped to one expression — `Materials.js:2076`, `const signs = abOff('hgchisel') ? null
: rasterMask(size, layout('sign'))` — and grep confirms the key appears **nowhere else in `src/`**.
`signRamp` is then null and every term below it reads zero, so the control is the pre-§125 state
**bit-exactly** and every other material in the level is bit-identical between the arms. Those
untouched materials are this run's own noise floor (P4).

Both arms are the **same process, same vite server, same browser, same viewport**, 1280×720,
quality `high`. `Textures.init()` stamps `textures: A/B CONTROL BUILD — treatments disabled:
hgchisel` into `window.__GAME.warnings` on the control load; **an arm whose warnings lack that line
is not the control**, whatever the file is named, and the scorer asserts it rather than trusting
the filename.

Order is **cand first, then ctl**, fixed here for one reason that is not aesthetic: P3 is an
absolute threshold scoreable from the candidate arm alone, so a run that dies after the first arm
still answers one of the three questions.

## The three checks

**P1 — LEGIBILITY, the thing the change is for.** Band local contrast inside the
`arch:hieroglyph_gilded` mask must be **up** on `temple` and on `hero`, cand vs ctl. Local contrast
is `std(L) / mean(L)` over the mask's high-pass residual at the band scale, computed identically on
both arms with the identical mask (built from geometry, so it cannot move with the treatment).
*Falsifier: flat or down on either shot ⇒ the chisel pass does not reach the frame at these
framings, and the offline win is a texture-side null of §70's kind. Report it as that.*

**P2 — THE BUSY/NOISY CONDITION, and it outranks P1.** Squint standard deviation of the frame
masses (heavy downsample, the §7.3 squint test made numeric) **must not rise more than +10 %**
against the control, whole frame, both shots.

> **If P2 fails, `HG_SIGN.sink` comes down and P1 is forfeit.** That is registered as an action,
> not as a discussion. The offline number that motivates this clause is band squint sd **+35.7 %**
> against the **+49 %** the historic ashlar-blotching known-bad moves — my own honest reading was
> *"the one number I would fail this on"*, and the frame is the only thing that can say whether
> that is sign-scale structure (which is the point) or mass-scale blotching (which is the
> regression §2 of KNOWN_ISSUES records, and which a first pass already produced once).

Both §7.3 conditions have to pass **at once**: "any surface reads as flat vertex colour" and the
busy/noisy failure. P1 is the first, P2 is the second, and a pass on one while failing the other is
exactly the regression that has already happened here twice.

**P3 — TILING, at the framing that is the worst case.** Horizontal NCC autocorrelation along
`temple`'s gilded architrave run: **no lag in 30–300 px may exceed 0.45.** The run's own repeat is
**157 px** — 6.4 m of world (`HG_GILDED_TILE 3.2 × ARCH_UV 2`) at 1.333 mrad/px (fov 55 over 720
rows) is 192 px at 25 m and 137 px at 35 m, and 157 px is the middle of the run. Because the
architrave recedes, the repeat is a *band* and not a line, which is why the check is written as a
whole-band ceiling rather than as one lag.

Registered as a real risk against my own change, not discovered afterwards: §130.4 records that the
seam row now carries a `bee` (3.01× median area) and a `falcon` (2.85×) **per repeat**, and that
*"before this change none of them rendered, so the tiling condition passed by having nothing to
see."* P3 is the check that can fail on that.

**P4 — SAME-RUN NULL POPULATION.** `sandstone_block`, `paving_courtyard`, `column_papyrus`,
`hieroglyph_wall`, `limestone_polished` are bit-identical in both arms. Their P1 and P2 statistics
are this run's coupling-plus-drift floor. *If an untouched mask moves as much as the gilded mask
does, P1 is **unquotable, not passed** — §74.1's outcome, and the reason PREREG-hgrelief carried
the same clause.*

**P5 — THE IMAGE, and it is not subordinate to any number above.** 1:1 and 4× crops of the
architrave band on both arms, plus the heavy-downsample squint pair. §7.3 is scored by eye and the
numbers are how I avoid fooling myself, not the other way round. A cand crop that reads as legible
writing and a squint pair whose masses are indistinguishable is what a pass looks like.

## AMENDMENT 1 — the statistics' definitions, sealed while the capture is still queued

Zero PNGs of this run on disk (the capture is detached as pid 23078 and is **third in the FIFO**,
behind `fx21` holding and two tickets ahead of mine). No threshold above is changed. This fixes the
scorer's free choices before it can see a frame, per §81.3 — amend and timestamp, never adjust
afterwards. The original prereg's copies of these definitions went with the scratchpad, so they are
re-derived here from the project's existing instruments rather than invented.

- **Mask handling.** `matmask.mjs` masks at 1280×720, **eroded 3 px**, exactly as
  `progress/records/hgframe.mjs` already does, so silhouettes and ink are not counted. Measured
  today: `arch:hieroglyph_gilded` is **29.49 % of `hero`** and **1.79 % of `temple`** — hero is the
  decisive framing for P1 and temple is the decisive one for P3.

- **P1's statistic — relative local contrast, `rms(L − box(L, r)) / mean(L)`** over the eroded
  mask, on display luma. **The gate is `r = 8`** (a 17×17 box high-pass, which passes the small end
  of §130.4's measured sign-body range of 5.2–54.5 px). `r = 4` and `r = 16` are reported alongside
  as a **scale profile, not as alternative gates** — if the profile and the gate disagree, the gate
  is what P1 scores and the disagreement is the finding.

- **P2's scale — 1/8 box downsample**, the squint scale this project already uses everywhere
  (`abtex.mjs:211` `squint8`, `wallstrip.mjs:146`, `texlab.mjs:259`). **The +10 % gate is on
  WHOLE-FRAME squint sd**, which is what "the frame masses" means and what §7.3's squint test
  scores. In-mask squint sd is also reported because it is the direct in-frame analogue of the
  texture-side **+35.7 %** that motivated this clause — it is **diagnostic and is not a second
  gate**, and I am writing that down now so I cannot later quote whichever of the two is kinder.

- **P3's band, chosen by rule and not by eye.** Rows whose gilded-mask column count is ≥ 25 % of
  that shot's maximum; the longest contiguous run of those rows is the band. ACF is the mask-
  restricted column-mean profile, gap-filled, over lags 1–300, exactly `hgframe.mjs`'s
  implementation. The gate is `max ρ over lags 30–300 ≤ 0.45`.

- **P4's floor** is P1 and P2 recomputed on `arch:sandstone_block`, `arch:paving_courtyard`,
  `arch:hieroglyph_wall`, `arch:column_papyrus`, `arch:limestone_polished` — bit-identical between
  arms by construction, so their movement is this run's drift-plus-coupling floor.

## AMENDMENT 2 — P3's premise is wrong, measured off geometry, still zero frames on disk

Zero PNGs of this run on disk; the capture is still queued (pid 23078, `fx21` holding). **No gate
below is loosened and no threshold is changed.** What this records is that P3, *as registered*,
asks for a measurement the frames cannot supply, and the reason is arm-independent: it comes from
the level geometry and the shot cameras, which the treatment cannot move. That is why amending it
here is not data-dependent in the way that matters — I still cannot see what either arm did.

**The seal said "temple's architrave run". Measured through `temple`'s own camera, there is no run
to correlate along.** `progress/records/gilddepth.mjs` (new) rasterises the level twice, once
whole and once with the material alone:

| `temple`, `arch:hieroglyph_gilded` | px | of frame |
|---|---|---|
| unoccluded (material rasterised alone) | 167 801 | 18.2 % |
| **visible (full z-test)** | **16 451** | **1.79 %** |

**90.2 % of the gilded architrave run is behind other architecture** — the nave column forest,
which is **53.8 % of that frame**. What survives is three compact blobs; the **longest contiguous
gilded column run in the frame is 194 px**, and a 154 px lag cannot be measured inside 194 px.

The repeat itself is not the problem — it is right where the seal put it. Depth p5..p95 is
18.2–34.8 m, so the 6.4 m repeat subtends **127–244 px, median 154**, and **100 % of temple's
gilded pixels have a repeat inside the registered 30–300 px band**. Two small corrections to the
seal's arithmetic, both mine: the 157 px used `fov/H` (1.333 mrad/px) where the correct
centre-of-frame pixel scale is `2·tan(fov/2)/H` = **1.446 mrad/px**, an 8.4 % understatement, and
the assumed 30.6 m against a measured median 28.7 m happened to cancel it — 157 vs 154 is right by
two compensating errors, not by derivation.

**`hero` has the long continuous run but mostly not the repeat.** Gilded there is **29.5 % of
frame**, 79.2 % of it unoccluded, spanning **1274 contiguous columns** — but depth p50 is 7.1 m, so
the repeat is **157–1202 px, median 765**, and only **23.4 %** of its pixels have a repeat inside
30–300. You are looking at roughly one repeat, close up.

So the two shots split the check between them and neither carries both halves:

- **P3 on `temple` is scored NOT TESTABLE**, with the measurement above as the reason. It is not
  scored as a pass — an untestable check that gets recorded as a pass is how a condition survives
  three critic rounds.
- **P3 is additionally computed on `hero`**, over lags to `N/2`, reporting the max in the
  registered 30–300 band **and** ρ at hero's own repeat range. A pass in 30–300 on `hero` is
  reported as what it is: a pass in a band that contains 23.4 % of that material's pixels.

**Two instrument defects found in the same pass, both before any frame existed.**

1. **The inherited ACF is not an NCC and returns out-of-range values.** `hgframe.mjs:64` and
   `acf.mjs:15` normalise by `v0·k/N`; on the 194 px temple strip that printed **ρ = −1.370**. No
   correlation can be −1.370. Replaced in `hgcscore.mjs` with a per-lag Pearson coefficient over
   the overlapping window, bounded by construction. **The same expression is live in those two
   other files** — recorded here rather than silently edited, since results were scored with them.
2. **First-to-last column spans silently bridge the gaps.** On a run cut into blobs, gap-filling
   between blobs correlates the interpolator. The column span is now the longest *contiguous*
   supported run.

**And the gate itself is weaker than it looks — this project has already withdrawn a finding of
exactly its shape.** `tools/wallstrip.mjs`'s header records that across a bit-exact known-bad A/B
on `hieroglyph_wall` (`cartouche: true`, whose own note calls the repeats "trivially countable"),
**none of 28 scalar measurements separated shipped from known-bad** — 2D luma NCC **0.482 vs
0.488** among them — because a landmark occupying ~1.2 % of a tile cannot move a global moment.
It also records that *"a withdrawn 0.482-against-a-0.45-threshold finding was produced exactly that
way."* **My P3 threshold is that same 0.45 against that same statistic.** So P3 is reported with
its number, and the number is explicitly **not treated as evidence on its own**; the evidence for
the tiling condition is the render at the framing's own px/repeat plus the squint, which is the one
instrument here that was calibrated against a known-bad. The `x-{ctl,cand}-temple*` and
`x-{ctl,cand}-hero-lit*` pairs in `progress/records/gild/` are that render, already on disk.

## AMENDMENT 3 — which shot each gate can actually decide, computed from the masks alone

Still zero PNGs of this run on disk; still queued. Mask-only arithmetic, so still arm-independent.
**No threshold is changed.** This records each gate's *power* in advance, so that a pass cannot
later be quoted from a shot where the gate could not have failed.

Counting 1/8 squint cells that are ≥ 80 % gilded — the cells P2's whole-frame statistic lets the
treatment touch at all:

| shot | cells ≥80 % gilded | of 14 400 |
|---|---|---|
| `temple` | 119 | **0.83 %** |
| `hero` | 3 751 | **26.05 %** |

So **P2's whole-frame gate has essentially no power on `temple`** — 0.83 % of the cells cannot move
a whole-frame sd by 10 % under any treatment — and **real power on `hero`**. Registered now, before
the frames: *a `temple` whole-frame P2 pass is vacuous and will be reported as vacuous, not as
evidence.* `hero` is where P2 is decided. `temple`'s informative number is the in-mask squint sd,
which stays diagnostic — it does not become a gate because it happens to be the only one with
power there.

Where that leaves the three checks, per shot, decided before any frame exists:

| | `temple` | `hero` |
|---|---|---|
| **P1** legibility | **decides** (10 781 eroded px) | **decides** (252 700 eroded px) |
| **P2** squint masses | vacuous (0.83 % of cells) | **decides** (26.05 %) |
| **P3** tiling | **not testable** (194 px contiguous run vs 127–244 px repeat) | partial — the run is 1274 px but the repeat is 157–1202 px, so ~1.7 repeats are on screen |

The honest consequence, stated before scoring: **no framing in this pair puts enough contiguous
repeats of `hieroglyph_gilded` on screen for the tiling condition to fail.** If that is what the
frames show, the finding is *"the tiling risk §130.4 raised is not reachable at these two
framings"* — which is a different claim from *"the tiling is fine"*, and it must be written as the
first one.

## AMENDMENT 4 — P3 *is* answerable, on `hero`'s far gilded band, registered before the frames

Still zero PNGs of this run on disk. Mask-and-geometry only, so still blind to both arms. **The
gate is unchanged: max ρ over lags 30–300 ≤ 0.45.** What changes is *where* it is evaluated, and
the reason is measured rather than preferred.

`hero` carries **two** gilded populations with a 5× depth ratio between them, and a single median
over the pair describes neither:

| `hero`, `arch:hieroglyph_gilded` | px | depth p5–p95 | px / 6.4 m repeat | longest contiguous run | repeats on screen |
|---|---|---|---|---|---|
| **far band, rows 24–140** | 45 789 | 26.2–42.0 m | **129–207 (p50 176)** | **552 px** | **2.7–4.3** |
| near mass, rows 300–620 | 190 653 | 4.5–11.6 m | 469–1202 (p50 873) | 844 px | ~1 |

100 % of the far band's pixels have a repeat inside the registered 30–300 lag band, and half of a
552 px run reaches lag 276, so every repeat in it is measurable. **0 %** of the near mass's pixels
do.

So P3 is scored on **`hero` rows 24–140** — registered here, before any frame — and this is the
only place in either shot where more than two contiguous repeats of this recipe are on screen. It
is therefore the only framing in this pair where §130.4's stated risk (*"the seam row now carries a
bee and a falcon per repeat"*) can fail. The rule-selected band and the near mass are still
computed and reported, labelled as what they are: **≤ ~1 repeat, where a low ρ is arithmetic, not a
result.**

`temple` stays **NOT TESTABLE** per Amendment 2. Nothing about Amendment 4 rescues it: its longest
contiguous run is 194 px against a 127–244 px repeat.

## AMENDMENT 5 — one scoping diagnostic added, registered as a non-gate

Still zero PNGs on disk. The scorer additionally prints, per gilded band and per arm, the **sunlit
share** of the mask at the `L ≥ 120/255` cut `PREREG-goldspec` already registered. It is **not a
gate and cannot pass or fail anything here.**

Why it is worth printing at all: `RESULT-tx7` §4 measured **only 1.4 %** of `hero`'s gilded pixels
sunlit and concluded that no frame in the tested set has key-lit gilded at size — which is why the
`aoKey` A/B *"could not have tested §7.3's gold-occlusion line either way"*. That measurement was
over the whole gilded mask, and Amendment 4 has since shown the mask is two populations 5× apart in
depth. If the far band is lit where the near mass is not, the scoping conclusion needs narrowing;
if neither is, it is confirmed on a second run. Either way it is an observation about **framing**,
which is not TEXTURES' to fix, and it is recorded here so it cannot later be presented as a result
this run was designed to produce.

## AMENDMENT 6 — P1's gate is decomposed, because a pure darkening would pass it

Still zero PNGs on disk. **The gate is unchanged.** P1's statistic is `rms(L − box(L,8)) / mean(L)`,
and the chisel pass *sinks* the sign floors (§130.4: signed diff **−0.0439** on cut texels), so a
treatment that only darkened the band would lower the denominator and raise the ratio **with no
extra detail at all**. The scorer now prints the numerator and the denominator separately.

Registered reading rule, fixed now so it cannot be chosen afterwards: **P1 passes on the ratio, as
sealed** — but if the ratio rises while `rms(L − box8)` is flat or down, the report must say the
gate was carried by the darkening and **not** by added detail, and that is a *weaker* result than
the seal intended. Numerator and denominator are both reported either way.

## Not claimed

- Nothing here is about gold reading as **metal**. §130.5's chroma loss is `slyMetal`'s and the
  routing correction says it is not the multiply I named; either way it is SHADING's and this run
  cannot move it. §7.3's gold line is not scored by this document.
- Nothing here re-opens `arrisPolish` (null, discharged, 0) or the albedo arris (`PREREG-hgarris2`).
- No claim about bloom onset — POSTFX's number.
- The masks are **architecture-only** (`matmask.mjs`'s own scope note): FX and character pixels are
  invisible to them and land inside material ROIs as drift. Stated here, before scoring.
