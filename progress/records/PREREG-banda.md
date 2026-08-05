# PREREG-banda — Band A day-warm recut: gap #2 re-measured on committed frames, the live residual named at its lines, and a two-lever candidate

**Owner:** SHADING (`src/render/ToonMaterial.js`, `src/render/shaders/toon.glsl.js`).
**Date sealed:** 2026-08-05. **Status:** REGISTERED, capture NOT run (offline task; no lock).
No `src/**` touched. Every number below is produced by `progress/records/banda-diag.mjs`
(committed; drift-guarded — it parses its constants out of the committed source and refuses
on mismatch) from committed frames and committed source only.

**The finding under repair** (CRITIC-sbs1 §4 gap #2): *"The grade renders authored warm as
violet, everywhere"* — hero sunlit beam hue 279°/L36, temple limestone 287°, interior walls
267–268° at half the comparand's warm share, tail cream at R−B −34.2, combat Sly chalked at
medSat 0.165. Five shots, one direction of error.

---

## 1. Re-measurement on committed frames — the violet half of the finding has drifted, the warm-deficit half is live

CRITIC's frames (2026-08-01, `shots/`, five trees across one day) are lost to rollback. The
committed frames are the operative baseline: `cand1/frames/{hero,temple,interior}.base.png`
(fx22 base arms, 08-05), `sbs1/{sly-closeup,combat}.png` (08-05, commit 8640769 clean),
`gold1/traversal.png` (08-05, newest). CRITIC's rects verbatim (`banda-diag.mjs frames`):

| population (CRITIC rect) | CRITIC 08-01 | committed 08-05 | live? |
|---|---|---|---|
| hero beam medHue / medL | **279° / 36** | **243.5° / 40** (body L≥medL: 222.7°) | violet NO — cool-family |
| hero arch <L40 share | 49.2 % | **37.6 %** (beam rect 49.8 %) | **black-band YES** (ref 0.1 %) |
| temple lit columns medHue | **287°** | **213.6°** (body 210.0°) | violet NO |
| interior walls medHue / sat | **267–268° / .45** | **225.9–226.5° / .45** | violet NO — at the ≤226 line |
| interior frame warm% | 16.2 vs ref 31.0 | **7.3 %** | **warm-deficit YES** |
| tail bands medHue / mean R−B | 231° / **−34.2** | 241.6° / −17.2 (body −10.5) | **cream-cold YES** |
| combat figure medL / medSat | **199.7 / 0.165** | 154.1 / 0.371, warm% 90.2 | flash not in frame (phase) |

**The drift, stated with its evidence and its hedge.** No committed frame reproduces hue
> 250° on any CRITIC rect; every architecture shade register measures 210–243°, inside or at
the edge of §2.2's sanctioned violet-teal-cyan family and of the ledger's ≤ 226° acceptance
(t16ab). The direction and magnitude of the drift (−36° to −73°) match the sealed
measurements of the task-16/19 pair that the tree shipped around the CRITIC's capture window
(fill leg: wall 232→218, block 256→223; interlock: papyrus 294→224 — ToonMaterial.js
`fillSkyMix`/`shadowTeal` notes), and `RESULT-coolskew-grade.md` already measured WALL-SHADOW
at 216 ∈ [200,240] on the 08-02 cap5 frames. Because CRITIC's frames are gone, "the ship
landed between their captures and ours" is inference; what is *measured* is that the violet
is not reproducible on any committed frame. **A seal aimed at "authored warm renders violet"
on today's tree would be sealed against pixels that no longer exist** (NOTE-tailpalette's own
caveat about freezing thresholds against known-wrong frames, in reverse).

**What survives of gap #2 on committed frames, with owners:**

- **L-A (SHADING, this seal): the character's authored warm renders cold.** TAIL-LIGHT-SHADOW
  (coolskew ROI, creamfix convention) b−r **−20.6** on `sbs1/sly-closeup` — reproducing
  creamfix f050's −19.0 across boots — against §2.2 authored cream ≈ −110 and the
  its-own-RESULT finding that f050 reads *greige, not cream*; CRITIC's pair verdict ("blue-white
  windsock vs TiT's grey-and-black rings") is the frame-vs-reference answer to the corridor
  question RESULT-creamfix §6 explicitly left to the blind critic.
