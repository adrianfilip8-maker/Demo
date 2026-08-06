# CRITIC-sbs3 — the third §7.4 blind side-by-side, measured against round 2's baseline

**STATUS: COMPLETE — verdict: round 2's 5 wins / 5 losses holds at 5 wins / 5 losses, but the
margins moved on five of ten shots and the decisive-loss count halved from three to two. combat
went decisive → narrow (the round's biggest move); dunes and interior strengthened; traversal
weakened; guard is byte-identical to round 2 and provably unmoved. Written incrementally under
§163/§164 rollback discipline; §6 lists every file produced.**

**Date:** 2026-08-06. **Critic:** adversarial visual review per `tools/CRITIC.md`; no `src/**`
touched, no git run (the coordinator sweeps). **Baseline:** `CRITIC-sbs2.md` — 5 wins / 5 losses
(wins: temple, sly-closeup, dunes, interior, traversal; losses: hero, courtyard, night, combat,
guard). **Method:** identical to rounds 1 and 2 — the same pinned comparand routes re-fetched to
the scratchpad (never committed, §1.1 rule 3 / §162), both frames scaled to equal height,
ours in randomised left/right position (SystemRandom, mapping withheld in `sbs/mapping.json`
until the per-side verdicts were written), then rect-level measurement on the full-res frames.

**Our frames this round:** `progress/records/sbs3/*.png` — all ten canonical shots, 1280×720
quality=high, captured 2026-08-06 02:30–03:08 (report.json: commit 167c508+dirty). The tree
carries round 2's ships (eyesize 0.55, capYaw −10°, the gold-only prop hull, the sky cloud decks,
the §132.4 violet pair) **plus four new ones this round is measuring**:

- **banda2** — day shade-warmth restored (`subjWarmShade` 0.50→0.65, `shadowTintPeak` 0.52→0.62)
  with a night gate pinning night to the old value. Predicts movement on day shots' shadow
  warmth; night/guard unchanged **by design**.
- **uGraze** — grazing-elevation sky dissolves to haze (dunes/night skies below ~17.5° elevation;
  courtyard proven bit-exact null).
- **sparkle preroll** — the blue hook-diamond markers now render in staged captures (traversal is
  the hook shot).
- **c3 carnelian cane** — combat impact flash/arc/sparks recoloured and de-gained (its own
  measurement: chalk share 13.6%→2.2%, figure medSat 0.370→0.435).

**What this round must NOT credit:** `uGoldGlint` and `uAtmoWire` are committed but **INERT
scaffolds at zero gain** — they change nothing visually. The atmowire dose, the gold lobe, the
mradius band and the cone heading did **not** ship. Any movement in those areas is measurement
noise or capture phase, and is reported as such.

---

## 1. Provenance — what was judged against what

| shot | our file (all 1280×720, 2026-08-06, tree 167c508+dirty) | reference frame | source |
|---|---|---|---|
| hero | `progress/records/sbs3/hero.png` (02:30) | SMO Sand Kingdom vista (Tostarena, day) | [R1] `high/SandWorldHomeStage.jpg` |
| temple | `sbs3/temple.png` (02:30) | Sly 2 Cairo Museum hall (PCSX2) | [R2] `Unstretched HUD.jpg` |
| sly-closeup | `sbs3/sly-closeup.png` (02:30) | Sly 4: Thieves in Time still (600×600, letterboxed in pair) | [R3] |
| courtyard | `sbs3/courtyard.png` (02:30) | SMO Tostarena town, day | [R1] `SandWorldHomeStage_1.jpg` |
| dunes | `sbs3/dunes.png` (02:30) | SMO Sand Kingdom open dunes | [R1] `SandWorldHomeStage_4.jpg` |
| interior | `sbs3/interior.png` (03:00) | SMO Inverted Pyramid interior | [R1] `SandWorldPyramid001Stage.jpg` |
| night | `sbs3/night.png` (03:00) | SMO Tostarena night (moonlit) | [R1] `SandWorldHomeStage_2.jpg` |
| traversal | `sbs3/traversal.png` (03:03) | Sly 3 Venice rooftop run (PCSX2) | [R2] `Unstretched HUD sly 3.jpg` |
| combat | `sbs3/combat.png` (03:08) | Sly 4: Thieves in Time still | [R3] |
| guard | `sbs3/guard.png` (03:08) | Sly 2 bear guard, Nunavut night (PCSX2) | [R2] `Bear guards.jpg` |

Comparands re-fetched through the agent proxy on round 1's pinned routes, all successful first
try, all scratchpad-only:

- **[R1]** `https://raw.githubusercontent.com/Amethyst-szs/smo-thumbnail-database/main/high/<file>`
  — real Super Mario Odyssey v1.0.0 stage captures, **1280×720, exactly our resolution**
  (`SandWorldHomeStage.jpg` 197,584 B; `_1.jpg` 250,114 B; `_2.jpg` 195,806 B; `_4.jpg` 140,946 B;
  `SandWorldPyramid001Stage.jpg` 221,625 B).
