# PREREG-goldspec — sealed before any arm boots

TEXTURES. **`hieroglyph_gilded`'s second route** — the one `PREREG-hgarris2` P5 declared *NOT
TESTABLE IN THIS RUN* and left open. `arrisPolish` writes `s.rough` and nothing else; the albedo
lab is structurally blind to it; and `goldlit.mjs` showed `hero` is the wrong framing for the
specular half. This seals it on character framings, which is where the gilding is key-lit.

Sealing tree: `a09d55d` + this session's `src/textures/Materials.js` edit (the two A/B arms
below), uncommitted. **All three arms are that one tree**; nothing in `src/` is edited between
them, and the only thing that differs is one A/B string.

Tree hash before any arm boots (`find src -name '*.js' | sort | xargs sha1sum | sha1sum`):
**recorded in `RESULT-goldspec.md` §0 at capture time, and re-taken after the last arm lands.**
Four agents commit throughout; SHADING has a depth-dependent `shadowBounceMix` fix in flight that
moves the shadow light's red across ~88.8 % of frame. **If the hash moves between arm 1 and arm 3,
every absolute below is void and only within-arm ratios survive** — which is why the primary is a
per-arm *difference against a same-arm null population*, not an absolute level.

## What the treatment actually is, measured rather than described

`progress/records/goldspec.mjs` (new, tracked) builds the recipe twice in one process and compares
the **shipped ORM** — after `refineRoughness`, after `packORM`'s div-2 box and its 8-bit quantise —
then evaluates `toon.glsl.js:495–504` *verbatim* at the consumer's real uniforms
(`spec 0.55 / gloss 64 / uMetal 0.85`, from `Architecture.RECIPES` and `Architecture.mat()`).
Scope note in its header; `sh` is pinned to 1, so every figure is an upper bound.

Bit-identity between arms is asserted, not assumed: albedo, normal, height, `s.metal`, ORM.r (AO)
and ORM.b (metal) are all **identical**; only ORM.g moves.

**Three factors, each measured, and their product is the prediction.**

1. **The treatment barely lands on gold.** Of the 10 616 ORM texels whose roughness actually
   changes, **773 (7.3 %) are on the gild class** and 7 394 are on the surrounding limestone. That
   is structural, not tuning: `carve()`'s ring is `sat((cm − cut)·2.4)·(1 − r)`, i.e. *outside* the
   cut, and the gilding is `g = sat(ramp·1.35 − 0.10)`, i.e. *inside* it — and where they do
   overlap, the gold pass's `s.rough = lerp(s.rough, goldRough(t) + …, g)` overwrites the notch in
   proportion to `g`. Surviving Δrgh on gild is **p50 −0.0157** against limestone's −0.0314.

2. **The `+3.1 %` in `PREREG-hgarris2`'s amendment was the amplitude route only, and the exponent
   route cancels most of it.** `rgh` feeds `glossP = 64·(1 − 0.6·rgh)` as well as
   `specAmt = 0.55·(1 − 0.75·rgh)·3.04`: polishing raises the amplitude **and narrows the lobe**.
   Maximised over every ndh, the net best case on gild texels is **+1.72 %**, not +3.1 %.

3. **The lobe is a 24.7° cap and the gilding is flat architecture.** At the gild's own shipped
   roughness (0.608) `glossP` = 40.7, so `specStep` leaves zero only at N·H > 0.9083 and reaches
   its main leg at 0.9708. Area-weighted over frustum-visible, front-facing, key-facing gilded
   geometry, and convolved with the built normal map's own slope distribution (azimuth averaged —
   stated as an approximation, not a bound), the fraction of the material's area at which a **ring**
   texel is inside the lobe is **7.72 % at `sly-startle`** and **4.91 % at `sly-key`** — the two
   best framings in the fourteen. `hero` is 1.77 %.

## Arms

| arm | `VITE_TEX_AB` | out | `arrisPolish` |
|---|---|---|---|
| `pol0` | `hgpolish` | `shots/gs-pol0/` | **0** — control |
| `ship` | *(unset)* | `shots/gs-ship/` | 0.08 — the shipped state |
| `polx8` | `hgpolishx8` | `shots/gs-x8/` | **0.60** — calibration only, never a candidate |

