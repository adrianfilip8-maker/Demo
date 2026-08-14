# PREREG-guardcone — the patrol cone as a real volume: source, colored falloff, dust, and a lamp that lights the guard

**Lane:** GUARDS. **Parents:** DESIGN-guardpass.md §B, RESULT-critic11 ("guard cone rebuild
(real volumetric cone)"), RESULT-critic12 ("a formless blown light cone", guard 2.5),
§301–§303 (the carried torch IS the cone's light; localToon's underground gate), task #14 /
d526dd8 (night grade — prior art, protected, not duplicated). **Date sealed:** 2026-08-14.
**Status: REGISTERED before any capture; shares the one boot, runner and out-dir with
PREREG-guardart (arms table there, §3); scorer `guardcone-score.mjs` committed with this
file.** The two seals score and ship INDEPENDENTLY.

## 1. Ownership and discipline

Registered surface this seal: `src/ai/Guard.js` (TUNE + both beam shader strings +
`_buildCones` uniforms + `beamCoreScale` in `_updateCones` + `_publishLamp`),
`src/render/ToonMaterial.js` (two shared uniforms), `src/render/shaders/toon.glsl.js`
(declarations + the `uGuardLampPos.w > 0.0` term) — the SHADING-side pair follows
torchlight's precedent (§301–§303: a lane's branch-untaken term in the same two files,
same contract) and totals ~20 lines. Everything ships inert in HEAD
(`TUNE.coneShape 0` ⇒ the legacy shader branch spelled byte-identical — the guardart test
pins the legacy spellings by regex; `TUNE.lampToon 0.0` ⇒ `w` published exactly 0 ⇒ shader
branch untaken; `beamCoreScale 1.0` ⇒ x·1). Same §296/§302/§141.1/fail-closed/launch
discipline as PREREG-guardart §1. Task #14's `colNight`/`beamNight`/`nightLo`/`nightHi` are
NOT touched (pinned in the suite).

## 2. The candidate (the `cone tuple`; DESIGN-guardpass §B derivations)

| lever | off (HEAD) | candidate | mechanism |
|---|---|---|---|
| `uConeShape` (_beamMat uniform) | 0 | 1 | takes the structured branch: core pow 2.6, boundary term `uConeEdge`, atten `uConeAtten`, cap `uConeCap`, motes `uConeDust`, falloff deepening `uConeGrad`; hot-core lamp card |
| `TUNE.colPatrol` | 0xfff0c2 | **0xffd9a0** | §2.2 KEY sun — the warm yellow |
| `TUNE.beamBase` | 0.30 | 0.26 | resting brightness under the new cap |
| `uGlow` (_beamMat uniform; TUNE.glowSize) | 0.34 | 0.42 | the visible source |
| `TUNE.poolMix` | 0.24 | 0.30 | the pavement wedge carries the far read |
| `TUNE.beamCoreScale` | 1.0 | 0.62 | rendered shell narrows; POOL keeps the true half-angle (the telegraph stays honest) |
| `TUNE.lampToon` | 0.0 | 1.0 | the carried torch lights TOON surfaces: `uGuardLampPos/Color` published per frame, consumed after §303's localToon block, capped at `SLY_LOCAL_CAP`, window `1−smoothstep(_light, 0.26, 0.56)` ⇒ exactly 0 for every daylight canonical and `interior` (0.90 — §303's sealed instruments never see it), ≈1.0 at `guard` (0.263), 1.0 at `night` |

The candidate branch's five constants ship in TUNE (pinned): atten 13.0, cap 1.30, edge
0.35, dust 0.65, grad 0.85. The falloff gradient is hue-family-preserving (`tint²/max`), so
task #14's cool night lamp deepens instead of re-warming — the same arithmetic serves both
ends of the clock.

Arms (PREREG-guardart §3): `bon` = candidate on all 16; `blamp` (`guard` only) = candidate
with lampToon 0 — the lamp's clean attribution pair; `abon` = candidate + the art seal's
levers (composition, LOOK + report only — neither seal gates on it).

