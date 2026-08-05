# CRITIC-sbs1 — the first §7.4 blind side-by-side with real reference frames

**Date:** 2026-08-05. **Critic:** adversarial visual review per `tools/CRITIC.md`; no `src/**` touched.
**Method:** per AGENTS.md §7.4 — real comparand frames fetched to the scratchpad, both frames scaled
to equal height (560 px), ours in randomised left/right position (`compose_sbs.py`, SystemRandom,
mapping withheld in `sbs/mapping.json`), each pair viewed and verdict recorded per SIDE before the
mapping was read. Honesty note: the blinding is procedural — our ink style is identifiable on sight,
so this protects against filename-priming, not against recognising our own render. All measurements
below were made on the full-resolution frames after the viewing, with stated rects.

**Capture-lock note:** the capture lock is held by an FX run; NO new frames were captured. Every
judged frame is from 2026-08-01 (3–4 days stale), and the ten frames span five different trees
across that day (16:26 → 21:38), so cross-shot consistency caveats apply. Nothing newer exists on
disk; root-level `shots/*.png` are 960×540 med-quality frames from Jul 31 and were not judged.

---

## 1. Provenance — what was judged against what

| shot | our file (all 1280×720, 2026-08-01) | captured | tree | reference frame | source |
|---|---|---|---|---|---|
| hero | `shots/char10/hero.png` | 21:19 | 4b58fee+dirty | SMO Sand Kingdom vista (Tostarena, day, v1.0.0 stage capture) | [R1] `high/SandWorldHomeStage.jpg` |
| temple | `shots/fx7/temple.full.png` | 19:35 | no sha stamp in fx7.json | Sly 2 Cairo Museum hall (PCSX2) | [R2] `Unstretched HUD.jpg` |
| sly-closeup | `shots/eye1/sly-closeup.png` | 20:31 | 6f1d1f4+dirty | Sly 4: Thieves in Time gameplay still (600×600, ~2.4× upscaled in pair) | [R3] |
| courtyard | `shots/rim1/courtyard-base.png` | 16:26 | rim1 base arm | SMO Tostarena town, day scenario | [R1] `SandWorldHomeStage_1.jpg` |
| dunes | `shots/fx7/dunes.full.png` | 19:52 | fx7 full arm | SMO Sand Kingdom open dunes | [R1] `SandWorldHomeStage_4.jpg` |
| interior | `shots/int1/interior-base.png` | 21:26 | d526dd8 clean | SMO Inverted Pyramid interior (torch-lit) | [R1] `SandWorldPyramid001Stage.jpg` |
| night | `shots/wedge1/night-fix.png` | 21:34 | current knobs (colNight bfe6ff, beamNight 0.55) | SMO Tostarena night (moonlit) | [R1] `SandWorldHomeStage_2.jpg` |
| traversal | `shots/fx5/traversal.full.png` | 18:19 | fx5 full arm | Sly 3 Venice rooftop run (PCSX2) | [R2] `Unstretched HUD sly 3.jpg` |
| combat | `shots/char10/combat.png` | 21:22 | 4b58fee+dirty | Sly 4: Thieves in Time gameplay still | [R3] |
| guard | `shots/wedge1/guard-fix.png` | 21:38 | staged guard, tod 0.89/light 0.26 | Sly 2 bear guard, Nunavut night (PCSX2) | [R2] `Bear guards.jpg` |

Sources (fetched via the agent proxy; images live in the scratchpad only, never committed):
- **[R1]** `https://github.com/Amethyst-szs/smo-thumbnail-database` — real Super Mario Odyssey v1.0.0
  stage captures at 1280×720 (exactly our resolution), files under `high/`, fetched raw from
  `https://raw.githubusercontent.com/Amethyst-szs/smo-thumbnail-database/main/high/<file>`.
- **[R2]** `https://github.com/zzamizz/weed-sheet` — real Sly 2/3 PCSX2 captures under
  `Media/Screenshots/` (631–1151 px wide).
- **[R3]** `https://raw.githubusercontent.com/OldMcGroin/thegamingemporium/main/static/Images/Games/sly-cooper-thieves-in-time-pc-patched.webp`
  — a real Thieves in Time gameplay still, 600×600.
- Also fetched, inspected, not composited: BotW Gerudo Desert 1920×1080
  (`https://raw.githubusercontent.com/LenNerd42/lennerd42.github.io/main/assets/img/posts/deserts-in-gaming-kinda-suck/botw-gerudo-desert.jpg`)
  — night frame with HUD; the SMO dunes frame was the better staging match for `dunes`.
