# CRITIC-sbs2 — the second §7.4 blind side-by-side, measured against round 1's baseline

**STATUS: COMPLETE — verdict: round 1's 1 win / 9 losses is now 5 wins / 5 losses, with every
flip traceable to a named ship and every unmoved loss traceable to a no-ship. Written
incrementally under §163/§164 discipline; §5 lists every file produced.**

**Date:** 2026-08-05. **Critic:** adversarial visual review per `tools/CRITIC.md`; no `src/**`
touched. **Baseline:** `CRITIC-sbs1.md` (1 win / 9 losses, frames of 2026-08-01 across five trees).
**Method:** identical to round 1 — same pinned comparand routes re-fetched to the scratchpad, both
frames scaled to equal height, ours in randomised left/right position (SystemRandom, mapping
withheld until verdicts recorded per side), then rect-level measurement on the full-res frames.

**Our frames this round:** `progress/records/sbs2/*.png` — all ten canonical shots, 1280×720
quality=high, captured 2026-08-05 17:04/17:23 on ONE tree (report.json: commit 16a3817+dirty),
which removes round 1's five-trees-in-one-day caveat. The tree carries five ships the baseline
frames predated: the sky cloud-deck fix (skynoise: `TUNE.decks` scale/soft — courtyard/dunes/night),
eyesize 0.55 (sly-closeup), capYaw −10° (sly-closeup/combat), the gold-only prop hull
(interior/courtyard), and the §132.4 violet-pair (`shadowTeal 0.15` + `shadowBounceMix 0.05`)
plus the §130.4 chisel pass. It does NOT carry: banda's warm-restoration (scored, no-ship
decision pending at capture — cream/tail teal expected unchanged), goldlobe's glint (P-F1 REVERT,
`goldGlint 0.0` shipped), or fxcluster's cone/sparkle/flash candidates (not shipped). Movement
claims below credit only ships that happened.

---

## 1. Provenance — what was judged against what

| shot | our file (all 1280×720, 2026-08-05, one tree: 16a3817+dirty) | reference frame | source |
|---|---|---|---|
| hero | `progress/records/sbs2/hero.png` (17:04) | SMO Sand Kingdom vista (Tostarena, day) | [R1] `high/SandWorldHomeStage.jpg` |
| temple | `sbs2/temple.png` (17:04) | Sly 2 Cairo Museum hall (PCSX2) | [R2] `Unstretched HUD.jpg` |
| sly-closeup | `sbs2/sly-closeup.png` (17:04) | Sly 4: Thieves in Time still (600×600, letterboxed in pair) | [R3] |
| courtyard | `sbs2/courtyard.png` (17:04) | SMO Tostarena town, day | [R1] `SandWorldHomeStage_1.jpg` |
| dunes | `sbs2/dunes.png` (17:04) | SMO Sand Kingdom open dunes | [R1] `SandWorldHomeStage_4.jpg` |
| interior | `sbs2/interior.png` (17:23) | SMO Inverted Pyramid interior | [R1] `SandWorldPyramid001Stage.jpg` |
| night | `sbs2/night.png` (17:23) | SMO Tostarena night (moonlit) | [R1] `SandWorldHomeStage_2.jpg` |
| traversal | `sbs2/traversal.png` (17:23) | Sly 3 Venice rooftop run (PCSX2) | [R2] `Unstretched HUD sly 3.jpg` |
| combat | `sbs2/combat.png` (17:23) | Sly 4: Thieves in Time still | [R3] |
| guard | `sbs2/guard.png` (17:23) | Sly 2 bear guard, Nunavut night (PCSX2) | [R2] `Bear guards.jpg` |

Sources re-fetched through the agent proxy via round 1's pinned routes, scratchpad only (§1.1
rule 3), all successful on first try: **[R1]** `raw.githubusercontent.com/Amethyst-szs/`
`smo-thumbnail-database/main/high/<file>` (1280×720 Nintendo captures); **[R2]**
`raw.githubusercontent.com/zzamizz/weed-sheet/main/Media/Screenshots/<file>` (URL-encoded
spaces); **[R3]** `raw.githubusercontent.com/OldMcGroin/thegamingemporium/main/static/Images/`
`Games/sly-cooper-thieves-in-time-pc-patched.webp`. Comparand caveats unchanged from round 1:
[R2] are fan PCSX2 captures of 2004/2005 PS2 games (beating them is the floor, not the bar);
[R3] is 600 px letterboxed (its live game pixels span roughly a third of the pair height —
softness favours US in any texture read); [R1] are editor-staged but real Odyssey rendering.

