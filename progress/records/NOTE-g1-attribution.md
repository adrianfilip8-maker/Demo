# NOTE-g1-attribution — G1 is an FX sprite, and the POSTFX hypothesis is dead on inspection

Offline analysis only. Nothing booted, nothing captured, no `src` or `tests` touched.
Reproduce every number with `node progress/records/g1/g1measure.mjs`; its output is committed
verbatim as `progress/records/g1/g1measure.txt`.

**Verdict: FX sprite.** Specifically an ambient dust-field billboard from the `sandHigh` /
`sand_haze` family drawn with `TILE.DUST3`, whose painter is `dustPainter` at
`src/fx/Emitters.js:111-143`. The POSTFX flare-ghost hypothesis is refused twice over — once by
geometry, once by code inspection: **there is no flare or ghost pass in `PostFX.js` at all.**

---

## 0. Provenance — I could not measure `shots/r13`, and here is what I measured instead

`shots/r13/` does not exist on this tree and is not recoverable. `shots/*/` is gitignored
(`.gitignore:15`, the "only the latest curated set is committed" rule, restated for r13
explicitly in the `progress/records/*/**/*.png` block: *"shots/r13/ is already ignored under the
same policy"*), so the rollback that took it took it permanently — `git log --all -- shots/r13`
is empty and `/tmp/prerollback4`, `/tmp/prerollback14` do not hold it. I did not re-capture,
per lane rules.

**I measured `shots/r12/` — the same 16-shot set, same three named frames.** The substitution is
defensible on §328's own finding: r12 and r13 reproduce each other's defect statistics to three
decimals, and *"every `src` commit between the two captures is an inert mechanism plus a props
dedupe"*. Nothing in `src/fx/**` or `src/render/PostFX.js` moved between them. The object is
present in all three r12 frames with the same character.

**What this costs:** the critic's exact numbers (`#d79764` core, `#655460` surround, ~+50 L,
80×60 px) are r13 numbers against an r13 backdrop and I cannot reproduce them pixel-for-pixel.
My r12 numbers differ in magnitude — the r12 `sly-profile` wall behind the disc is warm red
`#b0564b`, not mauve `#655460`, so the contrast is +30 L rather than +50 L. **The identification
does not rest on the magnitude**; it rests on shape, geometry and code, all three of which are
independent of the backdrop.

---

## 1. The disc, measured in all three frames

| | `sly-profile` | `combat` | `interior` |
|---|---|---|---|
| bbox | `[776,126,910,274]` | `[806,199,852,237]` | `[671,99,713,132]` |
| size | **135 × 149 px** | 47 × 39 px | 43 × 34 px |
| centre | (843, 200) | (829, 218) | (692, 116) |
| disc mean colour | `#d08a61` L 63.86 | `#a95941` L 47.00 | `#503928` L 26.13 |
| disc peak colour | **`#e4b484` L 76.56** | `#b06545` L 50.65 | `#70522d` L 37.24 |
| immediate surround | `#b0564b`/`#a5564d` L 46.73 | `#a34e42`/`#91574a` L 43.42 | `#212930`/`#22202b` L 14.52 |
| **contrast, peak−surround** | **+29.83 L** | +7.23 L | +22.72 L |
| contrast, mean−surround | **+17.13 L** | +3.58 L | +11.61 L |

Corroborating the critic's *"second-brightest object in the frame"*: on `sly-profile` the disc
**is the brightest 16×16 block in the whole frame** (block-mean L 74.8 at (848,248)); only a
handful of isolated specular pixels on the pale pot beat it per-pixel (L 93.6 at (761,335)).

`sly-profile`'s disc is 149/720 = **20.7% of frame height**.

### Shape profile — hard-edged with a flat plateau, not a gaussian

1-px scan across the left rim of `sly-profile` at y=150:

```
x   784   785   786   787   788   789   790  ...  795..800
L  50.86 51.99 58.00 66.28 70.65 72.48 72.85      74.69 (flat)
```

10–90% rise against the **local** wall baseline:

| frame | left rim | top rim |
|---|---|---|
| `sly-profile` | **4 px** (L 50.2 → 74.7) | **3 px** (L 49.4 → 74.6) |
| `combat` | 30 px * | **4 px** (L 34.8 → 50.1) |
| `interior` | 18 px * | **9 px** (L 25.2 → 47.7) |

\* the left-rim numbers on `combat`/`interior` walk through adjacent scene structure before they
reach the rim; the top-rim numbers are the clean ones. The 1-px `combat` dump crosses
44.9 → 49.1 between x=806 and x=808.

After the rim the value goes **dead flat** — `#e4ad7a` repeated pixel-for-pixel across 6+ px on
`sly-profile`, then steps to discrete lower plateaus (74.7 → 68.4 → 62 → 55 → wall). Flat
plateaus separated by 1-px steps are a **painted, quantised texture**. A bloom or flare ghost is
a wide monotone falloff with no plateau anywhere.

