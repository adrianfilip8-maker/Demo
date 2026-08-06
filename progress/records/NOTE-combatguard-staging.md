# NOTE-combatguard-staging — CRITIC-sbs3 gaps #2 and #3, diagnosed from source and the committed frames

**Scope.** The two content/framing items the coordinator holds out of CRITIC-sbs3 §4: (#2) combat's
combo hits air, and (#3) guard's never-named top defect, the near-black glossy wedge. OFFLINE:
no `src/**` edits, no captures, no git, no lock. Everything below is measured from the **committed**
`progress/records/sbs3/*.png` (report.json `at` 2026-08-06T02:49:21Z, commit `167c508` dirty) and from
source read at `378975d`.

**Instrument calibration first (§13, §141.1 — "run a control first").** Before anything new, my
scorer was pointed at CRITIC-sbs3's own published numbers on the same PNGs:

| quantity | CRITIC-sbs3 | this note | verdict |
|---|---|---|---|
| combat figure box (360,390,720,670) medL | 119.98 | **119.98** | exact |
| …medSat | 0.435 | **0.435** | exact |
| …chalk (L>150, sat<0.30) | 9,122 px / 9.05% | **9,128 px / 9.06%** | 6 px (0.07%) |
| …blue px (hue 200–250, sat>0.35, L>60) | 22 | **22** | exact |
| flash core (300,280,520,400) median RGB | [178,120,87] | **[178,120,87]** | exact |
| …medL / mean R−B | 129.8 / +88.2 | **129.8 / +88.2** | exact |
| frame L>200/sat<0.15 | 131 px | **131 px** | exact |
| guard mass (790,100,980,330) medL | 18.64 | **18.64** | exact |
| guard R1 rect (852,220,990,700) medL / <L30 | 22.61 / 83.32% | **22.61 / 83.3%** | exact |
| doorway pool (220,360,640,560) medL | 113.46 | **113.46** | exact |

Nine of ten exact, one 0.07% apart. Every number below is from the same scorer.

Projection is done with a Python re-implementation of THREE's `lookAt` + perspective, validated
against a number this repo published independently: `Shots.js`'s guard header states the west
colossus plinth's SW top corner projects at **px (1022, 338), d = 2.9 m**. My projector puts
(−13.5, 2.0, 28.5) at **px (1022.5, 338.5), d = 2.90 m**. Sub-pixel agreement with a figure I did
not derive, so the projector is trusted for everything that follows.

---

## 1. combat — what would put a recipient in the frame

### 1.1 What the arc terminates on now: nothing, by construction

The impact is not aimed at anything. `src/fx/Particles.js` `_stageShot()` (the `name === 'combat'`
branch) hardcodes the anchor as a fixed offset from the player:

```
_v3.copy(mv.position); _v3.y += 1.28;          // (0, 1.28, 28.0)
_dir.set(0.30, 0.10, 0.95).normalize();        // (0.29963, 0.09988, 0.94879)
_v3.addScaledVector(_dir, 1.05);
this._onCaneHit(3, _v3, _dir);                 // cane_flash / cane_ring / cane_spark / cane_debris
this.decal('crack', <same x,z, y = 0.02>, UP, { size: 2.6, life: 30, alpha: 0.7 });
```

So the impact anchor is **world (0.3146, 1.3849, 28.9963)** — 1.05 m from Sly's chest along a
constant direction. There is no target lookup, no guard query, no raycast. `_onCaneHit` takes a
position and emits four bursts at it. **Nothing in the code path can put a recipient there; nothing
in the level is there.** CRITIC-sbs1 §3 called this "the arc terminates on air beside a wall" and
sbs2 called it "terminates on a plinth"; the source says it terminates on a *coordinate*.

Projected through the shipped `combat` camera (pos [4.6, 2.35, 31.4], target [−0.6, 1.5, 27.0],
fov 40) at 1280×720:

| feature | world | px | depth |
|---|---|---|---|
| Sly feet | (0, 0, 28.0) | (578, 630) | 5.95 |
| Sly chest | (0, 1.28, 28.0) | (576, 421) | 5.80 |
| Sly head | (0, 1.75, 28.0) | (575, 341) | 5.74 |
| **impact anchor / `cane_flash`** | **(0.3146, 1.3849, 28.9963)** | **(452, 433)** | **4.91** |
| crack decal (ground under it) | (0.3146, 0.02, 28.996) | (458, 694) | 5.08 |

The carnelian starburst in `sbs3/combat.png` sits centred at ≈ (430, 400); CRITIC's flash-core rect
is (300,280,520,400). The projection lands inside both. **The impact projects at px (452, 433),
0.89 m NEARER the lens than Sly's own chest** — it is a flash in mid-air between the character and
the camera.

### 1.2 There IS a mechanism, it is one data key, and it lands 21.6 cm from the anchor

`src/ai/Guard.js` already has the whole apparatus:

- `applyShot()` (`src/core/Shots.js:463`) emits `engine.emit('shot', { name, shot })`.
- `Guard.js:1399` `on('shot', (p) => this._poseForShot(p?.name || null))`.
- `_poseForShot` (`Guard.js:1718`) looks the name up in **`SHOT_POSE`** (`Guard.js:152`), which today
  contains exactly one key: `guard`. Any name not in it unfreezes every guard and returns.
- `_solveShotPose` (`Guard.js:1765`) does the placement: it walks `d` from `minDist` to `maxDist` in
  0.5 m steps along the **live lens axis**, offsets laterally by `−side · 0.34 · d · tan(fov/2) · aspect`,
  ground-probes, requires line of sight, and scores `fill·1.6 − centre·1.1`.

I re-implemented that loop exactly and ran it against the shipped `combat` camera with
`screenSide: +1`:

- Feasible depths: `d = 4.5` is **rejected** (feet at ndc −1.095, past the −0.96 gate). The first
  accepted step is **d = 5.0**, and because `score` falls monotonically with `d` from there, **d = 5.0
  wins**.
- The stand it returns is **(0.102, 0, 29.035)**.
- The impact anchor's ground point is **(0.315, 0, 28.996)**.
- **Horizontal distance: 0.216 m.**

A `temple`-type guard has `TUNE.headTop.temple = 1.95` and a body radius of roughly 0.35 m. The
impact anchor sits at **y = 1.385 m — his upper chest — and 0.216 m off his axis, i.e. inside his
body volume.** The flash already goes off inside the place the existing, unmodified solver puts a
guard. This is not a coincidence: both quantities are "about a body-length in front of the lens, a
third of the way off centre", which is what `_stageShot`'s 1.05 m offset and `_solveShotPose`'s
0.34 lateral fraction independently encode.

Screen box of that recipient (0.9 m shoulder width, 1.95 m tall, at d 4.97–5.21):

| | px | ndc_x |
|---|---|---|
| feet | (431, 686) | −0.326 |
| chest | (425, 448) | −0.336 |
| head | (421, 317) | −0.342 |
| approx. silhouette box | **x 332…510, y 287…702** | |

CRITIC's flash-core rect is (300,280,520,400). **The recipient's head and shoulders would occupy the
flash core.** That is exactly "the combo lands on a guard" — and it is also a measurement hazard
(§3.3 below).

The mirror (`screenSide: −1`) puts him at (1.523, 0, 27.355) — **2.038 m** from the anchor, on the
wrong side. So the sign matters and the correct value is **`screenSide: +1`**.

### 1.3 Routing: this is GUARDS', not the coordinator's

The change is a new key in `SHOT_POSE`, which lives in `src/ai/Guard.js` — **agent: GUARDS** per
`AGENTS.md` §3. `src/core/Shots.js` is `[LOCKED]`/coordinator, and it has no field that can place a
guard: `applyShot` passes only `{ name, shot }`, and `_poseForShot` reads only `name`. There is no
coordinator-side edit that puts a body in the combat frame. **Routing #2's staging half to GUARDS,
with the spec below.** (#2's other half — Sly reads brown, 22 blue px — is FX + SHADING and is
untouched by any of this; see §3.3.)

**Spec handed to GUARDS (measured, not guessed):**

```
combat: {
  index: <not 0 — see the hazard below>, clip: <a reaction clip>, t: <…>,
  towardCamera: <…>, screenSide: +1,        // +1 is load-bearing: −1 misses by 2.04 m
  minDist: 4.5, maxDist: 17,                 // shipped defaults already select d = 5.0
}
```

`GuardAnim.js` `CLIPS` offers `idle, idle_bored, look_around, suspicious, alert, walk_patrol,
walk_alert, run_chase, attack, stunned, ko, pickpocketed_reaction`. `stunned` or `ko` is the
recipient read; `look_around` (what `guard` uses) would stage a bystander, not a hit.

**Three findings GUARDS should have with it:**

1. **`spec.x`, `spec.z`, `spec.yaw` in `SHOT_POSE.guard` are dead fields.** The header says
   "`x`/`z` are only the fallback for when COLLISION isn't up", but `grep 'spec\.'` over `Guard.js`
   returns only `index, look, clip, t, screenSide, minDist, maxDist, towardCamera`. There is no
   fallback. If `_solveShotPose` returns false, `_poseForShot` **ignores the return value** and
   freezes the guard wherever his patrol left him — which is the "the guard has never been in shot"
   failure mode `Shots.js`'s own header records.
2. **`_poseForShot` mutates `g.position` and never restores it, and the combat stand is 0.97 m from
   the player spawn.** Shots staged after `combat` in the same boot get `unfreeze()` and the guard
   resumes patrol *from the teleported position*. The combat stand (0.102, 0, 29.035) is **0.97 m
   from (0, 0, 30)** — the spawn that `sly-closeup`, `sly-profile` and `sly-key` all stage on, and
   that `courtyard`/`hero` look toward. The settle is 17 steps (≈0.28 s), so he will still be there.
   `guard`'s stand (−15.5, 27.5) never had this problem; combat's does. **Any combat SHOT_POSE ship
   needs a null on the other shots in the same boot** (§122.3: "was the subject even in the frame?"
   — here, the reverse).
3. **The recipient at the default stand occludes part of Sly.** He is nearer (d 4.97–5.21) than Sly
   (5.74–5.95). Sly's ink outline (L<45) in `sbs3/combat.png` reaches leftward to **x 392–431 in
   rows 560–690** (cane hook and tail). The recipient's box is x 332…510, so it would cover
   **x 392…510 of Sly's cane-hook/lower-left silhouette**. Not fatal — a fight has overlap — but it
   is a composition cost, it is measurable, and GUARDS should choose between it and a farther stand
   (d 6.5 puts him 1.6 m off the anchor and the flash stops landing on him). Both numbers are here so
   the trade is made on evidence.

---

## 2. guard — naming the wedge

CRITIC-sbs3 §3.11: "a large near-black glossy wedge occupies roughly the lower-right third of the
frame and buries the subject behind it… no round has named it." Named below, with its rect, its
luma, and the source line that builds it.

### 2.1 Measured: rect and luma

Traced from the committed `sbs3/guard.png` (1280×720). The mass's top silhouette is a straight edge
fitting **y = 315 − 0.0743·(x − 700)** for x ∈ [700, 1279] (y 315 at the left corner, 272 at the
right edge), with a small step at x ≈ 1040.

| region | px | share of frame | medL | <L30 | median RGB | >L120 | >L180 |
|---|---|---|---|---|---|---|---|
| strict (below the arris, x ≥ 700) | 247,087 | **26.81%** | **21.83** | 87.2% | 9 / 23 / 43 | — | — |
| flood, dark(L<72) & cool(B−R>+12), seeded inside | 270,459 | **29.35%** | **20.40** | 91.3% | 9 / 22 / 42 | 2.09% | **0** |
| …of which x ≥ 640 | 238,725 | 25.90% | | | | | |
| lower-right quadrant (x≥640, y≥360) | — | 22.11% of frame | 21.04 | | | | |

bbox of the flood mask: **(364, 271, 1279, 719)**. 89.6% of the lower-right quadrant is inside it.
"Roughly the lower-right third" is a fair description; the measured share is **26–29% of the frame**.
"Near-black glossy" is exact: median RGB (9, 22, 42), **zero pixels above L180**, and 2.09% above
L120 — a handful of hard specular streaks on an otherwise near-black mass.

### 2.2 Named: it is the WEST colossus plinth's gilded cavetto cornice

Unprojecting the traced arris onto the **y = 2.00** plane returns a constant world x across the whole
span — which is the signature of a vertical face capped at that height:

| px on the arris | world (x, z) on y = 2.00 | dist |
|---|---|---|
| (700, 315.0) | (**−14.118**, 29.120) | 3.02 m |
| (850, 303.9) | (**−14.081**, 28.626) | 3.25 m |
| (1000, ~296) | (−14.05, 28.27) | 3.45 m |
| (1150, 281.6) | (**−13.991**, 27.456) | 3.98 m |
| (1279, 272.0) | (**−13.945**, 26.859) | 4.43 m |

**x = −14.03 ± 0.09 over a 580 px span.** Now the source, `src/world/EgyptLevel.js:461–462`:

```
const plCor = K.cornice({ w: 8.0 - 2*0.04*1.4, d: 7.0 - 2*0.04*1.4, h: 0.12, roll: 0.26, flare: 0.34 });
A.add('court', 'hieroglyph_gilded', K.place(plCor.geo, { x: cx, y: L.colossi.plinth - plCor.height, z: cz }));
```

with `cx = −9.5`, `cz = 25`, `L.colossi.plinth = 2.0`. `Kit.corniceProfile` (`Kit.js:1137`) ends with
`p.push([flare + 0.22, top + 0.34])` — the fillet slab, drafted back in, at the profile's top. So the
outer edge of the piece **at world y = 2.00 exactly** is at half-width `w/2 + flare + 0.22 =
3.944 + 0.56 = 4.504` → **world x = −9.5 − 4.504 = −14.004**.

**Measured −14.03 ± 0.09 against a source-derived −14.004: agreement to 3 cm.** The wedge is named:

> **The near-black glossy wedge is the cavetto cornice ring of the WEST colossus plinth —
> `src/world/EgyptLevel.js:462`, material `hieroglyph_gilded`, built by
> `Kit.cornice({ w: 7.888, d: 6.888, h: 0.12, roll: 0.26, flare: 0.34 })` at (−9.5, 1.02…2.00, 25).
> The straight edge that cuts the frame is its west fillet arris at world y = 2.000, x = −14.004,
> 3.0–4.4 m from the lens. The mass below it is that cornice's flare and roll faces, the plinth's
> `sandstone_block` masonry shell behind them, and unlit courtyard floor beyond.**

Two corroborations that this is not a coincidence:
- **"Glossy" is the gild.** `hieroglyph_gilded` at `tod 0.10` under a cool key is exactly the
  gold-renders-near-black family already on the books (`NOTE-gildguard-void.md`; TEXTURES' "guard
  gilded medL 17.2"). Zero pixels above L180 with 2.09% above L120 is a metal with nothing to
  reflect.
- **`Shots.js`'s own guard header has been circling this piece for two revisions** — the "bright cyan
  contact line", the "blank lower 60%", the 239–265 px "exposed up-facing deck band", the reverted
  +2.0 m lift (`b81747d`, eye inside the throne) — and `Kit.js:1127` records `roll: 0.13 → 0.26` on
  *this exact cornice* as "a gilded wire, 2 m from the `guard` camera". Every one of those is this
  object. **What no round said is that it eats a quarter of the frame and 86% of the subject.**

### 2.3 The number CRITIC never had: the wedge hides 83–86% of the guard

`_solveShotPose` re-run against the shipped guard camera (pos [−11.5, 2.6, 30.5], target
[−17.0, 1.1, 28.0], fov 38, `screenSide: −1`) selects **d = 5.0** and the stand **(−15.49, 0, 27.54)**,
projecting **feet px (844, 625), head px (864, 244)** — a 381 px figure. The arris crosses that
column at **py ≈ 298–310**.

Four independent methods, one answer:

| method | visible share of the figure |
|---|---|
| arris line vs projected figure span (244→625, cut at 310) | 17.4% |
| ray-cast box model of the plinth group, figure as a 0.9 m slab | 16.1% |
| ray-cast along the figure's central axis, 0.025 m steps | **15.2%** (lowest visible world y = **1.675 m of 1.95 m**) |
| pixel predicate: figure column (820,244,900,625) not near-black-cool | 15.9% |

**The plinth cuts the guard at world y = 1.675 m — the top of his nemes. 86% of him is behind it.**
The two heads and crossed spears visible in the frame (at ×3.2 brightness they resolve clearly at
image x 790–975, y 150–298) stop dead on one straight horizontal line, which is the arris.

### 2.4 The corollary that reframes gap #3: 18.64 is a rect statistic, not the guard

Three rounds have quoted "guard mass medL **18.64**, 78.48% under L30" against a 2004 bear at
**32.57–40.7** and concluded the guard is under-lit. Splitting that rect by hue (§128.2's
denominator hazard — count what is actually in the ROI before quoting a share):

| region (775,140,995,300) — where the guard actually is | px | share | medL | p90 |
|---|---|---|---|---|
| all | 35,200 | 100% | 18.95 | — |
| **warm (B−R < 2) — guard body, armour, spear** | **6,761** | **19.2%** | **38.33** | 88.32 |
| cool (B−R ≥ 2) — the doorway void behind him | 28,439 | 80.8% | 16.81 | — |

Tight rects on the two heads: left jackal head (790,230,860,300) warm medL **34.63**; right guard
(900,150,975,300) warm medL **33.56**; both-heads band warm medL **34.50**.

**The guard's own rendered pixels read medL 33.6–38.3 — inside the comparand's 32.57–40.7 band.**
The 18.64 is 80.8% doorway void and plinth. The three-round story "our guard is 2× darker than a
PS2 bear" is, at minimum, half a framing artefact: he is not mostly dark, he is mostly *hidden*, and
the rect drawn around him is measuring the thing hiding him. That does not retire the fill/cone work
(FX still owns a patrol cone contributing air at medL 27.59, and p90 88 is thin) — but it moves the
binding constraint from LIGHTING to FRAMING, which is what CRITIC's own routing said and what the
numbers now support.

---

## 3. Framing options for `guard`, each with its measured cost

Model: the plinth group as four AABBs — cornice (x −14.084…−4.916, y 1.02…2.00, z 20.416…29.584),
masonry shell (±4.1, y 0…2.0, ±3.6), throne seat (±3.4, y 2.0…4.5, z 22.0…27.6), throne back
(±3.2, y 4.5…9.6, z 22.0…23.8). Rays cast per screen sample; the guard re-solved from the *moved*
camera each time, because `_solveShotPose` reads the live camera — so the subject follows the lens
and no option strands him. Baseline row confirms the model: occluder **33.1%** of frame (against
26.8–29.4% measured in pixels — the boxes are convex and 8 cm wider than the built profile, so the
model is deliberately conservative), figure **15.2%** visible.

| option | occluder % frame | figure visible | lowest visible world y | feet/head px | stand→brazier | verdict |
|---|---|---|---|---|---|---|
| **shipped** | 33.1 | 15.2% | 1.675 | 625 / 244 | 6.2 m | baseline |
| **A. camera translate WEST 1.75 m** (pos & target x −1.75) | **3.4** | **100%** | **0.000** | **625 / 244** | 5.8 m | **recommended** |
| A′. west 1.50 m | 8.8 | axis 100%, worst lateral axis 0.475 | 0.475 | 625 / 244 | 5.8 m | feet still clipped |
| A″. west 1.60 m | 6.6 | 100% | 0.000 | 625 / 244 | 5.8 m | threshold, zero margin |
| A‴. west ≥ 2.0 m | **0.0** | 100% | 0.000 | 625 / 244 | 5.7 m | plinth leaves frame entirely — trips §7.3 "no dark foreground framing element" |
| B. raise the eye +1.2 m (pitch held) | 6.5 | 93.4% | — | 646 / 384 | 4.9 m | subject shrinks (402→262 px), pitch/composition change |
| C. dolly SOUTH +2 m | 6.8 | 100% | 0.000 | 625 / 244 | 8.1 m | **DISQUALIFIED**: z 32.5 is inside the west entry pylon (x −19.5…−8.5, z 31…37) — the `b81747d` throne defect again |
| D. swing the aim south (target z 32) | 0.0 | 100% | 0.000 | 662 / 246 | 9.1 m | subject 1.9 m further from his only light; whole composition replaced |
| E. `screenSide: −1 → +1` (GUARDS, no camera change) | 33.1 (unchanged) | 100% | 0.000 | 625 / 244 | 7.7 m | works, but the wedge still eats 27% of frame and he moves *away* from the brazier |
| F. remove / shrink / relight the cornice | — | — | — | — | — | ARCHITECTURE / TEXTURES; see below |

**Why A (translate west) is the one to seal.** `_solveShotPose` computes the stand as
`camPos + dir·d + right·lateral`. Translating `pos` **and** `target` by the same vector leaves `dir`,
`right`, `fov`, `tod` and `d` untouched, so the stand translates identically and **the subject's
projected pixels are unchanged: feet (844, 625), head (864, 244), 381 px tall, same ndc.** The only
thing that changes is what is in front of and behind him. The occluder threshold is measured, not
assumed: the worst lateral axis of the figure clears at **west 1.60 m**; 1.75 m buys 0.15 m of
margin and still leaves a **3.4%** dark corner at bbox (1038, 558)–(1278, 718) so §7.3's
"dark foreground framing element" checkbox keeps a tenant. Pylon clearance is *unchanged* by a
pure-x move (camera stays at z 30.5, 0.5 m north of the pylon footprint). Cost: the west peristyle
(x = ±23) comes 1.75 m nearer, so the frame's left-hand background grows ~15–20%. That is the whole
cost, and it is declared.

**Why F is not mine, and probably not anyone's yet.** The cornice is a fix to a *previous* defect
(`Kit.js:1127`: `roll 0.13 → 0.26` because a 6.2 cm gilded crest was the "bright cyan contact line").
Shrinking it re-opens that. Deleting it contradicts `Shots.js`'s own "the plinth itself is an §8.1
contract surface and is correct". The honest F is **relighting**, i.e. `hieroglyph_gilded` reading
above L30 at night — which is the standing gold-renders-dark family (TEXTURES/SHADING,
`NOTE-gildguard-void.md`, `uGoldGlint` committed at zero gain). Worth doing; not a framing fix, not
on this seal, and it does not unbury the subject even if it lands.

**Owner check.** `src/core/Shots.js` is `[LOCKED]` — the lead's, i.e. the coordinator's. Option A is
therefore coordinator-owned and sealable here. Option E is `src/ai/Guard.js` → GUARDS. Option F is
`src/world/EgyptLevel.js` → ARCHITECTURE, or the material → TEXTURES/SHADING.

### 3.1 One structural finding GUARDS should have regardless of which option ships

`_solveShotPose` picks the subject's stand with **a scorer that has no luminance term** (`fill·1.6 −
centre·1.1`) and **a single occlusion ray to chest height** (`gp.y + height·0.55`). Both defects are
visible in the shipped frame: the chest ray clears the arris (the arris cuts at 1.675 m, above
chest) so the stand is accepted while 86% of him is hidden; and nothing in the score ever asked
whether he was lit, which is why three rounds have written "he is again on the dark side of his own
light". **A camera nudge treats the symptom; a feet-and-head occlusion test plus any luminance term
in the score treats the cause, and it is GUARDS' file.** Routed, with evidence.

### 3.2 Combat and guard do NOT share a mechanism

They share a *module* (`_solveShotPose`), but the edits land in different files with different
owners: combat needs a `SHOT_POSE` key in `src/ai/Guard.js` (**GUARDS**); guard needs two vectors in
`src/core/Shots.js` (**COORDINATOR**). `PREREG-staging1.md` therefore seals **guard only**. The
combat spec is handed over in §1.3 above and is not sealed here — sealing over another owner's file
is the failure mode this note is supposed to avoid.

### 3.3 What a combat recipient would do to CRITIC's rects (hand this to whoever ships it)

The recipient's head and torso land inside CRITIC's flash-core rect (300,280,520,400) and overlap
the figure box (360,390,720,670). Measured on today's frame, the pixels a recipient would replace:

- proposed recipient box (332,287,510,702) today: medL **134.47**, medSat **0.497**, chalk 8.71%
- head/torso sub-box (350,300,500,470) today: medL **138.88**, medSat 0.468, chalk 5.30%

So the recipient replaces mid-bright warm glow with a guard body. **CRITIC's chalk count on
(360,390,720,670) will move for a reason that has nothing to do with the flash**, and the figure box
will contain two characters. Anyone shipping this must say so in the seal, or round 4's chalk
number will be read as an FX result. Sly's own blue-pixel count (22) is untouched by a recipient —
that is FX + SHADING and belongs in a different vehicle.

---

## 4. Files this note produced

- `/home/user/Demo/progress/records/NOTE-combatguard-staging.md` (this file)
- `/home/user/Demo/progress/records/PREREG-staging1.md` (the seal for the guard camera)

Scratchpad only, never committed (§1.1 / §162), under
`/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/`:
`proj.py` (projector + solver replication), `unproj.py` (arris → world plane), `search2.py` /
`search3.py` (occluder ray-cast + camera sweeps), `m1–m11.py` (pixel measurement), `grid1.png`,
`guard-figure-bright.png`, `wedgemask.png`.

No `src/**` touched. No captures. No git. No lock tickets.
