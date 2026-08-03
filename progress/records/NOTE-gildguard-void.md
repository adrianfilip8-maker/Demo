# NOTE-gildguard-void — the `guard` gilded seal is void, and I am the one who proposed it

§158.5 (mine) named `guard` as the best gilded view in the canonical set and the coordinator, quite
correctly, declined to route a seal on it without the share re-measured as gate zero.

**The share is exactly right and it was the wrong gate.** Measured in a frame, `guard` holds the
**darkest** gilded population of the nine framings that have one — not the best view, the worst.
No capture was spent to find this out.

Instruments: `progress/records/ringpx.mjs`, `progress/records/matmask.mjs`,
`progress/records/gilddepth.mjs`, and `progress/records/gildlit.mjs` (new — crosses an architecture
material mask with an already-captured PNG). All offline, no lock.

---

## 1. Gate zero passes, on two independent instruments

| instrument | `arch:hieroglyph_gilded` share of `guard` |
|---|---|
| `ringpx.mjs` (z-buffered raster, `--props`) | **23.18 %** |
| `matmask.mjs` (independent raster) | **23.18 %** |

§158.5's figure reproduces to the digit on the current tree. The stale-share hazard the coordinator
was guarding against did not fire here. It also would not have saved the seal.

## 2. The gate that does void it: the population is unlit

`gildlit.mjs` on three existing `guard` captures spanning three different trees (Aug 1 13:53 →
20:33), architecture mask eroded 2 px, percentiles not means:

| capture | gild L p05 / p50 / p95 | share >L160 | `sandstone_worn` L p50, same frame |
|---|---|---|---|
| `shots/r3/guard.png` | 11.1 / **17.6** / 58.3 | 0.33 % | 75.6 |
| `shots/cap2/guard.png` | 11.3 / **17.2** / 96.7 | 0.39 % | 81.2 |
| `shots/eye1/guard.png` | 11.3 / **17.2** / 73.5 | 0.34 % | 76.3 |

The gilded surface sits at **0.23× the median luma of the plain sandstone beside it in the same
frame**, and it is stable to three decimal places of that ratio across three trees — so this is not
one stale capture and it is not sensitive to the shading and FX changes that landed between them.

Localised on screen, the gild's median luma by cell (160×120 px):

```
y 240:                      37    20    76    82
y 360:                      28    18    33    12
y 480:                      18    22    18    17
y 600:                      17    17    16    16
```

Only the two top-right cells (~15.5 k px, 1.7 % of frame, beside the brazier) have a lit median.

Counted per pixel rather than read off those medians: **76.2 % of the gilded population is under
L 30, 82.2 % under L 40, 89.5 % under L 60.**

*(I first wrote "~93 % under L 40", inferred from the cell table by summing the pixel counts of
cells whose median was under 40. That is the wrong statistic — a cell median under 40 does not put
all of that cell's pixels under 40, and the within-cell spread here is wide. The per-pixel count is
82.2 %. Same direction, and it was 11 points out; recorded rather than quietly corrected, because
"summarise the summary" is the cheap version of the mistake this note is about.)*

### 2.1 And the image says the same thing, which is the part that matters

`guard` is staged at `tod 0.10` — it is a night frame. At 2× (`shots/cap2/guard.png`, region
760,300 480×400) the near gilded mass in the bottom-right is a **featureless near-black navy slab**
with a thin lit lip along its top arris: no gold, no chisel signs, no legible relief. A further
part of the mask region is covered in the real frame by the two guard characters, which an
architecture-only mask cannot see.

So a seal there could not test §7.3's gold condition even in principle. "Hard spec + bloom + dark
occlusion" needs the gold to *read* first; here there is a dark shape where the gold is.

## 3. Where the gold seal should go instead

Same instrument across every framing whose mask contains the material, newest available capture of
each. `gild/ref` is the gild's median luma over `sandstone_worn`'s in the **same frame**, which is
the tree-robust column — the absolute luma is not comparable across rows, because these captures
come from different trees (`tx7` ≈ 7dc4442, `r3` much older).

| shot | capture | gild share % | L p05 / p50 / p95 | share >L160 | gild/ref |
|---|---|---|---|---|---|
| `hero` | tx7 | **28.29** | 23 / 39.5 / 93.7 | 0.26 % | 0.76 |
| `guard` | eye1 | 22.68 | 11.3 / **17.2** / 73.5 | 0.34 % | **0.23** |
| `traversal` | r3 | **12.94** | 30.6 / 57.6 / 179.9 | **11.09 %** | 1.04 |
| `night` | r3 | 10.39 | 6.7 / 12.6 / 50.2 | 0 % | 0.77 |
| `courtyard` | r3 | 5.77 | 43.9 / 88.5 / 165.8 | 6.57 % | 0.86 |
| `combat` | r3 | 5.43 | 47.3 / **144.3** / 198.7 | **40 %** | **2.85** |
| `interior` | tx7 | 4.92 | 29.2 / 89.8 / 104.3 | 0 % | — |
| `dunes` | r3 | 4.04 | 66.8 / 111.5 / 151.2 | 1.64 % | 1.16 |
| `temple` | tx7 | 1.44 | 32.5 / 105 / 173.4 | 14.32 % | 1.25 |