- **[R2]** `https://raw.githubusercontent.com/zzamizz/weed-sheet/main/Media/Screenshots/<file>`
  (URL-encoded spaces) — real Sly 2/3 PCSX2 captures: `Unstretched HUD.jpg` 1151×647,
  `Unstretched HUD sly 3.jpg` 1151×647, `Bear guards.jpg` 862×647.
- **[R3]** `https://raw.githubusercontent.com/OldMcGroin/thegamingemporium/main/static/Images/`
  `Games/sly-cooper-thieves-in-time-pc-patched.webp` — real Thieves in Time still, 600×600.

Comparand caveats, unchanged and restated because they bound every verdict below: [R2] are fan
PCSX2 captures of 2004/2005 PS2 games — **beating them is the floor, not the bar**; [R3] is 600 px
letterboxed into a 560-px-tall pair (its live game pixels span roughly a third of the pair height,
so softness favours US in any texture read); [R1] are editor-staged stage-file captures but real
Odyssey rendering at full lighting. Round 1's egress finding still holds: every host except
`raw.githubusercontent.com` CONNECT-403s through this proxy, so a TotK- or Sly-4-HD-class
comparand remains unobtainable and the temple/traversal/combat/guard pairs are all judged against
either 2004-era hardware or a 600-px still.

---

## 2. Verdict table — with movement vs round 2

Verdicts were recorded per SIDE from the composites and written to the scratchpad
(`blind-verdicts.json`, with the reasoning for each side) **before** `sbs/mapping.json` was read.
Transcript order: build composites → view all ten pairs → write all ten per-side verdicts →
unmask. The mapping placed OURS on the left in hero/temple/night/combat/guard and on the right in
sly-closeup/courtyard/dunes/interior/traversal.

| shot | round 1 | round 2 | round 3 (this review) | movement vs round 2 |
|---|---|---|---|---|
| hero | THEIRS, decisive | THEIRS, decisive | **THEIRS**, decisive | none in verdict; warm arrived on rust/sand but not on the lit beam |
| temple | OURS, clear | OURS, clear | **OURS**, clear | held (comparand still 2004) |
| sly-closeup | THEIRS, decisive | OURS, narrow | **OURS**, narrow | held; new cost noted (off-model extended leg) |
| courtyard | THEIRS, decisive | THEIRS, clear | **THEIRS**, clear | narrowing inside "clear" — warm left plane + warm colossus flank now read blind |
| dunes | THEIRS, decisive | OURS, narrow | **OURS**, narrow-to-clear | **STRENGTHENED** — horizon dissolves cleanly; no streak class visible at pair scale |
| interior | THEIRS, narrow | OURS, narrow | **OURS**, clear | **STRENGTHENED** — composition gap widened; palette still our weak half |
| night | THEIRS, decisive | THEIRS, clear | **THEIRS**, clear | held; the "oily" sky that read blind last round is gone |
| traversal | THEIRS, narrow split | OURS, narrow-to-clear | **OURS**, narrow | **WEAKENED** — this staging puts the figure small, dark and on the top edge |
| combat | THEIRS, decisive | THEIRS, decisive | **THEIRS**, narrow | **BIGGEST MOVE OF THE ROUND** — the character survives the flash and reads |
| guard | THEIRS, decisive | THEIRS, decisive | **THEIRS**, decisive | none; a new framing defect (a black glossy wedge eats the lower-right third) |

**Round 1: 1 win / 9 losses. Round 2: 5 wins / 5 losses. Round 3: 5 wins / 5 losses — headline
unchanged, margins moved on five of ten shots and the decisive-loss count halved from three
(hero/combat/guard) to two (hero/guard).** No shot flipped, and the reason is legible: the four
new ships were a *margin* wave, not a *flip* wave. c3 took combat from decisive to narrow but did
not put an opponent in the frame; banda2 warmed the shade registers of the day shots but did not
reach the lit sandstone that decides hero and courtyard; uGraze cleaned the two skies that were
already not the deciding defect; sparkle preroll delivered its markers on a shot we already won.

**Blinding honesty note, restated verbatim in spirit from round 1:** the blinding is procedural —
our ink style is identifiable on sight, so randomised placement protects against filename-priming,
not against recognising our own render. Verdicts were nonetheless recorded per side, with written
reasoning, before the mapping was read, and the mapping matched the recognition in all ten cases.
Two of this round's calls (combat, courtyard) were close enough that I wrote the losing side's
strengths into the record before unmasking, which is the only real protection available here.

---

## 3. Per-shot: named quantities with owners, and re-measurement of round 2's headline numbers

