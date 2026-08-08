# RESULT — palwarm / glyphs: the brief's premise was false, and the real defect was next door

Pre-registration: `PREREG-palwarm.md` (+ ADDENDUM 1, 2, 3). Instruments: `tools/palwarm.mjs`,
`tools/glyphrelief.mjs`. Every number below is measured on **albedo bytes**, offline, with no
frame, no lighting, no grade and no 2D canvas on the path.

---

## 1. The palette. The brief said "78.8 % cool". The source is 94.9 % **warm**.

The brief I was given asserted that the palette measures 78.8 % cool in a midday Egyptian desert
and told me to warm it. Critic pass 8 does report that number — but it is a **frame** number, the
product of albedo × light × ramp × grade, taken in a week when two other agents are moving the last
three. So the premise was checked before it was executed.

Coverage-weighted over the four framings the critic scored (`hero`, `temple`, `courtyard`,
`sly-closeup`), weighting each recipe by the screen pixels it covers — rasterised from geometry
alone, so the weight cannot move when LIGHTING or RAMP does:

```
CONTROL   warm 94.9%   cool 3.5%   neither 1.6%   achromatic 0.1%
          warmth W +0.3200   chroma 0.3468   luma 0.5098
```

**P0 fires.** P1 and P2 were satisfied *by the control*. The shipped albedo is overwhelmingly warm
and always was. Whatever makes `sly-closeup` measure 78.8 % cool is **not in `src/textures/`**.

### Where I think the cool does enter, so it does not fall between us

Not measured by me — this is a routing note, not a finding, and it belongs to LIGHTING:

- `toon.glsl.js` adds a **flat additive `uShadowColor` wash** (`#2a3f66`, violet-blue) proportional
  to `1 - key`. Materials.js documents this repeatedly: on any texel dark enough that its own
  albedo stops dominating, the wash *is* the pixel. §231 (committed this week) reports
  `key = ramp * sh` is multiplied by zero over **97.5 % of `temple`** — so `1 - key` is near 1 over
  almost the whole frame and the wash is at nearly full strength nearly everywhere.
- The rim is `rimColor 0x7fd4ff` (cyan) on essentially every material in `Architecture.RECIPES`.
- KNOWN_ISSUES §34: `hero`'s gilded mass is **98.6 % shadowed at median L 43.6**, and
  `scratchpad/huechain.mjs` found that in the shade regime *every* pigment in §2.2 lands between
  152° and 244° after the light and grade chain — i.e. authored hue does not survive there at all.

An albedo that is 94.9 % warm rendering as a frame that is 78.8 % cool is consistent with all
three. None of them is mine to change.

## 2. The defect that IS in these files: the scene was painted in one hue

The same table says something the warm/cool split cannot see:

| recipe | coverage | median hue (control) | → after |
|---|---|---|---|
| paving_courtyard | 21.2 % | **23°** | 38° |
| column_papyrus | 15.3 % | **23°** | 38° |
| sandstone_worn | 12.5 % | **23°** | 38° |
| hieroglyph_gilded | 12.1 % | 38° | **53°** |
| sandstone_block | 11.2 % | **23°** | 38° |
| hieroglyph_wall | 9.7 % | **23°** | 38° |
| granite_pink | 8.3 % | **23°** | **8°** |
| ceiling_stars | 2.7 % | 218° | 218° (untouched) |
| limestone_polished | 2.4 % | 38° | **53°** |
| gold_leaf | 1.2 % | 38° | **53°** |

**93.1 % of every chromatic texel in the level sat inside one 30° hue bucket**, and eight of the
ten highest-coverage recipes reported *the identical* median hue. Aswan granite measured the same
hue as mudbrick. Papyrus measured the same hue as sandstone. Gold, limestone, rope, bronze and
carnelian were one shade of each other. A scene painted in a single hue at five brightnesses reads
as a fill colour however warm it is — and it gives everything downstream one thing to tint, which
is why the whole frame moves together.

It arrived through **shared code**, which is why it was so uniform: `rampFloor` pulls every
recipe's dark tail onto the same `SAND_CREV_FLOOR` (hue 19.6°), and grime, dust, pitting and
speckle all come from one sand-coloured constant set. Every one of those decisions is right alone.

### The fix — `hueGrade`, one curve per family

A hue ramp along each material's **own** value range at **constant luminance**. Deltas, not
targets, so a material keeps its internal hue variance (`granite_pink` was rebuilt twice to get
pink feldspar against grey quartz; a target hue would have flattened exactly that). Constant luma
keeps `rampFloor`'s crevice floor, `jointSign`'s dY and the whole height field untouched for free.

Written first against absolute luma and it barely moved anything — a stone's entire luma span is
0.30–0.60, so a 30° ramp authored across black-to-white delivered about 8° across the stone. The
ends are the surface's own p02 and p98.

