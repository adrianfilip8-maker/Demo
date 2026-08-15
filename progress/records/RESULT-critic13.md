# RESULT-critic13 — blind round 13: REJECT, mean 3.94/16 (r12: 3.97) — and the round's real value is that it REFUTES §326 and corrects four standing declarations by measurement

Blind critic (`tools/CRITIC.md` verbatim, `shots/r13/` 16 frames + 16 crops + manifest, **no
changelog**). Capture pid 3214, manifest `commit.sha de3080d`, `consoleErrors: []`. The critic
states it measured with `pngjs` probes rather than eyeballing the claims it was unsure about,
and it names its probe scripts. Scores verbatim:

```
temple 6 · courtyard 6 · sly-profile 6 · hero 5 · night 5 · sly-startle 5 ·
sly-closeup 4 · traversal 4 · sly-key 4 · kaykit 3 · dunes 3 · interior 3 ·
sly-perch 3 · combat 2 · guard 2 · sly-arm 2            mean 3.94 — REJECT
```

Its own summary line: *"Sixteen shots, mean around 4. Two shots (`sly-profile`, `courtyard`,
`temple`) touch 6; five sit at 2–3. Nothing is near the 8 floor."* (It writes "two" and lists
three; quoted as written.)

Round delta is **−0.03**, i.e. nothing. Per-shot movement is much larger than the mean:
courtyard +1.5, night +1.5, sly-profile +1 · interior −1.5, sly-arm −1.5, combat −1.5, kaykit −1,
dunes −1, sly-key −1. **`night` has now scored 6 (r11), 3.5 (r12) and 5 (r13)** on a mechanism
history that contains exactly one pure shadow *lift*. Three honest blind raters, ±1.25 on one
shot. §313's calibration finding gets its third data point: **the average is not the instrument;
the family list is.**

---

## 1. The two registered questions, answered

These were sealed into the check-in chain before the report existed. Both are answered against
the report, and the first one produced a finding that outranks the round.

### Q1 (§326) — did the critic rank the action-shot bleach on traversal/combat?

**YES — it is the critic's #1 ranked problem**, and it names the same shots:

> *"The character's albedo collapses into the environment bounce. … cap/shirt hold 210–216° at
> sat 0.54–0.79 in `hero`/`sly-startle`/`sly-profile`/`sly-key`/`sly-closeup`, but land at
> **307°/0.24** (`sly-perch`), **276°/0.28** (`sly-arm`) and **29°/0.23** (`traversal` shirt —
> the blue renders orange). … the one defect that makes the build look like it is not about
> Sly Cooper."*

Per the registered rule that makes it a **re-derive on current frames, never the r12
calibration**. But following that instruction turned up something better, and it reverses §326.

### Q2 (§310) — did the critic claim a §1 budget breach?

**NO, and it went further than the brief required.** Verbatim:

> *"**Budget is not breached.** `node tools/budgetattrib.mjs`: worst main-view **85 draws (34% of
> 250)** and **0.644 M triangles (54% of 1.2 M)**; whole level 0.644 M with culling off.
> Consistent with `progress/records/NOTE-budgetattrib.md`. I did not score the manifest's
> `drawCalls`/`triangles`, which are the all-passes submission counter."*

**The brief fix (09808c1) TOOK.** The critic did not merely omit the false metric — it ran the
attribution tool itself, reproduced 85 draws / 0.644 M tris independently, and stated *why* the
manifest counter is not the right number. Three consecutive rounds had reported a phantom 2.1×
breach and taxed ARCHITECTURE/PROPS/TERRAIN for it. That class is closed at the source.

---

## 2. §326 IS REFUTED, and the correction is mine

§326 read lithold's `BG` VOID as *"the action-shot bleach is NOT PRESENT on this tree"* and
floated two causes, leading with *"the two lighting ships landed between the r12 capture and this
run"*. It then drew the lesson that frame-derived calibrations must be re-derived against the
current tree.

