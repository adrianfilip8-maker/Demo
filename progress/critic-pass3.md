# Critic — scoring pass 3

**Review set:** `shots/r3/` (hero, temple, sly-closeup, courtyard, dunes, interior) +
`shots/r3b/` (night, traversal, combat, guard) — 1280×720, quality `high`.
**Provenance:** commit **`9616d7d`**, working tree **clean** (`git status --porcelain` empty at
capture start). Verified myself; `tools/critic.mjs` does **not** stamp `commit` into its
`manifest.json` — only `tools/shot.mjs` writes that into `shots/report.json`. See "Provenance
gap" below. Nothing in this report is judged from `shots/*.png` at the repo root; those are stale.
**Reviewer:** adversarial art director per `tools/CRITIC.md`. No involvement in the build.
**Method:** every PNG and every 2× centre crop opened with the Read tool and looked at. Every
numeric claim below is measured off the captured pixels with a probe script, not taken on trust.

---

## Verdict: **REJECT**

**Mean 3.5/10, down from 4.2. Best score 4. Pass floor is 8.**

*(Scores for the final four shots are appended below once `r3b` clears the capture lock.)*

| shot | pass 2 | pass 3 | Δ | one-line |
|---|---|---|---|---|
| `hero` | 5 | **3** | −2 | Palette inverted to violet; Sly is 1.5 luma from the wall behind him |
| `temple` | 4 | **4** | 0 | Light shafts finally landed — and the columns have a 0.1-luma terminator |
| `sly-closeup` | 4 | **4** | 0 | Gold cane is real metal at last. Stiff A-pose, no bandit mask, chrome eye |
| `courtyard` | 5 | **4** | −1 | Best warm/cool tension in the set; obelisk is 1.2:1 and glyphs read as rust |
| `dunes` | 5 | **3** | −2 | Pyramid is 5 luma from the sky; sand is terracotta; black speckle corruption |
| `interior` | 4 | **3** | −1 | A torch-lit tomb that is 86.7% cool, 1.6% warm, with no torch |

---

## The headline: the daylight palette inverted, and it is the most expensive thing in this pass

Pass 2's complaint was "monochrome-warm" and a magenta shadow hue. The correction overshot and
did not stop at shadows. Measured as the fraction of frame pixels that are red-dominant
(R−B > 12) versus blue-dominant (B−R > 12):

| shot | warm% p2 → p3 | cool% p2 → p3 | mean luma p2 → p3 | mean sat p2 → p3 |
|---|---|---|---|---|
| `hero` | 88.7 → **21.1** | 1.9 → **62.5** | 121.6 → 86.7 | .423 → .331 |
| `temple` | 84.6 → **13.5** | 7.2 → **64.3** | 96.3 → 85.9 | .483 → .294 |
| `sly-closeup` | 80.1 → **19.6** | 6.9 → **71.9** | 98.3 → 75.5 | .419 → .407 |
| `courtyard` | 62.3 → **33.4** | 21.7 → **47.9** | 128.3 → 118.4 | .361 → .308 |
| `dunes` | 85.5 → 73.8 | 3.6 → 8.2 | 134.4 → 124.6 | .369 → .354 |
| `interior` | 88.4 → **1.6** | 1.5 → **86.7** | 93.7 → 67.6 | .427 → .354 |

Five of six flipped polarity. The set got **19 luma darker on average** and lost saturation in
four of six. `temple` lost 39% of its saturation.

This is not "shadows are cool now". The *lit* geometry is blue-dominant. In `hero` the entire
foreground ledge — the largest object in frame, x 0–830 — scans as
`#5b5c77 #595b7a #5e5b7c #5f5d7c #575a7b #3c3d69 #45416f #3a3a69 #40406c` along y=350. Sandstone
mid is specified `#c9915a`, where R−B = **+111**. On that ledge R−B is typically **−45**. The
sign is inverted. The tall pylon at x 250–370 is `#3a3a67` — navy, not stone.

**Egypt at 22° golden hour cannot be a blue game with warm accents. It has to be a gold game with
violet shadows, and right now it is the first one.**

## What is actually causing it — measured, not guessed

It is *not* the key light colour: in `dunes` the same sun lands on terrain as `#9f573f`
(rb 2.53, correctly warm) while the architecture in the same frame lands at `#715f6c` (rb 1.05).
Same light, different result — so the defect is in how the stone material resolves, and in how
much of each frame is in the shadow term at all.

The second half of it is worse than the hue, and it is the reason the frames also read *flat*.
Lit versus shadow face **on the same object**:

| same object, two faces | sun-facing | shadow-facing | shadow / lit |
|---|---|---|---|
| `courtyard` obelisk | L142.2 (`#d67f55`) | L82.9 (`#5e4d69`) | 58% |
| `courtyard` plinth | L61.7 (`#60352f`, rb 2.05) | **L74.3** (`#4e466b`, rb 0.73) | **120%** |
| `temple` column | L80.9 (`#544d70`) | L80.8 (`#574d65`) | **100%** |

On the `courtyard` plinth the sun-facing face is **12.6 luma darker** than its own shadow side —
the hue says "lit" and the value says "shadow". On the `temple` column the two sides of a
cylinder under a raking sun differ by **0.1 luma**: there is no terminator at all, banded or
otherwise. The obelisk is the only object I measured in the whole set where the ramp does real
work. §2.2 puts shadow at ~14% of key luminance; where it resolves at all it is at 58–120%.

---

## Highlights are gone, so nothing blooms and nothing is the hero read

Fraction of each frame above L230, which is what a bloom threshold needs to catch:

| shot | >L200 | >L230 | max L | "warm+bright+saturated" px |
|---|---|---|---|---|
| `hero` | 0.02% | **0.000%** | 214 | 29.7% → **3.3%** |
| `temple` | 0.01% | **0.000%** | 214 | 5.4% → **0.45%** |
| `sly-closeup` | 0.15% | 0.054% | 238 | 2.4% → 8.9% |
| `courtyard` | 0.09% | **0.000%** | 225 | 18.2% → 11.2% |
| `dunes` | 0.01% | **0.000%** | 219 | 32.9% → 15.8% |
| `interior` | 0.00% | **0.000%** | **183** | 5.1% → **0.00%** |

`sly-closeup` is the only frame in the set with anything above L230, and that is the cane crook
and one eye. Everywhere else there is **no bloom source at all**, which is why §2.3's "one hero
read — a single brightest thing, usually gold" fails six times out of six. In `hero` and `temple`
the brightest large object in frame is *empty sky* (L159 and L170). In `interior` nothing exceeds
L183 and 99% of the frame is below L112.

---

## What genuinely landed since 4.2 — credited, briefly

- **Ink lines are correct.** Darkest decile measures `#171223` / `#1b131c` / `#191322` — dark
  violet-brown, on spec per §2.1.2, and **pure `#000000` occupies 0.0000% of every frame in the
  set**. §7.3's outline condition passes six for six. This is done; stop touching it.
- **Volumetric light shafts exist.** `temple` has clean directional shafts with visible dust
  motes in them. First time in three passes. §7.3's volumetrics condition passes on `temple`.
- **Texture tiling is fixed.** On `temple`'s rear wall, mean |ΔL| at horizontal periods 32/48/64/
  96/128 px is 32.3/37.6/45.2/56.5/63.7 — monotonically rising with no repeat peak. The
  three-metre glyph repeating nine times per wall is gone. Do not re-open this.
- **Gold is metal.** The `sly-closeup` cane crook has p50 L77 against p95 L173 — a 96-luma
  specular range on a small object, which is metal behaviour. It is the only convincing metal in
  the set and its mean is still a tarnished `#64504f` rather than `#e8b942`.
- **`courtyard` has a character in it.** Confirmed at (455–500, 395–465), `#595b6f` L91.8 against
  a `#9a7d68` L129.3 surround. He is present and value-separated. He is not yet *read* — see below.

---

## Shot by shot

### `hero` — 5 → **3**

§7.3 conditions failed, quoted:

- *"No rim light separating silhouettes from the background"* — Sly's body measures `#2f314a`
  (L50.8); the wall immediately to his right measures `#31334d` (L52.3). **Δluma 1.5, ΔRGB
  (2,2,3).** He is separated from the background by his ink hull and nothing else. This is the
  worst single measurement in the pass.
- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"* — the big ledge face carries
  49 distinct L/4 levels over 15,000 px with the modal level at only 7.4%. That is a continuous
  gradient. The pylon is the opposite failure: 90% of its pixels sit inside a 12-luma window.
- *"Any surface reads as flat vertex colour with no texture detail"* — the pylon, per above.
- *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"* — the
  foreground ledge is a row of rectangular prisms with a chamfer. Nothing leans, tapers or sags.
- *"Empty sky, or background not atmospherically hazed"* — sky at y=25 is `#a09ca3`/`#9b97a0`,
  **saturation 0.06**. Grey. No cloud, no bird, no dust, and no pyramid, which §7.2 names as the
  defining content of this shot ("Sly on a temple ledge, sun raking, **pyramid behind**").