**Framing note (affects two movement claims).** Our `courtyard` framing differs sharply from the
round-1 frame (that one looked across slab tops at architrave height; this one is ground-level:
obelisk + colossi + braziers) and `guard` differs from round 1's wedge1-staged frame (tod 0.89
staged vs this canonical staging). Round-1 rects were re-derived on the fresh frames where content
moved; every rect used is stated beside its number in §3.

---

## 2. Verdict table — with movement vs round 1

Verdicts were recorded per SIDE from the composites before `sbs/mapping.json` was read; the
transcript order was: view pair → write per-side verdict → next pair → … → unmask all ten.

| shot | round 1 | round 2 (this review) | movement |
|---|---|---|---|
| hero | THEIRS, decisive | **THEIRS**, decisive | none in verdict (sky fixed, figure still merges, stone still cool) |
| temple | OURS, clear | **OURS**, clear | held (comparand still 2004) |
| sly-closeup | THEIRS, decisive | **OURS**, narrow | **FLIP** — eyesize 0.55 + capYaw removed the disqualifier |
| courtyard | THEIRS, decisive | **THEIRS**, clear | narrowed — restaged subject + fixed sky; palette still loses |
| dunes | THEIRS, decisive | **OURS**, narrow | **FLIP** — sky fix + haze layering; per-pixel terrain still theirs |
| interior | THEIRS, narrow | **OURS**, narrow | **FLIP** — on composition; colour remains our weak half |
| night | THEIRS, decisive | **THEIRS**, clear | narrowed — moon staging + warm doorways; residual sky swirl |
| traversal | THEIRS, narrow split | **OURS**, narrow-to-clear | **FLIP** — swing arc now reads (attribution unresolved, §3) |
| combat | THEIRS, decisive | **THEIRS**, decisive | none — flash still erases the character (fxcluster unshipped) |
| guard | THEIRS, decisive | **THEIRS**, decisive | none, arguably worse — no guard figure locatable in frame |

**Round 1: 1 win / 9 losses. Round 2: 5 wins / 5 losses (three of the five wins narrow; the five
losses include the three decisive ones).** The four flips and two narrowings track the shipped
changes; the three unmoved losses track the no-ships (fxcluster) and the unshipped grade half
(hero/courtyard stone temperature) — the scoreboard moved exactly where work shipped, and did not
move where it did not.

**Blinding honesty note, as round 1 stated it:** the blinding is procedural — our ink style is
identifiable on sight, so randomised placement protects against filename-priming, not against
recognising our own render. Verdicts were nonetheless recorded per side before the mapping was
read, and the mapping matched the recognition in all ten cases.

---

## 3. Per-shot: named quantities with owners, and movement on round 1's headline numbers