Sandstone opens from a deep red-brown recess through ochre to a bleached pale-yellow crest;
limestone goes creamier; granite goes **pink**; gold goes **yellow**; mudbrick goes redder; sand
loses chroma it should never have had (it shipped at **0.419**, more saturated than the gilded
architrave).

```
                     control     candidate
h30 (one 30° bucket)  93.1%   ->   67.7%     S1 <= 78%    PASS
hueN (15° families)    2.44   ->    4.19     S2 >= 3.00   PASS
top-8 distinct bins       2   ->       4     S3 >= 4      PASS
granite median hue      23°   ->      8°     S4 <= 15°, 30° off sandstone   PASS
warm / cool           94.9 / 3.5 -> 94.9 / 3.5            P1 PASS
warmth W             +0.3183  -> +0.3188     P2 >= 0.085  PASS
luma                  0.5097  ->  0.5242     P3 +-0.02    PASS (+0.0145)
chroma                0.3445  ->  0.3520     P4 not below PASS (+0.0075)
albedo p99 luma       0.647   ->  0.718      S6 >= 0.70   PASS
ceiling_stars cool     93.9%  ->   93.8%     S7 >= 80%    PASS
```

**P4 fired once and was resolved by measurement, not by argument.** The first candidate came in at
chroma 0.3336 against 0.3445. An A/B probe with every `sat*` multiplier neutralised returned chroma
**−0.0000** while `h30` still went 93.1 → 67.7: the hue separation costs *nothing*, and the entire
loss was the deliberate bleach at the sun-struck end. Rather than talk past the guard, the bleach is
now paid for at the other end — shadowed desert stone is deeply saturated because it is lit by
bounce off orange sand — and chroma ends **above** the control.

### Two carve-outs, both deliberate

- **Pigment is masked out of the grade** on both paint-bearing recipes. Egyptian blue, malachite
  and red ochre are manufactured mineral colours, not weathered stone, and do not take a solar
  bleach curve. The mask is the paint coverage the recipe already computes, so a flake that has
  lost its pigment is stone again and is graded as stone. The lapis ceiling is untouched: it is the
  level's one deliberate cool mass.
- **Vegetation is not graded, and the criterion that said it should be is VOID.**

## 3. S5 is VOID — a criterion I derived wrongly, reported as void and not re-derived

S5 required `papyrus_reed` and `palm_frond` to report a median albedo hue in [75°, 150°). The
control had `papyrus_reed` at **100 % warm, hue 38°**, which looks exactly like a reed bed painted
the colour of the wall behind it. It is not:

- `papyrus_reed` does not paint a plant. It paints a **sheet of papyrus** — split pith laid at
  right angles and beaten flat — which is correctly cream, and `Vegetation.js:357` multiplies it by
  material colour `0x6f8a3c` (hue 81°).
- `palm_frond`'s material is `color: 0xffffff, vertexColors: true`, and the geometry carries
  per-vertex colour ramping `frondMid 0x5f7a33` → `frondLight 0x8fa348` (Vegetation.js:121, 173).

The criterion asserted a property of **one factor of a two-factor product**. Rotating those albedos
green would have shipped green × green. Per §141.1 it is void, and both recipes are untouched.

## 4. The hieroglyphs: 0.0 % of placed signs were a picture of anything

`tools/census.mjs hieroglyph_wall` on the shipped state — 111 placements per repeat:

```
13 mouth  12 neb  10 sky  10 water  9 pot  9 stool  7 arm  7 hills  6 bread  5 hetep  4 pool …
```

**Not one creature sign.** No falcon, owl, vulture, quail, jackal, scarab, cobra, bee, seated figure
or wedjat — every one of which is in the library, drawn from its real silhouette, and has been all
along. 92 of 111 placements were flat geometric signs. Critic pass 8 read the list back almost
exactly: *"rounded rectangles, ovals and pills… a circuit board."*

**The library was never the problem. Two things kept the creatures off the wall.** `POOLS.offering`
contained no creature at all, so every other text column could not draw one; and `POOLS.divine`'s
four creatures were four names in twenty, reachable only from the single layout branch that asks for
a full-height sign — expected count about one per tile, and the tile that shipped got zero. On top
of that, 38 % of quadrats were two- and three-deep stacks that each emit two or three placements, so
*by placement* the wall was about three-quarters bars and pills.

Fixed at all three: creatures added to every pool in proportion (the commonest uniliterals in
Egyptian are the owl, the quail chick and the reed — birds are the texture of the script, not its
garnish); `pick()` gained a `preferP` bias so a slot that can hold a figure usually does; and
`quadrat` was rebalanced, including a new branch for the two widest and most recognisable signs in
the set, `jackal` and `wedjat`, which **no previous branch could ever admit** — the old wide branch
capped height at 0.4 and they are 0.82 and 0.78 tall, so the jackal and the eye of Horus were
unreachable by construction.

```
hieroglyph_wall            shipped   pools only   pools + bias
creature share ("a picture") 0.0%      13.2%         34.3%     G1b >= 20%   PASS
figurative (incl body parts) 20.7%     31.1%         51.0%     G1  >= 35%   PASS
drawn-width sd/mean          0.326                   0.359     G2 must rise PASS
distinct signs per repeat      23                       31
```