- **L-B (SHADING, this seal): the daylight shade register is opaque.** hero arch rect <L40
  **37.6 %** (beam rect 49.8 %) against the Odyssey comparand's 0.1 % — §2.1 "shadows are
  transparent" / CRITIC's "shadow and ink have merged into one black band", routed SHADING
  (shadow floor) by CRITIC itself.
- **L-C (NOT this seal): the warm-share deficit is mostly population, not grade.** The lit
  register is already warm — combat figure warm% 90.2, chain corridor/lit texels hue 28–34 —
  and `interior`'s missing warm (7.3 vs 31 %) is torch-lit surfaces the comparand has and we
  do not (torch radius/energy → **FX**, per CRITIC's own routing; enclosure → **LIGHTING**).
  This seal predicts its own warm% moves honestly small (P6) and claims nothing there.
- **Combat's chalk is a different mechanism** — flash radiance driven over the AgX shoulder
  (grade port: display saturation collapses above L≈160 by the tonemap's own top-end, PostFX
  saturation-note table), on a frame phase the committed capture did not catch. FX owns the
  flash magnitude (CRITIC co-routes); the tonemap top-end is SHADING's but needs a flash
  frame to score — carried as a regression watch (P8), not a claim.

## 2. Diagnosis at the lines (instrument `attrib`; port validated on four committed anchors)

**Port validation, all PASS (refuse-on-fail):** keyLum table reproduced ≤ 0.01 (hero 2.423 vs
committed 2.424, interior 3.642 vs 3.652); `uShadowColor` reproduces the compose1 live boot
readback (0.096, 0.313, 0.497) to 4e-4 (§132.3); the grade port reproduces the committed
scene→display row to worst 0.35 L (the toneclosed validation figure exactly); and the port
reproduces pnightcal's *captured* night response (+4.1° at sbm +0.15 vs their measured
+4.84° at the same dose). Frame-vs-chain residual on wall bodies: the frame reads **+7…+34°
bluer** than the clean-texel prediction (hero +18–22, temple +7–14, interior +28–34) —
attributed to the cool populations the port excludes by scope (ink `#161022`, GTAO tint
multiply, haze, FXAA edge mixing) and quoted below as the calibration every band carries.

**Per-term attribution of the day shade register** (display-hue Δ when the term is
neutralised; hero/worn/shadeWall — other wall rows agree in ordering):