Luma = Rec709 0–255. Hue = HSV degrees. Rects (x0,y0,x1,y1) full-res. hf = mean|ΔL/Δx| +
mean|ΔL/Δy| over the rect (skynoise's hf_x+hf_y convention). Every share states its predicate
(§122.1). "R1:" = the corresponding round-1 number. Reference numbers re-measured this round from
the same comparand files; where my re-derived ref rect disagrees with round 1's unstated one, both
are shown and the instability is said out loud.

### hero — LOSS (Odyssey Tostarena), decisive; the violet died, the warmth did not arrive
- **The beam is no longer violet — and still not sandstone.** Architrave beam (300,330,750,430):
  medHue **232°** (R1: 279°), hue-230–330 share **48.2%** (R1: 84.2%), medL 40 (R1: 36), mean R−B
  **−11.0**. The §132.4 violet-pair moved the shadow family from violet to teal-blue exactly as its
  own measurements predicted (≤226° target; 232 on this rect). But bible-lit-sandstone pixels
  (hue 15–60, L>100) are **0.75%** of the beam rect — the warm half of the palette is still absent
  from the hero geometry. → **SHADING** (the unshipped warm restoration; banda is the live
  registered vehicle, scored and awaiting the ship decision).
- **Shadow floor improved by a quarter and is still two orders off the comparand.** Architecture
  rect (200,300,900,600) share <L40: **37.6%** (R1: 49.2%); Odyssey architecture (64,324,896,576):
  **0.08%** (R1: 0.1%). Ink and shadow still pool into one black register. → **SHADING**.
- **The figure now separates from the wall and continues into the beams.** Sly (585,185,715,320)
  medL **66.5** vs flanking surround **85.1** — Δ19 dark-on-light (R1: +8 with no rim read); but he
  stands on a beam at medL 40, and at pair scale cap and tail read while the body still reads as
  part of the beam cluster. §151.4's open question (should `hero` carry Sly at ~100 px) stands.
  → **COORDINATOR** + **CHARACTER**.
- **Still no background landmark.** Pale stepped mass above the gate (620,0,1000,45) medL 159.0 vs
  left sky (0,0,140,45) 156.0 — **ΔmedL 3.0** (R1: 0.5; Odyssey's floating pyramid: 18.5). Nearly
  iso-luminant; reads as sky texture, not a destination. → **GEOMETRY**/**COORDINATOR**.

### temple — WIN (vs Sly 2 Cairo Museum), held; same caveat, same residual
- Shaft carry: scanline y=220 x250–700 spans **147** luma max−min / **122** p95−p5 (R1: "123
  levels"). The shafts still carry the frame and the doorway view still out-stages the comparand.
- **Off-violet, now cyan-cool.** Lit column rect (80,260,200,420): medHue **213°** (R1: 287°),
  mean R−B **−20.2**; the brightest lit face (880,300,1000,550): 202°, R−B **+3.0**. §132.4's own
  residual note names this: the fill leg's sand-bounce R-dominance, untouched by the pair. Doorway
  (660,430,800,590) medL 160, R−B +11 — the warm is confined to the exit. → **SHADING** (fill leg).
- Verdict stands as OURS; the comparand is 2004 and the win still would not survive a TotK-class
  interior (unobtainable through the proxy, per round 1 §1).

### sly-closeup — WIN (Thieves in Time), narrow; round 1's disqualifier is measured dead
- **The eyes are Sly's eyes now.** Pale-aperture pixels (L>150, sat<0.25) in the eye band
  (570,140,710,215): **226 px**, longest single-eye run **17 px** on a ~135 px cheek-to-cheek face
  (width read off the frame at eye height) → **eye:face ≈ 0.126, inside the canon 0.10–0.15** (R1:
  0.25–0.37, basis stated there). The round-1 amber-iris predicate (hue 25–50, sat 0.3–0.65,
  L110–210) returns 1,182 px in the head box (R1: 1,864) but they are now **scattered warm-lit fur
  and cap edges across the whole box** (bbox spans it; only 266 px near the eyes, no disc, no run
  over 17 px) — the predicate now measures the key light, not an iris. Matches RESULT-eyesize's
  own projection. → **CHARACTER: eyesize 0.55 confirmed in the adversarial frame. Honest win.**
- **The mask reads as a mask.** Dark share (L<70) of the eye band: **72.2%** — the mask is the
  darkest coherent shape on the head (R1: mask survived only as brow-line ink above the discs).
  The capYaw −10° bill is visible in silhouette at this bearing (per §166; not separately measured).
- **The lit cream is warm in-frame; the shadow cream is still teal by the shipped tree's own
  registered numbers.** Tail light bands, three hand-placed on-band rects (755,300,800,340),
  (810,320,860,370), (700,380,760,430), sel L>110: mean R−B **+18.4 / +20.8 / +30.7**, medHue
  6–10° (R1: −34.2 at the registered cream band's cold edge); muzzle (595,185,655,235, L>110)
  R−B **+44.5**. This framing puts the key on the tail — it does not retire Band A: banda's arm-A
  anchor on the shipped tree is creamROI b−r **−45** in shadow. What died is the *windsock*: in
  the pair, the tail reads cream-and-grey rings, not blue-white. → **SHADING** Band A stays open
  exactly as registered (ship decision pending); do not re-derive it from this lit frame.
- Remaining honest gaps in the pair: figure blues sit near-monochrome against the blue-grey wall
  (one warm patch carries the frame), and clothing surfaces read smooth-plastic at 1:1. → **SHADING**
  (grade) / **CHARACTER** (material detail), neither disqualifying in the pair.

### courtyard — LOSS (Odyssey), narrowed from decisive to clear
- **The named subject exists now.** Obelisk on a stepped plinth, two colossi with readable faces,
  braziers both corners, hook-ring cables — §7.2's list is finally in the frame, and the round-1
  "near-black quarter": bottom-left quarter (0,360,640,720) medL **74.2**, <L40 share **14.1%**
  (R1: near-black, textureless). Staging fixed. → movement credit: restaging + ships.
- **Sky: the marble is gone; the deck streaks still carry 3.3× the comparand's energy.** Round-1
  rect (620,10,1200,110): hf **6.52**, sd 21.5 (R1: 7.76/16.1) — but that rect now contains the
  obelisk edge, cables and rings, so it is not a sky measure this round. Clean sky (850,0,1150,55):
  hf **4.00** vs Odyssey sky (80,30,700,150) **1.22** (R1 ref: 1.33). The busiest streak region
  (240,20,420,120): **8.25** — authored cloud streaks now, not noise, but still dense fine-scale
  energy Odyssey's puffs do not have. skynoise's registered gates all passed (P1 excess 0.40 in
  band); further push needs a NEW registered target, not a re-litigation. → **SKY**, low priority.
- **The palette still loses the pair.** Stone is slate-blue with warm confined to raking planes —
  lit right-statue face (930,270,1100,420) warm share (R>B+10, L>40) **18.3%**. Same defect family
  as hero's missing warm half. → **SHADING**.

### dunes — WIN (Odyssey), narrow flip; sky improved at pair scale, residual class named
- Round-1 marbled zone (100,10,280,120): hf **4.34** (R1: 5.28). Top band (0,0,1280,50): 5.63.
  **Worst clean-sky band (760,0,1120,45): hf 8.05 vs ref sky (150,20,850,110) 0.55 — 14.6×, and
  the 1:1 crop shows the same fine liquid-streak class round 1 flagged.** At 560-px pair scale it
  no longer reads broken (hence the flip); at full-res it is measurably present. → **SKY** (new
  prereg; skynoise's own gates passed).
- **Round 1's "planes do not separate" does not reproduce and is retired as a luma claim.** Ours:
  pyramid (250,40,450,140) medL 155.9 vs sky (760,0,1120,45) 151.4 — ΔmedL **4.5** (R1: 9.5). But
  ref at my re-derived rects: bg dune vs sky ΔmedL **−3.2** (R1 quoted 21.4 at unstated rects) —
  the quantity is rect-fragile in BOTH frames. What actually separates both horizons is hue:
  ours pyr **30.7°** vs sky **242.7°**; ref dune **18.1°** vs sky **228.2°**. Ours now does the
  same chromatic separation the comparand does. No owner; finding closed.
- **Ink at distance is unchanged and now the shot's worst quantity.** Dark-line share (L<60) in the
  complex rect (300,140,900,420): **7.9%** (R1: 6.1%; ref towers 0.0%) — this round's rect includes
  Sly and the dead-tree branches (stated), but the pylon wireframe read at 200 m is the same
  §2.1-violating density. → **SHADING** (`Outline.js` distance falloff) — round-1 item, untouched.
- **The sphinx row renders teal.** (60,230,330,420): medHue **192.6°**, sat 0.39 — oxidized-copper
  green-blue against the sand story. If that is authored intent it is fighting the frame; if it is
  the cool-shadow grade landing on stone, it is the same §132.4 fill residual. → **TEXTURES** to
  answer intent, then SHADING if it is the light.

### interior — WIN (Odyssey), narrow flip on composition; the colour got WORSE, and the bloom
### smears got fixed
- **Walls off violet onto blue.** Left pier (60,80,320,400): medHue **225°**/sat 0.446 (R1:
  267°/0.455); right (1050,100,1250,500): **226°**/0.468 (R1: 268°/0.452), R−B −29/−33.
- **Warm share HALVED since round 1: 7.2% vs the comparand's 31.0%** (R>B+10, L>40, frame-wide;
  R1: 16.2% vs 31.0%). The violet-pair cooled the shadow register frame-wide and no warm
  restoration shipped — the warm/cool tension §7.2 names is now 4.3× against us, worse than round
  1's 1.9×. The flip happened on composition (three planes, shrine subject, sneak silhouette)
  DESPITE the palette. → **SHADING** (grade; banda decision) + **FX** (torch radius/energy —
  sconce pools still die within ~2 m).
- **The detached bloom smears are measured fixed.** Ceiling band (500,0,1280,200), warm-bright
  predicate (R>B+20, L>140): coverage **0.89%**, max blob width **36 px** (R1: 11.3% coverage,
  156 px blobs). A few small bokeh discs remain, anchored near sconces. **Honest win** for
  whoever landed it (not fxcluster — that did not ship; likely the washcap/bloom work already in
  tree). Residual → **FX**, cosmetic.
- **The treasure gold renders near-black blue.** Pile (780,415,960,465): medL **37.1**, medHue
  **240°**, 82.6% under L60 — the §158.5/§130.5 gold-renders-dark family in the canonical
  interior, with goldlobe REVERTED (no live candidate). → the **gold cluster** (SHADING `spec`
  assembly §136.3 / GEOMETRY per-recipe `metalAmount`), which currently has no open arm.

### night — LOSS (Odyssey), narrowed from decisive to clear
- **Sky: 21× → 6.7×.** Swirl band (750,0,1250,220) hf **4.98**; left band (80,130,350,240) 4.98
  (R1: 7.51) vs ref night sky (60,20,650,140) **0.74** (R1 quoted 0.36 at unstated rects). The
  swirl class is still visible at pair scale in the upper-right — it read as "oily" in the blind
  viewing before unmasking. → **SKY** (same new-prereg route as dunes).
- **Warm accents: 0.19% vs 2.45%** (R>B+15, L>60; R1: 0.14% vs 2.45%) — the doorway glows I
  credited in the blind read exist but are tiny; the palette flip still has one pole. The staged
  braziers/lit-windows item is round 1's, untouched. → **GEOMETRY** (staged night lights) + **FX**.
- **Sly is still darker than his own backdrop:** figure (655,395,785,485) medL **16.9** vs slabs
  **19.0** (R1: 18.5 vs 28.1) — negative contrast preserved; 10 warm px on him (R1: 12). The
  **moon+silhouette staging** (figure on the ridge against the full disc, top-left) is new and is
  the best beat in the frame — round 1's "put him against the moon pool" was answered for A
  figure, but the playable Sly is still in the dark. → **COORDINATOR** (staging) + **SHADING**
  (P-night is registered; do not free-lance a threshold here — §141).
- Sparkle check: 50 px inside the #8fd8ff tolerance, all in x238–427 y528–562 — moonlit stair-edge
  speculars, not FX. The sparkle language is still absent (fxcluster no-ship confirmed in frame).

### traversal — WIN (Sly 3), narrow-to-clear flip; attribution split
- **The swing reads.** Figure (525,195,715,365) medL 76.4 vs surround 69.5 (R1: 76.4 vs 66.5 —
  numerically similar contrast, but the pose now carries an arc: body curled under the ring, legs
  trailing, tail sweeping). **Attribution unresolved:** no rekey of `hook_swing` appears in the
  ledger since round 1 (§687 recorded it freezing at the arc bottom), so the improvement may be
  capture-phase rather than a shipped fix — do not bank it as done work without ANIMATION
  confirming. → **ANIMATION** to claim or disclaim.
- **Sparkle language: 0 px** within #8fd8ff tolerance, frame-wide (R1: 0). §2.1 item 6 is still
  unserved on the hook shot; fxcluster's sparkle leg is the designed-but-unshipped fix. → **FX**.
- The doorway light pool + columns remain the strongest rendered passage in the ten frames; the
  environment half of the round-1 split is intact and now the action half joined it.

### combat — LOSS (Thieves in Time), decisive, unchanged — and measured unchanged
- Pale figure mass (L>150, sat<0.30) in (360,390,720,670): **23,922 px at medL 203.8, medSat
  0.159**; blue pixels on the figure (hue 200–250, sat>0.35, L>60): **0** (R1: 27,382 px / 199.7 /
  0.165 / 21 blue px; TiT comparand figure re-measured this round: medL 52.8, medSat 0.47,
  matching R1's 51.2/0.49). The flash still turns Sly into a chalk outline; within measurement
  noise nothing moved, which is the correct result — fxcluster's flash leg did not ship. The lunge
  line itself is good ink. → **FX** (flash) + **SHADING** (tonemap interaction), via fxcluster's
  next registered attempt.
- The combo still hits air (no enemy in frame; the arc terminates on a plinth). → **COORDINATOR** /
  **GUARDS**.

### guard — LOSS (Sly 2), decisive, arguably degraded
- **I could not find the guard in the blind viewing.** At full res he resolves into a coppery mass
  with spears at (790,100,980,330): medL **18.6**, 78.5% under L30 — reading as an armour stand,
  not a character. Round-1 rect (852,220,990,700): medL **22.6**, 83.3% under L30, p99 141.9 (R1:
  18.2 / 66.9% / p99 83.6 — the p99 rise is the doorway light edge entering the rect). The bear
  comparand re-measures at medL **40.7**, 31.1% under L30 (R1: 42.9/29.4) — a 2004 PS2 render
  keeps its character 2.2× brighter than ours in the same night register. → **COORDINATOR**
  (staging: he is again on the dark side of his own light) + **FX** (fill) + **GUARDS** (pose/
  placement so he reads as a figure, not rack dressing).
- **The patrol cone still contributes nothing:** round-1 air column (700,300,850,500) medL
  **27.6** (R1: 27.0). The frame's light feature is the doorway pool (220,360,640,560 medL 113),
  which is set dressing, not the shot's named subject. fxcluster's cone leg is the designed fix.
  → **FX**.

---

## 4. The three highest-leverage gaps across the set

1. **The warm half of the palette never arrived, and it now decides all three Odyssey losses.**
   The violet-pair did exactly what it measured (hero beam 279°→232°, temple 287°→213°, interior
   walls 267°→225°) — and the frames went from violet-cool to teal-cool, not to warm/cool. Lit
   bible-sandstone is 0.75% of hero's beam; interior warm share FELL 16.2%→7.2% against a 31.0%
   comparand; night's warm pole is 0.19% vs 2.45%. `hero`, `courtyard`, `night` all lose on this
   single axis first. The registered vehicle exists (banda, scored, ship decision pending) plus
   round-1's staged-night-lights item. Owner: **SHADING** (+ coordinator's banda call). Until this
   ships, no amount of sky or staging work flips those three pairs.

2. **One FX cluster holds two decisive losses and blemishes a win.** Combat's flash (23,922 chalk
   px, 0 blue), guard's cone (air medL 27.6, guard at 18.6 vs the 2004 bear's 40.7), traversal's
   sparkles (0 px of the mandated language on the hook shot). All three were measured unchanged
   this round, which is exactly what the no-ship predicts. The candidate set exists
   (fxcluster) and needs its next registered attempt. Owner: **FX** (+ COORDINATOR for the
   missing combat opponent and guard staging).