Conventions, restated so numbers are comparable across rounds. Luma = Rec709 0–255. Hue = HSV
degrees by **plain `np.median` of the hue channel**, which is round 2's convention — verified by
re-running it on the round-2 files and reproducing round 2's published values exactly
(dunes sphinx **192.6°** ✓, interior piers **225.0° / 226.3°** ✓, temple lit column **213.0°** ✓,
hero beam **231.8° ≈ 232°** ✓). hf = mean|ΔL/Δx| + mean|ΔL/Δy| over the rect. Every share states
its predicate (§122.1). Rects are (x0,y0,x1,y1) full-res.

**Every "r2" number below was re-measured by me this round on `progress/records/sbs2/*.png` with
the identical code path, not copied from the round-2 text.** That removes the tool-difference
confound and makes each Δ a real Δ.

### 3.0 Framing held, and one frame is provably untouched

Round 2 → round 3 structural correlation (16×16-block luma) is ≥ 0.948 on all ten shots, so every
round-2 rect transfers without re-derivation. Per-shot change census (px with any channel Δ, and
px with Δ>8):

| shot | px changed | px Δ>8 | max Δ | reading |
|---|---|---|---|---|
| guard | **0.00%** | 0.00% | **0** | **bit-identical to round 2** (md5 `42ec9dae` both rounds) |
| night | 11.10% | 3.72% | 192 | change confined to **y < 254**; nothing below it moved at all |
| dunes | 12.96% | 3.80% | 122 | sky-dominated (32.3% of rows in y0–120) |
| hero | 91.36% | 0.81% | 131 | broad, tiny — a grade shift, not a geometry change |
| courtyard | 67.35% | 0.83% | 141 | ditto |
| temple | 97.46% | 0.52% | 119 | ditto |
| sly-closeup | 90.30% | 2.64% | 53 | ditto |
| interior | 97.76% | 0.89% | 50 | ditto |
| traversal | 94.68% | 4.65% | 154 | grade + the new sparkle blobs |
| combat | 96.27% | **35.07%** | 102 | by far the largest real change in the set |

Two things fall straight out of this table. **Guard is byte-for-byte the round-2 frame**, so every
guard number below reproduces exactly and no guard movement of any kind can be claimed this round —
which is the correct outcome, since banda2 gates night to the old value and nothing else in the
wave touches that shot. And **night's change stops dead at y=253**: `uGraze` moved sky pixels and
nothing else, which is the frame-side proof that banda2's night gate held.

### 3.1 banda2 — it landed, on shade, and mostly on subjects

Mean R−B by luma band, frame-wide, r2 → r3 (positive = warm):

| shot | L0–40 (shade) | L40–80 | L80–140 | L140+ |
|---|---|---|---|---|
| temple | −14.99 → **−10.86 (+4.13)** | −2.13 | −5.22 | −2.15 |
| interior | −16.19 → **−13.83 (+2.36)** | −2.51 | −3.26 | −1.37 |
| combat | −8.61 → **−6.28 (+2.33)** | +0.09 | +0.47 | −3.74 |
| sly-closeup | −15.57 → **−13.66 (+1.91)** | +0.68 | −3.39 | +1.25 |
| courtyard | −14.13 → **−12.56 (+1.57)** | −1.71 | −1.25 | −0.67 |
| traversal | −19.25 → **−18.26 (+0.99)** | −0.56 | −3.03 | −3.96 |
| hero | −11.59 → **−10.89 (+0.70)** | −0.85 | −2.55 | −2.13 |
| dunes | −2.61 → **−2.01 (+0.60)** | +0.21 | −0.49 | −2.33 |
| **night** | −33.18 → **−33.27 (−0.09)** | −0.56 | +0.75 | −1.53 |
| **guard** | −26.03 → **−26.03 (0.00)** | 0.00 | 0.00 | 0.00 |

**The gate is verified in the pixels: all eight day shots warmed their deepest shade band, and the
two night shots did not** (night −0.09 = noise, guard exactly 0.00 = bit-identical). banda2 did
what it registered.

Where it is *visible* is on subjects, which is what `subjWarmShade` says on the tin. The largest
single movement in the set is the closeup tail: the three round-2 tail-band rects, sel L>110, mean
R−B **+18.4 / +20.8 / +30.7 → +41.8 / +45.1 / +51.4** — the shadow cream went from marginally warm
to decisively warm, +23 R−B on the same rects. The muzzle (595,185,655,235, L>110) went **+4.6 →
+12.1**. Traversal's figure went **−12.5 → −5.7**, hero's figure **+0.4 → +2.9**.

**Where it did NOT land is the environment warm share**, and this is the round's most important
negative result. Frame-wide warm share (R>B+10, L>40) fell on seven of the eight day shots:

