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

---

# AMENDMENT A1 — cone-only re-scope after §309 parks the guard mannequin

**Written 2026-08-14, BEFORE any frame of this seal's capture exists.** The shared capture
this seal was registered against (PREREG-guardart + PREREG-guardcone, one boot, one runner)
was stopped minutes in by owner instruction: KNOWN_ISSUES §309 parks the guard MODEL and
marks PREREG-guardart **WAIVED-UNSCORED**. §309's own text closes with *"The guard CONE
(lighting/FX, PREREG-guardcone) is NOT covered by this waiver and is re-sealed standalone."*
This amendment is that re-scope, and nothing more.

**The discipline being observed.** An amendment written before any frame is legitimate; a
threshold moved after frames is §141.1's forbidden move. Every band, ROI, hue window,
pixel count and share in §3 above is **untouched** — not one number moves here. What changes
is which ARMS are captured, and the two rows whose text pointed at arms or at a seal that no
longer exists. Where a row's definition lived by citation in the now-waived guardart seal, it
is **restated verbatim in place**, not re-derived. One row is ADDED, and it can only make the
run harder to pass.

## A1.1 Arms — the three guard-model arms are dropped

| arm | §2/§3 status | A1 |
|---|---|---|
| `off` | cone defaults, art 0/0 | **kept, unchanged** |
| `bon` | cone candidate, art 0/0 | **kept, unchanged** — the scored candidate |
| `blamp` (`guard` only) | cone candidate, lampToon 0, art 0/0 | **kept, unchanged** — BL1's attribution pair |
| `back` | cone defaults, art 0/0 | **kept, unchanged** — the §302 same-boot validity arm |
| `askin` (`guard` only) | art 0/1 | **DROPPED** — a guard-model arm (§309) |
| `aon` | art 1/1 | **DROPPED** — a guard-model arm (§309) |
| `abon` | art 1/1 + cone candidate | **DROPPED** — a guard-model arm (§309) |

Note the four kept arms were ALREADY art 0/0 in the sealed arms table: this seal's scored
arms never moved a guard-model lever. Per shot: `off → bon → back`, plus `blamp` on `guard`.
**49 frames** (15×3 + 4), down from 82.

Additionally, and stricter than the seal: the re-scoped runner **never writes**
`TUNE.guardArt` / `TUNE.guardSkin` and **never calls** `applyArt()`. In the sealed runner
every arm assigned the full tuple including `art: 0, skin: 0` + `applyArt()` (a documented
no-op on an unpainted boot). Under §309 the correct posture is not "assign zero" but "do not
reach for the lever at all", so the assignment is removed and replaced by a measurement that
the levers stayed inert on their own — see PARK1.

## A1.2 Row changes (exactly four; no band moves)

| row | sealed form | A1 form | why |
|---|---|---|---|
| **R_<shot>** ×16 | "(shared with PREREG-guardart by citation — same rows)", **[0,0]** each, fail-closed | **restated in place, definition unchanged:** strict differing-px count of diff(`off`, `back`) over the full frame, same boot, same shot; band **[0,0]** each; fail-closed; every dependent row is nulled when its shot's R is not exactly true | the cited seal is WAIVED-UNSCORED, so a citation has nothing to point at. The predicate, the band and the fail-closed wiring are copied, not re-derived. |
| **V-TREE** | 82 rows, one src hash = expect | **49 rows**, one src hash = expect | a row **census**, not a threshold — it counts the frames the arm matrix produces, and the arm matrix shrank by A1.1. The one-hash and hash-equals-`git archive HEAD` halves are untouched. |
| **LOOK-B** | `guard.bon`/`abon` vs `off`; `night.bon` vs `off`; report-only numbers | `guard.bon` vs `guard.off`; `night.bon` vs `night.off`; same report-only numbers (boundary-band mean \|∇L\| ratio, beam-core ΔL stddev) | `abon` was the composition frame — the cone candidate seen over the *dressed* garrison. With `guardArt` parked at 0 it is not merely unavailable, it would be **byte-identical to `bon`**, so it carries no information. LOOK stays **binding** on the two remaining comparisons; the deliverable sentence is unchanged. |
| **PARK1** (NEW) | — | every captured row's readback shows `guardArt` = 0 ∧ `guardSkin` = 0 ∧ `painted` = false ∧ no geometry skin-shift flag; **all 49 rows** — else the run is **VOID** | registers the §309 parking as a measured fact rather than an assumption. Strictly additive and one-directional: it can only turn a PASS into a VOID, never a FAIL into a PASS. |