### Internal structure — the thing that names the painter

At 3× (`node tools/crop.mjs shots/r12/sly-profile.png <out> 750 100 200 200 3`) the "disc" is
visibly **not one disc**. It is a cluster of overlapping hard-edged circles with their individual
arcs still readable inside the silhouette, a **dark ink arc** along the upper rim, and a
**straight-line internal boundary** cutting across the body. At 8–9× the `combat` and `interior`
instances show the same three features at smaller scale.

Those are, one for one, the three features `dustPainter` paints — see §3.

---

## 2. The geometric discriminator: the disc is NOT on a flare axis

A lens-flare ghost sits on the line from a bright source through the screen centre. Two forms of
the test, both in `g1measure.mjs`.

**(a) AXIS** — perpendicular distance of the disc centre from `source → centre`, for the four
brightest compact sources in each frame, expressed in **disc radii** so the number is not
arguable:

| frame | nearest source to the axis | perp distance |
|---|---|---|
| `sly-profile` | (1128,680) L 64.1 | 245.1 px = **3.45 disc radii** |
| `interior` | (960,216) L 80.8 (a sconce) | 201.6 px = **10.47 disc radii** |
| `combat` | (456,512) L 81.0 | 10.9 px = 0.51 disc radii — **uninformative, see below** |

**(b) LOCUS** — the stronger, converse form, and the one that does not depend on guessing which
bright thing is "the" source. If the disc is a ghost at *any* spacing `t`, its source must lie
somewhere on the line through the screen centre and the disc. Walk that entire line and report
the brightest 16-px block on it:

| frame | brightest block ON the required locus | disc peak | verdict |
|---|---|---|---|
| `sly-profile` | L 65.5 @(618,377) | L 76.56 | **locus is empty — no source is even as bright as the ghost it would have to throw** |
| `interior` | L 47.2 @(583,626) | L 37.24 | one candidate, 10.5 disc radii off every compact source |
| `combat` | L 80.9 @(439,511) | L 50.65 | **test void** |

**`combat`'s axis test is void and I am not counting it either way.** Its brightest feature is
the cane swing-trail, a bright ribbon spanning most of the frame width; a source that long has a
colinear point with *any* target, so the test has no discriminating power there. Reporting the
0.51-radii "hit" as evidence for a flare would be exactly the mistake the test exists to prevent.

**Result: the flare geometry fails on both frames where the test is valid.** On `sly-profile`
the required source locus carries nothing brighter than the disc itself; on `interior` the four
genuinely compact sources (the wall sconces) are 10–13 disc radii off-axis.

---

## 3. The code

### 3a. POSTFX — no flare pass exists. The hypothesis is dead on inspection.

`src/render/PostFX.js` is 2399 lines and its chain is enumerable in full
(`PostFX.js:2033-2380`), seven steps:

```
2042  1.  scene, linear HDR
2054  1c. FX coverage mask (TUNE.fxInkCut)
2087  1b. debugRaw passthrough
2099  2.  view-space normals
2216  3.  AO
2231  4.  ink creases
2259  5.  bloom pyramid
2285  6.  composite: AO, bloom, grade, tonemap, ink, vignette, dither
2372  7.  FXAA
```

There is no flare pass, no ghost pass, no lens-dirt texture, no sprite-space or
mirrored-UV resample, and no uniform carrying a light's screen position. Every `flare` /
`ghost` / `halo` hit under `src/render/` is prose:

- `PostFX.js:555` — *"the traversal **flare ball** … routed to **FX**"*, an FX-owned quad,
  written as an explicit statement that this family is not POSTFX's.
- `PostFX.js:536` — "blown to a white **ghost**", the critic-10 character bloom complaint.
- `PostFX.js:455-460, 2275` — bloom "halo", the tent-upsample pyramid.
- `Lighting.js:297, 941, 1035, 1128` — `TUNE.shaftFlare`, a **half-width widening term on
  volumetric shaft ribbons**, geometry in the scene pass, not a screen-space element.
- `PostFX.js:878-881, 1373` — chromatic aberration, explicitly `uChroma = 0`, taps collapse.

And the decisive one: `src/render/Sky.js:809-812`

```js
/** Screen-space-ish direction of the sun, for POSTFX god-rays / lens flare. */
getSunViewDirection(out) { return (out || _v3).copy(this.atmosphere.sunDir); }
```

**`getSunViewDirection` has zero callers** anywhere in `src/`, `tests/` or `tools/`. It is the
accessor a flare pass would consume, and nothing consumes it. The comment describes a pass that
was never built.

*This is a real result and it should be recorded as one: the second of the two candidates §328
named cannot be tested against frames, because the mechanism it names is not in the build.*