Reading it:

- **`traversal` is the best-balanced candidate** — 12.94 % of frame *and* an 11 % highlight tail,
  with the gild at parity with the sandstone reference. It is the only row with both a real share
  and a real tail.
- `courtyard` is the second, at half the share and half the tail.
- **`hero` has by far the most gold and almost none of it lit** (0.26 % over L160, gild/ref 0.76),
  which is the in-frame form of the record's "98.6 % shadowed on this material". A gold-as-metal
  seal on `hero` would be measuring shadow.
- **`combat` is not a candidate despite the best-looking numbers**: 40 % of the population over
  L160 with p95 198.7 is the frame §9 already records as blown to near-white. A specular test
  inside a clipped highlight measures the tonemap.
- `temple`'s 14.32 % tail is real but sits on 1.44 % of frame, which agrees with
  `RESULT-hgchisel-frame` §1.1 (90.2 % of the gilded run occluded) and is why P3 was untestable
  there.

**Framing is the coordinator's call; this is the measurement.** What I am asking for is that
whichever framing is picked, gate zero is **luminance, not share** — see §4.

## 4. The gate to register, and why the share gate would have passed a void seal

The coordinator's instruction was right in shape and aimed at the wrong quantity, and that is worth
separating because the shape is reusable:

> a seal must re-measure its own premise as gate zero and void itself if it has moved

Registered here in its corrected form, for any gold seal:

```
GATE 0a  share      re-measure the material's share of frame; void if |Δ| > 20 % relative
GATE 0b  luminance  gild L p50 / same-frame reference L p50 >= 0.85, AND share over L160 >= 3 %
                    measured with gildlit.mjs on the arm's own base capture, before scoring
```

0b is what `guard` fails (0.23 and 0.34 %) and what `traversal` passes (1.04 and 11.09 %). **0a
alone passes `guard` at 23.18 % and would have licensed the whole capture.**

This is the third dress of the same error the record keeps naming — `gilduv.mjs`'s own header says
it, §121.8 says it, and I made it anyway: **a geometric availability measure is not a visibility
measure.** §158.5 crossed share against mm/px, both geometric, and produced a confident ranking in
which the true worst row was first. The correction needed one number that has a light in it.

## 5. Status of the two §7.3 gold clauses, so this is not read as more than it is

- **`PAL.goldSpec` — settled, at its site, not by this note.** `Materials.js:149–190`: gold does not
  want sand's `PAL.sun` substitution and does not want a hex of its own, because a metal's
  highlight is tinted by the metal and the shader already derives it from the albedo
  (`specTint = mix(uSpecColor, alb*2.0 + uSpecColor*0.25, slyMetal)`). This file's `goldSpec`
  reaches no specular term at all — `ToonMaterial.js` declares its own private palette copy.
- **"gold doesn't read as metal" — still open, and this note does not move it.** It narrows where
  it can be tested. ~~The dark-base half of it is measured and is not TEXTURES': the authored map
  carries AO p50 0.412 and the frame shows 0.992, because `ao` never multiplies the key term
  (§8, `toon.glsl.js:365`). That is SHADING's.~~

  > **CORRECTION, coordinator, 2026-08-03 — struck at the declaration site. This is the withdrawn
  > §34 triple, and its fourth appearance.** `tools/texlab.mjs:174` emits `aoP: [1, 5, 50]`, so
  > `hieroglyph_gilded`'s authored AO is **p1 0.247 · p5 0.416 · p50 0.992**. Read with `roughP`'s
  > p5/p50/p95 labels, p5 0.416 became "authored median 0.412". **The authored median is 0.992 —
  > the same number as the "frame" figure it is being contrasted against.** There was never a
  > 0.412→0.992 loss; the two figures are one figure wearing two labels. And the in-frame AO median
  > had *no instrument*: nothing in the repo reads an AO channel back from a rendered frame, and the
  > only 0.992 anywhere is `aoP[2]` itself.
  >
  > So the routing goes with the premise: **the dark-base half is not "measured and SHADING's".** It
  > is unmeasured. What survives §34 is one shader fact — `ao` does not multiply the direct key term
  > (`toon.glsl.js:365`) — which was sized against percentiles two steps off, over-predicts ~5×, and
  > on `hero` can reach only the **1.4 %** of gilded pixels that are key-lit. That is a candidate,
  > not a finding, and it needs an in-frame instrument that does not exist yet.
  >
  > Nothing else in this note depends on the struck sentence: §§1–4 are luminance measurements from
  > `gildlit.mjs` and stand on their own. The `traversal` routing in §3 is unaffected.
