# Art direction review — r9

Reviewed blind: ten frames in `shots/r9/`, against `sly3-venice.jpg` and `sly3-crop-4x.png`.
No engineering notes, issue logs, or history were read before the judgements below were formed.
`src/` was consulted afterwards, only to confirm two mechanisms already visible in the pixels.

---

## 1. Score: **4 / 10**

There is a real game here and a real art pipeline behind it — the Egyptian massing in
`dunes.png` and `traversal.png` is confident, the camera in `courtyard.png` is composed by
somebody who has thought about composition, and at 4x magnification the Sly model in
`dunes.png` is genuinely close to on-model. That is why this is not a 3.

But it is not a 5, because a 5 would be a competent hobby project that merely lacks polish, and
this project is failing at the one thing its name commits it to. Sly Cooper is a **graphic** style:
flat cel bands, true-black ink, and a character whose costume colour is a brand constant.
Measured against the reference, this build has none of the three. Sly's shirt saturation swings
from **0.06 to 0.66** across ten frames against a reference constant of **0.91** — he is lavender
in `traversal.png`, magenta in `temple.png` and near-white in `combat.png`. Shadow ramps rotate
hue by **176–187°** where the reference rotates by **6–45°**, so no surface in the game has a
stable colour. The ink line never reaches black. The character's shading is a smooth airbrush
gradient with no cel step anywhere on his body. Two of the ten frames — the two whose entire
job is to sell the character, `sly-closeup.png` and `sly-perch.png` — are the weakest in the set.
The frames are Egyptian. They are not Sly Cooper.

---

## 2. Defects, worst first

### D1 — Shadows rotate hue ~180°, so nothing in the game has a stable material colour
**Frames:** `dunes.png`, `sly-perch.png`, `hero.png`, `traversal.png`, `courtyard.png` — everywhere lit by sun.

Same material, lit patch vs shadowed patch, mean HSV:

| frame | surface | lit hue | shadow hue | **Δhue** | lit sat → shadow sat |
|---|---|---|---|---|---|
| `dunes.png` | sand | 19.1° | 206.0° | **186.9°** | 0.674 → 0.222 |
| `sly-perch.png` | floor | 29.1° | 204.6° | **175.5°** | 0.538 → 0.387 |
| `hero.png` | floor | 26.1° | 202.8° | **176.7°** | 0.398 → 0.265 |

Reference, same test:

| surface | lit hue | shadow hue | **Δhue** |
|---|---|---|---|
| walkway boards | 55.5° | 68.3° | **12.8°** |
| left building | 65.8° | 71.3° | **5.5°** |
| centre building | 179.8° | 134.9° | **44.9°** |

The reference drops value and drops saturation and **holds hue**. This build substitutes the
complement. Look at the crop of `dunes.png` foreground: the same sand appears as hot orange
(201,108,65) and as teal-grey (58,68,75) with a hard 1px-stepped boundary and no penumbra,
so it reads as two unrelated materials — lava and a green lake — not as one dune with a
shadow on it.

This is the root cause of most of the rest of the list. Confirmed in `src/render/ToonMaterial.js`:
`shadowHue: 0x2a3f66` (hue 218°) lerped `shadowTeal: 0.15` toward `turquoise: 0x2fa8a0`
(hue 176°), applied at `shadowTintPeak: 0.62`. A fixed blue-teal at 62% strength over a warm
albedo lands almost exactly on the 202–206° I measured. The shadow colour is a **global
substitution**, not a per-material derivation.

### D2 — Sly has no colour identity; his costume changes hue and saturation every frame
**Frames:** all ten. Worst: `combat.png`, `traversal.png`, `temple.png`, `sly-perch.png`.

Mean colour of a torso patch on his shirt:

| frame | RGB | hue | **sat** |
|---|---|---|---|
| **REF-venice** | (11, 60, 122) | 213.5° | **0.909** |
| `dunes` | (54, 80, 159) | 225.3° | 0.659 |
| `hero` | (55, 70, 134) | 228.6° | 0.590 |
| `sly-closeup` | (99, 127, 204) | 224.3° | 0.510 |
| `interior` | (69, 74, 121) | 234.7° | 0.427 |
| `night` | (57, 63, 96) | 230.5° | 0.401 |
| `courtyard` | (88, 99, 133) | 225.7° | 0.343 |
| `sly-perch` | (160, 150, 204) | 251.2° | 0.266 |
| `temple` | (120, 92, 108) | **326.1°** | 0.228 |
| `traversal` | (116, 111, 129) | 256.7° | 0.138 |
| `combat` | (172, 161, 170) | **309.5°** | **0.064** |

