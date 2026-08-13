# PREREG-nightfloor — the night shadow floor to §2.2: 14% of key, violet-teal, never below

**Lane:** LIGHTING/grade (critic r11 queue item 1, RESULT-critic11.md family 1 — "crushed
night blacks"; parents in evidence: §2.2 SHADOW HUE, Atmosphere.SHADOW_FLOOR's §214.3
note, §221's fill-vs-floor sizing, §261's night k row, r10's "foreground crush below the
§2.2 floor (night/hero)"). **Date sealed:** 2026-08-13.
**Status: REGISTERED before any capture. `progress/records/gradetrio1/` does not exist at
the time of writing and no frame of any arm has been rendered.** Shared runner
`progress/records/gradetrio/gradetrio.mjs` and scorer
`progress/records/gradetrio/nightfloor-score.mjs` are committed with this file, before the
capture, together with the INERT mechanism SEALED AS A RECORDS-SIDE PATCH
(`gradetrio/ToonMaterial.cand.patch` — `TUNE.shadowFloorNight: 0.125`, strict-greater
gate untaken) and its pin test held at `gradetrio/nightfloor.test.mjs.pending`; the patch
lands on `src/` (pin test → `tests/nightfloor.test.mjs`) in the immediately-following
mechanism commit after the in-flight capture releases, before any launch
(PREREG-tombdim's §296 sequencing disclosure, two-commit shape). Sharing/independence as
PREREG-tombdim's header states.

## 0. What this seal is

§2.2 reads `SHADOW HUE #2a3f66 (violet-teal, ~14% of key luminance, never below)`. The
operative floor is ToonMaterial's `shadowFloor 0.125` (the min() with Atmosphere's 0.14
picks it — §214.3), bracketed for DAYLIGHT ("~14% is about the tonemapped result; 0.155 of
a raw 3.3 key measured flat"). At night no such bracketing ever happened, the §261 cap is
far from binding (k 0.468 vs 3.742), and the two moon-keyed canonicals ship at 12.5% —
BELOW the palette's own "never below" line — while §221 sized the fill at 3–6× SMALLER
than this floor, so the floor is the only lever that reaches the night shadow band at all.
r11 ranks "crushed night blacks" inside its #1 family; r10 said "foreground crush below
the §2.2 floor (night/hero)" in as many words.

The lever: **`TUNE.shadowFloorNight`** — effective floor = lerp(published floor,
shadowFloorNight, nightAmount), taken only when strictly greater AND nightAmount > 0.
Published nightAmount is exactly 0.0 on all fourteen daylight canonicals and exactly 1.0
on night/guard (§221.1's by-branch pattern, re-verified in the readbacks), so the lift
lands on exactly the two moon shots. k scales the WHOLE uShadowColor/uShadowColorLit
vector, so the lift is luminance-only — the violet-teal §2.2 names cannot rotate, it just
stops crushing. What this seal does NOT claim: AO/ink/low-albedo blacks (display black
comes from materials and occlusion by design, §214.4); the night FILL (§221's finding
stands); any daylight pixel.

## 1. Ownership and discipline

Src surface: ONE file (`src/render/ToonMaterial.js`) plus its pin test, committed INERT
before any frame. The arms are `debug.shadowFloorNight` pokes, recomputed per publish —
poke/restore exact by construction (pinned). All other discipline verbatim from
PREREG-tombdim §1, including the §296 sequencing disclosure.

## 2. The candidate

- `TUNE.shadowFloorNight` (default **0.125** == TUNE.shadowFloor): gate spelled
  `nightAmount > 0 && shadowFloorNight > floorEff` — at the default the strict `>` is
  false and the branch is UNTAKEN (bit-identical; pinned).
- Night order registered: the night lift applies BEFORE tombdim's underground factor in
  `_refreshShadowColor`, so a night-time tomb stays dim (the two seals compose without a
  canonical ever exercising the composition).
- `debug.shadowFloorNight` overrides live per publish (null = TUNE).

**Candidate value under test: 0.14** — Atmosphere's SHADOW_FLOOR, §2.2's own number; this
seal deliberately proposes the SPEC, not a taste value. Dose arm (`dko`): 0.18, `night`
only. Registered fallback: 0.125 (mechanism stays, lift off).

Effect arithmetic (exact, uncapped at night): k 0.468 → 0.524; the shadow light lifts
×1.1200 per channel. Model (gtmodel, validated 5/5 on §261's k table; display via the
grey-row-validated chain): a moonlit shadow-band sandstone wall moves display L 30.8 →
33.1 (+2.3; limestone +3.0); at the dose 0.18, +8.2 (×1.44 radiance). Measured night
masses (fresh HEAD `night.off`, redkey run 2 — this tree's own pixels): WALL L 20.7 with
89.1% under L 26, MASS L 18.2 / 91.7%, full frame 62.2% under L 26 (matching §214.1's
62.9%-below-V-0.20 crush across trees) — the model×frame dilution factor ≈ 0.7–1.0 sets
the bands.

## 3. Tree — HEAD, no install

As PREREG-tombdim §3; PF6 additionally requires `shadowFloorNight: 0.125` +
`debug?.shadowFloorNight` in HEAD ToonMaterial.js.

## 4. ROIs and statistics (registered; derived by looking at base-tree frames — the
shadowhold rule; bars use the off arm)

| ROI | shot | rect | derivation reading (r10 frame) |
|---|---|---|---|
| WALL | night | [40, 180, 300, 560] | fresh L 20.7, dark%(L<26) 89.1, R−B −36.7, hue 221.5 (r10: 21.2/88.6) |
| MASS | night | [60, 560, 420, 700] | fresh L 18.2, dark% 91.7 — the bottom-left crush |
| GWALL | guard | [560, 640, 900, 715] | fresh guard.off L 17.4, dark% 88.6, R−B −17.7 — the crushed floor mass; the §291-era right-side masonry rect is now inside the cone's frame-eating wash (fresh L 92 warm) and was re-derived before sealing |

The dark%(L<26) statistic is REPORTED, not gated: the crossing mass at a fixed count
threshold is a property of the frame's histogram, not of the mechanism (§141.1 hygiene —
a gate there would be a bet on the histogram's shape, not on the lift).

## 5. Arms and the boot

Shared runner, PREREG-tombdim §5 verbatim. Arms consumed by THIS seal, per shot: `off`,
`don` (shadowFloorNight 0.14), `night` only `dko` (0.18), `back`.

## 6. Registered bars (scored by `nightfloor-score.mjs`; VOID is not PASS; ship = every
row PASS **and** the LOOK gate §8)

| id | quantity | band |
|---|---|---|
| **R1–R16** | diff(`off`, `back`) px | **[0,0]** each (shared trio bracket; PF4) |
| **B_<shot>** ×14 | diff(`off`, `don`) px, every daylight shot | **[0,0]** each — nightAmount-0 branch identity, measured |
| **BG_d** | off gates: WALL meanL ∈ [12, 34] ∧ WALL dark% ≥ 50 ∧ WALL R−B ≤ −15 | in → else **VOID** (the crush absent ⇒ staging not the diagnosed one) |
| **N1** | WALL ΔmeanL (`don` − `off`) | **[+1.0, +5.0]** |
| **N2** | MASS ΔmeanL | **[+0.8, +5.0]** |
| **N3** | WALL hue drift ≤ **4°** ∧ WALL meanRB(`don`) ≤ **−15** | both — the lift is the same violet-teal |
| **G1** | GWALL ΔmeanL | **[+0.5, +6.0]** — guard lifts the same direction |
| **KO_d** | WALL ΔmeanL(`dko`) ≥ **1.8×** ΔmeanL(`don`) ∧ ≥ +1.5 more | dose monotone (radiance ×1.44 vs ×1.12) |
| **VD** | readbacks: echoes 0.125/0.14/0.18 per arm; night/guard rows nightAmount == 1 ∧ uShadowColor per-channel ratio == ×1.1200 (`don`) / ×1.4400 (`dko`) within 1e−6; daylight rows nightAmount == 0 ∧ uShadowColor triples == off EXACTLY | else **VOID** |
| **V4** | 83 rows, ONE src hash == expected | else **VOID** |
| **LOOK** | §8, binding | a look failure is **NO-SHIP** regardless of bars |

Fail-closed: N*/KO_d VOID unless `R_night` ∧ BG_d; G1 VOID unless `R_guard`; each B VOID
unless its R.

## 7. Falsifiers — revert, do not defend

PF1 (N/G/KO out on a valid capture) ⇒ no ship; shadowFloorNight stays 0.125; a BELOW-band
N1 (< +1.0) is recorded as "the §2.2 constant is display-invisible at night — the spec
number cannot fix the crush" and routes the night-blacks item to a measured-amplitude
night seal (explicitly NOT taken blind here, §214.1's discipline); an ABOVE-band N1 means
the model missed a coupling — recorded, no ship. PF2 (any B ≠ 0 with its R PASSED) ⇒ no
ship; the nightAmount-0 branch leaked — mechanism defect. PF3 (BG_d/VD/V4) ⇒ VOID,
archive, re-run. PF4–PF7 as PREREG-tombdim §7.

## 8. §17 look-change declaration and the LOOK gate crops (binding)

Intended change, night + guard only: the crushed foreground masses lift by a small, even,
violet-teal step — detail becomes readable inside the shadow (§2.1.3 "transparent") while
the frame stays unmistakably night (the sky, moon, braziers, sparkles untouched; the lift
is ~+2–3 L on the shadow band). Crops, off vs don (and dko for direction): night FULL at
1×; night [40, 180, 420, 700] at 2×; guard [560, 640, 900, 715] at 2×. "The night reads
brighter overall / less night" is a look failure — NO-SHIP (the dko arm exists partly to
SEE what over-lifting looks like, so the 0.14 verdict is made knowingly).

## 9. Registered forecast (ledger entering 5/18)

**SHIP at 0.14, with N1 the riskiest bar of this seal.** Grounds: the lift is the spec's
own constant, exact ×1.12 by arithmetic, luminance-only by construction; the daylight
protection is a measured branch identity; model +2.3–3.0 L sits mid-band in N1 after the
0.7–1.0 dilution factor. Honest uncertainties, named: (a) **N1 under-shoot** — if the
masses' pixel population is dominated by ink/AO/crevice pixels below the shadow band's
reach, the mean may move < +1.0 (probability ~25%); that outcome is a genuine verdict
(PF1's below-band branch: the spec constant cannot fix the crush) and is worth exactly as
much as a ship. (b) G1 on guard shares the FX cone wash — the ROI avoids the cone but the
wash's tail could dilute below +0.5 (~15%). (c) A B-bar failure would contradict the
published-0.0 claim — nothing in evalAtmosphere's clamped smoothstep permits it. If the
capture VOIDs, the candidate re-runs.

## 10. SCORING RECIPE (for the coordinator)

As PREREG-tombdim §10 with these substitutions: scorer
`node progress/records/gradetrio/nightfloor-score.mjs`; LOOK crops per §8; RESULT file
RESULT-nightfloor.md. **PASS + LOOK pass (ship), in ONE commit citing RESULT-nightfloor:**
1. `src/render/ToonMaterial.js`: `TUNE.shadowFloorNight` `0.125` → `0.14`; replace the
   ships-only-on sentence in its TUNE comment with "SHIPPED at 0.14 per
   RESULT-nightfloor.md — shared gradetrio one-boot poke A/B (daylight branch identity
   [0,0] ×14, ×1.1200 lift confirmed per channel, night/guard bands green)."; keep the
   contract note.
2. `tests/nightfloor.test.mjs`: flip the first pin to expect 0.14 citing the RESULT and
   DELETE its `== TUNE.shadowFloor` equality leg (they intentionally diverge at ship);
   the "at the default the night build is bit-identical" test now constructs
   `new Shading({ debug: { shadowFloorNight: 0.125 } })` for its base arm; the daylight
   test is unchanged (identity holds at any value).
3. Suite green, push. PF1/PF2/PF3 branches as PREREG-tombdim §10 with this seal's
   routings (§7).