`hgpolish` is scoped to this recipe, so **every other material in the level is bit-identical
between all three arms** and supplies the run's own null population. A run whose `report.json`
lacks `textures: A/B CONTROL BUILD` is the `ship` arm whatever the directory is called.

**Why a calibration arm exists (§13).** A statistic that has never been shown to move on a state
known to carry the effect is not evidence about that effect in either direction. `polx8` is
8.5× the shipped notch measured at the ORM (gild Δrgh p50 −0.1333, rel Δspec **+14.59 %**), and its
only job is to separate "the treatment does nothing" from "the instrument cannot see anything".
Its treated *texel count* is essentially unchanged (773 → 800) — only the per-texel magnitude
scales — so it predicts the same pixel count at 8.5× the amplitude.

Shots: **`sly-startle`, `sly-key`**. 1280×720, quality high. Both are character framings, per the
routing; neither has ever been captured, which is stated as a risk rather than discovered later.

## The arithmetic being predicted

Affected pixels = material px × ring-and-gild texel share (1.18 % of ORM) × in-lobe fraction:

| shot | material px | × 1.18 % | × in-lobe | **predicted affected px** |
|---|---|---|---|---|
| `sly-startle` | 113 863 (12.35 % of frame) | 1 344 | 7.72 % | **≈ 104** |
| `sly-key` | 127 789 (13.87 % of frame) | 1 508 | 4.91 % | **≈ 74** |

Per-pixel change, at the gild's own spec level (`specAmt·specStep` p50 1.058 × specTint luma 0.894
= **0.946 linear**) and §70.2's bright-bin grade slope **G = 0.244**:

| arm | Δspec | Δ linear | Δ display |
|---|---|---|---|
| `ship` | +1.72 % | 0.0163 | **≈ 1.0 code of 255** |
| `polx8` | +14.59 % | 0.138 | **≈ 8.6 codes** |

Measured yardstick: on the one control-vs-control pair that exists (`arris2-off` vs `arris2-off2`,
same build, two boots), the cross-boot floor **inside the `arch:hieroglyph_gilded` mask** is
**122 px on `hero` (0.046 % of the mask, mean Δ 3.4, 14 px at Δ ≥ 8)** and 94 px on `temple`. The
whole-frame floor is 2.1–8.0 %, so the mask is what makes this question askable at all.

## Predictions and falsifiers

Instrument: `maskdiff` on `matmask.mjs` masks, per material, per arm pair. Every count below is
inside the `arch:hieroglyph_gilded` mask unless it names another.

- **P1 — PRIMARY, and it is a prediction of NO EFFECT.** `pol0 → ship`, gilded mask:
  **< 300 differing px, none with |Δ| ≥ 8, and no more differing px than the largest untouched
  material mask in the same pair.** That is the registered *expected* outcome, derived above
  (≈ 104 and ≈ 74 px at ~1 code). A null here is the result, not a failure to find one.
  *Falsifier: ≥ 300 px, or any pixel at |Δ| ≥ 8, with P3 holding ⇒ the model above is wrong
  somewhere and the shipped notch is doing more than it can account for; report that and do not
  keep the null.*

- **P2 — CALIBRATION, and P1 cannot be quoted without it.** `pol0 → polx8`, gilded mask:
  **≥ 400 differing px and ≥ 40 px at |Δ| ≥ 6**, on at least one of the two shots.
  *Falsifier: if `polx8` is also null, the roughness route is dead end-to-end at these framings and
  P1 is over-determined — report P1 as a null **and** record that no instrument in this run could
  have seen the shipped notch either. That is a weaker claim and must be written as one, not
  rounded up to "measured null".*

- **P3 — SAME-RUN NULL POPULATION.** `sandstone_block`, `limestone_polished`, `granite_pink`,
  `paving_courtyard`, `column_papyrus`, `hieroglyph_wall` are bit-identical in all three arms.
  Their differing-px counts are this run's combined boot-noise-plus-post-chain-coupling floor.
  Registered in advance: **this floor is expected to be non-zero** — control-vs-control moved
  `mudbrick` +2.17 % on a bit-identical texture, so "bit-identical by construction" is a fact about
  the texture and not about the frame. *If any untouched mask moves more than the gilded mask does
  in the `polx8` pair, P2 is unquotable and the run measured the post chain, not the treatment.*