| shot | r2 | r3 | Δ | comparand |
|---|---|---|---|---|
| hero | 23.69% | **23.16%** | −0.53 | Odyssey **59.38%** |
| courtyard | 34.07% | **33.80%** | −0.26 | Odyssey **63.68%** |
| interior | 7.24% | **7.05%** | −0.19 | Odyssey **31.03%** |
| dunes | 66.90% | **65.23%** | −1.67 | Odyssey 73.21% |
| temple | 18.31% | **18.08%** | −0.24 | Sly 2 22.31% |
| traversal | 27.26% | **27.05%** | −0.21 | — |
| combat | 42.96% | **38.17%** | −4.78 | — (c3 de-gain, intended) |
| sly-closeup | 11.62% | **11.68%** | +0.06 | — |

banda2 warms the **shade** register and very slightly cools the **lit** register (the L80–140 and
L140+ columns above are negative almost everywhere). The net on a predicate gated at L>40 is a
small loss. **Round 2's headline "interior warm share 7.2% vs comparand 31.0%" re-measures at
7.05% vs 31.03% — it did not move, and the 4.4× deficit is intact.** Owner: **SHADING** — the
lit half of the palette is still the open item; banda2 was the shade half and is now done.

### 3.2 hero — LOSS (Odyssey), decisive, unmoved

- **Round 2's headline reproduces almost exactly and the warm half is still missing from the lit
  register.** Architrave beam (300,330,750,430): medHue **231.8° → 230.0°**, violet-band
  (230–330°) share **48.30% → 46.88%**, medL 40.06 → 41.26, mean R−B −11.01 → −11.50. Bible-lit
  sandstone (hue 15–60, L>100) in that rect: **0.751% → 0.762%** — an increase of eleven
  hundredths of a percentage point. The single number round 2 named as the deciding defect is
  **statistically unchanged.** → **SHADING** (the lit-sandstone half; banda2 was the shade half).
- **Shadow floor improved again, and is still ~460× the comparand.** Architecture (200,300,900,600)
  share < L40: **37.61% → 35.19%**; Odyssey architecture (64,324,896,576): **0.076%**. Ink and
  shadow still pool into one black register. → **SHADING** (shadow floor).
- **Still no background landmark.** Pale stepped mass (620,0,1000,45) medL 158.29 vs left sky
  (0,0,140,45) 155.72 — **ΔmedL 2.57** (r2: 3.02; Odyssey's floating pyramid: 18.5). It went
  slightly *further* toward iso-luminance. → **GEOMETRY** / **COORDINATOR**.
- **Figure separation held, not improved.** Sly (585,185,715,320) medL 66.49 → **67.19** vs
  flanking surround 93.51 → **94.73** — Δ 27.0 → 27.5 dark-on-light, and at pair scale he still
  reads as part of the beam cluster he stands on. §151.4's open question stands. → **COORDINATOR**
  + **CHARACTER**.
- The rust flank (280,380,380,450, R−B +19.9) and sand floor (700,470,1000,700, warm share 10.3%)
  are the only warm mass on the geometry and both are **unchanged to within 0.2**. In the blind
  view I credited exactly these two and they still did not carry the frame.

### 3.3 temple — WIN (vs Sly 2 Cairo Museum), held

- Shaft carry re-measures at scanline y=220, x250–700: max−min **146.98** (r2: 146.62), p95−p5
  **120.86** (r2: 121.82). Held to within a luma level; the shafts still carry the frame.
- **Best banda2 result in the set on the deep-shade band (+4.13 R−B)**, and it is visible: the
  hall floor and column bases are no longer neutral-black. But the lit column (80,260,200,420)
  medHue **213.0° → 210.9°**, R−B −20.23 → −19.55 — the fill leg's cool cast on *lit* limestone
  is where round 2 left it. Frame warm share 18.31% → 18.08% vs the 2004 comparand's **22.31%**:
  **we are still less warm than a PS2 game in the same room.** → **SHADING** (fill leg).
- Verdict stands OURS with round 1's caveat: the comparand is 2004 and this win would not survive
  a TotK-class interior, which the proxy cannot deliver.

### 3.4 sly-closeup — WIN (Thieves in Time), narrow, held

- **The eye fix is stable, not drifting.** Pale-aperture pixels (L>150, sat<0.25) in the eye band
  (570,140,710,215): **226 px in both rounds** — identical. Dark share (L<70) of the eye band
  72.19% → **71.72%**. eyesize 0.55 is holding exactly where RESULT-eyesize put it.
- **banda2's biggest visible win lives here** (tail R−B +18.4/+20.8/+30.7 → +41.8/+45.1/+51.4,
  muzzle +4.6 → +12.1, §3.1). In the pair the tail now reads warm cream-and-grey rings rather than
  the cool cream round 2 described. **Honest win for banda2, and the clearest one in the set.**
- **New cost, named because it was the thing that kept this verdict at "narrow" in the blind
  view:** the right leg is extended nearly horizontally into the frame in a way that reads as a
  mid-animation pop or an off-model limb, not as a pose. It is the first thing the eye goes to
  after the cane. → **ANIMATION** / **CHARACTER** (staging of the closeup pose).
