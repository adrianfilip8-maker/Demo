# PREREG-goldenrake — the 22° raking key: what the golden anchor rakes, it fully lights

**Lane:** LIGHTING/grade (critic r11 queue item 1, RESULT-critic11.md family 1 — "hero's
missing 22° raking sun"; parents in evidence: §256 the azimuth table and its owner routing,
§2.2 "22° elevation, low and raking", the r11 praise routing on kaykit).
**Date sealed:** 2026-08-13.
**Status: REGISTERED before any capture. `progress/records/gradetrio1/` does not exist at
the time of writing and no frame of any arm has been rendered.** Shared runner
`progress/records/gradetrio/gradetrio.mjs` and scorer
`progress/records/gradetrio/goldenrake-score.mjs` are committed with this file, before the
capture, together with the INERT mechanism SEALED AS RECORDS-SIDE PATCHES
(`gradetrio/ToonMaterial.cand.patch` + `gradetrio/toon.glsl.cand.patch` —
`TUNE.rakeTrack: 0.0`, shader branch untaken) and its pin test held at
`gradetrio/goldenrake.test.mjs.pending`; the patches land on `src/` (pin test →
`tests/goldenrake.test.mjs`) in the immediately-following mechanism commit after the
in-flight capture releases, before any launch (PREREG-tombdim's §296 sequencing
disclosure, two-commit shape). Sharing/independence as PREREG-tombdim's header states.

## 0. The diagnosis — why the anchor's promise is absent from the frame

§2.2 promises "KEY LIGHT sun #ffd9a0 (late-afternoon, 22° elevation, low and raking)" and
`hero` stages at tod 0.79 = el 22.0 exactly. The promise is absent for TWO stacked
reasons, one owned elsewhere and one owned here:

1. **The verticals are backlit (owned: lead/SHOTS, §256).** 72.3% of hero's visible
   surface sits at ramp 0 — the camera looks into the sun, and §256's +240° azimuth
   finding is DELIBERATELY NOT APPLIED (whole-game blast radius; lead's call). Nothing in
   this seal touches that; the orientation gate below EXCLUDES verticals so the owner
   question stays open and untouched.
2. **The horizontals — the surfaces a 22° sun actually rakes — are arithmetically locked
   out of the top band (owned: HERE).** A horizontal deck at el 22 has N·L = sin 22° =
   0.3746, inside [termLo 0.14, termHi 0.52]: the mid band, at HALF key + half shade
   light. The top band needs N·L ≥ termHi + soft = 0.544, i.e. el ≥ 33.0° — the palette's
   own flagship elevation cannot fully light ANY floor it rakes. Measured on the fresh
   HEAD hero frame (redkey run 2's `hero.off`, keySatMax 1.0 = shipped pixels): the
   sun-raked courtyard floor reads L 115.9 mean at [1120, 520, 1270, 600] (warm, R−B
   +83.6) against a full-key §256 model of ≈ L 197 for lit sandstone; the cast-shadowed
   floor beside it reads L 70.6 — a 1.64 lit:shadow ratio where the model at full key
   gives ≈ 1.9+. The obelisk's 54 m shadow stripe projects OUT of this camera's frame
   (scratchpad projection, camera math verbatim from Shots.js), so the long-shadow read
   must come from the floor contrast that IS in frame — and at half key it cannot.
   kaykit reads as "the set's best lighting statement" at the SAME el 22 because its lit
   statement is VERTICALS (N·L up to ~0.93 → top band); hero's lit vocabulary is
   horizontal, all mid-band.

## 1. Ownership and discipline

Src surface: `src/render/ToonMaterial.js` (TUNE keys + two shared uniforms) and
`src/render/shaders/toon.glsl.js` (one branch after slyRamp), plus the pin test — all
committed INERT before any frame (branch untaken at 0.0; static-scan checks of
tests/shader.test.mjs apply to the new text; spelling pinned by tests/goldenrake.test.mjs).
The capture installs nothing; the arms are `shading.uniforms.uRakeTrack.value` pokes (the
uShadowHold stick contract — nothing republishes it). All other discipline verbatim from
PREREG-tombdim §1, including the §296 sequencing disclosure.

## 2. The candidate

An elevation-tracking TOP terminator for near-horizontal, non-subject surfaces — the last
terminator moves from termHi to `rakeHi = clamp(uKeyDir.y − rakeGap, termLo + 2·termSoft,
termHi)`; adding `(S_new − S_old)/steps` to the ramp IS the terminator move, exactly.

- `TUNE.rakeTrack` (default **0.0**): shader gate `uRakeTrack > 0.0` — untaken at 0.
  `TUNE.rakeGap` **0.05** (registered constant; only read in-branch).
- Scope, each leg arithmetic (spelling pinned): warm keys only (`uKeyColor.r >
  uKeyColor.b` — the moon never enters: night/guard identical by branch); the high clamp
  makes the delta `smoothstep(x) − smoothstep(x) == 0.0` exactly above el ~33 (midday and
  the interior's ×4.05 key self-annul by arithmetic); orientation `smoothstep(0.55, 0.80,
  Nw.y)` (walls 0 — §256's vertical question stays the owner's); subject exempt
  (`× (1.0 − vSlySkin)` — the costume band layout, §277/§289's work, cannot move);
  2-band materials exempt (`step(1.5, rakeSteps)`).
- Consequences at the stagings (model, real `evalAtmosphere`): el 22 floors 0.5 → 1.0
  (hero/kaykit); el 21–20.6 (tod 0.80 family) floors full; el 15 (dunes) slopes full;
  el 26 (courtyard) floors partial-to-full; el 33 (temple) flat floors UNCHANGED (already
  above both terminators — promo ≡ 0 on them); el 76 (interior) identity by clamp.
  Cast-shadow cores are unchanged bit-for-bit at any rakeTrack (`key = ramp × sh` with
  sh = 0, and shadeForm ships at shadeBand 0.0) — the LONG SHADOWS this seal is for are
  darkened relatively, not absolutely.

**Candidate value under test: 1.0** (the full terminator move). Dose arm (`cko`): 0.5,
`hero` only. Registered fallback: 0.0 (mechanism stays, term off).

Model numbers (gtmodel, validated 5/5 on §261's k table; display via the grey-row-validated
chain): hero paving mid → full = display L 161 → 187 (+25 pure-pixel; the registered ROI
mixes grid/AO — E1's band accounts); lit:shadow 1.62 → 1.88; hue drift 0.0°; R−B −0.3
(the warm rise spends in brightness — R nears clip — NOT in R−B, which is why E2 guards
hue and floors R−B instead of demanding a rise).

## 3. Tree — HEAD, no install

As PREREG-tombdim §3, plus: PF6 requires `HEAD:src/render/shaders/toon.glsl.js` to carry
the `uRakeTrack > 0.0` branch and `HEAD:src/render/ToonMaterial.js` `rakeTrack: 0.0`.

## 4. ROIs and statistics (registered; derived from the fresh HEAD `hero.off` and
`sly-closeup.off` — base-tree frames, the shadowhold rule)

| ROI | shot | rect | off-arm reading at derivation |
|---|---|---|---|
| LITF | hero | [1120, 520, 1270, 600] | L 115.9, R−B +83.6, hue 24.9 — the raked floor |
| SHFLOOR | hero | [920, 560, 1040, 660] | L 70.6, R−B −20.7 — the cast shadow beside it |
| SUBJ | sly-closeup | [580, 230, 700, 420] | L 119.8 — body-interior rect |
| FULL | all | [0, 0, 1280, 720] | protections |

## 5. Arms and the boot

Shared runner, PREREG-tombdim §5 verbatim. Arms consumed by THIS seal, per shot: `off`,
`con` (uRakeTrack 1.0), `hero` only `cko` (0.5), `back`.

## 6. Registered bars (scored by `goldenrake-score.mjs`; VOID is not PASS; ship = every
row PASS **and** the LOOK gate §8)

| id | quantity | band |
|---|---|---|
| **R1–R16** | diff(`off`, `back`) px | **[0,0]** each (shared trio bracket; PF4) |
| **B_night, B_guard** | diff(`off`, `con`) px | **[0,0]** — the moon gate, measured |
| **B_interior** | diff(`off`, `con`) px | **[0,0]** — the el-76 clamp identity, measured |
| **BG_c** | off gates: LITF meanL ∈ [85, 150] ∧ LITF R−B ≥ +40 ∧ SHFLOOR meanL ∈ [45, 95] ∧ SHFLOOR R−B ≤ 0 | in → else **VOID** |
| **E1** | LITF ΔmeanL (`con` − `off`) | **[+8, +45]** |
| **E2** | LITF hue drift ≤ **8°** ∧ ΔmeanRB ≥ **−15** | both — brighter, same warm hue |
| **E3** | lit:shadow ratio (LITF/SHFLOOR): (`con`) ≥ (`off`) + **0.06** ∧ \|ΔmeanL(SHFLOOR)\| ≤ **5** | both — the long shadows READ |
| **KO_c** | LITF ΔmeanL(`cko`) ∈ [0.35, 0.85] × ΔmeanL(`con`) | dose monotone |
| **SUBJ** | sly-closeup body rect \|ΔmeanL\| | ≤ **1.0** — the vSlySkin exemption, measured |
| **P_temple** | FULL ΔmeanL ∈ [−3, +3] ∧ ΔR−B ∈ [−6, +6] | the 7/10 ceiling shot must not move |
| **P_kaykit** | FULL ΔmeanL ∈ [−1, +10] ∧ ΔR−B ∈ [−15, +12] | the praised read survives (LOOK too) |
| **P_<shot>** (closeup, startle, perch, arm, key, profile, courtyard, traversal, combat, dunes, hero) | FULL ΔmeanL ∈ [−1, +14] ∧ ΔR−B ∈ [−15, +12] | each |
| **VC** | readbacks: uRakeTrack echoes 0/1.0/0.5/0 per arm ×16, uRakeGap 0.05, night/guard `con` rows uKeyColor r < b | else **VOID** |
| **V4** | 83 rows, ONE src hash == expected | else **VOID** |
| **LOOK** | §8, binding | a look failure is **NO-SHIP** regardless of bars |

Fail-closed: E*/KO_c VOID unless `R_hero` ∧ BG_c; B_*/P_*/SUBJ VOID unless their shot's R.

## 7. Falsifiers — revert, do not defend

PF1 (E/KO/SUBJ/P out on a valid capture) ⇒ no ship, rakeTrack stays 0.0, finding recorded
— an E-pass with SUBJ/P failure is recorded as "the promo is right on floors and too wide
somewhere else", routing to a narrower orientation gate under a NEW seal, not a retune.
PF2 (any B ≠ 0 with its R PASSED) ⇒ no ship; the named exemption (moon gate or el-76
clamp) leaked — mechanism defect. PF3 (BG_c/VC/V4) ⇒ VOID, archive, re-run. PF4–PF7 as
PREREG-tombdim §7.

## 8. §17 look-change declaration and the LOOK gate crops (binding)

Intended change: on golden-hour framings the ground the sun rakes carries the FULL warm
key — hero's courtyard floor patches and deck go golden-bright against unchanged
violet-teal cast shadows (long warm shadows finally read); paving relief shows raking
micro-contrast (crevice pixels whose detail normals dip below the tracked terminator drop
a band — declared: this is the rake showing relief, and if it reads as NOISE it is a look
failure); kaykit floors brighten under its praised verticals; dunes' lit slopes lift
toward late-golden; temple, night, guard, interior do not move; Sly himself does not move
anywhere (vSlySkin). Crops, off vs con: hero FULL at 1× and [900, 480, 1280, 720] at 2×;
kaykit FULL at 1×; sly-closeup FULL at 1× (the subject against a brighter floor — if the
character reads DARKER-than-scene rather than held, that is a look failure); dunes FULL
at 1×; temple FULL at 1×.

## 9. Registered forecast (ledger entering 5/18)

**SHIP at 1.0.** Grounds: the lock-out is arithmetic (sin 22° vs 0.544 — not a judgment),
the promotion is the palette's own promise spelled as a terminator rule, the exemptions
are each a measured [0,0] bar rather than an assumption, and the model has ≥ ×1.5 margin
on E1/E3. Honest uncertainties, named, with the E-family the riskiest of the trio:
(a) **P_kaykit/P_closeup-family** — brightening the tod-0.80 backdrops' floors changes
praised/tuned framings; if a P bar fails while E passes, that is a verdict (PF1) routing
to a tighter orientation gate (Nw.y ≥ 0.8 hard) under a new seal. (b) **the paving-relief
banding** may read as noise at 2× (LOOK risk ~25%). (c) hero's E1 could overshoot +45 if
the ROI's grid-line share is smaller than estimated — an overshoot is a FAIL by band,
recorded honestly. If the capture VOIDs, the candidate re-runs.

## 10. SCORING RECIPE (for the coordinator)

As PREREG-tombdim §10 with these substitutions: scorer
`node progress/records/gradetrio/goldenrake-score.mjs`; LOOK crops per §8; RESULT file
RESULT-goldenrake.md. **PASS + LOOK pass (ship), in ONE commit citing RESULT-goldenrake:**
1. `src/render/ToonMaterial.js`: `TUNE.rakeTrack` `0.0` → `1.0`; replace the ships-only-on
   sentence in its TUNE comment with "SHIPPED at 1.0 per RESULT-goldenrake.md — shared
   gradetrio one-boot poke A/B (moon/midday exemptions [0,0] measured, floor promotion +
   long-shadow contrast green, subject held)."; keep the contract note.
2. `tests/goldenrake.test.mjs`: flip the first pin to expect 1.0 citing the RESULT; the
   uniform-default test constructs `new Shading({})` and must now expect
   `uRakeTrack.value === 1.0` (it reads TUNE).
3. Suite green (`node --test "tests/*.test.mjs"`), push. PF1/PF2/PF3 branches as
   PREREG-tombdim §10 with this seal's routings (§7).
