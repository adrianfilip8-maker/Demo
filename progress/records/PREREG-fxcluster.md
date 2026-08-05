# PREREG-fxcluster — one seal over the CRITIC-sbs1 §3 FX cluster (cone / sparkle / flash / motes / dunes haze)

**Owner:** FX. **Date sealed:** 2026-08-05, before any capture window for these arms exists.
**Registration tree:** `src/**/*.js` find-relative sha256 `342c51de123a5b26` (convention:
`find src -name '*.js' | sort | xargs sha256sum | sha256sum`, NOT comparable to git-ls-files
hashes — §121.4's lesson, convention stated).
**Diagnosis instrument (committed, offline, the scorer for every band below):**
`progress/records/fxcluster-diag.mjs` → `fxcluster-diag-out.json` + seven `fxcluster-*-crop.png`
evidence crops. Every threshold below is stated beside its count (§122.1). All baselines are
measured on the newest COMMITTED frames (hullkerb/gold1/sbs1/cand1) — not on the CRITIC's Aug-1
`shots/` frames, which are three trees stale and in two cases no longer reproduce (see §0.3).

Scope disclaimer: the temple pink disc (`sandHigh`, RESULT-fx22 REJECT/revert) is a standing FX
item and is deliberately NOT in this seal.

---

## 0. Diagnosis — what the committed frames + CPU ports established

### 0.1 Guard patrol cone (CRITIC §3-guard: "air column 700,300,850,500 medL 27.0, zero readable px")

Reproduced on `hullkerb/frames/guard-base.png` (newest guard, current-tree family): medL **27.6**
(hull arm 27.6 — arm-consistent), medRGB **11/30/49**, mean R−B **−32.1**, warm-additive px
(R−B≥12 & L≥40) **364 of 30,000 (1.2%)**. The beam tint is warm (wedge1 beam0 0.253/0.233/0.163;
port reproduces 0.263/0.242/0.170 from Guard.js TUNE at tod 0.10) — beam-lit air must read warm;
this rect reads cold, flat, and dark.

CPU port (`fxcluster-diag.mjs` §A, validated: solved stand d=5.0 → projected head px (864,244)
vs CRITIC's guard rect top (852,220); wedge1's beam0 colour reproduced):

1. **The air column rect is not air.** The crop (`fxcluster-A-guard-aircolumn-crop.png`) shows a
   flat near-black slab FACE — the §152 plinth mass. Beam fragments behind it are depth-culled
   (`depthTest: true`, Guard.js:1207). §122.3's question ("was the subject even in the frame?")
   answers NO for this rect: the "air between doorway and guard" is occluded foreground stone.
2. **The beam body is off-frame.** With SHOT_POSE's solved heading (`towardCamera: 0.35`,
   `screenSide: -1`, Guard.js:152-161 → heading (−0.07, 1.00) via :1823-1836), only **7.4%** of
   the readable beam body (t∈[0.16,0.56]) projects inside the frame; max t in frame **0.265**.
   The cone tips 0.35 toward a lens 4.9 m away and exits frame-left within ~3 m of the apex.
3. **What crosses the CRITIC's rect is only the throat** (t ≤ ~0.06), which BEAM_FRAG's own
   `near = smoothstep(0.0, 0.16, t)` (Guard.js:274) suppresses to ≤0.12 — an authored guard for
   the guard's silhouette — for a max per-sample linear contribution of **0.0076** (per facing).
4. **The in-frame remainder (t 0.07-0.26) crosses the lit doorway pool** (axis trace backdrops
   L 71-159, `fxcluster-A-guard-bodysliver-crop.png`) — a warm additive volume over warm bright
   stone, the additive-over-bright null Emitters.js:592-594 already names for sprites.
5. **The wedge1 record reconciles cleanly:** the VERIFIED night grade (colNight/beamNight,
   Guard.js:109-112; §94.2d) concerns the cone's colour/brightness terms and they are working as
   built — `_light` 0.263 at tod 0.10 → uOpacity 0.836, night mix 0.137, tint warm-cream. The
   cone EXISTS and is correctly graded; **no opacity or colour value can move pixels into a rect
   occupied by nearer stone, or bring a body that is 92.6% outside the frustum back into it.**
   The lever is the beam's heading; the rect itself is a staging fact (routed, §4-R1).