- **Coverage gap, stated:** TotK, Bowser's Fury and Sly-4-HD-quality closeups could not be obtained.
  The egress policy CONNECT-403s every host except GitHub (tested and blocked: wikimedia/wikipedia,
  fandom/wikia, archive.org, mobygames, IGDB, rawg, steamstatic, ignimgs, ytimg, user-images.
  githubusercontent.com). All comparands are therefore committed files in public GitHub repos.
  Future critics: `git clone --filter=blob:none --no-checkout` + `git ls-tree` is the search tool
  that works.

Comparand caveats owned up front: [R2] are fan PCSX2 captures of 2004/2005 PS2 games (beating them
is the floor, not the bar); [R3] is 600 px and upscaled ~2.4× in its pair (softening favours US in
any texture-detail read); [R1] are editor-staged stage-file captures but real Odyssey rendering at
full lighting except `HomeTownZone`/`Sphinx` (broken/unusable — not used).

---

## 2. Verdict table

| shot | an art director picks | margin |
|---|---|---|
| hero | **THEIRS** (Odyssey) | decisive |
| temple | **OURS** (vs Sly 2 Cairo Museum) | clear — but the comparand is a 2004 PS2 game |
| sly-closeup | **THEIRS** (Thieves in Time, despite 2.4× upscale) | decisive |
| courtyard | **THEIRS** (Odyssey) | decisive |
| dunes | **THEIRS** (Odyssey) | decisive |
| interior | **THEIRS** (Odyssey) | narrow — their frame is dull; ours is purple |
| night | **THEIRS** (Odyssey) | decisive |
| traversal | **THEIRS** (Sly 3) | narrow split — environment ours, action read theirs |
| combat | **THEIRS** (Thieves in Time) | decisive |
| guard | **THEIRS** (Sly 2) | decisive |

**1 win, 9 losses (2 narrow). §7.3's last checkbox fails on 9 of 10 shots, now measured against
the actual pixels it names.**

---

## 3. Per-shot: named quantities with owners

Luma = Rec.709, 0–255. Hue in HSV degrees. Rects are (x0,y0,x1,y1) on the full-res frame.
Bible targets: sandstone light `#e6b878` = hue 33°/L≈186; mid `#c9915a` = hue 30°/L≈155.

### hero — LOSS (Odyssey Tostarena)
- **Sunlit stone renders violet.** The architrave beam Sly perches on (rect 300,330,750,430):
  median hue **279°** (violet), sat 0.447, medL **36**; 84.2% of its pixels sit in hue 230–330°.
  The only warm stone in the shot is dark rust flanks (rect 280,380,380,450: hue 20°, but L **42**).
  The bible's lit sandstone (hue ~33° at L~186) appears **nowhere on the hero geometry** — lit faces
  are violet, warm faces are dark. Odyssey's frame holds its warm mass in the lit register. → **SHADING**
  (grade; TEXTURES' §130.5 finding already shows gilded albedo is warm and the frame is cool — this
  is the frame-side confirmation on plain stone).
- **Shadow and ink have merged into one black band.** 49.2% of the architecture rect (200,300,900,600)
  is below L40; the Odyssey architecture rect holds **0.1%** below L40. §2.1 "shadows are transparent"
  fails: there is no detail to read inside our darks because ink lines and shadow stone occupy the
  same value. → **SHADING** (shadow floor).
- **The star does not separate.** Sly figure (560,170,690,310) medL **81.6** vs immediate backdrop
  medL **73.4** — 8 luma levels, no rim visible at this scale (§131.6 confirmed in pair view: cap and
  cane read, body merges). → **COORDINATOR** (the open §151.4 question: should `hero` carry Sly at
  ~100 px at all) + **SHADING** (rim strength at distance).
- **No background landmark.** §8.1 places the Great Pyramid at (−150,·,−190); nothing distinguishable
  exists in the hero sky (candidate region vs adjacent sky: ΔmedL **0.5**). Odyssey's floating
  pyramid separates from its sky by ΔmedL **18.5** and is the frame's hero read. Ours has no single
  brightest thing — §2.3 "one hero read" fails. → **COORDINATOR** (framing) + **GEOMETRY** (is the
  pyramid occluded by the gate at this camera, or missing?).
- Where we win: per-pixel material detail (chisel, AO, rust variation) exceeds Odyssey's flat dunes
  everywhere it is visible. The failing is value/hue organisation, not authoring effort.