## 3. Registered bars (scored by `guardcone-score.mjs` through `tools/gate.mjs`; VOID is not PASS; ship = every gate row PASS + LOOK)

Statistics as PREREG-guardart §4. "Beam ROI" = the probe's beam-footprint rect for the
SHOT_POSE guard ∩ viewport, minus his body bbox; near/far halves split at the midpoint of
the recorded apex→axis-far screen segment, each further intersected with the ROI. "Pool
disc" = the probe's pool-ahead disc (2.2 m ahead of the guard on the pavement, r 0.6 m
projected).

| id | quantity | band |
|---|---|---|
| **R_<shot>** ×16 | (shared with PREREG-guardart by citation — same rows) | **[0,0]** each, fail-closed |
| **BV1** | `guard.bon` live readbacks: `uConeShape` = 1, `uGuardLampPos.w` > 0, TUNE tuple = §2 candidate; `guard.off` reads shape 0, w = 0; `interior.bon` reads `uGuardLampPos.w` = 0 (the §303 window) | all — else **VOID** |
| **BS1** | `guard.bon`: within r 16 px of the recorded apex screen point: any px with L ≥ 200 ∧ R−B ≥ 8 | **exists** (the visible source) |
| **BH1** | `guard.bon` beam ROI: near-half chroma-hue mean ∈ **[20°, 60°]** ∧ far-half ∈ **[20°, 65°]** ∧ far mean S ≥ near mean S + **0.015** | all (the §2.2 colored falloff) |
| **BF1** | beam-ROI share of px L ≥ 235: `bon` | **≤ 0.08** ∧ **≤ 0.5 × off share** (the blowout dies) |
| **BL1** | diff(`bon`,`blamp`) on `guard`: differing px ≥ **3000**, ≥ 96% inside (subject bbox ∪ pool disc ∪ spill rect, ⊕24 px); over differing px mean ΔL ≥ **+2** ∧ mean Δ(R−B) ≥ **+1.5** | all (the lamp lights the guard and his ground, warmly, and nothing else) |
| **PROT-MOON** | `night` diff(`off`,`bon`) in [300, 20, 480, 140] | **[0,0]** if probe-disjoint from every beam rect, else ≤ 400 px (rule §4) |
| **PROT-LAMPS** | `night` diff(`off`,`bon`) in [640, 0, 1140, 130] | same rule |
| **PROT-SPARK** | `traversal` diff(`off`,`bon`) in [430, 190, 620, 280] | same rule |
| **PROT-B_<shot>** ×15 | classification rule §4 on diff(`off`,`bon`) | clean ⇒ **[0,0]**; affected ⇒ outside-container ≤ 900 px |
| **V-TREE** | (shared) 82 rows, one src hash = expect | else **VOID** |
| **LOOK-B** | `guard.bon`/`abon` vs `off`; `night.bon` vs `off` (the task-#14 grade must still read); report-only numbers: boundary-band mean |∇L| ratio, stddev of ΔL in the beam core (dust structure) — LOOK judges edge and dust, the numbers inform | **binding** |

## 4. The protection classification rule (registered NOW, evaluated from off-arm probe data)

Container union per shot = every beam footprint rect ⊕24 px, every pool rect ⊕24 px, the
spill-sphere rect, the lamp disc, every guard bbox ⊕24 px (colPatrol also tints the spill
PointLight and instance colours, so anything those can reach is in the container). A shot
whose off-arm probe shows NO container element intersecting the viewport is CLEAN ⇒
diff(`off`,`bon`) [0,0]. Otherwise AFFECTED ⇒ differing px outside the union ≤ 900. The
three named ROIs above additionally apply their own rule row. Mis-registration vs leak is
adjudicated exactly as PREREG-guardart §5 (probe-recorded intersections reclassify to VOID
with diagnosis; leaks NO-SHIP).

## 5. Falsifiers — revert, do not defend

- **PF1** — BS1/BH1/BF1/BL1 out of band on a valid capture ⇒ the tuple does not ship; every
  lever stays at its HEAD default; finding recorded. No post-hoc retune toward a band.
- **PF2** — any PROT row out per its rule ⇒ NO-SHIP regardless of the target bars.
- **PF3** — BV1/V-TREE out ⇒ VOID; diagnose from readbacks (a `w` ≠ 0 on `interior.bon` is
  a window-arithmetic defect — a FINDING, not a tuning knob), archive, re-run.
- **PF4/PF5/PF6/PF7** — as PREREG-guardart §6 (shared boot; PF6 additionally pins the §2
  candidate constants in HEAD TUNE and the legacy-branch regexes).

## 6. §17 look-change declaration

At the candidate: the guard shot's white wash becomes a narrower warm-yellow shaft with a
visible hot lamp at its apex, mote structure inside, §2.2 sand-GI deepening toward the tip,
a pavement wedge still marking the TRUE detection cone, and real warm light on the guard's
front and the ground ahead. Night's patrol cones stay task-#14 cool, slightly deepened along
their length; the moon, the hanging lamps and the sparkles do not move. Daylight cones stay
faint (unchanged day fade); the toon lamp contributes EXACTLY zero above _light 0.56.
No draw-count change.

## 7. Registered forecast (ledger entering 5/18)

**SHIP, at lower confidence than guardart** (~0.5). Grounds: every lever is a poke of
mechanisms whose inert spellings are pinned; the blowout's arithmetic cause (cap 4.0
premultiplied additive) is removed by construction; the lamp's day-exactness is arithmetic.
Honest uncertainties, named: (a) BH1's hue bands under the guard shot's 14% night-cool lerp
(modelled ≈39° warm — but the beam sums over lit stone, and the mean can drift); (b) BL1's
magnitudes are unmodelled (a lambert lamp at 4.2 intensity through the toon albedo has no
prior measurement above ground); (c) the candidate look itself — a first-capture aesthetic
can miss (LOOK is binding and a LOOK miss is a NO-SHIP with frames archived for the next
tuple). A VOID re-runs; only PF1/PF2 on a valid capture are verdicts.