## 5. Depth cueing: a light edge and a dark edge on every stroke

The brief expected this to matter as much as the shapes, and the measurement agrees.

`carve()`'s existing arris is deliberately **symmetric** about the cut, and its note gives the
reason: a baked top-left key is directional, it contradicts the sun on half the building, and it is
§7.3's "carvings look painted-on". That argument is correct **and it is about a sun cue**. It is not
an argument against a **gravity** cue, and that distinction is the whole of the new term:

> A sunk relief has two horizontal walls and they are not the same surface. The wall under a cut's
> top rim is an **overhang** — it faces down, sees no sky, and holds three thousand years of soot.
> The wall above the bottom rim is a **ledge** — it faces up, catches the sky, and collects pale
> dust. That is true on the lit face and the shaded face of the same pylon, at every hour, and at
> night. It is what the rejected sun cue could not do.

It is authored in the **albedo** because that is the only channel that reaches every lighting state:
`aoKey` is 0 so the baked occlusion never multiplies the key, and the normal map goes flat in shadow,
where most of this recipe's frame area sits.

```
G3c  lower-lip minus overhang luma, hieroglyph_wall
       cue off  +0.0372      cue on  +0.1895      delta +0.1523   (>= +0.030)  PASS
G3d  sign positive — the lit edge is the ledge, not the overhang                PASS
G3a  p90-p10 spread in sign boxes minus plain wall  +0.0409 -> +0.0866          rose
CAL-G same texels, albedo shifted in y   -0.0025 against +0.1895                FIRED
```

### Two criteria of my own were too weak, and I am recording that rather than leaning on them

- **G1** counted "or a named body part" as figurative, and the control already scored 20.7 % —
  `mouth` is a body part that renders as a pill, so a 35 % bar could have been cleared by drawing
  *more pills*. G1b (creature share, control **0.0 %**) was registered before the candidate existed.
- **G3b** asked for |cue| ≥ 0.020 and the control already reported **+0.0377**, from
  `weather({directional})`'s existing sky term. A threshold the control clears is not a threshold.
  G3c (the A/B delta) replaced it, registered before the change.
- The **first version of CAL-G shifted the albedo horizontally** and failed to move: +0.0335 against
  a true +0.0377. Every confound here is a function of *y* — register bands, the ashlar course ramp,
  downward streaking — and the lip and overhang populations do not sit at the same y, so a
  horizontal shift broke no association at all. The arm is vertical now and it fires.

## 6. Guards, and one number I am not happy with

- `tools/wallstrip.mjs` at `temple`'s 248 px/repeat over 5 repeats: no countable landmark; the
  cartouches form a texture rather than a beacon, which is what the §13 fix intended. **G4 clean.**
- §13's rarest-and-largest ratio: `hieroglyph_wall` 2.12 → **2.32x** (fine).
  **`column_papyrus` 1.92 → 3.86x**, and 3.86x is the figure §81.3 records as already measured and
  rejected on `hieroglyph_gilded`. `hieroglyph_gilded` itself is 3.10 → 3.52x. The offender is a
  rare, wide, black `vulture` in a wide register cell. A quadrat aspect cap was added (a quadrat is
  a square-ish group, and letting a tall sign fill a much taller cell is both wrong and how a rare
  sign becomes a landmark) and it did **not** move this case, because width binds the fit there, not
  height. Recorded as open rather than argued away. The mitigating argument, which I did not want to
  rest on: `column_papyrus` is the one recipe in the level whose V is *registered* 1:1 per column
  (`COLUMN_V_TILE`), so the within-surface repeat the beacon metric assumes does not exist there.
  Next pass should either narrow the offering pool's widest creature or re-derive the metric for a
  registered map.

## 7. Bake status — deliberately stale, on the coordinator's instruction

The palette half was baked and committed (`textures.bin` written 21:24:23 UTC, commit `94580b3`).
The coordinator then established that **captures read the baked cache**, not the recipes
(`Textures.js:110 bakedEnabled()` defaults true and neither `tools/shot.mjs` nor `tools/harness.mjs`
sets `VITE_TEX_BAKED=off`), and asked for the bake to be held until the capture queue drains.

**That correction arrived after the bake had already landed.** Timing, for whoever needs to check
their run: blob written **21:24:23 UTC**; the lock holder at the time of the correction took the
lock at **21:30:05**, i.e. after the write, so that run is self-consistent. Any capture that booted
before 21:24:23 and any that booted after are reading different textures, and an A/B whose two arms
straddle that instant is contaminated.

The glyph half is therefore committed **unbaked**. `tests/textures.test.mjs`'s staleness guard is RED
and that is the correct state: recipe and cache genuinely disagree. 222 of 223 tests pass; the one
failure is that guard. It must not be silenced, skipped or loosened — it needs one `npm run bake`
once the queue is clear.