### 3b. FX — `dustPainter` paints precisely the object I measured

`src/fx/Emitters.js:111` — the docstring is the measurement:

> `/** Lumpy cartoon volume: a handful of overlapping discs, hard edge, two-band cel shade. */`

| measured feature | painting code |
|---|---|
| overlapping circle arcs inside one silhouette | `Emitters.js:113-120` — `lobes` blobs, union'd by `if (v > f) f = v` at `:132` |
| 3–4 px rim, then dead flat | `Emitters.js:134` — `const a = smooth(0.0, 0.09, f)`, a 0.09-wide alpha ramp on a ±1 tile; and `Emitters.js:9-13` — *"a **controlled** edge — a two-pixel ramp, not the browser's antialiasing … **Nothing here is a Gaussian blob.**"* |
| discrete plateaus 74.7 / 68.4 / 62 / 55 | `Emitters.js:138` — `const band = nl > 0.62 ? 1.0 : nl > 0.34 ? 0.80 : 0.62`, a **three-level** quantisation |
| straight internal boundary across the body | `Emitters.js:137` — `nl = clamp01((-x*0.45 - y*0.62)*0.7 + 0.55)`, a linear ramp, so its band edges are straight lines; per-particle `spin` (`Particles.js:716-718`) puts that line at an arbitrary screen angle |
| dark ink arc on the upper rim | `Emitters.js:139-140` — `rim = 1 - smooth(0.0, 0.26, f)`, `l = band * (1 - rim*0.42)` |

`makePainters` (`Emitters.js:350-362`) maps atlas index 2 = `TILE.DUST3` to
`dustPainter(rng(seed+37), **4**, 0.08)` — four lobes, matching the arc count in the `combat`
and `interior` instances.

`TILE.DUST3` is in the tile set of `sand_haze` (`Emitters.js:822`, batch **`sandHigh`** — the
batch PREREG-fxghost2 is named after) and of `sand_drift` (`Emitters.js:805`, batch `sandLow`).

### 3c. Why it is *oversized*: the ambient dust fields are explicitly exempt from the size ceiling

`src/fx/Particles.js:2183`:

```js
maxSize: key === 'air_motes' ? TUNE.moteMaxH : 0,
```

with the reason given at `:2179-2182` — *"Only the dust populations take the screen-size ceiling.
`sand_drift` runs up to 1.5 m and `shimmer` to 2.6 m on purpose … Clamping those would delete the
two fields that carry the ground haze."*

The ceiling exists and works: `Particles.js:705-706`,
`sz = min(sz, uMaxSize * max(-mvPosition.z,1e-3) / projectionMatrix[1][1])`, a diameter cap as a
fraction of frame height. `TUNE.moteMaxH = 0.028` (`:156`), `TUNE.flashMaxH = 0.45` (`:184`,
added because `cane_flash` reached 113% of frame height at the `combat` framing —
`Particles.js:2150-2153`). **`sand_haze` and `sand_drift` pass `0`, which the shader reads as "no
ceiling" (`Particles.js:612`).**

The measured disc is 20.7% of frame height: **7.4× the mote ceiling, under half the flash
ceiling, and capped by neither because it is capped by nothing.** No exotic placement is needed —
this is the shipped behaviour of an uncapped billboard in a camera-wrapped box
(`box: [90,26,90]`, `capacity: 900`, `Emitters.js:816-828`).

Two supporting details: the batch takes `softness: 0.9` (`Particles.js:2170`), so a sprite ≥0.9 m
clear of the wall behind it gets **no** soft-particle fade and keeps a hard silhouette
(`Particles.js:754-761`); and the `WRAP` toroidal box follows the camera
(`Particles.js:646-651`), which is why an outdoor *sand haze* field is also drawing inside the
tomb on `interior`.

---

## 4. Cross-check against §327 — the mechanism accounts for the 15.92 L and for the 82%

§327 measured G1 at amplitude **15.92 L** on `temple`, with **83% surviving `ambGain = 0.00`** and
r ≈ 0.21 at `alpha = 0.18`. Both numbers fall out of the shader, and §327's own two guesses
("the sprite's own emissive/base colour, or the bloom path") can be narrowed to one:

**There is no emissive term. It does not exist to be blamed.** The whole colour path is
`Particles.js:676-685` and `:777`:

```glsl
vec3 col = mix( aCol0, aCol1, u );                          // base colour, per-particle
col *= mix( uAmbTint * uAmbGain, uLightTint * boost, uLitMix );   // :683   the LIT multiply
...
gl_FragColor = vec4( vCol.rgb * t.rgb, a );                 // :777   base x tint x atlas
```