**That reading is wrong.** Q1 forced the check, and the check is unambiguous. Running lithold's
**own statistic** (mean HSV S over the bright half of its **own registered rect**) on both
captures — identical code path, identical pixel boxes, so the comparison cannot be a sampling
artifact:

```
shot          | lithold1 off-arm (14th 21:50) | shots/r13 (15th 01:02) | r12 calibration
--------------|-------------------------------|------------------------|----------------
traversal     | S 0.678  hue 214.5  L  97     | S 0.205  hue 223.3 L136|  0.205
combat        | S 0.486  hue 218.8  L 111     | S 0.080  hue 353.6 L188|  0.080
sly-key (ctl) | S 0.516  hue 205.4  L 164     | S 0.516  hue 205.4 L164|  0.516
sly-closeup   | S 0.453  hue 205.3  L 173     | S 0.460  hue 206.7 L171|      —
```

Three facts follow, and each kills a piece of §326:

1. **The r13 roster capture reproduces the r12 calibration to three decimal places** — traversal
   0.205 → 0.205, combat 0.080 → 0.080, control 0.516 → 0.516. The defect did not go anywhere,
   is not drifting, and the seal's bars were **correctly aimed**.
2. **The ships are in both captures.** `0525d5e` (goldenrake + nightfloor) landed 2026-08-13
   22:51; lithold1 captured 08-14 21:50 and r13 captured 08-15 01:02, `de3080d`. Every `src`
   commit in between is an **inert** mechanism (`fxink2` 7a06bf1, `guardpass` cef6a5b) plus a
   props dedupe (`basketvary` 11b852c) — nothing on the character-colour path. **§326's leading
   cause is refuted:** if a ship had fixed the bleach, r13 would be blue too. It measures 0.205.
3. **The registered rect really is on Sly.** I did not take this on faith: under the seal's own
   PROT-ENV contract the `ko` arm may only alter pixels inside the vSlySkin mask, so off-vs-ko
   differing pixels *are* subject pixels by construction. Inside the registered rect,
   **79.1%** of traversal's pixels and **91.7%** of combat's change under `ko`. The statistic was
   measuring the costume, in both captures.

**So `BG` did not catch a tree drift. It caught the seal's own RUNNER staging the character out
of the defect.** In lithold's deterministic staging the costume sits at S 0.678 / hue 214.5° —
canonically blue, and 39 L *darker* than r13's washed-out 0.205 at L 136. That is §312's additive
model showing its face: an achromatic add raises L and destroys S, and the lithold staging simply
puts the character outside its reach.

**The lesson §326 recorded was therefore also wrong** — the calibration was never the problem. The
correct rule, which is the one that would have caught this before a two-hour lock hold:

> **A seal's runner must be proven to REPRODUCE the defect before its bars are sealed.** Measure
> the defect statistic on the runner's own `off` arm as a pre-flight, and register that number
> beside the calibration. A staging gate discovered post-hoc costs a whole run; the same gate run
> as a pre-flight costs one boot.

§326's `BG` gate still deserves its credit — it refused to adjudicate a candidate against a frame
that did not contain the defect, which is exactly what a staging gate is for. It reported the
right VOID for the wrong stated reason, and I wrote the wrong reason.

**Consequence for the successor:** the §277/§312 item is **live, reproducible and correctly
calibrated**. It does not need re-derivation on new frames — r13 just re-derived it for free
(0.205 / 0.080, unchanged). It needs a runner that stages traversal and combat the way the roster
does, and it aims at the **additive** legs per §312, now with a measured target: traversal must
come from S 0.205 back toward the 0.54–0.79 the critic measures on the five close-up shots.

---

## 3. The critic's three ranked problems, routed

Waivers applied **AT ROUTING ONLY** — the critic was blind to both, its scores stand unadjusted,
and both waived items remain on the record as measured defects.