Two findings. First, **not one frame reaches even 73% of the reference saturation, and six of
ten are below half.** In `combat.png` the shirt is (172,161,170) — a neutral pinkish grey.
Second, there is a **systematic violet bias**: every measured hue is ≥ 224°, mean 234.6°
excluding the two magenta outliers, i.e. ~21° violet of the reference's 213.5°. Sly's blue is
the single most recognisable asset in this IP and it is never once rendered correctly.

### D3 — The character is shaded with smooth gradients, not cel bands
**Frames:** `combat.png`, `sly-perch.png`, `sly-closeup.png`, `traversal.png`.

On a single-material patch (his shirt), mean horizontal luminance gradient (×255):

| patch | mean &#124;dL/dx&#124; | top-3-bin share |
|---|---|---|
| REF Sly shirt (clean 4x crop) | **1.52** | 0.351 |
| `combat.png` Sly shirt | **9.56** | 0.184 |
| `sly-closeup.png` Sly shirt | 6.47 | 0.299 |
| `sly-perch.png` Sly shirt | 5.18 | 0.289 |

**6.3× the gradient energy of the reference on the same body part.** Open `c_combat.png` next
to `c_ref.png` and it is unarguable: the reference shirt is two flat blues meeting at a hard
terminator; this shirt is a continuous lavender-to-white airbrush ramp. There is no cel step
anywhere on the character in any frame.

The consequences on the same crop: the tail is **one uniform beige mass with no rings** —
the reference tail has four hard-edged alternating bands and it is the character's read at
distance. White shorts and red sash have merged into one orange-red short. A blown white
specular blob sits on his chest and reads as a hole. The boots are more saturated than the
shirt, so the costume's blue no longer reads as one material.

### D4 — The hero is too small and too low-contrast to be the subject of his own frames
**Frames:** `courtyard.png` (worst), `night.png`, `temple.png`, `hero.png`.

Character height as a share of frame height — reference **34.0%**:

| frame | height | % of frame |
|---|---|---|
| `courtyard` | 40 px | **5.6%** |
| `night` | 84 px | 11.7% |
| `temple` | 88 px | 12.2% |
| `hero` | 128 px | 17.8% |
| `dunes` | 156 px | 21.7% |
| `traversal` | 158 px | 21.9% |

`hero.png` is the worst offender on contrast, not scale: the mean luminance difference between
Sly and a 40px ring around him is **0.0063** — he is optically the same value as the hieroglyph
wall behind him. `courtyard.png` is worse still: there are two raccoon-silhouetted figures in
frame, one crushed to a featureless near-black blob in the lower-left (`c_court2.png` — no
internal value separation at all) and one 40px-tall blue figure at centre-left, and a viewer
cannot tell which is the protagonist. In `night.png` (`c_night.png`) Sly is functionally
invisible; the brightest thing on him is a blown-white specular artifact.

### D5 — There is no black in the picture, and the ink line is grey
**Frames:** all; worst `sly-closeup.png`, `sly-perch.png`, `combat.png`, `temple.png`, `dunes.png`.

Share of frame below L=0.15 — reference **18.95%**:

| frame | <L 0.15 | IQR |
|---|---|---|
| `dunes` | **1.27%** | 0.250 |
| `sly-perch` | **2.52%** | 0.236 |
| `combat` | **2.61%** | 0.133 |
| `temple` | **2.86%** | 0.180 |
| `sly-closeup` | **3.64%** | **0.083** |
| REF-venice | 18.95% | 0.167 |

And the ink line itself, sampled with a ridge detector (dark valley with lighter pixels on both sides):

| | darkest-decile ink L | frame minimum |
|---|---|---|
| REF-venice | **0.031** | **0.000** |
| every r9 frame | 0.087 – 0.106 | 0.027 – 0.075 |

The median ink darkness is actually fine (ours 0.12–0.24, reference 0.118) — the problem is
specifically that **the darkest end has been lifted ~3×**. The line bottoms out at dark grey.
Combined with the missing shadow end, the images have no anchor: `sly-closeup.png` has an
interquartile luminance range of 0.083, i.e. half the frame lives in an 8%-wide value band.
That is what makes it look washed rather than graphic. Cause is almost certainly ordering —
the ink is being fogged/graded rather than composited last.