- *"No single hero focal read"* — brightest large area is the sky haze at L159.
- *"Gold doesn't read as metal"* — there is no gold in the frame to read.
- *"Placed blind next to Mario Odyssey / Sly 4, an art director picks the other one"*.

**Blind comparison — vs Super Mario Odyssey, Sand Kingdom, the approach to Tostarena from the
south with the inverted pyramid on the horizon.** Working from memory of that game, not a
downloaded frame. **Odyssey wins, and it is not close.** Odyssey's Tostarena reads instantly as
hot stone under a low sun: the sunlit faces are a high-value saturated ochre, the shadow faces
drop to a deep violet at a *fraction* of the lit value, and the sky is a real gradient with cloud
banks and the pyramid silhouette anchoring the horizon. Ours has the violet but not the ochre —
62.5% of the frame is blue-dominant and there is no gold anywhere — and where Odyssey puts a
readable landmark on the skyline we put a `#a09ca3` grey void. The tell that would decide it in
one second for any art director: in Odyssey you can find Mario in the frame instantly because the
environment is warm and he is red-and-blue; in ours Sly is 1.5 luma from the wall behind him.

**Highest-leverage fix:** get the key light onto the stone and get the stone back to `#c9915a`
family on lit faces. Everything else in this shot is downstream of that.

### `temple` — 4 → **4**

- *"Diffuse ramp reads as smooth/realistic instead of banded-cel"* — the left column's lit face
  is `#544d70` L80.9 and its shadow face is `#574d65` L80.8. **0.1 luma apart.** 82% of the
  column's pixels sit inside L72–L88. A cylinder under a raking sun with no terminator.
- *"Any surface reads as flat vertex colour with no texture detail"* — same measurement; the
  columns are an untextured lilac wash.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — worse than
  painted-on. The rear wall in the 2× crop is covered in fine horizontal panel lines and small
  rectangular greebles. There is not one recognisable Egyptian glyph on it; it reads as a
  spaceship bulkhead.
- *"No rim light separating silhouettes from the background"* — the character is `#2a2e49` L47.0
  on a floor measuring `#302839` L42.8. **Δ4.2 luma.**
- *"No single hero focal read"* — brightest object is the doorway sky at L170, `#ada8b3`,
  saturation 0.082.
- *"Bloom is a grey wash instead of a tight coloured halo on bright things"* — the shaft cores
  measure `#9a847e`, saturation 0.204. A god ray carrying a `#ffd9a0` key should be a warm cream;
  these are grey-brown.
- *"Placed blind next to …, an art director picks the other one"*.

Passes, notably: volumetrics, particulate, tiling, outlines.

**Blind comparison — vs Zelda: Tears of the Kingdom, a Sky Island shrine interior with the
shafts coming through the ceiling apertures.** From memory. **TotK wins.** Its shafts are the
same idea and roughly the same quality as ours — this is the one place we are competitive. It
wins on everything the shafts land on: TotK's shrine stone has a clear lit/shadow split that
models the curvature of every column, a visible material grain, and inlay that is *emissive* so
the room has a hero read. Ours has a 0.1-luma terminator, so our columns are flat lilac
cylinders, and our brightest thing is the doorway.

**Highest-leverage fix:** the column terminator. Shafts this good are being wasted on geometry
that has no form.

### `sly-closeup` — 4 → **4**

- *"Pose is A-pose/T-pose/stiff instead of a confident line-of-action"* — he is standing
  symmetric: both arms out, both legs vertical and parallel, hips level, shoulders level, weight
  evenly distributed. This is the textbook instance of the condition.
- *"Silhouette not instantly readable as Sly (cap, mask, tail, cane)"* — cap, tail and cane read.
  **The bandit mask is absent.** The region around and between the eyes measures `#535966`, the
  same family as the rest of the head; there is no dark domino shape. The mask is Sly's single
  most identifiable feature after the cap.
- *"Fur reads as smooth plastic"* — the tail has a spiky black fringe at its silhouette but its
  interior is smooth flat blue/white bands with no strand texture.
- *"Any surface reads as flat vertex colour with no texture detail"* — the wall behind him
  carries 22 L/4 levels over 60,000 px with **81% inside L64–L80**, a 16-luma wash.
- *"No rim light separating silhouettes from the background"*.
- *"Placed blind next to …, an art director picks the other one"*.

Two defects not on the checklist but worth more than several that are:

1. **The eyes do not read as a pair.** Left eye `#b7b4a9` L179.5 with p95 236; right eye
   `#506086` L95.5. **84 luma apart.** The left one is picking up a hard specular and reads as
   polished chrome or a sunglass lens, not an eye. At 2× he reads as an angry raptor.