**1. Character albedo collapses into environment bounce** — traversal 29°/0.23, sly-perch
307°/0.24, sly-arm 276°/0.28 vs canonical 214°/0.54–0.79. Critic routes **LIGHTING** (*"the
ambient/bounce term is additive and unclamped against albedo"*), **SHADING** second.
→ **This is §277/§312/§326's item, now with three shots instead of two.** Not waived: the critic
attributes it to colour, not sculpt, so §294 does not touch it. Successor per §2 above.

**2. No fresnel rim — what reads as rim is the key's own highlight.** *"8 of 13 measured
silhouette edges show no spike, and all 5 that do are on the key-facing side."* Worst: `night`,
Sly interior L 20 against background L 29. → **SHADING** (rim term not view-dependent) +
**LIGHTING** (rim azimuth). This is a clean, falsifiable, mechanism-level claim — the shadow-side
silhouette never separates — and it is the strongest *new* lead in the round.

**3. Three shots fail their own §7.2 purpose.** `interior` proves volumetrics, has zero cones
under four sconces; `guard` proves a patrol cone and has none; `combat` is an impact frame with
**no enemy in it** (*"the impact starburst fires into empty air, left of and behind him"*).
→ **POSTFX** (interior volumetrics), **GUARDS** (cone — **explicitly NOT covered by §309**, which
parks the guard *model* only), **FX**/`Trails.js` + **GUARDS** (combat trail and staging an enemy
into frame). The guard shot's *unlined mannequin* is §309-waived at routing; **its missing cone
is not, and it is the reason the shot scores 2.**

### Secondary, with the critic's own owners

- Flat untextured surfaces — grain **0.60** (combat pink block) / **0.90** (combat right wall) /
  **0.66** (guard pale wall) against 1.6–10.0 everywhere else → **TEXTURES** + **ARCHITECTURE**.
- Empty sky — dunes 27 L range / 0.63 grain, night 19 L / 0.62 → **SKY**.
- Straight dune crest (21 px of drift over 440 px) and salmon sand `#e6845e` vs bible SANDSTONE
  `#e6b878` → **TERRAIN**. Critic calls dunes *"the widest gap in the set"*.
- Gold reads as bone or grey everywhere — cane sat 0.31 with a +125 L spec on a mud-brown
  diffuse; **interior's treasure specular peaks are BLUE-GREY** (`#77979c`, `#83acb9`); hook
  rings `#828fa6` → **SHADING**/**TEXTURES**, **PROPS** (rings), **CHARACTER** (cane).
  The blue-grey spec peak on treasure is a mechanism claim: specular is taking the source colour
  and is not being tinted by metal albedo.
- **Cane ungripped in four shots** — manifest shows `sly-cane.glb` socketed to `handR`, grip
  22.2 mm, but *"the pose clasps both hands at the belly while the cane passes behind them"* →
  **ANIMATION** + **CHARACTER**. Not sculpt; §294 does not cover it.
- **Glove-relaxation claw artifact** on sly-perch — *"two clusters of long dark claw-like spikes
  hang below the gloves"*, critic names the likely cause from the manifest: `relaxed 6070 glove
  vertices, max move 17.8`. → **CHARACTER**, a pipeline bug, not a sculpt opinion.
- Cyan-brightened edge detect in `guard` — §2.1.2 permits only `#1a1210`/`#161022` → **POSTFX**.
- Guard-shot vase ramps 158→138→120 with ~25 px transitions on an 80 px form vs §2.1's
  smoothstep ≈0.03 → **SHADING**. On a *prop*, so §309 does not cover it.
- temple's shafts *"cross the near-left column at identical intensity and angle"* → reads as a
  screen-space overlay, not light in air → **POSTFX**.

### Two convergences worth more than their line items

- **`courtyard`'s colossus terminator is the ONE shadow-hue miss in the set** — lit `#ba5244`
  h 7° s 0.63 → shadow `#563d43` **h 345° s 0.29**, desaturating to mauve-grey instead of
  rotating to `#2a3f66` (≈218°) — while kaykit 211°, hero 203° and dunes 207° all pass. This is a
  third independent arrival at the **shade-scoped toon shadow-tint path** (§300 twilight arc,
  §323 tomb arc), and it hands that lane a single measured acceptance target: 345°/0.29 → ~218°.
  It is now the strongest open lead in the project, with three arcs and a number.
- **The unmotivated warm disc is the G1 ghost.** The critic, blind, reports *"an unmotivated soft
  warm blob … 80×60 px measuring `#d79764` against `#655460` immediately left of it (~+50 L),
  with no window, decal edge or source to justify it — the second-brightest object in the frame.
  The same soft warm disc recurs in `interior` and `combat`"*, and routes it **FX** (oversized
  near-camera sprite) or **POSTFX** (flare ghost). §327 measured G1 at 15.92 L and proved
  **neither published leg owns it** (ambient carries only 17.5%), leaving ~82% unattributed and
  asking for a G1-only attribution. **The critic just named the two candidates for that 82%** —
  and independently confirmed the artifact is visible, recurring and costly. The §327 successor
  now has its two hypotheses and three shots to test them on.

---

## 4. Corrections to the standing record — four, all measured by the critic, one fixed here

The critic explicitly lists four conditions it *would* have failed from thumbnails and did not,
after measuring. Three are recorded; one is a stale declaration that has been costing us rounds.

1. **Head:body is 5.03, and the condition PASSES.** *"(`tools/headratio.mjs`, chin→cranium, cap
   and ears excluded) — inside the 4.5–5.5 window."* **I reproduced this independently**:
   `HEAD:BODY = 5.03 heads`, total skinned height 1.8538 m, head 0.3688 m, cap and ear tops
   excluded. AGENTS.md §7.3 still asserted *"Current rig **5.72**, so this condition is FAILING by
   ~0.7 head"* — a number from the **legacy rig**, left behind when the Sly 3 rebuild became the
   default (§196). **Corrected at the declaration site in this commit**, with the tool output and
   the reason it went stale. This has been generating false failures for multiple rounds.
2. **Outlines are not pure black and do scale.** Most common sub-L30 ink is `#241a19` / `#17121f`
   / `#1a151e` — the warm-brown and violet the bible specifies; run lengths 1–3 px near and far.
   **Not a fail.**
3. **Shadows are mostly correctly coloured** — kaykit 211°, hero 203°, dunes 207° against the
   specified 218°. Only courtyard's terminator misses. **Not systemic** (see §3's convergence).
4. **Budget is not breached** — Q2 above.

Corrections 2–4 all cut in the *build's favour*, from a critic whose default is REJECT and which
scored the round 3.94. That is what a blind adversarial instrument is supposed to do when the
record is wrong, and it is the second round in a row where the critic's measurements beat the
project's own declarations.

---

## Disposition

**Nothing ships from this round** — a blind critic round is an instrument reading, not a seal.
No `src` change is earned here; the only tree change is the AGENTS.md §7.3 declaration fix, which
corrects a stale *fact* rather than tuning a *look*.

Queue out of r13, in the order the evidence supports:

1. **§277/§312 successor** — live, calibrated, reproducible (0.205/0.080). Needs a roster-faithful
   runner with a pre-flight defect check, aimed at the additive legs. Critic's #1.
2. **Fresnel rim** — shadow-side silhouettes never separate; 8/13 edges, worst case night's 9 L.
   Critic's #2, and mechanism-level.
3. **Shade-scoped toon shadow-tint** — three arcs converge, target 345°/0.29 → 218° on courtyard.
4. **G1 ghost attribution** — sprite vs flare, the two candidates the critic named, on
   sly-profile/interior/combat.
5. **guardcone re-run** — the shot scores 2 and its stated purpose is unmet; §309 does not cover
   the cone. Last capture of this wave.
6. interior volumetrics (POSTFX) · combat trail + enemy staging (FX/GUARDS) · cane grip
   (ANIMATION) · glove-relaxation claw (CHARACTER) · gold spec tint (SHADING) · dune crest
   (TERRAIN) · sky form (SKY) · combat/guard surface grain (TEXTURES/ARCHITECTURE).

Owner-open, unchanged: Option-A staging (§305), head-sculpt waiver (§294(1) — **both blind
critics and now a third have ranked it top-3; the waiver is costing points on six shots**),
guard model parked (§309).