### temple — WIN (vs Sly 2 Cairo Museum), the honest version
- The shafts carry the frame: scanline y=220 (x 250–700) lifts **123 luma levels** from off-shaft to
  in-shaft; the shafts are motivated (clerestory), angled consistently, and the doorway view with
  hazed obelisk gives real depth. The Sly 2 comparand's window glow is softer but its geometry and
  floor are flat. Ours reads as the more expensive frame. (A shaft-edge width metric was attempted
  and dropped — the scanline crosses several shafts and would not isolate one edge; not quoted.)
- **The win does not survive a hue inspection:** lit column faces (80,260,200,420) median hue
  **287°**, mean R−B **−1.2** — our limestone is violet-neutral where the comparand's hall is warm
  (mean R−B **+15.8**). Against a TotK-class comparand (unobtainable, see §1) this shot would fight
  with one hand tied. → **SHADING** (same grade item as hero).
- Verdict stands as OURS, with the caveat in the table: the comparand is 2004.

### sly-closeup — LOSS (Thieves in Time)
- **The eyes are not Sly's eyes.** Amber-iris pixels (hue 25–50°, sat 0.3–0.65, L 110–210) cover
  **1,864 px** inside the 210-px-wide head box (520,100,730,270); the longest single-eye run is
  **35 px** of continuous amber (full disc with rim ≈ 50 px) on a ≈140 px cheek-to-cheek face —
  eye:face ≈ **0.25–0.37** depending on basis. The TiT comparand at equal height shows **no
  resolvable iris at all** — the face reads via the black mask band and muzzle. Canon eye:face is
  ≈0.10–0.15 (small dark iris inside the mask). Ours reads as goggles/owl-eyes and it is the single
  biggest reason the pair fails. → **CHARACTER** (eye geometry/albedo; the startle-pupil mechanism in
  `SPEC-startle-pupils.md` is orthogonal — this is rest-state size and iris value).
- **The mask does not read as a mask** — at pair scale the dark band survives only as brow-line ink
  above the amber discs; TiT's mask is the darkest coherent shape on the head. Related to eye size:
  the discs consume the mask's area. → **CHARACTER**.
- **The cream ladder is rendering at its bluest edge.** Tail light bands (630,290,780,410): median
  hue **231°**, mean R−B **−34.2** — exactly at the extreme edge of TEXTURES' registered cream band
  (b−r ∈ [−34, −6]). Legs (560,350,650,520): hue 253°, R−B −15.4, medL 53. Per `NOTE-tailpalette.md`
  cream+navy is authored intent and "teal bands in any frame remain a grade finding, SHADING's Band A"
  — this frame is that finding, measured: the authored warm accent renders cold. In the pair, our
  tail reads blue-white windsock vs TiT's grey-and-black rings. → **SHADING** (Band A grade), not
  CHARACTER (albedo settled; reopen only if a post-grade-fix capture still reads blue).
- Muzzle/chest chip population reads as dirt flecks at this framing (known: §141/§151 chip finding,
  bias verdict pending). → **CHARACTER** (open item, not new).
- Where we win: cane authoring (gold hook, wood shaft texture) is better than the comparand's; pose
  contrapposto is fine (§151 pose numbers stand); resolution/AO/floor detail all ours.

