# RESULT — the ramp is still smooth, and geometry is no longer why

Measured with `bandread.mjs` on `shots/fx21/*.png` (FX's `fx21` run, quality `high`, 1280×720).
Those frames are another owner's and predate my `Props.js` change, which makes them a clean
baseline for a question that has nothing to do with it. Crops promoted to
`progress/records/crops/` because `shots/*/` is gitignored and §139 has already shown what that
costs.

## The claim this overturns

The geometry brief I was given states the diagnosis plainly:

> "the shading code was exonerated: the 3-band quantiser is correct. The reason no terminator is
> visible is that the scene is boxes and faceted cylinders — a flat face has one normal, so it
> lands wholly in one band and the banding has no gradient to appear on. **This is a *geometry*
> defect and it is yours.**"

`toon.glsl.js:174-179` carries the same premise in the shipped source: *"this level is boxes and
faceted cylinders … Every large surface in the game is therefore a single flat tone no matter how
the ramp is tuned, and geometry work is the only fix on that path."*

That premise was true when it was written. **It is no longer true, and the condition still fails.**

## The measurement

`courtyard`, the near jar — a small, close, unambiguously curved, unambiguously lit prop, i.e.
exactly the surface the premise says was missing:

| quantity | value | what a 3-band ramp should give |
|---|---|---|
| luma span | **124.5 L over 66 px** | a large span is required, and it is there |
| median \|dL/dx\| | 5.36 | near 0 between bands |
| spike ratio (p95/median) | **2.3×** | high — plateaus separated by steps |
| plateau share (<0.35 L/px) | **3.1 %** | most of the surface |
| steps detected | **0** | 2 on a convex form crossed once |

Profile, left to right across the jar: `.......::::. .:-=+*#%%@@@@@@%%##@@@@%%###**+--::....`

That is a textbook smooth diffuse falloff. The geometry supplied a full 124 L of normal gradient
and **nothing quantised it**.

## Three regions that could not answer, and why that matters

I picked four regions. Only one could answer the question, and I only found that out by looking
at the crops — the numbers alone would have produced three wrong conclusions:

| region | numbers said | the crop showed | usable? |
|---|---|---|---|
| `hero` pier | 51 % plateau, 3 steps | flat **shadowed** slab — no normal gradient, in shadow | **no** |
| `courtyard` colossus | 7.6× spike, **16 steps** | heavy orange/blue texture mottling on a flat face — the "steps" are texture edges | **no** |
| `hero` columns | **120× spike**, 51 % plateau | distant columns washed flat by haze; the spikes are the ink lines *between* them | **no** |
| `courtyard` jar | 2.3× spike, 3.1 % plateau | a lit curved pot, cleanly | **yes** |

The colossus and column regions would each have been reported as *"banding present, 16 steps"* and
*"120× spike ratio"* on their numbers. Both are artefacts of the instrument meeting the wrong
surface. This is `lvl.mjs`'s lesson recurring: **print and look at the region, every time.**

`temple` was then tried twice as the canonical column shot, and neither region could answer
either — 14.0× / 48.6 % plateau on the right shaft and 6.4× / 37.0 % on the left. The crops show
why: **at `temple`'s time of day the column shafts are shadow-side**, so what a horizontal scan
crosses is a hard bright arris on the lit edge and then a flat shaded flank. The "steps" are
carved glyphs. There is no terminator on those shafts to measure, which is a fact about the
lighting angle rather than about the ramp.

Two things worth stating from looking at that frame rather than measuring it: the columns carry a
**clear bright line along every lit arris** — that is the 2–4 cm chamfer work doing exactly the job
it was added for, and it is the strongest single "carved stone rather than box" cue in the set —
and the **light shafts are present**, which was a §7.2 failure in critic passes 1 and 2.

## What this does and does not establish

**Establishes:** the banding failure is no longer geometry-limited, at least on props. `bands: 3`
does reach the material (`Props.js:587`, `Architecture.js:167` → `ToonMaterial.js:1020`'s
`uBands`), and `slyRamp` (`toon.glsl.js:163`) quantises `ndl` in a way that reads correctly. The
gradient exists, the quantiser exists, and the output is smooth anyway. **The loss is downstream
of the quantiser, not upstream of it.**

**Does not establish:** where. I have one decisive surface, not a decomposition. Three candidates,
none measured, in my order of confidence:

1. **The banded key is summed with an un-quantised smooth fill.** `key = ramp * sh`
   (`toon.glsl.js:344`) is quantised, but the hemispheric fill added after it varies continuously
   with the normal — so on a *curved* surface the fill supplies exactly the smooth gradient that
   fills in the key's plateaus. This predicts the defect is worst on curved surfaces and absent on
   flat ones, which is testable and would invert the current explanation.
2. Normal-map perturbation dithering the band boundary into a noisy edge (KNOWN_ISSUES §2 already
   suspects `derive()`'s bump strength).
3. AgX + bloom softening the step after the fact.

**Owner: SHADING.** Candidate 1 is the same `diff`-assembly question §136.3 already opened and
left with SHADING — an additive term sitting where it changes the meaning of everything around
it. This is a second symptom of that same assembly, reached from a different direction.

`toon.glsl.js:174-179`'s comment should be corrected at its declaration site when someone owns
that file: it is currently load-bearing justification for a geometry-only route that the frames
no longer support.

## Reproduce

```
node progress/records/bandread.mjs shots/fx21/courtyard.base.png 952 1018 628 672 jar
```
Any curved, lit, near surface will do. Look at the emitted `.band-*.png` crop before quoting the
numbers.
