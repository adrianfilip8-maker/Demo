# PREREG-seamglint — seam-glint gating by light direction: the architecture shadow-side rim floor sweeps down (TUNE.rimShadowFloorArch {0.20, 0.10}, one boot, poke arms)

**Lane:** POSTFX/FX artifact family (critic r11 family 3: "edge-detect christmas-lights on
block seams (dunes/night/guard)"). **Parents:** PREREG-kerb.md (the knob's own sealed sweep,
never run — its instrument lessons and V-bar architecture are carried), toon.glsl.js's
`rimShadeFloor` block + ToonMaterial `TUNE.rimShadowFloorArch` (the mechanism, shipped as a
bit-identical no-op at 0.55, scoped to NON-skinned geometry by `vSlySkin`).
**Date sealed:** 2026-08-13.
**Status: REGISTERED before any capture. `progress/records/fxartifact1/` does not exist and
no frame of any arm has been rendered.** Runner `progress/records/fxartifact/fxartifact.mjs`
(SHARED with PREREG-fxghost / PREREG-fxink; this seal scores and ships independently),
scorer `progress/records/fxartifact/seamglint-score.mjs`, committed with this file.

## 1. Ownership and discipline

Torchlight3 §1 carried: bars sealed+pushed first; §141.1; fail-closed; detached launch;
§186/§296 (the shared runner installs ONLY PREREG-fxink's PostFX.cand.js — this seal's lever
is a pure uniform poke, `shading.uniforms.uRimShadowFloorArch.value`, sticky by design —
"nothing republishes it per frame", ToonMaterial.js). This seal's SHIP surface is ONE
constant: `src/render/ToonMaterial.js` `TUNE.rimShadowFloorArch` — written only on PASS at a
clear lock per §6. The screen-space rim's own floor (`PostFX TUNE.rimShadowFloor` 0.45) is
NOT a ship candidate here: its population includes the CHARACTER's screen rim, which this
run's protection set cannot bound; it is poked at 0.10 on dunes/night as a REPORT-ONLY
decomposition arm (`s10`), and if the c-arms fail while s10 owns the residual, the routing
note in §6.3 fires (a follow-up seal with character bars).

## 2. The defect and the attribution arithmetic

r11 names blue edge glints peppering block seams in dunes/night/guard regardless of light
direction. Calibrated on the committed frames (2026-08-13, offline): r11 dunes pylon face
[700,150,900,330] carries 319 cool-glint px (predicate below); the torchlight3 {dt:0} frames
— the SAME staging this run uses — carry dunes 329, night walls 1954+1994 specks, guard wall
2996, hero kerb band 2597.

Why the SURFACE fresnel rim's shadow floor owns them (registered mechanism claim, checked
mechanically by the arms): the screen-space rim requires a relative depth step ≥ 5% of view
distance across ≤ 4.4 px (slyBackStep's smoothstep(0.05, 0.16)); the dunes pylon's panel
recesses at 40-90 m are 0.3-1 m ≈ 0.3-2% — the screen rim CANNOT fire mid-face there. The
surface term CAN and its own file says so: a worn bevel "turns the normal fast (magnitude
open) and bulges toward the eye (convex) — so the only property separating it from a rim we
want is that it is lit by nothing" (toon.glsl.js, the hero-kerb block; PREREG-kerb sized the
floor's shadow-side lift at ~110 L there). The glints are CYAN (uRimColor's family) on
UNLIT faces — the floor `mix(rimShadeFloor, 1.0, sh)` keeps 55% of the rim at sh = 0. The
candidate lowers that floor for ARCHITECTURE ONLY: `vSlySkin = 1` pins the character's floor
at 0.55 by construction (`mix(x, 0.55, 1) = 0.55` exactly), the lit side is untouched
(`mix(floor, 1, sh) → 1` as sh → 1), and the screen-space rim — which §2.1.5 relies on for
silhouettes, night decks and the courtyard obelisk — is a different pass, untouched.