3. **The residual sky-streak class on `dunes` and `night`.** Courtyard's clean sky landed at hf
   4.00 (3.3× ref, passable in the pair); dunes' worst band is **8.05 (14.6× ref)** and night's
   **4.98 (6.7× ref)**, and the class is visible at pair scale in night (it read "oily" blind).
   skynoise's registered gates all PASSED — this is a new, smaller target needing its own prereg,
   not a re-run. Owner: **SKY**. Cheapest of the three; worth doing only after (1), since night's
   pair is unwinnable on sky alone.

**Honest wins, so they are not re-litigated:** the closeup eye/mask fix is confirmed adversarially
(eye:face 0.126 in-canon; round-1's disqualifier dead); the courtyard restaging put the named
subject in frame and killed the black quarter; the interior bloom smears collapsed 11.3%→0.89%;
dunes' horizon now separates chromatically like the comparand's; the temple win held; the moon
silhouette beat in night is the best new staging in the set; and the scoreboard moved 1–9 → 5–5
with every flip traceable to a named ship (or, for traversal's pose, flagged as unattributed).

## 5. Files this review produced

- This report: `/home/user/Demo/progress/records/CRITIC-sbs2.md` — the ONLY repo file written
  (no `src/**` touched, no git run; coordinator sweeps).
- Scratchpad only (never committed, §1.1 rule 3):
  `ref/` (9 comparand images, same pinned routes as round 1), `sbs/` (10 composites +
  `mapping.json`), `compose_sbs.py`, `measure.py`, `measure2.json`, `chk_tail.png`,
  `chk_dunessky.png`.

**STATUS: COMPLETE.**