- Body remains near-monochrome blue against a blue-grey wall; the one warm raking plane on the
  right does all the separation work. → **SHADING** (grade).

### 3.5 courtyard — LOSS (Odyssey), clear, narrowing

- **`uGraze`'s courtyard null is verified bit-exact in the frame.** The clean-sky rect
  (850,0,1150,55) is **byte-identical** between rounds (max channel diff **0**), and its hf is
  **3.9957 in both** — the claim that courtyard is a proven null is true at the pixel level, not
  just at the gate. Busiest streak region (240,20,420,120) hf 8.255 → **8.343** (unchanged);
  Odyssey sky (80,30,700,150) **1.217**. Courtyard sky is still **3.3×** the comparand. → **SKY**,
  low priority, unchanged from round 2.
- Bottom-left quarter (0,360,640,720) medL 74.24 → **75.24**, <L40 share 14.06% → **13.60%**. The
  round-1 black quarter stays dead.
- **The palette still decides it.** Lit right-statue face (930,270,1100,420) warm share (R>B+10,
  L>40) 18.27% → **18.00%**; frame warm share 34.07% → **33.80%** against Odyssey's **63.68%**.
  Same defect family as hero, same owner, same non-movement. → **SHADING**.

### 3.6 dunes — WIN (Odyssey), narrow → narrow-to-clear

- **`uGraze` moved every sky number in the right direction, and the residual is still 13.8×.**
  Round-1 marbled zone (100,10,280,120) hf 4.342 → **3.805** (−12.4%); top band (0,0,1280,50)
  5.635 → **5.297**; **round 2's headline worst clean-sky band (760,0,1120,45): 8.054 → 7.612
  (−5.5%), against a re-measured ref (150,20,850,110) of 0.551 — the ratio goes 14.6× → 13.8×.**
  The horizon band (0,90,1280,150) went hf 6.516 → 6.106, sd 27.43 → 26.93. In the pair the
  horizon now dissolves and the streak class **did not read at pair scale** — which is why the
  margin widened. At full res it is still measurably present, and 13.8× is not a small number.
  → **SKY**.
- Sky colour moved with it: (760,0,1120,45) medHue **286.0° → 250.2°**, R−B −4.06 → −14.48,
  medL 151.4 → 148.2. The band is bluer and slightly darker.
- **Everything below the sky is untouched.** Pyramid (250,40,450,140) medL **155.9484 in both
  rounds** (identical); ink share (L<60) in (300,140,900,420) **7.867% → 7.870%**; **the sphinx row
  (60,230,330,420) is bit-identical, medHue 192.6° both rounds.** The teal sphinxes were the single
  loudest wart in my blind view of this pair and they are exactly where round 2 left them. →
  **TEXTURES** to answer intent, then **SHADING** if it is the light. The distance-ink item
  (`Outline.js` falloff) is likewise untouched — a round-1 item now three rounds old. → **SHADING**.

### 3.7 interior — WIN (Odyssey), narrow → clear

- **The flip widened on composition alone; the colour is where round 2 left it.** Left pier
  (60,80,320,400) medHue **225.0° → 222.9°**, medL 51.47 → 55.83; right pier (1050,100,1250,500)
  **226.3° → 223.9°**, medL 50.04 → 54.40. The piers got ~4.4 luma lighter and ~2° bluer.
- **Round 2's headline warm share re-measures unmoved: 7.24% → 7.05% against the comparand's
  31.03%** — a 4.4× deficit, marginally worse than round 2's 4.3×. banda2 warmed this shot's deep
  shade by +2.36 R−B (§3.1) and it did not reach the warm-share predicate. → **SHADING** (grade)
  + **FX** (torch radius — sconce pools still die within ~2 m).
- Ceiling bloom stays fixed: warm-bright coverage (500,0,1280,200; R>B+20, L>140) 0.894% →
  **0.908%** (round 1: 11.3%). Held.
- **The treasure gold still renders near-black blue.** Pile (780,415,960,465) medL 37.08 →
  **38.11**, medHue **240.0° in both rounds**, <L60 share 82.58% → **79.96%**. `uGoldGlint` is an
  inert scaffold and the frame agrees: nothing moved. The §158.5/§130.5 gold-renders-dark family
  still has **no live arm**. → the **gold cluster** (SHADING `spec` assembly §136.3 / GEOMETRY
  per-recipe `metalAmount`).

### 3.8 night — LOSS (Odyssey), clear, held; the sky defect that read blind is gone

- **Round 2's headline sky numbers split.** Swirl band (750,0,1250,220) hf **4.976 → 4.387**
  (−11.8%); ref night sky (60,20,650,140) re-measures **0.742**, so the ratio goes 6.7× → **5.9×**.
  But the left band (80,130,350,240) went **4.979 → 5.558 (+11.6%, worse)**. The horizon band
  (0,150,1280,230) improved, 5.098 → 4.734. **`uGraze` is a net improvement that is not uniform:
  it wins where the grazing dissolve applies and loses in at least one mid-elevation band.** The
  operational result is what matters and it is good news — the "oily" swirl I flagged blind in
  round 2 **did not read at pair scale this round**; the sky reads as a clean gradient with a
  horizon haze band. → **SKY** (the left-band regression is the named residual).