- **P4 — CLASS ATTRIBUTION, `polx8` only.** 76 % of the delivered notch lands on the limestone
  inside this recipe, not on the gold, and limestone runs the same `spec 0.55 / gloss 64` without
  the metal branch. So a `polx8` effect is **not** by itself a gold result. Pixels are split by the
  **control arm's** chroma inside the mask (fixed pixel set, applied to all three arms, so the
  classification cannot be moved by the treatment). Registered so a positive P2 is not misread as
  §7.3's gold line moving.

- **P5 — THE IMAGE, and it is not subordinate to any number above.** Crops at 4× and 8× on the
  gilded architrave in both shots, all three arms. The question is whether the polished arris reads
  as a *hard, narrow* highlight on a dark base (§7.3's ask) or as a general brightening. If `polx8`
  reads as a broad sheen rather than an edge, then even the direction of this lever is wrong and no
  value of it delivers §7.3.

- **P6 — PROVENANCE.** Tree hash before arm 1 and after arm 3. If it moved, P1's *absolute* counts
  are void; the within-pair comparisons against P3's null population survive, and the report must
  say which of the two it is quoting.

## Not claimed

- Nothing here is about gold's **albedo** route — `PREREG-hgarris2` P5 scored that on `hero` and it
  is not re-opened.
- Nothing here is about §7.3's "dark occlusion". KNOWN_ISSUES §8 establishes `ao` never multiplies
  the key term and SHADING ruled `aoKey = 0` final; that loss is downstream and is not TEXTURES'.
- Nothing here is a claim about `spec 0.55` or `gloss 64` themselves. Those are ARCHITECTURE's
  `RECIPES` entry, and if the lobe is too narrow to exist on flat architecture at these framings,
  that is where it has to be fixed — not in the roughness map.
- No claim about bloom. Whether a highlight this size crosses POSTFX's onset is POSTFX's number.

## AMENDMENT, 14:16 UTC — zero PNGs on disk, no threshold above changed

Registering the scorer's two free choices *before* any frame exists, so neither can be picked
after seeing one (§81.3: amend and timestamp, never adjust afterwards).

- **The gild/limestone split rule.** `goldspecdiff.mjs` ranks the pixels inside the gilded mask by
  chroma **on the control arm only** and calls the top **17.78 %** gild-candidate and the bottom
  **76.12 %** limestone-candidate — the two classes' own texel shares in the built tile, measured
  by `goldspec.mjs`, not a threshold chosen to make a split look clean. The pixel set is fixed from
  the control arm and applied unchanged to every arm, so no treatment can move the classification.
  It is a proxy for the metal mask and gets the sizes right, not necessarily the members.
- **"Bright" is L ≥ 170**, the same cut the `arris2-off`/`arris2-off2` floor above was measured at.

## AMENDMENT 2, 14:15 UTC — the instrument's scale, measured on frames that already exist

Zero PNGs of this run on disk; the arms are still queued behind another agent. No threshold above
is changed. This adds the missing denominator §99.4 says every effect size needs, and it comes
free from `arris2-off` → `arris2-on` (same tree, one knob, already captured), scored with the same
masked diff this run will use:

| `hero`, arris2-off → arris2-on | differing px | % of mask | mean Δ | max Δ |
|---|---|---|---|---|
| `arch:hieroglyph_gilded` — the **albedo** route | **55 014** | 20.64 % | 1.77 | 54 |
| `arch:hieroglyph_wall` — same treatment, bigger lip | 63 382 | 51.47 % | 1.99 | 31 |
| `arch:sandstone_block` — **untouched, same tree** | **83** | 0.13 % | 1.41 | 13 |

So the masked-diff instrument has a same-tree floor of **~83–122 px** and the albedo half of this
very arris registers **55 014 px** on it — a 550× separation, on the framing this run does not use.
That is the calibration §13 demands, obtained without a capture.

**It also sharpens what a null means here.** P1 predicts ≈ 74–104 px for the specular route, which
is *at the floor* — so a null cannot distinguish "the notch does nothing" from "the notch does
about as much as boot noise". That is precisely why `polx8` is in the run, and why P2's falsifier
is written to force the weaker wording when `polx8` is null too.