## 8. SCORING RECIPE (for the coordinator; exact commands)

1. **Done?** As PREREG-guardart §9.1 (same runner, same log
   `/home/user/Demo/progress/records/logs/guardpass-run1.log`).
2. **Score:** `cd /home/user/Demo && node progress/records/guardpass/guardcone-score.mjs`
   (exit 0 = every gate row PASS). Independent of guardart-score; run both.
3. **LOOK:** open `guardpass1/guard.{off,bon,blamp,abon}.png` and `night.{off,bon}.png`.
   Binding, both directions (a numeric PASS with a formless look is NO-SHIP; specifics into
   the RESULT).
4. **Outcome branches** (write `RESULT-guardcone.md` + a KNOWN_ISSUES § in every branch):
   - **PASS + LOOK (ship).** §296 first, then ONE commit citing RESULT-guardcone, in
     `src/ai/Guard.js` TUNE: `coneShape 0 → 1`, `colPatrol 0xfff0c2 → 0xffd9a0`,
     `beamBase 0.30 → 0.26`, `glowSize 0.34 → 0.42`, `poolMix 0.24 → 0.30`,
     `beamCoreScale 1.0 → 0.62`, `lampToon 0.0 → 1.0` (update the TUNE comments to cite the
     RESULT); `tests/guardart.test.mjs`: flip the coneShape/beamCoreScale/lampToon pins +
     messages (colPatrol/beamBase/glowSize/poolMix gain pins at the new values in the same
     edit). Suite green before push.
   - **PF1:** nothing ships; the frames + report-only numbers route the next tuple (a
     different tuple is a NEW prereg).
   - **PF2/PF3/PF4:** as PREREG-guardart §9.5, same shapes.
5. Frames/manifest in `progress/records/guardpass1/`; archive on VOID.