**The residual is the key leg, and `uAmbGain` cannot reach it by construction.** The shader says
so in its own comment at `Particles.js:682`: *"uAmbGain scales the AMBIENT leg only; **the key leg
and uLitMix are untouched**."* `sand_haze` ships `litMix: 0.52` (`Emitters.js:825`), so driving
`ambGain → 0` leaves `col *= uLightTint * boost * 0.52` — a leg that is 52% by weight and, at the
fallback tint constants (`Particles.js:3171` `lin(PAL.keySun)`, `:3176`
`lin(PAL.shadow)*1.5 + 0.25`; the live path at `:3169`/`:3174` derives from the scene lights, so
treat these as an anchor, not the shipped values), **71% by linear luminance**: 0.52·0.734 /
(0.48·0.325 + 0.52·0.734) = 0.710. A 0.71 linear residual maps to a *larger* fraction once it is
composited, run through AgX and read back in L\*, because both transforms are compressive. **83%
of ΔL\* is what this shader predicts. No bloom re-feed is required to explain it, and no emissive
is available to explain it.**

**The opacity arms confirm the carrier is a sprite, not a screen-space element.** `uAlphaGain`
multiplies `alpha` directly (`Particles.js:673-674`), and §327's measured response is close to
linear in it — r 0.37 at g 0.30, r 0.21 at g 0.18 (slope 1.33, near-zero intercept). A frame
composited element does not track a per-sprite opacity uniform like that; the sprite that the
uniform multiplies does.

**And that is also why the ambient arms cost nothing and the opacity arms cost the sand.**
`ambGain` retints; `alphaGain` thins *every* sprite in the pool, which is the same population
that draws the dunes haze — hence the ×0.04 field collapse §327 recorded. §327's conclusion that
*"the fix is not a dose choice but a targeting problem"* is exactly right, and this note names
the target: **the sprite's on-screen SIZE, not its opacity and not its tint.** That lever is
already implemented, already load-bearing elsewhere, and is currently switched off for this pool
with a one-token literal (`maxSize: … : 0`, `Particles.js:2183`).

One correction worth carrying: the shader comment at `Particles.js:606-607` still records the
superseded §306 claim — *"RESULT-fxartifact measured that the sandHigh ghost discs ride the
ambient leg"* — which §327 refuted for G1. It is a comment, not behaviour, so nothing is broken
by it; it will mislead the next reader of that block. I did not edit it (lane rule); flagging it
for whoever next touches `src/fx/Particles.js`.

---

## 5. Verdict

**FX sprite.** The critic's first routing is correct and its second is unavailable.

- **POSTFX flare ghost — REFUTED, twice.** No flare/ghost pass exists in the seven-step
  `PostFX.js` chain; the one accessor written for such a pass (`Sky.js:810`) has zero callers.
  Independently, the flare geometry fails on both frames where it is testable: 3.45 and 10.47
  disc radii off-axis, and on `sly-profile` the required source locus carries nothing brighter
  than the disc itself.
- **FX sprite — CONFIRMED** by shape (3–4 px rim + flat quantised plateaus + overlapping circle
  arcs + ink rim + straight cel-band terminator, matching `dustPainter`'s five painting terms one
  for one), by the code path (`TILE.DUST3` → `dustPainter(…, 4, 0.08)`, carried by the `sandHigh`
  / `sand_haze` pool §327 already instrumented), and by §327's own near-linear response to
  `uAlphaGain`.
- **The 82% is the key-light leg of the LIT multiply at `litMix 0.52`**, which `uAmbGain` is
  documented not to touch, times the sprite's `col0`/`col1` base. Not emissive (there is none),
  and bloom is not needed as an explanation.

### What is still open, and the ONE arm that settles it

I have established the **family and the mechanism**; I have not isolated **which of the two
DUST3-carrying pools** draws the specific instance in each frame — `sand_haze` (`sandHigh`,
`Emitters.js:816-828`) or `sand_drift` (`sandLow`, `Emitters.js:804-815`). Both use `TILE.DUST3`, both
run uncapped, and I cannot separate them from a still frame because the discriminating quantity
is world placement, which the pixels do not carry.

**The one arm:** a two-pole per-pool poke on the same boot, using the knob PREREG-fxghost2
already landed — `gain: 0` on `sand_haze` alone, then `gain: 0` on `sand_drift` alone — measuring
the §327 G1 rect plus the three rects in §1 of this note. One boot, two arms, no new mechanism.
Whichever arm takes the disc to zero owns it.

**Then the ship candidate to test is `maxSize`, not `gain` or `ambGain`.** Both published legs
have now been measured and both cost more than they buy; the size ceiling is the only lever that
targets *this* sprite — the oversized near-camera one — while leaving the field's population,
opacity and tint exactly as shipped, which is precisely what the `F_dunes` / `F_hero` /
`F_courtyard` bars failed on. It has a registered precedent in `TUNE.flashMaxH`, which was added
for the identical failure mode on `cane_flash`.