Heading sweep (port, same stand): body-in-frame share — shipped +0.35 → **7.4%**; profile 0.00 →
21.3%; **−0.20 → 34.5%**; −0.35 → 38.8%. The −0.20/−0.35 headings sweep the beam from the guard
toward the doorway across mid-dark backdrops at un-suppressed t. −0.20 is chosen (smaller yaw
cost to the guard's three-quarter read; −0.35 turns him near-profile-away).

### 0.2 Traversal sparkle (CRITIC §2.1.6 grammar: "0 px within tolerance of #8fd8ff")

Reproduced on `gold1/traversal.png`: strict-band px (±40/±35/±40 of #8fd8ff = 143,216,255)
= **0**; nearest pixel anywhere L1-dist 73. Relaxed bright-blue (B−R≥30 & B≥180 & L≥80) = 2,893
px, ALL in sky bins (y<64) + one 46-px bin at (640,384). Cross-check `sbs1/sly-closeup.png` —
the staging whose in-page probe once recorded `sparkles latched=17 fresh=17` (§85): strict-band
**0**, non-sky blue **0**. Hook projection through the traversal camera (11 authored hooks,
EgyptLevel.js:888-891, :908): **3 in frame** — #4 (591,185) 10.1 m (the very hook the shot
swings on — its gold ring is plainly visible, `fxcluster-B-hook4-crop.png`), #5 (507,239),
#6 (434,268). Disc stats at all three: maxL ≤ 141, no bright blue. **The markers are latched by
the CPU (probe) and absent from the pixels, at visible, unoccluded hook rings.**

In-source mechanism, named: `Debug.setShot` calls `applyShot` **twice** (Debug.js:128 and :140,
around `step(14)`/`step(3)` at 1/60 dt) → each 'shot' event re-bases the FX clock
(`Particles.js:2550 this._t0 = engine.time`) and zeroes `_sparkleTimer` (:2560). A marker's
`born` stamp is written only when its key is NEW (`SparkleField.mark`, Particles.js:1653-1654)
and survives re-marking — so after the second re-base, `born` (stamped in epoch 1, ≈0.017) sits
almost exactly at the captured frame's re-based `uTime` (3 steps ≈ 0.05), and
`pop = smoothstep(0.0, 0.22, uTime − born)` (SPARKLE_VERT, Particles.js:728) evaluates to
**≈0.02-0.09 at every canonical capture**. The mandatory grammar is faded out by the capture
protocol itself. Fires don't suffer this because `_prerollFires` back-dates them 2.4 s
(Particles.js:391) — the sparkle field has no preroll. That asymmetry is the defect.

Secondary (colour) finding, held for a decision rule rather than a second lever: even at full
pop, the emitted core `lin(#8fd8ff)×2.4` (Particles.js:1605) ports through the grade to
~(203-219, 223-235, 255) — R **above** the strict band's 183 ceiling — so the strict CRITIC
metric may only be satisfiable by the star's annulus, not its core (§3-B2 decision rule below).

### 0.3 Combat flash + slash arc

On BOTH committed combat frames (gold1 06:42Z, 36d9b90-dirty; sbs1 04:27Z, 8640769-clean —
cross-boot, cross-tree, pixel-identical stats — staging is deterministic): figure rect
(360,390,720,670) medL **154.1**, medSat **0.370**; blue px (hue 190-260°, sat≥0.25, L≥40)
**10**; chalk px (L≥180 & sat≤0.20) **13,794 = 13.7%** of the figure; frame-wide L≥230 band
7,960 px at medSat **0.145** (the arc is monochrome, measured). CRITIC's char10 numbers
(medL 199.7 / medSat 0.165) do NOT reproduce — that tree is gone; bands below anchor to the
committed baselines. Geometry: the staged impact (`_stageShot`, Particles.js:2564-2570 →
`_onCaneHit` :2506-2521) projects to px (452,433) at 4.91 m = 201.6 px/m, so `cane_flash`
(size 1.5 m × heavy 1.35, alpha **2.6**, ADDITIVE spark batch, Emitters.js:450-455) opens at
**~408 px diameter over the figure**; the measured L≥230 flash component is 172×85 px at
(363-534, 358-442) (`fxcluster-C-combat-flash-crop.png`). Emitted-spectrum port: goldSpec
#fffbe8 / goldLight #ffe9a8 / goldMid #e8b942 all arrive sat ≤ 0.12 at their shipped gains —
the exact mechanism PAL.flameBody's own note records and fixed for fire (Emitters.js:41-54):
**chroma must be in the emitted spectrum or it does not survive the tonemap.** The cane family
never got the flameBody treatment; `cane_arc` col0 is goldSpec = near-white (Emitters.js:469-474).

**Boundary stated:** what FX owns here is the emitted energy and spectrum (alpha/size/colours in
Emitters.js). The AgX-shoulder's desaturation of super-white input — and any residual chalk after
the emitted values are verified applied — is SHADING's tonemap half (their §68/§70 shoulder item;
the DIGEST already routes combat's L160 tail as "measures the tonemap"). §3-C's falsifier routes
that way with numbers instead of defending.

### 0.4 Interior detached warm-bright ceiling shapes

The CRITIC's population (shapes to 156 px, 11.3% of rect 500,0,1280,200, measured on int1,
Aug 1 21:26, d526dd8) **does not exist on either committed Aug-5 interior frame** (hullkerb
520bd541 AND cand1/fx22 3fea650a trees agree): warm-bright coverage (R−B≥10 & L≥120)
**1.2%**, 6 components ≥20 px, widest **44 px** — and the crop
(`fxcluster-D-interior-widest-crop.png`) shows that widest component is warm-LIT ARCHITECTURE
edge, not a floating sprite. The clamped mote populations cannot be the historical shapes either
way (`moteMaxH` 0.028 = 20.2 px ceiling at 720p, Particles.js:106 + min() at :608-611, applied
to 'motes' :2059-2065 and 'airMotes' :2012). The unclamped warm-bright populations that could
regress — named now so a regression has its suspects pre-registered: `fire_body` 0.30-0.55 m
additive (Emitters.js:557-562), `torch_smoke` 0.16-1.1 m lit smoke (:563-568), the FlameField
billboard, plus POSTFX bloom on top (their half). **No lever is sealed for a defect the current
tree does not show** — §3-D is a verification + regression-rail arm, and the CRITIC's §3-interior
mote item is flagged as stale-frame-based (their own §capture-lock note admits 3-4 day staleness).