Sweep **{0.20, 0.10}**, ship rule = the LARGEST floor passing every bar (PREREG-kerb's
registered-rule form; 0.35 is dropped — kerb's own offline arithmetic put it at "prominent").

## 3. Arms, ROIs and instruments (calibrated on torchlight3 frames = this staging)

Shots consumed: `dunes`, `night`, `guard`, `hero`, `courtyard`, `sly-closeup` (+ `s10` on
dunes/night). Arms per shot: `off` → … → `c20` (uRimShadowFloorArch 0.20) → `c10` (0.10) →
[`s10` where listed: PostFX tune.rimShadowFloor 0.10, arch floor at base 0.55] → `back`.
Every arm restore-first, {dt:0} settle, §40 readbacks, per-capture stamps.

Predicates (fxartifact-lib.mjs, one implementation for calibration and scoring):
- coolGlint(lMin, brMin): `B > R ∧ B−R ≥ brMin ∧ L ≥ lMin ∧ B ≥ G−4` (kerbband family);
- speck(lift 14): `L ≥ median(11×11 subsampled neighbourhood) + 14 ∧ B ≥ R` (night/guard's
  blue-graded walls defeat a global cool predicate; the local-contrast form measures
  "speck", which is what the critic named).

ROIs [x0,y0,x1,y1] with off-frame baselines (torchlight3, quoted so BG floors are honest):
- DUNES [700,150,900,330] coolGlint(95,12) — 329 px
- NIGHT-L [90,180,250,520] speck — 1954 px · NIGHT-R [1000,240,1180,420] speck — 1994 px
- GUARD [700,150,1100,450] speck — 2996 px
- KERB hero [820,500,1100,610] coolGlint(120,14) — 2597 px (PREREG-kerb's band + ROI family)
- OBELISK courtyard [580,0,650,150] coolGlint(120,10) — 7055 px (protection: the intended
  silhouette rim + tip sparkle; mostly key-LIT face, so the floor must not move it)
- CHEST sly-closeup [615,275,665,325] (character interior; vSlySkin exemption is exact, so
  changes here can only be FXAA edge ripple)
- LAMPS night [660,0,779,59], MOON [380,50,439,109] (the named "night lantern sparkles")

Statistics per arm: remaining-count ratios vs the off arm's population (count is secondary
per PREREG-kerb's own lesson — quoted beside it is the PRIMARY, the mean L drop over the
off-frozen set, computed per boot from this boot's own off arm, kerb's re-freeze rule).

## 4. Registered bars (scored by seamglint-score.mjs; VOID is not PASS)

| id | quantity | band |
|---|---|---|
| V1 | one src content hash across rows == expected install hash | else VOID |
| V2 | §40 readbacks (floors at commanded values; s10 rows: screen floor 0.10, arch floor 0.55) | else VOID |
| R_<shot> ×6 | diff(off, back) strict px | **[0,0]** each, fail-closed per shot |
| BG | off populations: dunes ≥ **150**, night-L ≥ **800**, night-R ≥ **800**, guard ≥ **1000**, kerb ≥ **1200** | else VOID (population absent) |
| E_dunes | remaining/off | **≤ 0.35** |
| E_night | (L+R remaining)/(L+R off) | **≤ 0.45** |
| E_guard | remaining/off | **≤ 0.45** |
| E_kerb | mean L drop over the off-frozen kerb set ≥ **25** ∧ remaining ≤ **0.35** | both |
| P_obelisk | retention ≥ **0.85** ∧ \|Δ meanL\| ≤ **1.5** | both |
| P_chest | changed px (\|ΔL\| ≥ 2) | **≤ 40** (FXAA allowance) |
| P_lamps | LAMPS ∧ MOON \|Δ meanL\| | **≤ 1.0** each |
| P_nightbudget | night whole-frame changed (\|ΔL\| ≥ 2) | **≤ 12%** of frame |
| LOOK | §5 | **BINDING**, adjudicated in the RESULT off the scorer's crops |

**Ship rule (registered):** the LARGEST floor ∈ {0.20, 0.10} passing ALL bars AND the LOOK
gate ships as `TUNE.rimShadowFloorArch`. Neither passing → no ship; the s10 report decides
the §6.3 routing. PREREG-kerb's V3 lesson is honoured through P_nightbudget + the night LOOK
crops: night is what the 0.55 bought, so the RESULT must show the deck edges and rooftop
read intact (screen rim carries them; the crops prove it or the arm dies).

## 5. §17 look declaration and the LOOK gate

Intended change: unlit architecture stops sparkling at seams/bevels — dunes' pylon face
reads as calm shadowed masonry (ink + texture intact), night/guard walls lose the cyan
pepper, hero's kerb band (the PREREG-kerb artifact) fades. NOT intended: lit-side rims,
character rims (pinned 0.55 by vSlySkin), the courtyard obelisk silhouette (screen-rim,
protected by P_obelisk), night deck-edge silhouettes (screen-rim), lantern sparkles (FX
quads). LOOK gate (binding, in the RESULT): dunes pylon 4×; night wall 3× + deck-edge 3×
(rooftop still reads — the §24.3/night contract); guard wall 3×; obelisk 3×; kerb 3×;
sly-closeup 1×.

## 6. Falsifiers and outcome branches — revert, do not defend

1. **PF1 (screen-rim ownership):** both c-arms fail an E bar while `s10`'s report shows the
   screen floor owns the residual (s10's remaining ratios ≪ c10's) ⇒ no ship here; the item
   routes to a follow-up seal on `PostFX TUNE.rimShadowFloor` WITH character-retention bars
   (this run's decomposition is that seal's evidence). `rimShadowFloorArch` stays 0.55.
2. **PF2 (protection):** any P bar fails at an arm ⇒ that arm dies; both dying ⇒ no ship,
   finding recorded (the floor buys the glints only at a cost the protections name).
3. **PF3 (validity):** V1/V2/BG out or any R ≠ 0 ⇒ affected blocks VOID, fail-closed;
   archive `fxartifact1/` → `fxartifact1-void-runN/`, diagnose, relaunch.
4. **PF4 (night look):** mechanical PASS but the night deck/rooftop crops read as mud ⇒ the
   LOOK gate (binding) kills the arm — record with the crops; do not retune toward the band
   (§141.1).
5. **PF5 (killed mid-boot):** the shared runner's recovery (PostFX.js checkout) applies;
   this seal's lever leaves no src residue by construction.

## 7. Registered forecast

**SHIP at 0.20** (~45%) or **0.10** (~30%); no-ship ~25% dominated by PF1 (the screen-rim
share of the night/guard specks is the honest unknown — the dunes arithmetic in §2 bounds
the SCREEN rim out of the pylon face mid-panels, but night's wall geometry is busier and its
depth steps larger). PREREG-kerb's offline sizing (f20 ≈ 0.36× shadow-side scaling) predicts
the kerb set's B−R margin (p50 ~7 over the 12 conjunct) collapses at both arms — E_kerb
clears; dunes' L margin (p50 31) is the tighter horn at c20.

## 8. SCORING RECIPE (exact commands; outcome branches)

1. **Done?** `tail -5 /home/user/Demo/progress/records/logs/fxartifact-run1.log` (done =
   `DONE. Score with:` + three paths). Liveness `pgrep -f 'fxartifac[t]\.mjs'`.
2. **Score:** `cd /home/user/Demo && node progress/records/fxartifact/seamglint-score.mjs`
   (exit 0 = some floor passed mechanically). Look at
   `progress/records/fxartifact1/crops/seamglint-*` — §5 is binding.
3. **PASS + LOOK → ship-write.** §296 first: `/tmp/sands-of-ra/capture.lock` absent AND
   `/tmp/sands-of-ra/queue/` empty IMMEDIATELY before touching src. ONE commit citing
   RESULT-seamglint.md:
   - `src/render/ToonMaterial.js`: `rimShadowFloorArch: 0.55` → the chosen floor; replace
     the knob comment's last two sentences with: "SHIPPED at <v> per RESULT-seamglint.md
     (PREREG-seamglint one-boot sweep): unlit-architecture seam glints were the floor's
     population (dunes/night/guard/kerb bars green), night re-measured per the contract
     above, character floor pinned 0.55 by vSlySkin at every arm."
   - `tests/seamglint.test.mjs` (new): read `src/render/ToonMaterial.js`, assert TUNE
     carries `rimShadowFloorArch: <v>` (message cites RESULT-seamglint.md); read
     `src/render/shaders/toon.glsl.js`, assert the exemption spelling
     `mix( uRimShadowFloorArch, 0.55, vSlySkin )` is present (the character-pin contract).
   - `node --test "tests/*.test.mjs"` — 475+ green before push. RESULT-seamglint.md +
     KNOWN_ISSUES § in the same push.
4. **PF1:** no src write; RESULT + KNOWN_ISSUES § carrying the s10 decomposition and the
   follow-up-seal routing.
5. **VOID:** archive out-dir, relaunch (same commands as the sibling seals).