Everything else in §3 stands verbatim: **BV1, BS1, BH1, BF1, BL1, PROT-MOON, PROT-LAMPS,
PROT-SPARK, PROT-B_<shot> ×15** keep their exact predicates, ROIs and bands, and §4's
classification rule, §5's falsifiers and §7's forecast are unchanged. **Every bar remains
evaluable without a guard-model arm** — checked row by row: BV1 reads cone/lamp uniforms and
the cone TUNE tuple only; BS1/BH1/BF1 read `guard.bon` (± `guard.off`) only; BL1 is
`bon`-vs-`blamp`, both cone-only arms; every PROT row is `off`-vs-`bon`. No bar in this seal
was ever defined over `askin`/`aon`/`abon`.

## A1.3 Run identity (the §8 recipe, re-pointed)

The sealed recipe's paths belong to the stopped shared run and its archived partial frames
(`guardpass1-partial-waived/`). This run gets its own, so nothing is overwritten and PF7's
"one run = one out-dir" stays honest:

| | sealed | A1 |
|---|---|---|
| runner | `progress/records/guardpass/guardpass.mjs` | `progress/records/guardcone/guardcone.mjs` (fork, cone-only) |
| scorer | `progress/records/guardpass/guardcone-score.mjs` | `progress/records/guardcone/guardcone-score.mjs` (fork; §3 bars verbatim + PARK1) |
| lib | `progress/records/guardpass/guardpass-lib.mjs` | `progress/records/guardcone/guardcone-lib.mjs` (fork) |
| frames | `progress/records/guardpass1/` | `progress/records/guardcone1/` |
| log | `logs/guardpass-run1.log` | `logs/guardcone-run1.log` |
| pidfile | `/tmp/sands-of-ra/guardpass1.pid` | `/tmp/sands-of-ra/guardcone1.pid` |

The `guardpass/` originals are left byte-untouched as the killed run's record. The launch
command is unchanged in form: `bash tools/launch.sh <runner> <absolute log> <pidfile>`,
detached, "launch OK … ppid 1" the only success.

## A1.4 What this amendment explicitly does NOT do

- It does not move a band, a share, a pixel count, an ROI, a hue window or the forecast.
- It does not touch `TUNE.guardArt`, `TUNE.guardSkin`, the skinIndex remap, `GUARD_DRESS`,
  `paintGuardRegions`, `shiftGuardSkin`, `applyArt()`, or any guard-model material — in the
  runner, in the scorer, or in `src/`. Their inert pins in `tests/guardart.test.mjs` stay
  exactly as they are.
- It does not re-open PREREG-guardart. That seal is WAIVED-UNSCORED and stays so.
- It does not touch task #14's shipped night grade (`colNight` / `beamNight` / `nightLo` /
  `nightHi`), which remains prior art this seal composes with and protection-bars, never
  duplicates: `night.bon` vs `night.off` carries PROT-MOON, PROT-LAMPS and PROT-B_night, and
  the falloff gradient is hue-family-preserving by construction so the cool night colour
  deepens rather than re-warms.
- **If a cone candidate could only score by moving a guard-model lever, that is a NO-SHIP
  with the reason recorded — never a licence to unpark the model.** No bar in this seal has
  that shape (A1.2), so the case does not arise; it is stated so that a future reader cannot
  mistake the drop of three arms for permission.