### D6 — Environment surfaces carry painterly/photographic noise where cel wants flat
**Frames:** `hero.png`, `traversal.png`, `courtyard.png`, `temple.png`, `dunes.png`.

Large single-material surfaces, mean horizontal luminance gradient (×255) and top-3-histogram-bin share:

| surface | mean &#124;dL/dx&#124; | top-3-bin | levels >1% |
|---|---|---|---|
| REF wooden walkway | **0.51** | **0.732** | 9 |
| `combat.png` stone block | 0.85 | 0.643 | 10 |
| `sly-perch.png` wall | 2.19 | 0.552 | 14 |
| `temple.png` column | 3.52 | 0.311 | 17 |
| `hero.png` temple wall | 3.66 | 0.198 | 30 |
| `dunes.png` pylon | **5.97** | 0.373 | 20 |

**7–12× the surface noise of the reference**, and a third of its flat-area share. Globally, the
fraction of pixels in a truly flat 3×3 neighbourhood is 0.15–0.18 in `hero`/`courtyard`/`temple`/
`traversal` versus 0.296 in the reference. The sarcophagus lids in `hero.png` and the columns in
`interior.png` carry what looks like photographic rust/granite noise; `courtyard.png` and
`temple.png` carry a directional smeared-brush pass over everything including the sky. This is
Okami-via-Borderlands, not Sucker Punch.

### D7 — Materials are not distinguishable from one another
**Frames:** `sly-perch.png` (worst), `hero.png`, `temple.png`.

Pairwise CIELAB ΔE between hand-placed patches on named materials (ΔE ≈ 2.3 is the just-noticeable threshold):

- `sly-perch.png`: **metal handrail vs Sly's fur tail = ΔE 2.1**. Wall vs lit floor = 4.5. Lit floor vs his tail = 5.9.
- `hero.png`: sarcophagus lid vs metal beam = 5.0. Stone wall vs metal beam = 6.2.
- `temple.png`: column vs wall relief = 5.2.

Stone, painted metal, gilt and fur all resolve to the same value and nearly the same chroma.
The reference distinguishes Sly's blue, his white shorts, his red sash, the wood road and the
stone buildings as five separable colour identities. This is D1's direct consequence: if the
shadow colour comes from a global tint rather than from the albedo, every material in shade
converges on the same teal.

### D8 — `night.png` is a single-hue frame with three-quarters of its pixels crushed
Circular hue spread of chromatic pixels: **12.0°**. Every other frame in the set is 54–133°;
the reference is 52.5°. **99.2% of pixels are chromatic and 98.4% of them fall inside one 60°
hue window.** 61.4% of the frame sits below L=0.10, 74.8% below L=0.15, IQR 0.094. This is not
a night scene, it is a blue duotone. Sly Cooper night levels keep warm lamp pools, warm
interior spill and a readable hero against the cool; here two orange window slabs are the
entire warm budget and the hero is undetectable.

### D9 — The `courtyard.png` statues read as smiley faces
`c_statue.png`. Both flanking monuments have an upturned gold arc at the base that reads
unambiguously as a **grinning mouth**, a slab nose, and a cyan-ringed circle that reads as a
single eye. Stacked rectangular slabs with horizontal blue bars; the silhouette is closer to a
hi-fi amplifier or a Lego minifig than to anything pharaonic — no nemes fold, no beard, no
cartouche, no human proportion. The gilt bands carry a wood-grain/rust photo texture. This is
the largest object in the frame and it is comic in the wrong register for a heist game.

### D10 — Distant silhouettes are unfiltered and get no ink
`c_pyr.png` (`traversal.png` top), and the right and centre pyramids in `dunes.png`. The pyramid
edge against the sky steps in hard ~10px jumps (median jump width 11px in `traversal`, 9px in
`dunes` centre) with a 1-pixel transition and a maximum luminance step of 0.587 — no
antialiasing whatsoever. The distant geometry also receives **no ink outline at all** while
midground objects receive a heavy one, so the outline system reads as depth- or
resolution-limited rather than as a deliberate weight hierarchy. There is no aerial perspective
either: the pyramid sits at nearly the same value as the sky it is silhouetted against.

