# RESULT-goldspec — gilded's second route, and it closes on the geometry rather than on the texture

TEXTURES. Scores `PREREG-goldspec.md` (sealed 14:05:58 UTC, amended 14:16 and 14:15, all with zero
PNGs of this run on disk). The open item was `PREREG-hgarris2` P5's split: the **specular** half of
`hieroglyph_gilded`'s arris, which that seal declared *NOT TESTABLE IN THIS RUN* because `hero`
puts 0.5 % of the gilding above the specular terminator.

## 0. Provenance

- Sealing tree `a09d55d` + this session's `src/textures/Materials.js` edit (the two diagnostic A/B
  arms). Tree hash before any arm booted: **`d42810d313bc`**.
- Catalogue invariants on the candidate tree (`texlab --all`, 44 recipes): **0 joint-sign
  violations**; `darkTail` **0.0000** on `hieroglyph_gilded` and on every stone/carved recipe
  except `ceiling_stars` 0.0005, which is §13's already-recorded one-recipe `rampFloor` residue and
  is unchanged by anything here.
- The shipped build is **bit-identical to before the edit**: with no A/B string set the new
  expression evaluates to the same `arrisPolish: 0.08` it replaced.

## 1. What the treatment is, measured at the sampler rather than at the author's line

`progress/records/goldspec.mjs` (new, tracked) builds the recipe twice in one process, compares the
**shipped ORM** (post `refineRoughness`, post `packORM`'s div-2 box and 8-bit quantise) and then
evaluates `toon.glsl.js:495–504` verbatim at the consumer's real uniforms — `spec 0.55 / gloss 64 /
uMetal 0.85`, from `Architecture.RECIPES` and `Architecture.mat()`. Scope in its header; `sh` is
pinned to 1 so every figure is an upper bound. Bit-identity is asserted, not assumed: albedo,
normal, height, `s.metal`, ORM.r and ORM.b are all identical between arms; only ORM.g moves.

**Three findings, and each one is larger than the effect it is measuring.**

**1.1 — The polish barely lands on gold at all.** Of the 10 616 ORM texels whose roughness actually
changes, **773 (7.3 %) are on the gild class**; 7 394 are on the surrounding limestone and 2 449 on
the transition. That is structural, not a tuning choice: `carve()`'s ring is
`sat((cm − cut)·2.4)·(1 − r)`, i.e. *outside* the cut, while the gilding is
`g = sat(ramp·1.35 − 0.10)`, i.e. *inside* it — and in the strip where they do overlap the gold
pass's `s.rough = lerp(s.rough, goldRough(t) + …, g)` overwrites the notch in proportion to `g`.
Surviving Δrgh on gild is **p50 −0.0157** against limestone's **−0.0314**: half the amplitude, on a
fourteenth of the texels.

**1.2 — The `+3.1 %` figure in `PREREG-hgarris2`'s amendment was the amplitude route only, on the
raw authored delta, and it overstates the delivered effect ~1.8×.** `rgh` feeds **two** terms, not
one: `specAmt = 0.55·(1 − 0.75·rgh)·3.04` **and** `glossP = max(64·(1 − 0.6·rgh), 4)`. Polishing
raises the amplitude **and narrows the lobe**. Decomposed, with the arithmetic reproducible from the
two expressions above:

| | Δrgh | Δ spec |
|---|---|---|
| amplitude route, raw `s.rough`, d 1–4 outside the cut, both classes — *the figure on the record* | −0.0220 | **+3.25 %** |
| amplitude route, **delivered ORM**, **gild class only** | −0.0157 | **+2.16 %** |
| + the `glossP` narrowing, best case over every ndh, per texel | −0.0157 | **≈ +1.7 %** |

Two separate reductions, and the first is the larger: the delivery chain (`packORM`'s div-2 box and
its 8-bit quantise) plus restricting to the class that is actually gold takes 3.25 → 2.16 %, and the
exponent route takes off the rest.

**And the treatment is not monotone in the image**, which nothing on the record anticipated. Just
below the step's shoulder — ndh ≈ 0.977 at this roughness — the narrower lobe falls under
`smoothstep(0.30, 0.52, lobe)` faster than the amplitude rises, so polishing makes the pixel
**darker** by up to −0.019 in linear radiance. So a signed statistic over the gilded mask can
partially cancel against itself, and only the unsigned count is safe to read. Registered here
because it changes how P1's `meanSignedLuma` column may be quoted.

**1.3 — The lobe is a 24.7° cap, and gilded architecture is flat.** At the gild's own shipped ORM
roughness (0.608) `glossP` = 40.7, so `specStep` leaves zero only at N·H > 0.9083 and reaches its
main leg at N·H > 0.9708 (13.9°). Area-weighted over frustum-visible, front-facing, key-facing
gilded triangles and convolved with the built normal map's own slope distribution (azimuth
averaged — an approximation, stated, not a bound):

| framing | gilded share of frame | gild area in lobe | **ring** area in lobe |
|---|---|---|---|
| `sly-startle` | 12.35 % | 7.10 % | **7.72 %** |
| `sly-key` | 13.87 % | 1.75 % | 4.91 % |
| `sly-closeup` | 5.86 % | 2.46 % | 5.43 % |
| `sly-perch` | 6.06 % | 2.46 % | 5.34 % |
| `night` | 11.40 % | 3.49 % | 4.76 % |
| `hero` | 28.93 % | 0.71 % | 1.77 % |
| `temple` | 1.78 % | 0.46 % | 1.66 % |

`goldlit.mjs`'s `ndl > 0.52` ordering — which is what `PREREG-hgarris2` used to choose framings —
is **necessary but not sufficient and it reorders the roster**: it ranks `sly-closeup` first and
`sly-key` fourth, while the lobe condition ranks `sly-startle` first and puts `sly-key` behind
`sly-closeup` on area-in-lobe. *Key-lit is not the same question as half-vector-aligned*, and the
second is the one a specular lobe asks.

## 2. The prediction that follows, and the instrument's own scale

Affected pixels = material px × ring-and-gild ORM share (1.18 %) × in-lobe fraction:
**≈ 104 px at `sly-startle`, ≈ 74 px at `sly-key`**, each changing by ~1.7 % of a spec term worth
0.946 in linear radiance — **≈ 1.0 code of 255** after §70.2's bright-bin grade slope.

*Stated approximation:* that product applies a **texel** share to **screen** pixels, i.e. it assumes
the ring-and-gild class is distributed over the visible surface at its tile-average density. The
consumers are 0.8–2.6 m architrave bands whose UVs are box-projected in local space, so they sample
a restricted V window (the recipe's own note records this), and the true share could differ by a
factor of a few either way. It is an order-of-magnitude prediction, and it is registered as one.

Measured against the instrument, from frames that already existed (`arris2-off` → `arris2-on`,
same tree, one knob):

| `hero`, masked pixel diff | differing px | % of mask |
|---|---|---|
| gilded mask — the **albedo** half of this same arris | **55 014** | 20.64 % |
| `hieroglyph_wall` — same treatment | 63 382 | 51.47 % |
| `sandstone_block` — **untouched, same tree** | **83** | 0.13 % |
| gilded mask, `arris2-off` vs `arris2-off2` — **same build, two boots** | 122 | 0.05 % |

So the masked diff has a same-tree floor of **83–122 px**, the albedo route clears it by **550×**,
and the specular route is predicted at **74–104 px — i.e. at the floor.** That comparison is the
whole result and it was available before the capture.

## 3. The frames

*PENDING — the three arms are queued/rendering; this section is written when they land. Scored
with `sh progress/records/score-goldspec.sh`, which prints P1 (pol0 → ship), P2 (pol0 → x8), the
untouched-material null population that is P3, and the crop commands for P5.*

## 4. What this hands on

**§7.3's "gold doesn't read as metal" does not close from the roughness map, and the reason is
geometric.** The lever with range is the lobe's **width**, which is `gloss` in
`Architecture.RECIPES` — not TEXTURES'. Same convolution, same built normal map, only the
threshold moved (`goldspec.mjs` WHAT-IF 2), gilded area inside the lobe:

| framing | gloss 64 (shipped) | 40 | 24 | 16 | 10 |
|---|---|---|---|---|---|
| half-angle | 25° | 31° | 39° | 47° | 57° |
| `sly-startle` | 7.10 % | 9.76 % | 15.07 % | 22.09 % | **38.56 %** |
| `sly-key` | 1.75 % | 3.05 % | 8.08 % | 15.12 % | **21.18 %** |
| `sly-closeup` | 2.46 % | 3.95 % | 11.21 % | 16.99 % | **24.28 %** |
| `night` | 3.49 % | 6.79 % | 12.43 % | 17.94 % | 22.79 % |
| `hero` | 0.71 % | 1.41 % | 2.59 % | 4.02 % | 6.37 % |

**A wider lobe is not a softer highlight in this shader**, which is the objection to expect:
`specStep = smoothstep(0.30, 0.52, lobe) + 0.35·smoothstep(0.02, 0.30, lobe)` is a hard step on the
lobe, so `gloss` sets the highlight's **size** and not its edge hardness. §7.3 asks for a *hard*
spec; it does not ask for a *tiny* one, and at gloss 64 on flat architecture it is tiny to the
point of absence.

**The other TEXTURES-side lever is nearly spent, and that is worth recording as a negative.** The
in-lobe fraction also depends on the gild's own normal-slope distribution, which *is* mine. Feeding
synthetic half-normal slope distributions through the same convolution (WHAT-IF 1):

| framing | sd 5° | 10° | 15° | 20° | 30° | **as built** |
|---|---|---|---|---|---|---|
| `sly-key` | 0.49 % | 0.70 % | 1.28 % | 1.81 % | 2.50 % | **1.75 %** |
| `sly-closeup` | 1.19 % | 1.40 % | 1.96 % | 2.52 % | 3.16 % | **2.46 %** |
| `sly-startle` | 7.45 % | 6.70 % | 6.36 % | 6.34 % | 6.56 % | **7.10 %** |

The built gild already sits between a 15° and a 20° hammered surface, and taking it to 30° — which
would be a visibly beaten metal and would put the busy/flat condition at risk — buys about one
extra percent of area. **Roughening the gild's normals is not the fix.**

## 5. §7.3's gold line, measured in the frame as it stands

Not a new finding — KNOWN_ISSUES §8/§48 owns it — but re-measured at `a09d55d` so the record is
current, inside the `matmask` mask on `shots/arris2-on/hero.png`:

| | mean RGB | L | (b−r)/255 | chroma |
|---|---|---|---|---|
| `arch:hieroglyph_gilded`, whole mask | 55.1, 51.9, 58.2 | 53.1 | **+0.0119** | 0.107 |
| same, top 1 % by luma | 175.4, 151.3, 130.2 | 154.9 | −0.1774 | 0.258 |
| `arch:gold_leaf`, whole mask | 48.1, 45.0, 55.0 | 46.4 | **+0.0268** | 0.182 |
| `arch:gold_leaf`, **top 5 % by luma** | 93.7, 102.9, 114.8 | 101.8 | **+0.0828** | 0.184 |
| authored arris hex `#ffe9a8` | — | — | −0.3412 | 0.341 |

**`gold_leaf`'s brightest pixels in the money shot are blue.** B/max is 1.14 on the mask and 1.12
on its own highlight, inside the 1.08–1.39 band §8 records, so that defect is still live after the
rim gate and the `shadowTintPeak` fix. The albedo is warm (`goldLight` is b−r −0.34) and no
multiplicative term can flip that sign, so this is not authoring — it is the additive shadow wash,
the additive rim, the AO tint and the split-tone's cool leg, exactly as §8 names them, on a surface
whose own diffuse has had 68 % of its colour removed by `diff *= mix(1.0, 0.20, slyMetal)`.
Owned by SHADING and POSTFX. Crop to look at: `tools/crop.mjs shots/arris2-on/hero.png out.png
380 220 420 320 2`.

---

## 6. A separate §7.3 finding, from the same instrument: `hieroglyph_gilded` has a countable once-per-repeat landmark

Found while choosing framings for the run above, on `tools/wallstrip.mjs` — the one tiling
instrument in this project that was calibrated against a known-bad (§13). Rendered at each
framing's own px-per-repeat, off the albedo, before any lighting:

`hieroglyph_gilded`'s architrave register carries a **single filled gold disc** — `sun`, the census
says, **n = 1 per repeat at tile-U 159**, the only large round sign in the layout — sitting on an
otherwise near-featureless pale limestone ashlar field. Gilding recolours it to the brightest,
most saturated value on the surface. At `courtyard`'s **171 px/repeat it recurs 8 times across the
frame width** and is trivially countable; the same mark is unmistakable at `night`'s 226 px/repeat
and at `hero`'s 474. Verified at the **shipped tile size** (512, i.e. `--size 1024` through tier 1),
not only at the lab default, because at 256 the surrounding writing mushes and could have
manufactured the contrast: at 512 the register is a continuous gold inscription and **the disc is
still the largest, brightest element and still recurs exactly once per repeat**.

Artefacts: `gild-court171-s1024.png` (shipped size, 7.5 repeats), `night-gild.png` (226 px/repeat),
`gild-rep474.png` (`hero` scale).

**This is the exact shape §13's correction named** for `hieroglyph_wall`'s stacked lapis scarab
pair — a rare, large, uniquely-shaped, saturated mark in a field with too little variety to hide it
— found by the same instrument, on the recipe that fix did not have to touch. §13's own rule
applies: *a metric over a whole surface cannot see a defect in what the surface is made of; where a
texture is assembled from parts, count the parts.* Twenty-eight scalars missed the scarab; the same
scalars would miss this.

**Not fixed this session, deliberately.** Three capture arms of this exact recipe were queued when
it was found, and every arm boots Vite fresh off disk (§14: "a mid-queue `src` edit races the next
boot"), so editing `Materials.js` would have silently given the arms different textures. The fix is
a layout/pool change of the same kind §13 already shipped — either drop the unique disc from the
architrave pool or place several per repeat so none is a beacon — and it has a ready before/after
instrument in `wallstrip --rep 171`.

**What this run cannot answer, stated rather than implied.** `sly-key` and `sly-startle` show
**1.3–1.6 repeats across the frame**, so they cannot make a repeat countable whatever the landmark
does. The framings that can are `courtyard` (7.5 repeats and lit — 23.7 % of its gilding is above
the low terminator), `night` (5.7) and `dunes` (13, but hazed). None was captured this session, so
**the in-frame half of this finding is open**, and it is open on `courtyard` — not on `hero`, where
the band is 98.6 % shadowed and the disc is invisible (checked: `hero-band2.png`, 2× over the full
architrave run).

The newest `courtyard` on disk (`shots/tx5/`, 1 Aug) cannot even serve as an indication: at that
tree the architrave renders as flat orange and violet masses with **no register detail of any kind**
— §3's lavender state and §7.3's *other* materials condition — so it answers a different question
than the one asked. Recorded rather than quoted, per §10.