### 0.5 Dunes pyramid/sky separation ("curve shape, not amount")

On `cand1/frames/dunes.base.png` (only committed dunes; base==gated byte-identical per
RESULT-fx22, so it is the gate-off look): pyramid_105 (Terrain.js:275-289; apex projects at
(470,−64) — above frame top; base (291,258)-(707,265)) vs same-row sky, row-matched sampling
rows 4-110: pyramid medL **149.8**, sky medL **151.5**, **Δ 1.7** (CRITIC measured 9.5 on their
rects; the reference frame holds 21.4). The landmark's silhouette EDGE: mean |ΔL| across 16 px
at the predicted left edge = **5.08**, BELOW the open sky's own 16-px noise step **11.75** —
the pyramid is isoluminant with its sky and its edge is under the sky's noise floor.

The curve that puts it there is **not the published one**: `setAtmosphere()` has no caller
(ToonMaterial.js:1495-1497), so world pixels get the fallback path — `uHazeDensity =
max(scene.fog.density × 2.6, 0.004)` (ToonMaterial.js:1645) with falloff/base/start HARDCODED
(TUNE 0.055/0/26, ToonMaterial.js:578-582), fed by Sky's fallback FogExp2 (Sky.js:581-585)
carrying only Atmosphere's `fog.density` + `fog.color`. Atmosphere's published curve
(`applyAerial`/`aerialBlend`, Atmosphere.js:433-436, :482-490) with its fogHeight 54.6 and
inscatter **never reaches a world pixel** (it reaches only birds, Sky.js:473). Ported blends at
the pyramid: applied 0.254 (apex) / 0.44 (mid) / 0.76 (base) vs published 0.647/0.726/0.855.
The convergence TARGET is the isoluminance driver: world haze = `fog.color × uHazeGain 1.30`
(slyHazeColor, toon.glsl.js:96-100) ports to display ~L213 — brighter than the sky beside the
pyramid (151) — so at 25-45% blend the landform is LIFTED to its sky's value. The dome does not
consume `fog.color` (its horizon band uses the separate `haze` anchor), so darkening `fog.color`
moves the world side only — that is the single-owner FX lever. The ×2.6/side-door wiring itself
routes to SHADING (§4-R2).