2. **The tail still roots at the shoulder blade**, ~110 px above the gold belt line, and projects
   horizontally. Pass 2 called this out explicitly ("move the tail from the shoulder to the base
   of the spine") and it has not moved.

Proportions **pass** — measured off the pixels he is ~3.5 heads including the cap (cap top y≈118,
jaw y≈268, boot sole y≈645), which is comfortably inside cartoon territory. Note this does not
match the 4.88-heads rig figure; the pixel read is the one that matters for §7.3 and it is fine.

**Blind comparison — vs Sly Cooper: Thieves in Time, any Sly close-up in the Ancient Egypt
episode.** From memory. **Thieves in Time wins.** Its Sly is defined by three things we do not
have: the black bandit mask that turns the top half of his face into one graphic shape, an
asymmetric weight-shifted contrapposto with the cane taking load, and fur that breaks the
silhouette everywhere rather than only on the tail. Ours has the cap, the cane and the tail, and
then puts them on a symmetric A-posed figure with a bare face and one chrome eye.

**Highest-leverage fix:** the bandit mask. It is a dark shape over the eyes and it converts him
from "a raccoon-ish biped" to "Sly" in one change.

### `courtyard` — 5 → **4**

- *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"* — the
  obelisk shaft is roughly **330 px wide × 400 px tall, about 1.2:1**, with a small pyramidion on
  top. A real obelisk is 9–10:1 and §2.1.4 asks for *more* exaggeration than real, not less. It
  reads as a shipping container wearing a party hat. Pass 2 asked for 8:1; it has not moved.
- *"No normal-map relief on stone; carvings look painted-on rather than chiselled"* — at 2× the
  glyphs are flat orange marks scattered at random over the blue faces, with no bevel, no
  highlight/shadow pair, and no register ruling. Many are clipped part-shapes. The dominant read
  is **orange primer showing through chipped paint on a blue steel container**, not carving.
- *"Visible texture tiling repetition"* — passes.
- *"No volumetric light shafts anywhere they'd be motivated"* — §2.3 requires shafts through at
  least one opening in every interior **or courtyard**. There are none here.
- *"No single hero focal read"* — the eye goes to the 330-px orange obelisk face, not to the
  character.
- *"Placed blind next to …, an art director picks the other one"*.

The shading here is the strongest in the set — the obelisk terminator is a real 56.6-luma break
(`#d67f55` L142.2 lit, `#5f506c` L85.5 shadow). But each face is a **single flat value**: 73% of
the lit face inside L140–L164, 62% of the shadow face inside L72–L88. That is **2 bands, not the
3 that §2.1.1 requires**, and with no mid-tone every object in frame gets the identical
orange/periwinkle pair. The frame reads as a cel-shade filter applied uniformly rather than as
lighting.

The sky is unfixed from pass 2: white filaments swirling in desaturated blue (`#96a1b4`,
saturation 0.188). It is paper marbling, not cloud.

**Blind comparison — vs Super Mario Odyssey, the Tostarena town square with the obelisk-like
stone markers and the inverted pyramid beyond.** From memory. **Odyssey wins.** Its props have
silhouette hierarchy — tall thin things read as tall and thin, and the town square has one clear
gold-lit focal object with everything else subordinate. Ours gives the obelisk, the plinth, the
walls and the background terraces the same two colours at the same saturation, so nothing is
subordinate to anything and the composition has no centre. Odyssey's clouds are soft-edged masses
at two scales; ours are filaments.

**Highest-leverage fix:** take the obelisk to at least 8:1. It is the shot's title object and its
proportion is the reason the frame reads as an industrial yard.

### `dunes` — 5 → **3**

- *"Empty sky, or background not atmospherically hazed"* — the pyramid body measures `#c1a389`
  L163 against a sky of `#b0a5ac` L168 immediately above its edge. **Δ5 luma.** It is separated
  from the sky only by its ink outline, so it reads as a flat paper cut-out rather than a hazed
  mass. Sky top is `#9c97a4`, **saturation 0.109** — grey, against §2.2's `#3f7fc4` zenith.
- *"Any surface reads as flat vertex colour with no texture detail"* — the foreground dune is a
  smooth brown gradient with horizontal streaking and no grain or ripple; the shadow wedge at
  left (x 0–460) is a hard-edged flat violet shape that reads as torn paper laid on the sand.
- *"Silhouette not instantly readable as Sly"* — at 2× he is a solid blue lump with a featureless
  domed head, a horizontal sausage tail and a straight blue bar for a cane. He reads as **a
  soldier in a Brodie helmet holding a rifle**.
- *"Geometry silhouettes are straight/symmetric everywhere"* — the vertical poles are
  constant-width tubes at assorted angles; the mid-ground reads as scaffolding.
- *"No single hero focal read"*.
- *"Placed blind next to …, an art director picks the other one"*.

The sand hue is a regression in a different direction from pass 2. It measures `#a45a41`
(saturation 0.603, L104) — a **terracotta brick**, not sand. §2.2's sand GI bounce is `#e8a852`
and sandstone light is `#e6b878`; both are far brighter and far less red. Pass 2 reported the
dunes reading as "dirty snow"; they now read as a ploughed clay field.

**New in this pass and clearly a bug, not a style choice:** a dense cluster of black speckles at
approximately (650–770, 235–285), visible unmistakably in the 2× crop. It reads as a swarm of
flies or as dead pixels. There are smaller instances near (150–300, 320–350) and (1050–1120,
470–500). This is aliasing on thin geometry and it looks like image corruption.

**Blind comparison — vs Zelda: Breath of the Wild, the Gerudo Desert approach to Gerudo Town in
late afternoon.** From memory. **BotW wins.** Its desert reads as sand because of two things we
do not do: the dunes carry a fine directional ripple that catches the raking light so the surface
has grain at every distance, and the far mesas sit in genuine aerial perspective — they lose
contrast and shift toward the sky colour with distance, so depth is unambiguous. Ours has a
brown gradient with no grain, and a pyramid that is 5 luma from the sky yet drawn with a full
black contour, which is the exact opposite of aerial perspective: maximum edge contrast, minimum
tonal contrast.

**Highest-leverage fix:** put the sand back to the `#e6b878`/`#e8a852` family and give the
pyramids a real haze-vs-value separation from the sky instead of an ink line.

### `interior` — 4 → **3**

- *"No volumetric light shafts anywhere they'd be motivated"* — §2.3 requires them in every
  interior. `temple` has them; this room has none.
- *"No single hero focal read"* — **nothing in this frame exceeds L183**, and 99% of it is below
  L112. There is no light source visible anywhere in a shot whose stated §7.2 purpose is
  "Lighting: torch-lit tomb, warm/cool tension, volumetrics".
- *"Any surface reads as flat vertex colour with no texture detail"* — the walls carry a uniform
  violet speckle at constant density that reads as terrazzo or a granite worktop; the floor is
  giant flat pentagonal tiles ~250 px across with bright cyan-white joints, which reads as a
  swimming pool.
- *"Gold doesn't read as metal"* — the treasure pile at (790–940, 400–470) is a scatter of small
  dark grey shapes with **zero** warm-bright-saturated pixels in the whole frame. In a tomb this
  is where the gold hero read should live.
- *"No rim light separating silhouettes from the background"* — character `#33395a` L58.4 against
  a floor of `#494968` L75.5; he is *darker* than his surround, not rim-separated from it.
- *"Pose is A-pose/T-pose/stiff instead of a confident line-of-action"* — he is pitched forward
  ~45° with his muzzle down-left and one arm hanging; at 2× it reads as a dog begging. It is not
  a stiff pose so much as an unresolved one.
- *"Placed blind next to …, an art director picks the other one"*.

**The warm/cool tension is not merely weak, it is inverted: 86.7% cool against 1.6% warm.** In
pass 2 this same shot was 88.4% warm. An entire torch-lit tomb now has one and a half percent of
warm pixels and the brightest thing in it is L183. Putting an actual torch in this room was pass
2's nominated highest-leverage fix for this shot and pass 1's before that. Three passes.

The hieroglyph panel at (615–925, 85–235) is **the best single asset in the whole set** —
recognisable glyphs (a bird, an ankh, cartouches) laid out in ruled registers, which is exactly
what the walls in `temple` and `courtyard` should have and do not. It is flat and unchiselled,
but the drawing is right. Whoever made it should make the rest of them.

**Blind comparison — vs Zelda: Tears of the Kingdom, a Depths chamber lit by a single lit
Brightbloom seed.** From memory. **TotK wins overwhelmingly.** The entire point of that
comparison is one warm source in a cold volume: the light has a visible origin, a falloff you can
read across the floor, and it throws the surrounding stone into genuine warm/cool opposition
within a few metres. Ours has the cold volume and no source — the room is lit by a uniform violet
ambient with no origin, so there is nothing for the eye to travel to and no depth cue at all.

**Highest-leverage fix:** one warm point light with visible falloff and a flame billboard. This
shot is a single light away from being the best in the set, because the room's geometry, the
sarcophagus and the glyph panel are all already there.

---

*(continued — `night`, `traversal`, `combat`, `guard`, budget table, ranked fix list and overall
mean are appended below once the second capture completes.)*