### D11 — Sly's face and hands are off-model in the two close-ups
`sly-closeup.png`, `sly-perch.png`, `c_perch.png`. The muzzle is heavy and jowled with a visible
chin fold and a **downturned frowning mouth**; the reference muzzle is slim, tapered and
smirking. **There is no black nose.** The mask has become a pair of round wire-rimmed
spectacles with visible brown irises — the reference mask is a broad pale bandit band across
the eyes, outlined, integral to the head shape. Ears are stubby triangles rather than large
upright shapes contributing to silhouette. The hands are oversized starfish with four to five
long tapered claws where the reference has compact blue gloves. In `sly-perch.png` the left
glove cuff floats disconnected from the forearm. The net read is an elderly figure in reading
glasses, not a master thief.

### D12 — Effects are unshaped
The slash in `combat.png` is a soft grey smear arcing across a third of the frame with no
graphic edge, no colour and no tapering — it reads as a thumbprint on the lens, and it also
desaturates everything it crosses (which is why the shirt patch there measures sat 0.064).
The god rays in `temple.png` are strong enough to take the whole frame's darks to 2.86% below
L=0.15. Reference VFX are hard-edged, coloured and drawn.

---

## 3. What is genuinely good — do not break these

- **The base character mesh is close.** `c_dunes.png` (Sly at 4x in `dunes.png`) is the best
  thing in the set: the cap reads, the mask reads, the ears read, the belt and red shorts read,
  **and the tail shows its bands there.** The tail rings exist in the asset; they are being lost
  to lighting and to gradient shading in other frames, not missing from the model. That is a much
  cheaper fix than a re-model, and it means D3/D11 are largely grading problems on top of a
  sound base.
- **Composition in `courtyard.png`.** Symmetric flanking masses, obelisk on the centreline,
  strung lamp cables leading the eye, a foreground shelf for scale. If the statue design (D9)
  and the hero read (D4) were fixed, this would be a poster frame.
- **`interior.png` is the most coherent frame in the set.** It is the only one with a working
  warm/cool relationship — orange sconce pools against cool purple stone — and the only one
  where jars and pots give honest scale. The hero reads. Keep this lighting recipe.
- **The ink line's *median* weight is right.** Ridge-detector median width 2px and median
  luminance 0.12–0.18, versus the reference's 1px / 0.118. The line has the correct thickness
  and the correct density; it only lacks its darkest values. Don't retune width chasing D5.
- **Environment vocabulary and massing.** Hypostyle columns in `temple.png`, the pylon-and-
  ramp layout in `dunes.png`, the cornice-and-frieze language in `hero.png` and `traversal.png` —
  the architecture is researched and the traversal reads as climbable. The problem is finish,
  not layout.

---

## 4. The single highest-value fix

**Stop the shadow ramp substituting a global tint colour. Derive the shadow band from each
material's own albedo — hold hue within ~15°, drop value, drop saturation.**

I am choosing this over the character work, which is the more emotive complaint, because it is
one shading function and it is upstream of five of the eleven defects above. Right now
`ToonMaterial.js` mixes a fixed `shadowHue: 0x2a3f66` toward `turquoise: 0x2fa8a0` at
`shadowTintPeak: 0.62`. Applied at 62% strength, that overwrites the albedo instead of shading
it, and everything follows:

- Every material converges on the same teal in shade, which *is* D7 (metal rail ΔE 2.1 from a fur tail).
- Warm surfaces invert to their complement, which *is* D1 (187° on sand).
- Sly's blue is pushed violet in light and grey in shade, which is the mechanism behind D2's
  0.06–0.66 saturation swing and the systematic +21° violet bias.
- A 180° hue flip cannot be read as a shading step, so the terminator stops looking like a cel
  band and starts looking like a material change — which is half of D3 and D6.
- And the whole set collapses to one teal-and-orange palette, which is why ten frames of five
  different locations read as one location.

Fix it and re-shoot. Measure success the same way I measured failure: same-material lit-vs-shadow
Δhue should land under 30° on `dunes.png`'s sand and `hero.png`'s floor, and Sly's shirt patch
should measure the same hue ±10° and the same saturation ±0.10 in all ten frames. Only then is
it worth touching the face (D11) or the ink black point (D5), because until the grading is
stable you cannot tell whether an asset is wrong or merely badly lit.