---

## 1. The seal — one capture, five sub-arms, chunked per §164

**Pre-edit (one ticketed commit, queued on the capture lock per §165's rule, BEFORE chunk 1;
zero look change — every seam is debug-gated OFF by default):**

- `src/ai/Guard.js` — (a) `_solveShotPose` heading tip reads
  `this.engine.debug?.guardTowardCamera ?? spec.towardCamera`; (b) the clamp at :1829 widens
  `clamp(…, 0, 0.9)` → `clamp(…, −0.6, 0.9)`. SHOT_POSE data unchanged.
  **Ownership flag:** Guard.js is GUARDS' per AGENTS §3; the cone/grade work has ridden FX
  tasks (wedge1 / task #14). The coordinator assigns the editor; this seal binds the design.
- `src/fx/Particles.js` — (a) `SparkleField.preroll(sec)` (stamp every live marker's
  `aData[i*4+2] = −sec`); (b) `_stageShot` calls `this.sparkles?.preroll(0.25)` **only when
  `engine.debug?.sparklePreroll === true`** (default: shipped behaviour, bit-exact);
  (c) constructor exposes `this.EMITTERS = EMITTERS` (poke path; data untouched).
- No seam for E: `engine.get('sky').atmosphere.fog.color` and `sky._sceneFog.color` are
  live-pokeable instance state; ToonMaterial re-syncs `uHaze` from `scene.fog` every update
  (ToonMaterial.js:1639-1652).

**Base arms exercise every seam OFF; restore arms re-assert OFF and must reproduce base
(§94.2d: bit-identity between a state and its restoration is the success reading).**

### Sub-arm A — cone heading. Lever: `guardTowardCamera = −0.20` (shipped value 0.35)

| quantity (scorer: `fxcluster-diag.mjs` §A, env-overridden frames) | band |
|---|---|
| Q-A1 `ΔmedL` cand−base, frozen path ROI (340,280,700,350) | **[+3.0, +45.0]** |
| noise/calibration gate: \|medL base2−base\| and \|restore−base\| in same ROI | ≤ 1.0 each |
| Q-A2 no-harm: guard figure rect (852,220,990,700) medL(cand) − medL(base) | ≥ −3.0 |
| Q-A3 context (not a gate): air-column rect (700,300,850,500) \|Δ\| | expected ≤ 8, report |

Port prediction inside Q-A1's band: the −0.20 heading routes beam t 0.03-0.23 through the ROI
at un-suppressed `near`, per-facing alpha to ~0.4; ROI today: medL 94.3, R−B +21 (74% already
warm — an absolute warm-px count is saturated there, which is WHY the registered quantity is
the arm-relative ΔmedL). §13 calibration: the metric's known-bad is the base arm itself (Δ≡0 by
construction) and its scale is the base/base2 noise gate — cand must clear 3× that gate's bound.
**P-A (revert-not-defend):** Q-A1 < +3.0 → the heading cannot express the cone at this staging
→ no ship, seam value abandoned, and the cone item rides §4-R1's route to COORDINATOR alone.
Q-A2 breach → no ship (the shot's subject is the guard first).
**§17 declaration:** the guard's body yaw turns ~30° lens-away in the cand arm (heading
(−0.07,1.00) → (−0.59,0.81); his lit three-quarter narrows); `SHOT_POSE.guard.look`
compensation is available (head-look overlay, Guard.js:1740,:1845) but is NOT part of this
arm — one lever.
**Probe per arm:** `guards.list[0]` position/forward readback, beam instanceColor[0], uOpacity,
`engine.debug.guardTowardCamera`, tod, camera, srcAtArm tree hash.