| term (site) | Δhue | reading |
|---|---|---|
| shadow-light hue → grey (`_refreshShadowColor`, ToonMaterial.js:1522–1620; consumed at toon.glsl.js:443–452) | **+155…+180°** | **owns the register** |
| shadowTeal 0.15→0 (ToonMaterial.js:360) | +18…+27° blue-ward | teal blend works as designed |
| shadowSat −0.35→0 (toon.glsl.js:367) | −9…−39° toward green-cyan, sat falls | keeps the light's chroma legible |
| fill hue → grey (toon.glsl.js:394–398) | ±3…11° | minor |
| split-tone off (PostFX.js:1067–1069) | −2…−6° | minor |
| saturation 1.30→1 / gain / wash-hue | ≤ 3° | minor (wash carries ~10 display L, not hue) |
| AgX (Common.js:240) | −0.1…−3.3° on these registers | not the shade-hue culprit |
| **sbmLit alone 0.05→0.20** | **+0.0° everywhere** | **measured dead** — its authority is ∝ shadowMix (§115.4's ceiling seen from the other side); deep shade never reads the Lit build (smoothstep(0.45,0.85,1)=1), shallow shade has no shadow term to colour. Do not spend an arm on it. |

**Cap state, correcting a ledger parenthetical.** All-daylight `k` is CAPPED: kAsked 3.36–5.10
vs maxK 3.139 at the shipped teal-blended peak — §115.2's "`shadowTeal 0.15` released the
`shadowTintPeak` clamp" does not hold at the shipped constants, and the compose1 live readback
(which this port reproduces while the *uncapped* arithmetic would print ≈ (0.103, 0.336,
0.534) at tod 0.80, ×1.07 brighter) is the frame-side proof. Consequences: `shadowFloor` is still dead in daylight; `shadowTintPeak`
is still the only live daylight magnitude lever (§3), its authority saturating at kAsked
(≈ +8 %) for golden-hour shots and reaching +19 % on `interior` (kAsked 5.10).

**The cream residual, named.** The `creamShadeOccRim` texel (inter-card AO 0.45 + curved-surface
rim 0.5) reproduces the committed tail body to ~2° / 1 R−B (241.9/−11.6 modelled vs 240.0/−10.5
measured) — and its attribution shows the residual coldness at subjW 0.50 is the **AO tint
multiply** (PostFX.js:1050, `uAOTint` = peak-normalised #2a3f66) **and the scene-space cool
surface rim** (toon.glsl.js:732, `uRimColor` #7fd4ff) re-cooling the surface *after*
`uSubjWarmShade` has warmed the two shade lights (toon.glsl.js:446–447 — its scope is the
lights only, by design). subjW 0→0.50→0.65 walks the texel 199.5/−80.6 → 241.9/−11.6 →
333.3/+7.3, matching coolskew's measured base 197 and bracketing creamfix's measured arms.

## 3. The candidate — two levers, both live pokes, both night-proof

- **L1 `subjWarmShade` 0.50 → 0.65** (ToonMaterial.js TUNE; shared uniform `uSubjWarmShade`).
  The creamfix run **already captured and measured this arm**: TAIL-LIGHT-SHADOW b−r **−44**,
  R/G **1.278** vs authored light-sandstone 1.250, rings **+14** ∈ [+5,+45] (`RESULT-creamfix`
  §2/§3/§6) — the arm its own RESULT called nearer authored on both ratios, not taken then
  only because re-picking post-hoc was forbidden. This seal takes it as a registered choice,
  with CRITIC-sbs1's pair verdict as the corridor ruling the creamfix RESULT asked for.
- **L2 `shadowTintPeak` 0.52 → 0.62** (ToonMaterial.js TUNE; consumed in `_refreshShadowColor`).
  Raises every daylight shadow light by +8 % (golden shots, floor-limited past 0.56) to +19 %
  (`interior`); texel L +2.3–2.4 (hero/worn, with and without occ), +5.3 (interior walls);
  hue moves ≤ 2° (k scales all channels); sat ~flat. The §2.1/§2.3 transparency direction on
  the one live magnitude lever, never before A/B'd in frame.

**Named and rejected, so nobody spends an arm:** `shadowBounceMixLit` (measured dead, §2);
`shadowBounceMix` (moves night +4–5°/0.15 — pnightcal's measured axis — and grey-collapses
day sat, §115.4/§132.4); `fillSkyMix` back-off (re-opens the violet by its own sealed
measurements); `shadowFloor` raise (night's live knob — collision by construction);
`shadowWash` raise (washcap history: albedo-independent coat).

## 4. Registered predictions — intervals, sealed before any new frame

Scored by `banda-diag.mjs score progress/records/banda1` (bands duplicated verbatim in its
`BANDS` table; a mismatch between the files voids the scoring, not the seal). Conventions:
§122.1-stated (Rec.709 luma 0–255; b−r medians on coolskew L-filtered ROIs; body = L ≥ rect
medL; differing-px threshold ΣRGB ≥ 4).

**Base gates (P-F3, VOID not FAIL):** capture base must reproduce the committed baselines —
sly-closeup creamROI b−r ∈ [−28, −12] (committed −20.6) and rings ∈ [+15, +35] (+24.5);
hero arch <L40 ∈ [30, 46] (37.6); interior wall medL ∈ [44, 58] (50.0–51.5). Outside ⇒ the
captured tree/staging is not the diagnosed one ⇒ capture VOID, no verdict.

**Candidate arms (A = L1; B = L2; AB = both):**
- **P1** (arm A and AB, sly-closeup): TAIL-LIGHT-SHADOW b−r ∈ **[−58, −30]** (measured-arm
  anchor −44); TAIL-DARK rings b−r ∈ **[+5, +45]** (anchor +14). Both clauses; rings out ⇒ FAIL.
- **P2** (arm A and AB, sly-closeup): CRITIC tail rect (630,290,780,410) body R−B ∈
  **[−4, +18]** (base −10.5; texel Δ +19…+24 on shade cream, +1 lit, mixed population minus
  the stated residual). The base value sits outside this band — the shipped state fails it,
  which is the calibration property (verified: `score` on the committed frame prints FAIL).
- **P3** (arm B and AB, hero): arch rect <L40 share moves by **[−6.0, −0.5] pp** from the
  same-boot base (texel +2.3–2.4 L against the 32–40 luma bands holding 15.3 pp).
- **P4** (arm B and AB, interior): both wall rects ΔmedL ∈ **[+1.0, +8.0]** (texel +5.3;
  relative-lift transfer +2–3 L at the frame's darker operating point).
- **P5** (every non-KB arm, hero beam + temple columns + interior walls): body hue stays in
  **[200, 246]** — the family guard; the candidate must not re-open violet (> 250) or
  overshoot into green-cyan (< 200, the pkg30/50 failure side).
- **P6** (honesty rows, reported not gated): interior frame warm% moves ≤ +3 pp; hero warm%
  +[0, 4] pp. This candidate does not claim the torch gap.
- **P7** (night, arm AB vs base, same boot): differing px OUTSIDE the subject box
  (560,300,900,560) = **0** at ΣRGB ≥ 4 — the collision proof (§6). In-subject movement is
  expected (Sly's shade lights warm) and reported.
- **P8** (combat, arm AB vs base, if chunk D lands): figure rect warm% ≥ 0.85 × base —
  regression watch; flash-phase caveat stated (the chalk defect needs a flash frame to score
  and this seal does not claim it).

**Known-bad calibration arms (§13/§141.1 — the metric must see both failure directions):**
- **KB-warmmud** (`shadowBounceMix`/`Lit` 0.20/0.20, day shots only, NEVER at night): must
  read as its own failure via **grey-collapse** — wall-body satP50 falls ≥ 35 % relative on
  ≥ 2 of 3 wall rects (port: hero 0.53→0.32, temple 0.42→0.20, interior 0.31→0.14; the
  §132.4 interlock's own signature on the current tree — note it does NOT go violet here,
  the teal counteracts; hue moves only +5–8°).
- **KB-overwarm** (`subjWarmShade` 1.0, sly-closeup): must FAIL the rings-hold gate —
  TAIL-DARK b−r < +5 (creamfix V2's gate direction inverted; port: cream texel R−B +110,
  the navy identity gone).
- If either KB arm passes the candidate bands instead of failing its own signature, the
  metric has not separated known-bads ⇒ **UNSCOREABLE is the registered outcome**
  (PREREG-pnight's discipline).

**Prediction intervals are bands, not points (§133.1),** sized from: measured-arm anchors
(creamfix f065; committed-frame baselines), texel deltas, the +7…+34° / L-scale frame-body
residuals of §2, and FXAA/population-mixing spread.

## 5. P-falsifiers — revert, do not defend

- **P-F1** any P1–P5 outside its band on the AB arm ⇒ candidate REVERTED. No post-hoc retune
  toward a band; a new value is a new prereg.
- **P-F2** a KB arm fails to read as its own failure ⇒ UNSCOREABLE (no verdict for or against).
- **P-F3** base gate out ⇒ capture VOID.
- **P-F4** restore arm differs from base by > 0 px at ΣRGB ≥ 4 on any chunk ⇒ every arm
  number in that boot is void (poke/restore leaked; pnight1's recorded failure mode).
- **P-F5** arm A architecture invariance: base-vs-A differing px in an architecture-only crop
  (hero arch rect on chunk B, or the sly-closeup WALL-SHADOW box) must be **0** at ΣRGB ≥ 4 —
  `mix(x,y,0)` exactness on vSlySkin=0 draws, in frame. This also discharges creamfix V3's
  owed off-subject pin (§28/§30) at zero extra cost.
- **P-F6** night collision (P7 ≠ 0 outside the subject box) ⇒ candidate does not ship on this
  seal regardless of P1–P5 (PREREG-compose1 A.4's discipline, adopted).

## 6. The pnightcal-collision clause — how each lever provably does not move the night quantities

`RESULT-pnightcal.md` publishes: night archShade hueP50 224.444 (L1 budget ≤ 1.40°), sky
215.604 (L2 ≤ 0.30°), meanLuma 21.85 (L3 ±10 %), slope 40.5°/unit sbm, night-safe sbm ceiling
0.0845. This candidate touches **neither axis**, by arithmetic:

- **L2 (`shadowTintPeak`) cannot reach night.** The peak cap binds only when
  kAsked > maxK; night kAsked = 0.4685 against maxK 3.139 (0.52) / 3.744 (0.62) — the cap is
  6.7× away and `kUsed` is the floor-limited value at either setting. The instrument prints
  the night `uShadowColor` per arm to six decimals: **identical** (0.012896, 0.046769,
  0.078053) for ship / A / B / AB. sbm stays 0.05 — the night-safe ceiling 0.0845 is not
  approached, and the pnightcal slope is not engaged.
- **L1 (`subjWarmShade`) cannot reach architecture or sky.** The blend factor is
  `clamp(uSubjWarmShade)·vSlySkin` (toon.glsl.js:434) — exactly 0 on every non-skinned draw,
  and `mix(x,y,0.0)` is exact. pnightcal's three scored populations (archShade 42,812 /
  archLit 3,400 / sky 9,097, material-mask ROIs) contain no skinned pixels. Sly's own night
  pixels move (warmer shade lights — creamfix V4 measured the direction at 0.50 and night
  renders FIRST in that A/B's precedent); they are outside every pnightcal population.
- **In-frame proof anyway (P7):** the night chunk captures base + AB in one boot and requires
  0 differing px outside the subject box — the collision claim is *verified on pixels*, not
  argued from arithmetic alone.
- KB-warmmud (the one arm that WOULD move night — port +4.1°, pnightcal's own axis) is
  **never applied at a night tod** in the capture plan.

If a future coordinator routes a joint day/night capture instead, the night arm runs FIRST
(ledger precedent) and pnightcal's published bands are the gates — but on this seal's
arithmetic no joint capture is required.

## 7. §17 look-change declaration

This candidate is a look change arriving as a look change, declared before capture:
**L2 brightens every daylight cast-shadow and enclosure register by ~2–5 display L** (every
daylight shot; `interior` most at ~+5), in the direction §2.1's "shadows are transparent —
you can always read detail inside them" names; **L1 warms the skinned population's shade
register only** (Sly and guards; architecture bit-identical by construction and by P-F5).
The base arms in the same boots are the before record. Ships only through this A/B, lands
with its own KNOWN_ISSUES entry quoting this file, never as a drive-by.

## 8. Capture plan (§163/§164 chunked; arms are live pokes of a running page)

Runner pattern: pnightcal (one boot per chunk; poke AFTER `setShot` settles; capture; never
re-`setShot` inside an arm; readback after a step, §40). Poke handles:

- arm A: `sh = engine.get('shading'); sh.tune.subjWarmShade = 0.65;
  sh.uniforms.uSubjWarmShade.value = 0.65;` (nothing republishes it per frame; poke both for
  hygiene). Readback: `sh.uniforms.uSubjWarmShade.value`.
- arm B: `sh.tune.shadowTintPeak = 0.62;` then one `__GAME.step()` — `Lighting.update()` →
  `setKeyLight()` → `_refreshShadowColor()` re-reads TUNE every frame, so the tune poke is
  durable and self-refreshing. Readback: `sh.uniforms.uShadowColor.value` triple (must move
  from the base readback by ×0.62/0.52 on capped shots; must NOT move at night).
- KB-warmmud: `sh.tune.shadowBounceMix = 0.20; sh.tune.shadowBounceMixLit = 0.20;` (+ step).
- restore: set 0.50 / 0.52 / 0.05 / 0.05 back (+ step), capture restore frame.

Chunks (frames committed per chunk to `progress/records/banda1/<shot>.<arm>.png` + a stamps
JSON with src-tree hash per §121.4, tod, quality 1280×720 high):

- **Chunk A** `sly-closeup`: base, A, AB, KBoverwarm, restore (5 frames).
- **Chunk B** `hero` + `interior` (same boot, staged sequentially): base, B, AB, KBwarmmud,
  restore per shot (10 frames).
- **Chunk C** `night`: base, AB, restore (3 frames — the P7 collision proof; no KB arms).
- **Chunk D** (only if the lock stays quiet) `temple` + `combat`: base, AB, restore (6).
- Scoring: first wake after DONE (§163.2):
  `node progress/records/banda-diag.mjs score progress/records/banda1` → the P-table verbatim
  into `RESULT-banda.md`, plus the two KB signatures and P-F4/P-F5 counts.

## 9. Files of this seal (coordinator sweep list — no git run by this task)

- `progress/records/banda-diag.mjs` — instrument (frames/state/grade/chain/attrib/cand/gold/score).
- `progress/records/PREREG-banda.md` — this file.
- (companion, same session: `progress/records/PREREG-goldlobe.md` — gap #1's gold sibling.)
- Scratchpad only, never committed: full-mode output dump, score smoke-test copies.