### courtyard — LOSS (Odyssey)
- **The sky is broken and it is the first thing anyone sees.** Sky rect (620,10,1200,110): luma sd
  **16.1**, high-frequency gradient energy **7.76** per px step vs the Odyssey day sky's **1.33** —
  a 5.8× noise excess in marbled ~15–25 px cells, uniform from zenith to horizon, with no cloud
  shapes and no scale gradient. It reads as a texture error, not weather. → **SKY** (`src/render/Sky.js`,
  SHADING's render bucket).
- **The named subject is not in the frame.** §7.2: "obelisk, statues, braziers, palms". The camera
  sits at architrave height looking across slab tops; none of the four named contents is readable;
  no hero read exists. The best surface in frame (hieroglyph slab, centre) is wasted on a frame with
  no subject. → **COORDINATOR** (shot definition).
- Foreground slab (bottom-left quarter): near-black, textureless at this exposure — a quarter of the
  frame carrying zero information vs Odyssey's foreground umbrella/props. → framing (**COORDINATOR**)
  before it is a TEXTURES item.

### dunes — LOSS (Odyssey)
- **Sky noise again, and it sits on the pyramid too.** Marbled zone (100,10,280,120): hf **5.28**
  (full sky band 6.82) vs Odyssey sky **0.38** — 14–18×. The marbling overlays the pyramid's stepped
  silhouette region, so the one background landmark we have fights its own sky texture. → **SKY**.
- **Planes do not separate.** Pyramid face vs adjacent sky: ΔmedL **9.5** (marble 162.6 / smooth
  151.2). Odyssey's background dune vs its sky: ΔmedL **21.4**. §2.3 wants ≥60% atmospheric blend at
  the background — ours is so blended it stops existing. → **FX** (`Atmosphere.js`) — haze curve
  shape, not amount.
- **Outline density turns the complex into wireframe at 200 m.** Dark-line share (L<60) in the
  temple-complex rect (300,140,900,420): **6.1%**; the equivalent Odyssey towers rect: **0.0%**.
  §2.1 specifies ~2.5 px lines on screen; at this distance our ink should thin toward zero and does
  not. → **SHADING** (`Outline.js` distance falloff; the post-process edge pass at distance).
- Where we win: Sly kneeling on the ridge with cane is a real staging beat the comparand lacks
  (Odyssey's frame has a stray moon-cube prop discounted per method); foreground grass silhouettes
  are good.

### interior — LOSS (Odyssey), narrow
- **A torch-lit tomb that renders lavender.** Left wall (60,80,320,400) hue **267°**/sat 0.455;
  right wall (1050,100,1250,500) hue **268°**/sat 0.452 — both walls violet at identical saturation.
  Warm-pixel share (R>B+10, L>40) frame-wide: **16.2%** vs the comparand's **31.0%**. The warm/cool
  tension §7.2 names is absent: it is cool/cool. → **SHADING** (grade) + **FX** (`Lighting.js` torch
  radius/energy — the flames exist but their light dies within ~2 m of each sconce).
- **Detached bloom smears.** Warm-bright shapes up to **156 px wide** float across the ceiling band
  (11.3% coverage of rect 500,0,1280,200), unanchored to any flame — they read as lens dirt, §7.3's
  "bloom is a grey wash" in warm form. → **FX** (mote/glow sprite scale) with a **POSTFX** note
  (bloom threshold).
- Where we win: composition (three depth planes, doorframes, sneak pose with tail line) is better
  than the comparand's flat wall; floor chamfer + tile read is genuinely good. This is the shot a
  grade fix alone could flip.

### night — LOSS (Odyssey)
- **Warm accents: 0.14% of our frame vs 2.45% of theirs** (pixels R>B+15 at L>60) — 17.5× less.
  Odyssey pairs its blue night with dozens of lit windows; we have one ember. §7.2 names "palette
  flip" — a flip needs both poles. → **GEOMETRY** (staged braziers/lit windows in the night set) +
  **FX** (`Lighting.js` night locals).
- **Sky: marbled noise at night reads as water.** hf **7.51** vs ref night sky **0.36** — 21×.
  The moon+glow (top-left) is the frame's one good element and it is half-cropped. → **SKY**;
  moon placement → **COORDINATOR**.
- **The protagonist is darker than his own backdrop.** Sly (675,385,770,465) medL **18.5** vs
  surrounding slabs medL **28.1** — negative contrast; **12 warm pixels** on him; zero blue-sparkle
  pixels in frame (see traversal). At pair scale I could locate him only by the tail stripes.
  → **SHADING** (night rim — but see PREREG-pnight's registered caution; this is a staging-first
  finding) + **COORDINATOR** (staging: put him against the moon pool, not the dark slab).

### traversal — LOSS (Sly 3), narrow split
- **The swing pose has no arc.** Sly mid-swing (540,230,650,380) reads as a vertical bundle —
  limbs inside a ~40 px column, tail horizontal, no leading line; the Sly 3 comparand's mid-run pose
  reads limb-by-limb at half our resolution. Figure/surround contrast: medL **76.4 vs 66.5** — 10
  levels. → **ANIMATION** (`hook_swing` needs a line-of-action keyed through hips→hand, sagittal
  measure per §151's plane rule).
- **The sparkle language is absent at the exact place it is grammar.** Pixels within tolerance of
  `#8fd8ff` (±40/±35/±40 RGB) across the whole frame: **0**. §2.1 item 6 makes the blue diamond
  sparkle mandatory on hook points; this is the hook shot. → **FX**.
- Where we win, clearly: the sunlit doorway light pool with columns is the best single passage of
  rendering in the ten frames — warm/cool works, materials read, and it beats anything in the Sly 3
  frame. The environment side of this pair is OURS; the action side is theirs.

### combat — LOSS (Thieves in Time)
- **The impact flash erases the character.** Inside the figure rect (360,390,720,670), the
  desaturated-bright figure mass is 27,382 px at medL **199.7**, medSat **0.165**; Sly retains
  **21 blue pixels** — 0.1% of his own figure. The TiT comparand's Sly: medL **51.2**, medSat
  **0.49**. Our hit-frame Sly is a chalk outline of himself (§9's "blown" record, now measured
  against the game it imitates). → **SHADING** (flash/tonemap interaction) + **FX** (flash strength);
  the DIGEST already routes `combat`'s L160 tail as "measures the tonemap" — this is the same defect
  seen from the character side.
- **The combo hits nothing.** No enemy in frame; the arc terminates on air beside a wall. The
  comparand stages two characters and a readable target line. §7.2: "cane combo impact frame" —
  an impact needs a recipient. → **COORDINATOR** (staging) + **GUARDS** if a guard should be posed.
- The slash arc itself (soft white crescent + star) is monochrome; Sly's FX language is gold/blue.
  → **FX**.

### guard — LOSS (Sly 2)
- **The guard is an unlit hole.** Guard figure (852,220,990,700): medL **18.2**, **66.9%** of pixels
  below L30, speculars capped at p99 **83.6**. The 2004 bear comparand: medL **42.9**, 29.4% below
  L30 — fully modelled fur, face and claws reading in the same night palette. Our guard's design
  (jackal head, armour, feathers) is unrecoverable from the frame. This generalises TEXTURES'
  gild-void finding (guard gilded medL 17.2) to the entire character. → **COORDINATOR** first
  (staging: he stands on the dark side of his own doorway light) + **FX** (`Lighting.js` fill).
- **The patrol light cone — the shot's named subject — contributes zero readable pixels.** Air
  column between doorway and guard (700,300,850,500): medL **27.0**. The wedge1 probe records live
  beams (beam0 opacities 0.14–0.26, beamNight 0.55), so the cone exists and does not reach the
  frame. → **FX**.
- Framing: a near-black slab occludes the lower-right quarter of the frame including half the guard.
  → **COORDINATOR**.

---

## 4. The three highest-leverage gaps across the set

1. **The sky texture is one defect poisoning three shots (and grazing a fourth).** Marbled
   luma noise at hf 5.3–7.8 per px-step where every reference sky sits at 0.36–1.33 — up to **21×**
   — across `courtyard`, `dunes`, `night` (and dunes' pyramid wears it). No verdict on those three
   pairs can improve while the first glance lands on static. One fix in `src/render/Sky.js`
   (cloud/noise layer scale or its screen-space application) moves three canonical shots at once.
   Owner: **SKY (src/render)**.

2. **The grade renders authored warm as violet, everywhere.** Hero's sunlit beam at hue 279°/L36
   with bible-sandstone hue absent from the frame; temple's limestone at hue 287°; interior walls at
   267–268° with warm share half the comparand's; the tail's authored cream at R−B −34.2 (the edge
   of its own registered band); combat's Sly at medSat 0.165. Five shots, one direction of error:
   the warm half of every palette pair is missing at render time while the albedo (per §130.5,
   §136) is warm on disk. This is SHADING's Band A / AgX-shoulder cluster, and the side-by-side says
   it is the single difference an art director sees first in four pairs. Owner: **SHADING**, with
   the existing pre-registered legs — this report adds frame-vs-reference numbers, not a new lever.

3. **Sly's face fails the franchise read at close range.** 1,864 amber-iris pixels in a 210-px head
   box — eye:face ≈ 0.25–0.37 vs canon ≈ 0.10–0.15 — with the mask band consumed by the discs. The
   `sly-closeup` pair is unwinnable in this state regardless of shading: the comparand at 2.4×
   upscale still reads "Sly" faster than our native-res render. Owner: **CHARACTER** (rest-state eye
   size + iris value; distinct from the settled tail/cream item, which is SHADING's).

Runner-up, named because it is cheap: the **guard cone renders zero pixels** while its probe says it
is live — one FX visibility fix turns the `guard` shot from "unlit hole beside a door" into its
actual subject.

## 5. Files this review produced

- This report: `/home/user/Demo/progress/records/CRITIC-sbs1.md` (the only repo file written).
- Scratchpad (never committed, per §1.1 rule 3): `ref/` (11 reference images + provenance names),
  `sbs/` (10 composites + `mapping.json`), `compose_sbs.py`, `measure.py`, verification crops.