### Sub-arm B — sparkle staging preroll. Lever: `debug.sparklePreroll = true` (cand arm)

| quantity (scorer §B; hook px recomputed from the frozen camera+hook table) | band |
|---|---|
| Q-B1 grammar floor: bright-blue px (B−R≥30 & B≥180 & L≥80), union of r=30 discs at the three in-frame hook projections | base ≤ 10; **cand [60, 4000]** |
| Q-B2 strict CRITIC band: px within ±40/±35/±40 of #8fd8ff, frame-wide | cand [10, 3000], **non-gating** |
| noise gate: restore ≡ base on Q-B1 (\|diff\| ≤ 5 px) | ≤ 5 |

Prediction basis: a hook marker at 10.1 m is a ~100 px quad (sz 0.42×1.15×(1+0.02d), vGain to
1.76); three in-frame markers → expected 500-2500 relaxed-blue px; floor 60 is 10× under.
§13 calibration: the shipped state IS the known-bad (0 px, measured on two boots/two shots) and
the base arm must reproduce it.
**Registered decision rule (not a second lever):** Q-B1 PASS + Q-B2 < 10 → the residual is the
emitted core spectrum (`uCore ×2.4`, Particles.js:1605, blown past the strict band's R≤183) —
a separate colour candidate re-registers with its own prereg; the pop lever still ships on Q-B1.
**P-B (revert-not-defend):** base arm Q-B1 > 10 → the pop mechanism attribution is WRONG
(something else was hiding markers) → revert the seam, re-diagnose from the arm's probe.
**Probe per arm:** `sparkles.count`, per-marker aPos/born, `uTime`, computed pop (mechanism
check: base pop ≤ 0.15, cand pop ≥ 0.9), `movement.position` (teleport check, Debug.js:93-95).
**§17:** staged stills gain visible affordance markers — the §2.1.6 mandated grammar.

### Sub-arm C — cane-impact emitted block. Lever: one data block, A/B'd and reverted as a unit

Poked via `fx.EMITTERS` in the cand arm; ships as an Emitters.js edit only on PASS:

```
cane_flash  alpha [2.6,2.6]→[1.3,1.3]   col0 goldLight→0xe8912a  col1 goldMid→0xd4823a
cane_arc    alpha [1.6,2.6]→[1.0,1.6]   col0 goldSpec→0xe8912a   col1 goldMid (keep)
cane_spark  alpha [2.2,3.4]→[1.6,2.4]   col0 goldSpec→0xffc84d   col1 goldMid (keep)
cane_ring   alpha [2.0,2.0]→[1.4,1.4]   colours keep (rimCool tail is the FX-blue pole)
```

(0xe8912a / 0xd4823a sit on §2.2's gold→carnelian axis; port ordering: d4823a > e8912a >
ff9a3c(flameBody) > goldLight in surviving chroma. The port underestimates absolute output sat
— it omits the composite's pre-AgX saturation 1.30 — so bands anchor to FRAME baselines, and
the port is used for direction/ordering only.)

| quantity (scorer §C, combat frames) | band |
|---|---|
| Q-C1 figure (360,390,720,670) medSat | base 0.370±0.02; **cand [0.40, 0.62]** |
| Q-C2 figure chalk share (L≥180 & sat≤0.20) | base 0.137±0.010; **cand [0.015, 0.095]** |
| Q-C3 flash blob: largest L≥230 component in (300,300,760,600), px | base 7304±15%; **cand [400, 4800]** |
| Q-C4 blob bbox region medSat at L≥200 | **cand ≥ 0.20** |
| restore ≡ base gate on Q-C1..C3 | within the base tolerances |

**P-C (revert-not-defend):** any cand band miss → revert the block. If the probe confirms the
applied def values AND Q-C1/C2 miss chalk-ward, the residual is the tonemap's shoulder →
routes to SHADING with these numbers (boundary per §0.3); FX does not iterate gain upward to
compensate — that is the defended-lever shape §141 warns about.
**Probe per arm:** `fx.EMITTERS.cane_{flash,arc,spark,ring}` alpha/col snapshot
(requested-vs-applied per §94.4), impact emit position, tod, camera, srcAtArm.
**§17:** the impact flash visibly changes — smaller, gold instead of white. Declared.

### Sub-arm D — interior verification + rails (no lever)

One interior frame in chunk 3's boot, shipped state (after E-restore).

| rail (scorer §D) | band |
|---|---|
| ceiling band (500,0,1280,200) warm-bright coverage (R−B≥10 & L≥120) | ≤ 2.5% |
| widest warm-bright component (≥20 px comps) | ≤ 60 px |

Both rails hold on both committed frames today (1.2% / 44 px). A breach = the CRITIC's defect
is live again → the pre-registered suspects (§0.4: fire_body size, torch_smoke size, bloom
threshold as POSTFX's half) get their own lever prereg; nothing in this seal ships for D.

### Sub-arm E — far-haze convergence value. Lever: Atmosphere anchor `fogColor` ×0.75 linear

Shipped-on-PASS edit: anchor(2) `fogColor: 0xdb9a68 → 0xc1875b` (Atmosphere.js:166); anchor(22)
`fogColor: PALETTE.skyHaze → 0xcca269` (Atmosphere.js:182 — replaces the PALETTE reference with
a literal; PALETTE itself untouched). Night/midday anchors untouched. Cand arm pokes the
el-15-blended colour (linear lerp k=0.718 of the two candidates — same arithmetic as
`evalAtmosphere`'s Color.lerp) into `sky.atmosphere.fog.color` + `sky._sceneFog.color` AFTER
`setShot('dunes')`, then step(2) so ToonMaterial's per-update fog sync carries it into `uHaze`
(+ `_refreshHazeSun`), then capture. No timeOfDay event may occur between poke and capture.

| quantity (scorer §E, frozen row procedure rows 4-110) | band |
|---|---|
| Q-E1 sky−pyramid ΔmedL (sign: sky brighter) | base 1.7±1.5; **cand [+8, +22]** |
| Q-E2 no-harm: temple-complex rect (300,140,900,420) \|ΔmedL\| | ≤ 6.0 |
| Q-E3 no-harm: near ground band (200,500,1100,700) \|ΔmedL\| | ≤ 4.0 |
| noise gate: \|restore−base\| on Q-E1 | ≤ 1.0 |

§13 calibration: base is the known-bad (1.7 measured; the reference class sits at 21.4 —
stated as the target class, not a gate); cand must clear ≥ 8 = beyond 4× the noise gate.
**P-E (revert-not-defend):** Q-E1 < +8 → revert; the residual then needs the SHADING-side seat
(hazeGain 1.30 / a slyHaze far-blend ceiling) and rides §4-R2's route with this arm's numbers.
Blast radius declared (§17): every exterior day shot's world-haze tint darkens slightly (haze
is 5-20% blended in mid-ground → ~1-4 L), birds' aerial and Water fog share `fog.color`.
**Probe per arm:** `sky.atmosphere.fog.color` hex, `scene.fog.color` hex, a `uHaze` readback
from any toon material, tod, camera, srcAtArm.

---

## 2. §164 chunk plan — one boot per chunk, whole registered pairs per chunk

Launch via `tools/launch.sh` (§131), FIFO lock ticket per chunk (`tools/lock.mjs`), frames
committed per chunk to `progress/records/fxc1/frames/` + `fxc1.json` probe rows appended per
arm, pushed at the sweep; the coordinator arms a Monitor on the run log so completion wakes the
sweep (§164.1). Scoring happens at first wake after the last chunk, by a fresh scorer running
`fxcluster-diag.mjs` with env overrides on the committed fxc1 frames — the bands above were
sealed before any of those frames exist.

| chunk | shots | arms in order | ≈time |
|---|---|---|---|
| 1 | guard | A-base → A-base2 → A-cand (poke `debug.guardTowardCamera=−0.20`, re-`setShot`) → A-restore (delete flag, re-`setShot`) | 10 min |
| 2 | traversal, combat | T-base → T-cand (`debug.sparklePreroll=true`, re-`setShot`) → T-restore; C-base → C-cand (poke EMITTERS block, re-`setShot`) → C-restore (poke shipped values back) | 12 min |
| 3 | dunes, interior | E-base → E-cand (fog.color poke) → E-restore → D-frame (shipped state) | 10 min |

Every registered comparison lives inside one chunk's boot; a rollback costs at most one chunk's
window (§164.2). Each probe row stamps tod + camera + srcAtArm (the fx19 gap, closed per the
DIGEST's FX note). If a chunk dies mid-run, its committed partial frames stand and only the
missing arms re-run.

## 3. Decision table (summary)

| arm | ships on PASS | on FAIL |
|---|---|---|
| A | `SHOT_POSE.guard.towardCamera: 0.35 → −0.20` (+clamp stays widened) | revert; cone → COORDINATOR (R1) |
| B | `_stageShot` sparkle preroll default ON | revert seam; re-diagnose from probe |
| C | the Emitters.js data block verbatim | revert; chalk residual → SHADING w/ numbers |
| D | nothing (rails only) | rails breached → new lever prereg (suspects named §0.4) |
| E | the two anchor fogColor literals | revert; far-haze seat → SHADING (R2) |

## 4. Routed out of this seal, with evidence (not sealed, not defended)

- **R1 → COORDINATOR:** the CRITIC's guard "air column" rect (700,300,850,500) is the §152
  plinth/slab FACE, not air — crop `fxcluster-A-guard-aircolumn-crop.png`, stats medRGB
  11/30/49, R−B −32, flat. No FX value can light a rect occupied by nearer stone (depth test).
  Whether the guard camera is re-staged so the shot contains readable air between doorway and
  guard is a §152-class camera decision. Sub-arm A improves the cone WITHIN the current frame
  and is worth running regardless; it cannot answer the rect.
- **R2 → SHADING:** the aerial-perspective wiring — the published Atmosphere curve is dead for
  world pixels (`setAtmosphere()` uncalled, ToonMaterial.js:1495-1497; fallback ×2.6 side-door
  :1645; falloff/base/start hardcoded :578-582; fogHeight/inscatter unreachable), applied vs
  published blend at the pyramid 0.254 vs 0.647 (apex) per the committed port. A real wiring
  fix (publish + consume `sky.fogParams` in-shader) supersedes sub-arm E's value change; E is
  the FX-ownable stopgap.
- **R3 → record:** CRITIC-sbs1 §3's interior mote/bloom item and its combat figures were
  measured on frames three trees stale; neither reproduces on committed Aug-5 evidence (§0.3,
  §0.4). Their §3 routes remain right in kind; the magnitudes and one existence claim do not
  hold on the current tree. This is §128.6's stale-anchor hazard landing in a review, flagged
  so the next owner does not chase 156-px shapes that are not there.

## 5. Files of record (durable, committed with this seal)

- `progress/records/PREREG-fxcluster.md` (this file)
- `progress/records/fxcluster-diag.mjs` (+ `fxcluster-diag-out.json`)
- crops: `fxcluster-A-guard-aircolumn-crop.png`, `fxcluster-A-guard-bodysliver-crop.png`,
  `fxcluster-B-hook4-crop.png`, `fxcluster-C-combat-flash-crop.png`,
  `fxcluster-D-interior-widest-crop.png`, `fxcluster-D-interior-ceilingband-crop.png`,
  `fxcluster-E-dunes-pyramid-crop.png`