- **The night gate is proven, twice.** Warm accents (R>B+15, L>60) **0.19108% → 0.19097%** against
  the comparand's **2.45%** — unchanged to five significant figures. Sly's figure (655,395,785,485)
  medL **16.8876** and the slabs (820,395,950,485) medL **30.0596** are *identical to the byte* in
  both rounds. Every changed pixel in this frame is above y=253. banda2 did not leak into night.
- Consequently the whole round-2 night diagnosis stands untouched: the figure is still darker than
  his own backdrop (16.9 vs 30.1), the warm pole is still 12.8× short of the comparand, and the
  staged night lights are still round 1's open item. → **GEOMETRY** (staged night lights) + **FX**;
  **SHADING** for P-night, which is registered — do not free-lance a threshold here (§141).
- **A sparkle false-positive to kill before someone credits it.** #8fd8ff-tolerance pixels in night
  went **41 → 179**. All **138 new pixels are in the sky band (y 15–158), 100% of them**, and all
  frame change is above y=253 — they are `uGraze` haze landing inside the sparkle tolerance, **not
  FX**. The sparkle language is still absent from night.

### 3.9 traversal — WIN (Sly 3), narrow-to-clear → narrow

- **The sparkle preroll shipped and is measurable for the first time in three rounds: 0 px → 230
  px** inside #8fd8ff tolerance 40, in **14 blobs**, the four largest being 80 px at (506,249),
  65 px at (505,227), 42 px at (433,275) and 31 px at (433,260) — two coherent marker clusters on
  the hook apparatus, exactly where the hook-diamond markers belong. At tolerance 30 the count is
  0 and at 60 it is 1,704, so the markers sit at the edge of the canonical tolerance rather than
  centred in it. **§2.1 item 6, unserved in rounds 1 and 2, is served on the hook shot.** Honest
  win for **FX**. Follow-up if anyone wants it centred: → **FX** (marker hue is ~1 tolerance step
  off #8fd8ff).
- **The verdict weakened anyway, and the measurement says why.** Figure (525,195,715,365) medL
  76.40 → **76.45** vs surround (300,195,490,365) 70.53 → **73.04**: figure-to-surround contrast
  **collapsed from Δ5.87 to Δ3.41**, a 42% loss of the separation that carried round 2's flip. The
  figure also sits small, dark and hard against the top edge of the frame in this staging. The
  environment half of the shot is still the strongest rendered passage in the ten frames; the
  action half gave back most of what round 2 credited. → **COORDINATOR** (camera/staging on the
  hook shot) + **SHADING** (rim strength on the swinging figure).
- banda2 warmed the figure here (R−B −12.5 → −5.7) without buying separation, because the
  surround warmed and lightened with it.

### 3.10 combat — LOSS (Thieves in Time), decisive → narrow: the round's biggest move

- **c3 is the largest real change in the set** (35.07% of pixels moved by more than 8 levels, vs
  ≤4.65% everywhere else) and it did what it registered.
- **Round 2's headline chalk mass, on round 2's rect and predicate** (360,390,720,670; L>150,
  sat<0.30): **23,919 px / 23.73% → 9,122 px / 9.05%**, chalk medL **203.8 → 173.5**, chalk medSat
  0.159 → 0.187. A **62% reduction in chalk mass.**
- **Reconciling with c3's own "13.6% → 2.2%" claim, honestly:** the direction and class replicate
  under every predicate I tried, but the magnitude is strongly predicate-dependent, so the two
  numbers are not the same measurement and should not be quoted interchangeably. Frame-wide:
  L>150/sat<0.30 **6.87% → 4.29%**; L>180/sat<0.20 **3.32% → 1.14%**; L>200/sat<0.15 **1.44% →
  0.01%** (13,258 px → **131 px**, a 99.0% kill). The tightest predicate says the blown-white core
  is essentially gone; the CRITIC rect says 9,122 chalk px remain. Both are true.
- **The figure survives the flash now.** Figure box medSat **0.370 → 0.435** — this reproduces c3's
  registered projection *exactly* (0.370→0.435), which is a clean independent confirmation. Box
  medL 154.21 → **119.98**. Blue pixels on the figure (hue 200–250, sat>0.35, L>60): **0 → 22 px**
  — nonzero for the first time, and still trivially small.
- **The flash is carnelian now.** Flash core (300,280,520,400) median RGB **[215,183,125] →
  [178,120,87]**, medL 185.8 → **129.8**, mean R−B 71.9 → **88.2**. Pale gold-white became
  terracotta. That is the recolour, visible and measured.
- **What still loses the pair, named:** (a) the character reads **brown/tan, not blue** — 22 blue
  px on a figure whose identity is a blue jacket, while the TiT comparand's figure re-measures
  medL 39.2 / medSat 0.457 and is unmistakably blue; the de-gain fixed the blow-out by pulling the
  whole figure toward the warm flash rather than restoring his own albedo. → **FX** (flash
  colour/figure separation) + **SHADING** (tonemap interaction). (b) A soft white glow ellipse
  still smears the floor around the impact. → **FX**. (c) **The combo still hits air** — no enemy
  in frame — which is now the single largest remaining reason this pair loses, because the
  comparand's frame contains a fight and ours contains a pose. → **COORDINATOR** / **GUARDS**.

### 3.11 guard — LOSS (Sly 2), decisive, provably unmoved

**This frame is byte-identical to round 2 (md5 `42ec9dae`, 0 pixels changed, max Δ 0).** Every
round-2 number therefore reproduces exactly and no movement can be claimed or blamed:

- Guard mass (790,100,980,330) medL **18.64**, <L30 share **78.48%** — identical.
- Round-1 rect (852,220,990,700) medL **22.61**, <L30 share **83.32%** — identical.
- Patrol-cone air column (700,300,850,500) medL **27.59** — identical. The cone still contributes
  nothing; its heading candidate did not ship.
- Doorway pool (220,360,640,560) medL **113.46** — identical, and still the frame's only real
  light feature, i.e. set dressing rather than the shot's named subject.
- Comparand: the Sly 2 bear at my re-derived rect (300,120,520,420) medL **32.57**, <L30 share
  **43.49%**. Round 2 quoted 40.7 / 31.1% at an unstated rect; my rect includes more of the dark
  dock, so **this quantity is rect-fragile and I am flagging the disagreement rather than papering
  it over.** Under either rect the 2004 PS2 render keeps its character 1.7–2.2× brighter than ours
  in the same night register.
- **New finding, from the blind view rather than the ledger:** a large near-black glossy wedge
  occupies roughly the lower-right third of the frame and buries the subject behind it. It was
  there in round 2 as well (the frame is identical) but no round has named it. It is the reason I
  could locate the guard this round and still called the margin decisive. → **COORDINATOR**
  (framing: the shot's own foreground prop is eating the shot) + **GUARDS** (pose/placement).

---

## 4. The three highest-leverage remaining gaps

Reordered from round 2, because the wave changed which gap is binding. Round 2's list was
(1) the warm half, (2) one FX cluster, (3) the sky streaks. One of those is now half-closed, one
has changed owner, and one has demoted itself out of the list.

### 1. The **lit** half of the palette — still the single axis that decides both Odyssey day losses

banda2 closed the **shade** half and the frames prove it (all eight day shots warmed their L0–40
band, +0.60 to +4.13 R−B; night and guard provably did not, §3.1). The **lit** half is untouched
and is the whole remaining gap:

| quantity | round 2 | round 3 | comparand |
|---|---|---|---|
| hero beam, bible-lit sandstone (hue 15–60, L>100) | 0.751% | **0.762%** | — |
| hero frame warm share (R>B+10, L>40) | 23.69% | **23.16%** | Odyssey **59.38%** |
| courtyard frame warm share | 34.07% | **33.80%** | Odyssey **63.68%** |
| interior frame warm share | 7.24% | **7.05%** | Odyssey **31.03%** |
| temple frame warm share | 18.31% | **18.08%** | Sly 2 (2004) **22.31%** |

banda2 warms shade and *slightly cools* the L80+ registers, so a predicate gated at L>40 nets out
negative on seven of eight day shots. **Hero and courtyard lose on this and nothing else** — their
staging, sky, shadow floor and material detail are all now either fixed or not the deciding
defect. Owner: **SHADING**, and it needs a registered vehicle aimed at *lit* sandstone, not another
shade pass. Until it ships, hero and courtyard do not flip no matter what else lands.

### 2. **Combat is one content decision away from a flip** — and the owner is no longer FX

Round 2 bundled combat, guard and traversal into "one FX cluster." c3 dissolved that bundle: it
took combat from decisive to **narrow**, sparkle preroll served traversal, and guard turned out to
be bit-identical. What is left on combat is not effects work:

- **The combo still hits air.** No enemy is in frame; the comparand's frame contains a *fight*.
  In the blind view this was the deciding difference — a pose versus a beat. → **COORDINATOR** /
  **GUARDS**.
- **Sly reads brown, not blue: 22 blue px** (hue 200–250, sat>0.35, L>60) on the figure, against a
  comparand figure at medSat 0.457 that is unmistakably blue. c3 fixed the blow-out by pulling the
  figure toward the warm flash rather than restoring his albedo. → **FX** + **SHADING**.

This is the cheapest available flip in the set: the margin is already narrow and both remaining
items are named and small. Nothing else on the board is this close.

### 3. **Guard — the only shot that has never received a ship, and its top defect is free**

Guard is **byte-identical across rounds 2 and 3** (md5 `42ec9dae`, 0 px changed). It is a decisive
loss to a 2004 PS2 frame, and it has now been measured three times with the same numbers: guard
mass medL **18.64** / 78.48% under L30, patrol-cone air column medL **27.59**, doorway pool medL
**113.46**, against a bear at medL 32.6–40.7. The new finding this round costs nothing to fix: a
**large near-black glossy wedge occupies the lower-right third of the frame and buries the
subject** — the shot's own foreground prop is eating the shot. Move the camera or the prop and the
guard is at least visible; light him and the pair becomes arguable. → **COORDINATOR** (framing)
+ **GUARDS** (pose/placement) + **FX** (fill / the cone, whose heading candidate did not ship).

### Demoted: the sky-streak class

Round 2's gap #3 is no longer top-three, and `uGraze` is why. Dunes' worst band went **8.054 →
7.612** (14.6× → **13.8×** ref) and its horizon now dissolves; night's swirl band went **4.976 →
4.387** (6.7× → **5.9×**). More decisive than the ratios: **the class did not read at pair scale
on either shot this round**, where in round 2 night's sky read "oily" to me blind. Dunes is a win
and night now loses on warmth and staging, not sky. The residual is real (13.8× is not small) and
one band regressed (night left band **4.979 → 5.558**), so it stays open — but it is **SKY**,
low priority, and should be scheduled behind items 1–3.

### Regression to flag

**Traversal weakened** (narrow-to-clear → narrow): figure-to-surround contrast collapsed **Δ5.87 →
Δ3.41**, a 42% loss of the separation that carried round 2's flip, because the surround warmed and
lightened with the figure. The shot is still a win and the sparkle preroll is an honest gain, but
this is the one place the wave cost us something. → **COORDINATOR** (staging) + **SHADING** (rim).

---

## 5. Honest wins, so they are not re-litigated

- **banda2 landed and its gate is verified in the pixels.** All eight day shots warmed their
  deepest shade band (+0.60 to +4.13 mean R−B); night moved −0.09 and guard moved exactly 0.00.
  A registered night gate that holds bit-exactly in the delivered frames is a good result.
- **The closeup tail is banda2's visible payoff:** the three registered tail rects went R−B
  +18.4/+20.8/+30.7 → **+41.8/+45.1/+51.4**, and in the pair the tail reads warm cream-and-grey.
  The muzzle went +4.6 → +12.1.
- **c3 is the largest real change in the set and it did what it registered.** Chalk mass on the
  CRITIC rect **−62%** (23,919 → 9,122 px); frame-wide at the tight predicate **−99%** (13,258 →
  131 px); figure medSat **0.370 → 0.435**, reproducing c3's own projection exactly; the flash core
  went pale-gold **[215,183,125] → carnelian [178,120,87]**. It moved a three-round decisive loss
  to narrow — the biggest verdict movement of the round.
- **The sparkle preroll served §2.1 item 6 for the first time in three rounds:** traversal
  **0 → 230 px** in 14 blobs, two coherent marker clusters on the hook apparatus.
- **`uGraze`'s courtyard null is bit-exact in the frame** (clean-sky rect max channel diff **0**),
  and its dunes/night skies improved on every band but one. A change that is provably null where it
  claimed to be null is worth as much as one that moves a number.
- **Held from round 2, re-measured and stable:** the eye fix (226 pale-aperture px, identical
  both rounds), the interior bloom-smear collapse (0.894% → 0.908%, round 1: 11.3%), the courtyard
  black quarter staying dead (<L40 14.06% → 13.60%), the temple shaft carry (146.6 → 147.0), and
  the hero shadow floor continuing to improve (37.61% → 35.19%).
- **Two inert scaffolds behaved as inert.** `uGoldGlint` is committed at zero gain and the interior
  treasure pile is unmoved (medHue **240.0° both rounds**, medL 37.1 → 38.1); `uAtmoWire` likewise.
  Neither is credited anywhere above. The gold-renders-dark family still has no live arm.

---

## 6. Files this review produced

- **This report: `/home/user/Demo/progress/records/CRITIC-sbs3.md` — the ONLY repo file written.**
  No `src/**` touched, no captures taken, no git run (the coordinator sweeps).
- Scratchpad only, never committed (§1.1 rule 3 / §162), under
  `/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/`:
  `ref/` (9 comparand images on round 1's pinned routes), `sbs/` (10 randomised composites +
  `mapping.json`), `blind-verdicts.json` (the per-side verdicts with reasoning, written before
  unmasking), `compose_sbs.py`, `measure.py`, `measure3.json`, `pass2.py`, `pass2.json`.

**STATUS: COMPLETE.**
